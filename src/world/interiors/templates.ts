import type { ShopCategory } from '../../data/layoutTypes.ts';
import { APPAREL, DEFAULT_PALETTE, DRINKS, type Kit, shade } from './kit.ts';

// 各类店铺的店内布局模板。局部坐标：u 沿店门那面墙（0..W），v 从门口往里（0..D），
// 墙在 u≈0 / u≈W / v≈D，门洞在 v=0 的 [door.u0, door.u1]。
// 参考日本、美国商场的常见做法：门口留出通道，收银台在中部侧面或靠里，
// 靠墙放高货架，中间放矮的展示台或中岛，越往里越高（从门口能一眼看到全店）。

type Template = (k: Kit) => void;

const M = 0.2; // 家具离墙的距离

const FRUIT = ['#e63946', '#f4a261', '#ffd166', '#90be6d', '#43aa8b', '#f94144', '#f8961e', '#a7c957'];
const PANTRY = ['#e76f51', '#f4a261', '#e9c46a', '#2a9d8f', '#264653', '#ffffff', '#8ecae6', '#bc4749', '#f2e8cf'];
const BREAD = ['#d4a373', '#bc6c25', '#e9c46a', '#dda15e', '#fefae0'];
const BOOKS = ['#6d597a', '#b56576', '#e56b6f', '#355070', '#eaac8b', '#2a9d8f', '#f2e8cf', '#264653', '#a8dadc'];
const TECH = ['#2b2d42', '#8d99ae', '#edf2f4', '#3a86ff', '#14213d', '#e5e5e5'];
const TOYS = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#ff9f1c', '#8338ec', '#3a86ff', '#fb5607'];
const PASTEL = ['#ffc8dd', '#ffafcc', '#bde0fe', '#a2d2ff', '#cdb4db', '#fdffb6', '#caffbf', '#ffd6a5'];
const SPORT = ['#f94144', '#f3722c', '#f9c74f', '#90be6d', '#43aa8b', '#577590', '#277da1', '#ffffff', '#1d3557'];
const COSMETIC = ['#ffafcc', '#ff8fab', '#fb6f92', '#ffe5ec', '#ffffff', '#cdb4db', '#e5989b'];

/** 餐厅菜单板上放哪几格美食图（美食图集 3×2：拉面、寿司、咖喱饭 / 汉堡薯条、意面、饺子） */
const FOOD_CELLS: Partial<Record<ShopCategory, number[]>> = {
  ramen: [0, 5],
  curry: [2],
  grill: [3],
  italian: [4],
};

// ---------- 通用部件 ----------

/** 收银台：沿 u 放在 (u, v)，店员站在柜台里面（更深处）面朝门口 */
function cash(k: Kit, u: number, v: number, w = 2.2, color?: string) {
  k.counter(u, v, u + w, v + 0.65, { color: color ?? shade(k.f.shop.theme.primary, 1.0), top: '#fbf8f2' });
  k.staff(u + w / 2, v + 1.2, 0, -1);
}

/** 沿左右两面墙和后墙放高货架（避开 v < vFrom 的门口区域） */
function wallShelves(k: Kit, o: { vFrom?: number; back?: boolean; left?: boolean; right?: boolean; height?: number; levels?: number; palette?: string[]; depth?: number; color?: string; item?: { w: [number, number]; h: [number, number] } } = {}) {
  const vFrom = o.vFrom ?? 1.2;
  const s = { height: o.height ?? 2.0, levels: o.levels ?? 5, palette: o.palette, depth: o.depth ?? 0.45, color: o.color, item: o.item };
  const back = o.back !== false;
  const end = back ? k.D - M - s.depth : k.D - M;
  if (o.left !== false) k.shelf('v', vFrom, end, M, 1, s);
  if (o.right !== false) k.shelf('v', vFrom, end, k.W - M, -1, s);
  if (back) k.shelf('u', M, k.W - M, k.D - M, -1, s);
}

/** 门口内侧两张展示台（“第一眼”的陈列） */
function frontTables(k: Kit, v: number, palette: string[], o: { w?: number; d?: number; h?: number; stacks?: boolean } = {}): [number, number][] {
  const mid = (k.f.door.u0 + k.f.door.u1) / 2;
  const w = o.w ?? 1.6;
  const gapHalf = 1.4;
  const centers: [number, number][] = [
    [mid - gapHalf - w / 2, v],
    [mid + gapHalf + w / 2, v],
  ];
  for (const [u, cv] of centers) k.displayTable(u, cv, w, o.d ?? 0.9, { palette, h: o.h ?? 0.8, stacks: o.stacks });
  return centers;
}

/** 店内休息用的沙发，靠右墙、面朝店中间 */
function restSofa(k: Kit, v0: number, len = 1.8, color = '#7d8597') {
  k.sofa('v', v0, v0 + len, k.W - M, -1, 0, color);
}

/** 试衣间：后墙角落一排小隔间 */
function fittingRooms(k: Kit, u0: number, n: number, curtain: string) {
  const d = 1.4;
  const v1 = k.D - M;
  const v0 = v1 - d;
  for (let i = 0; i < n; i++) {
    const a = u0 + i * 1.3;
    k.box(a, v0, a + 0.05, v1, 0, 2.3, 'prop', '#f1ece4');
    k.box(a + 0.05, v0, a + 1.25, v0 + 0.04, 0.25, 2.1, 'prop', curtain);
  }
  k.box(u0 + n * 1.3, v0, u0 + n * 1.3 + 0.05, v1, 0, 2.3, 'prop', '#f1ece4');
  k.box(u0, v0, u0 + n * 1.3 + 0.05, v1, 2.3, 2.36, 'prop', '#f1ece4');
  k.solid(u0, v0, u0 + n * 1.3 + 0.05, v1, 2.3);
}

/** 在矩形区域里按网格摆东西 */
function grid(u0: number, u1: number, v0: number, v1: number, su: number, sv: number, fn: (u: number, v: number, i: number, j: number) => void) {
  const nu = Math.max(1, Math.floor((u1 - u0) / su));
  const nv = Math.max(1, Math.floor((v1 - v0) / sv));
  const ou = u0 + (u1 - u0 - (nu - 1) * su) / 2;
  const ov = v0 + (v1 - v0 - (nv - 1) * sv) / 2;
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) fn(ou + i * su, ov + j * sv, i, j);
}

/** 墙上的菜单板 / 海报位（后墙上方） */
function backPanel(k: Kit, u0: number, u1: number, h0: number, h1: number, tint: string) {
  k.panel('u', u0, u1, k.D - M, -1, h0, h1, tint);
}

// ---------- 各类店铺 ----------

