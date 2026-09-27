/* ============================================================================
   Игрок в бою: ввод (клавиши из профиля), оружие из снаряжения оружейной,
   гранаты, отметка бойцов (X) и приказы с карты, F — пополнение у ящика и
   захват флага, смерть/респаун/наблюдение. Движение, прыжок, лестницы —
   контроллер самой карты; ввод перехватывается до неё (фаза захвата).
   ========================================================================== */
import { codeMap, summarize, pistolAmmoPerSlot } from '../profile.js';
import { BOT_GUNS } from './config.js';
import { clamp, gauss, rand, fwdX, fwdZ } from './util.js';

const RELOAD = { ak74: 2.5, akm: 2.6, m416: 2.3, scar: 2.5, svd: 2.9, m870: 0.55, mp5a3: 2.2, glock18c: 1.7 };
const CALKEY = { ak74: 'r545', akm: 'r762', m416: 'r556', scar: 'r762n', svd: 'r762r', m870: 'g12', mp5a3: 'p9', glock18c: 'p9' };
const MOVE_ACTIONS = ['fwd', 'back', 'left', 'right', 'sprint', 'crouch', 'jump'];

export class PlayerCtl {
  constructor(B, A, profile, deploy, hud) {
    this.B = B; this.A = A; this.hud = hud; this.profile = profile;
    this.unit = B.player;
    this.cmap = codeMap(profile);
    this.held = new Set();
    this.sens = 0.0018 * (profile.settings.sens || 1);
    this.use = 0; this.useWhat = null;
    this.weapons = [];
    this.cur = 0; this.switchT = 0;
    this.trigger = false; this.ads = false; this.adsK = 0;
    this.recoilP = 0; this.recoilY = 0;
    this.throwT = 0;
    this.respawnT = 0; this.spectate = null;
    this.mapOpen = false;
    this.locked = false;
    this.wound = { arm: 0, leg: 0 };
    this.vm = null;
    this.buildLoadout(deploy.loadout);
    this.bindInput();
  }

  buildLoadout(lo) {
    const S = summarize(lo);
    this.loadout = lo; this.sum = S;
    const mk = (id, reserve) => {
      const cfg = (lo.weapons && lo.weapons[id]) || null;
      const G = BOT_GUNS[id] || BOT_GUNS.ak74;
      const st = { rpm: G.rpm, magCap: G.mag, velocity: G.v, moa: G.spreadMoa, pellets: G.pellets || 1, recoilV: 100, recoilH: 90,
        modes: G.auto ? ['auto', 'semi'] : (id === 'm870' ? ['pump'] : ['semi']), calKey: CALKEY[id], adsTime: 280 };
      return { id, cfg, st, mag: st.magCap, reserve, reserveMax: reserve, mode: 0, nextT: 0, reloadT: 0, pumpT: 0, build: null };
    };
    if (S.primary) this.weapons.push(mk(S.primary, S.primaryAmmo));
    if (S.secondary) this.weapons.push(mk(S.secondary, S.secondaryAmmo));
    this.nades = { m67: S.m67, m84: S.m84 };
    this.nadesMax = { ...this.nades };
    this.unit.setGun(S.primary || S.secondary || 'glock18c');
  }
  /* Статы из оружейной (модули меняют темп, магазин, отдачу). */
  applyBuild(w, build) {
    w.build = build;
    const s = build.stats || {};
    Object.assign(w.st, {
      rpm: s.rpm || w.st.rpm, magCap: s.magCap || w.st.magCap, velocity: s.velocity || w.st.velocity, moa: s.moa || w.st.moa,
      recoilV: s.recoilV || w.st.recoilV, recoilH: s.recoilH || w.st.recoilH, adsTime: s.adsTime || w.st.adsTime,
      pellets: s.pellets || w.st.pellets
    });
    if (Array.isArray(s.modes) && s.modes.length) {
      const m = s.modes.filter((x) => x !== 'safe');
      if (m.length) w.st.modes = m;
    }
    w.mag = w.st.magCap;
  }
  get weapon() { return this.weapons[this.cur] || null; }

