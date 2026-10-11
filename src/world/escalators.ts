import * as THREE from 'three';
import { ESCALATOR, escalatorRun, type EscalatorDef, type MallLayout, type Side } from '../data/layoutTypes.ts';
import type { StaticBatch } from './StaticBatch.ts';
import { toonGradient } from '../render/worldMaterials.ts';

// 扶梯。局部坐标：u 沿运行方向（从下端平步段起点量起），v 横向（向右为正，见 sideVector），y 为相对下层地面的高度。
//   u ∈ [-plate, 0]           下端踏板（不动）
//   u ∈ [0, flat]             下端平步段
//   u ∈ [flat, flat + rise/tan]  坡段
//   u ∈ [.., run]             上端平步段
//   u ∈ [run, run + plate]    上端踏板
// 静态部分（踏板、裙板、玻璃扶手板、扶手带、桁架、碰撞）在 buildEscalatorStatics 里并入合并几何；
// 会动的台阶由 EscalatorSystem 用 InstancedMesh 每帧更新；站在台阶上的输送速度由 conveyorAt 给出。

const RAD = (ESCALATOR.angleDeg * Math.PI) / 180;
const TAN = Math.tan(RAD);
const HALF_OUT = ESCALATOR.outerWidth / 2;
const HALF_STEP = ESCALATOR.stepWidth / 2;

function headingVector(h: Side): { x: number; z: number } {
  return { N: { x: 0, z: -1 }, S: { x: 0, z: 1 }, E: { x: 1, z: 0 }, W: { x: -1, z: 0 } }[h];
}

export interface EscalatorRide {
  frame: EscalatorFrame;
  u: number;
  v: number;
}

export interface EscalatorFrame {
  def: EscalatorDef;
  y0: number;
  rise: number;
  run: number;
  dir: { x: number; z: number };
  side: { x: number; z: number };
  /** 相对高度（下层地面为 0） */
  surfaceY(u: number): number;
  map(u: number, v: number, y: number): [number, number, number];
  /** 台阶带沿坡面的总长度（平段 + 斜段 + 平段） */
  pathLength: number;
  /** 沿坡面的距离 → u */
  uAtArc(s: number): number;
  /** u → 沿坡面的距离 */
  arcAtU(u: number): number;
}

export function escalatorFrame(def: EscalatorDef, floorHeight: number): EscalatorFrame {
  const dir = headingVector(def.heading);
  const side = { x: -dir.z, z: dir.x };
  const rise = floorHeight;
  const run = escalatorRun(floorHeight);
  const y0 = def.fromFloor * floorHeight;
  const flat = ESCALATOR.flat;
  const slopeLen = rise / Math.sin(RAD);
  const pathLength = flat * 2 + slopeLen;
  return {
    pathLength,
    uAtArc(s: number) {
      if (s <= flat) return s;
      if (s >= flat + slopeLen) return run - (pathLength - s);
      return flat + (s - flat) * Math.cos(RAD);
    },
    arcAtU(u: number) {
      if (u <= flat) return u;
      if (u >= run - flat) return pathLength - (run - u);
      return flat + (u - flat) / Math.cos(RAD);
    },
    def,
    y0,
    rise,
    run,
    dir,
    side,
    surfaceY(u: number) {
      if (u <= flat) return 0;
      if (u >= run - flat) return rise;
      return (u - flat) * TAN;
    },
    map(u: number, v: number, y: number) {
      return [def.foot.x + dir.x * u + side.x * v, y0 + y, def.foot.z + dir.z * u + side.z * v];
    },
  };
}

/** 扶梯整体占地（含两端踏板），给栏杆开口和校验用。 */
export function escalatorFootprint(f: EscalatorFrame) {
  const pts = [f.map(-ESCALATOR.plate, -HALF_OUT, 0), f.map(f.run + ESCALATOR.plate, HALF_OUT, 0)];
  return {
    x0: Math.min(pts[0][0], pts[1][0]),
    x1: Math.max(pts[0][0], pts[1][0]),
    z0: Math.min(pts[0][2], pts[1][2]),
    z1: Math.max(pts[0][2], pts[1][2]),
  };
}

