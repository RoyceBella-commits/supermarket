// 测试用的外观组合（只生成到 tools/vrm/work/，用来检查每种发型/服装/配饰都能正常生成）。

import type { AvatarSpec } from '../../src/data/avatars.ts';

export function variantSpecs(): AvatarSpec[] {
  const base: Omit<AvatarSpec, 'id' | 'hair' | 'top' | 'bottom'> = {
    displayName: { zh: '测试', en: 'Test' },
    height: 1.5,
    skinColor: '#f3c9a8',
    hairColor: '#2f2a2a',
    eyeColor: '#2b201c',
    topColor: '#6aa6d8',
    bottomColor: '#3b3b46',
    shoeColor: '#e9e2d6',
  };
  return [
    { ...base, id: 'test-bob-tshirt-shorts', hair: 'bob', hairColor: '#c98a4b', top: 'tshirt', topColor: '#f08a8a', innerColor: '#ffffff', bottom: 'shorts', bottomColor: '#4c6a8c', accessory: 'glasses' },
    { ...base, id: 'test-buzz-shirt-pants', hair: 'buzz', top: 'shirt', topColor: '#ffffff', innerColor: '#3a5a8a', bottom: 'pants', bottomColor: '#56604a', skinColor: '#c99673', accessory: 'cap', accessoryColor: '#3d7bd9' },
    { ...base, id: 'test-bun-apron-pants', hair: 'bun', hairColor: '#1f1b1b', top: 'apron', topColor: '#b5523b', innerColor: '#f4efe6', bottom: 'pants', bottomColor: '#2b2b33', height: 1.44 },
    { ...base, id: 'test-short-hoodie-skirt', hair: 'short', hairColor: '#e2b860', top: 'hoodie', topColor: '#9ad0b5', bottom: 'skirt', bottomColor: '#7d6aa8', height: 1.52, accessory: 'cap', accessoryColor: '#f2f2f2' },
  ];
}
