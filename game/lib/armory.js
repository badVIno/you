/* SIGNUM — оружейная: выбор оружия (полигон weapons/*.html во iframe), модули, 6 слотов снаряжения.
   Всё сохраняется сразу в profile.loadouts[general] = { slots, weapons: { [id]: cfg } }. */
import * as P from './profile.js';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/* Базовые ТТХ для меню (как def.base на страницах-полигонах); у выбранного оружия заменяются живыми из iframe. */
const BASE = {
  ak74: { rpm: 650, velocity: 900, range: 450, mag: 30, type: 'rifle' },
  akm: { rpm: 600, velocity: 715, range: 350, mag: 30, type: 'rifle' },
  m416: { rpm: 850, velocity: 880, range: 450, mag: 30, type: 'rifle' },
  scar: { rpm: 600, velocity: 790, range: 600, mag: 20, type: 'rifle' },
  svd: { rpm: 0, velocity: 830, range: 800, mag: 10, type: 'dmr' },
  m870: { rpm: 0, velocity: 400, range: 50, mag: 4, type: 'shotgun' },
  mp5a3: { rpm: 800, velocity: 400, range: 200, mag: 30, type: 'smg' },
  glock18c: { rpm: 1200, velocity: 360, range: 50, mag: 17, type: 'pistol' }
};
const ACTION = { svd: 'полуавт.', m870: 'помпа' };

const ICON = {
  rifle: '<svg viewBox="0 0 64 24" aria-hidden="true"><path fill="currentColor" d="M2 9h8l3-2h22l2-2h3v2h9v2h9v2h-9v1h-4l-1 2h-4l2 7h-5l-3-7h-3l-1 5h-4l1-5h-7l-9 5H3l1-5-2-1z"/></svg>',
  dmr: '<svg viewBox="0 0 64 24" aria-hidden="true"><path fill="currentColor" d="M1 11l6-3h8l1-3h14v-2h5v2h4v3h24v2h-24v1h-5l-2 2h-3l1 5h-4l-1-5H19l-7 5H4l3-4z"/></svg>',
  shotgun: '<svg viewBox="0 0 64 24" aria-hidden="true"><path fill="currentColor" d="M1 12l7-4h13l2-1h40v3H40v3H26l-2 1h-2l-2 3h-3l1-3h-3l-8 5H2l2-5z"/></svg>',
  smg: '<svg viewBox="0 0 64 24" aria-hidden="true"><path fill="currentColor" d="M4 7h2v6h10V8h22l2-2h6v2h6v3h-6v2h-8l1 9h-4l-2-9h-4l-1 5h-4l1-5h-6v1H4z"/></svg>',
  pistol: '<svg viewBox="0 0 64 24" aria-hidden="true"><path fill="currentColor" d="M16 4h34v6H33l-1 3h-4l-1-2h-2l-3 11h-7l3-12-2-1z"/></svg>',
  ammo: '<svg viewBox="0 0 40 24" aria-hidden="true"><g fill="currentColor"><path d="M6 8c0-3 2-5 3-6 1 1 3 3 3 6v14H6z"/><path d="M16 8c0-3 2-5 3-6 1 1 3 3 3 6v14h-6z"/><path d="M26 8c0-3 2-5 3-6 1 1 3 3 3 6v14h-6z"/></g></svg>',
  m67: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><circle cx="12" cy="14" r="8"/><path d="M9 3h6v4H9zM15 4h5l-2 3h-3z"/></g></svg>',
  m84: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><rect x="7" y="7" width="10" height="15" rx="2"/><path d="M9 2h6v4H9zM15 3h5l-2 3h-3z"/></g><g fill="#0d0f12"><circle cx="10" cy="12" r="1"/><circle cx="14" cy="12" r="1"/><circle cx="10" cy="17" r="1"/><circle cx="14" cy="17" r="1"/></g></svg>',
  clear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'
};
const wIcon = (id) => ICON[BASE[id]?.type || 'rifle'];

