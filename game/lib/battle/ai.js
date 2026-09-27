/* ============================================================================
   Искусственный интеллект бойцов и генералов.

   Отряд = генерал + его бойцы. Режимы отряда:
     follow  — бойцы идут за лидером врассыпную (кольца 5,5–10,5 м, без
               сектора перед лидером — не перекрывают ему огонь);
     defend  — бойцы рассредоточены по укрытиям вокруг своего флага;
     recon   — «виртуальный лидер» ведёт группу по полю расстояний к флагу
               противника (когда штурмовой отряд уничтожен).
   Боец думает раз в 0,25–0,4 с (восприятие, выбор состояния), а движение и
   наведение считаются каждый кадр.
   ========================================================================== */
import { clamp, lerp, rand, gauss, yawTo, fwdX, fwdZ, angleTo, dampAngle, damp } from './util.js';

const DEG = Math.PI / 180;
export const SPEED = { walk: 1.45, jog: 3.4, sprint: 5.3, crouch: 1.05 };

export function makeBrain(u) {
  return {
    state: 'idle', thinkT: rand(0, 0.4),
    target: null, spot: 0, spotId: 0, seen: false, lastSeenT: -99, lastKnown: null,
    path: null, pathI: 0, goal: null, goalKind: '', repathT: 0,
    cover: null, coverT: 0, move: 'walk',
    errY: 0, errP: 0, onT: 0, burst: 0, gapT: 0,
    stuckT: 0, lastX: u.pos.x, lastZ: u.pos.z,
    alertT: 0, alertYaw: 0, scanT: rand(1, 4), scanYaw: u.yaw, baseYaw: u.yaw,
    slotA: 0, slotR: 7, defendPt: null, swapT: rand(30, 70), fleeT: 0,
    nadeT: rand(4, 10), resupT: 0
  };
}

/* ------------------------------------------------------------ отряды -- */
export function assignFollowSlots(squad) {
  const bots = squad.bots, n = bots.length;
  bots.forEach((b, i) => {
    const u = (i + 0.5) / n;
    b.brain.slotA = (38 + 284 * u) * DEG + gauss() * 6 * DEG;
    b.brain.slotR = (i % 2 ? rand(8.3, 10.5) : rand(5.4, 7.4));
  });
}

export function assignDefendPoints(B, squad) {
  const team = squad.team, flag = B.flags[team].pos, enemyFlag = B.flags[B.enemyOf(team)].pos;
  const small = B.rules.navCell < 1;
  const ex = enemyFlag.x - flag.x, ez = enemyFlag.z - flag.z, el = Math.hypot(ex, ez) || 1;
  const ux = ex / el, uz = ez / el;
  const cands = [];
  B.nav.coverNear(flag.x, flag.z, small ? 22 : 42, (p) => {
    const d = Math.hypot(p.x - flag.x, p.z - flag.z);
    if (d < (small ? 2.5 : 7)) return;
    const face = p.nx * ux + p.nz * uz;
    cands.push({ p, score: face * 2 + (p.h > 1.4 ? 0.6 : 0) - Math.abs(d - (small ? 10 : 18)) * 0.03 + rand(0, 0.8) });
  });
  cands.sort((a, b) => b.score - a.score);
  const chosen = [];
  const minSep = small ? 2.6 : 5;
  for (const c of cands) {
    if (chosen.length >= squad.bots.length + 3) break;
    if (chosen.every((q) => (q.x - c.p.x) ** 2 + (q.z - c.p.z) ** 2 > minSep * minSep)) chosen.push(c.p);
  }
  for (let k = 0; chosen.length < squad.bots.length + 1 && k < 120; k++) {
    const a = rand(0, Math.PI * 2), r = rand(small ? 3 : 8, small ? 14 : 30);
    const x = flag.x + Math.cos(a) * r, z = flag.z + Math.sin(a) * r;
    if (!B.nav.walkableAt(x, z)) continue;
    if (chosen.every((q) => (q.x - x) ** 2 + (q.z - z) ** 2 > minSep * minSep))
      chosen.push({ x, z, nx: Math.cos(a), nz: Math.sin(a), h: 0, taken: null, ring: true });
  }
  squad.defendPts = chosen;
  squad.bots.forEach((b, i) => { b.brain.defendPt = chosen[i % Math.max(1, chosen.length)] || null; });
  if (squad.general && !squad.general.isPlayer) squad.general.brain.defendPt = chosen[chosen.length - 1] || { x: flag.x + 3, z: flag.z + 3, h: 0 };
}