const supermarket: Template = (k) => {
  const { W, D } = k;
  const door = k.f.door;
  // 收银线：门的右侧一排收银通道
  const lanes = Math.min(6, Math.floor((W - door.u1 - 2) / 2.4));
  for (let i = 0; i < lanes; i++) {
    const u = door.u1 + 1.6 + i * 2.4;
    k.counter(u, 2.6, u + 0.7, 5.0, { color: '#2d6a4f', top: '#e9edc9', register: false });
    k.box(u, 4.55, u + 0.7, 4.95, 1.0, 1.1, 'prop', '#3d405b');
    k.box(u + 0.25, 4.7, u + 0.45, 4.8, 1.1, 1.45, 'prop', '#2b2d42');
    // 收银通道上方的编号灯
    k.box(u + 0.25, 4.6, u + 0.45, 4.9, 1.0, 1.9, 'metal');
    k.box(u + 0.1, 4.6, u + 0.6, 4.9, 1.9, 2.15, 'prop', '#ffd166');
  }
  if (lanes > 0) k.staff(door.u1 + 1.6 + 0.7 + 0.45, 4.2, -1, 0);
  // 生鲜：门的左侧，低矮的斜面果蔬台
  grid(1.5, door.u0 - 1.2, 3.0, 8.0, 3.4, 2.6, (u, v) => k.displayTable(u, v, 2.4, 1.2, { palette: FRUIT, h: 0.75, stacks: true }));
  // 左墙：面包和干货
  k.shelf('v', 1.0, 11.5, M, 1, { palette: BREAD, height: 1.6, levels: 4 });
  k.shelf('v', 12.5, D - 1.4, M, 1, { palette: PANTRY, height: 1.8 });
  // 后墙：冷藏柜（乳制品、肉、鱼）；右墙：饮料冷柜
  k.fridge('u', 1.2, W - 1.2, D - M, -1, ['#ffffff', '#f1faee', '#e63946', '#ffb4a2', '#a8dadc', '#ffd166']);
  k.fridge('v', 8.0, D - 1.4, W - M, -1, DRINKS);
  // 中间：一排排双面货架（通道约 2.2 m）
  const c0 = 7.5;
  for (let c = c0; c < W - 3.2; c += 3.4) k.gondola('v', 9.6, D - 3.6, c, { palette: PANTRY, height: 1.6 });
};

const electronics: Template = (k) => {
  const { W, D } = k;
  wallShelves(k, { palette: TECH, vFrom: 1.4, height: 2.1, item: { w: [0.18, 0.4], h: [0.12, 0.28] } });
  // 体验桌：浅木色长桌，上面平放设备
  const u0 = 2.2;
  const u1 = W - 2.2;
  grid(u0, u1, 3.0, D * 0.62, 3.6, 2.6, (u, v) => k.displayTable(u, v, 2.6, 1.0, { palette: TECH, h: 0.9, color: '#e8d5b7' }));
  cash(k, W / 2 - 1.3, D * 0.62 + 1.6);
  restSofa(k, D * 0.35, 1.8);
};

/** 游戏店：体验区（屏幕 + 凳子）+ 货架 */
const consoles: Template = (k) => {
  const { W, D } = k;
  wallShelves(k, { palette: [...TECH, '#ff6b35', '#06d6a0'], vFrom: 1.4, height: 2.1, right: false });
  // 右墙：一排试玩台
  for (let v = 2.0; v < D - 3; v += 1.6) {
    k.box(W - M - 0.5, v - 0.6, W - M, v + 0.6, 0, 0.8, 'prop', '#2b2d42');
    k.box(W - M - 0.12, v - 0.55, W - M - 0.06, v + 0.55, 0.95, 1.6, 'prop', '#1a1a2e');
    k.box(W - M - 0.13, v - 0.5, W - M - 0.12, v + 0.5, 1.0, 1.55, 'prop', TOYS[Math.floor(k.rng() * TOYS.length)]);
    k.solid(W - M - 0.5, v - 0.6, W - M, v + 0.6, 1.6);
    k.stool(W - M - 1.1, v, 1, 0, '#ff6b35');
  }
  grid(2.5, W - 4, 3.0, D * 0.6, 3.4, 2.6, (u, v) => k.gondola('u', u - 1.2, u + 1.2, v, { palette: [...TECH, '#ff6b35'], height: 1.3, levels: 3 }));
  cash(k, W * 0.35, D * 0.6 + 1.6, 2.2, '#1a1a2e');
};

/** 玩具、积木、潮玩、周边 */
const toys: Template = (k) => {
  const { W, D } = k;
  wallShelves(k, { palette: TOYS, height: 2.1, levels: 5 });
  frontTables(k, 2.6, TOYS, { stacks: true });
  grid(2.4, W - 2.4, 5.0, D * 0.7, 3.2, 2.8, (u, v) => k.gondola('u', u - 1.1, u + 1.1, v, { palette: TOYS, height: 1.35, levels: 3 }));
  cash(k, W - 4.2, D * 0.72 + 0.8);
};

const bricks: Template = (k) => {
  const { W, D } = k;
  wallShelves(k, { palette: TOYS, height: 2.1, levels: 5 });
  // 门口展示台：立着的积木盒，盒面朝门口（积木盒图集 2×2）
  for (const [tu, tv] of frontTables(k, 2.6, [])) {
    for (let i = 0; i < 3; i++) {
      const u = tu - 0.5 + i * 0.5;
      const hh = k.range(0.32, 0.42);
      k.product(u, tv, 0.8, 0.44, hh, 0.12, true, k.pick(TOYS));
      k.card('atlas-brickboxes', (i + Math.floor(tu)) % 4, u, tv - 0.061, 0.8 + hh / 2, 0, -1, 0.42, hh - 0.02);
    }
  }
  grid(2.4, W - 2.4, 5.0, D * 0.7, 3.2, 2.8, (u, v) => k.gondola('u', u - 1.1, u + 1.1, v, { palette: TOYS, height: 1.35, levels: 3 }));
  cash(k, W - 4.2, D * 0.72 + 0.8);
  // 门口的大积木雕塑
  const mid = (k.f.door.u0 + k.f.door.u1) / 2;
  let h = 0;
  for (let i = 0; i < 7; i++) {
    const s = 0.9 - i * 0.08;
    const col = TOYS[i % TOYS.length];
    k.box(mid - s / 2, 4.6 - s / 2, mid + s / 2, 4.6 + s / 2, h, h + 0.32, 'prop', col);
    h += 0.32;
  }
  k.solid(mid - 0.45, 4.15, mid + 0.45, 5.05, h);
  // 拼搭桌 + 凳子
  k.table(2.6, D * 0.8, 1.6, 1.0, { h: 0.6, top: '#ffd166', color: '#e63946' });
  for (const [u, v, du, dv] of [
    [2.6, D * 0.8 - 0.75, 0, 1],
    [2.6, D * 0.8 + 0.75, 0, -1],
    [1.5, D * 0.8, 1, 0],
  ] as const)
    k.chair(u, v, du, dv, { seatH: 0.36, color: '#118ab2', w: 0.36 });
  void W;
};

const blindbox: Template = (k) => {
  const { W, D } = k;
  // 墙上一格一格的盒子（大小统一）
  wallShelves(k, { palette: PASTEL, height: 2.2, levels: 7, item: { w: [0.16, 0.16], h: [0.2, 0.2] } });
  // 中间玻璃展示柜（限定款）
  grid(2.5, W - 2.5, 3.0, D * 0.65, 3.0, 2.6, (u, v) => {
    k.box(u - 0.5, v - 0.5, u + 0.5, v + 0.5, 0, 0.9, 'prop', '#ffffff');
    k.box(u - 0.5, v - 0.5, u + 0.5, v + 0.5, 0.9, 1.6, 'glass');
    k.box(u - 0.5, v - 0.5, u + 0.5, v + 0.5, 1.6, 1.64, 'prop', '#ffffff');
    k.solid(u - 0.5, v - 0.5, u + 0.5, v + 0.5, 1.64);
    for (let i = 0; i < 3; i++) {
      k.product(u - 0.28 + i * 0.28, v, 0.9, 0.24, 0.02, 0.2, true, '#ffffff');
      k.card('atlas-blindbox', Math.floor(k.rng() * 9), u - 0.28 + i * 0.28, v - 0.05, 1.08, 0, -1, 0.22, 0.22);
    }
  });
  cash(k, W / 2 - 1.1, D * 0.65 + 1.4, 2.2, '#8e6cef');
};

