// 身体与服装（不含头）。基准尺寸、T-pose、面向 +Z、角色左手在 +X。
// 只写左半边的四肢，右边由 mirrorPart 镜像生成。

import * as THREE from 'three';
import type { AvatarSpec } from '../../../src/data/avatars.ts';
import { type Geo, type V3, capsule, computeNormals, deform, ellipsoid, lerp, mirrorX, revolve, smoothstep, torus, tube } from './geom.ts';
import { type Part, type WeightFn, blendY, mirrorPart } from './parts.ts';
import { B } from './rig.ts';

/** 躯干权重：Hips → Spine → Chest 平滑过渡 */
export const torsoWeights: WeightFn = blendY([
  [0.53, 'Hips'],
  [0.64, 'Spine'],
  [0.8, 'Chest'],
]);

type Profile = [number, number][];

/** 按 y 在外轮廓上插值半径（profile 从下往上，忽略两端极点） */
function radiusAt(profile: Profile, y: number): number {
  const pts = profile.filter(([r]) => r > 1e-6);
  if (y <= pts[0][1]) return pts[0][0];
  for (let i = 0; i < pts.length - 1; i++) {
    const [r0, y0] = pts[i];
    const [r1, y1] = pts[i + 1];
    if (y <= y1) return lerp(r0, r1, (y - y0) / (y1 - y0));
  }
  return pts[pts.length - 1][0];
}

export interface Torso {
  profile: Profile;
  kz: number;
  /** 躯干前表面在 (x, y) 处的 z */
  frontZ: (x: number, y: number) => number;
}

function makeTorso(profile: Profile, kz: number): Torso {
  return {
    profile,
    kz,
    frontZ: (x, y) => {
      const r = radiusAt(profile, y);
      return kz * Math.sqrt(Math.max(0, r * r - x * x));
    },
  };
}

/** 上衣主体轮廓（从下摆到肩） */
function topProfile(loose: number): Profile {
  const k = 1 + loose;
  return [
    [0, 0.47],
    [0.1 * k, 0.47],
    [0.15 * k, 0.474],
    [0.162 * k, 0.488],
    [0.167 * k, 0.515],
    [0.167 * k, 0.57],
    [0.162 * k, 0.64],
    [0.153 * k, 0.71],
    [0.145 * k, 0.775],
    [0.136 * k, 0.83],
    [0.122 * k, 0.872],
    [0.098 * k, 0.902],
    [0.066, 0.922],
    [0.04, 0.93],
    [0, 0.932],
  ];
}

export interface BodyMats {
  skin: string;
  top: string;
  topAccent: string;
  string: string;
  inner: string;
  bottom: string;
  bottomAccent: string;
  shoe: string;
  sole: string;
  sock: string;
  apronTie: string;
  white: string;
}

export interface BodyResult {
  parts: Part[];
  /** 抽绳骨链（spring bone） */
  strings?: { joints: { name: string; pos: V3 }[] }[];
}

