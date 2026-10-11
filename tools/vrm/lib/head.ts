// 头部形状：一个下半部略收窄的椭球。头发、五官都贴着这个形状生成。
// "单位空间"：以头中心为原点、半轴归一化为 1 的球坐标空间；mapUnit 把它映射回世界。

import { B } from './rig.ts';
import { type Geo, type V3, gridSurface } from './geom.ts';

export interface HeadShape {
  c: V3;
  r: V3;
  taper: number;
}

export const HEAD: HeadShape = { c: B.headC, r: B.headR, taper: B.headTaper };

function taperAt(h: HeadShape, uy: number): number {
  const d = Math.max(0, -uy);
  return 1 - h.taper * d * d;
}

/** 单位空间点 → 世界坐标（可以不在单位球上，比如头发外壳） */
export function mapUnit(h: HeadShape, x: number, y: number, z: number): V3 {
  const t = taperAt(h, y);
  return [h.c[0] + h.r[0] * t * x, h.c[1] + h.r[1] * y, h.c[2] + h.r[2] * z];
}

/** 头皮（颅骨）网格 */
export function skullGeo(h: HeadShape, ws = 48, hs = 32): Geo {
  return gridSurface(
    hs + 1,
    ws,
    (i, j) => {
      const phi = Math.PI - (i / hs) * Math.PI; // 从下往上
      const th = (j / ws) * Math.PI * 2;
      return mapUnit(h, Math.sin(phi) * Math.sin(th), Math.cos(phi), Math.sin(phi) * Math.cos(th));
    },
    { wrap: true, poleStart: true, poleEnd: true },
  );
}

/**
 * 把脸部平面坐标 (x, y)（相对头中心，米）投影到脸的表面，再沿法线抬高 lift。
 * 返回位置和表面法线。
 */
export function faceProject(h: HeadShape, x: number, y: number, lift: number): { p: V3; n: V3 } {
  const uy = y / h.r[1];
  const t = taperAt(h, uy);
  const ux = x / (h.r[0] * t);
  const uz = Math.sqrt(Math.max(0, 1 - ux * ux - uy * uy));
  const z = h.r[2] * uz;
  const ax = h.r[0] * t;
  let nx = x / (ax * ax);
  let ny = y / (h.r[1] * h.r[1]);
  let nz = z / (h.r[2] * h.r[2]);
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l;
  ny /= l;
  nz /= l;
  return {
    p: [h.c[0] + x + nx * lift, h.c[1] + y + ny * lift, h.c[2] + z + nz * lift],
    n: [nx, ny, nz],
  };
}
