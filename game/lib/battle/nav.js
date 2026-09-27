/* ============================================================================
   Навигация ботов: сетка проходимости по карте, A* с выпрямлением пути,
   поле расстояний до флагов (дёшево вести 20+ бойцов к одной цели) и
   точки укрытий у препятствий.
   ========================================================================== */
import { Heap, SpatialHash, clamp } from './util.js';

const SQ2 = Math.SQRT2;
const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];

export class NavGrid {
  constructor(adapter, cell) {
    const b = adapter.bounds;
    this.A = adapter;
    this.cell = cell;
    this.x0 = b.x0; this.z0 = b.z0;
    this.nx = Math.ceil((b.x1 - b.x0) / cell);
    this.nz = Math.ceil((b.z1 - b.z0) / cell);
    const n = this.nx * this.nz;
    this.cost = new Float32Array(n);
    this.h = new Float32Array(n);
    this.heap = new Heap(n * 4);
    this.g = new Float32Array(n);
    this.from = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.run = 1;
    this.cover = [];
    this.coverHash = new SpatialHash(6);
  }

  build() {
    const { nx, nz, cell } = this;
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const x = this.x0 + (ix + 0.5) * cell, z = this.z0 + (iz + 0.5) * cell;
      const w = this.A.walkable(x, z);
      const i = iz * nx + ix;
      this.cost[i] = w.cost;
      this.h[i] = w.y;
    }
    /* крутые перепады высоты (стенки окопов, обрывы) непроходимы */
    const maxRise = Math.max(0.45, cell * 0.9);
    const keep = this.cost.slice();
    for (let iz = 1; iz < nz - 1; iz++) for (let ix = 1; ix < nx - 1; ix++) {
      const i = iz * nx + ix;
      if (!keep[i]) continue;
      const hi = this.h[i];
      if (Math.abs(this.h[i + 1] - hi) > maxRise || Math.abs(this.h[i - 1] - hi) > maxRise ||
        Math.abs(this.h[i + nx] - hi) > maxRise || Math.abs(this.h[i - nx] - hi) > maxRise) this.cost[i] = 0;
    }
    return this;
  }

  idx(x, z) {
    const ix = Math.floor((x - this.x0) / this.cell), iz = Math.floor((z - this.z0) / this.cell);
    if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) return -1;
    return iz * this.nx + ix;
  }
  cx(i) { return this.x0 + ((i % this.nx) + 0.5) * this.cell; }
  cz(i) { return this.z0 + (Math.floor(i / this.nx) + 0.5) * this.cell; }
  walkableAt(x, z) { const i = this.idx(x, z); return i >= 0 && this.cost[i] > 0; }

  nearest(x, z, maxR = 12) {
    const i0 = this.idx(clamp(x, this.x0 + 0.01, this.x0 + this.nx * this.cell - 0.01), clamp(z, this.z0 + 0.01, this.z0 + this.nz * this.cell - 0.01));
    if (i0 >= 0 && this.cost[i0] > 0) return i0;
    const R = Math.ceil(maxR / this.cell), ix0 = i0 % this.nx, iz0 = Math.floor(i0 / this.nx);
    for (let r = 1; r <= R; r++) {
      let best = -1, bd = 1e9;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const ix = ix0 + dx, iz = iz0 + dz;
        if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) continue;
        const i = iz * this.nx + ix;
        if (this.cost[i] > 0) { const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  /* Прямая проходимость по клеткам (для выпрямления пути). */
  lineClear(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), step = this.cell * 0.5;
    const n = Math.ceil(L / step);
    for (let k = 1; k < n; k++) {
      const t = k / n, i = this.idx(ax + dx * t, az + dz * t);
      if (i < 0 || this.cost[i] <= 0 || this.cost[i] > 1.6) return false;
    }
    return true;
  }

  findPath(ax, az, bx, bz, maxExpand = 9000) {
    const s = this.nearest(ax, az, 6), t = this.nearest(bx, bz, 10);
    if (s < 0 || t < 0) return null;
    if (s === t) return [{ x: bx, z: bz }];
    const { nx, nz, cost, g, from, stamp, heap } = this;
    const run = ++this.run;
    heap.size = 0;
    const tx = t % nx, tz = Math.floor(t / nx);
    const hEst = (i) => { const dx = Math.abs(i % nx - tx), dz = Math.abs(Math.floor(i / nx) - tz); return (dx + dz + (SQ2 - 2) * Math.min(dx, dz)); };
    stamp[s] = run; g[s] = 0; from[s] = -1;
    heap.push(s, hEst(s));
    let found = false, expanded = 0, best = s, bestH = hEst(s);
    while (heap.size) {
      const c = heap.pop();
      if (c === t) { found = true; break; }
      if (++expanded > maxExpand) break;
      const cxi = c % nx, czi = Math.floor(c / nx), gc = g[c];
      for (const [ox, oz, w] of NB) {
        const ix = cxi + ox, iz = czi + oz;
        if (ix < 0 || iz < 0 || ix >= nx || iz >= nz) continue;
        const n = iz * nx + ix, cn = cost[n];
        if (cn <= 0) continue;
        if (ox && oz && (cost[czi * nx + ix] <= 0 || cost[iz * nx + cxi] <= 0)) continue;
        const ng = gc + w * cn;
        if (stamp[n] === run && g[n] <= ng) continue;
        stamp[n] = run; g[n] = ng; from[n] = c;
        const he = hEst(n);
        if (he < bestH) { bestH = he; best = n; }
        heap.push(n, ng + he * 1.05);
      }
    }
    let end = found ? t : best;
    const cells = [];
    for (let c = end; c >= 0; c = from[c]) cells.push(c);
    cells.reverse();
    /* выпрямление: тянем «нить» через прямо проходимые участки */
    const pts = [];
    let ax2 = ax, az2 = az, k = 0;
    while (k < cells.length - 1) {
      let j = cells.length - 1;
      while (j > k + 1 && !this.lineClear(ax2, az2, this.cx(cells[j]), this.cz(cells[j]))) j--;
      ax2 = this.cx(cells[j]); az2 = this.cz(cells[j]);
      pts.push({ x: ax2, z: az2 });
      k = j;
    }
    if (found) { if (pts.length) pts[pts.length - 1] = { x: bx, z: bz }; else pts.push({ x: bx, z: bz }); }
    return pts.length ? pts : null;
  }

  /* Поле расстояний до цели (Дейкстра по всей сетке). */
  flowField(tx, tz) {
    const { nx, nz, cost } = this, n = nx * nz;
    const d = new Float32Array(n).fill(1e9);
    const t = this.nearest(tx, tz, 16);
    if (t < 0) return { d, t };
    const heap = new Heap(n * 4);
    d[t] = 0; heap.push(t, 0);
    while (heap.size) {
      const c = heap.pop(), dc = d[c], cxi = c % nx, czi = Math.floor(c / nx);
      for (const [ox, oz, w] of NB) {
        const ix = cxi + ox, iz = czi + oz;
        if (ix < 0 || iz < 0 || ix >= nx || iz >= nz) continue;
        const m = iz * nx + ix, cm = cost[m];
        if (cm <= 0) continue;
        if (ox && oz && (cost[czi * nx + ix] <= 0 || cost[iz * nx + cxi] <= 0)) continue;
        const nd = dc + w * cm;
        if (nd < d[m]) { d[m] = nd; heap.push(m, nd); }
      }
    }
    return { d, t };
  }
  /* Точка на `ahead` метров вниз по полю расстояний. */
  flowAhead(ff, x, z, ahead) {
    let i = this.nearest(x, z, 8);
    if (i < 0) return null;
    const steps = Math.max(1, Math.round(ahead / this.cell));
    for (let k = 0; k < steps; k++) {
      const cxi = i % this.nx, czi = Math.floor(i / this.nx);
      let best = i, bd = ff.d[i];
      for (const [ox, oz] of NB) {
        const ix = cxi + ox, iz = czi + oz;
        if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) continue;
        const m = iz * this.nx + ix;
        if (ff.d[m] < bd) { bd = ff.d[m]; best = m; }
      }
      if (best === i) break;
      i = best;
    }
    return { x: this.cx(i), z: this.cz(i), left: ff.d[i] * this.cell };
  }

  /* Укрытия: точки у препятствий высотой от 0,85 м, нормаль смотрит на препятствие. */
  buildCover(sources) {
    const seen = new SpatialHash(1.5);
    const add = (x, z, nx, nz, h, src) => {
      if (!this.walkableAt(x, z)) return;
      let near = false;
      seen.query(x, z, 1.1, (p) => { if ((p.x - x) ** 2 + (p.z - z) ** 2 < 1.2) near = true; });
      if (near) return;
      const p = { x, z, nx, nz, h, src, taken: null, id: this.cover.length };
      seen.insert(p, x, z);
      this.cover.push(p);
      this.coverHash.insert(p, x, z);
    };
    for (const s of sources) {
      if (s.h < 0.85) continue;
      if (s.r !== undefined) {
        const R = s.r + 0.5, n = s.r > 0.6 ? 8 : 4;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + (s.x * 0.37 % 1);
          const ux = Math.cos(a), uz = Math.sin(a);
          add(s.x + ux * R, s.z + uz * R, -ux, -uz, s.h, s);
        }
      } else {
        const { hw, hd, c, s: sn } = s;
        /* локальные оси бокса (как у коллайдеров карты): x' = dx*c - dz*s, z' = dx*s + dz*c */
        const ax = [c, -sn], az = [sn, c];
        const toW = (lx, lz) => [s.x + lx * ax[0] + lz * az[0], s.z + lx * ax[1] + lz * az[1]];
        const sides = [[1, 0, hw, hd], [-1, 0, hw, hd], [0, 1, hd, hw], [0, -1, hd, hw]];
        for (const [ux, uz, off, span] of sides) {
          const n = Math.max(1, Math.floor((span * 2) / 1.6));
          for (let k = 0; k < n; k++) {
            const t = n === 1 ? 0 : -span + 0.3 + (k / (n - 1)) * (span * 2 - 0.6);
            const lx = ux ? ux * (off + 0.55) : t, lz = uz ? uz * (off + 0.55) : t;
            const [wx, wz] = toW(lx, lz);
            const [nx, nz] = [-(ux * ax[0] + uz * az[0]), -(ux * ax[1] + uz * az[1])];
            add(wx, wz, nx, nz, s.h, s);
          }
        }
      }
    }
    return this;
  }

  coverNear(x, z, r, fn) { this.coverHash.query(x, z, r, (p) => { if ((p.x - x) ** 2 + (p.z - z) ** 2 <= r * r) fn(p); }); }
}
