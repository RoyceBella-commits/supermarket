/** 屏幕下方的短提示，几秒后自动消失。 */
export class Toast {
  private readonly root: HTMLDivElement;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'toasts';
    document.body.appendChild(this.root);
  }

  show(message: string, opts: { error?: boolean; ms?: number } = {}) {
    const el = document.createElement('div');
    el.className = `toast${opts.error ? ' error' : ''}`;
    el.textContent = message;
    this.root.appendChild(el);
    // 最多同时显示 4 条
    while (this.root.children.length > 4) this.root.firstElementChild?.remove();
    setTimeout(() => el.remove(), opts.ms ?? (opts.error ? 6000 : 3200));
  }
}

export const toast = new Toast();
