// 几何工具：在 Node 里用纯数组拼模型（不需要 DOM / canvas）。
// 约定：右手系，Y 向上，角色面向 +Z，角色左手在 +X。三角形逆时针为正面。

import * as THREE from 'three';

export type V3 = [number, number, number];

export interface Geo {
  pos: number[];
  nrm: number[];
  idx: number[];
}

export function emptyGeo(): Geo {
  return { pos: [], nrm: [], idx: [] };
}

export function vcount(g: Geo): number {
  return g.pos.length / 3;
}

export function cloneGeo(g: Geo): Geo {
  return { pos: g.pos.slice(), nrm: g.nrm.slice(), idx: g.idx.slice() };
}

export function merge(list: Geo[]): Geo {
  const out = emptyGeo();
  for (const g of list) {
    const base = vcount(out);
    for (const v of g.pos) out.pos.push(v);
    for (const v of g.nrm) out.nrm.push(v);
    for (const i of g.idx) out.idx.push(i + base);
  }
  return out;
}

/** 按矩阵变换位置，法线用逆转置矩阵 */
export function transform(g: Geo, m: THREE.Matrix4): Geo {
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
  // 行列式为负（镜像）时翻转三角形环绕方向
  if (m.determinant() < 0) flipWinding(g);
  return g;
}

export function flipWinding(g: Geo): Geo {
  for (let i = 0; i < g.idx.length; i += 3) {
    const t = g.idx[i + 1];
    g.idx[i + 1] = g.idx[i + 2];
    g.idx[i + 2] = t;
  }
  return g;
}

export function translate(g: Geo, x: number, y: number, z: number): Geo {
  for (let i = 0; i < g.pos.length; i += 3) {
    g.pos[i] += x;
    g.pos[i + 1] += y;
    g.pos[i + 2] += z;
  }
  return g;
}

/** 绕原点均匀缩放 */
export function scaleGeo(g: Geo, s: number): Geo {
  for (let i = 0; i < g.pos.length; i++) g.pos[i] *= s;
  return g;
}

/** 关于 x=0 平面镜像（左右对称件） */
export function mirrorX(g: Geo): Geo {
  const c = cloneGeo(g);
  for (let i = 0; i < c.pos.length; i += 3) {
    c.pos[i] = -c.pos[i];
    c.nrm[i] = -c.nrm[i];
  }
  return flipWinding(c);
}

/** 按三角形面积加权的平滑法线 */
export function computeNormals(g: Geo): Geo {
  const n = new Float64Array(g.pos.length);
  const p = g.pos;
  for (let t = 0; t < g.idx.length; t += 3) {
    const a = g.idx[t] * 3;
    const b = g.idx[t + 1] * 3;
    const c = g.idx[t + 2] * 3;
    const e1x = p[b] - p[a], e1y = p[b + 1] - p[a + 1], e1z = p[b + 2] - p[a + 2];
    const e2x = p[c] - p[a], e2y = p[c + 1] - p[a + 1], e2z = p[c + 2] - p[a + 2];
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    for (const k of [a, b, c]) {
      n[k] += nx;
      n[k + 1] += ny;
      n[k + 2] += nz;
    }
  }
  g.nrm = new Array(g.pos.length);
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]);
    if (l < 1e-12) {
      // 孤立/退化顶点：给一个合法的单位法线
      g.nrm[i] = 0;
      g.nrm[i + 1] = 1;
      g.nrm[i + 2] = 0;
      continue;
    }
    g.nrm[i] = n[i] / l;
    g.nrm[i + 1] = n[i + 1] / l;
    g.nrm[i + 2] = n[i + 2] / l;
  }
  return g;
}

