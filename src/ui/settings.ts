// 玩家设置（保存在浏览器里）。目前只有鼠标灵敏度：开始 / 暂停界面和音乐面板里都能调，两边同步。

const MOUSE_KEY = 'mall.mouseSens';
/** 灵敏度倍数的范围；1 = 原来的默认灵敏度 */
export const MOUSE_SENS = { min: 0.2, max: 2, step: 0.05, default: 1 };

const listeners = new Set<() => void>();
let mouse = readMouse();

function readMouse(): number {
  try {
    const v = Number(localStorage.getItem(MOUSE_KEY));
    if (Number.isFinite(v) && v >= MOUSE_SENS.min && v <= MOUSE_SENS.max) return v;
  } catch {
    // 隐私模式等情况下 localStorage 不可用
  }
  return MOUSE_SENS.default;
}

export const settings = {
  get mouseSensitivity(): number {
    return mouse;
  },
  setMouseSensitivity(v: number) {
    const clamped = Number(Math.min(MOUSE_SENS.max, Math.max(MOUSE_SENS.min, Math.round(v / MOUSE_SENS.step) * MOUSE_SENS.step)).toFixed(2));
    if (clamped === mouse) return;
    mouse = clamped;
    try {
      localStorage.setItem(MOUSE_KEY, String(mouse));
    } catch {
      // 存不了就只在这次有效
    }
    for (const fn of listeners) fn();
  },
  onChange(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

/** 设置里的滑块（百分比显示）：两处界面共用同一段 HTML */
export function mouseSliderHtml(label: string): string {
  const pct = Math.round(mouse * 100);
  return `<label class="mouse-sens"><span>${label}</span>
    <input type="range" min="${MOUSE_SENS.min * 100}" max="${MOUSE_SENS.max * 100}" step="${MOUSE_SENS.step * 100}" value="${pct}" data-act="mouseSens" />
    <b class="mouse-sens-value">${pct}%</b></label>`;
}

/** 绑定滑块：拖动时立刻生效并更新百分比 */
export function bindMouseSlider(root: HTMLElement) {
  const input = root.querySelector<HTMLInputElement>('input[data-act="mouseSens"]');
  if (!input) return;
  input.addEventListener('input', () => {
    settings.setMouseSensitivity(Number(input.value) / 100);
    const out = root.querySelector<HTMLElement>('.mouse-sens-value');
    if (out) out.textContent = `${Math.round(settings.mouseSensitivity * 100)}%`;
  });
}
