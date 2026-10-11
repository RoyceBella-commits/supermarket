# 店员配音离线管线（tools/voice）

把 `src/data/npcDialogue.ts` 里 21 位店员的台词，用本机 Qwen3-TTS（VoiceDesign，MLX 4bit，完全离线）生成中文配音，
后期处理成游戏用的 AAC 文件。

| 产物 | 内容 | 是否进仓库 |
|---|---|---|
| `public/audio/voice/<shopId>/<lineId>.m4a` | 单声道 AAC 64 kbps、48 kHz，约 −16 LUFS，真峰值 ≤ −1 dBTP，首尾静音已裁 | 是 |
| `public/audio/voice/manifest.json` | `{ "version": 1, "lines": { "<lineId>": { "file", "durationSec", "hash" } } }`，每次运行合并更新 | 是 |
| `tools/voice/work/` | TTS 原始 WAV、参数记录、后期测量、回听结果、日志、试音合集 | 否（`.gitignore` 的 `tools/*/work/`） |

## 1. 环境

不需要另装任何东西，全部复用本机已有环境（路径见《本机生图与TTS模型_Agent使用说明》第 2.1 节）：

| 用途 | 默认路径 | 覆盖用的环境变量 |
|---|---|---|
| Qwen3-TTS 的 Python | `~/Documents/Codex/local-models/qwen3-tts/.venv/bin/python` | `TTS_PY` |
| TTS 调用脚本 `tts.py` | `~/Documents/Codex/2026-10-10/chatgpt-conversation-…/outputs/TTS/tts.py` | `TTS_SCRIPT` |
| Whisper（回听） | `~/.cache/huggingface/hub/models--mlx-community--whisper-large-v3-turbo-asr-fp16/snapshots/…` | `WHISPER_MODEL` |
| ffmpeg（带 `aac_at`） | `/opt/homebrew/bin/ffmpeg` | `FFMPEG` |

脚本是 Node 直接跑的 TypeScript（需要能直接运行 .ts 的 Node：22.18+ / 23.6+，开发用 24），只用了可擦除的 TS 语法。类型检查：
`node node_modules/typescript/bin/tsc -p tools/voice`。

**并发约定（用户要求）：同一时间只跑一个模型进程。** 脚本逐句串行调用 `tts.py`（参数数组传参，不经过 shell），
两次之间停 1 秒；每次调用前检查有没有别的本地模型进程（Qwen3-TTS / IndexTTS / MFLUX / Z-Image），有就等它结束。
Whisper 回听在整批 TTS 结束后才跑，也是单进程。不要同时开两个 `generate.ts`。

## 2. 命令

在仓库根目录执行：

```sh
node tools/voice/generate.ts --audition          # 试音：每位店员只生成第 1 句，并拼出试音合集
node tools/voice/generate.ts --all               # 全部台词（已生成且没改动的句子自动跳过）
node tools/voice/generate.ts --only=kumo         # 只处理某几家店（逗号分隔），可以和 --audition / --all 组合
node tools/voice/generate.ts --audition --only=kumo,lumi   # 只重新试这两位的声音
```

| 选项 | 作用 |
|---|---|
| `--force` | 忽略缓存，重新跑 TTS（seed 固定，结果一般不变，排查问题时才用） |
| `--reencode` | 不跑 TTS，只重做后期（改了后期参数时用；改 `POST.version` 也会自动重做） |
| `--qa-only` | 不生成，只对选中的台词跑 Whisper 回听 |
| `--no-qa` | 生成后不跑回听 |
| `--prune` | 把 manifest 里已经不存在的台词删掉（删句子、改 id 之后用） |

**增量规则：** 每句的哈希 = (朗读文本, `voice.instruct`, `voice.seed`, VoiceDesign, 模型名, 语言)。
`work/raw/<lineId>.wav` 存在且哈希相同就不重跑 TTS；后期产物、manifest 里的哈希或后期版本对不上时只重做后期。
所以改了某位店员的 `instruct` 或 `seed`，这位店员的所有句子都会重新生成；只改了一句台词，就只重做那一句。

## 3. 试音流程

1. `node tools/voice/generate.ts --audition`
2. 听 `tools/voice/work/audition-all.m4a`：21 位店员的第 1 句按店铺顺序排好，每段之间停 0.8 秒。
   对照 `tools/voice/work/audition-list.txt`：每段的起始时间、店名和楼层、店员、性格、声音描述和 seed、台词、时长。
