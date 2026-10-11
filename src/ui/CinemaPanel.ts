import type { CinemaSystem } from '../systems/cinema/CinemaSystem.ts';
import { i18n } from './i18n.ts';

/**
 * 影院控制面板（在银幕前按 E）：选择本地视频、播放 / 暂停、进度、音量、停止。
 * 文件只在本机播放，不会上传。
 */
export class CinemaPanel {
  private readonly root: HTMLDivElement;
  private readonly fileInput: HTMLInputElement;
  private open = false;
  private seeking = false;
  private timer = 0;
  onClose: (relock: boolean) => void = () => {};

  constructor(private readonly cinema: CinemaSystem) {
    this.root = document.createElement('div');
    this.root.className = 'cinema-panel hidden';
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = 'video/*,.mp4,.m4v,.webm,.mov,.ogv';
    this.fileInput.hidden = true;
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files?.[0];
      this.fileInput.value = '';
      if (file) void this.cinema.load(file);
    });
    document.body.append(this.root, this.fileInput);
    this.root.addEventListener('mousedown', (e) => e.stopPropagation());
    this.root.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'pick') this.fileInput.click();
      else if (act === 'toggle') this.cinema.toggle();
      else if (act === 'stop') this.cinema.unload();
      else if (act === 'close') this.onClose(true);
    });
    this.root.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.dataset.act === 'seek') this.seeking = true;
      if (el.dataset.act === 'volume') this.cinema.setVolume(Number(el.value) / 100);
    });
    this.root.addEventListener('change', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.dataset.act === 'seek') {
        this.seeking = false;
        this.cinema.seek((Number(el.value) / 1000) * this.cinema.state.duration);
      }
    });
    cinema.onChange = () => this.open && this.render();
    i18n.onChange(() => this.open && this.render());
  }

  get isOpen() {
    return this.open;
  }

  show() {
    this.open = true;
    this.root.classList.remove('hidden');
    this.render();
    this.timer = window.setInterval(() => this.updateProgress(), 250);
  }

  hide() {
    this.open = false;
    this.root.classList.add('hidden');
    clearInterval(this.timer);
  }

  private render() {
    const s = this.cinema.state;
    const t = i18n.t.bind(i18n);
    this.root.innerHTML = `
      <div class="cp-head"><b>Starlight Cinema</b><button type="button" class="ep-close" data-act="close" title="${t('music.close')}">✕</button></div>
      <div class="cp-title">${s.hasVideo ? esc(s.title) : t('cinema.noVideo')}</div>
      <button type="button" class="cp-pick" data-act="pick">🎬 ${t('cinema.pick')}</button>
      <div class="cp-note">${t('cinema.note')}</div>
      <input type="range" class="cp-seek" min="0" max="1000" value="0" data-act="seek" ${s.hasVideo ? '' : 'disabled'} />
      <div class="cp-times"><span class="cp-cur">0:00</span><span>${fmt(s.duration)}</span></div>
      <div class="cp-controls">
        <button type="button" class="mp-play" data-act="toggle" ${s.hasVideo ? '' : 'disabled'}>${s.playing ? '⏸' : '▶'}</button>
        <button type="button" class="mp-chip" data-act="stop" ${s.hasVideo ? '' : 'disabled'}>${t('cinema.stop')}</button>
        <label class="cp-volume">${t('music.volume')}<input type="range" min="0" max="100" value="${Math.round(s.volume * 100)}" data-act="volume" /></label>
      </div>
      <div class="cp-hint">${t('cinema.hint')}</div>`;
    this.updateProgress();
  }

  private updateProgress() {
    if (!this.open) return;
    const s = this.cinema.state;
    const seek = this.root.querySelector<HTMLInputElement>('.cp-seek');
    if (seek && !this.seeking) seek.value = s.duration > 0 ? String(Math.round((s.time / s.duration) * 1000)) : '0';
    const cur = this.root.querySelector<HTMLElement>('.cp-cur');
    if (cur) cur.textContent = fmt(s.time);
  }
}

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
