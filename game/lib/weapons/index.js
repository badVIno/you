/* SIGNUM — библиотека моделей оружия (общая для лобби, оружейной и карт).
   Модели собираются тем же движком, что и страницы-полигоны game/weapons/*.html
   (engine.js и <id>.js генерирует game/tools/build_weapons.mjs).

   buildWeapon(id, cfg?, opts?)      → WeaponBuild (полная модель, общие материалы)
   buildWeaponLite(id, cfg?, opts?)  → WeaponBuild, root — один Mesh ≤ maxTris (для ботов)
   defaultConfig(id), WEAPON_IDS

   Система координат root: метры, ствол смотрит в -Z, верх +Y, правая сторона +X.
   Точки anchors заданы в системе root. */
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { createMaterials, makeCtx, Assembler, LIB, toRoot } from './engine.js';
import { MeshoptSimplifier } from '../vendor/meshopt_simplifier.js';
import { def as ak74 } from './ak74.js';
import { def as akm } from './akm.js';
import { def as m416 } from './m416.js';
import { def as scar } from './scar.js';
import { def as svd } from './svd.js';
import { def as m870 } from './m870.js';
import { def as mp5a3 } from './mp5a3.js';
import { def as glock18c } from './glock18c.js';

const DEFS = { ak74, akm, m416, scar, svd, m870, mp5a3, glock18c };
export const WEAPON_IDS = Object.keys(DEFS);

export function defaultConfig(id) {
  const d = DEFS[id];
  return d ? JSON.parse(JSON.stringify(d.defaults)) : null;
}

let MATS = null;
function mats(opts) {
  if (!MATS) MATS = createMaterials(opts.envMap ?? null);
  return MATS;
}

/* Где искать ладонь правой руки: по установленной рукояти (от точки крепления) или
   по встроенной (детали/основание + высота ладони + ожидаемая x), мм в системе оружия. */
const GRIP = {
  ak74: { mount: 'grip', part: 'pgrip' },
  akm: { mount: 'grip', part: 'pgrip' },
  m416: { mount: 'grip', part: 'pgrip' },
  scar: { mount: 'grip', part: 'pgrip' },
  svd: { part: 'stock', y: -62, x: -290 },
  m870: { part: 'stock', y: -34, x: -232 },
  mp5a3: { part: 'trigger', y: -66, x: -198 },
  glock18c: { part: null, y: -56, x: -62 }
};
/* Цевьё: x ладони левой руки (если нет передней рукояти). */
const SUPPORT_X = { ak74: 165, akm: 165, m416: 175, scar: 135, svd: 245, m870: 165, mp5a3: 105 };

const MM = new THREE.Matrix4().makeRotationY(Math.PI / 2).multiply(new THREE.Matrix4().makeScale(1e-3, 1e-3, 1e-3));
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _ray = new THREE.Raycaster();

function meshesOf(obj, skip) {
  const out = [];
  obj.traverseVisible((o) => {
    if (!o.isMesh || (skip && skip.has(o))) return;
    const m = o.material;
    if (m && (m.transparent || m.colorWrite === false)) return;
    out.push(o);
  });
  return out;
}

/* Пересечения луча с деталями с обеих сторон граней (материалы общие — сторону возвращаем). */
function hits(meshes, origin, dir) {
  const saved = meshes.map((m) => m.material.side);
  for (const m of meshes) m.material.side = THREE.DoubleSide;
  _ray.set(origin, dir);
  _ray.near = 0; _ray.far = 5000;
  const r = _ray.intersectObjects(meshes, false);
  meshes.forEach((m, i) => { m.material.side = saved[i]; });
  return r.map((h) => h.point);
}

/* Сплошные отрезки вдоль X на высоте y (z = 0). */
function spansX(meshes, y) {
  const xs = hits(meshes, V(-3000, y, 0.01), V(1, 0, 0)).map((p) => p.x).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > 4) out.push([xs[i], xs[i + 1]]);
  return out;
}
const bottomAt = (meshes, x, z = 0) => {
  const p = hits(meshes, V(x, -3000, z), V(0, 1, 0));
  return p.length ? p[0].y : null;
};

