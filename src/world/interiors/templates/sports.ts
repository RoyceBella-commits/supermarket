import type { Kit } from '../kit.ts';
import { APPAREL, M, SPORT, WOOD, cash, doorMid, fittingRooms, floorFinish, frontTables, grid, hangingSign, place, retailRules, type Template } from './common.ts';

// 4F 运动楼层（docs/interior-references.md 第 15 节）。每家店都有一个“能试”的设施当磁石：
// 篮球框、展示帐篷、跑步机、穿线台、修车架、试打网笼、练习室、攀岩墙。

const wallL = (k: Kit) => k.f.walls.left + 0.05;
const wallR = (k: Kit) => k.W - k.f.walls.right - 0.05;
const wallB = (k: Kit) => k.D - k.f.walls.back - 0.05;

const shoeWall = { palette: SPORT, height: 2.2, levels: 7, depth: 0.32, item: { w: [0.26, 0.3] as [number, number], h: [0.1, 0.13] as [number, number] } };

/** 自行车：前后两个轮子（圆柱）+ 车架；沿 v 方向（车头朝 -v） */
function bike(k: Kit, u: number, v: number, color: string, h0 = 0, vertical = false) {
  const r = 0.33;
  if (vertical) {
    // 挂墙竖放：前轮在上
    for (const h of [h0 + r, h0 + 1.05 + r]) {
      k.cyl(u, v, h, r, 0.04, '#2b2d42', 'u');
      k.cyl(u, v, h, 0.07, 0.06, '#adb5bd', 'u');
    }
    k.box(u - 0.02, v - 0.03, u + 0.02, v + 0.03, h0 + r, h0 + 1.05 + r, 'prop', color);
    return;
  }
  for (const dv of [-0.5, 0.5]) {
    k.cyl(u, v + dv, h0 + r, r, 0.04, '#2b2d42', 'u');
    k.cyl(u, v + dv, h0 + r, 0.07, 0.06, '#adb5bd', 'u');
  }
  k.box(u - 0.02, v - 0.5, u + 0.02, v + 0.5, h0 + 0.55, h0 + 0.6, 'prop', color);
  k.box(u - 0.02, v - 0.08, u + 0.02, v, h0 + 0.3, h0 + 0.9, 'prop', color);
  k.box(u - 0.08, v - 0.12, u + 0.08, v + 0.05, h0 + 0.9, h0 + 0.94, 'prop', '#2b2d42');
  k.box(u - 0.25, v - 0.47, u + 0.25, v - 0.43, h0 + 0.95, h0 + 0.98, 'metal');
}

/**
 * Arc（主力店）：主推台 + 运动员人台、中轴尽头篮球框 + 草皮试玩区（网围）；
 * 左翼鞋区（全店最长的鞋墙、鞋款展示台、试鞋凳）和运动服区（挂杆、人台）；
 * 右翼球类区（球笼、球拍货架）和健身区（跑步机、动感单车、哑铃架、瑜伽垫架，橡胶地面）；吊挂品类旗。
 */
