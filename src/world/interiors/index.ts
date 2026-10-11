import * as THREE from 'three';
import { floorByLevel, type MallLayout, type ShopDef, type Side } from '../../data/layoutTypes.ts';
import { sideOnBoundary } from '../rectOps.ts';
import type { StaticBatch } from '../StaticBatch.ts';
import type { Seat } from '../../systems/Seats.ts';
import { Kit, ProductSet, ShopFrame, getProductMaterial, seededRng, type DecorSlot, type NpcSpot, type WallFaces } from './kit.ts';
import { TEMPLATES } from './templates.ts';

export interface BuiltInteriors {
  /** 每家店一个商品 InstancedMesh，userData.floor 是楼层 */
  products: THREE.Group;
  seats: Seat[];
  /** 模板给店员安排的位置（收银台后面等），按店铺 id */
  npcSpots: Map<string, NpcSpot>;
  /** 海报、菜单、书封等装饰图的位置（图片在运行时加载） */
  decor: DecorSlot[];
}

/** 按店铺品类套模板生成店内家具和商品 */
export function buildInteriors(layout: MallLayout, batch: StaticBatch): BuiltInteriors {
  const H = layout.building.floorHeight;
  const products = new THREE.Group();
  products.name = 'products';
  const seats: Seat[] = [];
  const npcSpots = new Map<string, NpcSpot>();
  const decor: DecorSlot[] = [];
  const material = getProductMaterial();
  for (const shop of layout.shops) {
    const template = TEMPLATES[shop.category];
    if (!template || shop.entrances.length === 0) continue;
    const set = new ProductSet();
    const frame = new ShopFrame(shop, shop.floor * H, wallFaces(layout, shop));
    const kit = new Kit(frame, batch, set, seats, seededRng(shop.interior?.seed !== undefined ? `${shop.id}:${shop.interior.seed}` : shop.id), decor);
    template(kit);
    // 通用的墙面海报位：两侧墙中部、后墙正中，都在货架上方
    if (shop.kind !== 'outdoor' && kit.D > 6) {
      kit.wallArt('left', kit.D * 0.5, 2.45, 1.7, 2.4, 'portrait');
      kit.wallArt('right', kit.D * 0.5, 2.45, 1.7, 2.4, 'portrait');
      kit.wallArt('back', kit.W / 2, 3.0, Math.min(3.9, kit.W - 2), 2.4, 'landscape');
    }
    if (kit.npcSpot) npcSpots.set(shop.id, kit.npcSpot);
    const mesh = set.build(material, `products:${shop.id}`);
    if (mesh) {
      mesh.userData.floor = shop.floor;
      products.add(mesh);
    }
  }
  return { products, seats, npcSpots, decor };
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
