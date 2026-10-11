/** URL 调试参数：?debug ?map ?testbed ?floor=N ?shop=id ?bgmSeek=-5 */
const params = new URLSearchParams(location.search);

const num = (key: string): number | null => {
  const v = params.get(key);
  if (v === null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function parseFloor(v: string | null): number | null {
  if (!v) return null;
  const t = v.trim().toUpperCase();
  const b = /^B(\d+)$/.exec(t);
  if (b) return -Number(b[1]);
  const n = Number(t);
  if (!Number.isFinite(n) || n === 0) return null;
  return n > 0 ? n - 1 : n;
}

export const devFlags = {
  /** 碰撞线框、FPS、draw call 数 */
  debug: params.has('debug'),
  /** 当前楼层的 SVG 平面图 */
  map: params.has('map'),
  /** 只加载调手感用的测试场 */
  testbed: params.has('testbed'),
  /** 直接传送到某层：1–5 对应 1F–5F，B1 或 -1 对应地下一层。值为楼层编号（1F = 0，B1 = -1）。 */
  floor: parseFloor(params.get('floor')),
  /** 直接传送到某家店门口 */
  shop: params.get('shop'),
  /** 内置 BGM 起播位置：负数 = 循环接缝前多少秒，正数 = 从第几秒开始 */
  bgmSeek: num('bgmSeek'),
};
