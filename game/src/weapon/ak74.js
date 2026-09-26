
/* --- процедурная геометрия АК-74: ядро + модули деталей --- */
const __AKM = {};
function __akdef(name, fn) { const module = { exports: {} }; fn(module, module.exports); __AKM[name] = module.exports; }
__akdef("geom", function (module, exports) {
/* ============================================================================
   AKGeom — компактное ядро процедурной геометрии (без внешних зависимостей).
   Выдаёт «суп» треугольников {p:[x,y,z...], n:[nx,ny,nz...]}.
   Работает и в Node (экспорт/рендер-проверка), и в браузере.
   ========================================================================== */
(function (root, factory) {
  const G = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = G;
  else root.AKGeom = G;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TAU = Math.PI * 2;
  const EPS = 1e-9;

  /* ---------------------------------------------------------------- базовое */
  const geo = () => ({ p: [], n: [] });

  function tri(g, A, B, C, nA, nB, nC) {
    g.p.push(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2]);
    g.n.push(nA[0], nA[1], nA[2], nB[0], nB[1], nB[2], nC[0], nC[1], nC[2]);
  }
  function quad(g, A, B, C, D, nA, nB, nC, nD) {
    tri(g, A, B, C, nA, nB, nC);
    tri(g, A, C, D, nA, nC, nD);
  }
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  function norm(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }
  const faceN = (A, B, C) => norm(cross(sub(B, A), sub(C, A)));

  /* треугольник с плоской нормалью */
  function triFlat(g, A, B, C) { const n = faceN(A, B, C); tri(g, A, B, C, n, n, n); }
  function quadFlat(g, A, B, C, D) { triFlat(g, A, B, C); triFlat(g, A, C, D); }

  /* убрать вырожденные треугольники и починить нормали */
  function clean(g) {
    const out = geo(), p = g.p, n = g.n;
    for (let i = 0; i < p.length; i += 9) {
      const A = [p[i], p[i + 1], p[i + 2]], B = [p[i + 3], p[i + 4], p[i + 5]], C = [p[i + 6], p[i + 7], p[i + 8]];
      if (!isFinite(A[0] + A[1] + A[2] + B[0] + B[1] + B[2] + C[0] + C[1] + C[2])) continue;
      const c = cross(sub(B, A), sub(C, A));
      const a2 = Math.hypot(c[0], c[1], c[2]);
      if (!(a2 > 1e-6)) continue;
      const fn = [c[0] / a2, c[1] / a2, c[2] / a2];
      out.p.push(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2]);
      for (let k = 0; k < 3; k++) {
        const o = i + k * 3, l = Math.hypot(n[o], n[o + 1], n[o + 2]);
        if (!(l > 1e-4)) out.n.push(fn[0], fn[1], fn[2]);
        else out.n.push(n[o] / l, n[o + 1] / l, n[o + 2] / l);
      }
    }
    return out;
  }

  function merge(list) {
    const out = geo();
    for (const g of list) {
      if (!g) continue;
      const gp = g.p, gn = g.n;
      for (let i = 0; i < gp.length; i++) out.p.push(gp[i]);
      for (let i = 0; i < gn.length; i++) out.n.push(gn[i]);
    }
    return out;
  }

  /* ------------------------------------------------------------ трансформы */
  function transform(g, m) {                       // m — 4x4, column-major (как в three)
    const p = g.p, n = g.n;
    // нормальная матрица = верхняя 3x3 без переноса (масштаб у нас однородный)
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2];
      p[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
      p[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      p[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      const a = n[i], b = n[i + 1], c = n[i + 2];
      let nx = m[0] * a + m[4] * b + m[8] * c;
      let ny = m[1] * a + m[5] * b + m[9] * c;
      let nz = m[2] * a + m[6] * b + m[10] * c;
      const l = Math.hypot(nx, ny, nz) || 1;
      n[i] = nx / l; n[i + 1] = ny / l; n[i + 2] = nz / l;
    }
    return g;
  }
  const mIdent = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  function mMul(a, b) {                            // a*b
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  }
  const mTrans = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
  const mScale = (x, y, z) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
  const mRotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; };
  const mRotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; };
  const mRotZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; };
  /* базис из трёх ортов + начало координат */
  const mBasis = (e1, e2, e3, o) => [e1[0], e1[1], e1[2], 0, e2[0], e2[1], e2[2], 0, e3[0], e3[1], e3[2], 0, o[0], o[1], o[2], 1];

  const tr = (g, x, y, z) => transform(g, mTrans(x, y, z));
  const rx = (g, a) => transform(g, mRotX(a));
  const ry = (g, a) => transform(g, mRotY(a));
  const rz = (g, a) => transform(g, mRotZ(a));

  /* зеркало по X с исправлением обхода треугольников */
  function mirrorX(src) {
    const g = { p: src.p.slice(), n: src.n.slice() };
    for (let i = 0; i < g.p.length; i += 3) { g.p[i] = -g.p[i]; g.n[i] = -g.n[i]; }
    for (let i = 0; i < g.p.length; i += 9) {       // поменять местами 2-ю и 3-ю вершины
      for (let k = 0; k < 3; k++) {
        let t = g.p[i + 3 + k]; g.p[i + 3 + k] = g.p[i + 6 + k]; g.p[i + 6 + k] = t;
        t = g.n[i + 3 + k]; g.n[i + 3 + k] = g.n[i + 6 + k]; g.n[i + 6 + k] = t;
      }
    }
    return g;
  }

  /* ------------------------------------------------------- 2D: контуры */
  /* pts: [[x,y] | [x,y,r]] — замкнутый многоугольник; r — радиус скругления угла.
     Возврат: [{x,y,s}] где s=true — гладкая стыковка с предыдущим ребром. */
  function round(pts, defR) {
    const n = pts.length, out = [];
    for (let i = 0; i < n; i++) {
      const c = pts[i], p0 = pts[(i - 1 + n) % n], p1 = pts[(i + 1) % n];
      const r = c.length > 2 ? c[2] : (defR || 0);
      const d0 = [p0[0] - c[0], p0[1] - c[1]], d1 = [p1[0] - c[0], p1[1] - c[1]];
      const l0 = Math.hypot(d0[0], d0[1]), l1 = Math.hypot(d1[0], d1[1]);
      if (r <= 1e-6 || l0 < EPS || l1 < EPS) { out.push({ x: c[0], y: c[1], s: false }); continue; }
      const rr = Math.min(r, l0 * 0.499, l1 * 0.499);
      const u0 = [d0[0] / l0, d0[1] / l0], u1 = [d1[0] / l1, d1[1] / l1];
      const A = [c[0] + u0[0] * rr, c[1] + u0[1] * rr];
      const B = [c[0] + u1[0] * rr, c[1] + u1[1] * rr];
      const dot = Math.max(-1, Math.min(1, u0[0] * u1[0] + u0[1] * u1[1]));
      const segs = Math.max(2, Math.min(14, Math.ceil((Math.PI - Math.acos(dot)) / 0.26)));
      for (let k = 0; k <= segs; k++) {
        const t = k / segs, it = 1 - t;
        out.push({
          x: it * it * A[0] + 2 * it * t * c[0] + t * t * B[0],
          y: it * it * A[1] + 2 * it * t * c[1] + t * t * B[1],
          s: true
        });
      }
    }
    return out;
  }
  const rect = (x0, y0, x1, y1, r) => round([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], r || 0);
  function circle(cx, cy, r, seg) {
    seg = seg || Math.max(16, Math.ceil(r * 6));
    const o = [];
    for (let i = 0; i < seg; i++) { const a = i / seg * TAU; o.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, s: true }); }
    return o;
  }
  function ellipse(cx, cy, rx0, ry0, seg) {
    seg = seg || 40; const o = [];
    for (let i = 0; i < seg; i++) { const a = i / seg * TAU; o.push({ x: cx + Math.cos(a) * rx0, y: cy + Math.sin(a) * ry0, s: true }); }
    return o;
  }
  const area2 = (c) => { let a = 0; for (let i = 0, n = c.length; i < n; i++) { const p = c[i], q = c[(i + 1) % n]; a += p.x * q.y - q.x * p.y; } return a / 2; };
  const ccw = (c) => (area2(c) < 0 ? c.slice().reverse() : c);
  const cw = (c) => (area2(c) > 0 ? c.slice().reverse() : c);

  /* --------------------------------------------------- триангуляция (ear) */
  function bridgeHoles(outer, holes) {
    let poly = outer.map((p, i) => ({ x: p.x, y: p.y, s: p.s }));
    const hs = holes.slice().sort((a, b) => hMaxX(b) - hMaxX(a));
    for (const h of hs) poly = bridgeOne(poly, h);
    return poly;
  }
  function hMaxX(h) { let m = -Infinity; for (const p of h) m = Math.max(m, p.x); return m; }
  function bridgeOne(poly, hole) {
    let hi = 0;
    for (let i = 1; i < hole.length; i++) if (hole[i].x > hole[hi].x) hi = i;
    const H = hole[hi];
    let best = -1, bestD = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const P = poly[i];
      const d = (P.x - H.x) * (P.x - H.x) + (P.y - H.y) * (P.y - H.y);
      if (d >= bestD) continue;
      if (!visible(poly, hole, H, P, i, hi)) continue;
      best = i; bestD = d;
    }
    if (best < 0) best = 0;
    const out = poly.slice(0, best + 1);
    for (let k = 0; k <= hole.length; k++) out.push(hole[(hi + k) % hole.length]);
    out.push(poly[best]);
    return out.concat(poly.slice(best + 1));
  }
  function visible(poly, hole, A, B, ai, bi) {
    const test = (arr) => {
      for (let i = 0, n = arr.length; i < n; i++) {
        const P = arr[i], Q = arr[(i + 1) % n];
        if (segInt(A, B, P, Q)) return false;
      }
      return true;
    };
    return test(poly) && test(hole);
  }
  function segInt(a, b, c, d) {
    const sameP = (p, q) => Math.abs(p.x - q.x) < 1e-7 && Math.abs(p.y - q.y) < 1e-7;
    if (sameP(a, c) || sameP(a, d) || sameP(b, c) || sameP(b, d)) return false;
    const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
    return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
  }
  /* ear clipping для простого многоугольника (CCW) → массив индексов */
  function earcut(poly) {
    const n = poly.length;
    const idx = []; for (let i = 0; i < n; i++) idx.push(i);
    const out = [];
    let guard = 0;
    const A = (i, j, k) => {
      const p = poly[i], q = poly[j], r = poly[k];
      return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    };
    const inTri = (a, b, c, p) => {
      const d1 = (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
      const d2 = (p.x - c.x) * (b.y - c.y) - (b.x - c.x) * (p.y - c.y);
      const d3 = (p.x - a.x) * (c.y - a.y) - (c.x - a.x) * (p.y - a.y);
      const neg = (d1 < 0) || (d2 < 0) || (d3 < 0);
      const pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
      return !(neg && pos);
    };
    while (idx.length > 3 && guard++ < 40000) {
      let clipped = false;
      for (let i = 0; i < idx.length; i++) {
        const i0 = idx[(i - 1 + idx.length) % idx.length], i1 = idx[i], i2 = idx[(i + 1) % idx.length];
        if (A(i0, i1, i2) <= 1e-12) continue;
        let ok = true;
        for (let j = 0; j < idx.length; j++) {
          const jj = idx[j];
          if (jj === i0 || jj === i1 || jj === i2) continue;
          if (inTri(poly[i0], poly[i1], poly[i2], poly[jj])) { ok = false; break; }
        }
        if (!ok) continue;
        out.push(i0, i1, i2);
        idx.splice(i, 1);
        clipped = true;
        break;
      }
      if (!clipped) { idx.splice(1, 1); }        // аварийный выход из вырожденного случая
    }
    if (idx.length === 3) out.push(idx[0], idx[1], idx[2]);
    return out;
  }

  /* --------------------------------------------------------------- контур */
  /* нормали рёбер и вершин контура */
  function contourNormals(c) {
    const n = c.length, en = [], vn = [];
    for (let i = 0; i < n; i++) {
      const a = c[i], b = c[(i + 1) % n];
      let dx = b.x - a.x, dy = b.y - a.y;
      const l = Math.hypot(dx, dy) || 1;
      en.push([dy / l, -dx / l]);
    }
    for (let i = 0; i < n; i++) {
      const prev = en[(i - 1 + n) % n], cur = en[i];
      if (c[i].s) {
        let x = prev[0] + cur[0], y = prev[1] + cur[1];
        const l = Math.hypot(x, y) || 1;
        vn.push({ a: [x / l, y / l], b: [x / l, y / l] });
      } else vn.push({ a: prev, b: cur });
    }
    return { en, vn };
  }
  /* смещение контура внутрь материала на d (митра с ограничением) */
  function offsetContour(c, d) {
    const { en } = contourNormals(c), n = c.length, out = [];
    for (let i = 0; i < n; i++) {
      const prev = en[(i - 1 + n) % n], cur = en[i];
      let mx = prev[0] + cur[0], my = prev[1] + cur[1];
      const l = Math.hypot(mx, my);
      if (l < 1e-6) { out.push({ x: c[i].x, y: c[i].y, s: c[i].s }); continue; }
      mx /= l; my /= l;
      let k = d / Math.max(0.4, mx * cur[0] + my * cur[1]);
      out.push({ x: c[i].x - mx * k, y: c[i].y - my * k, s: c[i].s });
    }
    return out;
  }

  /* ------------------------------------------------------------- extrude */
  /* shape: {outer:[pts], holes:[[pts],...]}  |  просто контур
     o: {z0, z1, ch (фаска), capA, capB} */
  function extrude(shape, o) {
    o = o || {};
    const outer = ccw(Array.isArray(shape) ? shape : shape.outer);
    const holes = ((shape.holes) || []).map(cw);
    const z0 = o.z0 !== undefined ? o.z0 : 0;
    const z1 = o.z1 !== undefined ? o.z1 : (z0 + (o.depth || 1));
    const ch = Math.max(0, Math.min(o.ch === undefined ? 0 : o.ch, Math.abs(z1 - z0) * 0.45));
    const capA = o.capA !== false, capB = o.capB !== false;
    const g = geo();
    const zs = ch > 0 ? [z0, z0 + ch, z1 - ch, z1] : [z0, z1];
    const offs = ch > 0 ? [ch, 0, 0, ch] : [0, 0];
    const all = [outer].concat(holes);

    for (const c of all) {
      const rings = offs.map((d) => (d > 0 ? offsetContour(c, d) : c));
      const nrm = rings.map(contourNormals);
      for (let L = 0; L < zs.length - 1; L++) {
        const cA = rings[L], cB = rings[L + 1], zA = zs[L], zB = zs[L + 1];
        const bevel = offs[L] !== offs[L + 1];
        const zdir = offs[L] > offs[L + 1] ? -1 : 1;   // фаска у ближнего или дальнего торца
        const sgn = L === 0 ? -1 : 1;
        const nA = nrm[L], nB = nrm[L + 1];
        for (let i = 0, n = cA.length; i < n; i++) {
          const j = (i + 1) % n;
          const P0 = [cA[i].x, cA[i].y, zA], P1 = [cA[j].x, cA[j].y, zA];
          const P2 = [cB[j].x, cB[j].y, zB], P3 = [cB[i].x, cB[i].y, zB];
          const e = nA.en[i];
          let n0, n1;
          if (bevel) {
            const kz = (offs[L] > offs[L + 1]) ? -1 : 1;
            const w = norm([e[0], e[1], kz * 1.0]);
            n0 = w; n1 = w;
          } else {
            n0 = [nA.vn[i].b[0], nA.vn[i].b[1], 0];
            n1 = [nA.vn[j].a[0], nA.vn[j].a[1], 0];
          }
          const m0 = bevel ? n0 : n0, m1 = bevel ? n1 : n1;
          quad(g, P0, P1, P2, P3, m0, m1, m1, m0);
        }
      }
    }
    /* торцы */
    const capRing = (d) => ({
      outer: d > 0 ? offsetContour(outer, d) : outer,
      holes: holes.map((h) => (d > 0 ? offsetContour(h, d) : h))
    });
    if (capB) {
      const r = capRing(offs[offs.length - 1]);
      const poly = r.holes.length ? bridgeHoles(r.outer, r.holes) : r.outer;
      const ids = earcut(poly);
      const N = [0, 0, 1];
      for (let i = 0; i < ids.length; i += 3) {
        tri(g, [poly[ids[i]].x, poly[ids[i]].y, z1], [poly[ids[i + 1]].x, poly[ids[i + 1]].y, z1],
          [poly[ids[i + 2]].x, poly[ids[i + 2]].y, z1], N, N, N);
      }
    }
    if (capA) {
      const r = capRing(offs[0]);
      const poly = r.holes.length ? bridgeHoles(r.outer, r.holes) : r.outer;
      const ids = earcut(poly);
      const N = [0, 0, -1];
      for (let i = 0; i < ids.length; i += 3) {
        tri(g, [poly[ids[i]].x, poly[ids[i]].y, z0], [poly[ids[i + 2]].x, poly[ids[i + 2]].y, z0],
          [poly[ids[i + 1]].x, poly[ids[i + 1]].y, z0], N, N, N);
      }
    }
    return g;
  }
  /* удобные обёртки: выдавливание вдоль X и Y */
  const extrudeX = (s, o) => ry(extrude(s, o), Math.PI / 2);   // локальные (u,v)→(z→x)
  const extrudeY = (s, o) => rx(extrude(s, o), -Math.PI / 2);

  /* --------------------------------------------------------------- lathe */
  /* профиль: [{r,z,s}] — обход «материал слева»; вращение вокруг оси Z */
  function lathe(profile, seg, closed, arc, a0) {
    seg = seg || 48; arc = arc === undefined ? TAU : arc; a0 = a0 || 0;
    const g = geo();
    /* профиль должен быть CCW в плоскости (r,z) — иначе нормали смотрят внутрь */
    {
      let ar = 0;
      for (let i = 0; i < profile.length; i++) {
        const a = profile[i], b = profile[(i + 1) % profile.length];
        ar += a.r * b.z - b.r * a.z;
      }
      if (ar < 0) profile = profile.slice().reverse();
    }
    const N = profile.length;
    const last = closed ? N : N - 1;
    // нормали в плоскости (r,z)
    const en = [];
    for (let i = 0; i < last; i++) {
      const a = profile[i], b = profile[(i + 1) % N];
      let dr = b.r - a.r, dz = b.z - a.z;
      const l = Math.hypot(dr, dz) || 1;
      en.push([dz / l, -dr / l]);
    }
    const vnA = [], vnB = [];
    for (let i = 0; i < N; i++) {
      const pe = en[(i - 1 + last) % last], ce = en[Math.min(i, last - 1)];
      const usePrev = closed || i > 0, useCur = closed || i < last;
      const P = usePrev ? pe : ce, C = useCur ? ce : pe;
      if (profile[i].s) {
        let x = P[0] + C[0], y = P[1] + C[1];
        const l = Math.hypot(x, y) || 1;
        vnA.push([x / l, y / l]); vnB.push([x / l, y / l]);
      } else { vnA.push(P); vnB.push(C); }
    }
    const full = Math.abs(arc - TAU) < 1e-6;
    for (let s = 0; s < seg; s++) {
      const t0 = a0 + arc * s / seg, t1 = a0 + arc * (s + 1) / seg;
      const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
      for (let i = 0; i < last; i++) {
        const a = profile[i], b = profile[(i + 1) % N];
        if (a.r < EPS && b.r < EPS) continue;
        const nA = vnB[i], nB = vnA[(i + 1) % N];
        const A0 = [a.r * c0, a.r * s0, a.z], A1 = [a.r * c1, a.r * s1, a.z];
        const B0 = [b.r * c0, b.r * s0, b.z], B1 = [b.r * c1, b.r * s1, b.z];
        const na0 = [nA[0] * c0, nA[0] * s0, nA[1]], na1 = [nA[0] * c1, nA[0] * s1, nA[1]];
        const nb0 = [nB[0] * c0, nB[0] * s0, nB[1]], nb1 = [nB[0] * c1, nB[0] * s1, nB[1]];
        if (a.r < EPS) tri(g, A0, B1, B0, na0, nb1, nb0);
        else if (b.r < EPS) tri(g, A0, A1, B0, na0, na1, nb0);
        else quad(g, A1, B1, B0, A0, na1, nb1, nb0, na0);
      }
    }
    if (!full) {                                   // боковые «щёки» у сектора
      [[a0, -1], [a0 + arc, 1]].forEach(([t, sg]) => {
        const c = Math.cos(t), s = Math.sin(t);
        const nx = -Math.sin(t) * sg, ny = Math.cos(t) * sg;
        const NN = [nx, ny, 0];
        const poly = profile.map((q) => ({ x: q.r, y: q.z }));
        const ids = earcut(ccw(poly.map((q) => ({ x: q.x, y: q.y, s: false }))));
        const src = ccw(poly.map((q) => ({ x: q.x, y: q.y, s: false })));
        for (let i = 0; i < ids.length; i += 3) {
          const P = [0, 1, 2].map((k) => {
            const q = src[ids[i + k]];
            return [q.x * c, q.x * s, q.y];
          });
          if (sg > 0) tri(g, P[0], P[2], P[1], NN, NN, NN);
          else tri(g, P[0], P[1], P[2], NN, NN, NN);
        }
      });
    }
    return g;
  }

  /* цилиндр/труба вдоль Z */
  function cyl(r0, r1, z0, z1, seg, caps) {
    const pr = [];
    if (caps !== false) pr.push({ r: 0, z: z0, s: false });
    pr.push({ r: r0, z: z0, s: false }, { r: r1, z: z1, s: false });
    if (caps !== false) pr.push({ r: 0, z: z1, s: false });
    return lathe(pr, seg || 32, false);
  }
  function tube(rIn, rOut, z0, z1, seg) {
    return lathe([{ r: rIn, z: z0, s: false }, { r: rOut, z: z0, s: false },
    { r: rOut, z: z1, s: false }, { r: rIn, z: z1, s: false }], seg || 40, true);
  }
  function torus(R, r, segA, segB, arc, a0) {
    segA = segA || 40; segB = segB || 16; arc = arc === undefined ? TAU : arc; a0 = a0 || 0;
    const pr = [];
    for (let i = 0; i < segB; i++) {
      const a = i / segB * TAU;
      pr.push({ r: R + Math.cos(a) * r, z: Math.sin(a) * r, s: true });
    }
    return lathe(pr, segA, true, arc, a0);
  }

  /* ---------------------------------------------------------------- loft */
  /* rings: [[ [x,y,z] × K ] × M] — замкнутые кольца одинаковой длины */
  function loft(rings, capA, capB, openRing) {
    const M = rings.length, K = rings[0].length;
    const acc = [];
    for (let s = 0; s < M; s++) { acc.push([]); for (let i = 0; i < K; i++) acc[s].push([0, 0, 0]); }
    const kEnd = openRing ? K - 1 : K;
    const addN = (s, i, n) => { const a = acc[s][i]; a[0] += n[0]; a[1] += n[1]; a[2] += n[2]; };
    for (let s = 0; s < M - 1; s++) {
      for (let i = 0; i < kEnd; i++) {
        const j = (i + 1) % K;
        const A = rings[s][i], B = rings[s][j], C = rings[s + 1][j], D = rings[s + 1][i];
        const n = norm(cross(sub(B, A), sub(D, A)));
        addN(s, i, n); addN(s, j, n); addN(s + 1, j, n); addN(s + 1, i, n);
      }
    }
    for (let s = 0; s < M; s++) for (let i = 0; i < K; i++) acc[s][i] = norm(acc[s][i]);
    const g = geo();
    for (let s = 0; s < M - 1; s++) {
      for (let i = 0; i < kEnd; i++) {
        const j = (i + 1) % K;
        quad(g, rings[s][i], rings[s][j], rings[s + 1][j], rings[s + 1][i],
          acc[s][i], acc[s][j], acc[s + 1][j], acc[s + 1][i]);
      }
    }
    const cap = (ring, flip) => {
      const c = [0, 0, 0];
      for (const p of ring) { c[0] += p[0] / K; c[1] += p[1] / K; c[2] += p[2] / K; }
      for (let i = 0; i < K; i++) {
        const j = (i + 1) % K;
        if (flip) triFlat(g, c, ring[j], ring[i]); else triFlat(g, c, ring[i], ring[j]);
      }
    };
    if (capA) cap(rings[0], true);
    if (capB) cap(rings[M - 1], false);
    return g;
  }

  /* суперэллипс — база для рукояток, прикладов, магазинов */
  function superRing(a, bUp, bDn, k, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = i / n * TAU, c = Math.cos(t), s = Math.sin(t);
      const b = s >= 0 ? bUp : bDn;
      out.push([
        Math.sign(c) * a * Math.pow(Math.abs(c), 2 / k),
        Math.sign(s) * b * Math.pow(Math.abs(s), 2 / k)
      ]);
    }
    return out;
  }

  /* сетка-оболочка с отверстиями (дульный тормоз, кожухи) */
  function perfShell(o) {
    const rO = o.rOut, rI = o.rIn, th = o.thetas, zs = o.zs, hole = o.hole;
    const g = geo();
    const V = (r, t, z) => [Math.cos(t) * r, Math.sin(t) * r, z];
    const nT = th.length - 1, nZ = zs.length - 1, open = [];
    for (let i = 0; i < nT; i++) { open.push([]); for (let j = 0; j < nZ; j++) open[i].push(hole((th[i] + th[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2)); }
    for (let i = 0; i < nT; i++) for (let j = 0; j < nZ; j++) {
      const t0 = th[i], t1 = th[i + 1], z0 = zs[j], z1 = zs[j + 1];
      const n0 = [Math.cos(t0), Math.sin(t0), 0], n1 = [Math.cos(t1), Math.sin(t1), 0];
      const m0 = [-n0[0], -n0[1], 0], m1 = [-n1[0], -n1[1], 0];
      if (!open[i][j]) {
        quad(g, V(rO, t0, z0), V(rO, t1, z0), V(rO, t1, z1), V(rO, t0, z1), n0, n1, n1, n0);
        quad(g, V(rI, t0, z0), V(rI, t0, z1), V(rI, t1, z1), V(rI, t1, z0), m0, m0, m1, m1);
        if (o.capBack && j === 0) { const n = [0, 0, -1]; quad(g, V(rI, t1, z0), V(rO, t1, z0), V(rO, t0, z0), V(rI, t0, z0), n, n, n, n); }
        if (o.capFront && j === nZ - 1) { const n = [0, 0, 1]; quad(g, V(rO, t0, z1), V(rO, t1, z1), V(rI, t1, z1), V(rI, t0, z1), n, n, n, n); }
      } else {
        const L = open[(i - 1 + nT) % nT][j], R = open[(i + 1) % nT][j];
        const B = j > 0 ? open[i][j - 1] : true, F = j < nZ - 1 ? open[i][j + 1] : true;
        if (!L) { const n = [-Math.sin(t0), Math.cos(t0), 0]; quad(g, V(rI, t0, z1), V(rO, t0, z1), V(rO, t0, z0), V(rI, t0, z0), n, n, n, n); }
        if (!R) { const n = [Math.sin(t1), -Math.cos(t1), 0]; quad(g, V(rO, t1, z0), V(rO, t1, z1), V(rI, t1, z1), V(rI, t1, z0), n, n, n, n); }
        if (!B) { const n = [0, 0, 1]; quad(g, V(rO, t0, z0), V(rO, t1, z0), V(rI, t1, z0), V(rI, t0, z0), n, n, n, n); }
        if (!F) { const n = [0, 0, -1]; quad(g, V(rI, t1, z1), V(rO, t1, z1), V(rO, t0, z1), V(rI, t0, z1), n, n, n, n); }
      }
    }
    return g;
  }

  function bounds(g) {
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (let i = 0; i < g.p.length; i += 3) for (let k = 0; k < 3; k++) {
      mn[k] = Math.min(mn[k], g.p[i + k]); mx[k] = Math.max(mx[k], g.p[i + k]);
    }
    return { min: mn, max: mx };
  }

  return {
    TAU, geo, tri, quad, triFlat, quadFlat, merge, transform, bounds,
    mIdent, mMul, mTrans, mScale, mRotX, mRotY, mRotZ, mBasis,
    tr, rx, ry, rz, mirrorX, norm, cross, sub,
    round, rect, circle, ellipse, ccw, cw, offsetContour,
    extrude, extrudeX, extrudeY, lathe, cyl, tube, torus, loft, superRing, perfShell, earcut, bridgeHoles, clean
  };
});

});
__akdef("helpers", function (module, exports) {
/* Общие хелперы и константы модели АК-74 (всё в мм) */
module.exports = function (G) {
  const PI = Math.PI, TAU = PI * 2, D = (d) => d * PI / 180;
  const { round, extrude, lathe, merge, tr, rx, ry, rz, cyl } = G;

  const MATS = {
    blued:  { color: [0.070, 0.074, 0.081], metal: 1.00, rough: 0.28 },
    park:   { color: [0.098, 0.097, 0.094], metal: 0.92, rough: 0.54 },
    steel:  { color: [0.165, 0.170, 0.180], metal: 1.00, rough: 0.33 },
    wood:   { color: [0.330, 0.130, 0.046], metal: 0.00, rough: 0.38 },
    woodDk: { color: [0.198, 0.074, 0.026], metal: 0.00, rough: 0.44 },
    plum:   { color: [0.245, 0.072, 0.062], metal: 0.06, rough: 0.36 },
    poly:   { color: [0.040, 0.040, 0.043], metal: 0.00, rough: 0.50 },
    brass:  { color: [0.620, 0.465, 0.170], metal: 1.00, rough: 0.25 },
    copper: { color: [0.575, 0.320, 0.160], metal: 1.00, rough: 0.29 },
    lead:   { color: [0.330, 0.335, 0.345], metal: 1.00, rough: 0.45 },
    bore:   { color: [0.010, 0.010, 0.012], metal: 0.30, rough: 0.85 },
    mark:   { color: [0.560, 0.560, 0.560], metal: 0.40, rough: 0.50 }
  };

  const BORE = 75;
  const Z = {
    butt: 225, recvRear: 8, recvFront: -242,
    rsbRear: -242, rsbFront: -302, notch: -248,
    hgRear: -306, hgFront: -492,
    gasRear: -494, gasFront: -534,
    fsbRear: -611, fsbFront: -641, post: -626,
    brakeRear: -636, brakeFront: -718,
    boltFace: -211,
    portRear: -124, portFront: -168,
    magRear: -88, magFront: -158
  };

  /* —— сглаживание ОТКРЫТОЙ ломаной (концы остаются острыми) —— */
  function smoothPath(pts, defR) {
    const out = [{ x: pts[0][0], y: pts[0][1], s: false }];
    for (let i = 1; i < pts.length - 1; i++) {
      const c = pts[i], p0 = pts[i - 1], p1 = pts[i + 1];
      const r = c.length > 2 ? c[2] : (defR || 0);
      const d0 = [p0[0] - c[0], p0[1] - c[1]], d1 = [p1[0] - c[0], p1[1] - c[1]];
      const l0 = Math.hypot(d0[0], d0[1]), l1 = Math.hypot(d1[0], d1[1]);
      if (r <= 1e-6 || l0 < 1e-9 || l1 < 1e-9) { out.push({ x: c[0], y: c[1], s: false }); continue; }
      const rr = Math.min(r, l0 * 0.49, l1 * 0.49);
      const u0 = [d0[0] / l0, d0[1] / l0], u1 = [d1[0] / l1, d1[1] / l1];
      const A = [c[0] + u0[0] * rr, c[1] + u0[1] * rr], B = [c[0] + u1[0] * rr, c[1] + u1[1] * rr];
      const dot = Math.max(-1, Math.min(1, u0[0] * u1[0] + u0[1] * u1[1]));
      const segs = Math.max(2, Math.min(12, Math.ceil((PI - Math.acos(dot)) / 0.28)));
      for (let k = 0; k <= segs; k++) {
        const t = k / segs, it = 1 - t;
        out.push({ x: it * it * A[0] + 2 * it * t * c[0] + t * t * B[0],
                   y: it * it * A[1] + 2 * it * t * c[1] + t * t * B[1], s: true });
      }
    }
    const L = pts[pts.length - 1];
    out.push({ x: L[0], y: L[1], s: false });
    return out;
  }

  /* нормали открытой ломаной (side=+1 — справа по ходу движения) */
  function pathNormals(P, side) {
    const n = P.length, en = [];
    for (let i = 0; i < n - 1; i++) {
      const dx = P[i + 1].x - P[i].x, dy = P[i + 1].y - P[i].y, l = Math.hypot(dx, dy) || 1;
      en.push([side * dy / l, -side * dx / l]);
    }
    const vn = [];
    for (let i = 0; i < n; i++) {
      const a = en[Math.max(0, i - 1)], b = en[Math.min(en.length - 1, i)];
      let x = a[0] + b[0], y = a[1] + b[1]; const l = Math.hypot(x, y) || 1;
      vn.push([x / l, y / l]);
    }
    return vn;
  }

  /* замкнутый контур полосы толщины t вдоль открытой ломаной */
  function bandContour(pts, r, t, side) {
    const P = smoothPath(pts, r), N = pathNormals(P, side);
    const outer = P.map((p) => ({ x: p.x, y: p.y, s: p.s }));
    const inner = P.map((p, i) => ({ x: p.x - N[i][0] * t, y: p.y - N[i][1] * t, s: p.s }));
    outer[0].s = false; outer[outer.length - 1].s = false;
    inner[0].s = false; inner[inner.length - 1].s = false;
    return outer.concat(inner.reverse());
  }

  /* сечение → кольцо loft'а; точки с s=false дублируются → резкое ребро */
  function ringOf(sec, f) {
    const out = [];
    for (const p of sec) { if (!p.s) out.push(f(p)); out.push(f(p)); }
    return out;
  }

  const prof = (a) => a.map((p) => ({ r: p[0], z: p[1], s: p[2] === 's' }));

  /* заклёпка с полукруглой головкой, ось +Z (профиль в CCW порядке) */
  function rivet(d, h, seg) {
    const r = d / 2, p = [{ r: 0, z: -0.6, s: false }, { r: r, z: -0.6, s: false }, { r: r, z: 0, s: false }];
    const n = 6;
    for (let i = 1; i <= n; i++) { const a = i / n * PI / 2; p.push({ r: r * Math.cos(a), z: h * Math.sin(a), s: true }); }
    return lathe(p, seg || 18, false);
  }
  const rivetX = (x, y, z, d, h) => tr(ry(rivet(d, h), Math.sign(x) * PI / 2), x, y, z);
  const rivetY = (x, y, z, d, h, dir) => tr(rx(rivet(d, h), (dir < 0 ? 1 : -1) * PI / 2), x, y, z);
  const rivetZ = (x, y, z, d, h, dir) => tr((dir < 0 ? rx(rivet(d, h), PI) : rivet(d, h)), x, y, z);

  /* штифт/ось вдоль X с головками */
  function pinX(x0, x1, r, y, z, head) {
    const g = [tr(ry(cyl(r, r, 0, x1 - x0, 20), PI / 2), x0, y, z)];
    if (head) {
      g.push(tr(ry(cyl(r + 0.9, r + 0.9, -0.8, 0, 20), PI / 2), x0, y, z));
      g.push(tr(ry(cyl(r + 0.9, r + 0.9, x1 - x0, x1 - x0 + 0.8, 20), PI / 2), x0, y, z));
    }
    return merge(g);
  }

  /* шар */
  function sphere(r, seg) {
    const p = [], n = seg || 14;
    for (let i = 0; i <= n; i++) { const a = -PI / 2 + PI * i / n; p.push({ r: r * Math.cos(a), z: r * Math.sin(a), s: true }); }
    p[0].s = false; p[p.length - 1].s = false;
    return lathe(p, (seg || 14) * 2, false);
  }

  /* коробка со скруглёнными углами в XY, вытянутая по Z */
  const boxZ = (x0, y0, x1, y1, z0, z1, r, ch) =>
    extrude(round([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], r || 0), { z0, z1, ch: ch === undefined ? 0.3 : ch });

  /* то же, но сечение в (Z,Y), толщина по X */
  const boxX = (z0, y0, z1, y1, x0, x1, r, ch) =>
    G.extrudeX(round([[-z0, y0], [-z1, y0], [-z1, y1], [-z0, y1]], r || 0), { z0: x0, z1: x1, ch: ch === undefined ? 0.3 : ch });

  /* профиль в (Z,Y) → геометрия толщиной по X. pts: [[z,y] | [z,y,r]] */
  const plateZY = (pts, x0, x1, ch) =>
    G.extrudeX(round(pts.map((p) => (p.length > 2 ? [-p[0], p[1], p[2]] : [-p[0], p[1]])), 0), { z0: x0, z1: x1, ch: ch === undefined ? 0.3 : ch });

  /* профиль в (X,Z) → геометрия толщиной по Y. pts: [[x,z] | [x,z,r]] */
  const plateXZ = (pts, y0, y1, ch) =>
    G.extrudeY(round(pts.map((p) => (p.length > 2 ? [p[0], -p[1], p[2]] : [p[0], -p[1]])), 0), { z0: y0, z1: y1, ch: ch === undefined ? 0.3 : ch });

  /* рифлёние: набор параллельных валиков вдоль X на поверхности y=const */
  function ribsZ(n, z0, z1, x0, x1, y, h, w) {
    const g = [];
    for (let i = 0; i < n; i++) {
      const zc = z0 + (z1 - z0) * (i + 0.5) / n;
      g.push(G.extrudeX(round([[-(zc - w / 2), y - h], [-(zc + w / 2), y - h], [-(zc + w / 2), y + h * 0.15], [-(zc - w / 2), y + h * 0.15]], w * 0.45), { z0: x0, z1: x1, ch: 0.15 }));
    }
    return merge(g);
  }

  return {
    PI, TAU, D, MATS, BORE, Z,
    smoothPath, pathNormals, bandContour, ringOf, prof,
    rivet, rivetX, rivetY, rivetZ, pinX, sphere, boxZ, boxX, plateZY, plateXZ, ribsZ
  };
};

});
__akdef("p_receiver", function (module, exports) {
/* Ствольная коробка, крышка, колодка прицела */
module.exports = function (G, H, C) {
  const { round, extrude, lathe, cyl, tube, merge, tr, rx, ry, rz, loft } = G;
  const { PI, D, BORE, Z, bandContour, ringOf, plateZY, rivetX, rivetY, pinX } = H;
  const parts = [];
  const add = (name, mat, geo) => { parts.push({ name, mat, geo }); return geo; };

  const RX = 17.5, WT = 1.05, RBOT = 30, RTOP = 93, RCOR = 6;
  C.RX = RX; C.RTOP = RTOP; C.RBOT = RBOT;

  /* ================= корпус (штампованный лист) ================= */
  const shell = [];

  /* дно со скруглёнными нижними углами */
  const bottomSec = (xa, xb) => bandContour(
    [[xa, RBOT + RCOR], [xa, RBOT, RCOR], [xb, RBOT, RCOR], [xb, RBOT + RCOR]], 0, WT, -1);
  const bottomSeg = (z0, z1, xa, xb) =>
    extrude(bottomSec(xa === undefined ? RX : xa, xb === undefined ? -RX : xb), { z0, z1, ch: 0.25 });

  shell.push(bottomSeg(Z.recvFront, Z.magFront));
  shell.push(bottomSeg(Z.magRear, -76));
  shell.push(bottomSeg(-76, -30, RX, 8), bottomSeg(-76, -30, -8, -RX));
  shell.push(bottomSeg(-30, Z.recvRear));

  /* боковые стенки */
  const yBot = RBOT + RCOR - 0.5;
  shell.push(plateZY([[Z.recvRear, yBot], [Z.recvRear, RTOP, 2], [Z.recvFront, RTOP, 2], [Z.recvFront, yBot]], -RX, -RX + WT, 0.3));
  const zSlot = -40, ySlot = 82;
  shell.push(plateZY([[Z.recvRear, yBot], [Z.recvRear, RTOP, 2], [zSlot, RTOP, 1.5], [zSlot, ySlot, 1.5],
  [Z.portRear, ySlot, 2], [Z.portRear, 70, 3], [Z.portFront, 70, 3], [Z.portFront, RTOP, 2],
  [Z.recvFront, RTOP, 2], [Z.recvFront, yBot]], RX - WT, RX, 0.3));

  /* отбортовка нижней кромки окна выброса */
  shell.push(plateZY([[Z.portRear - 4, 70], [Z.portRear - 4, 65.5, 1.6], [Z.portFront + 4, 65.5, 1.6], [Z.portFront + 4, 70]], RX - WT, RX + 0.8, 0.3));

  /* верхние направляющие (загиб внутрь) */
  const rail = (side) => bandContour([[side * RX, RTOP], [side * (RX - 5.5), RTOP]], 0, WT, side);
  shell.push(extrude(rail(1), { z0: Z.recvFront, z1: Z.portFront, ch: 0.2 }));
  shell.push(extrude(rail(1), { z0: zSlot, z1: Z.recvRear, ch: 0.2 }));
  shell.push(extrude(rail(-1), { z0: Z.recvFront, z1: Z.recvRear, ch: 0.2 }));

  /* «губы» магазинного окна */
  const lip = (z0, z1) => extrude(round([[-RX + 0.7, RBOT - 0.3], [RX - 0.7, RBOT - 0.3], [RX - 0.7, RBOT + 5.5], [-RX + 0.7, RBOT + 5.5]], 1.2), { z0, z1, ch: 0.4 });
  shell.push(lip(Z.magFront - 4.5, Z.magFront + 1.5), lip(Z.magRear - 1.5, Z.magRear + 4.5));

  /* задняя стенка */
  shell.push(extrude(round([[-RX + WT, RBOT + 2], [RX - WT, RBOT + 2], [RX - WT, RTOP - 2], [-RX + WT, RTOP - 2]], 3), { z0: 1.5, z1: Z.recvRear, ch: 0.5 }));
  add('receiver', 'park', merge(shell));

  /* передняя колодка (вкладыш) */
  add('trunnion', 'steel', merge([
    extrude(round([[-15.9, 33], [15.9, 33], [15.9, 90], [-15.9, 90]], 4), { z0: Z.recvFront + 2, z1: Z.portFront + 4, ch: 0.7 }),
    tr(cyl(11.4, 11.4, Z.recvFront - 3, Z.recvFront + 4, 30), 0, BORE, 0)
  ]));

  /* заклёпки */
  const rv = [];
  [[-228, 45], [-228, 84], [-198, 45], [-198, 84], [-176, 64]].forEach(([z, y]) =>
    rv.push(rivetX(RX, y, z, 5.4, 1.6), rivetX(-RX, y, z, 5.4, 1.6)));
  [[-104, 43], [-100, 61]].forEach(([z, y]) =>
    rv.push(rivetX(RX, y, z, 5.0, 1.5), rivetX(-RX, y, z, 5.0, 1.5)));
  [[3, 47], [3, 74]].forEach(([z, y]) =>
    rv.push(rivetX(RX, y, z, 5.4, 1.6), rivetX(-RX, y, z, 5.4, 1.6)));
  [[-72, 12.5], [-26, 12.5]].forEach(([z, x]) =>
    rv.push(rivetY(x, RBOT - 0.3, z, 5, 1.5), rivetY(-x, RBOT - 0.3, z, 5, 1.5)));
  add('rivets', 'steel', merge(rv));

  /* упор переводчика (выступ на правой стенке) */
  add('selectorStop', 'park', plateZY([[-30, 74], [-30, 84, 2], [-58, 84, 2], [-58, 74]], RX, RX + 1.4, 0.4));

  /* ================= крышка ствольной коробки ================= */
  const COVX = RX + 1.7, COVY0 = 92, COVTOP = BORE + 38, COVTH = 1.15, KK = 2.60;
  function archBase() {
    const N = 44, pts = [];
    const a = COVX, b = COVTOP - COVY0;
    for (let i = 0; i <= N; i++) {
      const ang = PI * (1 - i / N);
      const c = Math.cos(ang), s = Math.max(0, Math.sin(ang));
      pts.push({
        x: Math.sign(c) * a * Math.pow(Math.abs(c), 2 / KK),
        y: COVY0 + b * Math.pow(s, 2 / KK)
      });
    }
    const nr = pts.map((p, i) => {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(pts.length - 1, i + 1)];
      let dx = p1.x - p0.x, dy = p1.y - p0.y; const l = Math.hypot(dx, dy) || 1;
      return [dy / l, -dx / l];
    });
    return { pts, nr };
  }
  const ARCH = archBase();
  function coverRing(z, ribAmp) {
    const { pts, nr } = ARCH, a = COVX;
    const outer = pts.map((p, i) => {
      const q = Math.abs(p.x) / a;
      const bump = Math.exp(-Math.pow((q - 0.50) / 0.17, 2)) * (1 - Math.pow(q, 8));
      const o = ribAmp * bump;
      return { x: p.x + nr[i][0] * o, y: p.y + nr[i][1] * o, s: true };
    });
    const inner = pts.map((p, i) => ({ x: p.x - nr[i][0] * COVTH, y: p.y - nr[i][1] * COVTH, s: true }));
    outer[0].s = false; outer[outer.length - 1].s = false;
    inner[0].s = false; inner[inner.length - 1].s = false;
    const sec = [].concat(
      [{ x: a, y: COVY0 - 5.5, s: false }],
      outer,
      [{ x: -a, y: COVY0 - 5.5, s: false }, { x: -a + COVTH, y: COVY0 - 5.5, s: false }],
      inner.slice().reverse(),
      [{ x: a - COVTH, y: COVY0 - 5.5, s: false }]
    );
    return ringOf(sec, (p) => [p.x, p.y, z]);
  }
  {
    const z0 = -247, z1 = 9, st = [], N = 56;
    for (let i = 0; i <= N; i++) {
      const t = i / N, z = z0 + (z1 - z0) * t;
      const fade = Math.min(1, Math.max(0, (t - 0.05) / 0.09)) * Math.min(1, Math.max(0, (0.96 - t) / 0.09));
      st.push(coverRing(z, 1.6 * fade));
    }
    add('dustCover', 'park', loft(st, true, true));
  }
  /* ================= колодка прицела + целик ================= */
  const LEAF_TOP = 113, SIGHT_Y = 116;
  C.SIGHT_Y = SIGHT_Y;
  {
    const p = [];
    p.push(extrude(round([[-14, BORE - 13], [14, BORE - 13], [14, BORE + 12], [11, BORE + 21],
    [11, LEAF_TOP - 4], [-11, LEAF_TOP - 4], [-11, BORE + 21], [-14, BORE + 12]], 2.0),
      { z0: Z.rsbFront, z1: Z.rsbRear, ch: 0.8 }));
    /* борта секторной планки */
    p.push(extrude(round([[-11, LEAF_TOP - 5.5], [-7.6, LEAF_TOP - 5.5], [-7.6, LEAF_TOP + 2.4], [-11, LEAF_TOP + 2.4]], 1.0), { z0: -298, z1: -243, ch: 0.4 }));
    p.push(extrude(round([[7.6, LEAF_TOP - 5.5], [11, LEAF_TOP - 5.5], [11, LEAF_TOP + 2.4], [7.6, LEAF_TOP + 2.4]], 1.0), { z0: -298, z1: -243, ch: 0.4 }));
    /* прилив снизу — упор цевья */
    p.push(extrude(round([[-11.5, BORE - 22], [11.5, BORE - 22], [11.5, BORE - 11], [-11.5, BORE - 11]], 2.5), { z0: -296, z1: -248, ch: 0.5 }));
    add('rearSightBlock', 'park', merge(p));
    add('rsbPin', 'steel', pinX(-15, 15, 2, BORE - 4, -272, true));

    /* прицельная планка */
    add('rearSightLeaf', 'blued', merge([
      extrude(round([[-7.4, LEAF_TOP - 3.6], [7.4, LEAF_TOP - 3.6], [7.4, LEAF_TOP], [-7.4, LEAF_TOP]], 0.7), { z0: -296, z1: -243.5, ch: 0.3 }),
      merge([1, 2, 3, 4, 5, 6, 7].map((i) => extrude(round([[-7.5, LEAF_TOP - 1.0], [7.5, LEAF_TOP - 1.0], [7.5, LEAF_TOP + 0.05], [-7.5, LEAF_TOP + 0.05]], 0.2),
        { z0: -292 + i * 6, z1: -291.1 + i * 6, ch: 0 })))
    ]));

    /* ползун с П-образной прорезью */
    const zA = Z.notch - 5, zB = Z.notch + 0.5;
    const nw = 2.5, nFloor = SIGHT_Y, TOPY = SIGHT_Y + 2.35;
    add('rearSightSlider', 'blued', merge([
      extrude(round([[-8.4, LEAF_TOP - 1.4], [-nw, LEAF_TOP - 1.4], [-nw, TOPY], [-8.4, TOPY]], 0.5), { z0: zA, z1: zB, ch: 0.3 }),
      extrude(round([[nw, LEAF_TOP - 1.4], [8.4, LEAF_TOP - 1.4], [8.4, TOPY], [nw, TOPY]], 0.5), { z0: zA, z1: zB, ch: 0.3 }),
      extrude(round([[-nw, LEAF_TOP - 1.4], [nw, LEAF_TOP - 1.4], [nw, nFloor], [-nw, nFloor]], 0.3), { z0: zA, z1: zB, ch: 0.2 }),
      merge([0, 1, 2].map((i) => extrude(round([[-8.8, LEAF_TOP - 0.7], [8.8, LEAF_TOP - 0.7], [8.8, TOPY - 0.7], [-8.8, TOPY - 0.7]], 0.3),
        { z0: zA + 0.8 + i * 1.4, z1: zA + 1.4 + i * 1.4, ch: 0.1 })))
    ]));
    add('notchShadow', 'bore', extrude(round([[-nw - 0.06, nFloor - 0.1], [nw + 0.06, nFloor - 0.1], [nw + 0.06, TOPY + 0.06], [-nw - 0.06, TOPY + 0.06]], 0.2),
      { z0: zA - 0.18, z1: zA + 0.12, ch: 0 }));
  }

  return parts;
};

});
__akdef("p_barrel", function (module, exports) {
/* Ствол, газовый узел, основание мушки, дульный тормоз, шомпол */
module.exports = function (G, H, C) {
  const { round, extrude, lathe, cyl, tube, torus, merge, tr, rx, ry, rz, perfShell, loft } = G;
  const { PI, TAU, D, BORE, Z, prof, plateZY, plateXZ, pinX, ringOf } = H;
  const parts = [];
  const add = (n, m, g) => { parts.push({ name: n, mat: m, geo: g }); return g; };
  const atY = (g) => tr(g, 0, BORE, 0);

  /* ============================ СТВОЛ ============================ */
  add('barrel', 'blued', atY(lathe(prof([
    [2.75, -676], [8.5, -676],                       // дульный торец (в тормозе)
    [8.5, -644], [8.9, -641, 's'], [8.9, -611], [8.5, -608, 's'],
    [7.65, -604, 's'], [7.65, -540], [8.6, -536, 's'],
    [8.6, -494], [9.5, -490, 's'], [9.5, -308], [10.6, -304, 's'],
    [10.6, -248], [11.9, -244, 's'], [11.9, -205],
    [2.75, -205]
  ]), 44, true)));
  add('bore', 'bore', atY(cyl(2.6, 2.6, -690, -208, 24)));

  /* ============================ ГАЗОВАЯ КАМОРА ============= */
  {
    const GY = BORE + 21;                            // ось газовой трубки
    C.GAS_Y = GY;
    const g = [];
    g.push(extrude(round([[-11, BORE - 12], [11, BORE - 12], [11, BORE + 12], [-11, BORE + 12]], 2.6),
      { z0: Z.gasFront, z1: Z.gasRear, ch: 0.8 }));
    /* верхний прилив и патрубок под газовую трубку */
    g.push(extrude(round([[-9.5, BORE + 8], [9.5, BORE + 8], [9.5, GY + 8], [-9.5, GY + 8]], 3),
      { z0: -528, z1: -500, ch: 0.7 }));
    g.push(tr(tube(8.6, 11.0, -516, -492, 30), 0, GY, 0));
    /* нижний прилив — канал шомпола */
    g.push(extrude(round([[-4.5, BORE - 18], [4.5, BORE - 18], [4.5, BORE - 9], [-4.5, BORE - 9]], 1.4),
      { z0: -530, z1: -498, ch: 0.4 }));
    add('gasBlock', 'park', merge(g));
    add('gasBlockPin', 'steel', pinX(-11.8, 11.8, 1.8, BORE + 2, -514, true));

    /* газовая трубка */
    add('gasTube', 'blued', merge([
      tr(tube(8.0, 9.2, -494, -299, 30), 0, GY, 0),
      tr(tube(9.0, 11.0, -312, -302, 30), 0, GY, 0)
    ]));
  }

  /* ============================ ОСНОВАНИЕ МУШКИ ============ */
  {
    const SY = C.SIGHT_Y || 116;                     // высота линии прицеливания
    const zc = Z.post, f = [];
    /* корпус */
    f.push(extrude(round([[-11, BORE - 11], [11, BORE - 11], [11, BORE + 10], [-11, BORE + 10]], 2.4),
      { z0: Z.fsbFront, z1: Z.fsbRear, ch: 0.8 }));
    /* kozhuh mushki: podkova s prorezyu */
    {
      const cy = SY - 3.6, RO = 9.6, RI = 5.9, sw = 2.65, yb = BORE + 8;
      const aO = Math.acos(sw / RO), aI = Math.acos(sw / RI);
      const P = [];
      const arc = (r, a0, a1, n, sm) => {
        for (let i = 0; i <= n; i++) {
          const a = a0 + (a1 - a0) * i / n;
          P.push({ x: r * Math.cos(a), y: cy + r * Math.sin(a), s: !!sm && i > 0 && i < n });
        }
      };
      arc(RO, PI - aO, PI, 7, true);
      P.push({ x: -RO, y: yb, s: false });
      P.push({ x: RO, y: yb, s: false });
      arc(RO, 0, aO, 7, true);
      P.push({ x: sw, y: cy + RI * Math.sin(aI), s: false });
      arc(RI, aI, aI - (PI + 2 * aI), 40, true);
      f.push(extrude(P, { z0: zc - 7.5, z1: zc + 7.5, ch: 0.5 }));
    }
    add('frontSightBase', 'park', merge(f));

    /* мушка: резьбовое основание + столбик с плоской вершиной */
    add('frontPost', 'blued', merge([
      tr(rx(lathe(prof([[0, 0], [3.1, 0], [3.1, 3.4], [2.4, 4.0, 's'], [2.4, 9.0], [1.15, 10.2, 's'],
        [1.15, SY - BORE - 8.6], [0, SY - BORE - 8.6]]), 22, false), -PI / 2), 0, BORE + 8.6, zc)
    ]));
    add('frontPostTip', 'mark', tr(rx(cyl(1.15, 1.08, 0, 1.3, 20), -PI / 2), 0, SY - 1.3, zc));

    /* штыковый упор и канал шомпола снизу */
    add('bayonetLug', 'park', merge([
      extrude(round([[-4.5, BORE - 20], [4.5, BORE - 20], [4.5, BORE - 10], [-4.5, BORE - 10]], 1.5), { z0: Z.fsbFront + 3, z1: Z.fsbRear - 3, ch: 0.4 }),
      extrude(round([[-7, BORE - 24], [7, BORE - 24], [7, BORE - 18], [-7, BORE - 18]], 1.8), { z0: -634, z1: -618, ch: 0.5 })
    ]));
    add('fsbPin', 'steel', pinX(-11.8, 11.8, 1.8, BORE - 4, -630, true));
  }

  /* ============================ ДУЛЬНЫЙ ТОРМОЗ ============== */
  {
    const RO = 12.4, RI = 9.3, zr = Z.brakeRear, zf = Z.brakeFront;
    const b = [];
    /* задняя муфта с лысками */
    b.push(tr(lathe(prof([[8.6, zr], [13.2, zr], [13.2, zr - 13], [RO, zr - 16, 's'], [RO, zr - 18], [8.6, zr - 18]]), 44, true), 0, BORE, 0));
    /* камеры с окнами */
    const thetas = []; for (let i = 0; i <= 72; i++) thetas.push(i / 72 * TAU);
    const zs = []; for (let z = zr - 18; z >= zf + 6; z -= 1.5) zs.push(z);
    const ventZ = [zr - 26, zr - 34, zr - 42];
    const holeFn = (t, z) => {
      const dR = Math.abs(Math.atan2(Math.sin(t), Math.cos(t)));
      const dL = Math.abs(PI - dR);
      const side = Math.min(dR, dL);
      /* три круглых отверстия с каждой стороны (задняя камера) */
      for (const vz of ventZ) {
        const dz = z - vz, da = (side - 0.30) * RO;
        if (dz * dz + da * da < 2.0 * 2.0) return true;
      }
      /* два больших боковых окна (передняя камера) */
      const ang = Math.atan2(Math.sin(t), Math.cos(t));
      const up = Math.abs(Math.atan2(Math.sin(t - 0.32), Math.cos(t - 0.32)));
      const upL = Math.abs(PI - Math.abs(Math.atan2(Math.sin(t + 0.32), Math.cos(t + 0.32))));
      const win = Math.min(up, upL) < 0.62;
      if (win && z < zr - 54 && z > zf + 12) return true;
      return false;
    };
    b.push(tr(perfShell({ rOut: RO, rIn: RI, thetas, zs: zs.slice().reverse(), hole: holeFn, capBack: true, capFront: true }), 0, BORE, 0));
    /* передний обод */
    b.push(tr(lathe(prof([[10.4, zf + 6], [RO, zf + 6], [RO, zf + 1], [11.6, zf, 's'], [10.4, zf]]), 44, true), 0, BORE, 0));
    add('muzzleBrake', 'park', merge(b));
  }

  /* ============================ ШОМПОЛ ============================ */
  add('cleaningRod', 'steel', tr(cyl(2.15, 2.15, -641, -300, 16), 0, BORE - 14.5, 0));

  return parts;
};

});
__akdef("p_furn", function (module, exports) {
/* Цевьё (нижнее и верхнее), пистолетная рукоятка, приклад */
module.exports = function (G, H, C) {
  const { round, circle, extrude, lathe, cyl, tube, merge, tr, rx, ry, rz, loft,
    transform, mBasis, ccw, cw, superRing, offsetContour } = G;
  const { PI, D, BORE, Z, prof, ringOf, smoothPath, boxZ, pinX } = H;
  const parts = [];
  const add = (n, m, g) => { parts.push({ name: n, mat: m, geo: g }); return g; };
  const W = C.furniture === 'polymer' ? 'poly' : 'wood';
  const WD = C.furniture === 'polymer' ? 'poly' : 'woodDk';
  const lerpAt = (tab, x) => {
    if (x <= tab[0][0]) return tab[0][1];
    for (let i = 1; i < tab.length; i++) {
      if (x <= tab[i][0]) {
        const t = (x - tab[i - 1][0]) / (tab[i][0] - tab[i - 1][0]);
        const u = t * t * (3 - 2 * t);
        return tab[i - 1][1] * (1 - u) + tab[i][1] * u;
      }
    }
    return tab[tab.length - 1][1];
  };
  /* внешние нормали замкнутого CCW-контура */
  function cNormals(c) {
    const n = c.length, en = [], vn = [];
    for (let i = 0; i < n; i++) {
      const a = c[i], b = c[(i + 1) % n];
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      en.push([dy / l, -dx / l]);
    }
    for (let i = 0; i < n; i++) {
      const p = en[(i - 1 + n) % n], q = en[i];
      let mx = p[0] + q[0], my = p[1] + q[1];
      const l = Math.hypot(mx, my) || 1;
      vn.push([mx / l, my / l]);
    }
    return vn;
  }
  const swell = (base, nrm, k) => base.map((p, i) =>
    p.o ? { x: p.x + nrm[i][0] * k, y: p.y + nrm[i][1] * k, s: p.s } : p);

  /* ======================= НИЖНЕЕ ЦЕВЬЁ ======================= */
  const LOW = (function () {
    const c = smoothPath([[19.2, 80], [20.6, 65, 10], [17.2, 50, 11],
    [0, 43, 18], [-17.2, 50, 11], [-20.6, 65, 10], [-19.2, 80]], 0)
      .map((p) => ({ x: p.x, y: p.y, s: p.s, o: true }));
    c.push({ x: -15.6, y: 80, s: false, o: false });
    for (let i = 0; i <= 22; i++) {
      const a = PI + PI * i / 22;
      c.push({ x: 15.6 * Math.cos(a), y: 74 + 15.6 * Math.sin(a), s: i > 0 && i < 22, o: false });
    }
    c.push({ x: 15.6, y: 80, s: false, o: false });
    const cc = ccw(c);
    return { c: cc, nrm: cNormals(cc) };
  })();
  const lowRing = (z, k) => ringOf(swell(LOW.c, LOW.nrm, k), (p) => [p.x, p.y, z]);
  {
    const st = [[-492, -2.6], [-489.5, -0.9], [-486, 0], [-478, -0.15], [-464, -0.35], [-444, -0.5],
    [-420, -0.5], [-396, -0.35], [-368, -0.05], [-340, 0.3], [-312, 0.5], [-290, 0.45],
    [-274, 0.2], [-260, -0.3], [-252.5, -0.9], [-250, -2.6]];
    add('handguardLower', W, loft(st.map(([z, k]) => lowRing(z, k)), true, true));
    add('hgFerrule', 'park', loft([[-493.5, 0.5], [-492, 1.35], [-483, 1.35], [-481.5, 0.5]]
      .map(([z, k]) => lowRing(z, k)), true, true));
  }

  /* ======================= ВЕРХНЕЕ ЦЕВЬЁ ======================= */
  const GY = C.GAS_Y || (BORE + 21);
  const UP = (function () {
    const c = smoothPath([[17.4, 85], [18.8, 96, 9], [13.0, 109, 10],
    [0, 112, 15], [-13.0, 109, 10], [-18.8, 96, 9], [-17.4, 85]], 0)
      .map((p) => ({ x: p.x, y: p.y, s: p.s, o: true }));
    c.push({ x: -12.2, y: 85, s: false, o: false });
    for (let i = 0; i <= 20; i++) {
      const a = PI - PI * i / 20;
      c.push({ x: 11.4 * Math.cos(a), y: GY + 11.4 * Math.sin(a), s: i > 0 && i < 20, o: false });
    }
    c.push({ x: 12.2, y: 85, s: false, o: false });
    const cc = ccw(c);
    return { c: cc, nrm: cNormals(cc) };
  })();
  const upRing = (z, k) => ringOf(swell(UP.c, UP.nrm, k), (p) => [p.x, p.y, z]);
  {
    const st = [[-490, -2.4], [-487.5, -0.8], [-484, 0], [-474, -0.2], [-456, -0.45], [-434, -0.55],
    [-406, -0.5], [-378, -0.3], [-350, 0], [-330, 0.25], [-316, 0.15], [-309, -0.7], [-306, -2.4]];
    add('handguardUpper', W, loft(st.map(([z, k]) => upRing(z, k)), true, true));
    add('hgFerruleUp', 'park', loft([[-491.5, 0.5], [-490, 1.4], [-482, 1.4], [-480.5, 0.5]]
      .map(([z, k]) => upRing(z, k)), true, true));
  }

  /* ======================= ПИСТОЛЕТНАЯ РУКОЯТКА ============ */
  {
    const rake = D(21);
    const e2 = [0, -Math.cos(rake), Math.sin(rake)];
    const e3 = [0, -Math.sin(rake), -Math.cos(rake)];
    const O = [0, 25.5, -35], LEN = 100;
    const gsec = (t) => {
      const sw = Math.sin(PI * Math.min(1, t * 1.15));
      const hw = 14.6 + 1.5 * sw - 4.6 * Math.pow(t, 2.6);
      const grv = 0.75 * Math.cos(t * 20.5 - 1.2)
        * Math.min(1, Math.max(0, (t - 0.06) / 0.12)) * Math.min(1, Math.max(0, (0.92 - t) / 0.12));
      const df = 17.2 - 5.2 * Math.pow(t, 2.3) + grv;
      const dr = 15.8 + 2.4 * sw - 4.4 * Math.pow(t, 2.7);
      return cw(round([[-hw, -dr], [hw, -dr], [hw, df], [-hw, df]], 7.2));
    };
    const rings = [], NS = 40;
    for (let i = 0; i <= NS + 3; i++) {
      const t = Math.min(1, i / NS);
      const ex = Math.max(0, i - NS) / 3;
      const sc = 1 - 0.55 * ex * ex;
      const d = t * LEN + ex * 3.2;
      const o = [O[0] + e2[0] * d, O[1] + e2[1] * d, O[2] + e2[2] * d];
      rings.push(ringOf(gsec(t), (p) => [o[0] + p.x * sc, o[1] + p.y * e3[1] * sc, o[2] + p.y * e3[2] * sc]));
    }
    add('grip', 'poly', loft(rings, true, true));
    add('gripCollar', 'poly', boxZ(-15.4, 20.5, 15.4, 30.6, -57, -14, 6, 1.2));
    const bot = [O[0] + e2[0] * 103, O[1] + e2[1] * 103, O[2] + e2[2] * 103];
    add('gripScrew', 'steel', transform(cyl(4.2, 4.2, -1.4, 0.6, 20),
      mBasis([1, 0, 0], [0, e3[1], e3[2]], [0, -e2[1], -e2[2]], bot)));
  }

  /* ======================= ПРИКЛАД ================================ */
  const TOP = [[8, 92.2], [26, 92.0], [70, 90.2], [130, 88.0], [186, 86.6], [227, 86.0]];
  const BOT = [[8, 30.5], [24, 26.5], [60, 18.5], [110, 11.5], [170, 6.5], [227, 4.5]];
  const WID = [[8, 16.2], [30, 17.4], [80, 18.2], [150, 17.6], [200, 16.6], [227, 15.6]];
  function stockRing(z, shrink) {
    const top = lerpAt(TOP, z), bot = lerpAt(BOT, z), w = lerpAt(WID, z) - (shrink || 0);
    const yc = (top + bot) / 2, hh = (top - bot) / 2 - (shrink || 0) * 0.4;
    const c = superRing(w, hh, hh, 3.4, 60).map((p) => ({ x: p[0], y: yc + p[1], s: true }));
    return c.map((p) => {
      const u = (z - 116) / 52, v = (p.y - 47) / 21, d = Math.hypot(u, v);
      if (d >= 1) return p;
      const side = Math.min(1, Math.max(0, (Math.abs(p.x) / w - 0.55) / 0.3));
      const dep = 2.5 * Math.pow(Math.cos(d * PI / 2), 0.65) * side;
      return { x: p.x - Math.sign(p.x) * dep, y: p.y, s: true };
    });
  }
  {
    const zs = [];
    for (let z = 8; z <= 214; z += 6) zs.push(z);
    zs.push(218, 221);
    add('stock', WD, loft(zs.map((z) => ringOf(ccw(stockRing(z, 0)), (p) => [p.x, p.y, z])), true, true));

    const bp = [[220, 0.4], [222.5, -0.5], [226.5, -0.5], [228.2, 1.2], [229.2, 3.6]]
      .map(([z, sh]) => ringOf(ccw(stockRing(Math.min(z, 227), sh)), (p) => [p.x, p.y, z]));
    add('buttPlate', 'park', loft(bp, true, true));
    add('buttTrap', 'blued', tr(extrude(round([[-9, -13], [9, -13], [9, 13], [-9, 13]], 3.5),
      { z0: 228.4, z1: 229.6, ch: 0.4 }), 0, 46, 0));

    const loop = extrude({
      outer: round([[-11, -5], [11, -5], [11, 9], [-11, 9]], 5),
      holes: [circle(0, 2.5, 3.6, 18)]
    }, { z0: 0, z1: 2.6, ch: 0.5 });
    add('slingLoop', 'park', tr(ry(loop, -PI / 2), -17.6, 44, 62));
  }

  return parts;
};

});
__akdef("p_mag", function (module, exports) {
/* Магазин 5,45×39 на 30 патронов + патрон */
module.exports = function (G, H, C) {
  const { round, extrude, lathe, cyl, merge, tr, rx, ry, rz, loft, transform, mBasis, mMul, mRotX, mIdent, cw, offsetContour } = G;
  const { PI, D, BORE, Z, prof, ringOf } = H;
  const parts = [];
  const add = (n, m, g) => { parts.push({ name: n, mat: m, geo: g }); return g; };

  /* ---- геометрия дуги корпуса ---- */
  const R = 380, L = 172, TILT = D(5);
  const P0 = [-122, 42];                                  // (z, y) — верх магазина в окне коробки
  const T0 = [-Math.sin(TILT), -Math.cos(TILT)];
  const CEN = [P0[0] + R * T0[1], P0[1] - R * T0[0]];
  const rotm = (v, a) => [v[0] * Math.cos(a) + v[1] * Math.sin(a), -v[0] * Math.sin(a) + v[1] * Math.cos(a)];
  function frame(s) {
    const phi = s * L / R;
    const d = [P0[0] - CEN[0], P0[1] - CEN[1]];
    const rp = rotm(d, phi), P = [CEN[0] + rp[0], CEN[1] + rp[1]];
    const T = rotm(T0, phi);
    const N = [-T[1], T[0]];
    return { P, T, N };
  }
  /* локальные (x — поперёк, y — вверх по корпусу, z — к задней стенке) → мир */
  function mat(s) {
    const f = frame(s);
    return mBasis([1, 0, 0], [0, -f.T[1], -f.T[0]], [0, f.N[1], f.N[0]], [0, f.P[1], f.P[0]]);
  }
  const pt = (s, u, v) => {
    const f = frame(s);
    return [u, f.P[1] + v * f.N[1], f.P[0] + v * f.N[0]];
  };
  C.magFrame = mat;

  /* ---- сечение корпуса: 26 мм поперёк × 64 мм спереди-назад ---- */
  const HW = 13.0, HD = 32.0;
  const baseSec = round([[-HW, -HD, 8.5], [HW, -HD, 8.5], [HW, HD, 5.5], [-HW, HD, 5.5]], 0);
  function secAt(s, off) {
    const tu = 1 - 0.055 * s, tv = 1 - 0.045 * s;
    let c = baseSec.map((p) => ({ x: p.x * tu, y: p.y * tv, s: p.s }));
    if (off) c = offsetContour(c, -off);
    return c;
  }

  /* ---- станции с поперечными рёбрами жёсткости ---- */
  const ST = [];
  for (let i = 0; i <= 40; i++) ST.push({ s: i / 40 * 0.955, off: 0 });
  [0.20, 0.355, 0.51, 0.665, 0.82].forEach((rc) => {
    ST.push({ s: rc - 0.026, off: 0 }, { s: rc - 0.017, off: 0.85 },
      { s: rc + 0.017, off: 0.85 }, { s: rc + 0.026, off: 0 });
  });
  ST.push({ s: 0.955, off: 0 }, { s: 0.962, off: 1.6 }, { s: 0.995, off: 1.6 }, { s: 1.0, off: 0.9 });
  ST.sort((a, b) => a.s - b.s);

  const rings = ST.map((st) => {
    const c = G.ccw(secAt(st.s, st.off));
    const f = frame(st.s);
    return ringOf(c, (p) => [p.x, f.P[1] + p.y * f.N[1], f.P[0] + p.y * f.N[0]]);
  });
  add('magBody', 'plum', loft(rings, true, true));

  /* ---- зацеп спереди и опора защёлки сзади ---- */
  const localBox = (s, x0, y0, z0, x1, y1, z1, r) =>
    transform(extrude(round([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], r || 0.8),
      { z0, z1, ch: 0.4 }), mat(s));
  add('magLugFront', 'plum', localBox(0, -7.5, -17, -HD - 5.0, 7.5, -3, -HD + 1.5, 1.4));
  add('magLugRear', 'plum', localBox(0, -8.5, -23, HD - 1.5, 8.5, -4, HD + 5.4, 1.4));

  /* ---- тёмное нутро и верхний патрон ---- */
  add('magMouth', 'bore', transform(extrude(round([[-HW + 2.4, -HD + 3.0], [HW - 2.4, -HD + 3.0],
  [HW - 2.4, HD - 3.0], [-HW + 2.4, HD - 3.0]], 4.5), { z0: -6, z1: -2.5, ch: 0 }),
    mMul(mat(0), mRotX(-PI / 2))));

  /* ---- патрон 5,45×39 ---- */
  function cartridge(withBullet) {
    const g = [];
    g.push(lathe(prof([
      [0, 0], [5.0, 0], [5.0, 1.2], [4.9, 1.6, 's'], [4.75, 6], [4.6, 25, 's'],
      [4.55, 30], [3.3, 37.5, 's'], [3.15, 39.8]
    ].map((p) => [p[0], p[1], p[2]])), 26, false));
    if (withBullet) {
      g.push(lathe(prof([
        [3.15, 39.8], [2.9, 41], [2.85, 44, 's'], [2.6, 49, 's'], [1.9, 53.5, 's'], [0.9, 56.4, 's'], [0, 57]
      ].map((p) => [p[0], p[1], p[2]])), 26, false));
    }
    return merge(g);
  }
  const caseGeo = cartridge(false), fullGeo = cartridge(true);
  C.spentCase = caseGeo;
  C.cartridge = fullGeo;

  /* верхний патрон в горловине (виден при смене магазина) */
  add('magTopRound', 'brass', tr(ry(fullGeo, PI), 0, 38.6, -94.5));

  return parts;
};

});
__akdef("p_intern", function (module, exports) {
/* Затворная рама, рукоятка взведения, УСМ, переводчик */
module.exports = function (G, H, C) {
  const { round, extrude, lathe, cyl, tube, merge, tr, rx, ry, rz, loft } = G;
  const { PI, D, BORE, Z, prof, plateZY, boxZ, boxX, pinX, ribsZ, ringOf } = H;
  const parts = [];
  const add = (n, m, g) => { parts.push({ name: n, mat: m, geo: g }); return g; };
  const GY = C.GAS_Y || (BORE + 21);

  /* ===================== ЗАТВОРНАЯ РАМА ===================== */
  {
    const g = [];
    /* корпус рамы */
    g.push(boxZ(-12.8, 62, 12.8, 86, -204, -70, 4.5, 1.2));
    /* верхний гребень */
    g.push(boxZ(-8.5, 84, 8.5, 90, -198, -96, 2.5, 0.8));
    /* стойка к газовому поршню */
    g.push(boxZ(-5.5, 84, 5.5, GY + 2, -202, -178, 2, 0.6));
    /* шток поршня + поршень */
    g.push(tr(cyl(4.6, 4.6, -344, -186, 20), 0, GY, 0));
    g.push(tr(lathe(prof([[0, -358], [7.4, -358], [7.4, -352], [6.2, -350, 's'], [6.2, -344],
    [7.4, -342, 's'], [7.4, -336], [4.6, -334], [0, -334]]), 26, true), 0, GY, 0));
    /* возвратная пружина (видна в окне при откате) */
    add('boltCarrier', 'blued', merge(g));

    /* затвор */
    add('bolt', 'steel', merge([
      tr(lathe(prof([[0, -212], [8.6, -212], [8.6, -206], [7.2, -204, 's'], [7.2, -190],
      [8.4, -188, 's'], [8.4, -182], [0, -182]]), 30, true), 0, BORE, 0),
      tr(cyl(2.9, 2.9, -182, -168, 16), 0, BORE, 0)
    ]));

    /* рукоятка взведения */
    add('charging', 'blued', merge([
      boxX(-160, 82.5, -148, 90.5, 11.5, 20, 2, 0.6),
      boxX(-159, 81.5, -149, 91.5, 20, 23.5, 3, 0.8),
      tr(rx(cyl(5.2, 4.6, 0, 6.5, 22), 0), 23.2, 86.5, -154) &&
      tr(ry(cyl(5.4, 4.8, 0, 6.2, 24), PI / 2), 23.2, 86.5, -154)
    ]));
  }

  /* ===================== УСМ ===================== */
  add('triggerGuard', 'park', plateZY([
    [-24, 31], [-27, 8, 7], [-70, 1.5, 12], [-86, 24, 9], [-93, 31],
    [-86.5, 31], [-82, 25, 7], [-68, 8, 9], [-34, 12.5, 7], [-31.5, 31]
  ], -11, 11, 0.8));

  add('trigger', 'blued', plateZY([
    [-42, 37], [-53, 37], [-60, 24, 7], [-61.5, 11, 5], [-56, 5.5, 4.5],
    [-52.5, 13, 8], [-49, 26, 9], [-42, 31]
  ], -3.2, 3.2, 0.7));

  /* защёлка магазина */
  add('magCatch', 'park', merge([
    plateZY([[-88, 30], [-88, 14, 3], [-79, 12, 3], [-76, 24, 4], [-78, 30]], -5.5, 5.5, 0.6),
    pinX(-7.5, 7.5, 2.2, 27, -86, true)
  ]));

  /* ===================== ПЕРЕВОДЧИК ===================== */
  add('selector', 'park', merge([
    plateZY([[-38, 49], [-40, 66, 6], [-106, 86, 7], [-118, 82, 3], [-112, 74, 6], [-46, 55, 8], [-44, 49]], 17.8, 21.0, 0.7),
    tr(ry(cyl(6.5, 6.5, 0, 4.2, 24), PI / 2), 16.5, 55, -41),
    ribsZ(4, -117, -106, 20.6, 21.6, 82, 0.8, 2.2)
  ]));

  /* хвостовик направляющего стержня возвратной пружины */
  add('springTail', 'blued', merge([
    tr(cyl(4.6, 4.6, 4, 13.5, 20), 0, 99, 0),
    tr(cyl(6.2, 6.2, 12.5, 14.6, 20), 0, 99, 0)
  ]));

  return parts;
};

});
__akdef("model", function (module, exports) {
/* Сборка модели АК-74: группы, узлы, материалы */
module.exports = function (G, H, MODULES, opts) {
  const C = Object.assign({ furniture: 'wood' }, opts || {});
  const BORE = H.BORE;
  const parts = [];
  for (let i = 0; i < MODULES.length; i++) {
    const r = MODULES[i](G, H, C);
    for (let k = 0; k < r.length; k++) { r[k].geo = G.clean(r[k].geo); parts.push(r[k]); }
  }

  /* подвижные группы */
  const GRP = {
    magBody: 'magazine', magLugFront: 'magazine', magLugRear: 'magazine',
    magMouth: 'magazine', magTopRound: 'magazine',
    boltCarrier: 'bolt', bolt: 'bolt', charging: 'bolt',
    trigger: 'trigger', selector: 'selector'
  };

  const order = [];
  const buckets = {};
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const grp = GRP[p.name] || 'body';
    const key = grp + '|' + p.mat;
    if (!buckets[key]) { buckets[key] = { group: grp, mat: p.mat, list: [] }; order.push(key); }
    buckets[key].list.push(p.geo);
  }
  const meshes = order.map((k) => ({
    name: k, group: buckets[k].group, mat: buckets[k].mat, geo: G.merge(buckets[k].list)
  }));

  let tris = 0;
  for (let i = 0; i < meshes.length; i++) tris += meshes[i].geo.p.length / 9;

  const SY = C.SIGHT_Y || 116;
  const nodes = {
    muzzle: [0, BORE, -719],
    muzzleDir: [0, 0, -1],
    chamber: [0, BORE, -200],
    eject: [19, 80, -146],
    ejectDir: [0.86, 0.46, 0.22],
    sightRear: [0, SY, -248.5],
    sightFront: [0, SY, -626],
    sightAxis: [0, 0, -1],
    eye: [0, SY, -60],
    gripR: [0, -12, -72],
    gripL: [0, 52, -400],
    magSeat: [0, 0, 0],
    magDrop: [0, -152, -14],
    chargeRest: [0, 0, 0],
    chargePull: [0, 0, 106],
    boltRest: [0, 0, 0],
    boltTravel: [0, 0, 106],
    triggerPivot: [0, 34, -46],
    triggerPull: 0.20,
    selectorPivot: [19, 55, -41],
    caseSpawn: [10, 76, -186]
  };

  return {
    meshes: meshes,
    parts: parts,
    nodes: nodes,
    mats: H.MATS,
    extra: { spentCase: C.spentCase, cartridge: C.cartridge },
    stats: { tris: tris, parts: parts.length, meshes: meshes.length },
    C: C
  };
};

});



