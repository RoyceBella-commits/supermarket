import * as THREE from 'three';
import type { PhysicsWorld } from '../systems/physics/PhysicsWorld.ts';

/** 灰盒材质的名字，对应 greyboxMaterials 里的一种材质。 */
export type MatKey =
  | 'floor'
  | 'floorShop'
  | 'ceiling'
  | 'slabEdge'
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
  | 'hoarding'
  | 'locker'
  | 'prop'
  | 'metal'
  | 'handrail'
  | 'escalatorBody';

export type FaceDir = 'top' | 'bottom' | 'side';

/**
 * 一个轴对齐盒子。画面和碰撞都从它生成，所以不会对不上。
 * collide：solid 有碰撞且可见；none 只显示；invisible 只有碰撞（也挡相机）；
 * playerOnly 只挡玩家的隐形挡板（栏杆加高、广场边界），第三人称相机可以穿过。
 */
export interface BoxSpec {
  min: [number, number, number];
  max: [number, number, number];
  mat: MatKey;
  collide: 'solid' | 'none' | 'invisible' | 'playerOnly';
  /** 所属楼层（分层加载用），-99 表示楼外 */
  floor: number;
  /** 颜色覆盖（店铺墙用店铺主题色），不填用材质默认色；只作用于使用 mat 的面 */
  tint?: string;
  /** 按面覆盖材质（例如顶棚盒子的底面用天花板材质） */
  faces?: Partial<Record<FaceDir, MatKey>>;
}

/** 单独的一个四边形面（楼板表面用），corners 按从正面看逆时针排列。 */
export interface QuadSpec {
  corners: [number, number, number][];
  normal: [number, number, number];
  /** 世界坐标 UV 取哪两个轴（0=x，1=y，2=z） */
  uvAxes: [number, number];
  mat: MatKey;
  floor: number;
  tint?: string;
}

/** 凸包碰撞体（楼梯楔形坡道、扶梯斜面等），只有碰撞。playerOnly：只挡玩家、不挡相机。 */
export interface HullSpec {
  points: number[];
  floor: number;
  playerOnly?: boolean;
}

export const OUTSIDE_FLOOR = -99;

/** 世界坐标 UV 的缩放：每 2 m 重复一次贴图。 */
const UV_SCALE = 0.5;

/**
 * 盒子画面向外扩 2 mm：相邻盒子互相压住，消除 T 形接缝处的闪烁细缝。
 * 重叠部分材质、颜色相同，看不出来；碰撞体仍用原尺寸。
 */
const OVERLAP = 0.002;

/**
 * 收集所有静态几何，最后按（楼层，材质）合并成少量 Mesh，并为每个盒子建立固定碰撞体。
 */
export class StaticBatch {
  readonly boxes: BoxSpec[] = [];
  readonly quads: QuadSpec[] = [];
  readonly hulls: HullSpec[] = [];

