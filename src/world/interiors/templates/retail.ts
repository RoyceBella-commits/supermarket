import { shade } from '../kit.ts';
import {
  APPAREL,
  BOOKS,
  BREAD,
  COSMETIC,
  DARK_WOOD,
  DRINKS,
  FRUIT,
  PANTRY,
  PASTEL,
  TECH,
  TOYS,
  backPanel,
  cash,
  doorMid,
  fittingRooms,
  frontTables,
  glassCase,
  grid,
  hangingSign,
  isAnchor,
  place,
  retailRules,
  stoolRow,
  wallShelves,
  windowDisplays,
  type Template,
} from './common.ts';

// 零售类模板。每类按 docs/interior-references.md 的“布局要点 + 辨识细节”做：
// 只把 3–5 个最能认出这类店的东西做成实体，其余用货架和色块概括。

const wallL = (k: Parameters<Template>[0]) => k.f.walls.left + 0.05;
const wallR = (k: Parameters<Template>[0]) => k.W - k.f.walls.right - 0.05;
const wallB = (k: Parameters<Template>[0]) => k.D - k.f.walls.back - 0.05;

// ---------- 1. 积木 / 玩具 ----------

/** BrickNest：门口积木雕像、散件墙（彩色透明管）、低矮搭建桌 + 儿童凳、人仔柜台 */
export const bricks: Template = (k) => {
  const { W, D } = k;
  const door = k.f.door;
  retailRules(k);
  k.statue(door.u0 - 1.1, 1.3, 1.0, ['#e63946', '#ffd166', '#118ab2', '#06d6a0']);
  k.statue(door.u1 + 1.1, 1.3, 1.0, ['#118ab2', '#e63946', '#ffd166', '#ef476f']);
  // 门口主推台：立着的积木盒，盒面朝门口（积木盒图集 2×2）
  for (const [tu, tv] of frontTables(k, [])) {
    for (let i = 0; i < 3; i++) {
      const u = tu - 0.5 + i * 0.5;
      const hh = k.range(0.32, 0.42);
      k.product(u, tv, 0.8, 0.44, hh, 0.12, true, k.pick(TOYS));
      k.card('atlas-brickboxes', (i + Math.floor(tu)) % 4, u, tv - 0.061, 0.8 + hh / 2, 0, -1, 0.42, hh - 0.02);
    }
  }
  // 左墙：套装盒墙
  k.shelf('v', 1.6, D - 1.6, wallL(k), 1, { palette: TOYS, height: 2.1, levels: 5, item: { w: [0.3, 0.42], h: [0.2, 0.3] } });
  // 右墙：散件墙（3 列 × 6 排 × 8 根透明管）+ 台面 + 取杯架，前后接普通货架
  const wr = wallR(k);
  const p0 = 6.0;
  const p1 = 9.6;
  k.box(wr - 0.06, p0, wr, p1, 0.9, 2.45, 'prop', '#fbf8f2');
  k.box(wr - 0.35, p0, wr, p1, 0, 0.9, 'prop', '#e9e2d4');
  k.solid(wr - 0.35, p0, wr, p1, 0.9);
  for (let row = 0; row < 6; row++)
    for (let a = p0 + 0.12; a < p1 - 0.1; a += 0.15) {
      const col = TOYS[(Math.floor((a - p0) / 0.15) + row * 3) % TOYS.length];
      k.cyl(wr - 0.13, a, 0.95 + row * 0.24, 0.06, 0.22, col);
    }
  k.box(wr - 1.25, 7.6, wr - 0.85, 8.2, 0, 1.0, 'prop', '#3d405b');
  k.solid(wr - 1.25, 7.6, wr - 0.85, 8.2, 1.0);
  k.shelf('v', 1.6, p0 - 0.2, wr, -1, { palette: TOYS, height: 2.1 });
  k.shelf('v', p1 + 0.2, D - 1.6, wr, -1, { palette: TOYS, height: 2.1 });
  // 后墙：盒子墙 + 员工门；收银在后墙右侧面朝入口
  k.staffDoor(wr - 0.85);
  k.shelf('u', wallL(k), wr - 1.7, wallB(k), -1, { palette: TOYS, height: 2.1 });
  cash(k, W - 3.4, D - 2.7);
  // 中区：两张低矮搭建桌（桌面凸点底板）+ 儿童凳，前后错开
  const buildTable = (cu: number, cv: number) =>
    place(k, cu, cv, 2.6, 1.9, () => {
      k.table(cu, cv, 1.6, 0.9, { h: 0.6, top: '#ffd166', color: '#e63946' });
      for (let x = -0.6; x <= 0.6; x += 0.4) k.product(cu + x, cv, 0.6, 0.12, 0.03, 0.12, true, k.pick(TOYS));
      for (const du of [-0.45, 0.45]) {
        k.chair(cu + du, cv - 0.8, 0, 1, { seatH: 0.35, color: '#118ab2', w: 0.32, back: false });
        k.chair(cu + du, cv + 0.8, 0, -1, { seatH: 0.35, color: '#06d6a0', w: 0.32, back: false });
      }
    });
  buildTable(W * 0.3, 9.0);
  buildTable(W * 0.62, 12.6);
  // 人仔柜台：台面是一格格透明零件盒
  place(k, W * 0.28, 13.6, 1.2, 0.6, () => {
    k.counter(W * 0.28 - 0.6, 13.3, W * 0.28 + 0.6, 13.9, { color: '#3d405b', register: false });
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) k.product(W * 0.28 - 0.5 + i * 0.2, 13.4 + j * 0.2, 1.0, 0.16, 0.05, 0.16, true, k.pick(TOYS));
  });
};

/** Toybox Lane：分类低货架（1.35 高）、轨道演示台、天花吊挂风筝气球、毛绒挂钩墙 */
export const toys: Template = (k) => {
  const { W, D } = k;
  retailRules(k);
  frontTables(k, TOYS, { stacks: true });
  k.shelf('v', 1.6, D - 1.6, wallL(k), 1, { palette: TOYS, height: 2.1 });
  k.shelf('v', 1.6, D - 1.6, wallR(k), -1, { palette: PASTEL, height: 2.1, levels: 7, depth: 0.3, item: { w: [0.12, 0.18], h: [0.14, 0.2] } });
  k.staffDoor(wallR(k) - 0.85);
  k.shelf('u', wallL(k), wallR(k) - 1.7, wallB(k), -1, { palette: TOYS, height: 2.1 });
  // 中区：分类低货架（沿进深方向，列间通道 ≥ 1.5）
  for (const c of [2.6, 5.0, W - 5.0, W - 2.6]) place(k, c, 9.6, 0.9, 6.0, () => k.gondola('v', 6.6, 12.6, c, { palette: TOYS, height: 1.35, levels: 3 }), 0.3);
  // 轨道演示台：围边 + 小山 + 轨道 + 小火车
  const tu = W / 2;
  const tv = 15.0;
  place(k, tu, tv, 2.4, 1.2, () => {
    k.box(tu - 1.2, tv - 0.6, tu + 1.2, tv + 0.6, 0, 0.7, 'prop', '#90be6d');
    k.box(tu - 1.2, tv - 0.6, tu + 1.2, tv - 0.56, 0.7, 0.8, 'prop', '#6a994e');
    k.box(tu - 1.2, tv + 0.56, tu + 1.2, tv + 0.6, 0.7, 0.8, 'prop', '#6a994e');
    k.box(tu - 1.0, tv - 0.32, tu + 1.0, tv - 0.26, 0.7, 0.72, 'prop', '#6b4f3a');
    k.box(tu - 1.0, tv + 0.26, tu + 1.0, tv + 0.32, 0.7, 0.72, 'prop', '#6b4f3a');
    k.box(tu + 0.3, tv - 0.2, tu + 0.9, tv + 0.2, 0.7, 0.95, 'prop', '#a7c957');
    for (let i = 0; i < 3; i++) k.product(tu - 0.8 + i * 0.22, tv - 0.29, 0.72, 0.18, 0.12, 0.1, true, ['#e63946', '#118ab2', '#ffd166'][i]);
    k.solid(tu - 1.2, tv - 0.6, tu + 1.2, tv + 0.6, 0.8);
  });
  cash(k, W - 3.4, D - 2.7);
  // 天花吊挂的风筝和气球（只是画面）
  for (let i = 0; i < 7; i++) {
    const u = k.range(2, W - 2);
    const v = k.range(4, D - 4);
    const s = k.range(0.3, 0.6);
    k.box(u - s, v - 0.02, u + s, v + 0.02, 3.6 + k.range(0, 0.8), 4.0 + k.range(0, 0.8), 'prop', k.pick(TOYS));
  }
};

// ---------- 2. 潮玩盲盒 / 扭蛋 / 毛绒 ----------