export const sports: Template = (k) => {
  const { W, D } = k;
  const mid = doorMid(k);
  retailRules(k);
  const wb = wallB(k);
  cash(k, mid + 4.6, wb - 4.4);
  k.staffDoor(wallR(k) - 0.85);
  for (const [u, v] of frontTables(k, SPORT, { stacks: true })) k.mannequin(u + (u < mid ? -1.2 : 1.2), v, '#f3722c');
  // 中轴尽头：草皮 + 篮球框，三面网
  const t0 = wb - 5.6;
  floorFinish(k, '#52b788', mid - 2.0, t0, mid + 2.0, wb);
  for (const s of [-1, 1]) {
    k.box(mid + s * 2.0 - 0.02, t0, mid + s * 2.0 + 0.02, wb, 0, 3.0, 'prop', '#e9ecef');
    k.solid(mid + s * 2.0 - 0.03, t0, mid + s * 2.0 + 0.03, wb, 3.0);
  }
  k.box(mid - 0.5, wb - 1.5, mid + 0.5, wb - 0.2, 0, 0.3, 'prop', '#2b2d42');
  k.box(mid - 0.08, wb - 0.6, mid + 0.08, wb - 0.4, 0.3, 3.05, 'metal');
  k.box(mid - 0.9, wb - 0.62, mid + 0.9, wb - 0.56, 2.9, 3.95, 'prop', '#ffffff');
  k.cyl(mid, wb - 0.85, 3.05, 0.23, 0.03, '#f3722c');
  k.solid(mid - 0.5, wb - 1.5, mid + 0.5, wb - 0.2, 3.0);
  for (let i = 0; i < 6; i++) k.cyl(mid - 1.4 + (i % 3) * 0.3, t0 + 0.4 + Math.floor(i / 3) * 0.3, 0, 0.12, 0.24, '#f3722c');
  k.backFeature = true;

  // ---- 左翼：鞋区 + 运动服区 ----
  k.shelf('v', 1.6, D - 1.6, wallL(k), 1, shoeWall);
  k.shelf('u', wallL(k), mid - 3.0, wb, -1, shoeWall);
  for (const u of [4.0, 7.4, 10.8, 14.2]) for (const v of [3.0, 5.8])
    place(k, u, v, 1.6, 0.8, () => {
      k.displayTable(u, v, 1.6, 0.8, { palette: [], h: 0.75, color: '#e9ecef' });
      for (let i = 0; i < 4; i++) k.product(u - 0.55 + i * 0.37, v, 0.75, 0.12, 0.1, 0.28, true, k.pick(SPORT));
    }, 0.5);
  for (const u of [5.6, 12.4]) place(k, u, 7.4, 2.4, 0.5, () => k.bench('u', u - 1.2, u + 1.2, 7.4, 0, -1, { color: '#277da1' }), 0.2);
  for (const v of [11.8, 13.6, 15.4]) place(k, 11.0, v, 12.0, 0.6, () => k.rack('u', 5.0, 17.0, v, { palette: SPORT }), 0.3);
  for (const [u, v] of [
    [19.5, 12.4],
    [19.5, 15.0],
  ]) if (k.fits(u - 0.3, v - 0.3, u + 0.3, v + 0.3, 0.3)) k.mannequin(u, v, k.pick(SPORT));

  // ---- 右翼前区：球类 ----
  for (let u = mid + 6; u < W - 9; u += 2.2)
    place(k, u, 3.0, 1.2, 0.6, () => {
      k.box(u - 0.6, 2.7, u + 0.6, 3.3, 0, 1.2, 'glass');
      for (let i = 0; i < 8; i++) k.cyl(u - 0.45 + (i % 4) * 0.3, 2.85 + Math.floor(i / 4) * 0.3, 0.6 + k.range(0, 0.35), 0.11, 0.22, k.pick(['#f3722c', '#ffffff', '#f9c74f']));
      k.solid(u - 0.6, 2.7, u + 0.6, 3.3, 1.2);
    }, 0.5);
  for (const c of [W - 7.0, W - 4.4]) place(k, c, 4.8, 0.6, 5.2, () => k.gondola('v', 2.2, 7.4, c, { palette: SPORT, height: 1.5, levels: 2, depth: 0.25, item: { w: [0.05, 0.05], h: [0.6, 0.65] } }), 0.3);
  k.shelf('v', 1.6, D - 1.6, wallR(k), -1, { palette: SPORT, height: 2.2, levels: 6, depth: 0.35, item: { w: [0.3, 0.38], h: [0.14, 0.2] } });
  for (let u = mid + 6; u < W - 9; u += 2.2) place(k, u, 6.0, 1.6, 0.8, () => k.displayTable(u, 6.0, 1.6, 0.8, { palette: SPORT, h: 0.8, stacks: true }), 0.5);

  // ---- 右翼后区：健身区（橡胶地面）----
  const fu0 = mid + 8.0;
  floorFinish(k, '#3d405b', fu0, 11.2, wallR(k) - 0.5, wb - 0.3);
  for (const u of [fu0 + 1.0, fu0 + 2.4]) {
    k.box(u - 0.4, 12.0, u + 0.4, 14.0, 0, 0.25, 'prop', '#2b2d42');
    k.box(u - 0.4, 11.9, u + 0.4, 12.05, 0.25, 1.4, 'prop', '#2b2d42');
    k.solid(u - 0.4, 11.9, u + 0.4, 14.0, 1.4);
  }
  for (const u of [fu0 + 4.2, fu0 + 5.6]) {
    k.box(u - 0.25, 12.4, u + 0.25, 13.6, 0, 0.12, 'prop', '#2b2d42');
    k.box(u - 0.04, 13.1, u + 0.04, 13.2, 0.12, 0.85, 'prop', '#f3722c');
    k.box(u - 0.15, 13.05, u + 0.15, 13.35, 0.85, 0.92, 'prop', '#2b2d42');
    k.box(u - 0.04, 12.5, u + 0.04, 12.6, 0.12, 1.1, 'prop', '#f3722c');
    k.box(u - 0.25, 12.45, u + 0.25, 12.55, 1.05, 1.1, 'metal');
    k.cyl(u, 12.85, 0.35, 0.22, 0.05, '#adb5bd', 'u');
    k.solid(u - 0.25, 12.4, u + 0.25, 13.6, 1.1);
  }
  const du = fu0 + 7.6;
  k.box(du - 0.75, 12.6, du + 0.75, 13.2, 0, 0.9, 'metal');
  for (let i = 0; i < 6; i++) k.cyl(du - 0.6 + i * 0.24, 12.9, 0.9, 0.06, 0.18, '#2b2d42', 'v');
  k.solid(du - 0.75, 12.6, du + 0.75, 13.2, 0.9);
  k.box(du - 0.4, 15.4, du + 0.4, 15.8, 0, 0.9, 'prop', WOOD);
  for (let i = 0; i < 5; i++) k.cyl(du - 0.3 + i * 0.15, 15.6, 0.9, 0.06, 0.6, k.pick(SPORT));
  k.solid(du - 0.4, 15.4, du + 0.4, 15.8, 1.5);
  // 吊挂品类旗
  for (const u of [8, 16, W - 16, W - 8]) hangingSign(k, u, 9.4, 2.0, k.pick(SPORT), true, 2.6, 4.4);
};

