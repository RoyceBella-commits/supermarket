import type { Rect, StairDef } from '../data/layoutTypes.ts';
import type { BoxSpec, StaticBatch } from './StaticBatch.ts';

// 封闭双跑楼梯间。局部坐标：lx 为横向（两条梯道并排），lz 为进深（从门往里），原点在室内左前角。
// 室内 3.2 × 8.6 m，四周墙厚 0.2 m（整体 3.6 × 9.0 m）。
//   lz ∈ [0, 1.6]       每层的楼层平台（门开在前墙）
//   lane A lx ∈ [0, 1.5] 第一跑：从本层平台向里上到半层平台
//   lane B lx ∈ [1.7, 3.2] 第二跑：从半层平台向外上到上一层平台
//   lz ∈ [6.64, 8.6]    半层平台
// 画面上是 18 级台阶；碰撞是一个平滑的楔形坡道，穿过每级踏面的中点，上下楼不会抖。

export const STAIR = {
  width: 3.2,
  depth: 8.6,
  wall: 0.2,
  landing: 1.6,
  laneA: [0, 1.5] as const,
  divider: [1.5, 1.7] as const,
  laneB: [1.7, 3.2] as const,
  risers: 18,
  tread: 0.28,
  door: [0.6, 2.6] as const,
};

const RUN = STAIR.risers * STAIR.tread; // 5.04 m
const MID = STAIR.landing + RUN; // 6.64：半层平台起点

/** 局部 (lx, lz) → 世界 (x, z)。 */
export function stairMapper(st: StairDef) {
  const r = st.rect;
  const w = STAIR.wall;
  switch (st.front) {
    case 'N':
      return (lx: number, lz: number) => ({ x: r.x + w + lx, z: r.z + w + lz });
    case 'S':
      return (lx: number, lz: number) => ({ x: r.x + r.w - w - lx, z: r.z + r.d - w - lz });
    case 'E':
      return (lx: number, lz: number) => ({ x: r.x + r.w - w - lz, z: r.z + w + lx });
    case 'W':
      return (lx: number, lz: number) => ({ x: r.x + w + lz, z: r.z + r.d - w - lx });
  }
}

/** 楼梯间在某层楼板上要挖掉的洞（世界坐标）。 */
export function stairHoles(st: StairDef, level: number): Rect[] {
  if (level <= st.floors[0] || level > st.floors[1]) return [];
  const map = stairMapper(st);
  const lx0 = level === st.floors[1] ? STAIR.laneB[0] : 0;
  return [localRect(map, lx0, STAIR.landing, STAIR.width, STAIR.depth)];
}

function localRect(map: ReturnType<typeof stairMapper>, lx0: number, lz0: number, lx1: number, lz1: number): Rect {
  const a = map(lx0, lz0);
  const b = map(lx1, lz1);
  const x = Math.min(a.x, b.x);
  const z = Math.min(a.z, b.z);
  return { x, z, w: Math.abs(b.x - a.x), d: Math.abs(b.z - a.z) };
}

