// Сцена MapLibre: стиль OpenFreeMap, русские подписи, рельеф, слои маршрута, остановок и машины.
import { STOP_TYPES } from './route.js';

export const STYLES = {
  liberty: 'https://tiles.openfreemap.org/styles/liberty',
  bright: 'https://tiles.openfreemap.org/styles/bright',
  positron: 'https://tiles.openfreemap.org/styles/positron',
  fiord: 'https://tiles.openfreemap.org/styles/fiord',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};
const DARK_STYLES = new Set(['fiord', 'dark']);
const DEM_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

// Флажок остановки: точка привязки — основание ножки (в CSS-пикселях от левого нижнего угла картинки).
// Значок без подписи привязан серединой низа.
const FLAG_BASE_X = 8;
const FLAG_BASE_Y = 6;
export const BADGE_STEM = 44;
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

const EMPTY_LINE = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } };
const EMPTY_FC = { type: 'FeatureCollection', features: [] };

function shade(hex, k) {
  // затемнить (k<1) или осветлить (k>1) цвет #rrggbb
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}

/** Компактный хэтчбек вид сверху, нос вверх. 84×190. */
function carSvg(color) {
  const dark = shade(color, 0.55), light = shade(color, 1.25), outline = '#0a0f1f';
  const glass = '#8fa4b8', glassDark = '#5c6f82';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="84" height="190" viewBox="0 0 84 190">
  <defs>
    <filter id="s" x="-40%" y="-20%" width="180%" height="140%"><feGaussianBlur stdDeviation="4"/></filter>
    <linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="${light}"/><stop offset=".5" stop-color="${color}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
    <linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${glass}"/><stop offset="1" stop-color="${glassDark}"/></linearGradient>
  </defs>
  <ellipse cx="46" cy="98" rx="30" ry="80" fill="rgba(0,0,0,.4)" filter="url(#s)"/>
  <!-- колёса -->
  <rect x="6" y="34" width="11" height="26" rx="4" fill="#111"/><rect x="67" y="34" width="11" height="26" rx="4" fill="#111"/>
  <rect x="6" y="128" width="11" height="26" rx="4" fill="#111"/><rect x="67" y="128" width="11" height="26" rx="4" fill="#111"/>
  <!-- кузов -->
  <path d="M22 8 Q42 3 62 8 Q74 12 75 30 L77 96 L77 160 Q76 180 62 183 Q42 187 22 183 Q8 180 7 160 L7 96 L9 30 Q10 12 22 8 Z" fill="url(#g)" stroke="${outline}" stroke-width="2.2" stroke-linejoin="round"/>
  <!-- чёрный пластик арок (кроссовер) -->
  <path d="M9 30 Q9 26 13 26 L15 26 Q17 26 17 30 L17 62 Q17 65 14 65 L12 65 Q9 65 9 62 Z" fill="#161616" opacity=".9"/>
  <path d="M67 30 Q67 26 71 26 L73 26 Q75 26 75 30 L75 62 Q75 65 72 65 L70 65 Q67 65 67 62 Z" fill="#161616" opacity=".9"/>
  <path d="M8 124 Q8 120 12 120 L14 120 Q17 120 17 124 L17 158 Q17 161 14 161 L12 161 Q8 161 8 158 Z" fill="#161616" opacity=".9"/>
  <path d="M67 124 Q67 120 70 120 L72 120 Q76 120 76 124 L76 158 Q76 161 72 161 L70 161 Q67 161 67 158 Z" fill="#161616" opacity=".9"/>
  <!-- фары и решётка -->
  <path d="M14 14 Q22 9 32 10 L30 20 Q20 21 14 24 Z" fill="#f5f2d8"/><path d="M70 14 Q62 9 52 10 L54 20 Q64 21 70 24 Z" fill="#f5f2d8"/>
  <rect x="34" y="9" width="16" height="6" rx="2" fill="#1a1a1a"/><rect x="26" y="20" width="32" height="3" rx="1.5" fill="${outline}" opacity=".5"/>
  <!-- капот -->
  <path d="M18 27 Q42 22 66 27 L64 58 Q42 54 20 58 Z" fill="${color}" opacity=".35"/>
  <line x1="42" y1="24" x2="42" y2="56" stroke="${dark}" stroke-width="1.2" opacity=".6"/>
  <!-- лобовое стекло -->
  <path d="M19 60 Q42 55 65 60 L68 82 Q42 78 16 82 Z" fill="url(#w)" stroke="${outline}" stroke-width="1.4"/>
  <path d="M24 78 Q34 72 46 74" stroke="#2b3a48" stroke-width="1.4" fill="none" opacity=".7"/>
  <!-- крыша с рейлингами -->
  <path d="M16 82 Q42 78 68 82 L69 140 Q42 143 15 140 Z" fill="${color}"/>
  <rect x="17" y="86" width="3.5" height="52" rx="1.7" fill="#d5dbe3" stroke="#7d8793" stroke-width=".8"/>
  <rect x="63.5" y="86" width="3.5" height="52" rx="1.7" fill="#d5dbe3" stroke="#7d8793" stroke-width=".8"/>
  <line x1="32" y1="88" x2="32" y2="136" stroke="${dark}" stroke-width="1" opacity=".5"/><line x1="52" y1="88" x2="52" y2="136" stroke="${dark}" stroke-width="1" opacity=".5"/>
  <!-- боковые стёкла -->
  <path d="M11 84 L14 82 L15 138 L11 136 Z" fill="${glassDark}" opacity=".8"/><path d="M73 84 L70 82 L69 138 L73 136 Z" fill="${glassDark}" opacity=".8"/>
  <!-- заднее стекло и спойлер -->
  <path d="M15 140 Q42 143 69 140 L67 160 Q42 163 17 160 Z" fill="url(#w)" stroke="${outline}" stroke-width="1.4"/>
  <path d="M15 138 Q42 141 69 138 L69 143 Q42 146 15 143 Z" fill="${dark}"/>
  <!-- задние фонари -->
  <path d="M9 160 L20 163 L19 176 L9 172 Z" fill="#e0342b"/><path d="M75 160 L64 163 L65 176 L75 172 Z" fill="#e0342b"/>
  <rect x="13" y="164" width="5" height="4" rx="1" fill="#fff" opacity=".85"/><rect x="66" y="164" width="5" height="4" rx="1" fill="#fff" opacity=".85"/>
  <rect x="34" y="170" width="16" height="5" rx="1.5" fill="#e8ecf0" stroke="${outline}" stroke-width=".8"/>
  <!-- зеркала -->
  <path d="M2 64 Q2 60 6 60 L10 62 L10 70 L6 70 Q2 70 2 66 Z" fill="${color}" stroke="${outline}" stroke-width="1.2"/>
  <path d="M82 64 Q82 60 78 60 L74 62 L74 70 L78 70 Q82 70 82 66 Z" fill="${color}" stroke="${outline}" stroke-width="1.2"/>
</svg>`;
}

async function svgToCanvas(svg, scale) {
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width * scale;
  c.height = img.height * scale;
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}

function pickFont(style) {
  let bold = null, regular = null;
  for (const l of style.layers) {
    let f = l.layout?.['text-font'];
    if (!Array.isArray(f)) continue;
    if (f[0] === 'literal') f = f[1];
    if (!Array.isArray(f)) continue;
    for (const name of f) {
      if (typeof name !== 'string') continue;
      if (/bold/i.test(name)) bold ||= name; else regular ||= name;
    }
  }
  return bold || regular || 'Noto Sans Regular';
}

export class Scene {
  constructor(container, opts) {
    this.opts = {
      style: 'liberty', pixelRatio: 2, hillshade: true, terrain: true, terrainScale: 2,
      routeColor: '#ff3b30', carColor: '#1f2f6e', carSize: 0.9, customCar: null, car3d: true, lang: 'en',
      ...opts,
    };
    this.map = new maplibregl.Map({
      container,
      style: STYLES[this.opts.style],
      pixelRatio: this.opts.pixelRatio,
      canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
      preserveDrawingBuffer: true,
      antialias: true,
      fadeDuration: 0,
      interactive: false,
      attributionControl: false,
      renderWorldCopies: false,
      maxPitch: 75,
      center: [40, 50],
      zoom: 5,
    });
    this.line = null;
    this._lastD = -1;
    this._lastStopsKey = '';
    this._built = deferred();
    this.map.on('style.load', () => {
      this._build().then(() => this._built.resolve()).catch((e) => { console.error('scene build', e); this._built.resolve(); });
    });
    this.ready = new Promise((res) => this.map.once('load', res)).then(() => this.whenBuilt());
  }

  whenBuilt() {
    return this._built.promise;
  }

  get isDark() { return DARK_STYLES.has(this.opts.style); }

  async _build() {
    const map = this.map;
    const style = map.getStyle();
    this._localize(style);
    const firstSymbol = style.layers.find((l) => l.type === 'symbol')?.id;
    const waterFill = style.layers.find((l) => l.type === 'fill' && /water/i.test(l.id))?.id;
    const firstLine = style.layers.find((l) => l.type === 'line')?.id;
    this._font = pickFont(style);
    const dark = this.isDark;

    const dem = { type: 'raster-dem', tiles: [DEM_TILES], tileSize: 256, encoding: 'terrarium', maxzoom: 15, attribution: 'Terrain: AWS Open Data / Mapzen' };
    map.addSource('dem', dem);            // для 3D-рельефа
    map.addSource('dem-shade', dem);      // отдельный источник для теней: MapLibre просит не делить один
    map.addLayer({
      id: 'hillshade', type: 'hillshade', source: 'dem-shade',
      layout: { visibility: this.opts.hillshade ? 'visible' : 'none' },
      paint: {
        'hillshade-exaggeration': dark ? 0.45 : 0.32,
        'hillshade-shadow-color': dark ? '#000' : '#3f3f46',
        'hillshade-highlight-color': dark ? '#9ca3af' : '#ffffff',
        'hillshade-accent-color': dark ? '#000' : '#52525b',
      },
    }, waterFill || firstLine || firstSymbol);
    this._applyTerrain();
    this._applySky();

    map.addSource('route-full', { type: 'geojson', data: EMPTY_LINE });
    map.addSource('route-done', { type: 'geojson', data: EMPTY_LINE });
    map.addSource('stops', { type: 'geojson', data: EMPTY_FC });
    map.addSource('car', { type: 'geojson', data: EMPTY_FC });

    const roundLine = { 'line-cap': 'round', 'line-join': 'round' };
    map.addLayer({
      id: 'route-ahead', type: 'line', source: 'route-full', layout: roundLine,
      paint: { 'line-color': dark ? '#e2e8f0' : '#1f2937', 'line-opacity': 0.55, 'line-width': 3, 'line-dasharray': [1.2, 2] },
    }, firstSymbol);
    map.addLayer({
      id: 'route-glow', type: 'line', source: 'route-done', layout: roundLine,
      paint: { 'line-color': this.opts.routeColor, 'line-opacity': 0.28, 'line-width': 16, 'line-blur': 8 },
    }, firstSymbol);
    map.addLayer({
      id: 'route-casing', type: 'line', source: 'route-done', layout: roundLine,
      paint: { 'line-color': '#ffffff', 'line-opacity': 0.95, 'line-width': 8 },
    }, firstSymbol);
    map.addLayer({
      id: 'route-line', type: 'line', source: 'route-done', layout: roundLine,
      paint: { 'line-color': this.opts.routeColor, 'line-width': 5 },
    }, firstSymbol);

    const isBadge = ['==', ['get', 'marker'], 'badge'];
    map.addLayer({
      id: 'stop-icon', type: 'symbol', source: 'stops', filter: ['>', ['get', 'scale'], 0],
      layout: {
        'icon-image': ['get', 'icon'], 'icon-size': ['get', 'scale'],
        'icon-anchor': ['case', isBadge, 'bottom', 'bottom-left'],
        'icon-offset': ['case', isBadge, ['literal', [0, 7]], ['literal', [-FLAG_BASE_X, FLAG_BASE_Y]]],
        'icon-allow-overlap': true, 'icon-ignore-placement': true,
      },
    });

    await this._ensureCarImage();
    map.addLayer({
      id: 'car', type: 'symbol', source: 'car',
      layout: {
        'icon-image': 'trip-car', 'icon-size': this.opts.carSize, 'icon-rotate': ['get', 'bearing'],
        'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map',
        'icon-allow-overlap': true, 'icon-ignore-placement': true,
      },
    });

    if (this.line) this._pushRoute();
    this._lastD = -1;
    this._lastStopsKey = '';
    this.car3d = null; // custom-слой пропадает при смене стиля
    if (this.opts.car3d) await this.setCar3d(true);
  }

  /**
   * Маркер остановки: флажок (ножка на точке, табличка с эмодзи и названием) или круглый значок.
   * Возвращает имя картинки в стиле карты, создаёт её при первом обращении.
   */
  _flagImage(stop) {
    const base = STOP_TYPES[stop.type] || STOP_TYPES.place;
    const t = { emoji: stop.emoji || base.emoji, color: stop.color || base.color };
    const name = ['flag', stop.marker || 'flag', t.emoji, t.color, stop.name].join('|');
    if (this.map.hasImage(name)) return name;
    if (stop.marker === 'badge') return this._badgeImage(name, t);
    const S = 2;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    const nameFont = `600 ${13 * S}px Inter, -apple-system, "Segoe UI", sans-serif`;
    ctx.font = nameFont;
    const tw = ctx.measureText(stop.name).width;
    const padX = 9 * S, emojiW = 20 * S, bannerH = 30 * S;
    const bannerW = padX + emojiW + 5 * S + tw + padX;
    const poleX = (FLAG_BASE_X - 1.5) * S, poleW = 3 * S, poleH = 74 * S;
    const margin = 8 * S;
    c.width = Math.ceil(poleX + bannerW + margin);
    c.height = Math.ceil(margin + poleH + FLAG_BASE_Y * S);
    const baseY = c.height - FLAG_BASE_Y * S;
    const bannerY = margin;
    // ножка
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(poleX, bannerY + bannerH / 2, poleW, baseY - bannerY - bannerH / 2);
    // табличка с тенью
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.35)';
    ctx.shadowBlur = 6 * S;
    ctx.shadowOffsetY = 2 * S;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(poleX, bannerY, bannerW, bannerH, 8 * S);
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 2.5 * S;
    ctx.strokeStyle = t.color;
    ctx.beginPath();
    ctx.roundRect(poleX, bannerY, bannerW, bannerH, 8 * S);
    ctx.stroke();
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = `${17 * S}px ${EMOJI_FONT}`;
    ctx.fillText(t.emoji, poleX + padX, bannerY + bannerH / 2 + 1 * S);
    ctx.font = nameFont;
    ctx.fillStyle = '#111827';
    ctx.fillText(stop.name, poleX + padX + emojiW + 5 * S, bannerY + bannerH / 2 + 1 * S);
    // основание
    ctx.beginPath();
    ctx.arc(poleX + poleW / 2, baseY, 5 * S, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2.5 * S;
    ctx.strokeStyle = t.color;
    ctx.stroke();
    this.map.addImage(name, ctx.getImageData(0, 0, c.width, c.height), { pixelRatio: S });
    return name;
  }

  /** Круглый значок с эмодзи на тонкой ножке (чтобы не прятался под машиной), основание — середина низа. */
  _badgeImage(name, t) {
    const S = 2, R = 17 * S, ring = 3 * S, tail = 9 * S, margin = 6 * S, stem = BADGE_STEM * S, base = 5 * S;
    const c = document.createElement('canvas');
    c.width = 2 * (R + margin);
    c.height = margin + 2 * R + stem + base + 2 * S;
    const ctx = c.getContext('2d');
    const cx = c.width / 2, cy = margin + R;
    const baseY = c.height - base - 2 * S;
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(cx - 1.5 * S, cy + R, 3 * S, baseY - cy - R);
    ctx.beginPath();
    ctx.arc(cx, baseY, 4.5 * S, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = 2.5 * S;
    ctx.strokeStyle = t.color;
    ctx.stroke();
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.35)';
    ctx.shadowBlur = 5 * S;
    ctx.shadowOffsetY = 2 * S;
    ctx.fillStyle = t.color;
    ctx.beginPath();
    ctx.moveTo(cx - 7 * S, cy + R - 4 * S);
    ctx.lineTo(cx, cy + R + tail);
    ctx.lineTo(cx + 7 * S, cy + R - 4 * S);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, R - ring, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${18 * S}px ${EMOJI_FONT}`;
    ctx.fillText(t.emoji, cx, cy + 1 * S);
    this.map.addImage(name, ctx.getImageData(0, 0, c.width, c.height), { pixelRatio: S });
    return name;
  }

  /** Сбросить кеш флажков (после загрузки шрифтов или смены маршрута). */
  resetFlags() {
    const imgs = this.map.listImages ? this.map.listImages() : [];
    for (const id of imgs) if (id.startsWith('flag|')) this.map.removeImage(id);
    this._lastStopsKey = '';
  }

  /** Объёмная машинка (three.js) вместо плоской иконки. */
  async setCar3d(enabled) {
    this.opts.car3d = enabled;
    const map = this.map;
    if (enabled) {
      try {
        if (!this._Car3DLayer) this._Car3DLayer = (await import('./car3d.js')).Car3DLayer;
      } catch (e) {
        console.warn('three.js не загрузился, остаёмся с плоской иконкой', e);
        this.opts.car3d = false;
        return;
      }
      if (!map.getLayer('car-3d')) {
        this.car3d = new this._Car3DLayer({ color: this.opts.carColor, sizePx: 60 * this.opts.carSize });
        map.addLayer(this.car3d);
      }
      if (this._carState) this.car3d.setState(...this._carState);
      if (map.getLayer('car')) map.setLayoutProperty('car', 'visibility', 'none');
    } else {
      if (map.getLayer('car-3d')) map.removeLayer('car-3d');
      this.car3d = null;
      if (map.getLayer('car')) map.setLayoutProperty('car', 'visibility', 'visible');
    }
    map.triggerRepaint();
  }

  _applyTerrain() {
    this.map.setTerrain(this.opts.terrain ? { source: 'dem', exaggeration: +this.opts.terrainScale } : null);
  }

  /** Небо и дымка у горизонта — видны при сильном наклоне камеры. */
  _applySky() {
    const dark = this.isDark;
    try {
      this.map.setSky({
        'sky-color': dark ? '#0b1a33' : '#8fc3f7',
        'horizon-color': dark ? '#1c2a44' : '#dbeafe',
        'fog-color': dark ? '#0f172a' : '#eef2f7',
        'fog-ground-blend': 0.55,
        'horizon-fog-blend': 0.7,
        'sky-horizon-blend': 0.75,
        'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 10, 1, 13, 0],
      });
    } catch (e) {
      console.warn('sky unsupported', e);
    }
  }

  _localize(style) {
    for (const l of style.layers) {
      if (l.type !== 'symbol') continue;
      const tf = l.layout?.['text-field'];
      if (!tf || !/name/.test(JSON.stringify(tf))) continue;
      this.map.setLayoutProperty(l.id, 'text-field', ['coalesce', ['get', 'name:' + this.opts.lang], ['get', 'name']]);
    }
  }

  /** Язык подписей на карте (name:ru / name:en с откатом на местное название). */
  setLang(lang) {
    this.opts.lang = lang;
    if (this.map.isStyleLoaded()) this._localize(this.map.getStyle());
  }

  async _ensureCarImage() {
    const canvas = this.opts.customCar || (await svgToCanvas(carSvg(this.opts.carColor), 2));
    const img = this.opts.customCar ? canvas : canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    if (this.map.hasImage('trip-car')) this.map.removeImage('trip-car');
    this.map.addImage('trip-car', img, { pixelRatio: this.opts.customCar ? 2 : 4 });
  }

  /** Ждём, пока карта дорисует текущее состояние (тайлы, глифы, символы). */
  idle(timeoutMs = 8000) {
    return new Promise((res) => {
      let done = false;
      const t = setTimeout(() => { if (!done) { done = true; res(false); } }, timeoutMs);
      this.map.once('idle', () => { if (!done) { done = true; clearTimeout(t); res(true); } });
      this.map.triggerRepaint();
    });
  }

  setRoute(line) {
    this.line = line;
    this._lastD = -1;
    if (this.map.getSource('route-full')) this._pushRoute();
  }

  _pushRoute() {
    this.map.getSource('route-full').setData({
      type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: this.line.coords },
    });
  }

  /**
   * Применить кадр. stops: [{name, lngLat, type, marker, emoji, color, scale}] — scale 0 скрывает остановку.
   */
  update(cam, d, car, carBearing, stops) {
    const map = this.map;
    map.jumpTo({ center: cam.center, zoom: cam.zoom, bearing: cam.bearing, pitch: cam.pitch });
    if (this.line && d !== this._lastD) {
      map.getSource('route-done').setData({
        type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: this.line.sliceTo(d) },
      });
      this._lastD = d;
    }
    this._carState = [car, carBearing];
    if (this.car3d) this.car3d.setState(car, carBearing);
    map.getSource('car').setData({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { bearing: carBearing }, geometry: { type: 'Point', coordinates: car } }],
    });
    const shown = stops.filter((s) => s.marker !== 'hidden');
    const key = shown.map((s) => [s.scale.toFixed(3), s.type, s.name, s.marker, s.emoji, s.color, s.lngLat].join(':')).join(',');
    if (key !== this._lastStopsKey) {
      map.getSource('stops').setData({
        type: 'FeatureCollection',
        features: shown.map((s) => ({
          type: 'Feature',
          properties: { name: s.name, scale: s.scale, marker: s.marker || 'flag', icon: this._flagImage(s) },
          geometry: { type: 'Point', coordinates: s.lngLat },
        })),
      });
      this._lastStopsKey = key;
    }
  }

  /** Смена стиля: перезагружает базовую карту и пересобирает слои. */
  setStyle(name) {
    this.opts.style = name;
    this._built = deferred();
    this.map.setStyle(STYLES[name]);
    return this.whenBuilt();
  }

  async setOptions(patch) {
    Object.assign(this.opts, patch);
    const map = this.map;
    if (!map.getLayer('route-line')) return;
    if ('hillshade' in patch) map.setLayoutProperty('hillshade', 'visibility', patch.hillshade ? 'visible' : 'none');
    if ('terrain' in patch || 'terrainScale' in patch) this._applyTerrain();
    if ('routeColor' in patch) {
      for (const id of ['route-glow', 'route-line']) map.setPaintProperty(id, 'line-color', patch.routeColor);
    }
    if ('car3d' in patch) await this.setCar3d(patch.car3d);
    if ('carSize' in patch) {
      map.setLayoutProperty('car', 'icon-size', patch.carSize);
      if (this.car3d) { this.car3d.sizePx = 60 * patch.carSize; map.triggerRepaint(); }
    }
    if ('carColor' in patch && this.car3d) { this.car3d.setColor(patch.carColor); map.triggerRepaint(); }
    if ('carColor' in patch || 'customCar' in patch) {
      map.removeLayer('car');
      await this._ensureCarImage();
      map.addLayer({
        id: 'car', type: 'symbol', source: 'car',
        layout: {
          'icon-image': 'trip-car', 'icon-size': this.opts.carSize, 'icon-rotate': ['get', 'bearing'],
          'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map',
          'icon-allow-overlap': true, 'icon-ignore-placement': true,
          visibility: this.car3d ? 'none' : 'visible',
        },
      }, this.car3d ? 'car-3d' : undefined);
    }
  }

  resize(cssW, cssH, pixelRatio) {
    const el = this.map.getContainer();
    el.style.width = cssW + 'px';
    el.style.height = cssH + 'px';
    if (pixelRatio !== this.opts.pixelRatio) {
      this.opts.pixelRatio = pixelRatio;
      this.map.setPixelRatio(pixelRatio);
    }
    this.map.resize();
  }
}
