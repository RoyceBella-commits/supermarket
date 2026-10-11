import { fmtLap, type KartHudState } from '../systems/karting/KartSystem.ts';
import { i18n } from './i18n.ts';

/** 开卡丁车时的屏幕信息：上方圈数和圈速、右下车速、中间倒计时、底部操作说明。约 10 Hz 刷新。 */
export class KartHud {
  private readonly root: HTMLDivElement;
  private readonly count: HTMLDivElement;
  private shown = false;
  private last = 0;
  private goUntil = 0;
  private prevCount = 0;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'kart-hud hidden';
    this.count = document.createElement('div');
    this.count.className = 'kart-count hidden';
    document.body.append(this.root, this.count);
  }

  update(s: KartHudState, now: number) {
    if (!s.driving) {
      if (this.shown) {
        this.shown = false;
        document.body.classList.remove('kart-driving');
        this.root.classList.add('hidden');
        this.count.classList.add('hidden');
      }
      return;
    }
    if (!this.shown) {
      this.shown = true;
      document.body.classList.add('kart-driving');
      this.root.classList.remove('hidden');
    }
    // 倒计时：3、2、1、GO!
    if (s.countdown > 0) {
      this.count.classList.remove('hidden');
      this.count.textContent = String(Math.ceil(s.countdown));
      this.prevCount = s.countdown;
    } else if (this.prevCount > 0) {
      this.prevCount = 0;
      this.goUntil = now + 800;
      this.count.textContent = 'GO!';
    } else if (now > this.goUntil) this.count.classList.add('hidden');

    if (now - this.last < 100) return;
    this.last = now;
    const t = i18n.t.bind(i18n);
    const lap = s.timing ? t('kart.lap', { n: s.lap }) : t('kart.warmup');
    this.root.innerHTML = `
      <div class="kh-row"><span class="kh-lap">${lap}</span><span class="kh-speed">${Math.round(s.kmh)}<small> km/h</small></span></div>
      <div class="kh-times">
        <span><small>${t('kart.current')}</small>${s.timing ? fmtLap(s.current) : '--:--.--'}</span>
        <span><small>${t('kart.last')}</small>${fmtLap(s.last)}</span>
        <span class="kh-best"><small>${t('kart.best')}</small>${fmtLap(s.best)}</span>
      </div>
      <div class="kh-help">${t('kart.help')}</div>`;
  }
}
