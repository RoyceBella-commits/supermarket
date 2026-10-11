import * as THREE from 'three';
import { BlendFunction, Effect, EffectAttribute } from 'postprocessing';

// 卡通描边（后处理）：比较相邻像素的深度和法线，变化大的地方就是轮廓或折角。
// 线不是纯黑，而是把底色压暗（“明亮柔和”风格），并随距离变淡，远处不会糊成一片。
const fragmentShader = /* glsl */ `
uniform sampler2D normalBuffer;
uniform float thickness;
uniform float depthThreshold;
uniform float normalThreshold;
uniform float darken;
uniform float fadeStart;
uniform float fadeEnd;

vec3 readNormal(const in vec2 uv) {
  return normalize(texture2D(normalBuffer, uv).xyz * 2.0 - 1.0);
}

float linearDepthAt(const in vec2 uv) {
  return -getViewZ(readDepth(uv));
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  vec2 o = texelSize * thickness;
  float dC = -getViewZ(depth);

  float dL = linearDepthAt(uv - vec2(o.x, 0.0));
  float dR = linearDepthAt(uv + vec2(o.x, 0.0));
  float dU = linearDepthAt(uv + vec2(0.0, o.y));
  float dD = linearDepthAt(uv - vec2(0.0, o.y));
  // 相对深度差（远处的面天然深度差大，所以除以距离）
  float dEdge = max(max(abs(dL - dC), abs(dR - dC)), max(abs(dU - dC), abs(dD - dC))) / max(dC, 0.05);
  float depthEdge = smoothstep(depthThreshold, depthThreshold * 2.0, dEdge);

  vec3 nC = readNormal(uv);
  float nEdge = 0.0;
  nEdge = max(nEdge, 1.0 - dot(nC, readNormal(uv - vec2(o.x, 0.0))));
  nEdge = max(nEdge, 1.0 - dot(nC, readNormal(uv + vec2(o.x, 0.0))));
  nEdge = max(nEdge, 1.0 - dot(nC, readNormal(uv + vec2(0.0, o.y))));
  nEdge = max(nEdge, 1.0 - dot(nC, readNormal(uv - vec2(0.0, o.y))));
  float normalEdge = smoothstep(normalThreshold, normalThreshold * 1.6, nEdge);

  float edge = max(depthEdge, normalEdge);
  edge *= 1.0 - smoothstep(fadeStart, fadeEnd, dC);

  vec3 lined = inputColor.rgb * darken;
  outputColor = vec4(mix(inputColor.rgb, lined, edge), inputColor.a);
}
`;

export interface ToonEdgeOptions {
  normalBuffer: THREE.Texture;
  /** 线宽（像素） */
  thickness?: number;
  depthThreshold?: number;
  normalThreshold?: number;
  /** 线条颜色 = 底色 × darken */
  darken?: number;
  fadeStart?: number;
  fadeEnd?: number;
}

export class ToonEdgeEffect extends Effect {
  constructor(o: ToonEdgeOptions) {
    super('ToonEdgeEffect', fragmentShader, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, THREE.Uniform>([
        ['normalBuffer', new THREE.Uniform(o.normalBuffer)],
        ['thickness', new THREE.Uniform(o.thickness ?? 1)],
        ['depthThreshold', new THREE.Uniform(o.depthThreshold ?? 0.06)],
        ['normalThreshold', new THREE.Uniform(o.normalThreshold ?? 0.25)],
        ['darken', new THREE.Uniform(o.darken ?? 0.42)],
        ['fadeStart', new THREE.Uniform(o.fadeStart ?? 45)],
        ['fadeEnd', new THREE.Uniform(o.fadeEnd ?? 140)],
      ]),
    });
  }

  set thickness(v: number) {
    this.uniforms.get('thickness')!.value = v;
  }
}
