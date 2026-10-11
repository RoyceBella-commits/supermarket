# BGM 离线音频管线（tools/audio）

两类产物：

| 产物 | 内容 | 是否进仓库 |
|---|---|---|
| `public/audio/bgm/local/reminiscence.m4a` + `playlist.local.json` | 本机默认 BGM：Chelsea McGough《Reminiscence》，前奏只播一次，主体 160 s 无缝循环 | **否**（商业曲目，已在 .gitignore） |
| `public/audio/bgm/public/{aria,var13,aria-da-capo,var19}.m4a` + `playlist.json` | 公共歌单：Open Goldberg Variations（Kimiko Ishizaka，CC0/公有领域），顺序播放，不循环 | 是 |
| `tools/audio/work/` | 中间文件、候选点、试听文件、验证报告 | 否（已 gitignore） |

`playlist.json` 永远不引用 local 下的文件。

## 1. 环境

venv 放在内置磁盘（这个 exFAT 盘不支持符号链接，不要在仓库里建 venv）：

```sh
~/.local/bin/uv venv --python 3.12 ~/.venvs/supermarket-audio
~/.local/bin/uv pip install --python ~/.venvs/supermarket-audio/bin/python \
    -r tools/audio/requirements.txt   # 在仓库根目录执行
```

另需 Homebrew ffmpeg（带 `--enable-audiotoolbox`，提供 `aac_at` 编码器；`aac_at` 只接受 s16 输入，所以编码前用
`aresample=osf=s16:dither_method=triangular` 做 TPDF 抖动）。脚本默认用 `/opt/homebrew/bin/ffmpeg`，可用环境变量 `FFMPEG` 覆盖。

## 2. 重跑全部步骤

```sh
cd <仓库根目录>
PY=~/.venvs/supermarket-audio/bin/python

# A. Reminiscence 无缝循环
$PY -I tools/audio/prep.py "<Reminiscence 原始 FLAC 的路径>"
$PY -I tools/audio/find_loop.py                 # 打印候选表，写 work/candidates.json（前 5 名）
$PY -I tools/audio/render_loop.py --cand 0      # 渲染 work/loop.wav 并编码 local/reminiscence.m4a
$PY -I tools/audio/verify.py                    # 解码校验 + 试听文件 + 指标 + 写 playlist.local.json

# B. 公共歌单
$PY -I tools/audio/prep_playlist.py --src-dir "<Open Goldberg Variations MP3 所在目录>"   # 编码 public/*.m4a + 写 playlist.json
```

整个流程是确定性的（同样输入得到同样的循环点）。全部脚本都可以加 `-h` 查看参数。

## 3. 各脚本做什么

- **`common.py`**：共用工具。ffmpeg 解码（遵守 MP4 edit list / LAME gapless 头）、`aac_at` 编码命令、4 倍过采样真峰值、
  pyloudnorm 积分响度（BS.1770-4）、ffmpeg `ebur128` 交叉核对、`gainDb` 计算与真峰值钳制。
- **`prep.py`**：soundfile 读 192 kHz/24-bit FLAC → soxr VHQ 重采样到 48 kHz float32 → `work/bgm_48k.wav`；
  同时写 `work/source_info.json`（源文件 sha256 等）。
- **`find_loop.py`**：找循环点。
  1. S0 = 第一个真实音头（1 ms RMS 超过“响段电平 −30 dB”）往前留 10 ms。
  2. librosa 节拍跟踪（`trim=False`）。跟踪器在 24–29 s、85–109 s 等段落会锁到反拍（偏 ±250 ms），所以用
     “节拍时间对周期 T 取模的圆周集中度”求 T，再对内点做最小二乘，得到恒速网格（119.997 BPM，79% 跟踪节拍是内点），
     并用逐拍 1 ms 能量轮廓把网格对齐到音头（−33 ms）。
  3. 4/4 小节；强拍相位 = argmax（低频起音强度 + 一小节长度的和声变化新颖度），可用 `--phase` 覆盖。
  4. 结尾 D = 末尾“单调衰减”开始的那一小节（从文件尾按小节 RMS 往回走）。B ≤ D；B 距 D 不足 `--guard-bars`（默认 1 小节）时扣分。
  5. 逐拍特征：CQT chroma + MFCC(1–19) + log-RMS，z-score。乐句（4 小节）相位 = 小节级新颖度峰值最集中的相位。
     候选对：A = S0 后 45 s 内的强拍，B = 使主体长度 ∈ [150, 185] s 的强拍（没有就退到 ≥130 s）。
     得分 = ±8 拍窗口的加权余弦相似度（chroma 0.5 / MFCC 0.3 / RMS 0.2；A 前≈B 前、A 后≈B 后，越靠近接缝权重越大）
     − 响度差惩罚（交叉淡化区、前一小节、后一小节）+ 主体为 4/8 小节整数倍的奖励 + A、B 都在乐句起点的奖励 + 极小的长度奖励。
  6. B 在 ±15 ms 内做样本级归一化互相关精修（只有 NCC 峰值 ≥ 0.5 才采用，否则保留网格位置，避免随机抖动）。