function sightOf(asm) {
  const root = asm.root, base = asm.base;
  const push = (obj, s, kind) => {
    const m = toRoot(s.node || obj, root);
    return { eye: V(s.x0 ?? 0, s.y, s.z || 0).applyMatrix4(m), dir: V(1, 0, 0).transformDirection(m), eyeRelief: s.eyeRelief, kind };
  };
  const opt = asm.installed.get('optic');
  if (opt?.info?.sight) return push(opt.obj, opt.info.sight, 'optic');
  for (const it of asm.installed.values()) if (it.info?.sight && !it.info.sight.magnifier) return push(it.obj, it.info.sight, 'optic');
  let rear = null, front = null, rearIt = null;
  const pt = (it, k) => (it.info?.irons?.[k] ? V(...it.info.irons[k]).applyMatrix4(toRoot(it.obj, root)) : null);
  for (const it of asm.installed.values()) {
    if (!rear && (rear = pt(it, 'rear'))) rearIt = it;
    front = front || pt(it, 'front');
  }
  if (!rear && base.irons?.rear) rear = V(...base.irons.rear);
  if (!front && base.irons?.front) front = V(...base.irons.front);
  if (rear) {
    const irons = rearIt ? rearIt.info.irons : base.irons || {};
    const dir = front ? front.clone().sub(rear).normalize() : V(1, 0, 0);
    return { eye: rear, dir, kind: 'irons', type: irons.type || (rearIt ? 'aperture' : 'notch'), eyeDist: irons.eye };
  }
  const top = new THREE.Box3().setFromObject(base.root).max.y;
  return { eye: V(0, top + 6, 0), dir: V(1, 0, 0), kind: 'bore' };
}

function computeRig(asm) {
  const { def, base, root } = asm;
  root.updateMatrixWorld(true);
  const magIt = asm.installed.get('mag');
  const magSkip = new Set();
  if (magIt && def.feed !== 'tube') magIt.obj.traverse((o) => o.isMesh && magSkip.add(o));
  const all = meshesOf(root, magSkip);
  const mountPos = (id) => { const m = asm.mounts.get(id); return m ? V().setFromMatrixPosition(m.matrixWorld) : null; };

  // правая рука
  const gs = GRIP[def.id] || {};
  let gy = gs.y, gx = gs.x;
  const gm = gs.mount && mountPos(gs.mount);
  if (gm) { gy = gm.y - 45; gx = gm.x - 34; }
  const gObj = gs.part ? asm.installed.get(gs.part)?.obj : base.root;
  let grip = V(gx ?? -150, gy ?? -60, 0);
  if (gObj) {
    const sp = spansX(meshesOf(gObj, magSkip), grip.y);
    let best = null;
    for (const s of sp) { const c = (s[0] + s[1]) / 2; if (s[1] - s[0] < 90 && (!best || Math.abs(c - grip.x) < Math.abs(best - grip.x))) best = c; }
    if (best != null && Math.abs(best - grip.x) < 45) grip.x = best;
  }

  // левая рука: передняя рукоять, иначе низ цевья; у пистолета — поверх правой
  let support;
  const fg = [...asm.installed.values()].find((it) => it.part.cat === 'foregrip');
  if (fg) {
    const b = new THREE.Box3().setFromObject(fg.obj);
    support = V((b.min.x + b.max.x) / 2, Math.max(b.min.y + 12, b.max.y - 40), 0);
  } else if (def.id === 'glock18c') {
    support = V(grip.x + 6, grip.y - 6, -30);
  } else {
    const sx = SUPPORT_X[def.id] ?? 150;
    support = V(sx, bottomAt(all, sx) ?? -30, 0);
  }

  // дульный срез
  const mz = asm.mounts.get('muzzle');
  const muzzle = mz ? mz.localToWorld(V(asm.info('muzzle')?.muzzle?.x || 0, 0, 0)) : V(...(base.muzzle || [400, 0, 0]));

  // глаз при прицеливании (как sightPose в app.js полигона)
  const s = sightOf(asm);
  let ex = base.eyeX ?? -240;
  if (s.eyeRelief) ex = s.eye.x - s.eyeRelief;
  else if (s.kind === 'irons') ex = s.type === 'aperture' ? s.eye.x - (s.eyeDist ?? 75) : Math.min(ex, s.eye.x - 220);
  else ex = Math.min(ex, s.eye.x - 60);
  const eye = s.eye.clone().addScaledVector(s.dir, (ex - s.eye.x) / (s.dir.x || 1));

  // затыльник: задний край, середина по высоте
  let minX = Infinity;
  const v = V();
  for (const o of all) {
    const a = o.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) { v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld); if (v.x < minX) minX = v.x; }
  }
  const slide = def.id === 'glock18c' && asm.installed.get('slide');
  if (slide) {
    const b = new THREE.Box3().setFromObject(slide.obj);
    minX = b.min.x;
  }
  const bx = minX + 6;
  const ys = hits(slide ? meshesOf(slide.obj) : all, V(bx, -3000, 0.01), V(0, 1, 0)).map((p) => p.y);
  const butt = V(minX, ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0, 0);

  const mw = mountPos('magwell');
  const magwell = mw || V(-40, bottomAt(all, -40) ?? -20, 0);

  return { grip, support, muzzle, eye, butt, magwell, sight: s.kind };
}

