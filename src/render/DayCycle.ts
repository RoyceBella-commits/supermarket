import * as THREE from 'three';

// 昼夜循环：游戏内一天默认 20 分钟。时间驱动太阳方位和颜色、天空、雾、补光，
// 并提供 night（0 白天 → 1 深夜）、dusk（日出日落时的暖色程度）给天窗光束、花园灯笼等使用。
// 室内照明夜里换成偏暖的灯光色、亮度基本不变（商场晚上开着灯），室外和天空会真正暗下来。

const STORAGE_KEY = 'mall.time';

export interface DayLighting {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  ambient: THREE.AmbientLight;
  fog: THREE.Fog;
  sky: THREE.Mesh;
}

interface Key {
  /** 太阳高度（-1..1，sin 值） */
  e: number;
  top: string;
  horizon: string;
  bottom: string;
  sun: string;
  sunI: number;
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  /** 环境光：夜里抬高，模拟商场室内的灯光 */
  ambI: number;
}

// 按太阳高度插值的关键帧：深夜、天快亮/刚黑、日出日落、上午下午、正午
const KEYS: Key[] = [
  { e: -0.35, top: '#070b1f', horizon: '#18233f', bottom: '#11141c', sun: '#8fa8ff', sunI: 0.4, hemiSky: '#fff0d6', hemiGround: '#9a8a78', hemiI: 1.5, ambI: 0.55 },
  { e: -0.08, top: '#1d2b55', horizon: '#6b5a8a', bottom: '#2a2533', sun: '#a9a2e8', sunI: 0.6, hemiSky: '#fff0d8', hemiGround: '#a8957f', hemiI: 1.45, ambI: 0.5 },
  { e: 0.05, top: '#4a6fa5', horizon: '#ffae6b', bottom: '#f0d2b0', sun: '#ffb47a', sunI: 1.2, hemiSky: '#fff5ea', hemiGround: '#ecdcc8', hemiI: 1.25, ambI: 0.35 },
  { e: 0.3, top: '#5fa8e8', horizon: '#dceefc', bottom: '#f3efe6', sun: '#fff0d8', sunI: 2.0, hemiSky: '#fdfbff', hemiGround: '#efe4d2', hemiI: 1.1, ambI: 0.25 },
  { e: 0.9, top: '#6fb9f2', horizon: '#e6f4ff', bottom: '#f3efe6', sun: '#fff4e2', sunI: 2.1, hemiSky: '#fdfbff', hemiGround: '#efe4d2', hemiI: 1.1, ambI: 0.25 },
];

export class DayCycle {
  /** 室外材质（地面、广场、外墙、屋顶）：夜里压暗，室内材质不变 */
  private outdoor: { mat: THREE.MeshToonMaterial; base: THREE.Color; dark: number }[] = [];

  setOutdoorMaterials(list: { mat: THREE.Material; dark: number }[]) {
    this.outdoor = list
      .filter((x): x is { mat: THREE.MeshToonMaterial; dark: number } => (x.mat as THREE.MeshToonMaterial).isMeshToonMaterial === true)
      .map((x) => ({ mat: x.mat, base: x.mat.color.clone(), dark: x.dark }));
    this.apply();
  }

  /** 当前时间（小时，0–24） */
  hours: number;
  /** 一天多少秒（真实时间） */
  dayLength = 1200;
  paused = false;
  /** 0 白天 → 1 深夜 */
  night = 0;
  /** 日出日落的暖色程度（0–1） */
  dusk = 0;
  readonly sunDir = new THREE.Vector3();
  private readonly listeners = new Set<(hours: number) => void>();
  private readonly c1 = new THREE.Color();
  private readonly c2 = new THREE.Color();
  private lastSaved = 0;

