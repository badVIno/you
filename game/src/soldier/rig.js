/* ============================================================================
   Риг бойца: поза, обратная кинематика рук, хват оружия, походка.

   Логика позы строится «от оружия»: сначала мы решаем, где в пространстве
   находится автомат (это делает контроллер камеры / стрелка), затем руки
   подводятся к рукоятке и цевью обратной кинематикой, а корпус доворачивается
   так, чтобы приклад лёг в плечо. Именно такой порядок даёт бодикам-ощущение:
   оружие ведёт тело, а не наоборот.

   Тяжесть читается через задержки: оружие приходит в новую точку с
   запаздыванием (инерция массы), корпус догоняет взгляд ещё позже, шаги
   отдаются в ствол.
   ========================================================================== */
(function (root, factory) {
  const R = factory(root.GUtil, root.GSkel);
  if (typeof module !== 'undefined' && module.exports) module.exports = R;
  else root.GRig = R;
})(typeof self !== 'undefined' ? self : this, function (U, SK) {
  'use strict';

  /* ==================================================== two-bone IK ====== */
  /* Классическое аналитическое решение для цепочки из двух звеньев.
     Дано: положение корня (плечо), цель (запястье) и «полюс» — точка, куда
     смотрит локоть. Возвращает кватернионы для плеча и локтя.

     Работает в мировых координатах, затем результат переводится в локальные
     — так проще держать полюс привязанным к корпусу. */
  function twoBoneIK(THREE, opt) {
    const root = opt.root, mid = opt.mid, tip = opt.tip;
    const target = opt.target, pole = opt.pole;

    const wRoot = root.getWorldPosition(new THREE.Vector3());
    const wMid = mid.getWorldPosition(new THREE.Vector3());
    const wTip = tip.getWorldPosition(new THREE.Vector3());

    const lenA = wRoot.distanceTo(wMid);
    const lenB = wMid.distanceTo(wTip);
    const toTarget = new THREE.Vector3().subVectors(target, wRoot);
    let dist = toTarget.length();
    const maxLen = (lenA + lenB) * 0.998;
    const minLen = Math.abs(lenA - lenB) * 1.02 + 1e-4;
    dist = U.clamp(dist, minLen, maxLen);
    const dir = toTarget.clone().normalize();

    /* угол в корне между направлением на цель и первым звеном */
    const cosRoot = U.clamp((lenA * lenA + dist * dist - lenB * lenB) / (2 * lenA * dist), -1, 1);
    const angRoot = Math.acos(cosRoot);

    /* плоскость сгиба задаётся полюсом */
    let poleDir = new THREE.Vector3().subVectors(pole, wRoot);
    poleDir.addScaledVector(dir, -poleDir.dot(dir));
    if (poleDir.lengthSq() < 1e-8) poleDir.set(0, 1, 0).addScaledVector(dir, -dir.y);
    poleDir.normalize();

    /* Ось сгиба. Поворот `dir` вокруг неё на +angRoot уводит первое звено
       В СТОРОНУ полюса: cross(poleDir, dir) даёт ось, для которой
       положительный угол по правилу правой руки идёт от dir к poleDir.
       Раньше ось и знак были взяты наоборот, и локоть выворачивался ровно
       в противоположную сторону от полюса — отсюда «куриные крылья»:
       локоть уезжал выше плеча и вперёд, а не вниз к рёбрам. */
    const bendAxis = new THREE.Vector3().crossVectors(poleDir, dir).normalize();

    /* желаемые мировые позиции */
    const midDir = dir.clone().applyAxisAngle(bendAxis, -angRoot);
    const newMid = wRoot.clone().addScaledVector(midDir, lenA);

    /* ориентируем кости: локальная ось звена -> нужное направление */
    alignBone(THREE, root, wRoot, newMid, opt.axis, poleDir);
    /* После поворота корня mid уехал. Пересчитывать надо ОТ КОРНЯ: вызов
       mid.updateMatrixWorld() берёт matrixWorld родителя, а он ещё старый,
       поэтому второе звено считалось бы по устаревшему базису и рука
       промахивалась мимо цели. */
    root.updateMatrixWorld(true);
    const wMid2 = mid.getWorldPosition(new THREE.Vector3());
    const tgt2 = wRoot.clone().addScaledVector(dir, dist);
    alignBone(THREE, mid, wMid2, tgt2, opt.axis, poleDir);
    root.updateMatrixWorld(true);
  }

  const _q = {};
  function tmpQ(THREE, k) { return (_q[k] || (_q[k] = new THREE.Quaternion())); }

  /* Разворот кости так, чтобы её локальная ось `axis` смотрела из `from` в `to`. */
  function alignBone(THREE, bone, from, to, axis, up) {
    const parent = bone.parent;
    const want = new THREE.Vector3().subVectors(to, from);
    if (want.lengthSq() < 1e-10) return;
    want.normalize();

    /* текущее мировое направление локальной оси */
    const pq = parent ? parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
    const cur = axis.clone().applyQuaternion(bone.quaternion).applyQuaternion(pq).normalize();

    const rot = new THREE.Quaternion().setFromUnitVectors(cur, want);
    const worldQ = bone.getWorldQuaternion(new THREE.Quaternion());
    const newWorld = rot.multiply(worldQ);
    bone.quaternion.copy(pq.invert().multiply(newWorld));
  }

  /* ================================================== хват оружия ======== */
  /* Узлы оружия (в системе модели АК, метры):
       gripR  — пистолетная рукоятка,
       gripL  — цевьё,
       trigger— спусковой крючок.
     Кисть ставится так, чтобы ладонь легла на узел, а ось пальцев была
     поперёк рукоятки. Точные смещения подобраны по геометрии АК-74. */
  const GRIP = {
    /* правая кисть на пистолетной рукоятке: ладонь охватывает её сзади,
       ось пальцев смотрит вперёд-вниз вдоль наклона рукоятки (≈ 20°) */
    right: {
      node: 'gripR',
      offset: [0.014, 0.050, 0.010],
      /* базис ладони в системе оружия: x — вдоль пальцев, y — от ладони */
      fingerDir: [-0.10, -0.32, -0.94],
      palmDir: [0.97, -0.05, -0.22],
      curl: [0.95, 1.05, 1.05, 0.90],     // указательный меньше — он на спуске
      thumb: 0.70
    },
    /* Левая кисть ОБХВАТЫВАЕТ ЦЕВЬЁ СНИЗУ.

       Ладонь уходит под цевьё (offset по Y отрицательный), пальцы поднимаются
       вверх-наружу и смыкаются поверх, большой палец ложится вдоль. Именно
       так держат оружие стоя: кисть работает как опора снизу, а не как
       «крюк» сверху.

       Y-смещение увеличено до -0,055: раньше ладонь сидела вровень с осью
       цевья и кисть всплывала НА ЛИНИЮ ПРИЦЕЛИВАНИЯ (целик на y = 0,116),
       закрывая мушку в прицеле. Теперь кисть заведомо ниже прицельной линии
       и в прицел попадает лишь краем снизу — как в жизни. */
    left: {
      node: 'gripL',
      /* -0,068: кисть реалистичной модели (перчатка поверх ладони MakeHuman)
         крупнее процедурной, и при -0,055 пальцы, сомкнутые поверх цевья,
         закрывали мушку в прицеле. */
      offset: [-0.004, -0.068, 0.020],
      fingerDir: [0.20, 0.86, 0.47],
      palmDir: [0.96, -0.24, -0.12],
      curl: [1.02, 1.08, 1.06, 0.98],
      thumb: 0.55
    },
    /* В ПРИЦЕЛЕ цевьё лежит в ладони: кисть под ним, большой палец вдоль
       левого бока, пальцы поднимаются по правому. Верх цевья всего на 4 мм
       ниже прицельной линии (0,112 против 0,116), поэтому ни один палец не
       должен заходить наверх — иначе он закрывает мушку. Ось пальцев
       смотрит вправо-вперёд, тыльная сторона кисти — вниз-влево.
       Значения X даны для правой руки и зеркалятся по стороне. */
    leftAds: {
      node: 'gripL',
      offset: [0.036, -0.031, 0.028],
      fingerDir: [-0.70, 0.05, -0.70],
      palmDir: [0.10, -0.99, 0.0],
      curl: [0.85, 0.90, 0.90, 0.85],
      thumb: 0.10,
      /* большой палец вдоль левого бока, а не вверх: при обычном
         противопоставлении он вставал над цевьём выше мушки */
      thumbBase: [0.35, 0.02]
    },
    /* НА РЕМНЕ кисть подходит к цевью сверху-снаружи: тыльная сторона
       смотрит от бойца, пальцы спускаются по правому боку оружия и
       подхватывают цевьё снизу, большой палец лежит вдоль него. */
    leftSling: {
      node: 'gripL',
      offset: [-0.030, 0.060, 0.020],
      fingerDir: [-0.10, -0.90, -0.42],
      palmDir: [-0.95, 0.10, 0.10],
      curl: [1.15, 1.20, 1.20, 1.15],
      thumb: 0.45
    }
  };

  /* Смесь двух хватов: смещение и оси — линейно, сгибы пальцев — линейно. */
  function mixGrip(a, b, k) {
    if (k <= 0) return a;
    if (k >= 1) return b;
    const l = (x, y) => x.map((v, i) => v + (y[i] - v) * k);
    return {
      node: a.node, offset: l(a.offset, b.offset), fingerDir: l(a.fingerDir, b.fingerDir),
      palmDir: l(a.palmDir, b.palmDir), curl: l(a.curl, b.curl), thumb: a.thumb + (b.thumb - a.thumb) * k,
      thumbBase: l(a.thumbBase || [0.55, 0.30], b.thumbBase || [0.55, 0.30])
    };
  }

  /* ================================================== позы рук ========== */
  /* Куда смотрит локоть — направление от плечевого сустава в системе груди:
     x — наружу (для своей стороны), y — вверх, z — назад. clav — доля
     отклонения ключицы к цели кисти: [протракция, подъём]. reach — до какой
     доли длины вытягивается опорная рука; дальше кисть скользит по цевью.

     На ремне оба локтя разведены наружу и чуть назад: жилет шире плечевого
     сустава модели (0,20–0,23 м против 0,224), и рука, опущенная отвесно,
     уходит в него. Плечо отведено от корпуса на 20–25°, как на референсе. */
  const ARM = {
    sling: { R: [0.62, -0.72, 0.30], L: [0.75, -0.62, 0.25], clav: [0.20, 0.14], reach: 0.95 },
    ready: { R: [0.22, -0.93, 0.30], L: [-0.11, -0.99, -0.06], clav: [0.30, 0.10], reach: 0.86 },
    ads: { R: [0.30, -0.90, 0.30], L: [-0.06, -0.99, -0.10], clav: [0.30, 0.10], reach: 0.86 }
  };
  function mixArm(a, b, k) {
    const l = (x, y) => x.map((v, i) => v + (y[i] - v) * k);
    return { R: l(a.R, b.R), L: l(a.L, b.L), clav: l(a.clav, b.clav), reach: a.reach + (b.reach - a.reach) * k };
  }

  /* Кость в мировом базисе: ex — вдоль кости, ey — ось шарнира. */
  function setWorldBasis(THREE, bone, ex, ey) {
    const ez = new THREE.Vector3().crossVectors(ex, ey);
    const wq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, ey, ez));
    bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(wq));
    bone.updateMatrixWorld(true);
  }
  /* Угол скрутки кватерниона вокруг локальной оси X (swing-twist). */
  function twistX(q) {
    let a = 2 * Math.atan2(q.x, q.w);
    if (a > Math.PI) a -= 2 * Math.PI;
    if (a < -Math.PI) a += 2 * Math.PI;
    return a;
  }

  /* Сгиб пальцев вокруг локальной оси Z кости: базовая «хватка».
     Значения — типичный обхват цилиндра диаметром ~35 мм. */
  function curlFingers(rig, side, amount, trigger) {
    const SS = side > 0 ? 'R' : 'L';
    /* amount — число или сгиб по пальцам [указательный, средний, безымянный, мизинец] */
    const A = amount;
    const PH = [0.95, 1.15, 0.85];        // относительный сгиб фаланг
    for (let fi = 0; fi < SK.FINGERS.length; fi++) {
      const f = SK.FINGERS[fi];
      const Af = Array.isArray(A) ? A[fi] : A;
      /* указательный правой руки управляется отдельно — он на спуске */
      const k = (side > 0 && f.key === 'index' && trigger !== undefined) ? trigger : Af;
      for (let ph = 0; ph < 3; ph++) {
        const b = rig.bone(f.key + SS + (ph + 1));
        b.rotation.set(0, 0, 0);
        /* пальцы гнутся «в ладонь»: вокруг Z, знак зависит от стороны */
        b.rotation.z = -side * k * PH[ph] * 1.02;
        /* лёгкое схождение пальцев при сжатии кулака */
        if (ph === 0) b.rotation.y = -side * f.spread * 3.0 * k;
      }
    }
    /* большой палец: противопоставлен, гнётся меньше и заваливается вбок */
    const th = rig.thumbAmount === undefined ? (Array.isArray(A) ? A[0] : A) : rig.thumbAmount;
    /* основание: [отведение от указательного, противопоставление к ладони] */
    const tb = rig.thumbBase || [0.55, 0.30];
    for (let ph = 0; ph < 3; ph++) {
      const b = rig.bone('thumb' + SS + (ph + 1));
      b.rotation.set(0, 0, 0);
      if (ph === 0) { b.rotation.y = side * tb[0]; b.rotation.z = -side * (tb[1] + th * 0.35); }
      else b.rotation.z = -side * th * 0.85;
    }
  }

  /* ===================================================== поза покоя ====== */
  /* Базовая стойка: ноги на ширине плеч, лёгкий присед, вес на передней
     ноге, плечи развёрнуты вполоборота к цели. Всё остальное — дельты. */
  function applyBasePose(rig, p) {
    const b = rig.bone.bind(rig);
    const s = p || {};
    const stance = s.stance === undefined ? 1 : s.stance;

    b('hips').position.set(0, rig.metrics.hipY + (s.crouch || 0), 0);
    b('hips').rotation.set(s.hipPitch || 0, s.hipYaw || 0, 0);
    b('spine').rotation.set((s.spinePitch || 0.06) * stance, (s.spineYaw || 0) * 0.4, 0);
    b('chest').rotation.set((s.chestPitch || 0.05) * stance, (s.spineYaw || 0) * 0.6, 0);
    b('neck').rotation.set((s.neckPitch || -0.04), (s.headYaw || 0) * 0.35, 0);
    b('head').rotation.set((s.headPitch || 0), (s.headYaw || 0) * 0.65, 0);

    for (const side of [1, -1]) {
      const SS = side > 0 ? 'R' : 'L';
      /* Ноги: небольшой сгиб в колене и разворот стопы наружу.
         Колено гнётся НАЗАД — отрицательный угол (см. поясняющий блок в
         шаговом цикле). */
      const fwd = side > 0 ? (s.legStagger || 0) : -(s.legStagger || 0);
      const bend = (s.legBend === undefined ? 0.14 : s.legBend);
      b('hip' + SS).rotation.set(-bend * 0.55 + fwd, side * 0.06, side * 0.045);
      b('knee' + SS).rotation.set(-bend * 1.2, 0, 0);
      b('ankle' + SS).rotation.set(bend * 0.65 - fwd, side * 0.05, 0);
      b('toe' + SS).rotation.set(0, 0, 0);
      /* ключицы: приподняты под вес брони */
      b('clav' + SS).rotation.set(0, 0, -side * 0.06);
    }
  }

  /* =================================================== класс рига ======== */
  function Rig(THREE, char) {
    this.THREE = THREE;
    this.char = char;
    this.metrics = char.metrics;
    this.bone = char.bone;
    this.thumbAmount = 0.6;

    /* сглаженные величины — дают вес и инерцию */
    this.sm = {
      aim: 0, sprint: 0, move: 0, crouch: 0,
      leanX: 0, leanZ: 0,
      breathe: Math.random() * 10,
      bobPhase: 0, stepPhase: 0,
      swayX: 0, swayY: 0, swayVX: 0, swayVY: 0,
      recoil: 0, recoilV: 0, recoilRot: 0,
      weaponLag: new THREE.Vector3(), weaponLagRot: new THREE.Euler(),
      lastYaw: 0, lastPitch: 0
    };
  }

  /* Кисти GLB (viewmodel/ak.js): запястье ставится в кисть рига, локоть
     выбирается так, чтобы предплечье шло вдоль кисти — тогда кисть не
     выламывается в запястье. handTargets — мировые матрицы кистей рига,
     handPoses — позы пальцев рига. */
  Rig.prototype.solveArmsGLB = function () {
    const THREE = this.THREE, AKA = typeof self !== 'undefined' ? self.GAK : null;
    const rest = this.char.rest;
    const chestQ = this.bone('chest').getWorldQuaternion(new THREE.Quaternion());
    const chestQi = chestQ.clone().invert();
    const kr = this.readyAmount === undefined ? 1 : U.clamp01(this.readyAmount);
    const ka = U.clamp01(this.adsAmount || 0);
    const pose = mixArm(mixArm(ARM.sling, ARM.ready, kr), ARM.ads, ka);
    this.gripTarget = this.gripTarget || {};
    this.armDebug = this.armDebug || {};
    const P = new THREE.Vector3(), Q = new THREE.Quaternion(), Sc = new THREE.Vector3();
    for (const side of [1, -1]) {
      const SS = side > 0 ? 'R' : 'L';
      this.handTargets[SS].decompose(P, Q, Sc);
      const clav = this.bone('clav' + SS), shoulder = this.bone('shoulder' + SS);
      const elbow = this.bone('elbow' + SS), wrist = this.bone('wrist' + SS);
      const dist3 = (a, b) => Math.hypot(rest[a][0] - rest[b][0], rest[a][1] - rest[b][1], rest[a][2] - rest[b][2]);
      const lenA = dist3('shoulder' + SS, 'elbow' + SS), lenB = dist3('elbow' + SS, 'wrist' + SS);
      {
        const cp = clav.getWorldPosition(new THREE.Vector3());
        const d = P.clone().sub(cp).applyQuaternion(chestQi).normalize();
        clav.rotation.y += side * U.clamp(Math.max(0, -d.z) * pose.clav[0], 0, 0.26);
        clav.rotation.z += side * U.clamp(d.y * pose.clav[1] + 0.02, -0.08, 0.12);
        clav.updateMatrixWorld(true);
      }
      const S = shoulder.getWorldPosition(new THREE.Vector3());
      const toT = P.clone().sub(S);
      const d = U.clamp(toT.length(), Math.abs(lenA - lenB) + 1e-3, (lenA + lenB) * 0.999);
      const dir = toT.normalize();
      const cosA = U.clamp((lenA * lenA + d * d - lenB * lenB) / (2 * lenA * d), -1, 1);
      const sinA = Math.sqrt(1 - cosA * cosA);
      /* локоть на окружности решений — ближе всего к продолжению кисти */
      const prox = new THREE.Vector3(0, 0, 1).applyQuaternion(Q);
      const Ed = P.clone().addScaledVector(prox, lenB);
      const Cc = S.clone().addScaledVector(dir, cosA * lenA);
      const perp = Ed.sub(Cc); perp.addScaledVector(dir, -perp.dot(dir));
      const L = pose[SS];
      const hint = new THREE.Vector3(L[0] * side, L[1], L[2]).applyQuaternion(chestQ);
      hint.addScaledVector(dir, -hint.dot(dir));
      if (hint.lengthSq() > 1e-8) hint.normalize();
      /* Основа — подсказка позы (локоть вниз-наружу); продолжение кисти
         подмешивается, только пока не поднимает локоть: иначе «на ремне»
         локоть задирался выше плеча. */
      const upC = new THREE.Vector3(0, 1, 0).applyQuaternion(chestQ);
      let k = 0;
      if (perp.lengthSq() > 1e-8) {
        perp.normalize();
        k = 0.6 * U.clamp01(1 - Math.max(0, perp.dot(upC) - hint.dot(upC)) / 0.5);
      }
      const pdir = hint.clone().multiplyScalar(1 - k).addScaledVector(perp, k);
      pdir.addScaledVector(dir, -pdir.dot(dir));
      if (pdir.lengthSq() < 1e-8) pdir.set(0, -1, 0);
      pdir.normalize();
      const E = S.clone().addScaledVector(dir, cosA * lenA).addScaledVector(pdir, sinA * lenA);
      const Wp = S.clone().addScaledVector(dir, d);
      const up = E.clone().sub(S).normalize();
      const fo = Wp.clone().sub(E).normalize();
      const hinge = new THREE.Vector3().crossVectors(pdir, dir).normalize().multiplyScalar(side);
      setWorldBasis(THREE, shoulder, up.clone().multiplyScalar(side), hinge);
      setWorldBasis(THREE, elbow, fo.clone().multiplyScalar(side), hinge);
      const want = AKA.wristQuat(Q, SS, new THREE.Quaternion());
      wrist.quaternion.copy(elbow.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(want));
      wrist.updateMatrixWorld(true);
      const ft = this.bone('foreTwist' + SS), at = this.bone('armTwist' + SS);
      const X = new THREE.Vector3(1, 0, 0);
      if (ft) { ft.quaternion.setFromAxisAngle(X, U.clamp(twistX(wrist.quaternion), -1.75, 1.75)); ft.updateMatrixWorld(true); }
      if (at) { at.quaternion.setFromAxisAngle(X, -twistX(shoulder.quaternion)); at.updateMatrixWorld(true); }
      this.armDebug[SS] = { elbow: E, wrist: Wp, hint: pdir };
      this.gripTarget[SS] = P.clone();
      if (this.handPoses && this.handPoses[SS]) this.char.hands[SS].setPose(this.handPoses[SS]);
    }
  };

  Rig.prototype.solveArms = function (weapon) {
    if (this.char.hands && this.handTargets) return this.solveArmsGLB();
    const THREE = this.THREE;
    const W = weapon;                       // Object3D оружия (система АК)
    W.updateMatrixWorld(true);
    const kr = this.readyAmount === undefined ? 1 : U.clamp01(this.readyAmount);
    const ka = U.clamp01(this.adsAmount || 0);
    const pose = mixArm(mixArm(ARM.sling, ARM.ready, kr), ARM.ads, ka);
    const wq = W.getWorldQuaternion(new THREE.Quaternion());
    const chestQ = this.bone('chest').getWorldQuaternion(new THREE.Quaternion());
    const chestQi = chestQ.clone().invert();
    const rest = this.char.rest;
    this.gripTarget = this.gripTarget || {};
    this.armDebug = this.armDebug || {};

    for (const side of [1, -1]) {
      const SS = side > 0 ? 'R' : 'L';
      const G = side > 0 ? GRIP.right : mixGrip(mixGrip(GRIP.leftSling, GRIP.left, kr), GRIP.leftAds, ka);
      const node = W.getObjectByName(G.node) || W;
      const target = node.getWorldPosition(new THREE.Vector3())
        .add(new THREE.Vector3(G.offset[0] * side, G.offset[1], G.offset[2]).applyQuaternion(wq));

      const clav = this.bone('clav' + SS), shoulder = this.bone('shoulder' + SS);
      const elbow = this.bone('elbow' + SS), wrist = this.bone('wrist' + SS);
      const dist3 = (a, b) => Math.hypot(rest[a][0] - rest[b][0], rest[a][1] - rest[b][1], rest[a][2] - rest[b][2]);
      const lenA = dist3('shoulder' + SS, 'elbow' + SS), lenB = dist3('elbow' + SS, 'wrist' + SS);

      /* Плечевой пояс работает вместе с рукой: кисть впереди — ключица
         выводит плечо вперёд, кисть высоко — поднимает его. Без этого рука
         вращается в «шарнире куклы», а дельта остаётся прилипшей к корпусу. */
      {
        const cp = clav.getWorldPosition(new THREE.Vector3());
        const d = target.clone().sub(cp).applyQuaternion(chestQi).normalize();
        const prot = U.clamp(Math.max(0, -d.z) * pose.clav[0], 0, 0.26);
        const elev = U.clamp(d.y * pose.clav[1] + 0.02, -0.08, 0.12);
        clav.rotation.y += side * prot;
        clav.rotation.z += side * elev;
        clav.updateMatrixWorld(true);
      }
      const S = shoulder.getWorldPosition(new THREE.Vector3());

      /* Опорная кисть — не гвоздь на цевье: если до точки не дотянуться
         с согнутым локтем, кисть скользит назад, к магазину. В прицеле ход
         короткий (0,085 м — дальше кисть закрыла бы мушку), на ремне и от
         бедра длиннее. */
      if (side < 0) {
        const comfort = (lenA + lenB) * pose.reach;
        const back = new THREE.Vector3(0, 0, 1).applyQuaternion(wq);
        const MAX_SLIDE = U.lerp(0.20, 0.085, ka);
        let slide = 0;
        while (slide < MAX_SLIDE && S.distanceTo(target) > comfort) {
          target.addScaledVector(back, 0.01);
          slide += 0.01;
        }
      }
      /* фактическая точка хвата — её и проверяет gripCheck */
      this.gripTarget[SS] = target.clone();

      /* --- двухзвенная IK с явной осью локтевого шарнира ---
         Кости ставятся базисом, а не «кратчайшим поворотом» от прошлого
         кадра: иначе скрутка плеча и предплечья копилась от кадра к кадру,
         локоть гнулся не в своей плоскости и рукав перекручивался.
         Локальный X кости — вдоль неё (у левой руки — к плечу), Y — ось
         сгиба локтя (в T-позе вертикаль). */
      const toT = target.clone().sub(S);
      const d = U.clamp(toT.length(), Math.abs(lenA - lenB) + 1e-3, (lenA + lenB) * 0.999);
      const dir = toT.normalize();
      const L = pose[SS];
      const hint = new THREE.Vector3(L[0] * side, L[1], L[2]).applyQuaternion(chestQ);
      const pdir = hint.addScaledVector(dir, -hint.dot(dir));
      if (pdir.lengthSq() < 1e-8) pdir.set(0, -1, 0).applyQuaternion(chestQ).addScaledVector(dir, -dir.y);
      pdir.normalize();
      const cosA = U.clamp((lenA * lenA + d * d - lenB * lenB) / (2 * lenA * d), -1, 1);
      const sinA = Math.sqrt(1 - cosA * cosA);
      const E = S.clone().addScaledVector(dir, cosA * lenA).addScaledVector(pdir, sinA * lenA);
      const Wp = S.clone().addScaledVector(dir, d);
      const up = E.clone().sub(S).normalize();
      const fo = Wp.clone().sub(E).normalize();
      const hinge = new THREE.Vector3().crossVectors(pdir, dir).normalize().multiplyScalar(side);
      setWorldBasis(THREE, shoulder, up.clone().multiplyScalar(side), hinge);
      setWorldBasis(THREE, elbow, fo.clone().multiplyScalar(side), hinge);

      /* ориентация кисти: пальцы вдоль fingerDir оружия, Y — от ладони */
      const ex = new THREE.Vector3(G.fingerDir[0] * side, G.fingerDir[1], G.fingerDir[2]).normalize().applyQuaternion(wq);
      const ey = new THREE.Vector3(G.palmDir[0] * side, G.palmDir[1], G.palmDir[2]).normalize().applyQuaternion(wq);
      ey.addScaledVector(ex, -ey.dot(ex));
      if (ey.lengthSq() < 1e-8) ey.set(0, 1, 0);
      ey.normalize();
      const ez = new THREE.Vector3().crossVectors(ex, ey);
      const want = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(ex.multiplyScalar(side), ey, ez.multiplyScalar(side)));
      wrist.quaternion.copy(elbow.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(want));
      wrist.updateMatrixWorld(true);

      /* Скрутка распределяется, как у лучевой и локтевой костей: пронация
         кисти переходит в предплечье по всей его длине (кость foreTwist,
         веса растут от локтя к запястью), а у дельты плечо остаётся без
         скрутки (armTwist её гасит) — рукав не перекручивается «фантиком». */
      const ft = this.bone('foreTwist' + SS), at = this.bone('armTwist' + SS);
      const X = new THREE.Vector3(1, 0, 0);
      if (ft) {
        const tw = U.clamp(twistX(wrist.quaternion), -1.75, 1.75);
        ft.quaternion.setFromAxisAngle(X, tw);
        ft.updateMatrixWorld(true);
      }
      if (at) {
        at.quaternion.setFromAxisAngle(X, -twistX(shoulder.quaternion));
        at.updateMatrixWorld(true);
      }
      this.armDebug[SS] = { elbow: E, wrist: Wp, hint: pdir };

      /* пальцы обхватывают (запасной путь без кистей GLB) */
      const trig = side > 0 ? this.triggerCurl : undefined;
      this.thumbAmount = G.thumb;
      this.thumbBase = G.thumbBase || [0.55, 0.30];
      curlFingers(this, side, G.curl, trig);
    }
  };

  /* ================================================== опора стоп ======== */
  /* Шаговый цикл задаёт ноги прямой кинематикой от таза, высота которого
     живёт своей жизнью (присед, покачивание). Длина ноги при этом меняется
     со сгибом колена, и подошва сама по себе на землю не попадает: на шаге
     даже опорная стопа висела над землёй до 7 см (на бегу до 13), а в
     приседе нога уходила в грунт на 15 см.

     Поэтому после позы стопы досаживаются на землю аналитической IK
     «бедро — колено — голеностоп»: опорная нога дотягивается вниз до грунта,
     любая нога, ушедшая под землю, поднимается. Если выпрямленной опорной
     ноге не хватает длины, таз проседает на недостающее (не больше 10 см).
     Камера и оружие считаются от контроллера, а не от таза, поэтому их это
     не сдвигает. Ориентация стопы остаётся такой, какой её задал шаговый
     цикл.

     plant: { R, L } — насколько нога опорная (0 — перенос, 1 — стоит). */
  const _pv = {};
  function pv(THREE, k) { return (_pv[k] || (_pv[k] = new THREE.Vector3())); }

  Rig.prototype.plantFeet = function (groundAt, plant) {
    const THREE = this.THREE;
    const root = this.char.root;
    root.updateMatrixWorld(true);
    const fwd = pv(THREE, 'fwd').set(0, 0, -1).applyQuaternion(root.getWorldQuaternion(tmpQ(THREE, 'root')));
    const wOf = (SS) => U.clamp01(plant && plant[SS] !== undefined ? plant[SS] : 1);
    let out = this._plantPass(groundAt, wOf, fwd);
    /* Опорная нога выпрямлена, а до земли не достала: таз стоит выше, чем
       позволяет длина ноги (пик покачивания на шаге). Как и у человека,
       таз проседает на недостающее расстояние, и ноги решаются заново. */
    const drop = Math.min(0.10, Math.max(0, out.R * wOf('R'), out.L * wOf('L')));
    if (drop > 1e-3) {
      const hips = this.bone('hips');
      hips.position.y -= drop;
      hips.updateMatrixWorld(true);
      out = this._plantPass(groundAt, wOf, fwd);
    }
    /* остаточный зазор и просадка таза — для автотестов */
    this.footGap = out;
    this.hipDrop = drop;
    return out;
  };

  Rig.prototype._plantPass = function (groundAt, wOf, fwd) {
    const THREE = this.THREE, M = this.metrics, rest = this.char.rest;
    const out = {};
    for (const SS of ['R', 'L']) {
      const hip = this.bone('hip' + SS), knee = this.bone('knee' + SS);
      const ankle = this.bone('ankle' + SS), toe = this.bone('toe' + SS);
      /* Точки подошвы в системах костей. Кости в покое не повёрнуты, поэтому
         локальные смещения равны мировым: пятка под голеностопом, подушечка
         и носок под костью пальцев. Пропорции сняты с подошвы ботинка. */
      const aY = rest['ankle' + SS][1], tY = rest['toe' + SS][1];
      const pts = [
        [ankle, 0, -aY, M.foot * 0.31],
        [toe, 0, -tY, 0],
        [toe, 0, -tY, -M.foot * 0.32]
      ];
      const lowest = () => {
        let h = Infinity;
        for (const q of pts) {
          const w = q[0].localToWorld(pv(THREE, 'p').set(q[1], q[2], q[3]));
          h = Math.min(h, w.y - groundAt(w.x, w.z));
        }
        return h;
      };
      const h = lowest();
      const w = wOf(SS);
      /* под землю — всегда наверх; над землёй — вниз с весом опоры */
      const dy = h < 0 ? -h : -h * w;
      if (Math.abs(dy) < 5e-4) { out[SS] = h; continue; }

      const footQ = ankle.getWorldQuaternion(new THREE.Quaternion());
      const target = ankle.getWorldPosition(new THREE.Vector3());
      target.y += dy;
      /* колено смотрит вперёд по корпусу */
      const pole = knee.getWorldPosition(new THREE.Vector3()).addScaledVector(fwd, 0.6);
      twoBoneIK(THREE, {
        root: hip, mid: knee, tip: ankle, target, pole,
        axis: pv(THREE, 'down').set(0, -1, 0)
      });
      const kq = knee.getWorldQuaternion(new THREE.Quaternion());
      ankle.quaternion.copy(kq.invert().multiply(footQ));
      ankle.updateMatrixWorld(true);
      out[SS] = lowest();
    }
    return out;
  };

  return { Rig, twoBoneIK, alignBone, curlFingers, applyBasePose, GRIP, ARM };
});