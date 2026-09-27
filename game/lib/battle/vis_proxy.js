/* Упрощённая визуализация бойцов (капсулы) — запасной вариант, если модели не загрузились. */
import { fwdX, fwdZ } from './util.js';
export class ProxyVis {
  constructor(T, scene) {
    this.T = T; this.scene = scene;
    this.root = new T.Group(); this.root.name = 'signum_units'; scene.add(this.root);
    const g = new T.CapsuleGeometry(0.26, 1.2, 4, 8); g.translate(0, 0.86, 0);
    this.geo = g;
    this.mat = { alpha: new T.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.8 }), delta: new T.MeshStandardMaterial({ color: 0x4d5a36, roughness: 0.8 }) };
  }
  add(u) {
    const m = new this.T.Mesh(this.geo, this.mat[u.team]);
    m.castShadow = true;
    this.root.add(m);
    u.vis = { mesh: m };
  }
  muzzle(u, out) { return out.set(u.pos.x + fwdX(u.aimYaw) * 0.7, u.eyeY() - 0.12, u.pos.z + fwdZ(u.aimYaw) * 0.7); }
  onShot() { } onThrow() { } blood() { }
  onDeath(u) { if (u.vis) { u.vis.mesh.rotation.x = Math.PI / 2; u.vis.mesh.position.y = u.pos.y + 0.2; } }
  onRespawn(u) { if (u.vis) u.vis.mesh.rotation.x = 0; }
  update(dt, units) {
    for (const u of units) {
      if (!u.vis || u.isPlayer) { if (u.vis) u.vis.mesh.visible = false; continue; }
      const m = u.vis.mesh;
      if (u.alive) { m.position.copy(u.pos); m.rotation.y = u.yaw; m.scale.y = 1 - u.crouch * 0.35; }
      m.visible = u.alive || u.deadT < 25;
    }
  }
}
