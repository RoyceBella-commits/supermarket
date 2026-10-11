import * as THREE from 'three';

/**
 * 可以按 E 互动的东西（电梯按钮，阶段 4 的店员、阶段 5 的影院银幕）。
 * 选择规则：可用的、在 radius 以内的里面，水平距离减去 priority 后最小的那个。
 */
export interface Interactable {
  id: string;
  /** 提示文字（随语言变化，所以是函数） */
  prompt(): string;
  /** 交互点（脚底高度的位置） */
  position(): THREE.Vector3;
  radius: number;
  /** 额外条件，例如“在同一层”“在轿厢外面” */
  isAvailable(feet: THREE.Vector3): boolean;
  /** 优先级（米）：比较远近时先减去它。店员比旁边的椅子优先，免得想说话却坐下了 */
  priority?: number;
  interact(): void;
}

export class InteractionSystem {
  private readonly items: Interactable[] = [];
  current: Interactable | null = null;

  add(item: Interactable) {
    this.items.push(item);
  }

  update(feet: THREE.Vector3) {
    let best: Interactable | null = null;
    let bestD = Infinity;
    for (const it of this.items) {
      const p = it.position();
      if (Math.abs(p.y - feet.y) > 1.2) continue;
      const d = Math.hypot(p.x - feet.x, p.z - feet.z);
      const score = d - (it.priority ?? 0);
      if (d > it.radius || score >= bestD) continue;
      if (!it.isAvailable(feet)) continue;
      best = it;
      bestD = score;
    }
    this.current = best;
  }

  interact(): boolean {
    if (!this.current) return false;
    this.current.interact();
    return true;
  }
}