/** BlindStar：门口 IP 大雕像 + 机器人售货柜、发光盲盒墙、大娃玻璃高柜、后墙收银 */
export const blindbox: Template = (k) => {
  const { W, D } = k;
  const door = k.f.door;
  retailRules(k);
  k.statue(door.u0 - 1.0, 1.3, 0.9, ['#cdb4db', '#ffafcc', '#bde0fe', '#ffffff']);
  // 机器人售货柜：玻璃面朝门口中轴
  const vu = Math.min(wallR(k) - 0.5, door.u1 + 0.9);
  k.box(vu - 0.45, 0.4, vu + 0.45, 1.6, 0, 2.0, 'prop', '#2b2d42');
  k.box(vu - 0.47, 0.5, vu - 0.45, 1.5, 0.4, 1.8, 'glass');
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) k.product(vu - 0.3, 0.7 + c * 0.35, 0.5 + r * 0.32, 0.1, 0.12, 0.1, false, k.pick(PASTEL));
  k.solid(vu - 0.45, 0.4, vu + 0.45, 1.6, 2.0);
  // 左右墙：盲盒墙（统一尺寸的小格）
  wallShelves(k, { palette: PASTEL, height: 2.2, levels: 7, item: { w: [0.12, 0.12], h: [0.12, 0.12] }, door: 'left', back: false });
  // 中区：主推桌（盒子堆成塔）+ 大娃高柜（每层一只大公仔，用盲盒图集的卡片表示）
  frontTables(k, PASTEL, { stacks: true });
  for (const u of [2.0, W - 2.0]) {
    const v0 = 6.4;
    place(k, u, v0 + 0.25, 0.6, 0.5, () => {
      glassCase(k, u - 0.3, v0, u + 0.3, v0 + 0.5, { tall: true, palette: [] });
      for (let l = 0; l < 3; l++) k.card('atlas-blindbox', Math.floor(k.rng() * 9), u, v0 - 0.005, 0.5 + l * 0.53, 0, -1, 0.3, 0.3);
    });
  }
  // 后墙：收银居中，背后主视觉（logo 灯箱）
  k.shelf('u', wallL(k) + 1.7, wallR(k) - 0.5, wallB(k), -1, { palette: PASTEL, height: 1.2, levels: 3 });
  cash(k, W / 2, D - 2.8, { back: false });
};

/** Gacha Galaxy：两侧墙各一排扭蛋机，中间一列背靠背双面机组，换币机、胶囊回收箱、开蛋台 */
export const capsuleToys: Template = (k) => {
  const { W, D } = k;
  retailRules(k);
  const machine = (u: number, v: number, face: 1 | -1) => {
    const col = k.pick(TOYS);
    for (let level = 0; level < 2; level++) {
      const h0 = level * 0.8;
      k.box(u - 0.22, v - 0.27, u + 0.22, v + 0.27, h0, h0 + 0.42, 'prop', col);
      k.box(u - 0.2, v - 0.25, u + 0.2, v + 0.25, h0 + 0.42, h0 + 0.78, 'glass');
      k.box(u - 0.22, v - 0.27, u + 0.22, v + 0.27, h0 + 0.78, h0 + 0.8, 'prop', col);
      for (let i = 0; i < 4; i++) k.cyl(u, v - 0.12 + (i % 2) * 0.24, h0 + 0.44 + Math.floor(i / 2) * 0.13, 0.055, 0.11, k.pick(PASTEL));
      k.card('atlas-blindbox', Math.floor(k.rng() * 9), u + face * 0.221, v, h0 + 0.22, face, 0, 0.36, 0.36);
    }
    // 顶上的阵容卡
    k.card('atlas-blindbox', Math.floor(k.rng() * 9), u + face * 0.1, v, 1.78, face, 0, 0.26, 0.3);
  };
  const v0 = 2.6;
  const v1 = D - 2.0;
  for (let v = v0; v < v1; v += 0.6) {
    machine(wallL(k) + 0.25, v, 1);
    machine(wallR(k) - 0.25, v, -1);
  }
  k.solid(wallL(k), v0 - 0.3, wallL(k) + 0.47, v1, 1.95);
  k.solid(wallR(k) - 0.47, v0 - 0.3, wallR(k), v1, 1.95);
  const c = W / 2;
  for (let v = 6.4; v < v1 - 1.6; v += 0.6) {
    machine(c - 0.23, v, -1);
    machine(c + 0.23, v, 1);
  }
  k.solid(c - 0.45, 6.1, c + 0.45, v1 - 1.6, 1.95);
  // 换币机（入口内侧）、胶囊回收箱和开蛋台（后墙）
  const mu = Math.min(k.f.door.u1 + 0.3, wallR(k) - 0.6);
  k.box(mu - 0.22, 1.2, mu + 0.22, 1.65, 0, 1.6, 'prop', '#ffd60a');
  k.box(mu - 0.2, 1.18, mu + 0.2, 1.2, 0.9, 1.3, 'prop', '#3d405b');
  k.solid(mu - 0.22, 1.2, mu + 0.22, 1.65, 1.6);
  const wb = wallB(k);
  k.box(c - 0.6, wb - 0.5, c + 0.6, wb, 0, 1.0, 'prop', '#7b2cbf');
  k.solid(c - 0.6, wb - 0.5, c + 0.6, wb, 1.0);
  k.box(c + 0.9, wb - 0.5, c + 1.4, wb, 0, 0.9, 'prop', '#ffd60a');
  k.solid(c + 0.9, wb - 0.5, c + 1.4, wb, 0.9);
  k.backFeature = true;
};

/** Fluffle：门口巨型毛绒、蛋糕式分层圆台、毛绒池大圆筐、后墙工坊（填充机 + 儿童凳） */
export const plush: Template = (k) => {
  const { W, D } = k;
  const door = k.f.door;
  retailRules(k);
  k.statue(door.u0 - 1.1, 1.4, 1.2, ['#ffc8dd', '#ffafcc', '#ffffff', '#cdb4db']);
  wallShelves(k, { palette: PASTEL, height: 2.1, levels: 4, item: { w: [0.25, 0.42], h: [0.22, 0.34] } });
  // 分层圆台
  const tiered = (cu: number, cv: number) =>
    place(k, cu, cv, 1.6, 1.6, () => {
      for (const [r, h0, h1] of [
        [0.8, 0, 0.4],
        [0.55, 0.4, 0.8],
        [0.3, 0.8, 1.2],
      ] as const) {
        k.cyl(cu, cv, h0, r, h1 - h0, '#fff0f3');
        const n = Math.round(r * 9);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          k.product(cu + Math.cos(a) * (r - 0.12), cv + Math.sin(a) * (r - 0.12), h1, 0.16, 0.2, 0.14, true, k.pick(PASTEL));
        }
      }
      k.solid(cu - 0.8, cv - 0.8, cu + 0.8, cv + 0.8, 1.2);
    });
  tiered(W * 0.3, 8.0);
  tiered(W * 0.7, 8.0);
  // 毛绒池：圆筐里堆得冒尖
  for (const [u, v] of [
    [W * 0.25, 11.6],
    [W * 0.5, 11.6],
    [W * 0.75, 11.6],
  ])
    place(k, u, v, 0.8, 0.8, () => {
      k.cyl(u, v, 0, 0.4, 0.6, '#d4a373');
      for (let i = 0; i < 9; i++) k.cyl(u + k.range(-0.22, 0.22), v + k.range(-0.22, 0.22), 0.55 + k.range(0, 0.2), k.range(0.09, 0.14), 0.16, k.pick(PASTEL));
      k.solid(u - 0.4, v - 0.4, u + 0.4, v + 0.4, 0.6);
    });
  // 工坊：填充机（透明滚筒里是棉絮）+ 爱心桌 + 儿童凳，最后接收银
  const wv = D - 3.2;
  place(k, 2.4, wv, 0.8, 0.6, () => {
    k.box(2.0, wv - 0.3, 2.8, wv + 0.3, 0, 0.8, 'prop', '#ffafcc');
    k.cyl(2.4, wv, 1.05, 0.28, 0.6, '#f8f9fa', 'u');
    k.solid(2.0, wv - 0.3, 2.8, wv + 0.3, 1.3);
  });
  place(k, 4.8, wv, 1.2, 1.8, () => {
    k.table(4.8, wv, 1.2, 0.6, { h: 0.6, top: '#ffc8dd', color: '#cdb4db' });
    k.chair(4.5, wv - 0.65, 0, 1, { seatH: 0.32, w: 0.32, back: false, color: '#bde0fe' });
    k.chair(5.1, wv - 0.65, 0, 1, { seatH: 0.32, w: 0.32, back: false, color: '#caffbf' });
  });
  cash(k, W - 3.4, D - 2.8, { back: false });
};

// ---------- 3. 动漫周边 / 卡牌 ----------

/** DimHub：门口等身立牌 + 新刊平台 + 扭蛋机、挂钩墙（吧唧、挂件）、手办玻璃柜、收银排队道 */
export const anime: Template = (k) => {
  const { W, D } = k;
  const door = k.f.door;
  retailRules(k);
  // 等身立牌：薄板 + 三角底座
  for (const [u, col] of [
    [door.u0 - 0.6, '#2ec4b6'],
    [door.u0 - 1.4, '#ff9f1c'],
    [door.u1 + 0.8, '#e71d36'],
  ] as const) {
    k.box(u - 0.3, 1.0, u + 0.3, 1.04, 0, 1.7, 'prop', col);
    k.box(u - 0.2, 1.04, u + 0.2, 1.3, 0, 0.1, 'prop', '#3d405b');
    k.solid(u - 0.3, 1.0, u + 0.3, 1.3, 1.7);
  }
  frontTables(k, BOOKS, { stacks: true, h: 0.8 });
  // 左右墙：挂钩墙，密密麻麻的小挂件，每段顶上一块作品名牌
  const peg = { palette: [...TOYS, ...PASTEL], height: 2.1, levels: 9, depth: 0.16, item: { w: [0.05, 0.08] as [number, number], h: [0.07, 0.1] as [number, number] } };
  k.shelf('v', 1.6, D - 1.6, wallL(k), 1, peg);
  k.shelf('v', 1.6, D - 5.6, wallR(k), -1, peg);
  for (let v = 1.6; v < D - 2; v += 2.4) k.panel('v', v + 0.1, v + 2.3, wallL(k), 1, 2.15, 2.4, k.pick(TOYS));
  // 中区：两列 1.5 高双面货架（漫画、画集）
  for (const c of [3.0, W - 3.0]) place(k, c, 9.0, 0.9, 5.0, () => k.gondola('v', 6.5, 11.5, c, { palette: BOOKS, height: 1.5, levels: 4 }), 0.3);
  // 后墙：上锁的手办玻璃柜一排
  const wb = wallB(k);
  for (let u = wallL(k) + 1.6; u < W - 4; u += 0.7) glassCase(k, u, wb - 0.5, u + 0.6, wb, { tall: true });
  k.staffDoor(wallL(k) + 0.8);
  // 收银靠右，收银前沿墙拉排队道
  cash(k, W - 2.6, D - 3.6, { w: 2.0, du: -1, dv: 0 });
  k.stanchions('v', D - 8.0, D - 4.8, W - 2.0);
};

