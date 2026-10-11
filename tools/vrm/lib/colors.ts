// 颜色工具：输入 sRGB 十六进制，输出 glTF/MToon 需要的线性 RGB。
// 阴影色 = 稍暗、偏暖（色相往红/橙方向转）、略提饱和度，避免发灰。

export type RGB = [number, number, number];

export function hex(h: string): RGB {
  const s = h.replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function toHex(c: RGB): string {
  return '#' + c.map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0')).join('');
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function s2l(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** sRGB → 线性 */
export function linear(c: RGB): RGB {
  return [s2l(c[0]), s2l(c[1]), s2l(c[2])];
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function rgbToHsl([r, g, b]: RGB): RGB {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb([h, s, l]: RGB): RGB {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [r + m, g + m, b + m];
}

/** 色相往暖色（0°/360°）方向转 deg 度 */
function warmHue(h: number, deg: number): number {
  const towardZero = h <= 180 ? -1 : 1;
  const dist = h <= 180 ? h : 360 - h;
  return h + towardZero * Math.min(deg, dist * 0.6);
}

/** 按比例调亮度（HSL 的 L），保留色相 */
export function lighten(c: RGB, f: number): RGB {
  const [h, s, l] = rgbToHsl(c);
  return hslToRgb([h, s, clamp01(l * f)]);
}

/** MToon 阴影色：更暖、略暗、略饱和（sRGB） */
export function shadeOf(c: RGB): RGB {
  let [h, s, l] = rgbToHsl(c);
  if (s < 0.08) {
    // 白/灰：给一点暖米色
    h = 28;
    s = 0.22 + s;
  }
  h = warmHue(h, 12);
  s = clamp01(s * 1.12 + 0.04);
  l = l * (l > 0.8 ? 0.86 : 0.78);
  return hslToRgb([h, s, l]);
}

/** 描边色：同色系深色 */
export function outlineOf(c: RGB): RGB {
  let [h, s, l] = rgbToHsl(c);
  if (s < 0.08) {
    h = 25;
    s = 0.18;
  }
  h = warmHue(h, 10);
  s = clamp01(s * 1.05 + 0.05);
  l = Math.min(0.3, l * 0.38 + 0.04);
  return hslToRgb([h, s, l]);
}
