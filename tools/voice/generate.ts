// 店员配音离线生成：node tools/voice/generate.ts <模式> [选项]
//   --audition        只生成每位店员的第 1 句（试音），并拼出 work/audition-all.m4a + work/audition-list.txt
//   --all             生成全部台词
//   --only=a,b        只处理这几家店（可与 --audition 组合，例如重新试一个声音）
//   --force           忽略缓存，重新跑 TTS
//   --reencode        不重跑 TTS，只重做后期（裁静音、响度、AAC）
//   --qa-only         不生成，只对选中的台词跑 Whisper 回听
//   --no-qa           生成后不跑 Whisper 回听
//   --prune           从 manifest 里删掉已不存在的台词
//
// 流程：Qwen3-TTS VoiceDesign（本机 MLX，一次一个进程，句间停 1 秒）→ work/raw/<lineId>.wav（+ tts.py 的 .json）
//       → ffmpeg 裁掉首尾静音、增益到约 −16 LUFS、真峰值 ≤ −1 dBTP、单声道 AAC 64 kbps 48 kHz
//       → public/audio/voice/<shopId>/<lineId>.m4a，并合并写入 public/audio/voice/manifest.json
//       → Whisper 回听算 CER（同样单进程，在 TTS 全部结束之后）。
// 缓存：哈希 = (朗读文本, instruct, seed, variant, 模型, 语言)，raw WAV 已存在且哈希相同就跳过 TTS。

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type DialogueLine, type NpcDef, npcs } from '../../src/data/npcDialogue.ts';

// ---------- 配置 ----------
const HOME = homedir();
const TTS_PY = process.env.TTS_PY ?? join(HOME, 'Documents/Codex/local-models/qwen3-tts/.venv/bin/python');
const TTS_SCRIPT =
  process.env.TTS_SCRIPT ?? join(HOME, 'Documents/Codex/2026-10-10/chatgpt-conversation-6ac90c56-5cf8-83e8-88c9/outputs/TTS/tts.py');
const WHISPER_MODEL =
  process.env.WHISPER_MODEL ??
  join(HOME, '.cache/huggingface/hub/models--mlx-community--whisper-large-v3-turbo-asr-fp16/snapshots/624c19c9af5603fa73b83bce14d4aeea96156d18');
const FFMPEG = process.env.FFMPEG ?? '/opt/homebrew/bin/ffmpeg';

const VARIANT = 'VoiceDesign';
const MODEL = 'Qwen3-TTS-12Hz-1.7B-VoiceDesign-4bit';
const LANGUAGE = 'Chinese';
/** 生成上限（12 Hz 语音 token，约 50 秒）。台词都在 10 秒以内，这只是防止失控的保险。 */
const MAX_TOKENS = 600;
const PAUSE_MS = 1000; // 两次 TTS 之间的停顿
const TTS_TIMEOUT_MS = 10 * 60 * 1000;

/** 后期参数；改了这里要把 version 加一，脚本会自动重做后期（不重跑 TTS）。 */
const POST = {
  version: 2,
  targetLufs: -16,
  maxTruePeak: -1.0,
  limiterDb: -2.0, // 增益后预计真峰值超过这个值时，加一个采样峰值限幅器
  sampleRate: 48000,
  bitrateK: 64,
};
const SR = POST.sampleRate;
/** 裁首尾静音：阈值 −50 dB（采样峰值），开头留 60 ms、结尾留 120 ms，切口各加一个很短的淡入/淡出。 */
const TRIM = [
  'silenceremove=start_periods=1:start_duration=0.02:start_threshold=-50dB:start_silence=0.06:detection=peak',
  'afade=t=in:d=0.006',
  'areverse',
  'silenceremove=start_periods=1:start_duration=0.02:start_threshold=-50dB:start_silence=0.12:detection=peak',
  'afade=t=in:d=0.02',
  'areverse',
  `aresample=${SR}`,
].join(',');

const MODEL_PROC = /qwen3-tts|tts\.py|indextts|mflux|z-image/i;

// ---------- 路径 ----------
const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..', '..');
const workDir = join(here, 'work');
const rawDir = join(workDir, 'raw');
const postDir = join(workDir, 'post');
const qaDir = join(workDir, 'qa');
const logDir = join(workDir, 'logs');
const outDir = join(projectRoot, 'public', 'audio', 'voice');
const manifestPath = join(outDir, 'manifest.json');

