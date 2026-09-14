// Галерея фото на остановке: вылетает из флажка, листается и улетает обратно.
// Рисуется на HUD-канвасе, всё — функция времени s от начала паузы.
import { clamp, lerp } from './geo.js';
import { easeOutCubic, easeInCubic, easeInOutSine } from './timeline.js';

export const GALLERY_STYLES = ['stack', 'slides'];

// Секунды: машина остановилась → карточка вылетает → фото по очереди → улетает → машина трогается.
const LEAD = 0.35, ENTER = 0.6, EXIT = 0.55, TAIL = 0.3;
const OVERHEAD = LEAD + ENTER + EXIT + TAIL;
export const MIN_PER_PHOTO = 0.2;

export function galleryDuration(n, perPhoto) {
  return n > 0 ? OVERHEAD + n * perPhoto : 0;
}

/** Секунд на фото, чтобы вся галерея из n фото уложилась в total секунд (с вылетом и возвратом). */
export function galleryPerPhoto(n, total) {
  return Math.max(MIN_PER_PHOTO, (total - OVERHEAD) / Math.max(1, n));
}

/** Насколько галерея на экране в момент s (0…1) — для затемнения карты и титров. */
export function galleryPresence(s, n, perPhoto) {
  if (!n) return 0;
  const enter = clamp((s - LEAD) / ENTER, 0, 1);
  const exit = clamp((s - LEAD - ENTER - n * perPhoto) / EXIT, 0, 1);
  return easeInOutSine(Math.min(enter, 1 - exit));
}

const HAND = '"Caveat", "Segoe Print", "Bradley Hand", cursive';
const FONT = 'Inter, -apple-system, "Segoe UI", Roboto, sans-serif';

