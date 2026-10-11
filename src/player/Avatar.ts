import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM, type MToonMaterial } from '@pixiv/three-vrm';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
   * merge：合并身体网格（默认非第一人称时合并）。
   */
  static async load(url = DEFAULT_AVATAR_URL, opts: { firstPerson?: boolean; quiet?: boolean; merge?: boolean } = {}): Promise<{ avatar: Avatar; error?: unknown }> {
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
      // 店员（非第一人称）：身体各色网格合并成一个，省 draw call
      if (opts.merge ?? opts.firstPerson === false) mergeBodyMeshes(vrm.scene);
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

/**
 * 把同一骨架下、没有表情变形的不透明 MToon 网格合并成一个蒙皮网格：
 * 每个原材质的亮部色 / 暗部色写进两张 N×1 的调色板贴图（线性、浮点、最近邻），
 * 顶点 UV 指向自己那一格；其余 MToon 参数各材质本来就相同（生成器统一设置），所以外观不变。
 * 生成的角色一般从约 20 个网格降到约 8 个（脸部带表情的网格保持独立）。
 */
function mergeBodyMeshes(scene: THREE.Object3D) {
  const cands: THREE.SkinnedMesh[] = [];
  scene.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh || Object.keys(m.geometry.morphAttributes).length > 0) return;
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as MToonMaterial;
    if (!mat.isMToonMaterial || mat.transparent || mat.map || mat.shadeMultiplyTexture) return;
    cands.push(m);
  });
  const base = cands[0];
  if (!base) return;
  const group = cands.filter((m) => m.skeleton === base.skeleton && m.parent === base.parent && m.bindMatrix.equals(base.bindMatrix) && m.matrix.equals(base.matrix));
  if (group.length < 2) return;
  const n = group.length;
  const lit = new Float32Array(n * 4);
  const shade = new Float32Array(n * 4);
  const keep = ['position', 'normal', 'uv', 'skinIndex', 'skinWeight'];
  const geos = group.map((m, i) => {
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as MToonMaterial;
    lit.set([mat.color.r, mat.color.g, mat.color.b, 1], i * 4);
    shade.set([mat.shadeColorFactor.r, mat.shadeColorFactor.g, mat.shadeColorFactor.b, 1], i * 4);
    const g = m.geometry.clone();
    g.clearGroups();
    const count = g.attributes.position.count;
    const uv = new Float32Array(count * 2);
    for (let k = 0; k < count; k++) {
      uv[k * 2] = (i + 0.5) / n;
      uv[k * 2 + 1] = 0.5;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    for (const name of Object.keys(g.attributes)) if (!keep.includes(name)) g.deleteAttribute(name);
    return g;
  });
  const merged = mergeGeometries(geos);
  for (const g of geos) g.dispose();
  if (!merged) return;
  const palette = (data: Float32Array) => {
    const t = new THREE.DataTexture(data, n, 1, THREE.RGBAFormat, THREE.FloatType);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.LinearSRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  const baseMat = (Array.isArray(base.material) ? base.material[0] : base.material) as MToonMaterial;
  const mat = baseMat.clone() as MToonMaterial;
  mat.map = palette(lit);
  mat.color.setRGB(1, 1, 1);
  mat.shadeMultiplyTexture = palette(shade);
  mat.shadeColorFactor.setRGB(1, 1, 1);
  mat.needsUpdate = true;
  const mesh = new THREE.SkinnedMesh(merged, mat);
  mesh.name = 'Body_merged';
  mesh.frustumCulled = false;
  mesh.position.copy(base.position);
  mesh.quaternion.copy(base.quaternion);
  mesh.scale.copy(base.scale);
  mesh.layers.mask = base.layers.mask;
  base.parent!.add(mesh);
  mesh.bind(base.skeleton, base.bindMatrix);
  for (const m of group) {
    m.removeFromParent();
    m.geometry.dispose();
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
