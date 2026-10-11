import { escalatorRun, type AmenityDef, type ElevatorDef, type EscalatorDef, type FacilityDef, type MallLayout, type Opening, type Rect, type ShopCategory, type ShopDef, type Side, type StairDef } from './layoutTypes.ts';

// 商场整体：136 × 52 m 的“哑铃型”线形商场，层高 6 m，B1 + 1F–5F。参考日本 AEON / 美国区域购物中心：
// - 两端是 18 m 宽、贯通进深的主力店（把人流拉过中间的专门店）；
// - 中间 100 m 长的商业街宽 14 m，两侧是 15 × 19 m 的标准铺位，中央中庭两侧是 24 × 14 m 的铺位；
// - 中央中庭（大挑空 + 天窗 + 观光电梯）和东西两个扶梯挑空，沿挑空装玻璃栏杆；
//   东侧挑空从 1F 起开洞，扶梯一直通到 B1；
// - 两组楼梯间 + 洗手间放在对角（西北、东南），东北角是员工通道；
// - B1 是 Daily Harvest 超市和前厅，5F 西端是室外的 Skyline Garden，东端是两层挑高的影院。
// 改布局只改这个文件；开发模式下 validateLayout() 会检查重叠和门洞。

const X0 = -68;
const X1 = 68;
const Z0 = -26;
const Z1 = 26;
const MALL_X0 = -50; // 两端主力店之间的商业街范围
const MALL_X1 = 50;
const STREET = 7; // 商业街半宽：z ∈ [-7, 7]
const COURT_X = 12; // 中央中庭范围：x ∈ [-12, 12]
const COURT_Z = 12; // 中庭处铺位后退到 |z| = 12
const ABOVE_GROUND = [0, 1, 2, 3, 4];

/** 北侧铺位（门朝南）：中庭段进深 14 m，其余 19 m。 */
function north(x: number, w: number): Rect {
  const court = x >= -COURT_X && x + w <= COURT_X;
  return { x, z: Z0, w, d: (court ? -COURT_Z : -STREET) - Z0 };
}

/** 南侧铺位（门朝北）。 */
function south(x: number, w: number): Rect {
  const court = x >= -COURT_X && x + w <= COURT_X;
  const z = court ? COURT_Z : STREET;
  return { x, z, w, d: Z1 - z };
}

const WEST_ANCHOR: Rect = { x: X0, z: Z0, w: MALL_X0 - X0, d: Z1 - Z0 };
const EAST_ANCHOR: Rect = { x: MALL_X1, z: Z0, w: X1 - MALL_X1, d: Z1 - Z0 };
/** 主力店入口：正对商业街，12 m 宽 */
const anchorEntrance = (side: Side): Opening => ({ side, offset: (Z1 - Z0) / 2 - 6, width: 12, height: 4.5, kind: 'storefront' });

/** 朝向走廊的一侧开居中的门面。北侧铺位门朝南，南侧朝北。 */
function storefront(rect: Rect, width?: number): Opening {
  const side: Side = rect.z < 0 ? 'S' : 'N';
  const w = width ?? Math.min(12, Math.round(rect.w * 0.6));
  return { side, offset: (rect.w - w) / 2, width: w, kind: 'storefront' };
}

interface ShopOpts {
  kind?: ShopDef['kind'];
  entrances?: Opening[];
  spanFloors?: number;
}

function shop(
  tier: ShopDef['tier'],
  id: string,
  name: string,
  category: ShopCategory,
  floor: number,
  rect: Rect,
  primary: string,
  accent: string,
  opts: ShopOpts = {},
): ShopDef {
  return {
    id,
    tier,
    name,
    category,
    kind: opts.kind ?? 'shop',
    floor,
    rect,
    entrances: opts.entrances ?? [storefront(rect)],
    spanFloors: opts.spanFloors,
    theme: { primary, accent },
  };
}
const main = (...a: Parameters<typeof shop> extends [unknown, ...infer R] ? R : never) => shop('main', ...a);
const secondary = (...a: Parameters<typeof shop> extends [unknown, ...infer R] ? R : never) => shop('secondary', ...a);