/**
 * Summit Outdoor（主力店）：入口展示帐篷（木平台 + 露营椅）、天花吊独木舟；
 * 左翼装备区（炊具灯具货架、露营椅展示）、背包墙、登山鞋墙 + 试鞋坡 + 试鞋凳、攀登绳墙；
 * 右翼冲锋衣挂架、睡袋炉具中岛、地图台（服务台）、租借柜台、落地皮划艇展架；后墙收银 + 户外主视觉。
 */
export const outdoor: Template = (k) => {
  const { W, D } = k;
  const mid = doorMid(k);
  retailRules(k);
  const wb = wallB(k);
  cash(k, mid, wb - 2.8, { w: 3.0 });
  k.staffDoor(wallR(k) - 0.85);
  // 展示帐篷：0.2 高木平台上一顶圆顶帐篷，旁边露营椅和炉具
  const tu = mid - 5.0;
  const tv = 5.0;
  k.box(tu - 2.0, tv - 1.6, tu + 2.0, tv + 1.6, 0, 0.2, 'prop', WOOD, 'solid');
  k.box(tu - 1.1, tv - 1.0, tu + 1.1, tv + 1.0, 0.2, 0.75, 'prop', '#a7c957');
  k.box(tu - 0.8, tv - 0.75, tu + 0.8, tv + 0.75, 0.75, 1.15, 'prop', '#6a994e');
  k.box(tu - 0.4, tv - 0.4, tu + 0.4, tv + 0.4, 1.15, 1.35, 'prop', '#386641');
  k.box(tu - 0.35, tv - 1.01, tu + 0.35, tv - 1.0, 0.2, 0.7, 'prop', '#2b2d42');
  k.solid(tu - 1.1, tv - 1.0, tu + 1.1, tv + 1.0, 1.35);
  for (const du of [-1.5, 1.5]) k.chair(tu + du, tv + 1.25, 0, -1, { color: '#bc4749', seatH: 0.55, w: 0.42 });
  k.box(tu + 0.2, tv + 1.15, tu + 0.5, tv + 1.45, 0.2, 0.4, 'metal');
  // 天花吊的独木舟
  for (const [u, v] of [
    [mid - 3.0, 9.4],
    [mid + 4.0, 9.0],
    [10.0, 9.4],
    [W - 10.0, 9.2],
  ]) {
    k.box(u - 2.25, v - 0.4, u + 2.25, v + 0.4, 3.0, 3.35, 'prop', k.pick(['#f3722c', '#f9c74f', '#277da1']));
    k.box(u - 1.6, v - 0.3, u + 1.6, v + 0.3, 3.35, 3.4, 'prop', '#2b2d42');
  }

  // ---- 左翼前区：装备货架 + 露营椅展示 ----
  const gear = ['#adb5bd', '#6c757d', '#f3722c', '#2a9d8f', '#e9c46a', '#264653'];
  for (const c of [4.0, 6.8, 9.6, 12.4]) place(k, c, 4.7, 0.9, 5.4, () => k.gondola('v', 2.0, 7.4, c, { palette: gear, height: 1.5, levels: 4 }), 0.3);
  for (let i = 0; i < 4; i++) {
    const u = 15.2 + i * 0.8;
    if (k.fits(u - 0.25, 2.0, u + 0.25, 2.5)) k.chair(u, 2.2, 0, 1, { color: k.pick(['#bc4749', '#2a9d8f', '#f9c74f']), seatH: 0.45, w: 0.46 });
  }
  // ---- 左翼后区：背包墙、登山鞋墙 + 试鞋坡 + 试鞋凳、攀登绳 ----
  k.shelf('v', 1.6, D - 1.6, wallL(k), 1, { palette: SPORT, height: 2.4, levels: 4, depth: 0.45, item: { w: [0.3, 0.38], h: [0.4, 0.5] } });
  k.shelf('u', wallL(k), 15, wb, -1, shoeWall);
  for (let i = 0; i < 5; i++) k.box(9.0 + i * 0.3, 13.0, 9.3 + i * 0.3, 14.0, 0, 0.05 + i * 0.1, 'prop', '#8d6e63');
  k.box(9.0, 12.95, 10.5, 13.0, 0, 1.0, 'metal');
  k.box(9.0, 14.0, 10.5, 14.05, 0, 1.0, 'metal');
  k.solid(9.0, 12.95, 10.5, 14.05, 0.5);
  for (const u of [4.5, 13.5]) place(k, u, 13.5, 2.4, 0.5, () => k.bench('u', u - 1.2, u + 1.2, 13.5, 0, 1, { color: '#6a994e' }), 0.3);
  for (let i = 0; i < 5; i++) k.cyl(16.6 + i * 0.6, wb - 0.15, 1.5, 0.22, 0.12, k.pick(['#f3722c', '#277da1', '#f9c74f', '#90be6d']), 'v');
  k.solid(16.2, wb - 0.4, 19.6, wb, 1.8);

  // ---- 右翼：冲锋衣挂架、睡袋炉具中岛、地图台、租借柜台、皮划艇展架 ----
  for (const v of [2.4, 4.2, 6.0]) place(k, (mid + 5 + W - 4) / 2, v, W - 4 - mid - 5, 0.6, () => k.rack('u', mid + 5, W - 4, v, { palette: SPORT }), 0.3);
  k.shelf('v', 1.6, D - 1.6, wallR(k), -1, { palette: SPORT, height: 2.2 });
  grid(mid + 5, W - 9, 11.4, 15.4, 3.0, 2.6, (u, v) => place(k, u, v, 1.8, 0.9, () => k.displayTable(u, v, 1.8, 0.9, { palette: SPORT, h: 0.8, stacks: true }), 0.5));
  // 地图台（服务台）
  const mu = W - 6.5;
  place(k, mu, 12.0, 1.6, 0.9, () => {
    k.counter(mu - 0.8, 11.55, mu + 0.8, 12.45, { color: WOOD, top: '#e9f5db', register: false });
    for (let i = 0; i < 3; i++) k.product(mu - 0.5 + i * 0.5, 12.0, 0.95, 0.4, 0.005, 0.5, true, k.pick(['#e9f5db', '#a7c957', '#90e0ef']));
  }, 0.3);
  // 租借柜台
  k.counter(W - 5.0, wb - 2.4, W - 2.0, wb - 1.7, { color: '#386641' });
  k.shelf('u', W - 5.2, W - 2.0, wb, -1, { palette: SPORT, height: 2.0, levels: 3 });
  // 皮划艇落地展架
  const ku = mid + 9.0;
  place(k, ku, wb - 1.0, 4.6, 0.9, () => {
    for (const du of [-1.6, 1.6]) k.box(ku + du - 0.05, wb - 1.35, ku + du + 0.05, wb - 0.65, 0, 0.6, 'prop', WOOD);
    k.box(ku - 2.25, wb - 1.4, ku + 2.25, wb - 0.6, 0.6, 0.95, 'prop', '#f9c74f');
    k.solid(ku - 2.25, wb - 1.4, ku + 2.25, wb - 0.6, 0.95);
  }, 0.2);
};

