import * as THREE from 'three';
import type { Collider } from '@dimforge/rapier3d-compat';
import { floorByLevel, type ElevatorDef, type MallLayout } from '../data/layoutTypes.ts';
import type { StaticBatch } from './StaticBatch.ts';
import type { PhysicsWorld } from '../systems/physics/PhysicsWorld.ts';
import { toonGradient } from '../render/worldMaterials.ts';

// 观光电梯。井道是玻璃盒子（rect 为外框），厅门开在 doorSide 一侧（目前按 'S' 实现：门朝 +z）。
// 静态部分（井道玻璃、立柱、门框、每层的厅门碰撞）在建筑生成时加入；轿厢、门、楼层显示由 ElevatorSystem 驱动。

const GLASS_T = 0.08;
const DOOR_HALF = 0.65; // 门洞半宽
const DOOR_H = 2.3;
const CAR_INSET = 0.1; // 轿厢离井道玻璃的距离
const CAR_H = 2.55;

interface ShaftGeom {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  cx: number;
  bottom: number;
  top: number;
}

function shaftGeom(layout: MallLayout, el: ElevatorDef): ShaftGeom {
  const H = layout.building.floorHeight;
  const r = el.rect;
  const lo = Math.min(...el.floors);
  const hi = Math.max(...el.floors);
  return { x0: r.x, x1: r.x + r.w, z0: r.z, z1: r.z + r.d, cx: r.x + r.w / 2, bottom: lo * H, top: (hi + 1) * H - layout.building.slab };
}

/** 井道：三面整片玻璃，门所在的一面每层开门洞；四角立柱、每层楼板处一圈金属带、门框和呼梯按钮。 */
export function buildElevatorShaft(layout: MallLayout, el: ElevatorDef, batch: StaticBatch) {
  const H = layout.building.floorHeight;
  const g = shaftGeom(layout, el);
  const fl = Math.min(...el.floors);
  // 西、东、北三面玻璃（有碰撞）
  batch.box(g.x0, g.bottom, g.z0, g.x0 + GLASS_T, g.top, g.z1, 'glass', fl);
  batch.box(g.x1 - GLASS_T, g.bottom, g.z0, g.x1, g.top, g.z1, 'glass', fl);
  batch.box(g.x0, g.bottom, g.z0, g.x1, g.top, g.z0 + GLASS_T, 'glass', fl);
  // 门所在的一面：每层门洞两侧和上方是玻璃
  const zf0 = g.z1 - GLASS_T;
  for (let L = Math.min(...el.floors); L <= Math.max(...el.floors); L++) {
    const y0 = L * H;
    const y1 = L === Math.max(...el.floors) ? g.top : (L + 1) * H;
    const hasDoor = el.floors.includes(L);
    if (hasDoor) {
      batch.box(g.x0, y0, zf0, g.cx - DOOR_HALF, y1, g.z1, 'glass', L);
      batch.box(g.cx + DOOR_HALF, y0, zf0, g.x1, y1, g.z1, 'glass', L);
      batch.box(g.cx - DOOR_HALF, y0 + DOOR_H, zf0, g.cx + DOOR_HALF, y1, g.z1, 'glass', L);
      // 门框（外侧）
      batch.box(g.cx - DOOR_HALF - 0.1, y0, g.z1, g.cx - DOOR_HALF, y0 + DOOR_H + 0.1, g.z1 + 0.05, 'metal', L, 'none');
      batch.box(g.cx + DOOR_HALF, y0, g.z1, g.cx + DOOR_HALF + 0.1, y0 + DOOR_H + 0.1, g.z1 + 0.05, 'metal', L, 'none');
      batch.box(g.cx - DOOR_HALF, y0 + DOOR_H, g.z1, g.cx + DOOR_HALF, y0 + DOOR_H + 0.1, g.z1 + 0.05, 'metal', L, 'none');
      // 呼梯按钮面板
      batch.box(g.cx + DOOR_HALF + 0.25, y0 + 0.95, g.z1, g.cx + DOOR_HALF + 0.45, y0 + 1.3, g.z1 + 0.04, 'metal', L, 'none');
      batch.box(g.cx + DOOR_HALF + 0.31, y0 + 1.08, g.z1 + 0.04, g.cx + DOOR_HALF + 0.39, y0 + 1.16, g.z1 + 0.06, 'prop', L, 'none', '#ffd166');
    } else {
      batch.box(g.x0, y0, zf0, g.x1, y1, g.z1, 'glass', L);
    }
    // 楼板处一圈金属带
    if (L > Math.min(...el.floors)) {
      batch.box(g.x0 - 0.02, y0 - 0.3, g.z0 - 0.02, g.x1 + 0.02, y0, g.z1 + 0.02, 'metal', L, 'none');
    }
  }
  // 四角立柱
  for (const [x, z] of [
    [g.x0, g.z0],
    [g.x1 - 0.12, g.z0],
    [g.x0, g.z1 - 0.12],
    [g.x1 - 0.12, g.z1 - 0.12],
  ]) {
    batch.box(x, g.bottom, z, x + 0.12, g.top, z + 0.12, 'metal', fl, 'none');
  }
  // 顶部机房盖板
  batch.box(g.x0 - 0.05, g.top - 0.15, g.z0 - 0.05, g.x1 + 0.05, g.top, g.z1 + 0.05, 'metal', Math.max(...el.floors), 'none');
}

