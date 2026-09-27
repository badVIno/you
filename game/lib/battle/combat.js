/* ============================================================================
   Выстрелы, попадания, подавление и гранаты.

   М67: разлёт осколков по закону обратных квадратов — ожидаемое число
   попаданий λ = 14·(5/d)² с учётом открытости цели (3 луча до ног, груди,
   головы) и позы; взрывная волна смертельна ближе 2 м. На практике: до 5 м —
   почти всегда смерть, 5–15 м — ранения и потери, дальше 20 м — редкие осколки.
   М84: ослепление S = fd·(vis·look + (1−vis)·0,22), fd = 1/(1+(d/5)²)
   (формула из оружейного файла гранаты), оглушение до 10 м.
   ========================================================================== */
import { clamp, rand, gauss, fwdX, fwdZ, segSegDist2 } from './util.js';

const G = 9.81;
const ZONES_STAND = [['head', 0.09], ['torso', 0.41], ['arm', 0.2], ['leg', 0.3]];
const ZONES_LOW = [['head', 0.14], ['torso', 0.46], ['arm', 0.22], ['leg', 0.18]];
function pickZone(crouch) {
  const Z = crouch > 0.5 ? ZONES_LOW : ZONES_STAND;
  let r = Math.random();
  for (const [z, w] of Z) { if ((r -= w) <= 0) return z; }
  return 'torso';
}
function poisson(l) {
  if (l > 30) return Math.round(l + Math.sqrt(l) * gauss());
  const L = Math.exp(-l); let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}

export class Combat {
  constructor(B) {
    this.B = B;
    const T = this.T = B.T;
    this.nades = [];
    this.v = { a: new T.Vector3(), b: new T.Vector3(), c: new T.Vector3(), d: new T.Vector3(), o: new T.Vector3() };
    const m67 = new T.SphereGeometry(0.032, 10, 8); m67.scale(1, 1.25, 1);
    const m84 = new T.CylinderGeometry(0.022, 0.022, 0.13, 10);
    this.geo = { m67, m84 };
    this.mat = {
      m67: new T.MeshStandardMaterial({ color: 0x3c4a2c, roughness: 0.7, metalness: 0.2 }),
      m84: new T.MeshStandardMaterial({ color: 0x4a4f44, roughness: 0.55, metalness: 0.5 })
    };
  }

  /* --------------------------------------------------------- выстрелы --- */
  botShot(u, yaw, pitch) {
    const B = this.B, g = u.gun, T = this.T;
    const o = B.vis.muzzle(u, this.v.o);
    const cp = Math.cos(pitch);
    const n = g.pellets || 1;
    for (let i = 0; i < n; i++) {
      const sp = n > 1 ? 0.018 : (g.spreadMoa || 2) * 0.00029;
      const dir = new T.Vector3(fwdX(yaw) * cp, Math.sin(pitch), fwdZ(yaw) * cp);
      dir.x += gauss() * sp; dir.y += gauss() * sp; dir.z += gauss() * sp;
      dir.normalize();
      B.A.fire({ origin: o.clone(), dir, speed: g.v, owner: u, cal: g.cal, tracer: Math.random() < 0.18 });
    }
    B.vis.onShot(u, o);
    B.audio.shot(o, g.cal, false, u);
    B.noise(o, u, B.rules.hearRange);
  }

  playerShot(u, origin, dir, st) {
    const B = this.B, T = this.T;
    const n = st.pellets || 1;
    for (let i = 0; i < n; i++) {
      const d = dir.clone();
      if (n > 1) { d.x += gauss() * 0.02; d.y += gauss() * 0.02; d.z += gauss() * 0.02; d.normalize(); }
      B.A.fire({ origin: origin.clone(), dir: d, speed: st.velocity || 800, owner: u, cal: st.calKey, tracer: false });
    }
    B.audio.shot(origin, st.calKey, true, u);
    B.noise(origin, u, B.rules.hearRange);
  }

  /* Отрезок пули a→b против бойцов; заодно подавление тех, мимо кого прошла. */
  traceUnits(a, b, owner) {
    const B = this.B, T = this.T;
    let best = null;
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    const half = Math.hypot(b.x - a.x, b.z - a.z) / 2 + 3;
    const axA = this.v.c, axB = this.v.d;
    B.hash.query(mx, mz, half, (u) => {
      if (u === owner || !u.alive) return;
      const h = u.rayHit(T, a, b);
      if (h && (!best || h.s < best.s)) best = { unit: u, zone: h.zone, s: h.s };
      if (!h && owner && u.team !== owner.team) {
        axA.set(u.pos.x, u.pos.y + 0.3, u.pos.z); axB.set(u.pos.x, u.pos.y + 1.8, u.pos.z);
        const d2 = segSegDist2(a, b, axA, axB);
        if (d2 < 6.25) {
          u.suppress = Math.min(1.5, u.suppress + (d2 < 1 ? 0.35 : 0.18));
          u.threat = owner.pos.clone();
          if (u.brain && !u.brain.target) { u.brain.alertT = 4; u.brain.alertYaw = Math.atan2(-(owner.pos.x - u.pos.x), -(owner.pos.z - u.pos.z)); }
          if (u.isPlayer) B.onPlayerNearMiss(d2);
        }
      }
    });
    if (best) best.point = new T.Vector3().copy(a).lerp(b, best.s);
    return best;
  }

