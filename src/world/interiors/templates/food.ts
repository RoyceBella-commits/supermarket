import type { ShopCategory } from '../../../data/layoutTypes.ts';
import { shade, type Kit } from '../kit.ts';
import { BREAD, DARK_WOOD, FRUIT, M, PASTEL, TOYS, WOOD, backPanel, cash, doorMid, grid, place, stoolRow, type Template } from './common.ts';

// 餐饮类（docs/interior-references.md 第 9–11、19 节）。
// 座位一律能坐；桌椅组合之间留 ≥ 1.2 m；门口留出进门的路。

const wallL = (k: Kit) => k.f.walls.left + 0.05;
const wallR = (k: Kit) => k.W - k.f.walls.right - 0.05;
const wallB = (k: Kit) => k.D - k.f.walls.back - 0.05;

/** 美食图集 3×2：拉面、寿司、咖喱饭 / 汉堡薯条、意面、饺子 */
const FOOD_CELLS: Partial<Record<ShopCategory, number[]>> = {
  ramen: [0, 5],
  curry: [2],
  grill: [3],
  italian: [4],
};

/** 门口留空：开口中线左右各 1.5 m、往里 depth 米 */
function entryClear(k: Kit, depth = 2.5, half = 1.5) {
  const mid = doorMid(k);
  k.reserve(mid - half, 0, mid + half, depth);
}

/** 一张桌子 + 椅子：seats 2/4/6，axis 是桌子长边方向 */
function tableSet(k: Kit, cu: number, cv: number, seats: 2 | 4 | 6, o: { axis?: 'u' | 'v'; chair?: string; top?: string; color?: string; size?: number } = {}) {
  const axis = o.axis ?? 'u';
  const long = o.size ?? (seats === 6 ? 1.8 : seats === 4 ? 1.2 : 0.7);
  const w = axis === 'u' ? long : 0.8;
  const d = axis === 'u' ? 0.8 : long;
  return place(k, cu, cv, w + (axis === 'v' ? 1.3 : 0), d + (axis === 'u' ? 1.3 : 0), () => {
    k.table(cu, cv, w, d, { top: o.top, color: o.color });
    const per = seats / 2;
    for (let i = 0; i < per; i++) {
      const a = (i - (per - 1) / 2) * (long / per);
      if (axis === 'u') {
        k.chair(cu + a, cv - 0.68, 0, 1, { color: o.chair });
        k.chair(cu + a, cv + 0.68, 0, -1, { color: o.chair });
      } else {
        k.chair(cu - 0.68, cv + a, 1, 0, { color: o.chair });
        k.chair(cu + 0.68, cv + a, -1, 0, { color: o.chair });
      }
    }
  }, 0.55);
}

/** 沿墙卡座：桌子垂直于墙，两侧高背长凳 */
function wallBooths(k: Kit, wall: 'left' | 'right', v0: number, v1: number, color: string, top: string) {
  const c = wall === 'left' ? wallL(k) : wallR(k);
  const face = wall === 'left' ? 1 : -1;
  for (let v = v0; v + 2.3 <= v1; v += 2.5) {
    const tu0 = c + face * 0.02;
    const tu1 = c + face * 1.3;
    const [a, b] = [Math.min(tu0, tu1), Math.max(tu0, tu1)];
    k.table((a + b) / 2, v + 1.15, b - a, 0.7, { top, color: DARK_WOOD });
    k.sofa('u', a, b, v, 0, 1, color);
    k.sofa('u', a, b, v + 2.3, 0, -1, color);
  }
}

// ---------- 9. 咖啡 / 饮品 ----------

/** Kumo Coffee：沿侧墙的 L 形柜台（先过甜点柜 → 点单 → 吧台 → 取餐台）、后墙菜单板、窗边吧台、共享长桌、后部沙发区、门边豆子零售架 */
export const cafe: Template = (k) => {
  const { W, D } = k;
  if (W >= 20) return skyCafe(k);
  entryClear(k);
  const primary = k.f.shop.theme.primary;
  const wl = wallL(k);
  const wr = wallR(k);
  const wb = wallB(k);
  // 柜台沿左墙，从 v≈3 到 v≈12，店员在柜台和墙之间
  const cu = wl + 1.8;
  k.counter(cu - 0.35, 3.2, cu + 0.35, 4.6, { color: primary, top: '#fbf8f2', register: false });
  k.box(cu - 0.35, 3.2, cu + 0.35, 4.6, 1.0, 1.3, 'glass');
  for (let i = 0; i < 5; i++) k.product(cu, 3.35 + i * 0.25, 1.0, 0.18, 0.08, 0.18, true, k.pick(BREAD.concat(PASTEL)));
  k.counter(cu - 0.35, 4.6, cu + 0.35, 6.4, { color: primary, top: '#fbf8f2' });
  k.counter(cu - 0.35, 6.4, cu + 0.35, 9.6, { color: shade(primary, 0.9), top: '#fbf8f2', register: false });
  for (const v of [7.0, 8.4]) {
    k.box(cu - 0.25, v, cu + 0.25, v + 0.8, 1.0, 1.5, 'metal');
    k.cyl(cu - 0.1, v + 0.95, 1.0, 0.08, 0.35, '#2b2d42');
  }
  k.counter(cu - 0.35, 9.6, cu + 0.35, 10.8, { color: '#f1ece4', top: '#fbf8f2', register: false });
  k.box(cu - 0.3, 10.0, cu + 0.3, 10.3, 2.4, 2.6, 'prop', '#ffd166');
  k.staff(wl + 0.95, 5.5, 1, 0);
  // 柜台背后墙上三块菜单板
  for (let i = 0; i < 3; i++) k.panel('v', 4.8 + i * 1.3, 5.9 + i * 1.3, wl, 1, 2.0, 2.7, '#2d3142');
  k.reserve(cu + 0.35, 3.2, cu + 1.6, 10.8);
  // 门边：豆子和杯子零售架
  k.shelf('v', 1.4, 3.0, wr, -1, { palette: ['#6f4e37', '#a68a64', '#ffffff', '#7fa99b'], height: 1.6, levels: 4 });
  // 窗边吧台：门洞右侧贴前墙，吧凳面朝走廊
  const door = k.f.door;
  if (wr - door.u1 > 1.6) {
    k.box(door.u1 + 0.3, 0.2, wr - 0.2, 0.65, 1.0, 1.05, 'prop', WOOD);
    k.solid(door.u1 + 0.3, 0.2, wr - 0.2, 0.65, 1.05);
    stoolRow(k, 'u', door.u1 + 0.7, wr - 0.6, 1.05, 0, -1, 0.65);
  }
  // 中部：2 人桌、4 人桌、一条共享长桌
  const lu0 = cu + 2.2;
  place(k, (lu0 + wr) / 2, 8.4, 3.0, 2.2, () => {
    const cuL = (lu0 + wr) / 2;
    k.table(cuL, 8.4, 3.0, 1.0, { top: WOOD, color: DARK_WOOD });
    for (let i = 0; i < 4; i++) {
      k.chair(cuL - 1.1 + i * 0.73, 7.65, 0, 1, { color: '#c8553d' });
      k.chair(cuL - 1.1 + i * 0.73, 9.15, 0, -1, { color: '#c8553d' });
    }
  });
  grid(lu0, wr - 0.6, 4.2, 6.6, 2.4, 2.4, (u, v, i) => tableSet(k, u, v, i % 2 ? 4 : 2, { axis: 'v', chair: '#c8553d', top: '#e8d5b7' }));
  // 后部：沙发和扶手椅（安静区）
  k.sofa('u', lu0, Math.min(wr, lu0 + 3.0), wb, 0, -1, '#7fa99b');
  k.table(lu0 + 1.5, wb - 1.4, 1.2, 0.6, { h: 0.45, top: WOOD });
  for (const u of [wr - 0.6, wr - 1.6]) k.chair(u, wb - 2.6, 0, -1, { color: '#a98467', w: 0.7 });
  k.backFeature = false;
  void D;
};