/* Лидер отряда: генерал, либо «виртуальная» точка, если его нет в живых. */
export function leaderOf(B, squad) {
  const g = squad.general;
  if (squad.mode === 'recon') return squad.virt;
  if (g && g.alive) return g;
  return squad.virt;
}

export function updateSquad(B, squad, dt) {
  const g = squad.general;
  const alive = squad.bots.filter((b) => b.alive);
  squad.aliveCount = alive.length + (g && g.alive ? 1 : 0);
  const L = leaderOf(B, squad);
  if (L) {
    const sp = Math.hypot(L.vel.x, L.vel.z);
    if (sp > 0.5) squad.heading = dampAngle(squad.heading, yawTo(L.vel.x, L.vel.z), 3, dt);
    else if (L === g && g.isPlayer) squad.heading = dampAngle(squad.heading, g.aimYaw, 0.5, dt);
    squad.leaderStill = sp > 0.5 ? 0 : squad.leaderStill + dt;
  }
  const v = squad.virt;
  if (!g || !g.alive || squad.mode === 'recon') {
    if (!v.init) { v.pos.copy(g ? g.pos : B.flags[squad.team].pos); v.init = true; }
    const advance = squad.mode === 'recon' || (g && !g.isPlayer && squad.mode === 'follow');
    v.vel.set(0, 0, 0);
    if (advance) {
      v.wait = Math.max(0, v.wait - dt);
      const contact = B.time - squad.contactT < 8;
      if (!contact && v.wait <= 0) {
        const nxt = B.nav.flowAhead(B.flow[B.enemyOf(squad.team)], v.pos.x, v.pos.z, 4);
        if (nxt && nxt.left > 6) {
          const dx = nxt.x - v.pos.x, dz = nxt.z - v.pos.z, d = Math.hypot(dx, dz) || 1;
          v.vel.set(dx / d * 1.6, 0, dz / d * 1.6);
          const s = Math.min(d, 1.6 * dt);
          v.pos.x += dx / d * s; v.pos.z += dz / d * s;
        }
        const far = alive.filter((b) => Math.hypot(b.pos.x - v.pos.x, b.pos.z - v.pos.z) > 18).length;
        if (alive.length && far / alive.length > 0.5) v.wait = 3;
      }
    }
  } else { v.pos.copy(g.pos); v.vel.copy(g.vel); v.init = true; }
}

/* ----------------------------------------------------------- восприятие -- */
function perceive(B, u, br, dtThink) {
  const vis0 = B.A.visibility ? B.A.visibility() : 1;
  const R = B.rules.visRange * vis0;
  const enemies = [];
  B.hash.query(u.pos.x, u.pos.z, R, (o) => {
    if (o.team === u.team || !o.alive) return;
    const d2 = (o.pos.x - u.pos.x) ** 2 + (o.pos.z - u.pos.z) ** 2;
    if (d2 < R * R) enemies.push([o, d2]);
  });
  br.seen = false;
  if (!enemies.length) { br.spot = Math.max(0, br.spot - dtThink); return; }
  enemies.sort((a, b) => a[1] - b[1]);
  if (br.target && br.target.alive) {
    const i = enemies.findIndex((e) => e[0] === br.target);
    if (i > 0) enemies.unshift(enemies.splice(i, 1)[0]);
  }
  const eye = B.tmp.eye, tp = B.tmp.tp;
  u.eye(eye);
  let checks = 0;
  for (const [o, d2] of enemies) {
    if (checks >= 2) break;
    const d = Math.sqrt(d2);
    const off = Math.abs(angleTo(u.aimYaw, yawTo(o.pos.x - u.pos.x, o.pos.z - u.pos.z)));
    const fov = (br.alertT > 0 || br.state === 'engage' ? 75 : 58) * DEG;
    if (off > fov && d > 7) continue;
    checks++;
    o.chest(tp);
    const vis = B.los(eye, tp, u, o);
    if (vis === null) return;
    if (!vis || u.blind > 0.3) continue;
    if (o === br.target) { br.seen = true; br.lastSeenT = B.time; br.lastKnown = o.pos.clone(); return; }
    let rate = clamp(55 / (d + 8), 0.35, 5);
    if (o.moving()) rate *= 1.5;
    if (o.crouch > 0.5) rate *= 0.65;
    if (B.time - o.lastShotT < 1.5) rate *= 2.6;
    if (br.alertT > 0) rate *= 1.5;
    rate *= vis0;
    if (br.spotId !== o.id) { br.spotId = o.id; br.spot = 0; }
    br.spot += rate * dtThink;
    if (br.spot >= 1 || d < 4) {
      br.target = o; br.seen = true; br.lastSeenT = B.time; br.lastKnown = o.pos.clone();
      br.onT = 0; br.errY = gauss() * 4 * DEG; br.errP = gauss() * 2.5 * DEG;
      if (u.squad) { u.squad.contactT = B.time; u.squad.contact = o.pos.clone(); }
    }
    return;
  }
}

