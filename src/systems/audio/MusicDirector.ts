import type { AudioEngine } from './AudioEngine.ts';
import { BufferDeck } from './BufferDeck.ts';
import { MediaDeck } from './MediaDeck.ts';
import { PLAY_MODES, Playlist, type PlayMode, type PlaylistItem } from './Playlist.ts';
import { createPlaceholderBuffer, loadBuiltinManifest, trackUrl } from './bgmManifest.ts';
import { looksLikeAudio, probe, titleOf } from './formatSupport.ts';

const AUTO_XFADE = 2.5; // 播完自动换曲的交叉淡化（秒）
const MANUAL_XFADE = 0.8; // 用户手动切歌
const FIRST_FADE_IN = 1.2;
const IMPORTED_GAIN_DB = -6; // 导入的歌通常比内置 BGM（−18 LUFS）响，先压低一些
const VOLUME_KEY = 'mall.music.volume';
const MODE_KEY = 'mall.music.mode';

interface Slot {
  fade: GainNode;
  trim: GainNode;
  buffer: BufferDeck;
  media: MediaDeck;
  kind: 'buffer' | 'media' | null;
  item: PlaylistItem | null;
  /** 每次被重新使用时更新，延迟停止的定时器据此判断这一路是否还是原来那首 */
  token: number;
}

export interface MusicEvents {
  /** 内置歌单的来源：local = 本机版，public = 公开版，placeholder = 占位音乐 */
  onBuiltinLoaded?: (source: 'local' | 'public' | 'placeholder') => void;
  onTrackChange?: (item: PlaylistItem | null) => void;
  onImportResult?: (r: { added: number; notAudio: string[]; unsupported: string[] }) => void;
}

/**
 * 背景音乐导演：两路 A/B 交替，换曲时等功率交叉淡化。
 * - 带循环点的曲目在“单曲循环”或歌单里只剩它一首时无限无缝循环；否则播完一遍（前奏 + 主体）换下一首。
 * - 其他曲目播到结尾前 AUTO_XFADE 秒开始换下一首（单曲循环时换回自己）。
 */
export class MusicDirector {
  readonly playlist = new Playlist();
  private readonly slots: [Slot, Slot];
  private active = 0;
  private generation = 0;
  private transitioning = false;
  private buffers = new Map<string, Promise<AudioBuffer>>();
  private state: 'stopped' | 'playing' | 'paused' = 'stopped';
  private volume = 0.6;
  private importCounter = 0;
  private builtinSource: 'local' | 'public' | 'placeholder' | null = null;
  private firstStartSeek: number | null = null;

  constructor(
    private readonly engine: AudioEngine,
    private readonly events: MusicEvents = {},
  ) {
    const make = (): Slot => {
      const fade = engine.ctx.createGain();
      fade.gain.value = 0;
      fade.connect(engine.buses.music);
      const trim = engine.ctx.createGain();
      trim.connect(fade);
      const slot: Slot = {
        fade,
        trim,
        buffer: new BufferDeck(engine.ctx, trim),
        media: new MediaDeck(engine.ctx, trim),
        kind: null,
        item: null,
        token: 0,
      };
      slot.buffer.onEnded = () => this.onDeckEnded(slot);
      slot.media.onEnded = () => this.onDeckEnded(slot);
      return slot;
    };
    this.slots = [make(), make()];

    try {
      const v = Number(localStorage.getItem(VOLUME_KEY));
      if (localStorage.getItem(VOLUME_KEY) !== null && Number.isFinite(v)) this.volume = Math.max(0, Math.min(1, v));
      const m = localStorage.getItem(MODE_KEY) as PlayMode | null;
      if (m && PLAY_MODES.includes(m)) this.playlist.mode = m;
    } catch {
      // localStorage 不可用时用默认值
    }
    this.applyVolume();

    setInterval(() => this.tick(), 200);
    window.addEventListener('pagehide', () => {
      for (const item of this.playlist.items) if (item.url) URL.revokeObjectURL(item.url);
    });
    this.setupMediaSession();
  }

  // ---------- 加载 ----------

