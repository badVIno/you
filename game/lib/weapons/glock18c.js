// СГЕНЕРИРОВАНО game/tools/build_weapons.mjs из game/weapons/glock18c.html — не редактировать вручную.
import { T, a2, box, boxMag, cylX, cylY, cylZ, drumMag, extrudeX, extrudeZ, flutesX, latheX, mount, node, picatinny, ringGrooves, rrect, shape, slot, tubeX, wire } from './engine.js';
// src/weapons/glock18c.js
// Glock 18C: автоматический пистолет со сцепленным затвором (схема Браунинга), компенсированный ствол,
// переводчик огня слева на кожухе-затворе. Единицы — мм, ось канала y = 0, x = 0 — казённый срез.
// Пропорции по G17/G18C: кожух 186 × 25,5 × 28,5 мм, ось канала ~10 мм ниже крыши кожуха,
// угол рукояти 22°, прицельная линия 165–170 мм, высота с магазином ~138 мм.
var GL = {
  S_REAR: -74,
  S_FRONT: 112,
  S_TOP: 10.5,
  S_BOT: -18,
  S_HW: 12.7,
  SIGHT_Y: 16,
  REAR_X: -66,
  FRONT_X: 104,
  F_TOP: -18,
  GRIP_A: 22,
  // окно выброса и окно компенсатора 18C (над портами ствола)
  PORT: [-1, 40],
  COMP: [74, 100],
  // передний верх магазина; ось рукояти наклонена на GRIP_A
  MAG: [-29, -25]
};
// Точка в системе рукояти/магазина (lx — вперёд по нормали к оси, ly — вверх по оси) → мировые x, y.
function glGripPt(lx, ly) {
  const a = GL.GRIP_A * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [GL.MAG[0] + lx * c + ly * s, GL.MAG[1] - lx * s + ly * c];
}
// UV по мировым координатам (проекция по доминирующей оси нормали): у кожуха из нескольких экструзий
// текстура идёт непрерывно, без швов на стыках участков.
function glUV(ctx, g) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const [u, v] = az >= ax && az >= ay ? [p.getX(i), p.getY(i)] : ay >= ax ? [p.getX(i), p.getZ(i)] : [p.getZ(i), p.getY(i)];
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  g.setAttribute("uv", new ctx.THREE.BufferAttribute(uv, 2));
  return g;
}
// Сечения кожуха (z, y): плоские борта и крыша с фасками 45°.
// port — окно выброса: правый борт срезан до y = −3, крыша открыта до левой кромки худа ствола;
// comp — продольное окно компенсатора; serr — зона насечек (борта утоплены на 0,7 мм, рёбра добавляются отдельно).
function glSlideSec(kind) {
  const { S_TOP: T0, S_BOT: B, S_HW: W } = GL;
  const L = [[-W + 3, T0, 1], [-W, T0 - 4, 1]];
  if (kind === "port") return [[-W, B, 1], [W, B, 1], [W, -3, 0.4], [W - 2.2, -3], [W - 2.2, -8], [-W + 2.2, -8], [-W + 2.2, T0 - 2.4], [-8.3, T0 - 2.4], [-8.3, T0, 0.3], ...L];
  if (kind === "comp") return [[-W, B, 1], [W, B, 1], [W, T0 - 4, 1], [W - 3, T0, 1], [3.8, T0, 0.4], [3.8, 2], [-3.8, 2], [-3.8, T0, 0.4], ...L];
  if (kind === "serr") return [[-W + 0.7, B, 0.6], [W - 0.7, B, 0.6], [W - 0.7, T0 - 4.4], [W, T0 - 4, 1], [W - 3, T0, 1], ...L, [-W + 0.7, T0 - 4.4]];
  return [[-W, B, 1], [W, B, 1], [W, T0 - 4, 1], [W - 3, T0, 1], ...L];
}
function glSlide(ctx, o) {
  const { extrudeX: exX, extrudeZ: exZ, T: T2, box: bx, cylX: cX, cylZ: cZ, node: nd, rrect: rr, latheX: lX } = ctx.G;
  const k = ctx.kit();
  const { S_REAR: R4, S_FRONT: F, S_TOP: T0, S_BOT: B, S_HW: W, SIGHT_Y: SY, REAR_X: RX, FRONT_X: FX, PORT: P, COMP: C } = GL;
  const M = "steelMatte";
  const seg = (kind, x0, x1, bevel) => k.add(M, glUV(ctx, exX(glSlideSec(kind), x0, x1, { bevel })));
  // насечки — настоящие канавки: утопленный участок + рёбра заподлицо с бортом
  // стыки участков без фасок: борта и крыша идут непрерывно, шов не виден
  const serr = (x0, n) => {
    const x1 = x0 + n * 3.1 + 1.5;
    seg("serr", x0, x1, 0);
    for (let i = 0; i < n; i++) for (const s of [-1, 1]) k.add(M, T2(bx(1.6, T0 - 4.6 - B, 0.9, { bevel: 0.25 }), { p: [x0 + 2.3 + i * 3.1, (T0 - 4 + B) / 2 - 0.2, s * (W - 0.45)] }));
    return x1;
  };
  seg("solid", R4, R4 + 4, 0.9);
  const sEnd = serr(R4 + 3, 11);
  seg("solid", sEnd, P[0], 0);
  seg("port", P[0], P[1], 0);
  if (o.comp) {
    seg("solid", P[1], C[0], 0);
    seg("comp", C[0], C[1], 0);
    seg("solid", C[1], F - 3, 0);
  } else if (o.frontSerr) {
    seg("solid", P[1], F - 36, 0);
    seg("solid", serr(F - 36, 8), F - 3, 0);
  } else seg("solid", P[1], F - 3, 0);
  // нос кожуха со скосом; задняя фаска спрятана внутри соседнего участка
  seg("solid", F - 8, F, 1.8);
  // отверстие под направляющий стержень возвратной пружины под стволом
  k.add("lensBlack", T2(cX(4.4, F - 0.4, F + 0.05, { seg: 20, c: 0 }), { p: [0, -11.5, 0] }));
  k.add("steelWorn", T2(cX(2.3, F - 1.2, F + 0.15, { seg: 14, c: 0.3 }), { p: [0, -11.5, 0] }));
  // полость окна выброса (тёмная задняя стенка за худом) и выбрасыватель справа — он же указатель патрона
  k.add("lensBlack", T2(bx(0.6, T0 - 4 + 8, 2 * W - 5), { p: [P[0] + 0.3, (T0 - 2.4 - 8) / 2, 0] }));
  k.add("steel", exZ([[P[0], -2.6, 0.5], [-30, -2.6, 1], [-32, 0.6, 1.5], [-30, 3.8, 1], [P[0], 3.8, 0.5]], 0.9, { bevel: 0.3, z: W + 0.2 }));
  k.add("steel", T2(bx(4, 2.6, 0.6, { bevel: 0.25 }), { p: [-4, 0.6, W + 0.75] }));
  // фрезеровка MOS: посадочное место под коллиматор с крышкой и винтами
  if (o.mos) {
    k.add("lensBlack", T2(bx(50, 0.6, 21), { p: [-44, T0 + 0.05, 0] }));
    k.add("poly", T2(bx(46, 0.9, 18, { bevel: 0.4 }), { p: [-44, T0 + 0.2, 0] }));
    for (const x of [-60, -28]) k.add("steelWorn", T2(cZ(1.6, -0.5, 0.5, { seg: 12 }), { p: [x, T0 + 0.6, 0], r: [90, 0, 0] }));
  }
  // переводчик огня 18: ось на левом борту сзади, флажок с рифлёным концом
  const s = ctx.kit();
  s.add("steelWorn", cZ(4, -W - 1.2, -W + 0.4, { seg: 20 }));
  s.add("steelWorn", T2(exZ([[-2.4, 0, 1], [2.4, 0, 1], [1.9, -11, 1.4], [-1.9, -11, 1.4]], 1.4, { bevel: 0.4 }), { p: [0, 0, -W - 1.6] }));
  for (let i = 0; i < 3; i++) s.add("steelWorn", T2(bx(3.6, 0.6, 0.5, { bevel: 0.2 }), { p: [0, -7.5 - i * 1.3, -W - 2.4] }));
  const sel = nd("selector", [s.build()], { p: [R4 + 14, 0, 0] });
  // метки: одна точка — одиночный, две — автомат
  for (const [ang, n] of [[0, 1], [-38, 2]]) {
    const r = (ang + 180) * Math.PI / 180, cx0 = R4 + 14 - Math.sin(r) * 14, cy0 = Math.cos(r) * 14;
    for (let i = 0; i < n; i++) k.add("paintWhite", T2(cZ(0.8, -0.3, 0.1, { seg: 10 }), { p: [cx0 + (i - (n - 1) / 2) * 2.4, cy0, -W - 0.1] }));
  }
  // затыльная крышка кожуха с выходом ударника
  k.add("poly", exX(rr(0, -3, 15, 18, 2), R4 - 0.8, R4 + 0.6, { bevel: 0.3 }));
  k.add("lensBlack", T2(cX(1.3, R4 - 1, R4 - 0.6, { seg: 12, c: 0 }), { p: [0, 0, 0] }));
  // прицельные Glock: целик с белым «П» (U-прорезь), мушка с белой точкой; у MOS — высокие под коллиматор
  const tall = o.mos ? 4 : 0, top = SY + tall, nb = top - 3.4;
  const rear = [[-8.4, T0 - 0.2], [8.4, T0 - 0.2], [8.4, top - 1.4, 1], [7.4, top, 0.6], [1.8, top], [1.8, nb, 1.6], [-1.8, nb, 1.6], [-1.8, top], [-7.4, top, 0.6], [-8.4, top - 1.4, 1]];
  k.add("poly", exX(rear, RX - 6, RX + 4, { bevel: 0.5 }));
  k.add("poly", exZ([[RX - 6, T0 - 0.4], [RX + 6, T0 - 0.4], [RX + 4, T0 + 1.6], [RX - 6, T0 + 1.6]], 13, { bevel: 0.3 }));
  if (o.night) {
    for (const z of [-4.4, 4.4]) k.add("tritium", T2(cX(1, RX - 6.4, RX - 5.9, { seg: 12 }), { p: [0, top - 2, z] }));
  } else {
    for (const z of [-2.7, 2.7]) k.add("paintWhite", T2(bx(0.3, 3.6, 0.9), { p: [RX - 6.1, top - 1.8, z] }));
    k.add("paintWhite", T2(bx(0.3, 0.9, 6.3), { p: [RX - 6.1, nb - 0.9, 0] }));
  }
  k.add("poly", exZ([[FX - 3.2, T0 - 0.4], [FX + 3.2, T0 - 0.4], [FX + 2.6, top, 0.8], [FX - 2.8, top, 0.8]], 3.4, { bevel: 0.4 }));
  k.add(o.night ? "tritium" : "paintWhite", T2(cX(1.1, FX - 3.1, FX - 2.6, { seg: 14 }), { p: [0, top - 2, 0] }));
  const root = nd("slide_" + o.id, [k.build(), sel]);
  if (o.mos) root.add(ctx.mount({ id: "mos", type: "mos", p: [-44, T0 - 1.6, 0] }));
  return {
    root,
    irons: { rear: [RX - 2, top - 0.6, 0], front: [FX, top - 0.6, 0], type: "notch" },
    selector: { node: sel, angles: { semi: 0, auto: -38 }, axis: "z" }
  };
}
function glFrame(ctx, k, nodes) {
  const { extrudeX: exX, extrudeZ: exZ, T: T2, box: bx, cylZ: cZ, node: nd, shape: sh, picatinny: pic } = ctx.G;
  const P = "poly", FT = GL.F_TOP, FB = GL.F_TOP - 13;
  // пылезащитная часть рамки под кожухом, направляющие кожуха видны щелью по бортам
  k.add(P, glUV(ctx, exX([[-12.4, FT, 1], [12.4, FT, 1], [12, FB, 3], [-12, FB, 3]], -66, 98, { bevel: 1.4 })));
  for (const s of [-1, 1]) k.add(P, exX([[s * 11.6, FT + 0.4], [s * 12.5, FT + 0.4], [s * 12.5, FT - 2.6], [s * 11.6, FT - 2.6]], -66, 96, { bevel: 0.2 }));
  // спусковая скоба с «крюком» спереди; задняя часть переходит в перемычку к рукояти
  k.add(P, exZ(sh([[37, FB, 1], [-26, FB], [-36, FB - 25, 4], [30, FB - 26, 2], [38, FB - 20, 2], [37.4, FB - 8, 3]], [[[28, FB - 3], [-12, FB - 3], [-17, FB - 20, 4], [26, FB - 21, 2], [29.4, FB - 14, 2]]]), 11, { bevel: 1.4 }));
  k.add(P, exZ([[-12, FB + 1], [-28, FB + 1], [-37, FB - 23, 3], [-17, FB - 19, 5]], 22, { bevel: 3 }));
  for (let i = 0; i < 4; i++) k.add(P, T2(bx(0.8, 1.2, 9, { bevel: 0.3 }), { p: [38.1 - i * 0.12, FB - 10 - i * 2.4, 0] }));
  // рукоять лофтом по оси 22°: почти прямоугольное сечение, три выемки под пальцы (Gen4),
  // «горб» спинки и расширение горловины снизу. Внутри целиком помещается магазин.
  const g = (ly, c, w) => Math.exp(-(((ly - c) / w) ** 2));
  const lys = [-10.4, -16, -22, -28, -32, -35, -38, -41, -44, -48, -52, -55, -58, -61, -64, -68, -72, -75, -78, -81, -85, -90, -95, -99, -101.5, -103];
  const secs = lys.map((ly) => {
    const flare = ly < -92 ? (-92 - ly) / 11 : 0;
    const a = 23.1 - 1.5 * (g(ly, -38, 5.5) + g(ly, -58, 5.5) + g(ly, -78, 5.5)) + 0.3 * (g(ly, -48, 3.5) + g(ly, -68, 3.5)) + 0.7 * flare;
    const a2 = 23.1 + 1.3 * g(ly, -30, 12) + 0.5 * flare;
    const c = glGripPt(-19.9, ly);
    return { c, a, a2, b: 14.7 + 0.8 * flare, k: 3.6, kb: 3 };
  });
  // путь идёт сверху вниз — без flip грани лофта смотрят внутрь и ближняя стенка отсекается
  k.add("polyGrip", ctx.G.loftPath(secs, { seg: 44, flip: true }));
  // хвостовик над перемычкой ладони
  k.add(P, exZ([[-60, FT - 0.2, 1], [-76, FT - 0.6, 2], [-82, FT - 5, 3], [-79, FT - 12, 3], [-66, FT - 12]], 24, { bevel: 2.4 }));
  // кнопка защёлки магазина (слева), рычаг затворной задержки, рычаг разборки, три штифта
  k.add("poly", exZ([[-19, FB - 1.5, 0.6], [-28, FB - 1.5, 0.6], [-27, FB - 7.5, 1], [-20.5, FB - 7.5, 1]], 2.4, { bevel: 0.5, z: -12.2 }));
  k.add("steelMatte", exZ([[-40, FT - 0.6], [-18, FT - 0.6], [-15, FT - 3.6, 1], [-24, FT - 4, 1], [-40, FT - 3]], 1.4, { bevel: 0.3, z: -13.2 }));
  for (const s of [-1, 1]) {
    k.add("steelMatte", exZ([[1, FT - 1.2], [12, FT - 1.2], [12, FT - 4, 0.6], [1, FT - 4, 0.6]], 1, { bevel: 0.2, z: s * 12.9 }));
    for (let i = 0; i < 4; i++) k.add("steelMatte", T2(bx(0.5, 2.4, 0.4), { p: [3 + i * 2.4, FT - 2.6, s * 13.5] }));
  }
  for (const [x, y] of [[13, FT - 6], [-8, FT - 8], [-58, FT - 6]]) for (const s of [-1, 1]) k.add("steelWorn", T2(cZ(1.6, 0, 0.5, { seg: 10 }), { p: [x, y, s > 0 ? 12.2 : -12.7] }));
  // пластина с номером под пылезащитной частью
  k.add("steelWorn", T2(bx(12, 0.5, 7, { bevel: 0.2 }), { p: [44, FB - 0.1, 0] }));
  // рельс рамки: один паз (Universal Glock Rail)
  const r = pic(26, { base: 4 });
  k.add(P, r.geo, { r: [180, 0, 0], p: [58, FB, 0] });
  const rail = ctx.railMount("frameRail", [58 + r.first, FB, 0], "bottom", r.slots, { axis: "bottom" });
  // спусковой крючок с предохранительной клавишей посередине
  const t = ctx.kit();
  t.add(P, exZ([[-2, 2], [3, 2], [3, -6, 2], [1, -15, 4], [-3, -18, 2], [-5, -16], [-2, -7, 3]], 6, { bevel: 0.9 }));
  t.add(P, exZ([[-0.4, -3], [1.8, -3], [0.8, -14, 1], [-1.2, -14, 1]], 2.2, { bevel: 0.3 }));
  t.add("steelWorn", T2(bx(4, 1.2, 1.4), { p: [0, 2.4, 0] }));
  nodes.trigger = nd("trigger", [t.build()], { p: [4, FB, 0] });
  return [nodes.trigger, rail];
}
function glBase(ctx) {
  const { node: nd } = ctx.G;
  const k = ctx.kit();
  const nodes = {};
  const extra = glFrame(ctx, k, nodes);
  const body = k.build("frame");
  const { mount: mount2 } = ctx;
  // кожух-затвор — «рама»: движется при выстреле и остаётся на задержке
  nodes.carrier = nd("slide", [mount2({ id: "slide", type: "slide", p: [0, 0, 0] })]);
  const root = nd("glock18c", [body, ...extra, nodes.carrier]);
  root.add(mount2({ id: "barrel", type: "barrel", p: [0, 0, 0] }));
  const mw = mount2({ id: "magwell", type: "magwell", p: [GL.MAG[0], GL.MAG[1], 0] });
  mw.rotation.z = -GL.GRIP_A * Math.PI / 180;
  root.add(mw);
  // накладка и упор строятся сразу в координатах пистолета (по линии спинки рукояти)
  root.add(mount2({ id: "backstrap", type: "backstrap", p: [0, 0, 0] }));
  root.add(mount2({ id: "stock", type: "stock", p: [0, 0, 0] }));
  return {
    root,
    nodes,
    anim: { carrierTravel: 56, triggerAngle: 0.28 },
    eject: { p: [12, 4, 14], dir: [0.1, 0.8, 1], speed: 3 },
    muzzle: [GL.S_FRONT, 0, 0],
    eyeX: -560,
    pivotX: -80,
    focus: { center: [10, -48, 0], size: 330 }
  };
}
/* --------------------------------------------------------------- стволы */
function glBarrel(ctx, o) {
  const { latheX: lX, extrudeX: exX, T: T2, box: bx, node: nd, ringGrooves: rg, rrect: rr } = ctx.G;
  const k = ctx.kit();
  const L = o.threaded ? 128 : 114, th = o.threaded ? 16 : 0, B = "steelPark";
  // худ (прямоугольный прилив патронника) заполняет окно выброса, верх чуть ниже крыши кожуха
  k.add(B, exX(rr(0, 1, 15.4, 16.4, 1.6), GL.PORT[0], 34, { bevel: 0.6 }));
  k.add(B, lX([[33, 0], [33, 8.2], [38, 7.4], [L - th, 7.1], [L - th, 0]], { seg: 28 }));
  if (o.threaded) k.add(B, rg(6.6, L - th, L, 10, 0.35, { seg: 24 }));
  // срез ствола и канал
  k.add(B, T2(lX([[0, 3.6], [0, 6.4], [0.6, 7], [0.6, 3.6]], { seg: 24 }), { p: [L - 0.6, 0, 0] }));
  k.add("lensBlack", T2(lX([[0, 0], [0, 4.6], [0.4, 4.6], [0.4, 0]], { seg: 20 }), { p: [L - 0.7, 0, 0] }));
  // порты компенсатора (видны в окне кожуха)
  if (o.comp) for (const x of [GL.COMP[0] + 7, GL.COMP[0] + 19]) k.add("lensBlack", T2(bx(6.5, 0.8, 4.4, { bevel: 0.3 }), { p: [x, 6.9, 0] }));
  const out = { root: nd("barrel", [k.build()]) };
  // газ уходит вверх через порты ствола и окно кожуха — картина выстрела как у компенсатора
  if (o.comp) out.muzzleKind = "comp";
  if (o.threaded) out.root.add(ctx.mount({ id: "muzzle", type: "thread", p: [L - th, 0, 0] }));
  return out;
}
/* --------------------------------------------------------------- дульные */
function osprey(ctx) {
  const { extrudeX: exX, latheX: lX, T: T2, box: bx, node: nd, cylX: cX, rrect: rr } = ctx.G;
  const k = ctx.kit();
  const L = 170;
  // SilencerCo Osprey 9: эксцентричный корпус (ось ниже канала), видны штатные прицельные
  k.add("steelMatte", lX([[0, 0], [0, 8.4], [18, 8.4], [18, 0]], { seg: 28 }));
  k.add("alu", exX(rr(0, -7, 34, 38, 12), 12, L, { bevel: 2 }));
  for (const x of [40, 110]) k.add("alu", exX(rr(0, -7, 35, 39, 12.5), x, x + 3, { bevel: 0.6 }));
  k.add("lensBlack", cX(5, L - 0.3, L + 0.3, { seg: 18 }));
  return { root: nd("osprey", [k.build()]), muzzle: { x: L, kind: "supp", flash: 0.03 } };
}
function obsidian(ctx) {
  const { latheX: lX, node: nd, cylX: cX, ringGrooves: rg, tubeX: tb } = ctx.G;
  const k = ctx.kit();
  const L = 190, R4 = 17.5;
  k.add("steelMatte", lX([[0, 0], [0, 8.4], [30, 8.4], [30, 0]], { seg: 28 }));
  k.add("steelMatte", lX([[4, 0], [4, R4 - 3], [8, R4], [L - 5, R4], [L, R4 - 4], [L, 5.6], [L - 2, 5], [L - 2, 0]], { seg: 44, crease: 30 }));
  k.add("steelMatte", rg(R4 + 0.3, 8, 28, 7, 0.5, { seg: 44 }));
  k.add("steelMatte", tb(R4 + 0.6, R4 - 0.2, L - 40, L - 36, { seg: 44 }));
  k.add("lensBlack", cX(5.2, L - 2.3, L + 0.05, { seg: 18 }));
  return { root: nd("obsidian", [k.build()]), muzzle: { x: L, kind: "supp", flash: 0.03 } };
}
function glComp(ctx) {
  const { extrudeX: exX, T: T2, box: bx, node: nd, rrect: rr, cylY: cY } = ctx.G;
  const k = ctx.kit();
  // навинчиваемый компенсатор в профиль кожуха (не закрывает мушку)
  k.add("steelMatte", exX(rr(0, -3.8, 25, 28.5, 5), 0, 34, { bevel: 1.4 }));
  for (let i = 0; i < 3; i++) k.add("lensBlack", T2(cY(3, 9, 10.7, { seg: 14 }), { p: [8 + i * 9, 0, 0] }));
  for (const s of [-1, 1]) k.add("lensBlack", T2(bx(10, 7, 1, { bevel: 0.6 }), { p: [18, 1, s * 12.6] }));
  k.add("lensBlack", ctx.G.cylX(5, 33.8, 34.2, { seg: 16 }));
  return { root: nd("comp", [k.build()]), muzzle: { x: 34, kind: "comp", flash: 0.8 } };
}
function glCap(ctx) {
  const { latheX: lX, flutesX: fl, node: nd } = ctx.G;
  const k = ctx.kit();
  k.add("steelMatte", lX([[0, 0], [0, 8.6], [14, 8.6], [16, 7.4], [16, 0]], { seg: 28 }));
  k.add("steelMatte", fl(8.6, 2, 14, 14, 1.2, 0.5));
  return { root: nd("cap", [k.build()]), muzzle: { x: 16, kind: "bare", flash: 1 } };
}
/* --------------------------------------------------------------- магазины */
function glMag(ctx, o) {
  const { T: T2, box: bx, cylX: cX } = ctx.G;
  const m = boxMag(ctx, { R: 0, d0: 34, w: 22, lipH: 10, lipX0: 4, lipX1: 26, lipRise: 2.4, lipCurl: 2, cal: "9x19", mat: "poly", plate: "poly", plateH: 7, plateOver: 7, plateW: 5, catchX: -22, catchY: -30, ...o });
  const k = ctx.kit();
  // пронумерованные контрольные отверстия на задней стенке и выступ-«язычок» пятки спереди
  for (let i = 0; i < Math.min(9, Math.floor(o.len / 20)); i++) k.add("lensBlack", T2(cX(1.2, -34.4, -33.7, { seg: 10, c: 0 }), { p: [0, -16 - i * 11, 0] }));
  for (let i = 0; i < Math.min(9, Math.floor(o.len / 20)); i++) k.add("paintWhite", T2(bx(0.3, 1.6, 1), { p: [-34.1, -16 - i * 11, 4] }));
  k.add("poly", T2(bx(4, 3.4, 20, { bevel: 1 }), { p: [4.4, -o.len - 3.6, 0] }));
  m.root.add(k.build());
  return m;
}
/* --------------------------------------------------------------- накладки и упор */
// Накладка спинки: профиль по линии спинки рукояти (lx = −43), t — толщина.
function backstrap(ctx, o) {
  const { extrudeZ: exZ, node: nd } = ctx.G;
  const k = ctx.kit(), t = o.t, Q = (lx, ly, r) => [...glGripPt(lx, ly), r];
  const prof = [Q(-41, -11, 1), Q(-43 - t * 0.5, -11.5, 2), Q(-43 - t, -22, 5), Q(-43 - t, -84, 6), Q(-43 - t * 0.6, -97, 3), Q(-41, -98, 1)];
  k.add(o.mat || "poly", exZ(prof, 27, { bevel: Math.min(3, t * 0.45), curve: 6 }));
  return { root: nd("bs", [k.build()]) };
}
function g18Stock(ctx) {
  const { extrudeZ: exZ, T: T2, wire: wr, node: nd, cylZ: cZ } = ctx.G;
  const k = ctx.kit(), Q = (lx, ly) => glGripPt(lx, ly);
  // плечевой упор Glock 18: переходник входит в паз пятки рукояти, стальная рама, пластиковый затыльник
  k.add("steelMatte", exZ([Q(-41, -72), Q(-56, -72), Q(-56, -101), Q(-41, -101)], 20, { bevel: 1.4 }));
  k.add("steelWorn", T2(cZ(2.4, -11, 11, { seg: 12 }), { p: [...Q(-50, -86), 0] }));
  const [ax, ay] = Q(-54, -75), [bx0, by0] = Q(-52, -99);
  for (const s of [-1, 1]) k.add("steelMatte", wr([[ax, ay, s * 8], [-180, -34, s * 11], [-284, 6, s * 12]], 3, { n: 40 }));
  k.add("steelMatte", wr([[bx0, by0, 0], [-190, -100, 0], [-284, -98, 0]], 3, { n: 40 }));
  k.add("poly", exZ([[-278, 16, 6], [-296, 16, 6], [-296, -112, 8], [-278, -106, 6]], 38, { bevel: 3 }));
  k.add("rubber", exZ([[-296, 16, 6], [-302, 16, 6], [-302, -114, 8], [-296, -112, 6]], 40, { bevel: 2 }));
  return { root: nd("g18stock", [k.build()]) };
}
var glock18c_default = {
  id: "glock18c",
  family: "glock",
  title: "Glock 18C",
  short: "Glock 18C",
  caliber: "9×19 Парабеллум",
  cal: "9x19",
  thread: "m13.5x1L",
  boltHold: true,
  chargeLabel: "передёрнуть кожух",
  kick: 1.05,
  hipMoa: 45,
  flashSize: 0.62,
  specs: [["Ствол", "114 мм"], ["Длина", "186 мм"], ["Темп", "1200 выстр/мин"], ["Масса", "0,62 кг"]],
  base: { weight: 620, length: 186, ergo: 72, recoilV: 100, recoilH: 85, moa: 4.5, velocity: 360, range: 50, loud: 160, flash: 55, adsTime: 170, rpm: 1200, mag: 17 },
  audio: { cal: "9x19", mech: 0.85, shot: { blastF: 8200, blastT: 0.045, bodyF: 190, body: 0.4, harsh: 0.22, level: 0.9 } },
  modes: ["semi", "auto"],
  build: glBase,
  slots: [
    { id: "slide", label: "Кожух-затвор", group: "Верх", accepts: ["g18slide"], mount: "slide", required: true },
    { id: "barrel", label: "Ствол", group: "Верх", accepts: ["g18barrel"], mount: "barrel", required: true },
    // резьба есть только у отдельного ствола: слот виден всегда, выбор глушителя сам ставит этот ствол
    { id: "muzzle", label: "Дульное устройство", group: "Верх", accepts: ["muzzle"], mount: "muzzle", via: { slot: "barrel", part: "br_thread" } },
    { id: "optic", label: "Коллиматор", group: "Верх", accepts: ["micro"], mount: "mos" },
    { id: "light", label: "Фонарь / ЛЦУ", group: "Рамка", accepts: ["plight"], rails: ["frameRail"], prefer: "front" },
    { id: "mag", label: "Магазин", group: "Рамка", accepts: ["mag"], mount: "magwell" },
    { id: "backstrap", label: "Накладка рукояти", group: "Рамка", accepts: ["g18bs"], mount: "backstrap" },
    { id: "stock", label: "Плечевой упор", group: "Рамка", accepts: ["g18stock"], mount: "stock" }
  ],
  parts: [
    { id: "sl_18c", cat: "g18slide", name: "Кожух 18C", desc: "Два компенсаторных окна над портами ствола", stats: { weight: 290 }, build: (c) => glSlide(c, { id: "18c", comp: true }) },
    { id: "sl_mos", cat: "g18slide", name: "Кожух 18C MOS", desc: "Фрезеровка под коллиматор, высокие прицельные", stats: { weight: 285 }, build: (c) => glSlide(c, { id: "mos", comp: true, mos: true }) },
    { id: "sl_night", cat: "g18slide", name: "Кожух 18, тритиевые прицельные", desc: "Без окон; Meprolight 3 точки, насечки спереди", stats: { weight: 300, flash: -10 }, build: (c) => glSlide(c, { id: "night", night: true, frontSerr: true }) },
    { id: "br_comp", cat: "g18barrel", name: "Ствол 18C с портами", desc: "Газ вверх через окна: меньше подброс", needs: (cfg) => cfg.slide?.id !== "sl_night", stats: { weight: 110, "recoilV%": -16, flash: 15, loud: 1 }, build: (c) => glBarrel(c, { comp: true }) },
    { id: "br_plain", cat: "g18barrel", name: "Ствол без портов", desc: "Штатный Glock 17: чуть выше скорость пули", stats: { weight: 115, velocity: 8 }, build: (c) => glBarrel(c, {}) },
    { id: "br_thread", cat: "g18barrel", name: "Ствол с резьбой M13,5×1 лев.", desc: "Выступает на 14 мм — под глушитель и компенсатор", stats: { weight: 130, length: 14, velocity: 10 }, build: (c) => glBarrel(c, { threaded: true }) },
    { id: "g_cap", cat: "muzzle", name: "Колпачок резьбы", desc: "Защищает резьбу", fit: { thread: ["m13.5x1L"] }, stats: { weight: 10, length: 2 }, build: glCap },
    { id: "g_comp", cat: "muzzle", name: "Навинчиваемый компенсатор", desc: "Три порта вверх: очередь заметно ровнее", fit: { thread: ["m13.5x1L"] }, stats: { weight: 55, length: 34, "recoilV%": -24, "recoilH%": -10, flash: 20, loud: 3 }, build: glComp },
    { id: "osprey9", cat: "muzzle", name: "SilencerCo Osprey 9", desc: "Эксцентричный: штатные прицельные не перекрыты", fit: { thread: ["m13.5x1L"] }, stats: { weight: 300, length: 170, loud: -26, flash: -50, "recoilV%": -10, ergo: -8, adsTime: 20 }, build: osprey },
    { id: "obsidian9", cat: "muzzle", name: "Rugged Obsidian 9", desc: "Разборный, с «толкателем» Ноилсона", fit: { thread: ["m13.5x1L"] }, stats: { weight: 320, length: 190, loud: -28, flash: -50, "recoilV%": -9, ergo: -9, adsTime: 22 }, build: obsidian },
    { id: "gm17", cat: "mag", name: "Магазин 17", desc: "Штатный, полимер со стальным вкладышем", stats: { weight: 80, mag: 17 }, build: (c) => glMag(c, { len: 104, cap: 17 }) },
    { id: "gm19", cat: "mag", name: "Магазин 19 (пятка +2)", desc: "Штатный 17 с удлинённой пяткой", stats: { weight: 90, mag: 19, ergo: 0 }, build: (c) => glMag(c, { len: 116, cap: 19 }) },
    { id: "gm33", cat: "mag", name: "Магазин 33", desc: "Длинный штатный Glock: для автоматического огня", stats: { weight: 150, mag: 33, ergo: -4, adsTime: 10 }, build: (c) => glMag(c, { len: 196, cap: 33 }) },
    { id: "gdrum50", cat: "mag", name: "Барабан KCI 50", desc: "Тяжёлый: пистолет тянет вниз", stats: { weight: 520, mag: 50, ergo: -14, adsTime: 34, "recoilV%": -10 }, build: (c) => drumMag(c, { R: 0, len: 104, neck: 58, d0: 34, w: 22, lipH: 10, lipX0: 4, lipX1: 26, cal: "9x19", mat: "poly", cap: 50, drum: [-18, -86, 46, 46] }) },
    { id: "bs_m", cat: "g18bs", name: "Накладка M", desc: "Спинка рукояти +2 мм", stats: { weight: 6, ergo: 2 }, build: (c) => backstrap(c, { t: 2.4 }) },
    { id: "bs_l", cat: "g18bs", name: "Накладка L с «хвостом»", desc: "+4 мм, для большой ладони", stats: { weight: 10, ergo: 1, "recoilH%": -3 }, build: (c) => backstrap(c, { t: 4.6 }) },
    { id: "st_g18", cat: "g18stock", name: "Упор Glock 18 (рамочный)", desc: "Три точки опоры — очередь можно удержать", stats: { weight: 380, ergo: -6, "recoilV%": -38, "recoilH%": -40, adsTime: 60, moa: -1 }, build: g18Stock }
  ],
  defaults: {
    slide: "sl_18c",
    barrel: "br_comp",
    muzzle: null,
    optic: null,
    light: null,
    mag: "gm17",
    backstrap: null,
    stock: null
  }
};


export { glock18c_default as def };