/* ---------- состояние ---------- */
const qs = new URLSearchParams(location.search);
let general = null;
let current = null;              // оружие, открытое на полигоне
const live = {};                 // живые ТТХ от iframe: id -> stats
let toastT = 0;

function prof() { return P.load(); }
function loadout(p = prof()) {
  const lo = p.loadouts[general] || P.emptyLoadout();
  lo.slots = Array.from({ length: P.SLOT_COUNT }, (_, i) => lo.slots?.[i] || null);
  lo.weapons = lo.weapons || {};
  return lo;
}
function saveLoadout(fn) {
  P.update((p) => {
    const lo = loadout(p);
    fn(lo, p);
    p.loadouts[general] = lo;
    p.general = general;
  });
}

function toast(msg, bad = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('bad', bad);
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), bad ? 3200 : 2200);
}

/* ---------- генералы ---------- */
function initGeneral() {
  const p = prof();
  const want = qs.get('general');
  general = P.GENERALS.some((g) => g.key === want) ? want : p.general;
  if (!P.GENERALS.some((g) => g.key === general)) {
    const g = P.GENERALS[Math.floor(Math.random() * P.GENERALS.length)];
    general = g.key;
    setTimeout(() => toast(`Генерал не выбран — назначен случайно: ${g.name} «${g.callsign}»`), 600);
  }
  P.update((pp) => { pp.general = general; });
}
function renderGenerals() {
  const box = $('#generals');
  box.innerHTML = '';
  for (const g of P.GENERALS) {
    const b = el('button', `gchip ${g.team}${g.key === general ? ' on' : ''}`, `<b><i></i>${esc(g.name)}</b><span>«${esc(g.callsign)}»</span>`);
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', g.key === general);
    b.title = `Снаряжение генерала ${g.name}`;
    b.onclick = () => {
      if (g.key === general) return;
      general = g.key;
      P.update((p) => { p.general = general; });
      renderGenerals();
      renderSlots();
      renderList();
      openWeapon(pickStartWeapon(), true);
      toast(`Снаряжение генерала ${g.name} «${g.callsign}»`);
    };
    box.appendChild(b);
  }
}

/* ---------- список оружия ---------- */
function statLine(id) {
  const b = BASE[id], s = live[id];
  const rpm = s?.rpm ?? b.rpm, v = Math.round(s?.velocity ?? b.velocity), r = Math.round(s?.range ?? b.range), mag = s?.mag ?? b.mag;
  const rate = ACTION[id] || `${Math.round(rpm)} выстр/мин`;
  return `${rate} · ${v} м/с · ${r} м · ${mag} патр.`;
}
function equippedIds() {
  const s = new Set();
  for (const x of loadout().slots) if (x && (x.kind === 'primary' || x.kind === 'secondary')) s.add(x.id);
  return s;
}
function renderList() {
  const box = $('#witems');
  box.innerHTML = '';
  const eq = equippedIds();
  for (const w of P.WEAPONS) {
    const b = el('button', 'witem' + (w.id === current ? ' on' : ''),
      `${wIcon(w.id)}<div class="wn">${esc(w.title)}<small>${esc(w.cal)}</small>${eq.has(w.id) ? '<span class="eq">В СНАР.</span>' : ''}</div><div class="ws">${esc(statLine(w.id))}</div>`);
    b.dataset.id = w.id;
    b.title = w.kind === 'secondary' ? 'Пистолет (дополнительное оружие)' : 'Основное оружие';
    b.onclick = () => openWeapon(w.id);
    box.appendChild(b);
  }
}

