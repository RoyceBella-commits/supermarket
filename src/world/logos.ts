import type { ShopCategory, ShopDef } from '../data/layoutTypes.ts';

// 原创店铺 logo：圆形徽章里画一个品类小图标 + 按品类风格排版的英文字标。
// 全部用 Canvas 2D 路径画，不用任何现成商标或字体图标。图标在 100×100 的格子里设计，
// 主体落在以 (50,50) 为圆心、半径约 32 的安全区内。

type Ctx = CanvasRenderingContext2D;
type Icon = (g: Ctx, ink: string, paper: string) => void;

const TAU = Math.PI * 2;

function rr(g: Ctx, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}
function circle(g: Ctx, x: number, y: number, r: number) {
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
}
function poly(g: Ctx, ...p: number[]) {
  g.beginPath();
  g.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
  g.closePath();
}
function star(g: Ctx, cx: number, cy: number, R: number, r: number, n = 5) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const k = i % 2 ? r : R;
    g.lineTo(cx + Math.cos(a) * k, cy + Math.sin(a) * k);
  }
  g.closePath();
}
function line(g: Ctx, color: string, w: number, ...p: number[]) {
  g.strokeStyle = color;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
  g.stroke();
}
function fill(g: Ctx, color: string) {
  g.fillStyle = color;
  g.fill();
}
function stroke(g: Ctx, color: string, w: number) {
  g.strokeStyle = color;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.stroke();
}
function heart(g: Ctx, cx: number, cy: number, s: number) {
  g.beginPath();
  g.moveTo(cx, cy + s * 0.9);
  g.bezierCurveTo(cx - s * 1.6, cy - s * 0.2, cx - s * 0.6, cy - s * 1.3, cx, cy - s * 0.45);
  g.bezierCurveTo(cx + s * 0.6, cy - s * 1.3, cx + s * 1.6, cy - s * 0.2, cx, cy + s * 0.9);
  g.closePath();
}

// ---------- 可复用的图形 ----------
const bowl = (g: Ctx, ink: string) => {
  g.beginPath();
  g.arc(50, 52, 27, 0, Math.PI);
  g.closePath();
  fill(g, ink);
  rr(g, 20, 48, 60, 6, 3);
  fill(g, ink);
};
const cup = (g: Ctx, ink: string) => {
  poly(g, 30, 40, 70, 40, 65, 78, 35, 78);
  fill(g, ink);
};
const tee = (g: Ctx, ink: string) => {
  poly(g, 30, 30, 42, 25, 50, 32, 58, 25, 70, 30, 82, 44, 71, 51, 68, 47, 68, 78, 32, 78, 32, 47, 29, 51, 18, 44);
  fill(g, ink);
};
const camera = (g: Ctx, ink: string, paper: string) => {
  rr(g, 18, 36, 64, 40, 7);
  fill(g, ink);
  rr(g, 38, 28, 22, 11, 3);
  fill(g, ink);
  circle(g, 50, 56, 13);
  fill(g, paper);
  circle(g, 50, 56, 7.5);
  fill(g, ink);
  circle(g, 71, 44, 3);
  fill(g, paper);
};

