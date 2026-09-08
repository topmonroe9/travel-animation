// Геокодинг (Nominatim) и маршрутизация (OSRM demo). Оба бесплатны и без ключей.
import { Polyline } from './geo.js';
import { t } from './i18n.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OSRM = 'https://router.project-osrm.org/route/v1/driving/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Типы остановок: ключевые слова после «#» → id типа. */
export const STOP_TYPES = {
  fuel: { emoji: '⛽', color: '#f59e0b', words: ['заправка', 'азс', 'бензин', 'fuel', 'gas', 'petrol', 'charge'] },
  rest: { emoji: '☕', color: '#10b981', words: ['отдых', 'кофе', 'перерыв', 'rest', 'coffee', 'break'] },
  food: { emoji: '🍽️', color: '#f97316', words: ['еда', 'обед', 'ужин', 'завтрак', 'кафе', 'food', 'lunch', 'dinner', 'breakfast', 'cafe'] },
  sleep: { emoji: '🛏️', color: '#6366f1', words: ['ночёвка', 'ночевка', 'отель', 'сон', 'гостиница', 'sleep', 'hotel', 'night', 'stay'] },
  photo: { emoji: '📷', color: '#ec4899', words: ['фото', 'photo', 'pic'] },
  sight: { emoji: '🏛️', color: '#8b5cf6', words: ['место', 'музей', 'достопримечательность', 'вид', 'sight', 'view', 'museum', 'viewpoint'] },
  place: { emoji: '📍', color: '#ef4444', words: ['точка', 'place', 'stop', 'point'] },
};
function stopTypeFor(word) {
  const w = word.toLowerCase();
  for (const [id, t] of Object.entries(STOP_TYPES)) if (id === w || t.words.includes(w)) return id;
  return 'place';
}

/**
 * Одна точка на строку. Формат: «Название [@ широта, долгота] [#тип] [~секунды]».
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

export async function geocode(name) {
  const key = 'geo:' + name.toLowerCase();
  try {
    const c = localStorage.getItem(key);
    if (c) return { ...JSON.parse(c), cached: true };
  } catch {}
  const url = `${NOMINATIM}?format=jsonv2&limit=1&accept-language=ru&q=${encodeURIComponent(name)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(t('err.nominatim', { status: res.status }));
  const arr = await res.json();
  if (!arr.length) throw new Error(t('err.notFound', { name }));
  const it = arr[0];
  const out = { name, lngLat: [+it.lon, +it.lat], found: it.display_name };
  try { localStorage.setItem(key, JSON.stringify(out)); } catch {}
  return { ...out, cached: false };
}

export async function fetchRoute(waypoints, onStatus = () => {}) {
  const pts = [];
  for (const wp of waypoints) {
    if (wp.lngLat) { pts.push({ ...wp }); continue; }
    onStatus(t('status.geocoding', { name: wp.name }));
    const g = await geocode(wp.name);
    pts.push({ ...wp, lngLat: g.lngLat });
    if (!g.cached) await sleep(1100); // политика Nominatim: не чаще 1 запроса в секунду
  }
  if (pts.length < 2) throw new Error(t('err.minPoints'));
  onStatus(t('status.routing'));
  const coordStr = pts.map((p) => p.lngLat.map((v) => v.toFixed(6)).join(',')).join(';');
  const res = await fetch(`${OSRM}${coordStr}?overview=full&geometries=geojson&steps=false`);
  if (!res.ok) throw new Error(t('err.osrm', { status: res.status }));
  const data = await res.json();
  if (data.code !== 'Ok') throw new Error(t('err.osrmMsg', { msg: data.message || data.code }));
  const r = data.routes[0];
  return {
    name: pts.map((p) => p.name).join(' → '),
    source: 'OSRM demo, ' + new Date().toISOString().slice(0, 10),
    distance_m: r.distance,
    duration_s: r.duration,
    waypoints: pts,
    coordinates: r.geometry.coordinates,
  };
}

export function routeCacheKey(waypoints) {
  return 'route:' + waypoints.map((w) => (w.lngLat ? w.lngLat.join(',') : w.name.toLowerCase())).join('|');
}

/** Переносит названия, типы и паузы из свежераспарсенных точек в маршрут (в т.ч. кэшированный или встроенный). */
export function applyStopMeta(route, waypoints) {
  if (waypoints.length !== route.waypoints.length) return route;
  return { ...route, waypoints: route.waypoints.map((wp, i) => ({ ...wp, name: waypoints[i].name, type: waypoints[i].type, hold: waypoints[i].hold })) };
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

/** Из сырого маршрута делаем полилинию и остановки с километражом. */
export function buildTrip(route) {
  const line = new Polyline(route.coordinates);
  const stops = route.waypoints.map((wp, i, arr) => ({
    name: wp.name,
    lngLat: wp.lngLat,
    type: i === 0 ? 'start' : i === arr.length - 1 ? 'finish' : wp.type || 'place',
    hold: wp.hold,
    d: i === 0 ? 0 : i === arr.length - 1 ? line.length : line.project(wp.lngLat),
  }));
  stops.sort((a, b) => a.d - b.d);
  return { line, stops };
}
