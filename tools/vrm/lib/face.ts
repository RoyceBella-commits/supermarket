// 五官：眼睛、高光、眉毛、嘴、腮红都是贴在脸上的小圆片（极坐标网格），
// 每个表情是一组形状参数；形状对参数是线性的，所以多个表情叠加也还是合理的形状。
// 所有图元都有同一组 morph target（glTF 要求同一 mesh 的图元 target 数相同）。

import type { V3 } from './geom.ts';
import { type HeadShape, faceProject } from './head.ts';

export const MORPHS = [
  'blinkLeft',
  'blinkRight',
  'happy',
  'angry',
  'sad',
  'relaxed',
  'surprised',
  'aa',
  'ih',
  'ou',
  'ee',
  'oh',
  'lookUp',
  'lookDown',
  'lookLeft',
  'lookRight',
] as const;
export type MorphName = (typeof MORPHS)[number];

/** 圆片网格：中心 + nr 圈 × ns 段；返回每个顶点的单位圆坐标和三角形 */
function disc(nr: number, ns: number): { uv: [number, number][]; idx: number[] } {
  const uv: [number, number][] = [[0, 0]];
  for (let r = 1; r <= nr; r++) {
    const rr = r / nr;
    for (let s = 0; s < ns; s++) {
      const a = (s / ns) * Math.PI * 2;
      uv.push([rr * Math.cos(a), rr * Math.sin(a)]);
    }
  }
  const idx: number[] = [];
  const ring = (r: number, s: number) => 1 + (r - 1) * ns + (((s % ns) + ns) % ns);
  for (let s = 0; s < ns; s++) idx.push(0, ring(1, s), ring(1, s + 1));
  for (let r = 1; r < nr; r++) {
    for (let s = 0; s < ns; s++) {
      const a = ring(r, s), b = ring(r, s + 1), c = ring(r + 1, s), d = ring(r + 1, s + 1);
      idx.push(a, c, b, b, c, d);
    }
  }
  return { uv, idx };
}

/** 弯曲椭圆：中心 (cx, cy)，半宽 sx，上半高 su，下半高 sd，弧度 curve（>0 中间上拱 ^），tilt（外侧上扬） */
interface Ell {
  cx: number;
  cy: number;
  sx: number;
  su: number;
  sd: number;
  curve: number;
  tilt: number;
}

function ellShape(e: Ell, side: number, u: number, v: number): [number, number] {
  return [e.cx + e.sx * u, e.cy + (v > 0 ? e.su * v : e.sd * v) + e.curve * (1 - u * u) + e.tilt * side * u];
}

interface Feature {
  mat: string;
  lift: number;
  side: number;
  base: Ell;
  states: Partial<Record<MorphName, Partial<Ell>>>;
  nr: number;
  ns: number;
}

export interface FacePrim {
  mat: string;
  pos: number[];
  nrm: number[];
  idx: number[];
  /** 每个 morph 一份位置增量（顺序同 MORPHS） */
  targets: number[][];
}

export interface FaceColors {
  eye: string;
  eyeLow: string;
  white: string;
  brow: string;
  mouth: string;
  blush: string;
}

const E = (o: Partial<Ell>): Ell => ({ cx: 0, cy: 0, sx: 0.01, su: 0.01, sd: 0.01, curve: 0, tilt: 0, ...o });

/** 五官布局（相对头中心，米，基准尺寸） */
export const FACE = {
  eyeX: 0.077,
  eyeY: -0.032,
  eyeW: 0.0235,
  eyeH: 0.0312,
  browY: 0.0175,
  mouthY: -0.099,
  blushX: 0.126,
  blushY: -0.073,
};

export interface FaceOptions {
  blush: number;
  /** 眼睛大小倍数 */
  eyeScale: number;
  mustache: boolean;
}

