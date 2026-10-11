import type { MallLayout, Opening, Rect } from './layoutTypes.ts';
import { containsPoint, containsRect, edgeOf, openingCenter, overlaps } from '../world/rectOps.ts';
import { escalatorFootprint, escalatorFrame } from '../world/escalators.ts';

/** 规划里的主要店铺数（有店员 NPC 的那些） */
export const EXPECTED_MAIN_SHOPS = 21;

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

  const mainCount = layout.shops.filter((s) => s.tier === 'main').length;
  if (mainCount !== EXPECTED_MAIN_SHOPS) problems.push(`主要店铺数是 ${mainCount}，应为 ${EXPECTED_MAIN_SHOPS}`);

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
      // 中庭挑空从 fromFloor 往上；1F 的中庭位置是地面广场，也不能放东西
      for (const at of layout.atriums) {
        if (floor.level >= at.fromFloor - 1 && !a.outdoor && overlaps(a.rect, at.rect)) problems.push(`${a.id}：和中庭 ${at.id} 重叠（${floor.label}）`);
      }
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
      for (const at of layout.atriums) {
        if (p.floor >= at.fromFloor && containsPoint(at.rect, px, pz)) problems.push(`${p.id}：门开向中庭 ${at.id} 的空洞`);
      }
    }
  }

  // 设施：在室内范围里，不压到店铺、房间、楼梯间，也不挡住门口
  for (const a of layout.amenities) {
    checkId(a.id);
    const floor = layout.floors.find((f) => f.level === a.floor);
    if (!floor) {
      problems.push(`${a.id}：楼层 ${a.floor} 不存在`);
      continue;
    }
    if (!containsRect(floor.indoor, a.rect)) problems.push(`${a.id}：超出了 ${floor.label} 的室内范围`);
    for (const p of byFloor(a.floor)) {
      if (overlaps(a.rect, p.rect)) problems.push(`${a.id} 和 ${p.id} 重叠（${floor.label}）`);
      for (const o of p.entrances) {
        const c = openingCenter(p.rect, o);
        const door: Rect = { x: c.x - o.width / 2 - 0.5, z: c.z - o.width / 2 - 0.5, w: o.width + 1, d: o.width + 1 };
        const front: Rect = { x: c.x + c.outX * 1 - 1, z: c.z + c.outZ * 1 - 1, w: 2, d: 2 };
        if (overlaps(a.rect, front) && overlaps(a.rect, door)) problems.push(`${a.id} 挡住了 ${p.id} 的门口`);
      }
    }
  }

  // 扶梯（含两端踏板）和电梯井道不能压到店铺、设施、楼梯间
  const H = layout.building.floorHeight;
  for (const e of layout.circulation.escalators) {
    checkId(e.id);
    const f = escalatorFrame(e, H);
    const fp = escalatorFootprint(f);
    const rect: Rect = { x: fp.x0, z: fp.z0, w: fp.x1 - fp.x0, d: fp.z1 - fp.z0 };
    for (const lvl of [e.fromFloor, e.fromFloor + 1]) {
      for (const p of byFloor(lvl)) if (overlaps(rect, p.rect)) problems.push(`${e.id} 和 ${p.id} 重叠（第 ${lvl} 层）`);
      for (const a of layout.amenities) if (a.floor === lvl && overlaps(rect, a.rect)) problems.push(`${e.id} 和 ${a.id} 重叠`);
    }
  }
  for (const el of layout.circulation.elevators) {
    checkId(el.id);
    for (const lvl of el.floors) {
      for (const p of byFloor(lvl)) if (overlaps(el.rect, p.rect)) problems.push(`${el.id} 和 ${p.id} 重叠（第 ${lvl} 层）`);
      for (const a of layout.amenities) if (a.floor === lvl && overlaps(el.rect, a.rect)) problems.push(`${el.id} 和 ${a.id} 重叠`);
    }
  }

  return problems;
}