  /** 读内置歌单并预先解码第一首（AudioContext 挂起时也能解码）。 */
  async loadBuiltin(seekSec: number | null = null) {
    this.firstStartSeek = seekSec;
    const res = await loadBuiltinManifest();
    if (res) {
      for (const t of res.manifest.tracks) {
        this.playlist.items.push({
          id: `builtin:${t.id}`,
          kind: 'builtin',
          title: t.title,
          artist: t.artist,
          enabled: true,
          status: 'ok',
          duration: t.loop ? t.loop.endSample / t.sampleRate : t.durationSec,
          track: t,
        });
      }
      this.builtinSource = res.source;
      this.playlist.emit();
      try {
        await this.getBuffer(this.playlist.items[0]);
      } catch (err) {
        console.warn('[music] 内置 BGM 解码失败，改用占位音乐', err);
        this.playlist.items.length = 0;
        this.addPlaceholder();
      }
    } else {
      this.addPlaceholder();
    }
    this.events.onBuiltinLoaded?.(this.builtinSource!);
  }

  private addPlaceholder() {
    this.playlist.items.unshift({
      id: 'placeholder',
      kind: 'placeholder',
      title: 'Placeholder Pad',
      enabled: true,
      status: 'ok',
      duration: 16,
    });
    this.builtinSource = 'placeholder';
    this.playlist.emit();
  }

  private getBuffer(item: PlaylistItem): Promise<AudioBuffer> {
    let p = this.buffers.get(item.id);
    if (!p) {
      if (item.kind === 'placeholder') {
        p = Promise.resolve(createPlaceholderBuffer(this.engine.ctx));
      } else {
        const url = trackUrl(item.track!);
        p = fetch(url)
          .then((r) => {
            if (!r.ok) throw new Error(`${r.status} ${url}`);
            return r.arrayBuffer();
          })
          .then((data) => this.engine.ctx.decodeAudioData(data));
      }
      p.catch(() => this.buffers.delete(item.id));
      this.buffers.set(item.id, p);
    }
    return p;
  }

  /** 导入本地文件：不是音频的跳过；能不能播放由 probe 决定，不能播放的留在列表里置灰。 */
  async importFiles(files: File[]) {
    const notAudio: string[] = [];
    const unsupported: string[] = [];
    const pending: Promise<void>[] = [];
    let added = 0;
    for (const file of files) {
      if (!looksLikeAudio(file)) {
        notAudio.push(file.name);
        continue;
      }
      const url = URL.createObjectURL(file);
      const item: PlaylistItem = {
        id: `import:${++this.importCounter}`,
        kind: 'imported',
        title: titleOf(file.name),
        enabled: true,
        status: 'checking',
        file,
        url,
      };
      this.playlist.add(item);
      pending.push(
        probe(url).then((r) => {
          if (r.ok) {
            item.status = 'ok';
            item.duration = r.duration;
            added++;
          } else {
            item.status = 'error';
            item.enabled = false;
            unsupported.push(file.name);
          }
          this.playlist.emit();
        }),
      );
    }
    await Promise.all(pending);
    this.events.onImportResult?.({ added, notAudio, unsupported });
    // 没有在播放（例如内置曲目都被取消勾选）时，从第一首新歌开始
    if (this.state === 'playing' && !this.current && added > 0) this.next();
  }

  // ---------- 播放控制 ----------

  get isPlaying(): boolean {
    return this.state === 'playing';
  }

  get current(): PlaylistItem | null {
    return this.slots[this.active].item;
  }

  get source() {
    return this.builtinSource;
  }

  /** 首次开始播放（需要先 engine.unlock()）。 */
  start() {
    if (this.state !== 'stopped') return;
    this.state = 'playing';
    const first = this.playlist.next(null, false);
    if (first) void this.transitionTo(first, FIRST_FADE_IN, this.firstStartSeek);
    this.firstStartSeek = null;
  }

  toggle() {
    if (this.state === 'playing') this.pause();
    else if (this.state === 'paused') this.resume();
    else this.start();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    const slot = this.slots[this.active];
    this.deck(slot)?.pause();
    // 正在淡出的另一路直接停掉
    this.hardStop(this.slots[1 - this.active]);
    this.updateMediaSession();
    this.playlist.emit();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    const slot = this.slots[this.active];
    if (slot.kind === 'buffer') slot.buffer.play();
    else if (slot.kind === 'media') void slot.media.play();
    else {
      const first = this.playlist.next(null, false);
      if (first) void this.transitionTo(first, FIRST_FADE_IN);
    }
    this.setFade(slot, 1, 0.15);
    this.updateMediaSession();
    this.playlist.emit();
  }

  next() {
    const item = this.playlist.next(this.current?.id ?? null, false, 1);
    if (item) this.playItem(item.id);
  }

