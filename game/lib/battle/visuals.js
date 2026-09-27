/* ============================================================================
   Бойцы на карте: те же модели, что генералы в лобби (game/src/soldier),
   у ботов — свой камуфляж и нашивка отряда. Оружие в руках — облегчённые
   модели оружейной (buildWeaponLite), хват и руки — GHold (IK рига).

   Оптимизация под 84 бойца: общая геометрия, LOD-индексы (meshoptimizer:
   ~30% и ~8% треугольников), мелкие меши лица скрываются вдали, тени —
   только вблизи, поза обновляется реже для дальних и невидимых.
   ========================================================================== */
import { buildWeaponLite } from '../weapons/index.js';
import { MeshoptSimplifier } from '../vendor/meshopt_simplifier.js';
import { fwdX, fwdZ } from './util.js';

const SQUAD_LOOK = {
  delta_1: { camo: 'woodland', patchCol: [[70, 78, 46], [214, 196, 120]] },
  delta_2: { camo: 'olive', patchCol: [[84, 88, 64], [226, 226, 200]] },
  alpha_1: { camo: 'urban', patchCol: [[48, 50, 54], [210, 214, 220]] },
  alpha_2: { camo: 'flora', patchCol: [[36, 40, 48], [150, 180, 220]] }
};
const SMALL = new Set(['eye', 'brow', 'lash', 'cornea', 'patch', 'headRubber']);

function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('не загрузился ' + src)); document.head.appendChild(s); });
}

export async function createVisuals(T, A, B, profile, progress) {
  window.THREE = window.THREE || T;
  if (!window.GChar) await loadScript('lib/battle/soldiers.gen.js');
  progress && progress('МОДЕЛИ БОЙЦОВ…', 0.1);
  await window.GAssets.ready();
  if (!window.GChar) throw new Error('GChar недоступен');
  await MeshoptSimplifier.ready;
  const vis = new SoldierVis(T, A, B, profile);
  await vis.prepare(progress);
  return vis;
}

class SoldierVis {
  constructor(T, A, B, profile) {
    this.T = T; this.A = A; this.B = B;
    this.q = profile.settings.quality;
    this.root = new T.Group(); this.root.name = 'signum_units';
    A.scene.add(this.root);
    this.lodGeo = new Map();
    this.guns = new Map();
    this.frame = 0;
    this.maxDist = B.rules.navCell < 1 ? 95 : (this.q === 'low' ? 130 : 180);
    this.frustum = new T.Frustum(); this.pm = new T.Matrix4(); this.sph = new T.Sphere(new T.Vector3(), 1.2);
    this.v = new T.Vector3(); this.v2 = new T.Vector3();
    this.buildMs = 0;
    this.initMarkers();
    this.initFlashes();
  }

