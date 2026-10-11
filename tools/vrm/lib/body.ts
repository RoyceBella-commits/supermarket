// 身体与服装（不含头）。基准尺寸、T-pose、面向 +Z、角色左手在 +X。
// 只写左半边的四肢，右边由 mirrorPart 镜像生成。
// 面数按"2–5 m 外看不出棱角"来定：大块曲面 24–28 段，小零件 10–16 段。

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
  radius: (y: number) => number;
}

function makeTorso(profile: Profile, kz: number): Torso {
  return {
    profile,
    kz,
    radius: (y) => radiusAt(profile, y),
    frontZ: (x, y) => {
      const r = radiusAt(profile, y);
      return kz * Math.sqrt(Math.max(0, r * r - x * x));
    },
  };
}

/** 上衣主体轮廓（从下摆到肩）。k：整体放宽；hemDrop：下摆往下加长（厨师服） */
function topProfile(k: number, hemDrop: number): Profile {
  const pts: Profile = [
    [0, 0.47],
    [0.1, 0.47],
    [0.15, 0.474],
    [0.162, 0.488],
    [0.167, 0.515],
    [0.167, 0.57],
    [0.162, 0.64],
    [0.153, 0.71],
    [0.145, 0.775],
    [0.136, 0.83],
    [0.122, 0.872],
    [0.098, 0.902],
    [0.066, 0.922],
    [0.04, 0.93],
    [0, 0.932],
  ];
  return pts.map(([r, y]) => {
    const yy = y < 0.6 ? y - hemDrop * ((0.6 - y) / 0.13) : y;
    // 肩部以上（领口）不随体型放大
    const kk = y > 0.9 ? 1 + (k - 1) * 0.3 : k;
    return [r * kk, yy];
  });
}

export interface BodyMats {
  skin: string;
  top: string;
  topAccent: string;
  string: string;
  inner: string;
  innerAccent: string;
  bottom: string;
  bottomAccent: string;
  shoe: string;
  sole: string;
  sock: string;
  apronTie: string;
  white: string;
  neckwear: string;
}

export interface BodyResult {
  parts: Part[];
  /** 抽绳骨链（spring bone） */
  strings?: { joints: { name: string; pos: V3 }[] }[];
}

type Garment = 'hoodie' | 'tshirt' | 'polo' | 'jersey' | 'shirt' | 'chef';

