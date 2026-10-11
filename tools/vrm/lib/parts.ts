// 部件 = 一块几何 + 材质 + 所属网格 + 蒙皮权重。

import * as THREE from 'three';
import type { Geo, V3 } from './geom.ts';

/** [关节节点名, 权重][] */
export type Weights = [string, number][];
export type WeightFn = (p: THREE.Vector3) => Weights;

export interface Part {
  geo: Geo;
  /** 材质键 */
  mat: string;
  /** body：身体（第一人称也显示）；head：头/头发/配饰（第一人称隐藏） */
  mesh: 'body' | 'head';
  /** 刚性绑定的关节名，或按顶点位置算权重的函数 */
  bone: string | WeightFn;
  /** 不参与身高计算（帽子等），身高按头发顶算 */
  noHeight?: boolean;
}

/** 沿 y 方向在几个关节之间线性过渡（躯干用：Hips → Spine → Chest） */
export function blendY(stops: [number, string][]): WeightFn {
  return (p) => {
    if (p.y <= stops[0][0]) return [[stops[0][1], 1]];
    for (let i = 0; i < stops.length - 1; i++) {
      const [y0, b0] = stops[i];
      const [y1, b1] = stops[i + 1];
      if (p.y <= y1) {
        const t = (p.y - y0) / (y1 - y0);
        return [
          [b0, 1 - t],
          [b1, t],
        ];
      }
    }
    return [[stops[stops.length - 1][1], 1]];
  };
}

/** 骨链权重：找最近的线段，按投影位置在两端关节之间过渡（马尾、抽绳） */
export function chainWeights(points: V3[], names: string[]): WeightFn {
  const pts = points.map((p) => new THREE.Vector3(...p));
  return (p) => {
    let best = Infinity;
    let bi = 0;
    let bt = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const ab = pts[i + 1].clone().sub(a);
      const t = Math.min(1, Math.max(0, p.clone().sub(a).dot(ab) / ab.lengthSq()));
      const d = a.clone().add(ab.multiplyScalar(t)).distanceToSquared(p);
      if (d < best) {
        best = d;
        bi = i;
        bt = t;
      }
    }
    return [
      [names[bi], 1 - bt],
      [names[bi + 1], bt],
    ];
  };
}

/** 左右对称：把左侧部件镜像出右侧，并把关节名里的 Left 换成 Right */
export function mirrorPart(p: Part, mirror: (g: Geo) => Geo): Part {
  const bone = p.bone;
  return {
    geo: mirror(p.geo),
    mat: p.mat,
    mesh: p.mesh,
    bone:
      typeof bone === 'string'
        ? bone.replace('Left', 'Right')
        : (v: THREE.Vector3) =>
            bone(new THREE.Vector3(-v.x, v.y, v.z)).map(([n, w]) => [n.replace('Left', 'Right'), w] as [string, number]),
  };
}