/* --------------------------------------------------------- путь и цель -- */
function setGoal(B, u, br, x, z, kind, move) {
  if (move) br.move = move;
  if (br.goal && br.goalKind === kind && (br.goal.x - x) ** 2 + (br.goal.z - z) ** 2 < 2.2 && br.path) return;
  const d = Math.hypot(x - u.pos.x, z - u.pos.z);
  br.goal = { x, z }; br.goalKind = kind;
  if (d < 0.6) { br.path = null; return; }
  if (B.nav.lineClear(u.pos.x, u.pos.z, x, z)) { br.path = [{ x, z }]; br.pathI = 0; return; }
  if (B.pathBudget <= 0) { br.path = null; br.goal = null; return; }
  B.pathBudget--;
  br.path = B.nav.findPath(u.pos.x, u.pos.z, x, z, d > 80 ? 14000 : 5000);
  br.pathI = 0;
}
function clearGoal(br) { br.path = null; br.goal = null; br.goalKind = ''; }

function findCover(B, u, threat, radius) {
  let best = null, bs = -1e9;
  const tx = threat ? threat.x : u.pos.x + fwdX(u.aimYaw) * 20, tz = threat ? threat.z : u.pos.z + fwdZ(u.aimYaw) * 20;
  const dtx = tx - u.pos.x, dtz = tz - u.pos.z, dl = Math.hypot(dtx, dtz) || 1;
  B.nav.coverNear(u.pos.x, u.pos.z, radius, (p) => {
    if (p.taken && p.taken !== u && p.taken.alive) return;
    const px = tx - p.x, pz = tz - p.z, pl = Math.hypot(px, pz) || 1;
    const face = (p.nx * px + p.nz * pz) / pl;
    if (face < 0.35) return;
    const d = Math.hypot(p.x - u.pos.x, p.z - u.pos.z);
    const toward = ((p.x - u.pos.x) * dtx + (p.z - u.pos.z) * dtz) / (dl * (d || 1));
    const s = face * 2 + (p.h > 1.3 ? 0.5 : 0) - d * 0.12 - Math.max(0, toward) * 0.8 + rand(0, 0.3);
    if (s > bs) { bs = s; best = p; }
  });
  return best;
}
function takeCover(B, u, br, threat, radius) {
  const c = findCover(B, u, threat, radius);
  if (!c) return false;
  if (br.cover && br.cover.taken === u) br.cover.taken = null;
  br.cover = c; c.taken = u;
  br.coverT = rand(3, 7);
  setGoal(B, u, br, c.x, c.z, 'cover', 'sprint');
  br.state = 'cover';
  return true;
}

