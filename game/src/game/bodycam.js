/* ============================================================================
   Шлемная камера (бодикам) и руки от первого лица — по bodycam_angar.html.

   Камера закреплена на шлеме и стоит на уровне глаз бойца — на одной высоте
   с глазами остальных. Наведение — как в bodycam_angar.html: мышь ведёт
   оружие руками, а голова с камерой догоняет его пружиной (по наклону —
   лишь долю, ствол опережает объектив максимум на ~31°). Руки при этом
   тянутся к рукоятке и цевью и сгибаются в локтях. В прицеле голова
   догоняет быстрее и берёт весь наклон: целик и мушка приходят в центр.

   Подвеска камеры: качание и толчки строго на касаниях стоп — по той же
   фазе шага, по которой звучат шаги и двигаются ноги (player.stepPhase:
   0 и 0,5 — касания правой и левой). На бегу — наклон корпуса вперёд,
   скрутка плеч, крен в повороте, отставание головы при разгоне и рывок при
   остановке. Объектив не зумит: у бодикама нет зума.

   Руки — риг из того же файла (viewmodel/vm.js): перчатки GLB, рукава,
   позы наготове / в прицеле / на бегу, отдача и перезарядка. Рукав берёт
   камуфляж формы бойца. Риг ведёт сборку оружия бойца (game/lib/weapons,
   спека — viewmodel/wspec.js): setWeapon(build | null). Без оружия камера
   работает так же, руки скрыты.

   Вид от третьего лица (T) использует тот же риг: камера рига ставится так,
   что её плечи совпадают с плечами бойца, а руки тела тянутся к кистям рига.
   ========================================================================== */