/* ---------- полигон ---------- */
function frameParams() {
  const cs = getComputedStyle(document.documentElement);
  return { el: parseInt(cs.getPropertyValue('--side')) || 292, et: parseInt(cs.getPropertyValue('--top')) || 122 };
}
function openWeapon(id, force = false) {
  if (!force && id === current) return;
  current = id;
  const w = P.weaponById(id);
  const cfg = loadout().weapons[id] || {};
  const { el: l, et } = frameParams();
  const url = `weapons/${w.file}?embed=1&el=${l}&et=${et}&cfg=${encodeURIComponent(JSON.stringify(cfg))}`;
  $('#veil').classList.add('on');
  $('#range').src = url;
  try { sessionStorage.setItem('signum:armory:weapon', id); } catch (e) { /* нет доступа */ }
  renderList();
  renderTake();
}
function pickStartWeapon() {
  const want = qs.get('weapon');
  if (P.weaponById(want)) return want;
  const lo = loadout();
  const pr = lo.slots.find((s) => s?.kind === 'primary') || lo.slots.find((s) => s?.kind === 'secondary');
  if (pr) return pr.id;
  let last = null;
  try { last = sessionStorage.getItem('signum:armory:weapon'); } catch (e) { last = null; }
  return P.weaponById(last) ? last : P.WEAPONS[0].id;
}
addEventListener('message', (e) => {
  const d = e.data;
  if (!d || d.type !== 'gunsmith:cfg' || e.source !== $('#range').contentWindow) return;
  if (d.weapon !== current) return;
  saveLoadout((lo) => { lo.weapons[d.weapon] = d.cfg; });
  if (d.stats) live[d.weapon] = d.stats;
  const item = document.querySelector(`.witem[data-id="${d.weapon}"] .ws`);
  if (item) item.textContent = statLine(d.weapon);
  renderSlots();
  $('#veil').classList.remove('on');
});
$('#range').addEventListener('load', () => setTimeout(() => $('#veil').classList.remove('on'), 4000));

/* ---------- слоты ---------- */
const GREN = { m67: { label: 'М67', sub: 'осколочная' }, m84: { label: 'М84', sub: 'светошумовая' } };
function slotView(s, lo) {
  if (!s) return { cls: 'empty', icon: '', label: 'Пусто', sub: '+ добавить' };
  if (s.kind === 'primary' || s.kind === 'secondary') {
    const w = P.weaponById(s.id);
    return { cls: s.kind, icon: wIcon(s.id), label: w?.title || s.id, sub: s.kind === 'primary' ? 'основное' : 'пистолет' };
  }
  if (s.kind === 'ammo') {
    if (s.for === 'secondary') return { cls: 'ammo', icon: ICON.ammo, label: `${P.pistolAmmoPerSlot(lo.weapons.glock18c)} патр.`, sub: 'пист. · 9×19' };
    const pr = lo.slots.find((x) => x?.kind === 'primary');
    return { cls: 'ammo', icon: ICON.ammo, label: `${P.AMMO_PER_SLOT.primary} патр.`, sub: pr ? `осн. · ${P.weaponById(pr.id)?.cal}` : 'к основному' };
  }
  if (s.kind === 'grenade') return { cls: 'grenade', icon: ICON[s.id], label: GREN[s.id]?.label || s.id, sub: GREN[s.id]?.sub || '' };
  return { cls: 'empty', icon: '', label: '?', sub: '' };
}
function renderSummary(lo) {
  const s = P.summarize(lo), parts = [];
  const ammo = (n) => (n ? ` + ${n} патр.` : ' (без запаса)');
  parts.push(s.primary ? `<b>${esc(P.weaponById(s.primary).title)}</b>${ammo(s.primaryAmmo)}` : 'без основного');
  if (s.secondary) parts.push(`<b>Glock 18C</b>${ammo(s.secondaryAmmo)}`);
  if (s.m67 || s.m84) parts.push(`гранаты: ${[s.m67 ? `М67×${s.m67}` : '', s.m84 ? `М84×${s.m84}` : ''].filter(Boolean).join(', ')}`);
  const free = lo.slots.filter((x) => !x).length;
  if (free) parts.push(`свободно: ${free}`);
  $('#summary').innerHTML = parts.join(' · ');
}
function renderSlots(flash = -1) {
  const lo = loadout(), box = $('#slots');
  box.innerHTML = '';
  lo.slots.forEach((s, i) => {
    const v = slotView(s, lo);
    const b = el('button', `slot ${v.cls}${i === flash ? ' flash' : ''}${i === popSlot ? ' open' : ''}`,
      `<span class="sn">${i + 1}</span><span class="si">${v.icon}</span><span class="sl">${esc(v.label)}</span><span class="sc">${esc(v.sub)}</span>`);
    b.dataset.i = i;
    b.title = `Слот ${i + 1}: ${v.label}`;
    b.onclick = (e) => { e.stopPropagation(); popSlot === i ? closePop() : openPop(i, b); };
    box.appendChild(b);
  });
  renderSummary(lo);
  renderTake();
}
function setSlot(i, val) {
  const lo = loadout();
  const next = lo.slots.slice();
  next[i] = val;
  const err = P.validateSlots(next);
  if (err) { toast(err, true); return false; }
  saveLoadout((l) => { l.slots = next; });
  renderSlots(i);
  renderList();
  return true;
}