export function buildStairCore(batch: StaticBatch, st: StairDef, floorHeight: number, slab: number, needsRoof: boolean, doorHeight: number) {
  const map = stairMapper(st);
  const lbox = (
    lx0: number,
    y0: number,
    lz0: number,
    lx1: number,
    y1: number,
    lz1: number,
    mat: 'core' | 'stair' | 'wall' | 'roof',
    floor: number,
    collide: 'solid' | 'none' = 'solid',
    faces?: BoxSpec['faces'],
  ) => {
    const a = map(lx0, lz0);
    const b = map(lx1, lz1);
    batch.box(a.x, y0, a.z, b.x, y1, b.z, mat, floor, collide, undefined, faces);
  };
  const hull = (pts: [number, number, number][], floor: number) => {
    const out: number[] = [];
    for (const [lx, y, lz] of pts) {
      const p = map(lx, lz);
      out.push(p.x, y, p.z);
    }
    batch.addHull(out, floor);
  };

  const W = STAIR.width;
  const D = STAIR.depth;
  const t = STAIR.wall;
  const rise = floorHeight / 2 / STAIR.risers;
  const half = STAIR.tread / 2;

  for (let L = st.floors[0]; L <= st.floors[1]; L++) {
    const y0 = L * floorHeight;
    const top = L === st.floors[1];
    const wallTop = y0 + floorHeight - slab;

    // 四面墙：前墙开门；左右墙包住前后墙的端头
    lbox(-t, y0, -t, STAIR.door[0], wallTop, 0, 'core', L);
    lbox(STAIR.door[1], y0, -t, W + t, wallTop, 0, 'core', L);
    lbox(STAIR.door[0], y0 + doorHeight, -t, STAIR.door[1], wallTop, 0, 'core', L);
    lbox(-t, y0, 0, 0, wallTop, D + t, 'core', L);
    lbox(W, y0, 0, W + t, wallTop, D + t, 'core', L);
    lbox(0, y0, D, W, wallTop, D + t, 'core', L);

    if (top) {
      // 顶层：第二跑上来的 lane B 是洞，用隔墙把它和 lane A 的平台隔开
      lbox(STAIR.divider[0], y0, STAIR.landing, STAIR.divider[1], wallTop, D, 'core', L);
      if (needsRoof) lbox(-t, wallTop, -t, W + t, wallTop + slab, D + t, 'roof', L, 'solid', { bottom: 'ceiling' });
      continue;
    }

    // 两跑之间的隔墙（整层高；上一层是顶层时停在楼板下面，避免和楼板侧面重叠闪烁）
    const dividerTop = L + 1 === st.floors[1] ? wallTop : y0 + floorHeight;
    lbox(STAIR.divider[0], y0, STAIR.landing, STAIR.divider[1], dividerTop, MID, 'core', L);

    // 半层平台
    const ym = y0 + floorHeight / 2;
    lbox(0, ym - slab, MID, W, ym, D, 'stair', L);

    // 第一跑（lane A，向里上）：台阶画面 + 楔形碰撞
    const [a0, a1] = STAIR.laneA;
    for (let i = 0; i < STAIR.risers; i++) {
      const z0 = STAIR.landing + i * STAIR.tread;
      lbox(a0, y0, z0, a1, y0 + (i + 1) * rise, z0 + STAIR.tread, 'stair', L, 'none');
    }
    {
      const zs = STAIR.landing - half; // 坡道起点（在平台上）
      const ze = MID - half; // 到达半层高度的位置
      const pts: [number, number, number][] = [];
      for (const lx of [a0, a1]) {
        pts.push([lx, y0, zs], [lx, ym, ze], [lx, ym, MID], [lx, y0, MID]);
      }
      hull(pts, L);
    }

    // 第二跑（lane B，向外上）
    const [b0, b1] = STAIR.laneB;
    for (let i = 0; i < STAIR.risers; i++) {
      const z1 = MID - i * STAIR.tread;
      lbox(b0, ym, z1 - STAIR.tread, b1, ym + (i + 1) * rise, z1, 'stair', L, 'none');
    }
    {
      const zs = MID + half;
      const ze = STAIR.landing + half;
      const yt = y0 + floorHeight;
      const pts: [number, number, number][] = [];
      for (const lx of [b0, b1]) {
        pts.push([lx, ym, zs], [lx, yt, ze], [lx, yt, STAIR.landing], [lx, ym, STAIR.landing]);
      }
      hull(pts, L);
    }
  }
}

/** 楼梯间门口外侧中心点（世界坐标），以及朝外的方向，挂招牌用。 */
export function stairDoor(st: StairDef) {
  const map = stairMapper(st);
  const c = map((STAIR.door[0] + STAIR.door[1]) / 2, -STAIR.wall);
  const inner = map((STAIR.door[0] + STAIR.door[1]) / 2, 1);
  const len = Math.hypot(c.x - inner.x, c.z - inner.z);
  return { x: c.x, z: c.z, outX: (c.x - inner.x) / len, outZ: (c.z - inner.z) / len };
}
