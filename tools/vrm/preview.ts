// VRM 角色预览页：http://127.0.0.1:5173/tools/vrm/preview.html
//   ?variants  额外加载 tools/vrm/work/ 下的测试组合（先运行 node tools/vrm/build.ts --variants）
//   ?only=id   只看一个角色

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { type VRM, type VRMHumanBoneName, VRMLoaderPlugin } from '@pixiv/three-vrm';
import { avatars } from '../../src/data/avatars.ts';
import { variantSpecs } from './variants.ts';

const params = new URLSearchParams(location.search);
const statusEl = document.getElementById('status')!;
if (params.has('nopanel')) document.getElementById('panel')!.style.display = 'none';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.getElementById('app')!.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#f4efe6');
scene.fog = new THREE.Fog('#f4efe6', 9, 20);

const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 50);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight('#fffaf0', '#d8c8b8', 1.6));
const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
sun.position.set(2, 4, 3);
scene.add(sun);

const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 64), new THREE.MeshLambertMaterial({ color: '#efe6d8' }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

interface Entry {
  id: string;
  vrm: VRM;
  root: THREE.Group;
}
const entries: Entry[] = [];

const list: { id: string; url: string }[] = avatars.map((a) => ({ id: a.id, url: `/models/${a.id}.vrm` }));
if (params.has('variants')) for (const v of variantSpecs()) list.push({ id: v.id, url: `/tools/vrm/work/${v.id}.vrm` });
const only = params.get('only');
const shown = only ? list.filter((e) => e.id === only) : list;

const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));

const spacing = 1.1;
async function loadAll(): Promise<void> {
  const results = await Promise.allSettled(
    shown.map(async (e, i) => {
      const gltf = await loader.loadAsync(`${e.url}?t=${Date.now()}`);
      const vrm = gltf.userData.vrm as VRM;
      vrm.scene.traverse((o) => (o.frustumCulled = false));
      const root = new THREE.Group();
      root.add(vrm.scene);
      root.position.x = (i - (shown.length - 1) / 2) * spacing;
      scene.add(root);
      // 摆好位置后重置 spring bone，否则一开始会因为"瞬移"甩一下
      root.updateMatrixWorld(true);
      vrm.springBoneManager?.setInitState();
      vrm.springBoneManager?.reset();
      // 脚下的圆形软影
      const blob = new THREE.Mesh(
        new THREE.CircleGeometry(0.26, 32),
        new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.08, depthWrite: false }),
      );
      blob.rotation.x = -Math.PI / 2;
      blob.position.y = 0.002;
      root.add(blob);
      entries.push({ id: e.id, vrm, root });
    }),
  );
  const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
  for (const f of failed) console.error(f.reason);
  statusEl.textContent = `${entries.length} 个角色${failed.length ? `，${failed.length} 个加载失败（看控制台）` : ''}`;
  setView('front');
}

// ---------- 表情 ----------
const exprNames = ['blink', 'happy', 'aa', 'surprised', 'sad', 'angry', 'relaxed', 'ih', 'ou', 'ee', 'oh', 'lookLeft', 'lookUp'];
const exprOn = new Set<string>();
let autoBlink = true;
const exprRow = document.getElementById('expr')!;
for (const name of exprNames) {
  const b = document.createElement('button');
  b.textContent = name;
  b.onclick = () => {
    if (exprOn.has(name)) exprOn.delete(name);
    else exprOn.add(name);
    b.classList.toggle('on', exprOn.has(name));
  };
  exprRow.appendChild(b);
}
const blinkBtn = document.createElement('button');
blinkBtn.textContent = '自动眨眼';
blinkBtn.classList.add('on');
blinkBtn.onclick = () => {
  autoBlink = !autoBlink;
  blinkBtn.classList.toggle('on', autoBlink);
};
exprRow.appendChild(blinkBtn);

// ---------- 姿势 ----------
type Pose = 'tpose' | 'rest' | 'wave' | 'squat' | 'walk' | 'look';
let pose: Pose = 'rest';
let spin = false;
const poseRow = document.getElementById('pose')!;
const poseBtns = new Map<Pose, HTMLButtonElement>();
const poseLabels: [Pose, string][] = [
  ['tpose', 'T-pose'],
  ['rest', '放下手'],
  ['wave', '挥手'],
  ['squat', '屈膝'],
  ['walk', '走路'],
  ['look', '转头'],
];
for (const [p, label] of poseLabels) {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = () => setPose(p);
  poseRow.appendChild(b);
  poseBtns.set(p, b);
}
function setPose(p: Pose): void {
  pose = p;
  for (const [k, b] of poseBtns) b.classList.toggle('on', k === p);
}
setPose((params.get('pose') as Pose) ?? 'rest');
const spinBtn = document.createElement('button');
spinBtn.textContent = '旋转';
spinBtn.onclick = () => {
  spin = !spin;
  spinBtn.classList.toggle('on', spin);
  if (!spin) for (const e of entries) e.root.rotation.y = 0;
};
poseRow.appendChild(spinBtn);

