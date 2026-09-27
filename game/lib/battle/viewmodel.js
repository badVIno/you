/* ============================================================================
   Оружие игрока от первого лица: полная модель из оружейной (с модулями,
   которые выбрал игрок) в руках рига GVM.WeaponRig — те же перчатки, позы,
   отдача и перезарядка, что и в лобби. Рукава — камуфляж генерала.
   Прицеливание — только через прицел: в ADS линия прицела совпадает с камерой.
   ========================================================================== */
import { buildWeapon } from '../weapons/index.js';

const smooth = (x) => x * x * (3 - 2 * x);

export async function createViewmodel(T, A, ctl, profile) {
  const VM = window.GVM, WS = window.GWSpec, GA = window.GAssets;
  const assets = GA && GA.data.vm_hands;
  if (!VM || !WS || !assets) throw new Error('риг рук недоступен');
  const frame = new T.Group(); frame.name = 'signum_vm';
  A.scene.add(frame);
  const camObj = new T.Object3D();
  const baseFov = profile.settings.fov || 72;
  let sleeve = null;
  try {
    const ch = window.GChar.build(T, ctl.B.deploy.general);
    const camo = ch.materials && ch.materials._camo;
    sleeve = VM.createJacketMaterial();
    if (camo) { const t = camo.clone(); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(0.047 / 0.42, 0.05 / 0.42); t.needsUpdate = true; sleeve.map = t; sleeve.color.setRGB(1, 1, 1); }
  } catch (e) { sleeve = null; }

  const entries = [];
  for (const w of ctl.weapons) {
    try {
      const build = await buildWeapon(w.id, w.cfg);
      ctl.applyBuild(w, build);
      const ws = WS.createSpec(build);
      const rig = new VM.WeaponRig({ right: assets.clone(assets.right), left: assets.clone(assets.left) }, [ws.spec]);
      if (rig.flashlight) { rig.flashlight.intensity = 0; if (rig.flashlight.parent) rig.flashlight.parent.remove(rig.flashlight); if (rig.flashlight.target && rig.flashlight.target.parent) rig.flashlight.target.parent.remove(rig.flashlight.target); }
      if (sleeve) for (const a of [rig.armR, rig.armL]) { a.sleeve.mesh.material = sleeve; if (a.sleeveTab) a.sleeveTab.material = sleeve; }
      ws.model.root.visible = false;
      rig.root.visible = false;
      frame.add(rig.root);
      build.root.visible = false;
      build.root.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.frustumCulled = false; } });
      A.scene.add(build.root);
      rig.root.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.frustumCulled = false; } });
      entries.push({ w, build, ws, rig, spec: ws.spec });
    } catch (e) { console.warn('[vm] оружие', w.id, e); }
  }
  let cur = null, stepPh = 0, lastT = 0;
  const vmCam = { camera: camObj, yawRate: 0, pitchRate: 0, breath: 0, bobPos: new T.Vector3(), bobRot: new T.Vector3(), leanRoll: 0 };
  const level = { raycast: () => null };
  const e3 = new T.Euler(0, 0, 0, 'YXZ');
  let prevYaw = 0, prevPitch = 0, visible = false;

  const api = {
    show(w) {
      visible = !!w;
      cur = entries.find((e) => e.w === w) || null;
      for (const e of entries) { e.rig.root.visible = e === cur; e.build.root.visible = e === cur; }
      if (cur) { cur.rig.reloading = false; cur.rig.states[0].mag = cur.w.mag; }
    },
    hide() { visible = false; for (const e of entries) { e.rig.root.visible = false; e.build.root.visible = false; } },
    onFire() {
      if (!cur) return;
      const S0 = cur.rig.states[0];
      S0.mag = Math.max(1, cur.spec.tuning.magSize); S0.chambered = true; S0.locked = false;
      cur.rig.cooldown = 0;
      cur.rig.pullTrigger(true);
    },
    reload(w) {
      if (!cur || cur.w !== w) return;
      const empty = w.mag === 0, tr = empty ? cur.spec.empty : cur.spec.tactical;
      if (!tr) return;
      const r = cur.rig;
      r.reloading = true; r.reloadT = 0; r.track = tr; r.fumbled = false;
      r.reloadSpeed = tr.duration / Math.max(0.3, w.reloadT);
      r.states[0].mag = Math.max(0, cur.spec.tuning.magSize - 1);
    },
    throwAnim() { },
    inspect() { },
    zoomSens() { return 0.62; },
    muzzleWorld(out) {
      if (!cur || !cur.build.anchors) return null;
      cur.build.root.updateMatrixWorld(true);
      return out.copy(cur.build.anchors.muzzle).applyMatrix4(cur.build.root.matrixWorld);
    },
    update(dt, c) {
      const cam = A.camera;
      if (!visible || !cur || !c.unit.alive) return;
      const r = cur.rig, w = cur.w;
      if (r.reloading && w.reloadT <= 0) r.reloading = false;
      const u = c.unit, sp = u.speed;
      stepPh = (stepPh + dt * (sp > 0.3 ? (sp > 4 ? 1.55 : 0.95) : 0)) % 1;
      e3.setFromQuaternion(cam.quaternion, 'YXZ');
      const yaw = e3.y, pitch = e3.x;
      if (dt > 1e-4) {
        const k = 1 - Math.exp(-dt * 25);
        let dy = yaw - prevYaw; if (dy > Math.PI) dy -= Math.PI * 2; if (dy < -Math.PI) dy += Math.PI * 2;
        vmCam.yawRate += (dy / dt - vmCam.yawRate) * k;
        vmCam.pitchRate += ((pitch - prevPitch) / dt - vmCam.pitchRate) * k;
      }
      prevYaw = yaw; prevPitch = pitch;
      lastT += dt;
      vmCam.breath = Math.sin(lastT * 1.15);
      frame.position.copy(cam.position); frame.quaternion.copy(cam.quaternion); frame.updateMatrixWorld(true);
      camObj.position.copy(frame.position); camObj.quaternion.copy(frame.quaternion); camObj.updateMatrixWorld(true);
      const ads = smooth(c.adsK);
      const sprint = c.held.has('sprint') && sp > 4 ? 1 : 0;
      r.fireMode = w.st.modes[w.mode] === 'auto' ? 'auto' : 'semi';
      const player = { aimYaw: yaw, aimPitch: pitch, ads, sprint: sprint * (1 - ads), fatigue: 0.2, grounded: true, moveBlend: 1 + (sp > 4 ? 1 : 0), speed: sp, stepPhase: stepPh, offsetYaw: 0, offsetPitch: 0 };
      r.update(Math.min(dt, 0.05), player, vmCam, level, { lmb: c.trigger && w.mag > 0 && w.reloadT <= 0 });
      frame.updateMatrixWorld(true);
      cur.ws.apply(r, r.root.matrixWorld);
      const fov = baseFov + (58 - baseFov) * ads * (cur.build.sightHeight > 0.06 ? 1.25 : 1);
      const near = ads > 0.55 ? 0.018 : 0.04;
      if (Math.abs(cam.fov - fov) > 0.01 || cam.near !== near) { cam.fov = fov; cam.near = near; cam.updateProjectionMatrix(); }
    }
  };
  return api;
}