/** Stride：鞋墙、两条试鞋凳、步态分析角（跑步机 + 三脚架摄像机 + 屏幕 + 足型扫描台）、地上的试跑道、门口收银 */
export const running: Template = (k) => {
  const { W, D } = k;
  retailRules(k);
  cash(k, 2.3, 4.0, { du: 1, dv: 0, w: 2.0 });
  k.panel('u', k.f.door.u1 + 0.4, k.f.door.u1 + 1.6, 0.2, 1, 1.0, 1.9, '#80b918');
  k.shelf('v', 6.0, D - 1.6, wallL(k), 1, shoeWall);
  k.staffDoor(wallR(k) - 0.85);
  k.shelf('u', wallL(k), wallR(k) - 1.7, wallB(k), -1, shoeWall);
  // 右墙前半：服装
  k.rack('v', 1.8, 8.0, wallR(k) - 0.45, { palette: SPORT });
  // 右墙后半：步态分析角
  const gv = D - 5.0;
  const gu = wallR(k) - 0.8;
  k.box(gu - 0.4, gv - 1.0, gu + 0.4, gv + 1.0, 0, 0.25, 'prop', '#2b2d42');
  k.box(gu - 0.4, gv - 1.05, gu + 0.4, gv - 0.95, 0.25, 1.4, 'prop', '#2b2d42');
  k.solid(gu - 0.4, gv - 1.05, gu + 0.4, gv + 1.0, 0.25);
  k.screen('v', gv - 0.6, gv + 0.6, wallR(k), -1, 1.4, 2.1, '#90e0ef');
  for (const du of [-0.1, 0.1]) k.box(gu - 1.4 + du, gv + 1.4, gu - 1.38 + du, gv + 1.42, 0, 1.2, 'metal');
  k.box(gu - 1.5, gv + 1.35, gu - 1.3, gv + 1.5, 1.2, 1.35, 'prop', '#2b2d42');
  k.box(gu - 1.6, gv - 2.0, gu - 0.8, gv - 1.5, 0, 0.2, 'prop', '#3d405b');
  k.box(gu - 1.25, gv - 1.8, gu - 1.15, gv - 1.7, 0.2, 1.1, 'metal');
  // 地上 6 m 试跑道
  floorFinish(k, '#e76f51', W / 2 + 2.2, 7.0, W / 2 + 3.0, 13.0);
  // 中区两条试鞋凳
  for (const v of [8.0, 11.0]) k.bench('u', W / 2 - 2.6, W / 2 - 0.2, v, 0, -1, { color: '#80b918' });
};

