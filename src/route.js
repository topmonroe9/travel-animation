// Геокодинг (Nominatim) и маршрутизация (OSRM demo). Оба бесплатны и без ключей.
import { Polyline } from './geo.js';
import { t, lang } from './i18n.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OSRM = 'https://router.project-osrm.org/route/v1/driving/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Типы точек: эмодзи, цвет флажка и ключевые слова для текстового ввода «#тип». */
export const STOP_TYPES = {
  start: { emoji: '🚩', color: '#22c55e', words: ['старт', 'начало', 'start'] },
  finish: { emoji: '🏁', color: '#111827', words: ['финиш', 'конец', 'finish', 'end'] },
  fuel: { emoji: '⛽', color: '#f59e0b', words: ['заправка', 'азс', 'бензин', 'fuel', 'gas', 'petrol', 'charge'] },
  rest: { emoji: '☕', color: '#10b981', words: ['отдых', 'кофе', 'перерыв', 'rest', 'coffee', 'break'] },
  food: { emoji: '🍽️', color: '#f97316', words: ['еда', 'обед', 'ужин', 'завтрак', 'кафе', 'food', 'lunch', 'dinner', 'breakfast', 'cafe'] },
  sleep: { emoji: '🛏️', color: '#6366f1', words: ['ночёвка', 'ночевка', 'отель', 'сон', 'гостиница', 'sleep', 'hotel', 'night', 'stay'] },
  photo: { emoji: '📷', color: '#ec4899', words: ['фото', 'photo', 'pic'] },
  sight: { emoji: '🏛️', color: '#8b5cf6', words: ['место', 'музей', 'достопримечательность', 'sight', 'museum'] },
  nature: { emoji: '🏔️', color: '#0ea5e9', words: ['природа', 'горы', 'гора', 'озеро', 'водопад', 'вид', 'nature', 'mountain', 'lake', 'view', 'viewpoint'] },
  beach: { emoji: '🏖️', color: '#06b6d4', words: ['море', 'пляж', 'beach', 'sea'] },
  home: { emoji: '🏠', color: '#64748b', words: ['дом', 'дача', 'home', 'house'] },
  place: { emoji: '📍', color: '#ef4444', words: ['точка', 'place', 'stop', 'point'] },
};

export const MARKERS = ['flag', 'badge', 'hidden'];

function stopTypeFor(word) {
  const w = word.toLowerCase();
  for (const [id, it] of Object.entries(STOP_TYPES)) if (id === w || it.words.includes(w)) return id;
  return 'place';
}

/** Тип точки с учётом положения: без явного типа первая — старт, последняя — финиш. */
export function resolveType(point, i, n) {
  if (point.type && STOP_TYPES[point.type]) return point.type;
  return i === 0 ? 'start' : i === n - 1 ? 'finish' : 'place';
}

/**
 * Список точек текстом, одна на строку: «Название [@ широта, долгота] [#тип] [~секунды]».
 * Примеры: «Воронеж #заправка», «Ростов-на-Дону #ночёвка ~3», «Дача @ 51.66, 39.20 #отдых».
 */