/** Sky Café（24 宽）：中央回字形吧台（店员在里面），四周吧凳，外圈桌椅 */
function skyCafe(k: Kit) {
  const { W, D } = k;
  entryClear(k);
  const primary = k.f.shop.theme.primary;
  const cu = W / 2;
  const cv = D * 0.55;
  const hw = 3.0;
  const hd = 1.5;
  const ring = 0.7;
  const top = '#fbf8f2';
  k.counter(cu - hw, cv - hd, cu + hw, cv - hd + ring, { color: primary, top, register: false });
  k.counter(cu - hw, cv + hd - ring, cu + hw, cv + hd, { color: primary, top, register: false });
  k.counter(cu - hw, cv - hd + ring, cu - hw + ring, cv + hd - ring, { color: primary, top, register: false });
  k.counter(cu + hw - ring, cv - hd + ring - 0.0, cu + hw, cv + hd - ring - 1.0, { color: primary, top, register: true });
  k.box(cu + hw - 2.0, cv - 0.3, cu + hw - 1.2, cv + 0.2, 0, 1.4, 'metal');
  k.staff(cu + 0.8, cv, 0, -1);
  stoolRow(k, 'u', cu - hw + 0.4, cu + hw - 0.4, cv - hd - 0.45, 0, 1, 0.7);
  stoolRow(k, 'u', cu - hw + 0.4, cu + hw - 0.4, cv + hd + 0.45, 0, -1, 0.7);
  stoolRow(k, 'v', cv - hd + 0.4, cv + hd - 0.4, cu - hw - 0.45, 1, 0, 0.7);
  k.reserve(cu - hw - 1.0, cv - hd - 1.0, cu + hw + 1.0, cv + hd + 1.0);
  backPanel(k, cu - 2.0, cu + 2.0, 2.0, 2.7, '#2d3142');
  grid(1.4, W - 1.4, 2.8, D - 1.4, 3.0, 2.8, (u, v, i, j) => tableSet(k, u, v, (i + j) % 2 ? 4 : 2, { axis: 'v', chair: '#c8553d', top: '#e8d5b7' }));
}

/** Refuel Bar：后墙柜台上一排搅拌机 + 水果筐、照片菜单灯箱、蛋白粉罐墙、高桌 + 窗边吧台、体育大屏 */
export const juiceBar: Template = (k) => {
  const { W, D } = k;
  entryClear(k);
  const wb = wallB(k);
  const cu0 = W * 0.3;
  const cu1 = W * 0.8;
  k.counter(cu0, wb - 2.4, cu1, wb - 1.7, { color: '#ffb703', top: '#fff3b0', register: false });
  for (let u = cu0 + 0.4; u < cu1 - 0.3; u += 0.6) {
    k.box(u - 0.1, wb - 2.1, u + 0.1, wb - 1.9, 1.0, 1.15, 'prop', '#2b2d42');
    k.cyl(u, wb - 2.0, 1.15, 0.08, 0.25, '#e9ecef');
  }
  k.box(cu0 + 0.2, wb - 2.6, cu1 - 0.2, wb - 2.4, 0.7, 1.0, 'prop', '#8d6e63');
  for (let u = cu0 + 0.3; u < cu1 - 0.3; u += 0.18) k.cyl(u, wb - 2.5, 1.0, 0.07, 0.12, k.pick(FRUIT));
  k.staff((cu0 + cu1) / 2, wb - 1.1, 0, -1);
  k.box(cu0, wb - 0.5, cu1, wb, 0, 0.95, 'metal');
  k.solid(cu0, wb - 0.5, cu1, wb, 0.95);
  backPanel(k, cu0 + 0.5, cu1 - 0.5, 2.0, 2.9, '#023047');
  for (let i = 0; i < 4; i++) k.card('atlas-food', [3, 4, 2, 1][i], cu0 + 1.4 + i * ((cu1 - cu0 - 2.8) / 3), wb - 0.05, 2.45, 0, -1, 0.7, 0.7);
  k.backFeature = true;
  // 左半：蛋白粉罐墙
  for (let h = 0.2; h < 2.0; h += 0.36) for (let v = 1.6; v < D - 1.6; v += 0.22) k.cyl(wallL(k) + 0.2, v, h, 0.075, 0.25, k.pick(['#023047', '#ffb703', '#ffffff', '#219ebc']));
  k.shelf('v', 1.4, D - 1.4, wallL(k), 1, { palette: [], height: 2.0, levels: 5, depth: 0.4 });
  // 右半：高桌、窗边吧台、体育大屏
  grid(W * 0.55, W - 1.6, 2.8, wb - 3.4, 2.2, 2.4, (u, v) =>
    place(k, u, v, 1.6, 1.6, () => {
      k.table(u, v, 0.6, 0.6, { h: 1.05, top: '#fff3b0', color: '#023047' });
      k.stool(u - 0.55, v, 1, 0, '#023047');
      k.stool(u + 0.55, v, -1, 0, '#023047');
    }),
  );
  k.screen('v', 3.0, 6.0, wallR(k), -1, 1.6, 3.2, '#8ecae6');
  const door = k.f.door;
  if (door.u0 - wallL(k) > 2.0) {
    k.box(wallL(k) + 0.6, 0.2, door.u0 - 0.3, 0.65, 1.0, 1.05, 'prop', '#fff3b0');
    k.solid(wallL(k) + 0.6, 0.2, door.u0 - 0.3, 0.65, 1.05);
    stoolRow(k, 'u', wallL(k) + 1.0, door.u0 - 0.7, 1.05, 0, -1, 0.65, '#219ebc');
  }
};