/** 静态构件和碰撞体，加进 StaticBatch。 */
export function buildEscalatorStatics(layout: MallLayout, batch: StaticBatch) {
  const H = layout.building.floorHeight;
  for (const def of layout.circulation.escalators) {
    const f = escalatorFrame(def, H);
    const floor = def.fromFloor;
    const { run, rise } = f;
    const flat = ESCALATOR.flat;
    const plate = ESCALATOR.plate;
    // 沿剖面分三段：下平段、坡段、上平段（每段各自是一个直的六面体）
    const segs: [number, number][] = [
      [-0.3, flat],
      [flat, run - flat],
      [run - flat, run + 0.3],
    ];
    const prismAlong = (u0: number, u1: number, v0: number, v1: number, bottom: number, top: number, mat: Parameters<StaticBatch['prism']>[1], tint?: string) => {
      const y = (u: number) => f.surfaceY(u);
      batch.prism(
        [
          f.map(u0, v0, y(u0) + bottom),
          f.map(u1, v0, y(u1) + bottom),
          f.map(u1, v1, y(u1) + bottom),
          f.map(u0, v1, y(u0) + bottom),
          f.map(u0, v0, y(u0) + top),
          f.map(u1, v0, y(u1) + top),
          f.map(u1, v1, y(u1) + top),
          f.map(u0, v1, y(u0) + top),
        ],
        mat,
        floor,
        tint,
      );
    };
    const hullAlong = (u0: number, u1: number, v0: number, v1: number, bottom: number, top: number, playerOnly: boolean) => {
      const pts: number[] = [];
      for (const u of [u0, u1]) for (const v of [v0, v1]) for (const h of [bottom, top]) pts.push(...f.map(u, v, f.surfaceY(u) + h));
      batch.addHull(pts, floor, playerOnly);
    };

    // 两端踏板 + 黄色梳齿边
    for (const [ua, ub, yy] of [
      [-plate, 0, 0],
      [run, run + plate, rise],
    ] as const) {
      batch.prism(
        [f.map(ua, -0.6, yy - 0.02), f.map(ub, -0.6, yy - 0.02), f.map(ub, 0.6, yy - 0.02), f.map(ua, 0.6, yy - 0.02), f.map(ua, -0.6, yy + 0.03), f.map(ub, -0.6, yy + 0.03), f.map(ub, 0.6, yy + 0.03), f.map(ua, 0.6, yy + 0.03)],
        'metal',
        floor,
      );
      const comb = ua < 0 ? ub - 0.08 : ua;
      batch.prism(
        [f.map(comb, -HALF_STEP, yy + 0.03), f.map(comb + 0.08, -HALF_STEP, yy + 0.03), f.map(comb + 0.08, HALF_STEP, yy + 0.03), f.map(comb, HALF_STEP, yy + 0.03), f.map(comb, -HALF_STEP, yy + 0.04), f.map(comb + 0.08, -HALF_STEP, yy + 0.04), f.map(comb + 0.08, HALF_STEP, yy + 0.04), f.map(comb, HALF_STEP, yy + 0.04)],
        'prop',
        floor,
        '#ffd60a',
      );
    }

    for (const [u0, u1] of segs) {
      for (const s of [-1, 1]) {
        // 裙板（台阶两侧的金属挡板）
        prismAlong(u0, u1, s * HALF_STEP, s * (HALF_OUT - 0.04), -0.3, 0.14, 'metal');
        // 玻璃扶手板 + 扶手带
        prismAlong(u0, u1, s * (HALF_OUT - 0.07), s * (HALF_OUT - 0.04), 0.14, 0.98, 'glass');
        prismAlong(u0 - (u0 < 0 ? 0.15 : 0), u1 + (u1 > run ? 0.15 : 0), s * (HALF_OUT - 0.1), s * (HALF_OUT - 0.01), 0.98, 1.06, 'handrail');
        // 扶手板碰撞：只挡玩家，加高到 1.8 m，站在扶梯上跳不出去
        hullAlong(u0, u1, s * (HALF_OUT - 0.12), s * HALF_OUT, -0.2, 1.8, true);
      }
    }

    // 桁架（扶梯下面的白色箱体），只在坡段和上平段下面露出来
    prismAlong(flat, run - flat, -HALF_OUT, HALF_OUT, -1.0, -0.3, 'escalatorBody');
    prismAlong(run - flat, run + 0.3, -HALF_OUT, HALF_OUT, -1.0, -0.3, 'escalatorBody');

    // 台阶面的碰撞：坡段是一块厚斜板（顶面就是台阶面），两头平段是薄板
    hullAlong(flat, run - flat, -HALF_OUT, HALF_OUT, -1.0, 0, false);
    hullAlong(-plate, flat, -HALF_OUT + 0.12, HALF_OUT - 0.12, -0.25, 0.03, false);
    hullAlong(run - flat, run + plate, -HALF_OUT + 0.12, HALF_OUT - 0.12, -0.25, 0.03, false);
  }
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpP = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);

/** 运行时：会动的台阶 + 输送速度。 */
export class EscalatorSystem {
  readonly frames: EscalatorFrame[];
  private readonly mesh: THREE.InstancedMesh;
  private readonly perEsc: number;
  private readonly spacing: number;
  private phase = 0;

  constructor(layout: MallLayout, scene: THREE.Scene) {
    const H = layout.building.floorHeight;
    this.frames = layout.circulation.escalators.map((d) => escalatorFrame(d, H));
    // 台阶按沿坡面的距离均匀排布、匀速移动（坡段上水平间距会变小，所以台阶做得比间距窄一点）
    const pathLength = this.frames[0]?.pathLength ?? escalatorRun(H);
    this.perEsc = Math.round(pathLength / ESCALATOR.stepDepth);
    this.spacing = pathLength / this.perEsc;
    const geo = new THREE.BoxGeometry(this.spacing * Math.cos(RAD) * 0.96, 0.26, ESCALATOR.stepWidth - 0.04);
    const gradientMap = toonGradient();
    const side = new THREE.MeshToonMaterial({ color: '#4a4e57', gradientMap });
    const top = new THREE.MeshToonMaterial({ color: '#9aa1ab', gradientMap });
    // BoxGeometry 的面顺序：+x, -x, +y, -y, +z, -z；+y 是踏面
    this.mesh = new THREE.InstancedMesh(geo, [side, side, top, side, side, side], this.frames.length * this.perEsc);
    this.mesh.name = 'escalator-steps';
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.addEntryMarkers(scene);
    this.update(0);
  }

