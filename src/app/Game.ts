import * as THREE from 'three';
import { mallLayout } from '../data/mallLayout.ts';
import type { MallLayout } from '../data/layoutTypes.ts';
import { validateLayout } from '../data/validateLayout.ts';
import { PhysicsWorld } from '../systems/physics/PhysicsWorld.ts';
import { Renderer } from '../render/Renderer.ts';
import { buildMall } from '../world/MallBuilder.ts';
import { buildTestbed } from '../world/testbed.ts';
import { ZoneIndex } from '../world/ZoneIndex.ts';
import { openingCenter } from '../world/rectOps.ts';
import { FirstPersonController, type MoveIntent } from '../player/FirstPersonController.ts';
import { Input } from '../player/Input.ts';
import { Hud } from '../ui/Hud.ts';
import { StartOverlay } from '../ui/StartOverlay.ts';
import { DebugOverlay } from '../ui/DebugOverlay.ts';
import { toast } from '../ui/Toast.ts';
import { i18n } from '../ui/i18n.ts';
import { devFlags } from './devFlags.ts';
import { AudioEngine } from '../systems/audio/AudioEngine.ts';
import { MusicDirector } from '../systems/audio/MusicDirector.ts';
import { MusicPanel } from '../ui/MusicPanel.ts';

const FIXED_DT = 1 / 60;
const MAX_STEPS = 5;

/** 脚本控制的移动（测试钩子用）：持续到 until（performance.now 毫秒）。 */
interface ScriptedMove extends MoveIntent {
  jump: boolean;
  until: number;
}

export class Game {
  private readonly renderer: Renderer;
  private readonly overlay: StartOverlay;
  private physics!: PhysicsWorld;
  private player!: FirstPersonController;
  private input!: Input;
  private hud?: Hud;
  private zones?: ZoneIndex;
  private debug?: DebugOverlay;
  private debugLines?: THREE.LineSegments;
  private layout: MallLayout | null = null;
  private scripted: ScriptedMove | null = null;
  private acc = 0;
  private last = performance.now();
  private readonly tmp = new THREE.Vector3();
  /** 有面板打开时，失去指针锁定不显示暂停界面 */
  private panelOpen = false;
  private started = false;
  private readonly audio = new AudioEngine();
  private music!: MusicDirector;
  private musicPanel!: MusicPanel;
  private musicReady: Promise<void> = Promise.resolve();

  constructor(container: HTMLElement) {
    this.renderer = new Renderer(container);
    this.overlay = new StartOverlay();
  }