/** Shuttle：通高球拍墙、穿线工作台（穿线机 + 线卷墙 + 待取球拍架）、球鞋球包墙、球筒堆头、挥拍试打区（网隔开） */
export const badminton: Template = (k) => {
  const { W, D } = k;
  retailRules(k);
  // 左墙：球拍头朝上竖挂，4 排
  const wl = wallL(k);
  k.box(wl, 1.6, wl + 0.05, D - 2.0, 0.2, 2.6, 'prop', '#f8f9fa');
  k.solid(wl, 1.6, wl + 0.3, D - 2.0, 2.6);
  for (let row = 0; row < 3; row++)
    for (let v = 1.8; v < D - 2.2; v += 0.22) {
      const h = 0.3 + row * 0.75;
      const col = k.pick(SPORT);
      k.box(wl + 0.08, v - 0.012, wl + 0.11, v + 0.012, h, h + 0.32, 'prop', '#2b2d42');
      k.box(wl + 0.08, v - 0.1, wl + 0.11, v + 0.1, h + 0.32, h + 0.62, 'prop', col);
    }
  k.shelf('v', 1.6, D - 4.6, wallR(k), -1, shoeWall);
  // 后墙一侧：穿线台（L 形柜台接收银）+ 线卷墙
  const wb = wallB(k);
  cash(k, W - 3.6, wb - 2.6, { w: 2.4, back: false });
  for (const du of [-1.6, -0.6]) {
    k.box(W - 3.6 + du - 0.3, wb - 1.0, W - 3.6 + du + 0.3, wb - 0.5, 0, 0.9, 'prop', '#4361ee');
    k.cyl(W - 3.6 + du, wb - 0.75, 0.9, 0.2, 0.06, '#adb5bd');
    k.solid(W - 3.6 + du - 0.3, wb - 1.0, W - 3.6 + du + 0.3, wb - 0.5, 1.0);
  }
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) k.cyl(W - 5.6 + i * 0.3, wb - 0.04, 1.4 + j * 0.25, 0.075, 0.03, k.pick(SPORT), 'v');
  k.staffDoor(wallL(k) + 1.4);
  // 中区：球筒堆成金字塔 + 小球手胶台
  const pu = W / 2 - 1.8;
  const pv = 8.2;
  place(k, pu, pv, 1.2, 0.8, () => {
    k.box(pu - 0.6, pv - 0.4, pu + 0.6, pv + 0.4, 0, 0.4, 'prop', '#f9c74f');
    for (let l = 0; l < 4; l++) for (let i = 0; i < 6 - l; i++) k.cyl(pu - 0.45 + l * 0.09 + i * 0.18, pv, 0.44 + l * 0.17, 0.08, 0.4, l % 2 ? '#4361ee' : '#ffffff', 'v');
    k.solid(pu - 0.6, pv - 0.4, pu + 0.6, pv + 0.4, 1.1);
  });
  place(k, W / 2 + 1.6, 8.2, 1.4, 0.8, () => k.displayTable(W / 2 + 1.6, 8.2, 1.4, 0.8, { palette: SPORT, h: 0.8 }), 0.3);
  // 门内右侧：挥拍试打区，网隔开
  const su = wallR(k) - 2.2;
  k.box(su - 0.02, 1.6, su + 0.02, 6.2, 0, 2.6, 'prop', '#e9ecef');
  k.box(su, 6.18, wallR(k) - 0.5, 6.22, 0, 2.6, 'prop', '#e9ecef');
  k.solid(su - 0.03, 1.6, su + 0.03, 6.2, 2.6);
  k.solid(su, 6.15, wallR(k) - 0.5, 6.25, 2.6);
};