/* -------------------------------------------------------------- решение -- */
export function think(B, u, dtThink) {
  const br = u.brain, sq = u.squad;
  perceive(B, u, br, dtThink);
  if (br.target && !br.target.alive) { br.target = null; br.seen = false; }
  const since = B.time - br.lastSeenT;

  const nade = B.combat.nadeNear(u.pos, 7.5);
  if (nade && u.blind < 0.3 && br.state !== 'flee' && Math.random() < 0.85) {
    const dx = u.pos.x - nade.pos.x, dz = u.pos.z - nade.pos.z, d = Math.hypot(dx, dz) || 1;
    br.state = 'flee'; br.fleeT = 2.5;
    setGoal(B, u, br, u.pos.x + dx / d * 9, u.pos.z + dz / d * 9, 'flee', 'sprint');
    return;
  }
  if (br.state === 'flee' && br.fleeT > 0) return;
  if (u.blind > 0.4) { br.state = 'blind'; clearGoal(br); u.wantCrouch = 1; return; }

  const leader = sq ? leaderOf(B, sq) : null;
  const ordered = !!u.order;

  if (br.target && since < 0.8) {
    br.state = 'engage';
    const d = Math.hypot(br.target.pos.x - u.pos.x, br.target.pos.z - u.pos.z);
    const exposed = !br.cover || Math.hypot(br.cover.x - u.pos.x, br.cover.z - u.pos.z) > 1.5;
    if ((u.suppress > 0.55 || u.gun.reloadT > 0) && exposed && takeCover(B, u, br, br.target.pos, 14)) return;
    u.wantCrouch = (d > 22 || u.gun.reloadT > 0 || u.suppress > 0.4) ? 1 : 0;
    if (!ordered && leader && sq.mode !== 'defend' && Math.hypot(leader.pos.x - u.pos.x, leader.pos.z - u.pos.z) > 32) {
      br.state = 'move'; br.target = null;
    } else { clearGoal(br); return; }
  }

  if (br.target && since < 7 && br.lastKnown) {
    br.alertT = 3; br.alertYaw = yawTo(br.lastKnown.x - u.pos.x, br.lastKnown.z - u.pos.z);
    const d = Math.hypot(br.lastKnown.x - u.pos.x, br.lastKnown.z - u.pos.z);
    if (u.grenades.m67 > 0 && since > 1.5 && d > 11 && d < 32 && br.nadeT <= 0 && (!sq || B.time - sq.nadeT > 7) && Math.random() < 0.4) {
      B.combat.throwGrenade(u, 'm67', br.lastKnown);
      br.nadeT = rand(12, 25); if (sq) sq.nadeT = B.time;
    }
  } else if (since >= 7) br.target = null;

  if (u.suppress > 0.5 && br.state !== 'cover' && u.threat && takeCover(B, u, br, u.threat, 12)) return;
  if (br.state === 'cover') {
    br.coverT -= dtThink;
    const at = br.cover && Math.hypot(br.cover.x - u.pos.x, br.cover.z - u.pos.z) < 1.2;
    if (at) { u.wantCrouch = 1; clearGoal(br); }
    if (br.coverT > 0 || (br.path && !at)) return;
    br.state = 'idle';
  }

  if (!br.target && u.gun.reserve < u.gun.mag && B.A.resupply.length) {
    let best = null, bd = 1e9;
    for (const c of B.A.resupply) { const d = Math.hypot(c.x - u.pos.x, c.z - u.pos.z); if (d < bd) { bd = d; best = c; } }
    if (best && bd < 140) {
      br.state = 'resupply';
      if (bd < (best.r || 3) + 0.5) {
        clearGoal(br); br.resupT += dtThink;
        if (br.resupT > 2.2) { u.restock(); br.resupT = 0; br.state = 'idle'; }
      } else setGoal(B, u, br, best.x, best.z, 'resupply', 'jog');
      return;
    }
  }

  if (ordered) {
    const o = u.order, d = Math.hypot(o.x - u.pos.x, o.z - u.pos.z);
    if (d > 2.5 && !o.arrived) { br.state = 'move'; setGoal(B, u, br, o.x, o.z, 'order', d > 25 ? 'sprint' : 'jog'); }
    else {
      if (!o.arrived) {
        o.arrived = true;
        const c = findCover(B, u, o.face || null, 5);
        if (c) { if (br.cover && br.cover.taken === u) br.cover.taken = null; br.cover = c; c.taken = u; setGoal(B, u, br, c.x, c.z, 'order', 'jog'); return; }
      }
      if (!br.path || br.pathI >= br.path.length) { br.state = 'idle'; u.wantCrouch = 1; }
      scan(B, u, br, dtThink, br.baseYaw);
    }
    return;
  }

  if (u.role === 'general' && !u.isPlayer) return thinkGeneral(B, u, br, dtThink);
  if (!sq) return;
  if (sq.mode === 'defend') return thinkDefend(B, u, br, sq, dtThink);
  return thinkFollow(B, u, br, sq, leader, dtThink);
}

