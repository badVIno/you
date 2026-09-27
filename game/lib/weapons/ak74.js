// СГЕНЕРИРОВАНО game/tools/build_weapons.mjs из game/weapons/ak74_modular.html — не редактировать вручную.
import { T, box, brake, circle, cylX, cylY, cylZ, extrudeX, extrudeY, extrudeZ, flutesX, grip, gripLoft, latheX, loftX, magnifier, mlokHoles, mount, node, picatinny, ringGrooves, rrect, shape, slot, spring, superEllipse, tubeX, wire } from './engine.js';
// src/weapons/ak_common.js
var AK = {
  FRONT: 24,
  REAR: -223,
  // торцы ствольной коробки
  WALL: 11,
  BOTTOM: -24,
  // верх боковин и дно коробки
  GAS_Y: 23,
  GAS_R: 9,
  // ось газовой трубки
  SIGHT_Y: 44,
  // линия прицеливания (прорезь целика / вершина мушки)
  REAR_X: 30,
  FRONT_X: 386,
  // прорезь целика / мушка
  MUZZLE: 415
};
function receiver(ctx, k, o) {
  const M = o.steel;
  const { FRONT: F, REAR: R4, WALL: W, BOTTOM: B } = AK;
  const YB = B + 2, BR = 3.4;
  const MW0 = -73, MW1 = -1;
  const dimple = slot(-54, -20, -11, 11, 8);
  const holes = o.dimples ? [dimple] : [];
  const low = [[R4 + 9, YB, 3], [MW0, YB, 1], [MW0, B - 1.4, 1], [MW1, B - 1.4, 1], [MW1, YB, 1]];
  const right = [[F, YB, 1], [F, W], [-12, W], [-12, -1, 1], [-88, -1, 1], [-88, 7], [-206, 7], [-206, W], [R4, W], [R4, -15, 2], ...low];
  const left = [[F, YB, 1], [F, W], [R4, W], [R4, -15, 2], ...low];
  k.add(M, extrudeZ(shape(right, holes), 1.4, { bevel: 0.35, z: 14.3 }));
  k.add(M, extrudeZ(shape(left, holes), 1.4, { bevel: 0.35, z: -14.3 }));
  if (o.dimples) for (const s of [-1, 1]) k.add(M, extrudeZ(shape(dimple), 1.2, { bevel: 0.45, z: s * 13.9 }));
  const cz = 15 - BR;
  for (const [x0, x1] of [[R4 + 6, MW0], [MW1, F]]) {
    const slot2 = x0 < -100 ? [rrect(-114, 0, 18, 7, 2)] : [];
    k.add(M, extrudeY(shape(rrect((x0 + x1) / 2, 0, x1 - x0, cz * 2, 0.6), slot2), B - 1.4, B, { bevel: 0.3 }));
    for (const s of [-1, 1]) {
      const bend = [];
      for (let i = 0; i <= 8; i++) {
        const a = -(i / 8) * Math.PI / 2;
        bend.push([s * (cz + Math.cos(a) * BR), YB + Math.sin(a) * BR]);
      }
      for (let i = 8; i >= 0; i--) {
        const a = -(i / 8) * Math.PI / 2;
        bend.push([s * (cz + Math.cos(a) * (BR - 1.4)), YB + Math.sin(a) * (BR - 1.4)]);
      }
      k.add(M, extrudeX(bend, Math.max(x0, R4 + 9), x1, { bevel: 0.3 }));
    }
  }
  k.add("steel", extrudeX(rrect(0, (B + W) / 2 - 2, 26.6, W - B - 4, 1), 8, F, { bevel: 0.6 }));
  k.add("steel", extrudeX(rrect(0, (B + W) / 2 - 2, 26.6, W - B - 6, 1), R4, R4 + 14, { bevel: 0.6 }));
  k.add("lensBlack", extrudeX(rrect(0, -8, 26, 8, 0), -205, 6, { bevel: 0 }));
  for (const s of [-1, 1]) k.add(M, extrudeX(rrect(s * 13.6, W - 0.6, 3, 1.4, 0.4), R4, F, { bevel: 0.2 }));
  const head = () => latheX([[0, 0], [0, 2.4], [0.35, 2.3], [0.7, 2], [1, 1.4], [1.15, 0.7], [1.2, 0]], { seg: 16, crease: 70 });
  const rivets = [[4, -5], [16, -4], [3, -17], [15, -16], [-81, -13], [-90, -13], [-77, -19.5], [-150, -18], [-214, -3], [-214, -14], [-201, -9]];
  for (const s of [-1, 1]) for (const [x, y] of rivets) k.add(M, T(head(), { r: [0, s > 0 ? -90 : 90, 0], p: [x, y, s * 15] }));
  k.add("steelWorn", T(cylZ(2.5, -15.35, -14.6, { c: 0.25, seg: 16 }), { p: [9.5, -10.5, 0] }));
  for (const s of [-1, 1]) for (const [x, y] of [[-92, -17], [-112, -18]]) {
    k.add("steelWorn", T(latheX([[0, 0], [0, 2.7], [0.3, 2.8], [0.9, 2.8], [1.2, 2.4], [1.2, 0]], { seg: 16 }), { r: [0, s > 0 ? -90 : 90, 0], p: [x, y, s * 15] }));
  }
  k.add("steelWorn", T(latheX([[0, 0], [0, 4.2], [0.4, 4.4], [1.1, 4.4], [1.5, 3.6], [1.5, 1.4], [2.2, 1.2], [2.2, 0]], { seg: 20 }), { r: [0, 90, 0], p: [-178, 2, -15] }));
  k.add("spring", wire([[-92, -17, -16.3], [-101, -20, -16.5], [-112, -18, -16.3], [-132, -17, -16.2], [-158, -11, -16.2], [-174, -2, -16.2], [-178, 3.6, -16.4]], 0.8, { n: 70, seg: 6 }));
  for (const a of [0, -6.5, -13]) {
    const r = a * Math.PI / 180, lx = 123, ly = 0;
    const x = -178 + lx * Math.cos(r) - ly * Math.sin(r), y = 2 + lx * Math.sin(r) + ly * Math.cos(r);
    k.add(M, T(tubeX(1.7, 0.9, 0, 0.35, { seg: 14, c: 0.12 }), { r: [0, -90, 0], p: [x, y, 15] }));
  }
  k.add(M, T(extrudeX(shape([[-5, 0], [5, 0], [7, 3.2], [-7, 3.2]]), -150, -38, { bevel: 0.4 }), { r: [-90, 0, 0], p: [0, -2, -15.5] }));
  k.add(M, T(extrudeX(shape([[-7.4, 0], [7.4, 0], [7.4, 0.8], [-7.4, 0.8]]), -152, -36, { bevel: 0.3 }), { r: [-90, 0, 0], p: [0, -2, -15] }));
  for (const x of [-140, -94, -48]) k.add(M, T(latheX([[0, 0], [0, 2.3], [0.4, 2.1], [0.8, 1.2], [0.9, 0]], { seg: 14 }), { r: [0, 90, 0], p: [x, -2, -18.7] }));
}
function coverStd(ctx, o = {}) {
  const k = ctx.kit();
  const M = o.steel || "steel";
  const arc = (w, y0, y1, r, n = 14) => {
    const pts = [[w, y0]];
    const cy = y1 - r;
    pts.push([w, cy]);
    for (let i = 1; i < n; i++) {
      const a = i / n * Math.PI;
      pts.push([Math.cos(a) * w, cy + Math.sin(a) * r]);
    }
    pts.push([-w, cy], [-w, y0]);
    return pts;
  };
  const outer = arc(16.4, 11.4, 27.5, 12);
  const inner = arc(15.2, 11.4, 26.3, 11).reverse();
  const sec = [...outer, ...inner.map((p) => [p[0], p[1]])];
  k.add(M, extrudeX(sec, AK.REAR + 1, AK.FRONT + 4, { bevel: 0.3 }));
  const ribs = o.ribs || [-196, -170, -144, -118, -92, -66, -40];
  const bump = [[-4, 0], [-2.6, 0.3], [-1, 0.6], [1, 0.6], [2.6, 0.3], [4, 0]];
  for (const x of ribs) k.add(M, loftX(bump.map(([dx, d]) => ({ x: x + dx, pts: arc(16.4 + d, 13.2, 27.5 + d, 12 + d, 18) })), { crease: 70, flip: true }));
  for (const s of [-1, 1]) k.add(M, extrudeX(rrect(s * 15.2, 12, 2.4, 1.2, 0.4), AK.REAR + 2, AK.FRONT + 3, { bevel: 0.3 }));
  k.add(M, extrudeX(arc(16.4, 11.4, 27.5, 12), AK.REAR - 1, AK.REAR + 2, { bevel: 0.5 }));
  k.add("steelWorn", T(cylX(4.6, AK.REAR - 6, AK.REAR - 0.5, { c: 0.8, seg: 18 }), { p: [0, 17, 0] }));
  k.add("steelWorn", T(box(3, 3, 12), { p: [AK.REAR - 4, 13.5, 0] }));
  k.add("lensBlack", extrudeY(rrect(AK.REAR + 12, 0, 11, 7, 1.5), 26.9, 27.62, { bevel: 0.1 }));
  k.add("steelWorn", extrudeY(rrect(AK.REAR + 12.5, 0, 8.4, 5, 1), 24, 28.3, { bevel: 0.5 }));
  return { root: k.build("cover") };
}
function carrier(ctx, o) {
  const k = ctx.kit();
  k.add("steelBright", extrudeX(rrect(0, 12, 22, 15, 3), -150, 6, { bevel: 1 }));
  k.add("steelBright", extrudeX(rrect(0, 3, 20, 8, 2), -150, -30, { bevel: 0.8 }));
  k.add("steelWorn", cylX(8.8, -36, 0, { c: 0.8, seg: 24 }));
  k.add("steelWorn", T(box(10, 4, 5), { p: [-4, 7.5, 0] }));
  k.add("steelWorn", T(box(10, 4, 5), { p: [-4, -7.5, 0] }));
  k.add("steel", extrudeZ([[-24, 2], [-2, 2], [-2, 6], [-24, 6]], 2.2, { bevel: 0.4, z: 8.4 }));
  const hx = -88;
  k.add("steelBright", extrudeY(shape([[hx - 14, 10], [hx + 16, 10], [hx + 6, 20, 3], [hx - 10, 22, 3]]), 4, 10.5, { bevel: 0.8 }));
  k.add("steelBright", T(cylZ(3.6, 18, 26, { seg: 16 }), { p: [hx - 2, 7.5, 0] }));
  k.add("steelBright", T(latheX([[0, 0], [0, 5.2], [2, 6.4], [7, 6.4], [9.5, 4.4], [10.5, 0]], { seg: 20 }), { r: [0, -90, 0], p: [hx - 2, 7.5, 24] }));
  return node("carrier", [k.build()]);
}
function barrelAndGas(ctx, k, o) {
  const M = o.steel;
  const { MUZZLE, FRONT_X: FX2, SIGHT_Y: SY } = AK;
  k.add(M, latheX([[AK.FRONT - 6, 0], [AK.FRONT - 6, 12.5], [96, 12.5], [97, 12], [98, 11], [220, 10.2], [286, 9.6], [287, 9.4], [296, 9.4], [300, 9], [330, 8.8], [331.5, 8.5], [362, 8.4], [404, 8.2], [405, 7.2], [405.5, 6.6], [405.5, 0]], { seg: 32 }));
  k.add(M, latheX([[405.5, 3], [405.5, 7], [MUZZLE - 0.8, 7], [MUZZLE, 6.2], [MUZZLE, 3.6], [MUZZLE - 0.6, 3], [405.5, 3]], { seg: 28 }));
  k.add(M, extrudeZ([[AK.FRONT - 2, 6], [94, 6], [94, 27, 2], [89, 31, 2], [36, 32.4, 2], [AK.FRONT - 2, 31, 2]], 26, { bevel: 1.4 }));
  k.add(M, extrudeX(shape(circle(0, 0, 15, 24).map((p) => [p[0], p[1], 0])), AK.FRONT - 2, 94, { bevel: 1 }));
  const cam = [[34, 30], [92, 30]];
  for (let i = 6; i >= 0; i--) {
    const y = 35.4 - i * 0.38;
    cam.push([44 + 8 * i, y], [36 + 8 * i, y]);
  }
  for (const s of [-1, 1]) k.add(M, extrudeZ(cam, 4.2, { bevel: 0.4, z: s * 10.9 }));
  k.add("steelWorn", T(cylZ(1.8, -13.3, 13.3, { c: 0.3, seg: 12 }), { p: [89, 33.2, 0] }));
  for (const x of [44, 80]) k.add("steelWorn", T(cylZ(1.7, -14.1, 14.1, { c: 0.3, seg: 12 }), { p: [x, -6.5, 0] }));
  const leaf = ctx.kit();
  leaf.add(M, extrudeZ([[AK.REAR_X, 36.4], [88, 33.6], [88, 36.2], [36, 39.4, 2], [AK.REAR_X, 39.8]], 17, { bevel: 0.5 }));
  const notch = [[-8.5, 35.2, 1], [8.5, 35.2, 1], [8.5, SY, 0.8], [1.5, SY, 0.2], [1.2, SY - 2.4, 0.5], [-1.2, SY - 2.4, 0.5], [-1.5, SY, 0.2], [-8.5, SY, 0.8]];
  leaf.add(M, extrudeX(notch, AK.REAR_X, AK.REAR_X + 3.4, { bevel: 0.3 }));
  leaf.add("steelWorn", extrudeZ([[58, 35.6], [70, 34.9], [70, 41.5, 1], [58, 42.2, 1]], 20, { bevel: 0.8 }));
  for (let i = 0; i < 4; i++) leaf.add("steelWorn", T(box(0.8, 5, 20.6, { bevel: 0.25 }), { p: [59.6 + i * 3, 38.8 - i * 0.18, 0] }));
  for (const s of [-1, 1]) {
    leaf.add("steelWorn", T(latheX([[0, 0], [0, 2.4], [0.8, 2.4], [1.6, 1.8], [1.8, 0]], { seg: 14 }), { r: [0, s > 0 ? -90 : 90, 0], p: [64, 38.4, s * 10] }));
  }
  for (let i = 0; i < 6; i++) leaf.add("paintWhite", T(box(0.6, 0.2, 3), { p: [40 + i * 7.5, 39.1 - i * 0.4, 5] }));
  const leafNode = leaf.build("rearLeaf");
  k.add(M, extrudeZ([[82, 16, 1], [90, 16, 1], [100, 30, 2], [95, 33, 2]], 3, { bevel: 0.6, z: 14.4 }));
  k.add(M, T(latheX([[0, 0], [0, 3.4], [2.4, 3.4], [3.4, 2.6], [3.6, 0]], { seg: 16 }), { r: [0, -90, 0], p: [86, 18, 13] }));
  k.add(M, T(cylX(AK.GAS_R, 92, 300, { c: 0.8, seg: 24 }), { p: [0, AK.GAS_Y, 0] }));
  k.add(M, T(cylX(AK.GAS_R + 0.8, 92, 100, { c: 0.6, seg: 24 }), { p: [0, AK.GAS_Y, 0] }));
  for (const x of [262, 271, 280]) for (const s of [-1, 1]) {
    k.add("lensBlack", T(cylZ(1.6, 0, 0.6, { seg: 12, c: 0.1 }), { p: [x, AK.GAS_Y, s > 0 ? AK.GAS_R - 0.35 : -AK.GAS_R - 0.25] }));
  }
  const gb = o.gas45 ? [[292, -9, 2], [322, -9, 2], [326, 2, 2], [313, 32, 4], [292, 32, 3]] : [[292, -9, 2], [328, -9, 2], [328, 10, 2], [324, 33, 4], [296, 33, 3], [292, 26]];
  k.add(M, extrudeZ(gb, 22, { bevel: 1.6 }));
  k.add(M, T(cylX(11.5, 290, 300, { c: 1, seg: 24 }), { p: [0, AK.GAS_Y, 0] }));
  k.add("steelWorn", T(cylZ(1.9, -11.2, 11.2, { c: 0.3, seg: 12 }), { p: [310, -3, 0] }));
  k.add(M, extrudeX(shape(rrect(0, -14, 10, 12, 2.4), [circle(0, -15, 3.3, 16)]), 298, 316, { bevel: 0.9 }));
  k.add(M, T(extrudeZ(rrect(310, 4, 16, 8, 2), 2, { bevel: 0.5 }), { p: [0, 0, -11.6] }));
  k.add(M, wire([[302, 4, -12], [302, 4, -18], [318, 4, -20], [318, 4, -12]], 1.8, { n: 30 }));
  k.add(M, extrudeZ([[364, -11, 2], [404, -11, 2], [404, 10, 2], [398, 18, 3], [370, 18, 3], [364, 10, 2]], 20, { bevel: 1.4 }));
  for (const s of [-1, 1]) k.add(M, extrudeZ([[372, 12], [396, 12], [394, 40, 3], [386, SY + 8, 4], [379, SY + 8, 3], [374, 38, 2]], 2.8, { bevel: 0.6, z: s * 7.4 }));
  k.add(M, extrudeZ(rrect(FX2, 19.4, 16, 3.4, 1), 11.4, { bevel: 0.6 }));
  k.add("steelWorn", T(cylY(4.3, 20.8, 26.6, { c: 0.5, seg: 20 }), { p: [FX2, 0, 0] }));
  for (let i = 0; i < 4; i++) k.add("steel", T(box(1.2, 2.2, 1.2, { bevel: 0.2 }), { p: [FX2 + 4 * Math.cos(i * Math.PI / 2 + 0.4), 25.6, 4 * Math.sin(i * Math.PI / 2 + 0.4)] }));
  k.add("steelWorn", cylY(1.9, 26, SY - 1.2, { seg: 12 }), { p: [FX2, 0, 0] });
  k.add("steelWorn", extrudeZ([[FX2 - 1.2, SY - 2], [FX2 + 1.2, SY - 2], [FX2 + 0.9, SY, 0.3], [FX2 - 0.9, SY, 0.3]], 2.2, { bevel: 0.2 }));
  for (const x of [369, 399]) k.add("steelWorn", T(cylZ(1.8, -10.2, 10.2, { c: 0.3, seg: 12 }), { p: [x, 2, 0] }));
  k.add("steelWorn", T(cylX(1.5, 403, 406.2, { c: 0.4, seg: 10 }), { p: [0, -6.5, 5.5] }));
  if (o.bayonet) {
    k.add(M, extrudeZ([[366, -10], [400, -10], [400, -16, 1.5], [396, -21, 2], [374, -21, 2], [368, -16, 3]], 11, { bevel: 1 }));
    for (const s of [-1, 1]) k.add("lensBlack", T(box(3, 5, 0.6, { bevel: 0.2 }), { p: [390, -16.5, s * 5.35] }));
  }
  k.add("steelWorn", T(cylX(3, 214, 402, { c: 0.6, seg: 12 }), { p: [0, -15, 0] }));
  k.add("steelWorn", T(latheX([[401, 0], [401, 3.6], [402, 4.2], [408.6, 4.2], [410, 2.8], [410, 0]], { seg: 16 }), { p: [0, -15, 0] }));
  k.add("lensBlack", T(cylZ(1.3, -4.3, 4.3, { seg: 10 }), { p: [405.6, -15, 0] }));
  return leafNode;
}
function triggerGroup(ctx, k, nodes, o) {
  const M = o.steel;
  const tgHole = [[-86, -26.5], [-146, -26.5], [-137, -40, 5], [-96, -42, 5], [-86, -33, 3]];
  const tg = shape([[-78, -24], [-152, -24], [-152, -30, 3], [-140, -44, 6], [-94, -46, 6], [-80, -36, 3]], [tgHole]);
  k.add(M, extrudeZ(tg, 10, { bevel: 0.8 }));
  const rib = shape([[-79.4, -25], [-150.8, -25], [-150.8, -30.4, 3], [-139.6, -44.9, 6], [-94.1, -46.9, 6], [-79.2, -36.4, 3]], [tgHole]);
  k.add(M, extrudeZ(rib, 3.6, { bevel: 0.9 }));
  k.add(M, extrudeZ([[-74.8, -25], [-81.5, -25], [-82.5, -31, 1], [-86.5, -40, 2], [-85.4, -44.6, 2.5], [-80.4, -43.8, 2], [-78.6, -38, 2], [-75.6, -31, 2]], 11, { bevel: 1 }));
  for (let i = 0; i < 4; i++) k.add(M, T(box(1.2, 0.8, 9, { bevel: 0.3 }), { p: [-86.5 + i * 0.12, -37.8 - i * 1.6, 0] }));
  k.add("steelWorn", T(cylZ(1.8, -6.4, 6.4, { c: 0.3, seg: 12 }), { p: [-78, -28.4, 0] }));
  const t = ctx.kit();
  t.add(M, extrudeZ([[-2, 3], [3, 3], [3, -6, 2], [0.4, -15, 4], [-3.4, -21.2, 2], [-5.4, -23, 1.2], [-7.2, -21.4, 1], [-5.6, -17, 3], [-3, -8, 3]], 6, { bevel: 1.1 }));
  nodes.trigger = node("trigger", [t.build()], { p: [-112, -18, 0] });
  const s = ctx.kit();
  const lever = [[-6, -3.6, 4], [40, -2.2, 10], [104, 0.4, 3], [116, 1.6, 2], [119.4, 5, 1.4], [119.4, 11.2, 1.4], [108, 12.6, 2], [60, 10.6, 20], [8, 7.2, 5], [-6, 5.6, 5]];
  s.add(M, extrudeZ(lever, 1.6, { bevel: 0.5, z: 16.1 }));
  s.add(M, extrudeZ([[10, 0.6, 1], [96, 3.2, 1], [96, 5.4, 1], [10, 3.8, 1]], 0.8, { bevel: 0.35, z: 17.1 }));
  s.add(M, extrudeY(shape([[104, 16.4, 0.5], [119.4, 16.4, 0.5], [119.4, 21.4, 2.4], [104, 21.4, 2.4]]), -0.4, 1.2, { bevel: 0.45 }));
  s.add(M, T(cylX(1.3, 104.3, 119.1, { c: 0.4, seg: 10 }), { p: [0, 0.6, 16.9] }));
  for (let i = 0; i < 4; i++) s.add(M, T(box(1, 0.7, 4, { bevel: 0.2 }), { p: [106.8 + i * 3.6, 1.3, 19.2] }));
  s.add(M, T(latheX([[15.1, 0], [15.1, 6.2], [15.6, 6.6], [17.4, 6.6], [18, 5.8], [18, 2.6], [18.6, 2.2], [18.6, 0]], { seg: 24 }), { r: [0, -90, 0] }));
  nodes.selector = node("selector", [s.build()], { p: [-178, 2, 0] });
  return [nodes.trigger, nodes.selector];
}
function akBase(ctx, o) {
  const k = ctx.kit();
  const nodes = {};
  receiver(ctx, k, o);
  const leaf = barrelAndGas(ctx, k, o);
  const trg = triggerGroup(ctx, k, nodes, o);
  const body = k.build("receiver");
  nodes.carrier = carrier(ctx, o);
  const root = node(o.id, [body, leaf, nodes.carrier, ...trg]);
  const { mount: mount2 } = ctx;
  root.add(mount2({ id: "hg", type: "hg", p: [0, 0, 0] }));
  root.add(mount2({ id: "cover", type: "cover", p: [0, 0, 0] }));
  root.add(mount2({ id: "dovetail", type: "dovetail", p: [-95, -2, -19], slots: 1, axis: "side" }));
  root.add(mount2({ id: "muzzle", type: "thread", p: [AK.MUZZLE, 0, 0] }));
  root.add(mount2({ id: "magwell", type: "magwell", p: [-4, AK.BOTTOM, 0], rock: [0, 0, 18] }));
  root.add(mount2({ id: "grip", type: "grip", p: [-150, AK.BOTTOM, 0] }));
  root.add(mount2({ id: "stock", type: "stock", p: [AK.REAR, 0, 0] }));
  return {
    root,
    nodes,
    anim: { carrierTravel: 118, selector: { safe: 0, auto: -6.5, semi: -13 } },
    eject: { p: [-48, 6, 16], dir: [0.35, 0.45, 1] },
    muzzle: [AK.MUZZLE, 0, 0],
    irons: { rear: [AK.REAR_X + 2, AK.SIGHT_Y, 0], front: [AK.FRONT_X, AK.SIGHT_Y, 0] },
    eyeX: -262,
    focus: { center: [20, -30, 0], size: 900 }
  };
}
function uSec(hw, yb, yt, t = 3.2, n = 10) {
  const out = [], inn = [];
  const r = Math.min(hw, (yt - yb) * 0.6);
  out.push([-hw, yt]);
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + i / n * Math.PI;
    out.push([Math.cos(a) * hw, yb + r + Math.sin(a) * r]);
  }
  out.push([hw, yt]);
  const hi = hw - t, ri = r - t;
  inn.push([hi, yt]);
  for (let i = n; i >= 0; i--) {
    const a = Math.PI + i / n * Math.PI;
    inn.push([Math.cos(a) * hi, yb + t + ri + Math.sin(a) * ri]);
  }
  inn.push([-hi, yt]);
  return [...out, ...inn];
}
function upperSec(r, y0, n = 14) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = i / n * Math.PI;
    pts.push([Math.cos(a) * r, AK.GAS_Y + Math.sin(a) * r]);
  }
  pts.push([-r, y0], [r, y0]);
  return pts;
}
function smoothProf(key, n = 4) {
  const out = [];
  for (let i = 0; i < key.length - 1; i++) {
    const a = key[i], b = key[i + 1];
    for (let j = 0; j < n; j++) {
      const t = j / n, e = (1 - Math.cos(Math.PI * t)) / 2;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e]);
    }
  }
  out.push(key[key.length - 1]);
  return out;
}
function uPoint(hw, yb, yt, s, q) {
  const r = Math.min(hw, (yt - yb) * 0.6);
  if (q.y != null && q.y >= yb + r) return [s * hw, q.y, s, 0];
  const a = (q.a ?? 0) * Math.PI / 180;
  const nz = Math.cos(a) / hw, ny = -Math.sin(a) / r, l = Math.hypot(nz, ny);
  return [s * Math.cos(a) * hw, yb + r - Math.sin(a) * r, s * nz / l, ny / l];
}
function uRib(prof, yt, s, q, w = 1.8, h = 1.2, n = 10) {
  const xs = prof[0][0], xe = prof[prof.length - 1][0];
  const rings = prof.map(([x, hw, yb]) => {
    const [z, y, nz, ny] = uPoint(hw, yb, yt, s, q);
    const f = Math.max(0.04, Math.min(1, (x - xs) / 5, (xe - x) / 5));
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = i / n * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t);
      const dn = (c * h * 0.5 + h * 0.2) * f - h * 0.35 * (1 - f), dt = sn * w * 0.5 * Math.sqrt(f);
      pts.push([z + nz * dn - ny * dt, y + ny * dn + nz * dt]);
    }
    return { x, pts };
  });
  return loftX(rings, { crease: 60, flip: true });
}
function lowerStd(ctx, k, mat, o = {}) {
  const x0 = AK.FRONT + 2, x1 = 212, YT = 11;
  const key = o.paddle ? [[x0, 22, -22], [x0 + 20, 23.5, -23], [x0 + 55, 21, -22], [x0 + 80, 18.5, -21], [x1 - 10, 18.5, -20], [x1, 18, -19]] : o.ribs ? [[x0, 20.4, -22], [x0 + 40, 20.2, -22.2], [x1 - 22, 19.2, -21.4], [x1 - 9, 21, -24.4], [x1 - 4, 21, -24.4], [x1, 19.4, -21.4]] : [[x0, 20, -22], [x1 - 10, 19, -21], [x1, 18.5, -20]];
  const prof = smoothProf(key, 4);
  const rings = prof.map(([x, hw, yb]) => ({ x, pts: uSec(hw, yb, YT, 3.4, 12) }));
  k.add(mat, loftX(rings, { caps: false, flip: true }));
  k.add(mat, extrudeX(rings[0].pts, x0, x0 + 1.2, { bevel: 0.3 }));
  k.add(mat, extrudeX(rings[rings.length - 1].pts, x1 - 1.2, x1, { bevel: 0.3 }));
  k.add("steel", extrudeX(uSec(key[0][1] + 0.6, key[0][2] - 0.6, YT, 1.4, 12), x0 - 1, x0 + 5, { bevel: 0.4 }));
  if (o.ribs) {
    const rp = prof.filter(([x]) => x >= x0 + 12 && x <= x1 - 26);
    for (const s of [-1, 1]) {
      for (const y of [7.5, 3, -1.5]) k.add(mat, uRib(rp, YT, s, { y }));
      for (const a of [22, 44, 66]) k.add(mat, uRib(rp, YT, s, { a }));
    }
    for (const s of [-1, 1]) k.add(mat, uRib(prof.filter(([x]) => x >= x1 - 12 && x <= x1 - 3), YT, s, { a: 50 }, 1.2, 0.8));
  }
}
function upperStd(ctx, k, mat, o = {}) {
  k.add(mat, extrudeX(upperSec(13.2, 12), 100, 288, { bevel: 2 }));
  if (o.ribs) for (let i = 0; i < 5; i++) k.add(mat, T(T(cylX(1.3, 114, 278, { c: 1.2, seg: 10 }), { s: [1, 0.6, 1], p: [0, 13.1, 0] }), { r: [(i - 2) * 24, 0, 0] }).translate(0, AK.GAS_Y, 0));
  k.add("steel", extrudeX(upperSec(13.8, 11), 284, 292, { bevel: 0.8 }));
  k.add("steel", extrudeX(upperSec(13.6, 11.6), 99, 103, { bevel: 0.6 }));
}
function retainer(ctx, k) {
  k.add("steel", extrudeX(shape(uSec(20.2, -22.2, 12, 3, 10)), 208, 222, { bevel: 0.8 }));
  k.add("steel", T(latheX([[0, 0], [0, 3.2], [0.6, 3.2], [1.4, 2.4], [1.6, 0]], { seg: 16 }), { r: [0, -90, 0], p: [215, 4, 20] }));
  k.add("steel", extrudeZ([[212.2, 3, 2.4], [217.8, 3, 2.4], [217, 16, 2], [213.4, 16, 2]], 1.6, { bevel: 0.5, z: 21 }));
  k.add("steel", T(cylZ(3.6, -12, 12, { seg: 16 }), { p: [215, -15, 0] }));
}
function hgStd(ctx, o) {
  const k = ctx.kit();
  lowerStd(ctx, k, o.mat, o);
  upperStd(ctx, k, o.mat, o);
  retainer(ctx, k);
  return { root: k.build("hg_std") };
}
function hgB10(ctx) {
  const k = ctx.kit();
  const x0 = AK.FRONT + 2, x1 = 210;
  const sec = [[-21, 11, 1], [-22, -6, 3], [-15, -22, 5], [15, -22, 5], [22, -6, 3], [21, 11, 1], [18, 11], [18, -4], [12, -18], [-12, -18], [-18, -4], [-18, 11]];
  k.add("alu", extrudeX(sec, x0, x1, { bevel: 1 }));
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) k.add("alu", T(box(20, 5, 2), { p: [x0 + 30 + i * 36, 4, s * 21.5] }));
  retainer(ctx, k);
  const mounts = [];
  const add = (id, face, rot, len, pos, base) => {
    const r = picatinny(len, { base });
    k.add("alu", r.geo, { r: rot, p: pos });
    const d = { top: [0, 1, 0], bottom: [0, -1, 0], left: [0, 0, -1], right: [0, 0, 1] }[face];
    mounts.push(ctx.railMount(id, [pos[0] + r.first, pos[1], pos[2]], face, r.slots, { axis: face }));
  };
  add("hgBottom", "bottom", [180, 0, 0], 120, [x1 - 126, -31, 0], 10);
  add("hgRight", "right", [90, 0, 0], 70, [x1 - 78, -2, 31], 9.5);
  add("hgLeft", "left", [-90, 0, 0], 70, [x1 - 78, -2, -31], 9.5);
  const top = AK.GAS_Y + 19.4;
  k.add("alu", extrudeX(shape([[-13, 12, 2], [13, 12, 2], [13, top - 9.4, 3], [-13, top - 9.4, 3]], [circle(0, AK.GAS_Y, 9.3, 24)]), 108, 250, { bevel: 1.2 }));
  const rr = picatinny(140, { base: 9.8 });
  k.add("alu", rr.geo, { p: [109, top, 0] });
  mounts.push(ctx.railMount("gasRail", [109 + rr.first, top, 0], "top", rr.slots, { axis: "top" }));
  for (const x of [130, 228]) k.add("steel", T(cylZ(2.8, 12.5, 14.5, { seg: 6 }), { p: [x, AK.GAS_Y + 4, 0] }));
  return { root: node("b10", [k.build(), ...mounts]) };
}
function hgZhukov(ctx, o) {
  const k = ctx.kit();
  const x0 = AK.FRONT + 2, x1 = 250;
  const low = [[-25, 12, 1], [-25, 0, 3], [-21, -18, 4], [-10, -25, 3], [10, -25, 3], [21, -18, 4], [25, 0, 3], [25, 12, 1], [21, 12], [21, 0], [17, -15], [8, -21], [-8, -21], [-17, -15], [-21, 0], [-21, 12]];
  const upp = [[-25, 12, 1], [25, 12, 1], [23, 32, 4], [12, 42, 3], [-12, 42, 3], [-23, 32, 4]];
  const holesSide = mlokHoles(x0 + 26, x1 - 10, 4, { h: 7, len: 32 });
  k.add(o.mat, extrudeX(low, x0, x1, { bevel: 1.6 }));
  k.add(o.mat, extrudeX(shape(upp, [circle(0, AK.GAS_Y, 10, 24)]), 98, x1, { bevel: 1.6 }));
  for (const h of holesSide) for (const s of [-1, 1]) k.add("lensBlack", extrudeZ(shape(h), 1, { bevel: 0.2, z: s * 24.6 }));
  for (const h of mlokHoles(x0 + 40, x1 - 10, 0, { h: 7 })) k.add("lensBlack", T(extrudeZ(shape(h), 1, { bevel: 0.2 }), { r: [90, 0, 0], p: [0, -24.6, 0] }));
  for (let i = 0; i < 5; i++) k.add(o.mat, T(box(22, 1.6, 20), { p: [118 + i * 26, 42, 0] }));
  const mounts = [];
  const sec = (id, face, rot, len, pos) => {
    const r = picatinny(len, { base: 4 });
    k.add("alu", r.geo, { r: rot, p: pos });
    mounts.push(ctx.railMount(id, [pos[0] + r.first, pos[1], pos[2]], face, r.slots, { axis: face }));
  };
  sec("hgBottom", "bottom", [180, 0, 0], 110, [x1 - 126, -29, 0]);
  sec("hgRight", "right", [90, 0, 0], 60, [x1 - 80, 4, 29]);
  sec("hgLeft", "left", [-90, 0, 0], 60, [x1 - 80, 4, -29]);
  return { root: node("zhukov", [k.build(), ...mounts]) };
}
function coverTWS(ctx, o) {
  const base = coverStd(ctx, { ...o, ribs: [-60, -30] });
  const k = ctx.kit();
  const top = 41;
  k.add("alu", extrudeX(shape([[-15, 20, 2], [15, 20, 2], [15, top - 9.4, 2], [-15, top - 9.4, 2]]), -206, 12, { bevel: 1 }));
  const r = picatinny(210, { base: 9.8 });
  k.add("alu", r.geo, { p: [-202, top, 0] });
  k.add("alu", extrudeX(shape([[-10, 22, 1], [10, 22, 1], [10, 32, 2], [-10, 32, 2]]), 10, 26, { bevel: 0.8 }));
  k.add("steel", T(cylZ(3, -12, 12, { seg: 16 }), { p: [20, 26, 0] }));
  k.add("steel", T(ctx.C.knob(6, 5, 16), { r: [0, 90, 0], p: [-210, 18, -16] }));
  const m = ctx.railMount("coverRail", [-202 + r.first, top, 0], "top", r.slots, { axis: "top" });
  return { root: node("tws", [base.root, k.build(), m]) };
}
function slantComp(ctx) {
  const k = ctx.kit();
  k.add("steel", latheX([[0, 0], [0, 10], [1, 10.6], [24, 10.6], [24, 5.2], [3, 5.2], [3, 0]], { seg: 28 }));
  k.add("steel", latheX([[23.5, 7.2], [23.5, 10.6], [33, 10.6], [34, 9.6], [34, 7.2]], { seg: 16, a0: 110, arc: 140 }));
  k.add("steel", flutesX(10.6, 2, 8, 2, 4, 0.5, { a0: 90 }));
  return { root: k.build("slant"), muzzle: { x: 30, kind: "comp", flash: 0.8 } };
}
function brake74(ctx) {
  const k = ctx.kit();
  k.add("steel", latheX([[0, 0], [0, 11.5], [1, 12.4], [60, 12.4], [62, 11.8], [80, 11.8], [81.5, 10.6], [81.5, 4], [78, 3.6], [78, 0]], { seg: 32 }));
  for (const s of [-1, 1]) {
    k.add("lensBlack", T(box(15, 12, 3), { p: [70, 0, s * 11] }));
    k.add("steel", extrudeZ([[62, -8, 1], [81, -8, 1], [81, 8, 1], [62, 8, 1]], 2.4, { bevel: 0.5, z: s * 12.8 }));
  }
  k.add("lensBlack", T(cylY(2.4, 9, 13, { seg: 12 }), { p: [48, 0, 0] }));
  k.add("lensBlack", T(cylY(2.4, 9, 13, { seg: 12 }), { p: [40, 0, 0] }));
  k.add("lensBlack", T(box(6, 3.4, 16), { p: [58, 11.2, 0] }));
  k.add("steel", T(cylZ(2.6, -13.4, 13.4, { seg: 12 }), { p: [16, -4, 0] }));
  return { root: k.build("brake74"), muzzle: { x: 82, kind: "brake", flash: 0.7 } };
}
function dtk1(ctx) {
  const k = ctx.kit();
  k.add("steel", latheX([[0, 0], [0, 13], [1.4, 14.5], [74, 14.5], [76, 13.4], [76, 5], [73, 4.6], [73, 0]], { seg: 36 }));
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) k.add("lensBlack", T(box(10, 13, 4, { bevel: 2 }), { p: [26 + i * 17, 0, s * 13.3] }));
  for (let i = 0; i < 3; i++) k.add("lensBlack", T(cylY(2.2, 11, 15, { seg: 12 }), { p: [24 + i * 17, 0, 0] }));
  k.add("steel", flutesX(14.5, 3, 12, 6, 3, 0.6));
  return { root: k.build("dtk1"), muzzle: { x: 76, kind: "brake", flash: 0.6 } };
}
function can(ctx, o) {
  const k = ctx.kit();
  const R4 = o.r, L = o.len;
  k.add("steel", latheX([[0, 0], [0, 10.5], [16, 10.5], [16, 0]], { seg: 24 }));
  k.add(o.mat, latheX([[8, 0], [8, R4 - 4], [12, R4], [L - 5, R4], [L, R4 - 4], [L, 5.2], [L - 3, 4.6], [L - 3, 0]], { seg: 44, crease: 30 }));
  if (o.fins) k.add(o.mat, flutesX(R4 - 0.4, 26, L - 18, o.fins, 3.2, 1.4));
  if (o.knurl) k.add(o.mat, ringGrooves(R4 + 0.3, 12, 30, 7, 0.5, { seg: 44 }));
  if (o.rings) for (const x of o.rings) k.add(o.mat, tubeX(R4 + 0.8, R4 - 0.2, x, x + 4, { seg: 44 }));
  k.add("lensBlack", cylX(5.2, L - 2.9, L + 0.05, { seg: 18 }));
  return { root: k.build(o.name), muzzle: { x: L, kind: "supp", flash: 0.04 } };
}
function threadCap(ctx) {
  const k = ctx.kit();
  k.add("steel", latheX([[0, 0], [0, 8.8], [14, 8.8], [16, 7.6], [16, 0]], { seg: 28 }));
  k.add("steel", flutesX(8.8, 2, 14, 14, 1.2, 0.5));
  return { root: k.build("cap"), muzzle: { x: 16, kind: "bare", flash: 1 } };
}
function akMag(ctx, o) {
  const k = ctx.kit(), rk = ctx.kit();
  const R4 = o.R, L = o.len, D0 = o.d0, D1 = o.d1, W = o.w;
  const cx = -D0 / 2 + R4, cy = 0;
  const n = 18, back = [], front = [];
  const ang0 = Math.PI;
  for (let i = 0; i <= n; i++) {
    const s = i / n * L;
    const a = ang0 + s / R4;
    const d = D0 + (D1 - D0) * (i / n);
    const px = cx + Math.cos(a) * R4, py = cy + Math.sin(a) * R4;
    const nx = Math.cos(a), ny = Math.sin(a);
    back.push([px + nx * d / 2 - D0 / 2 * 0, py + ny * d / 2]);
    front.push([px - nx * d / 2, py - ny * d / 2]);
  }
  const shiftX = -front[0][0], shiftY = 0;
  const P = [[front[0][0], 12], [back[0][0], 12], ...back.slice(1), ...front.slice().reverse()].map(([x, y]) => [x + shiftX, y + shiftY]);
  k.add(o.mat, extrudeZ(P.map((p) => [...p, 0]), W, { bevel: o.bevel ?? 1.2 }));
  const at = (i) => {
    const u = i / n, a = ang0 + u * L / R4;
    return { a, d: D0 + (D1 - D0) * u, x: cx + Math.cos(a) * R4 + shiftX, y: cy + Math.sin(a) * R4 };
  };
  const steel = o.mat.startsWith("steel");
  const lugM = steel ? o.mat : "steel";
  if (o.ribs) {
    const m = 4;
    for (let j = 1; j < m; j++) {
      const pts = [];
      for (let i = 1; i < n; i++) {
        const q = at(i), t = j / m - 0.5;
        pts.push([cx + Math.cos(q.a) * (R4 + t * q.d) + shiftX, Math.sin(q.a) * (R4 + t * q.d), 0]);
      }
      for (const s of [-1, 1]) k.add(o.ribMat || o.mat, T(wire(pts, 1.4, { n: 50, seg: 8 }), { s: [1, 1, 0.55] }).translate(0, 0, s * (W / 2 - 0.1)));
    }
    for (const s of [-1, 1]) k.add(o.mat, T(T(cylX(1.3, -(D0 - 10) / 2, (D0 - 10) / 2, { c: 1.1, seg: 10 }), { s: [1, 1, 0.5] }), { p: [-D0 / 2, -4, s * (W / 2 - 0.1)] }));
  }
  if (o.cross) for (let i = 2; i <= n - 2; i += 2) {
    const q = at(i), h = (q.d - 16) / 2;
    for (const sd of [-1, 1]) k.add(o.mat, T(T(cylX(2.6, -h, h, { c: 2.2, seg: 12 }), { s: [1, 1, 0.36] }), { r: [0, 0, q.a * 57.2958], p: [q.x, q.y, sd * (W / 2 - 0.1)] }));
  }
  if (steel) for (const edge of [back, front]) {
    const pts = edge.slice(1, n).map(([x, y], i) => {
      const q = at(i + 1), sg = edge === back ? 1 : -1;
      return [x + shiftX + sg * Math.cos(q.a) * 0.2, y + sg * Math.sin(q.a) * 0.2, 0];
    });
    k.add(o.mat, T(wire(pts, 1.6, { n: 50, seg: 8 }), { s: [1, 1, 1.4] }));
  }
  const endA = ang0 + L / R4;
  const ex = cx + Math.cos(endA) * R4 + shiftX, ey = cy + Math.sin(endA) * R4;
  const tx = -Math.sin(endA), ty = Math.cos(endA);
  const plateT = () => ({ r: [0, 0, endA * 57.2958], p: [ex + tx * 2, ey + ty * 2, 0] });
  const PM = o.plate || o.mat;
  k.add(PM, box(D1 + 7, 6, W + 3, { bevel: 1.6 }), plateT());
  for (const s of [-1, 1]) k.add(PM, T(box(D1 + 2, 5, 1.2, { bevel: 0.4 }), { p: [0, -4.4, s * (W / 2 + 0.7)] }), plateT());
  if (steel) {
    k.add(PM, T(box(D1 - 12, 1.4, 7, { bevel: 0.6 }), { p: [0, 3.2, 0] }), plateT());
    for (const x of [-(D1 / 2) + 8, D1 / 2 - 8]) k.add(PM, T(tubeX(2.8, 1.6, 0, 0.6, { seg: 16, c: 0.2 }), { r: [0, 0, 90], p: [x, 2.8, 0] }), plateT());
  } else {
    k.add("lensBlack", T(cylY(3.2, 2.9, 3.15, { seg: 16, c: 0.05 }), { p: [0, 0, 0] }), plateT());
    k.add("steel", T(cylY(2.2, 2.4, 3.1, { seg: 12, c: 0.3 }), { p: [0, 0, 0] }), plateT());
    k.add(PM, T(box(4, 7, W - 4, { bevel: 1.2 }), { p: [D1 / 2 + 3.5, 0.8, 0] }), plateT());
  }
  k.add(lugM, T(box(8, 6, W - 6, { bevel: 0.8 }), { p: [2, 8, 0] }));
  k.add(lugM, T(box(3.4, 6.4, W - 8, { bevel: 0.8 }), { p: [-D0 - 0.9, 2.4, 0] }));
  const cal = o.cal;
  ctx.C.feedLips(k, o.mat, -D0 + 6, -D0 + 42, 12, W / 2, { rise: 5.2, curl: 3.4 });
  ctx.C.cartridge(rk, cal, { p: [-D0 + 8, 13.5, -3.4], r: [0, 0, 3] });
  ctx.C.cartridge(rk, cal, { p: [-D0 + 8, 7, 3.4], r: [0, 0, 3] });
  const rounds = rk.build("rounds");
  return { root: node("mag", [k.build(), rounds]), mag: { cap: o.cap, rounds } };
}
function drum(ctx, o) {
  const k = ctx.kit(), rk = ctx.kit();
  const base = akMag(ctx, { ...o, len: 70, cross: false, ribs: false });
  k.add(o.mat, T(cylZ(66, -26, 26, { c: 5, seg: 48 }), { p: [-10, -120, 0] }));
  k.add(o.mat, T(cylZ(20, 26, 31, { c: 2, seg: 32 }), { p: [-10, -120, 0] }));
  k.add("steel", T(ctx.C.knob(10, 6, 16), { r: [0, -90, 0], p: [-10, -120, 30] }));
  for (let i = 0; i < 12; i++) for (const s of [-1, 1]) k.add(o.mat, T(box(2.4, 40, 1.6, { bevel: 0.5 }), { p: [-10, -120, s * 26.3], r: [0, 0, i * 30] }).translate(0, 0, 0));
  return { root: node("drum", [base.root, k.build()]), mag: { cap: o.cap, rounds: base.mag.rounds } };
}
function akGrip(ctx, o) {
  const k = ctx.kit();
  const a = (o.angle ?? 18) * Math.PI / 180;
  const sh = (y) => Math.tan(a) * y;
  const front = o.front.map(([f, y]) => [sh(y) + f, y]);
  const back = o.back.map(([f, y]) => [sh(y) + f, y]);
  const W = o.w ?? 30;
  const body = gripLoft(front, back, { w: W, k: 2.8, taper: 0.22, width: (t) => 0.9 + 0.1 * Math.sin(Math.PI * t) });
  k.add(o.mat, body);
  if (o.grooves) for (let i = 0; i < o.grooves; i++) for (const s of [-1, 1]) {
    k.add(o.mat, T(box(1.6, 58, 1.2, { bevel: 0.5 }), { p: [sh(-52) - 9 - i * 3.3, -52, s * (W / 2 * 0.93 - 0.3)], r: [0, 0, -o.angle] }));
  }
  if (o.texture) for (let i = 0; i < 9; i++) for (const s of [-1, 1]) k.add(o.mat, T(box(16, 1.2, 1.1, { bevel: 0.3 }), { p: [sh(-20 - i * 8.5) - 20, -20 - i * 8.5, s * (W / 2 * 0.9 - 0.2)], r: [0, 0, o.angle] }));
  if (o.cap) k.add("polySoft", T(box(34, 5, (o.w ?? 28) - 4, { bevel: 2 }), { p: [sh(-o.h) - 16, -o.h - 1, 0] }));
  k.add("steel", T(cylY(3, -o.h - 2, -o.h + 1, { seg: 12 }), { p: [sh(-o.h) - 14, 0, 0] }));
  return { root: k.build("pgrip") };
}
function stockLoft(prof, k = 3.4) {
  return loftX(prof.map(([x, cy, hh, hw]) => ({ x, pts: superEllipse(hw, hh, k, 28, cy, 0) })));
}
function grainAlong(g, dx, dy) {
  const l = Math.hypot(dx, dy), c = dx / l, s = dy / l;
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    uv.setXY(i, x * c + y * s, -x * s + y * c + z);
  }
  return g;
}
function slotScrew(k, x, y, z = 0, r = 3.2) {
  k.add("steelWorn", T(latheX([[0, 0], [0, r], [0.5, r - 0.1], [1.1, r * 0.75], [1.3, 0]], { seg: 16 }), { r: [0, 180, 0], p: [x, y, z] }));
  k.add("lensBlack", T(box(0.9, 0.8, r * 1.8, { bevel: 0.1 }), { p: [x - 1.05, y, z] }));
}
function stockAKM(ctx) {
  const k = ctx.kit();
  const prof = [[-2, -6, 18, 14.6], [-30, -12, 22, 16], [-80, -26, 34, 17.6], [-140, -42, 48, 19], [-196, -60, 60, 20.4], [-206, -63, 62, 20.6]];
  k.add("wood", grainAlong(stockLoft(prof), 204, 57));
  k.add("steel", extrudeX(shape(superEllipse(21, 63, 3.4, 28, -63, 0)), -212, -205, { bevel: 1.2 }));
  k.add("steel", extrudeX(shape(superEllipse(21.4, 63.4, 3.4, 28, -63, 0), [superEllipse(20.2, 62.2, 3.4, 28, -63, 0)]), -206, -202.5, { bevel: 0.5 }));
  const door = rrect(0, -80, 24, 44, 8);
  k.add("lensBlack", extrudeX(shape(rrect(0, -80, 25.2, 45.2, 8.4), [door]), -212.25, -211.8, { bevel: 0.05 }));
  k.add("steel", extrudeX(rrect(0, -80, 23.4, 43.4, 7.8), -212.7, -211.6, { bevel: 0.4 }));
  k.add("steelWorn", T(cylZ(1.5, -7, 7, { seg: 12, c: 0.3 }), { p: [-212.6, -57.2, 0] }));
  k.add("steel", T(tubeX(3.4, 2, 0, 0.5, { seg: 18, c: 0.15 }), { r: [0, 180, 0], p: [-212.6, -92, 0] }));
  for (const y of [-10, -116]) slotScrew(k, -212, y);
  k.add("steel", extrudeZ([[4, 6], [-30, -2, 2], [-30, -8, 2], [4, -2]], 12, { bevel: 0.6 }));
  k.add("steelWorn", T(latheX([[0, 0], [0, 3], [0.5, 2.9], [1.1, 2.2], [1.3, 0]], { seg: 16 }), { r: [0, 0, 90], p: [-22, 0.2, 0] }));
  k.add("lensBlack", T(box(5.4, 0.8, 0.9, { bevel: 0.1 }), { p: [-22, 1.3, 0], r: [0, 30, 0] }));
  k.add("steel", extrudeZ(rrect(-175, -64, 26, 9, 3), 1.6, { bevel: 0.4, z: -20.4 }));
  k.add("steel", wire([[-166, -64, -20], [-166, -64, -27], [-184, -64, -27], [-184, -64, -20]], 1.8, { n: 30 }));
  return { root: k.build("akm_wood"), cheek: { x: -60, y: 8 } };
}
function stockAK74M(ctx) {
  const k = ctx.kit();
  const prof = [[-10, -6, 18, 15], [-40, -13, 23, 16.5], [-90, -28, 36, 18], [-150, -44, 49, 19.4], [-205, -62, 60, 20.6], [-214, -64, 61, 20.6]];
  const f = ctx.kit();
  f.add("poly", stockLoft(prof, 3.8));
  const win = [[-50, -6], [-180, -31], [-180, -78], [-56, -27]];
  for (const s of [-1, 1]) {
    const t = { r: [0, s * 1.455, 0], p: [0, 0, 0] };
    f.add("polySoft", T(extrudeZ([[-50, -6, 6], [-180, -31, 10], [-180, -78, 10], [-56, -27, 6]], 1, { bevel: 0.3, z: s * 15.18 }), t));
    const loop = [];
    for (let i = 0; i < 4; i++) {
      const a = win[i], b = win[(i + 1) % 4];
      for (let j = 0; j < 6; j++) {
        const u = j / 6;
        loop.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, s * 15.33]);
      }
    }
    f.add("poly", T(wire(loop, 0.9, { closed: true, n: 120, seg: 6, tension: 0.2 }), t));
  }
  f.add("rubber", extrudeX(shape(superEllipse(21.4, 62, 3.8, 28, -64, 0)), -224, -213, { bevel: 2 }));
  for (let i = 0; i < 9; i++) f.add("rubber", T(cylZ(1.1, -18.5, 18.5, { seg: 8, c: 0.8 }), { p: [-224.4, -16 - i * 12, 0] }));
  f.add("poly", extrudeX(shape(superEllipse(21.2, 61.2, 3.8, 28, -64, 0)), -214, -211, { bevel: 0.8 }));
  f.add("steel", extrudeZ(rrect(-196, -64, 20, 8, 3), 1.6, { bevel: 0.4, z: -20.8 }));
  f.add("steel", wire([[-189, -64, -20.5], [-189, -64, -27], [-203, -64, -27], [-203, -64, -20.5]], 1.8, { n: 30 }));
  f.add("steel", extrudeX(rrect(0, -4, 30, 26, 3), -14, -1, { bevel: 1 }));
  f.add("steel", extrudeX(rrect(0, -4, 31.4, 27.4, 3.4), -16, -13, { bevel: 0.6 }));
  for (const y of [-14, 2]) f.add("steel", T(cylY(5.2, y, y + 7, { c: 0.6, seg: 18 }), { p: [0, 0, -22] }));
  const fold = node("fold", [f.build()]);
  k.add("steel", extrudeZ([[4, 10], [-4, 10], [-4, -22], [4, -22]], 12, { bevel: 1, z: -20 }));
  for (const y of [-21, -7, 9]) k.add("steel", T(cylY(5, y, y + (y === 9 ? 2 : 7), { c: 0.6, seg: 18 }), { p: [0, 0, -22] }));
  for (const [y, d] of [[11, 1], [-22, -1]]) k.add("steelWorn", T(latheX([[0, 0], [0, 3], [0.5, 2.9], [1, 2.2], [1.2, 0]], { seg: 14 }), { r: [0, 0, d * 90], p: [0, y, -22] }));
  k.add("steel", T(cylZ(5.4, -16.4, -14.9, { seg: 20, c: 0.4 }), { p: [12, 5, 0] }));
  k.add("steelWorn", T(ctx.C.knob(4.4, 3.4, 16), { r: [0, 90, 0], p: [12, 5, -16.2] }));
  fold.position.set(0, 0, -22);
  fold.children[0].position.set(0, 0, 22);
  return { root: node("ak74m_fold", [k.build(), fold]), fold: { node: fold, axis: "y", angle: -172 }, cheek: { x: -70, y: 8 } };
}
function stockUnder(ctx) {
  const k = ctx.kit();
  for (const s of [-1, 1]) {
    k.add("steel", extrudeZ([[0, 4, 2], [-10, 4], [-230, -30, 3], [-232, -40, 3], [-220, -40], [-10, -4], [0, -4]], 3, { bevel: 0.6, z: s * 11 }));
    k.add("steel", extrudeZ([[-12, -12], [-226, -90, 3], [-230, -96, 3], [-218, -96], [-12, -20]], 3, { bevel: 0.6, z: s * 11 }));
  }
  k.add("steel", extrudeZ([[-222, -28, 4], [-236, -30, 4], [-236, -104, 6], [-220, -100, 4]], 28, { bevel: 2 }));
  k.add("steel", T(cylZ(4, -13, 13, { seg: 16 }), { p: [-4, 0, 0] }));
  k.add("steel", T(cylZ(3, -13, 13, { seg: 14 }), { p: [-10, -16, 0] }));
  return { root: k.build("akms"), cheek: { x: -60, y: 6 } };
}
function stockPT(ctx, o) {
  const k = ctx.kit();
  k.add("steel", extrudeX(rrect(0, -2, 30, 34, 4), -30, 0, { bevel: 1.2 }));
  k.add("alu", T(cylX(14.6, -200, -28, { c: 1.2, seg: 32 }), { p: [0, 2, 0] }));
  k.add("steel", T(cylX(17.5, -38, -28, { c: 1, seg: 10 }), { p: [0, 2, 0] }));
  k.add("alu", extrudeX(rrect(0, -12.5, 9, 6, 1.5), -196, -40, { bevel: 0.6 }));
  const s = ctx.kit();
  const pro = shape(
    [[150, -17, 3], [150, 17, 4], [118, 20, 6], [36, 22, 8], [-8, 24, 4], [-8, -92, 5], [8, -92, 4], [100, -21, 10]],
    [[[92, -26, 3], [30, -26, 4], [8, -74, 4], [8, -30, 3]]]
  );
  s.add("poly", extrudeZ(pro, 36, { bevel: 3.5 }));
  s.add("poly", cylX(19, 60, 150, { c: 3, seg: 28 }));
  s.add("poly", extrudeZ([[96, -18, 2], [144, -18, 2], [144, -30, 3], [100, -28, 3]], 20, { bevel: 2 }));
  s.add("rubber", extrudeZ([[-8, 24, 3], [-22, 23, 4], [-22, -93, 4], [-8, -93, 3]], 38, { bevel: 3.5 }));
  for (let i = 0; i < 10; i++) s.add("rubber", T(box(1.6, 2.6, 34), { p: [-22.2, 16 - i * 11.5, 0] }));
  const st = node("ctr", [s.build()]);
  st.position.set(-235, 2, 0);
  let fold = null;
  const parts = [k.build(), st];
  if (o.folding) {
    const f = node("fold", parts.slice());
    fold = node("hinge", [f]);
    fold.position.set(0, 0, -22);
    f.position.set(0, 0, 22);
    return { root: node("pt", [fold]), fold: { node: fold, axis: "y", angle: -172 }, cheek: { x: -110, y: 22 } };
  }
  return { root: node("pt", parts), cheek: { x: -110, y: 22 } };
}
function akParts(v) {
  const is74 = v === "ak74";
  const thr = is74 ? "m24x1.5" : "m14x1L";
  const steel = "steel";
  const cal = is74 ? "545" : "762x39";
  const mag = (id, name, desc, stats, o) => ({ id, cat: "mag", name, desc, fit: { iface: [is74 ? "ak545" : "ak762"] }, stats, build: (c) => o.drum ? drum(c, o) : akMag(c, o) });
  const M762 = { R: 235, d0: 70, d1: 64, w: 27, cal: "762x39" };
  const M545 = { R: 330, d0: 66, d1: 60, w: 25.5, cal: "545" };
  const list = [
    // цевья
    is74 ? { id: "hg_74m", cat: "hg", name: "АК-74М, полимер", desc: "Штатные накладки из стеклонаполненного полиамида", stats: { weight: 240 }, build: (c) => hgStd(c, { mat: "poly", ribs: true }) } : { id: "hg_akm", cat: "hg", name: "АКМ, дерево", desc: "Клеёная берёза, «лопатки» у магазина", stats: { weight: 300 }, build: (c) => hgStd(c, { mat: "wood", paddle: true }) },
    { id: "hg_b10", cat: "hg", name: "Зенитко Б-10М + Б-33", desc: "Три планки снизу и по бокам + низкая планка на газовой трубке", stats: { weight: 390, ergo: 4 }, build: hgB10 },
    { id: "hg_zhukov", cat: "hg", name: "Magpul Zhukov-U", desc: "M-LOK, секции планок по бокам и снизу", stats: { weight: 280, ergo: 6 }, build: (c) => hgZhukov(c, { mat: is74 ? "poly" : "polyFde" }) },
    // крышки
    { id: "cover_std", cat: "cover", name: "Штатная крышка", desc: "Штампованная, с рёбрами жёсткости", stats: { weight: 180 }, build: (c) => coverStd(c, { steel }) },
    { id: "cover_tws", cat: "cover", name: "Крышка с планкой (TWS)", desc: "Жёсткая крышка на шарнире в колодке целика", stats: { weight: 290 }, build: (c) => coverTWS(c, { steel }) },
    // боковой кронштейн, ПСО-1, ПОСП и «Кобра» — общие, из engine/lib/dovetail.js
    // дульные
    is74 ? { id: "brake74", cat: "muzzle", name: "ДТК АК-74", desc: "Штатный двухкамерный дульный тормоз-компенсатор", fit: { thread: ["m24x1.5"] }, stats: { weight: 90, "recoilV%": -20, "recoilH%": -15, loud: 3, flash: 5 }, build: brake74 } : { id: "slant", cat: "muzzle", name: "Компенсатор АКМ", desc: "Штатный «косой срез»: гасит увод вверх-вправо", fit: { thread: ["m14x1L"] }, stats: { weight: 40, "recoilV%": -8, "recoilH%": -12, loud: 1, flash: 10 }, build: slantComp },
    { id: "dtk1", cat: "muzzle", name: "Зенитко ДТК-1", desc: "Трёхкамерный ДТК: сильно снижает отдачу, громче", fit: { thread: ["m14x1L", "m24x1.5"] }, stats: { weight: 190, length: 60, "recoilV%": -28, "recoilH%": -24, loud: 5, flash: 0 }, build: dtk1 },
    is74 ? { id: "pbs4", cat: "muzzle", name: "ПБС-4", desc: "Штатный глушитель к АК-74 (под патрон УС)", fit: { thread: ["m24x1.5"] }, stats: { weight: 480, length: 175, loud: -26, flash: -80, "recoilV%": -10, ergo: -8, adsTime: 25 }, build: (c) => can(c, { name: "pbs4", r: 17.5, len: 175, mat: "steel", knurl: true, rings: [60, 120] }) } : { id: "pbs1", cat: "muzzle", name: "ПБС-1", desc: "Классический глушитель к АКМ", fit: { thread: ["m14x1L"] }, stats: { weight: 520, length: 200, loud: -26, flash: -80, "recoilV%": -10, ergo: -9, adsTime: 25 }, build: (c) => can(c, { name: "pbs1", r: 17.5, len: 200, mat: "steel", knurl: true, rings: [70, 140] }) },
    { id: "rotor43", cat: "muzzle", name: "«Ротор-43»", desc: "Малогабаритный глушитель с оребрённым корпусом", fit: { thread: ["m14x1L", "m24x1.5"] }, stats: { weight: 430, length: 150, loud: -24, flash: -75, "recoilV%": -12, ergo: -6, adsTime: 20 }, build: (c) => can(c, { name: "rotor43", r: 21, len: 150, mat: "cast", fins: 16 }) },
    { id: "cap", cat: "muzzle", name: "Колпачок резьбы", desc: "Голый ствол: громко, яркая вспышка", fit: { thread: [thr] }, stats: { weight: 15, loud: 2, flash: 25, "recoilV%": 6 }, build: threadCap },
    // рукояти
    is74 ? { id: "grip_74m", cat: "pgrip", name: "АК-74М, полимер", desc: "Штатная рукоять", fit: { iface: ["ak"] }, stats: { weight: 70 }, build: (c) => akGrip(c, { mat: "poly", h: 100, front: [[2, 0], [0, -30], [1, -60], [-2, -100]], back: [[-36, 2], [-40, -8], [-39, -50], [-36, -80], [-37, -99]], angle: 17, grooves: 0, texture: true }) } : { id: "grip_akm", cat: "pgrip", name: "АКМ, бакелит", desc: "Рыжий бакелит с вертикальными рифами", fit: { iface: ["ak"] }, stats: { weight: 75 }, build: (c) => akGrip(c, { mat: "bakelite", h: 100, front: [[2, 0], [0, -40], [-1, -100]], back: [[-36, 2], [-41, -10], [-40, -50], [-37, -82], [-38, -99]], angle: 17, grooves: 7 }) },
    { id: "grip_rk3", cat: "pgrip", name: "Зенитко РК-3", desc: "Эргономичная, с упором под ладонь", fit: { iface: ["ak"] }, stats: { weight: 90, ergo: 5 }, build: (c) => akGrip(c, { mat: "poly", h: 104, front: [[2, 0], [0, -14], [5, -28], [0, -40], [-2, -104]], back: [[-34, 4], [-44, 0], [-42, -30], [-38, -70], [-38, -104]], angle: 16, texture: true, cap: true }) },
    { id: "grip_moe_ak", cat: "pgrip", name: "Magpul MOE AK", desc: "Полимерная, с отсеком в торце", fit: { iface: ["ak"] }, stats: { weight: 80, ergo: 3 }, build: (c) => akGrip(c, { mat: "polySoft", h: 102, front: [[1, 0], [0, -30], [2, -60], [0, -102]], back: [[-34, 3], [-40, -10], [-38, -60], [-37, -102]], angle: 20, texture: true, cap: true }) },
    // приклады
    is74 ? { id: "stock_74m", cat: "stock", name: "АК-74М, складной", desc: "Полимерный, складывается влево (K)", fit: { iface: ["ak"] }, stats: { weight: 360 }, build: stockAK74M } : { id: "stock_akm", cat: "stock", name: "АКМ, дерево", desc: "Клеёная берёза, стальной затыльник с пеналом", fit: { iface: ["ak"] }, stats: { weight: 480 }, build: stockAKM },
    is74 ? null : { id: "stock_akms", cat: "stock", name: "АКМС, складной вниз", desc: "Штампованный металлический приклад", fit: { iface: ["ak"] }, stats: { weight: 320, ergo: 4, "recoilV%": 8 }, build: stockUnder },
    { id: "stock_pt", cat: "stock", name: is74 ? "Зенитко ПТ-3 + Magpul CTR" : "Зенитко ПТ-1 + Magpul CTR", desc: "Переходник под трубу AR, телескопический приклад", fit: { iface: ["ak"] }, stats: { weight: 420, ergo: 6, "recoilV%": -6 }, build: (c) => stockPT(c, { folding: is74 }) }
  ].filter(Boolean);
  if (is74) {
    list.push(
      mag("mag545_plum", "Магазин 6Л23, «слива»", "Полимер, 30 патронов 5,45", { weight: 220, mag: 30 }, { ...M545, len: 150, mat: "polyPlum", cap: 30, ribs: true }),
      mag("mag545_black", "Магазин 6Л23, чёрный", "Полимер, 30 патронов", { weight: 220, mag: 30 }, { ...M545, len: 150, mat: "poly", cap: 30, ribs: true }),
      mag("mag545_45", "Магазин РПК-74, 45", "Удлинённый, 45 патронов", { weight: 320, mag: 45, ergo: -4, adsTime: 12 }, { ...M545, len: 210, mat: "polyPlum", cap: 45, ribs: true }),
      mag("mag545_drum", "Барабан 95 (РПК-74)", "Барабанный, 95 патронов", { weight: 1600, mag: 95, ergo: -12, adsTime: 35 }, { ...M545, mat: "poly", cap: 95, drum: true })
    );
  } else {
    list.push(
      mag("mag762_steel", "Магазин стальной, 30", "Штампованная сталь с рёбрами", { weight: 330, mag: 30 }, { ...M762, len: 158, mat: "steelPark", cap: 30, cross: true }),
      mag("mag762_bak", "Магазин бакелитовый, 30", "«Рыжий» АГ-4С", { weight: 250, mag: 30 }, { ...M762, len: 158, mat: "bakelite", cap: 30, ribs: true }),
      mag("mag762_pmag", "Magpul PMAG 30 AK", "Полимер, окно у затыльника", { weight: 240, mag: 30, ergo: 1 }, { ...M762, len: 158, mat: "poly", cap: 30, ribs: true, bevel: 1.8 }),
      mag("mag762_40", "Магазин РПК, 40", "Удлинённый, 40 патронов", { weight: 440, mag: 40, ergo: -4, adsTime: 12 }, { ...M762, len: 205, mat: "steelPark", cap: 40, cross: true }),
      mag("mag762_drum", "Барабан РПК, 75", "Барабанный, 75 патронов", { weight: 2100, mag: 75, ergo: -14, adsTime: 40 }, { ...M762, mat: "steelPark", cap: 75, drum: true })
    );
  }
  return list;
}
function akSlots() {
  const optRails = ["coverRail", "gasRail", "sideRail", "dovetail"];
  return [
    { id: "handguard", label: "Цевьё", group: "Цевьё и ствол", accepts: ["hg"], mount: "hg", required: true },
    { id: "muzzle", label: "Дульное устройство", group: "Цевьё и ствол", accepts: ["muzzle"], mount: "muzzle" },
    { id: "cover", label: "Крышка коробки", group: "Ствольная коробка", accepts: ["cover"], mount: "cover", required: true },
    { id: "sidemount", label: "Боковой кронштейн", group: "Оптика", accepts: ["sidemount"], rails: ["dovetail"] },
    { id: "optic", label: "Прицел", group: "Оптика", accepts: ["optic"], rails: optRails, prefer: { x: -60 } },
    { id: "magnifier", label: "Увеличитель", group: "Оптика", accepts: ["magnifier"], rails: optRails.slice(0, 3), prefer: "rear", behind: "optic" },
    { id: "offset", label: "Боковой коллиматор", group: "Оптика", accepts: ["offset"], rails: optRails.slice(0, 3), prefer: { x: 0 } },
    { id: "under", label: "Под стволом", group: "Тактика", accepts: ["foregrip", "bipod"], rails: ["hgBottom"], prefer: "front" },
    { id: "tacRight", label: "Правая планка", group: "Тактика", accepts: ["light", "laser", "combo"], rails: ["hgRight"], prefer: "front" },
    { id: "tacLeft", label: "Левая планка", group: "Тактика", accepts: ["light", "laser", "combo"], rails: ["hgLeft"], prefer: "front" },
    { id: "mag", label: "Магазин", group: "Ствольная коробка", accepts: ["mag"], mount: "magwell" },
    { id: "pgrip", label: "Пистолетная рукоять", group: "Ствольная коробка", accepts: ["pgrip"], mount: "grip", iface: "ak", required: true },
    { id: "stock", label: "Приклад", group: "Ствольная коробка", accepts: ["stock"], mount: "stock", iface: "ak" }
  ];
}

