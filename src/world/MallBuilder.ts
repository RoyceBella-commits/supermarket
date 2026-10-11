import * as THREE from 'three';
import { ESCALATOR, floorByLevel, levelRange, type FloorDef, type MallLayout, type Opening, type Rect, type ShopDef, type Side } from '../data/layoutTypes.ts';
import type { PhysicsWorld } from '../systems/physics/PhysicsWorld.ts';
import { createWorldMaterials } from '../render/worldMaterials.ts';
import { OUTSIDE_FLOOR, StaticBatch } from './StaticBatch.ts';
import { containsRect, sideOnBoundary } from './rectOps.ts';
import { addWall } from './walls.ts';
import { buildStairCore, stairHoles } from './stairs.ts';
import { buildSigns } from './signs.ts';
import { addSlab, type SurfaceRoom } from './surfaces.ts';
import { buildAmenities } from './amenities.ts';
import { buildEscalatorStatics, escalatorFrame } from './escalators.ts';
import { buildElevatorShaft } from './elevator.ts';

const SIDES: Side[] = ['N', 'S', 'E', 'W'];

export interface BuiltMall {
  root: THREE.Group;
  batch: StaticBatch;
}

/** 根据 mallLayout 生成整座灰盒商场：楼板、外墙、店铺空壳、栏杆、楼梯间、屋顶、广场和招牌。 */
export function buildMall(layout: MallLayout, physics: PhysicsWorld): BuiltMall {
  const b = layout.building;
  const H = b.floorHeight;
  const batch = new StaticBatch();
  const top = floorByLevel(layout, levelRange(layout).max);
  const roofY = (top.level + 1) * H;

  buildGround(layout, batch);
  for (const floor of layout.floors) {
    buildSlab(layout, floor, batch);
    buildExterior(layout, floor, batch, floor === top);
    buildOutdoorParapets(layout, floor, batch);
    for (const a of layout.atriums) if (floor.level >= a.fromFloor) buildAtriumRailing(layout, a.rect, floor.level, batch);
  }
  for (const shop of layout.shops) buildShopShell(layout, shop, batch);
  for (const f of layout.facilities) {
    const floor = floorByLevel(layout, f.floor);
    const tint = f.kind === 'vacant' ? '#c9b8e8' : undefined;
    buildRoomWalls(layout, floor, f.rect, f.entrances, 1, f.kind === 'vacant' ? 'hoarding' : 'wall', tint, batch);
  }
  for (const st of layout.circulation.stairs) {
    const outdoorAtTop = !containsRect(floorByLevel(layout, st.floors[1]).indoor, st.rect);
    buildStairCore(batch, st, H, b.slab, outdoorAtTop, b.doorHeight);
  }
  buildAmenities(layout, batch);
  buildEscalatorStatics(layout, batch);
  for (const el of layout.circulation.elevators) buildElevatorShaft(layout, el, batch);
  buildRoof(layout, top, roofY, batch);

  const root = batch.build(createWorldMaterials(), physics);
  root.add(buildSigns(layout));
  return { root, batch };
}

function buildGround(layout: MallLayout, batch: StaticBatch) {
  const o = layout.building.outline;
  const e = layout.building.extWall;
  const footprint: Rect = { x: o.x - e, z: o.z - e, w: o.w + 2 * e, d: o.d + 2 * e };
  const world: Rect = { x: -90, z: -80, w: 180, d: 180 };
  const p = layout.plaza;
  const plaza: Rect = { x: p.x, z: p.z + e, w: p.w, d: p.d - e };
  addSlab(batch, {
    floor: OUTSIDE_FLOOR,
    y: 0,
    thickness: 0.5,
    regions: [world],
    holes: [footprint],
    rooms: [{ rect: plaza, mat: 'plaza' }],
    topMat: 'ground',
    bottomMat: null,
    edgeMat: null,
  });

  // 广场三面：矮花坛（可见）+ 隐形高墙
  const x0 = plaza.x;
  const x1 = plaza.x + plaza.w;
  const z0 = plaza.z;
  const z1 = plaza.z + plaza.d;
  const planter = (ax: number, az: number, bx: number, bz: number) => {
    batch.box(ax, 0, az, bx, 0.6, bz, 'rail', OUTSIDE_FLOOR, 'solid', '#7fb069');
    batch.box(ax, 0.6, az, bx, 4, bz, 'rail', OUTSIDE_FLOOR, 'playerOnly');
  };
  planter(x0 - 0.6, z0, x0, z1 + 0.6);
  planter(x1, z0, x1 + 0.6, z1 + 0.6);
  planter(x0, z1, x1, z1 + 0.6);
}

