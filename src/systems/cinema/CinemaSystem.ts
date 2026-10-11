import * as THREE from 'three';
import type { AudioEngine } from '../audio/AudioEngine.ts';
import type { SpecialSpot } from '../../world/interiors/kit.ts';
import { toast } from '../../ui/Toast.ts';
import { i18n } from '../../ui/i18n.ts';

// 影院：在影厅银幕上播放玩家选的本地视频。
// - 文件只在本机：URL.createObjectURL(file) → <video> → THREE.VideoTexture 贴到银幕；换片或关闭时释放地址。
// - 声音：<video> → MediaElementSource → PannerNode（放在银幕中心，随距离衰减）→ 影院总线；影厅外再压低。
// - 在影厅里播放时 BGM 压低；没放片时银幕显示影院主视觉。
// - 只支持浏览器能解码的格式（MP4/H.264、WebM 等），不支持的给出提示。

const IDLE_IMAGE = `${import.meta.env.BASE_URL}textures/decor/cinema-keyvisual.jpg`;

export interface CinemaState {
  hasVideo: boolean;
  playing: boolean;
  title: string;
  time: number;
  duration: number;
  volume: number;
}

export class CinemaSystem {
  readonly screen: THREE.Mesh;
  readonly control: THREE.Vector3;
  private readonly center: THREE.Vector3;
  private readonly hall: { x0: number; z0: number; x1: number; z1: number; y0: number; y1: number };
  private readonly material: THREE.MeshBasicMaterial;
  private idle: THREE.Texture | null = null;
  private readonly video: HTMLVideoElement;
  private videoTexture: THREE.VideoTexture | null = null;
  private url: string | null = null;
  private title = '';
  private fileName = '';
  private source: MediaElementAudioSourceNode | null = null;
  private panner: PannerNode | null = null;
  private roomGain: GainNode | null = null;
  private releaseDuck: (() => void) | null = null;
  private volume = 0.9;
  onChange: () => void = () => {};

  constructor(
    spot: SpecialSpot,
    private readonly audio: AudioEngine,
  ) {
    this.center = new THREE.Vector3(spot.x, spot.y, spot.z);
    const ctrl = spot.data?.control as [number, number];
    this.control = new THREE.Vector3(ctrl[0], spot.y - spot.h / 2 - 1.8, ctrl[1]);
    const [a, b] = spot.data?.hall as [[number, number], [number, number]];
    const floorY = this.control.y;
    this.hall = { x0: Math.min(a[0], b[0]), z0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), z1: Math.max(a[1], b[1]), y0: floorY - 0.5, y1: floorY + 11 };

