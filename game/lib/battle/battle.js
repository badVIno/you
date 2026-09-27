/* ============================================================================
   Бой: команды, отряды, флаги, респауны, условия победы. Связывает ИИ,
   баллистику, визуализацию, HUD и игрока. Карта подключается адаптером
   (adapters/forest.js, adapters/hangar.js).
   ========================================================================== */
import { NavGrid } from './nav.js';
import { Unit } from './unit.js';
import { Combat } from './combat.js';
import { makeBrain, think, moveUnit, fireControl, updateSquad, assignFollowSlots, assignDefendPoints } from './ai.js';
import { SpatialHash, rand, pick, yawTo, segSegDist2 } from './util.js';
import { ALLY_GUNS, ENEMY_GUNS, BOT_GRENADES, GENERAL_GRENADES } from './config.js';

export const GENERAL_INFO = {
  delta_1: { name: 'ДЕЛЬТА-1', callsign: 'Кедр', team: 'delta' },
  delta_2: { name: 'ДЕЛЬТА-2', callsign: 'Сойка', team: 'delta' },
  alpha_1: { name: 'АЛЬФА-1', callsign: 'Ворон', team: 'alpha' },
  alpha_2: { name: 'АЛЬФА-2', callsign: 'Тис', team: 'alpha' }
};
export const TEAM_NAME = { alpha: 'АЛЬФА', delta: 'ДЕЛЬТА' };

export class Battle {
  constructor({ T, A, rules, deploy, vis, audio }) {
    this.T = T; this.A = A; this.rules = rules; this.deploy = deploy;
    this.vis = vis; this.audio = audio;
    this.time = 0;
    this.units = []; this.squads = [];
    this.hash = new SpatialHash(10);
    this.tmp = { eye: new T.Vector3(), tp: new T.Vector3(), tp2: new T.Vector3(), a: new T.Vector3(), b: new T.Vector3() };
    this.combat = new Combat(this);
    this.flags = {}; this.flow = {};
    this.over = null;
    this.stats = { kills: 0, deaths: 0, teamKills: 0 };
    this.events = [];
    this.feed = { kill: () => { }, grenade: () => { }, msg: () => { } };
    this.player = null; this.playerCtl = null; this.hud = null;
    this.losBudget = 0; this.pathBudget = 0; this.losCache = new Map();
  }

  enemyOf(t) { return t === 'alpha' ? 'delta' : 'alpha'; }

  setup() {
    const { T, A, rules } = this;
    const t0 = performance.now();
    this.nav = new NavGrid(A, rules.navCell).build().buildCover(A.coverSources());
    const tNav = performance.now();
    for (const team of ['alpha', 'delta']) {
      const b = A.base(team);
      this.flags[team] = { team, pos: new T.Vector3(b.flag.x, b.flag.y, b.flag.z), progress: 0, destroyed: false, contested: false, capturing: null };
    }
    for (const team of ['alpha', 'delta']) this.flow[team] = this.nav.flowField(this.flags[team].pos.x, this.flags[team].pos.z);
    this.buildForces();
    console.log(`[battle] nav ${this.nav.nx}×${this.nav.nz} cover ${this.nav.cover.length} in ${(tNav - t0).toFixed(0)} ms, total ${(performance.now() - t0).toFixed(0)} ms, units ${this.units.length}`);
  }

