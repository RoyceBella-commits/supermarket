# 商场漫游 · Mall Wander

在浏览器里自由逛的卡通商场（Vite + TypeScript + Three.js + Rapier + three-vrm）。规划见 `PLAN.md`（不在仓库里）。

- 已完成：阶段 1（骨架、灰盒、第一人称、音乐系统）、阶段 2（卡通渲染、VRM 角色、第三人称）、阶段 3（扶梯、观光电梯）、阶段 4（店员与对话、店内布置、座位、店铺 logo、装饰插图）。
- 商场：136 × 52 m 的“哑铃型”线形商场，B1 + 1F–5F。两端是主力店，中间 100 m 商业街，有中央中庭和东西两个扶梯挑空。
- 店铺：21 家主要店（有店员、台词和配音）+ 35 家配角店（只有店面和内部布置）。影院、空中花园和卡丁车场的内部在阶段 5 做。

## 运行

需要 Node.js 20+（开发时用的是 24）。

```bash
npm install
npm run dev
```

然后用 Chrome 打开 <http://127.0.0.1:5173/>，点击画面开始。

- `npm run typecheck`：类型检查
- `npm run build`：类型检查 + 打包到 `dist/`；`npm run preview` 预览打包结果

> 项目放在 exFAT 移动硬盘上：`.npmrc` 关掉了 npm 的 bin 链接（exFAT 不支持符号链接），所以脚本直接用 `node node_modules/...` 调用工具。
> 改了文件页面没自动刷新时，用 `VITE_POLL=1 npm run dev` 改成轮询监听。

## 操作

| 按键 | 作用 |
|---|---|
| W A S D / 方向键 | 移动（第三人称时相对镜头方向） |
| Shift | 跑步 |
| 空格 | 跳跃 |
| 鼠标 | 视角（点击画面锁定鼠标） |
| E | 互动：和店员对话（再按 E 下一句）、坐下 / 站起来、在电梯门口呼梯、在轿厢里打开楼层面板（数字键 1–5 / B 选层） |
| V | 切换第一 / 第三人称（默认第三人称） |
| 滚轮 | 第三人称镜头远近 |
| M | 音乐面板 |
| L | 中文 / English |
| Esc | 暂停、释放鼠标 |

## 调试参数

| URL 参数 | 作用 |
|---|---|
| `?debug` | 碰撞线框、FPS、draw call 数、坐标 |
| `?map` | 当前楼层的平面图和玩家位置 |
| `?floor=3` | 直接传送到 3F 中庭旁 |
| `?shop=kumo` | 传送到某家店门口（id 见 `src/data/mallLayout.ts`） |
| `?floor=B1` | 地下超市前厅（`?floor=1`–`5` 对应 1F–5F） |
| `?view=first` | 开局用第一人称 |
| `?nofx` | 关闭描边和泛光（排查画面问题或低配电脑） |
| `?testbed` | 只加载调手感用的测试场（台阶、坡道、楼梯、矮墙） |
| `?bgmSeek=-5` | 内置 BGM 从循环接缝前 5 秒开始，用来听接缝；正数表示从第几秒开始 |

参数可以组合，例如 `?debug&map&floor=5`。浏览器控制台里有测试钩子 `window.__game`。

## 扶梯和电梯

- 扶梯在东西两个挑空里，北侧上行、南侧下行（入口扶手端有绿色方向牌），1.2 m/s，站上去自动走，也可以边走边乘。东侧扶梯一直通到 B1。
- 观光电梯在中央中庭南缘，停 B1–5F：门口按 E 呼梯，进轿厢按 E 选楼层。

## 店员和对话

- 21 家主要店各有一位店员（原创 Q 版 VRM，`public/models/staff/<店铺 id>.vrm`），大多站在收银台后面。靠近时会转头看你，按 E 对话，再按 E 下一句，台词循环；走开对话框自动关闭。
- 台词在 `src/data/npcDialogue.ts`：语音是中文，英文界面下字幕显示英文翻译。
- 配音由本机 Qwen3-TTS VoiceDesign 离线生成到 `public/audio/voice/`（流程见 `tools/voice/README.md`）。说话时 BGM 自动压低；某句没有配音时只显示字幕。

## 座位

商场里的椅子都能坐：公共长椅、咖啡店和餐厅的椅子、美食广场、吧台凳、店内休息沙发、试鞋凳等。走到椅子旁按 E 坐下，按 E 或移动 / 跳跃站起来。

## 店内布置和装饰

- 店内家具和商品按品类模板生成（`src/world/interiors/`），布局参考日本、美国商场的常见做法：门口留通道和展示台，靠墙高货架、中间矮中岛，收银台在中部侧面或靠里。
- 店铺招牌是代码画的原创 logo（品类图标 + 字标，`src/world/logos.ts`）。
- 海报、菜单板、书封、盲盒卡、积木盒、美食图等 16 张无文字插图由 Codex 生成（`tools/decor/`，见 `CREDITS.md`），游戏运行时按店铺加载。

## 角色模型

- 默认角色 `public/models/player.vrm` 由 `tools/vrm/` 的脚本用代码生成（原创 Q 版，见 `tools/vrm/README.md`）。
- 换成自己的角色：把任意 VRM 文件（VRoid Studio 导出的也行，0.x / 1.0 都支持）命名为 `player.vrm` 放到 `public/models/` 覆盖即可。游戏会按模型身高自动调整碰撞体和第一人称眼睛高度。
- 动画是代码驱动的（待机、走、跑、跳），不需要动画文件。

## 背景音乐

- **本机版**：`public/audio/bgm/playlist.local.json` + `local/reminiscence.m4a`。商业曲目，只在本机使用，已加入 `.gitignore`。
- **公开版**：`public/audio/bgm/playlist.json` + `public/*.m4a`，Open Goldberg Variations 里的 4 首钢琴曲（CC0），见 `CREDITS.md`。
- 游戏优先读本机版歌单，没有就用公开版，再没有就用代码合成的占位音乐。
- 音乐面板里可以一次导入多首本地歌曲（也可以拖进窗口），和内置曲目一起按列表循环 / 单曲循环 / 随机播放。导入的歌只在本次打开期间有效，文件不会上传到任何地方。
- 内置曲目的循环点和响度由 `tools/audio/` 的离线脚本生成，说明见 `tools/audio/README.md`。

## 目录

```
src/data/      布局、角色参数、店员台词：改布局只改 mallLayout.ts
src/world/     根据数据生成建筑、楼梯、扶梯、电梯、招牌与 logo、店内布置、装饰图
src/npc/       店员（懒加载模型、看向玩家、对话）
src/player/    输入、角色控制器、VRM 角色与程序动画、镜头
src/systems/   物理、互动、座位、音频（AudioEngine / MusicDirector / 歌单 / 配音）
src/render/    卡通渲染与后处理
src/ui/        HUD、开始界面、音乐面板、电梯面板、对话框、中英文
tools/audio/   BGM 离线处理脚本（Python）
tools/vrm/     VRM 角色生成器
tools/voice/   店员配音生成（Qwen3-TTS VoiceDesign）
tools/decor/   装饰插图生成与处理（Codex）
```
