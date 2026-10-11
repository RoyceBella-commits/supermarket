import * as THREE from 'three';
import type { SpecialSpot } from '../../world/interiors/kit.ts';
import type { Seat } from '../Seats.ts';
import type { AudioEngine } from '../audio/AudioEngine.ts';
import { i18n } from '../../ui/i18n.ts';
import { toast } from '../../ui/Toast.ts';
import { Track, type TrackPoint } from './Track.ts';
import { buildKart, type KartModel } from './kartModel.ts';

// TurboKart 赛车：在登记机租车 → 车出现在发车格 → 3 秒倒计时 → WASD 驾驶。
// - 街机式运动学模型：油门 / 刹车 / 倒车，低速转向弱、高速转向变钝（进弯要松油门），
//   撞到赛道边（中心线横向偏移超限）就推回来并掉速。不走 Rapier，车被限制在赛道里。
// - 计圈：顺着行驶方向越过起点线计一圈；必须先经过半圈检查点，倒着过线不算。最佳成绩存在 localStorage。
// - 电脑车：沿中心线 + 各自车道跑，按弯道限速表加减速，前面有车就跟车或换道。
// - 排行榜屏：每个车手的最快圈（电脑车开局用理论圈速，跑出更快的会刷新）。

const P = {
  vmax: 12.5,
  accel: 7.5,
  brake: 16,
  reverseMax: 3.5,
  reverseAccel: 4,
  drag: 0.12,
  coast: 2.4,
  steerRate: 2.6,
  /** 满速时转向能力打的折扣 */
  steerSpeedLoss: 0.42,
  /** 车身半宽 + 余量：中心离赛道边至少这么远 */
  wallMargin: 0.62,
  kartRadius: 0.72,
};
const FIXED = 1 / 60;
const BEST_KEY = 'mall.kartBest';

interface Driver {
  name: string;
  color: string;
  suit: string;
  helmet: string;
  skill: number;
  lane: number;
}

const AI_DRIVERS: Driver[] = [
  { name: 'Mika', color: '#3a86ff', suit: '#1d3557', helmet: '#ffffff', skill: 0.95, lane: -0.75 },
  { name: 'Kenta', color: '#fcbf49', suit: '#1b1b1b', helmet: '#fcbf49', skill: 0.9, lane: 0.75 },
  { name: 'Lena', color: '#06d6a0', suit: '#2b2d42', helmet: '#ff8fab', skill: 0.86, lane: 0 },
];

/** 一圈的计时状态（玩家和电脑车共用） */
class LapTimer {
  laps = 0;
  timing = false;
  armed = false;
  start = 0;
  last = 0;
  best = 0;
  private prev = -1;

  /** 每步调用：lapS 是相对起点线的里程（0..L），返回完成的单圈时间（没有则 0） */
  step(lapS: number, L: number, now: number): number {
    let done = 0;
    const prev = this.prev;
    this.prev = lapS;
    if (prev < 0) return 0;
    if (lapS > 0.4 * L && lapS < 0.6 * L) this.armed = true;
    if (prev > 0.75 * L && lapS < 0.25 * L) {
      // 顺着方向过线
      if (this.timing && this.armed) {
        done = now - this.start;
        this.last = done;
        if (!this.best || done < this.best) this.best = done;
        this.laps++;
      }
      this.timing = true;
      this.start = now;
      this.armed = false;
    } else if (prev < 0.25 * L && lapS > 0.75 * L) {
      // 倒着过线：这一圈作废
      this.armed = false;
    }
    return done;
  }

  reset() {
    this.laps = 0;
    this.timing = false;
    this.armed = false;
    this.prev = -1;
    this.last = 0;
  }
}

interface AiKart {
  driver: Driver;
  model: KartModel;
  s: number;
  v: number;
  lateral: number;
  laneTarget: number;
  laneHold: number;
  x: number;
  z: number;
  yaw: number;
  prevX: number;
  prevZ: number;
  prevYaw: number;
  timer: LapTimer;
  best: number;
}

export interface KartHudState {
  driving: boolean;
  countdown: number;
  lap: number;
  timing: boolean;
  current: number;
  last: number;
  best: number;
  kmh: number;
}

export class KartSystem {
  readonly group = new THREE.Group();
  readonly track: Track;
  readonly floor: number;
  /** 租车点（登记机前，脚底高度） */
  readonly rentPoint: THREE.Vector3;
  readonly rentYaw: number;
  private readonly startS: number;
  private readonly gridS: number;
  private readonly profile: Float64Array;
  private readonly player: KartModel;
  private readonly ai: AiKart[] = [];
  private readonly board: { mesh: THREE.Mesh; canvas: HTMLCanvasElement; tex: THREE.CanvasTexture } | null;

