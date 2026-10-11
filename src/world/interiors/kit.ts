import * as THREE from 'three';
import type { Opening, ShopDef } from '../../data/layoutTypes.ts';
import { edgeOf } from '../rectOps.ts';
import type { MatKey, StaticBatch } from '../StaticBatch.ts';
import type { Seat } from '../../systems/Seats.ts';
import { toonGradient } from '../../render/worldMaterials.ts';

// 店内布置的工具：店铺局部坐标系 + 一组家具/货架生成函数。
//
// 局部坐标：u 沿店门所在的那面墙（0..W），v 从门口往店里（0..D）。
// 所有家具都是轴对齐盒子，画面用 StaticBatch 合并；每件家具只建一个整体碰撞体（不是每块隔板都建）。
// 商品是小盒子，按店铺放进一个 InstancedMesh（一家店一次绘制，可以视锥剔除）。

export type Rng = () => number;

/** 由字符串得到可重复的随机数序列（同一家店每次生成都一样） */
export function seededRng(key: string): Rng {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  let s = h >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 左墙（u=0）、右墙（u=W）、后墙（v=D）的墙面离店铺矩形边的距离 */
export interface WallFaces {
  left: number;
  right: number;
  back: number;
}

/** 装饰图的位置（世界坐标）。image 为空时按店铺用途和形状从 manifest 里挑一张海报/横幅。 */
export interface DecorSlot {
  shopId: string;
  floor: number;
  image?: string;
  shape?: 'portrait' | 'landscape';
  /** 图集里的第几格（行优先），整张图用 -1 */
  cell: number;
  x: number;
  y: number;
  z: number;
  /** 图朝向（看图的人站在这个方向上） */
  yaw: number;
  /** 平放（桌面上的书）还是竖着（墙上、盒子正面） */
  flat: boolean;
  /** 最大尺寸；按图片比例缩到框内 */
  w: number;
  h: number;
}

export class ShopFrame {
  readonly W: number;
  readonly D: number;
  /** 门洞在 u 方向的范围 */
  readonly door: { u0: number; u1: number };
  private readonly e: ReturnType<typeof edgeOf>;

  constructor(
    readonly shop: ShopDef,
    readonly y: number,
    readonly walls: WallFaces = { left: 0.15, right: 0.15, back: 0.15 },
    door: Opening = shop.entrances[0],
  ) {
    this.e = edgeOf(shop.rect, door.side);
    this.W = this.e.length;
    this.D = door.side === 'N' || door.side === 'S' ? shop.rect.d : shop.rect.w;
    this.door = { u0: door.offset, u1: door.offset + door.width };
  }

  x(u: number, v: number) {
    return this.e.x + this.e.ax * u - this.e.outX * v;
  }
  z(u: number, v: number) {
    return this.e.z + this.e.az * u - this.e.outZ * v;
  }
  /** 局部方向 → 世界朝向角（0 = 面朝 +z） */
  yaw(du: number, dv: number) {
    return Math.atan2(this.e.ax * du - this.e.outX * dv, this.e.az * du - this.e.outZ * dv);
  }
}

/** 商品和小道具（一家店一个方块 InstancedMesh + 一个圆柱 InstancedMesh） */
export class ProductSet {
  private readonly boxes: { m: THREE.Matrix4; c: THREE.Color }[] = [];
  private readonly cyls: { m: THREE.Matrix4; c: THREE.Color }[] = [];

  add(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string | THREE.Color) {
    const m = new THREE.Matrix4().makeScale(sx, sy, sz).setPosition(x, y, z);
    this.boxes.push({ m, c: color instanceof THREE.Color ? color : new THREE.Color(color) });
  }

  /** 圆柱：中心 (x,y,z)，半径 r、长 len；axis 是圆柱轴向（y 竖直，x/z 横放） */
  addCyl(x: number, y: number, z: number, r: number, len: number, color: string, axis: 'x' | 'y' | 'z' = 'y') {
    const m = new THREE.Matrix4().makeScale(r * 2, len, r * 2);
    if (axis === 'x') m.premultiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
    if (axis === 'z') m.premultiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    m.setPosition(x, y, z);
    this.cyls.push({ m, c: new THREE.Color(color) });
  }

  get count() {
    return this.boxes.length + this.cyls.length;
  }

  build(material: THREE.Material, name: string): THREE.InstancedMesh[] {
    const out: THREE.InstancedMesh[] = [];
    for (const [list, geo, suffix] of [
      [this.boxes, UNIT_BOX, 'box'],
      [this.cyls, UNIT_CYL, 'cyl'],
    ] as const) {
      if (list.length === 0) continue;
      const mesh = new THREE.InstancedMesh(geo, material, list.length);
      list.forEach((it, i) => {
        mesh.setMatrixAt(i, it.m);
        mesh.setColorAt(i, it.c);
      });
      mesh.computeBoundingSphere();
      mesh.name = `${name}:${suffix}`;
      out.push(mesh);
    }
    return out;
  }
}

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
let productMaterial: THREE.Material | null = null;
export function getProductMaterial(): THREE.Material {
  return (productMaterial ??= new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: toonGradient() }));
}

