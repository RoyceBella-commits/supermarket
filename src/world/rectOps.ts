import type { Opening, Rect, Side } from '../data/layoutTypes.ts';

const EPS = 1e-6;

export const rectMaxX = (r: Rect) => r.x + r.w;
export const rectMaxZ = (r: Rect) => r.z + r.d;

export function containsPoint(r: Rect, x: number, z: number, margin = 0): boolean {
  return x >= r.x - margin && x <= r.x + r.w + margin && z >= r.z - margin && z <= r.z + r.d + margin;
}

/** 两个矩形是否有正面积的重叠（只碰边不算）。 */
export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.z < b.z + b.d - EPS && b.z < a.z + a.d - EPS;
}

export function containsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x - EPS &&
    inner.z >= outer.z - EPS &&
    inner.x + inner.w <= outer.x + outer.w + EPS &&
    inner.z + inner.d <= outer.z + outer.d + EPS
  );
}

/**
 * (区域并集) − (洞并集)，结果切成互不重叠的矩形。
 * 做法：坐标压缩成网格，标记每个格子，再按行贪心合并成尽量大的矩形。
 */
export function subtractRects(regions: Rect[], holes: Rect[]): Rect[] {
  const xs = uniqSorted([...regions, ...holes].flatMap((r) => [r.x, r.x + r.w]));
  const zs = uniqSorted([...regions, ...holes].flatMap((r) => [r.z, r.z + r.d]));
  const nx = xs.length - 1;
  const nz = zs.length - 1;
  if (nx <= 0 || nz <= 0) return [];
  const filled: boolean[][] = [];
  for (let j = 0; j < nz; j++) {
    const row: boolean[] = [];
    const cz = (zs[j] + zs[j + 1]) / 2;
    for (let i = 0; i < nx; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const inRegion = regions.some((r) => strictlyInside(r, cx, cz));
      const inHole = holes.some((r) => strictlyInside(r, cx, cz));
      row.push(inRegion && !inHole);
    }
    filled.push(row);
  }
  const used = filled.map((row) => row.map(() => false));
  const out: Rect[] = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      if (!filled[j][i] || used[j][i]) continue;
      // 先向东扩到最长，再向南扩到整行都满足
      let i1 = i;
      while (i1 + 1 < nx && filled[j][i1 + 1] && !used[j][i1 + 1]) i1++;
      let j1 = j;
      outer: while (j1 + 1 < nz) {
        for (let k = i; k <= i1; k++) if (!filled[j1 + 1][k] || used[j1 + 1][k]) break outer;
        j1++;
      }
      for (let jj = j; jj <= j1; jj++) for (let k = i; k <= i1; k++) used[jj][k] = true;
      out.push({ x: xs[i], z: zs[j], w: xs[i1 + 1] - xs[i], d: zs[j1 + 1] - zs[j] });
    }
  }
  return out;
}

function strictlyInside(r: Rect, x: number, z: number): boolean {
  return x > r.x && x < r.x + r.w && z > r.z && z < r.z + r.d;
}

function uniqSorted(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) if (out.length === 0 || v - out[out.length - 1] > EPS) out.push(v);
  return out;
}

/**
 * 矩形某条边在世界坐标中的起点和方向。offset 沿边量：N/S 边从西端（最小 x）起，E/W 边从北端（最小 z）起。
 * outward 是这条边的外法线（离开矩形的方向）。
 */
export function edgeOf(r: Rect, side: Side) {
  switch (side) {
    case 'N':
      return { x: r.x, z: r.z, ax: 1, az: 0, length: r.w, outX: 0, outZ: -1 };
    case 'S':
      return { x: r.x, z: r.z + r.d, ax: 1, az: 0, length: r.w, outX: 0, outZ: 1 };
    case 'W':
      return { x: r.x, z: r.z, ax: 0, az: 1, length: r.d, outX: -1, outZ: 0 };
    case 'E':
      return { x: r.x + r.w, z: r.z, ax: 0, az: 1, length: r.d, outX: 1, outZ: 0 };
  }
}

/** 开口中点在世界坐标中的位置。 */
export function openingCenter(r: Rect, o: Opening) {
  const e = edgeOf(r, o.side);
  const t = o.offset + o.width / 2;
  return { x: e.x + e.ax * t, z: e.z + e.az * t, outX: e.outX, outZ: e.outZ };
}

/** 判断矩形的某条边是否落在另一个矩形的边界上（共线且被包含）。 */
export function sideOnBoundary(r: Rect, side: Side, boundary: Rect): boolean {
  const e = edgeOf(r, side);
  const bx0 = boundary.x;
  const bx1 = boundary.x + boundary.w;
  const bz0 = boundary.z;
  const bz1 = boundary.z + boundary.d;
  if (e.az === 0) {
    // 水平边：z 固定
    const onLine = Math.abs(e.z - bz0) < EPS || Math.abs(e.z - bz1) < EPS;
    return onLine && e.x >= bx0 - EPS && e.x + e.length <= bx1 + EPS;
  }
  const onLine = Math.abs(e.x - bx0) < EPS || Math.abs(e.x - bx1) < EPS;
  return onLine && e.z >= bz0 - EPS && e.z + e.length <= bz1 + EPS;
}