  onUnitHit(hit, shot) {
    const B = this.B, u = hit.unit;
    const dir = shot.dir || this.v.a.set(0, 0, 0);
    B.vis.blood(hit.point, dir, u);
    u.lastHitT = B.time;
    if (u.hit(hit.zone)) B.kill(u, shot.owner, hit.zone, dir);
    else if (u.isPlayer) B.onPlayerWound(hit.zone);
    else if (u.brain) { u.suppress = 1.2; if (shot.owner) u.threat = shot.owner.pos.clone(); }
  }

  /* ---------------------------------------------------------- гранаты --- */
  nadeNear(p, r) {
    for (const n of this.nades) if (n.fuse < 3.8 && (n.pos.x - p.x) ** 2 + (n.pos.z - p.z) ** 2 < r * r) return n;
    return null;
  }

  spawnNade(type, owner, pos, vel) {
    const T = this.T;
    const mesh = new T.Mesh(this.geo[type], this.mat[type]);
    mesh.castShadow = false;
    mesh.position.copy(pos);
    this.B.A.scene.add(mesh);
    const fuse = type === 'm67' ? rand(4, 5) : rand(1.5, 2.3);
    this.nades.push({ type, owner, pos: pos.clone(), vel: vel.clone(), fuse, mesh, spin: new T.Vector3(rand(-9, 9), rand(-9, 9), rand(-9, 9)), rest: false });
  }

  /* Бросок ботом по баллистической дуге к точке, с человеческой ошибкой. */
  throwGrenade(u, type, target) {
    if (!u.grenades[type]) return false;
    u.grenades[type]--;
    const T = this.T;
    const from = new T.Vector3(u.pos.x, u.eyeY() + 0.1, u.pos.z);
    const tx = target.x + gauss() * 1.6, tz = target.z + gauss() * 1.6;
    const dx = tx - from.x, dz = tz - from.z, d = Math.hypot(dx, dz);
    const h = (target.y !== undefined ? target.y : u.pos.y) - from.y;
    let th = 0.62;
    let den = 2 * Math.cos(th) ** 2 * (d * Math.tan(th) - h);
    if (den <= 0) { th = 0.95; den = 2 * Math.cos(th) ** 2 * (d * Math.tan(th) - h); }
    const v = clamp(Math.sqrt(Math.max(1, G * d * d / Math.max(0.1, den))), 4, 19);
    const vel = new T.Vector3(dx / d * v * Math.cos(th), v * Math.sin(th), dz / d * v * Math.cos(th));
    this.spawnNade(type, u, from, vel);
    this.B.vis.onThrow(u);
    this.B.feed.grenade(u, type);
    return true;
  }

  throwFrom(owner, type, origin, dir, speed) {
    this.spawnNade(type, owner, origin, dir.clone().multiplyScalar(speed));
  }

  update(dt) {
    const B = this.B, A = B.A, v = this.v;
    for (let i = this.nades.length - 1; i >= 0; i--) {
      const n = this.nades[i];
      n.fuse -= dt;
      if (n.fuse <= 0) { this.detonate(n); A.scene.remove(n.mesh); this.nades.splice(i, 1); continue; }
      if (n.rest) continue;
      const steps = 2, h = dt / steps;
      for (let s = 0; s < steps; s++) {
        n.vel.y -= G * h;
        v.a.copy(n.pos); v.b.copy(n.pos).addScaledVector(n.vel, h);
        const hit = A.rayWorld(v.a, v.b);
        if (hit) {
          const nn = hit.normal, vn = n.vel.dot(nn);
          n.vel.addScaledVector(nn, -1.45 * vn).multiplyScalar(0.45);
          n.pos.copy(hit.point).addScaledVector(nn, 0.04);
          B.audio.clink(n.pos);
        } else n.pos.copy(v.b);
        const gy = A.groundY(n.pos.x, n.pos.z, n.pos.y + 0.3) + 0.035;
        if (n.pos.y < gy) {
          n.pos.y = gy;
          if (n.vel.y < -1.5) B.audio.clink(n.pos);
          n.vel.y = Math.abs(n.vel.y) * 0.28;
          n.vel.x *= 0.6; n.vel.z *= 0.6;
          if (n.vel.lengthSq() < 0.09) { n.rest = true; n.vel.set(0, 0, 0); }
        }
      }
      n.mesh.position.copy(n.pos);
      n.mesh.rotation.x += n.spin.x * dt; n.mesh.rotation.z += n.spin.z * dt;
      n.spin.multiplyScalar(n.rest ? 0 : Math.exp(-dt));
    }
  }

