// 头部配饰：帽子、耳机、发带、VR 眼镜、眼镜。全部放在 head 网格（第一人称隐藏），绑到 Head 骨。
// 帽子类部件标记 noHeight：身高按头发顶算，高帽子（厨师帽）不把人压矮。

import type { AccessoryStyle } from '../../../src/data/avatars.ts';
import { type Geo, type V3, capsule, deform, ellipsoid, merge, periodic, revolve, torus, translate, tube } from './geom.ts';
import { hairShell } from './hair.ts';
import { type HeadShape, faceProject, mapUnit } from './head.ts';
import type { Part } from './parts.ts';
import { FACE } from './face.ts';

const head = (geo: Geo, mat: string): Part => ({ geo, mat, mesh: 'head', bone: 'Head', noHeight: true });

/** 单位空间方向 (θ, φ)（度）× 半径 → 世界坐标 */
function at(h: HeadShape, thDeg: number, phDeg: number, r: number): V3 {
  const th = (thDeg * Math.PI) / 180;
  const ph = (phDeg * Math.PI) / 180;
  return mapUnit(h, r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph), r * Math.sin(ph) * Math.cos(th));
}

/** 绕头一圈的环（发带、VR 眼镜带）：前面高、后面低 */
function headRing(h: HeadShape, front: number, back: number, r: number, tubeR: number): Geo {
  return tube(
    (s) => {
      const th = s * 360;
      const k = (1 - Math.cos((th * Math.PI) / 180)) / 2;
      return at(h, th, front + (back - front) * k, r + 0.035 * k);
    },
    () => tubeR,
    40,
    8,
    [0, 1, 0],
    true,
  );
}

