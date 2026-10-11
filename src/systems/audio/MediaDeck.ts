/**
 * 播放导入的本地歌曲：<audio> 元素流式解码（不必整首解进内存），经 MediaElementSource 接入 Web Audio。
 * 每个元素只能创建一次 MediaElementSource，所以 deck 复用同一个元素，只换 src。
 */
export class MediaDeck {
  private readonly el: HTMLAudioElement;
  onEnded: () => void = () => {};

  constructor(ctx: AudioContext, output: AudioNode) {
    this.el = new Audio();
    this.el.preload = 'auto';
    const node = ctx.createMediaElementSource(this.el);
    node.connect(output);
    this.el.addEventListener('ended', () => this.onEnded());
  }

  /** 载入地址，等到能读出时长；失败时抛错。 */
  load(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const el = this.el;
      const cleanup = () => {
        el.removeEventListener('loadedmetadata', ok);
        el.removeEventListener('error', fail);
      };
      const ok = () => {
        cleanup();
        resolve();
      };
      const fail = () => {
        cleanup();
        reject(new Error(el.error?.message || 'media error'));
      };
      el.addEventListener('loadedmetadata', ok);
      el.addEventListener('error', fail);
      el.src = url;
      el.load();
    });
  }

  get src(): string {
    return this.el.src;
  }

  get duration(): number {
    const d = this.el.duration;
    return Number.isFinite(d) ? d : 0;
  }

  get currentTime(): number {
    return this.el.currentTime;
  }

  get playing(): boolean {
    return !this.el.paused && !this.el.ended;
  }

  play(offset?: number): Promise<void> {
    if (offset !== undefined) this.el.currentTime = offset;
    return this.el.play();
  }

  pause() {
    this.el.pause();
  }

  seek(t: number) {
    this.el.currentTime = t;
  }

  stop() {
    this.el.pause();
    if (this.el.getAttribute('src')) {
      this.el.removeAttribute('src');
      this.el.load();
    }
  }
}