// ---------- 视角 ----------
type View = 'front' | 'back' | 'side' | 'face' | 'top' | 'fp';
const viewRow = document.getElementById('view')!;
for (const [v, label] of [
  ['front', '正面'],
  ['side', '侧面'],
  ['back', '背面'],
  ['face', '脸部特写'],
  ['top', '俯视'],
  ['fp', '第一人称'],
] as [View, string][]) {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = () => setView(v);
  viewRow.appendChild(b);
}
// 第一人称图层（three-vrm 默认 9 = 只在第一人称显示，10 = 只在第三人称显示）
const FP_LAYER = 9;
const TP_LAYER = 10;
function setView(v: View, focus = 0): void {
  // 和游戏一样：所有角色做 firstPerson.setup()，第三人称相机看 10 不看 9，第一人称相反
  for (const e of entries) e.vrm.firstPerson?.setup({ firstPersonOnlyLayer: FP_LAYER, thirdPersonOnlyLayer: TP_LAYER });
  camera.layers.set(0);
  camera.layers.enable(v === 'fp' ? FP_LAYER : TP_LAYER);
  controls.enabled = v !== 'fp';
  if (v === 'fp') {
    // 第一个角色眼睛的位置，往前下方看
    const e = entries[0];
    if (!e) return;
    const head = e.vrm.humanoid.getRawBoneNode('head')!;
    // 放在身体中轴、眼睛高度（比眼睛靠后，更容易看到自己的头/脖子，用来检查最坏情况）
    const hp = head.getWorldPosition(new THREE.Vector3());
    const eye = hp.clone().add(e.vrm.lookAt?.offsetFromHeadBone ?? new THREE.Vector3(0, 0.19, 0.18));
    eye.set(hp.x, eye.y, hp.z);
    camera.position.copy(eye);
    camera.lookAt(eye.x, 0.2, eye.z + 0.6);
    camera.updateProjectionMatrix();
    return;
  }
  const w = Math.max(1, shown.length) * spacing;
  const fx = entries.length && focus >= 0 ? (focus - (shown.length - 1) / 2) * spacing : 0;
  const dist = Math.max(3.2, w * 1.9);
  if (v === 'front') {
    controls.target.set(0, 0.78, 0);
    camera.position.set(0, 1.0, dist);
  } else if (v === 'back') {
    controls.target.set(0, 0.78, 0);
    camera.position.set(0, 1.0, -dist);
  } else if (v === 'side') {
    controls.target.set(0, 0.78, 0);
    camera.position.set(dist, 1.0, 0.0001);
  } else if (v === 'top') {
    controls.target.set(0, 0.6, 0);
    camera.position.set(0, dist * 1.1, dist * 0.6);
  } else {
    controls.target.set(fx, 1.2, 0);
    camera.position.set(fx + 0.25, 1.28, 1.3);
  }
  camera.updateProjectionMatrix();
  controls.update();
}

// ---------- 动画 ----------
const clock = new THREE.Clock();
let t = 0;
let nextBlink = 1.5;
let blinkT = -1;

function bone(vrm: VRM, name: VRMHumanBoneName): THREE.Object3D | null {
  return vrm.humanoid.getNormalizedBoneNode(name);
}