/** Pearl Leaf（窄铺奶茶）：横跨门面的柜台（左点单右取餐）+ 配料罐、照片菜单灯箱、封口机、排队隔离带、沿墙一条窄凳 */
export const bubbleTea: Template = (k) => kioskCounter(k, { palette: ['#cdb4db', '#ffffff', '#ffafcc', '#d4a373'], jars: true, cv: 2.6 });

/** Snack Stop：同奶茶店的门面柜台，台上爆米花机，门内两张高桌 */
export const snacks: Template = (k) => kioskCounter(k, { palette: ['#ffb703', '#fb8500', '#ffffff', '#e63946'], popcorn: true, cv: 4.4 });

function kioskCounter(k: Kit, o: { palette: string[]; jars?: boolean; popcorn?: boolean; cv: number }) {
  const { D } = k;
  const primary = k.f.shop.theme.primary;
  const wl = wallL(k);
  const wr = wallR(k);
  const cv = o.cv;
  // 柜台（右边留 0.9 m 员工侧门）
  k.counter(wl, cv, wr - 0.95, cv + 0.6, { color: primary, top: '#fbf8f2' });
  if (o.jars) for (let u = wl + 0.6; u < wr - 1.6; u += 0.3) k.cyl(u, cv + 0.3, 1.0, 0.07, 0.22, k.pick(['#3d2b1f', '#ffffff', '#cdb4db']));
  if (o.popcorn) {
    k.box(wl + 1.2, cv + 0.1, wl + 1.8, cv + 0.5, 1.0, 1.7, 'glass');
    for (let i = 0; i < 10; i++) k.cyl(wl + 1.3 + (i % 5) * 0.1, cv + 0.25, 1.05 + Math.floor(i / 5) * 0.1, 0.05, 0.06, '#fff3b0');
  }
  k.staff((wl + wr) / 2 - 0.4, cv + 1.2, 0, -1);
  // 柜台后：设备一字排开、菜单灯箱、备料区
  k.box(wl, cv + 1.7, wr - 0.95, cv + 2.3, 0, 0.95, 'metal');
  k.solid(wl, cv + 1.7, wr - 0.95, cv + 2.3, 0.95);
  for (let u = wl + 0.4; u < wr - 1.4; u += 0.7) k.box(u - 0.15, cv + 1.85, u + 0.15, cv + 2.15, 0.95, 1.45, 'prop', k.pick(['#adb5bd', '#3d405b', '#e9ecef']));
  k.panel('u', wl + 0.3, wr - 0.3, cv + 2.35, -1, 2.0, 2.8, '#2d3142');
  if (o.jars) for (let i = 0; i < 4; i++) k.card('atlas-food', 5, wl + 0.9 + i * ((wr - wl - 1.8) / 3), cv + 2.3, 2.4, 0, -1, 0.6, 0.6);
  k.box(wl, cv + 2.4, wr, cv + 2.45, 0, 2.6, 'prop', '#e9e2d4');
  k.solid(wl, cv + 2.4, wr, cv + 2.45, 2.6);
  k.shelf('u', wl, wr - 1.7, wallB(k), -1, { palette: o.palette, height: 1.8, levels: 4 });
  k.staffDoor(wr - 0.85);
  k.backFeature = true;
  // 柜台前排队带；沿墙一条窄凳 / 两张高桌
  k.stanchions('v', 0.4, cv - 0.3, (wl + wr) / 2 + 0.6);
  if (o.popcorn) {
    // 门内两张高桌
    for (const u of [wr - 1.2, wr - 2.6]) {
      k.table(u, cv - 1.4, 0.6, 0.6, { h: 1.05, top: '#ffb703' });
      k.stool(u, cv - 2.05, 0, 1);
    }
  }
  k.bench('v', 0.5, cv - 0.4, wl + 0.25, 1, 0, { color: shade(primary, 0.8), depth: 0.35 });
  void D;
}

/** Crepe Cloud（原宿式）：门面左侧带编号的样品陈列柜、点单窗口、窗口后两台圆铁板、编号菜单板 */
export const crepes: Template = (k) => {
  const { W, D } = k;
  const door = k.f.door;
  const wl = wallL(k);
  const wr = wallR(k);
  const cv = 2.4;
  // 样品陈列柜：玻璃，三层斜台上一个个圆锥可丽饼
  const su0 = wl;
  const su1 = Math.min(door.u0 + 1.6, wr - 2.5);
  k.box(su0, 0.3, su1, 0.75, 0, 0.6, 'prop', '#f4a261');
  k.box(su0, 0.3, su1, 0.75, 0.6, 1.25, 'glass');
  k.solid(su0, 0.3, su1, 0.75, 1.25);
  for (let l = 0; l < 3; l++) for (let u = su0 + 0.15; u < su1 - 0.1; u += 0.22) {
    k.cyl(u, 0.45 + l * 0.1, 0.62 + l * 0.2, 0.04, 0.14, '#fff8e7');
    k.cyl(u, 0.45 + l * 0.1, 0.76 + l * 0.2, 0.05, 0.05, k.pick(['#e76f51', '#ffd166', '#90be6d', '#ffafcc']));
  }
  // 点单兼取餐柜台（店员侧留 0.9 m），后面两台圆铁板
  k.counter(wl, cv, wr - 0.95, cv + 0.6, { color: '#f4a261', top: '#fff8e7' });
  k.staff((wl + wr) / 2 - 0.4, cv + 1.2, 0, -1);
  k.box(wl + 0.4, cv + 1.6, wr - 1.3, cv + 2.3, 0, 0.9, 'metal');
  for (const u of [wl + 1.0, wl + 2.2]) k.cyl(u, cv + 1.95, 0.9, 0.2, 0.03, '#2b2d42');
  k.solid(wl + 0.4, cv + 1.6, wr - 1.3, cv + 2.3, 0.95);
  k.panel('u', wl + 0.2, wr - 0.2, cv + 2.5, -1, 2.0, 2.8, '#ff99c8');
  k.box(wl, cv + 2.55, wr, cv + 2.6, 0, 2.6, 'prop', '#e9e2d4');
  k.solid(wl, cv + 2.55, wr, cv + 2.6, 2.6);
  k.shelf('u', wl, wr - 1.7, wallB(k), -1, { palette: ['#fff8e7', '#ffd166'], height: 1.6, levels: 3 });
  k.staffDoor(wr - 0.85);
  k.backFeature = true;
  void W, void D;
};

