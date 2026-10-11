import type { Kit } from '../kit.ts';
import { PASTEL, TOYS, doorMid, floorFinish, place, retailRules, stoolRow, type Template } from './common.ts';

// 娱乐类（docs/interior-references.md 第 12、13、18 节）。
// 房间类（KTV、密室）默认关门，不生成房间内部；走廊偏暗，靠灯带。

const wallL = (k: Kit) => k.f.walls.left + 0.05;
const wallR = (k: Kit) => k.W - k.f.walls.right - 0.05;
const wallB = (k: Kit) => k.D - k.f.walls.back - 0.05;

/** 夹娃娃机：控制台 + 透明箱 + 顶上灯牌，箱里堆毛绒；face 是正面朝向（局部 u/v 方向） */
function crane(k: Kit, u: number, v: number, du: number, dv: number, color: string) {
  const w = 0.9;
  const hw = w / 2;
  k.box(u - hw, v - hw, u + hw, v + hw, 0, 0.85, 'prop', color);
  k.box(u - hw, v - hw, u + hw, v + hw, 0.85, 1.75, 'glass');
  k.box(u - hw, v - hw, u + hw, v + hw, 1.75, 1.85, 'prop', color);
  // 灯牌（正面上方）
  const fu = u + du * (hw - 0.05);
  const fv = v + dv * (hw - 0.05);
  if (du !== 0) k.box(fu - 0.05, v - hw, fu + 0.05, v + hw, 1.85, 2.15, 'prop', '#ffd60a');
  else k.box(u - hw, fv - 0.05, u + hw, fv + 0.05, 1.85, 2.15, 'prop', '#ffd60a');
  for (let i = 0; i < 6; i++) k.cyl(u + k.range(-0.28, 0.28), v + k.range(-0.28, 0.28), 0.86 + k.range(0, 0.2), k.range(0.1, 0.16), 0.18, k.pick(PASTEL));
  k.box(u + du * hw - 0.08, v + dv * hw - 0.08, u + du * hw + 0.08, v + dv * hw + 0.08, 0.85, 0.95, 'prop', '#e63946');
  k.solid(u - hw, v - hw, u + hw, v + hw, 2.15);
}

