import * as THREE from 'three';
import type { GlowPoint } from './interiors/kit.ts';
import type { DayCycle } from '../render/DayCycle.ts';

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
    const geo = new THREE.SphereGeometry(1, 12, 8);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    for (const [floor, list] of byFloor) {
      const mesh = new THREE.InstancedMesh(geo, this.material, list.length);
      list.forEach((p, i) => {
        m.makeScale(p.r, p.r, p.r).setPosition(p.x, p.y, p.z);
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, c.set(p.color));
      });
      mesh.computeBoundingSphere();
      mesh.name = `night-glow:${floor}`;
      mesh.userData.floor = floor;
      this.meshes.push(mesh);
    }
  }

  update(day: DayCycle) {
    // 白天 0.55（灯罩本色偏暗），黄昏开始亮，深夜 2.4（超过 1 才会被泛光放大）
    const k = THREE.MathUtils.lerp(0.55, 2.4, Math.max(day.night, day.dusk * 0.5));
    this.material.color.setScalar(k);
  }
}