  buildForces() {
    const { T, rules, deploy } = this;
    const pTeam = deploy.team;
    const order = ['delta_1', 'delta_2', 'alpha_1', 'alpha_2'];
    for (const key of order) {
      const info = GENERAL_INFO[key], team = info.team, ally = team === pTeam;
      const isPlayer = key === deploy.general;
      /* у противника штурмует первый генерал, у своих — игрок; второй обороняет флаг */
      const assault = ally ? isPlayer : key.endsWith('_1');
      const g = new Unit(T, {
        team, role: 'general', key, name: info.name, isPlayer, respawns: rules.generalRespawns,
        gun: isPlayer ? (deploy.botGun || 'ak74') : pick(ally ? ['ak74', 'akm'] : ['m416', 'scar']),
        grenades: GENERAL_GRENADES
      });
      const sq = {
        id: key, team, general: g, bots: [], mode: assault ? 'follow' : 'defend', role: assault ? 'assault' : 'defend',
        heading: 0, leaderStill: 0, contactT: -99, contact: null, nadeT: -99, defendPts: null, aliveCount: 0,
        virt: { pos: new T.Vector3(), vel: new T.Vector3(), wait: 0, init: false }
      };
      g.squad = sq;
      this.squads.push(sq);
      this.units.push(g);
      for (let i = 0; i < rules.botsPerGeneral; i++) {
        const b = new Unit(T, {
          team, role: 'bot', key, name: `${info.callsign}-${i + 1}`, respawns: rules.botRespawns,
          gun: pick(ally ? ALLY_GUNS : ENEMY_GUNS), grenades: BOT_GRENADES
        });
        b.squad = sq; b.index = i;
        sq.bots.push(b);
        this.units.push(b);
      }
    }
    for (const u of this.units) {
      this.placeAtSpawn(u, u.squad.mode === 'defend');
      if (!u.isPlayer) u.brain = makeBrain(u);
      else this.player = u;
    }
    for (const sq of this.squads) {
      sq.heading = this.A.base(sq.team).yaw;
      if (sq.mode === 'follow') assignFollowSlots(sq); else assignDefendPoints(this, sq);
    }
  }

  /* Точка появления: у своей базы (обороняющиеся — ближе к флагу). */
  placeAtSpawn(u, nearFlag) {
    const b = this.A.base(u.team);
    const cx = nearFlag ? b.flag.x : b.x, cz = nearFlag ? b.flag.z : b.z;
    const R = b.spawnR || 10;
    let x = cx, z = cz;
    for (let k = 0; k < 40; k++) {
      const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * R;
      x = cx + Math.cos(a) * r; z = cz + Math.sin(a) * r;
      if (this.nav.walkableAt(x, z)) break;
    }
    const i = this.nav.nearest(x, z, 10);
    if (i >= 0 && !this.nav.walkableAt(x, z)) { x = this.nav.cx(i); z = this.nav.cz(i); }
    u.pos.set(x, this.A.groundY(x, z, 50), z);
    u.vel.set(0, 0, 0);
    u.yaw = u.aimYaw = b.yaw + rand(-0.5, 0.5);
    u.aimPitch = 0;
    if (u.brain) { u.brain.scanYaw = u.brain.baseYaw = u.yaw; u.brain.lastX = x; u.brain.lastZ = z; }
  }

  /* Лучи видимости с бюджетом на кадр (null — бюджет исчерпан). */
  los(a, b, ua, ub) {
    /* видимость симметрична: кэш по паре бойцов на 0,45 с */
    let key = 0;
    if (ua && ub) {
      key = ua.id < ub.id ? ua.id * 4096 + ub.id : ub.id * 4096 + ua.id;
      const c = this.losCache.get(key);
      if (c && this.time - c.t < 0.45) return c.v;
    }
    if (this.losBudget <= 0) return null;
    this.losBudget--;
    const v = this.A.losClear(a, b);
    if (key) this.losCache.set(key, { t: this.time, v });
    return v;
  }

  friendlyInLine(u, tp) {
    const e = u.eye(this.tmp.a);
    const d = Math.hypot(tp.x - e.x, tp.z - e.z);
    let blocked = false;
    const b0 = this.tmp.b;
    this.hash.query((e.x + tp.x) / 2, (e.z + tp.z) / 2, d / 2 + 2, (o) => {
      if (blocked || o === u || !o.alive || o.team !== u.team) return;
      const od = Math.hypot(o.pos.x - e.x, o.pos.z - e.z);
      if (od > d) return;
      b0.set(o.pos.x, o.pos.y + 1.0, o.pos.z);
      const c = this.tmp.eye.set(o.pos.x, o.pos.y + 1.7, o.pos.z);
      if (segSegDist2(e, tp, b0, c) < 0.8 * 0.8) blocked = true;
    });
    return blocked;
  }