/** CoinPlanet（主力店，日式 game center + 美式兑奖）：门口两排夹娃娃机朝中轴、左翼夹娃娃机阵列、右翼大型推币机 + 音游机 + 格斗机、后墙兑奖柜台和奖品墙 */
export const arcade: Template = (k) => {
  const { W, D } = k;
  const mid = doorMid(k);
  retailRules(k);
  floorFinish(k, '#2b2340');
  // 门口：中轴两侧各一排夹娃娃机，正面朝中轴
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) crane(k, mid + s * 2.15, 1.6 + i * 1.0, -s, 0, k.pick(['#f72585', '#7209b7', '#4cc9f0', '#ffbe0b']));
  // 服务台（门内一侧）
  k.counter(mid + 3.6, 1.4, mid + 5.6, 2.0, { color: '#7209b7' });
  // 左翼：夹娃娃机阵列，背靠背双排，列间通道 1.8
  for (let c = 4.0; c < mid - 6; c += 3.6) {
    for (let v = 1.8; v < 7.4; v += 1.0) {
      crane(k, c - 0.46, v, -1, 0, k.pick(['#f72585', '#4cc9f0', '#ffbe0b']));
      crane(k, c + 0.46, v, 1, 0, k.pick(['#f72585', '#4cc9f0', '#ffbe0b']));
    }
    for (let v = 11.4; v < D - 2.4; v += 1.0) {
      crane(k, c - 0.46, v, -1, 0, k.pick(['#7209b7', '#3a0ca3', '#f72585']));
      crane(k, c + 0.46, v, 1, 0, k.pick(['#7209b7', '#3a0ca3', '#f72585']));
    }
  }
  // 右翼：大型推币机（外圈座位 + 中央闪灯塔）
  const pu = W - 9;
  const pv = 4.6;
  k.cyl(pu, pv, 0, 2.0, 1.0, '#4cc9f0');
  k.cyl(pu, pv, 1.0, 1.7, 0.08, '#ffd60a');
  k.cyl(pu, pv, 1.08, 0.6, 1.2, '#7209b7');
  k.cyl(pu, pv, 2.28, 0.8, 0.3, '#f72585');
  k.solid(pu - 2.0, pv - 2.0, pu + 2.0, pv + 2.0, 2.6);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const su = pu + Math.cos(a) * 2.45;
    const sv = pv + Math.sin(a) * 2.45;
    if (k.fits(su - 0.18, sv - 0.18, su + 0.18, sv + 0.18)) k.stool(su, sv, Math.abs(Math.cos(a)) > 0.7 ? -Math.sign(Math.cos(a)) : 0, Math.abs(Math.cos(a)) > 0.7 ? 0 : -Math.sign(Math.sin(a)), '#3a0ca3');
  }
  // 小推币机一排（每台两张凳）
  for (let u = mid + 6; u < W - 13; u += 1.4) {
    k.box(u - 0.6, 6.4, u + 0.6, 7.4, 0, 1.8, 'prop', '#3a0ca3');
    k.box(u - 0.5, 6.38, u + 0.5, 6.4, 1.0, 1.6, 'glass');
    k.solid(u - 0.6, 6.4, u + 0.6, 7.4, 1.8);
    k.stool(u - 0.3, 5.9, 0, 1, '#f72585');
    k.stool(u + 0.3, 5.9, 0, 1, '#f72585');
  }
  // 音游机：太鼓式（两个大鼓）沿右墙
  for (let v = 11.6; v < D - 2.0; v += 1.6) {
    const u = wallR(k) - 0.5;
    k.box(u - 0.5, v - 0.5, u + 0.5, v + 0.5, 0, 2.2, 'prop', '#ffbe0b');
    k.box(u - 0.52, v - 0.4, u - 0.5, v + 0.4, 1.2, 1.9, 'prop', '#4cc9f0');
    for (const dv of [-0.25, 0.25]) k.cyl(u - 0.85, v + dv, 0.55, 0.28, 0.3, '#e63946');
    k.solid(u - 1.15, v - 0.6, u + 0.5, v + 0.6, 2.2);
  }
  // 格斗机：背对背成排，带凳
  for (let u = mid + 6; u < W - 6; u += 0.9) {
    for (const s of [-1, 1]) {
      const v = 12.6 + s * 0.45;
      k.box(u - 0.4, v - 0.45, u + 0.4, v + 0.45, 0, 1.6, 'prop', '#1b263b');
      k.box(u - 0.32, v + s * 0.46 - 0.01, u + 0.32, v + s * 0.46, 0.95, 1.45, 'prop', k.pick(['#4cc9f0', '#f72585', '#ffd60a']));
      k.stool(u, v + s * 0.95, 0, -s, '#2b2d42');
    }
  }
  k.solid(mid + 5.55, 11.7, W - 6.05, 13.5, 1.6);
  // 后墙中段：兑奖柜台（玻璃柜）+ 背后奖品墙（挂满毛绒）
  const wb = wallB(k);
  for (let i = 0; i < 3; i++) {
    const u0 = mid - 2.25 + i * 1.5;
    k.box(u0, wb - 2.4, u0 + 1.5, wb - 1.8, 0, 0.9, 'prop', '#7209b7');
    k.box(u0, wb - 2.4, u0 + 1.5, wb - 1.8, 0.9, 1.0, 'glass');
  }
  k.solid(mid - 2.25, wb - 2.4, mid + 2.25, wb - 1.8, 1.0);
  k.shelf('u', mid - 4.0, mid + 4.0, wb, -1, { palette: PASTEL, height: 2.6, levels: 4, depth: 0.45, item: { w: [0.3, 0.45], h: [0.3, 0.45] } });
  k.staff(mid, wb - 1.2, 0, -1);
  // 换币机：每 10–15 m 一台
  for (const u of [mid - 8, mid + 8]) {
    k.box(u - 0.25, 7.7, u + 0.25, 8.1, 0, 1.7, 'prop', '#ffd60a');
    k.solid(u - 0.25, 7.7, u + 0.25, 8.1, 1.7);
  }
  k.bench('u', mid + 6.2, mid + 8.2, 1.0, 0, 1, { color: '#3a0ca3' });
  k.staffDoor(wallL(k) + 0.85);
  k.backFeature = true;
};