/** 逐顶点改位置（之后重算法线） */
export function deform(g: Geo, fn: (p: THREE.Vector3) => void, renormal = true): Geo {
  const v = new THREE.Vector3();
  for (let i = 0; i < g.pos.length; i += 3) {
    v.set(g.pos[i], g.pos[i + 1], g.pos[i + 2]);
    fn(v);
    g.pos[i] = v.x;
    g.pos[i + 1] = v.y;
    g.pos[i + 2] = v.z;
  }
  return renormal ? computeNormals(g) : g;
}

/** 删除无用顶点之外不做别的；去掉退化三角形（索引重复） */
export function dropDegenerate(g: Geo): Geo {
  const idx: number[] = [];
  for (let t = 0; t < g.idx.length; t += 3) {
    const a = g.idx[t], b = g.idx[t + 1], c = g.idx[t + 2];
    if (a !== b && b !== c && a !== c) idx.push(a, b, c);
  }
  g.idx = idx;
  return g;
}

/**
 * 网格曲面：rows × cols 个顶点，(i, j) → 位置。
 * wrap：列首尾相接（旋转体）。poleStart / poleEnd：第一 / 最后一行收成一个点。
 * 三角形正面方向 = d(列) × d(行)（行沿 i 增加、列沿 j 增加）；flip 反过来。
 */
export function gridSurface(
  rows: number,
  cols: number,
  at: (i: number, j: number) => V3,
  opts: { wrap?: boolean; poleStart?: boolean; poleEnd?: boolean; flip?: boolean } = {},
): Geo {
  const g = emptyGeo();
  const wrap = opts.wrap ?? false;
  const rowIndex: number[][] = [];
  for (let i = 0; i < rows; i++) {
    const isPole = (i === 0 && opts.poleStart) || (i === rows - 1 && opts.poleEnd);
    const row: number[] = [];
    if (isPole) {
      // 极点：取各列平均
      let x = 0, y = 0, z = 0;
      for (let j = 0; j < cols; j++) {
        const p = at(i, j);
        x += p[0];
        y += p[1];
        z += p[2];
      }
      const id = vcount(g);
      g.pos.push(x / cols, y / cols, z / cols);
      for (let j = 0; j < cols; j++) row.push(id);
    } else {
      for (let j = 0; j < cols; j++) {
        const p = at(i, j);
        row.push(vcount(g));
        g.pos.push(p[0], p[1], p[2]);
      }
    }
    rowIndex.push(row);
  }
  const jmax = wrap ? cols : cols - 1;
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < jmax; j++) {
      const j2 = (j + 1) % cols;
      const a = rowIndex[i][j], b = rowIndex[i][j2], c = rowIndex[i + 1][j], d = rowIndex[i + 1][j2];
      // 法线 = (b-a) × (c-a) = d列 × d行
      const tris = [a, b, c, b, d, c];
      for (let k = 0; k < 6; k += 3) {
        const t0 = tris[k], t1 = tris[k + 1], t2 = tris[k + 2];
        if (t0 === t1 || t1 === t2 || t0 === t2) continue;
        if (opts.flip) g.idx.push(t0, t2, t1);
        else g.idx.push(t0, t1, t2);
      }
    }
  }
  g.nrm = new Array(g.pos.length).fill(0);
  return computeNormals(g);
}

/**
 * 旋转体（绕 Y 轴）。profile 为 [半径, y]，按顺序从下往上时法线朝外；
 * 先往下再往上（如裙摆内外两层）时，往下走的一段法线朝内，正好是内壁。
 * kx / kz：把圆截面压成椭圆。首尾半径为 0 时自动收成极点。
 */
export function revolve(profile: [number, number][], segs = 32, kx = 1, kz = 1): Geo {
  const rows = profile.length;
  const poleStart = profile[0][0] < 1e-6;
  const poleEnd = profile[rows - 1][0] < 1e-6;
  return gridSurface(
    rows,
    segs,
    (i, j) => {
      const th = (j / segs) * Math.PI * 2;
      const [r, y] = profile[i];
      return [r * Math.sin(th) * kx, y, r * Math.cos(th) * kz];
    },
    // θ 从 +Z 转向 +X；d列 × d行（向上）= 朝外
    { wrap: true, poleStart, poleEnd, flip: false },
  );
}