- **`render_loop.py --cand N`**：渲染输出文件（下标都相对输出文件，S0 = 0）：
  - `out = x[S0 : B + 1 s]`；交叉淡化 F = 120 ms：`out[B−G−F : B−G] = x[B−G−F:B−G]·fade_out + x[A−G−F:A−G]·fade_in`；
    `out[B−G : B+1 s] = x[A−G : A+1 s]`（B 之后的 1 s 尾巴是 A 之后的音乐，解码器预读落在音乐上）。
  - 默认等功率曲线；两段相关系数 ρ > 0.8 时改等增益（避免 +3 dB 鼓包）。本次 ρ = 0.15 → 等功率。
  - **G = 50 ms 保护段（对原始方案的有意偏离，`--xfade-guard-ms 0` 可还原）**：交叉淡化在 loopEnd 前 50 ms 就结束，
    最后 50 ms 已经是纯 A 侧拷贝。这样即使某个浏览器没去掉 AAC 前置延迟（2112 样本 = 44 ms，整体晚 d 个样本），
    跳转点仍落在纯 A 侧区域，依旧样本连续；解码多切掉的情况（d < 0）由 1 s 尾巴兜住。没有 G 的话，
    “常量偏移”并不无害——跳转会切在交叉淡化中间，留下约一半幅度的 B 侧台阶（咔哒声）。
  - 开头 5 ms 淡入；整体缩放到真峰值 −1.5 dBTP（给 AAC 过冲留余量，verify 检查解码后 ≤ −1 dBTP）。
  - 编码：`ffmpeg -i work/loop.wav -map 0:a -map_metadata -1 -af aresample=osf=s16:dither_method=triangular -c:a aac_at -aac_at_mode cvbr -b:a 160k -ar 48000 -movflags +faststart public/audio/bgm/local/reminiscence.m4a`
    （这些参数在本机 ffmpeg 9.0.2 上验证可用；`-aac_at_mode` 可选 auto/cbr/abr/cvbr/vbr）。
- **`verify.py`**：ffmpeg 解码 m4a，与编码前 wav 在 5 个位置做互相关测解码偏移；完全按游戏方式模拟播放
  （0 → loopEnd，跳 loopStart，…）生成试听文件；计算接缝指标、响度、真峰值；写 `playlist.local.json`
  和 `work/verify_report.json`。
- **`prep_playlist.py`**：4 首 Goldberg：ffmpeg 解码 → 去头尾静音/室内底噪（第一个音前留 50 ms + 10 ms 淡入；
  最后的衰减降到底噪 +6 dB 后再留 0.3 s 并淡出）→ aac_at cvbr 128k → 回解码测响度/真峰值 → 写 `playlist.json`。
  源文件不拷进仓库。

## 4. 选定的循环点（Reminiscence，候选 #0）

歌曲结构（120 BPM、4/4、2 s 一小节、4 小节 = 8 s 一个乐句）：
0–40 s 段 A（安静钢琴）→ 40–72 s 段 B → 72–88 s 段 C（稀疏）→ 88–120 s 段 D → 120–152 s 段 E（高潮）
→ 152–176 s 段 C′（C 的再现，3 个几乎相同的乐句）→ 176 s 最后的和弦，衰减到 184 s。

| | 原曲时间 | 输出文件（样本 / 秒） |
|---|---|---|
| S0（文件起点） | 0.0110 s（样本 528） | 0 |
| A = loopStart | 8.0169 s（样本 384809）= 段 A 第 2 个乐句起拍前 10 ms | **384281** / 8.0059 s |
| B = loopEnd | 168.0169 s（样本 8064812）= 段 C′ 第 3 个乐句起拍前 10 ms（NCC 精修 −4.5 ms） | **8064284** / 168.0059 s |
| 文件长度 | | 8112284 样本 / 169.006 s |

- 主体 160.000 s = 80 小节 = 20 个乐句；前奏 8.0 s 只播一次。
- 跳过的只有：C′ 的第 3 个乐句（与第 2 个几乎完全相同）和结尾和弦/衰减（共约 18 s）。B 在结尾前 4 小节，满足“至少提前 1 小节”。
- 接缝处和声：两侧最后一小节都是 F（B 侧 F+C，A 侧 F+A），之后都是 C 和弦 → IV→I，交叉淡化区混合后是 F 大三和弦，无半音冲突。
- 已知代价：C′ 的结尾比段 A 的结尾安静约 3–4 dB，所以接缝前 ~120 ms 有一个约 4 dB 的渐强（从 C′ 的尾音过渡到段 A 的琶音尾巴），
  紧接着就是下一乐句的强拍。

候选前 5 名（`work/candidates.json`）：

