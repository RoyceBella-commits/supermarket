import type { Kit, ShelfOpts } from '../kit.ts';
import { shade } from '../kit.ts';

// 模板公用的部件和规则。依据 docs/interior-references.md（日本、美国真实店铺的布局整理）：
// - 门口 2.5 m（主力店 3 m）内、开口中线左右 1.5 m 留空；主通道 ≥ 2.4 m，其余通道 ≥ 1.2 m。
// - 主力店（52×18，宽而浅）用 T 形动线：3 m 中轴直通后墙的“磁石”，v≈8–10 一条横向主通道。
// - 高度分层：前区矮、中区 ≤ 1.5（书店超市 ≤ 1.8）、靠墙 2.1–2.4，门口能看到后墙。
// - 收银台后 0.9 m 是背柜，店员站中间；后墙一角是员工门。

export type Template = (k: Kit) => void;

/** 家具离墙的距离 */
export const M = 0.2;

export const FRUIT = ['#e63946', '#f4a261', '#ffd166', '#90be6d', '#43aa8b', '#f94144', '#f8961e', '#a7c957'];
export const PANTRY = ['#e76f51', '#f4a261', '#e9c46a', '#2a9d8f', '#264653', '#ffffff', '#8ecae6', '#bc4749', '#f2e8cf'];
export const BREAD = ['#d4a373', '#bc6c25', '#e9c46a', '#dda15e', '#fefae0'];
export const BOOKS = ['#6d597a', '#b56576', '#e56b6f', '#355070', '#eaac8b', '#2a9d8f', '#f2e8cf', '#264653', '#a8dadc'];
export const TECH = ['#2b2d42', '#8d99ae', '#edf2f4', '#3a86ff', '#14213d', '#e5e5e5'];
export const TOYS = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#ff9f1c', '#8338ec', '#3a86ff', '#fb5607'];
export const PASTEL = ['#ffc8dd', '#ffafcc', '#bde0fe', '#a2d2ff', '#cdb4db', '#fdffb6', '#caffbf', '#ffd6a5'];
export const SPORT = ['#f94144', '#f3722c', '#f9c74f', '#90be6d', '#43aa8b', '#577590', '#277da1', '#ffffff', '#1d3557'];
export const COSMETIC = ['#ffafcc', '#ff8fab', '#fb6f92', '#ffe5ec', '#ffffff', '#cdb4db', '#e5989b'];
export const APPAREL = ['#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51', '#f1faee', '#a8dadc', '#457b9d', '#d6ccc2', '#6d6875'];
export const DRINKS = ['#e63946', '#f1faee', '#a8dadc', '#ffb703', '#8ecae6', '#90be6d', '#f8961e', '#ffffff'];
export const WOOD = '#c8a27a';
export const DARK_WOOD = '#6b4f3a';

export const doorMid = (k: Kit) => (k.f.door.u0 + k.f.door.u1) / 2;
/** 主力店：52×18 的宽浅盒子 */
export const isAnchor = (k: Kit) => k.W >= 40 && k.D <= 20;

/**
 * 零售店的通行规则：门口留空、主通道（主力店是 T 形中轴 + 横向主通道）。
 * main：普通店主通道从门口往里延伸到多深。
 */
export function retailRules(k: Kit, o: { main?: number; mainHalf?: number; axisEnd?: number } = {}) {
  const mid = doorMid(k);
  if (isAnchor(k)) {
    k.reserve(mid - 1.5, 0, mid + 1.5, o.axisEnd ?? k.D - 4.5);
    k.reserve(1.0, 8.2, k.W - 1.0, 10.6);
  } else {
    k.reserve(mid - 1.5, 0, mid + 1.5, 2.5);
    const half = o.mainHalf ?? 1.2;
    k.reserve(mid - half, 0, mid + half, o.main ?? Math.min(6, k.D * 0.45));
  }
}

/** 放得下才放（检查预留区和已有家具，留 gap 的间隙） */
export function place(k: Kit, cu: number, cv: number, w: number, d: number, fn: () => void, gap = 0.6): boolean {
  if (!k.fits(cu - w / 2, cv - d / 2, cu + w / 2, cv + d / 2, gap)) return false;
  fn();
  return true;
}

/** 在矩形区域里按网格摆东西（格子中心） */
export function grid(u0: number, u1: number, v0: number, v1: number, su: number, sv: number, fn: (u: number, v: number, i: number, j: number) => void) {
  const nu = Math.max(1, Math.floor((u1 - u0) / su));
  const nv = Math.max(1, Math.floor((v1 - v0) / sv));
  const ou = u0 + (u1 - u0 - (nu - 1) * su) / 2;
  const ov = v0 + (v1 - v0 - (nv - 1) * sv) / 2;
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) fn(ou + i * su, ov + j * sv, i, j);
}

/**
 * 收银台（G1）：台子中心 (cu, cv)，店员面朝 (du, dv)（默认面朝门口 -v）。
 * 店员站在台后 0.8 m，背后 1.45 m 处是 1.2 高的背柜；台前 1.2 m 留给客人。
 */