  prev() {
    const cur = this.current;
    // 播放超过 3 秒时“上一首”回到本曲开头
    if (cur && this.currentTime > 3) {
      this.seek(0);
      return;
    }
    const item = this.playlist.next(cur?.id ?? null, false, -1);
    if (item) this.playItem(item.id);
  }

  playItem(id: string) {
    const item = this.playlist.get(id);
    if (!item || item.status !== 'ok') return;
    if (this.state !== 'playing') this.state = 'playing';
    void this.transitionTo(item, MANUAL_XFADE);
  }

  seek(t: number) {
    const slot = this.slots[this.active];
    this.deck(slot)?.seek(t);
    this.hardStop(this.slots[1 - this.active]);
    this.transitioning = false;
  }

  setMode(mode: PlayMode) {
    this.playlist.setMode(mode);
    this.save(MODE_KEY, mode);
  }

  cycleMode() {
    const i = PLAY_MODES.indexOf(this.playlist.mode);
    this.setMode(PLAY_MODES[(i + 1) % PLAY_MODES.length]);
  }

  get mode(): PlayMode {
    return this.playlist.mode;
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyVolume();
    this.save(VOLUME_KEY, String(this.volume));
  }

  getVolume(): number {
    return this.volume;
  }

  setEnabled(id: string, enabled: boolean) {
    this.playlist.setEnabled(id, enabled);
  }

  /** 移除导入的歌；正在播放的先切走再释放对象 URL。 */
  remove(id: string) {
    const item = this.playlist.get(id);
    if (!item || item.kind !== 'imported') return;
    const playingIt = this.slots.some((s) => s.item === item);
    if (playingIt) {
      const next = this.playlist.next(id, false, 1);
      for (const s of this.slots) if (s.item === item) this.hardStop(s);
      if (next && next.id !== id && this.state === 'playing') void this.transitionTo(next, MANUAL_XFADE);
    }
    this.playlist.remove(id);
    if (item.url) URL.revokeObjectURL(item.url);
    this.events.onTrackChange?.(this.current);
  }

  get currentTime(): number {
    const d = this.deck(this.slots[this.active]);
    return d ? d.currentTime : 0;
  }

  /** 进度条用的总长度：带循环点的曲目是循环终点 */
  get currentDuration(): number {
    const slot = this.slots[this.active];
    if (slot.kind === 'buffer') return slot.buffer.passEnd;
    if (slot.kind === 'media') return slot.media.duration;
    return 0;
  }

  /** 当前曲目是否在无缝循环（不会自动换下一首） */
  get holdingLoop(): boolean {
    const slot = this.slots[this.active];
    return !!slot.item && this.shouldHoldLoop(slot.item);
  }

  // ---------- 内部 ----------

  private deck(slot: Slot): BufferDeck | MediaDeck | null {
    return slot.kind === 'buffer' ? slot.buffer : slot.kind === 'media' ? slot.media : null;
  }

  private shouldHoldLoop(item: PlaylistItem): boolean {
    const hasLoop = item.kind === 'placeholder' || !!item.track?.loop;
    if (!hasLoop) return false;
    if (this.playlist.mode === 'one') return true;
    const playable = this.playlist.playable();
    return playable.length === 1 && playable[0] === item;
  }

  private async transitionTo(item: PlaylistItem, fadeSec: number, seek: number | null = null) {
    const gen = ++this.generation;
    this.transitioning = true;
    const from = this.slots[this.active];
    const to = this.slots[1 - this.active];
    this.hardStop(to);
    to.token = gen;

    try {
      if (item.kind === 'imported') {
        to.kind = 'media';
        await to.media.load(item.url!);
      } else {
        const buffer = await this.getBuffer(item);
        if (gen !== this.generation) return;
        to.kind = 'buffer';
        const t = item.track;
        const loop = t?.loop ? { start: t.loop.startSample / t.sampleRate, end: t.loop.endSample / t.sampleRate } : null;
        to.buffer.setBuffer(buffer, loop, item.kind === 'placeholder');
      }
    } catch (err) {
      console.warn('[music] 载入失败', item.title, err);
      if (gen !== this.generation) return;
      item.status = 'error';
      item.enabled = false;
      this.playlist.emit();
      this.transitioning = false;
      const next = this.playlist.next(item.id, false, 1);
      if (next && next !== item) void this.transitionTo(next, MANUAL_XFADE);
      return;
    }
    if (gen !== this.generation) {
      this.hardStop(to);
      return;
    }

    to.item = item;
    const gainDb = item.kind === 'imported' ? IMPORTED_GAIN_DB : (item.track?.gainDb ?? 0);
    to.trim.gain.value = Math.pow(10, gainDb / 20);

    let offset = 0;
    if (seek !== null && to.kind === 'buffer') {
      offset = seek < 0 ? Math.max(0, to.buffer.passEnd + seek) : seek;
    }
    if (this.state === 'playing') {
      if (to.kind === 'buffer') to.buffer.play(offset);
      else {
        try {
          await to.media.play(offset);
        } catch (err) {
          console.warn('[music] 播放失败', err);
        }
      }
    }

    const fromPlaying = from.kind !== null && this.deck(from)?.playing;
    this.setFade(to, 1, fadeSec, true);
    if (fromPlaying) {
      this.setFade(from, 0, fadeSec, true);
      const token = from.token;
      setTimeout(() => {
        // 期间又切过歌的话，from 可能已经被新的曲目重新使用
        if (from.token === token) this.hardStop(from, false);
      }, fadeSec * 1000 + 100);
    } else {
      this.hardStop(from);
    }
    this.active = 1 - this.active;
    this.transitioning = false;
    this.playlist.markPlayed(item.id);
    this.events.onTrackChange?.(item);
    this.updateMediaSession();
    this.playlist.emit();
  }