function scan(B, u, br, dt, around) {
  br.scanT -= dt;
  if (br.alertT > 0) { br.scanYaw = br.alertYaw; return; }
  if (br.scanT <= 0) { br.scanT = rand(2, 5); br.scanYaw = around + gauss() * 45 * DEG; }
}

function thinkDefend(B, u, br, sq, dt) {
  let p = br.defendPt;
  br.swapT -= dt;
  if (br.swapT <= 0 && sq.defendPts && sq.defendPts.length > sq.bots.length) {
    br.swapT = rand(35, 80);
    const free = sq.defendPts.filter((q) => !sq.bots.some((b) => b !== u && b.alive && b.brain.defendPt === q));
    if (free.length) p = br.defendPt = free[Math.floor(Math.random() * free.length)];
  }
  if (!p) return;
  const d = Math.hypot(p.x - u.pos.x, p.z - u.pos.z);
  if (d > 1.5) { br.state = 'move'; setGoal(B, u, br, p.x, p.z, 'defend', d > 20 ? 'jog' : 'walk'); u.wantCrouch = 0; return; }
  br.state = 'idle'; clearGoal(br);
  if (p.h && p.h < 1.5) u.wantCrouch = 1;
  else if (Math.random() < 0.03) u.wantCrouch = 1 - u.wantCrouch;
  const out = p.nx !== undefined ? yawTo(p.nx, p.nz) : br.baseYaw;
  br.baseYaw = out;
  scan(B, u, br, dt, out);
}

function thinkFollow(B, u, br, sq, L, dt) {
  if (!L) return;
  const still = sq.leaderStill > 2.5;
  const a = sq.heading + br.slotA;
  let sx = L.pos.x + fwdX(a) * br.slotR, sz = L.pos.z + fwdZ(a) * br.slotR;
  if (!B.nav.walkableAt(sx, sz)) { const i = B.nav.nearest(sx, sz, 6); if (i >= 0) { sx = B.nav.cx(i); sz = B.nav.cz(i); } }
  const dSlot = Math.hypot(sx - u.pos.x, sz - u.pos.z);
  const dLead = Math.hypot(L.pos.x - u.pos.x, L.pos.z - u.pos.z);
  if (dLead < 4.5) {
    const ax = u.pos.x - L.pos.x, az = u.pos.z - L.pos.z, l = Math.hypot(ax, az) || 1;
    br.state = 'move'; setGoal(B, u, br, L.pos.x + ax / l * 6, L.pos.z + az / l * 6, 'spread', 'jog');
    return;
  }
  if (still && dSlot < 7) {
    if (br.goalKind !== 'fcover') {
      const out = { x: u.pos.x + (u.pos.x - L.pos.x) * 3, z: u.pos.z + (u.pos.z - L.pos.z) * 3 };
      const c = findCover(B, u, out, 5);
      if (c && Math.hypot(c.x - L.pos.x, c.z - L.pos.z) > 5) {
        if (br.cover && br.cover.taken === u) br.cover.taken = null;
        br.cover = c; c.taken = u; setGoal(B, u, br, c.x, c.z, 'fcover', 'walk');
      } else { clearGoal(br); br.goalKind = 'fcover'; }
    }
    if (!br.path || br.pathI >= br.path.length) { br.state = 'idle'; u.wantCrouch = 1; scan(B, u, br, dt, yawTo(u.pos.x - L.pos.x, u.pos.z - L.pos.z)); }
    else br.state = 'move';
    return;
  }
  if (br.goalKind === 'fcover') { if (br.cover && br.cover.taken === u) br.cover.taken = null; br.cover = null; clearGoal(br); }
  const Lsp = Math.hypot(L.vel.x, L.vel.z);
  if (dSlot > 1.6) {
    br.state = 'move';
    const move = dSlot > 16 ? 'sprint' : (dSlot > 5 || Lsp > 3 ? 'jog' : 'walk');
    setGoal(B, u, br, sx, sz, 'slot', move);
    br.move = move;
    u.wantCrouch = 0;
  } else {
    br.state = 'idle'; clearGoal(br);
    u.wantCrouch = Lsp < 0.3 ? 1 : 0;
    scan(B, u, br, dt, sq.heading + br.slotA * 0.3);
  }
}

