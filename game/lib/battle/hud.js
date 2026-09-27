/* ============================================================================
   HUD боя. Прицельной марки нет (только прицел оружия), противник не
   подсвечивается; свои — маленькие синие метки над головой (в 3D, visuals).
   ========================================================================== */
import { keyLabel } from '../profile.js';
import { TEAM_NAME, GENERAL_INFO } from './battle.js';

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
export const WNAME = { ak74: 'АК-74М', akm: 'АКМ', m416: 'M416', scar: 'SCAR-H', svd: 'СВД', m870: 'REMINGTON 870', mp5a3: 'MP5A3', glock18c: 'GLOCK 18C' };
const ZONE = { head: 'в голову', torso: 'в корпус', arm: 'в руку', leg: 'в ногу', blast: 'взрывом', frag: 'осколками' };

export class Hud {
  constructor(B, A, profile) {
    this.B = B; this.A = A; this.profile = profile;
    this.keyLabel = keyLabel;
    const root = this.root = el('div', ''); root.id = 'sg-hud';
    root.innerHTML = `
      <div id="sg-vig"></div><div id="sg-sup"></div><div id="sg-dmg"></div><div id="sg-flash"></div>
      <canvas id="sg-radar" width="336" height="336"></canvas>
      <div id="sg-top" class="sg-glass sh"><div class="tm" data-t="a"><b>0</b><span></span><div class="fl"><i></i></div></div>
        <div style="text-align:center"><div class="vs">ФЛАГ</div><div id="sg-time"></div></div>
        <div class="tm" data-t="b"><b>0</b><span></span><div class="fl"><i></i></div></div></div>
      <div id="sg-feed"></div>
      <div id="sg-me" class="sh"><span></span><b></b><span class="rs"></span><div class="wd"></div></div>
      <div id="sg-ammo" class="sh"><div class="wn"></div><div class="n"></div><div class="md"></div><div class="gr"></div></div>
      <div id="sg-hint" class="sh"><svg id="sg-ring" viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="3"/><circle id="sg-ringc" cx="18" cy="18" r="15" fill="none" stroke="#ff2438" stroke-width="3" stroke-dasharray="94.2" stroke-dashoffset="94.2" transform="rotate(-90 18 18)"/></svg><span></span></div>
      <div id="sg-msg" class="sh"></div>`;
    document.body.appendChild(root);
    this.over = el('div', ''); this.over.id = 'sg-over'; document.body.appendChild(this.over);
    this.tac = el('div', ''); this.tac.id = 'sg-tac'; document.body.appendChild(this.tac);
    this.score = el('div', 'sg-glass'); this.score.id = 'sg-score'; document.body.appendChild(this.score);
    this.radar = $('#sg-radar'); this.rctx = this.radar.getContext('2d');
    this.fx = { dmg: 0, sup: 0, flash: 0, shake: 0 };
    this.t = 0; this.hintT = 0; this.msgT = 0;
    this.mapImg = null;
    B.feed = {
      kill: (k, v, zone, how) => this.feedKill(k, v, zone, how),
      grenade: (u) => { if (u.team === B.player.team && !u.isPlayer && Math.hypot(u.pos.x - B.player.pos.x, u.pos.z - B.player.pos.z) < 30) this.feedLine(`${u.name}: «Граната!»`, 'al'); },
      msg: (m) => { this.feedLine(m, 'sys'); this.message(m, 3); }
    };
  }

  setMapImage(canvas) { this.mapImg = canvas; }