/** BlinkVR：深色空间、大堂（蓝色灯带接待台 + 签到平板、头显陈列墙、方墩等候、储物柜）、门面万向跑步机、自由行走房（黑色软包）、单人体验格 + 门外屏幕 */
export const vr: Template = (k) => {
  const { D } = k;
  const mid = doorMid(k);
  retailRules(k, { main: 4.5 });
  floorFinish(k, '#1b1f3b');
  const wl = wallL(k);
  const wr = wallR(k);
  const wb = wallB(k);
  // 接待柜台（右）：深色 + 底部蓝色灯带；旁边储物柜
  k.counter(wr - 4.2, 2.6, wr - 1.2, 3.3, { color: '#14213d', top: '#2b2d42' });
  k.box(wr - 4.22, 2.58, wr - 1.18, 3.32, 0.02, 0.08, 'prop', '#00e5ff');
  k.staff(wr - 2.7, 3.9, 0, -1);
  k.box(wr - 0.45, 1.0, wr, 2.4, 0, 1.8, 'locker');
  k.solid(wr - 0.45, 1.0, wr, 2.4, 1.8);
  // 头显陈列（左墙）+ 海报灯箱
  k.shelf('v', 1.2, 4.6, wl, 1, { palette: ['#e5e5e5', '#2b2d42', '#00b4d8'], height: 2.0, levels: 4, depth: 0.35, color: '#14213d', item: { w: [0.2, 0.2], h: [0.12, 0.14] } });
  // 方墩等候
  for (let i = 0; i < 4; i++) {
    const u = mid - 4.5 + (i % 2) * 1.1;
    const v = 2.2 + Math.floor(i / 2) * 1.1;
    k.box(u - 0.22, v - 0.22, u + 0.22, v + 0.22, 0, 0.45, 'prop', '#00b4d8');
    k.solid(u - 0.22, v - 0.22, u + 0.22, v + 0.22, 0.45);
    k.addSeat(u, v, 0.45, 1, 0);
  }
  // 门面万向跑步机（招客）
  const ou = mid + 3.6;
  const ov = 2.0;
  k.cyl(ou, ov, 0, 1.0, 0.3, '#2b2d42');
  k.cyl(ou, ov, 1.05, 0.75, 0.06, '#00e5ff');
  for (const [du, dv] of [
    [0.7, 0],
    [-0.7, 0],
    [0, 0.7],
  ])
    k.box(ou + du - 0.03, ov + dv - 0.03, ou + du + 0.03, ov + dv + 0.03, 0.3, 1.1, 'metal');
  k.solid(ou - 1.0, ov - 1.0, ou + 1.0, ov + 1.0, 1.1);
  // 自由行走房（左半）：黑色软包墙，开一扇观察窗
  const ru0 = wl + 0.4;
  const ru1 = Math.min(ru0 + 7.0, mid - 1.0);
  const rv0 = 5.2;
  const rv1 = wb;
  k.box(ru0, rv0, ru1, rv0 + 0.15, 0, 3.0, 'prop', '#0b0c10');
  k.box(ru1 - 0.15, rv0, ru1, rv1, 0, 3.0, 'prop', '#0b0c10');
  k.box(ru0 + 1.5, rv0 - 0.01, ru0 + 3.5, rv0, 1.2, 2.0, 'glass');
  k.solid(ru0, rv0, ru1 - 0.16, rv0 + 0.15, 3.0);
  k.solid(ru1 - 0.15, rv0, ru1, rv1, 3.0);
  k.screen('u', ru0 + 4.2, ru0 + 6.0, rv0 - 0.02, -1, 1.6, 2.6, '#00b4d8');
  // 单人体验格（右半一排）：软垫地面、三面半墙、上方收线器、格前屏幕
  for (let i = 0; i < 4; i++) {
    const u0 = mid + 0.8 + i * 3.1;
    if (u0 + 3.0 > wr - 0.2) break;
    const v0 = wb - 3.2;
    k.box(u0, v0, u0 + 3.0, wb, 0, 0.05, 'prop', '#023e8a');
    k.box(u0, v0, u0 + 0.05, wb, 0, 1.1, 'prop', '#48cae4');
    k.box(u0 + 2.95, v0, u0 + 3.0, wb, 0, 1.1, 'prop', '#48cae4');
    k.solid(u0, v0, u0 + 0.06, wb, 1.1);
    k.solid(u0 + 2.94, v0, u0 + 3.0, wb, 1.1);
    k.box(u0 + 1.4, wb - 1.7, u0 + 1.6, wb - 1.5, 2.6, 2.75, 'prop', '#2b2d42');
    k.box(u0 + 1.49, wb - 1.61, u0 + 1.51, wb - 1.59, 1.6, 2.6, 'prop', '#2b2d42');
    k.screen('u', u0 + 1.05, u0 + 1.95, v0 - 0.3, -1, 1.5, 2.0, k.pick(['#00b4d8', '#90e0ef', '#48cae4']));
  }
  k.staffDoor(wr - 0.85);
  k.backFeature = true;
  void D;
};

