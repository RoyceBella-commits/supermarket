// gltf-transform 自定义扩展：写 VRMC_vrm（根）、VRMC_materials_mtoon（每个材质）、VRMC_springBone（根）。
// 数据里直接引用 gltf-transform 的 Node / Mesh / Material 对象，write() 时用 WriterContext 的索引表换成下标。

import { Extension, type Material, type Node, type ReaderContext, type WriterContext } from '@gltf-transform/core';

export interface VrmMeta {
  name: string;
  version: string;
  authors: string[];
  copyrightInformation?: string;
}

export interface ExpressionDef {
  binds: { node: Node; index: number; weight: number }[];
  isBinary?: boolean;
  overrideBlink?: 'none' | 'block' | 'blend';
  overrideLookAt?: 'none' | 'block' | 'blend';
  overrideMouth?: 'none' | 'block' | 'blend';
}

export interface VrmData {
  meta: VrmMeta;
  humanBones: Record<string, Node>;
  firstPerson: { node: Node; type: 'auto' | 'both' | 'thirdPersonOnly' | 'firstPersonOnly' }[];
  lookAtOffset: [number, number, number];
  expressions: Record<string, ExpressionDef>;
}

export interface MToonDef {
  shadeColor: [number, number, number];
  shadingToony: number;
  shadingShift: number;
  giEqualization: number;
  outlineWidth: number;
  outlineColor: [number, number, number];
  outlineLightingMix: number;
  rimColor?: [number, number, number];
  rimFresnelPower?: number;
  rimLift?: number;
}

export interface SpringDef {
  colliders: { node: Node; offset: [number, number, number]; radius: number }[];
  springs: {
    name: string;
    joints: { node: Node; hitRadius: number; stiffness: number; gravityPower: number; dragForce: number }[];
    /** colliders 的下标 */
    colliders: number[];
  }[];
}

export class VRMCVrm extends Extension {
  static EXTENSION_NAME = 'VRMC_vrm';
  extensionName = 'VRMC_vrm';
  data: VrmData | null = null;

  read(_context: ReaderContext): this {
    return this;
  }

  write(context: WriterContext): this {
    const d = this.data;
    if (!d) return this;
    const nodeIndex = (n: Node) => {
      const i = context.nodeIndexMap.get(n);
      if (i === undefined) throw new Error(`VRMC_vrm: node ${n.getName()} not written`);
      return i;
    };
    const humanBones: Record<string, { node: number }> = {};
    for (const [bone, node] of Object.entries(d.humanBones)) humanBones[bone] = { node: nodeIndex(node) };
    const preset: Record<string, unknown> = {};
    for (const [name, e] of Object.entries(d.expressions)) {
      preset[name] = {
        morphTargetBinds: e.binds.map((b) => ({ node: nodeIndex(b.node), index: b.index, weight: b.weight })),
        isBinary: e.isBinary ?? false,
        overrideBlink: e.overrideBlink ?? 'none',
        overrideLookAt: e.overrideLookAt ?? 'none',
        overrideMouth: e.overrideMouth ?? 'none',
      };
    }
    const range = (deg: number) => ({ inputMaxValue: deg, outputScale: 1 });
    const json = context.jsonDoc.json;
    json.extensions = json.extensions ?? {};
    json.extensions[VRMCVrm.EXTENSION_NAME] = {
      specVersion: '1.0',
      meta: {
        name: d.meta.name,
        version: d.meta.version,
        authors: d.meta.authors,
        copyrightInformation: d.meta.copyrightInformation ?? '',
        licenseUrl: 'https://vrm.dev/licenses/1.0/',
        avatarPermission: 'everyone',
        allowExcessivelyViolentUsage: false,
        allowExcessivelySexualUsage: false,
        commercialUsage: 'corporation',
        allowPoliticalOrReligiousUsage: false,
        allowAntisocialOrHateUsage: false,
        creditNotation: 'unnecessary',
        allowRedistribution: true,
        modification: 'allowModificationRedistribution',
      },
      humanoid: { humanBones },
      firstPerson: {
        meshAnnotations: d.firstPerson.map((a) => ({ node: nodeIndex(a.node), type: a.type })),
      },
      lookAt: {
        offsetFromHeadBone: d.lookAtOffset,
        type: 'expression',
        rangeMapHorizontalInner: range(30),
        rangeMapHorizontalOuter: range(30),
        rangeMapVerticalDown: range(25),
        rangeMapVerticalUp: range(25),
      },
      expressions: { preset, custom: {} },
    };
    return this;
  }
}