/** Card Den：卡牌自动售货机、L 形玻璃柜台（单卡）、单卡壁柜、对战长桌、对阵表 */
export const cards: Template = (k) => {
  const { W } = k;
  const door = k.f.door;
  retailRules(k);
  // 卡牌自动售货机：正面朝中轴
  const vu = door.u0 - 0.6;
  k.box(vu - 0.4, 0.4, vu + 0.4, 1.3, 0, 1.8, 'prop', '#386641');
  k.box(vu + 0.4, 0.5, vu + 0.42, 1.2, 0.5, 1.7, 'glass');
  for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) k.product(vu + 0.3, 0.6 + c * 0.22, 0.55 + r * 0.22, 0.04, 0.14, 0.1, false, k.pick(TOYS));
  k.solid(vu - 0.4, 0.4, vu + 0.4, 1.3, 1.8);
  // L 形玻璃柜台（靠右墙，店员在里面），背后墙上是补充包
  const cu0 = W - 3.0;
  glassCase(k, cu0, 3.2, cu0 + 0.6, 7.6, { base: '#386641' });
  glassCase(k, cu0, 7.6, W - 1.1, 8.2, { base: '#386641' });
  k.staff(cu0 + 1.3, 5.4, -1, 0);
  k.shelf('v', 2.8, 7.6, wallR(k), -1, { palette: TOYS, height: 2.0, levels: 6, depth: 0.3, item: { w: [0.08, 0.12], h: [0.14, 0.18] } });
  k.reserve(cu0 - 1.3, 3.2, cu0, 8.2);
  // 左墙：单卡壁柜
  for (let v = 2.4; v < 7.5; v += 1.1) glassCase(k, wallL(k), v, wallL(k) + 0.4, v + 1.0, { tall: true, base: '#1b1b25' });
  // 后半：对战区，长桌两人对坐，桌上两张卡垫
  for (const cv of [9.8, 12.2]) {
    for (let cu = 2.0; cu + 1.8 <= W - 1.6; cu += 2.6) {
      k.table(cu + 0.9, cv, 1.8, 0.6, { top: '#f1faee', color: '#3a3a3a', h: 0.72 });
      for (const s of [-1, 1]) {
        k.box(cu + 0.6, cv + s * 0.12 - 0.08, cu + 1.2, cv + s * 0.12 + 0.08, 0.72, 0.725, 'prop', '#264653');
        k.chair(cu + 0.9, cv + s * 0.62, 0, -s, { seatH: 0.45, w: 0.34, back: false, color: '#f2e8cf' });
      }
    }
  }
  // 后墙对阵表
  backPanel(k, W / 2 - 1.2, W / 2 + 1.2, 1.0, 2.2, '#f8f9fa');
  for (let i = 0; i < 4; i++) k.panel('u', W / 2 - 1.0, W / 2 + 1.0, wallB(k) - 0.06, -1, 1.25 + i * 0.25, 1.27 + i * 0.25, '#264653');
  k.backFeature = true;
};

// ---------- 4–6. 数码 / 相机 / 游戏 ----------

/** Orbit（主力店）：浅木长桌阵列、后墙大屏 + 方块坐凳讲座区、种树的服务台、配件墙；没有收银台 */
export const devices: Template = (k) => {
  const { W, D } = k;
  const mid = doorMid(k);
  retailRules(k);
  const table = (cu: number, cv: number) =>
    place(k, cu, cv, 1.2, 3.6, () => {
      k.box(cu - 0.6, cv - 1.8, cu + 0.6, cv + 1.8, 0.8, 0.85, 'prop', '#e8d5b7');
      k.box(cu - 0.5, cv - 1.7, cu + 0.5, cv + 1.7, 0, 0.8, 'prop', '#d8c3a5');
      for (let v = cv - 1.5; v < cv + 1.6; v += 0.6) {
        k.product(cu - 0.25, v, 0.85, 0.16, 0.012, 0.28, true, '#2b2d42');
        k.product(cu + 0.25, v, 0.85, 0.22, 0.012, 0.3, true, '#2b2d42');
      }
      k.solid(cu - 0.6, cv - 1.8, cu + 0.6, cv + 1.8, 0.85);
    }, 0.4);
  // 后墙：大屏 + 方块凳（Forum），先占位
  const wb = wallB(k);
  k.screen('u', mid - 3.5, mid + 3.5, wb, -1, 0.6, 4.0, '#9bd5ff');
  for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) {
    const u = mid - 3.125 + i * 1.25;
    const v = wb - 4.0 + r * 1.25;
    k.box(u - 0.22, v - 0.22, u + 0.22, v + 0.22, 0, 0.45, 'prop', '#c8a27a');
    k.solid(u - 0.22, v - 0.22, u + 0.22, v + 0.22, 0.45);
    k.addSeat(u, v, 0.45, 0, 1);
  }
  k.reserve(mid - 3.8, wb - 4.8, mid + 3.8, wb);
  // 右翼：盆栽树 + 服务台（一端坐高配椅子、一端站高配高凳），先放
  for (const u of [W - 13, W - 8]) k.plant(u, 6.2, 2.2);
  const su = W - 10.5;
  const sv = 14.6;
  k.box(su - 1.2, sv - 0.4, su, sv + 0.4, 0, 0.75, 'prop', '#e8d5b7');
  k.box(su, sv - 0.4, su + 1.2, sv + 0.4, 0, 1.05, 'prop', '#e8d5b7');
  k.solid(su - 1.2, sv - 0.4, su + 1.2, sv + 0.4, 1.05);
  k.chair(su - 0.9, sv - 0.75, 0, 1, { color: '#8d99ae' });
  k.chair(su - 0.3, sv - 0.75, 0, 1, { color: '#8d99ae' });
  k.stool(su + 0.4, sv - 0.7, 0, 1);
  k.stool(su + 0.9, sv - 0.7, 0, 1);
  k.reserve(su - 1.4, sv - 2.0, su + 1.4, sv - 1.0);
  // 中轴两侧和两翼一排排长桌（长边垂直于门面，间距约 2 m）
  for (const side of [-1, 1]) for (let i = 0; i < 6; i++) {
    table(mid + side * (2.6 + i * 3.2), 5.2);
    table(mid + side * (2.6 + i * 3.2), 13.0);
  }
  k.staff(mid - 1.75, 4.6, 1, 0);
  // 左翼：配件墙（Avenue）+ 取货柜台
  k.shelf('v', 1.6, D - 1.6, wallL(k), 1, { palette: TECH, height: 2.4, levels: 6, depth: 0.5, color: '#efe6d8', item: { w: [0.12, 0.2], h: [0.12, 0.2] } });
  k.shelf('u', wallL(k) + 0.6, 14, wb, -1, { palette: TECH, height: 2.4, levels: 6, depth: 0.5, color: '#efe6d8' });
  k.shelf('v', 1.6, D - 1.6, wallR(k), -1, { palette: TECH, height: 2.4, levels: 6, depth: 0.5, color: '#efe6d8' });
  k.backFeature = true;
};

/** Case Lab：三面挂钩墙（同尺寸吸塑包装）、两列矮中岛、门口一侧的收银 + 贴膜台和高凳 */
export const phoneAccessories: Template = (k) => {
  const { W, D } = k;
  retailRules(k);
  cash(k, 2.3, 4.0, { du: 1, dv: 0, w: 2.0 });
  // 贴膜台 + 两张高凳
  k.counter(1.9, 5.8, 2.7, 7.0, { color: '#00a6fb', register: false });
  k.stool(3.15, 6.1, -1, 0);
  k.stool(3.15, 6.7, -1, 0);
  const peg = { palette: [...TECH, ...PASTEL], height: 2.1, levels: 9, depth: 0.16, item: { w: [0.09, 0.1] as [number, number], h: [0.14, 0.15] as [number, number] } };
  k.shelf('v', 7.6, D - 1.6, wallL(k), 1, peg);
  k.shelf('v', 1.6, D - 1.6, wallR(k), -1, peg);
  k.staffDoor(wallL(k) + 0.85);
  k.shelf('u', wallL(k) + 1.7, wallR(k) - 0.5, wallB(k), -1, peg);
  // 机型色条
  for (let v = 1.6; v < D - 2; v += 1.2) k.panel('v', v + 0.05, v + 1.15, wallR(k), -1, 2.15, 2.3, k.pick(TOYS));
  for (const c of [5.6, W - 3.2]) place(k, c, 9.5, 0.9, 5.0, () => k.gondola('v', 7.0, 12.0, c, { palette: [...TECH, ...PASTEL], height: 1.35, levels: 3 }), 0.3);
};