  driving = false;
  /** 玩家车状态 */
  private x = 0;
  private z = 0;
  private yaw = 0;
  private v = 0;
  private steer = 0;
  private prevX = 0;
  private prevZ = 0;
  private prevYaw = 0;
  private hint = -1;
  /** 玩家车在赛道上的位置（电脑车避让用），不开车时为 null */
  private playerProj: { s: number; lateral: number } | null = null;
  private countdown = 0;
  private now = 0;
  private readonly timer = new LapTimer();
  private best = 0;
  private bumpCooldown = 0;
  private readonly seatObj: Seat;
  private readonly tmpP: TrackPoint = { x: 0, z: 0, tx: 1, tz: 0 };
  private readonly sound: KartSound;

  constructor(trackSpot: SpecialSpot, boardSpot: SpecialSpot | undefined, rentSpot: SpecialSpot | undefined, audio: AudioEngine) {
    const d = trackSpot.data as { points: [number, number][]; half: number; start: [number, number]; grid: [number, number] };
    this.floor = trackSpot.floor;
    this.track = new Track(d.points, d.half, trackSpot.y);
    this.startS = this.track.project(d.start[0], d.start[1]).s;
    this.gridS = this.track.project(d.grid[0], d.grid[1]).s;
    this.profile = this.track.speedProfile(11.5, 9, 9);
    this.group.name = 'karts';
    this.group.userData.floor = this.floor;
    this.rentPoint = rentSpot ? new THREE.Vector3(rentSpot.x, rentSpot.y, rentSpot.z) : new THREE.Vector3(d.start[0], trackSpot.y, d.start[1]);
    this.rentYaw = rentSpot?.yaw ?? 0;
    this.seatObj = { id: 'kart', x: 0, y: 0, z: 0, yaw: 0, floor: this.floor, pose: 'kart' };

    this.player = buildKart('#d62828', 7);
    this.player.root.visible = false;
    this.group.add(this.player.root);
    this.best = loadBest();

    // 电脑车：在发车格后面依次排开
    AI_DRIVERS.forEach((driver, i) => {
      const model = buildKart(driver.color, [12, 23, 5][i], { suit: driver.suit, helmet: driver.helmet });
      this.group.add(model.root);
      const s = this.track.wrap(this.gridS - 8 - i * 9);
      const est = this.estimateLap(driver.skill);
      const kart: AiKart = { driver, model, s, v: 0, lateral: driver.lane, laneTarget: driver.lane, laneHold: 0, x: 0, z: 0, yaw: 0, prevX: 0, prevZ: 0, prevYaw: 0, timer: new LapTimer(), best: est };
      this.placeAi(kart);
      kart.prevX = kart.x;
      kart.prevZ = kart.z;
      kart.prevYaw = kart.yaw;
      this.ai.push(kart);
    });

    this.board = boardSpot ? this.createBoard(boardSpot) : null;
    this.drawBoard();
    i18n.onChange(() => this.drawBoard());
    this.sound = new KartSound(audio);
  }

  /** 玩家车（或站着时的）脚底位置 */
  feet(alpha: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(lerp(this.prevX, this.x, alpha), this.track.y, lerp(this.prevZ, this.z, alpha));
  }

  /** 玩家车头朝向（0 = +z） */
  get heading(): number {
    return this.yaw;
  }

  get speed(): number {
    return this.v;
  }

  /** 坐在车里的座位（给角色坐姿和镜头用），每帧由 render() 更新 */
  get seat(): Seat {
    return this.seatObj;
  }

  get hud(): KartHudState {
    return {
      driving: this.driving,
      countdown: this.countdown,
      lap: this.timer.laps + 1,
      timing: this.timer.timing,
      current: this.timer.timing ? this.now - this.timer.start : 0,
      last: this.timer.last,
      best: this.best,
      kmh: Math.abs(this.v) * 3.6,
    };
  }

  /** 租车：车放到发车格，倒计时后出发 */
  start() {
    const p = this.track.sample(this.gridS, this.tmpP);
    this.x = this.prevX = p.x;
    this.z = this.prevZ = p.z;
    this.yaw = this.prevYaw = Math.atan2(p.tx, p.tz);
    this.v = 0;
    this.steer = 0;
    this.hint = -1;
    this.timer.reset();
    this.countdown = 3;
    this.driving = true;
    this.player.root.visible = true;
    this.sound.startEngine();
    this.sound.beep(660);
  }

