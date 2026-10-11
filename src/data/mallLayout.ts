import type { AmenityDef, FacilityDef, MallLayout, Opening, Rect, ShopCategory, ShopDef, Side } from './layoutTypes.ts';

// 商场整体：64 × 44 m，层高 6 m，地上五层 + 地下一层（B1）。
// 地上：南北两条店铺带（进深 12 m）夹着中间带：中庭 24 × 10 m 居中，四周回廊宽 5 m，
// 中间带东西两端各有一个封闭楼梯间（B1 到 5F）。5F 西侧是室外的 Skyline Garden。
// B1：Daily Harvest 超市占中部和北侧（40 × 32 m）；南侧 12 m 宽的超市前厅放寄存柜、购物车、服务台；
// 东西两翼连着楼梯间，西翼是洗手间和休息区，东翼是员工区和第二组寄存柜。
// 改布局只改这个文件；开发模式下 validateLayout() 会检查重叠和门洞。

const X0 = -32;
const X1 = 32;
const Z0 = -22;
const Z1 = 22;
const BAND = 12; // 店铺带进深
const ABOVE_GROUND = [0, 1, 2, 3, 4];

/** 北侧店铺带上 [x0, x1] 的一段 */
const north = (x0: number, x1: number): Rect => ({ x: x0, z: Z0, w: x1 - x0, d: BAND });
/** 南侧店铺带上 [x0, x1] 的一段 */
const south = (x0: number, x1: number): Rect => ({ x: x0, z: Z1 - BAND, w: x1 - x0, d: BAND });

/** 朝向走廊的一侧开居中的门面。北带店铺门朝南，南带店铺门朝北。 */
function storefront(rect: Rect, width?: number, kind: Opening['kind'] = 'storefront'): Opening {
  const side: Side = rect.z < 0 ? 'S' : 'N';
  const w = width ?? Math.min(10, Math.round(rect.w * 0.45));
  return { side, offset: (rect.w - w) / 2, width: w, kind };
}

function shop(
  id: string,
  name: string,
  category: ShopCategory,
  floor: number,
  rect: Rect,
  primary: string,
  accent: string,
  extra: Partial<ShopDef> = {},
): ShopDef {
  return {
    id,
    name,
    category,
    kind: 'shop',
    floor,
    rect,
    entrances: [storefront(rect)],
    theme: { primary, accent },
    ...extra,
  };
}

function restroom(floor: number): FacilityDef {
  const rect = south(24, 32);
  return {
    id: `wc-${floor + 1}f`,
    kind: 'restroom',
    label: { zh: '洗手间', en: 'Restrooms' },
    floor,
    rect,
    entrances: [{ side: 'N', offset: 2.8, width: 2.4, kind: 'door' }],
  };
}

function vacant(id: string, floor: number, rect: Rect): FacilityDef {
  return { id, kind: 'vacant', label: { zh: '敬请期待', en: 'Coming Soon' }, floor, rect, entrances: [] };
}

