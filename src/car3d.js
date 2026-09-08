// Объёмная машинка: low-poly компактный хэтчбек как custom-слой MapLibre на three.js.
// Модель строится процедурно, без внешних файлов. Нос модели смотрит в -Z, верх — +Y.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import { metersPerPixel } from './geo.js';

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

/** Боковой профиль (z — вдоль машины, нос в -z; y — вверх), выдавленный на ширину w по оси x. */
function profile(points, w, mat, bevel = 0.012) {
  const shape = new THREE.Shape();
  points.forEach(([z, y], i) => (i ? shape.lineTo(z, y) : shape.moveTo(z, y)));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: w, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6,
  });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.y = -Math.PI / 2; // ось выдавливания → ширина (x), координата профиля → длина (z)
  m.position.x = w / 2;
  return m;
}

/**
 * Компактный хэтчбек-кроссовер: короткий капот, высокая кабина до самой кормы,
 * почти вертикальная дверь багажника, большой клиренс, чёрный пластик по низу,
 * рейлинги и автобокс на крыше. Длина 1.0 (z от -0.5 до +0.5), ширина 0.44.
 */
export function buildCar(color) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.4 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x1a1c1f, roughness: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1e2a36, metalness: 0.75, roughness: 0.18 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xdfe4ea, metalness: 0.9, roughness: 0.25 });
  const boxMat = new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.5, roughness: 0.3 });
  const tire = new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 1 });
  const head = new THREE.MeshStandardMaterial({ color: 0xfff7d0, emissive: 0xfff1a8, emissiveIntensity: 0.9 });
  const tail = new THREE.MeshStandardMaterial({ color: 0xe0342b, emissive: 0xe0342b, emissiveIntensity: 0.7 });

  const W = 0.44;
  // Нижняя часть кузова: бампер → капот → линия окон → корма.
  g.add(profile([
    [-0.50, 0.11], [-0.50, 0.22], [-0.47, 0.27], [-0.22, 0.31], [0.44, 0.33], [0.50, 0.30], [0.50, 0.11],
  ], W, body));
  // Кабина (стёкла): лобовое → крыша → дверь багажника.
  g.add(profile([
    [-0.22, 0.31], [-0.04, 0.45], [0.36, 0.46], [0.44, 0.44], [0.47, 0.33], [0.44, 0.33],
  ], W - 0.02, glass, 0.008));
  // Крыша в цвет кузова поверх стёкол.
  g.add(profile([[-0.05, 0.445], [0.36, 0.455], [0.43, 0.44], [0.43, 0.465], [0.36, 0.475], [-0.05, 0.465]], W - 0.06, body, 0.006));
  // Стойки крыши, чтобы стёкла читались окнами.
  for (const [z0, z1] of [[-0.20, -0.16], [0.10, 0.13], [0.40, 0.44]]) {
    g.add(profile([[z0, 0.31], [z0 + (z1 - z0) * 0.5 - 0.08 * (z0 < 0), 0.45], [z1 + 0.02 * (z0 < 0), 0.45], [z1, 0.31]], W - 0.015, body, 0.004));
  }
  // Чёрный пластик по низу и на арках (кроссоверный обвес).
  g.add(box(W + 0.02, 0.05, 0.99, trim, 0, 0.125, 0));
  for (const z of [-0.30, 0.30]) g.add(box(W + 0.03, 0.10, 0.24, trim, 0, 0.17, z));
  // Фары, решётка, фонари, номер.
  g.add(box(0.13, 0.045, 0.02, head, -0.145, 0.235, -0.50));
  g.add(box(0.13, 0.045, 0.02, head, 0.145, 0.235, -0.50));
  g.add(box(0.14, 0.04, 0.02, trim, 0, 0.19, -0.505));
  g.add(box(0.05, 0.10, 0.02, tail, -0.19, 0.30, 0.505));
  g.add(box(0.05, 0.10, 0.02, tail, 0.19, 0.30, 0.505));
  g.add(box(0.12, 0.035, 0.015, chrome, 0, 0.24, 0.505));
  // Зеркала.
  g.add(box(0.06, 0.035, 0.05, body, -0.245, 0.34, -0.12));
  g.add(box(0.06, 0.035, 0.05, body, 0.245, 0.34, -0.12));
  // Рейлинги.
  g.add(box(0.025, 0.02, 0.46, chrome, -0.16, 0.485, 0.17));
  g.add(box(0.025, 0.02, 0.46, chrome, 0.16, 0.485, 0.17));
  // Автобокс на крыше: приплюснутая капсула.
  const roofBox = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.36, 6, 14), boxMat);
  roofBox.rotation.x = Math.PI / 2;
  roofBox.scale.set(1, 1, 0.55);
  roofBox.position.set(0, 0.545, 0.12);
  g.add(roofBox);
  // Колёса с дисками.
  const wheelGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.075, 20);
  const capGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.078, 12);
  for (const [x, z] of [[-0.2, -0.30], [0.2, -0.30], [-0.2, 0.30], [0.2, 0.30]]) {
    const w = new THREE.Mesh(wheelGeo, tire);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.085, z);
    g.add(w);
    const cap = new THREE.Mesh(capGeo, chrome);
    cap.rotation.z = Math.PI / 2;
    cap.position.set(x, 0.085, z);
    g.add(cap);
  }
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(0.62, 1.12, 1);
  shadow.position.set(0.03, 0.004, 0.02);
  g.add(shadow);
  g.userData.bodyMaterial = body;
  return g;
}

export class Car3DLayer {
  constructor({ color = '#1f2f6e', sizePx = 60 } = {}) {
    this.id = 'car-3d';
    this.type = 'custom';
    this.renderingMode = '3d';
    this.color = color;
    this.sizePx = sizePx;
    this.state = null;
  }

  onAdd(map, gl) {
    this.map = map;
    this.camera = new THREE.Camera();
    this.scene = new THREE.Scene();
    const sun = new THREE.DirectionalLight(0xffffff, 2.6);
    sun.position.set(0.6, 1.4, -0.8);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xbfd4ff, 0.8);
    fill.position.set(-0.8, 0.6, 0.9);
    this.scene.add(fill);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    this.model = buildCar(this.color);
    this.scene.add(this.model);
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
  }

  onRemove() {
    this.renderer?.dispose();
  }

  setColor(color) {
    this.color = color;
    this.model?.userData.bodyMaterial.color.set(color);
  }

  /** Позиция [lng, lat], курс в градусах. */
  setState(lngLat, bearing) {
    this.state = { lngLat, bearing };
  }

  render(gl, args) {
    if (!this.state || !this.model) return;
    const matrix = args && args.defaultProjectionData ? args.defaultProjectionData.mainMatrix : args;
    const { lngLat, bearing } = this.state;
    const alt = this.map.getTerrain() ? (this.map.queryTerrainElevation(lngLat) || 0) : 0;
    const lengthM = this.sizePx * metersPerPixel(lngLat[1], this.map.getZoom());
    const mc = maplibregl.MercatorCoordinate.fromLngLat(lngLat, alt + lengthM * 0.01);
    const s = lengthM * mc.meterInMercatorCoordinateUnits();
    const local = new THREE.Matrix4()
      .makeTranslation(mc.x, mc.y, mc.z)
      .scale(new THREE.Vector3(s, -s, s))
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
      .multiply(new THREE.Matrix4().makeRotationY((-bearing * Math.PI) / 180));
    this.camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix).multiply(local);
    this.renderer.resetState();
    this.renderer.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    this.renderer.render(this.scene, this.camera);
  }
}
