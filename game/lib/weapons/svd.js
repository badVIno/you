// СГЕНЕРИРОВАНО game/tools/build_weapons.mjs из game/weapons/svd.html — не редактировать вручную.
import { T, a2, box, boxMag, brake, circle, cylX, cylY, cylZ, extrudeX, extrudeY, extrudeZ, flutesX, latheX, loftPath, mlokHoles, mount, node, picatinny, pso1, ringGrooves, rrect, screwHead, shape, slot, spring, tubeX, wire } from './engine.js';
// src/weapons/svd.js
// СВД: газоотводная автоматика с коротким ходом поршня, фрезерованная коробка, «ласточкин хвост» слева.
// Единицы — мм, ось канала ствола y = 0, x = 0 — передний срез коробки, +z — правый борт.
var SV = {
  FRONT: 26,
  REAR: -236,
  WALL: 12,
  BOTTOM: -26,
  GAS_Y: 25,
  GAS_R: 8,
  SIGHT_Y: 46,
  REAR_X: 64,
  FRONT_X: 596,
  MUZZLE: 612,
  MAG_X: 2
};
function svdReceiver(ctx, k) {
  const { extrudeX: exX, extrudeZ: exZ, extrudeY: exY, T: T2, box: bx, cylZ: cZ, latheX: lX, shape: sh, rrect: rr } = ctx.G;
  const { FRONT: F, REAR: R4, WALL: W, BOTTOM: B } = SV;
  const M = "steel";
  // фрезерованные борта: окно выброса справа и выборка под рукоять затворной рамы
  const right = [[F, B, 1], [F, W], [-8, W], [-8, 0, 1], [-96, 0, 1], [-96, 8], [-214, 8], [-214, W], [R4, W], [R4, -14, 2], [R4 + 10, B, 3]];
  const left = [[F, B, 1], [F, W], [R4, W], [R4, -14, 2], [R4 + 10, B, 3]];
  k.add(M, exZ(right, 2.2, { bevel: 0.5, z: 14.4 }));
  k.add(M, exZ(left, 2.2, { bevel: 0.5, z: -14.4 }));
  k.add(M, exY(sh(rr((F + R4) / 2, 0, F - R4, 30, 1), [rr(-40, 0, 80, 24, 2)]), B - 1.6, B, { bevel: 0.3 }));
  k.add(M, exX(rr(0, (B + W) / 2 - 2, 27, W - B - 4, 1), 6, F, { bevel: 0.6 }));
  k.add(M, exX(rr(0, (B + W) / 2 - 2, 27, W - B - 6, 1), R4, R4 + 16, { bevel: 0.6 }));
  k.add("lensBlack", exX(rr(0, -8, 26, 8, 0), -213, 4, { bevel: 0 }));
  // продольные рёбра фрезеровки и выборки облегчения
  for (const s of [-1, 1]) {
    k.add(M, T2(exZ([[-200, -10], [-110, -10], [-108, -6, 1], [-202, -6, 1]], 1, { bevel: 0.3 }), { p: [0, 0, s * 15.6] }));
    k.add(M, exX(rr(s * 14.8, W - 0.6, 3.4, 1.6, 0.4), R4, F, { bevel: 0.2 }));
  }
  // «ласточкин хвост» на левом борту
  k.add("steel", exX(sh([[-15.5, -12, 1], [-15.5, 6, 1], [-19, 8], [-24, 5, 1], [-24, -9, 1], [-19, -12]]), -176, -60, { bevel: 0.6 }));
  for (const x of [-150, -84]) k.add("steelWorn", T2(cZ(3, -25, -23.6, { seg: 14 }), { p: [x, -2, 0] }));
  // штифты и защёлка магазина
  // оси УСМ (спуск, курок, автоспуск) и штифты ствольной вставки — головки на обоих бортах
  for (const s of [-1, 1]) for (const [x, y, r] of [[-118, -20, 2.4], [-150, -13, 2.4], [-178, -16, 2], [-10, -18, 2], [14, -18, 2]]) k.add("steelWorn", T2(cZ(r, 0, 0.9, { seg: 14, c: 0.3 }), { p: [x, y, s > 0 ? 15.4 : -16.3] }));
  // клеймо Ижмаша (треугольник со стрелой) и номер — тонкая гравировка на левом борту
  k.add("lensBlack", exZ(sh([[-44, -16], [-30, -16], [-37, -4]], [[[-41.6, -14.6], [-37, -6.6], [-32.4, -14.6]]]), 0.3, { bevel: 0, z: -15.6 }));
  k.add("lensBlack", T2(bx(0.8, 7, 0.3, { bevel: 0 }), { p: [-37, -11, -15.62] }));
  for (let i = 0; i < 7; i++) k.add("lensBlack", T2(bx(2.6, 4, 0.3, { bevel: 0 }), { p: [-86 + i * 4.2, -18, -15.62] }));
  // защёлка магазина АК-типа: сразу за горловиной, перед скобой, на оси между двумя ушками
  k.add(M, exZ([[-87, B + 1], [-96, B + 1], [-97, -36, 2], [-100, -43, 2], [-94, -45, 2], [-88, -35, 1]], 11, { bevel: 0.8 }));
  for (const s of [-1, 1]) k.add(M, T2(bx(9, 7, 2.2, { bevel: 0.5 }), { p: [-92, B - 2.6, s * 6.8] }));
  k.add("steelWorn", T2(cZ(1.6, -8.2, 8.2, { seg: 12 }), { p: [-92, B - 3, 0] }));
  // спусковая скоба (штампованная, с отбортовкой) на двух заклёпках
  const tg = sh([[-98, B], [-166, B], [-166, -32, 3], [-154, -48, 6], [-110, -50, 6], [-98, -38, 3]], [[[-104, B - 2.5], [-160, B - 2.5], [-152, -43, 5], [-112, -45, 5], [-104, -35, 3]]]);
  k.add(M, exZ(tg, 10, { bevel: 0.8 }));
  k.add(M, exZ(sh([[-98, B], [-166, B], [-166, -30, 3], [-98, -30, 3]], [[[-103, B - 1], [-161, B - 1], [-161, -31], [-103, -31]]]), 12, { bevel: 0.6 }));
  for (const x of [-101, -163]) k.add("steelWorn", T2(cZ(2, -6.4, 6.4, { seg: 12 }), { p: [x, B - 2.2, 0] }));
  k.add("lensBlack", T2(bx(18, 0.4, 7, { bevel: 0 }), { p: [-120, B - 1.2, 0] }));
}
function svdCover(ctx, k) {
  const { extrudeX: exX, T: T2, box: bx, cylX: cX } = ctx.G;
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
  const outer = arc(16.6, 12.4, 29, 12.5), inner = arc(15.2, 12.4, 27.6, 11.2).reverse();
  k.add("steel", exX([...outer, ...inner.map((p) => [p[0], p[1]])], SV.REAR + 1, SV.FRONT - 2, { bevel: 0.3 }));
  // у СВД крышка гладкая: только выштампованный пояс жёсткости у заднего упора и отбортовка по нижней кромке
  k.add("steel", exX([...arc(17.1, 13.4, 29.5, 13), ...arc(16.5, 13.4, 28.9, 12.4).reverse()], SV.REAR + 14, SV.REAR + 24, { bevel: 0.6 }));
  for (const s of [-1, 1]) k.add("steel", exX([[s * 16.4, 12.4], [s * 17.2, 12.4], [s * 17.2, 14.6], [s * 16.4, 14.6]], SV.REAR + 1, SV.FRONT - 2, { bevel: 0.2 }));
  // упор крышки и кнопка
  k.add("steelWorn", T2(cX(4.6, SV.REAR - 7, SV.REAR - 0.5, { c: 0.8, seg: 18 }), { p: [0, 18, 0] }));
  k.add("steelBright", T2(cX(2.6, SV.REAR - 9.5, SV.REAR - 6, { c: 0.6, seg: 14 }), { p: [0, 18, 0] }));
  k.add("steel", exX(arc(16.6, 12.4, 29, 12.5), SV.REAR - 1, SV.REAR + 2, { bevel: 0.5 }));
}
// Антабка на вертлюге: бобышка с осью и подвижная скоба. side: ±1 — на борту (ось по Z), 0 — снизу (ось по Y).
function svdSwivel(ctx, k, p, side, o = {}) {
  const { T: T2, cylZ: cZ, cylY: cY, wire: wr } = ctx.G;
  const [x, y, z] = p, w = o.w ?? 14, h = o.h ?? 15;
  let y0 = y, zr = z;
  if (side) {
    k.add(o.mat || "steelWorn", T2(cZ(3.2, 0, 4, { seg: 14, c: 0.6 }), { p: [x, y, z], r: [0, side < 0 ? 180 : 0, 0] }));
    zr = z + side * 4.6;
  } else {
    k.add(o.mat || "steelWorn", T2(cY(3.4, -5, 0, { seg: 14, c: 0.6 }), { p: [x, y, z] }));
    k.add("steelWorn", T2(cZ(1.4, -4, 4, { seg: 10 }), { p: [x, y - 3, z] }));
    y0 = y - 3;
  }
  const loop = [[x - w / 2, y0], [x - w / 2, y0 - h * 0.6], [x - w * 0.28, y0 - h], [x + w * 0.28, y0 - h], [x + w / 2, y0 - h * 0.6], [x + w / 2, y0]];
  k.add("steelWorn", wr(loop.map(([a, b]) => [a, b, zr]), 1.3, { closed: true, n: 48, seg: 7 }));
}
function svdBarrel(ctx, k, o) {
  const { latheX: lX, extrudeX: exX, extrudeZ: exZ, T: T2, box: bx, cylX: cX, cylY: cY, cylZ: cZ, shape: sh } = ctx.G;
  const { FRONT: F, MUZZLE: MZ, GAS_Y: GY, GAS_R: GR, SIGHT_Y: SY, REAR_X: RX, FRONT_X: FX } = SV;
  const M = "steel";
  k.add(M, lX([[F - 6, 0], [F - 6, 13.4], [106, 13.4], [110, 12], [250, 11], [400, 10], [446, 9.4], [580, 9], [596, 9], [598, 7.4], [MZ, 7.4], [MZ, 3.4], [MZ - 5, 3.4], [MZ - 5, 0]], { seg: 36 }));
  // колодка прицела (как у АК, но выше) и секторный целик
  k.add(M, exZ([[F - 2, 6], [104, 6], [104, 30, 2], [96, 38, 3], [40, 40, 3], [F - 2, 35, 2]], 26, { bevel: 1.4 }));
  // ушки шарнира планки, пружина планки и штифт колодки
  for (const s of [-1, 1]) k.add(M, exZ([[RX - 36, 36], [RX - 22, 36], [RX - 24, 43, 2], [RX - 34, 43, 2]], 2.2, { bevel: 0.4, z: s * 9.8 }));
  k.add("steelWorn", T2(cZ(1.8, -11.2, 11.2, { seg: 12 }), { p: [RX - 29, 40.4, 0] }));
  k.add("spring", exZ([[RX - 20, 39.8], [RX + 20, 38.4], [RX + 20, 39.2], [RX - 20, 40.6]], 8, { bevel: 0.2 }));
  for (const s of [-1, 1]) k.add("steelWorn", T2(cZ(2, 0, 0.8, { seg: 12 }), { p: [F + 18, 20, s > 0 ? 12.8 : -13.6] }));
  const leaf = ctx.kit();
  leaf.add(M, exZ([[RX - 30, 39.4], [RX + 28, 37], [RX + 28, 39.4], [RX - 24, 42.4, 2], [RX - 30, 42.8]], 17, { bevel: 0.5 }));
  const notch = [[-8.5, 38.4, 1], [8.5, 38.4, 1], [8.5, SY, 0.8], [1.5, SY, 0.2], [1.2, SY - 2.4, 0.5], [-1.2, SY - 2.4, 0.5], [-1.5, SY, 0.2], [-8.5, SY, 0.8]];
  leaf.add(M, exX(notch, RX - 2, RX + 1.4, { bevel: 0.3 }));
  leaf.add("steelWorn", exZ([[RX + 2, 38.6], [RX + 14, 38], [RX + 14, 44.5, 1], [RX + 2, 45.2, 1]], 20, { bevel: 0.8 }));
  // кнопки защёлки хомутика по бокам и его рифление сверху
  for (const s of [-1, 1]) leaf.add("steelWorn", T2(bx(6, 4.4, 2.6, { bevel: 0.8 }), { p: [RX + 8, 41.6, s * 11] }));
  for (let i = 0; i < 4; i++) leaf.add("steel", T2(bx(0.8, 0.6, 18, { bevel: 0.2 }), { p: [RX + 4 + i * 2.6, 45.1 - i * 0.12, 0] }));
  for (let i = 0; i < 10; i++) leaf.add("paintWhite", T2(bx(0.6, 0.2, 3), { p: [RX - 22 + i * 5, 42.1 - i * 0.28, 5] }));
  const leafNode = leaf.build("rearLeaf");
  // газовая трубка, газовая камора с двухпозиционным регулятором, толкатель
  k.add(M, T2(cX(GR, 100, 410, { c: 0.8, seg: 24 }), { p: [0, GY, 0] }));
  k.add(M, exZ([[404, -13, 4], [438, -13, 4], [438, 12, 2], [432, 36, 4], [408, 36, 3], [404, 26]], 24, { bevel: 1.6 }));
  k.add(M, T2(cX(11.5, 398, 440, { c: 1.2, seg: 28 }), { p: [0, GY, 0] }));
  k.add("steelWorn", T2(lX([[440, 0], [440, 10.2], [449, 10.2], [451, 8.6], [451, 0]], { seg: 24 }), { p: [0, GY, 0] }));
  k.add("lensBlack", T2(bx(0.8, 14, 2.4, { bevel: 0 }), { p: [451.1, GY, 0] }));
  for (const a of [-40, 40]) k.add("steelWorn", T2(bx(3, 1.4, 1.6, { bevel: 0.3 }), { p: [445, GY + 10.4, 0], r: [a, 0, 0] }));
  k.add("steelWorn", T2(cZ(4, 12, 15.5, { seg: 6 }), { p: [428, GY, 0] }));
  k.add("steelWorn", T2(exZ([[0, 0], [12, 0], [12, 3], [0, 3]], 2, { bevel: 0.3 }), { p: [424, GY + 2, 15.4] }));
  for (const x of [412, 430]) k.add("steelWorn", T2(cZ(2.2, -12.5, 12.5, { seg: 12, c: 0.3 }), { p: [x, -3, 0] }));
  // передняя антабка — слева на газовой каморе
  svdSwivel(ctx, k, [421, -6, -12], -1, { w: 16 });
  // основание мушки (напрессовано, два конических штифта), закрытый намушник с отверстием для ключа, упор штыка
  k.add(M, exZ([[FX - 34, -13, 3], [FX + 12, -13, 3], [FX + 12, 12, 2], [FX + 4, 19, 3], [FX - 26, 19, 3], [FX - 34, 10, 2]], 26, { bevel: 1.4 }));
  for (const x of [FX - 24, FX + 2]) k.add("steelWorn", T2(cZ(2, -13.3, 13.3, { seg: 12, c: 0.3 }), { p: [x, -5, 0] }));
  const HC = SY - 2, hood = (r, y0) => {
    const pts = [[r, y0]];
    for (let i = 0; i <= 18; i++) {
      const a = i / 18 * Math.PI;
      pts.push([Math.cos(a) * r, HC + Math.sin(a) * r]);
    }
    pts.push([-r, y0]);
    return pts;
  };
  k.add(M, exX(sh(hood(11, 16), [hood(8.6, 20.5).reverse()]), FX - 8, FX + 6, { bevel: 0.8 }));
  k.add("lensBlack", T2(cY(1.9, HC + 10.4, HC + 11.2, { seg: 14 }), { p: [FX - 1, 0, 0] }));
  k.add("steelWorn", T2(bx(10, 0.6, 1.2, { bevel: 0 }), { p: [FX - 1, 19.2, 13.2] }));
  k.add(M, exZ([[FX - 1.2, 16], [FX + 1.2, 16], [FX + 1.2, SY - 2], [FX + 0.9, SY, 0.3], [FX - 0.9, SY, 0.3], [FX - 1.2, SY - 2]], 2.4, { bevel: 0.2 }));
  if (o.bayonet) {
    k.add(M, exZ([[FX - 30, -12], [FX + 6, -12], [FX + 6, -25, 3], [FX - 22, -25, 3]], 12, { bevel: 1 }));
    for (const s of [-1, 1]) k.add("lensBlack", T2(bx(26, 2.2, 0.3, { bevel: 0 }), { p: [FX - 8, -19, s * 6.05] }));
  }
  k.add("steelWorn", T2(cX(3, 300, FX - 32, { c: 0.6, seg: 12 }), { p: [0, -15, 0] }));
  return leafNode;
}
function svdTrigger(ctx, nodes) {
  const { extrudeZ: exZ, node: nd, cylZ: cZ, T: T2, box: bx } = ctx.G;
  const t = ctx.kit();
  t.add("steel", exZ([[-2, 3], [3, 3], [3, -6, 2], [0, -17, 4], [-5, -23, 2], [-7, -21], [-3, -8, 3]], 6, { bevel: 0.9 }));
  nodes.trigger = nd("trigger", [t.build()], { p: [-118, -20, 0] });
  // флажок-предохранитель АК-типа на правом борту, ось у заднего торца
  const s = ctx.kit();
  // длина как у АК: в положении «огонь» перо не заходит на магазин
  s.add("steel", exZ([[-4, -4, 2], [120, 1, 2], [126, 4, 2], [126, 12, 2], [116, 13, 2], [4, 6, 3], [-4, 4, 2]], 1.8, { bevel: 0.4, z: 16.9 }));
  s.add("steel", exZ([[116, 4], [126, 4], [128, -4, 2], [118, -4, 2]], 3, { bevel: 0.8, z: 17.6 }));
  for (let i = 0; i < 3; i++) s.add("steel", T2(bx(0.8, 7, 0.8, { bevel: 0.2 }), { p: [119 + i * 2.6, 0, 19.2] }));
  s.add("steel", cZ(5.5, 15.5, 18, { seg: 20 }));
  s.add("steelWorn", T2(cZ(2.4, 17.6, 18.6, { seg: 12 }), {}));
  nodes.selector = nd("selector", [s.build()], { p: [-214, 2, 0] });
  return [nodes.trigger, nodes.selector];
}
function svdCarrier(ctx) {
  const { extrudeX: exX, extrudeY: exY, extrudeZ: exZ, T: T2, box: bx, cylX: cX, cylZ: cZ, latheX: lX, shape: sh, node: nd, rrect: rr } = ctx.G;
  const k = ctx.kit();
  k.add("steelBright", exX(rr(0, 12, 22, 15, 3), -170, 6, { bevel: 1 }));
  k.add("steelWorn", cX(9, -40, 0, { c: 0.8, seg: 24 }));
  // в окне выброса: боевой упор затвора, выбрасыватель, фигурный паз рамы и головка ударника
  k.add("steelBright", T2(bx(9, 6, 4, { bevel: 0.9 }), { p: [-6, 1.5, 7.6] }));
  k.add("steelWorn", exZ([[-34, 1.6], [-4, 1.6], [-1.4, 4.8, 1], [-34, 5.2]], 2, { bevel: 0.4, z: 9.4 }));
  k.add("steelWorn", T2(cZ(1.1, 9.6, 10.8, { seg: 10 }), { p: [-26, 3.4, 0] }));
  k.add("lensBlack", T2(bx(26, 1.4, 0.5, { bevel: 0 }), { p: [-28, 10.4, 11.05], r: [0, 0, 18] }));
  k.add("steel", T2(bx(80, 2, 0.6, { bevel: 0.2 }), { p: [-120, 17.6, 11.1] }));
  // рукоять рамы — массивная, справа
  const hx = -96;
  k.add("steelBright", exY(sh([[hx - 16, 10], [hx + 18, 10], [hx + 8, 22, 3], [hx - 12, 24, 3]]), 4, 11, { bevel: 0.8 }));
  k.add("steelBright", T2(cZ(4, 18, 28, { seg: 16 }), { p: [hx - 2, 7.5, 0] }));
  k.add("steelBright", T2(lX([[0, 0], [0, 6.2], [2.4, 7.6], [9, 7.6], [12, 5.2], [13, 0]], { seg: 22 }), { r: [0, -90, 0], p: [hx - 2, 7.5, 27] }));
  return nd("carrier", [k.build()]);
}
function svdBase(ctx) {
  const { node: nd } = ctx.G;
  const k = ctx.kit();
  const nodes = {};
  svdReceiver(ctx, k);
  svdCover(ctx, k);
  const leaf = svdBarrel(ctx, k, { bayonet: true });
  const trg = svdTrigger(ctx, nodes);
  const body = k.build("receiver");
  nodes.carrier = svdCarrier(ctx);
  const root = nd("svd", [body, leaf, nodes.carrier, ...trg]);
  const { mount: mount2 } = ctx;
  root.add(mount2({ id: "hg", type: "hg", p: [0, 0, 0] }));
  root.add(mount2({ id: "dovetail", type: "dovetail", p: [-118, -2, -19], slots: 1, axis: "side" }));
  root.add(mount2({ id: "muzzle", type: "thread", p: [SV.MUZZLE - 16, 0, 0] }));
  root.add(mount2({ id: "magwell", type: "magwell", p: [SV.MAG_X, SV.BOTTOM, 0], rock: [0, 0, 16] }));
  root.add(mount2({ id: "stock", type: "stock", p: [SV.REAR, 0, 0] }));
  return {
    root,
    nodes,
    anim: { carrierTravel: 128, selector: { safe: 0, semi: -16 } },
    eject: { p: [-52, 6, 17], dir: [0.3, 0.5, 1], speed: 3.6 },
    muzzle: [SV.MUZZLE, 0, 0],
    irons: { rear: [SV.REAR_X, SV.SIGHT_Y, 0], front: [SV.FRONT_X, SV.SIGHT_Y, 0], type: "notch" },
    eyeX: -300,
    focus: { center: [30, -50, 0], size: 1420 }
  };
}
/* --------------------------------------------------------------- цевьё */
// Накладки: две половины с продолговатыми отверстиями охлаждения, передняя пружинная обойма.
function svdHg(ctx, o) {
  const { extrudeX: exX, T: T2, box: bx, node: nd, shape: sh, slot: sl, extrudeZ: exZ, cylZ: cZ } = ctx.G;
  const k = ctx.kit();
  const x0 = 110, x1 = 388, M = o.mat;
  const half = (s) => [[0, 36, 3], [s * 21, 30, 6], [s * 23, 6, 8], [s * 17, -18, 8], [0, -21, 3], [0, -17], [s * 13, -14], [s * 19, 6], [s * 17, 28], [0, 32]];
  for (const s of [-1, 1]) k.add(M, exX(half(s).map(([z, y, r]) => [z, y, r || 0]), x0, x1, { bevel: 1.4 }));
  // отверстия охлаждения по бортам
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) k.add("lensBlack", T2(exZ(sh(sl(-16, 16, 0, 8)), 1, { bevel: 0.2 }), { p: [x0 + 30 + i * 40, 12, s * 22.4] }));
  // обойма
  k.add("steel", exX([[-24, 34, 4], [24, 34, 4], [24, -22, 8], [-24, -22, 8]].map(([z, y, r]) => [z, y, r]), x1, x1 + 12, { bevel: 1 }));
  k.add("steel", exX([[-24, 34, 4], [24, 34, 4], [24, -22, 8], [-24, -22, 8]], x0 - 10, x0, { bevel: 1 }));
  k.add("steelWorn", T2(cZ(2.4, 23, 25.5, { seg: 12 }), { p: [x1 + 6, 6, 0] }));
  return { root: nd("hg", [k.build()]) };
}
function svdHgRail(ctx) {
  const { extrudeX: exX, T: T2, box: bx, node: nd, picatinny: pic, mlokHoles: ml, extrudeZ: exZ, shape: sh, circle: ci } = ctx.G;
  const k = ctx.kit();
  const x0 = 106, x1 = 392;
  const sec = [[-24, 14, 2], [-26, -4, 4], [-20, -24, 6], [20, -24, 6], [26, -4, 4], [24, 14, 2], [20, 14], [21, -2], [16, -19], [-16, -19], [-21, -2], [-20, 14]];
  k.add("alu", exX(sec, x0, x1, { bevel: 1.2 }));
  k.add("alu", exX(sh([[-15, 12, 2], [15, 12, 2], [15, SV.GAS_Y + 11, 3], [-15, SV.GAS_Y + 11, 3]], [ci(0, SV.GAS_Y, 8.6, 24)]), x0 + 4, x1 - 4, { bevel: 1.2 }));
  for (const h of ml(x0 + 20, x1 - 70, -8, { h: 7, len: 32 })) for (const s of [-1, 1]) k.add("lensBlack", exZ(sh(h), 1, { bevel: 0.2, z: s * 25.8 }));
  const mounts = [];
  const add = (id, face, rot, len, pos, base) => {
    const r = pic(len, { base });
    k.add("alu", r.geo, { r: rot, p: pos });
    mounts.push(ctx.railMount(id, [pos[0] + r.first, pos[1], pos[2]], face, r.slots, { axis: face }));
  };
  add("hgBottom", "bottom", [180, 0, 0], 200, [x1 - 206, -33, 0], 9);
  add("hgRight", "right", [90, 0, 0], 70, [x1 - 80, -4, 34], 8.5);
  add("hgLeft", "left", [-90, 0, 0], 70, [x1 - 80, -4, -34], 8.5);
  add("gasRail", "top", [0, 0, 0], 170, [x0 + 8, SV.GAS_Y + 20.4, 0], 9.4);
  return { root: nd("svd_rail", [k.build(), ...mounts]) };
}
/* --------------------------------------------------------------- дульные */
function svdFh(ctx) {
  const { latheX: lX, T: T2, box: bx, node: nd } = ctx.G;
  const k = ctx.kit();
  // штатный: длинный цилиндр с пятью продольными прорезями, срез со «щелью»
  k.add("steel", lX([[0, 0], [0, 11.6], [2, 12.4], [70, 12.4], [72, 11.2], [72, 7.6], [4, 7.6], [4, 0]], { seg: 36 }));
  for (let i = 0; i < 5; i++) k.add("lensBlack", T2(bx(38, 2.4, 3.6, { bevel: 0.6 }), { p: [48, 11.6, 0], r: [i * 72, 0, 0] }));
  return { root: nd("svdfh", [k.build()]), muzzle: { x: 72, kind: "fh", flash: 0.35 } };
}
function svdBrake(ctx) {
  const { latheX: lX, T: T2, box: bx, cylY: cY, node: nd, flutesX: fl } = ctx.G;
  const k = ctx.kit();
  k.add("steel", lX([[0, 0], [0, 13.4], [1.4, 15], [72, 15], [74, 13.6], [74, 5.4], [70, 5], [70, 0]], { seg: 36 }));
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) k.add("lensBlack", T2(bx(11, 14, 4, { bevel: 2 }), { p: [28 + i * 16, 0, s * 13.8] }));
  for (let i = 0; i < 2; i++) k.add("lensBlack", T2(cY(2.4, 12, 16, { seg: 12 }), { p: [26 + i * 16, 0, 0] }));
  k.add("steel", fl(15, 3, 14, 6, 3, 0.6));
  return { root: nd("svdbrake", [k.build()]), muzzle: { x: 74, kind: "brake", flash: 0.6 } };
}
function svdCan(ctx) {
  const { latheX: lX, flutesX: fl, tubeX: tb, cylX: cX, node: nd, ringGrooves: rg } = ctx.G;
  const k = ctx.kit();
  const R4 = 22, L = 230;
  k.add("steel", lX([[0, 0], [0, 12.4], [20, 12.4], [20, 0]], { seg: 28 }));
  k.add("cast", lX([[8, 0], [8, R4 - 5], [14, R4], [L - 6, R4], [L, R4 - 5], [L, 6.4], [L - 3, 5.8], [L - 3, 0]], { seg: 48, crease: 30 }));
  k.add("cast", rg(R4 + 0.3, 16, 40, 8, 0.6, { seg: 48 }));
  for (const x of [80, 150]) k.add("cast", tb(R4 + 0.9, R4 - 0.2, x, x + 5, { seg: 48 }));
  k.add("lensBlack", cX(6.4, L - 3, L + 0.05, { seg: 20 }));
  return { root: nd("rotor43", [k.build()]), muzzle: { x: L, kind: "supp", flash: 0.03 } };
}
/* --------------------------------------------------------------- магазины */
function svdMag(ctx, o) {
  const { T: T2, box: bx } = ctx.G;
  const m = boxMag(ctx, { d0: 88, d1: 84, w: 25, lipH: 12, lipX0: 6, lipX1: 60, lipRise: 4.4, lipCurl: 3.2, cal: "762x54R", plateH: 6, plateOver: 6, roundTilt: 4, ...o });
  // «вафельные» выштамповки стального магазина
  if (o.waffle) {
    const k = ctx.kit();
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) for (const s of [-1, 1]) k.add(o.mat, T2(bx(28, 18, 1.2, { bevel: 0.6 }), { p: [-22 - j * 36, -16 - i * 26, s * 12.9] }));
    m.root.add(k.build());
  }
  return m;
}
/* --------------------------------------------------------------- приклады */
// Пистолетная рукоять СВДС/СВДМ: отдельная деталь под задней частью коробки, за спусковой скобой.
// Координаты — от заднего среза коробки (узел приклада). Верх оси спрятан в коробке, фланец прилегает к дну.
function svdPistolGrip(ctx, k, mat = "poly") {
  const { loftPath: lp, extrudeY: exY, T: T2, shape: sh, rrect: rr, cylZ: cZ } = ctx.G;
  const B = SV.BOTTOM, rake = 18 * Math.PI / 180, L = 118;
  const x0 = 40, y0 = B + 8, dx = -Math.sin(rake), dy = -Math.cos(rake);
  const secs = (d, db, t0 = 0, t1 = 1, n = 16) => {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = t0 + (t1 - t0) * i / n, u = (t - 0.26) / 0.64;
      // три выемки под пальцы спереди, «брюшко» под ладонь сзади, лёгкий упор внизу
      const groove = u > 0 && u < 1 ? 1.7 * Math.sin(Math.PI * 3 * u) ** 2 : 0;
      const flare = t > 0.9 ? (t - 0.9) * 22 : 0;
      out.push({ c: [x0 + dx * L * t, y0 + dy * L * t], a: 14.6 - groove + flare - d, a2: 15.2 + 2.6 * Math.sin(Math.PI * Math.min(1, t * 1.2)) + flare - d, b: 13 + 1.3 * Math.sin(Math.PI * t) + db, k: 2.7 });
    }
    return out;
  };
  k.add(mat, lp(secs(0, 0), { seg: 36 }));
  // боковые панели с мелкой насечкой лежат на поверхности рукояти (чуть шире по Z, уже спереди/сзади)
  k.add("polyGrip", lp(secs(2.8, 0.45, 0.2, 0.86, 12), { seg: 36 }));
  // фланец по дну коробки и винт крепления
  k.add(mat, exY(sh(rr(40, 0, 48, 29, 5)), B - 3.4, B + 0.2, { bevel: 1 }));
  k.add("steelWorn", T2(cZ(2.6, -15, 15, { seg: 14, c: 0.4 }), { p: [50, B - 1.6, 0] }));
  const bx0 = x0 + dx * L, by0 = y0 + dy * L;
  k.add("steelWorn", T2(cZ(3, -1, 1, { seg: 16 }), { p: [bx0 - 2, by0 + 12, 13.8] }));
}
// Резиновый затыльник с горизонтальными рёбрами (рёбра — прямо в контуре, по всей ширине).
function svdButtPad(ctx, xf, yTop, yBot, depth, width, o = {}) {
  const { extrudeZ: exZ } = ctx.G;
  const n = o.n ?? 26, mid = (yTop + yBot) / 2, hh = (yTop - yBot) / 2, pts = [[xf, yTop + 1, 3]];
  for (let i = 0; i <= n; i++) {
    const y = yTop - 2 - (yTop - yBot - 4) * i / n, q = (y - mid) / hh;
    pts.push([xf - depth - (o.bulge ?? 2.5) * (1 - q * q) - (i % 2 ? 1.3 : 0), y]);
  }
  pts.push([xf - (o.slant ?? 0), yBot - 1, 3]);
  return exZ(pts, width, { bevel: 2.2 });
}
// «Скелет» с пистолетным вырезом и съёмной щекой.
function svdStock(ctx, o) {
  const { extrudeZ: exZ, T: T2, box: bx, shape: sh, node: nd, cylZ: cZ, screwHead: sw } = ctx.G;
  const k = ctx.kit();
  const M = o.mat;
  const outline = [[16, 14, 2], [-6, 14, 3], [-60, 4, 16], [-210, -6, 20], [-360, -10, 8], [-372, -12, 4], [-372, -150, 6], [-352, -152, 10], [-240, -96, 30], [-120, -72, 16], [-70, -112, 14], [-40, -114, 10], [-26, -60, 10], [-2, -26, 4], [16, -26, 2]];
  const hole = [[-44, -30, 8], [-96, -44, 14], [-230, -58, 24], [-334, -60, 20], [-344, -40, 12], [-300, -22, 10], [-110, -18, 10], [-56, -12, 6]];
  k.add(M, exZ(sh(outline, [hole]), 34, { bevel: 6, curve: 8 }));
  // затыльник (сталь со «сдвоенным» упором)
  k.add("steel", T2(exZ([[-372, -8, 3], [-380, -8, 4], [-380, -154, 6], [-372, -152, 4]], 38, { bevel: 1.6 }), {}));
  for (const y of [-30, -128]) k.add("steelWorn", T2(sw(3.2, 1.3), { r: [0, -90, 0], p: [-380, y, 0] }));
  if (o.cheek) {
    // съёмная щека на защёлке
    k.add(o.cheekMat || "polySoft", T2(exZ([[-70, 17, 8], [-250, 11, 10], [-250, -8, 4], [-70, 1, 4]], 38, { bevel: 5 }), {}));
    k.add("steelWorn", T2(cZ(3, -20, 20, { seg: 12 }), { p: [-110, 16, 0] }));
  }
  k.add("steel", exZ([[18, 16], [0, 16], [0, -24], [18, -24]], 30, { bevel: 1.2 }));
  // задняя антабка — снизу приклада, на вертлюге
  svdSwivel(ctx, k, [-330, -142, 0], 0, { w: 18 });
  return { root: nd("svdstock", [k.build()]), cheek: { x: -140, y: 18 } };
}
// СВДС: отдельная пистолетная рукоять под коробкой + трубчатый приклад на шарнире справа.
// Верхняя труба — от узла шарнира в затыльник, нижняя — наклонная тяга; щека обжимает верхнюю трубу.
function svdsStock(ctx) {
  const { extrudeZ: exZ, extrudeX: exX, T: T2, cylX: cX, cylY: cY, cylZ: cZ, node: nd, box: bx, shape: sh, circle: ci, screwHead: sw } = ctx.G;
  const k = ctx.kit(), f = ctx.kit();
  svdPistolGrip(ctx, k);
  // колодка шарнира на заднем срезе коробки: снизу опускается под нижнюю тягу
  const PX = -26, PZ = 22, TY = -4, TR = 10;
  k.add("steel", exZ([[0, 13, 1], [-22, 13, 3], [PX, 7, 2], [PX, -36, 3], [-20, -44, 4], [0, -44, 2]], 34, { bevel: 1.4 }));
  k.add("steel", exZ([[0, 12], [6, 12], [6, -24], [0, -24]], 27, { bevel: 0.6 }));
  for (const y of [4, -30]) k.add("steelWorn", T2(sw(2.8, 1.2), { p: [-10, y, 17] }));
  // ушки шарнира (верхнее и нижнее) справа, ось вертикальная
  for (const [y0, y1] of [[5, 13], [-44, -35]]) {
    k.add("steel", T2(cY(6.5, y0, y1, { seg: 20, c: 0.8 }), { p: [PX, 0, PZ] }));
    k.add("steel", T2(bx(14, y1 - y0, 8, { bevel: 0.8 }), { p: [PX + 6, (y0 + y1) / 2, 18.5] }));
  }
  k.add("steelBright", T2(cY(2.6, -46, 15, { seg: 14 }), { p: [PX, 0, PZ] }));
  for (const y of [-46.6, 14.4]) k.add("steelWorn", T2(cY(3.8, y, y + 1.2, { seg: 16, c: 0.4 }), { p: [PX, 0, PZ] }));
  // кнопка фиксатора слева, в защитном кольце
  k.add("steel", T2(cZ(7.2, -18.6, -16.6, { seg: 24, c: 0.5 }), { p: [-12, -14, 0] }));
  k.add("steelBright", T2(cZ(4.6, -21.4, -17, { seg: 20, c: 0.8 }), { p: [-12, -14, 0] }));
  // --- складывающаяся часть (в координатах приклада; узел fold ставится на ось шарнира)
  f.add("steel", exZ([[-26.6, 13, 2], [-40, 13, 3], [-40, -44, 3], [-26.6, -44, 2]], 34, { bevel: 1.4 }));
  f.add("steel", T2(cY(6.5, -34, 4, { seg: 20, c: 0.8 }), { p: [PX, 0, PZ] }));
  f.add("steel", T2(bx(12, 38, 8, { bevel: 0.8 }), { p: [PX - 7, -15, 18.5] }));
  f.add("steelWorn", T2(bx(6, 4, 3, { bevel: 0.6 }), { p: [-30, -14, -17.4] }));
  // верхняя труба с обжимными муфтами на обоих концах
  f.add("steel", T2(cX(TR, -334, -38, { c: 0.6, seg: 28 }), { p: [0, TY, 0] }));
  f.add("steel", T2(cX(TR + 2.6, -54, -39, { c: 1, seg: 28 }), { p: [0, TY, 0] }));
  f.add("steel", T2(cX(TR + 2.6, -328, -312, { c: 1, seg: 28 }), { p: [0, TY, 0] }));
  // нижняя тяга: из колодки вниз-назад в нижнюю часть затыльника
  const S0 = [-38, -34], S1 = [-324, -112], sL = Math.hypot(S1[0] - S0[0], S1[1] - S0[1]);
  const sA = Math.atan2(S1[1] - S0[1], S1[0] - S0[0]) * 180 / Math.PI, strut = { r: [0, 0, sA], p: [S0[0], S0[1], 0] };
  f.add("steel", T2(cX(8, 0, sL, { c: 0.6, seg: 24 }), strut));
  f.add("steel", T2(cX(10.4, 0, 14, { c: 1, seg: 24 }), { ...strut }));
  f.add("steel", T2(cX(10.4, sL - 20, sL - 4, { c: 1, seg: 24 }), { ...strut }));
  // стальная рамка затыльника и резиновый затыльник
  f.add("steel", exZ([[-316, 17, 3], [-336, 18, 3], [-338, -152, 4], [-318, -152, 3], [-322, -118, 12], [-316, -40, 20]], 38, { bevel: 1.8 }));
  f.add("rubber", svdButtPad(ctx, -337, 18, -153, 13, 42, { slant: 1.5 }));
  for (const y of [8, -140]) f.add("steelWorn", T2(sw(2.6, 1), { p: [-327, y, 19] }));
  // щека: полимерная колодка с отверстием точно по трубе, стянута двумя винтами снизу
  const cheekOut = [[-12.6, TY - 13.5, 6], [12.6, TY - 13.5, 6], [15, TY + 11, 6], [13, 23, 7], [-13, 23, 7], [-15, TY + 11, 6]];
  f.add("poly", exX(sh(cheekOut, [ci(0, TY, TR + 0.05, 32)]), -236, -84, { bevel: 4, curve: 8 }));
  f.add("polySoft", exX(sh([[-11, 22], [11, 22], [11, 24.2, 1], [-11, 24.2, 1]]), -226, -94, { bevel: 0.8 }));
  f.add("lensBlack", T2(bx(136, 0.6, 2.4, { bevel: 0 }), { p: [-160, TY - 13.6, 0] }));
  for (const x of [-122, -198]) {
    f.add("steelWorn", T2(sw(3, 1.3), { p: [x, TY - 9, 13.2] }));
    f.add("steelWorn", T2(cZ(3.4, -14.8, -13, { seg: 6 }), { p: [x, TY - 9, 0] }));
  }
  svdSwivel(ctx, f, [-329, -128, -19], -1, { w: 16 });
  const fold = nd("fold", [f.build()], { p: [PX, 0, PZ] });
  fold.children[0].position.set(-PX, 0, -PZ);
  return { root: nd("svds", [k.build(), fold]), fold: { node: fold, axis: "y", angle: 172 }, cheek: { x: -140, y: 18 } };
}
// СВДМ: пистолетная рукоять, труба-направляющая, ползун с регулируемой щекой. Ползун ездит на +60 мм.
function svdmStock(ctx) {
  const { extrudeZ: exZ, T: T2, cylX: cX, cylY: cY, cylZ: cZ, node: nd, box: bx, shape: sh, ringGrooves: rg } = ctx.G;
  const k = ctx.kit(), sl = ctx.kit();
  svdPistolGrip(ctx, k);
  // переходник на коробку и труба-направляющая с гребёнкой фиксатора снизу
  k.add("steel", exZ([[16, 16], [-30, 16, 2], [-34, 9, 2], [-34, -20, 3], [-26, -26, 2], [16, -26]], 34, { bevel: 1.4 }));
  for (const y of [8, -18]) k.add("steelWorn", T2(cZ(2.6, 16.6, 17.6, { seg: 14 }), { p: [-14, y, 0] }));
  k.add("alu", T2(cX(14.6, -250, -30, { c: 1, seg: 32 }), { p: [0, -2, 0] }));
  k.add("alu", T2(rg(15.1, -48, -36, 3, 0.5, { seg: 32 }), { p: [0, -2, 0] }));
  k.add("alu", T2(bx(214, 4, 7, { bevel: 0.6 }), { p: [-142, -17.4, 0] }));
  for (let i = 0; i < 6; i++) k.add("lensBlack", T2(bx(4, 0.4, 4, { bevel: 0 }), { p: [-66 - i * 14, -19.5, 0] }));
  const body = sh([[-186, 18, 4], [-332, 18, 4], [-342, 10, 4], [-342, -140, 8], [-300, -142, 10], [-262, -64, 22], [-200, -24, 8], [-186, -22, 4]], [[[-290, -44, 6], [-328, -44, 6], [-328, -124, 8], [-312, -124, 8]]]);
  sl.add("poly", exZ(body, 40, { bevel: 4 }));
  sl.add("rubber", svdButtPad(ctx, -341, 12, -143, 11, 42, { n: 22 }));
  // рычаг фиксатора длины под трубой и гнёзда QD-антабок
  sl.add("steelWorn", exZ([[-190, -22], [-214, -22, 2], [-218, -30, 2], [-196, -31, 2]], 10, { bevel: 0.8 }));
  for (const s of [-1, 1]) {
    sl.add("steel", T2(cZ(6, 0, 1.4, { seg: 20, c: 0.3 }), { p: [-318, -24, s > 0 ? 19.6 : -21] }));
    sl.add("lensBlack", T2(cZ(3.2, 0, 1.6, { seg: 14 }), { p: [-318, -24, s > 0 ? 19.8 : -21.4] }));
  }
  // щека на двух стойках, фиксатор высоты слева
  sl.add("poly", exZ([[-196, 40, 6], [-322, 40, 6], [-322, 28, 3], [-196, 28, 3]], 32, { bevel: 4 }));
  for (const x of [-220, -292]) {
    sl.add("alu", T2(cY(5, 16, 30, { seg: 18, c: 0.4 }), { p: [x, 0, 0] }));
    sl.add("steelWorn", T2(cY(7, 17, 19.5, { seg: 18, c: 0.6 }), { p: [x, 0, 0] }));
  }
  sl.add("steelWorn", T2(cZ(5.5, -25, -19.5, { seg: 20, c: 0.8 }), { p: [-256, 8, 0] }));
  const slide = nd("slide", [sl.build()]);
  return { root: nd("svdm", [k.build(), slide]), fold: { node: slide, slide: 60 }, cheek: { x: -250, y: 40 } };
}
var svd_default = {
  id: "svd",
  family: "svd",
  title: "СВД — снайперская винтовка Драгунова",
  short: "СВД",
  caliber: "7,62×54R",
  cal: "762x54R",
  thread: "svd",
  boltHold: true,
  holdByFollower: true,
  chargeLabel: "затвор",
  specs: [["Ствол", "620 мм"], ["Длина", "1225 мм"], ["Магазин", "10"], ["Масса", "4,3 кг"]],
  base: { weight: 3700, length: 1225, ergo: 38, recoilV: 100, recoilH: 80, moa: 1.2, velocity: 830, range: 800, loud: 166, flash: 50, adsTime: 420, rpm: 600, mag: 10 },
  audio: { cal: "762x54R", mech: 1 },
  modes: ["safe", "semi"],
  build: svdBase,
  keepOut: [{ axis: "top", x0: 60, x1: 110, label: "колодка целика" }],
  slots: [
    { id: "handguard", label: "Цевьё", group: "Ствол и цевьё", accepts: ["svdhg"], mount: "hg", required: true },
    { id: "muzzle", label: "Дульное устройство", group: "Ствол и цевьё", accepts: ["muzzle"], mount: "muzzle" },
    { id: "sidemount", label: "Боковой кронштейн", group: "Оптика", accepts: ["sidemount"], rails: ["dovetail"] },
    { id: "optic", label: "Прицел", group: "Оптика", accepts: ["optic"], rails: ["sideRail", "dovetail", "gasRail"], prefer: { x: -110 } },
    { id: "under", label: "Под стволом", group: "Тактика", accepts: ["foregrip", "bipod"], rails: ["hgBottom"], prefer: "front" },
    { id: "tacRight", label: "Правая планка", group: "Тактика", accepts: ["light", "laser", "combo"], rails: ["hgRight"], prefer: "front" },
    { id: "tacLeft", label: "Левая планка", group: "Тактика", accepts: ["light", "laser", "combo"], rails: ["hgLeft"], prefer: "front" },
    { id: "mag", label: "Магазин", group: "Коробка", accepts: ["mag"], mount: "magwell" },
    { id: "stock", label: "Приклад", group: "Коробка", accepts: ["stock"], mount: "stock", required: true }
  ],
  parts: [
    { id: "hg_wood", cat: "svdhg", name: "Накладки, клеёная берёза", desc: "Штатные, с отверстиями охлаждения", stats: { weight: 260 }, build: (c) => svdHg(c, { mat: "wood" }) },
    { id: "hg_poly", cat: "svdhg", name: "Накладки, полимер", desc: "Чёрный стеклонаполненный полиамид", stats: { weight: 210, ergo: 1 }, build: (c) => svdHg(c, { mat: "poly" }) },
    { id: "hg_rail", cat: "svdhg", name: "Цевьё с планками", desc: "Пикатинни снизу, по бортам и на газовой трубке", stats: { weight: 480, ergo: 3 }, build: svdHgRail },
    { id: "svd_fh", cat: "muzzle", name: "Пламегаситель СВД", desc: "Штатный, пять прорезей", fit: { thread: ["svd"] }, stats: { weight: 110, length: 72, flash: -35 }, build: svdFh },
    { id: "svd_dtk", cat: "muzzle", name: "ДТК для СВД", desc: "Трёхкамерный: заметно меньше отдача, громче", fit: { thread: ["svd"] }, stats: { weight: 190, length: 74, flash: 20, "recoilV%": -26, "recoilH%": -20, loud: 4 }, build: svdBrake },
    { id: "rotor43", cat: "muzzle", name: "Глушитель Rotor 43 (7,62×54R)", desc: "Снижает звук и вспышку, пуля остаётся сверхзвуковой", fit: { thread: ["svd"] }, stats: { weight: 680, length: 230, loud: -25, flash: -60, "recoilV%": -14, ergo: -9, adsTime: 30, velocity: 8 }, build: svdCan },
    { id: "mag10", cat: "mag", name: "Магазин 10, сталь", desc: "Штатный, «вафельные» выштамповки", stats: { weight: 240, mag: 10 }, build: (c) => svdMag(c, { R: 900, len: 106, mat: "steelPark", cap: 10, waffle: true }) },
    { id: "mag10p", cat: "mag", name: "Магазин 10, полимер", desc: "Легче стального", stats: { weight: 150, mag: 10, ergo: 1 }, build: (c) => svdMag(c, { R: 900, len: 106, mat: "poly", cap: 10, ribs: true }) },
    { id: "mag20", cat: "mag", name: "Магазин 20", desc: "Удлинённый, мешает стрельбе лёжа", stats: { weight: 380, mag: 20, ergo: -5, adsTime: 14 }, build: (c) => svdMag(c, { R: 700, len: 176, mat: "steelPark", cap: 20, waffle: true }) },
    { id: "st_wood", cat: "stock", name: "Приклад-«скелет», берёза", desc: "Штатный, со съёмной щекой", stats: { weight: 620 }, build: (c) => svdStock(c, { mat: "wood", cheek: true, cheekMat: "wood" }) },
    { id: "st_poly", cat: "stock", name: "Приклад-«скелет», полимер", desc: "Чёрный, 1990-х годов", stats: { weight: 540, ergo: 1 }, build: (c) => svdStock(c, { mat: "poly", cheek: true, cheekMat: "poly" }) },
    { id: "st_svds", cat: "stock", name: "СВДС, складной", desc: "Трубчатый, складывается вправо (K)", stats: { weight: 700, ergo: 2, "recoilV%": 4 }, build: svdsStock },
    { id: "st_svdm", cat: "stock", name: "СВДМ, телескопический", desc: "Регулируемые длина и щека (K)", stats: { weight: 820, ergo: 5, "recoilV%": -8, "recoilH%": -6 }, build: svdmStock }
  ],
  defaults: {
    handguard: "hg_wood",
    muzzle: "svd_fh",
    sidemount: null,
    optic: "pso1",
    under: null,
    tacRight: null,
    tacLeft: null,
    mag: "mag10",
    stock: "st_wood"
  }
};


export { svd_default as def };
