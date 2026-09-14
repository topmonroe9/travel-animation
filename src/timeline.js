// Таймлайн поездки: интро → езда с остановками (паузы, галереи фото) → финал.
// Всё детерминировано по времени t, поэтому превью и покадровый экспорт совпадают.
import { clamp, lerp, lerpAngle, destination, metersPerPixel } from './geo.js';

export const easeInOutSine = (x) => -(Math.cos(Math.PI * x) - 1) / 2;
export const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
export const easeInCubic = (x) => x * x * x;
export const easeOutBack = (x) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

// Трапециевидный профиль скорости: разгон r, крейсер, торможение r (доли от 1).
const RAMP = 0.12;
export function easeTrap(x, r = RAMP) {
  x = clamp(x, 0, 1);
  if (r <= 0) return x;
  const v = 1 / (1 - r);
  if (x < r) return (v * x * x) / (2 * r);
  if (x <= 1 - r) return v * (r / 2 + (x - r));
  return 1 - (v * (1 - x) * (1 - x)) / (2 * r);
}
export function easeTrapInv(y, r = RAMP) {
  y = clamp(y, 0, 1);
  if (r <= 0) return y;
  const v = 1 / (1 - r);
  const yr = (v * r) / 2;
  if (y < yr) return Math.sqrt((2 * r * y) / v);
  if (y <= 1 - yr) return r + (y / v - r / 2);
  return 1 - Math.sqrt((2 * r * (1 - y)) / v);
}

const EPS = 1e-6;

export class Timeline {
  /**
   * @param {number} L длина маршрута, км
   * @param {{d:number, hold:number}[]} stops точки по порядку маршрута, включая старт (d=0) и финиш (d=L)
   * @param {{intro:number, drive:number, outro:number}} cfg секунды; drive — чистое время езды
   *
   * Точки с паузой делят дорогу на участки. Перед каждой такой точкой машина плавно
   * тормозит, после — разгоняется; крейсерская скорость на всех участках одинаковая.
   */
  constructor(L, stops, cfg) {
    this.L = L;
    this.intro = Math.max(0, cfg.intro);
    this.outro = Math.max(0, cfg.outro);
    const Tm = Math.max(1, cfg.drive);
    const ds = [];
    stops.forEach((s, i) => ds.push(clamp(Math.max(s.d, ds[i - 1] ?? 0), 0, L)));
    const holds = stops.map((s) => (Number.isFinite(+s.hold) ? Math.max(0, +s.hold) : 0));

    // Последовательность: участки движения и паузы.
    const plan = [];
    let dCur = 0;
    stops.forEach((s, i) => {
      if (holds[i] <= 0) return;
      if (ds[i] > dCur + EPS) { plan.push({ kind: 'move', d0: dCur, d1: ds[i] }); dCur = ds[i]; }
      plan.push({ kind: 'hold', stop: i, d: dCur, dur: holds[i] });
    });
    if (L > dCur + EPS || !plan.some((p) => p.kind === 'move')) plan.push({ kind: 'move', d0: dCur, d1: L });

    // Скорость v (км/с) такая, что Σ(Lj/v + разгон_j) = Tm; разгон на коротких участках короче.
    const moves = plan.filter((p) => p.kind === 'move');
    const rho = Math.min(RAMP * Tm, 1.5 + (0.1 * Tm) / moves.length);
    const timeFor = (Lj, v) => Lj / v + Math.min(rho, Lj / v);
    let v = 1;
    if (L > EPS) {
      let lo = 1e-9, hi = 1e9;
      for (let k = 0; k < 200; k++) {
        const mid = Math.sqrt(lo * hi);
        const sum = moves.reduce((a, p) => a + timeFor(p.d1 - p.d0, mid), 0);
        if (sum > Tm) lo = mid; else hi = mid;
      }
      v = Math.sqrt(lo * hi);
    }

    let t = this.intro;
    for (const p of plan) {
      p.t0 = t;
      if (p.kind === 'move') {
        const Lj = p.d1 - p.d0;
        p.dur = L > EPS ? timeFor(Lj, v) : Tm / moves.length;
        p.r = p.dur > 0 && L > EPS ? Math.min(0.5, Math.min(rho, Lj / v) / p.dur) : 0;
      }
      t += p.dur;
      p.t1 = t;
    }
    this.plan = plan;
    this.driveEnd = t;
    this.total = t + this.outro;

    // Момент прибытия в каждую точку: для старта 0, для остальных — когда машина доезжает до неё.
    this.stopTimes = ds.map((d, i) => {
      if (i === 0) return 0;
      const hold = plan.find((p) => p.kind === 'hold' && p.stop === i);
      if (hold) return hold.t0;
      const mv = moves.find((p) => d >= p.d0 - EPS && d <= p.d1 + EPS) || moves[moves.length - 1];
      const Lj = mv.d1 - mv.d0;
      const x = Lj > EPS ? easeTrapInv((d - mv.d0) / Lj, mv.r) : 1;
      return mv.t0 + x * mv.dur;
    });
  }