const capsuleToys: Template = (k) => {
  const { W, D } = k;
  // 一排排扭蛋机：两台叠放、背靠背
  const machine = (u: number, v: number, face: 1 | -1) => {
    const col = k.pick(TOYS);
    for (let level = 0; level < 2; level++) {
      const h0 = level * 0.95;
      k.box(u - 0.27, v - 0.25, u + 0.27, v + 0.25, h0, h0 + 0.5, 'prop', col);
      k.box(u - 0.25, v - 0.23, u + 0.25, v + 0.23, h0 + 0.5, h0 + 0.92, 'glass');
      k.box(u - 0.27, v - 0.25, u + 0.27, v + 0.25, h0 + 0.92, h0 + 0.95, 'prop', col);
      for (let i = 0; i < 4; i++) k.product(u - 0.12 + (i % 2) * 0.24, v - 0.05 + face * 0.02, h0 + 0.52 + Math.floor(i / 2) * 0.12, 0.1, 0.1, 0.1, true, k.pick(PASTEL));
      // 扭蛋机正面的展示卡（机器沿 v 排，正面朝 ±u）
      k.card('atlas-blindbox', Math.floor(k.rng() * 9), u + face * 0.271, v, h0 + 0.26, face, 0, 0.36, 0.36);
    }
  };
  const rowV0 = 2.4;
  const rowV1 = D - 1.4;
  for (let v = rowV0; v < rowV1; v += 0.58) {
    machine(M + 0.27, v, 1);
    machine(k.W - M - 0.27, v, -1);
  }
  k.solid(M, rowV0 - 0.3, M + 0.55, rowV1, 1.9);
  k.solid(k.W - M - 0.55, rowV0 - 0.3, k.W - M, rowV1, 1.9);
  if (W >= 6) {
    const c = W / 2;
    for (let v = 5.0; v < rowV1 - 1.5; v += 0.58) {
      machine(c - 0.27, v, -1);
      machine(c + 0.27, v, 1);
    }
    k.solid(c - 0.55, 4.7, c + 0.55, rowV1 - 1.5, 1.9);
  }
};

const cards: Template = (k) => {
  const { W, D } = k;
  wallShelves(k, { palette: TOYS, height: 2.0, right: false, item: { w: [0.08, 0.12], h: [0.14, 0.18] } });
  // 卡牌玻璃柜
  const doorMid = (k.f.door.u0 + k.f.door.u1) / 2;
  for (let u = 2.0; u < W - 3; u += 2.4) {
    if (Math.abs(u - doorMid) < 1.9) continue;
    k.box(u - 1, 2.2, u + 1, 2.9, 0, 0.95, 'prop', '#386641');
    k.box(u - 1, 2.2, u + 1, 2.9, 0.95, 1.05, 'glass');
    k.solid(u - 1, 2.2, u + 1, 2.9, 1.05);
    for (let i = 0; i < 8; i++) k.product(u - 0.85 + i * 0.24, 2.55, 0.95, 0.12, 0.01, 0.17, true, k.pick(TOYS));
  }
  // 对战桌
  grid(2.0, W - 2.0, D * 0.45, D - 2.2, 3.0, 2.4, (u, v) => k.tableSet(u, v, 4, { top: '#2d6a4f', color: '#3a3a3a', chair: '#f2e8cf' }));
  cash(k, W - 3.4, 4.0, 2.2, '#386641');
};

const plush: Template = (k) => {
  const { W, D } = k;
  wallShelves(k, { palette: PASTEL, height: 2.0, levels: 4, item: { w: [0.25, 0.4], h: [0.22, 0.32] } });
  grid(2.5, W - 2.5, 3.0, D * 0.7, 3.0, 2.6, (u, v) => k.displayTable(u, v, 1.6, 1.2, { palette: PASTEL, h: 0.55, stacks: true, color: '#ffe5ec' }));
  cash(k, W - 3.8, D * 0.72 + 0.8, 2.2, '#ffafcc');
  restSofa(k, D * 0.3, 1.6, '#cdb4db');
};

/** 服装店：前面平台桌，中间挂杆，两侧墙面层板，后面试衣间和收银 */
const apparel =
  (palette: string[], o: { sofa?: string; curtain?: string } = {}): Template =>
  (k) => {
    const { W, D } = k;
    k.shelf('v', 1.4, D - 1.8, M, 1, { palette, height: 2.1, levels: 4, item: { w: [0.28, 0.36], h: [0.1, 0.18] } });
    k.rack('v', 1.6, D - 2.2, W - M - 0.4, { palette });
    frontTables(k, 2.6, palette, { stacks: true });
    const rackU0 = 2.6;
    const rackU1 = W - 2.6;
    for (let v = 5.0; v < D - 4.2; v += 2.0) k.rack('u', rackU0, Math.max(rackU0 + 1.2, (rackU0 + rackU1) / 2 - 0.7), v, { palette });
    for (let v = 5.0; v < D - 4.2; v += 2.0) k.rack('u', Math.min(rackU1 - 1.2, (rackU0 + rackU1) / 2 + 0.7), rackU1, v, { palette });
    fittingRooms(k, 1.0, Math.min(3, Math.floor((W - 6) / 1.3)), o.curtain ?? shade(k.f.shop.theme.primary, 1.1));
    cash(k, W - 4.6, D - 3.6);
    k.sofa('u', W / 2 - 0.9, W / 2 + 0.9, D - M - 1.6, 0, -1, o.sofa ?? '#9a8c98');
  };

const shoes: Template = (k) => {
  const { W, D } = k;
  wallShelves(k, { palette: APPAREL, height: 2.1, levels: 6, depth: 0.35, item: { w: [0.26, 0.3], h: [0.1, 0.12] } });
  frontTables(k, 2.6, APPAREL, { h: 0.6 });
  // 试穿凳：中间两排背靠背的矮凳
  for (const v of [D * 0.45, D * 0.65]) {
    k.sofa('u', W / 2 - 1.5, W / 2 + 1.5, v, 0, -1, '#e0aaff', 0.42);
  }
  cash(k, W - 4.2, D - 3.4);
};

const eyewear: Template = (k) => {
  const { W, D } = k;
  wallShelves(k, { palette: TECH, height: 1.9, levels: 7, depth: 0.3, item: { w: [0.14, 0.16], h: [0.05, 0.06] } });
  // 试戴桌：桌上镜子 + 两把椅子
  grid(2.2, W - 2.2, 3.0, D - 4.5, 3.4, 3.0, (u, v) => {
    k.table(u, v, 1.2, 0.7, { top: '#f1faee', color: '#1d3557' });
    k.box(u - 0.15, v - 0.05, u + 0.15, v + 0.05, 0.74, 1.1, 'prop', '#a8dadc');
    k.chair(u, v - 0.65, 0, 1, { color: '#1d3557' });
  });
  cash(k, W / 2 - 1.1, D - 3.2, 2.2, '#1d3557');
};

