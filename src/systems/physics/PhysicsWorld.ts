import RAPIER from '@dimforge/rapier3d-compat';

export type Rapier = typeof RAPIER;

/** Rapier 物理世界的薄封装：静态碰撞体都是没有刚体的 fixed collider。 */
export class PhysicsWorld {
  readonly R: Rapier = RAPIER;
  readonly world: RAPIER.World;
  colliderCount = 0;

  private constructor() {
    // 角色控制器自己处理重力，这里的世界重力只影响将来的动态物体
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  }

  static async create(): Promise<PhysicsWorld> {
    await RAPIER.init();
    return new PhysicsWorld();
  }

  addBox(min: readonly number[], max: readonly number[]) {
    const hx = (max[0] - min[0]) / 2;
    const hy = (max[1] - min[1]) / 2;
    const hz = (max[2] - min[2]) / 2;
    const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(min[0] + hx, min[1] + hy, min[2] + hz);
    this.world.createCollider(desc);
    this.colliderCount++;
  }

  addConvexHull(points: number[]) {
    const desc = RAPIER.ColliderDesc.convexHull(new Float32Array(points));
    if (!desc) {
      console.warn('convexHull 生成失败', points);
      return;
    }
    this.world.createCollider(desc);
    this.colliderCount++;
  }

  step(dt: number) {
    this.world.timestep = dt;
    this.world.step();
  }
}
