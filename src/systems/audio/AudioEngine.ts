export type Bus = 'music' | 'sfx' | 'voice' | 'cinema';

/**
 * 全局唯一的 AudioContext 和混音总线：
 *   music → duck（被语音/广播/影院压低）→ master → 轻度压缩 → 输出
 *   sfx / voice / cinema → master
 * 浏览器要求用户手势后才能出声：开始界面点击时调用 unlock()。
 */
export class AudioEngine {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly buses: Record<Bus, GainNode>;
  private readonly duckNode: GainNode;
  private readonly duckRequests = new Map<number, { level: number; release: number }>();
  private nextDuckId = 1;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'playback' });
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 10;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    comp.connect(this.ctx.destination);

    this.master = this.ctx.createGain();
    this.master.connect(comp);

    this.duckNode = this.ctx.createGain();
    this.duckNode.connect(this.master);

    const bus = (dest: AudioNode) => {
      const g = this.ctx.createGain();
      g.connect(dest);
      return g;
    };
    this.buses = {
      music: bus(this.duckNode),
      sfx: bus(this.master),
      voice: bus(this.master),
      cinema: bus(this.master),
    };
  }

  get running(): boolean {
    return this.ctx.state === 'running';
  }

  /** 必须在用户手势（点击、按键）里调用。 */
  unlock(): Promise<void> {
    return this.ctx.state === 'running' ? Promise.resolve() : this.ctx.resume();
  }

  /**
   * 压低音乐。返回释放函数。多个请求同时存在时取各自系数的乘积。
   * 阶段 4 的 NPC 语音、阶段 5 的广播和影院直接调用它。
   */
  duck(level = 0.3, attack = 0.15, release = 0.6): () => void {
    const id = this.nextDuckId++;
    this.duckRequests.set(id, { level, release });
    this.applyDuck(attack);
    return () => {
      const req = this.duckRequests.get(id);
      if (!req) return;
      this.duckRequests.delete(id);
      this.applyDuck(req.release);
    };
  }

  private applyDuck(time: number) {
    let target = 1;
    for (const r of this.duckRequests.values()) target *= r.level;
    const g = this.duckNode.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.setTargetAtTime(target, now, Math.max(0.01, time / 3));
  }
}
