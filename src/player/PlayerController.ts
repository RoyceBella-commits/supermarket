import * as THREE from 'three';
import type { Collider, KinematicCharacterController, RigidBody } from '@dimforge/rapier3d-compat';
import { COLLIDE_PLAYER, type PhysicsWorld } from '../systems/physics/PhysicsWorld.ts';

/** 手感参数（试玩后可调）。身体尺寸会按 VRM 角色的身高调整（configureBody）。 */
export const PLAYER = {
  radius: 0.26,
  height: 1.7,
  eyeHeight: 1.6,
  walkSpeed: 4.5,
  runSpeed: 7.5,
  accel: 45,
  airControl: 0.3,
  gravity: 22,
  jumpHeight: 1.1,
  stepHeight: 0.35,
  snapDistance: 0.5,
  maxSlopeDeg: 45,
  minSlideDeg: 50,
  mouseSensitivity: 0.0022,
  respawnY: -20,
};

export interface MoveIntent {
  forward: number;
  right: number;
  run: boolean;
}

/**
 * 玩家角色的物理部分：Rapier 运动学胶囊 + KinematicCharacterController。
 * yaw / pitch 是相机朝向；移动方向相对 yaw（第一、第三人称一致）。
 * 位置以脚底为准；每个固定步记录前后两帧，渲染时插值，避免高刷屏抖动。
 */
export class PlayerController {
  yaw = 0;
  pitch = 0;
  grounded = false;
  readonly prev = new THREE.Vector3();
  readonly curr = new THREE.Vector3();
  /** 水平速度（m/s） */
  readonly vel = new THREE.Vector3();
  /** 竖直速度（m/s） */
  vy = 0;
  /** 上一步实际移动的水平速度 */
  readonly moveVel = new THREE.Vector3();
  height = PLAYER.height;
  eyeHeight = PLAYER.eyeHeight;
  private readonly body: RigidBody;
  private collider: Collider;
  private readonly kcc: KinematicCharacterController;
  private snapping = true;
  private autostep = true;
  private spawn = { pos: new THREE.Vector3(), yaw: 0 };