export interface ShelfOpts {
  depth?: number;
  height?: number;
  levels?: number;
  color?: string;
  /** 商品配色；空数组 = 空货架 */
  palette?: string[];
  /** 商品尺寸范围 [宽, 高] 的最小/最大 */
  item?: { w: [number, number]; h: [number, number] };
  /** 底层离地高度 */
  base?: number;
}

export interface NpcSpot {
  x: number;
  z: number;
  yaw: number;
}

/**
 * 一家店的布置工具。h 系列参数都是离本层地面的高度。
 */
/** 局部矩形 [u0, v0, u1, v1] */
export type LRect = [number, number, number, number];

export class Kit {
  npcSpot: NpcSpot | null = null;
  /** 店员站位（局部坐标，连通检查用） */
  staffLocal: [number, number] | null = null;
  /** 本店座位的局部坐标（连通检查用） */
  readonly seatLocal: [number, number][] = [];
  /** 每件家具的占地（局部），用于重叠检查和连通检查 */
  readonly solids: LRect[] = [];
  /** 预留的通道和留空区：模板放家具前用 fits() 检查 */
  readonly reserved: LRect[] = [];
  /** 生成时发现的问题（开发模式下显示） */
  readonly issues: string[] = [];
  /** 模板已经在后墙做了吸引物（菜单板、厨房、攀岩墙……），就不再挂 logo 灯箱 */
  backFeature = false;

  constructor(
    readonly f: ShopFrame,
    readonly batch: StaticBatch,
    readonly products: ProductSet,
    readonly seats: Seat[],
    readonly rng: Rng,
    readonly decor: DecorSlot[] = [],
  ) {}

  /**
   * 墙上的海报/横幅位：side 哪面墙，along 沿墙位置（左右墙是 v，后墙是 u），h0 底边高度。
   * 图片由运行时按店铺用途挑选；没有合适的图就空着。
   */
  wallArt(side: 'left' | 'right' | 'back', along: number, h0: number, maxW: number, maxH: number, shape: 'portrait' | 'landscape') {
    const off = this.f.walls[side] + 0.015;
    const [u, v, du, dv] = side === 'left' ? [off, along, 1, 0] : side === 'right' ? [this.W - off, along, -1, 0] : [along, this.D - off, 0, -1];
    this.pushDecor(undefined, -1, u, v, h0 + maxH / 2, du, dv, false, maxW, maxH, shape);
  }

  /** 图集卡片：竖着时 (u,v,h) 是图中心、面朝 (du,dv)；平放时 h 是桌面高度、图的上方朝 -(du,dv) */
  card(image: string, cell: number, u: number, v: number, h: number, du: number, dv: number, w: number, hh: number, flat = false) {
    this.pushDecor(image, cell, u, v, h, du, dv, flat, w, hh);
  }

  private pushDecor(image: string | undefined, cell: number, u: number, v: number, h: number, du: number, dv: number, flat: boolean, w: number, hh: number, shape?: 'portrait' | 'landscape') {
    const f = this.f;
    this.decor.push({ shopId: f.shop.id, floor: f.shop.floor, image, shape, cell, x: f.x(u, v), y: f.y + h, z: f.z(u, v), yaw: f.yaw(du, dv), flat, w, h: hh });
  }

