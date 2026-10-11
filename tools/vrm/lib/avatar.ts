// 把 AvatarSpec 组装成 VRM 1.0（GLB 字节）。
// 流程：基准尺寸下生成部件 → 按部件算蒙皮权重 → 整体等比缩放到 spec.height → 写 glTF + VRM 扩展。

import { Document, NodeIO, type Material, type Node } from '@gltf-transform/core';
import * as THREE from 'three';
import type { AvatarSpec } from '../../../src/data/avatars.ts';
import { type BodyMats, buildBody } from './body.ts';
import { buildAccessory, buildGlasses } from './accessories.ts';
import { type RGB, hex, lighten, linear, mix, outlineOf, shadeOf, toHex } from './colors.ts';
import { MORPHS, buildFace } from './face.ts';
import { type Geo, type V3, ellipsoid, merge, mirrorX } from './geom.ts';
import { buildHair } from './hair.ts';
import { HEAD, faceProject, skullGeo } from './head.ts';
import type { Part } from './parts.ts';
import { type JointDef, humanoidJoints } from './rig.ts';
import { type ExpressionDef, type MToonDef, type SpringDef, VRMCMToon, VRMCSpringBone, VRMCVrm } from './vrmExt.ts';

interface MatSpec {
  color: RGB;
  outline: number;
  /** 不做明暗（脸上的贴片） */
  flat?: boolean;
}

const OUTLINE = 0.0045;

export interface BuildInfo {
  bytes: Uint8Array;
  height: number;
  scale: number;
  eyeHeight: number;
  headTop: number;
  chin: number;
  vertexCount: number;
  bones: string[];
  expressions: string[];
}

