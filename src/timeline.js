// Таймлайн поездки: интро → поездка (с паузами на остановках) → финал.
// Всё детерминировано по времени t, поэтому превью и покадровый экспорт совпадают.
import { clamp, lerp, lerpAngle, destination, metersPerPixel } from './geo.js';

export const easeInOutSine = (x) => -(Math.cos(Math.PI * x) - 1) / 2;
export const easeOutBack = (x) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

// Трапециевидный профиль скорости: разгон r, крейсер, торможение r (доли от 1).
const RAMP = 0.12;
export function easeTrap(x, r = RAMP) {
  x = clamp(x, 0, 1);
  const v = 1 / (1 - r);
  if (x < r) return (v * x * x) / (2 * r);
  if (x <= 1 - r) return v * (r / 2 + (x - r));
  return 1 - (v * (1 - x) * (1 - x)) / (2 * r);
}
export function easeTrapInv(y, r = RAMP) {
  y = clamp(y, 0, 1);
  const v = 1 / (1 - r);
  const yr = (v * r) / 2;
  if (y < yr) return Math.sqrt((2 * r * y) / v);
  if (y <= 1 - yr) return r + (y / v - r / 2);
  return 1 - Math.sqrt((2 * r * (1 - y)) / v);
}

export class Timeline {
  /**
   * @param {number} L длина маршрута, км
   * @param {{name:string, d:number}[]} stops остановки, включая старт (d=0) и финиш (d=L)
   * @param {{intro:number, drive:number, outro:number, hold:number}} cfg секунды
   */
  constructor(L, stops, cfg) {
    this.L = L;
    this.stops = stops;
    this.intro = cfg.intro;
    this.drive = cfg.drive;
    this.outro = cfg.outro;
    this.hold = cfg.hold;
    const mid = stops.slice(1, -1);
    this.K = mid.length;
    this.holds = mid.map((s) => (s.hold != null && !Number.isNaN(s.hold) ? s.hold : this.hold));
    const holdSum = this.holds.reduce((a, b) => a + b, 0);
    this.Tm = Math.max(1, this.drive - holdSum); // чистое время движения
    // Момент (в секундах поездки), когда машина доезжает до k-й промежуточной остановки.
    let acc = 0;
    this.holdStarts = mid.map((s, k) => { const t = this.Tm * easeTrapInv(s.d / L) + acc; acc += this.holds[k]; return t; });
    this.total = this.intro + this.drive + this.outro;
    // Абсолютное время появления каждой остановки на карте.
    this.stopTimes = stops.map((s, i) =>
      i === 0 ? 0 : i === stops.length - 1 ? this.intro + this.drive : this.intro + this.holdStarts[i - 1],
    );
  }

  at(t) {
    t = clamp(t, 0, this.total);
    const td = clamp(t - this.intro, 0, this.drive);
    let tau = td, holdIdx = -1, holdT = 0;
    for (let k = 0; k < this.K; k++) {
      const x = td - this.holdStarts[k];
      const hk = this.holds[k];
      if (x > 0 && hk > 0) {
        tau -= Math.min(x, hk);
        if (x < hk) { holdIdx = k; holdT = x / hk; }
      }
    }
    const d = easeTrap(tau / this.Tm) * this.L;
    const phase = t < this.intro ? 'intro' : t < this.intro + this.drive ? 'drive' : 'outro';
    return {
      t, phase, d,
      progress: this.L ? d / this.L : 0,
      holdIdx, holdT,
      introT: this.intro > 0 ? clamp(t / this.intro, 0, 1) : 1,
      outroT: this.outro > 0 ? clamp((t - this.intro - this.drive) / this.outro, 0, 1) : 1,
    };
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
    const dolly = st.holdIdx >= 0 ? cfg.holdZoomIn * Math.sin(Math.PI * st.holdT) : 0;
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