/**
 * 楼板：走廊地面统一一种颜色，店铺地面用各自的浅主题色（边界正好在店门那条线上）；
 * 底面是下一层的天花板，整层统一用天花板材质，不受本层店铺划分影响。
 */
function buildSlab(layout: MallLayout, floor: FloorDef, batch: StaticBatch) {
  const b = layout.building;
  const holes: Rect[] = [...(floor.voids ?? [])];
  for (const a of layout.atriums) if (floor.level >= a.fromFloor) holes.push(a.rect);
  // 电梯井道穿过的楼板（最低停靠层以上）
  for (const el of layout.circulation.elevators) if (floor.level > Math.min(...el.floors) && floor.level <= Math.max(...el.floors)) holes.push(el.rect);
  for (const st of layout.circulation.stairs) holes.push(...stairHoles(st, floor.level));

  const rooms: SurfaceRoom[] = [];
  for (const s of layout.shops) {
    if (s.floor !== floor.level) continue;
    rooms.push(s.kind === 'outdoor' ? { rect: s.rect, mat: 'plaza', tint: '#a8d5a2' } : { rect: s.rect, mat: 'floorShop', tint: lighten(s.theme.primary, 0.8) });
  }
  for (const f of layout.facilities) {
    if (f.floor === floor.level) rooms.push({ rect: f.rect, mat: 'floorShop', tint: '#e4e7eb' });
  }

  addSlab(batch, {
    floor: floor.level,
    y: floor.level * b.floorHeight,
    thickness: b.slab,
    regions: [floor.indoor, ...(floor.outdoor ?? [])],
    holes,
    rooms,
    topMat: 'floor',
    bottomMat: floor.level > levelRange(layout).min ? 'ceiling' : null,
    edgeMat: 'slabEdge',
  });
}

/** 外墙沿室内范围的四边；和室外平台相邻的一边是带门和落地窗的分界墙。 */
function buildExterior(layout: MallLayout, floor: FloorDef, batch: StaticBatch, isTop: boolean) {
  const b = layout.building;
  const H = b.floorHeight;
  const y0 = floor.level * H - b.slab;
  const y1 = isTop ? (floor.level + 1) * H + 0.6 : (floor.level + 1) * H - b.slab;
  const r = floor.indoor;
  // 地下层的“外墙”从里面看就是普通墙面
  const mat = floor.level < 0 ? 'wall' : 'exterior';
  for (const side of SIDES) {
    const facingOutdoor = (floor.outdoor ?? []).some((o) => sideOnBoundary(r, side, o));
    const openings: Opening[] = [];
    if (floor.level === 0 && layout.mainEntrance.side === side && sideOnBoundary(r, side, layout.building.outline)) {
      openings.push(layout.mainEntrance);
    }
    if (facingOutdoor) openings.push(...(floor.facadeOpenings ?? []).filter((o) => o.side === side));
    // N/S 墙向两端各伸出一个墙厚，盖住转角
    const ext = side === 'N' || side === 'S' ? -b.extWall : 0;
    addWall(batch, {
      rect: r,
      side,
      y0,
      y1,
      thickness: b.extWall,
      placement: 'outside',
      trimStart: ext,
      trimEnd: ext,
      openings,
      defaultOpeningHeight: b.doorHeight,
      mat,
      floor: floor.level,
    });
  }
}

/** 室外平台外沿的女儿墙：可见 1.1 m，碰撞加高到 2.4 m，跳不出去。 */
function buildOutdoorParapets(layout: MallLayout, floor: FloorDef, batch: StaticBatch) {
  const b = layout.building;
  const y = floor.level * b.floorHeight;
  for (const o of floor.outdoor ?? []) {
    for (const side of SIDES) {
      if (sideOnBoundary(o, side, floor.indoor)) continue;
      const ext = side === 'N' || side === 'S' ? -b.extWall : 0;
      const common = { rect: o, side, thickness: b.extWall, placement: 'outside' as const, trimStart: ext, trimEnd: ext, defaultOpeningHeight: 0, floor: floor.level };
      addWall(batch, { ...common, y0: y - b.slab, y1: y + b.railHeight, mat: 'exterior' });
      addWallInvisible(batch, { ...common, y0: y + b.railHeight, y1: y + 2.4 });
    }
  }
}

function addWallInvisible(batch: StaticBatch, o: Omit<Parameters<typeof addWall>[1], 'mat'>) {
  const before = batch.boxes.length;
  addWall(batch, { ...o, mat: 'rail' });
  for (let i = before; i < batch.boxes.length; i++) batch.boxes[i].collide = 'playerOnly';
}

