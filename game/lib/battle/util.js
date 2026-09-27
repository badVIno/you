/* Мелкая математика и пространственный хэш для боевого режима. */
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
export const wrapAngle = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
export const angleTo = (from, to) => wrapAngle(to - from);
export const dampAngle = (a, b, k, dt) => a + angleTo(a, b) * (1 - Math.exp(-k * dt));
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
/* yaw: 0 смотрит в -Z (как камера three.js), вперёд = (-sin, -cos) */
export const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
export const fwdX = (yaw) => -Math.sin(yaw);
export const fwdZ = (yaw) => -Math.cos(yaw);
export const dist2 = (a, b) => { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; };
export const dist2d = (a, b) => Math.sqrt(dist2(a, b));

/* Сегмент-капсула: квадрат расстояния между отрезками p0p1 и q0q1 (для попаданий). */
export function segSegDist2(p0, p1, q0, q1, out) {
  const ux = p1.x - p0.x, uy = p1.y - p0.y, uz = p1.z - p0.z;
  const vx = q1.x - q0.x, vy = q1.y - q0.y, vz = q1.z - q0.z;
  const wx = p0.x - q0.x, wy = p0.y - q0.y, wz = p0.z - q0.z;
  const a = ux * ux + uy * uy + uz * uz, b = ux * vx + uy * vy + uz * vz, c = vx * vx + vy * vy + vz * vz;
  const d = ux * wx + uy * wy + uz * wz, e = vx * wx + vy * wy + vz * wz;
  const D = a * c - b * b;
  let sN, sD = D, tN, tD = D;
  if (D < 1e-9) { sN = 0; sD = 1; tN = e; tD = c; } else {
    sN = b * e - c * d; tN = a * e - b * d;
    if (sN < 0) { sN = 0; tN = e; tD = c; } else if (sN > sD) { sN = sD; tN = e + b; tD = c; }
  }
  if (tN < 0) { tN = 0; if (-d < 0) sN = 0; else if (-d > a) sN = sD; else { sN = -d; sD = a; } }
  else if (tN > tD) { tN = tD; if (-d + b < 0) sN = 0; else if (-d + b > a) sN = sD; else { sN = -d + b; sD = a; } }
  const sc = Math.abs(sN) < 1e-9 ? 0 : sN / sD, tc = Math.abs(tN) < 1e-9 ? 0 : tN / tD;
  const dx = wx + sc * ux - tc * vx, dy = wy + sc * uy - tc * vy, dz = wz + sc * uz - tc * vz;
  if (out) out.s = sc;
  return dx * dx + dy * dy + dz * dz;
}

/* Хэш-сетка для быстрых запросов «кто рядом». */
export class SpatialHash {
  constructor(cell = 8) { this.cell = cell; this.map = new Map(); }
  clear() { this.map.clear(); }
  key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }
  insert(o, x, z) {
    const k = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell));
    let L = this.map.get(k);
    if (!L) this.map.set(k, (L = []));
    L.push(o);
  }
  query(x, z, r, fn) {
    const c = this.cell, x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c), z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const L = this.map.get(this.key(ix, iz));
      if (L) for (let i = 0; i < L.length; i++) fn(L[i]);
    }
  }
}

/* Двоичная куча по приоритету (для A* и Дейкстры). */
export class Heap {
  constructor(n) { this.idx = new Int32Array(n); this.pri = new Float32Array(n); this.size = 0; }
  push(i, p) {
    let k = this.size++;
    const I = this.idx, P = this.pri;
    while (k > 0) { const q = (k - 1) >> 1; if (P[q] <= p) break; I[k] = I[q]; P[k] = P[q]; k = q; }
    I[k] = i; P[k] = p;
  }
  pop() {
    const I = this.idx, P = this.pri, top = I[0], n = --this.size;
    if (n > 0) {
      const li = I[n], lp = P[n];
      let k = 0;
      for (;;) {
        let c = 2 * k + 1;
        if (c >= n) break;
        if (c + 1 < n && P[c + 1] < P[c]) c++;
        if (P[c] >= lp) break;
        I[k] = I[c]; P[k] = P[c]; k = c;
      }
      I[k] = li; P[k] = lp;
    }
    return top;
  }
}
