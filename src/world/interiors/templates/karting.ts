import type { Kit } from '../kit.ts';
import { floorFinish, type Template } from './common.ts';

// 3F TurboKart（52×18，门在长边中间）。依据 docs/interior-references.md 第 14 节：
// 大堂占中轴前部（24×8）：展示赛车、长前台 + 头盔柜（按颜色分层）、登记机、圈速排行榜屏、
// 皮沙发 + Pit Café、三级颁奖台 + 格旗墙，玻璃护栏把大堂和赛道隔开。
// 赛道绕着大堂成 “M” 形闭环（宽 4 m），起终点线在大堂玻璃正后方；
// 中心线以世界坐标交给运行时的驾驶系统（src/systems/karting/）。

const TRACK_HALF = 2.0;
/** 赛道拐点（局部坐标，顺着行驶方向）；内侧直道经过大堂玻璃后面，和外侧直道之间留 0.8 m 放轮胎墙 */
const CORNERS: [number, number][] = [
  [3, 15.2],
  [49, 15.2],
  [49, 3.2],
  [41, 3.2],
  [41, 10.4],
  [11, 10.4],
  [11, 3.2],
  [3, 3.2],
];
const CORNER_R = 3.0;

/** 圆角折线：每个拐点用半径约 r 的圆弧过渡，返回闭合的采样点（约 0.5 m 一个） */
function roundedLoop(pts: [number, number][], r: number): [number, number][] {
  const out: [number, number][] = [];
  const n = pts.length;
  const lineTo = (to: [number, number], includeEnd: boolean) => {
    const from = out[out.length - 1];
    const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const steps = Math.max(1, Math.round(len / 0.5));
    for (let s = 1; s <= (includeEnd ? steps : steps - 1); s++) out.push([from[0] + ((to[0] - from[0]) * s) / steps, from[1] + ((to[1] - from[1]) * s) / steps]);
  };
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const d0 = norm(p1[0] - p0[0], p1[1] - p0[1]);
    const d1 = norm(p2[0] - p1[0], p2[1] - p1[1]);
    const a: [number, number] = [p1[0] - d0[0] * r, p1[1] - d0[1] * r];
    const b: [number, number] = [p1[0] + d1[0] * r, p1[1] + d1[1] * r];
    if (out.length) lineTo(a, true);
    else out.push(a);
    // 圆角：二次贝塞尔近似圆弧
    for (let s = 1; s <= 10; s++) {
      const t = s / 10;
      out.push([(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * p1[0] + t * t * b[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * p1[1] + t * t * b[1]]);
    }
  }
  lineTo(out[0], false);
  return out;
}

function norm(x: number, z: number): [number, number] {
  const l = Math.hypot(x, z) || 1;
  return [x / l, z / l];
}

/** 点到闭合折线的最短距离 */
function distToLoop(line: [number, number][], u: number, v: number): number {
  let best = Infinity;
  for (let i = 0; i < line.length; i++) {
    const [ax, az] = line[i];
    const [bx, bz] = line[(i + 1) % line.length];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((u - ax) * dx + (v - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(u - ax - dx * t, v - az - dz * t));
  }
  return best;
}

/** 贴地四边形（局部坐标），用 StaticBatch.quad 画 */
function flat(k: Kit, pts: [number, number][], h: number, color: string) {
  const f = k.f;
  const corners = pts.map(([u, v]) => [f.x(u, v), f.y + h, f.z(u, v)] as [number, number, number]);
  // 从上面看要逆时针：x/z 平面上的叉积为负
  const [a, b, c] = corners;
  const cross = (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]);
  if (cross > 0) corners.reverse();
  k.batch.quad({ corners, normal: [0, 1, 0], uvAxes: [0, 2], mat: 'prop', floor: f.shop.floor, tint: color });
}

/** 停着的卡丁车（静态，合并进批次）：中心 (u, v)，车头朝 +v（dir = 1）或 -v（dir = -1） */
function parkedKart(k: Kit, u: number, v: number, dir: 1 | -1, color: string, h0 = 0) {
  const V = (dv: number) => v + dv * dir;
  const B = (u0: number, u1: number, a: number, b: number, z0: number, z1: number, c: string) => k.box(u + u0, Math.min(V(a), V(b)), u + u1, Math.max(V(a), V(b)), h0 + z0, h0 + z1, 'prop', c);
  B(-0.46, 0.46, -0.75, 0.75, 0.08, 0.13, '#2b2d42');
  B(-0.39, 0.39, 0.55, 0.89, 0.12, 0.28, color);
  B(-0.22, 0.22, 0.25, 0.6, 0.18, 0.36, color);
  B(-0.5, -0.32, -0.45, 0.37, 0.12, 0.29, color);
  B(0.32, 0.5, -0.45, 0.37, 0.12, 0.29, color);
  B(-0.52, 0.52, -0.9, -0.78, 0.12, 0.24, '#1b1b1b');
  B(-0.21, 0.21, -0.51, -0.09, 0.14, 0.22, '#1b1b1b');
  B(-0.21, 0.21, -0.57, -0.49, 0.22, 0.62, '#1b1b1b');
  B(0.17, 0.43, -0.73, -0.47, 0.15, 0.39, '#8d99ae');
  B(-0.02, 0.02, 0.1, 0.24, 0.3, 0.5, '#1b1b1b');
  B(-0.13, 0.13, 0.08, 0.12, 0.48, 0.52, '#1b1b1b');
  for (const [du, dv, r, w] of [
    [-0.5, 0.56, 0.13, 0.14],
    [0.5, 0.56, 0.13, 0.14],
    [-0.52, -0.56, 0.145, 0.2],
    [0.52, -0.56, 0.145, 0.2],
  ])
    k.cyl(u + du, V(dv), h0 + r, r, w, '#1b1b1b', 'u');
}

export const karting: Template = (k) => {
  const { W, D } = k;
  const door = k.f.door;
  const mid = (door.u0 + door.u1) / 2;
  k.backFeature = true;
  const lu0 = 14.0;
  const lu1 = 38.0;
  const lv1 = 8.0;
  const inLobby = (u: number, v: number, m = 0) => u > lu0 - m && u < lu1 + m && v < lv1 + m;

  // ===================== 赛道 =====================
  // 底层水泥地（避开大堂，免得两层地面重叠闪烁）
  floorFinish(k, '#8d939a', 0.25, 0.25, lu0, D - 0.25);
  floorFinish(k, '#8d939a', lu1, 0.25, W - 0.25, D - 0.25);
  floorFinish(k, '#8d939a', lu0, lv1, lu1, D - 0.25);
  const line = roundedLoop(CORNERS, CORNER_R);
  const n = line.length;
  const tangent = (i: number) => {
    const q = line[(i + 1) % n];
    const o = line[(i - 1 + n) % n];
    return norm(q[0] - o[0], q[1] - o[1]);
  };
  const edge = (i: number, off: number): [number, number] => {
    const [dx, dz] = tangent(i);
    return [line[i][0] - dz * off, line[i][1] + dx * off];
  };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    flat(k, [edge(i, -TRACK_HALF), edge(j, -TRACK_HALF), edge(j, TRACK_HALF), edge(i, TRACK_HALF)], 0.01, '#3d405b');
    // 弯道铺红白路肩（方向变化处）
    const a = tangent(i);
    const b = tangent(j);
    if (Math.abs(a[0] * b[1] - a[1] * b[0]) > 0.02) {
      const col = i % 2 ? '#ffffff' : '#d62828';
      for (const s of [-1, 1]) flat(k, [edge(i, s * TRACK_HALF), edge(j, s * TRACK_HALF), edge(j, s * (TRACK_HALF + 0.4)), edge(i, s * (TRACK_HALF + 0.4))], 0.014, col);
    }
  }
  // 两条白色边线
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    for (const s of [-1, 1]) flat(k, [edge(i, s * (TRACK_HALF - 0.12)), edge(j, s * (TRACK_HALF - 0.12)), edge(j, s * (TRACK_HALF - 0.2)), edge(i, s * (TRACK_HALF - 0.2))], 0.012, '#e9ecef');
  }
  // 起终点线：内侧直道（大堂玻璃后面），两排黑白格
  const sv = 10.4;
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 8; c++) {
      const u0 = mid - 0.5 + r * 0.5;
      const v0 = sv - TRACK_HALF + c * 0.5;
      flat(k, [
        [u0, v0],
        [u0 + 0.5, v0],
        [u0 + 0.5, v0 + 0.5],
        [u0, v0 + 0.5],
      ], 0.018, (r + c) % 2 ? '#ffffff' : '#1b1b1b');
    }
  // 发车格：起点线后面（行驶方向是 -u，所以在 +u 一侧）的白色标记
  for (let g = 0; g < 4; g++) {
    const gu = mid + 2.2 + g * 2.0;
    const gv = sv + (g % 2 ? 0.9 : -0.9);
    flat(k, [
      [gu, gv - 0.6],
      [gu + 0.1, gv - 0.6],
      [gu + 0.1, gv + 0.6],
      [gu, gv + 0.6],
    ], 0.016, '#ffffff');
  }
  // 轮胎墙：赛道两侧每 0.6 m 一摞（3 个轮胎，顶上红白相间），不压赛道、不进大堂
  const tyres: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    for (const s of [-1, 1]) {
      const [u, v] = edge(i, s * (TRACK_HALF + 0.4));
      if (u < 0.5 || u > W - 0.5 || v < 0.5 || v > D - 0.5) continue;
      if (inLobby(u, v, 0.4)) continue;
      if (distToLoop(line, u, v) < TRACK_HALF + 0.3) continue;
      if (tyres.some(([tu, tv]) => Math.hypot(tu - u, tv - v) < 0.58)) continue;
      tyres.push([u, v]);
    }
  }
  tyres.forEach(([u, v], idx) => {
    for (let t = 0; t < 3; t++) k.cyl(u, v, t * 0.2, 0.28, 0.19, t === 2 ? (idx % 2 ? '#ffffff' : '#d62828') : '#1b1b1b');
  });
  // 头顶两串格旗（细线 + 黑白小旗）
  for (const fv of [sv, 15.2]) {
    k.box(1.5, fv - 0.01, W - 1.5, fv + 0.01, 4.6, 4.62, 'metal');
    for (let u = 1.8; u < W - 1.8; u += 0.6) k.box(u - 0.14, fv - 0.01, u + 0.14, fv + 0.01, 4.32, 4.6, 'prop', Math.round(u / 0.6) % 2 ? '#ffffff' : '#1b1b1b');
  }
  // 两个回头弯里侧是维修区：停着几辆备用车、工具车、加油桶
  for (const pu of [7, W - 7]) {
    k.box(pu - 1.15, 6.0, pu + 1.15, 12.6, 0, 0.012, 'prop', '#5c6370');
    for (let i = 0; i < 3; i++) parkedKart(k, pu, 7.2 + i * 1.95, 1, ['#d62828', '#3a86ff', '#fcbf49', '#06d6a0', '#ff8fab', '#d62828'][(pu > W / 2 ? 3 : 0) + i]);
    k.box(pu - 0.35, 12.0, pu + 0.35, 12.45, 0, 0.9, 'prop', '#d62828');
    for (let d = 0; d < 3; d++) k.box(pu - 0.33, 11.98, pu + 0.33, 12.0, 0.2 + d * 0.25, 0.22 + d * 0.25, 'metal');
    k.cyl(pu + 0.75, 12.2, 0, 0.22, 0.75, '#fcbf49');
  }
  // 主视觉横幅挂在后墙正中（隔着赛道正对大门）
  k.card('kart-banner', -1, mid, D - 0.17, 3.3, 0, -1, 6.6, 4.4);
  k.special('kartTrack', mid, sv, 0, -1, 0, TRACK_HALF * 2, 0, {
    points: line.map(([u, v]) => k.world(u, v)),
    half: TRACK_HALF,
    start: k.world(mid, sv),
    // 发车位置（起点线后 5 m，朝 -u 行驶）
    grid: k.world(mid + 5.0, sv),
  });

  // ===================== 大堂 =====================
  floorFinish(k, '#d9dbe0', lu0, 0.25, lu1, lv1);
  // 玻璃护栏（三面）
  const glass = (u0: number, v0: number, u1: number, v1: number) => {
    k.box(u0, v0, u1, v1, 0, 1.2, 'glass');
    k.box(u0, v0, u1, v1, 1.2, 1.26, 'prop', '#d62828');
    k.solid(u0, v0, u1, v1, 2.2);
  };
  glass(lu0 - 0.05, lv1 - 0.05, lu1 + 0.05, lv1 + 0.05);
  glass(lu0 - 0.05, 0.25, lu0 + 0.05, lv1 - 0.05);
  glass(lu1 - 0.05, 0.25, lu1 + 0.05, lv1 - 0.05);
  // 门口留空
  k.reserve(door.u0 + 1.5, 0, door.u1 - 1.5, 2.2);
  // 门口到展示车的红色引导地毯（两侧白边）
  k.box(mid - 0.75, 0.3, mid + 0.75, 2.6, 0, 0.012, 'prop', '#d62828');
  for (const e of [-0.8, 0.75]) k.box(mid + e, 0.3, mid + e + 0.05, 2.6, 0, 0.014, 'prop', '#ffffff');
  // 展示赛车：浅色圆台（红边）上放一辆放大的赛车
  const dv = 4.0;
  k.cyl(mid, dv, 0, 1.3, 0.12, '#d62828');
  k.cyl(mid, dv, 0.12, 1.2, 0.1, '#e9ecef');
  parkedKart(k, mid, dv, -1, '#d62828', 0.22);
  k.solid(mid - 1.3, dv - 1.3, mid + 1.3, dv + 1.3, 0.75);
  // 长前台（黑色台身、红色灯带）+ 背后头盔柜（按颜色分层）
  const fu0 = lu0 + 1.0;
  const fu1 = fu0 + 5.0;
  const fv = 4.8;
  k.counter(fu0, fv, fu1, fv + 0.8, { color: '#1b1b1b', top: '#3d405b' });
  k.box(fu0, fv - 0.02, fu1, fv, 0.05, 0.12, 'prop', '#d62828');
  k.staff((fu0 + fu1) / 2, fv + 1.4, 0, -1);
  const helmets = ['#ff8fab', '#d62828', '#3a86ff', '#1b1b1b'];
  k.box(fu0, lv1 - 0.55, fu1, lv1 - 0.1, 0, 2.0, 'prop', '#2b2d42');
  for (let l = 0; l < 4; l++) for (let u = fu0 + 0.3; u < fu1 - 0.2; u += 0.42) k.cyl(u, lv1 - 0.57, 0.15 + l * 0.48, 0.16, 0.24, helmets[l]);
  k.solid(fu0, lv1 - 0.55, fu1, lv1 - 0.1, 2.0);
  // 赛车服挂杆（靠左侧玻璃）
  k.rack('v', 1.8, 3.9, lu0 + 0.45, { palette: ['#d62828', '#1b1b1b', '#fcbf49', '#3a86ff'] });
  // 前台上方吊着的圈速排行榜屏（运行时画排行）
  const bu = (fu0 + fu1) / 2;
  k.box(bu - 1.7, fv + 0.38, bu + 1.7, fv + 0.42, 2.75, 3.95, 'prop', '#0b0b12');
  for (const s of [-1.4, 1.4]) k.box(bu + s - 0.01, fv + 0.39, bu + s + 0.01, fv + 0.41, 3.95, 5.6, 'metal');
  k.special('kartBoard', bu, fv + 0.37, 3.35, 0, -1, 3.3, 1.1);
  // 登记机（4 台立柜）：在这里租车
  for (let i = 0; i < 4; i++) {
    const u = fu1 + 0.7 + i * 0.7;
    k.box(u - 0.25, fv + 0.1, u + 0.25, fv + 0.6, 0, 1.3, 'prop', '#1b1b1b');
    k.box(u - 0.2, fv + 0.08, u + 0.2, fv + 0.1, 0.85, 1.25, 'prop', '#3a86ff');
    k.box(u - 0.25, fv - 0.15, u + 0.25, fv + 0.1, 0.9, 0.95, 'prop', '#3d405b');
    k.solid(u - 0.25, fv - 0.15, u + 0.25, fv + 0.6, 1.3);
  }
  k.special('kartRent', fu1 + 1.75, fv - 0.7, 0, 0, 1, 2.8, 0);
  // 右侧休息区：黑皮沙发 + 矮桌 + Pit Café 吧台
  k.sofa('v', 2.2, 4.6, lu1 - 0.15, -1, 0, '#1b1b1b');
  k.sofa('u', lu1 - 4.4, lu1 - 2.0, 0.3, 0, 1, '#1b1b1b');
  k.table(lu1 - 2.3, 3.2, 1.0, 0.6, { h: 0.45, top: '#3d405b', color: '#1b1b1b' });
  k.counter(lu1 - 4.6, 5.8, lu1 - 1.0, 6.4, { color: '#d62828', top: '#fcbf49', register: false });
  k.box(lu1 - 1.8, 6.0, lu1 - 1.3, 6.3, 1.0, 1.45, 'metal');
  k.box(lu1 - 3.0, 6.05, lu1 - 2.2, 6.3, 1.0, 1.25, 'prop', '#f8f9fa');
  for (let u = lu1 - 4.2; u < lu1 - 1.2; u += 0.75) k.stool(u, 5.3, 0, 1, '#1b1b1b');
  // 颁奖台 + 格旗墙（左前角）
  const pu = lu0 + 1.9;
  for (const [du, h] of [
    [-0.8, 0.5],
    [0, 0.75],
    [0.8, 0.35],
  ])
    k.box(pu + du - 0.4, 0.5, pu + du + 0.4, 1.1, 0, h, 'prop', du === 0 ? '#fcbf49' : du < 0 ? '#adb5bd' : '#cd7f32');
  k.solid(pu - 1.2, 0.5, pu + 1.2, 1.1, 0.75);
  for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) k.box(pu - 1.6 + c * 0.4, 0.26, pu - 1.2 + c * 0.4, 0.28, 1.0 + r * 0.4, 1.4 + r * 0.4, 'prop', (r + c) % 2 ? '#ffffff' : '#1b1b1b');
};