export function parseWaypoints(text) {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((line) => {
      const wp = {};
      line = line.replace(/~\s*(\d+(?:\.\d+)?)\s*(?:с|c|s|сек)?\b/u, (_, h) => { wp.hold = parseFloat(h); return ' '; });
      line = line.replace(/#\s*([\p{L}\p{N}_-]+)/u, (_, w) => { wp.type = stopTypeFor(w); return ' '; });
      line = line.replace(/@\s*(-?\d+(?:\.\d+)?)[\s,;]+(-?\d+(?:\.\d+)?)/u, (_, lat, lng) => { wp.lngLat = [parseFloat(lng), parseFloat(lat)]; return ' '; });
      wp.name = line.replace(/\s+/g, ' ').trim() || (wp.lngLat ? `${wp.lngLat[1]}, ${wp.lngLat[0]}` : '·');
      return wp;
    });
}

/** «широта, долгота» → [lng, lat] или null. */
export function parseLatLng(text) {
  const m = String(text).trim().match(/^(-?\d+(?:\.\d+)?)[\s,;]+(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return [lng, lat];
}

// Nominatim разрешает не больше запроса в секунду: запросы идут цепочкой.
let geoChain = Promise.resolve();
let lastGeoAt = 0;

export function geocode(name) {
  const key = 'geo:' + name.toLowerCase();
  try {
    const c = localStorage.getItem(key);
    if (c) return Promise.resolve({ ...JSON.parse(c), cached: true });
  } catch {}
  const job = geoChain.then(async () => {
    const wait = lastGeoAt + 1100 - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      const url = `${NOMINATIM}?format=jsonv2&limit=1&accept-language=${lang}&q=${encodeURIComponent(name)}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(t('err.nominatim', { status: res.status }));
      const arr = await res.json();
      if (!arr.length) throw new Error(t('err.notFound', { name }));
      const it = arr[0];
      const out = { name, lngLat: [+it.lon, +it.lat], found: it.display_name };
      try { localStorage.setItem(key, JSON.stringify(out)); } catch {}
      return { ...out, cached: false };
    } finally {
      lastGeoAt = Date.now();
    }
  });
  geoChain = job.catch(() => {});
  return job;
}

/** Маршрут по дорогам через точки, у которых уже есть координаты. */
export async function fetchRoute(points) {
  if (points.length < 2) throw new Error(t('err.minPoints'));
  const coordStr = points.map((p) => p.lngLat.map((v) => v.toFixed(6)).join(',')).join(';');
  const res = await fetch(`${OSRM}${coordStr}?overview=full&geometries=geojson&steps=false`);
  if (!res.ok) throw new Error(t('err.osrm', { status: res.status }));
  const data = await res.json();
  if (data.code !== 'Ok') throw new Error(t('err.osrmMsg', { msg: data.message || data.code }));
  const r = data.routes[0];
  return {
    name: points.map((p) => p.name).join(' → '),
    source: 'OSRM demo, ' + new Date().toISOString().slice(0, 10),
    distance_m: r.distance,
    duration_s: r.duration,
    waypoints: points.map((p) => ({ name: p.name, lngLat: p.lngLat })),
    legs: r.legs.map((l) => l.distance),
    coordinates: r.geometry.coordinates,
  };
}

/** Ключ кеша: порядок точек и их координаты (у старых записей вместо координат бывало название). */
export function routeCacheKey(points) {
  return 'route:' + points.map((w) => (w.lngLat ? w.lngLat.join(',') : w.name.toLowerCase())).join('|');
}

export function cacheGet(key) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
}
export function cacheSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export async function loadBundled(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(t('err.load', { url }));
  return res.json();
}

/**
 * Километраж каждой точки на полилинии. По длинам участков из OSRM, если они есть,
 * иначе проекцией по порядку (следующая точка ищется только дальше предыдущей).
 */
export function placeOnLine(route, line) {
  const wps = route.waypoints;
  const n = wps.length;
  if (route.legs?.length === n - 1) {
    const total = route.legs.reduce((a, b) => a + b, 0) || 1;
    let acc = 0;
    return wps.map((_, i) => {
      if (i > 0) acc += route.legs[i - 1];
      return i === n - 1 ? line.length : (acc / total) * line.length;
    });
  }
  let from = 0;
  return wps.map((wp, i) => {
    if (i === 0) return 0;
    if (i === n - 1) return line.length;
    const p = line.projectFrom(wp.lngLat, from);
    from = p.i;
    return p.d;
  });
}

export function buildLine(route) {
  return new Polyline(route.coordinates);
}

/** Точка участвует в маршруте, если у неё есть название или координаты (пустая строка — черновик). */
export const isActivePoint = (p) => !!(p.name?.trim() || p.lngLat);