3. 不满意的声音：在 `npcDialogue.ts` 里改这位店员的 `voice.instruct`（年龄、性别、音高、音色、语速、情绪）或换一个 `seed`，
   然后 `node tools/voice/generate.ts --audition --only=<shopId>` 只重做这一位，合集会自动重新拼。
4. 全部满意后 `node tools/voice/generate.ts --all` 生成其余台词。第 1 句不会重做。

## 4. 增改台词

- 台词在 `src/data/npcDialogue.ts`，每位店员 3–5 句。`id` 按顺序自动编号为 `<shopId>-01`、`-02`……
  在中间插入一句会让后面的编号整体后移，对应句子会重新生成，跑完后加 `--prune` 清掉多出来的旧条目。
- `zh` 是字幕和默认朗读文本，`en` 只是英文界面的字幕（配音始终是中文）。
- `tts` 只在 `zh` 里有容易读错的内容时才写：带符号的店名（`Thread&Co` → `Thread and Co`、`Nib & Note` → `Nib and Note`）、
  连写的英文店名（`PixelFox` → `Pixel Fox`）、`B1` → `地下一层`、`VR` → `V R` 等。数字尽量直接写成汉字。
- 每句控制在 40 字以内；第 1 句要能当开场白（玩家按 E 逐句看，播完从头循环）。

## 5. 后期处理（ffmpeg）

1. **裁气声**：开头或结尾 ≤ 0.35 秒、比全句最响处低 12 dB 以上、又和正文隔着 ≥ 0.35 秒静音的一小段声音，当作吸气声裁掉
   （VoiceDesign 偶尔会先吸一口气、停一秒多才开口）。“哟，”“你、”这类开头字音量和正文差不多，不会被误裁。
2. **裁首尾静音**：`silenceremove`，阈值 −50 dB（采样峰值），开头留 60 ms、结尾留 120 ms，切口加 6 ms / 20 ms 淡入淡出。
3. **响度**：`loudnorm` 只用来测量（积分响度 + 真峰值），然后整体增益到 −16 LUFS；
   预计真峰值超过 −2 dBFS 时加 `alimiter`（1 ms 起音、60 ms 释放，不做自动电平）。
4. **编码**：重采样到 48 kHz → TPDF 抖动到 s16（`aac_at` 只接受 s16）→ `aac_at` cvbr 64 kbps 单声道，`+faststart`。
5. **复核**：解码成品再测一次，真峰值超过 −1 dBTP 就整体再降一点重新编码。测量值写在 `work/post/<lineId>.json`。

参数在 `generate.ts` 顶部的 `POST` / `TRIM`；改了之后把 `POST.version` 加一，下次运行会自动只重做后期。

## 6. 回听检查（Whisper）

每次生成后自动跑（`--no-qa` 可关）：成品先解码成 16 kHz WAV，再用本机 Whisper large-v3-turbo 转写（`asr_check.py`），
和朗读文本比较算字错率 CER。汉字一个字算一个记号，连在一起的英文字母算一个词；数字先转成汉字。
CER > 0.1 的句子会列出来，结果累计在 `work/qa/report.json`。

CER 只是筛查，不等于验收：Whisper 常把同音字写错（“杀球”→“沙球”、“一身”→“一生”），
英文店名被中文口音读出时也会被听成别的字（“Stride”→“施爱的”）。列出来的句子要人工听一下再决定是否重做。

## 7. work 目录

```
work/raw/<lineId>.wav        TTS 原始输出（24 kHz PCM16）
work/raw/<lineId>.json       tts.py 自己写的参数记录（耗时、MLX 内存峰值等）
work/raw/<lineId>.gen.json   本脚本的记录：哈希、instruct、seed、进程耗时、重试次数
work/post/<lineId>.json      后期测量：裁掉的气声、增益、是否限幅、成品响度和真峰值、时长
work/qa/                     回听用的 16 kHz WAV、Whisper 输入输出、累计报告 report.json
work/logs/<lineId>.log       每次 TTS 调用的完整命令和输出；qa.log 是回听日志
work/last-run.json           最近一次跑 TTS 的逐句耗时
work/audition-all.m4a        试音合集；audition-list.txt 是对照清单
```

## 8. 已知限制

- VoiceDesign 每句都是按同一段声音描述 + 同一个 seed 独立生成的，同一位店员不同句子之间音色可能略有出入，
  `--all` 之后要整体听一遍。差别明显时可以考虑以选定的那句为参考，改用克隆方式（IndexTTS-2.5）生成其余句子。
- 英文店名是“中国店员的口音”，个别词可能读得比较中式；需要更准时在 `tts` 里换写法（拆词、加空格）再试。
- 生成成功、CER 低都不代表音色和语气已经通过试听验收。
