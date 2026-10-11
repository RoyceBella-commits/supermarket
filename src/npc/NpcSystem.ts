import * as THREE from 'three';
import type { MallLayout, ShopDef } from '../data/layoutTypes.ts';
import { npcs, type NpcDef } from '../data/npcDialogue.ts';
import { Avatar } from '../player/Avatar.ts';
import { edgeOf, openingCenter } from '../world/rectOps.ts';
import type { PhysicsWorld } from '../systems/physics/PhysicsWorld.ts';
import type { InteractionSystem } from '../systems/Interaction.ts';
import type { VoicePlayer } from '../systems/audio/VoicePlayer.ts';
import type { DialogueBox } from '../ui/DialogueBox.ts';
import { i18n } from '../ui/i18n.ts';

const BASE = import.meta.env.BASE_URL;
/** 与 avatars.ts 的 staffModelUrl 一致：tools/vrm 生成到 public/models/staff/<shopId>.vrm */
const staffUrl = (shopId: string) => `${BASE}models/staff/${shopId}.vrm`;
/** 玩家进入这个距离（米，含高差）才加载店员模型 */
const LOAD_DIST = 45;
/** 超过这个水平距离或隔了一层以上就不画 */
const SHOW_DIST = 70;
const TALK_RADIUS = 2.2;
/** 对话中走开这么远就自动结束 */
const CLOSE_DIST = 4;
const LOOK_DIST = 6;
const ZERO = new THREE.Vector3();

export interface Npc {
  def: NpcDef;
  shop: ShopDef;
  /** 脚底位置 */
  home: THREE.Vector3;
  homeYaw: number;
  avatar: Avatar | null;
  loading: boolean;
  facing: number;
  lineIndex: number;
  /** 嘴巴动到这个时刻（系统时钟，秒） */
  talkUntil: number;
}

/**
 * 主要店铺的店员：站在店门内侧，玩家靠近时转头看过来，按 E 逐句对话（循环），
 * 有配音就播放（BGM 自动压低）。模型按距离懒加载，一次只加载一个。
 */
export class NpcSystem {
  readonly list: Npc[] = [];
  private active: Npc | null = null;
  private clock = 0;
  private readonly queue: Npc[] = [];
  private pumping = false;

  constructor(
    layout: MallLayout,
    private readonly scene: THREE.Scene,
    physics: PhysicsWorld,
    interaction: InteractionSystem,
    private readonly voice: VoicePlayer,
    private readonly box: DialogueBox,
  ) {
    const H = layout.building.floorHeight;
    for (const def of npcs) {
      const shop = layout.shops.find((s) => s.id === def.shopId);
      if (!shop || shop.entrances.length === 0) {
        console.warn('[npc] 找不到店铺或店门', def.shopId);
        continue;
      }
      const spot = npcSpot(shop);
      const home = new THREE.Vector3(spot.x, shop.floor * H, spot.z);
      const n: Npc = { def, shop, home, homeYaw: spot.yaw, avatar: null, loading: false, facing: spot.yaw, lineIndex: 0, talkUntil: 0 };
      this.list.push(n);
      // 只挡玩家，不挡相机射线
      physics.addBox([home.x - 0.24, home.y, home.z - 0.24], [home.x + 0.24, home.y + 1.4, home.z + 0.24], true);
      interaction.add({
        id: `npc-${def.shopId}`,
        prompt: () => (this.active === n ? i18n.t('npc.next') : `${i18n.t('npc.talk')} · ${i18n.pick(def.name)}`),
        position: () => n.home,
        radius: TALK_RADIUS,
        isAvailable: () => true,
        interact: () => this.talk(n),
      });
    }
  }

  /** 当前对话对应的互动 id（HUD 提示和对话框重复时隐藏提示） */
  get activeInteractId(): string | null {
    return this.active ? `npc-${this.active.def.shopId}` : null;
  }

  get talkingTo(): Npc | null {
    return this.active;
  }

  talk(n: Npc) {
    if (this.active === n) n.lineIndex = (n.lineIndex + 1) % n.def.lines.length;
    else {
      this.endConversation();
      this.active = n;
    }
    this.showLine(n);
  }

