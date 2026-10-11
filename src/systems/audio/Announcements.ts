import type { AudioEngine } from './AudioEngine.ts';
import type { VoicePlayer } from './VoicePlayer.ts';
import type { DayCycle } from '../../render/DayCycle.ts';
import { announcements, type Announcement, type AnnouncementTrigger } from '../../data/announcements.ts';
import { i18n } from '../../ui/i18n.ts';

// 商场广播：上行四音“叮咚”提示音 → 广播员语音（带一点扬声器和大空间的音色）+ 字幕 → 下行提示音。
// 播放时 BGM 压低。触发：
// - timed：每 7–9 分钟（真实时间）轮播一条，开局约 1.5 分钟后第一条；
// - morning / sunset / night：游戏时间自然走到 7:00、17:15、19:30 时（拖动时间滑块不触发）；
// - cinema：影院开场前 15 分钟（游戏时间 10:45、14:45、18:45）。
// 两条广播之间至少隔 60 秒；店员正在说话时等一等；在影厅里看电影时不播。

const STORAGE_KEY = 'mall.announce';
const AT: { trigger: AnnouncementTrigger; hour: number }[] = [
  { trigger: 'morning', hour: 7 },
  { trigger: 'cinema', hour: 10.75 },
  { trigger: 'cinema', hour: 14.75 },
  { trigger: 'sunset', hour: 17.25 },
  { trigger: 'cinema', hour: 18.75 },
  { trigger: 'night', hour: 19.5 },
];
const CHIME_UP = [349.23, 440, 523.25, 698.46];
const CHIME_DOWN = [698.46, 523.25, 440, 349.23];
const NOTE_GAP = 0.27;
const MIN_GAP = 60;

type Phase = 'idle' | 'chimeIn' | 'speech' | 'chimeOut';

export class AnnouncementSystem {
  private enabled = loadEnabled();
  private readonly queue: Announcement[] = [];
  private timedOrder: Announcement[] = [];
  private nextTimed = 90;
  private sinceLast = MIN_GAP;
  private prevHours: number;
  private phase: Phase = 'idle';
  private phaseT = 0;
  private speechLen = 0;
  private current: Announcement | null = null;
  private releaseDuck: (() => void) | null = null;
  private source: AudioBufferSourceNode | null = null;
  private readonly caption: HTMLDivElement;
  private pa: AudioNode | null = null;
  onChange: () => void = () => {};

  constructor(
    private readonly audio: AudioEngine,
    private readonly voice: VoicePlayer,
    private readonly day: DayCycle,
  ) {
    this.prevHours = day.hours;
    this.caption = document.createElement('div');
    this.caption.className = 'announce-caption hidden';
    document.body.append(this.caption);
    i18n.onChange(() => this.renderCaption());
  }

  get isEnabled() {
    return this.enabled;
  }

  get playing(): Announcement | null {
    return this.current;
  }

  setEnabled(v: boolean) {
    this.enabled = v;
    try {
      localStorage.setItem(STORAGE_KEY, v ? '1' : '0');
    } catch {
      // 存不了就只在这次有效
    }
    if (!v) {
      this.queue.length = 0;
      this.stop();
    }
    this.onChange();
  }

  /** 立刻排队播一条（测试用；也给以后的事件触发用） */
  trigger(id: string) {
    const a = announcements.find((x) => x.id === id);
    if (a) {
      this.queue.unshift(a);
      this.sinceLast = MIN_GAP;
    }
  }

  /**
   * 每帧调用。started：玩家已经开始游戏；hold：现在不适合播（在影厅看电影）；
   * npcTalking：店员正在说话（等说完）。
   */
  update(dt: number, started: boolean, hold: boolean, npcTalking: boolean) {
    this.advance(dt);
    // 游戏时间自然走过某个整点（拖动滑块会一下跳很多，不算）
    const h = this.day.hours;
    const delta = (h - this.prevHours + 24) % 24;
    if (delta > 0 && delta < 0.3) {
      for (const at of AT) {
        if (crossed(this.prevHours, h, at.hour)) this.enqueue(at.trigger);
      }
    }
    this.prevHours = h;
    if (!started || !this.enabled) return;
    if (!document.hidden) {
      this.nextTimed -= dt;
      this.sinceLast += dt;
    }
    if (this.nextTimed <= 0) {
      this.nextTimed = 420 + Math.random() * 120;
      this.enqueue('timed');
    }
    if (this.phase !== 'idle' || this.queue.length === 0) return;
    if (this.sinceLast < MIN_GAP || npcTalking || this.audio.ctx.state !== 'running') return;
    const next = this.queue.shift()!;
    if (hold) return; // 在影厅里：这条就不播了
    this.start(next);
  }