  get W() {
    return this.f.W;
  }
  get D() {
    return this.f.D;
  }
  get floor() {
    return this.f.shop.floor;
  }

  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.rng() * list.length)];
  }
  range(a: number, b: number) {
    return a + (b - a) * this.rng();
  }

  /** 局部矩形盒子 */
  box(u0: number, v0: number, u1: number, v1: number, h0: number, h1: number, mat: MatKey, tint?: string, collide: 'solid' | 'none' | 'invisible' = 'none') {
    const f = this.f;
    this.batch.box(f.x(u0, v0), f.y + h0, f.z(u0, v0), f.x(u1, v1), f.y + h1, f.z(u1, v1), mat, f.shop.floor, collide, tint);
  }

  /** 整件家具的碰撞体（只挡，不显示） */
  solid(u0: number, v0: number, u1: number, v1: number, h1: number) {
    const r: LRect = [Math.min(u0, u1), Math.min(v0, v1), Math.max(u0, u1), Math.max(v0, v1)];
    const tol = 0.05;
    for (const o of this.solids) {
      if (overlap(r, o, tol)) {
        this.issues.push(`家具重叠 (${r[0].toFixed(1)}, ${r[1].toFixed(1)})`);
        break;
      }
    }
    for (const o of this.reserved) {
      if (overlap(r, o, tol)) {
        this.issues.push(`家具占了预留通道 (${r[0].toFixed(1)}, ${r[1].toFixed(1)})`);
        break;
      }
    }
    this.solids.push(r);
    this.box(r[0], r[1], r[2], r[3], 0, h1, 'prop', undefined, 'invisible');
  }

  /** 预留一块地方（通道、门口留空、员工门前） */
  reserve(u0: number, v0: number, u1: number, v1: number) {
    this.reserved.push([Math.min(u0, u1), Math.min(v0, v1), Math.max(u0, u1), Math.max(v0, v1)]);
  }

  /** 这块地方能不能放家具：在店内、不占预留区、不压已有家具（留 gap 的间隙） */
  fits(u0: number, v0: number, u1: number, v1: number, gap = 0) {
    const r: LRect = [Math.min(u0, u1) - gap, Math.min(v0, v1) - gap, Math.max(u0, u1) + gap, Math.max(v0, v1) + gap];
    if (r[0] < this.f.walls.left || r[2] > this.W - this.f.walls.right || r[1] < 0.15 || r[3] > this.D - this.f.walls.back) return false;
    for (const o of this.reserved) if (overlap(r, o, 0)) return false;
    for (const o of this.solids) if (overlap(r, o, 0)) return false;
    return true;
  }

  /** 圆柱道具：底面中心 (u, v, h)；axis 'y' 竖直，'u'/'v' 沿局部轴横放（此时 h 是轴心高度） */
  cyl(u: number, v: number, h: number, r: number, len: number, color: string, axis: 'y' | 'u' | 'v' = 'y') {
    const f = this.f;
    if (axis === 'y') {
      this.products.addCyl(f.x(u, v), f.y + h + len / 2, f.z(u, v), r, len, color, 'y');
      return;
    }
    const uAlongX = Math.abs(f.x(1, 0) - f.x(0, 0)) > 0.5;
    const worldAxis = (axis === 'u') === uAlongX ? 'x' : 'z';
    this.products.addCyl(f.x(u, v), f.y + h, f.z(u, v), r, len, color, worldAxis);
  }

  product(u: number, v: number, h: number, w: number, hh: number, d: number, alongU: boolean, color: string) {
    const f = this.f;
    // 局部 u/v 尺寸换算到世界 x/z：u 轴在世界里沿 x 还是 z 取决于门在哪一面
    const uAlongX = Math.abs(f.x(1, 0) - f.x(0, 0)) > 0.5;
    const su = alongU ? w : d;
    const sv = alongU ? d : w;
    const sx = uAlongX ? su : sv;
    const sz = uAlongX ? sv : su;
    this.products.add(f.x(u, v), f.y + h + hh / 2, f.z(u, v), sx, hh, sz, color);
  }

  /**
   * 单面货架。axis：货架沿哪个轴延伸；a0..a1：延伸范围；c：背板所在的另一轴坐标；
   * face：+1 朝另一轴增大方向，-1 反之。
   */
  shelf(axis: 'u' | 'v', a0: number, a1: number, c: number, face: 1 | -1, o: ShelfOpts = {}) {
    const depth = o.depth ?? 0.45;
    const height = o.height ?? 1.8;
    const levels = o.levels ?? 5;
    const color = o.color ?? '#f3efe7';
    const base = o.base ?? 0.12;
    const c1 = c + face * depth;
    const R = (p0: number, p1: number, q0: number, q1: number, h0: number, h1: number, mat: MatKey, tint?: string) =>
      axis === 'u' ? this.box(p0, q0, p1, q1, h0, h1, mat, tint) : this.box(q0, p0, q1, p1, h0, h1, mat, tint);
    // 背板、两侧板、踢脚、顶板
    R(a0, a1, c, c + face * 0.04, 0, height, 'prop', color);
    R(a0, a0 + 0.04, c, c1, 0, height, 'prop', color);
    R(a1 - 0.04, a1, c, c1, 0, height, 'prop', color);
    R(a0, a1, c, c1, 0, base, 'prop', shade(color, 0.82));
    const gap = (height - base) / levels;
    for (let i = 1; i < levels; i++) R(a0 + 0.04, a1 - 0.04, c, c1, base + i * gap - 0.03, base + i * gap, 'prop', color);
    R(a0, a1, c, c1, height - 0.03, height, 'prop', color);
    if (axis === 'u') this.solid(a0, Math.min(c, c1), a1, Math.max(c, c1), height);
    else this.solid(Math.min(c, c1), a0, Math.max(c, c1), a1, height);

    // 商品：每层沿长度方向随机排布
    const palette = o.palette ?? DEFAULT_PALETTE;
    if (palette.length === 0) return;
    const item = o.item ?? { w: [0.12, 0.32], h: [0.14, Math.min(0.32, gap - 0.08)] };
    const pd = (depth - 0.08) * 0.85;
    const pc = c + face * (0.04 + (depth - 0.04) / 2);
    for (let i = 0; i < levels; i++) {
      const h = base + i * gap;
      let a = a0 + 0.06;
      while (a < a1 - 0.08) {
        const w = Math.min(this.range(item.w[0], item.w[1]), a1 - 0.06 - a);
        // 剩下的空间放不下最窄的商品就换下一层（书脊、笔之类只有几厘米宽）
        if (w < item.w[0] * 0.8) break;
        if (this.rng() > 0.07) {
          const hh = Math.min(this.range(item.h[0], item.h[1]), gap - 0.06);
          const col = this.pick(palette);
          if (axis === 'u') this.product(a + w / 2, pc, h, w - 0.015, hh, pd, true, col);
          else this.product(pc, a + w / 2, h, w - 0.015, hh, pd, false, col);
        }
        a += w;
      }
    }
  }

  /** 双面中岛货架（背靠背两组），中心线在 c */
  gondola(axis: 'u' | 'v', a0: number, a1: number, c: number, o: ShelfOpts = {}) {
    const half = o.depth ?? 0.45;
    this.shelf(axis, a0, a1, c, 1, { ...o, depth: half });
    this.shelf(axis, a0, a1, c, -1, { ...o, depth: half });
    // 端头：一小段朝外的货架
    const color = o.color ?? '#f3efe7';
    const h = o.height ?? 1.8;
    if (axis === 'v') {
      this.box(c - half, a0 - 0.02, c + half, a0, 0, h, 'prop', shade(color, 0.92));
      this.box(c - half, a1, c + half, a1 + 0.02, 0, h, 'prop', shade(color, 0.92));
    } else {
      this.box(a0 - 0.02, c - half, a0, c + half, 0, h, 'prop', shade(color, 0.92));
      this.box(a1, c - half, a1 + 0.02, c + half, 0, h, 'prop', shade(color, 0.92));
    }
  }

  /** 收银台/柜台（实心），顶面另一种颜色；返回柜台后方站人的位置 */
  counter(u0: number, v0: number, u1: number, v1: number, o: { h?: number; color?: string; top?: string; register?: boolean } = {}) {
    const h = o.h ?? 1.0;
    const color = o.color ?? '#e9e2d4';
    this.box(u0, v0, u1, v1, 0, h - 0.05, 'prop', color);
    this.box(u0 - 0.03, v0 - 0.03, u1 + 0.03, v1 + 0.03, h - 0.05, h, 'prop', o.top ?? '#fbf8f2');
    this.solid(u0, v0, u1, v1, h);
    if (o.register !== false) {
      const cu = (u0 + u1) / 2;
      const cv = (v0 + v1) / 2;
      this.box(cu - 0.18, cv - 0.15, cu + 0.18, cv + 0.15, h, h + 0.1, 'prop', '#3d405b');
      this.box(cu - 0.15, cv - 0.02, cu + 0.15, cv + 0.02, h + 0.1, h + 0.32, 'prop', '#2b2d42');
    }
  }

  /** 店员站在 (u, v)，面朝局部方向 (du, dv) */
  staff(u: number, v: number, du: number, dv: number) {
    this.npcSpot = { x: this.f.x(u, v), z: this.f.z(u, v), yaw: this.f.yaw(du, dv) };
    this.staffLocal = [u, v];
  }

  /** 后墙上的员工门（G12），门前 1 m 预留 */
  staffDoor(u: number) {
    const back = this.D - this.f.walls.back;
    this.box(u - 0.5, back - 0.03, u + 0.5, back, 0, 2.2, 'prop', '#b9b1a3');
    this.box(u - 0.42, back - 0.05, u + 0.42, back - 0.03, 0, 2.1, 'prop', '#d8d2c6');
    this.box(u - 0.25, back - 0.06, u + 0.25, back - 0.05, 1.55, 1.7, 'prop', '#3d405b');
    this.box(u + 0.28, back - 0.1, u + 0.36, back - 0.05, 0.95, 1.0, 'metal');
    this.reserve(u - 0.6, back - 1.0, u + 0.6, back);
  }

  /** 人台（G8）：底座 + 腿 + 身体 + 头，衣服用主题色 */
  mannequin(u: number, v: number, color: string, h0 = 0, solid = true) {
    this.box(u - 0.2, v - 0.2, u + 0.2, v + 0.2, h0, h0 + 0.04, 'metal');
    this.box(u - 0.025, v - 0.025, u + 0.025, v + 0.025, h0 + 0.04, h0 + 0.75, 'metal');
    this.box(u - 0.14, v - 0.08, u + 0.14, v + 0.08, h0 + 0.75, h0 + 1.05, 'prop', shade(color, 0.8));
    this.box(u - 0.2, v - 0.11, u + 0.2, v + 0.11, h0 + 1.05, h0 + 1.5, 'prop', color);
    this.box(u - 0.05, v - 0.05, u + 0.05, v + 0.05, h0 + 1.5, h0 + 1.58, 'prop', '#f1ece4');
    this.box(u - 0.1, v - 0.1, u + 0.1, v + 0.1, h0 + 1.58, h0 + 1.8, 'prop', '#f1ece4');
    if (solid) this.solid(u - 0.22, v - 0.22, u + 0.22, v + 0.22, h0 + 1.8);
  }

  /** 门口的大雕像（积木角色、IP 公仔、吉祥物）：几段彩色方块叠起来 */
  statue(u: number, v: number, size: number, colors: string[]) {
    const s = size / 2;
    this.box(u - s * 1.1, v - s * 1.1, u + s * 1.1, v + s * 1.1, 0, 0.15, 'prop', '#e9e2d4');
    let h = 0.15;
    const parts = [
      [0.8, 0.55],
      [1.0, 0.7],
      [0.9, 0.6],
      [0.35, 0.15],
    ];
    parts.forEach(([k, hh], i) => {
      this.box(u - s * k, v - s * k, u + s * k, v + s * k, h, h + hh * size, 'prop', colors[i % colors.length]);
      h += hh * size;
    });
    // 两只耳朵/角
    this.box(u - s * 0.75, v - s * 0.2, u - s * 0.35, v + s * 0.2, h, h + 0.25 * size, 'prop', colors[0]);
    this.box(u + s * 0.35, v - s * 0.2, u + s * 0.75, v + s * 0.2, h, h + 0.25 * size, 'prop', colors[0]);
    this.solid(u - s * 1.1, v - s * 1.1, u + s * 1.1, v + s * 1.1, h);
  }

  /** 排队隔离带（G13）：沿 axis 从 a0 到 a1，c 是位置 */
  stanchions(axis: 'u' | 'v', a0: number, a1: number, c: number, band = '#c1121f') {
    const n = Math.max(2, Math.round((a1 - a0) / 1.6) + 1);
    for (let i = 0; i < n; i++) {
      const a = a0 + ((a1 - a0) * i) / (n - 1);
      if (axis === 'u') this.box(a - 0.04, c - 0.04, a + 0.04, c + 0.04, 0, 0.95, 'metal');
      else this.box(c - 0.04, a - 0.04, c + 0.04, a + 0.04, 0, 0.95, 'metal');
    }
    if (axis === 'u') this.box(a0, c - 0.01, a1, c + 0.01, 0.82, 0.9, 'prop', band);
    else this.box(c - 0.01, a0, c + 0.01, a1, 0.82, 0.9, 'prop', band);
    if (axis === 'u') this.solid(a0, c - 0.08, a1, c + 0.08, 0.95);
    else this.solid(c - 0.08, a0, c + 0.08, a1, 0.95);
  }

  /** 屏幕/灯箱：竖直的亮色面板，贴在 axis 方向的位置 c，面朝 face */
  screen(axis: 'u' | 'v', a0: number, a1: number, c: number, face: 1 | -1, h0: number, h1: number, color: string, frame = '#1b1b25') {
    this.panel(axis, a0 - 0.05, a1 + 0.05, c, face, h0 - 0.05, h1 + 0.05, frame);
    this.panel(axis, a0, a1, c + face * 0.04, face, h0, h1, color);
  }

  /** 桌子（四条腿 + 桌面） */
  table(cu: number, cv: number, w: number, d: number, o: { h?: number; color?: string; top?: string; round?: boolean } = {}) {
    const h = o.h ?? 0.74;
    const color = o.color ?? '#6b5b4e';
    const top = o.top ?? '#d9b99b';
    const u0 = cu - w / 2;
    const u1 = cu + w / 2;
    const v0 = cv - d / 2;
    const v1 = cv + d / 2;
    this.box(u0, v0, u1, v1, h - 0.04, h, 'prop', top);
    if (o.round || w < 0.8) {
      this.box(cu - 0.05, cv - 0.05, cu + 0.05, cv + 0.05, 0, h - 0.04, 'prop', color);
      this.box(cu - 0.22, cv - 0.22, cu + 0.22, cv + 0.22, 0, 0.03, 'prop', color);
    } else {
      for (const [a, b] of [
        [u0 + 0.04, v0 + 0.04],
        [u1 - 0.1, v0 + 0.04],
        [u0 + 0.04, v1 - 0.1],
        [u1 - 0.1, v1 - 0.1],
      ])
        this.box(a, b, a + 0.06, b + 0.06, 0, h - 0.04, 'prop', color);
    }
    this.solid(u0, v0, u1, v1, h);
  }

  /** 椅子：座面中心 (cu, cv)，人坐下后面朝 (du, dv)（单位向量，只取轴向）。登记一个座位。 */
  chair(cu: number, cv: number, du: number, dv: number, o: { color?: string; seatH?: number; back?: boolean; w?: number } = {}) {
    const sh = o.seatH ?? 0.45;
    const color = o.color ?? '#c8553d';
    const w = o.w ?? 0.44;
    const s = w / 2;
    this.box(cu - s, cv - s, cu + s, cv + s, sh - 0.05, sh, 'prop', color);
    // 腿：一根中柱 + 底座（卡通化，少几个面）
    this.box(cu - 0.04, cv - 0.04, cu + 0.04, cv + 0.04, 0, sh - 0.05, 'prop', shade(color, 0.7));
    this.box(cu - s * 0.7, cv - s * 0.7, cu + s * 0.7, cv + s * 0.7, 0, 0.03, 'prop', shade(color, 0.7));
    if (o.back !== false) {
      // 靠背在面朝方向的反面
      const bu = cu - du * (s - 0.03);
      const bv = cv - dv * (s - 0.03);
      const hu = du !== 0 ? 0.03 : s;
      const hv = dv !== 0 ? 0.03 : s;
      this.box(bu - hu, bv - hv, bu + hu, bv + hv, sh, sh + 0.42, 'prop', color);
    }
    this.solid(cu - s, cv - s, cu + s, cv + s, sh);
    this.addSeat(cu, cv, sh, du, dv);
  }

  addSeat(cu: number, cv: number, sh: number, du: number, dv: number) {
    const f = this.f;
    if (cv >= 0) this.seatLocal.push([cu, cv]);
    this.seats.push({
      id: `${f.shop.id}-seat-${this.seats.length}`,
      x: f.x(cu, cv),
      y: f.y + sh,
      z: f.z(cu, cv),
      yaw: f.yaw(du, dv),
      floor: f.shop.floor,
    });
  }

  /** 吧台凳（没有靠背，座面高） */
  stool(cu: number, cv: number, du: number, dv: number, color = '#3d405b') {
    this.chair(cu, cv, du, dv, { color, seatH: 0.72, back: false, w: 0.36 });
  }

  /** 两人或四人桌带椅子；axis 是桌子长边 */
  tableSet(cu: number, cv: number, seats: 2 | 4, o: { axis?: 'u' | 'v'; color?: string; chair?: string; top?: string } = {}) {
    const axis = o.axis ?? 'u';
    const long = seats === 4 ? 1.2 : 0.7;
    const w = axis === 'u' ? long : 0.75;
    const d = axis === 'u' ? 0.75 : long;
    this.table(cu, cv, w, d, { color: o.color, top: o.top });
    const off = 0.68;
    const chair = { color: o.chair };
    const along = seats === 4 ? [-0.3, 0.3] : [0];
    for (const a of along) {
      if (axis === 'u') {
        this.chair(cu + a, cv - off, 0, 1, chair);
        this.chair(cu + a, cv + off, 0, -1, chair);
      } else {
        this.chair(cu - off, cv + a, 1, 0, chair);
        this.chair(cu + off, cv + a, -1, 0, chair);
      }
    }
  }

  /** 沙发/长凳：沿 axis 从 a0 到 a1，人面朝 (du, dv)；每 0.6 m 一个座位 */
  sofa(axis: 'u' | 'v', a0: number, a1: number, c: number, du: number, dv: number, color = '#5e6472', seatH = 0.44) {
    const depth = 0.7;
    // 座面从 c 往面朝方向延伸
    const back = axis === 'u' ? dv : du;
    const c0 = c;
    const c1 = c + back * depth;
    const R = (p0: number, p1: number, q0: number, q1: number, h0: number, h1: number, tint: string) =>
      axis === 'u' ? this.box(p0, Math.min(q0, q1), p1, Math.max(q0, q1), h0, h1, 'prop', tint) : this.box(Math.min(q0, q1), p0, Math.max(q0, q1), p1, h0, h1, 'prop', tint);
    R(a0, a1, c0, c1, 0, seatH, color);
    R(a0, a1, c0, c0 + back * 0.18, seatH, seatH + 0.45, shade(color, 0.9));
    R(a0, a0 + 0.14, c0, c1, seatH, seatH + 0.2, shade(color, 0.9));
    R(a1 - 0.14, a1, c0, c1, seatH, seatH + 0.2, shade(color, 0.9));
    if (axis === 'u') this.solid(a0, Math.min(c0, c1), a1, Math.max(c0, c1), seatH);
    else this.solid(Math.min(c0, c1), a0, Math.max(c0, c1), a1, seatH);
    const n = Math.max(1, Math.floor((a1 - a0 - 0.3) / 0.6));
    const step = (a1 - a0) / n;
    const mid = c + back * (depth / 2 + 0.05);
    for (let i = 0; i < n; i++) {
      const a = a0 + step * (i + 0.5);
      if (axis === 'u') this.addSeat(a, mid, seatH, du, dv);
      else this.addSeat(mid, a, seatH, du, dv);
    }
  }

  /** 无靠背长凳/皮墩：沿 axis 从 a0 到 a1，c 是中线，人面朝 (du, dv)；每 0.6 m 一个座位 */
  bench(axis: 'u' | 'v', a0: number, a1: number, c: number, du: number, dv: number, o: { color?: string; seatH?: number; depth?: number } = {}) {
    const sh = o.seatH ?? 0.45;
    const hd = (o.depth ?? 0.45) / 2;
    const color = o.color ?? '#8d6e63';
    const [u0, v0, u1, v1] = axis === 'u' ? [a0, c - hd, a1, c + hd] : [c - hd, a0, c + hd, a1];
    this.box(u0, v0, u1, v1, sh - 0.08, sh, 'prop', color);
    this.box(u0 + 0.06, v0 + 0.06, u1 - 0.06, v1 - 0.06, 0, sh - 0.08, 'prop', shade(color, 0.7));
    this.solid(u0, v0, u1, v1, sh);
    const n = Math.max(1, Math.floor((a1 - a0 + 0.1) / 0.6));
    for (let i = 0; i < n; i++) {
      const a = a0 + ((a1 - a0) * (i + 0.5)) / n;
      if (axis === 'u') this.addSeat(a, c, sh, du, dv);
      else this.addSeat(c, a, sh, du, dv);
    }
  }

  /** 平台展示桌（上面摆商品） */
  displayTable(cu: number, cv: number, w: number, d: number, o: { h?: number; color?: string; palette?: string[]; stacks?: boolean } = {}) {
    const h = o.h ?? 0.8;
    const color = o.color ?? '#efe6d8';
    this.box(cu - w / 2, cv - d / 2, cu + w / 2, cv + d / 2, 0, h, 'prop', color);
    this.box(cu - w / 2 + 0.05, cv - d / 2 + 0.05, cu + w / 2 - 0.05, cv + d / 2 - 0.05, 0, 0.1, 'prop', shade(color, 0.8));
    this.solid(cu - w / 2, cv - d / 2, cu + w / 2, cv + d / 2, h);
    const palette = o.palette ?? DEFAULT_PALETTE;
    if (palette.length === 0) return;
    const nu = Math.max(1, Math.floor(w / 0.4));
    const nv = Math.max(1, Math.floor(d / 0.4));
    for (let i = 0; i < nu; i++)
      for (let j = 0; j < nv; j++) {
        if (this.rng() < 0.15) continue;
        const pu = cu - w / 2 + (i + 0.5) * (w / nu);
        const pv = cv - d / 2 + (j + 0.5) * (d / nv);
        const hh = o.stacks ? this.range(0.08, 0.3) : this.range(0.05, 0.16);
        this.product(pu, pv, h, (w / nu) * 0.78, hh, (d / nv) * 0.78, true, this.pick(palette));
      }
  }

  /** 挂衣杆：沿 axis 从 a0 到 a1，c 是杆的位置；挂一排衣服 */
  rack(axis: 'u' | 'v', a0: number, a1: number, c: number, o: { h?: number; palette?: string[] } = {}) {
    const h = o.h ?? 1.5;
    const R = (p0: number, p1: number, q0: number, q1: number, h0: number, h1: number, mat: MatKey, tint?: string) =>
      axis === 'u' ? this.box(p0, q0, p1, q1, h0, h1, mat, tint) : this.box(q0, p0, q1, p1, h0, h1, mat, tint);
    R(a0, a0 + 0.04, c - 0.02, c + 0.02, 0, h, 'metal');
    R(a1 - 0.04, a1, c - 0.02, c + 0.02, 0, h, 'metal');
    R(a0, a1, c - 0.015, c + 0.015, h - 0.04, h, 'metal');
    R(a0 - 0.1, a0 + 0.14, c - 0.25, c + 0.25, 0, 0.03, 'metal');
    R(a1 - 0.14, a1 + 0.1, c - 0.25, c + 0.25, 0, 0.03, 'metal');
    if (axis === 'u') this.solid(a0, c - 0.28, a1, c + 0.28, h);
    else this.solid(c - 0.28, a0, c + 0.28, a1, h);
    const palette = o.palette ?? APPAREL;
    let a = a0 + 0.12;
    while (a < a1 - 0.12) {
      const len = this.range(0.55, 0.85);
      const col = this.pick(palette);
      // 衣服：薄片，垂直于杆
      if (axis === 'u') this.product(a, c, h - 0.06 - len, 0.05, len, 0.46, true, col);
      else this.product(c, a, h - 0.06 - len, 0.05, len, 0.46, false, col);
      a += this.range(0.07, 0.12);
    }
  }

  /** 冷柜（玻璃门、亮内胆）：靠墙，沿 axis，face 朝向通道 */
  /**
   * 冷柜：靠墙，沿 axis，face 朝向通道。
   * open：敞开式多层冷柜（蔬果、鲜鱼、精肉，没有玻璃门，下沿一道挡板，顶上灯条）；
   * trays：商品是白色托盘装（生鲜），否则是瓶罐。
   */
  fridge(axis: 'u' | 'v', a0: number, a1: number, c: number, face: 1 | -1, palette = DRINKS, o: { open?: boolean; trays?: boolean; levels?: number; item?: { w: [number, number]; h: [number, number] } } = {}) {
    const depth = o.open ? 0.9 : 0.75;
    const h = o.open ? 2.0 : 2.1;
    const c1 = c + face * depth;
    const R = (p0: number, p1: number, q0: number, q1: number, h0: number, h1: number, mat: MatKey, tint?: string) =>
      axis === 'u' ? this.box(p0, Math.min(q0, q1), p1, Math.max(q0, q1), h0, h1, mat, tint) : this.box(Math.min(q0, q1), p0, Math.max(q0, q1), p1, h0, h1, mat, tint);
    R(a0, a1, c, c + face * 0.08, 0, h, 'prop', '#dfe7ec');
    R(a0, a1, c, c1, 0, 0.18, 'prop', '#9aa5b1');
    R(a0, a1, c, c + face * (o.open ? 0.5 : depth), h - 0.22, h, 'prop', '#9aa5b1');
    R(a0, a0 + 0.05, c, c1, 0, h, 'prop', '#c3ccd5');
    R(a1 - 0.05, a1, c, c1, 0, h, 'prop', '#c3ccd5');
    if (o.open) {
      // 下沿挡板 + 顶上灯条
      R(a0, a1, c1 - face * 0.05, c1, 0.18, 0.45, 'prop', '#e9ecef');
      R(a0, a1, c + face * 0.45, c + face * 0.5, h - 0.25, h - 0.22, 'prop', '#fff8e1');
    } else {
      // 门框竖条
      for (let a = a0 + 0.75; a < a1 - 0.3; a += 0.75) R(a - 0.02, a + 0.02, c1 - face * 0.03, c1, 0.18, h - 0.22, 'metal');
      R(a0, a1, c1 - face * 0.02, c1, 0.18, h - 0.22, 'glass');
    }
    if (axis === 'u') this.solid(a0, Math.min(c, c1), a1, Math.max(c, c1), h);
    else this.solid(Math.min(c, c1), a0, Math.max(c, c1), a1, h);
    // 内部隔板和商品：敞开式越往下越深（阶梯）
    const levels = o.levels ?? (o.open ? 4 : 5);
    const base = o.open ? 0.45 : 0.2;
    const top = h - 0.4;
    const gap = (top - base) / levels;
    const item = o.item ?? (o.trays ? { w: [0.22, 0.28] as [number, number], h: [0.05, 0.08] as [number, number] } : { w: [0.07, 0.11] as [number, number], h: [0.2, 0.28] as [number, number] });
    for (let i = 0; i < levels; i++) {
      const hh0 = base + i * gap;
      const d = o.open ? (depth - 0.15) * (1 - i * 0.12) : depth - 0.12;
      const pc = c + face * 0.08;
      R(a0 + 0.05, a1 - 0.05, pc, pc + face * d, hh0 - 0.02, hh0, 'prop', '#eef3f6');
      const mid = pc + face * (d / 2);
      let a = a0 + 0.08;
      while (a < a1 - 0.1) {
        const w = Math.min(this.range(item.w[0], item.w[1]), a1 - 0.08 - a);
        if (w < item.w[0] * 0.8) break;
        const hh = this.range(item.h[0], Math.min(item.h[1], gap - 0.05));
        const col = this.pick(palette);
        if (o.trays) {
          // 白托盘 + 上面一层食材颜色
          if (axis === 'u') {
            this.product(a + w / 2, mid, hh0, w * 0.9, 0.025, d * 0.75, true, '#ffffff');
            this.product(a + w / 2, mid, hh0 + 0.025, w * 0.7, hh - 0.025, d * 0.55, true, col);
          } else {
            this.product(mid, a + w / 2, hh0, w * 0.9, 0.025, d * 0.75, false, '#ffffff');
            this.product(mid, a + w / 2, hh0 + 0.025, w * 0.7, hh - 0.025, d * 0.55, false, col);
          }
        } else if (axis === 'u') this.product(a + w / 2, mid, hh0, w * 0.85, hh, d * 0.8, true, col);
        else this.product(mid, a + w / 2, hh0, w * 0.85, hh, d * 0.8, false, col);
        a += w;
      }
    }
  }

  /** 墙面装饰色块（海报位、菜单板），贴在 v=D 的后墙或两侧墙上 */
  panel(axis: 'u' | 'v', a0: number, a1: number, c: number, face: 1 | -1, h0: number, h1: number, tint: string) {
    if (axis === 'u') this.box(a0, Math.min(c, c + face * 0.04), a1, Math.max(c, c + face * 0.04), h0, h1, 'prop', tint);
    else this.box(Math.min(c, c + face * 0.04), a0, Math.max(c, c + face * 0.04), a1, h0, h1, 'prop', tint);
  }

  /** 绿植（盆 + 一团叶子），装饰用 */
  plant(cu: number, cv: number, size = 1) {
    const s = 0.22 * size;
    this.box(cu - s, cv - s, cu + s, cv + s, 0, 0.42 * size, 'prop', '#c9a27e');
    this.box(cu - s * 1.7, cv - s * 1.7, cu + s * 1.7, cv + s * 1.7, 0.42 * size, 1.1 * size, 'prop', '#6aa56b');
    this.box(cu - s * 1.1, cv - s * 1.1, cu + s * 1.1, cv + s * 1.1, 1.1 * size, 1.45 * size, 'prop', '#7fbf7f');
    this.solid(cu - s, cv - s, cu + s, cv + s, 0.42 * size);
  }
}

export const DEFAULT_PALETTE = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#f78c6b', '#83c5be', '#e5989b', '#b5838d', '#ffffff', '#ffb4a2'];
export const APPAREL = ['#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51', '#f1faee', '#a8dadc', '#457b9d', '#d6ccc2', '#6d6875'];
export const DRINKS = ['#e63946', '#f1faee', '#a8dadc', '#ffb703', '#8ecae6', '#90be6d', '#f8961e', '#ffffff'];

function overlap(a: LRect, b: LRect, tol: number) {
  return a[0] < b[2] - tol && b[0] < a[2] - tol && a[1] < b[3] - tol && b[1] < a[3] - tol;
}

export function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}
