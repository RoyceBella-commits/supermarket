// 发型。核心是"发壳"：在单位空间里逐列（绕 Y 轴的角度 θ，0° = 正前方 +Z）生成一条截面曲线：
//   外表面沿球面从头顶往下到边缘角 φe(θ)（可再垂直下垂 L(θ)，做波波头），
//   边缘处卷一个半圆收进头皮里（看起来有厚度、描边连续），再往回贴着里面走几行藏进头里。
// 所有参数都是 θ 的平滑函数，所以整块网格光滑、没有锯齿。

import type { HairStyle } from '../../../src/data/avatars.ts';
import { type Geo, type V3, bezier, ellipsoid, gridSurface, periodic, smoothstep, torus, tube } from './geom.ts';
import { type HeadShape, mapUnit } from './head.ts';
import type { Part, WeightFn } from './parts.ts';
import { chainWeights } from './parts.ts';

export interface ShellSpec {
  /** 边缘离头顶的角度（度），θ 为度数，-180..180，正值在角色左侧（+X） */
  edge: (deg: number) => number;
  /** 发壳厚度（单位空间，1 ≈ 头半径） */
  thick: (deg: number) => number;
  /** 边缘之后垂直下垂的长度（单位空间） */
  drop?: (deg: number) => number;
  /** 下垂末端往外翘的量 */
  flare?: (deg: number) => number;
  /** 头顶额外蓬松量 */
  topBoost?: number;
  cols?: number;
}

export function hairShell(h: HeadShape, s: ShellSpec): Geo {
  const cols = s.cols ?? 104;
  const A = 26; // 外表面行数
  const R = 7; // 卷边行数
  const I = 4; // 内侧行数
  const topBoost = s.topBoost ?? 0.035;

  type Col = (i: number) => [number, number];
  const columns: Col[] = [];
  for (let j = 0; j < cols; j++) {
    let deg = (j / cols) * 360;
    if (deg > 180) deg -= 360;
    const phiE = (s.edge(deg) * Math.PI) / 180;
    const tau = s.thick(deg);
    const L = s.drop?.(deg) ?? 0;
    const fl = s.flare?.(deg) ?? 0;
    const tauAt = (phi: number) => tau + topBoost * Math.pow(Math.max(0, Math.cos(phi)), 2);
    const outerArc = (phi: number): [number, number] => {
      const r = 1 + tauAt(phi);
      return [r * Math.sin(phi), r * Math.cos(phi)];
    };
    const arcLen = phiE * (1 + tau);
    const total = arcLen + L;
    const pe = outerArc(phiE);
    // 外表面上 s 处的点、切线、外法线
    const outerAt = (sv: number): { p: [number, number]; t: [number, number]; tau: number } => {
      if (sv <= arcLen || L <= 1e-6) {
        const phi = Math.min(phiE, (sv / arcLen) * phiE);
        const p = outerArc(phi);
        // 数值切线
        const p2 = outerArc(Math.min(phiE + 1e-3, phi + 1e-3));
        const p1 = outerArc(Math.max(0, phi - 1e-3));
        const tx = p2[0] - p1[0];
        const ty = p2[1] - p1[1];
        const l = Math.hypot(tx, ty) || 1;
        return { p, t: [tx / l, ty / l], tau: tauAt(phi) };
      }
      const u = (sv - arcLen) / L;
      const p: [number, number] = [pe[0] + fl * u * u, pe[1] - L * u];
      const tx = 2 * fl * u;
      const ty = -L;
      const l = Math.hypot(tx, ty) || 1;
      return { p, t: [tx / l, ty / l], tau: tauAt(phiE) };
    };
    const end = outerAt(total);
    const nEnd: [number, number] = [-end.t[1], end.t[0]];
    const tauE = end.tau;
    const cRoll: [number, number] = [end.p[0] - (nEnd[0] * tauE) / 2, end.p[1] - (nEnd[1] * tauE) / 2];
    const back = Math.max(L * 0.9, 0.35);
    columns.push((i: number): [number, number] => {
      if (i === 0) return [0, 1 + tauAt(0)];
      if (i <= A) {
        const sv = (i / A) * total;
        return outerAt(sv).p;
      }
      if (i <= A + R) {
        const a = (Math.PI * (i - A)) / R;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        return [
          cRoll[0] + (tauE / 2) * (ca * nEnd[0] + sa * end.t[0]),
          cRoll[1] + (tauE / 2) * (ca * nEnd[1] + sa * end.t[1]),
        ];
      }
      const q = i - A - R;
      const sv = total - (q / I) * back;
      const o = outerAt(sv);
      const n: [number, number] = [-o.t[1], o.t[0]];
      const d = o.tau + 0.002 + 0.06 * (q / I) * (q / I);
      return [o.p[0] - n[0] * d, o.p[1] - n[1] * d];
    });
  }

  return gridSurface(
    1 + A + R + I,
    cols,
    (i, j) => {
      const [rho, y] = columns[j](i);
      const th = (j / cols) * Math.PI * 2;
      return mapUnit(h, rho * Math.sin(th), y, rho * Math.cos(th));
    },
    // 行往下走、列往 +X 转：d列 × d行 指向内，所以翻转
    { wrap: true, poleStart: true, flip: true },
  );
}

