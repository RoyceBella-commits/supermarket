import * as THREE from 'three';
import { floorByLevel, type MallLayout, type ShopDef, type Side } from '../../data/layoutTypes.ts';
import { sideOnBoundary } from '../rectOps.ts';
import type { StaticBatch } from '../StaticBatch.ts';
import type { Seat } from '../../systems/Seats.ts';
import { Kit, ProductSet, ShopFrame, getProductMaterial, seededRng, type DecorSlot, type GlowPoint, type NpcSpot, type SpecialSpot, type WallFaces } from './kit.ts';
import { TEMPLATES } from './templates/index.ts';

export interface BuiltInteriors {
  /** 每家店一个商品 InstancedMesh，userData.floor 是楼层 */
  products: THREE.Group;
  seats: Seat[];
  /** 模板给店员安排的位置（收银台后面等），按店铺 id */
  npcSpots: Map<string, NpcSpot>;
  /** 海报、菜单、书封等装饰图的位置（图片在运行时加载） */
  decor: DecorSlot[];
  /** 后墙的 logo 灯箱位置（招牌贴图由 signs.ts 画） */
  backLogos: BackLogo[];
  /** 开发检查发现的问题：家具重叠、座位或店员走不到 */
  issues: string[];
  /** 夜里会亮的灯 */
  glows: GlowPoint[];
  /** 影院银幕、卡丁车赛道等特殊位置 */
  specials: SpecialSpot[];
}

export interface BackLogo {
  shopId: string;
  floor: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  height: number;
  maxWidth: number;
}

/** 按店铺品类套模板生成店内家具和商品 */
export function buildInteriors(layout: MallLayout, batch: StaticBatch): BuiltInteriors {
  const H = layout.building.floorHeight;
  const products = new THREE.Group();
  products.name = 'products';
  const seats: Seat[] = [];
  const npcSpots = new Map<string, NpcSpot>();
  const decor: DecorSlot[] = [];
  const backLogos: BackLogo[] = [];
  const issues: string[] = [];
  const glows: GlowPoint[] = [];
  const specials: SpecialSpot[] = [];
  const material = getProductMaterial();
  for (const shop of layout.shops) {
    const template = TEMPLATES[shop.category];
    if (!template || shop.entrances.length === 0) continue;
    const set = new ProductSet();
    const frame = new ShopFrame(shop, shop.floor * H, wallFaces(layout, shop));
    const kit = new Kit(frame, batch, set, seats, seededRng(shop.interior?.seed !== undefined ? `${shop.id}:${shop.interior.seed}` : shop.id), decor);
    kit.outdoor = shop.kind === 'outdoor';
    template(kit);
    if (shop.kind !== 'outdoor' && kit.D > 6) {
      // 通用的墙面海报位：两侧墙中部、后墙正中，都在货架上方
      kit.wallArt('left', kit.D * 0.5, 2.45, 1.7, 2.4, 'portrait');
      kit.wallArt('right', kit.D * 0.5, 2.45, 1.7, 2.4, 'portrait');
      kit.wallArt('back', kit.W / 2, 3.45, Math.min(3.9, kit.W - 2), 1.9, 'landscape');
      // 后墙的“磁石”：模板没做别的，就挂一块店铺 logo 灯箱，从走廊一眼能看到
      if (!kit.backFeature) {
        const off = frame.walls.back + 0.03;
        backLogos.push({
          shopId: shop.id,
          floor: shop.floor,
          x: frame.x(kit.W / 2, kit.D - off),
          y: shop.floor * H + 2.85,
          z: frame.z(kit.W / 2, kit.D - off),
          yaw: frame.yaw(0, -1),
          height: 0.75,
          maxWidth: Math.min(5, kit.W - 2),
        });
      }
    }
    if (import.meta.env.DEV) {
      for (const msg of new Set([...kit.issues, ...checkReachable(kit)])) issues.push(`${shop.id}: ${msg}`);
    }
    if (kit.npcSpot) npcSpots.set(shop.id, kit.npcSpot);
    glows.push(...kit.glows);
    specials.push(...kit.specials);
    for (const mesh of set.build(kit.outdoor ? getProductMaterial(true) : material, `products:${shop.id}`)) {
      mesh.userData.floor = shop.floor;
      products.add(mesh);
    }
  }
  return { products, seats, npcSpots, decor, backLogos, issues, glows, specials };
}

