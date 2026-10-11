import type { Kit } from '../kit.ts';
import { place, type Template } from './common.ts';

// 5F Skyline Garden（室外，商场最西端，正好朝着日落方向）。
// 入口进来一条石板路通到中间的喷泉广场，横向小路连到两头：
// 北段爬藤花架 + 长桌长凳，南段菜园（番茄、薄荷）+ 温室 + 育苗台（陶爷爷），
// 西侧栏杆边是看日落的木平台和躺椅；草坪、花坛、树，沿路的灯笼入夜会亮。

const GRASS = '#7cc47a';
const STONE = '#e3dccf';
const WOODC = '#b08968';
const FLOWERS = ['#ff8fab', '#ffd166', '#ffffff', '#c77dff', '#ff6b6b', '#ffb703', '#90e0ef'];

/** 地面薄层：草坪在下，石板路在上，避免抢深度 */
function ground(k: Kit, u0: number, v0: number, u1: number, v1: number, color: string, layer: number) {
  k.box(u0, v0, u1, v1, 0, 0.004 + layer * 0.004, 'prop', color);
}

/** 灯笼：细柱 + 灯头（夜里发光） */
function lantern(k: Kit, u: number, v: number, h = 2.0) {
  k.box(u - 0.04, v - 0.04, u + 0.04, v + 0.04, 0, h, 'prop', '#3d405b');
  k.box(u - 0.12, v - 0.12, u + 0.12, v + 0.12, h, h + 0.04, 'prop', '#3d405b');
  k.glow(u, v, h + 0.18, 0.16, '#ffe2a0');
  k.box(u - 0.1, v - 0.1, u + 0.1, v + 0.1, h + 0.32, h + 0.36, 'prop', '#3d405b');
  k.solid(u - 0.12, v - 0.12, u + 0.12, v + 0.12, h);
}

/** 花坛：低矮土台 + 一丛丛花 */
function flowerBed(k: Kit, u0: number, v0: number, u1: number, v1: number) {
  k.box(u0, v0, u1, v1, 0, 0.25, 'prop', '#8d6e63');
  k.box(u0 + 0.05, v0 + 0.05, u1 - 0.05, v1 - 0.05, 0.25, 0.28, 'prop', '#6b4f3a');
  for (let u = u0 + 0.2; u < u1 - 0.1; u += 0.28)
    for (let v = v0 + 0.2; v < v1 - 0.1; v += 0.28) {
      k.cyl(u + k.range(-0.05, 0.05), v + k.range(-0.05, 0.05), 0.28, 0.06, k.range(0.12, 0.3), '#6a994e');
      k.cyl(u + k.range(-0.05, 0.05), v + k.range(-0.05, 0.05), 0.42 + k.range(0, 0.15), 0.07, 0.05, k.pick(FLOWERS));
    }
  k.solid(u0, v0, u1, v1, 0.4);
}

/** 树：木框树池 + 树干 + 两三层树冠 */
function tree(k: Kit, u: number, v: number, s = 1) {
  k.box(u - 0.6 * s, v - 0.6 * s, u + 0.6 * s, v + 0.6 * s, 0, 0.45, 'prop', WOODC);
  k.box(u - 0.55 * s, v - 0.55 * s, u + 0.55 * s, v + 0.55 * s, 0.45, 0.48, 'prop', '#6b4f3a');
  k.cyl(u, v, 0.45, 0.12 * s, 1.6 * s, '#7f5539');
  k.cyl(u, v, 0.45 + 1.4 * s, 1.0 * s, 0.9 * s, '#52b788');
  k.cyl(u, v, 0.45 + 2.2 * s, 0.75 * s, 0.7 * s, '#74c69d');
  k.cyl(u, v, 0.45 + 2.8 * s, 0.4 * s, 0.4 * s, '#95d5b2');
  k.solid(u - 0.6 * s, v - 0.6 * s, u + 0.6 * s, v + 0.6 * s, 0.45);
}