/** Meeple Café：门内接待收银（按小时计费）+ 饮料吧、三面游戏柜、4 人桌和 6 人桌（桌上摊着版图）、后角 L 形沙发、入口新手推荐桌 */
export const boardGameCafe: Template = (k) => {
  const { W, D } = k;
  entryClear(k);
  const wl = wallL(k);
  const wr = wallR(k);
  const wb = wallB(k);
  cash(k, wr - 1.6, 3.4, { du: -1, dv: 0, w: 2.2, color: '#8d6346' });
  k.counter(wr - 0.6, 5.2, wr, 7.0, { color: '#8d6346', register: false });
  const games = { palette: TOYS, height: 2.0, levels: 6, depth: 0.4, item: { w: [0.28, 0.32] as [number, number], h: [0.06, 0.09] as [number, number] } };
  k.shelf('v', 1.4, wb - 0.5, wl, 1, games);
  k.shelf('u', wl + 0.5, wr - 1.7, wb, -1, games);
  k.shelf('v', 7.4, wb - 1.4, wr, -1, games);
  k.staffDoor(wr - 0.85);
  k.backFeature = true;
  place(k, k.f.door.u0 - 0.6, 3.2, 1.2, 0.8, () => k.displayTable(k.f.door.u0 - 0.6, 3.2, 1.2, 0.8, { palette: TOYS, h: 0.8, stacks: true }), 0.2);
  // 桌子：桌上摊着版图、散落的棋子
  const gameTable = (u: number, v: number, six: boolean) =>
    tableSet(k, u, v, six ? 6 : 4, { axis: 'u', top: '#ddb892', chair: '#7f5539', size: six ? 1.8 : 0.9 }) &&
    (k.box(u - (six ? 0.6 : 0.3), v - 0.25, u + (six ? 0.6 : 0.3), v + 0.25, 0.74, 0.745, 'prop', k.pick(['#2a9d8f', '#e9c46a', '#e76f51'])),
    Array.from({ length: 6 }, () => k.product(u + k.range(-0.3, 0.3), v + k.range(-0.2, 0.2), 0.745, 0.04, 0.05, 0.04, true, k.pick(TOYS))));
  grid(2.4, W - 4.2, 5.0, wb - 3.0, 3.2, 2.8, (u, v, i, j) => gameTable(u, v, (i + j) % 3 === 0));
  // 后角 L 形沙发 + 矮桌
  k.sofa('u', wl + 0.6, wl + 2.8, wb - 0.5, 0, -1, '#ffe8d6');
  k.table(wl + 1.7, wb - 1.9, 1.0, 0.6, { h: 0.45, top: '#ddb892' });
  void D;
};

// ---------- 10. 餐厅 ----------

/** 餐厅通用：后部厨房（隔墙 + 出菜口）、门口等位椅；返回厨房隔墙的 v */
function kitchen(k: Kit, depth: number, color: string, o: { pass?: boolean } = {}) {
  const wl = wallL(k);
  const wr = wallR(k);
  const kv = wallB(k) - depth;
  // 隔墙：中间开出菜口（1.5 宽 × 0.5 高，上面加热灯），一侧弹簧门（留空不封）
  const mid = (wl + wr) / 2;
  k.box(wl, kv - 0.1, mid - 0.75, kv, 0, 2.6, 'prop', color);
  k.box(mid + 0.75, kv - 0.1, wr - 1.2, kv, 0, 2.6, 'prop', color);
  k.box(mid - 0.75, kv - 0.1, mid + 0.75, kv, 0, 1.0, 'prop', color);
  k.box(mid - 0.75, kv - 0.1, mid + 0.75, kv, 1.5, 2.6, 'prop', color);
  k.box(mid - 0.75, kv - 0.3, mid + 0.75, kv, 1.0, 1.05, 'metal');
  k.box(wr - 1.2, kv - 0.1, wr, kv, 2.2, 2.6, 'prop', color);
  k.box(wr - 1.15, kv - 0.08, wr - 0.25, kv - 0.02, 0, 2.15, 'prop', shade(color, 0.85));
  k.solid(wl, kv - 0.1, wr, kv, 2.6);
  if (o.pass !== false) k.staff(mid, kv + 0.6, 0, -1);
  k.box(wl + 0.2, kv + 0.4, wr - 0.2, kv + 1.0, 0, 0.9, 'metal');
  return kv;
}

/** 门内沿墙一排等位椅 */
function waitingChairs(k: Kit, n = 4) {
  const v0 = 1.2;
  for (let i = 0; i < n; i++) k.chair(wallL(k) + 0.35, v0 + i * 0.6, 1, 0, { color: '#adb5bd' });
}

/** 菜单板上的美食图 */
function menuCards(k: Kit, v: number) {
  const menu = FOOD_CELLS[k.f.shop.category] ?? [];
  const W = k.W;
  menu.forEach((cell, i) => k.card('atlas-food', cell, W / 2 + (i - (menu.length - 1) / 2) * 1.3, v, 2.0, 0, -1, 0.9, 0.9));
}

/** Noodle Lane（拉面）：门内券売机 + 空位信息板、暖帘、U 形柜台（厨房在 U 里）+ 固定圆凳、柜台上的调料架、侧墙 4 人桌 */
export const ramen: Template = (k) => {
  const { W, D } = k;
  const door = k.f.door;
  entryClear(k);
  // 暖帘：挂在门洞上沿（不挡人）
  for (let u = door.u0 + 0.1; u < door.u1 - 0.1; u += 0.62) k.box(u, 0.18, u + 0.58, 0.2, 2.9, 3.55, 'prop', k.f.shop.theme.primary);
  // 券売机（门内右侧）+ 空位信息板
  const tu = door.u1 + 0.4;
  k.box(tu, 0.4, tu + 0.6, 0.9, 0, 1.7, 'prop', '#e9ecef');
  for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) k.box(tu + 0.06 + c * 0.13, 0.38, tu + 0.16 + c * 0.13, 0.4, 0.7 + r * 0.12, 0.78 + r * 0.12, 'prop', k.pick(['#ffd166', '#ef476f', '#06d6a0', '#ffffff']));
  k.solid(tu, 0.4, tu + 0.6, 0.9, 1.7);
  k.panel('v', 1.2, 2.2, wallR(k), -1, 1.4, 2.0, '#2b2d42');
  waitingChairs(k, 3);
  // U 形柜台：开口朝后墙，厨房（汤桶、煮面炉）在 U 里
  const wb = wallB(k);
  const u0 = 3.6;
  const u1 = W - 3.2;
  const v0 = 6.0;
  const v1 = wb - 1.2;
  const depth = 0.6;
  const col = shade(k.f.shop.theme.primary, 0.8);
  k.counter(u0, v0, u1, v0 + depth, { color: col, top: '#fdf0d5', register: false });
  k.counter(u0, v0 + depth, u0 + depth, v1, { color: col, top: '#fdf0d5', register: false });
  k.counter(u1 - depth, v0 + depth, u1, v1, { color: col, top: '#fdf0d5', register: false });
  for (let u = u0 + 0.4; u < u1 - 0.3; u += 0.6) {
    k.stool(u, v0 - 0.45, 0, 1, '#c1121f');
    k.cyl(u, v0 + 0.15, 1.0, 0.05, 0.12, k.pick(['#c1121f', '#ffd166', '#2b2d42']));
  }
  for (let v = v0 + 1.0; v < v1 - 0.3; v += 0.6) {
    k.stool(u0 - 0.45, v, 1, 0, '#c1121f');
    k.stool(u1 + 0.45, v, -1, 0, '#c1121f');
  }
  const ku = (u0 + u1) / 2;
  for (const du of [-1.2, -0.5]) k.cyl(ku + du, v1 - 0.8, 0, 0.25, 0.6, '#adb5bd');
  k.box(ku + 0.2, v1 - 1.4, ku + 1.4, v1 - 0.7, 0, 0.9, 'metal');
  for (let i = 0; i < 5; i++) k.box(ku + 0.3 + i * 0.22, v1 - 1.1, ku + 0.32 + i * 0.22, v1 - 1.08, 0.9, 1.3, 'metal');
  k.solid(ku - 1.5, v1 - 1.4, ku + 1.4, v1 - 0.5, 0.9);
  k.staff(ku, v0 + 1.4, 0, -1);
  backPanel(k, ku - 2.0, ku + 2.0, 1.6, 2.6, k.f.shop.theme.primary);
  menuCards(k, wb - 0.04);
  k.backFeature = true;
  // 侧墙 4 人桌
  for (const v of [4.0, 7.4, 10.8]) if (v + 1 < wb) tableSet(k, 1.6, v, 4, { axis: 'v', chair: '#c1121f', top: '#fdf0d5' });
  void D;
};

