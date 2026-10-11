# 装饰插图（decor）生成说明

商场里海报、菜单板、书封、盲盒、积木盒、美食图等无文字装饰插图。全部由 Codex CLI 内置 `image_gen` 生成（自己生成的素材），游戏自己叠加文字。

## 文件

| 路径 | 内容 |
| --- | --- |
| `tools/decor/specs.json` | 每张图的 id、比例、类型、图集网格、使用店铺 id（来自 `src/data/mallLayout.ts`） |
| `tools/decor/prompts/<id>.txt` | 完整提示词（按本机生图说明 §3.5 的结构化格式），原样交给 Codex |
| `tools/decor/run_codex.sh` | 生成一张：写任务文件 → 调一次 Codex → 核对 PNG → 复制到 `raw/` → 记录到 `runs.jsonl` |
| `tools/decor/run_all.sh` | 串行生成所有还没有原图的 id；遇到额度耗尽立即停止 |
| `tools/decor/process.py` | 裁切/缩放/转 JPEG，写 manifest、`prompts.json` 和对照图 |
| `tools/decor/prompts.json` | 每张最终采用图的提示词、模型、推理强度、后端、日期、尝试记录（由 process.py 生成） |
| `assets-src/decor/raw/<id>.png` | Codex 原图（不进 git） |
| `assets-src/decor/tasks/<id>/<effort>-<时间>/` | 每次 Codex 任务的任务文件、事件日志、最终回复、图片（不进 git） |
| `public/textures/decor/<id>.jpg`、`manifest.json` | 游戏实际加载的贴图 |

## 重新生成

前提：`codex --version` ≥ 0.162.1，ChatGPT 账号已登录。一次只跑一个 Codex 任务，不要并发。

```bash
# 重新生成某一张（默认 gpt-6.1-sol、推理强度 low）
tools/decor/run_codex.sh poster-menswear low

# 出图不合要求时用 high 重试一次，可附上次问题说明（只写进任务文件，不改提示词）
RETRY_NOTE="画面里出现了文字" tools/decor/run_codex.sh poster-menswear high

# 生成所有还没有原图的（删掉 raw/<id>.png 即可让它重做）
tools/decor/run_all.sh low

# 处理成游戏贴图 + manifest + prompts.json + 对照图 assets-src/decor/contact-sheet.jpg
python3 tools/decor/process.py
```

要点：

- 改画面内容就改 `prompts/<id>.txt`；尺寸要求写在任务文件里（`run_codex.sh` 按 `specs.json` 的比例自动写），不写进提示词。
- 每次生成后一定要亲眼看图：有没有文字/logo、网格是否规整、内容是否符合需求。退出码 0 不代表成功。
- `raw/<id>.png` 总是最近一次成功的结果；如果重试结果更差，从 `tasks/<id>/...` 里把想要的 `codex-image.png` 复制回 `raw/<id>.png` 再跑 `process.py`（它按文件哈希找出对应任务，记录到 `prompts.json`）。
- 比例不符时 `process.py` 居中裁切到目标比例；最终长边 1024，sRGB。JPEG 用 ffmpeg `-q:v 2` 编码：实测 PSNR 与 sips 质量 85 相当，但 16 张合计约 2.6 MB（sips 85 约 3.8 MB，超出 3 MB 预算）。
- Codex 明确报告额度/用量耗尽时（退出码 42），按本机生图说明改用本地 Z-Image-Turbo；但如果 GPU 正被别的任务（如 TTS）占用，先等它结束。
- 风格统一：扁平赛璐璐卡通、明亮柔和偏粉彩、细暖色描边；画面里不能有任何文字、数字、logo、水印；原创形象，不出现真实品牌、知名角色和真人。