  private enqueue(trigger: AnnouncementTrigger) {
    if (!this.enabled) return;
    let a: Announcement | undefined;
    if (trigger === 'timed') {
      if (this.timedOrder.length === 0) this.timedOrder = shuffle(announcements.filter((x) => x.trigger === 'timed'));
      a = this.timedOrder.shift();
    } else a = announcements.find((x) => x.trigger === trigger);
    if (!a) return;
    // 同一条不重复排队；队列太长时丢掉最旧的定时广播
    if (this.queue.some((q) => q.id === a.id)) return;
    this.queue.push(a);
    if (this.queue.length > 2) {
      const i = this.queue.findIndex((q) => q.trigger === 'timed');
      this.queue.splice(i >= 0 ? i : 0, 1);
    }
  }

  private start(a: Announcement) {
    this.current = a;
    this.phase = 'chimeIn';
    this.phaseT = 0;
    this.sinceLast = 0;
    this.releaseDuck = this.audio.duck(0.25, 0.4, 1.5);
    this.chime(CHIME_UP);
    this.voice.preload(a.id);
    this.renderCaption();
    this.caption.classList.remove('hidden');
    this.onChange();
  }

  private advance(dt: number) {
    if (this.phase === 'idle') return;
    this.phaseT += dt;
    const a = this.current!;
    if (this.phase === 'chimeIn' && this.phaseT >= NOTE_GAP * 4 + 0.6) {
      this.phase = 'speech';
      this.phaseT = 0;
      this.speechLen = this.voice.duration(a.id, a.zh);
      void this.playSpeech(a);
    } else if (this.phase === 'speech' && this.phaseT >= this.speechLen + 0.5) {
      this.phase = 'chimeOut';
      this.phaseT = 0;
      this.chime(CHIME_DOWN);
    } else if (this.phase === 'chimeOut' && this.phaseT >= NOTE_GAP * 4 + 1.0) {
      this.finish();
    }
  }

  private async playSpeech(a: Announcement) {
    const buf = await this.voice.getBuffer(a.id);
    if (!buf || this.current !== a || this.phase !== 'speech') return;
    const ctx = this.audio.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.paChain());
    src.start();
    this.source = src;
    this.speechLen = buf.duration;
    this.phaseT = 0;
  }

  /** 扬声器音色：去掉低频和高频、中频略提，再加一点大空间的回声 */
  private paChain(): AudioNode {
    if (this.pa) return this.pa;
    const ctx = this.audio.ctx;
    const hp = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 170 });
    const peak = new BiquadFilterNode(ctx, { type: 'peaking', frequency: 2400, Q: 0.9, gain: 3 });
    const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 7000 });
    const dry = new GainNode(ctx, { gain: 0.95 });
    const delay = new DelayNode(ctx, { delayTime: 0.11, maxDelayTime: 0.5 });
    const fb = new GainNode(ctx, { gain: 0.28 });
    const wetLp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 2800 });
    const wet = new GainNode(ctx, { gain: 0.22 });
    hp.connect(peak).connect(lp);
    lp.connect(dry).connect(this.audio.buses.voice);
    lp.connect(delay);
    delay.connect(wetLp).connect(fb).connect(delay);
    wetLp.connect(wet).connect(this.audio.buses.voice);
    this.pa = hp;
    return hp;
  }

  /** 钟琴一样的提示音：每个音是基音 + 两个泛音，指数衰减 */
  private chime(notes: number[]) {
    const ctx = this.audio.ctx;
    if (ctx.state !== 'running') return;
    const t0 = ctx.currentTime + 0.05;
    const out = new GainNode(ctx, { gain: 0.11 });
    out.connect(this.paChain());
    notes.forEach((f, i) => {
      const t = t0 + i * NOTE_GAP;
      for (const [mul, amp, decay] of [
        [1, 1, 1.4],
        [2, 0.28, 0.7],
        [3.01, 0.08, 0.4],
      ]) {
        const osc = new OscillatorNode(ctx, { type: 'sine', frequency: f * mul });
        const g = new GainNode(ctx, { gain: 0 });
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(amp, t + 0.008);
        g.gain.setTargetAtTime(0, t + 0.02, decay / 3);
        osc.connect(g).connect(out);
        osc.start(t);
        osc.stop(t + decay * 2 + 0.2);
      }
    });
  }

  private stop() {
    if (this.source) {
      try {
        this.source.stop();
      } catch {
        // 已经停了
      }
      this.source.disconnect();
      this.source = null;
    }
    this.finish();
  }

  private finish() {
    this.phase = 'idle';
    this.current = null;
    this.source = null;
    this.releaseDuck?.();
    this.releaseDuck = null;
    this.caption.classList.add('hidden');
    this.onChange();
  }

  private renderCaption() {
    const a = this.current;
    if (!a) return;
    this.caption.innerHTML = `<span class="ac-icon">📢</span><span class="ac-text"></span>`;
    this.caption.querySelector('.ac-text')!.textContent = i18n.pick({ zh: a.zh, en: a.en });
  }
}

function crossed(from: number, to: number, at: number): boolean {
  return from < to ? from < at && to >= at : from < at || to >= at;
}

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function loadEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}
