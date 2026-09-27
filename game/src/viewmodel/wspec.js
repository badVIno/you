/* ============================================================================
   Спека рига рук (viewmodel/vm.js) для любого оружия из game/lib/weapons.

   Риг настроен в «системе оружия рига»: -Z к дулу, метры; хват правой кисти
   и позы (наготове, бег, упор) подобраны под одно место рукоятки. Любое
   оружие ставится в эту систему сдвигом OFF так, чтобы его anchors.grip
   (центр ладони на рукоятке) лёг в ладонь правой кисти рига. Опорная кисть
   переносится на anchors.support, прицел — на anchors.eye.

   API (self.GWSpec):
     frames(build) -> { off, offM, offInv, rightGrip, leftGrip, rightRoot, leftRoot, hands, pistol }
        rightGrip/leftGrip — матрицы кистей в системе рига,
        rightRoot/leftRoot — те же кисти в системе build.root (для вида со стороны)
     createSpec(build) -> { spec, model, apply(rig, rigRootWorld) }
        spec — для new GVM.WeaponRig(assets, [spec]); apply ставит build.root
        (и магазин) по состоянию рига в кадре.
   ========================================================================== */
(function (root, factory) {
  const W = factory(root.THREE, root.GVM);
  if (typeof module !== 'undefined' && module.exports) module.exports = W;
  else root.GWSpec = W;
})(typeof self !== 'undefined' ? self : this, function (THREE, VM) {
  'use strict';
  if (!VM) return null;
  const { gripMatrix, pose: P, translate, magInHand, pouch, LEFT_OPEN, CONFIG } = VM;
  const DEG = Math.PI / 180;

  /* Хваты, под которые настроены позы рига (исходно — модульный АК-74). */
  const RIGHT_GRIP = gripMatrix([0.028, -0.0775, 0.062], [0, -0.342, -0.94], [1, 0, 0]);
  const LEFT_GRIP = new THREE.Matrix4().makeRotationZ(-50 * DEG)
    .multiply(gripMatrix([-0.039 * 0.9, -0.057 * 0.9, -0.250], [0.72, 0.12, -0.68], [0.087, -0.992, -0.083]));
  /* Пистолет: опорная кисть снизу-слева обхватывает правую. */
  const LEFT_PISTOL = gripMatrix([-0.050, -0.105, 0.080], [0.62, 0.30, -0.72], [-0.62, -0.70, -0.30]);
  /* Точка хвата в системе кисти: центр ладони, углублённый к оси рукоятки. */
  const PALM_R = new THREE.Vector3(0, -0.035, -0.05);
  const PALM_L = new THREE.Vector3(0, -0.042, -0.05);
  const RIG_GRIP = PALM_R.clone().applyMatrix4(RIGHT_GRIP);
  const RIG_SUPPORT = PALM_L.clone().applyMatrix4(LEFT_GRIP);

  const fingers = { middle: [0.1, 1.35, 1.45, 0.7, 0], ring: [0.15, 1.35, 1.45, 0.7, 0], pinky: [0.2, 1.25, 1.35, 0.7, 0] };
  const thumb = [0.9, 0.45, 0.35, 0, -0.35];
  const HANDS = {
    indexed: P(thumb, [0, 0, 0.1, 0.05, -0.1], fingers.middle, fingers.ring, fingers.pinky),
    trigger: P(thumb, [0, 0.36, 1.0, 0.45, 0.02], fingers.middle, fingers.ring, fingers.pinky),
    magRelease: P(thumb, [0, 0.15, 0.45, 0.25, -0.15], fingers.middle, fingers.ring, fingers.pinky),
    support: P([0.3, 0.15, 0.05, 0, 0.2], [0.05, 1.25, 1.35, 0.65, 0], [0.05, 1.3, 1.4, 0.7, 0], [0.1, 1.3, 1.4, 0.7, 0], [0.15, 1.25, 1.35, 0.7, 0]),
    open: LEFT_OPEN,
    mag: P([0.5, 0.3, 0.2, 0, 0.2], [0, 0.2, 0.25, 0.1, 0], [0.1, 1, 1.05, 0.5, 0], [0.1, 1.05, 1.1, 0.5, 0], [0.15, 1, 1.05, 0.5, 0]),
    aux: P([0.3, 0.4, 0.3, 0, 0.4], [0.1, 1.1, 1.1, 0.5, 0], [0.1, 1.15, 1.1, 0.5, 0], [0.1, 1.15, 1.1, 0.5, 0], [0.1, 1.1, 1.1, 0.5, 0])
  };

  const isPistol = (b) => (b.def && b.def.kind === 'pistol') || b.id === 'glock18c' ||
    b.anchors.support.distanceTo(b.anchors.grip) < 0.09;

  function frames(build) {
    const A = build.anchors;
    const off = RIG_GRIP.clone().sub(A.grip);
    const offM = new THREE.Matrix4().makeTranslation(off.x, off.y, off.z);
    const offInv = new THREE.Matrix4().makeTranslation(-off.x, -off.y, -off.z);
    const pistol = isPistol(build);
    let leftGrip;
    if (pistol) leftGrip = LEFT_PISTOL.clone();
    else {
      const d = A.support.clone().add(off).sub(RIG_SUPPORT);
      leftGrip = new THREE.Matrix4().makeTranslation(d.x, d.y, d.z).multiply(LEFT_GRIP);
    }
    const rightGrip = RIGHT_GRIP.clone();
    return {
      off, offM, offInv, pistol, rightGrip, leftGrip, hands: HANDS,
      rightRoot: offInv.clone().multiply(rightGrip),
      leftRoot: offInv.clone().multiply(leftGrip)
    };
  }

  /* Отдача и темп из характеристик сборки (M416 — эталон 100). */
  function tuningFor(build, F) {
    const st = build.stats || {};
    const kv = (st.recoilV || 100) / 100, kh = (st.recoilH || 100) / 100;
    const R0 = CONFIG.rifle.recoil;
    const recoil = Object.assign({}, R0, {
      kickBack: R0.kickBack * (0.6 + 0.4 * kv) * (F.pistol ? 0.7 : 1),
      kickUp: R0.kickUp * kv, pitchDeg: R0.pitchDeg * kv * (F.pistol ? 1.6 : 1),
      yawDeg: R0.yawDeg * kh, climbDeg: R0.climbDeg * kv, climbYawDeg: R0.climbYawDeg * kh
    });
    const eye = build.anchors.eye.clone().add(F.off);
    const modes = st.modes || ['semi'];
    return Object.assign({}, CONFIG.rifle, {
      poses: Object.assign({}, CONFIG.rifle.poses, {
        /* наготове: рукоятка ~11 см ниже и ~8 см правее глаза (как у АК) */
        hip: F.pistol ? { pos: [0.05, -0.17, -0.05], rot: [4, 2, -2] } : { pos: [0.075, -0.15, -0.17], rot: [0.57, 0.29, -3] },
        /* прицел: глаз сборки (anchors.eye) — в центр объектива */
        ads: { pos: [-eye.x, -eye.y, -eye.z], rot: [0, 0, 0] },
        sprint: F.pistol ? { pos: [0.08, -0.26, -0.02], rot: [-40, 20, -10] } : { pos: [0.10, -0.19, -0.25], rot: [-21, 35, -30] },
        wallTuck: { pos: [0.06, -0.30, -0.06], rot: [-32, 8, -4] }
      }),
      aimPivot: [0.08, -0.20, 0.12],
      recoil,
      magSize: st.magCap || 30,
      auto: modes.includes('auto'),
      fireInterval: 60 / Math.max(30, st.rpm || 600)
    });
  }

  /* Модель-заместитель: риг двигает её узлы, apply переносит состояние на сборку. */
  function createModel(build, F) {
    const A = build.anchors, o = F.off;
    const at = (v, dx, dy, dz) => new THREE.Vector3(v.x + o.x + (dx || 0), v.y + o.y + (dy || 0), v.z + o.z + (dz || 0));
    const m = {
      root: new THREE.Group(), magSeat: new THREE.Object3D(), magazine: new THREE.Group(),
      muzzle: new THREE.Object3D(), ejectionPort: new THREE.Object3D(), lightMount: new THREE.Object3D(),
      roundInMag: new THREE.Object3D(), slide: 0, trigger: 0,
      setSlide(t) { m.slide = t; }, setTrigger(t) { m.trigger = t; },
      setSlideStop() {}, setSelector() {}, setLight() {}
    };
    m.magSeat.position.copy(at(A.magwell));
    m.magSeat.add(m.magazine);
    m.muzzle.position.copy(at(A.muzzle));
    m.ejectionPort.position.copy(at(A.magwell, 0.02, 0.05, 0.02));
    m.lightMount.position.copy(at(A.support, 0.03, 0.03, -0.05));
    m.root.add(m.magSeat, m.muzzle, m.ejectionPort, m.lightMount, m.roundInMag);
    return m;
  }

  function createSpec(build) {
    const F = frames(build);
    const model = createModel(build, F);
    const tuning = tuningFor(build, F);
    const seat = model.magSeat.position.clone();
    const gunPos = [[0, [0, 0, 0]], [0.28, [-0.03, 0.08, -0.1]], [1, [-0.035, 0.09, -0.1]], [1.24, [-0.035, 0.092, -0.1]], [1.32, [-0.03, 0.102, -0.1]]];
    const gunRot = [[0, [0, 0, 0]], [0.28, [14, 8, -24]], [1, [16, 9, -26]], [1.24, [17, 9, -25]], [1.32, [20, 9, -22]]];
    const toMag = [
      { t: 0, at: 'grip', pose: 'support' },
      { t: 0.1, at: 'grip', pose: 'support' },
      { t: 0.5, at: 'pouch', pose: 'open' },
      { t: 0.64, at: 'pouch', pose: 'mag' },
      { t: 1.02, at: 'mag', mag: [-0.10, -0.03, -0.30], pose: 'mag' },
      { t: 1.14, at: 'mag', mag: [-0.03, -0.012, -0.22], pose: 'mag' },
      { t: 1.26, at: 'mag', mag: [0, 0, 0], pose: 'mag' },
      { t: 1.32, at: 'mag', mag: [-4e-3, 0, 0], pose: 'open' }
    ];
    const events = [[0.18, 'magOut'], [0.24, 'drop'], [0.48, 'pouch'], [0.64, 'grab'], [1.16, 'magIn'], [1.26, 'seat']];
    const charge = gripMatrix([seat.x - 0.030, seat.y + 0.09, seat.z + 0.11], [0.86, -0.45, -0.22], [0.40, 0.88, 0.25]);
    const spec = {
      id: build.id, model, tuning,
      rightGrip: F.rightGrip, leftGrip: F.leftGrip, hands: HANDS,
      magInHand: magInHand(0.1),
      pouch: pouch([-0.09, -0.38, -0.05], [-1, 0.2, 0.3]),
      tactical: {
        duration: 2,
        gunPos: [...gunPos, [1.62, [-0.01, 0.02, -0.02]], [2, [0, 0, 0]]],
        gunRot: [...gunRot, [1.62, [3, 2, -4]], [2, [0, 0, 0]]],
        left: [...toMag, { t: 1.65, at: 'grip', pose: 'support' }],
        events, magRelease: [0.12, 0.34]
      },
      empty: {
        duration: 2.5,
        gunPos: [...gunPos, [1.5, [-0.03, 0.07, -0.06]], [1.9, [-8e-3, 0.015, -0.015]], [2.5, [0, 0, 0]]],
        gunRot: [...gunRot, [1.5, [8, 6, -30]], [1.9, [2, 2, -3]], [2.5, [0, 0, 0]]],
        left: [
          ...toMag,
          { t: 1.52, at: 'gun', gun: charge, pose: 'aux' },
          { t: 1.66, at: 'gun', gun: translate(0, 0, 0.09, charge), pose: 'aux' },
          { t: 1.72, at: 'gun', gun: translate(-0.02, 0.03, 0.09, charge), pose: 'open' },
          { t: 2.05, at: 'grip', pose: 'support' }
        ],
        rack: [1.52, 1.66, 1.70],
        events: [...events, [1.70, 'release']],
        magRelease: [0.12, 0.34]
      },
      shellVel: [[3.5, 0.8, -1], [5, 1.6, -0.2]]
    };
    if (F.pistol) {
      /* пистолет: левая кисть остаётся на рукоятке, без «качания» к подсумку */
      spec.tactical.left = spec.tactical.left.map((k) => (k.at === 'grip' ? k : k));
    }

    const mag = build.magazine;
    const mag0 = mag ? { p: mag.position.clone(), q: mag.quaternion.clone() } : null;
    const magParentInv = new THREE.Matrix4();
    const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _s = new THREE.Vector3(), _mw = new THREE.Vector3();
    /* горловина в системе родителя магазина — вокруг неё магазин вынимают */
    let seatLocal = null;

    function apply(rig, rigRootWorld) {
      const r = build.root;
      _m.multiplyMatrices(rigRootWorld, rig.gunMatrix).multiply(F.offM);
      if (r.parent && r.parent.matrixWorld) {
        _m2.copy(r.parent.matrixWorld).invert();
        _m.premultiply(_m2);
      }
      _m.decompose(r.position, r.quaternion, _s);
      r.scale.set(1, 1, 1);
      if (mag && mag.parent) {
        if (!seatLocal) {
          r.updateMatrixWorld(true);
          magParentInv.copy(mag.parent.matrixWorld).invert().multiply(r.matrixWorld);
          seatLocal = build.anchors.magwell.clone().applyMatrix4(magParentInv);
          /* поворот системы root -> система родителя магазина */
          magParentInv.setPosition(0, 0, 0);
        }
        mag.visible = model.magazine.visible;
        if (mag.visible) {
          /* смещение магазина рига (в системе root) -> в систему родителя */
          _m2.compose(model.magazine.position, model.magazine.quaternion, _s.set(1, 1, 1));
          const rel = _m.copy(magParentInv).multiply(_m2).multiply(_m2.copy(magParentInv).invert());
          _m2.makeTranslation(seatLocal.x, seatLocal.y, seatLocal.z).multiply(rel)
            .multiply(rel.makeTranslation(-seatLocal.x, -seatLocal.y, -seatLocal.z))
            .multiply(rel.compose(mag0.p, mag0.q, _mw.set(1, 1, 1)));
          _m2.decompose(mag.position, mag.quaternion, _s);
        }
      }
      r.updateMatrixWorld(true);
    }
    return { spec, model, apply, frames: F };
  }

  return { frames, createSpec, tuningFor, RIGHT_GRIP, LEFT_GRIP, RIG_GRIP, HANDS };
});
