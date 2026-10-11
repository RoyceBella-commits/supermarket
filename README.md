# 商场漫游 · Mall Wander

在浏览器里自由逛的五层卡通商场（Vite + TypeScript + Three.js + Rapier）。规划见 `PLAN.md`（不在仓库里），目前完成**阶段 1：骨架、五层灰盒、第一人称、音乐系统**。

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
| W A S D / 方向键 | 移动 |
| Shift | 跑步 |
| 空格 | 跳跃 |
| 鼠标 | 视角（点击画面锁定鼠标） |
| M | 音乐面板 |
| L | 中文 / English |
| Esc | 暂停、释放鼠标 |

## 调试参数

| URL 参数 | 作用 |
|---|---|
| `?debug` | 碰撞线框、FPS、draw call 数、坐标 |
| `?map` | 当前楼层的平面图和玩家位置 |
| `?floor=3` | 直接传送到 3F 南侧回廊 |
| `?shop=kumo` | 传送到某家店门口（id 见 `src/data/mallLayout.ts`） |
| `?testbed` | 只加载调手感用的测试场（台阶、坡道、楼梯、矮墙） |
| `?bgmSeek=-5` | 内置 BGM 从循环接缝前 5 秒开始，用来听接缝；正数表示从第几秒开始 |

参数可以组合，例如 `?debug&map&floor=5`。浏览器控制台里有测试钩子 `window.__game`。

## 背景音乐

- **本机版**：`public/audio/bgm/playlist.local.json` + `local/reminiscence.m4a`。商业曲目，只在本机使用，已加入 `.gitignore`。
- **公开版**：`public/audio/bgm/playlist.json` + `public/*.m4a`，Open Goldberg Variations 里的 4 首钢琴曲（CC0），见 `CREDITS.md`。
- 游戏优先读本机版歌单，没有就用公开版，再没有就用代码合成的占位音乐。
- 音乐面板里可以一次导入多首本地歌曲（也可以拖进窗口），和内置曲目一起按列表循环 / 单曲循环 / 随机播放。导入的歌只在本次打开期间有效，文件不会上传到任何地方。
- 内置曲目的循环点和响度由 `tools/audio/` 的离线脚本生成，说明见 `tools/audio/README.md`。

## 目录

```
src/data/      布局与（将来的）台词数据：改布局只改 mallLayout.ts
src/world/     根据数据生成灰盒建筑、楼梯、招牌、区域判断
src/player/    输入与第一人称控制器（Rapier 角色控制器）
src/systems/   物理、音频（AudioEngine / MusicDirector / 歌单）
src/render/    渲染器与灰盒材质（阶段 2 换卡通渲染）
src/ui/        HUD、开始界面、音乐面板、中英文
tools/audio/   BGM 离线处理脚本（Python）
```
