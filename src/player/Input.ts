/**
 * 键盘和鼠标输入。移动和视角只在指针锁定时生效（打开面板、按 Esc 后人物不会乱走）。
 * 用 KeyboardEvent.code 判断按键，中文输入法开着也不受影响。
 */
export class Input {
  private keys = new Set<string>();
  private dx = 0;
  private dy = 0;
  private jumpQueued = false;
  private hotkeys = new Map<string, () => void>();
  private lockListeners = new Set<(locked: boolean) => void>();
  locked = false;

  constructor(private readonly target: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.target;
      if (!this.locked) this.keys.clear();
      for (const l of this.lockListeners) l(this.locked);
    });
  }

  /** 注册热键（不要求指针锁定，按住不重复触发）。 */
  bind(code: string, fn: () => void) {
    this.hotkeys.set(code, fn);
  }

  onLockChange(fn: (locked: boolean) => void) {
    this.lockListeners.add(fn);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'text'))) return;
    const hot = this.hotkeys.get(e.code);
    if (hot && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      hot();
      return;
    }
    if (!this.locked) return;
    this.keys.add(e.code);
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) this.jumpQueued = true;
    }
  };

  /** 当前移动意图：forward/right 取值 -1..1。 */
  movement() {
    const k = this.keys;
    const forward = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const right = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const run = k.has('ShiftLeft') || k.has('ShiftRight');
    return { forward, right, run };
  }

  consumeJump(): boolean {
    const j = this.jumpQueued;
    this.jumpQueued = false;
    return j;
  }

  consumeMouse(): { dx: number; dy: number } {
    const out = { dx: this.dx, dy: this.dy };
    this.dx = 0;
    this.dy = 0;
    return out;
  }

  /** 请求指针锁定。Chrome 在 Esc 退出后约 1 秒内会拒绝，此时返回 false。 */
  async lock(): Promise<boolean> {
    if (this.locked) return true;
    try {
      await this.target.requestPointerLock({ unadjustedMovement: true });
      return true;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotSupportedError') {
        try {
          await this.target.requestPointerLock();
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }
}
