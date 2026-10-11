import * as THREE from 'three';
import type { MatKey } from '../world/StaticBatch.ts';

/**
 * “明亮柔和”的三段卡通材质（MeshToonMaterial + 渐变贴图），保留顶点色（店铺着色）和程序贴图。
 * 描边由后处理统一画（render/ToonEdgeEffect），这里不做描边。
 */
export function createWorldMaterials(): Record<MatKey, THREE.Material> {
  const grid = gridTexture('#ffffff', 'rgba(60,60,70,0.16)');
  const fineGrid = gridTexture('#ffffff', 'rgba(60,60,70,0.09)');
  const paving = gridTexture('#ffffff', 'rgba(90,80,70,0.22)');
  const stripes = stripeTexture();
  const lockerDoors = lockerTexture();

  const gradientMap = toonGradient();
  const lambert = (color: string, map?: THREE.Texture) =>
    new THREE.MeshToonMaterial({ color, map: map ?? null, vertexColors: true, gradientMap });

  const glass = new THREE.MeshLambertMaterial({
    color: '#bfe3ff',
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  return {
    floor: lambert('#ecebe6', grid),
    floorShop: lambert('#ffffff', fineGrid),
    // 天花板整层统一一个颜色、不带贴图（远处不会出现摩尔纹）
    ceiling: lambert('#fbfaf6'),
    slabEdge: lambert('#d9d5cd'),
    ground: lambert('#9cc58a'),
    plaza: lambert('#ddd6ca', paving),
    wall: lambert('#f4f1ea'),
    wallShop: lambert('#ffffff'),
    exterior: lambert('#e9dfcf'),
    glass,
    rail: lambert('#9aa3ad'),
    stair: lambert('#d9d5ce'),
    core: lambert('#e3ded4'),
    roof: lambert('#b9b3a8'),
    hoarding: lambert('#ffffff', stripes),
    locker: lambert('#ffffff', lockerDoors),
    prop: lambert('#ffffff'),
    metal: lambert('#c9ced6'),
    handrail: lambert('#2b2d33'),
    escalatorBody: lambert('#eef0f2'),
  };
}

/**
 * 卡通明暗的渐变贴图：三段，暗部不压得太黑（亮 1.0 / 中 0.84 / 暗 0.66），整体明亮柔和。
 * 用 NearestFilter 保证分段是硬边。
 */
export function toonGradient(): THREE.DataTexture {
  const steps = [168, 214, 255];
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  const t = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** 256 px 对应 2 m（UV 每 2 m 重复一次），画 2 × 2 格，即 1 m 一格。 */
function gridTexture(base: string, line: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = line;
  g.lineWidth = 3;
  for (const p of [1.5, 128]) {
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, 256);
    g.moveTo(0, p);
    g.lineTo(256, p);
    g.stroke();
  }
  return finishTexture(c);
}

function stripeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.0)';
  g.fillStyle = 'rgba(80,60,120,0.12)';
  for (let i = -256; i < 512; i += 64) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 32, 0);
    g.lineTo(i + 32 + 256, 256);
    g.lineTo(i + 256, 256);
    g.closePath();
    g.fill();
  }
  return finishTexture(c);
}

/** 寄存柜门：256 px = 2 m，4 × 4 个 0.5 m 见方的柜门，带把手和号码牌。 */
function lockerTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const x = i * 64;
      const y = j * 64;
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.fillRect(x, y, 64, 3);
      g.fillRect(x, y, 3, 64);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(x + 8, y + 8, 18, 9);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(x + 48, y + 26, 5, 14);
    }
  }
  return finishTexture(c);
}

function finishTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