const cosmetics: Template = (k) => {
  const { W, D } = k;
  wallShelves(k, { palette: COSMETIC, height: 2.0, levels: 6, depth: 0.3, item: { w: [0.05, 0.09], h: [0.08, 0.16] } });
  // 试用台（中岛）+ 化妆凳
  grid(2.6, W - 2.6, 3.0, D - 4, 4.0, 3.2, (u, v) => {
    k.displayTable(u, v, 2.4, 1.0, { palette: COSMETIC, h: 0.95, color: '#ffffff' });
    k.stool(u - 0.6, v + 1.0, 0, -1, '#ff99c8');
  });
  cash(k, W - 4.0, D - 3.2, 2.2, '#ff99c8');
};

const bags: Template = (k) => {
  const { W, D } = k;
  wallShelves(k, { palette: APPAREL, height: 2.1, levels: 4, item: { w: [0.35, 0.45], h: [0.25, 0.32] } });
  grid(2.6, W - 2.6, 3.0, D - 4, 3.6, 3.0, (u, v) => k.displayTable(u, v, 1.8, 1.0, { palette: APPAREL, h: 0.8, stacks: true, color: '#e9dcc9' }));
  cash(k, W - 4.0, D - 3.2);
  restSofa(k, D * 0.4, 1.6);
};

const accessories: Template = (k) => {
  const { W, D } = k;
  wallShelves(k, { palette: COSMETIC.concat(APPAREL), height: 1.9, levels: 6, depth: 0.3, item: { w: [0.06, 0.12], h: [0.04, 0.1] } });
  grid(2.6, W - 2.6, 3.0, D - 4, 3.6, 3.0, (u, v) => {
    k.box(u - 0.8, v - 0.45, u + 0.8, v + 0.45, 0, 0.9, 'prop', '#fff3e0');
    k.box(u - 0.8, v - 0.45, u + 0.8, v + 0.45, 0.9, 1.0, 'glass');
    k.solid(u - 0.8, v - 0.45, u + 0.8, v + 0.45, 1.0);
    for (let i = 0; i < 6; i++) k.product(u - 0.6 + i * 0.24, v, 0.9, 0.1, 0.03, 0.1, true, k.pick(COSMETIC));
  });
  cash(k, W - 4.0, D - 3.2, 2.2, '#e76f51');
};

const books: Template = (k) => {
  const { W, D } = k;
  const spines = { palette: BOOKS, item: { w: [0.03, 0.06] as [number, number], h: [0.18, 0.28] as [number, number] } };
  wallShelves(k, { ...spines, height: 2.2, levels: 6, depth: 0.32, color: '#8b6f55' });
  // 门口的平台：平放的新书，封面朝上（书封图集 4×4）
  for (const [tu, tv] of frontTables(k, 2.6, [], { w: 1.8 })) {
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 2; j++) {
        const u = tu - 0.66 + i * 0.44;
        const v = tv - 0.2 + j * 0.4;
        const th = k.range(0.04, 0.12);
        k.product(u, v, 0.8, 0.3, th, 0.36, true, k.pick(BOOKS));
        k.card('atlas-books', Math.floor(k.rng() * 16), u, v, 0.8 + th, 0, -1, 0.28, 0.34, true);
      }
  }
  // 后半部分：一排排书架（沿 v）
  const vA = Math.max(5.0, D * 0.4);
  for (let c = 3.0; c < W * 0.62; c += 2.6) k.gondola('v', vA, D - 2.0, c, { ...spines, height: 1.6, levels: 5, depth: 0.3, color: '#8b6f55' });
  // 阅读角：两张沙发对着一张小茶几
  const ru = W * 0.8;
  const rv = D * 0.6;
  k.sofa('u', ru - 1.0, ru + 1.0, rv - 1.3, 0, 1, '#a98467');
  k.sofa('u', ru - 1.0, ru + 1.0, rv + 1.3, 0, -1, '#a98467');
  k.table(ru, rv, 1.0, 0.6, { h: 0.45, top: '#6b4f3a' });
  cash(k, W * 0.68, 3.4, 2.2, '#6b4f3a');
};

const stationery: Template = (k) => {
  const { W, D } = k;
  wallShelves(k, { palette: [...PASTEL, '#ef8354', '#2d3142'], height: 2.0, levels: 6, depth: 0.35, item: { w: [0.06, 0.18], h: [0.08, 0.2] } });
  grid(2.4, W - 2.4, 3.0, D * 0.62, 3.2, 2.4, (u, v) => k.gondola('u', u - 1.1, u + 1.1, v, { palette: [...PASTEL, '#ef8354'], height: 1.25, levels: 3, depth: 0.35 }));
  // 试写台 + 凳子
  const tv = D * 0.62 + 1.8;
  k.table(3.0, tv, 2.0, 0.7, { top: '#fdf0d5', color: '#ef8354', h: 0.9 });
  for (const du of [-0.6, 0, 0.6]) k.stool(3.0 + du, tv + 0.65, 0, -1, '#ef8354');
  cash(k, W - 4.2, tv - 0.3, 2.2, '#ef8354');
};

/** 咖啡店、甜品、饮品：后墙吧台 + 菜单板，前面桌椅，靠墙沙发卡座 */
const cafe =
  (o: { counter?: string; chair?: string; top?: string; pastry?: string[]; sofa?: string } = {}): Template =>
  (k) => {
    const { W, D } = k;
    const primary = k.f.shop.theme.primary;
    const cu0 = Math.max(1.0, W * 0.25);
    const cu1 = Math.min(W - 1.0, W * 0.75 + 0.5);
    const cv = D - 2.6;
    k.counter(cu0, cv, cu1, cv + 0.7, { color: o.counter ?? shade(primary, 0.9), top: '#fbf8f2', register: true });
    // 甜点柜
    k.box(cu0 + 0.2, cv - 0.02, cu0 + 1.6, cv + 0.6, 1.0, 1.35, 'glass');
    for (let i = 0; i < 5; i++) k.product(cu0 + 0.35 + i * 0.26, cv + 0.3, 1.0, 0.16, 0.08, 0.16, true, k.pick(o.pastry ?? BREAD));
    // 咖啡机
    k.box(cu1 - 1.2, cv + 0.2, cu1 - 0.5, cv + 0.6, 1.0, 1.45, 'metal');
    k.staff((cu0 + cu1) / 2, cv + 1.3, 0, -1);
    // 后墙柜子 + 菜单板
    k.box(cu0, D - M - 0.5, cu1, D - M, 0, 0.95, 'prop', shade(primary, 0.75));
    k.solid(cu0, D - M - 0.5, cu1, D - M, 0.95);
    backPanel(k, cu0 + 0.3, cu1 - 0.3, 2.0, 2.9, '#2d3142');
    // 桌椅区
    const v1 = cv - 1.6;
    if (v1 > 3.4) grid(1.6, W - 2.6, 3.0, v1, 3.0, 2.8, (u, v, i, j) => k.tableSet(u, v, (i + j) % 2 ? 4 : 2, { axis: 'v', chair: o.chair ?? '#c8553d', top: o.top ?? '#e8d5b7' }));
    // 右墙卡座
    if (D > 7) k.sofa('v', 1.4, Math.min(v1 + 0.6, D - 4), W - M, -1, 0, o.sofa ?? '#7fa99b');
  };

