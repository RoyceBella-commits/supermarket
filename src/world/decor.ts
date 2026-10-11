import * as THREE from 'three';
import type { DecorSlot } from './interiors/kit.ts';

// 装饰插图（tools/decor 生成，public/textures/decor/）：海报、横幅、图集卡片（书封、盲盒、积木盒、美食）。
// 布局阶段只记录位置（DecorSlot），这里在运行时读 manifest、挑图、按“图片 × 楼层”合并成网格。
// 没有 manifest 或缺图时，对应位置空着。

interface DecorImage {
  id: string;
  file: string;
  width: number;
  height: number;
  kind: 'poster' | 'banner' | 'atlas';
  grid?: [number, number];
  usage: string[];
}

const BASE = `${import.meta.env.BASE_URL}textures/decor/`;
/** 离墙/桌面的距离，避免和后面的面抢深度 */
const LIFT = 0.006;

export async function buildDecor(slots: DecorSlot[]): Promise<THREE.Mesh[]> {
  const images = await loadManifest();
  if (images.length === 0) return [];
  const byId = new Map(images.map((i) => [i.id, i]));

  // 墙面海报位：同一家店里按顺序轮流用适合的图，不重复
  const used = new Map<string, Set<string>>();
  const groups = new Map<string, { image: DecorImage; floor: number; slots: { slot: DecorSlot; cell: number }[] }>();
  for (const slot of slots) {
    let image: DecorImage | undefined;
    if (slot.image) image = byId.get(slot.image);
    else {
      const taken = used.get(slot.shopId) ?? new Set<string>();
      used.set(slot.shopId, taken);
      const fits = (i: DecorImage) => i.kind !== 'atlas' && i.usage.includes(slot.shopId) && (slot.shape === 'landscape') === i.width > i.height;
      image = images.find((i) => fits(i) && !taken.has(i.id));
      if (image) taken.add(image.id);
    }
    if (!image) continue;
    const key = `${image.id}@${slot.floor}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { image, floor: slot.floor, slots: [] }));
    g.slots.push({ slot, cell: image.kind === 'atlas' ? slot.cell : -1 });
  }

  const loader = new THREE.TextureLoader();
  const textures = new Map<string, THREE.Texture>();
  const meshes: THREE.Mesh[] = [];
  for (const g of groups.values()) {
    let tex = textures.get(g.image.id);
    if (!tex) {
      tex = loader.load(BASE + encodeURIComponent(g.image.file));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      textures.set(g.image.id, tex);
    }
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: '#f2f0ec' });
    const mesh = new THREE.Mesh(quads(g.image, g.slots), mat);
    mesh.name = `decor:${g.image.id}`;
    mesh.userData.floor = g.floor;
    meshes.push(mesh);
  }
  return meshes;
}

async function loadManifest(): Promise<DecorImage[]> {
  try {
    const res = await fetch(`${BASE}manifest.json`, { cache: 'no-cache' });
    if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) return [];
    const data = (await res.json()) as { version?: number; images?: DecorImage[] };
    return data.version === 1 && Array.isArray(data.images) ? data.images : [];
  } catch {
    return [];
  }
}

/** 每个位置一个四边形：按图片（或图集格子）比例缩进框里 */
function quads(image: DecorImage, list: { slot: DecorSlot; cell: number }[]): THREE.BufferGeometry {
  const [cols, rows] = image.grid ?? [1, 1];
  const n = list.length;
  const pos = new Float32Array(n * 12);
  const uv = new Float32Array(n * 8);
  const nor = new Float32Array(n * 12);
  const idx: number[] = [];
  list.forEach(({ slot, cell }, i) => {
    let u0 = 0;
    let u1 = 1;
    let v0 = 0;
    let v1 = 1;
    let aspect = image.width / image.height;
    if (cell >= 0) {
      const c = cell % cols;
      const r = Math.floor(cell / cols) % rows;
      const pad = 0.006;
      u0 = c / cols + pad;
      u1 = (c + 1) / cols - pad;
      v1 = 1 - r / rows - pad;
      v0 = 1 - (r + 1) / rows + pad;
      aspect = image.width / cols / (image.height / rows);
    }
    let w = slot.w;
    let h = w / aspect;
    if (h > slot.h) {
      h = slot.h;
      w = h * aspect;
    }
    const fx = Math.sin(slot.yaw);
    const fz = Math.cos(slot.yaw);
    // 看图的人面朝 -f：图的右边是 (fz, 0, -fx)
    const rx = fz;
    const rz = -fx;
    let ux: number;
    let uy: number;
    let uz: number;
    let nx: number;
    let ny: number;
    let nz: number;
    let cx = slot.x;
    let cy = slot.y;
    let cz = slot.z;
    if (slot.flat) {
      // 平放：图的上方朝远离看图人的方向
      ux = -fx;
      uy = 0;
      uz = -fz;
      nx = 0;
      ny = 1;
      nz = 0;
      cy += LIFT;
    } else {
      ux = 0;
      uy = 1;
      uz = 0;
      nx = fx;
      ny = 0;
      nz = fz;
      cx += fx * LIFT;
      cz += fz * LIFT;
    }
    const hw = w / 2;
    const hh = h / 2;
    const corners = [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ];
    corners.forEach(([a, b], k) => {
      const o = i * 12 + k * 3;
      pos[o] = cx + rx * a + ux * b;
      pos[o + 1] = cy + uy * b;
      pos[o + 2] = cz + rz * a + uz * b;
      nor[o] = nx;
      nor[o + 1] = ny;
      nor[o + 2] = nz;
    });
    uv.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8);
    const b = i * 4;
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