/** 单位球（极点各一个顶点），再用矩阵变成椭球 */
export function sphere(ws = 32, hs = 20): Geo {
  const profile: [number, number][] = [];
  for (let i = 0; i <= hs; i++) {
    const phi = Math.PI - (i / hs) * Math.PI; // 从下往上
    profile.push([Math.sin(phi), Math.cos(phi)]);
  }
  profile[0][0] = 0;
  profile[hs][0] = 0;
  const g = revolve(profile, ws);
  // 球的解析法线更平滑
  for (let i = 0; i < g.pos.length; i += 3) {
    const l = Math.hypot(g.pos[i], g.pos[i + 1], g.pos[i + 2]) || 1;
    g.nrm[i] = g.pos[i] / l;
    g.nrm[i + 1] = g.pos[i + 1] / l;
    g.nrm[i + 2] = g.pos[i + 2] / l;
  }
  return g;
}

export function trs(t: V3, r: V3 = [0, 0, 0], s: V3 = [1, 1, 1], order: THREE.EulerOrder = 'XYZ'): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...t),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2], order)),
    new THREE.Vector3(...s),
  );
}

export function ellipsoid(c: V3, r: V3, rot: V3 = [0, 0, 0], ws = 22, hs = 14): Geo {
  return transform(sphere(ws, hs), trs(c, rot, r));
}

/** 把沿 +Y 的几何对齐到 a→b 方向，原点放在 a */
export function alignY(g: Geo, a: V3, b: V3): Geo {
  const va = new THREE.Vector3(...a);
  const dir = new THREE.Vector3(...b).sub(va).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  return transform(g, new THREE.Matrix4().compose(va, q, new THREE.Vector3(1, 1, 1)));
}

/** 两端半径可不同的胶囊（锥台 + 两个半球），从 a 到 b */
export function capsule(a: V3, b: V3, ra: number, rb = ra, segs = 20, capRows = 5): Geo {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const profile: [number, number][] = [];
  // 锥台侧面与两端球面相切：用简单近似，侧面直接连接两个半球赤道
  for (let i = 0; i <= capRows; i++) {
    const t = (i / capRows) * (Math.PI / 2);
    profile.push([ra * Math.sin(t), -ra * Math.cos(t)]);
  }
  for (let i = 0; i <= capRows; i++) {
    const t = (Math.PI / 2) * (1 - i / capRows);
    profile.push([rb * Math.sin(t), len + rb * Math.cos(t)]);
  }
  profile[0][0] = 0;
  profile[profile.length - 1][0] = 0;
  return alignY(revolve(profile, segs), a, b);
}

/** 圆环：中心 c，主半径 R，管半径 r，所在平面的法线 axis，kz/ky 压扁 */
export function torus(c: V3, R: number, r: number, axis: V3 = [0, 1, 0], segs = 32, tubeSegs = 12, scale: V3 = [1, 1, 1]): Geo {
  const g = gridSurface(
    tubeSegs,
    segs,
    (i, j) => {
      const u = (j / segs) * Math.PI * 2;
      const v = (i / tubeSegs) * Math.PI * 2;
      const rr = R + r * Math.cos(v);
      return [rr * Math.sin(u) * scale[0], r * Math.sin(v) * scale[1], rr * Math.cos(u) * scale[2]];
    },
    { wrap: true },
  );
  // 管方向首尾也要连上：补一圈三角形
  const cols = segs;
  const last = (tubeSegs - 1) * cols;
  for (let j = 0; j < cols; j++) {
    const j2 = (j + 1) % cols;
    const a = last + j, b = last + j2, c2 = j, d = j2;
    g.idx.push(a, b, c2, b, d, c2);
  }
  computeNormals(g);
  alignY(g, [0, 0, 0], axis);
  return translate(g, c[0], c[1], c[2]);
}

