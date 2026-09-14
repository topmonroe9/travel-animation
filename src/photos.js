// Фотографии точек: уменьшенные копии в IndexedDB, декодированные картинки — в памяти.
// Оригиналы не хранятся: 2400 px по длинной стороне хватает на кадр 4K.
import { t } from './i18n.js';

const DB_NAME = 'travel-animation';
const STORE = 'photos';
const MAX_SIDE = 2400;
const THUMB_SIDE = 320;
const HEIC_LIB = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';

const images = new Map(); // id → { bmp, w, h }
const thumbs = new Map(); // id → object URL

let dbPromise = null;
function db() {
  dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function store(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
const isHeic = (f) => /image\/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name || '');

let heicPromise = null;
function loadHeicLib() {
  heicPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = HEIC_LIB;
    s.onload = () => (window.heic2any ? resolve(window.heic2any) : reject(new Error('heic2any')));
    s.onerror = () => { heicPromise = null; reject(new Error(t('err.heicLib'))); };
    document.head.append(s);
  });
  return heicPromise;
}

/** Декодировать файл во что-то, что умеет drawImage. HEIC — через браузер (Safari) или heic2any. */
async function decode(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch {}
  try { return await createImageBitmap(file); } catch {}
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return await createImageBitmap(img);
  } catch {} finally {
    URL.revokeObjectURL(url);
  }
  if (isHeic(file)) {
    const heic2any = await loadHeicLib();
    let out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    if (Array.isArray(out)) out = out[0];
    return createImageBitmap(out);
  }
  throw new Error(t('err.photo', { name: file.name }));
}

function canvasOf(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
const toBlob = (c, type, quality) =>
  c.convertToBlob ? c.convertToBlob({ type, quality }) : new Promise((r) => c.toBlob(r, type, quality));

async function resized(src, maxSide, quality) {
  const k = Math.min(1, maxSide / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * k));
  const h = Math.max(1, Math.round(src.height * k));
  const c = canvasOf(w, h);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return { canvas: c, w, h, blob: await toBlob(c, 'image/jpeg', quality) };
}

/** Импорт файлов: уменьшить, сохранить, держать готовыми к рисованию. Возвращает id по порядку. */
export async function importFiles(files, onEach = () => {}) {
  const ids = [];
  const errors = [];
  let i = 0;
  for (const file of files) {
    i++;
    if (!(file.type.startsWith('image/') || isHeic(file))) continue;
    try {
      const src = await decode(file);
      const big = await resized(src, MAX_SIDE, 0.9);
      const small = await resized(src, THUMB_SIDE, 0.8);
      src.close?.();
      const rec = { id: newId(), name: file.name, w: big.w, h: big.h, blob: big.blob, thumb: small.blob, added: Date.now() };
      await store('readwrite', (s) => s.put(rec));
      images.set(rec.id, { bmp: await createImageBitmap(big.canvas), w: big.w, h: big.h });
      thumbs.set(rec.id, URL.createObjectURL(small.blob));
      ids.push(rec.id);
    } catch (e) {
      console.warn('photo import', file.name, e);
      errors.push(e.message);
    }
    onEach(i, files.length);
  }
  return { ids, errors };
}

/** Подгрузить из базы то, чего ещё нет в памяти. */
export async function loadAll(ids) {
  const missing = [...new Set(ids)].filter((id) => !images.has(id));
  if (!missing.length) return;
  const recs = await store('readonly', (s) => {
    const out = [];
    for (const id of missing) {
      const r = s.get(id);
      r.onsuccess = () => { if (r.result) out.push(r.result); };
    }
    return { get result() { return out; } };
  });
  await Promise.all(recs.map(async (rec) => {
    try {
      images.set(rec.id, { bmp: await createImageBitmap(rec.blob), w: rec.w, h: rec.h });
      thumbs.set(rec.id, URL.createObjectURL(rec.thumb || rec.blob));
    } catch (e) {
      console.warn('photo load', rec.id, e);
    }
  }));
}

export const get = (id) => images.get(id) || null;
export const has = (id) => images.has(id);
export const thumbUrl = (id) => thumbs.get(id) || '';

export async function remove(ids) {
  for (const id of ids) {
    images.get(id)?.bmp.close?.();
    images.delete(id);
    if (thumbs.has(id)) URL.revokeObjectURL(thumbs.get(id));
    thumbs.delete(id);
  }
  try { await store('readwrite', (s) => { for (const id of ids) s.delete(id); }); } catch (e) { console.warn(e); }
}

/** Удалить из базы фото, на которые больше не ссылается ни одна точка. */
export async function collectGarbage(keepIds) {
  const keep = new Set(keepIds);
  try {
    const all = await store('readonly', (s) => s.getAllKeys());
    const orphans = (all || []).filter((id) => !keep.has(id));
    if (orphans.length) await remove(orphans);
  } catch (e) {
    console.warn('photo gc', e);
  }
}
