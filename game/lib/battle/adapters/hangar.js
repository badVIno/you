/* ============================================================================
   Адаптер карты «АНГАР-07» (hangar.html, window.ANGAR).
   Пули — мгновенный луч (дистанции внутри ангара ≤ 100 м): стены, доски и
   стекло пробиваются и разрушаются логикой самой карты (bulletHit), бойца
   поражает первое попадание до точки остановки пули.
   ========================================================================== */
export function createHangarAdapter(onFrame) {
  const G = window.ANGAR, T = G.THREE, PL = G.PL, GRP = G.GRP;
  const TK = { alpha: 'ALPHA', delta: 'DELTA' };
  const tmp = { a: new T.Vector3(), b: new T.Vector3(), c: new T.Vector3() };
  let battle = null;

  /* встроенное оружие карты выключаем — у игрока оружие из оружейной */
  const WPN = G.WPN;
  WPN.cool = 1e9; WPN.frags = WPN.fragsMax = 0; WPN.fire = WPN.fireMax = 0;
  if (WPN.viewmodel) WPN.viewmodel.visible = false;
  if (G.DAY) { G.DAY.t = 0.45; G.DAY.paused = true; }

  const bases = {};
  for (const team of ['alpha', 'delta']) {
    const Tm = G.TEAMS[TK[team]], sp = Tm.spawns[0];
    bases[team] = { x: sp.x + Tm.side * -3, z: sp.z, yaw: Tm.side < 0 ? -Math.PI / 2 : Math.PI / 2, spawnR: 4.5, flag: { x: Tm.flag.x, y: 0, z: Tm.flag.z }, spawns: Tm.spawns };
  }
  const resupply = (G.AMMO_BOXES || []).map((b) => {
    const p = b.pos || b.p || b.mesh?.position || b;
    return { x: p.x, y: p.y || 0, z: p.z, r: 1.6 };
  }).filter((r) => Number.isFinite(r.x));

  /* --------------------------------------------- проходимость (сетка) --- */
  const X0 = -39.5, X1 = 39.5, Z0 = -29.5, Z1 = 29.5, CELL = 0.5;
  const NX = Math.ceil((X1 - X0) / CELL), NZ = Math.ceil((Z1 - Z0) / CELL);
  const occ = new Uint8Array(NX * NZ);
  const mark = (x, z, r) => {
    const i0 = Math.floor((x - r - X0) / CELL), i1 = Math.floor((x + r - X0) / CELL), j0 = Math.floor((z - r - Z0) / CELL), j1 = Math.floor((z + r - Z0) / CELL);
    for (let j = Math.max(0, j0); j <= Math.min(NZ - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(NX - 1, i1); i++) occ[j * NX + i] = 1;
  };
  const obbs = [];
  for (let k = 1; k < G.COLLIDERS.length; k++) {
    const c = G.COLLIDERS[k];
    if (c.playerOnly === undefined && c.y1 !== undefined && (c.y1 < 0.3 || c.y0 > 1.7)) continue;
    if (c.y1 < 0.3 || c.y0 > 1.7) continue;
    let yaw = 0;
    if (c.q) { const q = new T.Quaternion(c.q[0], c.q[1], c.q[2], c.q[3]); yaw = new T.Euler().setFromQuaternion(q, 'YXZ').y; }
    obbs.push({ x: c.cx, z: c.cz, hw: c.hx, hd: c.hz, c: Math.cos(yaw), s: Math.sin(yaw), h: c.y1, yaw });
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    for (let a = -c.hx; a <= c.hx; a += CELL * 0.5) for (let b = -c.hz; b <= c.hz; b += CELL * 0.5) mark(c.cx + a * cs + b * sn, c.cz - a * sn + b * cs, 0.3);
  }
  for (const s of G.DEST.sheets) {
    if (Math.abs(s.V.y) < 0.7) continue;
    const y0 = s.c.y - s.h / 2, y1 = s.c.y + s.h / 2;
    if (y1 < 0.3 || y0 > 1.7) continue;
    for (let a = -s.w / 2; a <= s.w / 2; a += CELL * 0.5) mark(s.c.x + s.U.x * a, s.c.z + s.U.z * a, s.t / 2 + 0.3);
    const yaw = Math.atan2(-s.U.z, s.U.x);
    obbs.push({ x: s.c.x, z: s.c.z, hw: s.w / 2, hd: Math.max(0.1, s.t / 2), c: Math.cos(yaw), s: Math.sin(yaw), h: Math.min(y1, 3) });
  }
  function walkable(x, z) {
    const i = Math.floor((x - X0) / CELL), j = Math.floor((z - Z0) / CELL);
    if (i < 0 || j < 0 || i >= NX || j >= NZ) return { cost: 0, y: 0 };
    return { cost: occ[j * NX + i] ? 0 : 1, y: 0 };
  }
  function collide(p) {
    for (let it = 0; it < 2; it++) {
      const i = Math.floor((p.x - X0) / CELL), j = Math.floor((p.z - Z0) / CELL);
      if (i < 0 || j < 0 || i >= NX || j >= NZ) { p.x = Math.max(X0 + 0.5, Math.min(X1 - 0.5, p.x)); p.z = Math.max(Z0 + 0.5, Math.min(Z1 - 0.5, p.z)); return; }
      if (!occ[j * NX + i]) return;
      let best = null, bd = 9;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= NX || jj >= NZ || occ[jj * NX + ii]) continue;
        const cx = X0 + (ii + 0.5) * CELL, cz = Z0 + (jj + 0.5) * CELL, d = (cx - p.x) ** 2 + (cz - p.z) ** 2;
        if (d < bd) { bd = d; best = [cx, cz]; }
      }
      if (!best) return;
      p.x += (best[0] - p.x) * 0.5; p.z += (best[1] - p.z) * 0.5;
    }
  }
  const groundY = () => 0;
  function coverSources() { return obbs.map((o) => ({ x: o.x, z: o.z, hw: o.hw, hd: o.hd, c: o.c, s: o.s, h: o.h })); }

  function losClear(a, b) {
    const h = G.rayFirst(a, b, GRP.STATIC);
    if (!h) return true;
    const L = a.distanceTo(b);
    return h.f * L > L - 0.3;
  }
  function rayWorld(a, b) {
    const h = G.rayFirst(a, b, GRP.STATIC | GRP.DYN);
    if (!h) return a.y > 0 && b.y < 0 ? { point: tmp.c.copy(a).lerp(b, a.y / (a.y - b.y)).clone(), normal: new T.Vector3(0, 1, 0), dist: 0 } : null;
    return { point: h.p, normal: h.n, dist: h.f * a.distanceTo(b) };
  }

  /* мгновенный луч: сначала бойцы на всей длине, потом стены до этой точки */
  function fire(shot) {
    const R = 160, a = shot.origin, b = tmp.b.copy(shot.dir).multiplyScalar(R).add(a);
    const hit = battle.combat.traceUnits(a, b, shot.owner);
    const unitD = hit ? hit.s * R : 1e9;
    let power = shot.cal === 'p9' ? 0.55 : shot.cal === 'g12' ? 0.4 : 1;
    const hits = G.rayAll(a, b, GRP.STATIC | GRP.DYN | GRP.DEBRIS);
    for (const h of hits) {
      if (h.f * R > unitD) break;
      const r = G.bulletHit(h, shot.dir, power);
      power -= r.cost;
      if (r.stop || power <= 0) return;
    }
    if (hit) battle.combat.onUnitHit(hit, shot);
  }

  let ownBlast = false;
  const prevBlast = G.HOOKS.playerBlast;
  G.HOOKS.playerBlast = (p, R, P) => {
    if (!ownBlast && battle) battle.combat.mapBlast(p.x, p.y, p.z, R / 6);
    if (ownBlast) return;
    return prevBlast && prevBlast(p, R, P);
  };
  function explode(p, kind) {
    ownBlast = true;
    try { G.grenadeExplode(p.clone ? p.clone() : new T.Vector3(p.x, p.y, p.z), kind === 'shell' ? 1.6 : 1); } catch (e) { G.explode(p, { radius: 6 }); } finally { ownBlast = false; }
  }
  const flashLight = new T.PointLight(0xffffff, 0, 26, 2);
  G.scene.add(flashLight);
  let flashT = 0;
  function flash(p) { flashLight.position.copy(p).y += 0.3; flashT = 0.12; flashLight.intensity = 3000; }
  function destroyFlag(team, pos) {
    explode(new T.Vector3(pos.x, 0.6, pos.z), 'shell');
    for (const s of (G.PH.soft || [])) if (s.team === TK[team] && s.mesh) s.mesh.visible = false;
  }
  function blood(p, dir) { try { G.impactFX(p, dir.clone().negate(), 'flesh', dir); } catch (e) { /* нет эффекта */ } }

  const MOVE_CODE = { fwd: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', sprint: 'ShiftLeft', crouch: 'KeyC', jump: 'Space' };
  function setMove(a, down) { const c = MOVE_CODE[a]; if (c) G.keys[c] = !!down; }
  const feet = new T.Vector3();
  const player = {
    get pos() { const e = PL.eye || G.camera.position; return feet.set(e.x, Math.max(0, e.y - (1.62 - PL.crouch * 0.57)), e.z); },
    get vel() { return PL.vel; },
    get yaw() { return PL.yaw; }, set yaw(v) { PL.yaw = v; },
    get pitch() { return PL.pitch; }, set pitch(v) { PL.pitch = Math.max(-1.5, Math.min(1.5, v)); },
    get crouch() { return PL.crouch || 0; },
    mapDeath() { return !PL.alive && !player._ours ? (PL.killedBy || 'погиб') : null; },
    kill() { player._ours = true; PL.alive = false; PL.hp = 0; PL.deadT = -1e9; },
    respawn(x, z, yaw) { player._ours = false; G.spawnAt({ x, z }, yaw); },
    freeze(on) { if (on) player.kill(); }
  };
  const _sv = new T.Vector3();
  function spectate(u) {
    const cam = G.camera;
    _sv.set(u.pos.x + Math.sin(u.aimYaw) * 3, u.pos.y + 2.1, u.pos.z + Math.cos(u.aimYaw) * 3);
    cam.position.lerp(_sv, 0.12); cam.lookAt(u.pos.x, u.pos.y + 1.4, u.pos.z);
  }
  function start(team) {
    G.deploy(TK[team], TK[team][0] + '1');
    try { G.closeMenu(); } catch (e) { /* уже закрыто */ }
    WPN.cool = 1e9; if (WPN.viewmodel) WPN.viewmodel.visible = false;
  }

  window.MAP_HOOKS = window.MAP_HOOKS || [];
  window.MAP_HOOKS.push((dt) => {
    if (flashT > 0) { flashT -= dt; flashLight.intensity = flashT > 0 ? 3000 * flashT / 0.12 : 0; }
    if (WPN.viewmodel && WPN.viewmodel.visible) WPN.viewmodel.visible = false;
    onFrame(dt);
  });

  /* с крышей снимок сверху был бы пустым: прячем всё выше 6 м */
  function prepareCapture() {
    const hidden = [];
    G.scene.traverse((o) => {
      if (!o.isMesh || !o.visible || !o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
      if (bb.min.y > 5.5 || (bb.max.y > 9 && bb.max.x - bb.min.x > 30)) { o.visible = false; hidden.push(o); }
    });
    return () => { for (const o of hidden) o.visible = true; };
  }

  return {
    name: 'hangar', T, scene: G.scene, camera: G.camera, renderer: G.renderer, composer: G.getComposer && G.getComposer(),
    bounds: { x0: X0, x1: X1, z0: Z0, z1: Z1 },
    base: (team) => bases[team], resupply,
    groundY, collide, walkable, coverSources, losClear, rayWorld, fire, explode, flash, destroyFlag, blood,
    dynamicShadows: false,
    player, start, setMove, spectate, prepareCapture,
    pause(on) { if (on) G.openMenu('pause'); else G.closeMenu(); },
    paused: () => !!G.STATE.menu,
    audio: () => (G.SND && G.SND.ctx ? { ctx: G.SND.ctx, out: G.SND.master || G.SND.ctx.destination } : null),
    toast: (m) => G.feed && G.feed(m),
    setBattle(b) { battle = b; },
    mapImage: { size: 84, x0: -42, z0: -42 }
  };
}