const shops: ShopDef[] = [
  // ---------- B1 超市与生活 ----------
  // 超市在西边，东边留出扶梯落地的前厅，南边是电梯口和超市前厅
  main('dailyharvest', 'Daily Harvest', 'supermarket', -1, { x: -42, z: Z0, w: 60, d: 27 }, '#2d6a4f', '#ffd166', {
    entrances: [{ side: 'S', offset: 26, width: 12, height: 4, kind: 'storefront' }],
  }),
  secondary('sweetspot', 'Sweet Spot', 'sweets', -1, { x: 22, z: 16, w: 9, d: 10 }, '#ff8fab', '#fff0f3', {
    entrances: [{ side: 'N', offset: 1.5, width: 6, kind: 'storefront' }],
  }),
  secondary('deligarden', 'Deli Garden', 'deli', -1, { x: 31, z: 16, w: 9, d: 10 }, '#90be6d', '#f9f7f3', {
    entrances: [{ side: 'N', offset: 1.5, width: 6, kind: 'storefront' }],
  }),

  // ---------- 1F 潮玩与数码 ----------
  main('pixelfox', 'PixelFox', 'consoles', 0, WEST_ANCHOR, '#ff6b35', '#1a1a2e', { entrances: [anchorEntrance('E')] }),
  main('orbit', 'Orbit', 'devices', 0, EAST_ANCHOR, '#3a86ff', '#e0e7ff', { entrances: [anchorEntrance('W')] }),
  main('bricknest', 'BrickNest', 'bricks', 0, north(-42, 15), '#e94f37', '#f6c445'),
  main('kaze', 'Kaze', 'camera', 0, north(-27, 15), '#2b2d42', '#ef233c'),
  main('blindstar', 'BlindStar', 'blindbox', 0, north(-12, 12), '#8e6cef', '#ffc6e0'),
  secondary('cardden', 'Card Den', 'cards', 0, north(0, 12), '#386641', '#f2e8cf'),
  main('dimhub', 'DimHub', 'fanmerch', 0, north(12, 15), '#2ec4b6', '#ff9f1c'),
  secondary('fluffle', 'Fluffle', 'plush', 0, north(27, 15), '#ffafcc', '#cdb4db'),
  secondary('morningcrumb', 'Morning Crumb', 'bakery', 0, south(-50, 8), '#bc6c25', '#fefae0'),
  secondary('caselab', 'Case Lab', 'phoneAccessories', 0, south(-42, 15), '#00a6fb', '#e8f7ff'),
  secondary('gachagalaxy', 'Gacha Galaxy', 'capsuleToys', 0, { x: -12, z: COURT_Z, w: 7, d: Z1 - COURT_Z }, '#7b2cbf', '#ffd60a', {
    entrances: [{ side: 'N', offset: 1, width: 5, kind: 'storefront' }],
  }),
  secondary('crepecloud', 'Crepe Cloud', 'crepes', 0, { x: 5, z: COURT_Z, w: 7, d: Z1 - COURT_Z }, '#f4a261', '#fff8e7', {
    entrances: [{ side: 'N', offset: 1, width: 5, kind: 'storefront' }],
  }),
  secondary('dailydose', 'Daily Dose', 'drugstore', 0, south(12, 30), '#06d6a0', '#ffffff'),

  // ---------- 2F 服饰与书香 ----------
  main('threadco', 'Thread&Co', 'menswear', 1, WEST_ANCHOR, '#264653', '#e9c46a', { entrances: [anchorEntrance('E')] }),
  main('lumi', 'Lumi', 'womenswear', 1, EAST_ANCHOR, '#f4a6b7', '#fff1e6', { entrances: [anchorEntrance('W')] }),
  main('nibnote', 'Nib & Note', 'stationery', 1, north(-42, 15), '#ef8354', '#fdf0d5'),
  main('kumo', 'Kumo Coffee', 'cafe', 1, north(-27, 15), '#7fa99b', '#fdf6ec'),
  main('marginbooks', 'Margin Books', 'books', 1, north(-12, 24), '#6b4f3a', '#f2e8cf'),
  secondary('heellace', 'Heel & Lace', 'shoes', 1, north(12, 15), '#9d4edd', '#f3e8ff'),
  secondary('knotpin', 'Knot & Pin', 'accessories', 1, north(27, 15), '#e76f51', '#fff3e0'),
  secondary('mendspot', 'Mend Spot', 'repair', 1, south(-50, 8), '#6c757d', '#f8f9fa'),
  secondary('framewise', 'Framewise', 'eyewear', 1, south(-42, 15), '#1d3557', '#a8dadc'),
  secondary('carryall', 'Carryall', 'bags', 1, south(-27, 15), '#a0522d', '#f5ebe0'),
  secondary('dewdrop', 'Dewdrop', 'cosmetics', 1, south(-12, 24), '#ff99c8', '#fcf6bd'),
  secondary('littlesprout', 'Little Sprout', 'kidswear', 1, south(12, 30), '#80ed99', '#fefae0'),

  // ---------- 3F 游乐 ----------
  main('turbokart', 'TurboKart', 'karting', 2, WEST_ANCHOR, '#d62828', '#fcbf49', { entrances: [anchorEntrance('E')] }),
  main('coinplanet', 'CoinPlanet', 'arcade', 2, EAST_ANCHOR, '#7209b7', '#4cc9f0', { entrances: [anchorEntrance('W')] }),
  main('blinkvr', 'BlinkVR', 'vr', 2, north(-12, 24), '#00b4d8', '#03045e'),
  secondary('toyboxlane', 'Toybox Lane', 'toys', 2, north(-42, 15), '#ffbe0b', '#3a86ff'),
  secondary('snapstar', 'SnapStar', 'photoBooth', 2, north(-27, 15), '#ff006e', '#ffe5ec'),
  secondary('echobox', 'Echo Box', 'karaoke', 2, north(12, 30), '#3c096c', '#e0aaff'),
  secondary('snackstop', 'Snack Stop', 'snacks', 2, south(-50, 8), '#fb8500', '#ffb703'),
  secondary('playnest', 'Playnest', 'playground', 2, south(-42, 30), '#4cc9f0', '#f72585'),
  secondary('meeplecafe', 'Meeple Café', 'boardGameCafe', 2, south(-12, 24), '#8d6346', '#ffe8d6'),
  secondary('puzzlevault', 'Puzzle Vault', 'escapeRoom', 2, south(12, 30), '#2f3e46', '#cad2c5'),

  // ---------- 4F 运动 ----------
  secondary('summit', 'Summit Outdoor', 'outdoor', 3, WEST_ANCHOR, '#386641', '#a7c957', { entrances: [anchorEntrance('E')] }),
  main('arc', 'Arc', 'sports', 3, EAST_ANCHOR, '#f3722c', '#277da1', { entrances: [anchorEntrance('W')] }),
  main('stride', 'Stride', 'running', 3, north(-42, 15), '#80b918', '#1b4332'),
  main('shuttle', 'Shuttle', 'badminton', 3, north(-27, 15), '#4361ee', '#f9c74f'),
  secondary('spokecycles', 'Spoke Cycles', 'bikes', 3, north(-12, 24), '#e63946', '#f1faee'),
  secondary('flowstudio', 'Flow Studio', 'yoga', 3, north(12, 30), '#b5838d', '#ffe5d9'),
  secondary('fairway', 'Fairway Golf', 'golf', 3, south(-42, 30), '#2d6a4f', '#d8f3dc'),
  secondary('refuel', 'Refuel Bar', 'juiceBar', 3, south(-12, 24), '#ffb703', '#023047'),
  secondary('boulderbox', 'Boulder Box', 'climbing', 3, south(12, 30), '#6a4c93', '#ffca3a'),

  // ---------- 5F 餐饮与天台 ----------
  main('garden', 'Skyline Garden', 'garden', 4, WEST_ANCHOR, '#52b788', '#d8f3dc', {
    kind: 'outdoor',
    // 室外区域没有自己的墙：这个入口对应 5F 室内外分界墙上的门，只用来挂招牌
    entrances: [{ side: 'E', offset: 22, width: 8, kind: 'gate' }],
  }),
  main('cinema', 'Starlight Cinema', 'cinema', 4, EAST_ANCHOR, '#22223b', '#f2cc8f', {
    kind: 'cinema',
    spanFloors: 2,
    entrances: [anchorEntrance('W')],
  }),
  // 美食广场：沿北侧一排档口，前面敞开，座位延伸到中庭边
  main('foodalley', 'Food Alley', 'foodcourt', 4, { x: -27, z: Z0, w: 54, d: Z1 - COURT_Z }, '#f9844a', '#fee440', {
    kind: 'foodcourt',
    entrances: [{ side: 'S', offset: 2, width: 50, height: 4.2, kind: 'storefront' }],
  }),
  secondary('noodlelane', 'Noodle Lane', 'ramen', 4, north(-42, 15), '#c1121f', '#fdf0d5'),
  secondary('tidesushi', 'Tide Sushi', 'sushi', 4, north(27, 15), '#003049', '#eae2b7'),
  secondary('pearlleaf', 'Pearl Leaf', 'bubbleTea', 4, south(-50, 8), '#cdb4db', '#ffffff'),
  secondary('bistroolive', 'Bistro Olive', 'italian', 4, south(-42, 15), '#606c38', '#fefae0'),
  secondary('spiceroute', 'Spice Route', 'curry', 4, south(-27, 15), '#e85d04', '#ffba08'),
  secondary('skycafe', 'Sky Café', 'cafe', 4, south(-12, 24), '#90e0ef', '#ffffff'),
  secondary('embergrill', 'Ember Grill', 'grill', 4, south(12, 30), '#6a040f', '#ffba08'),
];