(function (root, factory) {
  const B = factory(root.THREE, root.GUtil, root.GVM, root.GWSpec);
  if (typeof module !== 'undefined' && module.exports) module.exports = B;
  else root.GBodycam = B;
})(typeof self !== 'undefined' ? self : this, function (THREE, U, VM, WSPEC) {
  'use strict';

  /* параметры камеры и линзы (как в исходнике) */
  const P = {
    fov: 88, adsFov: 50, distortion: 0.42, zoom: 0.74, chroma: 0.05, vignette: 1.0,
    sharpen: 0.55, grain: 0.05, rollingShutter: 0.45, motionBlur: 0.8,
    bob: 1.0, shake: 1.0,
    /* наведение руками (как в исходнике): частота пружины головы по курсу,
       доля наклона, предел опережения ствола; в прицеле и на бегу голова
       догоняет быстрее */
    bodyFollow: 2.4, pitchFollow: 0.62, maxOff: 0.55, adsFollow: 6.5, sprintFollow: 4.2,
    /* бег: наклон корпуса (рад), крен в повороте, отставание при разгоне */
    runLean: 0.07, turnTiltGain: 0.016, maxTurnTilt: 0.09, accelGain: 0.0045, maxAccel: 0.035,
    /* В прицеле приклад лежит под щекой вровень с линией прицеливания и
       закрывал пол-кадра серой плитой: ближняя плоскость отсекает его. */
    near: 0.02, adsNear: 0.11
  };
  /* Плечи рига относительно глаз: ~0,24 м ниже и чуть позади. Позы оружия
     заданы в той же системе (viewmodel/wspec.js). */
  const SHOULDER_R = [0.18, -0.24, 0.13], SHOULDER_L = [-0.18, -0.24, 0.10];
  /* плечи рига в прежней, нагрудной системе — для вида от третьего лица */
  const SHOULDER_CHEST = [0.19, -0.12, 0.12];

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
    if (!VM || !WSPEC || !assets) return null;
    VM.CONFIG.body.shoulderR = SHOULDER_R.slice();
    VM.CONFIG.body.shoulderL = SHOULDER_L.slice();

    const frame = new THREE.Group();                 // «камера рига» = глаза
    frame.name = 'bodycamRig';
    scene.add(frame);
    /* риг пересобирается под каждое оружие (спека зависит от сборки) */
    let rig = null, spec = null, ws = null, build = null;
    function setWeapon(b) {
      if (b === build) return;
      if (rig) frame.remove(rig.root);
      build = b || null;
      rig = null; spec = null; ws = null;
      if (build) {
        ws = WSPEC.createSpec(build);
        spec = ws.spec;
        rig = new VM.WeaponRig({ right: assets.clone(assets.right), left: assets.clone(assets.left) }, [spec]);
        /* фонарь рига не нужен */
        rig.flashlight.castShadow = false;
        if (rig.flashlight.parent) rig.flashlight.parent.remove(rig.flashlight);
        if (rig.flashlight.target.parent) rig.flashlight.target.parent.remove(rig.flashlight.target);
        ws.model.root.visible = false;               // вместо модели — сборка бойца
        frame.add(rig.root);
      }
      st.active = null;
    }

    const st = {
      active: null,
      yawS: new Spring(P.bodyFollow, 0.95), pitchS: new Spring(2.8, 0.95),
      /* крепление на шлеме: отставание головы при разгоне/торможении */
      accP: new Spring(2.6, 0.42), accR: new Spring(2.6, 0.42), prevVel: new THREE.Vector3(), leanS: 0,
      shY: new Spring(7, 0.3), shP: new Spring(8, 0.32), shR: new Spring(6, 0.3), shYaw: new Spring(7, 0.35),
      moveK: 0, runK: 0, lastStep: 0, lastShot: -1, reloadWas: -1,
      yawRate: 0, pitchRate: 0, prevY: 0, prevX: 0, t: 0,
      prevFwd: new THREE.Vector3(0, 0, -1), shift: new THREE.Vector2()
    };
    const camObj = new THREE.Object3D();             // камера для рига (позиция/поворот)
    const vmCam = { camera: camObj, yawRate: 0, pitchRate: 0, breath: 0, bobPos: new THREE.Vector3(), bobRot: new THREE.Vector3(), leanRoll: 0 };
    const level = { raycast: () => null };
    const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ');

    function activate(s) {
      st.active = s;
      const c = s.ctrl;
      for (const k of ['shY', 'shP', 'shR', 'shYaw', 'accP', 'accR']) { st[k].x = 0; st[k].v = 0; }
      st.yawS.x = c.yaw; st.yawS.v = 0;
      st.pitchS.x = c.pitch * P.pitchFollow; st.pitchS.v = 0;
      st.prevVel.set(c.vel ? c.vel.x : 0, 0, c.vel ? c.vel.z : 0); st.leanS = 0;
      st.lastStep = Math.floor((c.stepPhase || 0) * 2);
      st.lastShot = c.lastShot; st.reloadWas = c.reload;
      st.prevY = c.yaw; st.prevX = c.pitch;
      if (rig) {
        const sm = sleeveMaterial(s.char);
        for (const a of [rig.armR, rig.armL]) { a.sleeve.mesh.material = sm; a.sleeveTab.material = sm; }
        rig.reloading = false;
      }
    }

    /* Кадр управляемого бойца. mode: 'fp' — камера на шлеме, руки рига;
       'tp' — вид со стороны, риг лишь задаёт кисти телу. Возвращает
       true, если камера поставлена. */
    function update(dt, s, mode) {
      if (st.active !== s) activate(s);
      const c = s.ctrl;
      st.t += dt;
      const aimYaw = c.yaw, aimPitch = c.pitch;

      /* Шаг. Фаза — та же, что у звука шагов и ног (player.js, locomotion.js):
         ph = 2π·stepPhase, касание правой стопы при ph = 0, левой — при π.
         Толчок камеры даётся в тот же кадр, что и звук шага. */
      const hs = c.speed || 0, moving = c.grounded === false ? 0 : hs;
      const PH = c.PHYS || { walk: 2.55, sprint: 4.55 };
      const kk6 = 1 - Math.exp(-dt * 6);
      st.moveK += (U.clamp(moving / PH.walk, 0, 1.25) - st.moveK) * kk6;
      st.runK += (U.smoothstep(U.clamp((moving - PH.walk) / (PH.sprint - PH.walk), 0, 1)) - st.runK) * kk6;
      const stepPh = c.stepPhase || 0, ph = stepPh * Math.PI * 2;
      const step = Math.floor(stepPh * 2);
      if (step !== st.lastStep) {
        st.lastStep = step;
        if (moving > 0.35) {
          const side = step % 2 ? -1 : 1;                 // чётное — правая стопа
          const k = P.shake * U.lerp(0.55, 1.5, st.runK) * U.clamp(moving / PH.walk, 0.4, 1) * (1 - (c.ads || 0) * 0.5);
          st.shY.v -= 0.30 * k; st.shP.v -= 0.30 * k; st.shR.v += side * 0.22 * k; st.shYaw.v += side * 0.10 * k;
        }
      }
      /* Голова: ниже всего сразу после касания (на бегу — в середине опоры,
         выше всего — в фазе полёта), вбок — к опорной ноге, крен туда же;
         на бегу плечи скручиваются навстречу ногам и уводят голову по курсу. */
      const B = P.bob * st.moveK * (1 - (c.ads || 0) * 0.65);
      const runK = st.runK;
      const dip = 0.5 + 0.5 * Math.cos(2 * ph - U.lerp(0.35, 0.9, runK));
      const bobY = -dip * U.lerp(0.016, 0.046, runK) * B;
      const bobX = Math.sin(ph) * U.lerp(0.010, 0.024, runK) * B;
      const bobRoll = Math.sin(ph) * U.lerp(0.008, 0.028, runK) * B;
      const bobPitch = -dip * U.lerp(0.004, 0.016, runK) * B;
      const bobYaw = -Math.sin(ph + 0.4) * U.lerp(0.004, 0.018, runK) * B;
      const t = st.t;
      const nz = (a, b, cc) => Math.sin(t * a) * 0.5 + Math.sin(t * b + 1.3) * 0.3 + Math.sin(t * cc + 2.1) * 0.2;
      const br = 0.0025 * P.shake * (1 + st.moveK * 0.8 + runK);

      /* выстрел: вздрагивание камеры и отдача рига */
      if (c.lastShot !== st.lastShot) {
        st.lastShot = c.lastShot;
        const k = P.shake * 0.8;
        st.shP.v += 1.9 * k; st.shR.v += (Math.random() - 0.5) * 2.2 * k; st.shYaw.v += (Math.random() - 0.5) * k; st.shY.v -= 0.15 * k;
        if (rig) {
          const S0 = rig.states[0];
          S0.mag = spec.tuning.magSize; S0.chambered = true; S0.locked = false;
          rig.cooldown = 0;
          rig.pullTrigger(true);
        }
      }
      /* перезарядка игры -> анимация рига той же длительности */
      if (rig && c.reload >= 0 && st.reloadWas < 0) {
        const tr = c.reloadWasEmpty ? spec.empty : spec.tactical;
        const W = c.WPN || {};
        const dur = c.reloadWasEmpty ? (W.reloadEmpty || 3.05) : (W.reloadTime || 2.45);
        rig.reloading = true; rig.reloadT = 0; rig.track = tr; rig.fumbled = false;
        rig.reloadSpeed = tr.duration / dur;
        rig.states[0].mag = Math.max(0, spec.tuning.magSize - 1);
      } else if (rig && c.reload < 0 && rig.reloading && st.reloadWas >= 0) rig.reloading = false;
      st.reloadWas = c.reload;

      /* Разгон и торможение в системе головы: при рывке вперёд голова
         отстаёт, при остановке кивает вперёд; вбок — крен. */
      const adsK = U.smoothstep(c.ads || 0);
      const sprK = U.smoothstep(c.sprint || 0) * (1 - adsK);
      if (dt > 1e-4 && c.vel) {
        const ax = (c.vel.x - st.prevVel.x) / dt, az = (c.vel.z - st.prevVel.z) / dt;
        st.prevVel.set(c.vel.x, 0, c.vel.z);
        const sy = Math.sin(st.yawS.x), cy = Math.cos(st.yawS.x);
        const aFwd = -ax * sy - az * cy, aSide = ax * cy - az * sy;
        st.accTP = U.clamp(-aFwd * P.accelGain, -P.maxAccel, P.maxAccel);
        st.accTR = U.clamp(-aSide * P.accelGain, -P.maxAccel, P.maxAccel);
      }
      st.leanS += (sprK - st.leanS) * (1 - Math.exp(-dt * 4));

      /* пружины с подшагами: голова догоняет оружие, толчки гаснут */
      const follow = U.lerp(U.lerp(P.bodyFollow, P.sprintFollow, sprK), P.adsFollow, adsK);
      st.yawS.f = follow; st.pitchS.f = U.lerp(2.8, P.adsFollow, adsK);
      const pitchK = U.lerp(P.pitchFollow, 1, adsK);
      const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
      for (let i = 0; i < n; i++) {
        st.yawS.step(st.yawS.x + wrapAng(aimYaw - st.yawS.x), h);
        st.pitchS.step(aimPitch * pitchK, h);
        st.shY.step(0, h); st.shP.step(0, h); st.shR.step(0, h); st.shYaw.step(0, h);
        st.accP.step(st.accTP || 0, h); st.accR.step(st.accTR || 0, h);
      }
      /* ствол опережает камеру не больше чем на ~31° */
      const dYaw = wrapAng(aimYaw - st.yawS.x);
      if (dYaw > P.maxOff) st.yawS.x = aimYaw - P.maxOff;
      if (dYaw < -P.maxOff) st.yawS.x = aimYaw + P.maxOff;

      const lean = c.lean || 0;
      const still = 1 - adsK * 0.6;
      /* крен в повороте на бегу: корпус заваливается внутрь дуги */
      const turnTilt = U.clamp(-st.yawS.v * P.turnTiltGain * st.moveK * (0.4 + 0.6 * runK), -P.maxTurnTilt, P.maxTurnTilt);
      const camYaw = st.yawS.x + (bobYaw + st.shYaw.x + nz(0.9, 1.9, 3.7) * br) * still;
      const camPitch = st.pitchS.x - P.runLean * st.leanS
        + (bobPitch + st.shP.x + st.accP.x + nz(1.1, 2.3, 4.7) * br) * still;
      const camRoll = (bobRoll + st.shR.x + st.accR.x + turnTilt + nz(0.7, 1.7, 3.1) * br * 0.8) * still - lean * 0.22;
      _e.set(camPitch, camYaw, camRoll, 'YXZ');
      const camQ = _q.setFromEuler(_e);
      const headQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), st.yawS.x);

      if (mode === 'fp') {
        /* глаза — по скелету бойца (как F.eyePosition в game.js): на одном
           уровне с глазами остальных бойцов; на бегу корпус наклонён —
           голова ниже и впереди */
        const M = s.char.metrics;
        const eyeY = U.lerp(M.eyeY, M.eyeY - (M.hipY - 0.50), c.crouch || 0);
        frame.position.set(c.pos.x, c.pos.y + eyeY - Math.abs(lean) * 0.055 - 0.045 * st.leanS, c.pos.z)
          .add(_v.set(bobX + lean * 0.30, bobY + st.shY.x * still,
            -(M.headRZ + 0.012) - 0.07 * st.leanS - st.accP.x * 0.4).applyQuaternion(headQ));
      } else {
        /* плечи рига — на плечи тела */
        const sR = s.char.bone('shoulderR').getWorldPosition(new THREE.Vector3());
        const sL = s.char.bone('shoulderL').getWorldPosition(new THREE.Vector3());
        const oy = -0.11 + (SHOULDER_R[1] - SHOULDER_CHEST[1]), oz = 0.07 + (SHOULDER_R[2] - SHOULDER_CHEST[2]);
        frame.position.copy(sR.add(sL).multiplyScalar(0.5)).sub(_v.set(0, oy, oz).applyQuaternion(camQ));
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
      vmCam.bobRot.set(bobPitch + st.shP.x, bobYaw + st.shYaw.x, bobRoll + st.shR.x);
      vmCam.leanRoll = -lean * 0.25;
      const ads = U.smoothstep(c.ads || 0);
      const spr = U.smoothstep(c.sprint || 0) * (1 - ads);
      const player = {
        get aimYaw() { return aimYaw; }, set aimYaw(v) {},
        get aimPitch() { return aimPitch; }, set aimPitch(v) {},
        ads, sprint: spr,
        fatigue: 1 - (c.stamina / (c.PHYS ? c.PHYS.staminaMax : 7.2)),
        grounded: c.grounded !== false, moveBlend: 1 + runK, speed: hs, stepPhase: ph,
        /* на бегу оружие прижато к груди и не водится за взглядом */
        offsetYaw: wrapAng(aimYaw - camYaw) * (1 - spr * 0.7), offsetPitch: wrapAng(aimPitch - camPitch) * (1 - spr * 0.9)
      };
      if (rig) {
        rig.update(Math.min(dt, 0.05), player, vmCam, level, { lmb: !!c.triggerHeld && c.ammo > 0 });
        rig.root.visible = mode === 'fp';
        frame.updateMatrixWorld(true);
        ws.apply(rig, rig.root.matrixWorld);
      }

      if (mode === 'fp') {
        camera.position.copy(frame.position);
        camera.quaternion.copy(frame.quaternion);
        const fov = U.lerp(P.fov, P.adsFov, ads);
        const near = U.lerp(P.near, P.adsNear, U.smoothstep(U.clamp((ads - 0.55) / 0.4, 0, 1)));
        if (Math.abs(camera.fov - fov) > 0.01 || camera.near !== near) {
          camera.fov = fov; camera.near = near; camera.updateProjectionMatrix();
        }
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
      if (!rig) return null;
      rig.root.updateMatrixWorld(true);
      out.R = rig.right.anchor.matrixWorld; out.L = rig.left.anchor.matrixWorld;
      out.poseR = rig.right.pose; out.poseL = rig.left.pose;
      return out;
    }

    return {
      get rig() { return rig; }, get spec() { return spec; }, get weapon() { return build; },
      frame, update, measureShift, handTargets, setWeapon, P,
      hide() { if (rig) rig.root.visible = false; },
      /* вне вида от первого лица ближняя плоскость — обычная */
      resetNear() { if (camera.near !== P.near) { camera.near = P.near; camera.updateProjectionMatrix(); } },
      get lensAmount() { return st.lens || 0; }
    };
  }

  function root() { return typeof self !== 'undefined' ? self : globalThis; }

  return { create, LENS_SHADER, P };
});