export function buildBody(spec: AvatarSpec, m: BodyMats): BodyResult {
  const parts: Part[] = [];
  const left: Part[] = []; // 左侧四肢，最后统一镜像
  const body = (geo: Geo, mat: string, bone: string | WeightFn) => parts.push({ geo, mat, mesh: 'body', bone });
  const L = (geo: Geo, mat: string, bone: string | WeightFn) => left.push({ geo, mat, mesh: 'body', bone });
  const Y = B.armY;
  let strings: BodyResult['strings'];

  // ---------- 脖子 ----------
  // 放进 head 网格（thirdPersonOnly）：第一人称相机就在脖子正上方，否则低头会看到一个肉色球
  parts.push({ geo: capsule([0, 0.86, -0.004], [0, 1.01, -0.004], 0.047, 0.047, 20, 4), mat: m.skin, mesh: 'head', bone: 'Neck' });

  // ---------- 上衣 ----------
  const top = spec.top;
  const loose = top === 'hoodie' ? 0.02 : 0;
  const torso = makeTorso(topProfile(loose), 0.78);
  const torsoMat = top === 'apron' ? m.inner : m.top;
  body(revolve(torso.profile, 40, 1, torso.kz), torsoMat, torsoWeights);

  const longSleeve = top !== 'tshirt';
  const sleeveMat = torsoMat;
  const cuffMat = top === 'hoodie' ? m.topAccent : torsoMat;

  if (top === 'hoodie') {
    // 下摆罗纹
    body(torus([0, 0.486, 0], 0.166, 0.017, [0, 1, 0], 44, 10, [1, 1, 0.79]), m.topAccent, torsoWeights);
    // 袋鼠兜：圆角矩形垫片，贴着肚子弯
    const pocket = ellipsoid([0, 0, 0], [1, 1, 1], [0, 0, 0], 32, 18);
    deform(pocket, (p) => {
      // 超椭圆：更方
      const sx = Math.sign(p.x) * Math.pow(Math.abs(p.x), 0.55);
      const sy = Math.sign(p.y) * Math.pow(Math.abs(p.y), 0.6);
      const x = sx * 0.098;
      const y = 0.578 + sy * 0.052;
      // 上沿略窄（梯形），前后厚度约 1.7 cm，背面埋进衣服里
      const xx = x * (1 - 0.12 * Math.max(0, (y - 0.578) / 0.052));
      p.set(xx, y, torso.frontZ(xx, y) - 0.006 + (p.z + 1) * 0.011);
    });
    body(pocket, m.topAccent, torsoWeights);
    // 兜帽（放下状态）：脖子一圈 + 背后一团
    body(torus([0, 0.918, -0.018], 0.068, 0.028, [0, 1, 0.12], 36, 12, [1, 1, 0.95]), m.top, 'Chest');
    body(ellipsoid([0, 0.875, -0.112], [0.105, 0.075, 0.042], [-0.28, 0, 0]), m.top, 'Chest');
    // 抽绳：两条细管 + 绳头，绑在各自的 spring 骨链上
    strings = [];
    for (const sx of [1, -1]) {
      const x0 = 0.03 * sx;
      const x1 = 0.036 * sx;
      const pathPt = (s: number): V3 => {
        const y = lerp(0.9, 0.762, s);
        const x = lerp(x0, x1, s);
        return [x, y, torso.frontZ(x, y) + 0.008];
      };
      const name = sx > 0 ? 'Left' : 'Right';
      const joints = [
        { name: `String${name}1`, pos: pathPt(0.05) },
        { name: `String${name}2`, pos: pathPt(0.55) },
        { name: `String${name}3`, pos: pathPt(1.0) },
      ];
      strings.push({ joints });
      const w: WeightFn = (p) => {
        const t = smoothstep(0.9, 0.762, p.y);
        if (t < 0.5) return [[joints[0].name, 1 - t * 2], [joints[1].name, t * 2]];
        return [[joints[1].name, 1]];
      };
      // 上端收成圆头（第一人称低头时看得到），下端被绳头盖住
      body(tube(pathPt, (s) => 0.0055 * Math.sqrt(Math.min(1, s / 0.05)), 14, 8, [1, 0, 0]), m.string, w);
      const e = pathPt(1);
      body(capsule([e[0], e[1] + 0.004, e[2]], [e[0], e[1] - 0.022, e[2] + 0.002], 0.0085, 0.0085, 10, 3), m.string, joints[1].name);
    }
  } else if (top === 'tshirt') {
    body(torus([0, 0.912, 0.006], 0.06, 0.012, [0, 1, 0.25], 32, 8), m.topAccent, 'Chest');
    body(torus([0, 0.478, 0], 0.158, 0.009, [0, 1, 0], 44, 8, [1, 1, 0.79]), torsoMat, torsoWeights);
  } else {
    // 衬衫（围裙里面那件也是衬衫）：翻领 + 门襟纽扣
    const shirtMat = torsoMat;
    for (const sx of [1, -1]) {
      const c: V3 = [0.034 * sx, 0.89, torso.frontZ(0.034, 0.89) + 0.003];
      body(ellipsoid(c, [0.038, 0.028, 0.007], [-0.5, 0.35 * sx, -0.75 * sx], 20, 12), shirtMat, 'Chest');
    }
    body(torus([0, 0.912, -0.004], 0.058, 0.014, [0, 1, 0.18], 32, 8), shirtMat, 'Chest');
    if (top === 'shirt') {
      for (const y of [0.84, 0.76, 0.68, 0.6]) {
        body(ellipsoid([0, y, torso.frontZ(0, y) + 0.002], [0.0075, 0.0075, 0.004], [0, 0, 0], 12, 8), m.topAccent, torsoWeights);
      }
    }
    body(torus([0, 0.478, 0], 0.158, 0.009, [0, 1, 0], 44, 8, [1, 1, 0.79]), shirtMat, torsoWeights);
  }

  if (top === 'apron') {
    // 围裙：前片（胸片 + 裙片）是一块有厚度的曲面，系带绕腰一圈，背后打结
    const apron = apronGeo(torso, spec.bottom === 'skirt');
    // 胸片跟胸，裙片跟胯
    body(apron, m.top, blendY([
      [0.5, 'Hips'],
      [0.64, 'Spine'],
      [0.8, 'Chest'],
    ]));
    body(torus([0, 0.615, 0], 0.158, 0.011, [0, 1, 0], 44, 8, [1, 1, 0.8]), m.apronTie, torsoWeights);
    body(ellipsoid([0.03, 0.615, -0.135], [0.03, 0.02, 0.012], [0, 0, 0.5]), m.apronTie, 'Spine');
    body(ellipsoid([-0.03, 0.615, -0.135], [0.03, 0.02, 0.012], [0, 0, -0.5]), m.apronTie, 'Spine');
    // 肩带：从胸片上角绕过脖子
    body(torus([0, 0.9, 0.0], 0.085, 0.009, [0, 1, 0.55], 32, 8, [1, 1, 1]), m.top, 'Chest');
    // 胸前名牌
    const ny = 0.79;
    body(ellipsoid([0.05, ny, torso.frontZ(0.05, ny) + 0.016], [0.026, 0.014, 0.004], [0, 0.32, 0]), m.white, 'Chest');
  }

  // ---------- 手臂（左） ----------
  const ua = B.upperArmX;
  const la = B.lowerArmX;
  const hx = B.handX;
  if (longSleeve) {
    L(ellipsoid([ua, Y, 0], [0.058, 0.058, 0.056]), sleeveMat, 'LeftUpperArm');
    L(capsule([ua, Y, 0], [la, Y, 0], 0.056, 0.052, 20, 5), sleeveMat, 'LeftUpperArm');
    L(capsule([la, Y, 0], [hx - 0.018, Y, 0], 0.052, 0.049, 20, 5), sleeveMat, 'LeftLowerArm');
    L(torus([hx - 0.018, Y, 0], 0.045, 0.011, [1, 0, 0], 28, 8), cuffMat, 'LeftLowerArm');
  } else {
    // 短袖：袖子罩住上臂一半，下面露出手臂
    L(ellipsoid([ua, Y, 0], [0.058, 0.058, 0.056]), sleeveMat, 'LeftUpperArm');
    const sleeve = revolve(
      [
        [0, -0.02],
        [0.054, -0.01],
        [0.06, 0.04],
        [0.064, 0.085],
        [0.062, 0.093],
        [0.05, 0.095],
        [0, 0.09],
      ],
      28,
    );
    L(alignX(sleeve, ua), sleeveMat, 'LeftUpperArm');
    L(capsule([ua + 0.02, Y, 0], [la, Y, 0], 0.044, 0.042, 22, 6), m.skin, 'LeftUpperArm');
    L(capsule([la, Y, 0], [hx, Y, 0], 0.042, 0.038, 22, 6), m.skin, 'LeftLowerArm');
  }
  // 手：圆手 + 拇指
  L(ellipsoid([hx + 0.036, Y - 0.002, 0.002], [0.05, 0.043, 0.047]), m.skin, 'LeftHand');
  L(ellipsoid([hx + 0.016, Y + 0.004, 0.036], [0.019, 0.017, 0.021], [0, -0.5, 0]), m.skin, 'LeftHand');

  // ---------- 下装 ----------
  const lx = B.legX;
  const bottom = spec.bottom;
  // 胯部（裤子 / 短裤；裙子下面也有一条同色安全裤）
  const hipProfile: Profile = [
    [0, 0.425],
    [0.07, 0.427],
    [0.125, 0.442],
    [0.15, 0.47],
    [0.157, 0.51],
    [0.155, 0.57],
    [0.147, 0.62],
    [0.1, 0.64],
    [0, 0.645],
  ];
  body(revolve(hipProfile, 40, 1, 0.8), m.bottom, 'Hips');

  const bareLeg = bottom !== 'pants';
  if (bottom === 'pants') {
    L(capsule([lx, B.upperLegY, 0], [lx, B.lowerLegY, 0], 0.07, 0.068, 20, 5), m.bottom, 'LeftUpperLeg');
    L(capsule([lx, B.lowerLegY, 0], [lx, 0.105, 0], 0.068, 0.07, 20, 5), m.bottom, 'LeftLowerLeg');
    L(torus([lx, 0.108, 0], 0.067, 0.012, [0, 1, 0], 28, 8), m.bottomAccent, 'LeftLowerLeg');
  } else if (bottom === 'shorts') {
    const short = revolve(
      [
        [0, 0.52],
        [0.068, 0.5],
        [0.074, 0.44],
        [0.077, 0.39],
        [0.075, 0.382],
        [0.062, 0.38],
        [0, 0.39],
      ],
      28,
    );
    L(translateGeo(short, lx, 0, 0), m.bottom, 'LeftUpperLeg');
  } else {
    // 裙子：外层往下、裙摆卷边、内层往上，绑在胯上
    const skirt = revolve(
      [
        [0.135, 0.6],
        [0.15, 0.52],
        [0.18, 0.42],
        [0.2, 0.37],
        [0.203, 0.36],
        [0.212, 0.358],
        [0.215, 0.364],
        [0.207, 0.38],
        [0.188, 0.43],
        [0.162, 0.52],
        [0.152, 0.6],
        [0.14, 0.64],
        [0.0, 0.648],
      ],
      48,
      1,
      0.86,
    );
    body(skirt, m.bottom, 'Hips');
    body(torus([0, 0.6, 0], 0.152, 0.012, [0, 1, 0], 44, 8, [1, 1, 0.82]), m.bottomAccent, 'Hips');
  }
  if (bareLeg) {
    L(capsule([lx, B.upperLegY, 0], [lx, B.lowerLegY, 0], 0.058, 0.054, 20, 5), m.skin, 'LeftUpperLeg');
    L(capsule([lx, B.lowerLegY, 0], [lx, 0.15, 0], 0.054, 0.048, 20, 5), m.skin, 'LeftLowerLeg');
    // 袜子
    const sock = revolve(
      [
        [0, 0.05],
        [0.052, 0.06],
        [0.052, 0.15],
        [0.055, 0.17],
        [0.05, 0.178],
        [0, 0.17],
      ],
      24,
    );
    L(translateGeo(sock, lx, 0, 0), m.sock, 'LeftLowerLeg');
  }

  // ---------- 鞋 ----------
  const shoe = ellipsoid([lx, 0.058, 0.026], [0.068, 0.058, 0.112], [0, 0, 0], 26, 16);
  deform(shoe, (p) => {
    if (p.y < 0.022) p.y = 0.022;
  });
  L(shoe, m.shoe, 'LeftFoot');
  const sole = ellipsoid([lx, 0.03, 0.026], [0.073, 0.034, 0.118], [0, 0, 0], 26, 12);
  deform(sole, (p) => {
    if (p.y < 0) p.y = 0;
  });
  L(sole, m.sole, 'LeftFoot');
  // 鞋舌/鞋带区：一块浅色小垫片
  L(ellipsoid([lx, 0.095, 0.05], [0.032, 0.012, 0.04], [-0.55, 0, 0], 20, 10), m.sole, 'LeftFoot');

  for (const p of left) {
    parts.push(p);
    parts.push(mirrorPart(p, mirrorX));
  }
  return { parts, strings };
}