/** Kaze：新机体验台（斜放的相机）、发光镜头玻璃柜、三脚架“小树林”、二手柜台 + 高凳、耳机试听吧 */
export const camera: Template = (k) => {
  const { W } = k;
  const mid = doorMid(k);
  retailRules(k);
  // 体验台（分在主通道两侧）
  for (const [u0, u1] of [
    [1.2, mid - 1.4],
    [mid + 1.4, W - 1.2],
  ]) {
    k.counter(u0, 3.2, u1, 3.9, { color: '#2b2d42', top: '#edf2f4', register: false });
    for (let u = u0 + 0.3; u < u1 - 0.2; u += 0.45) {
      k.product(u, 3.55, 0.95, 0.14, 0.1, 0.08, true, '#14213d');
      k.cyl(u, 3.47, 0.98, 0.035, 0.08, '#8d99ae', 'v');
      k.product(u + 0.05, 3.62, 1.05, 0.02, 0.02, 0.02, true, '#ef233c');
    }
  }
  // 左墙：镜头玻璃柜，里面竖放一排排圆柱镜头
  const wl = wallL(k);
  for (let v = 5.0; v < 10.2; v += 1.05) {
    k.box(wl, v, wl + 0.45, v + 1.0, 0, 0.3, 'prop', '#2b2d42');
    k.box(wl, v, wl + 0.45, v + 1.0, 0.3, 2.0, 'glass');
    k.box(wl, v, wl + 0.45, v + 1.0, 2.0, 2.05, 'prop', '#2b2d42');
    for (let l = 0; l < 4; l++) {
      k.box(wl + 0.03, v + 0.03, wl + 0.42, v + 0.97, 0.32 + l * 0.42, 0.34 + l * 0.42, 'glass');
      for (let i = 0; i < 4; i++) k.cyl(wl + 0.22, v + 0.15 + i * 0.23, 0.34 + l * 0.42, k.range(0.035, 0.06), k.range(0.08, 0.28), k.pick(['#14213d', '#2b2d42', '#e5e5e5']));
    }
    k.solid(wl, v, wl + 0.45, v + 1.0, 2.05);
  }
  // 右墙：三脚架小树林 + 墙上挂相机包
  const wr = wallR(k);
  for (let v = 5.0; v < 9.6; v += 0.5) {
    for (const [du, dv] of [
      [-0.2, -0.1],
      [-0.05, 0.18],
      [-0.32, 0.12],
    ])
      k.box(wr - 0.4 + du, v + dv - 0.012, wr - 0.4 + du + 0.024, v + dv + 0.012, 0, 1.5, 'metal');
    k.box(wr - 0.48, v - 0.06, wr - 0.3, v + 0.1, 1.5, 1.62, 'prop', '#2b2d42');
  }
  k.solid(wr - 0.75, 4.8, wr, 9.8, 1.62);
  k.panel('v', 5.0, 9.6, wr, -1, 1.85, 2.5, '#efe6d8');
  for (let v = 5.3; v < 9.4; v += 0.5) k.product(wr - 0.12, v, 1.9, 0.18, 0.3, 0.35, false, k.pick(['#2b2d42', '#6d6875', '#a68a64']));
  // 中区：品牌岛，中间一根灯箱柱
  for (const u of [W * 0.27, W * 0.73])
    place(k, u, 8.6, 2.4, 1.2, () => {
      k.displayTable(u, 8.6, 2.4, 1.2, { palette: ['#14213d', '#2b2d42'], h: 0.95, color: '#edf2f4' });
      k.box(u - 0.15, 8.45, u + 0.15, 8.75, 0.95, 1.6, 'prop', '#ef233c');
    }, 0.3);
  // 后区：二手柜台 + 高凳（左），耳机试听吧（右），收银居中
  const wb = wallB(k);
  glassCase(k, 1.0, wb - 4.6, 3.8, wb - 4.0, { base: '#1b1b25', palette: ['#14213d', '#8d99ae'] });
  k.stool(1.8, wb - 5.15, 0, 1);
  k.stool(2.8, wb - 5.15, 0, 1);
  k.shelf('u', wallL(k), 3.8, wb, -1, { palette: TECH, height: 2.0 });
  k.box(wr - 0.5, wb - 5.0, wr, wb - 2.6, 0, 1.0, 'prop', '#2b2d42');
  k.solid(wr - 0.5, wb - 5.0, wr, wb - 2.6, 1.0);
  for (let v = wb - 4.7; v < wb - 2.7; v += 0.5) k.cyl(wr - 0.25, v, 1.12, 0.09, 0.05, '#ef233c', 'u');
  stoolRow(k, 'v', wb - 4.6, wb - 3.0, wr - 0.95, 1, 0, 0.8);
  k.staffDoor(wr - 0.85);
  cash(k, mid, wb - 2.6);
};

/** PixelFox（主力店）：门口吉祥物雕像、试玩亭（坐式 + 高凳）、后墙大屏 + 小舞台 + 观众长凳、软件墙、历代主机展柜 */
export const consoles: Template = (k) => {
  const { W, D } = k;
  const mid = doorMid(k);
  const door = k.f.door;
  retailRules(k, { axisEnd: 11.6 });
  for (const u of [door.u0 - 1.4, door.u1 + 1.4]) k.statue(u, 1.8, 1.2, ['#ff6b35', '#ffffff', '#1a1a2e', '#ff9f1c']);
  // 试玩亭：两列背靠背，坐式，每台一张高凳
  for (const cu of [mid - 5.2, mid + 5.2]) {
    for (let i = 0; i < 4; i++) {
      const cv = 3.6 + i * 1.1;
      for (const s of [-1, 1]) {
        const u = cu + s * 0.35;
        k.box(u - 0.3, cv - 0.45, u + 0.3, cv + 0.45, 0, 0.75, 'prop', '#1a1a2e');
        k.box(cu + s * 0.03, cv - 0.4, cu + s * 0.07, cv + 0.4, 0.95, 1.45, 'prop', k.pick(['#ff6b35', '#06d6a0', '#3a86ff', '#ffd166']));
        k.stool(cu + s * 1.05, cv, -s, 0, '#ff6b35');
      }
      k.box(cu - 0.04, cv - 0.45, cu + 0.04, cv + 0.45, 0.75, 1.5, 'prop', '#1a1a2e');
    }
    k.solid(cu - 0.65, 3.1, cu + 0.65, 3.6 + 3 * 1.1 + 0.45, 1.5);
  }
  // 后墙：大屏 + 小舞台 + 观众长凳
  const wb = wallB(k);
  k.screen('u', mid - 3.0, mid + 3.0, wb, -1, 1.2, 4.2, '#ffb347');
  k.box(mid - 2.0, wb - 3.0, mid + 2.0, wb - 0.2, 0, 0.3, 'prop', '#1a1a2e');
  k.solid(mid - 2.0, wb - 3.0, mid + 2.0, wb - 0.2, 0.3);
  for (const v of [wb - 4.2, wb - 5.4]) k.bench('u', mid - 1.4, mid + 1.4, v, 0, 1, { color: '#ff6b35' });
  // 左翼：周边（挂杆、毛绒、手办墙）
  for (let v = 4.0; v < 8.0; v += 2.0) k.rack('u', 4.0, 10.0, v, { palette: ['#ff6b35', '#1a1a2e', '#ffffff', '#06d6a0'] });
  k.shelf('v', 1.6, D - 1.6, wallL(k), 1, { palette: PASTEL, height: 2.2, levels: 5 });
  k.shelf('u', wallL(k), 14, wb, -1, { palette: TOYS, height: 2.2, levels: 6, depth: 0.35 });
  // 右翼：软件墙（一层层游戏盒）、主机桌、历代主机展柜
  const soft = { palette: ['#e63946', '#3a86ff', '#ffd166', '#06d6a0', '#ffffff'], height: 2.2, levels: 7, depth: 0.25, item: { w: [0.14, 0.14] as [number, number], h: [0.18, 0.18] as [number, number] } };
  k.shelf('v', 1.6, D - 1.6, wallR(k), -1, soft);
  for (const u of [W - 12, W - 8]) place(k, u, 5.0, 1.6, 0.9, () => k.displayTable(u, 5.0, 1.6, 0.9, { palette: ['#1a1a2e', '#e5e5e5'], h: 0.8 }), 0.4);
  for (let u = mid + 6.5; u < mid + 10.5; u += 0.7) glassCase(k, u, wb - 0.5, u + 0.6, wb, { tall: true, palette: ['#8d99ae', '#e5e5e5', '#2b2d42'] });
  // 收银：后墙右段长柜台，前面排队道
  cash(k, W - 8, wb - 2.6, { w: 4.4 });
  k.stanchions('u', W - 12.5, W - 9.6, wb - 4.6);
  k.staffDoor(wallR(k) - 0.85);
  k.backFeature = true;
};

// ---------- 7. 服装 / 鞋 / 包 / 饰品 ----------

interface ApparelOpts {
  palette: string[];
  mannequin: string[];
  sofa: string;
  kids?: boolean;
  /** 男装的量体角（三面镜 + 小台） */
  tailor?: boolean;
}

