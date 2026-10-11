import * as THREE from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';

// 程序动画：直接转 VRM 标准化骨骼（normalized bones），任何人形 VRM 都能用。
// 标准化骨骼的静止姿势是 T-pose、各轴与世界对齐：角色面朝 +Z，左手在 +X。
// 约定：绕 X 轴转负角 = 腿/手臂向前摆；左臂绕 Z 轴负转 = 放下，右臂绕 Z 轴正转 = 放下。

/** 一组姿势参数，待机/走/跑/空中各一组，按速度混合。 */
interface PoseParams {
  armDown: number; // 手臂放下的角度
  armSwing: number; // 手臂前后摆幅
  elbow: number; // 手肘弯曲
  legSwing: number; // 腿前后摆幅
  knee: number; // 抬腿时膝盖弯曲
  kneeBase: number; // 膝盖常驻弯曲
  lean: number; // 上身前倾
  bob: number; // 身体上下起伏
  twist: number; // 上身随步伐扭转
}

const IDLE: PoseParams = { armDown: 1.22, armSwing: 0.03, elbow: 0.12, legSwing: 0, knee: 0, kneeBase: 0.02, lean: 0, bob: 0, twist: 0 };
const WALK: PoseParams = { armDown: 1.2, armSwing: 0.4, elbow: 0.3, legSwing: 0.48, knee: 0.75, kneeBase: 0.06, lean: 0.05, bob: 0.025, twist: 0.08 };
const RUN: PoseParams = { armDown: 1.05, armSwing: 0.75, elbow: 1.2, legSwing: 0.85, knee: 1.35, kneeBase: 0.15, lean: 0.2, bob: 0.05, twist: 0.12 };
const AIR: PoseParams = { armDown: 0.65, armSwing: 0, elbow: 0.5, legSwing: 0, knee: 1.0, kneeBase: 0.6, lean: 0.06, bob: 0, twist: 0 };

const KEYS = Object.keys(IDLE) as (keyof PoseParams)[];

