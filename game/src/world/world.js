/* ============================================================================
   Полигон: поляна в пасмурном сосновом лесу и стрельбище на просеке.

   Лес процедурный, но на CC0-фототекстурах (кора, подстилка, хвоя,
   папоротник, трава): стволы, кроны и подлесок — InstancedMesh, валежник
   слит в один буфер, поэтому тысячи деревьев стоят пару десятков draw
   call. Густота растёт от поляны вглубь, дымку задаёт туман в game.js.

   Мишени стоят на 5, 10, 20 и 30 метрах и падают от попадания.
   Функции домика, огорода и забора остались в модуле (экспортируются),
   но на этой карте не вызываются.
   ========================================================================== */
(function (root, factory) {
  const W = factory(root.GUtil, root.GTex);
  if (typeof module !== 'undefined' && module.exports) module.exports = W;
  else root.GWorld = W;
})(typeof self !== 'undefined' ? self : this, function (U, T) {
  'use strict';

  const TAU = Math.PI * 2;

  /* Габариты игровой зоны, м (сами границы движения — в player.js). */
  const FIELD = { x: 64, z: 74 };

  /* ------------------------------------------------ лес: внешние ассеты */
  /* CC0-фототекстуры Poly Haven (assets/env/CREDITS.md). Загрузка
     регистрируется в GAssets до старта игры; если файл не пришёл, эта часть
     мира строится на процедурной текстуре — сборка не падает. */
  const ENV_FILES = {
    bark_diff: 'bark_diff.jpg', bark_nor: 'bark_nor.jpg', bark_arm: 'bark_arm.jpg',
    floorA_diff: 'floor_a_diff.jpg', floorA_nor: 'floor_a_nor.jpg', floorA_arm: 'floor_a_arm.jpg',
    floorB_diff: 'floor_b_diff.jpg', floorB_nor: 'floor_b_nor.jpg', floorB_arm: 'floor_b_arm.jpg',
    deadwood: 'deadwood_diff.jpg', spray: 'pine_spray.webp', fern: 'fern_frond.webp', tufts: 'grass_tufts.webp'
  };
  const GA = (typeof self !== 'undefined' && self.GAssets) || null;
  if (GA && typeof createImageBitmap === 'function') {
    for (const k of Object.keys(ENV_FILES)) {
      /* premultiplyAlpha/colorSpaceConversion 'none': карты нормалей и
         альфа-карточки должны прийти в GPU байт в байт */
      GA.add('env_' + k, GA.fetchAny('assets/env/' + ENV_FILES[k], 'blob').then((b) =>
        createImageBitmap(b, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' })));
    }
  }
  function envTex(THREE, key, srgb, aniso) {
    const bmp = GA && GA.data['env_' + key];
    if (!bmp) return null;
    const t = new THREE.Texture(bmp);
    t.flipY = false;                 // ImageBitmap уже перевёрнут при декодировании
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso || 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }
  function canvasTex(THREE, cv, srgb) {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /* Бесшовный value-шум (RGBA — четыре независимых поля) для смешивания
     слоёв грунта. Периоды решётки делят размер нацело, поэтому тайл
     повторяется без шва. */
  function noiseTexture(THREE, size) {
    const data = new Uint8Array(size * size * 4);
    const rnd = U.rng(4242);
    const sm = (t) => t * t * (3 - 2 * t);
    for (let c = 0; c < 4; c++) {
      const acc = new Float32Array(size * size);
      let amp = 1;
      for (const P of [4, 8, 16, 32, 64]) {
        const lat = new Float32Array(P * P);
        for (let i = 0; i < lat.length; i++) lat[i] = rnd();
        const cell = size / P;
        for (let y = 0; y < size; y++) {
          const fy = y / cell, iy = Math.floor(fy), ty = sm(fy - iy);
          const y0 = (iy % P) * P, y1 = ((iy + 1) % P) * P;
          for (let x = 0; x < size; x++) {
            const fx = x / cell, ix = Math.floor(fx), tx = sm(fx - ix);
            const x0 = ix % P, x1 = (ix + 1) % P;
            const a = lat[y0 + x0] + (lat[y0 + x1] - lat[y0 + x0]) * tx;
            const b = lat[y1 + x0] + (lat[y1 + x1] - lat[y1 + x0]) * tx;
            acc[y * size + x] += amp * (a + (b - a) * ty);
          }
        }
        amp *= 0.55;
      }
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < acc.length; i++) { lo = Math.min(lo, acc[i]); hi = Math.max(hi, acc[i]); }
      for (let i = 0; i < acc.length; i++) data[i * 4 + c] = Math.round((acc[i] - lo) / (hi - lo) * 255);
    }
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.needsUpdate = true;
    return t;
  }

  /* --------------------------------------------- построитель геометрии */
  /* Минимальный накопитель вершин: трубки (стволы, ветки), полосы
     (карточки хвои) и крышки. Всё пишется сразу в итоговые массивы, чтобы
     сотни веток сливались в один буфер = один draw call. */
  function Geo() { this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; }
  Geo.prototype.vert = function (p, n, uv, c) {
    this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]);
    this.u.push(uv[0], uv[1]); this.c.push(c[0], c[1], c[2]);
    return this.p.length / 3 - 1;
  };
  Geo.prototype.tube = function (pts, radii, seg, o) {
    o = o || {};
    const n = pts.length, base = this.p.length / 3;
    const dAll = v3norm(v3sub(pts[n - 1], pts[0]));
    const ref = Math.abs(dAll[1]) > 0.7 ? [1, 0, 0] : [0, 1, 0];
    let vAcc = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const t = v3norm(v3sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]));
      const nx = v3norm(v3cross(ref, t)), ny = v3cross(t, nx);
      if (i > 0) vAcc += v3len(v3sub(p, pts[i - 1]));
      const col = o.col ? o.col(i / (n - 1), p) : [1, 1, 1];
      for (let j = 0; j <= seg; j++) {
        const ang = (j / seg) * TAU, cs = Math.cos(ang), sn = Math.sin(ang);
        const d = [nx[0] * cs + ny[0] * sn, nx[1] * cs + ny[1] * sn, nx[2] * cs + ny[2] * sn];
        const r = radii[i] * (o.bump ? 1 + o.bump(i, j % seg) : 1);
        this.vert([p[0] + d[0] * r, p[1] + d[1] * r, p[2] + d[2] * r], d,
          [(j / seg) * (o.uRep || 1) + (o.u0 || 0), vAcc / (o.vScale || 1) + (o.v0 || 0)], col);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < seg; j++) {
        const a = base + i * (seg + 1) + j, b = a + seg + 1;
        this.i.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  };
  Geo.prototype.cap = function (c, nrm, r, seg, col) {
    const ref = Math.abs(nrm[1]) > 0.7 ? [1, 0, 0] : [0, 1, 0];
    const nx = v3norm(v3cross(ref, nrm)), ny = v3cross(nrm, nx);
    const ci = this.vert(c, nrm, [0.5, 0.5], col);
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * TAU, cs = Math.cos(a), sn = Math.sin(a);
      this.vert([c[0] + (nx[0] * cs + ny[0] * sn) * r, c[1] + (nx[1] * cs + ny[1] * sn) * r, c[2] + (nx[2] * cs + ny[2] * sn) * r],
        nrm, [0.5 + cs * 0.25, 0.5 + sn * 0.25], col);
    }
    for (let j = 0; j < seg; j++) this.i.push(ci, ci + 1 + j, ci + 2 + j);
  };
  /* Полоса-карточка вдоль оси axis; side — боковой вектор в каждой точке. */
  Geo.prototype.strip = function (axis, side, width, nrm, col, uAlong) {
    const base = this.p.length / 3, n = axis.length;
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1), w = width[k] * 0.5, s = side[k], p = axis[k];
      const c = col ? col(t) : [1, 1, 1], nn = nrm[k] || nrm[0];
      const uv0 = uAlong ? [t, 0] : [0, t], uv1 = uAlong ? [t, 1] : [1, t];
      this.vert([p[0] - s[0] * w, p[1] - s[1] * w, p[2] - s[2] * w], nn, uv0, c);
      this.vert([p[0] + s[0] * w, p[1] + s[1] * w, p[2] + s[2] * w], nn, uv1, c);
    }
    for (let k = 0; k < n - 1; k++) {
      const a = base + k * 2;
      this.i.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  };
  Geo.prototype.build = function (THREE) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  };
  const v3sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const v3add = (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
  const v3len = (a) => Math.hypot(a[0], a[1], a[2]);
  const v3norm = (a) => { const l = v3len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const v3cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const smooth01 = (t) => { t = U.clamp01(t); return t * t * (3 - 2 * t); };

  /* ------------------------------------------------------ планировка */
  /* Строй бойцов стоит на поляне (эллипс с «рваным» краем), от огневого
     рубежа на -Z уходит просека стрельбища. Ни одно дерево не ближе 6 м к
     шеренге и не стоит в секторе огня. Рельеф на поляне и просеке ровный,
     в лесу — пологие волны. */
  const SQUAD_LINE = { x0: -4.2, x1: 4.2, z: 1.2 };
  const CLEARING = { x: 0, z: 3.2, rx: 12.5, rz: 10.5 };
  function forestLayout() {
    const edge = U.fbm(515, 3, 0.5, 2.1);
    const hA = U.fbm(909, 4, 0.5, 2.2), hB = U.fbm(313, 3, 0.5, 2.0);
    const clearE = (x, z) => {
      const ex = (x - CLEARING.x) / CLEARING.rx, ez = (z - CLEARING.z) / CLEARING.rz;
      return Math.hypot(ex, ez) * (1 + (edge(x * 0.09 + 3, z * 0.09 + 7) - 0.5) * 0.35);
    };
    /* > 0 — снаружи просеки (прямоугольник от рубежа до вала) */
    const laneD = (x, z) => {
      const dx = Math.abs(x - FIRE_LINE.x) - 3.6;
      const dz = Math.max(z - (FIRE_LINE.z + 2.5), (FIRE_LINE.z - 37) - z);
      return Math.max(dx, dz);
    };
    const squadD = (x, z) => Math.hypot(x - U.clamp(x, SQUAD_LINE.x0, SQUAD_LINE.x1), z - SQUAD_LINE.z);
    const heightAt = (x, z) => {
      const k = Math.min(U.clamp01((clearE(x, z) - 1.0) * 1.6), U.clamp01((laneD(x, z) - 1.0) / 6));
      if (k <= 0) return 0;
      return ((hA(x * 0.028 + 10, z * 0.028 + 4) - 0.5) * 2.4 + (hB(x * 0.09, z * 0.09) - 0.5) * 0.35) * k;
    };
    return { clearE, laneD, squadD, heightAt };
  }

  function build(THREE, scene) {
    const api = {
      colliders: [],      // {type:'box'|'cyl', ...} — препятствия для игрока
      targets: [],        // мишени стрельбища
      hitboxes: [],       // цели для пуль (мишени + статика)
      update: null,
      _noGrass: []        // зоны без подлеска (рубеж, мишени, вал)
    };
    const F = forestLayout();
    api.heightAt = F.heightAt;
    api.layout = F;
    const M = forestMaterials(THREE);
    api.grassMat = M.grass;           // игра двигает uTime ветра через него
    buildGround(THREE, scene, api, F, M);
    buildRange(THREE, scene, api);
    const trees = scatterTrees(F);
    buildTrees(THREE, scene, api, F, M, trees);
    buildDeadwood(THREE, scene, api, F, M, trees);
    buildUndergrowth(THREE, scene, api, F, M, trees);
    return api;
  }

  /* ------------------------------------------------------- материалы */
  function addWind(mat, windTime, amp, kind) {
    const u = { uTime: windTime, uWindAmp: { value: amp }, uCell: { value: kind === 'grass' ? 0.5 : 1 } };
    mat.userData.sh = { uniforms: u };
    mat.customProgramCacheKey = () => 'forest-wind-' + kind;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      /* высота над точкой крепления: у хвои крона начинается ~на 11 м */
      const h = kind === 'crown' ? 'max(position.y - 11.0, 0.0)' : 'max(position.y, 0.0)';
      sh.vertexShader = 'uniform float uTime;\nuniform float uWindAmp;\n' +
        (kind === 'grass' ? 'attribute vec2 aCell;\nuniform float uCell;\n' : '') +
        sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 wOrg = instanceMatrix[3].xyz;
          #else
            vec3 wOrg = vec3(0.0);
          #endif
          float wS = sin(uTime * 1.2 + wOrg.x * 0.37 + wOrg.z * 0.29 + position.x * 0.6)
                   + 0.45 * sin(uTime * 2.7 + wOrg.z * 0.9 + position.z * 0.8);
          float wH = ${h};
          transformed.x += wS * uWindAmp * wH;
          transformed.z += wS * uWindAmp * 0.6 * wH;`);
      if (kind === 'grass') {
        sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>',
          '#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = vMapUv * uCell + aCell;\n#endif');
      }
      /* Карточки листвы двусторонние, но нормаль у них «вверх» и не должна
         переворачиваться на изнанке: иначе пучок, повёрнутый к камере
         тыльной стороной, освещается снизу и выглядит чёрным пятном. */
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
        '#undef DOUBLE_SIDED\n#include <normal_fragment_begin>\n#define DOUBLE_SIDED');
    };
  }

  /* Запасная карточка хвои, если фото-ветка не загрузилась. */
  function needleCanvas() {
    const c = T.canvas(256, 256), g = T.ctx2d(c), rnd = U.rng(88);
    g.clearRect(0, 0, 256, 256);
    g.strokeStyle = 'rgb(60,48,38)'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(4, 128); g.lineTo(252, 120); g.stroke();
    for (let i = 0; i < 900; i++) {
      const t = rnd(), x = 10 + t * 240, y = 128 - t * 8;
      const a = (rnd() - 0.5) * 2.4 + (rnd() < 0.5 ? 0.6 : -0.6), L = 14 + rnd() * 26 * (1 - t * 0.5);
      g.strokeStyle = `rgb(${40 + rnd() * 25 | 0},${62 + rnd() * 30 | 0},${34 + rnd() * 18 | 0})`;
      g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L * 0.4, y + Math.sin(a) * L); g.stroke();
    }
    return c;
  }

  function forestMaterials(THREE) {
    const M = { windTime: { value: 0 } };
    const bd = envTex(THREE, 'bark_diff', true), bn = envTex(THREE, 'bark_nor'), ba = envTex(THREE, 'bark_arm');
    /* Сосновая кора на фото рыже-красная; в пасмурном ельнике референса
       стволы тёмно-серо-бурые — отсюда приглушающий множитель. */
    M.bark = new THREE.MeshStandardMaterial({
      map: bd || canvasTex(THREE, T.woodAlbedo(314, 256, [84, 74, 64]), true),
      normalMap: bn, normalScale: new THREE.Vector2(1.4, 1.4),
      roughnessMap: ba, aoMap: ba, aoMapIntensity: 1.0,
      roughness: 1, metalness: 0, vertexColors: true,
      color: new THREE.Color(0.50, 0.47, 0.46)
    });

    const sp = envTex(THREE, 'spray', true, 4);
    M.needles = new THREE.MeshStandardMaterial({
      map: sp || canvasTex(THREE, needleCanvas(), true),
      alphaTest: 0.42, alphaToCoverage: true, side: THREE.DoubleSide,
      roughness: 0.88, metalness: 0, vertexColors: true,
      color: new THREE.Color(0.52, 0.56, 0.48)
    });
    addWind(M.needles, M.windTime, 0.012, 'crown');

    const dw = envTex(THREE, 'deadwood', true);
    M.deadwood = new THREE.MeshStandardMaterial({
      map: dw || canvasTex(THREE, T.woodAlbedo(515, 128, [96, 88, 80]), true),
      roughness: 0.95, metalness: 0, vertexColors: true,
      color: new THREE.Color(0.62, 0.60, 0.58)
    });

    const tf = envTex(THREE, 'tufts', true, 4);
    M.grass = new THREE.MeshStandardMaterial({
      map: tf || canvasTex(THREE, T.grassBlade(77, 128), true),
      alphaTest: 0.4, alphaToCoverage: true, side: THREE.DoubleSide,
      roughness: 0.95, metalness: 0,
      color: new THREE.Color(0.66, 0.66, 0.60)
    });
    M.grass.map.wrapS = M.grass.map.wrapT = THREE.ClampToEdgeWrapping;
    addWind(M.grass, M.windTime, 0.05, 'grass');
    if (!tf) M.grass.userData.sh.uniforms.uCell.value = 1;
    M.grassAtlas = !!tf;

    const fe = envTex(THREE, 'fern', true, 4);
    M.fern = fe ? new THREE.MeshStandardMaterial({
      map: fe, alphaTest: 0.4, alphaToCoverage: true, side: THREE.DoubleSide,
      roughness: 0.9, metalness: 0,
      color: new THREE.Color(0.50, 0.55, 0.44)
    }) : null;
    if (M.fern) { M.fern.map.wrapS = M.fern.map.wrapT = THREE.ClampToEdgeWrapping; addWind(M.fern, M.windTime, 0.035, 'fern'); }
    return M;
  }

  /* ---------------------------------------------------------- грунт */
  /* Лесная подстилка: два фото-набора (хвоя с листвой и замшелая земля),
     у каждого альбедо/нормаль/ARM. Повтор тайла ломается шумом: второй
     сэмпл того же набора повёрнут и масштабирован, переход между ними и
     пятна мха заданы бесшовным шумом в мировых координатах. */
  function buildGround(THREE, scene, api, F, M) {
    const SIZE = 250, SEG = 125;
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, F.heightAt(x, z));
      uv.setXY(i, x, -z);                    // UV в метрах
    }
    geo.computeVertexNormals();

    const TILE_A = 2.4, TILE_B = 3.2;
    const aD = envTex(THREE, 'floorA_diff', true, 16), aN = envTex(THREE, 'floorA_nor', false, 16), aR = envTex(THREE, 'floorA_arm', false, 16);
    const bD = envTex(THREE, 'floorB_diff', true, 16), bN = envTex(THREE, 'floorB_nor', false, 16), bR = envTex(THREE, 'floorB_arm', false, 16);
    const full = aD && aN && aR && bD && bN && bR;
    let mat;
    if (full) {
      for (const t of [aD, aN, aR]) t.repeat.set(1 / TILE_A, 1 / TILE_A);
      mat = new THREE.MeshStandardMaterial({
        map: aD, normalMap: aN, roughnessMap: aR, normalScale: new THREE.Vector2(1.15, 1.15),
        roughness: 1, metalness: 0, color: new THREE.Color(0.80, 0.75, 0.70)
      });
      const uni = {
        tNoise: { value: noiseTexture(THREE, 256) }, mapB: { value: bD }, normalMapB: { value: bN }, armB: { value: bR },
        uTileA: { value: TILE_A }, uTileRatio: { value: TILE_A / TILE_B }
      };
      api.groundUniforms = uni;
      mat.customProgramCacheKey = () => 'forest-ground';
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, uni);
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>
            uniform sampler2D tNoise, mapB, normalMapB, armB;
            uniform float uTileA, uTileRatio;
            vec2 gRot(vec2 p, float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c) * p; }`)
          .replace('#include <map_fragment>', `
            vec2 gUvA = vMapUv;
            vec2 gW = gUvA * uTileA;
            vec4 gNz = texture2D(tNoise, gW * 0.019);
            vec4 gNz2 = texture2D(tNoise, gW * 0.071 + 0.5);
            float gSw = smoothstep(0.40, 0.60, gNz2.g);
            vec2 gUvA2 = gRot(gUvA, 1.1) * 0.83 + vec2(0.37, 0.61);
            vec2 gUvB = gRot(gUvA, -0.6) * uTileRatio + vec2(0.13, 0.29);
            float gMb = smoothstep(0.50, 0.72, gNz.r * 0.8 + gNz2.b * 0.3 - 0.05);
            vec4 gA = mix(texture2D(map, gUvA), texture2D(map, gUvA2), gSw);
            vec4 gB = texture2D(mapB, gUvB);
            gB.rgb *= vec3(0.78, 0.80, 0.70);
            vec4 gCol = mix(gA, gB, gMb);
            vec4 gArm = mix(mix(texture2D(roughnessMap, gUvA), texture2D(roughnessMap, gUvA2), gSw), texture2D(armB, gUvB), gMb);
            gCol.rgb *= (0.74 + 0.5 * gNz.a) * mix(1.0, gArm.r, 0.8);
            diffuseColor *= gCol;`)
          .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * gArm.g;')
          .replace('#include <normal_fragment_maps>', `
            #ifdef USE_NORMALMAP_TANGENTSPACE
              vec3 gNA = texture2D(normalMap, gUvA).xyz * 2.0 - 1.0;
              vec3 gNA2 = texture2D(normalMap, gUvA2).xyz * 2.0 - 1.0;
              gNA2.xy = gRot(gNA2.xy, -1.1);
              vec3 gNB = texture2D(normalMapB, gUvB).xyz * 2.0 - 1.0;
              gNB.xy = gRot(gNB.xy, 0.6);
              vec3 mapN = mix(mix(gNA, gNA2, gSw), gNB, gMb);
              mapN.xy *= normalScale;
              normal = normalize(tbn * mapN);
            #else
              #include <normal_fragment_maps>
            #endif`);
      };
    } else {
      const gt = canvasTex(THREE, T.groundAlbedo(2024, 1024), true);
      gt.repeat.set(1 / 3, 1 / 3);
      mat = new THREE.MeshStandardMaterial({ map: gt, roughness: 0.97, metalness: 0, color: new THREE.Color(0.62, 0.58, 0.50) });
    }
    const ground = new THREE.Mesh(geo, mat);
    ground.receiveShadow = true;
    ground.name = 'ground';
    /* Аналитический луч по карте высот: сетка 250 м — это 31 тыс.
       треугольников, а трассер пули бросает ~100 лучей на выстрел. */
    ground.raycast = function (raycaster, out) {
      const o = raycaster.ray.origin, d = raycaster.ray.direction;
      const far = Math.min(raycaster.far, 400);
      const hAt = (s) => o.y + d.y * s - F.heightAt(o.x + d.x * s, o.z + d.z * s);
      let s0 = raycaster.near;
      if (hAt(s0) < 0) return;
      const step = Math.max(0.35, Math.min(1.0, far / 6));
      while (s0 < far) {
        const s1 = Math.min(far, s0 + step);
        if (hAt(s1) <= 0) {
          let a = s0, b = s1;
          for (let k = 0; k < 12; k++) { const m = (a + b) * 0.5; if (hAt(m) > 0) a = m; else b = m; }
          const s = (a + b) * 0.5, px = o.x + d.x * s, pz = o.z + d.z * s, e = 0.15;
          const nrm = new THREE.Vector3(F.heightAt(px - e, pz) - F.heightAt(px + e, pz), 2 * e,
            F.heightAt(px, pz - e) - F.heightAt(px, pz + e)).normalize();
          out.push({ distance: s, point: new THREE.Vector3(px, o.y + d.y * s, pz), object: ground,
            face: { a: 0, b: 0, c: 0, normal: nrm, materialIndex: 0 } });
          return;
        }
        s0 = s1;
      }
    };
    scene.add(ground);
    api.ground = ground;

    /* грунт для вала и доски огневого рубежа */
    if (full) {
      const e = aD.clone(); e.repeat.set(7, 2); e.needsUpdate = true;
      api.earthMat = new THREE.MeshStandardMaterial({ map: e, roughness: 1, metalness: 0, color: new THREE.Color(0.62, 0.58, 0.54) });
    }
    api.padMat = new THREE.MeshStandardMaterial({
      map: canvasTex(THREE, T.woodAlbedo(41, 256, [84, 78, 70]), true), roughness: 0.93, metalness: 0
    });
  }

  /* ------------------------------------------------------ деревья */
  function scatterTrees(F) {
    const rnd = U.rng(20240925);
    const R = 108, cell = 2.4, trees = [];
    const grid = new Map(), gkey = (i, j) => (i + 512) * 1024 + (j + 512);
    const dens = U.fbm(777, 3, 0.5, 2.0);
    for (let gx = -R; gx < R; gx += cell) {
      for (let gz = -R; gz < R; gz += cell) {
        const x = gx + rnd() * cell, z = gz + rnd() * cell;
        const pick = rnd(), sizeR = rnd(), sizeH = rnd(), vr = rnd(), rot = rnd(), lx = rnd(), lz = rnd(), tint = rnd();
        const d = Math.hypot(x, z - 2);
        if (d > R) continue;
        if (F.clearE(x, z) < 1 || F.laneD(x, z) < 0.8 || F.squadD(x, z) < 6.3) continue;
        /* густота растёт от края поляны вглубь, плюс пятна подроста */
        const t = smooth01((d - 10) / 42);
        const p = (0.16 + 0.60 * t) * (0.5 + 0.95 * dens(x * 0.035, z * 0.035));
        if (pick > p) continue;
        let ok = true;
        const ci = Math.floor(x / 2.4), cj = Math.floor(z / 2.4);
        for (let a = -1; a <= 1 && ok; a++) for (let b = -1; b <= 1 && ok; b++) {
          const lst = grid.get(gkey(ci + a, cj + b));
          if (lst) for (const o of lst) if (Math.hypot(o.x - x, o.z - z) < 1.7) { ok = false; break; }
        }
        if (!ok) continue;
        const tr = {
          x, z, y: F.heightAt(x, z) - 0.05, d,
          rs: 0.72 + sizeR * 0.62, hs: 0.86 + sizeH * 0.34,
          v: Math.floor(vr * 3) % 3, rot: rot * TAU,
          lx: (lx - 0.5) * 0.035, lz: (lz - 0.5) * 0.035, tint
        };
        trees.push(tr);
        const k = gkey(ci, cj);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(tr);
      }
    }
    trees.near = (x, z, r) => {
      const ci = Math.floor(x / 2.4), cj = Math.floor(z / 2.4), n = Math.ceil(r / 2.4);
      for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) {
        const lst = grid.get(gkey(ci + a, cj + b));
        if (lst) for (const o of lst) if (Math.hypot(o.x - x, o.z - z) < r + TREE_R * o.rs) return o;
      }
      return null;
    };
    return trees;
  }

  const TREE_H = 21, TREE_R = 0.24;

  /* Одна сосна: ствол с корневым наплывом и лёгким изгибом, сухие сучья
     ниже кроны (в сомкнутом лесу нижние ветви отмирают) и крона из мутовок
     хвойных карточек. lod — упрощённый вариант для деревьев дальше 45 м,
     которые всё равно тонут в дымке. */
  function treeGeometry(THREE, seed, lod) {
    const rnd = U.rng(seed);
    const H = TREE_H, r0 = TREE_R;
    const crown0 = H * (0.56 + rnd() * 0.08);
    const trunk = new Geo(), crown = new Geo();
    const bx = (rnd() - 0.5) * 0.7, bz = (rnd() - 0.5) * 0.7, ph = rnd() * TAU;
    const axis = (y) => [bx * Math.pow(Math.max(y, 0) / H, 1.6) + 0.05 * Math.sin(y * 0.45 + ph), y,
      bz * Math.pow(Math.max(y, 0) / H, 1.6) + 0.05 * Math.cos(y * 0.37 + ph)];
    const radius = (y) => r0 * (1 - 0.8 * Math.pow(Math.max(y, 0) / H, 1.05)) * (1 + 0.55 * Math.exp(-Math.max(y, 0) / 0.3));
    const ys = lod ? [-0.4, 0.3, 1.6, 5, 10, 15, H * 0.86, H]
      : [-0.4, 0, 0.12, 0.3, 0.6, 1.1, 1.9, 3.2, 5, 7.5, 10.5, 13.5, 16.5, 19, H];
    const bumpN = U.noise2D(seed + 3);
    trunk.tube(ys.map(axis), ys.map(radius), lod ? 6 : 10, {
      uRep: 2, vScale: 1.25,
      /* комель темнее и зеленее (мох, влага), выше — ровный тон коры */
      col: (t, p) => mixc([0.40, 0.44, 0.34], [1, 1, 1], smooth01(p[1] / 2.4)),
      bump: lod ? null : (i, j) => (bumpN(j * 0.9, ys[i] * 0.7) - 0.5) * (ys[i] < 0.7 ? 0.5 : 0.1)
    });
    if (!lod) {
      /* сухие сучья */
      const n = 13 + Math.floor(rnd() * 8);
      const dead = () => [0.62, 0.60, 0.58];
      for (let k = 0; k < n; k++) {
        const y = 1.8 + Math.pow(rnd(), 0.8) * (crown0 - 1.4);
        const a = rnd() * TAU, L = (0.25 + rnd() * 0.9) * (0.5 + 0.8 * y / crown0);
        const droop = -0.12 - rnd() * 0.55;
        const dir = [Math.cos(a) * Math.cos(droop), Math.sin(droop), Math.sin(a) * Math.cos(droop)];
        const c = axis(y), rr = radius(y) * 0.85;
        const p0 = [c[0] + dir[0] * rr, c[1], c[2] + dir[2] * rr];
        const p1 = v3add(p0, dir, L * 0.5), p2 = v3add(v3add(p0, dir, L), [0, -1, 0], L * 0.12);
        const br = 0.022 + 0.018 * rnd();
        trunk.tube([v3add(p0, dir, -rr * 0.6), p1, p2], [br, br * 0.55, 0.004], 4,
          { uRep: 1, vScale: 1.25, u0: rnd(), col: dead });
        if (L > 0.6 && rnd() < 0.7) {
          const sa = a + (rnd() < 0.5 ? 0.7 : -0.7), sd = [Math.cos(sa) * 0.8, -0.2 - rnd() * 0.3, Math.sin(sa) * 0.8];
          trunk.tube([p1, v3add(p1, sd, L * 0.35)], [br * 0.45, 0.003], 3, { uRep: 1, vScale: 1.25, col: dead });
        }
      }
    }
    /* крона: мутовки веток-карточек, профиль сосны — шире в середине,
       узкая макушка. Нормали карточек «сферические» (наружу + вверх),
       иначе плоские квады освещаются пятнами. */
    const whorl = lod ? 1.9 : 0.8;
    let ga = rnd() * TAU;
    for (let y = crown0; y < H - 0.4; y += whorl * (0.8 + rnd() * 0.4)) {
      const t = (y - crown0) / (H - crown0);
      const Lm = 0.9 + 2.5 * Math.pow(Math.sin(Math.PI * U.clamp(0.16 + 0.84 * t, 0, 1)), 0.7) * (1 - 0.25 * t);
      const nb = lod ? 4 : 5;
      for (let b = 0; b < nb; b++) {
        ga += 2.39996;                      // золотой угол
        const a = ga + (rnd() - 0.5) * 0.4;
        const L = Lm * (0.75 + rnd() * 0.45) * (lod ? 1.2 : 1);
        const pitch = -0.38 + 0.7 * t + (rnd() - 0.5) * 0.25;
        const c = axis(y + (rnd() - 0.5) * 0.3);
        const dh = [Math.cos(a), 0, Math.sin(a)];
        const dir = [dh[0] * Math.cos(pitch), Math.sin(pitch), dh[2] * Math.cos(pitch)];
        const side0 = v3norm(v3cross(dir, [0, 1, 0]));
        const up0 = v3cross(side0, dir);
        const side = v3norm(v3add(side0, up0, Math.tan((rnd() - 0.5) * 0.7)));
        const nrm = v3norm([dh[0] * 0.55, 0.9, dh[2] * 0.55]);
        const segs = lod ? 2 : 3;
        const axisPts = [], sides = [], widths = [], nrms = [];
        for (let k = 0; k < segs; k++) {
          const u = k / (segs - 1);
          axisPts.push(v3add(v3add(c, dir, 0.05 + u * L), [0, -1, 0], u * u * L * 0.22));
          sides.push(side); widths.push(L * 0.62); nrms.push(nrm);
        }
        const col = (u) => mixc([0.62, 0.62, 0.60], [1, 1, 1], u);
        crown.strip(axisPts, sides, widths, nrms, col, true);
        if (!lod) {
          const upv = v3norm(v3cross(side, dir));
          crown.strip(axisPts, axisPts.map(() => upv), widths.map((w) => w * 0.8), nrms, col, true);
        }
      }
    }
    /* макушка */
    for (let b = 0; b < 3; b++) {
      const a = b * 2.1 + rnd();
      const c = axis(H - 0.6), dir = v3norm([Math.cos(a) * 0.35, 1, Math.sin(a) * 0.35]);
      const side = v3norm(v3cross(dir, [Math.sin(a), 0, -Math.cos(a)]));
      crown.strip([c, v3add(c, dir, 1.3)], [side, side], [0.8, 0.8], [[0, 1, 0]], null, true);
    }
    return { trunk: trunk.build(THREE), crown: crown.build(THREE), crown0 };
  }

  function buildTrees(THREE, scene, api, F, M, trees) {
    const g = new THREE.Group();
    g.name = 'forest';
    const NEAR_R = 40, SHADOW_R = 30, SECT = 8;
    const nearV = [0, 1, 2].map((v) => treeGeometry(THREE, 101 + v * 17, false));
    const farV = [0, 1].map((v) => treeGeometry(THREE, 501 + v * 23, true));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eu = new THREE.Euler(),
      sc = new THREE.Vector3(), ps = new THREE.Vector3(), col = new THREE.Color();
    const place = (t) => {
      eu.set(t.lx, t.rot, t.lz); q.setFromEuler(eu);
      sc.set(t.rs, t.hs, t.rs); ps.set(t.x, t.y, t.z);
      return m4.compose(ps, q, sc);
    };
    const tintOf = (t) => col.setRGB(0.84 + t.tint * 0.3, 0.84 + t.tint * 0.28, 0.84 + t.tint * 0.26);
    const makeSet = (list, geos, near, name, shadow) => {
      if (!list.length) return;
      const trunk = new THREE.InstancedMesh(geos.trunk, M.bark, list.length);
      const crown = new THREE.InstancedMesh(geos.crown, M.needles, list.length);
      list.forEach((t, i) => {
        const m = place(t);
        trunk.setMatrixAt(i, m); crown.setMatrixAt(i, m);
        trunk.setColorAt(i, tintOf(t));
      });
      trunk.name = name + '_trunk'; crown.name = name + '_crown';
      /* Тени отбрасывают только ближние стволы: карта теней покрывает
         ±26 м вокруг камеры. Кроны теней не дают — под пасмурным небом
         пятнистой тени от полога нет, а альфа-карточки в карте теней
         были самой дорогой частью кадра. */
      trunk.castShadow = !!shadow; trunk.receiveShadow = near;
      crown.castShadow = false; crown.receiveShadow = false;
      crown.userData.noAO = true;               // альфа-карточки не участвуют в GTAO
      trunk.computeBoundingSphere(); crown.computeBoundingSphere();
      g.add(trunk, crown);
    };
    for (let v = 0; v < 3; v++) {
      makeSet(trees.filter((t) => t.d < SHADOW_R && t.v === v), nearV[v], true, 'tree_s' + v, true);
      makeSet(trees.filter((t) => t.d >= SHADOW_R && t.d < NEAR_R && t.v === v), nearV[v], true, 'tree_n' + v, false);
    }
    /* дальние — секторами, чтобы работал фрустум-каллинг */
    for (let s = 0; s < SECT; s++) {
      for (let v = 0; v < 2; v++) {
        makeSet(trees.filter((t) => {
          if (t.d < NEAR_R || (t.v & 1) !== v) return false;
          const a = Math.atan2(t.z - 2, t.x) + Math.PI;
          return Math.min(SECT - 1, Math.floor(a / TAU * SECT)) === s;
        }), farV[v], false, 'tree_f' + s + '_' + v);
      }
    }
    scene.add(g);
    api.forest = g;
    api.treeCount = trees.length;

    /* коллизии стволов в пределах игровой зоны */
    for (const t of trees) {
      if (Math.abs(t.x) < 31 && Math.abs(t.z) < 36)
        api.colliders.push({ type: 'cyl', x: t.x, z: t.z, r: TREE_R * t.rs * 1.1 + 0.03, h: 3 });
    }

    /* Попадания пуль: аналитические вертикальные цилиндры вместо
       рейкаста по инстансам (тысячи мешей на каждом шаге трассера). */
    const grid = new Map(), CELL = 8;
    const key = (i, j) => (i + 256) * 512 + (j + 256);
    for (const t of trees) {
      if (t.d > 90) continue;
      const k = key(Math.floor(t.x / CELL), Math.floor(t.z / CELL));
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(t);
    }
    const proxy = new THREE.Object3D();
    proxy.name = 'trees';
    const test = (t, o, d, near, far, out) => {
      const r = TREE_R * t.rs * 0.95;
      const ox = o.x - t.x, oz = o.z - t.z;
      const A = d.x * d.x + d.z * d.z;
      if (A < 1e-9) return;
      const B = 2 * (ox * d.x + oz * d.z), C = ox * ox + oz * oz - r * r;
      const disc = B * B - 4 * A * C;
      if (disc < 0) return;
      const s = (-B - Math.sqrt(disc)) / (2 * A);
      if (s < near || s > far) return;
      const y = o.y + d.y * s;
      if (y < t.y - 0.2 || y > t.y + TREE_H * t.hs * 0.8) return;
      const px = o.x + d.x * s, pz = o.z + d.z * s;
      out.push({ distance: s, point: new THREE.Vector3(px, y, pz), object: proxy,
        face: { a: 0, b: 0, c: 0, normal: new THREE.Vector3(px - t.x, 0, pz - t.z).normalize(), materialIndex: 0 } });
    };
    proxy.raycast = function (raycaster, out) {
      const o = raycaster.ray.origin, d = raycaster.ray.direction;
      const far = Math.min(raycaster.far, 200), near = raycaster.near;
      const x1 = o.x + d.x * far, z1 = o.z + d.z * far;
      const i0 = Math.floor(Math.min(o.x, x1) / CELL) - 1, i1 = Math.floor(Math.max(o.x, x1) / CELL) + 1;
      const j0 = Math.floor(Math.min(o.z, z1) / CELL) - 1, j1 = Math.floor(Math.max(o.z, z1) / CELL) + 1;
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const lst = grid.get(key(i, j));
        if (lst) for (const t of lst) test(t, o, d, near, far, out);
      }
    };
    const props = new THREE.Group();
    props.name = 'props';
    props.add(proxy);
    scene.add(props);
    api.props = props;
  }

  /* ---------------------------------------------- валежник и пни */
  function buildDeadwood(THREE, scene, api, F, M, trees) {
    const rnd = U.rng(6061);
    const logs = new Geo(), sticks = new Geo();
    const H = F.heightAt;
    const inPlay = (x, z) => Math.abs(x) < 31 && Math.abs(z) < 36;
    const blocked = (x, z, r) => inZones(api._noGrass, x, z) || trees.near(x, z, r)
      || F.squadD(x, z) < 1.4 || Math.hypot(x, z - 8.4) < 1.5;
    /* брёвна и пни — только в лесу */
    let placed = 0;
    for (let tries = 0; tries < 900 && placed < 40; tries++) {
      const a = rnd() * TAU, d = 10 + rnd() * 48;
      const x = Math.cos(a) * d, z = 2 + Math.sin(a) * d;
      if (F.clearE(x, z) < 1.1 || F.laneD(x, z) < 1.5 || blocked(x, z, 1.0)) continue;
      if (rnd() < 0.35) {
        const r = 0.2 + rnd() * 0.14, h = 0.3 + rnd() * 0.5, y = H(x, z);
        const pts = [[x, y - 0.25, z], [x, y + 0.05, z], [x, y + h * 0.5, z], [x, y + h, z]];
        logs.tube(pts, [r * 1.45, r * 1.3, r * 1.02, r], 10, { uRep: 2, vScale: 1.25, u0: rnd(),
          col: (t) => mixc([0.42, 0.46, 0.35], [0.9, 0.9, 0.88], t) });
        logs.cap([x, y + h, z], [0, 1, 0], r, 10, [1.25, 1.02, 0.78]);
        if (inPlay(x, z)) api.colliders.push({ type: 'cyl', x, z, r: r + 0.05, h });
      } else {
        const L = 3 + rnd() * 4.5, r = 0.11 + rnd() * 0.12, yaw = rnd() * TAU;
        const dx = Math.cos(yaw), dz = Math.sin(yaw), n = 6, pts = [], radii = [];
        let bad = false;
        for (let k = 0; k < n; k++) {
          const u = k / (n - 1), px = x + dx * (u - 0.5) * L, pz = z + dz * (u - 0.5) * L;
          if (F.clearE(px, pz) < 1.05 || F.laneD(px, pz) < 1.0 || trees.near(px, pz, 0.3)) { bad = true; break; }
          const rr = r * (1 - 0.3 * u);
          pts.push([px, H(px, pz) + rr * 0.72 + Math.sin(u * 3.1) * 0.03, pz]); radii.push(rr);
        }
        if (bad) continue;
        const ph = rnd() * 6;
        logs.tube(pts, radii, 9, { uRep: 2, vScale: 1.25, u0: rnd(),
          col: (t) => mixc([0.46, 0.50, 0.38], [0.85, 0.84, 0.82], 0.35 + 0.4 * Math.sin(t * 9 + ph)) });
        const d0 = v3norm(v3sub(pts[0], pts[1])), d1 = v3norm(v3sub(pts[n - 1], pts[n - 2]));
        logs.cap(pts[0], d0, radii[0], 9, [1.1, 0.92, 0.72]);
        logs.cap(pts[n - 1], d1, radii[n - 1], 9, [1.1, 0.92, 0.72]);
        for (let k = 0; k < n; k += 2) {
          const p = pts[k];
          if (inPlay(p[0], p[2])) api.colliders.push({ type: 'cyl', x: p[0], z: p[2], r: radii[k] + 0.04, h: 0.5 });
        }
      }
      placed++;
    }
    /* мелкие сухие ветки — везде, на поляне реже */
    let sn = 0;
    for (let tries = 0; tries < 3000 && sn < 340; tries++) {
      const a = rnd() * TAU, d = 2 + Math.pow(rnd(), 0.8) * 46;
      const x = Math.cos(a) * d, z = 2 + Math.sin(a) * d;
      if (F.clearE(x, z) < 1 && rnd() < 0.55) continue;
      if (blocked(x, z, 0.2)) continue;
      const L = 0.4 + rnd() * 1.5, r = 0.012 + rnd() * 0.03, yaw = rnd() * TAU;
      const dx = Math.cos(yaw), dz = Math.sin(yaw);
      const pts = [], radii = [];
      for (let k = 0; k < 4; k++) {
        const u = k / 3, off = Math.sin(u * 3 + yaw) * 0.06;
        const px = x + dx * (u - 0.5) * L - dz * off, pz = z + dz * (u - 0.5) * L + dx * off;
        pts.push([px, H(px, pz) + r * 0.8 + Math.sin(u * Math.PI) * 0.04, pz]);
        radii.push(r * (1 - 0.6 * u));
      }
      const tone = 0.7 + rnd() * 0.4;
      const colf = () => [tone, tone * 0.97, tone * 0.93];
      sticks.tube(pts, radii, 5, { uRep: 1, vScale: 0.6, u0: rnd(), v0: rnd(), col: colf });
      const tw = Math.floor(rnd() * 3.5);
      for (let k = 0; k < tw; k++) {
        const b = pts[1 + Math.floor(rnd() * 2)], sa = yaw + (rnd() < 0.5 ? 0.8 : -0.8) + (rnd() - 0.5) * 0.4;
        const l2 = L * (0.2 + rnd() * 0.3);
        const e = [b[0] + Math.cos(sa) * l2, 0, b[2] + Math.sin(sa) * l2];
        e[1] = H(e[0], e[2]) + 0.02 + rnd() * 0.08;
        sticks.tube([b, e], [r * 0.45, 0.003], 3, { uRep: 1, vScale: 0.6, u0: rnd(), col: colf });
      }
      sn++;
    }
    const g = new THREE.Group();
    g.name = 'deadwood';
    const lm = new THREE.Mesh(logs.build(THREE), M.bark);
    lm.castShadow = lm.receiveShadow = true;
    const sm = new THREE.Mesh(sticks.build(THREE), M.deadwood);
    sm.receiveShadow = true;
    g.add(lm, sm);
    scene.add(g);
    api.deadwood = g;
  }

  /* ------------------------------------------------------- подлесок */
  function buildUndergrowth(THREE, scene, api, F, M, trees) {
    const rnd = U.rng(9091);
    const H = F.heightAt;
    const feet = [-4.2, -1.75, 1.75, 4.2];
    const blocked = (x, z) => inZones(api._noGrass, x, z) || trees.near(x, z, 0.15) ||
      (Math.abs(z - SQUAD_LINE.z) < 0.9 && feet.some((fx) => Math.abs(x - fx) < 0.9)) ||
      Math.hypot(x, z - 8.4) < 1.0;
    const dummy = new THREE.Object3D();

    /* пучки травы: три скрещенные плоскости, ячейка атласа на инстанс */
    const tuft = new Geo();
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI, s = [Math.cos(a), 0, Math.sin(a)];
      tuft.strip([[0, -0.02, 0], [0, 0.3, 0]], [s, s], [0.6, 0.6], [[0, 1, 0]], null, false);
    }
    const tuftGeo = tuft.build(THREE);
    const GN = 6500;
    const cells = new Float32Array(GN * 2);
    const grass = new THREE.InstancedMesh(tuftGeo, M.grass, GN);
    let gi = 0;
    const put = (x, z, s) => {
      if (gi >= GN || blocked(x, z)) return;
      dummy.position.set(x, H(x, z), z);
      dummy.rotation.set((rnd() - 0.5) * 0.15, rnd() * TAU, (rnd() - 0.5) * 0.15);
      dummy.scale.set(s, s * (0.7 + rnd() * 0.6), s);
      dummy.updateMatrix();
      grass.setMatrixAt(gi, dummy.matrix);
      if (M.grassAtlas) {
        cells[gi * 2] = rnd() < 0.5 ? 0 : 0.5;
        cells[gi * 2 + 1] = rnd() < 0.72 ? 0.5 : 0;   // верхний ряд атласа — сухая трава
      }
      gi++;
    };
    for (let c = 0; c < 360; c++) {
      const a = rnd() * TAU, d = 3 + Math.pow(rnd(), 0.7) * 55;
      const cx = Math.cos(a) * d, cz = 2 + Math.sin(a) * d, r = 0.6 + rnd() * 2.2;
      const n = (4 + Math.floor(rnd() * 22)) * (F.clearE(cx, cz) < 1 ? 0.4 : 1);
      for (let k = 0; k < n; k++) {
        const b = rnd() * TAU, rr = Math.sqrt(rnd()) * r;
        put(cx + Math.cos(b) * rr, cz + Math.sin(b) * rr, 0.6 + rnd() * 0.7);
      }
    }
    for (let k = 0; k < 1400; k++) {
      const a = rnd() * TAU, d = 2 + rnd() * 50;
      put(Math.cos(a) * d, 2 + Math.sin(a) * d, 0.5 + rnd() * 0.6);
    }
    grass.count = gi;
    tuftGeo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 2));
    grass.instanceMatrix.needsUpdate = true;
    grass.receiveShadow = true;
    grass.userData.noAO = true;
    grass.name = 'grass';
    grass.computeBoundingSphere();
    scene.add(grass);
    api.grass = grass;

    /* папоротник: восемь изогнутых вай-карточек из одной точки */
    if (!M.fern) return;
    const fg = new Geo(), fr = U.rng(4);
    const nf = 8;
    for (let k = 0; k < nf; k++) {
      const a = (k / nf) * TAU + (fr() - 0.5) * 0.5;
      const L = 0.75 + fr() * 0.35, rise = 0.95 + fr() * 0.35;
      const dh = [Math.cos(a), 0, Math.sin(a)], side = [-Math.sin(a), 0, Math.cos(a)];
      const pts = [], sides = [], widths = [], nrms = [];
      for (let s = 0; s <= 5; s++) {
        const u = s / 5, el = rise * (1 - u * 1.25);
        const p = s === 0 ? [dh[0] * 0.03, 0.0, dh[2] * 0.03]
          : v3add(pts[s - 1], [dh[0] * Math.cos(el), Math.sin(el), dh[2] * Math.cos(el)], L / 5);
        pts.push(p);
        sides.push(v3norm([side[0], (u - 0.3) * 0.5, side[2]]));   // лёгкое скручивание вайи
        widths.push(0.24);
        nrms.push(v3norm([dh[0] * 0.4, 1, dh[2] * 0.4]));
      }
      fg.strip(pts, sides, widths, nrms, (u) => mixc([0.7, 0.7, 0.7], [1, 1, 1], u), false);
    }
    const FN = 520;
    const ferns = new THREE.InstancedMesh(fg.build(THREE), M.fern, FN);
    let fi = 0;
    for (let tries = 0; tries < 6000 && fi < FN; tries++) {
      /* куртины у стволов и по краю поляны */
      let x, z;
      if (rnd() < 0.55 && trees.length) {
        const t = trees[Math.floor(rnd() * trees.length)];
        if (t.d > 50) continue;
        const a = rnd() * TAU, r = 0.6 + rnd() * 1.8;
        x = t.x + Math.cos(a) * r; z = t.z + Math.sin(a) * r;
      } else {
        const a = rnd() * TAU, d = 9 + rnd() * 42;
        x = Math.cos(a) * d; z = 2 + Math.sin(a) * d;
      }
      if (F.clearE(x, z) < 0.92 || F.laneD(x, z) < 0.3 || blocked(x, z)) continue;
      const s = 0.6 + rnd() * 0.7;
      dummy.position.set(x, H(x, z) - 0.02, z);
      dummy.rotation.set((rnd() - 0.5) * 0.2, rnd() * TAU, (rnd() - 0.5) * 0.2);
      dummy.scale.set(s, s * (0.8 + rnd() * 0.4), s);
      dummy.updateMatrix();
      ferns.setMatrixAt(fi++, dummy.matrix);
    }
    ferns.count = fi;
    ferns.instanceMatrix.needsUpdate = true;
    ferns.receiveShadow = true;
    ferns.userData.noAO = true;
    ferns.name = 'ferns';
    ferns.computeBoundingSphere();
    scene.add(ferns);
    api.ferns = ferns;
  }

  function inZones(zones, x, z) {
    for (const q of zones) {
      if (q.r !== undefined) { if ((x - q.x) * (x - q.x) + (z - q.z) * (z - q.z) < q.r * q.r) return true; }
      else if (x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1) return true;
    }
    return false;
  }

  /* ============================================================== ДОМИК = */
  /* Небольшой садовый дом: сруб из досок, двускатная крыша, крыльцо,
     окна и дверь — но закрытые. Внутрь не зайти: коллизия по всему объёму. */
  function buildHouse(THREE, scene, api) {
    const g = new THREE.Group();
    g.name = 'house';
    const HX = -13.5, HZ = -16.0;            // центр дома
    const W = 5.4, D = 4.4, H = 2.55;

    const woodTex = new THREE.CanvasTexture(T.woodAlbedo(11, 512, [118, 96, 70]));
    woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
    woodTex.anisotropy = 8;
    if ('colorSpace' in woodTex) woodTex.colorSpace = THREE.SRGBColorSpace;
    const woodNrm = new THREE.CanvasTexture(T.fabricNormal(12, 256, 18, 1.1));
    woodNrm.wrapS = woodNrm.wrapT = THREE.RepeatWrapping;

    const wood = new THREE.MeshStandardMaterial({
      map: woodTex, normalMap: woodNrm, normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: 0.88, metalness: 0
    });
    const woodDark = new THREE.MeshStandardMaterial({
      map: woodTex.clone(), roughness: 0.84, metalness: 0,
      color: new THREE.Color(0.62, 0.58, 0.54)
    });
    woodDark.map.repeat.set(2, 2);
    woodDark.map.needsUpdate = true;

    /* фундамент */
    const found = new THREE.Mesh(new THREE.BoxGeometry(W + 0.5, 0.38, D + 0.5),
      new THREE.MeshStandardMaterial({ color: 0x6d6963, roughness: 0.95 }));
    found.position.set(HX, 0.19, HZ);
    found.castShadow = found.receiveShadow = true;
    g.add(found);

    /* стены из бруса: горизонтальные брёвна дают силуэт сруба */
    const logR = 0.115;
    const rows = Math.floor(H / (logR * 2 * 0.92));
    for (let i = 0; i < rows; i++) {
      const y = 0.38 + logR + i * logR * 1.84;
      for (const [len, rot, px, pz] of [
        [W, 0, 0, -D / 2], [W, 0, 0, D / 2],
        [D, Math.PI / 2, -W / 2, 0], [D, Math.PI / 2, W / 2, 0]
      ]) {
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(logR, logR, len, 10, 1), wood);
        cyl.rotation.z = Math.PI / 2;
        cyl.rotation.y = rot;
        cyl.position.set(HX + px, y, HZ + pz);
        cyl.castShadow = cyl.receiveShadow = true;
        g.add(cyl);
      }
    }

    /* внутренняя «пробка»: дом непрозрачный, внутрь не видно */
    const core = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, H, D - 0.1),
      new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 1 }));
    core.position.set(HX, 0.38 + H / 2, HZ);
    core.castShadow = core.receiveShadow = true;
    g.add(core);

    /* фронтоны и двускатная крыша */
    const roofH = 1.25;
    for (const s of [1, -1]) {
      const tri = new THREE.Shape();
      tri.moveTo(-W / 2, 0); tri.lineTo(W / 2, 0); tri.lineTo(0, roofH); tri.closePath();
      const m = new THREE.Mesh(new THREE.ShapeGeometry(tri), woodDark);
      m.position.set(HX, 0.38 + H, HZ + s * D / 2);
      if (s < 0) m.rotation.y = Math.PI;
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    }
    const slopeLen = Math.hypot(W / 2, roofH) + 0.22;
    const shingle = new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.92, metalness: 0.02 });
    for (const s of [1, -1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.06, D + 0.6), shingle);
      p.position.set(HX + s * (W / 4 + 0.06), 0.38 + H + roofH / 2 + 0.02, HZ);
      p.rotation.z = -s * Math.atan2(roofH, W / 2);
      p.castShadow = p.receiveShadow = true;
      g.add(p);
    }

    /* дверь (закрытая) и наличники */
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.92, 1.95, 0.07),
      new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.8, color: new THREE.Color(0.72, 0.62, 0.5) }));
    door.position.set(HX + 1.05, 0.38 + 0.98, HZ + D / 2 + 0.06);
    door.castShadow = door.receiveShadow = true;
    g.add(door);
    const handle = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x8a7a55, roughness: 0.4, metalness: 0.7 }));
    handle.position.set(HX + 0.70, 0.38 + 1.02, HZ + D / 2 + 0.11);
    g.add(handle);

    /* окна: тёмное стекло с рамой — внутрь всё равно не видно */
    const glass = new THREE.MeshStandardMaterial({
      color: 0x1b2429, roughness: 0.12, metalness: 0.35, envMapIntensity: 1.4
    });
    const frame = new THREE.MeshStandardMaterial({ color: 0xa9a294, roughness: 0.75 });
    const mkWindow = (x, y, z, w, h, ry) => {
      const gl = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), glass);
      gl.position.set(x, y, z); gl.rotation.y = ry;
      g.add(gl);
      for (const [ox, oy, sw, sh] of [[0, h / 2, w + 0.1, 0.07], [0, -h / 2, w + 0.1, 0.07],
        [-w / 2, 0, 0.07, h + 0.14], [w / 2, 0, 0.07, h + 0.14], [0, 0, 0.05, h]]) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, 0.07), frame);
        f.position.set(x + Math.cos(ry) * ox, y + oy, z - Math.sin(ry) * ox);
        f.rotation.y = ry;
        f.castShadow = true;
        g.add(f);
      }
    };
    mkWindow(HX - 1.30, 0.38 + 1.55, HZ + D / 2 + 0.06, 1.0, 0.85, 0);
    mkWindow(HX + W / 2 + 0.06, 0.38 + 1.55, HZ - 0.6, 0.9, 0.8, Math.PI / 2);
    mkWindow(HX - W / 2 - 0.06, 0.38 + 1.55, HZ + 0.4, 0.9, 0.8, Math.PI / 2);

    /* крыльцо со ступенями и навесом */
    const porch = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.16, 1.1), woodDark);
    porch.position.set(HX + 1.05, 0.38 - 0.02, HZ + D / 2 + 0.62);
    porch.castShadow = porch.receiveShadow = true;
    g.add(porch);
    for (let i = 0; i < 2; i++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.13, 0.32), woodDark);
      st.position.set(HX + 1.05, 0.24 - i * 0.13, HZ + D / 2 + 1.25 + i * 0.30);
      st.castShadow = st.receiveShadow = true;
      g.add(st);
    }
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.1, 8), wood);
      post.position.set(HX + 1.05 + s * 0.78, 0.38 + 1.05, HZ + D / 2 + 1.0);
      post.castShadow = true;
      g.add(post);
    }
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.07, 1.5), shingle);
    canopy.position.set(HX + 1.05, 0.38 + 2.12, HZ + D / 2 + 0.82);
    canopy.rotation.x = -0.12;
    canopy.castShadow = true;
    g.add(canopy);

    /* печная труба */
    const chim = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.95, 0.42),
      new THREE.MeshStandardMaterial({ color: 0x7d5c4e, roughness: 0.95 }));
    chim.position.set(HX - 1.4, 0.38 + H + roofH * 0.72, HZ - 0.8);
    chim.castShadow = true;
    g.add(chim);

    scene.add(g);
    /* коллизия по всему дому + крыльцу */
    api.colliders.push({ type: 'box', x0: HX - W / 2 - 0.3, x1: HX + W / 2 + 0.3, z0: HZ - D / 2 - 0.3, z1: HZ + D / 2 + 0.3, h: 3.4 });
    api.colliders.push({ type: 'box', x0: HX + 0.1, x1: HX + 2.0, z0: HZ + D / 2 + 0.05, z1: HZ + D / 2 + 1.2, h: 0.4 });
    api._noGrass.push({ x0: HX - W / 2 - 1.2, x1: HX + W / 2 + 1.2, z0: HZ - D / 2 - 1.2, z1: HZ + D / 2 + 2.2 });
    api.house = g;
  }

  /* =========================================================== ОГОРОД === */
  /* Садовый участок: вскопанные грядки с бортиками, посадки (капуста,
     лук, кусты томатов с подвязкой), парник, бочка, дорожка из плитки. */
  function buildGarden(THREE, scene, api) {
    const g = new THREE.Group();
    g.name = 'garden';
    const GX = -13.0, GZ = -5.5;            // центр огорода

    const soilTex = new THREE.CanvasTexture(soilCanvas());
    soilTex.wrapS = soilTex.wrapT = THREE.RepeatWrapping;
    soilTex.repeat.set(3, 1.6);
    soilTex.anisotropy = 8;
    if ('colorSpace' in soilTex) soilTex.colorSpace = THREE.SRGBColorSpace;
    const soilNrm = new THREE.CanvasTexture(T.fabricNormal(21, 256, 9, 2.2));
    soilNrm.wrapS = soilNrm.wrapT = THREE.RepeatWrapping;
    soilNrm.repeat.set(4, 2);
    const soilMat = new THREE.MeshStandardMaterial({
      map: soilTex, normalMap: soilNrm, normalScale: new THREE.Vector2(1.4, 1.4),
      roughness: 0.98, metalness: 0
    });
    const plankMat = new THREE.MeshStandardMaterial({
      map: new THREE.CanvasTexture(T.woodAlbedo(33, 256, [104, 86, 62])),
      roughness: 0.92, metalness: 0
    });
    plankMat.map.wrapS = plankMat.map.wrapT = THREE.RepeatWrapping;
    plankMat.map.repeat.set(3, 1);
    if ('colorSpace' in plankMat.map) plankMat.map.colorSpace = THREE.SRGBColorSpace;

    const BEDS = [
      { x: GX - 2.0, z: GZ - 2.6, w: 3.0, d: 1.25, crop: 'cabbage' },
      { x: GX - 2.0, z: GZ - 0.7, w: 3.0, d: 1.25, crop: 'onion' },
      { x: GX - 2.0, z: GZ + 1.2, w: 3.0, d: 1.25, crop: 'tomato' },
      { x: GX + 2.1, z: GZ - 1.8, w: 2.6, d: 1.15, crop: 'carrot' },
      { x: GX + 2.1, z: GZ + 0.4, w: 2.6, d: 1.15, crop: 'cabbage' }
    ];

    const rnd = U.rng(555);
    for (const b of BEDS) {
      /* земля грядки: слегка вспаханная поверхность с бороздами */
      const seg = 24;
      const geo = new THREE.PlaneGeometry(b.w, b.d, seg, Math.max(6, Math.round(seg * b.d / b.w)));
      geo.rotateX(-Math.PI / 2);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const lx = p.getX(i), lz = p.getZ(i);
        /* борозды вдоль длинной стороны */
        const furrow = Math.sin(lz * 9.5) * 0.020;
        p.setY(i, 0.11 + furrow + (rnd() - 0.5) * 0.012);
      }
      geo.computeVertexNormals();
      const bed = new THREE.Mesh(geo, soilMat);
      bed.position.set(b.x, 0, b.z);
      bed.receiveShadow = true;
      g.add(bed);

      /* деревянный бортик */
      for (const [dx, dz, sx, sz] of [
        [0, -b.d / 2, b.w + 0.1, 0.05], [0, b.d / 2, b.w + 0.1, 0.05],
        [-b.w / 2, 0, 0.05, b.d], [b.w / 2, 0, 0.05, b.d]
      ]) {
        const pl = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.16, sz), plankMat);
        pl.position.set(b.x + dx, 0.08, b.z + dz);
        pl.castShadow = pl.receiveShadow = true;
        g.add(pl);
      }

      plantCrop(THREE, g, b, rnd);
      api._noGrass.push({ x0: b.x - b.w / 2 - 0.25, x1: b.x + b.w / 2 + 0.25, z0: b.z - b.d / 2 - 0.25, z1: b.z + b.d / 2 + 0.25 });
      api.colliders.push({ type: 'box', x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2, h: 0.20, step: true });
    }

    /* парник: дуги с полупрозрачной плёнкой */
    const filmMat = new THREE.MeshPhysicalMaterial({
      color: 0xdfece8, roughness: 0.42, metalness: 0, transmission: 0.55,
      transparent: true, opacity: 0.62, side: THREE.DoubleSide, thickness: 0.02
    });
    const arcMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.5, metalness: 0.6 });
    const gh = new THREE.Group();
    const GHX = GX + 0.2, GHZ = GZ + 3.4, GHL = 3.2, GHR = 0.85;
    for (let i = 0; i <= 6; i++) {
      const z = GHZ - GHL / 2 + (i / 6) * GHL;
      const arc = new THREE.Mesh(new THREE.TorusGeometry(GHR, 0.018, 6, 20, Math.PI), arcMat);
      arc.position.set(GHX, 0.02, z);
      arc.rotation.y = Math.PI / 2;
      arc.castShadow = true;
      gh.add(arc);
    }
    const film = new THREE.Mesh(new THREE.CylinderGeometry(GHR, GHR, GHL, 20, 1, true, 0, Math.PI), filmMat);
    film.rotation.z = Math.PI / 2;
    film.position.set(GHX, 0.02, GHZ);
    gh.add(film);
    g.add(gh);
    api.colliders.push({ type: 'box', x0: GHX - GHR, x1: GHX + GHR, z0: GHZ - GHL / 2, z1: GHZ + GHL / 2, h: 1.0 });
    api._noGrass.push({ x0: GHX - GHR - 0.3, x1: GHX + GHR + 0.3, z0: GHZ - GHL / 2 - 0.3, z1: GHZ + GHL / 2 + 0.3 });

    /* бочка для полива */
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.40, 0.92, 20, 1),
      new THREE.MeshStandardMaterial({ color: 0x3f5b4a, roughness: 0.72, metalness: 0.25 }));
    barrel.position.set(GX + 4.2, 0.46, GZ - 3.2);
    barrel.castShadow = barrel.receiveShadow = true;
    g.add(barrel);
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.39, 20),
      new THREE.MeshStandardMaterial({ color: 0x24333a, roughness: 0.08, metalness: 0.2 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(GX + 4.2, 0.86, GZ - 3.2);
    g.add(water);
    api.colliders.push({ type: 'cyl', x: GX + 4.2, z: GZ - 3.2, r: 0.46, h: 0.95 });

    /* садовая дорожка из плитки */
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8d8880, roughness: 0.95 });
    for (let i = 0; i < 26; i++) {
      const t = i / 25;
      const x = U.lerp(GX + 5.4, -9.0, t) + Math.sin(t * 5) * 0.5;
      const z = U.lerp(GZ + 4.0, -13.5, t);
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.06, 0.44), stoneMat);
      s.position.set(x, 0.035, z);
      s.rotation.y = (U.rng(i + 3)() - 0.5) * 0.5;
      s.receiveShadow = true;
      g.add(s);
      api._noGrass.push({ x, z, r: 0.42 });
    }

    /* инструмент у стены: лопата и грабли */
    const tool = (x, z, headFn) => {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 1.5, 8), plankMat);
      handle.position.set(x, 0.75, z);
      handle.rotation.z = 0.22;
      handle.castShadow = true;
      g.add(handle);
      headFn(x - 0.17, z);
    };
    const metal = new THREE.MeshStandardMaterial({ color: 0x8b8f93, roughness: 0.45, metalness: 0.75 });
    tool(GX + 5.1, GZ + 1.2, (x, z) => {
      const bl = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.03), metal);
      bl.position.set(x, 0.16, z); bl.rotation.z = 0.22; bl.castShadow = true; g.add(bl);
    });
    tool(GX + 5.5, GZ + 1.5, (x, z) => {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.04), metal);
      bar.position.set(x, 0.10, z); bar.castShadow = true; g.add(bar);
      for (let i = 0; i < 6; i++) {
        const t2 = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.005, 0.11, 5), metal);
        t2.position.set(x - 0.15 + i * 0.06, 0.045, z); g.add(t2);
      }
    });

    scene.add(g);
    api.garden = g;
  }

  /* Земля грядки: тёмный влажный грунт с комьями. */
  function soilCanvas() {
    const S = 256;
    const c = T.canvas(S), gg = T.ctx2d(c);
    const f = U.fbm(4321, 5, 0.55, 2.3);
    const img = gg.createImageData(S, S), d = img.data;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const n = f(x / S * 9, y / S * 9) * 0.65 + f(x / S * 34, y / S * 34) * 0.35;
        const i = (y * S + x) * 4;
        d[i] = U.clamp(44 + n * 46, 0, 255);
        d[i + 1] = U.clamp(33 + n * 36, 0, 255);
        d[i + 2] = U.clamp(24 + n * 26, 0, 255);
        d[i + 3] = 255;
      }
    }
    gg.putImageData(img, 0, 0);
    return c;
  }

  /* Посадки: простые, но узнаваемые силуэты. */
  function plantCrop(THREE, g, b, rnd) {
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x51762f, roughness: 0.82, metalness: 0, side: THREE.DoubleSide
    });
    const cabMat = new THREE.MeshStandardMaterial({ color: 0x86a05a, roughness: 0.74, side: THREE.DoubleSide });
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x4a6a2c, roughness: 0.88 });
    const cols = Math.max(2, Math.floor(b.w / 0.52));
    const rows = Math.max(1, Math.floor(b.d / 0.55));
    for (let r = 0; r < rows; r++) {
      for (let cIdx = 0; cIdx < cols; cIdx++) {
        const x = b.x - b.w / 2 + (cIdx + 0.5) * (b.w / cols) + (rnd() - 0.5) * 0.05;
        const z = b.z - b.d / 2 + (r + 0.5) * (b.d / rows) + (rnd() - 0.5) * 0.05;
        const y = 0.12;
        if (b.crop === 'cabbage') {
          /* кочан: вложенные изогнутые листья */
          const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 9), cabMat);
          head.position.set(x, y + 0.10, z);
          head.scale.y = 0.85;
          head.castShadow = head.receiveShadow = true;
          g.add(head);
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * TAU + rnd();
            const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.16, 8, 0, Math.PI), cabMat);
            leaf.position.set(x + Math.cos(a) * 0.09, y + 0.035, z + Math.sin(a) * 0.09);
            leaf.rotation.set(-Math.PI / 2 + 0.55, 0, a);
            leaf.castShadow = true;
            g.add(leaf);
          }
        } else if (b.crop === 'onion') {
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * TAU;
            const h = 0.22 + rnd() * 0.14;
            const bl = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.013, h, 5), stemMat);
            bl.position.set(x + Math.cos(a) * 0.03, y + h / 2, z + Math.sin(a) * 0.03);
            bl.rotation.set(Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35);
            bl.castShadow = true;
            g.add(bl);
          }
        } else if (b.crop === 'carrot') {
          for (let i = 0; i < 9; i++) {
            const a = rnd() * TAU, rr = rnd() * 0.07;
            const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.19), leafMat);
            leaf.position.set(x + Math.cos(a) * rr, y + 0.09, z + Math.sin(a) * rr);
            leaf.rotation.set(-0.5 + rnd() * 0.4, a, 0);
            g.add(leaf);
          }
        } else {
          /* томат: стебель, подвязка к колышку, листья и плоды */
          const hgt = 0.62 + rnd() * 0.22;
          const st = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.016, hgt, 6), stemMat);
          st.position.set(x, y + hgt / 2, z);
          st.castShadow = true;
          g.add(st);
          const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, hgt + 0.20, 5),
            new THREE.MeshStandardMaterial({ color: 0x7d6446, roughness: 0.9 }));
          stake.position.set(x + 0.055, y + (hgt + 0.20) / 2, z);
          stake.castShadow = true;
          g.add(stake);
          for (let i = 0; i < 5; i++) {
            const hh = 0.14 + i * (hgt - 0.18) / 5;
            const a = i * 1.9;
            const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.10), leafMat);
            leaf.position.set(x + Math.cos(a) * 0.09, y + hh, z + Math.sin(a) * 0.09);
            leaf.rotation.set(-0.35, a, 0.2);
            leaf.castShadow = true;
            g.add(leaf);
          }
          if (rnd() > 0.35) {
            const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.030, 9, 7),
              new THREE.MeshStandardMaterial({ color: 0xa8341f, roughness: 0.42 }));
            fruit.position.set(x + 0.06, y + hgt * 0.55, z + 0.03);
            fruit.castShadow = true;
            g.add(fruit);
          }
        }
      }
    }
  }

  /* ========================================================= СТРЕЛЬБИЩЕ = */
  /* Огневой рубеж в точке FIRE_LINE, мишени строго на 5, 10, 20 и 30 м
     по оси -Z. Каждая мишень — поворотная рама: попадание роняет её,
     через пару секунд она поднимается. */
  const FIRE_LINE = { x: 6.5, z: 8.0 };
  const RANGES = [5, 10, 20, 30];

  function buildRange(THREE, scene, api) {
    const g = new THREE.Group();
    g.name = 'range';

    const faceCv = T.targetFace(512);
    const faceTex = new THREE.CanvasTexture(faceCv);
    faceTex.anisotropy = 8;
    if ('colorSpace' in faceTex) faceTex.colorSpace = THREE.SRGBColorSpace;
    const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.93, metalness: 0, side: THREE.DoubleSide });
    const backMat = new THREE.MeshStandardMaterial({ color: 0x9a8f78, roughness: 0.95, side: THREE.DoubleSide });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x6f757a, roughness: 0.52, metalness: 0.72 });
    const woodMat = new THREE.MeshStandardMaterial({
      map: new THREE.CanvasTexture(T.woodAlbedo(88, 256, [112, 92, 66])), roughness: 0.9
    });
    if ('colorSpace' in woodMat.map) woodMat.map.colorSpace = THREE.SRGBColorSpace;

    /* огневой рубеж: помост с разметкой и упор */
    const mat = api.padMat || new THREE.MeshStandardMaterial({ color: 0x5c5a52, roughness: 0.95 });
    const padGeo = new THREE.BoxGeometry(4.6, 0.10, 2.2);
    const pad = new THREE.Mesh(padGeo, mat);
    pad.position.set(FIRE_LINE.x, 0.05, FIRE_LINE.z);
    pad.receiveShadow = true;
    g.add(pad);
    api._noGrass.push({ x0: FIRE_LINE.x - 2.4, x1: FIRE_LINE.x + 2.4, z0: FIRE_LINE.z - 1.2, z1: FIRE_LINE.z + 1.2 });
    /* стрелковый упор-стол */
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.09, 0.62), woodMat);
    bench.position.set(FIRE_LINE.x - 1.2, 1.02, FIRE_LINE.z - 0.5);
    bench.castShadow = bench.receiveShadow = true;
    g.add(bench);
    for (const [dx, dz] of [[-0.7, -0.24], [0.7, -0.24], [-0.7, 0.24], [0.7, 0.24]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.0, 0.07), woodMat);
      leg.position.set(FIRE_LINE.x - 1.2 + dx, 0.5, FIRE_LINE.z - 0.5 + dz);
      leg.castShadow = true;
      g.add(leg);
    }
    api.colliders.push({ type: 'box', x0: FIRE_LINE.x - 2.05, x1: FIRE_LINE.x - 0.35,
      z0: FIRE_LINE.z - 0.85, z1: FIRE_LINE.z - 0.15, h: 1.1, step: true });

    /* мишени */
    for (let i = 0; i < RANGES.length; i++) {
      const dist = RANGES[i];
      const x = FIRE_LINE.x + (i - 1.5) * 1.35;          // лёгкий веер, чтобы все были видны
      const z = FIRE_LINE.z - dist;
      const tg = makeTarget(THREE, faceMat, backMat, steelMat, woodMat, dist);
      tg.group.position.set(x, 0, z);
      g.add(tg.group);
      api.targets.push(tg);
      api._noGrass.push({ x, z, r: 0.85 });

      /* табличка с дистанцией */
      const sign = makeSign(THREE, dist + ' м');
      sign.position.set(x + 0.62, 0.52, z + 0.12);
      g.add(sign);

      /* пулеулавливающий вал позади дальних мишеней */
      if (i === RANGES.length - 1) {
        const berm = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.4, 2.1, 22, 1, false, 0, Math.PI),
          api.earthMat || new THREE.MeshStandardMaterial({ color: 0x6b5f4a, roughness: 1 }));
        berm.rotation.y = Math.PI;
        berm.position.set(FIRE_LINE.x - 2.0, 0, z - 3.0);
        berm.scale.set(1.8, 1, 0.9);
        berm.castShadow = berm.receiveShadow = true;
        g.add(berm);
        api.colliders.push({ type: 'box', x0: FIRE_LINE.x - 10, x1: FIRE_LINE.x + 6, z0: z - 4.4, z1: z - 2.2, h: 2.2 });
        api._noGrass.push({ x0: FIRE_LINE.x - 10, x1: FIRE_LINE.x + 6, z0: z - 4.6, z1: z - 2.0 });
      }
    }

    scene.add(g);
    api.range = g;
    api.fireLine = FIRE_LINE;
    api.ranges = RANGES;
  }

  /* Одна мишень: стойка, поворотная рама, картонное полотно.
     hinge — узел вращения; попадание переводит state в 'falling'. */
  function makeTarget(THREE, faceMat, backMat, steelMat, woodMat, dist) {
    const group = new THREE.Group();
    group.name = 'target_' + dist;

    /* Дальние мишени крупнее в мировых единицах? Нет: реальный размер
       одинаковый (0,5 × 0,75 м, поясная), иначе теряется смысл дистанций. */
    const W = 0.50, H = 0.75;

    /* опора */
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.034, 0.62, 8), steelMat);
      post.position.set(s * (W / 2 - 0.03), 0.31, 0);
      post.castShadow = post.receiveShadow = true;
      group.add(post);
    }
    const base = new THREE.Mesh(new THREE.BoxGeometry(W + 0.24, 0.05, 0.42), steelMat);
    base.position.set(0, 0.025, 0);
    base.castShadow = base.receiveShadow = true;
    group.add(base);

    /* поворотная рама с полотном */
    const hinge = new THREE.Group();
    hinge.position.set(0, 0.60, 0);
    group.add(hinge);

    const board = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.014), [
      backMat, backMat, backMat, backMat, faceMat, backMat
    ]);
    board.position.set(0, H / 2, 0);
    board.castShadow = board.receiveShadow = true;
    hinge.add(board);

    /* рамка */
    for (const [ox, oy, sx, sy] of [[0, H, W + 0.05, 0.035], [0, 0, W + 0.05, 0.035],
      [-W / 2, H / 2, 0.035, H], [W / 2, H / 2, 0.035, H]]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, 0.026), woodMat);
      f.position.set(ox, oy, -0.006);
      f.castShadow = true;
      hinge.add(f);
    }

    return {
      dist, group, hinge, board,
      state: 'up', t: 0, hits: 0, lastHit: -1,
      /* габарит полотна в локальной системе hinge — для попаданий */
      W, H,
      decals: []
    };
  }

  /* Табличка с текстом (дистанция). */
  function makeSign(THREE, text) {
    const c = T.canvas(256, 128);
    const g = T.ctx2d(c);
    g.fillStyle = '#e8e4d8'; g.fillRect(0, 0, 256, 128);
    g.strokeStyle = '#2a2b2d'; g.lineWidth = 7; g.strokeRect(6, 6, 244, 116);
    g.fillStyle = '#1e1f21';
    g.font = '700 62px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 128, 68);
    const tex = new THREE.CanvasTexture(c);
    if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
    const grp = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.17),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide }));
    plate.position.y = 0.30;
    plate.castShadow = true;
    grp.add(plate);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.52, 6),
      new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 0.8 }));
    post.position.y = 0.0;
    post.castShadow = true;
    grp.add(post);
    return grp;
  }

  /* ============================================================= ЗАБОР == */
  function buildFence(THREE, scene, api) {
    const g = new THREE.Group();
    g.name = 'fence';
    /* Ограждение полигона: серый выветренный брус вместо жёлтого штакетника.
       Базовый тон почти нейтральный, поэтому забор перестаёт быть самым
       ярким пятном на горизонте и читается как граница площадки. */
    const mat = new THREE.MeshStandardMaterial({
      map: new THREE.CanvasTexture(T.woodAlbedo(66, 256, [76, 76, 74])), roughness: 0.95
    });
    mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping;
    if ('colorSpace' in mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
    const postMat = new THREE.MeshStandardMaterial({ color: 0x55565a, roughness: 0.96 });

    const HX = FIELD.x / 2 - 3, HZ = FIELD.z / 2 - 3;
    const rnd = U.rng(707);
    const seg = 0.22;
    const sides = [
      { a: [-HX, HZ], b: [HX, HZ] }, { a: [HX, HZ], b: [HX, -HZ] },
      { a: [HX, -HZ], b: [-HX, -HZ] }, { a: [-HX, -HZ], b: [-HX, HZ] }
    ];
    for (const s of sides) {
      const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
      const n = Math.floor(len / seg);
      const dx = (s.b[0] - s.a[0]) / n, dz = (s.b[1] - s.a[1]) / n;
      const ang = Math.atan2(dz, dx);
      for (let i = 0; i < n; i++) {
        const x = s.a[0] + dx * (i + 0.5), z = s.a[1] + dz * (i + 0.5);
        const h = 1.22 + rnd() * 0.10;
        const pl = new THREE.Mesh(new THREE.BoxGeometry(seg * 0.82, h, 0.035), mat);
        pl.position.set(x, h / 2, z);
        pl.rotation.y = -ang + (rnd() - 0.5) * 0.03;
        pl.castShadow = pl.receiveShadow = true;
        g.add(pl);
      }
      /* столбы и прожилины */
      for (let i = 0; i <= n; i += 12) {
        const x = s.a[0] + dx * i, z = s.a[1] + dz * i;
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.10, 1.55, 0.10), postMat);
        p.position.set(x, 0.78, z);
        p.castShadow = true;
        g.add(p);
      }
      api.colliders.push({
        type: 'box',
        x0: Math.min(s.a[0], s.b[0]) - 0.15, x1: Math.max(s.a[0], s.b[0]) + 0.15,
        z0: Math.min(s.a[1], s.b[1]) - 0.15, z1: Math.max(s.a[1], s.b[1]) + 0.15, h: 1.4
      });
    }
    scene.add(g);
    api.fence = g;
  }

  /* ======================================================== ОКРУЖЕНИЕ === */
  /* Деревья по периметру, кусты, поленница — дают глубину и ориентиры. */
  function buildProps(THREE, scene, api) {
    const g = new THREE.Group();
    g.name = 'props';
    const rnd = U.rng(9182);

    const barkMat = new THREE.MeshStandardMaterial({
      map: new THREE.CanvasTexture(T.woodAlbedo(44, 256, [86, 72, 56])), roughness: 0.96
    });
    barkMat.map.wrapS = barkMat.map.wrapT = THREE.RepeatWrapping;
    barkMat.map.repeat.set(2, 3);
    if ('colorSpace' in barkMat.map) barkMat.map.colorSpace = THREE.SRGBColorSpace;

    /* крона: облако сплюснутых сфер с разными оттенками */
    const leafMats = [0x3c5424, 0x47612a, 0x33491f].map((c) =>
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.92, metalness: 0, flatShading: true }));

    const TREE_N = 26;
    for (let i = 0; i < TREE_N; i++) {
      const a = (i / TREE_N) * TAU + rnd() * 0.2;
      const rad = FIELD.x * 0.46 + rnd() * 4;
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad * (FIELD.z / FIELD.x);
      if (Math.abs(x) > FIELD.x / 2 + 6 || Math.abs(z) > FIELD.z / 2 + 6) continue;
      const h = 5.2 + rnd() * 3.6;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 + rnd() * 0.07, 0.28 + rnd() * 0.1, h, 9), barkMat);
      trunk.position.set(x, h / 2, z);
      trunk.castShadow = trunk.receiveShadow = true;
      g.add(trunk);
      const blobs = 5 + Math.floor(rnd() * 3);
      for (let b = 0; b < blobs; b++) {
        const r = 1.35 + rnd() * 1.0;
        const cr = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leafMats[b % 3]);
        cr.position.set(
          x + (rnd() - 0.5) * 2.1,
          h * 0.78 + (rnd() - 0.2) * 1.7,
          z + (rnd() - 0.5) * 2.1);
        cr.scale.y = 0.78;
        cr.castShadow = true;
        cr.receiveShadow = true;
        g.add(cr);
      }
      api.colliders.push({ type: 'cyl', x, z, r: 0.42, h: 3 });
    }

    /* кусты */
    for (let i = 0; i < 34; i++) {
      const x = (rnd() - 0.5) * (FIELD.x - 8), z = (rnd() - 0.5) * (FIELD.z - 8);
      if (Math.abs(x - FIELD.x * 0.1) < 9 && z > -26 && z < 12) continue;   // не мешать стрельбищу
      const r = 0.45 + rnd() * 0.5;
      const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leafMats[i % 3]);
      bush.position.set(x, r * 0.72, z);
      bush.scale.set(1, 0.72, 1);
      bush.castShadow = bush.receiveShadow = true;
      g.add(bush);
      api._noGrass.push({ x, z, r: r * 1.1 });
    }

    /* поленница у дома */
    const logMat = new THREE.MeshStandardMaterial({
      map: new THREE.CanvasTexture(T.woodAlbedo(21, 128, [122, 98, 68])), roughness: 0.94
    });
    if ('colorSpace' in logMat.map) logMat.map.colorSpace = THREE.SRGBColorSpace;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 9; c++) {
        const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.62, 7), logMat);
        lg.rotation.z = Math.PI / 2;
        lg.position.set(-8.6 + (r % 2) * 0.03, 0.09 + r * 0.155, -18.4 + c * 0.17);
        lg.castShadow = lg.receiveShadow = true;
        g.add(lg);
      }
    }
    api.colliders.push({ type: 'box', x0: -9.0, x1: -8.2, z0: -18.6, z1: -16.8, h: 0.9 });
    api._noGrass.push({ x0: -9.2, x1: -8.0, z0: -18.8, z1: -16.6 });

    scene.add(g);
    api.props = g;
  }

  return { build, FIELD, inZones, buildHouse, buildGarden, soilCanvas, plantCrop,
    buildRange, buildFence, buildProps, makeTarget, makeSign, FIRE_LINE, RANGES };
});