/** 前刘海的发尖：在 |θ| < width 范围内让边缘往下长出若干缕 */
function fringe(amp: number, period: number, offset: number, width: number, sharp = 0.7): (deg: number) => number {
  // |cos|^p：发尖处圆润，两缕之间是尖的 V 形缺口
  return (deg) => {
    const w = 1 - smoothstep(width - 14, width, Math.abs(deg));
    const c = Math.abs(Math.cos((Math.PI * (deg - offset)) / period));
    return amp * Math.pow(c, sharp) * w;
  };
}

export interface HairCtx {
  h: HeadShape;
  hairMat: string;
  tieMat: string;
  /** 刘海在额头上的阴影（动漫常见的发影） */
  shadowMat: string;
}

/**
 * 刘海投在额头上的一条阴影带：贴着头皮，沿发际线 φe(θ) 往下几度。
 * 刘海离额头有 1 cm 左右，没有这条带时发尖下会露出一道亮缝。
 */
function hairShadow(h: HeadShape, edge: (deg: number) => number, maxDeg: number): Geo {
  const cols = 72;
  const rows = 4;
  return gridSurface(
    rows,
    cols + 1,
    (i, j) => {
      const deg = -maxDeg + (2 * maxDeg * j) / cols;
      const taper = 1 - smoothstep(maxDeg - 22, maxDeg, Math.abs(deg));
      const pe = edge(deg);
      const phi = ((pe - 3 + (i / (rows - 1)) * (3 + 4.5 * taper)) * Math.PI) / 180;
      const th = (deg * Math.PI) / 180;
      const r = 1.004;
      return mapUnit(h, r * Math.sin(phi) * Math.sin(th), r * Math.cos(phi), r * Math.sin(phi) * Math.cos(th));
    },
    { flip: true },
  );
}

