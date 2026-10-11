import type { I18nText, MallLayout, ShopCategory } from '../data/layoutTypes.ts';
import { containsPoint } from './rectOps.ts';

export interface ZoneInfo {
  /** 用于判断区域是否变化 */
  key: string;
  floor: number;
  kind: 'shop' | 'facility' | 'stairs' | 'public' | 'corridor' | 'outside';
  id: string;
  /** 店铺英文名（店铺才有） */
  shopName?: string;
  category?: ShopCategory;
  /** 非店铺区域的双语名称 */
  label?: I18nText;
}

/** 根据玩家脚底位置判断所在楼层和区域。每层只有十几个矩形，直接做点包含测试。 */
export class ZoneIndex {
  constructor(private readonly layout: MallLayout) {}

  floorAt(yFeet: number): number {
    const n = this.layout.floors.length;
    const f = Math.floor((yFeet + 0.25) / this.layout.building.floorHeight);
    return Math.max(0, Math.min(n - 1, f));
  }

  locate(x: number, yFeet: number, z: number): ZoneInfo {
    const L = this.layout;
    const floor = this.floorAt(yFeet);

    // 楼梯间优先：5F 西侧楼梯间在空中花园范围内
    for (const st of L.circulation.stairs) {
      if (floor >= st.floors[0] && floor <= st.floors[1] && containsPoint(st.rect, x, z)) {
        return { key: `stairs:${st.id}:${floor}`, floor, kind: 'stairs', id: st.id, label: st.label };
      }
    }
    for (const s of L.shops) {
      if (s.floor === floor && containsPoint(s.rect, x, z)) {
        return { key: `shop:${s.id}`, floor, kind: 'shop', id: s.id, shopName: s.name, category: s.category };
      }
    }
    for (const f of L.facilities) {
      if (f.floor === floor && containsPoint(f.rect, x, z)) {
        return { key: `fac:${f.id}`, floor, kind: 'facility', id: f.id, label: f.label };
      }
    }
    for (const p of L.publicZones) {
      if ((!p.floors || p.floors.includes(floor)) && containsPoint(p.rect, x, z)) {
        return { key: `pub:${p.id}:${floor}`, floor, kind: 'public', id: p.id, label: p.label };
      }
    }
    if (!containsPoint(L.building.outline, x, z)) {
      return { key: `outside:${floor}`, floor, kind: 'outside', id: 'outside' };
    }
    return { key: `corridor:${floor}`, floor, kind: 'corridor', id: 'corridor' };
  }
}
