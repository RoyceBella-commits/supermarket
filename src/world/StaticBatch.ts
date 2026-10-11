import * as THREE from 'three';
import type { PhysicsWorld } from '../systems/physics/PhysicsWorld.ts';

/** 灰盒材质的名字，对应 greyboxMaterials 里的一种材质。 */
export type MatKey =
  | 'floor'
  | 'floorShop'
  | 'ground'
  | 'plaza'
  | 'wall'
  | 'wallShop'
  | 'exterior'
  | 'glass'
  | 'rail'
  | 'stair'
  | 'core'
  | 'roof'
  | 'hoarding';

/**
 * 一个轴对齐盒子。画面和碰撞都从它生成，所以不会对不上。
 * collide：solid 有碰撞且可见；none 只显示；invisible 只有碰撞。
 */
export interface BoxSpec {
  min: [number, number, number];
  max: [number, number, number];
  mat: MatKey;
  collide: 'solid' | 'none' | 'invisible';
  /** 所属楼层（分层加载用），-1 表示楼外 */
  floor: number;
  /** 颜色覆盖（店铺墙用店铺主题色），不填用材质默认色 */
  tint?: string;
}

/** 楔形楼梯坡道：只有碰撞，画面由台阶盒子负责。points 为 6 个顶点（三棱柱）。 */
export interface HullSpec {
  points: number[];
  floor: number;
}

/** 世界坐标 UV 的缩放：每 2 m 重复一次贴图。 */
const UV_SCALE = 0.5;

/**
 * 收集所有静态盒子，最后按（楼层，材质）合并成少量 Mesh，并为每个盒子建立固定碰撞体。
 */
export class StaticBatch {
  readonly boxes: BoxSpec[] = [];
  readonly hulls: HullSpec[] = [];

  add(box: BoxSpec) {
    const [x0, y0, z0] = box.min;
    const [x1, y1, z1] = box.max;
    if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4 || z1 - z0 < 1e-4) return;
    this.boxes.push(box);
  }

  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: MatKey, floor: number, collide: BoxSpec['collide'] = 'solid', tint?: string) {
    this.add({
      min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)],
      max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)],
      mat,
      collide,
      floor,
      tint,
    });
  }

  addHull(points: number[], floor: number) {
    this.hulls.push({ points, floor });
  }

  /** 生成合并后的 Mesh（按楼层分组）和碰撞体。 */
  build(materials: Record<MatKey, THREE.Material>, physics: PhysicsWorld): THREE.Group {
    const root = new THREE.Group();
    root.name = 'static';
    const groups = new Map<string, BoxSpec[]>();
    for (const b of this.boxes) {
      if (b.collide !== 'none') physics.addBox(b.min, b.max);
      if (b.collide === 'invisible') continue;
      const key = `${b.floor}|${b.mat}`;
      let list = groups.get(key);
      if (!list) groups.set(key, (list = []));
      list.push(b);
    }
    for (const h of this.hulls) physics.addConvexHull(h.points);

    const floorGroups = new Map<number, THREE.Group>();
    for (const [key, list] of groups) {
      const [floorStr, mat] = key.split('|') as [string, MatKey];
      const floor = Number(floorStr);
      let fg = floorGroups.get(floor);
      if (!fg) {
        fg = new THREE.Group();
        fg.name = floor < 0 ? 'outside' : `floor-${floor}`;
        fg.userData.floor = floor;
        floorGroups.set(floor, fg);
        root.add(fg);
      }
      const mesh = new THREE.Mesh(buildBoxesGeometry(list), materials[mat]);
      mesh.name = `${fg.name}:${mat}`;
      mesh.userData.mat = mat;
      if (mat === 'glass') mesh.renderOrder = 1;
      fg.add(mesh);
    }
    return root;
  }
}

/** 把一组盒子写成一个 BufferGeometry：每个面 4 个顶点，UV 用世界坐标，颜色用顶点色（支持单独着色）。 */
function buildBoxesGeometry(list: BoxSpec[]): THREE.BufferGeometry {
  const faceCount = list.length * 6;
  const pos = new Float32Array(faceCount * 4 * 3);
  const nor = new Float32Array(faceCount * 4 * 3);
  const uv = new Float32Array(faceCount * 4 * 2);
  const col = new Float32Array(faceCount * 4 * 3);
  const idx = new Uint32Array(faceCount * 6);
  const c = new THREE.Color();
  let v = 0;
  let i = 0;

  const pushFace = (
    corners: [number, number, number][],
    n: [number, number, number],
    uvAxes: [number, number],
    color: THREE.Color,
  ) => {
    for (const p of corners) {
      pos.set(p, v * 3);
      nor.set(n, v * 3);
      uv[v * 2] = p[uvAxes[0]] * UV_SCALE;
      uv[v * 2 + 1] = p[uvAxes[1]] * UV_SCALE;
      col[v * 3] = color.r;
      col[v * 3 + 1] = color.g;
      col[v * 3 + 2] = color.b;
      v++;
    }
    const b = v - 4;
    idx.set([b, b + 1, b + 2, b, b + 2, b + 3], i);
    i += 6;
  };

  for (const box of list) {
    const [x0, y0, z0] = box.min;
    const [x1, y1, z1] = box.max;
    if (box.tint) c.set(box.tint);
    else c.setRGB(1, 1, 1);
    // 顶点按逆时针（从外侧看）排列
    pushFace([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], [0, 2], c); // 上
    pushFace([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], [0, 2], c); // 下
    pushFace([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], [0, 1], c); // 南
    pushFace([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], [0, 1], c); // 北
    pushFace([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], [2, 1], c); // 东
    pushFace([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], [2, 1], c); // 西
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}
