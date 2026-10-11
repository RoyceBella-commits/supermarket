import type { MusicDirector } from '../systems/audio/MusicDirector.ts';
import type { PlaylistItem } from '../systems/audio/Playlist.ts';
import { AUDIO_ACCEPT } from '../systems/audio/formatSupport.ts';
import { i18n } from './i18n.ts';

/**
 * 音乐面板（M 键）：正在播放、进度、播放控制、模式、音量、歌单（勾选 / 移除）、导入本地音乐（多选或拖放）。
 */
export class MusicPanel {
  private readonly root: HTMLDivElement;
  private readonly fileInput: HTMLInputElement;
  private open = false;
  private seeking = false;
  private timer = 0;
  onClose: () => void = () => {};

  constructor(private readonly music: MusicDirector) {
    this.root = document.createElement('div');
    this.root.className = 'music-panel hidden';
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.multiple = true;
    this.fileInput.accept = AUDIO_ACCEPT;
    this.fileInput.hidden = true;
    this.fileInput.addEventListener('change', () => {
      const files = [...(this.fileInput.files ?? [])];
      this.fileInput.value = '';
      if (files.length) void this.music.importFiles(files);
    });
    document.body.append(this.root, this.fileInput);

    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('change', (e) => this.onChange(e));
    this.root.addEventListener('input', (e) => this.onInput(e));
    // 面板里的点击不要传到画面上（否则会触发指针锁定）
    this.root.addEventListener('mousedown', (e) => e.stopPropagation());

    music.playlist.onChange(() => this.open && this.render());
    i18n.onChange(() => this.open && this.render());
    this.setupDrop();
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

  openFilePicker() {
    this.fileInput.click();
  }

  private render() {
    const m = this.music;
    const t = i18n.t.bind(i18n);
    const cur = m.current;
    const modeLabel = t(`music.mode.${m.mode}` as const);
    const items = m.playlist.items;
    this.root.innerHTML = `
      <div class="mp-header">
        <h2>♪ ${t('music.title')}</h2>
        <div class="mp-header-actions">
          <button type="button" data-act="lang" class="mp-chip">中 / EN</button>
          <button type="button" data-act="close" class="mp-icon" title="${t('music.close')}">✕</button>
        </div>
      </div>
      <div class="mp-now">
        <div class="mp-now-title">${esc(cur ? cur.title : t('music.notPlaying'))}</div>
        <div class="mp-now-sub">${esc(cur?.artist ?? '')}${m.holdingLoop ? ` <span class="mp-badge">${t('music.loopBadge')}</span>` : ''}</div>
        <input type="range" class="mp-seek" min="0" max="1000" value="0" data-act="seek" ${cur ? '' : 'disabled'} />
        <div class="mp-times"><span class="mp-cur">0:00</span><span class="mp-dur">0:00</span></div>
        <div class="mp-controls">
          <button type="button" data-act="prev" class="mp-icon" title="${t('music.prev')}">⏮</button>
          <button type="button" data-act="toggle" class="mp-play" title="${m.isPlaying ? t('music.pause') : t('music.play')}">${m.isPlaying ? '⏸' : '▶'}</button>
          <button type="button" data-act="next" class="mp-icon" title="${t('music.next')}">⏭</button>
          <button type="button" data-act="mode" class="mp-chip mp-mode">${modeLabel}</button>
        </div>
        <label class="mp-volume">${t('music.volume')}
          <input type="range" min="0" max="100" value="${Math.round(m.getVolume() * 100)}" data-act="volume" />
        </label>
      </div>
      <ul class="mp-list">
        ${items.length === 0 ? `<li class="mp-empty">${t('music.empty')}</li>` : items.map((it) => this.row(it, cur)).join('')}
      </ul>
      <div class="mp-import">
        <button type="button" data-act="import" class="mp-import-btn">＋ ${t('music.import')}</button>
        <div class="mp-hint">${t('music.dropHint')}</div>
        <div class="mp-note">${t('music.importNote')}</div>
      </div>`;
    this.updateProgress();
  }

  private row(it: PlaylistItem, cur: PlaylistItem | null): string {
    const t = i18n.t.bind(i18n);
    const playing = cur?.id === it.id;
    const cls = ['mp-row', playing ? 'playing' : '', it.status === 'error' ? 'error' : '', it.enabled ? '' : 'off'].join(' ');
    const status =
      it.status === 'checking'
        ? `<span class="mp-status">${t('music.checking')}</span>`
        : it.status === 'error'
          ? `<span class="mp-status err">✕</span>`
          : `<span class="mp-dur-cell">${it.duration ? fmt(it.duration) : ''}</span>`;
    const badge = it.kind !== 'imported' ? `<span class="mp-badge">${t('music.builtin')}</span>` : '';
    const remove = it.kind === 'imported' ? `<button type="button" class="mp-icon mp-remove" data-act="remove" data-id="${it.id}" title="${t('music.remove')}">🗑</button>` : '';
    const title = it.status === 'error' ? t('music.unsupported', { name: it.file?.name ?? it.title }) : it.title;
    return `<li class="${cls}" data-id="${it.id}">
      <input type="checkbox" data-act="enable" data-id="${it.id}" ${it.enabled ? 'checked' : ''} ${it.status === 'error' ? 'disabled' : ''} title="${t('music.enable')}" />
      <button type="button" class="mp-row-main" data-act="play" data-id="${it.id}" title="${esc(title)}" ${it.status === 'ok' ? '' : 'disabled'}>
        <span class="mp-row-icon">${playing ? (this.music.isPlaying ? '♪' : '❚❚') : ''}</span>
        <span class="mp-row-title">${esc(it.title)}${it.artist ? `<small>${esc(it.artist)}</small>` : ''}</span>
      </button>
      ${badge}${status}${remove}
    </li>`;
  }

  private updateProgress() {
    if (!this.open) return;
    const m = this.music;
    const dur = m.currentDuration;
    const time = m.currentTime;
    const seek = this.root.querySelector<HTMLInputElement>('.mp-seek');
    if (seek && !this.seeking) seek.value = dur > 0 ? String(Math.round((time / dur) * 1000)) : '0';
    const curEl = this.root.querySelector('.mp-cur');
    const durEl = this.root.querySelector('.mp-dur');
    if (curEl && !this.seeking) curEl.textContent = fmt(time);
    if (durEl) durEl.textContent = fmt(dur);
    const play = this.root.querySelector<HTMLButtonElement>('.mp-play');
    if (play) play.textContent = m.isPlaying ? '⏸' : '▶';
  }

  private onClick(e: MouseEvent) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el || el.tagName === 'INPUT') return;
    const id = el.dataset.id ?? '';
    switch (el.dataset.act) {
      case 'close':
        this.onClose();
        break;
      case 'lang':
        i18n.toggle();
        break;
      case 'prev':
        this.music.prev();
        break;
      case 'next':
        this.music.next();
        break;
      case 'toggle':
        this.music.toggle();
        this.render();
        break;
      case 'mode':
        this.music.cycleMode();
        break;
      case 'play':
        this.music.playItem(id);
        break;
      case 'remove':
        this.music.remove(id);
        break;
      case 'import':
        this.openFilePicker();
        break;
    }
  }

  private onChange(e: Event) {
    const el = e.target as HTMLInputElement;
    switch (el.dataset.act) {
      case 'enable':
        this.music.setEnabled(el.dataset.id ?? '', el.checked);
        break;
      case 'seek': {
        const dur = this.music.currentDuration;
        this.music.seek((Number(el.value) / 1000) * dur);
        this.seeking = false;
        break;
      }
    }
  }

  private onInput(e: Event) {
    const el = e.target as HTMLInputElement;
    if (el.dataset.act === 'volume') this.music.setVolume(Number(el.value) / 100);
    if (el.dataset.act === 'seek') {
      this.seeking = true;
      const cur = this.root.querySelector('.mp-cur');
      if (cur) cur.textContent = fmt((Number(el.value) / 1000) * this.music.currentDuration);
    }
  }

  /** 整个页面都可以拖入音乐文件。 */
  private setupDrop() {
    let depth = 0;
    const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files');
    window.addEventListener('dragenter', (e) => {
      if (!hasFiles(e)) return;
      depth++;
      document.body.classList.add('dropping');
    });
    window.addEventListener('dragleave', () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) document.body.classList.remove('dropping');
    });
    window.addEventListener('dragover', (e) => {
      if (hasFiles(e)) e.preventDefault();
    });
    window.addEventListener('drop', (e) => {
      depth = 0;
      document.body.classList.remove('dropping');
      if (!hasFiles(e)) return;
      e.preventDefault();
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length) void this.music.importFiles(files);
    });
  }
}

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