  /** Отрезок паузы для точки i или null. */
  holdOf(i) {
    return this.plan.find((p) => p.kind === 'hold' && p.stop === i) || null;
  }

  at(t) {
    t = clamp(t, 0, this.total);
    const base = {
      t, holdIdx: -1, holdT: 0, holdTime: 0, holdDur: 0,
      introT: this.intro > 0 ? clamp(t / this.intro, 0, 1) : 1,
      outroT: this.outro > 0 ? clamp((t - this.driveEnd) / this.outro, 0, 1) : 1,
    };
    let d, phase;
    if (t < this.intro) {
      phase = 'intro';
      d = 0;
    } else if (t >= this.driveEnd) {
      phase = 'outro';
      d = this.L;
    } else {
      phase = 'drive';
      const p = this.plan.find((q) => t < q.t1) || this.plan[this.plan.length - 1];
      if (p.kind === 'hold') {
        d = p.d;
        Object.assign(base, { holdIdx: p.stop, holdTime: t - p.t0, holdDur: p.dur, holdT: (t - p.t0) / p.dur });
      } else {
        d = p.d0 + (p.d1 - p.d0) * easeTrap((t - p.t0) / p.dur, p.r);
      }
    }
    return { ...base, phase, d, progress: this.L ? d / this.L : 0 };
  }
}

/**
 * Камера для состояния таймлайна.
 * ctx: { line, smoothBearing(d), cfg:{mode, zoom, pitch, carOffset, introZoomIn, holdZoomIn}, H (CSS px), overview:{center, zoom} }
 */
export function cameraAt(st, ctx) {
  const { line, cfg, H, overview } = ctx;
  const car = line.pointAt(st.d);
  const carBearing = line.bearingAt(st.d, 0.25);
  const roadBearing = cfg.mode === 'follow' ? ctx.smoothBearing(st.d) : 0;

  // Сдвигаем центр вперёд по курсу, чтобы машина стояла в нижней части кадра.
  const framed = (zoom, brg, pitch, offsetFrac) => {
    const aheadKm = (offsetFrac * H * metersPerPixel(car[1], zoom)) / 1000;
    return { center: destination(car, aheadKm, brg), zoom, bearing: brg, pitch };
  };

  let cam;
  if (st.phase === 'intro') {
    const u = easeInOutSine(st.introT);
    cam = framed(
      lerp(cfg.zoom + cfg.introZoomIn, cfg.zoom, u),
      lerpAngle(0, roadBearing, u),
      lerp(cfg.pitch * 0.4, cfg.pitch, u),
      cfg.carOffset * u,
    );
  } else if (st.phase === 'drive') {
    // На остановке камера мягко наезжает и держит план, пока идёт пауза или галерея.
    let dolly = 0;
    if (st.holdIdx >= 0) {
      const edge = Math.min(1.1, st.holdDur / 2);
      dolly = cfg.holdZoomIn * easeInOutSine(clamp(Math.min(st.holdTime, st.holdDur - st.holdTime) / edge, 0, 1));
    }
    cam = framed(cfg.zoom + dolly, roadBearing, cfg.pitch, cfg.carOffset);
  } else {
    const last = framed(cfg.zoom, roadBearing, cfg.pitch, cfg.carOffset);
    const u = easeInOutSine(clamp(st.outroT / 0.7, 0, 1)); // остаток финала держим общий план
    cam = {
      center: [lerp(last.center[0], overview.center[0], u), lerp(last.center[1], overview.center[1], u)],
      zoom: lerp(last.zoom, overview.zoom, u),
      bearing: lerpAngle(last.bearing, 0, u),
      pitch: lerp(cfg.pitch, 0, u),
    };
  }
  return { cam, car, carBearing };
}