// src/weapons/ak74.js
var ak74_default = {
  id: "ak74",
  title: "АК-74М",
  short: "АК-74М",
  caliber: "5,45×39",
  cal: "545",
  thread: "m24x1.5",
  boltHold: false,
  specs: [["Ствол", "415 мм"], ["Длина", "943 / 700 мм"], ["Темп", "650 выстр/мин"], ["Масса", "3,4 кг"]],
  base: { weight: 2020, length: 860, ergo: 48, recoilV: 92, recoilH: 90, moa: 2.4, velocity: 900, range: 450, loud: 158, flash: 60, adsTime: 290, rpm: 650, mag: 30 },
  audio: { cal: "545", mech: 0.95 },
  modes: ["safe", "auto", "semi"],
  build: (ctx) => akBase(ctx, { id: "ak74", steel: "steel", dimples: true, gas45: true, bayonet: true }),
  slots: akSlots(),
  parts: akParts("ak74"),
  defaults: {
    handguard: "hg_74m",
    muzzle: "brake74",
    cover: "cover_std",
    sidemount: null,
    optic: null,
    magnifier: null,
    under: null,
    tacRight: null,
    tacLeft: null,
    mag: "mag545_plum",
    pgrip: "grip_74m",
    stock: "stock_74m"
  }
};


export { ak74_default as def };
