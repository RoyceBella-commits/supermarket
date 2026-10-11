import { floorByLevel, type MallLayout } from '../data/layoutTypes.ts';
import type { ZoneInfo } from '../world/ZoneIndex.ts';
import { i18n } from './i18n.ts';

/** 左上角：楼层 + 主题、所在店铺或区域；右上角：正在播放的音乐。只在内容变化时改 DOM。 */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly floorLabel: HTMLSpanElement;
  private readonly floorTheme: HTMLSpanElement;
  private readonly zoneCard: HTMLDivElement;
  private readonly music: HTMLDivElement;
  private readonly crosshair: HTMLDivElement;
  private readonly prompt: HTMLDivElement;
  private readonly clock: HTMLDivElement;
  private clockText = '';
  private promptText = '';
  private zone: ZoneInfo | null = null;
  private musicTitle = '';

  constructor(private readonly layout: MallLayout) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-card hud-floor"><span class="hud-floor-label"></span><span class="hud-floor-theme"></span></div>
      <div class="hud-card hud-zone"></div>
      <div class="hud-card hud-clock"></div>`;
    this.floorLabel = this.root.querySelector('.hud-floor-label')!;
    this.floorTheme = this.root.querySelector('.hud-floor-theme')!;
    this.zoneCard = this.root.querySelector('.hud-zone')!;
    this.clock = this.root.querySelector('.hud-clock')!;
    this.music = document.createElement('div');
    this.music.className = 'hud-card hud-music';
    this.crosshair = document.createElement('div');
    this.crosshair.className = 'crosshair';
    this.prompt = document.createElement('div');
    this.prompt.className = 'hud-prompt hidden';
    document.body.append(this.root, this.music, this.crosshair, this.prompt);
    i18n.onChange(() => {
      this.renderZone(false);
      this.renderMusic();
    });
    this.renderMusic();
  }

  setVisible(v: boolean) {
    this.root.style.display = v ? '' : 'none';
    this.music.style.display = v ? '' : 'none';
    this.crosshair.style.display = v ? '' : 'none';
    this.prompt.style.display = v ? '' : 'none';
  }

  /** 游戏内时间（只在分钟变化时改 DOM）；night 时显示月亮 */
  setClock(text: string, night: boolean) {
    const t = `${night ? '☾' : '☀'} ${text}`;
    if (t === this.clockText) return;
    this.clockText = t;
    this.clock.textContent = t;
  }

  /** 底部的“按 E …”提示；null 隐藏 */
  setPrompt(text: string | null) {
    const t = text ?? '';
    if (t === this.promptText) return;
    this.promptText = t;
    this.prompt.classList.toggle('hidden', !t);
    this.prompt.innerHTML = '';
    if (!t) return;
    const k = document.createElement('span');
    k.className = 'kbd';
    k.textContent = 'E';
    this.prompt.append(k, document.createTextNode(t));
  }

  setCrosshair(v: boolean) {
    this.crosshair.style.display = v ? '' : 'none';
  }

  setZone(zone: ZoneInfo) {
    if (this.zone && this.zone.key === zone.key) return;
    const animate = this.zone !== null;
    this.zone = zone;
    this.renderZone(animate);
  }

  setMusic(title: string) {
    if (title === this.musicTitle) return;
    this.musicTitle = title;
    this.renderMusic();
  }

  private renderZone(animate: boolean) {
    const z = this.zone;
    if (!z) return;
    const floor = floorByLevel(this.layout, z.floor);
    this.floorLabel.textContent = floor.label;
    this.floorTheme.textContent = i18n.pick(floor.theme);

    let name = '';
    let sub = '';
    let swatch = '';
    if (z.kind === 'shop' && z.shopName && z.category) {
      const shop = this.layout.shops.find((s) => s.id === z.id);
      name = z.shopName;
      sub = i18n.category(z.category);
      if (shop) swatch = shop.theme.primary;
    } else if (z.label) {
      name = i18n.pick(z.label);
    } else {
      name = i18n.t(z.kind === 'outside' ? 'zone.outside' : 'zone.corridor');
    }
    const apply = () => {
      this.zoneCard.innerHTML = '';
      const n = document.createElement('div');
      n.className = 'hud-zone-name';
      if (swatch) {
        const s = document.createElement('span');
        s.className = 'hud-swatch';
        s.style.background = swatch;
        n.appendChild(s);
      }
      n.appendChild(document.createTextNode(name));
      this.zoneCard.appendChild(n);
      if (sub) {
        const s = document.createElement('div');
        s.className = 'hud-zone-sub';
        s.textContent = sub;
        this.zoneCard.appendChild(s);
      }
      this.zoneCard.classList.remove('changing');
    };
    if (animate) {
      this.zoneCard.classList.add('changing');
      setTimeout(apply, 180);
    } else {
      apply();
    }
  }

  private renderMusic() {
    const title = this.musicTitle || i18n.t('music.notPlaying');
    this.music.innerHTML = '';
    const note = document.createElement('span');
    note.className = 'note';
    note.textContent = '♪';
    const t = document.createElement('span');
    t.className = 'title';
    t.textContent = title;
    const key = document.createElement('span');
    key.className = 'key';
    key.textContent = i18n.t('hud.musicHint');
    this.music.append(note, t, key);
  }
}
