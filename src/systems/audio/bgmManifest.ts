// 内置 BGM 歌单（由 tools/audio 生成）。本机版 playlist.local.json（不进 git）优先，没有就用公开版 playlist.json。

export interface BgmLoop {
  /** 相对输出文件的采样位置：播到 endSample 跳回 startSample */
  startSample: number;
  endSample: number;
  crossfadeMs: number;
}

export interface BgmTrack {
  id: string;
  title: string;
  artist: string;
  /** 相对 /audio/bgm/ 的路径 */
  file: string;
  sampleRate: number;
  lengthSamples: number;
  durationSec: number;
  loop: BgmLoop | null;
  lufs: number;
  /** 把响度对齐到 targetLufs 的增益 */
  gainDb: number;
  license: string;
  source?: string;
}

export interface BgmManifest {
  version: 1;
  targetLufs: number;
  tracks: BgmTrack[];
}

const BASE = `${import.meta.env.BASE_URL}audio/bgm/`;

export function trackUrl(t: BgmTrack): string {
  return BASE + t.file.split('/').map(encodeURIComponent).join('/');
}

/** 依次尝试本机版和公开版歌单。Vite 开发服务器对不存在的文件会返回 index.html，所以要检查类型并解析。 */
export async function loadBuiltinManifest(): Promise<{ manifest: BgmManifest; source: 'local' | 'public' } | null> {
  for (const source of ['local', 'public'] as const) {
    const url = BASE + (source === 'local' ? 'playlist.local.json' : 'playlist.json');
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) continue;
      const type = res.headers.get('content-type') ?? '';
      if (type.includes('text/html')) continue;
      const data: unknown = await res.json();
      if (isManifest(data) && data.tracks.length > 0) return { manifest: data, source };
    } catch {
      // 文件不存在或不是 JSON：试下一个
    }
  }
  return null;
}

function isManifest(x: unknown): x is BgmManifest {
  if (!x || typeof x !== 'object') return false;
  const m = x as Partial<BgmManifest>;
  return (
    m.version === 1 &&
    Array.isArray(m.tracks) &&
    m.tracks.every((t) => typeof t?.id === 'string' && typeof t.file === 'string' && typeof t.sampleRate === 'number')
  );
}

/**
 * 找不到内置 BGM 时的占位音乐：16 秒、四个和弦的柔和铺底，首尾相接可以循环。
 */
export function createPlaceholderBuffer(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const seconds = 16;
  const n = sr * seconds;
  const buf = ctx.createBuffer(2, n, sr);
  const chords = [
    [261.63, 329.63, 392.0, 493.88], // Cmaj7
    [220.0, 261.63, 329.63, 392.0], // Am7
    [174.61, 220.0, 261.63, 329.63], // Fmaj7
    [196.0, 246.94, 293.66, 329.63], // G6
  ];
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    const detune = ch === 0 ? 0.998 : 1.002;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const k = Math.floor(t / 4) % 4;
      const local = t % 4;
      const env = Math.pow(Math.sin((Math.PI * local) / 4), 0.8);
      let s = 0;
      for (const f of chords[k]) s += Math.sin(2 * Math.PI * f * detune * t) + 0.25 * Math.sin(4 * Math.PI * f * detune * t);
      data[i] = s * env * 0.05;
    }
  }
  return buf;
}