  async prepare(progress) {
    const ids = [...new Set(this.B.units.filter((u) => !u.isPlayer).map((u) => u.gunId))];
    let i = 0;
    for (const id of ids) {
      progress && progress('ОРУЖИЕ БОЙЦОВ…', 0.2 + 0.3 * (i++ / ids.length));
      try { this.guns.set(id, await buildWeaponLite(id, null, { maxTris: this.q === 'high' ? 6000 : 3500 })); } catch (e) { console.warn('[vis] оружие', id, e); }
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  gunFor(id) {
    const t = this.guns.get(id);
    if (!t) return null;
    return { ...t, root: new this.T.Mesh(t.root.geometry, t.root.material), anchors: t.anchors };
  }

  /* LOD-индексы для общей геометрии (вершины и веса костей — те же). */
  lodsFor(geo) {
    let L = this.lodGeo.get(geo.uuid);
    if (L) return L;
    const T = this.T;
    L = [geo];
    const idx = geo.index, pos = geo.attributes.position;
    if (idx && pos && idx.count > 900) {
      const positions = pos.array instanceof Float32Array && pos.itemSize === 3 && !pos.isInterleavedBufferAttribute ? pos.array : Float32Array.from({ length: pos.count * 3 }, (_, k) => pos.getComponent(Math.floor(k / 3), k % 3));
      const src = idx.array instanceof Uint32Array ? idx.array : new Uint32Array(idx.array);
      for (const [ratio, err] of [[0.3, 0.01], [0.08, 0.05]]) {
        try {
          const target = Math.max(60, Math.floor(src.length * ratio / 3) * 3);
          const [out] = MeshoptSimplifier.simplify(src, positions, 3, target, err, ['LockBorder']);
          const g = new T.BufferGeometry();
          for (const k in geo.attributes) g.setAttribute(k, geo.attributes[k]);
          g.setIndex(new T.BufferAttribute(pos.count > 65535 ? out : new Uint16Array(out), 1));
          g.boundingSphere = geo.boundingSphere;
          L.push(g);
        } catch (e) { L.push(L[L.length - 1]); }
      }
    } else L.push(geo, geo);
    this.lodGeo.set(geo.uuid, L);
    return L;
  }

  add(u) {
    if (u.isPlayer) { u.vis = null; return; }
    const T = this.T, t0 = performance.now();
    const look = u.role === 'general' ? {} : SQUAD_LOOK[u.key] || {};
    let char;
    try { char = window.GChar.build(T, u.key, look); } catch (e) { char = window.GChar.build(T, u.key); }
    const pose = window.GPose ? window.GPose.create(T, char) : null;
    const rig = pose ? pose.rig : (window.GRig ? new window.GRig.Rig(T, char) : null);
    const hold = window.GHold && rig ? window.GHold.create(T, { char, rig }, { parent: this.root }) : null;
    this.root.add(char.root);
    const meshes = [];
    for (const [g, m] of Object.entries(char.meshes)) {
      m.frustumCulled = false;
      meshes.push({ m, g, small: SMALL.has(g), lods: this.lodsFor(m.geometry), shadow: m.castShadow });
    }
    if (char.hands) for (const k of ['R', 'L']) { const h = char.hands[k]; if (h && h.root) h.root.traverse((o) => { if (o.isMesh) meshes.push({ m: o, g: 'hand', small: false, lods: [o.geometry, o.geometry, o.geometry], shadow: false }); }); }
    const gun = this.gunFor(u.gunId);
    if (hold && gun) { hold.setWeapon(gun); hold.setState('low'); gun.root.castShadow = this.A.dynamicShadows !== false; }
    u.vis = { char, rig, pose, hold, gun, meshes, lod: -1, acc: 0, seen: -99, deadT: 0, gunId: u.gunId, fall: 0 };
    this.buildMs += performance.now() - t0;
  }

  muzzle(u, out) {
    const V = u.vis;
    if (V && V.hold && V.hold.weapon && this.B.time - V.seen < 0.25) return V.hold.muzzleWorld(out);
    return out.set(u.pos.x + fwdX(u.aimYaw) * 0.75 + fwdZ(u.aimYaw) * -0.12, u.eyeY() - 0.14, u.pos.z + fwdZ(u.aimYaw) * 0.75 - fwdX(u.aimYaw) * -0.12);
  }

  /* ---------------------------------------------------- вспышки --- */
  initFlashes() {
    const T = this.T;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.25, 'rgba(255,190,90,.85)'); gr.addColorStop(1, 'rgba(255,120,30,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const mat = new T.SpriteMaterial({ map: new T.CanvasTexture(c), blending: T.AdditiveBlending, depthWrite: false, transparent: true });
    this.flashes = [];
    for (let i = 0; i < 24; i++) { const s = new T.Sprite(mat); s.visible = false; s.scale.setScalar(0.4); this.root.add(s); this.flashes.push({ s, t: 0 }); }
    this.fi = 0;
    this.light = new T.PointLight(0xffb060, 0, 9, 2);
    this.A.scene.add(this.light);
    this.lightT = 0;
  }
  onShot(u, o) {
    const cam = this.A.camera.position, d = cam.distanceTo(o);
    if (d > 220) return;
    const f = this.flashes[this.fi++ % this.flashes.length];
    f.s.position.copy(o); f.s.visible = true; f.t = 0.045; f.s.scale.setScalar((u.gun && u.gun.sniper ? 0.55 : 0.38) * (0.8 + Math.random() * 0.4));
    f.s.material.rotation = Math.random() * 6.28;
    if (d < 45) { this.light.position.copy(o); this.light.intensity = 26; this.lightT = 0.05; }
  }
  onThrow() { }
  blood(p, dir) { this.A.blood && this.A.blood(p, dir); }

  onDeath(u, dir) {
    const V = u.vis; if (!V) return;
    V.deadT = 0; V.fall = 0;
    V.fallDir = dir ? Math.atan2(dir.x, dir.z) : u.yaw + Math.PI;
    if (V.pose && V.pose.die) V.pose.die(dir ? dir.x : 0, dir ? dir.z : 1);
    if (V.hold) V.hold.setWeapon(null);
  }
  onRespawn(u) {
    const V = u.vis; if (!V) return;
    V.fall = 0; V.char.root.rotation.set(0, u.yaw, 0);
    if (V.pose && V.pose.revive) V.pose.revive();
    if (V.hold) { const g = V.gun || this.gunFor(u.gunId); V.gun = g; if (g) { V.hold.setWeapon(g); V.hold.setState('low'); } V.hold.snap && V.hold.snap(); }
    V.char.root.visible = true;
  }

  /* ---------------------------------------------------- метки своих --- */
  initMarkers() {
    const T = this.T, N = 64;
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(4, 9); g.lineTo(16, 25); g.lineTo(28, 9); g.lineTo(22, 9); g.lineTo(16, 17); g.lineTo(10, 9); g.closePath(); g.fill();
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute('color', new T.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setDrawRange(0, 0);
    this.markers = new T.Points(geo, new T.PointsMaterial({ size: 11, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.62, depthTest: false, depthWrite: false, map: new T.CanvasTexture(c), alphaTest: 0.05 }));
    this.markers.frustumCulled = false; this.markers.renderOrder = 999;
    this.A.scene.add(this.markers);
  }
  updateMarkers() {
    const B = this.B, me = B.player, cam = this.A.camera.position;
    const P = this.markers.geometry.attributes.position, C = this.markers.geometry.attributes.color;
    let n = 0;
    for (const u of B.units) {
      if (n >= P.count) break;
      if (!u.alive || u.isPlayer || u.team !== me.team) continue;
      const d = Math.hypot(u.pos.x - cam.x, u.pos.z - cam.z);
      if (d > 150 && !u.selected) continue;
      P.setXYZ(n, u.pos.x, u.pos.y + 2.05 - u.crouch * 0.45, u.pos.z);
      if (u.selected) C.setXYZ(n, 0.22, 0.85, 0.54); else C.setXYZ(n, 0.29, 0.64, 1);
      n++;
    }
    P.needsUpdate = true; C.needsUpdate = true;
    this.markers.geometry.setDrawRange(0, n);
  }

  /* ---------------------------------------------------- кадр --- */
  update(dt, units, B) {
    const T = this.T, cam = this.A.camera;
    this.frame++;
    cam.updateMatrixWorld();
    this.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pm);
    for (const f of this.flashes) if (f.t > 0) { f.t -= dt; if (f.t <= 0) f.s.visible = false; }
    if (this.lightT > 0) { this.lightT -= dt; if (this.lightT <= 0) this.light.intensity = 0; }
    const cp = cam.position;
    for (const u of units) {
      const V = u.vis;
      if (!V) continue;
      const root = V.char.root;
      if (!u.alive) {
        V.deadT += dt;
        if (V.deadT > 40) { root.visible = false; continue; }
        if (!(V.pose && V.pose.die)) {
          V.fall = Math.min(1, V.fall + dt * 2.2);
          const k = V.fall * V.fall;
          root.rotation.set(-k * 1.5, u.yaw, 0, 'YXZ');
          root.position.set(u.pos.x, u.pos.y + k * 0.12, u.pos.z);
        } else if (V.deadT < 1.5) V.pose.update(dt, { x: u.pos.x, y: u.pos.y, z: u.pos.z, yaw: u.yaw, vx: 0, vz: 0, crouch: 0, aimYaw: u.yaw, aimPitch: 0, t: B.time, lod: 0 });
        continue;
      }
      const d = Math.hypot(u.pos.x - cp.x, u.pos.y - cp.y, u.pos.z - cp.z);
      this.sph.center.set(u.pos.x, u.pos.y + 0.9, u.pos.z);
      const inView = d < this.maxDist && this.frustum.intersectsSphere(this.sph);
      root.visible = inView;
      if (V.hold && V.hold.weapon) V.hold.weapon.root.visible = inView;
      V.acc += dt;
      const lod = d < 16 ? 0 : d < 42 ? 1 : 2;
      const every = !inView ? 10 : lod === 0 ? 1 : lod === 1 ? 2 : 3;
      if ((this.frame + u.id) % every !== 0 && V.lod === lod) continue;
      const step = V.acc; V.acc = 0;
      if (lod !== V.lod) {
        V.lod = lod;
        for (const M of V.meshes) {
          M.m.geometry = M.lods[lod] || M.lods[0];
          M.m.visible = !(M.small && lod > 0);
          M.m.castShadow = M.shadow && lod === 0 && this.A.dynamicShadows !== false;
        }
      }
      const busy = u.brain && (u.brain.state === 'engage' || u.brain.alertT > 0);
      if (V.pose) V.pose.update(step, { x: u.pos.x, y: u.pos.y, z: u.pos.z, yaw: u.yaw, vx: u.vel.x, vz: u.vel.z, crouch: u.crouch, aimYaw: u.aimYaw, aimPitch: u.aimPitch, t: B.time, lod, ready: busy ? 1 : 0, sprint: u.speed > 4.5 ? 1 : 0, speed: u.speed });
      else { root.position.copy(u.pos); root.rotation.set(0, u.yaw, 0); }
      if (V.hold) {
        const br = u.brain;
        const st = br && br.state === 'engage' ? 'aim' : (u.speed > 2.4 ? 'low' : 'ready');
        V.hold.setState(st);
        V.hold.update(step, { yaw: u.aimYaw, pitch: u.aimPitch, t: B.time, ik: inView && lod < 2, fingers: lod === 0, trigger: B.time - u.lastShotT < 0.08 ? 1 : 0 });
      }
      if (inView) V.seen = B.time;
    }
    this.updateMarkers();
  }
}