/** 中庭四周的玻璃栏杆：玻璃 + 扶手只显示，另加一道 2.4 m 高的隐形碰撞墙。 */
/**
 * 中庭四周的玻璃栏杆：玻璃 + 扶手只显示，另加一道 2.4 m 高的隐形碰撞墙（只挡人）。
 * 扶梯穿过挑空边沿、电梯厅门所在的位置留开口（那里由扶梯扶手板 / 电梯井道挡住）。
 */
function buildAtriumRailing(layout: MallLayout, a: Rect, level: number, batch: StaticBatch) {
  const b = layout.building;
  const H = b.floorHeight;
  const y = level * H;
  const t = 0.12;
  const x0 = a.x;
  const x1 = a.x + a.w;
  const z0 = a.z;
  const z1 = a.z + a.d;

  // 开口：[边, 起点, 终点]（N/S 边用 x，E/W 边用 z）
  const gaps: { side: Side; from: number; to: number }[] = [];
  for (const def of layout.circulation.escalators) {
    const f = escalatorFrame(def, H);
    for (const side of ['W', 'E'] as const) {
      if (f.dir.z !== 0) continue; // 目前扶梯都沿 x 方向
      const ex = side === 'W' ? x0 : x1;
      const u = (ex - def.foot.x) * f.dir.x;
      if (u < -ESCALATOR.plate || u > f.run + ESCALATOR.plate) continue;
      const surface = f.y0 + f.surfaceY(u);
      // 扶梯在这一层的行走高度附近穿过挑空边沿
      if (surface < y - 1.5 || surface > y + 1.8) continue;
      gaps.push({ side, from: def.foot.z - ESCALATOR.outerWidth / 2, to: def.foot.z + ESCALATOR.outerWidth / 2 });
    }
  }
  for (const el of layout.circulation.elevators) {
    if (!el.floors.includes(level)) continue;
    const r = el.rect;
    if (Math.abs(r.z + r.d - z1) < 0.01 || Math.abs(r.z - z0) < 0.01) {
      gaps.push({ side: Math.abs(r.z + r.d - z1) < 0.01 ? 'S' : 'N', from: r.x, to: r.x + r.w });
    }
  }

  const edges: { side: Side; along: 'x' | 'z'; from: number; to: number; box: (p: number, q: number) => [number, number, number, number] }[] = [
    { side: 'N', along: 'x', from: x0 - t, to: x1 + t, box: (p, q) => [p, z0 - t, q, z0] },
    { side: 'S', along: 'x', from: x0 - t, to: x1 + t, box: (p, q) => [p, z1, q, z1 + t] },
    { side: 'W', along: 'z', from: z0, to: z1, box: (p, q) => [x0 - t, p, x0, q] },
    { side: 'E', along: 'z', from: z0, to: z1, box: (p, q) => [x1, p, x1 + t, q] },
  ];
  for (const e of edges) {
    const cuts = gaps.filter((g) => g.side === e.side).sort((m, n) => m.from - n.from);
    let cursor = e.from;
    const pieces: [number, number][] = [];
    for (const g of cuts) {
      if (g.from > cursor) pieces.push([cursor, Math.min(g.from, e.to)]);
      cursor = Math.max(cursor, g.to);
    }
    if (cursor < e.to) pieces.push([cursor, e.to]);
    for (const [p, q] of pieces) {
      if (q - p < 0.05) continue;
      const [ax, az, bx, bz] = e.box(p, q);
      batch.box(ax, y, az, bx, y + 0.08, bz, 'rail', level, 'none');
      batch.box(ax, y + 0.08, az, bx, y + b.railHeight - 0.06, bz, 'glass', level, 'none');
      batch.box(ax, y + b.railHeight - 0.06, az, bx, y + b.railHeight + 0.02, bz, 'rail', level, 'none');
      batch.box(ax, y, az, bx, y + 2.4, bz, 'rail', level, 'playerOnly');
    }
  }
}

/** 店铺空壳：沿非外墙的各边做隔墙，入口一侧开门面。影院按挑高层数加高，并单独封顶。 */
function buildShopShell(layout: MallLayout, shop: ShopDef, batch: StaticBatch) {
  if (shop.kind === 'outdoor') return;
  const floor = floorByLevel(layout, shop.floor);
  buildRoomWalls(layout, floor, shop.rect, shop.entrances, shop.spanFloors ?? 1, 'wallShop', lighten(shop.theme.primary, 0.35), batch);
}