  /* ------------------------------------------------------------ ввод --- */
  actionsOf(code) { return this.cmap[code] || []; }
  bindInput() {
    const A = this.A, dom = A.renderer.domElement;
    const isOurs = () => this.B && !this.B.over;
    const onKey = (e, down) => {
      if (!window.SIGNUM_BATTLE_ACTIVE) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      e.stopImmediatePropagation();
      if (['Space', 'Tab', 'KeyC', 'F1', 'F3', 'AltLeft'].includes(e.code)) e.preventDefault();
      if (e.code === 'Escape' && down) { if (this.mapOpen) this.toggleMap(false); return; }
      for (const a of this.actionsOf(e.code)) this.action(a, down, e.repeat);
    };
    window.addEventListener('keydown', (e) => onKey(e, true), true);
    window.addEventListener('keyup', (e) => onKey(e, false), true);
    window.addEventListener('blur', () => { for (const a of MOVE_ACTIONS) A.setMove(a, false); this.trigger = false; this.ads = false; this.held.clear(); });
    const onMouse = (e, down) => {
      if (!window.SIGNUM_BATTLE_ACTIVE) return;
      if (e.target !== dom && !(e.target && e.target.id === 'sg-lockcatch')) return;
      e.stopImmediatePropagation();
      if (down && !this.locked && !this.mapOpen) { this.lock(); return; }
      if (!this.locked) return;
      for (const a of this.actionsOf('Mouse' + e.button)) this.action(a, down, false);
    };
    window.addEventListener('mousedown', (e) => onMouse(e, true), true);
    window.addEventListener('mouseup', (e) => { if (!window.SIGNUM_BATTLE_ACTIVE) return; e.stopImmediatePropagation(); for (const a of this.actionsOf('Mouse' + e.button)) this.action(a, false, false); }, true);
    window.addEventListener('mousemove', (e) => {
      if (!window.SIGNUM_BATTLE_ACTIVE) return;
      e.stopImmediatePropagation();
      if (!this.locked || !this.unit.alive) return;
      const k = this.sens * (1 - this.adsK * (1 - this.zoomSens()));
      const p = A.player;
      p.yaw = p.yaw - e.movementX * k;
      p.pitch = p.pitch - e.movementY * k;
    }, true);
    document.addEventListener('pointerlockchange', (e) => {
      if (!window.SIGNUM_BATTLE_ACTIVE) return;
      e.stopImmediatePropagation();
      this.locked = document.pointerLockElement === dom;
      if (!this.locked) {
        this.trigger = false; this.ads = false;
        for (const a of MOVE_ACTIONS) A.setMove(a, false);
        if (!this.mapOpen && isOurs()) this.hud.pause(true);
      } else this.hud.pause(false);
    }, true);
  }
  lock() { const d = this.A.renderer.domElement; if (d.requestPointerLock) d.requestPointerLock(); }
  zoomSens() { return this.vm ? this.vm.zoomSens(this) : 0.7; }

  action(a, down, repeat) {
    if (MOVE_ACTIONS.includes(a)) {
      if (a === 'sprint' && down && this.wound.leg) { this.hud.hint('Ранение в ногу — бежать не получается', 1.2); return; }
      this.A.setMove(a, down && this.unit.alive);
      return;
    }
    if (down) this.held.add(a); else this.held.delete(a);
    if (!this.unit.alive) { if (down && a === 'fire' && this.spectate) this.nextSpectate(); return; }
    if (repeat) return;
    switch (a) {
      case 'fire': this.trigger = down; if (down) this.semiArmed = true; break;
      case 'aim': this.ads = down; break;
      case 'reload': if (down) this.reload(); break;
      case 'fireMode': if (down) this.cycleMode(); break;
      case 'primary': if (down) this.switchTo(0); break;
      case 'secondary': if (down) this.switchTo(1); break;
      case 'frag': if (down) this.throwNade('m67'); break;
      case 'flash': if (down) this.throwNade('m84'); break;
      case 'order': if (down) this.markSoldier(); break;
      case 'map': if (down) this.toggleMap(); break;
      case 'menu': if (down) this.hud.toggleScore(); else this.hud.toggleScore(false); break;
      case 'inspect': if (down && this.vm) this.vm.inspect(); break;
      default: break;
    }
  }
  holdingUse() { return this.held.has('use') && this.unit.alive; }

