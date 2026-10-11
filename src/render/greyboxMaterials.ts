import * as THREE from 'three';
import type { MatKey } from '../world/StaticBatch.ts';

/** 灰盒阶段的材质：Lambert + 顶点色（店铺着色），地面带 1 m 网格方便判断距离和速度。阶段 2 换成卡通材质。 */
export function createGreyboxMaterials(): Record<MatKey, THREE.Material> {
  const grid = gridTexture('#ffffff', 'rgba(60,60,70,0.16)');
  const fineGrid = gridTexture('#ffffff', 'rgba(60,60,70,0.09)');
  const paving = gridTexture('#ffffff', 'rgba(90,80,70,0.22)');
  const stripes = stripeTexture();

  const lambert = (color: string, map?: THREE.Texture) =>
    new THREE.MeshLambertMaterial({ color, map: map ?? null, vertexColors: true });

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
  };
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

function finishTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
