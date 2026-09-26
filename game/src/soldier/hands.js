/* ============================================================================
   Кисти бойца: перчатка, пальцы и хват оружия.

   1. ПЕРЧАТКА строится процедурно по суставам модели: ладонь, четыре пальца
      по три фаланги, большой палец с тенаром, манжета и жёсткая защита
      костяшек. У каждого пальца своя трубка и свои веса, поэтому при сгибе
      пальцы не слипаются в «варежку», как у исходного меша MakeHuman.
   2. ХВАТ задаётся от оружия: где лежит пястно-фаланговый сустав среднего
      пальца и куда смотрят пальцы и тыльная сторона кисти. Отсюда
      вычисляются положение и поворот запястья для IK руки.
   3. ПАЛЬЦЫ ЗАМЫКАЮТСЯ НА ПОВЕРХНОСТЬ: фаланги по очереди, от основания к
      кончику, сгибаются, пока не коснутся рукоятки или цевья (формы заданы
      SDF в системе оружия). Так пальцы обхватывают реальную форму, а
      указательный либо лежит вдоль ствольной коробки, либо на спуске.

   Система покоя кисти (T-поза): пальцы вдоль ±X (своя сторона), ладонь
   вниз (-Y), большой палец вперёд (-Z). Размеры — метры.
   ========================================================================== */