/** Spoke Cycles：前区成排展示车、左墙两层挂墙车、右墙头盔轮胎墙、后部维修工坊（修车架 + 工具挂板 + 工作台，柜台隔开） */
export const bikes: Template = (k) => {
  const { W, D } = k;
  const door = k.f.door;
  retailRules(k);
  // 前区：展示车，车头朝走廊，0.7 m 一辆（门洞两侧）
  for (const [u0, u1] of [
    [wallL(k) + 1.2, door.u0 - 0.2],
    [door.u1 + 0.2, wallR(k) - 1.2],
  ]) {
    for (let u = u0; u <= u1; u += 0.7) bike(k, u, 2.6, k.pick(SPORT));
    if (u1 > u0) k.solid(u0 - 0.1, 1.7, u1 + 0.1, 3.5, 1.0);
  }
  // 左墙：两层挂墙车
  for (let v = 4.4; v < D - 5; v += 0.5) bike(k, wallL(k) + 0.2, v, k.pick(SPORT), (Math.round((v - 4.4) / 0.5) % 2) * 1.9, true);
  k.solid(wallL(k), 4.1, wallL(k) + 0.45, D - 5, 3.8);
  // 右墙：头盔墙 + 轮胎墙
  k.shelf('v', 4.0, D - 5.4, wallR(k), -1, { palette: SPORT, height: 2.0, levels: 4, depth: 0.35, item: { w: [0.26, 0.3], h: [0.18, 0.2] } });
  for (let v = 4.4; v < D - 5.8; v += 0.7) for (const h of [2.3, 3.0]) k.cyl(wallR(k) - 0.08, v, h, 0.32, 0.06, '#2b2d42', 'u');
  // 后部维修工坊：1.0 高柜台隔开，收银在柜台一端
  const wv = D - 4.6;
  k.counter(wallL(k) + 2.4, wv, wallR(k) - 3.2, wv + 0.6, { color: '#e63946', top: '#f1faee', register: false });
  cash(k, wallR(k) - 2.2, wv + 0.3, { w: 1.6, back: false });
  for (const u of [W * 0.35, W * 0.6]) {
    k.box(u - 0.05, wv + 2.0, u + 0.05, wv + 2.1, 0, 1.3, 'metal');
    bike(k, u + 0.2, wv + 2.05, k.pick(SPORT), 0.35);
  }
  const wb = wallB(k);
  k.panel('u', wallL(k) + 3, wallR(k) - 4, wb, -1, 1.1, 2.3, '#495057');
  for (let i = 0; i < 14; i++) k.box(wallL(k) + 3.3 + i * 0.6, wb - 0.06, wallL(k) + 3.4 + i * 0.6, wb - 0.04, 1.3, 2.0, 'metal');
  k.counter(wallL(k) + 3.2, wb - 0.7, wallL(k) + 5.2, wb, { color: '#495057', register: false });
  k.staffDoor(wallR(k) - 0.85);
};

/** Fairway Golf：后墙两个试打网笼（屏幕 + 打击垫 + 同伴椅）、推杆果岭（小旗）、球杆架、球包一排、门口收银 */
export const golf: Template = (k) => {
  const { W, D } = k;
  retailRules(k);
  const wb = wallB(k);
  for (const u0 of [wallL(k) + 0.6, wallL(k) + 4.4]) {
    const u1 = u0 + 3.5;
    const v0 = wb - 5.0;
    k.box(u0, v0, u0 + 0.04, wb, 0, 3.0, 'prop', '#e9f5db');
    k.box(u1 - 0.04, v0, u1, wb, 0, 3.0, 'prop', '#e9f5db');
    k.box(u0, v0, u1, wb, 2.96, 3.0, 'prop', '#e9f5db');
    k.screen('u', u0 + 0.3, u1 - 0.3, wb, -1, 0.3, 2.6, '#52b788');
    k.box(u0 + 1.0, wb - 3.4, u0 + 2.5, wb - 1.9, 0, 0.03, 'prop', '#2d6a4f');
    k.box(u0 + 2.2, wb - 3.3, u0 + 2.5, wb - 3.0, 0.03, 0.2, 'prop', '#3d405b');
    k.solid(u0, v0, u0 + 0.05, wb, 3.0);
    k.solid(u1 - 0.05, v0, u1, wb, 3.0);
    k.chair(u0 + 1.75, v0 + 0.5, 0, 1, { color: '#2d6a4f' });
  }
  // 推杆果岭
  const gu = wallL(k) + 4.4;
  const gv = wb - 8.0;
  floorFinish(k, '#74c69d', gu - 3.0, gv - 2.0, gu + 3.0, gv + 2.0);
  for (const [du, dv] of [
    [-2.0, -1.0],
    [0.5, 0.8],
    [2.2, -0.6],
  ]) {
    k.cyl(gu + du, gv + dv, 0, 0.06, 0.008, '#1b4332');
    k.box(gu + du - 0.01, gv + dv - 0.01, gu + du + 0.01, gv + dv + 0.01, 0, 0.6, 'metal');
    k.box(gu + du, gv + dv - 0.005, gu + du + 0.18, gv + dv + 0.005, 0.48, 0.6, 'prop', '#e63946');
  }
  // 左墙前段：球杆架（杆头朝上）；中区球包一排
  k.shelf('v', 1.6, wb - 10.4, wallL(k), 1, { palette: SPORT, height: 1.4, levels: 1, depth: 0.4, item: { w: [0.05, 0.06], h: [0.95, 1.05] } });
  for (let u = W / 2 + 2; u < W - 4; u += 0.55) {
    k.cyl(u, 8.0, 0, 0.15, 0.9, k.pick(['#2d6a4f', '#ffffff', '#1d3557', '#e63946']));
    for (let i = 0; i < 3; i++) k.box(u - 0.08 + i * 0.07, 7.98, u - 0.05 + i * 0.07, 8.02, 0.9, 1.15, 'metal');
  }
  k.solid(W / 2 + 1.8, 7.8, W - 4.2, 8.2, 1.15);
  k.shelf('v', 1.6, D - 1.6, wallR(k), -1, { palette: APPAREL, height: 2.1 });
  cash(k, W - 3.0, 4.0, { du: -1, dv: 0, w: 2.2 });
  k.staffDoor(W / 2 + 1);
  k.backFeature = true;
};