/** 小饮品店（8 m 宽以内）：柜台 + 吧台凳 */
const kiosk =
  (palette: string[], counter?: string): Template =>
  (k) => {
    const { W, D } = k;
    const cv = Math.min(D - 2.4, 6);
    k.counter(0.8, cv, W - 0.8, cv + 0.7, { color: counter ?? k.f.shop.theme.primary, top: '#fbf8f2' });
    k.staff(W / 2, cv + 1.3, 0, -1);
    backPanel(k, 1.0, W - 1.0, 2.0, 2.9, '#2d3142');
    k.shelf('u', 1.0, W - 1.0, D - M, -1, { palette, height: 1.5, levels: 3, depth: 0.35 });
    // 靠左墙的窄吧台 + 凳子
    k.box(M, 1.4, M + 0.4, cv - 1.2, 1.0, 1.05, 'prop', '#e8d5b7');
    k.solid(M, 1.4, M + 0.4, cv - 1.2, 1.05);
    for (let v = 1.9; v < cv - 1.4; v += 0.8) k.stool(M + 0.75, v, -1, 0);
  };

const bakery: Template = (k) => {
  const { W, D } = k;
  // 面包台（取盘自选）+ 墙边层架
  k.shelf('v', 1.2, D - 3, M, 1, { palette: BREAD, height: 1.6, levels: 4, color: '#d4a373' });
  grid(2.4, W - 1.5, 2.6, D - 4.2, 2.4, 2.4, (u, v) => k.displayTable(u, v, 1.4, 1.0, { palette: BREAD, h: 0.85, color: '#e9c46a' }));
  k.counter(1.0, D - 2.6, W - 1.0, D - 1.95, { color: '#bc6c25' });
  k.staff(W / 2, D - 1.3, 0, -1);
};

const foodcourt: Template = (k) => {
  const { W, D } = k;
  // 后面一排档口
  const n = Math.max(3, Math.floor((W - 2) / 8));
  const sw = (W - 2) / n;
  const sv = D - 3.6;
  const colors = ['#e76f51', '#2a9d8f', '#e9c46a', '#f4a261', '#264653', '#8ab17d', '#d62828'];
  for (let i = 0; i < n; i++) {
    const u0 = 1 + i * sw + 0.2;
    const u1 = u0 + sw - 0.4;
    const col = colors[i % colors.length];
    k.counter(u0 + 0.4, sv, u1 - 0.4, sv + 0.7, { color: col, top: '#f8f9fa', register: false });
    k.box(u0, D - M - 0.6, u1, D - M, 0, 0.95, 'metal');
    k.solid(u0, D - M - 0.6, u1, D - M, 0.95);
    backPanel(k, u0 + 0.4, u1 - 0.4, 2.4, 3.7, col);
    k.card('atlas-food', i % 6, (u0 + u1) / 2, D - M - 0.045, 3.05, 0, -1, 1.15, 1.15);
    // 档口隔板
    k.box(u0 - 0.2, sv, u0 - 0.1, D - M, 0, 2.4, 'prop', '#e5e5e5');
    k.solid(u0 - 0.2, sv, u0 - 0.1, D - M, 2.4);
    for (let j = 0; j < 4; j++) k.product(u0 + 0.8 + j * 0.5, sv + 0.35, 1.0, 0.3, 0.06, 0.3, true, k.pick(['#f4a261', '#e9c46a', '#e76f51', '#90be6d']));
  }
  k.box(W - 1.2, sv, W - 1.1, D - M, 0, 2.4, 'prop', '#e5e5e5');
  // 中间档口的大厨
  const mid = Math.floor(n / 2);
  k.staff(1 + mid * sw + sw / 2, sv + 1.25, 0, -1);
  // 座位区：四人桌 + 中间一排长桌
  grid(2.0, W - 2.0, 2.0, sv - 1.8, 2.8, 2.3, (u, v, i, j) => {
    if (j === 1 && i % 4 === 1) return;
    k.tableSet(u, v, 4, { chair: ['#ffb703', '#fb8500', '#8ecae6'][(i + j) % 3], top: '#f1faee', color: '#adb5bd' });
  });
};

const restaurant =
  (o: { chair?: string; top?: string; booth?: string; bar?: boolean } = {}): Template =>
  (k) => {
    const { W, D } = k;
    const primary = k.f.shop.theme.primary;
    // 后厨出餐口
    k.counter(1.0, D - 2.8, W - 1.0, D - 2.15, { color: shade(primary, 0.85), register: false });
    k.box(1.0, D - M - 0.6, W - 1.0, D - M, 0, 0.95, 'metal');
    k.solid(1.0, D - M - 0.6, W - 1.0, D - M, 0.95);
    backPanel(k, 1.5, W - 1.5, 1.8, 3.0, shade(primary, 1.2));
    const menu = FOOD_CELLS[k.f.shop.category] ?? [];
    menu.forEach((cell, i) => k.card('atlas-food', cell, W / 2 + (i - (menu.length - 1) / 2) * 1.3, D - M - 0.045, 2.4, 0, -1, 1.0, 1.0));
    k.staff(W / 2, D - 1.6, 0, -1);
    if (o.bar) for (let u = 1.6; u < W - 1.2; u += 0.75) k.stool(u, D - 3.35, 0, 1, o.chair ?? '#3d405b');
    // 卡座（左墙）：沙发 + 桌子
    const v1 = D - 4.2;
    for (let v = 1.6; v < v1 - 1.2; v += 2.4) {
      k.sofa('v', v - 0.9, v + 0.9, M, 1, 0, o.booth ?? shade(primary, 0.9));
      k.table(M + 1.2, v, 0.7, 1.4, { top: o.top ?? '#e8d5b7' });
    }
    grid(3.2, W - 1.6, 2.8, v1, 3.0, 2.8, (u, v, i, j) => k.tableSet(u, v, (i + j) % 2 ? 4 : 2, { axis: 'v', chair: o.chair, top: o.top }));
  };

const sushi: Template = (k) => {
  const { W, D } = k;
  for (let i = 0; i < 3; i++) k.card('atlas-food', 1, W / 2 + (i - 1) * 1.6, D - M - 0.02, 2.5, 0, -1, 1.1, 0.7);
  // 回转寿司：一圈吧台，里面是师傅，外面一圈凳子
  const u0 = 2.4;
  const u1 = W - 2.4;
  const v0 = 4.0;
  const v1 = D - 3.4;
  const ring = 0.5;
  k.box(u0, v0, u1, v0 + ring, 0, 0.95, 'prop', '#eae2b7');
  k.box(u0, v1 - ring, u1, v1, 0, 0.95, 'prop', '#eae2b7');
  k.box(u0, v0, u0 + ring, v1, 0, 0.95, 'prop', '#eae2b7');
  k.box(u1 - ring, v0, u1, v1, 0, 0.95, 'prop', '#eae2b7');
  k.solid(u0, v0, u1, v0 + ring, 0.95);
  k.solid(u0, v1 - ring, u1, v1, 0.95);
  k.solid(u0, v0, u0 + ring, v1, 0.95);
  k.solid(u1 - ring, v0, u1, v1, 0.95);
  // 传送带上的盘子
  for (let u = u0 + 0.3; u < u1 - 0.3; u += 0.45) {
    k.product(u, v0 + 0.25, 0.95, 0.2, 0.05, 0.2, true, k.pick(['#e63946', '#f4a261', '#ffffff', '#2a9d8f']));
    k.product(u, v1 - 0.25, 0.95, 0.2, 0.05, 0.2, true, k.pick(['#e63946', '#f4a261', '#ffffff', '#2a9d8f']));
  }
  for (let u = u0 + 0.4; u < u1 - 0.3; u += 0.7) {
    k.stool(u, v0 - 0.45, 0, 1, '#003049');
    k.stool(u, v1 + 0.45, 0, -1, '#003049');
  }
  k.staff((u0 + u1) / 2, (v0 + v1) / 2, 0, -1);
  // 后墙卡座
  for (let u = 2.0; u < W - 2.0; u += 2.6) {
    k.sofa('u', u - 0.8, u + 0.8, D - M, 0, -1, '#003049');
    k.table(u, D - M - 1.3, 1.4, 0.7, { top: '#eae2b7' });
  }
};

