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