// ---------- 参数 ----------
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const onlyArg = args.find((a) => a.startsWith('--only='))?.slice(7);
const only = onlyArg ? new Set(onlyArg.split(',').map((s) => s.trim()).filter(Boolean)) : null;
const audition = flag('--audition');
const all = flag('--all');
const force = flag('--force');
const reencode = flag('--reencode');
const qaOnly = flag('--qa-only');
const noQa = flag('--no-qa');
const prune = flag('--prune');

if (!audition && !all && !only) {
  console.log('用法：node tools/voice/generate.ts --audition | --all | --only=<shopId>[,…]  [--force] [--reencode] [--qa-only] [--no-qa] [--prune]');
  process.exit(1);
}
if (only) {
  for (const id of only) if (!npcs.some((n) => n.shopId === id)) throw new Error(`没有这家店的店员：${id}`);
}

// ---------- 小工具 ----------
interface Job {
  npc: NpcDef;
  line: DialogueLine;
  text: string;
  hash: string;
  rawWav: string;
  rawJson: string;
  genJson: string;
  postJson: string;
  outRel: string; // 相对 public/audio/voice
  outAbs: string;
}

interface TtsReport {
  audio_seconds: number;
  load_seconds: number;
  generation_seconds: number;
  total_seconds: number;
  mlx_peak_gb: number;
  sample_rate: number;
  text: string;
}

interface GenInfo {
  hash: string;
  text: string;
  instruct: string;
  seed: number;
  variant: string;
  model: string;
  language: string;
  wallSeconds: number;
  attempts: number;
  createdAt: string;
  tts: TtsReport;
}

interface PostInfo {
  hash: string;
  postVersion: number;
  durationSec: number;
  breathCut: { start: number; end: number | null };
  gainDb: number;
  limiter: boolean;
  in: { i: number; tp: number };
  out: { i: number; tp: number };
  encodes: number;
}

interface ManifestEntry {
  file: string;
  durationSec: number;
  hash: string;
}
interface Manifest {
  version: 1;
  lines: Record<string, ManifestEntry>;
}

const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
const rel = (p: string) => relative(projectRoot, p);

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

