// Геодезические примитивы без внешних зависимостей. Координаты везде [lng, lat].

const R = 6371.0088; // средний радиус Земли, км
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;

/** Интерполяция углов по короткой дуге, градусы. */
export function lerpAngle(a, b, t) {
  const d = ((b - a + 540) % 360) - 180;
  return (a + d * t + 360) % 360;
}

export function haversine(a, b) {
  const p1 = rad(a[1]);
  const p2 = rad(b[1]);
  const dp = p2 - p1;
  const dl = rad(b[0] - a[0]);
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function bearing(a, b) {
  const p1 = rad(a[1]);
  const p2 = rad(b[1]);
  const dl = rad(b[0] - a[0]);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

export function destination(p, km, brg) {
  const p1 = rad(p[1]);
  const l1 = rad(p[0]);
  const th = rad(brg);
  const dd = km / R;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(dd) + Math.cos(p1) * Math.sin(dd) * Math.cos(th));
  const l2 = l1 + Math.atan2(Math.sin(th) * Math.sin(dd) * Math.cos(p1), Math.cos(dd) - Math.sin(p1) * Math.sin(p2));
  return [deg(l2), deg(p2)];
}

export function bbox(coords) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of coords) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return [w, s, e, n];
}

/** Метров на CSS-пиксель у MapLibre (мир = 512·2^zoom px). */
export function metersPerPixel(lat, zoom) {
  return (40075016.686 * Math.cos(rad(lat))) / (512 * Math.pow(2, zoom));
}

function merc([lng, lat]) {
  const s = Math.sin(rad(clamp(lat, -85.05, 85.05)));
  return [(lng + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)];
}
function unmerc([x, y]) {
  return [x * 360 - 180, deg(2 * Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) - Math.PI / 2)];
}

/**
 * Камера (center, zoom), вписывающая bbox в W×H CSS-пикселей.
 * pad — число или {top, right, bottom, left} в CSS-пикселях (под титры и флажки).
 */
export function fitCamera(bb, W, H, pad) {
  const p = typeof pad === 'number' ? { top: pad, right: pad, bottom: pad, left: pad } : pad;
  const [w, s, e, n] = bb;
  const a = merc([w, n]);
  const b = merc([e, s]);
  const dx = Math.max(1e-9, b[0] - a[0]);
  const dy = Math.max(1e-9, b[1] - a[1]);
  const zoom = Math.log2(Math.min((W - p.left - p.right) / (512 * dx), (H - p.top - p.bottom) / (512 * dy)));
  const world = 512 * Math.pow(2, zoom); // размер мира в CSS-пикселях
  // Сдвигаем центр так, чтобы свободное место распределилось по отступам.
  const cx = (a[0] + b[0]) / 2 + ((p.right - p.left) / 2) / world;
  const cy = (a[1] + b[1]) / 2 + ((p.bottom - p.top) / 2) / world;
  return { center: unmerc([cx, cy]), zoom };
}

/** Полилиния с накопленными дистанциями и быстрым поиском точки по километражу. */
export class Polyline {
  constructor(coords) {
    this.coords = coords;
    const n = coords.length;
    this.cum = new Float64Array(n);
    for (let i = 1; i < n; i++) this.cum[i] = this.cum[i - 1] + haversine(coords[i - 1], coords[i]);
    this.length = n ? this.cum[n - 1] : 0;
  }

  /** Индекс сегмента: наибольший i (0..n-2) с cum[i] <= d. */
  indexAt(d) {
    const cum = this.cum;
    let lo = 0, hi = cum.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (cum[mid] <= d) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  pointAt(d) {
    const c = this.coords;
    if (c.length === 1) return c[0];
    d = clamp(d, 0, this.length);
    const i = this.indexAt(d);
    const seg = this.cum[i + 1] - this.cum[i];
    const t = seg > 0 ? (d - this.cum[i]) / seg : 0;
    return [lerp(c[i][0], c[i + 1][0], t), lerp(c[i][1], c[i + 1][1], t)];
  }

  bearingAt(d, look = 0.5) {
    const a = this.pointAt(Math.max(0, d - look));
    const b = this.pointAt(Math.min(this.length, d + look));
    if (a[0] === b[0] && a[1] === b[1]) return 0;
    return bearing(a, b);
  }

  /** Координаты пройденной части [0, d] с точной головой. */
  sliceTo(d) {
    d = clamp(d, 0, this.length);
    const i = this.indexAt(d);
    const out = this.coords.slice(0, i + 1);
    out.push(this.pointAt(d));
    return out;
  }

  /** Километраж ближайшей вершины к точке (проекция остановки на маршрут). */
  project(pt) {
    return this.projectFrom(pt, 0).d;
  }

  /** Ближайшая к точке вершина, начиная с индекса from: { i, d }. */
  projectFrom(pt, from = 0) {
    const c = this.coords;
    const k = Math.cos(rad(pt[1]));
    let best = from, bd = Infinity;
    for (let i = from; i < c.length; i++) {
      const dx = (c[i][0] - pt[0]) * k;
      const dy = c[i][1] - pt[1];
      const dd = dx * dx + dy * dy;
      if (dd < bd) { bd = dd; best = i; }
    }
    return { i: best, d: this.cum[best] };
  }
}

/**
 * Сглаженный азимут вдоль маршрута для камеры: круговое среднее с гауссовым
 * окном, смещённым вперёд, чтобы камера предугадывала повороты.
 * Возвращает функцию d(км) → азимут.
 */
export function makeSmoothBearing(line, stepKm = 1, windowKm = 25) {
  const n = Math.max(2, Math.ceil(line.length / stepKm) + 1);
  const raw = new Float64Array(n);
  for (let i = 0; i < n; i++) raw[i] = rad(line.bearingAt(Math.min(i * stepKm, line.length), stepKm));
  const w = Math.max(1, Math.round(windowKm / stepKm));
  const sigma = w / 2;
  const ahead = Math.round(w * 0.35);
  const sm = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sx = 0, sy = 0;
    const c = i + ahead;
    for (let j = c - w; j <= c + w; j++) {
      const jj = clamp(j, 0, n - 1);
      const g = Math.exp(-((j - c) ** 2) / (2 * sigma * sigma));
      sx += Math.cos(raw[jj]) * g;
      sy += Math.sin(raw[jj]) * g;
    }
    sm[i] = (deg(Math.atan2(sy, sx)) + 360) % 360;
  }
  return (d) => {
    const x = clamp(d / stepKm, 0, n - 1);
    const i = Math.floor(x);
    return lerpAngle(sm[i], sm[Math.min(i + 1, n - 1)], x - i);
  };
}