    this.material = new THREE.MeshBasicMaterial({ color: '#2a2a3a', toneMapped: false });
    this.screen = new THREE.Mesh(new THREE.PlaneGeometry(spot.w, spot.h), this.material);
    this.screen.position.copy(this.center);
    this.screen.rotation.y = spot.yaw;
    this.screen.name = 'cinema-screen';
    this.screen.userData.floor = spot.floor;
    new THREE.TextureLoader().load(IDLE_IMAGE, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      this.idle = tex;
      if (!this.videoTexture) this.showIdle();
    });

    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.preload = 'auto';
    this.video.addEventListener('play', () => this.onChange());
    this.video.addEventListener('pause', () => this.onChange());
    this.video.addEventListener('ended', () => this.onChange());
    this.video.addEventListener('error', () => this.onError());
  }

  get state(): CinemaState {
    const v = this.video;
    return { hasVideo: !!this.url, playing: !v.paused && !v.ended, title: this.title, time: v.currentTime || 0, duration: Number.isFinite(v.duration) ? v.duration : 0, volume: this.volume };
  }

  /** 选择本地视频：先按类型预判，不支持就提示；能播就贴到银幕上开始放 */
  async load(file: File) {
    const type = file.type || guessType(file.name);
    if (type && this.video.canPlayType(type) === '') {
      toast.show(i18n.t('cinema.unsupported', { name: file.name }), { error: true, ms: 5000 });
      return;
    }
    this.unload();
    this.url = URL.createObjectURL(file);
    this.title = file.name.replace(/\.[^.]+$/, '');
    this.fileName = file.name;
    this.video.src = this.url;
    this.ensureAudio();
    try {
      await this.audio.unlock();
      await this.video.play();
    } catch {
      // 解码失败会走 error 事件；用户手势问题时点播放键再试
    }
    if (!this.videoTexture) {
      this.videoTexture = new THREE.VideoTexture(this.video);
      this.videoTexture.colorSpace = THREE.SRGBColorSpace;
    }
    this.material.map = this.videoTexture;
    this.material.color.set('#ffffff');
    this.material.needsUpdate = true;
    this.onChange();
  }

  toggle() {
    if (!this.url) return;
    if (this.video.paused || this.video.ended) void this.video.play();
    else this.video.pause();
  }

  seek(t: number) {
    if (this.url && Number.isFinite(t)) this.video.currentTime = Math.max(0, Math.min(t, this.video.duration || 0));
  }

  setVolume(v: number) {
    this.volume = THREE.MathUtils.clamp(v, 0, 1);
    this.onChange();
  }

  /** 停止并释放当前影片 */
  unload() {
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    this.title = '';
    this.showIdle();
    this.releaseDuck?.();
    this.releaseDuck = null;
    this.onChange();
  }

  /** 玩家是否在影厅里 */
  inside(p: THREE.Vector3): boolean {
    const h = this.hall;
    return p.x > h.x0 && p.x < h.x1 && p.z > h.z0 && p.z < h.z1 && p.y > h.y0 && p.y < h.y1;
  }

  /** 每帧：更新听者位置、影厅内外音量、BGM 压低 */
  update(camera: THREE.Camera, player: THREE.Vector3) {
    if (!this.panner || !this.roomGain) return;
    const ctx = this.audio.ctx;
    const l = ctx.listener;
    const p = camera.getWorldPosition(new THREE.Vector3());
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
    const t = ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(p.x, t, 0.05);
      l.positionY.setTargetAtTime(p.y, t, 0.05);
      l.positionZ.setTargetAtTime(p.z, t, 0.05);
      l.forwardX.setTargetAtTime(f.x, t, 0.05);
      l.forwardY.setTargetAtTime(f.y, t, 0.05);
      l.forwardZ.setTargetAtTime(f.z, t, 0.05);
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }
    const inside = this.inside(player);
    this.roomGain.gain.setTargetAtTime(this.volume * (inside ? 1 : 0.25), t, 0.15);
    const playing = !!this.url && !this.video.paused && !this.video.ended;
    if (playing && inside && !this.releaseDuck) this.releaseDuck = this.audio.duck(0.12, 0.5, 1.2);
    if ((!playing || !inside) && this.releaseDuck) {
      this.releaseDuck();
      this.releaseDuck = null;
    }
  }

  private ensureAudio() {
    if (this.source) return;
    const ctx = this.audio.ctx;
    this.source = ctx.createMediaElementSource(this.video);
    this.panner = new PannerNode(ctx, {
      panningModel: 'equalpower',
      distanceModel: 'inverse',
      refDistance: 9,
      rolloffFactor: 1.1,
      positionX: this.center.x,
      positionY: this.center.y,
      positionZ: this.center.z,
    });
    this.roomGain = ctx.createGain();
    this.roomGain.gain.value = this.volume;
    this.source.connect(this.panner).connect(this.roomGain).connect(this.audio.buses.cinema);
  }

  private showIdle() {
    this.material.map = this.idle;
    this.material.color.set(this.idle ? '#d8d8e6' : '#2a2a3a');
    this.material.needsUpdate = true;
  }

  private onError() {
    if (!this.url) return;
    toast.show(i18n.t('cinema.unsupported', { name: this.fileName }), { error: true, ms: 5000 });
    this.unload();
  }
}

function guessType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return (
    {
      mp4: 'video/mp4',
      m4v: 'video/mp4',
      mov: 'video/quicktime',
      webm: 'video/webm',
      ogv: 'video/ogg',
      mkv: 'video/x-matroska',
      avi: 'video/x-msvideo',
      wmv: 'video/x-ms-wmv',
      flv: 'video/x-flv',
    } as Record<string, string>
  )[ext] ?? '';
}
