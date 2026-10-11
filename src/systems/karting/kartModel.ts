import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toonGradient } from '../../render/worldMaterials.ts';

// 卡丁车模型（几何体拼的卡通车）：车头朝 +z，原点在两轴中间的地面上。
// 轮子放在转轴组里，方便滚动和前轮转向；电脑车多一个几何体车手（连体服 + 头盔）。

const mats = new Map<string, THREE.Material>();
let gradient: THREE.DataTexture | null = null;
function mat(color: string): THREE.Material {
  let m = mats.get(color);
  if (!m) mats.set(color, (m = new THREE.MeshToonMaterial({ color, gradientMap: (gradient ??= toonGradient()) })));
  return m;
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const WHEEL = new THREE.CylinderGeometry(1, 1, 1, 16).rotateZ(Math.PI / 2);
const HUB = new THREE.CylinderGeometry(1, 1, 1, 10).rotateZ(Math.PI / 2);
const SPHERE = new THREE.SphereGeometry(1, 16, 12);
const CAPSULE = new THREE.CapsuleGeometry(1, 1, 4, 10);

function box(parent: THREE.Object3D, w: number, h: number, l: number, x: number, y: number, z: number, color: string, rx = 0) {
  const m = new THREE.Mesh(BOX, mat(color));
  m.scale.set(w, h, l);
  m.position.set(x, y, z);
  m.rotation.x = rx;
  parent.add(m);
  return m;
}

export interface KartModel {
  root: THREE.Group;
  /** 四个轮子的转轴组（前左、前右、后左、后右），绕 x 滚动 */
  wheels: THREE.Object3D[];
  /** 前轮转向组，绕 y 转 */
  steer: THREE.Object3D[];
  /** 方向盘，绕自身轴转 */
  wheel: THREE.Object3D;
  /** 车手坐的位置（局部，髋部） */
  seat: THREE.Vector3;
  shadow: THREE.Mesh;
}

export function buildKart(color: string, number: number, driver?: { suit: string; helmet: string }): KartModel {
  const root = new THREE.Group();
  root.name = 'kart';
  const dark = '#2b2d42';
  // 底盘、车头整流罩、两侧边箱、后保险杠
  box(root, 0.92, 0.05, 1.5, 0, 0.1, 0, dark);
  box(root, 0.78, 0.16, 0.34, 0, 0.2, 0.72, color);
  box(root, 0.44, 0.2, 0.36, 0, 0.27, 0.43, color, -0.25);
  for (const s of [-1, 1]) box(root, 0.18, 0.17, 0.82, s * 0.41, 0.2, -0.04, color);
  box(root, 1.04, 0.12, 0.12, 0, 0.18, -0.84, shade(color));
  // 号码牌
  const plate = box(root, 0.3, 0.2, 0.02, 0, 0.36, 0.84, '#ffffff', -0.3);
  plate.material = numberPlate(number);
  // 座椅
  box(root, 0.42, 0.08, 0.42, 0, 0.18, -0.3, '#1b1b1b');
  box(root, 0.42, 0.42, 0.08, 0, 0.42, -0.53, '#1b1b1b', -0.25);
  // 发动机 + 排气管
  box(root, 0.26, 0.24, 0.26, 0.3, 0.27, -0.6, '#8d99ae');
  const ex = new THREE.Mesh(WHEEL, mat('#adb5bd'));
  ex.scale.set(0.18, 0.035, 0.035);
  ex.rotation.y = Math.PI / 2;
  ex.position.set(0.3, 0.3, -0.82);
  root.add(ex);
  // 方向盘（转向柱 + 圆环）
  box(root, 0.04, 0.04, 0.3, 0, 0.4, 0.28, '#1b1b1b', 0.9);
  const wheel = new THREE.Group();
  wheel.position.set(0, 0.5, 0.16);
  wheel.rotation.x = -0.9;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.022, 6, 18), mat('#1b1b1b'));
  wheel.add(ring);
  box(wheel, 0.26, 0.03, 0.03, 0, 0, 0, '#1b1b1b');
  root.add(wheel);
  // 轮子
  const wheels: THREE.Object3D[] = [];
  const steer: THREE.Object3D[] = [];
  for (const [x, z, r, w, front] of [
    [-0.5, 0.56, 0.13, 0.14, true],
    [0.5, 0.56, 0.13, 0.14, true],
    [-0.52, -0.56, 0.145, 0.2, false],
    [0.52, -0.56, 0.145, 0.2, false],
  ] as [number, number, number, number, boolean][]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, r, z);
    const spin = new THREE.Group();
    const tyre = new THREE.Mesh(WHEEL, mat('#1b1b1b'));
    tyre.scale.set(w, r, r);
    const hub = new THREE.Mesh(HUB, mat('#dee2e6'));
    hub.scale.set(w + 0.01, r * 0.45, r * 0.45);
    spin.add(tyre, hub);
    pivot.add(spin);
    root.add(pivot);
    wheels.push(spin);
    if (front) steer.push(pivot);
  }
  // 车手（电脑车）：连体服躯干 + 头盔 + 护目镜 + 两条手臂伸向方向盘
  if (driver) {
    const torso = new THREE.Mesh(CAPSULE, mat(driver.suit));
    torso.scale.set(0.17, 0.16, 0.15);
    torso.position.set(0, 0.48, -0.32);
    torso.rotation.x = -0.2;
    const helmet = new THREE.Mesh(SPHERE, mat(driver.helmet));
    helmet.scale.setScalar(0.17);
    helmet.position.set(0, 0.84, -0.3);
    root.add(torso, helmet);
    box(root, 0.22, 0.08, 0.06, 0, 0.85, -0.16, '#1b1b25');
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(CAPSULE, mat(driver.suit));
      arm.scale.set(0.045, 0.1, 0.045);
      arm.position.set(s * 0.14, 0.56, -0.07);
      arm.rotation.x = 1.85;
      arm.rotation.z = -s * 0.2;
      root.add(arm);
    }
    // 腿伸在车头里（只露一点膝盖）
    for (const s of [-1, 1]) box(root, 0.11, 0.1, 0.5, s * 0.11, 0.3, 0.08, driver.suit, -0.15);
  }
  mergeStatic(root);
  const shadow = blobShadow();
  root.add(shadow);
  return { root, wheels, steer, wheel, seat: new THREE.Vector3(0, 0.25, -0.3), shadow };
}

