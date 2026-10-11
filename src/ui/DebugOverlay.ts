import { floorByLevel, type MallLayout, type Rect } from '../data/layoutTypes.ts';
import { escalatorFootprint, escalatorFrame } from '../world/escalators.ts';

/** ?debug 的性能读数 和 ?map 的当前楼层平面图。 */
export class DebugOverlay {
  private stats?: HTMLDivElement;
  private map?: HTMLDivElement;
  private mapFloor = Number.NaN;
  private playerDot?: SVGCircleElement;
  private playerDir?: SVGLineElement;
  private frames = 0;
  private lastFpsAt = performance.now();
  private fps = 0;

  constructor(private readonly layout: MallLayout | null, showStats: boolean, showMap: boolean) {
    if (showStats) {
      this.stats = document.createElement('div');
      this.stats.className = 'debug-stats';
      document.body.appendChild(this.stats);
    }
    if (showMap && layout) {
      this.map = document.createElement('div');
      this.map.className = 'debug-map';
      document.body.appendChild(this.map);
    }
  }

  update(info: { calls: number; triangles: number; colliders: number; x: number; y: number; z: number; yaw: number; floor: number; grounded: boolean; speed: number }) {
    this.frames++;
    const now = performance.now();
    if (now - this.lastFpsAt >= 500) {
      this.fps = (this.frames * 1000) / (now - this.lastFpsAt);
      this.frames = 0;
      this.lastFpsAt = now;
    }
    if (this.stats) {
      this.stats.textContent =
        `FPS ${this.fps.toFixed(0)}  draw calls ${info.calls}  tris ${(info.triangles / 1000).toFixed(1)}k\n` +
        `colliders ${info.colliders}\n` +
        `pos ${info.x.toFixed(2)}, ${info.y.toFixed(2)}, ${info.z.toFixed(2)}  yaw ${((info.yaw * 180) / Math.PI).toFixed(0)}°\n` +
        `floor ${info.floor >= 0 ? `${info.floor + 1}F` : `B${-info.floor}`}  ${info.grounded ? 'grounded' : 'airborne'}  ${info.speed.toFixed(1)} m/s`;
    }
    if (this.map && this.layout) {
      if (info.floor !== this.mapFloor) this.drawMap(info.floor);
      this.playerDot?.setAttribute('cx', String(info.x));
      this.playerDot?.setAttribute('cy', String(info.z));
      this.playerDir?.setAttribute('x1', String(info.x));
      this.playerDir?.setAttribute('y1', String(info.z));
      this.playerDir?.setAttribute('x2', String(info.x - Math.sin(info.yaw) * 4));
      this.playerDir?.setAttribute('y2', String(info.z - Math.cos(info.yaw) * 4));
    }
  }

  private drawMap(floor: number) {
    const L = this.layout!;
    this.mapFloor = floor;
    const o = L.building.outline;
    const pad = 3;
    const vb = `${o.x - pad} ${o.z - pad} ${o.w + pad * 2} ${o.d + pad * 2 + 18}`;
    const rect = (r: Rect, fill: string, stroke = '#555', extra = '') =>
      `<rect x="${r.x}" y="${r.z}" width="${r.w}" height="${r.d}" fill="${fill}" stroke="${stroke}" stroke-width="0.15" ${extra}/>`;
    const label = (r: Rect, text: string) =>
      `<text x="${r.x + r.w / 2}" y="${r.z + r.d / 2}" font-size="1.6" text-anchor="middle" dominant-baseline="middle" fill="#222">${text}</text>`;
    const f = floorByLevel(L, floor);
    let s = rect(o, '#f5f3ee', '#333');
    s += rect(f.indoor, '#ffffff', '#333');
    for (const out of f.outdoor ?? []) s += rect(out, '#d8f3dc');
    for (const at of L.atriums) {
      if (floor >= at.fromFloor) s += rect(at.rect, '#cfe8ff', '#4a90d9', 'stroke-dasharray="0.6 0.4"');
    }
    for (const shop of L.shops.filter((x) => x.floor === floor)) {
      s += rect(shop.rect, shop.theme.primary + (shop.tier === 'main' ? '77' : '33'));
      s += label(shop.rect, shop.name);
    }
    for (const fac of L.facilities.filter((x) => x.floor === floor)) {
      s += rect(fac.rect, '#e4e7eb');
      s += label(fac.rect, fac.label.en);
    }
    for (const a of L.amenities.filter((x) => x.floor === floor)) s += rect(a.rect, '#ffd166', '#aa8800');
    for (const e of L.circulation.escalators.filter((x) => x.fromFloor === floor || x.fromFloor + 1 === floor)) {
      const fp = escalatorFootprint(escalatorFrame(e, L.building.floorHeight));
      s += rect({ x: fp.x0, z: fp.z0, w: fp.x1 - fp.x0, d: fp.z1 - fp.z0 }, e.dir === 'up' ? '#95d5b2' : '#f4a261', '#555');
    }
    for (const el of L.circulation.elevators.filter((x) => x.floors.includes(floor))) {
      s += rect(el.rect, '#bde0fe', '#1d3557');
      s += label(el.rect, 'Elev');
    }
    for (const st of L.circulation.stairs.filter((x) => floor >= x.floors[0] && floor <= x.floors[1])) {
      s += rect(st.rect, '#adb5bd');
      s += label(st.rect, 'Stairs');
    }
    if (floor === 0) s += rect(L.plaza, '#ece4d6');
    s += `<line class="dir" stroke="#e63946" stroke-width="0.5"/><circle class="dot" r="1" fill="#e63946"/>`;
    this.map!.innerHTML = `<div>${f.label} plan (north up)</div><svg viewBox="${vb}">${s}</svg>`;
    this.playerDot = this.map!.querySelector('circle.dot') as SVGCircleElement;
    this.playerDir = this.map!.querySelector('line.dir') as SVGLineElement;
  }
}
