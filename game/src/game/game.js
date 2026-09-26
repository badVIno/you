/* ============================================================================
   Игровой слой: сцена, четыре бойца, выбор персонажа, камера, баллистика.

   Порядок кадра важен и выдержан строго:
     1) ввод -> контроллер игрока (позиция, отдача, стрельба);
     2) поза бойца (корпус, ноги, голова);
     3) размещение оружия относительно плеча и взгляда;
     4) обратная кинематика рук к рукоятке и цевью;
     5) камера: свободная / от третьего лица / от глаз бойца;
     6) эффекты и рендер.

   Такой порядок гарантирует, что руки всегда держат оружие, а оружие
   всегда согласовано со взглядом: ничего не «летает в воздухе».
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
        if (samples < 2 && A.SMAAPass && !DEV) { smaa = new A.SMAAPass(512, 512); composer.addPass(smaa); }
        const grade = new A.ShaderPass(GRADE_SHADER);
        composer.addPass(grade);
        const post = {
          composer, gtao, grade, smaa,
          apply(L) {
            if (gtao) gtao.blendIntensity = L.ao;
            const u = grade.uniforms;
            u.uSat.value = L.sat; u.uContrast.value = L.contrast; u.uVig.value = L.vignette;
            u.uGrain.value = L.grain; u.uLift.value = L.lift;
            u.uShadowTint.value.fromArray(L.shadowTint); u.uHighTint.value.fromArray(L.highTint);
          },
          resize(w, h) {
            composer.setPixelRatio(renderer.getPixelRatio());
            composer.setSize(w, h);
            grade.uniforms.uRes.value.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
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

    /* ====================================================== бойцы ====== */
    const squad = [];
    for (const sp of SPAWN) {
      const ch = CHAR.build(THREE, sp.key);
      const gy = world.heightAt ? world.heightAt(sp.x, sp.z) : 0;
      ch.root.position.set(sp.x, gy, sp.z);
      ch.root.rotation.y = sp.yaw;
      scene.add(ch.root);

      /* у каждого бойца — свой экземпляр АК-74 */
      const gun = buildGun(THREE);
      scene.add(gun.root);

      const rig = new RIG.Rig(THREE, ch);
      squad.push({
        key: sp.key, char: ch, rig, gun, spawn: sp,
        ctrl: PLAYER.create(THREE, { world, audio, fx }),
        idleSeed: Math.random() * 100,
        active: false
      });
      const last = squad[squad.length - 1];
      last.ctrl.pos.set(sp.x, gy, sp.z);
      last.ctrl.yaw = sp.yaw;
      /* Инерция наводки стартует с фактического курса: при lagYaw = 0 против
         yaw = PI первые полсекунды ствол разворачивало вбок. */
      last.ctrl.lagYaw = sp.yaw;
      last.ctrl.lagPitch = last.ctrl.pitch;
      /* курс, вокруг которого боец переминается без управления */
      last.idleYaw = sp.yaw;
      last.ctrl.magCap = 30;
      /* Реакция на выстрел (трассировка, вспышка, гильза, звук) живёт в
         основном цикле — там уже собраны мир и эффекты. Колбэк ставится в
         startLoop, когда shootRay готов. */
    }

    /* ================================================= состояние игры = */
    const S = {
      mode: 'free',            // free | embodied
      activeIdx: -1,
      candidate: -1,
      holdF: 0,
      score: 0,
      /* свободная камера */
      free: {
        pos: new THREE.Vector3(0, 1.62, 8.4),
        yaw: 0, pitch: -0.05,
        vel: new THREE.Vector3()
      },
      pointerLocked: false,
      started: false,
      time: 0
    };

    /* Активное оружие подключается к системе модулей. */
    /* Комплектация под референс: чёрный полимер вместо дерева — М-LOK цевьё,
       телескопический приклад, штатный ДТК и магазин на 30. Пользователь
       по-прежнему может поменять всё через TAB. */
    Object.assign(ATTACH_STATE.config, {
      muzzle: 'brake_ak', handguard: 'handguard_mlok',
      stock: 'stock_telescopic', mag: 'mag_ak_30'
    });
    let ATTACH_ASM = attachToGun(THREE, squad[0].gun);
    let attachedTo = 0;

    /* ====================================================== ввод ====== */
    const input = {
      fwd: 0, back: 0, left: 0, right: 0, up: 0, down: 0,
      sprint: false, crouch: false, ads: false, leanL: false, leanR: false
    };
    const keyMap = {
      KeyW: 'fwd', KeyS: 'back', KeyA: 'left', KeyD: 'right',
      ArrowUp: 'fwd', ArrowDown: 'back', ArrowLeft: 'left', ArrowRight: 'right'
    };

    const dom = renderer.domElement;
    const el = (id) => document.getElementById(id);
    const ui = {
      start: el('start'), startGo: el('startGo'), loading: el('loading'),
      ammoN: el('ammoN'), ammoR: el('ammoR'), mode: el('mode'),
      whoName: el('whoName'), whoSide: el('whoSide'), who: el('who'),
      prompt: el('prompt'), promptLbl: el('promptLbl'), promptSub: el('promptSub'),
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

    /* Панель модулей забирает TAB себе; пока она открыта, мышь свободна. */
    let custOpen = false;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') { e.preventDefault(); }
      if (keyMap[e.code]) { input[keyMap[e.code]] = 1; return; }
      switch (e.code) {
        case 'ShiftLeft': case 'ShiftRight': input.sprint = true; break;
        case 'ControlLeft': case 'KeyC': input.crouch = true; break;
        case 'KeyQ': input.leanL = true; break;
        case 'KeyE': input.leanR = true; break;
        case 'KeyF': if (!e.repeat) S.fDown = true; break;
        case 'KeyR': if (!e.repeat) doReload(); break;
        case 'KeyV': if (!e.repeat) doInspect(); break;
        case 'KeyT': if (!e.repeat) S.tp = !S.tp; break;
        case 'Escape': document.exitPointerLock && document.exitPointerLock(); break;
        default: break;
      }
    });
    window.addEventListener('keyup', (e) => {
      if (keyMap[e.code]) { input[keyMap[e.code]] = 0; return; }
      switch (e.code) {
        case 'ShiftLeft': case 'ShiftRight': input.sprint = false; break;
        case 'ControlLeft': case 'KeyC': input.crouch = false; break;
        case 'KeyQ': input.leanL = false; break;
        case 'KeyE': input.leanR = false; break;
        case 'KeyF': S.fDown = false; break;
        default: break;
      }
    });

    /* Режим огня (X) прокидывается в систему модулей исходника. */
    window.__cycleFireMode = () => {
      const a = active();
      if (!a) return;
      const m = a.ctrl.cycleFireMode();
      const NAME = { safe: 'ПРЕДОХРАНИТЕЛЬ', auto: 'АВТО', semi: 'ОДИНОЧНЫЙ' };
      ui.mode.textContent = NAME[m];
      toast(NAME[m], 1100);
    };

    dom.addEventListener('mousedown', (e) => {
      if (!S.started) return;
      if (!S.pointerLocked && !custOpen) { dom.requestPointerLock(); return; }
      if (e.button === 0) { const a = active(); a && a.ctrl.pullTrigger(true); }
      if (e.button === 2) input.ads = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) { const a = active(); a && a.ctrl.pullTrigger(false); }
      if (e.button === 2) input.ads = false;
    });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());

    const SENS = 0.00155;
    window.addEventListener('mousemove', (e) => {
      if (!S.pointerLocked) return;
      const dx = e.movementX || 0, dy = e.movementY || 0;
      const a = active();
      if (a) a.ctrl.look(dx, dy, SENS);
      else {
        S.free.yaw -= dx * SENS;
        S.free.pitch = clamp(S.free.pitch - dy * SENS, -1.4, 1.4);
      }
    });

    document.addEventListener('pointerlockchange', () => {
      S.pointerLocked = document.pointerLockElement === dom;
      if (!S.pointerLocked) {
        const a = active();
        a && a.ctrl.pullTrigger(false);
        input.ads = false;
      }
    });

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      if (POST) POST.resize(window.innerWidth, window.innerHeight);
    });

    /* --------------------------------------------------- вспомогательное */
    const active = () => (S.activeIdx >= 0 ? squad[S.activeIdx] : null);

    function doReload() {
      const a = active();
      if (!a) return;
      if (a.ctrl.startReload()) toast('ПЕРЕЗАРЯДКА', 900);
      else if (a.ctrl.reserve <= 0) toast('НЕТ ПАТРОНОВ', 1200);
    }
    function doInspect() {
      const a = active();
      if (a) a.ctrl.startInspect();
    }

    /* Свободная камера летает между бойцами: плавный разгон, без коллизий
       с травой, но с ограничением по высоте и границам участка. */
    function updateFree(dt) {
      const f = S.free;
      const speed = (input.sprint ? 9.5 : 4.2);
      let wx = 0, wz = 0, wy = 0;
      if (input.fwd) wz -= 1;
      if (input.back) wz += 1;
      if (input.left) wx -= 1;
      if (input.right) wx += 1;
      if (input.crouch) wy -= 1;              // Ctrl/C — вниз
      if (S.spaceUp) wy += 1;                 // пробел — вверх
      /* Летим туда, куда смотрим: строим базис камеры из её же кватерниона,
         а не вручную из синусов. Ручная раскладка раньше путала знак yaw
         (W уводил назад) и дробила pitch на отдельные слагаемые. */
      const want = new THREE.Vector3();
      const len = Math.hypot(wx, wz);
      if (len > 0) {
        const q = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(f.pitch, f.yaw, 0, 'YXZ'));
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
        want.addScaledVector(fwd, (-wz / len) * speed)
          .addScaledVector(right, (wx / len) * speed);
      }
      want.y += wy * speed * 0.9;
      f.vel.lerp(want, 1 - Math.exp(-9 * dt));
      f.pos.addScaledVector(f.vel, dt);
      const gy = world.heightAt ? world.heightAt(f.pos.x, f.pos.z) : 0;
      f.pos.y = clamp(f.pos.y, gy + 0.45, 22);
      f.pos.x = clamp(f.pos.x, -28, 28);
      f.pos.z = clamp(f.pos.z, -33, 33);
    }

    /* ================================================== выбор бойца === */
    /* Кандидат — ближайший боец в конусе взгляда на дистанции USE_RANGE.
       В режиме управления кандидатом может быть только ДРУГОЙ боец. */
    const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
    function findCandidate() {
      const eye = camera.getWorldPosition(_v1);
      const dir = camera.getWorldDirection(_v2);
      let best = -1, bestScore = -1;
      for (let i = 0; i < squad.length; i++) {
        if (i === S.activeIdx) continue;
        const s = squad[i];
        const p = s.ctrl.pos;
        const dx = p.x - eye.x, dz = p.z - eye.z;
        const dy = (p.y + 1.1) - eye.y;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > USE_RANGE) continue;
        const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / (dist || 1);
        if (dot < 0.35) continue;             // нужно смотреть примерно на него
        const score = dot / Math.max(0.4, dist);
        if (score > bestScore) { bestScore = score; best = i; }
      }
      return best;
    }

    function embody(idx) {
      const prev = active();
      if (prev) {
        prev.active = false;
        prev.ctrl.pullTrigger(false);
        prev.ctrl.ads = 0;
      }
      S.activeIdx = idx;
      const a = squad[idx];
      a.active = true;
      /* система модулей переезжает на оружие нового бойца */
      ATTACH_ASM = attachToGun(THREE, a.gun);
      attachedTo = idx;
      syncAmmoCap();
      audio.resume();
      audio.ui(true);
      audio.gearRattle(1);
      const P = a.char.preset;
      ui.who.className = P.faction;
      ui.whoName.textContent = P.name;
      ui.whoSide.textContent = (P.faction === 'delta' ? 'ДЕЛЬТА' : 'АЛЬФА') + ' · ' + P.callsign.toUpperCase();
      toast('УПРАВЛЕНИЕ: ' + P.name, 1500);
      S.mode = 'embodied';
    }

    function disembody() {
      const a = active();
      if (!a) return;
      /* Свободная камера появляется там, где стоял боец, чуть в стороне. */
      const f = S.free;
      f.yaw = a.ctrl.yaw;
      f.pitch = clamp(a.ctrl.pitch, -0.6, 0.4);
      const back = 1.5;
      f.pos.set(
        a.ctrl.pos.x + Math.sin(f.yaw) * back,
        a.ctrl.pos.y + 1.72,
        a.ctrl.pos.z + Math.cos(f.yaw) * back
      );
      f.vel.set(0, 0, 0);
      a.active = false;
      a.ctrl.pullTrigger(false);
      S.activeIdx = -1;
      S.mode = 'free';
      audio.ui(false);
      ui.who.className = '';
      ui.whoName.textContent = '—';
      ui.whoSide.textContent = 'СВОБОДНАЯ КАМЕРА';
      toast('СВОБОДНАЯ КАМЕРА', 1300);
    }

    function syncAmmoCap() {
      const a = active();
      if (!a) return;
      const cap = (ATTACH_ASM && ATTACH_ASM.derived && ATTACH_ASM.derived.magCap) || 30;
      a.ctrl.magCap = cap;
      if (a.ctrl.ammo > cap) a.ctrl.ammo = cap;
    }

    /* Удержание F: заполняем индикатор, по завершении — переключение. */
    function updateUse(dt) {
      const cand = findCandidate();
      S.candidate = cand;
      const inRange = cand >= 0;
      const canExit = S.mode === 'embodied';

      /* Подсказка показывается только когда рядом есть другой боец.
         Раньше «ОТПУСТИТЬ ОПЕРАТОРА» висело посреди экрана постоянно и
         перекрывало прицеливание. Выйти по-прежнему можно в любой момент —
         просто без назойливой плашки: об этом сказано на экране старта. */
      let showPrompt = false, lbl = '', sub = '';
      if (inRange) {
        showPrompt = true;
        lbl = 'ВЗЯТЬ: ' + squad[cand].char.preset.name;
        sub = 'удерживайте F';
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

      /* Во время удержания F вне зоны бойца показываем индикатор выхода —
         он появляется по факту нажатия, а не висит всё время. */
      const exiting = !showPrompt && canExit && S.holdF > 0.02;
      ui.prompt.classList.toggle('on', (showPrompt || exiting) && !custOpen);
      if (showPrompt || exiting) {
        if (exiting) { lbl = 'ОТПУСТИТЬ ОПЕРАТОРА'; sub = 'удерживайте F'; }
        ui.promptLbl.textContent = lbl;
        ui.promptSub.textContent = sub;
        ui.promptFill.style.transform = 'scaleY(' + (S.holdF / HOLD_TIME).toFixed(3) + ')';
      }
    }

    const G = startLoop({
      THREE, renderer, scene, camera, world, fx, audio, squad, sun, sunDir, renderFrame,
      S, input, ui, toast, active, updateFree, updateUse, syncAmmoCap,
      getAsm: () => ATTACH_ASM, setAsm: (v) => { ATTACH_ASM = v; },
      setCustOpen: (v) => { custOpen = v; }, isCustOpen: () => custOpen,
      SENS, embodyFn: embody, disembodyFn: disembody
    });
    /* подбор картинки из консоли: __GAME.look({ exposure: 1.1, fogDensity: 0.03 }) */
    G.look = (o) => { Object.assign(LOOK, o || {}); applyLook(); return Object.assign({}, LOOK, { post: !!POST }); };
    G.post = () => POST;
    return G;
  }

  /* ==================================================== ОРУЖИЕ ========= */
  /* Каждому бойцу собирается свой АК-74 из вендорного кода. Система
     модулей (TAB) глобальная и управляет тем экземпляром, который сейчас
     в руках у игрока: остальные остаются в базовой конфигурации. */
  function buildGun(THREE) {
    const mount = new THREE.Group();        // узел «оружие в руках»
    mount.name = 'weaponMount';
    const recoilRig = new THREE.Group();    // отход назад
    const tiltRig = new THREE.Group();      // подброс ствола
    mount.add(recoilRig);
    recoilRig.add(tiltRig);

    const gun = buildAK74(THREE, {});
    tiltRig.add(gun);

    /* Группа магазина участвует в скрытии: её помечаем, как в исходнике. */
    if (gun.parts.magazine) gun.parts.magazine.userData.__occGroup = 'magazine';

    gun.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

    return {
      root: mount, recoilRig, tiltRig, gun,
      nodes: gun.nodes, dirs: gun.dirs, parts: gun.parts, anim: gun.anim,
      attachRoot: null,
      /* локальные (в системе оружия) точки, м */
      muzzleLocal: new THREE.Vector3().copy(gun.nodes.muzzle.position),
      ejectLocal: new THREE.Vector3().copy(gun.nodes.caseSpawn.position)
    };
  }

  /* Система модулей подключается к активному оружию: она глобальная,
     поэтому при смене бойца пересобираем её на новом экземпляре. */
  function attachToGun(THREE, wep) {
    if (typeof attachRebuild !== 'function') return null;
    if (ATTACH_STATE.view && ATTACH_STATE.view.root.parent)
      ATTACH_STATE.view.root.parent.remove(ATTACH_STATE.view.root);

    const weapon = {
      caliber: ATTACH_DEF.caliber, weight: ATTACH_DEF.weight,
      ballistics: ATTACH_DEF.ballistics, stats: {}, base: [],
      nodes: {}, slots: attachSlots()
    };
    const asm = __ATTACH.SYS.assemble(weapon, __ATTACH.REG, ATTACH_STATE.config);
    const parentFor = (slotKey) => (slotKey === 'mag' ? wep.parts.magazine : null);
    const view = __ATTACH.ADAPTER.build(THREE, asm, {
      scale: 0.001, parentFor, hostRoot: wep.gun
    });
    view.root.traverse((o) => {
      o.userData.attachModule = true;
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    wep.gun.add(view.root);
    ATTACH_STATE.asm = asm;
    ATTACH_STATE.view = view;
    attachOcclude(THREE, wep.gun);
    attachSyncBeams();
    attachSyncDeploy();
    wep.attachRoot = view.root;
    return asm;
  }

  /* ==================================================== ОСНОВНОЙ ЦИКЛ = */
  function startLoop(C) {
    const { THREE, renderer, scene, camera, world, fx, audio, squad, sun,
      S, input, ui, toast, active, updateFree, updateUse, syncAmmoCap } = C;
    const clamp = U.clamp;

    /* ------------------------------------------------- поза бойца ----- */
    /* Кости расставляются каждый кадр «с нуля»: базовая стойка + дельты от
       движения, приседа, наклона и дыхания. Затем руки решаются IK. */
    const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

    function poseSoldier(s, dt, isActive, t) {
      const c = s.ctrl, ch = s.char, rig = s.rig, M = ch.metrics;
      const b = (n) => ch.bone(n);
      const LOCO = root.GLoco;
      /* стойка и манера у каждого бойца своя (anim/locomotion.js) */
      const st = s.stance || (s.stance = LOCO.stanceFor(s.idleSeed));
      const g = LOCO.gait(c, M, st);

      /* --- корпус --- */
      const moveAmt = U.clamp01(c.speed / c.PHYS.sprint);
      const breath = Math.sin(c.breathT * 1.5) * 0.5 + Math.sin(c.breathT * 0.73) * 0.5;
      const breathAmp = U.lerp(0.006, 0.026, 1 - c.stamina / c.PHYS.staminaMax);
      /* «жизнь» в строю: вес переходит с ноги на ногу, голова оглядывается */
      const still = 1 - g.gaitK;
      const life = LOCO.idleLife(t, s.idleSeed, st);
      const idleK = isActive ? still * 0.35 : still;
      const shift = life.shift * idleK;

      /* Наклон вперёд: под бронёй корпус всегда чуть завален, на бегу —
         сильнее (центр масс впереди опоры). */
      const lean = 0.06 + g.lean + c.crouch * 0.18;
      const sideLean = -c.lean * 0.26;

      /* Разворот корпуса (bladed stance) — только в стрелковой стойке;
         в строю «на ремне» боец стоит к цели грудью. */
      const kStance = U.smoothstep(c.ready === undefined ? (isActive ? 1 : 0) : c.ready);
      const blade = U.lerp(0.52, 0.46, U.smoothstep(c.ads)) * (1 - U.smoothstep(c.sprint) * 0.55)
        * U.lerp(0.06, 1, kStance);
      const crouchDrop = c.crouch * (M.hipY - 0.50);

      ch.root.position.set(c.pos.x, c.pos.y, c.pos.z);
      ch.root.rotation.y = c.yaw;

      const hips = b('hips');
      hips.position.set(g.sway * 0.5 + shift * 0.028, M.hipY - crouchDrop + g.bob - Math.abs(shift) * 0.008, 0);
      hips.rotation.set(
        lean * 0.35 + c.crouch * 0.22,
        -blade * 0.30 + g.pelvisYaw,
        sideLean * 0.4 + g.pelvisRoll - shift * 0.045
      );
      /* позвоночник несёт наклон; грудь отвечает тазу встречным поворотом */
      b('spine').rotation.set(lean * 0.40 + breath * breathAmp * 0.5,
        -blade * 0.26 + g.chestYaw * 0.45, sideLean * 0.35 + shift * 0.03);
      b('chest').rotation.set(lean * 0.30 - c.ads * 0.05 + breath * breathAmp,
        -blade * 0.44 + g.chestYaw * 0.55, sideLean * 0.45 + shift * 0.02);

      /* Голова держит взгляд по оси прицеливания и гасит качку корпуса;
         в строю — медленно оглядывается. */
      const totalLean = lean * 0.70;
      const bladeComp = blade * 0.70 - g.chestYaw * 0.8;
      const look = isActive ? 0 : life.look;
      b('neck').rotation.set(clamp(c.pitch * 0.34 - totalLean * 0.5, -0.5, 0.5), bladeComp * 0.40 + look * 0.4, 0);
      b('head').rotation.set(clamp(c.pitch * 0.55 - totalLean * 0.5 + (isActive ? 0 : life.nod), -0.7, 0.62),
        bladeComp * 0.60 + look * 0.6, -sideLean * 0.3 + (isActive ? 0 : st.headTilt));

      /* --- ноги: ключевые кривые шага и бега (anim/locomotion.js) ---
         Знаки: hip.x > 0 — бедро вперёд; knee.x < 0 — сгиб колена;
         ankle.x > 0 — носок вверх относительно голени. В опоре голеностоп
         тянется к углу, при котором подошва лежит ровно. */
      const plant = {};
      for (const side of [1, -1]) {
        const SS = side > 0 ? 'R' : 'L';
        const Lg = g.legs[SS];
        plant[SS] = Lg.plant;
        /* нагруженная нога в строю прямее, свободная — согнута */
        const load = side > 0 ? shift : -shift;
        const tonus = st.bend * (1 - g.gaitK) * (1 - load * 0.6) + 0.04 + c.crouch * 1.15;
        const hipX = Lg.hip - c.crouch * 0.85 - 0.02 - tonus * 0.45;
        const kneeX = Lg.knee + tonus;
        const flat = kneeX - hipX;                 // подошва ровно при таком сгибе
        const ankleX = U.lerp(Lg.ankle + tonus * 0.2, flat, Lg.plant * 0.75) + 0.02;
        b('hip' + SS).rotation.set(hipX, side * (0.04 + st.toeOut * 0.3), side * (st.width + 0.01 - load * 0.02));
        b('knee' + SS).rotation.set(-kneeX, 0, 0);
        b('ankle' + SS).rotation.set(ankleX, side * st.toeOut * 0.5, -side * (st.width * 0.6));
        b('toe' + SS).rotation.set(Lg.toe, 0, 0);
        /* протракция ключицы опорной руки: плечо выходит к цевью */
        const protract = side < 0 ? -blade * 0.34 : -blade * 0.10;
        b('clav' + SS).rotation.set(0, protract, -side * (0.05 + c.ads * 0.05));
      }

      /* стопы — на грунт (см. Rig.plantFeet) */
      rig.plantFeet(c.groundAt, plant);

      return { moveAmt, breath, lean, blade, gait: g };
    }

    /* --------------------------------------- размещение оружия -------- */
    /* Оружие висит на «виртуальном плече»: точка перед грудью, которая
       следует за взглядом с запаздыванием. Это и есть бодикам-механика:
       ствол всегда чуть отстаёт от поворота головы и качается на шаге. */
    /* Позы оружия — смещение узла оружия от глаз в системе взгляда (м).
       Начало координат модели АК — у затыльника, ствол уходит в -Z, поэтому
       чем меньше |z|, тем ближе оружие прижато к стрелку. Значения подобраны
       так, чтобы приклад лёг в плечо, а цевьё осталось в зоне досягаемости
       опорной руки (проверяется автотестом gripCheck). */
    /* Оружие держится ДАЛЬШЕ от груди, чем было: при z = -0,085 приклад
       упирался в бойца, правая кисть уезжала к плечу и локоть складывался
       до 39°, чего у человека быть не может. Вынос вперёд даёт рабочие
       70–95° в локте (проверяется gripCheck). */
    /* Положение «наготове». Глубина (z) ограничена длиной опорной руки:
       при z ниже -0,13 кисть не достаёт до цевья (расчёт в комментарии к
       bladed stance). Высота -0,30 уводит оружие из поля зрения: при -0,20
       ствол и предплечье перекрывали пол-экрана. */
    const HIP_POSE = {
      pos: new THREE.Vector3(0.125, -0.300, -0.105),
      rot: new THREE.Euler(-0.05, -0.18, 0.06)
    };
    const ADS_POSE = {
      pos: new THREE.Vector3(0, -0.030, -0.060),
      rot: new THREE.Euler(0, 0, 0)
    };
    const RELOAD_POSE = {
      pos: new THREE.Vector3(0.145, -0.375, -0.090),
      rot: new THREE.Euler(0.30, -0.42, 0.24)
    };
    /* Строй «на ремне» задаётся не от глаз, а от ГРУДИ — как на референсе:
       автомат лежит поперёк корпуса по диагонали, приклад у правой грудной,
       ствол смотрит к левому колену, правый бок оружия — наружу.
       Точки — места кистей в системе покоя бойца (м): правая на рукоятке
       на уровне нижних рёбер, левая на цевье у пряжки ремня. Оружие ставится
       так, чтобы его точки хвата легли ровно в них, поэтому поза не зависит
       от цевья и длины оружия. out — куда смотрит правый бок оружия. */
    /* right — место ПРАВОГО ЗАПЯСТЬЯ: кисть охватывает пистолетную
       рукоятку, запястье — за ней (см. hands.js). */
    const SLING = {
      right: new THREE.Vector3(0.125, 1.330, -0.205),
      barrel: new THREE.Vector3(-0.64, -0.74, -0.17),
      out: new THREE.Vector3(0.20, 0.10, -1)
    };
    /* Бег: автомат прижат к груди стволом вниз — дуло смотрит в землю
       перед левой ногой, приклад у правой грудной. Так бегут с оружием
       (low ready): ствол никуда не направлен и не мешает ногам. */
    const SPRINT = {
      right: new THREE.Vector3(0.118, 1.345, -0.215),
      barrel: new THREE.Vector3(-0.26, -0.88, -0.40),
      out: new THREE.Vector3(0.42, 0.06, -0.9)
    };
    const _sl = {
      m: new THREE.Matrix4(), q: new THREE.Quaternion(), q2: new THREE.Quaternion(),
      a: new THREE.Vector3(), c: new THREE.Vector3(), r: new THREE.Vector3()
    };
    /* Точка хвата в системе узла оружия (w.root) — та же, что берёт риг. */
    function gripLocal(w, G, side, out) {
      const node = w.gun.getObjectByName(G.node) || w.gun;
      w.root.updateMatrixWorld(true);
      const inv = _sl.m.copy(w.root.matrixWorld).invert();
      out.setFromMatrixPosition(node.matrixWorld).applyMatrix4(inv);
      const rel = _sl.q2.copy(w.root.getWorldQuaternion(_sl.q)).invert()
        .multiply(w.gun.getWorldQuaternion(new THREE.Quaternion()));
      return out.add(_sl.a.set(G.offset[0] * side, G.offset[1], G.offset[2]).applyQuaternion(rel));
    }
    /* Точка правого запястья в системе w.root — та же, что ставит риг. */
    function wristLocal(s, out) {
      const H = root.GHands, w = s.gun;
      if (!H) return gripLocal(w, RIG.GRIP.right, 1, out);
      const rest = s.char.rest, mw = rest.middleR1, ww = rest.wristR;
      w.root.updateMatrixWorld(true);
      const hp = H.handPose(THREE, H.GRIPS.pistol, 1, w.gun, [mw[0] - ww[0], mw[1] - ww[1], mw[2] - ww[2]], _sl.hp || (_sl.hp = {}));
      return out.copy(hp.pos).applyMatrix4(_sl.m.copy(w.root.matrixWorld).invert());
    }
    function slingCarry(s, spec) {
      const SP = spec || SLING;
      const w = s.gun, chest = s.char.bone('chest'), rest = s.char.rest.chest;
      chest.updateMatrixWorld(true);
      const R = SP.right;
      const RH = chest.localToWorld(_sl.c.set(R.x - rest[0], R.y - rest[1], R.z - rest[2])).clone();
      const cq = chest.getWorldQuaternion(new THREE.Quaternion());
      const rL = wristLocal(s, _sl.r);
      /* базис (ствол, правый бок) оружия -> тот же базис в системе груди */
      const basis = (f, x) => {
        f.normalize();
        x.addScaledVector(f, -x.dot(f)).normalize();
        return new THREE.Matrix4().makeBasis(f, x, new THREE.Vector3().crossVectors(f, x));
      };
      const Bl = basis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0));
      const Bw = basis(SP.barrel.clone().applyQuaternion(cq), SP.out.clone().applyQuaternion(cq));
      const quat = new THREE.Quaternion().setFromRotationMatrix(Bw.multiply(Bl.invert()));
      const pos = RH.sub(rL.clone().applyQuaternion(quat));
      return { pos, quat };
    }

    /* Ось прицеливания АК-74 по обмеру модели: целик и мушка на y=116 мм.
       Чтобы в прицеле мушка легла в прорезь, глаз ставится на продолжение
       этой линии позади целика. */
    const IRON = {
      rear: new THREE.Vector3(0, 0.116, -0.2485),
      front: new THREE.Vector3(0, 0.116, -0.626),
      /* Вынос глаза за целик, м. Реальный вынос на АК — около 0,30 м. */
      relief: 0.300,
      /* Небольшой подъём глаза над прицельной линией: щека лежит на гребне
         приклада, а взгляд идёт чуть сверху через прорезь целика. */
      rise: 0.010
    };
    /* Дистанция сведения ствола с линией взгляда, м. Соответствует
       постоянному прицелу АК-74: на этой дальности пуля идёт точно в точку
       прицеливания. */
    const CONVERGE = 100;

    function placeWeapon(s, dt, isActive, camPos, camQuat, pose) {
      const c = s.ctrl, w = s.gun;
      const moveAmt = pose.moveAmt;

      /* Инерция наводки: сглаженные yaw/pitch отстают от реальных. */
      c.lagYaw = U.dampAngle(c.lagYaw, c.yaw, U.lerp(11, 20, c.ads), dt);
      c.lagPitch = U.damp(c.lagPitch, c.pitch, U.lerp(12, 22, c.ads), dt);

      /* смесь póz: бедро -> прицел, плюс спринт и перезарядка */
      const kAds = U.smoothstep(c.ads);
      const kSprint = U.smoothstep(c.sprint);
      const kReload = c.reload >= 0 ? U.smoothstep(U.clamp01(c.reload / 0.25)) *
        U.smoothstep(U.clamp01((( c.reloadWasEmpty ? c.PHYS && 3.05 : 2.45) - c.reload) / 0.3)) : 0;

      /* Неуправляемый боец стоит в положении «на ремне», управляемый —
         держит оружие наготове. Переход плавный: сглаженная величина ready
         живёт в контроллере и меняется при захвате/освобождении. */
      c.ready = U.damp(c.ready === undefined ? (isActive ? 1 : 0) : c.ready,
        isActive ? 1 : 0, 6, dt);
      const kReady = U.smoothstep(c.ready);
      /* строй «на ремне» подмешивается в конце (slingCarry), от груди */
      const p = new THREE.Vector3().copy(HIP_POSE.pos);
      const r = new THREE.Euler(HIP_POSE.rot.x, HIP_POSE.rot.y, HIP_POSE.rot.z);
      const mixPose = (target, k) => {
        if (k <= 0.001) return;
        p.lerp(target.pos, k);
        r.x = U.lerp(r.x, target.rot.x, k);
        r.y = U.lerp(r.y, target.rot.y, k);
        r.z = U.lerp(r.z, target.rot.z, k);
      };
      mixPose(ADS_POSE, kAds);
      /* спринт больше не крутит оружие от глаз (дуло уходило вправо):
         его поза — от груди, см. SPRINT ниже */
      mixPose(RELOAD_POSE, kReload * (1 - kAds));

      /* покачивание от шага: оружие ходит по «восьмёрке» */
      const bob = U.lerp(0.9, 0.22, kAds) * (1 - kSprint * 0.3);
      p.x += Math.sin(c.bobPhase) * 0.017 * moveAmt * bob;
      p.y += Math.sin(c.bobPhase * 2 + 0.5) * 0.013 * moveAmt * bob;
      p.z += Math.sin(c.bobPhase * 2) * 0.008 * moveAmt * bob;

      /* дыхание: медленное плавание ствола, заметное в прицеле */
      const brAmp = U.lerp(0.0016, 0.0075, 1 - c.stamina / c.PHYS.staminaMax) * U.lerp(1, 1.5, kAds);
      p.x += Math.sin(c.breathT * 0.9) * brAmp;
      p.y += Math.sin(c.breathT * 1.5 + 1.1) * brAmp * 1.3;

      /* инерция поворота: ствол «отстаёт» и качается */
      const lagY = U.wrapPI(c.lagYaw - c.yaw);
      const lagP = c.lagPitch - c.pitch;
      r.y += clamp(lagY * U.lerp(1.5, 0.45, kAds), -0.5, 0.5);
      r.x += clamp(-lagP * U.lerp(1.2, 0.35, kAds), -0.4, 0.4);
      r.z += clamp(lagY * U.lerp(1.1, 0.25, kAds), -0.35, 0.35);
      p.x += clamp(-lagY * 0.10, -0.05, 0.05);
      p.y += clamp(lagP * 0.06, -0.04, 0.04);

      /* наклон корпуса Q/E */
      r.z += c.lean * 0.10;
      p.x += c.lean * 0.035;

      /* осмотр оружия (V): поворот в руках */
      if (c.inspect >= 0) {
        const u = U.clamp01(c.inspect / 2.3);
        const env = Math.sin(Math.PI * u);
        r.y += env * 0.95;
        r.z += env * 0.55;
        r.x += env * 0.30;
        p.y += env * 0.045;
        p.z += env * 0.075;
      }

      /* В прицеле «характерные» углы удержания почти полностью гасятся:
         приклад в плече, щека на гребне — оружие жёстко зафиксировано.
         Остаётся лишь малая доля, чтобы дыхание и шаг всё же читались. */
      if (kAds > 0.001) {
        const keep = U.lerp(1, 0.10, kAds);
        r.x *= keep; r.y *= keep; r.z *= keep;
      }

      /* --- итоговый трансформ в мировых координатах --- */
      /* База: точка глаз бойца с его ориентацией взгляда. */
      const eyeQ = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(c.pitch, c.yaw, c.lean * -0.10, 'YXZ'));
      const eyePos = eyePosition(s);

      /* Базис УДЕРЖАНИЯ отличается от базиса ВЗГЛЯДА.

         Раньше оружие подвешивалось прямо к взгляду, поэтому при наклоне
         головы вниз оно ныряло внутрь бойца: игрок смотрел под ноги и видел
         ствол, торчащий из собственной груди.

         У человека так не бывает: голова поворачивается в шее свободно, а
         оружие держат РУКИ, привязанные к корпусу. Корпус доворачивается
         вслед за взглядом лишь частично и в ограниченном диапазоне. Поэтому
         от бедра берём долю наклона, а в прицеле — полный: там щека на
         прикладе, и голова с оружием действительно составляют одно целое. */
      const carryPitch = U.lerp(
        clamp(c.pitch * 0.42, -0.42, 0.34), c.pitch, U.smoothstep(kAds));
      const holdBaseQ = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(carryPitch, c.yaw, c.lean * -0.10, 'YXZ'));

      /* Сведение оружия.
         Ствол вынесен вправо-вниз от глаза, поэтому если просто повернуть
         его параллельно взгляду, пули уйдут мимо точки прицеливания. Как и
         на реальном оружии, ось канала ствола сводится со линией взгляда на
         дистанции пристрелки: тогда куда смотрю — туда и попадаю, а сама
         модель остаётся правдоподобно смещённой.

         Углы позы (r) после этого — только «характер» удержания: увод от
         инерции, покачивание, наклон. Разворот на 15° вбок, из-за которого
         пули летели криво, больше не применяется к оси ствола. */

      /* Ориентация удержания. В прицеле углы «характера» гасятся: оружие
         должно встать ровно по линии взгляда, иначе целик уедет вбок. */
      const holdQ = holdBaseQ.clone().multiply(new THREE.Quaternion().setFromEuler(
        new THREE.Euler(r.x, r.y, r.z, 'YXZ')));
      w.root.quaternion.copy(holdQ);

      /* Положение. От бедра — заданное смещение от глаза. В прицеле
         считаем иначе: берём точку выноса глаза на оси целик-мушка и
         двигаем оружие так, чтобы она совпала с глазом. Смещение
         поворачивается УЖЕ СОБРАННЫМ кватернионом оружия — раньше здесь
         стоял кватернион взгляда, и остаточный поворот позы уводил целик
         в сторону (те самые 1,9°). */
      /* Точка подвеса тоже считается в базисе удержания: иначе оружие
         осталось бы висеть перед глазами и «ездило» бы по экрану. */
      const hipPos = eyePos.clone().add(p.clone().applyQuaternion(holdBaseQ));
      let worldPos = hipPos;
      if (kAds > 0.001) {
        const axis = new THREE.Vector3().subVectors(IRON.rear, IRON.front).normalize();
        const eyeLocal = IRON.rear.clone().addScaledVector(axis, IRON.relief);
        eyeLocal.y += IRON.rise;
        const adsPos = eyePos.clone()
          .sub(eyeLocal.clone().applyQuaternion(w.root.quaternion));
        worldPos = hipPos.lerp(adsPos, kAds);
      }
      w.root.position.copy(worldPos);
      w.root.updateMatrixWorld(true);

      /* ...а затем доворачиваем оружие так, чтобы ствол смотрел в точку
         сведения на линии взгляда. Доворот считается от фактического
         положения дульного среза, поэтому работает при любой позе. */
      const conv = eyePos.clone().addScaledVector(
        new THREE.Vector3(0, 0, -1).applyQuaternion(eyeQ), CONVERGE);
      const muzzleW = w.gun.localToWorld(w.muzzleLocal.clone());
      const wantDir = conv.clone().sub(muzzleW).normalize();
      const curDir = new THREE.Vector3(0, 0, -1)
        .applyQuaternion(w.gun.getWorldQuaternion(new THREE.Quaternion())).normalize();
      /* от бедра сводим лишь частично: оружие у пояса и не должно выглядеть
         «вклеенным» в центр экрана, а в прицеле — точно по оси */
      const aimK = U.lerp(0.82, 1.0, kAds) * kReady;
      const align = new THREE.Quaternion().setFromUnitVectors(curDir, wantDir);
      if (aimK < 1) {
        align.slerp(new THREE.Quaternion(), 1 - aimK);
      }
      /* Предел доворота от бедра.

         Сведение тянет ствол в точку прицеливания, и без ограничителя оно
         возвращало ровно ту проблему, ради которой оружие сняли со взгляда:
         глядя под ноги, боец доворачивал ствол на 70° вниз и загонял его
         себе в грудь. Человек так не делает — он опускает голову, а оружие
         остаётся перед корпусом. Поэтому от бедра доворот ограничен 14°;
         в прицеле ограничение снимается, там ствол обязан стоять точно по
         линии прицеливания. */
      const maxTurn = U.lerp(0.25, Math.PI, U.smoothstep(kAds));
      const turn = 2 * Math.acos(clamp(Math.abs(align.w), -1, 1));
      if (turn > maxTurn) align.slerp(new THREE.Quaternion(), 1 - maxTurn / turn);
      w.root.quaternion.premultiply(align);

      if (kReady < 0.999) {
        const sc = slingCarry(s);
        w.root.position.lerp(sc.pos, 1 - kReady);
        w.root.quaternion.slerp(sc.quat, 1 - kReady);
      }
      /* бег: ствол вниз, автомат пружинит в такт шагам */
      const kSpr = kSprint * (1 - kAds) * kReady * (1 - kReload);
      if (kSpr > 0.001) {
        const sc = slingCarry(s, SPRINT);
        const ph = c.bobPhase;
        sc.quat.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(
          Math.sin(ph * 2 + 0.6) * 0.045, Math.sin(ph + 0.3) * 0.035, Math.sin(ph) * 0.03)));
        sc.pos.y += Math.sin(ph * 2 + 1.1) * 0.012;
        w.root.position.lerp(sc.pos, kSpr);
        w.root.quaternion.slerp(sc.quat, kSpr);
      }

      /* Отдача самого оружия: отход назад по оси ствола, подброс и увод.
         Это видимая часть; вторая часть отдачи уходит в угол взгляда
         (см. P.fire) — именно она сбивает прицел при очереди. */
      w.recoilRig.position.set(0, 0, c.recoilBack.x);
      w.tiltRig.rotation.set(c.recoil.x * 0.85, c.recoilYaw.x * 0.6, c.recoilYaw.x * 1.1);
      w.root.updateMatrixWorld(true);
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
    function traceBullet(origin, dir, objs, targets) {
      const pos = origin.clone();
      const vel = dir.clone().multiplyScalar(MUZZLE_VEL);
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

    function shootRay(s) {
      const c = s.ctrl, w = s.gun;
      w.root.updateMatrixWorld(true);

      /* точка вылета — дульный срез с учётом установленного ДТК */
      const asm = C.getAsm();
      const mz = (asm && asm.nodes && asm.nodes.muzzle)
        ? new THREE.Vector3(asm.nodes.muzzle[0] * 0.001, asm.nodes.muzzle[1] * 0.001, asm.nodes.muzzle[2] * 0.001)
        : w.muzzleLocal.clone();
      const origin = w.gun.localToWorld(mz.clone());

      /* направление: ось ствола + разброс.
         Важно: стреляем ТУДА, КУДА СМОТРИТ СТВОЛ, а не в центр экрана —
         иначе теряется смысл прицеливания и отдачи. */
      const dir = new THREE.Vector3(0, 0, -1)
        .applyQuaternion(w.gun.getWorldQuaternion(new THREE.Quaternion())).normalize();
      const sp = c.spread;
      if (sp > 0) {
        /* равномерное распределение в конусе */
        const a = Math.random() * Math.PI * 2;
        const rr = Math.sqrt(Math.random()) * sp;
        const up = new THREE.Vector3(0, 1, 0);
        const side = new THREE.Vector3().crossVectors(dir, up).normalize();
        const up2 = new THREE.Vector3().crossVectors(side, dir).normalize();
        dir.addScaledVector(side, Math.cos(a) * rr).addScaledVector(up2, Math.sin(a) * rr).normalize();
      }

      /* вспышка и гильза */
      fx.flashRig.position.copy(origin);
      fx.flashRig.quaternion.copy(w.gun.getWorldQuaternion(new THREE.Quaternion()));
      fx.muzzleFlash(1);
      fx.smoke(origin, 2, dir.clone().multiplyScalar(1.4), 0.07);

      const ejPos = w.gun.localToWorld(w.ejectLocal.clone());
      const wq = w.gun.getWorldQuaternion(new THREE.Quaternion());
      const ejDir = new THREE.Vector3(0.86, 0.46, 0.22).normalize().applyQuaternion(wq);
      fx.ejectCase(ejPos, ejDir, new THREE.Vector3(0, 1, 0));

      audio.shot({ vol: 1 });

      /* --- трассировка --- */
      hitTargets.length = 0;
      for (const t of world.targets) if (t.state !== 'down') hitTargets.push(t.board);
      const objs = [world.ground];
      if (world.house) objs.push(world.house);
      if (world.props) objs.push(world.props);
      if (world.fence) objs.push(world.fence);
      if (world.range) objs.push(world.range);
      if (world.garden) objs.push(world.garden);

      let hit = null, hitKind = 'ground', hitTarget = null;

      /* Пуля летит по параболе с учётом сопротивления воздуха. */
      const shot = traceBullet(origin, dir, objs, hitTargets);
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
      /* Трассер летит со скоростью пули от дульного среза к точке попадания. */
      fx.tracer(origin.clone().addScaledVector(dir, 0.35), end, 1, MUZZLE_VEL);

      if (hit) {
        const nrm = hit.face
          ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
          : dir.clone().negate();
        if (hitTarget) {
          registerTargetHit(s, hitTarget, hit, nrm);
        } else {
          fx.impact(hit.point, nrm, hitKind, null);
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

    /* Теперь, когда трассировка пули собрана, подключаем её к контроллерам:
       каждый выстрел бойца рождает луч, вспышку, гильзу и звук. */
    for (const s of squad) s.ctrl.onFire = () => shootRay(s);

    return finishLoop(C, {
      poseSoldier, placeWeapon, eyePosition, shootRay, updateTargets, SLING,
      /* баллистика нужна отладочным хукам в finishLoop */
      MUZZLE_VEL, DRAG
    });
  }

  /* ================================================ КАМЕРА И КАДР ===== */
  function finishLoop(C, F) {
    const { THREE, renderer, scene, camera, world, fx, audio, squad, sun,
      S, input, ui, toast, active, updateFree, updateUse, syncAmmoCap } = C;
    const clamp = U.clamp;

    /* Панель модулей (TAB) из исходного файла оружия. */
    ATTACH_STATE.apply = (slotKey, moduleKey) => {
      ATTACH_STATE.ui && ATTACH_STATE.ui.markStats();
      ATTACH_STATE.config[slotKey] = moduleKey;
      const a = active();
      const asm = attachToGun(THREE, (a || squad[0]).gun);
      C.setAsm(asm);
      syncAmmoCap();
      ATTACH_STATE.ui && ATTACH_STATE.ui.render();
    };
    ATTACH_STATE.ui = createCustomizer({
      getConfig: () => ATTACH_STATE.config,
      getSlots: () => attachSlots(),
      getStats: () => (C.getAsm() ? C.getAsm().derived : {}),
      getWarnings: () => (C.getAsm() ? C.getAsm().warnings : []),
      optionsFor: attachOptionsFor,
      nameOf: attachNameOf,
      setModule: ATTACH_STATE.apply
    });
    ATTACH_STATE.ui.render();
    ATTACH_STATE.ui.toggle(false);
    attachBindKeys(ATTACH_STATE.apply);

    /* Когда панель открыта — освобождаем курсор, иначе по ней не кликнуть. */
    const origToggle = ATTACH_STATE.ui.toggle;
    ATTACH_STATE.ui.toggle = (on) => {
      origToggle(on);
      const vis = ATTACH_STATE.ui.visible();
      C.setCustOpen(vis);
      if (vis && document.pointerLockElement) document.exitPointerLock();
      else if (!vis && S.started && !document.pointerLockElement) renderer.domElement.requestPointerLock();
    };

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
      if (a) {
        const c = a.ctrl;
        const eye = F.eyePosition(a);
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
      sun.position.set(p.x + C.sunDir.x * 40, C.sunDir.y * 40 + 6, p.z + C.sunDir.z * 40);
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

    /* ------------------------------------------------- запуск игры ---- */
    ui.loading.textContent = 'ГОТОВО';
    ui.loading.style.opacity = '0.5';

    const beginGame = () => {
      if (S.started) return;
      S.started = true;
      ui.start.classList.add('hidden');
      audio.init();
      audio.resume();
      renderer.domElement.requestPointerLock();
      toast('ПОДОЙДИТЕ К ОПЕРАТОРУ И УДЕРЖИТЕ F', 3200);
    };
    ui.start.addEventListener('click', beginGame);
    window.addEventListener('keydown', (e) => {
      if (!S.started && (e.code === 'Enter' || e.code === 'Space')) beginGame();
      if (e.code === 'Space') S.spaceUp = true;
    });
    window.addEventListener('keyup', (e) => { if (e.code === 'Space') S.spaceUp = false; });

    /* гильза, упавшая на землю — звук */
    fx.onCaseLand = (v) => audio.caseHit(v);

    /* ------------------------------------------------------- кадр ----- */
    /* Шаг симуляции вынесен из кадра: он детерминирован и не зависит от
       того, как быстро рисует видеокарта. Благодаря этому автотесты гоняют
       логику фиксированными шагами, а не «ждут» реальные кадры. */
    function step(dt) {
      if (dt > 0.05) dt = 0.05;
      if (dt <= 0) dt = 1 / 120;
      S.time += dt;
      const t = S.time;

      const locked = S.pointerLocked && !C.isCustOpen();
      const a = active();

      /* 1. ввод и физика */
      if (a) a.ctrl.update(dt, locked ? Object.assign({}, input, { ads: input.ads }) : {}, locked, t);
      else if (locked) updateFree(dt);

      /* неактивные бойцы стоят на месте, но дышат */
      for (let i = 0; i < squad.length; i++) {
        const s = squad[i];
        if (i === S.activeIdx) { s.wasActive = true; continue; }
        const c = s.ctrl, k = s.idleSeed;
        /* Микродвижение в строю: боец переминается, чуть водит стволом и
           поворачивает голову. Без этого четыре манекена выглядят мёртвыми. */
        const swayYaw = Math.sin(t * 0.21 + k) * 0.045 + Math.sin(t * 0.07 + k * 2) * 0.03;
        const swayPitch = Math.sin(t * 0.17 + k * 1.7) * 0.05 - 0.04;
        /* Покачивание идёт вокруг курса, с которым бойца ОТПУСТИЛИ. Раньше
           yaw присваивался от курса спавна: отпущенный боец за один кадр
           разворачивался до 180°, а оружие, догоняющее взгляд с инерцией,
           на это время выносило вбок, мимо рук. Выход ловится по факту
           смены активного бойца — так покрыты и F, и смена бойца, и view. */
        if (s.wasActive) { s.idleYaw = c.yaw - swayYaw; s.wasActive = false; }
        c.breathT += dt * 0.85;
        /* Взгляд возвращается к позе покоя плавно, а не скачком. */
        c.yaw = U.dampAngle(c.yaw, s.idleYaw + swayYaw, 3, dt);
        c.pitch = U.damp(c.pitch, swayPitch, 3, dt);
        c.update(dt, {}, false, t);
      }

      /* 2-4. поза, оружие, руки */
      for (let i = 0; i < squad.length; i++) {
        const s = squad[i];
        const isActive = i === S.activeIdx;
        const pose = F.poseSoldier(s, dt, isActive, t);
        s.char.root.updateMatrixWorld(true);
        F.placeWeapon(s, dt, isActive, camera.position, camera.quaternion, pose);
        /* руки подводятся к уже размещённому оружию */
        s.rig.triggerCurl = triggerCurlFor(s);
        /* Риг должен знать, целится ли боец: от этого зависит, насколько
           далеко опорная кисть может съехать по цевью (см. solveArms). */
        s.rig.adsAmount = s.ctrl.ads;
        s.rig.readyAmount = U.smoothstep(s.ctrl.ready === undefined ? 1 : s.ctrl.ready);
        s.rig.fingerEvery = isActive ? 1 : 3;
        s.rig.solveArms(s.gun.gun);
      }

      /* 5. камера */
      updateCamera(dt);
      updateSelfVisibility();
      updateSun();

      /* 6. мир и эффекты */
      F.updateTargets(dt);
      if (world.grassMat && world.grassMat.userData.sh)
        world.grassMat.userData.sh.uniforms.uTime.value = t;
      fx.update(dt, 0);
      if (locked || !S.started) updateUse(dt);
      else ui.prompt.classList.remove('on');
      updateHUD(dt);
    }

    let prev = performance.now();
    const tick = () => {
      requestAnimationFrame(tick);
      const now = performance.now();
      const dt = (now - prev) / 1000;
      prev = now;
      if (!S.paused) step(dt);
      if (C.renderFrame) C.renderFrame(dt);
      else renderer.render(scene, camera);
    };

    /* Указательный палец: лежит на спуске, дожимает при выстреле. */
    function triggerCurlFor(s) {
      const c = s.ctrl;
      /* Палец вне скобы, вдоль ствольной коробки (< 0,5), пока боец не
         стреляет и не целится: на ремне, на предохранителе, на бегу. */
      if (c.ready !== undefined && c.ready < 0.5) return 0.08;
      if (c.fireMode === 'safe') return 0.08;
      const firing = (performance.now() / 1000 - c.lastShot) < 0.06;
      const held = c.triggerHeld && c.ammo > 0;
      if (firing || held) return 1.08;
      return c.ads > 0.5 && c.sprint < 0.3 ? 0.82 : 0.08;
    }

    tick();

    /* ------------------------------------------- отладочные хуки ------ */
    /* Используются автотестами (tools/test). */
    window.__GAME = {
      state: S, squad, world, camera, scene, renderer, fx, audio, sling: F.SLING,
      /* Прогон симуляции без рендера: n шагов по dt секунд. */
      step: (n, dt) => { for (let i = 0; i < (n || 1); i++) step(dt || 1 / 60); return S.time; },
      /* Снижение пули на заданных дистанциях: стреляем горизонтально из
         точки без препятствий и смотрим, на сколько траектория ушла вниз. */
      measureDrop: (dists) => {
        const org = new THREE.Vector3(0, 50, 0);           // высоко, чтобы ничего не мешало
        const dir = new THREE.Vector3(0, 0, -1);
        return (dists || [10, 30, 100]).map((d) => {
          /* та же схема интегрирования, что и в traceBullet */
          const vel = dir.clone().multiplyScalar(F.MUZZLE_VEL);
          const pos = org.clone();
          const h = 1 / 480;
          while (org.z - pos.z < d) {
            const v = vel.length();
            vel.addScaledVector(vel, -F.DRAG * v * h);
            vel.y -= 9.81 * h;
            pos.addScaledVector(vel, h);
            if (org.y - pos.y > 50) break;
          }
          return { dist: d, drop: +(org.y - pos.y).toFixed(4) };
        });
      },
      /* Управление вводом из автотестов: позволяет проверить полную цепочку
         «клавиша -> контроллер -> выстрел -> попадание», а не только её конец.
         pointerLocked имитирует захват курсора, которого нет в headless. */
      setInput: (o) => {
        if (o.lock !== undefined) { S.pointerLocked = !!o.lock; S.started = true; }
        for (const k of ['fwd', 'back', 'left', 'right', 'sprint', 'crouch', 'ads', 'leanL', 'leanR'])
          if (o[k] !== undefined) input[k] = o[k];
        if (o.trigger !== undefined) { const a = active(); a && a.ctrl.pullTrigger(!!o.trigger); }
        return { locked: S.pointerLocked, input: Object.assign({}, input) };
      },
      embody: (i) => { S.activeIdx >= 0 && null; C.embody ? C.embody(i) : null; },
      info: () => ({
        mode: S.mode, activeIdx: S.activeIdx, score: S.score,
        camera: camera.position.toArray().map((v) => +v.toFixed(3)),
        fov: +camera.fov.toFixed(2),
        targets: world.targets.map((t) => ({ d: t.dist, s: t.state, hits: t.hits })),
        squad: squad.map((s) => ({
          key: s.key,
          pos: s.ctrl.pos.toArray().map((v) => +v.toFixed(3)),
          ammo: s.ctrl.ammo, speed: +s.ctrl.speed.toFixed(3)
        }))
      }),
      /* геометрия: проверка, что руки реально держат оружие */
      gripCheck: () => squad.map((s) => {
        const g = s.gun.gun;
        g.updateMatrixWorld(true);
        s.char.root.updateMatrixWorld(true);
        const out = {};
        /* Меряем до ФАКТИЧЕСКОЙ точки хвата, которую выбрал риг: кисть
           скользит вдоль цевья под длину руки, поэтому расстояние до
           исходного узла оружия ничего не доказывало бы. */
        for (const [bone, SS] of [['palmR', 'R'], ['palmL', 'L']]) {
          const target = s.rig.gripTarget && s.rig.gripTarget[SS];
          if (!target) { out[bone] = -1; continue; }
          const bp = s.char.bone(bone).getWorldPosition(new THREE.Vector3());
          out[bone] = +bp.distanceTo(target).toFixed(4);
        }
        /* Углы в локтях: у стрелка рабочая рука согнута на 70–95°,
           опорная — на 100–130°. Прямая или сложенная вдвое рука сразу
           выдаёт неправильную постановку оружия. */
        const ang = (a, b, c) => {
          const A = s.char.bone(a).getWorldPosition(new THREE.Vector3());
          const B = s.char.bone(b).getWorldPosition(new THREE.Vector3());
          const C = s.char.bone(c).getWorldPosition(new THREE.Vector3());
          const u = A.sub(B).normalize(), v = C.sub(B).normalize();
          return Math.round(Math.acos(U.clamp(u.dot(v), -1, 1)) * 180 / Math.PI);
        };
        out.elbowR = ang('shoulderR', 'elbowR', 'wristR');
        out.elbowL = ang('shoulderL', 'elbowL', 'wristL');
        /* насколько далеко кисть от плеча — источник обоих углов */
        const sh = (n) => s.char.bone(n).getWorldPosition(new THREE.Vector3());
        out.reachR = +sh('shoulderR').distanceTo(sh('wristR')).toFixed(3);
        out.reachL = +sh('shoulderL').distanceTo(sh('wristL')).toFixed(3);
        /* висит ли оружие в воздухе относительно бойца */
        const chest = s.char.bone('chest').getWorldPosition(new THREE.Vector3());
        const gunP = s.gun.root.getWorldPosition(new THREE.Vector3());
        out.gunToChest = +chest.distanceTo(gunP).toFixed(4);
        /* Постановка рук в системе груди: отведение плеча от корпуса (°) и
           вынос локтя от оси тела (м). Прижатая к рёбрам рука даёт < 10° и
           локоть внутри контура туловища. */
        const cInv = s.char.bone('chest').getWorldQuaternion(new THREE.Quaternion()).invert();
        const loc = (n) => sh(n).sub(chest).applyQuaternion(cInv);
        for (const SS of ['R', 'L']) {
          const sg = SS === 'R' ? 1 : -1;
          const up = loc('elbow' + SS).sub(loc('shoulder' + SS));
          out['abduct' + SS] = Math.round(Math.atan2(sg * up.x, -up.y) * 180 / Math.PI);
          out['elbowOut' + SS] = +(sg * loc('elbow' + SS).x).toFixed(3);
        }
        const bq = g.getWorldQuaternion(new THREE.Quaternion());
        const bd = new THREE.Vector3(0, 0, -1).applyQuaternion(bq);
        out.gunPitch = Math.round(Math.asin(U.clamp(-bd.y, -1, 1)) * 180 / Math.PI);
        out.key = s.key;
        return out;
      }),
      /* Прицел: опорная кисть не должна подниматься к прицельной линии
         (0,116 м в системе оружия, верх цевья — 0,112). top — наивысшая
         точка левой перчатки у цевья в системе оружия, clearance — запас
         до линии. Вершины считаются линейным скиннингом на CPU: он
         расходится с шейдерным на миллиметры, запас это покрывает. */
      sightCheck: (i) => {
        const s = squad[i === undefined ? Math.max(0, S.activeIdx) : i];
        const mesh = s.char.meshes.glove;
        if (!mesh) return null;
        const g = s.gun.gun;
        g.updateMatrixWorld(true);
        s.char.root.updateMatrixWorld(true);
        const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
        const pos = mesh.geometry.attributes.position, v = new THREE.Vector3();
        let top = -Infinity;
        for (let k = 0; k < pos.count; k++) {
          if (pos.getX(k) > 0) continue;                 // левая перчатка: в позе покоя x < 0
          v.fromBufferAttribute(pos, k);
          mesh.applyBoneTransform(k, v);
          v.applyMatrix4(mesh.matrixWorld).applyMatrix4(inv);
          if (v.z < -0.2) top = Math.max(top, v.y);      // только у цевья
        }
        return { key: s.key, ads: +s.ctrl.ads.toFixed(2), top: +top.toFixed(4), clearance: +(0.116 - top).toFixed(4) };
      }
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
      S.free.fov = fov || 0;
      if (fov) { camRig.fov = fov; camera.fov = fov; camera.updateProjectionMatrix(); }
      return { pos: f.toArray(), yaw: S.free.yaw, pitch: S.free.pitch };
    };

    /* Принудительный вход в бойца — для автотестов и съёмки. */
    window.__GAME.embody = (i) => { C.embodyFn(i); return S.activeIdx; };
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

    window.__GAME.disembody = () => { C.disembodyFn(); return S.activeIdx; };
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

  return { main, SPAWN, HOLD_TIME, USE_RANGE, buildGun, attachToGun, startLoop, finishLoop };
});