/**
 * 沿曲线扫掠的管子（马尾、抽绳）。path(s) s∈[0,1]，radius(s)；两端半径为 0 时收成尖。
 * up 用来确定截面起始方向（与曲线不平行即可）。
 */
export function tube(path: (s: number) => V3, radius: (s: number) => number, rows = 24, segs = 16, up: V3 = [1, 0, 0]): Geo {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= rows; i++) pts.push(new THREE.Vector3(...path(i / rows)));
  const tangents = pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(rows, i + 1)];
    return b.clone().sub(a).normalize();
  });
  // 平行移动标架
  const normals: THREE.Vector3[] = [];
  let n = new THREE.Vector3(...up);
  n.sub(tangents[0].clone().multiplyScalar(n.dot(tangents[0]))).normalize();
  for (let i = 0; i <= rows; i++) {
    const t = tangents[i];
    n = n.clone().sub(t.clone().multiplyScalar(n.dot(t))).normalize();
    normals.push(n);
  }
  const r0 = radius(0);
  const r1 = radius(1);
  const g = gridSurface(
    rows + 1,
    segs,
    (i, j) => {
      const a = (j / segs) * Math.PI * 2;
      const t = tangents[i];
      const nn = normals[i];
      const bb = t.clone().cross(nn);
      const r = radius(i / rows);
      const p = pts[i].clone().add(nn.clone().multiplyScalar(Math.cos(a) * r)).add(bb.clone().multiplyScalar(Math.sin(a) * r));
      return [p.x, p.y, p.z];
    },
    { wrap: true, poleStart: r0 < 1e-6, poleEnd: r1 < 1e-6 },
  );
  // 方向检查：中间一圈的法线应背离中心线
  orientAway(g, pts[Math.floor(rows / 2)], tangents[Math.floor(rows / 2)]);
  return g;
}

/** 若多数法线指向 center（或指向某条轴线）则翻转，保证朝外 */
export function orientAway(g: Geo, center: THREE.Vector3, axis?: THREE.Vector3): Geo {
  let score = 0;
  const p = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  for (let i = 0; i < g.pos.length; i += 3) {
    p.set(g.pos[i], g.pos[i + 1], g.pos[i + 2]).sub(center);
    if (axis) p.sub(axis.clone().multiplyScalar(p.dot(axis)));
    nrm.set(g.nrm[i], g.nrm[i + 1], g.nrm[i + 2]);
    score += Math.sign(p.dot(nrm));
  }
  if (score < 0) {
    flipWinding(g);
    for (let i = 0; i < g.nrm.length; i++) g.nrm[i] = -g.nrm[i];
  }
  return g;
}

/** 三次贝塞尔 */
export function bezier(p0: V3, p1: V3, p2: V3, p3: V3): (s: number) => V3 {
  return (s) => {
    const u = 1 - s;
    const a = u * u * u, b = 3 * u * u * s, c = 3 * u * s * s, d = s * s * s;
    return [
      a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
      a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
      a * p0[2] + b * p1[2] + c * p2[2] + d * p3[2],
    ];
  };
}

/** 周期函数插值（角度，度）：高斯核加权平均，结果平滑 */
export function periodic(points: [number, number][], sigma = 14): (deg: number) => number {
  return (deg) => {
    let ws = 0;
    let vs = 0;
    for (const [d, v] of points) {
      const dd = Math.abs((((deg - d) % 360) + 540) % 360 - 180);
      const w = Math.exp(-(dd * dd) / (sigma * sigma));
      ws += w;
      vs += w * v;
    }
    return vs / ws;
  };
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function bounds(g: Geo): { min: V3; max: V3 } {
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < g.pos.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], g.pos[i + k]);
      max[k] = Math.max(max[k], g.pos[i + k]);
    }
  }
  return { min, max };
}