function statsOf(asm) {
  const s = asm.stats(), def = asm.def;
  const pel = asm.installed.get('ammo')?.part;
  const pellets = asm.info('ammo')?.ammo?.pellets ?? pel?.ammo?.pellets ?? pel?.pellets ?? 1;
  return {
    rpm: s.rpm, magCap: asm.info('mag')?.mag?.cap || s.mag || def.base.mag, velocity: s.velocity, range: s.range,
    recoilV: s.recoilV, recoilH: s.recoilH, moa: s.moa, modes: def.modes.filter((m) => m !== 'safe'),
    cal: def.caliber, pellets, weightKg: Math.round(s.weight) / 1000, adsTime: s.adsTime
  };
}

function countInfo(root) {
  let meshes = 0, tris = 0;
  root.traverseVisible((o) => {
    if (!o.isMesh) return;
    meshes++;
    const g = o.geometry;
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return { meshes, tris: Math.round(tris) };
}

/* userData деталей может ссылаться на объекты сцены — клону нужен только сериализуемый остаток. */
function cleanUserData(root) {
  root.traverse((o) => {
    const u = o.userData, out = {};
    for (const k in u) {
      const x = u[k];
      if (x == null || typeof x !== 'object') out[k] = x;
      else { try { out[k] = JSON.parse(JSON.stringify(x)); } catch (e) { /* ссылка на Object3D */ } }
    }
    o.userData = out;
  });
}

const pathTo = (root, node) => {
  const p = [];
  for (let o = node; o && o !== root; o = o.parent) p.unshift(o.parent.children.indexOf(o));
  return p;
};
const byPath = (root, p) => p.reduce((o, i) => (o ? o.children[i] : null), root);

const FULL = new Map();
const keyOf = (id, cfg) => id + '|' + JSON.stringify(cfg ?? null);

function buildTemplate(id, cfg, opts) {
  const def = DEFS[id];
  if (!def) throw new Error('Неизвестное оружие: ' + id);
  const t0 = performance.now();
  const asm = new Assembler(def, LIB, makeCtx(mats(opts)));
  let applied;
  try { applied = asm.apply(cfg || def.defaults); } catch (e) {
    console.warn('[weapons] конфигурация не применилась, беру штатную', id, e);
    applied = asm.apply(def.defaults);
  }
  const rig = computeRig(asm);
  const root = new THREE.Group();
  root.name = 'weapon:' + id;
  const inner = asm.root;
  inner.scale.setScalar(1e-3);
  inner.rotation.y = Math.PI / 2;
  root.add(inner);
  const tr = (p) => p.clone().applyMatrix4(MM);
  const anchors = { grip: tr(rig.grip), support: tr(rig.support), muzzle: tr(rig.muzzle), eye: tr(rig.eye), butt: tr(rig.butt), magwell: tr(rig.magwell) };
  const magObj = def.feed === 'tube' ? null : asm.installed.get('mag')?.obj || null;
  cleanUserData(root);
  root.updateMatrixWorld(true);
  return {
    id, def, cfg: applied, root, anchors, sight: rig.sight,
    sightHeight: rig.eye.y / 1000,
    magPath: magObj ? pathTo(root, magObj) : null,
    stats: statsOf(asm), info: countInfo(root), ms: Math.round(performance.now() - t0)
  };
}

function getTemplate(id, cfg, opts) {
  const k = keyOf(id, cfg);
  let t = FULL.get(k);
  if (!t) { t = buildTemplate(id, cfg, opts); FULL.set(k, t); }
  return t;
}

const cloneAnchors = (a) => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.clone()]));

export async function buildWeapon(id, cfg = null, opts = {}) {
  const t = getTemplate(id, cfg, opts);
  const root = t.root.clone(true);
  return {
    id, def: t.def, cfg: JSON.parse(JSON.stringify(t.cfg)), root, anchors: cloneAnchors(t.anchors),
    sightHeight: t.sightHeight, magazine: t.magPath ? byPath(root, t.magPath) : null,
    stats: { ...t.stats, modes: [...t.stats.modes] }, info: { ...t.info }, buildMs: t.ms
  };
}

/* ---------- облегчённая модель ---------- */

let LITE_MAT = null;
const liteMat = () => LITE_MAT || (LITE_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.3, roughness: 0.62, name: 'weaponLite' }));
const LITE = new Map();
const texAvg = new WeakMap();

