import { i18n } from './i18n.ts';

type Mode = 'loading' | 'start' | 'paused' | 'hidden';

/** 开始界面 / 暂停界面。点击后由 Game 负责锁定指针、解锁音频。 */
export class StartOverlay {
  private readonly root: HTMLDivElement;
  private mode: Mode = 'loading';
  private note = '';
  onActivate: () => void = () => {};

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'overlay';
    this.root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.lang-toggle')) return;
      if (this.mode === 'start' || this.mode === 'paused') this.onActivate();
    });
    document.body.appendChild(this.root);
    i18n.onChange(() => this.render());
    this.render();
  }

  setMode(mode: Mode) {
    this.mode = mode;
    if (mode !== 'paused') this.note = '';
    this.render();
  }

  setNote(note: string) {
    this.note = note;
    this.render();
  }

  get visible() {
    return this.mode !== 'hidden';
  }

  private render() {
    const t = i18n.t.bind(i18n);
    this.root.classList.toggle('hidden', this.mode === 'hidden');
    if (this.mode === 'hidden') return;
    const k = (s: string) => `<span class="kbd">${s}</span>`;
    const cta = this.mode === 'loading' ? t('start.loading') : this.mode === 'paused' ? t('start.resume') : t('start.click');
    this.root.innerHTML = `
      <div class="overlay-card">
        <button class="lang-toggle" type="button">中 / EN</button>
        <h1 class="overlay-title">${t('app.title')}</h1>
        <p class="overlay-subtitle">${t('app.subtitle')}</p>
        <div class="overlay-controls">
          <div>${k('W')}${k('A')}${k('S')}${k('D')}</div><div>${t('controls.move')}</div>
          <div>${k('Shift')}</div><div>${t('controls.run')}</div>
          <div>${k('Space')}</div><div>${t('controls.jump')}</div>
          <div>${k(t('controls.mouse'))}</div><div>${t('controls.look')}</div>
          <div>${k('M')}</div><div>${t('controls.music')}</div>
          <div>${k('L')}</div><div>${t('controls.lang')}</div>
          <div>${k('Esc')}</div><div>${t('controls.pause')}</div>
        </div>
        <div class="overlay-cta">${cta}</div>
        <div class="overlay-note">${this.note}</div>
      </div>`;
    this.root.querySelector('.lang-toggle')!.addEventListener('click', (e) => {
      e.stopPropagation();
      i18n.toggle();
    });
  }
}
