import * as THREE from 'three';

/** WebGL 渲染器、场景、相机和灰盒阶段的基础光照。阶段 2 在这里接入卡通着色和后处理。 */
export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 600);
    this.camera.rotation.order = 'YXZ';

    this.scene.background = new THREE.Color('#bfe4ff');
    this.scene.fog = new THREE.Fog('#d6ecff', 90, 260);

    const hemi = new THREE.HemisphereLight('#ffffff', '#b9b3a8', 1.7);
    const sun = new THREE.DirectionalLight('#fff1dc', 1.5);
    sun.position.set(40, 80, 30);
    const ambient = new THREE.AmbientLight('#ffffff', 0.35);
    this.scene.add(hemi, sun, ambient);

    window.addEventListener('resize', () => this.resize());
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
