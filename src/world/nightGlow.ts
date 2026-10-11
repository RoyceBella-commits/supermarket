import * as THREE from 'three';
import type { GlowPoint } from './interiors/kit.ts';
import type { DayCycle } from '../render/DayCycle.ts';
import type { MallLayout } from '../data/layoutTypes.ts';
import { openingCenter } from './rectOps.ts';
import { OUTSIDE_FLOOR } from './StaticBatch.ts';

// 夜灯：灯笼、串灯、招牌灯。每层一个 InstancedMesh（发光球），白天是暗淡的灯罩色，
// 入夜后颜色乘到 1 以上，靠泛光发亮（不用真实点光源，省性能）。

export class NightGlow {
  readonly meshes: THREE.InstancedMesh[] = [];
  private readonly material = new THREE.MeshBasicMaterial({ color: '#ffffff' });

  constructor(points: GlowPoint[]) {
    const byFloor = new Map<number, GlowPoint[]>();
    for (const p of points) {
      let list = byFloor.get(p.floor);
      if (!list) byFloor.set(p.floor, (list = []));
      list.push(p);
    }
    const sphere = new THREE.SphereGeometry(1, 12, 8);
    const box = new THREE.BoxGeometry(1, 1, 1);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    for (const [floor, all] of byFloor) {
      for (const [geo, list] of [
        [sphere, all.filter((p) => !p.size)],
        [box, all.filter((p) => p.size)],
      ] as [THREE.BufferGeometry, GlowPoint[]][]) {
        if (list.length === 0) continue;
        const mesh = new THREE.InstancedMesh(geo, this.material, list.length);
        list.forEach((p, i) => {
          const [sx, sy, sz] = p.size ?? [p.r, p.r, p.r];
          m.makeScale(sx, sy, sz).setPosition(p.x, p.y, p.z);
          mesh.setMatrixAt(i, m);
          mesh.setColorAt(i, c.set(p.color));
        });
        mesh.computeBoundingSphere();
        mesh.name = `night-glow:${floor}`;
        mesh.userData.floor = floor;
        this.meshes.push(mesh);
      }
    }
  }

  update(day: DayCycle) {
    // 白天 0.55（灯罩本色偏暗），黄昏开始亮，深夜 2.4（超过 1 才会被泛光放大）
    const k = THREE.MathUtils.lerp(0.55, 2.4, Math.max(day.night, day.dusk * 0.5));
    this.material.color.setScalar(k);
  }
}

/**
 * 外立面夜景灯：每层楼板外沿一圈暖白灯带（2F–5F），正门上方一排筒灯、两侧竖向灯条。
 * 楼层记为楼外（不跟着玩家所在楼层隐藏）。
 */
export function facadeLights(layout: MallLayout): GlowPoint[] {
  const out: GlowPoint[] = [];
  const b = layout.building;
  const o = b.outline;
  const off = b.extWall + 0.05;
  const color = '#ffe8c2';
  const H = b.floorHeight;
  const m = layout.mainEntrance;
  const c = openingCenter(o, m);
  for (let L = 1; L <= 4; L++) {
    const y = L * H - 0.4;
    const t = 0.1;
    const h = 0.16;
    out.push({ x: o.x + o.w / 2, y, z: o.z - off, r: 0, color, floor: OUTSIDE_FLOOR, size: [o.w + off * 2, h, t] });
    // 南面（正门一侧）：2F 这条在商场招牌处断开
    const x0 = o.x - off;
    const x1 = o.x + o.w + off;
    const gap = L === 1 && m.side === 'S' ? 9 : 0;
    const pieces: [number, number][] = gap ? [[x0, c.x - gap], [c.x + gap, x1]] : [[x0, x1]];
    for (const [a, b] of pieces) out.push({ x: (a + b) / 2, y, z: o.z + o.d + off, r: 0, color, floor: OUTSIDE_FLOOR, size: [b - a, h, t] });
    out.push({ x: o.x - off, y, z: o.z + o.d / 2, r: 0, color, floor: OUTSIDE_FLOOR, size: [t, h, o.d + off * 2] });
    out.push({ x: o.x + o.w + off, y, z: o.z + o.d / 2, r: 0, color, floor: OUTSIDE_FLOOR, size: [t, h, o.d + off * 2] });
  }
  // 正门：上方一排筒灯 + 两侧竖向灯条
  const top = m.height ?? 4;
  const along = [c.outZ, -c.outX];
  for (let i = 0; i < 6; i++) {
    const a = -m.width / 2 + 0.7 + (i * (m.width - 1.4)) / 5;
    out.push({ x: c.x + along[0] * a + c.outX * (off + 0.25), y: top + 0.25, z: c.z + along[1] * a + c.outZ * (off + 0.25), r: 0.13, color: '#fff3d6', floor: OUTSIDE_FLOOR });
  }
  for (const s of [-1, 1]) {
    const a = s * (m.width / 2 + 0.6);
    out.push({ x: c.x + along[0] * a + c.outX * off, y: top / 2 + 0.2, z: c.z + along[1] * a + c.outZ * off, r: 0, color: '#ffd8a8', floor: OUTSIDE_FLOOR, size: [Math.abs(along[0]) * 0.14 + Math.abs(c.outX) * 0.08, top - 0.2, Math.abs(along[1]) * 0.14 + Math.abs(c.outZ) * 0.08] });
  }
  return out;
}
