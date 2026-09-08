// Связка UI ↔ маршрут ↔ таймлайн ↔ сцена ↔ экспорт.
import { bbox, fitCamera, makeSmoothBearing, clamp } from './geo.js';
import { parseWaypoints, fetchRoute, buildTrip, routeCacheKey, cacheGet, cacheSet, loadBundled, applyStopMeta, STOP_TYPES } from './route.js';
import { Timeline, cameraAt, easeOutBack } from './timeline.js';
import { Scene, STYLES } from './scene.js';
import { drawHud } from './hud.js';
import { exportVideo, downloadBlob } from './exporter.js';
import { t as tr, tIn, lang, setLang, applyDom, locale, LANGS } from './i18n.js';

const $ = (s) => document.querySelector(s);

applyDom();
const DEFAULTS = {
  waypoints: tr('wp.placeholder'),
  title: tr('default.title'),
  subtitle: tr('default.subtitle'),
  format: '16:9', res: '1080', fps: 30,
  drive: 30, intro: 2.5, outro: 4, hold: 1,
  mode: 'follow', zoom: 7.5, pitch: 60, carOffset: 0.2, introZoomIn: 2.5, holdZoomIn: 0.8,
  style: 'liberty', hillshade: true, terrain: true, terrainScale: 2,
  routeColor: '#ff3b30', carColor: '#1f2f6e', carSize: 0.9, car3d: true, bitrate: 12,
};
const FORMATS = { '16:9': [16, 9], '9:16': [9, 16], '1:1': [1, 1] };

let cfg = { ...DEFAULTS };
try { Object.assign(cfg, JSON.parse(localStorage.getItem('ta.config') || '{}')); } catch {}
const saveCfg = () => { try { localStorage.setItem('ta.config', JSON.stringify(cfg)); } catch {} };

// ---------- размеры ----------
function outputSize() {
  const [a, b] = FORMATS[cfg.format];
  const short = +cfg.res;
  const W = a >= b ? Math.round((short * a) / b) : short;
  const H = a >= b ? short : Math.round((short * b) / a);
  const pr = Math.min(W, H) / 540;
  return { W: W - (W % 2), H: H - (H % 2), pr, cssW: W / pr, cssH: H / pr };
}

const stage = $('#stage');
const hud = $('#hud');
const hctx = hud.getContext('2d');
let size = outputSize();

function applySize() {
  size = outputSize();
  stage.style.width = size.cssW + 'px';
  stage.style.height = size.cssH + 'px';
  hud.width = size.W;
  hud.height = size.H;
  hud.style.width = size.cssW + 'px';
  hud.style.height = size.cssH + 'px';
  scene.resize(size.cssW, size.cssH, size.pr);
  fitStage();
  if (trip) trip.overview = fitCamera(trip.bbox, size.cssW, size.cssH, overviewPadding());
}

/** Отступы общего плана: сверху титры и флажки, справа таблички флажков, снизу счётчик километров. */
function overviewPadding() {
  const k = Math.min(size.cssW, size.cssH) / 540;
  return { top: 120 * k, right: 150 * k, bottom: 100 * k, left: 40 * k };
}

function fitStage() {
  const vp = $('#viewport');
  const availW = vp.clientWidth - 48;
  const availH = vp.clientHeight - $('#playbar').offsetHeight - 48;
  const k = Math.min(availW / size.cssW, availH / size.cssH, size.pr);
  stage.style.transform = `scale(${k})`;
  const wrap = $('#stage-wrap');
  wrap.style.width = size.cssW * k + 'px';
  wrap.style.height = size.cssH * k + 'px';
}
window.addEventListener('resize', fitStage);

// ---------- сцена ----------
const scene = new Scene($('#map'), {
  style: STYLES[cfg.style] ? cfg.style : 'liberty', pixelRatio: size.pr,
  hillshade: cfg.hillshade, terrain: cfg.terrain, terrainScale: +cfg.terrainScale,
  routeColor: cfg.routeColor, carColor: cfg.carColor, carSize: +cfg.carSize, car3d: !!cfg.car3d, lang,
});

// ---------- маршрут ----------
let trip = null; // { route, line, stops, smoothBearing, bbox, overview }
let timeline = null;
let t = 0;
let playing = false;
let exporting = false;

function setTrip(route) {
  const { line, stops } = buildTrip(route);
  const bb = bbox(route.coordinates);
  trip = {
    route, line, stops, bbox: bb,
    smoothBearing: makeSmoothBearing(line, 1, 25),
    overview: fitCamera(bb, size.cssW, size.cssH, overviewPadding()),
  };
  scene.setRoute(line);
  rebuildTimeline();
  updateRouteInfo();
  setTime(0);
}

function updateRouteInfo() {
  if (!trip) return;
  const r = trip.route;
  $('#routeInfo').textContent = tr('status.summary', {
    km: Math.round(r.distance_m / 1000).toLocaleString(locale()), h: Math.round(r.duration_s / 3600), n: r.coordinates.length, src: r.source,
  });
  $('#routeInfo').className = 'info';
}