export function cash(k: Kit, cu: number, cv: number, o: { w?: number; du?: number; dv?: number; color?: string; back?: boolean; staff?: boolean; reserveFront?: boolean } = {}) {
  const w = o.w ?? 2.2;
  const du = o.du ?? 0;
  const dv = o.dv ?? -1;
  const alongU = dv !== 0;
  const rect = (c0: number, c1: number, half: number): [number, number, number, number] =>
    alongU ? [cu - half, cv + c0, cu + half, cv + c1] : [cu + c0, cv - half, cu + c1, cv + half];
  const s = alongU ? -dv : -du; // 店员一侧的方向
  const color = o.color ?? k.f.shop.theme.primary;
  const [a0, b0, a1, b1] = rect(-0.35, 0.35, w / 2);
  k.counter(a0, b0, a1, b1, { color, top: '#fbf8f2' });
  if (o.back !== false) {
    const [c0, d0, c1, d1] = rect(Math.min(s * 1.25, s * 1.7), Math.max(s * 1.25, s * 1.7), w / 2);
    k.box(c0, d0, c1, d1, 0, 1.2, 'prop', shade(color, 0.8));
    k.box(c0, d0, c1, d1, 1.2, 1.24, 'prop', '#fbf8f2');
    k.solid(c0, d0, c1, d1, 1.24);
  }
  if (o.staff !== false) k.staff(cu + (alongU ? 0 : s * 0.8), cv + (alongU ? s * 0.8 : 0), du, dv);
  if (o.reserveFront !== false) {
    const [e0, f0, e1, f1] = rect(Math.min(-s * 0.4, -s * 1.6), Math.max(-s * 0.4, -s * 1.6), w / 2);
    k.reserve(e0, f0, e1, f1);
  }
}

export interface WallShelfOpts extends ShelfOpts {
  vFrom?: number;
  back?: boolean;
  left?: boolean;
  right?: boolean;
  /** 员工门在后墙哪个角（默认右后角） */
  door?: 'left' | 'right' | 'none';
}

/** 左右墙和后墙的靠墙货架（G2），后墙一角留员工门 */
export function wallShelves(k: Kit, o: WallShelfOpts = {}) {
  const vFrom = o.vFrom ?? 1.4;
  const s: ShelfOpts = { height: 2.1, levels: 5, depth: 0.45, ...o };
  const depth = s.depth ?? 0.45;
  const back = o.back !== false;
  const door = o.door ?? 'right';
  const wl = k.f.walls.left + 0.05;
  const wr = k.W - k.f.walls.right - 0.05;
  const wb = k.D - k.f.walls.back - 0.05;
  const sideEnd = back ? wb - depth : wb;
  if (door !== 'none') k.staffDoor(door === 'right' ? wr - 0.85 : wl + 0.85);
  if (o.left !== false) k.shelf('v', vFrom, door === 'left' ? wb - 1.3 : sideEnd, wl, 1, s);
  if (o.right !== false) k.shelf('v', vFrom, door === 'right' ? wb - 1.3 : sideEnd, wr, -1, s);
  if (back) k.shelf('u', door === 'left' ? wl + 1.7 : wl, door === 'right' ? wr - 1.7 : wr, wb, -1, s);
}

/** 门口内侧两张主推台（G4），夹着中间的主通道 */
export function frontTables(k: Kit, palette: string[], o: { v?: number; w?: number; d?: number; h?: number; stacks?: boolean } = {}): [number, number][] {
  const mid = doorMid(k);
  const w = o.w ?? 1.6;
  const v = o.v ?? (isAnchor(k) ? 3.6 : 3.1);
  const out: [number, number][] = [];
  for (const side of [-1, 1]) {
    const u = mid + side * (1.6 + w / 2);
    if (place(k, u, v, w, o.d ?? 0.9, () => k.displayTable(u, v, w, o.d ?? 0.9, { palette, h: o.h ?? 0.8, stacks: o.stacks }), 0.3)) out.push([u, v]);
  }
  return out;
}

/** 门两侧贴着前墙的橱窗台（0.3 高），上面站人台（服装店） */
export function windowDisplays(k: Kit, colors: string[], perSide = 2) {
  const door = k.f.door;
  for (const side of [-1, 1]) {
    const u0 = side < 0 ? Math.max(k.f.walls.left + 0.3, door.u0 - 3.4) : door.u1 + 0.4;
    const u1 = side < 0 ? door.u0 - 0.4 : Math.min(k.W - k.f.walls.right - 0.3, door.u1 + 3.4);
    if (u1 - u0 < 1.2) continue;
    k.box(u0, 0.2, u1, 1.2, 0, 0.3, 'prop', '#f1ece4');
    k.solid(u0, 0.2, u1, 1.2, 2.1);
    for (let i = 0; i < perSide; i++) k.mannequin(u0 + ((u1 - u0) * (i + 0.5)) / perSide, 0.7, colors[(i + (side > 0 ? 1 : 0)) % colors.length], 0.3, false);
  }
}

