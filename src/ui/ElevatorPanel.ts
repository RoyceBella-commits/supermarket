import type { ElevatorSystem } from '../world/elevator.ts';
import { i18n } from './i18n.ts';

/**
 * 轿厢里的楼层面板：按 E 打开，数字键 1–5 / B 选楼层，或者用鼠标点。选完自动关闭。
 */
export class ElevatorPanel {
  private readonly root: HTMLDivElement;
  private elevator: ElevatorSystem | null = null;
  private open = false;
  onClose: (relock: boolean) => void = () => {};

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'elevator-panel hidden';
    this.root.addEventListener('mousedown', (e) => e.stopPropagation());
    this.root.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-floor],[data-act]');
      if (!btn) return;
      if (btn.dataset.act === 'close') {
        this.onClose(true);
        return;
      }
      this.choose(Number(btn.dataset.floor));
    });
    document.body.appendChild(this.root);
    window.addEventListener('keydown', (e) => {
      if (!this.open) return;
      let floor: number | null = null;
      if (e.code === 'KeyB' || e.code === 'Digit0' || e.code === 'Numpad0') floor = -1;
      const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
      if (m) floor = Number(m[1]) - 1;
      if (floor !== null && this.elevator?.floors.includes(floor)) {
        e.preventDefault();
        this.choose(floor);
      }
    });
    i18n.onChange(() => this.render());
  }

  get isOpen() {
    return this.open;
  }

  show(elevator: ElevatorSystem) {
    this.elevator = elevator;
    this.open = true;
    elevator.onChange = () => this.render();
    this.root.classList.remove('hidden');
    this.render();
  }

  hide() {
    this.open = false;
    this.root.classList.add('hidden');
  }

  private choose(floor: number) {
    this.elevator?.request(floor);
    this.onClose(true);
  }

  render() {
    const el = this.elevator;
    if (!el || !this.open) return;
    const t = i18n.t.bind(i18n);
    const floors = [...el.floors].reverse();
    const keyOf = (f: number) => (f < 0 ? 'B' : String(f + 1));
    this.root.innerHTML = `
      <div class="ep-head">
        <span>${i18n.pick(el.def.label)}</span>
        <button type="button" class="ep-close" data-act="close" title="${t('music.close')}">✕</button>
      </div>
      <div class="ep-now">${el.label(el.floor)}${el.state === 'moving' ? ' …' : ''}</div>
      <div class="ep-grid">
        ${floors
          .map((f) => {
            const queued = el.queue.includes(f);
            const here = f === el.floor && el.state !== 'moving';
            return `<button type="button" class="ep-btn${queued ? ' queued' : ''}${here ? ' here' : ''}" data-floor="${f}">
              <b>${el.label(f)}</b><span class="kbd">${keyOf(f)}</span></button>`;
          })
          .join('')}
      </div>
      <div class="ep-hint">${t('elevator.panelHint')}</div>`;
  }
}
