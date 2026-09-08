// Локализация интерфейса: русский или английский, по языку браузера, с ручным переключением.

const DICT = {
  ru: {
    'app.tagline': 'Реальная карта, реальный маршрут, экспорт в MP4. Всё бесплатно и локально.',
    'lang.label': 'Язык',
    'sec.route': 'Маршрут',
    'wp.label': 'Точки, по одной на строку',
    'wp.placeholder': 'Мюнхен\nИнсбрук #отдых\nВенеция',
    'wp.hint': 'Город или адрес найдётся сам. Остановка: <code>Инсбрук #заправка</code>, пауза на ней: <code>Верона #ночёвка ~3</code>. Типы: заправка, отдых, еда, ночёвка, фото, место. Координаты: <code>Дача @ 47.26, 11.39</code> (широта, долгота).',
    'btn.route': 'Построить маршрут',
    'status.loading': 'Загружаю…',
    'status.geocoding': 'Ищу «{name}»…',
    'status.routing': 'Строю маршрут по дорогам (OSRM)…',
    'status.summary': '{km} км по дорогам, ≈{h} ч чистой езды · {n} точек · {src}',
    'status.error': 'Ошибка: {msg}',
    'err.nominatim': 'Nominatim ответил {status}',
    'err.notFound': 'Не нашёл точку «{name}»',
    'err.minPoints': 'Нужно минимум две точки',
    'err.osrm': 'OSRM ответил {status}',
    'err.osrmMsg': 'OSRM: {msg}',
    'err.load': 'Не смог загрузить {url}',
    'sec.titles': 'Титры',
    'title.label': 'Заголовок',
    'subtitle.label': 'Подзаголовок',
    'default.title': 'Мюнхен → Венеция',
    'default.subtitle': 'Автопутешествие · сентябрь 2026',
    'sec.timing': 'Тайминг',
    'timing.drive': 'Поездка, с',
    'timing.intro': 'Интро, с',
    'timing.outro': 'Финал, с',
    'timing.hold': 'Пауза на остановке, с',
    'sec.camera': 'Камера',
    'camera.mode': 'Режим',
    'camera.follow': 'Следить за дорогой (поворачивается)',
    'camera.north': 'Север всегда сверху',
    'camera.zoom': 'Зум',
    'camera.pitch': 'Наклон',
    'camera.offset': 'Машина ниже центра',
    'sec.map': 'Карта',
    'map.style': 'Стиль',
    'style.liberty': 'Liberty — цветная',
    'style.bright': 'Bright — классический OSM',
    'style.positron': 'Positron — светлая минималистичная',
    'style.fiord': 'Fiord — тёмно-синяя',
    'style.dark': 'Dark — тёмная',
    'map.hillshade': 'Тени рельефа',
    'map.terrain': '3D-рельеф',
    'map.terrainScale': 'Высота рельефа',
    'map.routeColor': 'Цвет маршрута',
    'map.carColor': 'Цвет машины',
    'map.car3d': 'Объёмная машинка (3D, three.js)',
    'map.carSize': 'Размер машины',
    'map.carFile': 'Своя картинка машины (PNG, носом вверх)',
    'sec.video': 'Видео',
    'video.format': 'Формат',
    'video.quality': 'Качество',
    'video.fps': 'FPS',
    'video.bitrate': 'Битрейт, Мбит/с',
    'btn.export': 'Экспорт MP4',
    'export.cancel': 'Отмена',
    'export.hint': 'Экспорт идёт покадрово в этой же вкладке: не сворачивайте её. Нужен Chrome / Edge / Arc (WebCodecs).',
    'export.progress': 'Кадр {i} / {n} · осталось ≈ {eta} с',
    'export.done': 'Готово: {mb} МБ, {frames} кадров за {s} с',
    'export.cancelled': 'Экспорт отменён',
    'export.error': 'Ошибка экспорта: {msg}',
    'err.webcodecs': 'WebCodecs недоступен — экспорт работает в Chrome / Edge / Arc',
    'err.muxer': 'mp4-muxer не загрузился (нет доступа к CDN?)',
    'err.even': 'Размеры видео должны быть чётными',
    'err.codec': 'Браузер не умеет кодировать H.264 в таком разрешении',
    'footer': 'Данные карты © OpenStreetMap contributors (ODbL). Тайлы — OpenFreeMap, маршрут — OSRM, рельеф — AWS Terrain Tiles.',
    'play.time': '{t} / {total} с',
    'play.title': 'Пробел — воспроизведение',
    'hud.km': 'км',
    'hud.of': 'из',
    'file.default': 'trip',
  },
  en: {
    'app.tagline': 'Real map, real roads, MP4 export. Free and fully local.',
    'lang.label': 'Language',
    'sec.route': 'Route',
    'wp.label': 'Waypoints, one per line',
    'wp.placeholder': 'Munich\nInnsbruck #rest\nVenice',
    'wp.hint': 'Cities and addresses are geocoded automatically. A stop: <code>Innsbruck #fuel</code>; pause there: <code>Verona #sleep ~3</code>. Types: fuel, rest, food, sleep, photo, place. Coordinates: <code>Cabin @ 47.26, 11.39</code> (lat, lng).',
    'btn.route': 'Build route',
    'status.loading': 'Loading…',
    'status.geocoding': 'Looking up “{name}”…',
    'status.routing': 'Routing along roads (OSRM)…',
    'status.summary': '{km} km by road, ≈{h} h of driving · {n} points · {src}',
    'status.error': 'Error: {msg}',
    'err.nominatim': 'Nominatim returned {status}',
    'err.notFound': 'Could not find “{name}”',
    'err.minPoints': 'At least two waypoints are required',
    'err.osrm': 'OSRM returned {status}',
    'err.osrmMsg': 'OSRM: {msg}',
    'err.load': 'Failed to load {url}',
    'sec.titles': 'Captions',
    'title.label': 'Title',
    'subtitle.label': 'Subtitle',
    'default.title': 'Munich → Venice',
    'default.subtitle': 'Road trip · September 2026',
    'sec.timing': 'Timing',
    'timing.drive': 'Drive, s',
    'timing.intro': 'Intro, s',
    'timing.outro': 'Outro, s',
    'timing.hold': 'Pause at stops, s',
    'sec.camera': 'Camera',
    'camera.mode': 'Mode',
    'camera.follow': 'Follow the road (rotates)',
    'camera.north': 'North always up',
    'camera.zoom': 'Zoom',
    'camera.pitch': 'Pitch',
    'camera.offset': 'Car below center',
    'sec.map': 'Map',
    'map.style': 'Style',
    'style.liberty': 'Liberty — colorful',
    'style.bright': 'Bright — classic OSM',
    'style.positron': 'Positron — light minimal',
    'style.fiord': 'Fiord — dark blue',
    'style.dark': 'Dark',
    'map.hillshade': 'Hillshade',
    'map.terrain': '3D terrain',
    'map.terrainScale': 'Terrain exaggeration',
    'map.routeColor': 'Route color',
    'map.carColor': 'Car color',
    'map.car3d': '3D car (three.js)',
    'map.carSize': 'Car size',
    'map.carFile': 'Custom car image (PNG, nose up)',
    'sec.video': 'Video',
    'video.format': 'Aspect',
    'video.quality': 'Quality',
    'video.fps': 'FPS',
    'video.bitrate': 'Bitrate, Mbit/s',
    'btn.export': 'Export MP4',
    'export.cancel': 'Cancel',
    'export.hint': 'Export renders frame by frame in this tab: keep it visible. Requires Chrome / Edge / Arc (WebCodecs).',
    'export.progress': 'Frame {i} / {n} · ≈ {eta} s left',
    'export.done': 'Done: {mb} MB, {frames} frames in {s} s',
    'export.cancelled': 'Export cancelled',
    'export.error': 'Export error: {msg}',
    'err.webcodecs': 'WebCodecs is unavailable — export works in Chrome / Edge / Arc',
    'err.muxer': 'mp4-muxer failed to load (no access to the CDN?)',
    'err.even': 'Video dimensions must be even',
    'err.codec': 'The browser cannot encode H.264 at this resolution',
    'footer': 'Map data © OpenStreetMap contributors (ODbL). Tiles by OpenFreeMap, routing by OSRM, terrain by AWS Terrain Tiles.',
    'play.time': '{t} / {total} s',
    'play.title': 'Space — play / pause',
    'hud.km': 'km',
    'hud.of': 'of',
    'file.default': 'trip',
  },
};

export const LANGS = Object.keys(DICT);

function detect() {
  try {
    const saved = localStorage.getItem('ta.lang');
    if (saved && DICT[saved]) return saved;
  } catch {}
  const nav = (navigator.language || 'en').toLowerCase();
  return nav.startsWith('ru') ? 'ru' : 'en';
}

export let lang = detect();

export function setLang(l) {
  if (!DICT[l]) return;
  lang = l;
  try { localStorage.setItem('ta.lang', l); } catch {}
  document.documentElement.lang = l;
}

/** Строка по ключу с подстановкой {переменных}. */
export function t(key, vars) {
  let s = DICT[lang]?.[key] ?? DICT.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Строка на конкретном языке (для сравнения значений по умолчанию при переключении). */
export function tIn(l, key, vars) {
  let s = DICT[l]?.[key] ?? DICT.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Локаль для чисел и дат. */
export const locale = () => (lang === 'ru' ? 'ru-RU' : 'en-US');

/** Проставить переводы в DOM по data-i18n / data-i18n-html / data-i18n-placeholder / data-i18n-title. */
export function applyDom(root = document) {
  document.documentElement.lang = lang;
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
}
