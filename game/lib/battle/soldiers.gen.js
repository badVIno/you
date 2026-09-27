/* СГЕНЕРИРОВАНО tools/build_battle.mjs — не править вручную. */
(function () {
  if (window.GAssets) return;
  const local = location.protocol === 'http:' || location.protocol === 'https:';
  const CDN = ['https://cdn.jsdelivr.net/gh/badVIno/you@main/game/'];
  const bases = local ? [new URL('./', location.href).href, ...CDN] : CDN;
  const data = {}, jobs = [];
  async function fetchAny(path, kind) {
    let err;
    for (const b of bases) {
      try {
        const r = await fetch(b + path);
        if (!r.ok) throw new Error(r.status + ' ' + path);
        return kind === 'json' ? await r.json() : kind === 'blob' ? await r.blob() : await r.arrayBuffer();
      } catch (e) { err = e; }
    }
    throw err;
  }
  async function image(path) { return createImageBitmap(await fetchAny(path, 'blob'), { imageOrientation: 'flipY' }); }
  function add(name, p) { jobs.push(Promise.resolve(p).then((v) => { data[name] = v; }, (e) => { console.warn('asset ' + name + ' failed:', e && e.message); data[name] = null; })); }
  window.GAssets = { bases, data, fetchAny, image, add, progress: () => jobs.length, ready: () => Promise.all(jobs) };
})();

/* ---- core/util.js ---- */
/* ============================================================================
   Общие утилиты полигона: математика, кривые, детерминированный шум.
   Модуль не зависит от three.js и переиспользуется генераторами геометрии.
   ========================================================================== */
(function (root, factory) {
  const U = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = U;
  else root.GUtil = U;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = lerp;
  const smoothstep = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
  const smootherstep = (t) => { t = clamp01(t); return t * t * t * (t * (t * 6 - 15) + 10); };
  const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
  const remap = (v, a, b, c, d) => lerp(c, d, clamp01(invLerp(a, b, v)));

  /* Приближение к цели с постоянной «половиной времени»: не зависит от fps.
     rate — во сколько раз сокращается ошибка за секунду. */
  const approach = (cur, dst, rate, dt) => dst + (cur - dst) * Math.exp(-rate * dt);

  /* Пружина второго порядка (критическое демпфирование) — для отдачи и веса. */
  function spring(state, target, omega, dt, zeta) {
    const z = zeta === undefined ? 1 : zeta;
    /* полунеявный Эйлер устойчив при больших dt */
    const f = omega * omega;
    const a = (target - state.x) * f - 2 * z * omega * state.v;
    state.v += a * dt;
    state.x += state.v * dt;
    return state.x;
  }

  /* ------------------------------------------------------- случайность */
  /* mulberry32: быстрый детерминированный ГПСЧ. Каждый боец получает свой
     seed, поэтому камуфляж, потёртости и мимика стабильны между кадрами. */
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    const f = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.range = (lo, hi) => lo + f() * (hi - lo);
    f.int = (lo, hi) => Math.floor(lo + f() * (hi - lo + 1));
    f.pick = (arr) => arr[Math.floor(f() * arr.length) % arr.length];
    f.sign = () => (f() < 0.5 ? -1 : 1);
    return f;
  }

  /* ------------------------------------------------------- шум (2D value) */
  function noise2D(seed) {
    const P = new Uint8Array(512);
    const r = rng(seed);
    for (let i = 0; i < 256; i++) P[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = P[i]; P[i] = P[j]; P[j] = t;
    }
    for (let i = 0; i < 256; i++) P[256 + i] = P[i];

    const grad = (h, x, y) => {
      const u = (h & 1) ? x : y, v = (h & 2) ? y : x;
      return ((h & 4) ? -u : u) + ((h & 8) ? -v : v) * 0.5;
    };
    return function (x, y) {
      const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
      x -= Math.floor(x); y -= Math.floor(y);
      const u = smootherstep(x), v = smootherstep(y);
      const A = P[X] + Y, B = P[X + 1] + Y;
      const n = lerp(
        lerp(grad(P[A], x, y), grad(P[B], x - 1, y), u),
        lerp(grad(P[A + 1], x, y - 1), grad(P[B + 1], x - 1, y - 1), u), v);
      return clamp(n * 0.7 + 0.5, 0, 1);
    };
  }

  /* Фрактальный шум: несколько октав value-шума. */
  function fbm(seed, octaves, gain, lac) {
    const n = noise2D(seed);
    const O = octaves || 4, G = gain === undefined ? 0.5 : gain, L = lac || 2;
    return function (x, y) {
      let a = 0.5, f = 1, s = 0, norm = 0;
      for (let i = 0; i < O; i++) { s += a * n(x * f, y * f); norm += a; a *= G; f *= L; }
      return s / norm;
    };
  }

  /* --------------------------------------------------------------- кривые */
  /* Профиль сечения: замкнутая суперэллипса. Мягко переходит от круга (n=2)
     к скруглённому прямоугольнику (n=4..6) — так строятся торс и приклад. */
  function superellipse(a, b, n, t) {
    const c = Math.cos(t), s = Math.sin(t);
    const p = 2 / n;
    return [
      a * Math.sign(c) * Math.pow(Math.abs(c), p),
      b * Math.sign(s) * Math.pow(Math.abs(s), p)
    ];
  }

  /* Catmull-Rom по массиву чисел — плавные профили радиусов конечностей. */
  function splineAt(pts, t) {
    const n = pts.length;
    if (n === 0) return 0;
    if (n === 1) return pts[0];
    const x = clamp01(t) * (n - 1);
    const i = Math.min(n - 2, Math.floor(x));
    const f = x - i;
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    const f2 = f * f, f3 = f2 * f;
    return 0.5 * ((2 * p1) + (-p0 + p2) * f
      + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f2
      + (-p0 + 3 * p1 - 3 * p2 + p3) * f3);
  }

  /* Угол в диапазон (-PI, PI] — для доворота корпуса за взглядом. */
  function wrapPI(a) {
    while (a > Math.PI) a -= TAU;
    while (a <= -Math.PI) a += TAU;
    return a;
  }

  const damp = (cur, dst, lambda, dt) => lerp(cur, dst, 1 - Math.exp(-lambda * dt));

  function dampAngle(cur, dst, lambda, dt) {
    return cur + wrapPI(dst - cur) * (1 - Math.exp(-lambda * dt));
  }

  return {
    TAU, DEG, clamp, clamp01, lerp, mix, smoothstep, smootherstep, invLerp, remap,
    approach, spring, rng, noise2D, fbm, superellipse, splineAt, wrapPI, damp, dampAngle
  };
});
/* ---- viewmodel/vm.js ---- */
/* ============================================================================
   Руки от первого лица и хват оружия — перенесено из bodycam_angar.html
   (порт проекта models343): перчатки GLB с костями пальцев, процедурные
   рукава с folds у локтя и манжеты, риг оружия с позами (наготове, прицел,
   бег, упор в стену), покачиванием, отдачей и анимацией перезарядки.

   Оружие рига (M4, пистолет), его звук и ангар сюда не входят: риг ведёт
   оружие игры через спеку viewmodel/wspec.js (любая сборка game/lib/weapons).

   Система «камеры рига»: -Z вперёд, +Y вверх, метры. Кисть: начало — запястье,
   -Z к пальцам, +Y — тыл кисти.
   ========================================================================== */
(function (root, factory) {
  const V = factory(root.THREE);
  if (typeof module !== 'undefined' && module.exports) module.exports = V;
  else root.GVM = V;
})(typeof self !== 'undefined' ? self : this, function (T3) {
'use strict';
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key2, value) => key2 in obj ? __defProp(obj, key2, { enumerable: true, configurable: true, writable: true, value }) : obj[key2] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __publicField = (obj, key2, value) => __defNormalProp(obj, typeof key2 !== "symbol" ? key2 + "" : key2, value);
const THREE = T3;
const THREE2 = T3;
const THREE3 = T3;
const THREE4 = T3;
const THREE5 = T3;
const THREE6 = T3;

// weapon/WeaponRig.ts

// config.ts
var CONFIG = {
  quality: {
    renderScale: 1,
    maxPixelRatio: 1.25,
    msaa: 4,
    shadows: true,
    shadowMapSize: 1024
  },
  camera: {
    /** Vertical FOV of the rectilinear render that the lens shader remaps. */
    renderFovV: 84,
    near: 0.02,
    far: 160,
    /** Chest mount (sternum) height and forward offset from the body centre. */
    chestHeight: 1.37,
    crouchChestHeight: 0.93,
    chestForward: 0.13,
    /** Free-aim cone ("bodycam look"): the gun moves inside it, the torso follows. ref */
    freezeYawDeg: 13.2,
    freezePitchDeg: 6,
    followSpeedIdle: 4.4,
    followSpeedWalk: 7,
    followSpeedRun: 12,
    mouseSensitivity: 21e-4,
    adsSensitivityScale: 0.65,
    invertY: false,
    /** Global scale of the body motion layers (bob, foot strikes, micro-motion). */
    motionScale: 1,
    /** Scale of the chest-camera recoil jolt. */
    recoilScale: 1,
    pitchLimitDeg: 82,
    /** Step-synchronised chest bob. Amplitudes in metres / radians. */
    bob: {
      walk: { vert: 0.012, lat: 0.011, roll: 0.018, yaw: 0.012, pitch: 7e-3 },
      run: { vert: 0.036, lat: 0.028, roll: 0.034, yaw: 0.032, pitch: 0.022 },
      crouch: { vert: 8e-3, lat: 8e-3, roll: 0.014, yaw: 8e-3, pitch: 5e-3 },
      /** Step length (m). Cadence = speed / stride: walk ~2.3 steps/s, run ~3 steps/s. */
      strideWalk: 0.86,
      strideRun: 1.6,
      strideCrouch: 0.56,
      /** Forward lean of the torso while running (rad). */
      runLean: 0.07
    },
    breathing: { rate: 0.23, vert: 4e-3, pitch: 35e-4 },
    /** Low-frequency body micro-motion. ref (NaturalMotion) */
    natural: { pos: 35e-4, rot: 32e-4, speed: 0.9 },
    turnTiltGain: 0.016,
    maxTurnTilt: 0.09,
    /** Vest mount wobble (second order), driven by body acceleration. */
    mount: { f: 2.6, z: 0.42, accelGain: 45e-4, maxOffset: 0.03 },
    /** Q / E body lean around the hips (peeking round walls and pillars). */
    lean: {
      maxAngleDeg: 17,
      /** Lateral weight shift on top of the roll (m). */
      slide: 0.17,
      pivotHeight: 0.95,
      crouchPivotHeight: 0.62,
      /** The chest camera rolls with the torso. */
      cameraRoll: 0.85,
      f: 2.3,
      z: 0.9,
      speedScale: 0.6,
      /** Minimum distance kept between the leaning camera and a wall. */
      clearance: 0.3,
      /** Hands hold the gun a little more upright than the torso. */
      gunCounterRoll: 0.3
    },
    /** Rolling-shutter readout time (s) used to skew the image on fast pans. */
    rollingShutterReadout: 0.022
  },
  movement: {
    walkSpeed: 2,
    runSpeed: 4.9,
    crouchSpeed: 1.2,
    adsSpeedScale: 0.55,
    accel: 9,
    decel: 11,
    airAccel: 1.5,
    jumpSpeed: 3.2,
    gravity: 9.81,
    radius: 0.28,
    height: 1.8,
    crouchHeight: 1.25
  },
  lens: {
    /** 0 = rectilinear, 1 = equidistant fisheye (model r = tan(s*theta)/s, s = 1 - distortion). */
    distortion: 0.62,
    zoom: 1,
    chromaticAberration: 6e-3,
    caFalloff: 2,
    edgeBlur: 0.85,
    edgeBlurStart: 0.42,
    vignetteRadius: 0.93,
    vignetteSoftness: 0.52,
    vignetteStrength: 1,
    opticalVignette: 0.55,
    vignetteSway: 0.45,
    bloomStrength: 0.028,
    bloomRadius: 0.62,
    dirtIntensity: 0.55,
    autoExposure: true,
    exposureKey: 0.085,
    exposureMin: 0.25,
    exposureMax: 2.4,
    exposureBias: 0,
    adaptSpeedUp: 1.7,
    adaptSpeedDown: 1.25,
    contrast: 1.1,
    saturation: 0.74,
    lift: [0.012, 0.016, 0.02],
    gamma: [1, 1, 1],
    gain: [1.02, 1, 0.97],
    noise: 0.02,
    chromaNoise: 0.35,
    isoNoiseGain: 0.6,
    sharpen: 0.6,
    wdr: 0.28,
    motionBlur: 1,
    shutter: 1 / 55,
    rollingShutter: 1,
    glitch: 0.23,
    /** Screen-space muzzle punch + sensor flash. ref (RecoilPunch) */
    punch: { strength: 0.05, radius: 1.07, decay: 4, flashSize: 0.09, flashOpacity: 0.37, flashDecay: 7 },
    /** Heat haze at the muzzle after a shot. ref (HeatHaze) */
    haze: { strength: 0.019, radius: 0.32, frequency: 20.9, speed: 1.35, duration: 0.28 }
  },
  /**
   * Upper body relative to the chest camera. Matched to Reissad's Bodycam footage: the lens sits
   * above the shoulder joints (top of the plate carrier), so the arms always enter the frame from
   * the bottom corners and never cover the upper half of the image or the sights.
   */
  body: {
    shoulderR: [0.19, -0.12, 0.12],
    shoulderL: [-0.19, -0.12, 0.12],
    upperArm: 0.3,
    forearm: 0.265,
    adsTransitionHz: 3.2
  },
  rifle: {
    /** Gun origin (bore axis at the rear of the upper receiver) in chest-camera space. */
    poses: {
      /** Low ready as in Bodycam: rifle runs from the bottom edge towards the frame centre. */
      hip: { pos: [0.05, -0.14, -0.12], rot: [3, 3, -4] },
      /** Rear aperture + front post on the lens axis (sight line sits 0.66° above the bore). */
      ads: { pos: [0, -0.055, -0.17], rot: [-0.66, 0, 0] },
      sprint: { pos: [0.02, -0.22, -0.02], rot: [-32, 28, -22] },
      wallTuck: { pos: [0.05, -0.22, -0.02], rot: [-32, 8, -4] }
    },
    elbowPole: { hipR: [1, -0.6, 0.3], hipL: [-0.3, -1, 0.3], adsR: [1, -0.5, 0.2], adsL: [-0.3, -1, 0.25] },
    aimPivot: [0.08, -0.08, 0.12],
    /** The rifle pivots about the shoulder pocket (butt stock), not the wrists. */
    wristPivot: [0, -0.03, 0.3],
    sway: { maxYawDeg: 9, maxPitchDeg: 7, tiltMaxDeg: 5, tiltGain: 0.55, yawGain: 0.045, pitchGain: 0.045, f: 2.6, z: 0.6 },
    bob: { walk: { x: 0.011, y: 9e-3, roll: 1.8, pitch: 1 }, run: { x: 0.024, y: 0.02, roll: 4.5, pitch: 2.8 }, adsScale: 0.4 },
    /** 5.56 through a stocked carbine: mostly straight back into the shoulder, little rise per shot. */
    recoil: {
      kickBack: 0.022,
      kickUp: 3e-3,
      pitchDeg: 2.4,
      yawDeg: 0.9,
      rollDeg: 0.8,
      fBack: 14,
      zBack: 0.7,
      f: 7,
      z: 0.55,
      climbDeg: 0.42,
      climbYawDeg: 0.22,
      recoverDelay: 0.14,
      recoverRate: 5,
      recoverFraction: 0.75,
      adsScale: 0.85,
      cameraKick: 0.016,
      cameraPitchDeg: 0.9,
      cameraRollDeg: 0.45
    },
    auto: true,
    fireInterval: 0.075,
    magSize: 30,
    slideCycleTime: 0.06,
    tuckDistance: 1.15,
    smoke: 1.7,
    flash: 1.6
  },
  fx: {
    smokeDensity: 1,
    /** Lingering room haze left by every shot. */
    hazeAmount: 1,
    sparkCount: 1,
    flashScale: 1,
    maxDecals: 140,
    maxShells: 60
  },
  overlay: {
    enabled: true,
    model: "BODYCAM X4",
    serial: "X81A0242B",
    utcOffset: "Z"
  }
};

// core/math.ts
var math_exports = {};
__export(math_exports, {
  DEG: () => DEG,
  ImpulseSpring: () => ImpulseSpring,
  SecondOrder: () => SecondOrder,
  SecondOrderVec3: () => SecondOrderVec3,
  clamp: () => clamp,
  damp: () => damp,
  dampFactor: () => dampFactor,
  easeIn: () => easeIn,
  easeInOut: () => easeInOut,
  easeOut: () => easeOut,
  fbm1: () => fbm1,
  lerp: () => lerp,
  noise1: () => noise1,
  rand: () => rand,
  randSign: () => randSign,
  saturate: () => saturate,
  smoothstep: () => smoothstep,
  wrapAngle: () => wrapAngle
});

var clamp = (v, a, b) => v < a ? a : v > b ? b : v;
var saturate = (v) => clamp(v, 0, 1);
var lerp = (a, b, t) => a + (b - a) * t;
var smoothstep = (a, b, v) => {
  const t = saturate((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
var DEG = Math.PI / 180;
var dampFactor = (lambda, dt) => 1 - Math.exp(-lambda * dt);
var damp = (a, b, lambda, dt) => lerp(a, b, dampFactor(lambda, dt));
function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
var easeInOut = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
var easeOut = (t) => 1 - Math.pow(1 - t, 3);
var easeIn = (t) => t * t * t;
var SecondOrder = class {
  constructor(f, z, r, x0 = 0) {
    __publicField(this, "xp");
    __publicField(this, "y");
    __publicField(this, "yd", 0);
    __publicField(this, "k1", 0);
    __publicField(this, "k2", 0);
    __publicField(this, "k3", 0);
    this.xp = x0;
    this.y = x0;
    this.set(f, z, r);
  }
  set(f, z, r) {
    this.k1 = z / (Math.PI * f);
    this.k2 = 1 / (2 * Math.PI * f * (2 * Math.PI * f));
    this.k3 = r * z / (2 * Math.PI * f);
  }
  reset(x) {
    this.xp = x;
    this.y = x;
    this.yd = 0;
  }
  update(dt, x) {
    if (dt <= 0) return this.y;
    const xd = (x - this.xp) / dt;
    this.xp = x;
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    const k2 = Math.max(this.k2, h * h / 2 + h * this.k1 / 2, h * this.k1);
    for (let i = 0; i < steps; i++) {
      this.y += h * this.yd;
      this.yd += h * (x + this.k3 * xd - this.y - this.k1 * this.yd) / k2;
    }
    return this.y;
  }
};
var SecondOrderVec3 = class {
  constructor(f, z, r, v0 = new THREE.Vector3()) {
    __publicField(this, "x");
    __publicField(this, "y");
    __publicField(this, "z");
    __publicField(this, "value", new THREE.Vector3());
    this.x = new SecondOrder(f, z, r, v0.x);
    this.y = new SecondOrder(f, z, r, v0.y);
    this.z = new SecondOrder(f, z, r, v0.z);
    this.value.copy(v0);
  }
  set(f, z, r) {
    this.x.set(f, z, r);
    this.y.set(f, z, r);
    this.z.set(f, z, r);
  }
  reset(v) {
    this.x.reset(v.x);
    this.y.reset(v.y);
    this.z.reset(v.z);
    this.value.copy(v);
  }
  update(dt, target) {
    this.value.set(this.x.update(dt, target.x), this.y.update(dt, target.y), this.z.update(dt, target.z));
    return this.value;
  }
};
var ImpulseSpring = class {
  constructor(stiffness, damping) {
    this.stiffness = stiffness;
    this.damping = damping;
    __publicField(this, "value", 0);
    __publicField(this, "velocity", 0);
  }
  kick(v) {
    this.velocity += v;
  }
  update(dt, target = 0) {
    const steps = Math.max(1, Math.ceil(dt / (1 / 480)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = -this.stiffness * (this.value - target) - this.damping * this.velocity;
      this.velocity += a * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }
  reset() {
    this.value = 0;
    this.velocity = 0;
  }
};
function hash1(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}
function noise1(x) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * f * (f * (f * 6 - 15) + 10);
  return lerp(hash1(i), hash1(i + 1), u) * 2 - 1;
}
function fbm1(x, octaves = 3) {
  let a = 0.5;
  let s = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    s += a * noise1(x);
    norm += a;
    x = x * 2.03 + 17.13;
    a *= 0.5;
  }
  return s / norm;
}
var rand = (a, b) => a + Math.random() * (b - a);
var randSign = () => Math.random() < 0.5 ? -1 : 1;

// weapon/layers.ts
var LAYER_VIEW = 0;

// weapon/Arms.ts

// weapon/proceduralTextures.ts

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
}
function heightToNormal(height, w, h, strength) {
  const data = new Uint8Array(w * h * 4);
  const at = (x, y) => height[(y + h) % h * w + (x + w) % w];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      data[i] = (-dx / len * 0.5 + 0.5) * 255;
      data[i + 1] = (dy / len * 0.5 + 0.5) * 255;
      data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const t = new THREE2.DataTexture(data, w, h, THREE2.RGBAFormat);
  t.wrapS = t.wrapT = THREE2.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE2.LinearMipmapLinearFilter;
  t.magFilter = THREE2.LinearFilter;
  t.needsUpdate = true;
  return t;
}
function valueNoise(w, h, cell, seed) {
  const gw = Math.ceil(w / cell) + 1;
  const gh = Math.ceil(h / cell) + 1;
  const g = new Float32Array(gw * gh);
  let s = seed;
  for (let i = 0; i < g.length; i++) {
    s = s * 16807 % 2147483647;
    g[i] = s / 2147483647;
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const fx = x / cell;
      const fy = y / cell;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = fx - ix;
      const ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const gx0 = ix % (gw - 1);
      const gy0 = iy % (gh - 1);
      const a = g[gy0 * gw + gx0];
      const b = g[gy0 * gw + gx0 + 1];
      const c = g[(gy0 + 1) * gw + gx0];
      const d = g[(gy0 + 1) * gw + gx0 + 1];
      out[y * w + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}
function createStippleNormal() {
  const w = 256;
  const h = 256;
  const hgt = new Float32Array(w * h);
  let s = 99;
  const r = () => (s = s * 16807 % 2147483647) / 2147483647;
  for (let i = 0; i < 2600; i++) {
    const cx = r() * w;
    const cy = r() * h;
    const rad = 1.5 + r() * 2.2;
    for (let y = -4; y <= 4; y++)
      for (let x = -4; x <= 4; x++) {
        const d = Math.hypot(x, y) / rad;
        if (d < 1) {
          const px = (Math.floor(cx + x) + w) % w;
          const py = (Math.floor(cy + y) + h) % h;
          hgt[py * w + px] = Math.max(hgt[py * w + px], Math.cos(d * Math.PI * 0.5));
        }
      }
  }
  return heightToNormal(hgt, w, h, 2.2);
}
function createFinishNormal() {
  const w = 256;
  const h = 256;
  const a = valueNoise(w, h, 3, 5);
  const b = valueNoise(w, h, 17, 11);
  const hgt = new Float32Array(w * h);
  for (let i = 0; i < hgt.length; i++) hgt[i] = a[i] * 0.35 + b[i] * 0.65;
  return heightToNormal(hgt, w, h, 0.9);
}
function createGloveTextures() {
  const w = 512;
  const h = 512;
  const grain = valueNoise(w, h, 2, 21);
  const blotch = valueNoise(w, h, 24, 31);
  const hgt = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const weave = Math.sin(x * 0.9) * Math.sin(y * 0.9 + Math.floor(x / 3.5) % 2 * 1.6);
      const i = y * w + x;
      hgt[i] = weave * 0.35 + grain[i] * 0.5 + blotch[i] * 0.4;
    }
  }
  const normal = heightToNormal(hgt, w, h, 1.6);
  const [c, g] = canvas(w, h);
  const img = g.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const rough = 0.62 + 0.25 * grain[i] - 0.18 * blotch[i];
    img.data[i * 4] = 255;
    img.data[i * 4 + 1] = Math.max(0, Math.min(255, rough * 255));
    img.data[i * 4 + 2] = 0;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const roughness = new THREE2.CanvasTexture(c);
  roughness.wrapS = roughness.wrapT = THREE2.RepeatWrapping;
  roughness.colorSpace = THREE2.NoColorSpace;
  return { normal, roughness };
}
function createFabricTextures(base = [74, 78, 62], size = 512) {
  const w = size;
  const h = size;
  const grain = valueNoise(w, h, 2, 61);
  const slub = valueNoise(w, h, 9, 67);
  const blotch = valueNoise(w, h, 90, 71);
  const blotch2 = valueNoise(w, h, 37, 73);
  const cell = size / 10;
  const hgt = new Float32Array(w * h);
  const [c, g] = canvas(w, h);
  const img = g.createImageData(w, h);
  const [rc, rg] = canvas(w, h);
  const rimg = rg.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const tx = x / 2.6;
      const ty = y / 2.6;
      const over = (Math.floor(tx) + Math.floor(ty)) % 2 === 0;
      const threadX = Math.sin(tx % 1 * Math.PI);
      const threadY = Math.sin(ty % 1 * Math.PI);
      let hh = (over ? threadX : threadY) * 0.35 + grain[i] * 0.15 + slub[i] * 0.2;
      const gx = Math.min(x % cell, cell - x % cell);
      const gy = Math.min(y % cell, cell - y % cell);
      const rip = Math.max(Math.exp(-(gx * gx) / 2.2), Math.exp(-(gy * gy) / 2.2));
      hh += rip * 0.55;
      hgt[i] = hh;
      const fade = 1 + (blotch[i] - 0.5) * 0.16 + (blotch2[i] - 0.5) * 0.08;
      const tint = 1 + (slub[i] - 0.5) * 0.08 + rip * 0.05 + (over ? 0.02 : -0.02);
      const k = fade * tint;
      img.data[i * 4] = Math.min(255, base[0] * k);
      img.data[i * 4 + 1] = Math.min(255, base[1] * k);
      img.data[i * 4 + 2] = Math.min(255, base[2] * k * (1 - (blotch[i] - 0.5) * 0.04));
      img.data[i * 4 + 3] = 255;
      const rough = 0.82 + (blotch[i] - 0.5) * 0.1 - rip * 0.05;
      rimg.data[i * 4] = 255;
      rimg.data[i * 4 + 1] = Math.max(0, Math.min(255, rough * 255));
      rimg.data[i * 4 + 2] = 0;
      rimg.data[i * 4 + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  rg.putImageData(rimg, 0, 0);
  const map = new THREE2.CanvasTexture(c);
  map.colorSpace = THREE2.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE2.RepeatWrapping;
  map.anisotropy = 8;
  const roughnessMap = new THREE2.CanvasTexture(rc);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE2.RepeatWrapping;
  const normalMap = heightToNormal(hgt, w, h, 2.4);
  normalMap.anisotropy = 8;
  return { map, normalMap, roughnessMap };
}
function createKnitNormal(size = 256) {
  const w = size;
  const h = size;
  const n = valueNoise(w, h, 3, 83);
  const hgt = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const rib = Math.abs(Math.sin(y / h * Math.PI * 64));
      const knit2 = Math.abs(Math.sin(x / w * Math.PI * 96 + Math.sin(y / h * Math.PI * 128) * 0.6));
      hgt[y * w + x] = rib * 0.5 + knit2 * 0.25 + n[y * w + x] * 0.25;
    }
  const t = heightToNormal(hgt, w, h, 1.6);
  t.anisotropy = 8;
  return t;
}

// weapon/Arms.ts
var TAU = Math.PI * 2;
var RADIAL = 36;
var smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
var Spine = class {
  constructor() {
    __publicField(this, "pts", []);
    __publicField(this, "acc", []);
    __publicField(this, "n", 0);
  }
  get length() {
    return this.n ? this.acc[this.n - 1] : 0;
  }
  reset() {
    this.n = 0;
  }
  push(p) {
    if (this.pts.length <= this.n) this.pts.push(new THREE3.Vector3());
    this.pts[this.n].copy(p);
    this.acc[this.n] = this.n ? this.acc[this.n - 1] + p.distanceTo(this.pts[this.n - 1]) : 0;
    this.n++;
  }
  line(a, b, steps, skipFirst = true) {
    for (let i = skipFirst ? 1 : 0; i <= steps; i++) this.push(_t.lerpVectors(a, b, i / steps));
  }
  quad(a, c, b, steps) {
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      _t.set(0, 0, 0).addScaledVector(a, u * u).addScaledVector(c, 2 * u * t).addScaledVector(b, t * t);
      this.push(_t);
    }
  }
  /** Arc length at the vertex closest to `p`. */
  arcNear(p) {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < this.n; i++) {
      const d = this.pts[i].distanceToSquared(p);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return this.acc[best];
  }
  sample(s, outP, outT) {
    const n = this.n;
    if (s <= 0) {
      outT.subVectors(this.pts[1], this.pts[0]).normalize();
      return outP.copy(this.pts[0]).addScaledVector(outT, s);
    }
    if (s >= this.acc[n - 1]) {
      outT.subVectors(this.pts[n - 1], this.pts[n - 2]).normalize();
      return outP.copy(this.pts[n - 1]).addScaledVector(outT, s - this.acc[n - 1]);
    }
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const m = lo + hi >> 1;
      if (this.acc[m] < s) lo = m;
      else hi = m;
    }
    const t = (s - this.acc[lo]) / Math.max(1e-9, this.acc[hi] - this.acc[lo]);
    const a = this.pts[Math.max(0, lo - 1)];
    const b = this.pts[Math.min(n - 1, hi + 1)];
    outT.subVectors(b, a).normalize();
    return outP.lerpVectors(this.pts[lo], this.pts[hi], t);
  }
};
var Sweep = class {
  constructor(rings, material, uvScale, ringS) {
    this.rings = rings;
    __publicField(this, "geometry", new THREE3.BufferGeometry());
    __publicField(this, "mesh");
    __publicField(this, "pos");
    __publicField(this, "col");
    __publicField(this, "uv");
    const per = RADIAL + 1;
    this.pos = new Float32Array(rings * per * 3);
    this.col = new Float32Array(rings * per * 3).fill(1);
    const uv = this.uv = new Float32Array(rings * per * 2);
    for (let i = 0; i < rings; i++)
      for (let j = 0; j <= RADIAL; j++) {
        uv[(i * per + j) * 2] = j / RADIAL * uvScale.u;
        uv[(i * per + j) * 2 + 1] = ringS(i) * uvScale.v;
      }
    const idx = [];
    for (let i = 0; i < rings - 1; i++)
      for (let j = 0; j < RADIAL; j++) {
        const a = i * per + j;
        const b = a + 1;
        const c = a + per;
        const d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    this.geometry.setIndex(idx);
    this.geometry.setAttribute("position", new THREE3.BufferAttribute(this.pos, 3).setUsage(THREE3.DynamicDrawUsage));
    this.geometry.setAttribute("color", new THREE3.BufferAttribute(this.col, 3).setUsage(THREE3.DynamicDrawUsage));
    this.geometry.setAttribute("uv", new THREE3.BufferAttribute(uv, 2).setUsage(THREE3.DynamicDrawUsage));
    this.mesh = new THREE3.Mesh(this.geometry, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
  }
  commit() {
    const g = this.geometry;
    g.getAttribute("position").needsUpdate = true;
    g.getAttribute("color").needsUpdate = true;
    g.getAttribute("uv").needsUpdate = true;
    g.computeVertexNormals();
    const n = g.getAttribute("normal");
    const per = RADIAL + 1;
    for (let i = 0; i < this.rings; i++) {
      const a = i * per;
      const b = a + RADIAL;
      _t.set(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
      n.setXYZ(a, _t.x, _t.y, _t.z);
      n.setXYZ(b, _t.x, _t.y, _t.z);
    }
    n.needsUpdate = true;
  }
};
var _t = new THREE3.Vector3();
var _c = new THREE3.Vector3();
var _tan = new THREE3.Vector3();
var _A = new THREE3.Vector3();
var _B = new THREE3.Vector3();
var _q = new THREE3.Quaternion();
var _d = new THREE3.Vector3();
var SLEEVE_LAYOUT = { upper: 12, elbow: 34, fore: 9, cuff: 18, lip: 2 };
var SLEEVE_RINGS = SLEEVE_LAYOUT.upper + SLEEVE_LAYOUT.elbow + SLEEVE_LAYOUT.fore + SLEEVE_LAYOUT.cuff + SLEEVE_LAYOUT.lip;
var CUFF_RINGS = 26;
var Arm = class {
  constructor(side, look, upperLen, foreLen) {
    this.side = side;
    this.upperLen = upperLen;
    this.foreLen = foreLen;
    __publicField(this, "group", new THREE3.Group());
    __publicField(this, "elbow", new THREE3.Vector3());
    __publicField(this, "sleeve");
    __publicField(this, "cuff");
    __publicField(this, "spine", new Spine());
    __publicField(this, "sleeveTab");
    __publicField(this, "cuffTab");
    __publicField(this, "seed");
    /** Elbow bend (rad, 0 = straight), exposed for debugging. */
    __publicField(this, "bend", 0);
    this.seed = side === "right" ? 1.7 : 4.3;
    this.sleeve = new Sweep(SLEEVE_RINGS, look.sleeve, { u: 7, v: 1 }, () => 0);
    this.cuff = new Sweep(CUFF_RINGS, look.gloveCuff, { u: 4, v: 1 }, () => 0);
    this.sleeveTab = new THREE3.Mesh(new THREE3.BoxGeometry(0.03, 35e-4, 0.022, 3, 1, 2), look.sleeve);
    this.cuffTab = new THREE3.Mesh(new THREE3.BoxGeometry(0.022, 3e-3, 0.02, 3, 1, 2), look.glove);
    for (const m of [this.sleeveTab, this.cuffTab]) {
      m.castShadow = m.receiveShadow = true;
      m.frustumCulled = false;
    }
    this.group.add(this.sleeve.mesh, this.cuff.mesh, this.sleeveTab, this.cuffTab);
  }
  /**
   * All inputs in camera space. `hand` is the glove anchor (-Z distal, +Y dorsal, +X = `ulnarSign`
   * towards the little finger), `down` is world down.
   */
  update(shoulder, wrist, poleHint, hand, down, ulnarSign) {
    const a = this.upperLen;
    const b = this.foreLen;
    const S = shoulder.clone();
    const toW = new THREE3.Vector3().subVectors(wrist, S);
    let d = toW.length();
    const maxReach = a + b - 2e-3;
    if (d > maxReach) {
      S.addScaledVector(toW.normalize(), Math.min(d - maxReach, 0.09));
      toW.subVectors(wrist, S);
      d = toW.length();
    }
    d = THREE3.MathUtils.clamp(d, Math.abs(a - b) + 0.01, maxReach);
    const dir = toW.clone().normalize();
    const cosA = (a * a + d * d - b * b) / (2 * a * d);
    const proj = a * cosA;
    const h = Math.sqrt(Math.max(a * a - proj * proj, 0));
    const pole = poleHint.clone().addScaledVector(dir, -poleHint.dot(dir)).normalize();
    const E = this.elbow.copy(S).addScaledVector(dir, proj).addScaledVector(pole, h);
    const W = wrist;
    const dU = new THREE3.Vector3().subVectors(E, S).normalize();
    const dF = new THREE3.Vector3().subVectors(W, E).normalize();
    this.bend = Math.acos(THREE3.MathUtils.clamp(dU.dot(dF), -1, 1));
    hand.updateMatrix();
    const hX = new THREE3.Vector3().setFromMatrixColumn(hand.matrix, 0).normalize();
    const hY = new THREE3.Vector3().setFromMatrixColumn(hand.matrix, 1).normalize();
    const hZ = new THREE3.Vector3().setFromMatrixColumn(hand.matrix, 2).normalize();
    const hDist = hZ.clone().negate();
    const sp = this.spine;
    sp.reset();
    const lU = S.distanceTo(E);
    const lF = E.distanceTo(W);
    const rE = Math.min(0.065, lU * 0.35, lF * 0.35);
    const P1 = E.clone().addScaledVector(dU, -rE);
    const P2 = E.clone().addScaledVector(dF, rE);
    const rW = 0.022;
    const Wb = W.clone().addScaledVector(dF, -rW);
    const Wa = W.clone().addScaledVector(hDist, rW);
    sp.push(S);
    sp.line(S, P1, 14);
    sp.quad(P1, E, P2, 16);
    sp.line(P2, Wb, 20);
    sp.quad(Wb, W, Wa, 8);
    sp.line(Wa, W.clone().addScaledVector(hDist, 0.045), 4);
    const sE = sp.arcNear(E);
    const sW = sp.arcNear(W);
    const sHem = sW - 0.036;
    const inner = new THREE3.Vector3().subVectors(S.clone().add(W).multiplyScalar(0.5), E);
    if (inner.lengthSq() < 1e-8) inner.copy(pole).negate();
    inner.normalize();
    const bendK = smooth(0.25, 1.7, this.bend);
    const frameAt = /* @__PURE__ */ new Map();
    const ringsS = [];
    const pushRange = (s0, s1, count, inclusiveEnd = false) => {
      for (let i = 0; i < count; i++) ringsS.push(s0 + (s1 - s0) * i / (inclusiveEnd ? count - 1 : count));
    };
    const L = SLEEVE_LAYOUT;
    const e0 = Math.max(0.02, sE - 0.085);
    const e1 = Math.min(sHem - 0.1, sE + 0.085);
    const c0 = sHem - 0.075;
    pushRange(0, e0, L.upper);
    pushRange(e0, e1, L.elbow);
    pushRange(e1, c0, L.fore);
    pushRange(c0, sHem, L.cuff, true);
    const sleeveCount = ringsS.length;
    const g0 = sHem - 0.028;
    const g1 = sW + 0.03;
    for (let i = 0; i < CUFF_RINGS; i++) ringsS.push(g0 + (g1 - g0) * i / (CUFF_RINGS - 1));
    const order = ringsS.map((s, i) => [s, i]).sort((x, y) => x[0] - y[0]);
    let prevT = null;
    const N = new THREE3.Vector3();
    for (const [s] of order) {
      if (frameAt.has(s)) continue;
      const c = new THREE3.Vector3();
      const t = new THREE3.Vector3();
      sp.sample(s, c, t);
      if (!prevT) {
        N.copy(pole).addScaledVector(t, -pole.dot(t)).normalize();
      } else {
        _q.setFromUnitVectors(prevT, t);
        N.applyQuaternion(_q);
        N.addScaledVector(t, -N.dot(t)).normalize();
      }
      prevT = t.clone();
      frameAt.set(s, { n: N.clone(), t, c });
    }
    const fw = frameAt.get(order.reduce((best, cur) => Math.abs(cur[0] - sW) < Math.abs(best[0] - sW) ? cur : best)[0]);
    const wantB = hY.clone().addScaledVector(fw.t, -hY.dot(fw.t)).normalize();
    const bAtW = fw.n.clone();
    const twistW = Math.atan2(new THREE3.Vector3().crossVectors(bAtW, wantB).dot(fw.t), bAtW.dot(wantB));
    const twistAt = (s) => twistW * smooth(sE + 0.02, sW, s);
    const per = RADIAL + 1;
    const pos = this.sleeve.pos;
    const col = this.sleeve.col;
    const seed = this.seed;
    for (let i = 0; i < SLEEVE_RINGS; i++) {
      const isLip = i >= sleeveCount;
      const s = isLip ? sHem - 3e-3 * (i - sleeveCount + 1) : ringsS[i];
      const f = frameAt.get(isLip ? ringsS[sleeveCount - 1] : s) ?? frameAt.get(ringsS[sleeveCount - 1]);
      _c.copy(f.c);
      if (isLip) _c.addScaledVector(f.t, -3e-3 * (i - sleeveCount + 1));
      _tan.copy(f.t);
      _B.copy(f.n).applyAxisAngle(_tan, twistAt(s));
      _A.crossVectors(_B, _tan).normalize();
      const uU = s / Math.max(sE, 1e-3);
      const uF = (s - sE) / Math.max(sHem - sE, 1e-3);
      let ra;
      let rb;
      if (s < sE) {
        ra = THREE3.MathUtils.lerp(0.059, 0.053, uU);
        rb = THREE3.MathUtils.lerp(0.056, 0.05, uU);
      } else {
        const belly = Math.exp(-(((uF - 0.22) / 0.3) ** 2));
        ra = 0.052 - uF * 9e-3 + belly * 2e-3;
        rb = 0.049 - uF * 0.012 + belly * 2e-3;
      }
      const hem = smooth(sHem - 0.012, sHem, s);
      ra *= 1 + hem * 0.04;
      rb *= 1 + hem * 0.04;
      if (isLip) {
        const k = 1 - 0.07 * (i - sleeveCount + 1);
        ra *= k;
        rb *= k;
      }
      _d.copy(inner).addScaledVector(_tan, -inner.dot(_tan));
      const thIn = Math.atan2(_d.dot(_B), _d.dot(_A));
      _d.copy(down).addScaledVector(_tan, -down.dot(_tan));
      const thDown = Math.atan2(_d.dot(_B), _d.dot(_A));
      const dE = s - sE;
      const wE = Math.exp(-((dE / 0.075) ** 2));
      const wF = smooth(sE + 0.04, sE + 0.1, s) * (1 - smooth(sHem - 0.08, sHem - 0.04, s));
      const dC = sHem - s;
      const wC = 1 - smooth(0, 0.13, dC);
      const wUp = 1 - smooth(sE - 0.12, sE - 0.06, s);
      for (let j = 0; j <= RADIAL; j++) {
        const th = j / RADIAL * TAU;
        const ct = Math.cos(th);
        const st = Math.sin(th);
        const cIn = Math.cos(th - thIn);
        const inW = Math.max(0, cIn);
        const outW = Math.max(0, -cIn);
        let disp = 0;
        let ao = 0;
        if (!isLip) {
          const ph = dE / 0.021 * Math.PI + 1.3 * Math.sin(th * 1.7 + seed) + 0.6 * Math.sin(th * 3.1 - seed * 2);
          const crease = Math.abs(Math.sin(ph));
          const fold1 = (crease - 0.6) * 72e-4 * wE * inW ** 1.5 * bendK;
          disp += fold1 + 45e-4 * wE * inW * bendK + 22e-4 * wE * outW * bendK;
          ao += Math.max(0, -fold1) / 35e-4 * 0.35 + wE * inW * bendK * 0.22;
          const fold2 = 44e-4 * wF * Math.sin(th * 2 + dE * TAU / 0.12 + seed * 1.3) * (0.7 + 0.3 * Math.sin(s * TAU / 0.05 + th + seed));
          const cr = Math.sin(th * 3 + s * TAU / 0.037 + seed * 2.1) * Math.sin(th * 5 - s * TAU / 0.061 + seed);
          const fold2b = 29e-4 * (0.35 + 0.65 * wF + 0.5 * wUp) * (Math.abs(cr) - 0.35);
          disp += fold2 + fold2b;
          ao += Math.max(0, -fold2) / 44e-4 * 0.3 + Math.max(0, -fold2b) / 2e-3 * 0.22;
          const phC = s / 0.0155 * Math.PI + 0.9 * Math.sin(th * 2 + seed * 3) + 0.4 * Math.sin(th * 5 + seed);
          const fold3 = (Math.abs(Math.sin(phC)) - 0.55) * 76e-4 * wC + 26e-4 * wC;
          disp += fold3;
          ao += Math.max(0, 24e-4 * wC - fold3) / 3e-3 * 0.38;
          disp += 17e-4 * wUp * Math.sin(th * 3 + s * TAU / 0.2 + seed * 0.7);
          disp += 32e-4 * Math.max(0, Math.cos(th - thDown)) ** 2 * (1 - wC * 0.7);
          disp += 9e-4 * Math.sin(th * 5.3 + s * 61 + seed) * Math.sin(th * 2.2 - s * 37);
        }
        const k = (i * per + j) * 3;
        const rx = ra + disp;
        const ry = rb + disp;
        pos[k] = _c.x + _A.x * ct * rx + _B.x * st * ry;
        pos[k + 1] = _c.y + _A.y * ct * rx + _B.y * st * ry;
        pos[k + 2] = _c.z + _A.z * ct * rx + _B.z * st * ry;
        const lum = isLip ? 0.35 : 1 - Math.min(0.55, ao) - wC * 0.08;
        col[k] = col[k + 1] = col[k + 2] = lum;
        this.sleeve.uv[(i * per + j) * 2 + 1] = s / 0.05;
      }
      if (i === sleeveCount - 6) {
        const outAng = Math.atan2(ulnarSign * hX.dot(_B), ulnarSign * hX.dot(_A));
        const dirOut = _t.copy(_A).multiplyScalar(Math.cos(outAng)).addScaledVector(_B, Math.sin(outAng));
        this.sleeveTab.position.copy(_c).addScaledVector(dirOut, (ra + rb) * 0.5 + 4e-3);
        const m = new THREE3.Matrix4().makeBasis(_tan.clone().cross(dirOut).normalize(), dirOut.clone(), _tan.clone());
        this.sleeveTab.quaternion.setFromRotationMatrix(m);
      }
    }
    this.sleeve.commit();
    const cpos = this.cuff.pos;
    const ccol = this.cuff.col;
    for (let i = 0; i < CUFF_RINGS; i++) {
      const s = ringsS[sleeveCount + i];
      const f = frameAt.get(s);
      _c.copy(f.c);
      _tan.copy(f.t);
      _B.copy(f.n).applyAxisAngle(_tan, twistAt(s));
      const kH = smooth(sW - 0.01, sW + 0.015, s);
      if (kH > 0) _B.lerp(_d.copy(hY).addScaledVector(_tan, -hY.dot(_tan)).normalize(), kH).normalize();
      _A.crossVectors(_B, _tan).normalize();
      const u = (s - g0) / (sW - g0);
      let ra = THREE3.MathUtils.lerp(0.035, 0.0305, Math.min(1, u));
      let rb = THREE3.MathUtils.lerp(0.029, 0.0228, Math.min(1, u));
      if (s > sW) {
        const k2 = smooth(sW, g1, s);
        ra = THREE3.MathUtils.lerp(ra, 0.028, k2);
        rb = THREE3.MathUtils.lerp(rb, 0.019, k2);
      }
      const st0 = sW - 0.034;
      const st1 = sW - 0.012;
      const strap = smooth(st0 - 2e-3, st0 + 2e-3, s) * (1 - smooth(st1 - 2e-3, st1 + 2e-3, s));
      const edge = Math.exp(-(((s - st0) / 18e-4) ** 2)) + Math.exp(-(((s - st1) / 18e-4) ** 2));
      for (let j = 0; j <= RADIAL; j++) {
        const th = j / RADIAL * TAU;
        const ct = Math.cos(th);
        const sn = Math.sin(th);
        const disp = strap * 16e-4 + edge * 5e-4 + 6e-4 * Math.sin(th * 4 + s * 300) * (1 - strap);
        const k = (i * per + j) * 3;
        cpos[k] = _c.x + _A.x * ct * (ra + disp) + _B.x * sn * (rb + disp);
        cpos[k + 1] = _c.y + _A.y * ct * (ra + disp) + _B.y * sn * (rb + disp);
        cpos[k + 2] = _c.z + _A.z * ct * (ra + disp) + _B.z * sn * (rb + disp);
        const lum = (1 + strap * 0.35) * (1 - (1 - smooth(sHem - 4e-3, sHem + 0.01, s)) * 0.6);
        ccol[k] = ccol[k + 1] = ccol[k + 2] = lum;
        this.cuff.uv[(i * per + j) * 2 + 1] = s / 0.03;
      }
      if (i === Math.round((CUFF_RINGS - 1) * ((st0 + st1) / 2 - g0) / (g1 - g0))) {
        const dirOut = _t.copy(_B).multiplyScalar(0.85).addScaledVector(_A, 0.5 * ulnarSign * Math.sign(hX.dot(_A)) || 0.5).normalize();
        this.cuffTab.position.copy(_c).addScaledVector(dirOut, (ra + rb) * 0.5 + 25e-4);
        const m = new THREE3.Matrix4().makeBasis(_tan.clone().cross(dirOut).normalize(), dirOut.clone(), _tan.clone());
        this.cuffTab.quaternion.setFromRotationMatrix(m);
      }
    }
    this.cuff.commit();
  }
};
var sleeveTex = null;
var SLEEVE_COLORS = {
  ranger: ["Ranger Green", 3817522],
  black: ["\u0427\u0451\u0440\u043D\u044B\u0439", 2105118],
  navy: ["\u0422\u0451\u043C\u043D\u043E-\u0441\u0438\u043D\u0438\u0439 (\u043F\u043E\u043B\u0438\u0446\u0438\u044F)", 1975859],
  coyote: ["Coyote Brown", 6969667],
  grey: ["\u0421\u0435\u0440\u044B\u0439", 3948355]
};
var FABRIC_MID = 0.2158;
function setSleeveColor(m, key2) {
  const hex = (SLEEVE_COLORS[key2] ?? SLEEVE_COLORS.ranger)[1];
  m.color.set(hex).multiplyScalar(1 / FABRIC_MID);
  m.sheenColor.set(hex).multiplyScalar(0.9);
  m.userData.sleeveColor = key2 in SLEEVE_COLORS ? key2 : "ranger";
}
var knit = null;
function createJacketMaterial() {
  sleeveTex ?? (sleeveTex = createFabricTextures([128, 128, 128]));
  const m = new THREE3.MeshPhysicalMaterial({
    color: 16777215,
    map: sleeveTex.map,
    normalMap: sleeveTex.normalMap,
    normalScale: new THREE3.Vector2(0.8, 0.8),
    roughnessMap: sleeveTex.roughnessMap,
    roughness: 1,
    metalness: 0,
    sheen: 0.22,
    sheenRoughness: 0.8,
    vertexColors: true,
    side: THREE3.DoubleSide
  });
  setSleeveColor(m, "ranger");
  return m;
}
function createGloveCuffMaterial() {
  knit ?? (knit = createKnitNormal());
  knit.wrapS = knit.wrapT = THREE3.RepeatWrapping;
  return new THREE3.MeshPhysicalMaterial({
    color: 1710877,
    roughness: 0.72,
    metalness: 0,
    normalMap: knit,
    normalScale: new THREE3.Vector2(0.5, 0.5),
    sheen: 0.5,
    sheenRoughness: 0.5,
    sheenColor: new THREE3.Color(3948098),
    vertexColors: true
  });
}

// weapon/assets.ts

function setLayerRecursive(o, layer) {
  o.traverse((c) => c.layers.set(layer));
}

// weapon/GlovedHand.ts

var FINGER_JOINTS = {
  thumb: ["thumb-metacarpal", "thumb-phalanx-proximal", "thumb-phalanx-distal", "thumb-tip"],
  index: ["index-finger-metacarpal", "index-finger-phalanx-proximal", "index-finger-phalanx-intermediate", "index-finger-phalanx-distal", "index-finger-tip"],
  middle: ["middle-finger-metacarpal", "middle-finger-phalanx-proximal", "middle-finger-phalanx-intermediate", "middle-finger-phalanx-distal", "middle-finger-tip"],
  ring: ["ring-finger-metacarpal", "ring-finger-phalanx-proximal", "ring-finger-phalanx-intermediate", "ring-finger-phalanx-distal", "ring-finger-tip"],
  pinky: ["pinky-finger-metacarpal", "pinky-finger-phalanx-proximal", "pinky-finger-phalanx-intermediate", "pinky-finger-phalanx-distal", "pinky-finger-tip"]
};
var _q2 = new THREE4.Quaternion();
var _q22 = new THREE4.Quaternion();
var _v = new THREE4.Vector3();
var AX = new THREE4.Vector3(1, 0, 0);
var AY = new THREE4.Vector3(0, 1, 0);
function lerpPose(a, b, t, out) {
  for (const f of Object.keys(a)) for (let i = 0; i < 5; i++) out[f][i] = a[f][i] + (b[f][i] - a[f][i]) * t;
  return out;
}
function clonePose(p) {
  return {
    thumb: [...p.thumb],
    index: [...p.index],
    middle: [...p.middle],
    ring: [...p.ring],
    pinky: [...p.pinky]
  };
}
var gloveTex = null;
function createGloveMaterial() {
  gloveTex ?? (gloveTex = createGloveTextures());
  gloveTex.normal.repeat.set(3, 3);
  gloveTex.roughness.repeat.set(3, 3);
  const m = new THREE4.MeshPhysicalMaterial({
    color: 1842206,
    roughness: 0.8,
    metalness: 0,
    normalMap: gloveTex.normal,
    normalScale: new THREE4.Vector2(0.4, 0.4),
    roughnessMap: gloveTex.roughness,
    sheen: 0.28,
    sheenRoughness: 0.6,
    sheenColor: new THREE4.Color(2895152)
  });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace("#include <skinning_vertex>", "#include <skinning_vertex>\n transformed += normalize(objectNormal) * 0.0017;");
  };
  return m;
}
var GLOVE_PARS = (
  /* glsl */
  `
varying vec3 vRest;
varying vec3 vRestN;
uniform vec3 uJ[24];
uniform vec3 uFD[5];
uniform vec3 uHandD;
float gHeight = 0.0;
float gRough = 0.8;
float gSmooth = 0.0;

float gSeg(vec3 p, vec3 a, vec3 b, out float t) {
  vec3 ab = b - a;
  t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-9), 0.0, 1.0);
  return length(p - (a + ab * t));
}
// Bump mapping of an unparametrised surface (Mikkelsen 2010); h in metres.
vec3 gloveBump(vec3 pos, vec3 n, float h) {
  vec3 dpx = dFdx(pos);
  vec3 dpy = dFdy(pos);
  vec3 r1 = cross(dpy, n);
  vec3 r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * n - grad);
}
`
);
var GLOVE_COLOR = (
  /* glsl */
  `
{
  vec3 p = vRest;
  vec3 nr = normalize(vRestN);
  float best = 1e3; int bf = 0; int bs = 0; float bt = 0.0; float segLen = 0.01;
  for (int s = 0; s < 3; s++) {
    float t; float d = gSeg(p, uJ[s], uJ[s + 1], t);
    if (d < best) { best = d; bf = 0; bs = s == 2 ? 3 : s; bt = t; segLen = length(uJ[s + 1] - uJ[s]); }
  }
  for (int k = 0; k < 4; k++) {
    int b0 = 4 + k * 5;
    for (int s = 0; s < 4; s++) {
      float t; float d = gSeg(p, uJ[b0 + s], uJ[b0 + s + 1], t);
      if (d < best) { best = d; bf = k + 1; bs = s; bt = t; segLen = length(uJ[b0 + s + 1] - uJ[b0 + s]); }
    }
  }
  vec3 D = (bs == 0 && bf != 0) ? uHandD : uFD[bf];
  float nd = dot(nr, D);
  float ndH = dot(nr, uHandD);
  float dors = smoothstep(0.1, 0.5, nd);
  float palm = smoothstep(-0.05, -0.4, nd);
  float sideBand = (bs >= 1) ? 1.0 - smoothstep(0.05, 0.16, abs(nd - 0.02)) : 0.0;

  // Knuckle guard over the MCP joints.
  float band = 1e3;
  for (int k = 0; k < 3; k++) { float t; band = min(band, gSeg(p, uJ[5 + k * 5], uJ[10 + k * 5], t)); }
  float dome = 0.0;
  for (int k = 0; k < 4; k++) dome = max(dome, 1.0 - smoothstep(0.0118, 0.0148, length(p - uJ[5 + k * 5])));
  float guard = max(dome, (1.0 - smoothstep(0.0128, 0.0152, band)) * 0.72) * smoothstep(0.15, 0.5, ndH);
  // Pads on the proximal / middle phalanges.
  float pad = (bf > 0 && (bs == 1 || bs == 2)) ? dors * (1.0 - smoothstep(0.26, 0.4, abs(bt - 0.52))) : 0.0;
  pad *= 1.0 - guard;
  // Side seams with stitches (3.2 mm pitch).
  float along = bt * segLen;
  float stitch = sideBand * step(0.5, fract(along / 0.0032 + float(bf) * 0.37));
  // Reinforced palm heel between thumb and index (the "saddle").
  float saddle = palm * (bf <= 1 ? 1.0 : 0.0) * (bs == 0 ? 1.0 : 0.0);

  gHeight = guard * 0.0017 + pad * 0.0009 - sideBand * 0.00028 + saddle * 0.0005;
  vec3 cFabric = vec3(0.021, 0.021, 0.022);
  vec3 cGuard = vec3(0.04, 0.04, 0.043);
  vec3 cPalm = vec3(0.046, 0.041, 0.035);
  vec3 cTip = vec3(0.034, 0.032, 0.03);
  vec3 cStitch = vec3(0.11, 0.11, 0.105);
  vec3 c = mix(cFabric, cPalm, palm);
  c = mix(c, cTip, palm * (bs == 3 ? 1.0 : 0.0));
  c = mix(c, cPalm * 0.8, saddle);
  c = mix(c, cGuard * (0.85 + 0.3 * guard), max(guard, pad));
  c = mix(c, cStitch, stitch * 0.85);
  diffuseColor.rgb = c;
  gRough = mix(0.8, 0.46, max(guard, pad));
  gRough = mix(gRough, 0.93, palm * (1.0 - guard));
  gSmooth = max(guard, pad);
}
`
);
function createGloveDetailMaterial(base, rest) {
  const m = base.clone();
  m.color.set(16777215);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uJ = { value: rest.joints };
    shader.uniforms.uFD = { value: rest.fingerDorsal };
    shader.uniforms.uHandD = { value: rest.handDorsal };
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vRest;\nvarying vec3 vRestN;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvRest = position;\nvRestN = normal;").replace("#include <skinning_vertex>", "#include <skinning_vertex>\n transformed += normalize(objectNormal) * 0.0017;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\n" + GLOVE_PARS).replace("#include <color_fragment>", "#include <color_fragment>\n" + GLOVE_COLOR).replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = gRough * mix(1.0, roughnessFactor / max(roughness, 1e-3), 0.5);").replace(
      "#include <normal_fragment_maps>",
      "#include <normal_fragment_maps>\nnormal = normalize(mix(normal, nonPerturbedNormal, gSmooth * 0.85));\nnormal = gloveBump(-vViewPosition, normal, gHeight);"
    );
  };
  m.customProgramCacheKey = () => "glove-detail-v1";
  return m;
}
var GlovedHand = class {
  constructor(gltf, side, baseMaterial) {
    this.side = side;
    __publicField(this, "anchor", new THREE4.Group());
    __publicField(this, "pose");
    __publicField(this, "joints", /* @__PURE__ */ new Map());
    __publicField(this, "wrist");
    /** +1 if the anchor's +X points to the little finger. */
    __publicField(this, "ulnarSign");
    __publicField(this, "material");
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);
    const armature = scene.getObjectByName("Armature") ?? scene;
    this.wrist = armature.getObjectByName("wrist");
    const restWrist = new THREE4.Matrix4().compose(this.wrist.position, this.wrist.quaternion, this.wrist.scale);
    const parentOf = (name) => {
      for (const f of Object.keys(FINGER_JOINTS)) {
        const chain = FINGER_JOINTS[f];
        const i = chain.indexOf(name);
        if (i === 0) return "wrist";
        if (i > 0) return chain[i - 1];
      }
      return "";
    };
    for (const f of Object.keys(FINGER_JOINTS)) {
      for (const name of FINGER_JOINTS[f]) {
        const bone = armature.getObjectByName(name);
        const parent = armature.getObjectByName(parentOf(name));
        const invPQ = parent.quaternion.clone().invert();
        this.joints.set(name, {
          bone,
          localPos: bone.position.clone().sub(parent.position).applyQuaternion(invPQ),
          localQuat: invPQ.multiply(bone.quaternion.clone())
        });
      }
    }
    const holder = new THREE4.Group();
    holder.matrixAutoUpdate = false;
    holder.matrix.copy(restWrist).invert();
    holder.add(armature);
    this.anchor.add(holder);
    this.anchor.scale.setScalar(1.05);
    let skinned = null;
    armature.traverse((o) => {
      if (o.isSkinnedMesh) skinned = o;
    });
    const sk = skinned.skeleton;
    const bind = (name) => {
      const i = sk.bones.findIndex((b) => b.name === name);
      return sk.boneInverses[i].clone().invert();
    };
    const order = ["thumb", "index", "middle", "ring", "pinky"];
    const rest = {
      joints: order.flatMap((f) => FINGER_JOINTS[f].map((n) => new THREE4.Vector3().setFromMatrixPosition(bind(n)))),
      fingerDorsal: order.map((f) => new THREE4.Vector3(0, 1, 0).applyQuaternion(new THREE4.Quaternion().setFromRotationMatrix(bind(FINGER_JOINTS[f][1])))),
      handDorsal: new THREE4.Vector3(0, 1, 0).applyQuaternion(new THREE4.Quaternion().setFromRotationMatrix(bind("wrist")))
    };
    this.material = createGloveDetailMaterial(baseMaterial, rest);
    const pinkyLocal = new THREE4.Vector3().setFromMatrixPosition(bind("pinky-finger-metacarpal")).applyMatrix4(new THREE4.Matrix4().copy(restWrist).invert());
    this.ulnarSign = Math.sign(pinkyLocal.x) || 1;
    const material = this.material;
    armature.traverse((o) => {
      const mesh = o;
      if (mesh.isMesh) {
        mesh.material = material;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
      }
    });
    this.pose = clonePose(OPEN_POSE);
    this.apply();
  }
  /** FK: rebuild every joint from the chain rest pose + flex/spread. */
  apply(pose = this.pose) {
    const wq = this.wrist.quaternion;
    const wp = this.wrist.position;
    for (const f of Object.keys(FINGER_JOINTS)) {
      const chain = FINGER_JOINTS[f];
      const p = pose[f];
      const pq = _q2.copy(wq);
      const pp = _v.copy(wp);
      for (let i = 0; i < chain.length; i++) {
        const j = this.joints.get(chain[i]);
        const pos = j.localPos.clone().applyQuaternion(pq).add(pp);
        const q = pq.clone().multiply(j.localQuat);
        if (f === "thumb") {
          if (i === 0) q.multiply(_q22.setFromAxisAngle(AY, p[4])).multiply(_q22.setFromAxisAngle(AX, -p[0]));
          else if (i === 1) q.multiply(_q22.setFromAxisAngle(AX, -p[1]));
          else if (i === 2) q.multiply(_q22.setFromAxisAngle(AX, -p[2]));
        } else {
          if (i === 0) q.multiply(_q22.setFromAxisAngle(AX, -p[0]));
          else if (i === 1) q.multiply(_q22.setFromAxisAngle(AY, p[4])).multiply(_q22.setFromAxisAngle(AX, -p[1]));
          else if (i === 2) q.multiply(_q22.setFromAxisAngle(AX, -p[2]));
          else if (i === 3) q.multiply(_q22.setFromAxisAngle(AX, -p[3]));
        }
        j.bone.position.copy(pos);
        j.bone.quaternion.copy(q);
        pq.copy(q);
        pp.copy(pos);
      }
    }
  }
  setPose(pose) {
    for (const f of Object.keys(pose)) for (let i = 0; i < 5; i++) this.pose[f][i] = pose[f][i];
    this.apply();
  }
  jointWorld(name, out) {
    const j = this.joints.get(name);
    return j ? j.bone.getWorldPosition(out) : out.set(0, 0, 0);
  }
};
var OPEN_POSE = {
  thumb: [0, 0, 0, 0, 0],
  index: [0, 0, 0, 0, 0],
  middle: [0, 0, 0, 0, 0],
  ring: [0, 0, 0, 0, 0],
  pinky: [0, 0, 0, 0, 0]
};

// weapon/specs.ts

function gripMatrix(pos, distal, dorsal) {
  const z = new THREE5.Vector3(...distal).normalize().negate();
  const y = new THREE5.Vector3(...dorsal);
  y.addScaledVector(z, -y.dot(z)).normalize();
  const x = new THREE5.Vector3().crossVectors(y, z);
  return new THREE5.Matrix4().makeBasis(x, y, z).setPosition(...pos);
}
var P = (t, i, m, r, p) => ({
  thumb: t,
  index: i,
  middle: m,
  ring: r,
  pinky: p
});
var translate = (x, y, z, m) => new THREE5.Matrix4().makeTranslation(x, y, z).multiply(m);
var magInHand = (distal) => new THREE5.Matrix4().compose(
  new THREE5.Vector3(4e-3, -0.031, -distal),
  new THREE5.Quaternion().setFromRotationMatrix(new THREE5.Matrix4().makeBasis(new THREE5.Vector3(0, 1, 0), new THREE5.Vector3(0, 0, -1), new THREE5.Vector3(-1, 0, 0))),
  new THREE5.Vector3(1, 1, 1)
);
var pouch = (pos, rot) => new THREE5.Matrix4().compose(new THREE5.Vector3(...pos), new THREE5.Quaternion().setFromEuler(new THREE5.Euler(...rot)), new THREE5.Vector3(1, 1, 1));
var LEFT_OPEN = P([0.2, 0.1, 0.1, 0, 0], [0, 0.35, 0.35, 0.15, 0], [0, 0.4, 0.4, 0.15, 0], [0, 0.45, 0.4, 0.15, 0], [0, 0.5, 0.4, 0.15, 0]);
function withFumble(track, delay = 0.22) {
  const pre = track.left.find((k) => k.at === "mag");
  if (!pre?.mag) return track;
  const t0 = pre.t;
  const shift = (k) => k.t > t0 + 1e-3 ? { ...k, t: k.t + delay } : k;
  const [dy, dz, tilt] = pre.mag;
  const bumpT = t0 + delay * 0.45;
  const left = [];
  for (const k of track.left) {
    left.push(shift(k));
    if (k === pre) {
      left.push({ t: bumpT, at: "mag", mag: [dy * 0.55, dz * 0.6 + 8e-3, tilt * 0.55 + 0.1], pose: k.pose });
      left.push({ t: t0 + delay * 0.8, at: "mag", mag: [dy * 0.85, dz * 0.9, tilt * 0.9], pose: k.pose });
    }
  }
  const keys = (ks) => ks.map(([t, v]) => [t > t0 + 1e-3 ? t + delay : t, v]);
  return {
    duration: track.duration + delay,
    gunPos: keys(track.gunPos),
    gunRot: keys(track.gunRot),
    left,
    events: [...track.events.map(([t, e]) => [t > t0 + 1e-3 ? t + delay : t, e]), [bumpT, "bump"]],
    magRelease: track.magRelease
  };
}

// weapon/Timeline.ts
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
function sampleScalar(keys, time) {
  if (time <= keys[0][0]) return keys[0][1];
  const n = keys.length;
  if (time >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0;
  while (i < n - 2 && time > keys[i + 1][0]) i++;
  const k0 = keys[Math.max(0, i - 1)];
  const k1 = keys[i];
  const k2 = keys[i + 1];
  const k3 = keys[Math.min(n - 1, i + 2)];
  const t = (time - k1[0]) / (k2[0] - k1[0]);
  return catmull(k0[1], k1[1], k2[1], k3[1], t);
}
function sampleVec(keys, time, out) {
  for (let c = 0; c < 3; c++) out[c] = sampleScalar(keys.map(([t, v]) => [t, v[c]]), time);
  return out;
}
function crossed(t0, t1, at) {
  return t0 < at && t1 >= at;
}

// weapon/WeaponRig.ts
var ONE = new THREE6.Vector3(1, 1, 1);
var _m = new THREE6.Matrix4();
var _m2 = new THREE6.Matrix4();
var _v2 = new THREE6.Vector3();
var _s = new THREE6.Vector3();
function springPeak(f, z) {
  const w = 2 * Math.PI * f;
  const zz = Math.min(z, 0.95);
  const wd = w * Math.sqrt(1 - zz * zz);
  const t = Math.atan2(wd, zz * w) / wd;
  return Math.exp(-zz * w * t) * Math.sin(wd * t) / wd;
}
function poseVec(p, out, rot) {
  out.fromArray(p.pos);
  rot.set(p.rot[0] * DEG, p.rot[1] * DEG, p.rot[2] * DEG);
}
var WeaponRig = class {
  constructor(assets, specs) {
    this.specs = specs;
    __publicField(this, "root", new THREE6.Group());
    __publicField(this, "right");
    __publicField(this, "left");
    __publicField(this, "armR");
    __publicField(this, "armL");
    __publicField(this, "flashlight");
    __publicField(this, "events", {});
    __publicField(this, "index", 0);
    __publicField(this, "reloading", false);
    __publicField(this, "lightOn", false);
    __publicField(this, "fireMode", "auto");
    __publicField(this, "stress", 0);
    /** 0..1 tuck against walls. */
    __publicField(this, "tuck", 0);
    __publicField(this, "states");
    __publicField(this, "basePos", new SecondOrderVec3(3.4, 0.78, 0));
    __publicField(this, "baseRot", new SecondOrderVec3(3.4, 0.78, 0));
    __publicField(this, "aimYaw", new SecondOrder(3.4, 0.55, 0.15));
    __publicField(this, "aimPitch", new SecondOrder(3.4, 0.55, 0.15));
    __publicField(this, "lagRoll", 0);
    __publicField(this, "rBack", new ImpulseSpring(1, 1));
    __publicField(this, "rUp", new ImpulseSpring(1, 1));
    __publicField(this, "rPitch", new ImpulseSpring(1, 1));
    __publicField(this, "rYaw", new ImpulseSpring(1, 1));
    __publicField(this, "rRoll", new ImpulseSpring(1, 1));
    __publicField(this, "landY", new ImpulseSpring(160, 13));
    /** Aim climb the shooter still has to pull back down (rad). */
    __publicField(this, "climbDebt", new THREE6.Vector2());
    __publicField(this, "player", null);
    __publicField(this, "slideTimer", 1);
    __publicField(this, "triggerT", 0);
    __publicField(this, "triggerFinger", 0);
    /** Grip squeeze (0..1): hands clamp down as the gun recoils, then relax. */
    __publicField(this, "squeeze", 0);
    __publicField(this, "supportPose");
    __publicField(this, "cooldown", 0);
    /** A press that arrived while the action was still cycling fires as soon as it can. */
    __publicField(this, "queuedPress", 0);
    __publicField(this, "sinceShot", 10);
    __publicField(this, "shellPending", -1);
    __publicField(this, "reloadT", 0);
    __publicField(this, "reloadSpeed", 1);
    __publicField(this, "track");
    __publicField(this, "fumbled", false);
    __publicField(this, "sleeveMaterial", createJacketMaterial());
    /** Reload offsets run through springs: follow-through and settle instead of robotic keys. */
    __publicField(this, "relPosF", new SecondOrderVec3(4.2, 0.55, 0.15));
    __publicField(this, "relRotF", new SecondOrderVec3(3.6, 0.5, 0.1));
    __publicField(this, "magState", "gun");
    __publicField(this, "switchPhase", "none");
    __publicField(this, "switchT", 0);
    __publicField(this, "pending", 0);
    __publicField(this, "lowerW", 0);
    __publicField(this, "adsAmount", 0);
    __publicField(this, "time", 0);
    __publicField(this, "gunMatrix", new THREE6.Matrix4());
    __publicField(this, "prevMuzzle", new THREE6.Vector3());
    __publicField(this, "muzzleVelocity", new THREE6.Vector3());
    __publicField(this, "rightPose");
    __publicField(this, "leftPose");
    const glove = createGloveMaterial();
    this.right = new GlovedHand(assets.right, "right", glove);
    this.left = new GlovedHand(assets.left, "left", glove);
    const B = CONFIG.body;
    const look = { sleeve: this.sleeveMaterial, gloveCuff: createGloveCuffMaterial(), glove };
    this.armR = new Arm("right", look, B.upperArm, B.forearm);
    this.armL = new Arm("left", look, B.upperArm, B.forearm);
    this.rightPose = clonePose(specs[0].hands.indexed);
    this.leftPose = clonePose(specs[0].hands.support);
    this.states = specs.map((s) => ({ mag: s.tuning.magSize, chambered: true, locked: false }));
    for (const s of specs) {
      s.model.root.matrixAutoUpdate = false;
      s.model.root.visible = false;
      this.root.add(s.model.root);
    }
    this.root.add(this.right.anchor, this.left.anchor, this.armR.group, this.armL.group);
    setLayerRecursive(this.root, LAYER_VIEW);
    this.flashlight = new THREE6.SpotLight(16774373, 0, 34, 0.42, 0.55, 1.4);
    this.flashlight.castShadow = CONFIG.quality.shadows;
    this.flashlight.shadow.mapSize.set(1024, 1024);
    this.flashlight.shadow.bias = -3e-4;
    this.flashlight.shadow.normalBias = 0.02;
    this.flashlight.shadow.camera.near = 0.1;
    this.flashlight.shadow.camera.layers.enableAll();
    this.flashlight.layers.enableAll();
    this.flashlight.position.set(0, 0, 0);
    this.flashlight.target.position.set(0, -0.02, -6);
    this.activate(0);
  }
  get spec() {
    return this.specs[this.index];
  }
  get gun() {
    return this.spec.model;
  }
  get ammo() {
    return this.states[this.index].mag;
  }
  get chambered() {
    return this.states[this.index].chambered;
  }
  get slideLocked() {
    return this.states[this.index].locked;
  }
  get switching() {
    return this.switchPhase !== "none";
  }
  activate(i) {
    this.specs.forEach((s, k) => s.model.root.visible = k === i);
    this.index = i;
    this.gun.lightMount.add(this.flashlight, this.flashlight.target);
    this.gun.setSelector?.(this.fireMode);
  }
  /** Instant selection (no holster animation). */
  select(i) {
    if (i < 0 || i >= this.specs.length || this.reloading) return;
    this.activate(i);
    this.switchPhase = "none";
    this.lowerW = 0;
  }
  switchTo(i) {
    if (i < 0 || i >= this.specs.length || this.reloading) return;
    if (this.switchPhase === "none" && i === this.index) return;
    this.pending = i;
    if (this.switchPhase === "none") {
      this.switchPhase = "lower";
      this.switchT = 0;
      this.events.sound?.("switch", this.spec.id);
    }
  }
  cycle(dir) {
    const n = this.specs.length;
    this.switchTo((((this.switchPhase === "none" ? this.index : this.pending) + dir) % n + n) % n);
  }
  toggleFireMode() {
    if (!this.spec.tuning.auto) return;
    this.fireMode = this.fireMode === "auto" ? "semi" : "auto";
    this.gun.setSelector?.(this.fireMode);
    this.events.sound?.("selector", this.spec.id);
  }
  toggleLight() {
    this.lightOn = !this.lightOn;
    this.events.sound?.("light", this.spec.id);
  }
  land(impact) {
    this.landY.kick(-clamp(impact / 5, 0.1, 1.2) * 0.9);
  }
  /** Called every frame while the trigger is held; `pressed` on the first frame. */
  pullTrigger(pressed = true) {
    if (this.reloading || this.switchPhase !== "none") return false;
    const st = this.states[this.index];
    const T = this.spec.tuning;
    if (!st.chambered || st.locked) {
      if (pressed && this.cooldown <= 0) {
        this.events.sound?.("dryFire", this.spec.id);
        this.cooldown = 0.25;
        this.triggerT = 1;
      }
      return false;
    }
    if (this.cooldown > 0) {
      if (pressed) this.queuedPress = 0.12;
      return false;
    }
    if (!pressed && !(T.auto && this.fireMode === "auto")) return false;
    this.queuedPress = 0;
    this.cooldown = T.fireInterval;
    this.sinceShot = 0;
    this.triggerT = 1;
    this.triggerFinger = 1;
    this.squeeze = 1;
    if (st.mag > 0) st.mag--;
    else {
      st.chambered = false;
      st.locked = true;
    }
    this.slideTimer = 0;
    this.shellPending = 0.012;
    const R = T.recoil;
    const k = lerp(1, R.adsScale, this.adsAmount) * (1 + this.stress * 0.25);
    this.configureRecoil();
    const pb = springPeak(R.fBack, R.zBack);
    const pr = springPeak(R.f, R.z);
    this.rBack.kick(R.kickBack * k / pb * rand(0.9, 1.1));
    this.rUp.kick(R.kickUp * k / pb * rand(0.8, 1.2));
    this.rPitch.kick(R.pitchDeg * DEG * k / pr * rand(0.85, 1.15));
    this.rYaw.kick(R.yawDeg * DEG * k / pr * rand(-1, 1));
    this.rRoll.kick(R.rollDeg * DEG * k / pr * rand(-0.4, 1));
    if (this.player) {
      const cp = R.climbDeg * DEG * k * rand(0.8, 1.2);
      const cy = R.climbYawDeg * DEG * k * rand(-1, 1);
      this.player.aimPitch += cp;
      this.player.aimYaw += cy;
      this.climbDebt.x += cp * R.recoverFraction;
      this.climbDebt.y += cy * R.recoverFraction;
    }
    this.stress = clamp(this.stress + (T.auto ? 0.1 : 0.22), 0, 1);
    this.root.updateMatrixWorld(true);
    const muzzle = this.gun.muzzle.getWorldPosition(new THREE6.Vector3());
    const dir = new THREE6.Vector3(0, 0, -1).transformDirection(this.gun.root.matrixWorld);
    this.events.fire?.(muzzle, dir, this.spec);
    return true;
  }
  startReload() {
    if (this.reloading || this.switchPhase !== "none") return;
    const st = this.states[this.index];
    if (st.mag >= this.spec.tuning.magSize && !st.locked) return;
    this.reloading = true;
    this.reloadT = 0;
    this.track = st.locked ? this.spec.empty : this.spec.tactical;
    if (Math.random() < 0.12 + this.stress * 0.35) this.track = withFumble(this.track);
    this.fumbled = this.track.events.some(([, e]) => e === "bump");
    this.reloadSpeed = rand(0.93, 1.07) * (1 + this.stress * 0.12);
  }
  configureRecoil() {
    const R = this.spec.tuning.recoil;
    const set = (s, f, z) => {
      const w = 2 * Math.PI * f;
      s.stiffness = w * w;
      s.damping = 2 * z * w;
    };
    set(this.rBack, R.fBack, R.zBack);
    set(this.rUp, R.fBack * 0.8, R.zBack);
    set(this.rPitch, R.f, R.z);
    set(this.rYaw, R.f * 0.9, R.z);
    set(this.rRoll, R.f * 0.8, R.z * 0.9);
  }
  update(dt, player, rig, level, input) {
    const spec = this.spec;
    const T = spec.tuning;
    this.player = player;
    this.time += dt;
    this.cooldown -= dt;
    this.sinceShot += dt;
    if (this.queuedPress > 0) {
      this.queuedPress -= dt;
      if (this.cooldown <= 0) this.pullTrigger(true);
    }
    this.stress = Math.max(0, this.stress - dt * 0.12);
    this.updateSwitch(dt);
    this.adsAmount = this.reloading || this.switchPhase !== "none" ? damp(this.adsAmount, 0, 8, dt) : player.ads;
    const ads = this.adsAmount;
    const pos = new THREE6.Vector3();
    const rot = new THREE6.Vector3();
    const p2 = new THREE6.Vector3();
    const r2 = new THREE6.Vector3();
    poseVec(T.poses.hip, pos, rot);
    poseVec(T.poses.ads, p2, r2);
    const adsE = easeInOut(ads);
    pos.lerp(p2, adsE);
    rot.lerp(r2, adsE);
    const sprintW = player.sprint * (this.reloading ? 0.3 : 1);
    poseVec(T.poses.sprint, p2, r2);
    pos.lerp(p2, sprintW);
    rot.lerp(r2, sprintW);
    const camPos = rig.camera.getWorldPosition(new THREE6.Vector3());
    const aimDir = new THREE6.Vector3(0, 0, -1).applyEuler(new THREE6.Euler(player.aimPitch, player.aimYaw, 0, "YXZ"));
    const hit = level.raycast(camPos, aimDir, T.tuckDistance + 0.4);
    const tuckTarget = hit ? smoothstep(T.tuckDistance, T.tuckDistance * 0.45, hit.distance) : 0;
    this.tuck = damp(this.tuck, tuckTarget, 10, dt);
    poseVec(T.poses.wallTuck, p2, r2);
    pos.lerp(p2, this.tuck);
    rot.lerp(r2, this.tuck);
    pos.add(new THREE6.Vector3(0.03, -0.3, 0.1).multiplyScalar(this.lowerW));
    rot.add(new THREE6.Vector3(-60 * DEG, 15 * DEG, 20 * DEG).multiplyScalar(this.lowerW));
    const bp = this.basePos.update(dt, pos);
    const br = this.baseRot.update(dt, rot);
    const S = T.sway;
    this.aimYaw.set(S.f, S.z, 0.15);
    this.aimPitch.set(S.f, S.z, 0.15);
    const lagYaw = clamp(-rig.yawRate * S.yawGain, -S.maxYawDeg * DEG, S.maxYawDeg * DEG) * (1 - ads * 0.6);
    const lagPitch = clamp(-rig.pitchRate * S.pitchGain, -S.maxPitchDeg * DEG, S.maxPitchDeg * DEG) * (1 - ads * 0.6);
    const offYaw = this.aimYaw.update(dt, player.offsetYaw + lagYaw);
    const offPitch = this.aimPitch.update(dt, player.offsetPitch + lagPitch);
    this.lagRoll = damp(this.lagRoll, clamp(this.aimYaw.yd * S.tiltGain * 0.1, -S.tiltMaxDeg * DEG, S.tiltMaxDeg * DEG), 10, dt);
    const B = T.bob;
    const runW = clamp(player.moveBlend - 1, 0, 1);
    const moveW = player.grounded ? clamp(player.speed / 0.6, 0, 1) : 0;
    const bobScale = moveW * lerp(1, B.adsScale, ads);
    const bx = lerp(B.walk.x, B.run.x, runW) * bobScale;
    const by = lerp(B.walk.y, B.run.y, runW) * bobScale;
    const broll = lerp(B.walk.roll, B.run.roll, runW) * DEG * bobScale;
    const bpitch = lerp(B.walk.pitch, B.run.pitch, runW) * DEG * bobScale;
    const ph = player.stepPhase;
    const stab = lerp(0.35, 0.72, ads);
    const breath = rig.breath;
    const tremorAmp = (0.12 + this.stress * 0.35 + player.fatigue * 0.3) * DEG;
    const tr = this.time * 1.7;
    const bobPos = new THREE6.Vector3(Math.sin(ph) * bx, -Math.cos(2 * ph) * by + breath * 12e-4 + this.landY.update(dt) * 0.03, 0);
    bobPos.addScaledVector(rig.bobPos, -stab);
    const bobRot = new THREE6.Vector3(
      Math.cos(2 * ph) * bpitch + fbm1(tr + 3.3) * tremorAmp - rig.bobRot.x * stab * 0.8,
      fbm1(tr + 9.1) * tremorAmp - rig.bobRot.y * stab * 0.8,
      Math.sin(ph) * broll + fbm1(tr + 17.7) * tremorAmp * 0.6 - rig.bobRot.z * stab * 0.6
    );
    const R = T.recoil;
    this.configureRecoil();
    const rb = this.rBack.update(dt);
    const ru = this.rUp.update(dt);
    const rp = this.rPitch.update(dt);
    const ry = this.rYaw.update(dt);
    const rr = this.rRoll.update(dt);
    if (this.sinceShot > R.recoverDelay && this.climbDebt.lengthSq() > 1e-10) {
      const r = 1 - Math.exp(-R.recoverRate * dt);
      player.aimPitch -= this.climbDebt.x * r;
      player.aimYaw -= this.climbDebt.y * r;
      this.climbDebt.multiplyScalar(1 - r);
    }
    const relPos = [0, 0, 0];
    const relRot = [0, 0, 0];
    const prevT = this.reloadT;
    if (this.reloading) {
      this.reloadT += dt * this.reloadSpeed;
      sampleVec(this.track.gunPos, this.reloadT, relPos);
      sampleVec(this.track.gunRot, this.reloadT, relRot);
      this.reloadEvents(prevT, this.reloadT);
      if (this.reloadT >= this.track.duration) this.reloading = false;
    }
    const pivot = _v2.fromArray(T.aimPivot);
    const qAim = new THREE6.Quaternion().setFromEuler(new THREE6.Euler(offPitch, offYaw, this.lagRoll - rig.leanRoll * CONFIG.camera.lean.gunCounterRoll, "YXZ"));
    const gp = bp.clone().sub(pivot).applyQuaternion(qAim).add(pivot);
    const relP = this.relPosF.update(dt, new THREE6.Vector3().fromArray(relPos));
    gp.add(bobPos).add(relP);
    const relR = this.relRotF.update(dt, new THREE6.Vector3().fromArray(relRot));
    const qBase = new THREE6.Quaternion().setFromEuler(new THREE6.Euler(br.x + bobRot.x + relR.x * DEG, br.y + bobRot.y + relR.y * DEG, br.z + bobRot.z + relR.z * DEG, "YXZ"));
    const qGun = qAim.clone().multiply(qBase);
    const wristPivot = new THREE6.Vector3().fromArray(T.wristPivot);
    const qRec = new THREE6.Quaternion().setFromEuler(new THREE6.Euler(rp, ry, rr, "YXZ"));
    const recOffset = wristPivot.clone().sub(wristPivot.clone().applyQuaternion(qRec)).add(new THREE6.Vector3(0, ru, rb));
    this.gunMatrix.compose(gp, qGun, ONE).multiply(_m.compose(recOffset, qRec, ONE));
    this.gun.root.matrix.copy(this.gunMatrix);
    this.gun.root.matrixWorldNeedsUpdate = true;
    this.updateMechanics(dt);
    _m.multiplyMatrices(this.gunMatrix, spec.rightGrip);
    _m.decompose(this.right.anchor.position, this.right.anchor.quaternion, _s);
    const busy = this.reloading || this.switchPhase !== "none";
    const wantTrigger = !busy && (input.lmb || this.sinceShot < 1.4 || ads > 0.6) && player.sprint < 0.4 && this.tuck < 0.5;
    this.triggerFinger = damp(this.triggerFinger, wantTrigger ? 1 : 0, wantTrigger ? 18 : 5, dt);
    lerpPose(spec.hands.indexed, spec.hands.trigger, this.triggerFinger, this.rightPose);
    if (this.reloading) {
      const [r0, r1] = this.track.magRelease;
      const magRel = smoothstep(r0, r0 + 0.07, this.reloadT) * (1 - smoothstep(r1 - 0.1, r1, this.reloadT));
      if (magRel > 0) lerpPose(this.rightPose, spec.hands.magRelease, magRel, this.rightPose);
    }
    this.squeeze = Math.max(0, this.squeeze - dt * 7);
    const sq = this.squeeze * this.squeeze * (busy ? 0 : 1);
    const clamp4 = (p, k, skipIndex) => {
      for (const f of ["index", "middle", "ring", "pinky"]) {
        if (skipIndex && f === "index") continue;
        p[f][1] += 0.07 * k;
        p[f][2] += 0.05 * k;
      }
      p.thumb[1] += 0.05 * k;
    };
    if (sq > 0) clamp4(this.rightPose, sq, true);
    this.right.setPose(this.rightPose);
    if (this.reloading) {
      this.leftAt(this.reloadT, _m2);
      _m2.decompose(this.left.anchor.position, this.left.anchor.quaternion, _s);
      this.left.setPose(this.leftPose);
    } else {
      _m2.multiplyMatrices(this.gunMatrix, spec.leftGrip).decompose(this.left.anchor.position, this.left.anchor.quaternion, _s);
      this.supportPose ?? (this.supportPose = clonePose(spec.hands.support));
      lerpPose(spec.hands.support, spec.hands.support, 0, this.supportPose);
      if (sq > 0) clamp4(this.supportPose, sq * 1.2, false);
      this.left.setPose(this.supportPose);
    }
    this.updateMagazine();
    const shR = new THREE6.Vector3().fromArray(CONFIG.body.shoulderR).addScaledVector(rig.bobPos, -0.3);
    const shL = new THREE6.Vector3().fromArray(CONFIG.body.shoulderL).addScaledVector(rig.bobPos, -0.3);
    const E = T.elbowPole;
    const down = new THREE6.Vector3(0, -1, 0).applyQuaternion(rig.camera.getWorldQuaternion(new THREE6.Quaternion()).invert());
    this.armR.update(shR, this.right.anchor.position, new THREE6.Vector3().fromArray(E.hipR).lerp(new THREE6.Vector3().fromArray(E.adsR), adsE), this.right.anchor, down, this.right.ulnarSign);
    this.armL.update(shL, this.left.anchor.position, new THREE6.Vector3().fromArray(E.hipL).lerp(new THREE6.Vector3().fromArray(E.adsL), adsE), this.left.anchor, down, this.left.ulnarSign);
    this.flashlight.intensity = this.lightOn ? 70 : 0;
    for (const s of this.specs) s.model.setLight(this.lightOn && s === spec);
    this.root.updateMatrixWorld(true);
    this.flashlight.position.set(0, 0, 0);
    if (this.lightOn) {
      const lw = this.gun.lightMount.getWorldPosition(new THREE6.Vector3());
      const safe = this.safePoint(level, camPos, lw);
      if (safe !== lw) {
        this.flashlight.position.copy(this.gun.lightMount.worldToLocal(safe));
        this.flashlight.updateMatrixWorld(true);
      }
    }
    const mw = this.gun.muzzle.getWorldPosition(new THREE6.Vector3());
    if (dt > 0) this.muzzleVelocity.subVectors(mw, this.prevMuzzle).divideScalar(dt);
    this.prevMuzzle.copy(mw);
  }
  /**
   * The view model is drawn over the world, so the gun can visually poke through walls.
   * Anything emitted from it (light, flash, bullets) starts on the camera's side of the surface.
   */
  safePoint(level, from, p, margin = 0.04) {
    const d = new THREE6.Vector3().subVectors(p, from);
    const len = d.length();
    if (len < 1e-4) return p;
    d.divideScalar(len);
    const hit = level.raycast(from, d, len + margin);
    if (!hit) return p;
    return from.clone().addScaledVector(d, Math.max(0, hit.distance - margin));
  }
  updateSwitch(dt) {
    if (this.switchPhase === "lower") {
      this.switchT += dt / 0.3;
      this.lowerW = easeIn(Math.min(1, this.switchT));
      if (this.switchT >= 1) {
        this.activate(this.pending);
        this.switchPhase = "raise";
        this.switchT = 0;
        this.slideTimer = 10;
        this.magState = "gun";
      }
    } else if (this.switchPhase === "raise") {
      this.switchT += dt / 0.45;
      this.lowerW = 1 - easeOut(Math.min(1, this.switchT));
      if (this.switchT >= 1) {
        this.switchPhase = "none";
        this.lowerW = 0;
      }
    }
  }
  updateMechanics(dt) {
    const st = this.states[this.index];
    const cycle = this.spec.tuning.slideCycleTime;
    const back = cycle * 0.38;
    this.slideTimer += dt;
    let slide;
    if (this.slideTimer < back) slide = this.slideTimer / back;
    else if (st.locked) slide = 1;
    else slide = Math.max(0, 1 - (this.slideTimer - back) / (cycle - back));
    this.gun.setSlide(slide);
    this.gun.setSlideStop(st.locked);
    this.triggerT = Math.max(0, this.triggerT - dt / 0.09);
    this.gun.setTrigger(Math.min(1, this.triggerT * 1.4));
    if (this.shellPending >= 0) {
      this.shellPending -= dt;
      if (this.shellPending < 0) this.ejectShell();
    }
  }
  ejectShell() {
    this.root.updateMatrixWorld(true);
    const port = this.gun.ejectionPort.getWorldPosition(new THREE6.Vector3());
    const q = this.gun.root.getWorldQuaternion(new THREE6.Quaternion());
    const [a, b] = this.spec.shellVel;
    const vel = new THREE6.Vector3(rand(a[0], b[0]), rand(a[1], b[1]), rand(a[2], b[2])).applyQuaternion(q).add(this.muzzleVelocity.clone().multiplyScalar(0.5));
    this.events.shell?.(port, vel, q, this.spec.id);
  }
  reloadEvents(t0, t1) {
    const ev = this.events;
    const id = this.spec.id;
    const st = this.states[this.index];
    for (const [t, e] of this.track.events) {
      if (!crossed(t0, t1, t)) continue;
      this.onReloadEvent(e, st, id, ev);
    }
  }
  onReloadEvent(e, st, id, ev) {
    switch (e) {
      case "magOut":
        ev.sound?.("magOut", id);
        break;
      case "drop": {
        this.root.updateMatrixWorld(true);
        const down = new THREE6.Vector3(0, -1.2, 0).add(this.muzzleVelocity.clone().multiplyScalar(0.4));
        ev.magDrop?.(this.gun.magazine.matrixWorld.clone(), down, this.gun.magazine);
        this.magState = "none";
        break;
      }
      case "pouch":
        ev.sound?.("pouch", id);
        break;
      case "grab":
        this.magState = "hand";
        break;
      case "bump":
        ev.sound?.("magOut", id);
        this.rUp.kick(-4e-3);
        this.rPitch.kick(6e-3);
        break;
      case "magIn":
        ev.sound?.("magIn", id);
        break;
      case "seat":
        ev.sound?.("magSlap", id);
        this.magState = "gun";
        st.mag = this.spec.tuning.magSize;
        this.rUp.kick(6e-3);
        this.rPitch.kick(8e-3);
        break;
      case "slideBack":
        ev.sound?.("slideBack", id);
        break;
      case "release":
        ev.sound?.(id === "rifle" ? "boltRelease" : "slideRelease", id);
        st.locked = false;
        st.chambered = true;
        st.mag = Math.max(0, st.mag - 1);
        this.slideTimer = this.spec.tuning.slideCycleTime * 0.38;
        this.rBack.kick(8e-3);
        this.rPitch.kick(0.02);
        break;
    }
  }
  leftFrame(k, out) {
    const spec = this.spec;
    switch (k.at) {
      case "grip":
        return out.multiplyMatrices(this.gunMatrix, spec.leftGrip);
      case "pouch":
        return out.copy(spec.pouch);
      case "gun":
        return out.multiplyMatrices(this.gunMatrix, k.gun);
      case "mag": {
        const [dy, dz, tilt] = k.mag;
        this.gun.magSeat.updateMatrix();
        const seat = new THREE6.Matrix4().multiplyMatrices(this.gunMatrix, this.gun.magSeat.matrix);
        const off = new THREE6.Matrix4().compose(new THREE6.Vector3(0, dy, dz), new THREE6.Quaternion().setFromEuler(new THREE6.Euler(tilt, 0, 0)), ONE);
        return out.multiplyMatrices(seat, off).multiply(new THREE6.Matrix4().copy(spec.magInHand).invert());
      }
    }
  }
  /** Interpolated left wrist (camera space) + finger pose for the reload time `t`. */
  leftAt(t, out) {
    const keys = this.track.left;
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1].t) i++;
    const a = keys[i];
    const b = keys[Math.min(i + 1, keys.length - 1)];
    const k = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 1;
    const e = easeInOut(k);
    const pa = new THREE6.Vector3();
    const qa = new THREE6.Quaternion();
    const pb = new THREE6.Vector3();
    const qb = new THREE6.Quaternion();
    this.leftFrame(a, new THREE6.Matrix4()).decompose(pa, qa, _s);
    this.leftFrame(b, new THREE6.Matrix4()).decompose(pb, qb, _s);
    const dist = pa.distanceTo(pb);
    const arc = Math.sin(e * Math.PI) * Math.min(0.05, dist * 0.18);
    const p = pa.lerp(pb, e).add(new THREE6.Vector3(0, -arc, arc * 0.5));
    out.compose(p, qa.slerp(qb, e), ONE);
    lerpPose(this.spec.hands[a.pose], this.spec.hands[b.pose], e, this.leftPose);
  }
  updateMagazine() {
    for (const s of this.specs) {
      const mag = s.model.magazine;
      if (s !== this.spec) {
        mag.visible = true;
        mag.position.set(0, 0, 0);
        mag.quaternion.identity();
        continue;
      }
      if (this.magState === "hand") {
        mag.visible = true;
        s.model.magSeat.updateMatrix();
        const seat = new THREE6.Matrix4().multiplyMatrices(this.gunMatrix, s.model.magSeat.matrix);
        const left = new THREE6.Matrix4().compose(this.left.anchor.position, this.left.anchor.quaternion, ONE);
        seat.invert().multiply(left).multiply(s.magInHand).decompose(mag.position, mag.quaternion, _s);
      } else if (this.magState === "gun") {
        mag.visible = true;
        mag.position.set(0, 0, 0);
        mag.quaternion.identity();
      } else mag.visible = false;
    }
    this.gun.roundInMag.visible = this.ammo > 0 || this.magState === "hand";
  }
};
return {
  CONFIG, MATH: math_exports, Arm, GlovedHand, WeaponRig, OPEN_POSE, LEFT_OPEN,
  clonePose, lerpPose, gripMatrix, withFumble, magInHand, pouch, translate, pose: P,
  createGloveMaterial, createGloveDetailMaterial, createJacketMaterial, createGloveCuffMaterial,
  createFabricTextures, setSleeveColor, setLayerRecursive, FINGER_JOINTS
};
});

/* ---- viewmodel/hand_assets.js ---- */
/* ============================================================================
   Перчатки GLB (левая и правая кисть с костями пальцев, стандарт WebXR hand)
   из bodycam_angar.html — gzip + base64, распаковываются при загрузке.
   Встроены в страницу, поэтому работают и при открытии файла с диска.
   ========================================================================== */
(function (root) {
  'use strict';
  const B64 = {
    left: "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",
    right: "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"
  };
  async function inflate(b64) {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const ds = new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(ds).arrayBuffer();
  }
  const GA = root.GAssets;
  if (!GA || typeof DecompressionStream === 'undefined') return;
  GA.add('vm_hands', Promise.all([
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/utils/SkeletonUtils.js')
  ]).then(async ([GL, SU]) => {
    const loader = new GL.GLTFLoader();
    const parse = (buf) => new Promise((ok, bad) => loader.parse(buf, '', ok, bad));
    const [left, right] = await Promise.all([inflate(B64.left).then(parse), inflate(B64.right).then(parse)]);
    /* GlovedHand перестраивает сцену GLB, поэтому каждой кисти — своя копия */
    const clone = (g) => ({ scene: SU.clone(g.scene) });
    return { left, right, clone };
  }));
})(typeof self !== 'undefined' ? self : this);

/* ---- viewmodel/hands.js ---- */
/* ============================================================================
   Кисти GLB на скелете бойца (вид со стороны) — не зависят от оружия.

   Те же перчатки с костями пальцев, что и в риге от первого лица
   (viewmodel/vm.js). Кисть крепится к кости запястья; поворот кисти рига
   переводится в поворот кости запястья (wristQuat). Позы пальцев — формат
   GVM.pose(thumb, index, middle, ring, pinky).

   API (self.GHands):
     attachHands(char, assets) -> { R: GlovedHand, L: GlovedHand } | null
     wristQuat(anchorQuat, 'R'|'L', outQuat) -> outQuat
     handBasis(side) -> Quaternion         // side: 1 правая, -1 левая
     POSES.relaxed / POSES.relaxedL        // кисть опущена вдоль бедра
   ========================================================================== */
(function (root, factory) {
  const H = factory(root.THREE, root.GVM);
  if (typeof module !== 'undefined' && module.exports) module.exports = H;
  else root.GHands = H;
})(typeof self !== 'undefined' ? self : this, function (THREE, VM) {
  'use strict';
  if (!VM) return null;
  const P = VM.pose;

  /* Кисть рига: -Z к пальцам, +Y — тыл, +X — к мизинцу у правой. Кость
     запястья бойца в покое: пальцы по ±X (своя сторона), тыл вверх, большой
     палец вперёд (-Z). C — поворот кисти рига в системе кости. */
  function handBasis(side) {
    const z = new THREE.Vector3(-side, 0, 0), y = new THREE.Vector3(0, 1, 0);
    const x = new THREE.Vector3().crossVectors(y, z);
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  }
  const C_R = handBasis(1), C_L = handBasis(-1);
  const C_INV = { R: C_R.clone().invert(), L: C_L.clone().invert() };

  let gloveMat = null;
  function attachHands(char, assets) {
    if (!assets) return null;
    gloveMat = gloveMat || VM.createGloveMaterial();
    const out = {};
    for (const [SS, side, src] of [['R', 'right', assets.right], ['L', 'left', assets.left]]) {
      const h = new VM.GlovedHand(assets.clone(src), side, gloveMat);
      h.anchor.quaternion.copy(SS === 'R' ? C_R : C_L);
      h.anchor.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      char.bone('wrist' + SS).add(h.anchor);
      out[SS] = h;
    }
    return out;
  }

  /* Поворот кости запястья в мире по мировому повороту кисти рига. */
  function wristQuat(anchorQuat, SS, out) {
    return out.copy(anchorQuat).multiply(C_INV[SS]);
  }

  /* Расслабленная кисть: пальцы чуть согнуты, большой палец вдоль указательного. */
  const relaxed = P([0.25, 0.2, 0.15, 0, 0.1], [0.02, 0.28, 0.32, 0.18, 0], [0.02, 0.38, 0.42, 0.22, 0],
    [0.04, 0.46, 0.48, 0.25, 0], [0.08, 0.52, 0.5, 0.26, 0]);

  return { attachHands, wristQuat, handBasis, POSES: { relaxed, relaxedL: relaxed } };
});

/* ---- viewmodel/wspec.js ---- */
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

/* ---- soldier/textures.js ---- */
/* ============================================================================
   Процедурные текстуры экипировки.

   Всё рисуется на <canvas> в момент загрузки: камуфляжи, нейлон строп,
   кожа, кевлар шлема, резина и металл. Внешних файлов нет, поэтому страница
   остаётся одним html и работает офлайн.

   Каждый камуфляж — это слоёная заливка пятнами по фрактальному шуму:
   сначала базовый тон, затем 3–4 слоя пятен с разной частотой, затем
   мелкий «дитер» (для цифровых рисунков — квадратная сетка), и в конце
   общий слой износа: пыль в швах и вытертость на выступающих местах.
   ========================================================================== */
(function (root, factory) {
  const T = factory(root.GUtil || (typeof require !== 'undefined' ? require('./util.js') : null));
  if (typeof module !== 'undefined' && module.exports) module.exports = T;
  else root.GTex = T;
})(typeof self !== 'undefined' ? self : this, function (U) {
  'use strict';

  const TAU = Math.PI * 2;

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h || w;
    return c;
  }

  /* Контекст для процедурной генерации: почти все текстуры читают пиксели
     обратно через getImageData, поэтому просим у браузера «читаемый» буфер —
     иначе Chrome держит его в GPU и каждый readback стоит стола. */
  const ctx2d = (c) => c.getContext('2d', { willReadFrequently: true });

  const hex = (r, g, b) => 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';

  /* Пятно камуфляжа: замкнутый контур со «рваными» краями.
     Радиус модулируется двумя гармониками, поэтому форма получается
     органичной, а не звёздочкой. */
  function blob(g, x, y, r, r2, rnd, wobble) {
    const steps = 26;
    const w = wobble === undefined ? 0.34 : wobble;
    const p1 = rnd() * TAU, p2 = rnd() * TAU, p3 = rnd() * TAU;
    const k1 = 2 + Math.floor(rnd() * 2), k2 = 4 + Math.floor(rnd() * 3), k3 = 7 + Math.floor(rnd() * 4);
    g.beginPath();
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * TAU;
      const m = 1 + w * (0.55 * Math.sin(a * k1 + p1) + 0.3 * Math.sin(a * k2 + p2) + 0.16 * Math.sin(a * k3 + p3));
      const px = x + Math.cos(a) * r * m;
      const py = y + Math.sin(a) * (r2 === undefined ? r : r2) * m;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
  }

  /* Пиксельное пятно: заливка клетками сетки внутри эллипса. */
  function pixelBlob(g, x, y, r, cell, rnd, density) {
    const d = density === undefined ? 0.82 : density;
    const n = Math.ceil(r / cell);
    for (let iy = -n; iy <= n; iy++) {
      for (let ix = -n; ix <= n; ix++) {
        const dx = ix / n, dy = iy / n;
        const q = dx * dx + dy * dy;
        if (q > 1) continue;
        if (rnd() > d * (1 - q * 0.55)) continue;
        g.fillRect(Math.round(x + ix * cell), Math.round(y + iy * cell), cell, cell);
      }
    }
  }

  /* Тайлящийся слой: рисуем 9 раз со сдвигом, лишнее обрезается канвой.
     Даёт бесшовный повтор по обеим осям. */
  function tiled(g, w, h, draw) {
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        g.save();
        g.translate(ox * w, oy * h);
        draw(g);
        g.restore();
      }
    }
  }

  /* --------------------------------------------------------------- износ */
  /* Общий слой поверх любого камуфляжа: неравномерная выцветаемость,
     пыль снизу и тёмные затёки в складках. Без него ткань выглядит
     «нарисованной в фотошопе». */
  function wear(g, w, h, seed, amount) {
    const f = U.fbm(seed, 5, 0.55, 2.1);
    const img = g.getImageData(0, 0, w, h);
    const d = img.data;
    const A = amount === undefined ? 1 : amount;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const n = f(x / w * 4.5, y / h * 4.5);
        const n2 = f(x / w * 17 + 40, y / h * 17 + 11);
        /* выцветание: светлее и менее насыщенно */
        const fade = (n - 0.5) * 0.20 * A;
        /* пыль: слегка бежевая вуаль, сильнее к низу текстуры */
        const dust = Math.max(0, n2 - 0.52) * 0.5 * A * (0.35 + 0.65 * (y / h));
        const gr = (d[i] + d[i + 1] + d[i + 2]) / 3;
        for (let k = 0; k < 3; k++) {
          let v = d[i + k];
          v = v + (gr - v) * Math.max(0, fade) * 1.4;      // обесцвечивание
          v *= 1 + fade;
          v = v * (1 - dust) + [176, 166, 143][k] * dust;  // пыль
          d[i + k] = U.clamp(v, 0, 255);
        }
      }
    }
    g.putImageData(img, 0, 0);
  }

  /* Мелкое переплетение ткани — в карту нормалей и лёгкая модуляция альбедо. */
  function weave(g, w, h, scale, strength) {
    const img = g.getImageData(0, 0, w, h);
    const d = img.data;
    const s = scale || 220;
    const A = strength === undefined ? 0.06 : strength;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const t = (Math.sin(x / w * s * TAU) * 0.5 + Math.sin(y / h * s * TAU) * 0.5);
        const k = 1 + t * A;
        d[i] = U.clamp(d[i] * k, 0, 255);
        d[i + 1] = U.clamp(d[i + 1] * k, 0, 255);
        d[i + 2] = U.clamp(d[i + 2] * k, 0, 255);
      }
    }
    g.putImageData(img, 0, 0);
  }

  /* ======================================================== КАМУФЛЯЖИ ==== */

  /* Палитры сняты с референса:
     delta_green — «мультикам»-подобный лес: олива, хаки, тёмно-зелёный, бурый;
     delta_grey  — серо-зелёный ATACS-подобный: светлая основа, серые ветки;
     alpha_black — чёрный: угольная основа, графитовые разводы, почти без
                   контраста, работают только блики ткани;
     alpha_cadpat— чёрно-зелёный цифровой: чёрная основа, три зелёных тона. */
  const PALETTES = {
    delta_green: {
      base: [92, 96, 62],
      layers: [
        { col: [120, 118, 78], r: [46, 96], n: 16, wob: 0.38 },
        { col: [64, 74, 46], r: [34, 78], n: 18, wob: 0.42 },
        { col: [84, 66, 44], r: [20, 52], n: 20, wob: 0.46 },
        { col: [38, 45, 30], r: [10, 26], n: 34, wob: 0.5 }
      ],
      speck: [[46, 52, 34, 0.30], [128, 126, 88, 0.22]]
    },
    delta_grey: {
      base: [120, 124, 108],
      layers: [
        { col: [146, 148, 130], r: [50, 104], n: 14, wob: 0.34 },
        { col: [96, 104, 88], r: [30, 70], n: 20, wob: 0.44 },
        { col: [74, 82, 68], r: [16, 42], n: 26, wob: 0.5 },
        { col: [52, 58, 48], r: [8, 22], n: 34, wob: 0.54 }
      ],
      speck: [[70, 76, 62, 0.26], [158, 158, 140, 0.2]]
    },
    alpha_black: {
      base: [44, 46, 50],
      layers: [
        { col: [54, 56, 61], r: [48, 100], n: 12, wob: 0.36 },
        { col: [34, 35, 39], r: [28, 66], n: 16, wob: 0.44 },
        { col: [62, 64, 70], r: [14, 34], n: 18, wob: 0.48 }
      ],
      speck: [[28, 29, 32, 0.3], [72, 74, 80, 0.18]]
    },
    alpha_cadpat: {
      base: [34, 37, 34],
      pixel: 7,
      layers: [
        { col: [58, 72, 52], r: [40, 84], n: 15 },
        { col: [42, 54, 40], r: [26, 58], n: 18 },
        { col: [76, 92, 66], r: [14, 34], n: 20 },
        { col: [24, 26, 24], r: [10, 26], n: 22 }
      ],
      speck: [[52, 64, 48, 0.24], [20, 22, 20, 0.24]]
    }
  };

  /* Камуфляжная карта альбедо. size — сторона тайла в пикселях. */
  function camoAlbedo(kind, seed, size) {
    const P = PALETTES[kind] || PALETTES.delta_green;
    const S = size || 512;
    const c = canvas(S), g = ctx2d(c);
    const rnd = U.rng(seed);

    g.fillStyle = hex(P.base[0], P.base[1], P.base[2]);
    g.fillRect(0, 0, S, S);

    const sc = S / 512;
    for (const L of P.layers) {
      g.fillStyle = hex(L.col[0], L.col[1], L.col[2]);
      const n = Math.round(L.n * (S / 512) * (S / 512) + L.n * 0.2);
      for (let i = 0; i < n; i++) {
        const x = rnd() * S, y = rnd() * S;
        const r = U.lerp(L.r[0], L.r[1], rnd()) * sc;
        tiled(g, S, S, (gg) => {
          if (P.pixel) pixelBlob(gg, x, y, r, Math.max(2, Math.round(P.pixel * sc)), U.rng(seed + i * 31 + r), 0.86);
          else blob(gg, x, y, r, r * U.lerp(0.55, 1.15, rnd()), U.rng(seed + i * 17), L.wob);
        });
      }
    }

    /* мелкая крапина — разбивает «плакатность» больших пятен */
    for (const sp of P.speck) {
      g.fillStyle = 'rgba(' + sp[0] + ',' + sp[1] + ',' + sp[2] + ',' + sp[3] + ')';
      const cnt = Math.round(2600 * sc * sc);
      const cell = P.pixel ? Math.max(2, Math.round(P.pixel * sc)) : 0;
      for (let i = 0; i < cnt; i++) {
        const x = rnd() * S, y = rnd() * S;
        if (cell) g.fillRect(Math.round(x / cell) * cell, Math.round(y / cell) * cell, cell, cell);
        else { g.beginPath(); g.arc(x, y, U.lerp(0.7, 2.6, rnd()) * sc, 0, TAU); g.fill(); }
      }
    }

    weave(g, S, S, 150, 0.05);
    wear(g, S, S, seed + 991, kind === 'alpha_black' ? 0.55 : 1);
    return c;
  }

  /* Карта нормалей ткани: переплетение + крупные складки по шуму.
     Нормаль считается из высотного поля центральными разностями. */
  function fabricNormal(seed, size, weaveScale, foldAmp) {
    const S = size || 256;
    const c = canvas(S), g = ctx2d(c);
    const f = U.fbm(seed, 4, 0.5, 2.2);
    const ws = weaveScale || 46;
    const fa = foldAmp === undefined ? 1 : foldAmp;
    const H = new Float32Array(S * S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S;
        /* полотняное переплетение: две ортогональные синусоиды в противофазе */
        const wv = Math.sin(u * ws * TAU) * Math.cos(v * ws * TAU);
        const fold = (f(u * 3.1, v * 3.1) - 0.5) * 2 * fa;
        H[y * S + x] = wv * 0.30 + fold * 0.85;
      }
    }
    const img = g.createImageData(S, S);
    const d = img.data;
    const at = (x, y) => H[((y + S) % S) * S + ((x + S) % S)];
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * 2.1;
        const dy = (at(x, y + 1) - at(x, y - 1)) * 2.1;
        let nx = -dx, ny = -dy, nz = 1;
        const l = Math.hypot(nx, ny, nz);
        nx /= l; ny /= l; nz /= l;
        const i = (y * S + x) * 4;
        d[i] = (nx * 0.5 + 0.5) * 255;
        d[i + 1] = (ny * 0.5 + 0.5) * 255;
        d[i + 2] = (nz * 0.5 + 0.5) * 255;
        d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /* Карта шероховатости: ткань матовая, но на сгибах и вытертостях лоснится. */
  function roughnessMap(seed, size, lo, hi) {
    const S = size || 256;
    const c = canvas(S), g = ctx2d(c);
    const f = U.fbm(seed, 4, 0.55, 2.3);
    const img = g.createImageData(S, S), d = img.data;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const n = f(x / S * 5.5, y / S * 5.5) * 0.7 + f(x / S * 19, y / S * 19) * 0.3;
        const v = U.lerp(lo === undefined ? 0.66 : lo, hi === undefined ? 0.98 : hi, n) * 255;
        const i = (y * S + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /* --------------------------------------------------------------- нейлон */
  /* Ткань подсумков и строп: плотный рубчик, крупнее чем у формы. */
  function nylonAlbedo(col, seed, size) {
    const S = size || 256;
    const c = canvas(S), g = ctx2d(c);
    const rnd = U.rng(seed);
    g.fillStyle = hex(col[0], col[1], col[2]);
    g.fillRect(0, 0, S, S);
    /* продольный рубчик кордуры */
    for (let x = 0; x < S; x += 3) {
      const k = 1 + (rnd() - 0.5) * 0.14;
      g.fillStyle = 'rgba(' + Math.round(col[0] * k) + ',' + Math.round(col[1] * k) + ',' + Math.round(col[2] * k) + ',0.5)';
      g.fillRect(x, 0, 2, S);
    }
    for (let y = 0; y < S; y += 3) {
      const k = 1 + (rnd() - 0.5) * 0.1;
      g.fillStyle = 'rgba(' + Math.round(col[0] * k) + ',' + Math.round(col[1] * k) + ',' + Math.round(col[2] * k) + ',0.35)';
      g.fillRect(0, y, S, 2);
    }
    wear(g, S, S, seed + 7, 0.7);
    return c;
  }

  /* ----------------------------------------------------------------- кожа */
  /* Лицо и кисти: базовый тон + подкожная неравномерность + поры.
     Тон слегка различается у бойцов (seed), чтобы отряд не был клоном. */
  function skinAlbedo(seed, tone, size) {
    const S = size || 256;
    const c = canvas(S), g = ctx2d(c);
    const rnd = U.rng(seed);
    const base = tone || [196, 154, 128];
    g.fillStyle = hex(base[0], base[1], base[2]);
    g.fillRect(0, 0, S, S);

    /* крупная неравномерность: румянец, тень щетины на нижней части */
    const f = U.fbm(seed + 3, 4, 0.55, 2.2);
    const img = g.getImageData(0, 0, S, S), d = img.data;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        const n = f(x / S * 3.2, y / S * 3.2) - 0.5;
        const p = f(x / S * 40 + 9, y / S * 40 + 3) - 0.5;       // поры
        d[i] = U.clamp(d[i] * (1 + n * 0.16 + p * 0.06) + n * 16, 0, 255);
        d[i + 1] = U.clamp(d[i + 1] * (1 + n * 0.10 + p * 0.06), 0, 255);
        d[i + 2] = U.clamp(d[i + 2] * (1 + n * 0.07 + p * 0.06), 0, 255);
      }
    }
    g.putImageData(img, 0, 0);

    /* редкие веснушки/точки — помогают глазу поверить в кожу вблизи */
    for (let i = 0; i < 260; i++) {
      const a = 0.04 + rnd() * 0.07;
      g.fillStyle = 'rgba(' + Math.round(base[0] * 0.62) + ',' + Math.round(base[1] * 0.55) + ',' + Math.round(base[2] * 0.5) + ',' + a + ')';
      g.beginPath();
      g.arc(rnd() * S, rnd() * S, 0.6 + rnd() * 1.6, 0, TAU);
      g.fill();
    }
    return c;
  }

  /* --------------------------------------------------- шлем / каска / кевлар */
  function helmetAlbedo(kind, seed, size) {
    const S = size || 256;
    const c = canvas(S), g = ctx2d(c);
    /* Шлем красят тем же рисунком, что и форму, но «прижатым»: на каске
       пятна мельче, а поверх лежит матовый лак с сколами. */
    const src = camoAlbedo(kind, seed + 555, S);
    g.drawImage(src, 0, 0, S, S);
    const rnd = U.rng(seed + 88);
    /* сколы краски до чёрного композита */
    for (let i = 0; i < 90; i++) {
      g.fillStyle = 'rgba(28,28,30,' + (0.18 + rnd() * 0.4) + ')';
      blob(g, rnd() * S, rnd() * S, 1.2 + rnd() * 4.5, undefined, U.rng(seed + i), 0.6);
    }
    /* фактура кевларового плетения */
    const img = g.getImageData(0, 0, S, S), d = img.data;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        const w = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 1.035 : 0.965;
        d[i] = U.clamp(d[i] * w, 0, 255);
        d[i + 1] = U.clamp(d[i + 1] * w, 0, 255);
        d[i + 2] = U.clamp(d[i + 2] * w, 0, 255);
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /* ------------------------------------------------------------ мишени */
  /* Стандартная поясная мишень: белое поле, чёрные концентрические зоны. */
  function targetFace(size) {
    const S = size || 512;
    const c = canvas(S), g = ctx2d(c);
    g.fillStyle = '#d9d6cc'; g.fillRect(0, 0, S, S);
    const cx = S * 0.5, cy = S * 0.46;
    const rings = [0.40, 0.335, 0.27, 0.205, 0.14, 0.075];
    g.strokeStyle = '#1b1c1e';
    for (let i = 0; i < rings.length; i++) {
      g.lineWidth = S * 0.006;
      g.beginPath(); g.arc(cx, cy, S * rings[i], 0, TAU); g.stroke();
    }
    g.fillStyle = '#1b1c1e';
    g.beginPath(); g.arc(cx, cy, S * 0.075, 0, TAU); g.fill();
    /* номера зон */
    g.fillStyle = '#1b1c1e';
    g.font = '600 ' + Math.round(S * 0.045) + 'px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < rings.length - 1; i++) {
      const r = S * (rings[i] + rings[i + 1]) * 0.5;
      g.fillText(String(i + 5), cx, cy - r);
    }
    /* пятна непогоды по краю картона */
    const rnd = U.rng(4242);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = 'rgba(120,110,92,' + (0.04 + rnd() * 0.09) + ')';
      blob(g, rnd() * S, rnd() * S, 4 + rnd() * 26, undefined, U.rng(i + 5), 0.5);
    }
    return c;
  }

  /* ------------------------------------------------------------- дерево */
  function woodAlbedo(seed, size, col) {
    const S = size || 256;
    const c = canvas(S), g = ctx2d(c);
    const base = col || [126, 96, 62];
    const f = U.fbm(seed, 4, 0.5, 2.3);
    const img = g.createImageData(S, S), d = img.data;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S;
        /* годовые кольца вдоль доски + продольные волокна */
        const warp = f(u * 2.2, v * 2.2) * 0.6;
        const rings = Math.sin((v * 13 + warp * 4) * Math.PI) * 0.5 + 0.5;
        const grain = f(u * 60, v * 4) * 0.5 + 0.5;
        const k = 0.72 + rings * 0.22 + grain * 0.2;
        const i = (y * S + x) * 4;
        d[i] = U.clamp(base[0] * k, 0, 255);
        d[i + 1] = U.clamp(base[1] * k, 0, 255);
        d[i + 2] = U.clamp(base[2] * k, 0, 255);
        d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /* ------------------------------------------------------- грунт / трава */
  /* Покрытие полигона: выбитый грунт в тёмно-серых тонах.

     Зелёный газон заменён на серую гамму по требованию к виду площадки:
     дачный газон ломал восприятие полигона. Оттенки держатся в узком
     диапазоне яркости (52…96 из 255) и почти без насыщенности — цвет
     уходит в холодный серый, а читаемость рельефа даёт только шум. */
  function groundAlbedo(seed, size) {
    const S = size || 512;
    const c = canvas(S), g = ctx2d(c);
    const f1 = U.fbm(seed, 5, 0.55, 2.2);
    const f2 = U.fbm(seed + 17, 3, 0.5, 2.6);
    const img = g.createImageData(S, S), d = img.data;
    /* тёмный грунт -> светлая пыль; проплешина — выбитая земля.
       Диапазон намеренно широкий (62…126): при узком разбросе плоскость
       читалась как залитая одним цветом и теряла рельеф. */
    const GREEN_D = [62, 63, 62], GREEN_L = [126, 126, 123], SOIL = [92, 88, 82];
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S;
        const n = f1(u * 6, v * 6);
        const fine = f2(u * 48, v * 48);
        const bare = U.clamp01((f1(u * 2.4 + 30, v * 2.4 + 12) - 0.62) * 4.2);
        const t = U.clamp01(n * 0.72 + fine * 0.28);
        const i = (y * S + x) * 4;
        for (let k = 0; k < 3; k++) {
          const grass = U.lerp(GREEN_D[k], GREEN_L[k], t);
          d[i + k] = U.clamp(U.lerp(grass, SOIL[k] * (0.8 + fine * 0.4), bare), 0, 255);
        }
        d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /* Спрайт сухой травы: редкие жёсткие стебли в серо-бурой гамме.
     Зелень убрана — на полигоне остаётся выгоревшая ветошь, она лишь
     слегка разбивает плоскость грунта и не тянет на себя внимание. */
  function grassBlade(seed, size) {
    const S = size || 128;
    const c = canvas(S, S), g = ctx2d(c);
    const rnd = U.rng(seed);
    const n = 9;
    for (let i = 0; i < n; i++) {
      const x0 = S * (0.12 + rnd() * 0.76);
      const h = S * (0.5 + rnd() * 0.48);
      const bend = (rnd() - 0.5) * S * 0.42;
      const w = S * (0.026 + rnd() * 0.026);
      const dark = 0.55 + rnd() * 0.5;
      const grd = g.createLinearGradient(x0, S, x0 + bend, S - h);
      grd.addColorStop(0, 'rgba(' + Math.round(44 * dark) + ',' + Math.round(45 * dark) + ',' + Math.round(43 * dark) + ',1)');
      grd.addColorStop(0.55, 'rgba(' + Math.round(86 * dark) + ',' + Math.round(85 * dark) + ',' + Math.round(78 * dark) + ',1)');
      grd.addColorStop(1, 'rgba(' + Math.round(124 * dark) + ',' + Math.round(120 * dark) + ',' + Math.round(108 * dark) + ',0.92)');
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(x0 - w, S);
      g.quadraticCurveTo(x0 - w * 0.6 + bend * 0.5, S - h * 0.55, x0 + bend, S - h);
      g.quadraticCurveTo(x0 + w * 0.6 + bend * 0.5, S - h * 0.55, x0 + w, S);
      g.closePath();
      g.fill();
    }
    return c;
  }

  return {
    canvas, ctx2d, camoAlbedo, fabricNormal, roughnessMap, nylonAlbedo, skinAlbedo,
    helmetAlbedo, targetFace, woodAlbedo, groundAlbedo, grassBlade,
    blob, wear, PALETTES
  };
});
/* ---- core/geobuf.js ---- */
/* ============================================================================
   Буфер скиннингованной геометрии.

   Тело бойца строится как набор «обтекаемых» поверхностей (лофтов) вокруг
   скелета. Вершина сразу получает веса костей, поэтому дальше меш живёт как
   обычный THREE.SkinnedMesh: анимация идёт на GPU, а рёбра у локтей и колен
   не рвутся.

   Координаты — метры, ось Y вверх, -Z вперёд (как у three и у модели АК).
   ========================================================================== */
(function (root, factory) {
  const B = factory(root.GUtil || (typeof require !== 'undefined' ? require('./util.js') : null));
  if (typeof module !== 'undefined' && module.exports) module.exports = B;
  else root.GBuf = B;
})(typeof self !== 'undefined' ? self : this, function (U) {
  'use strict';

  const TAU = Math.PI * 2;

  function Buf() {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.skinIndex = [];
    this.skinWeight = [];
    this.index = [];
  }

  Buf.prototype.vertex = function (p, n, uv, bones) {
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(n[0], n[1], n[2]);
    this.uv.push(uv[0], uv[1]);
    /* до 4 костей на вершину; недостающие добиваются нулями */
    const b = bones || [[0, 1]];
    for (let i = 0; i < 4; i++) {
      this.skinIndex.push(b[i] ? b[i][0] : 0);
      this.skinWeight.push(b[i] ? b[i][1] : 0);
    }
    return this.pos.length / 3 - 1;
  };

  Buf.prototype.tri = function (a, b, c) { this.index.push(a, b, c); };
  Buf.prototype.quad = function (a, b, c, d) { this.index.push(a, b, c, a, c, d); };
  Buf.prototype.count = function () { return this.pos.length / 3; };

  /* Нормализация весов: сумма должна быть ровно 1, иначе меш «сдувается». */
  Buf.prototype.normalizeWeights = function () {
    const w = this.skinWeight;
    for (let i = 0; i < w.length; i += 4) {
      const s = w[i] + w[i + 1] + w[i + 2] + w[i + 3];
      if (s > 1e-6) { w[i] /= s; w[i + 1] /= s; w[i + 2] /= s; w[i + 3] /= s; }
      else { w[i] = 1; w[i + 1] = w[i + 2] = w[i + 3] = 0; }
    }
  };

  /* Пересчёт нормалей по граням: нужен после того, как лофт получил
     нетривиальную форму (сужения, скосы) — аналитические нормали там врут. */
  Buf.prototype.recomputeNormals = function () {
    const P = this.pos, I = this.index;
    const N = new Float64Array(P.length);
    for (let i = 0; i < I.length; i += 3) {
      const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      N[a] += nx; N[a + 1] += ny; N[a + 2] += nz;
      N[b] += nx; N[b + 1] += ny; N[b + 2] += nz;
      N[c] += nx; N[c + 1] += ny; N[c + 2] += nz;
    }
    for (let i = 0; i < N.length; i += 3) {
      const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1;
      this.nrm[i] = N[i] / l; this.nrm[i + 1] = N[i + 1] / l; this.nrm[i + 2] = N[i + 2] / l;
    }
  };

  /* Сварка вершин по позиции: убирает видимые швы между сегментами лофта
     и даёт гладкие нормали на стыке плеча с торсом. */
  Buf.prototype.weld = function (eps) {
    const E = eps || 1e-4;
    const inv = 1 / E;
    const map = new Map();
    const remap = new Int32Array(this.count());
    const P = this.pos, N = this.nrm, UV = this.uv, SI = this.skinIndex, SW = this.skinWeight;
    const nP = [], nN = [], nUV = [], nSI = [], nSW = [];
    for (let i = 0; i < remap.length; i++) {
      const k = Math.round(P[i * 3] * inv) + '_' + Math.round(P[i * 3 + 1] * inv) + '_' +
        Math.round(P[i * 3 + 2] * inv) + '_' + Math.round(UV[i * 2] * 64) + '_' + Math.round(UV[i * 2 + 1] * 64);
      const hit = map.get(k);
      if (hit !== undefined) {
        remap[i] = hit;
        /* нормали суммируются — усреднение даст гладкий стык */
        nN[hit * 3] += N[i * 3]; nN[hit * 3 + 1] += N[i * 3 + 1]; nN[hit * 3 + 2] += N[i * 3 + 2];
        continue;
      }
      const j = nP.length / 3;
      map.set(k, j);
      remap[i] = j;
      nP.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      nN.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
      nUV.push(UV[i * 2], UV[i * 2 + 1]);
      for (let k2 = 0; k2 < 4; k2++) { nSI.push(SI[i * 4 + k2]); nSW.push(SW[i * 4 + k2]); }
    }
    for (let i = 0; i < nN.length; i += 3) {
      const l = Math.hypot(nN[i], nN[i + 1], nN[i + 2]) || 1;
      nN[i] /= l; nN[i + 1] /= l; nN[i + 2] /= l;
    }
    this.pos = nP; this.nrm = nN; this.uv = nUV; this.skinIndex = nSI; this.skinWeight = nSW;
    for (let i = 0; i < this.index.length; i++) this.index[i] = remap[this.index[i]];
    return this;
  };

  /* Слияние двух буферов (со сдвигом индексов). */
  Buf.prototype.append = function (other) {
    const off = this.count();
    for (let i = 0; i < other.pos.length; i++) this.pos.push(other.pos[i]);
    for (let i = 0; i < other.nrm.length; i++) this.nrm.push(other.nrm[i]);
    for (let i = 0; i < other.uv.length; i++) this.uv.push(other.uv[i]);
    for (let i = 0; i < other.skinIndex.length; i++) this.skinIndex.push(other.skinIndex[i]);
    for (let i = 0; i < other.skinWeight.length; i++) this.skinWeight.push(other.skinWeight[i]);
    for (let i = 0; i < other.index.length; i++) this.index.push(other.index[i] + off);
    return this;
  };

  /* ======================================================== ЛОФТ ========= */
  /* Основной инструмент: труба переменного сечения вдоль ломаной оси.

     rings: [{ c:[x,y,z], // центр кольца
               rx, ry,    // полуоси сечения
               n,         // степень суперэллипсы (2 — эллипс, 4+ — «коробка»)
               rot,       // поворот сечения вокруг оси трубы, рад
               axis,      // направление оси в этой точке (нормируется)
               up,        // ориентир «верха» сечения
               bones,     // веса костей для вершин кольца
               v,         // координата V для UV
               shape      // необязательная функция (t)->[x,y] в локальной 2D
             }]
     seg:   количество вершин в кольце.
     caps:  замыкать ли торцы. */
  function loft(buf, rings, seg, opts) {
    opts = opts || {};
    const S = seg || 16;
    const uScale = opts.uScale === undefined ? 1 : opts.uScale;
    const uOff = opts.uOffset || 0;
    const rows = [];

    for (let i = 0; i < rings.length; i++) {
      const R = rings[i];
      /* базис кольца: ось трубы + два поперечных направления */
      let ax = R.axis ? norm(R.axis) : dirBetween(rings, i);
      let up = R.up || [0, 1, 0];
      let side = cross(up, ax);
      if (len(side) < 1e-5) { up = [0, 0, 1]; side = cross(up, ax); }
      side = norm(side);
      up = norm(cross(ax, side));

      const row = [];
      const rot = R.rot || 0;
      for (let j = 0; j < S; j++) {
        const t = (j / S) * TAU + rot;
        let lx, ly;
        if (R.shape) { const p = R.shape((j / S), t); lx = p[0]; ly = p[1]; }
        else {
          const e = U.superellipse(R.rx, R.ry === undefined ? R.rx : R.ry, R.n || 2, t);
          lx = e[0]; ly = e[1];
        }
        const p = [
          R.c[0] + side[0] * lx + up[0] * ly,
          R.c[1] + side[1] * lx + up[1] * ly,
          R.c[2] + side[2] * lx + up[2] * ly
        ];
        /* аналитическая нормаль: наружу от оси (уточняется в recomputeNormals) */
        const n = norm([
          side[0] * lx + up[0] * ly,
          side[1] * lx + up[1] * ly,
          side[2] * lx + up[2] * ly
        ]);
        const u = (j / S) * uScale + uOff;
        row.push(buf.vertex(p, n, [u, R.v === undefined ? i / (rings.length - 1) : R.v], R.bones));
      }
      /* дублирующая вершина шва, чтобы UV не «заворачивалось» */
      const R0 = rings[i];
      const seamT = rot;
      let sx, sy;
      if (R0.shape) { const p = R0.shape(0, seamT); sx = p[0]; sy = p[1]; }
      else { const e = U.superellipse(R0.rx, R0.ry === undefined ? R0.rx : R0.ry, R0.n || 2, seamT); sx = e[0]; sy = e[1]; }
      const sp = [
        R0.c[0] + side[0] * sx + up[0] * sy,
        R0.c[1] + side[1] * sx + up[1] * sy,
        R0.c[2] + side[2] * sx + up[2] * sy
      ];
      row.push(buf.vertex(sp, norm([side[0] * sx + up[0] * sy, side[1] * sx + up[1] * sy, side[2] * sx + up[2] * sy]),
        [uScale + uOff, R0.v === undefined ? i / (rings.length - 1) : R0.v], R0.bones));
      rows.push(row);
    }

    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i], b = rows[i + 1];
      for (let j = 0; j < S; j++) buf.quad(a[j], a[j + 1], b[j + 1], b[j]);
    }

    if (opts.capStart) capRing(buf, rings[0], rows[0], S, -1);
    if (opts.capEnd) capRing(buf, rings[rings.length - 1], rows[rows.length - 1], S, 1);
    return rows;
  }

  /* Крышка торца: веер треугольников к центру. */
  function capRing(buf, R, row, S, sign) {
    const c = buf.vertex(R.c, [0, sign, 0], [0.5, R.v === undefined ? 0 : R.v], R.bones);
    for (let j = 0; j < S; j++) {
      if (sign > 0) buf.tri(c, row[j], row[j + 1]);
      else buf.tri(c, row[j + 1], row[j]);
    }
  }

  function dirBetween(rings, i) {
    const a = rings[Math.max(0, i - 1)].c, b = rings[Math.min(rings.length - 1, i + 1)].c;
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    return len(d) < 1e-7 ? [0, 1, 0] : norm(d);
  }

  /* ------------------------------------------------------- сглаженный бокс */
  /* Скруглённый параллелепипед: подсумки, магазины, плиты бронежилета,
     доски домика. Радиус скругления задаётся отдельно, поэтому рёбра
     ловят блик — без этого всё выглядит «кубиками». */
  function roundBox(buf, opts) {
    const c = opts.center || [0, 0, 0];
    const s = opts.size;                       // полуразмеры
    const r = Math.min(opts.radius === undefined ? 0.01 : opts.radius, Math.min(s[0], s[1], s[2]) * 0.98);
    const seg = opts.seg || 3;
    const bones = opts.bones;
    const uvScale = opts.uvScale || 1;
    const q = opts.quat;                        // необязательный поворот

    const put = (p, n, uv) => {
      let P = p, N = n;
      if (q) { P = qrot(q, p); N = qrot(q, n); }
      return buf.vertex([P[0] + c[0], P[1] + c[1], P[2] + c[2]], N, uv, bones);
    };

    /* Сфера-«кубоид»: параметризуем по сферическим углам и растягиваем
       центральную часть до полуразмеров. Даёт корректные скругления
       на всех 12 рёбрах и 8 углах сразу. */
    const NU = seg * 4, NV = seg * 2;
    const grid = [];
    for (let iv = 0; iv <= NV; iv++) {
      const row = [];
      const v = iv / NV;
      const phi = v * Math.PI;
      for (let iu = 0; iu <= NU; iu++) {
        const u = iu / NU;
        const th = u * TAU;
        const nx = Math.sin(phi) * Math.cos(th);
        const ny = Math.cos(phi);
        const nz = Math.sin(phi) * Math.sin(th);
        const l = Math.hypot(nx, ny, nz) || 1;
        const n = [nx / l, ny / l, nz / l];
        const p = [
          Math.sign(n[0]) * Math.min(Math.abs(n[0]) * r + (s[0] - r) * clampUnit(n[0] * 2.4), s[0]),
          Math.sign(n[1]) * Math.min(Math.abs(n[1]) * r + (s[1] - r) * clampUnit(n[1] * 2.4), s[1]),
          Math.sign(n[2]) * Math.min(Math.abs(n[2]) * r + (s[2] - r) * clampUnit(n[2] * 2.4), s[2])
        ];
        row.push(put(p, n, [u * uvScale, v * uvScale]));
      }
      grid.push(row);
    }
    for (let iv = 0; iv < NV; iv++)
      for (let iu = 0; iu < NU; iu++)
        buf.quad(grid[iv][iu], grid[iv][iu + 1], grid[iv + 1][iu + 1], grid[iv + 1][iu]);
  }

  const clampUnit = (v) => U.clamp(v, -1, 1);

  /* ------------------------------------------------------------- пластина */
  /* Плоская панель с прошивкой по краю: нашивки, клапаны подсумков, ремни.
     Слегка выгибается по заданной кривизне, чтобы облегать тело. */
  function panel(buf, opts) {
    const o = opts.origin, ex = opts.ex, ey = opts.ey;   // базис панели
    const nx = opts.segX || 6, ny = opts.segY || 6;
    const bow = opts.bow || 0;                            // выгиб по нормали
    const th = opts.thickness === undefined ? 0.004 : opts.thickness;
    const bones = opts.bones;
    const n0 = norm(cross(ex, ey));
    const uv = opts.uv || [0, 0, 1, 1];
    const soft = opts.soft === undefined ? 0 : opts.soft;  // скругление углов

    const faces = [];
    for (const side of [1, -1]) {
      const grid = [];
      for (let j = 0; j <= ny; j++) {
        const row = [];
        for (let i = 0; i <= nx; i++) {
          let u = i / nx, v = j / ny;
          /* скругление углов панели поджатием краёв */
          let sx = 1, sy = 1;
          if (soft > 0) {
            const du = Math.abs(u - 0.5) * 2, dv = Math.abs(v - 0.5) * 2;
            sx = 1 - soft * Math.pow(Math.max(0, dv - (1 - soft)) / soft, 2) * 0.5;
            sy = 1 - soft * Math.pow(Math.max(0, du - (1 - soft)) / soft, 2) * 0.5;
          }
          const cu = (u - 0.5) * sx + 0.5, cv = (v - 0.5) * sy + 0.5;
          const b = bow * Math.sin(cu * Math.PI) * Math.sin(cv * Math.PI);
          const p = [
            o[0] + ex[0] * cu + ey[0] * cv + n0[0] * (b + th * 0.5 * side),
            o[1] + ex[1] * cu + ey[1] * cv + n0[1] * (b + th * 0.5 * side),
            o[2] + ex[2] * cu + ey[2] * cv + n0[2] * (b + th * 0.5 * side)
          ];
          row.push(buf.vertex(p, [n0[0] * side, n0[1] * side, n0[2] * side],
            [U.lerp(uv[0], uv[2], u), U.lerp(uv[1], uv[3], v)], bones));
        }
        grid.push(row);
      }
      faces.push(grid);
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) {
          if (side > 0) buf.quad(grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]);
          else buf.quad(grid[j][i], grid[j + 1][i], grid[j + 1][i + 1], grid[j][i + 1]);
        }
    }
    /* боковой рант — чтобы панель не была «бумажной» */
    const A = faces[0], B = faces[1];
    for (let i = 0; i < nx; i++) {
      buf.quad(A[0][i], B[0][i], B[0][i + 1], A[0][i + 1]);
      buf.quad(A[ny][i + 1], B[ny][i + 1], B[ny][i], A[ny][i]);
    }
    for (let j = 0; j < ny; j++) {
      buf.quad(A[j + 1][0], B[j + 1][0], B[j][0], A[j][0]);
      buf.quad(A[j][nx], B[j][nx], B[j + 1][nx], A[j + 1][nx]);
    }
    return faces;
  }

  /* --------------------------------------------------------------- строп */
  /* Ремень/стропа по ломаной: плоская лента, которая всегда повёрнута
     плашмя к заданной нормали. */
  function strap(buf, pts, width, thick, normalHint, bones, uvScale) {
    const W = width * 0.5, T = (thick === undefined ? 0.003 : thick) * 0.5;
    const rings = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const ax = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
      rings.push({
        c: pts[i], axis: ax, up: hintAt(normalHint, i / Math.max(1, pts.length - 1), pts[i]),
        rx: W, ry: T, n: 3.6, v: (i / (pts.length - 1)) * (uvScale || 1), bones:
          typeof bones === 'function' ? bones(i / (pts.length - 1), pts[i]) : bones
      });
    }
    loft(buf, rings, 8, { capStart: true, capEnd: true });
  }

  /* `normalHint` — это нормаль ПОВЕРХНОСТИ, на которой лежит лента: ширина
     раскладывается перпендикулярно ей, толщина — вдоль. Для лент, огибающих
     тело (камербанд, ряды MOLLE, лента панамы), нормаль в каждой точке своя,
     поэтому хинт разрешено задавать функцией. Раньше он был константой, и
     такие ленты вставали «фином» поперёк поверхности вместо того, чтобы
     облегать её. */
  function hintAt(hint, t, p) {
    if (typeof hint === 'function') return hint(t, p);
    return hint || [0, 0, 1];
  }

  /* --------------------------------------------------------- лента-кольцо */
  /* Замкнутая лента вокруг эллиптического сечения: ремень, камербанд, ряды
     MOLLE, лента на тулье. Ширина идёт вдоль оси height (обычно вертикаль),
     толщина — радиально наружу, поэтому лента именно облегает корпус.

     opts: { center, rx, rz, width, thick, seg, bones, squish (степень
     суперэллипсы), yScale (наклон), uvScale } */
  function ringBand(buf, opts) {
    const c = opts.center, rx = opts.rx, rz = opts.rz === undefined ? opts.rx : opts.rz;
    const w = (opts.width || 0.02) * 0.5, t = (opts.thick || 0.004) * 0.5;
    const seg = opts.seg || 28;
    const n = opts.squish === undefined ? 2.6 : opts.squish;
    const bones = opts.bones;
    const sag = opts.sag || 0;                 // провис к бокам, м
    const rows = [[], []];
    for (let i = 0; i <= seg; i++) {
      const th = (i / seg) * TAU;
      const e = U.superellipse(rx, rz, n, th);
      const outN = norm([e[0] / (rx * rx), 0, e[1] / (rz * rz)]);
      const dy = sag * Math.pow(Math.abs(Math.sin(th)), 1.5);
      for (const face of [0, 1]) {
        const off = face ? -t : t;
        rows[face].push([
          buf.vertex([c[0] + e[0] + outN[0] * off, c[1] + w - dy, c[2] + e[1] + outN[2] * off],
            outN, [i / seg * (opts.uvScale || 1), face ? 0.25 : 0], bones),
          buf.vertex([c[0] + e[0] + outN[0] * off, c[1] - w - dy, c[2] + e[1] + outN[2] * off],
            outN, [i / seg * (opts.uvScale || 1), face ? 0.5 : 0.75], bones)
        ]);
      }
    }
    for (let i = 0; i < seg; i++) {
      /* наружная и внутренняя стороны */
      buf.quad(rows[0][i][0], rows[0][i + 1][0], rows[0][i + 1][1], rows[0][i][1]);
      buf.quad(rows[1][i][1], rows[1][i + 1][1], rows[1][i + 1][0], rows[1][i][0]);
      /* кромки */
      buf.quad(rows[1][i][0], rows[1][i + 1][0], rows[0][i + 1][0], rows[0][i][0]);
      buf.quad(rows[0][i][1], rows[0][i + 1][1], rows[1][i + 1][1], rows[1][i][1]);
    }
  }

  /* ------------------------------------------------------------ векторы */
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.hypot(a[0], a[1], a[2]); }
  function norm(a) { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function scale(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function lerp3(a, b, t) { return [U.lerp(a[0], b[0], t), U.lerp(a[1], b[1], t), U.lerp(a[2], b[2], t)]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  /* поворот вектора кватернионом [x,y,z,w] */
  function qrot(q, v) {
    const x = q[0], y = q[1], z = q[2], w = q[3];
    const ix = w * v[0] + y * v[2] - z * v[1];
    const iy = w * v[1] + z * v[0] - x * v[2];
    const iz = w * v[2] + x * v[1] - y * v[0];
    const iw = -x * v[0] - y * v[1] - z * v[2];
    return [
      ix * w + iw * -x + iy * -z - iz * -y,
      iy * w + iw * -y + iz * -x - ix * -z,
      iz * w + iw * -z + ix * -y - iy * -x
    ];
  }

  function qFromAxisAngle(axis, a) {
    const n = norm(axis), s = Math.sin(a / 2);
    return [n[0] * s, n[1] * s, n[2] * s, Math.cos(a / 2)];
  }

  return {
    Buf, loft, roundBox, panel, strap, ringBand, capRing,
    cross, len, norm, add, sub, scale, lerp3, dot, qrot, qFromAxisAngle
  };
});
/* ---- soldier/skeleton.js ---- */
/* ============================================================================
   Скелет бойца.

   Пропорции взяты от реального человека ростом 1,80 м (канон «7,5 голов»):
   голова 0,235 м, длина плеча 0,32 м, предплечья 0,27 м, бедра 0,44 м,
   голени 0,42 м. Кисть разложена на пясть и три фаланги каждого пальца —
   это нужно, чтобы пальцы реально обхватывали цевьё и рукоятку, а
   указательный лежал на спуске.

   Иерархия задана плоским списком: имя, родитель, смещение от родителя
   в T-позе (метры, мировая ось). Дальше из него строится THREE.Skeleton.
   ========================================================================== */
(function (root, factory) {
  const S = factory(root.GUtil || (typeof require !== 'undefined' ? require('./util.js') : null));
  if (typeof module !== 'undefined' && module.exports) module.exports = S;
  else root.GSkel = S;
})(typeof self !== 'undefined' ? self : this, function (U) {
  'use strict';

  /* Опорные размеры, м. Меняя H, получаем бойцов разного роста. */
  function metrics(H, build) {
    const h = H / 1.80;                       // масштаб относительно эталона
    const b = build || 1;                     // «плотность» телосложения
    /* Высоты сняты с антропометрии взрослого мужчины 1,80 м.
       Раньше шея и голова сидели на 6–8 см ниже нормы: макушка выходила на
       1,68 м вместо 1,80 м, голова «тонула» в плечах и казалась мелкой. */
    return {
      H: H,
      hipY: 0.950 * h,                        // тазобедренный сустав
      waistY: 1.090 * h,
      chestY: 1.310 * h,
      neckY: 1.520 * h,                       // основание шеи, C7
      headY: 1.600 * h,                       // затылочный сустав (атлант)
      headC: 1.688 * h,                       // геометрический центр головы
      eyeY: 1.675 * h,
      chinY: 1.572 * h,
      topY: 1.800 * h,
      shoulderY: 1.452 * h,                   // акромион
      shoulderX: 0.196 * h * b,               // полуширина плеч по суставам
      upperArm: 0.300 * h,
      foreArm: 0.262 * h,
      hand: 0.100 * h,
      hipX: 0.092 * h,
      thigh: 0.435 * h,
      shin: 0.415 * h,
      foot: 0.265 * h,
      ankleY: 0.085 * h,
      /* обхваты (полуоси сечений) */
      chestRX: 0.196 * h * b, chestRZ: 0.124 * h * b,
      waistRX: 0.158 * h * b, waistRZ: 0.112 * h * b,
      hipRX: 0.172 * h * b, hipRZ: 0.120 * h * b,
      neckR: 0.062 * h * b,
      /* Голова: от подбородка до макушки 0,228 м — канонические «7,9 головы». */
      headRX: 0.079 * h, headRY: 0.114 * h, headRZ: 0.099 * h,
      armR: 0.049 * h * b, elbowR: 0.040 * h * b, wristR: 0.030 * h,
      thighR: 0.079 * h * b, kneeR: 0.058 * h * b, ankleR: 0.040 * h
    };
  }

  /* Пальцы: длины фаланг в долях длины кисти и разведение по пясти.
     Мизинец короче, большой палец сидит отдельно и противопоставлен. */
  const FINGERS = [
    { key: 'index',  spread: -0.024, ph: [0.045, 0.026, 0.020], base: 0.055, r: 0.0098 },
    { key: 'middle', spread: -0.002, ph: [0.049, 0.030, 0.021], base: 0.058, r: 0.0100 },
    { key: 'ring',   spread: 0.019,  ph: [0.045, 0.027, 0.019], base: 0.055, r: 0.0094 },
    { key: 'pinky',  spread: 0.038,  ph: [0.036, 0.020, 0.016], base: 0.050, r: 0.0082 }
  ];
  const THUMB = { ph: [0.038, 0.031, 0.024], r: 0.0115 };

  /* Построение списка костей. Каждая запись: {name, parent, pos:[x,y,z]},
     pos — смещение относительно родителя в системе покоя. */
  function build(M) {
    const B = [];
    /* Если у метрик есть суставы внешней модели (M.joints — мировые позиции
       в позе покоя), смещения костей берутся из них: скелет в точности
       совпадает со скелетом, к которому привязан меш. Иерархия и оси те же. */
    const J = M.joints;
    const add = (name, parent, pos) => {
      if (J && J[name] && (!parent || J[parent])) {
        const a = J[name], p = parent ? J[parent] : [0, 0, 0];
        pos = [a[0] - p[0], a[1] - p[1], a[2] - p[2]];
      }
      B.push({ name, parent, pos }); return name;
    };

    add('root', null, [0, 0, 0]);
    add('hips', 'root', [0, M.hipY, 0]);
    add('spine', 'hips', [0, M.waistY - M.hipY, 0]);
    add('chest', 'spine', [0, M.chestY - M.waistY, 0]);
    add('neck', 'chest', [0, M.neckY - M.chestY, 0]);
    add('head', 'neck', [0, M.headY - M.neckY, 0]);
    /* челюсть — для дыхания и небольшой мимики под балаклавой */
    add('jaw', 'head', [0, -0.028, -0.030]);

    for (const s of [1, -1]) {
      const S = s > 0 ? 'R' : 'L';
      /* ключица идёт от центра груди наружу и чуть вперёд */
      add('clav' + S, 'chest', [s * 0.040, M.shoulderY - M.chestY - 0.012, -0.012]);
      add('shoulder' + S, 'clav' + S, [s * (M.shoulderX - 0.040), 0.012, 0.012]);
      add('elbow' + S, 'shoulder' + S, [s * M.upperArm, 0, 0]);
      add('wrist' + S, 'elbow' + S, [s * M.foreArm, 0, 0]);
      add('palm' + S, 'wrist' + S, [s * 0.028, 0, 0]);
      /* Листовые кости скручивания: armTwist гасит скрутку плеча у дельты,
         foreTwist переносит пронацию кисти в предплечье. Веса им раздаёт
         загрузчик модели (packGeometry). */
      add('armTwist' + S, 'shoulder' + S, [s * M.upperArm * 0.35, 0, 0]);
      add('foreTwist' + S, 'elbow' + S, [s * M.foreArm * 0.6, 0, 0]);

      /* пальцы: пясть -> 3 фаланги. Ось X — вдоль руки наружу. */
      for (const f of FINGERS) {
        const p0 = f.key + S + '1';
        add(p0, 'palm' + S, [s * f.base, -0.004, f.spread]);
        add(f.key + S + '2', p0, [s * f.ph[0], 0, 0]);
        add(f.key + S + '3', f.key + S + '2', [s * f.ph[1], 0, 0]);
        add(f.key + S + '4', f.key + S + '3', [s * f.ph[2], 0, 0]);
      }
      /* большой палец: основание на ребре ладони, ось развёрнута */
      add('thumb' + S + '1', 'palm' + S, [s * 0.012, -0.010, -0.030]);
      add('thumb' + S + '2', 'thumb' + S + '1', [s * THUMB.ph[0], 0, -0.012]);
      add('thumb' + S + '3', 'thumb' + S + '2', [s * THUMB.ph[1], 0, -0.006]);
      add('thumb' + S + '4', 'thumb' + S + '3', [s * THUMB.ph[2], 0, 0]);

      /* ноги */
      add('hip' + S, 'hips', [s * M.hipX, -0.020, 0]);
      add('knee' + S, 'hip' + S, [0, -M.thigh, 0]);
      add('ankle' + S, 'knee' + S, [0, -M.shin, 0]);
      add('toe' + S, 'ankle' + S, [0, -0.045, -M.foot * 0.52]);
    }
    return B;
  }

  /* Мировые позиции костей в позе покоя — нужны генератору меша. */
  function restWorld(bones) {
    const map = {}, out = {};
    for (const b of bones) map[b.name] = b;
    const solve = (name) => {
      if (out[name]) return out[name];
      const b = map[name];
      const p = b.parent ? solve(b.parent) : [0, 0, 0];
      out[name] = [p[0] + b.pos[0], p[1] + b.pos[1], p[2] + b.pos[2]];
      return out[name];
    };
    for (const b of bones) solve(b.name);
    return out;
  }

  function indexOf(bones) {
    const m = {};
    for (let i = 0; i < bones.length; i++) m[bones[i].name] = i;
    return m;
  }

  /* Метрики по суставам внешней модели: те же поля, что у metrics(). */
  function metricsFromJoints(J, H) {
    const M = metrics(H || 1.80, 1);
    const d = (a, b) => Math.hypot(J[a][0] - J[b][0], J[a][1] - J[b][1], J[a][2] - J[b][2]);
    Object.assign(M, {
      joints: J,
      hipY: J.hips[1], waistY: J.spine[1], chestY: J.chest[1], neckY: J.neck[1], headY: J.head[1],
      shoulderY: J.shoulderR[1], shoulderX: J.shoulderR[0],
      upperArm: d('shoulderR', 'elbowR'), foreArm: d('elbowR', 'wristR'),
      hipX: J.hipR[0], thigh: d('hipR', 'kneeR'), shin: d('kneeR', 'ankleR'), ankleY: J.ankleR[1]
    });
    if (J.eyes) M.eyeY = J.eyes[1];
    if (J.top) { M.topY = J.top[1]; M.H = J.top[1]; }
    return M;
  }

  return { metrics, metricsFromJoints, build, restWorld, indexOf, FINGERS, THUMB };
});
/* ---- soldier/procedural.js ---- */
/* ============================================================================
   Боец, собранный из частей.

   Сначала — тело: туловище, плечевой пояс, руки, кисти с пятью пальцами
   (по три фаланги), ноги, голова. Каждая часть — параметрическая
   поверхность: профиль сечения, протянутый вдоль костей скелета. Веса
   костей считаются по положению вершины, поэтому на стыках (плечо, локоть,
   колено, фаланги) поверхность гнётся плавно.

   Затем — форма, надетая на те же функции поверхности: куртка с воротником
   и карманами на рукавах, брюки с накладными карманами и наколенниками,
   перчатки с защитой костяшек, ботинки со шнуровкой, плитник с подсумками,
   РПС-пояс, балаклава, шлем FAST или панама. Раз снаряжение строится от
   поверхности тела, оно всегда прилегает и нигде не висит в воздухе.

   Все четыре бойца — ОДИН и тот же код и одна геометрия. Отличаются только
   материалы (камуфляж, цвет снаряжения, нашивка), головной убор и
   балаклава/открытое лицо — тело и снаряжение у всех одинаковые.

   Система координат: метры, Y вверх, боец смотрит в -Z, правая сторона
   тела — +X. Геометрия считается для эталонного роста 1,80 м и
   масштабируется при записи вершины.
   ========================================================================== */
(function (root, factory) {
  const S = factory(root.GUtil, root.GBuf, root.GSkel);
  if (typeof module !== 'undefined' && module.exports) module.exports = S;
  else root.GSoldier = S;
})(typeof self !== 'undefined' ? self : this, function (U, B, SK) {
  'use strict';

  const TAU = Math.PI * 2;
  const { norm, cross, sub, add, scale, dot, len } = B;
  const ss = U.smoothstep, lerp = U.lerp;
  const gauss = (x) => Math.exp(-x * x);
  /* 1 внутри [a, b], мягкие края шириной soft */
  const band = (v, a, b, soft) => ss((v - a) / soft) * (1 - ss((v - b) / soft));
  const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

  /* Группы материалов: каждая едет в свой SkinnedMesh.
     hat   — панама (ткань формы), прячется в виде от первого лица;
     patch — нашивки с эмблемой подразделения;
     rubber— подошва, шнурки и резинки;
     head*  — снаряжение головы (ремешок, рельсы, гарнитура, шнуры) с теми же
              материалами, что gear/hard/rubber, но отдельными мешами: в виде
              от первого лица их прячут вместе со шлемом. */
  const GROUPS = ['uniform', 'skin', 'glove', 'gear', 'mask', 'helmet', 'hat',
    'boot', 'rubber', 'hard', 'eye', 'hair', 'patch', 'headGear', 'headHard', 'headRubber'];

  function newGroups() {
    const g = {};
    for (const k of GROUPS) g[k] = new B.Buf();
    return g;
  }

  /* ---------------------------------------------------------------- веса */
  /* {chest: 0.7, spine: 0.3} -> [[idx, w], ...], не больше четырёх костей */
  function makeW(BI) {
    return function (o) {
      const out = [];
      for (const k in o) {
        const w = o[k];
        if (!(w > 1e-4)) continue;
        if (BI[k] === undefined) throw new Error('нет кости ' + k);
        out.push([BI[k], w]);
      }
      out.sort((a, b) => b[1] - a[1]);
      const r = out.slice(0, 4);
      let t = 0;
      for (const e of r) t += e[1];
      for (const e of r) e[1] /= t || 1;
      return r.length ? r : [[0, 1]];
    };
  }

  /* Часть меша: буфер группы + функция весов по положению вершины. */
  function Part(K, buf, wfn) { this.K = K; this.buf = buf; this.wfn = wfn; }
  Part.prototype.v = function (p, uv) {
    const h = this.K.h;
    return this.buf.vertex([p[0] * h, p[1] * h, p[2] * h], [0, 1, 0], uv || [0, 0], this.wfn(p));
  };

  /* Профиль по таблице [ключ, ...значения] (ключи по возрастанию).
     Между строками — Catmull-Rom: силуэт без изломов. */
  function table(rows) {
    const keys = rows.map((r) => r[0]);
    const cols = [];
    for (let c = 1; c < rows[0].length; c++) cols.push(rows.map((r) => r[c]));
    const n = rows.length;
    return function (k) {
      let i = 0;
      if (k >= keys[n - 1]) i = n - 2;
      else while (i < n - 2 && k > keys[i + 1]) i++;
      const f = U.clamp01((k - keys[i]) / (keys[i + 1] - keys[i]));
      const t = (i + f) / (n - 1);
      return cols.map((col) => U.splineAt(col, t));
    };
  }

  /* ------------------------------------------------------- сетки и тела */
  /* Сетка (NU+1)×(NV+1) по параметрической поверхности P(u, v).
     Ориентация граней выбирается голосованием по подсказке out(p, u, v):
     нормаль обязана смотреть наружу, иначе грань отсечётся как задняя. */
  function grid(part, NU, NV, P, o) {
    o = o || {};
    const uvs = o.uv || [NU / 12, NV / 12];
    const rows = [];
    for (let j = 0; j <= NV; j++) {
      const row = [];
      for (let i = 0; i <= NU; i++) {
        const u = i / NU, v = j / NV;
        row.push(part.v(P(o.wrapU && i === NU ? 0 : u, v), o.uvFn ? o.uvFn(u, v) : [u * uvs[0], v * uvs[1]]));
      }
      rows.push(row);
    }
    const pos = part.buf.pos, h = part.K.h;
    const at = (k) => [pos[k * 3] / h, pos[k * 3 + 1] / h, pos[k * 3 + 2] / h];
    let flip = false;
    if (o.out) {
      let vote = 0;
      for (let j = 0; j < NV; j++) {
        for (let i = 0; i < NU; i++) {
          const a = at(rows[j][i]);
          const n = cross(sub(at(rows[j][i + 1]), a), sub(at(rows[j + 1][i]), a));
          if (len(n) < 1e-14) continue;
          vote += Math.sign(dot(n, o.out(a, i / NU, j / NV)));
        }
      }
      flip = vote < 0;
    }
    for (let j = 0; j < NV; j++) {
      for (let i = 0; i < NU; i++) {
        if (o.skip && o.skip(i, j)) continue;
        const a = rows[j][i], b = rows[j][i + 1], c = rows[j + 1][i + 1], d = rows[j + 1][i];
        if (flip) part.buf.quad(a, d, c, b); else part.buf.quad(a, b, c, d);
      }
    }
    return rows;
  }

  /* Труба по списку колец: ring(θ) -> точка. */
  function tube(part, rings, NU, out) {
    const NV = rings.length - 1;
    return grid(part, NU, NV, (u, v) => rings[Math.round(v * NV)](u * TAU), { wrapU: true, out });
  }

  /* Толстая накладка на поверхность S(u,v) -> [точка, нормаль наружу].
     Низ на отступе t0, верх — t0 + t1(u,v); торцы замкнуты. Этим строятся
     карманы, ремни, камербанд, стропы MOLLE, липучки, наколенники. */
  function slab(part, NU, NV, S, o) {
    const T0 = typeof o.t0 === 'function' ? o.t0 : () => (o.t0 || 0);
    const T1 = typeof o.t1 === 'function' ? o.t1 : () => o.t1;
    const top = (u, v) => { const s = S(u, v); return add(s[0], scale(s[1], T0(u, v) + T1(u, v))); };
    const bot = (u, v) => { const s = S(u, v); return add(s[0], scale(s[1], T0(u, v))); };
    const e = 1e-3;
    const tanU = (u, v) => sub(S(Math.min(1, u + e), v)[0], S(Math.max(0, u - e), v)[0]);
    const tanV = (u, v) => sub(S(u, Math.min(1, v + e))[0], S(u, Math.max(0, v - e))[0]);
    grid(part, NU, NV, top, { wrapU: o.wrapU, uv: o.uv, out: (p, u, v) => S(u, v)[1] });
    if (!o.noBottom) grid(part, NU, NV, bot, { wrapU: o.wrapU, out: (p, u, v) => scale(S(u, v)[1], -1) });
    if (!o.wrapU) {
      grid(part, NV, 1, (a, w) => (w ? top : bot)(0, a), { out: (p, a) => scale(tanU(0, a), -1) });
      grid(part, NV, 1, (a, w) => (w ? top : bot)(1, a), { out: (p, a) => tanU(1, a) });
    }
    grid(part, NU, 1, (a, w) => (w ? top : bot)(a, 0), { wrapU: o.wrapU, out: (p, a) => scale(tanV(a, 0), -1) });
    grid(part, NU, 1, (a, w) => (w ? top : bot)(a, 1), { wrapU: o.wrapU, out: (p, a) => tanV(a, 1) });
  }

  /* Протяжка сечения вдоль пути. nrm[i] — нормаль поверхности, на которой
     лежит лента; shape(θ) -> [вдоль ширины, вдоль нормали]. */
  function sweep(part, pts, nrm, shape, NS, o) {
    o = o || {};
    const n = pts.length;
    const F = pts.map((p, i) => {
      const t = norm(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]));
      const N = norm(sub(nrm[i], scale(t, dot(nrm[i], t))));
      return { p, t, N, b: cross(t, N) };
    });
    const at = (i, th) => {
      const s = shape(th, i / (n - 1));
      return add(F[i].p, add(scale(F[i].b, s[0]), scale(F[i].N, s[1])));
    };
    grid(part, NS, n - 1, (u, v) => at(Math.round(v * (n - 1)), u * TAU),
      { wrapU: true, out: (p, u, v) => sub(p, F[Math.round(v * (n - 1))].p) });
    if (o.caps) {
      for (const [i, sg] of [[0, -1], [n - 1, 1]]) {
        const c = part.v(F[i].p);
        const ring = [];
        for (let k = 0; k < NS; k++) ring.push(part.v(at(i, (k / NS) * TAU)));
        const a = at(i, 0), b = at(i, TAU / NS);
        const fl = dot(cross(sub(a, F[i].p), sub(b, F[i].p)), scale(F[i].t, sg)) < 0;
        for (let k = 0; k < NS; k++) {
          const k2 = (k + 1) % NS;
          if (fl) part.buf.tri(c, ring[k2], ring[k]); else part.buf.tri(c, ring[k], ring[k2]);
        }
      }
    }
  }

  /* Сглаживание ломаной (Чайкин) — ровные ремни и канты. */
  function chaikin(pts, it) {
    let P = pts;
    for (let k = 0; k < (it || 1); k++) {
      const Q = [P[0]];
      for (let i = 0; i < P.length - 1; i++) {
        Q.push(B.lerp3(P[i], P[i + 1], 0.25), B.lerp3(P[i], P[i + 1], 0.75));
      }
      Q.push(P[P.length - 1]);
      P = Q;
    }
    return P;
  }

  function quatFromBasis(ex, ey, ez) {
    const m00 = ex[0], m01 = ey[0], m02 = ez[0];
    const m10 = ex[1], m11 = ey[1], m12 = ez[1];
    const m20 = ex[2], m21 = ey[2], m22 = ez[2];
    const tr = m00 + m11 + m22;
    let x, y, z, w, s;
    if (tr > 0) { s = 0.5 / Math.sqrt(tr + 1); w = 0.25 / s; x = (m21 - m12) * s; y = (m02 - m20) * s; z = (m10 - m01) * s; }
    else if (m00 > m11 && m00 > m22) { s = 2 * Math.sqrt(1 + m00 - m11 - m22); w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s; }
    else if (m11 > m22) { s = 2 * Math.sqrt(1 + m11 - m00 - m22); w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s; }
    else { s = 2 * Math.sqrt(1 + m22 - m00 - m11); w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s; }
    return [x, y, z, w];
  }

  /* Базис «наружу n, вверх up»: ex — вбок, ey — вверх по поверхности. */
  function basisN(n, up) {
    const ez = norm(n);
    const ex = norm(cross(up || [0, 1, 0], ez));
    const ey = cross(ez, ex);
    return [ex, ey, ez];
  }

  /* Скруглённый бокс; веса раздаются по положению вершин. */
  function box(part, c, size, basis, r, seg) {
    const start = part.buf.count();
    const h = part.K.h;
    B.roundBox(part.buf, {
      center: [c[0] * h, c[1] * h, c[2] * h],
      size: [size[0] * h, size[1] * h, size[2] * h],
      radius: (r === undefined ? 0.006 : r) * h, seg: seg || 3,
      quat: basis ? quatFromBasis(basis[0], basis[1], basis[2]) : null
    });
    const b = part.buf;
    for (let k = start; k < b.count(); k++) {
      const w = part.wfn([b.pos[k * 3] / h, b.pos[k * 3 + 1] / h, b.pos[k * 3 + 2] / h]);
      for (let i = 0; i < 4; i++) {
        b.skinIndex[k * 4 + i] = w[i] ? w[i][0] : 0;
        b.skinWeight[k * 4 + i] = w[i] ? w[i][1] : 0;
      }
    }
  }

  /* ============================================================ ТУЛОВИЩЕ */
  /* Сечения куртки по высоте: [y, полуширина, перед, спина, степень].
     Это тело плюс ~1 см ткани. Ниже 0,95 — подол, свободно лежащий на
     брюках; выше 1,44 — плечевой скат и трапеция к шее. */
  const TORSO = table([
    [0.855, 0.198, 0.124, 0.146, 2.4],
    [0.900, 0.193, 0.120, 0.140, 2.4],
    [0.950, 0.184, 0.115, 0.132, 2.4],
    [1.000, 0.175, 0.112, 0.121, 2.4],
    [1.060, 0.168, 0.113, 0.111, 2.4],
    [1.120, 0.170, 0.119, 0.109, 2.4],
    [1.200, 0.178, 0.127, 0.113, 2.4],
    [1.270, 0.189, 0.134, 0.119, 2.5],
    [1.330, 0.198, 0.137, 0.123, 2.5],
    [1.390, 0.204, 0.128, 0.122, 2.5],
    [1.435, 0.200, 0.110, 0.110, 2.6],
    [1.465, 0.184, 0.095, 0.098, 2.5],
    [1.490, 0.150, 0.086, 0.090, 2.3],
    [1.510, 0.110, 0.080, 0.083, 2.2],
    [1.530, 0.082, 0.073, 0.075, 2.1],
    [1.550, 0.071, 0.068, 0.069, 2.0],
    [1.570, 0.068, 0.066, 0.066, 2.0]
  ]);

  /* θ = 0 — правый бок (+X), θ = π/2 — грудь (-Z), π — левый бок, 3π/2 — спина. */
  function torsoPt(K, y, th, smooth) {
    const pr = TORSO(y);
    /* свободный крой куртки: чуть шире тела, у горловины — по шее */
    const kb = 1 + 0.035 * (1 - ss((y - 1.47) / 0.06));
    const rx = pr[0] * kb, zf = pr[1] * kb, zb = pr[2] * kb, e = 2 / pr[3];
    const c = Math.cos(th), s = Math.sin(th);
    const X = rx * spow(c, e);
    let Z = (s >= 0 ? zf : zb) * spow(s, e);
    const ax = Math.abs(X);
    if (s > 0) {
      Z += 0.008 * gauss((ax - 0.085) / 0.05) * gauss((y - 1.33) / 0.05) * s;            // грудные
    } else {
      Z -= 0.006 * gauss((ax - 0.09) / 0.045) * gauss((y - 1.37) / 0.06) * (-s);          // лопатки
      Z += 0.005 * gauss(X / 0.02) * band(y, 1.06, 1.42, 0.04) * (-s);                    // ложбина позвоночника
    }
    let f = 1;
    if (!smooth) {
      /* ткань: крупные мягкие складки + мелкая рябь; ниже жилета —
         горизонтальные заломы там, где куртку прижимает пояс */
      f += (K.n1(th * 1.7 + 3.1, y * 9) - 0.5) * 0.030 + (K.n2(th * 4.1, y * 26) - 0.5) * 0.010;
      f += band(y, 0.88, 1.07, 0.02) * 0.010 * Math.sin(y * 160 + 7 * K.n1(th * 1.3, y * 3));
    }
    return [X * f, y, -Z * f];
  }

  function torsoN(K, y, th) {
    const e = 1e-3;
    const dth = sub(torsoPt(K, y, th + e, true), torsoPt(K, y, th - e, true));
    const dy = sub(torsoPt(K, y + e, th, true), torsoPt(K, y - e, th, true));
    return norm(cross(dth, dy));
  }

  /* θ точки на груди (back = false) или спине с заданной координатой x. */
  function torsoTheta(y, x, back) {
    const pr = TORSO(y), rx = pr[0] * (1 + 0.035 * (1 - ss((y - 1.47) / 0.06))), e = 2 / pr[3];
    const xc = Math.max(-rx * 0.999, Math.min(rx * 0.999, x));
    let lo = back ? Math.PI : 0, hi = back ? TAU : Math.PI;
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2, X = rx * spow(Math.cos(m), e);
      if (back ? X < xc : X > xc) lo = m; else hi = m;
    }
    return (lo + hi) / 2;
  }

  function insideTorso(p) {
    const pr = TORSO(p[1]);
    const kb = 1 + 0.035 * (1 - ss((p[1] - 1.47) / 0.06));
    const Z = -p[2];
    const rz = (Z >= 0 ? pr[1] : pr[2]) * kb;
    return Math.pow(Math.abs(p[0]) / (pr[0] * kb), pr[3]) + Math.pow(Math.abs(Z) / rz, pr[3]) < 1;
  }

  function torsoW(K) {
    return (p) => {
      const y = p[1], ax = Math.abs(p[0]), S = p[0] >= 0 ? 'R' : 'L';
      const t1 = ss((y - 0.97) / 0.15), t2 = ss((y - 1.15) / 0.17);
      const t3 = ss((y - 1.50) / 0.05), t4 = ss((y - 1.585) / 0.03);
      /* плечевой пояс: верх куртки у плеча идёт за рукой */
      const k = ss((ax - 0.11) / 0.09) * ss((y - 1.36) / 0.07) * 0.5;
      /* низ подола у бёдер слегка тянется за ногой */
      const g = (1 - ss((y - 0.86) / 0.12)) * ss((ax - 0.03) / 0.07) * 0.45;
      const r = 1 - k - g;
      const o = {
        hips: (1 - t1) * r, spine: t1 * (1 - t2) * r, chest: t2 * (1 - t3) * r,
        neck: t3 * (1 - t4) * r, head: t4 * r
      };
      o['clav' + S] = k * 0.55;
      o['shoulder' + S] = k * 0.45;
      o['hip' + S] = g;
      return K.W(o);
    };
  }

  /* Жилет и пояс — жёсткие: почти целиком на груди/тазе, без «перегиба». */
  function vestW(K) {
    return (p) => {
      const t = ss((p[1] - 1.05) / 0.12);
      return K.W({ chest: t, spine: (1 - t) * 0.8, hips: (1 - t) * 0.2 });
    };
  }
  function beltW(K) { return () => K.W({ hips: 1 }); }

  function buildTorso(K) {
    const part = new Part(K, K.G.uniform, torsoW(K));
    const out = (p) => [p[0], 0, p[2]];
    const shrink = (y, k) => (t) => { const p = torsoPt(K, y, t); return [p[0] * k, y, p[2] * k]; };
    const rings = [shrink(0.885, 0.955), shrink(0.864, 0.978)];
    for (let y = 0.855; y <= 1.5705; y += 0.0105) rings.push(((yy) => (t) => torsoPt(K, yy, t))(y));
    tube(part, rings, 72, out);

    /* Дно горловины: в виде от первого лица сквозь неё не должно быть
       видно «пустоты» внутри корпуса. */
    const capP = new Part(K, K.G.rubber, torsoW(K));
    grid(capP, 24, 1, (u, v) => {
      const p = torsoPt(K, 1.548, u * TAU, true);
      return [p[0] * (1 - v), 1.548, p[2] * (1 - v) + 0.004 * v];
    }, { wrapU: true, out: () => [0, 1, 0] });

    /* Стойка воротника: открыта спереди, толщина 4,5 мм. */
    const col = new Part(K, K.G.uniform, torsoW(K));
    const open = 0.30;
    slab(col, 40, 5, (u, v) => {
      const th = Math.PI / 2 + open + u * (TAU - 2 * open);
      const y = lerp(1.512, 1.588, v);
      const rx = lerp(0.086, 0.079, v), zf = lerp(0.082, 0.076, v), zb = lerp(0.083, 0.078, v);
      const c = Math.cos(th), s = Math.sin(th);
      const rz = s >= 0 ? zf : zb;
      return [[rx * c, y, -rz * s + 0.004], norm([c / rx, 0, -s / rz])];
    }, { t0: 0, t1: 0.0045 });

    /* Планка молнии ниже жилета. */
    const plk = new Part(K, K.G.uniform, torsoW(K));
    slab(plk, 2, 12, (u, v) => {
      const y = lerp(0.858, 1.10, v), x = lerp(0.017, -0.017, u);
      const th = torsoTheta(y, x, false);
      return [torsoPt(K, y, th, true), torsoN(K, y, th)];
    }, { t0: 0.002, t1: 0.0025 });
  }

  /* Таз брюк под подолом: закрывает промежность между бёдрами. */
  const PELVIS = table([
    [0.800, 0.050, 0.040, 0.050],
    [0.830, 0.118, 0.082, 0.096],
    [0.870, 0.158, 0.100, 0.118],
    [0.930, 0.170, 0.106, 0.126],
    [1.000, 0.165, 0.105, 0.118]
  ]);
  function buildPelvis(K) {
    const part = new Part(K, K.G.uniform, torsoW(K));
    const rings = [];
    for (let y = 0.80; y <= 1.0001; y += 0.01) {
      rings.push(((yy) => (t) => {
        const pr = PELVIS(yy), c = Math.cos(t), s = Math.sin(t);
        return [pr[0] * spow(c, 0.85), yy, -(s >= 0 ? pr[1] : pr[2]) * spow(s, 0.85)];
      })(y));
    }
    tube(part, rings, 40, (p) => [p[0], p[1] - 0.95, p[2]]);
  }

  /* ================================================================ РУКИ */
  /* Рукав по оси руки (T-поза, рука вдоль ±X): [x наружу, верх, низ, перед,
     зад, сдвиг центра]. В начале рукав сидит глубоко в корпусе, у сустава
     даёт дельту, дальше — бицепс, локоть, предплечье и манжет. */
  const ARM = table([
    [0.110, 0.040, 0.078, 0.088, 0.088, 0.000],
    [0.150, 0.042, 0.071, 0.078, 0.078, 0.000],
    [0.190, 0.046, 0.064, 0.067, 0.068, 0.000],
    [0.230, 0.051, 0.059, 0.061, 0.063, -0.001],
    [0.270, 0.053, 0.055, 0.058, 0.060, -0.002],
    [0.330, 0.050, 0.052, 0.055, 0.056, -0.003],
    [0.400, 0.047, 0.049, 0.052, 0.052, -0.004],
    [0.460, 0.045, 0.047, 0.048, 0.049, -0.004],
    [0.500, 0.044, 0.046, 0.046, 0.050, -0.004],
    [0.550, 0.046, 0.047, 0.046, 0.046, -0.004],
    [0.610, 0.044, 0.045, 0.043, 0.043, -0.004],
    [0.670, 0.041, 0.042, 0.040, 0.040, -0.004],
    [0.715, 0.039, 0.040, 0.038, 0.038, -0.004],
    [0.742, 0.041, 0.042, 0.040, 0.040, -0.004]
  ]);

  /* θ = 0 — верх руки (в опущенной руке это наружная сторона), π/2 — перед. */
  function armPt(K, s, x, th, smooth) {
    const pr = ARM(x);
    const c = Math.cos(th), sn = Math.sin(th);
    /* рукав свободнее руки */
    const kb = 1 + 0.15 * ss((x - 0.2) / 0.08) * (1 - 0.45 * ss((x - 0.66) / 0.06));
    const ry = (c >= 0 ? pr[0] : pr[1]) * kb;
    let rz = (sn >= 0 ? pr[2] : pr[3]) * kb;
    let f = 1;
    if (!smooth) {
      /* налокотник, вшитый в рукав */
      if (sn < 0) rz += 0.006 * gauss((x - 0.50) / 0.03) * Math.pow(-sn, 2);
      /* заломы на сгибе локтя */
      if (sn > 0) f -= 0.07 * Math.max(0, Math.sin((x - 0.5) * TAU / 0.024)) * gauss((x - 0.5) / 0.035) * sn;
      /* ткань собирается в подмышке и тянется диагоналями от неё к бицепсу */
      if (c < 0) f += 0.05 * band(x, 0.15, 0.27, 0.03) * Math.sin(th * 6 + x * 70 + 3 * K.n1(x * 5, s)) * (-c);
      f += 0.022 * band(x, 0.24, 0.44, 0.04) * Math.sin((x * 42 + th * 1.6 * s) * TAU / 2.4);
      /* напуск над манжетой: рукав шире предплечья и лежит гармошкой */
      f += 0.045 * band(x, 0.62, 0.715, 0.015) * Math.max(0, Math.sin(x * 390 + 4 * K.n1(th * 1.2 + s, 2.1)));
      /* мягкие складки ткани */
      f += (K.n1(th * 1.4 + s * 5, x * 8) - 0.5) * 0.06 + (K.n2(th * 3 + s, x * 22) - 0.5) * 0.02;
      /* манжет стянут липучкой */
      f += band(x, 0.724, 0.75, 0.006) * 0.03;
    }
    return [s * x, 1.452 + pr[4] + ry * c * f, -rz * sn * f];
  }

  function armN(K, s, x, th) {
    const e = 1e-3;
    const a = sub(armPt(K, s, x, th + e, true), armPt(K, s, x, th - e, true));
    const b = sub(armPt(K, s, x + e, th, true), armPt(K, s, x - e, th, true));
    const n = norm(cross(a, b));
    const p = armPt(K, s, x, th, true);
    return dot(n, [0, p[1] - 1.452, p[2]]) < 0 ? scale(n, -1) : n;
  }

  function armW(K, s) {
    const S = s > 0 ? 'R' : 'L';
    return (p) => {
      const x = s * p[0];
      const a = ss((x - 0.09) / 0.07);
      const b = ss((x - 0.13) / 0.085);
      const c = ss((x - 0.466) / 0.06);
      const d = ss((x - 0.70) / 0.055);
      const o = { chest: 1 - a };
      o['clav' + S] = a * (1 - b);
      o['shoulder' + S] = a * b * (1 - c);
      o['elbow' + S] = a * b * c * (1 - d);
      o['wrist' + S] = a * b * c * d;
      return K.W(o);
    };
  }

  function buildArm(K, s) {
    const part = new Part(K, K.G.uniform, armW(K, s));
    const rings = [];
    for (let x = 0.11; x <= 0.7425; x += 0.0095) rings.push(((xx) => (t) => armPt(K, s, xx, t))(x));
    /* подгиб манжета внутрь */
    const hem = (x, k) => (t) => { const p = armPt(K, s, 0.742, t); return [s * x, 1.448 + (p[1] - 1.448) * k, p[2] * k]; };
    rings.push(hem(0.745, 0.90), hem(0.72, 0.86));
    tube(part, rings, 44, (p) => [0, p[1] - 1.45, p[2]]);

    /* Карман на плече с клапаном; на левом — нашивка подразделения. */
    const pk = new Part(K, K.G.uniform, armW(K, s));
    const pocket = (u, v) => {
      const th = lerp(-0.78, 0.78, u), x = lerp(0.262, 0.382, v);
      return [armPt(K, s, x, th, true), armN(K, s, x, th)];
    };
    const pth = (u, v) => 0.009 * (0.35 + 0.65 * ss(Math.min(u, 1 - u, v * 1.5, 1 - v) / 0.18));
    slab(pk, 10, 8, pocket, { t0: 0.001, t1: pth });
    slab(pk, 10, 3, (u, v) => {
      const th = lerp(-0.84, 0.84, u), x = lerp(0.252, 0.296, v);
      return [armPt(K, s, x, th, true), armN(K, s, x, th)];
    }, { t0: (u, v) => 0.0015 + pth(U.clamp01((u - 0.04) / 0.92), U.clamp01((v * 0.044 + 0.252 - 0.262) / 0.12)), t1: 0.0035 });
    const patchP = new Part(K, s < 0 ? K.G.patch : K.G.gear, armW(K, s));
    slab(patchP, 6, 6, (u, v) => {
      const th = lerp(0.36, -0.36, u), x = lerp(0.372, 0.305, v);
      return [armPt(K, s, x, th, true), armN(K, s, x, th)];
    }, { t0: (u, v) => 0.001 + pth(0.5 + (u - 0.5) * 0.46, 0.35 + v * 0.55), t1: 0.0022, uv: [1, 1] });
  }

  /* =============================================================== КИСТИ */
  function handW(K, s) {
    const S = s > 0 ? 'R' : 'L';
    return (p) => {
      const d = ss((s * p[0] - 0.700) / 0.045);
      const o = {};
      o['elbow' + S] = 1 - d;
      o['wrist' + S] = d;
      return K.W(o);
    };
  }

  /* Палец (или большой палец) по цепочке точек J[0..3]; кончик скруглён.
     radK — множители радиуса в суставах. */
  function buildFinger(K, part, s, J, r, back, radK) {
    const RK = radK || [1.04, 1.0, 0.94, 0.88];
    const ax = norm(sub(J[1], J[0]));
    const start = sub(J[0], scale(ax, back));
    const segs = [[start, J[0], RK[0], RK[0]], [J[0], J[1], RK[0], RK[1]], [J[1], J[2], RK[1], RK[2]], [J[2], J[3], RK[2], RK[3]]];
    const rings = [];
    const ring = (c, a, rr) => {
      /* сечение чуть сплющено: ладонная сторона площе */
      let up = [0, 1, 0];
      const sd = norm(cross(up, a));
      up = cross(a, sd);
      return (t) => {
        const cy = Math.sin(t), cx = Math.cos(t);
        const ry = rr * (cy < 0 ? 0.84 : 0.92);
        return add(c, add(scale(sd, rr * cx), scale(up, ry * cy)));
      };
    };
    for (let k = 0; k < segs.length; k++) {
      const [A, Bp, ra, rb] = segs[k];
      const a = norm(sub(Bp, A));
      const n = k === 0 ? 2 : 4;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        /* между суставами фаланга чуть тоньше */
        const pinch = k > 0 ? 1 - 0.06 * Math.sin(Math.PI * t) : 1;
        rings.push(ring(B.lerp3(A, Bp, t), a, r * lerp(ra, rb, t) * pinch));
      }
    }
    const aT = norm(sub(J[3], J[2]));
    const rt = r * RK[3];
    for (let i = 0; i <= 5; i++) {
      const g = (i / 5) * Math.PI / 2;
      rings.push(ring(add(J[3], scale(aT, rt * 0.2 + Math.sin(g) * rt * 0.95)), aT, Math.max(rt * Math.cos(g), rt * 0.05)));
    }
    const C = [start].concat(J);
    tube(part, rings, 14, (p) => {
      let best = J[0], bd = 1e9;
      for (let k = 0; k < C.length - 1; k++) {
        const d = sub(C[k + 1], C[k]);
        const t = U.clamp01(dot(sub(p, C[k]), d) / dot(d, d));
        const q = add(C[k], scale(d, t));
        const dd = len(sub(p, q));
        if (dd < bd) { bd = dd; best = q; }
      }
      return sub(p, best);
    });
  }

  /* Перчатка: манжет, ладонь, пять пальцев, накладка на костяшки. */
  function buildHand(K, s) {
    const S = s > 0 ? 'R' : 'L';
    const R = (n) => K.R(n);
    const gl = new Part(K, K.G.glove, handW(K, s));
    /* [x, полуширина (z), полутолщина (y), центр z, центр y, степень] */
    const PALM = table([
      [0.700, 0.034, 0.028, 0.004, 0.000, 2.2],
      [0.745, 0.031, 0.022, 0.004, -0.001, 2.4],
      [0.775, 0.037, 0.019, 0.005, -0.002, 2.8],
      [0.805, 0.043, 0.018, 0.007, -0.003, 3.0],
      [0.832, 0.044, 0.016, 0.007, -0.003, 3.0],
      [0.848, 0.041, 0.013, 0.007, -0.003, 2.8],
      [0.856, 0.030, 0.008, 0.007, -0.003, 2.4]
    ]);
    const palmPt = (x, th) => {
      const pr = PALM(x), c = Math.cos(th), sn = Math.sin(th), e = 2 / pr[4];
      let ry = pr[1];
      /* мякоть ладони пухлее тыльной стороны */
      if (sn < 0) ry *= 1.12 + 0.12 * gauss((x - 0.79) / 0.03);
      return [s * x, 1.452 + pr[3] + ry * spow(sn, e), pr[2] - pr[0] * spow(c, e)];
    };
    const rings = [];
    for (let x = 0.700; x <= 0.8561; x += 0.0065) rings.push(((xx) => (t) => palmPt(xx, t))(x));
    tube(gl, rings, 32, (p) => [0, p[1] - 1.45, p[2] - 0.006]);
    /* липучка манжета на тыльной стороне */
    slab(new Part(K, K.G.glove, handW(K, s)), 3, 3, (u, v) => {
      const x = lerp(0.712, 0.752, u), z = lerp(-0.012, 0.024, v);
      const pr = PALM(x);
      return [[s * x, 1.452 + pr[3] + pr[1], z], [0, 1, 0]];
    }, { t0: 0.0005, t1: 0.0035 });

    /* Пальцы: суставы берутся из скелета, фаланги утолщены в суставах. */
    const fingers = SK.FINGERS.map((f) => ({ key: f.key, r: f.r / K.h + 0.0017, bones: [1, 2, 3, 4].map((i) => f.key + S + i) }));
    for (const f of fingers) {
      const J = f.bones.map((b) => R(b));
      const W = (p) => {
        const x = s * p[0];
        const x1 = s * J[0][0], x2 = s * J[1][0], x3 = s * J[2][0];
        const a = ss((x - (x1 - 0.010)) / 0.012);
        const b = ss((x - (x2 - 0.005)) / 0.010);
        const c = ss((x - (x3 - 0.004)) / 0.008);
        const o = {};
        o['wrist' + S] = 1 - a;
        o[f.bones[0]] = a * (1 - b);
        o[f.bones[1]] = a * b * (1 - c);
        o[f.bones[2]] = a * b * c;
        return K.W(o);
      };
      buildFinger(K, new Part(K, K.G.glove, W), s, J, f.r, 0.014);
    }
    /* большой палец: возвышение от запястья + две фаланги */
    const T = [1, 2, 3, 4].map((i) => R('thumb' + S + i));
    const TW = (p) => {
      const d1 = sub(T[1], T[0]);
      const t = dot(sub(p, T[0]), d1) / dot(d1, d1);
      const d3 = sub(T[3], T[2]);
      const t3 = dot(sub(p, T[2]), d3) / dot(d3, d3);
      const a = ss((t + 0.6) / 0.6);
      const b = ss((t - 0.85) / 0.3);
      const c = ss((t3 + 0.15) / 0.3);
      const o = {};
      o['wrist' + S] = 1 - a;
      o['thumb' + S + '1'] = a * (1 - b);
      o['thumb' + S + '2'] = a * b * (1 - c);
      o['thumb' + S + '3'] = a * b * c;
      return K.W(o);
    };
    const base = [s * 0.772, 1.444, -0.012];
    buildFinger(K, new Part(K, K.G.glove, TW), s, [base, T[1], T[2], T[3]], 0.0138, 0.004,
      [0.0175 / 0.0138, 1.0, 0.95, 0.9]);

    /* Жёсткая накладка на костяшки. */
    slab(new Part(K, K.G.hard, handW(K, s)), 8, 4, (u, v) => {
      const x = lerp(0.812, 0.852, v), th = lerp(0.35, 2.75, u);
      const p = palmPt(x, th);
      const q = palmPt(x, th + 0.01);
      const r2 = palmPt(Math.min(0.856, x + 0.004), th);
      let n = norm(cross(sub(q, p), sub(r2, p)));
      if (n[1] < 0) n = scale(n, -1);
      return [p, n];
    }, { t0: 0.0012, t1: (u, v) => 0.0055 * (0.4 + 0.6 * ss(Math.min(u, 1 - u, v, 1 - v) / 0.2)) });
    /* Накладка из искусственной замши на ладони: от основания пальцев до
       запястья, по ребру ладони заходит на бок. */
    slab(new Part(K, K.G.hard, handW(K, s)), 10, 6, (u, v) => {
      const x = lerp(0.762, 0.851, v), th = lerp(Math.PI + 0.28, TAU - 0.28, u);
      const p = palmPt(x, th);
      const q = palmPt(x, th + 0.01);
      const r2 = palmPt(Math.min(0.856, x + 0.004), th);
      let n = norm(cross(sub(q, p), sub(r2, p)));
      if (n[1] > 0) n = scale(n, -1);
      return [p, n];
    }, { t0: 0.0006, t1: (u, v) => 0.0018 * (0.4 + 0.6 * ss(Math.min(u, 1 - u, v, 1 - v) / 0.15)) });
    /* накладки на основные фаланги */
    for (const f of fingers) {
      const J = f.bones.map((b) => R(b));
      const c = B.lerp3(J[0], J[1], 0.55);
      box(new Part(K, K.G.hard, () => K.W({ [f.bones[0]]: 1 })),
        [c[0], c[1] + f.r * 0.92, c[2]], [0.009, 0.0022, f.r * 0.72], null, 0.002, 2);
    }
  }

  /* ================================================================ НОГИ */
  /* Брючина: [y, наружу, внутрь, перед, зад, сдвиг центра наружу]. */
  const LEG = table([
    [0.185, 0.046, 0.044, 0.050, 0.052, 0.000],
    [0.205, 0.054, 0.052, 0.058, 0.060, 0.000],
    [0.235, 0.057, 0.055, 0.059, 0.063, 0.000],
    [0.270, 0.050, 0.048, 0.050, 0.060, 0.000],
    [0.340, 0.053, 0.050, 0.052, 0.068, 0.000],
    [0.410, 0.055, 0.052, 0.054, 0.068, 0.000],
    [0.470, 0.056, 0.054, 0.058, 0.060, 0.000],
    [0.520, 0.059, 0.056, 0.064, 0.058, 0.000],
    [0.580, 0.066, 0.060, 0.068, 0.066, 0.000],
    [0.680, 0.075, 0.066, 0.076, 0.078, 0.002],
    [0.780, 0.082, 0.071, 0.082, 0.088, 0.004],
    [0.860, 0.087, 0.075, 0.090, 0.102, 0.006],
    [0.930, 0.090, 0.079, 0.096, 0.116, 0.006],
    [1.000, 0.092, 0.080, 0.100, 0.120, 0.004]
  ]);

  /* θ = 0 — наружная сторона, π/2 — перед, π — внутренняя, 3π/2 — зад. */
  function legPt(K, s, y, th, smooth) {
    const pr = LEG(y);
    const c = Math.cos(th), sn = Math.sin(th);
    /* брюки свободного кроя; внизу заправлены в берцы. Внутрь и у паха
       прибавка меньше — брючины не должны врезаться друг в друга и в подол. */
    const grow = ss((y - 0.27) / 0.1) * (1 - 0.55 * ss((y - 0.80) / 0.12));
    const kb = 1 + 0.17 * grow, ki = 1 + 0.09 * grow;
    const rx = (c >= 0 ? pr[0] * kb : pr[1] * ki), rz = (sn >= 0 ? pr[2] : pr[3]) * kb;
    let f = 1;
    if (!smooth) {
      f += (K.n1(th * 1.3 + s * 9, y * 6) - 0.5) * 0.06 + (K.n2(th * 4 + s * 3, y * 24) - 0.5) * 0.018;
      /* напуск над берцами */
      f += band(y, 0.235, 0.33, 0.02) * 0.08 * Math.max(-0.3, Math.sin(y * 300 + 5 * K.n1(th * 1.1 + s, 1.3)));
      /* брючина свисает с колена вертикальными волнами */
      f += band(y, 0.29, 0.45, 0.03) * 0.035 * Math.sin(th * 3 + s + 3 * K.n1(y * 4, th));
      /* горизонтальные заломы на бедре спереди — ткань тянет к колену */
      if (sn > 0) f -= band(y, 0.64, 0.84, 0.03) * 0.02 * Math.max(0, Math.sin(y * 150 + th * 3 * s)) * sn;
      /* заломы под коленом */
      if (sn < 0) f -= band(y, 0.45, 0.535, 0.015) * 0.05 * Math.max(0, Math.sin(y * 300 + th * 2)) * (-sn);
      /* вытачки над коленом */
      if (sn > 0) f -= band(y, 0.575, 0.62, 0.01) * 0.03 * Math.max(0, Math.sin(th * 9)) * sn;
    }
    return [s * (0.092 + pr[4] + rx * c * f), y, -rz * sn * f];
  }

  function legN(K, s, y, th) {
    const e = 1e-3;
    const a = sub(legPt(K, s, y, th + e, true), legPt(K, s, y, th - e, true));
    const b = sub(legPt(K, s, y + e, th, true), legPt(K, s, y - e, th, true));
    const n = norm(cross(a, b));
    const p = legPt(K, s, y, th, true);
    return dot(n, [p[0] - s * 0.092, 0, p[2]]) < 0 ? scale(n, -1) : n;
  }

  function legW(K, s) {
    const S = s > 0 ? 'R' : 'L';
    return (p) => {
      const y = p[1];
      const a = 1 - ss((y - 0.86) / 0.13);
      const b = 1 - ss((y - 0.465) / 0.07);
      const c = 1 - ss((y - 0.095) / 0.05);
      const o = { hips: 1 - a };
      o['hip' + S] = a * (1 - b);
      o['knee' + S] = a * b * (1 - c);
      o['ankle' + S] = a * b * c;
      return K.W(o);
    };
  }

  function buildLeg(K, s) {
    const part = new Part(K, K.G.uniform, legW(K, s));
    const rings = [];
    for (let y = 1.0; y >= 0.1849; y -= 0.0115) rings.push(((yy) => (t) => legPt(K, s, yy, t))(y));
    tube(part, rings, 48, (p) => [p[0] - s * 0.092, 0, p[2]]);

    /* Накладной карман с клапаном на бедре. */
    const pk = new Part(K, K.G.uniform, legW(K, s));
    const pS = (u, v) => {
      const th = lerp(-0.30, 0.78, u), y = lerp(0.605, 0.765, v);
      return [legPt(K, s, y, th, true), legN(K, s, y, th)];
    };
    const pth = (u, v) => 0.016 * (0.3 + 0.7 * ss(Math.min(u, 1 - u, v, 1 - v * 0.8) / 0.22)) * (0.8 + 0.2 * v);
    slab(pk, 10, 10, pS, { t0: 0.001, t1: pth });
    slab(pk, 10, 3, (u, v) => {
      const th = lerp(-0.36, 0.84, u), y = lerp(0.728, 0.785, v);
      return [legPt(K, s, y, th, true), legN(K, s, y, th)];
    }, { t0: (u, v) => 0.0015 + pth(U.clamp01((u - 0.05) / 0.9), U.clamp01((lerp(0.728, 0.785, v) - 0.605) / 0.16)), t1: 0.004 });

    /* Наколенник: жёсткая чашка поверх ткани и две резинки. */
    const kp = new Part(K, K.G.gear, legW(K, s));
    slab(kp, 12, 10, (u, v) => {
      const th = lerp(0.92, 2.22, u), y = lerp(0.448, 0.588, v);
      return [legPt(K, s, y, th, true), legN(K, s, y, th)];
    }, { t0: 0.0025, t1: (u, v) => 0.017 * (0.35 + 0.65 * ss(Math.min(u, 1 - u, v, 1 - v) / 0.25)) * (1 + 0.25 * gauss((v - 0.55) / 0.25) * gauss((u - 0.5) / 0.3)) });
    for (const y0 of [0.462, 0.566]) {
      slab(kp, 40, 1, (u, v) => {
        const th = u * TAU, y = y0 + (v - 0.5) * 0.018;
        return [legPt(K, s, y, th, true), legN(K, s, y, th)];
      }, { t0: 0.001, t1: 0.0028, wrapU: true });
    }
  }

  /* ============================================================= БОТИНКИ */
  function bootW(K, s) {
    const S = s > 0 ? 'R' : 'L';
    return (p) => {
      const k = ss((p[1] - 0.12) / 0.09);
      const t = (1 - k) * ss((-p[2] - 0.095) / 0.045);
      const o = {};
      o['knee' + S] = k;
      o['ankle' + S] = (1 - k) * (1 - t);
      o['toe' + S] = t;
      return K.W(o);
    };
  }

  /* Стопа по длине: [z (вперёд — минус), полуширина, верх, сдвиг внутрь]. */
  const FOOT = table([
    [-0.219, 0.016, 0.046, 0.004],
    [-0.210, 0.033, 0.056, 0.004],
    [-0.192, 0.045, 0.064, 0.004],
    [-0.160, 0.052, 0.072, 0.003],
    [-0.120, 0.055, 0.085, 0.002],
    [-0.080, 0.053, 0.106, 0.001],
    [-0.040, 0.050, 0.128, 0.000],
    [0.000, 0.047, 0.140, 0.000],
    [0.030, 0.045, 0.130, 0.000],
    [0.060, 0.041, 0.115, 0.000],
    [0.072, 0.034, 0.104, 0.000],
    [0.079, 0.018, 0.084, 0.000]
  ]);
  const SOLE_Y = 0.034;

  function buildBoot(K, s) {
    const W = bootW(K, s);
    const bt = new Part(K, K.G.boot, W);
    const footPt = (z, th) => {
      const pr = FOOT(z);
      const yb = SOLE_Y - 0.002, ry = (pr[1] - yb) / 2, yc = yb + ry;
      const c = Math.cos(th), sn = Math.sin(th);
      /* низ плоский, верх — свод стопы */
      const y = yc + (sn >= 0 ? ry * spow(sn, 0.9) : ry * spow(sn, 0.35));
      return [s * (0.092 - pr[2] + pr[0] * spow(c, 0.8)), y, z];
    };
    const shrink = (z, k) => (t) => { const p = footPt(z, t); return [s * 0.092 + (p[0] - s * 0.092) * k, 0.06 + (p[1] - 0.06) * k, p[2]]; };
    const rings = [shrink(0.0795, 0.15)];
    for (let z = 0.079; z >= -0.2191; z -= 0.0075) rings.push(((zz) => (t) => footPt(zz, t))(z));
    rings.push(shrink(-0.2195, 0.15));
    tube(bt, rings, 36, (p) => [p[0] - s * 0.092, p[1] - 0.07, 0]);

    /* Накладки поверх кожи: резиновый бампер на носке (по бокам уходит
       дальше назад, чем сверху) и жёсткий задник вокруг пятки. */
    const footN = (z, th) => {
      const e = 1e-3, p = footPt(z, th), pr = FOOT(z);
      const n = norm(cross(sub(footPt(z, th + e), footPt(z, th - e)), sub(footPt(z + e, th), footPt(z - e, th))));
      const cc = [s * (0.092 - pr[2]), (SOLE_Y + pr[1]) / 2, z];
      return dot(n, sub(p, cc)) < 0 ? scale(n, -1) : n;
    };
    const edge = (v, w) => 0.35 + 0.65 * ss(Math.min(v, 1 - v) / w);
    slab(new Part(K, K.G.rubber, W), 26, 8, (u, v) => {
      const th = lerp(-0.32, Math.PI + 0.32, u);
      const z = lerp(-0.2182, lerp(-0.118, -0.172, Math.max(0, Math.sin(th))), v);
      return [footPt(z, th), footN(z, th)];
    }, { t0: 0.0004, t1: (u, v) => 0.0026 * edge(v, 0.25) * edge(u, 0.08) });
    slab(new Part(K, K.G.boot, W), 24, 6, (u, v) => {
      const th = lerp(-0.30, Math.PI + 0.30, u);
      const z = lerp(lerp(0.036, 0.018, Math.max(0, Math.sin(th))), 0.0783, v);
      return [footPt(z, th), footN(z, th)];
    }, { t0: 0.0004, t1: (u, v) => 0.003 * edge(v, 0.2) * edge(u, 0.08) });

    /* Голенище вокруг лодыжки, сверху — мягкий кант. */
    const SH = table([
      [0.090, 0.049, 0.064, 0.060],
      [0.130, 0.049, 0.058, 0.057],
      [0.170, 0.047, 0.054, 0.055],
      [0.215, 0.049, 0.055, 0.057],
      [0.236, 0.052, 0.058, 0.060]
    ]);
    const shPt = (y, th, k) => {
      const pr = SH(y), c = Math.cos(th), sn = Math.sin(th);
      const kk = k || 1;
      return [s * 0.092 + pr[0] * c * kk, y, 0.006 - (sn >= 0 ? pr[1] : pr[2]) * sn * kk];
    };
    const sr = [];
    for (let y = 0.09; y <= 0.2361; y += 0.0125) sr.push(((yy) => (t) => shPt(yy, t))(y));
    sr.push((t) => shPt(0.236, t, 1.07), (t) => { const p = shPt(0.236, t, 1.07); return [p[0], 0.244, p[2]]; },
      (t) => { const p = shPt(0.236, t, 0.93); return [p[0], 0.246, p[2]]; }, (t) => shPt(0.225, t, 0.86));
    tube(bt, sr, 36, (p) => [p[0] - s * 0.092, 0, p[2] - 0.006]);

    /* Язык и шнуровка: крючки и перекрещенные шнурки. */
    const LP = [[-0.090, 0.104], [-0.070, 0.117], [-0.058, 0.134], [-0.0575, 0.160], [-0.0575, 0.186], [-0.058, 0.212], [-0.0605, 0.236]];
    const front = (t) => {
      const f = U.clamp01(t) * (LP.length - 1), i = Math.min(LP.length - 2, Math.floor(f)), g = f - i;
      return [lerp(LP[i][0], LP[i + 1][0], g), lerp(LP[i][1], LP[i + 1][1], g)];
    };
    /* точка на линии шнуровки: сдвиг вбок и подъём над ней по нормали */
    const lacePt = (t, off, lift) => {
      const q = front(t), q2 = front(Math.min(1, t + 0.02)), q1 = front(Math.max(0, t - 0.02));
      const tz = q2[0] - q1[0], ty = q2[1] - q1[1];
      const L = Math.hypot(tz, ty) || 1;
      let n = [0, -tz / L, ty / L];
      if (n[2] > 0) n = [0, -n[1], -n[2]];
      return [[s * 0.092 + off, q[1] + n[1] * lift, q[0] + n[2] * lift], n];
    };
    slab(new Part(K, K.G.boot, W), 2, 12, (u, v) => {
      const r = lacePt(v, lerp(-0.016, 0.016, u), 0);
      return [r[0], r[1]];
    }, { t0: 0.0005, t1: 0.003 });
    const lace = new Part(K, K.G.rubber, W);
    const hooks = new Part(K, K.G.hard, W);
    const NL = 7;
    for (let i = 0; i < NL; i++) {
      const t0 = i / NL, t1 = (i + 1) / NL;
      for (const sd of [-1, 1]) {
        const a = lacePt(t0, sd * 0.017, 0.0045)[0], b = lacePt(t1, -sd * 0.017, 0.0045)[0];
        const n = lacePt((t0 + t1) / 2, 0, 0)[1];
        sweep(lace, [a, B.lerp3(a, b, 0.5), b], [n, n, n], (th) => [Math.cos(th) * 0.0022, Math.sin(th) * 0.0012], 6);
        const hp = lacePt(t0, sd * 0.021, 0.004);
        box(hooks, hp[0], [0.0035, 0.0035, 0.0035], basisN(hp[1]), 0.0015, 2);
      }
    }

    /* Подошва: рант по контуру стопы, каблук выше свода, грунтозацепы. */
    const sole = new Part(K, K.G.rubber, W);
    const solePt = (z, th) => {
      const pr = FOOT(z);
      const c = Math.cos(th), sn = Math.sin(th);
      const arch = band(-z, 0.015, 0.075, 0.012) * 0.010;
      const yTop = SOLE_Y + 0.001;
      const y = sn >= 0 ? lerp(yTop - 0.004, yTop, spow(sn, 0.3)) : lerp(yTop - 0.004, arch, Math.pow(-sn, 0.35));
      const w = pr[0] + 0.005;
      return [s * (0.092 - pr[2] + w * spow(c, 0.6)), y, z];
    };
    /* торцы подошвы чуть выступают за ботинок и скруглены */
    const sRing = (zz, k) => (t) => {
      const p = solePt(Math.max(-0.219, Math.min(0.079, zz)), t);
      return [s * 0.092 + (p[0] - s * 0.092) * k, 0.018 + (p[1] - 0.018) * Math.min(1, k * 1.3), zz];
    };
    const srr = [sRing(0.0835, 0.2), sRing(0.083, 0.62), sRing(0.0815, 0.9)];
    for (let z = 0.079; z >= -0.2191; z -= 0.0075) srr.push(sRing(z, 1));
    srr.push(sRing(-0.2215, 0.9), sRing(-0.2232, 0.62), sRing(-0.2237, 0.2));
    tube(sole, srr, 28, (p) => [p[0] - s * 0.092, p[1] - 0.02, 0]);
    for (let z = -0.19; z < 0.07; z += 0.028) {
      if (z > -0.075 && z < -0.02) continue;
      const pr = FOOT(z);
      box(sole, [s * (0.092 - pr[2]), 0.0025, z], [pr[0] * 0.8, 0.003, 0.0065], null, 0.002, 2);
    }
  }

  /* =============================================================== ГОЛОВА */
  const HEAD_C = [0, 1.688, -0.004];

  /* Поверхность головы по сферическим углам: θ — азимут (0 — лицо),
     φ — от макушки. F — выраженность черт (под балаклавой они мягче). */
  function headLocal(th, ph, F) {
    const sx = Math.sin(ph) * Math.sin(th), sy = Math.cos(ph), sz = -Math.sin(ph) * Math.cos(th);
    let x = sx * 0.079, y = sy * 0.114, z = sz * 0.099;
    const front = ss((-sz - 0.2) / 0.5);
    /* Череп: нижняя треть уже, но с углом челюсти (не «яйцо»), виски
       чуть впалые, затылок полнее, лицо площе. */
    x *= 1 - 0.25 * ss((-0.15 - sy) / 0.75);
    x *= 1 + 0.085 * gauss((sy + 0.66) / 0.2) * gauss((sz - 0.05) / 0.5);
    x *= 1 - 0.035 * gauss((sy - 0.12) / 0.16) * gauss((sz + 0.45) / 0.3);
    if (z > 0) z *= 1 + 0.05 * ss((sy + 0.3) / 0.6);
    else z *= 1 - 0.05 * front + 0.17 * gauss((sy + 0.6) / 0.3) * front;
    if (z < 0) {
      const ax = Math.abs(x);
      /* надбровные дуги и переносица */
      z -= 0.0065 * gauss((sy - 0.03) / 0.065) * gauss((ax - 0.03) / 0.033) * front;
      z -= 0.0022 * gauss((sy - 0.06) / 0.06) * gauss(x / 0.012) * front;
      /* глазница: впадина + миндалевидный разрез век, сквозь который видно
         яблоко; вне разреза веки закрывают его */
      /* Верхнее веко прикрывает край радужки, нижнее касается её снизу:
         при раскрытом над радужкой белке взгляд выходил испуганным. */
      const ey = sy * 0.114 - (EYE_Y - 0.0006 - HEAD_C[1]);
      const alm = ss((1 - Math.pow((ax - EYE_X) / 0.0136, 2) - Math.pow(ey / (ey > 0 ? 0.0047 : 0.0046), 2)) / 0.35);
      z += F.socket * (0.0034 * gauss((sy + 0.10) / 0.07) * gauss((ax - EYE_X) / 0.021) + 0.0068 * alm) * front;
      /* складка верхнего века и валик нижнего */
      z -= F.socket * 0.0012 * gauss((ey - 0.0085) / 0.0025) * gauss((ax - EYE_X) / 0.013) * front;
      z -= F.socket * 0.0009 * gauss((ey + 0.0062) / 0.002) * gauss((ax - EYE_X) / 0.012) * front;
      /* скулы вперёд и в стороны, под ними — лёгкая впалость щёк */
      x *= 1 + 0.045 * gauss((sy + 0.2) / 0.14) * front;
      z -= 0.0040 * gauss((sy + 0.24) / 0.09) * gauss((ax - 0.047) / 0.018) * front;
      z += 0.0026 * gauss((sy + 0.44) / 0.11) * gauss((ax - 0.046) / 0.015) * front;
      /* нос: спинка, шарик кончика, крылья, впадина под носом */
      const nH = sy > -0.05 ? 0.003 * gauss((sy + 0.05) / 0.05)
        : lerp(0.004, 0.0165, U.clamp01((-0.05 - sy) / 0.35)) * (1 - ss((-sy - 0.42) / 0.05));
      const nW = lerp(0.0058, 0.0092, U.clamp01((-0.05 - sy) / 0.37));
      const tip = 0.0030 * gauss((sy + 0.39) / 0.05) * gauss(x / 0.0082);
      const alae = 0.0042 * gauss((sy + 0.405) / 0.04) * gauss((ax - 0.0128) / 0.006);
      z -= F.nose * (nH * gauss(x / nW) + tip + alae) * front;
      z += F.nose * 0.0020 * gauss((sy + 0.455) / 0.02) * gauss(x / 0.02) * front;
      /* носогубные складки: от крыла носа к углу рта */
      const tl = U.clamp01((-sy - 0.42) / 0.24);
      z += 0.0013 * gauss((ax - lerp(0.021, 0.031, tl)) / 0.0035) * band(-sy, 0.42, 0.66, 0.03) * front;
      /* губы: верхняя, нижняя, линия рта, желобок, подбородочная складка */
      z += F.lips * 0.0008 * gauss(x / 0.0035) * band(-sy, 0.47, 0.57, 0.02) * front;
      z -= F.lips * (0.0040 * gauss((sy + 0.585) / 0.032) * gauss(x / 0.019)
        + 0.0046 * gauss((sy + 0.655) / 0.035) * gauss(x / 0.017)) * front;
      z += F.lips * 0.0019 * gauss((sy + 0.62) / 0.011) * gauss(x / 0.023) * front;
      z += F.lips * 0.0017 * gauss((sy + 0.725) / 0.03) * gauss(x / 0.02) * front;
      /* подбородок */
      z -= 0.0095 * gauss((sy + 0.85) / 0.1) * gauss(x / 0.032) * front;
    }
    return [x, y, z];
  }
  function headPt(th, ph, F, off) {
    const l = headLocal(th, ph, F);
    const k = 1 + (off || 0) / (len(l) || 1);
    return [HEAD_C[0] + l[0] * k, HEAD_C[1] + l[1] * k, HEAD_C[2] + l[2] * k];
  }
  /* (θ, φ) точки головы с заданными x, y (решаем Ньютоном). */
  function headSolve(x, y, F, off) {
    let th = Math.asin(U.clamp(x / 0.08, -0.95, 0.95));
    let ph = Math.acos(U.clamp((y - HEAD_C[1]) / 0.114, -0.99, 0.99));
    for (let i = 0; i < 14; i++) {
      const p = headPt(th, ph, F, off), e = 1e-4;
      const a = headPt(th + e, ph, F, off), b = headPt(th, ph + e, F, off);
      const j00 = (a[0] - p[0]) / e, j01 = (b[0] - p[0]) / e, j10 = (a[1] - p[1]) / e, j11 = (b[1] - p[1]) / e;
      const det = j00 * j11 - j01 * j10;
      if (Math.abs(det) < 1e-12) break;
      const dx = x - p[0], dy = y - p[1];
      th += (j11 * dx - j01 * dy) / det;
      ph += (-j10 * dx + j00 * dy) / det;
    }
    return [th, ph];
  }

  function headW(K) {
    return (p) => {
      const t = ss((p[1] - 1.50) / 0.10);
      const c = 1 - ss((p[1] - 1.47) / 0.05);
      return K.W({ chest: c, neck: (1 - t) * (1 - c), head: t });
    };
  }

  const FACE = { nose: 1, socket: 1, lips: 1 };
  const MASKF = { nose: 0.7, socket: 0.22, lips: 0.3 };
  const EYE_Y = 1.675, EYE_X = 0.031, EYE_R = 0.0115;

  function buildHead(K) {
    const sk = new Part(K, K.G.skin, headW(K));
    /* под балаклавой нос и губы не выступают за ткань */
    const F = K.masked ? { nose: MASKF.nose, socket: 1, lips: MASKF.lips } : FACE;
    /* Шов развёртки — на затылке (θ = ±π), а не посреди лица: вершины шва
       не свариваются (у них разные UV), и на лице был бы виден излом
       нормалей. UV = (θ, φ) — по ним рисуется текстура лица. */
    grid(sk, K.masked ? 120 : 180, K.masked ? 96 : 140, (u, v) => headPt((u - 0.5) * TAU, v * Math.PI, F, 0),
      { wrapU: true, out: (p) => sub(p, HEAD_C), uv: [1, 1] });
    /* шея: UV указывает на участок текстуры под подбородком (кожа) */
    const nr = [];
    for (let y = 1.49; y <= 1.6301; y += 0.014) nr.push(((yy) => (t) => [0.058 * Math.cos(t), yy, 0.006 - 0.060 * Math.sin(t)])(y));
    grid(sk, 24, nr.length - 1, (u, v) => nr[Math.round(v * (nr.length - 1))]((u - 0.25) * TAU),
      { wrapU: true, out: (p) => [p[0], 0, p[2] - 0.006], uvFn: (u) => [u, 0.97] });

    /* Глаза: яблоко в глазнице + радужка. */
    const ey = new Part(K, K.G.eye, () => K.W({ head: 1 }));
    const ir = new Part(K, K.G.hair, () => K.W({ head: 1 }));
    const noSock = { nose: F.nose, socket: 0, lips: F.lips };
    for (const sx of [1, -1]) {
      const a = headSolve(sx * EYE_X, EYE_Y, noSock, 0);
      const sp = headPt(a[0], a[1], noSock, 0);
      /* яблоко утоплено за край век: иначе оно выпирает круглым «мультяшным» глазом */
      const c = [sx * EYE_X, EYE_Y, sp[2] + EYE_R + 0.0034];
      grid(ey, 24, 16, (u, v) => {
        const ph = v * Math.PI, th = u * TAU;
        return [c[0] + EYE_R * Math.sin(ph) * Math.sin(th), c[1] + EYE_R * Math.cos(ph), c[2] - EYE_R * Math.sin(ph) * Math.cos(th)];
      }, { wrapU: true, out: (p) => sub(p, c), uv: [1, 1] });
      /* взгляд сведён к точке в 8 м */
      const bs = basisN(norm([-sx * EYE_X, 0, -8]));
      grid(ir, 24, 5, (u, v) => {
        /* радужка чуть выпуклая (роговица), v — радиус от зрачка */
        const al = v * 0.50, be = u * TAU, r = EYE_R + 0.0003 + 0.0006 * (1 - v * v);
        const d = add(scale(bs[2], Math.cos(al)), add(scale(bs[0], Math.sin(al) * Math.cos(be)), scale(bs[1], Math.sin(al) * Math.sin(be))));
        return add(c, scale(d, r));
      }, { wrapU: true, out: (p) => sub(p, c), uv: [1, 1] });
    }
  }

  /* Балаклава: голова + 3,5 мм ткани, прорезь для глаз с подрубленным
     краем, горловина заправлена под воротник. */
  const SLIT = { a: 0.063, b: 0.0175, y: EYE_Y + 0.001 };
  function inSlit(p) {
    const dx = p[0] / SLIT.a, dy = (p[1] - SLIT.y) / SLIT.b;
    return p[2] < HEAD_C[2] - 0.04 && Math.pow(Math.abs(dx), 4) + Math.pow(Math.abs(dy), 4) < 1;
  }
  function buildBalaclava(K) {
    const part = new Part(K, K.G.mask, headW(K));
    const off = 0.0035;
    const NU = 128, NV = 88;
    const P = (u, v) => headPt((u - 0.5) * TAU, v * Math.PI, MASKF, off);
    grid(part, NU, NV, P, {
      wrapU: true, out: (p) => sub(p, HEAD_C),
      skip: (i, j) => inSlit(P((i + 0.5) / NU, (j + 0.5) / NV))
    });
    /* подрубленный край прорези */
    const rim = [], rn = [];
    for (let k = 0; k <= 64; k++) {
      const t = (k / 64) * TAU;
      const e = U.superellipse(SLIT.a, SLIT.b, 4, t);
      const a = headSolve(e[0], SLIT.y + e[1], MASKF, off);
      const p = headPt(a[0], a[1], MASKF, off);
      rim.push(p);
      rn.push(norm(sub(p, HEAD_C)));
    }
    sweep(part, rim, rn, (th) => [Math.cos(th) * 0.0034, Math.sin(th) * 0.0024 - 0.0008], 8);
    /* горловина со складками */
    const nr = [];
    for (let y = 1.478; y <= 1.6401; y += 0.009) {
      nr.push(((yy) => (t) => {
        const k = 1 + 0.035 * Math.sin(yy * 220 + 3 * K.n1(t * 1.2, 2.0)) * band(yy, 1.5, 1.6, 0.02) + (K.n2(t * 3, yy * 20) - 0.5) * 0.03;
        const r = lerp(0.075, 0.063, ss((yy - 1.478) / 0.08)) * k;
        return [r * Math.cos(t), yy, 0.006 - r * 1.03 * Math.sin(t)];
      })(y));
    }
    tube(part, nr, 40, (p) => [p[0], 0, p[2] - 0.006]);
  }

  /* ============================================================ ШЛЕМ FAST */
  const HELM = { c: [0, 1.700, 0.004], rx: 0.109, ry: 0.118, rz: 0.131 };
  /* нижняя кромка: φ по азимуту — высокий вырез над ухом, затылок закрыт */
  const HELM_EDGE = table([
    [0, 74], [30, 78], [55, 90], [75, 90], [95, 79], [115, 85], [135, 101], [160, 108], [180, 110]
  ]);
  function helmPhi(th) {
    const a = Math.abs(U.wrapPI(th)) * 180 / Math.PI;
    return HELM_EDGE(a)[0] * Math.PI / 180;
  }
  function helmPt(th, ph, off) {
    const sp = Math.sin(ph);
    return [
      HELM.c[0] + (HELM.rx + off) * sp * spow(Math.sin(th), 0.86),
      HELM.c[1] + (HELM.ry + off) * Math.cos(ph),
      HELM.c[2] - (HELM.rz + off) * sp * spow(Math.cos(th), 0.9)
    ];
  }
  function helmN(th, ph) {
    const e = 1e-3;
    const a = sub(helmPt(th + e, ph, 0), helmPt(th - e, ph, 0));
    const b = sub(helmPt(th, ph + e, 0), helmPt(th, ph - e, 0));
    let n = norm(cross(a, b));
    if (dot(n, sub(helmPt(th, ph, 0), HELM.c)) < 0) n = scale(n, -1);
    return n;
  }

  function buildHelmet(K) {
    const HW = () => K.W({ head: 1 });
    const sh = new Part(K, K.G.helmet, HW);
    const out = (p) => sub(p, HELM.c);
    grid(sh, 96, 26, (u, v) => { const th = u * TAU; return helmPt(th, Math.max(0.02, v) * helmPhi(th), 0); },
      { wrapU: true, out });
    grid(sh, 64, 14, (u, v) => { const th = u * TAU; return helmPt(th, Math.max(0.02, v) * helmPhi(th), -0.009); },
      { wrapU: true, out: (p) => scale(out(p), -1) });
    /* резиновый кант по кромке */
    const rim = [], rn = [];
    for (let k = 0; k <= 128; k++) {
      const th = (k / 128) * TAU, ph = helmPhi(th);
      rim.push(helmPt(th, ph + 0.012, -0.0045));
      rn.push(helmN(th, ph));
    }
    sweep(new Part(K, K.G.headRubber, HW), rim, rn, (t) => [Math.cos(t) * 0.0048, Math.sin(t) * 0.0062], 8);

    /* липучки: макушка и затылок */
    const vel = new Part(K, K.G.headGear, HW);
    const patch = (a0, a1, p0, p1) => slab(vel, 12, 6, (u, v) => {
      const th = lerp(a0, a1, u), ph = lerp(p0, p1, v);
      return [helmPt(th, ph, 0), helmN(th, ph)];
    }, { t0: 0.0006, t1: 0.0022 });
    patch(-0.72, 0.72, 0.14, 0.62);
    patch(Math.PI - 0.55, Math.PI + 0.55, 0.95, 1.42);

    const hard = new Part(K, K.G.headHard, HW);
    /* рельсы ARC по бокам */
    for (const sd of [1, -1]) {
      const pts = [], ns = [];
      for (let k = 0; k <= 20; k++) {
        const th = sd * lerp(0.74, 2.20, k / 20), ph = helmPhi(th) - 0.17;
        pts.push(helmPt(th, ph, 0.0035));
        ns.push(helmN(th, ph));
      }
      sweep(hard, pts, ns, (t) => { const e = U.superellipse(0.011, 0.0042, 5, t); return [e[0], e[1]]; }, 12, { caps: true });
      for (const k of [3, 10, 17]) {
        box(hard, add(pts[k], scale(ns[k], 0.0045)), [0.0032, 0.0032, 0.0016], basisN(ns[k]), 0.0012, 2);
      }
    }
    /* платформа ПНВ (шрауд) */
    {
      const p = helmPt(0, 0.98, 0), n = helmN(0, 0.98);
      const bs = basisN(n);
      box(hard, add(p, scale(n, 0.006)), [0.029, 0.023, 0.006], bs, 0.004, 3);
      box(hard, add(add(p, scale(n, 0.012)), scale(bs[1], -0.010)), [0.014, 0.008, 0.005], bs, 0.002, 2);
    }
    /* противовес на затылке */
    {
      const p = helmPt(Math.PI, 1.62, 0), n = helmN(Math.PI, 1.62);
      box(vel, add(p, scale(n, 0.013)), [0.036, 0.022, 0.012], basisN(n), 0.006, 3);
    }
    /* банджи-шнуры на затылке */
    const cord = new Part(K, K.G.headRubber, HW);
    for (const ph of [1.02, 1.24]) {
      const pts = [], ns = [];
      for (let k = 0; k <= 16; k++) {
        const th = lerp(2.1, TAU - 2.1, k / 16);
        pts.push(helmPt(th, ph, 0.004));
        ns.push(helmN(th, ph));
      }
      sweep(cord, pts, ns, (t) => [Math.cos(t) * 0.0019, Math.sin(t) * 0.0019], 6);
    }
    /* подбородочный ремень поверх балаклавы */
    const strap = new Part(K, K.G.headGear, HW);
    const route = [[1.57, 1.28], [1.52, 1.62], [1.36, 1.98], [1.05, 2.30], [0.62, 2.55], [0.0, 2.66]];
    const full = route.concat(route.slice(0, -1).reverse().map((r) => [-r[0], r[1]]));
    const SF = K.masked ? MASKF : FACE, so = K.masked ? 0.0035 : 0;
    const sp = full.map(([th, ph]) => headPt(th, ph, SF, so + 0.0022));
    const top = (sd) => { const th = sd * 1.57; return helmPt(th, helmPhi(th) - 0.08, -0.012); };
    const S1 = chaikin([top(1)].concat(sp).concat([top(-1)]), 2);
    sweep(strap, S1, S1.map((p) => norm(sub(p, HEAD_C))), (t) => [Math.cos(t) * 0.0085, Math.sin(t) * 0.0016], 8);
    box(strap, headPt(0, 2.62, SF, so + 0.0085), [0.024, 0.009, 0.006], basisN(norm(sub(headPt(0, 2.62, SF, 0), HEAD_C))), 0.004, 2);
    if (!K.masked) buildHeadset(K);
  }

  /* Гарнитура (ComTac-подобная): чашки на рельсах ARC закрывают уши. */
  function buildHeadset(K) {
    const HW = () => K.W({ head: 1 });
    const hard = new Part(K, K.G.headHard, HW);
    const rub = new Part(K, K.G.headRubber, HW);
    for (const sd of [1, -1]) {
      const bs = basisN([sd, 0, 0]);
      const c = [sd * 0.094, 1.664, 0.006];
      box(rub, add(c, [-sd * 0.008, 0, 0]), [0.031, 0.039, 0.008], bs, 0.007, 3);
      box(hard, c, [0.029, 0.037, 0.014], bs, 0.013, 4);
      box(hard, add(c, [sd * 0.013, 0.004, 0]), [0.018, 0.022, 0.004], bs, 0.004, 2);
      /* кронштейн к рельсу */
      box(hard, add(c, [sd * 0.004, 0.046, -0.004]), [0.007, 0.016, 0.006], bs, 0.002, 2);
    }
    /* штанга микрофона слева */
    const pts = chaikin([[-0.094, 1.652, -0.018], [-0.090, 1.628, -0.052], [-0.066, 1.604, -0.088], [-0.030, 1.598, -0.104]], 2);
    sweep(hard, pts, pts.map(() => [0, 1, 0]), (t) => [Math.cos(t) * 0.0024, Math.sin(t) * 0.0024], 6, { caps: true });
    box(rub, [-0.026, 1.598, -0.105], [0.008, 0.007, 0.007], null, 0.006, 3);
  }

  /* Открытое лицо: брови, короткая стрижка, горловой шарф-«труба»
     спущен на шею. */
  function buildFaceKit(K) {
    /* Брови, щетина и короткая стрижка нарисованы в текстуре лица
       (character.js, faceAlbedo): геометрические «брови-дуги» читались
       как нарисованные маркером. Здесь — только шарф на шее. */
    /* шарф: мягкие складки, верх завёрнут валиком */
    const sc = new Part(K, K.G.mask, headW(K));
    const rings = [];
    const R = (y, t, extra) => {
      /* валик ложится поверх воротника куртки (его верх — y 1.57, r ≈ 0.068) */
      const b = 0.008 + 0.019 * gauss((y - 1.574) / 0.018) + 0.0035 * Math.sin(7 * t + 40 * y) * gauss((y - 1.572) / 0.03) + extra;
      return [(0.058 + b) * Math.cos(t), y, 0.006 - (0.060 + b) * Math.sin(t)];
    };
    for (let y = 1.50; y <= 1.5901; y += 0.006) rings.push(((yy) => (t) => R(yy, t, 0))(y));
    rings.push((t) => R(1.594, t, -0.008), (t) => R(1.595, t, -0.016));
    tube(sc, rings, 40, (p) => [p[0], 0, p[2] - 0.006]);
  }


  /* ============================================================== ПАНАМА */
  function buildBoonie(K) {
    const HW = () => K.W({ head: 1 });
    const hat = new Part(K, K.G.hat, HW);
    const cz = 0.006;
    const CROWN = [[0.1045, 1.712], [0.104, 1.700], [0.1035, 1.735], [0.100, 1.768], [0.094, 1.795],
      [0.083, 1.813], [0.062, 1.825], [0.034, 1.832], [0.006, 1.834]];
    const cPt = (r, y, t) => {
      const k = 1 + (K.n1(t * 1.5 + 11, y * 12) - 0.5) * 0.05;
      return [r * 0.88 * k * Math.cos(t), y, cz - r * 1.1 * k * Math.sin(t)];
    };
    const rings = [(t) => cPt(0.100, 1.716, t)];
    for (let i = 1; i < CROWN.length - 1; i++) {
      const [r0, y0] = CROWN[i], [r1, y1] = CROWN[i + 1];
      for (let k = 0; k < 3; k++) rings.push(((r, y) => (t) => cPt(r, y, t))(lerp(r0, r1, k / 3), lerp(y0, y1, k / 3)));
    }
    rings.push((t) => cPt(0.0005, 1.834, t));
    tube(hat, rings, 48, (p) => [p[0], p[1] - 1.7, p[2] - cz]);
    /* лента тульи с петлями под маскировку */
    const bandS = (u, v) => {
      const t = u * TAU, y = lerp(1.702, 1.730, v);
      const p = cPt(lerp(0.104, 0.1035, v), y, t);
      return [p, norm([Math.cos(t) / 0.88, 0, -Math.sin(t) / 1.1])];
    };
    slab(hat, 48, 2, bandS, { t0: 0.0006, t1: 0.0028, wrapU: true });
    for (let k = 0; k < 12; k++) {
      const [p, n] = bandS((k + 0.5) / 12, 0.5);
      box(hat, add(p, scale(n, 0.0045)), [0.0045, 0.012, 0.0012], basisN(n), 0.001, 2);
    }
    /* поля: волнистые, опущены к краю, со строчкой */
    const brim = (u, v) => {
      const t = u * TAU;
      const w = 0.064 * v;
      const droop = (0.004 + 0.034 * Math.pow(v, 1.5)) * (1 + 0.22 * Math.sin(3 * t + 0.7) + 0.14 * Math.sin(5 * t + 2.1));
      return [(0.0915 + w) * Math.cos(t), 1.703 - droop, cz - (0.114 + w) * Math.sin(t)];
    };
    const brimN = (u, v) => {
      const e = 1e-3;
      const a = sub(brim(u + e, v), brim(u - e, v)), b = sub(brim(u, Math.min(1, v + e)), brim(u, Math.max(0, v - e)));
      let n = norm(cross(a, b));
      if (n[1] < 0) n = scale(n, -1);
      return n;
    };
    slab(hat, 72, 8, (u, v) => [brim(u, v), brimN(u, v)], { t0: -0.0015, t1: 0.003, wrapU: true });
    for (const v0 of [0.3, 0.55, 0.8]) {
      slab(hat, 72, 1, (u, v) => { const vv = v0 + (v - 0.5) * 0.03; return [brim(u, vv), brimN(u, vv)]; },
        { t0: 0.0015, t1: 0.0007, wrapU: true });
    }
    const edge = [], en = [];
    for (let k = 0; k <= 96; k++) { const u = (k / 96) % 1; edge.push(brim(u, 1)); en.push(brimN(u, 1)); }
    sweep(hat, edge, en, (t) => [Math.cos(t) * 0.0028, Math.sin(t) * 0.0028], 6);
    /* шнурок под подбородком */
    const cordP = [[1.45, 1.62], [1.36, 1.98], [1.05, 2.30], [0.62, 2.55], [0, 2.66], [-0.62, 2.55], [-1.05, 2.30], [-1.36, 1.98], [-1.45, 1.62]]
      .map(([th, ph]) => headPt(th, ph, MASKF, 0.006));
    const C1 = chaikin(cordP, 2);
    sweep(new Part(K, K.G.headRubber, HW), C1, C1.map((p) => norm(sub(p, HEAD_C))), (t) => [Math.cos(t) * 0.0016, Math.sin(t) * 0.0016], 6);
  }

  /* ============================================================= ПЛИТНИК */
  /* Жёсткая плита не повторяет живот: её тыльная поверхность — слегка
     изогнутая плоскость, касающаяся груди. Возвращает z(x, y) тыла плиты. */
  function plateSurface(K, back, y0, y1, hw) {
    const sg = back ? 1 : -1, R = 0.30, d0 = 0.006;
    const m = (y) => {
      let best = sg > 0 ? -1e9 : 1e9;
      for (let i = 0; i <= 16; i++) {
        const x = lerp(-hw(y), hw(y), i / 16);
        const th = torsoTheta(y, x, back);
        const need = torsoPt(K, y, th, true)[2] + sg * d0 + sg * x * x / (2 * R);
        best = sg > 0 ? Math.max(best, need) : Math.min(best, need);
      }
      return best;
    };
    const k = (m(y1) - m(y0)) / (y1 - y0);
    let z0 = sg > 0 ? -1e9 : 1e9;
    for (let i = 0; i <= 20; i++) {
      const y = lerp(y0, y1, i / 20);
      const c = m(y) - k * (y - y0);
      z0 = sg > 0 ? Math.max(z0, c) : Math.min(z0, c);
    }
    return { z: (x, y) => z0 + k * (y - y0) - sg * x * x / (2 * R), slope: k, sg };
  }

  /* Панель плиты: лицевая поверхность — карта высот, борта — до тела. */
  function platePanel(part, K, o) {
    const { y0, y1, hw, surf, thick } = o;
    const sg = surf.sg;
    const X = (u, v) => { const y = lerp(y0, y1, v); return lerp(hw(y), -hw(y), u); };
    const Hh = y1 - y0;
    const pil = (u, v) => {
      const y = lerp(y0, y1, v), w = 2 * hw(y);
      const e = Math.min(u * w, (1 - u) * w, v * Hh, (1 - v) * Hh);
      return 0.45 + 0.55 * ss(e / 0.016);
    };
    const front = (u, v) => { const x = X(u, v), y = lerp(y0, y1, v); return [x, y, surf.z(x, y) + sg * thick * pil(u, v)]; };
    const body = (u, v) => {
      const x = X(u, v), y = lerp(y0, y1, v);
      const th = torsoTheta(y, x, sg > 0);
      return add(torsoPt(K, y, th, true), scale(torsoN(K, y, th), 0.004));
    };
    const NU = o.NU || 16, NV = o.NV || 16;
    grid(part, NU, NV, front, { out: () => [0, 0, sg] });
    const c = [0, (y0 + y1) / 2, surf.z(0, (y0 + y1) / 2) - sg * 0.1];
    const wall = (n, f) => grid(part, n, 1, (a, w) => (w ? front : body)(f(a)[0], f(a)[1]),
      { out: (p) => { const q = sub(p, c); q[2] = 0; return q; } });
    wall(NV, (a) => [0, a]); wall(NV, (a) => [1, a]); wall(NU, (a) => [a, 0]); wall(NU, (a) => [a, 1]);
    return {
      front: (x, y) => {
        const v = U.clamp01((y - y0) / Hh), w = hw(y);
        return surf.z(x, y) + sg * thick * pil(U.clamp01((w - x) / (2 * w)), v);
      }
    };
  }

  /* Ряды строп MOLLE: лента 25 мм, прошивка через 38 мм. */
  function molleRows(part, zf, sg, x0, x1, ys) {
    const L = x1 - x0;
    for (const yc of ys) {
      slab(part, Math.max(4, Math.round(L / 0.006)), 1, (u, v) => {
        const x = lerp(x1, x0, u), y = yc + (v - 0.5) * 0.025;
        return [[x, y, zf(x, y)], [0, 0, sg]];
      }, {
        t0: 0, t1: (u) => {
          const d = Math.abs((((u * L) / 0.038) % 1) - 0.5);
          return 0.0026 * (0.3 + 0.7 * ss((0.5 - d) / 0.08));
        }
      });
    }
  }

  function pouchBasis(zf, x, y) {
    const e = 1e-3;
    const tx = norm([2 * e, 0, zf(x + e, y) - zf(x - e, y)]);
    const ty = norm([0, 2 * e, zf(x, y + e) - zf(x, y - e)]);
    return [tx, ty, cross(tx, ty)];
  }

  function buildVest(K) {
    const G = K.G;
    const gear = new Part(K, G.gear, vestW(K));
    const hard = new Part(K, G.hard, vestW(K));
    const rub = new Part(K, G.rubber, vestW(K));

    /* --- перед --- */
    const fy0 = 1.07, fy1 = 1.432;
    const fhw = (y) => 0.128 - Math.max(0, y - 1.35) * 0.30 - 0.004 * ss((y - 1.41) / 0.02);
    const fS = plateSurface(K, false, fy0, fy1, fhw);
    const F = platePanel(gear, K, { y0: fy0, y1: fy1, hw: fhw, surf: fS, thick: 0.026, NU: 18, NV: 20 });
    const fz = F.front;
    molleRows(gear, fz, -1, -0.118, 0.118, [1.092, 1.130, 1.168, 1.206]);
    /* три подсумка под магазины АК */
    for (const x of [-0.079, 0, 0.079]) {
      const y = 1.140;
      const bs = pouchBasis(fz, x, y);
      const n = scale(bs[2], -1);
      const c = add([x, y, fz(x, y)], scale(n, 0.027));
      box(gear, c, [0.035, 0.072, 0.024], bs, 0.009, 3);
      /* клапан с кантом и тянущий язычок */
      box(gear, add(add(c, scale(bs[1], 0.073)), scale(n, 0.002)), [0.037, 0.005, 0.0265], bs, 0.003, 2);
      box(gear, add(add(c, scale(bs[1], 0.054)), scale(n, 0.0265)), [0.037, 0.024, 0.0034], bs, 0.0025, 2);
      box(rub, add(add(c, scale(bs[1], 0.026)), scale(n, 0.0295)), [0.009, 0.014, 0.0022], bs, 0.0015, 2);
      /* стропы MOLLE поперёк подсумка */
      for (const dy of [-0.030, -0.058]) box(gear, add(add(c, scale(bs[1], dy)), scale(n, 0.0245)), [0.036, 0.0065, 0.0016], bs, 0.0012, 2);
    }
    /* админ-подсумок */
    {
      const y = 1.258, bs = pouchBasis(fz, 0, y), n = scale(bs[2], -1);
      box(gear, add([0, y, fz(0, y)], scale(n, 0.012)), [0.100, 0.030, 0.0115], bs, 0.006, 3);
      box(gear, add([0, y + 0.021, fz(0, y + 0.021)], scale(n, 0.025)), [0.101, 0.012, 0.0025], bs, 0.002, 2);
    }
    /* поле липучки и нашивка с эмблемой */
    slab(gear, 6, 5, (u, v) => {
      const x = lerp(0.056, -0.056, u), y = lerp(1.303, 1.392, v);
      return [[x, y, fz(x, y)], [0, 0, -1]];
    }, { t0: 0, t1: 0.0014 });
    slab(new Part(K, G.patch, vestW(K)), 4, 4, (u, v) => {
      const x = lerp(0.037, -0.037, u), y = lerp(1.311, 1.384, v);
      return [[x, y, fz(x, y)], [0, 0, -1]];
    }, { t0: 0.0014, t1: 0.0016, uv: [1, 1] });

    /* --- спина --- */
    const by0 = 1.082, by1 = 1.448;
    const bhw = (y) => 0.136 - 0.012 * ss((y - 1.41) / 0.035) - Math.max(0, y - 1.43) * 0.6;
    const bS = plateSurface(K, true, by0, by1, bhw);
    const Bk = platePanel(gear, K, { y0: by0, y1: by1, hw: bhw, surf: bS, thick: 0.024, NU: 18, NV: 20 });
    const bz = Bk.front;
    molleRows(gear, bz, 1, -0.124, 0.124, [1.105, 1.143, 1.181, 1.219, 1.257, 1.295, 1.333, 1.371]);
    /* сбрасываемая панель */
    {
      const y = 1.225, bs = pouchBasis(bz, 0, y);
      const c = add([0, y, bz(0, y)], scale(bs[2], 0.027));
      box(gear, c, [0.104, 0.118, 0.026], bs, 0.012, 3);
      const pz = (xx, yy) => c[2] + 0.026 + (yy - y) * bS.slope;
      molleRows(gear, pz, 1, -0.094, 0.094, [1.16, 1.198, 1.236, 1.274]);
      /* эвакуационная петля */
      const hy = by1 - 0.006, hz = bz(0, hy);
      const lp = chaikin([[-0.034, hy, hz], [-0.026, hy + 0.028, hz + 0.012], [0.026, hy + 0.028, hz + 0.012], [0.034, hy, hz]], 2);
      sweep(gear, lp, lp.map(() => norm([0, 0.3, 1])), (t) => [Math.cos(t) * 0.0125, Math.sin(t) * 0.0028], 8);
    }

    /* --- камербанд по бокам --- */
    const cy0 = 1.075, cy1 = 1.258;
    for (const sd of [1, -1]) {
      const cS = (u, v) => {
        const y = lerp(cy0, cy1, v);
        const tf = torsoTheta(y, sd * 0.112, false), tb = torsoTheta(y, sd * 0.118, true);
        const th = sd > 0 ? lerp(tf, tb - TAU, u) : lerp(tf, tb, u);
        return [torsoPt(K, y, th, true), torsoN(K, y, th)];
      };
      const cth = (u, v) => 0.012 * (0.5 + 0.5 * ss(Math.min(v, 1 - v) / 0.2));
      slab(gear, 24, 6, cS, { t0: 0.004, t1: cth });
      for (const v0 of [0.18, 0.40, 0.62, 0.84]) {
        slab(gear, 24, 1, (u, v) => cS(u, v0 + (v - 0.5) * 0.137), {
          t0: (u) => 0.004 + cth(u, v0),
          t1: (u) => 0.0025 * (0.3 + 0.7 * ss((0.5 - Math.abs(((u * 6) % 1) - 0.5)) / 0.08))
        });
      }
      /* боковой подсумок: слева — радиостанция, справа — аптечка */
      const [p, n] = cS(0.5, 0.52);
      const bs = basisN(n);
      const sz = sd < 0 ? [0.030, 0.062, 0.024] : [0.042, 0.042, 0.020];
      const pc = add(p, scale(n, 0.017 + sz[2]));
      box(gear, pc, sz, bs, 0.008, 3);
      box(gear, add(pc, scale(bs[1], sz[1] - 0.004)), [sz[0] + 0.002, 0.006, sz[2] + 0.002], bs, 0.003, 2);
      if (sd < 0) {
        const a0 = add(pc, scale(bs[1], sz[1]));
        const ant = [a0, add(a0, [0, 0.06, 0.006]), add(a0, [0, 0.12, 0.018])];
        sweep(rub, ant, [n, n, n], (t) => [Math.cos(t) * 0.0035, Math.sin(t) * 0.0035], 6, { caps: true });
      }
    }

    /* --- плечевые лямки поверх трапеции --- */
    for (const sd of [1, -1]) {
      const x = sd * 0.100;
      const cc = [x, 1.43, 0];
      const pts = [];
      for (let k = 0; k <= 24; k++) {
        const b = lerp(0.18, Math.PI - 0.12, k / 24);
        const d = [0, Math.sin(b), -Math.cos(b)];
        let lo = 0, hi = 0.3;
        for (let i = 0; i < 30; i++) {
          const m = (lo + hi) / 2;
          if (insideTorso(add(cc, scale(d, m)))) lo = m; else hi = m;
        }
        pts.push(add(cc, scale(d, lo + 0.010)));
      }
      const f0 = [x, fy1 - 0.012, fz(x, fy1 - 0.012) + 0.006], b0 = [x, by1 - 0.010, bz(x, by1 - 0.010) - 0.006];
      const P = chaikin([f0].concat(pts.slice(3, -2)).concat([b0]), 2);
      const N = P.map((p) => { const d = sub(p, cc); d[0] = 0; return norm(d); });
      sweep(gear, P, N, (t) => { const e = U.superellipse(0.027, 0.0068, 3.5, t); return [e[0], e[1]]; }, 14);
      const bp = pouchBasis(fz, x, fy1 - 0.03);
      box(hard, add([x, fy1 - 0.03, fz(x, fy1 - 0.03)], scale(bp[2], -0.004)), [0.018, 0.010, 0.0035], bp, 0.002, 2);
    }
  }

  /* ================================================================ ПОЯС */
  function buildBelt(K) {
    const gear = new Part(K, K.G.gear, beltW(K));
    const y0 = 0.972, y1 = 1.028;
    const S = (u, v) => {
      const y = lerp(y0, y1, v), th = u * TAU;
      return [torsoPt(K, y, th, true), torsoN(K, y, th)];
    };
    slab(gear, 72, 4, S, { t0: 0.006, t1: (u, v) => 0.011 * (0.55 + 0.45 * ss(Math.min(v, 1 - v) / 0.25)), wrapU: true });
    /* пряжка «кобра» */
    const [pf, nf] = S(0.25, 0.5);
    box(new Part(K, K.G.hard, beltW(K)), add(pf, scale(nf, 0.02)), [0.028, 0.021, 0.006], basisN(nf), 0.004, 3);
    /* подсумки: положение в долях оборота (0,25 — перед, 0,75 — спина) */
    const pouches = [
      [0.12, [0.034, 0.046, 0.017]],   // спаренный пистолетный — справа
      [0.06, [0.022, 0.040, 0.016]],   // турникет
      [0.40, [0.046, 0.052, 0.026]],   // утилитарный — слева
      [0.62, [0.050, 0.042, 0.022]],   // сброс — сзади слева
      [0.80, [0.082, 0.046, 0.034]]    // аптечка — сзади
    ];
    for (const [u, sz] of pouches) {
      const [p, n] = S(u, 0.5);
      const bs = basisN(n);
      const c = add(add(p, scale(n, 0.017 + sz[2])), [0, -sz[1] * 0.45, 0]);
      box(gear, c, sz, bs, 0.008, 3);
      box(gear, add(c, add(scale(bs[1], sz[1] - 0.006), scale(n, 0.001))), [sz[0] + 0.002, 0.0065, sz[2] + 0.002], bs, 0.003, 2);
    }
  }

  /* ============================================================== СБОРКА */
  /* cfg: { seed, head: 'helmet' | 'boonie', mask } */
  function buildSoldier(G, M, BI, rest, cfg) {
    const h = M.H / 1.80;
    const K = {
      G, M, h, BI, W: makeW(BI),
      n1: U.fbm(cfg.seed + 1, 3, 0.5, 2.1),
      n2: U.fbm(cfg.seed + 7, 2, 0.5, 2.3),
      R: (n) => [rest[n][0] / h, rest[n][1] / h, rest[n][2] / h]
    };
    K.masked = cfg.mask !== false;
    buildTorso(K);
    buildPelvis(K);
    for (const s of [1, -1]) {
      buildArm(K, s);
      buildHand(K, s);
      buildLeg(K, s);
      buildBoot(K, s);
    }
    buildHead(K);
    if (cfg.mask !== false) buildBalaclava(K); else buildFaceKit(K);
    if (cfg.head === 'boonie') buildBoonie(K); else buildHelmet(K);
    buildVest(K);
    buildBelt(K);
    return K;
  }

  return { GROUPS, newGroups, makeW, buildSoldier, torsoPt, headPt, headLocal, HEAD_C, EYE_Y, EYE_X, FACE };
});
/* ---- soldier/body.js ---- */
/* ============================================================================
   Туловище и телосложение бойца.

   Базовое тело MakeHuman — «средний» мужчина: узкие плечи, тонкая шея,
   плоская грудь. Боец на референсе — атлет под грузом: развитые дельты и
   трапеции, широкая спина, мощные бёдра. Форма тела здесь задаётся полем
   объёмов вокруг костей скелета: каждая вершина сдвигается по своей
   нормали на величину поля в её точке покоя.

   Поле одинаково для всех слоёв (кожа, китель, жилет, брюки, балаклава),
   поэтому слои сдвигаются вместе и не прорастают друг сквозь друга.
   ========================================================================== */
(function (root, factory) {
  const B = factory(root.GUtil || (typeof require !== 'undefined' ? require('../core/util.js') : null));
  if (typeof module !== 'undefined' && module.exports) module.exports = B;
  else root.GBody = B;
})(typeof self !== 'undefined' ? self : this, function (U) {
  'use strict';

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const sstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

  /* Объёмы: отрезок между суставами (# — сторона), смещение отрезка (м),
     радиус влияния r и прибавка a по нормали (м). a1 — прибавка на втором
     конце (сужение к запястью, к колену). */
  const BULK = [
    { seg: ['shoulder#', 'shoulder#'], off: [0.010, 0.016, 0.004], r: 0.105, a: 0.010 },          // дельта
    { seg: ['neck', 'shoulder#'], off: [0, 0.028, 0.012], r: 0.060, a: 0.008 },                   // трапеция
    { seg: ['shoulder#', 'elbow#'], off: [0, 0, 0], r: 0.070, a: 0.006, a1: 0.004 },               // плечо
    { seg: ['elbow#', 'wrist#'], off: [0, 0, 0], r: 0.055, a: 0.004, a1: 0.0 },                    // предплечье
    { seg: ['chest', 'chest'], off: [0, 0.06, -0.10], r: 0.16, a: 0.006, mirror: false },           // грудь
    { seg: ['chest', 'chest'], off: [0.12, 0.02, 0.07], r: 0.13, a: 0.006 },                       // широчайшие
    { seg: ['neck', 'head'], off: [0, -0.01, 0.005], r: 0.055, a: 0.004, mirror: false, yMax: 1.66 }, // шея
    { seg: ['hip#', 'knee#'], off: [0, 0, 0], r: 0.110, a: 0.006, a1: 0.002 },                     // бедро
    { seg: ['knee#', 'ankle#'], off: [0, 0.03, 0.02], r: 0.070, a: 0.004, a1: 0.0 }                // икра
  ];

  /* Слои, к которым применяется поле (головные уборы и глаза не трогаем). */
  const LAYERS = { skin: 1, shirt: 1, pants: 1, vest: 1, boot: 1, mask: 1, patch: 1 };

  function segs(J) {
    const out = [];
    for (const b of BULK) {
      const sides = b.seg.some((n) => n.includes('#')) ? [1, -1] : (b.mirror === false ? [0] : [1, -1]);
      for (const s of sides) {
        const S = s < 0 ? 'L' : 'R';
        const A = J[b.seg[0].replace('#', S)], Bp = J[b.seg[1].replace('#', S)];
        if (!A || !Bp) continue;
        const o = [b.off[0] * (s || 1), b.off[1], b.off[2]];
        out.push({ a: [A[0] + o[0], A[1] + o[1], A[2] + o[2]], b: [Bp[0] + o[0], Bp[1] + o[1], Bp[2] + o[2]], r: b.r, k0: b.a, k1: b.a1 === undefined ? b.a : b.a1, yMax: b.yMax });
      }
    }
    return out;
  }

  /* Поле объёма в точке p: максимум вкладов, а не сумма — соседние
     объёмы не складываются в «опухоль» на стыке. */
  function amount(S, p) {
    let best = 0;
    for (const s of S) {
      if (s.yMax !== undefined && p[1] > s.yMax) continue;
      const ab = [s.b[0] - s.a[0], s.b[1] - s.a[1], s.b[2] - s.a[2]];
      const l2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
      const t = l2 > 1e-9 ? clamp(((p[0] - s.a[0]) * ab[0] + (p[1] - s.a[1]) * ab[1] + (p[2] - s.a[2]) * ab[2]) / l2, 0, 1) : 0;
      const d = Math.hypot(p[0] - s.a[0] - ab[0] * t, p[1] - s.a[1] - ab[1] * t, p[2] - s.a[2] - ab[2] * t);
      const w = 1 - sstep(s.r * 0.35, s.r, d);
      if (w > 0) best = Math.max(best, w * (s.k0 + (s.k1 - s.k0) * t));
    }
    return best;
  }

  /* Сдвиг вершин слоя по нормали. pos — Float32Array (м), nrm — Int16
     нормализованные (как в пакете модели). Кисти (x дальше запястья)
     не трогаются — там процедурная перчатка. */
  function shape(group, pos, nrm, n, J) {
    if (!LAYERS[group] || !J) return false;
    const S = segs(J);
    const wx = Math.abs(J.wristR ? J.wristR[0] : 0.75) - 0.01;
    const inv = nrm instanceof Int16Array ? 1 / 32767 : 1;
    for (let v = 0; v < n; v++) {
      const p = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
      if (Math.abs(p[0]) > wx) continue;
      const d = amount(S, p) * inv;
      if (d <= 0) continue;
      pos[v * 3] += nrm[v * 3] * d;
      pos[v * 3 + 1] += nrm[v * 3 + 1] * d;
      pos[v * 3 + 2] += nrm[v * 3 + 2] * d;
    }
    return true;
  }

  return { BULK, LAYERS, shape, amount: (J, p) => amount(segs(J), p) };
});

/* ---- soldier/clothing.js ---- */
/* ============================================================================
   Одежда бойца: крой, камуфляж и ткань.

   1. КРОЙ. Рукава кителя объёмнее руки, брюки заправлены в берцы с
      напуском — вершины слоёв досаживаются по нормали в позе покоя.
   2. КАМУФЛЯЖ под референс: «Дельта-1» — мультикам (мягкие пятна и тонкие
      тёмные «ветки»), «Дельта-2» — серо-зелёный с «органическими
      пикселями», «Альфа-1» — чёрный почти без рисунка, «Альфа-2» —
      чёрно-зелёная цифра.
   3. ТКАНЬ. Шейдер формы добавляет складки там, где ткань мнётся: локоть,
      манжета, колено, напуск над берцами, пояс. Складки — процедурный
      рельеф по точке покоя (dFdx/dFdy), поэтому они гнутся вместе с телом.
      Сверху — пыль и вытертость (низ брюк, колени, локти) и бархатистый
      отлив ткани (sheen).
   ========================================================================== */
(function (root, factory) {
  const C = factory(root.GUtil, root.GTex);
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
  else root.GCloth = C;
})(typeof self !== 'undefined' ? self : this, function (U, T) {
  'use strict';

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const sstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

  /* ------------------------------------------------------------ крой -- */
  /* Рукав шире руки: от подмышки до манжеты, у манжеты прибавка меньше,
     чтобы рукав лёг поверх перчатки. Брюки над берцами — напуск. */
  function fit(group, pos, nrm, n, J) {
    const inv = nrm instanceof Int16Array ? 1 / 32767 : 1;
    const ankY = J && J.ankleR ? J.ankleR[1] : 0.085;
    for (let v = 0; v < n; v++) {
      const x = pos[v * 3], y = pos[v * 3 + 1], ax = Math.abs(x);
      let d = 0;
      if (group === 'shirt' && ax >= 0.23) {
        d = sstep(0.23, 0.31, ax) * (0.013 - 0.0025 * sstep(0.40, 0.55, ax)) * (1 - 0.5 * sstep(0.66, 0.77, ax));
        /* рукав кончается у запястья: дальше — манжета перчатки GLB */
        const xEnd = (J && J.wristR ? Math.abs(J.wristR[0]) : 0.757) - 0.018;
        if (ax > xEnd) pos[v * 3] = Math.sign(x) * (xEnd + (ax - xEnd) * 0.12);
      } else if (group === 'pants') {
        const h = y - ankY;
        d = 0.006 * sstep(0.05, 0.12, h) * (1 - sstep(0.16, 0.26, h));
      }
      if (d <= 0) continue;
      d *= inv;
      pos[v * 3] += nrm[v * 3] * d;
      pos[v * 3 + 1] += nrm[v * 3 + 1] * d;
      pos[v * 3 + 2] += nrm[v * 3 + 2] * d;
    }
  }

  /* ------------------------------------------------------- камуфляж -- */
  /* Палитры под референс (sRGB 0..255). Размеры пятен — в пикселях тайла
     512 px на 0,42 м ткани. */
  const PAL = {
    delta_green: {
      base: [92, 96, 60],
      layers: [
        { col: [116, 112, 74], r: [34, 70], n: 16, wob: 0.44 },
        { col: [66, 82, 44], r: [26, 62], n: 22, wob: 0.48 },
        { col: [90, 68, 44], r: [16, 42], n: 24, wob: 0.52 },
        { col: [44, 54, 32], r: [10, 28], n: 34, wob: 0.55 }
      ],
      speck: [[44, 50, 30, 0.28], [130, 124, 88, 0.18]],
      branches: { col: [38, 38, 26], n: 28, w: [1.2, 2.6] }, blur: 1.0
    },
    delta_grey: {
      base: [124, 122, 104],
      pixel: 3,
      layers: [
        { col: [146, 140, 116], r: [34, 76], n: 16 },
        { col: [100, 106, 88], r: [24, 58], n: 22 },
        { col: [78, 82, 66], r: [14, 38], n: 28 },
        { col: [54, 56, 46], r: [8, 20], n: 34 }
      ],
      speck: [[74, 78, 62, 0.24], [156, 152, 130, 0.18]],
      branches: { col: [70, 72, 60], n: 14, w: [1.0, 2.0] }, blur: 0.6
    },
    alpha_black: {
      base: [36, 37, 40],
      layers: [
        { col: [44, 45, 49], r: [44, 96], n: 12, wob: 0.36 },
        { col: [29, 30, 33], r: [26, 62], n: 16, wob: 0.44 },
        { col: [50, 51, 56], r: [12, 30], n: 14, wob: 0.48 }
      ],
      speck: [[26, 27, 30, 0.3], [60, 62, 67, 0.12]], blur: 0.8
    },
    alpha_cadpat: {
      base: [30, 33, 30],
      pixel: 6,
      layers: [
        { col: [56, 70, 50], r: [36, 80], n: 16 },
        { col: [40, 51, 38], r: [24, 56], n: 20 },
        { col: [74, 88, 64], r: [12, 30], n: 22 },
        { col: [19, 21, 19], r: [10, 26], n: 24 }
      ],
      speck: [[50, 62, 46, 0.22], [18, 20, 18, 0.24]]
    },
    /* дополнительные формы для бойцов (GChar.build(..., { camo })) */
    flora: {                                   // «Флора»: светлая олива, бурые и зелёные полосы
      base: [118, 124, 86],
      layers: [
        { col: [92, 104, 66], r: [30, 70], n: 18, wob: 0.62 },
        { col: [104, 72, 52], r: [16, 40], n: 22, wob: 0.66 },
        { col: [60, 72, 46], r: [12, 30], n: 24, wob: 0.6 }
      ],
      speck: [[80, 90, 58, 0.22], [136, 138, 100, 0.16]], blur: 0.8
    },
    woodland: {                                // классический лесной: четыре крупных цвета
      base: [96, 100, 70],
      layers: [
        { col: [70, 84, 52], r: [40, 86], n: 16, wob: 0.46 },
        { col: [94, 74, 50], r: [30, 70], n: 16, wob: 0.5 },
        { col: [32, 34, 28], r: [16, 40], n: 20, wob: 0.55 }
      ],
      speck: [[58, 66, 42, 0.2], [120, 118, 86, 0.14]], blur: 0.7
    },
    olive: {                                   // однотонная олива
      base: [78, 82, 58],
      layers: [
        { col: [84, 88, 62], r: [40, 90], n: 10, wob: 0.4 },
        { col: [72, 76, 54], r: [30, 70], n: 12, wob: 0.4 }
      ],
      speck: [[66, 70, 50, 0.2], [92, 96, 70, 0.12]], blur: 1.2
    },
    coyote: {                                  // песочный койот
      base: [128, 108, 80],
      layers: [
        { col: [140, 120, 90], r: [40, 90], n: 10, wob: 0.4 },
        { col: [116, 96, 70], r: [26, 64], n: 14, wob: 0.44 }
      ],
      speck: [[104, 88, 64, 0.2], [150, 132, 100, 0.12]], blur: 1.0
    },
    urban: {                                   // серый цифровой
      base: [92, 94, 96],
      pixel: 5,
      layers: [
        { col: [120, 122, 124], r: [30, 70], n: 16 },
        { col: [70, 72, 76], r: [22, 54], n: 20 },
        { col: [46, 48, 52], r: [10, 28], n: 22 }
      ],
      speck: [[80, 82, 86, 0.22], [130, 132, 134, 0.14]]
    }
  };
  if (T && T.PALETTES) for (const k in PAL) T.PALETTES[k] = PAL[k];

  /* тонкие изогнутые «ветки» мультикама, бесшовно по тайлу */
  function branches(c, B, seed) {
    const g = c.getContext('2d'), S = c.width, sc = S / 512;
    const rnd = U.rng(seed);
    g.strokeStyle = 'rgb(' + B.col.join(',') + ')';
    g.lineCap = 'round';
    for (let i = 0; i < B.n; i++) {
      let x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI * 2;
      const segs = 4 + Math.floor(rnd() * 6), step = (10 + rnd() * 16) * sc;
      g.lineWidth = U.lerp(B.w[0], B.w[1], rnd()) * sc;
      const pts = [[x, y]];
      for (let k = 0; k < segs; k++) {
        a += (rnd() - 0.5) * 1.3;
        x += Math.cos(a) * step; y += Math.sin(a) * step;
        pts.push([x, y]);
      }
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        g.beginPath();
        pts.forEach((p, k) => (k ? g.lineTo(p[0] + ox * S, p[1] + oy * S) : g.moveTo(p[0] + ox * S, p[1] + oy * S)));
        g.stroke();
      }
    }
  }
  /* мягкие края пятен: размытие по тайлу 3×3, чтобы не было шва */
  function soften(c, px) {
    const S = c.width;
    const big = document.createElement('canvas'); big.width = big.height = S * 3;
    const gb = big.getContext('2d');
    for (let oy = 0; oy < 3; oy++) for (let ox = 0; ox < 3; ox++) gb.drawImage(c, ox * S, oy * S);
    const out = c.getContext('2d');
    out.save();
    out.filter = 'blur(' + (px * S / 512).toFixed(2) + 'px)';
    out.drawImage(big, S, S, S, S, 0, 0, S, S);
    out.restore();
  }
  function camo(kind, seed, size) {
    const c = T.camoAlbedo(kind, seed, size);
    const P = PAL[kind];
    if (P && P.branches) branches(c, P.branches, seed + 77);
    if (P && P.blur && typeof document !== 'undefined') { try { soften(c, P.blur); } catch (e) { /* без размытия */ } }
    return c;
  }

  /* ---------------------------------------------------------- ткань -- */
  const GLSL_FOLDS = `
    uniform vec4 uJ;          // x: |x| локтя, y: |x| запястья, z: y колена, w: y верха берца
    uniform vec2 uFold;       // x: сила складок, y: сила грязи
    float hsh(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float vnoise(vec3 x) {
      vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(hsh(i), hsh(i + vec3(1,0,0)), f.x), mix(hsh(i + vec3(0,1,0)), hsh(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(hsh(i + vec3(0,0,1)), hsh(i + vec3(1,0,1)), f.x), mix(hsh(i + vec3(0,1,1)), hsh(i + vec3(1,1,1)), f.x), f.y), f.z);
    }
    /* рельеф складок, м: кольца на локте и манжете, над коленом и в
       напуске над берцами, горизонтальные — на поясе */
    float foldH(vec3 p) {
      float ax = abs(p.x), h = 0.0;
      float arm = smoothstep(0.26, 0.32, ax) * (1.0 - smoothstep(uJ.y - 0.01, uJ.y + 0.02, ax)) * step(1.30, p.y);
      /* фаза складки гуляет по окружности конечности и вдоль неё — иначе
         кольца читаются как ровные полосы */
      float wob = vnoise(p * 31.0) * 3.2 + vnoise(p * 8.0) * 2.4 + vnoise(p * 83.0) * 0.8;
      float amp = 0.55 + 0.9 * vnoise(p * 17.0 + 3.1);
      float e = ax - uJ.x;
      h += arm * exp(-e * e / 0.0030) * sin(e * 210.0 + wob) * 0.0011 * amp;
      float c = ax - (uJ.y - 0.055);
      h += arm * exp(-c * c / 0.0008) * sin(c * 300.0 + wob * 1.3) * 0.0008 * amp;
      float sh = ax - 0.30;
      h += arm * exp(-sh * sh / 0.0025) * sin((p.y * 0.8 + p.z * 1.2) * 170.0 + wob) * 0.0005 * amp;
      float leg = 1.0 - smoothstep(0.95, 1.05, p.y);
      float k = p.y - uJ.z - 0.03;
      h += leg * exp(-k * k / 0.0042) * sin(k * 160.0 + wob) * 0.0012 * amp;
      float b = p.y - uJ.w;
      h += leg * smoothstep(-0.01, 0.03, b) * (1.0 - smoothstep(0.10, 0.18, b)) * sin(b * 200.0 + wob * 1.4) * 0.0015 * amp;
      float wst = p.y - 1.02;
      h += smoothstep(0.12, 0.0, abs(wst)) * sin(wst * 240.0 + wob) * 0.0005 * amp;
      return h * uFold.x;
    }
    /* рельеф без развёртки (Mikkelsen): высота в метрах, позиция в метрах */
    vec3 bumpN(vec3 sp, vec3 n, float h, float fd) {
      vec3 sx = dFdx(sp), sy = dFdy(sp);
      vec3 r1 = cross(sy, n), r2 = cross(n, sx);
      float det = dot(sx, r1) * fd;
      vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
      return normalize(abs(det) * n - grad);
    }`;

  /* Материал формы: камуфляж трипланарно по позе покоя, фактура вещи из её
     текстуры (швы, карманы) умножается как яркость, складки и пыль —
     процедурно. opt: detail, normal, mean, detailK, tile, side, nScale,
     rough, joints (J модели), folds, dirt. */
  function garmentMat(THREE, camoTex, opt) {
    const J = opt.joints || {};
    const jv = new THREE.Vector4(
      Math.abs(J.elbowR ? J.elbowR[0] : 0.49), Math.abs(J.wristR ? J.wristR[0] : 0.76),
      J.kneeR ? J.kneeR[1] : 0.53, (J.ankleR ? J.ankleR[1] : 0.085) + 0.17);
    const Phys = THREE.MeshPhysicalMaterial || THREE.MeshStandardMaterial;
    const mat = new Phys({
      map: opt.detail || null, normalMap: opt.normal || null,
      normalScale: new THREE.Vector2(opt.nScale || 1, opt.nScale || 1),
      roughness: opt.rough === undefined ? 0.92 : opt.rough, metalness: 0,
      side: opt.side || THREE.FrontSide
    });
    if (mat.isMeshPhysicalMaterial && opt.sheen !== 0) {
      mat.sheen = opt.sheen === undefined ? 0.45 : opt.sheen;
      mat.sheenRoughness = 0.75;
      mat.sheenColor = new THREE.Color(0.55, 0.55, 0.52);
    }
    const mean = opt.mean || (opt.detail ? opt.detail.userData.mean : [1, 1, 1]);
    const lm = 0.2126 * mean[0] + 0.7152 * mean[1] + 0.0722 * mean[2];
    const folds = opt.folds === undefined ? 1 : opt.folds, dirt = opt.dirt === undefined ? 1 : opt.dirt;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uCamo = { value: camoTex };
      sh.uniforms.uTile = { value: 1 / (opt.tile || 0.42) };
      sh.uniforms.uDetail = { value: opt.detailK === undefined ? 1 : opt.detailK };
      sh.uniforms.uDetailMean = { value: Math.max(lm, 1e-3) };
      sh.uniforms.uJ = { value: jv };
      sh.uniforms.uFold = { value: new THREE.Vector2(folds, dirt) };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          varying vec3 vRestPos;
          varying vec3 vRestNrm;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vRestPos = position;
          vRestNrm = normal;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D uCamo;
          uniform float uTile, uDetail, uDetailMean;
          varying vec3 vRestPos;
          varying vec3 vRestNrm;` + GLSL_FOLDS)
        .replace('#include <map_fragment>', `
          vec3 tpN = abs(normalize(vRestNrm));
          tpN = pow(tpN, vec3(4.0));
          tpN /= max(tpN.x + tpN.y + tpN.z, 1e-4);
          vec3 tpP = vRestPos * uTile;
          vec4 camo = texture2D(uCamo, tpP.zy) * tpN.x + texture2D(uCamo, tpP.xz) * tpN.y + texture2D(uCamo, tpP.xy) * tpN.z;
          #ifdef USE_MAP
            vec3 det = texture2D(map, vMapUv).rgb;
            float dl = dot(det, vec3(0.2126, 0.7152, 0.0722)) / uDetailMean;
            camo.rgb *= mix(1.0, clamp(dl, 0.15, 1.8), uDetail);
          #endif
          /* пыль снизу брюк и на коленях, вытертость на локтях */
          float nz = vnoise(vRestPos * 23.0) * 0.6 + vnoise(vRestPos * 71.0) * 0.4;
          float low = 1.0 - smoothstep(0.08, 0.50, vRestPos.y);
          float knee = exp(-pow((vRestPos.y - uJ.z) / 0.07, 2.0)) * smoothstep(0.1, -0.4, vRestNrm.z) * step(vRestPos.y, 1.0);
          float elb = exp(-pow((abs(vRestPos.x) - uJ.x) / 0.05, 2.0)) * step(1.30, vRestPos.y);
          float dk = clamp((low * 0.75 + knee * 0.55 + elb * 0.35) * (0.45 + 0.8 * nz) * uFold.y, 0.0, 0.8);
          camo.rgb = mix(camo.rgb, camo.rgb * vec3(0.86, 0.80, 0.70) + vec3(0.035, 0.028, 0.018), dk);
          diffuseColor *= camo;`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          normal = bumpN(-vViewPosition, normal, foldH(vRestPos), faceDirection);`);
    };
    mat.customProgramCacheKey = () => 'garment2' + (opt.detail ? 1 : 0) + (opt.normal ? 1 : 0) + (mat.isMeshPhysicalMaterial ? 'p' : 's');
    return mat;
  }

  return { PAL, fit, camo, garmentMat };
});

/* ---- soldier/gear.js ---- */
/* ============================================================================
   Снаряжение поверх формы: наколенники и нашивки на рукавах.

   Детали строятся в позе покоя по суставам модели и привязываются к одной
   кости: наколенник — к голени (кость колена), нашивка — к плечу. Поверхность
   рукава берётся с учётом объёмов тела (body.js) и кроя (clothing.js),
   поэтому нашивка лежит на ткани, а не висит в воздухе и не тонет в ней.
   ========================================================================== */
(function (root, factory) {
  const G = factory(root.GUtil, root.GBody);
  if (typeof module !== 'undefined' && module.exports) module.exports = G;
  else root.GGear = G;
})(typeof self !== 'undefined' ? self : this, function (U, BODY) {
  'use strict';

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  function Acc() { this.p = []; this.n = []; this.uv = []; this.si = []; this.sw = []; this.ix = []; }
  Acc.prototype.v = function (p, n, uv, bone) {
    this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.uv.push(uv[0], uv[1]);
    this.si.push(bone, 0, 0, 0); this.sw.push(1, 0, 0, 0);
    return this.p.length / 3 - 1;
  };
  function geo(THREE, a) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(a.p), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(a.n), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(a.uv), 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(a.si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(a.sw), 4));
    g.setIndex(a.ix);
    g.computeVertexNormals();
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 1.2);
    return g;
  }

  /* Скруглённая пластина по сетке (u, v) ∈ [-1, 1]²: surf(u, v, off) даёт
     точку на лицевой (off = 1) или внутренней (off = 0) стороне. Квадрат
     переводится в «скруглённый» диск, края замыкаются бортиком. */
  function shell(a, surf, bone, N, M, uvf) {
    const face = (off, flip) => {
      const base = a.p.length / 3;
      for (let j = 0; j <= M; j++) for (let i = 0; i <= N; i++) {
        const s = i / N * 2 - 1, t = j / M * 2 - 1;
        const u = s * Math.sqrt(1 - t * t * 0.35), v = t * Math.sqrt(1 - s * s * 0.35);
        a.v(surf(u, v, off), [0, 0, 1], uvf ? uvf(u, v) : [(u + 1) / 2, (v + 1) / 2], bone);
      }
      for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) {
        const q = base + j * (N + 1) + i, r = q + N + 1;
        if (flip) a.ix.push(q, q + 1, r + 1, q, r + 1, r); else a.ix.push(q, r + 1, q + 1, q, r, r + 1);
      }
      return base;
    };
    const f0 = face(1, false), f1 = face(0, true);
    /* бортик по контуру */
    const ring = [];
    for (let i = 0; i < N; i++) ring.push([i, 0]);
    for (let j = 0; j < M; j++) ring.push([N, j]);
    for (let i = N; i > 0; i--) ring.push([i, M]);
    for (let j = M; j > 0; j--) ring.push([0, j]);
    for (let k = 0; k < ring.length; k++) {
      const [i0, j0] = ring[k], [i1, j1] = ring[(k + 1) % ring.length];
      const A = f0 + j0 * (N + 1) + i0, B = f0 + j1 * (N + 1) + i1;
      const C = f1 + j1 * (N + 1) + i1, D = f1 + j0 * (N + 1) + i0;
      a.ix.push(A, D, C, A, C, B);
    }
  }

  function gearGeometry(THREE, J, BI, P) {
    const out = {};
    /* ---- наколенники: купол перед коленом, чуть ниже сустава ---- */
    if (P.kneePads) {
      const a = new Acc();
      for (const s of [1, -1]) {
        const S = s > 0 ? 'R' : 'L';
        const K = J['knee' + S];
        const Rk = 0.074, zc = K[2];
        shell(a, (u, v, off) => {
          const th = u * 0.78;
          const dome = 0.013 * (1 - u * u) * (1 - v * v * 0.8);
          const r = Rk + 0.004 + (off ? 0.011 + dome : dome * 0.6);
          return [K[0] + s * Math.sin(th) * r * 0.95, K[1] - 0.018 + v * 0.074, zc - Math.cos(th) * r];
        }, BI['knee' + S], 14, 12);
        /* ремешки под и над чашкой */
        for (const dy of [0.085, -0.115]) {
          shell(a, (u, v, off) => {
            const th = u * Math.PI * 0.98;
            const r = (dy > 0 ? 0.068 : 0.058) + (off ? 0.0035 : 0.0005);
            return [K[0] + s * Math.sin(th) * r, K[1] + dy + v * 0.011, zc - Math.cos(th) * r];
          }, BI[(dy > 0 ? 'hip' : 'knee') + S], 20, 2);
        }
      }
      out.kneePad = geo(THREE, a);
    }
    /* ---- нашивки на рукавах: на наружной стороне плеча (в покое — сверху) ---- */
    {
      const a = new Acc();
      for (const s of [1, -1]) {
        const S = s > 0 ? 'R' : 'L';
        const sh = J['shoulder' + S], el = J['elbow' + S];
        const x0 = sh[0] + (el[0] - sh[0]) * 0.40;
        const axisY = sh[1] - 0.012, axisZ = sh[2] + 0.006;
        const top = 1.533 - axisY;                                  // радиус рукава сверху (замер)
        const lift = 0.013 + (BODY ? BODY.amount(J, [x0, axisY + top, axisZ]) : 0.004);
        const R = top + lift;
        /* верх логотипа — к плечу, без зеркала на левой руке */
        shell(a, (u, v, off) => {
          const th = u * 0.42;
          const r = R + 0.0006 + (off ? 0.0024 : 0);
          return [x0 + s * v * 0.040, axisY + Math.cos(th) * r, axisZ - Math.sin(th) * r];
        }, BI['armTwist' + S] !== undefined ? BI['armTwist' + S] : BI['shoulder' + S], 10, 8,
        (u, v) => [s > 0 ? (u + 1) / 2 : (1 - u) / 2, (1 - v) / 2]);
      }
      out.sleevePatch = geo(THREE, a);
    }
    return out;
  }

  function gearMaterials(THREE, P, srgb, mats) {
    const out = {};
    out.kneePad = new THREE.MeshStandardMaterial({
      color: srgb(THREE, P.padCol || P.hardCol), roughness: 0.55, metalness: 0, envMapIntensity: 0.9
    });
    if (mats.patch) out.sleevePatch = mats.patch;
    return out;
  }

  return { gearGeometry, gearMaterials };
});

/* ---- soldier/character.js ---- */
/* ============================================================================
   Сборка бойца в three.js: скелет -> SkinnedMesh -> материалы.

   Один боец — четыре формы (как на референсе):
     delta_1 — «Дельта», зелёный лесной камуфляж, шлем FAST;
     delta_2 — «Дельта», серо-зелёный, панама вместо шлема;
     alpha_1 — «Альфа», полностью чёрный;
     alpha_2 — «Альфа», чёрно-зелёный цифровой камуфляж.

   Тело, форма и снаряжение у всех — одна и та же геометрия (один рост,
   одно телосложение), она строится один раз на тип головного убора и
   переиспользуется. Бойцы отличаются только материалами: камуфляж, цвет
   снаряжения и перчаток, нашивка подразделения.
   ========================================================================== */
(function (root, factory) {
  const C = factory(root.GUtil, root.GBuf, root.GSkel, root.GSoldier, root.GTex,
    root.GBody, root.GCloth, root.GGear, root.GHands);
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
  else root.GChar = C;
})(typeof self !== 'undefined' ? self : this, function (U, B, SK, S, T, BODYMOD, CLOTH, GEAR, HANDS) {
  'use strict';

  /* ---------------------------------------------------------- пресеты --- */
  /* Общие для всех параметры тела: «один перс» в четырёх формах. */
  const BODY = { height: 1.80, build: 1.0, skinTone: [196, 152, 126], geoSeed: 1701 };
  const PRESETS = {
    delta_1: {
      name: 'ДЕЛЬТА-1', faction: 'delta', callsign: 'Кедр',
      camo: 'delta_green',
      head: 'helmet',
      mask: false,
      gearCol: [96, 90, 64], hardCol: [58, 56, 44], maskCol: [52, 56, 40],
      bootCol: [52, 45, 36], gloveCol: [60, 58, 53], gloveHardCol: [26, 26, 25], patchCol: [[56, 60, 42], [178, 170, 132]],
      seed: 1201
    },
    delta_2: {
      name: 'ДЕЛЬТА-2', faction: 'delta', callsign: 'Сойка',
      camo: 'delta_grey',
      head: 'boonie',
      mask: true, kneePads: true, padCol: [62, 62, 54],
      gearCol: [88, 90, 74], hardCol: [48, 50, 46], maskCol: [62, 66, 54],
      bootCol: [58, 52, 44], gloveCol: [66, 62, 55], gloveHardCol: [30, 29, 27], patchCol: [[70, 72, 60], [190, 186, 160]],
      seed: 2402
    },
    alpha_1: {
      name: 'АЛЬФА-1', faction: 'alpha', callsign: 'Ворон',
      camo: 'alpha_black',
      head: 'helmet',
      mask: true, kneePads: true, padCol: [30, 31, 33],
      gearCol: [42, 44, 48], hardCol: [36, 37, 40], maskCol: [30, 30, 33],
      bootCol: [34, 34, 37], gloveCol: [50, 50, 53], gloveHardCol: [20, 20, 21], patchCol: [[40, 41, 45], [196, 199, 204]],
      seed: 3603
    },
    alpha_2: {
      name: 'АЛЬФА-2', faction: 'alpha', callsign: 'Тис',
      camo: 'alpha_cadpat',
      head: 'helmet',
      mask: true, kneePads: true, padCol: [34, 36, 33],
      gearCol: [46, 54, 42], hardCol: [36, 38, 36], maskCol: [30, 31, 30],
      bootCol: [36, 36, 36], gloveCol: [54, 55, 52], gloveHardCol: [22, 22, 22], patchCol: [[42, 48, 40], [188, 194, 190]],
      seed: 4804
    }
  };
  for (const k in PRESETS) {
    PRESETS[k].height = BODY.height;
    PRESETS[k].build = BODY.build;
    PRESETS[k].skinTone = BODY.skinTone;
  }
  const ORDER = ['delta_1', 'delta_2', 'alpha_1', 'alpha_2'];

  /* ------------------------------------------- внешняя модель бойца --- */
  /* Реалистичный боец собирается в Blender из ассетов MakeHuman (тело,
     кожа по фотографиям, глаза, брови) и одежды с картами складок —
     скрипт game/tools/soldier/build.py. Результат лежит в assets/soldier:
     soldier.json (суставы, описание мешей и текстур) + soldier.bin (буферы).
     Меш привязан к тому же скелету, что и процедурный боец, поэтому риг,
     IK рук и хват оружия работают без изменений. Если пакет не загрузился,
     остаётся процедурная модель. */
  const PACK_DIR = 'assets/soldier/';
  const GA = typeof self !== 'undefined' ? self.GAssets : null;
  if (GA) GA.add('soldier', (async () => {
    const [hdr, bin] = await Promise.all([GA.fetchAny(PACK_DIR + 'soldier.json', 'json'), GA.fetchAny(PACK_DIR + 'soldier.bin')]);
    const files = new Set();
    for (const m of hdr.meshes) for (const k in (m.tex || {})) if (typeof m.tex[k] === 'string') files.add(m.tex[k]);
    const img = {};
    await Promise.all([...files].map(async (f) => { img[f] = await GA.image(PACK_DIR + 'tex/' + f); }));
    return { hdr, bin, img };
  })());
  const packData = () => (GA && GA.data.soldier) || null;

  /* --------------------------------------------------------- материалы -- */
  /* Кэш текстур: четыре бойца используют разные камуфляжи, но общие карты
     нормалей и шероховатости — генерировать их заново не нужно. */
  const texCache = new Map();
  function cached(key, make) {
    if (!texCache.has(key)) texCache.set(key, make());
    return texCache.get(key);
  }

  function mkTex(THREE, canvas, repeat, srgb) {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (repeat) t.repeat.set(repeat, repeat);
    if (srgb && 'colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }

  /* Цвет из «человеческих» 0..255 sRGB.
     THREE.Color принимает линейные значения, поэтому прямое деление на 255
     осветляло материал вдвое: чёрные берцы получались светло-серыми. */
  function srgb(THREE, rgb) {
    const c = new THREE.Color();
    if (c.setRGB.length >= 4) c.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
    else c.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255).convertSRGBToLinear();
    return c;
  }

  /* Трипланар: смешиваем три проекции по квадрату нормали. Работает и для
     SkinnedMesh — координаты берутся ДО скиннинга, из атрибута position. */
  function triplanar(THREE, mat, tile) {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTile = { value: 1 / tile };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          varying vec3 vRestPos;
          varying vec3 vRestNrm;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vRestPos = position;
          vRestNrm = normal;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uTile;
          varying vec3 vRestPos;
          varying vec3 vRestNrm;`)
        .replace('#include <map_fragment>', `
          vec3 tpN = abs(normalize(vRestNrm));
          tpN = pow(tpN, vec3(4.0));
          tpN /= max(tpN.x + tpN.y + tpN.z, 1e-4);
          vec3 tpP = vRestPos * uTile;
          vec4 tpX = texture2D(map, tpP.zy);
          vec4 tpY = texture2D(map, tpP.xz);
          vec4 tpZ = texture2D(map, tpP.xy);
          vec4 sampledDiffuseColor = tpX * tpN.x + tpY * tpN.y + tpZ * tpN.z;
          diffuseColor *= sampledDiffuseColor;`);
    };
    mat.customProgramCacheKey = () => 'triplanar' + tile;
  }

  /* ------------------------------------------------------- лицо ------- */
  /* Текстура головы в развёртке (θ, φ) — ровно так же, как строится сетка
     головы в soldier.js. Каждый пиксель переводится в точку на голове, и
     все черты задаются в метрах лица: брови, щетина, губы, ноздри,
     румянец, тени у век, короткая стрижка. Поэтому рисунок всегда совпадает
     с рельефом, а не «плывёт» относительно носа и глаз. */
  function faceAlbedo(seed, tone, W, H) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const img = g.createImageData(W, H), d = img.data;
    const f1 = U.fbm(seed + 3, 4, 0.55, 2.2), f2 = U.fbm(seed + 11, 3, 0.5, 2.1), f3 = U.fbm(seed + 29, 2, 0.5, 2.0);
    const ss = U.smoothstep, lerp = U.lerp, cl = U.clamp01;
    const gs = (v) => Math.exp(-v * v);
    const hc = S.HEAD_C, EY = S.EYE_Y, EX = S.EYE_X;
    const hairline = (a) => {
      /* высота линии роста волос по азимуту |θ| (0 — лоб, π — затылок) */
      const T = [[0, 1.742], [0.55, 1.737], [0.85, 1.726], [1.05, 1.702], [1.2, 1.664], [1.34, 1.664],
        [1.45, 1.700], [1.75, 1.700], [1.95, 1.672], [2.35, 1.615], [Math.PI, 1.598]];
      for (let i = 0; i < T.length - 1; i++) if (a <= T[i + 1][0]) return lerp(T[i][1], T[i + 1][1], (a - T[i][0]) / (T[i + 1][0] - T[i][0]));
      return T[T.length - 1][1];
    };
    const base = tone;
    for (let j = 0; j < H; j++) {
      const ph = (j + 0.5) / H * Math.PI;
      for (let i = 0; i < W; i++) {
        const th = ((i + 0.5) / W - 0.5) * Math.PI * 2;
        const l = S.headLocal(th, ph, S.FACE);
        const x = l[0], ax = Math.abs(x), Y = hc[1] + l[1], sy = l[1] / 0.114;
        const fr = ss((-l[2] / 0.099 - 0.2) / 0.5);          // 1 на лице
        const at = Math.abs(th);
        /* шум по 3D-точке: нет шва на затылке */
        const nx = x * 60 + l[2] * 41, ny = Y * 60;
        const mott = f1(nx * 0.35, ny * 0.35) - 0.5;
        const pore = f2(x * 900 + l[2] * 610, Y * 900) - 0.5;
        const fine = f3(x * 800 + l[2] * 560, Y * 800) - 0.5;
        let r = base[0], gg = base[1], b = base[2];
        /* подкожная неравномерность и поры */
        r *= 1 + mott * 0.12 + pore * 0.05; gg *= 1 + mott * 0.08 + pore * 0.05; b *= 1 + mott * 0.06 + pore * 0.05;
        /* румянец: скулы, нос, уши, подбородок */
        const flush = fr * (0.55 * gs((ax - 0.045) / 0.02) * gs((sy + 0.3) / 0.14)
          + 0.6 * gs(x / 0.012) * gs((sy + 0.36) / 0.08) + 0.35 * gs((sy + 0.8) / 0.1) * gs(x / 0.03))
          + 0.5 * gs((at - Math.PI / 2) / 0.22) * gs((Y - 1.675) / 0.03);
        r += flush * 16; gg -= flush * 9; b -= flush * 7;
        /* губы */
        const lipU = gs((sy + 0.598) / 0.026) * gs(Math.pow(x / 0.0205, 2));
        const lipL = gs((sy + 0.648) / 0.03) * gs(Math.pow(x / 0.019, 2));
        const lip = fr * cl(lipU + lipL);
        r = lerp(r, 156, lip * 0.55); gg = lerp(gg, 96, lip * 0.6); b = lerp(b, 88, lip * 0.6);
        const mouth = fr * gs((sy + 0.62) / 0.0085) * gs(Math.pow(x / 0.023, 2));
        r = lerp(r, 82, mouth * 0.8); gg = lerp(gg, 48, mouth * 0.8); b = lerp(b, 44, mouth * 0.8);
        /* ноздри и тень под кончиком носа */
        const nost = fr * gs((sy + 0.438) / 0.012) * gs((ax - 0.0085) / 0.0048);
        const subn = fr * gs((sy + 0.455) / 0.022) * gs(x / 0.016) * 0.35;
        const ao = cl(nost * 0.9 + subn);
        r *= 1 - ao * 0.55; gg *= 1 - ao * 0.6; b *= 1 - ao * 0.6;
        /* веки: тень у внутреннего угла, линия ресниц, синева под глазом */
        const ey = Y - (EY - 0.0006), ex = ax - EX;
        const lash = fr * gs((ey - 0.0046 + 0.0026 * Math.pow(ex / 0.014, 2)) / 0.0010) * gs(Math.pow(ex / 0.0145, 4));
        const lid = fr * gs((ey - 0.0078) / 0.004) * gs(ex / 0.016) * 0.35
          + fr * gs((ey + 0.0085) / 0.0045) * gs(ex / 0.015) * 0.3
          + fr * gs((ax - 0.016) / 0.006) * gs((ey - 0.001) / 0.008) * 0.35;
        r = lerp(r, 58, cl(lash) * 0.85); gg = lerp(gg, 40, cl(lash) * 0.85); b = lerp(b, 36, cl(lash) * 0.85);
        r *= 1 - lid * 0.22; gg *= 1 - lid * 0.26; b *= 1 - lid * 0.2;
        /* щетина: челюсть, подбородок, усы, шея — сизая тень с «точками» */
        const beardTop = lerp(1.664, 1.628, cl((0.068 - ax) / 0.038)) + (mott * 0.006);
        let beard = cl((1 - ss((Y - beardTop) / 0.007)) * (1 - ss((at - 1.22) / 0.07)));
        beard *= 1 - ss((ph / Math.PI - 0.9) / 0.04);
        const must = fr * band2(sy, -0.575, -0.465, 0.02) * (1 - ss((ax - 0.026) / 0.006));
        beard = Math.max(beard * (1 - ss((sy + 0.47) / 0.03) * (1 - ss((ax - 0.03) / 0.01))), must);
        beard *= 1 - cl(lip * 1.4);
        const dots = ss((fine + 0.1) / 0.18);
        const bk = beard * (0.10 + 0.20 * dots) * (0.9 + mott);
        r = lerp(r, 92, bk); gg = lerp(gg, 88, bk); b = lerp(b, 90, bk);
        /* брови: пучки волос вдоль дуги, гуще у переносицы */
        const t = (ax - 0.012) / 0.037;
        if (fr > 0.2 && t > -0.2 && t < 1.2) {
          const yc = EY + 0.0150 + 0.0030 * Math.sin(Math.PI * cl(t) * 0.85) - 0.0012 * t * t;
          const hw = lerp(0.0040, 0.0016, cl(t));
          const e = Math.abs(Y - yc) / hw;
          const strand = f3(ax * 1600 - (Y - yc) * 700, (Y - yc) * 260) ;
          const brow = (1 - ss((e - 0.6) / 0.6)) * ss((t + 0.12) / 0.14) * (1 - ss((t - 1.0) / 0.12)) * (0.55 + 0.6 * strand) * fr;
          const k = cl(brow) * 0.8;
          r = lerp(r, 52, k); gg = lerp(gg, 40, k); b = lerp(b, 33, k);
        }
        /* короткая стрижка: тёмная «щетина» волос по линии роста */
        const hl = hairline(at);
        const hair = ss((Y - hl) / 0.005);
        if (hair > 0) {
          const hk = hair * (0.62 + 0.3 * ss((fine + 0.05) / 0.2)) * (0.9 + mott * 0.5);
          r = lerp(r, 40, hk); gg = lerp(gg, 33, hk); b = lerp(b, 29, hk);
        }
        const o = (j * W + i) * 4;
        d[o] = Math.max(0, Math.min(255, r)); d[o + 1] = Math.max(0, Math.min(255, gg));
        d[o + 2] = Math.max(0, Math.min(255, b)); d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  function band2(v, a, b, soft) { return U.smoothstep((v - a) / soft) * (1 - U.smoothstep((v - b) / soft)); }

  /* Склера: v = 0 — верх яблока (под веком, в тени), по бокам розоватые
     уголки, в середине — чуть серая, не «бумажно-белая». */
  function scleraCanvas() {
    const W = 64, H = 64, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const u = i / W, v = j / H;
      const side = Math.pow(Math.abs(Math.sin(u * Math.PI * 2)), 3);
      const lidSh = U.smoothstep((0.47 - v) / 0.08);
      let r = 214, gg = 204, b = 194;
      r = U.lerp(r, 196, side * 0.6); gg = U.lerp(gg, 150, side * 0.6); b = U.lerp(b, 142, side * 0.6);
      const k = 1 - lidSh * 0.55;
      const o = (j * W + i) * 4;
      d[o] = r * k; d[o + 1] = gg * k; d[o + 2] = b * k; d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  /* Радужка: v — радиус (0 — центр). Зрачок, волокна, тёмный лимб. */
  function irisCanvas(seed, col) {
    const W = 128, H = 32, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
    const f = U.fbm(seed, 3, 0.5, 2.0);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const u = i / W, v = (j + 0.5) / H;
      const fib = f(u * 40, v * 3) - 0.5;
      let r = col[0] * (1 + fib * 0.7), gg = col[1] * (1 + fib * 0.7), b = col[2] * (1 + fib * 0.6);
      const collar = Math.exp(-Math.pow((v - 0.45) / 0.08, 2));
      r += collar * 30; gg += collar * 22; b += collar * 10;
      const pupil = 1 - U.smoothstep((v - 0.30) / 0.05);
      const limb = U.smoothstep((v - 0.82) / 0.1);
      const k = Math.max(pupil, limb * 0.75);
      const o = (j * W + i) * 4;
      d[o] = U.lerp(r, 8, k); d[o + 1] = U.lerp(gg, 7, k); d[o + 2] = U.lerp(b, 7, k); d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  function buildMaterials(THREE, cfg) {
    const seed = cfg.seed;
    const camoCv = cached('camo_' + cfg.camo + '_' + seed, () => T.camoAlbedo(cfg.camo, seed, 512));
    const fabN = cached('fabN', () => T.fabricNormal(77, 256, 52, 1));
    const fabR = cached('fabR', () => T.roughnessMap(91, 256, 0.70, 0.99));
    const nylN = cached('nylN', () => T.fabricNormal(31, 256, 96, 0.45));

    const uniform = new THREE.MeshStandardMaterial({
      map: mkTex(THREE, camoCv, 1, true),
      normalMap: mkTex(THREE, fabN, 3),
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughnessMap: mkTex(THREE, fabR, 2),
      roughness: 1, metalness: 0.0
    });
    /* Трипланарная проекция камуфляжа.

       Тело — одна поверхность, снятая с поля; UV-развёртки, которая
       одинаково хорошо ложилась бы и на грудь, и на подмышку, у неё нет:
       любая цилиндрическая размотка растягивает пятна на плечах и на
       внутренней стороне рук. Поэтому текстура проецируется тремя
       плоскостями по координатам ПОЗЫ ПОКОЯ (position, а не мировые):
       рисунок остаётся приклеенным к ткани при любой анимации, а масштаб
       пятна везде одинаковый. */
    triplanar(THREE, uniform, cfg.camoTile || 0.42);

    const skinCv = cached('face_' + BODY.geoSeed, () => faceAlbedo(BODY.geoSeed, cfg.skinTone, 1024, 512));
    const faceTex = mkTex(THREE, skinCv, 1, true);
    faceTex.wrapT = THREE.ClampToEdgeWrapping;
    /* строка 0 канвы — макушка (φ = 0), как и v = 0 сетки */
    faceTex.flipY = false;
    const skin = new THREE.MeshStandardMaterial({
      map: faceTex,
      normalMap: mkTex(THREE, cached('poreN', () => T.fabricNormal(404, 256, 140, 0.25)), 9),
      normalScale: new THREE.Vector2(0.18, 0.18),
      roughness: 0.58, metalness: 0.0
    });
    /* лёгкое подповерхностное рассеивание: кожа не должна быть «пластиком» */
    skin.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
         float sss = pow(clamp(1.0 - dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.2);
         reflectedLight.indirectDiffuse += sss * vec3(0.10, 0.028, 0.018) * diffuseColor.rgb;`
      );
    };

    const gCol = cfg.gloveCol || cfg.hardCol.map((c) => c * 0.8);
    const gloveCv = cached('glove_' + gCol.join('_'), () => T.nylonAlbedo(gCol, seed + 9, 256));
    const glove = new THREE.MeshStandardMaterial({
      map: mkTex(THREE, gloveCv, 2, true),
      normalMap: mkTex(THREE, nylN, 4),
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughness: 0.82, metalness: 0.0
    });

    const gearCv = cached('gear_' + cfg.camo + '_' + cfg.gearCol.join('_'), () =>
      T.nylonAlbedo(cfg.gearCol, seed + 13, 256));
    const gear = new THREE.MeshStandardMaterial({
      map: mkTex(THREE, gearCv, 2, true),
      normalMap: mkTex(THREE, nylN, 5),
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughness: 0.88, metalness: 0.0
    });

    const helmCv = cached('helm_' + cfg.camo + '_' + seed, () => T.helmetAlbedo(cfg.camo, seed, 256));
    const helmet = new THREE.MeshStandardMaterial({
      map: mkTex(THREE, helmCv, 1, true),
      normalMap: mkTex(THREE, fabN, 2),
      normalScale: new THREE.Vector2(0.3, 0.3),
      roughness: 0.72, metalness: 0.06
    });

    const boot = new THREE.MeshStandardMaterial({
      color: srgb(THREE, cfg.bootCol),
      normalMap: mkTex(THREE, nylN, 3),
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughness: 0.74, metalness: 0.0
    });

    const hard = new THREE.MeshStandardMaterial({
      color: srgb(THREE, cfg.hardCol),
      roughness: 0.52, metalness: 0.12
    });

    const scTex = mkTex(THREE, cached('sclera', scleraCanvas), 1, true);
    scTex.flipY = false;
    const eye = new THREE.MeshStandardMaterial({ map: scTex, roughness: 0.12, metalness: 0 });
    /* группа hair — теперь радужка: волосы и брови нарисованы в текстуре лица */
    const irTex = mkTex(THREE, cached('iris_' + seed, () => irisCanvas(seed, [92, 104, 96])), 1, true);
    irTex.flipY = false;
    const hair = new THREE.MeshStandardMaterial({ map: irTex, roughness: 0.08, metalness: 0 });

    /* Балаклава — трикотаж своего цвета. Двусторонняя: край прорези для
       глаз иначе просвечивал бы изнанкой. */
    const maskCv = cached('mask_' + cfg.maskCol.join('_'), () => T.nylonAlbedo(cfg.maskCol, seed + 21, 256));
    const mask = new THREE.MeshStandardMaterial({
      map: mkTex(THREE, maskCv, 3, true),
      normalMap: mkTex(THREE, fabN, 6),
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide
    });

    /* Резина и шнуры: подошва, кант шлема, шнурки, резинки подсумков. */
    const rubber = new THREE.MeshStandardMaterial({
      color: srgb(THREE, [22, 22, 21]),
      normalMap: mkTex(THREE, nylN, 6),
      normalScale: new THREE.Vector2(0.4, 0.4),
      roughness: 0.9, metalness: 0.0
    });

    const patchCv = cached('patch_' + cfg.faction + '_' + cfg.patchCol.join('_'),
      () => patchCanvas(cfg.faction, cfg.patchCol[0], cfg.patchCol[1]));
    const patchTex = mkTex(THREE, patchCv, 0, true);
    patchTex.wrapS = patchTex.wrapT = THREE.ClampToEdgeWrapping;
    const patch = new THREE.MeshStandardMaterial({ map: patchTex, roughness: 0.9, metalness: 0.0 });

    /* Панама шьётся из той же ткани, что и форма. */
    return {
      uniform, hat: uniform, skin, glove, gear, mask, helmet, boot, rubber, hard, eye, hair, patch,
      headGear: gear, headHard: hard, headRubber: rubber
    };
  }

  /* Нашивка подразделения: эмблема на тканой основе с обмёткой по краю.
     «Дельта» — пирамида из трёх граней, «Альфа» — шеврон «А». */
  function patchCanvas(faction, base, ink) {
    const S = 128;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const col = (a, k) => 'rgba(' + a[0] + ',' + a[1] + ',' + a[2] + ',' + (k === undefined ? 1 : k) + ')';
    g.fillStyle = col(base);
    g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 2) {
      g.fillStyle = y % 4 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
      g.fillRect(0, y, S, 1);
    }
    g.strokeStyle = col(ink, 0.55);
    g.lineWidth = 4;
    g.setLineDash([5, 3]);
    g.strokeRect(7, 7, S - 14, S - 14);
    g.setLineDash([]);
    g.fillStyle = col(ink);
    if (faction === 'delta') {
      const cx = 64, top = 24, bot = 100, hw = 44, mid = 80;
      g.beginPath(); g.moveTo(cx, top); g.lineTo(cx + hw, bot); g.lineTo(cx - hw, bot); g.closePath(); g.fill();
      /* грани пирамиды: правая светлее, левая темнее */
      g.fillStyle = col(base, 0.45);
      g.beginPath(); g.moveTo(cx, top); g.lineTo(cx, mid); g.lineTo(cx - hw, bot); g.closePath(); g.fill();
      g.strokeStyle = col(base);
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(cx, top + 4); g.lineTo(cx, mid); g.lineTo(cx + hw - 4, bot - 2);
      g.moveTo(cx, mid); g.lineTo(cx - hw + 4, bot - 2); g.stroke();
    } else {
      g.beginPath();
      g.moveTo(64, 20); g.lineTo(110, 104); g.lineTo(86, 104); g.lineTo(64, 62);
      g.lineTo(42, 104); g.lineTo(18, 104); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(64, 74); g.lineTo(76, 96); g.lineTo(52, 96); g.closePath(); g.fill();
    }
    return c;
  }

  /* ------------------------------------------------------------ сборка -- */
  /* Варианты формы для ботов: та же модель, что у генералов, с другими
     полями пресета. Разрешённые поля — VARIANT_KEYS; остальное игнорируется. */
  const VARIANT_KEYS = ['camo', 'head', 'mask', 'patchCol', 'gearCol', 'hardCol', 'maskCol', 'bootCol',
    'gloveCol', 'gloveHardCol', 'kneePads', 'padCol', 'seed', 'name', 'callsign'];
  const CAMOS = ['delta_green', 'delta_grey', 'alpha_black', 'alpha_cadpat', 'flora', 'woodland', 'olive', 'coyote', 'urban'];
  function variant(key, opts) {
    const base = PRESETS[key];
    if (!base) throw new Error('нет пресета бойца: ' + key);
    if (!opts) return base;
    const P = Object.assign({}, base);
    for (const k of VARIANT_KEYS) if (opts[k] !== undefined && opts[k] !== null) P[k] = opts[k];
    if (!CAMOS.includes(P.camo)) P.camo = base.camo;
    if (P.head !== 'helmet' && P.head !== 'boonie') P.head = base.head;
    P.mask = !!P.mask;
    return P;
  }
  /* Материалы одного варианта общие для всех его бойцов (боты): текстуры и
     шейдеры не плодятся. Материалы не зависят от головы и маски. */
  const matCache = new Map();
  const matKey = (P) => JSON.stringify([P.camo, P.seed, P.faction, P.gearCol, P.hardCol, P.maskCol, P.bootCol,
    P.gloveCol, P.gloveHardCol, P.patchCol, P.padCol]);
  const gearCache = new Map();

  function build(THREE, key, opts) {
    const P = variant(key, opts);

    const pack = packData();
    const M = pack ? SK.metricsFromJoints(pack.hdr.joints, P.height) : SK.metrics(P.height, P.build);
    const bones = SK.build(M);
    const BI = SK.indexOf(bones);
    const rest = SK.restWorld(bones);
    /* Размер тайла камуфляжа в метрах: 512-пиксельная текстура ложится
       на 0,42 м ткани, поэтому самое крупное пятно выходит ~11 см — как
       на реальной форме. */
    P.camoTile = 0.42;
    const geos = pack ? packGeometry(THREE, pack, P, BI) : soldierGeometry(THREE, P, M, BI, rest);
    /* кисти — перчатки GLB рига (viewmodel/hands.js); перчатка модели — запасная */
    const handAssets = typeof self !== 'undefined' && self.GAssets && self.GAssets.data.vm_hands;
    const glbHands = !!(pack && HANDS && handAssets);
    if (glbHands) delete geos.glove;
    /* наколенники и нашивки на рукавах (gear.js) */
    if (pack && GEAR) {
      const gk = P.kneePads ? 'pads' : 'nopads';
      if (!gearCache.has(gk)) gearCache.set(gk, GEAR.gearGeometry(THREE, pack.hdr.joints, BI, P));
      Object.assign(geos, gearCache.get(gk));
    }

    /* --- three-скелет --- */
    const tb = bones.map((b) => {
      const o = new THREE.Bone();
      o.name = b.name;
      o.position.set(b.pos[0], b.pos[1], b.pos[2]);
      return o;
    });
    for (let i = 0; i < bones.length; i++)
      if (bones[i].parent) tb[BI[bones[i].parent]].add(tb[i]);
    /* Матрицы костей обязаны быть актуальны ДО создания Skeleton: три.js
       считает обратные bind-матрицы из текущих matrixWorld. Без этого вызова
       они получаются единичными, и смещение позы покоя применяется дважды —
       меш «взрывается» и улетает вверх. */
    tb[0].updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(tb);

    const mk = (pack ? 'p|' : 'g|') + matKey(P);
    if (!matCache.has(mk)) matCache.set(mk, pack ? packMaterials(THREE, P, pack) : buildMaterials(THREE, P));
    const mats = matCache.get(mk);
    const root = new THREE.Group();
    root.name = 'soldier_' + key;
    root.add(tb[0]);

    const meshes = {};
    for (const g of (pack ? Object.keys(geos) : S.GROUPS)) {
      const geo = geos[g];
      if (!geo) continue;
      const mesh = new THREE.SkinnedMesh(geo, mats[g]);
      mesh.name = key + '_' + g;
      /* мелочь на лице и снаряжении тень не отбрасывает: экономия проходов */
      mesh.castShadow = !(mats[g] && mats[g].transparent) && !['brow', 'lash', 'cornea', 'eye', 'patch', 'headRubber'].includes(g);
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      if (mats[g] && mats[g].transparent) mesh.renderOrder = 2;
      mesh.bind(skeleton);
      root.add(mesh);
      meshes[g] = mesh;
    }
    enableDQS(THREE, skeleton, Object.values(meshes));

    const char = {
      key, preset: P, root, skeleton, bones: tb, boneIndex: BI, metrics: M,
      rest, meshes, materials: mats,
      bone: (n) => tb[BI[n]]
    };
    if (glbHands) char.hands = HANDS.attachHands(char, handAssets);
    return char;
  }

  /* ------------------------------------ dual quaternion skinning --- */
  /* Модель привязана к скелету в T-позе, и рука, опущенная к корпусу,
     поворачивается в плече на 60–70°. Линейное смешивание матриц на таком
     угле «сдувает» дельту и подмышку: плечо сужается, рукав проваливается
     в корпус — рука выглядит прилипшей к туловищу. Смешивание двойных
     кватернионов поворачивает вершину вокруг сустава и сохраняет объём.

     Кватернионы лежат в той же текстуре костей, после матриц: её three.js
     загружает при каждой отрисовке скиннированного меша. Матрицы остаются
     на месте — тени и AO (служебные материалы) считаются по ним. */
  function enableDQS(THREE, skeleton, meshes) {
    const nb = skeleton.bones.length;
    let size = 4;
    while (size * size < nb * 6) size += 4;
    const arr = new Float32Array(size * size * 4);
    arr.set(skeleton.boneMatrices);
    skeleton.boneMatrices = arr;
    skeleton.boneTexture = new THREE.DataTexture(arr, size, size, THREE.RGBAFormat, THREE.FloatType);
    skeleton.boneTexture.needsUpdate = true;
    const base = nb * 16, m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    const update = skeleton.update.bind(skeleton);
    skeleton.update = function () {
      update();
      const bm = this.boneMatrices;
      for (let i = 0; i < nb; i++) {
        q.setFromRotationMatrix(m4.fromArray(bm, i * 16));
        const tx = bm[i * 16 + 12], ty = bm[i * 16 + 13], tz = bm[i * 16 + 14], o = base + i * 8;
        bm[o] = q.x; bm[o + 1] = q.y; bm[o + 2] = q.z; bm[o + 3] = q.w;
        /* дуальная часть: 0,5 · t ⊗ q */
        bm[o + 4] = 0.5 * (tx * q.w + ty * q.z - tz * q.y);
        bm[o + 5] = 0.5 * (-tx * q.z + ty * q.w + tz * q.x);
        bm[o + 6] = 0.5 * (tx * q.y - ty * q.x + tz * q.w);
        bm[o + 7] = -0.5 * (tx * q.x + ty * q.y + tz * q.z);
      }
    };
    const DQ0 = nb * 4;
    const pars = `
#ifdef USE_SKINNING
vec4 dqFetch(const in float i, const in int k) {
  int size = textureSize(boneTexture, 0).x;
  int j = ${DQ0} + int(i) * 2 + k;
  return texelFetch(boneTexture, ivec2(j % size, j / size), 0);
}
#endif`;
    const blend = `
#ifdef USE_SKINNING
vec4 dqR0 = dqFetch(skinIndex.x, 0), dqD0 = dqFetch(skinIndex.x, 1);
vec4 dqR1 = dqFetch(skinIndex.y, 0), dqD1 = dqFetch(skinIndex.y, 1);
vec4 dqR2 = dqFetch(skinIndex.z, 0), dqD2 = dqFetch(skinIndex.z, 1);
vec4 dqR3 = dqFetch(skinIndex.w, 0), dqD3 = dqFetch(skinIndex.w, 1);
vec4 dqW = skinWeight * vec4(1.0, sign(dot(dqR0, dqR1) + 1e-6), sign(dot(dqR0, dqR2) + 1e-6), sign(dot(dqR0, dqR3) + 1e-6));
vec4 dqR = dqW.x * dqR0 + dqW.y * dqR1 + dqW.z * dqR2 + dqW.w * dqR3;
vec4 dqD = dqW.x * dqD0 + dqW.y * dqD1 + dqW.z * dqD2 + dqW.w * dqD3;
float dqL = length(dqR);
dqR /= dqL; dqD /= dqL;
#endif`;
    const nrm = `
#ifdef USE_SKINNING
vec3 dqN = (bindMatrix * vec4(objectNormal, 0.0)).xyz;
dqN += 2.0 * cross(dqR.xyz, cross(dqR.xyz, dqN) + dqR.w * dqN);
objectNormal = (bindMatrixInverse * vec4(dqN, 0.0)).xyz;
#ifdef USE_TANGENT
vec3 dqT = (bindMatrix * vec4(objectTangent, 0.0)).xyz;
dqT += 2.0 * cross(dqR.xyz, cross(dqR.xyz, dqT) + dqR.w * dqT);
objectTangent = (bindMatrixInverse * vec4(dqT, 0.0)).xyz;
#endif
#endif`;
    const pos = `
#ifdef USE_SKINNING
vec3 dqP = (bindMatrix * vec4(transformed, 1.0)).xyz;
dqP += 2.0 * cross(dqR.xyz, cross(dqR.xyz, dqP) + dqR.w * dqP);
dqP += 2.0 * (dqR.w * dqD.xyz - dqD.w * dqR.xyz + cross(dqR.xyz, dqD.xyz));
transformed = (bindMatrixInverse * vec4(dqP, 1.0)).xyz;
#endif`;
    for (const mesh of meshes) {
      const mat = mesh.material;
      if (!mat || mat.userData.dqs) continue;
      mat.userData.dqs = true;
      const prev = mat.onBeforeCompile, key0 = mat.customProgramCacheKey();
      mat.onBeforeCompile = function (sh, r) {
        if (prev) prev.call(this, sh, r);
        sh.vertexShader = sh.vertexShader
          .replace('#include <skinning_pars_vertex>', '#include <skinning_pars_vertex>' + pars)
          .replace('#include <skinbase_vertex>', blend)
          .replace('#include <skinnormal_vertex>', nrm)
          .replace('#include <skinning_vertex>', pos);
      };
      mat.customProgramCacheKey = () => key0 + '|dqs' + DQ0;
      mat.needsUpdate = true;
    }
  }

  /* Геометрия бойца одна на всех: строится один раз на тип головного
     убора, дальше каждый боец получает свои SkinnedMesh поверх общих
     буферов (скелеты разные, геометрия общая). */
  const geoCache = new Map();
  function soldierGeometry(THREE, P, M, BI, rest) {
    const key = P.head + '|' + (P.mask ? 1 : 0) + '|' + M.H;
    if (geoCache.has(key)) return geoCache.get(key);
    const G = S.newGroups();
    S.buildSoldier(G, M, BI, rest, { seed: BODY.geoSeed, head: P.head, mask: P.mask });
    const out = {};
    for (const g of S.GROUPS) {
      const buf = G[g];
      if (!buf.index.length) continue;
      buf.weld(2e-4);
      buf.recomputeNormals();
      buf.normalizeWeights();
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(buf.nrm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(buf.skinIndex, 4));
      geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(buf.skinWeight, 4));
      geo.setIndex(buf.index);
      geo.computeBoundingSphere();
      out[g] = geo;
    }
    geoCache.set(key, out);
    return out;
  }

  /* ----------------------------------------- геометрия из пакета ------ */
  /* Буферы общие для всех бойцов; какие меши надеть, решает пресет:
     поле when меша — условия на поля пресета (head, mask). */
  const packGeoCache = new Map();
  const sstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

  /* Веса костей скручивания. У модели плечо и предплечье — по одной
     кости, и вся пронация кисти ложилась на узкую зону у запястья:
     рукав перекручивался «фантиком». Часть веса предплечья плавно
     переходит на foreTwist (0 у локтя -> 1 у запястья), часть веса плеча
     у дельты — на armTwist, который гасит скрутку плеча. */
  function splitTwist(si, sw, pos, n, BI, J) {
    const sides = ['R', 'L'].map((S) => ({
      sh: BI['shoulder' + S], el: BI['elbow' + S], at: BI['armTwist' + S], ft: BI['foreTwist' + S],
      xS: Math.abs(J['shoulder' + S][0]), xE: Math.abs(J['elbow' + S][0]), xW: Math.abs(J['wrist' + S][0])
    }));
    if (sides.some((d) => d.at === undefined || d.ft === undefined)) return false;
    const inf = new Map();
    let any = false;
    for (let v = 0; v < n; v++) {
      const x = pos[v * 3], d = sides[x >= 0 ? 0 : 1], ax = Math.abs(x);
      inf.clear();
      for (let k = 0; k < 4; k++) {
        const w = sw[v * 4 + k];
        if (w > 0) inf.set(si[v * 4 + k], (inf.get(si[v * 4 + k]) || 0) + w);
      }
      const wS = inf.get(d.sh) || 0, wE = inf.get(d.el) || 0;
      let touched = false;
      if (wS > 0) {
        const share = 1 - sstep(0, 0.9, (ax - d.xS) / (d.xE - d.xS));
        if (share > 0) { inf.set(d.sh, wS * (1 - share)); inf.set(d.at, (inf.get(d.at) || 0) + wS * share); touched = true; }
      }
      if (wE > 0) {
        const share = sstep(0.05, 0.95, (ax - d.xE) / (d.xW - d.xE));
        if (share > 0) { inf.set(d.el, wE * (1 - share)); inf.set(d.ft, (inf.get(d.ft) || 0) + wE * share); touched = true; }
      }
      if (!touched) continue;
      any = true;
      const top = [...inf.entries()].filter((e) => e[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
      const tot = top.reduce((a, e) => a + e[1], 0) || 1;
      for (let k = 0; k < 4; k++) {
        si[v * 4 + k] = top[k] ? top[k][0] : 0;
        sw[v * 4 + k] = top[k] ? top[k][1] / tot : 0;
      }
    }
    return any;
  }

  /* Рукава кителя объёмнее: у модели они сидели почти по руке (радиус
     предплечья ~4 см), а куртка на референсе заметно шире. Раздувается
     только рукав — от подмышки до манжеты; корпус под жилетом не трогаем,
     у манжеты прибавка меньше, чтобы рукав оставался поверх перчатки. */
  function puffSleeves(pos, nrm, n) {
    for (let v = 0; v < n; v++) {
      const ax = Math.abs(pos[v * 3]);
      if (ax < 0.23) continue;
      const d = sstep(0.23, 0.31, ax) * (0.013 - 0.0025 * sstep(0.40, 0.55, ax)) * (1 - 0.5 * sstep(0.66, 0.77, ax)) / 32767;
      pos[v * 3] += nrm[v * 3] * d;
      pos[v * 3 + 1] += nrm[v * 3 + 1] * d;
      pos[v * 3 + 2] += nrm[v * 3 + 2] * d;
    }
  }

  /* Край рукава живёт с предплечьем: вес костей кисти и пальцев у кителя
     переходит на foreTwist, иначе манжета поворачивалась бы вместе с кистью. */
  function sleeveToForearm(si, sw, n, BI) {
    const HAND = /^(wrist|palm|thumb|index|middle|ring|pinky)([RL])/;
    const to = {};
    for (const name in BI) {
      const m = name.match(HAND);
      if (m) to[BI[name]] = BI['foreTwist' + m[2]] !== undefined ? BI['foreTwist' + m[2]] : BI['elbow' + m[2]];
    }
    for (let i = 0; i < n * 4; i++) if (sw[i] > 0 && to[si[i]] !== undefined) si[i] = to[si[i]];
  }

  function packGeometry(THREE, pack, P, BI) {
    const hdr = pack.hdr, bin = pack.bin;
    const remap = hdr.bones.map((n) => (BI[n] === undefined ? BI.hips : BI[n]));
    const out = {};
    for (const m of hdr.meshes) {
      if (m.when && Object.keys(m.when).some((k) => P[k] !== m.when[k])) continue;
      let geo = packGeoCache.get(m.name);
      if (!geo) {
        const n = m.count;
        geo = new THREE.BufferGeometry();
        const pos = new Float32Array(bin, m.pos[0], m.pos[1]).slice();
        const nrm = new Int16Array(bin, m.nrm[0], m.nrm[1]);
        /* телосложение (body.js), затем крой одежды (clothing.js) */
        const grp = m.group || m.name;
        if (BODYMOD) BODYMOD.shape(grp, pos, nrm, n, hdr.joints);
        if (CLOTH) CLOTH.fit(grp, pos, nrm, n, hdr.joints);
        else if (grp === 'shirt') puffSleeves(pos, nrm, n);
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3, true));
        geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(bin, m.uv[0], m.uv[1]), 2));
        const si = new Uint8Array(bin, m.si[0], m.si[1]), si16 = new Uint16Array(n * 4);
        for (let i = 0; i < si.length; i++) si16[i] = remap[si[i]];
        const sw8 = new Uint8Array(bin, m.sw[0], m.sw[1]), sw = new Float32Array(n * 4);
        for (let i = 0; i < sw.length; i++) sw[i] = sw8[i] / 255;
        splitTwist(si16, sw, pos, n, BI, hdr.joints);
        if (grp === 'shirt') sleeveToForearm(si16, sw, n, BI);
        geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si16, 4));
        geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
        geo.setIndex(new THREE.BufferAttribute(m.index32 ? new Uint32Array(bin, m.index[0], m.index[1])
          : new Uint16Array(bin, m.index[0], m.index[1]), 1));
        geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 1.2);
        packGeoCache.set(m.name, geo);
      }
      out[m.group || m.name] = geo;
    }
    return out;
  }

  /* ----------------------------------------- материалы пакета --------- */
  const packTexCache = new Map();
  function packTex(THREE, pack, file, color) {
    const k = file + (color ? '|c' : '');
    if (packTexCache.has(k)) return packTexCache.get(k);
    const img = pack.img[file];
    const t = new THREE.Texture(img);
    t.flipY = false;                       // ImageBitmap уже перевёрнут при декодировании
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    if (color && 'colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    /* средний цвет (линейный) — для перекраски и нормировки деталей */
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, 16, 16);
    const d = g.getImageData(0, 0, 16, 16).data;
    const lin = (v) => Math.pow(v / 255, 2.2);
    const avg = [0, 0, 0]; let wsum = 0;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3] / 255; wsum += a;
      for (let j = 0; j < 3; j++) avg[j] += lin(d[i + j]) * a;
    }
    t.userData.mean = avg.map((v) => v / Math.max(wsum, 1e-3));
    packTexCache.set(k, t);
    return t;
  }

  /* Ткань формы: камуфляж проецируется трипланарно по позе покоя (пятна
     одного масштаба на всём теле, без швов), а фактура самой вещи —
     швы, карманы, складки, запечённые в её текстуре, — умножается сверху
     как яркость. Так один и тот же крой становится любой из четырёх форм. */
  function garmentMat(THREE, camoTex, opt) {
    const mat = new THREE.MeshStandardMaterial({
      map: opt.detail || null, normalMap: opt.normal || null,
      normalScale: new THREE.Vector2(opt.nScale || 1, opt.nScale || 1),
      roughness: opt.rough === undefined ? 0.93 : opt.rough, metalness: 0,
      side: opt.side || THREE.FrontSide
    });
    const mean = opt.mean || (opt.detail ? opt.detail.userData.mean : [1, 1, 1]);
    const lm = 0.2126 * mean[0] + 0.7152 * mean[1] + 0.0722 * mean[2];
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uCamo = { value: camoTex };
      sh.uniforms.uTile = { value: 1 / (opt.tile || 0.42) };
      sh.uniforms.uDetail = { value: opt.detailK === undefined ? 1 : opt.detailK };
      sh.uniforms.uDetailMean = { value: Math.max(lm, 1e-3) };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          varying vec3 vRestPos;
          varying vec3 vRestNrm;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vRestPos = position;
          vRestNrm = normal;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D uCamo;
          uniform float uTile, uDetail, uDetailMean;
          varying vec3 vRestPos;
          varying vec3 vRestNrm;`)
        .replace('#include <map_fragment>', `
          vec3 tpN = abs(normalize(vRestNrm));
          tpN = pow(tpN, vec3(4.0));
          tpN /= max(tpN.x + tpN.y + tpN.z, 1e-4);
          vec3 tpP = vRestPos * uTile;
          vec4 camo = texture2D(uCamo, tpP.zy) * tpN.x + texture2D(uCamo, tpP.xz) * tpN.y + texture2D(uCamo, tpP.xy) * tpN.z;
          #ifdef USE_MAP
            vec3 det = texture2D(map, vMapUv).rgb;
            float dl = dot(det, vec3(0.2126, 0.7152, 0.0722)) / uDetailMean;
            camo.rgb *= mix(1.0, clamp(dl, 0.15, 1.8), uDetail);
          #endif
          diffuseColor *= camo;`);
    };
    mat.customProgramCacheKey = () => 'garment' + (opt.detail ? 1 : 0) + (opt.normal ? 1 : 0);
    return mat;
  }

  /* Снаряжение с собственной текстурой: цвет переносится на целевой
     поканально — оттенки, пряжки и потёртости исходника сохраняются. */
  function tintedMat(THREE, pack, tex, target, extra) {
    const map = packTex(THREE, pack, tex.map, true);
    const m = tex.mean || map.userData.mean, lin = (v) => Math.pow(v / 255, 2.2);
    const gain = target ? target.map((v, i) => lin(v) / Math.max(m[i], 1e-3)) : [1, 1, 1];
    const c = new THREE.Color(gain[0], gain[1], gain[2]);
    const mat = new THREE.MeshStandardMaterial(Object.assign({
      map, color: c,
      normalMap: tex.normalMap ? packTex(THREE, pack, tex.normalMap) : null,
      roughnessMap: tex.roughnessMap ? packTex(THREE, pack, tex.roughnessMap) : null,
      roughness: 1, metalness: 0
    }, extra || {}));
    return mat;
  }

  function packMaterials(THREE, P, pack) {
    const texOf = {};
    for (const m of pack.hdr.meshes) texOf[m.group || m.name] = m.tex || {};
    const tx = (g, k, color) => (texOf[g] && texOf[g][k] ? packTex(THREE, pack, texOf[g][k], color) : null);
    const camoCv = cached('camo_' + P.camo + '_' + P.seed, () => (CLOTH ? CLOTH.camo : T.camoAlbedo)(P.camo, P.seed, 512));
    const camo = mkTex(THREE, camoCv, 1, true);
    const out = {};
    /* ткань формы — clothing.js (складки, пыль, отлив); старый материал — запасной */
    const J = pack.hdr.joints;
    const garment = CLOTH ? (tex, o) => CLOTH.garmentMat(THREE, tex, Object.assign({ joints: J }, o)) : (tex, o) => garmentMat(THREE, tex, o);

    const skin = new THREE.MeshStandardMaterial({
      map: tx('skin', 'map', true), normalMap: tx('skin', 'normalMap'),
      normalScale: new THREE.Vector2(0.22, 0.22),
      roughnessMap: tx('skin', 'roughnessMap'), roughness: 1, metalness: 0,
      envMapIntensity: 0.7
    });
    /* подповерхностное рассеивание: тёплый ореол по краю и мягкий
       терминатор — кожа не должна выглядеть пластиком */
    skin.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        float sssRim = pow(clamp(1.0 - dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.4);
        reflectedLight.indirectDiffuse += sssRim * vec3(0.07, 0.022, 0.012) * diffuseColor.rgb;
        reflectedLight.directDiffuse *= vec3(1.0, 0.96, 0.94);`);
    };
    out.skin = skin;
    out.eye = new THREE.MeshPhysicalMaterial({
      map: tx('eye', 'map', true), roughness: 0.35, metalness: 0,
      clearcoat: 1, clearcoatRoughness: 0.04
    });
    /* роговица: прозрачная линза с влажным бликом поверх радужки */
    out.cornea = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, transparent: true, opacity: 0.12, roughness: 0.02, metalness: 0,
      clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false, specularIntensity: 1
    });
    for (const g of ['brow', 'lash']) {
      out[g] = new THREE.MeshStandardMaterial({
        map: tx(g, 'map', true), color: new THREE.Color(g === 'brow' ? 0.55 : 0.4, g === 'brow' ? 0.45 : 0.33, g === 'brow' ? 0.38 : 0.3),
        transparent: true, depthWrite: false, alphaTest: 0.02, roughness: 0.8, metalness: 0, side: THREE.DoubleSide
      });
    }
    out.shirt = garment(camo, { mean: texOf.shirt.mean, detail: tx('shirt', 'map', true), detailK: 0.85, tile: P.camoTile });
    out.pants = garment(camo, { mean: texOf.pants.mean, detail: tx('pants', 'map', true), normal: tx('pants', 'normalMap'), detailK: 0.9, tile: P.camoTile });
    out.vest = tintedMat(THREE, pack, texOf.vest, P.gearCol);
    out.boot = tintedMat(THREE, pack, texOf.boot, P.bootCol);
    out.glove = tintedMat(THREE, pack, texOf.glove, P.gloveCol, { roughness: 0.8 });
    /* камуфляж — рукавам рига от первого лица (game/bodycam.js) */
    out._camo = camo;

    /* Головные уборы и балаклава: развёртка у них в метрах, поэтому
       тканевые карты нормалей ложатся с реальным шагом нити. */
    const DS = THREE.DoubleSide;
    const fabN = cached('fabN', () => T.fabricNormal(77, 256, 52, 1));
    const nylN = cached('nylN', () => T.fabricNormal(31, 256, 96, 0.45));
    const nrmTex = (cv, rep) => { const t = mkTex(THREE, cv, 1); t.repeat.set(rep, rep); return t; };
    out.helmet = garment(camo, { tile: P.camoTile * 0.8, side: DS, normal: nrmTex(fabN, 1 / 0.05), nScale: 0.6, rough: 0.9, folds: 0, dirt: 0, sheen: 0.3 });
    out.hat = garment(camo, { tile: P.camoTile, side: DS, normal: nrmTex(fabN, 1 / 0.045), nScale: 0.8, rough: 0.95, folds: 0, dirt: 0, sheen: 0.4 });
    out.headHard = new THREE.MeshStandardMaterial({ color: srgb(THREE, P.hardCol), roughness: 0.55, metalness: 0.05, side: DS });
    out.headGear = new THREE.MeshStandardMaterial({ color: srgb(THREE, P.gearCol), roughness: 1, metalness: 0, side: DS,
      normalMap: nrmTex(nylN, 1 / 0.03), normalScale: new THREE.Vector2(0.8, 0.8) });
    out.headRubber = new THREE.MeshStandardMaterial({ color: srgb(THREE, [26, 26, 25]), roughness: 0.85, metalness: 0, side: DS });
    const maskCv = cached('mask_' + P.maskCol.join('_'), () => T.nylonAlbedo(P.maskCol, P.seed + 21, 256));
    const maskMap = mkTex(THREE, maskCv, 1, true); maskMap.repeat.set(14, 14);
    const patchCv = cached('patch_' + P.faction + '_' + P.patchCol.join('_'), () => patchCanvas(P.faction, P.patchCol[0], P.patchCol[1]));
    const patchTex = mkTex(THREE, patchCv, 0, true);
    patchTex.wrapS = patchTex.wrapT = THREE.ClampToEdgeWrapping;
    out.patch = new THREE.MeshStandardMaterial({ map: patchTex, roughness: 0.92, metalness: 0, side: DS });
    out.mask = new THREE.MeshStandardMaterial({ map: maskMap, normalMap: nrmTex(fabN, 30), normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: 0.97, metalness: 0, side: DS });
    if (GEAR) Object.assign(out, GEAR.gearMaterials(THREE, P, srgb, out));
    return out;
  }

  return { PRESETS, ORDER, CAMOS, VARIANT_KEYS, build, variant, buildMaterials };
});
/* ---- soldier/rig.js ---- */
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
    ads: { R: [0.30, -0.90, 0.30], L: [-0.06, -0.99, -0.10], clav: [0.30, 0.10], reach: 0.86 },
    /* руки опущены вдоль тела: локоть смотрит назад и чуть наружу */
    relaxed: { R: [0.18, -0.10, 1.0], L: [0.18, -0.10, 1.0], clav: [0, 0], reach: 1 }
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

  /* Кисти GLB (viewmodel/hands.js): запястье ставится в кисть рига, локоть
     выбирается так, чтобы предплечье шло вдоль кисти — тогда кисть не
     выламывается в запястье. handTargets — мировые матрицы кистей рига,
     handPoses — позы пальцев рига. */
  Rig.prototype.solveArmsGLB = function () {
    const THREE = this.THREE, HANDS = typeof self !== 'undefined' ? self.GHands : null;
    const rest = this.char.rest;
    const chestQ = this.bone('chest').getWorldQuaternion(new THREE.Quaternion());
    const chestQi = chestQ.clone().invert();
    const kr = this.readyAmount === undefined ? 1 : U.clamp01(this.readyAmount);
    const ka = U.clamp01(this.adsAmount || 0);
    /* armPose — явная поза локтей (например, ARM.relaxed для рук по швам) */
    const pose = this.armPose || mixArm(mixArm(ARM.sling, ARM.ready, kr), ARM.ads, ka);
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
      const want = HANDS.wristQuat(Q, SS, new THREE.Quaternion());
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
/* ---- anim/locomotion.js ---- */
/* ============================================================================
   Походка и стойка бойца.

   Углы суставов ног — ключевые кривые по фазе цикла (0 — касание стопы),
   снятые с биомеханики ходьбы и бега: сгиб бедра, колена, голеностопа и
   пальцев стопы. Шаг и бег смешиваются по скорости; на бегу есть фаза
   полёта, высокий вынос колена и захлёст голени, на шаге — перекат с пятки
   на носок. Таз вращается и наклоняется в такт, грудь отвечает встречным
   поворотом, голова стабилизирована.

   Каденс реальный: шаг ~2,4 шага/с, бег ~2,8 шага/с. Раньше цикл на бегу
   доходил до 5,5 шага/с — ноги семенили.

   Вариации: у каждого бойца своя стойка (ширина, перенос веса, сгиб колен)
   и своя «жизнь» в строю — переминание, повороты головы.
   ========================================================================== */
(function (root, factory) {
  const L = factory(root.GUtil || (typeof require !== 'undefined' ? require('../core/util.js') : null));
  if (typeof module !== 'undefined' && module.exports) module.exports = L;
  else root.GLoco = L;
})(typeof self !== 'undefined' ? self : this, function (U) {
  'use strict';

  const D = Math.PI / 180;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const sstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

  /* Периодический сплайн Катмулла—Рома по ключам [[фаза, значение], ...]. */
  function curve(keys) {
    const n = keys.length;
    return (ph) => {
      const p = ((ph % 1) + 1) % 1;
      let i = n - 1;
      for (let k = 0; k < n; k++) if (keys[k][0] <= p) i = k;
      const k0 = keys[(i - 1 + n) % n], k1 = keys[i], k2 = keys[(i + 1) % n], k3 = keys[(i + 2) % n];
      const t0 = k1[0], t1 = k2[0] > t0 ? k2[0] : k2[0] + 1;
      const pp = p >= t0 ? p : p + 1;
      const t = (pp - t0) / (t1 - t0);
      const v0 = k0[1], v1 = k1[1], v2 = k2[1], v3 = k3[1];
      const t2 = t * t, t3 = t2 * t;
      return 0.5 * ((2 * v1) + (-v0 + v2) * t + (2 * v0 - 5 * v1 + 4 * v2 - v3) * t2 + (-v0 + 3 * v1 - 3 * v2 + v3) * t3);
    };
  }

  /* Градусы. Бедро: + — мах вперёд. Колено: + — сгиб. Голеностоп: + — тыльное
     сгибание (носок вверх). Пальцы стопы: + — разгибание при перекате. */
  const WALK = {
    hip: curve([[0, 24], [0.10, 20], [0.30, 6], [0.50, -10], [0.62, -5], [0.75, 14], [0.88, 26]]),
    knee: curve([[0, 4], [0.12, 16], [0.30, 6], [0.45, 8], [0.60, 36], [0.72, 60], [0.85, 30], [0.95, 6]]),
    ankle: curve([[0, 0], [0.07, -6], [0.25, 4], [0.45, 10], [0.60, -14], [0.70, -4], [0.85, 2]]),
    toe: curve([[0, 0], [0.42, 2], [0.55, 22], [0.62, 16], [0.72, 0], [0.9, 0]]),
    stance: 0.60
  };
  const RUN = {
    hip: curve([[0, 30], [0.14, 14], [0.32, -16], [0.44, -8], [0.62, 30], [0.80, 44], [0.92, 36]]),
    knee: curve([[0, 20], [0.12, 42], [0.32, 18], [0.45, 72], [0.60, 108], [0.75, 82], [0.88, 36], [0.96, 22]]),
    ankle: curve([[0, 4], [0.12, 16], [0.30, -24], [0.42, -12], [0.65, 6], [0.85, 6]]),
    toe: curve([[0, 0], [0.20, 6], [0.30, 26], [0.38, 4], [0.50, 0], [0.85, 0]]),
    stance: 0.34
  };

  /* Частота цикла (циклов/с = пол-шага на ногу) по скорости и спринту. */
  function cadence(speed, sprint) {
    return U.lerp(0.95, 1.22, clamp((speed - 0.6) / 2.0, 0, 1)) + 0.18 * sprint;
  }

  /* Ноги и таз на фазе цикла. c — контроллер (stepPhase, speed, sprint,
     crouch), M — метрики скелета. Возвращает углы (рад) по ногам и
     добавки к тазу/груди. */
  function gait(c, M, stance) {
    const st = stance || {};
    const walkSpd = 2.55, runSpd = 4.55;
    const gaitK = clamp(c.speed / 1.1, 0, 1);                 // на месте ноги стоят
    const runK = sstep(walkSpd * 0.92, runSpd * 0.92, c.speed) * (1 - c.crouch * 0.7);
    /* амплитуда маха под длину шага: быстрее — шире, но в пределах сустава */
    const freq = cadence(c.speed, c.sprint);
    const stepLen = c.speed / Math.max(freq, 0.5);
    const ampK = clamp(stepLen / U.lerp(1.6, 2.8, runK), 0.55, 1.2);   // длина цикла ключевых кривых
    const legs = {};
    for (const side of [1, -1]) {
      const SS = side > 0 ? 'R' : 'L';
      const ph = c.stepPhase + (side > 0 ? 0 : 0.5);
      const mix = (f) => U.lerp(WALK[f](ph), RUN[f](ph), runK) * D;
      const hip = mix('hip') * ampK;
      const knee = mix('knee');
      const ankle = mix('ankle');
      const toe = mix('toe');
      const stanceF = U.lerp(WALK.stance, RUN.stance, runK);
      const p = ((ph % 1) + 1) % 1;
      /* опорность: 1 в опоре, 0 в переносе, мягкие края */
      const plant = sstep(0, 0.04, p) * (1 - sstep(stanceF - 0.04, stanceF + 0.02, p)) + (p > 0.97 ? 1 : 0);
      legs[SS] = {
        hip: hip * gaitK, knee: knee * gaitK, ankle: ankle * gaitK, toe: toe * gaitK,
        plant: 1 - gaitK * (1 - clamp(plant, 0, 1))
      };
    }
    /* таз: вращение к ноге в переносе, наклон вниз на её сторону,
       вертикаль — две волны на цикл (на бегу низ в середине опоры) */
    const ph2 = c.stepPhase * Math.PI * 2;
    const pelvisYaw = Math.sin(ph2) * U.lerp(4, 7, runK) * D * gaitK;
    const pelvisRoll = Math.sin(ph2 * 2 - 0.4) * U.lerp(2.5, 3.5, runK) * D * gaitK;
    const bob = (U.lerp(Math.cos(ph2 * 2) * 0.018, -Math.cos(ph2 * 2 - 0.9) * 0.032, runK)) * gaitK;
    const sway = Math.sin(ph2) * U.lerp(0.018, 0.010, runK) * gaitK;
    return {
      legs, freq, runK, gaitK, pelvisYaw, pelvisRoll, bob, sway,
      /* встречный поворот груди и наклон корпуса вперёд на бегу */
      chestYaw: -pelvisYaw * U.lerp(1.1, 1.5, runK),
      lean: U.lerp(0.05, 0.20, runK) * gaitK + (st.lean || 0),
      headComp: -pelvisYaw * 0.4
    };
  }

  /* ------------------------------------------------------ вариации --- */
  /* Стойка бойца в строю по зерну: у каждого своя ширина ног, перенос
     веса, сгиб колен и манера держать голову. */
  function stanceFor(seed) {
    const r = (k) => { const x = Math.sin(seed * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
    return {
      width: U.lerp(0.035, 0.075, r(1)),        // разведение бёдер, рад
      weight: U.lerp(-1, 1, r(2)),              // перенос веса: -1 левая, +1 правая
      bend: U.lerp(0.10, 0.20, r(3)),           // тонус колен
      toeOut: U.lerp(0.04, 0.12, r(4)),
      headTilt: U.lerp(-0.05, 0.05, r(5)),
      lean: U.lerp(0.0, 0.05, r(6)),
      /* наклон оружия на ремне: ствол ниже/выше, разворот, высота */
      carryPitch: U.lerp(-0.08, 0.10, r(7)),
      carryYaw: U.lerp(-0.10, 0.10, r(8)),
      carryDrop: U.lerp(-0.02, 0.025, r(9)),
      period: U.lerp(7, 13, r(10))
    };
  }

  /* Медленная «жизнь» в строю: вес переходит с ноги на ногу, голова
     оглядывается. t — время, seed — зерно бойца. */
  function idleLife(t, seed, st) {
    const n = (f, k) => Math.sin(t * f + seed * k) * 0.6 + Math.sin(t * f * 0.37 + seed * k * 1.7) * 0.4;
    const shift = clamp(st.weight * 0.6 + n(2 * Math.PI / st.period, 1.3) * 0.7, -1, 1);
    return {
      shift,                                     // -1..1 — на какой ноге вес
      look: n(0.23, 2.1) * 0.35 + n(0.071, 5.3) * 0.25,
      nod: n(0.19, 3.7) * 0.06,
      breathe: n(0.9, 0.3)
    };
  }

  return { curve, WALK, RUN, cadence, gait, stanceFor, idleLife };
});

/* ---- anim/pose.js ---- */
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

/* ---- weapon/hold.js ---- */
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
