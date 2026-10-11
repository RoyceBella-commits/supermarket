/**
 * 赛道中心线（世界坐标的闭合折线，约 0.5 m 一个点，顺着行驶方向）。
 * 提供：按里程 s 取点和切线、把任意点投影到中心线（里程 + 横向偏移）、电脑车用的弯道限速表。
 */
export interface TrackPoint {
  x: number;
  z: number;
  /** 单位切线 */
  tx: number;
  tz: number;
}

export interface Projection {
  s: number;
  /** 横向偏移：正 = 行驶方向的左手边（法线 (-tz, tx)） */
  lateral: number;
  index: number;
}

export class Track {
  readonly n: number;
  readonly xs: Float64Array;
  readonly zs: Float64Array;
  /** 每个点的里程 */
  readonly cum: Float64Array;
  /** 每个点的切线（前后点的中心差分，用来平滑插值朝向） */
  readonly txs: Float64Array;
  readonly tzs: Float64Array;
  readonly length: number;

  constructor(
    points: [number, number][],
    readonly half: number,
    readonly y: number,
  ) {
    const n = (this.n = points.length);
    this.xs = new Float64Array(n);
    this.zs = new Float64Array(n);
    this.cum = new Float64Array(n + 1);
    this.txs = new Float64Array(n);
    this.tzs = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      this.xs[i] = points[i][0];
      this.zs[i] = points[i][1];
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      this.cum[i + 1] = this.cum[i] + Math.hypot(this.xs[j] - this.xs[i], this.zs[j] - this.zs[i]);
      const p = (i - 1 + n) % n;
      const dx = this.xs[j] - this.xs[p];
      const dz = this.zs[j] - this.zs[p];
      const l = Math.hypot(dx, dz) || 1;
      this.txs[i] = dx / l;
      this.tzs[i] = dz / l;
    }
    this.length = this.cum[n];
  }

  wrap(s: number): number {
    const L = this.length;
    return ((s % L) + L) % L;
  }

  /** 第 i 段（点 i → i+1）里，里程 s 所在的段号 */
  segmentAt(s: number): number {
    s = this.wrap(s);
    let lo = 0;
    let hi = this.n - 1;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (this.cum[m] <= s) lo = m;
      else hi = m - 1;
    }
    return lo;
  }

  /** 里程 s 处的点和（平滑插值的）切线 */
  sample(s: number, out: TrackPoint = { x: 0, z: 0, tx: 1, tz: 0 }): TrackPoint {
    s = this.wrap(s);
    const i = this.segmentAt(s);
    const j = (i + 1) % this.n;
    const segLen = this.cum[i + 1] - this.cum[i] || 1;
    const t = (s - this.cum[i]) / segLen;
    out.x = this.xs[i] + (this.xs[j] - this.xs[i]) * t;
    out.z = this.zs[i] + (this.zs[j] - this.zs[i]) * t;
    const tx = this.txs[i] + (this.txs[j] - this.txs[i]) * t;
    const tz = this.tzs[i] + (this.tzs[j] - this.tzs[i]) * t;
    const l = Math.hypot(tx, tz) || 1;
    out.tx = tx / l;
    out.tz = tz / l;
    return out;
  }

  /** 把点投影到中心线。hint：上一次的段号，只在附近找（避免跳到隔壁平行直道）；没有就全局找 */
  project(x: number, z: number, hint = -1): Projection {
    const n = this.n;
    let best = Infinity;
    let bi = 0;
    let bt = 0;
    const range = hint < 0 ? n : 24;
    const start = hint < 0 ? 0 : hint - range;
    for (let k = 0; k < (hint < 0 ? n : range * 2 + 1); k++) {
      const i = (((start + k) % n) + n) % n;
      const j = (i + 1) % n;
      const ax = this.xs[i];
      const az = this.zs[i];
      const dx = this.xs[j] - ax;
      const dz = this.zs[j] - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      const d = (x - ax - dx * t) ** 2 + (z - az - dz * t) ** 2;
      if (d < best) {
        best = d;
        bi = i;
        bt = t;
      }
    }
    const j = (bi + 1) % n;
    const dx = this.xs[j] - this.xs[bi];
    const dz = this.zs[j] - this.zs[bi];
    const l = Math.hypot(dx, dz) || 1;
    const px = this.xs[bi] + dx * bt;
    const pz = this.zs[bi] + dz * bt;
    // 左手法线 (-tz, tx)
    const lateral = (x - px) * (-dz / l) + (z - pz) * (dx / l);
    return { s: this.cum[bi] + (this.cum[bi + 1] - this.cum[bi]) * bt, lateral, index: bi };
  }

  /**
   * 电脑车的限速表（每个点一个速度）：弯道按 v = √(a·R) 限速，再从后往前按刹车能力传播，
   * 这样进弯前会提前减速。
   */
  speedProfile(vmax: number, aLat: number, brake: number): Float64Array {
    const n = this.n;
    const v = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      // 前后 2 个点的切线夹角 / 弧长 = 曲率
      const a = (i - 2 + n) % n;
      const b = (i + 2) % n;
      const cross = this.txs[a] * this.tzs[b] - this.tzs[a] * this.txs[b];
      const dot = this.txs[a] * this.txs[b] + this.tzs[a] * this.tzs[b];
      const ang = Math.abs(Math.atan2(cross, dot));
      const arc = Math.max(0.1, this.wrap(this.cum[i] - this.cum[a]) + this.wrap(this.cum[b] - this.cum[i]));
      const k = ang / arc;
      v[i] = k > 1e-4 ? Math.min(vmax, Math.sqrt(aLat / k)) : vmax;
    }
    for (let pass = 0; pass < 2; pass++)
      for (let i = n - 1; i >= 0; i--) {
        const j = (i + 1) % n;
        const ds = this.cum[i + 1] - this.cum[i];
        v[i] = Math.min(v[i], Math.sqrt(v[j] * v[j] + 2 * brake * ds));
      }
    return v;
  }
}