  constructor(private readonly physics: PhysicsWorld) {
    const { R, world } = physics;
    this.body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased());
    this.collider = this.createCollider();
    const k = world.createCharacterController(0.02);
    k.setUp({ x: 0, y: 1, z: 0 });
    k.setMaxSlopeClimbAngle((PLAYER.maxSlopeDeg * Math.PI) / 180);
    k.setMinSlopeSlideAngle((PLAYER.minSlideDeg * Math.PI) / 180);
    k.enableAutostep(PLAYER.stepHeight, 0.2, false);
    k.enableSnapToGround(PLAYER.snapDistance);
    k.setSlideEnabled(true);
    k.setApplyImpulsesToDynamicBodies(false);
    this.kcc = k;
  }

  private get centerOffset() {
    return this.height / 2;
  }

  private createCollider(): Collider {
    const { R, world } = this.physics;
    const halfHeight = Math.max(0.1, this.height / 2 - PLAYER.radius);
    const desc = R.ColliderDesc.capsule(halfHeight, PLAYER.radius).setCollisionGroups(COLLIDE_PLAYER);
    return world.createCollider(desc, this.body);
  }

  /** 按角色身高重建胶囊（脚底位置不变）。eyeHeight 用于第一人称相机。 */
  configureBody(height: number, eyeHeight: number) {
    this.height = THREE.MathUtils.clamp(height, 0.9, 2.2);
    this.eyeHeight = THREE.MathUtils.clamp(eyeHeight, 0.6, this.height);
    this.physics.world.removeCollider(this.collider, false);
    this.collider = this.createCollider();
    this.teleport(this.curr.clone(), this.yaw, this.pitch);
  }

  setSpawn(pos: THREE.Vector3, yaw: number) {
    this.spawn = { pos: pos.clone(), yaw };
  }

  /** 瞬移到脚底位置 pos，朝向 yaw（0 = 看向 -z）。 */
  teleport(pos: THREE.Vector3, yaw = this.yaw, pitch = 0) {
    this.curr.copy(pos);
    this.prev.copy(pos);
    this.vel.set(0, 0, 0);
    this.moveVel.set(0, 0, 0);
    this.vy = 0;
    this.yaw = yaw;
    this.pitch = pitch;
    const c = { x: pos.x, y: pos.y + this.centerOffset, z: pos.z };
    this.body.setTranslation(c, true);
    this.body.setNextKinematicTranslation(c);
  }

  respawn() {
    this.teleport(this.spawn.pos, this.spawn.yaw);
  }

  look(dx: number, dy: number, minPitch = -89, maxPitch = 89) {
    this.yaw -= dx * PLAYER.mouseSensitivity;
    this.pitch -= dy * PLAYER.mouseSensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch, (minPitch * Math.PI) / 180, (maxPitch * Math.PI) / 180);
  }

  /** 一个固定物理步。调用后需要 world.step()。 */
  fixedUpdate(dt: number, move: MoveIntent, jump: boolean) {
    this.prev.copy(this.curr);

    // 水平速度：朝目标速度按加速度逼近，空中只有部分操控
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let wx = -sin * move.forward + cos * move.right;
    let wz = -cos * move.forward - sin * move.right;
    const len = Math.hypot(wx, wz);
    if (len > 1) {
      wx /= len;
      wz /= len;
    }
    const speed = move.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const tx = wx * speed;
    const tz = wz * speed;
    const maxDelta = PLAYER.accel * (this.grounded ? 1 : PLAYER.airControl) * dt;
    const dx = tx - this.vel.x;
    const dz = tz - this.vel.z;
    const dl = Math.hypot(dx, dz);
    if (dl <= maxDelta) {
      this.vel.x = tx;
      this.vel.z = tz;
    } else {
      this.vel.x += (dx / dl) * maxDelta;
      this.vel.z += (dz / dl) * maxDelta;
    }

    // 竖直速度
    if (jump && this.grounded) {
      this.vy = Math.sqrt(2 * PLAYER.gravity * PLAYER.jumpHeight);
      this.grounded = false;
    } else {
      this.vy -= PLAYER.gravity * dt;
    }
    // 上升时关掉贴地吸附，否则起跳会被吸回地面
    const wantSnap = this.vy <= 0;
    if (wantSnap !== this.snapping) {
      if (wantSnap) this.kcc.enableSnapToGround(PLAYER.snapDistance);
      else this.kcc.disableSnapToGround();
      this.snapping = wantSnap;
    }
    // 自动上台阶只在地面上生效，否则空中会被“抬”上比跳跃高度更高的矮墙
    if (this.grounded !== this.autostep) {
      if (this.grounded) this.kcc.enableAutostep(PLAYER.stepHeight, 0.2, false);
      else this.kcc.disableAutostep();
      this.autostep = this.grounded;
    }

    const desired = { x: this.vel.x * dt, y: this.vy * dt, z: this.vel.z * dt };
    this.kcc.computeColliderMovement(this.collider, desired);
    const m = this.kcc.computedMovement();
    this.curr.set(this.curr.x + m.x, this.curr.y + m.y, this.curr.z + m.z);
    this.body.setNextKinematicTranslation({ x: this.curr.x, y: this.curr.y + this.centerOffset, z: this.curr.z });

    // 实际走出的水平速度（撞墙时比 vel 小），给动画用，角色不会对着墙“原地狂奔”
    if (dt > 0) this.moveVel.set(m.x / dt, 0, m.z / dt);

    this.grounded = this.kcc.computedGrounded();
    if (this.grounded && this.vy < 0) this.vy = 0;
    // 顶到天花板：向上的位移被挡住
    if (this.vy > 0 && m.y < desired.y * 0.5) this.vy = 0;

    if (this.curr.y < PLAYER.respawnY) this.respawn();
  }

  /** 插值后的眼睛位置。alpha = 当前帧在两个物理步之间的比例。 */
  eyePosition(alpha: number, out: THREE.Vector3): THREE.Vector3 {
    out.lerpVectors(this.prev, this.curr, alpha);
    out.y += this.eyeHeight;
    return out;
  }

  /** 插值后的脚底位置 */
  feetPosition(alpha: number, out: THREE.Vector3): THREE.Vector3 {
    return out.lerpVectors(this.prev, this.curr, alpha);
  }

  get horizontalSpeed(): number {
    return Math.hypot(this.moveVel.x, this.moveVel.z);
  }
}