/** Tide Sushi（回转寿司连锁式）：后部厨房伸出一条“梳齿”传送带，两侧卡座（桌边热水龙头），靠墙一排柜台座，门内接待机 + 等位长凳 */
export const sushi: Template = (k) => {
  const { W, D } = k;
  entryClear(k);
  const wl = wallL(k);
  const wr = wallR(k);
  const kv = kitchen(k, 4.0, '#eae2b7', { pass: false });
  // 梳齿：从厨房伸到 v≈5 的传送带（0.25 宽，台面 0.8，上层快线 1.1）
  const cu = W / 2;
  const tv0 = 5.0;
  k.box(cu - 0.3, tv0, cu + 0.3, kv - 0.1, 0, 0.8, 'prop', '#eae2b7');
  k.box(cu - 0.15, tv0, cu + 0.15, kv - 0.1, 0.8, 0.82, 'metal');
  k.box(cu - 0.06, tv0, cu + 0.06, kv - 0.1, 0.82, 1.1, 'prop', '#c9c1a0');
  k.box(cu - 0.15, tv0, cu + 0.15, kv - 0.1, 1.1, 1.12, 'metal');
  k.solid(cu - 0.3, tv0, cu + 0.3, kv - 0.1, 1.12);
  for (let v = tv0 + 0.2; v < kv - 0.3; v += 0.35) k.cyl(cu + (k.rng() < 0.5 ? -0.08 : 0.08), v, 0.82, 0.075, 0.02, k.pick(['#e63946', '#f4a261', '#ffffff', '#2a9d8f', '#ffd166']));
  // 卡座：桌子垂直于传送带，两侧高背长凳（4 人）
  for (const s of [-1, 1]) {
    for (let v = tv0 + 0.1; v + 2.3 <= kv - 0.2; v += 2.5) {
      const a = cu + s * 0.3;
      const b = cu + s * 1.6;
      const [u0, u1] = [Math.min(a, b), Math.max(a, b)];
      k.table((u0 + u1) / 2, v + 1.15, u1 - u0, 0.7, { top: '#eae2b7', color: DARK_WOOD });
      k.sofa('u', u0, u1, v, 0, 1, '#003049');
      k.sofa('u', u0, u1, v + 2.3, 0, -1, '#003049');
      k.cyl(u0 + (s > 0 ? 0.15 : u1 - u0 - 0.15), v + 1.15, 0.74, 0.04, 0.2, '#adb5bd');
    }
  }
  // 靠墙一排柜台座（左墙），右墙前段接待机 + 等位长凳
  k.counter(wl, tv0, wl + 0.45, kv - 0.4, { color: '#eae2b7', register: false });
  stoolRow(k, 'v', tv0 + 0.3, kv - 0.7, wl + 0.85, -1, 0, 0.65, '#003049');
  k.box(wr - 0.6, 1.2, wr - 0.1, 1.6, 0, 1.4, 'prop', '#e9ecef');
  k.box(wr - 0.62, 1.25, wr - 0.6, 1.55, 1.0, 1.35, 'prop', '#2b2d42');
  k.solid(wr - 0.6, 1.2, wr - 0.1, 1.6, 1.4);
  k.bench('v', 2.0, 4.0, wr - 0.3, -1, 0, { color: '#003049' });
  k.staff(cu, kv + 0.6, 0, -1);
  for (let i = 0; i < 3; i++) k.card('atlas-food', 1, cu + (i - 1) * 1.6, wallB(k) - 0.02, 2.0, 0, -1, 1.0, 1.0);
  k.backFeature = true;
  void D;
};

/** Bistro Olive：门口菜单立牌、后墙发光的柴烧披萨炉 + 炉前吧台、侧墙卡座、另一侧酒瓶墙、红白格桌布 */
export const italian: Template = (k) => {
  const { W, D } = k;
  entryClear(k);
  const wb = wallB(k);
  const wl = wallL(k);
  const wr = wallR(k);
  k.box(k.f.door.u0 - 0.6, 0.6, k.f.door.u0 - 0.1, 0.65, 0, 1.4, 'prop', '#2b2d42');
  // 披萨炉：圆顶（几层圆柱叠），炉口发橙光
  const ou = W / 2;
  k.cyl(ou, wb - 1.0, 0, 0.85, 0.9, '#bc6c25');
  k.cyl(ou, wb - 1.0, 0.9, 0.8, 0.35, '#d4a373');
  k.cyl(ou, wb - 1.0, 1.25, 0.6, 0.25, '#d4a373');
  k.cyl(ou, wb - 1.0, 1.5, 0.35, 0.15, '#d4a373');
  k.box(ou - 0.3, wb - 1.86, ou + 0.3, wb - 1.8, 0.95, 1.3, 'prop', '#ff7b00');
  k.solid(ou - 0.85, wb - 1.85, ou + 0.85, wb - 0.15, 1.65);
  k.staff(ou + 1.3, wb - 1.4, 0, -1);
  backPanel(k, ou - 2.6, ou - 1.2, 1.6, 2.4, '#2b2d42');
  menuCards(k, wb - 0.04);
  // 炉前吧台 + 6 张吧凳
  k.counter(ou - 2.0, wb - 3.4, ou + 2.0, wb - 2.8, { color: '#606c38', top: '#fefae0', register: false });
  stoolRow(k, 'u', ou - 1.6, ou + 1.6, wb - 3.85, 0, 1, 0.64, '#606c38');
  k.backFeature = true;
  // 侧墙卡座（左），酒瓶墙（右）
  wallBooths(k, 'left', 2.6, wb - 4.4, '#bc6c25', '#ffffff');
  k.shelf('v', 2.0, wb - 3.0, wr, -1, { palette: ['#5c0f1b', '#2d6a4f', '#3d2b1f', '#e9c46a'], height: 2.2, levels: 6, depth: 0.3, item: { w: [0.08, 0.09], h: [0.26, 0.3] } });
  // 中区 2 人桌和 4 人桌（红白桌布）
  grid(wl + 3.8, wr - 1.6, 2.8, wb - 4.6, 2.6, 2.5, (u, v, i, j) => tableSet(k, u, v, (i + j) % 2 ? 4 : 2, { axis: 'v', chair: '#606c38', top: (i + j) % 2 ? '#e63946' : '#ffffff' }));
  void D;
};

