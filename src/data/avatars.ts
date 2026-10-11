// 角色外观数据：纯数据，不依赖 three。
// tools/vrm/build.ts 读取这里，为每个条目生成 VRM 1.0：玩家 → public/models/player.vrm，
// 店员 → public/models/staff/<shopId>.vrm（见 avatarModelUrl）。
// 颜色一律写 sRGB 十六进制（和设计稿/取色器一致），生成时再转成线性色。
// 新增角色：往 avatars 里加一项，然后运行 `node tools/vrm/build.ts`。

export type HairStyle = 'short' | 'bob' | 'ponytail' | 'buzz' | 'bun' | 'long' | 'spiky' | 'curly';
/** apron = 围裙（里面那件由 innerTop 决定）；chef = 白色厨师服；vest = 衬衫 + 马甲；jersey = 运动球衣 */
export type TopStyle = 'hoodie' | 'tshirt' | 'apron' | 'shirt' | 'polo' | 'jersey' | 'chef' | 'vest';
export type BottomStyle = 'pants' | 'skirt' | 'shorts';
/** 头上的配饰（一次一个）；眼镜可以另外用 glasses: true 叠加 */
export type AccessoryStyle = 'none' | 'cap' | 'glasses' | 'sunhat' | 'chefhat' | 'beret' | 'headphones' | 'headband' | 'goggles';
export type NeckwearStyle = 'none' | 'bowtie' | 'tie' | 'scarf' | 'neckerchief';

export interface AvatarSpec {
  /** 唯一 id；店员用 staff-<shopId> */
  id: string;
  /** 店员所属店铺（src/data/mallLayout.ts 里的 shop id） */
  shopId?: string;
  displayName: { zh: string; en: string };
  /** 总身高（米，鞋底到头发/帽子顶）。默认 Q 版比例约 1.5 m，头约占 3.4 分之一。 */
  height: number;
  skinColor: string;
  hair: HairStyle;
  hairColor: string;
  eyeColor: string;
  top: TopStyle;
  /** 上衣主色；apron 时是围裙颜色，vest 时是马甲颜色，chef 时是厨师服颜色 */
  topColor: string;
  /** 次要色：卫衣口袋/罗纹、T 恤/Polo/球衣的领口和袖口、衬衫/厨师服纽扣；apron / vest 时是里面那件衣服的颜色 */
  innerColor?: string;
  /** apron 里面穿什么，默认 shirt */
  innerTop?: 'shirt' | 'tshirt' | 'polo';
  /** bib：带胸片的围裙（默认）；waist：只有腰下半截 */
  apronStyle?: 'bib' | 'waist';
  bottom: BottomStyle;
  bottomColor: string;
  shoeColor: string;
  /** 鞋底颜色，缺省时由鞋色推出 */
  soleColor?: string;
  /** 短裤/裙子时的袜子颜色，缺省为白色 */
  sockColor?: string;
  /** 袜子高度：ankle（默认）或 knee（运动长筒袜） */
  sockHeight?: 'ankle' | 'knee';
  accessory?: AccessoryStyle;
  /** 配饰主色（帽子、耳机、发带…），马尾/发髻的发圈也用它 */
  accessoryColor?: string;
  /** 配饰次色（帽带、帽扣、耳机外壳…） */
  accessoryAccent?: string;
  /** 戴眼镜（可以和帽子等同时戴） */
  glasses?: boolean;
  glassesColor?: string;
  neckwear?: NeckwearStyle;
  neckwearColor?: string;
  /** 胸前白色名牌 */
  nameTag?: boolean;
  /** 体型宽窄，1 = 标准，0.9–1.2 */
  girth?: number;
  /** 眼睛大小，1 = 标准（年长的角色可以小一点） */
  eyeScale?: number;
  /** 小胡子 */
  mustache?: boolean;
  /** 短发头顶的一撮呆毛；缺省：short 发型且不戴帽子时有 */
  ahoge?: boolean;
  /** 脸颊红晕强度 0–1，缺省 0.5 */
  blush?: number;
}

/** 游戏默认加载的玩家模型 id */
export const PLAYER_AVATAR_ID = 'player';

/** 店员模型路径（相对站点根目录，不带前导斜杠） */
export function staffModelUrl(shopId: string): string {
  return `models/staff/${shopId}.vrm`;
}

/** 任意角色的模型路径（相对站点根目录，不带前导斜杠）；文件在 public/ 下的同名路径 */
export function avatarModelUrl(spec: AvatarSpec): string {
  return spec.shopId ? staffModelUrl(spec.shopId) : `models/${spec.id}.vrm`;
}

