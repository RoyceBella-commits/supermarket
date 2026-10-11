import type { AmenityDef, MallLayout, Side } from '../data/layoutTypes.ts';
import type { MatKey, StaticBatch } from './StaticBatch.ts';

// 公共区设施的灰盒造型（带碰撞）。交互在阶段 4 做。
// 局部坐标：u 沿设施正面从左到右，v 从正面往里（朝背面），原点在正面左端。

/** 局部 (u, v) → 世界 (x, z)，以及设施宽度（沿正面）和进深。 */
export function amenityFrame(a: AmenityDef) {
  const r = a.rect;
  const frames: Record<Side, { map: (u: number, v: number) => { x: number; z: number }; width: number; depth: number }> = {
    N: { map: (u, v) => ({ x: r.x + u, z: r.z + v }), width: r.w, depth: r.d },
    S: { map: (u, v) => ({ x: r.x + r.w - u, z: r.z + r.d - v }), width: r.w, depth: r.d },
    E: { map: (u, v) => ({ x: r.x + r.w - v, z: r.z + u }), width: r.d, depth: r.w },
    W: { map: (u, v) => ({ x: r.x + v, z: r.z + r.d - u }), width: r.d, depth: r.w },
  };
  return frames[a.facing];
}

/** 设施正面朝外的方向向量 */
export function facingVector(side: Side): { x: number; z: number } {
  return { N: { x: 0, z: -1 }, S: { x: 0, z: 1 }, E: { x: 1, z: 0 }, W: { x: -1, z: 0 } }[side];
}

export const LOCKER_HEIGHT = 2.0;
export const SERVICE_PANEL_HEIGHT = 3.0;

export function buildAmenities(layout: MallLayout, batch: StaticBatch) {
  const H = layout.building.floorHeight;
  for (const a of layout.amenities) {
    const y = a.floor * H;
    const { map, width: W, depth: D } = amenityFrame(a);
    const lbox = (u0: number, v0: number, u1: number, v1: number, y0: number, y1: number, mat: MatKey, tint?: string, collide: 'solid' | 'none' = 'solid') => {
      const p = map(u0, v0);
      const q = map(u1, v1);
      batch.box(p.x, y + y0, p.z, q.x, y + y1, q.z, mat, a.floor, collide, tint);
    };

    switch (a.kind) {
      case 'lockers': {
        // 柜体用门格贴图（世界坐标 UV，每格 0.5 × 0.5 m），顶上一条压边
        lbox(0, 0, W, D, 0, LOCKER_HEIGHT, 'locker', '#7aa5d2');
        lbox(-0.02, -0.02, W + 0.02, D, LOCKER_HEIGHT, LOCKER_HEIGHT + 0.12, 'prop', '#3d5a80');
        lbox(0, 0.05, W, D, 0, 0.08, 'prop', '#3d5a80', 'none');
        break;
      }
      case 'carts': {
        // 几排嵌套在一起的购物车：每排一个长条（车身）+ 前端把手，排与排之间是护栏
        const rows = Math.max(1, Math.floor(W / 1.0));
        const pitch = W / rows;
        for (let k = 0; k < rows; k++) {
          const c = pitch * (k + 0.5);
          const tint = k % 2 === 0 ? '#e63946' : '#2a9d8f';
          lbox(c - 0.28, 0.35, c + 0.28, D - 0.2, 0.15, 0.95, 'prop', tint);
          lbox(c - 0.3, 0.25, c + 0.3, 0.35, 0.95, 1.05, 'rail', undefined);
          lbox(c - 0.26, 0.4, c + 0.26, D - 0.25, 0, 0.15, 'rail', undefined, 'none');
        }
        // 护栏：两端立柱 + 上下两道横杆（碰撞是一整片薄板）
        for (let k = 0; k <= rows; k++) {
          const u = pitch * k;
          lbox(u - 0.03, 0.2, u + 0.03, 0.26, 0, 1.0, 'rail', undefined, 'none');
          lbox(u - 0.03, D - 0.06, u + 0.03, D, 0, 1.0, 'rail', undefined, 'none');
          lbox(u - 0.02, 0.2, u + 0.02, D, 0.42, 0.47, 'rail', undefined, 'none');
          lbox(u - 0.02, 0.2, u + 0.02, D, 0.95, 1.0, 'rail', undefined, 'none');
          const p = map(u - 0.03, 0.2);
          const q = map(u + 0.03, D);
          batch.box(p.x, y, p.z, q.x, y + 1.0, q.z, 'rail', a.floor, 'invisible');
        }
        break;
      }
      case 'baskets': {
        // 两摞购物篮
        const n = 2;
        const step = W / n;
        for (let k = 0; k < n; k++) {
          const c = step * (k + 0.5);
          lbox(c - 0.25, D / 2 - 0.2, c + 0.25, D / 2 + 0.2, 0, 0.75, 'prop', k === 0 ? '#f77f00' : '#d62828');
        }
        break;
      }
      case 'serviceDesk': {
        // 前面的柜台（1.05 m）+ 台面 + 背后的背景板（挂牌子）
        lbox(0, 0, W, 0.8, 0, 1.05, 'prop', '#f1faee');
        lbox(-0.05, -0.08, W + 0.05, 0.85, 1.05, 1.11, 'prop', '#264653');
        lbox(0, D - 0.2, W, D, 0, SERVICE_PANEL_HEIGHT, 'prop', '#2d6a4f');
        // 两侧挡板，让柜台后面成为工作区
        lbox(0, 0.8, 0.1, D - 0.2, 0, 1.05, 'prop', '#f1faee');
        lbox(W - 0.1, 0.8, W, D - 0.2, 0, 1.05, 'prop', '#f1faee');
        break;
      }
      case 'bench': {
        // 座面 + 靠背（靠背在背面一侧）
        lbox(0, 0, W, D - 0.08, 0.38, 0.46, 'prop', '#b5835a');
        lbox(0.1, 0.1, W - 0.1, D - 0.18, 0, 0.38, 'prop', '#6c584c');
        lbox(0, D - 0.08, W, D, 0.38, 0.9, 'prop', '#b5835a');
        // 碰撞：整体一个 0.46 m 高的块（不能直接走上去，要跳）
        break;
      }
      case 'waterFountain': {
        lbox(0, 0, W, D, 0, 0.9, 'prop', '#ced4da');
        lbox(-0.03, -0.05, W + 0.03, D, 0.9, 0.98, 'rail', undefined);
        break;
      }
    }
  }
}
