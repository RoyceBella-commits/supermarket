import type { I18nText } from '../data/layoutTypes.ts';
import { i18n } from './i18n.ts';

export interface DialogueView {
  name: I18nText;
  shopName: string;
  zh: string;
  en: string;
  index: number;
  total: number;
}

/**
 * 屏幕下方的对话框：店员称呼 + 台词（中文界面显示中文，英文界面显示英文翻译）。
 * 语音始终是中文。按 E 下一句，走开自动关闭。
 */
export class DialogueBox {
  private readonly root: HTMLDivElement;
  private view: DialogueView | null = null;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'dialogue-box hidden';
    document.body.appendChild(this.root);
    i18n.onChange(() => this.render());
  }

  get isOpen() {
    return this.view !== null;
  }

  show(view: DialogueView) {
    this.view = view;
    this.root.classList.remove('hidden');
    // 重新触发出现动画
    this.root.classList.remove('pop');
    void this.root.offsetWidth;
    this.root.classList.add('pop');
    this.render();
  }

  hide() {
    this.view = null;
    this.root.classList.add('hidden');
  }

  private render() {
    const v = this.view;
    if (!v) return;
    const text = i18n.lang === 'en' ? v.en : v.zh;
    this.root.innerHTML = `
      <div class="db-head"><b>${escapeHtml(i18n.pick(v.name))}</b><span>${escapeHtml(v.shopName)}</span></div>
      <div class="db-text">${escapeHtml(text)}</div>
      <div class="db-foot"><span>${v.index + 1} / ${v.total}</span><span><span class="kbd">E</span> ${i18n.t('npc.next')}</span></div>`;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
