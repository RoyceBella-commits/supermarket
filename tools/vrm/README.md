# VRM 角色生成器（tools/vrm）

纯代码生成原创 Q 版角色（VRM 1.0）：几何体全部用 three.js 的数学在 Node 里拼出来，没有贴图，
颜色都是材质色，五官是贴在脸上的小圆片（带表情 morph）。生成结果可以在任何支持 VRM 1.0 的软件里打开。

## 常用命令

项目在 exFAT 盘上、没有 npm bin 链接，所以直接用 node 跑（Node 22.18+ / 23.6+ 能直接执行 `.ts`（类型擦除，所以本目录只用可擦除的 TS 语法、import 带 `.ts` 后缀），开发时用的是 24）：

```bash
node tools/vrm/build.ts                # 生成 src/data/avatars.ts 里的全部角色：玩家 → public/models/player.vrm，
                                       # 店员 → public/models/staff/<shopId>.vrm（路径见 avatarModelUrl / staffModelUrl）
node tools/vrm/build.ts --only=player  # 只生成一个（id 或 shopId）
node tools/vrm/build.ts --variants     # 另外生成各种发型/服装组合到 tools/vrm/work/（不进仓库，测试用）
node tools/vrm/validate.ts             # 校验 public/models 下的角色（加 --variants 连测试组合一起）
node tools/vrm/validate.ts some.vrm    # 校验任意 VRM 文件
node node_modules/typescript/bin/tsc -p tools/vrm   # 类型检查本目录
```

预览页（先 `npm run dev`）：<http://127.0.0.1:5173/tools/vrm/preview.html>

- 按钮可以切表情（blink / happy / aa / surprised …）、姿势（T-pose、放下手、挥手、屈膝、走路、转头）、视角（含"第一人称"：模拟游戏里头部隐藏后的视角）。
- URL 参数：`?staff` 只看 21 个店员（按行排开、头顶标店名）；`?variants` 一起加载 tools/vrm/work/ 下的测试组合；
  `?only=player` 或 `?only=kumo,arc` 只看这几个（id 或 shopId）；`?pose=walk` 初始姿势；`?nopanel` 隐藏面板（截图用）。
- 控制台里有 `window.__preview`（setExpr / setPose / setView / camera …）方便自动化检查。

`validate.ts` 检查：Khronos glTF Validator 0 error；three.js `GLTFLoader` + `@pixiv/three-vrm` 在 Node 里能加载为 VRM 1.0；
必需人形骨骼齐全且都是"只有平移"（旋转为单位、缩放为 1）；T-pose；表情齐全；所有网格都是 MToon；
第一人称标注存在，且 `firstPerson.setup()` 之后头/脸网格只在 thirdPersonOnly 图层、第一人称相机离可见几何至少 0.18 m；
包围盒高度 = spec.height、脚底在 y=0；脸在 +Z 一侧、blinkLeft 只动 +X 一侧的眼睛。

## 店员

`src/data/avatars.ts` 里每家主要店铺（`mallLayout.ts` 中 `tier: 'main'` 的 21 家）一位店员，id 为 `staff-<shopId>`，
用 `staff(shopId, {...})` 写；制服用店铺主题色，性别/年龄和 `npcDialogue.ts` 的人设、配音对应。
游戏里用 `staffModelUrl(shopId)`（= `models/staff/<shopId>.vrm`，相对路径、无前导斜杠）或 `getStaffAvatar(shopId)`。
`validate.ts` 会检查店员和主要店铺一一对应。

体积：每个约 340–420 KB（21 个店员合计约 7.8 MB）。面数按"2–5 m 外看不出棱角"控制：发壳列在刘海处加密、
后脑稀疏；颜色和描边相同的材质合并成一个图元；访问器不写名字。

## 加一个角色

在 `src/data/avatars.ts` 的 `avatars` 数组里加一项，然后跑 build + validate：

```ts
{
  id: 'cafe-01',                       // → public/models/cafe-01.vrm
  displayName: { zh: '咖啡店店员', en: 'Café staff' },
  height: 1.46,                        // 总高（鞋底到头发/发髻顶），米
  skinColor: '#f3c9a8',
  hair: 'bob',                         // short | bob | ponytail | buzz | bun | long | spiky | curly
  hairColor: '#6b3f2a',
  eyeColor: '#2b201c',
  top: 'apron',                        // hoodie | tshirt | shirt | polo | jersey | chef | vest | apron
  topColor: '#8a5a3b',                 // apron：围裙色；vest：马甲色；chef：厨师服色
  innerColor: '#fbf6ec',               // 口袋/领口/袖口/纽扣；apron、vest 时是里面那件的颜色
  innerTop: 'shirt',                   // apron 里面穿什么：shirt | tshirt | polo
  apronStyle: 'bib',                   // bib（带胸片）| waist（半身）
  bottom: 'pants',                     // pants | skirt | shorts
  bottomColor: '#2b2b33',
  shoeColor: '#3b2f2a',
  soleColor: '#d8cfc2',                // 可选
  sockColor: '#ffffff',                // 可选（裙子/短裤时露出来）
  sockHeight: 'ankle',                 // ankle | knee
  accessory: 'none',                   // none | cap | sunhat | chefhat | beret | headphones | headband | goggles | glasses
  accessoryColor: '#3b2a24',           // 配饰主色；马尾/发髻的发圈也用它
  accessoryAccent: '#ffffff',          // 配饰次色（帽带、帽扣…）
  glasses: true,                       // 眼镜可以和帽子同时戴
  glassesColor: '#3b2a24',
  neckwear: 'none',                    // none | bowtie | tie | scarf | neckerchief
  neckwearColor: '#c0392b',
  nameTag: true,                       // 胸前白色名牌（店员默认有）
  girth: 1,                            // 体型宽窄 0.9–1.2
  eyeScale: 1,                         // 眼睛大小（年长的角色 0.88–0.95）
  mustache: false,
  ahoge: true,                         // short 发型的呆毛；戴帽子时默认没有
  blush: 0.5,                          // 腮红 0–1
}
```

