import type { Rect } from '../data/layoutTypes.ts';
import type { MatKey, StaticBatch } from './StaticBatch.ts';
import { subtractRects } from './rectOps.ts';

export interface SurfaceRoom {
  rect: Rect;
  mat: MatKey;
  tint?: string;
}

export interface SlabSpec {
  floor: number;
  /** 顶面高度 */
  y: number;
  thickness: number;
  /** 楼板范围（并集） */
  regions: Rect[];
  holes: Rect[];
  /** 顶面材质分区（第一个包含格子中心的生效），其余部分用 topMat */
  rooms?: SurfaceRoom[];
  topMat: MatKey;
  topTint?: string;
  /** 底面（下一层看到的天花板）；null 表示不需要底面 */
  bottomMat: MatKey | null;
  /** 洞口和外沿的侧面 */
  edgeMat: MatKey | null;
  collide?: boolean;
}

/**
 * 不留接缝的楼板。
 * 所有矩形的边先压缩成同一张网格，每个格子各出一个顶面四边形（底面、侧面同理）。
 * 相邻格子的公共边由同一对网格坐标算出，顶点位置逐位相同、没有 T 形接点，所以光栅化时不会漏出闪烁的细缝。
 * 天花板统一用 bottomMat，不受上一层店铺地面颜色影响。碰撞仍用合并后的大盒子。
 */
export function addSlab(batch: StaticBatch, s: SlabSpec) {
  const rooms = s.rooms ?? [];
  const all = [...s.regions, ...s.holes, ...rooms.map((r) => r.rect)];
  const xs = uniqSorted(all.flatMap((r) => [r.x, r.x + r.w]));
  const zs = uniqSorted(all.flatMap((r) => [r.z, r.z + r.d]));
  const nx = xs.length - 1;
  const nz = zs.length - 1;
  if (nx <= 0 || nz <= 0) return;

  const inside = (r: Rect, x: number, z: number) => x > r.x && x < r.x + r.w && z > r.z && z < r.z + r.d;
  const filled: boolean[][] = [];
  const room: (SurfaceRoom | null)[][] = [];
  for (let j = 0; j < nz; j++) {
    const cz = (zs[j] + zs[j + 1]) / 2;
    const fr: boolean[] = [];
    const rr: (SurfaceRoom | null)[] = [];
    for (let i = 0; i < nx; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const on = s.regions.some((r) => inside(r, cx, cz)) && !s.holes.some((r) => inside(r, cx, cz));
      fr.push(on);
      rr.push(on ? (rooms.find((m) => inside(m.rect, cx, cz)) ?? null) : null);
    }
    filled.push(fr);
    room.push(rr);
  }
  const isFilled = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < nz && filled[j][i];

  const yt = s.y;
  const yb = s.y - s.thickness;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      if (!filled[j][i]) continue;
      const x0 = xs[i];
      const x1 = xs[i + 1];
      const z0 = zs[j];
      const z1 = zs[j + 1];
      const rm = room[j][i];
      batch.quad({
        corners: [[x0, yt, z1], [x1, yt, z1], [x1, yt, z0], [x0, yt, z0]],
        normal: [0, 1, 0],
        uvAxes: [0, 2],
        mat: rm?.mat ?? s.topMat,
        tint: rm ? rm.tint : s.topTint,
        floor: s.floor,
      });
      if (s.bottomMat) {
        batch.quad({
          corners: [[x0, yb, z0], [x1, yb, z0], [x1, yb, z1], [x0, yb, z1]],
          normal: [0, -1, 0],
          uvAxes: [0, 2],
          mat: s.bottomMat,
          floor: s.floor,
        });
      }
      if (s.edgeMat) {
        const m = s.edgeMat;
        if (!isFilled(i, j - 1)) batch.quad({ corners: [[x1, yb, z0], [x0, yb, z0], [x0, yt, z0], [x1, yt, z0]], normal: [0, 0, -1], uvAxes: [0, 1], mat: m, floor: s.floor });
        if (!isFilled(i, j + 1)) batch.quad({ corners: [[x0, yb, z1], [x1, yb, z1], [x1, yt, z1], [x0, yt, z1]], normal: [0, 0, 1], uvAxes: [0, 1], mat: m, floor: s.floor });
        if (!isFilled(i - 1, j)) batch.quad({ corners: [[x0, yb, z0], [x0, yb, z1], [x0, yt, z1], [x0, yt, z0]], normal: [-1, 0, 0], uvAxes: [2, 1], mat: m, floor: s.floor });
        if (!isFilled(i + 1, j)) batch.quad({ corners: [[x1, yb, z1], [x1, yb, z0], [x1, yt, z0], [x1, yt, z1]], normal: [1, 0, 0], uvAxes: [2, 1], mat: m, floor: s.floor });
      }
    }
  }

  if (s.collide !== false) {
    for (const r of subtractRects(s.regions, s.holes)) {
      batch.box(r.x, yb, r.z, r.x + r.w, yt, r.z + r.d, s.topMat, s.floor, 'invisible');
    }
  }
}

function uniqSorted(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) if (out.length === 0 || v - out[out.length - 1] > 1e-6) out.push(v);
  return out;
}
