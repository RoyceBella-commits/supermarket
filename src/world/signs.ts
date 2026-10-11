import * as THREE from 'three';
import { floorByLevel, type MallLayout } from '../data/layoutTypes.ts';
import { edgeOf, openingCenter } from './rectOps.ts';
import { OUTSIDE_FLOOR } from './StaticBatch.ts';
import { LOCKER_HEIGHT, SERVICE_PANEL_HEIGHT, amenityFrame, facingVector } from './amenities.ts';
import { stairDoor } from './stairs.ts';

// 招牌：Canvas 画文字贴到平面上。店名一律英文；设施和楼梯的牌子中英双语，不随界面语言变化。
// 阶段 4 会换成带原创 logo 的招牌。

const FONT = '"Avenir Next", "PingFang SC", "Helvetica Neue", Arial, sans-serif';
const PX_PER_M = 280;

interface SignStyle {
  bg: string;
  fg: string;
  accent?: string;
  height: number; // 世界高度（米）
  maxWidth?: number;
  sub?: string; // 第二行小字
}

export function buildSigns(layout: MallLayout): THREE.Group {
  const group = new THREE.Group();
  group.name = 'signs';
  const b = layout.building;
  const H = b.floorHeight;
  const offset = 0.03;

  for (const s of layout.shops) {
    const entry = s.entrances[0];
    if (!entry) continue;
    const c = openingCenter(s.rect, entry);
    const y = s.floor * H;
    const openH = entry.height ?? (entry.kind === 'storefront' ? b.storefrontHeight : b.doorHeight);
    const style: SignStyle = {
      bg: s.theme.primary,
      fg: readableOn(s.theme.primary),
      accent: s.theme.accent,
      height: 0.95,
      maxWidth: Math.max(4, Math.min(entry.width + 2, 12)),
    };
    // 门外上方的大招牌
    addSign(group, s.name, style, c.x + c.outX * offset, y + openH + 0.75, c.z + c.outZ * offset, c.outX, c.outZ, s.floor);
    // 门内上方的小招牌（室外区域没有）
    if (s.kind !== 'outdoor') {
      const inset = b.partition + offset;
      addSign(group, s.name, { ...style, height: 0.55, maxWidth: 5 }, c.x - c.outX * inset, y + openH + 0.6, c.z - c.outZ * inset, -c.outX, -c.outZ, s.floor);
    }
  }

  for (const f of layout.facilities) {
    const y = f.floor * H;
    if (f.entrances.length === 0) {
      // 没有门的房间（空铺位围挡、员工区）：在朝走廊一侧的墙中间挂牌
      const side = f.rect.z < 0 ? 'S' : 'N';
      const e = edgeOf(f.rect, side);
      const x = e.x + (e.ax * e.length) / 2 + e.outX * offset;
      const z = e.z + (e.az * e.length) / 2 + e.outZ * offset;
      const style: SignStyle =
        f.kind === 'vacant'
          ? { bg: '#5b4b8a', fg: '#ffffff', height: 1.1, sub: f.label.zh, maxWidth: 8 }
          : { bg: '#495057', fg: '#ffffff', height: 0.7, sub: f.label.zh, maxWidth: 4 };
      addSign(group, f.label.en, style, x, y + (f.kind === 'vacant' ? 2.4 : 2.2), z, e.outX, e.outZ, f.floor);
      continue;
    }
    const entry = f.entrances[0];
    if (!entry) continue;
    const c = openingCenter(f.rect, entry);
    addSign(group, `${f.label.en}  ${f.label.zh}`, { bg: '#3d5a80', fg: '#ffffff', height: 0.5, maxWidth: 4 }, c.x + c.outX * offset, y + b.doorHeight + 0.45, c.z + c.outZ * offset, c.outX, c.outZ, f.floor);
  }

  for (const st of layout.circulation.stairs) {
    const d = stairDoor(st);
    for (let L = st.floors[0]; L <= st.floors[1]; L++) {
      const label = floorByLevel(layout, L).label;
      addSign(group, `${label}  Stairs 楼梯`, { bg: '#2f3e46', fg: '#ffffff', accent: '#84a98c', height: 0.5, maxWidth: 4 }, d.x + d.outX * offset, L * H + b.doorHeight + 0.45, d.z + d.outZ * offset, d.outX, d.outZ, L);
    }
  }

  // 设施的牌子：寄存柜挂在柜顶上方，服务台挂在背景板上
  for (const a of layout.amenities) {
    if (!a.label) continue;
    const { map, width, depth } = amenityFrame(a);
    const out = facingVector(a.facing);
    const y = a.floor * H;
    const text = `${a.label.en}  ${a.label.zh}`;
    if (a.kind === 'lockers') {
      const p = map(width / 2, 0);
      addSign(group, text, { bg: '#3d5a80', fg: '#ffffff', height: 0.42, maxWidth: Math.min(width, 4) }, p.x + out.x * offset, y + LOCKER_HEIGHT + 0.42, p.z + out.z * offset, out.x, out.z, a.floor);
    } else if (a.kind === 'serviceDesk') {
      const p = map(width / 2, depth - 0.2);
      addSign(group, text, { bg: '#ffd166', fg: '#1f2430', height: 0.6, maxWidth: width - 1 }, p.x + out.x * offset, y + SERVICE_PANEL_HEIGHT - 0.7, p.z + out.z * offset, out.x, out.z, a.floor);
    }
  }

  // 正门上方的商场名
  {
    const o = layout.building.outline;
    const m = layout.mainEntrance;
    const c = openingCenter(o, m);
    const out = layout.building.extWall + offset;
    addSign(group, layout.name.en, { bg: '#ff8c42', fg: '#ffffff', accent: '#ffd166', height: 1.6, sub: layout.name.zh, maxWidth: 14 }, c.x + c.outX * out, (m.height ?? 4) + 1.4, c.z + c.outZ * out, c.outX, c.outZ, OUTSIDE_FLOOR);
  }

  return group;
}

