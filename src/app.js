// Связка UI ↔ маршрут ↔ таймлайн ↔ сцена ↔ экспорт.
import { bbox, fitCamera, makeSmoothBearing, clamp } from './geo.js';
import {
  parseWaypoints, fetchRoute, buildLine, placeOnLine, routeCacheKey, cacheGet, cacheSet, loadBundled,
  geocode, resolveType, isActivePoint, STOP_TYPES,
} from './route.js';
import { Timeline, cameraAt, easeOutBack } from './timeline.js';
import { Scene, STYLES, BADGE_STEM } from './scene.js';
import { drawHud } from './hud.js';
import { galleryDuration, galleryPresence, GALLERY_STYLES } from './gallery.js';
import { exportVideo, downloadBlob } from './exporter.js';
import * as Photos from './photos.js';
import { PointsEditor, newId } from './points-ui.js';
import { t as tr, tIn, lang, setLang, applyDom, locale, LANGS } from './i18n.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

applyDom();

// Встроенный пример (routes/sample.json): координаты совпадают, поэтому маршрут грузится без сети.
const SAMPLE_COORDS = [[11.582, 48.1351], [11.3927, 47.2692], [12.3155, 45.4408]];
const SAMPLE_KEYS = ['default.p1', 'default.p2', 'default.p3'];

function normalizePoint(p) {
  return {
    id: p.id || newId(), name: p.name || '', lngLat: p.lngLat || null, manual: !!p.manual, found: p.found || '',
    type: p.type || null, marker: p.marker || 'flag', label: p.label || '', color: p.color || '', emoji: p.emoji || '',
    hold: p.hold ?? null, photos: Array.isArray(p.photos) ? p.photos : [],
  };
}
const defaultPoints = (l = lang) => SAMPLE_KEYS.map((k, i) => normalizePoint({ name: tIn(l, k), lngLat: SAMPLE_COORDS[i], type: i === 1 ? 'rest' : null }));

const DEFAULTS = {
  title: tr('default.title'),
  subtitle: tr('default.subtitle'),
  format: '16:9', res: '1080', fps: 30,
  drive: 30, intro: 2.5, outro: 4, hold: 1,
  mode: 'follow', zoom: 7.5, pitch: 60, carOffset: 0.2, introZoomIn: 2.5, holdZoomIn: 0.8,
  style: 'liberty', hillshade: true, terrain: true, terrainScale: 2,
  routeColor: '#ff3b30', carColor: '#1f2f6e', carSize: 0.9, car3d: true, bitrate: 12,
  kmStart: 0, showTotal: true, galleryStyle: 'stack', photoTime: 2.2,
};
const FORMATS = { '16:9': [16, 9], '9:16': [9, 16], '1:1': [1, 1] };

let cfg = { ...DEFAULTS };
try { Object.assign(cfg, JSON.parse(localStorage.getItem('ta.config') || '{}')); } catch {}
const saveCfg = () => { try { localStorage.setItem('ta.config', JSON.stringify(cfg)); } catch {} };
if (!GALLERY_STYLES.includes(cfg.galleryStyle)) cfg.galleryStyle = DEFAULTS.galleryStyle;

/** Раньше точки хранились текстом: переводим в список, подхватывая уже построенный маршрут из кеша. */
function migratePoints() {
  if (Array.isArray(cfg.points)) { cfg.points = cfg.points.map(normalizePoint); return; }
  const text = typeof cfg.waypoints === 'string' ? cfg.waypoints.trim() : '';
  delete cfg.waypoints;
  if (!text || LANGS.some((l) => text === tIn(l, 'wp.placeholder').trim())) { cfg.points = defaultPoints(); return; }
  const wps = parseWaypoints(text);
  const old = cacheGet(routeCacheKey(wps));
  const oldOk = old?.waypoints?.length === wps.length;
  cfg.points = wps.map((w, i) => normalizePoint({
    name: w.name, type: w.type, hold: w.hold, manual: !!w.lngLat,
    lngLat: w.lngLat || (oldOk ? old.waypoints[i].lngLat : null),
  }));
  if (oldOk && cfg.points.every((p) => p.lngLat)) cacheSet(routeCacheKey(cfg.points), old);
}
migratePoints();
saveCfg();