/** 车身上不动的零件按材质合并成少数几个 Mesh（一辆车从约 25 个 draw call 降到约 12 个） */
function mergeStatic(root: THREE.Group) {
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const statics = root.children.filter((c): c is THREE.Mesh => (c as THREE.Mesh).isMesh);
  for (const m of statics) {
    m.updateMatrix();
    const g = m.geometry.clone().applyMatrix4(m.matrix);
    const mat = m.material as THREE.Material;
    let list = byMat.get(mat);
    if (!list) byMat.set(mat, (list = []));
    list.push(g);
    root.remove(m);
  }
  for (const [mat, list] of byMat) {
    const merged = mergeGeometries(list);
    for (const g of list) g.dispose();
    if (merged) root.add(new THREE.Mesh(merged, mat));
  }
}

function shade(hex: string): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(0.72);
  return `#${c.getHexString()}`;
}

function numberPlate(n: number): THREE.Material {
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 96, 64);
  g.fillStyle = '#1b1b1b';
  g.font = 'bold 48px "Avenir Next", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), 48, 35);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshToonMaterial({ map: tex, gradientMap: (gradient ??= toonGradient()) });
}

let shadowTex: THREE.Texture | null = null;
function blobShadow(): THREE.Mesh {
  if (!shadowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grad.addColorStop(0, 'rgba(20,20,30,0.9)');
    grad.addColorStop(0.6, 'rgba(20,20,30,0.5)');
    grad.addColorStop(1, 'rgba(20,20,30,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    shadowTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.45, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.025;
  m.renderOrder = 2;
  return m;
}