/** 服装骨架：橱窗人台、主推台、环墙格子层板 + 挂杆、中区折叠台和挂架、两翼试衣间、收银加自助收银箱 */
export const apparel =
  (o: ApparelOpts): Template =>
  (k) => {
    const { W, D } = k;
    const mid = doorMid(k);
    const anchor = isAnchor(k);
    const low = o.kids ? 1.35 : 2.4;
    retailRules(k);
    windowDisplays(k, o.mannequin, anchor ? 3 : 2);
    for (const [u, v] of frontTables(k, o.palette, { stacks: true })) k.mannequin(u + (u < mid ? -1.15 : 1.15), v, k.pick(o.mannequin));
    // 环墙：上段格子叠装、下段挂杆（墙前挂一排衣服）
    const wl = wallL(k);
    const wr = wallR(k);
    const wb = wallB(k);
    const folded = { palette: o.palette, height: low, levels: o.kids ? 3 : 6, depth: 0.4, item: { w: [0.28, 0.34] as [number, number], h: [0.1, 0.18] as [number, number] } };
    k.shelf('v', 1.6, D - 1.8, wl, 1, folded);
    k.rack('v', 1.8, D - 2.2, wr - 0.45, { palette: o.palette, h: o.kids ? 1.1 : 1.5 });
    // 两翼后角试衣间（主力店两组），前面等候沙发
    const curtain = shade(k.f.shop.theme.primary, 1.1);
    fittingRooms(k, wl + 0.2, anchor ? 5 : 3, curtain, { size: o.kids ? 1.5 : 1.2 });
    if (anchor) fittingRooms(k, wr - 0.2 - 5 * 1.2 - 0.06, 5, curtain);
    const sofaU = wl + 0.2 + (anchor ? 6.6 : o.kids ? 5.0 : 4.2);
    place(k, sofaU + 0.8, wb - 2.6, 1.6, 0.8, () => k.sofa('u', sofaU, sofaU + 1.6, wb - 2.2, 0, -1, o.sofa), 0.2);
    // 收银：中轴后段一侧，旁边两台自助收银箱
    const cu = anchor ? mid + 5 : W - 4.2;
    cash(k, cu, wb - 4.6, { w: anchor ? 4.4 : 2.2 });
    for (const du of [-1, 1]) {
      const su = cu + du * (anchor ? 3.2 : 2.0);
      if (k.fits(su - 0.3, wb - 5.0, su + 0.3, wb - 4.4)) {
        k.box(su - 0.3, wb - 5.0, su + 0.3, wb - 4.5, 0, 1.0, 'prop', '#e9e2d4');
        k.box(su - 0.2, wb - 4.95, su + 0.2, wb - 4.55, 1.0, 1.25, 'prop', '#3d405b');
        k.solid(su - 0.3, wb - 5.0, su + 0.3, wb - 4.5, 1.25);
      }
    }
    // 中区：2.4 m 网格交替放折叠台和挂架（避开前面已经放好的试衣间、收银）
    const gu0 = anchor ? 2.5 : 2.4;
    grid(gu0, W - 2.4, 4.6, D - 3.6, 2.4, 2.4, (u, v, i, j) => {
      if ((i + j) % 2) place(k, u, v, 1.4, 0.8, () => k.displayTable(u, v, 1.4, 0.8, { palette: o.palette, h: 0.75, stacks: true }), 0.55);
      else place(k, u, v, 1.4, 0.6, () => k.rack('u', u - 0.7, u + 0.7, v, { palette: o.palette, h: o.kids ? 1.1 : 1.4 }), 0.55);
    });
    // 全身镜
    k.panel('v', 1.0, 1.5, wl, 1, 0.1, 1.9, '#dff3f8');
    if (o.tailor) {
      // 量体角：三面镜 + 0.15 高小台（右翼尽端）
      const tu = wr - 1.6;
      const tv = 10.0;
      if (k.fits(tu - 0.9, tv - 0.9, tu + 0.9, tv + 0.9)) {
        k.box(tu - 0.5, tv - 0.5, tu + 0.5, tv + 0.5, 0, 0.15, 'prop', '#6b4f3a');
        k.box(tu + 0.6, tv - 0.6, tu + 0.65, tv + 0.6, 0, 2.0, 'prop', '#dff3f8');
        k.box(tu - 0.5, tv - 0.7, tu + 0.6, tv - 0.65, 0, 2.0, 'prop', '#dff3f8');
        k.box(tu - 0.5, tv + 0.65, tu + 0.6, tv + 0.7, 0, 2.0, 'prop', '#dff3f8');
        k.solid(tu + 0.6, tv - 0.7, tu + 0.65, tv + 0.7, 2.0);
      }
    }
    if (o.kids) {
      // 童装游戏角：软垫 + 软块围边 + 小矮凳
      const pu = W - 4.0;
      const pv = wb - 2.2;
      if (k.fits(pu - 1.5, pv - 1.5, pu + 1.5, pv + 1.5)) {
        k.box(pu - 1.5, pv - 1.5, pu + 1.5, pv + 1.5, 0, 0.05, 'prop', '#caffbf');
        k.box(pu - 1.5, pv - 1.5, pu + 1.5, pv - 1.3, 0, 0.3, 'prop', '#ffafcc');
        k.box(pu - 1.5, pv + 1.3, pu + 1.5, pv + 1.5, 0, 0.3, 'prop', '#ffafcc');
        k.solid(pu - 1.5, pv - 1.5, pu + 1.5, pv - 1.3, 0.3);
        k.solid(pu - 1.5, pv + 1.3, pu + 1.5, pv + 1.5, 0.3);
        for (const du of [-0.6, 0.6]) k.chair(pu + du, pv, 0, -1, { seatH: 0.25, w: 0.3, back: false, color: '#bde0fe' });
      }
    }
    k.staffDoor(W / 2 + (anchor ? 0 : 2.6));
  };

/** Heel & Lace：三面鞋墙（单只样鞋）、两条试鞋凳 + 皮墩、地上的低镜、门口一侧收银 */
export const shoes: Template = (k) => {
  const { W, D } = k;
  retailRules(k);
  cash(k, 2.3, 4.2, { du: 1, dv: 0, w: 2.0 });
  const shoesWall = { palette: APPAREL, height: 2.1, levels: 8, depth: 0.3, item: { w: [0.26, 0.28] as [number, number], h: [0.1, 0.12] as [number, number] } };
  k.shelf('v', 6.0, D - 1.6, wallL(k), 1, shoesWall);
  k.shelf('v', 1.6, D - 2.6, wallR(k), -1, shoesWall);
  k.staffDoor(wallR(k) - 0.85);
  k.shelf('u', wallL(k), wallR(k) - 1.7, wallB(k), -1, shoesWall);
  // 鞋盒堆在墙脚
  for (let v = 6.2; v < D - 2; v += 0.36) k.product(wallL(k) + 0.65, v, 0, 0.33, 0.12 * Math.ceil(k.range(1, 4)), 0.22, false, '#d6ccc2');
  // 中区：两条试鞋凳 + 皮墩 + 低镜
  for (const v of [8.0, 11.6]) {
    k.bench('u', W / 2 - 1.2, W / 2 + 1.2, v, 0, -1, { color: '#9d4edd' });
    k.box(W / 2 + 1.7, v - 0.05, W / 2 + 2.1, v, 0, 0.6, 'prop', '#dff3f8');
  }
  for (const [u, v] of [
    [W / 2 - 2.4, 9.8],
    [W / 2 + 2.4, 9.8],
  ]) {
    k.box(u - 0.25, v - 0.25, u + 0.25, v + 0.25, 0, 0.45, 'prop', '#e0aaff');
    k.solid(u - 0.25, v - 0.25, u + 0.25, v + 0.25, 0.45);
    k.addSeat(u, v, 0.45, 0, -1);
  }
};

/** Carryall：灯光壁龛（一龛一包）、钱包展示桌（一张玻璃面）、墙脚一排行李箱、后墙收银 + 落地镜 */
export const bags: Template = (k) => {
  const { W, D } = k;
  retailRules(k);
  const niche = { palette: APPAREL, height: 2.2, levels: 3, color: '#f5ebe0', item: { w: [0.36, 0.42] as [number, number], h: [0.28, 0.36] as [number, number] } };
  wallShelves(k, { ...niche, door: 'left' });
  frontTables(k, APPAREL, { h: 0.8 });
  glassCase(k, W / 2 - 0.8, 8.4, W / 2 + 0.8, 9.0, { base: '#a0522d', palette: APPAREL });
  place(k, W / 2, 11.0, 1.6, 0.9, () => k.displayTable(W / 2, 11.0, 1.6, 0.9, { palette: APPAREL, h: 0.8 }), 0.3);
  // 行李箱一排（右侧中段，拉杆半拉出）
  for (let v = 6.0; v < 10.0; v += 0.55) {
    const u = wallR(k) - 0.75;
    const col = k.pick(['#e76f51', '#2a9d8f', '#264653', '#e9c46a']);
    k.box(u - 0.15, v - 0.22, u + 0.15, v + 0.22, 0, 0.7, 'prop', col);
    k.box(u - 0.02, v - 0.1, u + 0.02, v + 0.1, 0.7, 0.95, 'metal');
  }
  k.solid(wallR(k) - 0.95, 5.7, wallR(k) - 0.55, 10.0, 0.95);
  cash(k, W / 2, D - 2.8, { back: false });
  k.panel('v', D - 4.4, D - 3.8, wallR(k) - 0.46, -1, 0.05, 1.9, '#dff3f8');
};