const ICONS: Partial<Record<ShopCategory, Icon>> = {
  supermarket: (g, ink, paper) => {
    g.beginPath();
    g.arc(50, 46, 19, Math.PI, TAU);
    stroke(g, ink, 6);
    poly(g, 20, 46, 80, 46, 71, 79, 29, 79);
    fill(g, ink);
    for (const x of [38, 50, 62]) line(g, paper, 3.5, x, 53, x, 72);
  },
  consoles: (g, ink, paper) => {
    rr(g, 16, 36, 68, 32, 16);
    fill(g, ink);
    g.fillStyle = paper;
    g.fillRect(27, 49, 14, 5);
    g.fillRect(31.5, 44.5, 5, 14);
    circle(g, 63, 47, 4);
    fill(g, paper);
    circle(g, 71, 55, 4);
    fill(g, paper);
  },
  devices: (g, ink, paper) => {
    g.save();
    g.translate(50, 50);
    g.rotate(-0.42);
    g.beginPath();
    g.ellipse(0, 0, 34, 11, 0, Math.PI, TAU);
    stroke(g, ink, 5);
    circle(g, 0, 0, 16);
    fill(g, ink);
    g.beginPath();
    g.ellipse(0, 0, 34, 11, 0, 0, Math.PI);
    stroke(g, paper, 9);
    g.beginPath();
    g.ellipse(0, 0, 34, 11, 0, 0, Math.PI);
    stroke(g, ink, 5);
    g.restore();
  },
  bricks: (g, ink, paper) => {
    for (const x of [33, 67]) {
      g.fillStyle = ink;
      g.fillRect(x - 8, 34, 16, 10);
      g.beginPath();
      g.ellipse(x, 34, 8, 3, 0, 0, TAU);
      fill(g, ink);
      g.beginPath();
      g.ellipse(x, 34, 5, 1.6, 0, 0, TAU);
      g.globalAlpha = 0.45;
      fill(g, paper);
      g.globalAlpha = 1;
    }
    rr(g, 18, 43, 64, 33, 4);
    fill(g, ink);
  },
  camera,
  photoBooth: (g, ink, paper) => {
    rr(g, 27, 20, 46, 58, 4);
    fill(g, ink);
    rr(g, 32, 25, 36, 36, 2);
    fill(g, paper);
    circle(g, 50, 43, 8);
    fill(g, ink);
    star(g, 64, 30, 5, 2, 4);
    fill(g, ink);
  },
  blindbox: (g, ink, paper) => {
    rr(g, 26, 44, 48, 34, 3);
    fill(g, ink);
    rr(g, 21, 34, 58, 12, 3);
    fill(g, ink);
    star(g, 50, 61, 11, 4.8);
    fill(g, paper);
    line(g, ink, 4, 50, 34, 44, 24);
    line(g, ink, 4, 50, 34, 56, 24);
  },
  fanmerch: (g, ink, paper) => {
    star(g, 50, 53, 32, 14);
    fill(g, ink);
    heart(g, 50, 53, 6.5);
    fill(g, paper);
  },
  menswear: (g, ink, paper) => {
    tee(g, ink);
    poly(g, 50, 33, 54.5, 39, 51.5, 43, 55.5, 64, 50, 71, 44.5, 64, 48.5, 43, 45.5, 39);
    fill(g, paper);
  },
  kidswear: (g, ink, paper) => {
    tee(g, ink);
    heart(g, 50, 56, 8);
    fill(g, paper);
  },
  womenswear: (g, ink, paper) => {
    poly(g, 41, 22, 46, 22, 50, 29, 54, 22, 59, 22, 61, 40, 56, 47, 78, 80, 22, 80, 44, 47, 39, 40);
    fill(g, ink);
    g.fillStyle = paper;
    g.fillRect(43, 45, 14, 3);
  },
  stationery: (g, ink, paper) => {
    poly(g, 50, 18, 69, 48, 62, 72, 38, 72, 31, 48);
    fill(g, ink);
    rr(g, 37, 72, 26, 9, 2);
    fill(g, ink);
    line(g, paper, 3, 50, 50, 50, 70);
    circle(g, 50, 47, 4.5);
    fill(g, paper);
  },
  cafe: (g, ink, paper) => {
    cup(g, ink);
    g.beginPath();
    g.arc(68, 56, 9, -Math.PI / 2, Math.PI / 2);
    stroke(g, ink, 6);
    rr(g, 22, 79, 56, 5, 2.5);
    fill(g, ink);
    for (const x of [42, 56]) {
      g.beginPath();
      g.moveTo(x, 34);
      g.bezierCurveTo(x - 6, 29, x + 6, 25, x, 19);
      stroke(g, ink, 4);
    }
    line(g, paper, 3, 36, 50, 64, 50);
  },
  books: (g, ink, paper) => {
    poly(g, 50, 34, 22, 27, 22, 72, 50, 78);
    fill(g, ink);
    poly(g, 50, 34, 78, 27, 78, 72, 50, 78);
    fill(g, ink);
    line(g, paper, 3, 50, 35, 50, 76);
    for (const y of [42, 51, 60]) {
      line(g, paper, 2.2, 28, y - 4, 44, y);
      line(g, paper, 2.2, 56, y, 72, y - 4);
    }
  },
  karting: (g, ink) => {
    line(g, ink, 5, 27, 20, 27, 82);
    const x0 = 30;
    const y0 = 22;
    const s = 11;
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 4; c++) {
        if ((r + c) % 2) continue;
        g.fillStyle = ink;
        g.fillRect(x0 + c * s, y0 + r * s + Math.sin(c * 0.9) * 2, s, s);
      }
    g.strokeStyle = ink;
    g.lineWidth = 2.5;
    g.strokeRect(x0, y0, s * 4, s * 3 + 2);
  },
  arcade: (g, ink, paper) => {
    circle(g, 50, 50, 25);
    fill(g, ink);
    circle(g, 50, 50, 18);
    stroke(g, paper, 3);
    star(g, 50, 50, 10, 4.4);
    fill(g, paper);
    g.save();
    g.translate(50, 50);
    g.rotate(-0.35);
    g.beginPath();
    g.ellipse(0, 0, 36, 9, 0, 0, Math.PI);
    stroke(g, ink, 4);
    g.restore();
  },
  vr: (g, ink, paper) => {
    rr(g, 16, 37, 68, 30, 12);
    fill(g, ink);
    circle(g, 36, 52, 8);
    fill(g, paper);
    circle(g, 64, 52, 8);
    fill(g, paper);
    poly(g, 45, 68, 55, 68, 50, 60);
    fill(g, paper);
    line(g, ink, 5, 16, 46, 9, 44);
    line(g, ink, 5, 84, 46, 91, 44);
  },
  sports: (g, ink) => {
    g.beginPath();
    g.arc(50, 64, 29, Math.PI * 1.08, Math.PI * 1.92);
    stroke(g, ink, 10);
    circle(g, 50, 63, 9);
    fill(g, ink);
  },
  running: (g, ink, paper) => {
    poly(g, 22, 64, 30, 42, 43, 45, 50, 55, 74, 58, 81, 66, 81, 72, 22, 72);
    fill(g, ink);
    line(g, paper, 3, 22, 67, 81, 67);
    for (const x of [36, 42]) line(g, paper, 2.5, x, 47, x + 4, 52);
    line(g, ink, 3.5, 10, 50, 20, 50);
    line(g, ink, 3.5, 13, 58, 21, 58);
  },
  shoes: (g, ink) => {
    // 高跟鞋：后跟高、鞋尖低，细跟
    poly(g, 24, 38, 33, 38, 46, 52, 62, 61, 80, 63, 83, 72, 57, 72, 42, 63, 37, 61, 36, 81, 31, 81, 29, 56, 24, 50);
    fill(g, ink);
  },
  badminton: (g, ink, paper) => {
    poly(g, 40, 64, 27, 24, 73, 24, 60, 64);
    fill(g, ink);
    for (const [a, b] of [
      [44, 38],
      [50, 50],
      [56, 62],
    ])
      line(g, paper, 2.5, a, 62, b, 28);
    g.beginPath();
    g.arc(50, 66, 11, 0, Math.PI);
    g.lineTo(39, 64);
    g.closePath();
    fill(g, ink);
  },
  garden: (g, ink, paper) => {
    g.beginPath();
    g.moveTo(25, 75);
    g.quadraticCurveTo(25, 25, 75, 25);
    g.quadraticCurveTo(75, 75, 25, 75);
    fill(g, ink);
    line(g, paper, 3, 30, 70, 64, 36);
    line(g, paper, 2.2, 44, 56, 44, 44);
    line(g, paper, 2.2, 52, 48, 60, 48);
  },
  cinema: (g, ink, paper) => {
    circle(g, 50, 50, 28);
    fill(g, ink);
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * TAU) / 5;
      circle(g, 50 + Math.cos(a) * 15, 50 + Math.sin(a) * 15, 6);
      fill(g, paper);
    }
    circle(g, 50, 50, 3.5);
    fill(g, paper);
  },
  foodcourt: (g, ink) => {
    bowl(g, ink);
    line(g, ink, 4, 56, 44, 78, 20);
    line(g, ink, 4, 62, 46, 84, 28);
    for (const x of [34, 44]) {
      g.beginPath();
      g.moveTo(x, 42);
      g.bezierCurveTo(x - 5, 36, x + 5, 32, x, 26);
      stroke(g, ink, 3.5);
    }
  },
  ramen: (g, ink, paper) => {
    bowl(g, ink);
    for (const y of [60, 67]) {
      g.beginPath();
      g.moveTo(32, y);
      for (let x = 32; x <= 68; x += 6) g.quadraticCurveTo(x + 1.5, y - 4, x + 3, y), g.quadraticCurveTo(x + 4.5, y + 4, x + 6, y);
      stroke(g, paper, 2.2);
    }
    line(g, ink, 4, 58, 44, 76, 18);
    line(g, ink, 4, 64, 46, 82, 24);
  },
  curry: (g, ink, paper) => {
    g.beginPath();
    g.ellipse(50, 60, 32, 13, 0, 0, TAU);
    fill(g, ink);
    g.beginPath();
    g.ellipse(42, 56, 14, 7, 0, 0, TAU);
    fill(g, paper);
    line(g, ink, 4.5, 60, 50, 80, 30);
    g.beginPath();
    g.ellipse(80, 28, 5, 3.5, -0.8, 0, TAU);
    fill(g, ink);
  },
  sushi: (g, ink, paper) => {
    rr(g, 22, 56, 56, 18, 9);
    fill(g, ink);
    g.beginPath();
    g.ellipse(50, 50, 31, 10, -0.05, 0, TAU);
    fill(g, ink);
    line(g, paper, 3, 21, 56, 79, 54);
    for (const x of [38, 50, 62]) line(g, paper, 2.2, x - 3, 45, x + 3, 53);
  },
  bubbleTea: (g, ink, paper) => {
    poly(g, 32, 34, 68, 34, 63, 82, 37, 82);
    fill(g, ink);
    rr(g, 29, 30, 42, 6, 3);
    fill(g, ink);
    line(g, ink, 5, 56, 32, 64, 14);
    for (const [x, y] of [
      [42, 74],
      [50, 76],
      [58, 74],
      [46, 68],
      [55, 68],
    ]) {
      circle(g, x, y, 3.2);
      fill(g, paper);
    }
  },
  juiceBar: (g, ink, paper) => {
    poly(g, 32, 36, 68, 36, 63, 80, 37, 80);
    fill(g, ink);
    line(g, ink, 4.5, 56, 36, 66, 16);
    circle(g, 50, 57, 10);
    fill(g, paper);
    for (let i = 0; i < 6; i++) {
      const a = (i * TAU) / 6;
      line(g, ink, 1.6, 50, 57, 50 + Math.cos(a) * 8, 57 + Math.sin(a) * 8);
    }
  },
  italian: (g, ink, paper) => {
    poly(g, 50, 82, 25, 30, 75, 30);
    fill(g, ink);
    g.beginPath();
    g.moveTo(23, 30);
    g.quadraticCurveTo(50, 18, 77, 30);
    stroke(g, ink, 7);
    for (const [x, y] of [
      [44, 42],
      [57, 46],
      [49, 60],
    ]) {
      circle(g, x, y, 4.5);
      fill(g, paper);
    }
  },
  grill: (g, ink, paper) => {
    g.beginPath();
    g.moveTo(50, 18);
    g.bezierCurveTo(70, 38, 78, 50, 72, 64);
    g.bezierCurveTo(66, 80, 34, 80, 28, 64);
    g.bezierCurveTo(24, 52, 34, 46, 38, 36);
    g.bezierCurveTo(42, 44, 46, 46, 48, 46);
    g.bezierCurveTo(46, 36, 48, 26, 50, 18);
    fill(g, ink);
    g.beginPath();
    g.moveTo(50, 50);
    g.bezierCurveTo(60, 58, 62, 66, 58, 71);
    g.bezierCurveTo(54, 76, 46, 76, 42, 71);
    g.bezierCurveTo(40, 64, 46, 60, 50, 50);
    fill(g, paper);
  },
  sweets: (g, ink, paper) => {
    poly(g, 32, 56, 68, 56, 62, 80, 38, 80);
    fill(g, ink);
    for (const x of [44, 50, 56]) line(g, paper, 2, x, 59, x - (x - 50) * 0.1, 77);
    circle(g, 39, 50, 10);
    fill(g, ink);
    circle(g, 61, 50, 10);
    fill(g, ink);
    circle(g, 50, 41, 12);
    fill(g, ink);
    line(g, paper, 3, 32, 55, 68, 55);
    circle(g, 50, 26, 4.5);
    fill(g, ink);
  },
  crepes: (g, ink, paper) => {
    circle(g, 50, 38, 15);
    fill(g, ink);
    poly(g, 33, 46, 67, 46, 50, 84);
    fill(g, ink);
    line(g, paper, 3, 33, 46, 67, 46);
    line(g, paper, 2, 40, 52, 56, 70);
    line(g, paper, 2, 60, 52, 44, 70);
  },
  deli: (g, ink, paper) => {
    // 沙拉碗：碗上冒出几片叶子
    for (const [x, y, rot] of [
      [36, 40, -0.6],
      [50, 34, 0],
      [64, 40, 0.6],
    ]) {
      g.beginPath();
      g.ellipse(x, y, 8, 15, rot, 0, TAU);
      fill(g, ink);
      line(g, paper, 2, x - Math.sin(rot) * 9, y + Math.cos(rot) * 9, x + Math.sin(rot) * 9, y - Math.cos(rot) * 9);
    }
    rr(g, 18, 47, 64, 6, 3);
    fill(g, paper);
    bowl(g, ink);
  },
  bakery: (g, ink, paper) => {
    g.beginPath();
    g.moveTo(20, 72);
    g.lineTo(20, 54);
    g.bezierCurveTo(20, 28, 80, 28, 80, 54);
    g.lineTo(80, 72);
    g.closePath();
    fill(g, ink);
    for (const x of [34, 48, 62]) line(g, paper, 3.5, x, 45, x + 7, 57);
  },
  cards: (g, ink, paper) => {
    g.save();
    g.translate(42, 52);
    g.rotate(-0.28);
    rr(g, -14, -20, 28, 40, 4);
    fill(g, ink);
    g.restore();
    g.save();
    g.translate(58, 50);
    g.rotate(0.2);
    rr(g, -14, -20, 28, 40, 4);
    fill(g, ink);
    stroke(g, paper, 3);
    poly(g, 0, -9, 7, 0, 0, 9, -7, 0);
    fill(g, paper);
    g.restore();
  },
  plush: (g, ink, paper) => {
    circle(g, 32, 34, 9.5);
    fill(g, ink);
    circle(g, 68, 34, 9.5);
    fill(g, ink);
    circle(g, 50, 54, 25);
    fill(g, ink);
    g.beginPath();
    g.ellipse(50, 63, 10, 7.5, 0, 0, TAU);
    fill(g, paper);
    circle(g, 50, 60, 2.8);
    fill(g, ink);
    circle(g, 41, 50, 3);
    fill(g, paper);
    circle(g, 59, 50, 3);
    fill(g, paper);
  },
  phoneAccessories: (g, ink, paper) => {
    rr(g, 34, 19, 32, 62, 7);
    fill(g, ink);
    rr(g, 38, 26, 24, 44, 2);
    fill(g, paper);
    circle(g, 50, 75.5, 2.5);
    fill(g, paper);
    heart(g, 50, 46, 5.5);
    fill(g, ink);
  },
  capsuleToys: (g, ink, paper) => {
    g.beginPath();
    g.arc(50, 52, 26, 0, Math.PI);
    g.closePath();
    fill(g, ink);
    circle(g, 50, 52, 26);
    stroke(g, ink, 5);
    line(g, ink, 4, 24, 52, 76, 52);
    star(g, 50, 39, 6, 2.6);
    fill(g, ink);
    circle(g, 50, 64, 3.5);
    fill(g, paper);
  },
  drugstore: (g, ink) => {
    rr(g, 39, 20, 22, 60, 4);
    fill(g, ink);
    rr(g, 20, 39, 60, 22, 4);
    fill(g, ink);
  },
  accessories: (g, ink, paper) => {
    poly(g, 35, 30, 65, 30, 79, 46, 50, 79, 21, 46);
    fill(g, ink);
    line(g, paper, 2.2, 22, 46, 78, 46);
    line(g, paper, 2.2, 35, 31, 43, 46, 50, 77);
    line(g, paper, 2.2, 65, 31, 57, 46, 50, 77);
  },
  repair: (g, ink, paper) => {
    for (let i = 0; i < 8; i++) {
      g.save();
      g.translate(50, 50);
      g.rotate((i * TAU) / 8);
      g.fillStyle = ink;
      g.fillRect(-5, -31, 10, 12);
      g.restore();
    }
    circle(g, 50, 50, 22);
    fill(g, ink);
    circle(g, 50, 50, 8.5);
    fill(g, paper);
  },
  eyewear: (g, ink) => {
    circle(g, 34, 54, 12);
    stroke(g, ink, 6);
    circle(g, 66, 54, 12);
    stroke(g, ink, 6);
    g.beginPath();
    g.arc(50, 54, 5, Math.PI * 1.15, Math.PI * 1.85);
    stroke(g, ink, 4);
    line(g, ink, 4, 22, 50, 15, 40);
    line(g, ink, 4, 78, 50, 85, 40);
  },
  bags: (g, ink, paper) => {
    g.beginPath();
    g.arc(50, 44, 14, Math.PI, TAU);
    stroke(g, ink, 5);
    rr(g, 23, 42, 54, 37, 7);
    fill(g, ink);
    rr(g, 45, 50, 10, 7, 2);
    fill(g, paper);
  },
  cosmetics: (g, ink, paper) => {
    rr(g, 37, 56, 26, 25, 3);
    fill(g, ink);
    g.fillStyle = ink;
    g.fillRect(40, 41, 20, 17);
    poly(g, 42, 41, 42, 27, 58, 20, 58, 41);
    fill(g, ink);
    line(g, paper, 2.5, 37, 56.5, 63, 56.5);
    line(g, paper, 2, 40, 42, 60, 42);
  },
  toys: (g, ink, paper) => {
    rr(g, 21, 50, 27, 27, 3);
    fill(g, ink);
    rr(g, 52, 50, 27, 27, 3);
    fill(g, ink);
    rr(g, 36.5, 21, 27, 27, 3);
    fill(g, ink);
    star(g, 50, 35, 7, 3);
    fill(g, paper);
    circle(g, 34.5, 63.5, 5);
    fill(g, paper);
    poly(g, 65.5, 57, 72, 69, 59, 69);
    fill(g, paper);
  },
  karaoke: (g, ink, paper) => {
    circle(g, 50, 33, 14);
    fill(g, ink);
    line(g, paper, 2, 40, 29, 60, 29);
    line(g, paper, 2, 38, 36, 62, 36);
    poly(g, 43, 46, 57, 46, 53.5, 80, 46.5, 80);
    fill(g, ink);
  },
  snacks: (g, ink, paper) => {
    for (const [x, y] of [
      [38, 36],
      [50, 31],
      [62, 36],
      [44, 28],
      [57, 27],
    ]) {
      circle(g, x, y, 8);
      fill(g, ink);
    }
    poly(g, 30, 40, 70, 40, 63, 81, 37, 81);
    fill(g, ink);
    for (const x of [42, 50, 58]) line(g, paper, 3, x, 44, x - (x - 50) * 0.2, 77);
  },
  playground: (g, ink, paper) => {
    g.beginPath();
    g.ellipse(50, 40, 18, 22, 0, 0, TAU);
    fill(g, ink);
    poly(g, 46, 63, 54, 63, 50, 59);
    fill(g, ink);
    g.beginPath();
    g.moveTo(50, 63);
    g.bezierCurveTo(44, 70, 56, 74, 48, 84);
    stroke(g, ink, 2.5);
    g.beginPath();
    g.ellipse(43, 32, 4, 7, 0.4, 0, TAU);
    g.globalAlpha = 0.5;
    fill(g, paper);
    g.globalAlpha = 1;
  },
  boardGameCafe: (g, ink, paper) => {
    rr(g, 25, 25, 50, 50, 9);
    fill(g, ink);
    for (const [x, y] of [
      [37, 37],
      [63, 37],
      [50, 50],
      [37, 63],
      [63, 63],
    ]) {
      circle(g, x, y, 5);
      fill(g, paper);
    }
  },
  escapeRoom: (g, ink, paper) => {
    g.beginPath();
    g.moveTo(37, 46);
    g.lineTo(37, 36);
    g.arc(50, 36, 13, Math.PI, TAU);
    g.lineTo(63, 46);
    stroke(g, ink, 6);
    rr(g, 28, 44, 44, 36, 5);
    fill(g, ink);
    circle(g, 50, 58, 5);
    fill(g, paper);
    poly(g, 47.5, 59, 52.5, 59, 54, 70, 46, 70);
    fill(g, paper);
  },
  outdoor: (g, ink, paper) => {
    poly(g, 14, 77, 40, 32, 54, 55, 62, 44, 86, 77);
    fill(g, ink);
    poly(g, 40, 32, 33, 44, 38, 41, 42, 45, 46, 39);
    fill(g, paper);
  },
  bikes: (g, ink) => {
    circle(g, 30, 60, 14);
    stroke(g, ink, 4.5);
    circle(g, 70, 60, 14);
    stroke(g, ink, 4.5);
    line(g, ink, 4, 30, 60, 44, 40, 62, 40, 70, 60);
    line(g, ink, 4, 44, 40, 52, 60, 62, 40);
    line(g, ink, 4, 30, 60, 52, 60);
    line(g, ink, 4, 40, 33, 48, 33);
    line(g, ink, 4, 60, 40, 58, 31, 65, 31);
  },
  yoga: (g, ink) => {
    for (const a of [-0.9, -0.45, 0, 0.45, 0.9]) {
      g.save();
      g.translate(50, 70);
      g.rotate(a);
      g.beginPath();
      g.ellipse(0, -20, 9, 22, 0, 0, TAU);
      g.globalAlpha = a === 0 ? 1 : 0.8;
      fill(g, ink);
      g.globalAlpha = 1;
      g.restore();
    }
  },
  golf: (g, ink) => {
    g.beginPath();
    g.ellipse(50, 76, 30, 6, 0, 0, TAU);
    fill(g, ink);
    line(g, ink, 3.5, 45, 20, 45, 74);
    poly(g, 46, 20, 72, 28, 46, 37);
    fill(g, ink);
    circle(g, 64, 68, 4);
    fill(g, ink);
  },
  climbing: (g, ink) => {
    for (const [x, y, rx, ry, rot] of [
      [34, 30, 9, 7, 0.3],
      [62, 40, 8, 10, -0.4],
      [38, 58, 10, 7, 0.1],
      [64, 72, 9, 7, 0.6],
    ]) {
      g.beginPath();
      g.ellipse(x, y, rx, ry, rot, 0, TAU);
      fill(g, ink);
    }
    g.beginPath();
    g.moveTo(26, 82);
    g.bezierCurveTo(46, 66, 30, 44, 50, 20);
    stroke(g, ink, 2.5);
  },
};

