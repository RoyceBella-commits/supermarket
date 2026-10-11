import type { BgmTrack } from './bgmManifest.ts';

export type PlayMode = 'list' | 'one' | 'shuffle';
export const PLAY_MODES: PlayMode[] = ['list', 'one', 'shuffle'];

export interface PlaylistItem {
  id: string;
  /** builtin：内置 BGM（不能删，可以取消勾选）；imported：本次导入的歌；placeholder：找不到内置 BGM 时的占位音乐 */
  kind: 'builtin' | 'imported' | 'placeholder';
  title: string;
  artist?: string;
  /** 是否参与循环 */
  enabled: boolean;
  status: 'checking' | 'ok' | 'error';
  duration?: number;
  track?: BgmTrack;
  file?: File;
  url?: string;
}

/** 歌单：内置曲目在前，导入的歌依次追加。负责“下一首是谁”的规则。 */
export class Playlist {
  readonly items: PlaylistItem[] = [];
  mode: PlayMode = 'list';
  private readonly listeners = new Set<() => void>();
  private history: string[] = [];

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const l of this.listeners) l();
  }

  get(id: string | null): PlaylistItem | undefined {
    return id ? this.items.find((i) => i.id === id) : undefined;
  }

  playable(): PlaylistItem[] {
    return this.items.filter((i) => i.enabled && i.status === 'ok');
  }

  add(item: PlaylistItem) {
    this.items.push(item);
    this.emit();
  }

  remove(id: string): PlaylistItem | undefined {
    const idx = this.items.findIndex((i) => i.id === id);
    if (idx < 0) return undefined;
    const [item] = this.items.splice(idx, 1);
    this.emit();
    return item;
  }

  setEnabled(id: string, enabled: boolean) {
    const item = this.get(id);
    if (!item || item.enabled === enabled) return;
    item.enabled = enabled;
    this.emit();
  }

  setMode(mode: PlayMode) {
    this.mode = mode;
    this.emit();
  }

  /** 记录播放过的曲目，随机模式用来避开刚放过的歌。 */
  markPlayed(id: string) {
    this.history = [id, ...this.history.filter((h) => h !== id)].slice(0, 8);
  }

  /**
   * 下一首。auto = 播完自动切换（单曲循环时返回同一首）；false = 用户点了“下一首”。
   * direction = -1 表示上一首。
   */
  next(currentId: string | null, auto: boolean, direction: 1 | -1 = 1): PlaylistItem | null {
    const playable = this.playable();
    if (playable.length === 0) return null;
    const current = this.get(currentId);
    if (auto && this.mode === 'one' && current && playable.includes(current)) return current;

    if (this.mode === 'shuffle' && direction === 1) {
      if (playable.length === 1) return playable[0];
      // 避开最近放过的一半曲目，再从剩下的里随机
      const avoid = new Set(this.history.slice(0, Math.floor(playable.length / 2)));
      if (currentId) avoid.add(currentId);
      const pool = playable.filter((p) => !avoid.has(p.id));
      const from = pool.length > 0 ? pool : playable.filter((p) => p.id !== currentId);
      return from[Math.floor(Math.random() * from.length)];
    }

    // 列表顺序：从当前曲目在完整列表里的位置往后（或往前）找下一首可播放的
    const n = this.items.length;
    const start = current ? this.items.indexOf(current) : direction === 1 ? -1 : 0;
    for (let k = 1; k <= n; k++) {
      const item = this.items[(((start + k * direction) % n) + n) % n];
      if (item.enabled && item.status === 'ok') return item;
    }
    return null;
  }
}