export class VRMCMToon extends Extension {
  static EXTENSION_NAME = 'VRMC_materials_mtoon';
  extensionName = 'VRMC_materials_mtoon';
  defs = new Map<Material, MToonDef>();

  read(_context: ReaderContext): this {
    return this;
  }

  write(context: WriterContext): this {
    const json = context.jsonDoc.json;
    for (const [mat, m] of this.defs) {
      const i = context.materialIndexMap.get(mat);
      if (i === undefined || !json.materials) continue;
      const def = json.materials[i];
      def.extensions = def.extensions ?? {};
      const outline = m.outlineWidth > 0;
      def.extensions[VRMCMToon.EXTENSION_NAME] = {
        specVersion: '1.0',
        transparentWithZWrite: false,
        renderQueueOffsetNumber: 0,
        shadeColorFactor: m.shadeColor,
        shadingShiftFactor: m.shadingShift,
        shadingToonyFactor: m.shadingToony,
        giEqualizationFactor: m.giEqualization,
        matcapFactor: [1, 1, 1],
        parametricRimColorFactor: m.rimColor ?? [0, 0, 0],
        rimLightingMixFactor: 1,
        parametricRimFresnelPowerFactor: m.rimFresnelPower ?? 5,
        parametricRimLiftFactor: m.rimLift ?? 0,
        outlineWidthMode: outline ? 'worldCoordinates' : 'none',
        outlineWidthFactor: outline ? m.outlineWidth : 0,
        outlineColorFactor: m.outlineColor,
        outlineLightingMixFactor: m.outlineLightingMix,
        uvAnimationScrollXSpeedFactor: 0,
        uvAnimationScrollYSpeedFactor: 0,
        uvAnimationRotationSpeedFactor: 0,
      };
    }
    return this;
  }
}

export class VRMCSpringBone extends Extension {
  static EXTENSION_NAME = 'VRMC_springBone';
  extensionName = 'VRMC_springBone';
  data: SpringDef | null = null;

  read(_context: ReaderContext): this {
    return this;
  }

  write(context: WriterContext): this {
    const d = this.data;
    if (!d || d.springs.length === 0) return this;
    const idx = (n: Node) => {
      const i = context.nodeIndexMap.get(n);
      if (i === undefined) throw new Error('VRMC_springBone: node not written');
      return i;
    };
    const json = context.jsonDoc.json;
    json.extensions = json.extensions ?? {};
    // 只给有碰撞体的 spring 建碰撞组（colliderGroups.colliders 不能为空）
    const groups: { name: string; colliders: number[] }[] = [];
    const groupOf = new Map<number, number>();
    d.springs.forEach((s, k) => {
      if (!s.colliders.length) return;
      groupOf.set(k, groups.length);
      groups.push({ name: s.name, colliders: s.colliders });
    });
    json.extensions[VRMCSpringBone.EXTENSION_NAME] = {
      specVersion: '1.0',
      colliders: d.colliders.map((c) => ({ node: idx(c.node), shape: { sphere: { offset: c.offset, radius: c.radius } } })),
      colliderGroups: groups,
      springs: d.springs.map((s, k) => ({
        name: s.name,
        joints: s.joints.map((j) => ({
          node: idx(j.node),
          hitRadius: j.hitRadius,
          stiffness: j.stiffness,
          gravityPower: j.gravityPower,
          gravityDir: [0, -1, 0],
          dragForce: j.dragForce,
        })),
        ...(groupOf.has(k) ? { colliderGroups: [groupOf.get(k)] } : {}),
      })),
    };
    return this;
  }
}
