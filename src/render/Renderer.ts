import * as THREE from 'three';
import { BloomEffect, EffectComposer, EffectPass, NormalPass, Pass, RenderPass, ToneMappingEffect, ToneMappingMode } from 'postprocessing';
import { ToonEdgeEffect } from './ToonEdgeEffect.ts';
import { DayCycle, createSkyDome } from './DayCycle.ts';

export interface RendererOptions {
  /** 关闭后处理（调试或低配时用 ?nofx） */
  postFx?: boolean;
}

/**
 * 渲染器、场景、相机、天空和灯光。
 * 后处理链：场景 → 法线（给描边用）→ 卡通描边 + 轻度泛光 + 色调映射。
 */
export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  /** 不参与描边的物体（光束这类半透明效果）：画法线时暂时隐藏 */
  private readonly noOutline: THREE.Object3D[] = [];
  private readonly sky: THREE.Mesh;
  readonly sun: THREE.DirectionalLight;
  /** 昼夜循环（太阳、天空、雾、补光） */
  readonly day: DayCycle;

  constructor(container: HTMLElement, opts: RendererOptions = {}) {
    const postFx = opts.postFx ?? true;
    this.renderer = new THREE.WebGLRenderer({
      antialias: !postFx,
      powerPreference: 'high-performance',
      stencil: false,
      depth: !postFx,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = postFx ? THREE.NoToneMapping : THREE.NeutralToneMapping;
    // 后处理一帧会调用多次 render，手动清零统计才能看到整帧的 draw call 数
    this.renderer.info.autoReset = false;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 700);
    this.camera.rotation.order = 'YXZ';

    this.scene.background = new THREE.Color('#cfe9ff');
    const fog = new THREE.Fog('#dcefff', 120, 420);
    this.scene.fog = fog;
    this.sky = createSkyDome();
    this.scene.add(this.sky);

    // 卡通明暗主要来自这盏主光（方向决定墙面落在哪一段），补光把暗部抬亮；颜色和方向由昼夜循环驱动
    this.sun = new THREE.DirectionalLight('#fff4e2', 2.1);
    this.sun.position.set(30, 80, 45);
    const hemi = new THREE.HemisphereLight('#fdfbff', '#efe4d2', 1.1);
    const ambient = new THREE.AmbientLight('#ffffff', 0.25);
    this.scene.add(this.sun, hemi, ambient);
    this.day = new DayCycle({ sun: this.sun, hemi, ambient, fog, sky: this.sky });

    if (postFx) this.setupPostFx();
    window.addEventListener('resize', () => this.resize());
  }

  private setupPostFx() {
    const composer = new EffectComposer(this.renderer, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: Math.min(4, this.renderer.capabilities.maxSamples),
    });
    composer.addPass(new RenderPass(this.scene, this.camera));
    const normalPass = new NormalPass(this.scene, this.camera);
    composer.addPass(new VisibilityPass(this.noOutline, false));
    composer.addPass(normalPass);
    composer.addPass(new VisibilityPass(this.noOutline, true));
    const edges = new ToonEdgeEffect({ normalBuffer: normalPass.texture, thickness: Math.min(window.devicePixelRatio, 2) * 0.75 });
    const bloom = new BloomEffect({ luminanceThreshold: 0.92, luminanceSmoothing: 0.08, intensity: 0.45, mipmapBlur: true, radius: 0.6 });
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL });
    composer.addPass(new EffectPass(this.camera, edges, bloom, tone));
    this.composer = composer;
  }

  /** 这个物体不描边（例如加法混合的光束） */
  excludeFromOutline(obj: THREE.Object3D) {
    this.noOutline.push(obj);
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer?.setSize(window.innerWidth, window.innerHeight);
  }

  render(dt: number) {
    this.renderer.info.reset();
    this.sky.position.copy(this.camera.position);
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  get drawCalls(): number {
    return this.renderer.info.render.calls;
  }
}

/** 在后处理链中途切换一组物体的可见性（画法线前隐藏，画完再恢复原来的可见性） */
class VisibilityPass extends Pass {
  constructor(
    private readonly objects: THREE.Object3D[],
    private readonly show: boolean,
  ) {
    super('VisibilityPass');
    this.needsSwap = false;
  }

  render() {
    for (const o of this.objects) {
      if (this.show) o.visible = hiddenState.get(o) ?? o.visible;
      else {
        hiddenState.set(o, o.visible);
        o.visible = false;
      }
    }
  }
}

const hiddenState = new WeakMap<THREE.Object3D, boolean>();