/** Flow Studio：正挂衣服和叠装、圆角实木桌 + 凳、试衣间 + 社区板、玻璃小练习室（木地板、瑜伽垫、镜墙）、门边瑜伽垫筒 */
export const yoga: Template = (k) => {
  const { W, D } = k;
  retailRules(k);
  const palette = ['#b5838d', '#e5989b', '#ffb4a2', '#6d6875', '#ffe5d9', '#2b2d42'];
  k.rack('v', 1.8, D - 4.0, wallL(k) + 0.45, { palette });
  k.shelf('v', 1.6, 8.0, wallR(k), -1, { palette, height: 2.2, levels: 6, depth: 0.4, item: { w: [0.28, 0.34], h: [0.1, 0.16] } });
  // 门边瑜伽垫筒
  const bu = k.f.door.u0 - 0.8;
  k.box(bu - 0.4, 1.2, bu + 0.4, 1.6, 0, 0.6, 'prop', WOOD);
  for (let i = 0; i < 6; i++) k.cyl(bu - 0.3 + (i % 3) * 0.3, 1.32 + Math.floor(i / 3) * 0.16, 0.6, 0.06, 0.6, k.pick(palette));
  k.solid(bu - 0.4, 1.2, bu + 0.4, 1.6, 1.2);
  // 中区：实木桌 + 凳子
  for (const u of [W * 0.33, W * 0.55]) {
    place(k, u, 7.0, 2.6, 2.3, () => {
      k.displayTable(u, 7.0, 1.8, 0.9, { palette, h: 0.75, color: WOOD, stacks: true });
      for (const du of [-0.6, 0.6]) k.chair(u + du, 8.0, 0, -1, { seatH: 0.45, w: 0.36, back: false, color: '#ddb892' });
    }, 0.4);
  }
  // 后区一侧：试衣间 + 社区信息板
  fittingRooms(k, wallL(k) + 0.6, 4, '#e5989b');
  k.panel('u', wallL(k) + 5.8, wallL(k) + 7.3, wallB(k), -1, 1.0, 2.0, '#f1faee');
  for (let i = 0; i < 8; i++) k.box(wallL(k) + 5.9 + (i % 4) * 0.35, wallB(k) - 0.06, wallL(k) + 6.15 + (i % 4) * 0.35, wallB(k) - 0.05, 1.2 + Math.floor(i / 4) * 0.4, 1.5 + Math.floor(i / 4) * 0.4, 'prop', k.pick(['#ffd166', '#90e0ef', '#ffafcc']));
  // 后区另一侧：玻璃练习室
  const ru0 = W - 8.4;
  const rv0 = D - 6.4;
  const ru1 = wallR(k);
  const rv1 = wallB(k);
  floorFinish(k, '#d4a373', ru0, rv0, ru1, rv1);
  k.box(ru0, rv0, ru0 + 3.0, rv0 + 0.05, 0, 2.4, 'glass');
  k.box(ru0 + 4.2, rv0, ru1, rv0 + 0.05, 0, 2.4, 'glass');
  k.box(ru0, rv0, ru0 + 0.05, rv1, 0, 2.4, 'glass');
  k.solid(ru0 + 0.07, rv0, ru0 + 3.0, rv0 + 0.06, 2.4);
  k.solid(ru0 + 4.2, rv0, ru1, rv0 + 0.06, 2.4);
  k.solid(ru0, rv0, ru0 + 0.06, rv1, 2.4);
  k.panel('u', ru0 + 0.3, ru1 - 0.3, rv1, -1, 0.3, 2.5, '#e0fbfc');
  grid(ru0 + 0.6, ru1 - 0.4, rv0 + 0.8, rv1 - 0.6, 1.1, 2.2, (u, v) => k.box(u - 0.31, v - 0.9, u + 0.31, v + 0.9, 0, 0.015, 'prop', k.pick(palette)));
  cash(k, W / 2, D - 5.0, { w: 2.4 });
  k.staffDoor(W / 2 + 3.4);
};