/* ---------- выбор содержимого слота ---------- */
let popSlot = -1;
function closePop() {
  popSlot = -1;
  $('#pop').hidden = true;
  document.querySelectorAll('.slot.open').forEach((s) => s.classList.remove('open'));
}
function openPop(i, anchor) {
  const lo = loadout(), cur = lo.slots[i];
  const other = (kind) => lo.slots.findIndex((s, j) => j !== i && s?.kind === kind);
  const cw = P.weaponById(current);
  const opts = [];
  if (cw?.kind === 'primary') {
    const j = other('primary');
    opts.push({ icon: wIcon(cw.id), label: cw.title, sub: j >= 0 ? `Только одно основное — уже в слоте ${j + 1}` : 'основное оружие (выбрано слева)',
      bad: j >= 0 ? `Основное оружие уже в слоте ${j + 1}. Можно взять только одно — очистите слот ${j + 1} или нажмите «Взять в снаряжение».` : null,
      val: { kind: 'primary', id: cw.id } });
  } else {
    opts.push({ icon: ICON.rifle, label: 'Основное оружие', sub: 'сначала выберите его в меню слева', disabled: true });
  }
  {
    const j = other('secondary');
    opts.push({ icon: ICON.pistol, label: 'Glock 18C', sub: j >= 0 ? `Только один пистолет — уже в слоте ${j + 1}` : 'пистолет (дополнительное оружие)',
      bad: j >= 0 ? `Пистолет уже в слоте ${j + 1}. Можно взять только один.` : null, val: { kind: 'secondary', id: 'glock18c' } });
  }
  opts.push('hr');
  opts.push({ icon: ICON.ammo, label: `Патроны к основному · ${P.AMMO_PER_SLOT.primary}`, sub: 'один слот = 120 патронов', val: { kind: 'ammo', for: 'primary' } });
  const pa = P.pistolAmmoPerSlot(lo.weapons.glock18c);
  opts.push({ icon: ICON.ammo, label: `Патроны к пистолету · ${pa}`, sub: pa === 33 ? 'удлинённые магазины: 33 в слоте' : 'стандарт: 30 (33 с удлинённым магазином)', val: { kind: 'ammo', for: 'secondary' } });
  opts.push('hr');
  opts.push({ icon: ICON.m67, label: 'Граната М67', sub: 'осколочная, радиус поражения ~15 м', val: { kind: 'grenade', id: 'm67' } });
  opts.push({ icon: ICON.m84, label: 'Светошумовая М84', sub: 'ослепляет и оглушает', val: { kind: 'grenade', id: 'm84' } });
  if (cur) { opts.push('hr'); opts.push({ icon: ICON.clear, label: 'Очистить слот', sub: '', val: null, clear: true }); }

  const pop = $('#pop');
  pop.innerHTML = `<h4>Слот ${i + 1}</h4>`;
  for (const o of opts) {
    if (o === 'hr') { pop.appendChild(el('hr')); continue; }
    const same = cur && o.val && JSON.stringify(cur) === JSON.stringify(o.val);
    const b = el('button', (o.bad ? 'bad' : '') + (same ? ' cur' : ''), `${o.icon}<b>${esc(o.label)}${same ? ' ✓' : ''}</b><span>${esc(o.sub)}</span>`);
    if (o.disabled) b.disabled = true;
    b.onclick = (e) => {
      e.stopPropagation();
      if (o.bad) { toast(o.bad, true); return; }
      if (setSlot(i, o.val)) closePop();
    };
    pop.appendChild(b);
  }
  popSlot = i;
  document.querySelectorAll('.slot').forEach((s) => s.classList.toggle('open', +s.dataset.i === i));
  pop.hidden = false;
  const r = anchor.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
  pop.style.left = Math.max(8, Math.min(innerWidth - pw - 8, r.left)) + 'px';
  pop.style.top = Math.max(8, Math.min(innerHeight - ph - 8, r.bottom + 6)) + 'px';
}
document.addEventListener('pointerdown', (e) => { if (popSlot >= 0 && !$('#pop').contains(e.target) && !e.target.closest('.slot')) closePop(); });
addEventListener('blur', closePop);  // клик по полигону (iframe) уводит фокус
addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (popSlot >= 0) closePop(); else if (coachStep >= 0) endCoach(); } });

