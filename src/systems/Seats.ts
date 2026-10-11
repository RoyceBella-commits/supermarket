import * as THREE from 'three';

/**
 * 一个可以坐的位置。x/z 是坐下时髋部的水平位置，y 是座面高度（世界坐标），
 * yaw 是坐下后身体朝向（0 = 面朝 +z，与 VRM 角色一致）。
 */
export interface Seat {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  floor: number;
}

/** 所有座位的登记表：长椅、餐椅、店内休息椅……生成场景时登记进来。 */
export class SeatSystem {
  readonly seats: Seat[] = [];
  private nearestCache: Seat | null = null;

  add(seat: Seat) {
    this.seats.push(seat);
  }

  addAll(seats: Seat[]) {
    for (const s of seats) this.add(s);
  }

  /** 离脚底最近、高度对得上、在 maxDist 以内的座位 */
  nearest(feet: THREE.Vector3, maxDist = 1.4): Seat | null {
    let best: Seat | null = null;
    let bestD = maxDist;
    for (const s of this.seats) {
      if (s.y - feet.y < -0.3 || s.y - feet.y > 1.2) continue;
      const d = Math.hypot(s.x - feet.x, s.z - feet.z);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    this.nearestCache = best;
    return best;
  }

  get lastNearest(): Seat | null {
    return this.nearestCache;
  }
}

/** 由座面中心和朝向向量构造座位 */
export function seatFacing(id: string, x: number, y: number, z: number, faceX: number, faceZ: number, floor: number): Seat {
  return { id, x, y, z, yaw: Math.atan2(faceX, faceZ), floor };
}