  feedLine(html, cls) {
    const f = $('#sg-feed');
    const d = el('div', cls, html);
    f.prepend(d);
    while (f.children.length > 6) f.lastChild.remove();
    setTimeout(() => { d.style.transition = 'opacity .5s'; d.style.opacity = '0'; setTimeout(() => d.remove(), 520); }, 6500);
  }
  feedKill(k, v, zone, how) {
    const me = this.B.player;
    const name = (u) => (u.isPlayer ? 'ВЫ' : u.name);
    const cls = (u) => (u.isPlayer ? 'me' : u.team === me.team ? 'al' : 'en');
    /* о гибели далёких противников игрок не знает — реализм */
    const near = (u) => Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z) < 60;
    if (!(v.team === me.team || (k && k.isPlayer) || near(v))) return;
    const z = ZONE[zone] || '';
    if (k && k !== v) this.feedLine(`<span class="${cls(k)}">${name(k)}</span> → <span class="${cls(v)}">${name(v)}</span> <span style="opacity:.6">${z}</span>`, '');
    else this.feedLine(`<span class="${cls(v)}">${name(v)}</span> <span style="opacity:.6">${how || 'погиб'}</span>`, '');
  }

  hint(text, sec = 1.6) { const h = $('#sg-hint'); h.querySelector('span').textContent = text; $('#sg-ring').style.display = 'none'; h.classList.add('on'); this.hintT = sec; this.hintFixed = false; }
  use(text, progress) {
    const h = $('#sg-hint');
    if (!text) { if (this.hintFixed) { h.classList.remove('on'); this.hintFixed = false; } return; }
    if (this.hintT > 0 && !this.hintFixed) return;
    this.hintFixed = true;
    h.querySelector('span').textContent = text;
    $('#sg-ring').style.display = progress > 0 ? 'block' : 'none';
    $('#sg-ringc').setAttribute('stroke-dashoffset', String(94.2 * (1 - progress)));
    h.classList.add('on');
  }
  message(text, sec = 2.5) { const m = $('#sg-msg'); m.textContent = text; m.classList.add('on'); this.msgT = sec; }

  damage(k) { this.fx.dmg = Math.min(1, this.fx.dmg + k); }
  suppress(k) { this.fx.sup = Math.min(0.9, this.fx.sup + k); }
  flash(S, deaf) {
    this.fx.flash = Math.max(this.fx.flash, Math.min(1.6, S * 2.2));
    const au = this.B.audio;
    if (deaf > 0 && au.out) { const g = au.out.gain, t = au.ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(au.vol * 0.08, t); g.linearRampToValueAtTime(au.vol, t + deaf); }
  }
  shake(k) { this.fx.shake = Math.max(this.fx.shake, k); }
  muzzle() { }

  showOver(html, clickable = true) { this.over.innerHTML = `<div class="card sg-glass">${html}</div>`; this.over.classList.add('on'); this.over.style.pointerEvents = clickable ? 'auto' : 'none'; this.over.style.background = ''; }
  hideOver() { this.over.classList.remove('on'); this.over.innerHTML = ''; }

  pause(on) {
    if (this.B.over || this.deadOn) return;
    if (!on) { if (this.paused) { this.paused = false; this.hideOver(); this.A.pause(false); } return; }
    if (this.paused || !window.SIGNUM_BATTLE_ACTIVE) return;
    this.paused = true;
    this.A.pause(true);
    this.showOver(`<h1>ПАУЗА</h1><h2>${this.B.rules.title}</h2>${this.keysHtml()}
      <div class="row"><button class="sg-btn scarlet" data-a="go">Продолжить</button><button class="sg-btn" data-a="menu">Выйти в меню</button></div>`);
    this.over.querySelector('[data-a=go]').onclick = () => { this.paused = false; this.hideOver(); this.A.pause(false); this.B.playerCtl.lock(); };
    this.over.querySelector('[data-a=menu]').onclick = () => { location.href = 'start.html'; };
  }
  keysHtml() {
    const K = this.profile.settings.keys, k = (a) => keyLabel(K[a]);
    const rows = [['fire', 'огонь'], ['aim', 'прицел'], ['reload', 'перезарядка'], ['fireMode', 'режим огня'], ['primary', 'основное'], ['secondary', 'пистолет'],
      ['frag', 'граната М67'], ['flash', 'светошумовая'], ['use', 'пополнить / флаг'], ['order', 'отметить бойца'], ['map', 'карта и приказы'], ['menu', 'счёт']];
    return `<div class="keys">${rows.map(([a, t]) => `<b>${k(a)}</b><span>${t}</span>`).join('')}</div>`;
  }
  deploy(info, onGo) {
    const g = GENERAL_INFO[info.general], R = this.B.rules, W = info.sum;
    const [t1, t2] = R.title.split('·');
    this.showOver(`<h1>${t1.trim()}</h1><h2>${(t2 || '').trim()} · захват флага и уничтожение противника</h2>
      <div class="grid">
        <div><b>${g.name} «${g.callsign}»</b>команда ${TEAM_NAME[info.team]} · вы ведёте штурм с ${R.botsPerGeneral} бойцами</div>
        <div><b>${W.primary ? WNAME[W.primary] : '—'}${W.secondary ? ' + ' + WNAME[W.secondary] : ''}</b>патроны ${W.primaryAmmo}/${W.secondaryAmmo} · М67 ×${W.m67} · М84 ×${W.m84}</div>
        <div><b>Респауны</b>бойцы — ${R.botRespawns}, генералы — ${R.generalRespawns}</div>
      </div>
      <p>${info.random ? '<b style="color:#ffd98a">Генерал или оружие не были выбраны — назначены случайно.</b><br>' : ''}Второй генерал вашей команды со своими бойцами держит оборону у флага.
      Цель — дойти до флага противника и удерживать <b>${keyLabel(this.profile.settings.keys.use)}</b>, пока он не будет уничтожен, или уничтожить всю живую силу противника.
      Огонь по своим возможен. Прицеливание — только через прицел оружия.</p>${this.keysHtml()}
      <div class="row"><button class="sg-btn scarlet" data-a="go">В БОЙ</button><button class="sg-btn" data-a="menu">Назад в меню</button></div>`);
    this.over.querySelector('[data-a=go]').onclick = () => { this.hideOver(); onGo(); };
    this.over.querySelector('[data-a=menu]').onclick = () => { location.href = 'start.html'; };
  }
  death(on, info) {
    this.deadOn = on;
    if (!on) { this.hideOver(); return; }
    if (info && info.out) {
      this.showOver(`<h1>ВЫ ВЫБЫЛИ</h1><h2>Респауны закончились</h2><p>Бой продолжается — наблюдайте за своими бойцами (ЛКМ — следующий).</p>
        <div class="row"><button class="sg-btn" data-a="menu">Выйти в меню</button></div>`, false);
      this.over.style.background = 'none';
      this.over.querySelector('.card').style.cssText = 'position:fixed;bottom:24px;width:min(560px,90vw);pointer-events:auto';
      this.over.querySelector('[data-a=menu]').onclick = () => { location.href = 'start.html'; };
      return;
    }
    const zone = info.zone && ZONE[info.zone] ? ' · ' + ZONE[info.zone] : '';
    this.showOver(`<h1 class="lose">УБИТ</h1><h2>${info.who}${zone}</h2><p id="sg-rt"></p>`, false);
  }
  deathTimer(t, left) { const p = $('#sg-rt'); if (p) p.textContent = left > 0 ? `Респаун через ${t.toFixed(0)} с · осталось респаунов: ${left}` : 'Респаунов не осталось'; }
  end(res, st) {
    window.SIGNUM_BATTLE_ACTIVE = false;
    this.deadOn = false;
    document.exitPointerLock && document.exitPointerLock();
    const m = Math.floor(res.time / 60), s = Math.floor(res.time % 60);
    this.showOver(`<div class="big ${res.win ? 'win' : 'lose'}">${res.win ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}</div><h2 style="margin-top:10px">${res.why}</h2>
      <div class="grid"><div><b>${st.kills}</b>уничтожено противников</div><div><b>${st.deaths}</b>ваших гибелей</div><div><b>${m}:${String(s).padStart(2, '0')}</b>длительность боя</div></div>
      ${st.teamKills ? `<p>Огонь по своим: ${st.teamKills}</p>` : ''}
      <div class="row"><button class="sg-btn scarlet" data-a="again">Ещё раз</button><button class="sg-btn" data-a="menu">В меню</button></div>`);
    this.over.querySelector('[data-a=again]').onclick = () => location.reload();
    this.over.querySelector('[data-a=menu]').onclick = () => { location.href = 'start.html'; };
  }

  toggleScore(on) {
    this.scoreOn = on === undefined ? !this.scoreOn : on;
    this.score.classList.toggle('on', !!this.scoreOn);
    if (!this.scoreOn) return;
    const B = this.B;
    const rows = B.squads.filter((s) => s.general).map((s) => {
      const all = [s.general, ...s.bots];
      const alive = all.filter((u) => u.alive).length, lives = all.reduce((a, u) => a + (u.alive ? 1 : 0) + Math.max(0, u.respawns), 0);
      const g = s.general, mine = s.team === B.player.team;
      return `<tr><td style="color:${mine ? '#9cc6ff' : '#ff9aa4'}">${g.name}${g.isPlayer ? ' (вы)' : ''}</td><td>${TEAM_NAME[s.team]}</td><td>${s.role === 'assault' ? 'штурм' : 'оборона'}</td><td>${mine ? alive : '?'}</td><td>${mine ? lives : '?'}</td><td>${g.kills + s.bots.reduce((a, b) => a + b.kills, 0)}</td></tr>`;
    }).join('');
    this.score.innerHTML = `<table><tr><th>Генерал</th><th>Команда</th><th>Задача</th><th>В строю</th><th>Жизней</th><th>Уничтожено</th></tr>${rows}</table>
      <p style="font:500 12px/1.5 var(--sg-f);color:var(--sg-tx-3);margin:10px 0 0">Ваши уничтожения: ${B.stats.kills} · гибели: ${B.stats.deaths}</p>`;
  }

  /* ------------------------------------------------ тактическая карта --- */
  tacMap(on) {
    const B = this.B, ctl = B.playerCtl;
    if (!on) { this.tac.classList.remove('on'); this.tacOn = false; return; }
    this.tacOn = true;
    if (!this.tac.firstChild) {
      const K = this.profile.settings.keys;
      this.tac.innerHTML = `<div class="wrap"><canvas width="1024" height="1024"></canvas><div class="side sg-glass">
        <h3>ТАКТИЧЕСКАЯ КАРТА</h3>
        <div class="lg"><i style="background:var(--sg-self)"></i>вы</div>
        <div class="lg"><i style="background:var(--sg-select)"></i>отмеченные бойцы</div>
        <div class="lg"><i style="background:var(--sg-ally)"></i>свои</div>
        <p>Отметьте бойцов клавишей <b>${keyLabel(K.order)}</b>, затем кликните по карте — они выдвинутся в точку и займут там укрытие. ПКМ — снять все отметки.</p>
        <button class="sg-btn" data-a="back">Вернуть в строй</button>
        <button class="sg-btn" data-a="close">Закрыть (${keyLabel(K.map)})</button></div></div>`;
      const cv = this.tac.querySelector('canvas');
      cv.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        const r = cv.getBoundingClientRect(), I = this.A.mapImage;
        const x = I.x0 + (e.clientX - r.left) / r.width * I.size, z = I.z0 + (e.clientY - r.top) / r.height * I.size;
        if (e.button === 2) { for (const u of B.units) u.selected = false; this.hint('Отметки сняты', 1); return; }
        const n = ctl.orderTo(x, z);
        if (n) { this.orderMark = { x, z, t: 2.5 }; this.hint(`Приказ принят: ${n} — выдвигаются`, 1.6); }
      });
      cv.addEventListener('contextmenu', (e) => e.preventDefault());
      this.tac.querySelector('[data-a=back]').onclick = () => { ctl.clearOrders(); this.hint('Бойцы вернулись в строй', 1.4); };
      this.tac.querySelector('[data-a=close]').onclick = () => ctl.toggleMap(false);
    }
    this.tac.classList.add('on');
  }
  drawMap(ctx, S, cx, cz, span) {
    const B = this.B, I = this.A.mapImage, me = B.player;
    ctx.save();
    ctx.fillStyle = '#0c0f10'; ctx.fillRect(0, 0, S, S);
    const k = S / span;
    ctx.translate(S / 2 - cx * k, S / 2 - cz * k);
    if (this.mapImg) ctx.drawImage(this.mapImg, I.x0 * k, I.z0 * k, I.size * k, I.size * k);
    const rr = Math.max(3, S / 150);
    const dot = (u, col, r) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(u.pos.x * k, u.pos.z * k, r, 0, 7); ctx.fill(); };
    ctx.strokeStyle = 'rgba(57,217,138,.55)'; ctx.lineWidth = 1;
    for (const u of B.units) if (u.alive && u.order && u.team === me.team) { ctx.beginPath(); ctx.moveTo(u.pos.x * k, u.pos.z * k); ctx.lineTo(u.order.x * k, u.order.z * k); ctx.stroke(); }
    for (const u of B.units) if (u.alive && u.team === me.team && !u.isPlayer) dot(u, u.selected ? '#39d98a' : '#4aa3ff', u.selected ? rr * 1.35 : rr);
    const f = B.flags[me.team], ef = B.flags[B.enemyOf(me.team)];
    ctx.font = `bold ${Math.round(rr * 4.2)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#9cc6ff'; ctx.fillText(f.destroyed ? '✕' : '⚑', f.pos.x * k, f.pos.z * k);
    ctx.fillStyle = '#ff9aa4'; ctx.fillText(ef.destroyed ? '✕' : '⚑', ef.pos.x * k, ef.pos.z * k);
    if (me.alive) {
      ctx.save(); ctx.translate(me.pos.x * k, me.pos.z * k); ctx.rotate(-me.aimYaw);
      ctx.fillStyle = '#ff3b3b'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, -rr * 2.6); ctx.lineTo(rr * 1.6, rr * 1.6); ctx.lineTo(-rr * 1.6, rr * 1.6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    if (this.orderMark && this.orderMark.t > 0) { ctx.strokeStyle = '#39d98a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(this.orderMark.x * k, this.orderMark.z * k, rr * 3, 0, 7); ctx.stroke(); }
    ctx.restore();
  }

  update(dt) {
    const B = this.B, me = B.player, ctl = B.playerCtl;
    this.t += dt;
    if (this.hintT > 0) { this.hintT -= dt; if (this.hintT <= 0) $('#sg-hint').classList.remove('on'); }
    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0) $('#sg-msg').classList.remove('on'); }
    if (this.orderMark) this.orderMark.t -= dt;
    const fx = this.fx;
    fx.dmg = Math.max(0, fx.dmg - dt * 0.6); fx.sup = Math.max(0, fx.sup - dt * 0.8); fx.flash = Math.max(0, fx.flash - dt * 0.28); fx.shake = Math.max(0, fx.shake - dt * 1.5);
    const wnd = ctl && (ctl.wound.arm || ctl.wound.leg) ? 0.2 : 0;
    $('#sg-dmg').style.opacity = String(Math.min(1, fx.dmg + wnd));
    $('#sg-sup').style.opacity = String(fx.sup);
    $('#sg-flash').style.opacity = String(Math.min(1, fx.flash));
    if (fx.shake > 0 && me.alive) this.A.camera.rotation.z += (Math.random() - 0.5) * fx.shake * 0.02;
    if (this.tacOn) { const cv = this.tac.querySelector('canvas'), I = this.A.mapImage; this.drawMap(cv.getContext('2d'), 1024, I.x0 + I.size / 2, I.z0 + I.size / 2, I.size); }
    this.acc = (this.acc || 0) + dt;
    if (this.acc < 0.1) return;
    this.acc = 0;
    this.drawMap(this.rctx, 336, me.pos.x, me.pos.z, B.rules.navCell < 1 ? 50 : 110);
    const pT = me.team, eT = B.enemyOf(pT);
    for (const [s, team] of [['a', pT], ['b', eT]]) {
      const box = $(`#sg-top .tm[data-t=${s}]`), m = B.teamAlive(team), f = B.flags[team];
      box.classList.toggle('me', team === pT);
      box.querySelector('b').textContent = team === pT ? m.alive : '?';
      box.querySelector('span').textContent = TEAM_NAME[team];
      box.querySelector('.fl').classList.toggle('dead', f.destroyed);
      box.querySelector('.fl i').style.width = (f.destroyed ? 100 : f.progress * 100) + '%';
    }
    const T = Math.floor(B.time); $('#sg-time').textContent = `${Math.floor(T / 60)}:${String(T % 60).padStart(2, '0')}`;
    const g = GENERAL_INFO[B.deploy.general];
    $('#sg-me span').textContent = `${TEAM_NAME[me.team]} · ГЕНЕРАЛ`;
    $('#sg-me b').textContent = `${g.name} «${g.callsign}»`;
    $('#sg-me .rs').textContent = `РЕСПАУНОВ: ${me.respawns} · ОТМЕЧЕНО: ${B.units.filter((u) => u.selected && u.alive).length}`;
    $('#sg-me .wd').textContent = ctl ? [ctl.wound.arm ? 'РАНЕНИЕ В РУКУ' : '', ctl.wound.leg ? 'РАНЕНИЕ В НОГУ' : ''].filter(Boolean).join(' · ') : '';
    const w = ctl && ctl.weapon;
    if (w) {
      $('#sg-ammo .wn').textContent = WNAME[w.id] || w.id;
      const n = $('#sg-ammo .n');
      n.innerHTML = `${w.mag}<s> / ${w.reserve}</s>`;
      n.className = 'n' + (w.mag === 0 ? ' empty' : w.mag <= Math.ceil(w.st.magCap * 0.25) ? ' low' : '');
      const md = w.st.modes[w.mode];
      $('#sg-ammo .md').textContent = w.reloadT > 0 ? 'ПЕРЕЗАРЯДКА' : ({ auto: 'АВТО', semi: 'ОДИНОЧНЫЙ', pump: 'ПОМПА', burst: 'ОТСЕЧКА' }[md] || md);
    } else { $('#sg-ammo .wn').textContent = 'БЕЗ ОРУЖИЯ'; $('#sg-ammo .n').textContent = ''; $('#sg-ammo .md').textContent = ''; }
    if (ctl) $('#sg-ammo .gr').innerHTML = `<span>М67 ×${ctl.nades.m67}</span><span>М84 ×${ctl.nades.m84}</span>`;
    if (this.scoreOn) this.toggleScore(true);
  }
}