const activePoints = () => cfg.points.filter(isActivePoint);
const allPhotoIds = () => cfg.points.flatMap((p) => p.photos);

/** Сколько машина стоит в точке: галерея, если есть фото, иначе заданная или общая пауза. */
function holdFor(p, i, n) {
  if (p.photos.length) return galleryDuration(p.photos.length, +cfg.photoTime);
  if (p.hold != null && Number.isFinite(+p.hold)) return Math.max(0, +p.hold);
  return i > 0 && i < n - 1 && p.marker !== 'hidden' ? +cfg.hold : 0;
}

// ---------- размеры ----------
function outputSize() {
  const [a, b] = FORMATS[cfg.format] || FORMATS['16:9'];
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
  updateFooter();
}

/** Отступы общего плана: сверху титры и флажки, справа таблички флажков, снизу счётчик километров. */
function overviewPadding() {
  const k = Math.min(size.cssW, size.cssH) / 540;
  return { top: 120 * k, right: 150 * k, bottom: 100 * k, left: 40 * k };
}

function fitStage() {
  const vp = $('#viewport');
  const availW = vp.clientWidth - 48;
  const availH = vp.clientHeight - $('#playbar').offsetHeight - 64;
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
let trip = null; // { key, route, line, bbox, overview, smoothBearing, anchors:[{id, d, lngLat, snap}], stops }
let timeline = null;
let t = 0;
let playing = false;
let exporting = false;

function setInfo(msg, kind = '') {
  const el = $('#routeInfo');
  el.textContent = msg;
  el.className = 'info' + (kind ? ' ' + kind : '');
}

function setTrip(route, key, pts) {
  const line = buildLine(route);
  const ds = placeOnLine({ ...route, waypoints: pts }, line);
  const bb = bbox(route.coordinates);
  trip = {
    key, route, line, bbox: bb,
    smoothBearing: makeSmoothBearing(line, 1, 25),
    overview: fitCamera(bb, size.cssW, size.cssH, overviewPadding()),
    anchors: pts.map((p, i) => ({ id: p.id, d: ds[i], lngLat: p.lngLat, snap: { ...p, photos: [...p.photos] } })),
  };
  scene.setRoute(line);
  refreshStops(false);
  updateRouteInfo();
}

/** Пересобрать остановки из текущих настроек точек без перестройки маршрута. */
function refreshStops(keepTime = true) {
  if (!trip) return;
  const n = trip.anchors.length;
  trip.stops = trip.anchors.map((a, i) => {
    const p = cfg.points.find((q) => q.id === a.id) || a.snap;
    const type = resolveType(p, i, n);
    const T = STOP_TYPES[type];
    return {
      id: a.id, lngLat: a.lngLat, d: a.d, type,
      name: (p.label || p.name).trim() || '·',
      marker: p.marker || 'flag', color: p.color || T.color, emoji: p.emoji || T.emoji,
      photos: [...p.photos], hold: holdFor(p, i, n), seed: seedOf(a.id),
    };
  });
  timeline = new Timeline(trip.line.length, trip.stops, { intro: +cfg.intro, drive: +cfg.drive, outro: +cfg.outro });
  $('#scrub').max = timeline.total;
  editor.setLegs(legsById());
  renderMarks();
  updateFooter();
  updateOdoHint();
  setTime(keepTime ? t : 0);
}

function seedOf(id) {
  let h = 7;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 9973;
  return h;
}

/** Километры между соседними точками — только если список совпадает с построенным маршрутом. */
function legsById() {
  const act = activePoints();
  if (!trip || act.length !== trip.anchors.length || routeCacheKey(act) !== trip.key) return null;
  if (act.some((p, i) => p.id !== trip.anchors[i].id)) return null;
  const m = new Map();
  for (let i = 0; i < act.length - 1; i++) m.set(act[i].id, trip.anchors[i + 1].d - trip.anchors[i].d);
  return m;
}

function updateRouteInfo() {
  if (!trip) return;
  const r = trip.route;
  setInfo(tr('status.summary', { km: Math.round(r.distance_m / 1000).toLocaleString(locale()), h: Math.max(1, Math.round(r.duration_s / 3600)) }));
}

let bundled = null;
async function bundledFor(key) {
  try { bundled ||= await loadBundled('routes/sample.json'); } catch { return null; }
  return routeCacheKey(bundled.waypoints) === key ? bundled : null;
}

// Построение идёт по одному: правки во время запроса перезапускают его после окончания.
let routing = null;
let routeAgain = false;
function requestRoute() {
  if (routing) { routeAgain = true; return routing; }
  routing = (async () => {
    try {
      do { routeAgain = false; await routeOnce(); } while (routeAgain);
    } finally {
      routing = null;
    }
  })();
  return routing;
}

async function routeOnce() {
  const act = activePoints();
  if (act.length < 2) { setInfo(tr('status.needPoints'), 'error'); editor.setLegs(null); return; }
  for (const p of act) {
    if (p.lngLat) continue;
    const name = p.name;
    editor.setStatus(p.id, 'busy');
    setInfo(tr('status.geocoding', { name }), 'busy');
    try {
      const g = await geocode(name);
      if (p.name !== name || p.lngLat) { routeAgain = true; return; }
      p.lngLat = g.lngLat;
      p.found = g.found || '';
      editor.setStatus(p.id, null);
      if (editor.openId === p.id) editor.render();
    } catch (e) {
      editor.setStatus(p.id, 'error', e.message);
      setInfo(tr('status.fixPoint', { name }), 'error');
      return;
    }
  }
  saveCfg();
  const key = routeCacheKey(act);
  if (trip && trip.key === key) {
    trip.anchors.forEach((a, i) => { a.id = act[i].id; });
    refreshStops();
    updateRouteInfo();
    return;
  }
  let route = cacheGet(key) || (await bundledFor(key));
  if (!route) {
    setInfo(tr('status.routing'), 'busy');
    try {
      route = await fetchRoute(act);
    } catch (e) {
      setInfo(tr('status.error', { msg: e.message }), 'error');
      return;
    }
    cacheSet(key, route);
  }
  setTrip(route, key, act);
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
    return { ...s, frac: s.d / trip.line.length, scale: age >= 0 ? easeOutBack(clamp(age / 0.6, 0, 1)) : 0 };
  });
  scene.update(cam, st.d, car, carBearing, stops);

  let gallery = null;
  let presence = 0;
  const s = st.holdIdx >= 0 ? trip.stops[st.holdIdx] : null;
  const photos = s ? s.photos.map((id) => Photos.get(id)).filter(Boolean) : [];
  if (photos.length) {
    const per = +cfg.photoTime;
    presence = galleryPresence(st.holdTime, photos.length, per);
    // Галерея вылетает из таблички флажка (или из значка).
    const pt = scene.map.project(s.lngLat);
    const off = s.marker === 'badge' ? [0, -BADGE_STEM - 17] : s.marker === 'hidden' ? [0, 0] : [44, -62];
    const k = size.W / size.cssW;
    gallery = {
      photos, s: st.holdTime, perPhoto: per, style: cfg.galleryStyle,
      name: s.name, emoji: s.emoji, color: s.color, seed: s.seed,
      anchor: [(pt.x + off[0]) * k, (pt.y + off[1]) * k],
    };
  }
  drawHud(hctx, size.W, size.H, {
    title: cfg.title, subtitle: cfg.subtitle,
    km: st.d, totalKm: trip.line.length, kmStart: Math.max(0, +cfg.kmStart || 0), showTotal: cfg.showTotal !== false,
    progress: st.progress, color: cfg.routeColor,
    stops: stops.filter((x) => x.marker !== 'hidden').map((x) => ({ frac: x.frac, visible: x.scale > 0, color: x.color })),
    gallery, galleryPresence: presence,
  });
}

