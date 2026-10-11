import * as THREE from 'three';
import type { FloorDef, MallLayout, Opening, Rect, ShopDef, Side } from '../data/layoutTypes.ts';
import type { PhysicsWorld } from '../systems/physics/PhysicsWorld.ts';
import { createGreyboxMaterials } from '../render/greyboxMaterials.ts';
import { StaticBatch } from './StaticBatch.ts';
import { containsRect, sideOnBoundary, subtractRects } from './rectOps.ts';
import { addWall } from './walls.ts';
import { buildStairCore, stairHoles } from './stairs.ts';
import { buildSigns } from './signs.ts';

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
  const top = layout.floors[layout.floors.length - 1];
  const roofY = (top.level + 1) * H;

  buildGround(layout, batch);
  for (const floor of layout.floors) {
    buildSlab(layout, floor, batch);
    buildExterior(layout, floor, batch, floor === top);
    buildOutdoorParapets(layout, floor, batch);
    if (floor.level > 0) buildAtriumRailing(layout, floor.level, batch);
  }
  for (const shop of layout.shops) buildShopShell(layout, shop, batch);
  for (const f of layout.facilities) {
    const floor = layout.floors[f.floor];
    const tint = f.kind === 'vacant' ? '#c9b8e8' : undefined;
    buildRoomWalls(layout, floor, f.rect, f.entrances, 1, f.kind === 'vacant' ? 'hoarding' : 'wall', tint, batch);
  }
  for (const st of layout.circulation.stairs) {
    const outdoorAtTop = !containsRect(layout.floors[st.floors[1]].indoor, st.rect);
    buildStairCore(batch, st, H, b.slab, outdoorAtTop, b.doorHeight);
  }
  buildRoof(layout, top, roofY, batch);

  const root = batch.build(createGreyboxMaterials(), physics);
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
  for (const r of subtractRects([world], [footprint, plaza])) {
    batch.box(r.x, -0.5, r.z, r.x + r.w, 0, r.z + r.d, 'ground', -1);
  }
  batch.box(plaza.x, -0.5, plaza.z, plaza.x + plaza.w, 0, plaza.z + plaza.d, 'plaza', -1);

  // 广场三面：矮花坛（可见）+ 隐形高墙
  const x0 = plaza.x;
  const x1 = plaza.x + plaza.w;
  const z0 = plaza.z;
  const z1 = plaza.z + plaza.d;
  const planter = (ax: number, az: number, bx: number, bz: number) => {
    batch.box(ax, 0, az, bx, 0.6, bz, 'rail', -1, 'solid', '#7fb069');
    batch.box(ax, 0.6, az, bx, 4, bz, 'rail', -1, 'invisible');
  };
  planter(x0 - 0.6, z0, x0, z1 + 0.6);
  planter(x1, z0, x1 + 0.6, z1 + 0.6);
  planter(x0, z1, x1, z1 + 0.6);
}

/** 楼板：走廊部分、各店铺地面（浅主题色）、1F 中庭地面分开着色。 */
function buildSlab(layout: MallLayout, floor: FloorDef, batch: StaticBatch) {
  const b = layout.building;
  const y = floor.level * b.floorHeight;
  const y0 = y - b.slab;
  const regions = [floor.indoor, ...(floor.outdoor ?? [])];
  const holes: Rect[] = [...(floor.voids ?? [])];
  if (floor.level > 0) holes.push(layout.atrium.rect);
  for (const st of layout.circulation.stairs) holes.push(...stairHoles(st, floor.level));

  const rooms: { rect: Rect; tint: string; mat: 'floorShop' | 'plaza' }[] = [];
  for (const s of layout.shops) {
    if (s.floor !== floor.level) continue;
    rooms.push({ rect: s.rect, tint: s.kind === 'outdoor' ? '#a8d5a2' : lighten(s.theme.primary, 0.78), mat: s.kind === 'outdoor' ? 'plaza' : 'floorShop' });
  }
  for (const f of layout.facilities) {
    if (f.floor !== floor.level) continue;
    rooms.push({ rect: f.rect, tint: '#e4e7eb', mat: 'floorShop' });
  }
  const courtHoles = floor.level === 0 ? [layout.atrium.rect] : [];

  for (const r of subtractRects(regions, [...holes, ...rooms.map((m) => m.rect), ...courtHoles])) {
    batch.box(r.x, y0, r.z, r.x + r.w, y, r.z + r.d, 'floor', floor.level);
  }
  for (const room of rooms) {
    for (const r of subtractRects([room.rect], holes)) {
      batch.box(r.x, y0, r.z, r.x + r.w, y, r.z + r.d, room.mat, floor.level, 'solid', room.tint);
    }
  }
  for (const r of courtHoles) {
    batch.box(r.x, y0, r.z, r.x + r.w, y, r.z + r.d, 'floorShop', floor.level, 'solid', '#f3e3c3');
  }
}