  /** 下车：车收回车库 */
  stop() {
    this.driving = false;
    this.player.root.visible = false;
    this.sound.stopEngine();
  }

  /** 卡住时按 R：放回最近的中心线，朝行驶方向 */
  resetToTrack() {
    if (!this.driving) return;
    const pr = this.track.project(this.x, this.z, this.hint);
    const p = this.track.sample(pr.s, this.tmpP);
    this.x = this.prevX = p.x;
    this.z = this.prevZ = p.z;
    this.yaw = this.prevYaw = Math.atan2(p.tx, p.tz);
    this.v = 0;
  }

  /**
   * 固定步长更新。input 为 null 表示玩家没在开车；active 为 false 时（玩家不在附近楼层）电脑车暂停。
   */
  fixedUpdate(input: { forward: number; right: number } | null, active: boolean) {
    const dt = FIXED;
    this.now += dt;
    this.bumpCooldown = Math.max(0, this.bumpCooldown - dt);
    if (this.driving) {
      const pr = this.track.project(this.x, this.z, this.hint);
      this.playerProj = { s: pr.s, lateral: pr.lateral };
    } else this.playerProj = null;
    if (active) for (const k of this.ai) this.updateAi(k, dt);
    if (this.driving && input) this.updatePlayer(input, dt);
  }

  /** 每帧：插值后的车身、轮子、座位，以及声音 */
  render(alpha: number, dt: number, listener: THREE.Vector3) {
    const y = this.track.y;
    if (this.driving) {
      const m = this.player;
      const x = lerp(this.prevX, this.x, alpha);
      const z = lerp(this.prevZ, this.z, alpha);
      const yaw = lerpAngle(this.prevYaw, this.yaw, alpha);
      m.root.position.set(x, y, z);
      m.root.rotation.y = yaw;
      spinWheels(m, this.v, this.steer, dt);
      const s = this.seatObj;
      const c = Math.cos(yaw);
      const sn = Math.sin(yaw);
      s.x = x + m.seat.x * c + m.seat.z * sn;
      s.z = z - m.seat.x * sn + m.seat.z * c;
      s.y = y + m.seat.y;
      s.yaw = yaw;
    }
    let near = Infinity;
    let aiSpeed = 0;
    for (const k of this.ai) {
      const x = lerp(k.prevX, k.x, alpha);
      const z = lerp(k.prevZ, k.z, alpha);
      k.model.root.position.set(x, y, z);
      k.model.root.rotation.y = lerpAngle(k.prevYaw, k.yaw, alpha);
      spinWheels(k.model, k.v, 0, dt);
      const d = Math.hypot(x - listener.x, z - listener.z) + Math.abs(listener.y - y) * 3;
      if (d < near) {
        near = d;
        aiSpeed = k.v;
      }
    }
    this.sound.update(this.driving ? this.v : 0, this.driving ? Math.abs(this.steer) : 0, near, aiSpeed, this.group.visible);
  }

  // ---------------------------------------------------------------- 玩家车