const arcade: Template = (k) => {
  const { W, D } = k;
  // 一排排街机（带屏幕和凳子）
  const aisle0 = k.f.door.u0 + 1.0;
  const aisle1 = k.f.door.u1 - 1.0;
  for (let v = 4.5; v < D - 3; v += 3.0) {
    for (let u = 2.0; u < W - 8; u += 1.0) {
      if (u + 0.4 > aisle0 && u - 0.4 < aisle1) continue;
      const col = k.pick(['#7209b7', '#4cc9f0', '#f72585', '#3a0ca3', '#ffbe0b']);
      k.box(u - 0.4, v, u + 0.4, v + 0.8, 0, 1.8, 'prop', col);
      k.box(u - 0.32, v - 0.01, u + 0.32, v, 1.05, 1.55, 'prop', '#1b263b');
      k.box(u - 0.4, v - 0.35, u + 0.4, v, 0.85, 0.95, 'prop', shade(col, 0.8));
      k.solid(u - 0.4, v - 0.35, u + 0.4, v + 0.8, 1.8);
      k.stool(u, v - 0.85, 0, 1, '#2b2d42');
    }
  }
  // 门口的抓娃娃机
  for (let u = W - 7; u < W - 1.5; u += 1.2) {
    k.box(u - 0.5, 1.6, u + 0.5, 2.6, 0, 0.8, 'prop', '#f72585');
    k.box(u - 0.5, 1.6, u + 0.5, 2.6, 0.8, 1.8, 'glass');
    k.box(u - 0.5, 1.6, u + 0.5, 2.6, 1.8, 1.95, 'prop', '#f72585');
    k.solid(u - 0.5, 1.6, u + 0.5, 2.6, 1.95);
    for (let i = 0; i < 5; i++) k.product(u - 0.3 + (i % 3) * 0.3, 2.1 + (i > 2 ? 0.2 : -0.1), 0.8, 0.18, 0.18, 0.18, true, k.pick(PASTEL));
  }
  // 兑奖柜台
  k.counter(W - 7, D - 3.2, W - 1.5, D - 2.5, { color: '#7209b7' });
  k.shelf('u', W - 7, W - 1.5, D - M, -1, { palette: PASTEL, height: 2.0, levels: 4 });
  k.staff(W - 4.25, D - 1.8, 0, -1);
};

const vr: Template = (k) => {
  const { W, D } = k;
  // 体验区：四个方形软垫场地，四周矮护栏
  grid(2.0, W - 6, 4.2, D - 1.0, 4.4, 4.6, (u, v) => {
    if (u + 1.7 > k.f.door.u0 + 0.6 && u - 1.7 < k.f.door.u1 - 0.6 && v < 6) return;
    k.box(u - 1.6, v - 1.6, u + 1.6, v + 1.6, 0, 0.02, 'prop', '#90e0ef');
    for (const [a0, b0, a1, b1] of [
      [u - 1.7, v - 1.7, u + 1.7, v - 1.6],
      [u - 1.7, v + 1.6, u + 1.7, v + 1.7],
      [u - 1.7, v - 1.6, u - 1.6, v + 1.6],
      [u + 1.6, v - 1.6, u + 1.7, v - 0.4],
      [u + 1.6, v + 0.4, u + 1.7, v + 1.6],
    ]) {
      k.box(a0, b0, a1, b1, 0, 0.7, 'prop', '#48cae4');
      k.solid(a0, b0, a1, b1, 0.7);
    }
  });
  k.counter(W - 4.8, 2.4, W - 1.2, 3.1, { color: '#00b4d8' });
  k.staff(W - 3.0, 3.7, 0, -1);
  k.sofa('v', 5, Math.min(D - 1.5, 8), W - M, -1, 0, '#0077b6');
};

const sports =
  (palette: string[]): Template =>
  (k) => {
    const { W, D } = k;
    wallShelves(k, { palette, height: 2.2, levels: 6, depth: 0.35, item: { w: [0.26, 0.32], h: [0.1, 0.14] } });
    frontTables(k, 2.6, palette, { stacks: true });
    const half = W / 2;
    for (let v = 5.0; v < D - 4; v += 2.0) {
      k.rack('u', 2.4, Math.max(3.6, half - 1.2), v, { palette });
      k.rack('u', Math.min(W - 3.6, half + 1.2), W - 2.4, v, { palette });
    }
    // 试穿长凳
    k.sofa('u', half - 1.2, half + 1.2, D - 2.4, 0, -1, '#6c757d', 0.42);
    cash(k, W - 4.6, D - 4.0);
  };

const running: Template = (k) => {
  sports([...SPORT])(k);
  // 试跑机
  const { W, D } = k;
  k.box(1.4, D - 3.6, 2.2, D - 1.6, 0, 0.25, 'prop', '#2b2d42');
  k.box(1.4, D - 1.75, 2.2, D - 1.6, 0.25, 1.3, 'prop', '#2b2d42');
  k.solid(1.4, D - 3.6, 2.2, D - 1.6, 0.25);
  void W;
};

const badminton: Template = (k) => {
  const { W, D } = k;
  // 球拍墙：细长的拍子
  k.shelf('v', 1.4, D - 2.0, M, 1, { palette: SPORT, height: 2.2, levels: 2, depth: 0.25, item: { w: [0.05, 0.05], h: [0.65, 0.7] } });
  k.shelf('v', 1.4, D - 2.0, W - M, -1, { palette: SPORT, height: 2.1, levels: 6, depth: 0.35, item: { w: [0.26, 0.32], h: [0.1, 0.14] } });
  // 演示网
  const v = D * 0.45;
  k.box(2.0, v - 0.03, 2.08, v + 0.03, 0, 1.55, 'metal');
  k.box(W - 2.08, v - 0.03, W - 2.0, v + 0.03, 0, 1.55, 'metal');
  k.box(2.08, v - 0.01, W - 2.08, v + 0.01, 0.8, 1.55, 'prop', '#f8f9fa');
  k.solid(2.0, v - 0.05, W - 2.0, v + 0.05, 1.55);
  frontTables(k, 2.6, SPORT, { stacks: true });
  k.sofa('u', W / 2 - 1.2, W / 2 + 1.2, D - 2.2, 0, -1, '#4361ee', 0.42);
  cash(k, W - 4.6, D * 0.7);
};

const drugstore: Template = (k) => {
  const { W, D } = k;
  wallShelves(k, { palette: [...COSMETIC, ...PANTRY], height: 1.9, levels: 6, depth: 0.4, item: { w: [0.06, 0.16], h: [0.1, 0.2] } });
  for (let c = 3.0; c < W - 3; c += 3.0) k.gondola('v', 4.0, D - 2.0, c, { palette: [...COSMETIC, ...PANTRY], height: 1.5, levels: 5, item: { w: [0.06, 0.16], h: [0.1, 0.2] } });
  cash(k, W - 4.0, 2.2, 2.4, '#06d6a0');
};