function mix(a: PoseParams, b: PoseParams, t: number): PoseParams {
  const out = { ...a };
  for (const k of KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();

export interface AnimInput {
  /** 水平速度（m/s） */
  speed: number;
  grounded: boolean;
  /** 竖直速度 */
  vy: number;
  /** 坐着 */
  sit?: boolean;
  /** 坐在卡丁车里（sit 同时为 true） */
  kart?: boolean;
  /** 头相对身体的偏转（弧度，正 = 向角色左边转），用于看向玩家 */
  lookYaw?: number;
  /** 正在说话：嘴巴开合 */
  talking?: boolean;
}

export class ProceduralAnimator {
  private readonly bones = new Map<VRMHumanBoneName, THREE.Object3D>();
  private readonly hipsRest = new THREE.Vector3();
  private phase = 0;
  private time = 0;
  private walkW = 0;
  private runW = 0;
  private airW = 0;
  private sitW = 0;
  private headYaw = 0;
  private talkT = 0;
  private blinkTimer = 2;
  private blinkT = -1;

  constructor(
    private readonly vrm: VRM,
    private readonly height: number,
  ) {
    const names: VRMHumanBoneName[] = [
      'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
      'leftUpperArm', 'leftLowerArm', 'rightUpperArm', 'rightLowerArm',
      'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot',
    ];
    for (const n of names) {
      const node = vrm.humanoid.getNormalizedBoneNode(n);
      if (node) this.bones.set(n, node);
    }
    this.hipsRest.copy(this.bones.get('hips')?.position ?? new THREE.Vector3());
  }

  /** 静止站立时髋部离地高度（坐下时用它把髋部放到座面上） */
  get hipsHeight(): number {
    return this.hipsRest.y;
  }

  update(dt: number, input: AnimInput) {
    this.time += dt;
    const h = this.height;
    // 步幅随身高缩放：走路一个完整步态周期约 0.9 个身高，跑步约 1.35 个身高
    const cycle = THREE.MathUtils.lerp(0.9, 1.35, this.runW) * h;
    this.phase = (this.phase + (input.speed / cycle) * Math.PI * 2 * dt) % (Math.PI * 2);

    const ease = (cur: number, target: number, rate: number) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
    this.walkW = ease(this.walkW, THREE.MathUtils.smoothstep(input.speed, 0.15, 1.6), 10);
    this.runW = ease(this.runW, THREE.MathUtils.smoothstep(input.speed, 4.8, 7.2), 6);
    this.airW = ease(this.airW, input.grounded ? 0 : 1, input.grounded ? 14 : 8);
    this.sitW = ease(this.sitW, input.sit ? 1 : 0, 9);
    this.headYaw = ease(this.headYaw, THREE.MathUtils.clamp(input.lookYaw ?? 0, -1.0, 1.0), 6);

    let p = mix(IDLE, WALK, this.walkW);
    p = mix(p, RUN, this.runW);
    p = mix(p, AIR, this.airW);

    const ph = this.phase;
    const sL = Math.sin(ph);
    const sR = Math.sin(ph + Math.PI);
    // 腿往前摆的时候膝盖弯（cos 为正表示正在向前摆）
    const kneeL = p.kneeBase + p.knee * Math.max(0, Math.cos(ph)) * (1 - this.airW);
    const kneeR = p.kneeBase + p.knee * Math.max(0, Math.cos(ph + Math.PI)) * (1 - this.airW);
    const breathe = Math.sin(this.time * 2.1) * 0.015 * (1 - this.walkW);

    const set = (name: VRMHumanBoneName, q: THREE.Quaternion) => this.bones.get(name)?.quaternion.copy(q);
    const rot = (axis: THREE.Vector3, a: number) => new THREE.Quaternion().setFromAxisAngle(axis, a);

    // 躯干：前倾 + 扭转 + 呼吸
    set('spine', rot(X, p.lean * 0.5).multiply(rot(Y, p.twist * sL)));
    set('chest', rot(X, p.lean * 0.4 + breathe));
    set('neck', rot(X, -p.lean * 0.4).multiply(rot(Y, this.headYaw * 0.4)));
    set('head', rot(Y, -p.twist * sL * 0.6 + this.headYaw * 0.6));
    const hips = this.bones.get('hips');
    if (hips) {
      hips.position.copy(this.hipsRest);
      hips.position.y += (Math.abs(Math.cos(ph)) * p.bob * h - p.bob * h * 0.5 - this.airW * 0.04 * h) * (1 - this.sitW);
    }

    // 腿
    set('leftUpperLeg', rot(X, -(p.legSwing * sL) - this.airW * 0.55));
    set('rightUpperLeg', rot(X, -(p.legSwing * sR) - this.airW * 0.35));
    set('leftLowerLeg', rot(X, kneeL));
    set('rightLowerLeg', rot(X, kneeR + this.airW * 0.2));
    set('leftFoot', rot(X, -kneeL * 0.35));
    set('rightFoot', rot(X, -kneeR * 0.35));

    // 手臂：先放下（绕 Z），再前后摆（绕 X），和同侧腿反向
    const idleSway = Math.sin(this.time * 1.3) * p.armSwing * (1 - this.walkW);
    const swingL = p.armSwing * sR * this.walkW + idleSway;
    const swingR = p.armSwing * sL * this.walkW - idleSway;
    qa.setFromAxisAngle(Z, -p.armDown);
    qb.setFromAxisAngle(X, -swingL);
    set('leftUpperArm', qb.clone().multiply(qa));
    qa.setFromAxisAngle(Z, p.armDown);
    qb.setFromAxisAngle(X, -swingR);
    set('rightUpperArm', qb.clone().multiply(qa));
    set('leftLowerArm', rot(Y, -p.elbow));
    set('rightLowerArm', rot(Y, p.elbow));

    if (this.sitW > 0.001) {
      if (input.kart) this.applyKart(this.sitW);
      else this.applySit(this.sitW);
    }
    this.updateMouth(dt, !!input.talking);
    this.updateBlink(dt);
  }

  /** 坐姿：大腿向前抬平、小腿垂下，手放在腿上，按权重和当前姿势混合。 */
  private applySit(w: number) {
    const blend = (name: VRMHumanBoneName, target: THREE.Quaternion) => {
      const b = this.bones.get(name);
      if (b) b.quaternion.slerp(target, w);
    };
    const rot = (axis: THREE.Vector3, a: number) => new THREE.Quaternion().setFromAxisAngle(axis, a);
    blend('leftUpperLeg', rot(X, -1.45).multiply(rot(Z, -0.06)));
    blend('rightUpperLeg', rot(X, -1.45).multiply(rot(Z, 0.06)));
    blend('leftLowerLeg', rot(X, 1.35));
    blend('rightLowerLeg', rot(X, 1.35));
    blend('leftFoot', rot(X, -0.1));
    blend('rightFoot', rot(X, -0.1));
    blend('spine', rot(X, -0.04));
    blend('chest', rot(X, 0.02 + Math.sin(this.time * 1.8) * 0.012));
    blend('leftUpperArm', rot(X, -0.5).multiply(rot(Z, -1.3)));
    blend('rightUpperArm', rot(X, -0.5).multiply(rot(Z, 1.3)));
    blend('leftLowerArm', rot(Y, -0.7));
    blend('rightLowerArm', rot(Y, 0.7));
  }

  /** 卡丁车坐姿：坐得很低，腿几乎伸直往前，两手往前握方向盘 */
  private applyKart(w: number) {
    const blend = (name: VRMHumanBoneName, target: THREE.Quaternion) => {
      const b = this.bones.get(name);
      if (b) b.quaternion.slerp(target, w);
    };
    const rot = (axis: THREE.Vector3, a: number) => new THREE.Quaternion().setFromAxisAngle(axis, a);
    blend('leftUpperLeg', rot(X, -1.38).multiply(rot(Z, -0.1)));
    blend('rightUpperLeg', rot(X, -1.38).multiply(rot(Z, 0.1)));
    blend('leftLowerLeg', rot(X, 0.35));
    blend('rightLowerLeg', rot(X, 0.35));
    blend('leftFoot', rot(X, -0.35));
    blend('rightFoot', rot(X, -0.35));
    blend('spine', rot(X, -0.12));
    blend('chest', rot(X, 0.04));
    blend('leftUpperArm', rot(X, -1.05).multiply(rot(Z, -1.2)));
    blend('rightUpperArm', rot(X, -1.05).multiply(rot(Z, 1.2)));
    blend('leftLowerArm', rot(Y, -0.45));
    blend('rightLowerArm', rot(Y, 0.45));
  }

  /** 说话时嘴巴开合（'aa' 表情），节奏带一点随机 */
  private updateMouth(dt: number, talking: boolean) {
    const em = this.vrm.expressionManager;
    if (!em) return;
    this.talkT += dt;
    const target = talking ? Math.max(0, Math.sin(this.talkT * 13) * 0.6 + Math.sin(this.talkT * 7.3) * 0.3 + 0.15) : 0;
    const cur = em.getValue('aa') ?? 0;
    em.setValue('aa', cur + (target - cur) * Math.min(1, dt * 20));
  }

  private updateBlink(dt: number) {
    const em = this.vrm.expressionManager;
    if (!em) return;
    if (this.blinkT < 0) {
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        this.blinkT = 0;
        this.blinkTimer = 2 + Math.random() * 3.5;
      }
    } else {
      this.blinkT += dt;
      const d = 0.14;
      const v = this.blinkT < d / 2 ? this.blinkT / (d / 2) : 1 - (this.blinkT - d / 2) / (d / 2);
      em.setValue('blink', THREE.MathUtils.clamp(v, 0, 1));
      if (this.blinkT >= d) {
        this.blinkT = -1;
        em.setValue('blink', 0);
      }
    }
  }
}