  async init() {
    this.physics = await PhysicsWorld.create();
    this.layout = devFlags.testbed ? null : mallLayout;

    if (this.layout && import.meta.env.DEV) this.reportLayoutProblems(this.layout);

    const world = this.layout ? buildMall(this.layout, this.physics).root : buildTestbed(this.physics);
    this.renderer.scene.add(world);

    this.player = new FirstPersonController(this.physics);
    const spawn = this.spawnPoint();
    this.player.setSpawn(spawn.pos, spawn.yaw);
    this.player.teleport(spawn.pos, spawn.yaw);
    const start = this.devStartPoint();
    if (start) this.player.teleport(start.pos, start.yaw);

    this.input = new Input(this.renderer.canvas);
    this.input.bind('KeyL', () => i18n.toggle());
    this.input.bind('KeyM', () => this.toggleMusicPanel());
    this.input.bind('Escape', () => {
      if (this.musicPanel.isOpen) this.closeMusicPanel(false);
    });
    this.input.onLockChange((locked) => this.onLockChange(locked));

    this.setupMusic();

    if (this.layout) {
      this.zones = new ZoneIndex(this.layout);
      this.hud = new Hud(this.layout);
    }
    if (devFlags.debug || devFlags.map) this.debug = new DebugOverlay(this.layout, devFlags.debug, devFlags.map);
    if (devFlags.debug) {
      this.debugLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true }));
      this.debugLines.frustumCulled = false;
      this.renderer.scene.add(this.debugLines);
    }

    this.overlay.onActivate = () => this.activate();
    this.overlay.setMode('start');
    this.hud?.setCrosshair(false);
    this.exposeTestHooks();
    requestAnimationFrame(this.frame);
  }

  /** 点击开始/继续：在同一个用户手势里请求指针锁定（Chrome 刚按过 Esc 时会拒绝）并解锁音频。 */
  private activate() {
    void this.input.lock().then((ok) => {
      if (!ok) this.overlay.setNote(i18n.t('start.relockWait'));
    });
    void this.audio.unlock();
    if (!this.started) {
      this.started = true;
      void this.musicReady.then(() => this.music.start());
    }
  }

  private setupMusic() {
    this.music = new MusicDirector(this.audio, {
      onBuiltinLoaded: (source) => {
        if (source === 'placeholder') toast.show(i18n.t('music.placeholder'));
        console.info(`[music] 内置歌单：${source}`);
      },
      onTrackChange: (item) => this.hud?.setMusic(item ? item.title : ''),
      onImportResult: (r) => {
        if (r.added > 0) toast.show(i18n.t('music.added', { n: r.added }));
        for (const name of r.notAudio) toast.show(i18n.t('music.notAudio', { name }), { error: true });
        for (const name of r.unsupported) toast.show(i18n.t('music.unsupported', { name }), { error: true });
      },
    });
    this.musicReady = this.music.loadBuiltin(devFlags.bgmSeek).catch((err) => {
      console.warn('[music]', err);
      toast.show(i18n.t('music.loadFailed'), { error: true });
    });
    this.musicPanel = new MusicPanel(this.music);
    this.musicPanel.onClose = () => this.closeMusicPanel(true);
  }

  private toggleMusicPanel() {
    if (!this.started) return;
    if (this.musicPanel.isOpen) this.closeMusicPanel(true);
    else this.openMusicPanel();
  }

  private openMusicPanel() {
    this.panelOpen = true;
    this.overlay.setMode('hidden');
    this.input.unlock();
    this.musicPanel.show();
  }

  /** relock：用 M 键或关闭按钮关闭时直接回到游戏；按 Esc 关闭时显示暂停界面。 */
  private closeMusicPanel(relock: boolean) {
    this.musicPanel.hide();
    this.panelOpen = false;
    if (!relock) {
      this.overlay.setMode('paused');
      return;
    }
    void this.input.lock().then((ok) => {
      if (!ok) this.overlay.setMode('paused');
    });
  }

  private onLockChange(locked: boolean) {
    if (locked) this.overlay.setMode('hidden');
    else if (!this.panelOpen) this.overlay.setMode('paused');
    this.hud?.setCrosshair(locked);
  }

  private frame = (now: number) => {
    requestAnimationFrame(this.frame);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.25) dt = 0.25;

    const mouse = this.input.consumeMouse();
    this.player.look(mouse.dx, mouse.dy);

    this.acc += dt;
    let steps = 0;
    while (this.acc >= FIXED_DT && steps < MAX_STEPS) {
      let move: MoveIntent = this.input.locked ? this.input.movement() : { forward: 0, right: 0, run: false };
      let jump = this.input.consumeJump();
      if (this.scripted) {
        if (performance.now() < this.scripted.until) {
          move = this.scripted;
          jump = jump || this.scripted.jump;
          this.scripted.jump = false;
        } else {
          this.scripted = null;
        }
      }
      this.player.fixedUpdate(FIXED_DT, move, jump);
      this.physics.step(FIXED_DT);
      this.acc -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_STEPS) this.acc = 0;
    const alpha = this.acc / FIXED_DT;

    const cam = this.renderer.camera;
    this.player.eyePosition(alpha, cam.position);
    cam.rotation.set(this.player.pitch, this.player.yaw, 0);

    const feet = this.player.feetPosition(alpha, this.tmp);
    let floor = 0;
    if (this.zones && this.hud) {
      const zone = this.zones.locate(feet.x, feet.y, feet.z);
      floor = zone.floor;
      this.hud.setZone(zone);
    }

    if (this.debugLines) {
      const { vertices, colors } = this.physics.world.debugRender();
      const g = this.debugLines.geometry;
      g.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      g.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    }

    this.renderer.render();

    if (this.debug) {
      const info = this.renderer.renderer.info.render;
      this.debug.update({
        calls: info.calls,
        triangles: info.triangles,
        colliders: this.physics.colliderCount,
        x: feet.x,
        y: feet.y,
        z: feet.z,
        yaw: this.player.yaw,
        floor,
        grounded: this.player.grounded,
        speed: this.player.horizontalSpeed,
      });
    }
  };

  private spawnPoint(): { pos: THREE.Vector3; yaw: number } {
    if (!this.layout) return { pos: new THREE.Vector3(0, 0.05, 0), yaw: 0 };
    const s = this.layout.spawn;
    return { pos: new THREE.Vector3(s.x, s.floor * this.layout.building.floorHeight + 0.05, s.z), yaw: s.yaw };
  }

  /** ?floor=N 传送到第 N 层南侧回廊；?shop=id 传送到店门口，面朝店内。 */
  private devStartPoint(): { pos: THREE.Vector3; yaw: number } | null {
    if (devFlags.shop) return this.shopDoorPoint(devFlags.shop);
    if (devFlags.floor !== null) return this.floorPoint(devFlags.floor - 1);
    return null;
  }

  private floorPoint(level: number): { pos: THREE.Vector3; yaw: number } | null {
    if (!this.layout) return null;
    const L = Math.max(0, Math.min(this.layout.floors.length - 1, Math.round(level)));
    return { pos: new THREE.Vector3(0, L * this.layout.building.floorHeight + 0.05, 7.5), yaw: 0 };
  }

  private shopDoorPoint(id: string): { pos: THREE.Vector3; yaw: number } | null {
    if (!this.layout) return null;
    const shop = this.layout.shops.find((s) => s.id === id);
    if (!shop) {
      toast.show(`?shop=${id}: not found`, { error: true });
      return null;
    }
    const c = openingCenter(shop.rect, shop.entrances[0]);
    const pos = new THREE.Vector3(c.x + c.outX * 2, shop.floor * this.layout.building.floorHeight + 0.05, c.z + c.outZ * 2);
    return { pos, yaw: Math.atan2(c.outX, c.outZ) };
  }

  private reportLayoutProblems(layout: MallLayout) {
    const problems = validateLayout(layout);
    if (problems.length === 0) return;
    console.warn('[layout]', problems);
    const box = document.createElement('div');
    box.className = 'layout-problems';
    box.innerHTML = `<b>${i18n.t('debug.layoutProblems', { n: problems.length })}</b><ul>${problems.map((p) => `<li>${p}</li>`).join('')}</ul>`;
    box.addEventListener('click', () => box.remove());
    document.body.appendChild(box);
  }

  /** 自动化测试用：window.__game */
  private exposeTestHooks() {
    const game = this;
    (window as unknown as { __game: unknown }).__game = {
      get player() {
        return game.player;
      },
      get physics() {
        return game.physics;
      },
      get layout() {
        return game.layout;
      },
      zone() {
        const p = game.player.curr;
        return game.zones?.locate(p.x, p.y, p.z) ?? null;
      },
      teleportFloor(n: number) {
        const p = game.floorPoint(n - 1);
        if (p) game.player.teleport(p.pos, p.yaw);
      },
      teleportShop(id: string) {
        const p = game.shopDoorPoint(id);
        if (p) game.player.teleport(p.pos, p.yaw);
      },
      teleport(x: number, y: number, z: number, yawDeg = 0) {
        game.player.teleport(new THREE.Vector3(x, y, z), (yawDeg * Math.PI) / 180);
      },
      setYaw(deg: number) {
        game.player.yaw = (deg * Math.PI) / 180;
      },
      /** 按给定意图移动若干秒（不需要指针锁定） */
      move(forward: number, right: number, seconds: number, run = false, jump = false) {
        game.scripted = { forward, right, run, jump, until: performance.now() + seconds * 1000 };
        return new Promise((r) => setTimeout(r, seconds * 1000 + 50));
      },
      setPanelOpen(v: boolean) {
        game.panelOpen = v;
      },
      get music() {
        return game.music;
      },
      get audio() {
        return game.audio;
      },
      /** 测试用：不经过点击直接开始（音频可能仍被浏览器挂起） */
      startWithoutGesture() {
        game.overlay.setMode('hidden');
        game.activate();
      },
      openMusicPanel() {
        game.started = true;
        game.openMusicPanel();
      },
      closeMusicPanel() {
        game.closeMusicPanel(false);
      },
    };
  }
}