(function (root, factory) {
  const H = factory(root.GUtil, root.GSkel);
  if (typeof module !== 'undefined' && module.exports) module.exports = H;
  else root.GHands = H;
})(typeof self !== 'undefined' ? self : this, function (U, SK) {
  'use strict';

  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const madd = (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const sstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const gauss = (x, s) => Math.exp(-(x * x) / (2 * s * s));
  const spow = (x, p) => Math.sign(x) * Math.pow(Math.abs(x), p);

  const FKEYS = ['index', 'middle', 'ring', 'pinky'];
  /* Сечение пальца в перчатке: полуширина w, полутолщина h. Центр сечения
     лежит на C_OFF ниже линии суставов — у модели кость проходит ближе к
     тыльной стороне. Эти же числа берёт решатель касаний. */
  const FDIM = {
    index: { w: 0.0094, h: 0.0088 },
    middle: { w: 0.0097, h: 0.0091 },
    ring: { w: 0.0092, h: 0.0086 },
    pinky: { w: 0.0080, h: 0.0076 },
    thumb: { w: 0.0118, h: 0.0104 }
  };
  const C_OFF = 0.0045;

  /* =============================================== геометрия перчатки == */
  function Acc() { this.p = []; this.uv = []; this.c = []; this.si = []; this.sw = []; this.ix = []; this.grids = []; }
  Acc.prototype.count = function () { return this.p.length / 3; };
  Acc.prototype.vert = function (p, uv, col, w) {
    this.p.push(p[0], p[1], p[2]);
    this.uv.push(uv[0], uv[1]);
    this.c.push(col[0], col[1], col[2]);
    const ws = w.filter((e) => e[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const tot = ws.reduce((s, e) => s + e[1], 0) || 1;
    for (let i = 0; i < 4; i++) { this.si.push(ws[i] ? ws[i][0] : 0); this.sw.push(ws[i] ? ws[i][1] / tot : 0); }
    return this.count() - 1;
  };

  /* Трубка по кольцам. Кольцо: c — центр, t — ось, up — тыльная сторона,
     rx — полуширина, top/bot — полутолщина к тылу/к ладони, sq — степень
     суперэллипса (2 — эллипс, больше — «кирпичик»), v — длина вдоль оси.
     shape(x, y, cs, sn, R) деформирует сечение, weight(p, R, sn) и
     color(R, k, cs, sn) дают веса и тон вершины. */
  function tube(acc, rings, N, fn) {
    const base = acc.count();
    const rows = rings.length, cols = N + 1;
    for (const R of rings) {
      const side = norm(cross(R.t, R.up));
      const up = norm(cross(side, R.t));
      const circ = Math.PI * (R.rx + (R.top + R.bot) / 2);
      for (let k = 0; k <= N; k++) {
        const th = (k % N) / N * Math.PI * 2;
        const cs = Math.cos(th), sn = Math.sin(th);
        let x = R.rx * spow(cs, 2 / R.sq);
        let y = (sn >= 0 ? R.top : R.bot) * spow(sn, 2 / R.sq);
        if (fn.shape) { const q = fn.shape(x, y, cs, sn, R); x = q[0]; y = q[1]; }
        const p = add(R.c, add(mul(side, x), mul(up, y)));
        acc.vert(p, [k / N * circ, R.v], fn.color ? fn.color(R, k, cs, sn) : [1, 1, 1],
          fn.weight ? fn.weight(p, R, sn) : R.w);
      }
    }
    for (let i = 0; i < rows - 1; i++) {
      for (let k = 0; k < N; k++) {
        const a = base + i * cols + k, b = a + 1, c = a + cols + 1, d = a + cols;
        acc.ix.push(a, d, c, a, c, b);
      }
    }
    const grid = { base, rows, cols, N, centers: rings.map((r) => r.c) };
    acc.grids.push(grid);
    /* закрытые торцы: веер к точке на оси */
    if (fn.tip) {
      const R = rings[rows - 1];
      grid.tip = acc.vert(fn.tip, [0, R.v + 0.002], fn.color ? fn.color(R, 0, 1, 0) : [1, 1, 1], fn.weight ? fn.weight(fn.tip, R, 0) : R.w);
      const r0 = base + (rows - 1) * cols;
      for (let k = 0; k < N; k++) acc.ix.push(r0 + k, grid.tip, r0 + k + 1);
    }
    if (fn.start) {
      const R = rings[0];
      grid.start = acc.vert(fn.start, [0, R.v - 0.002], fn.color ? fn.color(R, 0, 1, 0) : [1, 1, 1], fn.weight ? fn.weight(fn.start, R, 0) : R.w);
      for (let k = 0; k < N; k++) acc.ix.push(base + k + 1, grid.start, base + k);
    }
    return grid;
  }

  /* Нормали по сетке трубки: соседи по окружности и по оси. Шов u=0/1
     считается как одна вершина, поэтому по нему нет излома. */
  function gridNormals(acc) {
    const P = acc.p, n = new Float32Array(P.length);
    const at = (i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
    for (const g of acc.grids) {
      const idx = (r, c) => g.base + r * g.cols + ((c + g.N) % g.N);
      for (let i = 0; i < g.rows; i++) {
        for (let k = 0; k < g.cols; k++) {
          const kk = k % g.N;
          const pA = at(idx(i, kk + 1)), pB = at(idx(i, kk - 1));
          const i0 = Math.max(0, i - 1), i1 = Math.min(g.rows - 1, i + 1);
          let pC = at(idx(i1, kk)), pD = at(idx(i0, kk));
          if (i1 === i && g.tip !== undefined) pC = at(g.tip);
          if (i0 === i && g.start !== undefined) pD = at(g.start);
          let nn = norm(cross(sub(pC, pD), sub(pA, pB)));
          const me = at(g.base + i * g.cols + k);
          if (dot(nn, sub(me, g.centers[i])) < 0) nn = mul(nn, -1);
          const o = (g.base + i * g.cols + k) * 3;
          n[o] = nn[0]; n[o + 1] = nn[1]; n[o + 2] = nn[2];
        }
      }
      for (const key of ['tip', 'start']) {
        if (g[key] === undefined) continue;
        const r = key === 'tip' ? g.rows - 1 : 0, r2 = key === 'tip' ? Math.max(0, g.rows - 2) : Math.min(g.rows - 1, 1);
        const d = norm(sub(g.centers[r], g.centers[r2]));
        const o = g[key] * 3;
        n[o] = d[0]; n[o + 1] = d[1]; n[o + 2] = d[2];
      }
    }
    return n;
  }

  /* точка на ломаной по длине дуги */
  function polyAt(pts, cum, s) {
    let i = 0;
    while (i < pts.length - 2 && cum[i + 1] < s) i++;
    const seg = cum[i + 1] - cum[i] || 1;
    const t = clamp((s - cum[i]) / seg, 0, 1.5);
    return { p: lerp3(pts[i], pts[i + 1], t), t: norm(sub(pts[i + 1], pts[i])), i };
  }
  function cumLen(pts) {
    const c = [0];
    for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + len(sub(pts[i], pts[i - 1])));
    return c;
  }
  /* плавный переход веса между костями на суставах */
  function chainWeights(bones, joints, s, blends) {
    let w = [[bones[0], 1]];
    for (let j = 0; j < joints.length; j++) {
      const k = sstep(joints[j] - blends[j][0], joints[j] + blends[j][1], s);
      if (k <= 0) break;
      w = w.map((e) => [e[0], e[1] * (1 - k)]);
      w.push([bones[j + 1], k]);
    }
    return w;
  }

  const COL = {
    back: [1, 1, 1],
    palm: [1.32, 1.28, 1.20],        // синтетическая замша ладони светлее тыла
    seam: [0.62, 0.62, 0.62],
    strap: [0.78, 0.78, 0.78],
    tip: [1.30, 1.26, 1.20]
  };

  function buildHand(acc, arm, J, BI, s) {
    const S = s > 0 ? 'R' : 'L';
    const W = J['wrist' + S];
    const bw = BI['wrist' + S];
    const bf = BI['foreTwist' + S] !== undefined ? BI['foreTwist' + S] : BI['elbow' + S];
    const X = [s, 0, 0], Y = [0, 1, 0];
    const lx = (p) => s * (p[0] - W[0]);                 // вдоль кисти от запястья
    const F = {};
    for (const k of FKEYS) F[k] = [1, 2, 3, 4].map((i) => J[k + S + i]);
    const mcpZ = FKEYS.map((k) => F[k][0][2]);
    const mcpX = FKEYS.map((k) => lx(F[k][0]));
    /* линия пястно-фаланговых суставов x(z) по четырём пальцам */
    const lineX = (z) => {
      if ((z - mcpZ[0]) * (mcpZ[3] - mcpZ[0]) <= 0) return mcpX[0];
      for (let i = 0; i < 3; i++) {
        const t = (z - mcpZ[i]) / (mcpZ[i + 1] - mcpZ[i]);
        if (t >= 0 && t <= 1) return lerp(mcpX[i], mcpX[i + 1], t);
      }
      return mcpX[3];
    };
    const zIdx = mcpZ[0] - FDIM.index.w * 1.05, zPnk = mcpZ[3] + FDIM.pinky.w * 1.05;
    const boneY = (t) => lerp(W[1], (F.middle[0][1] + F.index[0][1]) / 2, t);
    const nearestFinger = (z) => {
      let best = 0, bd = Infinity;
      for (let i = 0; i < 4; i++) { const d = Math.abs(z - mcpZ[i]); if (d < bd) { bd = d; best = i; } }
      return FKEYS[best];
    };

    /* ---- ладонь: суперэллипс, спереди срезанный по линии суставов ---- */
    {
      const rings = [];
      const NR = 16;
      const zc0 = W[2] - 0.0016, hw0 = 0.0318;
      const zc1 = (zIdx + zPnk) / 2, hw1 = (zPnk - zIdx) / 2;
      for (let i = 0; i <= NR; i++) {
        const t = i / NR;
        const zc = lerp(zc0, zc1, sstep(0, 0.75, t)), hw = lerp(hw0, hw1, sstep(0, 0.6, t));
        const top = lerp(0.0122, 0.0102, t) + 0.0012 * Math.sin(Math.PI * t);
        const bot = lerp(0.0215, 0.0180, sstep(0.45, 1, t)) + 0.0012 * Math.sin(Math.PI * Math.min(1, t * 1.4));
        rings.push({ c: [W[0], boneY(t) - 0.004, zc], t: X, up: Y, rx: hw, top, bot, sq: 3.1, v: t * 0.1 });
      }
      const g = tube(acc, rings, 36, {
        /* свод кисти: тыл выпуклее посередине */
        shape: (x, y, cs, sn, R) => [x, y + (sn > 0 ? 0.0028 * (1 - Math.pow(x / R.rx, 2)) * sn : 0)],
        weight: (p) => {
          const z = p[2], xl = lx(p);
          const w = [[bw, 1]];
          const kf = sstep(-0.006, 0.010, -xl) * 0.85;     // за суставом — к предплечью
          if (kf > 0) { w[0][1] = 1 - kf; w.push([bf, kf]); }
          const kk = sstep(-0.016, 0.004, xl - lineX(z)) * 0.45;
          if (kk > 0) { for (const e of w) e[1] *= 1 - kk; w.push([BI[nearestFinger(z) + S + '1'], kk]); }
          return w;
        },
        color: (R, k, cs, sn) => (sn < -0.2 ? COL.palm : COL.back)
      });
      /* доля пути t -> реальная координата вдоль кисти: у мизинца линия
         суставов ближе к запястью, чем у указательного */
      for (let i = 0; i < g.rows; i++) {
        const t = i / (g.rows - 1);
        for (let k = 0; k < g.cols; k++) {
          const o = (g.base + i * g.cols + k) * 3;
          const xEnd = lineX(clamp(acc.p[o + 2], zIdx, zPnk)) + 0.004;
          acc.p[o] = W[0] + s * lerp(-0.012, xEnd, t);
        }
        g.centers[i] = [W[0] + s * lerp(-0.012, lineX((zIdx + zPnk) / 2) + 0.004, t), g.centers[i][1], g.centers[i][2]];
      }
      /* веса пересчитываются по сдвинутым позициям */
      const wf = (p) => {
        const z = p[2], xl = lx(p);
        const w = [[bw, 1]];
        const kf = sstep(-0.006, 0.010, -xl) * 0.85;
        if (kf > 0) { w[0][1] = 1 - kf; w.push([bf, kf]); }
        const kk = sstep(-0.016, 0.004, xl - lineX(z)) * 0.45;
        if (kk > 0) { for (const e of w) e[1] *= 1 - kk; w.push([BI[nearestFinger(z) + S + '1'], kk]); }
        return w.filter((e) => e[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
      };
      for (let v = g.base; v < g.base + g.rows * g.cols; v++) {
        const w = wf([acc.p[v * 3], acc.p[v * 3 + 1], acc.p[v * 3 + 2]]);
        const tot = w.reduce((a, e) => a + e[1], 0) || 1;
        for (let i = 0; i < 4; i++) { acc.si[v * 4 + i] = w[i] ? w[i][0] : 0; acc.sw[v * 4 + i] = w[i] ? w[i][1] / tot : 0; }
      }
    }

    /* ---- пальцы ---- */
    for (const k of FKEYS) {
      const P = F[k], D = FDIM[k];
      const dir0 = norm(sub(P[1], P[0]));
      const pts = [madd(P[0], dir0, -0.016), P[0], P[1], P[2], P[3]];
      const cum = cumLen(pts);
      const sJ = [cum[1], cum[2], cum[3]];
      const total = cum[4];
      const capR = D.h * 0.82;
      const sEnd = total - capR * 0.95;
      const bones = [bw, BI[k + S + '1'], BI[k + S + '2'], BI[k + S + '3']];
      const rings = [];
      const ringAt = (sa, scale, dz) => {
        const q = polyAt(pts, cum, Math.min(sa, total));
        const u = clamp((sa - sJ[0]) / (total - sJ[0]), 0, 1);
        const taper = lerp(1.03, 0.80, Math.pow(u, 1.25));
        const kn = 0.0026 * gauss(sa - sJ[0], 0.0055) + 0.0017 * gauss(sa - sJ[1], 0.0040) + 0.0009 * gauss(sa - sJ[2], 0.0030);
        const cr = 0.0010 * (gauss(sa - sJ[1], 0.0016) + gauss(sa - sJ[2], 0.0014));
        const pad = 0.0010 * (gauss(sa - (sJ[1] + sJ[0]) / 2, 0.006) + gauss(sa - (sJ[2] + sJ[1]) / 2, 0.005) + gauss(sa - (total + sJ[2]) / 2, 0.005));
        return {
          c: madd(madd(q.p, q.t, dz || 0), Y, -C_OFF), t: q.t, up: Y,
          rx: D.w * taper * scale, top: (D.h * taper + kn) * scale, bot: (D.h * taper - cr + pad) * scale, sq: 2.7, v: sa,
          w: chainWeights(bones, sJ, sa, [[0.004, 0.007], [0.0035, 0.0045], [0.003, 0.0035]])
        };
      };
      for (let sa = 0; sa < sEnd; sa += 0.0022) rings.push(ringAt(sa, 1));
      rings.push(ringAt(sEnd, 1));
      /* скруглённый кончик: четверть окружности по сечению пальца */
      for (let i = 1; i <= 6; i++) {
        const a = i / 7 * Math.PI / 2;
        rings.push(Object.assign(ringAt(sEnd, Math.cos(a), capR * Math.sin(a)), { v: sEnd + capR * Math.sin(a) }));
      }
      tube(acc, rings, 18, {
        tip: madd(madd(P[3], dir0, 0.0008), Y, -C_OFF),
        color: (R, kk, cs, sn) => {
          if (Math.abs(sn) < 0.28) return COL.seam;               // боковой шов
          if (sn < 0 && R.v > sJ[2] + 0.004) return COL.tip;     // накладка на подушечке
          return sn < -0.1 ? COL.palm : COL.back;
        }
      });

      /* жёсткая накладка на основной фаланге */
      const a0 = sJ[0] + 0.007, a1 = sJ[1] - 0.005;
      const pr = [];
      for (let i = 0; i <= 6; i++) {
        const sa = lerp(a0, a1, i / 6);
        const q = polyAt(pts, cum, sa);
        const hh = D.h + 0.0021 * gauss(sa - sJ[0], 0.0055) + 0.0006;
        pr.push({ c: madd(q.p, Y, -C_OFF + hh + 0.0012), t: q.t, up: Y, rx: D.w * 0.78, top: 0.0019, bot: 0.0010, sq: 2.8, v: sa, w: [[bones[1], 1]] });
      }
      tube(arm, pr, 12, { tip: madd(pr[6].c, pr[6].t, 0.002), start: madd(pr[0].c, pr[0].t, -0.002) });
    }

    /* ---- большой палец: от тенара у запястья до кончика ---- */
    {
      const T = [1, 2, 3, 4].map((i) => J['thumb' + S + i]);
      const D = FDIM.thumb;
      const T0 = [W[0] + s * 0.024, W[1] - 0.011, W[2] - 0.019];
      const pts = [T0, T[0], T[1], T[2], T[3]];
      const cum = cumLen(pts);
      const sJ = [cum[1], cum[2], cum[3]];
      const total = cum[4];
      const capR = D.h * 0.84, sEnd = total - capR * 0.95;
      const bones = [bw, BI['thumb' + S + '1'], BI['thumb' + S + '2'], BI['thumb' + S + '3']];
      const tdir = norm(sub(T[3], T[1]));
      /* тыльная сторона большого пальца — вверх и наружу от ладони */
      const u0 = madd(Y, [0, 0, -1], 0.35);
      const tup = norm(madd(u0, tdir, -dot(u0, tdir)));
      const rings = [];
      const ringAt = (sa, scale, dz) => {
        const q = polyAt(pts, cum, Math.min(sa, total));
        const u = clamp(sa / sJ[1], 0, 1);                       // 0 — тенар, 1 — пястно-фаланговый
        const w0 = lerp(0.0175, D.w, sstep(0, 1, u)), h0 = lerp(0.0135, D.h, sstep(0, 1, u));
        const taper = lerp(1, 0.9, clamp((sa - sJ[1]) / (total - sJ[1]), 0, 1));
        const kn = 0.0012 * gauss(sa - sJ[1], 0.005) + 0.0007 * gauss(sa - sJ[2], 0.0035);
        return {
          c: madd(madd(q.p, q.t, dz || 0), tup, -C_OFF * 0.8), t: q.t, up: tup,
          rx: w0 * taper * scale, top: (h0 * taper + kn) * scale, bot: h0 * taper * scale, sq: 2.2, v: sa,
          w: chainWeights(bones, sJ, sa, [[sJ[0] - 0.004, 0.006], [0.004, 0.005], [0.0035, 0.0035]])
        };
      };
      for (let sa = 0.004; sa < sEnd; sa += 0.0024) rings.push(ringAt(sa, 1));
      rings.push(ringAt(sEnd, 1));
      for (let i = 1; i <= 6; i++) {
        const a = i / 7 * Math.PI / 2;
        rings.push(Object.assign(ringAt(sEnd, Math.cos(a), capR * Math.sin(a)), { v: sEnd + capR * Math.sin(a) }));
      }
      tube(acc, rings, 18, {
        tip: madd(madd(T[3], norm(sub(T[3], T[2])), 0.0008), tup, -C_OFF * 0.8),
        color: (R, kk, cs, sn) => (Math.abs(sn) < 0.25 ? COL.seam : (sn < -0.1 ? (R.v > sJ[2] ? COL.tip : COL.palm) : COL.back))
      });
    }

    /* ---- манжета с липучкой: от предплечья (под рукавом) до запястья ---- */
    {
      const rings = [];
      for (let i = 0; i <= 12; i++) {
        const xl = lerp(-0.052, 0.006, i / 12);
        const g = sstep(-0.052, -0.004, xl);
        const strap = sstep(-0.036, -0.032, xl) * (1 - sstep(-0.012, -0.008, xl));
        rings.push({
          c: [W[0] + s * xl, W[1] - 0.0045, W[2] - 0.0016], t: X, up: Y,
          rx: lerp(0.0352, 0.0322, g) + strap * 0.0014, top: lerp(0.0232, 0.0196, g) + strap * 0.0018,
          bot: lerp(0.0232, 0.0200, g) + strap * 0.0008, sq: 2.3, v: xl, strap
        });
      }
      tube(acc, rings, 36, {
        weight: (p) => { const k = sstep(-0.016, 0.004, lx(p)); return [[bf, 1 - k], [bw, k]]; },
        color: (R) => (R.strap > 0.5 ? COL.strap : COL.back)
      });
    }

    /* ---- защита костяшек: сегмент над каждым суставом, низкий профиль —
       при сжатом кулаке сегменты расходятся вместе с суставами ---- */
    for (const k of FKEYS) {
      const P = F[k][0], D = FDIM[k];
      const c0 = [P[0] - s * 0.002, P[1] - C_OFF + D.h + 0.0026 + 0.0012, P[2]];
      const zdir = [0, 0, 1], half = D.w * 1.02;
      const rings = [];
      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        rings.push({ c: madd(c0, zdir, (t - 0.5) * 2 * half), t: zdir, up: Y, rx: 0.0092, top: 0.0022 * (1 - 0.35 * Math.pow(2 * t - 1, 2)), bot: 0.0010, sq: 2.8, v: t * half * 2 });
      }
      tube(arm, rings, 14, {
        tip: madd(rings[6].c, zdir, 0.0015), start: madd(rings[0].c, zdir, -0.0015),
        weight: () => [[bw, 0.55], [BI[k + S + '1'], 0.45]]
      });
    }
  }

  function toGeometry(THREE, acc) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(acc.p), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(gridNormals(acc), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(acc.uv), 2));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(acc.c), 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(acc.si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(acc.sw), 4));
    g.setIndex(acc.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(acc.ix, 1) : new THREE.Uint16BufferAttribute(acc.ix, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 1.2);
    return g;
  }

  const gloveCache = new Map();
  /* Перчатки обеих рук: { glove, gloveArmor } — BufferGeometry со скиннингом. */
  function gloveGeometry(THREE, J, BI, key) {
    const k = key || 'default';
    if (gloveCache.has(k)) return gloveCache.get(k);
    const acc = new Acc(), arm = new Acc();
    buildHand(acc, arm, J, BI, 1);
    buildHand(acc, arm, J, BI, -1);
    const out = { glove: toGeometry(THREE, acc), gloveArmor: toGeometry(THREE, arm) };
    gloveCache.set(k, out);
    return out;
  }

  /* Материалы: трикотажный тыл с нормалью ткани, светлая замша ладони
     (через цвет вершин), жёсткие накладки — полуматовый полимер. */
  function gloveMaterials(THREE, P, T, srgb, mkTex, cached) {
    const nt = mkTex(THREE, cached('gloveKnit', () => T.fabricNormal(913, 256, 40, 0.8)), 1);
    nt.repeat.set(1 / 0.009, 1 / 0.009);
    const glove = new THREE.MeshStandardMaterial({
      color: srgb(THREE, P.gloveCol), vertexColors: true, roughness: 0.64, metalness: 0,
      normalMap: nt, normalScale: new THREE.Vector2(0.6, 0.6), envMapIntensity: 1.0
    });
    const gloveArmor = new THREE.MeshStandardMaterial({
      color: srgb(THREE, P.gloveHardCol || P.gloveCol.map((v) => v * 0.8)), roughness: 0.38, metalness: 0, envMapIntensity: 1.1
    });
    return { glove, gloveArmor };
  }

  /* ================================================= формы оружия ====== */
  /* SDF скруглённого прямоугольника: полуразмеры hx, hy, радиус r. */
  function sdRound2(x, y, hx, hy, r) {
    const qx = Math.abs(x) - hx + r, qy = Math.abs(y) - hy + r;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  }
  /* АК-74 в системе модели (метры, -Z — к дулу): рукоятка с наклоном 21°,
     цевьё, ствольная коробка, спусковая скоба. Размеры — из модели. */
  const AK = (() => {
    const rake = 21 * Math.PI / 180;
    const O = [0, 0.0255, -0.035];
    const e2 = [0, -Math.cos(rake), Math.sin(rake)];      // вниз по рукоятке
    const e3 = [0, -Math.sin(rake), -Math.cos(rake)];     // к передней грани
    function grip(p) {
      const q = sub(p, O);
      const u = dot(q, e2), v = dot(q, e3), w = q[0];
      const t = clamp(u / 0.1, 0, 1);
      const sw = Math.sin(Math.PI * Math.min(1, t * 1.15));
      const hw = (14.6 + 1.5 * sw - 4.6 * Math.pow(t, 2.6)) * 1e-3;
      const df = (17.2 - 5.2 * Math.pow(t, 2.3)) * 1e-3;
      const dr = (15.8 + 2.4 * sw - 4.4 * Math.pow(t, 2.7)) * 1e-3;
      return Math.max(sdRound2(w, v - (df - dr) / 2, hw, (df + dr) / 2, 0.0072), u - 0.101, -0.03 - u);
    }
    const handguard = (p) => Math.max(sdRound2(p[0], p[1] - 0.0735, 0.0205, 0.0305, 0.0135), p[2] + 0.250, -0.492 - p[2]);
    const receiver = (p) => Math.max(sdRound2(p[0], p[1] - 0.0615, 0.0175, 0.0315, 0.006), p[2] - 0.04, -0.27 - p[2]);
    const guard = (p) => Math.max(sdRound2(p[0], p[1] - 0.016, 0.011, 0.015, 0.004), p[2] + 0.024, -0.093 - p[2]);
    return {
      O, e2, e3, grip, handguard, receiver, guard,
      shapes: {
        pistolGrip: (p) => Math.min(grip(p), receiver(p), guard(p)),
        handguard: (p) => Math.min(handguard(p), receiver(p)),
        receiver
      }
    };
  })();

  /* ====================================================== хваты ======== */
  /* mcp — где лежит пястно-фаланговый сустав среднего пальца (система
     оружия), f — куда смотрят пальцы от запястья, b — тыльная сторона
     кисти. Для левой руки всё задано прямо в системе оружия, без зеркала.
     lo/hi — пределы сгиба фаланг, free — угол, если касания нет. */
  const gp = (d, v, x) => add(add(madd(AK.O, AK.e2, d), mul(AK.e3, v)), [x, 0, 0]);
  const GRIPS = {
    /* правая: ладонь на правой щёчке рукоятки, перепонка большого пальца
       под хвостовиком коробки, пальцы обхватывают переднюю грань */
    pistol: {
      mcp: gp(0.041, 0.015, 0.0225),
      f: add(mul(AK.e3, Math.cos(0.05)), [-Math.sin(0.05), 0, 0]),
      b: [1, 0, 0],
      shape: 'pistolGrip',
      /* большой палец огибает левую щёчку рукоятки вперёд-вниз */
      thumb: { aim: [-0.50, -0.50, -0.71], mcp: [0.0, 0.9], ip: [0.0, 1.0] },
      lo: [0.05, 0.10, 0.05], hi: [1.45, 1.75, 1.20], free: [1.25, 1.45, 0.95], press: 0.05, fit: 0.0015
    },
    /* левая снизу: цевьё лежит поперёк ладони, пальцы поднимаются по
       правому боку, большой палец — вдоль левого */
    under: {
      mcp: [0.002, 0.036, -0.392],
      f: [0.92, 0.12, -0.37],
      b: [0.12, -0.99, 0.02],
      shape: 'handguard',
      /* большой палец вдоль левого бока цевья, к дулу */
      thumb: { aim: [0.15, 0.80, -0.58], mcp: [0.0, 0.6], ip: [0.0, 0.6] },
      lo: [0.0, 0.05, 0.05], hi: [1.35, 1.65, 1.15], free: [0.9, 1.1, 0.7], press: 0.04, fit: 0.002
    },
    /* в прицеле кисть глубже под цевьём и дальше вперёд: пальцы не
       поднимаются к прицельной линии (0,116) */
    underAds: {
      mcp: [0.004, 0.033, -0.404],
      f: [0.88, 0.08, -0.47],
      b: [0.10, -0.99, 0.0],
      shape: 'handguard',
      thumb: { aim: [0.12, 0.70, -0.70], mcp: [0.0, 0.5], ip: [0.0, 0.5] },
      lo: [0.0, 0.05, 0.05], hi: [1.30, 1.45, 1.0], free: [0.8, 0.9, 0.6], press: 0.03, fit: 0.002
    }
  };

  function mixGrip(a, b, k) {
    if (k <= 0.001) return a;
    if (k >= 0.999) return b;
    const lt = (x, y) => [lerp(x[0], y[0], k), lerp(x[1], y[1], k)];
    return Object.assign({}, a, {
      mcp: lerp3(a.mcp, b.mcp, k), f: lerp3(norm(a.f), norm(b.f), k), b: lerp3(norm(a.b), norm(b.b), k),
      thumb: { aim: norm(lerp3(a.thumb.aim, b.thumb.aim, k)), mcp: lt(a.thumb.mcp, b.thumb.mcp), ip: lt(a.thumb.ip, b.thumb.ip) },
      lo: lerp3(a.lo, b.lo, k), hi: lerp3(a.hi, b.hi, k), free: lerp3(a.free, b.free, k), press: lerp(a.press, b.press, k),
      fit: lerp(a.fit || 0, b.fit || 0, k)
    });
  }

  /* Точки ладонной поверхности в системе покоя кисти (от запястья):
     x — вдоль кисти, y — к тылу, z — к мизинцу. По ним ладонь
     «досаживается» на поверхность оружия. */
  const PALM_PTS = [[0.040, -0.0250, -0.006], [0.066, -0.0240, 0.004], [0.090, -0.0200, -0.024], [0.084, -0.0200, 0.030], [0.058, -0.0240, 0.024]];

  /* Положение и поворот запястья в мире для хвата. mcpLocal — вектор
     запястье -> сустав среднего пальца в позе покоя (своей стороны). */
  function handPose(THREE, grip, side, gun, mcpLocal, out) {
    const f = norm(grip.f);
    const b = norm(madd(grip.b, f, -dot(grip.b, f)));
    const z = cross(f, b);
    const ex = mul(f, side), ez = mul(z, side);
    const off = add(add(mul(ex, mcpLocal[0]), mul(b, mcpLocal[1])), mul(ez, mcpLocal[2]));
    let wl = sub(grip.mcp, off);
    /* Ладонь досаживается на поверхность: кисть сдвигается вдоль нормали
       ладони (-b) на зазор до ближайшей точки формы. */
    if (grip.fit !== undefined && AK.shapes[grip.shape]) {
      const sdf = AK.shapes[grip.shape];
      let g = Infinity;
      for (const q of PALM_PTS) g = Math.min(g, sdf(add(wl, add(add(mul(f, q[0]), mul(b, q[1])), mul(z, q[2] * side)))));
      wl = madd(wl, b, -clamp(g - grip.fit, -0.03, 0.045));
      out.palmGap = g;
    }
    out.pos = out.pos || new THREE.Vector3();
    out.quat = out.quat || new THREE.Quaternion();
    out.pos.set(wl[0], wl[1], wl[2]).applyMatrix4(gun.matrixWorld);
    const m = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(ex[0], ex[1], ex[2]), new THREE.Vector3(b[0], b[1], b[2]), new THREE.Vector3(ez[0], ez[1], ez[2]));
    out.quat.setFromRotationMatrix(m).premultiply(gun.getWorldQuaternion(new THREE.Quaternion()));
    return out;
  }

  /* ================================================ решатель пальцев === */
  let _invM = null;
  function gunInv(THREE, gun) {
    _invM = _invM || new THREE.Matrix4();
    return _invM.copy(gun.matrixWorld).invert().elements;
  }
  const toGun = (e, p) => [
    e[0] * p[0] + e[4] * p[1] + e[8] * p[2] + e[12],
    e[1] * p[0] + e[5] * p[1] + e[9] * p[2] + e[13],
    e[2] * p[0] + e[6] * p[1] + e[10] * p[2] + e[14]
  ];
  const wpos = (b) => { const e = b.matrixWorld.elements; return [e[12], e[13], e[14]]; };

  /* Зазор фаланги bA->bB до поверхности (отрицательный — касание).
     Точки берутся по центру сечения, со стороны ладони. */
  function phalanxGap(inv, bA, bB, D, sdf, tip) {
    const e = bA.matrixWorld.elements;
    const A = [e[12], e[13], e[14]], B = wpos(bB);
    const py = norm([-e[4], -e[5], -e[6]]);
    let g = Infinity;
    for (const t of tip ? [0.35, 0.65, 0.9] : [0.3, 0.65, 1.0]) {
      g = Math.min(g, sdf(toGun(inv, madd(lerp3(A, B, t), py, C_OFF))) - D.h * 0.96);
    }
    return g;
  }

  /* Сгиб сустава до первого касания: шагами от lo к hi, затем деление
     пополам. set(a) ставит угол и обновляет матрицы. */
  function closeJoint(set, gap, lo, hi, free) {
    set(lo);
    if (gap() <= 0) return lo;
    const N = 12;
    let prev = lo;
    for (let i = 1; i <= N; i++) {
      const a = lo + (hi - lo) * i / N;
      set(a);
      if (gap() <= 0) {
        let A = prev, B = a;
        for (let k = 0; k < 5; k++) { const m = (A + B) / 2; set(m); if (gap() <= 0) B = m; else A = m; }
        return A;
      }
      prev = a;
    }
    return free;
  }

  function setFlex(bone, side, a, spread) {
    bone.rotation.set(0, side * (spread || 0), -side * a);
    bone.updateMatrixWorld(true);
  }
  /* сведение пальцев в хвате: у модели в покое между указательным и
     средним ~9 мм, в кулаке пальцы сомкнуты */
  const SPREAD = { index: -0.21, middle: 0, ring: 0.13, pinky: 0.26 };

  /* Указательный вне скобы: почти прямой, поднят к боку ствольной коробки
     над спусковой скобой — тренированная «дисциплина пальца». */
  function indexStraight(rig, side, inv) {
    const SS = side > 0 ? 'R' : 'L';
    const b = [1, 2, 3, 4].map((i) => rig.bone('index' + SS + i));
    setFlex(b[1], side, 0.10); setFlex(b[2], side, 0.06);
    let lift = 0;
    for (let i = 0; i <= 12; i++) {
      lift = i * 0.045;
      setFlex(b[0], side, 0.05, lift);
      if (toGun(inv, wpos(b[3]))[1] > 0.038) break;
    }
    return [0.05, 0.10, 0.06, lift];
  }

  /* Указательный на спуске: curl 0,8 — лежит на крючке, 1,1 — дожат. */
  function indexTrigger(rig, side, curl) {
    const SS = side > 0 ? 'R' : 'L';
    const k = clamp(curl === undefined ? 0.85 : curl, 0.5, 1.2);
    const a = [0.18 + 0.20 * k, 0.55 + 0.55 * k, 0.25 + 0.35 * k];
    setFlex(rig.bone('index' + SS + '1'), side, a[0], -0.04);
    setFlex(rig.bone('index' + SS + '2'), side, a[1]);
    setFlex(rig.bone('index' + SS + '3'), side, a[2]);
    return a;
  }

  /* Пальцы обхватывают форму хвата. opts.index: 'wrap' | 'straight' |
     'trigger' (opts.trigger — сгиб на спуске). Возвращает углы. */
  function solveFingers(THREE, rig, side, grip, gun, opts) {
    const SS = side > 0 ? 'R' : 'L';
    const o = opts || {};
    gun.updateMatrixWorld(true);
    const inv = gunInv(THREE, gun);
    const sdf = AK.shapes[grip.shape] || AK.shapes.handguard;
    const out = {};
    for (const key of FKEYS) {
      if (key === 'index' && o.index === 'straight') { out.indexStraight = indexStraight(rig, side, inv); continue; }
      if (key === 'index' && o.index === 'trigger') { out.indexTrigger = indexTrigger(rig, side, o.trigger); continue; }
      const b = [1, 2, 3, 4].map((i) => rig.bone(key + SS + i));
      const D = FDIM[key];
      const ang = [];
      for (let j = 0; j < 3; j++) {
        const sp = j === 0 ? SPREAD[key] : 0;
        const a = closeJoint((x) => setFlex(b[j], side, x, sp),
          () => phalanxGap(inv, b[j], b[j + 1], D, sdf, j === 2), grip.lo[j], grip.hi[j], grip.free[j]);
        ang[j] = clamp(a + grip.press, grip.lo[j], grip.hi[j]);
        setFlex(b[j], side, ang[j], sp);
      }
      out[key] = ang;
    }
    /* большой палец: основание разворачивается по направлению хвата
       (aim, система оружия), сгибы замыкаются на ту же форму */
    const T = [1, 2, 3, 4].map((i) => rig.bone('thumb' + SS + i));
    const th = grip.thumb, D = FDIM.thumb;
    aimThumb(THREE, rig, side, gun, th.aim);
    swingThumb(THREE, rig, side, inv, sdf, D);
    const q0 = T[0].quaternion.toArray();
    const tm = closeJoint((x) => setFlex(T[1], side, x), () => phalanxGap(inv, T[1], T[2], D, sdf, false), th.mcp[0], th.mcp[1], th.mcp[1] * 0.5);
    setFlex(T[1], side, tm + 0.03);
    const ti = closeJoint((x) => setFlex(T[2], side, x), () => phalanxGap(inv, T[2], T[3], D, sdf, true), th.ip[0], th.ip[1], th.ip[1] * 0.5);
    setFlex(T[2], side, ti + 0.03);
    out.thumb = [q0, tm, ti];
    return out;
  }

  /* Доводка основания большого пальца: поворот к ближайшей точке формы
     (по градиенту SDF у кончика), пока основная фаланга не коснётся. */
  let _sw = null;
  function swingThumb(THREE, rig, side, inv, sdf, D) {
    const SS = side > 0 ? 'R' : 'L';
    const t1 = rig.bone('thumb' + SS + '1'), t2 = rig.bone('thumb' + SS + '2'), t4 = rig.bone('thumb' + SS + '4');
    _sw = _sw || { q0: new THREE.Quaternion(), q: new THREE.Quaternion(), ax: new THREE.Vector3(), pw: new THREE.Quaternion(), gi: new THREE.Matrix4() };
    const t3 = rig.bone('thumb' + SS + '3');
    const gap = () => Math.min(phalanxGap(inv, t2, t3, D, sdf, false), phalanxGap(inv, t3, t4, D, sdf, true));
    if (gap() <= 0) return;
    /* градиент в системе оружия -> в мир -> в систему родителя пальца */
    const tip = toGun(inv, wpos(t4)), e = 0.002;
    const g = [
      sdf([tip[0] + e, tip[1], tip[2]]) - sdf([tip[0] - e, tip[1], tip[2]]),
      sdf([tip[0], tip[1] + e, tip[2]]) - sdf([tip[0], tip[1] - e, tip[2]]),
      sdf([tip[0], tip[1], tip[2] + e]) - sdf([tip[0], tip[1], tip[2] - e])
    ];
    _sw.gi.fromArray(inv).invert();
    const toS = new THREE.Vector3(-g[0], -g[1], -g[2]).transformDirection(_sw.gi);
    t1.parent.getWorldQuaternion(_sw.pw).invert();
    toS.applyQuaternion(_sw.pw);
    const a = wpos(t1), b = wpos(t4);
    const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize().applyQuaternion(_sw.pw);
    _sw.ax.crossVectors(dir, toS);
    if (_sw.ax.lengthSq() < 1e-8) return;
    _sw.ax.normalize();
    _sw.q0.copy(t1.quaternion);
    const set = (x) => { t1.quaternion.copy(_sw.q0).premultiply(_sw.q.setFromAxisAngle(_sw.ax, x)); t1.updateMatrixWorld(true); };
    const ang = closeJoint(set, gap, 0, 0.9, 0.35);
    set(ang + 0.02);
  }

  /* Основание большого пальца: кратчайший поворот, который наводит палец
     (от основания к кончику в позе покоя) на направление aim оружия. */
  let _tq = null;
  function aimThumb(THREE, rig, side, gun, aim) {
    const SS = side > 0 ? 'R' : 'L';
    const t1 = rig.bone('thumb' + SS + '1');
    const r = rig.char.rest, a = r['thumb' + SS + '1'], e = r['thumb' + SS + '4'];
    _tq = _tq || { d0: new THREE.Vector3(), d: new THREE.Vector3(), q: new THREE.Quaternion(), p: new THREE.Quaternion() };
    _tq.d0.set(e[0] - a[0], e[1] - a[1], e[2] - a[2]).normalize();
    _tq.d.set(aim[0], aim[1], aim[2]).normalize().applyQuaternion(gun.getWorldQuaternion(_tq.q));
    t1.parent.getWorldQuaternion(_tq.p).invert();
    _tq.d.applyQuaternion(_tq.p);
    t1.quaternion.setFromUnitVectors(_tq.d0, _tq.d);
    t1.updateMatrixWorld(true);
    return t1.quaternion.toArray();
  }

  /* Повтор сохранённых углов — для бойцов, которым решатель в этом
     кадре не положен (экономия: пальцы стоящих в строю меняются мало). */
  function applyAngles(rig, side, ang) {
    const SS = side > 0 ? 'R' : 'L';
    for (const key of FKEYS) {
      const a = ang[key];
      if (a) for (let j = 0; j < 3; j++) setFlex(rig.bone(key + SS + (j + 1)), side, a[j], j === 0 ? SPREAD[key] : 0);
    }
    if (ang.indexStraight) {
      const a = ang.indexStraight;
      setFlex(rig.bone('index' + SS + '1'), side, a[0], a[3]);
      setFlex(rig.bone('index' + SS + '2'), side, a[1]);
      setFlex(rig.bone('index' + SS + '3'), side, a[2]);
    }
    if (ang.indexTrigger) {
      const a = ang.indexTrigger;
      setFlex(rig.bone('index' + SS + '1'), side, a[0], -0.04);
      setFlex(rig.bone('index' + SS + '2'), side, a[1]);
      setFlex(rig.bone('index' + SS + '3'), side, a[2]);
    }
    if (ang.thumb) {
      const a = ang.thumb, T0 = rig.bone('thumb' + SS + '1');
      T0.quaternion.fromArray(a[0]); T0.updateMatrixWorld(true);
      setFlex(rig.bone('thumb' + SS + '2'), side, a[1] + 0.03);
      setFlex(rig.bone('thumb' + SS + '3'), side, a[2] + 0.03);
    }
  }

  /* Кисть без оружия: расслабленный полусогнутый жест. */
  function relax(rig, side, k) {
    const SS = side > 0 ? 'R' : 'L';
    const a = k === undefined ? 1 : k;
    FKEYS.forEach((key, i) => {
      setFlex(rig.bone(key + SS + '1'), side, (0.22 + 0.06 * i) * a, SPREAD[key]);
      setFlex(rig.bone(key + SS + '2'), side, (0.35 + 0.07 * i) * a);
      setFlex(rig.bone(key + SS + '3'), side, (0.22 + 0.05 * i) * a);
    });
    rig.bone('thumb' + SS + '1').rotation.set(0, side * 0.35, -side * 0.25 * a);
    setFlex(rig.bone('thumb' + SS + '2'), side, 0.2 * a);
    setFlex(rig.bone('thumb' + SS + '3'), side, 0.25 * a);
  }

  /* Отчёт о посадке кисти для настройки: зазоры (м) ладони и кончиков
     пальцев до формы хвата; отрицательный — внутри. */
  function contactReport(THREE, rig, side, grip, gun) {
    const SS = side > 0 ? 'R' : 'L';
    gun.updateMatrixWorld(true);
    const inv = gunInv(THREE, gun), sdf = AK.shapes[grip.shape];
    const w = rig.bone('wrist' + SS);
    const r = (v) => Math.round(v * 1000) / 1000;
    const palm = PALM_PTS.map((q) => r(sdf(toGun(inv, new THREE.Vector3(side * q[0], q[1], q[2]).applyMatrix4(w.matrixWorld).toArray()))));
    const tips = {};
    for (const k of FKEYS.concat(['thumb'])) tips[k] = r(sdf(toGun(inv, wpos(rig.bone(k + SS + '4')))) - FDIM[k].h);
    return { palm, tips };
  }

  return {
    FDIM, C_OFF, AK, GRIPS, mixGrip, handPose, solveFingers, applyAngles, relax,
    indexStraight, indexTrigger, gloveGeometry, gloveMaterials, contactReport
  };
});