export function buildBody(spec: AvatarSpec, m: BodyMats): BodyResult {
  const parts: Part[] = [];
  const left: Part[] = []; // 左侧四肢，最后统一镜像
  const body = (geo: Geo, mat: string, bone: string | WeightFn) => parts.push({ geo, mat, mesh: 'body', bone });
  const L = (geo: Geo, mat: string, bone: string | WeightFn) => left.push({ geo, mat, mesh: 'body', bone });
  const Y = B.armY;
  const girth = spec.girth ?? 1;
  const limb = 0.75 + 0.25 * girth;
  let strings: BodyResult['strings'];

  // ---------- 脖子 ----------
  // 放进 head 网格（thirdPersonOnly）：第一人称相机就在脖子正上方，否则低头会看到一个肉色球
  parts.push({ geo: capsule([0, 0.86, -0.004], [0, 1.01, -0.004], 0.047, 0.047, 12, 3), mat: m.skin, mesh: 'head', bone: 'Neck' });

  // ---------- 上衣 ----------
  const top = spec.top;
  // 最里层穿的是什么
  const garment: Garment = top === 'apron' ? (spec.innerTop ?? 'shirt') : top === 'vest' ? 'shirt' : top;
  const layered = top === 'apron' || top === 'vest';
  const baseMat = layered ? m.inner : m.top;
  const trimMat = layered ? m.innerAccent : m.topAccent;
  const loose = garment === 'hoodie' ? 1.02 : garment === 'chef' ? 1.03 : 1;
  const torso = makeTorso(topProfile(loose * girth, garment === 'chef' ? 0.05 : 0), 0.78);
  body(revolve(torso.profile, 24, 1, torso.kz), baseMat, torsoWeights);
  const hemY = torso.profile[1][1];
  const hemR = radiusAt(torso.profile, hemY + 0.016);

  const longSleeve = garment === 'hoodie' || garment === 'shirt' || garment === 'chef';
  // 外层（名牌贴在哪一层上）
  let tagOffset = 0.004;

  const collarFlaps = (mat: string) => {
    for (const sx of [1, -1]) {
      const c: V3 = [0.034 * sx, 0.89, torso.frontZ(0.034, 0.89) + 0.003];
      body(ellipsoid(c, [0.038, 0.028, 0.007], [-0.5, 0.35 * sx, -0.75 * sx], 14, 8), mat, 'Chest');
    }
  };
  const buttons = (xs: number[], ys: number[], mat: string, lift = 0.002) => {
    for (const x of xs) for (const y of ys) body(ellipsoid([x, y, torso.frontZ(x, y) + lift], [0.0075, 0.0075, 0.004], [0, 0, 0], 8, 6), mat, torsoWeights);
  };
  const hemBand = (mat: string, r: number) => body(torus([0, hemY + 0.008, 0], hemR, r, [0, 1, 0], 22, 5, [1, 1, 0.79]), mat, torsoWeights);

  if (garment === 'hoodie') {
    body(torus([0, hemY + 0.016, 0], hemR, 0.017, [0, 1, 0], 22, 6, [1, 1, 0.79]), m.topAccent, torsoWeights);
    // 袋鼠兜：圆角梯形垫片，贴着肚子弯
    const pocket = ellipsoid([0, 0, 0], [1, 1, 1], [0, 0, 0], 16, 10);
    deform(pocket, (p) => {
      const sx = Math.sign(p.x) * Math.pow(Math.abs(p.x), 0.55);
      const sy = Math.sign(p.y) * Math.pow(Math.abs(p.y), 0.6);
      const y = 0.578 + sy * 0.052;
      const xx = sx * 0.098 * girth * (1 - 0.12 * Math.max(0, (y - 0.578) / 0.052));
      p.set(xx, y, torso.frontZ(xx, y) - 0.006 + (p.z + 1) * 0.011);
    });
    body(pocket, m.topAccent, torsoWeights);
    // 兜帽（放下状态）：脖子一圈 + 背后一团
    body(torus([0, 0.918, -0.018], 0.068, 0.028, [0, 1, 0.12], 24, 8, [1, 1, 0.95]), m.top, 'Chest');
    body(ellipsoid([0, 0.875, -0.112 * girth], [0.105, 0.075, 0.042], [-0.28, 0, 0]), m.top, 'Chest');
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
      body(tube(pathPt, (s) => 0.0055 * Math.sqrt(Math.min(1, s / 0.05)), 10, 6, [1, 0, 0]), m.string, w);
      const e = pathPt(1);
      body(capsule([e[0], e[1] + 0.004, e[2]], [e[0], e[1] - 0.022, e[2] + 0.002], 0.0085, 0.0085, 8, 2), m.string, joints[1].name);
    }
    tagOffset = 0.006;
  } else if (garment === 'tshirt') {
    body(torus([0, 0.912, 0.006], 0.06, 0.012, [0, 1, 0.25], 20, 6), trimMat, 'Chest');
    hemBand(baseMat, 0.009);
  } else if (garment === 'polo') {
    collarFlaps(trimMat);
    body(torus([0, 0.912, -0.004], 0.058, 0.013, [0, 1, 0.18], 20, 6), trimMat, 'Chest');
    // 门襟：一条细长垫片 + 两颗扣子
    const plY = 0.83;
    body(ellipsoid([0, plY, torso.frontZ(0, plY) + 0.001], [0.011, 0.05, 0.004], [-0.12, 0, 0], 10, 8), trimMat, 'Chest');
    buttons([0], [0.855, 0.81], baseMat, 0.005);
    hemBand(baseMat, 0.009);
  } else if (garment === 'jersey') {
    // V 领：两根细条在胸口拼成 V；身侧各一条竖条纹
    for (const sx of [1, -1]) {
      const a: V3 = [0.055 * sx, 0.915, torso.frontZ(0.055, 0.915) + 0.004];
      const b: V3 = [0, 0.85, torso.frontZ(0, 0.85) + 0.004];
      body(capsule(a, b, 0.009, 0.009, 8, 2), trimMat, 'Chest');
      const stripe = tube(
        (s) => {
          const y = lerp(0.84, hemY + 0.02, s);
          const r = radiusAt(torso.profile, y) + 0.001;
          return [r * Math.sin((sx * Math.PI) / 2), y, 0];
        },
        () => 0.012,
        10,
        6,
        [0, 0, 1],
      );
      deform(stripe, (p) => {
        // 压扁贴在身侧
        const r = radiusAt(torso.profile, p.y);
        const dx = Math.abs(p.x) - r;
        p.x = Math.sign(p.x) * (r + dx * 0.35);
      });
      body(stripe, trimMat, torsoWeights);
    }
    body(torus([0, 0.913, -0.01], 0.058, 0.01, [0, 1, 0.12], 20, 6), trimMat, 'Chest');
    hemBand(baseMat, 0.009);
  } else if (garment === 'chef') {
    // 厨师服：立领 + 双排扣
    body(torus([0, 0.912, -0.002], 0.06, 0.016, [0, 1, 0.15], 20, 6), baseMat, 'Chest');
    buttons([0.045 * girth, -0.045 * girth], [0.81, 0.73, 0.65], trimMat, 0.004);
    hemBand(baseMat, 0.01);
  } else {
    // 衬衫：翻领 + 门襟纽扣
    collarFlaps(baseMat);
    body(torus([0, 0.912, -0.004], 0.058, 0.014, [0, 1, 0.18], 20, 6), baseMat, 'Chest');
    if (top !== 'vest' && top !== 'apron') buttons([0], [0.84, 0.76, 0.68, 0.6], trimMat);
    hemBand(baseMat, 0.009);
  }

  // ---------- 外层：马甲 / 围裙 ----------
  if (top === 'vest') {
    const off = 0.008;
    // 前面 V 字开口：上宽下窄
    const gap = (y: number) => lerp(0.1, 0.78, smoothstep(0.66, 0.89, y));
    const vest = patchGeo(
      (u, v, o) => {
        const y = lerp(0.885, hemY + 0.03, v);
        const g = gap(y);
        const th = g + ((u + 1) / 2) * (Math.PI * 2 - 2 * g);
        const r = radiusAt(torso.profile, y) + off + o;
        return [r * Math.sin(th), y, r * Math.cos(th) * torso.kz];
      },
      28,
      10,
      0.006,
    );
    body(vest, m.top, torsoWeights);
    // 马甲扣子（在左片边上）
    for (const y of [0.64, 0.58, 0.52]) {
      const x = 0.012;
      body(ellipsoid([x, y, torso.frontZ(x, y) + off + 0.004], [0.007, 0.007, 0.004], [0, 0, 0], 8, 6), m.topAccent, torsoWeights);
    }
    tagOffset = off + 0.006;
  }

  if (top === 'apron') {
    const waist = spec.apronStyle === 'waist';
    const apron = apronGeo(torso, spec.bottom === 'skirt', waist);
    body(
      apron,
      m.top,
      blendY([
        [0.5, 'Hips'],
        [0.64, 'Spine'],
        [0.8, 'Chest'],
      ]),
    );
    const wr = radiusAt(torso.profile, 0.615) + 0.004;
    body(torus([0, 0.615, 0], wr, 0.011, [0, 1, 0], 22, 5, [1, 1, 0.8]), m.apronTie, torsoWeights);
    const bz = -wr * 0.8 - 0.004;
    body(ellipsoid([0.03, 0.615, bz], [0.03, 0.02, 0.012], [0, 0, 0.5], 10, 8), m.apronTie, 'Spine');
    body(ellipsoid([-0.03, 0.615, bz], [0.03, 0.02, 0.012], [0, 0, -0.5], 10, 8), m.apronTie, 'Spine');
    if (!waist) {
      // 肩带：从胸片上角绕过脖子
      body(torus([0, 0.9, 0.0], 0.085, 0.009, [0, 1, 0.55], 20, 6, [1, 1, 1]), m.top, 'Chest');
      tagOffset = 0.012 + 0.007 + 0.004;
    }
  }

  // ---------- 领饰 ----------
  const nw = spec.neckwear ?? 'none';
  const nz = (y: number, x = 0) => torso.frontZ(x, y);
  if (nw === 'bowtie') {
    const c: V3 = [0, 0.893, nz(0.893) + 0.014];
    body(ellipsoid([c[0] + 0.02, c[1], c[2]], [0.021, 0.014, 0.008], [0, 0, 0.18], 12, 8), m.neckwear, 'Chest');
    body(ellipsoid([c[0] - 0.02, c[1], c[2]], [0.021, 0.014, 0.008], [0, 0, -0.18], 12, 8), m.neckwear, 'Chest');
    body(ellipsoid([c[0], c[1], c[2] + 0.004], [0.008, 0.009, 0.008], [0, 0, 0], 8, 6), m.neckwear, 'Chest');
  } else if (nw === 'tie') {
    body(ellipsoid([0, 0.888, nz(0.888) + 0.012], [0.011, 0.011, 0.008], [0, 0, 0], 8, 6), m.neckwear, 'Chest');
    const blade = ellipsoid([0, 0, 0], [1, 1, 1], [0, 0, 0], 10, 12);
    deform(blade, (p) => {
      const y = 0.78 + 0.1 * p.y;
      let w = 0.019 * (0.6 + 0.4 * (1 - p.y) / 2);
      if (p.y < -0.65) w *= (p.y + 1) / 0.35;
      const x = p.x * w;
      p.set(x, y, nz(y, x) + 0.012 + p.z * 0.004);
    });
    body(blade, m.neckwear, torsoWeights);
  } else if (nw === 'scarf') {
    body(torus([0, 0.905, -0.004], 0.066, 0.022, [0, 1, 0.15], 24, 8), m.neckwear, 'Chest');
    const a: V3 = [0.035, 0.885, nz(0.885, 0.035) + 0.016];
    const b: V3 = [0.05, 0.76, nz(0.76, 0.05) + 0.012];
    const tail = capsule(a, b, 0.02, 0.022, 10, 3);
    deform(tail, (p) => {
      // 压扁成布条
      const z0 = nz(p.y, p.x) + 0.012;
      p.z = z0 + (p.z - z0) * 0.35;
    });
    body(tail, m.neckwear, 'Chest');
  } else if (nw === 'neckerchief') {
    body(torus([0, 0.902, -0.004], 0.062, 0.014, [0, 1, 0.16], 20, 6), m.neckwear, 'Chest');
    const kz0 = nz(0.88) + 0.012;
    body(ellipsoid([0, 0.882, kz0], [0.014, 0.012, 0.01], [0, 0, 0], 8, 6), m.neckwear, 'Chest');
    // 前面垂下的三角
    const flap = ellipsoid([0, 0, 0], [1, 1, 1], [0, 0, 0], 10, 8);
    deform(flap, (p) => {
      const y = 0.86 + 0.028 * p.y;
      const x = p.x * 0.03 * (0.15 + 0.85 * (p.y + 1) / 2);
      p.set(x, y, nz(y, x) + 0.008 + p.z * 0.004);
    });
    body(flap, m.neckwear, 'Chest');
  }

  // ---------- 名牌 ----------
  if (spec.nameTag) {
    const tx = garment === 'hoodie' ? 0.078 : 0.058;
    const ty = 0.79;
    body(ellipsoid([tx, ty, torso.frontZ(tx, ty) + tagOffset + 0.003], [0.024, 0.013, 0.003], [0, 0.4, 0], 10, 6), m.white, 'Chest');
  }

  // ---------- 手臂（左） ----------
  const ua = B.upperArmX;
  const la = B.lowerArmX;
  const hx = B.handX;
  const cuffMat = garment === 'hoodie' ? m.topAccent : baseMat;
  L(ellipsoid([ua, Y, 0], [0.058 * limb, 0.058 * limb, 0.056 * limb], [0, 0, 0], 12, 8), baseMat, 'LeftUpperArm');
  if (longSleeve) {
    L(capsule([ua, Y, 0], [la, Y, 0], 0.056 * limb, 0.052 * limb, 12, 3), baseMat, 'LeftUpperArm');
    L(capsule([la, Y, 0], [hx - 0.018, Y, 0], 0.052 * limb, 0.049 * limb, 12, 3), baseMat, 'LeftLowerArm');
    L(torus([hx - 0.018, Y, 0], 0.045 * limb, 0.011, [1, 0, 0], 12, 5), cuffMat, 'LeftLowerArm');
  } else {
    // 短袖：袖子罩住上臂一半，下面露出手臂
    const sleeve = revolve(
      [
        [0, -0.02],
        [0.054 * limb, -0.01],
        [0.06 * limb, 0.04],
        [0.064 * limb, 0.085],
        [0.062 * limb, 0.093],
        [0.05 * limb, 0.095],
        [0, 0.09],
      ],
      14,
    );
    L(alignX(sleeve, ua), baseMat, 'LeftUpperArm');
    if (garment === 'polo' || garment === 'jersey') L(torus([ua + 0.088, Y, 0], 0.06 * limb, 0.008, [1, 0, 0], 14, 5), trimMat, 'LeftUpperArm');
    L(capsule([ua + 0.02, Y, 0], [la, Y, 0], 0.044 * limb, 0.042 * limb, 12, 3), m.skin, 'LeftUpperArm');
    L(capsule([la, Y, 0], [hx, Y, 0], 0.042 * limb, 0.038 * limb, 12, 3), m.skin, 'LeftLowerArm');
  }
  // 手：圆手 + 拇指
  L(ellipsoid([hx + 0.036, Y - 0.002, 0.002], [0.05, 0.043, 0.047], [0, 0, 0], 12, 8), m.skin, 'LeftHand');
  L(ellipsoid([hx + 0.016, Y + 0.004, 0.036], [0.019, 0.017, 0.021], [0, -0.5, 0], 8, 6), m.skin, 'LeftHand');

  // ---------- 下装 ----------
  const lx = B.legX;
  const bottom = spec.bottom;
  const legK = 0.7 + 0.3 * girth;
  // 胯部（裤子 / 短裤；裙子下面也有一条同色安全裤）。上半截被上衣盖住，行数少一点
  const hipProfile: Profile = [
    [0, 0.425],
    [0.07, 0.427],
    [0.125, 0.442],
    [0.145, 0.47],
    [0.15, 0.51],
    [0.143, 0.6],
    [0, 0.62],
  ].map(([r, y]) => [r * girth, y] as [number, number]);
  body(revolve(hipProfile, 20, 1, 0.8), m.bottom, 'Hips');

  const bareLeg = bottom !== 'pants';
  if (bottom === 'pants') {
    L(capsule([lx, B.upperLegY, 0], [lx, B.lowerLegY, 0], 0.07 * legK, 0.068 * legK, 12, 3), m.bottom, 'LeftUpperLeg');
    L(capsule([lx, B.lowerLegY, 0], [lx, 0.105, 0], 0.068 * legK, 0.07 * legK, 12, 3), m.bottom, 'LeftLowerLeg');
    L(torus([lx, 0.108, 0], 0.067 * legK, 0.012, [0, 1, 0], 12, 5), m.bottomAccent, 'LeftLowerLeg');
  } else if (bottom === 'shorts') {
    const short = revolve(
      [
        [0, 0.52],
        [0.068 * legK, 0.5],
        [0.074 * legK, 0.44],
        [0.077 * legK, 0.39],
        [0.075 * legK, 0.382],
        [0.062 * legK, 0.38],
        [0, 0.39],
      ],
      16,
    );
    L(translateGeo(short, lx, 0, 0), m.bottom, 'LeftUpperLeg');
  } else {
    // 裙子：外层往下、裙摆卷边、内层往上，绑在胯上
    // 上衣下摆以上的部分收在衣服里面（避免和上衣表面重合闪烁），下摆以下才张开
    const sk: Profile = [
      [0.12, 0.6],
      [0.128, 0.5],
      [0.142, 0.462],
      [0.17, 0.42],
      [0.2, 0.37],
      [0.203, 0.36],
      [0.212, 0.358],
      [0.215, 0.364],
      [0.207, 0.38],
      [0.178, 0.42],
      [0.15, 0.462],
      [0.138, 0.5],
      [0.13, 0.6],
      [0.0, 0.61],
    ];
    const skirt = revolve(
      sk.map(([r, y]) => [r * girth, y] as [number, number]),
      24,
      1,
      0.86,
    );
    body(skirt, m.bottom, 'Hips');
  }
  if (bareLeg) {
    L(capsule([lx, B.upperLegY, 0], [lx, B.lowerLegY, 0], 0.058 * legK, 0.054 * legK, 12, 3), m.skin, 'LeftUpperLeg');
    L(capsule([lx, B.lowerLegY, 0], [lx, 0.15, 0], 0.054 * legK, 0.048 * legK, 12, 3), m.skin, 'LeftLowerLeg');
    // 袜子（长筒袜到膝盖下）
    // 袜子要比小腿粗一圈，否则和皮肤表面重合会闪
    const knee = spec.sockHeight === 'knee';
    const top0 = knee ? 0.25 : 0.15;
    const sr = (knee ? 0.059 : 0.053) * legK;
    const sock = revolve(
      [
        [0, 0.05],
        [sr, 0.06],
        [sr, top0],
        [sr + 0.004, top0 + 0.02],
        [sr - 0.004, top0 + 0.028],
        [0, top0 + 0.02],
      ],
      14,
    );
    L(translateGeo(sock, lx, 0, 0), m.sock, 'LeftLowerLeg');
  }

  // ---------- 鞋 ----------
  const shoe = ellipsoid([lx, 0.058, 0.026], [0.068, 0.058, 0.112], [0, 0, 0], 16, 10);
  deform(shoe, (p) => {
    if (p.y < 0.022) p.y = 0.022;
  });
  L(shoe, m.shoe, 'LeftFoot');
  const sole = ellipsoid([lx, 0.03, 0.026], [0.073, 0.034, 0.118], [0, 0, 0], 16, 7);
  deform(sole, (p) => {
    if (p.y < 0) p.y = 0;
  });
  L(sole, m.sole, 'LeftFoot');
  // 鞋舌/鞋带区：一块浅色小垫片
  L(ellipsoid([lx, 0.095, 0.05], [0.032, 0.012, 0.04], [-0.55, 0, 0], 10, 6), m.sole, 'LeftFoot');

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

