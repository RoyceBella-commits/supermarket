import type { MallLayout, Opening, Rect } from './layoutTypes.ts';
import { containsPoint, containsRect, edgeOf, openingCenter, overlaps } from '../world/rectOps.ts';

export const EXPECTED_SHOP_COUNT = 19;

interface Placed {
  id: string;
  floor: number;
  rect: Rect;
  outdoor: boolean;
  entrances: Opening[];
}

/** 检查布局数据，返回问题列表（空数组表示没问题）。只在开发模式调用。 */
export function validateLayout(layout: MallLayout): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const checkId = (id: string) => {
    if (ids.has(id)) problems.push(`重复的 id：${id}`);
    ids.add(id);
  };

  if (layout.shops.length !== EXPECTED_SHOP_COUNT) {
    problems.push(`店铺数是 ${layout.shops.length}，应为 ${EXPECTED_SHOP_COUNT}`);
  }

  const placed: Placed[] = [];
  for (const s of layout.shops) {
    checkId(s.id);
    placed.push({ id: s.id, floor: s.floor, rect: s.rect, outdoor: s.kind === 'outdoor', entrances: s.entrances });
  }
  for (const f of layout.facilities) {
    checkId(f.id);
    placed.push({ id: f.id, floor: f.floor, rect: f.rect, outdoor: false, entrances: f.entrances });
  }
  const stairFootprints: Placed[] = [];
  for (const st of layout.circulation.stairs) {
    checkId(st.id);
    const long = Math.max(st.rect.w, st.rect.d);
    const short = Math.min(st.rect.w, st.rect.d);
    if (Math.abs(long - 9) > 1e-6 || Math.abs(short - 3.6) > 1e-6) problems.push(`${st.id}：楼梯间尺寸必须是 3.6 × 9`);
    const alongX = st.rect.w > st.rect.d;
    if (alongX !== (st.front === 'E' || st.front === 'W')) problems.push(`${st.id}：门的朝向要在短边上`);
    for (let f = st.floors[0]; f <= st.floors[1]; f++) {
      stairFootprints.push({ id: st.id, floor: f, rect: st.rect, outdoor: false, entrances: [] });
    }
  }
  for (const z of layout.publicZones) checkId(z.id);

  for (const p of placed) {
    const floor = layout.floors.find((f) => f.level === p.floor);
    if (!floor) {
      problems.push(`${p.id}：楼层 ${p.floor} 不存在`);
      continue;
    }
    const inside = p.outdoor
      ? (floor.outdoor ?? []).some((o) => containsRect(o, p.rect))
      : containsRect(floor.indoor, p.rect);
    if (!inside) problems.push(`${p.id}：超出了 ${floor.label} 的${p.outdoor ? '室外' : '室内'}范围`);
  }

  // 同层重叠：店铺、设施、楼梯间、中庭两两不重叠（室外区域里允许有楼梯间）
  const byFloor = (f: number) => [...placed, ...stairFootprints].filter((p) => p.floor === f);
  for (const floor of layout.floors) {
    const items = byFloor(floor.level);
    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      if (!a.outdoor && overlaps(a.rect, layout.atrium.rect)) problems.push(`${a.id}：和中庭重叠（${floor.label}）`);
      for (let j = i + 1; j < items.length; j++) {
        const b = items[j];
        if (a.id === b.id) continue;
        const stairInOutdoor = (a.outdoor && b.id.startsWith('stairs')) || (b.outdoor && a.id.startsWith('stairs'));
        if (!stairInOutdoor && overlaps(a.rect, b.rect)) problems.push(`${a.id} 和 ${b.id} 重叠（${floor.label}）`);
      }
    }
  }

  // 门洞：要放得进墙里，且门外 0.5 m 是走廊
  for (const p of placed) {
    if (p.outdoor) continue;
    const others = byFloor(p.floor).filter((o) => o.id !== p.id);
    const floor = layout.floors.find((f) => f.level === p.floor);
    for (const o of p.entrances) {
      const e = edgeOf(p.rect, o.side);
      if (o.offset < 0.3 || o.offset + o.width > e.length - 0.3) {
        problems.push(`${p.id}：${o.side} 侧的门洞超出墙的范围`);
        continue;
      }
      const c = openingCenter(p.rect, o);
      const px = c.x + c.outX * 0.5;
      const pz = c.z + c.outZ * 0.5;
      const blocked = others.find((q) => containsPoint(q.rect, px, pz, -1e-6) && !q.outdoor);
      if (blocked) problems.push(`${p.id}：门外是 ${blocked.id}，不是走廊`);
      if (floor && !containsPoint(floor.indoor, px, pz)) problems.push(`${p.id}：门开到了楼外`);
      if (p.floor > 0 && containsPoint(layout.atrium.rect, px, pz)) problems.push(`${p.id}：门开向中庭的空洞`);
    }
  }

  return problems;
}