function applyPose(vrm: VRM, time: number): void {
  const names: VRMHumanBoneName[] = [
    'hips', 'spine', 'chest', 'neck', 'head',
    'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand',
    'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot',
  ];
  for (const n of names) bone(vrm, n)?.rotation.set(0, 0, 0);
  const hips = bone(vrm, 'hips');
  // 归一化 hips 的位置是它的静止位置（离地高度），姿势只在它上面加偏移
  if (hips) {
    hips.userData.rest ??= hips.position.clone();
    hips.position.copy(hips.userData.rest as THREE.Vector3);
  }
  const set = (n: VRMHumanBoneName, x: number, y: number, z: number) => bone(vrm, n)?.rotation.set(x, y, z);
  const armsDown = () => {
    set('leftUpperArm', 0, 0, -1.22);
    set('rightUpperArm', 0, 0, 1.22);
    set('leftLowerArm', 0, -0.15, 0);
    set('rightLowerArm', 0, 0.15, 0);
  };
  if (pose === 'tpose') return;
  if (pose === 'rest') {
    armsDown();
    set('spine', 0.02 * Math.sin(time * 1.6), 0, 0);
    return;
  }
  if (pose === 'wave') {
    set('rightUpperArm', 0, 0, 1.22);
    set('rightLowerArm', 0, 0.15, 0);
    set('leftUpperArm', 0, 0, 1.05);
    set('leftLowerArm', 0, 0, 0.35 + 0.45 * Math.sin(time * 7));
    set('head', 0, 0, -0.12);
    return;
  }
  if (pose === 'squat') {
    armsDown();
    const k = 0.5 + 0.5 * Math.sin(time * 2.2);
    set('leftUpperLeg', -0.9 * k, 0, 0);
    set('rightUpperLeg', -0.9 * k, 0, 0);
    set('leftLowerLeg', 1.6 * k, 0, 0);
    set('rightLowerLeg', 1.6 * k, 0, 0);
    set('leftFoot', -0.7 * k, 0, 0);
    set('rightFoot', -0.7 * k, 0, 0);
    set('spine', 0.35 * k, 0, 0);
    // 大腿 0.21 m、小腿 0.21 m（缩放后略有差异），近似把胯往下放
    if (hips) hips.position.y += -0.21 * (1 - Math.cos(0.9 * k)) - 0.21 * (1 - Math.cos(0.7 * k)) * 0.9;
    return;
  }
  if (pose === 'walk') {
    const s = Math.sin(time * 6);
    set('leftUpperArm', 0.5 * s, 0, -1.25);
    set('rightUpperArm', -0.5 * s, 0, 1.25);
    set('leftLowerArm', 0, -0.4, 0);
    set('rightLowerArm', 0, 0.4, 0);
    set('leftUpperLeg', -0.5 * s, 0, 0);
    set('rightUpperLeg', 0.5 * s, 0, 0);
    set('leftLowerLeg', Math.max(0, 0.9 * Math.sin(time * 6 + 1.6)), 0, 0);
    set('rightLowerLeg', Math.max(0, -0.9 * Math.sin(time * 6 + 1.6)), 0, 0);
    if (hips) hips.position.y += 0.012 * Math.abs(Math.cos(time * 6));
    set('spine', 0, 0.08 * s, 0);
    return;
  }
  if (pose === 'look') {
    armsDown();
    set('neck', 0, 0.35 * Math.sin(time * 1.2), 0);
    set('head', 0.15 * Math.sin(time * 0.8), 0.35 * Math.sin(time * 1.2), 0.1 * Math.sin(time * 0.9));
  }
}

function frame(): void {
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;
  // 自动眨眼
  if (autoBlink) {
    if (blinkT < 0 && t > nextBlink) blinkT = 0;
    if (blinkT >= 0) {
      blinkT += dt;
      if (blinkT > 0.16) {
        blinkT = -1;
        nextBlink = t + 2 + Math.random() * 2.5;
      }
    }
  }
  const blinkW = blinkT >= 0 ? Math.sin((blinkT / 0.16) * Math.PI) : 0;
  for (const e of entries) {
    const em = e.vrm.expressionManager;
    if (em) {
      for (const n of exprNames) em.setValue(n, exprOn.has(n) ? 1 : 0);
      if (!exprOn.has('blink')) em.setValue('blink', blinkW);
    }
    applyPose(e.vrm, t);
    if (spin) e.root.rotation.y += dt * 0.6;
    e.vrm.update(dt);
  }
  if (controls.enabled) controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// 给自动化检查用的钩子
(window as unknown as { __preview: unknown }).__preview = {
  entries,
  setPose,
  setView,
  setExpr: (names: string[]) => {
    exprOn.clear();
    for (const n of names) exprOn.add(n);
    for (const b of exprRow.querySelectorAll('button')) b.classList.toggle('on', exprOn.has(b.textContent ?? ''));
  },
  setAutoBlink: (on: boolean) => {
    autoBlink = on;
    blinkT = -1;
    blinkBtn.classList.toggle('on', on);
  },
  camera,
  controls,
};

loadAll();
frame();