  switchTo(i) {
    if (i >= this.weapons.length || i === this.cur) return;
    this.cur = i; this.switchT = 0.65; this.adsK = 0;
    this.unit.setGun(this.weapon.id);
    this.vm && this.vm.show(this.weapon);
  }
  cycleMode() {
    const w = this.weapon;
    if (!w || w.st.modes.length < 2) return;
    w.mode = (w.mode + 1) % w.st.modes.length;
    this.hud.hint({ auto: 'АВТОМАТИЧЕСКИЙ ОГОНЬ', semi: 'ОДИНОЧНЫЙ ОГОНЬ', burst: 'ОТСЕЧКА' }[w.st.modes[w.mode]] || w.st.modes[w.mode].toUpperCase(), 1);
    this.B.audio.click();
  }
  reload() {
    const w = this.weapon;
    if (!w || w.reloadT > 0 || w.reserve <= 0 || w.mag >= w.st.magCap) return;
    w.reloadT = (RELOAD[w.id] || 2.5) * (this.wound.arm ? 1.4 : 1);
    this.vm && this.vm.reload(w);
  }

  throwNade(type) {
    if (this.throwT > 0 || !this.nades[type]) { if (!this.nades[type]) this.hud.hint(type === 'm67' ? 'Нет гранат М67' : 'Нет светошумовых М84', 1); return; }
    this.nades[type]--;
    this.throwT = 0.9;
    const cam = this.A.camera, dir = new this.B.T.Vector3();
    cam.getWorldDirection(dir);
    dir.y += 0.18; dir.normalize();
    const o = cam.position.clone().addScaledVector(dir, 0.45);
    o.y -= 0.1;
    setTimeout(() => this.B.combat.throwFrom(this.unit, type, o, dir, this.wound.arm ? 11 : 15.5), 260);
    this.vm && this.vm.throwAnim();
  }

  /* X: отметить своего бойца, на которого смотрит прицел. */
  markSoldier() {
    const B = this.B, T = B.T, cam = this.A.camera;
    const a = cam.position.clone(), dir = new T.Vector3(); cam.getWorldDirection(dir);
    let best = null, bs = 1e9;
    for (const u of B.units) {
      if (!u.alive || u.isPlayer || u.team !== this.unit.team) continue;
      const to = new T.Vector3(u.pos.x - a.x, u.chestY() - a.y, u.pos.z - a.z);
      const d = to.length();
      if (d > 90) continue;
      const ang = Math.acos(clamp(to.dot(dir) / d, -1, 1));
      const lim = Math.max(0.03, Math.atan2(0.5, d));
      if (ang < lim * 1.6 && d < bs) { bs = d; best = u; }
    }
    if (!best) { this.hud.hint('Наведитесь на своего бойца и нажмите ' + this.keyName('order'), 1.4); return; }
    best.selected = !best.selected;
    const n = B.units.filter((u) => u.selected && u.alive).length;
    this.hud.hint(best.selected ? `${best.name} отмечен · отмечено: ${n} · ${this.keyName('map')} — карта, клик — приказ` : `${best.name} снят с отметки`, 2.2);
  }
  keyName(a) { return this.hud.keyLabel(this.profile.settings.keys[a]); }
  toggleMap(on) {
    this.mapOpen = on === undefined ? !this.mapOpen : on;
    this.hud.tacMap(this.mapOpen);
    if (this.mapOpen) { document.exitPointerLock && document.exitPointerLock(); this.trigger = false; this.ads = false; }
    else this.lock();
  }
  orderTo(x, z) {
    const sel = this.B.units.filter((u) => u.selected && u.alive && u.team === this.unit.team && !u.isPlayer);
    if (!sel.length) { this.hud.hint('Нет отмеченных бойцов — отметьте их клавишей ' + this.keyName('order'), 1.6); return 0; }
    sel.forEach((u, i) => {
      const a = (i / sel.length) * Math.PI * 2, r = sel.length > 1 ? 2.5 + i * 0.4 : 0;
      u.order = { x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, face: { x: x + (x - u.pos.x), z: z + (z - u.pos.z) } };
      if (u.brain) { u.brain.goal = null; u.brain.path = null; u.brain.target = null; }
    });
    this.B.audio.click();
    return sel.length;
  }
  clearOrders() {
    for (const u of this.B.units) if (u.selected) { u.order = null; u.selected = false; }
  }