function thinkGeneral(B, u, br, dt) {
  const sq = u.squad;
  if (sq.mode === 'defend') return thinkDefend(B, u, br, sq, dt);
  const enemyFlag = B.flags[B.enemyOf(u.team)];
  const nxt = B.nav.flowAhead(B.flow[B.enemyOf(u.team)], u.pos.x, u.pos.z, 26);
  if (!nxt) return;
  if (nxt.left < 24 && !enemyFlag.destroyed) {
    br.state = 'capture';
    setGoal(B, u, br, enemyFlag.pos.x + 1.2, enemyFlag.pos.z + 1.2, 'capture', 'jog');
    return;
  }
  const alive = sq.bots.filter((b) => b.alive);
  const far = alive.filter((b) => Math.hypot(b.pos.x - u.pos.x, b.pos.z - u.pos.z) > 17).length;
  const contact = B.time - sq.contactT < 10;
  if (alive.length > 2 && far / alive.length > 0.45) { br.state = 'idle'; clearGoal(br); u.wantCrouch = 1; scan(B, u, br, dt, sq.heading); return; }
  br.state = 'move';
  setGoal(B, u, br, nxt.x, nxt.z, 'assault', contact ? 'walk' : 'jog');
}

/* -------------------------------------------------- движение (каждый кадр) */
export function moveUnit(B, u, dt) {
  const br = u.brain;
  if (br.fleeT > 0) br.fleeT -= dt;
  if (br.nadeT > 0) br.nadeT -= dt;
  if (br.alertT > 0) br.alertT -= dt;
  let tx = 0, tz = 0, want = 0;
  if (br.path && br.pathI < br.path.length) {
    const p = br.path[br.pathI];
    const dx = p.x - u.pos.x, dz = p.z - u.pos.z, d = Math.hypot(dx, dz);
    const last = br.pathI === br.path.length - 1;
    if (d < (last ? 0.45 : 1.0)) br.pathI++;
    else { tx = dx / d; tz = dz / d; want = SPEED[br.move] || SPEED.walk; if (last && d < 2) want *= clamp(d / 2, 0.35, 1); }
  }
  if (u.wantCrouch > 0.5 && br.move === 'walk' && want > 0) want = Math.min(want, SPEED.crouch);
  if (u.wounds) want *= 0.65;
  if (br.state === 'engage') want = 0;
  let sx = 0, sz = 0;
  B.hash.query(u.pos.x, u.pos.z, 2, (o) => {
    if (o === u || !o.alive) return;
    const dx = u.pos.x - o.pos.x, dz = u.pos.z - o.pos.z, d2 = dx * dx + dz * dz;
    if (d2 < 3.6 && d2 > 1e-4) {
      const d = Math.sqrt(d2);
      sx += dx / d * (1.9 - d); sz += dz / d * (1.9 - d);
      /* жёстко: тела не проникают друг в друга */
      if (d < 0.75) { const k = (0.75 - d) * 0.5; u.pos.x += dx / d * k; u.pos.z += dz / d * k; }
    }
  });
  u.vel.x = damp(u.vel.x, tx * want + sx * 2.6, 7, dt);
  u.vel.z = damp(u.vel.z, tz * want + sz * 2.6, 7, dt);
  u.speed = Math.hypot(u.vel.x, u.vel.z);
  if (u.speed > 0.02) {
    u.pos.x += u.vel.x * dt; u.pos.z += u.vel.z * dt;
    B.A.collide(u.pos, 0.3, 1.7);
  }
  u.pos.y = B.A.groundY(u.pos.x, u.pos.z, u.pos.y);
  br.stuckT += dt;
  if (br.stuckT > 1.6) {
    const moved = Math.hypot(u.pos.x - br.lastX, u.pos.z - br.lastZ);
    if (want > 0.5 && moved < 0.5 && br.goal) {
      const g = br.goal, k = br.goalKind; clearGoal(br);
      br.path = [{ x: u.pos.x + rand(-2.5, 2.5), z: u.pos.z + rand(-2.5, 2.5) }, { x: g.x, z: g.z }]; br.pathI = 0; br.goal = g; br.goalKind = k + '*';
    }
    br.stuckT = 0; br.lastX = u.pos.x; br.lastZ = u.pos.z;
  }
  u.crouch = damp(u.crouch, u.speed > 2.2 ? 0 : u.wantCrouch, 5, dt);
  u.suppress = Math.max(0, u.suppress - dt * 0.3);
  u.blind = Math.max(0, u.blind - dt);
  u.deaf = Math.max(0, u.deaf - dt);

  let wantYaw, wantPitch = 0;
  const t = br.target;
  if (t && br.state === 'engage') {
    const tp = B.tmp.tp2; t.chest(tp);
    const dx = tp.x - u.pos.x, dz = tp.z - u.pos.z;
    wantYaw = yawTo(dx, dz);
    wantPitch = Math.atan2(tp.y - u.eyeY(), Math.hypot(dx, dz));
  } else if (u.speed > 0.8) wantYaw = yawTo(u.vel.x, u.vel.z);
  else wantYaw = br.alertT > 0 ? br.alertYaw : br.scanYaw;
  const turn = br.state === 'engage' || br.alertT > 0 ? 9 : 3.5;
  u.aimYaw = dampAngle(u.aimYaw, wantYaw, turn, dt);
  u.aimPitch = damp(u.aimPitch, wantPitch, turn, dt);
  u.yaw = dampAngle(u.yaw, u.speed > 0.8 ? yawTo(u.vel.x, u.vel.z) : u.aimYaw, 6, dt);
}

