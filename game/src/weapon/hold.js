/* ============================================================================
   Оружие в руках бойца (вид со стороны): лобби, боты и генералы на картах.

   Каждый кадр, ПОСЛЕ позы корпуса и ног (anim/locomotion.js):
     1) оружие ставится по состоянию (от груди / от плеча / по линии глаза);
     2) кисти GLB (viewmodel/hands.js) ведутся к хватам сборки — anchors.grip
        и anchors.support через GWSpec.frames — обратной кинематикой рига
        (soldier/rig.js, solveArmsGLB).
   Без оружия руки опущены вдоль тела («по швам») и чуть покачиваются.

   API (self.GHold):
     const h = GHold.create(THREE, { char, rig }, { parent? })
     h.setWeapon(build | null)        // WeaponBuild из game/lib/weapons или null
     h.setState('unarmed'|'low'|'ready'|'aim')
     h.update(dt, { yaw?, pitch?, t?, ik? = true, fingers? = true, trigger? = 0 })
        yaw/pitch — направление взгляда в мире (рад, как у камеры: yaw 0 — к -Z);
        по умолчанию — курс корпуса. ik:false — пропустить руки (дальние боты):
        оружие всё равно ставится, это дёшево.
     h.snap()                         // следующий update без сглаживания
     h.muzzleWorld(outV3), h.forwardWorld(outV3)
     h.state, h.weapon, h.dispose()
   Порядок кадра: GPose.update() (anim/pose.js) -> h.update(). Погибшему
   (GPose.die) update не вызывают; оружие убирают setWeapon(null) или роняют сами.
   ========================================================================== */
