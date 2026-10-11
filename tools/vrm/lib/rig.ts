// 骨架与基准尺寸。所有数值都是"基准身高约 1.5 m"时的世界坐标（T-pose），
// 生成完整模型后再整体等比缩放到 spec.height。

import type { V3 } from './geom.ts';

export type HumanBone =
  | 'hips'
  | 'spine'
  | 'chest'
  | 'neck'
  | 'head'
  | 'leftShoulder'
  | 'leftUpperArm'
  | 'leftLowerArm'
  | 'leftHand'
  | 'rightShoulder'
  | 'rightUpperArm'
  | 'rightLowerArm'
  | 'rightHand'
  | 'leftUpperLeg'
  | 'leftLowerLeg'
  | 'leftFoot'
  | 'rightUpperLeg'
  | 'rightLowerLeg'
  | 'rightFoot';

export interface JointDef {
  /** 节点名（humanoid 骨骼用 VRM 名字，其他如 hairTail1） */
  name: string;
  parent: string | null;
  /** T-pose 世界坐标（基准尺寸） */
  pos: V3;
  humanBone?: HumanBone;
}

/** 关键尺寸（基准尺寸，米） */
export const B = {
  hipsY: 0.555,
  spineY: 0.63,
  chestY: 0.76,
  neckY: 0.9,
  headY: 0.958,
  armY: 0.872,
  shoulderX: 0.035,
  upperArmX: 0.13,
  lowerArmX: 0.29,
  handX: 0.425,
  legX: 0.083,
  upperLegY: 0.495,
  lowerLegY: 0.285,
  footY: 0.075,
  /** 头（颅骨椭球）中心与半轴；taper：下半部收窄（下巴更圆润） */
  headC: [0, 1.176, 0.004] as V3,
  headR: [0.214, 0.198, 0.192] as V3,
  headTaper: 0.12,
};

function side(name: string, parent: string, pos: V3, bone: HumanBone): JointDef[] {
  const r = bone.replace('left', 'right') as HumanBone;
  const rn = name.replace('Left', 'Right');
  const rp = parent.replace('Left', 'Right');
  return [
    { name, parent, pos, humanBone: bone },
    { name: rn, parent: rp, pos: [-pos[0], pos[1], pos[2]], humanBone: r },
  ];
}

export function humanoidJoints(): JointDef[] {
  return [
    { name: 'Hips', parent: null, pos: [0, B.hipsY, 0], humanBone: 'hips' },
    { name: 'Spine', parent: 'Hips', pos: [0, B.spineY, 0], humanBone: 'spine' },
    { name: 'Chest', parent: 'Spine', pos: [0, B.chestY, 0], humanBone: 'chest' },
    { name: 'Neck', parent: 'Chest', pos: [0, B.neckY, 0], humanBone: 'neck' },
    { name: 'Head', parent: 'Neck', pos: [0, B.headY, 0], humanBone: 'head' },
    ...side('LeftShoulder', 'Chest', [B.shoulderX, B.armY, 0], 'leftShoulder'),
    ...side('LeftUpperArm', 'LeftShoulder', [B.upperArmX, B.armY, 0], 'leftUpperArm'),
    ...side('LeftLowerArm', 'LeftUpperArm', [B.lowerArmX, B.armY, 0], 'leftLowerArm'),
    ...side('LeftHand', 'LeftLowerArm', [B.handX, B.armY, 0], 'leftHand'),
    ...side('LeftUpperLeg', 'Hips', [B.legX, B.upperLegY, 0], 'leftUpperLeg'),
    ...side('LeftLowerLeg', 'LeftUpperLeg', [B.legX, B.lowerLegY, 0], 'leftLowerLeg'),
    ...side('LeftFoot', 'LeftLowerLeg', [B.legX, B.footY, 0], 'leftFoot'),
  ];
}
