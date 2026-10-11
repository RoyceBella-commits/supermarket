/**
 * 播放一段已解码的 AudioBuffer。带循环点的曲目用 AudioBufferSourceNode 的 loopStart/loopEnd 做采样级无缝循环：
 * 从 0 开始播放（前奏只播一次），播到 loopEnd 跳回 loopStart。
 */
export class BufferDeck {
  private source: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;
  private loopPoints: { start: number; end: number } | null = null;
  private loopWhole = false;
  private startCtxTime = 0;
  private startOffset = 0;
  private pausedAt = 0;
  playing = false;
  onEnded: () => void = () => {};

  constructor(
    private readonly ctx: AudioContext,
    private readonly output: AudioNode,
  ) {}

  /** loop 为 null 表示没有循环点。loopWhole = 没有循环点时是否整首循环（占位音乐用）。 */
  setBuffer(buffer: AudioBuffer, loop: { start: number; end: number } | null, loopWhole = false) {
    this.stop();
    this.buffer = buffer;
    this.loopPoints = loop;
    this.loopWhole = loopWhole;
    this.pausedAt = 0;
  }

  get duration(): number {
    return this.buffer?.duration ?? 0;
  }

  get hasLoop(): boolean {
    return this.loopPoints !== null || this.loopWhole;
  }

  /** 循环段的终点（秒）；没有循环时为整首长度。列表模式下播到这里就换下一首。 */
  get passEnd(): number {
    return this.loopPoints?.end ?? this.duration;
  }

  /** 当前播放位置（秒），循环后会回绕到循环段内。 */
  get currentTime(): number {
    if (!this.playing) return this.pausedAt;
    const pos = this.startOffset + (this.ctx.currentTime - this.startCtxTime);
    if (this.loopPoints && pos >= this.loopPoints.end) {
      const { start, end } = this.loopPoints;
      return start + ((pos - start) % (end - start));
    }
    if (this.loopWhole && this.duration > 0) return pos % this.duration;
    return Math.min(pos, this.duration);
  }

  play(offset = this.pausedAt) {
    if (!this.buffer) return;
    this.stopSource();
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    if (this.loopPoints) {
      src.loop = true;
      src.loopStart = this.loopPoints.start;
      src.loopEnd = this.loopPoints.end;
      // 起播点不能落在 loopEnd 之后（文件末尾那 1 秒缓冲）
      if (offset >= this.loopPoints.end) offset = this.loopPoints.start;
    } else if (this.loopWhole) {
      src.loop = true;
    }
    offset = Math.max(0, Math.min(offset, this.buffer.duration - 0.01));
    src.connect(this.output);
    src.onended = () => {
      if (this.source !== src) return;
      this.source = null;
      this.playing = false;
      this.pausedAt = 0;
      this.onEnded();
    };
    src.start(0, offset);
    this.source = src;
    this.startCtxTime = this.ctx.currentTime;
    this.startOffset = offset;
    this.playing = true;
  }

  pause() {
    if (!this.playing) return;
    this.pausedAt = this.currentTime;
    this.stopSource();
    this.playing = false;
  }

  seek(t: number) {
    if (this.playing) this.play(t);
    else this.pausedAt = t;
  }

  stop() {
    this.stopSource();
    this.playing = false;
    this.pausedAt = 0;
  }

  private stopSource() {
    const src = this.source;
    this.source = null;
    if (!src) return;
    src.onended = null;
    try {
      src.stop();
    } catch {
      // 已经停止
    }
    src.disconnect();
  }
}