/** Knot & Pin：耳环卡墙、旋转塔、托盘桌 + 小台镜、帽子围巾挂钩墙、打耳洞工位、门口收银 */
export const accessories: Template = (k) => {
  const { W, D } = k;
  retailRules(k);
  cash(k, W - 2.3, 4.2, { du: -1, dv: 0, w: 2.0 });
  k.shelf('v', 1.6, D - 4.6, wallL(k), 1, { palette: [...COSMETIC, ...TOYS], height: 2.0, levels: 12, depth: 0.1, item: { w: [0.06, 0.06], h: [0.09, 0.09] } });
  k.shelf('v', 6.2, D - 1.6, wallR(k), -1, { palette: APPAREL, height: 2.1, levels: 4, depth: 0.3, item: { w: [0.25, 0.35], h: [0.15, 0.25] } });
  k.staffDoor(wallR(k) - 0.85);
  k.shelf('u', wallL(k) + 2.4, wallR(k) - 1.7, wallB(k), -1, { palette: COSMETIC, height: 2.0, levels: 6, depth: 0.3 });
  // 旋转塔
  for (const [u, v] of [
    [W * 0.3, 7.0],
    [W * 0.7, 7.0],
    [W * 0.5, 10.2],
  ])
    place(k, u, v, 0.6, 0.6, () => {
      k.box(u - 0.06, v - 0.06, u + 0.06, v + 0.06, 0, 1.8, 'metal');
      for (let h = 0.4; h < 1.7; h += 0.3)
        for (const [du, dv] of [
          [0.22, 0],
          [-0.22, 0],
          [0, 0.22],
          [0, -0.22],
        ])
          k.product(u + du, v + dv, h, 0.06, 0.1, 0.06, true, k.pick([...COSMETIC, ...TOYS]));
      k.solid(u - 0.3, v - 0.3, u + 0.3, v + 0.3, 1.8);
    });
  // 托盘桌 + 小台镜
  for (const u of [W * 0.3, W * 0.7])
    place(k, u, 12.6, 1.2, 0.6, () => {
      k.displayTable(u, 12.6, 1.2, 0.6, { palette: COSMETIC, h: 0.85, color: '#fff3e0' });
      k.box(u - 0.1, 12.55, u + 0.1, 12.6, 0.85, 1.15, 'prop', '#dff3f8');
    });
  // 打耳洞工位：高椅 + 灯泡镜 + 小推车（左后角）
  const pv = D - 3.0;
  k.panel('v', pv - 0.5, pv + 0.5, wallL(k), 1, 1.0, 2.0, '#ffe5ec');
  for (let i = 0; i < 6; i++) k.cyl(wallL(k) + 0.05, pv - 0.45 + i * 0.18, 2.02, 0.04, 0.06, '#fff3b0');
  k.chair(wallL(k) + 0.8, pv, -1, 0, { seatH: 0.65, color: '#e76f51' });
  k.box(wallL(k) + 0.2, pv + 0.8, wallL(k) + 0.6, pv + 1.2, 0, 0.8, 'metal');
  k.solid(wallL(k) + 0.2, pv + 0.8, wallL(k) + 0.6, pv + 1.2, 0.8);
};

// ---------- 8. 书店 / 文具 ----------

/** Margin Books：新书平台（书封朝上 + 推荐卡）、杂志墙、通高书架 + 吊牌、日式岛架、阅读咖啡角、门口收银 + 检索机 */
export const books: Template = (k) => {
  const { W, D } = k;
  const door = k.f.door;
  retailRules(k);
  const spines = { palette: BOOKS, item: { w: [0.03, 0.06] as [number, number], h: [0.18, 0.28] as [number, number] } };
  // 新书平台：平摊成摞，封面朝上（书封图集 4×4），每摞插一张暖黄手写卡
  for (const [tu, tv] of frontTables(k, [], { w: 1.8 })) {
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 2; j++) {
        const u = tu - 0.66 + i * 0.44;
        const v = tv - 0.2 + j * 0.4;
        const th = k.range(0.04, 0.14);
        k.product(u, v, 0.8, 0.3, th, 0.36, true, k.pick(BOOKS));
        k.card('atlas-books', Math.floor(k.rng() * 16), u, v, 0.8 + th, 0, -1, 0.28, 0.34, true);
        if (j === 0) k.product(u + 0.1, v - 0.17, 0.8 + th, 0.1, 0.13, 0.005, true, '#fff3b0');
      }
  }
  // 杂志墙：门内左侧贴着前墙，封面朝里
  k.shelf('u', wallL(k) + 0.2, door.u0 - 0.4, 0.2, 1, { palette: [], height: 1.8, levels: 5, depth: 0.35 });
  for (let l = 0; l < 5; l++) for (let u = wallL(k) + 0.45; u < door.u0 - 0.6; u += 0.42) k.card('atlas-books', Math.floor(k.rng() * 16), u, 0.3, 0.12 + l * 0.34 + 0.15, 0, 1, 0.26, 0.3);
  // 左右墙：通高书架，上方分类吊牌
  k.shelf('v', 1.6, D - 1.6, wallL(k), 1, { ...spines, height: 2.4, levels: 7, depth: 0.32, color: DARK_WOOD });
  k.shelf('v', 1.6, 7.0, wallR(k), -1, { ...spines, height: 2.4, levels: 7, depth: 0.32, color: DARK_WOOD });
  // 中区：日式岛架（下面一层外伸的平台），列间 1.5
  for (const c of [3.2, 5.4, 7.6, 9.8]) {
    if (!place(k, c, 8.6, 1.0, 6.2, () => k.gondola('v', 5.6, 11.6, c, { ...spines, height: 1.5, levels: 5, depth: 0.3, color: DARK_WOOD, base: 0.35 }), 0.3)) continue;
    k.box(c - 0.5, 5.6, c + 0.5, 11.6, 0, 0.35, 'prop', shade(DARK_WOOD, 0.9));
    hangingSign(k, c, 8.6, 1.4, k.pick(BOOKS), false);
  }
  // 右后角：阅读咖啡角（长桌 + 扶手椅 + 小饮品台）
  const ru = W - 4.6;
  const rv = D - 3.2;
  k.table(ru, rv, 3.0, 0.9, { top: '#ddb892', color: DARK_WOOD });
  for (const du of [-1.0, 0, 1.0]) {
    k.chair(ru + du, rv - 0.75, 0, 1, { color: '#a98467' });
    k.chair(ru + du, rv + 0.75, 0, -1, { color: '#a98467' });
  }
  for (const v of [rv - 3.0, rv - 1.9]) k.chair(wallR(k) - 0.6, v, -1, 0, { color: '#7f5539', w: 0.7 });
  k.counter(ru - 1.5, D - 0.9, ru + 1.5, wallB(k), { color: DARK_WOOD, register: false });
  k.staffDoor(wallL(k) + 0.85);
  // 收银：门口右侧 + 检索机
  cash(k, W - 2.3, 4.0, { du: -1, dv: 0, w: 2.0, color: DARK_WOOD });
  k.box(door.u1 + 0.6, 6.0, door.u1 + 1.1, 6.5, 0, 1.2, 'prop', '#3d405b');
  k.solid(door.u1 + 0.6, 6.0, door.u1 + 1.1, 6.5, 1.2);
};

/** Nib & Note：入口侧的纸胶带墙、季节台、矮中岛、试写台、钢笔玻璃柜台 + 高凳、包装台接收银 */
export const stationery: Template = (k) => {
  const { W, D } = k;
  retailRules(k);
  // 纸胶带墙：一卷卷彩色扁圆柱
  const wl = wallL(k);
  k.box(wl, 1.6, wl + 0.06, 6.4, 0.3, 2.3, 'prop', '#fdf0d5');
  k.solid(wl, 1.6, wl + 0.2, 6.4, 2.3);
  for (let h = 0.45; h < 2.2; h += 0.14) for (let v = 1.75; v < 6.3; v += 0.12) k.cyl(wl + 0.1, v, h, 0.045, 0.02, k.pick([...PASTEL, '#ef8354', '#2d3142', '#83c5be']), 'u');
  k.shelf('v', 6.8, D - 1.6, wl, 1, { palette: [...PASTEL, '#ef8354'], height: 2.0, levels: 6, depth: 0.35, item: { w: [0.12, 0.2], h: [0.15, 0.25] } });
  k.shelf('v', 1.6, D - 1.6, wallR(k), -1, { palette: TECH.concat(PASTEL), height: 2.0, levels: 10, depth: 0.15, item: { w: [0.02, 0.03], h: [0.14, 0.16] } });
  frontTables(k, PASTEL, { stacks: true });
  for (const c of [3.0, W - 3.0]) place(k, c, 9.0, 0.9, 4.4, () => k.gondola('v', 6.8, 11.2, c, { palette: [...PASTEL, '#ef8354'], height: 1.35, levels: 3, depth: 0.35 }), 0.3);
  // 试写台：一排笔座和试写纸
  place(k, W / 2, 9.0, 1.2, 0.5, () => {
    k.counter(W / 2 - 0.6, 8.75, W / 2 + 0.6, 9.25, { color: '#ef8354', register: false });
    for (let i = 0; i < 6; i++) k.cyl(W / 2 - 0.5 + i * 0.2, 9.1, 1.0, 0.03, 0.1, '#2d3142');
    k.product(W / 2, 8.95, 1.0, 0.8, 0.005, 0.2, true, '#ffffff');
  });
  // 后区：钢笔玻璃柜台（深色绒）+ 两张高凳，旁边包装台接收银
  const wb = wallB(k);
  glassCase(k, 1.6, wb - 3.6, 4.0, wb - 3.0, { base: '#2d3142', palette: ['#2d3142', '#bfa181', '#7a1f2b'] });
  k.stool(2.3, wb - 4.15, 0, 1);
  k.stool(3.3, wb - 4.15, 0, 1);
  k.staff(2.8, wb - 2.4, 0, -1);
  k.counter(W - 5.2, wb - 3.6, W - 3.4, wb - 3.0, { color: '#fdf0d5', register: false });
  cash(k, W - 2.4, wb - 3.3, { w: 1.6, staff: false });
  k.staffDoor(W / 2);
};

// ---------- 16. 美妆 / 药妆 / 眼镜 ----------