// 西北、东南两组楼梯间（B1–5F），旁边各一间洗手间；东北角是员工通道。
const stairs: StairDef[] = [
  { id: 'stairs-west', label: { zh: '西侧楼梯', en: 'West Stairs' }, rect: { x: MALL_X0, z: -STREET - 9, w: 3.6, d: 9 }, front: 'S', floors: [-1, 4] },
  { id: 'stairs-east', label: { zh: '东侧楼梯', en: 'East Stairs' }, rect: { x: MALL_X1 - 3.6, z: STREET, w: 3.6, d: 9 }, front: 'N', floors: [-1, 4] },
];

const facilities: FacilityDef[] = [];
for (const L of ABOVE_GROUND) {
  const tag = `${L + 1}f`;
  facilities.push(
    {
      id: `wc-nw-${tag}`,
      kind: 'restroom',
      label: { zh: '洗手间', en: 'Restrooms' },
      floor: L,
      rect: { x: MALL_X0 + 3.6, z: Z0, w: 4.4, d: Z0 * -1 - STREET },
      entrances: [{ side: 'S', offset: 1, width: 2.4, kind: 'door' }],
    },
    {
      id: `wc-se-${tag}`,
      kind: 'restroom',
      label: { zh: '洗手间', en: 'Restrooms' },
      floor: L,
      rect: { x: MALL_X1 - 8, z: STREET, w: 4.4, d: Z1 - STREET },
      entrances: [{ side: 'N', offset: 1, width: 2.4, kind: 'door' }],
    },
    { id: `staff-ne-${tag}`, kind: 'service', label: { zh: '员工通道', en: 'Staff Only' }, floor: L, rect: north(MALL_X1 - 8, 8), entrances: [] },
  );
}
facilities.push(
  // 1F 服务台（问讯、ATM、失物招领）
  {
    id: 'guest-services',
    kind: 'service',
    label: { zh: '服务中心', en: 'Guest Services' },
    floor: 0,
    rect: south(-27, 15),
    entrances: [{ side: 'N', offset: 3, width: 9, kind: 'storefront' }],
  },
  // B1 前厅两侧
  {
    id: 'wc-b1',
    kind: 'restroom',
    label: { zh: '洗手间', en: 'Restrooms' },
    floor: -1,
    rect: { x: MALL_X0, z: Z0, w: 8, d: 10 },
    entrances: [{ side: 'S', offset: 4.6, width: 2.4, kind: 'door' }],
  },
  { id: 'staff-b1', kind: 'service', label: { zh: '员工专用', en: 'Staff Only' }, floor: -1, rect: { x: 42, z: Z0, w: 8, d: 20 }, entrances: [] },
  // 4F 西南角：母婴室
  {
    id: 'nursing-4f',
    kind: 'service',
    label: { zh: '母婴室', en: 'Nursing Room' },
    floor: 3,
    rect: south(MALL_X0, 8),
    entrances: [{ side: 'N', offset: 2.8, width: 2.4, kind: 'door' }],
  },
);