  constructor(private readonly l: DayLighting) {
    let start = 16.5;
    let paused = false;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const v = JSON.parse(raw) as { hours?: number; paused?: boolean };
        if (typeof v.hours === 'number' && v.hours >= 0 && v.hours < 24) start = v.hours;
        paused = !!v.paused;
      }
    } catch {
      // 没有存档
    }
    this.hours = start;
    this.paused = paused;
    this.apply();
  }

  onChange(fn: (hours: number) => void) {
    this.listeners.add(fn);
  }

  setHours(h: number) {
    this.hours = ((h % 24) + 24) % 24;
    this.apply();
    this.save();
  }

  setPaused(p: boolean) {
    this.paused = p;
    this.save();
  }

  /** “HH:MM” */
  get clock(): string {
    const h = Math.floor(this.hours);
    const m = Math.floor((this.hours - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  update(dt: number) {
    if (!this.paused) {
      const prev = this.hours;
      this.hours = (this.hours + (dt / this.dayLength) * 24) % 24;
      if (Math.floor(prev * 4) !== Math.floor(this.hours * 4)) this.apply();
      else this.applyFast();
      if (performance.now() - this.lastSaved > 5000) this.save();
    }
  }

  private save() {
    this.lastSaved = performance.now();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ hours: Math.round(this.hours * 100) / 100, paused: this.paused }));
    } catch {
      // 存不了就算了
    }
  }

  /** 太阳位置：6 点东边升起，12 点在南边最高，18 点西边落下 */
  private computeSun() {
    const t = (this.hours - 6) / 12; // 0 日出 → 1 日落
    const a = t * Math.PI;
    const elev = Math.sin(a) * 0.95; // 白天为正，夜里为负
    const east = Math.cos(a); // 1 东 → -1 西
    // 夜里把“太阳”当月亮挂在天上（方向取反），让室外还有一点冷色主光
    const e = elev;
    const dir = new THREE.Vector3(east, Math.max(0.12, Math.abs(e)), 0.55).normalize();
    this.sunDir.copy(dir);
    return e;
  }

  private applyFast() {
    // 每帧只更新太阳方向（光照颜色每 15 游戏分钟刷新一次即可，变化很慢）
    this.computeSun();
    this.l.sun.position.copy(this.sunDir).multiplyScalar(100);
    (this.l.sky.material as THREE.ShaderMaterial).uniforms.sunDir.value.copy(this.sunDir);
  }

  apply() {
    const e = this.computeSun();
    // 关键帧插值
    let i = 0;
    while (i < KEYS.length - 2 && e > KEYS[i + 1].e) i++;
    const k0 = KEYS[i];
    const k1 = KEYS[i + 1];
    const f = THREE.MathUtils.clamp((e - k0.e) / (k1.e - k0.e), 0, 1);
    const mix = (a: string, b: string, out: THREE.Color) => out.set(a).lerp(this.c2.set(b), f);
    const u = (this.l.sky.material as THREE.ShaderMaterial).uniforms;
    mix(k0.top, k1.top, u.top.value);
    mix(k0.horizon, k1.horizon, u.horizon.value);
    mix(k0.bottom, k1.bottom, u.bottom.value);
    this.l.fog.color.copy(u.horizon.value);
    mix(k0.sun, k1.sun, this.l.sun.color);
    this.l.sun.intensity = THREE.MathUtils.lerp(k0.sunI, k1.sunI, f);
    mix(k0.hemiSky, k1.hemiSky, this.l.hemi.color);
    mix(k0.hemiGround, k1.hemiGround, this.l.hemi.groundColor);
    this.l.hemi.intensity = THREE.MathUtils.lerp(k0.hemiI, k1.hemiI, f);
    this.l.ambient.intensity = THREE.MathUtils.lerp(k0.ambI, k1.ambI, f);
    this.night = THREE.MathUtils.clamp((0.05 - e) / 0.3, 0, 1);
    this.dusk = THREE.MathUtils.clamp(1 - Math.abs(e - 0.04) / 0.2, 0, 1);
    u.sunDir.value.copy(this.sunDir);
    u.sunColor.value.copy(this.c1.set(e > -0.05 ? '#fff1d6' : '#dfe6ff'));
    u.sunSize.value = e > -0.05 ? 0.9994 : 0.9997;
    u.night.value = this.night;
    this.l.sun.position.copy(this.sunDir).multiplyScalar(100);
    const blue = this.c1.set('#8ea4d6');
    // 室外材质夜里压暗（补光为了室内开着灯没有压暗，室外要另外处理）
    for (const o of this.outdoor) o.mat.color.copy(o.base).lerp(this.c2.copy(o.base).multiply(blue).multiplyScalar(o.dark * 0.75), this.night);
    for (const fn of this.listeners) fn(this.hours);
  }
}

/** 天空球：上下渐变 + 太阳（或月亮）圆盘和光晕 + 夜里的星星（不受雾影响） */
export function createSkyDome(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(600, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color('#6fb9f2') },
      horizon: { value: new THREE.Color('#e6f4ff') },
      bottom: { value: new THREE.Color('#f3efe6') },
      sunDir: { value: new THREE.Vector3(0.3, 0.8, 0.5).normalize() },
      sunColor: { value: new THREE.Color('#fff1d6') },
      sunSize: { value: 0.9994 },
      night: { value: 0 },
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
      uniform vec3 sunDir;
      uniform vec3 sunColor;
      uniform float sunSize;
      uniform float night;
      varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = h > 0.0 ? mix(horizon, top, pow(smoothstep(0.0, 0.7, h), 0.8)) : mix(horizon, bottom, smoothstep(0.0, -0.2, h));
        float s = dot(d, normalize(sunDir));
        // 光晕 + 圆盘（卡通：圆盘是硬边）
        c += sunColor * pow(max(s, 0.0), 48.0) * 0.35;
        c = mix(c, sunColor * 1.15, step(sunSize, s));
        // 星星：只在夜里、地平线以上
        if (night > 0.01 && h > 0.05) {
          vec3 g = floor(d * 220.0);
          float r = hash(g);
          float star = step(0.9965, r) * smoothstep(0.05, 0.3, h);
          c += vec3(star) * smoothstep(0.35, 1.0, night) * 0.9;
        }
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
