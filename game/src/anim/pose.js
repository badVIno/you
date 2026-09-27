/* ============================================================================
   Поза бойца со стороны: корпус, ноги (походка anim/locomotion.js), голова,
   присед, дыхание, «жизнь» в строю, опора стоп. Не зависит от лобби —
   используется генералами в лобби и ботами на картах.

   Порядок кадра: GPose.update() -> GHold.update() (оружие и руки).

   API (self.GPose):
     const p = GPose.create(THREE, char, { rig?, seed? })
        char — GChar.build(...); rig — GRig.Rig (создаётся, если не передан),
        p.rig — тот же риг, его же отдают в GHold.create(THREE, { char, rig: p.rig }).
     p.update(dt, {
        x, y, z,            // позиция стоп в мире
        yaw,                // курс корпуса, рад (0 — к -Z)
        vx, vz,             // скорость в мире, м/с (походка и каденс)
        crouch,             // 0..1
        aimYaw, aimPitch,   // направление взгляда, рад (по умолчанию — курс и 0)
        t,                  // время, с
        lod,                // 0 — всё; 1 — без дыхания, «жизни» и мелочей головы;
                            // 2 — ещё и без опоры стоп (дальние)
        // необязательно (контроллер игрока):
        ready,              // 0..1 стрелковая стойка (разворот корпуса), по умолчанию 0
        ads, lean, sprint, fatigue, speed, stepPhase, breathT,
        idle,               // доля «жизни» в строю на месте (1 — бот, ~0,35 — игрок)
        look,               // оглядываться в строю (по умолчанию — если aimYaw не задан)
        groundAt            // (x, z) -> y для опоры стоп; по умолчанию ровно y
     }) -> { gait, breath, lean, blade }
     p.die(dirX, dirZ)      // падение по направлению (мир), ~0,6 с до позы лёжа
     p.revive()             // снова живой (поза пересчитается в следующем update)
     p.dead, p.deadK        // флаг и доля падения 0..1
     p.stepPhase            // фаза шага (0 — касание правой стопы)
   Мёртвому GHold.update не нужен: руки раскинуты позой падения.
   ========================================================================== */
