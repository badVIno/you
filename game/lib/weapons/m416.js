// СГЕНЕРИРОВАНО game/tools/build_weapons.mjs из game/weapons/m416.html — не редактировать вручную.
import { T, grip, magnifier, mount, node } from './engine.js';
// src/weapons/m416_parts.js
var RAIL_TOP = 30.5;
var CW = 0.6;
var SEG = { a: [[0, 1], [CW, 1]], b: [[CW, 1], [CW, 0.5]], c: [[CW, 0.5], [CW, 0]], d: [[0, 0], [CW, 0]], e: [[0, 0], [0, 0.5]], f: [[0, 0.5], [0, 1]], g: [[0, 0.5], [CW, 0.5]] };
var SEGS = { 0: "abcdef", 1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc", 5: "afgcd", 6: "afgedc", 7: "abc", 8: "abcdefg", 9: "abcdfg", A: "efabcg", E: "afged", F: "afge", H: "fbgec", S: "afgcd", C: "afed", L: "fed", P: "efabg", "-": "g" };
var STROKES = {
  K: [[[0, 0], [0, 1]], [[0, 0.45], [CW, 1]], [[0.18, 0.6], [CW, 0]]],
  M: [[[0, 0], [0, 1]], [[0, 1], [CW / 2, 0.45]], [[CW / 2, 0.45], [CW, 1]], [[CW, 1], [CW, 0]]],
  X: [[[0, 0], [CW, 1]], [[0, 1], [CW, 0]]],
  T: [[[0, 1], [CW, 1]], [[CW / 2, 1], [CW / 2, 0]]]
};
var BASIS = { right: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], left: [[-1, 0, 0], [0, 1, 0], [0, 0, -1]], top: [[0, 0, 1], [1, 0, 0], [0, 1, 0]] };
function engrave(ctx, text, o = {}) {
  const { G, THREE: THREE9 } = ctx;
  const h = o.h ?? 3, t = o.t ?? Math.max(0.28, h * 0.13), d = o.d ?? 0.12;
  const adv = (CW + 0.4) * h, total = text.length * adv - 0.4 * h;
  const gs = [];
  [...text].forEach((ch, i) => {
    const x0 = -total / 2 + i * adv;
    const list = (STROKES[ch] || [...SEGS[ch] || ""].map((s) => SEG[s])).slice();
    if (ch === "." || ch === ",") list.push([[CW / 2, 0], [CW / 2, ch === "," ? -0.18 : 0.02]]);
    for (const [[ax, ay], [bx, by]] of list) {
      const px = x0 + ax * h, py = (ay - 0.5) * h, qx = x0 + bx * h, qy = (by - 0.5) * h;
      gs.push(G.T(G.box(Math.hypot(qx - px, qy - py) + t, t, d, { bevel: 0 }), { r: [0, 0, Math.atan2(qy - py, qx - px) * 180 / Math.PI], p: [(px + qx) / 2, (py + qy) / 2, d / 2] }));
    }
  });
  const g = G.merge(gs);
  if (!g) return null;
  const B = BASIS[o.basis || "right"], p = o.p || [0, 0, 0];
  const m = new THREE9.Matrix4().makeBasis(new THREE9.Vector3(...B[0]), new THREE9.Vector3(...B[1]), new THREE9.Vector3(...B[2]));
  m.setPosition(p[0], p[1], p[2]);
  return g.applyMatrix4(m);
}
function railMarks(ctx, r, n0 = 1, o = {}) {
  const gs = [];
  for (let i = 0; i < r.slots - 1; i++) {
    gs.push(engrave(ctx, String(n0 + i), { h: o.h ?? 2.3, d: 0.1, basis: "top", p: [r.first + (i + 0.5) * ctx.G.PICA.PITCH, -0.04, 0] }));
  }
  return ctx.G.merge(gs);
}
function arc(cz, cy, r, t0, t1, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + (t1 - t0) * (i / n);
    out.push([cz + Math.cos(t) * r, cy + Math.sin(t) * r]);
  }
  return out;
}
function quadRail(ctx) {
  const { G } = ctx;
  const k = ctx.kit();
  const x0 = 2, x1 = 252;
  const a = 26, f = 10.5, R4 = 17.5, cy = 2;
  const zAt = (y) => a - (-y - f);
  const ys = -12, yl = -12.7;
  const dzU = Math.sqrt(R4 * R4 - (ys - cy) ** 2), dzL = Math.sqrt(R4 * R4 - (yl - cy) ** 2);
  const upper = [
    [zAt(ys), ys, 0.9],
    [a, -f, 2.2],
    [a, f, 2.2],
    [f, a, 2.2],
    [-f, a, 2.2],
    [-a, f, 2.2],
    [-a, -f, 2.2],
    [-zAt(ys), ys, 0.9],
    ...arc(0, cy, R4, Math.atan2(ys - cy, -dzU), Math.atan2(ys - cy, dzU) - Math.PI * 2, 36)
  ];
  const lower = [
    [-zAt(yl), yl, 0.9],
    [-f, -a, 2.2],
    [f, -a, 2.2],
    [zAt(yl), yl, 0.9],
    ...arc(0, cy, R4, Math.atan2(yl - cy, dzL), Math.atan2(yl - cy, -dzL), 12)
  ];
  k.add("alu", G.extrudeX(upper, x0 + 6, x1 - 10, { bevel: 1 }));
  k.add("alu", G.extrudeX(lower, x0 + 10, x1 - 13, { bevel: 1 }));
  const ringP = (d, rr) => [[-f - d, a + d], [f + d, a + d], [a + d, f + d], [a + d, -f - d], [f + d, -a - d], [-f - d, -a - d], [-a - d, -f - d], [-a - d, f + d]].map((p) => [...p, rr]);
  k.add("alu", G.extrudeX(G.shape(ringP(1.5, 3), [G.circle(0, cy, R4, 32)]), x1 - 14, x1 - 2, { bevel: 1.4 }));
  k.add("alu", G.extrudeX(G.shape(ringP(0.6, 2.6), [G.circle(0, 0, 11.2, 32)]), x1 - 3.5, x1, { bevel: 1 }));
  k.add("alu", G.extrudeX(G.shape(ringP(1.5, 3), [G.circle(0, 0, 16, 32)]), x0, x0 + 11, { bevel: 1.2 }));
  const dia = (a + f) / Math.SQRT2 + 0.1;
  for (const s of [-1, 1]) for (const x of [x0 + 18, x0 + 30, x1 - 22]) {
    k.add("steel", G.T(G.screwHead(2.7, 1.3, { seg: 6 }), { r: [s > 0 ? 45 : 135, 0, 0], p: [x, -dia * Math.SQRT1_2, s * dia * Math.SQRT1_2] }));
  }
  const len = x1 - x0 - 2;
  const mounts = [];
  const faces = [["hgTop", "top", [0, 0, 0], [0, RAIL_TOP, 0], 18], ["hgRight", "right", [90, 0, 0], [0, 0, RAIL_TOP], 1], ["hgBottom", "bottom", [180, 0, 0], [0, -RAIL_TOP, 0], 1], ["hgLeft", "left", [-90, 0, 0], [0, 0, -RAIL_TOP], 1]];
  for (const [id, face, rot, off, n0] of faces) {
    const rr = G.picatinny(len, { base: RAIL_TOP - a + 0.5 });
    k.add("alu", rr.geo, { r: rot, p: [x0 + 1 + off[0], off[1], off[2]] });
    k.add("steelWorn", railMarks(ctx, rr, n0), { r: rot, p: [x0 + 1 + off[0], off[1], off[2]] });
    const p = [x0 + 1 + rr.first, off[1], off[2]];
    mounts.push(ctx.railMount(id, p, face, rr.slots, { axis: face }));
  }
  const root = G.node("hk_quad", [k.build(), ...mounts]);
  return { root };
}
function mlokRail(ctx) {
  const { G } = ctx;
  const k = ctx.kit();
  const x0 = 2, x1 = 262, R4 = 24, t = 3.2;
  const w = 2 * R4 * Math.tan(Math.PI / 8) + 0.6;
  for (let i = 0; i < 8; i++) {
    const a = i * 45;
    if (a === 0) continue;
    const holes = G.mlokHoles(x0 + 26, x1 - 14, 0, { pitch: 40 });
    const plate = G.shape(G.rrect((x0 + x1) / 2, 0, x1 - x0, w, 0.8), a % 90 === 0 ? holes : holes.filter((_, j) => j % 2 === 1));
    const g = G.extrudeZ(plate, t, { bevel: 0.6, z: R4 - t / 2 });
    k.add("alu", G.T(g, { r: [a - 90, 0, 0] }));
  }
  k.add("alu", G.extrudeX(G.rrect(0, R4 - 2, w + 1, 5, 1), x0, x1, { bevel: 0.6 }));
  k.add("alu", G.extrudeX(G.shape(G.circle(0, 0, R4 + 2.5, 8).map((p) => [p[0], p[1], 2]), [G.circle(0, 0, 16, 32)]), x0, x0 + 12, { bevel: 1 }), null);
  k.add("alu", G.extrudeX(G.shape(G.circle(0, 0, R4 + 1.5, 8).map((p) => [p[0], p[1], 2]), [G.circle(0, 0, 17, 32)]), x1 - 6, x1, { bevel: 1 }), null);
  for (const s of [-1, 1]) for (const x of [x0 + 3.5, x0 + 8.5]) {
    const ap = (R4 + 2.5) * Math.cos(Math.PI / 8);
    k.add("steel", G.T(G.screwHead(2.2, 1.1), { r: [s > 0 ? 22.5 : 157.5, 0, 0], p: [x, -ap * Math.sin(Math.PI / 8), s * ap * Math.cos(Math.PI / 8)] }));
  }
  k.add("alu", G.extrudeX(G.rrect(0, R4 + 3.5, 12, 4, 1), x0 - 5, x0 + 1, { bevel: 0.6 }));
  const mounts = [];
  const top = G.picatinny(x1 - x0 - 2, { base: RAIL_TOP - R4 + 0.5 });
  k.add("alu", top.geo, { p: [x0 + 1, RAIL_TOP, 0] });
  k.add("steelWorn", railMarks(ctx, top, 18), { p: [x0 + 1, RAIL_TOP, 0] });
  mounts.push(ctx.railMount("hgTop", [x0 + 1 + top.first, RAIL_TOP, 0], "top", top.slots, { axis: "top" }));
  const sections = [["hgBottom", "bottom", 180, 102, [0, -R4 - 0.2, 0]], ["hgRight", "right", 90, 72, [0, 0, R4 + 0.2]], ["hgLeft", "left", -90, 72, [0, 0, -R4 - 0.2]]];
  for (const [id, face, rot, len, off] of sections) {
    const xs = x1 - 18 - len;
    const rr = G.picatinny(len, { base: 9.6 });
    const sk = ctx.kit();
    sk.add("alu", rr.geo, { p: [0, 9.4, 0] });
    sk.add("steel", G.T(G.screwHead(2.6, 1.2), { r: [-90, 0, 0] }), { p: [len * 0.25, 9.6, 0] });
    sk.add("steel", G.T(G.screwHead(2.6, 1.2), { r: [-90, 0, 0] }), { p: [len * 0.75, 9.6, 0] });
    const sec = sk.build();
    const holder = G.node("sec:" + id, [sec]);
    holder.position.set(xs, off[1], off[2]);
    holder.rotation.x = rot * Math.PI / 180;
    mounts.push(holder);
    const m = ctx.railMount(id, [xs + rr.first, (off[1] ? Math.sign(off[1]) : 0) * (R4 + 9.6), (off[2] ? Math.sign(off[2]) : 0) * (R4 + 9.6)], face, rr.slots, { axis: face });
    mounts.push(m);
  }
  return { root: G.node("hk_mlok", [k.build(), ...mounts]) };
}
function hkFront(ctx) {
  const { G } = ctx;
  const k = ctx.kit(), f = ctx.kit();
  k.add("alu", ctx.C.clampBody(-11, 11, 5));
  k.add("steel", ctx.C.crossBolt(0));
  k.add("steel", G.cylZ(2.2, -14.6, -12.8, { seg: 14, c: 0.4 }), { p: [-6.5, 2.2, 0] });
  f.add("alu", G.extrudeZ([[-9, 0, 1], [7, 0, 1], [7, 11, 2], [-9, 9, 2]], 16, { bevel: 0.8 }));
  for (const s of [-1, 1]) f.add("alu", G.extrudeZ([[-7, 8], [5, 8], [4, 24.6, 2], [-4.5, 24.6, 2]], 2.6, { bevel: 0.6, z: s * 6.2 }));
  f.add("alu", G.T(G.tubeX(9.6, 7.9, -4.5, 4.5, { seg: 40, c: 0.6 }), { p: [0, 30.5, 0] }));
  f.add("steel", G.cylY(3.3, 9, 13.5, { seg: 20, c: 0.5 }));
  f.add("steel", G.T(G.flutesX(3.1, 9.5, 13, 12, 0.8, 0.5), { r: [0, 0, 90] }));
  f.add("steel", G.cylY(1.9, 13, 30.5, { seg: 12, c: 0.3 }));
  f.add("steel", G.extrudeZ([[-1, 30], [1, 30], [0.8, 35.5, 0.3], [-0.8, 35.5, 0.3]], 1.6, { bevel: 0.2 }));
  f.add("tritium", G.T(G.sphere(0.55), { p: [-0.9, 34.4, 0] }));
  const flip = G.node("flip", [f.build()]);
  flip.position.set(-9, 5, 0);
  flip.children[0].position.set(9, -5, 0);
  return { root: G.node("hk_front", [k.build(), flip]), irons: { front: [0, 35.5, 0] }, flip: { node: flip, angle: 90 } };
}
function hkDiopter(ctx) {
  const { G } = ctx;
  const k = ctx.kit(), f = ctx.kit();
  k.add("alu", ctx.C.clampBody(-15, 15, 5.5));
  k.add("steel", ctx.C.crossBolt(0));
  const ear = [[-12, 0, 1], [12, 0, 1], [12, 30, 3], [7, 46, 4], [-7, 46, 4], [-12, 30, 3]];
  f.add("alu", G.extrudeZ(ear, 3, { bevel: 0.6, z: 11 }));
  f.add("alu", G.extrudeZ(ear, 3, { bevel: 0.6, z: -11 }));
  f.add("alu", G.extrudeZ([[-12, 0, 1], [12, 0, 1], [12, 22, 2], [-12, 22, 2]], 25, { bevel: 0.8 }));
  const AP = 2.1, Y = 35.5;
  for (const s of [-1, 1]) f.add("steel", G.T(G.cylZ(9.8, s > 0 ? AP : -8.5, s > 0 ? 8.5 : -AP, { seg: 28, c: 0.6 }), { p: [0, Y, 0] }));
  const half = (sg) => {
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const a = Math.asin(AP / 9.8) + i / 14 * (Math.PI - 2 * Math.asin(AP / 9.8));
      pts.push([Math.cos(a) * 9.8, sg * Math.sin(a) * 9.8]);
    }
    return pts;
  };
  for (const sg of [-1, 1]) f.add("steel", G.T(G.extrudeZ(half(sg), AP * 2 + 0.2, { bevel: 0.2 }), { p: [0, Y, 0] }));
  for (let a = 0; a < 360; a += 15) {
    if (Math.min(Math.abs(a - 180), a, 360 - a) < 25 || Math.abs(a - 90) < 8 || Math.abs(a - 270) < 8) continue;
    const t = a * Math.PI / 180;
    f.add("steel", G.T(G.box(1.1, 0.9, 15.6, { bevel: 0.25 }), { r: [0, 0, a], p: [Math.cos(t) * 10, Y + Math.sin(t) * 10, 0] }));
  }
  for (const s of [-1, 1]) f.add("lensBlack", G.cylY(1.4, -0.25, 0.25, { seg: 14 }), { p: [0, Y + s * 9.6, 0] });
  for (const [txt, a] of [["2", 90], ["3", 0], ["4", 270], ["5", 180]]) {
    const t = a * Math.PI / 180;
    f.add("steelWorn", engrave(ctx, txt, { h: 2.4, basis: "right", p: [Math.cos(t) * 6, Y + Math.sin(t) * 6, 8.45] }));
  }
  f.add("steel", G.T(G.tubeX(6.2, AP, -10.6, -9.2, { seg: 32, c: 0.3 }), { p: [0, Y, 0] }));
  f.add("steel", G.T(ctx.C.knob(5, 2.9, 14), { r: [0, -90, 0], p: [0, Y, 9.5] }));
  f.add("paintWhite", G.box(0.5, 3, 0.2, { bevel: 0 }), { p: [0, Y + 2.2, 12.45] });
  const flip = G.node("flip", [f.build()]);
  flip.position.set(12, 5.5, 0);
  flip.children[0].position.set(-12, -5.5, 0);
  return { root: G.node("hk_diopter", [k.build(), flip]), irons: { rear: [0, 35.5, 0], type: "aperture" }, flip: { node: flip, angle: -90 } };
}
function hkFlashHider(ctx) {
  const { G } = ctx;
  const k = ctx.kit();
  const flat = G.circle(0, 0, 10.6, 40).map(([z, y]) => [Math.max(-8.8, Math.min(8.8, z)), y]);
  k.add("steel", G.extrudeX(flat, -11, 5, { bevel: 0.7 }));
  k.add("steel", G.latheX([[4, 0], [4, 10.6], [14, 10.6], [15.2, 10.1], [15.2, 6.8], [16.2, 3.2], [16.2, 0]], { seg: 40 }));
  k.add("lensBlack", G.cylX(3.2, 15.6, 16.4, { seg: 16 }));
  const r0 = 6.8, r1 = 10.5, sw = 1.4;
  const ho = Math.PI / 6 - sw / r1, hi = Math.PI / 6 - sw / r0;
  const tine = [];
  for (let j = 0; j <= 8; j++) {
    const t = -ho + 2 * ho * j / 8;
    tine.push([Math.sin(t) * r1, Math.cos(t) * r1]);
  }
  for (let j = 8; j >= 0; j--) {
    const t = -hi + 2 * hi * j / 8;
    tine.push([Math.sin(t) * r0, Math.cos(t) * r0]);
  }
  for (let i = 0; i < 6; i++) k.add("steel", G.T(G.extrudeX(tine, 14.8, 49.4, { bevel: 0.45 }), { r: [i * 60 + 30, 0, 0] }));
  k.add("steel", G.latheX([[49, r0], [49, r1], [52.4, r1], [53.5, 9.4], [53.5, 7.6], [52.9, r0], [49, r0]], { seg: 40 }));
  return { root: k.build("hk_fh"), muzzle: { x: 53.5, kind: "fh", flash: 0.35 } };
}
function stockHkSlim(ctx) {
  const { G } = ctx;
  const k = ctx.kit();
  k.add("poly", G.sideLoft([[-10, 25], [40, 25], [88, 24], [130, 21], [152, 16]], [[-10, -94], [4, -86], [60, -52], [116, -22], [152, -16]], { w: 38, k: 3.6, width: (t) => 0.9 + 0.1 * t, rings: 28 }));
  const slotO = G.slot(9, 35, -48, 9, 8), slotI = G.slot(10.6, 33.4, -48, 5.8, 8);
  const pan = G.shape([[4, -26, 5], [96, -22, 5], [60, -40, 6], [12, -66, 6], [4, -64, 3]], [slotO]);
  for (const s of [-1, 1]) {
    k.add("polySoft", G.extrudeZ(pan, 3.6, { bevel: 0.5, z: s * 16.4 }));
    k.add("poly", G.extrudeZ(G.shape(slotO, [slotI]), 1.2, { bevel: 0.35, z: s * 17.1 }));
    k.add("lensBlack", G.extrudeZ(slotI, 0.3, { bevel: 0.05, z: s * 17.15 }));
  }
  k.add("rubber", G.extrudeZ([[-10, 26, 3], [-26, 25, 5], [-27, -95, 5], [-10, -96, 3]], 41, { bevel: 4 }));
  for (let i = 0; i < 9; i++) k.add("rubber", G.T(G.box(2, 3, 38), { p: [-27, 16 - i * 13, 0] }));
  for (const y of [8, -72]) k.add("steel", G.T(G.screwHead(2.4, 1), { r: [0, -90, 0], p: [-26.4, y, 0] }));
  k.add("poly", G.extrudeZ([[112, -18, 2], [146, -16, 2], [146, -24, 3], [118, -26, 3]], 14, { bevel: 1.5 }));
  k.add("steel", G.cylZ(1.6, -7.4, 7.4, { seg: 12, c: 0.3 }), { p: [140, -20, 0] });
  for (let i = 0; i < 4; i++) k.add("poly", G.box(1.2, 1, 12, { bevel: 0.3 }), { p: [118 + i * 3.4, -25.6 + i * 0.28, 0] });
  for (const s of [-1, 1]) {
    k.add("steel", G.cylZ(5.5, 0, 2.6, { seg: 20, c: 0.5 }), { p: [14, -22, s > 0 ? 17 : -19.6] });
    k.add("lensBlack", G.cylZ(3.2, 0, 0.6, { seg: 14 }), { p: [14, -22, s > 0 ? 19.4 : -20] });
  }
  return { root: k.build("hk_slim"), cheek: { x: 70, y: 25 } };
}
function stockCTR(ctx) {
  const { G } = ctx;
  const k = ctx.kit();
  k.add("poly", G.sideLoft([[-8, 24], [36, 22.5], [118, 20], [150, 17]], [[-8, -24], [30, -24], [92, -22], [150, -17]], { w: 36, k: 3.4, rings: 24 }));
  k.add("poly", G.extrudeZ([[-8, 20, 3], [10, 20, 3], [10, -92, 4], [-8, -92, 4]], 34, { bevel: 4, curve: 6 }));
  k.add("poly", G.extrudeZ([[2, -92, 3], [16, -92, 3], [106, -24, 5], [88, -18, 5], [2, -76, 4]], 28, { bevel: 4, curve: 6 }));
  k.add("poly", G.T(G.cylX(19, 60, 150, { c: 3, seg: 28 }), { p: [0, 0, 0] }));
  k.add("poly", G.extrudeZ([[96, -18, 2], [144, -18, 2], [144, -30, 3], [100, -28, 3]], 20, { bevel: 2 }));
  k.add("steel", G.cylZ(3, -11, 11, { seg: 14 }), { p: [128, -26, 0] });
  k.add("rubber", G.extrudeZ([[-8, 24, 3], [-22, 23, 4], [-22, -93, 4], [-8, -93, 3]], 38, { bevel: 3.5 }));
  for (let i = 0; i < 10; i++) k.add("rubber", G.T(G.box(1.6, 2.6, 34), { p: [-22.2, 16 - i * 11.5, 0] }));
  k.add("steel", G.wire([[20, -80, 0], [14, -99, 0], [-2, -99, 0], [-4, -84, 0]], 1.8, { n: 30 }));
  return { root: k.build("ctr"), cheek: { x: 60, y: 23 } };
}
function stockSopmod(ctx) {
  const { G } = ctx;
  const k = ctx.kit();
  const pro = [[150, -17, 3], [150, 18, 4], [110, 28, 16], [-8, 30, 5], [-8, -90, 6], [110, -22, 26]];
  k.add("poly", G.extrudeZ(pro, 34, { bevel: 4 }));
  for (const s of [-1, 1]) {
    k.add("poly", G.T(G.cylX(13, -6, 118, { c: 4, seg: 24 }), { p: [0, 12, s * 18] }));
    k.add("poly", G.T(G.cylX(11.5, 118, 132, { c: 2, seg: 24 }), { p: [0, 12, s * 18] }));
    k.add("steel", G.T(G.cylX(9, 130, 134, { c: 1, seg: 20 }), { p: [0, 12, s * 18] }));
  }
  k.add("poly", G.extrudeZ([[104, -20, 2], [146, -18, 2], [146, -27, 3], [110, -28, 3]], 18, { bevel: 2 }));
  k.add("rubber", G.extrudeZ([[-8, 30, 3], [-24, 29, 4], [-24, -91, 5], [-8, -91, 3]], 60, { bevel: 4 }));
  for (let i = 0; i < 10; i++) k.add("rubber", G.T(G.box(1.8, 2.6, 56), { p: [-24.2, 22 - i * 12, 0] }));
  return { root: k.build("sopmod"), cheek: { x: 60, y: 30 } };
}
function stanagProfile(len, depth, curve, top = 48) {
  const pts = [];
  const off = (y) => y > -20 ? 0 : curve * Math.pow((-20 - y) / (len - 20), 1.6);
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const y = top - i / n * (top + len);
    pts.push([-depth / 2 + off(y), y]);
  }
  for (let i = n; i >= 0; i--) {
    const y = top - i / n * (top + len);
    pts.push([depth / 2 + off(y), y]);
  }
  return { pts, off };
}
function magRounds(ctx, k, cal, top, x = -4, body = null, mat = "steelPark") {
  if (body) ctx.C.feedLips(body, mat, -31, 2, 48, 11.5);
  ctx.C.cartridge(k, cal, { p: [x - 26, top + 3.6, -2.6], r: [0, 0, -2] });
  ctx.C.cartridge(k, cal, { p: [x - 26, top - 3.2, 2.6], r: [0, 0, -2] });
}
function stanag(ctx, o) {
  const { G } = ctx;
  const k = ctx.kit(), rk = ctx.kit();
  const len = o.len, depth = 62, W = 23;
  const { pts, off } = stanagProfile(len, depth, o.curve ?? 22);
  k.add(o.mat, G.extrudeZ(pts.map((p) => [p[0], p[1], 0]), W, { bevel: o.bevel ?? 1.2 }));
  const edge = (sx, ins) => {
    const out = [];
    for (let y = -6; y >= -len + 6; y -= 8) out.push([sx * (depth / 2 - ins) + off(y), y, 0]);
    return out;
  };
  for (const sx of [-1, 1]) k.add(o.mat, G.wire(edge(sx, 1.4), 1.9, { n: 60, seg: 10 }));
  if (o.ribs) {
    const inner = stanagProfile(len - 18, depth - 18, (o.curve ?? 22) * 0.9, 30).pts;
    for (const s of [-1, 1]) {
      k.add(o.mat, G.extrudeZ(inner.map((p) => [p[0], p[1] - 8, 0]), 1, { bevel: 0.4, z: s * (W / 2 + 0.2) }));
      k.add(o.mat, G.T(G.box(depth - 8, 2.2, 1.2, { bevel: 0.45 }), { p: [0, -8, s * (W / 2 + 0.3)] }));
    }
  }
  if (o.texture) {
    const rw = o.window ? depth - 26 : depth - 14, rx = o.window ? 7 : 1;
    for (let i = 0; i < 7; i++) for (const s of [-1, 1]) {
      const y = -24 - i * 5;
      k.add(o.mat, G.T(G.box(rw, 1.5, 1, { bevel: 0.35 }), { p: [off(y) + rx, y, s * (W / 2 + 0.2)] }));
    }
    for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) for (const s of [-1, 1]) {
      const y = -len + 30 + r * 3.4, x = off(y) - 16 + c * 3.4;
      k.add(o.mat, G.box(1.9, 1.9, 1, { bevel: 0.35 }), { p: [x, y, s * (W / 2 + 0.15)] });
    }
  }
  k.add(o.follower || "polyTan", G.box(depth - 8, 3, W - 5), { p: [-2, o.top ?? 44, 0] });
  const fy = -len, rot = [0, 0, -Math.atan(off(fy) / len) * 20];
  const fp = o.texture ? [[-depth / 2 - 4, -4.5, 2], [depth / 2 + 6, -4.5, 2], [depth / 2 + 7, 1, 2], [depth / 2 + 1, 3.5, 1], [-depth / 2 - 1, 3.5, 1], [-depth / 2 - 5, 1, 2]] : [[-depth / 2 - 3, -3.5, 1.5], [depth / 2 + 4, -3.5, 1.5], [depth / 2 + 4, 3.5, 1], [-depth / 2 - 3, 3.5, 1]];
  k.add(o.plate || o.mat, G.T(G.extrudeZ(fp, W + 4, { bevel: o.texture ? 2 : 1.4 }), { p: [off(fy) + 2, fy - 1.5, 0], r: rot }));
  if (o.texture) for (let i = 0; i < 3; i++) for (const s of [-1, 1]) k.add(o.plate || o.mat, G.T(G.box(depth - 6, 0.9, 0.8, { bevel: 0.25 }), { p: [off(fy) + 2, fy - 3.4 + i * 1.9, s * (W / 2 + 2)], r: rot }));
  else k.add(o.plate || o.mat, G.T(G.cylY(3, -0.6, 0.6, { seg: 14 }), { p: [off(fy) + 14, fy - 5.2, 0] }));
  if (o.window) {
    k.add("glassDark", G.box(7, 60, 1, { bevel: 0.3 }), { p: [-depth / 2 + 10, -20, W / 2 + 0.1] });
    k.add(o.mat, G.extrudeZ(G.shape(G.rrect(-depth / 2 + 10, -20, 11, 64, 3), [G.rrect(-depth / 2 + 10, -20, 7.4, 60.4, 2)]), 1.2, { bevel: 0.35, z: W / 2 + 0.2 }));
  }
  magRounds(ctx, rk, o.cal || "556", 44, -4, k, o.lips || o.mat);
  const rounds = rk.build("rounds");
  return { root: G.node("mag", [k.build(), rounds]), mag: { cap: o.cap, rounds } };
}
function surefire60(ctx) {
  const { G } = ctx;
  const k = ctx.kit(), rk = ctx.kit();
  const { pts, off } = stanagProfile(150, 62, 10);
  k.add("alu", G.extrudeZ(pts.map((p) => [p[0], p[1] > -20 ? p[1] : p[1], 0]).map((p) => p), 23, { bevel: 1.2 }));
  const low = stanagProfile(150, 64, 10).pts.filter((p) => p[1] < -24).map((p) => [p[0], p[1], 0]);
  k.add("alu", G.extrudeZ(low, 38, { bevel: 3 }));
  k.add("alu", G.T(G.box(68, 8, 40, { bevel: 2 }), { p: [off(-150) + 2, -152, 0] }));
  magRounds(ctx, rk, "556", 44, -4, k, "alu");
  const rounds = rk.build("rounds");
  return { root: G.node("mag", [k.build(), rounds]), mag: { cap: 60, rounds } };
}
function drum60(ctx) {
  const { G } = ctx;
  const k = ctx.kit(), rk = ctx.kit();
  const { pts } = stanagProfile(70, 62, 0);
  k.add("poly", G.extrudeZ(pts.map((p) => [p[0], p[1], 0]), 23, { bevel: 1.2 }));
  for (const s of [-1, 1]) {
    k.add("poly", G.T(G.cylZ(58, 0, 34, { c: 4, seg: 40 }), { p: [8, -110, s > 0 ? 6 : -40] }));
    k.add("polySoft", G.T(G.cylZ(20, 0, 3, { c: 1, seg: 28 }), { p: [8, -110, s > 0 ? 39 : -43] }));
    k.add("glassDark", G.T(G.cylZ(9, 0, 1, { seg: 20 }), { p: [8, -110, s > 0 ? 42 : -44] }));
  }
  k.add("poly", G.T(G.box(20, 30, 12), { p: [8, -170, 0] }));
  magRounds(ctx, rk, "556", 44, -4, k, "poly");
  const rounds = rk.build("rounds");
  return { root: G.node("mag", [k.build(), rounds]), mag: { cap: 60, rounds } };
}
function charger(ctx, kind) {
  const { G } = ctx;
  const k = ctx.kit();
  k.add("alu", G.extrudeX(G.rrect(0, 0, 11, 6, 1.5), -6, 40, { bevel: 0.6 }));
  const wing = (z0, z1, ext) => G.extrudeY(G.shape([[-3, z0, 2], [-14 - ext, z0 + (z1 > z0 ? 0 : 0), 3], [-14 - ext, z1, 3], [-3, z1, 2]]), -4, 3, { bevel: 1 });
  if (kind === "std") {
    k.add("alu", G.extrudeY(G.shape([[0, -17, 2], [-13, -17, 4], [-13, 17, 4], [0, 17, 2]].map(([x, z, r]) => [x, z, r])), -4, 3, { bevel: 1 }));
    k.add("alu", G.extrudeY(G.shape([[-4, -17], [-12, -17, 2], [-12, -24, 3], [-4, -22, 2]]), -4, 2.5, { bevel: 0.8 }));
  } else if (kind === "raptor") {
    k.add("alu", G.extrudeY(G.shape([[0, -14, 2], [-12, -14, 3], [-12, 14, 3], [0, 14, 2]]), -4, 3, { bevel: 1 }));
    for (const s of [-1, 1]) k.add("poly", G.extrudeY(G.shape([[-2, s * 12], [-18, s * 13, 4], [-18, s * 32, 6], [-6, s * 30, 5]]), -5, 4, { bevel: 1.4 }));
  } else {
    k.add("alu", G.extrudeY(G.shape([[0, -17, 2], [-13, -17, 4], [-13, 17, 4], [0, 17, 2]]), -4, 3, { bevel: 1 }));
    k.add("alu", G.extrudeY(G.shape([[-3, -16], [-16, -17, 3], [-17, -34, 6], [-6, -30, 5]]), -5, 3, { bevel: 1.2 }));
  }
  return { root: k.build("charger"), charger: { travel: 64 } };
}
var M416_PARTS = [
  { id: "hk_quad", cat: "hg", name: "HK416 Quad Rail", desc: "Штатное цевьё с четырьмя планками Пикатинни", fit: { iface: ["hk416"] }, stats: { weight: 330, ergo: 0 }, build: quadRail },
  { id: "hk_mlok", cat: "hg", name: 'Цевьё M-LOK 10,5"', desc: "Облегчённое, верхняя планка + секции M-LOK", fit: { iface: ["hk416"] }, stats: { weight: 210, ergo: 6, length: 10 }, build: mlokRail },
  { id: "hk_fh", cat: "muzzle", name: "HK пламегаситель", desc: "Штатный щелевой пламегаситель", fit: { thread: ["1/2x28"] }, stats: { weight: 60, length: 44, flash: -45, loud: 0 }, build: hkFlashHider },
  { id: "hk_diopter", cat: "rearsight", name: "HK диоптр (складной)", desc: "Барабан с четырьмя диоптрами 200–500 м", foot: [-15, 15], body: [-15, 15], stats: { weight: 80 }, build: hkDiopter },
  { id: "hk_front", cat: "frontsight", name: "HK мушка (складная)", desc: "Мушка в кольцевом намушнике, тритий", foot: [-11, 11], body: [-11, 11], stats: { weight: 60 }, build: hkFront },
  { id: "hk_slim", cat: "stock", name: "HK A5 Slimline", desc: "Штатный 6-позиционный приклад", mountTypes: ["stock"], fit: { iface: ["ar"] }, body: [-40, 150], stats: { weight: 260, ergo: 0, "recoilV%": 0 }, build: stockHkSlim },
  { id: "ctr", cat: "stock", name: "Magpul CTR", desc: "Лёгкий, фрикционный фиксатор без люфта", mountTypes: ["stock"], fit: { iface: ["ar"] }, body: [-30, 150], stats: { weight: 230, ergo: 4, "recoilV%": 2 }, build: stockCTR },
  { id: "sopmod", cat: "stock", name: "B5 SOPMOD", desc: "Широкая щека, отсеки под батареи", mountTypes: ["stock"], fit: { iface: ["ar"] }, body: [-30, 150], stats: { weight: 330, ergo: -2, "recoilV%": -6 }, build: stockSopmod },
  { id: "hk_steel30", cat: "mag", name: "HK Steel 30", desc: "Стальной магазин HK на 30 патронов", fit: { iface: ["stanag"] }, stats: { weight: 470, mag: 30 }, build: (c) => stanag(c, { len: 128, mat: "steelPark", ribs: true, cap: 30, follower: "polyTan" }) },
  { id: "pmag30", cat: "mag", name: "Magpul PMAG 30 Gen M3", desc: "Полимер, 30 патронов", fit: { iface: ["stanag"] }, stats: { weight: 420, mag: 30, ergo: 1 }, build: (c) => stanag(c, { len: 128, mat: "poly", texture: true, cap: 30, follower: "polyGrey", bevel: 1.6 }) },
  { id: "pmag30w", cat: "mag", name: "PMAG 30 с окном", desc: "Окно контроля остатка", fit: { iface: ["stanag"] }, stats: { weight: 425, mag: 30 }, build: (c) => stanag(c, { len: 128, mat: "polyFde", texture: true, cap: 30, window: true, follower: "polyGrey", bevel: 1.6 }) },
  { id: "pmag40", cat: "mag", name: "Magpul PMAG 40", desc: "Удлинённый, 40 патронов", fit: { iface: ["stanag"] }, stats: { weight: 560, mag: 40, ergo: -3, adsTime: 10 }, build: (c) => stanag(c, { len: 168, curve: 22, mat: "poly", texture: true, cap: 40, follower: "polyGrey", bevel: 1.6 }) },
  { id: "sf60", cat: "mag", name: "SureFire MAG5-60", desc: "Четырёхрядный, 60 патронов", fit: { iface: ["stanag"] }, stats: { weight: 800, mag: 60, ergo: -6, adsTime: 20 }, build: surefire60 },
  { id: "d60", cat: "mag", name: "Magpul D-60", desc: "Барабан на 60 патронов", fit: { iface: ["stanag"] }, stats: { weight: 1100, mag: 60, ergo: -9, adsTime: 30 }, build: drum60 },
  { id: "ch_std", cat: "charger", name: "Штатная рукоять", desc: "Mil-spec, защёлка слева", fit: { iface: ["ar"] }, stats: { weight: 30 }, build: (c) => charger(c, "std") },
  { id: "ch_bcm", cat: "charger", name: "BCM Gunfighter Mod 4", desc: "Увеличенная защёлка", fit: { iface: ["ar"] }, stats: { weight: 36, ergo: 2 }, build: (c) => charger(c, "bcm") },
  { id: "ch_raptor", cat: "charger", name: "Radian Raptor", desc: "Двусторонняя, удобна с оптикой", fit: { iface: ["ar"] }, stats: { weight: 40, ergo: 3 }, build: (c) => charger(c, "raptor") }
];