function avgColor(tex) {
  const img = tex && tex.image;
  if (!img) return null;
  if (texAvg.has(img)) return texAvg.get(img);
  let c = null;
  try {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 16;
    const g = cv.getContext('2d');
    g.drawImage(img, 0, 0, 16, 16);
    const d = g.getImageData(0, 0, 16, 16).data;
    let r = 0, gg = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4;
    if (r + gg + b > 0) c = new THREE.Color().setRGB(r / n / 255, gg / n / 255, b / n / 255, THREE.SRGBColorSpace);
  } catch (e) { c = null; }
  texAvg.set(img, c);
  return c;
}

function partColor(m) {
  const c = (m.color ? m.color.clone() : new THREE.Color(0.2, 0.2, 0.2));
  if (m.map) { const a = avgColor(m.map); c.multiply(a || new THREE.Color(0.35, 0.22, 0.12)); }
  if (m.transparent) c.setRGB(0.03, 0.035, 0.04);
  if (m.emissive && m.emissiveIntensity > 0.5) c.lerp(m.emissive, 0.5);
  return c;
}

function mergeLite(t, maxTris) {
  const root = t.root;
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const P = [], C = [], I = [];
  const weld = new Map();
  const m4 = new THREE.Matrix4(), v = V();
  root.traverseVisible((o) => {
    if (!o.isMesh || o.userData.reticle) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!mat || mat.colorWrite === false || (mat.transparent && mat.opacity < 0.05)) return;
    const col = partColor(mat);
    const cr = Math.round(col.r * 255), cg = Math.round(col.g * 255), cb = Math.round(col.b * 255);
    m4.multiplyMatrices(inv, o.matrixWorld);
    const g = o.geometry, pos = g.attributes.position;
    const local = new Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m4);
      const key = Math.round(v.x * 1e4) + ',' + Math.round(v.y * 1e4) + ',' + Math.round(v.z * 1e4) + ',' + cr + ',' + cg + ',' + cb;
      let idx = weld.get(key);
      if (idx === undefined) { idx = P.length / 3; weld.set(key, idx); P.push(v.x, v.y, v.z); C.push(col.r, col.g, col.b); }
      local[i] = idx;
    }
    const det = m4.determinant() < 0;
    const push = (a, b, c) => { if (a !== b && b !== c && a !== c) det ? I.push(a, c, b) : I.push(a, b, c); };
    if (g.index) { const ix = g.index.array; for (let i = 0; i + 2 < ix.length; i += 3) push(local[ix[i]], local[ix[i + 1]], local[ix[i + 2]]); }
    else for (let i = 0; i + 2 < pos.count; i += 3) push(local[i], local[i + 1], local[i + 2]);
  });
  const pos = new Float32Array(P), col = new Float32Array(C);
  let idx = new Uint32Array(I);
  const target = Math.floor(maxTris) * 3;
  if (idx.length > target) {
    const S = MeshoptSimplifier;
    let best = idx;
    for (const err of [0.002, 0.004, 0.008, 0.015, 0.03, 0.06]) {
      const flags = err <= 0.004 ? ['Prune'] : [];
      const [res] = S.simplifyWithAttributes(idx, pos, 3, col, 3, [0.6, 0.6, 0.6], null, target, err, flags);
      best = res;
      if (res.length <= target) break;
    }
    if (best.length > target) best = S.simplifySloppy(best, pos, 3, null, target, 0.2)[0];
    idx = best;
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g = toCreasedNormals(g, THREE.MathUtils.degToRad(38));
  // цвет в 8 бит: геометрия не индексирована, экономим память
  const c = g.attributes.color.array, c8 = new Uint8Array(c.length);
  for (let i = 0; i < c.length; i++) c8[i] = Math.round(Math.min(1, c[i]) * 255);
  g.setAttribute('color', new THREE.BufferAttribute(c8, 3, true));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

export async function buildWeaponLite(id, cfg = null, opts = {}) {
  const maxTris = opts.maxTris ?? 8000;
  const k = keyOf(id, cfg) + '|' + maxTris;
  let L = LITE.get(k);
  if (!L) {
    await MeshoptSimplifier.ready;
    const t = getTemplate(id, cfg, opts);
    const t0 = performance.now();
    const geom = mergeLite(t, maxTris);
    L = { t, geom, ms: Math.round(performance.now() - t0) };
    LITE.set(k, L);
  }
  const t = L.t;
  const root = new THREE.Mesh(L.geom, opts.material || liteMat());
  root.name = 'weaponLite:' + id;
  root.castShadow = true;
  return {
    id, def: t.def, cfg: JSON.parse(JSON.stringify(t.cfg)), root, anchors: cloneAnchors(t.anchors),
    sightHeight: t.sightHeight, magazine: null,
    stats: { ...t.stats, modes: [...t.stats.modes] }, info: { meshes: 1, tris: L.geom.attributes.position.count / 3 }, buildMs: L.ms
  };
}