const repair: Template = (k) => {
  const { W, D } = k;
  k.counter(1.0, D * 0.5, W - 1.0, D * 0.5 + 0.7, { color: '#6c757d' });
  k.staff(W / 2, D * 0.5 + 1.3, 0, -1);
  k.shelf('u', 0.8, W - 0.8, D - M, -1, { palette: TECH, height: 2.0 });
  for (let v = 1.4; v < D * 0.5 - 1.2; v += 0.7) k.chair(M + 0.5, v, 1, 0, { color: '#adb5bd' });
};

const karaoke: Template = (k) => {
  const { W, D } = k;
  // 后面一排包间（门 + 小窗），前面大堂柜台和等候沙发
  const rv = D * 0.5;
  for (let u = 0.8; u < W - 3.5; u += 3.6) {
    k.box(u, rv, u + 0.12, D - M, 0, 3.0, 'prop', '#5a189a');
    k.box(u + 0.12, rv, u + 3.6, rv + 0.12, 0, 3.0, 'prop', '#3c096c');
    k.box(u + 1.4, rv - 0.01, u + 2.3, rv, 0.02, 2.2, 'prop', '#e0aaff');
    k.box(u + 2.6, rv - 0.01, u + 3.2, rv, 1.2, 1.8, 'glass');
    k.solid(u, rv, u + 3.6, D - M, 3.0);
  }
  k.counter(W - 4.6, 2.4, W - 1.2, 3.1, { color: '#3c096c' });
  k.staff(W - 2.9, 3.7, 0, -1);
  k.sofa('u', 1.5, 4.5, rv - 0.8, 0, -1, '#7b2cbf');
  k.sofa('u', 6.0, 9.0, rv - 0.8, 0, -1, '#7b2cbf');
};

const photoBooth: Template = (k) => {
  const { W, D } = k;
  for (let u = 1.2; u < W - 2; u += 2.6) {
    const v0 = D - M - 2.0;
    k.box(u, v0, u + 2.0, D - M, 0, 2.3, 'prop', k.pick(['#ff006e', '#fb5607', '#8338ec', '#3a86ff']));
    k.box(u + 0.4, v0 - 0.02, u + 1.6, v0, 0.3, 2.1, 'prop', '#ffe5ec');
    k.solid(u, v0, u + 2.0, D - M, 2.3);
  }
  k.shelf('v', 1.4, D - 3.5, M, 1, { palette: PASTEL, height: 1.8, levels: 4 });
  k.table(W / 2, D * 0.45, 2.0, 0.8, { top: '#ffe5ec', h: 0.9 });
};

const playground: Template = (k) => {
  const { W, D } = k;
  // 软垫区 + 积木 + 家长长椅
  const u0 = 2.0;
  const u1 = W - 4.0;
  const v0 = 3.0;
  const v1 = D - 1.5;
  k.box(u0, v0, u1, v1, 0, 0.04, 'prop', '#caf0f8');
  const gate = Math.min(u1 - 1.2, Math.max(u0 + 1.2, (k.f.door.u0 + k.f.door.u1) / 2));
  k.box(u0, v0, gate - 0.7, v0 + 0.1, 0, 0.7, 'prop', '#f72585');
  k.box(gate + 0.7, v0, u1, v0 + 0.1, 0, 0.7, 'prop', '#f72585');
  k.box(u0, v0, u0 + 0.1, v1, 0, 0.7, 'prop', '#f72585');
  k.box(u1 - 0.1, v0, u1, v1, 0, 0.7, 'prop', '#f72585');
  k.solid(u0, v0, gate - 0.7, v0 + 0.1, 0.7);
  k.solid(gate + 0.7, v0, u1, v0 + 0.1, 0.7);
  k.solid(u0, v0, u0 + 0.1, v1, 0.7);
  k.solid(u1 - 0.1, v0, u1, v1, 0.7);
  for (let i = 0; i < 18; i++) {
    const u = k.range(u0 + 1, u1 - 1);
    const v = k.range(v0 + 1, v1 - 1);
    const s = k.range(0.3, 0.6);
    k.product(u, v, 0.04, s, s, s, true, k.pick(TOYS));
  }
  k.sofa('v', 3.0, 7.0, W - M, -1, 0, '#4cc9f0');
  k.counter(W - 3.6, 1.2, W - 1.0, 1.9, { color: '#4cc9f0' });
};

const boardGameCafe: Template = (k) => {
  const { W, D } = k;
  k.shelf('u', 1.0, W - 1.0, D - M, -1, { palette: TOYS, height: 2.2, levels: 6, depth: 0.4, item: { w: [0.28, 0.4], h: [0.06, 0.1] } });
  grid(1.8, W - 1.8, 2.4, D - 2.2, 2.8, 2.4, (u, v) => k.tableSet(u, v, 4, { top: '#ddb892', chair: '#7f5539' }));
};

const escapeRoom: Template = (k) => {
  const { W, D } = k;
  // 大堂 + 后墙一排主题门
  for (let u = 2.0; u < W - 2.0; u += 4.0) {
    k.box(u, D - M - 0.1, u + 1.4, D - M, 0, 2.4, 'prop', k.pick(['#2f3e46', '#6b2737', '#344e41', '#3d348b']));
    k.box(u - 0.1, D - M - 0.12, u + 1.5, D - M, 2.4, 2.55, 'prop', '#cad2c5');
  }
  k.counter(W - 4.6, 2.4, W - 1.2, 3.1, { color: '#2f3e46' });
  k.sofa('u', 2.0, 5.0, D * 0.45, 0, 1, '#52796f');
  k.sofa('u', 7.0, 10.0, D * 0.45, 0, 1, '#52796f');
};

const outdoor: Template = (k) => {
  const { W, D } = k;
  wallShelves(k, { palette: SPORT, height: 2.2 });
  // 展示帐篷（梯形块）
  for (const u of [W * 0.3, W * 0.55]) {
    k.box(u - 1.4, D * 0.35 - 1.1, u + 1.4, D * 0.35 + 1.1, 0, 0.8, 'prop', '#a7c957');
    k.box(u - 1.0, D * 0.35 - 0.8, u + 1.0, D * 0.35 + 0.8, 0.8, 1.35, 'prop', '#6a994e');
    k.solid(u - 1.4, D * 0.35 - 1.1, u + 1.4, D * 0.35 + 1.1, 1.35);
  }
  for (let v = D * 0.55; v < D - 3; v += 2.0) {
    k.rack('u', 3, W * 0.4, v, { palette: SPORT });
    k.rack('u', W * 0.5, W - 4, v, { palette: SPORT });
  }
  k.sofa('u', W * 0.75, W * 0.75 + 2.4, D * 0.35, 0, -1, '#386641');
  cash(k, W - 4.6, 3.0, 2.2, '#386641');
};