export type ElevatorState = 'idle' | 'opening' | 'open' | 'closing' | 'moving';

export interface RideBounds {
  y: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const DOOR_TIME = 0.9;
const DWELL = 4.5;

/**
 * 运行时：轿厢升降、开关门、厅门碰撞、楼层显示。只服务一位玩家，请求按先来后到依次处理。
 */
export class ElevatorSystem {
  readonly def: ElevatorDef;
  state: ElevatorState = 'idle';
  /** 当前（或最近一次停靠的）楼层 */
  floor: number;
  carY: number;
  /** 0 = 门全关，1 = 全开 */
  doorT = 0;
  readonly queue: number[] = [];
  private readonly H: number;
  private readonly g: ShaftGeom;
  private readonly car = new THREE.Group();
  private readonly carDoors: THREE.Mesh[] = [];
  private readonly landingDoors = new Map<number, THREE.Mesh[]>();
  private readonly landingColliders = new Map<number, Collider>();
  private readonly carFloor: Collider;
  private readonly carFloorZ: number;
  private readonly indicatorTex: THREE.CanvasTexture;
  private readonly indicatorCanvas: HTMLCanvasElement;
  private indicatorText = '';
  private timer = 0;
  private move = { from: 0, to: 0, t: 0, T: 1 };
  private target: number | null = null;
  private readonly floorLabels: Map<number, string>;
  /** 每次状态变化时通知（面板刷新用） */
  onChange: () => void = () => {};