const fmtDur = (sec) => {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function setTime(time) {
  t = timeline ? clamp(time, 0, timeline.total) : 0;
  $('#scrub').value = t;
  $('#timeLabel').textContent = tr('play.time', { t: fmtDur(t), total: timeline ? fmtDur(timeline.total) : '0:00' });
  render(t);
}

let t0 = 0;
function loop() {
  if (!playing) return;
  let time = (performance.now() - t0) / 1000;
  if (time >= timeline.total) { time = timeline.total; setPlaying(false); }
  setTime(time);
  if (playing) requestAnimationFrame(loop);
}
function setPlaying(on) {
  playing = on;
  $('#btnPlay').classList.toggle('on', on);
  $('#btnPlay').setAttribute('aria-pressed', on);
}
function togglePlay() {
  if (!timeline || exporting) return;
  setPlaying(!playing);
  if (playing) {
    if (t >= timeline.total - 1e-3) t = 0;
    t0 = performance.now() - t * 1000;
    requestAnimationFrame(loop);
  }
}

/** Перемотать превью к точке: к галерее, к прибытию или проиграть подъезд. */
function focusPoint(id, how) {
  if (!trip || !timeline || exporting) return;
  const i = trip.stops.findIndex((s) => s.id === id);
  if (i < 0) return;
  if (playing && how !== 'play') return;
  const arrive = timeline.stopTimes[i];
  const hold = timeline.holdOf(i);
  setPlaying(false);
  if (how === 'play') {
    setTime(Math.max(0, arrive - 2.5));
    togglePlay();
  } else if (hold && trip.stops[i].photos.length) {
    setTime(hold.t0 + Math.min(hold.dur / 2, 1.3 + +cfg.photoTime / 2));
  } else {
    setTime(hold ? hold.t0 + hold.dur / 2 : arrive + 0.7);
  }
}

// ---------- метки остановок на полосе прокрутки ----------
function renderMarks() {
  const box = $('#marks');
  box.textContent = '';
  if (!trip || !timeline) return;
  trip.stops.forEach((s, i) => {
    if (s.marker === 'hidden' && !s.photos.length) return;
    const hold = timeline.holdOf(i);
    const b = document.createElement('button');
    b.className = 'mark' + (s.photos.length ? ' photos' : '');
    b.style.left = `${(100 * timeline.stopTimes[i]) / timeline.total}%`;
    b.style.setProperty('--c', s.color);
    b.style.setProperty('--w', `${(100 * (hold?.dur || 0)) / timeline.total}%`);
    b.title = s.name;
    b.innerHTML = `<span class="mark-span"></span><span class="mark-dot">${s.emoji}</span>`;
    b.addEventListener('click', () => focusPoint(s.id, 'stop'));
    box.append(b);
  });
}

function updateFooter() {
  const total = timeline ? fmtDur(timeline.total) : '0:00';
  $('#footDur').textContent = total;
  $('#durTotal').textContent = total;
  $('#footSize').textContent = `${size.W}×${size.H} · ${cfg.fps} fps`;
}

function updateOdoHint() {
  const el = $('#odoHint');
  if (!trip) { el.textContent = ''; return; }
  const start = Math.max(0, +cfg.kmStart || 0);
  const fmt = new Intl.NumberFormat(locale());
  el.textContent = tr('odo.preview', { from: fmt.format(Math.round(start)), to: fmt.format(Math.round(start + trip.line.length)) });
}

// ---------- экспорт ----------
let cancelExport = false;
async function doExport() {
  if (!trip || !timeline || exporting) return;
  exporting = true;
  setPlaying(false);
  cancelExport = false;
  document.body.classList.add('exporting');
  const ui = $('#exportProgress');
  ui.hidden = false;
  $('#btnCancelExport').hidden = false;
  $('#btnExport').disabled = true;
  $('#exportBar').style.width = '0%';
  const fps = +cfg.fps;
  const frames = Math.ceil(timeline.total * fps) + 1;
  const off = document.createElement('canvas');
  off.width = size.W; off.height = size.H;
  const octx = off.getContext('2d');
  const mapCanvas = scene.map.getCanvas();
  const started = performance.now();
  try {
    await Promise.all([Photos.loadAll(allPhotoIds()), loadFonts()]);
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
    $('#btnCancelExport').hidden = true;
    document.body.classList.remove('exporting');
    $('#btnExport').disabled = false;
  }
}

function loadFonts() {
  return Promise.all([
    document.fonts.load('700 40px Caveat'),
    document.fonts.load('600 40px Caveat'),
    document.fonts.ready,
  ]).catch(() => {});
}

// ---------- редактор точек ----------
let liveTimer = 0;
const editor = new PointsEditor({
  list: $('#points'),
  getPoints: () => cfg.points,
  holdHint: (p, i, n) => (i < 0 ? holdFor(p, 1, 3) : holdFor(p, i, n)),
  onFocus: focusPoint,
  onChange: (kind) => {
    saveCfg();
    if (kind === 'geo') {
      editor.setLegs(legsById());
      requestRoute();
    } else if (kind === 'live') {
      clearTimeout(liveTimer);
      liveTimer = setTimeout(() => refreshStops(), 60);
    } else {
      refreshStops();
    }
  },
});

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
function bindRadio(name, key, onChange) {
  for (const el of $$(`input[name="${name}"]`)) {
    el.checked = el.value === String(cfg[key]);
    el.addEventListener('change', () => {
      if (!el.checked) return;
      cfg[key] = el.value;
      saveCfg();
      onChange?.(el.value);
    });
  }
}

const rerender = () => render(t);
bind('title', 'title', rerender);
bind('subtitle', 'subtitle', rerender);
bindRadio('format', 'format', () => { applySize(); rerender(); });
bind('res', 'res', () => { applySize(); rerender(); });
bind('fps', 'fps', updateFooter);
bind('bitrate', 'bitrate');
bind('kmStart', 'kmStart', () => { updateOdoHint(); rerender(); });
bind('showTotal', 'showTotal', rerender);
bindRadio('galleryStyle', 'galleryStyle', rerender);
bind('photoTime', 'photoTime', () => { refreshStops(); editor.render(); });
for (const k of ['drive', 'intro', 'outro', 'hold']) bind(k, k, () => refreshStops());
for (const k of ['mode', 'zoom', 'pitch', 'carOffset']) bind(k, k, rerender);
bind('style', 'style', async (v) => { await scene.setStyle(v); rerender(); });
bind('hillshade', 'hillshade', (v) => scene.setOptions({ hillshade: v }).then(rerender));
bind('terrain', 'terrain', (v) => scene.setOptions({ terrain: v }).then(rerender));
bind('terrainScale', 'terrainScale', (v) => scene.setOptions({ terrainScale: +v }).then(rerender));
bind('routeColor', 'routeColor', (v) => { document.body.style.setProperty('--route', v); scene.setOptions({ routeColor: v }).then(rerender); });
bind('carColor', 'carColor', (v) => scene.setOptions({ carColor: v }).then(rerender));
bind('carSize', 'carSize', (v) => scene.setOptions({ carSize: +v }).then(rerender));
bind('car3d', 'car3d', (v) => scene.setOptions({ car3d: v }).then(rerender));
document.body.style.setProperty('--route', cfg.routeColor);
$('#carFile').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const bmp = await createImageBitmap(f);
  await scene.setOptions({ customCar: bmp });
  rerender();
});

