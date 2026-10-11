import * as THREE from 'three';
import { floorByLevel, type MallLayout } from '../data/layoutTypes.ts';
import { edgeOf, openingCenter } from './rectOps.ts';
import { OUTSIDE_FLOOR } from './StaticBatch.ts';
import { LOCKER_HEIGHT, SERVICE_PANEL_HEIGHT, amenityFrame, facingVector } from './amenities.ts';
import { stairDoor } from './stairs.ts';
import { drawLogoSign } from './logos.ts';
import type { BackLogo } from './interiors/index.ts';

// 招牌：Canvas 画贴图贴到平面上。店铺招牌是原创 logo（品类图标徽章 + 英文字标，见 logos.ts）；
// 设施和楼梯的牌子中英双语，不随界面语言变化。
// 一百多块招牌按楼层打包进图集，每层合并成一个 Mesh（原来每块一个 draw call，描边法线还要再画一遍）。

const FONT = '"Avenir Next", "PingFang SC", "Helvetica Neue", Arial, sans-serif';
// 每米多少像素：招牌有六十多块，太高会占很多显存
const PX_PER_M = 220;

interface SignStyle {
  bg: string;
  fg: string;
  accent?: string;
  height: number; // 世界高度（米）
  maxWidth?: number;
  sub?: string; // 第二行小字
}

interface SignEntry {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
  x: number;
  y: number;
  z: number;
  rotY: number;
  floor: number;
}

