import * as THREE from 'three';
import type { MallLayout } from '../../data/layoutTypes.ts';
import type { StaticBatch } from '../StaticBatch.ts';
import type { Seat } from '../../systems/Seats.ts';
import { Kit, ProductSet, ShopFrame, getProductMaterial, seededRng, type NpcSpot } from './kit.ts';
import { TEMPLATES } from './templates.ts';

export interface BuiltInteriors {
  /** 每家店一个商品 InstancedMesh，userData.floor 是楼层 */
  products: THREE.Group;
  seats: Seat[];
  /** 模板给店员安排的位置（收银台后面等），按店铺 id */
  npcSpots: Map<string, NpcSpot>;
}

/** 按店铺品类套模板生成店内家具和商品 */
export function buildInteriors(layout: MallLayout, batch: StaticBatch): BuiltInteriors {
  const H = layout.building.floorHeight;
  const products = new THREE.Group();
  products.name = 'products';
  const seats: Seat[] = [];
  const npcSpots = new Map<string, NpcSpot>();
  const material = getProductMaterial();
  for (const shop of layout.shops) {
    const template = TEMPLATES[shop.category];
    if (!template || shop.entrances.length === 0) continue;
    const set = new ProductSet();
    const kit = new Kit(new ShopFrame(shop, shop.floor * H), batch, set, seats, seededRng(shop.interior?.seed !== undefined ? `${shop.id}:${shop.interior.seed}` : shop.id));
    template(kit);
    if (kit.npcSpot) npcSpots.set(shop.id, kit.npcSpot);
    const mesh = set.build(material, `products:${shop.id}`);
    if (mesh) {
      mesh.userData.floor = shop.floor;
      products.add(mesh);
    }
  }
  return { products, seats, npcSpots };
}
