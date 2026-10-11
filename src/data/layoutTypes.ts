// 商场布局数据的类型定义。
// 坐标约定：单位米；x 向东，z 向南（N 表示 -z 方向）；y 向上。楼层编号从 0 开始（0 = 1F）。
// 楼层 L 的地面高度 = L × building.floorHeight。

export interface I18nText {
  zh: string;
  en: string;
}

/** 水平矩形：最小角 (x, z) 加宽 w（沿 x）和深 d（沿 z）。 */
export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

export type Side = 'N' | 'S' | 'E' | 'W';

/**
 * 墙上的开口。offset 从该边的起点量起：N/S 边从西端（最小 x）开始，E/W 边从北端（最小 z）开始。
 * - door / storefront / gate：门洞，可以走过去
 * - glazing：玻璃窗，挡人但透光
 */
export interface Opening {
  side: Side;
  offset: number;
  width: number;
  height?: number;
  kind?: 'door' | 'storefront' | 'gate' | 'glazing';
}

export type ShopCategory =
  | 'bricks'
  | 'blindbox'
  | 'fanmerch'
  | 'devices'
  | 'camera'
  | 'consoles'
  | 'menswear'
  | 'womenswear'
  | 'books'
  | 'cafe'
  | 'karting'
  | 'arcade'
  | 'vr'
  | 'running'
  | 'badminton'
  | 'sports'
  | 'foodcourt'
  | 'cinema'
  | 'garden';

/** shop：普通店铺；foodcourt：开放式美食广场；cinema：影院；outdoor：室外区域（无墙无顶）。 */
export type ShopKind = 'shop' | 'foodcourt' | 'cinema' | 'outdoor';

export interface ShopDef {
  id: string;
  /** 英文店名，招牌和 HUD 都用它 */
  name: string;
  category: ShopCategory;
  kind: ShopKind;
  floor: number;
  rect: Rect;
  /** entrances[0] 是主入口，招牌挂在这里 */
  entrances: Opening[];
  /** 向上占几层的高度（影院挑高用），默认 1 */
  spanFloors?: number;
  /** 招牌和灰盒墙面用的主题色 */
  theme: { primary: string; accent: string };
  /** 阶段 4：店内布置模板与店员位置 */
  interior?: { template?: string; seed?: number };
  npcSpot?: { x: number; z: number };
}

/** 非店铺的功能房间：洗手间、空置铺位等。 */
export interface FacilityDef {
  id: string;
  kind: 'restroom' | 'vacant' | 'service';
  label: I18nText;
  floor: number;
  rect: Rect;
  entrances: Opening[];
}

export interface FloorDef {
  level: number;
  label: string;
  theme: I18nText;
  /** 室内范围；外墙沿它的边生成 */
  indoor: Rect;
  /** 室外平台（女儿墙围合、无顶） */
  outdoor?: Rect[];
  /** 室内外分界墙上的开口（门、玻璃窗） */
  facadeOpenings?: Opening[];
  /** 楼板额外挖空的区域 */
  voids?: Rect[];
}

/**
 * 封闭的双跑楼梯间。rect 含墙体，尺寸固定为 3.6 × 9.0（长边沿进深方向）。
 * front 是门所在的一侧（门朝向走廊）。floors 为连通的最低层和最高层。
 */
export interface StairDef {
  id: string;
  label: I18nText;
  rect: Rect;
  front: Side;
  floors: [number, number];
}

/** 阶段 3 实现：扶梯。foot 为下端中心，heading 为上行方向。 */
export interface EscalatorDef {
  id: string;
  fromFloor: number;
  dir: 'up' | 'down';
  foot: { x: number; z: number };
  heading: Side;
  width: number;
}

/** 阶段 3 实现：观光电梯。 */
export interface ElevatorDef {
  id: string;
  rect: Rect;
  floors: number[];
  doorSide: Side;
  glass: boolean;
}

/** 公共区域（HUD 显示用），按数组顺序优先匹配。floors 省略表示所有楼层。 */
export interface PublicZoneDef {
  id: string;
  label: I18nText;
  rect: Rect;
  floors?: number[];
}

export interface MallLayout {
  name: I18nText;
  building: {
    /** 外轮廓（室内墙面所在位置），外墙在它外侧 */
    outline: Rect;
    floorHeight: number;
    slab: number;
    extWall: number;
    partition: number;
    doorHeight: number;
    storefrontHeight: number;
    railHeight: number;
  };
  atrium: { rect: Rect; skylight: boolean };
  /** 1F 正门（开在外墙上） */
  mainEntrance: Opening;
  /** 楼外广场（只有 1F），三面有隐形边界 */
  plaza: Rect;
  spawn: { floor: number; x: number; z: number; yaw: number };
  floors: FloorDef[];
  shops: ShopDef[];
  facilities: FacilityDef[];
  publicZones: PublicZoneDef[];
  circulation: {
    stairs: StairDef[];
    escalators: EscalatorDef[];
    elevators: ElevatorDef[];
  };
}