export function buildSigns(layout: MallLayout, backLogos: BackLogo[] = []): THREE.Group {
  const group: SignEntry[] = [];
  const b = layout.building;
  const H = b.floorHeight;
  const offset = 0.03;

  const logoTextures = new Map<string, HTMLCanvasElement>();
  for (const s of layout.shops) {
    const entry = s.entrances[0];
    if (!entry) continue;
    const c = openingCenter(s.rect, entry);
    const y = s.floor * H;
    const openH = entry.height ?? (entry.kind === 'storefront' ? b.storefrontHeight : b.doorHeight);
    const texture = drawLogoSign(s, Math.round(0.95 * PX_PER_M));
    logoTextures.set(s.id, texture);
    // 门外上方的大招牌
    addTextureSign(group, `sign:${s.id}`, texture, 0.95, Math.max(4, Math.min(entry.width + 2, 12)), c.x + c.outX * offset, y + openH + 0.75, c.z + c.outZ * offset, c.outX, c.outZ, s.floor);
    // 门内上方的小招牌（室外区域没有）
    if (s.kind !== 'outdoor') {
      const inset = b.partition + offset;
      addTextureSign(group, `sign-in:${s.id}`, texture, 0.55, 5, c.x - c.outX * inset, y + openH + 0.6, c.z - c.outZ * inset, -c.outX, -c.outZ, s.floor);
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

  // 店内后墙的 logo 灯箱（复用门头的贴图）
  for (const l of backLogos) {
    const texture = logoTextures.get(l.shopId);
    if (texture) addTextureSign(group, `sign-back:${l.shopId}`, texture, l.height, l.maxWidth, l.x, l.y, l.z, Math.sin(l.yaw), Math.cos(l.yaw), l.floor);
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

  return buildAtlasMeshes(group);
}

function addSign(group: SignEntry[], text: string, style: SignStyle, x: number, y: number, z: number, outX: number, outZ: number, floor: number) {
  addTextureSign(group, `sign:${text}`, signTexture(text, style), style.height, style.maxWidth, x, y, z, outX, outZ, floor);
}

function canvasTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** 按贴图宽高比放一块招牌；超过 maxWidth 时等比缩小 */
function addTextureSign(group: SignEntry[], _name: string, canvas: HTMLCanvasElement, height: number, maxWidth: number | undefined, x: number, y: number, z: number, outX: number, outZ: number, floor: number) {
  let w = height * (canvas.width / canvas.height);
  let h = height;
  if (maxWidth && w > maxWidth) {
    h *= maxWidth / w;
    w = maxWidth;
  }
  group.push({ canvas, w, h, x, y, z, rotY: Math.atan2(outX, outZ), floor });
}

const ATLAS_W = 2048;
const ATLAS_MAX_H = 4096;
const PAD = 6;

/**
 * 按楼层把招牌贴图装进图集（同一张贴图只放一次），每页图集一个 Mesh。
 * 架子式装箱：按高度从高到低排，一行放满换行；超过最大高度就开新的一页。
 */
function buildAtlasMeshes(entries: SignEntry[]): THREE.Group {
  const root = new THREE.Group();
  root.name = 'signs';
  const floors = new Map<number, SignEntry[]>();
  for (const e of entries) {
    let list = floors.get(e.floor);
    if (!list) floors.set(e.floor, (list = []));
    list.push(e);
  }
  for (const [floor, list] of floors) {
    const canvases = [...new Set(list.map((e) => e.canvas))].sort((a, b) => b.height - a.height);
    // 装箱：每张贴图 → (页, x, y)
    const pages: { h: number; items: { c: HTMLCanvasElement; x: number; y: number }[] }[] = [];
    const where = new Map<HTMLCanvasElement, { page: number; x: number; y: number; w: number; h: number }>();
    let page = { h: 0, items: [] as { c: HTMLCanvasElement; x: number; y: number }[] };
    let x = PAD;
    let y = PAD;
    let rowH = 0;
    for (const c of canvases) {
      const cw = Math.min(c.width, ATLAS_W - PAD * 2);
      if (x + cw + PAD > ATLAS_W) {
        x = PAD;
        y += rowH + PAD;
        rowH = 0;
      }
      if (y + c.height + PAD > ATLAS_MAX_H) {
        pages.push(page);
        page = { h: 0, items: [] };
        x = PAD;
        y = PAD;
        rowH = 0;
      }
      page.items.push({ c, x, y });
      where.set(c, { page: pages.length, x, y, w: cw, h: c.height });
      page.h = Math.max(page.h, y + c.height + PAD);
      x += cw + PAD;
      rowH = Math.max(rowH, c.height);
    }
    pages.push(page);

    pages.forEach((pg, pi) => {
      const atlas = document.createElement('canvas');
      atlas.width = ATLAS_W;
      atlas.height = Math.ceil(pg.h / 4) * 4;
      const g = atlas.getContext('2d')!;
      for (const it of pg.items) g.drawImage(it.c, it.x, it.y, Math.min(it.c.width, ATLAS_W - PAD * 2), it.c.height);
      const tex = canvasTexture(atlas);
      const mine = list.filter((e) => where.get(e.canvas)!.page === pi);
      const pos = new Float32Array(mine.length * 12);
      const nor = new Float32Array(mine.length * 12);
      const uv = new Float32Array(mine.length * 8);
      const idx = new Uint32Array(mine.length * 6);
      mine.forEach((e, i) => {
        const r = where.get(e.canvas)!;
        const cos = Math.cos(e.rotY);
        const sin = Math.sin(e.rotY);
        const corners: [number, number][] = [
          [-e.w / 2, -e.h / 2],
          [e.w / 2, -e.h / 2],
          [e.w / 2, e.h / 2],
          [-e.w / 2, e.h / 2],
        ];
        // 贴图边缘内缩半个像素，避免采到隔壁
        const u0 = (r.x + 0.5) / atlas.width;
        const u1 = (r.x + r.w - 0.5) / atlas.width;
        const vTop = 1 - (r.y + 0.5) / atlas.height;
        const vBot = 1 - (r.y + r.h - 0.5) / atlas.height;
        const uvs = [u0, vBot, u1, vBot, u1, vTop, u0, vTop];
        corners.forEach(([lx, ly], k) => {
          const o = i * 12 + k * 3;
          pos[o] = e.x + lx * cos;
          pos[o + 1] = e.y + ly;
          pos[o + 2] = e.z - lx * sin;
          nor[o] = sin;
          nor[o + 1] = 0;
          nor[o + 2] = cos;
          uv[i * 8 + k * 2] = uvs[k * 2];
          uv[i * 8 + k * 2 + 1] = uvs[k * 2 + 1];
        });
        idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
      mesh.name = `signs:${floor}:${pi}`;
      mesh.userData.floor = floor;
      root.add(mesh);
    });
  }
  return root;
}

function signTexture(text: string, style: SignStyle): HTMLCanvasElement {
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

  return c;
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
