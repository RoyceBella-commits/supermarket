import * as THREE from 'three';
import type { PhysicsWorld } from '../systems/physics/PhysicsWorld.ts';
import type { PlayerController } from './PlayerController.ts';

export type CameraMode = 'third' | 'first';

export const CAMERA = {
  distance: 3.6,
  minDistance: 1.4,
  maxDistance: 7.5,
  /** 第三人称俯仰范围（度）：往下看最多 70°，往上看最多 55° */
  thirdPitch: [-70, 55] as [number, number],
  firstPitch: [-89, 89] as [number, number],
  /** 离墙留出的余量，避免相机近裁面切进墙里 */
  wallMargin: 0.28,
  /** 离角色太近时隐藏角色 */
  hideAvatarBelow: 0.75,
};

const tmpDir = new THREE.Vector3();
const tmpPivot = new THREE.Vector3();

/**
 * 相机：第三人称绕角色旋转（鼠标控制 yaw/pitch，滚轮控制远近），用射线防止穿墙；第一人称放在眼睛位置。
 * 相机朝向就是 PlayerController 的 yaw/pitch，移动方向也相对它，所以两种视角操作一致。
 */
export class CameraRig {
  mode: CameraMode = 'third';
  private wanted = CAMERA.distance;
  private current = CAMERA.distance;
  /** 平滑后的注视点（角色胸口/头部） */
  private readonly pivot = new THREE.Vector3();
  private pivotReady = false;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly physics: PhysicsWorld,
  ) {}

  get pitchLimits(): [number, number] {
    return this.mode === 'third' ? CAMERA.thirdPitch : CAMERA.firstPitch;
  }

  toggle(): CameraMode {
    this.mode = this.mode === 'third' ? 'first' : 'third';
    this.pivotReady = false;
    return this.mode;
  }

  /** 传送后调用：注视点直接跳到新位置，相机距离恢复，不做平滑。 */
  reset() {
    this.pivotReady = false;
    this.current = this.wanted;
  }

  zoom(deltaY: number) {
    if (this.mode !== 'third') return;
    this.wanted = THREE.MathUtils.clamp(this.wanted * Math.exp(deltaY * 0.0012), CAMERA.minDistance, CAMERA.maxDistance);
  }

  /**
   * 每帧调用。返回相机到角色的实际距离（第一人称为 0），用来决定是否隐藏角色。
   */
  update(dt: number, player: PlayerController, alpha: number, seated: { pivot: THREE.Vector3; eye: THREE.Vector3 } | null = null): number {
    const cam = this.camera;
    if (this.mode === 'first') {
      if (seated) cam.position.copy(seated.eye);
      else player.eyePosition(alpha, cam.position);
      cam.rotation.set(player.pitch, player.yaw, 0);
      return 0;
    }

    // 注视点：头和肩膀之间（坐着时跟着坐姿）；竖直方向稍微平滑，上下楼梯时镜头不抖
    if (seated) tmpPivot.copy(seated.pivot);
    else {
      player.feetPosition(alpha, tmpPivot);
      tmpPivot.y += player.height * 0.86;
    }
    if (!this.pivotReady) {
      this.pivot.copy(tmpPivot);
      this.pivotReady = true;
    } else {
      this.pivot.x = tmpPivot.x;
      this.pivot.z = tmpPivot.z;
      this.pivot.y += (tmpPivot.y - this.pivot.y) * (1 - Math.exp(-14 * dt));
    }

    const cp = Math.cos(player.pitch);
    tmpDir.set(Math.sin(player.yaw) * cp, -Math.sin(player.pitch), Math.cos(player.yaw) * cp); // 从注视点指向相机
    const hit = this.physics.cameraRay(this.pivot, tmpDir, this.wanted + CAMERA.wallMargin);
    // 距离为 0 说明射线起点就在实体里（例如注视点正好穿过楼板），这种情况不算遮挡
    const allowed = hit === null || hit <= 1e-4 ? this.wanted : Math.max(0.2, hit - CAMERA.wallMargin);
    // 被挡住时立刻拉近，挡住的东西离开后慢慢退回
    if (allowed < this.current) this.current = allowed;
    else this.current += (allowed - this.current) * (1 - Math.exp(-5 * dt));

    cam.position.copy(this.pivot).addScaledVector(tmpDir, this.current);
    cam.rotation.set(player.pitch, player.yaw, 0);
    return this.current;
  }
}