/** Spice Route（CoCo 式）：一侧墙长柜台（客人面对开放盛饭区）、另一侧 4 人桌 + 半高隔板、后部厨房的大饭锅咖喱锅、墙上辣度表 */
export const curry: Template = (k) => {
  const { W, D } = k;
  entryClear(k);
  const wl = wallL(k);
  const wr = wallR(k);
  const kv = kitchen(k, 3.2, '#ffba08');
  for (const [du, r] of [
    [-1.6, 0.25],
    [-0.9, 0.3],
    [1.0, 0.3],
  ] as const) k.cyl(W / 2 + du, kv + 1.6, 0, r, 0.5, '#adb5bd');
  // 长柜台（右墙），店员在柜台和墙之间
  const cu = wr - 1.4;
  k.counter(cu - 0.3, 2.6, cu + 0.3, kv - 0.4, { color: '#e85d04', top: '#ffe8d6', register: false });
  stoolRow(k, 'v', 3.0, kv - 0.8, cu - 0.75, 1, 0, 0.65, '#e85d04');
  k.box(cu + 0.4, 2.6, wr, kv - 0.4, 0, 0.9, 'metal');
  k.solid(cu + 0.4, 2.6, wr, kv - 0.4, 0.9);
  // 4 人桌 + 半高隔板
  for (let v = 2.8; v + 1.6 < kv - 0.4; v += 2.6) {
    tableSet(k, wl + 1.6, v + 0.8, 4, { axis: 'v', chair: '#e85d04', top: '#ffe8d6' });
    k.box(wl + 0.2, v + 2.15, wl + 3.0, v + 2.2, 0, 1.3, 'prop', '#ffba08');
    k.cyl(wl + 1.6, v + 0.6, 0.74, 0.05, 0.08, '#c1121f');
  }
  // 辣度表：一排色带
  for (let i = 0; i < 10; i++) k.panel('v', 1.4 + i * 0.12, 1.5 + i * 0.12, wl, 1, 1.6, 2.4, ['#ffe066', '#ffd23f', '#ffb703', '#fb8500', '#f77f00', '#f3722c', '#e85d04', '#dc2f02', '#d00000', '#9d0208'][i]);
  menuCards(k, wallB(k) - 0.04);
  k.backFeature = true;
  void D;
};

/** Ember Grill（30×19）：领位台 + 等位长凳、前区酒吧（吧台 + 电视）、切肉台 + 熟成柜、后墙通长开放烤炉 + 排烟罩 + 厨师吧台、两侧深色皮卡座、中区桌 */
export const grill: Template = (k) => {
  const { W, D } = k;
  const door = k.f.door;
  entryClear(k, 3.0);
  const wl = wallL(k);
  const wr = wallR(k);
  const wb = wallB(k);
  // 领位台 + 等位长凳
  k.box(door.u0 + 0.3, 2.4, door.u0 + 1.0, 2.9, 0, 1.1, 'prop', '#3d2b1f');
  k.solid(door.u0 + 0.3, 2.4, door.u0 + 1.0, 2.9, 1.1);
  k.bench('u', door.u0 - 2.8, door.u0 - 0.6, 0.55, 0, 1, { color: '#6a040f' });
  // 前区左：酒吧（吧台 + 电视）
  k.counter(wl + 1.0, 3.6, wl + 5.0, 4.2, { color: '#3d2b1f', top: '#ddb892', register: false });
  stoolRow(k, 'u', wl + 1.4, wl + 4.6, 4.65, 0, -1, 0.65, '#6a040f');
  k.shelf('u', wl + 0.8, wl + 5.2, 0.2, 1, { palette: ['#5c0f1b', '#e9c46a', '#3d2b1f'], height: 2.0, levels: 4, depth: 0.3, item: { w: [0.08, 0.09], h: [0.26, 0.3] } });
  for (const u of [wl + 1.6, wl + 4.0]) k.screen('u', u, u + 1.0, 0.25, 1, 2.3, 2.9, '#577590');
  // 前区右：切肉台 + 玻璃熟成柜（暖光，挂着肉）
  k.counter(wr - 4.0, 3.4, wr - 2.0, 4.2, { color: '#3d2b1f', top: '#f8f9fa', register: false });
  k.box(wr - 1.3, 2.4, wr - 0.1, 3.2, 0, 2.0, 'prop', '#3d2b1f');
  k.box(wr - 1.32, 2.5, wr - 1.3, 3.1, 0.3, 1.9, 'glass');
  for (let i = 0; i < 3; i++) k.product(wr - 0.7, 2.6 + i * 0.22, 1.0, 0.3, 0.45, 0.15, false, '#9d0208');
  k.solid(wr - 1.3, 2.4, wr - 0.1, 3.2, 2.0);
  // 后墙：开放烤炉 + 排烟罩 + 厨师吧台
  const gu = W / 2;
  k.box(gu - 2.0, wb - 1.0, gu + 2.0, wb, 0, 0.9, 'metal');
  k.box(gu - 1.9, wb - 0.9, gu + 1.9, wb - 0.1, 0.9, 0.95, 'prop', '#ff7b00');
  k.box(gu - 2.0, wb - 1.2, gu + 2.0, wb, 2.2, 3.0, 'metal');
  k.solid(gu - 2.0, wb - 1.0, gu + 2.0, wb, 0.95);
  k.staff(gu, wb - 1.5, 0, -1);
  k.counter(gu - 2.4, wb - 2.6, gu + 2.4, wb - 2.1, { color: '#3d2b1f', top: '#ddb892', register: false });
  stoolRow(k, 'u', gu - 2.0, gu + 2.0, wb - 3.05, 0, 1, 0.66, '#6a040f');
  k.backFeature = true;
  // 两侧深色皮卡座
  wallBooths(k, 'left', 5.8, wb - 0.4, '#3d2b1f', '#ddb892');
  wallBooths(k, 'right', 5.0, wb - 0.4, '#3d2b1f', '#ddb892');
  // 中区 4 人桌和 2 人桌
  grid(wl + 4.0, wr - 4.0, 6.0, wb - 4.0, 3.0, 2.6, (u, v, i, j) => tableSet(k, u, v, (i + j) % 2 ? 2 : 4, { axis: 'v', chair: '#3d405b', top: '#ddb892' }));
  void D;
};

