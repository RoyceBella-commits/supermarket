// 角色外观数据：纯数据，不依赖 three。
// tools/vrm/build.ts 读取这里，为每个条目生成 public/models/<id>.vrm（VRM 1.0）。
// 颜色一律写 sRGB 十六进制（和设计稿/取色器一致），生成时再转成线性色。
// 新增角色：往 avatars 里加一项，然后运行 `node tools/vrm/build.ts`。

export type HairStyle = 'short' | 'bob' | 'ponytail' | 'buzz' | 'bun';
export type TopStyle = 'hoodie' | 'tshirt' | 'apron' | 'shirt';
export type BottomStyle = 'pants' | 'skirt' | 'shorts';
export type AccessoryStyle = 'cap' | 'glasses' | 'none';

export interface AvatarSpec {
  /** 文件名：public/models/<id>.vrm */
  id: string;
  displayName: { zh: string; en: string };
  /** 总身高（米，鞋底到头发顶）。默认 Q 版比例约 1.5 m，头约占 3.4 分之一。 */
  height: number;
  skinColor: string;
  hair: HairStyle;
  hairColor: string;
  eyeColor: string;
  top: TopStyle;
  /** 上衣主色；top 为 apron 时是围裙颜色 */
  topColor: string;
  /** 次要色：卫衣的口袋/罗纹、T 恤领口、衬衫纽扣；top 为 apron 时是围裙里面那件衬衫的颜色 */
  innerColor?: string;
  bottom: BottomStyle;
  bottomColor: string;
  shoeColor: string;
  /** 鞋底颜色，缺省时由鞋色推出 */
  soleColor?: string;
  /** 短裤/裙子时的袜子颜色，缺省为白色 */
  sockColor?: string;
  accessory?: AccessoryStyle;
  /** 帽子/眼镜框颜色 */
  accessoryColor?: string;
  /** 脸颊红晕强度 0–1，缺省 0.5 */
  blush?: number;
}

/** 游戏默认加载的玩家模型 id（构建时另外写一份到 public/models/player.vrm） */
export const PLAYER_AVATAR_ID = 'player';

export const avatars: AvatarSpec[] = [
  {
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
  },
  {
    id: 'staff-demo',
    displayName: { zh: '店员（示例）', en: 'Staff (demo)' },
    height: 1.47,
    skinColor: '#f6d1b5',
    hair: 'ponytail',
    hairColor: '#7b4a2d',
    eyeColor: '#3a2620',
    top: 'apron',
    topColor: '#3f8a63',
    innerColor: '#fbf6ec',
    bottom: 'skirt',
    bottomColor: '#4a4560',
    shoeColor: '#5a3b2e',
    sockColor: '#ffffff',
    accessory: 'none',
  },
];

export function getAvatar(id: string): AvatarSpec | undefined {
  return avatars.find((a) => a.id === id);
}