  add(box: BoxSpec) {
    const [x0, y0, z0] = box.min;
    const [x1, y1, z1] = box.max;
    if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4 || z1 - z0 < 1e-4) return;
    this.boxes.push(box);
  }

  box(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    mat: MatKey,
    floor: number,
    collide: BoxSpec['collide'] = 'solid',
    tint?: string,
    faces?: BoxSpec['faces'],
  ) {
    this.add({
      min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)],
      max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)],
      mat,
      collide,
      floor,
      tint,
      faces,
    });
  }

  quad(q: QuadSpec) {
    this.quads.push(q);
  }

  addHull(points: number[], floor: number, playerOnly = false) {
    this.hulls.push({ points, floor, playerOnly });
  }

  /**
   * 任意朝向的六面体（8 个角：下面 4 个 + 上面 4 个，各自按同一顺序绕一圈）。
   * 法线由面算出，用于扶梯这类斜放的构件。
   */
  prism(c: [number, number, number][], mat: MatKey, floor: number, tint?: string) {
    const [a, b, cc, d, e, f, g, h] = c;
    const faces: [number, number, number][][] = [
      [a, d, cc, b], // 下
      [e, f, g, h], // 上
      [a, b, f, e],
      [b, cc, g, f],
      [cc, d, h, g],
      [d, a, e, h],
    ];
    for (const q of faces) {
      const n = faceNormal(q);
      // 保证法线朝外：和六面体中心比较
      const center = c.reduce((acc, p) => [acc[0] + p[0] / 8, acc[1] + p[1] / 8, acc[2] + p[2] / 8], [0, 0, 0]);
      const fc = q.reduce((acc, p) => [acc[0] + p[0] / 4, acc[1] + p[1] / 4, acc[2] + p[2] / 4], [0, 0, 0]);
      const out = (fc[0] - center[0]) * n[0] + (fc[1] - center[1]) * n[1] + (fc[2] - center[2]) * n[2];
      const corners = out >= 0 ? q : [...q].reverse();
      const nn: [number, number, number] = out >= 0 ? n : [-n[0], -n[1], -n[2]];
      const ax = Math.abs(nn[0]);
      const ay = Math.abs(nn[1]);
      const az = Math.abs(nn[2]);
      const uvAxes: [number, number] = ay >= ax && ay >= az ? [0, 2] : ax >= az ? [2, 1] : [0, 1];
      this.quad({ corners, normal: nn, uvAxes, mat, floor, tint });
    }
  }

  /** 生成合并后的 Mesh（按楼层分组）和碰撞体。 */
  build(materials: Record<MatKey, THREE.Material>, physics: PhysicsWorld): THREE.Group {
    const root = new THREE.Group();
    root.name = 'static';
    const groups = new Map<string, QuadSpec[]>();
    const push = (q: QuadSpec) => {
      const key = `${q.floor}|${q.mat}`;
      let list = groups.get(key);
      if (!list) groups.set(key, (list = []));
      list.push(q);
    };

    for (const b of this.boxes) {
      if (b.collide !== 'none') physics.addBox(b.min, b.max, b.collide === 'playerOnly');
      if (b.collide === 'invisible' || b.collide === 'playerOnly') continue;
      for (const q of boxFaces(b)) push(q);
    }
    for (const q of this.quads) push(q);
    for (const h of this.hulls) physics.addConvexHull(h.points, h.playerOnly);

    const floorGroups = new Map<number, THREE.Group>();
    for (const [key, list] of groups) {
      const [floorStr, mat] = key.split('|') as [string, MatKey];
      const floor = Number(floorStr);
      let fg = floorGroups.get(floor);
      if (!fg) {
        fg = new THREE.Group();
        fg.name = floor === OUTSIDE_FLOOR ? 'outside' : `floor-${floor}`;
        fg.userData.floor = floor;
        floorGroups.set(floor, fg);
        root.add(fg);
      }
      const mesh = new THREE.Mesh(buildGeometry(list), materials[mat]);
      mesh.name = `${fg.name}:${mat}`;
      mesh.userData.mat = mat;
      if (mat === 'glass') mesh.renderOrder = 1;
      fg.add(mesh);
    }
    return root;
  }
}

function faceNormal(q: [number, number, number][]): [number, number, number] {
  const [p0, p1, p2] = q;
  const ux = p1[0] - p0[0];
  const uy = p1[1] - p0[1];
  const uz = p1[2] - p0[2];
  const vx = p2[0] - p0[0];
  const vy = p2[1] - p0[1];
  const vz = p2[2] - p0[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

/** 盒子的 6 个面（画面外扩 OVERLAP），顶点按从外侧看逆时针排列。 */
function boxFaces(box: BoxSpec): QuadSpec[] {
  const e = OVERLAP;
  const [x0, y0, z0] = [box.min[0] - e, box.min[1] - e, box.min[2] - e];
  const [x1, y1, z1] = [box.max[0] + e, box.max[1] + e, box.max[2] + e];
  const f = (dir: FaceDir, corners: [number, number, number][], normal: [number, number, number], uvAxes: [number, number]): QuadSpec => {
    const override = box.faces?.[dir];
    const mat = override ?? box.mat;
    return { corners, normal, uvAxes, mat, floor: box.floor, tint: override && override !== box.mat ? undefined : box.tint };
  };
  return [
    f('top', [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], [0, 2]),
    f('bottom', [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], [0, 2]),
    f('side', [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], [0, 1]),
    f('side', [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], [0, 1]),
    f('side', [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], [2, 1]),
    f('side', [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], [2, 1]),
  ];
}

/** 把一组四边形写成一个 BufferGeometry：UV 用世界坐标，颜色用顶点色（支持单独着色）。 */
function buildGeometry(list: QuadSpec[]): THREE.BufferGeometry {
  const n = list.length;
  const pos = new Float32Array(n * 4 * 3);
  const nor = new Float32Array(n * 4 * 3);
  const uv = new Float32Array(n * 4 * 2);
  const col = new Float32Array(n * 4 * 3);
  const idx = new Uint32Array(n * 6);
  const c = new THREE.Color();
  let v = 0;
  let i = 0;
  for (const q of list) {
    if (q.tint) c.set(q.tint);
    else c.setRGB(1, 1, 1);
    for (const p of q.corners) {
      pos.set(p, v * 3);
      nor.set(q.normal, v * 3);
      uv[v * 2] = p[q.uvAxes[0]] * UV_SCALE;
      uv[v * 2 + 1] = p[q.uvAxes[1]] * UV_SCALE;
      col[v * 3] = c.r;
      col[v * 3 + 1] = c.g;
      col[v * 3 + 2] = c.b;
      v++;
    }
    const b = v - 4;
    idx.set([b, b + 1, b + 2, b, b + 2, b + 3], i);
    i += 6;
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
