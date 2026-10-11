import RAPIER from '@dimforge/rapier3d-compat';

export type Rapier = typeof RAPIER;

// 碰撞分组（Rapier InteractionGroups：高 16 位是所属组，低 16 位是可以和哪些组碰撞）
const GROUP_WORLD = 0x0001; // 普通建筑：挡人也挡相机
const GROUP_PLAYER_ONLY = 0x0002; // 只挡人的隐形挡板（栏杆加高、广场边界），相机可以越过
const GROUP_PLAYER = 0x0004;
const groups = (member: number, filter: number) => ((member << 16) | filter) >>> 0;
export const COLLIDE_WORLD = groups(GROUP_WORLD, 0xffff);
export const COLLIDE_PLAYER_ONLY = groups(GROUP_PLAYER_ONLY, GROUP_PLAYER);
export const COLLIDE_PLAYER = groups(GROUP_PLAYER, 0xffff);
/** 相机射线只检测普通建筑 */
const QUERY_CAMERA = groups(0xffff, GROUP_WORLD);

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

  addBox(min: readonly number[], max: readonly number[], playerOnly = false) {
    const hx = (max[0] - min[0]) / 2;
    const hy = (max[1] - min[1]) / 2;
    const hz = (max[2] - min[2]) / 2;
    const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(min[0] + hx, min[1] + hy, min[2] + hz)
      .setCollisionGroups(playerOnly ? COLLIDE_PLAYER_ONLY : COLLIDE_WORLD);
    this.world.createCollider(desc);
    this.colliderCount++;
  }

  addConvexHull(points: number[]) {
    const desc = RAPIER.ColliderDesc.convexHull(new Float32Array(points));
    if (!desc) {
      console.warn('convexHull 生成失败', points);
      return;
    }
    desc.setCollisionGroups(COLLIDE_WORLD);
    this.world.createCollider(desc);
    this.colliderCount++;
  }

  /** 相机用的射线：返回到第一个建筑表面的距离，没有碰到返回 null。 */
  cameraRay(origin: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, maxDist: number): number | null {
    const ray = new RAPIER.Ray(origin, dir);
    const hit = this.world.castRay(ray, maxDist, true, undefined, QUERY_CAMERA);
    return hit ? hit.timeOfImpact : null;
  }

  /** 向下找地面（影子用），返回地面高度 */
  groundBelow(x: number, y: number, z: number, maxDist = 30): number | null {
    const d = this.cameraRay({ x, y, z }, { x: 0, y: -1, z: 0 }, maxDist);
    return d === null ? null : y - d;
  }

  step(dt: number) {
    this.world.timestep = dt;
    this.world.step();
  }
}
