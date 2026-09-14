// Редактор точек маршрута: схема остановок с участками между ними, меню точки
// (тип, вид на карте, остановка, координаты, фото), перетаскивание точек и снимков.
import { STOP_TYPES, MARKERS, resolveType, parseLatLng, isActivePoint } from './route.js';
import { t, locale } from './i18n.js';
import * as Photos from './photos.js';

const TYPE_ORDER = ['start', 'finish', 'fuel', 'rest', 'food', 'sleep', 'photo', 'sight', 'nature', 'beach', 'home', 'place'];
const SWATCHES = ['#ef4444', '#f97316', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#111827'];
const MIME_POINT = 'application/x-ta-point';
const MIME_PHOTO = 'application/x-ta-photo';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const svg = (body, extra = '') => `<svg viewBox="0 0 16 16" aria-hidden="true" ${extra}>${body}</svg>`;
const ICON = {
  chevron: svg('<path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'),
  grip: svg('<g fill="currentColor"><circle cx="6" cy="4" r="1.15"/><circle cx="10" cy="4" r="1.15"/><circle cx="6" cy="8" r="1.15"/><circle cx="10" cy="8" r="1.15"/><circle cx="6" cy="12" r="1.15"/><circle cx="10" cy="12" r="1.15"/></g>'),
  camera: svg('<path d="M2.5 5.5h2.2l1-1.6h4.6l1 1.6h2.2v7h-11z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="8" cy="8.9" r="2" fill="none" stroke="currentColor" stroke-width="1.4"/>'),
  plus: svg('<path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'),
  close: svg('<path d="M5 5l6 6M11 5l-6 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'),
  play: svg('<path d="M5.2 3.6v8.8l7-4.4z" fill="currentColor"/>'),
  trash: svg('<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.6 4.5l.7 8.5h5.4l.7-8.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>'),
};

export class PointsEditor {
  /**
   * @param {{list:HTMLElement, getPoints:()=>object[], holdHint:(p,i,n)=>number,
   *          onChange:(kind:'geo'|'meta'|'live'|'photos')=>void, onFocus:(id:string, how:string)=>void}} o
   */
  constructor(o) {
    Object.assign(this, o);
    this.openId = null;
    this.status = new Map(); // id → { state: 'busy'|'error', msg }
    this.busy = new Map();   // id → текст про обработку фото
    this.photoErrors = new Map();
    this.legs = null;        // id → км до следующей точки
    this._bind();
  }

  /**
   * Перерисовка после blur-события откладывается до отпускания кнопки мыши:
   * иначе клик, из-за которого поле потеряло фокус, попал бы в уже удалённую кнопку.
   */
  renderSoon() {
    if (this._pointerDown) this._pendingRender = true;
    else this.render();
  }

  get points() { return this.getPoints(); }
  find(id) { return this.points.find((p) => p.id === id); }
  li(id) { return this.list.querySelector(`.pt[data-id="${CSS.escape(id)}"]`); }

  /** Порядковый номер среди точек маршрута (черновики без названия не считаются). */
  position(p) {
    const act = this.points.filter(isActivePoint);
    return { i: act.indexOf(p), n: act.length };
  }

  // ---------- отрисовка ----------
  render() {
    const active = document.activeElement;
    const focus = this.list.contains(active) && active.dataset.field
      ? { id: active.closest('.pt')?.dataset.id, field: active.dataset.field, start: active.selectionStart, end: active.selectionEnd }
      : null;
    this.list.innerHTML = this.points.map((p, k) => this.rowHtml(p, k)).join('');
    if (focus) {
      const el = this.li(focus.id)?.querySelector(`[data-field="${focus.field}"]`);
      if (el) {
        el.focus({ preventScroll: true });
        try { el.setSelectionRange(focus.start, focus.end); } catch {}
      }
    }
  }

  look(p) {
    const { i, n } = this.position(p);
    const type = i < 0 ? p.type || 'place' : resolveType(p, i, n);
    const T = STOP_TYPES[type];
    return { i, n, type, T, color: p.color || T.color, emoji: p.emoji || T.emoji };
  }

  rowHtml(p, k) {
    const { i, n, type, color, emoji } = this.look(p);
    const open = this.openId === p.id;
    const photos = p.photos.length;
    const cls = ['pt', open && 'open', p.marker === 'hidden' && 'via', k === this.points.length - 1 && 'last'].filter(Boolean).join(' ');
    return `<li class="${cls}" data-id="${esc(p.id)}" data-type="${type}" style="--c:${esc(color)}">
      <div class="pt-row">
        <button class="pt-node" data-act="toggle" title="${esc(t('pt.menu'))}" aria-expanded="${open}"><span>${esc(emoji)}</span></button>
        <input class="pt-name" data-field="name" value="${esc(p.name)}" placeholder="${esc(t('points.namePh'))}" spellcheck="false" autocomplete="off" enterkeyhint="done">
        ${this.stateHtml(p, i)}
        ${photos ? `<button class="pt-chip" data-act="photos" title="${esc(t('pt.photosTime', { n: photos, s: this.holdHint(p, i, n).toFixed(1) }))}">${ICON.camera}<span>${photos}</span></button>` : ''}
        <button class="pt-more" data-act="toggle" aria-expanded="${open}" aria-label="${esc(t('pt.menu'))}">${ICON.chevron}</button>
        <span class="pt-grip" title="${esc(t('pt.grip'))}">${ICON.grip}</span>
      </div>
      ${open ? this.menuHtml(p, i, n, type) : ''}
      <div class="pt-leg">${esc(this.legText(p.id))}</div>
    </li>`;
  }

  stateHtml(p, i) {
    const st = this.status.get(p.id);
    if (st?.state === 'busy') return `<span class="pt-state busy" title="${esc(t('pt.state.busy'))}"></span>`;
    if (st?.state === 'error') return `<span class="pt-state error" title="${esc(st.msg)}">!</span>`;
    if (i >= 0 && !p.lngLat) return `<span class="pt-state pending" title="${esc(t('pt.state.pending'))}"></span>`;
    return '';
  }

  legText(id) {
    const km = this.legs?.get(id);
    if (km == null) return '';
    return `${new Intl.NumberFormat(locale()).format(Math.round(km))} ${t('hud.km')}`;
  }

  menuHtml(p, i, n, type) {
    const T = STOP_TYPES[type];
    const marker = p.marker || 'flag';
    const nPhotos = p.photos.length;
    const coords = p.lngLat ? `${+p.lngLat[1].toFixed(5)}, ${+p.lngLat[0].toFixed(5)}` : '';
    const auto = this.holdHint(p, i, n);
    const custom = p.color && !SWATCHES.includes(p.color);
    const types = TYPE_ORDER.map((id) => {
      const it = STOP_TYPES[id];
      return `<button class="type${id === type ? ' on' : ''}" data-act="type" data-type="${id}" style="--tc:${it.color}" aria-pressed="${id === type}"><span>${it.emoji}</span>${esc(t('type.' + id))}</button>`;
    }).join('');
    const markers = MARKERS.map((m) => `<button class="${m === marker ? 'on' : ''}" data-act="marker" data-marker="${m}" aria-pressed="${m === marker}">${esc(t('pt.marker.' + m))}</button>`).join('');
    const look = marker === 'hidden'
      ? `<p class="hint">${esc(t('pt.markerHint'))}</p>`
      : `<div class="look">
          <label class="mini"><span>${esc(t('pt.label'))}</span><input data-field="label" value="${esc(p.label)}" placeholder="${esc(p.name)}" spellcheck="false"></label>
          <label class="mini emoji"><span>${esc(t('pt.emoji'))}</span><input data-field="emoji" value="${esc(p.emoji)}" placeholder="${T.emoji}"></label>
        </div>
        <div class="swatches">
          <button class="sw auto${p.color ? '' : ' on'}" data-act="color" data-color="" style="--sw:${T.color}" title="${esc(t('pt.colorAuto'))}" aria-label="${esc(t('pt.colorAuto'))}"></button>
          ${SWATCHES.map((c) => `<button class="sw${p.color === c ? ' on' : ''}" data-act="color" data-color="${c}" style="--sw:${c}" aria-label="${c}"></button>`).join('')}
          <label class="sw pick${custom ? ' on' : ''}" style="--sw:${custom ? esc(p.color) : 'transparent'}" title="${esc(t('pt.colorCustom'))}"><input type="color" data-field="color" value="${esc(p.color || T.color)}"></label>
        </div>`;
    const photos = p.photos.map((id) => `<div class="ph" draggable="true" data-photo="${esc(id)}">
        <img src="${esc(Photos.thumbUrl(id))}" alt="" draggable="false">
        <button class="ph-x" data-act="rmphoto" data-photo="${esc(id)}" title="${esc(t('pt.photoRemove'))}" aria-label="${esc(t('pt.photoRemove'))}">${ICON.close}</button>
      </div>`).join('');
    const busy = this.busy.get(p.id);
    const err = this.photoErrors.get(p.id);
    return `<div class="pt-menu">
      <div class="fld">
        <div class="fld-label">${esc(t('pt.type'))}</div>
        <div class="types">${types}</div>
      </div>
      <div class="fld">
        <div class="fld-label">${esc(t('pt.look'))}</div>
        <div class="seg">${markers}</div>
        ${look}
      </div>
      <div class="fld">
        <div class="fld-label">${esc(t('pt.photos'))}${nPhotos ? `<span class="fld-note">${esc(t('pt.photosTime', { n: nPhotos, s: auto.toFixed(1) }))}</span>` : ''}</div>
        <div class="photos">
          ${photos}
          <label class="ph-add${busy ? ' busy' : ''}">${ICON.plus}<span>${esc(t('pt.photosAdd'))}</span><input type="file" accept="image/*,.heic,.heif" multiple data-field="files" hidden></label>
        </div>
        <p class="hint${err ? ' error' : ''}">${esc(busy || err || t('pt.photosHint'))}</p>
      </div>
      <div class="fld two">
        <label class="mini"><span>${esc(t('pt.hold'))}</span><input type="number" min="0" max="120" step="0.5" data-field="hold" value="${nPhotos ? '' : esc(p.hold ?? '')}" placeholder="${nPhotos ? esc(t('pt.holdPhotos')) : +auto.toFixed(1)}"${nPhotos ? ' disabled' : ''}></label>
        <label class="mini"><span>${esc(t('pt.coords'))}</span><input data-field="coords" value="${coords}" spellcheck="false" inputmode="decimal"></label>
      </div>
      ${p.found ? `<p class="found">${esc(p.found)}</p>` : ''}
      <div class="pt-actions">
        <button class="ghost small" data-act="preview">${ICON.play}<span>${esc(t('pt.preview'))}</span></button>
        <button class="ghost small danger" data-act="delete">${ICON.trash}<span>${esc(t('pt.delete'))}</span></button>
      </div>
    </div>`;
  }

  // ---------- точечные обновления без перерисовки списка ----------
  setStatus(id, state, msg = '') {
    if (state) this.status.set(id, { state, msg }); else this.status.delete(id);
    const li = this.li(id);
    const p = this.find(id);
    if (!li || !p) return;
    li.querySelector('.pt-state')?.remove();
    const html = this.stateHtml(p, this.position(p).i);
    if (html) li.querySelector('.pt-name').insertAdjacentHTML('afterend', html);
  }

  setLegs(legs) {
    this.legs = legs;
    for (const li of this.list.querySelectorAll('.pt')) li.querySelector('.pt-leg').textContent = this.legText(li.dataset.id);
  }

  /** Обновить внешний вид узла точки после смены типа, цвета или эмодзи. */
  refreshNode(id) {
    const p = this.find(id), li = this.li(id);
    if (!p || !li) return;
    const { color, emoji, type } = this.look(p);
    li.style.setProperty('--c', color);
    li.dataset.type = type;
    li.querySelector('.pt-node span').textContent = emoji;
  }

  toggle(id, open = this.openId !== id) {
    this.openId = open ? id : null;
    this.render();
    if (open) {
      this.li(id)?.querySelector('.pt-menu')?.classList.add('enter');
      this.li(id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      this.onFocus(id, 'stop');
    }
  }

  addPoint() {
    const p = { id: newId(), name: '', lngLat: null, manual: false, found: '', type: null, marker: 'flag', label: '', color: '', emoji: '', hold: null, photos: [] };
    this.points.push(p);
    this.openId = null;
    this.render();
    const input = this.li(p.id)?.querySelector('.pt-name');
    input?.focus();
    input?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  async addPhotos(id, files) {
    const list = [...files].filter((f) => f.type.startsWith('image/') || /\.hei[cf]$/i.test(f.name));
    if (!list.length) return;
    this.openId = id;
    this.photoErrors.delete(id);
    this.busy.set(id, t('pt.photosBusy', { i: 0, n: list.length }));
    this.render();
    const { ids, errors } = await Photos.importFiles(list, (i, n) => {
      this.busy.set(id, t('pt.photosBusy', { i, n }));
      const hint = this.li(id)?.querySelector('.photos + .hint');
      if (hint) hint.textContent = this.busy.get(id);
    });
    this.busy.delete(id);
    const p = this.find(id);
    if (!p) { Photos.remove(ids); return; }
    p.photos.push(...ids);
    if (errors.length) this.photoErrors.set(id, [...new Set(errors)].join('; '));
    this.render();
    this.onChange('photos');
    if (ids.length) this.onFocus(id, 'gallery');
  }

  // ---------- события ----------
  _bind() {
    const L = this.list;

    L.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn || !L.contains(btn)) return;
      const id = btn.closest('.pt')?.dataset.id;
      const p = this.find(id);
      if (!p) return;
      const act = btn.dataset.act;
      if (act === 'toggle') return this.toggle(id);
      if (act === 'photos') {
        this.openId = id;
        this.render();
        this.li(id)?.querySelector('.photos')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return this.onFocus(id, 'gallery');
      }
      if (act === 'type') {
        p.type = p.type === btn.dataset.type ? null : btn.dataset.type;
        this.render();
        return this.onChange('meta');
      }
      if (act === 'marker') {
        p.marker = btn.dataset.marker;
        this.render();
        return this.onChange('meta');
      }
      if (act === 'color') {
        p.color = btn.dataset.color;
        this.render();
        return this.onChange('meta');
      }
      if (act === 'rmphoto') {
        p.photos = p.photos.filter((x) => x !== btn.dataset.photo);
        Photos.remove([btn.dataset.photo]);
        this.render();
        return this.onChange('photos');
      }
      if (act === 'preview') return this.onFocus(id, 'play');
      if (act === 'delete') {
        const list = this.points;
        list.splice(list.indexOf(p), 1);
        if (p.photos.length) Photos.remove(p.photos);
        this.openId = null;
        this.status.delete(id);
        this.render();
        return this.onChange('geo');
      }
    });

    L.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.matches('input:not([type=color])')) { e.preventDefault(); e.target.blur(); }
      if (e.key === 'Escape' && e.target.matches('.pt-name')) {
        const p = this.find(e.target.closest('.pt').dataset.id);
        e.target.value = p?.name ?? '';
        e.target.blur();
      }
    });

    L.addEventListener('input', (e) => {
      const el = e.target;
      const id = el.closest('.pt')?.dataset.id;
      const p = this.find(id);
      if (!p) return;
      const f = el.dataset.field;
      if (f === 'label') { p.label = el.value; this.onChange('live'); }
      if (f === 'emoji') { p.emoji = el.value.trim(); this.refreshNode(id); this.onChange('live'); }
      if (f === 'color') {
        p.color = el.value;
        this.refreshNode(id);
        const pick = el.closest('.sw');
        pick.style.setProperty('--sw', el.value);
        for (const sw of pick.parentElement.children) sw.classList.toggle('on', sw === pick);
        this.onChange('live');
      }
      if (f === 'coords') el.classList.remove('bad');
    });

    L.addEventListener('change', (e) => {
      const el = e.target;
      const id = el.closest('.pt')?.dataset.id;
      const p = this.find(id);
      if (!p) return;
      const f = el.dataset.field;
      if (f === 'name') {
        const name = el.value.replace(/\s+/g, ' ').trim();
        if (name === p.name) return;
        p.name = name;
        if (!p.manual) { p.lngLat = null; p.found = ''; }
        this.status.delete(id);
        this.renderSoon();
        this.onChange('geo');
      } else if (f === 'coords') {
        const v = el.value.trim();
        if (!v) {
          p.manual = false; p.lngLat = null; p.found = '';
        } else {
          const ll = parseLatLng(v);
          if (!ll) { el.classList.add('bad'); el.title = t('pt.coordsBad'); return; }
          p.manual = true; p.lngLat = ll; p.found = '';
        }
        this.status.delete(id);
        this.renderSoon();
        this.onChange('geo');
      } else if (f === 'hold') {
        p.hold = el.value === '' ? null : Math.max(0, +el.value);
        this.renderSoon();
        this.onChange('meta');
      } else if (f === 'label' || f === 'emoji' || f === 'color') {
        this.onChange('meta');
      } else if (f === 'files') {
        this.addPhotos(id, el.files);
      }
    });

    // Перетаскивание: точки — за ручку, фото — за миниатюру, файлы — на любую точку.
    let drag = null; // { kind: 'point'|'photo', id, photo }
    const clearMarks = () => {
      for (const el of L.querySelectorAll('.drop-before, .drop-after, .drop-files')) el.classList.remove('drop-before', 'drop-after', 'drop-files');
    };
    document.addEventListener('pointerdown', () => { this._pointerDown = true; }, true);
    document.addEventListener('pointerup', () => {
      this._pointerDown = false;
      for (const li of L.querySelectorAll('.pt[draggable="true"]')) li.draggable = false;
      if (this._pendingRender) { this._pendingRender = false; setTimeout(() => this.render(), 0); }
    }, true);
    L.addEventListener('pointerdown', (e) => {
      const grip = e.target.closest('.pt-grip');
      if (grip) grip.closest('.pt').draggable = true;
    });
    L.addEventListener('dragstart', (e) => {
      const ph = e.target.closest?.('.ph');
      if (ph) {
        drag = { kind: 'photo', id: ph.closest('.pt').dataset.id, photo: ph.dataset.photo };
        e.dataTransfer.setData(MIME_PHOTO, ph.dataset.photo);
        e.dataTransfer.effectAllowed = 'move';
        ph.classList.add('dragging');
        return;
      }
      const li = e.target.closest?.('.pt');
      if (!li?.draggable) { e.preventDefault(); return; }
      drag = { kind: 'point', id: li.dataset.id };
      e.dataTransfer.setData(MIME_POINT, li.dataset.id);
      e.dataTransfer.effectAllowed = 'move';
      li.classList.add('dragging');
    });
    L.addEventListener('dragend', () => {
      for (const el of L.querySelectorAll('.dragging')) el.classList.remove('dragging');
      for (const li of L.querySelectorAll('.pt[draggable="true"]')) li.draggable = false;
      clearMarks();
      drag = null;
    });
    const half = (el, e, horizontal) => {
      const r = el.getBoundingClientRect();
      return horizontal ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2;
    };
    L.addEventListener('dragover', (e) => {
      const types = [...e.dataTransfer.types];
      const li = e.target.closest?.('.pt');
      if (!li) return;
      if (types.includes(MIME_POINT) && drag?.kind === 'point') {
        e.preventDefault();
        clearMarks();
        if (li.dataset.id !== drag.id) li.classList.add(half(li.querySelector('.pt-row'), e) ? 'drop-after' : 'drop-before');
      } else if (types.includes(MIME_PHOTO) && drag?.kind === 'photo') {
        e.preventDefault();
        clearMarks();
        const ph = e.target.closest('.ph');
        if (ph && li.dataset.id === drag.id) { if (ph.dataset.photo !== drag.photo) ph.classList.add(half(ph, e, true) ? 'drop-after' : 'drop-before'); }
        else if (li.dataset.id !== drag.id) li.classList.add('drop-files');
      } else if (types.includes('Files')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (!li.classList.contains('drop-files')) { clearMarks(); li.classList.add('drop-files'); }
      }
    });
    L.addEventListener('dragleave', (e) => {
      if (!e.relatedTarget || !L.contains(e.relatedTarget)) clearMarks();
    });
    L.addEventListener('drop', (e) => {
      const li = e.target.closest?.('.pt');
      if (!li) return;
      e.preventDefault();
      const target = this.find(li.dataset.id);
      const list = this.points;
      if (drag?.kind === 'point') {
        const from = list.findIndex((p) => p.id === drag.id);
        if (from < 0 || !target || target.id === drag.id) return clearMarks();
        const after = half(li.querySelector('.pt-row'), e);
        const [moved] = list.splice(from, 1);
        list.splice(list.indexOf(target) + (after ? 1 : 0), 0, moved);
        clearMarks();
        this.render();
        this.onChange('geo');
      } else if (drag?.kind === 'photo') {
        const src = this.find(drag.id);
        if (!src || !target) return clearMarks();
        const ph = e.target.closest('.ph');
        src.photos = src.photos.filter((x) => x !== drag.photo);
        if (ph && target === src) {
          const at = src.photos.indexOf(ph.dataset.photo);
          src.photos.splice(at < 0 ? src.photos.length : at + (half(ph, e, true) ? 1 : 0), 0, drag.photo);
        } else {
          target.photos.push(drag.photo);
          this.openId = target.id;
        }
        clearMarks();
        this.render();
        this.onChange('photos');
      } else if (e.dataTransfer.files?.length && target) {
        clearMarks();
        this.addPhotos(target.id, e.dataTransfer.files);
      }
    });
  }
}

export function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
