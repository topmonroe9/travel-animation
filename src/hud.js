// Оверлей поверх карты (заголовок, счётчик километров, прогресс, атрибуция).
// Рисуется на 2D-канвасе размером с выходное видео — превью и экспорт идентичны.

import { t, locale } from './i18n.js';
import { drawGallery, drawGalleryBackdrop } from './gallery.js';

const FONT = 'Inter, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{title:string, subtitle:string, km:number, totalKm:number, kmStart:number, showTotal:boolean,
 *          progress:number, stops:{frac:number, visible:boolean, color:string}[], color:string,
 *          gallery:object|null, galleryPresence:number}} o
 */
export function drawHud(ctx, W, H, o) {
  ctx.clearRect(0, 0, W, H);
  const u = Math.min(W, H) / 1080; // масштаб типографики
  const pad = 56 * u;
  const presence = o.galleryPresence || 0;
  drawGalleryBackdrop(ctx, W, H, presence);
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  // Заголовок (пока показывается галерея, уходит, чтобы не спорить с фото)
  ctx.save();
  ctx.globalAlpha = 1 - presence;
  ctx.shadowColor = 'rgba(0,0,0,.55)';
  ctx.shadowBlur = 20 * u;
  ctx.shadowOffsetY = 2 * u;
  ctx.fillStyle = '#fff';
  ctx.font = `800 ${Math.round(58 * u)}px ${FONT}`;
  if (o.title) ctx.fillText(o.title, pad, pad);
  if (o.subtitle) {
    ctx.font = `500 ${Math.round(26 * u)}px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.fillText(o.subtitle, pad + 2 * u, pad + 76 * u);
  }
  ctx.restore();

  // Счётчик километров
  const fmt = new Intl.NumberFormat(locale());
  const start = +o.kmStart || 0;
  const kmStr = fmt.format(Math.round(start + o.km));
  const totalStr = fmt.format(Math.round(start + o.totalKm));
  ctx.font = `700 ${Math.round(44 * u)}px ${MONO}`;
  const wNum = ctx.measureText(kmStr).width;
  ctx.font = `500 ${Math.round(22 * u)}px ${FONT}`;
  const tail = o.showTotal === false ? ` ${t('hud.km')}` : ` ${t('hud.km')}  ·  ${t('hud.of')} ${totalStr}`;
  const wTail = ctx.measureText(tail).width;
  const ph = 84 * u, px = 28 * u;
  const pw = wNum + wTail + px * 2 + 8 * u;
  const py = H - pad - ph;
  ctx.save();
  ctx.fillStyle = 'rgba(15,18,28,.72)';
  roundRect(ctx, pad, py, pw, ph, 22 * u);
  ctx.fill();
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.font = `700 ${Math.round(44 * u)}px ${MONO}`;
  ctx.fillText(kmStr, pad + px, py + ph / 2 + 2 * u);
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.font = `500 ${Math.round(22 * u)}px ${FONT}`;
  ctx.fillText(tail, pad + px + wNum + 8 * u, py + ph / 2 + 3 * u);
  ctx.restore();

  // Прогресс-бар по нижнему краю
  const bh = 6 * u;
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.fillRect(0, H - bh, W, bh);
  ctx.fillStyle = o.color;
  ctx.fillRect(0, H - bh, W * o.progress, bh);
  for (const s of o.stops) {
    const x = s.frac * W;
    ctx.beginPath();
    ctx.arc(Math.min(Math.max(x, 7 * u), W - 7 * u), H - bh / 2, 6 * u, 0, Math.PI * 2);
    ctx.fillStyle = s.visible ? (s.color || o.color) : 'rgba(255,255,255,.9)';
    ctx.fill();
    ctx.lineWidth = 2 * u;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  }

  // Атрибуция данных (обязательна по лицензии ODbL)
  ctx.save();
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.shadowColor = 'rgba(0,0,0,.7)';
  ctx.shadowBlur = 6 * u;
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.font = `500 ${Math.round(15 * u)}px ${FONT}`;
  ctx.fillText('© OpenStreetMap contributors · OpenFreeMap · OSRM', W - pad * 0.5, H - bh - 10 * u);
  ctx.restore();

  if (o.gallery) drawGallery(ctx, W, H, o.gallery);
}