/** Echo Box（KTV）：前区接待柜台（麦克风篮）+ 饮料吧 + 等候长凳 + 服装架、中轴走廊两侧一排带竖窗小门的房间、后墙派对房、走廊灯带 */
export const karaoke: Template = (k) => {
  const { W, D } = k;
  const mid = doorMid(k);
  retailRules(k, { main: 5 });
  const wl = wallL(k);
  const wr = wallR(k);
  const wb = wallB(k);
  floorFinish(k, '#240046', wl, 5.0, wr, wb);
  // 前区：接待柜台 + 麦克风篮、饮料吧、等候长凳和服装租借架
  k.counter(mid + 1.8, 2.6, mid + 5.8, 3.3, { color: '#3c096c' });
  for (const du of [2.4, 3.2]) k.box(mid + du, 2.8, mid + du + 0.3, 3.0, 1.0, 1.1, 'prop', '#e0aaff');
  k.staff(mid + 3.8, 3.9, 0, -1);
  k.counter(wr - 2.2, 1.0, wr, 1.6, { color: '#5a189a', register: false });
  for (let i = 0; i < 5; i++) k.box(wr - 2.0 + i * 0.35, 1.25, wr - 1.8 + i * 0.35, 1.45, 1.0, 1.5, 'prop', '#e9ecef');
  k.bench('u', mid - 6.0, mid - 3.0, 3.4, 0, -1, { color: '#7b2cbf' });
  k.rack('v', 1.6, 4.4, wl + 0.6, { palette: ['#ff006e', '#ffbe0b', '#3a86ff', '#ffffff'] });
  // 房间：中轴走廊 1.6 宽两侧各一排 3.0 宽的小间，后墙一间派对房
  const roomV0 = 5.4;
  const partyV0 = wb - 5.0;
  const corridorU0 = mid - 0.8;
  const corridorU1 = mid + 0.8;
  for (const [a0, a1, face] of [
    [wl, corridorU0, 1],
    [corridorU1, wr, -1],
  ] as const) {
    // 房间排在走廊两侧：走廊沿 v，从 roomV0 到派对房
    for (let v = roomV0; v + 3.4 <= partyV0 + 0.01; v += 3.5) {
      const wallU = face > 0 ? a1 : a0;
      // 走廊侧墙 + 门 + 竖窗 + 发光房号牌
      k.box(Math.min(wallU, wallU - face * 0.12), v, Math.max(wallU, wallU - face * 0.12), v + 3.5, 0, 3.0, 'prop', '#3c096c');
      const du = wallU + face * 0.01;
      k.box(Math.min(du, wallU), v + 1.2, Math.max(du, wallU) + 0.005, v + 2.1, 0.02, 2.1, 'prop', '#5a189a');
      k.box(Math.min(du, wallU) - 0.002, v + 1.3, Math.max(du, wallU) + 0.008, v + 1.45, 1.0, 1.8, 'glass');
      k.box(Math.min(du, wallU) - 0.003, v + 2.2, Math.max(du, wallU) + 0.009, v + 2.5, 2.2, 2.45, 'prop', '#e0aaff');
      // 房间之间的隔墙
      k.box(Math.min(a0, a1), v + 3.44, Math.max(a0, a1), v + 3.5, 0, 3.0, 'prop', '#3c096c');
    }
    k.solid(Math.min(a0, a1), roomV0, Math.max(a0, a1), partyV0, 3.0);
    // 墙脚灯带
    const stripU = face > 0 ? a1 - 0.12 : a0 + 0.12;
    k.box(stripU - 0.02, roomV0, stripU + 0.02, partyV0, 0.02, 0.06, 'prop', face > 0 ? '#ff006e' : '#3a86ff');
  }
  k.box(wl, roomV0 - 0.1, corridorU0, roomV0, 0, 3.0, 'prop', '#3c096c');
  k.box(corridorU1, roomV0 - 0.1, wr, roomV0, 0, 3.0, 'prop', '#3c096c');
  // 派对房（后墙）：门在走廊尽头
  k.box(wl, partyV0, corridorU0 - 0.2, partyV0 + 0.12, 0, 3.0, 'prop', '#5a189a');
  k.box(corridorU1 + 0.2, partyV0, wr, partyV0 + 0.12, 0, 3.0, 'prop', '#5a189a');
  k.box(corridorU0 - 0.2, partyV0, corridorU1 + 0.2, partyV0 + 0.12, 2.2, 3.0, 'prop', '#5a189a');
  k.box(corridorU0 - 0.15, partyV0 - 0.01, corridorU1 + 0.15, partyV0, 0.02, 2.15, 'prop', '#7b2cbf');
  k.solid(wl, partyV0, wr, wb, 3.0);
  k.backFeature = true;
  void D, void W;
};