function rebuildTimeline() {
  if (!trip) return;
  timeline = new Timeline(trip.line.length, trip.stops, { intro: +cfg.intro, drive: +cfg.drive, outro: +cfg.outro, hold: +cfg.hold });
  $('#scrub').max = timeline.total;
  t = clamp(t, 0, timeline.total);
}

async function buildRoute() {
  const wps = parseWaypoints($('#wp').value);
  const status = (m) => { $('#routeInfo').textContent = m; $('#routeInfo').className = 'info busy'; };
  const btn = $('#btnRoute');
  btn.disabled = true;
  try {
    const key = routeCacheKey(wps);
    let route = cacheGet(key);
    if (!route) {
      route = await fetchRoute(wps, status);
      cacheSet(key, route);
    }
    route = applyStopMeta(route, wps);
    cfg.waypoints = $('#wp').value;
    saveCfg();
    setTrip(route);
  } catch (e) {
    $('#routeInfo').textContent = tr('status.error', { msg: e.message });
    $('#routeInfo').className = 'info error';
  } finally {
    btn.disabled = false;
  }
}

// ---------- рендер кадра ----------
function render(time) {
  if (!trip || !timeline) return;
  const st = timeline.at(time);
  const { cam, car, carBearing } = cameraAt(st, {
    line: trip.line, smoothBearing: trip.smoothBearing, H: size.cssH, overview: trip.overview,
    cfg: { mode: cfg.mode, zoom: +cfg.zoom, pitch: +cfg.pitch, carOffset: +cfg.carOffset, introZoomIn: +cfg.introZoomIn, holdZoomIn: +cfg.holdZoomIn },
  });
  const stops = trip.stops.map((s, i) => {
    const age = time - timeline.stopTimes[i];
    return {
      name: s.name, lngLat: s.lngLat, type: s.type, frac: s.d / trip.line.length, color: STOP_TYPES[s.type]?.color,
      scale: age >= 0 ? easeOutBack(clamp(age / 0.6, 0, 1)) : 0,
    };
  });
  scene.update(cam, st.d, car, carBearing, stops);
  drawHud(hctx, size.W, size.H, {
    title: cfg.title, subtitle: cfg.subtitle,
    km: st.d, totalKm: trip.line.length, progress: st.progress,
    stops: stops.map((s) => ({ frac: s.frac, visible: s.scale > 0, color: s.color })), color: cfg.routeColor,
  });
}

function setTime(time) {
  t = timeline ? clamp(time, 0, timeline.total) : 0;
  $('#scrub').value = t;
  $('#timeLabel').textContent = tr('play.time', { t: t.toFixed(1), total: timeline ? timeline.total.toFixed(1) : '0.0' });
  render(t);
}

let t0 = 0;
function loop() {
  if (!playing) return;
  let time = (performance.now() - t0) / 1000;
  if (time >= timeline.total) { time = timeline.total; playing = false; $('#btnPlay').textContent = '▶'; }
  setTime(time);
  if (playing) requestAnimationFrame(loop);
}
function togglePlay() {
  if (!timeline || exporting) return;
  playing = !playing;
  $('#btnPlay').textContent = playing ? '❚❚' : '▶';
  if (playing) {
    if (t >= timeline.total - 1e-3) t = 0;
    t0 = performance.now() - t * 1000;
    requestAnimationFrame(loop);
  }
}

// ---------- экспорт ----------
let cancelExport = false;
async function doExport() {
  if (!trip || !timeline || exporting) return;
  exporting = true;
  playing = false;
  cancelExport = false;
  const ui = $('#exportProgress');
  ui.hidden = false;
  $('#btnExport').disabled = true;
  const fps = +cfg.fps;
  const frames = Math.ceil(timeline.total * fps) + 1;
  const off = document.createElement('canvas');
  off.width = size.W; off.height = size.H;
  const octx = off.getContext('2d');
  const mapCanvas = scene.map.getCanvas();
  const started = performance.now();
  try {
    await document.fonts.ready;
    const blob = await exportVideo({
      frames, fps, width: size.W, height: size.H, bitrate: +cfg.bitrate * 1e6,
      isCancelled: () => cancelExport,
      onProgress: (i, n) => {
        const el = (performance.now() - started) / 1000;
        const eta = Math.round((el / i) * (n - i));
        $('#exportBar').style.width = `${(100 * i) / n}%`;
        $('#exportText').textContent = tr('export.progress', { i, n, eta });
      },
      getFrame: async (i) => {
        setTime(Math.min(i / fps, timeline.total));
        await scene.idle();
        octx.drawImage(mapCanvas, 0, 0, size.W, size.H);
        octx.drawImage(hud, 0, 0);
        return off;
      },
    });
    window.__lastExport = blob;
    if (blob) {
      const name = (cfg.title || tr('file.default')).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || tr('file.default');
      downloadBlob(blob, `${name}-${size.W}x${size.H}.mp4`);
      $('#exportText').textContent = tr('export.done', { mb: (blob.size / 1e6).toFixed(1), frames, s: Math.round((performance.now() - started) / 1000) });
    } else {
      $('#exportText').textContent = tr('export.cancelled');
    }
  } catch (e) {
    console.error(e);
    $('#exportText').textContent = tr('export.error', { msg: e.message });
  } finally {
    exporting = false;
    $('#btnExport').disabled = false;
  }
}

