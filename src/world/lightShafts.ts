import * as THREE from 'three';
import type { MallLayout } from '../data/layoutTypes.ts';
import type { DayCycle } from '../render/DayCycle.ts';

// 天窗光束：每个带天窗的中庭一根从屋顶斜照下来的半透明光柱（加法混合，越往下越淡）。
// 倾斜方向跟太阳走，白天暖白、日落发橙、夜里消失。只是画面效果，不影响光照计算。

interface Shaft {
  mesh: THREE.Mesh;
  top: number;
  bottom: number;
  rect: { x0: number; z0: number; x1: number; z1: number };
}

export class LightShafts {
  readonly group = new THREE.Group();
  private readonly shafts: Shaft[] = [];
  private readonly material: THREE.ShaderMaterial;

  constructor(layout: MallLayout) {
    this.group.name = 'light-shafts';
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
      uniforms: { color: { value: new THREE.Color('#fff4dc') }, strength: { value: 0.0 } },
      vertexShader: /* glsl */ `
        attribute float fade;
        varying float vFade;
        void main() {
          vFade = fade;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 color;
        uniform float strength;
        varying float vFade;
        void main() {
          // 先夹到 0–1：插值可能出现极小的负数，pow 会得到 NaN，泛光模糊会把它扩散成黑块
          float f = clamp(vFade, 0.0, 1.0);
          gl_FragColor = vec4(color * strength * f * sqrt(f), 1.0);
        }`,
    });
    const H = layout.building.floorHeight;
    const top = (Math.max(...layout.floors.map((f) => f.level)) + 1) * H;
    for (const a of layout.atriums) {
      if (!a.skylight) continue;
      const inset = 0.6;
      const r = a.rect;
      const geo = new THREE.BufferGeometry();
      // 4 个侧面，每个面 4 个顶点（上两个、下两个）
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
      const fade = new Float32Array(16);
      for (let f = 0; f < 4; f++) fade.set([1, 1, 0, 0], f * 4);
      geo.setAttribute('fade', new THREE.BufferAttribute(fade, 1));
      const idx: number[] = [];
      for (let f = 0; f < 4; f++) idx.push(f * 4, f * 4 + 2, f * 4 + 1, f * 4 + 1, f * 4 + 2, f * 4 + 3);
      geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.frustumCulled = false;
      mesh.renderOrder = 5;
      this.group.add(mesh);
      this.shafts.push({ mesh, top: top - 0.1, bottom: (a.fromFloor - 1) * H, rect: { x0: r.x + inset, z0: r.z + inset, x1: r.x + r.w - inset, z1: r.z + r.d - inset } });
    }
  }

  update(day: DayCycle) {
    const s = day.sunDir;
    const elev = Math.max(0.15, s.y);
    const strength = THREE.MathUtils.clamp((s.y - 0.12) * 1.6, 0, 1) * (1 - day.night) * 0.32;
    this.material.uniforms.strength.value = strength;
    this.material.uniforms.color.value.set('#fff4dc').lerp(new THREE.Color('#ffa65c'), day.dusk);
    this.group.visible = strength > 0.002;
    for (const sh of this.shafts) {
      const h = sh.top - sh.bottom;
      const max = h * 0.45;
      const ox = THREE.MathUtils.clamp((-s.x / elev) * h, -max, max);
      const oz = THREE.MathUtils.clamp((-s.z / elev) * h, -max, max);
      const { x0, z0, x1, z1 } = sh.rect;
      const corners: [number, number][] = [
        [x0, z0],
        [x1, z0],
        [x1, z1],
        [x0, z1],
      ];
      const pos = sh.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let f = 0; f < 4; f++) {
        const [ax, az] = corners[f];
        const [bx, bz] = corners[(f + 1) % 4];
        pos.setXYZ(f * 4, ax, sh.top, az);
        pos.setXYZ(f * 4 + 1, bx, sh.top, bz);
        pos.setXYZ(f * 4 + 2, ax + ox, sh.bottom, az + oz);
        pos.setXYZ(f * 4 + 3, bx + ox, sh.bottom, bz + oz);
      }
      pos.needsUpdate = true;
    }
  }
}