function writeJson(path: string, obj: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`);
  renameSync(tmp, path);
}

function lineHash(npc: NpcDef, text: string): string {
  const key = { text, instruct: npc.voice.instruct, seed: npc.voice.seed, variant: VARIANT, model: MODEL, language: LANGUAGE };
  return createHash('sha256').update(JSON.stringify(key)).digest('hex').slice(0, 16);
}

function makeJob(npc: NpcDef, line: DialogueLine): Job {
  const text = line.tts ?? line.zh;
  const outRel = `${npc.shopId}/${line.id}.m4a`;
  return {
    npc,
    line,
    text,
    hash: lineHash(npc, text),
    rawWav: join(rawDir, `${line.id}.wav`),
    rawJson: join(rawDir, `${line.id}.json`),
    genJson: join(rawDir, `${line.id}.gen.json`),
    postJson: join(postDir, `${line.id}.json`),
    outRel,
    outAbs: join(outDir, outRel),
  };
}

/** 其他正在跑的本地模型进程（排除自己这条进程链和 multiprocessing 的 resource_tracker）。 */
function otherModelProcs(): string[] {
  const r = spawnSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' });
  const rows = String(r.stdout)
    .split('\n')
    .map((s) => s.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), cmd: m[3] }));
  const parent = new Map(rows.map((x) => [x.pid, x.ppid]));
  const mine = new Set<number>();
  for (let p = process.pid; p > 1 && !mine.has(p); p = parent.get(p) ?? 0) mine.add(p);
  // 只认真正的模型进程：shell 包装（其命令行里可能只是提到了这些字样）和 grep/ps 之类不算；被包装的 python 自己会匹配到
  const notModel = /^\S*\b(zsh|bash|sh|fish|dash|grep|pgrep|ps|node|tail|head|less|cat)\s/;
  return rows
    .filter((x) => !mine.has(x.pid) && MODEL_PROC.test(x.cmd) && !notModel.test(`${x.cmd} `) && !x.cmd.includes('resource_tracker'))
    .map((x) => `${x.pid} ${x.cmd.slice(0, 160)}`);
}

function waitForIdle(what: string): void {
  let warned = false;
  for (;;) {
    const procs = otherModelProcs();
    if (!procs.length) return;
    if (!warned) {
      console.log(`  …等待其他本地模型进程结束后再跑 ${what}：\n    ${procs.join('\n    ')}`);
      warned = true;
    }
    sleep(5000);
  }
}

function ff(argv: string[], input?: Uint8Array): { stdout: Uint8Array; stderr: string } {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-nostdin', ...argv], { input, maxBuffer: 1 << 29 });
  const stderr = String(r.stderr ?? '');
  if (r.status !== 0) throw new Error(`ffmpeg 失败（${r.status}）：${argv.join(' ')}\n${stderr.slice(-2000)}`);
  return { stdout: r.stdout as Uint8Array, stderr };
}

/** loudnorm 第一遍测量：积分响度（LUFS）和真峰值（dBTP，192 kHz 过采样）。 */
function measure(input: string, pre: string | null): { i: number; tp: number } {
  const af = [pre, 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json'].filter(Boolean).join(',');
  const { stderr } = ff(['-i', input, '-af', af, '-f', 'null', '-']);
  const json = stderr.slice(stderr.lastIndexOf('{'), stderr.lastIndexOf('}') + 1);
  const m = JSON.parse(json) as { input_i: string; input_tp: string };
  return { i: Number(m.input_i), tp: Number(m.input_tp) };
}

/** 解码成 48 kHz 单声道 s16（ffmpeg 会按 MP4 edit list 去掉 AAC 的前导样本）。 */
function decodeS16(input: string): Uint8Array {
  return ff(['-v', 'error', '-i', input, '-f', 's16le', '-acodec', 'pcm_s16le', '-ac', '1', '-ar', String(SR), '-']).stdout;
}

const dbToLin = (db: number) => 10 ** (db / 20);

/**
 * 首尾的“气口”：VoiceDesign 偶尔在开头先吸一口气、停一秒多才开口。规则（每侧最多去掉 3 段）：
 * 一段声音 ≤ 0.35 s、峰值比全句最响处低 12 dB 以上、并且和正文之间隔着 ≥ 0.35 s 的静音（< −50 dB），就当作气声裁掉。
 * “哟，”“你、”这类短促的开头字音量和正文差不多，不会被误裁。返回要保留的区间（秒）。
 */
function breathCut(wav: string): { start: number; end: number | null } {
  const sr = 24000;
  const win = Math.round(sr * 0.01);
  const pcm = ff(['-v', 'error', '-i', wav, '-f', 's16le', '-acodec', 'pcm_s16le', '-ac', '1', '-ar', String(sr), '-']).stdout.slice();
  const s = new Int16Array(pcm.buffer, 0, Math.floor(pcm.length / 2));
  const db: number[] = [];
  for (let i = 0; i < s.length; i += win) {
    let m = 0;
    for (let j = i; j < Math.min(i + win, s.length); j++) m = Math.max(m, Math.abs(s[j]));
    db.push(20 * Math.log10(Math.max(m, 1) / 32768));
  }
  const max = Math.max(...db);
  const runs: { s: number; e: number; peak: number }[] = [];
  db.forEach((d, i) => {
    if (d <= -50) return;
    const cur = runs[runs.length - 1];
    if (cur && i - cur.e <= 15) {
      cur.e = i + 1;
      cur.peak = Math.max(cur.peak, d);
    } else runs.push({ s: i, e: i + 1, peak: d });
  });
  const sec = (w: number) => w * 0.01;
  const isBreath = (r: { s: number; e: number; peak: number }, gap: number) =>
    sec(r.e - r.s) <= 0.35 && r.peak <= max - 12 && sec(gap) >= 0.35;
  let first = 0;
  while (first < Math.min(3, runs.length - 1) && isBreath(runs[first], runs[first + 1].s - runs[first].e)) first++;
  let last = runs.length - 1;
  while (last > first && runs.length - 1 - last < 3 && isBreath(runs[last], runs[last].s - runs[last - 1].e)) last--;
  return {
    start: first > 0 ? round(Math.max(0, sec(runs[first].s) - 0.1)) : 0,
    end: last < runs.length - 1 ? round(sec(runs[last].e) + 0.2) : null,
  };
}

// ---------- TTS ----------
function runTts(job: Job): GenInfo {
  const { npc, text } = job;
  mkdirSync(rawDir, { recursive: true });
  mkdirSync(logDir, { recursive: true });
  for (const p of [job.rawWav, job.rawJson, job.genJson]) rmSync(p, { force: true });
  const argv = [
    TTS_SCRIPT,
    '--variant', VARIANT,
    '--language', LANGUAGE,
    '--instruct', npc.voice.instruct,
    '--text', text,
    '--seed', String(npc.voice.seed),
    '--max-tokens', String(MAX_TOKENS),
    '--output', job.rawWav,
  ];
  let lastErr = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    waitForIdle('TTS');
    const t0 = Date.now();
    const r = spawnSync(TTS_PY, argv, {
      env: { ...process.env, HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' },
      encoding: 'utf8',
      timeout: TTS_TIMEOUT_MS,
      maxBuffer: 1 << 26,
    });
    const wall = (Date.now() - t0) / 1000;
    writeFileSync(join(logDir, `${job.line.id}.log`), `$ ${TTS_PY} ${argv.map((a) => JSON.stringify(a)).join(' ')}\n\n${r.stdout ?? ''}\n${r.stderr ?? ''}`);
    const tts = r.status === 0 ? readJson<TtsReport>(job.rawJson) : null;
    if (tts && existsSync(job.rawWav) && tts.text === text && tts.audio_seconds > 0.3) {
      const info: GenInfo = {
        hash: job.hash,
        text,
        instruct: npc.voice.instruct,
        seed: npc.voice.seed,
        variant: VARIANT,
        model: MODEL,
        language: LANGUAGE,
        wallSeconds: round(wall, 2),
        attempts: attempt,
        createdAt: new Date().toISOString(),
        tts,
      };
      writeJson(job.genJson, info);
      return info;
    }
    lastErr = `退出码 ${r.status}${r.error ? ` ${String(r.error)}` : ''}；日志 ${rel(join(logDir, `${job.line.id}.log`))}\n${String(r.stderr ?? '').slice(-1500)}`;
    console.log(`  ! ${job.line.id} 第 ${attempt} 次 TTS 失败：${lastErr.split('\n')[0]}`);
    sleep(5000);
  }
  throw new Error(`${job.line.id} TTS 失败：${lastErr}`);
}

// ---------- 后期 ----------
function postProcess(job: Job): PostInfo {
  const cut = breathCut(job.rawWav);
  const pre =
    cut.start > 0 || cut.end !== null
      ? `atrim=start=${cut.start}${cut.end !== null ? `:end=${cut.end}` : ''},asetpts=PTS-STARTPTS,${TRIM}`
      : TRIM;
  const src = measure(job.rawWav, pre);
  let gain = POST.targetLufs - src.i;
  const limiter = src.tp + gain > POST.limiterDb;
  mkdirSync(dirname(job.outAbs), { recursive: true });
  const tmp = job.outAbs.replace(/\.m4a$/, '.tmp.m4a');
  let out = { i: 0, tp: 0 };
  let encodes = 0;
  for (;;) {
    encodes++;
    const af = [
      pre,
      `volume=${gain.toFixed(2)}dB`,
      limiter ? `alimiter=limit=${dbToLin(POST.limiterDb).toFixed(4)}:attack=1:release=60:level=false:latency=true` : null,
      'aresample=osf=s16:dither_method=triangular',
    ]
      .filter(Boolean)
      .join(',');
    ff([
      '-v', 'error', '-y', '-i', job.rawWav, '-map', '0:a', '-map_metadata', '-1',
      '-af', af, '-ac', '1', '-ar', String(SR),
      '-c:a', 'aac_at', '-aac_at_mode', 'cvbr', '-b:a', `${POST.bitrateK}k`,
      '-movflags', '+faststart', tmp,
    ]);
    out = measure(tmp, null);
    if (out.tp <= POST.maxTruePeak || encodes >= 4) break;
    gain -= out.tp - POST.maxTruePeak + 0.3; // AAC 编码后峰值超了：整体再降一点重编
  }
  const durationSec = round(decodeS16(tmp).length / 2 / SR);
  renameSync(tmp, job.outAbs);
  const info: PostInfo = {
    hash: job.hash,
    postVersion: POST.version,
    durationSec,
    breathCut: cut,
    gainDb: round(gain, 2),
    limiter,
    in: { i: src.i, tp: src.tp },
    out,
    encodes,
  };
  writeJson(job.postJson, info);
  return info;
}

// ---------- manifest ----------
function loadManifest(): Manifest {
  const m = readJson<Manifest>(manifestPath);
  return m && m.lines ? { version: 1, lines: m.lines } : { version: 1, lines: {} };
}

const lineOrder = new Map<string, number>();
npcs.forEach((n, i) => n.lines.forEach((l, j) => lineOrder.set(l.id, i * 100 + j)));

function saveManifest(m: Manifest): void {
  const ids = Object.keys(m.lines).sort((a, b) => (lineOrder.get(a) ?? 1e9) - (lineOrder.get(b) ?? 1e9) || a.localeCompare(b));
  const lines: Record<string, ManifestEntry> = {};
  for (const id of ids) lines[id] = m.lines[id];
  writeJson(manifestPath, { version: 1, lines });
}

// ---------- 估算时长是否异常（漏读 / 重复 / 失控） ----------
function spokenUnits(text: string): number {
  const cjk = [...text].filter((c) => /[㐀-鿿]/.test(c)).length;
  const words = text.match(/[A-Za-z]+/g)?.length ?? 0;
  return cjk + words * 2;
}
function durationWarning(text: string, sec: number): string | null {
  const u = spokenUnits(text);
  if (sec > u / 1.8 + 2.5) return `时长 ${sec.toFixed(1)} s 偏长（约 ${u} 个音节），可能有重复或拖音`;
  if (sec < u / 9) return `时长 ${sec.toFixed(1)} s 偏短（约 ${u} 个音节），可能漏读`;
  return null;
}

// ---------- 回听 ----------
interface QaResult {
  id: string;
  ref: string;
  hyp: string;
  cer: number;
  refTokens: number;
  seconds: number;
}

function runQa(jobs: Job[]): QaResult[] {
  const ready = jobs.filter((j) => existsSync(j.outAbs));
  if (!ready.length) return [];
  mkdirSync(qaDir, { recursive: true });
  const items = ready.map((j) => {
    const wav = join(qaDir, `${j.line.id}.wav`);
    ff(['-v', 'error', '-y', '-i', j.outAbs, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav]);
    return { id: j.line.id, audio: wav, ref: j.text };
  });
  const inPath = join(qaDir, 'input.json');
  const outPath = join(qaDir, 'output.json');
  writeJson(inPath, items);
  rmSync(outPath, { force: true });
  waitForIdle('Whisper');
  console.log(`\nWhisper 回听 ${items.length} 句（单进程）…`);
  const t0 = Date.now();
  const r = spawnSync(TTS_PY, ['-I', join(here, 'asr_check.py'), inPath, outPath, WHISPER_MODEL], {
    env: { ...process.env, HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' },
    encoding: 'utf8',
    timeout: 30 * 60 * 1000,
    maxBuffer: 1 << 26,
  });
  writeFileSync(join(logDir, 'qa.log'), `${r.stdout ?? ''}\n${r.stderr ?? ''}`);
  const results = r.status === 0 ? readJson<QaResult[]>(outPath) : null;
  if (!results) {
    console.log(`  ! Whisper 回听失败（退出码 ${r.status}），日志 ${rel(join(logDir, 'qa.log'))}`);
    return [];
  }
  console.log(`  用时 ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  // 合并进累计报告
  const reportPath = join(qaDir, 'report.json');
  const report = readJson<Record<string, QaResult & { hash: string }>>(reportPath) ?? {};
  for (const res of results) {
    const job = ready.find((j) => j.line.id === res.id);
    report[res.id] = { ...res, hash: job?.hash ?? '' };
  }
  writeJson(reportPath, report);
  return results;
}