const shops: ShopDef[] = [
  // B1 超市
  shop('dailyharvest', 'Daily Harvest', 'supermarket', -1, { x: -20, z: Z0, w: 40, d: 32 }, '#2d6a4f', '#ffd166', {
    entrances: [{ side: 'S', offset: 13, width: 14, height: 4, kind: 'storefront' }],
  }),

  // 1F 潮玩与数码
  shop('bricknest', 'BrickNest', 'bricks', 0, north(-32, -10.5), '#e94f37', '#f6c445'),
  shop('blindstar', 'BlindStar', 'blindbox', 0, north(-10.5, 10.5), '#8e6cef', '#ffc6e0'),
  shop('dimhub', 'DimHub', 'fanmerch', 0, north(10.5, 32), '#2ec4b6', '#ff9f1c'),
  shop('orbit', 'Orbit', 'devices', 0, south(-32, -18), '#3a86ff', '#e0e7ff'),
  shop('kaze', 'Kaze', 'camera', 0, south(-18, -5), '#2b2d42', '#ef233c'),
  shop('pixelfox', 'PixelFox', 'consoles', 0, south(5, 24), '#ff6b35', '#1a1a2e'),

  // 2F 服饰与书香
  shop('threadco', 'Thread&Co', 'menswear', 1, north(-32, 0), '#264653', '#e9c46a'),
  shop('lumi', 'Lumi', 'womenswear', 1, north(0, 32), '#f4a6b7', '#fff1e6'),
  shop('marginbooks', 'Margin Books', 'books', 1, south(-32, -6), '#6b4f3a', '#f2e8cf'),
  shop('kumo', 'Kumo Coffee', 'cafe', 1, south(-6, 12), '#7fa99b', '#fdf6ec'),

  // 3F 游乐：TurboKart 占整个北侧
  shop('turbokart', 'TurboKart', 'karting', 2, north(-32, 32), '#d62828', '#fcbf49'),
  shop('coinplanet', 'CoinPlanet', 'arcade', 2, south(-32, -2), '#7209b7', '#4cc9f0'),
  shop('blinkvr', 'BlinkVR', 'vr', 2, south(-2, 24), '#00b4d8', '#03045e'),

  // 4F 运动：Arc 是占整个北侧的综合运动大店
  shop('arc', 'Arc', 'sports', 3, north(-32, 32), '#f3722c', '#277da1'),
  shop('stride', 'Stride', 'running', 3, south(-32, -4), '#80b918', '#1b4332'),
  shop('shuttle', 'Shuttle', 'badminton', 3, south(-4, 24), '#4361ee', '#f9c74f'),

  // 5F 餐饮与天台
  shop('foodalley', 'Food Alley', 'foodcourt', 4, { x: -14, z: Z0, w: 46, d: BAND }, '#f9844a', '#fee440', {
    kind: 'foodcourt',
    entrances: [{ side: 'S', offset: 3, width: 40, height: 4.2, kind: 'storefront' }],
  }),
  shop('cinema', 'Starlight Cinema', 'cinema', 4, { x: -14, z: Z1 - BAND, w: 38, d: BAND }, '#22223b', '#f2cc8f', {
    kind: 'cinema',
    spanFloors: 2,
    entrances: [{ side: 'N', offset: 16, width: 6, height: 4, kind: 'door' }],
  }),
  shop('garden', 'Skyline Garden', 'garden', 4, { x: X0, z: Z0, w: 18, d: 44 }, '#52b788', '#d8f3dc', {
    kind: 'outdoor',
    // 室外区域没有自己的墙：这个入口对应 5F 室内外分界墙上的门，只用来挂招牌
    entrances: [{ side: 'E', offset: 19, width: 6, kind: 'gate' }],
  }),
];

const facilities: FacilityDef[] = [
  {
    id: 'wc-b1',
    kind: 'restroom',
    label: { zh: '洗手间', en: 'Restrooms' },
    floor: -1,
    rect: { x: X0, z: Z0, w: 12, d: 9 },
    entrances: [{ side: 'S', offset: 4.8, width: 2.4, kind: 'door' }],
  },
  { id: 'staff-b1', kind: 'service', label: { zh: '员工专用', en: 'Staff Only' }, floor: -1, rect: { x: 20, z: Z0, w: 12, d: 12 }, entrances: [] },
  restroom(0),
  restroom(1),
  restroom(2),
  restroom(3),
  restroom(4),
  vacant('vacant-2f', 1, south(12, 24)),
];

// B1 超市外侧的设施
const amenities: AmenityDef[] = [
  { id: 'lockers-hall', kind: 'lockers', floor: -1, rect: { x: -30, z: Z1 - 0.6, w: 12, d: 0.6 }, facing: 'N', label: { zh: '寄存柜', en: 'Lockers' } },
  { id: 'lockers-east', kind: 'lockers', floor: -1, rect: { x: X1 - 0.6, z: -9, w: 0.6, d: 6 }, facing: 'W', label: { zh: '寄存柜', en: 'Lockers' } },
  { id: 'carts', kind: 'carts', floor: -1, rect: { x: -16, z: 11.5, w: 6, d: 4 }, facing: 'N', label: { zh: '购物车', en: 'Carts' } },
  { id: 'baskets', kind: 'baskets', floor: -1, rect: { x: -9.2, z: 11, w: 1.4, d: 0.8 }, facing: 'N' },
  { id: 'service-desk', kind: 'serviceDesk', floor: -1, rect: { x: 12, z: Z1 - 3, w: 8, d: 3 }, facing: 'N', label: { zh: '服务台', en: 'Service Desk' } },
  { id: 'bench-hall-w', kind: 'bench', floor: -1, rect: { x: -4.5, z: 17.5, w: 2, d: 0.55 }, facing: 'N' },
  { id: 'bench-hall-e', kind: 'bench', floor: -1, rect: { x: 2.5, z: 17.5, w: 2, d: 0.55 }, facing: 'N' },
  { id: 'bench-lounge-1', kind: 'bench', floor: -1, rect: { x: X0, z: -11.5, w: 0.55, d: 2 }, facing: 'E' },
  { id: 'bench-lounge-2', kind: 'bench', floor: -1, rect: { x: X0, z: -8.5, w: 0.55, d: 2 }, facing: 'E' },
  { id: 'fountain', kind: 'waterFountain', floor: -1, rect: { x: X0, z: -5.6, w: 0.5, d: 0.6 }, facing: 'E', label: { zh: '饮水机', en: 'Water' } },
];