const player: AvatarSpec = {
  id: 'player',
  displayName: { zh: '玩家', en: 'Player' },
  height: 1.5,
  skinColor: '#f8d6bf',
  hair: 'short',
  hairColor: '#4a3226',
  eyeColor: '#2b201c',
  top: 'hoodie',
  topColor: '#f2a93b',
  innerColor: '#e08f2c',
  bottom: 'pants',
  bottomColor: '#30406a',
  shoeColor: '#f7f4ee',
  soleColor: '#e2d7c6',
  accessory: 'none',
};

/**
 * 店员：每家主要店铺（mallLayout.ts 里 tier: 'main'）一位，制服用店铺主题色。
 * 性别、年龄和 src/data/npcDialogue.ts 里的人设/配音对应（注释里是那边的称呼）。
 */
type StaffInput = Omit<AvatarSpec, 'id' | 'shopId' | 'displayName' | 'nameTag'> & { name: string; nameTag?: boolean };
function staff(shopId: string, s: StaffInput): AvatarSpec {
  const { name, ...rest } = s;
  return { id: `staff-${shopId}`, shopId, displayName: { zh: `${name} 店员`, en: `${name} Staff` }, nameTag: true, ...rest };
}

const staffList: AvatarSpec[] = [
  // ---------- B1 ----------
  // 收银员 小麦：二十出头，元气满满
  staff('dailyharvest', {
    name: 'Daily Harvest', height: 1.46, eyeScale: 1.05, blush: 0.7,
    skinColor: '#f3c9a8', hair: 'bun', hairColor: '#5a3a28', eyeColor: '#3a2620', accessoryColor: '#ffd166',
    top: 'apron', topColor: '#2d6a4f', innerTop: 'polo', innerColor: '#ffd166',
    bottom: 'pants', bottomColor: '#3d3a36', shoeColor: '#5a4a40',
  }),
  // ---------- 1F ----------
  // 店长 阿凯：25 岁左右的资深玩家
  staff('pixelfox', {
    name: 'PixelFox', height: 1.55,
    skinColor: '#f6d1b5', hair: 'spiky', hairColor: '#2a2230', eyeColor: '#2b201c',
    top: 'hoodie', topColor: '#1a1a2e', innerColor: '#ff6b35',
    bottom: 'pants', bottomColor: '#3a3f4a', shoeColor: '#ff6b35', soleColor: '#f4f1ea',
    accessory: 'headphones', accessoryColor: '#ff6b35', accessoryAccent: '#1a1a2e',
  }),
  // 产品顾问 诺娃：二十多岁的科技控
  staff('orbit', {
    name: 'Orbit', height: 1.5,
    skinColor: '#f8d6bf', hair: 'bob', hairColor: '#1f1b1b', eyeColor: '#2b201c',
    top: 'polo', topColor: '#3a86ff', innerColor: '#e0e7ff',
    bottom: 'skirt', bottomColor: '#2b3a67', sockColor: '#e0e7ff', shoeColor: '#2b2b33',
  }),
  // 店长 方叔：四十多岁，一丝不苟的积木大叔
  staff('bricknest', {
    name: 'BrickNest', height: 1.55, girth: 1.1, eyeScale: 0.92, ahoge: false,
    skinColor: '#e0ac84', hair: 'short', hairColor: '#3b3330', eyeColor: '#2b201c',
    glasses: true, glassesColor: '#2b2320',
    top: 'apron', topColor: '#f6c445', innerTop: 'polo', innerColor: '#e94f37',
    bottom: 'pants', bottomColor: '#3a5a8a', shoeColor: '#e94f37', soleColor: '#f4f1ea',
  }),
  // 摄影师 林岚：三十岁左右，酷酷的
  staff('kaze', {
    name: 'Kaze', height: 1.53, eyeScale: 0.95, blush: 0.35,
    skinColor: '#f3c9a8', hair: 'bob', hairColor: '#1f1b1b', eyeColor: '#2b201c',
    top: 'shirt', topColor: '#2b2d42', innerColor: '#ef233c', neckwear: 'neckerchief', neckwearColor: '#ef233c',
    bottom: 'pants', bottomColor: '#4a4a52', shoeColor: '#2a2422',
  }),
  // 店员 星星：十八九岁的开盒少女
  staff('blindstar', {
    name: 'BlindStar', height: 1.42, eyeScale: 1.08, blush: 0.85,
    skinColor: '#f8d6bf', hair: 'ponytail', hairColor: '#e88aa8', eyeColor: '#4a2a3a', accessoryColor: '#ffc6e0',
    top: 'tshirt', topColor: '#8e6cef', innerColor: '#ffc6e0',
    bottom: 'skirt', bottomColor: '#ffc6e0', sockColor: '#ffffff', sockHeight: 'knee', shoeColor: '#8e6cef',
  }),
  // 店员 阿杰：二十出头的追番迷
  staff('dimhub', {
    name: 'DimHub', height: 1.52,
    skinColor: '#c99673', hair: 'curly', hairColor: '#2b2320', eyeColor: '#2b201c',
    glasses: true, glassesColor: '#2b2320',
    top: 'hoodie', topColor: '#2ec4b6', innerColor: '#ff9f1c',
    bottom: 'pants', bottomColor: '#33415c', shoeColor: '#ff9f1c', soleColor: '#f4f1ea',
  }),
  // ---------- 2F ----------
  // 裁缝 严师傅：六十岁左右的老派绅士
  staff('threadco', {
    name: 'Thread&Co', height: 1.55, eyeScale: 0.88, mustache: true, ahoge: false,
    skinColor: '#f6d1b5', hair: 'short', hairColor: '#9a958f', eyeColor: '#2b201c',
    glasses: true, glassesColor: '#6b5a3a',
    top: 'vest', topColor: '#264653', innerColor: '#ffffff', neckwear: 'tie', neckwearColor: '#e9c46a',
    bottom: 'pants', bottomColor: '#264653', shoeColor: '#3b2a22',
  }),
  // 造型师 小卢：二十七八岁，热情夸张的男造型师
  staff('lumi', {
    name: 'Lumi', height: 1.57, blush: 0.6,
    skinColor: '#f8d6bf', hair: 'spiky', hairColor: '#e2b860', eyeColor: '#5a3a28',
    top: 'shirt', topColor: '#fff1e6', innerColor: '#f4a6b7', neckwear: 'scarf', neckwearColor: '#f4a6b7',
    bottom: 'pants', bottomColor: '#e899a8', shoeColor: '#fff1e6', soleColor: '#c97b8a',
  }),
  // 店员 小诺：二十出头，害羞的文具控
  staff('nibnote', {
    name: 'Nib & Note', height: 1.46,
    skinColor: '#f3c9a8', hair: 'bob', hairColor: '#8a5232', eyeColor: '#3a2620',
    accessory: 'beret', accessoryColor: '#ef8354',
    top: 'polo', topColor: '#fdf0d5', innerColor: '#ef8354',
    bottom: 'skirt', bottomColor: '#7a5a48', sockColor: '#fdf0d5', shoeColor: '#6b4430',
  }),
  // 咖啡师 阿云：三十多岁，淡定（男，扎小揪揪）
  staff('kumo', {
    name: 'Kumo Coffee', height: 1.56,
    skinColor: '#e0ac84', hair: 'bun', hairColor: '#3b2a22', eyeColor: '#2b201c', accessoryColor: '#3b2a22',
    top: 'apron', topColor: '#7fa99b', innerTop: 'shirt', innerColor: '#fdf6ec',
    bottom: 'pants', bottomColor: '#5a4636', shoeColor: '#3b2a22',
  }),
  // 店主 温奶奶：六十多岁
  staff('marginbooks', {
    name: 'Margin Books', height: 1.44, eyeScale: 0.9, blush: 0.35,
    skinColor: '#f6d1b5', hair: 'bun', hairColor: '#bdb6b0', eyeColor: '#3a2a22', accessoryColor: '#6b4f3a',
    glasses: true, glassesColor: '#6b4f3a',
    top: 'shirt', topColor: '#f2e8cf', innerColor: '#6b4f3a', neckwear: 'scarf', neckwearColor: '#6b4f3a',
    bottom: 'skirt', bottomColor: '#6b4f3a', sockColor: '#f2e8cf', shoeColor: '#4a3528',
  }),
  // ---------- 3F ----------
  // 教练 雷哥：三十多岁，热血
  staff('turbokart', {
    name: 'TurboKart', height: 1.53,
    skinColor: '#c99673', hair: 'short', hairColor: '#6b4430', eyeColor: '#2b201c',
    accessory: 'cap', accessoryColor: '#d62828', accessoryAccent: '#fcbf49',
    top: 'polo', topColor: '#d62828', innerColor: '#fcbf49',
    bottom: 'pants', bottomColor: '#2b2b33', shoeColor: '#fcbf49', soleColor: '#2b2b33',
  }),
  // 管理员 琪姐：四十岁左右，爽朗的大姐
  staff('coinplanet', {
    name: 'CoinPlanet', height: 1.5, girth: 1.06, eyeScale: 0.95, blush: 0.6,
    skinColor: '#f6d1b5', hair: 'bob', hairColor: '#4cc9f0', eyeColor: '#3a2a4a',
    accessory: 'headband', accessoryColor: '#7209b7',
    top: 'tshirt', topColor: '#7209b7', innerColor: '#4cc9f0',
    bottom: 'pants', bottomColor: '#2b2440', shoeColor: '#ffffff', soleColor: '#7209b7',
  }),
  // 体验官 阿泽：二十多岁，迷迷糊糊
  staff('blinkvr', {
    name: 'BlinkVR', height: 1.57,
    skinColor: '#a8734f', hair: 'short', hairColor: '#1f1b1b', eyeColor: '#2b201c',
    accessory: 'goggles', accessoryColor: '#03045e', accessoryAccent: '#00b4d8',
    top: 'tshirt', topColor: '#00b4d8', innerColor: '#03045e',
    bottom: 'pants', bottomColor: '#03045e', shoeColor: '#ffffff', soleColor: '#00b4d8',
  }),
  // ---------- 4F ----------
  // 教练 安娜：二十八岁左右的健身教练
  staff('arc', {
    name: 'Arc', height: 1.55,
    skinColor: '#a8734f', hair: 'ponytail', hairColor: '#2b2320', eyeColor: '#2b201c', accessoryColor: '#277da1',
    top: 'jersey', topColor: '#f3722c', innerColor: '#277da1',
    bottom: 'shorts', bottomColor: '#277da1', sockColor: '#ffffff', sockHeight: 'knee', shoeColor: '#277da1', soleColor: '#ffffff',
  }),
  // 跑者 老马：五十岁左右，跑了二十年马拉松
  staff('stride', {
    name: 'Stride', height: 1.6, eyeScale: 0.9, mustache: true,
    skinColor: '#7a4f36', hair: 'buzz', hairColor: '#5a5550', eyeColor: '#1f1714',
    accessory: 'headband', accessoryColor: '#1b4332',
    top: 'jersey', topColor: '#80b918', innerColor: '#1b4332',
    bottom: 'shorts', bottomColor: '#1b4332', sockColor: '#ffffff', shoeColor: '#80b918', soleColor: '#ffffff',
  }),
  // 店员 小羽：二十岁左右，好胜的羽毛球少女
  staff('shuttle', {
    name: 'Shuttle', height: 1.47,
    skinColor: '#f3c9a8', hair: 'ponytail', hairColor: '#3b2a22', eyeColor: '#2b201c',
    accessory: 'headband', accessoryColor: '#f9c74f',
    top: 'jersey', topColor: '#4361ee', innerColor: '#f9c74f',
    bottom: 'skirt', bottomColor: '#ffffff', sockColor: '#ffffff', sockHeight: 'knee', shoeColor: '#4361ee', soleColor: '#ffffff',
  }),
  // ---------- 5F ----------
  // 园丁 陶爷爷：七十岁左右
  staff('garden', {
    name: 'Skyline Garden', height: 1.52, girth: 1.08, eyeScale: 0.9, mustache: true, blush: 0.4,
    skinColor: '#e0ac84', hair: 'short', hairColor: '#d9d4cf', eyeColor: '#2b201c',
    accessory: 'sunhat', accessoryColor: '#e9d8a6', accessoryAccent: '#52b788',
    top: 'apron', topColor: '#52b788', innerTop: 'shirt', innerColor: '#d8f3dc',
    bottom: 'pants', bottomColor: '#6b5a45', shoeColor: '#5a4636',
  }),
  // 引座员 朵拉：三十岁左右，戏精
  staff('cinema', {
    name: 'Starlight Cinema', height: 1.5,
    skinColor: '#f8d6bf', hair: 'long', hairColor: '#2b2320', eyeColor: '#2b201c',
    top: 'vest', topColor: '#22223b', innerColor: '#ffffff', neckwear: 'bowtie', neckwearColor: '#f2cc8f',
    bottom: 'pants', bottomColor: '#22223b', shoeColor: '#1a1a1a',
  }),
  // 大厨 老周：四十多岁，乐呵呵
  staff('foodalley', {
    name: 'Food Alley', height: 1.5, girth: 1.18, mustache: true, eyeScale: 0.95,
    skinColor: '#f3c9a8', hair: 'short', hairColor: '#3b2a22', eyeColor: '#2b201c',
    accessory: 'chefhat', accessoryColor: '#ffffff',
    top: 'chef', topColor: '#ffffff', innerColor: '#2b2b33', neckwear: 'neckerchief', neckwearColor: '#f9844a',
    bottom: 'pants', bottomColor: '#2b2b33', shoeColor: '#2b2b33',
  }),
];

export const avatars: AvatarSpec[] = [player, ...staffList];

export function getAvatar(id: string): AvatarSpec | undefined {
  return avatars.find((a) => a.id === id);
}

/** 某家店的店员外观 */
export function getStaffAvatar(shopId: string): AvatarSpec | undefined {
  return avatars.find((a) => a.shopId === shopId);
}