const bikes: Template = (k) => {
  const { W, D } = k;
  // 自行车：两个轮子（扁盒）+ 车架
  const bike = (u: number, v: number) => {
    const col = k.pick(SPORT);
    for (const du of [-0.45, 0.45]) k.box(u + du - 0.33, v - 0.02, u + du + 0.33, v + 0.02, 0.02, 0.68, 'prop', '#2b2d42');
    k.box(u - 0.45, v - 0.03, u + 0.45, v + 0.03, 0.55, 0.62, 'prop', col);
    k.box(u - 0.1, v - 0.03, u - 0.04, v + 0.03, 0.35, 0.95, 'prop', col);
    k.box(u + 0.35, v - 0.25, u + 0.41, v + 0.25, 0.95, 1.0, 'metal');
    k.solid(u - 0.8, v - 0.25, u + 0.8, v + 0.25, 1.0);
  };
  for (let v = 2.8; v < D - 3; v += 1.2) {
    bike(W * 0.3, v);
    bike(W * 0.62, v);
  }
  k.shelf('v', 1.4, D - 2, M, 1, { palette: SPORT, height: 2.0 });
  k.counter(W - 5.2, D - 3.2, W - 1.2, D - 2.5, { color: '#e63946' });
  k.box(W - 5.2, D - M - 0.6, W - 1.2, D - M, 0, 0.9, 'metal');
};

const yoga: Template = (k) => {
  const { W, D } = k;
  // 练习室：地上一排排瑜伽垫，一面镜子墙
  k.panel('u', 1.0, W - 1.0, D - M, -1, 0.3, 2.6, '#e0fbfc');
  grid(2.5, W - 2.5, 4.5, D - 1.5, 2.2, 2.8, (u, v) => k.box(u - 0.31, v - 0.92, u + 0.31, v + 0.92, 0, 0.015, 'prop', k.pick(['#b5838d', '#e5989b', '#ffb4a2', '#6d6875'])));
  k.sofa('u', 1.0, 4.0, 1.4, 0, 1, '#b5838d');
  k.counter(W - 4.4, 1.6, W - 1.0, 2.3, { color: '#b5838d' });
};

const golf: Template = (k) => {
  const { W, D } = k;
  // 打击位：草皮 + 后网
  for (let u = 2.0; u < W * 0.6; u += 4.0) {
    k.box(u, D - 6, u + 3.4, D - M, 0, 0.02, 'prop', '#52b788');
    k.box(u, D - M - 0.1, u + 3.4, D - M, 0, 3.0, 'prop', '#e9f5db');
    k.box(u, D - 6, u + 0.06, D - M, 0, 3.0, 'prop', '#e9f5db');
    k.solid(u, D - 6, u + 0.06, D - M, 3.0);
    k.chair(u + 2.6, D - 6.6, 0, 1, { color: '#2d6a4f' });
  }
  k.shelf('v', 1.4, D - 7, W - M, -1, { palette: SPORT, height: 2.0, levels: 2, item: { w: [0.06, 0.06], h: [0.9, 1.0] } });
  frontTables(k, 2.6, SPORT);
  k.counter(W * 0.65, D - 3.5, W * 0.65 + 2.4, D - 2.8, { color: '#2d6a4f' });
};

const climbing: Template = (k) => {
  const { W, D } = k;
  // 攀岩墙（后墙）+ 彩色岩点 + 厚垫子
  k.box(0.8, D - M - 0.25, W - 0.8, D - M, 0, 4.6, 'prop', '#e9ecef');
  for (let i = 0; i < 70; i++) {
    const u = k.range(1.2, W - 1.2);
    const h = k.range(0.3, 4.3);
    const s = k.range(0.1, 0.22);
    k.product(u, D - M - 0.3, h, s, s * 0.8, 0.1, true, k.pick(['#ffca3a', '#ff595e', '#8ac926', '#1982c4', '#6a4c93']));
  }
  k.box(0.8, D - M - 3.2, W - 0.8, D - M - 0.25, 0, 0.3, 'prop', '#6a4c93');
  k.solid(0.8, D - M - 3.2, W - 0.8, D - M - 0.25, 0.3);
  k.sofa('u', 2.0, 6.0, D - 5.0, 0, 1, '#ffca3a');
  k.sofa('u', W - 6.0, W - 2.0, D - 5.0, 0, 1, '#ffca3a');
  k.counter(W - 4.4, 1.6, W - 1.0, 2.3, { color: '#6a4c93' });
};

const snacks: Template = (k) => {
  const { W, D } = k;
  wallShelves(k, { palette: [...PANTRY, ...TOYS], height: 1.9, levels: 5 });
  grid(2.0, W - 2.0, 2.4, D - 3.5, 2.2, 2.0, (u, v) => k.displayTable(u, v, 1.2, 1.0, { palette: TOYS, h: 0.7, stacks: true, color: '#ffb703' }));
  k.counter(1.0, D - 2.8, W - 1.0, D - 2.1, { color: '#fb8500' });
};

const phoneAccessories: Template = (k) => {
  const { W, D } = k;
  wallShelves(k, { palette: [...TECH, ...PASTEL], height: 2.0, levels: 7, depth: 0.25, item: { w: [0.08, 0.1], h: [0.14, 0.18] } });
  grid(2.4, W - 2.4, 3.0, D - 4, 3.2, 2.6, (u, v) => k.displayTable(u, v, 1.6, 0.9, { palette: [...TECH, ...PASTEL], h: 0.9 }));
  k.counter(W - 4.0, D - 3.2, W - 1.6, D - 2.5, { color: '#00a6fb' });
};

const kidswear: Template = (k) => {
  apparel(PASTEL, { sofa: '#80ed99' })(k);
};

/** 阶段 5 再做（影院、空中花园、卡丁车场）：先不放东西 */
const later: Template = () => {};

export const TEMPLATES: Record<ShopCategory, Template> = {
  supermarket,
  consoles,
  devices: electronics,
  camera: electronics,
  bricks,
  blindbox,
  fanmerch: toys,
  toys,
  capsuleToys,
  cards,
  plush,
  menswear: apparel(APPAREL),
  womenswear: apparel(['#ffc8dd', '#ffafcc', '#f1faee', '#cdb4db', '#fefae0', '#e5989b', '#b5838d', '#ffffff'], { sofa: '#f4a6b7' }),
  kidswear,
  shoes,
  eyewear,
  cosmetics,
  bags,
  accessories,
  books,
  stationery,
  cafe: cafe(),
  bubbleTea: kiosk(['#cdb4db', '#ffffff', '#ffafcc', '#d4a373']),
  juiceBar: cafe({ counter: '#ffb703', chair: '#023047', top: '#fff3b0', pastry: FRUIT, sofa: '#219ebc' }),
  crepes: kiosk(['#f4a261', '#fff8e7', '#e76f51', '#ffd166']),
  bakery,
  sweets: cafe({ counter: '#ff8fab', chair: '#ffc2d1', pastry: PASTEL, sofa: '#ffb3c6' }),
  deli: cafe({ counter: '#90be6d', chair: '#606c38', pastry: FRUIT, sofa: '#a7c957' }),
  foodcourt,
  ramen: restaurant({ bar: true, chair: '#c1121f', top: '#fdf0d5' }),
  sushi,
  italian: restaurant({ chair: '#606c38', top: '#fefae0', booth: '#bc6c25' }),
  curry: restaurant({ chair: '#e85d04', top: '#ffe8d6' }),
  grill: restaurant({ chair: '#3d405b', top: '#ddb892', booth: '#6a040f' }),
  arcade,
  vr,
  karaoke,
  photoBooth,
  playground,
  boardGameCafe,
  escapeRoom,
  sports: sports(SPORT),
  running,
  badminton,
  outdoor,
  bikes,
  yoga,
  golf,
  climbing,
  snacks,
  phoneAccessories,
  drugstore,
  repair,
  karting: later,
  cinema: later,
  garden: later,
};

export { DEFAULT_PALETTE };