  /** 等功率淡入淡出 */
  private setFade(slot: Slot, target: number, seconds: number, equalPower = false) {
    const g = slot.fade.gain;
    const now = this.engine.ctx.currentTime;
    const startValue = g.value;
    g.cancelScheduledValues(now);
    if (!equalPower || seconds < 0.05) {
      g.setValueAtTime(startValue, now);
      g.linearRampToValueAtTime(target, now + Math.max(0.01, seconds));
      return;
    }
    const n = 64;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1);
      const shape = target > startValue ? Math.sin((x * Math.PI) / 2) : Math.cos((x * Math.PI) / 2);
      curve[i] = target > startValue ? startValue + (target - startValue) * shape : target + (startValue - target) * shape;
    }
    g.setValueAtTime(startValue, now);
    g.setValueCurveAtTime(curve, now, seconds);
  }

  private hardStop(slot: Slot, clearItem = true) {
    slot.buffer.stop();
    slot.media.stop();
    const g = slot.fade.gain;
    g.cancelScheduledValues(this.engine.ctx.currentTime);
    g.value = 0;
    slot.kind = null;
    if (clearItem) slot.item = null;
  }

  private onDeckEnded(slot: Slot) {
    if (slot !== this.slots[this.active] || this.state !== 'playing' || this.transitioning) return;
    const item = slot.item;
    const next = this.playlist.next(item?.id ?? null, true);
    if (next) void this.transitionTo(next, 0.3);
  }

  /** 每 200 ms 检查是否该换下一首（用定时器而不是渲染循环，切到后台标签页也会继续换歌）。 */
  private tick() {
    if (this.state !== 'playing' || this.transitioning) return;
    const slot = this.slots[this.active];
    const item = slot.item;
    const deck = this.deck(slot);
    if (!item || !deck) return;
    if (this.shouldHoldLoop(item)) return;
    const end = slot.kind === 'buffer' ? slot.buffer.passEnd : slot.media.duration;
    if (end <= 0) return;
    // 当前曲目被取消勾选或出错时也按正常流程播完这一遍
    if (deck.currentTime >= end - AUTO_XFADE) {
      const next = this.playlist.next(item.id, true);
      if (next) void this.transitionTo(next, AUTO_XFADE);
    }
  }

  private applyVolume() {
    // 平方曲线，滑块中段更好控制
    const g = this.engine.buses.music.gain;
    const now = this.engine.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(this.volume * this.volume, now, 0.03);
  }

  private save(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // 忽略
    }
  }

  private setupMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const handlers: [MediaSessionAction, () => void][] = [
      ['play', () => this.resume()],
      ['pause', () => this.pause()],
      ['nexttrack', () => this.next()],
      ['previoustrack', () => this.prev()],
    ];
    for (const [action, fn] of handlers) {
      try {
        ms.setActionHandler(action, fn);
      } catch {
        // 不支持的动作
      }
    }
  }

  private updateMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const item = this.current;
    try {
      navigator.mediaSession.metadata = item ? new MediaMetadata({ title: item.title, artist: item.artist ?? '', album: 'Mall Wander' }) : null;
      navigator.mediaSession.playbackState = this.state === 'playing' ? 'playing' : this.state === 'paused' ? 'paused' : 'none';
    } catch {
      // 忽略
    }
  }
}