/* ------------------------------------------------ огонь (каждый кадр) -- */
export function fireControl(B, u, dt) {
  const br = u.brain, g = u.gun;
  if (g.reloadT > 0) {
    g.reloadT -= dt;
    if (g.reloadT <= 0) { const n = Math.min(g.mag, g.reserve + g.ammo); g.reserve -= n - g.ammo; g.ammo = n; }
    return;
  }
  if (g.ammo <= 0) { if (g.reserve > 0) { g.reloadT = g.sniper ? 3.2 : 2.6; g.streak = 0; } return; }
  const t = br.target;
  if (!t || br.state !== 'engage' || !t.alive || B.time - br.lastSeenT > 0.9) { g.streak = 0; br.onT = 0; return; }
  br.onT += dt;
  if (br.gapT > 0) { br.gapT -= dt; return; }
  if (B.time < g.nextT) return;
  const tp = B.tmp.tp2; t.chest(tp);
  const dx = tp.x - u.pos.x, dz = tp.z - u.pos.z, d = Math.hypot(dx, dz);
  if (Math.abs(angleTo(u.aimYaw, yawTo(dx, dz))) > 7 * DEG) return;
  const react = 0.25 + d / 90 + (u.role === 'general' ? 0 : 0.15);
  if (br.onT < react) return;
  if (B.friendlyInLine(u, tp)) { br.gapT = 0.4; return; }
  const learn = clamp(1.6 - br.onT * 0.45, 0.55, 1.6);
  const sigma = (0.55 + d * 0.012 + u.suppress * 2.2 + (u.speed > 0.5 ? 1.4 : 0) + (t.moving() ? 0.7 : 0) + u.wounds * 1.1 +
    u.blind * 8 + g.streak * (g.auto ? 0.28 : 0.05)) * learn * DEG;
  br.errY = lerp(br.errY, gauss() * sigma, 0.55);
  br.errP = lerp(br.errP, gauss() * sigma * 0.7, 0.55);
  B.combat.botShot(u, yawTo(dx, dz) + br.errY, Math.atan2(tp.y - u.eyeY(), d) + br.errP);
  g.ammo--; g.streak++;
  u.lastShotT = B.time;
  if (g.sniper || !g.auto) { g.nextT = B.time + (g.sniper ? rand(1.1, 2.0) : rand(0.35, 0.7)); return; }
  g.nextT = B.time + 60 / g.rpm * rand(1, 1.15);
  if (br.burst <= 0) br.burst = d < 20 ? Math.round(rand(3, 6)) : d < 55 ? Math.round(rand(2, 4)) : 1;
  if (--br.burst <= 0) { br.gapT = d < 20 ? rand(0.25, 0.55) : rand(0.5, 1.1); g.streak = 0; }
}