(function (root, factory) {
  const P = factory(root.GUtil, root.GLoco, root.GRig);
  if (typeof module !== 'undefined' && module.exports) module.exports = P;
  else root.GPose = P;
})(typeof self !== 'undefined' ? self : this, function (U, LOCO, RIG) {
  'use strict';

  const WALK = 2.55, SPRINT = 4.55;
  const DIE_T = 0.6;
  const LIVE_BONES = ['hips', 'spine', 'chest', 'neck', 'head',
    'hipR', 'kneeR', 'ankleR', 'toeR', 'hipL', 'kneeL', 'ankleL', 'toeL',
    'clavR', 'shoulderR', 'elbowR', 'wristR', 'clavL', 'shoulderL', 'elbowL', 'wristL'];
  const wrapPI = (a) => { a = (a + Math.PI) % (Math.PI * 2); return (a < 0 ? a + Math.PI * 2 : a) - Math.PI; };

  function create(THREE, char, opts) {
    const o = opts || {};
    const rig = o.rig || new RIG.Rig(THREE, char);
    const seed = o.seed !== undefined ? o.seed : Math.random() * 100;
    const st = LOCO.stanceFor(seed);
    const b = (n) => char.bone(n);
    const M = char.metrics;
    const flat = { y: 0, fn: null };
    flat.fn = () => flat.y;
    /* объект-«контроллер» для LOCO.gait (читает speed, sprint, crouch, stepPhase) */
    const c = { speed: 0, sprint: 0, crouch: 0, stepPhase: Math.random(), breathT: Math.random() * 100 };
    const plant = { R: 1, L: 1 };
    const p = { rig, stance: st, seed, dead: false, deadK: 0, stepPhase: c.stepPhase };

    p.update = function (dt, u) {
      u = u || {};
      if (p.dead) { updateDead(dt); return null; }
      const lod = u.lod || 0;
      const t = u.t || 0;
      const yaw = u.yaw || 0;
      const speed = u.speed !== undefined ? u.speed : Math.hypot(u.vx || 0, u.vz || 0);
      c.speed = speed;
      c.crouch = U.clamp01(u.crouch || 0);
      c.sprint = u.sprint !== undefined ? u.sprint : U.smoothstep(U.clamp01((speed - WALK) / (SPRINT - WALK)));
      if (u.stepPhase !== undefined) c.stepPhase = u.stepPhase;
      else if (speed > 0.35) c.stepPhase += dt * LOCO.cadence(speed, c.sprint);
      p.stepPhase = c.stepPhase;
      const fatigue = U.clamp01(u.fatigue || 0);
      if (u.breathT !== undefined) c.breathT = u.breathT;
      else c.breathT += dt * U.lerp(1.0, 2.4, fatigue);
      const ads = u.ads || 0, leanIn = u.lean || 0;
      const aimYaw = u.aimYaw === undefined ? yaw : u.aimYaw;
      const aimPitch = u.aimPitch || 0;
      const idle = u.idle === undefined ? 1 : u.idle;
      const lookAround = u.look !== undefined ? !!u.look : u.aimYaw === undefined;

      const g = LOCO.gait(c, M, st);

      /* --- корпус --- */
      const cheap = lod >= 1;
      const breath = cheap ? 0 : Math.sin(c.breathT * 1.5) * 0.5 + Math.sin(c.breathT * 0.73) * 0.5;
      const breathAmp = U.lerp(0.006, 0.026, fatigue);
      /* «жизнь» в строю: вес переходит с ноги на ногу, голова оглядывается */
      const still = 1 - g.gaitK;
      const life = cheap ? null : LOCO.idleLife(t, seed, st);
      const shift = life ? life.shift * still * idle : 0;
      /* наклон вперёд: под бронёй корпус чуть завален, на бегу — сильнее */
      const lean = 0.06 + g.lean + c.crouch * 0.18;
      const sideLean = -leanIn * 0.26;
      /* разворот корпуса (bladed stance) — только в стрелковой стойке */
      const kStance = U.smoothstep(U.clamp01(u.ready || 0));
      const blade = U.lerp(0.52, 0.46, U.smoothstep(ads)) * (1 - U.smoothstep(c.sprint) * 0.55) * U.lerp(0.06, 1, kStance);
      const crouchDrop = c.crouch * (M.hipY - 0.50);
      /* взгляд в сторону от курса: часть берёт корпус, остальное — шея и голова */
      const dYaw = U.clamp(wrapPI(aimYaw - yaw), -1.9, 1.9);
      const twist = U.clamp(dYaw * 0.55, -0.75, 0.75);
      const headYaw = U.clamp(dYaw - twist, -1.1, 1.1);

      char.root.position.set(u.x || 0, u.y || 0, u.z || 0);
      char.root.rotation.set(0, yaw, 0);

      const hips = b('hips');
      hips.position.set(g.sway * 0.5 + shift * 0.028, M.hipY - crouchDrop + g.bob - Math.abs(shift) * 0.008, 0);
      hips.rotation.set(lean * 0.35 + c.crouch * 0.22, -blade * 0.30 + g.pelvisYaw, sideLean * 0.4 + g.pelvisRoll - shift * 0.045);
      /* позвоночник несёт наклон; грудь отвечает тазу встречным поворотом */
      b('spine').rotation.set(lean * 0.40 + breath * breathAmp * 0.5,
        -blade * 0.26 + g.chestYaw * 0.45 + twist * 0.4, sideLean * 0.35 + shift * 0.03);
      b('chest').rotation.set(lean * 0.30 - ads * 0.05 + breath * breathAmp,
        -blade * 0.44 + g.chestYaw * 0.55 + twist * 0.6, sideLean * 0.45 + shift * 0.02);

      /* голова держит взгляд и гасит качку корпуса; в строю — оглядывается */
      const totalLean = lean * 0.70;
      const bladeComp = blade * 0.70 - g.chestYaw * 0.8 + headYaw;
      const look = lookAround && life ? life.look * idle : 0;
      const nod = lookAround && life ? life.nod * idle : 0;
      const tilt = lookAround ? st.headTilt : 0;
      b('neck').rotation.set(U.clamp(aimPitch * 0.34 - totalLean * 0.5, -0.5, 0.5), bladeComp * 0.40 + look * 0.4, 0);
      b('head').rotation.set(U.clamp(aimPitch * 0.55 - totalLean * 0.5 + nod, -0.7, 0.62),
        bladeComp * 0.60 + look * 0.6, -sideLean * 0.3 + tilt);

      /* --- ноги: ключевые кривые шага и бега ---
         hip.x > 0 — бедро вперёд; knee.x < 0 — сгиб колена; ankle.x > 0 —
         носок вверх. В опоре голеностоп тянется к углу ровной подошвы. */
      for (const side of [1, -1]) {
        const SS = side > 0 ? 'R' : 'L';
        const Lg = g.legs[SS];
        plant[SS] = Lg.plant;
        /* нагруженная нога в строю прямее, свободная — согнута */
        const load = side > 0 ? shift : -shift;
        const tonus = st.bend * (1 - g.gaitK) * (1 - load * 0.6) + 0.04 + c.crouch * 1.15;
        const hipX = Lg.hip - c.crouch * 0.85 - 0.02 - tonus * 0.45;
        const kneeX = Lg.knee + tonus;
        const flatA = kneeX - hipX;
        const ankleX = U.lerp(Lg.ankle + tonus * 0.2, flatA, Lg.plant * 0.75) + 0.02;
        b('hip' + SS).rotation.set(hipX, side * (0.04 + st.toeOut * 0.3), side * (st.width + 0.01 - load * 0.02));
        b('knee' + SS).rotation.set(-kneeX, 0, 0);
        b('ankle' + SS).rotation.set(ankleX, side * st.toeOut * 0.5, -side * (st.width * 0.6));
        b('toe' + SS).rotation.set(Lg.toe, 0, 0);
        /* протракция ключицы опорной руки: плечо выходит к цевью */
        const protract = side < 0 ? -blade * 0.34 : -blade * 0.10;
        b('clav' + SS).rotation.set(0, protract, -side * (0.05 + ads * 0.05));
      }

      /* стопы — на грунт (Rig.plantFeet) */
      if (lod < 2) {
        flat.y = u.y || 0;
        rig.plantFeet(u.groundAt || flat.fn, plant);
      } else char.root.updateMatrixWorld(true);
      return { gait: g, breath, lean, blade };
    };

    /* -------------------------------------------------- падение ------ */
    const snap = new Map(), dead = new Map();
    const Q = () => new THREE.Quaternion();
    const E = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
    const fall = { axis: new THREE.Vector3(), yawQ: Q(), pos: new THREE.Vector3(), hips: new THREE.Vector3(), hips0: new THREE.Vector3(), back: false };
    const _q = Q(), _q2 = Q();
    p.die = function (dirX, dirZ) {
      if (p.dead) return;
      p.dead = true; p.deadK = 0; p.deadT = 0;
      let dx = dirX || 0, dz = dirZ || 0;
      const yaw = char.root.rotation.y;
      if (Math.hypot(dx, dz) < 1e-4) { dx = Math.sin(yaw); dz = Math.cos(yaw); }      // назад
      const l = Math.hypot(dx, dz); dx /= l; dz /= l;
      /* вверх поворачивается к направлению падения вокруг оси up × dir */
      fall.axis.set(dz, 0, -dx);
      fall.yawQ.setFromEuler(new THREE.Euler(0, yaw, 0));
      fall.pos.copy(char.root.position);
      /* на спину или ничком — по тому, куда смотрел боец */
      fall.back = (-Math.sin(yaw)) * dx + (-Math.cos(yaw)) * dz < 0;
      fall.hips0.copy(b('hips').position);
      const r = (k) => { const x = Math.sin(seed * 91.7 + k * 37.3) * 43758.5; return x - Math.floor(x); };
      for (const n of LIVE_BONES) snap.set(n, b(n).quaternion.clone());
      const fw = fall.back ? 1 : -1;     // на спине ноги чуть согнуты вверх, ничком — вниз
      dead.set('hips', E(0, 0, 0));
      dead.set('spine', E(-0.05 * fw, (r(1) - 0.5) * 0.3, (r(2) - 0.5) * 0.2));
      dead.set('chest', E(-0.04 * fw, (r(3) - 0.5) * 0.3, 0));
      dead.set('neck', E(-0.1 * fw, (r(4) - 0.5) * 0.6, 0));
      dead.set('head', E(-0.15 * fw, (r(5) - 0.5) * 1.4, (r(6) - 0.5) * 0.6));
      for (const [SS, side] of [['R', 1], ['L', -1]]) {
        const kb = 0.15 + r(7 + side) * 0.5;
        dead.set('hip' + SS, E(kb * 0.5, side * (0.08 + r(9 + side) * 0.2), side * (0.06 + r(11 + side) * 0.12)));
        dead.set('knee' + SS, E(-kb, 0, 0));
        dead.set('ankle' + SS, E(0.3, side * 0.2, 0));
        dead.set('toe' + SS, E(0, 0, 0));
        dead.set('clav' + SS, E(0, 0, 0));
        /* руки раскинуты и опущены (в покое рука — по ±X) */
        const down = 0.35 + r(13 + side) * 0.9;
        dead.set('shoulder' + SS, E((r(15 + side) - 0.5) * 0.8, side * r(17 + side) * 0.5, -side * down));
        dead.set('elbow' + SS, E(0, side * (0.2 + r(19 + side) * 0.9), 0));
        dead.set('wrist' + SS, E(0, 0, -side * 0.3));
      }
    };
    function updateDead(dt) {
      p.deadT += dt;
      const u = U.clamp01(p.deadT / DIE_T);
      /* ускорение как у падения: медленно в начале, удар в конце */
      const k = u * u;
      p.deadK = k;
      for (const n of LIVE_BONES) {
        const s0 = snap.get(n), s1 = dead.get(n);
        if (s0 && s1) b(n).quaternion.slerpQuaternions(s0, s1, U.smoothstep(u));
      }
      /* корпус опускается к земле: в позе лёжа таз — на толщине тела */
      const hips = b('hips');
      hips.position.lerpVectors(fall.hips0, fall.hips.set(0, M.hipY, 0), U.smoothstep(u));
      _q.setFromAxisAngle(fall.axis, k * Math.PI * 0.5 * 0.97);
      char.root.quaternion.copy(_q2.copy(_q).multiply(fall.yawQ));
      char.root.position.copy(fall.pos);
      char.root.position.y += Math.sin(k * Math.PI * 0.5) * 0.12;
      char.root.updateMatrixWorld(true);
    }
    p.revive = function () {
      p.dead = false; p.deadK = 0;
      char.root.quaternion.identity();
    };
    return p;
  }

  return { create };
});