export const garden: Template = (k) => {
  const { W, D } = k;
  const door = k.f.door;
  const mid = (door.u0 + door.u1) / 2;
  k.backFeature = true;
  k.reserve(mid - 1.4, 0, mid + 1.4, 6.0);

  // ---- 地面：草坪、石板路、广场 ----
  ground(k, 0.4, 0.4, W - 0.4, D - 0.4, GRASS, 0);
  ground(k, mid - 1.4, 0.1, mid + 1.4, 6.2, STONE, 1);
  ground(k, mid - 6.0, 6.2, mid + 6.0, 11.8, STONE, 1);
  ground(k, 2.0, 8.0, mid - 6.0, 10.0, STONE, 1);
  ground(k, mid + 6.0, 8.0, W - 2.0, 10.0, STONE, 1);

  // ---- 喷泉广场 ----
  const fu = mid;
  const fv = 9.0;
  k.cyl(fu, fv, 0, 1.7, 0.45, '#d6ccc2');
  k.cyl(fu, fv, 0.38, 1.55, 0.08, '#8ecae6');
  k.cyl(fu, fv, 0.45, 0.25, 0.7, '#d6ccc2');
  k.cyl(fu, fv, 1.15, 0.7, 0.15, '#d6ccc2');
  k.cyl(fu, fv, 1.25, 0.6, 0.05, '#8ecae6');
  k.cyl(fu, fv, 1.3, 0.07, 0.5, '#bde0fe');
  k.solid(fu - 1.7, fv - 1.7, fu + 1.7, fv + 1.7, 0.45);
  for (const s of [-1, 1]) {
    for (const [a0, a1] of [
      [6.6, 7.9],
      [10.1, 11.4],
    ])
      k.bench('v', a0, a1, fu + s * 4.9, -s, 0, { color: WOODC });
    k.bench('u', fu + s * 2.4 - 1.2, fu + s * 2.4 + 1.2, 11.35, 0, -1, { color: WOODC });
  }
  for (const [du, dv] of [
    [-5.6, 6.6],
    [5.6, 6.6],
    [-5.6, 11.4],
    [5.6, 11.4],
  ])
    lantern(k, fu + du, dv);

  // ---- 入口两旁的花坛和树 ----
  flowerBed(k, mid - 3.4, 1.0, mid - 1.8, 5.4);
  flowerBed(k, mid + 1.8, 1.0, mid + 3.4, 5.4);
  tree(k, mid - 5.0, 3.0, 1.1);
  tree(k, mid + 5.0, 3.0, 1.1);
  for (const u of [mid - 1.8, mid + 1.8]) lantern(k, u, 0.8);

  // ---- 横向小路两侧的灯笼 ----
  for (const u of [4, 9, 14, mid + 11, mid + 16, mid + 21]) if (u < W - 2) lantern(k, u, 10.5);

  // ---- 北段：爬藤花架 + 长桌长凳 + 串灯 ----
  const pu0 = 4.0;
  const pu1 = 12.0;
  const pv0 = 2.0;
  const pv1 = 6.2;
  for (const [u, v] of [
    [pu0, pv0],
    [pu1, pv0],
    [pu0, pv1],
    [pu1, pv1],
  ]) {
    k.box(u - 0.08, v - 0.08, u + 0.08, v + 0.08, 0, 2.6, 'prop', WOODC);
    k.solid(u - 0.08, v - 0.08, u + 0.08, v + 0.08, 2.6);
  }
  for (const v of [pv0, pv1]) k.box(pu0 - 0.2, v - 0.06, pu1 + 0.2, v + 0.06, 2.6, 2.75, 'prop', WOODC);
  for (let u = pu0; u <= pu1 + 0.01; u += 0.8) k.box(u - 0.04, pv0 - 0.3, u + 0.04, pv1 + 0.3, 2.75, 2.83, 'prop', WOODC);
  for (let i = 0; i < 18; i++) k.cyl(k.range(pu0, pu1), k.range(pv0, pv1), 2.8, k.range(0.2, 0.45), 0.2, k.pick(['#52b788', '#74c69d', '#ff8fab']));
  for (let u = pu0 + 0.4; u < pu1; u += 0.8) k.glow(u, (pv0 + pv1) / 2, 2.55, 0.06, '#fff3b0');
  const tu = (pu0 + pu1) / 2;
  const tv = (pv0 + pv1) / 2;
  k.table(tu, tv, 3.0, 0.9, { top: WOODC, color: '#7f5539' });
  k.bench('u', tu - 1.5, tu + 1.5, tv - 0.85, 0, 1, { color: WOODC });
  k.bench('u', tu - 1.5, tu + 1.5, tv + 0.85, 0, -1, { color: WOODC });
  flowerBed(k, 2.0, 11.6, 7.0, 12.8);
  tree(k, 3.4, 15.6, 1.2);
  // 草坪上的野餐桌
  const nu = 15.5;
  const nv = 4.2;
  place(k, nu, nv, 2.0, 2.4, () => {
    k.table(nu, nv, 1.8, 0.8, { top: '#ddb892', color: '#7f5539' });
    k.bench('u', nu - 0.9, nu + 0.9, nv - 0.75, 0, 1, { color: '#ddb892' });
    k.bench('u', nu - 0.9, nu + 0.9, nv + 0.75, 0, -1, { color: '#ddb892' });
  });

  // ---- 南段：菜园（番茄、薄荷）、育苗台、温室 ----
  for (const [u0, v0] of [
    [mid + 8.0, 1.6],
    [mid + 11.4, 1.6],
    [mid + 14.8, 1.6],
    [mid + 8.0, 3.6],
    [mid + 11.4, 3.6],
    [mid + 14.8, 3.6],
  ]) {
    if (u0 + 2.6 > W - 0.6) continue;
    k.box(u0, v0, u0 + 2.6, v0 + 1.1, 0, 0.4, 'prop', WOODC);
    k.box(u0 + 0.06, v0 + 0.06, u0 + 2.54, v0 + 1.04, 0.4, 0.43, 'prop', '#6b4f3a');
    for (let u = u0 + 0.3; u < u0 + 2.4; u += 0.45) {
      k.cyl(u, v0 + 0.55, 0.43, 0.14, 0.35, '#6a994e');
      k.box(u - 0.01, v0 + 0.54, u + 0.01, v0 + 0.56, 0.43, 1.0, 'prop', '#a68a64');
      for (let t = 0; t < 3; t++) k.cyl(u + k.range(-0.1, 0.1), v0 + 0.55 + k.range(-0.1, 0.1), 0.6 + k.range(0, 0.3), 0.05, 0.08, '#e63946');
    }
    k.solid(u0, v0, u0 + 2.6, v0 + 1.1, 0.43);
  }
  // 育苗台 + 薄荷盆栽，陶爷爷站在台前
  const bu = mid + 12.0;
  k.counter(bu - 1.2, 5.3, bu + 1.2, 5.9, { color: WOODC, top: '#ddb892', register: false });
  for (let i = 0; i < 6; i++) {
    k.cyl(bu - 1.0 + i * 0.4, 5.6, 1.0, 0.1, 0.14, '#c9a27e');
    k.cyl(bu - 1.0 + i * 0.4, 5.6, 1.14, 0.12, 0.12, i % 2 ? '#74c69d' : '#52b788');
  }
  k.staff(bu, 6.6, 0, 1);
  // 温室：玻璃墙 + 屋顶，里面一层层盆栽
  const gu0 = W - 7.0;
  const gu1 = W - 1.6;
  const gv0 = 11.0;
  const gv1 = 14.4;
  k.box(gu0, gv0, gu1, gv0 + 0.05, 0, 2.5, 'glass');
  k.box(gu0, gv1 - 0.05, gu1, gv1, 0, 2.5, 'glass');
  k.box(gu1 - 0.05, gv0, gu1, gv1, 0, 2.5, 'glass');
  k.box(gu0, gv0, gu0 + 0.05, gv0 + 1.0, 0, 2.5, 'glass');
  k.box(gu0, gv0 + 2.2, gu0 + 0.05, gv1, 0, 2.5, 'glass');
  k.box(gu0, gv0, gu1, gv1, 2.5, 2.55, 'glass');
  for (const [a, b] of [
    [gu0, gv0],
    [gu1, gv0],
    [gu0, gv1],
    [gu1, gv1],
  ])
    k.box(a - 0.05, b - 0.05, a + 0.05, b + 0.05, 0, 2.6, 'prop', '#f8f9fa');
  k.solid(gu0, gv0, gu1, gv0 + 0.06, 2.5);
  k.solid(gu0, gv1 - 0.06, gu1, gv1, 2.5);
  k.solid(gu1 - 0.06, gv0 + 0.07, gu1, gv1 - 0.07, 2.5);
  k.solid(gu0, gv0 + 0.06, gu0 + 0.06, gv0 + 1.0, 2.5);
  k.solid(gu0, gv0 + 2.2, gu0 + 0.06, gv1 - 0.06, 2.5);
  k.shelf('u', gu0 + 0.6, gu1 - 0.4, gv1 - 0.1, -1, { palette: ['#52b788', '#74c69d', '#ff8fab', '#ffd166'], height: 1.6, levels: 3, depth: 0.5, color: '#f8f9fa', item: { w: [0.18, 0.24], h: [0.2, 0.3] } });
  tree(k, mid + 9.0, 13.0, 1.1);
  flowerBed(k, mid + 13.0, 11.6, mid + 17.5, 12.8);

  // ---- 西侧：看日落的木平台 + 躺椅 + 灯笼 ----
  const dv0 = D - 3.4;
  const dv1 = D - 0.5;
  k.box(4.0, dv0, W - 4.0, dv1, 0, 0.12, 'prop', '#c8a27a', 'solid');
  for (let u = 4.4; u < W - 4.2; u += 0.5) k.box(u, dv0, u + 0.02, dv1, 0.12, 0.122, 'prop', '#a68a64');
  for (let u = 6.0; u < W - 5.0; u += 2.2) {
    if (Math.abs(u - mid) < 1.6) continue;
    k.chair(u, dv1 - 1.3, 0, 1, { color: k.pick(['#ffffff', '#90e0ef', '#ffd166']), seatH: 0.5, w: 0.62 });
  }
  for (let u = 8.0; u < W - 6; u += 8.0) lantern(k, u, dv0 - 0.4, 2.2);
};