// B1 超市前厅的设施
const amenities: AmenityDef[] = [
  { id: 'lockers-hall', kind: 'lockers', floor: -1, rect: { x: -46, z: Z1 - 0.6, w: 14, d: 0.6 }, facing: 'N', label: { zh: '寄存柜', en: 'Lockers' } },
  { id: 'lockers-east', kind: 'lockers', floor: -1, rect: { x: MALL_X1 - 0.6, z: -5, w: 0.6, d: 8 }, facing: 'W', label: { zh: '寄存柜', en: 'Lockers' } },
  { id: 'carts', kind: 'carts', floor: -1, rect: { x: -25, z: 3, w: 6, d: 4 }, facing: 'N', label: { zh: '购物车', en: 'Carts' } },
  { id: 'baskets', kind: 'baskets', floor: -1, rect: { x: -18.6, z: 2.4, w: 1.4, d: 0.8 }, facing: 'N' },
  { id: 'service-desk', kind: 'serviceDesk', floor: -1, rect: { x: 8, z: Z1 - 3, w: 8, d: 3 }, facing: 'N', label: { zh: '服务台', en: 'Service Desk' } },
  { id: 'bench-hall-1', kind: 'bench', floor: -1, rect: { x: -8, z: 18, w: 2, d: 0.55 }, facing: 'N' },
  { id: 'bench-hall-2', kind: 'bench', floor: -1, rect: { x: -4, z: 18, w: 2, d: 0.55 }, facing: 'N' },
  { id: 'bench-lounge-1', kind: 'bench', floor: -1, rect: { x: MALL_X0, z: 12, w: 0.55, d: 2 }, facing: 'E' },
  { id: 'bench-lounge-2', kind: 'bench', floor: -1, rect: { x: MALL_X0, z: 15, w: 0.55, d: 2 }, facing: 'E' },
  { id: 'fountain', kind: 'waterFountain', floor: -1, rect: { x: MALL_X0, z: 18.2, w: 0.5, d: 0.6 }, facing: 'E', label: { zh: '饮水机', en: 'Water' } },
];