  /* Звук выстрела/взрыва: противник поворачивается на звук, свои настораживаются. */
  noise(p, src, r) {
    this.hash.query(p.x, p.z, r, (o) => {
      if (!o.alive || !o.brain || o === src) return;
      const d = Math.hypot(o.pos.x - p.x, o.pos.z - p.z);
      if (d > r * (o.deaf > 0 ? 0.3 : 1)) return;
      const br = o.brain;
      if (br.target && this.time - br.lastSeenT < 1) return;
      if (src && o.team === src.team && d > 40) return;
      br.alertT = Math.max(br.alertT, d < 60 ? 5 : 3);
      br.alertYaw = yawTo(p.x - o.pos.x, p.z - o.pos.z);
      if (src && o.team !== src.team && d < 50) o.threat = p.clone();
    });
  }

  kill(u, killer, zone, dir, how) {
    if (!u.alive) return;
    u.alive = false;
    u.deadT = 0;
    u.deaths++;
    u.vel.set(0, 0, 0);
    if (u.brain) { if (u.brain.cover && u.brain.cover.taken === u) u.brain.cover.taken = null; u.brain.target = null; u.brain.path = null; }
    u.selected = false;
    if (killer && killer !== u) {
      killer.kills++;
      if (killer.isPlayer) { if (killer.team === u.team) this.stats.teamKills++; else this.stats.kills++; }
    }
    if (u.isPlayer) this.stats.deaths++;
    this.vis.onDeath(u, dir, zone);
    this.feed.kill(killer, u, zone, how);
    if (u.isPlayer && this.playerCtl) this.playerCtl.onDeath(killer, zone, how);
  }

  onPlayerNearMiss(d2) { this.playerCtl && this.playerCtl.nearMiss(d2); }
  onPlayerWound(zone) { this.playerCtl && this.playerCtl.wounded(zone); }
  onPlayerBlast(d, ex) { this.playerCtl && this.playerCtl.blast(d, ex); }
  onPlayerFlash(S, deaf) { this.playerCtl && this.playerCtl.flash(S, deaf); }
  playerLook() { return this.playerCtl ? this.playerCtl.look() : { x: 0, y: 0, z: -1 }; }

  respawn(u) {
    u.respawns--;
    u.alive = true; u.wounds = 0; u.deadT = 0; u.suppress = 0; u.blind = 0; u.order = null;
    u.restock();
    this.placeAtSpawn(u, u.squad.mode === 'defend');
    if (u.brain) Object.assign(u.brain, makeBrain(u), { slotA: u.brain.slotA, slotR: u.brain.slotR, defendPt: u.brain.defendPt });
    this.vis.onRespawn(u);
  }

  teamAlive(team) {
    let alive = 0, pending = 0;
    for (const u of this.units) if (u.team === team) { if (u.alive) alive++; else if (u.respawns > 0) pending++; }
    return { alive, pending };
  }

  updateFlags(dt) {
    const R = 3.2;
    for (const team of ['alpha', 'delta']) {
      const f = this.flags[team];
      if (f.destroyed) continue;
      let att = 0, def = 0, playerIn = false;
      this.hash.query(f.pos.x, f.pos.z, R, (o) => {
        if (!o.alive || Math.hypot(o.pos.x - f.pos.x, o.pos.z - f.pos.z) > R) return;
        if (o.team === team) def++;
        else if (o.isPlayer) playerIn = true;
        else att++;
      });
      const playerCap = playerIn && this.playerCtl && this.playerCtl.holdingUse();
      const n = att + (playerCap ? 1 : 0);
      f.contested = n > 0 && def > 0;
      f.capturing = n > 0 && !def ? this.enemyOf(team) : null;
      if (f.capturing) f.progress = Math.min(1, f.progress + dt / this.rules.flagHold * Math.min(2, 0.7 + n * 0.3));
      else if (!n) f.progress = Math.max(0, f.progress - dt / 40);
      if (f.progress >= 1) {
        f.destroyed = true;
        this.A.destroyFlag(team, f.pos);
        this.audio.boom(f.pos, 1.4);
        this.feed.msg(`Флаг команды ${TEAM_NAME[team]} уничтожен`);
      }
    }
  }