  /* ------------------------------------------------------ урон/смерть --- */
  nearMiss(d2) { this.B.audio.crack(d2 < 1); this.hud.suppress(d2 < 1 ? 0.5 : 0.25); }
  wounded(zone) {
    if (zone === 'arm') this.wound.arm = 1;
    if (zone === 'leg') { this.wound.leg = 1; this.A.setMove('sprint', false); }
    this.hud.damage(0.7, zone);
    this.B.audio.thud();
  }
  blast(d, ex) { this.hud.shake(clamp(1.4 - d / 12, 0, 1) * ex); }
  flash(S, deaf) { this.hud.flash(S, deaf); }
  look() { const d = new this.B.T.Vector3(); this.A.camera.getWorldDirection(d); return d; }

  onDeath(killer, zone, how) {
    this.A.player.kill();
    for (const a of MOVE_ACTIONS) this.A.setMove(a, false);
    this.trigger = false; this.ads = false;
    this.respawnT = 8;
    const who = killer ? (killer.isPlayer ? 'вы сами' : `${killer.name}${killer.team === this.unit.team ? ' (свой)' : ''}`) : (how || 'неизвестно');
    this.hud.death(true, { who, zone, how, left: this.unit.respawns });
    this.vm && this.vm.hide();
  }
  respawn() {
    const B = this.B, u = this.unit;
    u.respawns--; u.alive = true; u.wounds = 0; this.wound = { arm: 0, leg: 0 };
    B.placeAtSpawn(u, false);
    this.A.player.respawn(u.pos.x, u.pos.z, u.yaw);
    for (const w of this.weapons) { w.mag = w.st.magCap; w.reserve = w.reserveMax; w.reloadT = 0; }
    this.nades = { ...this.nadesMax };
    this.cur = 0; this.spectate = null;
    this.hud.death(false);
    this.vm && this.vm.show(this.weapon);
  }
  nextSpectate() {
    const allies = this.B.units.filter((u) => u.alive && u.team === this.unit.team && !u.isPlayer);
    if (!allies.length) { this.spectate = null; return; }
    const i = allies.indexOf(this.spectate);
    this.spectate = allies[(i + 1) % allies.length];
    this.hud.hint('Наблюдение: ' + this.spectate.name + ' · ЛКМ — следующий', 2);
  }

  /* --------------------------------------------------- синхронизация --- */
  syncUnit(dt) {
    const u = this.unit, p = this.A.player;
    const md = u.alive && p.mapDeath();
    if (md) this.B.kill(u, null, 'blast', null, md);
    if (u.alive) {
      u.pos.copy(p.pos); u.vel.copy(p.vel); u.speed = Math.hypot(p.vel.x, p.vel.z);
      u.aimYaw = u.yaw = p.yaw; u.aimPitch = p.pitch; u.crouch = p.crouch;
    }
  }

  update(dt) {
    const B = this.B, u = this.unit, A = this.A;
    if (!u.alive) {
      if (this.respawnT > 0) {
        this.respawnT -= dt;
        this.hud.deathTimer(Math.max(0, this.respawnT), u.respawns);
        if (this.respawnT <= 0) {
          if (u.respawns > 0 && !B.over) this.respawn();
          else { this.spectate = null; this.nextSpectate(); this.hud.death(true, { out: true }); }
        }
      }
      if (this.spectate && !this.spectate.alive) this.nextSpectate();
      if (this.spectate) A.spectate && A.spectate(this.spectate);
      return;
    }
    const w = this.weapon;
    if (this.switchT > 0) this.switchT -= dt;
    if (this.throwT > 0) this.throwT -= dt;
    const sprinting = this.held.has('sprint') && u.speed > 4;
    const adsTime = (w ? w.st.adsTime : 300) / 1000;
    this.adsK = clamp(this.adsK + (this.ads && !sprinting && this.switchT <= 0 && (!w || w.reloadT <= 0) ? 1 : -1.6) * dt / Math.max(0.12, adsTime), 0, 1);
    if (w) {
      if (w.reloadT > 0) {
        w.reloadT -= dt;
        if (w.reloadT <= 0) {
          if (w.id === 'm870') { w.mag++; w.reserve--; if (w.mag < w.st.magCap && w.reserve > 0 && !this.trigger) w.reloadT = RELOAD.m870; }
          else { const n = Math.min(w.st.magCap, w.mag + w.reserve); w.reserve -= n - w.mag; w.mag = n; }
        }
      }
      if (w.pumpT > 0) w.pumpT -= dt;
      const mode = w.st.modes[w.mode] || 'semi';
      const can = this.trigger && this.locked && !this.mapOpen && w.reloadT <= 0 && this.switchT <= 0 && this.throwT <= 0 && !sprinting && w.pumpT <= 0 && B.time >= w.nextT;
      if (can) {
        if (mode === 'auto' || this.semiArmed) {
          this.semiArmed = false;
          if (w.mag <= 0) { B.audio.click(); this.trigger = false; if (w.reserve > 0) this.reload(); }
          else this.fire(w, mode);
        }
      }
    }
    /* отдача возвращается к точке прицеливания не полностью — как у живого стрелка */
    const rec = Math.min(1, dt * 7);
    const back = this.recoilP * rec * 0.72;
    A.player.pitch = A.player.pitch - back; this.recoilP -= this.recoilP * rec;
    /* F: пополнение у ящика */
    this.updateUse(dt);
    this.vm && this.vm.update(dt, this);
  }