// ---------- UI ----------
function bind(id, key, onChange) {
  const el = $('#' + id);
  if (el.type === 'checkbox') el.checked = !!cfg[key]; else el.value = cfg[key];
  const out = el.parentElement.querySelector('output');
  if (out) out.textContent = el.value;
  el.addEventListener('input', () => {
    cfg[key] = el.type === 'checkbox' ? el.checked : el.value;
    if (out) out.textContent = el.value;
    saveCfg();
    onChange?.(cfg[key]);
  });
}

const rerender = () => render(t);
bind('title', 'title', rerender);
bind('subtitle', 'subtitle', rerender);
bind('format', 'format', () => { applySize(); rerender(); });
bind('res', 'res', () => { applySize(); rerender(); });
bind('fps', 'fps');
bind('bitrate', 'bitrate');
for (const k of ['drive', 'intro', 'outro', 'hold']) bind(k, k, () => { rebuildTimeline(); setTime(t); });
for (const k of ['mode', 'zoom', 'pitch', 'carOffset']) bind(k, k, rerender);
bind('style', 'style', async (v) => { await scene.setStyle(v); rerender(); });
bind('hillshade', 'hillshade', (v) => scene.setOptions({ hillshade: v }).then(rerender));
bind('terrain', 'terrain', (v) => scene.setOptions({ terrain: v }).then(rerender));
bind('terrainScale', 'terrainScale', (v) => scene.setOptions({ terrainScale: +v }).then(rerender));
bind('routeColor', 'routeColor', (v) => scene.setOptions({ routeColor: v }).then(rerender));
bind('carColor', 'carColor', (v) => scene.setOptions({ carColor: v }).then(rerender));
bind('carSize', 'carSize', (v) => scene.setOptions({ carSize: +v }).then(rerender));
bind('car3d', 'car3d', (v) => scene.setOptions({ car3d: v }).then(rerender));
$('#carFile').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const bmp = await createImageBitmap(f);
  await scene.setOptions({ customCar: bmp });
  rerender();
});
$('#wp').value = cfg.waypoints;
$('#btnRoute').addEventListener('click', buildRoute);
$('#btnPlay').addEventListener('click', togglePlay);
$('#btnExport').addEventListener('click', doExport);
$('#btnCancelExport').addEventListener('click', () => { cancelExport = true; });
$('#scrub').addEventListener('input', (e) => { playing = false; $('#btnPlay').textContent = '▶'; setTime(+e.target.value); });
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) { e.preventDefault(); togglePlay(); }
});
$('#stage').addEventListener('click', () => { if (!exporting) togglePlay(); });

// ---------- язык ----------
const isDefaultWaypoints = (text) => LANGS.some((l) => text.trim() === tIn(l, 'wp.placeholder').trim());
$('#lang').value = lang;
$('#lang').addEventListener('change', async (e) => {
  const next = e.target.value;
  const prev = lang;
  if (next === prev) return;
  // Значения по умолчанию переводим вместе с интерфейсом, пользовательские не трогаем.
  const swap = (key, cfgKey) => {
    if (cfg[cfgKey].trim() === tIn(prev, key).trim()) { cfg[cfgKey] = tIn(next, key); return true; }
    return false;
  };
  const wpSwapped = swap('wp.placeholder', 'waypoints');
  swap('default.title', 'title');
  swap('default.subtitle', 'subtitle');
  setLang(next);
  saveCfg();
  applyDom();
  $('#wp').value = cfg.waypoints;
  $('#title').value = cfg.title;
  $('#subtitle').value = cfg.subtitle;
  scene.setLang(next);
  scene.resetFlags();
  updateRouteInfo();
  if (wpSwapped) await loadTrip(); else setTime(t);
});

// ---------- старт ----------
async function loadTrip() {
  const wps = parseWaypoints(cfg.waypoints);
  const cached = cacheGet(routeCacheKey(wps));
  if (cached) { setTrip(applyStopMeta(cached, wps)); return; }
  if (isDefaultWaypoints(cfg.waypoints)) {
    try { setTrip(applyStopMeta(await loadBundled('routes/sample.json'), wps)); return; } catch (e) { console.warn(e); }
  }
  await buildRoute();
}

applySize();
document.fonts.ready.then(() => { if (scene.map.getLayer('stop-icon')) { scene.resetFlags(); render(t); } });
scene.ready.then(loadTrip);

window.__app = { get cfg() { return cfg; }, get trip() { return trip; }, get timeline() { return timeline; }, scene, setTime, render, doExport };
