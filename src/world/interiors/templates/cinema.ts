import { TOYS, floorFinish, glassCase, stoolRow, type Template } from './common.ts';

// 5F Starlight Cinema（两层高，52×18）。依据 docs/interior-references.md 第 20 节：
// 大堂（左边约 33 m）：门口取票机 + 排片屏、人工售票台、后墙小卖部长柜台（爆米花机、饮料机、套餐菜单板、蛇形排队道）、
// 周边商店、等候区沙发和电影立牌、检票口（引座员朵拉）、后墙上半部巨幅主视觉、深色星点地毯、天花星点灯。
// 影厅（右翼）：阶梯座位 10 排 × 22 座（都能坐）、14 m 银幕、深色吸音墙、出口灯、后墙放映窗。

const MOVIES = ['movie-space', 'movie-detective', 'movie-dragon', 'movie-ocean', 'movie-racing', 'movie-romance'];

export const cinema: Template = (k) => {
  const { W, D } = k;
  const wl = k.f.walls.left + 0.05;
  const wb = D - k.f.walls.back - 0.05;
  const top = 11.6;
  const hallU = 33.3;
  const doorV0 = 15.6;
  const doorV1 = 17.2;
  k.backFeature = true;

  // ---- 影厅和大堂之间的隔墙（检票口那头开门）----
  const wallC = '#2b2d42';
  k.box(hallU - 0.15, wl, hallU + 0.15, doorV0, 0, top, 'prop', wallC);
  k.box(hallU - 0.15, doorV0, hallU + 0.15, doorV1, 2.6, top, 'prop', wallC);
  k.box(hallU - 0.15, doorV1, hallU + 0.15, wb, 0, top, 'prop', wallC);
  k.solid(hallU - 0.15, wl, hallU + 0.15, doorV0, top);
  k.solid(hallU - 0.15, doorV1, hallU + 0.15, wb, top);
  k.box(hallU + 0.15, doorV0 + 0.4, hallU + 0.17, doorV1 - 0.4, 2.75, 3.0, 'prop', '#06d6a0');

  // ===================== 影厅 =====================
  const hu0 = hallU + 0.15;
  const hu1 = W - k.f.walls.right - 0.05;
  floorFinish(k, '#4a1c2a', hu0, 0.25, hu1, wb);
  // 深色天花（影厅里不要看到商场的米色天花板）
  k.box(hu0, 0.2, hu1, wb, top - 0.05, top, 'prop', '#121220');
  // 深色吸音墙（两侧和后墙），竖条纹
  const panel = '#1b1b2a';
  k.box(hu0, 0.2, hu1, 0.26, 0, top, 'prop', panel);
  k.box(hu0, wb - 0.06, hu1, wb, 0, top, 'prop', panel);
  k.box(hu1 - 0.06, 0.2, hu1, wb, 0, top, 'prop', panel);
  for (let u = hu0 + 1.0; u < hu1 - 0.5; u += 1.6) {
    k.box(u, 0.26, u + 0.5, 0.3, 1.2, top - 1.0, 'prop', '#26263a');
    k.box(u, wb - 0.1, u + 0.5, wb - 0.06, 1.2, top - 1.0, 'prop', '#26263a');
  }
  // 银幕：黑框 + 前面的矮台（银幕本身由运行时的影院系统挂视频贴图）
  const sv = (0.25 + wb) / 2;
  const sw = 12.8;
  const sh = 7.2;
  const sh0 = 1.8;
  k.box(hu0, sv - sw / 2 - 0.3, hu0 + 0.08, sv + sw / 2 + 0.3, sh0 - 0.3, sh0 + sh + 0.3, 'prop', '#0b0b12');
  k.box(hu0, 1.6, hu0 + 1.4, wb - 1.6, 0, 0.45, 'prop', '#2b1d2a');
  k.solid(hu0, 1.6, hu0 + 1.4, wb - 1.6, 0.45);
  const ctrlU = hu0 + 3.2;
  k.special('cinemaScreen', hu0 + 0.09, sv, sh0 + sh / 2, 1, 0, sw, sh, {
    control: k.world(ctrlU, sv),
    hall: [k.world(hu0, 0.2), k.world(hu1, wb)],
  });
  // 阶梯座位：10 排，每排抬高 0.32（台阶能直接走上去），两块座位中间和两侧是过道
  const row0 = hu0 + 4.6;
  const rowD = 1.3;
  const rows = 10;
  for (let i = 0; i < rows; i++) {
    const u0 = row0 + i * rowD;
    const u1 = i === rows - 1 ? hu1 : u0 + rowD;
    const h = i * 0.32;
    if (h > 0) {
      k.box(u0, 0.25, u1, wb, 0, h, 'prop', '#3a1622', 'solid');
      // 台阶前沿的小灯（过道上）
      for (const v of [1.0, sv, wb - 0.9]) k.box(u0 - 0.01, v - 0.12, u0, v + 0.12, h - 0.1, h - 0.06, 'prop', '#ffd166');
    }
    for (const [v0, v1] of [
      [1.9, sv - 0.6],
      [sv + 0.6, wb - 1.5],
    ]) {
      for (let v = v0 + 0.3; v <= v1 - 0.25; v += 0.6) k.chair(u0 + 0.9, v, -1, 0, { seatH: h + 0.45, color: '#c1121f', w: 0.48 });
    }
  }
  // 后墙上方的放映窗
  k.box(hu1 - 0.07, sv - 1.0, hu1 - 0.06, sv + 1.0, 6.4, 7.4, 'glass');
  k.glow(hu1 - 0.3, sv, 6.9, 0.25, '#ffffff');
  // 出口灯（影厅这一侧，门上方）
  k.box(hu0, doorV0 + 0.3, hu0 + 0.03, doorV1 - 0.3, 2.75, 3.0, 'prop', '#06d6a0');

  // ===================== 大堂 =====================
  floorFinish(k, '#1f1d3a', 0.25, 0.25, hallU - 0.15, wb);
  for (let i = 0; i < 120; i++) k.product(k.range(0.5, hallU - 0.5), k.range(0.5, wb - 0.3), 0.006, 0.08, 0.002, 0.08, true, '#f2cc8f');
  for (let i = 0; i < 40; i++) k.glow(k.range(1, hallU - 1), k.range(1, wb - 1), k.range(9.5, 11.2), 0.07, '#fff3b0');
  // 后墙上半部的巨幅主视觉
  k.card('cinema-keyvisual', -1, hallU / 2, wb - 0.02, 7.6, 0, -1, 16.0, 6.4);
  // 门口：取票机（门内左侧一组、隔墙上一组）+ 排片屏
  const machine = (u: number, v: number, du: number, dv: number) => {
    const [a0, b0, a1, b1] = du !== 0 ? [u - 0.3, v - 0.3, u + 0.3, v + 0.3] : [u - 0.3, v - 0.3, u + 0.3, v + 0.3];
    k.box(a0, b0, a1, b1, 0, 1.6, 'prop', '#e9ecef');
    k.box(u + du * 0.31 - 0.2 * Math.abs(dv), v + dv * 0.31 - 0.2 * Math.abs(du), u + du * 0.32 + 0.2 * Math.abs(dv), v + dv * 0.32 + 0.2 * Math.abs(du), 1.0, 1.45, 'prop', '#2b2d42');
    k.solid(a0, b0, a1, b1, 1.6);
  };
  for (const u of [15.8, 17.2, 18.6]) machine(u, 1.2, 0, 1);
  for (const v of [3.4, 4.8, 6.2]) machine(hallU - 0.5, v, -1, 0);
  const door = k.f.door;
  k.box(door.u0 + 2, 2.35, door.u1 - 2, 2.45, 3.4, 4.6, 'prop', '#141228');
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) k.box(door.u0 + 2.4 + c * 2.0, 2.33, door.u0 + 3.8 + c * 2.0, 2.35, 3.6 + r * 0.25, 3.7 + r * 0.25, 'prop', r === 0 ? '#f2cc8f' : '#c9c3e6');
  for (const u of [door.u0 + 2.1, door.u1 - 2.1]) k.box(u - 0.01, 2.39, u + 0.01, 2.41, 4.6, top, 'metal');
  // 人工售票台（两个窗口）
  k.counter(9.0, 1.6, 12.4, 2.4, { color: '#22223b', top: '#f2cc8f' });
  k.box(9.0, 1.95, 12.4, 2.05, 1.05, 2.2, 'glass');
  k.box(10.65, 1.95, 10.75, 2.05, 1.05, 2.2, 'prop', '#22223b');

  // ---- 后墙：小卖部长柜台 ----
  const cu0 = 3.6;
  const cu1 = 15.4;
  const cv = wb - 2.8;
  k.counter(cu0, cv, cu1, cv + 0.8, { color: '#22223b', top: '#f2cc8f', register: true });
  k.box(cu0, cv - 0.02, cu1, cv, 0.05, 0.12, 'prop', '#f2cc8f');
  k.box(cu0, wb - 0.8, cu1, wb, 0, 0.95, 'metal');
  k.solid(cu0, wb - 0.8, cu1, wb, 0.95);
  for (const pu of [cu0 + 1.5, cu1 - 1.5]) {
    k.box(pu - 0.5, wb - 0.75, pu + 0.5, wb - 0.1, 0.95, 1.1, 'prop', '#c1121f');
    k.box(pu - 0.5, wb - 0.75, pu + 0.5, wb - 0.1, 1.1, 2.0, 'glass');
    for (let i = 0; i < 24; i++) k.cyl(pu + k.range(-0.4, 0.4), wb - 0.42 + k.range(-0.25, 0.25), 1.12 + k.range(0, 0.25), 0.05, 0.06, '#ffe066');
    k.glow(pu, wb - 0.42, 1.85, 0.1, '#ffd166');
  }
  for (const du of [-1.2, 0, 1.2]) {
    const u = (cu0 + cu1) / 2 + du;
    k.box(u - 0.4, wb - 0.7, u + 0.4, wb - 0.15, 0.95, 1.85, 'prop', '#3d405b');
    for (let n = 0; n < 4; n++) k.cyl(u - 0.27 + n * 0.18, wb - 0.72, 1.3, 0.04, 0.06, k.pick(['#e63946', '#ffd166', '#06d6a0', '#ffffff']), 'v');
  }
  // 套餐菜单板（小卖部图集 3×2）
  for (let i = 0; i < 6; i++) {
    const u = cu0 + 0.9 + i * ((cu1 - cu0 - 1.8) / 5);
    k.panel('u', u - 0.85, u + 0.85, wb, -1, 2.55, 3.65, '#141228');
    k.card('atlas-concession', i, u, wb - 0.05, 3.1, 0, -1, 1.0, 1.0);
  }
  k.staff((cu0 + cu1) / 2 - 2.2, cv + 1.5, 0, -1);
  // 饮料吧（吸管、纸巾、盖子）
  k.counter(cu1 + 0.6, cv, cu1 + 2.1, cv + 0.6, { color: '#22223b', top: '#f2cc8f', register: false });
  for (let i = 0; i < 4; i++) k.cyl(cu1 + 0.8 + i * 0.35, cv + 0.3, 1.0, 0.08, 0.2, k.pick(['#ffffff', '#e63946', '#ffd166']));
  // 蛇形排队道
  k.stanchions('u', cu0 + 0.6, cu1 - 2.0, cv - 1.4, '#c1121f');
  k.stanchions('u', cu0 + 2.0, cu1 - 0.6, cv - 2.6, '#c1121f');

  // ---- 左翼前段：周边商店（玻璃柜 + 墙面货架）----
  k.shelf('v', 3.2, 9.0, wl, 1, { palette: TOYS, height: 2.0, levels: 4 });
  glassCase(k, 2.6, 4.0, 4.0, 4.6, { base: '#22223b', palette: TOYS });
  glassCase(k, 2.6, 6.0, 4.0, 6.6, { base: '#22223b', palette: TOYS });
  // 左翼“即将上映”海报（墙上灯箱）
  for (let i = 0; i < 2; i++) {
    const v = 10.0 + i * 1.6;
    k.panel('v', v - 0.5, v + 0.5, wl, 1, 0.9, 2.3, '#f2cc8f');
    k.card(MOVIES[4 + i], -1, wl + 0.05, v, 1.6, 1, 0, 0.9, 1.3);
  }

  // ---- 等候区：沙发、长凳、电影立牌 ----
  for (const [u0, v, du, dv] of [
    [18.0, 9.2, 0, 1],
    [22.0, 9.2, 0, 1],
    [18.0, 13.4, 0, -1],
    [22.0, 13.4, 0, -1],
  ] as const)
    k.sofa('u', u0, u0 + 2.2, v, du, dv, '#6b2737');
  k.table(20.1, 11.3, 1.2, 0.6, { h: 0.45, top: '#f2cc8f', color: '#22223b' });
  k.table(24.1, 11.3, 1.2, 0.6, { h: 0.45, top: '#f2cc8f', color: '#22223b' });
  for (const [u, img] of [
    [27.6, MOVIES[0]],
    [12.4, MOVIES[2]],
  ] as const) {
    k.box(u - 1.0, 7.0, u + 1.0, 7.15, 0, 2.2, 'prop', '#f8f9fa');
    k.box(u - 0.4, 7.15, u + 0.4, 7.6, 0, 0.12, 'prop', '#3d405b');
    k.card(img, -1, u, 6.995, 1.15, 0, -1, 1.9, 2.1);
    k.solid(u - 1.0, 7.0, u + 1.0, 7.6, 2.2);
  }

  // ---- 检票口：两个讲台式检票台，走廊口两侧“上映中”海报 ----
  for (const v of [doorV0 - 1.3, doorV1 + 0.3]) {
    k.box(hallU - 1.6, v - 0.3, hallU - 1.0, v + 0.2, 0, 1.1, 'prop', '#22223b');
    k.box(hallU - 1.6, v - 0.3, hallU - 1.0, v + 0.2, 1.1, 1.15, 'prop', '#f2cc8f');
    k.solid(hallU - 1.6, v - 0.3, hallU - 1.0, v + 0.2, 1.15);
  }
  k.staff(hallU - 2.4, (doorV0 + doorV1) / 2, -1, 0);
  for (let i = 0; i < 4; i++) {
    const v = 8.0 + i * 1.6;
    k.panel('v', v - 0.5, v + 0.5, hallU - 0.15, -1, 0.9, 2.3, '#f2cc8f');
    k.card(MOVIES[i], -1, hallU - 0.2, v, 1.6, -1, 0, 0.9, 1.3);
  }
  // 检票口外的吧台凳（等人的时候坐）
  stoolRow(k, 'v', 3.4, 5.4, 26.4, 1, 0, 0.7, '#6b2737');
};