// Детерминированный «случай» для раскладки полароидов.
function rand(a, b) {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Нарисовать картинку с заполнением прямоугольника (обрезка по центру) и лёгким наездом. */
function drawCover(ctx, img, x, y, w, h, zoom = 1, panX = 0, panY = 0) {
  const k = Math.max(w / img.w, h / img.h) * zoom;
  const sw = w / k, sh = h / k;
  const sx = clamp((img.w - sw) / 2 + panX * (img.w - sw) / 2, 0, img.w - sw);
  const sy = clamp((img.h - sh) / 2 + panY * (img.h - sh) / 2, 0, img.h - sh);
  ctx.drawImage(img.bmp, sx, sy, sw, sh, x, y, w, h);
}

function fit(aspect, boxW, boxH) {
  return boxW / boxH > aspect ? [boxH * aspect, boxH] : [boxW, boxW / aspect];
}

/** Область под карточку в зависимости от формата кадра; size 1 — почти весь кадр. */
function layout(W, H, size = 0.9) {
  const a = W / H;
  const [kw, kh, cy] = a > 1.2 ? [0.92, 0.9, 0.49] : a < 0.8 ? [0.96, 0.8, 0.47] : [0.94, 0.9, 0.49];
  return { cx: W / 2, cy: H * cy, boxW: W * kw * size, boxH: H * kh * size };
}

/** Затемнение карты под галереей (рисуется до титров). */
export function drawGalleryBackdrop(ctx, W, H, presence) {
  if (presence <= 0) return;
  const g = ctx.createRadialGradient(W / 2, H * 0.48, Math.min(W, H) * 0.2, W / 2, H / 2, Math.hypot(W, H) * 0.62);
  g.addColorStop(0, `rgba(6,9,16,${0.38 * presence})`);
  g.addColorStop(1, `rgba(6,9,16,${0.72 * presence})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/**
 * @param {{photos:{bmp:ImageBitmap,w:number,h:number}[], s:number, perPhoto:number, style:string,
 *          name:string, emoji:string, color:string, anchor:[number,number]|null, seed:number, size:number}} g
 */
export function drawGallery(ctx, W, H, g) {
  const n = g.photos.length;
  if (!n) return;
  const s = g.s;
  const enter = clamp((s - LEAD) / ENTER, 0, 1);
  const showFrom = LEAD + ENTER;
  const exitAt = showFrom + n * g.perPhoto;
  const exit = clamp((s - exitAt) / EXIT, 0, 1);
  if (enter <= 0 || exit >= 1) return;

  const u = Math.min(W, H) / 1080;
  const L = layout(W, H, g.size);
  const anchor = g.anchor || [L.cx, H * 0.7];
  // Общий полёт: из флажка в центр и обратно.
  const fly = exit > 0 ? 1 - easeInCubic(exit) : easeOutCubic(enter);
  const scale = lerp(0.05, 1, fly);
  const alpha = clamp(fly * 2.2, 0, 1);
  const idx = clamp(Math.floor((s - showFrom) / g.perPhoto), 0, n - 1);
  const slotT = s - (showFrom + idx * g.perPhoto); // < 0 только для первого фото во время влёта

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(lerp(anchor[0], L.cx, fly), lerp(anchor[1], L.cy, fly));
  ctx.scale(scale, scale);
  if (g.style === 'slides') drawSlides(ctx, W, H, u, L, g, idx, slotT);
  else drawStack(ctx, W, H, u, L, g, idx, slotT);
  ctx.restore();
}

// ---------- полароиды стопкой ----------
function polaroidSize(img, L) {
  const a = img.w / img.h;
  // внешняя ширина OW: поля 5% по бокам и сверху, подпись снизу 17%
  const OW = Math.min(L.boxW * 0.94, L.boxH / (0.05 + 0.9 / a + 0.17));
  const b = OW * 0.05;
  const pw = OW - 2 * b;
  const ph = pw / a;
  return { OW, OH: b + ph + OW * 0.17, b, pw, ph };
}

function drawPolaroid(ctx, u, L, img, g, k, n) {
  const { OW, OH, b, pw, ph } = polaroidSize(img, L);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.45)';
  ctx.shadowBlur = 40 * u;
  ctx.shadowOffsetY = 14 * u;
  ctx.fillStyle = '#fbfaf6';
  roundRectPath(ctx, -OW / 2, -OH / 2, OW, OH, 5 * u);
  ctx.fill();
  ctx.restore();
  drawCover(ctx, img, -OW / 2 + b, -OH / 2 + b, pw, ph);
  ctx.strokeStyle = 'rgba(0,0,0,.08)';
  ctx.lineWidth = 1.5 * u;
  ctx.strokeRect(-OW / 2 + b, -OH / 2 + b, pw, ph);
  // подпись от руки
  const capH = OH - b - ph;
  const capY = OH / 2 - capH / 2;
  const size = Math.min(capH * 0.5, OW * 0.075);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#26262b';
  ctx.textAlign = 'left';
  ctx.font = `700 ${Math.round(size)}px ${HAND}`;
  const label = `${g.emoji} ${g.name}`.trim();
  const counter = n > 1 ? `${k + 1}/${n}` : '';
  let maxW = pw;
  if (counter) {
    ctx.save();
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(38,38,43,.55)';
    ctx.font = `600 ${Math.round(size * 0.78)}px ${HAND}`;
    ctx.fillText(counter, OW / 2 - b, capY);
    maxW -= ctx.measureText(counter).width + b;
    ctx.restore();
  }
  ctx.fillText(label, -OW / 2 + b, capY, maxW);
}

function drawStack(ctx, W, H, u, L, g, idx, slotT) {
  const n = g.photos.length;
  ctx.translate(-L.cx, -L.cy);
  for (let k = Math.max(0, idx - 3); k <= idx; k++) {
    const img = g.photos[k];
    const rot = ((rand(g.seed, k) * 2 - 1) * 6 * Math.PI) / 180;
    const dx = (rand(g.seed + 1, k) * 2 - 1) * L.boxW * 0.05;
    const dy = (rand(g.seed + 2, k) * 2 - 1) * L.boxH * 0.035;
    let sc = 1, extraRot = 0, a = 1;
    if (k === idx && k > 0) {
      // новое фото падает сверху на стопку; при быстром листании падение короче
      const d = easeOutCubic(clamp(slotT / Math.min(0.55, g.perPhoto * 0.7), 0, 1));
      sc = lerp(1.3, 1, d);
      extraRot = (1 - d) * (rand(g.seed + 3, k) > 0.5 ? 1 : -1) * 0.18;
      a = clamp(slotT / Math.min(0.16, g.perPhoto * 0.3), 0, 1);
    }
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.translate(L.cx + dx, L.cy + dy);
    ctx.rotate(rot + extraRot);
    ctx.scale(sc, sc);
    drawPolaroid(ctx, u, L, img, g, k, n);
    ctx.restore();
  }
}

// ---------- слайды ----------
function slideSize(img, L) {
  return fit(img.w / img.h, L.boxW, L.boxH * 0.93);
}

function drawSlides(ctx, W, H, u, L, g, idx, slotT) {
  const n = g.photos.length;
  const XF = Math.min(0.5, g.perPhoto * 0.4);
  const cur = g.photos[idx];
  const prev = idx > 0 ? g.photos[idx - 1] : null;
  const m = prev && slotT < XF ? easeInOutSine(clamp(slotT / XF, 0, 1)) : 1;
  const [cw, ch] = slideSize(cur, L);
  const [pw, ph] = prev ? slideSize(prev, L) : [cw, ch];
  const w = lerp(pw, cw, m), h = lerp(ph, ch, m);
  const r = 26 * u;
  const top = -h / 2 - L.boxH * 0.03;

  // тень и рамка
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.5)';
  ctx.shadowBlur = 50 * u;
  ctx.shadowOffsetY = 18 * u;
  ctx.fillStyle = '#fff';
  roundRectPath(ctx, -w / 2 - 5 * u, top - 5 * u, w + 10 * u, h + 10 * u, r + 5 * u);
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRectPath(ctx, -w / 2, top, w, h, r);
  ctx.clip();
  const kb = (k, local) => {
    const p = clamp(local / (g.perPhoto + XF), 0, 1);
    const dir = k % 2 ? -1 : 1;
    return [1.03 + 0.07 * p, dir * (p - 0.5) * 0.5, (rand(g.seed, k) - 0.5) * 0.4];
  };
  if (prev && m < 1) {
    const [z, px, py] = kb(idx - 1, g.perPhoto + slotT);
    drawCover(ctx, prev, -w / 2, top, w, h, z, px, py);
  }
  ctx.save();
  ctx.globalAlpha *= m;
  const [z, px, py] = kb(idx, Math.max(0, slotT));
  drawCover(ctx, cur, -w / 2, top, w, h, z, px, py);
  ctx.restore();
  // мягкий градиент сверху под плашку с названием
  const grad = ctx.createLinearGradient(0, top, 0, top + 150 * u);
  grad.addColorStop(0, 'rgba(0,0,0,.45)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(-w / 2, top, w, 150 * u);
  ctx.restore();

  // название остановки
  const fs = Math.round(30 * u);
  ctx.font = `700 ${fs}px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const label = `${g.emoji}  ${g.name}`.trim();
  const tw = Math.min(ctx.measureText(label).width, w - 90 * u);
  const chipH = 58 * u, chipX = -w / 2 + 22 * u, chipY = top + 22 * u;
  ctx.fillStyle = 'rgba(12,14,20,.62)';
  roundRectPath(ctx, chipX, chipY, tw + 44 * u, chipH, chipH / 2);
  ctx.fill();
  ctx.fillStyle = g.color;
  ctx.fillRect(chipX + 16 * u, chipY + chipH * 0.28, 5 * u, chipH * 0.44);
  ctx.fillStyle = '#fff';
  ctx.fillText(label, chipX + 30 * u, chipY + chipH / 2 + 1 * u, w - 110 * u);

  // точки-индикатор под карточкой, а если снизу нет места — на самой карточке
  if (n > 1) {
    const below = L.cy + top + h + 64 * u < H - 20 * u;
    const y = below ? top + h + 42 * u : top + h - 38 * u;
    if (n <= 14) {
      const dot = 14 * u, gap = 11 * u, wide = 44 * u;
      const total = n * dot + (n - 1) * gap + (wide - dot);
      if (!below) {
        ctx.fillStyle = 'rgba(12,14,20,.55)';
        roundRectPath(ctx, -total / 2 - 16 * u, y - dot / 2 - 10 * u, total + 32 * u, dot + 20 * u, dot / 2 + 10 * u);
        ctx.fill();
      }
      let x = -total / 2;
      for (let k = 0; k < n; k++) {
        const active = k === idx ? m : k === idx - 1 ? 1 - m : 0;
        const dw = lerp(dot, wide, active);
        ctx.fillStyle = active > 0.5 ? g.color : 'rgba(255,255,255,.7)';
        roundRectPath(ctx, x, y - dot / 2, dw, dot, dot / 2);
        ctx.fill();
        x += dw + gap;
      }
    } else {
      ctx.font = `600 ${Math.round(24 * u)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.fillText(`${idx + 1} / ${n}`, 0, y);
    }
  }
}

