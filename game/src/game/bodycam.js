/* ============================================================================
   Нагрудная камера (бодикам) и руки от первого лица — по bodycam_angar.html.

   Камера висит на груди, а не в глазах: она догоняет взгляд пружиной
   (корпус поворачивается следом за оружием), по наклону берёт лишь долю
   взгляда, качается в такт шагам и вздрагивает на каждом шаге и выстреле.
   Оружие водится внутри конуса перед грудью — ствол опережает камеру.

   Руки — риг из того же файла (viewmodel/vm.js): перчатки GLB, рукава,
   позы наготове / в прицеле / на бегу, отдача и перезарядка. Рукав берёт
   камуфляж формы бойца. Риг ведёт настоящий АК бойца, поэтому стрельба,
   модули и эффекты остаются игровыми.

   Вид от третьего лица (T) использует тот же риг: камера рига ставится так,
   что её плечи совпадают с плечами бойца, а руки тела тянутся к кистям рига.
   ========================================================================== */
(function (root, factory) {
  const B = factory(root.THREE, root.GUtil, root.GVM, root.GAK);
  if (typeof module !== 'undefined' && module.exports) module.exports = B;
  else root.GBodycam = B;
})(typeof self !== 'undefined' ? self : this, function (THREE, U, VM, AKA) {
  'use strict';

  /* параметры камеры и линзы (как в исходнике) */
  const P = {
    fov: 92, adsFov: 64, distortion: 0.42, zoom: 0.74, chroma: 0.05, vignette: 1.0,
    sharpen: 0.55, grain: 0.05, rollingShutter: 0.45, motionBlur: 0.8,
    bodyFollow: 2.4, pitchFollow: 0.62, bob: 1.0, shake: 1.0, maxOff: 0.55,
    chestHeight: 1.40, crouchChest: 0.95, chestForward: 0.05
  };

  /* ---------------------------------------------------- линза бодикама -- */
  /* Проход после цветокоррекции: скос строк (rolling shutter), «рыбий
     глаз», хроматизм по краю, смаз при повороте, перешарп, виньетка, шум.
     uAmt — доля эффекта (0 в свободной камере и от третьего лица). */
  const HASH = 'float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }';
  const LENS_SHADER = {
    uniforms: {
      tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uShift: { value: new THREE.Vector2() },
      uAspect: { value: 1 }, uDist: { value: P.distortion }, uZoom: { value: P.zoom }, uCA: { value: P.chroma },
      uRS: { value: P.rollingShutter }, uMB: { value: P.motionBlur }, uVig: { value: P.vignette },
      uSharp: { value: P.sharpen }, uGrain: { value: P.grain }, uTime: { value: 0 }, uAmt: { value: 0 }
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uRes, uShift;
      uniform float uAspect, uDist, uZoom, uCA, uRS, uMB, uVig, uSharp, uGrain, uTime, uAmt;
      varying vec2 vUv;
      ${HASH}
      vec2 lens(vec2 uv){
        vec2 c=(uv-.5)*2.; c.x*=uAspect;
        float r2=dot(c,c)/(1.+uAspect*uAspect);
        c*=uZoom*(1.+uDist*r2+.5*uDist*uDist*r2*r2);
        c.x/=uAspect; return c*.5+.5;
      }
      float inside(vec2 uv){ vec2 s=step(vec2(0.),uv)*step(uv,vec2(1.)); return s.x*s.y; }
      vec3 fetchCA(vec2 d){
        vec2 c=d-.5; vec2 ca=c*vec2(uAspect,1.); float r2=dot(ca,ca);
        vec2 uR=.5+c*(1.+uCA*r2), uB=.5+c*(1.-uCA*r2);
        return vec3(texture2D(tDiffuse,uR).r*inside(uR), texture2D(tDiffuse,d).g*inside(d), texture2D(tDiffuse,uB).b*inside(uB));
      }
      void main(){
        vec3 base = texture2D(tDiffuse, vUv).rgb;
        if (uAmt < 0.001) { gl_FragColor = vec4(base, 1.); return; }
        vec2 uv = vUv;
        uv.x += uShift.x*uRS*(uv.y-.5)*2.;
        uv.y += uShift.y*uRS*.35*(uv.y-.5);
        vec2 d = mix(vUv, lens(uv), uAmt);
        vec3 col = vec3(0.); vec2 bv = uShift*uMB;
        for (int i=0;i<6;i++){ float t=float(i)/5.-.5; col+=fetchCA(d-bv*t); }
        col /= 6.;
        vec2 px = 1./uRes;
        vec3 b = (texture2D(tDiffuse,d+vec2(px.x*1.5,0.)).rgb+texture2D(tDiffuse,d-vec2(px.x*1.5,0.)).rgb
          +texture2D(tDiffuse,d+vec2(0.,px.y*1.5)).rgb+texture2D(tDiffuse,d-vec2(0.,px.y*1.5)).rgb)*.25;
        col += (col-b)*uSharp;
        vec2 v=(vUv-.5)*vec2(uAspect,1.); float r=length(v)/length(vec2(uAspect,1.)*.5);
        col *= clamp(1.-pow(smoothstep(.4,1.,r),1.35)*uVig,0.,1.);
        float l = dot(col, vec3(.299,.587,.114));
        float n = hash12(vUv*uRes+fract(uTime*7.13)*1000.)-.5;
        float nc = hash12(vUv*uRes*.5+fract(uTime*3.1)*500.)-.5;
        col += n*uGrain*(1.3-l)+vec3(nc,-nc,nc)*uGrain*.25;
        gl_FragColor = vec4(mix(base, clamp(col,0.,1.), uAmt), 1.);
      }`
  };

  class Spring {
    constructor(f, z) { this.x = 0; this.v = 0; this.f = f; this.z = z; }
    step(t, dt) { const w = 2 * Math.PI * this.f; this.v += (w * w * (t - this.x) - 2 * this.z * w * this.v) * dt; this.x += this.v * dt; return this.x; }
  }
  const wrapAng = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  /* Материал рукава: камуфляж формы по развёртке рукава (u — 7 единиц по
     окружности ~0,33 м, v — единица на 0,05 м), фактура ткани рига. */
  const sleeveCache = new Map();
  function sleeveMaterial(char) {
    const key = char.key;
    if (sleeveCache.has(key)) return sleeveCache.get(key);
    const base = VM.createJacketMaterial();
    const camo = char.materials && char.materials._camo;
    const tile = (char.preset && char.preset.camoTile) || 0.42;
    if (camo) {
      const t = camo.clone();
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(0.047 / tile, 0.05 / tile);
      t.needsUpdate = true;
      base.map = t;
      base.color.setRGB(1, 1, 1);
      base.sheenColor.setRGB(0.35, 0.35, 0.33);
    }
    sleeveCache.set(key, base);
    return base;
  }

  function create(env) {
    const { scene, camera } = env;
    const assets = root().GAssets && root().GAssets.data.vm_hands;
    if (!VM || !AKA || !assets) return null;

    const model = AKA.createModel();
    const spec = AKA.createSpec(model);
    const rig = new VM.WeaponRig({ right: assets.clone(assets.right), left: assets.clone(assets.left) }, [spec]);
    /* фонарь рига не нужен: у игры свои модули-фонари */
    rig.flashlight.castShadow = false;
    if (rig.flashlight.parent) rig.flashlight.parent.remove(rig.flashlight);
    if (rig.flashlight.target.parent) rig.flashlight.target.parent.remove(rig.flashlight.target);
    model.root.visible = false;                      // вместо модели — настоящий АК бойца
    rig.root.position.set(0, 0.01, -0.05);           // линза шире, чем у рига (как в исходнике)
    const frame = new THREE.Group();                 // «камера рига»
    frame.name = 'bodycamRig';
    frame.add(rig.root);
    scene.add(frame);

    const st = {
      active: null, yawS: new Spring(P.bodyFollow, 0.95), pitchS: new Spring(2.8, 0.95),
      shY: new Spring(7, 0.3), shP: new Spring(8, 0.32), shR: new Spring(6, 0.3), shYaw: new Spring(7, 0.35),
      bobPhase: 0, bobAmp: 0, lastStep: 0, lastShot: -1, reloadWas: -1,
      yawRate: 0, pitchRate: 0, prevY: 0, prevX: 0, fov: P.fov, t: 0,
      prevFwd: new THREE.Vector3(0, 0, -1), shift: new THREE.Vector2()
    };
    const camObj = new THREE.Object3D();             // камера для рига (позиция/поворот)
    const vmCam = { camera: camObj, yawRate: 0, pitchRate: 0, breath: 0, bobPos: new THREE.Vector3(), bobRot: new THREE.Vector3(), leanRoll: 0 };
    const level = { raycast: () => null };
    const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ');

    function activate(s) {
      st.active = s;
      const c = s.ctrl;
      st.yawS.x = c.yaw; st.yawS.v = 0;
      st.pitchS.x = c.pitch * P.pitchFollow; st.pitchS.v = 0;
      for (const k of ['shY', 'shP', 'shR', 'shYaw']) { st[k].x = 0; st[k].v = 0; }
      st.lastShot = c.lastShot; st.reloadWas = c.reload;
      st.prevY = c.yaw; st.prevX = c.pitch;
      const sm = sleeveMaterial(s.char);
      for (const a of [rig.armR, rig.armL]) { a.sleeve.mesh.material = sm; a.sleeveTab.material = sm; }
      rig.reloading = false;
    }

    /* Кадр управляемого бойца. mode: 'fp' — камера на груди, руки рига;
       'tp' — вид со стороны, риг лишь задаёт кисти телу. Возвращает
       true, если камера поставлена. */
    function update(dt, s, mode) {
      if (st.active !== s) activate(s);
      const c = s.ctrl;
      st.t += dt;
      const aimYaw = c.yaw, aimPitch = c.pitch;

      /* шаг: фаза и толчки на каждом касании */
      const hs = c.speed || 0, moving = c.grounded === false ? 0 : hs;
      st.bobAmp += (Math.min(moving / 2.4, 1.9) - st.bobAmp) * (1 - Math.exp(-dt * 6));
      st.bobPhase += dt * (moving / 0.74) * Math.PI;
      const step = Math.floor(st.bobPhase / Math.PI);
      if (step !== st.lastStep) {
        st.lastStep = step;
        if (moving > 0.5) {
          const k = P.shake * (moving > 3.8 ? 1.7 : 1);
          st.shY.v -= 0.35 * k; st.shR.v += (step % 2 ? 1 : -1) * 0.3 * k; st.shP.v += 0.35 * k; st.shYaw.v += (step % 2 ? 1 : -1) * 0.15 * k;
        }
      }
      const B = P.bob * (1 - (c.ads || 0) * 0.6);
      const bobY = -Math.abs(Math.sin(st.bobPhase)) * 0.03 * st.bobAmp * B, bobX = Math.sin(st.bobPhase) * 0.02 * st.bobAmp * B;
      const bobRoll = Math.sin(st.bobPhase) * 0.011 * st.bobAmp * B, bobPitch = Math.sin(st.bobPhase * 2) * 0.006 * st.bobAmp * B;
      const t = st.t;
      const nz = (a, b, cc) => Math.sin(t * a) * 0.5 + Math.sin(t * b + 1.3) * 0.3 + Math.sin(t * cc + 2.1) * 0.2;
      const br = 0.0035 * P.shake * (1 + st.bobAmp * 0.8);

      /* выстрел: вздрагивание камеры и отдача рига */
      if (c.lastShot !== st.lastShot) {
        st.lastShot = c.lastShot;
        const k = P.shake * 0.8;
        st.shP.v += 1.9 * k; st.shR.v += (Math.random() - 0.5) * 2.2 * k; st.shYaw.v += (Math.random() - 0.5) * k; st.shY.v -= 0.15 * k;
        const S0 = rig.states[0];
        S0.mag = 30; S0.chambered = true; S0.locked = false;
        rig.cooldown = 0;
        rig.pullTrigger(true);
      }
      /* перезарядка игры -> анимация рига той же длительности */
      if (c.reload >= 0 && st.reloadWas < 0) {
        const tr = c.reloadWasEmpty ? spec.empty : spec.tactical;
        const dur = c.reloadWasEmpty ? 3.05 : 2.45;
        rig.reloading = true; rig.reloadT = 0; rig.track = tr; rig.fumbled = false;
        rig.reloadSpeed = tr.duration / dur;
        rig.states[0].mag = 29;
      } else if (c.reload < 0 && rig.reloading && st.reloadWas >= 0) rig.reloading = false;
      st.reloadWas = c.reload;

      /* пружины с подшагами */
      const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
      for (let i = 0; i < n; i++) {
        /* в прицеле камера берёт весь наклон взгляда: мушка по центру */
        st.yawS.step(aimYaw, h); st.pitchS.step(aimPitch * U.lerp(P.pitchFollow, 1, U.smoothstep(c.ads || 0)), h);
        st.shY.step(0, h); st.shP.step(0, h); st.shR.step(0, h); st.shYaw.step(0, h);
      }
      /* ствол опережает камеру не больше чем на ~31° */
      if (st.yawS.x < aimYaw - P.maxOff) st.yawS.x = aimYaw - P.maxOff;
      if (st.yawS.x > aimYaw + P.maxOff) st.yawS.x = aimYaw + P.maxOff;

      const lean = c.lean || 0;
      const camYaw = st.yawS.x + st.shYaw.x + nz(0.9, 1.9, 3.7) * br;
      const camPitch = st.pitchS.x + bobPitch + st.shP.x + nz(1.1, 2.3, 4.7) * br;
      const camRoll = bobRoll + st.shR.x + nz(0.7, 1.7, 3.1) * br * 0.8 - lean * 0.25;
      _e.set(camPitch, camYaw, camRoll, 'YXZ');
      const camQ = _q.setFromEuler(_e);
      const bodyQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), st.yawS.x);

      if (mode === 'fp') {
        const chestH = U.lerp(P.chestHeight, P.crouchChest, c.crouch || 0);
        frame.position.set(c.pos.x, c.pos.y + chestH, c.pos.z)
          .add(_v.set(bobX + lean * 0.15, bobY + st.shY.x, -P.chestForward).applyQuaternion(bodyQ));
      } else {
        /* плечи рига (0,19; -0,11; 0,07 от камеры) — на плечи тела */
        const sR = s.char.bone('shoulderR').getWorldPosition(new THREE.Vector3());
        const sL = s.char.bone('shoulderL').getWorldPosition(new THREE.Vector3());
        frame.position.copy(sR.add(sL).multiplyScalar(0.5)).sub(_v.set(0, -0.11, 0.07).applyQuaternion(camQ));
      }
      frame.quaternion.copy(camQ);
      frame.updateMatrixWorld(true);
      camObj.position.copy(frame.position); camObj.quaternion.copy(frame.quaternion); camObj.updateMatrixWorld(true);

      /* риг */
      if (dt > 1e-4) {
        const kk = 1 - Math.exp(-dt * 25);
        st.yawRate += (wrapAng(camYaw - st.prevY) / dt - st.yawRate) * kk;
        st.pitchRate += ((camPitch - st.prevX) / dt - st.pitchRate) * kk;
      }
      st.prevY = camYaw; st.prevX = camPitch;
      vmCam.yawRate = st.yawRate; vmCam.pitchRate = st.pitchRate;
      vmCam.breath = Math.sin(t * 1.15);
      vmCam.bobPos.set(bobX, bobY + st.shY.x, 0);
      vmCam.bobRot.set(bobPitch + st.shP.x, st.shYaw.x, bobRoll + st.shR.x);
      vmCam.leanRoll = -lean * 0.25;
      const ads = U.smoothstep(c.ads || 0);
      const spr = U.smoothstep(c.sprint || 0) * (1 - ads);
      const player = {
        get aimYaw() { return aimYaw; }, set aimYaw(v) {},
        get aimPitch() { return aimPitch; }, set aimPitch(v) {},
        ads, sprint: spr,
        fatigue: 1 - (c.stamina / (c.PHYS ? c.PHYS.staminaMax : 7.2)),
        grounded: c.grounded !== false, moveBlend: Math.min(hs / 2.4, 2), speed: hs, stepPhase: st.bobPhase,
        /* на бегу оружие прижато к груди и не водится за взглядом */
        offsetYaw: wrapAng(aimYaw - camYaw) * (1 - spr * 0.7), offsetPitch: wrapAng(aimPitch - camPitch) * (1 - spr * 0.9)
      };
      rig.update(Math.min(dt, 0.05), player, vmCam, level, { lmb: !!c.triggerHeld && c.ammo > 0 });
      rig.root.visible = mode === 'fp';
      frame.updateMatrixWorld(true);
      AKA.applyToGun(rig, s.gun, rig.root.matrixWorld);

      if (mode === 'fp') {
        camera.position.copy(frame.position);
        camera.quaternion.copy(frame.quaternion);
        const fov = U.lerp(P.fov, P.adsFov, ads);
        if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
        camera.updateMatrixWorld(true);
      }
      return true;
    }

    /* Сдвиг картинки за кадр (для смаза и скоса строк). */
    function measureShift() {
      const p = camera.position.clone().addScaledVector(st.prevFwd, 10).project(camera);
      if (p.z > 1 || !isFinite(p.x)) st.shift.set(0, 0); else st.shift.set(p.x * 0.5, p.y * 0.5);
      if (st.shift.length() > 0.2) st.shift.setLength(0.2);
      camera.getWorldDirection(st.prevFwd);
      return st.shift;
    }

    /* Кисти рига в мире — для рук тела от третьего лица. */
    function handTargets(out) {
      rig.root.updateMatrixWorld(true);
      out.R = rig.right.anchor.matrixWorld; out.L = rig.left.anchor.matrixWorld;
      out.poseR = rig.right.pose; out.poseL = rig.left.pose;
      return out;
    }

    return {
      rig, spec, frame, update, measureShift, handTargets, P,
      hide() { rig.root.visible = false; },
      get lensAmount() { return st.lens || 0; }
    };
  }

  function root() { return typeof self !== 'undefined' ? self : globalThis; }

  return { create, LENS_SHADER, P };
});