颜色写 sRGB 十六进制，生成时自动转成线性色，并推出 MToon 的阴影色（更暖、略暗）和描边色（同色系深色）。
`height` 是鞋底到**头发顶**的高度；帽子、厨师帽、耳机不算在内（包围盒会高一点，validate 对戴帽子的角色放宽了检查）。

玩家默认模型是 `PLAYER_AVATAR_ID`（= `player`）→ `public/models/player.vrm`。游戏只认这个路径，
用户可以直接换成任意 VRM 1.0 文件。

## 坐标与骨骼约定

- 单位米，Y 向上，**角色面向 +Z**，角色的左手在 **+X**，脚底在 y=0。
- 骨骼是 **T-pose**（手臂沿 ±X 伸直），所有骨骼节点只有平移（旋转为单位四元数、缩放为 1）。
- 人形骨骼：hips、spine、chest、neck、head、left/right Shoulder、UpperArm、LowerArm、Hand、UpperLeg、LowerLeg、Foot。
  另有非人形骨：`HairTail1–4`（马尾）、`StringLeft/Right1–3`（卫衣抽绳），都挂了 `VRMC_springBone`。
- 所有角色共用同一套骨架比例（身高只做整体等比缩放），所以一套动画可以给所有人用。
- 一个 Skin 覆盖全部骨骼；三个蒙皮网格：
  - `Body`（身体、衣服、手、腿、鞋）— firstPerson `both`
  - `Head`（头、耳朵、鼻子、脖子、头发、帽子/眼镜）— `thirdPersonOnly`
  - `Face`（眼睛、高光、眉毛、嘴、腮红，带 morph target）— `thirdPersonOnly`
- 蒙皮基本是每个部件刚性绑定到一块骨骼，关节处用圆球/胶囊圆头遮住接缝；躯干在 Hips→Spine→Chest 之间线性过渡。
- `lookAt` 用 expression 方式（lookUp/Down/Left/Right 是移动眼睛的 morph），`offsetFromHeadBone` 指向两眼中点。
- 表情（preset）：happy、angry、sad、relaxed、surprised、aa、ih、ou、ee、oh、blink、blinkLeft、blinkRight、lookUp、lookDown、lookLeft、lookRight。
  情绪类表情的 `overrideBlink` 是 `blend`（笑眯眼时不会再叠一次眨眼）。

## 代码结构

```
build.ts        入口：遍历 avatars → buildAvatar → 写文件
validate.ts     校验（glTF Validator + three-vrm 加载检查）
preview.html/ts 浏览器预览页
variants.ts     测试组合（只写到 work/）
lib/rig.ts      骨骼与基准尺寸（基准身高约 1.5 m，最后整体等比缩放到 spec.height）
lib/geom.ts     几何工具：网格曲面、旋转体、胶囊、圆环、扫掠管、镜像、法线
lib/head.ts     头型（下半略收窄的椭球）、脸部投影
lib/hair.ts     发型（"发壳"按列生成截面：外表面 → 卷边 → 收进头皮；可下垂做波波头/长发）、刘海阴影
lib/face.ts     五官与 16 个 morph target
lib/body.ts     身体和服装（卫衣/T 恤/Polo/球衣/衬衫/厨师服，马甲/围裙外层，领饰，名牌）
lib/accessories.ts  帽子、草帽、厨师帽、贝雷帽、耳机、发带、VR 眼镜、眼镜
lib/avatar.ts   组装：材质（MToon 参数）、蒙皮权重、缩放、写 glTF 文档、表情/第一人称/spring bone
lib/vrmExt.ts   gltf-transform 自定义扩展：VRMC_vrm、VRMC_materials_mtoon、VRMC_springBone
lib/colors.ts   sRGB/线性转换，阴影色与描边色
```

所有角色都是原创生成，meta 里的授权：允许所有人使用、允许企业商用、允许再分发和修改再分发、无需署名，
作者 `Mall Wander (generated)`。