/** hairLift：头发在额头处的厚度（单位空间），发带/VR 眼镜带贴着头发绕一圈 */
export function buildAccessory(style: AccessoryStyle, h: HeadShape, main: string, accent: string, hairLift = 0.06): Part[] {
  const parts: Part[] = [];
  if (style === 'cap') {
    const crown = hairShell(h, { edge: periodic([[0, 62], [90, 84], [180, 96]], 40), thick: () => 0.17, topBoost: 0, cols: 44, rows: 9 });
    parts.push(head(crown, main));
    const front = mapUnit(h, 0, Math.cos((66 * Math.PI) / 180) * 1.17, Math.sin((66 * Math.PI) / 180) * 1.17);
    parts.push(head(ellipsoid([front[0], front[1] - 0.012, front[2] + 0.05], [0.13, 0.011, 0.095], [0.32, 0, 0], 20, 8), main));
    const top = mapUnit(h, 0, 1.17, 0);
    parts.push(head(ellipsoid(top, [0.014, 0.008, 0.014], [0, 0, 0], 8, 6), accent));
    // 帽檐上沿一条装饰线
    parts.push(head(ellipsoid([front[0], front[1] + 0.012, front[2] - 0.006], [0.07, 0.012, 0.012], [0.4, 0, 0], 12, 6), accent));
  } else if (style === 'sunhat') {
    // 草帽：帽冠 + 宽帽檐（压扁的圆环，外缘下垂）+ 帽带
    const crown = hairShell(h, { edge: periodic([[0, 70], [90, 74], [180, 78]], 40), thick: () => 0.21, topBoost: 0.03, cols: 40, rows: 8 });
    parts.push(head(crown, main));
    const yb = h.c[1] + 0.068;
    const brim = torus([0, 0, 0], 0.27, 0.11, [0, 1, 0], 32, 7, [1, 0.12, 0.92]);
    deform(brim, (p) => {
      const rho = Math.hypot(p.x, p.z / 0.92);
      if (rho > 0.2) p.y -= 0.32 * (rho - 0.2) * (rho - 0.2);
    });
    translate(brim, h.c[0], yb, h.c[2]);
    parts.push(head(brim, main));
    parts.push(head(torus([h.c[0], yb + 0.02, h.c[2]], 0.238, 0.015, [0, 1, 0], 32, 6, [1, 1, 0.9]), accent));
  } else if (style === 'chefhat') {
    // 厨师帽：一圈帽箍 + 上面蓬起的帽顶
    const yb = h.c[1] + 0.1;
    const band = revolve(
      [
        [0, yb - 0.03],
        [0.2, yb - 0.006],
        [0.208, yb + 0.07],
        [0.2, yb + 0.082],
        [0, yb + 0.08],
      ],
      28,
      1,
      0.93,
    );
    translate(band, h.c[0], 0, h.c[2]);
    parts.push(head(band, main));
    parts.push(head(ellipsoid([h.c[0], yb + 0.15, h.c[2] - 0.005], [0.235, 0.105, 0.215], [0, 0, 0], 22, 12), main));
    parts.push(head(ellipsoid([h.c[0] + 0.1, yb + 0.19, h.c[2] - 0.01], [0.13, 0.085, 0.15], [0, 0, -0.3], 14, 8), main));
    parts.push(head(ellipsoid([h.c[0] - 0.1, yb + 0.19, h.c[2] - 0.01], [0.13, 0.085, 0.15], [0, 0, 0.3], 14, 8), main));
  } else if (style === 'beret') {
    const c = mapUnit(h, 0.16, 1.06, -0.06);
    parts.push(head(ellipsoid([c[0], c[1] + 0.012, c[2]], [0.205, 0.055, 0.19], [0.08, 0, -0.2], 22, 10), main));
    parts.push(head(capsule([c[0] - 0.012, c[1] + 0.05, c[2]], [c[0] - 0.016, c[1] + 0.075, c[2]], 0.008, 0.006, 8, 2), accent));
  } else if (style === 'headphones') {
    const yc = h.c[1] - 0.03;
    const A = 0.25;
    const Bv = 0.262;
    parts.push(
      head(
        tube(
          (s) => {
            const t = Math.PI * (0.06 + 0.88 * s);
            return [h.c[0] + A * Math.cos(t), yc + Bv * Math.sin(t), h.c[2] - 0.012];
          },
          () => 0.013,
          22,
          8,
          [0, 0, 1],
        ),
        accent,
      ),
    );
    for (const sx of [1, -1]) {
      parts.push(head(capsule([h.c[0] + 0.222 * sx, yc, h.c[2] - 0.012], [h.c[0] + 0.262 * sx, yc, h.c[2] - 0.012], 0.05, 0.048, 16, 3), main));
    }
  } else if (style === 'headband') {
    parts.push(head(headRing(h, 70, 88, 1.012 + hairLift, 0.017), main));
  } else if (style === 'goggles') {
    // VR 眼镜推到额头上：头带 + 前面一个圆角盒子 + 一条亮色镜片
    parts.push(head(headRing(h, 66, 86, 1.01 + hairLift, 0.011), main));
    const c = at(h, 0, 66, 1.16);
    const box = ellipsoid([0, 0, 0], [1, 1, 1], [0, 0, 0], 18, 10);
    deform(box, (p) => {
      const sq = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e);
      p.set(c[0] + sq(p.x, 0.45) * 0.115, c[1] + sq(p.y, 0.55) * 0.042 + 0.006, c[2] + sq(p.z, 0.6) * 0.04);
    });
    parts.push(head(box, main));
    parts.push(head(ellipsoid([c[0], c[1] + 0.006, c[2] + 0.038], [0.092, 0.024, 0.008], [0, 0, 0], 16, 8), accent));
  } else if (style === 'glasses') {
    parts.push(...buildGlasses(h, main));
  }
  return parts;
}

/** 眼镜：两个圆框 + 鼻梁 + 镜腿（贴着脸） */
export function buildGlasses(h: HeadShape, mat: string, eyeScale = 1): Part[] {
  const g: Geo[] = [];
  const ex = FACE.eyeX;
  const ey = FACE.eyeY;
  const R = 0.036 * Math.max(0.9, eyeScale);
  for (const side of [1, -1]) {
    const e = faceProject(h, ex * side, ey, 0.022);
    g.push(torus(e.p, R, 0.0042, [0.12 * side, 0, 1], 24, 6));
    // 镜腿：从框外侧往后到耳朵
    const a: V3 = [e.p[0] + R * side, e.p[1] + 0.006, e.p[2] - 0.004];
    const b: V3 = [h.r[0] * 0.98 * side, h.c[1] - 0.012, h.c[2] - 0.02];
    g.push(tube((t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], () => 0.0035, 6, 6, [0, 1, 0]));
  }
  const l = faceProject(h, ex - R + 0.002, ey + 0.008, 0.026).p;
  const r = faceProject(h, -(ex - R + 0.002), ey + 0.008, 0.026).p;
  g.push(tube((t) => [l[0] + (r[0] - l[0]) * t, l[1] + 0.004 * Math.sin(Math.PI * t), l[2] + (r[2] - l[2]) * t + 0.004 * Math.sin(Math.PI * t)], () => 0.0035, 6, 6, [0, 1, 0]));
  // 眼镜不算身高
  return [{ geo: merge(g), mat, mesh: 'head', bone: 'Head' }];
}
