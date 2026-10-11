import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import { ProceduralAnimator, type AnimInput } from './ProceduralAnimator.ts';
import type { Seat } from '../systems/Seats.ts';

export const DEFAULT_AVATAR_URL = `${import.meta.env.BASE_URL}models/player.vrm`;

/**
 * 玩家的角色模型：加载 VRM（任何 VRM 0.x / 1.0 都行），测量身高和眼睛高度，
 * 朝移动方向转身，跑程序动画，脚下放一个圆形软影子。加载失败时用胶囊占位。
 */
export class Avatar {
  readonly root = new THREE.Group();
  readonly vrm: VRM | null;
  readonly height: number;
  readonly eyeHeight: number;
  private readonly animator: ProceduralAnimator | null;
  private readonly shadow: THREE.Mesh;
  private facing = 0;

  private constructor(vrm: VRM | null, model: THREE.Object3D) {
    this.vrm = vrm;
    this.root.name = 'avatar';
    this.root.add(model);

    // 身高：包围盒高度；眼睛：头骨世界坐标 + lookAt 偏移（VRM 里定义的眼睛位置）
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    this.height = Math.max(0.5, box.max.y - Math.min(0, box.min.y));
    let eye = this.height * 0.9;
    const head = vrm?.humanoid.getNormalizedBoneNode('head');
    if (vrm && head) {
      const p = head.getWorldPosition(new THREE.Vector3());
      eye = p.y + (vrm.lookAt?.offsetFromHeadBone.y ?? this.height * 0.06);
    }
    this.eyeHeight = eye;
    this.animator = vrm ? new ProceduralAnimator(vrm, this.height) : null;

    this.shadow = createBlobShadow();
    this.shadow.scale.setScalar(this.height * 0.42);
  }

  /**
   * 加载 VRM；失败时返回胶囊占位并在 error 里给出原因。
   * firstPerson：玩家自己的模型才需要（第一人称时隐藏头部）；NPC 传 false，否则第一人称下会看不到 NPC 的头。
   */
  static async load(url = DEFAULT_AVATAR_URL, opts: { firstPerson?: boolean; quiet?: boolean } = {}): Promise<{ avatar: Avatar; error?: unknown }> {
    try {
      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));
      const gltf = await loader.loadAsync(url);
      const vrm = gltf.userData.vrm as VRM | undefined;
      if (!vrm) throw new Error('不是 VRM 文件');
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.combineSkeletons(gltf.scene);
      VRMUtils.rotateVRM0(vrm); // VRM 0.x 面朝 -Z，统一转成面朝 +Z
      vrm.scene.traverse((o) => {
        o.frustumCulled = false;
        // 描边统一由后处理画，关掉 MToon 自带描边，避免描两遍
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) if ((m as { isOutline?: boolean }).isOutline) m.visible = false;
      });
      if (opts.firstPerson !== false) vrm.firstPerson?.setup();
      return { avatar: new Avatar(vrm, vrm.scene) };
    } catch (error) {
      if (!opts.quiet) console.warn('[avatar] VRM 加载失败，改用占位模型', error);
      return { avatar: new Avatar(null, createPlaceholder()), error };
    }
  }

  /** 第一人称时隐藏自己的头（VRM 的 firstPerson 图层）。 */
  applyCameraLayers(camera: THREE.Camera, firstPerson: boolean) {
    const fp = this.vrm?.firstPerson;
    if (!fp) return;
    if (firstPerson) {
      camera.layers.enable(fp.firstPersonOnlyLayer);
      camera.layers.disable(fp.thirdPersonOnlyLayer);
    } else {
      camera.layers.disable(fp.firstPersonOnlyLayer);
      camera.layers.enable(fp.thirdPersonOnlyLayer);
    }
  }

  /** 立即朝向某个方向（脚底坐标系下的 yaw，0 = 面朝 +Z）。 */
  setFacing(angle: number) {
    this.facing = angle;
    this.root.rotation.y = angle;
  }

  addTo(scene: THREE.Scene) {
    scene.add(this.root, this.shadow);
  }

  /** 站立时髋部离地高度 */
  get hipsHeight(): number {
    return this.animator?.hipsHeight ?? this.height * 0.45;
  }

  /**
   * feet：插值后的脚底位置；vel：实际水平速度；groundY：脚下地面高度（没有则 null）；
   * seat：坐着时的座位（髋部放到座面上、朝座位方向）。
   */
  update(dt: number, feet: THREE.Vector3, vel: THREE.Vector3, input: AnimInput, groundY: number | null, seat: Seat | null = null) {
    if (seat) {
      this.root.position.set(seat.x, seat.y - this.hipsHeight + 0.03, seat.z);
      this.facing = seat.yaw;
      this.root.rotation.y = seat.yaw;
      input = { ...input, speed: 0, grounded: true, sit: true, kart: seat.pose === 'kart' };
      groundY = seat.y - 0.46;
      feet = this.root.position;
    } else {
      this.root.position.copy(feet);
    }
    const speed = seat ? 0 : Math.hypot(vel.x, vel.z);
    if (speed > 0.25) {
      const target = Math.atan2(vel.x, vel.z);
      let d = target - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * (1 - Math.exp(-12 * dt));
      this.root.rotation.y = this.facing;
    }
    this.animator?.update(dt, input);
    this.vrm?.update(dt);

    if (groundY === null) {
      this.shadow.visible = false;
    } else {
      const above = Math.max(0, feet.y - groundY);
      this.shadow.visible = this.root.visible;
      this.shadow.position.set(feet.x, groundY + 0.015, feet.z);
      const k = THREE.MathUtils.clamp(1 - above / 3, 0.25, 1);
      (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.32 * k;
      this.shadow.scale.setScalar(this.height * 0.42 * (0.7 + 0.3 * k));
    }
  }

  setVisible(v: boolean) {
    this.root.visible = v;
    if (!v) this.shadow.visible = false;
  }
}

/** 加载失败时的占位：卡通胶囊 + 小鼻子指示朝向。 */
function createPlaceholder(): THREE.Object3D {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.0, 6, 16), new THREE.MeshToonMaterial({ color: '#ffb347' }));
  body.position.y = 0.78;
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), new THREE.MeshToonMaterial({ color: '#ffffff' }));
  nose.position.set(0, 1.25, 0.27);
  g.add(body, nose);
  return g;
}

/** 脚下的圆形软影子（不需要实时阴影） */
function createBlobShadow(): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(40,30,20,1)');
  grad.addColorStop(0.55, 'rgba(40,30,20,0.55)');
  grad.addColorStop(1, 'rgba(40,30,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.32, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 2;
  mesh.name = 'avatar-shadow';
  return mesh;
}
