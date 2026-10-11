import type { AudioEngine } from './AudioEngine.ts';

// NPC 配音：由 tools/voice/generate.ts 生成 public/audio/voice/<shopId>/<lineId>.m4a 和 manifest.json。
// 没有 manifest 或某句没有音频时，对话照常显示字幕，只是不出声。

export interface VoiceManifest {
  version: 1;
  lines: Record<string, { file: string; durationSec: number; hash?: string }>;
}

const BASE = `${import.meta.env.BASE_URL}audio/voice/`;
const CACHE_MAX = 24;

export class VoicePlayer {
  private manifest: VoiceManifest | null = null;
  private readonly cache = new Map<string, Promise<AudioBuffer | null>>();
  private source: AudioBufferSourceNode | null = null;
  private releaseDuck: (() => void) | null = null;
  private playId = 0;

  constructor(private readonly audio: AudioEngine) {}

  async loadManifest(): Promise<void> {
    try {
      const res = await fetch(`${BASE}manifest.json`, { cache: 'no-cache' });
      if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) return;
      const data = (await res.json()) as Partial<VoiceManifest>;
      if (data && data.version === 1 && data.lines && typeof data.lines === 'object') this.manifest = data as VoiceManifest;
    } catch {
      // 还没生成配音
    }
  }

  has(lineId: string): boolean {
    return !!this.manifest?.lines[lineId];
  }

  /** 预计时长（秒）：有音频用音频长度，没有就按字数估 */
  duration(lineId: string, text: string): number {
    return this.manifest?.lines[lineId]?.durationSec ?? Math.max(1.2, [...text].length * 0.17);
  }

  /** 提前解码，按 E 时不用等下载 */
  preload(lineId: string) {
    void this.buffer(lineId);
  }

  /**
   * 播放一句（会先停掉正在播的）。返回实际时长（秒），没有音频返回 null。
   * 播放期间压低 BGM。
   */
  async play(lineId: string): Promise<number | null> {
    this.stop();
    const id = ++this.playId;
    const buf = await this.buffer(lineId);
    if (!buf || id !== this.playId) return null;
    const ctx = this.audio.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.audio.buses.voice);
    this.releaseDuck = this.audio.duck(0.35, 0.12, 0.8);
    src.onended = () => {
      if (this.source !== src) return;
      this.source = null;
      this.releaseDuck?.();
      this.releaseDuck = null;
    };
    src.start();
    this.source = src;
    return buf.duration;
  }

  get playing(): boolean {
    return this.source !== null;
  }

  stop() {
    this.playId++;
    const src = this.source;
    this.source = null;
    if (src) {
      src.onended = null;
      try {
        src.stop();
      } catch {
        // 已经停了
      }
      src.disconnect();
    }
    this.releaseDuck?.();
    this.releaseDuck = null;
  }

  private buffer(lineId: string): Promise<AudioBuffer | null> {
    const entry = this.manifest?.lines[lineId];
    if (!entry) return Promise.resolve(null);
    let p = this.cache.get(lineId);
    if (!p) {
      const url = BASE + entry.file.split('/').map(encodeURIComponent).join('/');
      p = fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((ab) => this.audio.ctx.decodeAudioData(ab))
        .catch((e: unknown) => {
          console.warn('[voice] 无法加载', lineId, e);
          return null;
        });
      this.cache.set(lineId, p);
      if (this.cache.size > CACHE_MAX) this.cache.delete(this.cache.keys().next().value!);
    }
    return p;
  }
}