  exposure(p, u) {
    const B = this.B, v = this.v;
    let e = 0;
    const hs = [0.25, 1.0 - u.crouch * 0.35, 1.6 - u.crouch * 0.5];
    v.a.set(p.x, p.y + 0.3, p.z);
    for (const hy of hs) {
      v.b.set(u.pos.x, u.pos.y + hy, u.pos.z);
      if (B.A.losClear(v.a, v.b)) e += 1;
    }
    return e / 3;
  }

  detonate(n) {
    const B = this.B, A = B.A, p = n.pos;
    if (n.type === 'm67') {
      A.explode(p, 'frag');
      B.audio.boom(p, 1);
      B.noise(p, n.owner, 200);
      B.hash.query(p.x, p.z, 26, (u) => {
        if (!u.alive) return;
        const d = Math.max(0.3, Math.hypot(u.pos.x - p.x, u.pos.y + 0.9 - p.y, u.pos.z - p.z));
        if (d > 26) return;
        const ex = this.exposure(p, u);
        if (ex <= 0) return;
        if (d < 2.0 * (0.4 + 0.6 * ex)) return B.kill(u, n.owner, 'blast', null, 'граната М67');
        const lam = Math.min(40, 14 * (5 / d) ** 2 * ex * (u.crouch > 0.5 ? 0.62 : 1));
        const hits = poisson(lam);
        /* энергия осколка падает с дистанцией: вдали чаще ранение, чем смерть */
        const pInc = Math.max(0.12, Math.min(1, 1.25 - d / 14));
        for (let k = 0; k < hits && u.alive; k++) {
          const z = pickZone(u.crouch);
          if (Math.random() > pInc) continue;
          if (u.hit(z)) B.kill(u, n.owner, z, null, 'осколки М67');
        }
        if (u.alive) {
          u.suppress = 1.5; u.threat = p.clone();
          if (hits > 0 && u.isPlayer) B.onPlayerWound('frag');
        }
        if (u.isPlayer && u.alive) B.onPlayerBlast(d, ex);
      });
    } else {
      A.flash(p);
      B.audio.bang(p);
      B.noise(p, n.owner, 120);
      B.hash.query(p.x, p.z, 22, (u) => {
        if (!u.alive) return;
        const eyeY = u.eyeY();
        const dx = p.x - u.pos.x, dy = p.y - eyeY, dz = p.z - u.pos.z, d = Math.max(0.4, Math.hypot(dx, dy, dz));
        this.v.a.set(p.x, p.y + 0.1, p.z); this.v.b.set(u.pos.x, eyeY, u.pos.z);
        const vis = A.losClear(this.v.a, this.v.b) ? 1 : 0;
        const fx = u.isPlayer ? B.playerLook() : { x: fwdX(u.aimYaw), z: fwdZ(u.aimYaw), y: 0 };
        const look = clamp(((dx * fx.x + dy * (fx.y || 0) + dz * fx.z) / d + 0.25) / 1.25, 0, 1);
        const fd = 1 / (1 + (d / 5) ** 2);
        const S = fd * (vis * look + (1 - vis) * 0.22);
        const deaf = d < 10 ? (1 - d / 10) * 6 : 0;
        if (u.isPlayer) B.onPlayerFlash(S, deaf);
        else { u.blind = Math.max(u.blind, S * 9); u.deaf = Math.max(u.deaf, deaf); if (S > 0.15) u.suppress = 1.2; }
      });
    }
  }

  /* Взрывы самой карты (мины, бочки, снаряды) тоже ранят бойцов. */
  mapBlast(x, y, z, size) {
    const B = this.B, p = this.v.o.set(x, y, z), R = 12 * size;
    B.hash.query(x, z, R, (u) => {
      if (!u.alive || u.isPlayer) return;
      const d = Math.hypot(u.pos.x - x, u.pos.y + 0.9 - y, u.pos.z - z);
      if (d > R) return;
      const ex = this.exposure(p, u);
      if (d < 1.9 * size * (0.3 + 0.7 * ex)) return B.kill(u, null, 'blast', null, 'взрыв');
      const hits = poisson(Math.min(30, 10 * (2.5 * size / d) ** 2 * ex));
      const pInc = Math.max(0.12, Math.min(1, 1.25 - d / (14 * size)));
      for (let k = 0; k < hits && u.alive; k++) if (Math.random() < pInc && u.hit(pickZone(u.crouch))) B.kill(u, null, 'frag', null, 'взрыв');
    });
  }
}