  private updatePlayer(input: { forward: number; right: number }, dt: number) {
    this.prevX = this.x;
    this.prevZ = this.z;
    this.prevYaw = this.yaw;
    let f = input.forward;
    if (this.countdown > 0) {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      const after = Math.ceil(this.countdown);
      if (after !== before) this.sound.beep(after > 0 ? 660 : 990);
      f = 0;
    }
    // 纵向：油门 / 刹车 / 倒车 / 滑行
    let v = this.v;
    if (f > 0) v += v < 0 ? P.brake * dt : P.accel * (1 - Math.max(0, v) / P.vmax) * dt;
    else if (f < 0) v = v > 0.2 ? Math.max(0, v - P.brake * dt) : Math.max(-P.reverseMax, v - P.reverseAccel * dt);
    else v = Math.abs(v) < P.coast * dt ? 0 : v - Math.sign(v) * P.coast * dt;
    v -= v * P.drag * dt;
    this.v = v;
    // 转向：输入平滑，低速时转不动，高速时转向变钝
    this.steer += (input.right - this.steer) * Math.min(1, dt * 9);
    const sp = Math.abs(v);
    const grip = Math.min(1, sp / 2.5) * (1 - (P.steerSpeedLoss * Math.min(sp, P.vmax)) / P.vmax);
    this.yaw -= this.steer * P.steerRate * grip * Math.sign(v) * dt;
    this.x += Math.sin(this.yaw) * v * dt;
    this.z += Math.cos(this.yaw) * v * dt;

    // 赛道边：横向偏移超限就推回来，朝墙的速度分量损失掉
    const pr = this.track.project(this.x, this.z, this.hint);
    this.hint = pr.index;
    const limit = this.track.half - P.wallMargin;
    if (Math.abs(pr.lateral) > limit) {
      const t = this.track.sample(pr.s, this.tmpP);
      const nx = -t.tz;
      const nz = t.tx;
      const push = pr.lateral - Math.sign(pr.lateral) * limit;
      this.x -= nx * push;
      this.z -= nz * push;
      const hx = Math.sin(this.yaw);
      const hz = Math.cos(this.yaw);
      const into = (hx * nx + hz * nz) * Math.sign(pr.lateral) * Math.sign(this.v);
      if (into > 0.02) {
        if (Math.abs(this.v) > 3 && into > 0.25) this.bump(Math.abs(this.v) * into);
        this.v *= 1 - 0.65 * into;
        // 车头顺着墙转一点
        const along = Math.atan2(t.tx, t.tz) + (this.v < 0 ? Math.PI : 0);
        let dy = along - this.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        if (Math.abs(dy) < Math.PI / 2) this.yaw += dy * 0.25 * into;
      }
    }
    // 和电脑车相撞：两车分开（玩家车让得多一些，电脑车横向让一点），只有互相靠近时才掉速
    const lim = this.track.half - P.wallMargin;
    for (const k of this.ai) {
      const dx = this.x - k.x;
      const dz = this.z - k.z;
      const d = Math.hypot(dx, dz);
      const min = P.kartRadius * 2;
      if (d >= min || d < 1e-4) continue;
      const nx = dx / d;
      const nz = dz / d;
      const push = min - d;
      this.x += nx * push * 0.7;
      this.z += nz * push * 0.7;
      const t = this.track.sample(k.s, this.tmpP);
      k.lateral = Math.max(-lim, Math.min(lim, k.lateral - (nx * -t.tz + nz * t.tx) * push * 0.3));
      const closing = -((Math.sin(this.yaw) * this.v - t.tx * k.v) * nx + (Math.cos(this.yaw) * this.v - t.tz * k.v) * nz);
      if (closing > 0.4) {
        this.bump(closing);
        this.v *= 0.8;
        k.v *= 0.92;
      }
    }
    // 计圈
    const lapS = this.track.wrap(pr.s - this.startS);
    const lap = this.timer.step(lapS, this.track.length, this.now);
    if (lap > 0) {
      const isBest = !this.best || lap < this.best;
      if (isBest) {
        this.best = lap;
        saveBest(lap);
        this.drawBoard();
      }
      toast.show(i18n.t(isBest ? 'kart.newBest' : 'kart.lapDone', { time: fmtLap(lap) }));
    }
  }

  private bump(strength: number) {
    if (this.bumpCooldown > 0) return;
    this.bumpCooldown = 0.25;
    this.sound.bump(Math.min(1, strength / 8));
  }

  // ---------------------------------------------------------------- 电脑车

  private updateAi(k: AiKart, dt: number) {
    k.prevX = k.x;
    k.prevZ = k.z;
    k.prevYaw = k.yaw;
    const L = this.track.length;
    // 看前方的限速（提前减速）
    const look = this.track.segmentAt(k.s + Math.max(2, k.v * 0.5));
    const here = this.track.segmentAt(k.s);
    let target = Math.min(this.profile[look], this.profile[here]) * k.driver.skill;
    // 前方 5 m 内同一车道有车：跟车、换道超车，里程上至少留 1.6 m，绝不追尾
    let room = Infinity;
    const ahead = (s: number, lat: number, v: number) => {
      const ds = (s - k.s + L) % L;
      if (ds <= 0.05 || ds > 5) return;
      if (Math.abs(lat - k.lateral) > 1.5) return;
      target = Math.min(target, Math.max(0, v - 0.2) + Math.max(0, ds - 2.5) * 1.5);
      room = Math.min(room, ds - 1.6);
      if (k.laneHold <= 0) {
        const lim = this.track.half - P.wallMargin - 0.05;
        k.laneTarget = lat > 0 ? Math.max(-lim, lat - 1.65) : Math.min(lim, lat + 1.65);
        k.laneHold = 3;
      }
    };
    for (const o of this.ai) if (o !== k) ahead(o.s, o.lateral, o.v);
    if (this.playerProj) ahead(this.playerProj.s, this.playerProj.lateral, Math.max(0, this.v));
    k.laneHold -= dt;
    if (k.laneHold <= 0) k.laneTarget = k.driver.lane;
    k.v += Math.max(-9 * dt, Math.min(5 * dt, target - k.v));
    k.v = Math.max(0, k.v);
    let adv = k.v * dt;
    if (adv > room) {
      adv = Math.max(0, room);
      k.v = Math.min(k.v, adv / dt);
    }
    k.lateral += Math.max(-1.1 * dt, Math.min(1.1 * dt, k.laneTarget - k.lateral));
    k.s = this.track.wrap(k.s + adv);
    this.placeAi(k);
    const lap = k.timer.step(this.track.wrap(k.s - this.startS), L, this.now);
    if (lap > 0 && lap < k.best) {
      k.best = lap;
      this.drawBoard();
    }
  }

