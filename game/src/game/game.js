/* ============================================================================
   Лобби SIGNUM: полигон, четыре генерала, свободная камера, выбор генерала,
   вид от его глаз и стрельба по мишеням. Меню — game/lobby.js.

   Порядок кадра:
     1) ввод -> контроллер (генерал) или свободная камера;
     2) поза бойца (корпус, ноги, голова);
     3) оружие и руки: GHold (вид со стороны) или бодикам (от первого лица);
     4) камера, смещение кадра под правую панель меню;
     5) подписи генералов, эффекты и рендер.

   Оружие генерала — из профиля (lib/profile.js): loadouts[general] ->
   основное (или пистолет) собирается game/lib/weapons с модулями. Без
   снаряжения генерал стоит без оружия, руки по швам.
   ========================================================================== */
(function (root, factory) {
  const G = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = G;
  else root.GGame = G;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  const U = root.GUtil, TEX = root.GTex, CHAR = root.GChar, RIG = root.GRig,
    WORLD = root.GWorld, FX = root.GFX, AUDIO = root.GAudio, PLAYER = root.GPlayer;

  /* Расстановка бойцов: «Дельта» слева, «Альфа» справа, все в ряд лицом к
     игроку, между шеренгами — проход, где начинается свободная камера. */
  /* Шеренга разбита на два фланга: «Дельта» слева, «Альфа» справа, между
     ними проход, где стартует свободная камера. Бойцы развёрнуты лицом к
     игроку (yaw = PI, потому что модель смотрит в -Z). */
  const SPAWN = [
    { key: 'delta_1', x: -4.20, z: 1.2, yaw: Math.PI - 0.06 },
    { key: 'delta_2', x: -1.75, z: 1.2, yaw: Math.PI - 0.02 },
    { key: 'alpha_1', x: 1.75, z: 1.2, yaw: Math.PI + 0.02 },
    { key: 'alpha_2', x: 4.20, z: 1.2, yaw: Math.PI + 0.06 }
  ];

  const HOLD_TIME = 0.62;         // сколько держать F
  const USE_RANGE = 2.9;          // дистанция взаимодействия, м

  /* Окружение и постобработка грузятся до старта игры через GAssets:
     HDRI (RGBE) + фон 4k и аддоны three динамическим import(). Любая
     неудача даёт null, и main() откатывается к процедурной заливке и
     прямому renderer.render. */
  const GA = root.GAssets || null;
  const ENV_BG_SCALE = 8;                        // фон хранит linear/8 в sRGB
  const ENV_MIST = [2.889, 2.962, 3.332];        // цвет дымки на фото (linear), build_env_assets.py
  if (GA) {
    GA.add('env_hdr', import('three/addons/loaders/RGBELoader.js').then((m) =>
      GA.fetchAny('assets/env/misty_pines_1k.hdr').then((buf) => new m.RGBELoader().parse(buf))));
    if (typeof createImageBitmap === 'function') {
      GA.add('env_bg', GA.fetchAny('assets/env/misty_pines_bg.jpg', 'blob').then((b) =>
        createImageBitmap(b, { imageOrientation: 'flipY', colorSpaceConversion: 'none' })));
    }
    const mods = ['EffectComposer', 'RenderPass', 'OutputPass', 'ShaderPass', 'GTAOPass', 'SMAAPass'];
    GA.add('post_addons', Promise.allSettled(mods.map((m) => import('three/addons/postprocessing/' + m + '.js')))
      .then((rs) => {
        const out = {};
        rs.forEach((r, i) => {
          if (r.status === 'fulfilled') Object.assign(out, r.value);
          else console.warn('addon ' + mods[i] + ' failed:', r.reason && r.reason.message);
        });
        return out;
      }));
  }

  /* Финальный грейд в display-пространстве (после ACES): холодная
     серо-зелёная гамма пасмурного леса, мягкий контраст, приподнятые
     тени как у плёнки, виньетка и анимированное зерно. */
  const GRADE_SHADER = {
    uniforms: {
      tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new root.THREE.Vector2(1, 1) },
      uSat: { value: 0.8 }, uContrast: { value: 1.05 }, uVig: { value: 0.3 }, uGrain: { value: 0.03 }, uLift: { value: 0.02 },
      uShadowTint: { value: new root.THREE.Vector3(1, 1, 1) }, uHighTint: { value: new root.THREE.Vector3(1, 1, 1) }
    },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse;
      uniform float uTime, uSat, uContrast, uVig, uGrain, uLift;
      uniform vec2 uRes;
      uniform vec3 uShadowTint, uHighTint;
      varying vec2 vUv;
      float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
      void main() {
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, uSat);
        c *= mix(uShadowTint, uHighTint, smoothstep(0.05, 0.75, l));
        c = (c - 0.45) * uContrast + 0.45;
        c = uLift * vec3(0.92, 1.0, 0.96) + c * (1.0 - uLift);
        vec2 q = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
        c *= mix(1.0 - uVig, 1.0, smoothstep(1.05, 0.25, length(q)));
        vec2 px = vUv * uRes;
        float n = hash(px + fract(uTime * 7.31) * 131.0) + hash(px * 0.5 + fract(uTime * 3.7) * 71.0) - 1.0;
        c += n * uGrain * (0.35 + 0.65 * (1.0 - abs(l * 2.0 - 1.0)));
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
      }`
  };

  function main() {
    const THREE = root.THREE;
    const clamp = U.clamp;

    /* ====================================================== рендерер === */
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    /* 1.5 вместо 2: на HiDPI экранах постобработка в 4K съедает бюджет 60 fps */
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.body.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.02, 400);

    /* ================================================ свет и дымка === */
    /* Пасмурный сосновый лес: вся заливка — от HDRI «Misty Pines» (Poly
       Haven, CC0), фон — то же фото, у которого всё ниже ~15° растворено в
       цвете тумана. Туман тех же тонов, поэтому 3D-стволы на 30–80 м
       уходят в ту же молочную дымку, что и стволы на фото. Прямого солнца
       нет: слабый холодный направленный свет нужен только для мягких
       контактных теней. Числа собраны в LOOK, чтобы подбирать их из
       консоли через __GAME.look({...}). */
    const LOOK = {
      exposure: 0.95,
      env: 1.0,              // scene.environmentIntensity
      mist: 0.26,            // яркость дымки/фона относительно фото
      fogDensity: 0.021,
      sun: 0.75, sunElev: 58, sunAzim: 28,
      hemi: 0.0,
      ao: 0.9,
      sat: 0.78, contrast: 1.06, vignette: 0.32, grain: 0.035,
      shadowTint: [0.93, 1.0, 0.97], highTint: [1.0, 1.0, 0.98], lift: 0.025
    };
    renderer.toneMappingExposure = LOOK.exposure;

    const pmrem = new THREE.PMREMGenerator(renderer);
    let envOK = false;
    const hdr = GA && GA.data.env_hdr;
    if (hdr && hdr.data) {
      try {
        const t = new THREE.DataTexture(hdr.data, hdr.width, hdr.height, THREE.RGBAFormat, hdr.type);
        t.colorSpace = THREE.LinearSRGBColorSpace;
        t.mapping = THREE.EquirectangularReflectionMapping;
        t.minFilter = t.magFilter = THREE.LinearFilter;
        t.generateMipmaps = false;
        t.flipY = true;
        t.needsUpdate = true;
        scene.environment = pmrem.fromEquirectangular(t).texture;
        t.dispose();
        envOK = true;
      } catch (e) { console.warn('HDRI environment failed:', e && e.message); }
    }
    if (!envOK) {
      /* запасной вариант без HDRI: ровная серо-зелёная заливка */
      const envScene = new THREE.Scene();
      envScene.background = new THREE.Color(0x8f9690);
      scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    }
    pmrem.dispose();
    scene.environmentIntensity = LOOK.env;

    const fogColor = new THREE.Color();
    scene.fog = new THREE.FogExp2(fogColor, LOOK.fogDensity);
    const bgBmp = GA && GA.data.env_bg;
    let bgTex = null;
    if (bgBmp && envOK) {
      bgTex = new THREE.Texture(bgBmp);
      bgTex.flipY = false;                   // ImageBitmap уже перевёрнут
      bgTex.mapping = THREE.EquirectangularReflectionMapping;
      bgTex.colorSpace = THREE.SRGBColorSpace;
      bgTex.generateMipmaps = false;         // фон 4k только увеличивается
      bgTex.minFilter = THREE.LinearFilter;
      bgTex.needsUpdate = true;
      scene.background = bgTex;
    } else {
      scene.background = fogColor;
    }

    /* =========================================================== свет == */
    const sunDir = new THREE.Vector3();
    const sun = new THREE.DirectionalLight(0xdfe5e8, LOOK.sun);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    (function () {
      const c = sun.shadow.camera;
      c.near = 1; c.far = 140;
      c.left = -26; c.right = 26; c.top = 26; c.bottom = -26;
      c.updateProjectionMatrix();
    })();
    scene.add(sun);
    scene.add(sun.target);
    /* без HDRI полусферный свет возвращает прежнюю серую заливку */
    const hemi = new THREE.HemisphereLight(0xa9b0aa, 0x3c3a32, envOK ? LOOK.hemi : 0.85);
    scene.add(hemi);

    function applyLook() {
      renderer.toneMappingExposure = LOOK.exposure;
      scene.environmentIntensity = LOOK.env;
      const k = envOK ? LOOK.mist : 0.25;
      fogColor.setRGB(ENV_MIST[0] * k, ENV_MIST[1] * k, ENV_MIST[2] * k);
      scene.fog.density = LOOK.fogDensity;
      if (bgTex) scene.backgroundIntensity = ENV_BG_SCALE * k;
      sunDir.setFromSphericalCoords(1, Math.PI / 2 - LOOK.sunElev * Math.PI / 180, LOOK.sunAzim * Math.PI / 180);
      sun.position.copy(sunDir).multiplyScalar(60);
      sun.intensity = LOOK.sun;
      if (envOK) hemi.intensity = LOOK.hemi;
      hemi.visible = hemi.intensity > 0;
      if (POST) POST.apply(LOOK);
    }

    /* ============================================== постобработка === */
    /* RenderPass → GTAO (половинное разрешение) → OutputPass (ACES + sRGB)
       → [SMAA, если нет MSAA] → грейд: цвет, виньетка, зерно. Если какой-то
       аддон не загрузился или композер упал — рисуем напрямую. */
    let POST = makePost();
    function makePost() {
      const A = GA && GA.data.post_addons;
      if (!A || !A.EffectComposer || !A.RenderPass || !A.OutputPass || !A.ShaderPass) return null;
      try {
        const composer = new A.EffectComposer(renderer);
        /* MSAA в целевых буферах: сглаживает и геометрию, и альфа-карточки
           хвои (alphaToCoverage работает только с мультисэмплингом) */
        /* ?dev — облегчённый кадр для съёмки проверок (без MSAA, AO и SMAA) */
        const DEV = typeof location !== 'undefined' && /[?&]dev\b/.test(location.search);
        const samples = DEV ? 0 : Math.min(4, renderer.capabilities.maxSamples || 0);
        composer.renderTarget1.samples = composer.renderTarget2.samples = samples;
        composer.addPass(new A.RenderPass(scene, camera));
        let gtao = null;
        if (A.GTAOPass && !DEV) {
          gtao = new A.GTAOPass(scene, camera, 512, 512, undefined,
            { radius: 0.55, distanceExponent: 1.5, thickness: 1.2, distanceFallOff: 1.0, scale: 1.0, samples: 12 },
            { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 });
          const gSize = gtao.setSize.bind(gtao);
          gtao.setSize = (w, h) => gSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
          /* В G-буфер AO не пишем альфа-карточки (хвоя, трава: override-
             материал не знает их альфы и дал бы тёмные прямоугольники) и
             прозрачные эффекты (вспышки, трассеры, дым). */
          gtao.overrideVisibility = function () {
            const cache = this._visibilityCache;
            this.scene.traverse((o) => {
              cache.set(o, o.visible);
              if (o.isPoints || o.isLine || o.isSprite || o.userData.noAO ||
                (o.material && !Array.isArray(o.material) && (o.material.transparent || o.material.depthWrite === false))) o.visible = false;
            });
          };
          /* второй проход по сцене не должен перерисовывать карту теней */
          const gRender = gtao.render.bind(gtao);
          gtao.render = function (r, wb, rb, dt, mask) {
            const au = r.shadowMap.autoUpdate;
            r.shadowMap.autoUpdate = false;
            try { gRender(r, wb, rb, dt, mask); } finally { r.shadowMap.autoUpdate = au; }
          };
          composer.addPass(gtao);
        }
        composer.addPass(new A.OutputPass());
        let smaa = null;
        if (A.SMAAPass && !DEV) { smaa = new A.SMAAPass(512, 512); smaa.enabled = samples < 2; composer.addPass(smaa); }
        const grade = new A.ShaderPass(GRADE_SHADER);
        composer.addPass(grade);
        /* линза бодикама (game/bodycam.js): включается от первого лица */
        const lens = root.GBodycam ? new A.ShaderPass(root.GBodycam.LENS_SHADER) : null;
        if (lens) { lens.enabled = false; composer.addPass(lens); }
        const post = {
          composer, gtao, grade, smaa, lens,
          apply(L) {
            if (gtao) gtao.blendIntensity = L.ao;
            const u = grade.uniforms;
            u.uSat.value = L.sat; u.uContrast.value = L.contrast; u.uVig.value = L.vignette;
            u.uGrain.value = L.grain; u.uLift.value = L.lift;
            u.uShadowTint.value.fromArray(L.shadowTint); u.uHighTint.value.fromArray(L.highTint);
          },
          /* качество графики (settings.quality): AO, MSAA/SMAA */
          quality(Q) {
            if (gtao) gtao.enabled = !!Q.ao;
            const n = DEV ? 0 : Math.min(Q.msaa, renderer.capabilities.maxSamples || 0);
            for (const rt of [composer.renderTarget1, composer.renderTarget2]) if (rt.samples !== n) { rt.samples = n; rt.dispose(); }
            if (smaa) smaa.enabled = n < 2;
          },
          resize(w, h) {
            composer.setPixelRatio(renderer.getPixelRatio());
            composer.setSize(w, h);
            grade.uniforms.uRes.value.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
            if (lens) {
              lens.uniforms.uRes.value.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
              lens.uniforms.uAspect.value = w / h;
            }
          }
        };
        post.resize(window.innerWidth, window.innerHeight);
        return post;
      } catch (e) {
        console.warn('post-processing disabled:', e && e.message);
        return null;
      }
    }
    applyLook();

    /* Единая точка рендера кадра (вызывается из tick). */
    function renderFrame(dt) {
      if (POST) {
        try {
          POST.grade.uniforms.uTime.value = (POST.grade.uniforms.uTime.value + (dt || 0.016)) % 1000;
          POST.composer.render(dt);
          return;
        } catch (e) {
          console.warn('post-processing failed, falling back to direct render:', e && e.message);
          POST = null;
        }
      }
      renderer.render(scene, camera);
    }

    /* ========================================================== мир ==== */
    const world = WORLD.build(THREE, scene);
    const fx = FX.create(THREE, scene);
    const audio = AUDIO.create();

    /* ==================================================== профиль ====== */
    let lobby = null;                              // game/lobby.js (создаётся после сцены)
    const PROF = root.GProfile;
    let prof = PROF.load();
    let cmap = PROF.codeMap(prof);
    const WLIB = GA && GA.data.weapons;             // game/lib/weapons (boot.js)
    const HOLD = root.GHold;

    /* ==================================================== качество ===== */
    const QUALITY = {
      low: { pr: 0.85, shadows: false, shadowSize: 1024, ao: false, msaa: 0 },
      medium: { pr: 1.25, shadows: true, shadowSize: 1024, ao: false, msaa: 4 },
      high: { pr: 1.5, shadows: true, shadowSize: 2048, ao: true, msaa: 4 }
    };
    let qualityNow = null;
    function applyQuality(q) {
      const Q = QUALITY[q] || QUALITY.medium;
      qualityNow = q;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pr));
      if (renderer.shadowMap.enabled !== Q.shadows) {
        renderer.shadowMap.enabled = Q.shadows;
        /* шейдеры с тенями и без — разные программы */
        scene.traverse((o) => {
          const m = o.material;
          if (m) for (const x of Array.isArray(m) ? m : [m]) x.needsUpdate = true;
        });
      }
      sun.castShadow = Q.shadows;
      if (sun.shadow.mapSize.x !== Q.shadowSize) {
        sun.shadow.mapSize.set(Q.shadowSize, Q.shadowSize);
        if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      }
      if (POST) POST.quality(Q);
      onResize();
    }

    /* ====================================================== бойцы ====== */
    const TEAM_COLOR = { delta: 0xa9d27c, alpha: 0x9cc6ff };
    const ringTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(64, 64, 30, 64, 64, 62);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.72, 'rgba(255,255,255,0.10)');
      gr.addColorStop(0.86, 'rgba(255,255,255,0.85)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    const squad = [];
    for (const sp of SPAWN) {
      const ch = CHAR.build(THREE, sp.key);
      const gy = world.heightAt ? world.heightAt(sp.x, sp.z) : 0;
      ch.root.position.set(sp.x, gy, sp.z);
      ch.root.rotation.y = sp.yaw;
      scene.add(ch.root);
      const rig = new RIG.Rig(THREE, ch);
      const s = {
        key: sp.key, char: ch, rig, spawn: sp,
        ctrl: PLAYER.create(THREE, { world, audio, fx }),
        idleSeed: Math.random() * 100,
        active: false, build: null, wkey: '', wtitle: null
      };
      s.hold = HOLD ? HOLD.create(THREE, { char: ch, rig }) : null;
      s.pose = root.GPose.create(THREE, ch, { rig, seed: s.idleSeed });
      s.ctrl.pos.set(sp.x, gy, sp.z);
      s.ctrl.yaw = sp.yaw;
      /* инерция наводки стартует с фактического курса */
      s.ctrl.lagYaw = sp.yaw;
      s.ctrl.lagPitch = s.ctrl.pitch;
      s.ctrl.ready = 0;
      s.idleYaw = sp.yaw;
      s.ctrl.configure(null);
      /* мягкое кольцо на земле у выбранного генерала — цвет команды */
      const ring = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({
        map: ringTex, color: TEAM_COLOR[ch.preset.faction] || 0xffffff, transparent: true, opacity: 0.55,
        depthWrite: false, fog: false, toneMapped: false
      }));
      ring.rotation.x = -Math.PI / 2;
      ring.renderOrder = 2;
      ring.visible = false;
      ring.userData.noAO = true;
      scene.add(ring);
      s.ring = ring;
      squad.push(s);
    }

    /* ================================================= состояние игры = */
    const S = {
      mode: 'free',            // free | embodied
      activeIdx: -1,
      candidate: -1,
      holdF: 0,
      score: 0,
      selected: PROF.GENERALS.some((g) => g.key === prof.general) ? prof.general : null,
      menu: true,              // правая панель открыта
      menuK: 1,                // 0..1 — смещение кадра под панель
      idleT: 0,                // сколько камера стоит без движения
      /* свободная камера: кадр меню — генералы в левой части экрана */
      free: {
        pos: new THREE.Vector3(0, 1.62, 7.7),
        yaw: 0, pitch: -0.07,
        vel: new THREE.Vector3(),
        fov: prof.settings.fov
      },
      pointerLocked: false,
      started: false,
      ready: false,
      time: 0
    };
    const IDLE_MENU = 5;           // с: камера стоит — меню возвращается
    const IK_FAR = 26;             // м: дальше руки не решаются
    const WEAPON_NAME = (id) => { const w = PROF.weaponById(id); return w ? w.title : id; };

    /* ====================================================== ввод ====== */
    const held = {};               // действие -> удерживается
    const input = {
      fwd: 0, back: 0, left: 0, right: 0,
      sprint: false, crouch: false, ads: false, leanL: false, leanR: false
    };
    const MOVE = ['fwd', 'back', 'left', 'right'];
    function syncInput() {
      input.fwd = held.fwd ? 1 : 0; input.back = held.back ? 1 : 0;
      input.left = held.left ? 1 : 0; input.right = held.right ? 1 : 0;
      input.sprint = !!held.sprint; input.crouch = !!held.crouch; input.ads = !!held.aim;
      input.leanL = !!held.leanL; input.leanR = !!held.leanR;
      S.spaceUp = !!held.jump;
    }
    function releaseAll() {
      for (const k of Object.keys(held)) held[k] = false;
      syncInput();
      S.fDown = false;
      for (const a of MOVE) lobby && lobby.key(a, false);
      trigger(false);
    }

    const dom = renderer.domElement;
    const el = (id) => document.getElementById(id);
    const ui = {
      loader: el('loader'), loading: el('loading'), labels: el('labels'),
      ammoN: el('ammoN'), ammoR: el('ammoR'), ammoCal: el('ammoCal'), mode: el('mode'),
      whoName: el('whoName'), whoSide: el('whoSide'), who: el('who'),
      prompt: el('prompt'), promptLbl: el('promptLbl'), promptSub: el('promptSub'), promptKey: el('promptKey'),
      promptFill: document.querySelector('#prompt .fill'),
      toast: el('toast'), scoreN: el('scoreN'), stamina: el('stamina'),
      staminaBar: document.querySelector('#stamina i'),
      hitmark: el('hitmark'), vig: el('vig')
    };

    function toast(text, ms) {
      const d = document.createElement('div');
      d.className = 'msg';
      d.textContent = text;
      ui.toast.appendChild(d);
      setTimeout(() => {
        d.style.transition = 'opacity .3s';
        d.style.opacity = '0';
        setTimeout(() => d.remove(), 320);
      }, ms || 1900);
    }

    const active = () => (S.activeIdx >= 0 ? squad[S.activeIdx] : null);
    const blocked = () => !!(lobby && lobby.capturing());

    /* Звук — только после жеста пользователя (политика автозапуска). */
    function firstGesture() {
      if (S.started) return;
      S.started = true;
      audio.init();
      audio.resume();
      if (audio.setVolume) audio.setVolume(prof.settings.volume);
    }
    function lockPointer() {
      try {
        const r = dom.requestPointerLock();
        if (r && r.catch) r.catch(() => {});
      } catch (e) { /* нет pointer lock (headless, iframe) */ }
    }

    function setMenu(on) {
      on = !!on;
      if (S.menu === on) return;
      S.menu = on;
      document.body.classList.toggle('menu', on);
      S.idleT = 0;
      if (on) {
        releaseAll();
        if (document.pointerLockElement) document.exitPointerLock();
        lobby && lobby.refresh();
      }
    }

    function trigger(down) {
      const a = active();
      if (a && a.build) a.ctrl.pullTrigger(!!down);
    }

    function cycleFireMode() {
      const a = active();
      if (!a || !a.build) return;
      const m = a.ctrl.cycleFireMode();
      const NAME = { safe: 'ПРЕДОХРАНИТЕЛЬ', auto: 'АВТО', semi: 'ОДИНОЧНЫЙ' };
      ui.mode.textContent = NAME[m] || m;
      toast(NAME[m] || m, 1100);
    }
    function doReload() {
      const a = active();
      if (!a || !a.build) return;
      if (a.ctrl.startReload()) toast('ПЕРЕЗАРЯДКА', 900);
      else if (a.ctrl.reserve <= 0) toast('НЕТ ПАТРОНОВ', 1200);
    }
    function doInspect() {
      const a = active();
      if (a && a.build) a.ctrl.startInspect();
    }

    /* Действия — по клавишам профиля (settings.keys). */
    function onAction(act, down, repeat) {
      if (!down) {
        held[act] = false;
        syncInput();
        if (MOVE.includes(act)) lobby && lobby.key(act, false);
        if (act === 'use') S.fDown = false;
        if (act === 'fire') trigger(false);
        return;
      }
      if (act === 'menu') {
        if (!repeat) { setMenu(!S.menu); if (!S.menu) lockPointer(); }
        return;
      }
      if (MOVE.includes(act)) lobby && lobby.key(act, true);
      if (S.menu) {
        /* W A S D из меню — панель уезжает, камера летит */
        if (!MOVE.includes(act)) return;
        setMenu(false);
        lockPointer();
      }
      S.idleT = 0;
      held[act] = true;
      syncInput();
      if (repeat) return;
      switch (act) {
        case 'use': S.fDown = true; break;
        case 'reload': doReload(); break;
        case 'fireMode': cycleFireMode(); break;
        case 'inspect': doInspect(); break;
        case 'thirdPerson': S.tp = !S.tp; break;
        case 'fire': trigger(true); break;
        default: break;
      }
    }
    function onCode(code, down, repeat) {
      const acts = cmap[code];
      if (!acts) return false;
      for (const a of acts) onAction(a, down, repeat);
      return true;
    }

    window.addEventListener('keydown', (e) => {
      firstGesture();
      if (e.code === 'Tab') e.preventDefault();
      if (blocked()) return;
      if (e.code === 'Escape') { setMenu(true); return; }
      if (onCode(e.code, true, e.repeat)) {
        if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => { onCode(e.code, false, false); });
    window.addEventListener('blur', releaseAll);

    dom.addEventListener('mousedown', (e) => {
      firstGesture();
      if (blocked()) return;
      /* клик по полигону при открытом меню — начать полёт */
      if (S.menu) { setMenu(false); lockPointer(); return; }
      if (!S.pointerLocked) { lockPointer(); return; }
      onCode('Mouse' + e.button, true, false);
    });
    window.addEventListener('mouseup', (e) => { onCode('Mouse' + e.button, false, false); });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('click', firstGesture);

    const SENS = 0.00155;
    window.addEventListener('mousemove', (e) => {
      if (!S.pointerLocked || S.menu || blocked()) return;
      const dx = e.movementX || 0, dy = e.movementY || 0;
      if (dx || dy) S.idleT = 0;
      const k = SENS * (prof.settings.sens || 1);
      const a = active();
      if (a) a.ctrl.look(dx, dy, k);
      else {
        S.free.yaw -= dx * k;
        S.free.pitch = clamp(S.free.pitch - dy * k, -1.4, 1.4);
      }
    });

    document.addEventListener('pointerlockchange', () => {
      S.pointerLocked = document.pointerLockElement === dom;
      if (!S.pointerLocked) { trigger(false); held.aim = false; syncInput(); }
    });

    let panelW = 0;
    function onResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      if (POST) POST.resize(window.innerWidth, window.innerHeight);
      const m = el('menu');
      panelW = m ? m.offsetWidth : 0;
    }
    window.addEventListener('resize', onResize);

    /* Свободная камера: плавный разгон, без коллизий, в границах участка. */
    function updateFree(dt) {
      const f = S.free;
      const speed = (input.sprint ? 9.5 : 4.2);
      let wx = 0, wz = 0, wy = 0;
      if (input.fwd) wz -= 1;
      if (input.back) wz += 1;
      if (input.left) wx -= 1;
      if (input.right) wx += 1;
      if (input.crouch) wy -= 1;
      if (S.spaceUp) wy += 1;
      const want = new THREE.Vector3();
      const len = Math.hypot(wx, wz);
      if (len > 0) {
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(f.pitch, f.yaw, 0, 'YXZ'));
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
        want.addScaledVector(fwd, (-wz / len) * speed).addScaledVector(right, (wx / len) * speed);
      }
      want.y += wy * speed * 0.9;
      f.vel.lerp(want, 1 - Math.exp(-9 * dt));
      f.pos.addScaledVector(f.vel, dt);
      const gy = world.heightAt ? world.heightAt(f.pos.x, f.pos.z) : 0;
      f.pos.y = clamp(f.pos.y, gy + 0.45, 22);
      f.pos.x = clamp(f.pos.x, -28, 28);
      f.pos.z = clamp(f.pos.z, -33, 33);
    }


    /* ============================================ выбор и оружие ====== */
    function select(key) {
      S.selected = key;
      prof = PROF.update((p) => { p.general = key; });
      lobby && lobby.refresh();
    }

    /* Характеристики оружия -> контроллер; патроны из слотов снаряжения
       (на полигоне — не меньше трёх магазинов). */
    function configureCtrl(s) {
      const c = s.ctrl;
      if (!s.build) {
        c.configure(null);
        ui.ammoCal.textContent = '—';
        document.body.classList.add('unarmed');
        return;
      }
      const st = s.build.stats || {};
      const sum = PROF.summarize(prof.loadouts[s.key]);
      const isSec = s.build.id === 'glock18c' || (s.build.def && s.build.def.kind === 'secondary');
      const slotAmmo = isSec ? sum.secondaryAmmo : sum.primaryAmmo;
      c.configure(Object.assign({}, st, { reserve: Math.max(slotAmmo, (st.magCap || 30) * 3) }));
      ui.ammoCal.textContent = st.cal || '';
      const NAME = { safe: 'ПРЕДОХРАНИТЕЛЬ', auto: 'АВТО', semi: 'ОДИНОЧНЫЙ' };
      ui.mode.textContent = NAME[c.fireMode] || c.fireMode;
      document.body.classList.remove('unarmed');
    }

    function embody(idx) {
      const prev = active();
      if (prev) {
        prev.active = false;
        prev.ctrl.pullTrigger(false);
        prev.ctrl.ads = 0;
        prev.hold && prev.hold.snap();
      }
      S.activeIdx = idx;
      const a = squad[idx];
      a.active = true;
      select(a.key);
      if (BC) BC.setWeapon(a.build);
      configureCtrl(a);
      audio.resume();
      audio.ui(true);
      audio.gearRattle(1);
      const P = a.char.preset;
      ui.who.className = P.faction;
      ui.whoName.textContent = P.name;
      ui.whoSide.textContent = (P.faction === 'delta' ? 'ДЕЛЬТА' : 'АЛЬФА') + ' · ' + P.callsign.toUpperCase();
      toast('ГЕНЕРАЛ ' + P.name + ' · ' + (a.build ? a.wtitle : 'БЕЗ ОРУЖИЯ'), 1700);
      S.mode = 'embodied';
      document.body.classList.add('embodied');
      if (S.menu) setMenu(false);
    }

    function disembody() {
      const a = active();
      if (!a) return;
      if (audio.motion) audio.motion(0);
      /* свободная камера появляется за спиной генерала */
      const f = S.free;
      f.yaw = a.ctrl.yaw;
      f.pitch = clamp(a.ctrl.pitch, -0.6, 0.4);
      const back = 1.5;
      f.pos.set(a.ctrl.pos.x + Math.sin(f.yaw) * back, a.ctrl.pos.y + 1.72, a.ctrl.pos.z + Math.cos(f.yaw) * back);
      f.vel.set(0, 0, 0);
      a.active = false;
      a.ctrl.pullTrigger(false);
      a.ctrl.ads = 0;
      a.hold && a.hold.snap();
      S.activeIdx = -1;
      S.mode = 'free';
      S.idleT = 0;
      document.body.classList.remove('embodied', 'unarmed');
      audio.ui(false);
      ui.who.className = '';
      ui.whoName.textContent = '—';
      ui.whoSide.textContent = 'СВОБОДНАЯ КАМЕРА';
      toast('СВОБОДНАЯ КАМЕРА', 1300);
    }

    /* Оружие генерала по профилю: основное, иначе пистолет, иначе без оружия. */
    async function armGeneral(s) {
      const lo = prof.loadouts[s.key];
      const sum = PROF.summarize(lo);
      const id = sum.primary || sum.secondary || null;
      const cfg = id && lo && lo.weapons ? lo.weapons[id] || null : null;
      const wkey = id ? id + ':' + JSON.stringify(cfg) : '';
      if (wkey === s.wkey) return s.build;
      s.wkey = wkey;
      let build = null;
      if (id && WLIB) {
        try { build = await WLIB.buildWeapon(id, cfg); } catch (e) { console.warn('weapon ' + id + ' failed:', e && e.message); }
        if (s.wkey !== wkey) return s.build;       // пока собирали — снаряжение сменилось
      }
      s.build = build;
      s.wtitle = build ? WEAPON_NAME(id) : null;
      if (s.hold) s.hold.setWeapon(build);
      else if (build) scene.add(build.root);
      if (squad[S.activeIdx] === s) { if (BC) BC.setWeapon(build); configureCtrl(s); }
      updateLabelText(s);
      lobby && lobby.refresh();
      return build;
    }
    let arming = null;
    function armAll() {
      prof = PROF.load();
      if (PROF.GENERALS.some((g) => g.key === prof.general)) S.selected = prof.general;
      arming = (arming || Promise.resolve()).then(async () => { for (const s of squad) await armGeneral(s); });
      return arming;
    }

    /* ================================================== выбор бойца === */
    /* Кандидат — ближайший генерал в конусе взгляда на дистанции USE_RANGE. */
    const _c1 = new THREE.Vector3(), _c2 = new THREE.Vector3();
    function findCandidate() {
      const eye = camera.getWorldPosition(_c1);
      const dir = camera.getWorldDirection(_c2);
      let best = -1, bestScore = -1;
      for (let i = 0; i < squad.length; i++) {
        if (i === S.activeIdx) continue;
        const p = squad[i].ctrl.pos;
        const dx = p.x - eye.x, dz = p.z - eye.z;
        const dy = (p.y + 1.1) - eye.y;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > USE_RANGE) continue;
        const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / (dist || 1);
        if (dot < 0.35) continue;
        const score = dot / Math.max(0.4, dist);
        if (score > bestScore) { bestScore = score; best = i; }
      }
      return best;
    }

    /* Удержание F (клавиша «use»): рядом генерал — выбрать и войти, иначе — выйти. */
    function updateUse(dt) {
      const cand = findCandidate();
      S.candidate = cand;
      const inRange = cand >= 0;
      const canExit = S.mode === 'embodied';
      let showPrompt = false, lbl = '', sub = '';
      if (inRange) {
        const P = squad[cand].char.preset;
        showPrompt = true;
        lbl = 'ВЫБРАТЬ: ' + P.name + ' «' + P.callsign + '»';
        sub = 'удерживайте';
      }
      if (S.fDown && (showPrompt || canExit)) {
        S.holdF += dt;
        if (S.holdF >= HOLD_TIME) {
          S.holdF = 0;
          S.fDown = false;
          if (inRange) embody(cand); else disembody();
        }
      } else {
        S.holdF = Math.max(0, S.holdF - dt * 2.4);
      }
      const exiting = !showPrompt && canExit && S.holdF > 0.02;
      ui.prompt.classList.toggle('on', showPrompt || exiting);
      if (showPrompt || exiting) {
        if (exiting) { lbl = 'ВЫЙТИ В СВОБОДНУЮ КАМЕРУ'; sub = 'удерживайте'; }
        ui.promptKey.textContent = PROF.keyLabel(prof.settings.keys.use);
        ui.promptLbl.textContent = lbl;
        ui.promptSub.textContent = sub;
        ui.promptFill.style.transform = 'scaleY(' + (S.holdF / HOLD_TIME).toFixed(3) + ')';
      }
    }

    /* ============================================ подписи генералов === */
    for (const s of squad) {
      const P = s.char.preset;
      const d = document.createElement('div');
      d.className = 'glabel off ' + P.faction;
      d.innerHTML = '<b></b><u></u><s></s>';
      ui.labels.appendChild(d);
      s.label = d;
      updateLabelText(s);
    }
    function updateLabelText(s) {
      if (!s.label) return;
      const P = s.char.preset;
      s.label.querySelector('b').textContent = P.name + ' · «' + P.callsign + '»';
      s.label.querySelector('u').textContent = 'КОМАНДА ' + (P.faction === 'delta' ? 'ДЕЛЬТА' : 'АЛЬФА');
      s.label.querySelector('s').textContent = s.build ? s.wtitle : 'без оружия';
    }
    const _lp = new THREE.Vector3();
    function updateLabels(t) {
      for (let i = 0; i < squad.length; i++) {
        const s = squad[i];
        const sel = s.key === S.selected;
        const isActive = i === S.activeIdx;
        s.label.classList.toggle('sel', sel);
        /* кольцо: только выбранный и не тот, чьими глазами смотрим */
        s.ring.visible = sel && !(isActive && !S.tp);
        if (s.ring.visible) {
          s.ring.position.set(s.ctrl.pos.x, s.ctrl.pos.y + 0.03, s.ctrl.pos.z);
          s.ring.material.opacity = 0.42 + Math.sin(t * 2.2) * 0.1;
        }
        let show = !isActive && !S.spectate;
        let x = 0, y = 0, d = 0;
        if (show) {
          s.char.bone('head').getWorldPosition(_lp);
          _lp.y += 0.36;
          d = _lp.distanceTo(camera.position);
          _lp.project(camera);
          show = _lp.z < 1 && d < 34 && Math.abs(_lp.x) < 1.2 && Math.abs(_lp.y) < 1.2;
          x = (_lp.x * 0.5 + 0.5) * window.innerWidth;
          y = (-_lp.y * 0.5 + 0.5) * window.innerHeight;
        }
        s.label.classList.toggle('off', !show);
        if (!show) s.label.style.opacity = '0';
        else {
          s.label.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(-50%,-100%)';
          s.label.style.opacity = String(U.clamp01((34 - d) / 12));
        }
      }
    }

    /* ------------------------------------------------- поза бойца ----- */
    /* Корпус, ноги, голова — anim/pose.js; управляемый генерал качается
       меньше и не оглядывается, фаза шага — общая с его контроллером. */
    function poseSoldier(s, dt, isActive, t) {
      const c = s.ctrl;
      return s.pose.update(dt, {
        x: c.pos.x, y: c.pos.y, z: c.pos.z, yaw: c.yaw, vx: c.vel.x, vz: c.vel.z,
        speed: c.speed, crouch: c.crouch, aimYaw: c.yaw, aimPitch: c.pitch, t,
        ready: c.ready || 0, ads: c.ads, lean: c.lean, sprint: c.sprint,
        fatigue: 1 - c.stamina / c.PHYS.staminaMax, stepPhase: c.stepPhase, breathT: c.breathT,
        idle: isActive ? 0.35 : 1, look: !isActive, groundAt: c.groundAt
      });
    }

    /* Позиция глаз бойца: следует из позы, а не задаётся отдельно —
       иначе камера «плавает» относительно модели. */
    function eyePosition(s) {
      const c = s.ctrl, M = s.char.metrics;
      const moveAmt = U.clamp01(c.speed / c.PHYS.sprint);
      /* Высота глаз берётся из скелета конкретного бойца, а не константой:
         операторы разного роста, и фиксированные 1,655 м ставили камеру
         кому-то в лоб, а кому-то в горло. */
      const standEye = M.eyeY;
      const crouchEye = M.eyeY - (M.hipY - 0.50);
      const eyeY = U.lerp(standEye, crouchEye, c.crouch);
      const bobY = Math.sin(c.bobPhase * 2) * U.lerp(0.009, 0.030, moveAmt);
      const bobX = Math.sin(c.bobPhase) * U.lerp(0.005, 0.022, moveAmt);
      const lean = c.lean * 0.30;
      const sinY = Math.sin(c.yaw), cosY = Math.cos(c.yaw);
      /* Наклон Q/E уводит голову вбок ОТНОСИТЕЛЬНО взгляда: вправо от
         направления движения — это ось right = (cos yaw, -sin yaw). */
      const side = bobX + lean;
      /* Глаз лежит на ПЕРЕДНЕЙ поверхности головы, а не в центре черепа.
         Без этого выноса камера стоит внутри головы, и собственные плечи
         занимают нижнюю половину кадра. */
      const fwd = M.headRZ + 0.012;
      return new THREE.Vector3(
        c.pos.x + side * cosY - Math.sin(c.yaw) * fwd,
        c.pos.y + eyeY + bobY - Math.abs(c.lean) * 0.055,
        c.pos.z - side * sinY - Math.cos(c.yaw) * fwd
      );
    }

    /* ------------------------------------------------- баллистика ----- */
    /* Хитскан с поправкой: луч из дульного среза, разброс по текущему
       spread, дальше проверка мишеней и статики. Пуля 5,45×39 на 30 м
       летит 35 мс — визуально это мгновенно, поэтому трассер рисуем сразу. */
    const ray = new THREE.Raycaster();
    ray.far = 220;
    const hitTargets = [];
    /* Начальная скорость пули 5,45×39, м/с. Используется и для падения
       пули, и для скорости трассера. */
    const MUZZLE_VEL = 880;
    /* Баллистический коэффициент: на 100 м пуля теряет около 60 м/с.
       Замедление учитывается при расчёте времени полёта, а значит и сноса. */
    const DRAG = 0.0006;

    /* Трасса пули по параболе.
       Хитскан по прямой — это и есть «стрельба лазером»: на 30 м падение
       уже 4 см, на 100 м — 35 см, и без него дистанции теряют смысл.
       Считаем полёт шагами и проверяем каждый отрезок на попадание. */
    function traceBullet(origin, dir, objs, targets, v0) {
      const pos = origin.clone();
      const vel = dir.clone().multiplyScalar(v0 || MUZZLE_VEL);
      const step = 1 / 240;                   // шаг интегрирования, с
      const maxT = 0.45;                      // дальше 200 м не считаем
      const seg = new THREE.Vector3();
      for (let t = 0; t < maxT; t += step) {
        /* сопротивление воздуха и сила тяжести */
        const v = vel.length();
        vel.addScaledVector(vel, -DRAG * v * step);
        vel.y -= 9.81 * step;
        seg.copy(vel).multiplyScalar(step);
        const len = seg.length();
        if (len < 1e-6) break;
        ray.set(pos, seg.clone().divideScalar(len));
        ray.far = len;
        const tHits = targets.length ? ray.intersectObjects(targets, false) : [];
        const wHits = ray.intersectObjects(objs, true);
        const t0 = tHits.length ? tHits[0] : null;
        const w0 = wHits.length ? wHits[0] : null;
        if (t0 && (!w0 || t0.distance <= w0.distance)) return { hit: t0, target: true };
        if (w0) return { hit: w0, target: false };
        pos.add(seg);
        if (pos.y < -2) break;
      }
      return { hit: null, target: false, end: pos };
    }


    /* Выстрел из сборки генерала: дульный срез anchors.muzzle, ось ствола
       (-Z сборки), разброс контроллера; дробь — несколько картечин. */
    const _mz = new THREE.Vector3();
    function shootRay(s) {
      const c = s.ctrl, b = s.build;
      if (!b) return;
      b.root.updateMatrixWorld(true);
      const st = b.stats || {};
      const origin = b.root.localToWorld(_mz.copy(b.anchors.muzzle)).clone();
      const wq = b.root.getWorldQuaternion(new THREE.Quaternion());
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(wq).normalize();
      const v0 = st.velocity || MUZZLE_VEL;

      fx.flashRig.position.copy(origin);
      fx.flashRig.quaternion.copy(wq);
      fx.muzzleFlash(1);
      fx.smoke(origin, 2, fwd.clone().multiplyScalar(1.4), 0.07);
      const ejPos = b.root.localToWorld(b.anchors.magwell.clone().add(new THREE.Vector3(0.02, 0.05, 0.03)));
      const ejDir = new THREE.Vector3(0.86, 0.46, 0.22).normalize().applyQuaternion(wq);
      fx.ejectCase(ejPos, ejDir, new THREE.Vector3(0, 1, 0));
      audio.shot({ vol: 1 });

      hitTargets.length = 0;
      for (const t of world.targets) if (t.state !== 'down') hitTargets.push(t.board);
      const objs = [world.ground];
      for (const k of ['house', 'props', 'fence', 'range', 'garden']) if (world[k]) objs.push(world[k]);

      const pellets = Math.max(1, st.pellets || 1);
      const up = new THREE.Vector3(0, 1, 0);
      const side = new THREE.Vector3().crossVectors(fwd, up).normalize();
      const up2 = new THREE.Vector3().crossVectors(side, fwd).normalize();
      for (let k = 0; k < pellets; k++) {
        const dir = fwd.clone();
        /* картечь 00: ~2,5 см на метр */
        const sp = pellets > 1 ? Math.max(c.spread, 0.025) : c.spread;
        if (sp > 0) {
          const a = Math.random() * Math.PI * 2;
          const rr = Math.sqrt(Math.random()) * sp;
          dir.addScaledVector(side, Math.cos(a) * rr).addScaledVector(up2, Math.sin(a) * rr).normalize();
        }
        let hit = null, hitKind = 'ground', hitTarget = null;
        const shot = traceBullet(origin, dir, objs, hitTargets, v0);
        if (shot.hit) {
          hit = shot.hit;
          if (shot.target) {
            hitKind = 'target';
            hitTarget = world.targets.find((x) => x.board === hit.object);
          } else {
            const n = (hit.object.name || '') + '|' + ((hit.object.parent && hit.object.parent.name) || '');
            if (hit.object === world.ground) hitKind = 'ground';
            else if (/fence|house|props|log|tree|bush/i.test(n)) hitKind = 'wood';
            else hitKind = 'metal';
          }
        }
        const end = hit ? hit.point : (shot.end || origin.clone().addScaledVector(dir, 140));
        if (k < 3) fx.tracer(origin.clone().addScaledVector(dir, 0.35), end, 1, v0);
        if (hit) {
          const nrm = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : dir.clone().negate();
          if (hitTarget && hitTarget.state !== 'falling' && hitTarget.state !== 'down') registerTargetHit(s, hitTarget, hit, nrm);
          else fx.impact(hit.point, nrm, hitTarget ? 'target' : hitKind, hitTarget ? hitTarget.hinge : null);
        }
      }
    }

    /* Попадание в мишень: очко, пробоина, падение рамы. */
    function registerTargetHit(s, tg, hit, nrm) {
      const local = tg.hinge.worldToLocal(hit.point.clone());
      fx.impact(hit.point, nrm, 'target', tg.hinge);
      tg.hits++;
      s.ctrl.hits++;
      S.score++;
      ui.scoreN.textContent = String(S.score);
      audio.targetHit(tg.dist, false);
      /* Точность: считаем зону по расстоянию до центра мишени. */
      const cx = local.x, cy = local.y - tg.H * 0.52;
      const rr = Math.hypot(cx, cy);
      const zone = rr < 0.045 ? 10 : rr < 0.09 ? 9 : rr < 0.135 ? 8 : rr < 0.18 ? 7 : 6;
      ui.hitmark.classList.remove('on');
      void ui.hitmark.offsetWidth;
      ui.hitmark.classList.add('on');
      toast(tg.dist + ' М · ' + zone, 900);
      /* мишень падает */
      tg.state = 'falling';
      tg.t = 0;
      audio.targetFall(tg.dist);
    }

    /* Мишени: падение и подъём. */
    function updateTargets(dt) {
      for (const t of world.targets) {
        if (t.state === 'falling') {
          t.t += dt;
          const u = U.clamp01(t.t / 0.34);
          t.hinge.rotation.x = -U.smoothstep(u) * (Math.PI / 2) * 0.96;
          if (u >= 1) { t.state = 'down'; t.t = 0; }
        } else if (t.state === 'down') {
          t.t += dt;
          if (t.t > 2.6) { t.state = 'rising'; t.t = 0; }
        } else if (t.state === 'rising') {
          t.t += dt;
          const u = U.clamp01(t.t / 0.55);
          /* подъём с лёгким «перелётом» — пружина возврата */
          const e = U.smoothstep(u);
          const over = Math.sin(u * Math.PI) * 0.10 * (1 - u);
          t.hinge.rotation.x = -(1 - e) * (Math.PI / 2) * 0.96 + over;
          if (u >= 1) { t.state = 'up'; t.hinge.rotation.x = 0; }
        }
      }
    }


    for (const s of squad) s.ctrl.onFire = () => shootRay(s);

    /* Нагрудная камера и руки рига от первого лица (game/bodycam.js):
       риг ведёт сборку генерала, без оружия — только камера. */
    const BC = root.GBodycam ? root.GBodycam.create({ scene, camera }) : null;
    const bodycamMode = (i) => (BC && i === S.activeIdx ? (S.tp || S.spectate ? 'tp' : 'fp') : null);
    let lensAmt = 0;


    /* ------------------------------------------------------- камера --- */
    /* Три режима:
         free      — облёт полигона;
         embodied  — от глаз бойца (бодикам);
       Переход между ними плавный: камера «влетает» в глаза оператора. */
    const camRig = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 72, blend: 0 };
    /* Поле зрения. В прицеле оно сужается сильно: при 40° колодка целика,
       до которой 0,3 м, занимала пол-экрана. 22° дают привычную картинку —
       целик и мушка мелкие, цель видно. */
    const FOV_HIP = 74, FOV_ADS = 22;

    function updateCamera(dt) {
      /* внешняя камера для съёмки: управление бойцом при этом сохраняется */
      if (S.spectate) {
        camera.position.copy(S.spectate.pos);
        camera.quaternion.copy(S.spectate.quat);
        if (camera.fov !== S.spectate.fov) { camera.fov = S.spectate.fov; camera.updateProjectionMatrix(); }
        return;
      }
      const a = active();
      /* от первого лица камеру уже поставил бодикам */
      if (a && BC && !S.tp) {
        camRig.pos.copy(camera.position); camRig.quat.copy(camera.quaternion);
        camRig.fov = camera.fov; camRig.blend = 1; camRig.tp = 0;
        return;
      }
      if (a) {
        const c = a.ctrl;
        const eye = eyePosition(a);
        /* Отдача бьёт в камеру слабее, чем в оружие: голова гасит часть. */
        const recPitch = c.recoil.x * 0.30;
        const recYaw = c.recoilYaw.x * 0.22;
        /* Спринт: камера качается сильнее и уходит вбок. */
        const sp = U.smoothstep(c.sprint);
        const moveAmt = U.clamp01(c.speed / c.PHYS.sprint);
        const rollBob = Math.sin(c.bobPhase) * U.lerp(0.010, 0.032, moveAmt) * (1 - c.ads * 0.7);
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(
          c.pitch + recPitch + Math.sin(c.bobPhase * 2) * 0.006 * moveAmt,
          c.yaw + recYaw,
          -c.lean * 0.22 + rollBob + sp * Math.sin(c.bobPhase) * 0.035,
          'YXZ'));

        camRig.blend = U.damp(camRig.blend, 1, 9, dt);
        camRig.pos.lerp(eye, 1 - Math.exp(-26 * dt));
        camRig.quat.slerp(q, 1 - Math.exp(-30 * dt));
        /* в прицеле камера жёстко привязана: дрожь недопустима */
        if (c.ads > 0.6) { camRig.pos.copy(eye); camRig.quat.copy(q); }

        const wantFov = U.lerp(FOV_HIP, FOV_ADS, U.smoothstep(c.ads))
          * U.lerp(1, 1.055, sp);
        camRig.fov = U.damp(camRig.fov, wantFov, 12, dt);
        /* T — вид от третьего лица (из-за правого плеча): видно походку и
           хват. В прицеле камера возвращается к глазам. */
        const kTp = S.tp ? 1 - U.smoothstep(c.ads) : 0;
        camRig.tp = U.damp(camRig.tp || 0, kTp, 7, dt);
        if (camRig.tp > 0.001) {
          const back = new THREE.Vector3(0.55, 0.18, 2.3).applyQuaternion(
            new THREE.Quaternion().setFromEuler(new THREE.Euler(c.pitch * 0.6, c.yaw, 0, 'YXZ')));
          camRig.pos.lerp(eye.clone().add(back), camRig.tp);
          camRig.fov = U.lerp(camRig.fov, 62, camRig.tp);
        }
      } else {
        const f = S.free;
        camRig.blend = U.damp(camRig.blend, 0, 9, dt);
        camRig.pos.lerp(f.pos, 1 - Math.exp(-20 * dt));
        camRig.quat.slerp(new THREE.Quaternion().setFromEuler(
          new THREE.Euler(f.pitch, f.yaw, 0, 'YXZ')), 1 - Math.exp(-18 * dt));
        camRig.fov = U.damp(camRig.fov, S.free.fov || 72, 10, dt);
      }
      camera.position.copy(camRig.pos);
      camera.quaternion.copy(camRig.quat);
      if (Math.abs(camera.fov - camRig.fov) > 0.01) {
        camera.fov = camRig.fov;
        camera.updateProjectionMatrix();
      }
    }

    /* Голова активного бойца прячется от собственной камеры: иначе в
       кадре торчит изнанка шлема или поля панамы. Остальное тело видно —
       как в бодикаме. */
    const HEAD_GROUPS = ['skin', 'helmet', 'hat', 'eye', 'hair', 'mask', 'headGear', 'headHard', 'headRubber', 'brow', 'lash', 'headset', 'cornea'];
    /* Мелкие детали (брови, ресницы, роговица, нашивка, мелочь на шлеме)
       дальше LOD_FAR м не различимы — их меши не рисуются: это экономит
       вызовы отрисовки, когда боец далеко. */
    const DETAIL_GROUPS = ['brow', 'lash', 'cornea', 'patch', 'headRubber', 'headGear'];
    const LOD_FAR = 18;
    const _lodV = new THREE.Vector3();
    function updateSelfVisibility() {
      for (let i = 0; i < squad.length; i++) {
        const s = squad[i];
        const hide = i === S.activeIdx && !S.spectate && !(S.tp && camRig.tp > 0.3);
        for (const g of HEAD_GROUPS) if (s.char.meshes[g]) s.char.meshes[g].visible = !hide;
        const far = s.char.root.getWorldPosition(_lodV).distanceTo(camera.position) > LOD_FAR;
        if (far) for (const g of DETAIL_GROUPS) if (s.char.meshes[g]) s.char.meshes[g].visible = false;
      }
    }

    /* --------------------------------------------------------- тени --- */
    /* Каскада нет: двигаем ортокамеру солнца за игроком, чтобы карта
       теней всегда покрывала окрестность с высоким разрешением. */
    function updateSun() {
      const p = camera.position;
      sun.position.set(p.x + sunDir.x * 40, sunDir.y * 40 + 6, p.z + sunDir.z * 40);
      sun.target.position.set(p.x, 0, p.z);
      sun.target.updateMatrixWorld();
    }

    /* --------------------------------------------------------- HUD ---- */
    let hudT = 0;
    function updateHUD(dt) {
      hudT += dt;
      const a = active();
      if (a) {
        const c = a.ctrl;
        ui.ammoN.textContent = String(c.ammo);
        ui.ammoN.className = c.ammo === 0 ? 'empty' : (c.ammo <= 5 ? 'low' : '');
        ui.ammoR.textContent = '· ' + c.reserve;
        const st = c.stamina / c.PHYS.staminaMax;
        ui.stamina.classList.toggle('on', st < 0.995);
        ui.staminaBar.style.transform = 'scaleX(' + st.toFixed(3) + ')';
        ui.vig.style.opacity = String(U.clamp01(c.sprint * 0.55 + (1 - st) * 0.25));
      } else {
        ui.stamina.classList.remove('on');
        ui.vig.style.opacity = '0';
      }
    }


    /* Смещение кадра под правую панель: генералы — в центре левой части. */
    function applyViewOffset(dt) {
      const want = S.menu && S.mode === 'free' && !S.spectate ? 1 : 0;
      S.menuK = U.damp(S.menuK, want, 5, dt);
      const off = S.menuK * panelW * 0.5;
      if (off > 0.5) camera.setViewOffset(window.innerWidth, window.innerHeight, off, 0, window.innerWidth, window.innerHeight);
      else if (camera.view && camera.view.enabled) camera.clearViewOffset();
    }

    /* гильза, упавшая на землю — звук */
    fx.onCaseLand = (v) => audio.caseHit(v);

    /* ------------------------------------------------------- кадр ----- */
    /* Шаг симуляции отделён от рендера: автотесты гоняют его фиксированными шагами. */
    function step(dt) {
      if (dt > 0.05) dt = 0.05;
      if (dt <= 0) dt = 1 / 120;
      S.time += dt;
      const t = S.time;
      const control = !S.menu && !blocked();
      const a = active();

      /* 1. ввод и физика */
      if (a) a.ctrl.update(dt, control ? (a.build ? input : Object.assign({}, input, { ads: false })) : {}, control, t);
      else updateFree(dt);

      /* камера стоит дольше IDLE_MENU — меню возвращается */
      if (control && S.mode === 'free') {
        const moving = MOVE.some((k) => input[k]) || S.spaceUp || input.crouch || S.free.vel.lengthSq() > 0.02;
        if (moving) S.idleT = 0;
        else if ((S.idleT += dt) > IDLE_MENU) setMenu(true);
      }

      /* остальные генералы стоят в строю: дыхание, перенос веса, взгляд */
      for (let i = 0; i < squad.length; i++) {
        const s = squad[i];
        if (i === S.activeIdx) { s.wasActive = true; continue; }
        const c = s.ctrl, k = s.idleSeed;
        const swayYaw = Math.sin(t * 0.21 + k) * 0.045 + Math.sin(t * 0.07 + k * 2) * 0.03;
        const swayPitch = Math.sin(t * 0.17 + k * 1.7) * 0.05 - 0.04;
        /* покачивание — вокруг курса, с которым генерала отпустили */
        if (s.wasActive) { s.idleYaw = c.yaw - swayYaw; s.wasActive = false; }
        c.breathT += dt * 0.85;
        c.yaw = U.dampAngle(c.yaw, s.idleYaw + swayYaw, 3, dt);
        c.pitch = U.damp(c.pitch, swayPitch, 3, dt);
        c.update(dt, {}, false, t);
      }

      /* 2-3. поза, оружие, руки */
      for (let i = 0; i < squad.length; i++) {
        const s = squad[i], c = s.ctrl, rig = s.rig;
        const isActive = i === S.activeIdx;
        c.ready = U.damp(c.ready || 0, isActive && s.build ? 1 : 0, 6, dt);
        poseSoldier(s, dt, isActive, t);
        s.char.root.updateMatrixWorld(true);
        const mode = bodycamMode(i);
        /* от первого лица тело скрыто: видны руки рига и оружие */
        s.char.root.visible = mode !== 'fp';
        if (mode) {
          BC.update(dt, s, mode);
          if (mode === 'tp') {
            if (s.build && s.char.hands) {
              const H = BC.handTargets({});
              if (H) {
                rig.handTargets = { R: H.R, L: H.L };
                rig.handPoses = { R: H.poseR, L: H.poseL };
                rig.armPose = null;
                rig.readyAmount = 1;
                rig.adsAmount = c.ads;
                rig.solveArms(null);
              }
            } else if (s.hold) s.hold.update(dt, {});
          }
          continue;
        }
        if (!s.hold) continue;
        /* без бодикама генерал держит оружие сам (GHold) */
        if (isActive) s.hold.setState(c.ads > 0.5 ? 'aim' : 'ready');
        else s.hold.setState(s.build ? 'low' : 'unarmed');
        const far = s.char.root.position.distanceTo(camera.position) > IK_FAR;
        s.hold.update(dt, { yaw: c.yaw, pitch: c.pitch, ik: !far, trigger: isActive ? triggerCurlFor(s) : 0 });
      }

      /* 4. камера */
      updateCamera(dt);
      applyViewOffset(dt);
      if (BC && !(a && !S.tp && !S.spectate)) BC.resetNear();
      /* линза бодикама — только от первого лица: включается плавно, выключается сразу */
      const lensOn = !!(a && BC && !S.tp && !S.spectate);
      lensAmt = lensOn ? U.damp(lensAmt, 1, 10, dt) : 0;
      if (POST && POST.lens) {
        const lu = POST.lens.uniforms;
        POST.lens.enabled = lensAmt > 0.005;
        lu.uAmt.value = lensAmt;
        lu.uTime.value = t;
        if (POST.lens.enabled) lu.uShift.value.copy(BC.measureShift());
      }
      updateSelfVisibility();
      updateSun();
      updateLabels(t);

      /* 5. мир и эффекты */
      updateTargets(dt);
      if (world.grassMat && world.grassMat.userData.sh)
        world.grassMat.userData.sh.uniforms.uTime.value = t;
      fx.update(dt, 0);
      if (control) updateUse(dt);
      else { ui.prompt.classList.remove('on'); S.holdF = 0; }
      updateHUD(dt);
    }

    /* Указательный палец: лежит на спуске, дожимает при выстреле. */
    function triggerCurlFor(s) {
      const c = s.ctrl;
      if (!s.build || (c.ready !== undefined && c.ready < 0.5) || c.fireMode === 'safe') return 0.08;
      const firing = (performance.now() / 1000 - c.lastShot) < 0.06;
      if (firing || (c.triggerHeld && c.ammo > 0)) return 1.08;
      return c.ads > 0.5 && c.sprint < 0.3 ? 0.82 : 0.08;
    }

    /* ------------------------------------------------ настройки ------- */
    function applySettings(p) {
      prof = p;
      cmap = PROF.codeMap(p);
      if (p.settings.quality !== qualityNow) applyQuality(p.settings.quality);
      S.free.fov = p.settings.fov;
      /* бодикам шире: линза «рыбий глаз» съедает края кадра */
      if (BC) BC.P.fov = p.settings.fov + 16;
      if (audio.setVolume) audio.setVolume(p.settings.volume);
      lobby && lobby.refresh();
    }

    lobby = root.GLobby ? root.GLobby.create({
      profile: PROF, toast,
      getSelected: () => S.selected,
      setSelected: (k) => select(k),
      weaponOf: (k) => { const s = squad.find((x) => x.key === k); return s && s.build ? s.wtitle : null; },
      labelOf: (k) => { const s = squad.find((x) => x.key === k); return s ? s.label : null; },
      onSettings: applySettings,
      onModal: (open) => { if (open) releaseAll(); }
    }) : null;
    applySettings(prof);

    /* снаряжение могли поменять в оружейной (возврат «назад», другая вкладка) */
    window.addEventListener('pageshow', (e) => { if (e.persisted) armAll(); });
    window.addEventListener('storage', (e) => { if (e.key === PROF.KEY) { armAll(); applySettings(PROF.load()); } });

    /* ------------------------------------------------- запуск --------- */
    const fromArmory = /[?&]from=armory\b/.test(location.search);
    const armed0 = armAll();
    let frames = 0;
    function onReady() {
      S.ready = true;
      ui.loading.textContent = 'ГОТОВО';
      ui.loader.classList.add('done');
      setTimeout(() => { ui.loader.style.display = 'none'; }, 700);
      lobby && lobby.refresh();
      if (!lobby) return;
      setTimeout(() => {
        if (lobby.tutorial()) return;
        if (fromArmory && S.selected) lobby.armoryHint(S.selected);
      }, 500);
    }

    let prev = performance.now();
    const tick = () => {
      requestAnimationFrame(tick);
      const now = performance.now();
      const dt = (now - prev) / 1000;
      prev = now;
      if (!S.paused) step(dt);
      if (!S.noRender) renderFrame(dt);
      /* загрузка скрывается после первых кадров и сборки оружия (не дольше 15 с) */
      if (++frames === 2) Promise.race([armed0, new Promise((r) => setTimeout(r, 15000))]).then(onReady);
    };
    tick();


    /* ------------------------------------------- отладочные хуки ------ */
    /* Используются автотестами (tools/shots.mjs, headless). */
    window.__GAME = {
      state: S, squad, world, camera, scene, renderer, fx, audio, lobby, PROF,
      /* Прогон симуляции без рендера: n шагов по dt секунд. */
      step: (n, dt) => { for (let i = 0; i < (n || 1); i++) step(dt || 1 / 60); return S.time; },
      ready: () => S.ready,
      /* съёмка проверок: freeze(true) перестаёт рисовать кадры (под SwiftShader
         кадр идёт секунды, и DOM на скриншоте отстаёт), frame() — один кадр */
      freeze: (on) => { S.noRender = !!on; return S.noRender; },
      frame: () => { renderFrame(1 / 60); return true; },
      menu: (on) => { if (on !== undefined) setMenu(on); return S.menu; },
      select, armAll, applySettings,
      profile: () => PROF.load(),
      /* настоящая клавиша: проходит через привязки профиля и перехват лобби */
      key: (code, down) => {
        window.dispatchEvent(new KeyboardEvent(down === false ? 'keyup' : 'keydown', { code, bubbles: true }));
        return { menu: S.menu, mode: S.mode };
      },

      measureDrop: (dists) => {
        const org = new THREE.Vector3(0, 50, 0);           // высоко, чтобы ничего не мешало
        const dir = new THREE.Vector3(0, 0, -1);
        return (dists || [10, 30, 100]).map((d) => {
          /* та же схема интегрирования, что и в traceBullet */
          const vel = dir.clone().multiplyScalar(MUZZLE_VEL);
          const pos = org.clone();
          const h = 1 / 480;
          while (org.z - pos.z < d) {
            const v = vel.length();
            vel.addScaledVector(vel, -DRAG * v * h);
            vel.y -= 9.81 * h;
            pos.addScaledVector(vel, h);
            if (org.y - pos.y > 50) break;
          }
          return { dist: d, drop: +(org.y - pos.y).toFixed(4) };
        });
      },
      /* Прямое управление вводом: lock имитирует захват курсора (в headless его нет). */
      setInput: (o) => {
        if (o.lock !== undefined) { S.pointerLocked = !!o.lock; S.started = true; if (o.lock) setMenu(false); }
        for (const k of ['fwd', 'back', 'left', 'right', 'sprint', 'crouch', 'ads', 'leanL', 'leanR'])
          if (o[k] !== undefined) input[k] = o[k];
        if (o.trigger !== undefined) trigger(!!o.trigger);
        return { locked: S.pointerLocked, input: Object.assign({}, input) };
      },
      info: () => ({
        mode: S.mode, activeIdx: S.activeIdx, selected: S.selected, menu: S.menu, idleT: +S.idleT.toFixed(2),
        score: S.score, quality: qualityNow,
        camera: camera.position.toArray().map((v) => +v.toFixed(3)),
        fov: +camera.fov.toFixed(2), viewOffset: !!(camera.view && camera.view.enabled),
        targets: world.targets.map((t) => ({ d: t.dist, s: t.state, hits: t.hits })),
        squad: squad.map((s) => ({
          key: s.key, weapon: s.build ? s.build.id : null, state: s.hold ? s.hold.state : null,
          pos: s.ctrl.pos.toArray().map((v) => +v.toFixed(3)),
          ammo: s.ctrl.ammo, reserve: s.ctrl.reserve, speed: +s.ctrl.speed.toFixed(3)
        }))
      }),
      /* руки держат оружие: запястья у целей GHold, углы в локтях */
      gripCheck: () => squad.map((s) => {
        const out = { key: s.key, weapon: s.build ? s.build.id : null, state: s.hold ? s.hold.state : null };
        if (!s.hold) return out;
        s.char.root.updateMatrixWorld(true);
        const wp = (n) => s.char.bone(n).getWorldPosition(new THREE.Vector3());
        for (const SS of ['R', 'L']) {
          const tgt = new THREE.Vector3().setFromMatrixPosition(s.hold.handTargets[SS]);
          out['wrist' + SS] = +wp('wrist' + SS).distanceTo(tgt).toFixed(4);
        }
        const ang = (a, b, c) => {
          const u = wp(a).sub(wp(b)).normalize(), v = wp(c).sub(wp(b)).normalize();
          return Math.round(Math.acos(U.clamp(u.dot(v), -1, 1)) * 180 / Math.PI);
        };
        out.elbowR = ang('shoulderR', 'elbowR', 'wristR');
        out.elbowL = ang('shoulderL', 'elbowL', 'wristL');
        return out;
      })
    };


    /* Ручная постановка камеры для съёмки и визуальных проверок:
       __GAME.view([x,y,z], [tx,ty,tz]) — камера в точке, взгляд в цель. */
    window.__GAME.view = (from, to, fov) => {
      S.activeIdx = -1;
      S.mode = 'free';
      const f = new THREE.Vector3().fromArray(from);
      const t = new THREE.Vector3().fromArray(to);
      const dir = new THREE.Vector3().subVectors(t, f).normalize();
      S.free.pos.copy(f);
      S.free.yaw = Math.atan2(-dir.x, -dir.z);
      S.free.pitch = Math.asin(U.clamp(dir.y, -1, 1));
      camRig.pos.copy(f);
      camRig.quat.setFromEuler(new THREE.Euler(S.free.pitch, S.free.yaw, 0, 'YXZ'));
      S.free.fov = fov || prof.settings.fov;
      if (fov) { camRig.fov = fov; camera.fov = fov; camera.updateProjectionMatrix(); }
      return { pos: f.toArray(), yaw: S.free.yaw, pitch: S.free.pitch };
    };

    /* Принудительный вход в бойца — для автотестов и съёмки. */
    window.__GAME.embody = (i) => { embody(i); return S.activeIdx; };
    /* Съёмка: spectate([x,y,z], [tx,ty,tz], fov) ставит внешнюю камеру, не
       отнимая управление у бойца; spectate(null) возвращает обычную.
       pause(true) останавливает симуляцию в кадре — дальше step(n, dt). */
    window.__GAME.spectate = (from, to, fov) => {
      if (!from) { S.spectate = null; return null; }
      const f = new THREE.Vector3().fromArray(from), t = new THREE.Vector3().fromArray(to);
      const m = new THREE.Matrix4().lookAt(f, t, new THREE.Vector3(0, 1, 0));
      S.spectate = { pos: f, quat: new THREE.Quaternion().setFromRotationMatrix(m), fov: fov || 40 };
      updateCamera(0);
      updateSelfVisibility();
      return true;
    };
    window.__GAME.pause = (on) => { S.paused = !!on; return S.paused; };
    window.__GAME.bodycam = BC;
    window.__GAME.setTP = (on) => { S.tp = !!on; return S.tp; };

    window.__GAME.disembody = () => { disembody(); return S.activeIdx; };
    window.__GAME.setPose = (o) => {
      const a = active();
      if (!a) return null;
      if (o.ads !== undefined) a.ctrl.ads = o.ads;
      if (o.yaw !== undefined) a.ctrl.yaw = o.yaw;
      if (o.pitch !== undefined) a.ctrl.pitch = o.pitch;
      if (o.pos) a.ctrl.pos.fromArray(o.pos);
      if (o.crouch !== undefined) a.ctrl.crouch = o.crouch;
      return true;
    };

    return window.__GAME;
  }

  return { main, SPAWN, HOLD_TIME, USE_RANGE };
});