  /** 入口两侧扶手端头上的绿色方向牌（上行在下端、下行在上端），一眼分清哪条是上、哪条是下。 */
  private addEntryMarkers(scene: THREE.Scene) {
    const tex = (arrow: string) => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!;
      g.fillStyle = '#1b5e20';
      g.beginPath();
      g.arc(32, 32, 30, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#b9f6ca';
      g.font = '700 38px Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(arrow, 32, 35);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false });
    };
    const upMat = tex('▲');
    const downMat = tex('▼');
    const geo = new THREE.CircleGeometry(0.11, 24);
    for (const f of this.frames) {
      const up = f.def.dir === 'up';
      // 入口：上行在下端（u 小），下行在上端（u 大）；牌子朝向走过来的人
      // 扶手板的端头（玻璃从 u = -0.3 / run + 0.3 开始）
      const u = up ? -0.32 : f.run + 0.32;
      const y = up ? 0 : f.rise;
      for (const s of [-1, 1]) {
        const [x, yy, z] = f.map(u, s * (HALF_OUT - 0.055), y + 0.82);
        const m = new THREE.Mesh(geo, up ? upMat : downMat);
        m.position.set(x, yy, z);
        const face = up ? -1 : 1; // 朝向入口外侧
        m.rotation.y = Math.atan2(f.dir.x * face, f.dir.z * face);
        scene.add(m);
      }
    }
  }

  update(dt: number) {
    this.phase = (this.phase + ESCALATOR.speed * dt) % this.spacing;
    let k = 0;
    for (const f of this.frames) {
      const sign = f.def.dir === 'up' ? 1 : -1;
      const yaw = Math.atan2(f.dir.z, f.dir.x);
      tmpQ.setFromAxisAngle(UP, -yaw);
      for (let i = 0; i < this.perEsc; i++) {
        let sArc = (i + 0.5) * this.spacing + sign * this.phase;
        sArc = ((sArc % f.pathLength) + f.pathLength) % f.pathLength;
        const u = f.uAtArc(sArc);
        const onSlope = u > ESCALATOR.flat && u < f.run - ESCALATOR.flat ? 1 : 0;
        const topY = f.surfaceY(u) + 0.03 + 0.06 * onSlope;
        const [x, y, z] = f.map(u, 0, topY - 0.13);
        tmpP.set(x, y, z);
        tmpM.compose(tmpP, tmpQ, ONE);
        this.mesh.setMatrixAt(k++, tmpM);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** 脚底站在某台扶梯的台阶上（不是跳在空中）时，返回这台扶梯和局部坐标。 */
  locate(feet: THREE.Vector3): EscalatorRide | null {
    for (const f of this.frames) {
      const dx = feet.x - f.def.foot.x;
      const dz = feet.z - f.def.foot.z;
      const u = dx * f.dir.x + dz * f.dir.z;
      if (u < 0 || u > f.run) continue;
      const v = dx * f.side.x + dz * f.side.z;
      if (Math.abs(v) > HALF_STEP + 0.08) continue;
      const surface = f.y0 + f.surfaceY(u);
      if (feet.y - surface > 0.3 || surface - feet.y > 0.4) continue;
      return { frame: f, u, v };
    }
    return null;
  }

  /**
   * 站在扶梯上时的新脚底位置：沿台阶带走（台阶速度 + 玩家自己沿扶梯方向的速度），
   * 横向限制在台阶宽度内，高度贴台阶面。走出两端时延伸到踏板上，下一步交回角色控制器。
   * 台阶画面用同一套“沿坡面的距离”，所以人和台阶严格同步。
   */
  advance(ride: EscalatorRide, vel: THREE.Vector3, dt: number, out: THREE.Vector3): THREE.Vector3 {
    const f = ride.frame;
    const sign = f.def.dir === 'up' ? 1 : -1;
    const along = vel.x * f.dir.x + vel.z * f.dir.z;
    const lateral = vel.x * f.side.x + vel.z * f.side.z;
    const s1 = f.arcAtU(ride.u) + (sign * ESCALATOR.speed + along) * dt;
    const maxV = HALF_STEP - 0.26;
    const v1 = THREE.MathUtils.clamp(ride.v + lateral * dt, -maxV, maxV);
    let u1: number;
    let y: number;
    if (s1 < 0) {
      u1 = s1;
      y = 0;
    } else if (s1 > f.pathLength) {
      u1 = f.run + (s1 - f.pathLength);
      y = f.rise;
    } else {
      u1 = f.uAtArc(s1);
      y = f.surfaceY(u1);
    }
    const [x, yy, z] = f.map(u1, v1, y + 0.03);
    return out.set(x, yy, z);
  }
}
