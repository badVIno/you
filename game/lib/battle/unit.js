/* ============================================================================
   Боец (бот, генерал или игрок): состояние, оружие, хитбоксы и урон.

   Модель урона по ТЗ: одно попадание в голову или корпус — насмерть,
   конечности — два попадания (первое ранит: боец замедляется и хуже целится).
   ========================================================================== */
import { BOT_GUNS, BOT_RESERVE_MAGS } from './config.js';
import { segSegDist2, fwdX, fwdZ } from './util.js';

let NEXT_ID = 1;

export class Unit {
  constructor(THREE, o) {
    this.id = NEXT_ID++;
    this.team = o.team;              // 'alpha' | 'delta'
    this.role = o.role;              // 'general' | 'bot'
    this.key = o.key || null;        // пресет генерала / его отряда
    this.name = o.name || '';
    this.squad = null;
    this.isPlayer = !!o.isPlayer;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;                    // курс корпуса
    this.aimYaw = 0; this.aimPitch = 0;
    this.crouch = 0;                 // 0 стоя … 1 присел
    this.wantCrouch = 0;
    this.speed = 0;
    this.alive = true;
    this.wounds = 0;
    this.deadT = 0;
    this.respawns = o.respawns || 0;
    this.gunId = o.gun || 'ak74';
    this.gun = null;
    this.grenades = Object.assign({ m67: 0, m84: 0 }, o.grenades || {});
    this.grenadesMax = Object.assign({}, this.grenades);
    this.blind = 0; this.deaf = 0;
    this.suppress = 0;
    this.lastShotT = -99;
    this.lastHitT = -99;
    this.kills = 0; this.deaths = 0;
    this.selected = false;           // отмечен игроком (X)
    this.order = null;               // приказ игрока {x, z}
    this.brain = null;
    this.vis = null;
    this.setGun(this.gunId);
  }

  setGun(id) {
    const G = BOT_GUNS[id] || BOT_GUNS.ak74;
    this.gunId = id;
    this.gun = { ...G, id, ammo: G.mag, reserve: G.mag * BOT_RESERVE_MAGS, reloadT: 0, nextT: 0, burst: 0, streak: 0 };
  }
  restock() {
    const g = this.gun;
    g.ammo = g.mag; g.reserve = g.mag * BOT_RESERVE_MAGS; g.reloadT = 0;
    this.grenades = Object.assign({}, this.grenadesMax);
  }

  eyeY() { return this.pos.y + 1.64 - this.crouch * 0.52; }
  chestY() { return this.pos.y + 1.28 - this.crouch * 0.42; }
  eye(out) { return out.set(this.pos.x, this.eyeY(), this.pos.z); }
  chest(out) { return out.set(this.pos.x, this.chestY(), this.pos.z); }
  moving() { return this.speed > 0.6; }

  /* Капсулы попаданий в мировых координатах, по позе (стоя/присев) и курсу. */
  capsules(T) {
    const c = this._caps || (this._caps = makeCaps(T));
    const k = this.crouch, sy = 1 - k * 0.34;
    const fx = fwdX(this.aimYaw), fz = fwdZ(this.aimYaw), rx = -fz, rz = fx;
    const P = this.pos;
    const set = (v, lx, ly, lz) => v.set(P.x + rx * lx + fx * lz, P.y + ly, P.z + rz * lx + fz * lz);
    const lean = k * 0.18;
    set(c[0].a, 0, 1.62 * sy + 0.04, lean + 0.02); set(c[0].b, 0, 1.70 * sy + 0.04, lean + 0.02);          // голова
    set(c[1].a, 0, 0.94 * sy, 0); set(c[1].b, 0, 1.44 * sy, lean);                                            // корпус
    set(c[2].a, 0.21, 1.40 * sy, lean); set(c[2].b, 0.1, 1.2 * sy, lean + 0.32);                             // правая рука
    set(c[3].a, -0.21, 1.40 * sy, lean); set(c[3].b, -0.04, 1.22 * sy, lean + 0.46);                         // левая рука
    set(c[4].a, 0.1, 0.9 * sy, 0); set(c[4].b, 0.13, 0.08, k * 0.35);                                        // ноги
    set(c[5].a, -0.1, 0.9 * sy, 0); set(c[5].b, -0.13, 0.08, -k * 0.1);
    return c;
  }

  /* Попадание отрезком a→b: {zone, s} ближайшей капсулы или null. */
  rayHit(T, a, b) {
    /* грубая проверка: ось бойца — вертикальный отрезок */
    const ax = this._ax || (this._ax = [new T.Vector3(), new T.Vector3()]);
    ax[0].set(this.pos.x, this.pos.y, this.pos.z);
    ax[1].set(this.pos.x, this.pos.y + 1.8, this.pos.z);
    if (segSegDist2(a, b, ax[0], ax[1]) > 0.7 * 0.7) return null;
    const caps = this.capsules(T);
    let best = null;
    const o = { s: 0 };
    for (const c of caps) {
      const d2 = segSegDist2(a, b, c.a, c.b, o);
      if (d2 < c.r * c.r && (!best || o.s < best.s)) best = { zone: c.zone, s: o.s };
    }
    return best;
  }

  /* Возвращает true, если попадание смертельно. */
  hit(zone) {
    if (!this.alive) return false;
    if (zone === 'head' || zone === 'torso') return true;
    this.wounds++;
    return this.wounds >= 2;
  }
}

function makeCaps(T) {
  const V = () => new T.Vector3();
  return [
    { zone: 'head', a: V(), b: V(), r: 0.125 },
    { zone: 'torso', a: V(), b: V(), r: 0.19 },
    { zone: 'arm', a: V(), b: V(), r: 0.06 },
    { zone: 'arm', a: V(), b: V(), r: 0.06 },
    { zone: 'leg', a: V(), b: V(), r: 0.085 },
    { zone: 'leg', a: V(), b: V(), r: 0.085 }
  ];
}