// ---------- 扶梯 ----------
// 东西两个挑空各放一摞：南侧一条上行、北侧一条下行，每层的扶梯都从西往东爬（平行式），
// 上到一层后绕回西端坐下一段。扶梯坡段落在挑空里，顶端正好接在挑空东沿。
function escalatorStack(prefix: string, atrium: Rect, fromFloor: number, toFloor: number): EscalatorDef[] {
  const out: EscalatorDef[] = [];
  const footX = atrium.x + atrium.w - escalatorRun(6) + 0.8; // 坡段顶端 + 平步段 = 挑空东沿 + 0.8
  const laneZ = atrium.d / 2 - 1.6; // 车道中线离挑空中线的距离
  const cz = atrium.z + atrium.d / 2;
  for (let f = fromFloor; f < toFloor; f++) {
    out.push({ id: `${prefix}-up-${f}`, fromFloor: f, dir: 'up', foot: { x: footX, z: cz - laneZ }, heading: 'E' });
    out.push({ id: `${prefix}-down-${f}`, fromFloor: f, dir: 'down', foot: { x: footX, z: cz + laneZ }, heading: 'E' });
  }
  return out;
}
const WEST_VOID: Rect = { x: -36, z: -3.5, w: 10, d: 7 };
const EAST_VOID: Rect = { x: 26, z: -3.5, w: 10, d: 7 };
const escalators: EscalatorDef[] = [...escalatorStack('esc-w', WEST_VOID, 0, 4), ...escalatorStack('esc-e', EAST_VOID, -1, 4)];

