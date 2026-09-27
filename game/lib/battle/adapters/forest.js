/* ============================================================================
   Адаптер карты «Тихий бор» (forest.html, window.MAP_API).
   Пули — общая баллистика карты (падение, пробитие досок, рикошеты,
   разрушения); попадания по бойцам проверяются отрезком пути пули за кадр.
   ========================================================================== */
export function createForestAdapter(onFrame) {
  const M = window.MAP_API, T = M.THREE, PL = M.player;
  const MAPC = M.map, PLAY = MAPC.PLAY;
  const TK = { alpha: 'A', delta: 'D' };
  const tmp = { p: new T.Vector3(), a: new T.Vector3(), b: new T.Vector3() };
  let battle = null;

  /* светлое время суток, погода без гроз: бой должен быть читаемым */
  M.setTime(10.5);
  M.time.speed = 1 / 240;
  if (M.weather) { M.weather.auto = false; try { M.setWeather('clear', true); } catch (e) { /* старая карта */ } }

  const bases = {};
  for (const team of ['alpha', 'delta']) {
    const s = M.spawnsAt[TK[team]];
    const B = M.bases.find((b) => b.s === s);
    const fx = B ? B.flag[0] : s.x, fz = B ? B.flag[1] : s.z;
    bases[team] = { x: s.x + s.fx * 4, z: s.z + s.fz * 4, yaw: s.yaw, spawnR: 9, flag: { x: fx, y: M.hFast(fx, fz), z: fz }, flagIdx: M.bases.indexOf(B) };
  }
  const resupply = M.crates.map((c) => ({ x: c.x, z: c.z, y: c.y ?? M.hFast(c.x, c.z), r: Math.min(3.2, (c.reach || 2.4) * 0.6), name: c.name }));

  function collide(p, r, h) { M.pushOut(p, r, p.y + 0.42, p.y + h); }
  function groundY(x, z, yRef) {
    const h = M.hFast(x, z);
    const s = M.supportTop(x, z, 0.3, Math.max(yRef, h) + 0.2, 0.45);
    return s > h ? s : h;
  }
  const _pp = { x: 0, y: 0, z: 0 };
  function walkable(x, z) {
    const y = M.hFast(x, z);
    if (M.edgeDist(x, z) > PLAY - 3) return { cost: 0, y };
    let cost = 1;
    if (M.lakeRho(x, z) < 1.05) {
      const depth = MAPC.WATER_Y - y;
      if (depth > 0.45) return { cost: 0, y };
      if (depth > 0.05) cost = 3;
    }
    _pp.x = x; _pp.z = z;
    if (M.pushOut(_pp, 0.34, y + 0.35, y + 1.7)) return { cost: 0, y };
    const bog = M.inBog ? M.inBog(x, z) : 0;
    if (bog > 0.25) cost = Math.max(cost, 1 + bog * 3);
    return { cost, y };
  }

  function coverSources() {
    const out = [];
    for (const c of M.colliders) {
      if (c.dead || c.wire || c.pane || c.dyn) continue;
      const g = M.hFast(c.x, c.z);
      if (c.y0 - g > 0.5) continue;
      const h = c.y1 - g;
      if (c.t === 0) { if (c.r >= 0.17 && c.r < 3) out.push({ x: c.x, z: c.z, r: c.r, h: Math.min(h, 3) }); }
      else if (c.hw < 14 && c.hd < 14 && (c.hw > 0.25 || c.hd > 0.25)) out.push({ x: c.x, z: c.z, hw: c.hw, hd: c.hd, c: c.c, s: c.s, h: Math.min(h, 3) });
    }
    return out;
  }

  /* Видимость: рельеф + физика; стволы деревьев и стены закрывают, стекло — нет. */
  function losClear(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = Math.hypot(dx, dy, dz);
    const n = Math.max(2, Math.ceil(L / 1.2));
    for (let i = 1; i < n; i++) {
      const t = i / n, x = a.x + dx * t, y = a.y + dy * t, z = a.z + dz * t;
      if (y < M.hFast(x, z) - 0.05) return false;
    }
    if (!M.phys.ready) return true;
    const h = M.rayCast(a, b);
    if (!h || h.dist > L - 0.3) return true;
    if (h.idx === -1) return false;
    if (h.idx <= -1000) return true;                  // стекло
    if (h.idx < 0 || h.idx >= 1e6) return true;        // игрок, динамика
    const c = M.colliders[h.idx];
    return !c || c.dead || !!c.wire || !!c.pane;
  }
  function rayWorld(a, b) {
    const h = M.phys.ready ? M.rayCast(a, b) : null;
    if (h && h.idx !== -2) return { point: h.point.clone(), normal: h.normal.clone(), dist: h.dist };
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = Math.hypot(dx, dy, dz), n = Math.max(1, Math.ceil(L / 0.25));
    for (let i = 1; i <= n; i++) {
      const t = i / n, x = a.x + dx * t, y = a.y + dy * t, z = a.z + dz * t;
      if (y < M.hFast(x, z)) return { point: new T.Vector3(x, M.hFast(x, z), z), normal: new T.Vector3(0, 1, 0), dist: L * t };
    }
    return null;
  }

  /* --------------------------------------------------------- пули --- */
  const live = [];
  function fire(shot) {
    const b = M.fireBullet({ pos: shot.origin, dir: shot.dir, speed: shot.speed, cal: 'rifle', tracer: !!shot.tracer });
    b.sg = shot;
    live.push(b);
  }
  function traceBullets() {
    for (let i = live.length - 1; i >= 0; i--) {
      const b = live[i];
      if (b.sgDone || b.age > 3.3) { live.splice(i, 1); continue; }
      if (b.dead) b.sgDone = true;
      const hit = battle.combat.traceUnits(b.trail, b.p, b.sg.owner);
      if (hit) {
        b.dead = true; b.deadAt = b.age; b.p.copy(hit.point); b.sgDone = true;
        battle.combat.onUnitHit(hit, b.sg);
      }
    }
  }

  let ownBlast = false;
  M.blast.hooks.push((x, y, z, size) => { if (!ownBlast && battle) battle.combat.mapBlast(x, y, z, size); });
  function explode(p, kind) {
    ownBlast = true;
    try { M.explode(p.x, p.y, p.z, kind === 'frag' ? 'pmn' : kind || 'pmn'); } finally { ownBlast = false; }
  }
  const flashLight = new T.PointLight(0xffffff, 0, 30, 2);
  M.scene.add(flashLight);
  let flashT = 0;
  function flash(p) { flashLight.position.copy(p).y += 0.3; flashT = 0.12; flashLight.intensity = 4000; }

  function destroyFlag(team, pos) {
    explode(new T.Vector3(pos.x, pos.y + 0.5, pos.z), 'shell');
    const i = bases[team].flagIdx;
    const f = M.flagList[i >= 0 ? i : (team === 'alpha' ? 0 : 1)];
    if (f && f.cloth && f.cloth.mesh) f.cloth.mesh.visible = false;
  }

  function blood(p, dir) {
    if (!M.fx || !M.fx.alpha) return;
    for (let i = 0; i < 5; i++) {
      M.fx.alpha.spawn({ x: p.x, y: p.y, z: p.z, vx: dir.x * 1.5 + (Math.random() - 0.5), vy: Math.random() * 0.8, vz: dir.z * 1.5 + (Math.random() - 0.5),
        size: 0.05 + Math.random() * 0.06, grow: 0.5, life: 0.35 + Math.random() * 0.3, col: [0.32, 0.02, 0.02], a: 0.85, drag: 3, grav: 6 });
    }
  }

  /* ------------------------------------------------------- игрок --- */
  const player = {
    get pos() { return PL.pos; },
    get vel() { return PL.vel; },
    get yaw() { return PL.yaw; }, set yaw(v) { PL.yaw = v; },
    get pitch() { return PL.pitch; }, set pitch(v) { PL.pitch = Math.max(-1.54, Math.min(1.54, v)); },
    get crouch() { return PL.crouch || 0; },
    get onLadder() { return !!PL.ladder; },
    eye: () => M.camera.position,
    mapDeath() { return PL.dead > 0 && PL.dead < 1e8 ? (PL.deathMsg || 'погиб') : null; },
    kill() { PL.dead = 1e9; },
    respawn(x, z, yaw) { PL.dead = 0; M.teleport(x, M.hFast(x, z) + 0.05, z, yaw, -0.03); },
    freeze(on) { PL.dead = on ? 1e9 : 0; }
  };

  const MOVE_CODE = { fwd: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', sprint: 'ShiftLeft', crouch: 'KeyC', jump: 'Space' };
  function setMove(a, down) { const c = MOVE_CODE[a]; if (c) M.keys[c] = !!down; }
  const _sv = new T.Vector3();
  function spectate(u) {
    const cam = M.camera;
    _sv.set(u.pos.x + Math.sin(u.aimYaw) * 3.4, u.pos.y + 2.3, u.pos.z + Math.cos(u.aimYaw) * 3.4);
    cam.position.lerp(_sv, 0.12);
    cam.lookAt(u.pos.x, u.pos.y + 1.4, u.pos.z);
  }

  function start(team) {
    PL.team = TK[team];
    M.spawnAt(TK[team], 'walk');
    M.enter();
  }

  window.MAP_HOOKS = window.MAP_HOOKS || [];
  window.MAP_HOOKS.push((dt) => {
    if (flashT > 0) { flashT -= dt; flashLight.intensity = flashT > 0 ? 4000 * flashT / 0.12 : 0; }
    if (battle) traceBullets();
    onFrame(dt);
  });

  return {
    name: 'forest', T, scene: M.scene, camera: M.camera, renderer: M.renderer, composer: M.composer,
    bounds: { x0: -PLAY + 2, x1: PLAY - 2, z0: -PLAY + 2, z1: PLAY - 2 },
    base: (team) => bases[team], resupply,
    groundY, collide, walkable, coverSources, losClear, rayWorld, fire, explode, flash, destroyFlag, blood,
    visibility: () => 1 - (M.sky && M.sky.night ? M.sky.night * 0.55 : 0),
    player, start, setMove, spectate,
    pause(on) { if (on) M.pauseGame(); else M.enter(); },
    paused: () => !!(M.pauseState && M.pauseState.on),
    audio: () => (M.audio && M.audio.ctx ? { ctx: M.audio.ctx, out: M.audio.master || M.audio.ctx.destination } : null),
    toast: (m) => M.toast && M.toast(m),
    setBattle(b) { battle = b; },
    mapImage: { size: 224, x0: -112, z0: -112 }
  };
}