// ---------- 11. 美食广场 ----------

/**
 * Food Alley：沿后墙 7 个档口（门头照片菜单灯箱 + 柜台 + 托盘 + 排队带，侧边返却口），档口前 3 m 排队取餐通道；
 * 座位区 4 人桌 + 长桌 + 卡座，饮水站和回收站；中庭栏杆边一排观景吧台座（在商场公共区）。
 */
export const foodcourt: Template = (k) => {
  const { W, D } = k;
  entryClear(k, 3.0);
  const wb = wallB(k);
  const n = 7;
  const sw = (W - 1.0) / n;
  const sv = wb - 4.5;
  const colors = ['#e76f51', '#2a9d8f', '#e9c46a', '#f4a261', '#264653', '#8ab17d', '#d62828'];
  const signature = ['soup', 'griddle', 'warmer', 'soup', 'warmer', 'griddle', 'soup'];
  for (let i = 0; i < n; i++) {
    const u0 = 0.5 + i * sw + 0.3;
    const u1 = u0 + sw - 0.6;
    const col = colors[i % colors.length];
    k.counter(u0 + 0.6, sv, u1 - 0.6, sv + 0.6, { color: col, top: '#f8f9fa', register: true });
    for (let t = 0; t < 4; t++) k.product(u1 - 0.9, sv + 0.3, 1.0 + t * 0.03, 0.4, 0.025, 0.3, true, '#ced4da');
    for (let t = 0; t < 5; t++) k.cyl(u0 + 1.1, sv + 0.3, 1.0 + t * 0.03, 0.05, 0.025, '#2b2d42');
    // 档口后台
    k.box(u0, wb - 0.7, u1, wb, 0, 0.95, 'metal');
    k.solid(u0, wb - 0.7, u1, wb, 0.95);
    if (signature[i] === 'soup') for (const du of [0.6, 1.4]) k.cyl(u0 + du, wb - 0.35, 0.95, 0.22, 0.45, '#adb5bd');
    if (signature[i] === 'griddle') k.box(u0 + 0.4, wb - 0.65, u0 + 1.8, wb - 0.05, 0.95, 1.0, 'prop', '#2b2d42');
    if (signature[i] === 'warmer') k.box(u0 + 0.4, wb - 0.65, u0 + 1.8, wb - 0.05, 0.95, 1.5, 'glass');
    // 门头灯箱（照片菜单）
    backPanel(k, u0 + 0.3, u1 - 0.3, 2.4, 3.6, col);
    k.card('atlas-food', i % 6, (u0 + u1) / 2 - 1.2, wb - 0.045, 3.0, 0, -1, 1.0, 1.0);
    k.card('atlas-food', (i + 3) % 6, (u0 + u1) / 2 + 1.2, wb - 0.045, 3.0, 0, -1, 1.0, 1.0);
    // 档口之间的隔墙（柱子）、侧边返却口
    k.box(u0 - 0.3, sv, u0, wb, 0, 2.4, 'prop', '#e5e5e5');
    k.solid(u0 - 0.3, sv, u0, wb, 2.4);
    k.box(u0 + 0.05, sv, u0 + 0.6, sv + 0.6, 0, 0.95, 'metal');
    k.solid(u0 + 0.05, sv, u0 + 0.6, sv + 0.6, 0.95);
    // 排队带
    k.stanchions('v', sv - 2.0, sv - 0.4, u0 + 1.0, col);
  }
  k.box(W - 0.8, sv, W - 0.5, wb, 0, 2.4, 'prop', '#e5e5e5');
  const mid = Math.floor(n / 2);
  k.staff(0.5 + mid * sw + sw / 2, sv + 1.25, 0, -1);
  k.reserve(0.5, sv - 3.4, W - 0.5, sv - 2.1);
  k.backFeature = true;
  // 座位区：4 人桌按 2.4 × 2.6 网格，中间一条长桌，饮水站和回收站
  const seatV1 = sv - 4.6;
  grid(1.5, W - 1.5, 1.6, seatV1, 2.6, 2.5, (u, v, i) => {
    if (i % 7 === 3) return;
    tableSet(k, u, v, 4, { chair: ['#ffb703', '#fb8500', '#8ecae6'][i % 3], top: '#f1faee', color: '#adb5bd' });
  });
  for (const u of [W * 0.25, W * 0.75]) {
    k.box(u - 0.3, seatV1 + 0.5, u + 0.3, seatV1 + 1.0, 0, 1.4, 'prop', '#8ecae6');
    k.solid(u - 0.3, seatV1 + 0.5, u + 0.3, seatV1 + 1.0, 1.4);
    k.box(u + 0.8, seatV1 + 0.5, u + 2.3, seatV1 + 1.1, 0, 1.1, 'prop', '#495057');
    k.box(u + 0.8, seatV1 + 0.5, u + 2.3, seatV1 + 1.1, 1.1, 1.15, 'metal');
    k.solid(u + 0.8, seatV1 + 0.5, u + 2.3, seatV1 + 1.1, 1.15);
  }
  // 中庭栏杆边的观景吧台座（在美食广场门前的公共区，v < 0）
  const rail = -5.35;
  for (const [a0, a1] of [
    [W / 2 - 8.4, W / 2 - 1.4],
    [W / 2 + 1.4, W / 2 + 8.4],
  ]) {
    k.box(a0, rail - 0.45, a1, rail, 1.0, 1.05, 'prop', WOOD);
    k.box(a0, rail - 0.1, a1, rail, 0, 1.0, 'prop', '#e9e2d4');
    k.solid(a0, rail - 0.45, a1, rail, 1.05);
    stoolRow(k, 'u', a0 + 0.4, a1 - 0.3, rail + 0.45, 0, -1, 0.7, '#fb8500');
  }
  void D, void M;
};

// ---------- 19. 面包 / 甜品 / 熟食 ----------

