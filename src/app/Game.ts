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
import { SeatSystem, type Seat } from '../systems/Seats.ts';
import { VoicePlayer } from '../systems/audio/VoicePlayer.ts';
import { DialogueBox } from '../ui/DialogueBox.ts';
import { NpcSystem } from '../npc/NpcSystem.ts';
import { buildDecor } from '../world/decor.ts';
import { LightShafts } from '../world/lightShafts.ts';
import { NightGlow } from '../world/nightGlow.ts';
import { getProductMaterial } from '../world/interiors/kit.ts';

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
  private readonly seats = new SeatSystem();
  private readonly voice = new VoicePlayer(this.audio);
  private readonly dialogue = new DialogueBox();
  private npcs: NpcSystem | null = null;
  private npcSpots = new Map<string, { x: number; z: number; yaw: number }>();
  private products: THREE.Group | null = null;
  private interiorIssues: string[] = [];
  private seated: Seat | null = null;

  constructor(container: HTMLElement) {
    this.renderer = new Renderer(container, { postFx: !devFlags.nofx });
    this.overlay = new StartOverlay();
  }

  async init() {
    this.physics = await PhysicsWorld.create();
    this.layout = devFlags.testbed ? null : mallLayout;

    let world: THREE.Group;
    if (this.layout) {
      const built = buildMall(this.layout, this.physics);
      world = built.root;
      this.seats.addAll(built.seats);
      this.interiorIssues = built.issues;
      // 天窗光束：跟着太阳斜照，日落发橙，夜里消失
      const shafts = new LightShafts(this.layout);
      this.renderer.scene.add(shafts.group);
      this.renderer.excludeFromOutline(shafts.group);
      this.renderer.day.onChange(() => shafts.update(this.renderer.day));
      shafts.update(this.renderer.day);
      // 夜灯（花园灯笼等）：跟商品一样按楼层显示
      const glow = new NightGlow(built.glows);
      for (const mesh of glow.meshes) built.products.add(mesh);
      this.renderer.day.onChange(() => glow.update(this.renderer.day));
      glow.update(this.renderer.day);
      const m = built.materials;
      this.renderer.day.setOutdoorMaterials([
        { mat: m.ground, dark: 0.45 },
        { mat: m.plaza, dark: 0.55 },
        { mat: m.exterior, dark: 0.6 },
        { mat: m.roof, dark: 0.5 },
        { mat: m.outdoorProp, dark: 0.55 },
        { mat: getProductMaterial(true), dark: 0.55 },
      ]);
      if (import.meta.env.DEV) this.reportLayoutProblems(this.layout);
      this.npcSpots = built.npcSpots;
      this.products = built.products;
      // 装饰图异步加载，和商品一样按楼层显示
      const products = built.products;
      void buildDecor(built.decor).then((meshes) => {
        for (const m of meshes) products.add(m);
      });
    } else {
      world = buildTestbed(this.physics);
    }
    this.renderer.scene.add(world);
    if (this.layout) this.setupCirculation(this.layout);
    this.setupSeating();
    if (this.layout) {
      this.npcs = new NpcSystem(this.layout, this.renderer.scene, this.physics, this.interaction, this.voice, this.dialogue, this.npcSpots);
      void this.voice.loadManifest();
    }

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
    this.musicPanel = new MusicPanel(this.music, this.renderer.day);
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

    this.renderer.day.update(dt);
    this.hud?.setClock(this.renderer.day.clock, this.renderer.day.night > 0.5);

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
    const camDist = this.cameraRig.update(dt, this.player, alpha, this.seatedView());
    this.avatar.setVisible(this.cameraRig.mode === 'first' || camDist > CAMERA.hideAvatarBelow);
    let floor = 0;
    if (this.zones && this.hud) {
      const zone = this.zones.locate(feet.x, feet.y, feet.z);
      floor = zone.floor;
      this.hud.setZone(zone);
    }
    this.updateFloorVisibility(floor);

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
    // 坐着：一走动或起跳就站起来，否则角色不动
    if (this.seated) {
      if (move.forward !== 0 || move.right !== 0 || jump) this.standUp();
      else {
        for (const el of this.elevators) el.fixedUpdate(FIXED_DT, this.player.curr);
        this.physics.step(FIXED_DT);
        return;
      }
    }
    let ride = null;
    for (const el of this.elevators) ride = el.fixedUpdate(FIXED_DT, this.player.curr) ?? ride;
    const esc = !ride && !jump ? (this.escalators?.locate(this.player.curr) ?? null) : null;
    const escalators = this.escalators;
    this.player.fixedUpdate(FIXED_DT, move, jump, {
      ride,
      escalator: esc && escalators ? (vel, dt, out) => escalators.advance(esc, vel, dt, out) : null,
    });
    this.physics.step(FIXED_DT);
  }

  /** 每帧：扶梯台阶、电梯画面、互动提示 */
  private updateDynamicWorld(dt: number, feet: THREE.Vector3) {
    this.escalators?.update(dt);
    for (const el of this.elevators) el.update();
    this.npcs?.update(dt, feet);
    this.interaction.update(feet);
    const cur = this.interaction.current;
    const hidePrompt = !cur || this.elevatorPanel.isOpen || this.musicPanel.isOpen || cur.id === this.npcs?.activeInteractId;
    this.hud?.setPrompt(hidePrompt ? null : cur.prompt());
  }

  /** 商品和装饰图只画玩家所在楼层和上下相邻层（隔得更远的被楼板挡住） */
  private updateFloorVisibility(floor: number) {
    if (this.products) for (const m of this.products.children) m.visible = Math.abs((m.userData.floor as number) - floor) <= 1;
  }

  private sitDown(seat: Seat) {
    this.seated = seat;
    this.player.vel.set(0, 0, 0);
    this.player.moveVel.set(0, 0, 0);
    // 视线转向座位朝向（玩家 yaw 与角色朝向相差 π）
    this.player.yaw = seat.yaw + Math.PI;
    this.player.pitch = this.cameraRig.mode === 'third' ? -0.12 : 0;
  }

  /** 站起来：落在座位正前方，镜头保持现在的角度 */
  private standUp() {
    const s = this.seated;
    if (!s) return;
    this.seated = null;
    const pos = new THREE.Vector3(s.x + Math.sin(s.yaw) * 0.62, s.y - 0.46 + 0.05, s.z + Math.cos(s.yaw) * 0.62);
    this.player.teleport(pos, this.player.yaw, this.player.pitch);
    this.avatar.setFacing(s.yaw);
  }

  /** 坐着时的镜头注视点和第一人称眼睛位置 */
  private seatedView(): { pivot: THREE.Vector3; eye: THREE.Vector3 } | null {
    const s = this.seated;
    if (!s) return null;
    const lift = this.avatar.height * 0.86 - this.avatar.hipsHeight;
    const eyeLift = this.avatar.eyeHeight - this.avatar.hipsHeight;
    return { pivot: new THREE.Vector3(s.x, s.y + lift, s.z), eye: new THREE.Vector3(s.x, s.y + eyeLift, s.z) };
  }

  private setupSeating() {
    const far = new THREE.Vector3(1e6, 0, 1e6);
    this.interaction.add({
      id: 'seat',
      prompt: () => i18n.t('seat.sit'),
      position: () => {
        const s = this.seats.nearest(this.player.curr);
        return s ? new THREE.Vector3(s.x, s.y - 0.46, s.z) : far;
      },
      radius: 1.4,
      isAvailable: () => !this.seated && this.seats.lastNearest !== null,
      interact: () => {
        const s = this.seats.lastNearest;
        if (s) this.sitDown(s);
      },
    });
    this.interaction.add({
      id: 'stand',
      prompt: () => i18n.t('seat.stand'),
      position: () => this.player.curr.clone(),
      radius: 5,
      priority: 10,
      isAvailable: () => this.seated !== null,
      interact: () => this.standUp(),
    });
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
    this.avatar.update(
      dt,
      feet,
      this.cameraRig.mode === 'first' ? p.moveVel.clone().multiplyScalar(0) : p.moveVel,
      { speed: p.horizontalSpeed, grounded: p.grounded, vy: p.vy },
      groundY,
      this.seated,
    );
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
    const problems = [...validateLayout(layout), ...this.interiorIssues];
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
      /** 设置游戏内时间（小时） */
      setTime(hours: number) {
        game.renderer.day.setHours(hours);
      },
      get day() {
        return game.renderer.day;
      },
      setYaw(deg: number) {
        game.player.yaw = (deg * Math.PI) / 180;
      },
      get npcs() {
        return game.npcs;
      },
      /** 传送到某家店的店员面前并开始对话 */
      talkTo(shopId: string) {
        const n = game.npcs?.list.find((x) => x.def.shopId === shopId);
        if (!n) return null;
        const yaw = n.homeYaw;
        const pos = n.home.clone().add(new THREE.Vector3(Math.sin(yaw) * 1.7, 0.05, Math.cos(yaw) * 1.7));
        game.teleportTo(pos, yaw);
        game.updateDynamicWorld(1 / 60, game.player.curr);
        game.interaction.interact();
        return game.npcs?.talkingTo?.def.lines[game.npcs.talkingTo.lineIndex] ?? null;
      },
      get interiorIssues() {
        return game.interiorIssues;
      },
      get seats() {
        return game.seats.seats;
      },
      get seated() {
        return game.seated;
      },
      /** 立即按当前状态渲染一帧（浏览器面板隐藏、渲染循环暂停时截图用） */
      renderOnce(dt = 1 / 60) {
        const feet = game.player.feetPosition(1, new THREE.Vector3());
        if (game.zones) game.updateFloorVisibility(game.zones.locate(feet.x, feet.y, feet.z).floor);
        game.updateDynamicWorld(dt, feet);
        game.updateAvatar(dt, feet);
        const d = game.cameraRig.update(dt, game.player, 1, game.seatedView());
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
      /** 店内俯瞰：相机放在店门一角的高处、斜看向对角，看整家店的布置（调试用） */
      async overview(ids: string[], name: string, side: 1 | -1 = 1) {
        const layout = game.layout;
        if (!layout) return null;
        const cam = game.renderer.camera;
        const cw = 640;
        const ch = 380;
        const cols = 2;
        const out = document.createElement('canvas');
        out.width = cols * cw;
        out.height = Math.ceil(ids.length / cols) * (ch + 22);
        const x = out.getContext('2d')!;
        x.fillStyle = '#222';
        x.fillRect(0, 0, out.width, out.height);
        const fov = cam.fov;
        ids.forEach((id, i) => {
          const s = layout.shops.find((sh) => sh.id === id);
          if (!s) return;
          const H = layout.building.floorHeight;
          const y = s.floor * H;
          const door = s.entrances[0];
          const c = openingCenter(s.rect, door);
          const r = s.rect;
          // 站在门内、开口一侧的高处，看向店铺另一侧的远角
          const inX = -c.outX;
          const inZ = -c.outZ;
          const px = c.x + inX * 0.6 + (inZ !== 0 ? -0.35 * side * r.w : 0);
          const pz = c.z + inZ * 0.6 + (inX !== 0 ? -0.35 * side * r.d : 0);
          const tx = r.x + r.w / 2 + inX * r.w * 0.2 + (inZ !== 0 ? 0.25 * side * r.w : 0);
          const tz = r.z + r.d / 2 + inZ * r.d * 0.2 + (inX !== 0 ? 0.25 * side * r.d : 0);
          hooks.teleport(px, y + 0.05, pz, 0);
          hooks.renderOnce();
          for (const m of game.products?.children ?? []) m.visible = Math.abs((m.userData.floor as number) - s.floor) <= 1;
          cam.fov = 80;
          cam.updateProjectionMatrix();
          cam.position.set(px, y + 5.0, pz);
          cam.lookAt(tx, y, tz);
          game.avatar.setVisible(false);
          game.renderer.render(1 / 60);
          const px0 = (i % cols) * cw;
          const py0 = Math.floor(i / cols) * (ch + 22);
          x.drawImage(game.renderer.canvas, px0, py0 + 22, cw, ch);
          x.fillStyle = '#fff';
          x.font = '15px sans-serif';
          x.fillText(id, px0 + 6, py0 + 16);
        });
        cam.fov = fov;
        cam.updateProjectionMatrix();
        const res = await fetch(`/__shot?name=${encodeURIComponent(name)}`, { method: 'POST', body: out.toDataURL('image/jpeg', 0.85) });
        return res.text();
      },
      /** 店内总览图：依次走进每家店门内一点、拍一张，拼成 3 列的图存到 tools/.shots/<name>.jpg */
      async sheet(ids: string[], name: string, pitch = -0.22) {
        const cw = 440;
        const ch = 262;
        const cols = 3;
        const out = document.createElement('canvas');
        out.width = cols * cw;
        out.height = Math.ceil(ids.length / cols) * (ch + 22);
        const x = out.getContext('2d')!;
        x.fillStyle = '#222';
        x.fillRect(0, 0, out.width, out.height);
        hooks.setView('first');
        ids.forEach((id, i) => {
          hooks.teleportShop(id);
          hooks.simulate(1, 0, 0.55);
          game.player.pitch = pitch;
          for (let k = 0; k < 3; k++) hooks.renderOnce();
          const px = (i % cols) * cw;
          const py = Math.floor(i / cols) * (ch + 22);
          x.drawImage(game.renderer.canvas, px, py + 22, cw, ch);
          x.fillStyle = '#fff';
          x.font = '15px sans-serif';
          x.fillText(id, px + 6, py + 16);
        });
        const res = await fetch(`/__shot?name=${encodeURIComponent(name)}`, { method: 'POST', body: out.toDataURL('image/jpeg', 0.85) });
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