  fire(w, mode) {
    const B = this.B, T = B.T, cam = this.A.camera, u = this.unit;
    w.mag--; u.lastShotT = B.time;
    w.nextT = B.time + 60 / w.st.rpm;
    if (w.id === 'm870') w.pumpT = 0.75;
    const dir = new T.Vector3(); cam.getWorldDirection(dir);
    const moving = u.speed > 0.6 ? 1 : 0;
    const hip = (1 - this.adsK);
    const sig = (w.st.moa * 0.00029) + hip * (0.02 + moving * 0.02) + this.adsK * moving * 0.006 + (this.wound.arm ? 0.008 : 0);
    dir.x += gauss() * sig; dir.y += gauss() * sig; dir.z += gauss() * sig; dir.normalize();
    const origin = this.vm && this.vm.muzzleWorld ? this.vm.muzzleWorld(new T.Vector3()) : cam.position.clone().addScaledVector(dir, 0.6);
    if (this.adsK > 0.5) origin.copy(cam.position).addScaledVector(dir, 0.35);
    B.combat.playerShot(u, origin, dir, w.st);
    const kV = w.st.recoilV * 0.000062 * (1 - this.adsK * 0.3) * (this.wound.arm ? 1.5 : 1);
    const kick = kV * rand(0.85, 1.15);
    this.A.player.pitch = this.A.player.pitch + kick;
    this.recoilP += kick;
    this.A.player.yaw = this.A.player.yaw + gauss() * w.st.recoilH * 0.000035;
    this.vm && this.vm.onFire(w);
    this.hud.muzzle();
  }

  updateUse(dt) {
    const B = this.B, u = this.unit;
    let what = null, hint = null;
    for (const c of this.A.resupply) {
      if (Math.hypot(c.x - u.pos.x, c.z - u.pos.z) < (c.r || 3) + 1.2 && Math.abs(u.pos.y - c.y) < 2.2) {
        const full = this.weapons.every((w) => w.reserve >= w.reserveMax && w.mag >= w.st.magCap) && this.nades.m67 >= this.nadesMax.m67 && this.nades.m84 >= this.nadesMax.m84;
        what = full ? null : 'resupply';
        hint = full ? 'Ящик с боеприпасами · всё полно' : `Удерживайте ${this.keyName('use')} — пополнить патроны и гранаты`;
        break;
      }
    }
    const ef = B.flags[B.enemyOf(u.team)];
    if (!ef.destroyed && Math.hypot(ef.pos.x - u.pos.x, ef.pos.z - u.pos.z) < 3.2) {
      what = 'flag';
      hint = ef.contested ? 'Флаг оспаривается — уничтожьте защитников' : `Удерживайте ${this.keyName('use')} — захватить и уничтожить флаг`;
    }
    this.useWhat = what;
    if (what === 'resupply' && this.held.has('use')) {
      this.use += dt / 1.6;
      if (this.use >= 1) {
        for (const w of this.weapons) { w.reserve = w.reserveMax; if (w.reloadT <= 0) w.mag = w.st.magCap; }
        this.nades = { ...this.nadesMax };
        this.use = 0;
        this.hud.hint('Боезапас пополнен', 1.4);
        B.audio.clink(u.pos);
      }
    } else this.use = 0;
    this.hud.use(hint, what === 'flag' ? ef.progress : this.use);
  }
}