| # | A（原曲 s） | B（原曲 s） | 主体 s | 小节 | 得分 | 相似度 | 交叉淡化区响度差 | 乐句起点 |
|---|---|---|---|---|---|---|---|---|
| 0 | 8.017 | 168.017 | 160.000 | 80 | 0.232 | 0.130 | 3.2 dB | 是 |
| 1 | 8.017 | 160.017 | 152.000 | 76 | 0.202 | 0.129 | 3.8 dB | 是 |
| 2 | 4.017 | 164.021 | 160.005 | 80 | 0.182 | 0.087 | 1.5 dB | 否（乐句第 3 小节） |
| 3 | 8.017 | 176.022 | 168.005 | 84 | 0.170 | 0.101 | 3.8 dB | 是（但 B 就是结尾和弦，扣 guard 分） |
| 4 | 6.017 | 166.021 | 160.005 | 80 | 0.168 | 0.098 | 3.4 dB | 否（乐句第 4 小节） |

想换候选：`$PY -I tools/audio/render_loop.py --cand 2 && $PY -I tools/audio/verify.py`。

## 5. 验证结果（2026-10-11）

- 解码偏移：ffmpeg 解码与编码前 wav 在 5 个位置互相关均为 **0 样本**（常量；NCC ≥ 0.9998），文件尾多 868 样本（AAC 帧填充，
  播放器不会播到那里）。另用 Chromium 152 的 `decodeAudioData` 对同参数编码的探针文件测试：长度和脉冲位置与 ffmpeg 完全一致，
  即浏览器同样按 edit list 去掉了 2112 样本前置延迟。Safari/Firefox 未实测——这正是保留 50 ms 保护段的原因。
- 接缝指标（在模拟播放流上，STFT 2048/256）：
  - 频谱通量（相邻帧 log 幅度差均值）：全曲中位数 3.02 dB、p95 3.35；接缝窗口最大 4.12，同一强拍自然到达时 3.98。
  - 帧 RMS 跳变：全曲中位数 0.24 dB、p95 1.07；接缝窗口最大 3.41（来自随后的强拍），自然到达时 3.39；
    只看交叉淡化区：0.92 dB，自然情况 0.36 dB（就是上面说的那个小渐强，仍低于全曲 p95）。
  - 高频（>5 kHz）2 ms 能量：接缝 −64.1 dB，自然 −64.8 dB，中位数 −70.7 dB → 无咔哒。跳转处相邻样本差 0.0025（中位数 0.0036）。
  - 假设解码偏移 d = −1024 / +1024 / +2112 样本时，跳转处样本差 0.015 / 0.0026 / 0.0035，都在正常范围（d=−1024 时落在强拍音头里，差值来自 AAC 量化噪声）。
- 响度/真峰值：整文件 −12.93 LUFS，循环主体 −12.87 LUFS（写入 manifest），解码后真峰值 −1.36 dBTP（ffmpeg ebur128：−12.9 LUFS / −1.4 dBTP，LRA 5.1 LU）。
  `gainDb = −18 − (−12.87) = −5.13`。

试听文件（只是指标，人还没有真正听过）：
- `tools/audio/work/seam_test.wav`：3 遍 [loopEnd 前 8 s → 跳转 → loopStart 后 8 s]，中间隔 1 s 静音。
- `tools/audio/work/full_2loops.wav`：前奏 + 主体 ×2，再接第 3 遍的 4 s（淡出），两次接缝在 168.006 s 和 328.006 s。

公共歌单：

| id | 截取（原文件 s） | 时长 s | LUFS | 真峰值 dBTP | gainDb |
|---|---|---|---|---|---|
| aria | 1.710–298.360 | 296.65 | −26.59 | −8.56 | +7.56（被真峰值钳制，目标是 +8.59） |
| var13 | 0.250–253.170 | 252.92 | −24.57 | −8.56 | +6.57 |
| aria-da-capo | 0.320–161.430 | 161.11 | −28.59 | −13.06 | +10.59 |
| var19 | 0.230–84.310 | 84.08 | −23.21 | −8.21 | +5.21 |

## 6. 给游戏端的约定

- `file` 相对 `/audio/bgm/`。`loop` 的 `startSample`/`endSample` 是 48 kHz 下相对输出文件的样本下标；
  秒 = 样本 / `sampleRate`（AudioContext 跑 44.1 kHz 时 `decodeAudioData` 会重采样，用秒数设置 `loopStart`/`loopEnd` 即可，
  保护段能吸收取整误差）。
- 播放方式：`AudioBufferSourceNode`，`loop = true`，`loopStart = startSample/48000`，`loopEnd = endSample/48000`，`start(0, 0)`。
  **交叉淡化已经烧进文件**，`crossfadeMs` 只是说明，播放器不要再做一次交叉淡化。`loopEnd` 之后的 1 s 尾巴永远不会被播放。
- 音量：线性增益 = 10^(gainDb/20)。manifest 里出现 `"gainClamped": true` 表示 gainDb 因真峰值上限（−1 dBTP）被调小。
- `lufs` 对循环曲目是循环主体的积分响度，对非循环曲目是整首。