/** 外墙沿室内范围的四边；和室外平台相邻的一边是带门和落地窗的分界墙。 */
function buildExterior(layout: MallLayout, floor: FloorDef, batch: StaticBatch, isTop: boolean) {
  const b = layout.building;
  const H = b.floorHeight;
  const y0 = floor.level * H - b.slab;
  const y1 = isTop ? (floor.level + 1) * H + 0.6 : (floor.level + 1) * H - b.slab;
  const r = floor.indoor;
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
      mat: 'exterior',
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
  for (let i = before; i < batch.boxes.length; i++) batch.boxes[i].collide = 'invisible';
}

/** 中庭四周的玻璃栏杆：玻璃 + 扶手只显示，另加一道 2.4 m 高的隐形碰撞墙。 */
function buildAtriumRailing(layout: MallLayout, level: number, batch: StaticBatch) {
  const b = layout.building;
  const y = level * b.floorHeight;
  const a = layout.atrium.rect;
  const t = 0.12;
  const x0 = a.x;
  const x1 = a.x + a.w;
  const z0 = a.z;
  const z1 = a.z + a.d;
  // 每边：沿洞口外沿放一圈（在楼板上，不在洞里）
  const edges: [number, number, number, number][] = [
    [x0 - t, z0 - t, x1 + t, z0], // 北
    [x0 - t, z1, x1 + t, z1 + t], // 南
    [x0 - t, z0, x0, z1], // 西
    [x1, z0, x1 + t, z1], // 东
  ];
  for (const [ax, az, bx, bz] of edges) {
    batch.box(ax, y, az, bx, y + 0.08, bz, 'rail', level, 'none');
    batch.box(ax, y + 0.08, az, bx, y + b.railHeight - 0.06, bz, 'glass', level, 'none');
    batch.box(ax, y + b.railHeight - 0.06, az, bx, y + b.railHeight + 0.02, bz, 'rail', level, 'none');
    batch.box(ax, y, az, bx, y + 2.4, bz, 'rail', level, 'invisible');
  }
}

/** 店铺空壳：沿非外墙的各边做隔墙，入口一侧开门面。影院按挑高层数加高，并单独封顶。 */
function buildShopShell(layout: MallLayout, shop: ShopDef, batch: StaticBatch) {
  if (shop.kind === 'outdoor') return;
  const floor = layout.floors[shop.floor];
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
  batch.box(rect.x - e, topY, rect.z - e, rect.x + rect.w + e, topY + b.slab, rect.z + rect.d + e, 'roof', floor.level);
}

/** 顶层屋面：扣掉中庭（天窗）和挑高房间。天窗是玻璃加几根梁。 */
function buildRoof(layout: MallLayout, top: FloorDef, roofY: number, batch: StaticBatch) {
  const b = layout.building;
  const tall = layout.shops.filter((s) => s.floor === top.level && (s.spanFloors ?? 1) > 1).map((s) => s.rect);
  const a = layout.atrium.rect;
  for (const r of subtractRects([top.indoor], [a, ...tall])) {
    batch.box(r.x, roofY - b.slab, r.z, r.x + r.w, roofY, r.z + r.d, 'roof', top.level);
  }
  if (!layout.atrium.skylight) return;
  batch.box(a.x, roofY - 0.12, a.z, a.x + a.w, roofY - 0.08, a.z + a.d, 'glass', top.level, 'none');
  for (let x = a.x; x <= a.x + a.w + 1e-6; x += 4) {
    batch.box(x - 0.1, roofY - 0.4, a.z, x + 0.1, roofY - 0.12, a.z + a.d, 'rail', top.level, 'none');
  }
  batch.box(a.x, roofY - 0.4, a.z + a.d / 2 - 0.1, a.x + a.w, roofY - 0.12, a.z + a.d / 2 + 0.1, 'rail', top.level, 'none');
}

/** 把颜色往白色混：amount = 0 不变，1 为纯白。 */
export function lighten(hex: string, amount: number): string {
  const c = new THREE.Color(hex);
  c.lerp(new THREE.Color('#ffffff'), amount);
  return `#${c.getHexString()}`;
}