/** Puzzle Vault（密室）：门口巨大圆形保险库门（常开）、接待、储物柜墙、复古沙发、简报屏、合影墙；后部 4 间门各不相同的密室 + 主持人控制室 */
export const escapeRoom: Template = (k) => {
  const { W, D } = k;
  const mid = doorMid(k);
  const door = k.f.door;
  retailRules(k, { main: 5 });
  const wl = wallL(k);
  const wr = wallR(k);
  const wb = wallB(k);
  // 圆形保险库门：开着，靠在门洞一侧
  const vu = door.u0 - 0.4;
  k.cyl(vu, 1.0, 1.2, 1.2, 0.3, '#adb5bd', 'v');
  k.cyl(vu, 0.82, 1.2, 0.35, 0.08, '#6c757d', 'v');
  for (const a of [0, Math.PI / 2]) k.box(vu - 0.4 * Math.cos(a) - 0.03, 0.75, vu + 0.4 * Math.cos(a) + 0.03, 0.8, 1.2 - 0.4 * Math.sin(a) - 0.03, 1.2 + 0.4 * Math.sin(a) + 0.03, 'metal');
  k.solid(vu - 1.2, 0.85, vu + 1.2, 1.15, 2.4);
  // 前区大堂
  k.counter(mid + 2.0, 3.2, mid + 5.0, 3.9, { color: '#2f3e46' });
  k.staff(mid + 3.5, 4.5, 0, -1);
  k.box(wr - 0.45, 1.2, wr, 4.8, 0, 1.6, 'locker');
  k.solid(wr - 0.45, 1.2, wr, 4.8, 1.6);
  k.sofa('u', mid - 6.0, mid - 3.6, 4.4, 0, -1, '#6b2737');
  k.sofa('v', 2.0, 3.8, wl, 1, 0, '#6b2737');
  k.screen('u', mid - 5.6, mid - 4.0, 0.25, 1, 1.6, 2.5, '#52796f');
  k.panel('v', 1.6, 3.6, wr - 0.46, -1, 0.6, 2.2, '#cad2c5');
  // 后部：4 间密室（门的样式各不相同）+ 中间的控制室
  const rv0 = 6.4;
  k.box(wl, rv0 - 0.15, wr, rv0, 0, 3.0, 'prop', '#354f52');
  k.solid(wl, rv0 - 0.15, wr, wb, 3.0);
  const doors = ['#adb5bd', '#8d6346', '#e9f5db', '#6b4f3a'];
  const slots = [0.12, 0.3, 0.7, 0.88].map((t) => wl + (wr - wl) * t);
  slots.forEach((u, i) => {
    k.box(u - 0.55, rv0 - 0.17, u + 0.55, rv0 - 0.15, 0, 2.2, 'prop', doors[i]);
    k.box(u - 0.65, rv0 - 0.18, u + 0.65, rv0 - 0.16, 2.2, 2.35, 'prop', '#cad2c5');
    k.box(u - 0.3, rv0 - 0.19, u + 0.3, rv0 - 0.17, 2.45, 2.75, 'prop', '#e63946');
  });
  k.box(W / 2 - 0.9, rv0 - 0.17, W / 2 + 0.9, rv0 - 0.15, 1.2, 2.0, 'glass');
  k.backFeature = true;
  void D;
};

