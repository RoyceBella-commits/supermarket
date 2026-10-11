// 校验生成的 VRM：node tools/vrm/validate.ts [文件…]
//   不带参数：校验 avatars.ts 里每个角色的 public/models/<id>.vrm（加 --variants 再校验 tools/vrm/work/ 下的测试组合）
//   1) Khronos glTF Validator：0 error
//   2) three.js GLTFLoader + three-vrm 在 Node 里加载，检查 VRM 1.0、骨骼、表情、MToon、第一人称、尺寸、朝向

import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { type VRM, type VRMHumanBoneName, VRMLoaderPlugin } from '@pixiv/three-vrm';
import validator from 'gltf-validator';
import { type AvatarSpec, avatars } from '../../src/data/avatars.ts';
import { variantSpecs } from './variants.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

const REQUIRED: VRMHumanBoneName[] = [
  'hips', 'spine', 'head',
  'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand',
  'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot',
];
const OPTIONAL: VRMHumanBoneName[] = ['chest', 'neck', 'leftShoulder', 'rightShoulder'];
const EXPRESSIONS = ['blink', 'happy', 'aa', 'surprised', 'blinkLeft', 'blinkRight', 'sad', 'angry', 'relaxed', 'ih', 'ou', 'ee', 'oh', 'lookUp', 'lookDown', 'lookLeft', 'lookRight'];

interface Target {
  file: string;
  spec?: AvatarSpec;
}

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith('--'));
const targets: Target[] = files.length
  ? files.map((f) => ({ file: f }))
  : [
      ...avatars.map((a) => ({ file: join(root, 'public', 'models', `${a.id}.vrm`), spec: a })),
      ...(args.includes('--variants') ? variantSpecs().map((a) => ({ file: join(here, 'work', `${a.id}.vrm`), spec: a })) : []),
    ];

let failures = 0;

function check(ok: boolean, msg: string, problems: string[]): void {
  if (!ok) problems.push(msg);
}

async function loadVrm(bytes: Uint8Array): Promise<{ vrm: VRM; scene: THREE.Group }> {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const gltf = await new Promise<{ userData: { vrm?: VRM }; scene: THREE.Group }>((resolve, reject) =>
    loader.parse(buf, '', (g) => resolve(g as unknown as { userData: { vrm?: VRM }; scene: THREE.Group }), reject),
  );
  if (!gltf.userData.vrm) throw new Error('VRMLoaderPlugin did not produce a VRM');
  return { vrm: gltf.userData.vrm, scene: gltf.scene };
}

function worldPos(o: THREE.Object3D): THREE.Vector3 {
  o.updateWorldMatrix(true, false);
  return new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
}

/** 不做动画时，蒙皮网格的原始顶点就是 T-pose 世界坐标 */
function geometryBox(scene: THREE.Object3D, filter?: (m: THREE.Mesh) => boolean): THREE.Box3 {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (filter && !filter(m))) return;
    // three-vrm 生成的描边网格与原网格共用几何，跳过也无妨
    const pos = m.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) box.expandByPoint(v.fromBufferAttribute(pos, i));
  });
  return box;
}

