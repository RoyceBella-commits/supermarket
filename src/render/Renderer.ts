import * as THREE from 'three';
import { BloomEffect, EffectComposer, EffectPass, NormalPass, RenderPass, ToneMappingEffect, ToneMappingMode } from 'postprocessing';
import { ToonEdgeEffect } from './ToonEdgeEffect.ts';

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
  private readonly sky: THREE.Mesh;
  readonly sun: THREE.DirectionalLight;

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
    this.scene.fog = new THREE.Fog('#dcefff', 120, 420);
    this.sky = createSky();
    this.scene.add(this.sky);

    // 卡通明暗主要来自这盏主光（方向决定墙面落在哪一段），补光把暗部抬亮
    this.sun = new THREE.DirectionalLight('#fff4e2', 2.1);
    this.sun.position.set(30, 80, 45);
    const hemi = new THREE.HemisphereLight('#fdfbff', '#efe4d2', 1.1);
    const ambient = new THREE.AmbientLight('#ffffff', 0.25);
    this.scene.add(this.sun, hemi, ambient);

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
    composer.addPass(normalPass);
    const edges = new ToonEdgeEffect({ normalBuffer: normalPass.texture, thickness: Math.min(window.devicePixelRatio, 2) * 0.75 });
    const bloom = new BloomEffect({ luminanceThreshold: 0.92, luminanceSmoothing: 0.08, intensity: 0.45, mipmapBlur: true, radius: 0.6 });
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL });
    composer.addPass(new EffectPass(this.camera, edges, bloom, tone));
    this.composer = composer;
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

/** 上蓝下浅的渐变天空球（不受雾影响）。阶段 5 再做日落。 */
function createSky(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(600, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color('#6fb9f2') },
      horizon: { value: new THREE.Color('#e6f4ff') },
      bottom: { value: new THREE.Color('#f3efe6') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top;
      uniform vec3 horizon;
      uniform vec3 bottom;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 c = h > 0.0 ? mix(horizon, top, pow(smoothstep(0.0, 0.7, h), 0.8)) : mix(horizon, bottom, smoothstep(0.0, -0.2, h));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.name = 'sky';
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  return sky;
}
