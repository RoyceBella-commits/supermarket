// 生成 VRM 1.0 角色：node tools/vrm/build.ts
//   默认：src/data/avatars.ts 里的每个角色 → public/<avatarModelUrl(spec)>
//         （玩家 public/models/player.vrm，店员 public/models/staff/<shopId>.vrm）
//   --variants：额外生成各种发型/服装组合到 tools/vrm/work/（不进仓库，用来在预览页检查）
//   --only=<id>：只生成某一个

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type AvatarSpec, avatarModelUrl, avatars } from '../../src/data/avatars.ts';
import { buildAvatar } from './lib/avatar.ts';
import { variantSpecs } from './variants.ts';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..', '..');
const publicDir = join(projectRoot, 'public');
const workDir = join(here, 'work');

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--only='))?.slice(7);
const withVariants = args.includes('--variants');

async function emit(spec: AvatarSpec, file: string): Promise<void> {
  const info = await buildAvatar(spec);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, info.bytes);
  console.log(
    `${relative(projectRoot, file).padEnd(40)} ${(info.bytes.byteLength / 1024).toFixed(0).padStart(5)} KB  ` +
      `height ${info.height.toFixed(3)} m  eye ${info.eyeHeight.toFixed(3)} m  head ${(info.headTop - info.chin).toFixed(3)} m  verts ${info.vertexCount}`,
  );
}

const list = avatars.filter((a) => !only || a.id === only || a.shopId === only);
let total = 0;
for (const spec of list) {
  await emit(spec, join(publicDir, avatarModelUrl(spec)));
  total++;
}
if (withVariants) {
  for (const spec of variantSpecs()) if (!only || spec.id === only) await emit(spec, join(workDir, `${spec.id}.vrm`));
}
if (total > 1) console.log(`${total} avatars written`);
if (!list.length && !withVariants) console.error(`no avatar matches ${only}`);