/* ================== СБОРКА THREE-ОБЪЕКТА ==================================
   Вся процедурная геометрия считается в миллиметрах и переводится в метры.
   ========================================================================= */
function buildAK74(THREE, opts) {
  opts = opts || {};
  const G = __AKM.geom;
  const H = __AKM.helpers(G);
  const M = __AKM.model(G, H,
    [__AKM.p_receiver, __AKM.p_barrel, __AKM.p_furn, __AKM.p_mag, __AKM.p_intern],
    { furniture: opts.furniture || 'wood' });

  /* ATTACH: детали, заменённые модулями */
  /* Дульный тормоз, цевьё, приклад и магазин приходят из системы модулей,
     поэтому одноимённые детали базовой модели исключаются из сборки. */
  if (opts.dropParts && opts.dropParts.length) {
    const drop = new Set(opts.dropParts);
    M.parts = M.parts.filter((p) => !drop.has(p.name));
    M.meshes = (function () {
      const buckets = {}, order = [];
      const GRP = {
        magBody: 'magazine', magLugFront: 'magazine', magLugRear: 'magazine',
        magMouth: 'magazine', magTopRound: 'magazine',
        boltCarrier: 'bolt', bolt: 'bolt', charging: 'bolt',
        trigger: 'trigger', selector: 'selector'
      };
      for (const p of M.parts) {
        const grp = GRP[p.name] || 'body', key = grp + '|' + p.mat;
        if (!buckets[key]) { buckets[key] = { group: grp, mat: p.mat, list: [] }; order.push(key); }
        buckets[key].list.push(p.geo);
      }
      return order.map((k) => ({ name: k, group: buckets[k].group, mat: buckets[k].mat,
        geo: G.merge(buckets[k].list) }));
    })();
  }

  const S = 0.001;                              // мм -> м
  const geos = [], matList = [], matMap = {};
  const DOUBLE = { bore: 1 };

  const mkMat = (key) => {
    if (matMap[key]) return matMap[key];
    const d = M.mats[key] || M.mats.park;
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(d.color[0], d.color[1], d.color[2]),
      metalness: d.metal,
      roughness: d.rough
    });
    if (DOUBLE[key]) m.side = THREE.DoubleSide;
    if (key === 'wood' || key === 'woodDk') m.envMapIntensity = 0.6;
    matMap[key] = m; matList.push(m);
    return m;
  };

  const toGeo = (raw, off) => {
    const n = raw.p.length;
    const pos = new Float32Array(n), nrm = new Float32Array(n);
    const ox = off ? off[0] : 0, oy = off ? off[1] : 0, oz = off ? off[2] : 0;
    for (let i = 0; i < n; i += 3) {
      pos[i] = (raw.p[i] - ox) * S;
      pos[i + 1] = (raw.p[i + 1] - oy) * S;
      pos[i + 2] = (raw.p[i + 2] - oz) * S;
      nrm[i] = raw.n[i]; nrm[i + 1] = raw.n[i + 1]; nrm[i + 2] = raw.n[i + 2];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.computeBoundingSphere();
    geos.push(g);
    return g;
  };

  const group = new THREE.Group();
  group.name = 'AK-74';
  const N = M.nodes;
  const PIV = {
    body: [0, 0, 0], magazine: [0, 0, 0], bolt: [0, 0, 0],
    trigger: N.triggerPivot, selector: N.selectorPivot
  };
  const SUB = { body: group };
  ['magazine', 'bolt', 'trigger', 'selector'].forEach((k) => {
    const g = new THREE.Group();
    g.name = k;
    g.position.set(PIV[k][0] * S, PIV[k][1] * S, PIV[k][2] * S);
    group.add(g);
    SUB[k] = g;
  });

  for (let i = 0; i < M.meshes.length; i++) {
    const m = M.meshes[i];
    const mesh = new THREE.Mesh(toGeo(m.geo, PIV[m.group] || [0, 0, 0]), mkMat(m.mat));
    mesh.name = m.name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    (SUB[m.group] || group).add(mesh);
  }

  /* ---- узлы-ориентиры (Object3D в системе оружия) ---- */
  const nodes = {};
  const nd = (name, v) => {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(v[0] * S, v[1] * S, v[2] * S);
    group.add(o);
    nodes[name] = o;
    return o;
  };
  ['muzzle', 'chamber', 'eject', 'sightRear', 'sightFront', 'eye', 'gripR', 'gripL',
    'magSeat', 'magDrop', 'chargeRest', 'chargePull', 'boltRest', 'boltTravel',
    'triggerPivot', 'selectorPivot', 'caseSpawn'].forEach((k) => nd(k, N[k]));
  nodes.sight = nodes.sightRear;            // совместимость со старым API
  nodes.ironSight = nodes.sightFront;
  nodes.handguard = nodes.gripL;

  group.nodes = nodes;
  group.dirs = { muzzle: N.muzzleDir, eject: N.ejectDir, sight: N.sightAxis };
  group.anim = { triggerPull: N.triggerPull, boltTravel: N.boltTravel[2] * S };
  group.parts = {
    magazine: SUB.magazine, bolt: SUB.bolt, charging: SUB.bolt,
    trigger: SUB.trigger, selector: SUB.selector
  };
  group.extra = {
    caseGeo: toGeo(M.extra.spentCase, [0, 0, 0]),
    cartGeo: toGeo(M.extra.cartridge, [0, 0, 0]),
    brass: mkMat('brass'), copper: mkMat('copper'), lead: mkMat('lead')
  };
  group.stats = M.stats;
  group.dispose = () => {
    geos.forEach((g) => g.dispose());
    matList.forEach((m) => m.dispose());
  };
  return group;
}
// ==== МОДЕЛЬ: КОНЕЦ ====
