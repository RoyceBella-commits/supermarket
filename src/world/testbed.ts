import * as THREE from 'three';
import type { PhysicsWorld } from '../systems/physics/PhysicsWorld.ts';
import { createGreyboxMaterials } from '../render/greyboxMaterials.ts';
import { StaticBatch } from './StaticBatch.ts';

/**
 * 调手感用的测试场（?testbed）：不同高度的台阶、不同角度的坡、一段和商场相同规格的楼梯、矮墙。
 * 出生点在原点，面向 -z，所有东西都在前方。
 */
export function buildTestbed(physics: PhysicsWorld): THREE.Group {
  const b = new StaticBatch();
  b.box(-40, -0.5, -60, 40, 0, 20, 'floor', 0);

  // 台阶：0.15 / 0.3 / 0.45 m（autostep 上限 0.35，最后一个要跳）
  [0.15, 0.3, 0.45].forEach((h, i) => b.box(-18 + i * 4, 0, -10, -15 + i * 4, h, -6, 'stair', 0, 'solid', '#f6c445'));

  // 坡道：20° / 31° / 45° / 50°（50° 应该上不去）
  [20, 31, 45, 50].forEach((deg, i) => {
    const x0 = -2 + i * 4;
    const x1 = x0 + 3;
    const len = 6;
    const h = Math.tan((deg * Math.PI) / 180) * len;
    const z0 = -8;
    const z1 = z0 - len;
    const pts: number[] = [];
    for (const x of [x0, x1]) pts.push(x, 0, z0, x, 0, z1, x, h, z1);
    b.addHull(pts, 0);
    b.box(x0, 0, z1 - 2, x1, h, z1, 'stair', 0, 'solid', '#8ecae6');
  });

  // 和商场同规格的楼梯：18 级、每级 0.1667 × 0.28，楔形碰撞穿过踏面中点
  {
    const rise = 3 / 18;
    const tread = 0.28;
    const x0 = 16;
    const x1 = 17.5;
    const z0 = -8;
    for (let i = 0; i < 18; i++) b.box(x0, 0, z0 - i * tread, x1, (i + 1) * rise, z0 - (i + 1) * tread, 'stair', 0, 'none', '#bde0fe');
    const zs = z0 + tread / 2;
    const ze = z0 - 18 * tread + tread / 2;
    const zEnd = z0 - 18 * tread;
    const pts: number[] = [];
    for (const x of [x0, x1]) pts.push(x, 0, zs, x, 3, ze, x, 3, zEnd, x, 0, zEnd);
    b.addHull(pts, 0);
    b.box(x0 - 1, 0, zEnd - 3, x1 + 1, 3, zEnd, 'stair', 0, 'solid', '#bde0fe');
  }

  // 矮墙：1.0 m（能跳过）和 1.3 m（跳不过）
  b.box(-18, 0, -22, -12, 1.0, -21.6, 'wall', 0, 'solid', '#ffadad');
  b.box(-8, 0, -22, -2, 1.3, -21.6, 'wall', 0, 'solid', '#ff6b6b');

  // 天花板：2.4 m 高，测试顶头
  b.box(4, 2.4, -26, 12, 2.6, -20, 'roof', 0);

  return b.build(createGreyboxMaterials(), physics);
}