/** 返回头发部件（全部绑到 Head，马尾绑到额外的马尾骨链） */
export function buildHair(style: HairStyle, ctx: HairCtx): { parts: Part[]; tail?: { joints: { name: string; pos: V3 }[] } } {
  const { h } = ctx;
  const parts: Part[] = [];
  const add = (geo: Geo, mat = ctx.hairMat, bone: string | WeightFn = 'Head') => parts.push({ geo, mat, mesh: 'head', bone });
  let shell: ShellSpec;
  let tail: { joints: { name: string; pos: V3 }[] } | undefined;

  if (style === 'short') {
    const base = periodic(
      [
        [0, 67],
        [22, 68],
        [-22, 68],
        [44, 77],
        [-44, 77],
        [60, 96],
        [-60, 96],
        [72, 103],
        [-72, 103],
        [86, 90],
        [-86, 90],
        [102, 93],
        [-102, 93],
        [125, 109],
        [-125, 109],
        [152, 119],
        [-152, 119],
        [180, 122],
      ],
      9,
    );
    const fr = fringe(8, 25, 8, 52, 0.75);
    shell = {
      edge: (d) => base(d) + fr(d),
      thick: periodic([[0, 0.05], [35, 0.055], [90, 0.075], [180, 0.1]], 30),
      topBoost: 0.045,
    };
    // 头顶一撮呆毛
    const top = mapUnit(h, 0, 1.08, -0.2);
    add(
      tube(
        bezier(top, [top[0], top[1] + 0.035, top[2] - 0.008], [top[0], top[1] + 0.06, top[2] + 0.035], [top[0], top[1] + 0.04, top[2] + 0.06]),
        (s) => 0.0115 * Math.pow(Math.sin(Math.PI * (0.2 + 0.8 * s)), 0.7),
        16,
        10,
      ),
    );
  } else if (style === 'buzz') {
    const base = periodic(
      [
        [0, 63],
        [40, 70],
        [-40, 70],
        [66, 88],
        [-66, 88],
        [95, 90],
        [-95, 90],
        [130, 108],
        [-130, 108],
        [180, 116],
      ],
      14,
    );
    shell = { edge: base, thick: () => 0.03, topBoost: 0.012 };
  } else if (style === 'bob') {
    const base = periodic(
      [
        [0, 70],
        [25, 70],
        [-25, 70],
        [50, 82],
        [-50, 82],
        [70, 95],
        [-70, 95],
        [180, 96],
      ],
      12,
    );
    const fr = fringe(3, 16, 0, 46, 0.6);
    shell = {
      edge: (d) => base(d) + fr(d),
      thick: periodic([[0, 0.055], [60, 0.08], [90, 0.09], [180, 0.11]], 30),
      drop: (d) => 0.62 * smoothstep(40, 64, Math.abs(d)),
      flare: (d) => 0.07 * smoothstep(40, 64, Math.abs(d)),
      topBoost: 0.045,
    };
  } else {
    // ponytail / bun：额头侧分刘海，两侧和后面收紧
    const base = periodic(
      [
        [0, 67],
        [-20, 64],
        [24, 72],
        [-44, 75],
        [46, 80],
        [62, 96],
        [-62, 96],
        [74, 100],
        [-74, 100],
        [88, 90],
        [-88, 90],
        [104, 93],
        [-104, 93],
        [130, 108],
        [-130, 108],
        [180, 116],
      ],
      9,
    );
    const fr = fringe(8, 30, 18, 48, 0.8);
    shell = {
      edge: (d) => base(d) + fr(d),
      thick: periodic([[0, 0.05], [40, 0.055], [90, 0.058], [180, 0.07]], 30),
      topBoost: 0.035,
    };
    // 鬓角两缕细发，垂在耳朵前面
    for (const side of [1, -1]) {
      const th = ((60 * Math.PI) / 180) * side;
      const at = (phiDeg: number, r: number): V3 => {
        const ph = (phiDeg * Math.PI) / 180;
        return mapUnit(h, r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph), r * Math.sin(ph) * Math.cos(th));
      };
      const p0 = at(84, 1.03);
      const p1 = at(100, 1.06);
      const p2 = at(118, 1.04);
      const p3 = at(134, 0.99);
      add(tube(bezier(p0, p1, p2, p3), (s) => 0.016 * Math.pow(Math.sin(Math.PI * (0.25 + 0.75 * s)), 0.6), 18, 10, [0, 0, 1]));
    }
    if (style === 'bun') {
      const c = mapUnit(h, 0, 0.93, -0.55);
      add(ellipsoid([c[0], c[1] + 0.035, c[2] - 0.02], [0.072, 0.066, 0.07], [-0.5, 0, 0], 24, 16));
      add(torus([c[0], c[1] - 0.008, c[2] + 0.006], 0.046, 0.012, [0, 0.85, -0.5], 24, 8), ctx.tieMat);
    } else {
      // 马尾：发圈 + 一条沿贝塞尔曲线的锥形管，绑到马尾骨链上（有 spring bone）
      const tie = mapUnit(h, 0, 0.3, -1.08);
      const p0: V3 = [tie[0], tie[1], tie[2] + 0.012];
      const path = bezier(p0, [p0[0], p0[1] + 0.03, p0[2] - 0.11], [p0[0], p0[1] - 0.08, p0[2] - 0.15], [p0[0], p0[1] - 0.27, p0[2] - 0.085]);
      const radius = (s: number) => 0.056 * Math.pow(Math.sin(Math.PI * (0.13 + 0.87 * s)), 0.75);
      const joints = [0, 0.33, 0.66, 1].map((sv, k) => ({ name: `HairTail${k + 1}`, pos: path(sv) }));
      const wfn = chainWeights(
        joints.map((jn) => jn.pos),
        joints.map((jn) => jn.name),
      );
      add(tube(path, radius, 26, 16, [1, 0, 0]), ctx.hairMat, wfn);
      const t0 = path(0.02);
      const t1 = path(0.06);
      add(torus(path(0.03), 0.033, 0.012, [t1[0] - t0[0], t1[1] - t0[1], t1[2] - t0[2]], 24, 8), ctx.tieMat, 'HairTail1');
      tail = { joints };
    }
  }
  add(hairShell(h, shell));
  if (style !== 'buzz') parts.push({ geo: hairShadow(h, shell.edge, 78), mat: ctx.shadowMat, mesh: 'head', bone: 'Head' });
  return { parts, tail };
}

/** 帽子：用发壳函数做一个更大的壳当帽身，前面一片帽檐 */
export function buildCap(h: HeadShape, mat: string, accentMat: string): Part[] {
  const parts: Part[] = [];
  const crown = hairShell(h, {
    edge: periodic([[0, 62], [90, 84], [180, 96]], 40),
    thick: () => 0.17,
    topBoost: 0.0,
    cols: 96,
  });
  parts.push({ geo: crown, mat, mesh: 'head', bone: 'Head' });
  const front = mapUnit(h, 0, Math.cos((66 * Math.PI) / 180) * 1.17, Math.sin((66 * Math.PI) / 180) * 1.17);
  const brim = ellipsoid([front[0], front[1] - 0.012, front[2] + 0.05], [0.13, 0.011, 0.095], [0.32, 0, 0], 32, 12);
  parts.push({ geo: brim, mat, mesh: 'head', bone: 'Head' });
  const top = mapUnit(h, 0, 1.17, 0);
  parts.push({ geo: ellipsoid([top[0], top[1], top[2]], [0.014, 0.008, 0.014]), mat: accentMat, mesh: 'head', bone: 'Head' });
  return parts;
}