function addSign(group: THREE.Group, text: string, style: SignStyle, x: number, y: number, z: number, outX: number, outZ: number, floor: number) {
  const { texture, aspect } = signTexture(text, style);
  let w = style.height * aspect;
  let h = style.height;
  if (style.maxWidth && w > style.maxWidth) {
    h *= style.maxWidth / w;
    w = style.maxWidth;
  }
  const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.y = Math.atan2(outX, outZ);
  mesh.userData.floor = floor;
  mesh.name = `sign:${text}`;
  group.add(mesh);
}

function signTexture(text: string, style: SignStyle): { texture: THREE.CanvasTexture; aspect: number } {
  const h = Math.round(style.height * PX_PER_M);
  const mainSize = Math.round(h * (style.sub ? 0.46 : 0.56));
  const subSize = Math.round(h * 0.24);
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  g.font = `700 ${mainSize}px ${FONT}`;
  const mainW = g.measureText(text).width;
  let subW = 0;
  if (style.sub) {
    g.font = `600 ${subSize}px ${FONT}`;
    subW = g.measureText(style.sub).width;
  }
  const pad = h * 0.45;
  const w = Math.ceil(Math.max(mainW, subW) + pad * 2);
  c.width = w;
  c.height = h;

  const r = h * 0.18;
  g.fillStyle = style.bg;
  roundRect(g, 0, 0, w, h, r);
  g.fill();
  if (style.accent) {
    g.fillStyle = style.accent;
    g.fillRect(pad * 0.6, h - h * 0.12, w - pad * 1.2, h * 0.05);
  }
  g.fillStyle = style.fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 ${mainSize}px ${FONT}`;
  g.fillText(text, w / 2, style.sub ? h * 0.38 : h * 0.5);
  if (style.sub) {
    g.globalAlpha = 0.9;
    g.font = `600 ${subSize}px ${FONT}`;
    g.fillText(style.sub, w / 2, h * 0.74);
    g.globalAlpha = 1;
  }

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return { texture, aspect: w / h };
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** 根据背景亮度选白字或深色字。 */
function readableOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum > 0.62 ? '#1f2430' : '#ffffff';
}