function buildRoomWalls(
  layout: MallLayout,
  floor: FloorDef,
  rect: Rect,
  entrances: Opening[],
  span: number,
  mat: 'wallShop' | 'wall' | 'hoarding',
  tint: string | undefined,
  batch: StaticBatch,
) {
  const b = layout.building;
  const H = b.floorHeight;
  const y0 = floor.level * H;
  const y1 = y0 + span * H - (span > 1 ? 0 : b.slab);
  const t = b.partition;
  const has = (side: Side) => !sideOnBoundary(rect, side, floor.indoor);
  for (const side of SIDES) {
    if (!has(side)) continue;
    // E/W 墙夹在 N/S 墙之间，转角不重叠
    const trimStart = side === 'E' || side === 'W' ? (has('N') ? t : 0) : 0;
    const trimEnd = side === 'E' || side === 'W' ? (has('S') ? t : 0) : 0;
    addWall(batch, {
      rect,
      side,
      y0,
      y1,
      thickness: t,
      placement: 'inside',
      trimStart,
      trimEnd,
      openings: entrances.map((o) => ({ ...o, height: o.height ?? (o.kind === 'storefront' ? b.storefrontHeight : b.doorHeight) })),
      defaultOpeningHeight: b.doorHeight,
      mat,
      floor: floor.level,
      tint,
    });
  }
  if (span > 1) buildTallRoomTop(layout, floor, rect, span, batch);
}

/** 挑高房间（影院）伸出屋面的部分：外围墙 + 自己的屋顶。 */
function buildTallRoomTop(layout: MallLayout, floor: FloorDef, rect: Rect, span: number, batch: StaticBatch) {
  const b = layout.building;
  const H = b.floorHeight;
  const roofY = (floor.level + 1) * H;
  const topY = floor.level * H + span * H;
  for (const side of SIDES) {
    const onExterior = sideOnBoundary(rect, side, floor.indoor);
    const ext = side === 'N' || side === 'S' ? -b.extWall : 0;
    addWall(batch, {
      rect,
      side,
      y0: onExterior ? roofY + 0.6 : roofY,
      y1: topY,
      thickness: b.extWall,
      placement: 'outside',
      trimStart: ext,
      trimEnd: ext,
      defaultOpeningHeight: 0,
      mat: 'exterior',
      floor: floor.level,
    });
  }
  const e = b.extWall;
  addSlab(batch, {
    floor: floor.level,
    y: topY + b.slab,
    thickness: b.slab,
    regions: [{ x: rect.x - e, z: rect.z - e, w: rect.w + 2 * e, d: rect.d + 2 * e }],
    holes: [],
    topMat: 'roof',
    bottomMat: 'ceiling',
    edgeMat: 'exterior',
  });
}

/** 顶层屋面：扣掉中庭（天窗）和挑高房间。天窗是玻璃加几根梁。 */
function buildRoof(layout: MallLayout, top: FloorDef, roofY: number, batch: StaticBatch) {
  const b = layout.building;
  const tall = layout.shops.filter((s) => s.floor === top.level && (s.spanFloors ?? 1) > 1).map((s) => s.rect);
  const skylights = layout.atriums.filter((a) => a.skylight).map((a) => a.rect);
  addSlab(batch, {
    floor: top.level,
    y: roofY,
    thickness: b.slab,
    regions: [top.indoor],
    holes: [...skylights, ...tall],
    topMat: 'roof',
    bottomMat: 'ceiling',
    edgeMat: 'slabEdge',
  });
  // 天窗：玻璃 + 横竖几根梁
  for (const a of skylights) {
    batch.box(a.x, roofY - 0.12, a.z, a.x + a.w, roofY - 0.08, a.z + a.d, 'glass', top.level, 'none');
    const n = Math.max(1, Math.round(a.w / 4));
    for (let i = 0; i <= n; i++) {
      const x = a.x + (a.w * i) / n;
      batch.box(x - 0.1, roofY - 0.4, a.z, x + 0.1, roofY - 0.12, a.z + a.d, 'rail', top.level, 'none');
    }
    batch.box(a.x, roofY - 0.4, a.z + a.d / 2 - 0.1, a.x + a.w, roofY - 0.12, a.z + a.d / 2 + 0.1, 'rail', top.level, 'none');
  }
}

/** 把颜色往白色混：amount = 0 不变，1 为纯白。 */
export function lighten(hex: string, amount: number): string {
  const c = new THREE.Color(hex);
  c.lerp(new THREE.Color('#ffffff'), amount);
  return `#${c.getHexString()}`;
}