  constructor(layout: MallLayout, def: ElevatorDef, scene: THREE.Scene, physics: PhysicsWorld, startFloor = 0) {
    this.def = def;
    this.H = layout.building.floorHeight;
    this.g = shaftGeom(layout, def);
    this.floor = def.floors.includes(startFloor) ? startFloor : def.floors[0];
    this.carY = this.floor * this.H;
    this.floorLabels = new Map(def.floors.map((f) => [f, floorByLevel(layout, f).label]));

    const g = this.g;
    const gradientMap = toonGradient();
    const metal = new THREE.MeshToonMaterial({ color: '#c9ced6', gradientMap });
    const dark = new THREE.MeshToonMaterial({ color: '#3b3f47', gradientMap });
    const glass = new THREE.MeshLambertMaterial({ color: '#bfe3ff', transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
    const door = new THREE.MeshToonMaterial({ color: '#dfe3ea', gradientMap });
    const light = new THREE.MeshBasicMaterial({ color: '#fffbe8' });

    // ---- 轿厢（局部坐标：原点在轿厢地板中心）----
    const iw = g.x1 - g.x0 - 2 * (GLASS_T + CAR_INSET);
    const id = g.z1 - g.z0 - 2 * GLASS_T - CAR_INSET - 0.18;
    const czc = g.z0 + GLASS_T + CAR_INSET + id / 2;
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      this.car.add(mesh);
      return mesh;
    };
    box(iw, 0.12, id + 0.16, metal, 0, -0.05, 0.08); // 顶面比楼面高 1 cm，避免和 B1 地面重叠闪烁
    box(iw, 0.08, id, metal, 0, CAR_H + 0.04, 0);
    box(iw * 0.6, 0.02, id * 0.5, light, 0, CAR_H - 0.01, 0);
    box(0.04, CAR_H, id, glass, -iw / 2, CAR_H / 2, 0);
    box(0.04, CAR_H, id, glass, iw / 2, CAR_H / 2, 0);
    box(iw, CAR_H, 0.04, glass, 0, CAR_H / 2, -id / 2);
    box(iw - 0.2, 0.05, 0.05, dark, 0, 0.95, -id / 2 + 0.08); // 后扶手
    box(0.06, 0.3, 0.18, dark, iw / 2 - 0.05, 1.15, id / 2 - 0.45); // 轿厢内按钮面板
    for (const s of [-1, 1]) {
      const d = box(DOOR_HALF + 0.02, DOOR_H, 0.04, door, (s * (DOOR_HALF + 0.02)) / 2, DOOR_H / 2, id / 2 + 0.05);
      d.userData.side = s;
      this.carDoors.push(d);
    }
    this.car.position.set(g.cx, this.carY, czc);
    this.car.name = `elevator-car:${def.id}`;
    scene.add(this.car);

    // ---- 厅门（每层两扇）+ 关门时的碰撞 ----
    for (const L of def.floors) {
      const y0 = L * this.H;
      const doors: THREE.Mesh[] = [];
      for (const s of [-1, 1]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(DOOR_HALF + 0.02, DOOR_H, 0.04), door);
        m.position.set(g.cx + (s * (DOOR_HALF + 0.02)) / 2, y0 + DOOR_H / 2, g.z1 - GLASS_T / 2);
        m.userData.side = s;
        scene.add(m);
        doors.push(m);
      }
      this.landingDoors.set(L, doors);
      this.landingColliders.set(L, physics.addToggleBox([g.cx - DOOR_HALF, y0, g.z1 - GLASS_T], [g.cx + DOOR_HALF, y0 + DOOR_H, g.z1]));
    }

    // ---- 轿厢地板碰撞（运动学）----
    this.carFloorZ = czc + 0.08;
    this.carFloor = physics.addMovableBox({ x: iw / 2, y: 0.05, z: (id + 0.16) / 2 }, { x: g.cx, y: this.carY - 0.05, z: this.carFloorZ });

    // ---- 楼层显示：所有显示屏共用一张贴图 ----
    this.indicatorCanvas = document.createElement('canvas');
    this.indicatorCanvas.width = 128;
    this.indicatorCanvas.height = 64;
    this.indicatorTex = new THREE.CanvasTexture(this.indicatorCanvas);
    this.indicatorTex.colorSpace = THREE.SRGBColorSpace;
    const indMat = new THREE.MeshBasicMaterial({ map: this.indicatorTex, toneMapped: false });
    for (const L of def.floors) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), indMat);
      p.position.set(g.cx, L * this.H + DOOR_H + 0.3, g.z1 + 0.06);
      scene.add(p);
    }
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.18), indMat);
    inner.position.set(0, DOOR_H + 0.12, id / 2 + 0.02);
    inner.rotation.y = Math.PI;
    this.car.add(inner);
    this.drawIndicator();
    this.applyDoors();
  }

  label(floor: number): string {
    return this.floorLabels.get(floor) ?? String(floor);
  }

  get floors(): number[] {
    return this.def.floors;
  }

  /** 呼梯 / 选层。 */
  request(floor: number) {
    if (!this.def.floors.includes(floor)) return;
    const here = this.state !== 'moving' && floor === this.floor;
    if (here) {
      if (this.state === 'closing' || this.state === 'idle') this.state = 'opening';
      else if (this.state === 'open') this.timer = DWELL;
    } else if (!this.queue.includes(floor) && this.target !== floor) {
      this.queue.push(floor);
    }
    this.onChange();
  }

  /** 轿厢内的范围（脚底在这里就算在电梯里） */
  private insideCar(p: THREE.Vector3): boolean {
    const g = this.g;
    return p.x > g.x0 + GLASS_T && p.x < g.x1 - GLASS_T && p.z > g.z0 + GLASS_T && p.z < g.z1 - GLASS_T - 0.02 && Math.abs(p.y - this.carY) < 0.8;
  }

  /** 是否站在门槛上（关门时要重新打开）：只看门槛前后一小段，站在轿厢里面不算 */
  private inDoorway(p: THREE.Vector3): boolean {
    const g = this.g;
    return Math.abs(p.x - g.cx) < DOOR_HALF + 0.15 && p.z > g.z1 - 0.32 && p.z < g.z1 + 0.4 && Math.abs(p.y - this.floor * this.H) < 1;
  }

  isPlayerInside(p: THREE.Vector3): boolean {
    return this.insideCar(p);
  }

  /** 呼梯的交互点（某层门口外面），交互提示用 */
  callButtonPos(floor: number): THREE.Vector3 {
    return new THREE.Vector3(this.g.cx + 0.3, floor * this.H, this.g.z1 + 0.9);
  }

  /** 每个物理步：推进状态机、移动轿厢；返回玩家是否被“载着走”（门关着且在轿厢里）。 */
  fixedUpdate(dt: number, player: THREE.Vector3): RideBounds | null {
    switch (this.state) {
      case 'idle': {
        const next = this.queue.shift();
        if (next !== undefined) {
          if (next === this.floor) this.state = 'opening';
          else {
            this.target = next;
            const dist = Math.abs(next - this.floor) * this.H;
            this.move = { from: this.carY, to: next * this.H, t: 0, T: Math.max(3, dist / 2.4 + 1.6) };
            this.state = 'moving';
          }
          this.onChange();
        }
        break;
      }
      case 'moving': {
        this.move.t += dt;
        const k = Math.min(1, this.move.t / this.move.T);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // ease-in-out
        this.carY = this.move.from + (this.move.to - this.move.from) * e;
        const nearest = Math.round(this.carY / this.H);
        if (this.def.floors.includes(nearest)) this.floor = nearest;
        if (k >= 1) {
          this.carY = this.move.to;
          this.floor = this.target!;
          this.target = null;
          this.state = 'opening';
          this.onChange();
        }
        break;
      }
      case 'opening':
        this.doorT = Math.min(1, this.doorT + dt / DOOR_TIME);
        if (this.doorT >= 1) {
          this.state = 'open';
          this.timer = DWELL;
          this.onChange();
        }
        break;
      case 'open':
        this.timer -= dt;
        // 有别的楼层在排队时缩短停留时间
        if (this.timer <= 0 || (this.queue.length > 0 && this.timer < DWELL - 2)) {
          if (!this.inDoorway(player)) {
            this.state = 'closing';
            this.onChange();
          }
        }
        break;
      case 'closing':
        if (this.inDoorway(player)) {
          this.state = 'opening';
          break;
        }
        this.doorT = Math.max(0, this.doorT - dt / DOOR_TIME);
        if (this.doorT <= 0) {
          this.state = 'idle';
          this.onChange();
        }
        break;
    }

    // 轿厢地板跟着走；厅门碰撞：只有轿厢停在本层且门开到一半以上时才放行
    this.carFloor.setTranslation({ x: this.g.cx, y: this.carY - 0.05, z: this.carFloorZ });
    for (const [L, c] of this.landingColliders) c.setEnabled(!(L === this.floor && this.state !== 'moving' && this.doorT > 0.5));

    if ((this.state === 'moving' || this.doorT < 0.02) && this.insideCar(player)) {
      const g = this.g;
      const m = 0.3;
      return { y: this.carY, minX: g.x0 + GLASS_T + m, maxX: g.x1 - GLASS_T - m, minZ: g.z0 + GLASS_T + m, maxZ: g.z1 - GLASS_T - m };
    }
    return null;
  }

  /** 每帧：轿厢和门的画面 */
  update() {
    this.car.position.y = this.carY;
    this.applyDoors();
    this.drawIndicator();
  }

  private applyDoors() {
    const open = this.doorT * DOOR_HALF;
    for (const d of this.carDoors) d.position.x = (d.userData.side * (DOOR_HALF + 0.02)) / 2 + d.userData.side * open;
    for (const [L, doors] of this.landingDoors) {
      const o = L === this.floor && this.state !== 'moving' ? open : 0;
      for (const d of doors) d.position.x = this.g.cx + (d.userData.side * (DOOR_HALF + 0.02)) / 2 + d.userData.side * o;
    }
  }

  private drawIndicator() {
    const dir = this.state === 'moving' ? (this.move.to > this.move.from ? '▲' : '▼') : '';
    const text = `${this.label(this.floor)}${dir}`;
    if (text === this.indicatorText) return;
    this.indicatorText = text;
    const c = this.indicatorCanvas;
    const g = c.getContext('2d')!;
    g.fillStyle = '#14171c';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#ffb347';
    g.font = '700 40px "Avenir Next", "Helvetica Neue", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, c.width / 2, c.height / 2 + 2);
    this.indicatorTex.needsUpdate = true;
  }
}
