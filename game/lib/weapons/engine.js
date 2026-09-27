// СГЕНЕРИРОВАНО game/tools/build_weapons.mjs из game/weapons/*.html — не редактировать вручную.
// Общий движок оружейной: материалы, геометрия, крепления, сборщик и библиотека модулей.
var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
// src/engine/materials.js
import * as THREE2 from "three";
function rng2(seed) {
  let s = seed >>> 0;
  return () => (s = s * 1664525 + 1013904223 >>> 0) / 4294967296;
}
function valueNoise(size, cells, seed) {
  const r = rng2(seed);
  const grid = new Float32Array((cells + 1) * (cells + 1));
  for (let i = 0; i < grid.length; i++) grid[i] = r();
  for (let i = 0; i <= cells; i++) {
    grid[i * (cells + 1) + cells] = grid[i * (cells + 1)];
    grid[cells * (cells + 1) + i] = grid[i];
  }
  const out = new Float32Array(size * size);
  const sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const gx = x / size * cells, gy = y / size * cells;
    const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = sm(gx - x0), fy = sm(gy - y0);
    const g = (i, j) => grid[j * (cells + 1) + i];
    const a = g(x0, y0) + (g(x0 + 1, y0) - g(x0, y0)) * fx;
    const b = g(x0, y0 + 1) + (g(x0 + 1, y0 + 1) - g(x0, y0 + 1)) * fx;
    out[y * size + x] = a + (b - a) * fy;
  }
  return out;
}
function fbm(size, octaves, seed, base = 4) {
  const out = new Float32Array(size * size);
  let amp = 1, tot = 0;
  for (let o = 0; o < octaves; o++) {
    const n = valueNoise(size, base << o, seed + o * 17);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    tot += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
function toTex(size, fill, srgb) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const [r, g, b] = fill(i);
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE2.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE2.RepeatWrapping;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE2.SRGBColorSpace;
  return t;
}
function normalFrom(h, size, strength) {
  return toTex(size, (i) => {
    const x = i % size, y = i / size | 0;
    const hx = h[y * size + (x + 1) % size] - h[y * size + (x - 1 + size) % size];
    const hy = h[(y + 1) % size * size + x] - h[(y - 1 + size) % size * size + x];
    let nx = -hx * strength, ny = -hy * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    return [(nx / l * 0.5 + 0.5) * 255, (ny / l * 0.5 + 0.5) * 255, (nz / l * 0.5 + 0.5) * 255];
  });
}
function roughFrom(h, size, lo, hi) {
  return toTex(size, (i) => {
    const v = (lo + (hi - lo) * h[i]) * 255;
    return [v, v, v];
  });
}
function makeTextures() {
  const S = 256;
  const coarse = fbm(S, 5, 11, 4);
  const fine = fbm(S, 3, 77, 32);
  const stipple = fbm(S, 2, 123, 64);
  const brushed = new Float32Array(S * S);
  const br = fbm(S, 4, 5, 8);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) brushed[y * S + x] = br[y * S + x * 7 % S] * 0.3 + br[y * 3 % S * S + x] * 0.7;
  const mix = new Float32Array(S * S);
  for (let i = 0; i < mix.length; i++) mix[i] = coarse[i] * 0.55 + fine[i] * 0.45;
  const streak = (() => {
    const n = fbm(S, 4, 555, 16), out = new Float32Array(S * S), R4 = 18;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let a = 0;
      for (let d = -R4; d <= R4; d++) a += n[y * S + (x + d + S) % S];
      out[y * S + x] = a / (2 * R4 + 1);
    }
    return out;
  })();
  const woodVal = (i) => {
    const y = (i / S | 0) / S;
    const ply = 0.5 + 0.5 * Math.sin((y + coarse[i] * 0.06) * Math.PI * 2 * 28);
    return (streak[i] - 0.5) * 1.6 + (ply - 0.5) * 0.12 + (coarse[i] - 0.5) * 0.25;
  };
  const wood = (hue) => toTex(S, (i) => {
    const k = 0.9 + woodVal(i) * 0.5;
    return [hue[0] * k, hue[1] * k, hue[2] * k];
  }, true);
  const woodH = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) woodH[i] = woodVal(i) * 0.5 + 0.5;
  return {
    rough: roughFrom(mix, S, 0.72, 1),
    roughStrong: roughFrom(coarse, S, 0.55, 1),
    roughBrushed: roughFrom(brushed, S, 0.7, 1),
    nMetal: normalFrom(fine, S, 1.4),
    nCast: normalFrom(mix, S, 3.2),
    nPoly: normalFrom(stipple, S, 5.5),
    nWood: normalFrom(woodH, S, 1.6),
    woodBirch: wood([100, 42, 24]),
    woodWalnut: wood([92, 58, 36])
  };
}
var WEAR_GLSL = `
varying vec3 vObjP;
uniform float uWear, uWearMetal, uWearRough, uGrime;
uniform vec3 uWearCol;
float wH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float wN(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wH(i), wH(i + vec3(1, 0, 0)), f.x), mix(wH(i + vec3(0, 1, 0)), wH(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(wH(i + vec3(0, 0, 1)), wH(i + vec3(1, 0, 1)), f.x), mix(wH(i + vec3(0, 1, 1)), wH(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`;
function addWear(mat, o) {
  const U = {
    uWear: { value: o.wear ?? 0.6 },
    uWearMetal: { value: o.metal ?? mat.metalness },
    uWearRough: { value: o.rough ?? 0.35 },
    uGrime: { value: o.grime ?? 1 },
    uWearCol: { value: new THREE2.Color(o.col ?? 9409174) }
  };
  mat.userData.wear = U;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vObjP;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvObjP = position;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\n" + WEAR_GLSL).replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
      {
        vec3 nn = normalize(vNormal);
        float px = max(length(fwidth(vViewPosition)), 1e-6);
        float curv = length(fwidth(nn)) / px;               // 1/м
        float brk = wN(vObjP * 0.45) * 0.65 + wN(vObjP * 2.1) * 0.35;
        float edge = smoothstep(170.0, 750.0, curv) * smoothstep(0.3, 0.6, brk);
        float m = clamp(edge * uWear, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, uWearCol, m);
        metalnessFactor = mix(metalnessFactor, uWearMetal, m);
        roughnessFactor = mix(roughnessFactor, uWearRough, m);
        float g1 = wN(vObjP * 0.018 + 3.1), g2 = wN(vObjP * 0.06 + 11.7);
        roughnessFactor = clamp(roughnessFactor * mix(1.0, 0.8 + 0.4 * g1, uGrime), 0.04, 1.0);
        diffuseColor.rgb *= mix(1.0, 0.93 + 0.14 * g2, uGrime);
      }`);
  };
  mat.customProgramCacheKey = () => "wear";
  return mat;
}
function createMaterials(envMap) {
  const tex2 = makeTextures();
  const rep = (t, mm) => {
    const c = t.clone();
    c.needsUpdate = true;
    c.repeat.set(1 / mm, 1 / mm);
    return c;
  };
  const R4 = {};
  const std = (o) => new THREE2.MeshStandardMaterial(o);
  const phys = (o) => new THREE2.MeshPhysicalMaterial(o);
  const metal = (color, rough, metal2, o = {}) => std({
    color,
    roughness: rough,
    metalness: metal2,
    roughnessMap: rep(o.brushed ? tex2.roughBrushed : tex2.rough, o.tile ?? 40),
    normalMap: rep(o.cast ? tex2.nCast : tex2.nMetal, o.tile ?? 30),
    normalScale: new THREE2.Vector2((o.ns ?? 0.35) * 0.45, (o.ns ?? 0.35) * 0.45),
    envMapIntensity: o.env ?? 1
  });
  const poly = (color, rough, o = {}) => std({
    color,
    roughness: rough,
    metalness: 0,
    roughnessMap: rep(tex2.rough, 50),
    normalMap: rep(tex2.nPoly, o.tile ?? 14),
    normalScale: new THREE2.Vector2((o.ns ?? 0.45) * 0.55, (o.ns ?? 0.45) * 0.55),
    envMapIntensity: o.env ?? 0.8
  });
  R4.steel = metal(2829358, 0.38, 0.82, { ns: 0.18, tile: 18 });
  R4.steelPark = metal(3487030, 0.62, 0.55, { cast: true, ns: 0.5 });
  R4.steelWorn = metal(5592666, 0.36, 0.9, { brushed: true });
  R4.steelBright = metal(10987949, 0.26, 1, { brushed: true });
  R4.chrome = metal(13224910, 0.14, 1);
  R4.alu = metal(2039842, 0.44, 0.6, { ns: 0.14, tile: 16 });
  R4.aluGrey = metal(3882304, 0.44, 0.6, { ns: 0.25 });
  R4.aluFde = metal(7693130, 0.58, 0.25, { cast: true, ns: 0.35, env: 0.8 });
  R4.aluOd = metal(4999992, 0.6, 0.25, { cast: true });
  R4.cast = metal(2500393, 0.66, 0.55, { cast: true, ns: 0.7 });
  R4.brass = metal(13148240, 0.3, 1);
  R4.copper = metal(11889982, 0.32, 1);
  R4.steelCase = metal(6249532, 0.45, 0.6);
  R4.spring = metal(4868942, 0.35, 0.9);
  R4.poly = poly(1776412, 0.74);
  R4.polySoft = poly(2105377, 0.86, { ns: 0.7 });
  R4.polyFde = poly(8350800, 0.78);
  R4.polyFdeDark = poly(6049338, 0.8);
  // текстура рукояти (Glock RTF / HK): мелкая «наждачка», заметнее обычного полимера
  R4.polyGrip = poly(1250067, 0.84, { ns: 1.15, tile: 5, env: 0.6 });
  // пластиковая гильза 12 калибра и зелёная «Бреннеке»
  R4.hullRed = poly(0xa3201c, 0.5, { ns: 0.2, env: 1 });
  R4.hullGreen = poly(0x2f5a32, 0.5, { ns: 0.2, env: 1 });
  R4.lead = metal(0x6b6f74, 0.55, 0.4);
  // оксидированная сталь HK/Glock: чуть глубже и матовее «steel»
  R4.steelMatte = metal(0x232426, 0.55, 0.65, { ns: 0.45 });
  R4.polyPlum = poly(4991522, 0.58, { ns: 0.3 });
  R4.polyOd = poly(4868662, 0.78);
  R4.polyGrey = poly(3948097, 0.7);
  R4.polyTan = poly(11573876, 0.78);
  R4.rubber = poly(1315860, 0.92, { ns: 0.9, tile: 14 });
  R4.bakelite = std({ color: 4856846, roughness: 0.4, metalness: 0, normalMap: rep(tex2.nCast, 60), normalScale: new THREE2.Vector2(0.2, 0.2), roughnessMap: rep(tex2.rough, 60) });
  R4.wood = phys({
    color: 16777215,
    map: rep(tex2.woodBirch, 160),
    roughness: 0.52,
    metalness: 0,
    normalMap: rep(tex2.nWood, 160),
    normalScale: new THREE2.Vector2(0.15, 0.15),
    clearcoat: 0.3,
    clearcoatRoughness: 0.35
  });
  R4.woodDark = phys({
    color: 16777215,
    map: rep(tex2.woodWalnut, 160),
    roughness: 0.5,
    metalness: 0,
    normalMap: rep(tex2.nWood, 160),
    normalScale: new THREE2.Vector2(0.25, 0.25),
    clearcoat: 0.3,
    clearcoatRoughness: 0.45
  });
  const glass = (color, op) => phys({
    color,
    roughness: 0.04,
    metalness: 0.1,
    transparent: true,
    opacity: op,
    depthWrite: false,
    envMapIntensity: 2.2,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    side: THREE2.DoubleSide
  });
  R4.glass = glass(12113124, 0.08);
  R4.glassAmber = glass(14725232, 0.1);
  R4.glassRed = glass(15245456, 0.09);
  R4.glassBlue = glass(9087208, 0.1);
  R4.glassDark = glass(2241348, 0.55);
  R4.lensBlack = std({ color: 329223, roughness: 0.25, metalness: 0.2 });
  R4.emRed = std({ color: 2228224, emissive: 16722458, emissiveIntensity: 3, roughness: 0.4 });
  R4.emGreen = std({ color: 8704, emissive: 7208794, emissiveIntensity: 2.5, roughness: 0.4 });
  R4.tritium = std({ color: 1714704, emissive: 9240426, emissiveIntensity: 1.2, roughness: 0.4 });
  R4.lampLens = std({ color: 14542574, emissive: 16774108, emissiveIntensity: 0, roughness: 0.08, metalness: 0.2 });
  R4.laserLens = std({ color: 3346448, emissive: 16719888, emissiveIntensity: 0, roughness: 0.1 });
  R4.irLens = std({ color: 1381653, roughness: 0.05, metalness: 0.4 });
  R4.ledPhos = std({ color: 13615226, emissive: 16774108, emissiveIntensity: 0, roughness: 0.45 });
  R4.reflector = std({ color: 15132908, roughness: 0.22, metalness: 1, emissive: 16774108, emissiveIntensity: 0, side: THREE2.DoubleSide, envMapIntensity: 2.4 });
  R4.white = std({ color: 15263456, roughness: 0.5 });
  R4.paintRed = std({ color: 11805724, roughness: 0.5 });
  R4.paintWhite = std({ color: 14605266, roughness: 0.55 });
  R4.paper = std({ color: 15328211, roughness: 0.95 });
  R4.target = std({ color: 13617334, roughness: 0.6, metalness: 0.2 });
  const W = {
    steel: { col: 9343896, metal: 1, rough: 0.3, wear: 0.75 },
    steelPark: { col: 7106161, metal: 0.9, rough: 0.38, wear: 0.55 },
    steelWorn: { col: 11120050, metal: 1, rough: 0.28, wear: 0.5 },
    steelMatte: { col: 7895160, metal: 0.95, rough: 0.34, wear: 0.5 },
    alu: { col: 9146004, metal: 1, rough: 0.3, wear: 0.4 },
    aluGrey: { col: 10132898, metal: 1, rough: 0.3, wear: 0.4 },
    aluFde: { col: 9407622, metal: 0.95, rough: 0.35, wear: 0.45 },
    aluOd: { col: 9407622, metal: 0.95, rough: 0.35, wear: 0.45 },
    cast: { col: 8224642, metal: 0.95, rough: 0.35, wear: 0.35 },
    poly: { col: 3815996, metal: 0, rough: 0.5, wear: 0.55 },
    polySoft: { col: 3815996, metal: 0, rough: 0.6, wear: 0.35 },
    polyGrip: { col: 3815996, metal: 0, rough: 0.55, wear: 0.4 },
    polyFde: { col: 11047538, metal: 0, rough: 0.55, wear: 0.5 },
    polyFdeDark: { col: 8153938, metal: 0, rough: 0.55, wear: 0.5 },
    polyTan: { col: 11969151, metal: 0, rough: 0.55, wear: 0.5 },
    polyOd: { col: 6974034, metal: 0, rough: 0.55, wear: 0.5 },
    polyGrey: { col: 6448232, metal: 0, rough: 0.55, wear: 0.5 },
    polyPlum: { col: 7224368, metal: 0, rough: 0.4, wear: 0.45 },
    bakelite: { col: 9062954, metal: 0, rough: 0.35, wear: 0.4 },
    rubber: { col: 3026479, metal: 0, rough: 0.7, wear: 0.2, grime: 0.6 }
  };
  for (const [k, o] of Object.entries(W)) if (R4[k]) addWear(R4[k], o);
  const cache2 = /* @__PURE__ */ new Map();
  return {
    tex: tex2,
    all: R4,
    get(key) {
      if (typeof key !== "string") return key;
      if (R4[key]) return R4[key];
      if (cache2.has(key)) return cache2.get(key);
      const [base, col] = key.split("#");
      if (R4[base] && col) {
        const m = R4[base].clone();
        m.color = new THREE2.Color("#" + col);
        if (W[base]) addWear(m, W[base]);
        cache2.set(key, m);
        return m;
      }
      console.warn("нет материала", key);
      return R4.poly;
    }
  };
}

// src/engine/geo.js
var geo_exports = {};
__export(geo_exports, {
  D2R: () => D2R,
  Kit: () => Kit,
  PICA: () => PICA,
  T: () => T,
  THREE: () => THREE3,
  box: () => box,
  circle: () => circle,
  cylX: () => cylX,
  cylY: () => cylY,
  cylZ: () => cylZ,
  extrudeX: () => extrudeX,
  extrudeY: () => extrudeY,
  extrudeZ: () => extrudeZ,
  flutesX: () => flutesX,
  gripLoft: () => gripLoft,
  latheX: () => latheX,
  loftX: () => loftX,
  loftPath: () => loftPath,
  loftY: () => loftY,
  merge: () => merge,
  mirrorZ: () => mirrorZ,
  mlokHoles: () => mlokHoles,
  node: () => node,
  path: () => path,
  picatinny: () => picatinny,
  pin: () => pin,
  place: () => place,
  reverse: () => reverse,
  ringGrooves: () => ringGrooves,
  rrect: () => rrect,
  screwHead: () => screwHead,
  shape: () => shape,
  sideLoft: () => sideLoft,
  slot: () => slot,
  sphere: () => sphere,
  spring: () => spring,
  superEllipse: () => superEllipse,
  tubeX: () => tubeX,
  wire: () => wire
});
import * as THREE3 from "three";
import { mergeGeometries as mergeGeometries2, toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
var D2R = Math.PI / 180;
function path(pts, target) {
  const s = target || new THREE3.Shape();
  const n = pts.length;
  const P = pts.map((p) => new THREE3.Vector2(p[0], p[1]));
  const R4 = pts.map((p) => p[2] || 0);
  const corner = (i) => {
    const a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n];
    const r = R4[i];
    const la = b.distanceTo(a), lc = b.distanceTo(c);
    const d = Math.min(r, la * 0.5, lc * 0.5);
    const pa = b.clone().add(a.clone().sub(b).setLength(d));
    const pc = b.clone().add(c.clone().sub(b).setLength(d));
    return [pa, pc, b];
  };
  for (let i = 0; i < n; i++) {
    if (R4[i] > 0) {
      const [pa, pc, b] = corner(i);
      if (i === 0) s.moveTo(pa.x, pa.y);
      else s.lineTo(pa.x, pa.y);
      s.quadraticCurveTo(b.x, b.y, pc.x, pc.y);
    } else if (i === 0) s.moveTo(P[i].x, P[i].y);
    else s.lineTo(P[i].x, P[i].y);
  }
  s.closePath();
  return s;
}
function shape(pts, holes = []) {
  const s = path(pts);
  for (const h of holes) s.holes.push(path(h, new THREE3.Path()));
  return s;
}
function rrect(cx, cy, w, h, r = 0) {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  return [[x0, y0, r], [x1, y0, r], [x1, y1, r], [x0, y1, r]];
}
function circle(cx, cy, r, n = 24) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}
function slot(x0, x1, cy, h, n = 8) {
  const r = h / 2, out = [];
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + i / n * Math.PI;
    out.push([x1 - r + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  for (let i = 0; i <= n; i++) {
    const a = Math.PI / 2 + i / n * Math.PI;
    out.push([x0 + r + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}
function reverse(pts) {
  return pts.slice().reverse();
}
function fixUV(g, k = 1) {
  const uv = g.attributes.uv;
  if (uv && k !== 1) for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k);
  return g;
}
function finish(g, crease = 32) {
  let out = g.index ? g.toNonIndexed() : g;
  out = toCreasedNormals(out, crease * D2R);
  if (!out.attributes.uv) out.setAttribute("uv", new THREE3.BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
  return out;
}
function extrudeZ(shp, width, o = {}) {
  const b = Math.min(o.bevel ?? 0.6, width * 0.45);
  const depth = Math.max(0.01, width - 2 * b);
  const g = new THREE3.ExtrudeGeometry(Array.isArray(shp) ? shape(shp) : shp, {
    depth,
    steps: 1,
    curveSegments: o.curve ?? 6,
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments: o.bevelSeg ?? 2
  });
  g.translate(0, 0, -depth / 2 + (o.z || 0));
  return finish(g, o.crease);
}
function extrudeX(shp, x0, x1, o = {}) {
  const len = x1 - x0;
  const b = Math.min(o.bevel ?? 0.5, len * 0.45);
  const depth = Math.max(0.01, len - 2 * b);
  const g = new THREE3.ExtrudeGeometry(Array.isArray(shp) ? shape(shp) : shp, {
    depth,
    steps: 1,
    curveSegments: o.curve ?? 6,
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments: o.bevelSeg ?? 2
  });
  g.rotateY(-Math.PI / 2);
  g.translate(x1 - b, 0, 0);
  return finish(g, o.crease);
}
function extrudeY(shp, y0, y1, o = {}) {
  const len = y1 - y0;
  const b = Math.min(o.bevel ?? 0.5, len * 0.45);
  const depth = Math.max(0.01, len - 2 * b);
  const g = new THREE3.ExtrudeGeometry(Array.isArray(shp) ? shape(shp) : shp, {
    depth,
    steps: 1,
    curveSegments: o.curve ?? 6,
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments: o.bevelSeg ?? 2
  });
  g.rotateX(-Math.PI / 2);
  g.scale(1, 1, -1);
  const idx = g.index;
  flipWinding(g);
  g.translate(0, y0 + b, 0);
  return finish(g, o.crease);
}
function flipWinding(g) {
  const pos = g.attributes.position;
  const attrs = Object.values(g.attributes);
  for (let i = 0; i < pos.count; i += 3) {
    for (const a of attrs) {
      for (let c = 0; c < a.itemSize; c++) {
        const t = a.array[(i + 1) * a.itemSize + c];
        a.array[(i + 1) * a.itemSize + c] = a.array[(i + 2) * a.itemSize + c];
        a.array[(i + 2) * a.itemSize + c] = t;
      }
    }
  }
}
function latheX(prof, o = {}) {
  const seg = o.seg ?? 32;
  const a0 = (o.a0 ?? 0) * D2R, arc2 = (o.arc ?? 360) * D2R;
  const crease = Math.cos((o.crease ?? 40) * D2R);
  const pts = prof.filter((p, i) => i === 0 || p[0] !== prof[i - 1][0] || p[1] !== prof[i - 1][1]);
  const segN = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1][0] - pts[i][0], dr = pts[i + 1][1] - pts[i][1];
    const l = Math.hypot(dx, dr) || 1;
    segN.push([-dr / l, dx / l]);
  }
  const pos = [], nor = [], uv = [], idx = [];
  let vlen = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const nA = segN[i].slice(), nB = segN[i].slice();
    if (i > 0) {
      const p = segN[i - 1];
      if (p[0] * nA[0] + p[1] * nA[1] > crease) {
        nA[0] += p[0];
        nA[1] += p[1];
      }
    }
    if (i < segN.length - 1) {
      const q = segN[i + 1];
      if (q[0] * nB[0] + q[1] * nB[1] > crease) {
        nB[0] += q[0];
        nB[1] += q[1];
      }
    }
    for (const n of [nA, nB]) {
      const l = Math.hypot(n[0], n[1]) || 1;
      n[0] /= l;
      n[1] /= l;
    }
    const [x0, r0] = pts[i], [x1, r1] = pts[i + 1];
    const sl = Math.hypot(x1 - x0, r1 - r0);
    const base = pos.length / 3;
    for (let j = 0; j <= seg; j++) {
      const a = a0 + j / seg * arc2;
      const c = Math.cos(a), s = Math.sin(a);
      pos.push(x0, r0 * c, r0 * s, x1, r1 * c, r1 * s);
      nor.push(nA[0], nA[1] * c, nA[1] * s, nB[0], nB[1] * c, nB[1] * s);
      const u = j / seg * arc2 * Math.max(r0, r1, 1);
      uv.push(u, vlen, u, vlen + sl);
    }
    vlen += sl;
    for (let j = 0; j < seg; j++) {
      const a = base + j * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE3.BufferGeometry();
  g.setAttribute("position", new THREE3.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE3.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE3.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g.toNonIndexed();
}
function cylX(r, x0, x1, o = {}) {
  const c = Math.min(o.c ?? 0.4, r * 0.4, (x1 - x0) * 0.3);
  const ri = o.ri || 0;
  if (ri > 0) {
    return latheX([[x0, ri + c], [x0, r - c], [x0 + c, r], [x1 - c, r], [x1, r - c], [x1, ri + c], [x1 - c, ri], [x0 + c, ri], [x0, ri + c]], o);
  }
  return latheX([[x0, 0], [x0, r - c], [x0 + c, r], [x1 - c, r], [x1, r - c], [x1, 0]], o);
}
function tubeX(rOut, rIn, x0, x1, o = {}) {
  return cylX(rOut, x0, x1, { ...o, ri: rIn });
}
function cylY(r, y0, y1, o = {}) {
  return T(cylX(r, y0, y1, o), { r: [0, 0, 90] });
}
function cylZ(r, z0, z1, o = {}) {
  return T(cylX(r, z0, z1, o), { r: [0, -90, 0] });
}
function sphere(r, o = {}) {
  const g = new THREE3.SphereGeometry(r, o.seg ?? 20, o.seg2 ?? 14);
  return fixUV(g.toNonIndexed(), r * 3);
}
function box(w, h, d, o = {}) {
  const b = Math.min(o.bevel ?? 0.5, w * 0.45, h * 0.45, d * 0.45);
  return extrudeZ(rrect(0, 0, w, h, o.r ?? b), d, { bevel: b, curve: 3 });
}
var _m = new THREE3.Matrix4();
var _q = new THREE3.Quaternion();
var _e = new THREE3.Euler();
var _v = new THREE3.Vector3();
var _s = new THREE3.Vector3();
function T(g, t = {}) {
  const r = t.r || [0, 0, 0];
  _e.set(r[0] * D2R, r[1] * D2R, r[2] * D2R, t.order || "XYZ");
  _q.setFromEuler(_e);
  const s = t.s == null ? [1, 1, 1] : Array.isArray(t.s) ? t.s : [t.s, t.s, t.s];
  _s.set(s[0], s[1], s[2]);
  const p = t.p || [0, 0, 0];
  _v.set(p[0], p[1], p[2]);
  _m.compose(_v, _q, _s);
  g.applyMatrix4(_m);
  if (s[0] * s[1] * s[2] < 0) flipWinding(g);
  return g;
}
function mirrorZ(g) {
  return T(g.clone(), { s: [1, 1, -1] });
}
function merge(list) {
  const gs = list.filter(Boolean).map((g) => {
    let o = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(o.attributes)) if (!["position", "normal", "uv"].includes(k)) o.deleteAttribute(k);
    if (!o.attributes.uv) o.setAttribute("uv", new THREE3.BufferAttribute(new Float32Array(o.attributes.position.count * 2), 2));
    if (!o.attributes.normal) o.computeVertexNormals();
    return o;
  });
  if (!gs.length) return null;
  return mergeGeometries2(gs, false);
}
var Kit = class {
  constructor(mats) {
    this.mats = mats;
    this.buckets = /* @__PURE__ */ new Map();
  }
  add(mat, geo, t) {
    if (!geo) return this;
    if (Array.isArray(geo)) {
      for (const g of geo) this.add(mat, g, t);
      return this;
    }
    if (t) T(geo, t);
    if (!this.buckets.has(mat)) this.buckets.set(mat, []);
    this.buckets.get(mat).push(geo);
    return this;
  }
  // Добавить с зеркальной копией на левый борт.
  pair(mat, geo, t) {
    if (t) T(geo, t);
    this.add(mat, geo);
    this.add(mat, mirrorZ(geo));
    return this;
  }
  build(name) {
    const grp = new THREE3.Group();
    grp.name = name || "";
    for (const [mk, list] of this.buckets) {
      const g = merge(list);
      if (!g) continue;
      const m = new THREE3.Mesh(g, this.mats.get(mk));
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.mat = mk;
      grp.add(m);
    }
    this.buckets.clear();
    return grp;
  }
};
function node(name, children = [], t) {
  const g = new THREE3.Group();
  g.name = name;
  for (const c of children) if (c) g.add(c);
  if (t) place(g, t);
  return g;
}
function place(obj, t = {}) {
  if (t.p) obj.position.set(t.p[0], t.p[1], t.p[2]);
  if (t.r) obj.rotation.set(t.r[0] * D2R, t.r[1] * D2R, t.r[2] * D2R, t.order || "XYZ");
  if (t.s != null) Array.isArray(t.s) ? obj.scale.set(...t.s) : obj.scale.setScalar(t.s);
  return obj;
}
var PICA = { PITCH: 10.01, SLOT: 5.23, TOP: 15.6, WIDE: 21.2, H: 9.4 };
function picaSection(top, base) {
  const t = PICA.TOP / 2, w = PICA.WIDE / 2;
  if (top <= -2.8) {
    return [[-w, -3], [w, -3], [w, -3.3], [t, -6], [t, -base], [-t, -base], [-t, -6], [-w, -3.3]];
  }
  return [[-t, 0], [t, 0], [w, -2.8], [w, -3.3], [t, -6], [t, -base], [-t, -base], [-t, -6], [-w, -3.3], [-w, -2.8]];
}
function picatinny(len, o = {}) {
  const base = o.base ?? PICA.H;
  const nSlots = Math.max(1, Math.floor((len - 3) / PICA.PITCH));
  const first = o.first ?? (len - (nSlots - 1) * PICA.PITCH) / 2;
  const gs = [];
  gs.push(extrudeX(picaSection(-3, base), 0, len, { bevel: 0.3 }));
  let x = 0;
  for (let i = 0; i <= nSlots; i++) {
    const sx = first + i * PICA.PITCH - PICA.SLOT / 2;
    const x1 = Math.min(len, i < nSlots ? sx : len);
    if (x1 - x > 0.8) gs.push(extrudeX(picaSection(0, 6.2), x, x1, { bevel: 0.35 }));
    x = sx + PICA.SLOT;
  }
  return { geo: merge(gs), slots: nSlots, first };
}
function mlokHoles(x0, x1, cy, o = {}) {
  const pitch = o.pitch ?? 40, L = o.len ?? 32, H = o.h ?? 7;
  const n = Math.floor((x1 - x0 + (pitch - L)) / pitch);
  const start = x0 + (x1 - x0 - (n * pitch - (pitch - L))) / 2;
  const out = [];
  for (let i = 0; i < n; i++) out.push(rrect(start + i * pitch + L / 2, cy, L, H, H / 2 - 0.2));
  return out;
}
function screwHead(r = 2.4, h = 1.2, o = {}) {
  const g = latheX([[0, 0], [0, r * 0.95], [h * 0.3, r], [h, r * 0.8], [h, 0]], { seg: o.seg ?? 16 });
  return T(g, { r: [0, -90, 0] });
}
function pin(r = 2, len = 2) {
  return cylZ(r, -len / 2, len / 2, { c: 0.25, seg: 14 });
}
// Рифлёный поясок. o.rIn — внутренний радиус: кольцо вместо сплошного тела (корпуса прицелов с каналом)
function ringGrooves(r, x0, x1, n, depth = 0.5, o = {}) {
  const r0 = o.rIn ?? 0;
  const prof = [[x0, r0], [x0, r]];
  const step = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const a = x0 + i * step;
    prof.push([a + step * 0.2, r], [a + step * 0.35, r - depth], [a + step * 0.65, r - depth], [a + step * 0.8, r]);
  }
  prof.push([x1, r], [x1, r0]);
  if (r0 > 0) prof.push([x0, r0]);
  return latheX(prof, { seg: o.seg ?? 28 });
}
function flutesX(r, x0, x1, n, w, h, o = {}) {
  const gs = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * 360 + (o.a0 || 0);
    gs.push(T(box(x1 - x0, h, w, { bevel: Math.min(0.3, w * 0.3) }), { p: [(x0 + x1) / 2, r + h / 2 - 0.2, 0] }));
    T(gs[gs.length - 1], { r: [a, 0, 0] });
  }
  return merge(gs);
}
function spring(R4, wire2, x0, x1, turns, o = {}) {
  const pts = [];
  const n = Math.max(24, Math.round(turns * 14));
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = t * turns * Math.PI * 2;
    pts.push(new THREE3.Vector3(x0 + (x1 - x0) * t, Math.cos(a) * R4, Math.sin(a) * R4));
  }
  const curve = new THREE3.CatmullRomCurve3(pts);
  return new THREE3.TubeGeometry(curve, n * 2, wire2, o.seg ?? 6, false).toNonIndexed();
}
function wire(points, r, o = {}) {
  const curve = new THREE3.CatmullRomCurve3(points.map((p) => new THREE3.Vector3(...p)), !!o.closed, "catmullrom", o.tension ?? 0.5);
  return new THREE3.TubeGeometry(curve, o.n ?? points.length * 10, r, o.seg ?? 8, !!o.closed).toNonIndexed();
}
function loftX(rings, o = {}) {
  const pos = [], idx = [];
  const m = rings[0].pts.length;
  rings.forEach((r) => r.pts.forEach(([z, y]) => pos.push(r.x, y, z)));
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < m; j++) {
      const a = i * m + j, b = i * m + (j + 1) % m, c = (i + 1) * m + j, d = (i + 1) * m + (j + 1) % m;
      idx.push(a, b, c, b, d, c);
    }
  }
  const cap = (ri, flip) => {
    const base = pos.length / 3;
    const r = rings[ri];
    let cz = 0, cy = 0;
    r.pts.forEach(([z, y]) => {
      cz += z / m;
      cy += y / m;
    });
    pos.push(r.x, cy, cz);
    for (let j = 0; j < m; j++) {
      const a = ri * m + j, b = ri * m + (j + 1) % m;
      flip ? idx.push(base, b, a) : idx.push(base, a, b);
    }
  };
  if (o.caps !== false) {
    cap(0, false);
    cap(rings.length - 1, true);
  }
  const g = new THREE3.BufferGeometry();
  g.setAttribute("position", new THREE3.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  if (o.flip) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) {
      const t = ix[i + 1];
      ix[i + 1] = ix[i + 2];
      ix[i + 2] = t;
    }
  }
  const ng = g.toNonIndexed();
  const uv = new Float32Array(ng.attributes.position.count * 2);
  const p = ng.attributes.position;
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i);
    uv[i * 2 + 1] = p.getY(i) + p.getZ(i);
  }
  ng.setAttribute("uv", new THREE3.BufferAttribute(uv, 2));
  return toCreasedNormals(ng, (o.crease ?? 40) * D2R);
}
function superEllipse(a, b, k = 3, n = 32, cy = 0, cz = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / n * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    out.push([cz + a * Math.sign(c) * Math.pow(Math.abs(c), 2 / k), cy + b * Math.sign(s) * Math.pow(Math.abs(s), 2 / k)]);
  }
  return out;
}
function loftY(rings, o = {}) {
  const r2 = rings.map((r) => ({ x: r.y, pts: r.pts.map(([x, z]) => [z, x]) }));
  const g = loftX(r2, o);
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setXY(i, y, x);
    const nx = n.getX(i), ny = n.getY(i);
    n.setXY(i, ny, nx);
  }
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return g;
}
function gripLoft(front, back, o = {}) {
  const at = (pts, y) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      if (y <= y0 && y >= y1 || y >= y0 && y <= y1) return x0 + (x1 - x0) * ((y - y0) / (y1 - y0 || 1));
    }
    return y > pts[0][1] ? pts[0][0] : pts[pts.length - 1][0];
  };
  const yTop = Math.min(front[0][1], back[0][1]), yBot = Math.max(front[front.length - 1][1], back[back.length - 1][1]);
  const N = o.rings ?? 18, M = o.seg ?? 28, W = (o.w ?? 30) / 2, k = o.k ?? 2.6, taper = o.taper ?? 0.28;
  const rings = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, y = yTop + (yBot - yTop) * t;
    const xf = at(front, y), xb = at(back, y);
    const cx = (xf + xb) / 2, a3 = Math.abs(xf - xb) / 2;
    const wk = o.width ? o.width(t) : 1;
    const end = i === N ? 0.9 : 1;
    const pts = [];
    for (let j = 0; j < M; j++) {
      const th = j / M * Math.PI * 2, c2 = Math.cos(th), s = Math.sin(th);
      const ex = Math.sign(c2) * Math.pow(Math.abs(c2), 2 / k), ez = Math.sign(s) * Math.pow(Math.abs(s), 2 / k);
      const zk = 1 - taper * Math.max(0, c2) ** 2;
      pts.push([cx + a3 * ex * end, W * wk * zk * ez * end]);
    }
    rings.push({ y, pts });
  }
  const g = loftY(rings, { crease: o.crease ?? 60 });
  const p = g.attributes.position, nr = g.attributes.normal;
  const c = new THREE3.Vector3(), a = new THREE3.Vector3(), b = new THREE3.Vector3(), d = new THREE3.Vector3(), f = new THREE3.Vector3();
  for (let i = 0; i < p.count; i++) c.add(a.fromBufferAttribute(p, i));
  c.divideScalar(p.count);
  for (let t = 0; t < p.count; t += 3) {
    a.fromBufferAttribute(p, t);
    b.fromBufferAttribute(p, t + 1);
    d.fromBufferAttribute(p, t + 2);
    f.crossVectors(b.clone().sub(a), d.clone().sub(a));
    if (f.dot(a.add(b).add(d).divideScalar(3).sub(c)) >= 0) continue;
    for (const attr of [p, nr, g.attributes.uv]) {
      if (!attr) continue;
      for (let k2 = 0; k2 < attr.itemSize; k2++) {
        const v = attr.array[(t + 1) * attr.itemSize + k2];
        attr.array[(t + 1) * attr.itemSize + k2] = attr.array[(t + 2) * attr.itemSize + k2];
        attr.array[(t + 2) * attr.itemSize + k2] = v;
      }
    }
    for (let k2 = t; k2 < t + 3; k2++) nr.setXYZ(k2, -nr.getX(k2), -nr.getY(k2), -nr.getZ(k2));
  }
  return g;
}
function sideLoft(upper, lower, o = {}) {
  const at = (pts, x) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x02, y0] = pts[i], [x12, y1] = pts[i + 1];
      if (x >= x02 && x <= x12) return y0 + (y1 - y0) * ((x - x02) / (x12 - x02 || 1));
    }
    return x < pts[0][0] ? pts[0][1] : pts[pts.length - 1][1];
  };
  const x0 = Math.max(upper[0][0], lower[0][0]), x1 = Math.min(upper[upper.length - 1][0], lower[lower.length - 1][0]);
  const N = o.rings ?? 24, M = o.seg ?? 32, W = (o.w ?? 30) / 2, k = o.k ?? 3.2;
  const rings = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, x = x0 + (x1 - x0) * t;
    const yu = at(upper, x), yl = at(lower, x);
    const wk = o.width ? o.width(t) : 1;
    const end = i === 0 && o.round0 || i === N && o.round1 ? 0.92 : 1;
    rings.push({ x, pts: superEllipse(W * wk * end, Math.abs(yu - yl) / 2 * end, k, M, (yu + yl) / 2, 0) });
  }
  return loftX(rings, { crease: o.crease ?? 60, flip: true });
}
// Лофт по кривой оси в плоскости XY (рукояти, шейки прикладов). secs: [{c:[x,y], a, b, k?, f?, r?}]
// a — полутолщина вдоль нормали к оси (спереди/сзади), b — полуширина по Z, f — смещение центра
// сечения вдоль нормали (выемки под пальцы, горб), r — радиус-скругление передней грани (0…1: доля a).
function loftPath(secs, o = {}) {
  const n = o.seg ?? 36, m = secs.length;
  const pos = [], idx = [];
  const tan = (i) => {
    const a = secs[Math.max(0, i - 1)].c, b = secs[Math.min(m - 1, i + 1)].c;
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  };
  for (let i = 0; i < m; i++) {
    const S2 = secs[i], [tx, ty] = tan(i), nx = -ty, ny = tx, k = S2.k ?? o.k ?? 3, kb = S2.kb ?? k;
    for (let j = 0; j < n; j++) {
      const t = j / n * Math.PI * 2, c = Math.cos(t), s2 = Math.sin(t);
      // передняя (c>0) и задняя половины могут иметь разную толщину: a — вперёд, a2 — назад
      const aa = c >= 0 ? S2.a : S2.a2 ?? S2.a;
      const u = aa * Math.sign(c) * Math.pow(Math.abs(c), 2 / (c >= 0 ? k : kb)) + (S2.f || 0);
      const w = S2.b * Math.sign(s2) * Math.pow(Math.abs(s2), 2 / k);
      pos.push(S2.c[0] + nx * u, S2.c[1] + ny * u, w);
    }
  }
  for (let i = 0; i < m - 1; i++) for (let j = 0; j < n; j++) {
    const a = i * n + j, b = i * n + (j + 1) % n, c = (i + 1) * n + j, d = (i + 1) * n + (j + 1) % n;
    idx.push(a, c, b, b, c, d);
  }
  const cap = (ri, flip) => {
    const base = pos.length / 3;
    let cx = 0, cy = 0;
    for (let j = 0; j < n; j++) cx += pos[(ri * n + j) * 3] / n, cy += pos[(ri * n + j) * 3 + 1] / n;
    pos.push(cx, cy, 0);
    for (let j = 0; j < n; j++) {
      const a = ri * n + j, b = ri * n + (j + 1) % n;
      flip ? idx.push(base, a, b) : idx.push(base, b, a);
    }
  };
  if (o.caps !== false) {
    cap(0, false);
    cap(m - 1, true);
  }
  const g = new THREE3.BufferGeometry();
  g.setAttribute("position", new THREE3.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  if (o.flip) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) {
      const t = ix[i + 1];
      ix[i + 1] = ix[i + 2];
      ix[i + 2] = t;
    }
  }
  const ng = g.toNonIndexed();
  const p = ng.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i) + p.getZ(i) * 0.3;
    uv[i * 2 + 1] = p.getY(i) + p.getZ(i);
  }
  ng.setAttribute("uv", new THREE3.BufferAttribute(uv, 2));
  return toCreasedNormals(ng, (o.crease ?? 60) * D2R);
}

// src/engine/lib/common.js
var common_exports = {};
__export(common_exports, {
  CAL: () => CAL,
  bulletGeo: () => bulletGeo,
  capScrew: () => capScrew,
  cartridge: () => cartridge,
  caseGeo: () => caseGeo,
  clampBody: () => clampBody,
  crimpStar: () => crimpStar,
  crossBolt: () => crossBolt,
  feedLips: () => feedLips,
  flipCap: () => flipCap,
  hashMarks: () => hashMarks,
  hollowLathe: () => hollowLathe,
  knob: () => knob,
  latheMod: () => latheMod,
  lensDisc: () => lensDisc,
  qdLever: () => qdLever,
  sectorRing: () => sectorRing,
  shotHead: () => shotHead,
  shotHull: () => shotHull,
  thumbNut: () => thumbNut,
  turret: () => turret
});
// Зажим на Пикатинни: в торце виден профиль планки (ласточкин хвост 45°), губки заходят под полки.
function clampBody(x0, x1, y1, o = {}) {
  const w = (o.w ?? 26) / 2, jaw = o.jaw ?? -6.6, r = o.r ?? 1.2;
  const tip = Math.max(7.9, 10.9 - Math.max(0, -3.3 - jaw));
  const sec = [[-w, jaw, 1], [-tip, jaw], [-10.9, -3.2], [-10.9, -2.9], [-8, 0.05], [8, 0.05], [10.9, -2.9], [10.9, -3.2], [tip, jaw], [w, jaw, 1], [w, y1, r], [-w, y1, r]];
  return extrudeX(sec, x0, x1, { bevel: o.bevel ?? 0.8 });
}
// Поперечный болт зажима: шестигранная гайка справа, головка под шестигранник слева.
function crossBolt(x, y = -2.5, w = 13, o = {}) {
  const out = [];
  const nutR = o.nutR ?? 4.2, nutH = o.nutH ?? 3.2;
  if (nutR > 0) {
    out.push(T(latheX([[0, 0], [0, nutR - 0.5], [0.4, nutR], [nutH - 0.4, nutR], [nutH, nutR - 0.5], [nutH, 0]], { seg: 6, crease: 30 }), { r: [0, -90, 0], p: [x, y, w] }));
    out.push(T(latheX([[0, 0], [0, 1.9], [1.1, 1.8], [1.4, 1.2], [1.4, 0]], { seg: 12 }), { r: [0, -90, 0], p: [x, y, w + nutH] }));
  }
  const hr = o.headR ?? 3.4, h = 2;
  out.push(T(latheX([[0, 0], [0, hr], [h - 0.5, hr], [h, hr - 0.5], [h, 1.7], [h - 0.9, 1.4], [h - 0.9, 0]], { seg: 18 }), { r: [0, 90, 0], p: [x, y, -w] }));
  return out;
}
// Быстросъёмный рычаг (ADM/LaRue): изогнутый рычаг вдоль левого борта, ось с гайкой натяжения.
function qdLever(x0, x1, y, w = 13) {
  const len = x1 - x0;
  const pro = [[0, 1.2, 1.2], [len * 0.55, -0.4, 6], [len, 0.6, 2.4], [len, 6.4, 3], [len * 0.62, 5.6, 8], [len * 0.12, 7.4, 2.6], [0, 5.2, 1.4]];
  const g = extrudeZ(pro, 3.2, { bevel: 0.9, curve: 8 });
  const pivot = latheX([[0, 0], [0, 4.2], [0.5, 4.6], [2.6, 4.6], [3.1, 4.1], [3.1, 2], [3.5, 1.6], [3.5, 0]], { seg: 20 });
  const grip = [];
  for (let i = 0; i < 4; i++) grip.push(T(box(0.9, 1, 1.2, { bevel: 0.25 }), { p: [x0 + 2.2 + i * 1.6, y - 3 + 5.6 - i * 0.05, -w - 3.4] }));
  return [T(g, { p: [x0, y - 3, -w - 1.6] }), T(pivot, { r: [0, 90, 0], p: [x1 - 3, y, -w - 0.6] }), ...grip];
}
// Рифлёный барабан вдоль +x: юбка, насечка, гладкая крышка с фаской и винтом по центру.
function knob(r, h, grooves = 24, o = {}) {
  const lip = o.lipH ?? 0.8;
  const gs = [latheX([[0, 0], [0, r - 0.9], [0.4, r - 0.6], [h - lip - 0.2, r - 0.6], [h - lip, r - 0.9], [h - 0.35, r - 1.1], [h, r - 1.5], [h, 1.2], [h - 0.35, 1.1], [h - 0.35, 0]], { seg: Math.max(24, grooves + 8) })];
  if (grooves) gs.push(flutesX(r - 0.9, 0.6, h - lip - 0.2, grooves, 1.1, 0.9));
  return merge(gs);
}
// Откидная крышка Butler Creek: чашка с бортиком, шарнир с осью и язычок под палец.
function flipCap(r, t = 2.4) {
  const disc = latheX([[0, 0], [0, r + 1.3], [0.4, r + 1.7], [t, r + 1.7], [t, r + 0.4], [t - 0.6, r], [t - 0.6, 0]], { seg: 32 });
  const hinge = T(box(6, 5, 10, { bevel: 1 }), { p: [t / 2, r + 3, 0] });
  const pinG = T(cylZ(1.4, -6, 6, { seg: 10 }), { p: [t / 2, r + 4.2, 0] });
  const tab = T(extrudeZ([[-1.5, 0, 0.5], [1.5, 0, 0.5], [1.2, 7, 1.2], [-1.8, 7, 1.2]], 8, { bevel: 0.8 }), { p: [t / 2, -r - 7.4, 0] });
  return merge([disc, hinge, pinG, tab]);
}
function lensDisc(r, x, t = 1.2) {
  return cylX(r, x - t / 2, x + t / 2, { c: 0.2, seg: 32 });
}
function hollowLathe(prof, rIn, o = {}) {
  const x0 = prof[0][0], x1 = prof[prof.length - 1][0];
  const inner = typeof rIn === "number" ? [[x1, rIn], [x0, rIn]] : rIn.slice().reverse();
  return latheX([[x0, inner[inner.length - 1][1]], ...prof, ...inner, [x0, inner[inner.length - 1][1]]], o);
}
// Винт с внутренним шестигранником, ось +y, головка над y=0.
function capScrew(r = 1.8, h = 1.2) {
  return T(latheX([[0, 0], [0, r], [h * 0.7, r], [h, r * 0.8], [h, r * 0.55], [h - 0.5, r * 0.45], [h - 0.5, 0]], { seg: 12, crease: 50 }), { r: [0, 0, 90] });
}
// Барашек/гайка с крупными лепестками, ось +x (зажимы кронштейнов, ПСО, сошки).
function thumbNut(r, h, lobes = 8) {
  const pts = [];
  for (let i = 0; i < lobes * 6; i++) {
    const a = i / (lobes * 6) * Math.PI * 2;
    const k = 0.84 + 0.16 * Math.pow(Math.abs(Math.cos(a * lobes / 2)), 0.6);
    pts.push([Math.cos(a) * r * k, Math.sin(a) * r * k]);
  }
  return merge([extrudeX(pts, 0, h, { bevel: 0.5, curve: 2 }), cylX(r * 0.55, h - 0.2, h + 1.2, { c: 0.4, seg: 20 })]);
}
// Штрихи шкалы по окружности радиуса r на участке оси x (ось +x). major — каждый n-й длиннее.
function hashMarks(r, xm, n, o = {}) {
  const gs = [], arc = o.arc ?? 360, a0 = o.a0 ?? 0, len = o.len ?? 1.6, maj = o.major ?? 5;
  for (let i = 0; i < n; i++) {
    const L = i % maj === 0 ? len * 1.9 : len;
    const g = T(box(L, 0.3, o.w ?? 0.34, { bevel: 0.08 }), { p: [xm + (o.dir ?? 1) * (L - len) / 2, r, 0] });
    gs.push(T(g, { r: [a0 + i / n * arc, 0, 0] }));
  }
  return merge(gs);
}
// Барабан поправок прицела (ось +y, основание на y=0): юбка-основание, нулевой упор,
// рифлёная крышка, штрихи шкалы и цифровые метки. Возвращает { m: металл, w: белая краска }.
function turret(o) {
  const r = o.r, h = o.h ?? r * 0.9, base = o.base ?? 3, rb = o.rb ?? r + 0.6;
  const m = [], w = [];
  const up = (g) => T(g, { r: [0, 0, 90] });
  if (o.cap) {
    // закрытый колпачок (ACOG, Aimpoint): гладкий цилиндр с насечкой и торцевой фаской
    m.push(up(latheX([[0, 0], [0, rb], [base, rb], [base, r], [base + h - 1, r], [base + h, r - 1], [base + h, 0]], { seg: 32 })));
    m.push(up(flutesX(r - 0.35, base + 1, base + h - 1.6, o.knurl ?? 28, 1, 0.7)));
    m.push(up(latheX([[base + h - 0.2, 0], [base + h - 0.2, r * 0.45], [base + h + 0.5, r * 0.45], [base + h + 0.5, r * 0.3], [base + h + 0.2, r * 0.25], [base + h + 0.2, 0]], { seg: 16 })));
    return { m, w };
  }
  const zs = o.zero ?? 1.2;
  m.push(up(latheX([[0, 0], [0, rb], [base, rb], [base, r - 0.8], [base + zs, r - 0.8], [base + zs, r], [base + h - 1.2, r], [base + h, r - 1.2], [base + h, r * 0.5], [base + h + 1.2, r * 0.45], [base + h + 1.2, 0]], { seg: 40, crease: 50 })));
  const kn0 = base + zs + h * 0.42, kn1 = base + h - 1.4;
  m.push(up(flutesX(r - 0.35, kn0, kn1, o.knurl ?? 40, 1.1, 0.75)));
  const marks = o.marks ?? 40;
  if (marks) {
    w.push(up(hashMarks(r + 0.02, base + zs + (o.markLen ?? 1.5) / 2 + 0.15, marks, { len: o.markLen ?? 1.5, major: o.major ?? 5, dir: 1 })));
    // индексная линия на основании
    w.push(up(T(box(base * 0.8, 0.35, 0.5, { bevel: 0.08 }), { p: [base * 0.45, rb + 0.02, 0] })));
  }
  return { m, w };
}
// Кольцевые секторы (сплошные, с боковыми стенками) вдоль оси x: прорези пламегасителей, окна ДТК.
// Углы в градусах: 0 — вверх (+y), 90 — вправо (+z).
function sectorRing(ri, ro, x0, x1, sectors, o = {}) {
  const gs = [];
  for (const [a0, a1] of sectors) {
    const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / (o.step ?? 8)));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = (a0 + (a1 - a0) * i / n) * D2R;
      pts.push([Math.sin(a) * ro, Math.cos(a) * ro]);
    }
    for (let i = n; i >= 0; i--) {
      const a = (a0 + (a1 - a0) * i / n) * D2R;
      pts.push([Math.sin(a) * ri, Math.cos(a) * ri]);
    }
    gs.push(extrudeX(pts, x0, x1, { bevel: o.bevel ?? 0.3, curve: 2, crease: 40 }));
  }
  return merge(gs);
}
// Тело вращения с радиальной модуляцией dr(x, a) — рёбра гильзы, гофры; нормали по излому.
function latheMod(prof, seg, dr) {
  const pos = [], idx = [];
  const m = prof.length;
  for (let i = 0; i < m; i++) for (let j = 0; j <= seg; j++) {
    const a = j / seg * Math.PI * 2, [x, r] = prof[i];
    const rr = r + (r > 0.01 ? dr(x, a, r) : 0);
    pos.push(x, rr * Math.cos(a), rr * Math.sin(a));
  }
  for (let i = 0; i < m - 1; i++) for (let j = 0; j < seg; j++) {
    const a = i * (seg + 1) + j, b = a + 1, c = a + seg + 1, d = c + 1;
    idx.push(a, b, c, c, b, d);
  }
  const g = new THREE3.BufferGeometry();
  g.setAttribute("position", new THREE3.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const ng = toCreasedNormals(g.toNonIndexed(), 40 * D2R);
  ng.setAttribute("uv", new THREE3.BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2));
  return ng;
}
// Звёздочная закрутка дробовой гильзы: вогнутый торец с n складками, смотрит в +x.
function crimpStar(R, x, n = 6, depth = 1.6) {
  const seg = n * 8, rings = 7, pos = [], idx = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings, r = R * (1 - t);
    for (let j = 0; j <= seg; j++) {
      const a = j / seg * Math.PI * 2;
      const fold = Math.pow(Math.abs(Math.cos(a * n / 2)), 3);
      const d = depth * Math.pow(Math.sin(t * Math.PI * 0.5), 0.8) + fold * 0.55 * Math.sin(t * Math.PI);
      pos.push(x - d, r * Math.cos(a), r * Math.sin(a));
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
    const a = i * (seg + 1) + j, b = a + 1, c = a + seg + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE3.BufferGeometry();
  g.setAttribute("position", new THREE3.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const ng = toCreasedNormals(g.toNonIndexed(), 50 * D2R);
  ng.setAttribute("uv", new THREE3.BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2));
  return ng;
}
// Калибры. Базовые поля (L, rim, sh, neck, shX, oal, steel, rimmed, base, shot, head) читает движок.
// Доп. поля: rimT — толщина закраины, groove — Ø проточки экстрактора, ang — угол ската (°),
// pr — Ø капсюля, bd/bl — Ø и длина пули, bt — длина «лодочки», ogL — длина оживала,
// mep — радиус притупления, seal — лак-герметик (капсюль и дульце), tip — окраска носика.
var CAL = {
  "556": { L: 44.7, rim: 9.6, sh: 9, neck: 6.43, shX: 36.5, oal: 57.4, steel: false, base: 9.58, rimT: 1.14, groove: 8.43, ang: 23, pr: 4.45, bd: 5.7, bl: 23.1, bt: 2.2, ogL: 12.4, mep: 0.35, tip: "paintWhite#3d7a3c" },
  "545": { L: 39.8, rim: 10, sh: 9.25, neck: 6.29, shX: 31.5, oal: 57, steel: true, base: 10, rimT: 1.5, groove: 8.6, ang: 28, pr: 4.5, bd: 5.62, bl: 25.5, bt: 2.8, ogL: 15.4, mep: 0.25, seal: "paintRed#8a1f3c" },
  "762x39": { L: 38.6, rim: 11.35, sh: 10.07, neck: 8.6, shX: 30.5, oal: 56, steel: true, base: 11.35, rimT: 1.5, groove: 9.6, ang: 18, pr: 5.5, bd: 7.91, bl: 26.8, bt: 3, ogL: 14.2, mep: 0.5, seal: "paintRed#8a1f3c" },
  "762x51": { L: 51.2, rim: 11.9, sh: 11.53, neck: 8.77, shX: 39.6, oal: 71.1, steel: false, base: 11.96, rimT: 1.37, groove: 10.39, ang: 20, pr: 5.33, bd: 7.82, bl: 28.6, bt: 3.2, ogL: 16.6, mep: 0.5 },
  // 9×19 — слегка коническая гильза без ската, пуля с круглой оживальной головкой, обжим «на конус»
  "9x19": { L: 19.15, rim: 9.96, sh: 9.93, neck: 9.65, shX: 18.4, oal: 29.7, steel: false, base: 9.93, rimT: 1.27, groove: 8.79, taper: true, pr: 4.45, bd: 9.01, bl: 15.5, bt: 0, ogL: 8.6, mep: 1.5 },
  // 7,62×54R — с выступающей закраиной, пуля ЛПС с «лодочкой», капсюль Бердана под лаком
  "762x54R": { L: 53.7, rim: 14.4, base: 12.37, sh: 11.61, neck: 8.53, shX: 42.8, oal: 77.2, steel: true, rimmed: true, rimT: 1.6, ang: 20, pr: 5.5, bd: 7.92, bl: 32.5, bt: 4, ogL: 19.5, mep: 0.5, seal: "paintRed#8a1f3c" },
  // 12/70: латунное донце + пластиковая гильза с рёбрами и звёздочной закруткой
  "12ga": { L: 65, rim: 22.3, sh: 20.5, neck: 20.5, shX: 60, oal: 65, head: 12, shot: true, rimT: 1.5, pr: 6.2 }
};
// Профиль гильзы от донца (x=0) к дульцу: капсюль в гнезде, закраина, проточка, скат, дульце.
function caseProfile(c) {
  const rr = c.rim / 2, rb = (c.base ?? c.rim) / 2, s = c.sh / 2, n = c.neck / 2, t = c.rimT ?? 1.2, pr = (c.pr ?? 4.5) / 2;
  const P = [[0.14, 0], [0.14, pr - 0.3], [0.2, pr - 0.08], [0.45, pr + 0.02], [0.1, pr + 0.28], [0, pr + 0.5], [0, rr - 0.35], [0.3, rr], [t - 0.22, rr], [t, rr - 0.28]];
  let x;
  if (c.rimmed) {
    P.push([t + 0.1, rb + 0.25], [t + 0.6, rb]);
    x = t + 0.6;
  } else {
    const rg = (c.groove ?? c.rim - 1.6) / 2;
    P.push([t + 0.08, rg], [t + 0.75, rg]);
    x = t + 0.75 + (rb - rg) / Math.tan(35 * D2R);
    P.push([x, rb]);
  }
  if (c.taper) {
    P.push([c.L - 1.6, n + 0.05], [c.L - 0.2, n - 0.07], [c.L, n - 0.12]);
  } else {
    const nx = c.shX + (s - n) / Math.tan((c.ang ?? 20) * D2R);
    P.push([c.shX - 0.5, s + 0.01], [c.shX, s - 0.02], [c.shX + 0.25 * (nx - c.shX), s - 0.3 * (s - n)], [nx - 0.3, n + 0.04], [nx, n], [c.L - 0.25, n], [c.L, n - 0.1]);
  }
  const wall = c.taper ? 0.28 : 0.33;
  P.push([c.L, n - wall], [c.L - 4, n - wall - 0.05], [c.L - 4, 0]);
  return P;
}
function caseGeo(cal) {
  const c = CAL[cal] || CAL["556"];
  if (c.shot) return merge([shotHead(c), shotHull(c)]);
  return latheX(caseProfile(c), { seg: 22, crease: 45 });
}
// Профиль пули: «лодочка», ведущая часть с канавкой-каннелюрой у дульца, касательное оживало.
function bulletPts(c) {
  const R = (c.bd ?? c.neck - 0.7) / 2, bl = c.bl ?? c.oal - c.L + 5, x0 = c.oal - bl, xt = c.oal;
  const bt = c.bt ?? 0, ogL = Math.min(c.ogL ?? bl * 0.55, bl - bt - 2), mep = Math.min(c.mep ?? 0.4, R * 0.6);
  const pts = [[x0, 0]];
  if (bt > 0) {
    const rb = R - bt * Math.tan(9 * D2R);
    pts.push([x0, rb - 0.25], [x0 + 0.25, rb], [x0 + bt, R - 0.02], [x0 + bt + 0.4, R]);
  } else pts.push([x0, R - 0.5], [x0 + 0.5, R]);
  const xo = xt - ogL, cx = c.L + 0.35;
  if (!c.taper && cx - 0.7 > x0 + bt + 0.5 && cx + 0.7 < xo) pts.push([cx - 0.6, R], [cx - 0.35, R - 0.14], [cx + 0.35, R - 0.14], [cx + 0.6, R]);
  pts.push([xo, R]);
  const rho = (ogL * ogL + R * R) / (2 * R);
  const um = Math.sqrt(Math.max(0, rho * rho - Math.pow(mep + rho - R, 2)));
  const N = 12;
  for (let i = 1; i <= N; i++) {
    const u = um * (1 - Math.pow(1 - i / N, 1.35));
    pts.push([xo + u * ogL / um, Math.sqrt(Math.max(0, rho * rho - u * u)) - (rho - R)]);
  }
  pts.push([xt, mep * 0.55], [xt, 0]);
  return { pts, R, xt };
}
function bulletGeo(cal) {
  const c = CAL[cal] || CAL["556"];
  return latheX(bulletPts(c).pts, { seg: 18, crease: 50 });
}
// Латунное донце 12 калибра: капсюль-«наковаленка» в чашечке, кольцо клейма, закраина, завальцовка.
function shotHead(c) {
  const r = c.rim / 2, s = c.sh / 2, hb = s + 0.2, t = c.rimT ?? 1.5, H = c.head, pr = (c.pr ?? 6.2) / 2;
  return latheX([
    [0.16, 0], [0.16, pr - 0.9], [0.05, pr - 0.75], [0.05, pr - 0.1], [0.35, pr], [0.02, pr + 0.3], [0, pr + 0.5],
    [0, 6.8], [0.14, 7], [0, 7.2], [0, r - 0.45], [0.4, r], [t - 0.3, r], [t, r - 0.3], [t + 0.35, hb],
    [H - 3.6, hb], [H - 3.3, hb + 0.12], [H - 2.6, hb + 0.12], [H - 2.3, hb], [H - 0.7, hb], [H - 0.15, hb - 0.12], [H, s + 0.02], [H, 0]
  ], { seg: 32, crease: 45 });
}
// Пластиковая гильза: продольные рёбра, закрутка (или раскрывшиеся лепестки у стреляной).
function shotHull(c, fired) {
  const s = c.sh / 2, L = c.L, H = c.head;
  const x0 = H - 0.8, rib0 = H + 1.5, rib1 = L - 3.2;
  const ribs = (x, a) => x > rib0 && x < rib1 ? 0.2 * Math.pow(Math.max(0, Math.cos(a * 12)), 6) : 0;
  if (fired) {
    const E = L + 6;
    return latheMod([[x0, 0], [x0, s - 0.1], [H + 0.2, s], [rib0, s], [(rib0 + rib1) / 2, s], [rib1, s], [E - 4, s + 0.05], [E - 1, s + 0.45], [E, s + 0.6], [E, s], [E - 3, s - 0.55], [H + 2, s - 0.6], [H + 2, 0]], 48, (x, a, r) => x > E - 5 ? 0.25 * Math.cos(a * 6) * (x - (E - 5)) / 5 : r > s - 0.3 ? ribs(x, a) : 0);
  }
  const R0 = s - 1.9;
  const body = latheMod([[x0, 0], [x0, s - 0.1], [H + 0.2, s], [rib0, s], [(rib0 + rib1) / 2, s], [rib1, s], [L - 2.2, s], [L - 1.1, s - 0.35], [L - 0.4, s - 1], [L, R0]], 48, ribs);
  return merge([body, crimpStar(R0, L, 6, 1.7)]);
}
function cartridge(k, cal, t) {
  const c = CAL[cal] || CAL["556"];
  const tt = () => t && { ...t };
  if (c.shot) {
    k.add("brass", shotHead(c), tt());
    k.add("hullRed", shotHull(c), tt());
    return;
  }
  k.add(c.steel ? "steelCase" : "brass", caseGeo(cal), tt());
  const b = bulletPts(c);
  k.add("copper", latheX(b.pts, { seg: 18, crease: 50 }), tt());
  const pr = (c.pr ?? 4.5) / 2, n = c.neck / 2;
  // капсюль: медный у стальных гильз, латунный — у латунных
  k.add(c.steel ? "copper" : "brass", latheX([[0.1, 0], [0.1, pr - 0.3], [0.2, pr - 0.1], [0.3, pr - 0.1], [0.3, 0]], { seg: 16 }), tt());
  if (c.seal) {
    k.add(c.seal, tubeX(pr + 0.35, pr - 0.15, -0.04, 0.06, { seg: 18, c: 0.01 }), tt());
    k.add(c.seal, tubeX(n - 0.05, b.R - 0.1, c.L - 0.05, c.L + 0.3, { seg: 18, c: 0.02 }), tt());
  }
  if (c.tip) {
    const x0 = b.xt - 4.2, tip = b.pts.filter((p) => p[0] > x0);
    let r0 = 0;
    for (let i = 1; i < b.pts.length; i++) if (b.pts[i][0] >= x0 && b.pts[i - 1][0] <= x0) {
      const [xa, ra] = b.pts[i - 1], [xb, rb2] = b.pts[i];
      r0 = ra + (rb2 - ra) * (x0 - xa) / (xb - xa || 1);
    }
    k.add(c.tip, latheX([[x0, 0], [x0, r0 + 0.03], ...tip.map(([x, r]) => [x + 0.02, r > 0 ? r + 0.03 : 0])], { seg: 18, crease: 50 }), tt());
  }
}
function feedLips(k, mat, x0, x1, y, hw, o = {}) {
  const rise = o.rise ?? 4.5, t = o.t ?? 1.1, curl = o.curl ?? 2.8;
  const sec = [[hw, y - 2], [hw, y + rise - 1.2], [hw - curl * 0.55, y + rise, 0.6], [hw - curl, y + rise - 0.6, 0.4], [hw - curl + 0.3, y + rise - 1.6], [hw - t - 0.4, y + rise - 1.4], [hw - t, y - 2]];
  for (const s of [-1, 1]) {
    k.add(mat, extrudeX(sec.map(([z, yy, r]) => [s * z, yy, r || 0]), x0, x1, { bevel: 0.3 }));
  }
  k.add(mat, extrudeX([[-hw, y - 2], [hw, y - 2], [hw, y + 1.2], [-hw, y + 1.2]], x0, x0 + 1.6, { bevel: 0.3 }));
}

// src/engine/mounts.js
import * as THREE4 from "three";
function mount(o) {
  const n = new THREE4.Group();
  n.name = "mount:" + o.id;
  if (o.p) n.position.set(...o.p);
  const face = o.face || "top";
  if (face === "left") n.rotation.x = -Math.PI / 2;
  else if (face === "right") n.rotation.x = Math.PI / 2;
  else if (face === "bottom") n.rotation.x = Math.PI;
  n.userData.mount = { pitch: PICA.PITCH, ...o, face };
  return n;
}
function railMount(id, p, face, slots, extra = {}) {
  return mount({ id, type: "pica", p, face, slots, ...extra });
}
var _m2 = new THREE4.Matrix4();
var _v2 = new THREE4.Vector3();
function toRoot(obj, root) {
  const m = new THREE4.Matrix4();
  const chain = [];
  let o = obj;
  while (o && o !== root) {
    chain.push(o);
    o = o.parent;
  }
  for (let i = chain.length - 1; i >= 0; i--) {
    chain[i].updateMatrix();
    m.multiply(chain[i].matrix);
  }
  return m;
}
var Assembler = class _Assembler {
  // def — описание оружия, lib — общая библиотека модулей, ctx — {THREE, G, mats, Kit}
  constructor(def, lib, ctx) {
    this.def = def;
    this.ctx = ctx;
    this.parts = /* @__PURE__ */ new Map();
    for (const p of [...lib, ...def.parts || []]) this.parts.set(p.id, p);
    this.base = def.build(ctx);
    this.root = new THREE4.Group();
    this.root.name = def.id;
    this.root.add(this.base.root);
    this.cache = /* @__PURE__ */ new Map();
    this.installed = /* @__PURE__ */ new Map();
    this.mounts = /* @__PURE__ */ new Map();
    this.config = {};
  }
  partList() {
    return [...this.parts.values()];
  }
  part(id) {
    return this.parts.get(id);
  }
  // Статическая совместимость: может ли модуль в принципе встать на это оружие.
  static fits(part, slot2, def) {
    // пистолетные фонари держатся на любой планке 1913 — их можно ставить и на длинные стволы
    const railLight = part.cat === "plight" && !part.pistolOnly && slot2.accepts.includes("light");
    if (!slot2.accepts.includes(part.cat) && !railLight) return false;
    if (part.only && !part.only.includes(def.id)) return false;
    if (part.fit?.thread && !part.fit.thread.includes(slot2.thread || def.thread)) return false;
    if (part.fit?.iface && slot2.iface && !part.fit.iface.includes(slot2.iface)) return false;
    return true;
  }
  slotOptions(slot2) {
    return this.partList().filter((p) => _Assembler.fits(p, slot2, this.def));
  }
  collectMounts() {
    this.mounts.clear();
    const walk = (o) => {
      if (o.userData.mount) this.mounts.set(o.userData.mount.id, o);
      for (const c of o.children) walk(c);
    };
    walk(this.root);
  }
  // Все допустимые позиции модуля на наборе планок, отсортированные вдоль оси.
  railPositions(slot2, part, ignoreSlot) {
    const out = [];
    const foot = part.foot || [-5, 5];
    for (const rid of slot2.rails || []) {
      const m = this.mounts.get(rid);
      if (!m) continue;
      const md = m.userData.mount;
      const accepts = part.mountTypes || ["pica"];
      if (!accepts.includes(md.type)) continue;
      const mat = toRoot(m, this.root);
      const n = md.slots || 1;
      for (let i = 0; i < n; i++) {
        const lx = i * (md.pitch || PICA.PITCH);
        if (md.type === "pica") {
          const lo = -PICA.PITCH / 2 - 1.5, hi = (n - 1) * PICA.PITCH + PICA.PITCH / 2 + 1.5;
          if (lx + foot[0] < lo - 0.01 || lx + foot[1] > hi + 0.01) continue;
        }
        const wx = _v2.set(lx, 0, 0).applyMatrix4(mat).x;
        out.push({ rail: rid, i, x: wx, face: md.face, axis: md.axis || md.face });
      }
    }
    out.sort((a, b) => a.x - b.x);
    const body = part.body || part.foot || [-5, 5];
    let limit = Infinity;
    if (slot2.behind) {
      const o = this.installed.get(slot2.behind);
      if (o?.railPos) limit = o.railPos.x + (o.part.body || o.part.foot)[0];
    }
    return out.map((p) => ({ ...p, clash: p.x + body[1] > limit + 0.5 ? "перед прицелом" : this.clash(p, part, ignoreSlot, slot2) }));
  }
  // Модулю «позади прицела» не хватает места: ищем ближайшую позицию прицела
  // дальше вперёд, при которой он встаёт. Возвращает эту позицию или null.
  roomBehind(slot2, part) {
    const tgt = slot2.behind && this.installed.get(slot2.behind);
    if (!tgt?.railPos) return null;
    const save = tgt.railPos;
    const cands = this.railPositions(tgt.slot, tgt.part, tgt.slot.id).filter((p) => !p.clash && p.x > save.x);
    let found = null;
    for (const c of cands) {
      tgt.railPos = c;
      if (this.railPositions(slot2, part, slot2.id).some((p) => !p.clash)) {
        found = c;
        break;
      }
    }
    tgt.railPos = save;
    return found;
  }
  clash(p, part, ignoreSlot, slot2) {
    const ext = (q) => q.body || q.foot || [-5, 5];
    const body = ext(part);
    const x0 = p.x + body[0], x1 = p.x + body[1];
    for (const [sid, it] of this.installed) {
      if (sid === ignoreSlot || !it.railPos) continue;
      if (it.railPos.axis !== p.axis) continue;
      const side = part.side || it.part.side;
      const a = side ? part.foot || body : body, b = side ? it.part.foot || ext(it.part) : ext(it.part);
      const u0 = p.x + a[0], u1 = p.x + a[1];
      const y0 = it.railPos.x + b[0], y1 = it.railPos.x + b[1];
      if (u0 < y1 - 0.5 && y0 < u1 - 0.5) return this.def.slots.find((s) => s.id === sid)?.label || sid;
    }
    for (const z of this.def.keepOut || []) {
      if (z.axis !== p.axis) continue;
      if (z.slots && !z.slots.includes(slot2.id)) continue;
      if (x0 < z.x1 && z.x0 < x1) return z.label;
    }
    return null;
  }
  built(slotId, part) {
    const key = slotId + "|" + part.id;
    if (!this.cache.has(key)) {
      const res = part.build(this.ctx, { weapon: this.def, slot: slotId });
      const obj = res.root || res;
      obj.name = "part:" + part.id;
      obj.userData.partId = part.id;
      obj.userData.slotId = slotId;
      obj.traverse((o) => {
        if (o.isMesh) {
          o.userData.partId = part.id;
          o.userData.slotId = slotId;
        }
      });
      this.cache.set(key, { obj, info: res.root ? res : { root: obj } });
    }
    return this.cache.get(key);
  }
  // Применяет конфигурацию {slotId: {id, pos}}; возвращает исправленную версию.
  apply(config) {
    for (const it of this.installed.values()) it.obj.parent?.remove(it.obj);
    this.installed.clear();
    const out = {};
    const hidden = /* @__PURE__ */ new Set();
    this.collectMounts();
    for (const slot2 of this.def.slots) {
      const want = config[slot2.id];
      const pid = want && typeof want === "object" ? want.id : want;
      if (!pid) {
        out[slot2.id] = null;
        continue;
      }
      const part = this.parts.get(pid);
      if (!part || !_Assembler.fits(part, slot2, this.def)) {
        out[slot2.id] = null;
        continue;
      }
      if (part.needs && !part.needs(out, this)) {
        out[slot2.id] = null;
        continue;
      }
      let host = null, railPos = null;
      if (slot2.rails) {
        const ps = this.railPositions(slot2, part, slot2.id).filter((p) => !p.clash);
        if (!ps.length) {
          out[slot2.id] = null;
          continue;
        }
        const wantPos = want && typeof want === "object" && want.pos != null ? want.pos : null;
        let pick = null;
        if (wantPos) pick = ps.find((p) => p.rail === wantPos.rail && p.i === wantPos.i);
        if (!pick) {
          const pref = slot2.prefer;
          if (pref && typeof pref === "object") pick = ps.reduce((a, b) => Math.abs(b.x - pref.x) < Math.abs(a.x - pref.x) ? b : a);
          else if (pref === "front") pick = ps[ps.length - 1];
          else if (pref === "rear") pick = ps[0];
          else pick = ps[Math.floor(ps.length / 2)];
        }
        railPos = pick;
        host = this.mounts.get(pick.rail);
      } else {
        host = this.mounts.get(slot2.mount);
      }
      if (!host) {
        out[slot2.id] = null;
        continue;
      }
      const { obj, info } = this.built(slot2.id, part);
      obj.position.set(railPos ? railPos.i * (host.userData.mount.pitch || PICA.PITCH) : 0, 0, 0);
      obj.rotation.set(0, 0, 0);
      host.add(obj);
      this.installed.set(slot2.id, { part, obj, info, host, railPos, slot: slot2 });
      for (const h of part.hides || []) hidden.add(h);
      out[slot2.id] = { id: pid, pos: railPos ? { rail: railPos.rail, i: railPos.i } : null };
      obj.traverse((o) => {
        if (o.userData.mount) this.mounts.set(o.userData.mount.id, o);
      });
    }
    this.base.root.traverse((o) => {
      if (o.userData.hideKey) o.visible = !hidden.has(o.userData.hideKey);
    });
    this.config = out;
    return out;
  }
  info(slotId) {
    return this.installed.get(slotId)?.info || null;
  }
  // Все установленные модули с заданным свойством info (sight, light, laser ...).
  withInfo(key) {
    const out = [];
    for (const [sid, it] of this.installed) if (it.info && it.info[key]) out.push({ slotId: sid, ...it, data: it.info[key] });
    if (this.base[key]) out.unshift({ slotId: "_base", obj: this.base.root, data: this.base[key], info: this.base });
    return out;
  }
  stats() {
    const s = { ...this.def.base };
    const mods = [];
    for (const it of this.installed.values()) if (it.part.stats) mods.push(it.part.stats);
    for (const m of mods) {
      for (const [k, v] of Object.entries(m)) {
        if (k === "mag") continue;
        if (k.endsWith("%")) {
          const kk = k.slice(0, -1);
          s[kk] = (s[kk] ?? 0) * (1 + v / 100);
        } else if (k === "loud" || k === "flash" || k === "velocity" || k === "rangeAdd") s[k] = (s[k] ?? 0) + v;
        else s[k] = (s[k] ?? 0) + v;
      }
    }
    for (const it of this.installed.values()) if (it.part.stats?.mag) s.mag = it.part.stats.mag;
    return s;
  }
};

// src/engine/ctx.js
import * as THREE5 from "three";

function makeCtx(mats) {
  return {
    THREE: THREE5,
    G: geo_exports,
    C: common_exports,
    mats,
    mount,
    railMount,
    kit: () => new Kit(mats),
    // Узел, скрываемый при установке модуля с part.hides = [key]
    hideable(obj, key) {
      obj.userData.hideKey = key;
      return obj;
    }
  };
}

// src/engine/lib/optics.js
function lens(ctx, geo, mat = "glass") {
  const m = new ctx.THREE.Mesh(geo, ctx.mats.get(mat).clone());
  m.renderOrder = 10;
  m.userData.lens = true;
  return m;
}
// Барабан из общего конструктора: металл + белые штрихи шкалы. t — поворот/перенос оси +y.
function optTurret(k, mat, o, t) {
  const tt = turret(o);
  k.add(mat, tt.m, t);
  if (tt.w.length) k.add(o.paint || "paintWhite", tt.w, t);
}
// Радиальные риски на торце ручки (ось +x, торец в плоскости x).
function faceTicks(r0, r1, n, x, o = {}) {
  const gs = [], arc = o.arc ?? 360, a0 = o.a0 ?? 0;
  for (let i = 0; i < n; i++) {
    const L = (i % (o.major ?? 1000) === 0 ? 1.4 : 1) * (r1 - r0);
    gs.push(T(T(box(0.3, L, o.w ?? 0.5, { bevel: 0.08 }), { p: [x, r1 - L / 2, 0] }), { r: [a0 + i / n * arc, 0, 0] }));
  }
  return merge(gs);
}
// Ручка яркости с рисками на торце, ось +z (правый борт) или -z (dir=-1).
function dialZ(k, mat, r, h, p, dir = 1, n = 12) {
  const t = { r: [0, dir > 0 ? -90 : 90, 0], p };
  k.add(mat, knob(r, h, Math.round(r * 2.8)), t);
  k.add("paintWhite", faceTicks(r * 0.45, r * 0.78, n, h + 0.05, { arc: 300, a0: 30, major: 4 }), { ...t });
}
function t2(ctx, A) {
  const k = ctx.kit();
  const at = (g, t = {}) => T(g, { ...t, p: [t.p?.[0] || 0, A + (t.p?.[1] || 0), t.p?.[2] || 0] });
  k.add("alu", clampBody(-18, 18, 5.5));
  if (A > 30) {
    // LaRue LT660: башня с окном облегчения, рычаг QD слева, гайка натяжения справа
    const tower = shape([[-17, 5], [17, 5], [17, A - 12, 3], [-17, A - 12, 3]], [slot(-9, 9, (A - 7) / 2 + 3, 9)]);
    k.add("alu", extrudeZ(tower, 18, { bevel: 1.2 }));
    k.add("steel", qdLever(-14, 12, -1));
    k.add("steel", crossBolt(0, -2.5, 13).slice(0, 2));
    for (const x of [-12, 12]) k.add("steel", capScrew(1.8, 1), { p: [x, A - 12, 5] });
  } else {
    k.add("steel", crossBolt(0));
  }
  // корпус: трубка с фирменным пояском, расширенная бленда спереди
  k.add("alu", at(hollowLathe([[-34, 14], [-33.4, 15.2], [-25, 15.2], [-24.4, 15.7], [-21, 15.7], [-20.4, 15.2], [16, 15.2], [18, 16], [20.5, 16.6], [32.6, 16.6], [33.6, 16.1], [34, 15.2]], 12.2, { seg: 44 })));
  k.add("lensBlack", at(tubeX(12.3, 11.6, -32, 32, { seg: 32 })));
  // интегральное основание и блок барабанов
  k.add("alu", extrudeX([[-11, A - 16, 2], [11, A - 16, 2], [11, A - 8], [-11, A - 8]], -17, 17, { bevel: 1 }));
  // блок барабанов охватывает трубку: канал на оси открыт
  k.add("alu", extrudeX(shape(rrect(0, A, 31.4, 31.4, 10), [circle(0, A, 15.1, 40)]), -6, 12, { bevel: 1.2 }));
  optTurret(k, "alu", { cap: true, r: 7, h: 6.2, base: 1, knurl: 24 }, { p: [3, A + 15.4, 0] });
  optTurret(k, "alu", { cap: true, r: 7, h: 6.2, base: 1, knurl: 24 }, { r: [90, 0, 0], p: [3, A, 15.4] });
  // ручка яркости (12 положений) справа сзади
  k.add("alu", at(cylZ(6.5, 12, 14.6, { seg: 24 }), { p: [-17, -1, 0] }));
  dialZ(k, "alu", 10, 6.2, [-17, A - 1, 14.2]);
  k.add("steel", at(cylZ(3.2, -16.6, -15, { seg: 16 }), { p: [-17, -1, 0] }));
  const capR = T(flipCap(12.5).translate(0, -15.5, 0), { r: [0, 0, -100], p: [-35, 15.5, 0] });
  const capF = T(flipCap(13.5).translate(0, -16.5, 0), { r: [0, 0, 100], p: [34, 16.5, 0] });
  k.add("rubber", at(capR));
  k.add("rubber", at(capF));
  k.add("rubber", at(tubeX(16.8, 15.1, -31, -25.6, { seg: 32 })));
  k.add("rubber", at(tubeX(17.8, 16.5, 25, 31, { seg: 32 })));
  const root = node("t2", [k.build()]);
  const rear = lens(ctx, at(ctx.C.lensDisc(12.4, -31)), "glassBlue");
  const front = lens(ctx, at(ctx.C.lensDisc(12.6, 31)), "glassRed");
  root.add(rear, front);
  return { root, sight: { y: A, z: 0, x0: -34, x1: 34, r: 12, mag: 1, reticle: "dot", lens: front } };
}
// EOTech EXPS3 / XPS2: основание с батарейным отсеком CR123 поперёк, капюшон с плоскими бортами,
// кнопки (EXPS — слева сзади, XPS — на заднем торце), винты поправок справа под окном.
function exps3(ctx, o = {}) {
  const k = ctx.kit();
  const A = 39, xs = !!o.xps2, X0 = xs ? -40 : -48;
  k.add("alu", clampBody(xs ? -16 : -22, xs ? 16 : 22, 6));
  if (xs) {
    k.add("steel", crossBolt(0, -2.5, 13, { nutR: 0 }));
    k.add("steel", T(thumbNut(6.6, 4.2), { r: [0, -90, 0], p: [0, -2.5, 13] }));
  } else k.add("steel", qdLever(-16, 12, -1.5));
  k.add("alu", extrudeX([[-17, 5, 1], [17, 5, 1], [17, 15, 3], [-17, 15, 3]], X0, 46, { bevel: 1.2 }));
  k.add("alu", extrudeX([[-17, 12], [17, 12], [17, 28, 6], [-17, 28, 6]], X0, -21, { bevel: 2 }));
  if (xs) {
    for (const [y, z] of [[21, -7], [21, 7], [15.5, 0]]) k.add("rubber", cylX(2.9, X0 - 2.2, X0 + 1, { c: 0.8, seg: 16 }), { p: [0, y, z] });
  } else {
    for (const [x, y] of [[-42, 22], [-34, 22], [-38, 16]]) k.add("rubber", cylZ(3.1, -19.4, -16.5, { c: 0.8, seg: 16 }), { p: [x, y, 0] });
    k.add("alu", extrudeZ(rrect(-38, 19.5, 18, 15, 3), 1.2, { bevel: 0.4, z: -17.2 }));
  }
  // винты поправок справа: утоплены в прилив, шлиц + стрелки
  k.add("alu", extrudeZ(rrect(-35, 20, 16, 11, 4), 3, { bevel: 0.8, z: 17.5 }));
  for (const x of [-40, -30]) {
    k.add("steel", cylZ(3.3, 18.5, 19.6, { c: 0.5, seg: 18 }), { p: [x, 21, 0] });
    k.add("lensBlack", T(box(0.8, 4.2, 0.6, { bevel: 0.1 }), { p: [x, 21, 19.6] }));
    k.add("paintWhite", T(box(2.2, 0.4, 0.3), { p: [x, 25.3, 19.1] }));
  }
  // капюшон: прямые борта, скруглённая крыша; утолщённые рамки у окон
  const outer = [[-21, 12, 0], [21, 12, 0], [21, 63, 13], [-21, 63, 13]];
  const inner = [[-16.4, 21, 2], [16.4, 21, 2], [16.4, 58, 9], [-16.4, 58, 9]];
  const hx0 = xs ? -19 : -22;
  k.add("alu", extrudeX(shape(outer, [inner]), hx0, 44, { bevel: 1.2 }));
  k.add("alu", extrudeX(shape(outer.map(([z, y, r]) => [z * 1.03, y === 12 ? 12 : y + 0.6, r]), [inner]), 40.5, 44.6, { bevel: 0.8 }));
  k.add("alu", extrudeX(shape(outer.map(([z, y, r]) => [z * 1.03, y === 12 ? 12 : y + 0.6, r]), [inner]), hx0 - 0.4, hx0 + 3, { bevel: 0.8 }));
  // фирменная площадка на бортах капюшона
  for (const s of [-1, 1]) k.add("aluGrey", extrudeZ(rrect(12, 44, 30, 9, 2), 0.8, { bevel: 0.2, z: s * 21.2 }));
  // батарейный отсек CR123 поперёк, рифлёная крышка справа
  k.add("alu", T(cylZ(9.5, -17, 17, { c: 1, seg: 28 }), { p: [34, 16, 0] }));
  k.add("alu", T(ctx.C.knob(9.8, 6, 24), { r: [0, -90, 0], p: [34, 16, 17] }));
  k.add("steel", T(capScrew(1.6, 1), { r: [90, 0, 0], p: [34, 16, 23.1] }));
  const root = node(xs ? "xps2" : "exps3", [k.build()]);
  const rp = rrect(0, A - 1, 30, 28, 8);
  const rear = lens(ctx, extrudeX(rp, -14, -12.8, { bevel: 0.2 }), "glassBlue");
  const front = lens(ctx, extrudeX(rp, 36, 37.2, { bevel: 0.2 }), "glassAmber");
  root.add(rear, front);
  return { root, sight: { y: A, z: 0, x0: -14, x1: 37, r: 14, mag: 1, reticle: "holo", lens: front } };
}
// Trijicon MRO: короткая трубка с расширяющимся объективом 25 мм, колпачки сверху и справа,
// крупная ручка яркости слева, быстросъёмное основание.
function mro(ctx, A) {
  const k = ctx.kit();
  const at = (g, t = {}) => T(g, { ...t, p: [t.p?.[0] || 0, A + (t.p?.[1] || 0), t.p?.[2] || 0] });
  k.add("alu", clampBody(-20, 20, 5.5));
  k.add("steel", qdLever(-14, 14, -1));
  k.add("alu", extrudeZ(shape([[-18, 4, 2], [18, 4, 2], [16, A - 12, 3], [-16, A - 12, 3]], [slot(-8, 8, (A - 8) / 2 + 2, 8)]), 16, { bevel: 1.2 }));
  k.add("alu", extrudeX([[-9, A - 14, 2], [9, A - 14, 2], [9, A - 9], [-9, A - 9]], -15, 15, { bevel: 1 }));
  k.add("alu", at(hollowLathe([[-30, 11.6], [-29, 12.8], [-24, 12.9], [-23.6, 13.3], [-20.5, 13.4], [-20, 13], [-8, 13.4], [14, 16.2], [26, 17.6], [30, 17.6], [31, 16.6]], 10.8, { seg: 44 })));
  k.add("lensBlack", at(tubeX(10.9, 10.2, -29, 30, { seg: 32 })));
  // поясок барабанов — кольцо вокруг трубки, канал на оси открыт
  k.add("alu", at(hollowLathe([[-9, 13.8], [-8, 14.4], [8, 15.2], [9, 14.6]], 12.9, { seg: 32 })));
  optTurret(k, "alu", { cap: true, r: 6.6, h: 5.6, base: 1, knurl: 22 }, { p: [0, A + 14, 0] });
  optTurret(k, "alu", { cap: true, r: 6.6, h: 5.6, base: 1, knurl: 22 }, { r: [90, 0, 0], p: [0, A, 14.2] });
  dialZ(k, "alu", 8.6, 5.5, [-6, A, -13.8], -1, 8);
  k.add("paintWhite", at(box(0.6, 3, 0.6), { p: [-6, -9.6, -19.4] }));
  const root = node("mro", [k.build()]);
  const rear = lens(ctx, at(ctx.C.lensDisc(10.8, -28)), "glassBlue");
  const front = lens(ctx, at(ctx.C.lensDisc(16.6, 29.5)), "glassRed");
  root.add(rear, front);
  return { root, sight: { y: A, z: 0, x0: -30, x1: 31, r: 10, mag: 1, reticle: "dot", lens: front } };
}
// Holosun HS510C: открытая рамка-щит, солнечная панель сверху, батарейный лоток справа,
// кнопки слева, излучатель в основании за стеклом.
function hs510c(ctx) {
  const k = ctx.kit();
  const A = 35;
  k.add("alu", clampBody(-22, 22, 6));
  k.add("steel", qdLever(-16, 12, -1.5));
  k.add("alu", extrudeX([[-17, 5, 1], [17, 5, 1], [17, 17, 3], [-17, 17, 3]], -34, 30, { bevel: 1.2 }));
  const fr = shape([[-19, 14], [19, 14], [19, 50, 7], [-19, 50, 7]], [[[-14.5, 20, 3], [14.5, 20, 3], [14.5, 45, 5], [-14.5, 45, 5]]]);
  k.add("alu", extrudeX(fr, 6, 16, { bevel: 1.2 }));
  for (const s of [-1, 1]) k.add("alu", extrudeZ([[-30, 14], [16, 14], [16, 48, 4], [4, 50, 3], [-20, 20, 4]], 3, { bevel: 0.8, z: s * 17.5 }));
  // солнечная панель в рамке
  k.add("alu", extrudeX(rrect(0, 50.2, 30, 2.4, 1), -9, 13, { bevel: 0.5 }));
  k.add("lensBlack", extrudeX(rrect(0, 51.5, 24, 0.8, 0.3), -8, 12, { bevel: 0.2 }));
  k.add("glassBlue", extrudeX(rrect(0, 51.9, 22, 0.4, 0.15), -7, 11, { bevel: 0.1 }));
  // кнопки +/− слева, батарейный лоток CR2032 справа
  for (const x of [-22, -12]) k.add("rubber", cylZ(3.2, -20.4, -18, { c: 0.8, seg: 16 }), { p: [x, 12, 0] });
  k.add("alu", T(extrudeX(rrect(0, 0, 4, 12, 1.5), -28, -6, { bevel: 0.8 }), { p: [0, 11, 18.8] }));
  k.add("steel", T(capScrew(1.8, 1), { r: [90, 0, 0], p: [-10, 11, 20.8] }));
  // излучатель и винты поправок
  k.add("alu", extrudeX(rrect(0, 20, 9, 6, 2), -24, -16, { bevel: 0.8 }));
  k.add("lensBlack", cylX(1.6, -16.2, -15.6, { seg: 12 }), { p: [0, 20.5, 0] });
  k.add("steel", T(capScrew(2, 1), {}), { p: [-4, 17, 0] });
  k.add("steel", T(capScrew(2, 1), { r: [90, 0, 0] }), { p: [-2, 12, 17] });
  const root = node("hs510c", [k.build()]);
  const glass = lens(ctx, extrudeX(rrect(0, A - 2.4, 29, 25, 4), 10.4, 11.4, { bevel: 0.2 }), "glassBlue");
  root.add(glass);
  return { root, sight: { y: A, z: 0, x0: -30, x1: 16, r: 12, mag: 1, reticle: "holo", lens: glass } };
}
// Trijicon ACOG TA31RCO + RMR: кованый корпус со скруглённым сечением, окуляр с рёбрами,
// раструб объектива 32 мм, оптоволокно в канале сверху, колпачки поправок, основание TA51
// с двумя барашками слева, RMR на переходнике над корпусом.
function acog(ctx) {
  const k = ctx.kit();
  const A = 38;
  const at = (g, t = {}) => T(g, { ...t, p: [t.p?.[0] || 0, A + (t.p?.[1] || 0), t.p?.[2] || 0] });
  k.add("alu", clampBody(-32, 32, 7));
  for (const x of [-18, 18]) {
    k.add("steel", T(thumbNut(7.6, 5, 8), { r: [0, 90, 0], p: [x, -2, -13] }));
    k.add("steel", cylZ(2.6, -13, 16.6, { seg: 12 }), { p: [x, -2, 0] });
    k.add("steel", crossBolt(x, -2, 13).slice(0, 1));
  }
  k.add("alu", extrudeX([[-12, 6], [12, 6], [12, A - 14, 3], [-12, A - 14, 3]], -34, 34, { bevel: 1.2 }));
  for (const s of [-1, 1]) k.add("alu", extrudeZ([[-30, 10, 2], [30, 10, 2], [22, A - 16, 3], [-22, A - 16, 3]], 2, { bevel: 0.5, z: s * 12.6 }));
  // окуляр с рёбрами
  const oc = [[-75, 15.6], [-74.6, 18.2], [-73.4, 19.4]];
  for (let i = 0; i < 6; i++) { const x = -71.5 + i * 3.4; oc.push([x, 19.4], [x + 0.6, 18.6], [x + 1.6, 18.6], [x + 2.2, 19.4]); }
  oc.push([-50, 19.4], [-48.5, 18.2], [-44, 18.2]);
  k.add("alu", at(hollowLathe(oc, 15.9, { seg: 44 })));
  // корпус призмы: скруглённое сечение
  const ring = (x, a, b, cy = 0) => ({ x, pts: superEllipse(a, b, 3.2, 40, A + cy, 0) });
  k.add("alu", loftX([ring(-46, 16.6, 17.4, 0.6), ring(-43, 18, 19.2, 0.8), ring(22, 18, 19.2, 0.8), ring(30, 17, 18.6, 0.4)], { crease: 60 }));
  k.add("alu", at(hollowLathe([[28, 18.6], [36, 19.2], [44, 21.5], [60, 24.2], [66, 24.2], [66.6, 24.6], [71, 24.6], [71.6, 24.2], [74, 24.2], [75.5, 23]], 16.5, { seg: 48 })));
  k.add("lensBlack", at(tubeX(16.6, 15.5, -72, 73, { seg: 32 })));
  // колпачки поправок: сверху и справа, за RMR
  optTurret(k, "alu", { cap: true, r: 7.4, h: 7.5, base: 1.4, knurl: 26 }, { p: [-31, A + 19.4, 0] });
  optTurret(k, "alu", { cap: true, r: 7.4, h: 7.5, base: 1.4, knurl: 26 }, { r: [90, 0, 0], p: [-31, A + 0.8, 17.6] });
  // оптоволокно: канал с поперечными перемычками над объективом
  k.add("alu", extrudeX(shape([[-7, A + 16, 2], [7, A + 16, 2], [7, A + 26.5, 2], [-7, A + 26.5, 2]], [rrect(0, A + 26.5, 5.4, 4, 1)]), 29, 62, { bevel: 1.2 }));
  k.add("emGreen", extrudeX(rrect(0, A + 25, 3.4, 2.4, 1.1), 30, 61, { bevel: 0.3 }));
  for (let i = 0; i < 7; i++) k.add("alu", T(box(1.6, 1.6, 6.4, { bevel: 0.3 }), { p: [32.5 + i * 4.6, A + 26.4, 0] }));
  // переходник RMR и сам RMR
  const rb = A + 19.2;
  k.add("alu", extrudeX(shape([[-13, rb - 3, 2], [13, rb - 3, 2], [13, rb + 2.4, 1.5], [-13, rb + 2.4, 1.5]]), -22, 27, { bevel: 1 }));
  for (const x of [-15, 20]) k.add("steel", capScrew(1.7, 0.8), { p: [x, rb + 2.4, 8.5] });
  const m = ctx.kit();
  const RA = rmrBody(ctx, m);
  const rm = m.build();
  rm.position.set(4, rb + 2.4, 0);
  const root = node("acog", [k.build(), rm]);
  const ocL = lens(ctx, at(ctx.C.lensDisc(15.8, -72)), "glassBlue");
  const ob = lens(ctx, at(ctx.C.lensDisc(17, 73)), "glassAmber");
  const ry = rb + 2.4 + RA + 0.5;
  const rmr = lens(ctx, extrudeX(shape(rrect(0, ry, 18.6, 13.4, 5)), 10, 11, { bevel: 0.2 }), "glassAmber");
  root.add(ocL, ob, rmr);
  return {
    root,
    sight: { y: A, z: 0, x0: -74, x1: 75, r: 15, mag: 4, reticle: "chevron", eyeRelief: 38, lens: ocL },
    alt: [{ label: "RMR сверху", y: ry, z: 0, x0: -18, x1: 11, r: 6, mag: 1, reticle: "dot", lens: rmr }]
  };
}
// Прицел 1–6×24 (класс Vortex Razor/Nightforce ATACR): трубка 30 мм, окуляр с диоптрийным кольцом,
// кольцо кратности с рычагом и цифрами, открытые барабаны, подсветка слева, моноблок-кронштейн.
function lpvo(ctx) {
  const k = ctx.kit();
  const A = 40;
  const at = (g, t = {}) => T(g, { ...t, p: [t.p?.[0] || 0, A + (t.p?.[1] || 0), t.p?.[2] || 0] });
  k.add("alu", at(hollowLathe([
    [-132, 18], [-131, 21.6], [-126, 22.2], [-98, 22.2], [-92, 20], [-74, 18.2], [-72, 19.4], [-54, 19.4], [-52, 15.2],
    [-30, 15.2], [-28, 18], [14, 18], [16, 15.2], [30, 15.2], [46, 18.6], [96, 18.6], [96.6, 19], [100, 19], [100.6, 18.6], [104, 17.8]
  ], 14.5, { seg: 48 })));
  k.add("rubber", at(tubeX(22.8, 21.5, -125, -106, { seg: 44 })));
  k.add("alu", at(flutesX(21.8, -130.6, -127, 44, 1, 0.8)));
  k.add("paintWhite", at(hashMarks(22.25, -101, 9, { arc: 80, a0: -40, major: 4, len: 1.2 })));
  k.add("lensBlack", at(tubeX(14.6, 13.6, -130, 102, { seg: 32 })));
  k.add("rubber", at(flutesX(19.2, -71, -56, 24, 1.6, 0.9)));
  k.add("paintWhite", at(hashMarks(19.3, -72.6, 6, { arc: 120, a0: -60, major: 1, len: 1.1 })));
  // рычаг смены кратности с рифлёным пальцевым упором
  k.add("alu", at(extrudeZ([[-70, 17], [-60, 17], [-61.4, 27, 3], [-68.6, 27, 3]], 5, { bevel: 1 }), { r: [-25, 0, 0] }));
  k.add("alu", at(extrudeZ([[-71.5, 26, 2], [-58.5, 26, 2], [-58.5, 31, 2.4], [-71.5, 31, 2.4]], 7, { bevel: 1.4 }), { r: [-25, 0, 0] }));
  // седло и барабаны
  optTurret(k, "alu", { r: 11.6, h: 11, base: 2, marks: 40, knurl: 40 }, { p: [-8, A + 17.6, 0] });
  optTurret(k, "alu", { r: 11.6, h: 10, base: 2, marks: 40, knurl: 40 }, { r: [90, 0, 0], p: [-8, A, 17.6] });
  dialZ(k, "alu", 10.5, 8, [-8, A, -17.2], -1, 11);
  k.add("paintWhite", at(box(0.6, 3, 0.6), { p: [-8, 11.6, -17.4] }));
  // моноблок: две полукольца на общей базе, облегчающие выборки
  k.add("alu", clampBody(-38, 34, 7));
  k.add("steel", crossBolt(-20));
  k.add("steel", crossBolt(18));
  k.add("alu", extrudeX([[-12, 6, 1], [12, 6, 1], [12, A - 16], [-12, A - 16]], -40, 36, { bevel: 1.5 }));
  for (const s of [-1, 1]) for (const x of [-12, 2]) k.add("lensBlack", extrudeZ(rrect(x, 14, 10, 6, 3), 0.8, { bevel: 0.2, z: s * 12.2 }));
  for (const x of [-44, 20]) {
    k.add("alu", at(tubeX(20.5, 15.3, x, x + 16, { seg: 44, c: 1.2 })));
    k.add("alu", extrudeX([[-13, A - 18], [13, A - 18], [13, A - 8], [-13, A - 8]], x, x + 16, { bevel: 1 }));
    for (const s of [-1, 1]) k.add("lensBlack", T(box(15.2, 0.5, 2.2, { bevel: 0.1 }), { p: [x + 8, A, s * 19.6] }));
    for (const s of [-1, 1]) for (const d of [4, 12]) k.add("steel", capScrew(2.1, 1.2), { p: [x + d, A + 19.7, s * 9] });
  }
  const root = node("lpvo", [k.build()]);
  const oc = lens(ctx, at(ctx.C.lensDisc(20, -129)), "glassBlue");
  const ob = lens(ctx, at(ctx.C.lensDisc(16.6, 101)), "glassAmber");
  root.add(oc, ob);
  return { root, sight: { y: A, z: 0, x0: -132, x1: 104, r: 15, mag: 1, zoom: [1, 6], reticle: "lpvo", eyeRelief: 95, lens: oc } };
}
// Aimpoint 3XMag-1 на FTS: откидной кронштейн с кнопкой, винты выверки, резиновый наглазник.
function magnifier(ctx) {
  const k = ctx.kit(), f = ctx.kit();
  const A = 39;
  k.add("alu", clampBody(-16, 16, 6));
  k.add("steel", crossBolt(0));
  k.add("alu", extrudeZ([[-14, 5], [14, 5], [14, 16, 3], [-14, 16, 3]], 24, { bevel: 1.2 }));
  k.add("alu", extrudeX([[-18, 10, 2], [-8, 10, 2], [-8, 22, 3], [-18, 22, 3]], -14, 14, { bevel: 1 }));
  k.add("steel", cylX(3.6, -16, 16, { seg: 16 }), { p: [0, 17, -17] });
  for (const x of [-16, 16]) k.add("steel", cylX(4.4, x - 0.8, x + 0.8, { seg: 16 }), { p: [0, 17, -17] });
  k.add("steel", T(ctx.C.knob(6, 5, 16), { r: [0, -90, 0], p: [0, 10, 12] }));
  // кнопка откидывания справа
  k.add("rubber", cylZ(3.2, 11.5, 14.4, { c: 1, seg: 18 }), { p: [10, 9, 0] });
  f.add("alu", extrudeX(shape([[-17, 12, 2], [-10, 12, 2], [4, A - 20, 4], [12, A - 12, 3], [-6, A - 10, 3], [-19, 22, 2]]), -12, 12, { bevel: 1.2 }));
  f.add("alu", hollowLathe([[-56, 15], [-55, 17.5], [-40, 17.5], [-36, 16.4], [48, 16.4], [54, 15.2]], 12.5, { seg: 44 }).translate(0, A, 0));
  const eye = [[-56.5, 16.5], [-56, 19.6]];
  for (let i = 0; i < 4; i++) { const x = -55 + i * 3.6; eye.push([x, 19.6], [x + 0.8, 18.9], [x + 2, 18.9], [x + 2.8, 19.6]); }
  eye.push([-40, 19.6], [-39.5, 16.5]);
  f.add("rubber", hollowLathe(eye, 16.5, { seg: 44 }).translate(0, A, 0));
  f.add("alu", T(flutesX(16.2, 0, 12, 20, 1.4, 0.8), { p: [20, A, 0] }));
  // башенки выверки сверху и справа (на корпусе увеличителя)
  optTurret(f, "alu", { cap: true, r: 5.6, h: 4.5, base: 1, knurl: 18 }, { p: [-8, A + 16, 0] });
  optTurret(f, "alu", { cap: true, r: 5.6, h: 4.5, base: 1, knurl: 18 }, { r: [90, 0, 0], p: [-8, A, 16] });
  f.add("alu", T(latheX([[-15, 0], [-15, 16.2], [-14, 17.4], [-2, 17.4], [-1, 16.2], [-1, 0]], { seg: 40 }), { p: [0, A, 0] }));
  f.add("alu", extrudeX([[-6, A - 17], [6, A - 17], [6, A - 12], [-6, A - 12]], -12, 12, { bevel: 0.8 }));
  const lensM = lens(ctx, ctx.C.lensDisc(12.6, -53).translate(0, A, 0), "glassBlue");
  const lensF = lens(ctx, ctx.C.lensDisc(12.6, 51).translate(0, A, 0), "glassAmber");
  const body = node("magBody", [f.build(), lensM, lensF]);
  const flip = node("flip", [body]);
  flip.position.set(0, 17, -17);
  body.position.set(0, -17, 17);
  return { root: node("mag3x", [k.build(), flip]), sight: { y: A, z: 0, x0: -56, x1: 54, r: 12, mag: 3, eyeRelief: 70, magnifier: true, suffix: " + 3×", lens: lensM }, flipAside: { node: flip, angle: -88 } };
}
// Trijicon RMR Type 2: корпус-«клин» с закруглённым капюшоном, ушки защиты стекла,
// винты поправок сверху и справа, кнопки с обеих сторон, окно излучателя сзади.
function rmrBody(ctx, k) {
  const A = 15;
  // основание: трапециевидное сечение, скос к затылку
  k.add("alu", loftX([{ x: -22, pts: superEllipse(10.6, 3.4, 5, 32, 4, 0) }, { x: -19.5, pts: superEllipse(12.3, 4.5, 5, 32, 4.5, 0) }, { x: 23, pts: superEllipse(12.3, 4.5, 5, 32, 4.5, 0) }], { crease: 50 }));
  k.add("alu", extrudeZ([[-21, 8], [-6, 8], [-6, 10.8, 1.5], [-10, 11.8, 2], [-19, 11.2, 2], [-21, 9.5, 1]], 22.6, { bevel: 1.2 }));
  const arch = (w, h, y0) => {
    const pts = [[w, y0]];
    for (let i = 0; i <= 14; i++) {
      const a = i / 14 * Math.PI;
      pts.push([Math.cos(a) * w, h - w * 0.55 + Math.sin(a) * w * 0.55]);
    }
    pts.push([-w, y0]);
    return pts;
  };
  const hood = shape(arch(12.7, 25.4, 7), [arch(9.6, 22.4, 8.6)]);
  k.add("alu", extrudeX(hood, -3, 15, { bevel: 1 }));
  // «ушки»: утолщения капюшона у основания спереди
  for (const s of [-1, 1]) k.add("alu", extrudeX([[s * 12.9, 7], [s * 9.8, 7], [s * 9.8, 13], [s * 12.9, 16, 1]], 9, 16.4, { bevel: 0.6 }));
  for (const s of [-1, 1]) k.add("rubber", T(cylZ(3.2, 0, 1.6, { c: 0.6, seg: 16 }), { p: [-15, 10, s * 12.2], r: s < 0 ? [0, 180, 0] : [0, 0, 0] }));
  // окно излучателя и винты поправок
  k.add("lensBlack", extrudeX(rrect(0, 9.8, 5, 2.6, 1), -6.4, -5.8, { bevel: 0.1 }));
  k.add("steel", T(cylY(2.6, 10.5, 12.2, { seg: 14 }), { p: [-16, 0, 0] }));
  k.add("lensBlack", T(box(3.6, 0.5, 0.7, { bevel: 0.1 }), { p: [-16, 12.2, 0] }));
  k.add("steel", T(cylZ(2.6, 12.2, 13.8, { seg: 14 }), { p: [-2, 12, 0] }));
  k.add("lensBlack", T(box(0.7, 3.6, 0.5, { bevel: 0.1 }), { p: [-2, 12, 13.8] }));
  for (const s of [-1, 1]) k.add("steel", T(capScrew(1.5, 0.6), { r: [s * 90, 0, 0] }), { p: [-15, 4.5, s * 12.2] });
  return A;
}
function rmrOffset(ctx) {
  const k = ctx.kit(), m = ctx.kit();
  k.add("alu", clampBody(-12, 12, 5, { w: 24 }));
  k.add("steel", crossBolt(0));
  k.add("alu", extrudeX([[-12, 3, 1], [12, 3, 1], [30, 14, 3], [26, 21, 3], [6, 12, 3], [-12, 8, 2]], -12, 12, { bevel: 1.2 }));
  k.add("steel", T(capScrew(2, 1), { r: [-45, 0, 0] }), { p: [0, 14, 21] });
  m.add("alu", extrudeX(rrect(0, -1.5, 27, 5, 1.5), -23, 24, { bevel: 0.8 }));
  const A = rmrBody(ctx, m);
  const glass = lens(ctx, extrudeX(shape(rrect(0, A + 0.5, 18.6, 13.4, 5)), 6, 7, { bevel: 0.2 }), "glassAmber");
  const cant = node("rmrCant", [m.build(), glass]);
  cant.position.set(0, 16.5, 22);
  cant.rotation.x = Math.PI / 4;
  return {
    root: node("rmr_offset", [k.build(), cant]),
    // прицельная ось задана в системе наклонной площадки: при прицеливании оружие заваливается на 45°
    sight: { node: cant, y: A, z: 0, x0: -22, x1: 15, r: 9, mag: 1, reticle: "dot", lens: glass }
  };
}
// AN/PVS-14 на J-образном кронштейне: корпус с батарейным отсеком AA, ручка усиления,
// кольцо фокусировки объектива, наглазник, ИК-подсветка.
function pvs14(ctx) {
  const k = ctx.kit(), f = ctx.kit();
  const A = 39;
  k.add("alu", clampBody(-16, 16, 6));
  k.add("steel", crossBolt(0));
  k.add("alu", extrudeX([[-18, 5, 2], [-6, 5, 2], [-6, 14, 3], [-18, 14, 3]], -15, 15, { bevel: 1 }));
  k.add("steel", cylX(3.6, -17, 17, { seg: 16 }), { p: [0, 11, -15] });
  for (const x of [-17, 17]) k.add("steel", cylX(4.4, x - 0.8, x + 0.8, { seg: 16 }), { p: [0, 11, -15] });
  f.add("alu", extrudeX(shape([[-17, 8, 2], [-9, 7, 2], [0, 12, 2], [10, 12, 2], [10, 16, 2], [-17, 16, 2]]), -14, 14, { bevel: 1 }));
  f.add("poly", T(extrudeX(shape(rrect(0, 0, 36, 12, 3)), -26, 16, { bevel: 1.5 }), { p: [0, 20, 0] }));
  const at = (g) => g.translate(0, A, 0);
  f.add("poly", at(hollowLathe([[-34, 17], [-30, 20], [22, 20], [26, 17.5]], 13, { seg: 44 })));
  f.add("poly", at(hollowLathe([[-62, 16.5], [-34, 16.5]], 13, { seg: 36 })));
  f.add("rubber", at(flutesX(16.5, -58, -40, 24, 1.6, 0.9)));
  // наглазник с «лепестком» и рёбрами
  f.add("rubber", at(hollowLathe([[-86, 20.5], [-84, 21.8], [-80, 21.5], [-72, 19.6], [-64, 18.5], [-62, 17]], 15, { seg: 44 })));
  f.add("rubber", at(flutesX(19.4, -71, -64, 16, 1.4, 0.7)));
  f.add("poly", at(hollowLathe([[26, 19.5], [58, 19.5], [60, 18]], 15, { seg: 44 })));
  f.add("rubber", at(flutesX(19.5, 30, 54, 28, 1.8, 1)));
  f.add("lensBlack", at(tubeX(15, 13.6, 52, 60.2, { seg: 32 })));
  // батарейный отсек слева с рифлёной крышкой, ручка усиления и поворотный выключатель
  f.add("poly", T(cylZ(10, -36, -18, { c: 1, seg: 28 }), { p: [0, A + 4, 0] }));
  f.add("poly", T(ctx.C.knob(10.6, 5, 24), { r: [0, 90, 0], p: [0, A + 4, -36] }));
  f.add("poly", T(ctx.C.knob(8, 7, 12), { r: [0, 90, 0], p: [-22, A, -19] }));
  f.add("poly", T(ctx.C.knob(6.5, 5, 14), { r: [0, 0, 90], p: [-14, A + 20, 0] }));
  f.add("poly", T(box(10, 3, 2.4, { bevel: 0.6 }), { p: [-14, A + 26.2, 0] }));
  f.add("poly", T(extrudeX(rrect(0, 0, 8, 6, 2), 16, 24, { bevel: 0.8 }), { p: [0, A + 19, 9] }));
  f.add("irLens", T(cylX(2.2, 23.6, 24.4, { seg: 14 }), { p: [0, A + 19, 9] }));
  const lensO = lens(ctx, ctx.C.lensDisc(13.8, 56).translate(0, A, 0), "glassBlue");
  const lensE = lens(ctx, ctx.C.lensDisc(14, -64).translate(0, A, 0), "glassRed");
  const body = node("pvsBody", [f.build(), lensO, lensE]);
  const flip = node("flip", [body]);
  flip.position.set(0, 11, -15);
  body.position.set(0, -11, 15);
  return { root: node("pvs14", [k.build(), flip]), sight: { y: A, z: 0, x0: -86, x1: 60, r: 14, mag: 1, eyeRelief: 22, magnifier: true, nv: true, hide: body, suffix: " + PVS-14", lens: lensE }, flipAside: { node: flip, angle: -95 } };
}
// Magpul MBUS Gen 2: полимерный складной диоптр с двумя апертурами и барабаном поправки справа.
function mbusRear(ctx) {
  const k = ctx.kit(), f = ctx.kit();
  k.add("poly", clampBody(-13, 13, 6, { w: 25 }));
  k.add("steel", crossBolt(0));
  k.add("poly", extrudeZ([[-13, 5], [13, 5], [13, 11, 3], [-13, 11, 3]], 30, { bevel: 1.5 }));
  for (const s of [-1, 1]) k.add("poly", extrudeZ([[-10, 9, 1], [6, 9, 1], [4, 15, 2], [-10, 14, 2]], 3, { bevel: 0.8, z: s * 11 }));
  for (let i = 0; i < 4; i++) k.add("poly", T(box(1.2, 1, 22, { bevel: 0.3 }), { p: [-10 + i * 2.6, 11.2, 0] }));
  f.add("poly", extrudeX(shape([[-13, 0, 1], [13, 0, 1], [13, 42, 3], [-13, 42, 3]], [circle(0, 29.5, 2.7, 24)]), -3.5, 3.5, { bevel: 1 }));
  f.add("poly", T(tubeX(8, 2.6, -2.5, 2.5, { seg: 28 }), { p: [0, 29.5, 0] }));
  f.add("poly", T(tubeX(5.4, 1, -2.2, 2.2, { seg: 20 }), { p: [0, 29.5, 0] }));
  f.add("poly", T(ctx.C.knob(5.2, 5, 16), { r: [0, -90, 0], p: [0, 22, 12] }));
  f.add("paintWhite", T(box(0.5, 2.4, 0.3), { p: [0, 26.2, 13.2] }));
  const flip = node("flip", [f.build()]);
  flip.position.set(4, 10, 0);
  flip.children[0].position.set(-4, -4, 0);
  return { root: node("mbus_rear", [k.build(), flip]), irons: { rear: [0, 35.5, 0], type: "aperture" }, flip: { node: flip, angle: -90 } };
}
function mbusFront(ctx) {
  const k = ctx.kit(), f = ctx.kit();
  k.add("poly", clampBody(-13, 13, 6, { w: 25 }));
  k.add("steel", crossBolt(0));
  k.add("poly", extrudeZ([[-13, 5], [13, 5], [13, 11, 3], [-13, 11, 3]], 30, { bevel: 1.5 }));
  for (let i = 0; i < 4; i++) k.add("poly", T(box(1.2, 1, 22, { bevel: 0.3 }), { p: [4 + i * 2.6, 11.2, 0] }));
  const ear = [[-6, 0, 1], [6, 0, 1], [5, 32, 2], [1, 42, 2], [-2, 42, 2], [-6, 30, 2]];
  f.add("poly", extrudeZ(shape(ear), 3.4, { bevel: 0.8, z: 8 }));
  f.add("poly", extrudeZ(shape(ear), 3.4, { bevel: 0.8, z: -8 }));
  f.add("poly", extrudeZ([[-6, 0, 1], [6, 0, 1], [6, 14, 2], [-6, 14, 2]], 19, { bevel: 1 }));
  // барабан высоты под мушкой (4 защёлки) и стальная мушка
  f.add("poly", T(ctx.C.knob(5.5, 4, 12), { r: [0, 0, 90], p: [0, 14, 0] }));
  f.add("steel", cylY(2, 12, 29.5, { seg: 12 }));
  f.add("steel", extrudeZ([[-1.1, 28], [1.1, 28], [0.8, 35.5, 0.3], [-0.8, 35.5, 0.3]], 1.8, { bevel: 0.2 }));
  const flip = node("flip", [f.build()]);
  flip.position.set(-6, 10, 0);
  flip.children[0].position.set(6, -4, 0);
  return { root: node("mbus_front", [k.build(), flip]), irons: { front: [0, 35.5, 0] }, flip: { node: flip, angle: 90 } };
}
// Корпус оптического прицела вокруг оси: окуляр с быстрой диоптрийной фокусировкой, кольцо
// кратности с рычагом и цифрами, трубка, седло с открытыми барабанами, объектив с резьбой бленды.
// at — перенос на высоту оси; o.tube — радиус трубки (15 = 30 мм, 17 = 34 мм), o.obj — радиус объектива.
function scopeBody(ctx, k, at, o) {
  const r = o.tube, R0 = o.obj + 2.2, x0 = o.x0, x1 = o.x1, M = o.mat || "alu";
  k.add(M, at(hollowLathe([
    [x0, 17], [x0 + 1, 20.5], [x0 + 8, 21.4], [x0 + 48, 21.4], [x0 + 54, 19.2], [x0 + 62, r + 3], [x0 + 86, r + 3], [x0 + 90, r],
    [x1 - 70, r], [x1 - 50, R0 - 3], [x1 - 34, R0], [x1 - 12, R0], [x1 - 11.4, R0 + 0.5], [x1 - 1, R0 + 0.5], [x1, R0 - 0.7]
  ], Math.min(r - 1.6, 14), { seg: 48 })));
  k.add(M, at(flutesX(21.1, x0 + 1.5, x0 + 7.5, 48, 1.1, 0.8)));
  k.add("rubber", at(tubeX(21.8, 20.6, x0 + 11, x0 + 40, { seg: 44 })));
  k.add("paintWhite", at(hashMarks(21.45, x0 + 44, 9, { arc: 80, a0: -40, major: 4, len: 1.2 })));
  k.add("rubber", at(flutesX(r + 2.6, x0 + 64, x0 + 84, 30, 1.6, 1)));
  k.add("paintWhite", at(hashMarks(r + 3.05, x0 + 62.4, 7, { arc: 130, a0: -65, major: 1, len: 1 })));
  k.add(M, at(extrudeZ([[x0 + 70, r + 2], [x0 + 80, r + 2], [x0 + 79, r + 10, 2], [x0 + 71, r + 10, 2]], 6, { bevel: 1 })));
  k.add(M, at(extrudeZ([[x0 + 68.6, r + 9, 2], [x0 + 81.4, r + 9, 2], [x0 + 81.4, r + 13, 2.2], [x0 + 68.6, r + 13, 2.2]], 7, { bevel: 1.3 })));
  k.add("paintWhite", at(T(box(0.6, 3, 0.6), { p: [x0 + 89, r + 0.1, 5] })));
  k.add(M, at(flutesX(R0 + 0.4, x1 - 10.6, x1 - 1.8, 40, 1, 0.6)));
  k.add("lensBlack", at(tubeX(Math.min(r - 1.5, 14), Math.min(r - 2.5, 13), x0 + 1, x1 - 1, { seg: 32 })));
  const sx = o.saddle ?? -10;
  const sl = o.saddleL ?? 26;
  k.add(M, at(extrudeX(shape(rrect(0, 0, 2 * r + 8, 2 * r + 6, r)), sx - sl, sx + sl, { bevel: 2 })));
  // барабаны: высота сверху (с нулевым упором), ветер справа, параллакс слева
  const put = (oo, t) => {
    const tt = turret(oo);
    for (const g of tt.m) k.add(M, at(g, t));
    for (const g of tt.w) k.add("paintWhite", at(g, t));
  };
  put({ r: o.turret, h: o.turret * 0.95, base: 2.4, marks: 50, knurl: 44, markLen: 1.6 }, { p: [sx, r + 3, 0] });
  put({ r: o.turret - 1, h: (o.turret - 1) * 0.8, base: 2.4, marks: 40, knurl: 40, markLen: 1.4 }, { r: [90, 0, 0], p: [sx, 0, r + 4] });
  put({ r: o.turret - 2.5, h: (o.turret - 2.5) * 0.75, base: 2, marks: 20, major: 4, knurl: 34, markLen: 1.2 }, { r: [-90, 0, 0], p: [sx, 0, -r - 4] });
}
// Кольца: основание-зажим, полукольца с разъёмом по горизонтали, по два винта на сторону.
function scopeRings(ctx, k, xs, A, r) {
  for (const x of xs) {
    k.add("alu", clampBody(x - 10, x + 10, 6));
    k.add("steel", crossBolt(x, -2.5, 13));
    k.add("alu", extrudeX([[-10, 5, 1], [10, 5, 1], [8, A - r + 2], [-8, A - r + 2]], x - 9, x + 9, { bevel: 1 }));
    k.add("alu", T(tubeX(r + 4, r + 0.1, x - 9, x + 9, { seg: 44, c: 1 }), { p: [0, A, 0] }));
    for (const s of [-1, 1]) k.add("alu", T(box(16, 5, 7, { bevel: 1.2 }), { p: [x, A, s * (r + 5)] }));
    for (const s of [-1, 1]) k.add("lensBlack", T(box(17.4, 0.45, 8.4, { bevel: 0.1 }), { p: [x, A, s * (r + 4.6)] }));
    for (const s of [-1, 1]) for (const d of [-4.5, 4.5]) k.add("steel", capScrew(2, 1.2), { p: [x + d, A + 2.5, s * (r + 5)] });
  }
}
function sniperScope(ctx, o) {
  const k = ctx.kit();
  const A = o.A, at = (g, t = {}) => T(g, { ...t, p: [t.p?.[0] || 0, A + (t.p?.[1] || 0), t.p?.[2] || 0] });
  scopeBody(ctx, k, at, o);
  // подсветка сетки: ручка поверх барабана параллакса
  const sx = o.saddle ?? -10;
  k.add("alu", at(T(ctx.C.knob(o.turret - 5, 5, 20), { r: [0, 90, 0] }), { p: [sx, 0, -o.tube - 4 - 2 - (o.turret - 2.5) * 0.75 - 0.6] }));
  k.add("steel", at(cylZ(o.turret - 8, -o.tube - 7 - (o.turret - 2.5) * 0.75, -o.tube - 5.5 - (o.turret - 2.5) * 0.75, { seg: 20 }), { p: [sx, 0, 0] }));
  scopeRings(ctx, k, o.rings, A, o.tube);
  const root = node(o.name, [k.build()]);
  const oc = lens(ctx, at(ctx.C.lensDisc(18.5, o.x0 + 2)), "glassBlue");
  const ob = lens(ctx, at(ctx.C.lensDisc(o.obj, o.x1 - 2)), "glassAmber");
  root.add(oc, ob);
  return { root, sight: { y: A, z: 0, x0: o.x0, x1: o.x1, r: o.tube, mag: o.zoom[0], zoom: o.zoom, reticle: o.reticle || "mil", eyeRelief: o.eyeRelief ?? 90, lens: oc } };
}
var mag1x39 = (cfg, asm) => {
  const it = asm.installed.get("optic");
  const s = it?.info?.sight;
  return !!s && s.mag === 1 && !s.zoom && Math.abs(s.y - 39) < 1.5;
};
// ---- прицелы и крепления из набора M416/АК/SCAR
function cantOptic(ctx, name, body) {
  const k = ctx.kit(), m = ctx.kit();
  k.add("alu", clampBody(-13, 13, 5, { w: 24 }));
  k.add("steel", crossBolt(0));
  k.add("alu", extrudeX([[-12, 3, 1], [12, 3, 1], [31, 14, 3], [27, 22, 3], [6, 12, 3], [-12, 8, 2]], -13, 13, { bevel: 1.2 }));
  for (const x of [-7, 7]) k.add("steel", T(cylX(1.9, 0, 1.4, { seg: 6 }).rotateY(Math.PI / 2), { p: [x, 17, 24] }));
  m.add("alu", extrudeX(rrect(0, -1.5, 28, 5, 1.5), -24, 25, { bevel: 0.8 }));
  const b = body(ctx, m);
  const cant = node(name + "Cant", [m.build(), b.glass]);
  cant.position.set(0, 16.5, 22);
  cant.rotation.x = Math.PI / 4;
  return {
    root: node(name, [k.build(), cant]),
    sight: { node: cant, y: b.A, z: 0, x0: b.x0, x1: b.x1, r: 9, mag: 1, reticle: b.reticle || "dot", lens: b.glass }
  };
}
function dppBody(ctx, k) {
  const A = 17;
  k.add("alu", extrudeX(rrect(0, 4, 26, 8, 2), -24, 22, { bevel: 1.2 }));
  k.add("alu", extrudeZ([[-24, 7], [-8, 7], [-8, 11], [-14, 13.5, 2], [-24, 12.5, 2]], 24, { bevel: 1.2 }));
  const hood = shape([[-13, 7], [13, 7], [13, 22, 3], [8, 29, 5], [-8, 29, 5], [-13, 22, 3]], [[[-10, 8.6], [10, 8.6], [10, 21.5, 2], [6.5, 26.5, 4], [-6.5, 26.5, 4], [-10, 21.5, 2]]]);
  k.add("alu", extrudeX(hood, 0, 17, { bevel: 1 }));
  k.add("steel", T(box(10, 2.4, 20, { bevel: 0.6 }), { p: [8, 28.6, 0] }));
  k.add("rubber", T(cylY(3, 11, 13.6, { seg: 16, c: 0.6 }), { p: [-18, 0, 0] }));
  for (const s of [-1, 1]) k.add("steel", T(cylZ(2.2, 12.6, 13.6, { seg: 12 }), { p: [-4, 11, s > 0 ? 0 : -26.2] }));
  const glass = lens(ctx, extrudeX(shape([[-9.6, 9], [9.6, 9], [9.6, 21, 2], [6, 26, 4], [-6, 26, 4], [-9.6, 21, 2]]), 11, 12, { bevel: 0.2 }), "glassAmber");
  return { A, glass, x0: -24, x1: 17, reticle: "dot" };
}
function acroBody(ctx, k) {
  const A = 16;
  const sec = shape(rrect(0, 14, 30, 28, 5), [rrect(0, 16, 20, 17, 3)]);
  k.add("alu", extrudeX(sec, -12, 16, { bevel: 1.4 }));
  k.add("alu", extrudeX(rrect(0, 4, 30, 8, 2), -24, 16, { bevel: 1.2 }));
  // задний торец закрытого корпуса — рамка с окном, прицельная линия через неё открыта
  k.add("alu", extrudeX(shape(rrect(0, 14.5, 30, 15, 3), [rrect(0, 15.5, 20, 11, 2)]), -24, -12, { bevel: 1.2 }));
  for (const s of [-1, 1]) k.add("rubber", T(box(6, 5, 1.6, { bevel: 0.6 }), { p: [-18, 12, s * 13.8] }));
  k.add("steel", T(cylY(3.4, 1, 2, { seg: 20 }), { p: [-2, -1, 0] }));
  const glass = lens(ctx, extrudeX(shape(rrect(0, 16, 20, 17, 3)), 12, 13, { bevel: 0.2 }), "glassBlue");
  return { A, glass, x0: -12, x1: 16, reticle: "dot" };
}
function hs507Body(ctx, k) {
  const A = rmrBody(ctx, k);
  k.add("alu", T(box(16, 9, 2.2, { bevel: 0.8 }), { p: [-10, 5, 13.3] }));
  k.add("steel", T(cylZ(1.5, 14.2, 15, { seg: 10 }), { p: [-15, 5, 0] }));
  const glass = lens(ctx, extrudeX(shape(rrect(0, A + 0.5, 18.6, 13.4, 5)), 6, 7, { bevel: 0.2 }), "glassBlue");
  return { A, glass, x0: -22, x1: 15, reticle: "cdot" };
}
function compm4(ctx) {
  const k = ctx.kit();
  const A = 39;
  const at = (g, t = {}) => T(g, { ...t, p: [t.p?.[0] || 0, A + (t.p?.[1] || 0), t.p?.[2] || 0] });
  k.add("alu", clampBody(-16, 16, 6));
  k.add("alu", extrudeZ(shape([[-15, 5, 1], [15, 5, 1], [13, A - 17, 3], [-13, A - 17, 3]], [slot(-7, 7, (A - 12) / 2 + 3, 8)]), 20, { bevel: 1.2 }));
  k.add("alu", at(tubeX(22.4, 19.6, -11, 11, { seg: 44, c: 1.2 })));
  k.add("alu", extrudeX([[-6, A - 26], [6, A - 26], [6, A - 18], [-6, A - 18]], -11, 11, { bevel: 0.8 }));
  k.add("alu", T(ctx.C.knob(11, 9, 20), { r: [0, -90, 0], p: [0, -1, 13] }));
  k.add("steel", cylZ(3.4, -15, 13, { seg: 12 }), { p: [0, -1, 0] });
  k.add("alu", at(hollowLathe([[-60, 18.8], [-59, 21], [-50, 21], [-48, 19.6], [36, 19.6], [40, 21.6], [58, 21.6], [60, 20.2]], [[-60, 15.2], [60, 17.4]], { seg: 48 })));
  k.add("rubber", at(tubeX(21.4, 20.2, -58, -50, { seg: 44 })));
  k.add("lensBlack", at(tubeX(17.5, 16.8, -58, 58, { seg: 32 })));
  k.add("alu", at(ringGrooves(21.6, 44, 56, 4, 0.5, { seg: 44, rIn: 17.5 })));
  // блок барабанов охватывает трубку: канал на оси открыт
  k.add("alu", at(extrudeX(shape(rrect(0, 0, 34, 34, 9), [circle(0, 0, 16.4, 44)]), 8, 30, { bevel: 1.6 })));
  k.add("alu", at(cylY(9.5, 16, 26, { c: 1.2, seg: 28 }), { p: [19, 0, 0] }));
  k.add("alu", at(cylZ(9.5, 16, 26, { c: 1.2, seg: 28 }), { p: [19, 0, 0] }));
  k.add("alu", at(cylX(9.4, 14, 58, { c: 1, seg: 28 }), { p: [0, -21, 0] }));
  k.add("alu", at(extrudeX([[-7, -19], [7, -19], [7, -12], [-7, -12]], 14, 58, { bevel: 0.8 })));
  k.add("alu", at(ctx.C.knob(10, 8, 24), { r: [0, 0, -90], p: [58, -21, 0] }));
  k.add("alu", at(ctx.C.knob(9, 7, 20), { r: [0, 90, 0], p: [-30, 0, -19.5] }));
  const root = node("compm4", [k.build()]);
  root.add(lens(ctx, at(ctx.C.lensDisc(15.4, -57)), "glassBlue"));
  const front = lens(ctx, at(ctx.C.lensDisc(17.4, 57)), "glassRed");
  root.add(front);
  return { root, sight: { y: A, z: 0, x0: -60, x1: 60, r: 15, mag: 1, reticle: "dot", lens: front } };
}
function rmrRiser(ctx) {
  const k = ctx.kit(), m = ctx.kit();
  const H = 24;
  k.add("alu", clampBody(-17, 17, 5, { w: 25 }));
  k.add("steel", crossBolt(-8));
  k.add("steel", crossBolt(8));
  k.add("alu", extrudeZ(shape([[-18, 4, 1], [18, 4, 1], [17, H, 1.5], [-17, H, 1.5]], [slot(-10, 10, H / 2 + 2, 8)]), 24, { bevel: 1 }));
  k.add("alu", extrudeX(rrect(0, H - 1.5, 26, 3, 1), -22, 22, { bevel: 0.6 }));
  const A = rmrBody(ctx, m);
  const glass = lens(ctx, extrudeX(shape(rrect(0, A + 0.5, 18.6, 13.4, 5)), 6, 7, { bevel: 0.2 }), "glassAmber");
  const body = node("rmr", [m.build(), glass]);
  body.position.set(-3, H, 0);
  return { root: node("rmr_riser", [k.build(), body]), sight: { node: body, y: A, z: 0, x0: -22, x1: 15, r: 9, mag: 1, reticle: "dot", lens: glass } };
}
function pk120(ctx) {
  const k = ctx.kit();
  const A = 40;
  k.add("alu", clampBody(-24, 24, 6));
  k.add("steel", crossBolt(-10));
  k.add("steel", T(ctx.C.knob(8, 7, 18), { r: [0, -90, 0], p: [12, -1, 13] }));
  k.add("alu", extrudeX([[-15, 5, 1], [15, 5, 1], [15, A - 16, 2], [-15, A - 16, 2]], -30, 30, { bevel: 1.2 }));
  const oct = (w, h, c, cy) => [[-w + c, cy - h], [w - c, cy - h], [w, cy - h + c], [w, cy + h - c], [w - c, cy + h], [-w + c, cy + h], [-w, cy + h - c], [-w, cy - h + c]];
  k.add("alu", extrudeX(shape(oct(20, 17, 6, A), [oct(16, 13, 5, A)]), -34, 34, { bevel: 1.2 }));
  k.add("alu", extrudeX(shape(oct(21, 18, 6.5, A), [oct(16.5, 13.5, 5, A)]), 26, 36, { bevel: 1 }));
  k.add("alu", T(cylX(7.5, -30, 6, { c: 1, seg: 24 }), { p: [0, A - 4, 24] }));
  k.add("alu", T(ctx.C.knob(7.8, 5, 18), { r: [0, 180, 0], p: [-30, A - 4, 24] }));
  k.add("alu", T(ctx.C.knob(9, 7, 22), { r: [0, 90, 0], p: [-18, A - 6, -20] }));
  const root = node("pk120", [k.build()]);
  const win = lens(ctx, extrudeX(shape(oct(16, 13, 5, A)), 24, 25, { bevel: 0.2 }), "glassRed");
  root.add(win);
  return { root, sight: { y: A, z: 0, x0: -34, x1: 36, r: 12, mag: 1, reticle: "dot", lens: win } };
}
function okp7(ctx) {
  const k = ctx.kit();
  const Y = 50, Z = 19;
  k.add("steel", extrudeX(shape([[-3, -9, 1], [4, -9], [4, 9], [-3, 9, 1], [-11, 7, 2], [-11, -7, 2]]), -46, 46, { bevel: 0.8 }));
  k.add("steel", T(ctx.C.knob(7, 6, 18), { r: [0, 90, 0], p: [-26, 0, -11] }));
  k.add("alu", extrudeX(shape([[-11, 6, 2], [4, 6, 2], [Z - 6, Y - 18, 3], [Z - 10, Y - 12, 3], [-11, 20, 2]]), -44, 44, { bevel: 1.4 }));
  const trap = (w0, w1, y0, y1) => [[Z - w0, y0, 2], [Z + w0, y0, 2], [Z + w1, y1, 5], [Z - w1, y1, 5]];
  k.add("alu", extrudeX(shape(trap(22, 17, Y - 17, Y + 15), [trap(17.5, 13.5, Y - 13, Y + 11.5)]), -48, 40, { bevel: 1.4 }));
  k.add("alu", extrudeX([[Z - 18, Y - 22, 2], [Z + 18, Y - 22, 2], [Z + 18, Y - 16], [Z - 18, Y - 16]], -48, -8, { bevel: 1 }));
  k.add("alu", T(ctx.C.knob(8, 6, 20), { r: [0, -90, 0], p: [-30, Y - 6, Z + 21] }));
  const root = node("okp7", [k.build()]);
  const win = lens(ctx, extrudeX(shape(trap(17.5, 13.5, Y - 13, Y + 11.5)), 30, 31, { bevel: 0.2 }), "glassAmber");
  root.add(win);
  return { root, sight: { y: Y - 1, z: Z, x0: -48, x1: 31, r: 12, mag: 1, reticle: "dot", lens: win } };
}
var OPTICS = [
  { id: "t2_low", cat: "optic", name: "Aimpoint Micro T-2", desc: "Коллиматор, низкое крепление (ось 20 мм). Для высоких планок АК", needs: (cfg) => !cfg.rearsight, needsWhy: "ось 20 мм ниже сложенного целика — снимите целик", foot: [-18, 18], body: [-38, 38], stats: { weight: 135, ergo: -1, adsTime: 8 }, build: (c) => t2(c, 20) },
  { id: "t2_lrp", cat: "optic", name: "Aimpoint T-2 + LRP 39 мм", desc: "Коллиматор на кронштейне, нижняя треть с механикой AR", foot: [-18, 18], body: [-38, 38], stats: { weight: 190, ergo: -1, adsTime: 10 }, build: (c) => t2(c, 39) },
  { id: "compm4", cat: "optic", name: "Aimpoint CompM4s", desc: "Армейский коллиматор, точка 2 MOA, батарея АА на 8 лет", foot: [-16, 16], body: [-62, 62], stats: { weight: 380, ergo: -3, adsTime: 14 }, build: compm4 },
  { id: "rmr_riser", cat: "optic", name: "Trijicon RMR на райзере Unity", desc: "Мини-коллиматор открытого типа, самый лёгкий", foot: [-17, 17], body: [-25, 22], stats: { weight: 90, ergo: 0, adsTime: 6 }, build: rmrRiser },
  { id: "exps3", cat: "optic", name: "EOTech EXPS3", desc: "Голографический, кольцо 68 MOA с точкой", foot: [-22, 22], body: [-48, 46], stats: { weight: 320, ergo: -3, adsTime: 14 }, build: (c) => exps3(c) },
  { id: "xps2", cat: "optic", name: "EOTech XPS2", desc: "Короткий голографический, одна батарея CR123", foot: [-18, 18], body: [-40, 46], stats: { weight: 255, ergo: -2, adsTime: 12 }, build: (c) => exps3(c, { xps2: true }) },
  { id: "mro", cat: "optic", name: "Trijicon MRO", desc: "Коллиматор-трубка, объектив 25 мм, точка 2 MOA, нижняя треть", foot: [-20, 20], body: [-31, 32], stats: { weight: 150, ergo: -1, adsTime: 9 }, build: (c) => mro(c, 39) },
  { id: "hs510c", cat: "optic", name: "Holosun HS510C", desc: "Открытый коллиматор с рамкой, кольцо 65 MOA + точка, широкое поле", foot: [-22, 22], body: [-34, 30], stats: { weight: 250, ergo: -2, adsTime: 10 }, build: hs510c },
  { id: "pk120", cat: "optic", name: "ПК-120 (БелОМО)", desc: "Коллиматор в защищённом кожухе-тоннеле", foot: [-24, 24], body: [-40, 37], stats: { weight: 310, ergo: -2, adsTime: 12 }, build: pk120 },
  { id: "okp7d", cat: "optic", name: "ОКП-7Д «Валдай»", desc: "Низкий коллиматор на боковую планку АК, окно над крышкой", mountTypes: ["dovetail"], only: ["akm", "ak74"], foot: [-46, 46], body: [-48, 46], needs: (cfg) => !cfg.sidemount, stats: { weight: 290, ergo: -2, adsTime: 11 }, build: okp7 },
  { id: "acog", cat: "optic", name: "Trijicon ACOG TA31 4×32", desc: "Призменный 4×, шеврон с дальномерной шкалой", foot: [-32, 32], body: [-75, 76], stats: { weight: 480, ergo: -6, adsTime: 40 }, build: acog },
  { id: "lpvo", cat: "optic", name: "Прицел 1–6×24", desc: "Переменная кратность, колёсико — зум в прицеле", foot: [-38, 34], body: [-132, 106], stats: { weight: 720, ergo: -9, adsTime: 55 }, build: lpvo },
  { id: "mk5hd", cat: "optic", name: "Leupold Mark 5HD 3,6–18×44", desc: "Снайперский, трубка 35 мм, сетка mil-dot, колесо — кратность", foot: [-58, 34], body: [-178, 112], stats: { weight: 880, ergo: -12, adsTime: 70 }, build: (c) => sniperScope(c, { name: "mk5hd", A: 36, tube: 17.5, obj: 23, turret: 15, x0: -178, x1: 112, saddle: -12, saddleL: 20, rings: [-48, 24], zoom: [3.6, 18], eyeRelief: 92 }) },
  { id: "sb_pm2", cat: "optic", name: "Schmidt & Bender PM II 5–25×56", desc: "Тяжёлый дальнобойный прицел, объектив 56 мм — высокие кольца", foot: [-56, 36], body: [-190, 142], stats: { weight: 1100, ergo: -15, adsTime: 85 }, build: (c) => sniperScope(c, { name: "pm2", A: 44, tube: 17.5, obj: 29, turret: 16, x0: -190, x1: 142, saddle: -8, saddleL: 20, rings: [-46, 26], zoom: [5, 25], eyeRelief: 90 }) },
  { id: "mag3x", cat: "magnifier", name: "Aimpoint 3XMag-1 + FTS", desc: "Увеличитель 3×, откидывается вбок", foot: [-16, 16], body: [-57, 55], needs: mag1x39, stats: { weight: 330, ergo: -4, adsTime: 20 }, build: magnifier },
  { id: "pvs14", cat: "magnifier", name: "Монокуляр AN/PVS-14", desc: "ПНВ за коллиматором на откидном кронштейне (N — откинуть)", foot: [-16, 16], body: [-86, 60], needs: mag1x39, stats: { weight: 420, ergo: -6, adsTime: 25 }, build: pvs14 },
  { id: "rmr_off", cat: "offset", side: true, name: "Trijicon RMR на 45° кронштейне", desc: "Мини-коллиматор сбоку для ближнего боя: V — переключиться, оружие заваливается", foot: [-12, 12], body: [-23, 24], stats: { weight: 95, ergo: -1 }, build: rmrOffset },
  { id: "dpp_off", cat: "offset", side: true, name: "Leupold DeltaPoint Pro на 45°", desc: "Наклонный коллиматор с большим окном, точка 2,5 MOA (V — переключиться)", foot: [-13, 13], body: [-24, 25], stats: { weight: 110, ergo: -1 }, build: (c) => cantOptic(c, "dpp_off", dppBody) },
  { id: "acro_off", cat: "offset", side: true, name: "Aimpoint ACRO P-2 на 45°", desc: "Наклонный закрытый коллиматор: излучатель защищён от грязи и воды", foot: [-13, 13], body: [-24, 25], stats: { weight: 120, ergo: -1 }, build: (c) => cantOptic(c, "acro_off", acroBody) },
  { id: "hs507_off", cat: "offset", side: true, name: "Holosun HS507C на 45°", desc: "Наклонный коллиматор: кольцо 32 MOA + точка, боковой лоток батареи", foot: [-13, 13], body: [-24, 25], stats: { weight: 100, ergo: -1 }, build: (c) => cantOptic(c, "hs507_off", hs507Body) },
  { id: "mbus_rear", cat: "rearsight", name: "Magpul MBUS (целик)", desc: "Складной диоптр, полимер", foot: [-13, 13], body: [-13, 13], stats: { weight: 34 }, build: mbusRear },
  { id: "mbus_front", cat: "frontsight", name: "Magpul MBUS (мушка)", desc: "Складная мушка, полимер", foot: [-13, 13], body: [-13, 13], stats: { weight: 26 }, build: mbusFront }
];

// src/engine/lib/dovetail.js
// Боковой «ласточкин хвост» (АК/СВД): кронштейн под Пикатинни и прицелы на прямом креплении.
// Система координат — у планки на левом борту ствольной коробки: z<0 — наружу, z>0 — к оси.
// Зажимной рычаг на наружной стороне колодки: лежит вдоль борта, ось с гайкой натяжения.
function dovetailLever(k, x0, x1, o = {}) {
  const z = o.z ?? -11, len = x1 - x0;
  k.add("steel", extrudeZ([[0, -3.2, 1.6], [len - 6, -2.6, 3], [len, -1.2, 2.4], [len, 3.6, 2.4], [len - 6, 5.2, 3], [4, 4.4, 2], [0, 2.6, 1.6]], 3, { bevel: 0.8, curve: 6 }), { p: [x0, o.y ?? 0, z - 1.5] });
  for (let i = 0; i < 5; i++) k.add("steel", T(box(0.9, 5.6, 1, { bevel: 0.25 }), { p: [x0 + len - 2 - i * 1.7, (o.y ?? 0) + 1.2, z - 3.2] }));
  k.add("steel", latheX([[0, 0], [0, 4.4], [0.6, 5], [2.4, 5], [3, 4.4], [3, 2.2], [3.6, 1.8], [3.6, 0]], { seg: 20 }), { r: [0, 90, 0], p: [x0 + 3.5, o.y ?? 0, z] });
}
function dovetailClamp(k, x0, x1, o = {}) {
  k.add("steel", extrudeX(shape([[-3, -9, 1], [4, -9], [4, 9], [-3, 9, 1], [-11, 7, 2], [-11, -7, 2]]), x0, x1, { bevel: 0.8 }));
  // канавка-упор и винты крепления колодки
  k.add("lensBlack", extrudeX([[-11.1, -0.3], [-10.6, -0.3], [-10.6, 0.3], [-11.1, 0.3]], x0 + 4, x1 - 4, { bevel: 0.05 }));
  for (const x of o.screws ?? []) k.add("steel", T(capScrew(2, 0.9), { r: [-90, 0, 0] }), { p: [x, 4, -11] });
  // гайка натяжения на заднем торце
  k.add("steel", T(thumbNut(6, 4, 8), { r: [0, 180, 0] }), { p: [x0, 0, -4] });
}
function sideMount(ctx) {
  const k = ctx.kit();
  dovetailClamp(k, -55, 55, { screws: [-40, 40] });
  dovetailLever(k, 14, 46);
  const riser = shape([[-55, 8, 2], [55, 8, 2], [55, 20, 3], [40, 46, 4], [-40, 46, 4], [-55, 20, 3]], [slot(-30, 30, 26, 14)]);
  k.add("alu", T(extrudeZ(riser, 8, { bevel: 1.2 }), { p: [0, 0, -5] }));
  const top = 58, cz = 19;
  k.add("alu", extrudeX(shape([[-6, 42, 2], [cz + 11, 42, 2], [cz + 11, top - 9, 2], [-6, top - 9, 2]]), -52, 52, { bevel: 1 }));
  for (const x of [-26, 0, 26]) k.add("lensBlack", extrudeZ(rrect(x, 45.5, 14, 3, 1.5), 0.6, { bevel: 0.1, z: cz + 11.2 }));
  const r = picatinny(104, { base: 9.4 });
  k.add("alu", r.geo, { p: [-52, top, cz] });
  const m = ctx.railMount("sideRail", [-52 + r.first, top, cz], "top", r.slots, { axis: "top" });
  return { root: node("sidemount", [k.build(), m]) };
}
// ПСО-1 4×24: трубка с длинным резиновым наглазником, корпус механизмов с маховичком
// углов прицеливания (цифры 0–10) сверху и боковых поправок слева, осветитель сетки
// с батарейным отсеком и тумблером, кронштейн с зажимным рычагом и гайкой.
function pso1(ctx) {
  const k = ctx.kit();
  dovetailClamp(k, -60, 40, { screws: [-48, 28] });
  dovetailLever(k, -46, -12);
  const Y = 60, Z = 13;
  const at = (g) => g.translate(0, Y, Z);
  // кронштейн: наклонная стенка от колодки к корпусу механизмов, рёбра жёсткости
  k.add("steel", extrudeX(shape([[-12, 6, 2], [4, 6, 2], [Z + 6, Y - 22, 4], [Z - 8, Y - 14, 4], [-12, 18, 2]]), -58, 36, { bevel: 1.5 }));
  for (const x of [-40, 18]) k.add("steel", extrudeX(shape([[-8, 8, 1], [2, 8, 1], [Z + 2, Y - 20, 2], [Z - 6, Y - 18, 2]]), x - 2, x + 2, { bevel: 0.6 }));
  // трубка: окулярная часть, корпус, объектив с блендой
  k.add("steel", at(latheX([[-150, 0], [-150, 17], [-146, 19], [-136, 19], [-135.4, 18.4], [-133.8, 18.4], [-133.2, 19], [-120, 19], [-114, 16], [-96, 16], [-92, 17.2], [100, 17.2], [104, 18.4], [134, 18.4], [136, 20], [150, 20], [150.6, 20.5], [153, 20.5], [153.6, 20], [176, 20], [177, 18.8], [177, 0]], { seg: 44 })));
  k.add("lensBlack", at(tubeX(18.9, 17.8, 136, 177.2, { seg: 32 })));
  // резиновый наглазник: складки у основания, раструб
  const cup = [[-151, 16], [-151, 19.6], [-156, 20.4], [-158, 19.8], [-161, 20.6], [-163, 20], [-166, 20.8], [-170, 21], [-190, 22.6], [-204, 24], [-209, 24.6], [-212, 24], [-212, 22]];
  k.add("rubber", at(latheX(cup.map(([x, r]) => [x, r]).reverse(), { seg: 40 })));
  k.add("lensBlack", at(tubeX(22.1, 16.2, -212.2, -150, { seg: 32 })));
  // корпус механизмов вокруг трубки
  k.add("steel", extrudeX(shape(rrect(Z, Y + 1, 36, 40, 9)), -34, 24, { bevel: 1.8 }));
  k.add("steel", extrudeX(shape(rrect(Z, Y + 1, 37.2, 41.2, 9.5)), -35, -32, { bevel: 0.6 }));
  // маховичок углов прицеливания: шкала 0–10, рифлёный верхний обод, стопорный винт
  const ey = Y + 21;
  k.add("steel", T(latheX([[0, 0], [0, 16], [2, 16], [2, 15.2], [11, 15.2], [11, 16.2], [15, 16.2], [15.6, 15.4], [15.6, 6], [16.8, 5.4], [16.8, 0]], { seg: 48 }), { r: [0, 0, 90], p: [-5, ey, Z] }));
  k.add("steel", T(flutesX(15.9, 11.4, 15, 44, 1.2, 0.8), { r: [0, 0, 90], p: [-5, ey, Z] }));
  k.add("paintWhite", T(hashMarks(15.22, 3.8, 11, { arc: 300, a0: 30, major: 1, len: 2 }), { r: [0, 0, 90], p: [-5, ey, Z] }));
  k.add("paintWhite", T(hashMarks(15.22, 7.6, 22, { arc: 315, a0: 30, major: 1000, len: 0.8 }), { r: [0, 0, 90], p: [-5, ey, Z] }));
  k.add("steel", T(screwHead(4.5, 1.6), { r: [-90, 0, 0] }), { p: [-5, ey + 16.6, Z] });
  // маховичок боковых поправок — слева
  const wz = Z - 18;
  k.add("steel", T(latheX([[0, 0], [0, 13.6], [1.6, 13.6], [1.6, 13], [9, 13], [9, 13.8], [12, 13.8], [12.6, 13], [12.6, 5], [13.6, 4.4], [13.6, 0]], { seg: 44 }), { r: [0, 90, 0], p: [-5, Y + 1, wz] }));
  k.add("steel", T(flutesX(13.5, 9.3, 12.1, 40, 1.1, 0.7), { r: [0, 90, 0], p: [-5, Y + 1, wz] }));
  k.add("paintWhite", T(hashMarks(13.02, 3.4, 21, { arc: 300, a0: 30, major: 5, len: 1.5 }), { r: [0, 90, 0], p: [-5, Y + 1, wz] }));
  // осветитель сетки: батарейный отсек вдоль трубы сверху-слева, рифлёная крышка, тумблер
  const by = Y + 14, bz = Z - 13;
  k.add("steel", T(cylX(6.2, 22, 50, { c: 0.8, seg: 24 }), { p: [0, by, bz] }));
  k.add("steel", T(ctx.C.knob(7, 7, 18), { p: [50, by, bz] }));
  k.add("steel", extrudeX(shape(rrect(bz + 5, by - 4, 8, 8, 2)), 22, 44, { bevel: 0.8 }));
  k.add("steel", T(cylY(2.6, 0, 3, { seg: 14 }), { p: [34, by + 5.6, bz] }));
  k.add("steelWorn", T(cylY(0.9, 2, 8, { seg: 8 }), { r: [0, 0, -20], p: [34, by + 6.4, bz] }));
  // упор-«бровь» объектива (отражатель бликов снизу) и винты корпуса
  for (const [x, y] of [[-28, Y + 16], [18, Y + 16], [-28, Y - 14], [18, Y - 14]]) k.add("steel", T(screwHead(1.8, 0.8), { r: [0, 180, 0] }), { p: [x, y, Z + 18] });
  const root = node("pso1", [k.build()]);
  const oc = lens(ctx, at(ctx.C.lensDisc(15, -148)), "glassBlue");
  const ob = lens(ctx, at(ctx.C.lensDisc(17.4, 134)), "glassAmber");
  root.add(oc, ob);
  return { root, sight: { y: Y, z: Z, x0: -150, x1: 177, r: 15, mag: 4, reticle: "pso1", eyeRelief: 68, lens: oc } };
}
// ЭКП-1С-03 «Кобра»: корпус-короб с наклонным стеклом в защитной рамке, переключатель сеток
// и яркости справа, батарейный отсек сзади, кронштейн с рычагом.
function kobra(ctx) {
  const k = ctx.kit();
  dovetailClamp(k, -50, 40, { screws: [-38, 26] });
  dovetailLever(k, -40, -8);
  const Y = 54, Z = 19;
  k.add("alu", extrudeX(shape([[-12, 4, 2], [4, 4, 2], [Z + 16, 26, 3], [Z + 16, 34, 3], [-12, 18, 2]]), -48, 38, { bevel: 1.4 }));
  // корпус-короб
  k.add("alu", extrudeX(shape([[Z - 18, 28, 3], [Z + 18, 28, 3], [Z + 18, 38, 3], [Z - 18, 38, 3]]), -50, 40, { bevel: 1.4 }));
  k.add("alu", extrudeX(shape([[Z - 14, 37, 2], [Z + 14, 37, 2], [Z + 12, 41, 2], [Z - 12, 41, 2]]), -38, 26, { bevel: 1 }));
  const frame = shape([[Z - 19, 36, 2], [Z + 19, 36, 2], [Z + 19, Y + 20, 6], [Z - 19, Y + 20, 6]], [rrect(Z, Y + 1, 30, 30, 4)]);
  k.add("alu", T(extrudeX(frame, -6, 6, { bevel: 1.2 }), { p: [28, 0, 0] }));
  k.add("alu", T(extrudeX(frame, -3, 3, { bevel: 0.8 }), { p: [-40, 0, 0] }));
  k.add("alu", extrudeX(shape([[Z - 19, Y + 16, 3], [Z + 19, Y + 16, 3], [Z + 19, Y + 21, 4], [Z - 19, Y + 21, 4]]), -42, 34, { bevel: 1 }));
  for (const s of [-1, 1]) k.add("alu", extrudeZ([[-40, 36], [-34, 36], [22, Y + 16], [22, Y + 18], [-40, Y + 18]], 2.4, { bevel: 0.6, z: Z + s * 17.8 }));
  // переключатель: 4 сетки × яркость, риски на торце
  k.add("alu", T(cylZ(7, Z + 17, Z + 19.4, { seg: 24 }), { p: [-18, 33, 0] }));
  dialZ(k, "alu", 10, 8, [-18, 33, Z + 18], 1, 8);
  k.add("paintWhite", T(box(1, 0.8, 3.2), { p: [-18, 43.8, Z + 18.6] }));
  // батарейный отсек сзади
  k.add("alu", T(cylX(7.5, -50, -38, { c: 1, seg: 24 }), { p: [0, 33, Z] }));
  k.add("alu", T(ctx.C.knob(8.2, 5, 22), { r: [0, 180, 0], p: [-50, 33, Z] }));
  for (const [x, z] of [[-32, Z - 14], [-32, Z + 14], [18, Z - 14], [18, Z + 14]]) k.add("steel", capScrew(1.5, 0.6), { p: [x, 41, z] });
  const root = node("kobra", [k.build()]);
  const win = lens(ctx, T(extrudeX(rrect(Z, Y + 1, 30, 30, 4), -0.6, 0.6, { bevel: 0.2 }), { p: [28, 0, 0] }), "glassAmber");
  root.add(win);
  return { root, sight: { y: Y + 1, z: Z, x0: -42, x1: 28, r: 14, mag: 1, reticle: "kobra", lens: win } };
}
// ПОСП 4–12×42: переменная кратность, штатный кронштейн на «ласточкин хвост» с кольцами.
function posp(ctx) {
  const k = ctx.kit();
  dovetailClamp(k, -70, 50, { screws: [-58, 38] });
  dovetailLever(k, -52, -18);
  const Y = 62, Z = 13;
  const at = (g, t = {}) => T(g, { ...t, p: [t.p?.[0] || 0, Y + (t.p?.[1] || 0), Z + (t.p?.[2] || 0)] });
  k.add("steel", extrudeX(shape([[-12, 6, 2], [4, 6, 2], [Z + 6, Y - 24, 4], [Z - 8, Y - 16, 4], [-12, 18, 2]]), -66, 46, { bevel: 1.5 }));
  for (const x of [-48, 26]) {
    k.add("steel", T(tubeX(19.5, 15.1, x - 9, x + 9, { seg: 44, c: 1 }), { p: [0, Y, Z] }));
    for (const s of [-1, 1]) k.add("steel", T(box(16, 4.4, 6, { bevel: 1 }), { p: [x, Y, Z + s * 19.6] }));
    for (const s of [-1, 1]) k.add("lensBlack", T(box(17, 0.4, 7.2, { bevel: 0.1 }), { p: [x, Y, Z + s * 19.3] }));
    for (const s of [-1, 1]) for (const d of [-4, 4]) k.add("steel", capScrew(1.8, 1), { p: [x + d, Y + 2.2, Z + s * 19.6] });
  }
  scopeBody(ctx, k, at, { tube: 15, obj: 21, turret: 13, x0: -186, x1: 116, saddle: -8, mat: "steel" });
  const root = node("posp", [k.build()]);
  const oc = lens(ctx, at(ctx.C.lensDisc(18.5, -184)), "glassBlue");
  const ob = lens(ctx, at(ctx.C.lensDisc(21, 114)), "glassAmber");
  root.add(oc, ob);
  return { root, sight: { y: Y, z: Z, x0: -186, x1: 116, r: 15, mag: 4, zoom: [4, 12], reticle: "pso1", eyeRelief: 80, lens: oc } };
}
var DOVETAIL = [
  { id: "side_mount", cat: "sidemount", name: "Кронштейн «ласточкин хвост» — Пикатинни", desc: "Боковое крепление с планкой над крышкой", only: ["svd", "ak74", "akm"], mountTypes: ["dovetail"], stats: { weight: 190 }, build: sideMount },
  { id: "pso1", cat: "optic", name: "ПСО-1 4×24", desc: "Снайперский прицел с дальномерной шкалой и подсветкой", only: ["svd", "ak74", "akm"], mountTypes: ["dovetail"], foot: [-60, 40], body: [-212, 177], needs: (cfg) => !cfg.sidemount, stats: { weight: 580, ergo: -8, adsTime: 45 }, build: pso1 },
  { id: "posp", cat: "optic", name: "ПОСП 4–12×42 В", desc: "Переменная кратность, сетка типа ПСО, колесо — кратность", only: ["svd", "ak74", "akm"], mountTypes: ["dovetail"], foot: [-70, 50], body: [-186, 116], needs: (cfg) => !cfg.sidemount, stats: { weight: 760, ergo: -10, adsTime: 55 }, build: posp },
  { id: "kobra", cat: "optic", name: "ЭКП-1С-03 «Кобра»", desc: "Коллиматор, четыре сетки, крепление на боковую планку", only: ["svd", "ak74", "akm"], mountTypes: ["dovetail"], foot: [-50, 40], body: [-50, 40], needs: (cfg) => !cfg.sidemount, stats: { weight: 380, ergo: -3, adsTime: 15 }, build: kobra }
];

// src/engine/lib/muzzle.js
// Глушитель SureFire SOCOM-RC2: хвостовик с храповым стопорным кольцом (QD), корпус с
// валиками сварных швов у торцевых крышек, лыски под ключ, передняя крышка с отверстием и
// каналами сброса газа.
function socom(ctx, o) {
  const k = ctx.kit();
  const R4 = 19.05, L = o.len;
  k.add("steel", latheX([[0, 0], [0, 10.4], [1, 11], [14, 11], [15, 10], [15, 0]], { seg: 28 }));
  k.add("cast", latheX([[10, 0], [10, 14.6], [12, 16.4], [30, 16.4], [31, 18.2], [36, R4 - 0.2], [L - 6, R4], [L - 3, R4 - 1.2], [L, R4 - 3], [L, 5.4], [L - 2, 4.6], [L - 2, 0]], { seg: 48, crease: 30 }));
  k.add("cast", flutesX(16.2, 12, 30, 30, 1.8, 1));
  k.add("steel", ringGrooves(17.2, 31, 36, 3, 0.4, { seg: 40 }));
  // храповик стопорного кольца и защёлка
  for (let i = 0; i < 12; i++) k.add("steel", T(T(box(3, 1.6, 2.2, { bevel: 0.3 }), { p: [33.5, 18.4, 0] }), { r: [i * 30, 0, 0] }));
  k.add("steel", T(box(10, 2.4, 5, { bevel: 0.8 }), { p: [26, 17.2, 0] }));
  // сварные швы у крышек
  for (const x of [38, L - 8]) k.add("cast", latheX([[x - 1.2, 0], [x - 1.2, R4], [x - 0.6, R4 + 0.45], [x + 0.6, R4 + 0.45], [x + 1.2, R4], [x + 1.2, 0]], { seg: 48 }));
  k.add("cast", flutesX(R4 - 0.3, L - 22, L - 11, 12, 3.2, 0.7));
  // передняя крышка: каналы сброса вокруг отверстия
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    k.add("lensBlack", cylX(1.1, L - 0.4, L + 0.05, { seg: 8 }), { p: [0, Math.cos(a) * 10.5, Math.sin(a) * 10.5] });
  }
  k.add("lensBlack", cylX(5.2, L - 2.2, L + 0.05, { seg: 20 }));
  return { root: k.build("socom"), muzzle: { x: L, kind: "supp", flash: 0.04 } };
}
// «Птичья клетка» A2: пять продольных прорезей сверху и по бокам, низ закрыт — не пылит лёжа.
function a2(ctx) {
  const k = ctx.kit();
  k.add("steel", latheX([[0, 0], [0, 10.5], [1, 11], [9, 11], [9.5, 10.6], [14, 10.6], [14, 0]], { seg: 32 }));
  const slots = [-72, -36, 0, 36, 72], hw = 6;
  const sec = [];
  for (let i = 0; i < slots.length - 1; i++) sec.push([slots[i] + hw, slots[i + 1] - hw]);
  sec.push([slots[slots.length - 1] + hw, 360 + slots[0] - hw]);
  k.add("steel", sectorRing(6.2, 10.6, 13.8, 40.2, sec, { bevel: 0.25 }));
  k.add("steel", latheX([[40, 0], [40, 10.6], [43, 10.6], [44, 9.8], [44, 5.6], [40, 5.6]], { seg: 32 }));
  k.add("lensBlack", tubeX(6.3, 5.6, 13, 41, { seg: 24 }));
  k.add("steel", flutesX(10.6, 2, 8, 2, 5, 0.6, { a0: 90 }));
  return { root: k.build("a2"), muzzle: { x: 44, kind: "fh", flash: 0.4 } };
}
// SureFire WarComp: три зубца (открытые прорези), компенсаторные окна сверху, лыски, резьба под QD.
function warcomp(ctx, R4) {
  const k = ctx.kit();
  k.add("steel", latheX([[0, 0], [0, R4 - 0.5], [1, R4], [26, R4], [27, R4 - 1.5], [30, R4 - 1.5], [30, R4 * 0.5], [0, R4 * 0.5]], { seg: 32 }));
  k.add("steel", ringGrooves(R4 - 1.4, 26.6, 30, 4, 0.3, { seg: 32 }));
  const sec = [];
  for (let i = 0; i < 3; i++) sec.push([i * 120 + 14, i * 120 + 106]);
  k.add("steel", sectorRing(R4 * 0.55, R4 - 0.6, 30, 57, sec, { bevel: 0.3 }));
  for (let i = 0; i < 3; i++) k.add("steel", T(T(box(4, 2.4, (R4 - 0.6) * 1.2, { bevel: 0.6 }), { p: [57.6, R4 - 2.4, 0] }), { r: [i * 120 + 60, 0, 0] }));
  for (const a of [-40, 0, 40]) k.add("lensBlack", T(box(3.2, 3, 6, { bevel: 0.6 }), { p: [18, R4 - 1.2, 0], r: [a, 0, 0] }));
  k.add("lensBlack", tubeX(R4 * 0.56, R4 * 0.5, 29, 57, { seg: 24 }));
  k.add("steel", flutesX(R4, 2, 10, 2, 6, 0.5, { a0: 90 }));
  return { root: k.build("warcomp"), muzzle: { x: 59, kind: "fh", flash: 0.3 } };
}
function linear(ctx, r) {
  const k = ctx.kit();
  const R4 = 14.3, L = 62;
  k.add("steel", latheX([[0, 0], [0, r + 1.5], [1, r + 3], [14, r + 3], [15, R4 - 0.6], [16, R4], [L - 1.5, R4], [L, R4 - 1.4], [L, 10.2], [L - 3, 9.6], [L - 3, 0]], { seg: 40 }));
  k.add("steel", flutesX(r + 3, 3, 12, 2, 8, 0.8, { a0: 90 }));
  k.add("steel", ringGrooves(R4, 18, 24, 2, 0.4, { seg: 40 }));
  // внутренний ствол-дефлектор виден в торце
  k.add("steel", tubeX(r + 1.6, r + 0.4, L - 14, L - 1.5, { seg: 24 }));
  k.add("lensBlack", tubeX(9.7, r + 1.7, L - 3.2, L + 0.05, { seg: 28 }));
  return { root: k.build("linear"), muzzle: { x: L, kind: "linear", flash: 0.15 } };
}
// Дульный тормоз Precision Armament: три пары боковых окон с перегородками, верхние порты.
function brake(ctx, R4) {
  const k = ctx.kit();
  k.add("steel", latheX([[0, 0], [0, R4 - 0.4], [0.8, R4], [12, R4], [12, 4.5], [0, 4.5]], { seg: 32 }));
  k.add("steel", latheX([[52, 0], [52, R4], [56, R4], [57, R4 - 1], [57, 4.5], [52, 4.5]], { seg: 32 }));
  // верх и низ корпуса — секторы, окна по бокам открыты
  k.add("steel", sectorRing(R4 - 2.4, R4, 11.8, 52.2, [[-50, 50], [130, 230]], { bevel: 0.3 }));
  for (let i = 0; i < 3; i++) k.add("steel", latheX([[22 + i * 12, 0], [22 + i * 12, R4 - 0.2], [24.6 + i * 12, R4 - 0.2], [24.6 + i * 12, 0]].map(([x, rr], j) => [x, j === 0 || j === 3 ? 4.6 : rr]).concat([[22 + i * 12, 4.6]]), { seg: 32 }));
  k.add("lensBlack", tubeX(4.7, 4.2, 11, 53, { seg: 16 }));
  for (let i = 0; i < 3; i++) k.add("lensBlack", T(cylY(1.6, 0, 3, { seg: 10 }), { p: [17 + i * 12, R4 - 2.4, 0] }));
  k.add("steel", flutesX(R4, 2, 10, 2, 6, 0.5, { a0: 90 }));
  return { root: k.build("brake"), muzzle: { x: 57, kind: "brake", flash: 0.7 } };
}
function rotexV(ctx) {
  const k = ctx.kit();
  const R4 = 20, L = 158;
  k.add("steel", latheX([[0, 0], [0, 10.4], [1, 11], [16, 11], [17, 10], [17, 0]], { seg: 28 }));
  k.add("steelPark", latheX([[8, 0], [8, 15.2], [10, 17], [34, 17], [35, 18.6], [38, R4 - 0.3], [L - 10, R4], [L - 5, R4 - 1], [L - 1.5, R4 - 3.6], [L, R4 - 5], [L, 5.2], [L - 3, 4.6], [L - 3, 0]], { seg: 52, crease: 30 }));
  k.add("steelPark", flutesX(17.3, 12, 32, 36, 1.6, 0.9));
  k.add("steel", ringGrooves(R4, 42, 46, 2, 0.35, { seg: 48 }));
  k.add("steel", ringGrooves(R4, L - 18, L - 14, 2, 0.35, { seg: 48 }));
  k.add("steel", T(box(10, 3, 6, { bevel: 0.8 }), { p: [22, -17.8, 0] }));
  k.add("lensBlack", cylX(5, L - 3.2, L + 0.05, { seg: 20 }));
  return { root: k.build("rotex"), muzzle: { x: L, kind: "supp", flash: 0.03 } };
}
function nt4(ctx) {
  const k = ctx.kit();
  const R4 = 19.05, L = 168;
  k.add("steel", latheX([[0, 0], [0, 10.4], [1, 11], [14, 11], [15, 10], [15, 0]], { seg: 28 }));
  k.add("cast", latheX([[6, 0], [6, 14.5], [8, 16.5], [30, 16.5], [34, R4 - 0.4], [L - 14, R4], [L - 6, R4 - 2], [L - 2, R4 - 5.5], [L, R4 - 8], [L, 4.8], [L - 2, 4.4], [L - 2, 0]], { seg: 52, crease: 30 }));
  k.add("cast", flutesX(16.7, 10, 28, 24, 2, 1.1));
  k.add("steel", T(extrudeZ([[0, -3, 1], [26, -2.4, 1.5], [28, 0, 1], [26, 2.4, 1.5], [0, 3, 1]], 2.6, { bevel: 0.6 }), { p: [8, 0, 17.6] }));
  k.add("steel", T(cylZ(3, 15.5, 19.4, { seg: 14 }), { p: [10, 0, 0] }));
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    k.add("lensBlack", T(cylX(1.3, L - 4, L + 0.05, { seg: 10 }), { p: [0, Math.cos(a) * 8, Math.sin(a) * 8] }));
  }
  k.add("lensBlack", cylX(4.6, L - 2.2, L + 0.05, { seg: 20 }));
  return { root: k.build("nt4"), muzzle: { x: L, kind: "supp", flash: 0.03 } };
}
var MUZZLES = [
  { id: "sf_socom556", cat: "muzzle", name: "SureFire SOCOM556-RC2", desc: "Глушитель 5,56, быстросъёмный", fit: { thread: ["1/2x28"] }, stats: { weight: 620, length: 168, loud: -28, flash: -70, "recoilV%": -10, ergo: -8, adsTime: 25, velocity: 6 }, build: (c) => socom(c, { len: 168 }) },
  { id: "bt_rotex_hk", cat: "muzzle", only: ["m416"], name: "B&T Rotex-V (HK416)", desc: "Штатный глушитель к HK416: ставится на пламегаситель HK, стопорное кольцо", fit: { thread: ["1/2x28"] }, stats: { weight: 560, length: 158, loud: -29, flash: -72, "recoilV%": -11, ergo: -7, adsTime: 22, velocity: 5 }, build: rotexV },
  { id: "kac_nt4", cat: "muzzle", only: ["m416"], name: "Knight's Armament NT4 QDSS", desc: "Глушитель M27 IAR (USMC, база HK416): быстросъёмный, рычаг-защёлка", fit: { thread: ["1/2x28"] }, stats: { weight: 640, length: 168, loud: -30, flash: -75, "recoilV%": -12, ergo: -8, adsTime: 25, velocity: 6 }, build: nt4 },
  { id: "sf_socom762", cat: "muzzle", name: "SureFire SOCOM762-RC2", desc: "Глушитель 7,62, быстросъёмный", fit: { thread: ["5/8x24"] }, stats: { weight: 720, length: 188, loud: -27, flash: -70, "recoilV%": -12, ergo: -10, adsTime: 30, velocity: 6 }, build: (c) => socom(c, { len: 188 }) },
  { id: "a2_fh", cat: "muzzle", name: "Пламегаситель A2", desc: "Классическая «птичья клетка»", fit: { thread: ["1/2x28"] }, stats: { weight: 50, length: 34, flash: -35, "recoilV%": -3 }, build: a2 },
  { id: "warcomp556", cat: "muzzle", name: "SureFire WarComp 5,56", desc: "Пламегаситель-компенсатор", fit: { thread: ["1/2x28"] }, stats: { weight: 90, length: 49, flash: -45, "recoilV%": -8, "recoilH%": -6, loud: 1 }, build: (c) => warcomp(c, 11) },
  { id: "warcomp762", cat: "muzzle", name: "SureFire WarComp 7,62", desc: "Пламегаситель-компенсатор", fit: { thread: ["5/8x24"] }, stats: { weight: 110, length: 49, flash: -45, "recoilV%": -8, "recoilH%": -6, loud: 1 }, build: (c) => warcomp(c, 12) },
  { id: "pa_brake556", cat: "muzzle", name: "Precision Armament M4-72", desc: "Дульный тормоз: меньше отдача, громче", fit: { thread: ["1/2x28"] }, stats: { weight: 85, length: 47, flash: 25, "recoilV%": -22, "recoilH%": -18, loud: 5 }, build: (c) => brake(c, 11.2) },
  { id: "pa_brake762", cat: "muzzle", name: "Precision Armament M11", desc: "Дульный тормоз 7,62", fit: { thread: ["5/8x24"] }, stats: { weight: 120, length: 47, flash: 25, "recoilV%": -24, "recoilH%": -18, loud: 5 }, build: (c) => brake(c, 12.5) },
  { id: "linear556", cat: "muzzle", name: "Линейный компенсатор KAK", desc: "Уводит газы вперёд: тише для стрелка, чуть больше отдача", fit: { thread: ["1/2x28"] }, stats: { weight: 115, length: 62, flash: -30, loud: -3, "recoilV%": 3 }, build: (c) => linear(c, 6.4) },
  { id: "linear762", cat: "muzzle", name: "Линейный компенсатор KAK 7,62", desc: "Уводит газы вперёд: тише для стрелка, чуть больше отдача", fit: { thread: ["5/8x24"] }, stats: { weight: 130, length: 62, flash: -30, loud: -3, "recoilV%": 3 }, build: (c) => linear(c, 7.9) },
  { id: "linear_ak", cat: "muzzle", name: "Линейный компенсатор (АК)", desc: "Уводит газы вперёд: тише для стрелка, чуть больше отдача", fit: { thread: ["m14x1L", "m24x1.5"] }, stats: { weight: 125, length: 62, flash: -30, loud: -3, "recoilV%": 3 }, build: (c) => linear(c, 8.5) }
];

// src/engine/lib/muzzle2.js
var DEG = Math.PI / 180;
function flatsX(r, cut, x0, x1, o = {}) {
  const lim = r - cut, pts = [];
  for (let i = 0; i < 40; i++) {
    const a = i / 40 * Math.PI * 2;
    pts.push([Math.max(-lim, Math.min(lim, Math.cos(a) * r)), Math.sin(a) * r]);
  }
  const clean = pts.filter((p, i) => {
    const q = pts[(i + 1) % pts.length];
    return Math.abs(p[0] - q[0]) > 1e-3 || Math.abs(p[1] - q[1]) > 1e-3;
  });
  return extrudeX(clean, x0, x1, { bevel: o.bevel ?? 0.6 });
}
function hexX(af, x0, x1, o = {}) {
  const R4 = af / 2 / Math.cos(30 * DEG), pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (30 + i * 60) * DEG;
    pts.push([Math.cos(a) * R4, Math.sin(a) * R4, o.rc ?? 2]);
  }
  return extrudeX(pts, x0, x1, { bevel: o.bevel ?? 1, crease: 25 });
}
function slotOn(x0, x1, w, r, a, o = {}) {
  const g = extrudeY(slot(x0, x1, 0, w), r - (o.depth ?? 0.8), r + (o.lift ?? 0.12), { bevel: 0.2 });
  if (o.tilt) {
    T(g, { p: [-(x0 + x1) / 2, -r, 0] });
    T(g, { r: [0, 0, o.tilt] });
    T(g, { p: [(x0 + x1) / 2, r, 0] });
  }
  return T(g, { r: [a, 0, 0] });
}
function spiralBody(R4, x0, x1, o = {}) {
  const n = o.n ?? 8, depth = o.depth ?? 1.5, twist = (o.twist ?? 120) * DEG, width = o.width ?? 0.45;
  const m = n * 12, rings = [], steps = Math.max(12, Math.round((x1 - x0) / (o.dx ?? 3)));
  const fade = o.fade ?? 10;
  for (let s = 0; s <= steps; s++) {
    const x = x0 + s / steps * (x1 - x0);
    const ramp = Math.min(1, (x - x0) / fade, (x1 - x) / fade);
    const ph = twist * (x - x0) / (x1 - x0);
    const pts = [];
    for (let i = 0; i < m; i++) {
      const t0 = i / m * Math.PI * 2, t = t0 + ph;
      const c = Math.cos(n * t0);
      const g = c > 1 - width * 2 ? Math.min(1, (c - (1 - width * 2)) / (width * 0.9)) : 0;
      const r = R4 - depth * g * Math.max(0, ramp);
      pts.push([Math.cos(t) * r, Math.sin(t) * r]);
    }
    rings.push({ x, pts });
  }
  return loftX(rings, { caps: false, crease: 50, flip: true });
}
function faceHoles(k, x, rr, n, r, o = {}) {
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + (o.a0 ?? 0) * DEG;
    k.add("lensBlack", T(cylX(r, x - (o.depth ?? 1.6), x + 0.05, { seg: 10, c: 0.1 }), { p: [0, Math.cos(a) * rr, Math.sin(a) * rr] }));
  }
}
function flow556k(ctx) {
  const k = ctx.kit(), M = "cast#3b3d40";
  const R4 = 19.8, L = 169;
  k.add("steel", latheX([[0, 0], [0, 7.4], [2, 7.4], [2, 0]], { seg: 20 }));
  k.add(M, hexX(25.4, 0, 12, { rc: 1.2, bevel: 0.8 }));
  k.add(M, latheX([
    [11, 0],
    [11, 14.2],
    [13, 15.6],
    [19, R4 - 1.2],
    [22, R4],
    [L - 12, R4],
    [L - 8, R4 - 1.2],
    [L - 4, R4 - 3.4],
    [L, R4 - 4.4],
    [L, R4 - 6],
    [L - 1.4, R4 - 7],
    [L - 1.4, 8.2],
    [L, 7.2],
    [L, 4.3],
    [L - 3, 3.8],
    [L - 3, 0]
  ], { seg: 56, crease: 30 }));
  k.add(M, ringGrooves(R4 + 0.05, 24, 34, 5, 0.45, { seg: 56 }));
  for (let row = 0; row < 6; row++) {
    const x = 44 + row * 18;
    for (let i = 0; i < 12; i++) k.add("lensBlack", slotOn(x - 7, x + 7, 3.4, R4, i * 30 + row % 2 * 15));
  }
  for (let row = 0; row <= 6; row++) k.add(M, tubeX(R4 + 0.35, R4 - 0.5, 34.4 + row * 18, 36.2 + row * 18, { seg: 56, c: 0.3 }));
  for (let i = 0; i < 16; i++) k.add("lensBlack", T(box(1.6, 3.6, 2.4, { bevel: 0.5 }), { p: [L - 1.3, 10.6, 0], r: [i * 22.5, 0, 0] }));
  k.add("lensBlack", cylX(4.3, L - 2.9, L + 0.05, { seg: 20 }));
  return { root: k.build("flow556k"), muzzle: { x: L, kind: "supp", flash: 0.05, voice: { len: 169, loud: -24 } } };
}
function omega36m(ctx) {
  const k = ctx.kit(), M = "cast";
  const R4 = 21.85, L = 181;
  k.add("steel", latheX([[0, 0], [0, 10.6], [1, 11.2], [6, 11.2], [6, 0]], { seg: 28 }));
  k.add(M, latheX([
    [4, 0],
    [4, 15.4],
    [5.5, 17],
    [27, 17],
    [28, 18.4],
    [30, R4 - 0.8],
    [32, R4],
    [L - 26.5, R4],
    [L - 26, R4 - 0.7],
    [L - 25.5, R4],
    [L - 15, R4],
    [L - 3, R4 - 5.2],
    [L, R4 - 6.6],
    [L, R4 - 8.4],
    [L - 1, R4 - 9.4],
    [L - 1, 6.6],
    [L, 5.8],
    [L, 4.9],
    [L - 3, 4.4],
    [L - 3, 0]
  ], { seg: 60, crease: 30 }));
  k.add("steelPark", flutesX(17, 7, 26, 32, 1.7, 1));
  k.add("steelPark", ringGrooves(18.6, 27.6, 30, 1, 0.3, { seg: 48 }));
  k.add("steel", T(box(9, 2.6, 5, { bevel: 0.7 }), { p: [16, -18.6, 0] }));
  for (const x of [40, 43.5, L - 40]) k.add("cast#6b6e72", tubeX(R4 + 0.04, R4 - 0.3, x, x + 0.9, { seg: 60, c: 0.1 }));
  k.add("cast#5d6064", T(extrudeY(slot(58, 96, 0, 4.4), R4 - 0.6, R4 + 0.06, { bevel: 0.1 }), { r: [90, 0, 0] }));
  for (let i = 0; i < 4; i++) k.add("lensBlack", T(box(3, 3.2, 4, { bevel: 0.4 }), { p: [L - 0.9, R4 - 7.5, 0], r: [45 + i * 90, 0, 0] }));
  k.add("steelPark", tubeX(9.6, 7.4, L - 1.6, L - 0.6, { seg: 40, c: 0.2 }));
  k.add("lensBlack", cylX(4.9, L - 2.9, L + 0.05, { seg: 20 }));
  return { root: k.build("omega36m"), muzzle: { x: L, kind: "supp", flash: 0.03, voice: { len: 181, loud: -30 } } };
}
function spiral762(ctx) {
  const k = ctx.kit(), M = "cast#5a5040";
  const R4 = 22.25, L = 198, X0 = 42, X1 = L - 30;
  k.add("steel", latheX([[0, 0], [0, 11.8], [1, 12.4], [8, 12.4], [8, 0]], { seg: 28 }));
  k.add("steelPark", latheX([[5, 0], [5, 16.4], [6.5, 17.8], [30, 17.8], [31, 16.8], [31, 0]], { seg: 52 }));
  k.add("steelPark", flutesX(17.6, 9, 28, 36, 1.4, 0.8));
  k.add("steelPark", ringGrooves(18.3, 9, 28, 6, 0.5, { seg: 52 }));
  k.add(M, latheX([[30, 0], [30, 18.6], [32, 20], [37, R4 - 0.4], [39, R4], [X0 + 0.5, R4], [X0 + 0.5, 0]], { seg: 60, crease: 30 }));
  k.add(M, spiralBody(R4, X0, X1, { n: 10, depth: 1.7, twist: 150, width: 0.38 }));
  k.add(M, latheX([
    [X1 - 0.5, 0],
    [X1 - 0.5, R4],
    [L - 16, R4],
    [L - 15, R4 - 0.6],
    [L - 14, R4],
    [L - 5, R4 - 2.6],
    [L, R4 - 4.2],
    [L, R4 - 6.4],
    [L - 1.2, R4 - 7.2],
    [L - 1.2, 7.2],
    [L, 6.4],
    [L, 5.4],
    [L - 3, 4.9],
    [L - 3, 0]
  ], { seg: 60, crease: 30 }));
  k.add(M, flutesX(R4 - 0.3, L - 13, L - 6, 12, 2.6, 0.5));
  faceHoles(k, L - 1.2, 11.2, 8, 1.3, { a0: 22.5 });
  k.add("lensBlack", cylX(5.4, L - 2.9, L + 0.05, { seg: 20 }));
  return { root: k.build("spiral762"), muzzle: { x: L, kind: "supp", flash: 0.04, voice: { len: 198, loud: -29 } } };
}
function dtk4m(ctx) {
  const k = ctx.kit(), M = "steelPark";
  const R4 = 22, L = 192, XC = L - 38, RC = 14;
  k.add("steel", latheX([[0, 0], [0, 11.4], [1, 12.2], [10, 12.2], [10, 0]], { seg: 28 }));
  k.add(M, latheX([
    [6, 0],
    [6, 15.6],
    [7.5, 17.2],
    [34, 17.2],
    [36, 19],
    [38, R4 - 0.4],
    [40, R4],
    [XC, R4],
    [L - 6, RC],
    [L - 6, RC - 0.4],
    [L, RC],
    [L, 11],
    [L - 5.5, 8.4],
    [L - 5.5, 0]
  ], { seg: 60, crease: 25 }));
  k.add("steel", ringGrooves(17.5, 10, 24, 8, 0.45, { seg: 52 }));
  for (const a of [60, 180, 300]) k.add(M, T(box(8, 2.2, 3, { bevel: 0.6 }), { p: [30, 17.8, 0], r: [a, 0, 0] }));
  k.add("steel", T(extrudeZ([[0, -2.6, 1], [22, -2.2, 1.2], [25, 0, 1], [22, 2.8, 1.4], [0, 2.8, 1]], 2.4, { bevel: 0.5 }), { p: [12, 0, 18.4] }));
  k.add("steel", T(cylZ(2.8, 16.6, 19.8, { seg: 14 }), { p: [33, 0, 0] }));
  for (const x of [52, 96, 140]) k.add(M, tubeX(R4 + 0.6, R4 - 0.2, x, x + 3.2, { seg: 60, c: 0.6 }));
  k.add("steel", tubeX(R4 + 0.25, R4 - 0.2, 44, 45.6, { seg: 60, c: 0.4 }));
  const tilt = -Math.atan((R4 - RC) / (L - 6 - XC)) / DEG;
  for (let i = 0; i < 8; i++) k.add("lensBlack", slotOn(XC + 6, L - 12, 3.2, (R4 + RC) / 2 + 0.1, i * 45 + 22.5, { tilt }));
  for (let i = 0; i < 6; i++) k.add("lensBlack", T(box(3.6, 3.4, 2.6, { bevel: 0.4 }), { p: [L - 0.8, RC - 1.3, 0], r: [i * 60, 0, 0] }));
  k.add("lensBlack", cylX(8.4, L - 5.9, L - 5.3, { seg: 28 }));
  k.add("lensBlack", cylX(5, L - 6, L - 5.2, { seg: 20 }));
  return { root: k.build("dtk4m"), muzzle: { x: L, kind: "supp", flash: 0.04, voice: { len: 192, loud: -27 } } };
}
function wolverine(ctx) {
  const k = ctx.kit(), M = "cast#4a4c3c", POCKET = "cast#23241d";
  const AF = 42, L = 186, H0 = 24, H1 = L - 22;
  k.add("steel", latheX([[0, 0], [0, 11.4], [1, 12.2], [10, 12.2], [10, 0]], { seg: 28 }));
  k.add(M, latheX([[5, 0], [5, 16.6], [6.5, 18], [H0 + 1, 18], [H0 + 1, 0]], { seg: 52 }));
  k.add(M, ringGrooves(18.2, 7, 14, 4, 0.45, { seg: 52 }));
  k.add(M, flatsX(18.3, 1.6, 15, H0 - 1));
  k.add(M, hexX(AF, H0, H1, { rc: 3, bevel: 1.4 }));
  const ap = AF / 2;
  for (let i = 0; i < 6; i++) {
    const a = 90 - i * 60;
    k.add(POCKET, slotOn(H0 + 12, H0 + 62, 9, ap, a, { depth: 0.5, lift: 0.06 }));
    k.add(POCKET, slotOn(H0 + 70, H1 - 12, 9, ap, a, { depth: 0.5, lift: 0.06 }));
  }
  k.add(M, latheX([
    [H1 - 1, 0],
    [H1 - 1, 19.6],
    [H1 + 1, 20.4],
    [L - 8, 20.4],
    [L - 2, 17.6],
    [L, 16],
    [L, 13.6],
    [L - 1.2, 12.8],
    [L - 1.2, 6.8],
    [L, 6],
    [L, 5.2],
    [L - 3, 4.7],
    [L - 3, 0]
  ], { seg: 56, crease: 30 }));
  k.add(M, ringGrooves(20.4, H1 + 4, H1 + 12, 3, 0.4, { seg: 56 }));
  faceHoles(k, L - 1.2, 9.8, 6, 1.5, { a0: 30 });
  k.add("lensBlack", cylX(5.2, L - 2.9, L + 0.05, { seg: 20 }));
  return { root: k.build("wolverine"), muzzle: { x: L, kind: "supp", flash: 0.04, voice: { len: 186, loud: -26 } } };
}
function tripleTap(ctx) {
  const k = ctx.kit();
  const R4 = 11.1, L = 57;
  k.add("steel", flatsX(R4, 1.8, 0, 12.4, { bevel: 0.6 }));
  k.add("steel", latheX([[12, 0], [12, R4 - 0.5], [12.5, R4], [L - 1.6, R4], [L, R4 - 1.4], [L, 5.4], [L - 3, 4.8], [L - 3, 0]], { seg: 40, crease: 30 }));
  k.add("steel", ringGrooves(R4, 13.5, 17.5, 2, 0.35, { seg: 40 }));
  for (let i = 0; i < 3; i++) for (const a of [-90, 90]) k.add("lensBlack", slotOn(20 + i * 10.5, 28 + i * 11, 4.4 + i * 0.4, R4, a, { depth: 2.4, lift: 0.05 }));
  for (const x of [25, 33, 41]) k.add("lensBlack", T(cylY(1.7, R4 - 1.6, R4 + 0.2, { seg: 12 }), { p: [x, 0, 0] }));
  for (let i = 0; i < 3; i++) k.add("lensBlack", T(box(9, 3.4, 3.8, { bevel: 0.6 }), { p: [L - 3.6, R4 - 1.2, 0], r: [60 + i * 120, 0, 0] }));
  k.add("lensBlack", cylX(4.8, L - 2.9, L + 0.05, { seg: 18 }));
  return { root: k.build("tripletap"), muzzle: { x: L, kind: "fh", flash: 0.35 } };
}
function dtk3(ctx) {
  const k = ctx.kit(), M = "steelPark";
  const R4 = 15, L = 88, C0 = 38, C1 = L - 9;
  k.add(M, flatsX(R4, 2.2, 0, 14, { bevel: 0.8 }));
  k.add(M, latheX([[13.5, 0], [13.5, R4 - 0.6], [14.5, R4], [C0, R4], [C0, 0]], { seg: 44 }));
  k.add(M, flutesX(R4 - 0.2, 16, 24, 18, 1.6, 0.6));
  for (const x of [28, 33.5]) k.add("lensBlack", T(cylY(2.3, R4 - 2, R4 + 0.3, { seg: 14 }), { p: [x, 0, 0] }));
  k.add("lensBlack", T(box(6, 2, 4, { bevel: 0.4 }), { p: [6, -R4 + 0.7, 0] }));
  for (let i = 0; i < 4; i++) {
    const a = 45 + i * 90;
    k.add(M, T(extrudeZ([[C0 - 1, 0], [C1 + 1, 0], [C1 + 1, 4.2, 0.8], [C0 - 1, 4.2, 0.8]], 7, { bevel: 0.7 }), { p: [0, R4 - 4.2, 0], r: [a, 0, 0] }));
  }
  for (const x of [C0 + 9, C0 + 24]) k.add("steel", latheX([[x, 0], [x, 5], [x + 5, R4 - 4.4], [x + 7, R4 - 4.4], [x + 7, 5.4], [x + 5, 5], [x + 5, 0]], { seg: 32 }));
  k.add("lensBlack", tubeX(5, 4.2, C0, C1, { seg: 16, c: 0.1 }));
  k.add(M, latheX([[C1, 6.6], [C1, R4 - 0.8], [C1 + 0.8, R4], [L - 1.2, R4], [L, R4 - 1.2], [L, 7.6], [L - 3, 6], [C1, 6], [C1, 6.6]], { seg: 44, crease: 30 }));
  k.add("lensBlack", cylX(6.05, C1 - 0.2, L + 0.05, { seg: 20, c: 0.1 }));
  return { root: k.build("dtk3"), muzzle: { x: L, kind: "comp", flash: 0.45 } };
}
var MUZZLES2 = [
  { id: "hux_flow556k", cat: "muzzle", name: "HUXWRX FLOW 556k", desc: "Проточный глушитель из инконеля (3D-печать): меньше обратного газа, решётка окон, прямая резьба", fit: { thread: ["1/2x28"] }, stats: { weight: 414, length: 169, loud: -24, flash: -70, "recoilV%": -9, ergo: -7, adsTime: 22, velocity: 4 }, build: flow556k },
  { id: "omega36m", cat: "muzzle", name: "SilencerCo Omega 36M", desc: "Титановый мультикалиберный глушитель: крепление ASR, коническая дульная крышка", fit: { thread: ["1/2x28", "5/8x24"] }, stats: { weight: 400, length: 181, loud: -30, flash: -78, "recoilV%": -12, ergo: -8, adsTime: 25, velocity: 5 }, build: omega36m },
  { id: "spiral762", cat: "muzzle", name: "Спиральный глушитель 7,62", desc: "Корпус с винтовыми канавками (как у OSS): легче и лучше охлаждается, быстросъёмная муфта", fit: { thread: ["5/8x24"] }, stats: { weight: 590, length: 198, loud: -29, flash: -76, "recoilV%": -13, ergo: -10, adsTime: 30, velocity: 6 }, build: spiral762 },
  { id: "dtk4m", cat: "muzzle", name: "Зенитко ДТК-4М", desc: "Тактический глушитель к АК: стальной корпус, рычаг-фиксатор, пламегасящий конус", fit: { thread: ["m24x1.5", "m14x1L"] }, stats: { weight: 560, length: 192, loud: -27, flash: -85, "recoilV%": -14, ergo: -9, adsTime: 28, velocity: 3 }, build: dtk4m },
  { id: "hex_wolverine", cat: "muzzle", name: "Hexagon Wolverine", desc: "Глушитель к АК с шестигранным корпусом: не катится по столу, фрезерованные карманы", fit: { thread: ["m24x1.5", "m14x1L"] }, stats: { weight: 520, length: 186, loud: -26, flash: -80, "recoilV%": -12, ergo: -8, adsTime: 24, velocity: 3 }, build: wolverine },
  { id: "kac_tripletap", cat: "muzzle", name: "KAC Triple Tap", desc: "Пламегаситель-компенсатор: три окна сверху гасят подброс, трёхзубая корона", fit: { thread: ["1/2x28"] }, stats: { weight: 94, length: 57, flash: -40, "recoilV%": -7, "recoilH%": -5, loud: 1 }, build: tripleTap },
  { id: "dtk3", cat: "muzzle", name: "Зенитко ДТК-3", desc: "Компенсатор к АК с открытой передней клеткой: гасит подброс, громче штатного", fit: { thread: ["m24x1.5", "m14x1L"] }, stats: { weight: 170, length: 88, flash: -20, "recoilV%": -18, "recoilH%": -14, loud: 3 }, build: dtk3 }
];

// src/engine/lib/tactical.js
// Тактический фонарь SureFire Scout / Modlite / Streamlight: хвостовик с рифлёной крышкой и
// резиновой кнопкой (или вилкой выносной кнопки с кабелем и «таблеткой» на планке),
// корпус с насечкой-кольцами, голова со «скаллопами», стальной безель, отражатель + LED за стеклом.
function scout(ctx, o) {
  const k = ctx.kit();
  const r = o.r, L0 = o.tail, L1 = o.head, H = o.headR, cy = r + 4.5;
  const at = (g) => g.translate(0, cy, 0);
  k.add("alu", at(latheX([[L0 - 10, 0], [L0 - 10, r - 1.4], [L0 - 9, r + 0.3], [L0 - 1.2, r + 0.3], [L0 - 0.6, r - 0.4], [L0 + 0.4, r - 0.4], [L0 + 1, r], [L0 + 16, r], [L0 + 17, r - 0.8], [L0 + 18, r - 0.4], [L1, r - 0.4], [L1 + 5, H], [L1 + 28, H], [L1 + 30, H - 1.4], [L1 + 30, H - 3.2]], { seg: 40 })));
  k.add("alu", at(flutesX(r + 0.05, L0 - 8.2, L0 - 2, 24, 1, 0.6)));
  k.add("alu", at(ringGrooves(r + 0.2, L0 + 3, L0 + 15, 6, 0.5, { seg: 40 })));
  k.add("alu", at(flutesX(H - 1.6, L1 + 8, L1 + 25, 6, 5, 1.8)));
  k.add("steel", at(tubeX(H + 0.1, H - 3.4, L1 + 28, L1 + 31, { seg: 40 })));
  if (o.crenel) for (let i = 0; i < 6; i++) k.add("steel", at(T(box(2.4, 2, 5, { bevel: 0.5 }), { p: [L1 + 31.6, H - 1.6, 0], r: [i * 60 + 30, 0, 0] })));
  // крепление: зажим, седло под корпус, барашек справа
  k.add("alu", clampBody(-13, 13, 4.8, { w: 24 }));
  k.add("alu", extrudeX([[-7, 3], [7, 3], [7, cy - r + 3], [-7, cy - r + 3]], -12, 12, { bevel: 1 }));
  for (const s of [-1, 1]) k.add("steel", T(capScrew(1.6, 0.7), { r: [s * 90, 0, 0] }), { p: [6, 7.5, s * 7] });
  k.add("steel", T(thumbNut(6.2, 4.4, 8), { r: [0, -90, 0], p: [0, -2.5, 12.5] }));
  k.add("steel", cylZ(2.4, -14, 12.5, { seg: 12 }), { p: [0, -2.5, 0] });
  if (o.tail2) {
    // выносная кнопка: вилка в хвостовике, кабель петлёй, «таблетка» на планке за фонарём
    k.add("steel", at(latheX([[L0 - 17, 0], [L0 - 17, 3.6], [L0 - 16, 4.8], [L0 - 10.5, 4.8], [L0 - 10, 4], [L0 - 10, 0]], { seg: 20 })));
    k.add("rubber", at(latheX([[L0 - 22, 0], [L0 - 22, 2.2], [L0 - 17, 3.4], [L0 - 17, 0]], { seg: 16 })));
    const px0 = L0 - 44, px1 = L0 - 20;
    k.add("rubber", wire([[L0 - 22, cy, 0], [L0 - 25, cy - 1, 3], [L0 - 27, cy - 7, 8], [L0 - 23, 9, 9], [px1 + 3, 4.5, 4], [px1 - 1, 3.6, 0]], 1.3, { n: 60 }));
    k.add("poly", clampBody(px0 + 2, px1 - 2, 1.2, { w: 23, bevel: 0.5 }));
    k.add("rubber", extrudeX(rrect(0, 3.2, 17, 4.4, 2), px0, px1, { bevel: 1.4 }));
    for (let i = 0; i < 5; i++) k.add("rubber", T(box(1, 0.7, 13, { bevel: 0.3 }), { p: [px0 + 5 + i * 3.4, 5.5, 0] }));
  } else {
    k.add("rubber", at(latheX([[L0 - 12.6, 0], [L0 - 12.6, 3.8], [L0 - 12, 5.2], [L0 - 10.8, 5.8], [L0 - 9.6, 5.8], [L0 - 9.6, 0]], { seg: 24 })));
    k.add("steel", at(tubeX(7.2, 5.7, L0 - 11.4, L0 - 9.6, { seg: 24 })));
  }
  const root = node(o.name, [k.build()]);
  const head = lampHead(ctx, H - 3.3, L1 + 29, L1 + 12, cy, o);
  root.add(head.group);
  return { root, light: { p: [L1 + 30, cy, 0], lens: head.glow, lumens: o.lm, cd: o.cd, kelvin: o.kelvin, hot: o.hot, spill: o.spill, batt: o.batt, lensR: H - 3.3, beam: o.beam && { lensR: (H - 3.3) / 1e3, ...o.beam } } };
}
// Голова фонаря: полированный отражатель (виден через стекло), светодиод на медной подложке
// с жёлтым куполом люминофора, просветлённое стекло. glow — светящийся диск перед светодиодом:
// его яркость ведёт app (батарея).
function lampHead(ctx, r, xFront, xDeep, cy, o = {}) {
  const k = ctx.kit();
  const depth = xFront - xDeep, prof = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, x = xDeep + depth * t;
    prof.push([x, 2.2 + (r - 2.2) * Math.sqrt(t)]);
  }
  const refl = latheX([[xDeep - 0.2, 0], ...prof, [xFront, r], [xFront, r + 0.3], [xDeep - 0.6, 2.6], [xDeep - 0.6, 0]].reverse(), { seg: 40, crease: 70 });
  k.add(o.stipple ? "steelWorn" : "chrome", T(refl, { p: [0, cy, 0] }));
  k.add("copper", T(box(0.8, 6, 6, { bevel: 0.2 }), { p: [xDeep + 0.2, cy, 0] }));
  k.add("paintWhite", T(box(0.6, 3.2, 3.2, { bevel: 0.1 }), { p: [xDeep + 0.7, cy, 0] }));
  k.add("paintWhite#d9c25c", T(latheX([[0, 0], [0, 1.3], [0.5, 1.1], [0.8, 0.6], [0.9, 0]], { seg: 14 }), { p: [xDeep + 0.9, cy, 0] }));
  const group = node("lampHead", [k.build()]);
  const glass = lens(ctx, cylX(r + 0.2, xFront - 1.4, xFront - 0.6, { seg: 40 }).translate(0, cy, 0), "glass");
  const glow = new ctx.THREE.Mesh(cylX(r * 0.55, xDeep + 1, xDeep + 1.4, { seg: 24 }).translate(0, cy, 0), ctx.mats.get("lampLens").clone());
  glow.material.transparent = true;
  glow.material.opacity = 0.95;
  group.add(glass, glow);
  return { group, glow };
}
// ЛЦУ (PEQ-15 / Holosun LS): корпус с фасками, окна излучателей со стальными кольцами,
// ИК-осветитель с фокусирующим безелем, селектор режимов, барабаны выверки лазера сверху
// и слева, батарейный отсек с рифлёной крышкой сзади, кнопки активации.
function boxLaser(ctx, o) {
  const k = ctx.kit();
  const { L0, L1, H, W } = o;
  k.add("alu", clampBody(-18, 18, 5));
  for (const x of [-8, 8]) {
    k.add("steel", crossBolt(x, -2.5, 13, { nutR: 0 }));
    k.add("steel", T(thumbNut(4.6, 3.4, 6), { r: [0, -90, 0], p: [x, -2.5, 13] }));
  }
  k.add(o.mat, extrudeX([[-W / 2, 4, 2], [W / 2, 4, 2], [W / 2, H - 3, 5], [W / 2 - 3, H, 3], [-W / 2 + 3, H, 3], [-W / 2, H - 3, 5]], L0, L1, { bevel: 2.4 }));
  for (const s of [-1, 1]) k.add(o.mat, extrudeZ(rrect((L0 + L1) / 2 + 4, H * 0.45, (L1 - L0) * 0.55, H * 0.36, 3), 1, { bevel: 0.3, z: s * (W / 2 + 0.2) }));
  k.add("lensBlack", extrudeX(rrect(0, (H + 4) / 2, W - 6, H - 10, 3), L1 - 0.8, L1 + 0.6, { bevel: 0.3 }));
  const vis = [L1 + 0.6, H * 0.72, -W * 0.25];
  for (const z of [vis[2], W * 0.05]) {
    k.add("steel", T(tubeX(4.6, 3, L1 - 1, L1 + 2.4, { seg: 20 }), { p: [0, vis[1], z] }));
    k.add("lensBlack", T(cylX(3.1, L1 + 0.4, L1 + 1.2, { seg: 16 }), { p: [0, vis[1], z] }));
  }
  if (z0Illum(o)) {
    const iy = H * 0.42, iz = W * 0.18;
    k.add(o.mat, T(tubeX(o.illum + 2.4, o.illum, L1 - 3, L1 + 8, { seg: 32 }), { p: [0, iy, iz] }));
    k.add("rubber", T(flutesX(o.illum + 2.2, L1, L1 + 7, 20, 1.2, 0.8), { p: [0, iy, iz] }));
    k.add("irLens", T(cylX(o.illum - 0.2, L1 + 5, L1 + 6, { seg: 28 }), { p: [0, iy, iz] }));
    k.add("chrome", T(latheX([[L1 + 5.4, 0], [L1 + 5.4, 1.2], [L1 + 2, o.illum - 0.4], [L1 + 2, 0]], { seg: 24 }), { p: [0, iy, iz] }));
  }
  // кнопки активации сзади сверху
  for (const z of [-W * 0.22, W * 0.22]) k.add("rubber", T(latheX([[0, 0], [0, 4.6], [2.2, 4.2], [3.4, 2.8], [3.6, 0]], { seg: 18 }), { r: [0, 0, 90], p: [L0 + 16, H - 1, z] }));
  // селектор режимов с индексом и рисками
  k.add(o.mat, T(ctx.C.knob(8, 5, 18), { r: [0, 0, 90], p: [L0 + 36, H - 1, 0] }));
  k.add("paintWhite", T(box(3, 1, 1.2), { p: [L0 + 36, H + 4.3, 5] }));
  k.add("paintWhite", T(faceTicks(8.4, 10.4, 6, 0, { arc: 150, a0: -75 }), { r: [0, 0, 90], p: [L0 + 36, H - 0.4, 0] }));
  // барабаны выверки: сверху (высота) и слева (ветер), с прорезью и стрелкой
  for (const z of [-W / 4, W / 4]) {
    k.add("steel", T(cylY(3, H - 1, H + 1.2, { seg: 16 }), { p: [L1 - 16, 0, z] }));
    k.add("lensBlack", T(box(4, 0.5, 0.7, { bevel: 0.1 }), { p: [L1 - 16, H + 1.2, z] }));
    k.add("paintWhite", T(box(0.5, 0.3, 2.2), { p: [L1 - 21, H + 0.1, z] }));
  }
  for (const y of [H * 0.72, H * 0.45]) {
    k.add("steel", T(cylZ(3, -W / 2 - 1.2, -W / 2 + 1, { seg: 16 }), { p: [L1 - 16, y, 0] }));
    k.add("lensBlack", T(box(0.7, 4, 0.5, { bevel: 0.1 }), { p: [L1 - 16, y, -W / 2 - 1.2] }));
  }
  // батарейный отсек CR123 с крышкой на заднем торце
  const bz = -W * 0.22, by = H * 0.5;
  k.add(o.mat, T(cylX(7.6, L0 - 4, L0 + 2, { c: 0.8, seg: 28 }), { p: [0, by, bz] }));
  k.add(o.mat, T(ctx.C.knob(8.4, 4, 22), { r: [0, 180, 0], p: [L0 - 4, by, bz] }));
  k.add("steel", T(box(1.4, 6, 1.6, { bevel: 0.3 }), { p: [L0 - 8.6, by, bz] }));
  const root = node(o.name, [k.build()]);
  const ll = lens(ctx, cylX(2.9, vis[0] + 1.2, vis[0] + 1.8, { seg: 16 }).translate(0, vis[1], vis[2]), "laserLens");
  ll.renderOrder = 0;
  ll.material.transparent = false;
  root.add(ll);
  if (o.color) {
    ll.material = ll.material.clone();
    ll.material.emissive.setHex(o.color);
  }
  return { root, laser: { p: [vis[0] + 2, vis[1], vis[2]], lens: ll, color: o.color, batt: o.batt } };
}
function z0Illum(o) {
  return !!o.illum;
}
// Steiner DBAL-PL: корпус из полимера, голова фонаря с отражателем, окно лазера сверху,
// крышка батареи сзади, клавиша-селектор.
function dbal(ctx) {
  const k = ctx.kit();
  const L0 = -40, L1 = 36, W = 34, H = 34;
  k.add("alu", clampBody(-16, 16, 5));
  k.add("steel", crossBolt(0, -2.5, 13, { nutR: 0 }));
  k.add("steel", T(thumbNut(5, 3.6, 6), { r: [0, -90, 0], p: [0, -2.5, 13] }));
  k.add("polyTan", extrudeX([[-W / 2, 4, 2], [W / 2, 4, 2], [W / 2, H - 3, 6], [W / 2 - 4, H, 3], [-W / 2 + 4, H, 3], [-W / 2, H - 3, 6]], L0, L1 - 8, { bevel: 2.2 }));
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) k.add("polyTan", T(box(2, H * 0.45, 1, { bevel: 0.4 }), { p: [L0 + 10 + i * 5, H * 0.46, s * (W / 2 + 0.3)] }));
  const ly = 15, lr = 11.5;
  k.add("polyTan", T(latheX([[L1 - 12, 0], [L1 - 12, lr + 2], [L1 + 4, lr + 3.4], [L1 + 6, lr + 2.6], [L1 + 6, lr], [L1 - 5, lr], [L1 - 5, 0]], { seg: 40 }), { p: [0, ly, 0] }));
  k.add("steel", T(tubeX(lr + 2.7, lr, L1 + 5, L1 + 7, { seg: 40 }), { p: [0, ly, 0] }));
  const vy = H - 6;
  k.add("polyTan", extrudeX(rrect(0, vy, 18, 10, 3), L1 - 10, L1 + 2, { bevel: 1 }));
  k.add("lensBlack", extrudeX(rrect(0, vy, 14, 6.5, 2), L1 + 1.6, L1 + 2.4, { bevel: 0.2 }));
  k.add("steel", T(tubeX(3.4, 2.3, L1 + 1.8, L1 + 3, { seg: 16 }), { p: [0, vy, 3] }));
  k.add("rubber", T(latheX([[0, 0], [0, 4.8], [2.2, 4.4], [3.4, 3], [3.6, 0]], { seg: 18 }), { r: [0, 0, 90], p: [L0 + 14, H - 1, 0] }));
  k.add("polyTan", T(ctx.C.knob(7, 5, 16), { r: [0, 0, 90], p: [L0 + 30, H - 1, 0] }));
  k.add("paintWhite", T(box(2.6, 0.8, 1), { p: [L0 + 30, H + 4.3, 4] }));
  for (const z of [-7, 7]) {
    k.add("steel", T(cylY(2.4, H - 1, H + 0.8, { seg: 12 }), { p: [L1 - 18, 0, z] }));
    k.add("lensBlack", T(box(3.2, 0.5, 0.6, { bevel: 0.1 }), { p: [L1 - 18, H + 0.8, z] }));
  }
  k.add("polyTan", T(cylX(8, L0 - 3, L0 + 1, { c: 0.8, seg: 28 }), { p: [0, ly, 0] }));
  k.add("polyTan", T(ctx.C.knob(8.6, 4, 20), { r: [0, 180, 0], p: [L0 - 3, ly, 0] }));
  const root = node("dbal", [k.build()]);
  const head = lampHead(ctx, lr - 0.2, L1 + 5.8, L1 - 4, ly);
  const le = head.glow;
  const ll = lens(ctx, cylX(2.1, L1 + 2.3, L1 + 2.8, { seg: 16 }).translate(0, vy, 3), "laserLens");
  ll.renderOrder = 0;
  ll.material.transparent = false;
  root.add(head.group, ll);
  return { root, light: { p: [L1 + 7, ly, 0], lens: le, lumens: 300, lensR: lr, beam: { candela: 4e3, hot: 0.1, spill: 0.5, spillK: 0.06, ring: 0.03, tir: true, color: 16185087, lensR: lr / 1e3 } }, laser: { p: [L1 + 3, vy, 3], lens: ll, color: 16722458 } };
}
// Вертикальная рукоять: зажим с барашком, тело с рёбрами/кольцами хвата, торцевая крышка отсека.
function vgrip(ctx, o) {
  const k = ctx.kit();
  const L = o.len, d = o.d;
  k.add("poly", clampBody(-d / 2 - 2, d / 2 + 2, 5, { w: 26 }));
  const prof = [[0, 0], [0, d / 2 - 0.5]];
  const n = 16;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const r = d / 2 - t * 2 + (o.ribs && i % 2 ? 0.8 : 0) + (!o.ribs ? 0.6 * Math.sin(t * Math.PI * 3) * (t > 0.15 && t < 0.85 ? 1 : 0) : 0);
    prof.push([4 + t * (L - 10), r]);
  }
  prof.push([L - 3, d / 2 - 2.5], [L, d / 2 - 5], [L, 0]);
  const body = latheX(prof, { seg: 32, crease: 50 });
  k.add("poly", T(body, { r: [0, 0, 90], p: [o.tilt ?? 0, 3, 0], s: [1, 1, o.flat ?? 1] }));
  k.add("polySoft", T(cylY(d / 2 - 3.2, L + 1.4, L + 4, { c: 1, seg: 28 }), { s: [1, 1, o.flat ?? 1] }));
  k.add("polySoft", T(box(d * 0.6, 1.4, 2.4, { bevel: 0.5 }), { p: [0, L + 4.4, 0] }));
  k.add("steel", T(thumbNut(5.6, 3.6, 6), { r: [0, -90, 0], p: [0, -2.5, 13] }));
  k.add("steel", crossBolt(0, -2.5, 13, { nutR: 0 }));
  return { root: k.build(o.name) };
}
function afg(ctx) {
  const k = ctx.kit();
  const pro = shape([[-62, 0, 2], [34, 0, 2], [34, 6, 4], [14, 18, 20], [-40, 34, 12], [-66, 30, 8], [-66, 12, 6]]);
  k.add("poly", extrudeZ(pro, 30, { bevel: 6, curve: 8 }));
  k.add("polySoft", extrudeZ([[-50, 14, 4], [-10, 10, 6], [-30, 26, 8], [-58, 26, 6]], 1.2, { bevel: 0.4, z: 14.6 }));
  k.add("polySoft", extrudeZ([[-50, 14, 4], [-10, 10, 6], [-30, 26, 8], [-58, 26, 6]], 1.2, { bevel: 0.4, z: -14.6 }));
  k.add("steel", crossBolt(-20, -2.5, 15));
  k.add("steel", crossBolt(14, -2.5, 15));
  k.add("poly", clampBody(-64, 34, 3, { w: 28, jaw: -5.5 }));
  return { root: k.build("afg2") };
}
function handstop(ctx) {
  const k = ctx.kit();
  k.add("poly", clampBody(-14, 18, 3, { w: 26 }));
  k.add("poly", extrudeZ([[-14, 0, 1], [18, 0, 1], [18, 6, 3], [6, 21, 5], [-2, 21, 4], [-14, 6, 3]], 24, { bevel: 3 }));
  k.add("steel", crossBolt(0));
  return { root: k.build("handstop") };
}
// Сошки Harris S-BRM: зажим, поворотное основание, пружины отвода ног, телескопические
// ноги с проточками-фиксаторами, кнопки замка и резиновые пятки.
function harris(ctx) {
  const k = ctx.kit();
  k.add("alu", clampBody(-18, 18, 6));
  k.add("steel", T(thumbNut(7, 5, 8), { r: [0, -90, 0], p: [0, -2.5, 13] }));
  k.add("steel", crossBolt(0, -2.5, 13, { nutR: 0 }));
  k.add("steel", extrudeZ([[-26, 5, 2], [26, 5, 2], [26, 18, 4], [-26, 18, 4]], 30, { bevel: 2 }));
  k.add("steel", cylY(8, 5, 12, { seg: 24 }));
  k.add("steel", T(ctx.C.knob(5, 5, 14), { r: [0, 0, 90], p: [-20, 18, 0] }));
  for (const s of [-1, 1]) {
    k.add("spring", T(spring(3, 0.8, -22, 8, 9), { p: [0, 20, s * 12] }));
    k.add("steel", cylZ(5.5, 0, 8, { seg: 18 }), { p: [16, 12, s > 0 ? 14 : -22] });
    k.add("steel", T(cylZ(3, -1, 1, { seg: 12 }), { p: [-22, 20, s * 12] }));
  }
  const legs = [];
  for (const s of [-1, 1]) {
    const lk = ctx.kit();
    lk.add("steel", cylX(6.2, -4, 160, { c: 1, seg: 20 }));
    lk.add("steelWorn", ringGrooves(4.8, 160, 214, 6, 0.7, { seg: 18 }));
    lk.add("steel", cylX(7, 150, 162, { c: 1, seg: 20 }));
    lk.add("steel", T(cylY(2, 0, 3, { seg: 10 }), { p: [156, 6.6, 0] }));
    lk.add("rubber", latheX([[212, 0], [212, 7], [222, 8], [228, 5], [230, 0]], { seg: 20 }));
    lk.add("rubber", T(flutesX(7.6, 215, 224, 12, 1.4, 0.6), {}));
    const leg = node("leg", [lk.build()]);
    leg.position.set(16, 12, s * 21);
    legs.push(leg);
  }
  return { root: node("harris", [k.build(), ...legs]), bipod: { legs, angle: 90 } };
}
// ---- фонари, ЛЦУ и рукоятки из набора M416/АК/SCAR
function lampFace(ctx, o) {
  const { x, r, cy = 0, cz = 0, depth = 14, led = 2.2, tir = false } = o;
  const at = (g) => g.translate(0, cy, cz);
  const meshes = [];
  let refl;
  if (!tir) {
    const prof = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      prof.push([x - 1.2 - depth * (1 - t), led * 1.25 + (r - 0.4 - led * 1.25) * Math.sqrt(t)]);
    }
    refl = lens(ctx, at(latheX(prof.reverse(), { seg: 40, crease: 80 })), "reflector");
    refl.renderOrder = 0;
  } else {
    const prof = [[x - depth, led * 1.6], [x - depth * 0.45, r * 0.62], [x - 1.2, r - 0.3]];
    refl = lens(ctx, at(latheX(prof.reverse(), { seg: 36, crease: 80 })), "reflector");
    refl.material.color.set(10134442);
    refl.material.roughness = 0.25;
    refl.renderOrder = 0;
  }
  refl.material.transparent = false;
  meshes.push(refl);
  const x0 = tir ? x - depth : x - 1.2 - depth;
  const pad = new ctx.THREE.Mesh(at(box(0.8, led * 2.6, led * 2.6, { bevel: 0.2 }).translate(x0 + 0.2, 0, 0)), ctx.mats.get("paintWhite"));
  meshes.push(pad);
  const ledM = lens(ctx, at(latheX([[x0 + 0.5, 0], [x0 + 0.5, led], [x0 + 1.1, led * 0.9], [x0 + 1.5, led * 0.5], [x0 + 1.7, 0]], { seg: 20 })), "ledPhos");
  ledM.renderOrder = 0;
  ledM.material.transparent = false;
  meshes.push(ledM);
  const glass = lens(ctx, at(cylX(r - 0.1, x - 1.1, x - 0.3, { seg: 40, c: 0.2 })), "glass");
  meshes.push(glass);
  if (tir) {
    const cone = lens(ctx, at(latheX([[x - depth + 0.3, 0], [x - depth + 0.3, led * 1.5], [x - depth * 0.45, r * 0.6], [x - 1.3, r - 0.4], [x - 1.3, 0]], { seg: 36 })), "glass");
    cone.material.opacity = 0.22;
    meshes.push(cone);
  }
  for (const m of meshes) m.userData.noAO = true;
  return { meshes, lens: ledM, refl, p: [x + 0.2, cy, cz], lensR: r / 1e3 };
}
function tlr1(ctx) {
  const k = ctx.kit();
  const cy = 18;
  k.add("alu", clampBody(-16, 16, 5, { w: 25 }));
  k.add("steel", T(box(8, 4, 26, { bevel: 0.8 }), { p: [4, -2, 0] }));
  k.add("steel", T(ctx.C.knob(5.4, 4, 14), { r: [0, -90, 0], p: [4, -2.5, 12.8] }));
  const sec = rrect(0, cy - 1, 30, 29, 11);
  k.add("alu", extrudeX(sec, -52, 14, { bevel: 2 }));
  k.add("alu", extrudeX(rrect(0, 6.5, 22, 5, 1.5), -40, 12, { bevel: 0.8 }));
  k.add("alu", T(latheX([[12, 0], [12, 14.6], [14, 15.6], [30, 15.6], [31, 16.4], [37, 16.4], [38, 15.2], [38, 0]], { seg: 44 }), { p: [0, cy, 0] }));
  k.add("alu", T(ringGrooves(15.7, 16, 28, 5, 0.5, { seg: 44 }), { p: [0, cy, 0] }));
  k.add("steel", T(flutesX(16.3, 31, 37, 30, 1.2, 0.6), { p: [0, cy, 0] }));
  for (const s of [-1, 1]) {
    k.add("poly", T(extrudeZ([[0, -6, 2], [12, -4, 3], [14, 6, 3], [0, 7, 2]], 4, { bevel: 1.2 }), { p: [-58, cy - 2, s * 14.5] }));
    for (let i = 0; i < 4; i++) k.add("poly", T(box(1.2, 10, 1, { bevel: 0.3 }), { p: [-55 + i * 3, cy - 1, s * 16.8] }));
  }
  k.add("alu", extrudeX(rrect(0, cy - 2, 26, 22, 6), -60, -50, { bevel: 1.5 }));
  for (const x of [-44, -8]) for (const s of [-1, 1]) k.add("steel", T(cylZ(1.6, 14.8, 15.6, { seg: 10 }), { p: [x, cy + 7, s > 0 ? 0 : -30.4] }));
  const root = node("tlr1", [k.build()]);
  const f = lampFace(ctx, { x: 38, r: 13.6, cy, depth: 15, led: 2.2 });
  root.add(...f.meshes);
  return { root, light: { p: f.p, lens: f.lens, refl: f.refl, beam: { lensR: f.lensR, candela: 13e3, hot: 0.085, spill: 0.62, spillK: 0.05, ring: 0.05, color: 15856895 } } };
}
function modlite(ctx) {
  const k = ctx.kit();
  const cy = 24, r = 12.7;
  k.add("alu", clampBody(-13, 13, 5, { w: 24 }));
  k.add("steel", crossBolt(0));
  k.add("alu", extrudeX([[-8, 3, 1], [8, 3, 1], [8, cy - r + 2, 2], [-8, cy - r + 2, 2]], -12, 12, { bevel: 1 }));
  k.add("alu", T(tubeX(r + 3.2, r, -14, 14, { seg: 40 }), { p: [0, cy, 0] }));
  k.add("steel", T(cylY(2.4, cy + r - 1, cy + r + 4.4, { seg: 12 }), { p: [0, 0, 0] }));
  const at = (g) => T(g, { p: [0, cy, 0] });
  k.add("alu", at(latheX([[-86, 0], [-86, 9], [-84, 11.5], [-80, 13.2], [-66, 13.2], [-65, r], [6, r], [8, r + 1.2], [14, r + 1.2]], { seg: 40 })));
  k.add("alu", at(ringGrooves(13.3, -79, -67, 6, 0.5, { seg: 40 })));
  k.add("rubber", at(latheX([[-90, 0], [-90, 7], [-88.5, 8.8], [-86, 9.4], [-86, 0]], { seg: 28 })));
  k.add("alu", at(latheX([[14, 0], [14, 13.9], [22, 16.5], [30, 18.4], [50, 19.2], [52, 18.4], [52, 0]], { seg: 48 })));
  for (let i = 0; i < 6; i++) k.add("alu", at(tubeX(19.6, 17.5, 22 + i * 3.5, 23.6 + i * 3.5, { seg: 48 })));
  k.add("steel", at(tubeX(19.3, 16.8, 49, 53, { seg: 48 })));
  const root = node("modlite", [k.build()]);
  const f = lampFace(ctx, { x: 52.6, r: 16.8, cy, depth: 26, led: 1.8 });
  root.add(...f.meshes);
  return { root, light: { p: f.p, lens: f.lens, refl: f.refl, beam: { lensR: f.lensR, candela: 6e4, hot: 0.045, spill: 0.5, spillK: 0.018, ring: 0.07, color: 16774116 } } };
}
function rein(ctx) {
  const k = ctx.kit();
  const cy = 19, r = 12;
  k.add("alu", clampBody(-14, 14, 5, { w: 24 }));
  k.add("steel", crossBolt(-6));
  k.add("steel", crossBolt(6));
  k.add("alu", extrudeX([[-9, 3, 1], [9, 3, 1], [9, cy - 6, 3], [-9, cy - 6, 3]], -16, 16, { bevel: 1 }));
  const at = (g) => T(g, { p: [0, cy, 0] });
  k.add("alu", at(latheX([[-36, 0], [-36, 8], [-34, 11], [-30, 11.6], [-18, 11.6], [-17, r], [18, r]], { seg: 40 })));
  k.add("alu", at(ringGrooves(r + 0.2, -12, 16, 7, 0.45, { seg: 40 })));
  k.add("rubber", at(latheX([[-40, 0], [-40, 6], [-38, 7.6], [-36, 8], [-36, 0]], { seg: 24 })));
  k.add("alu", at(cylX(15.5, 18, 36, { seg: 6, c: 1.4 })));
  k.add("steel", at(tubeX(15.3, 13.2, 35, 37, { seg: 40 })));
  const root = node("rein", [k.build()]);
  const f = lampFace(ctx, { x: 37.4, r: 13, cy, depth: 12, led: 1.6, tir: true });
  root.add(...f.meshes);
  return { root, light: { p: f.p, lens: f.lens, refl: f.refl, beam: { lensR: f.lensR, candela: 16e3, hot: 0.13, spill: 0.72, spillK: 0.12, ring: 0.02, tir: true, color: 16773341 } } };
}
function klesch(ctx) {
  const k = ctx.kit();
  const cy = 17;
  k.add("alu", clampBody(-20, 20, 5, { w: 26 }));
  k.add("steel", crossBolt(-10));
  k.add("steel", crossBolt(10));
  k.add("alu", extrudeX(rrect(0, cy, 32, 28, 7), -46, 30, { bevel: 2.2 }));
  for (const s of [-1, 1]) for (let i = 0; i < 7; i++) k.add("alu", T(box(3, 16, 1.6, { bevel: 0.5 }), { p: [-34 + i * 6, cy, s * 16.4] }));
  k.add("alu", extrudeX(shape(rrect(0, cy, 32, 28, 7), [rrect(-3, cy, 24, 22, 5)]), 30, 34, { bevel: 0.8 }));
  for (const [z, y] of [[-12, cy - 10], [12, cy - 10], [-12, cy + 10], [12, cy + 10]]) k.add("steel", T(cylX(1.3, 33.5, 34.5, { seg: 10 }), { p: [0, y, z] }));
  k.add("lensBlack", extrudeX(rrect(-3, cy, 24, 22, 5), 30.2, 31, { bevel: 0.2 }));
  k.add("steel", T(tubeX(4.4, 3, 30, 34.4, { seg: 20 }), { p: [0, cy + 6, 11.5] }));
  k.add("irLens", T(cylX(3, 31.5, 32.5, { seg: 20 }), { p: [0, cy + 6, 11.5] }));
  k.add("steel", T(cylX(4.2, -52, -46, { seg: 20 }), { p: [0, cy + 4, 0] }));
  k.add("rubber", T(cylX(5.4, -50, -46, { seg: 20 }), { p: [0, cy - 7, 0] }));
  const root = node("klesch", [k.build()]);
  const f = lampFace(ctx, { x: 31, r: 10.5, cy, cz: -3, depth: 13, led: 2 });
  root.add(...f.meshes);
  return { root, light: { p: f.p, lens: f.lens, refl: f.refl, beam: { lensR: f.lensR, candela: 9e3, hot: 0.06, spill: 0.46, spillK: 0.03, ring: 0.06, color: 15660031 } } };
}
function laserBox(ctx, o) {
  const k = ctx.kit();
  const { L0, L1, H, W, mat } = o;
  k.add("alu", clampBody(-18, 18, 5));
  k.add("steel", T(ctx.C.knob(6, 5, 18), { r: [0, -90, 0], p: [0, -2.5, 13] }));
  k.add("steel", cylZ(2.4, -14, 13, { seg: 12 }), { p: [0, -2.5, 0] });
  const sec = [[-W / 2, 4, 3], [W / 2, 4, 3], [W / 2, H - 4, 6], [W / 2 - 4, H, 5], [-W / 2 + 4, H, 5], [-W / 2, H - 4, 6]];
  k.add(mat, extrudeX(sec, L0, L1, { bevel: 3, bevelSeg: 3 }));
  for (const s of [-1, 1]) {
    k.add(mat, T(box(L1 - L0 - 24, H - 16, 1.2, { bevel: 0.6 }), { p: [(L0 + L1) / 2 - 2, H / 2 + 1, s * (W / 2 + 0.2)] }));
    for (let i = 0; i < 3; i++) k.add("lensBlack", T(box(L1 - L0 - 40, 0.8, 0.6), { p: [(L0 + L1) / 2 - 2, 10 + i * 5, s * (W / 2 + 0.9)] }));
  }
  const vis = [L1 + 0.6, H * 0.7, -W * 0.22];
  k.add("lensBlack", extrudeX(rrect(0, H * 0.7, W - 10, 12, 3), L1 - 0.8, L1 + 0.6, { bevel: 0.3 }));
  for (const z of [-W * 0.22, W * 0.12]) k.add("steel", T(tubeX(4.4, 2.8, L1 - 1, L1 + 2.2, { seg: 20 }), { p: [0, H * 0.7, z] }));
  if (o.illum) {
    const iy = H * 0.34;
    k.add(mat, T(tubeX(o.illum + 3, o.illum, L1 - 4, L1 + 9, { seg: 36 }), { p: [0, iy, 0] }));
    k.add("rubber", T(flutesX(o.illum + 2.8, L1 + 1, L1 + 8, 24, 1.2, 0.8), { p: [0, iy, 0] }));
    k.add("irLens", T(cylX(o.illum - 0.2, L1 + 6, L1 + 7, { seg: 30 }), { p: [0, iy, 0] }));
  }
  const turret = (p, r) => {
    k.add(mat, T(cylY(5, 0, 2.2, { seg: 24, c: 0.5 }), { p, r }));
    k.add("steel", T(cylY(3.4, 2.2, 3.4, { seg: 20, c: 0.3 }), { p, r }));
    k.add("lensBlack", T(box(0.8, 1.2, 5, { bevel: 0.1 }), { p: [p[0], p[1], p[2]], r }).translate(0, 0, 0));
  };
  turret([L1 - 16, H, 0], [0, 0, 0]);
  turret([L1 - 16, H / 2, W / 2], [90, 0, 0]);
  k.add(mat, T(ctx.C.knob(8.5, 5, 20), { r: [0, 0, 90], p: [L0 + 30, H - 1, 0] }));
  for (let i = 0; i < 5; i++) {
    const a = -0.9 + i * 0.45;
    k.add("paintWhite", T(box(2.4, 0.6, 1.1), { p: [L0 + 30 + Math.cos(a) * 11, H + 0.1, Math.sin(a) * 11], r: [0, -a * 57.3, 0] }));
  }
  k.add("paintWhite", T(box(4, 0.8, 1.2), { p: [L0 + 30, H + 4.2, 5] }));
  for (const z of [-W * 0.25, W * 0.25]) k.add("rubber", T(cylY(4.2, H - 1, H + 2.4, { c: 1, seg: 18 }), { p: [L0 + 12, 0, z] }));
  k.add("steel", T(cylX(4, L0 - 5, L0, { seg: 20 }), { p: [0, H * 0.5, 0] }));
  k.add(mat, T(ctx.C.knob(8, 5, 26), { r: [0, 0, 0], p: [0, 0, 0] }).rotateY(-Math.PI / 2).translate(L0 + 14, H * 0.45, W / 2 - 1));
  const root = node(o.name, [k.build()]);
  const ll = lens(ctx, cylX(2.7, vis[0] + 0.8, vis[0] + 1.4, { seg: 16 }).translate(0, vis[1], vis[2]), "laserLens");
  ll.renderOrder = 0;
  ll.material.transparent = false;
  ll.material.emissive.set(o.color);
  root.add(ll);
  const out = { root, laser: { p: [vis[0] + 2, vis[1], vis[2]], lens: ll, color: o.color } };
  if (o.light) {
    const ly = -2 + H * 0.3, lr = 9.5;
    k.add(mat, T(latheX([[L1 - 12, 0], [L1 - 12, lr + 2], [L1 + 6, lr + 3.4], [L1 + 8, lr + 2.4], [L1 + 8, 0]], { seg: 36 }), { p: [0, ly, W * 0.2] }));
    root.add(k.build());
    const f = lampFace(ctx, { x: L1 + 8.2, r: lr, cy: ly, cz: W * 0.2, depth: 8, led: 1.6, tir: true });
    root.add(...f.meshes);
    out.light = { p: f.p, lens: f.lens, refl: f.refl, beam: { lensR: f.lensR, ...o.light } };
  }
  return out;
}
function mvg(ctx) {
  const k = ctx.kit();
  k.add("poly", clampBody(-22, 22, 5, { w: 26 }));
  k.add("steel", T(ctx.C.knob(5.5, 4, 14), { r: [0, -90, 0], p: [0, -2.5, 13] }));
  const pro = [[-26, 3, 2], [24, 3, 2], [18, 62, 8], [10, 70, 6], [-10, 70, 6], [-18, 62, 8]];
  k.add("polySoft", extrudeZ(pro, 27, { bevel: 7, curve: 8, bevelSeg: 3 }));
  for (let i = 0; i < 9; i++) {
    const y = 12 + i * 5.4, t = (y - 3) / 59;
    k.add("polySoft", T(box(2.2, 1.6, 20, { bevel: 0.6 }), { p: [24 - 6 * t + 0.6, y, 0], r: [0, 0, -6] }));
    k.add("polySoft", T(box(2.2, 1.6, 20, { bevel: 0.6 }), { p: [-26 + 8 * t - 0.6, y, 0], r: [0, 0, 7] }));
  }
  return { root: k.build("mvg") };
}
function kag(ctx) {
  const k = ctx.kit();
  const pro = [[-40, 0, 2], [34, 0, 2], [36, 6, 3], [30, 26, 7], [22, 30, 5], [16, 22, 6], [-30, 12, 12], [-42, 8, 4]];
  k.add("poly", extrudeZ(pro, 28, { bevel: 5, curve: 8, bevelSeg: 3 }));
  k.add("poly", clampBody(-34, 30, 4, { w: 26 }));
  for (const x of [-18, 12]) k.add("steel", T(cylZ(2.6, 13.2, 14.6, { seg: 12 }), { p: [x, 4, 0] }));
  for (let i = 0; i < 6; i++) k.add("poly", T(box(1.6, 3, 18, { bevel: 0.5 }), { p: [-8 + i * 4.2, 17 - i * 0.9, 0], r: [0, 0, -14] }));
  return { root: k.build("kag") };
}
var TACTICAL = [
  { id: "m600", cat: "light", name: "SureFire M600 Scout", desc: "Тактический фонарь 1000 лм", foot: [-13, 13], body: [-78, 72], stats: { weight: 175, ergo: -2 }, power: { light: 20, cells: "2 × CR123A", driver: "reg" }, build: (c) => scout(c, { name: "m600", r: 12.7, headR: 15.9, tail: -76, head: 42, lm: 1e3, beam: { candela: 2e4, hot: 0.07, spill: 0.55, spillK: 0.03, ring: 0.06, color: 15922687 } }) },
  { id: "m300", cat: "light", name: "SureFire M300 Mini Scout", desc: "Компактный фонарь 500 лм", foot: [-13, 13], body: [-60, 44], stats: { weight: 120, ergo: -1 }, power: { light: 24, cells: "1 × CR123A", driver: "reg" }, build: (c) => scout(c, { name: "m300", r: 11, headR: 12.6, tail: -58, head: 14, lm: 500, beam: { candela: 7e3, hot: 0.085, spill: 0.6, spillK: 0.045, ring: 0.05, color: 15922687 } }) },
  { id: "m640", cat: "light", name: "SureFire M640DF Scout Pro", desc: "1500 лм, 38 000 кд — двойное топливо, мощный луч с широкой засветкой", foot: [-13, 13], body: [-128, 78], stats: { weight: 190, ergo: -2 }, power: { light: 20, cells: "2 × CR123A", driver: "reg" }, build: (c) => scout(c, { crenel: true, name: "m640", r: 12.7, headR: 17.2, tail: -82, head: 46, lm: 1500, cd: 38e3, hot: 0.15, spill: 0.1, kelvin: 6300, batt: 20, tail2: true }) },
  { id: "okw", cat: "light", name: "Modlite OKW-18650", desc: "Прожектор 1250 лм / 64 000 кд: узкое пятно бьёт на 500 м", foot: [-13, 13], body: [-136, 96], stats: { weight: 210, ergo: -3 }, power: { light: 28, cells: "1 × 18650", driver: "step" }, build: (c) => scout(c, { name: "okw", r: 12.7, headR: 22.5, tail: -90, head: 50, lm: 1250, cd: 64e3, hot: 0.09, spill: 0.05, kelvin: 5200, batt: 28, tail2: true }) },
  { id: "hlx", cat: "light", name: "Streamlight ProTac HL-X", desc: "1000 лм, тёплый нейтральный свет, дешёвые CR123", foot: [-13, 13], body: [-78, 70], stats: { weight: 160, ergo: -2 }, power: { light: 24, cells: "2 × CR123A", driver: "reg" }, build: (c) => scout(c, { name: "hlx", r: 12.4, headR: 16.4, tail: -76, head: 40, lm: 1e3, cd: 2e4, hot: 0.2, spill: 0.11, kelvin: 5600, batt: 24 }) },
  { id: "tlr1", cat: "light", name: "Streamlight TLR-1 HL", desc: "Фонарь «пистолетного» типа 1000 лм, клавиши сзади с обеих сторон", foot: [-16, 16], body: [-62, 39], stats: { weight: 125, ergo: -2 }, power: { light: 22, cells: "2 × CR123A", driver: "reg" }, build: tlr1 },
  { id: "modlite", cat: "light", name: "Modlite PLHv2 18650", desc: "Дальнобойный фонарь 1500 лм / 60 000 кд, выносной кронштейн", foot: [-13, 13], body: [-91, 54], stats: { weight: 190, ergo: -3 }, power: { light: 21, cells: "1 × 18650", driver: "step" }, build: modlite },
  { id: "rein", cat: "light", name: "Cloud Defensive REIN 3.0 Micro", desc: "Компактный фонарь с широким ровным лучом (TIR), 1400 лм", foot: [-16, 16], body: [-41, 38], stats: { weight: 105, ergo: -1 }, power: { light: 25, cells: "1 × 18350", driver: "step" }, build: rein },
  { id: "klesch", cat: "light", name: "Зенитко «Клещ-2П»", desc: "Тактический фонарь с ИК-светодиодом, выносная кнопка", foot: [-20, 20], body: [-53, 35], stats: { weight: 160, ergo: -2 }, power: { light: 30, cells: "2 × CR123A", driver: "reg" }, build: klesch },
  { id: "peq15", cat: "laser", name: "L3 AN/PEQ-15", desc: "ЛЦУ: видимый + ИК лазер, ИК-осветитель", foot: [-18, 18], body: [-48, 60], stats: { weight: 215, ergo: -3, "hipSpread%": -18 }, power: { laser: 30, cells: "1 × CR123A" }, build: (c) => boxLaser(c, { name: "peq15", L0: -48, L1: 56, H: 38, W: 50, mat: "polyTan", illum: 8, color: 16722458 }) },
  { id: "ls221g", cat: "laser", name: "Holosun LS221G (зелёный)", desc: "Зелёный лазер 520 нм: днём виден лучше красного", foot: [-18, 18], body: [-34, 46], stats: { weight: 135, ergo: -2, "hipSpread%": -16 }, power: { laser: 24, cells: "1 × CR123A" }, build: (c) => boxLaser(c, { name: "ls221", L0: -34, L1: 44, H: 30, W: 34, mat: "poly", color: 3079936, batt: 24 }) },
  { id: "ls321", cat: "laser", name: "Holosun LS321", desc: "Компактный ЛЦУ с ИК-осветителем", foot: [-18, 18], body: [-34, 46], stats: { weight: 140, ergo: -2, "hipSpread%": -15 }, power: { laser: 26, cells: "1 × CR123A" }, build: (c) => boxLaser(c, { name: "ls321", L0: -34, L1: 44, H: 32, W: 36, mat: "poly", illum: 6 }) },
  { id: "dbal_a3", cat: "laser", name: "Steiner DBAL-A3", desc: "ЛЦУ: зелёный видимый + ИК лазер, ИК-осветитель с фокусировкой", foot: [-18, 18], body: [-44, 66], stats: { weight: 230, ergo: -3, "hipSpread%": -18 }, power: { laser: 30, cells: "1 × CR123A" }, build: (c) => laserBox(c, { name: "dbal_a3", L0: -44, L1: 56, H: 36, W: 42, mat: "polyFdeDark", illum: 8, color: 4063066 }) },
  { id: "perst4", cat: "laser", name: "Зенитко «Перст-4»", desc: "Компактный ЛЦУ: красный видимый + ИК лазеры", foot: [-18, 18], body: [-36, 40], stats: { weight: 135, ergo: -2, "hipSpread%": -14 }, power: { laser: 28, cells: "1 × CR123A" }, build: (c) => laserBox(c, { name: "perst4", L0: -36, L1: 38, H: 30, W: 34, mat: "alu", illum: 0, color: 16722458 }) },
  { id: "dbal", cat: "combo", name: "Steiner DBAL-PL", desc: "Комбо-блок: фонарь 300 лм + видимый лазер (C / Z)", foot: [-16, 16], body: [-42, 44], stats: { weight: 150, ergo: -2, "hipSpread%": -12 }, power: { light: 26, laser: 30, cells: "1 × CR123A", driver: "reg" }, build: dbal },
  { id: "peq16", cat: "combo", name: "Insight AN/PEQ-16A", desc: "Комбо-блок: белый фонарь 150 лм + красный и ИК лазеры (C / Z)", foot: [-18, 18], body: [-48, 66], stats: { weight: 280, ergo: -3, "hipSpread%": -14 }, power: { light: 24, laser: 30, cells: "2 × CR123A", driver: "reg" }, build: (c) => laserBox(c, { name: "peq16", L0: -48, L1: 56, H: 40, W: 46, mat: "polyTan", illum: 0, color: 16722458, light: { candela: 3e3, hot: 0.12, spill: 0.5, spillK: 0.08, ring: 0.02, tir: true, color: 16185087 } }) },
  { id: "rvg", cat: "foregrip", name: "Magpul RVG", desc: "Вертикальная рукоятка, контроль отдачи", foot: [-17, 17], body: [-17, 17], stats: { weight: 70, "recoilV%": -6, "recoilH%": -10, ergo: 3, adsTime: 6 }, build: (c) => vgrip(c, { name: "rvg", len: 98, d: 32, ribs: true }) },
  { id: "bcm_vg", cat: "foregrip", name: "BCM Gunfighter Mod 3", desc: "Короткая рукоятка-упор", foot: [-16, 16], body: [-16, 16], stats: { weight: 45, "recoilV%": -4, "recoilH%": -6, ergo: 5 }, build: (c) => vgrip(c, { name: "bcm", len: 62, d: 31, flat: 0.85 }) },
  { id: "afg2", cat: "foregrip", name: "Magpul AFG-2", desc: "Наклонная рукоятка, быстрая вскидка", foot: [-64, 34], body: [-66, 34], stats: { weight: 55, "recoilV%": -3, "recoilH%": -5, ergo: 6, adsTime: -8 }, build: afg },
  { id: "handstop", cat: "foregrip", name: "Упор для ладони", desc: "Упор под хват «C-clamp»", foot: [-14, 18], body: [-14, 18], stats: { weight: 25, ergo: 4, "recoilH%": -3 }, build: handstop },
  { id: "mvg", cat: "foregrip", name: "Magpul MVG", desc: "Широкая вертикальная рукоятка с наклоном, контроль отдачи", foot: [-22, 22], body: [-27, 25], stats: { weight: 60, "recoilV%": -5, "recoilH%": -9, ergo: 4, adsTime: 4 }, build: mvg },
  { id: "rk6", cat: "foregrip", name: "Зенитко РК-6", desc: "Прямая рукоятка с выраженным рифлением", foot: [-18, 18], body: [-18, 18], stats: { weight: 85, "recoilV%": -7, "recoilH%": -9, ergo: 2, adsTime: 7 }, build: (c) => vgrip(c, { name: "rk6", len: 108, d: 34, ribs: true, flat: 0.86, cap: true }) },
  { id: "kag", cat: "foregrip", name: "BCM KAG", desc: "Низкая наклонная рукоятка-упор, быстрая вскидка", foot: [-34, 30], body: [-42, 36], stats: { weight: 40, "recoilV%": -2, "recoilH%": -5, ergo: 6, adsTime: -8 }, build: kag },
  { id: "harris", cat: "bipod", name: "Сошки Harris S-BRM", desc: "Раскладные сошки, клавиша B", foot: [-18, 18], body: [-28, 232], stats: { weight: 420, ergo: -8, adsTime: 25, "recoilV%": -4 }, build: harris }
];

// src/engine/lib/pistol.js
// Пистолетные модули: коллиматоры на вырез кожуха (MOS) и подствольные фонари на рамку.
function microBase(k) {
  // переходная пластина MOS: ложится в фрезеровку кожуха
  k.add("steelMatte", extrudeX(rrect(0, -0.6, 25, 2.2, 0.8), -24, 24, { bevel: 0.4 }));
  for (const x of [-15, 15]) k.add("steel", T(cylY(2.2, 0.4, 1.4, { seg: 12 }), { p: [x, 0, 0] }));
}
function rmrPistol(ctx) {
  const k = ctx.kit();
  microBase(k);
  const m = ctx.kit();
  const A = rmrBody(ctx, m);
  const glass = lens(ctx, extrudeX(shape(rrect(0, A + 0.5, 18.6, 13.4, 5)), 6, 7, { bevel: 0.2 }), "glassAmber");
  const body = node("rmr", [m.build(), glass]);
  body.position.y = 0.6;
  return { root: node("rmr_p", [k.build(), body]), sight: { node: body, y: A + 0.5, z: 0, x0: -22, x1: 15, r: 8, mag: 1, reticle: "dot", lens: glass } };
}
function hs507(ctx) {
  const k = ctx.kit();
  microBase(k);
  const A = 16;
  k.add("alu", extrudeX(rrect(0, 5, 26, 10, 2.4), -22, 22, { bevel: 1.2 }));
  // капюшон: скруглённая арка с плоскими «плечами»
  const arch = (w, h, y0) => {
    const pts = [[w, y0], [w, h - w * 0.7]];
    for (let i = 1; i < 12; i++) {
      const a = i / 12 * Math.PI;
      pts.push([Math.cos(a) * w, h - w * 0.7 + Math.sin(a) * w * 0.7]);
    }
    pts.push([-w, h - w * 0.7], [-w, y0]);
    return pts;
  };
  k.add("alu", extrudeX(shape(arch(13, 27, 8), [arch(10.2, 24.4, 9.5)]), -6, 16, { bevel: 1 }));
  k.add("alu", extrudeZ([[-22, 9], [-7, 9], [-7, 13, 2], [-12, 14, 2], [-22, 12, 2]], 24, { bevel: 1.2 }));
  // батарейный лоток справа и кнопки слева
  k.add("alu", T(extrudeX(rrect(0, 0, 4, 11, 1.5), -18, 2, { bevel: 0.8 }), { p: [0, 8, 13.6] }));
  k.add("steel", T(cylZ(1.4, 15.4, 16.4, { seg: 10 }), { p: [-15, 8, 0] }));
  for (const x of [-16, -8]) k.add("rubber", T(cylZ(2.6, -14.8, -13, { c: 0.6, seg: 14 }), { p: [x, 9, 0] }));
  k.add("steel", T(cylY(2.4, 13.5, 15, { seg: 14 }), { p: [-15, 0, 0] }));
  k.add("lensBlack", T(box(3.4, 0.5, 0.6, { bevel: 0.1 }), { p: [-15, 15, 0] }));
  k.add("lensBlack", T(box(0.6, 3.4, 0.5, { bevel: 0.1 }), { p: [-15, 8, 16.4] }));
  for (let i = 0; i < 6; i++) k.add("alu", T(box(0.8, 9, 0.6, { bevel: 0.2 }), { p: [-17 + i * 3, 8, 15.7] }));
  // окно излучателя и торцевые винты
  k.add("lensBlack", extrudeX(rrect(0, 11, 5, 2.4, 1), -6.8, -6.2, { bevel: 0.1 }));
  for (const s2 of [-1, 1]) k.add("steel", T(capScrew(1.4, 0.6), { r: [s2 * 90, 0, 0] }), { p: [14, 3.5, s2 * 13] });
  const glass = lens(ctx, extrudeX(shape(arch(10, 24.2, 9.6)), 12, 13, { bevel: 0.2 }), "glassBlue");
  return { root: node("hs507", [k.build(), glass]), sight: { y: A + 0.6, z: 0, x0: -22, x1: 16, r: 9, mag: 1, reticle: "holo", lens: glass } };
}
function acroP2(ctx) {
  const k = ctx.kit();
  microBase(k);
  const A = 18;
  k.add("alu", extrudeX(shape(rrect(0, 15, 30, 29, 5), [rrect(0, A, 22, 17, 3)]), -24, 23, { bevel: 1.4 }));
  k.add("alu", extrudeX(rrect(0, 2.5, 30, 5, 1.5), -24, 23, { bevel: 1 }));
  for (const x of [-26, 25]) k.add("alu", T(extrudeX(shape(rrect(0, 15, 31, 30, 5.5), [rrect(0, A, 21, 16, 3)]), -1.2, 1.2, { bevel: 0.6 }), { p: [x, 0, 0] }));
  k.add("alu", T(cylZ(6, 15, 19, { c: 1, seg: 24 }), { p: [-10, 14, 0] }));
  for (const x of [4, 12]) k.add("rubber", T(cylZ(2.4, -16.8, -15, { c: 0.6, seg: 14 }), { p: [x, 21, 0] }));
  k.add("alu", T(ctx.C.knob(6.4, 1.6, 20), { r: [0, -90, 0], p: [-10, 14, 19] }));
  k.add("lensBlack", T(box(5, 0.8, 0.6, { bevel: 0.1 }), { p: [-10, 14, 20.7] }));
  k.add("steel", T(cylY(2.2, 29, 30.4, { seg: 14 }), { p: [-6, 0, 0] }));
  k.add("lensBlack", T(box(3, 0.5, 0.6, { bevel: 0.1 }), { p: [-6, 30.4, 0] }));
  k.add("steel", T(cylZ(2.2, 14.8, 16.2, { seg: 14 }), { p: [6, 8, 0] }));
  for (const x of [-18, 18]) for (const s2 of [-1, 1]) k.add("steel", T(capScrew(1.3, 0.5), { r: [s2 * 90, 0, 0] }), { p: [x, 3, s2 * 15.2] });
  const glass = lens(ctx, extrudeX(rrect(0, A, 22, 17, 3), 18, 19, { bevel: 0.2 }), "glassRed");
  const rear = lens(ctx, extrudeX(rrect(0, A, 22, 17, 3), -22, -21, { bevel: 0.2 }), "glassBlue");
  return { root: node("acro", [k.build(), glass, rear]), sight: { y: A, z: 0, x0: -24, x1: 23, r: 8, mag: 1, reticle: "dot", lens: glass } };
}
// Фонарь на рамку: y растёт от планки (на нижней грани — вниз от рамки).
function pistolLight(ctx, o) {
  const k = ctx.kit();
  const { x0, x1, w, h, headR } = o;
  const cy = 6 + h / 2;
  // зацеп рельса + поперечина-упор, входящая в паз
  // губки зажима охватывают рельс рамки (рамка начинается в 4 мм над гранью рельса)
  k.add(o.mat || "alu", clampBody(-14, 12, 7, { w, jaw: -3.9, r: 1 }));
  k.add("steel", T(box(4, 3, 16), { p: [0, -0.6, 0] }));
  k.add(o.mat || "alu", extrudeX(rrect(0, cy, w, h, Math.min(w, h) * 0.3), x0, x1 - 14, { bevel: 1.6 }));
  k.add(o.mat || "alu", T(latheX([[x1 - 16, 0], [x1 - 16, h * 0.46], [x1 - 10, headR], [x1, headR], [x1, headR - 1.6], [x1 - 1, headR - 2.4]], { seg: 36 }), { p: [0, cy, 0] }));
  k.add("steel", T(tubeX(headR + 0.2, headR - 2.2, x1 - 2.4, x1 + 0.4, { seg: 36 }), { p: [0, cy, 0] }));
  // амбидекстральные клавиши сзади с рифлением
  for (const s of [-1, 1]) {
    k.add("poly", T(extrudeZ([[0, 0], [9, 0], [12, 7, 2], [0, 9, 2]], 4, { bevel: 0.8 }), { p: [x0 - 8, cy - 3, s * (w / 2 - 1)] }));
    for (let i = 0; i < 3; i++) k.add("poly", T(box(0.8, 6, 1, { bevel: 0.25 }), { p: [x0 - 6 + i * 2.6, cy + 1.2, s * (w / 2 + 1.2)] }));
  }
  // винт зажима сбоку, поясок у головы, болты корпуса
  k.add("steel", T(thumbNut(4.4, 2.6, 6), { r: [0, -90, 0], p: [-1, 3.2, w / 2] }));
  k.add(o.mat || "alu", extrudeX(rrect(0, cy, w + 0.8, h + 0.8, Math.min(w, h) * 0.3 + 0.4), x1 - 22, x1 - 18, { bevel: 0.6 }));
  for (const s of [-1, 1]) for (const x of [x0 + 6, x1 - 26]) k.add("steel", T(capScrew(1.3, 0.5), { r: [s * 90, 0, 0] }), { p: [x, cy + h * 0.2, s * w / 2] });
  if (o.crenel) for (let i = 0; i < 6; i++) k.add("steel", T(T(box(1.8, 1.8, 4, { bevel: 0.4 }), { p: [x1 + 1, headR - 1.2, 0] }), { r: [i * 60 + 30, 0, 0], p: [0, cy, 0] }));
  const root = node(o.name, [k.build()]);
  const head = lampHead(ctx, headR - 2.2, x1 - 0.6, x1 - (o.turbo ? 22 : 11), cy, o);
  root.add(head.group);
  const out = { root, light: { p: [x1 + 1, cy, 0], lens: head.glow, lumens: o.lm, cd: o.cd, hot: o.hot, spill: o.spill, kelvin: o.kelvin, batt: o.batt, lensR: headR - 2.2 } };
  if (o.laser) {
    const lk = ctx.kit();
    const lz = 0, ly = cy + h / 2 + 4;
    lk.add(o.mat || "alu", extrudeX(rrect(0, ly, 12, 9, 3), x1 - 30, x1 - 6, { bevel: 1 }));
    lk.add("steel", T(tubeX(3.2, 2, x1 - 8, x1 - 4, { seg: 16 }), { p: [0, ly, lz] }));
    root.add(lk.build());
    const ll = lens(ctx, cylX(2, x1 - 5, x1 - 4.4, { seg: 14 }).translate(0, ly, lz), "laserLens");
    ll.renderOrder = 0;
    ll.material.transparent = false;
    root.add(ll);
    out.laser = { p: [x1 - 3.5, ly, lz], lens: ll };
  }
  return out;
}
var PISTOL = [
  { id: "rmr_t2", cat: "micro", name: "Trijicon RMR Type 2", desc: "Точка 3,25 MOA, самый живучий корпус", stats: { weight: 34, ergo: -1, adsTime: 10 }, build: rmrPistol },
  { id: "hs507c", cat: "micro", name: "Holosun HS507C X2", desc: "Кольцо 32 MOA + точка 2 MOA", stats: { weight: 43, ergo: -1, adsTime: 12 }, build: hs507 },
  { id: "acro_p2", cat: "micro", name: "Aimpoint ACRO P-2", desc: "Закрытый излучатель: грязь и вода не мешают", stats: { weight: 60, ergo: -2, adsTime: 14 }, build: acroP2 },
  { id: "x300u", cat: "plight", name: "SureFire X300U-B", desc: "Фонарь 1000 лм / 12 000 кд, зацеп за паз рамки", foot: [-6, 6], body: [-20, 70], stats: { weight: 116, ergo: -3 }, power: { light: 24, cells: "2 × CR123A", driver: "reg" }, build: (c) => pistolLight(c, { crenel: true, name: "x300", x0: -12, x1: 70, w: 30, h: 26, headR: 15.5, lm: 1e3, cd: 12e3, hot: 0.2, spill: 0.12, kelvin: 6400, batt: 22 }) },
  { id: "x300t", cat: "plight", name: "SureFire X300T-B Turbo", desc: "650 лм / 50 000 кд: узкий дальнобойный луч, длинная голова", foot: [-6, 6], body: [-20, 84], stats: { weight: 136, ergo: -4 }, power: { light: 26, cells: "2 × CR123A", driver: "reg" }, build: (c) => pistolLight(c, { name: "x300t", x0: -12, x1: 84, w: 30, h: 26, headR: 19, lm: 650, cd: 5e4, hot: 0.08, spill: 0.04, kelvin: 6000, batt: 26, turbo: true }) },
  { id: "tlr7a", cat: "plight", name: "Streamlight TLR-7A", desc: "Компактный фонарь 500 лм / 5000 кд", foot: [-6, 6], body: [-18, 52], stats: { weight: 71, ergo: -1 }, power: { light: 28, cells: "1 × CR123A", driver: "reg" }, build: (c) => pistolLight(c, { name: "tlr7", x0: -10, x1: 52, w: 27, h: 22, headR: 12, lm: 500, cd: 5e3, hot: 0.24, spill: 0.14, kelvin: 6500, batt: 28, mat: "poly" }) },
  { id: "tlr1hl", cat: "plight", pistolOnly: true, name: "Streamlight TLR-1 HL", desc: "1000 лм / 13 000 кд, алюминиевый корпус", foot: [-6, 6], body: [-20, 74], stats: { weight: 122, ergo: -3 }, power: { light: 24, cells: "2 × CR123A", driver: "reg" }, build: (c) => pistolLight(c, { name: "tlr1", x0: -12, x1: 74, w: 31, h: 25, headR: 15, lm: 1e3, cd: 13e3, hot: 0.19, spill: 0.11, kelvin: 5900, batt: 24 }) },
  { id: "tlr8a", cat: "plight", name: "Streamlight TLR-8A", desc: "Фонарь 500 лм + красный ЛЦУ (C / Z)", foot: [-6, 6], body: [-18, 56], stats: { weight: 83, ergo: -2, "hipSpread%": -12 }, power: { light: 28, laser: 30, cells: "1 × CR123A", driver: "reg" }, build: (c) => pistolLight(c, { name: "tlr8", x0: -10, x1: 56, w: 28, h: 23, headR: 12.5, lm: 500, cd: 6e3, laser: true, mat: "poly", batt: 25 }) }
];

// src/engine/lib/grips.js
function grip(ctx, o) {
  const k = ctx.kit();
  const a = (o.angle ?? 20) * Math.PI / 180;
  const H = o.h ?? 104;
  const sh = (y) => -Math.tan(a) * -y;
  const front = o.front.map(([f, y]) => [sh(y) + f, y]);
  const back = o.back.map(([f, y]) => [sh(y) + f, y]);
  k.add(o.mat || "poly", gripLoft(front, back, { w: o.w ?? 30, width: (t) => 0.86 + 0.14 * Math.sin(Math.PI * Math.min(1, t * 1.6)) }));
  if (o.texture !== false) {
    const tx = [];
    for (let i = 0; i < 9; i++) {
      const y = -24 - i * 8.5;
      for (const s of [-1, 1]) tx.push(T(box(16, 1.1, 1.2, { bevel: 0.3 }), { p: [sh(y) - 22, y, s * ((o.w ?? 30) / 2 * 0.9 - 0.2)], r: [0, 0, o.angle ?? 20] }));
    }
    k.add(o.mat || "poly", tx);
  }
  if (o.cap) k.add("polySoft", T(box(34, 5, (o.w ?? 30) - 4, { bevel: 2 }), { p: [sh(-H) - 18, -H - 1, 0], r: [0, 0, -4] }));
  return { root: k.build(o.name) };
}
var GRIPS = [
  {
    id: "hk_v2",
    cat: "pgrip",
    name: "HK V2",
    desc: "Эргономичная рукоять HK с упором под палец",
    fit: { iface: ["ar"] },
    stats: { weight: 80, ergo: 0 },
    build: (c) => grip(c, { name: "hk_v2", angle: 18, front: [[2, 0], [0, -14], [5, -26], [0, -36], [-3, -70], [-2, -102]], back: [[-34, 6], [-44, 2], [-42, -20], [-36, -48], [-38, -80], [-36, -104]], cap: true })
  },
  {
    id: "moe_grip",
    cat: "pgrip",
    name: "Magpul MOE+",
    desc: "Прорезиненная, с отсеком в торце",
    fit: { iface: ["ar"] },
    stats: { weight: 75, ergo: 2 },
    build: (c) => grip(c, { name: "moe", angle: 22, mat: "polySoft", front: [[1, 0], [0, -20], [2, -40], [-1, -70], [0, -100]], back: [[-32, 5], [-40, 0], [-38, -30], [-35, -60], [-36, -102]], cap: true })
  },
  {
    id: "bcm_mod3",
    cat: "pgrip",
    name: "BCM Gunfighter Mod 3",
    desc: "Вертикальнее, удобна при коротком прикладе",
    fit: { iface: ["ar"] },
    stats: { weight: 70, ergo: 3 },
    build: (c) => grip(c, { name: "bcm", angle: 12, front: [[1, 0], [0, -30], [1, -60], [0, -96]], back: [[-30, 4], [-38, 0], [-35, -40], [-34, -96]], texture: true })
  }
];

// src/engine/lib/index.js
// Единая библиотека модулей для всех стволов. Совместимость решают категория, планка и fit/only:
// прицелы, фонари, ЛЦУ и рукоятки ставятся на любую подходящую планку, дульные — по резьбе.
var LIB = [...OPTICS, ...DOVETAIL, ...MUZZLES, ...MUZZLES2, ...TACTICAL, ...PISTOL, ...GRIPS];

// src/weapons/shared.js
// Общие детали для описаний оружия: магазины, антабки, «сухари» для прикладов.

// Коробчатый магазин с изгибом радиуса R (Infinity/0 — прямой). Начало координат — передний верх корпуса,
// корпус уходит назад (−x) на глубину d0 и вниз по дуге на длину len. Губки поднимаются на lipH над нулём.
function boxMag(ctx, o) {
  const { T: T2, extrudeZ: exZ, box: bx, wire: wr, node: nd } = ctx.G;
  const k = ctx.kit(), rk = ctx.kit();
  const R4 = o.R && isFinite(o.R) ? o.R : 1e5, L = o.len, D0 = o.d0, D1 = o.d1 ?? o.d0, W = o.w;
  const lipH = o.lipH ?? 10;
  const cx = -D0 / 2 + R4, n = 18, back = [], front = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n * L, a = Math.PI + s / R4, d = D0 + (D1 - D0) * (i / n);
    const px = cx + Math.cos(a) * R4, py = Math.sin(a) * R4, nx = Math.cos(a), ny = Math.sin(a);
    back.push([px + nx * d / 2, py + ny * d / 2]);
    front.push([px - nx * d / 2, py - ny * d / 2]);
  }
  const sx = -front[0][0];
  const P = [[front[0][0], lipH], [back[0][0], lipH], ...back.slice(1), ...front.slice().reverse()].map(([x, y]) => [x + sx, y, 0]);
  k.add(o.mat, exZ(P, W, { bevel: o.bevel ?? 1 }));
  const endA = Math.PI + L / R4;
  const ex = cx + Math.cos(endA) * R4 + sx, ey = Math.sin(endA) * R4;
  const tx = -Math.sin(endA), ty = Math.cos(endA);
  if (o.ribs) {
    for (let j = 1; j < 3; j++) {
      const pts = [];
      for (let i = 1; i < n; i++) {
        const s = i / n * L, a = Math.PI + s / R4, d = D0 + (D1 - D0) * (i / n), t = j / 3 - 0.5;
        pts.push([cx + Math.cos(a) * (R4 + t * d) + sx, Math.sin(a) * (R4 + t * d)]);
      }
      for (const s of [-1, 1]) k.add(o.ribMat || o.mat, wr(pts.map((p) => [p[0], p[1], s * (W / 2 + 0.1)]), o.ribR ?? 1, { n: 40, seg: 6 }));
    }
  }
  if (o.window) for (const s of [-1, 1]) k.add("lensBlack", T2(bx(5, L * 0.55, 1, { bevel: 0.4 }), { p: [-D0 * 0.72, -L * 0.45, s * (W / 2 + 0.05)] }));
  // затыльник-крышка
  const pl = o.plateH ?? 5;
  k.add(o.plate || o.mat, T2(bx(D1 + (o.plateOver ?? 5), pl, W + (o.plateW ?? 2.5), { bevel: Math.min(1.6, pl * 0.3) }), { p: [ex + tx * pl * 0.4, ey + ty * pl * 0.4, 0], r: [0, 0, endA * 57.3] }));
  if (o.catchX != null) k.add(o.mat, T2(bx(5, 3.2, W - 4), { p: [o.catchX, o.catchY ?? -6, 0] }));
  ctx.C.feedLips(k, o.lipMat || o.mat, -D0 + (o.lipX0 ?? 4), -D0 + (o.lipX1 ?? D0 * 0.62), lipH, W / 2, { rise: o.lipRise ?? 3, curl: o.lipCurl ?? 2.4 });
  const cr = ctx.C.CAL[o.cal];
  const dx = (cr?.rim ?? 10) * 0.42;
  ctx.C.cartridge(rk, o.cal, { p: [-D0 + 2.5, lipH + 1.5, -dx * 0.5], r: [0, 0, o.roundTilt ?? 2] });
  ctx.C.cartridge(rk, o.cal, { p: [-D0 + 2.5, lipH + 1.5 - dx * 1.05, dx * 0.5], r: [0, 0, o.roundTilt ?? 2] });
  const rounds = rk.build("rounds");
  return { root: nd("mag", [k.build(), rounds]), mag: { cap: o.cap, rounds } };
}
// Барабан под коробчатой горловиной (горловина — boxMag укороченной длины).
function drumMag(ctx, o) {
  const { T: T2, cylZ: cZ, box: bx, node: nd } = ctx.G;
  const k = ctx.kit();
  const neck = boxMag(ctx, { ...o, len: o.neck, ribs: false, window: false, plateH: 1 });
  const [cx, cy, r, w] = o.drum;
  for (const s of [-1, 1]) {
    k.add(o.mat, T2(cZ(r, s < 0 ? -w / 2 : w * 0.08, s < 0 ? -w * 0.08 : w / 2, { c: 4, seg: 48 }), { p: [cx, cy, 0] }));
    for (let i = 0; i < 10; i++) k.add(o.mat, T2(bx(2.2, r * 0.62, 1.4, { bevel: 0.5 }), { p: [cx, cy, s * (w / 2 + 0.3)], r: [0, 0, i * 36] }).translate(0, 0, 0));
  }
  k.add(o.ringMat || "steel", T2(cZ(r - 2, -w * 0.1, w * 0.1, { seg: 48 }), { p: [cx, cy, 0] }));
  k.add("steel", T2(ctx.C.knob(r * 0.24, 5, 16), { r: [0, -90, 0], p: [cx, cy, w / 2 + 4] }));
  return { root: nd("drum", [neck.root, k.build()]), mag: { cap: o.cap, rounds: neck.mag.rounds } };
}
// Антабка: скоба на двух ушках.
function slingLoop(ctx, k, mat, p, o = {}) {
  const { T: T2, box: bx, wire: wr } = ctx.G;
  const w = o.w ?? 22, h = o.h ?? 12, side = o.side ?? 1;
  k.add(mat, T2(bx(8, 4, 5, { bevel: 1 }), { p: [p[0], p[1], p[2]] }));
  k.add("steelWorn", wr([[p[0] - w / 2, p[1], p[2] + side * 2], [p[0] - w / 2, p[1] + side * 0, p[2] + side * h * 0.6], [p[0], p[1], p[2] + side * h], [p[0] + w / 2, p[1], p[2] + side * h * 0.6], [p[0] + w / 2, p[1], p[2] + side * 2]], 1.4, { n: 30 }));
}


export { Assembler, CAL, D2R, DEG, DOVETAIL, GRIPS, Kit, LIB, MUZZLES, MUZZLES2, OPTICS, PICA, PISTOL, T, TACTICAL, WEAR_GLSL, __defProp, __export, _e, _m, _m2, _q, _s, _v, _v2, a2, acog, acroBody, acroP2, addWear, afg, box, boxLaser, boxMag, brake, bulletGeo, bulletPts, cantOptic, capScrew, cartridge, caseGeo, caseProfile, circle, clampBody, common_exports, compm4, createMaterials, crimpStar, crossBolt, cylX, cylY, cylZ, dbal, dialZ, dovetailClamp, dovetailLever, dppBody, drumMag, dtk3, dtk4m, exps3, extrudeX, extrudeY, extrudeZ, faceHoles, faceTicks, fbm, feedLips, finish, fixUV, flatsX, flipCap, flipWinding, flow556k, flutesX, geo_exports, grip, gripLoft, handstop, harris, hashMarks, hexX, hollowLathe, hs507, hs507Body, hs510c, kag, klesch, knob, kobra, lampFace, lampHead, laserBox, latheMod, latheX, lens, lensDisc, linear, loftPath, loftX, loftY, lpvo, mag1x39, magnifier, makeCtx, makeTextures, mbusFront, mbusRear, merge, microBase, mirrorZ, mlokHoles, modlite, mount, mro, mvg, node, normalFrom, nt4, okp7, omega36m, optTurret, path, picaSection, picatinny, pin, pistolLight, pk120, place, posp, pso1, pvs14, qdLever, railMount, rein, reverse, ringGrooves, rmrBody, rmrOffset, rmrPistol, rmrRiser, rng2, rotexV, roughFrom, rrect, scopeBody, scopeRings, scout, screwHead, sectorRing, shape, shotHead, shotHull, sideLoft, sideMount, slingLoop, slot, slotOn, sniperScope, socom, sphere, spiral762, spiralBody, spring, superEllipse, t2, thumbNut, tlr1, toRoot, toTex, tripleTap, tubeX, turret, valueNoise, vgrip, warcomp, wire, wolverine, z0Illum };