  endConversation() {
    const n = this.active;
    if (!n) return;
    this.active = null;
    this.voice.stop();
    this.box.hide();
    n.talkUntil = 0;
    // 下次再来接着说下一句
    n.lineIndex = (n.lineIndex + 1) % n.def.lines.length;
  }

  private showLine(n: Npc) {
    const lines = n.def.lines;
    const line = lines[n.lineIndex];
    this.box.show({ name: n.def.name, shopName: n.shop.name, zh: line.zh, en: line.en, index: n.lineIndex, total: lines.length });
    n.talkUntil = this.clock + this.voice.duration(line.id, line.zh);
    void this.voice.play(line.id).then((d) => {
      if (d !== null && this.active === n) n.talkUntil = this.clock + d;
    });
    this.voice.preload(lines[(n.lineIndex + 1) % lines.length].id);
  }

  update(dt: number, feet: THREE.Vector3) {
    this.clock += dt;
    for (const n of this.list) {
      const dx = feet.x - n.home.x;
      const dz = feet.z - n.home.z;
      const dy = feet.y - n.home.y;
      const dist = Math.hypot(dx, dz);
      if (!n.avatar) {
        if (!n.loading && Math.hypot(dist, dy) < LOAD_DIST) this.enqueue(n);
        continue;
      }
      const visible = Math.abs(dy) < 7 && dist < SHOW_DIST;
      n.avatar.setVisible(visible);
      if (!visible) continue;

      // 对话时身体转向玩家，结束后转回原位；附近有人时头转过来看
      const toPlayer = Math.atan2(dx, dz);
      const target = this.active === n ? toPlayer : n.homeYaw;
      n.facing += wrap(target - n.facing) * (1 - Math.exp(-5 * dt));
      n.avatar.setFacing(n.facing);
      let look = 0;
      if (Math.abs(dy) < 2.5 && dist < LOOK_DIST && dist > 0.3) {
        const rel = wrap(toPlayer - n.facing);
        if (Math.abs(rel) < 1.6) look = rel;
      }
      n.avatar.update(dt, n.home, ZERO, { speed: 0, grounded: true, vy: 0, lookYaw: look, talking: this.clock < n.talkUntil }, n.home.y);
    }

    const a = this.active;
    if (a && (Math.hypot(feet.x - a.home.x, feet.z - a.home.z) > CLOSE_DIST || Math.abs(feet.y - a.home.y) > 2)) this.endConversation();
  }

  private enqueue(n: Npc) {
    n.loading = true;
    this.queue.push(n);
    void this.pump();
  }

  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      for (let n = this.queue.shift(); n; n = this.queue.shift()) {
        // 模型缺失时 Avatar.load 会给一个胶囊占位
        const { avatar } = await Avatar.load(staffUrl(n.def.shopId), { firstPerson: false });
        avatar.root.name = `npc-${n.def.shopId}`;
        avatar.root.position.copy(n.home);
        avatar.setFacing(n.facing);
        avatar.addTo(this.scene);
        n.avatar = avatar;
        n.loading = false;
      }
    } finally {
      this.pumping = false;
    }
  }
}

/**
 * 店员站位：数据里有 npcSpot 就用；否则站在主入口内侧 2.6 m、门洞范围内偏一边（从走廊能看见，也不挡路），面朝店门外。
 */
export function npcSpot(shop: ShopDef): { x: number; z: number; yaw: number } {
  const door = shop.entrances[0];
  const c = openingCenter(shop.rect, door);
  const yaw = Math.atan2(c.outX, c.outZ);
  if (shop.npcSpot) return { ...shop.npcSpot, yaw };
  const e = edgeOf(shop.rect, door.side);
  const t = door.offset + door.width / 2;
  const dir = t < e.length / 2 ? 1 : -1;
  const along = THREE.MathUtils.clamp(t + dir * Math.min(Math.max(0, door.width / 2 - 0.7), 1.5), 1.0, e.length - 1.0);
  const inward = 2.6;
  return { x: e.x + e.ax * along - c.outX * inward, z: e.z + e.az * along - c.outZ * inward, yaw };
}

function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