// ---------- 观光电梯 ----------
// 中央中庭南缘的玻璃井道，B1–5F，厅门朝南开向走廊（B1 在超市前厅、1F 在中庭广场上）
const elevators: ElevatorDef[] = [
  { id: 'glass-elevator', label: { zh: '观光电梯', en: 'Glass Elevator' }, rect: { x: -1.6, z: 2.4, w: 3.2, d: 3.6 }, floors: [-1, 0, 1, 2, 3, 4], doorSide: 'S' },
];

// ---------- 公共长椅（每层：商业街中线背靠背成对、中央中庭四周面朝挑空）----------
function publicBenches(): AmenityDef[] {
  const out: AmenityDef[] = [];
  const bench = (id: string, floor: number, x: number, z: number, facing: Side, w = 2): AmenityDef => ({
    id,
    kind: 'bench',
    floor,
    rect: facing === 'N' || facing === 'S' ? { x: x - w / 2, z, w, d: 0.55 } : { x, z: z - w / 2, w: 0.55, d: w },
    facing,
  });
  for (const L of ABOVE_GROUND) {
    const f = `${L + 1}f`;
    // 商业街中线：扶梯挑空两侧的空段，背靠背一对
    for (const x of [-45, -18, 18, 45]) {
      out.push(bench(`bench-${f}-st${x}-n`, L, x, -0.6, 'N'));
      out.push(bench(`bench-${f}-st${x}-s`, L, x, 0.05, 'S'));
    }
    if (L === 0) {
      // 1F 中庭广场北侧，面朝广场
      for (const x of [-7, 7]) out.push(bench(`bench-${f}-court${x}`, L, x, -9.3, 'S'));
    } else {
      // 楼上：挑空南北两侧的走道上，面朝挑空（避开电梯门口）
      for (const x of [-5.5, 5.5]) {
        out.push(bench(`bench-${f}-void-s${x}`, L, x, 7.0, 'N'));
        if (L !== 4) out.push(bench(`bench-${f}-void-n${x}`, L, x, -7.55, 'S'));
      }
    }
  }
  return out;
}
amenities.push(...publicBenches());

const fullIndoor: Rect = { x: X0, z: Z0, w: X1 - X0, d: Z1 - Z0 };