// src/weapons/m416.js
var RAIL_TOP2 = 30.5;
function upperReceiver(ctx, k) {
  const { G } = ctx;
  const sec = [[14.5, -13, 1], [14.5, 7, 1], [13.4, 10.2, 1], [11, 15, 2], [-11, 15, 2], [-13.4, 10.2, 1], [-14.5, 7, 1], [-14.5, -13, 1]];
  const rB = 12.4, yT = 5, yB = -8;
  const port = [[14.5, yT], [14.5, 7], [13.4, 10.2], [11, 15], [-11, 15], [-13.4, 10.2], [-14.5, 7], [-14.5, -13], [14.5, -13], [14.5, yB]];
  const a0 = Math.atan2(yB, Math.sqrt(rB * rB - yB * yB)), a1 = Math.atan2(yT, Math.sqrt(rB * rB - yT * yT)) - Math.PI * 2;
  for (let i = 0; i <= 28; i++) {
    const a = a0 + (a1 - a0) * (i / 28);
    port.push([Math.cos(a) * rB, Math.sin(a) * rB]);
  }
  k.add("alu", G.extrudeX(sec, -142, -58.8, { bevel: 0.8 }));
  k.add("alu", G.extrudeX(port, -60, 8, { bevel: 0.25 }));
  k.add("alu", G.extrudeX(sec, 6.8, 38, { bevel: 0.8 }));
  const r = G.picatinny(178, { base: RAIL_TOP2 - 14.5 });
  k.add("alu", r.geo, { p: [-141, RAIL_TOP2, 0] });
  k.add("steelWorn", railMarks(ctx, r, 1), { p: [-141, RAIL_TOP2, 0] });
  k.add("alu", G.extrudeX([[-9, -13, 1], [9, -13, 1], [9, -4, 2], [-9, -4, 2]], -150, -140, { bevel: 0.6 }));
  k.add("alu", G.extrudeY([[-80, 14.2], [-60, 14.2], [-60.5, 17.6, 1.5], [-65, 21, 3], [-74, 20, 6]], -3.5, 12.5, { bevel: 1.6 }));
  const rings = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    rings.push({ x: -129 + 52 * t, pts: G.superEllipse(11.5 * Math.pow(1 - t, 1.25) + 0.8, 6.9 - 3.4 * t, 2.6, 28, 5 + t, 14.2) });
  }
  k.add("alu", G.loftX(rings, { flip: true, crease: 50 }));
  const fa = { r: [0, 12, 0], p: [-130, 5, 19.5] };
  k.add("alu", G.T(G.latheX([[0, 0], [0, 6.4], [0.8, 7.2], [14, 7.2], [18, 6], [18, 0]], { seg: 28 }), fa));
  const btn = [G.cylX(5.4, -8.6, 0.5, { c: 0.7, seg: 24 }), G.ringGrooves(5.5, -6.5, -1.5, 3, 0.35, { seg: 24 })];
  for (let i = -2; i <= 2; i++) {
    const y = i * 2.05, c = Math.sqrt(4.9 * 4.9 - y * y);
    btn.push(G.T(G.box(0.9, 1, c * 2, { bevel: 0.2 }), { p: [-8.8, y, 0] }));
  }
  for (const g of btn) k.add("steel", G.T(g, fa));
  k.add("steel", G.pin(2.2, 30), { p: [-122, -8, 0] });
  for (const [a, b] of [[-64, -60.4], [8.4, 12]]) k.add("alu", G.cylX(2.4, a, b, { c: 0.4, seg: 16 }), { p: [0, -9.5, 15.5] });
  for (const x of [22, 32]) k.pair("steel", G.screwHead(2.6, 1.2), { p: [x, -7.5, 14.4] });
  return { railFirst: -141 + r.first, railSlots: r.slots };
}
function bullet(G, x, y, s = 1) {
  return G.T(G.extrudeZ([[-0.7, -1.8], [0.7, -1.8], [0.7, 0.5], [0, 1.8], [-0.7, 0.5]].map(([u, v]) => [u * s, v * s]), 0.16, { bevel: 0.04 }), { p: [x, y, 0] });
}
function lowerReceiver(ctx, k, nodes) {
  const { G } = ctx;
  const body = [[-150, -13], [30, -13], [30, -24], [-40, -24], [-42, -40, 2], [-118, -40], [-124, -44, 2], [-150, -44, 3], [-156, -30, 6], [-156, -13]];
  k.add("alu", G.extrudeZ(body, 24, { bevel: 1.6 }));
  const well = G.shape(G.rrect(-6, 0, 74, 31, 3), [G.rrect(-6, 0, 67, 25, 2)]);
  k.add("alu", G.extrudeY(well, -60, -14, { bevel: 0.8 }));
  const flare = G.shape(G.rrect(-5, 0, 80, 35, 5), [G.rrect(-6, 0, 67, 25, 2)]);
  k.add("alu", G.extrudeY(flare, -65, -58, { bevel: 1.4 }));
  for (let i = 0; i < 12; i++) k.add("alu", G.box(1.4, 1.3, 24, { bevel: 0.4 }), { p: [31.1, -21 - i * 3, 0] });
  k.add("steelWorn", engrave(ctx, "HK416 A5", { h: 4.2, basis: "left", p: [-6, -29, -15.47] }));
  k.add("steelWorn", engrave(ctx, "5,56MM X45", { h: 2.6, basis: "left", p: [-6, -38, -15.47] }));
  k.add("steelWorn", engrave(ctx, "HK 21-09734", { h: 2.2, basis: "right", p: [-6, -44, 15.47] }));
  k.add("alu", G.extrudeZ([[26, -13], [44, -13], [44, -20, 4], [38, -26, 4], [26, -26]], 22, { bevel: 1.2 }));
  const tg = G.shape(
    [[-42, -38], [-44, -54, 4], [-53, -62, 6], [-110, -58, 8], [-122, -46, 4], [-122, -38]],
    [[[-50, -40], [-50, -51, 3], [-58, -56, 5], [-106, -52, 6], [-114, -44, 3], [-114, -40]]]
  );
  k.add("alu", G.extrudeZ(tg, 13, { bevel: 2 }));
  k.add("alu", G.extrudeZ([[-50, -16], [-38, -16], [-38, -34, 3], [-50, -34, 3]], 3, { bevel: 0.8, z: 13 }));
  k.add("steel", G.cylZ(5.2, 12, 15.2, { c: 0.6, seg: 24 }), { p: [-44, -25, 0] });
  for (const y of [-27, -25, -23]) k.add("steel", G.box(7, 0.8, 0.8, { bevel: 0.2 }), { p: [-44, y, 15.4] });
  k.add("steel", G.extrudeZ([[-38, -33.5, 1], [-38, -36, 1], [-51, -37, 1.5], [-54.5, -43.5, 1.5], [-58.5, -43, 1.5], [-57, -34, 2]], 1.8, { bevel: 0.5, z: 12.9 }));
  for (const y of [-39.5, -41.5]) k.add("steel", G.box(4, 0.6, 0.6, { bevel: 0.15 }), { p: [-56.2, y, 14] });
  k.add("alu", G.extrudeZ([[-61, -14], [-43, -14], [-43, -22, 2], [-50, -25, 3], [-61, -21, 2]], 2.4, { bevel: 0.7, z: -12.6 }));
  k.add("steel", G.extrudeZ([[-60, -15, 1], [-46, -15, 1], [-44.5, -18, 1], [-47.5, -33, 2.5], [-57, -33.5, 2.5], [-59, -26, 1.5]], 2.2, { bevel: 0.6, z: -14.5 }));
  for (const y of [-26, -28.2, -30.4]) k.add("steel", G.box(9, 0.7, 0.7, { bevel: 0.2 }), { p: [-52.4, y, -15.7] });
  k.add("steel", G.cylZ(1.6, -15.9, -13, { seg: 12, c: 0.2 }), { p: [-53, -17.5, 0] });
  k.add("steel", G.extrudeZ([[-52, -35], [-41, -35], [-40, -38, 1], [-51, -39.5, 1.5]], 1.8, { bevel: 0.5, z: -12.9 }));
  const pinHead = G.latheX([[0, 0], [0, 4.6], [0.4, 5], [1.2, 5], [1.5, 4.3], [2, 4.3], [2.3, 3.7], [2.3, 0]], { seg: 24 });
  for (const [x, y] of [[36, -18], [-138, -18]]) {
    k.add("steel", G.cylZ(3.2, -12.25, 12.1, { c: 0.35, seg: 20 }), { p: [x, y, 0] });
    k.add("steel", G.T(pinHead.clone(), { r: [0, -90, 0], p: [x, y, 11.8] }));
  }
  for (const [x, y] of [[-74, -34], [-86, -21]]) k.add("steel", G.cylZ(2.4, -12.2, 12.2, { c: 0.3, seg: 16 }), { p: [x, y, 0] });
  const SX = -106, SY = -28;
  for (const side of [1, -1]) {
    const add = (mat, g) => k.add(mat, side > 0 ? G.T(g, { p: [0, 0, 12.02] }) : G.T(G.mirrorZ(g), { p: [0, 0, -12.02] }));
    add("paintWhite", bullet(G, SX + 12, SY));
    add("paintWhite", G.T(G.box(5.4, 0.45, 0.16, { bevel: 0 }), { r: [0, 0, 55], p: [SX + 12, SY, 0] }));
    add("paintRed", bullet(G, SX, SY + 10.6, 0.9));
    for (const dx of [-1.9, 0, 1.9]) add("paintRed", bullet(G, SX - 12.5 + dx, SY, 0.75));
  }
  k.add("alu", G.T(G.cylX(17, -158, -142, { c: 1.5, seg: 32 }), { p: [0, 1, 0] }));
  k.add("steel", G.T(G.cylX(17.4, -168, -159, { c: 0.8, seg: 32 }), { p: [0, 1, 0] }));
  k.add("steel", G.T(G.flutesX(17, -166.5, -160.5, 8, 5, 2.4), { p: [0, 1, 0] }));
  k.add("steel", G.T(G.latheX([[-172, 0], [-172, 17], [-168, 19], [-168, 0]], { seg: 32 }), { p: [0, 1, 0] }));
  for (const s of [-1, 1]) {
    k.add("steel", G.cylZ(6, 0, 7, { c: 0.8, seg: 20 }), { p: [-166, 1, s > 0 ? 17 : -24] });
    k.add("lensBlack", G.cylZ(3.6, 0, 1, { seg: 16 }), { p: [-166, 1, s > 0 ? 23.6 : -24.6] });
  }
  k.add("alu", G.T(G.cylX(14.6, -338, -160, { c: 1.2, seg: 32 }), { p: [0, 1, 0] }));
  k.add("alu", G.extrudeX(G.rrect(0, -14.5, 9, 6, 1.5), -330, -168, { bevel: 0.6 }), { p: [0, 1, 0] });
  for (let i = 0; i < 6; i++) k.add("lensBlack", G.cylY(2, -1, 1, { seg: 12 }), { p: [-228 - i * 16, -16.5, 0] });
  const tk = ctx.kit();
  tk.add("steel", G.extrudeZ([[-3, 4], [3, 4], [3, -6, 2], [0, -16, 4], [-6, -22, 2], [-7.5, -20], [-3, -9, 3]], 6, { bevel: 1 }));
  tk.add("steel", G.cylZ(2.9, -3.4, 3.4, { seg: 16, c: 0.3 }));
  nodes.trigger = G.node("trigger", [tk.build()], { p: [-74, -34, 0] });
  const sk = ctx.kit();
  sk.add("steel", G.extrudeZ([[0, -4.2, 2], [13.5, -3, 2.5], [15.5, 0, 1.2], [13.5, 3, 2.5], [0, 4.2, 2]], 2.6, { bevel: 0.8, z: -13.7 }));
  sk.add("steel", G.extrudeZ([[0, -3.5, 2], [9.5, -2.6, 2], [10.5, 0, 1], [9.5, 2.6, 2], [0, 3.5, 2]], 2.4, { bevel: 0.6, z: 13.6 }));
  for (const x of [9, 11, 13]) sk.add("steel", G.box(0.7, 5.2 - (x - 9) * 0.5, 0.6, { bevel: 0.2 }), { p: [x, 0, -15.1] });
  for (const x of [6.5, 8.3]) sk.add("steel", G.box(0.7, 4.4, 0.6, { bevel: 0.2 }), { p: [x, 0, 14.9] });
  sk.add("steel", G.cylZ(5.4, -15.2, 15, { c: 0.6, seg: 24 }));
  nodes.selector = G.node("selector", [sk.build()], { p: [SX, SY, 0] });
  return [nodes.trigger, nodes.selector];
}
function barrel(ctx, k) {
  const { G } = ctx;
  k.add("steel", G.latheX([[38, 0], [38, 12], [60, 12], [61, 10.4], [250, 10.4], [252, 9.6], [354.5, 9.6], [355.5, 8.6], [357, 8.2], [357, 0]], { seg: 32 }));
  k.add("steel", G.ringGrooves(6.3, 357, 366.8, 11, 0.35, { seg: 24 }));
  k.add("steel", G.latheX([[366.6, 0], [366.6, 6.1], [368, 5.3], [368, 3.2], [367.2, 2.8], [362, 2.8], [362, 0]], { seg: 24 }));
  k.add("steel", G.extrudeX([[-13, -10.5, 5], [13, -10.5, 5], [13, 10, 3], [8, 19, 4], [-8, 19, 4], [-13, 10, 3]], 258, 286, { bevel: 1.2 }));
  k.add("steel", G.T(G.cylX(7, 238, 262, { seg: 20 }), { p: [0, 14, 0] }));
  for (const x of [264, 280]) k.add("steel", G.pin(2, 27.2), { p: [x, -5, 0] });
  k.add("steel", G.T(ctx.C.knob(5.5, 4, 16), { r: [0, 90, 0], p: [272, 12, -12.6] }));
}
function carrierGroup(ctx) {
  const { G } = ctx;
  const k = ctx.kit();
  k.add("steelPark", G.latheX([[-190, 0], [-190, 11.2], [-186, 12], [-60, 12], [-58, 11], [-44, 11], [-42, 12], [-6, 12], [-5, 10], [-5, 0]], { seg: 32 }));
  k.add("steelPark", G.extrudeX(G.rrect(0, 12.5, 9, 6, 1.5), -150, -20, { bevel: 0.6 }));
  for (const x of [-35, -26]) k.add("lensBlack", G.T(G.cylZ(1.5, 0, 1, { seg: 14 }), { s: [1.9, 1, 1], p: [x, 3.5, 11.3] }));
  k.add("steelWorn", G.box(7, 3, 6, { bevel: 0.6 }), { p: [-32, 12.4, 0] });
  k.add("steelWorn", G.latheX([[-6, 0], [-6, 8.2], [4, 8.2], [4.6, 7.4], [4.6, 0]], { seg: 20 }));
  for (let i = 0; i < 7; i++) k.add("steelWorn", G.T(G.box(4, 3, 3.6, { bevel: 0.4 }), { p: [2.8, 9, 0], r: [i * 51.4, 0, 0] }));
  k.add("steel", G.extrudeZ([[-18, 6], [2, 6], [3, 8.2, 0.6], [2, 9.5], [-18, 9.5]], 3, { bevel: 0.5, z: 7.2 }));
  k.add("steel", G.cylZ(0.9, 6.5, 9.6, { seg: 10 }), { p: [-12, 7.8, 0] });
  return G.node("carrier", [k.build()]);
}
function dustCover(ctx) {
  const { G } = ctx;
  const k = ctx.kit();
  k.add("steelPark", G.extrudeZ([[-60, 1.2, 1], [8, 1.2, 1], [8, 15, 1.5], [-60, 15, 1.5]], 1.4, { bevel: 0.4, z: -0.2 }));
  k.add("steelPark", G.extrudeZ([[-54, 4.6, 3], [-3.5, 4.6, 3], [-3.5, 11.6, 3], [-54, 11.6, 3]], 1.2, { bevel: 0.45, z: 0.6 }));
  for (const [a, b] of [[-59.8, -33], [-23, 7.8]]) k.add("steelPark", G.tubeX(2.1, 1.45, a, b, { seg: 16, c: 0.4 }));
  k.add("steel", G.cylX(1.4, -64.5, 12.6, { seg: 12, c: 0.3 }));
  k.add("steel", G.tubeX(2, 1.3, 12.6, 13.4, { seg: 14, c: 0.2 }));
  k.add("steel", G.T(G.latheX([[0, 0], [0, 2.2], [0.5, 2.2], [0.9, 1.4], [0.9, 0]], { seg: 16 }), { r: [0, -90, 0], p: [-57, 12.4, 0.45] }));
  return G.node("dustCover", [k.build()], { p: [0, -9.5, 15.5] });
}
function build(ctx) {
  const { G, THREE: THREE9 } = ctx;
  const k = ctx.kit();
  const nodes = {};
  const up = upperReceiver(ctx, k);
  const lowerNodes = lowerReceiver(ctx, k, nodes);
  barrel(ctx, k);
  const body = k.build("receiver");
  nodes.carrier = carrierGroup(ctx);
  nodes.dustCover = dustCover(ctx);
  const root = G.node("m416", [body, nodes.carrier, nodes.dustCover, ...lowerNodes]);
  root.add(ctx.railMount("upperRail", [up.railFirst, RAIL_TOP2, 0], "top", up.railSlots, { axis: "top" }));
  root.add(ctx.mount({ id: "hg", type: "hg", p: [38, 0, 0] }));
  root.add(ctx.mount({ id: "muzzle", type: "thread", p: [368, 0, 0] }));
  root.add(ctx.mount({ id: "magwell", type: "magwell", p: [-6, -62, 0] }));
  root.add(ctx.mount({ id: "grip", type: "grip", p: [-121, -40, 0] }));
  root.add(ctx.mount({ id: "stock", type: "stock", p: [-338, 1, 0], slots: 6, pitch: -16, axis: "stock" }));
  root.add(ctx.mount({ id: "charger", type: "charger", p: [-142, 18, 0] }));
  return {
    root,
    nodes,
    anim: { carrierTravel: 92, portCover: nodes.dustCover, selector: { safe: 0, semi: 90, auto: 180 } },
    eject: { p: [-26, 2, 16], dir: [0.25, 0.35, 1] },
    muzzle: [368, 0, 0],
    chamber: [0, 0, 0],
    eyeX: -238,
    cheekY: RAIL_TOP2 + 22,
    focus: { center: [20, -20, 0], size: 920 }
  };
}
var m416_default = {
  id: "m416",
  title: "HK416 A5",
  short: "M416",
  caliber: "5,56×45 NATO",
  cal: "556",
  thread: "1/2x28",
  specs: [["Ствол", '368 мм (14,5")'], ["Автоматика", "газовый поршень"], ["Темп", "850 выстр/мин"], ["Масса", "3,49 кг"]],
  base: { weight: 2420, length: 800, ergo: 52, recoilV: 100, recoilH: 100, moa: 1.4, velocity: 880, range: 450, loud: 160, flash: 70, adsTime: 280, rpm: 850, mag: 30 },
  audio: { cal: "556", body: 0.55, crack: 1, mech: 0.8 },
  modes: ["safe", "semi", "auto"],
  build,
  slots: [
    { id: "handguard", label: "Цевьё", group: "Цевьё и ствол", accepts: ["hg"], mount: "hg", iface: "hk416" },
    { id: "muzzle", label: "Дульное устройство", group: "Цевьё и ствол", accepts: ["muzzle"], mount: "muzzle" },
    { id: "rearsight", label: "Целик", group: "Оптика", accepts: ["rearsight"], rails: ["upperRail"], prefer: "rear" },
    { id: "frontsight", label: "Мушка", group: "Оптика", accepts: ["frontsight"], rails: ["hgTop"], prefer: "front" },
    { id: "optic", label: "Прицел", group: "Оптика", accepts: ["optic"], rails: ["upperRail", "hgTop"], prefer: { x: -40 } },
    { id: "magnifier", label: "Увеличитель", group: "Оптика", accepts: ["magnifier"], rails: ["upperRail", "hgTop"], prefer: { x: -90 }, behind: "optic" },
    { id: "offset", label: "Боковой коллиматор", group: "Оптика", accepts: ["offset"], rails: ["upperRail", "hgTop"], prefer: { x: 20 } },
    { id: "under", label: "Под стволом", group: "Тактика", accepts: ["foregrip", "bipod"], rails: ["hgBottom"], prefer: { x: 190 } },
    { id: "tacRight", label: "Правая планка", group: "Тактика", accepts: ["light", "laser", "combo"], rails: ["hgRight"], prefer: "front" },
    { id: "tacLeft", label: "Левая планка", group: "Тактика", accepts: ["light", "laser", "combo"], rails: ["hgLeft"], prefer: "front" },
    { id: "tacTop", label: "Верх цевья", group: "Тактика", accepts: ["laser"], rails: ["hgTop"], prefer: "front" },
    { id: "mag", label: "Магазин", group: "Ствольная коробка", accepts: ["mag"], mount: "magwell", iface: "stanag" },
    { id: "pgrip", label: "Пистолетная рукоять", group: "Ствольная коробка", accepts: ["pgrip"], mount: "grip", iface: "ar" },
    { id: "stock", label: "Приклад", group: "Ствольная коробка", accepts: ["stock"], mount: "stock", rails: ["stock"], iface: "ar", prefer: { x: -386 } },
    { id: "charger", label: "Рукоять заряжания", group: "Ствольная коробка", accepts: ["charger"], mount: "charger", iface: "ar" }
  ],
  parts: M416_PARTS,
  defaults: {
    handguard: "hk_quad",
    muzzle: "hk_fh",
    optic: null,
    rearsight: "hk_diopter",
    frontsight: "hk_front",
    magnifier: null,
    under: null,
    tacRight: null,
    tacLeft: null,
    tacTop: null,
    mag: "hk_steel30",
    pgrip: "hk_v2",
    stock: "hk_slim",
    charger: "ch_std"
  }
};


export { m416_default as def };