export const mallLayout: MallLayout = {
  name: { zh: '商场漫游', en: 'Mall Wander' },
  building: {
    outline: { x: X0, z: Z0, w: X1 - X0, d: Z1 - Z0 },
    floorHeight: 6,
    slab: 0.3,
    extWall: 0.3,
    partition: 0.15,
    doorHeight: 2.6,
    storefrontHeight: 3.6,
    railHeight: 1.1,
  },
  atrium: { rect: { x: -12, z: -5, w: 24, d: 10 }, skylight: true },
  mainEntrance: { side: 'S', offset: 29, width: 6, height: 4, kind: 'gate' },
  plaza: { x: X0, z: Z1, w: X1 - X0, d: 16 },
  spawn: { floor: 0, x: 0, z: 33, yaw: 0 },
  floors: [
    {
      level: -1,
      label: 'B1',
      theme: { zh: '超市与生活', en: 'Market & Services' },
      indoor: { x: X0, z: Z0, w: 64, d: 44 },
      devSpawn: { x: 0, z: 16, yaw: 0 },
    },
    { level: 0, label: '1F', theme: { zh: '潮玩与数码', en: 'Toys & Digital' }, indoor: { x: X0, z: Z0, w: 64, d: 44 } },
    { level: 1, label: '2F', theme: { zh: '服饰与书香', en: 'Fashion & Books' }, indoor: { x: X0, z: Z0, w: 64, d: 44 } },
    { level: 2, label: '3F', theme: { zh: '游乐', en: 'Play' }, indoor: { x: X0, z: Z0, w: 64, d: 44 } },
    { level: 3, label: '4F', theme: { zh: '运动', en: 'Sports' }, indoor: { x: X0, z: Z0, w: 64, d: 44 } },
    {
      level: 4,
      label: '5F',
      theme: { zh: '餐饮与天台', en: 'Dining & Rooftop' },
      indoor: { x: -14, z: Z0, w: 46, d: 44 },
      outdoor: [{ x: X0, z: Z0, w: 18, d: 44 }],
      // 室内与空中花园之间的分界墙（x = -14）：中间是门，两侧是落地玻璃
      facadeOpenings: [
        { side: 'W', offset: 12, width: 7, kind: 'glazing' },
        { side: 'W', offset: 19, width: 6, height: 3.6, kind: 'door' },
        { side: 'W', offset: 25, width: 7, kind: 'glazing' },
      ],
    },
  ],
  shops,
  facilities,
  amenities,
  publicZones: [
    { id: 'market-hall', label: { zh: '超市前厅', en: 'Market Hall' }, rect: { x: X0, z: 10, w: 64, d: 12 }, floors: [-1] },
    { id: 'b1-west', label: { zh: '西侧休息区', en: 'West Lounge' }, rect: { x: X0, z: Z0, w: 12, d: 32 }, floors: [-1] },
    { id: 'b1-east', label: { zh: '东侧通道', en: 'East Wing' }, rect: { x: 20, z: Z0, w: 12, d: 32 }, floors: [-1] },
    { id: 'plaza', label: { zh: '正门广场', en: 'Entrance Plaza' }, rect: { x: X0, z: Z1, w: 64, d: 16 }, floors: [0] },
    { id: 'lobby', label: { zh: '正门大堂', en: 'Main Lobby' }, rect: { x: -5, z: 10, w: 10, d: 12 }, floors: [0] },
    { id: 'atrium', label: { zh: '中庭', en: 'Atrium' }, rect: { x: -14, z: -10, w: 28, d: 20 }, floors: ABOVE_GROUND },
    { id: 'west', label: { zh: '西侧回廊', en: 'West Concourse' }, rect: { x: X0, z: -10, w: 18, d: 20 }, floors: ABOVE_GROUND },
    { id: 'east', label: { zh: '东侧回廊', en: 'East Concourse' }, rect: { x: 14, z: -10, w: 18, d: 20 }, floors: ABOVE_GROUND },
  ],
  circulation: {
    stairs: [
      {
        id: 'stairs-west',
        label: { zh: '西侧楼梯', en: 'West Stairs' },
        rect: { x: X0, z: -1.8, w: 9, d: 3.6 },
        front: 'E',
        floors: [-1, 4],
      },
      {
        id: 'stairs-east',
        label: { zh: '东侧楼梯', en: 'East Stairs' },
        rect: { x: X1 - 9, z: -1.8, w: 9, d: 3.6 },
        front: 'W',
        floors: [-1, 4],
      },
    ],
    // 阶段 3 再加扶梯和观光电梯
    escalators: [],
    elevators: [],
  },
};