// ---------- 试音合集 ----------
async function buildAuditionMix(): Promise<void> {
  const GAP = 0.8;
  const LEAD = 0.3;
  const shopInfo = new Map<string, { name: string; floor: string }>();
  try {
    const { mallLayout } = await import('../../src/data/mallLayout.ts');
    const floorLabel = new Map(mallLayout.floors.map((f) => [f.level, f.label]));
    for (const s of mallLayout.shops) shopInfo.set(s.id, { name: s.name, floor: floorLabel.get(s.floor) ?? String(s.floor) });
  } catch (e) {
    console.log(`  （读不到 mallLayout.ts，清单里不写店名：${String(e).split('\n')[0]}）`);
  }

  const qa = readJson<Record<string, QaResult & { hash: string }>>(join(qaDir, 'report.json')) ?? {};
  const chunks: Uint8Array[] = [new Uint8Array(Math.round(LEAD * SR) * 2)];
  let t = LEAD;
  const gap = new Uint8Array(Math.round(GAP * SR) * 2);
  const list: string[] = [
    '店员试音合集（每位店员的第 1 句）',
    `合成文件：tools/voice/work/audition-all.m4a（各段之间停 ${GAP} 秒）`,
    `引擎：Qwen3-TTS ${MODEL}（VoiceDesign，语言 ${LANGUAGE}），离线生成；后期 −16 LUFS / ≤ −1 dBTP / AAC ${POST.bitrateK} kbps`,
    `生成时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    '',
  ];
  let n = 0;
  for (const npc of npcs) {
    const job = makeJob(npc, npc.lines[0]);
    if (!existsSync(job.outAbs)) {
      list.push(`--  ${npc.shopId}：还没有试音文件`, '');
      continue;
    }
    n++;
    const pcm = decodeS16(job.outAbs);
    const dur = pcm.length / 2 / SR;
    const mm = Math.floor(t / 60);
    const ss = (t - mm * 60).toFixed(1).padStart(4, '0');
    const info = shopInfo.get(npc.shopId);
    list.push(
      `${String(n).padStart(2, '0')}. [${mm}:${ss}]  ${info ? `${info.name}（${info.floor}，${npc.shopId}）` : npc.shopId}  —  ${npc.name.zh} / ${npc.name.en}`,
      `    性格：${npc.personality}`,
      `    声音：${npc.voice.instruct}（seed ${npc.voice.seed}）`,
      `    台词：${job.line.zh}`,
      ...(job.line.tts ? [`    朗读：${job.line.tts}`] : []),
      `    英文：${job.line.en}`,
      `    时长：${dur.toFixed(2)} s`,
      ...(qa[job.line.id]?.hash === job.hash ? [`    回听：${qa[job.line.id].hyp}（CER ${qa[job.line.id].cer.toFixed(3)}）`] : []),
      '',
    );
    chunks.push(pcm, gap);
    t += dur + GAP;
  }
  const total = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
  let off = 0;
  for (const c of chunks) {
    total.set(c, off);
    off += c.length;
  }
  const mixPath = join(workDir, 'audition-all.m4a');
  ff(['-v', 'error', '-y', '-f', 's16le', '-ar', String(SR), '-ac', '1', '-i', 'pipe:0',
    '-c:a', 'aac_at', '-aac_at_mode', 'cvbr', '-b:a', '96k', '-movflags', '+faststart', mixPath], total);
  list.splice(4, 0, `共 ${n} 段，总长 ${(total.length / 2 / SR).toFixed(1)} 秒`);
  writeFileSync(join(workDir, 'audition-list.txt'), `${list.join('\n')}\n`);
  console.log(`\n试音合集：${rel(mixPath)}（${n} 段，${(total.length / 2 / SR).toFixed(1)} s）\n试音清单：${rel(join(workDir, 'audition-list.txt'))}`);
}

// ---------- 主流程 ----------
async function main(): Promise<void> {
  // 与 mallLayout 核对：每家主要店都应该有店员
  try {
    const { mallLayout } = await import('../../src/data/mallLayout.ts');
    const mainShops = mallLayout.shops.filter((s) => s.tier === 'main').map((s) => s.id);
    const missing = mainShops.filter((id) => !npcs.some((n) => n.shopId === id));
    const extra = npcs.filter((n) => !mainShops.includes(n.shopId)).map((n) => n.shopId);
    if (missing.length) console.log(`! 这些主要店还没有店员：${missing.join(', ')}`);
    if (extra.length) console.log(`! 这些店员对应的店不是主要店：${extra.join(', ')}`);
  } catch {
    /* 布局文件正在被改时跳过核对 */
  }

  const selected = npcs.filter((n) => !only || only.has(n.shopId));
  const jobs = selected.flatMap((n) => (audition && !all ? [n.lines[0]] : n.lines).map((l) => makeJob(n, l)));

  const manifest = loadManifest();
  const timings: { id: string; wall: number; audio: number; load: number; gen: number; attempts: number }[] = [];
  const warnings: string[] = [];
  const failures: string[] = [];
  const processed: Job[] = [];
  const batchStart = Date.now();
  let ttsCalls = 0;

  if (!qaOnly) {
    console.log(`共 ${jobs.length} 句（${audition && !all ? '试音：每位店员第 1 句' : '全部台词'}）`);
    for (const job of jobs) {
      const gen = readJson<GenInfo>(job.genJson);
      const needTts = force || !existsSync(job.rawWav) || gen?.hash !== job.hash;
      const post = readJson<PostInfo>(job.postJson);
      const entry = manifest.lines[job.line.id];
      const needPost =
        needTts || reencode || !existsSync(job.outAbs) || post?.hash !== job.hash || post?.postVersion !== POST.version || entry?.hash !== job.hash;
      if (!needTts && !needPost) {
        console.log(`= ${job.line.id} 已是最新`);
        continue;
      }
      try {
        let info = gen;
        if (needTts) {
          if (ttsCalls > 0) sleep(PAUSE_MS);
          ttsCalls++;
          info = runTts(job);
          timings.push({
            id: job.line.id,
            wall: info.wallSeconds,
            audio: round(info.tts.audio_seconds, 2),
            load: round(info.tts.load_seconds, 2),
            gen: round(info.tts.generation_seconds, 2),
            attempts: info.attempts,
          });
        }
        const p = postProcess(job);
        manifest.lines[job.line.id] = { file: job.outRel, durationSec: p.durationSec, hash: job.hash };
        saveManifest(manifest);
        processed.push(job);
        const w = durationWarning(job.text, p.durationSec);
        if (w) warnings.push(`${job.line.id}：${w}`);
        if (Math.abs(p.out.i - POST.targetLufs) > 1.0) warnings.push(`${job.line.id}：响度 ${p.out.i} LUFS（限幅后达不到目标）`);
        console.log(
          `${needTts ? '+' : '~'} ${job.line.id.padEnd(16)} ${needTts && info ? `TTS ${info.wallSeconds.toFixed(1).padStart(5)} s（音频 ${info.tts.audio_seconds.toFixed(2)} s）` : '只重做后期'.padEnd(24)}` +
            `  → ${p.durationSec.toFixed(2)} s  ${p.out.i.toFixed(1)} LUFS  ${p.out.tp.toFixed(1)} dBTP${p.limiter ? '  [限幅]' : ''}` +
            `${p.breathCut.start > 0 ? `  [裁开头气声 ${p.breathCut.start}s]` : ''}${p.breathCut.end !== null ? `  [裁结尾气声，止于 ${p.breathCut.end}s]` : ''}`,
        );
      } catch (e) {
        failures.push(`${job.line.id}：${String(e).split('\n')[0]}`);
        console.log(`✗ ${job.line.id} ${String(e)}`);
      }
    }
  }

  if (prune) {
    const valid = new Set(npcs.flatMap((n) => n.lines.map((l) => l.id)));
    for (const id of Object.keys(manifest.lines)) if (!valid.has(id)) delete manifest.lines[id];
    saveManifest(manifest);
  }

  const batchSec = (Date.now() - batchStart) / 1000;
  if (timings.length) {
    const sum = (k: 'wall' | 'audio' | 'gen' | 'load') => timings.reduce((s, x) => s + x[k], 0);
    console.log(
      `\nTTS ${timings.length} 次：进程总耗时 ${sum('wall').toFixed(1)} s（平均 ${(sum('wall') / timings.length).toFixed(1)} s），` +
        `生成 ${sum('gen').toFixed(1)} s，音频共 ${sum('audio').toFixed(1)} s；整批（含后期和停顿）${batchSec.toFixed(1)} s`,
    );
    writeJson(join(workDir, 'last-run.json'), { finishedAt: new Date().toISOString(), batchSeconds: round(batchSec, 1), timings, warnings, failures });
  }

  const qaJobs = qaOnly ? jobs : processed;
  if (!noQa && qaJobs.length) {
    const results = runQa(qaJobs);
    const bad = results.filter((r) => r.cer > 0.1);
    if (results.length) {
      const mean = results.reduce((s, r) => s + r.cer, 0) / results.length;
      console.log(`CER 平均 ${mean.toFixed(3)}，> 0.1 的 ${bad.length} 句${bad.length ? '：' : ''}`);
      for (const r of bad) console.log(`  ${r.id}  CER ${r.cer.toFixed(3)}\n    文本：${r.ref}\n    听写：${r.hyp}`);
    }
  }

  if (audition && !qaOnly) await buildAuditionMix();

  if (warnings.length) console.log(`\n提醒：\n  ${warnings.join('\n  ')}`);
  if (failures.length) {
    console.log(`\n失败 ${failures.length} 句：\n  ${failures.join('\n  ')}`);
    process.exit(2);
  }
}

await main();