/**
 * 连通检查：把家具占地按玩家胶囊半径膨胀后栅格化，从门口洪水填充，
 * 看每个座位旁边（1.3 m 内）和店员附近（2.0 m 内）有没有能站的地方。
 */
function checkReachable(kit: Kit): string[] {
  const res = 0.1;
  const r = 0.28;
  const { W, D } = kit;
  const nu = Math.ceil(W / res);
  const nv = Math.ceil(D / res);
  const blocked = new Uint8Array(nu * nv);
  const walls = kit.f.walls;
  const door = kit.f.door;
  for (let j = 0; j < nv; j++) {
    const v = (j + 0.5) * res;
    for (let i = 0; i < nu; i++) {
      const u = (i + 0.5) * res;
      const outside = u - r < walls.left || u + r > W - walls.right || v + r > D - walls.back || (v - r < 0.15 && (u - r < door.u0 || u + r > door.u1));
      if (outside) blocked[j * nu + i] = 1;
    }
  }
  for (const [u0, v0, u1, v1] of kit.solids) {
    const i0 = Math.max(0, Math.floor((u0 - r) / res));
    const i1 = Math.min(nu - 1, Math.floor((u1 + r) / res));
    const j0 = Math.max(0, Math.floor((v0 - r) / res));
    const j1 = Math.min(nv - 1, Math.floor((v1 + r) / res));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) blocked[j * nu + i] = 1;
  }
  const seen = new Uint8Array(nu * nv);
  const start = Math.floor((door.u0 + door.u1) / 2 / res) + Math.floor(0.4 / res) * nu;
  const out: string[] = [];
  if (blocked[start]) return ['门口被挡住了'];
  const queue = [start];
  seen[start] = 1;
  while (queue.length) {
    const c = queue.pop()!;
    const i = c % nu;
    const j = (c - i) / nu;
    for (const n of [i > 0 ? c - 1 : -1, i < nu - 1 ? c + 1 : -1, j > 0 ? c - nu : -1, j < nv - 1 ? c + nu : -1]) {
      if (n >= 0 && !seen[n] && !blocked[n]) {
        seen[n] = 1;
        queue.push(n);
      }
    }
  }
  const near = (u: number, v: number, dist: number) => {
    const k = Math.ceil(dist / res);
    const ci = Math.floor(u / res);
    const cj = Math.floor(v / res);
    for (let j = Math.max(0, cj - k); j <= Math.min(nv - 1, cj + k); j++)
      for (let i = Math.max(0, ci - k); i <= Math.min(nu - 1, ci + k); i++) {
        if (!seen[j * nu + i]) continue;
        if (Math.hypot((i + 0.5) * res - u, (j + 0.5) * res - v) <= dist) return true;
      }
    return false;
  };
  const lost = kit.seatLocal.filter(([u, v]) => !near(u, v, 1.3));
  if (lost.length) out.push(`${lost.length} 个座位走不到，例如 (${lost[0][0].toFixed(1)}, ${lost[0][1].toFixed(1)})`);
  if (kit.staffLocal && !near(kit.staffLocal[0], kit.staffLocal[1], 2.0)) out.push('店员面前没有能站着说话的地方');
  return out;
}

/** 店门那面是“前”，按门的方向换算左墙/右墙/后墙对应的世界方向；外墙在矩形外面，隔墙在里面 */
function wallFaces(layout: MallLayout, shop: ShopDef): WallFaces {
  const door = shop.entrances[0].side;
  const ns = door === 'N' || door === 'S';
  const sides: Record<keyof WallFaces, Side> = {
    left: ns ? 'W' : 'N',
    right: ns ? 'E' : 'S',
    back: ({ N: 'S', S: 'N', E: 'W', W: 'E' } as const)[door],
  };
  const indoor = floorByLevel(layout, shop.floor).indoor;
  const t = layout.building.partition;
  const face = (side: Side) => (sideOnBoundary(shop.rect, side, indoor) ? 0 : t);
  return { left: face(sides.left), right: face(sides.right), back: face(sides.back) };
}