(function (root, factory) {
  const H = factory(root.THREE, root.GUtil, root.GRig, root.GWSpec, root.GHands);
  if (typeof module !== 'undefined' && module.exports) module.exports = H;
  else root.GHold = H;
})(typeof self !== 'undefined' ? self : this, function (THREE, U, RIG, WSPEC, HANDS) {
  'use strict';

  /* «Низко» (low ready / на ремне): место правого запястья в системе покоя
     груди, направление ствола и правого бока оружия (см. прежний SLING). */
  const LOW = {
    right: new THREE.Vector3(0.125, 1.100, -0.250),
    barrel: new THREE.Vector3(-0.60, -0.45, -0.65),
    out: new THREE.Vector3(0.20, 0.10, -1)
  };
  const LOW_PISTOL = {
    right: new THREE.Vector3(0.06, 1.02, -0.30),
    barrel: new THREE.Vector3(-0.15, -0.85, -0.5),
    out: new THREE.Vector3(1, 0, -0.1)
  };
  const READY_DROP = 0.42;        // рад: ствол опущен от линии взгляда
  const ARM = RIG && RIG.ARM;

  const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _s = new THREE.Vector3();
  const _e = new THREE.Euler(0, 0, 0, 'YXZ');
  const _bl = new THREE.Matrix4(), _bw = new THREE.Matrix4();
  const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3();
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _ax = new THREE.Vector3(), _qr = new THREE.Quaternion();

  function create(T3, soldier, opts) {
    const char = soldier.char, rig = soldier.rig;
    const o = opts || {};
    const H = {
      state: 'unarmed', weapon: null, frames: null,
      pos: new THREE.Vector3(), quat: new THREE.Quaternion(),
      _snap: true, _ready: 0, _ads: 0, t: Math.random() * 10,
      handTargets: { R: new THREE.Matrix4(), L: new THREE.Matrix4() }
    };

    H.setWeapon = function (build) {
      if (H.weapon === build) return;
      if (H.weapon && H.weapon.root.parent) H.weapon.root.parent.remove(H.weapon.root);
      H.weapon = build || null;
      H.frames = build && WSPEC ? WSPEC.frames(build) : null;
      if (build) {
        build.root.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
        const parent = o.parent || char.root.parent;
        if (parent) parent.add(build.root);
        build.root.matrixAutoUpdate = true;
        if (H.state === 'unarmed') H.state = 'low';
      } else H.state = 'unarmed';
      H._snap = true;
    };
    H.setState = function (s) {
      if (!H.weapon) s = 'unarmed';
      else if (s === 'unarmed') s = 'low';
      H.state = s;
    };
    H.snap = function () { H._snap = true; };

    /* Глаз бойца по кости головы (кости в покое не повёрнуты). */
    function eyeWorld(out) {
      const M = char.metrics, head = char.bone('head'), rest = char.rest.head;
      head.updateMatrixWorld(true);
      return head.localToWorld(out.set(0, M.eyeY - rest[1], -(M.headRZ + 0.012)));
    }

    /* Правое запястье на рукоятке -> в точку LOW груди (как прежний slingCarry). */
    function lowPose(outPos, outQuat) {
      const F = H.frames, P = F.pistol ? LOW_PISTOL : LOW;
      const chest = char.bone('chest'), rest = char.rest.chest;
      chest.updateMatrixWorld(true);
      const RH = chest.localToWorld(_v.set(P.right.x - rest[0], P.right.y - rest[1], P.right.z - rest[2]));
      const cq = chest.getWorldQuaternion(_q2);
      const rL = _v2.setFromMatrixPosition(F.rightRoot);
      const basis = (M, f, x) => {
        f.normalize(); x.addScaledVector(f, -x.dot(f)).normalize();
        return M.makeBasis(f, x, Z.crossVectors(f, x));
      };
      basis(_bl, X.set(0, 0, -1), Y.set(1, 0, 0));
      basis(_bw, _v3.copy(P.barrel).applyQuaternion(cq), _s.copy(P.out).applyQuaternion(cq));
      outQuat.setFromRotationMatrix(_bw.multiply(_bl.invert()));
      outPos.copy(RH).sub(rL.applyQuaternion(outQuat));
      if (!F.pistol) fitReach(outPos, outQuat, RH);
    }

    /* Длинное цевьё (АКМ, СВД, дробовик) уводит опорную точку дальше длины
       левой руки: доворачиваем оружие вокруг правой кисти к левому плечу,
       пока опора не станет достижимой (бисекция по углу). */
    const armL = (() => {
      const r = char.rest, d = (a, b) => Math.hypot(r[a][0] - r[b][0], r[a][1] - r[b][1], r[a][2] - r[b][2]);
      return d('shoulderL', 'elbowL') + d('elbowL', 'wristL');
    })();
    function fitReach(outPos, outQuat, G) {
      const sh = char.bone('shoulderL').getWorldPosition(_a);
      const reach = armL * 0.95;
      const v = _b.setFromMatrixPosition(H.frames.leftRoot).applyQuaternion(outQuat).add(outPos).sub(G);
      if (_c.copy(G).add(v).distanceTo(sh) <= reach) return;
      const w = _c.copy(sh).sub(G);
      _ax.crossVectors(v, w);
      if (_ax.lengthSq() < 1e-10) return;
      _ax.normalize();
      let lo = 0, hi = v.angleTo(w);
      for (let i = 0; i < 10; i++) {
        const mid = (lo + hi) / 2;
        _qr.setFromAxisAngle(_ax, mid);
        const d = _c.copy(v).applyQuaternion(_qr).add(G).distanceTo(sh);
        if (d > reach) lo = mid; else hi = mid;
      }
      _qr.setFromAxisAngle(_ax, hi);
      outQuat.premultiply(_qr);
      outPos.sub(G).applyQuaternion(_qr).add(G);
    }

    /* Прицел: глаз сборки на линии взгляда. Наготове — то же, ствол опущен
       вокруг затыльника, приклад остаётся в плече. */
    function eyePose(yaw, pitch, drop, outPos, outQuat) {
      const A = H.weapon.anchors;
      const eye = eyeWorld(_v);
      outQuat.setFromEuler(_e.set(pitch, yaw, 0, 'YXZ'));
      outPos.copy(eye).sub(_v2.copy(A.eye).applyQuaternion(outQuat));
      if (drop > 0) {
        const butt = _v3.copy(A.butt).applyQuaternion(outQuat).add(outPos);
        _q.setFromAxisAngle(_s.set(1, 0, 0).applyQuaternion(outQuat), -drop);
        outPos.sub(butt).applyQuaternion(_q).add(butt);
        outPos.y -= 0.03;
        outQuat.premultiply(_q);
      }
    }

    /* Руки по швам: запястье под плечом, ладонь к бедру, большой палец вперёд. */
    function relaxedTargets(t) {
      const r = char.root;
      r.updateMatrixWorld(true);
      const rq = r.getWorldQuaternion(_q2);
      const fwd = _v3.set(0, 0, -1).applyQuaternion(rq);
      const right = _s.set(1, 0, 0).applyQuaternion(rq);
      const rest = char.rest;
      for (const [SS, side] of [['R', 1], ['L', -1]]) {
        const sh = char.bone('shoulder' + SS).getWorldPosition(_v);
        const la = Math.hypot(rest['shoulder' + SS][0] - rest['elbow' + SS][0], rest['shoulder' + SS][1] - rest['elbow' + SS][1], rest['shoulder' + SS][2] - rest['elbow' + SS][2]);
        const lb = Math.hypot(rest['elbow' + SS][0] - rest['wrist' + SS][0], rest['elbow' + SS][1] - rest['wrist' + SS][1], rest['elbow' + SS][2] - rest['wrist' + SS][2]);
        const swing = Math.sin(t * 0.9 + side) * 0.008;
        const w = _v2.copy(sh).addScaledVector(right, side * 0.075).addScaledVector(fwd, 0.035 + swing);
        w.y -= (la + lb) * 0.955;
        Z.set(0, 1, 0).addScaledVector(fwd, -0.12).normalize();         // -Z кисти — к пальцам (вниз)
        Y.copy(right).multiplyScalar(side);                               // тыл кисти — наружу
        Y.addScaledVector(Z, -Y.dot(Z)).normalize();
        X.crossVectors(Y, Z);
        H.handTargets[SS].makeBasis(X, Y, Z).setPosition(w);
      }
    }

    H.update = function (dt, u) {
      u = u || {};
      H.t += dt;
      const armed = !!H.weapon && H.state !== 'unarmed';
      const doIK = u.ik !== false && char.hands && rig;
      if (!armed) {
        if (doIK) {
          relaxedTargets(u.t === undefined ? H.t : u.t);
          rig.armPose = ARM && ARM.relaxed;
          rig.handTargets = H.handTargets;
          rig.handPoses = u.fingers === false ? null : { R: HANDS.POSES.relaxed, L: HANDS.POSES.relaxedL };
          rig.solveArms(null);
        }
        return;
      }
      const yaw = u.yaw === undefined ? char.root.rotation.y : u.yaw;
      const pitch = u.pitch === undefined ? 0 : u.pitch;
      const wantPos = new THREE.Vector3(), wantQ = new THREE.Quaternion();
      if (H.state === 'low') lowPose(wantPos, wantQ);
      else eyePose(yaw, pitch, H.state === 'ready' ? READY_DROP : 0, wantPos, wantQ);
      const readyT = H.state === 'low' ? 0 : 1, adsT = H.state === 'aim' ? 1 : 0;
      if (H._snap || dt <= 0) {
        H.pos.copy(wantPos); H.quat.copy(wantQ); H._ready = readyT; H._ads = adsT; H._snap = false;
      } else {
        const k = 1 - Math.exp(-9 * dt);
        H.pos.lerp(wantPos, k); H.quat.slerp(wantQ, k);
        H._ready += (readyT - H._ready) * (1 - Math.exp(-6 * dt));
        H._ads += (adsT - H._ads) * (1 - Math.exp(-8 * dt));
      }
      const r = H.weapon.root;
      if (r.parent && r.parent !== char.root.parent && r.parent.matrixWorld) {
        _m.compose(H.pos, H.quat, _s.set(1, 1, 1)).premultiply(_m2.copy(r.parent.matrixWorld).invert());
        _m.decompose(r.position, r.quaternion, _s);
      } else { r.position.copy(H.pos); r.quaternion.copy(H.quat); }
      r.updateMatrixWorld(true);
      if (doIK) {
        H.handTargets.R.multiplyMatrices(r.matrixWorld, H.frames.rightRoot);
        H.handTargets.L.multiplyMatrices(r.matrixWorld, H.frames.leftRoot);
        rig.armPose = null;
        rig.readyAmount = H._ready;
        rig.adsAmount = H._ads;
        rig.handTargets = H.handTargets;
        const hp = H.frames.hands;
        rig.handPoses = u.fingers === false ? null : { R: (u.trigger || 0) > 0.5 ? hp.trigger : hp.indexed, L: hp.support };
        rig.solveArms(null);
      }
    };

    H.muzzleWorld = (out) => (H.weapon ? H.weapon.root.localToWorld(out.copy(H.weapon.anchors.muzzle)) : null);
    H.forwardWorld = (out) => (H.weapon ? out.set(0, 0, -1).applyQuaternion(H.weapon.root.getWorldQuaternion(_q)) : null);
    H.dispose = function () { H.setWeapon(null); };
    return H;
  }

  return { create, LOW, READY_DROP };
});