/** 试衣间（G7）：靠后墙一排，前面有编号牌小台，留 1.5 m 等候区 */
export function fittingRooms(k: Kit, u0: number, n: number, curtain: string, o: { size?: number } = {}) {
  const size = o.size ?? 1.2;
  const v1 = k.D - k.f.walls.back - 0.02;
  const v0 = v1 - 1.4;
  for (let i = 0; i <= n; i++) k.box(u0 + i * size, v0, u0 + i * size + 0.06, v1, 0, 2.3, 'prop', '#f1ece4');
  for (let i = 0; i < n; i++) k.box(u0 + i * size + 0.06, v0, u0 + (i + 1) * size, v0 + 0.04, 0.2, 2.1, 'prop', curtain);
  k.box(u0, v0, u0 + n * size + 0.06, v1, 2.3, 2.36, 'prop', '#f1ece4');
  k.solid(u0, v0, u0 + n * size + 0.06, v1, 2.3);
  // 编号牌小台
  const du = u0 + n * size + 0.5;
  if (k.fits(du - 0.3, v0 - 0.2, du + 0.3, v0 + 0.2)) {
    k.box(du - 0.3, v0 - 0.2, du + 0.3, v0 + 0.2, 0, 1.0, 'prop', '#e9e2d4');
    k.solid(du - 0.3, v0 - 0.2, du + 0.3, v0 + 0.2, 1.0);
  }
  k.reserve(u0, v0 - 1.5, u0 + n * size, v0);
}

/** 后墙中段的面板（菜单板、主视觉） */
export function backPanel(k: Kit, u0: number, u1: number, h0: number, h1: number, tint: string) {
  k.panel('u', u0, u1, k.D - k.f.walls.back - 0.02, -1, h0, h1, tint);
}

/** 整店铺一层地毯/地垫颜色（只是画面，不挡人） */
export function floorFinish(k: Kit, color: string, u0 = 0.2, v0 = 0.2, u1 = k.W - 0.2, v1 = k.D - 0.2) {
  k.box(u0, v0, u1, v1, 0, 0.006, 'prop', color);
}

/** 从天花吊下来的分类牌 / 品类旗：两根吊线 + 一块牌子（不挡人） */
export function hangingSign(k: Kit, cu: number, cv: number, w: number, color: string, alongU = true, h0 = 2.55, h1 = 2.9) {
  const ceil = 5.6;
  const [du, dv] = alongU ? [w / 2, 0.02] : [0.02, w / 2];
  k.box(cu - du, cv - dv, cu + du, cv + dv, h0, h1, 'prop', color);
  for (const s of [-0.8, 0.8]) {
    const wu = alongU ? cu + s * du : cu;
    const wv = alongU ? cv : cv + s * dv;
    k.box(wu - 0.006, wv - 0.006, wu + 0.006, wv + 0.006, h1, ceil, 'metal');
  }
}

/** 高脚凳/椅子的一排：沿 axis 从 a0 到 a1，人面朝 (du, dv) */
export function stoolRow(k: Kit, axis: 'u' | 'v', a0: number, a1: number, c: number, du: number, dv: number, step = 0.65, color = '#3d405b') {
  for (let a = a0; a <= a1 + 1e-6; a += step) {
    if (axis === 'u') k.stool(a, c, du, dv, color);
    else k.stool(c, a, du, dv, color);
  }
}

/** 一节玻璃柜（G5）：柜体 + 玻璃 + 里面的小东西 */
export function glassCase(k: Kit, u0: number, v0: number, u1: number, v1: number, o: { h?: number; base?: string; palette?: string[]; tall?: boolean } = {}) {
  const h = o.h ?? (o.tall ? 1.9 : 0.95);
  const base = o.base ?? '#f1ece4';
  const glassFrom = o.tall ? 0.3 : h - 0.12;
  k.box(u0, v0, u1, v1, 0, glassFrom, 'prop', base);
  k.box(u0, v0, u1, v1, glassFrom, h, 'glass');
  k.box(u0, v0, u1, v1, h, h + 0.04, 'prop', base);
  k.solid(u0, v0, u1, v1, h + 0.04);
  const palette = o.palette ?? TOYS;
  const levels = o.tall ? 3 : 1;
  for (let l = 0; l < levels; l++) {
    const hh = o.tall ? glassFrom + l * ((h - glassFrom) / 3) : glassFrom - 0.01;
    if (o.tall) k.box(u0 + 0.03, v0 + 0.03, u1 - 0.03, v1 - 0.03, hh, hh + 0.02, 'glass');
    const n = Math.max(1, Math.floor((Math.max(u1 - u0, v1 - v0) - 0.1) / 0.22));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const pu = Math.abs(u1 - u0) > Math.abs(v1 - v0) ? u0 + (u1 - u0) * t : (u0 + u1) / 2;
      const pv = Math.abs(u1 - u0) > Math.abs(v1 - v0) ? (v0 + v1) / 2 : v0 + (v1 - v0) * t;
      k.product(pu, pv, hh + 0.02, 0.12, o.tall ? 0.22 : 0.03, 0.1, true, k.pick(palette));
    }
  }
}
