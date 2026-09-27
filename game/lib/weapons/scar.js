// СГЕНЕРИРОВАНО game/tools/build_weapons.mjs из game/weapons/scar-h.html — не редактировать вручную.
import { PICA, T, box, circle, cylX, cylY, cylZ, extrudeX, extrudeY, extrudeZ, flutesX, grip, gripLoft, latheX, loftX, magnifier, mount, node, picatinny, pin, ringGrooves, rrect, shape, slot, sphere, superEllipse, tubeX } from './engine.js';
// src/weapons/scar.js
var RAIL_TOP = 30.5;
var UP_REAR = -192;
var UP_FRONT = 266;
var BARREL = 406;
var YB = -16;
var HB = -44;
var W = 19;
var W2 = 18.3;
var HW = 21;
var PY0 = -12;
var PY1 = 1.5;
var SLY0 = 3.5;
var SLY1 = 9.5;
var SL0 = -66;
var SL1 = 104;
var RB = 13.2;
function hexScrew(k, x, y, z, s, r = 2.6, mat = "steelPark") {
  const head = cylZ(r, 0, 1.2, { c: 0.45, seg: 20 });
  const sock = cylZ(r * 0.46, 0.95, 1.28, { c: 0, seg: 6 });
  const t = { p: [x, y, z], s: [1, 1, s] };
  k.add(mat, T(head, t));
  k.add("lensBlack", T(sock, t));
}
function pinHead(k, x, y, z, s, r = 3, h = 1, mat = "steel") {
  k.add(mat, T(cylZ(r, 0, h, { c: 0.4, seg: 18 }), { p: [x, y, z], s: [1, 1, s] }));
}
function qdSocket(k, x, y, z, s) {
  k.add("steel", T(cylZ(5.4, 0, 1.8, { c: 0.5, seg: 24, ri: 3.2 }), { p: [x, y, z], s: [1, 1, s] }));
  k.add("lensBlack", T(cylZ(3.3, 0, 0.6, { c: 0, seg: 16 }), { p: [x, y, z + s * 0.3] }));
}
function recSec(o = {}) {
  const side = (slot2) => {
    const s = [];
    if (slot2) s.push([W2, SLY0 - 0.2, 0.3], [W2 - 2.6, SLY0 + 0.3], [W2 - 2.6, SLY1 - 0.3], [W2, SLY1 + 0.2, 0.3]);
    s.push([W2, 12.5, 1.6], [15.2, 20.6, 1]);
    return s;
  };
  const low = [[W, YB, 1], [W, 2, 0.3], [W2, 2.8, 0.3]];
  const R4 = o.port ? [[W2, PY1, 0.4], ...side(o.slotR)] : [...low, ...side(o.slotR)];
  const L = [...low, ...side(o.slotL)].reverse().map(([z, y, r]) => [-z, y, r || 0]);
  const pts = [...R4, ...L];
  if (o.port) {
    pts.push([W, YB, 1], [W, PY0, 0.4]);
    const a0 = Math.asin(PY0 / RB), a1 = Math.asin(PY1 / RB) - Math.PI * 2;
    for (let i = 0; i <= 28; i++) {
      const a = a0 + (a1 - a0) * (i / 28);
      pts.push([Math.cos(a) * RB, Math.sin(a) * RB]);
    }
  }
  return pts;
}
function hgSec(slot2, bot = HB) {
  const R4 = [[12, bot, 2.5], [HW, bot + 9, 1.5]];
  if (slot2) R4.push([HW, SLY0 - 0.2, 0.3], [HW - 4.4, SLY0 + 0.3], [HW - 4.4, SLY1 - 0.3], [HW, SLY1 + 0.2, 0.3]);
  R4.push([HW, 12.5, 1.6], [16.6, 20.6, 1]);
  const L = R4.slice().reverse().map(([z, y, r]) => [-z, y, r || 0]);
  return shape([...R4, ...L], [circle(0, 0, 15.6, 32)]);
}
function upper(ctx, k) {
  const M = "aluFde";
  k.add(M, extrudeX(recSec(), UP_REAR + 1, -74, { bevel: 0.6 }));
  k.add(M, extrudeX(recSec({ port: true }), -74, SL0, { bevel: 0.3 }));
  k.add(M, extrudeX(recSec({ port: true, slotL: true, slotR: true }), SL0, 6, { bevel: 0.3 }));
  k.add(M, extrudeX(recSec({ slotL: true, slotR: true }), 6, 48, { bevel: 0.3 }));
  k.add(M, extrudeX(hgSec(true), 48, SL1, { bevel: 0.8 }));
  k.add(M, extrudeX(hgSec(false), SL1, UP_FRONT - 30, { bevel: 0.3 }));
  k.add(M, extrudeX(hgSec(false, HB + 10), UP_FRONT - 30, UP_FRONT, { bevel: 1.4 }));
  for (const s of [-1, 1]) {
    k.add("lensBlack", extrudeZ(rrect((SL0 + 48) / 2, (SLY0 + SLY1) / 2, 48 - SL0 - 1, SLY1 - SLY0 - 0.8, 0.5), 0.2, { bevel: 0, z: s * (W2 - 2.5) }));
    k.add("lensBlack", extrudeZ(rrect((48 + SL1) / 2, (SLY0 + SLY1) / 2, SL1 - 48 - 1, SLY1 - SLY0 - 0.8, 0.5), 0.2, { bevel: 0, z: s * (HW - 4.3) }));
  }
  const liner = [];
  for (let i = 0; i <= 24; i++) {
    const a = (35 + i / 24 * 290) * Math.PI / 180;
    liner.push([Math.cos(a) * 13.1, Math.sin(a) * 13.1]);
  }
  for (let i = 24; i >= 0; i--) {
    const a = (35 + i / 24 * 290) * Math.PI / 180;
    liner.push([Math.cos(a) * 12.7, Math.sin(a) * 12.7]);
  }
  k.add("lensBlack", extrudeX(liner, -74, 6, { bevel: 0 }));
  k.add("lensBlack", cylX(15.5, UP_FRONT - 6, UP_FRONT - 5, { c: 0, seg: 32 }));
  k.add(M, extrudeZ([[14, YB + 1], [52, YB + 1], [52, HB + 2], [47, HB, 3], [38, HB + 2, 10], [24, YB - 12, 10], [16, YB - 5, 3]], 32, { bevel: 4, bevelSeg: 3 }));
  for (const s of [-1, 1]) {
    k.add(M, extrudeZ([[54, -4, 1], [117, -4, 1], [117, -34, 2], [72, -34, 3], [56, -22, 3]], 1.6, { bevel: 0.5, z: s * (HW + 0.2) }));
    k.add(M, extrudeZ(rrect(191, 4, 146, 24, 2), 1.6, { bevel: 0.5, z: s * (HW + 0.2) }));
    for (let i = 0; i < 4; i++) k.add("lensBlack", extrudeZ(slot(76 + i * 10, 82 + i * 10, -27, 3.6), 0.3, { bevel: 0, z: s * (HW + 0.95) }));
    k.add("lensBlack", extrudeZ([[UP_REAR + 6, 14.4], [47, 14.4], [47, 14.9], [UP_REAR + 6, 14.9]], 0.2, { bevel: 0, z: s * W2 }));
    k.add("lensBlack", extrudeZ([[49, 14.4], [UP_FRONT - 2, 14.4], [UP_FRONT - 2, 14.9], [49, 14.9]], 0.2, { bevel: 0, z: s * HW }));
    for (const x of [62, 110]) hexScrew(k, x, -10, s * (HW + 1), s, 2.4);
    for (const x of [134, 184, 234]) hexScrew(k, x, -18, s * (HW + 1), s, 2.4);
    for (const y of [-7, 11]) hexScrew(k, UP_REAR + 10, y, s * (y > 2 ? W2 : W), s, 2.3);
  }
  for (const x of [20, 36]) {
    hexScrew(k, x, -7, W, 1, 3.8, "steel");
    k.add("steelPark", T(cylZ(4.4, -1.4, 0, { c: 0.4, seg: 6 }), { p: [x, -7, -W] }));
  }
  qdSocket(k, UP_FRONT - 15, -18, -HW, -1);
  const r = picatinny(UP_FRONT - UP_REAR - 4, { base: RAIL_TOP - 21 + 0.6 });
  k.add(M, r.geo, { p: [UP_REAR + 2, RAIL_TOP, 0] });
  for (let i = 0; i < r.slots - 1; i += 2) {
    const x = UP_REAR + 2 + r.first + (i + 0.5) * PICA.PITCH;
    const n = i >= 20 ? 3 : i >= 10 ? 2 : 1;
    for (let j = 0; j < n; j++) k.add("paintWhite", T(box(0.5, 0.14, 1.8, { bevel: 0.05 }), { p: [x + (j - (n - 1) / 2) * 1.1, RAIL_TOP + 0.02, 5.4] }));
  }
  const defl = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, e = Math.sin(t * Math.PI / 2);
    defl.push({ x: -110 + 36 * t, pts: superEllipse(0.4 + 7.8 * e, 6 + 6.6 * e, 2.8, 28, -1 + 0.3 * e, W - 1.5) });
  }
  k.add(M, loftX(defl, { crease: 50, flip: true }));
  k.add(M, extrudeX(rrect(0, 2.3, 36.6, 36.2, 3.5), UP_REAR - 6, UP_REAR + 2, { bevel: 1.6, bevelSeg: 3 }));
  const mounts = [];
  const side = (id, face, rot, pos, len = 142) => {
    const rr = picatinny(len, { base: 6.5 });
    k.add(M, rr.geo, { r: rot, p: pos });
    mounts.push(ctx.railMount(id, [pos[0] + rr.first, pos[1], pos[2]], face, rr.slots, { axis: face }));
    return rr;
  };
  side("rightRail", "right", [90, 0, 0], [UP_FRONT - 146, 4, HW + 6.1]);
  side("leftRail", "left", [-90, 0, 0], [UP_FRONT - 146, 4, -HW - 6.1]);
  side("bottomRail", "bottom", [180, 0, 0], [UP_FRONT - 150, HB - 6.1, 0], 120);
  for (const s of [-1, 1]) for (const x of [UP_FRONT - 143, UP_FRONT - 7]) hexScrew(k, x, 4, s * (HW + 6.3), s, 2.2);
  mounts.push(ctx.railMount("topRail", [UP_REAR + 2 + r.first, RAIL_TOP, 0], "top", r.slots, { axis: "top" }));
  return mounts;
}
function lower(ctx, k, nodes) {
  const M = "polyFde";
  k.add(M, extrudeZ([[-188, YB], [20, YB], [22, -22, 2], [-66, -24, 2], [-70, -40, 3], [-122, -42, 2], [-128, -46, 3], [-160, -46, 5], [-180, -36, 10], [-192, -22, 4]], 35, { bevel: 2.4, bevelSeg: 3 }));
  k.add(M, extrudeZ([[-186, YB - 3.5], [18, YB - 3.5], [18, YB + 0.5], [-186, YB + 0.5]], 36.6, { bevel: 0.8 }));
  const well = shape(rrect(-30, 0, 90, 36, 5), [rrect(-30, 0, 81, 27, 2)]);
  k.add(M, extrudeY(well, -60, YB, { bevel: 1.4 }));
  k.add(M, extrudeY(shape(rrect(-28, 0, 97, 41, 8), [rrect(-30, 0, 81, 27, 2)]), -70, -58, { bevel: 2, bevelSeg: 3 }));
  k.add(M, extrudeZ([[13, YB], [24, YB], [24, -26, 3], [21, -60, 4], [14, -70, 3], [12, -58]], 32, { bevel: 2.4, bevelSeg: 3 }));
  for (const s of [-1, 1]) {
    k.add(M, extrudeZ(shape(rrect(-30, -40, 64, 26, 5), [rrect(-30, -40, 57, 19, 3)]), 1.6, { bevel: 0.5, z: s * 18.3 }));
    k.add("polyFdeDark", extrudeZ(rrect(-30, -40, 58, 20, 3), 0.6, { bevel: 0.2, z: s * 18.1 }));
    for (let i = 0; i < 5; i++) k.add("polyFdeDark", T(box(53, 1.4, 1.2, { bevel: 0.4 }), { p: [-30, -47.6 + i * 3.8, s * 18.5] }));
    k.add(M, extrudeZ([[-186, -19, 2], [-146, -19, 2], [-150, -40, 3], [-162, -43, 4], [-176, -36, 6], [-186, -26, 3]], 1.4, { bevel: 0.5, z: s * 17.6 }));
    qdSocket(k, -174, -28, s * 18.2, s);
    k.add(M, extrudeZ(shape(circle(-80, -27, 7.6, 24), [circle(-80, -27, 5.8, 20)]), 1.8, { bevel: 0.5, z: s * 18.2 }));
    k.add("poly", cylZ(5.2, 0, 2.2, { c: 0.8, seg: 20 }), { p: [-80, -27, s > 0 ? 17.4 : -19.6] });
    k.add("polyFdeDark", T(cylZ(3.4, 0, 0.3, { seg: 16, c: 0 }), { p: [-80, -27, s * 19.6], s: [1, 1, s] }));
    k.add("polyFdeDark", T(cylZ(8.6, 0, 0.8, { c: 0.3, seg: 28 }), { p: [-122, -24, s * 17.3], s: [1, 1, s] }));
    for (const [a, n] of [[0, 1], [90, 2], [180, 3]]) {
      const ar = a * Math.PI / 180;
      for (let j = 0; j < n; j++) k.add("paintWhite", T(box(0.7, 2.6, 0.2, { bevel: 0.05 }), { p: [-122 + Math.cos(ar) * 11 + (j - (n - 1) / 2) * 1.3 * Math.sin(ar), -24 + Math.sin(ar) * 11, s * 17.6], r: [0, 0, a - 90] }));
    }
  }
  const tg = shape(
    [[-68, -38], [-71, -52, 4], [-82, -59, 7], [-116, -57, 8], [-127, -44, 4], [-127, -38]],
    [[[-78, -40], [-78, -49, 3], [-85, -52, 4], [-112, -51, 5], [-119, -43, 3], [-119, -40]]]
  );
  k.add(M, extrudeZ(tg, 12, { bevel: 2, bevelSeg: 3 }));
  k.add("poly", extrudeZ([[-72, -18, 1], [-52, -18, 2], [-49, -23, 2], [-56, -30, 3], [-64, -28, 2], [-72, -23, 1]], 2.4, { bevel: 0.7, z: -18.8 }));
  for (let i = 0; i < 3; i++) k.add("poly", T(box(0.8, 7, 1), { p: [-60 + i * 2.6, -23.5, -20.2] }));
  pinHead(k, -68, -21, -17.8, -1, 2.6, 1.6, "steelPark");
  for (const [x, y, r] of [[-95, -30, 2.4], [-112, -30, 2.4], [-172, -21, 3.4], [8, -21, 3.4]]) {
    k.add("steel", pin(r * 0.75, 36.4), { p: [x, y, 0] });
    pinHead(k, x, y, -18.2, -1, r, 1.1);
  }
  const tk = ctx.kit();
  tk.add("steel", extrudeZ([[-3, 4], [3, 4], [3, -5, 2], [1.6, -12, 6], [-2.2, -19, 4], [-6.5, -22.5, 1.5], [-7.6, -21], [-4.8, -16, 5], [-3.2, -8, 3]], 6, { bevel: 1.1, bevelSeg: 3 }));
  nodes.trigger = node("trigger", [tk.build()], { p: [-90, -34, 0] });
  const sk = ctx.kit();
  sk.add("steelPark", extrudeZ([[0, -4.5, 2], [17, -3.2, 2], [23, -4.2, 2], [24, 3.6, 2.5], [16, 3, 2], [0, 4.5, 2]], 3, { bevel: 0.9, z: -19.4 }));
  sk.add("steelPark", extrudeZ([[0, -4.5, 2], [18, -3, 3], [19, 3, 3], [0, 4.5, 2]], 3, { bevel: 0.9, z: 19.4 }));
  for (const s of [-1, 1]) {
    sk.add("steelPark", T(cylZ(5.4, 0, 1.2, { c: 0.5, seg: 22 }), { p: [0, 0, s * 20.3], s: [1, 1, s] }));
    sk.add("lensBlack", T(cylZ(1.8, 0, 0.3, { c: 0, seg: 12 }), { p: [0, 0, s * 21.4], s: [1, 1, s] }));
  }
  sk.add("steel", cylZ(5, -18.5, 18.5, { c: 0.6, seg: 20 }));
  for (let i = 0; i < 3; i++) sk.add("steelPark", T(box(0.9, 6, 1), { p: [18 + i * 2.2, 0, -21.3] }));
  nodes.selector = node("selector", [sk.build()], { p: [-122, -24, 0] });
  return [nodes.trigger, nodes.selector];
}
function barrel(ctx, k) {
  const GB = UP_FRONT + 2;
  k.add("steelPark", latheX([[UP_FRONT - 40, 0], [UP_FRONT - 40, 13.6], [UP_FRONT + 1, 13.6], [UP_FRONT + 1.6, 11.4], [GB + 31, 11.4], [GB + 32, 10.6], [BARREL - 70, 10.2], [BARREL - 15, 9.5], [BARREL - 14, 9.5], [BARREL - 13.4, 7.6], [BARREL, 7.6], [BARREL, 3.9], [BARREL - 8, 3.9], [BARREL - 8, 0]], { seg: 36 }));
  k.add("steelPark", ringGrooves(7.95, BARREL - 13, BARREL - 0.3, 16, 0.4, { seg: 24 }));
  k.add("lensBlack", cylX(3.95, BARREL - 7.9, BARREL - 7.7, { c: 0, seg: 16 }));
  const gb = [];
  for (let i = 0; i <= 12; i++) {
    const a = (-160 + i * (140 / 12)) * Math.PI / 180;
    gb.push([Math.cos(a) * 14.2, Math.sin(a) * 14.2]);
  }
  gb.push([13.4, 3, 1.5], [11.4, 19, 3], [8.4, 26, 4], [-8.4, 26, 4], [-11.4, 19, 3], [-13.4, 3, 1.5]);
  k.add("steel", extrudeX(shape(gb, [circle(0, 0, 11.4, 28)]), GB, GB + 30, { bevel: 1.6, bevelSeg: 3 }));
  for (const x of [GB + 8, GB + 22]) {
    k.add("steelPark", pin(2.2, 27.6), { p: [x, -7, 0] });
    for (const s of [-1, 1]) k.add("lensBlack", T(cylZ(0.9, 0, 0.2, { c: 0, seg: 10 }), { p: [x, -7, s * 13.8], s: [1, 1, s] }));
  }
  k.add("steelPark", T(cylX(3, 0, 1.4, { c: 0.4, seg: 6 }), { r: [0, 0, 90], p: [GB + 15, 26, 0] }));
  k.add("steel", T(cylX(8.6, GB + 30, GB + 40, { c: 1, seg: 28 }), { p: [0, 17, 0] }));
  k.add("steel", T(flutesX(8.2, GB + 31.5, GB + 38.5, 18, 1.2, 0.6), { p: [0, 17, 0] }));
  k.add("steelPark", T(cylX(5.2, GB + 40, GB + 43, { c: 0.8, seg: 20 }), { p: [0, 17, 0] }));
  k.add("lensBlack", T(box(0.2, 1.4, 7), { p: [GB + 43.05, 17, 0] }));
  k.add("steel", extrudeZ([[GB + 32, 13, 1], [GB + 39, 13, 1], [GB + 40, 22, 2], [GB + 33, 23, 2]], 2.2, { bevel: 0.6, z: -9.6 }));
  k.add("paintWhite", T(box(0.5, 2.4, 0.2), { p: [GB + 26, 20, -11.8] }));
}
function carrier(ctx) {
  const k = ctx.kit();
  k.add("steelPark", latheX([[-150, 0], [-150, 12.4], [-6, 12.4], [-5, 9], [-5, 0]], { seg: 28 }));
  for (const a of [70, 110]) k.add("lensBlack", T(box(120, 1, 0.8), { p: [-80, Math.cos(a * Math.PI / 180) * 12.45, Math.sin(a * Math.PI / 180) * 12.45], r: [-(a - 90), 0, 0] }));
  k.add("steelWorn", latheX([[-8, 0], [-8, 9.2], [4, 9.2], [4.6, 8.4], [4.6, 0]], { seg: 20 }));
  for (let i = 0; i < 7; i++) k.add("steelWorn", T(box(4, 3, 4), { p: [3, 10, 0], r: [i * 51.4, 0, 0] }));
  k.add("steel", extrudeZ([[-20, 7], [2, 7], [2, 10.5], [-20, 10.5]], 3, { bevel: 0.5, z: 8.4 }));
  k.add("steelWorn", T(cylZ(2.2, 0, 1.4, { seg: 12 }), { p: [-30, 2, 11.8] }));
  k.add("steelPark", extrudeZ([[-4, 3.8], [96, 3.8], [96, 9.2], [-4, 9.2]], 36, { bevel: 0.8 }));
  const node2 = node("carrier", [k.build()]);
  node2.add(ctx.mount({ id: "charger", type: "charger", p: [74, 6, 0] }));
  return node2;
}
function build(ctx) {
  const k = ctx.kit();
  const nodes = {};
  const rails = upper(ctx, k);
  const lowerNodes = lower(ctx, k, nodes);
  barrel(ctx, k);
  nodes.carrier = carrier(ctx);
  const root = node("scar", [k.build("receiver"), nodes.carrier, ...lowerNodes, ...rails]);
  root.add(ctx.mount({ id: "muzzle", type: "thread", p: [BARREL, 0, 0] }));
  root.add(ctx.mount({ id: "magwell", type: "magwell", p: [-30, -66, 0] }));
  root.add(ctx.mount({ id: "grip", type: "grip", p: [-126, -42, 0] }));
  root.add(ctx.mount({ id: "stock", type: "stock", p: [UP_REAR - 6, 4, 0] }));
  return {
    root,
    nodes,
    anim: { carrierTravel: 128, selector: { safe: 0, semi: 90, auto: 180 } },
    eject: { p: [-36, -5, 18], dir: [0.3, 0.35, 1] },
    muzzle: [BARREL, 0, 0],
    eyeX: -300,
    focus: { center: [30, -20, 0], size: 1e3 }
  };
}
function scarFront(ctx) {
  const k = ctx.kit(), f = ctx.kit();
  k.add("aluFde", ctx.C.clampBody(-12, 12, 6));
  k.add("steel", ctx.C.crossBolt(0));
  const ear = [[-10, 0, 1], [8, 0, 1], [8, 24, 3], [3, 42, 3], [-3, 42, 3], [-10, 20, 2]];
  f.add("aluFde", extrudeZ(ear, 3, { bevel: 0.6, z: 7 }));
  f.add("aluFde", extrudeZ(ear, 3, { bevel: 0.6, z: -7 }));
  f.add("aluFde", extrudeZ([[-10, 0, 1], [8, 0, 1], [8, 12, 2], [-10, 10, 2]], 17, { bevel: 0.8 }));
  f.add("steel", cylY(2, 10, 30.5, { seg: 12, c: 0.3 }));
  f.add("steel", extrudeZ([[-1, 30], [1, 30], [0.8, 35.5, 0.3], [-0.8, 35.5, 0.3]], 1.8, { bevel: 0.2 }));
  f.add("tritium", T(sphere(0.6), { p: [-1, 34.3, 0] }));
  const flip = node("flip", [f.build()]);
  flip.position.set(-10, 6, 0);
  flip.children[0].position.set(10, -6, 0);
  return { root: node("scar_front", [k.build(), flip]), irons: { front: [0, 35.5, 0] }, flip: { node: flip, angle: 90 } };
}
function scarRear(ctx) {
  const k = ctx.kit(), f = ctx.kit();
  k.add("aluFde", ctx.C.clampBody(-16, 16, 6));
  k.add("steel", ctx.C.crossBolt(0));
  const ear = [[-12, 0, 1], [12, 0, 1], [12, 28, 3], [6, 46, 4], [-6, 46, 4], [-12, 28, 3]];
  f.add("aluFde", extrudeZ(ear, 3, { bevel: 0.6, z: 10.5 }));
  f.add("aluFde", extrudeZ(ear, 3, { bevel: 0.6, z: -10.5 }));
  f.add("aluFde", extrudeZ([[-12, 0, 1], [12, 0, 1], [12, 22, 2], [-12, 22, 2]], 24, { bevel: 0.8 }));
  f.add("steel", T(tubeX(8.5, 2.2, -2.5, 2.5, { seg: 32 }), { p: [0, 35.5, 0] }));
  f.add("steel", T(ctx.C.knob(6, 4, 18), { r: [0, -90, 0], p: [0, 16, 12] }));
  for (let i = 0; i < 4; i++) f.add("paintWhite", T(box(0.5, 0.2, 1.8), { p: [-6 + i * 4, 22.1, 9] }));
  const flip = node("flip", [f.build()]);
  flip.position.set(12, 6, 0);
  flip.children[0].position.set(-12, -6, 0);
  return { root: node("scar_rear", [k.build(), flip]), irons: { rear: [0, 35.5, 0], type: "aperture" }, flip: { node: flip, angle: -90 } };
}
function scarFH(ctx) {
  const k = ctx.kit();
  k.add("steel", latheX([[-13.4, 0], [-13.4, 10.4], [-12.4, 11.4], [22, 11.6], [23, 11], [23, 5.6], [0, 5.6], [0, 0]], { seg: 32 }));
  k.add("lensBlack", cylX(5.5, 0.2, 0.4, { c: 0, seg: 16 }));
  for (let i = 0; i < 3; i++) k.add("steel", T(latheX([[21, 7.4], [21, 11.4], [52, 11.4], [53.5, 10.2], [53.5, 7.4]], { seg: 10, arc: 78, a0: -39 }), { r: [i * 120, 0, 0] }));
  k.add("steel", flutesX(11.6, -9, 6, 2, 7, 0.5, { a0: 90 }));
  return { root: k.build("scar_fh"), muzzle: { x: 53.5, kind: "fh", flash: 0.3 } };
}
function cap(ctx) {
  const k = ctx.kit();
  k.add("steel", latheX([[-13.4, 0], [-13.4, 9.2], [-12.4, 10], [14, 10], [16, 8.6], [16, 0]], { seg: 28 }));
  k.add("steel", flutesX(10, -10, 14, 14, 1.2, 0.5));
  return { root: k.build("cap"), muzzle: { x: 16, kind: "bare", flash: 1 } };
}
function scarStock(ctx, o = {}) {
  const k = ctx.kit(), f = ctx.kit();
  k.add("polyFde", extrudeX(rrect(0, -1.5, 38, 37, 5), -18, 0, { bevel: 2 }));
  k.add("steel", T(cylY(4, -20, 17, { seg: 16 }), { p: [-10, 0, 19.5] }));
  k.add("poly", T(box(10, 14, 3, { bevel: 1 }), { p: [-8, -6, -19.5] }));
  const L = o.long ? 310 : 280;
  f.add("polyFde", extrudeX(rrect(0, -1.5, 34, 35, 4), -128, -18, { bevel: 2 }));
  f.add("polyFdeDark", extrudeX(rrect(0, -1.5, 35, 20, 3), -118, -30, { bevel: 1 }));
  for (let i = 0; i < 6; i++) f.add("lensBlack", T(cylZ(2.2, -18.2, 18.2, { seg: 12 }), { p: [-40 - i * 14, -12, 0] }));
  const body = shape(
    [[-110, -30, 6], [-110, 22, 6], [-L + 18, 24, 4], [-L + 18, -112, 8], [-L + 60, -108, 12]],
    [[[-126, -22, 5], [-L + 34, 12, 4], [-L + 34, -84, 8]].map(([x, y, r]) => [x, y, r])]
  );
  f.add("polyFde", extrudeZ(body, 30, { bevel: 4, curve: 8 }));
  f.add("polyFde", extrudeZ([[-120, 22, 3], [-L + 24, 22, 3], [-L + 26, 36, 6], [-140, 38, 10]], 34, { bevel: 4 }));
  f.add("poly", T(cylZ(5, -18, 18, { seg: 16 }), { p: [-150, 26, 0] }));
  f.add("rubber", extrudeZ([[-L + 18, 26, 3], [-L, 25, 5], [-L - 1, -114, 6], [-L + 18, -114, 3]], 40, { bevel: 4 }));
  for (let i = 0; i < 11; i++) f.add("rubber", T(box(2, 3, 36), { p: [-L - 1, 16 - i * 12, 0] }));
  for (const s of [-1, 1]) qdSocket(f, -L + 44, -90, s * 15, s);
  f.add("poly", extrudeZ([[-112, -22, 1], [-86, -21, 2], [-84, -24, 2], [-108, -27, 2]], 14, { bevel: 1 }));
  k.add("steel", T(cylZ(3.2, 0, 1.4, { c: 0.4, seg: 16 }), { p: [-8, 8, -19.2], s: [1, 1, -1] }));
  if (o.prs) {
    f.add("alu", T(ctx.C.knob(10, 8, 24), { r: [0, -90, 0], p: [-L + 60, 30, 16] }));
    f.add("alu", T(ctx.C.knob(10, 8, 24), { r: [0, 0, 90], p: [-L + 8, -40, 0] }).translate(0, 0, 0));
    f.add("alu", T(cylY(7, -150, -108, { seg: 18 }), { p: [-L + 40, 0, 0] }));
    f.add("rubber", T(cylY(10, -158, -150, { seg: 20 }), { p: [-L + 40, 0, 0] }));
  }
  const fold = node("fold", [f.build()]);
  const hinge = node("hinge", [fold]);
  hinge.position.set(-10, 0, 19);
  fold.position.set(10, 0, -19);
  return { root: node("scar_stock", [k.build(), hinge]), fold: { node: hinge, axis: "y", angle: 172 }, cheek: { x: -160, y: 36 } };
}
function scarGrip(ctx) {
  const k = ctx.kit();
  const a = 20 * Math.PI / 180, sh = (y) => Math.tan(a) * y;
  const front = [[2, 0], [0, -16], [5, -24], [0, -34], [-2, -60], [-1, -100]].map(([x, y]) => [x + sh(y), y]);
  const back = [[-34, 6], [-44, 0], [-40, -30], [-38, -70], [-38, -102]].map(([x, y]) => [x + sh(y), y]);
  k.add("polyFde", gripLoft(front, back, { w: 30, width: (t) => 0.86 + 0.14 * Math.sin(Math.PI * Math.min(1, t * 1.6)) }));
  for (let i = 0; i < 8; i++) for (const s of [-1, 1]) k.add("polyFdeDark", T(box(16, 1.1, 1.2, { bevel: 0.3 }), { p: [sh(-24 - i * 8.5) - 22, -24 - i * 8.5, s * 13.3], r: [0, 0, 20] }));
  return { root: k.build("scar_grip") };
}
function sr25(ctx, o) {
  const k = ctx.kit(), rk = ctx.kit();
  const len = o.len, D = 80, W3 = 26, curve = o.curve ?? 8;
  const off = (y) => y > -30 ? 0 : curve * Math.pow((-30 - y) / (len - 30), 1.5);
  const pts = [];
  const n = 12, top = 52;
  for (let i = 0; i <= n; i++) {
    const y = top - i / n * (top + len);
    pts.push([-D / 2 + off(y), y, 0]);
  }
  for (let i = n; i >= 0; i--) {
    const y = top - i / n * (top + len);
    pts.push([D / 2 + off(y), y, 0]);
  }
  k.add(o.mat, extrudeZ(pts, W3, { bevel: o.bevel ?? 1.2 }));
  if (o.ribs) {
    for (const s of [-1, 1]) {
      k.add(o.mat, T(extrudeZ(rrect(0, 0, D - 20, len - 34, 7), 1.4, { bevel: 0.6 }), { p: [off(-len / 2), -len / 2 - 2, s * (W3 / 2 + 0.2)] }));
      for (let i = 0; i < 3; i++) {
        const y = -len + 26 + i * 7;
        k.add(o.mat, T(box(D - 36, 1.8, 1.2, { bevel: 0.5 }), { p: [off(y), y, s * (W3 / 2 + 0.9)] }));
      }
      for (let i = 0; i < 4; i++) {
        const y = 26 - i * 22;
        k.add("lensBlack", T(cylZ(1.6, 0, 0.3, { c: 0, seg: 12 }), { p: [D / 2 - 10 + off(y), y, s * (W3 / 2 + 0.05)], s: [1, 1, s] }));
      }
    }
  }
  if (o.texture) for (let i = 0; i < 6; i++) for (const s of [-1, 1]) k.add(o.mat, T(box(D - 14, 1.6, 1), { p: [off(-30 - i * 6), -30 - i * 6, s * (W3 / 2 + 0.2)] }));
  k.add(o.plate || o.mat, T(box(D + 8, 7, W3 + 4, { bevel: 2 }), { p: [off(-len) + 3, -len - 2, 0] }));
  k.add("polyGrey", box(D - 10, 3, W3 - 5), { p: [-2, top - 4, 0] });
  ctx.C.feedLips(k, o.mat, -37, -4, top, W3 / 2, { rise: 5.5, curl: 3.2 });
  ctx.C.cartridge(rk, "762x51", { p: [-36, top - 0.5, -3.2] });
  ctx.C.cartridge(rk, "762x51", { p: [-36, top - 8, 3.2] });
  const rounds = rk.build("rounds");
  return { root: node("mag", [k.build(), rounds]), mag: { cap: o.cap, rounds } };
}
function drum50(ctx) {
  const base = sr25(ctx, { len: 60, mat: "poly", cap: 50, curve: 0 });
  const k = ctx.kit();
  k.add("poly", T(cylZ(62, -28, 28, { c: 5, seg: 48 }), { p: [6, -110, 0] }));
  k.add("steel", T(ctx.C.knob(12, 7, 18), { r: [0, -90, 0], p: [6, -110, 28] }));
  k.add("glassDark", T(cylZ(14, -29.2, -28, { seg: 24 }), { p: [6, -110, 0] }));
  return { root: node("drum", [base.root, k.build()]), mag: { cap: 50, rounds: base.mag.rounds } };
}
function charger(ctx, side, big) {
  const k = ctx.kit();
  const s = side;
  k.add("steel", extrudeZ([[-10, -3], [10, -3], [10, 3], [-10, 3]], 4, { bevel: 0.8, z: s * 20 }));
  const arm = big ? [[-6, -4, 2], [8, -4, 2], [18, -2, 3], [22, 4, 4], [10, 6, 3], [-6, 4, 2]] : [[-6, -3.5, 2], [6, -3.5, 2], [12, -1, 2], [12, 4, 3], [-6, 3.5, 2]];
  const g = extrudeY(shape(arm.map(([x, y, r]) => [x, y, r])), -3, 3, { bevel: 0.8 });
  k.add("poly", T(extrudeZ([[-5, -3.5, 2], [5, -3.5, 2], [7, 3.5, 2], [-5, 3.5, 2]], big ? 34 : 24, { bevel: 1.2 }), { p: [0, 0, s * (22 + (big ? 17 : 12))] }));
  k.add("poly", T(latheX([[0, 0], [0, 6], [2, 7.5], [9, 7.5], [11, 5], [11, 0]], { seg: 18 }), { r: [0, s > 0 ? -90 : 90, 0], p: [0, 0, s * (big ? 52 : 44)] }));
  return { root: k.build("charger") };
}
var PARTS = [
  { id: "scar_fh", cat: "muzzle", name: "Пламегаситель SCAR-H", desc: "Штатный трёхщелевой, под быстросъёмный глушитель", fit: { thread: ["5/8x24"] }, stats: { weight: 80, length: 40, flash: -45 }, build: scarFH },
  { id: "scar_cap", cat: "muzzle", name: "Колпачок резьбы", desc: "Голый ствол: громко, яркая вспышка", fit: { thread: ["5/8x24"] }, stats: { weight: 15, loud: 2, flash: 25, "recoilV%": 6 }, build: cap },
  { id: "scar_rear", cat: "rearsight", name: "Целик SCAR (складной)", desc: "Диоптр с барабаном 200–600 м", foot: [-16, 16], body: [-16, 16], stats: { weight: 70 }, build: scarRear },
  { id: "scar_front", cat: "frontsight", name: "Мушка SCAR (складная)", desc: "Мушка с тритиевой вставкой", foot: [-12, 12], body: [-12, 12], stats: { weight: 50 }, build: scarFront },
  { id: "scar_stock", cat: "stock", name: "SCAR, складной телескоп", desc: "Складывается вправо (K), щека регулируется", fit: { iface: ["scar"] }, stats: { weight: 520 }, build: (c) => scarStock(c) },
  { id: "scar_prs", cat: "stock", name: "FN SSR (Mk 20)", desc: "Снайперский: регулировка щеки и затыльника, моноопора", fit: { iface: ["scar"] }, stats: { weight: 760, ergo: -3, "recoilV%": -8, moa: -0.2, adsTime: 15 }, build: (c) => scarStock(c, { prs: true, long: true }) },
  { id: "scar_grip", cat: "pgrip", name: "FN SCAR A2", desc: "Штатная рукоять, текстура по бокам", fit: { iface: ["ar"] }, stats: { weight: 75 }, build: scarGrip },
  { id: "fn20", cat: "mag", name: "FN SCAR-H 20, сталь", desc: "Штатный стальной магазин, 20 патронов", fit: { iface: ["sr25"] }, stats: { weight: 290, mag: 20 }, build: (c) => sr25(c, { len: 118, mat: "steelPark", cap: 20, ribs: true }) },
  { id: "fn20fde", cat: "mag", name: "FN SCAR-H 20, FDE", desc: "Стальной магазин в цвет оружия", fit: { iface: ["sr25"] }, stats: { weight: 290, mag: 20 }, build: (c) => sr25(c, { len: 118, mat: "aluFde", cap: 20, ribs: true }) },
  { id: "pmag20", cat: "mag", name: "Magpul PMAG 20 LR/SR", desc: "Полимер, 20 патронов", fit: { iface: ["sr25"] }, stats: { weight: 200, mag: 20, ergo: 1 }, build: (c) => sr25(c, { len: 118, mat: "poly", cap: 20, texture: true, bevel: 1.8 }) },
  { id: "pmag25", cat: "mag", name: "Magpul PMAG 25 LR/SR", desc: "Удлинённый, 25 патронов", fit: { iface: ["sr25"] }, stats: { weight: 250, mag: 25, ergo: -2, adsTime: 8 }, build: (c) => sr25(c, { len: 150, curve: 14, mat: "poly", cap: 25, texture: true, bevel: 1.8 }) },
  { id: "drum50", cat: "mag", name: "Барабан X-Products 50", desc: "Барабанный, 50 патронов", fit: { iface: ["sr25"] }, stats: { weight: 1900, mag: 50, ergo: -14, adsTime: 40 }, build: drum50 },
  { id: "ch_left", cat: "charger", name: "Рукоять заряжания слева", desc: "Штатная, ходит вместе с рамой", stats: { weight: 25 }, build: (c) => charger(c, -1, false) },
  { id: "ch_right", cat: "charger", name: "Рукоять заряжания справа", desc: "Переставлена на правый борт", stats: { weight: 25 }, build: (c) => charger(c, 1, false) },
  { id: "ch_big", cat: "charger", name: "Увеличенная рукоять (слева)", desc: "Удобна в перчатках", stats: { weight: 35, ergo: 2 }, build: (c) => charger(c, -1, true) }
];
var scar_default = {
  id: "scar",
  title: "FN SCAR-H Mk 17",
  short: "SCAR-H",
  caliber: "7,62×51 NATO",
  cal: "762x51",
  thread: "5/8x24",
  specs: [["Ствол", '406 мм (16")'], ["Длина", "997 / 750 мм"], ["Темп", "600 выстр/мин"], ["Масса", "3,58 кг"]],
  base: { weight: 2380, length: 960, ergo: 46, recoilV: 120, recoilH: 105, moa: 1.1, velocity: 790, range: 600, loud: 164, flash: 80, adsTime: 320, rpm: 600, mag: 20 },
  audio: { cal: "762x51", mech: 0.85 },
  modes: ["safe", "semi", "auto"],
  build,
  slots: [
    { id: "muzzle", label: "Дульное устройство", group: "Ствол", accepts: ["muzzle"], mount: "muzzle" },
    { id: "rearsight", label: "Целик", group: "Оптика", accepts: ["rearsight"], rails: ["topRail"], prefer: "rear" },
    { id: "frontsight", label: "Мушка", group: "Оптика", accepts: ["frontsight"], rails: ["topRail"], prefer: "front" },
    { id: "optic", label: "Прицел", group: "Оптика", accepts: ["optic"], rails: ["topRail"], prefer: { x: -70 } },
    { id: "magnifier", label: "Увеличитель", group: "Оптика", accepts: ["magnifier"], rails: ["topRail"], prefer: { x: -130 }, behind: "optic" },
    { id: "offset", label: "Боковой коллиматор", group: "Оптика", accepts: ["offset"], rails: ["topRail"], prefer: { x: 0 } },
    { id: "under", label: "Под стволом", group: "Тактика", accepts: ["foregrip", "bipod"], rails: ["bottomRail"], prefer: "front" },
    { id: "tacRight", label: "Правая планка", group: "Тактика", accepts: ["light", "laser", "combo"], rails: ["rightRail"], prefer: "front" },
    { id: "tacLeft", label: "Левая планка", group: "Тактика", accepts: ["light", "laser", "combo"], rails: ["leftRail"], prefer: "front" },
    { id: "tacTop", label: "Верх цевья", group: "Тактика", accepts: ["laser"], rails: ["topRail"], prefer: { x: 200 } },
    { id: "mag", label: "Магазин", group: "Ствольная коробка", accepts: ["mag"], mount: "magwell", iface: "sr25" },
    { id: "pgrip", label: "Пистолетная рукоять", group: "Ствольная коробка", accepts: ["pgrip"], mount: "grip", iface: "ar", required: true },
    { id: "stock", label: "Приклад", group: "Ствольная коробка", accepts: ["stock"], mount: "stock", iface: "scar" },
    { id: "charger", label: "Рукоять заряжания", group: "Ствольная коробка", accepts: ["charger"], mount: "charger", required: true }
  ],
  parts: PARTS,
  defaults: {
    muzzle: "scar_fh",
    rearsight: "scar_rear",
    frontsight: "scar_front",
    optic: null,
    magnifier: null,
    under: null,
    tacRight: null,
    tacLeft: null,
    tacTop: null,
    mag: "fn20",
    pgrip: "scar_grip",
    stock: "scar_stock",
    charger: "ch_left"
  }
};


export { scar_default as def };