for (const t of targets) {
  const name = basename(t.file);
  const problems: string[] = [];
  if (!existsSync(t.file)) {
    console.log(`✗ ${name}: file not found (run node tools/vrm/build.ts first)`);
    failures++;
    continue;
  }
  const bytes = new Uint8Array(readFileSync(t.file));

  // ---------- 1. glTF Validator ----------
  const report = await validator.validateBytes(bytes, { maxIssues: 200, ignoredIssues: ['UNSUPPORTED_EXTENSION'] });
  const iss = report.issues;
  check(iss.numErrors === 0, `glTF validator: ${iss.numErrors} error(s)`, problems);
  for (const m of iss.messages.filter((x: { severity: number }) => x.severity === 0).slice(0, 8)) problems.push(`  ${m.code} ${m.pointer ?? ''} ${m.message}`);
  const warnCodes = [...new Set(iss.messages.filter((x: { severity: number }) => x.severity === 1).map((x: { code: string }) => x.code))];

  // ---------- 2. three-vrm ----------
  let summary = '';
  try {
    const { vrm, scene } = await loadVrm(bytes);
    const meta = vrm.meta as { metaVersion?: string; name?: string; licenseUrl?: string; avatarPermission?: string };
    check(meta.metaVersion === '1', `meta.metaVersion is ${meta.metaVersion} (expected VRM 1.0)`, problems);
    check(meta.avatarPermission === 'everyone', 'meta.avatarPermission != everyone', problems);

    // 骨骼
    const h = vrm.humanoid;
    for (const b of [...REQUIRED, ...OPTIONAL]) {
      const raw = h.getRawBoneNode(b);
      const norm = h.getNormalizedBoneNode(b);
      if (!raw) {
        if (REQUIRED.includes(b)) problems.push(`missing humanoid bone ${b}`);
        continue;
      }
      check(!!norm, `missing normalized bone ${b}`, problems);
      const q = raw.quaternion;
      check(Math.abs(q.w - 1) < 1e-6, `bone ${b} has non-identity rotation`, problems);
      check(raw.scale.distanceTo(new THREE.Vector3(1, 1, 1)) < 1e-6, `bone ${b} has non-unit scale`, problems);
    }
    const p = (b: VRMHumanBoneName) => worldPos(h.getRawBoneNode(b)!);
    const lHand = p('leftHand');
    const rHand = p('rightHand');
    const lUp = p('leftUpperArm');
    check(lHand.x > 0.3 && rHand.x < -0.3, 'left hand should be on +X, right hand on -X', problems);
    check(Math.abs(lHand.y - lUp.y) < 0.01 && Math.abs(lHand.z) < 0.01, 'arms are not in T-pose (straight along X)', problems);
    check(p('leftFoot').y < p('leftLowerLeg').y && p('leftLowerLeg').y < p('leftUpperLeg').y, 'leg chain not top-to-bottom', problems);

    // 表情
    const em = vrm.expressionManager;
    const exprNames = em ? Object.keys(em.expressionMap) : [];
    for (const e of EXPRESSIONS) check(exprNames.includes(e), `missing expression ${e}`, problems);

    // 材质
    let meshes = 0;
    let mtoon = 0;
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      meshes++;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      if (mats.every((x) => (x as { isMToonMaterial?: boolean }).isMToonMaterial)) mtoon++;
    });
    check(meshes > 0 && mtoon === meshes, `MToon materials: ${mtoon}/${meshes} meshes`, problems);

    // 第一人称
    const fp = vrm.firstPerson;
    const ann = fp?.meshAnnotations ?? [];
    check(ann.length >= 3, `firstPerson.meshAnnotations: ${ann.length}`, problems);
    const types = ann.map((a) => a.type);
    check(types.includes('thirdPersonOnly') && types.includes('both'), `firstPerson types: ${types.join(',')}`, problems);

    // 尺寸
    const box = geometryBox(scene);
    const height = box.max.y - box.min.y;
    if (t.spec) check(Math.abs(height - t.spec.height) < 0.01, `height ${height.toFixed(3)} != spec ${t.spec.height}`, problems);
    check(Math.abs(box.min.y) < 0.005, `feet not on y=0 (min y ${box.min.y.toFixed(4)})`, problems);

    // 朝向：脸（Face 网格）在头骨前方（+Z），左眼在 +X
    const head = p('head');
    const faceBox = geometryBox(scene, (m) => /^Face/.test(m.name) || m.parent?.name === 'Face');
    const headBox = geometryBox(scene, (m) => /^Head/.test(m.name) || m.parent?.name === 'Head');
    const headCenterZ = (headBox.min.z + headBox.max.z) / 2;
    check(!faceBox.isEmpty() && faceBox.max.z > headCenterZ + 0.12, 'face is not in front (+Z) of the head', problems);
    const lookAt = vrm.lookAt;
    const eye = head.clone().add(lookAt ? lookAt.offsetFromHeadBone : new THREE.Vector3());
    check(!!lookAt && eye.z > head.z + 0.1, 'lookAt offset should point forward (+Z)', problems);
    // blinkLeft 只动 +X 一侧
    let leftSide = 0;
    let rightSide = 0;
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.morphTargetDictionary || m.morphTargetDictionary.blinkLeft === undefined) return;
      const idx = m.morphTargetDictionary.blinkLeft;
      const pos = m.geometry.getAttribute('position');
      const d = m.geometry.morphAttributes.position?.[idx];
      if (!d) return;
      for (let i = 0; i < d.count; i++) {
        if (Math.abs(d.getX(i)) + Math.abs(d.getY(i)) + Math.abs(d.getZ(i)) < 1e-6) continue;
        if (pos.getX(i) > 0) leftSide++;
        else rightSide++;
      }
    });
    check(leftSide > 0 && rightSide === 0, `blinkLeft should move only +X vertices (left ${leftSide}, right ${rightSide})`, problems);

    // 第一人称：setup() 之后，头/脸网格只在 thirdPersonOnlyLayer 上；第一人称相机（启用 firstPersonOnlyLayer、
    // 禁用 thirdPersonOnlyLayer）放在眼睛处，能看到的最近顶点要离眼睛足够远（不会看到自己的头/脖子）
    let fpNearest = Infinity;
    let fpNearestName = '';
    // 两个候选相机位置：眼睛（lookAt 偏移处）和身体中轴上的眼睛高度（游戏里胶囊体中心）
    const fpEyes = [eye.clone(), new THREE.Vector3(head.x, eye.y, head.z)];
    if (fp) {
      fp.setup();
      const fpCam = new THREE.Layers();
      fpCam.enable(fp.firstPersonOnlyLayer);
      fpCam.disable(fp.thirdPersonOnlyLayer);
      const third = new THREE.Layers();
      third.set(fp.thirdPersonOnlyLayer);
      const v = new THREE.Vector3();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const owner = m.parent && m.parent !== scene && !(m.parent as THREE.Bone).isBone ? m.parent.name : m.name;
        const isHeadMesh = /^(Head|Face)/.test(owner) || /^(Head|Face)/.test(m.name);
        if (isHeadMesh) check(m.layers.mask === third.mask, `${m.name}: head mesh not on thirdPersonOnly layer only (mask ${m.layers.mask})`, problems);
        if (!m.layers.test(fpCam)) return;
        const pos = m.geometry.getAttribute('position');
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i);
          for (const e of fpEyes) {
            const d = v.distanceTo(e);
            if (d < fpNearest) {
              fpNearest = d;
              fpNearestName = m.name;
            }
          }
        }
      });
      check(fpNearest > 0.18, `first-person camera sees ${fpNearestName} only ${fpNearest.toFixed(3)} m from the eye`, problems);
    }

    // 头身比
    // 下巴 = Head 网格里绑在 head 骨上的皮肤顶点最低点（脖子绑在 neck 骨上，不算）
    let chin = Infinity;
    const headBone = h.getRawBoneNode('head');
    scene.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      const mat0 = Array.isArray(m.material) ? m.material[0] : m.material;
      if (!m.isSkinnedMesh || !mat0 || !/^skin/.test(mat0.name)) return;
      const hi = m.skeleton.bones.findIndex((b) => b === headBone);
      const pos = m.geometry.getAttribute('position');
      const si = m.geometry.getAttribute('skinIndex');
      for (let i = 0; i < pos.count; i++) if (si.getX(i) === hi) chin = Math.min(chin, pos.getY(i));
    });
    const headTop = headBox.max.y;
    const springJoints = vrm.springBoneManager ? vrm.springBoneManager.joints.size : 0;
    let verts = 0;
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) verts += m.geometry.getAttribute('position').count;
    });
    summary =
      `height ${height.toFixed(3)} m, head ${(headTop - chin).toFixed(3)} m (chin ${chin.toFixed(3)} → top ${headTop.toFixed(3)}), ` +
      `eye ${eye.y.toFixed(3)} m (z ${eye.z.toFixed(3)}), ${exprNames.length} expressions, ${mtoon} MToon meshes, ${verts} verts, ${springJoints} spring joints, ` +
      `first-person nearest visible vertex ${fpNearest.toFixed(3)} m (${fpNearestName})`;
  } catch (e) {
    problems.push(`three-vrm load failed: ${(e as Error).stack ?? e}`);
  }

  const size = `${(bytes.byteLength / 1024).toFixed(0)} KB`;
  const val = `validator ${iss.numErrors}E/${iss.numWarnings}W/${iss.numInfos}I${warnCodes.length ? ` (${warnCodes.join(', ')})` : ''}`;
  if (problems.length) {
    failures++;
    console.log(`✗ ${name} (${size}, ${val})`);
    for (const pr of problems) console.log(`    ${pr}`);
  } else {
    console.log(`✓ ${name} (${size}, ${val})\n    ${summary}`);
  }
}

if (failures) {
  console.log(`\n${failures} file(s) failed`);
  process.exit(1);
}
console.log('\nall good');