export function buildFace(h: HeadShape, mats: FaceColors, opts: FaceOptions): { prims: FacePrim[]; eyeCenter: V3 } {
  const F = { ...FACE, eyeW: FACE.eyeW * opts.eyeScale, eyeH: FACE.eyeH * opts.eyeScale };
  const blush = opts.blush;
  const features: Feature[] = [];

  for (const side of [1, -1]) {
    const blinkSelf: MorphName = side > 0 ? 'blinkLeft' : 'blinkRight';
    const ex = F.eyeX * side;
    const eye = E({ cx: ex, cy: F.eyeY, sx: F.eyeW, su: F.eyeH, sd: F.eyeH });
    // 眼睛形状随表情的变化
    const eyeStates: Partial<Record<MorphName, Partial<Ell>>> = {
      [blinkSelf]: { cy: F.eyeY - 0.011, sx: F.eyeW * 1.08, su: 0.0032, sd: 0.0032, curve: -0.0065 },
      happy: { cy: F.eyeY - 0.006, sx: F.eyeW * 1.12, su: 0.0042, sd: 0.0042, curve: 0.012 },
      relaxed: { cy: F.eyeY - 0.009, sx: F.eyeW * 1.08, su: 0.0035, sd: 0.0035, curve: -0.0045 },
      surprised: { cy: F.eyeY + 0.003, sx: F.eyeW * 1.14, su: F.eyeH * 1.18, sd: F.eyeH * 1.12 },
      sad: { cy: F.eyeY - 0.004, su: F.eyeH * 0.82, sd: F.eyeH * 0.9, tilt: -0.004 },
      angry: { cy: F.eyeY - 0.002, su: F.eyeH * 0.7, sd: F.eyeH * 0.9, tilt: 0.005 },
      lookLeft: { cx: ex + 0.008 },
      lookRight: { cx: ex - 0.008 },
      lookUp: { cy: F.eyeY + 0.006 },
      lookDown: { cy: F.eyeY - 0.006 },
    };
    features.push({ mat: mats.eye, lift: 0.0012, side, base: eye, states: eyeStates, nr: 3, ns: 20 });

    // 眼睛下半部的浅色（让眼睛有点层次），和两个高光：位置由眼睛参数线性推出
    const derive = (k: { ox: number; oy: number; rx: number; ry: number; keep: (s: MorphName) => number }) => {
      const make = (e: Ell, s: MorphName | null): Partial<Ell> => {
        const keep = s ? k.keep(s) : 1;
        const halfH = (e.su + e.sd) / 2;
        return {
          cx: e.cx + k.ox * e.sx,
          cy: e.cy + k.oy * halfH,
          sx: k.rx * e.sx * keep,
          su: k.ry * halfH * keep,
          sd: k.ry * halfH * keep,
          curve: e.curve,
          tilt: e.tilt,
        };
      };
      const st: Partial<Record<MorphName, Partial<Ell>>> = {};
      for (const [name, o] of Object.entries(eyeStates) as [MorphName, Partial<Ell>][]) {
        st[name] = make({ ...eye, ...o }, name);
      }
      return { base: E(make(eye, null)), states: st };
    };
    const closing = (s: MorphName) => (s === blinkSelf || s === 'happy' || s === 'relaxed' ? 0 : 1);
    const low = derive({ ox: 0, oy: -0.46, rx: 0.66, ry: 0.42, keep: closing });
    features.push({ mat: mats.eyeLow, lift: 0.0017, side, base: low.base, states: low.states, nr: 2, ns: 16 });
    const hl1 = derive({ ox: 0.3 * side * 0 + 0.3, oy: 0.4, rx: 0.4, ry: 0.3, keep: closing });
    features.push({ mat: mats.white, lift: 0.0023, side, base: hl1.base, states: hl1.states, nr: 2, ns: 12 });
    const hl2 = derive({ ox: -0.34, oy: -0.5, rx: 0.2, ry: 0.15, keep: closing });
    features.push({ mat: mats.white, lift: 0.0023, side, base: hl2.base, states: hl2.states, nr: 1, ns: 8 });

    // 眉毛：细长弯片
    const bx = 0.077 * side;
    const brow = E({ cx: bx, cy: F.browY, sx: 0.019, su: 0.0038, sd: 0.0038, curve: 0.004 });
    features.push({
      mat: mats.brow,
      lift: 0.0012,
      side,
      base: brow,
      nr: 2,
      ns: 16,
      states: {
        [blinkSelf]: { cy: F.browY - 0.003 },
        happy: { cy: F.browY + 0.004, curve: 0.006 },
        relaxed: { cy: F.browY - 0.001, curve: 0.003 },
        surprised: { cy: F.browY + 0.011, curve: 0.007 },
        sad: { cy: F.browY + 0.004, tilt: -0.0065, curve: 0.002 },
        angry: { cy: F.browY - 0.003, tilt: 0.0075, curve: -0.001 },
      },
    });

    // 腮红
    if (blush > 0) {
      const bl = E({ cx: F.blushX * side, cy: F.blushY, sx: 0.022 + 0.006 * blush, su: 0.012 + 0.003 * blush, sd: 0.012 + 0.003 * blush });
      features.push({
        mat: mats.blush,
        lift: 0.0008,
        side,
        base: bl,
        nr: 2,
        ns: 16,
        states: {
          happy: { sx: bl.sx * 1.15, su: bl.su * 1.15, sd: bl.sd * 1.15, cy: F.blushY + 0.003 },
        },
      });
    }
  }

  // 嘴：中心在 x=0；上下半高分开控制（张嘴时上边平、下边圆，像 D）
  const my = F.mouthY;
  const mouth = E({ cx: 0, cy: my, sx: 0.016, su: 0.0022, sd: 0.0022, curve: -0.005 });
  features.push({
    mat: mats.mouth,
    lift: 0.0012,
    side: 1,
    base: mouth,
    nr: 3,
    ns: 20,
    states: {
      happy: { sx: 0.025, curve: -0.008, su: 0.0025, sd: 0.012, cy: my + 0.003 },
      relaxed: { sx: 0.019, curve: -0.0065 },
      sad: { sx: 0.014, curve: 0.006, cy: my - 0.002 },
      angry: { sx: 0.016, curve: 0.004, su: 0.0026, sd: 0.0026 },
      surprised: { sx: 0.011, curve: 0, su: 0.007, sd: 0.009, cy: my - 0.002 },
      aa: { sx: 0.018, curve: -0.002, su: 0.006, sd: 0.016, cy: my - 0.001 },
      ih: { sx: 0.021, curve: -0.003, su: 0.003, sd: 0.007 },
      ou: { sx: 0.0095, curve: 0, su: 0.007, sd: 0.008 },
      ee: { sx: 0.023, curve: -0.004, su: 0.003, sd: 0.008 },
      oh: { sx: 0.013, curve: 0, su: 0.009, sd: 0.011, cy: my - 0.002 },
    },
  });

  // 小胡子：鼻子下面两撇（用眉毛的颜色），不跟表情动
  if (opts.mustache) {
    for (const side of [1, -1]) {
      features.push({
        mat: mats.brow,
        lift: 0.0013,
        side,
        base: E({ cx: 0.016 * side, cy: -0.079, sx: 0.017, su: 0.0055, sd: 0.0045, curve: 0.0035, tilt: -0.003 }),
        states: {},
        nr: 2,
        ns: 14,
      });
    }
  }

  // 按材质分组成图元
  const byMat = new Map<string, FacePrim>();
  for (const f of features) {
    let prim = byMat.get(f.mat);
    if (!prim) {
      prim = { mat: f.mat, pos: [], nrm: [], idx: [], targets: MORPHS.map(() => []) };
      byMat.set(f.mat, prim);
    }
    const { uv, idx } = disc(f.nr, f.ns);
    const base = prim.pos.length / 3;
    const proj = (e: Ell, u: number, v: number) => {
      const [x, y] = ellShape(e, f.side, u, v);
      return faceProject(h, x, y, f.lift);
    };
    for (const [u, v] of uv) {
      const b = proj(f.base, u, v);
      prim.pos.push(...b.p);
      prim.nrm.push(...b.n);
      MORPHS.forEach((name, k) => {
        const o = f.states[name];
        if (!o) {
          prim.targets[k].push(0, 0, 0);
          return;
        }
        const t = proj({ ...f.base, ...o }, u, v);
        prim.targets[k].push(t.p[0] - b.p[0], t.p[1] - b.p[1], t.p[2] - b.p[2]);
      });
    }
    for (const i of idx) prim.idx.push(base + i);
  }
  const eyeL = faceProject(h, F.eyeX, F.eyeY, 0).p;
  return { prims: [...byMat.values()], eyeCenter: [0, eyeL[1], eyeL[2]] };
}