/** SnapStar（大头贴）：两侧墙大头贴机（入口布帘灯箱 + 外侧涂鸦台）、化妆台（灯泡镜 + 凳）、蛋糕座椅拍照点、换币机、剪贴纸台、门边服装架 */
export const photoBooth: Template = (k) => {
  const { W, D } = k;
  const mid = doorMid(k);
  retailRules(k);
  floorFinish(k, '#ffe5ec');
  const wl = wallL(k);
  const wr = wallR(k);
  const wb = wallB(k);
  // 大头贴机：拍摄间 2.0 宽 × 2.2 深 × 2.3 高，布帘面朝店中间，外侧一个涂鸦台
  const booth = (u0: number, v0: number, face: 1 | -1) => {
    const u1 = u0 + face * 2.2;
    const [a, b] = [Math.min(u0, u1), Math.max(u0, u1)];
    k.box(a, v0, b, v0 + 2.0, 0, 2.3, 'prop', k.pick(['#ff006e', '#8338ec', '#fb5607']));
    const cu = u1 + face * 0.01;
    k.box(Math.min(cu, u1), v0 + 0.3, Math.max(cu, u1) + 0.005, v0 + 1.7, 0.4, 2.1, 'prop', '#ffe5ec');
    k.box(Math.min(cu, u1) - 0.002, v0 + 0.6, Math.max(cu, u1) + 0.008, v0 + 1.4, 1.1, 1.9, 'prop', '#ffc8dd');
    k.solid(a, v0, b, v0 + 2.0, 2.3);
    // 涂鸦台
    const dv = v0 + 2.4;
    k.box(a + 0.6, dv, b - 0.6, dv + 0.5, 0, 1.0, 'prop', '#ffffff');
    k.box(a + 0.7, dv + 0.1, b - 0.7, dv + 0.4, 1.0, 1.3, 'prop', '#2b2d42');
    k.solid(a + 0.6, dv, b - 0.6, dv + 0.5, 1.3);
  };
  booth(wl, 4.0, 1);
  booth(wl, 8.0, 1);
  booth(wr, 4.0, -1);
  booth(wr, 8.0, -1);
  // 化妆台（后墙）：长台 + 4 面灯泡镜 + 凳
  k.box(mid - 1.5, wb - 0.5, mid + 1.5, wb, 0, 0.8, 'prop', '#ffffff');
  k.solid(mid - 1.5, wb - 0.5, mid + 1.5, wb, 0.8);
  for (let i = 0; i < 4; i++) {
    const u = mid - 1.125 + i * 0.75;
    k.panel('u', u - 0.25, u + 0.25, wb, -1, 1.0, 1.7, '#fff3e0');
    for (let j = 0; j < 3; j++) k.cyl(u - 0.2 + j * 0.2, wb - 0.04, 1.72, 0.035, 0.05, '#fff3b0');
    k.stool(u, wb - 0.95, 0, 1, '#ff006e');
  }
  k.backFeature = true;
  // 蛋糕座椅：两层圆台，上面摆装饰，四周能坐
  const cu = mid;
  const cv = 12.2;
  place(k, cu, cv, 2.0, 2.0, () => {
    k.cyl(cu, cv, 0, 1.0, 0.45, '#ffc8dd');
    k.cyl(cu, cv, 0.45, 0.6, 0.6, '#ffffff');
    k.cyl(cu, cv, 1.05, 0.15, 0.25, '#e63946');
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      k.cyl(cu + Math.cos(a) * 0.52, cv + Math.sin(a) * 0.52, 1.05, 0.06, 0.1, k.pick(PASTEL));
    }
    k.solid(cu - 1.0, cv - 1.0, cu + 1.0, cv + 1.0, 1.05);
    k.addSeat(cu, cv - 0.75, 0.45, 0, -1);
    k.addSeat(cu - 0.75, cv, 0.45, -1, 0);
    k.addSeat(cu + 0.75, cv, 0.45, 1, 0);
  });
  // 换币机、剪贴纸台、门边服装架
  k.box(mid + 2.4, 6.0, mid + 2.9, 6.45, 0, 1.6, 'prop', '#ffd60a');
  k.solid(mid + 2.4, 6.0, mid + 2.9, 6.45, 1.6);
  place(k, mid - 2.4, 6.6, 1.2, 0.6, () => k.displayTable(mid - 2.4, 6.6, 1.2, 0.6, { palette: PASTEL, h: 0.9 }), 0.2);
  k.rack('v', 1.4, 3.4, wr - 0.5, { palette: ['#ffafcc', '#cdb4db', '#bde0fe', '#ffffff'] });
  k.staffDoor(wl + 0.85);
  void W, void D;
};