export const mallLayout: MallLayout = {
  name: { zh: '商场漫游', en: 'Mall Wander' },
  building: {
    outline: fullIndoor,
    floorHeight: 6,
    slab: 0.3,
    extWall: 0.3,
    partition: 0.15,
    doorHeight: 2.6,
    storefrontHeight: 3.6,
    railHeight: 1.1,
  },
  atriums: [
    { id: 'center', rect: { x: -9, z: -6, w: 18, d: 12 }, fromFloor: 1, skylight: true },
    { id: 'west', rect: WEST_VOID, fromFloor: 1, skylight: true },
    { id: 'east', rect: EAST_VOID, fromFloor: 0, skylight: true },
  ],
  mainEntrance: { side: 'S', offset: (X1 - X0) / 2 - 4, width: 8, height: 4.5, kind: 'gate' },
  plaza: { x: -40, z: Z1, w: 80, d: 18 },
  spawn: { floor: 0, x: 0, z: 37, yaw: 0 },
  floors: [
    {
      level: -1,
      label: 'B1',
      theme: { zh: '超市与生活', en: 'Market & Services' },
      // 地下层只在两端主力店之间
      indoor: { x: MALL_X0, z: Z0, w: MALL_X1 - MALL_X0, d: Z1 - Z0 },
      devSpawn: { x: 0, z: 16, yaw: 0 },
    },
    { level: 0, label: '1F', theme: { zh: '潮玩与数码', en: 'Toys & Digital' }, indoor: fullIndoor },
    { level: 1, label: '2F', theme: { zh: '服饰与书香', en: 'Fashion & Books' }, indoor: fullIndoor },
    { level: 2, label: '3F', theme: { zh: '游乐', en: 'Play' }, indoor: fullIndoor },
    { level: 3, label: '4F', theme: { zh: '运动', en: 'Sports' }, indoor: fullIndoor },
    {
      level: 4,
      label: '5F',
      theme: { zh: '餐饮与天台', en: 'Dining & Rooftop' },
      indoor: { x: MALL_X0, z: Z0, w: X1 - MALL_X0, d: Z1 - Z0 },
      outdoor: [WEST_ANCHOR],
      // 室内与空中花园之间的分界墙（x = -50）：商业街正对的一段是门和两侧落地玻璃
      facadeOpenings: [
        { side: 'W', offset: 19, width: 3, kind: 'glazing' },
        { side: 'W', offset: 22, width: 8, height: 3.6, kind: 'door' },
        { side: 'W', offset: 30, width: 3, kind: 'glazing' },
      ],
    },
  ],
  shops,
  facilities,
  amenities,
  publicZones: [
    { id: 'plaza', label: { zh: '正门广场', en: 'Entrance Plaza' }, rect: { x: -40, z: Z1, w: 80, d: 18 }, floors: [0] },
    { id: 'lobby', label: { zh: '正门大堂', en: 'Main Lobby' }, rect: { x: -5, z: COURT_Z, w: 10, d: Z1 - COURT_Z }, floors: [0] },
    { id: 'market-hall', label: { zh: '超市前厅', en: 'Market Hall' }, rect: { x: MALL_X0, z: 1, w: 68, d: 25 }, floors: [-1] },
    { id: 'b1-west', label: { zh: '西侧通道', en: 'West Passage' }, rect: { x: MALL_X0, z: Z0, w: 8, d: 27 }, floors: [-1] },
    { id: 'b1-east', label: { zh: '东侧前厅', en: 'East Hall' }, rect: { x: 18, z: Z0, w: 32, d: 52 }, floors: [-1] },
    { id: 'center-court', label: { zh: '中央中庭', en: 'Center Court' }, rect: { x: -COURT_X, z: -COURT_Z, w: COURT_X * 2, d: COURT_Z * 2 }, floors: ABOVE_GROUND },
    { id: 'west-court', label: { zh: '西中庭', en: 'West Court' }, rect: { x: -42, z: -STREET, w: 22, d: STREET * 2 }, floors: ABOVE_GROUND },
    { id: 'east-court', label: { zh: '东中庭', en: 'East Court' }, rect: { x: 20, z: -STREET, w: 22, d: STREET * 2 }, floors: ABOVE_GROUND },
    { id: 'west-mall', label: { zh: '西商业街', en: 'West Mall' }, rect: { x: MALL_X0, z: -STREET, w: 38, d: STREET * 2 }, floors: ABOVE_GROUND },
    { id: 'east-mall', label: { zh: '东商业街', en: 'East Mall' }, rect: { x: COURT_X, z: -STREET, w: 38, d: STREET * 2 }, floors: ABOVE_GROUND },
  ],
  circulation: {
    stairs,
    escalators,
    elevators,
  },
};