export async function buildAvatar(spec: AvatarSpec): Promise<BuildInfo> {
  const skin = hex(spec.skinColor);
  const hairC = hex(spec.hairColor);
  const topC = hex(spec.topColor);
  const innerC = spec.innerColor ? hex(spec.innerColor) : lighten(topC, 0.86);
  const bottomC = hex(spec.bottomColor);
  const shoeC = hex(spec.shoeColor);
  const eyeC = hex(spec.eyeColor);
  const accStyle = spec.accessory ?? 'none';
  const accDefault: Record<string, string> = {
    cap: '#d9534f',
    sunhat: '#e9d8a6',
    chefhat: '#ffffff',
    beret: '#c0392b',
    headphones: '#33333a',
    headband: '#e5534b',
    goggles: '#33333a',
    glasses: '#3b2a24',
  };
  const neckC = hex(spec.neckwearColor ?? '#c0392b');

  // ---------- 材质 ----------
  const mats: Record<string, MatSpec> = {
    skin: { color: skin, outline: OUTLINE },
    hair: { color: hairC, outline: OUTLINE },
    top: { color: topC, outline: OUTLINE },
    topAccent: {
      color: spec.top === 'apron' ? lighten(topC, 0.85) : spec.top === 'vest' ? (spec.neckwearColor ? neckC : innerC) : innerC,
      outline: OUTLINE,
    },
    string: { color: hex('#fff3dc'), outline: 0.003 },
    inner: { color: innerC, outline: OUTLINE },
    innerAccent: { color: lighten(innerC, 0.86), outline: OUTLINE },
    neckwear: { color: neckC, outline: 0.003 },
    bottom: { color: bottomC, outline: OUTLINE },
    bottomAccent: { color: lighten(bottomC, 0.85), outline: OUTLINE },
    shoe: { color: shoeC, outline: OUTLINE },
    sole: { color: spec.soleColor ? hex(spec.soleColor) : mix(shoeC, hex('#f3ead9'), 0.6), outline: OUTLINE },
    sock: { color: hex(spec.sockColor ?? '#ffffff'), outline: OUTLINE },
    apronTie: { color: lighten(topC, 0.82), outline: 0.003 },
    white: { color: hex('#ffffff'), outline: 0.003 },
    tie: { color: hex(spec.accessoryColor ?? '#e5534b'), outline: 0.003 },
    accessory: { color: hex(spec.accessoryColor ?? accDefault[accStyle] ?? '#d9534f'), outline: accStyle === 'glasses' ? 0 : OUTLINE },
    accessoryAccent: { color: hex(spec.accessoryAccent ?? '#ffffff'), outline: 0.003 },
    glasses: { color: hex(spec.glassesColor ?? '#3b2a24'), outline: 0 },
    // 五官
    eye: { color: eyeC, outline: 0, flat: true },
    eyeLow: { color: mix(eyeC, hex('#9a6a52'), 0.35), outline: 0, flat: true },
    eyeWhite: { color: hex('#ffffff'), outline: 0, flat: true },
    brow: { color: mix(hairC, eyeC, 0.35), outline: 0, flat: true },
    mouth: { color: hex('#93403a'), outline: 0, flat: true },
    blush: { color: mix(skin, hex('#ff8a80'), 0.42), outline: 0, flat: true },
    hairShadow: { color: mix(skin, shadeOf(skin), 0.6), outline: 0, flat: true },
  };

  // ---------- 部件 ----------
  const parts: Part[] = [];
  const bodyMats: BodyMats = {
    skin: 'skin',
    top: 'top',
    topAccent: 'topAccent',
    string: 'string',
    inner: 'inner',
    bottom: 'bottom',
    bottomAccent: 'bottomAccent',
    shoe: 'shoe',
    sole: 'sole',
    sock: 'sock',
    apronTie: 'apronTie',
    white: 'white',
    innerAccent: 'innerAccent',
    neckwear: 'neckwear',
  };
  const bodyRes = buildBody(spec, bodyMats);
  parts.push(...bodyRes.parts);

  // 头：颅骨 + 耳朵 + 小鼻子
  const h = HEAD;
  parts.push({ geo: skullGeo(h, 26, 16), mat: 'skin', mesh: 'head', bone: 'Head' });
  const ear = ellipsoid([h.c[0] + h.r[0] * 0.95, h.c[1] - 0.036, h.c[2] - 0.012], [0.028, 0.04, 0.03], [0, 0.25, 0.12], 10, 7);
  parts.push({ geo: ear, mat: 'skin', mesh: 'head', bone: 'Head' });
  parts.push({ geo: mirrorX(ear), mat: 'skin', mesh: 'head', bone: 'Head' });
  const nose = faceProject(h, 0, -0.062, -0.004);
  parts.push({ geo: ellipsoid(nose.p, [0.011, 0.008, 0.009], [0, 0, 0], 10, 6), mat: 'skin', mesh: 'head', bone: 'Head' });

  const hairRes = buildHair(spec.hair, {
    h,
    hairMat: 'hair',
    tieMat: 'tie',
    shadowMat: 'hairShadow',
    // 戴帽子时不长呆毛（会从帽顶戳出来）
    ahoge: spec.ahoge ?? !['cap', 'sunhat', 'chefhat', 'beret'].includes(accStyle),
  });
  parts.push(...hairRes.parts);
  const hairLift = spec.hair === 'buzz' ? 0.035 : spec.hair === 'curly' ? 0.13 : 0.06;
  if (accStyle !== 'none') parts.push(...buildAccessory(accStyle, h, 'accessory', 'accessoryAccent', hairLift));
  if (spec.glasses && accStyle !== 'glasses') parts.push(...buildGlasses(h, 'glasses', spec.eyeScale ?? 1));

  const face = buildFace(
    h,
    { eye: 'eye', eyeLow: 'eyeLow', white: 'eyeWhite', brow: 'brow', mouth: 'mouth', blush: 'blush' },
    { blush: spec.blush ?? 0.5, eyeScale: spec.eyeScale ?? 1, mustache: spec.mustache ?? false },
  );

  // ---------- 关节 ----------
  const joints: JointDef[] = humanoidJoints();
  if (hairRes.tail) {
    hairRes.tail.joints.forEach((j, k) => joints.push({ name: j.name, parent: k === 0 ? 'Head' : hairRes.tail!.joints[k - 1].name, pos: j.pos }));
  }
  for (const s of bodyRes.strings ?? []) {
    s.joints.forEach((j, k) => joints.push({ name: j.name, parent: k === 0 ? 'Chest' : s.joints[k - 1].name, pos: j.pos }));
  }
  const jointIndex = new Map(joints.map((j, i) => [j.name, i]));

  // ---------- 缩放 ----------
  // 身高按头发顶算（帽子不算）
  let topY = 0;
  for (const p of parts) if (!p.noHeight) for (let i = 1; i < p.geo.pos.length; i += 3) topY = Math.max(topY, p.geo.pos[i]);
  const s = spec.height / topY;

  // ---------- 图元（按网格、材质分组），先算权重再缩放 ----------
  interface Prim {
    mat: string;
    geo: Geo;
    joints: number[];
    weights: number[];
    targets?: number[][];
  }
  const meshPrims: Record<'body' | 'head', Map<string, Prim>> = { body: new Map(), head: new Map() };
  const v = new THREE.Vector3();
  // 颜色和描边都相同的材质合并成一个（少一个图元 = 少两次 draw call：本体 + 描边）
  const canon = new Map<string, string>();
  const canonOf = (key: string): string => {
    const ms = mats[key];
    if (!ms) throw new Error(`unknown material ${key}`);
    const sig = `${toHex(ms.color)}|${ms.outline}|${ms.flat ? 1 : 0}`;
    if (!canon.has(sig)) canon.set(sig, key);
    return canon.get(sig)!;
  };
  for (const p of parts) {
    const map = meshPrims[p.mesh];
    const mk = canonOf(p.mat);
    let prim = map.get(mk);
    if (!prim) {
      prim = { mat: mk, geo: { pos: [], nrm: [], idx: [] }, joints: [], weights: [] };
      map.set(mk, prim);
    }
    prim.geo = merge([prim.geo, p.geo]);
    for (let i = 0; i < p.geo.pos.length; i += 3) {
      v.set(p.geo.pos[i], p.geo.pos[i + 1], p.geo.pos[i + 2]);
      const w = typeof p.bone === 'string' ? ([[p.bone, 1]] as [string, number][]) : p.bone(v);
      const [ji, wi] = packWeights(w, jointIndex);
      prim.joints.push(...ji);
      prim.weights.push(...wi);
    }
  }
  const facePrims: Prim[] = face.prims.map((fp) => {
    const n = fp.pos.length / 3;
    const hj = jointIndex.get('Head')!;
    return {
      mat: fp.mat,
      geo: { pos: fp.pos, nrm: fp.nrm, idx: fp.idx },
      joints: Array.from({ length: n * 4 }, (_, i) => (i % 4 === 0 ? hj : 0)),
      weights: Array.from({ length: n * 4 }, (_, i) => (i % 4 === 0 ? 255 : 0)),
      targets: fp.targets,
    };
  });

  const allPrims = [...meshPrims.body.values(), ...meshPrims.head.values(), ...facePrims];
  for (const p of allPrims) {
    for (let i = 0; i < p.geo.pos.length; i++) p.geo.pos[i] *= s;
    if (p.targets) for (const t of p.targets) for (let i = 0; i < t.length; i++) t[i] *= s;
  }
  for (const j of joints) j.pos = [j.pos[0] * s, j.pos[1] * s, j.pos[2] * s];

  // ---------- glTF 文档 ----------
  const doc = new Document();
  doc.getRoot().getAsset().generator = 'Mall Wander VRM generator (tools/vrm)';
  const buffer = doc.createBuffer();
  const vrmExt = doc.createExtension(VRMCVrm);
  const mtoonExt = doc.createExtension(VRMCMToon);

  const materials = new Map<string, Material>();
  const getMat = (key: string): Material => {
    let m = materials.get(key);
    if (m) return m;
    const ms = mats[key];
    if (!ms) throw new Error(`unknown material ${key}`);
    const lin = linear(ms.color);
    m = doc
      .createMaterial(key)
      .setBaseColorFactor([lin[0], lin[1], lin[2], 1])
      .setMetallicFactor(0)
      .setRoughnessFactor(1);
    const shade = ms.flat ? mix(ms.color, shadeOf(ms.color), 0.25) : shadeOf(ms.color);
    const def: MToonDef = {
      shadeColor: linear(shade),
      shadingToony: 0.8,
      shadingShift: -0.05,
      giEqualization: 0.9,
      outlineWidth: ms.outline,
      outlineColor: linear(outlineOf(ms.color)),
      outlineLightingMix: 1,
    };
    mtoonExt.defs.set(m, def);
    materials.set(key, m);
    return m;
  };

  const scene = doc.createScene('Scene');
  doc.getRoot().setDefaultScene(scene);
  const root = doc.createNode('Root');
  scene.addChild(root);
  const nodes = new Map<string, Node>();
  for (const j of joints) {
    const parent = j.parent ? joints[jointIndex.get(j.parent)!] : null;
    const local: V3 = parent ? [j.pos[0] - parent.pos[0], j.pos[1] - parent.pos[1], j.pos[2] - parent.pos[2]] : j.pos;
    const n = doc.createNode(j.name).setTranslation(local);
    nodes.set(j.name, n);
    (j.parent ? nodes.get(j.parent)! : root).addChild(n);
  }
  const skinObj = doc.createSkin('Skin');
  const ibm = new Float32Array(joints.length * 16);
  joints.forEach((j, i) => {
    skinObj.addJoint(nodes.get(j.name)!);
    ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -j.pos[0], -j.pos[1], -j.pos[2], 1], i * 16);
  });
  skinObj.setInverseBindMatrices(doc.createAccessor('IBM').setType('MAT4').setArray(ibm).setBuffer(buffer));
  skinObj.setSkeleton(nodes.get('Hips')!);

  // 访问器不起名字（能省下几 KB JSON）
  const acc = (_name: string, arr: Float32Array | Uint8Array | Uint16Array | Uint32Array, type: 'SCALAR' | 'VEC3' | 'VEC4') =>
    doc.createAccessor().setType(type).setArray(arr).setBuffer(buffer);

  let vertexCount = 0;
  const makeMesh = (name: string, prims: Prim[], targetNames?: readonly string[]): Node => {
    const mesh = doc.createMesh(name);
    for (const p of prims) {
      const n = p.geo.pos.length / 3;
      vertexCount += n;
      const prim = doc
        .createPrimitive()
        .setMaterial(getMat(p.mat))
        .setAttribute('POSITION', acc(`${name}_${p.mat}_pos`, new Float32Array(p.geo.pos), 'VEC3'))
        .setAttribute('NORMAL', acc(`${name}_${p.mat}_nrm`, new Float32Array(p.geo.nrm), 'VEC3'))
        .setAttribute('JOINTS_0', acc(`${name}_${p.mat}_j`, new Uint8Array(p.joints), 'VEC4'))
        .setAttribute('WEIGHTS_0', acc(`${name}_${p.mat}_w`, new Uint8Array(p.weights), 'VEC4').setNormalized(true))
        .setIndices(acc(`${name}_${p.mat}_idx`, n < 65535 ? new Uint16Array(p.geo.idx) : new Uint32Array(p.geo.idx), 'SCALAR'));
      if (p.targets && targetNames) {
        p.targets.forEach((t, k) => {
          const target = doc.createPrimitiveTarget(targetNames[k]);
          const arr = new Float32Array(t);
          const a = acc(`${name}_${p.mat}_${targetNames[k]}`, arr, 'VEC3');
          // 大部分顶点不动的 target 用稀疏存储（全零时不写 bufferView）
          let moved = 0;
          for (let i = 0; i < arr.length; i += 3) if (arr[i] !== 0 || arr[i + 1] !== 0 || arr[i + 2] !== 0) moved++;
          if (moved < (arr.length / 3) * 0.4) a.setSparse(true);
          target.setAttribute('POSITION', a);
          prim.addTarget(target);
        });
      }
      mesh.addPrimitive(prim);
    }
    if (targetNames) {
      mesh.setWeights(targetNames.map(() => 0));
      mesh.setExtras({ targetNames: [...targetNames] });
    }
    const node = doc.createNode(name).setMesh(mesh).setSkin(skinObj);
    scene.addChild(node);
    return node;
  };

  const bodyNode = makeMesh('Body', [...meshPrims.body.values()]);
  const headNode = makeMesh('Head', [...meshPrims.head.values()]);
  const faceNode = makeMesh('Face', facePrims, MORPHS);

  // ---------- 表情 ----------
  const mi = (name: (typeof MORPHS)[number]) => MORPHS.indexOf(name);
  const bind = (...names: (typeof MORPHS)[number][]): ExpressionDef['binds'] => names.map((n) => ({ node: faceNode, index: mi(n), weight: 1 }));
  const emotion = (n: (typeof MORPHS)[number]): ExpressionDef => ({ binds: bind(n), overrideBlink: 'blend' });
  const expressions: Record<string, ExpressionDef> = {
    happy: emotion('happy'),
    angry: emotion('angry'),
    sad: emotion('sad'),
    relaxed: emotion('relaxed'),
    surprised: emotion('surprised'),
    aa: { binds: bind('aa') },
    ih: { binds: bind('ih') },
    ou: { binds: bind('ou') },
    ee: { binds: bind('ee') },
    oh: { binds: bind('oh') },
    blink: { binds: bind('blinkLeft', 'blinkRight') },
    blinkLeft: { binds: bind('blinkLeft') },
    blinkRight: { binds: bind('blinkRight') },
    lookUp: { binds: bind('lookUp') },
    lookDown: { binds: bind('lookDown') },
    lookLeft: { binds: bind('lookLeft') },
    lookRight: { binds: bind('lookRight') },
  };

  const headJ = joints[jointIndex.get('Head')!];
  const eyeWorld: V3 = [face.eyeCenter[0] * s, face.eyeCenter[1] * s, face.eyeCenter[2] * s];
  const humanBones: Record<string, Node> = {};
  for (const j of joints) if (j.humanBone) humanBones[j.humanBone] = nodes.get(j.name)!;

  vrmExt.data = {
    meta: { name: spec.displayName.en, version: '1.0', authors: ['Mall Wander (generated)'], copyrightInformation: 'Original character generated by tools/vrm' },
    humanBones,
    firstPerson: [
      { node: bodyNode, type: 'both' },
      { node: headNode, type: 'thirdPersonOnly' },
      { node: faceNode, type: 'thirdPersonOnly' },
    ],
    lookAtOffset: [eyeWorld[0] - headJ.pos[0], eyeWorld[1] - headJ.pos[1], eyeWorld[2] - headJ.pos[2]],
    expressions,
  };

  // ---------- spring bone ----------
  const springs: SpringDef = { colliders: [], springs: [] };
  const headC = HEAD.c;
  const hb = joints[jointIndex.get('Head')!].pos;
  if (hairRes.tail) {
    springs.colliders.push({ node: nodes.get('Head')!, offset: [headC[0] * s - hb[0], headC[1] * s - hb[1], headC[2] * s - hb[2]], radius: 0.185 * s });
    springs.colliders.push({ node: nodes.get('Chest')!, offset: [0, 0.1 * s, -0.02 * s], radius: 0.14 * s });
    springs.springs.push({
      name: 'Ponytail',
      joints: hairRes.tail.joints.map((j) => ({ node: nodes.get(j.name)!, hitRadius: 0.035 * s, stiffness: 1.4, gravityPower: 0.6, dragForce: 0.45 })),
      colliders: [0, 1],
    });
  }
  if (bodyRes.strings) {
    const ci = springs.colliders.length;
    springs.colliders.push({ node: nodes.get('Chest')!, offset: [0, 0.05 * s, -0.012 * s], radius: 0.118 * s });
    for (const st of bodyRes.strings) {
      springs.springs.push({
        name: st.joints[0].name.replace(/1$/, ''),
        joints: st.joints.map((j) => ({ node: nodes.get(j.name)!, hitRadius: 0.006 * s, stiffness: 2.0, gravityPower: 0.4, dragForce: 0.55 })),
        colliders: [ci],
      });
    }
  }
  if (springs.springs.length) doc.createExtension(VRMCSpringBone).data = springs;

  const io = new NodeIO().registerExtensions([VRMCVrm, VRMCMToon, VRMCSpringBone]);
  const bytes = await io.writeBinary(doc);

  // 量一下：头顶、下巴、眼睛高度
  let headTop = 0;
  for (const p of meshPrims.head.values()) for (let i = 1; i < p.geo.pos.length; i += 3) headTop = Math.max(headTop, p.geo.pos[i]);
  return {
    bytes,
    height: topY * s,
    scale: s,
    eyeHeight: eyeWorld[1],
    headTop,
    chin: (HEAD.c[1] - HEAD.r[1]) * s,
    vertexCount,
    bones: joints.map((j) => j.humanBone ?? j.name),
    expressions: Object.keys(expressions),
  };
}

/** 把 [关节名, 权重] 列表压成 4 个 joint 下标 + 归一化 ubyte 权重（和为 255） */
function packWeights(w: [string, number][], jointIndex: Map<string, number>): [number[], number[]] {
  const acc = new Map<number, number>();
  for (const [name, x] of w) {
    const i = jointIndex.get(name);
    if (i === undefined) throw new Error(`unknown joint ${name}`);
    if (x > 0) acc.set(i, (acc.get(i) ?? 0) + x);
  }
  const list = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sum = list.reduce((s, [, x]) => s + x, 0) || 1;
  const q = list.map(([i, x]) => [i, Math.round((x / sum) * 255)] as [number, number]).filter(([, x]) => x > 0);
  const qs = q.reduce((s, [, x]) => s + x, 0);
  if (q.length === 0) return [[jointIndex.get('Hips')!, 0, 0, 0], [255, 0, 0, 0]];
  q[0][1] += 255 - qs;
  const joints = [0, 0, 0, 0];
  const weights = [0, 0, 0, 0];
  q.forEach(([i, x], k) => {
    joints[k] = i;
    weights[k] = x;
  });
  return [joints, weights];
}