/**
 * 有厚度的"枕头"形薄片：surf(u, v, off) 给出外表面（off=0）和内表面（off=-d）上的点，
 * u ∈ [-1, 1]（沿 +X 方向），v ∈ [0, 1]（从上往下）。外层和内层共享边缘顶点，成为闭合的薄片。
 */
function patchGeo(surf: (u: number, v: number, off: number) => V3, nu: number, nv: number, d: number): Geo {
  const g: Geo = { pos: [], nrm: [], idx: [] };
  const outerIdx: number[][] = [];
  const innerIdx: number[][] = [];
  for (let i = 0; i <= nv; i++) {
    outerIdx.push([]);
    innerIdx.push([]);
    for (let j = 0; j <= nu; j++) {
      const u = (j / nu) * 2 - 1;
      const v = i / nv;
      outerIdx[i].push(g.pos.length / 3);
      g.pos.push(...surf(u, v, 0));
      const edge = i === 0 || i === nv || j === 0 || j === nu;
      if (edge) innerIdx[i].push(outerIdx[i][j]);
      else {
        innerIdx[i].push(g.pos.length / 3);
        g.pos.push(...surf(u, v, -d));
      }
    }
  }
  for (let i = 0; i < nv; i++) {
    for (let j = 0; j < nu; j++) {
      // 外层：列（u 向 +X）× 行（v 向下）= 朝内，所以反过来
      const a = outerIdx[i][j], b = outerIdx[i][j + 1], c = outerIdx[i + 1][j], e = outerIdx[i + 1][j + 1];
      g.idx.push(a, c, b, b, c, e);
      const a2 = innerIdx[i][j], b2 = innerIdx[i][j + 1], c2 = innerIdx[i + 1][j], e2 = innerIdx[i + 1][j + 1];
      // 三个顶点都在边缘上的内层三角形和外层重合（方向相反），跳过
      if (!(a2 === a && b2 === b && c2 === c)) g.idx.push(a2, b2, c2);
      if (!(b2 === b && e2 === e && c2 === c)) g.idx.push(b2, e2, c2);
    }
  }
  return computeNormals(g);
}

/** 围裙前片：bib = 胸片 + 裙片；waist = 只有腰下半截 */
function apronGeo(torso: Torso, overSkirt: boolean, waist: boolean): Geo {
  const yTop = waist ? 0.62 : 0.845;
  const yBot = overSkirt ? 0.33 : 0.37;
  // 半宽（角度）随高度变化：胸片窄，腰以下变宽
  const halfAngle = (y: number) => lerp(0.42, 0.95, smoothstep(0.7, 0.6, y));
  return patchGeo(
    (u, v, off) => {
      const y = lerp(yTop, yBot, v);
      let r: number;
      if (y > 0.6) r = radiusAt(torso.profile, y) + 0.012;
      else {
        const below = (0.6 - y) / 0.3;
        r = radiusAt(torso.profile, 0.6) + 0.012 + (overSkirt ? 0.06 : 0.025) * below + 0.004;
      }
      r += off;
      const a = u * halfAngle(y);
      return [r * Math.sin(a), y, r * Math.cos(a) * torso.kz + (y < 0.6 ? (0.012 * (0.6 - y)) / 0.3 : 0)];
    },
    14,
    waist ? 10 : 18,
    0.007,
  );
}