/** Playnest（儿童乐园）：前区接待 + 1 m 小门 + 鞋柜墙、家长储物柜和洗手台、后墙软体攀爬架 + 滑梯、球池、婴幼儿区（软墙 + 小房子）、四周家长沙发 */
export const playground: Template = (k) => {
  const { W, D } = k;
  const mid = doorMid(k);
  retailRules(k, { main: 4 });
  const wl = wallL(k);
  const wr = wallR(k);
  const wb = wallB(k);
  floorFinish(k, '#caf0f8', wl, 4.2, wr, wb);
  // 前区：接待柜台 + 小门（软围栏一排，中间留小门）
  k.counter(mid + 2.0, 1.6, mid + 4.4, 2.2, { color: '#4cc9f0' });
  k.staff(mid + 3.2, 2.8, 0, -1);
  for (const [a, b] of [
    [wl, mid - 0.6],
    [mid + 0.6, wr],
  ]) {
    k.box(a, 4.0, b, 4.15, 0, 1.0, 'prop', '#f72585');
    k.solid(a, 4.0, b, 4.15, 1.0);
  }
  // 鞋柜格子墙、家长储物柜和洗手台
  k.box(wl, 1.0, wl + 0.35, 3.6, 0, 1.8, 'prop', '#ffbe0b');
  for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) if (k.rng() < 0.6) k.product(wl + 0.2, 1.15 + c * 0.31, 0.1 + r * 0.29, 0.1, 0.07, 0.16, false, k.pick(TOYS));
  k.solid(wl, 1.0, wl + 0.35, 3.6, 1.8);
  k.box(wr - 0.45, 0.6, wr, 1.8, 0, 1.8, 'locker');
  k.box(wr - 0.6, 2.2, wr, 3.0, 0, 0.8, 'prop', '#e9ecef');
  k.solid(wr - 0.6, 0.6, wr, 3.0, 1.8);
  // 后墙正中：软体攀爬架（平台 + 网格 + 管道）+ 滑梯
  const cu = W / 2;
  const fu0 = cu - 4.0;
  const fu1 = cu + 4.0;
  const fv0 = wb - 5.0;
  for (const [h, col] of [
    [1.0, '#f72585'],
    [2.0, '#4cc9f0'],
    [3.0, '#ffbe0b'],
  ] as const) k.box(fu0, fv0, fu1, wb, h - 0.12, h, 'prop', col);
  for (let u = fu0; u <= fu1 + 0.01; u += 1.6) {
    k.box(u - 0.06, fv0 - 0.06, u + 0.06, fv0 + 0.06, 0, 3.5, 'prop', '#7209b7');
    k.box(u - 0.06, wb - 0.12, u + 0.06, wb, 0, 3.5, 'prop', '#7209b7');
  }
  k.box(fu0, fv0 - 0.02, fu1, fv0, 0.2, 3.0, 'glass');
  k.cyl(cu + 1.0, fv0 + 1.0, 2.3, 0.35, 2.0, '#06d6a0', 'u');
  // 滑梯：从 2 m 高往前滑（台阶模拟坡面）
  for (let i = 0; i < 6; i++) k.box(cu - 3.2, fv0 - 0.4 - i * 0.4, cu - 2.6, fv0 - i * 0.4, 0, 2.0 - i * 0.33, 'prop', '#ffbe0b');
  k.solid(fu0, fv0, fu1, wb, 3.5);
  k.solid(cu - 3.2, fv0 - 2.4, cu - 2.6, fv0, 2.0);
  k.backFeature = true;
  // 左侧球池：0.5 高软边，里面彩色球
  const bu0 = wl + 1.0;
  const bv0 = 6.0;
  k.box(bu0, bv0, bu0 + 5.0, bv0 + 4.0, 0, 0.5, 'prop', '#3a86ff');
  for (let i = 0; i < 120; i++) k.cyl(bu0 + k.range(0.2, 4.8), bv0 + k.range(0.2, 3.8), 0.4 + k.range(0, 0.12), 0.07, 0.1, k.pick(TOYS));
  k.solid(bu0, bv0, bu0 + 5.0, bv0 + 4.0, 0.5);
  // 右侧婴幼儿区：0.6 软墙围起来，里面几座彩色小房子
  const tu0 = wr - 6.0;
  const tv0 = 6.0;
  k.box(tu0, tv0, wr - 0.3, tv0 + 0.12, 0, 0.6, 'prop', '#ffafcc');
  k.box(tu0, tv0, tu0 + 0.12, tv0 + 5.0, 0, 0.6, 'prop', '#ffafcc');
  k.solid(tu0 + 0.13, tv0, wr - 0.3, tv0 + 0.12, 0.6);
  k.solid(tu0, tv0, tu0 + 0.12, tv0 + 5.0, 0.6);
  for (let i = 0; i < 3; i++) {
    const u = tu0 + 1.2 + i * 1.7;
    const v = tv0 + 2.6;
    const col = k.pick(['#ffd166', '#06d6a0', '#ef476f']);
    k.box(u - 0.6, v - 0.6, u + 0.6, v + 0.6, 0, 1.3, 'prop', col);
    k.box(u - 0.7, v - 0.7, u + 0.7, v + 0.7, 1.3, 1.5, 'prop', '#ffffff');
    k.box(u - 0.4, v - 0.4, u + 0.4, v + 0.4, 1.5, 1.8, 'prop', '#ffffff');
    k.box(u - 0.2, v - 0.62, u + 0.2, v - 0.6, 0, 0.9, 'prop', '#2b2d42');
    k.solid(u - 0.7, v - 0.7, u + 0.7, v + 0.7, 1.8);
  }
  // 家长沙发：沿两侧墙，看得到全场
  k.sofa('v', 11.0, 14.0, wl, 1, 0, '#4cc9f0');
  k.sofa('v', 12.0, 15.0, wr, -1, 0, '#4cc9f0');
  stoolRow(k, 'u', mid - 5.2, mid - 3.4, 3.2, 0, -1, 0.6, '#ffbe0b');
  void D;
};