/* ---------- «Взять в снаряжение» и шаблоны ---------- */
function renderTake() {
  const b = $('#take'), w = P.weaponById(current);
  if (!b || !w) return;
  const inLo = loadout().slots.some((s) => s && s.id === current && (s.kind === 'primary' || s.kind === 'secondary'));
  b.classList.toggle('done', inLo);
  b.textContent = inLo ? '✓ В снаряжении' : 'Взять в снаряжение';
  b.title = inLo ? 'Оружие уже в слотах' : `Положить ${w.title} в слот ${w.kind === 'primary' ? 'основного оружия' : 'пистолета'}`;
}
function take() {
  const w = P.weaponById(current);
  if (!w) return;
  const kind = w.kind, lo = loadout();
  let i = lo.slots.findIndex((s) => s?.kind === kind);
  let note = '';
  if (i >= 0 && lo.slots[i].id === w.id) { toast(`${w.title} уже в слоте ${i + 1}`); return; }
  if (i >= 0) note = ` (заменено: ${P.weaponById(lo.slots[i].id)?.title})`;
  else {
    i = lo.slots.findIndex((s) => !s);
    if (i < 0) {
      // Все слоты заняты: вытесняем последний расходник, чтобы не терять оружие.
      for (let j = lo.slots.length - 1; j >= 0; j--) if (lo.slots[j].kind === 'ammo' || lo.slots[j].kind === 'grenade') { i = j; break; }
      if (i < 0) { toast('Нет места: очистите один из слотов', true); return; }
      note = ` (вместо: ${slotView(lo.slots[i], lo).label})`;
    }
  }
  if (setSlot(i, { kind, id: w.id })) toast(`${w.title} → слот ${i + 1}${note}`);
}
const PRESETS = {
  assault: (p) => [p, 'A', 'A', 'A', 'm67', 'm84'],
  universal: (p) => [p, 'A', 'A', 'G', 'GA', 'm67'],
  ammo: (p) => [p, 'A', 'A', 'A', 'A', 'A']
};
function applyPreset(name) {
  const lo = loadout();
  const cw = P.weaponById(current);
  const prim = cw?.kind === 'primary' ? cw.id : lo.slots.find((s) => s?.kind === 'primary')?.id;
  if (!prim) { toast('Сначала выберите основное оружие в меню слева', true); return; }
  const map = { A: { kind: 'ammo', for: 'primary' }, G: { kind: 'secondary', id: 'glock18c' }, GA: { kind: 'ammo', for: 'secondary' },
    m67: { kind: 'grenade', id: 'm67' }, m84: { kind: 'grenade', id: 'm84' } };
  const slots = PRESETS[name](prim).map((x) => (x === prim ? { kind: 'primary', id: prim } : { ...map[x] }));
  saveLoadout((l) => { l.slots = slots; });
  renderSlots();
  renderList();
  document.querySelectorAll('.slot').forEach((s) => s.classList.add('flash'));
  toast(`Шаблон «${document.querySelector(`[data-preset="${name}"]`).textContent}» применён`);
}

/* ---------- назад ---------- */
function goBack() {
  saveLoadout(() => {});
  location.href = 'start.html?from=armory';
}