  private placeAi(k: AiKart) {
    const p = this.track.sample(k.s, this.tmpP);
    k.x = p.x - p.tz * k.lateral;
    k.z = p.z + p.tx * k.lateral;
    k.yaw = Math.atan2(p.tx, p.tz);
  }

  /** 按限速表估算一圈的时间 */
  private estimateLap(skill: number): number {
    let t = 0;
    for (let i = 0; i < this.track.n; i++) t += (this.track.cum[i + 1] - this.track.cum[i]) / Math.max(1, this.profile[i] * skill);
    return t * 1.04;
  }

  // ---------------------------------------------------------------- 排行榜屏

  private createBoard(spot: SpecialSpot) {
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 320;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(spot.w, spot.h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    mesh.position.set(spot.x, spot.y, spot.z);
    mesh.rotation.y = spot.yaw;
    mesh.name = 'kart-board';
    this.group.add(mesh);
    return { mesh, canvas, tex };
  }

  private drawBoard() {
    const b = this.board;
    if (!b) return;
    const g = b.canvas.getContext('2d')!;
    const W = b.canvas.width;
    const H = b.canvas.height;
    g.fillStyle = '#0b0b12';
    g.fillRect(0, 0, W, H);
    // 顶部格旗条
    for (let i = 0; i < W / 20; i++)
      for (let r = 0; r < 2; r++) {
        g.fillStyle = (i + r) % 2 ? '#ffffff' : '#1b1b1b';
        g.fillRect(i * 20, r * 10, 20, 10);
      }
    g.fillStyle = '#fcbf49';
    g.font = 'bold 40px "Avenir Next", "PingFang SC", Arial, sans-serif';
    g.textBaseline = 'middle';
    g.fillText(`TurboKart · ${i18n.t('kart.board')}`, 28, 52);
    const rows: { name: string; time: number; you: boolean; color: string }[] = this.ai.map((k) => ({ name: k.driver.name, time: k.best, you: false, color: k.driver.color }));
    if (this.best) rows.push({ name: i18n.t('kart.you'), time: this.best, you: true, color: '#d62828' });
    rows.sort((a, b) => a.time - b.time);
    rows.slice(0, 4).forEach((r, i) => {
      const y = 112 + i * 52;
      if (r.you) {
        g.fillStyle = 'rgba(214,40,40,0.35)';
        g.fillRect(16, y - 24, W - 32, 48);
      }
      g.fillStyle = '#adb5bd';
      g.font = 'bold 34px "Avenir Next", Arial, sans-serif';
      g.fillText(`${i + 1}`, 34, y);
      g.fillStyle = r.color;
      g.fillRect(80, y - 14, 28, 28);
      g.fillStyle = '#ffffff';
      g.font = '600 34px "Avenir Next", "PingFang SC", Arial, sans-serif';
      g.fillText(r.name, 126, y);
      g.textAlign = 'right';
      g.fillStyle = r.you ? '#fcbf49' : '#e9ecef';
      g.fillText(fmtLap(r.time), W - 36, y);
      g.textAlign = 'left';
    });
    b.tex.needsUpdate = true;
  }
}

/** 圈速格式：0:15.23 */
export function fmtLap(t: number): string {
  if (!t || !Number.isFinite(t)) return '--:--.--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

function spinWheels(m: KartModel, v: number, steer: number, dt: number) {
  for (let i = 0; i < m.wheels.length; i++) m.wheels[i].rotation.x += (v * dt) / (i < 2 ? 0.13 : 0.145);
  for (const p of m.steer) p.rotation.y = -steer * 0.45;
  m.wheel.rotation.z = steer * 1.2;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + d * t;
}

function loadBest(): number {
  try {
    const v = Number(localStorage.getItem(BEST_KEY));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

function saveBest(t: number) {
  try {
    localStorage.setItem(BEST_KEY, String(t));
  } catch {
    // 隐私模式等存不了就算了
  }
}

/**
 * 卡丁车的声音（WebAudio 合成，走 sfx 总线）：
 * 玩家引擎（两个错开的锯齿波 + 低通，音高随车速）、附近电脑车的引擎嗡嗡声、倒计时哔声、碰撞闷响。
 */
class KartSound {
  private engine: { oscA: OscillatorNode; oscB: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private crowd: { osc: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null;

  constructor(private readonly audio: AudioEngine) {}

  startEngine() {
    if (this.engine) return;
    const ctx = this.audio.ctx;
    const oscA = new OscillatorNode(ctx, { type: 'sawtooth', frequency: 48 });
    const oscB = new OscillatorNode(ctx, { type: 'square', frequency: 24.5 });
    const filter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 500, Q: 2 });
    const gain = new GainNode(ctx, { gain: 0 });
    const mixB = new GainNode(ctx, { gain: 0.5 });
    oscA.connect(filter);
    oscB.connect(mixB).connect(filter);
    filter.connect(gain).connect(this.audio.buses.sfx);
    oscA.start();
    oscB.start();
    this.engine = { oscA, oscB, filter, gain };
  }

  stopEngine() {
    const e = this.engine;
    if (!e) return;
    this.engine = null;
    const t = this.audio.ctx.currentTime;
    e.gain.gain.setTargetAtTime(0, t, 0.08);
    e.oscA.stop(t + 0.5);
    e.oscB.stop(t + 0.5);
  }

  update(v: number, steer: number, nearAi: number, aiSpeed: number, visible: boolean) {
    const ctx = this.audio.ctx;
    if (ctx.state !== 'running') return;
    const t = ctx.currentTime;
    if (this.engine) {
      const sp = Math.abs(v);
      const f = 42 + sp * 9.5;
      this.engine.oscA.frequency.setTargetAtTime(f, t, 0.06);
      this.engine.oscB.frequency.setTargetAtTime(f * 0.502, t, 0.06);
      this.engine.filter.frequency.setTargetAtTime(380 + sp * 70 + steer * 120, t, 0.08);
      this.engine.gain.gain.setTargetAtTime(0.05 + Math.min(1, sp / P.vmax) * 0.05, t, 0.08);
    }
    // 附近电脑车：一个共享的嗡嗡声，音量看最近那辆的距离
    const want = visible ? Math.min(0.05, 0.6 / (1 + nearAi * nearAi * 0.12)) : 0;
    if (!this.crowd && want > 0.002) {
      const osc = new OscillatorNode(ctx, { type: 'sawtooth', frequency: 60 });
      const filter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 420, Q: 1 });
      const gain = new GainNode(ctx, { gain: 0 });
      osc.connect(filter).connect(gain).connect(this.audio.buses.sfx);
      osc.start();
      this.crowd = { osc, filter, gain };
    }
    if (this.crowd) {
      this.crowd.gain.gain.setTargetAtTime(want, t, 0.2);
      this.crowd.osc.frequency.setTargetAtTime(40 + aiSpeed * 8, t, 0.2);
    }
  }

  beep(freq: number) {
    const ctx = this.audio.ctx;
    if (ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const osc = new OscillatorNode(ctx, { type: 'square', frequency: freq });
    const gain = new GainNode(ctx, { gain: 0 });
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.08, t + 0.01);
    gain.gain.setTargetAtTime(0, t + (freq > 800 ? 0.45 : 0.18), 0.04);
    osc.connect(gain).connect(this.audio.buses.sfx);
    osc.start(t);
    osc.stop(t + 0.8);
  }

  bump(strength: number) {
    const ctx = this.audio.ctx;
    if (ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.25);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.18));
    const src = new AudioBufferSourceNode(ctx, { buffer: buf });
    const filter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 260 });
    const gain = new GainNode(ctx, { gain: 0.15 + strength * 0.35 });
    src.connect(filter).connect(gain).connect(this.audio.buses.sfx);
    src.start(t);
  }
}