/** Dewdrop：门口排行榜塔、品牌湾（顶上灯条）、试用吧长岛（镜子 + 小水槽）、化妆工位（高椅 + 灯泡镜）、后墙收银 + 小样排队道 */
export const cosmetics: Template = (k) => {
  const { W, D } = k;
  const mid = doorMid(k);
  retailRules(k);
  // 排行榜塔：4 层圆台，偏在主通道一侧
  const tu = mid - 3.0;
  place(k, tu, 3.2, 1.2, 1.2, () => {
    for (let l = 0; l < 4; l++) {
      k.cyl(tu, 3.2, l * 0.45, 0.6 - l * 0.08, 0.06, '#ffffff');
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        k.cyl(tu + Math.cos(a) * (0.45 - l * 0.08), 3.2 + Math.sin(a) * (0.45 - l * 0.08), l * 0.45 + 0.06, 0.04, 0.14, k.pick(COSMETIC));
      }
      k.cyl(tu, 3.2, l * 0.45 + 0.06, 0.08, 0.39, '#ff99c8');
    }
    k.solid(tu - 0.6, 2.6, tu + 0.6, 3.8, 1.8);
  });
  frontTables(k, COSMETIC);
  // 品牌湾（左右墙）+ 顶上品牌灯条
  const bay = { palette: COSMETIC, height: 2.2, levels: 6, depth: 0.45, item: { w: [0.05, 0.09] as [number, number], h: [0.08, 0.16] as [number, number] } };
  k.shelf('v', 1.6, D - 4.6, wallL(k), 1, bay);
  k.shelf('v', 1.6, D - 5.2, wallR(k), -1, bay);
  for (let v = 1.6; v < D - 5; v += 2.4) {
    k.panel('v', v + 0.05, v + 2.35, wallL(k), 1, 2.25, 2.4, k.pick(['#ff99c8', '#fcf6bd', '#cdb4db']));
    k.panel('v', v + 0.05, v + 2.35, wallR(k), -1, 2.25, 2.4, k.pick(['#ff99c8', '#fcf6bd', '#cdb4db']));
  }
  // 试用吧长岛：两面台镜，中间小水槽
  place(k, mid, 7.4, 4.0, 1.0, () => {
    k.displayTable(mid, 7.4, 4.0, 1.0, { palette: COSMETIC, h: 0.95, color: '#ffffff' });
    for (let i = 0; i < 4; i++) {
      const u = mid - 1.5 + i * 1.0;
      k.box(u - 0.15, 7.38, u + 0.15, 7.42, 0.95, 1.35, 'prop', '#dff3f8');
    }
    k.box(mid - 0.2, 7.2, mid + 0.2, 7.6, 0.93, 0.96, 'metal');
  }, 0.4);
  for (const c of [3.6, W - 3.6]) place(k, c, 8.6, 0.9, 3.6, () => k.gondola('v', 6.8, 10.4, c, { palette: COSMETIC, height: 1.35, levels: 3, depth: 0.35 }), 0.3);
  // 化妆工位：三张高椅面向右墙的灯泡镜
  const wr = wallR(k);
  for (let i = 0; i < 3; i++) {
    const v = D - 4.6 + i * 1.1;
    k.panel('v', v - 0.4, v + 0.4, wr, -1, 1.0, 2.0, '#fff3e0');
    for (let j = 0; j < 4; j++) k.cyl(wr - 0.05, v - 0.36 + j * 0.24, 2.02, 0.04, 0.06, '#fff3b0');
    k.box(wr - 0.4, v - 0.45, wr, v + 0.45, 0, 0.85, 'prop', '#ffffff');
    k.solid(wr - 0.4, v - 0.45, wr, v + 0.45, 0.85);
    k.chair(wr - 0.95, v, 1, 0, { seatH: 0.72, color: '#ff99c8' });
  }
  // 后墙收银，前面一条用小样筐夹出来的排队道
  cash(k, mid, D - 2.8, { w: 2.6, reserveFront: false });
  for (let v = D - 5.4; v < D - 3.6; v += 0.6)
    for (const du of [-0.9, 0.9]) {
      k.box(mid + du - 0.2, v - 0.15, mid + du + 0.2, v + 0.15, 0, 1.0, 'prop', '#ffe5ec');
      k.solid(mid + du - 0.2, v - 0.15, mid + du + 0.2, v + 0.15, 1.0);
    }
  k.staffDoor(wallL(k) + 0.85);
};

/** Daily Dose：门口两侧花车（亮黄 POP）、前区化妆品中岛、6–8 列货架 + 吊牌、饮料冷柜墙、最里面的药剂师柜台 + 候药椅、门口收银 */
export const drugstore: Template = (k) => {
  const { W, D } = k;
  const door = k.f.door;
  retailRules(k);
  const goods = [...COSMETIC, ...PANTRY];
  // 花车：门面两侧各 2 m
  for (const u of [door.u0 + 0.2, door.u0 + 1.0, door.u1 - 1.0, door.u1 - 0.2].map((x) => x + (x < W / 2 ? 0.3 : -0.3))) {
    k.box(u - 0.35, 0.5, u + 0.35, 1.1, 0, 0.75, 'metal');
    for (let i = 0; i < 6; i++) k.product(u - 0.25 + (i % 3) * 0.25, 0.65 + Math.floor(i / 3) * 0.3, 0.75, 0.2, k.range(0.1, 0.25), 0.2, true, k.pick(goods));
    k.box(u - 0.15, 0.48, u + 0.15, 0.5, 0.9, 1.1, 'prop', '#ffe600');
    k.solid(u - 0.35, 0.5, u + 0.35, 1.1, 1.1);
  }
  // 收银：门口左侧，店员面朝店里
  cash(k, 2.4, 3.6, { dv: 1, w: 2.0 });
  cash(k, 4.8, 3.6, { dv: 1, w: 2.0, staff: false });
  // 前区：化妆品中岛（带试用）
  place(k, door.u1 + 1.6, 4.4, 2.4, 1.0, () => k.displayTable(door.u1 + 1.6, 4.4, 2.4, 1.0, { palette: COSMETIC, h: 0.95, color: '#ffffff' }), 0.3);
  // 中区：货架列 + 吊牌
  for (let c = 3.2; c < W - 3.2; c += 2.8)
    if (place(k, c, 10.0, 1.0, 7.0, () => k.gondola('v', 6.5, 13.5, c, { palette: goods, height: 1.65, levels: 5, depth: 0.45, item: { w: [0.06, 0.16], h: [0.1, 0.2] } }), 0.3))
      hangingSign(k, c, 10.0, 0.9, '#06d6a0', false);
  // 饮料冷柜墙（右墙）
  k.fridge('v', 5.0, D - 4.0, wallR(k), -1, DRINKS);
  // 后墙：药剂师柜台（背后药品格子柜）+ 候药椅 + 咨询小间
  const wb = wallB(k);
  const pu = W / 2;
  k.box(pu - 2.4, wb - 0.4, pu + 2.4, wb, 0, 2.4, 'prop', '#f8f9fa');
  for (let i = 0; i < 12; i++) for (let j = 0; j < 6; j++) k.box(pu - 2.3 + i * 0.4, wb - 0.42, pu - 1.95 + i * 0.4, wb - 0.4, 0.2 + j * 0.37, 0.52 + j * 0.37, 'prop', '#e9ecef');
  k.solid(pu - 2.4, wb - 0.4, pu + 2.4, wb, 2.4);
  k.counter(pu - 2.0, wb - 2.2, pu + 2.0, wb - 1.5, { color: '#06d6a0' });
  for (let i = 0; i < 5; i++) k.chair(pu - 4.6 + i * 0.6, wb - 3.6, 0, 1, { color: '#adb5bd' });
  k.box(pu + 3.0, wb - 2.0, pu + 4.9, wb, 0, 2.2, 'prop', '#e9ecef');
  k.solid(pu + 3.0, wb - 2.0, pu + 4.9, wb, 2.2);
  k.backFeature = true;
};

/** Framewise：满墙镜框格子、圆形分层镜架台 + 台镜、配镜柜台 + 高凳、玻璃后的磨片机、验光区 + 视力表、等候沙发 */
export const eyewear: Template = (k) => {
  const { W, D } = k;
  retailRules(k);
  const frames = { palette: [...TECH, '#a8dadc', '#e76f51'], height: 2.0, levels: 8, depth: 0.3, item: { w: [0.14, 0.14] as [number, number], h: [0.05, 0.05] as [number, number] } };
  k.shelf('v', 1.6, D - 6.0, wallL(k), 1, frames);
  k.shelf('v', 1.6, D - 7.0, wallR(k), -1, frames);
  // 圆形分层镜架台
  for (const u of [W * 0.27, W * 0.73])
    place(k, u, 7.4, 1.6, 1.6, () => {
      k.cyl(u, 7.4, 0, 0.8, 0.75, '#f1faee');
      k.cyl(u, 7.4, 0.75, 0.5, 0.2, '#a8dadc');
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        k.product(u + Math.cos(a) * 0.65, 7.4 + Math.sin(a) * 0.65, 0.75, 0.14, 0.04, 0.05, true, k.pick(TECH));
      }
      k.box(u - 0.12, 7.38, u + 0.12, 7.42, 0.95, 1.3, 'prop', '#dff3f8');
      k.solid(u - 0.8, 6.6, u + 0.8, 8.2, 0.95);
    });
  // 后区：配镜柜台 + 三张高凳；柜台后玻璃隔开的磨片工坊
  const wb = wallB(k);
  cash(k, W / 2, wb - 4.4, { w: 3.0, back: false, reserveFront: false });
  for (const du of [-0.9, 0, 0.9]) k.stool(W / 2 + du, wb - 5.25, 0, 1);
  k.box(W / 2 - 2.5, wb - 2.6, W / 2 + 2.5, wb - 2.55, 0, 2.4, 'glass');
  k.solid(W / 2 - 2.5, wb - 2.62, W / 2 + 2.5, wb - 2.53, 2.4);
  for (const du of [-1.0, 1.0]) {
    k.box(W / 2 + du - 0.3, wb - 1.0, W / 2 + du + 0.3, wb - 0.5, 0, 0.9, 'prop', '#e9ecef');
    k.box(W / 2 + du - 0.25, wb - 0.95, W / 2 + du + 0.25, wb - 0.55, 0.9, 1.4, 'prop', '#1d3557');
  }
  // 验光区：验光仪 + 椅子；墙上视力表灯箱
  const eu = wallL(k) + 0.7;
  const ev = wb - 3.4;
  k.box(eu - 0.4, ev - 0.35, eu + 0.4, ev + 0.35, 0, 0.75, 'prop', '#f1faee');
  k.box(eu - 0.25, ev - 0.25, eu + 0.25, ev + 0.25, 0.75, 1.3, 'prop', '#1d3557');
  k.solid(eu - 0.4, ev - 0.35, eu + 0.4, ev + 0.35, 1.3);
  k.chair(eu + 0.75, ev, -1, 0, { color: '#1d3557' });
  k.panel('v', ev - 2.0, ev - 1.5, wallL(k), 1, 1.0, 1.9, '#ffffff');
  // 等候沙发
  k.sofa('v', wb - 6.4, wb - 4.6, wallR(k), -1, 0, '#457b9d');
  k.staffDoor(wallR(k) - 0.85);
};