/** 品类对应的字标风格 */
type Wordmark = 'rounded' | 'serif' | 'sporty' | 'tech' | 'elegant' | 'bold';

const WORDMARK: Partial<Record<ShopCategory, Wordmark>> = {
  plush: 'rounded',
  toys: 'rounded',
  kidswear: 'rounded',
  blindbox: 'rounded',
  capsuleToys: 'rounded',
  bubbleTea: 'rounded',
  sweets: 'rounded',
  crepes: 'rounded',
  playground: 'rounded',
  snacks: 'rounded',
  books: 'serif',
  stationery: 'serif',
  cafe: 'serif',
  italian: 'serif',
  bakery: 'serif',
  menswear: 'serif',
  deli: 'serif',
  boardGameCafe: 'serif',
  running: 'sporty',
  sports: 'sporty',
  karting: 'sporty',
  bikes: 'sporty',
  golf: 'sporty',
  climbing: 'sporty',
  outdoor: 'sporty',
  badminton: 'sporty',
  devices: 'tech',
  camera: 'tech',
  vr: 'tech',
  arcade: 'tech',
  consoles: 'tech',
  phoneAccessories: 'tech',
  repair: 'tech',
  cinema: 'tech',
  womenswear: 'elegant',
  cosmetics: 'elegant',
  accessories: 'elegant',
  shoes: 'elegant',
  bags: 'elegant',
  eyewear: 'elegant',
};