  checkEnd() {
    if (this.over) return;
    const pT = this.deploy.team, eT = this.enemyOf(pT);
    let res = null;
    if (this.flags[eT].destroyed) res = { win: true, why: 'Флаг противника захвачен и уничтожен' };
    else if (this.flags[pT].destroyed) res = { win: false, why: 'Противник уничтожил ваш флаг' };
    else {
      const e = this.teamAlive(eT), m = this.teamAlive(pT);
      if (!e.alive && !e.pending) res = { win: true, why: 'Живая сила противника уничтожена' };
      else if (!m.alive && !m.pending) res = { win: false, why: 'Ваша команда уничтожена' };
    }
    if (res) { res.time = this.time; this.over = res; this.hud && this.hud.end(res, this.stats); }
  }

  /* Разведка: штурмовой отряд уничтожен без респаунов — часть обороны идёт вперёд. */
  checkRecon() {
    for (const team of ['alpha', 'delta']) {
      const sqs = this.squads.filter((s) => s.team === team);
      const assault = sqs.find((s) => s.role === 'assault');
      const defend = sqs.find((s) => s.role === 'defend' && s.mode === 'defend');
      if (!assault || !defend || defend.reconSent) continue;
      const gone = [assault.general, ...assault.bots].every((u) => !u.alive && u.respawns <= 0);
      if (!gone) continue;
      defend.reconSent = true;
      const T = this.T;
      const bots = defend.bots.filter((b, i) => i % 2 === 1 && (b.alive || b.respawns > 0));
      const recon = {
        id: defend.id + '_recon', team, general: null, bots, mode: 'recon', role: 'recon',
        heading: defend.heading, leaderStill: 0, contactT: -99, contact: null, nadeT: -99, aliveCount: 0,
        virt: { pos: new T.Vector3().copy(this.flags[team].pos), vel: new T.Vector3(), wait: 0, init: true }
      };
      defend.bots = defend.bots.filter((b) => !bots.includes(b));
      for (const b of bots) { b.squad = recon; if (b.brain) b.brain.goal = null; }
      this.squads.push(recon);
      assignFollowSlots(recon);
      if (team === this.deploy.team) this.feed.msg('Штурмовая группа потеряна — часть обороны уходит в разведку');
    }
  }

  update(dt) {
    if (this.over && this.over.frozen) return;
    this.time += dt;
    this.losBudget = this.rules.navCell < 1 ? 16 : 26;
    this.pathBudget = 2;
    if (this.losCache.size > 6000) this.losCache.clear();
    if (this.playerCtl) this.playerCtl.syncUnit(dt);
    this.hash.clear();
    for (const u of this.units) if (u.alive) this.hash.insert(u, u.pos.x, u.pos.z);
    for (const sq of this.squads) updateSquad(this, sq, dt);
    for (const u of this.units) {
      if (!u.alive || u.isPlayer) continue;
      const br = u.brain;
      br.thinkT -= dt;
      if (br.thinkT <= 0) { const dtT = 0.3 - br.thinkT; br.thinkT = rand(0.25, 0.4); think(this, u, dtT); }
    }
    for (const u of this.units) {
      if (u.isPlayer) continue;
      if (u.alive) { moveUnit(this, u, dt); fireControl(this, u, dt); }
      else {
        u.deadT += dt;
        if (u.respawns > 0 && u.deadT > this.rules.respawnDelay * (u.role === 'general' ? 0.8 : 1) && !this.over) this.respawn(u);
      }
    }
    if (this.player && !this.player.alive) this.player.deadT += dt;
    this.combat.update(dt);
    this.updateFlags(dt);
    this.checkRecon();
    this.checkEnd();
  }
}