// ---------- 17. 超市 ----------

/**
 * Daily Harvest（日本 AEON 式）：门的左半入口、右半出口挨着收银线；顺时针环线——
 * 西侧前区和西墙青果，后墙鲜鱼→精肉（墙上作业间玻璃窗），东墙日配和惣菜，最后回到收银。
 * 中区南北向货架列 + 吊牌，东北角冷冻岛柜；收银线后面是一排装袋台。
 */
export const supermarket: Template = (k) => {
  const { W } = k;
  const door = k.f.door;
  const entry = door.u0 + 5;
  k.reserve(door.u0, 0, door.u1, 2.4);
  // 入口内侧篮子架
  for (let i = 0; i < 3; i++) {
    const u = door.u0 + 0.5 + i * 0.6;
    k.product(u, 2.9, 0, 0.5, 0.75, 0.35, true, ['#e63946', '#ffd166', '#e63946'][i]);
  }
  k.solid(door.u0 + 0.2, 2.7, door.u0 + 2.0, 3.1, 0.75);
  // 收银线：出口往东 8 条，每条后面一台自助结算机；收银线和南墙之间是装袋台
  const lane0 = door.u1 + 0.6;
  const lanes = Math.min(8, Math.floor((W - 2 - lane0) / 2.3));
  for (let i = 0; i < lanes; i++) {
    const u = lane0 + i * 2.3;
    k.counter(u, 3.2, u + 0.8, 5.2, { color: '#2d6a4f', top: '#e9edc9', register: false });
    k.box(u + 0.2, 4.0, u + 0.6, 4.4, 0.85, 1.2, 'prop', '#2b2d42');
    k.box(u + 0.25, 4.6, u + 0.55, 4.9, 1.0, 1.9, 'metal');
    k.box(u + 0.1, 4.6, u + 0.7, 4.9, 1.9, 2.15, 'prop', '#ffd166');
    k.box(u + 0.95, 2.2, u + 1.45, 2.7, 0, 1.3, 'prop', '#e9e2d4');
    k.solid(u + 0.95, 2.2, u + 1.45, 2.7, 1.3);
  }
  k.staff(lane0 + 1.25, 4.4, -1, 0);
  for (let u = lane0 + 2.4; u < lane0 + lanes * 2.3 - 2.0; u += 3.4) {
    k.box(u, 0.25, u + 3.0, 0.85, 0, 0.85, 'prop', '#e9e2d4');
    k.solid(u, 0.25, u + 3.0, 0.85, 0.85);
  }
  // 出口旁服务柜台
  k.counter(door.u1 + 0.4, 0.4, door.u1 + 2.0, 1.0, { color: '#2d6a4f' });
  // 西侧前区青果：斜面台（前低后高），后面贴西墙的敞开冷柜
  grid(2.2, entry - 6.0, 2.8, 8.0, 3.2, 2.4, (u, v) =>
    place(k, u, v, 2.0, 1.0, () => {
      k.box(u - 1.0, v - 0.5, u + 1.0, v + 0.5, 0, 0.7, 'prop', '#8d6e63');
      k.box(u - 1.0, v, u + 1.0, v + 0.5, 0.7, 0.85, 'prop', '#8d6e63');
      for (let i = 0; i < 6; i++)
        for (let j = 0; j < 2; j++) k.cyl(u - 0.85 + i * 0.34, v - 0.25 + j * 0.5, 0.7 + j * 0.15, 0.13, 0.14, k.pick(FRUIT));
      k.solid(u - 1.0, v - 0.5, u + 1.0, v + 0.5, 0.85);
    }, 0.5),
  );
  const wl = wallL(k);
  const wr = wallR(k);
  const wb = wallB(k);
  k.fridge('v', 1.2, 12.0, wl, 1, FRUIT);
  // 后墙：鲜鱼 → 精肉（白托盘），上方作业间玻璃窗
  k.fridge('u', wl + 0.2, wr - 2.6, wb, -1, ['#ffffff', '#f1faee', '#ffb4a2', '#e5989b', '#a8dadc']);
  for (let u = 6; u < W - 8; u += 9) k.box(u, wb - 0.01, u + 1.5, wb, 2.4, 3.4, 'glass');
  k.staffDoor(wr - 1.4);
  // 东墙：日配 + 惣菜/便当（玻璃罩平台）+ 面包架
  k.fridge('v', 13.0, wb - 2.0, wr, -1, ['#ffffff', '#fefae0', '#f1faee', '#e9c46a']);
  for (const v of [8.2, 10.6]) {
    k.box(wr - 1.0, v - 1.2, wr, v + 1.2, 0, 0.9, 'prop', '#e9e2d4');
    k.box(wr - 1.0, v - 1.2, wr, v + 1.2, 0.9, 1.15, 'glass');
    for (let i = 0; i < 8; i++) k.product(wr - 0.5, v - 1.05 + i * 0.3, 0.9, 0.25, 0.06, 0.2, false, k.pick(['#f4a261', '#e9c46a', '#90be6d', '#ffffff']));
    k.solid(wr - 1.0, v - 1.2, wr, v + 1.2, 1.15);
  }
  k.shelf('v', 12.6, 13.0, wl, 1, { palette: BREAD, height: 1.6, levels: 4 });
  // 中区：南北向货架列（端架朝主通道）+ 吊牌
  for (let c = 8.0; c < W - 16; c += 3.0) {
    if (place(k, c, 16.0, 0.9, 12.4, () => k.gondola('v', 9.8, 22.2, c, { palette: PANTRY, height: 1.6 }), 0.2)) hangingSign(k, c, 16.0, 0.9, '#2d6a4f', false);
  }
  // 东北角：冷冻岛柜（两台对拼，上面盖玻璃）
  for (let c = W - 13; c < W - 4; c += 3.0)
    place(k, c, 16.5, 2.0, 5.0, () => {
      k.box(c - 1.0, 14.0, c + 1.0, 19.0, 0, 0.75, 'prop', '#e9ecef');
      k.box(c - 1.0, 14.0, c + 1.0, 19.0, 0.75, 0.85, 'glass');
      for (let v = 14.3; v < 18.8; v += 0.4) for (const du of [-0.5, 0, 0.5]) k.product(c + du, v, 0.55, 0.3, 0.18, 0.3, true, k.pick(['#ffffff', '#bde0fe', '#e63946', '#ffd166']));
      k.solid(c - 1.0, 14.0, c + 1.0, 19.0, 0.85);
    }, 0.3);
};

// ---------- 19. 小服务店 ----------

/** Mend Spot：前区等候长凳、横跨店宽的服务柜台、钥匙坯墙 + 配钥匙机 + 打磨机、后面改衣区（缝纫机桌 + 待取挂杆） */
export const repair: Template = (k) => {
  const { W, D } = k;
  k.reserve(k.f.door.u0, 0, k.f.door.u1, 2.0);
  k.bench('v', 0.8, 3.0, wallL(k) + 0.25, 1, 0, { color: '#adb5bd' });
  k.panel('v', 1.0, 2.6, wallR(k), -1, 1.2, 2.2, '#f8f9fa');
  // 服务柜台（右边留 0.9 m 员工侧门）
  k.counter(wallL(k), 3.5, wallR(k) - 0.95, 4.1, { color: '#6c757d' });
  k.staff(W / 2 - 0.4, 4.7, 0, -1);
  k.box(wallL(k), 4.4, wallL(k) + 0.08, 6.8, 0.9, 2.1, 'prop', '#f8f9fa');
  for (let h = 1.0; h < 2.0; h += 0.12) for (let v = 4.5; v < 6.7; v += 0.1) k.product(wallL(k) + 0.12, v, h, 0.03, 0.06, 0.02, false, k.pick(['#c0c0c0', '#d4af37', '#b87333']));
  k.counter(wallL(k), 4.6, wallL(k) + 0.6, 6.6, { color: '#495057', register: false });
  k.box(wallR(k) - 1.3, 5.2, wallR(k) - 0.1, 5.8, 0, 1.0, 'prop', '#495057');
  for (let i = 0; i < 3; i++) k.cyl(wallR(k) - 1.1 + i * 0.4, 5.15, 1.15, 0.1, 0.05, '#8d6e63', 'v');
  k.solid(wallR(k) - 1.3, 5.2, wallR(k) - 0.1, 5.8, 1.2);
  // 改衣区：缝纫机桌 + 椅子，待取挂杆，待修鞋架
  for (const v of [8.0, 10.2]) {
    k.table(W * 0.35, v, 1.2, 0.6, { top: '#f8f9fa', color: '#6c757d', h: 0.75 });
    k.box(W * 0.35 - 0.25, v - 0.15, W * 0.35 + 0.15, v + 0.15, 0.75, 1.05, 'prop', '#3d405b');
    k.chair(W * 0.35, v + 0.65, 0, -1, { color: '#6c757d' });
  }
  k.rack('v', 7.4, 11.4, wallR(k) - 0.6, { palette: APPAREL });
  k.shelf('u', wallL(k), wallR(k) - 1.7, wallB(k), -1, { palette: ['#6d4c41', '#3e2723', '#8d6e63'], height: 1.5, levels: 6, depth: 0.35 });
  k.staffDoor(wallR(k) - 0.85);
  void D;
};
