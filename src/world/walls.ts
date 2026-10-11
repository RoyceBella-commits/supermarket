import type { Opening, Rect, Side } from '../data/layoutTypes.ts';
import type { MatKey, StaticBatch } from './StaticBatch.ts';
import { edgeOf } from './rectOps.ts';

export interface WallOptions {
  rect: Rect;
  side: Side;
  y0: number;
  y1: number;
  thickness: number;
  /** inside：墙体在矩形内侧（店铺隔墙）；outside：在外侧（外墙） */
  placement: 'inside' | 'outside';
  /** 沿边裁掉两端的长度（避免和相邻墙在转角重叠），可为负数表示向外延伸 */
  trimStart?: number;
  trimEnd?: number;
  openings?: Opening[];
  /** 没写 height 的门洞默认高度 */
  defaultOpeningHeight: number;
  mat: MatKey;
  floor: number;
  tint?: string;
}

/**
 * 沿矩形的一条边生成墙：按开口切成实墙段，开口上方补门楣；glazing 开口装玻璃（有碰撞）。
 */
export function addWall(batch: StaticBatch, o: WallOptions) {
  const e = edgeOf(o.rect, o.side);
  const t0 = o.trimStart ?? 0;
  const t1 = e.length - (o.trimEnd ?? 0);
  // 墙厚方向：inside 往矩形里（-外法线），outside 往外（+外法线）
  const dir = o.placement === 'inside' ? -1 : 1;
  const n0 = 0;
  const n1 = o.thickness * dir;

  const segment = (a: number, b: number, ya: number, yb: number, mat: MatKey, collide: 'solid' | 'none' = 'solid', tint = o.tint) => {
    if (b - a < 1e-4 || yb - ya < 1e-4) return;
    const xa = e.x + e.ax * a + e.outX * n0;
    const za = e.z + e.az * a + e.outZ * n0;
    const xb = e.x + e.ax * b + e.outX * n1;
    const zb = e.z + e.az * b + e.outZ * n1;
    batch.box(xa, ya, za, xb, yb, zb, mat, o.floor, collide, tint);
  };

  const openings = [...(o.openings ?? [])].filter((op) => op.side === o.side).sort((a, b) => a.offset - b.offset);
  let cursor = t0;
  for (const op of openings) {
    const a = Math.max(op.offset, t0);
    const b = Math.min(op.offset + op.width, t1);
    if (b <= a) continue;
    segment(cursor, a, o.y0, o.y1, o.mat);
    const h = op.height ?? o.defaultOpeningHeight;
    if (op.kind === 'glazing') {
      const top = Math.min(o.y0 + (op.height ?? o.y1 - o.y0 - 0.4), o.y1);
      // 玻璃放在墙厚中间，窗台 0.1 m 高
      segment(a, b, o.y0, o.y0 + 0.1, o.mat);
      const mid = o.thickness * dir * 0.5;
      const xa = e.x + e.ax * a + e.outX * (mid - 0.03);
      const za = e.z + e.az * a + e.outZ * (mid - 0.03);
      const xb = e.x + e.ax * b + e.outX * (mid + 0.03);
      const zb = e.z + e.az * b + e.outZ * (mid + 0.03);
      batch.box(xa, o.y0 + 0.1, za, xb, top, zb, 'glass', o.floor, 'solid');
      segment(a, b, top, o.y1, o.mat);
    } else {
      segment(a, b, o.y0 + h, o.y1, o.mat);
    }
    cursor = b;
  }
  segment(cursor, t1, o.y0, o.y1, o.mat);
}