/** Morning Crumb（日式自选面包店）：门内托盘夹子站、左墙阶梯面包台、中间平台、右墙冷柜 + 收银（逐个装袋）、后部玻璃后的烤箱 */
export const bakery: Template = (k) => {
  const { W, D } = k;
  const wl = wallL(k);
  const wr = wallR(k);
  const wb = wallB(k);
  entryClear(k, 2.0, 1.2);
  // 托盘和夹子站
  const tu = k.f.door.u0 + 0.1;
  k.box(tu - 0.25, 2.2, tu + 0.25, 2.6, 0, 0.9, 'prop', '#bc6c25');
  for (let i = 0; i < 6; i++) k.product(tu, 2.4, 0.9 + i * 0.02, 0.4, 0.015, 0.3, true, '#d6ccc2');
  k.cyl(tu + 0.15, 2.3, 0.9, 0.05, 0.2, '#adb5bd');
  k.solid(tu - 0.25, 2.2, tu + 0.25, 2.6, 0.9);
  // 左墙阶梯面包台（3 级），每盘一种面包，前面小名称卡
  for (const [v0, v1] of [
    [3.2, 7.2],
    [7.8, 11.8],
  ]) {
    for (let s = 0; s < 3; s++) {
      k.box(wl + s * 0.2, v0, wl + 0.6, v1, 0, 0.7 + s * 0.15, 'prop', '#d4a373');
      for (let v = v0 + 0.2; v < v1 - 0.2; v += 0.45) {
        k.product(wl + 0.5 - s * 0.2, v, 0.7 + s * 0.15, 0.18, 0.015, 0.38, false, '#8d6e63');
        for (let b = 0; b < 3; b++) k.cyl(wl + 0.5 - s * 0.2, v - 0.12 + b * 0.12, 0.715 + s * 0.15, 0.05, 0.05, k.pick(BREAD));
        if (s === 0) k.product(wl + 0.62, v, 0.7, 0.01, 0.06, 0.1, false, '#fff3b0');
      }
    }
    k.solid(wl, v0, wl + 0.6, v1, 1.0);
  }
  // 中间平台
  place(k, W / 2 + 0.4, 7.0, 0.9, 1.6, () => k.displayTable(W / 2 + 0.4, 7.0, 0.9, 1.6, { palette: BREAD, h: 0.85, color: '#e9c46a' }), 0.3);
  // 右墙：冷柜（三明治、奶油面包）+ 收银
  k.fridge('v', 3.0, 6.0, wr, -1, ['#fefae0', '#ffd166', '#90be6d']);
  cash(k, wr - 1.4, 9.4, { du: -1, dv: 0, w: 2.0, color: '#bc6c25' });
  // 后部：玻璃后的烤箱和面包推车
  const gv = wb - 2.6;
  k.box(wl, gv, wr, gv + 0.05, 0, 1.0, 'prop', '#bc6c25');
  k.box(wl, gv, wr, gv + 0.05, 1.0, 2.6, 'glass');
  k.solid(wl, gv, wr, gv + 0.06, 2.6);
  k.box(wl + 0.6, wb - 1.0, wl + 2.2, wb, 0, 1.8, 'metal');
  k.box(wl + 0.7, wb - 1.02, wl + 2.1, wb - 1.0, 0.4, 1.6, 'prop', '#2b2d42');
  k.box(wr - 1.4, gv + 0.8, wr - 0.8, gv + 1.3, 0, 1.7, 'metal');
  k.backFeature = true;
  void D;
};

/** Sweet Spot：横贯店宽的弧形冷藏蛋糕柜（店员在后）、柜后礼盒墙 + 收银、门边季节礼盒堆头 */
export const sweets: Template = (k) => {
  const { W, D } = k;
  const wl = wallL(k);
  const wr = wallR(k);
  entryClear(k, 2.0, 1.2);
  const cv = 2.4;
  k.box(wl, cv, wr - 0.95, cv + 0.9, 0, 0.8, 'prop', '#ff8fab');
  k.box(wl, cv, wr - 0.95, cv + 0.9, 0.8, 1.3, 'glass');
  k.solid(wl, cv, wr - 0.95, cv + 0.9, 1.3);
  for (let l = 0; l < 3; l++) for (let u = wl + 0.25; u < wr - 1.1; u += 0.32) {
    k.product(u, cv + 0.45, 0.8 + l * 0.16, 0.14, 0.08, 0.14, true, k.pick(['#fff0f3', '#ffd6a5', '#3d2b1f', '#ffafcc']));
    k.product(u, cv + 0.45, 0.88 + l * 0.16, 0.14, 0.03, 0.14, true, k.pick(['#ffffff', '#e63946', '#ffc8dd']));
  }
  k.staff(W / 2 - 0.5, cv + 1.5, 0, -1);
  k.shelf('u', wl, wr - 1.7, wallB(k), -1, { palette: PASTEL, height: 2.0, levels: 4, item: { w: [0.25, 0.25], h: [0.06, 0.12] } });
  k.counter(wr - 2.2, cv + 2.0, wr - 0.95, cv + 2.6, { color: '#ff8fab' });
  k.staffDoor(wr - 0.6);
  k.backFeature = true;
  place(k, k.f.door.u0 - 0.6, 1.2, 0.8, 0.8, () => k.displayTable(k.f.door.u0 - 0.6, 1.2, 0.8, 0.8, { palette: PASTEL, h: 0.6, stacks: true }), 0.1);
  void D;
};

/** Deli Garden：L 形熟食柜（冷菜沙拉一格格托盘 + 热炸物保温柜）、秤和标签机、后墙厨房出菜口、门边便当冷柜 */
export const deli: Template = (k) => {
  const { W, D } = k;
  const wl = wallL(k);
  const wr = wallR(k);
  entryClear(k, 2.0, 1.2);
  const cv = 2.4;
  const cu1 = wr - 2.4;
  k.box(wl + 0.6, cv, cu1, cv + 1.0, 0, 0.8, 'prop', '#90be6d');
  k.box(wl + 0.6, cv, cu1, cv + 1.0, 0.8, 1.3, 'glass');
  k.solid(wl + 0.6, cv, cu1, cv + 1.0, 1.3);
  for (let u = wl + 0.8; u < cu1 - 0.2; u += 0.36) for (const dv of [0.3, 0.7]) k.product(u, cv + dv, 0.8, 0.3, 0.05, 0.3, true, k.pick(['#90be6d', '#e76f51', '#f4a261', '#ffd166', '#a7c957', '#fefae0']));
  // 热柜（短边，垂直）
  k.box(cu1, cv, cu1 + 0.8, cv + 2.0, 0, 0.8, 'prop', '#606c38');
  k.box(cu1, cv, cu1 + 0.8, cv + 2.0, 0.8, 1.4, 'glass');
  for (let v = cv + 0.2; v < cv + 1.9; v += 0.25) k.product(cu1 + 0.4, v, 0.8, 0.5, 0.08, 0.2, false, '#bc6c25');
  k.solid(cu1, cv, cu1 + 0.8, cv + 2.0, 1.4);
  k.box(wl + 1.0, cv + 1.4, wl + 1.35, cv + 1.75, 0.9, 1.2, 'prop', '#e9ecef');
  k.box(wl + 0.6, cv + 1.3, cu1 - 0.2, cv + 1.9, 0, 0.9, 'metal');
  k.solid(wl + 0.6, cv + 1.3, cu1 - 0.2, cv + 1.9, 0.9);
  k.staff((wl + cu1) / 2, cv + 2.4, 0, -1);
  // 后墙厨房出菜口
  k.panel('u', W / 2 - 0.75, W / 2 + 0.75, wallB(k), -1, 1.0, 1.5, '#2b2d42');
  k.backFeature = true;
  // 门边便当冷柜
  k.fridge('v', 0.4, 1.9, wr, -1, ['#f4a261', '#ffffff', '#e9c46a', '#90be6d']);
  void D, void FRUIT;
};