/* ---------- подсказки первого визита ---------- */
let coachStep = -1, coachBox = null, coachHl = null;
function modsRect() {
  try {
    const m = $('#range').contentDocument?.querySelector('.mods');
    const r = m && m.getBoundingClientRect();
    if (r && r.width) return r;
  } catch (e) { /* другой источник */ }
  const top = frameParams().et;
  return new DOMRect(innerWidth - 356, top, 340, innerHeight - top - 84);
}
const COACH = [
  { el: () => $('#wlist').getBoundingClientRect(), side: 'r', html: '<b>Выберите оружие слева.</b> Оно появится на оружейном полигоне — можно сразу пострелять по мишеням (ЛКМ, прицел — ПКМ).' },
  { el: modsRect, side: 'l', html: '<b>Модули справа:</b> прицелы, фонарик, ЛЦУ, дульные устройства, рукояти, магазины. Изменения сразу видны на модели.' },
  { el: () => $('#slotbar').getBoundingClientRect(), side: 'b', html: '<b>6 слотов снаряжения.</b> В слот — одно основное оружие, пистолет, 120 патронов к основному (30/33 к пистолету) или одна граната М67/М84. Основное — только одно, пистолет — только один. Кнопка «Взять в снаряжение» кладёт выбранное оружие в слот.' },
  { el: () => $('#back').getBoundingClientRect(), side: 'r', html: '<b>«←» — назад в лобби.</b> Всё сохраняется автоматически, и ваш генерал получит это оружие с выбранными модулями.' }
];
function showCoach() {
  const st = COACH[coachStep];
  if (!coachHl) { coachHl = el('div', 'coach-hl'); document.body.appendChild(coachHl); }
  if (!coachBox) { coachBox = el('div', 'sg-coach'); document.body.appendChild(coachBox); }
  const r = st.el(), pad = 6;
  Object.assign(coachHl.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
  coachBox.className = `sg-coach ar-${{ r: 'l', l: 'r', b: 't' }[st.side]}`;
  const last = coachStep === COACH.length - 1;
  coachBox.innerHTML = `<div class="cn">ПОДСКАЗКА ${coachStep + 1}/${COACH.length}</div>${st.html}<div class="sg-coach-nav"><button class="skip">Пропустить</button><button class="next">${last ? 'Понятно' : 'Далее →'}</button></div>`;
  coachBox.querySelector('.skip').onclick = endCoach;
  coachBox.querySelector('.next').onclick = () => { coachStep++; coachStep >= COACH.length ? endCoach() : showCoach(); };
  const bw = coachBox.offsetWidth, bh = coachBox.offsetHeight;
  let x, y;
  if (st.side === 'r') { x = r.right + 18; y = r.top + 8; }
  else if (st.side === 'l') { x = r.left - bw - 18; y = r.top + 8; }
  else { x = r.left + 24; y = r.bottom + 18; }
  coachBox.style.left = Math.max(8, Math.min(innerWidth - bw - 8, x)) + 'px';
  coachBox.style.top = Math.max(8, Math.min(innerHeight - bh - 8, y)) + 'px';
  coachBox.querySelector('.next').focus();
}
function startCoach() { coachStep = 0; showCoach(); }
function endCoach() {
  coachStep = -1;
  coachBox?.remove(); coachHl?.remove(); coachBox = coachHl = null;
  P.update((p) => { p.hints = p.hints || {}; p.hints.armory = true; });
}
addEventListener('resize', () => { if (coachStep >= 0) showCoach(); if (popSlot >= 0) closePop(); });

/* ---------- старт ---------- */
$('#back').onclick = goBack;
$('#take').onclick = take;
document.querySelectorAll('[data-preset]').forEach((b) => { b.onclick = () => applyPreset(b.dataset.preset); });
initGeneral();
renderGenerals();
renderSlots();
openWeapon(pickStartWeapon(), true);
if (qs.get('hints') === '1' || !prof().hints?.armory) setTimeout(() => { if (coachStep < 0) startCoach(); }, 900);
