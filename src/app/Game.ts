import * as THREE from 'three';
import { mallLayout } from '../data/mallLayout.ts';
import { floorByLevel, levelRange, type MallLayout } from '../data/layoutTypes.ts';
import { validateLayout } from '../data/validateLayout.ts';
import { PhysicsWorld } from '../systems/physics/PhysicsWorld.ts';
import { Renderer } from '../render/Renderer.ts';
import { buildMall } from '../world/MallBuilder.ts';
import { buildTestbed } from '../world/testbed.ts';
import { ZoneIndex } from '../world/ZoneIndex.ts';
import { openingCenter } from '../world/rectOps.ts';
import { PlayerController, type MoveIntent } from '../player/PlayerController.ts';
import { CameraRig, CAMERA } from '../player/CameraRig.ts';
import { Avatar } from '../player/Avatar.ts';
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
import { EscalatorSystem } from '../world/escalators.ts';
import { ElevatorSystem } from '../world/elevator.ts';
import { InteractionSystem } from '../systems/Interaction.ts';
import { ElevatorPanel } from '../ui/ElevatorPanel.ts';

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
  private player!: PlayerController;
  private cameraRig!: CameraRig;
  private avatar!: Avatar;
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
  private escalators: EscalatorSystem | null = null;
  private elevators: ElevatorSystem[] = [];
  private readonly interaction = new InteractionSystem();
  private readonly elevatorPanel = new ElevatorPanel();
  private readonly conveyor = new THREE.Vector3();

  constructor(container: HTMLElement) {
    this.renderer = new Renderer(container, { postFx: !devFlags.nofx });
    this.overlay = new StartOverlay();
  }

  async init() {
    this.physics = await PhysicsWorld.create();
    this.layout = devFlags.testbed ? null : mallLayout;

    if (this.layout && import.meta.env.DEV) this.reportLayoutProblems(this.layout);

    const world = this.layout ? buildMall(this.layout, this.physics).root : buildTestbed(this.physics);
    this.renderer.scene.add(world);
    if (this.layout) this.setupCirculation(this.layout);

    this.player = new PlayerController(this.physics);
    const spawn = this.spawnPoint();
    this.player.setSpawn(spawn.pos, spawn.yaw);
    this.player.teleport(spawn.pos, spawn.yaw);

    // 角色：加载 VRM，按它的身高重建碰撞胶囊
    const { avatar, error } = await Avatar.load();
    this.avatar = avatar;
    avatar.addTo(this.renderer.scene);
    if (error) toast.show(i18n.t('avatar.loadFailed'), { error: true });
    this.player.configureBody(avatar.height, avatar.eyeHeight);
    this.cameraRig = new CameraRig(this.renderer.camera, this.physics);
    this.cameraRig.mode = devFlags.view ?? 'third';
    this.avatar.applyCameraLayers(this.renderer.camera, this.cameraRig.mode === 'first');
    const start = this.devStartPoint();
    if (start) this.player.teleport(start.pos, start.yaw);
    this.player.pitch = this.cameraRig.mode === 'third' ? -0.18 : 0;
    this.avatar.setFacing(this.player.yaw + Math.PI);

    this.input = new Input(this.renderer.canvas);
    this.input.bind('KeyL', () => i18n.toggle());
    this.input.bind('KeyM', () => this.toggleMusicPanel());
    this.input.bind('KeyV', () => this.toggleView());
    this.input.bind('KeyE', () => {
      if (!this.started) return;
      if (this.elevatorPanel.isOpen) this.closeElevatorPanel(true);
      else this.interaction.interact();
    });
    this.input.onWheel((dy) => this.cameraRig.zoom(dy));
    this.input.bind('Escape', () => {
      if (this.musicPanel.isOpen) this.closeMusicPanel(false);
      if (this.elevatorPanel.isOpen) this.closeElevatorPanel(false);
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
    const [minPitch, maxPitch] = this.cameraRig.pitchLimits;
    this.player.look(mouse.dx, mouse.dy, minPitch, maxPitch);

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
      this.fixedStep(move, jump);
      this.acc -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_STEPS) this.acc = 0;
    const alpha = this.acc / FIXED_DT;

    const feet = this.player.feetPosition(alpha, this.tmp);
    this.updateDynamicWorld(dt, feet);
    this.updateAvatar(dt, feet);
    const camDist = this.cameraRig.update(dt, this.player, alpha);
    this.avatar.setVisible(this.cameraRig.mode === 'first' || camDist > CAMERA.hideAvatarBelow);
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

    this.renderer.render(dt);

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

  /** 一个固定物理步：电梯 → 扶梯输送 → 角色 → 物理世界。 */
  private fixedStep(move: MoveIntent, jump: boolean) {
    let ride = null;
    for (const el of this.elevators) ride = el.fixedUpdate(FIXED_DT, this.player.curr) ?? ride;
    const onEscalator = this.escalators?.conveyorAt(this.player.curr, this.conveyor) ?? false;
    this.player.fixedUpdate(FIXED_DT, move, jump, { conveyor: onEscalator ? this.conveyor : null, ride });
    this.physics.step(FIXED_DT);
  }

  /** 每帧：扶梯台阶、电梯画面、互动提示 */
  private updateDynamicWorld(dt: number, feet: THREE.Vector3) {
    this.escalators?.update(dt);
    for (const el of this.elevators) el.update();
    this.interaction.update(feet);
    const cur = this.interaction.current;
    this.hud?.setPrompt(cur && !this.elevatorPanel.isOpen && !this.musicPanel.isOpen ? cur.prompt() : null);
  }

  private setupCirculation(layout: MallLayout) {
    const scene = this.renderer.scene;
    this.escalators = new EscalatorSystem(layout, scene);
    for (const def of layout.circulation.elevators) {
      const el = new ElevatorSystem(layout, def, scene, this.physics, 0);
      this.elevators.push(el);
      for (const f of def.floors) {
        this.interaction.add({
          id: `${def.id}:call:${f}`,
          prompt: () => i18n.t('elevator.call'),
          position: () => el.callButtonPos(f),
          radius: 2.0,
          isAvailable: (feet) => !el.isPlayerInside(feet),
          interact: () => el.request(f),
        });
      }
      this.interaction.add({
        id: `${def.id}:panel`,
        prompt: () => i18n.t('elevator.choose'),
        position: () => new THREE.Vector3(def.rect.x + def.rect.w / 2, el.carY, def.rect.z + def.rect.d / 2),
        radius: 2.2,
        isAvailable: (feet) => el.isPlayerInside(feet),
        interact: () => this.openElevatorPanel(el),
      });
    }
    this.elevatorPanel.onClose = (relock) => this.closeElevatorPanel(relock);
  }

  private openElevatorPanel(el: ElevatorSystem) {
    this.panelOpen = true;
    this.overlay.setMode('hidden');
    this.input.unlock();
    this.elevatorPanel.show(el);
  }

  private closeElevatorPanel(relock: boolean) {
    this.elevatorPanel.hide();
    this.panelOpen = this.musicPanel.isOpen;
    if (!relock) {
      this.overlay.setMode('paused');
      return;
    }
    void this.input.lock().then((ok) => {
      if (!ok) this.overlay.setMode('paused');
    });
  }

  private updateAvatar(dt: number, feet: THREE.Vector3) {
    const p = this.player;
    // 第一人称时身体朝向跟着视线，第三人称时朝移动方向
    if (this.cameraRig.mode === 'first') this.avatar.setFacing(p.yaw + Math.PI);
    const groundY = this.physics.groundBelow(feet.x, feet.y + 0.4, feet.z, 12);
    this.avatar.update(dt, feet, this.cameraRig.mode === 'first' ? p.moveVel.clone().multiplyScalar(0) : p.moveVel, { speed: p.horizontalSpeed, grounded: p.grounded, vy: p.vy }, groundY);
  }

  private toggleView() {
    if (!this.started) return;
    const mode = this.cameraRig.toggle();
    this.avatar.applyCameraLayers(this.renderer.camera, mode === 'first');
    const [minPitch, maxPitch] = this.cameraRig.pitchLimits;
    this.player.look(0, 0, minPitch, maxPitch);
  }

  private spawnPoint(): { pos: THREE.Vector3; yaw: number } {
    if (!this.layout) return { pos: new THREE.Vector3(0, 0.05, 0), yaw: 0 };
    const s = this.layout.spawn;
    return { pos: new THREE.Vector3(s.x, s.floor * this.layout.building.floorHeight + 0.05, s.z), yaw: s.yaw };
  }

  /** ?floor=N 传送到第 N 层南侧回廊；?shop=id 传送到店门口，面朝店内。 */
  private devStartPoint(): { pos: THREE.Vector3; yaw: number } | null {
    if (devFlags.shop) return this.shopDoorPoint(devFlags.shop);
    if (devFlags.floor !== null) return this.floorPoint(devFlags.floor);
    return null;
  }

  private floorPoint(level: number): { pos: THREE.Vector3; yaw: number } | null {
    if (!this.layout) return null;
    const { min, max } = levelRange(this.layout);
    const L = Math.max(min, Math.min(max, Math.round(level)));
    const sp = floorByLevel(this.layout, L).devSpawn ?? { x: 0, z: 7.5, yaw: 0 };
    return { pos: new THREE.Vector3(sp.x, L * this.layout.building.floorHeight + 0.05, sp.z), yaw: sp.yaw };
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

  private teleportTo(pos: THREE.Vector3, yaw: number) {
    this.player.teleport(pos, yaw, this.cameraRig.mode === 'third' ? -0.18 : 0);
    this.avatar.setFacing(yaw + Math.PI);
    this.cameraRig.reset();
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
    const hooks = {
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
      /** n：1–5 = 1F–5F，-1 = B1 */
      teleportFloor(n: number) {
        const p = game.floorPoint(n > 0 ? n - 1 : n);
        if (p) game.teleportTo(p.pos, p.yaw);
      },
      teleportShop(id: string) {
        const p = game.shopDoorPoint(id);
        if (p) game.teleportTo(p.pos, p.yaw);
      },
      teleport(x: number, y: number, z: number, yawDeg = 0) {
        game.teleportTo(new THREE.Vector3(x, y, z), (yawDeg * Math.PI) / 180);
      },
      setView(mode: 'first' | 'third') {
        if (game.cameraRig.mode !== mode) {
          game.cameraRig.toggle();
          game.avatar.applyCameraLayers(game.renderer.camera, mode === 'first');
        }
      },
      get avatar() {
        return game.avatar;
      },
      get elevator() {
        return game.elevators[0];
      },
      get escalators() {
        return game.escalators;
      },
      /** 当前可互动对象的提示，以及按 E */
      interactionPrompt() {
        game.interaction.update(game.player.curr);
        return game.interaction.current?.prompt() ?? null;
      },
      pressE() {
        game.interaction.update(game.player.curr);
        if (game.elevatorPanel.isOpen) game.closeElevatorPanel(false);
        else game.interaction.interact();
      },
      setYaw(deg: number) {
        game.player.yaw = (deg * Math.PI) / 180;
      },
      /** 立即按当前状态渲染一帧（浏览器面板隐藏、渲染循环暂停时截图用） */
      renderOnce(dt = 1 / 60) {
        const feet = game.player.feetPosition(1, new THREE.Vector3());
        game.updateDynamicWorld(dt, feet);
        game.updateAvatar(dt, feet);
        const d = game.cameraRig.update(dt, game.player, 1);
        game.avatar.setVisible(game.cameraRig.mode === 'first' || d > CAMERA.hideAvatarBelow);
        game.renderer.render(dt);
      },
      /** 渲染一帧并把画面存到 tools/.shots/<name>.jpg（仅开发服务器，浏览器面板隐藏时也能用） */
      async shot(name: string, width = 800) {
        hooks.renderOnce();
        const src = game.renderer.canvas;
        const c = document.createElement('canvas');
        c.width = width;
        c.height = Math.round((src.height / src.width) * width);
        c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
        const res = await fetch(`/__shot?name=${encodeURIComponent(name)}`, { method: 'POST', body: c.toDataURL('image/jpeg', 0.85) });
        return res.text();
      },
      /** 同步模拟若干秒的物理步（不依赖渲染循环，页面在后台也能测）。返回脚底位置。 */
      simulate(forward: number, right: number, seconds: number, run = false, jump = false) {
        const n = Math.round(seconds / FIXED_DT);
        for (let i = 0; i < n; i++) {
          game.fixedStep({ forward, right, run }, jump && i === 0);
          game.escalators?.update(FIXED_DT);
        }
        const p = game.player.curr;
        return { x: p.x, y: p.y, z: p.z, grounded: game.player.grounded };
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
    (window as unknown as { __game: unknown }).__game = hooks;
  }
}