$('#btnAddPoint').addEventListener('click', () => editor.addPoint());
$('#btnPlay').addEventListener('click', togglePlay);
$('#btnExport').addEventListener('click', doExport);
$('#btnCancelExport').addEventListener('click', () => { cancelExport = true; });
$('#scrub').addEventListener('input', (e) => { setPlaying(false); setTime(+e.target.value); });
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName)) { e.preventDefault(); togglePlay(); }
});
$('#stage').addEventListener('click', () => { if (!exporting) togglePlay(); });

// Вкладки панели
function selectTab(name) {
  if (!$(`.tab[data-tab="${name}"]`)) name = 'route';
  for (const b of $$('.tab')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
  for (const p of $$('.pane')) p.hidden = p.dataset.pane !== name;
  try { localStorage.setItem('ta.tab', name); } catch {}
}
for (const b of $$('.tab')) b.addEventListener('click', () => selectTab(b.dataset.tab));
selectTab((() => { try { return localStorage.getItem('ta.tab'); } catch { return null; } })() || 'route');

// Вставка списком: старый текстовый формат, фото и оформление совпавших по названию точек сохраняются.
const pointsToText = () => cfg.points.filter(isActivePoint).map((p) => {
  let s = p.name;
  if (p.manual && p.lngLat) s += ` @ ${+p.lngLat[1].toFixed(5)}, ${+p.lngLat[0].toFixed(5)}`;
  if (p.type) s += ` #${lang === 'ru' ? STOP_TYPES[p.type].words[0] : p.type}`;
  if (p.hold != null) s += ` ~${p.hold}`;
  return s;
}).join('\n');
$('#btnImport').addEventListener('click', () => {
  const box = $('#importBox');
  box.hidden = !box.hidden;
  if (!box.hidden) { $('#importText').value = pointsToText(); $('#importText').focus(); }
});
$('#btnImportCancel').addEventListener('click', () => { $('#importBox').hidden = true; });
$('#btnImportApply').addEventListener('click', () => {
  const wps = parseWaypoints($('#importText').value);
  const pool = [...cfg.points];
  const next = wps.map((w) => {
    const k = pool.findIndex((p) => p.name.toLowerCase() === w.name.toLowerCase());
    const old = k >= 0 ? pool.splice(k, 1)[0] : null;
    const p = old || normalizePoint({ name: w.name });
    if (w.type) p.type = w.type;
    if (w.hold != null) p.hold = w.hold;
    if (w.lngLat) { p.lngLat = w.lngLat; p.manual = true; }
    return p;
  });
  const dropped = pool.flatMap((p) => p.photos);
  if (dropped.length) Photos.remove(dropped);
  cfg.points = next;
  saveCfg();
  $('#importBox').hidden = true;
  editor.openId = null;
  editor.render();
  requestRoute();
});

// ---------- язык ----------
$('#lang').value = lang;
$('#lang').addEventListener('change', (e) => {
  const next = e.target.value;
  const prev = lang;
  if (next === prev) return;
  // Значения по умолчанию переводим вместе с интерфейсом, пользовательские не трогаем.
  const swap = (key, cfgKey) => { if (cfg[cfgKey].trim() === tIn(prev, key).trim()) cfg[cfgKey] = tIn(next, key); };
  swap('default.title', 'title');
  swap('default.subtitle', 'subtitle');
  for (const p of cfg.points) {
    const k = SAMPLE_KEYS.findIndex((key) => p.name === tIn(prev, key));
    if (k >= 0 && p.lngLat && p.lngLat.every((v, j) => Math.abs(v - SAMPLE_COORDS[k][j]) < 1e-6)) {
      p.name = tIn(next, SAMPLE_KEYS[k]);
      p.found = '';
    }
  }
  setLang(next);
  saveCfg();
  applyDom();
  $('#title').value = cfg.title;
  $('#subtitle').value = cfg.subtitle;
  scene.setLang(next);
  scene.resetFlags();
  editor.render();
  updateRouteInfo();
  refreshStops();
});

// ---------- старт ----------
applySize();
editor.render();
setInfo(tr('status.loading'), 'busy');
Photos.collectGarbage(allPhotoIds());
Photos.loadAll(allPhotoIds()).then(() => { editor.render(); rerender(); }).catch((e) => console.warn(e));
loadFonts().then(() => {
  if (scene.map.getLayer('stop-icon')) scene.resetFlags();
  rerender();
});
scene.ready.then(requestRoute);

window.__app = {
  get cfg() { return cfg; }, get trip() { return trip; }, get timeline() { return timeline; }, get editor() { return editor; },
  scene, setTime, render, doExport, requestRoute, refreshStops, focusPoint, Photos,
};