function translateGeo(g: Geo, x: number, y: number, z: number): Geo {
  for (let i = 0; i < g.pos.length; i += 3) {
    g.pos[i] += x;
    g.pos[i + 1] += y;
    g.pos[i + 2] += z;
  }
  return g;
}

/** 把沿 +Y 的旋转体放倒到沿 +X（左臂方向），起点移到 x0、手臂高度 */
function alignX(g: Geo, x0: number): Geo {
  const m = new THREE.Matrix4().makeRotationZ(-Math.PI / 2).setPosition(x0, B.armY, 0);
  const nm = new THREE.Matrix3().getNormalMatrix(m);
  const v = new THREE.Vector3();
  for (let i = 0; i < g.pos.length; i += 3) {
    v.set(g.pos[i], g.pos[i + 1], g.pos[i + 2]).applyMatrix4(m);
    g.pos[i] = v.x;
    g.pos[i + 1] = v.y;
    g.pos[i + 2] = v.z;
    v.set(g.nrm[i], g.nrm[i + 1], g.nrm[i + 2]).applyMatrix3(nm).normalize();
    g.nrm[i] = v.x;
    g.nrm[i + 1] = v.y;
    g.nrm[i + 2] = v.z;
  }
  return g;
}

/** 围裙前片：沿躯干前表面的一块"枕头"形薄片 */
function apronGeo(torso: Torso, overSkirt: boolean): Geo {
  const nu = 24;
  const nv = 30;
  const yTop = 0.845;
  const yBot = overSkirt ? 0.33 : 0.37;
  const d = 0.007;
  // 半宽（角度）随高度变化：胸片窄，腰以下变宽
  const halfAngle = (y: number) => lerp(0.42, 0.95, smoothstep(0.7, 0.6, y));
  const surf = (u: number, v: number, off: number): V3 => {
    const y = lerp(yTop, yBot, v);
    // 腰以下：裙片离开身体，略外扩
    let r: number;
    if (y > 0.6) r = radiusAtTorso(torso, y) + 0.012;
    else {
      const below = (0.6 - y) / 0.3;
      r = radiusAtTorso(torso, 0.6) + 0.012 + (overSkirt ? 0.06 : 0.025) * below + 0.004;
    }
    r += off;
    const a = u * halfAngle(y);
    return [r * Math.sin(a), y, r * Math.cos(a) * torso.kz + (y < 0.6 ? 0.012 * (0.6 - y) / 0.3 : 0)];
  };
  // 外层 + 内层，边缘共享顶点：闭合薄片
  const g: Geo = { pos: [], nrm: [], idx: [] };
  const id = (i: number, j: number, layer: number) => {
    const edge = i === 0 || i === nv || j === 0 || j === nu;
    if (edge) return outerIdx[i][j];
    return layer === 0 ? outerIdx[i][j] : innerIdx[i][j];
  };
  const outerIdx: number[][] = [];
  const innerIdx: number[][] = [];
  for (let i = 0; i <= nv; i++) {
    outerIdx.push([]);
    innerIdx.push([]);
    for (let j = 0; j <= nu; j++) {
      const u = (j / nu) * 2 - 1;
      const v = i / nv;
      const p = surf(u, v, 0);
      outerIdx[i].push(g.pos.length / 3);
      g.pos.push(...p);
      const q = surf(u, v, -d);
      innerIdx[i].push(g.pos.length / 3);
      g.pos.push(...q);
    }
  }
  for (let i = 0; i < nv; i++) {
    for (let j = 0; j < nu; j++) {
      // 外层：列（u 向 +X）× 行（v 向下）= 朝内，所以反过来
      const a = id(i, j, 0), b = id(i, j + 1, 0), c = id(i + 1, j, 0), e = id(i + 1, j + 1, 0);
      g.idx.push(a, c, b, b, c, e);
      const a2 = id(i, j, 1), b2 = id(i, j + 1, 1), c2 = id(i + 1, j, 1), e2 = id(i + 1, j + 1, 1);
      // 三个顶点都在边缘上的内层三角形和外层重合（方向相反），跳过
      if (!(a2 === a && b2 === b && c2 === c)) g.idx.push(a2, b2, c2);
      if (!(b2 === b && e2 === e && c2 === c)) g.idx.push(b2, e2, c2);
    }
  }
  // 只保留被三角形用到的顶点（内层边缘顶点和外层共用）
  const used = new Set(g.idx);
  const remap = new Map<number, number>();
  const pos: number[] = [];
  for (let v = 0; v < g.pos.length / 3; v++) {
    if (!used.has(v)) continue;
    remap.set(v, pos.length / 3);
    pos.push(g.pos[v * 3], g.pos[v * 3 + 1], g.pos[v * 3 + 2]);
  }
  const out: Geo = { pos, nrm: [], idx: g.idx.map((v) => remap.get(v) as number) };
  return computeNormals(out);
}

function radiusAtTorso(t: Torso, y: number): number {
  return radiusAt(t.profile, y);
}