const SANS = '"Avenir Next", "PingFang SC", "Helvetica Neue", Arial, sans-serif';
const WORDMARK_FONT: Record<Wordmark, { font: (px: number) => string; spacing: number; upper: boolean }> = {
  rounded: { font: (px) => `800 ${px}px "Arial Rounded MT Bold", "Varela Round", ${SANS}`, spacing: 0.01, upper: false },
  serif: { font: (px) => `700 ${px}px "Iowan Old Style", Georgia, "Times New Roman", serif`, spacing: 0.01, upper: false },
  sporty: { font: (px) => `italic 800 ${px}px "Avenir Next Condensed", "Futura", ${SANS}`, spacing: 0.02, upper: true },
  tech: { font: (px) => `600 ${px}px "Futura", "Avenir Next", ${SANS}`, spacing: 0.12, upper: true },
  elegant: { font: (px) => `400 ${px}px "Didot", "Bodoni 72", Georgia, serif`, spacing: 0.14, upper: true },
  bold: { font: (px) => `700 ${px}px ${SANS}`, spacing: 0, upper: false },
};

/** 在 (cx, cy) 画直径 size 的圆形徽章 + 品类图标 */
export function drawBadge(g: Ctx, category: ShopCategory, cx: number, cy: number, size: number, badge: string, ink: string, fallbackLetter = '?') {
  g.save();
  g.translate(cx - size / 2, cy - size / 2);
  g.scale(size / 100, size / 100);
  circle(g, 50, 50, 50);
  fill(g, badge);
  const icon = ICONS[category];
  if (icon) icon(g, ink, badge);
  else {
    g.fillStyle = ink;
    g.font = `800 60px ${SANS}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(fallbackLetter, 50, 54);
  }
  g.restore();
}

export interface LogoColors {
  bg: string;
  fg: string;
  badge: string;
  ink: string;
}

/** 招牌配色：底色用主题色，徽章用强调色（太接近时换成白底） */
export function logoColors(shop: ShopDef): LogoColors {
  const bg = shop.theme.primary;
  const fg = readableOn(bg);
  let badge = shop.theme.accent;
  if (contrast(bg, badge) < 1.6) badge = fg === '#ffffff' ? '#ffffff' : '#1f2430';
  const ink = contrast(badge, bg) >= 2.2 ? bg : readableOn(badge);
  return { bg, fg, badge, ink };
}

/**
 * 店铺 logo 招牌贴图：[徽章][字标]，高 h 像素。返回画好的 canvas。
 * 也给以后的店内海报、购物袋之类复用。
 */
export function drawLogoSign(shop: ShopDef, h: number): HTMLCanvasElement {
  const style = WORDMARK_FONT[WORDMARK[shop.category] ?? 'bold'];
  const colors = logoColors(shop);
  const text = style.upper ? shop.name.toUpperCase() : shop.name;
  const px = Math.round(h * (style.upper ? 0.44 : 0.52));
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  g.font = style.font(px);
  const spacing = px * style.spacing;
  setSpacing(g, spacing);
  const textW = g.measureText(text).width;
  const pad = h * 0.3;
  const badge = h * 0.72;
  const gap = h * 0.22;
  c.width = Math.ceil(pad + badge + gap + textW + pad * 1.2);
  c.height = h;

  rr(g, 0, 0, c.width, h, h * 0.18);
  fill(g, colors.bg);
  // 底边一条强调色细线
  g.fillStyle = shop.theme.accent;
  g.fillRect(pad + badge + gap, h * 0.8, textW, h * 0.045);
  drawBadge(g, shop.category, pad + badge / 2, h / 2, badge, colors.badge, colors.ink, shop.name[0]);

  g.font = style.font(px);
  setSpacing(g, spacing);
  g.fillStyle = colors.fg;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText(text, pad + badge + gap, h * 0.5);
  return c;
}

function setSpacing(g: Ctx, px: number) {
  if ('letterSpacing' in g) (g as Ctx & { letterSpacing: string }).letterSpacing = `${px}px`;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** 根据背景亮度选白字或深色字。 */
export function readableOn(hex: string): string {
  return contrast(hex, '#ffffff') >= contrast(hex, '#1f2430') ? '#ffffff' : '#1f2430';
}