/** Boulder Box：前区接待（签到 + 收银）、租鞋格子柜、更衣储物；U 形攀岩墙（不同角度分段、彩色岩点、大三角体）、连续保护垫、面朝墙的长凳 + 难度表 */
export const climbing: Template = (k) => {
  const { W, D } = k;
  retailRules(k, { main: 4 });
  cash(k, W - 3.4, 3.4, { w: 3.0 });
  // 租鞋格子柜（6×5 格）
  const wl = wallL(k);
  k.box(wl, 1.8, wl + 0.35, 3.3, 0, 1.8, 'prop', '#ffca3a');
  for (let r = 0; r < 6; r++) for (let c = 0; c < 5; c++) k.product(wl + 0.22, 1.95 + c * 0.28, 0.1 + r * 0.29, 0.12, 0.1, 0.22, false, k.pick(['#6a4c93', '#1982c4', '#ff595e']));
  k.solid(wl, 1.8, wl + 0.35, 3.3, 1.8);
  k.box(wl, 3.8, wl + 0.45, 6.0, 0, 1.8, 'locker');
  k.solid(wl, 3.8, wl + 0.45, 6.0, 1.8);
  // U 形攀岩墙：后墙全宽 + 两侧墙后半，分段（每段 2.4 宽）不同颜色和外倾
  const wr = wallR(k);
  const wb = wallB(k);
  const wallTints = ['#e9ecef', '#dee2e6', '#f8f9fa', '#ced4da'];
  const holdColors = ['#ffca3a', '#ff595e', '#8ac926', '#1982c4', '#6a4c93'];
  const panel = (axis: 'u' | 'v', a0: number, a1: number, c: number, face: 1 | -1, lean: number, tint: string) => {
    // 外倾的墙用几层逐渐伸出的板模拟
    for (let i = 0; i < 4; i++) {
      const out = lean * (i / 3);
      const h0 = i * 1.05;
      const c0 = c + face * out;
      if (axis === 'u') k.box(a0, Math.min(c, c0 + face * 0.25), a1, Math.max(c, c0 + face * 0.25), h0, h0 + 1.05, 'prop', tint);
      else k.box(Math.min(c, c0 + face * 0.25), a0, Math.max(c, c0 + face * 0.25), a1, h0, h0 + 1.05, 'prop', tint);
    }
    for (let n = 0; n < 30; n++) {
      const a = k.range(a0 + 0.15, a1 - 0.15);
      const h = k.range(0.3, 4.0);
      const out = lean * Math.min(1, h / 3.15);
      const s = k.range(0.08, 0.3);
      const cc = c + face * (out + 0.27);
      if (axis === 'u') k.product(a, cc, h, s, s * 0.8, 0.08, true, k.pick(holdColors));
      else k.product(cc, a, h, 0.08, s * 0.8, s, false, k.pick(holdColors));
    }
    if (k.rng() < 0.5) {
      const a = k.range(a0 + 0.6, a1 - 0.6);
      const h = k.range(1.0, 3.0);
      const cc = c + face * (lean * Math.min(1, h / 3.15) + 0.5);
      if (axis === 'u') k.product(a, cc, h, 0.8, 0.6, 0.5, true, k.pick(['#ffffff', '#2b2d42']));
      else k.product(cc, a, h, 0.5, 0.6, 0.8, false, k.pick(['#ffffff', '#2b2d42']));
    }
  };
  let i = 0;
  for (let u = wl; u < wr - 0.1; u += 2.4) panel('u', u, Math.min(wr, u + 2.4), wb, -1, [0, 0.4, 1.0, 0.2][i % 4], wallTints[i++ % 4]);
  for (let v = D * 0.5; v < wb - 0.1; v += 2.4) {
    panel('v', v, Math.min(wb, v + 2.4), wl, 1, [0.3, 0][i % 2], wallTints[i % 4]);
    panel('v', v, Math.min(wb, v + 2.4), wr, -1, [0, 0.5][i % 2], wallTints[i++ % 4]);
  }
  k.solid(wl, wb - 1.4, wr, wb, 4.2);
  k.solid(wl, D * 0.5, wl + 1.4, wb - 1.45, 4.2);
  k.solid(wr - 1.4, D * 0.5, wr, wb - 1.45, 4.2);
  // 保护垫（0.3 高，能走上去，不算挡路）
  const matC = '#457b9d';
  k.box(wl + 1.4, wb - 4.2, wr - 1.4, wb - 1.4, 0, 0.3, 'prop', matC, 'solid');
  k.box(wl + 1.4, D * 0.5, wl + 4.2, wb - 4.2, 0, 0.3, 'prop', matC, 'solid');
  k.box(wr - 4.2, D * 0.5, wr - 1.4, wb - 4.2, 0, 0.3, 'prop', matC, 'solid');
  // 休息带：面朝墙的长凳 + 难度表
  for (const u of [W * 0.3, W * 0.55]) k.bench('u', u - 1.0, u + 1.0, D * 0.5 - 1.6, 0, 1, { color: '#ffca3a' });
  k.panel('v', D * 0.5 - 2.6, D * 0.5 - 1.1, wr, -1, 1.2, 2.2, '#f8f9fa');
  for (let n = 0; n < 6; n++) k.panel('v', D * 0.5 - 2.5, D * 0.5 - 1.2, wr - 0.04, -1, 1.3 + n * 0.15, 1.42 + n * 0.15, holdColors[n % 5]);
  k.backFeature = true;
  void M;
};
