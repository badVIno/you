/* ============================================================================
   Лобби SIGNUM: правая панель (карточка генерала), «Настройки», «В бой»
   (выбор карты), «Оружие» (переход в оружейную) и подсказки первого запуска.
   Разметка и стили — shell/head.html, общие компоненты — lib/ui.css,
   данные — lib/profile.js (передаётся в api.profile).

   API (self.GLobby):
     const L = GLobby.create({
       profile,                     // модуль lib/profile.js
       toast(text, ms),
       getSelected() -> key|null,   // выбранный генерал
       setSelected(key),
       weaponOf(key) -> title|null, // что сейчас в руках у генерала
       labelOf(key) -> Element|null,// подпись генерала над головой (для подсказок)
       onSettings(profile),         // настройки изменены и сохранены
       onModal(open)                // открыто/закрыто окно (ввод игры на паузе)
     })
     L.openSettings('keys'|'gfx'), L.openMaps(), L.close(), L.isModal()
     L.capturing()   // окно, подсказка или ожидание клавиши — игре ввод не нужен
     L.refresh()     // карточка генерала, подписи клавиш
     L.key(action, down)            // подсветка W A S D
     L.tutorial(force?), L.armoryHint(key)
     L.deploy('forest'|'hangar'), L.openArmory()
     L.nav = (url) => location.href = url   // переопределяется в тестах
   ========================================================================== */
(function (root, factory) {
  const L = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = L;
  else root.GLobby = L;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAPS = [
    {
      id: 'forest', page: 'forest.html', img: 'img/map_forest.jpg', tag: 'ЛЕС',
      title: 'ТИХИЙ БОР', sub: 'FOREST CAMP',
      fallback: 'radial-gradient(circle at 30% 35%,#4f6b3c 0,#2c3f24 38%,#1b2717 70%),linear-gradient(135deg,#34502d,#16200f)',
      text: 'Лесной лагерь у озера: турбаза, окопы, вышки и сосновый бор. Длинные дистанции, укрытия за стволами и в траншеях.',
      facts: [['84', 'бойца на карте'], ['2 × 20', 'бойцов у генерала'], ['3', 'респауна у бойца'], ['4', 'респауна у генерала']],
      goal: 'Захватить и уничтожить флаг противника или уничтожить всю живую силу.'
    },
    {
      id: 'hangar', page: 'hangar.html', img: 'img/map_hangar.jpg', tag: 'АНГАР',
      title: 'АНГАР-07', sub: 'HANGAR',
      fallback: 'radial-gradient(circle at 65% 40%,#5d646b 0,#343a40 40%,#1a1d21 75%),linear-gradient(135deg,#3b4248,#141619)',
      text: 'Авиаангар и лётное поле: двухэтажный штаб, контейнеры, вертолёты. Ближний бой, узкие проходы, огонь со второго этажа.',
      facts: [['44', 'бойца на карте'], ['2 × 10', 'бойцов у генерала'], ['2', 'респауна у бойца'], ['3', 'респауна у генерала']],
      goal: 'Захватить и уничтожить флаг противника или уничтожить всю живую силу.'
    }
  ];

  const QDESC = {
    low: 'Без теней и AO, пониженное разрешение — для слабых ноутбуков',
    medium: 'Тени, сглаживание, полное разрешение',
    high: 'Мягкие тени высокого разрешения, AO, HiDPI'
  };
  const GFX_DEFAULT = { quality: 'medium', sens: 1, fov: 72, volume: 0.8 };

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function create(api) {
    const P = api.profile;
    const L = { nav: (url) => { location.href = url; } };
    let modal = null;           // открытое окно
    let waitAct = null;         // действие, ждущее новую клавишу
    let coach = null;           // { steps, i, onDone }

    const gen = (key) => P.GENERALS.find((g) => g.key === key) || null;
    const teamName = (t) => (t === 'delta' ? 'ДЕЛЬТА' : 'АЛЬФА');

    /* ------------------------------------------------ панель меню --- */
    function refresh() {
      const p = P.load();
      const key = api.getSelected();
      const g = gen(key);
      const box = $('#menuSel');
      if (box) {
        if (g) {
          const w = api.weaponOf(key);
          box.innerHTML = `<span>ВАШ ГЕНЕРАЛ</span><b>${esc(g.name)} · «${esc(g.callsign)}»</b>` +
            `<span class="team ${g.team}">КОМАНДА ${teamName(g.team)}</span>` +
            `<span class="wpn">${w ? 'В руках: ' + esc(w) : 'Без оружия — выберите в «Оружии»'}</span>`;
        } else {
          box.innerHTML = '<span>ГЕНЕРАЛ НЕ ВЫБРАН</span><b>Подлетите и удерживайте ' +
            esc(P.keyLabel(p.settings.keys.use)) + '</b><span class="wpn">или в бою будет случайный генерал</span>';
        }
      }
      const K = p.settings.keys;
      for (const el of document.querySelectorAll('#wasd [data-act]')) el.textContent = P.keyLabel(K[el.dataset.act]);
      const foot = $('#menuFoot');
      if (foot) {
        foot.innerHTML = `<div><span class="sg-key">${esc(P.keyLabel(K.menu))}</span> меню</div>` +
          `<div><span class="sg-key">${esc(P.keyLabel(K.use))}</span> удерживать у генерала — выбрать</div>`;
      }
    }

    function key(act, down) {
      const el = document.querySelector('#wasd [data-act="' + act + '"]');
      if (el) el.classList.toggle('on', !!down);
      if (down) { const w = $('#wasd'); if (w) w.classList.remove('hint'); }
    }

    /* ------------------------------------------------------ окна ---- */
    function openModal(id) {
      close();
      modal = document.getElementById(id);
      modal.classList.add('on');
      if (document.pointerLockElement) document.exitPointerLock();
      api.onModal && api.onModal(true);
    }
    function close() {
      cancelWait();
      if (!modal) return;
      modal.classList.remove('on');
      modal = null;
      api.onModal && api.onModal(false);
    }
    for (const m of document.querySelectorAll('.sg-modal')) {
      m.addEventListener('mousedown', (e) => { if (e.target === m && !waitAct) close(); });
      for (const x of m.querySelectorAll('[data-close]')) x.addEventListener('click', close);
    }

    /* ------------------------------------------------- настройки ---- */
    let tab = 'keys';
    function openSettings(t) {
      openModal('mSettings');
      setTab(t || tab);
    }
    function setTab(t) {
      tab = t;
      for (const b of document.querySelectorAll('#mSettings [data-tab]')) b.classList.toggle('on', b.dataset.tab === t);
      for (const p of document.querySelectorAll('#mSettings [data-pane]')) p.hidden = p.dataset.pane !== t;
      note(t === 'keys' ? 'Нажмите на клавишу, затем новую клавишу или кнопку мыши. <b>ESC</b> — отмена.'
        : 'Изменения применяются сразу и сохраняются.');
      if (t === 'keys') renderKeys(); else renderGfx();
    }
    for (const b of document.querySelectorAll('#mSettings [data-tab]')) b.addEventListener('click', () => { cancelWait(); setTab(b.dataset.tab); });
    const note = (html) => { const n = $('#setNote'); if (n) n.innerHTML = html; };
    const labelOfAct = (id) => P.ACTIONS.find((a) => a.id === id).label;

    function renderKeys() {
      const K = P.load().settings.keys;
      const groups = [];
      for (const a of P.ACTIONS) {
        let g = groups.find((x) => x.name === a.group);
        if (!g) groups.push(g = { name: a.group, list: [] });
        g.list.push(a);
      }
      $('#keyGrid').innerHTML = groups.map((g) => `<div class="kgroup"><h3>${esc(g.name)}</h3>` +
        g.list.map((a) => `<div class="krow" data-act="${a.id}"><span>${esc(a.label)}</span>` +
          `<button class="sg-key" type="button">${esc(P.keyLabel(K[a.id]))}</button></div>`).join('') + '</div>').join('');
      for (const row of document.querySelectorAll('#keyGrid .krow')) {
        row.querySelector('.sg-key').addEventListener('click', (e) => { e.stopPropagation(); startWait(row.dataset.act); });
      }
    }
    const rowOf = (act) => document.querySelector('#keyGrid .krow[data-act="' + act + '"]');
    function startWait(act) {
      cancelWait();
      waitAct = act;
      const r = rowOf(act);
      r.classList.add('wait');
      r.querySelector('.sg-key').textContent = '…';
      note('Нажмите новую клавишу или кнопку мыши для «<b>' + esc(labelOfAct(act)) + '</b>». <b>ESC</b> — отмена.');
    }
    function cancelWait() {
      if (!waitAct) return;
      waitAct = null;
      renderKeys();
    }
    /* Клавиша уже занята — действия меняются клавишами. */
    function bind(code) {
      const act = waitAct;
      waitAct = null;
      let swapped = null;
      const p = P.update((pp) => {
        const K = pp.settings.keys, old = K[act];
        for (const [other, c] of Object.entries(K)) {
          if (other !== act && c === code) { K[other] = old; swapped = other; }
        }
        K[act] = code;
      });
      renderKeys();
      if (swapped) {
        note(`«<b>${esc(labelOfAct(act))}</b>» — ${esc(P.keyLabel(code))}; «<b>${esc(labelOfAct(swapped))}</b>» получает ` +
          `${esc(P.keyLabel(p.settings.keys[swapped]))} (клавиши поменялись местами).`);
        const r = rowOf(swapped);
        if (r) r.classList.add('flash');
      } else note(`«<b>${esc(labelOfAct(act))}</b>» — ${esc(P.keyLabel(code))}. Сохранено.`);
      const r = rowOf(act);
      if (r) r.classList.add('flash');
      api.onSettings && api.onSettings(p);
      refresh();
      return swapped;
    }
    /* Ожидание клавиши и подсказки перехватывают ввод раньше игры (фаза захвата). */
    window.addEventListener('keydown', (e) => {
      if (waitAct) {
        e.preventDefault(); e.stopImmediatePropagation();
        if (e.code === 'Escape') { cancelWait(); note('Отменено.'); } else bind(e.code);
        return;
      }
      if (coach) {
        if (e.code === 'Enter' || e.code === 'ArrowRight') { e.preventDefault(); coachNext(); }
        else if (e.code === 'Escape') coachEnd();
        if (e.code === 'Tab') e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (modal && e.code === 'Escape') { e.stopImmediatePropagation(); close(); }
    }, true);
    window.addEventListener('mousedown', (e) => {
      if (!waitAct) return;
      if (e.target.closest && e.target.closest('#mSettings header, #mSettings footer')) return;
      e.preventDefault(); e.stopImmediatePropagation();
      bind('Mouse' + e.button);
    }, true);
    window.addEventListener('contextmenu', (e) => { if (modal) e.preventDefault(); }, true);
    $('#keysReset').addEventListener('click', () => {
      cancelWait();
      const p = P.update((pp) => {
        if (tab === 'keys') { for (const a of P.ACTIONS) pp.settings.keys[a.id] = a.def; }
        else Object.assign(pp.settings, GFX_DEFAULT);
      });
      if (tab === 'keys') { renderKeys(); note('Клавиши по умолчанию восстановлены.'); } else { renderGfx(); note('Графика и камера — по умолчанию.'); }
      api.onSettings && api.onSettings(p);
      refresh();
    });

    function renderGfx() {
      const s = P.load().settings;
      $('#qRow').innerHTML = P.QUALITY.map((q) => `<button type="button" class="qbtn${s.quality === q ? ' on' : ''}" data-q="${q}">` +
        `${esc(P.QUALITY_LABEL[q].toUpperCase())}<small>${esc(QDESC[q])}</small></button>`).join('');
      for (const b of document.querySelectorAll('#qRow .qbtn')) {
        b.addEventListener('click', () => {
          const p = P.update((pp) => { pp.settings.quality = b.dataset.q; });
          for (const x of document.querySelectorAll('#qRow .qbtn')) x.classList.toggle('on', x === b);
          note('Качество: <b>' + esc(P.QUALITY_LABEL[b.dataset.q]) + '</b>. Применено.');
          api.onSettings && api.onSettings(p);
        });
      }
      const rows = [
        ['sens', 'Чувствительность мыши', 0.2, 3, 0.05, (v) => '×' + v.toFixed(2)],
        ['fov', 'Поле зрения (FOV)', 60, 100, 1, (v) => Math.round(v) + '°'],
        ['volume', 'Громкость', 0, 1, 0.01, (v) => Math.round(v * 100) + '%']
      ];
      $('#sRows').innerHTML = rows.map(([k, lbl, lo, hi, st]) => `<label class="srow"><span>${esc(lbl)}</span>` +
        `<input type="range" min="${lo}" max="${hi}" step="${st}" value="${s[k]}" data-k="${k}"><output></output></label>`).join('');
      for (const inp of document.querySelectorAll('#sRows input')) {
        const fmt = rows.find((r) => r[0] === inp.dataset.k)[5];
        const out = inp.parentElement.querySelector('output');
        out.textContent = fmt(+inp.value);
        inp.addEventListener('input', () => {
          out.textContent = fmt(+inp.value);
          const p = P.update((pp) => { pp.settings[inp.dataset.k] = +inp.value; });
          api.onSettings && api.onSettings(p);
        });
      }
    }

    /* ----------------------------------------------- выбор карты ---- */
    function openMaps() {
      openModal('mMaps');
      const box = $('#mapCards');
      box.innerHTML = MAPS.map((m) => `<button type="button" class="mcard" data-map="${m.id}" style="--fallback:${m.fallback}">` +
        `<div class="ph"><img src="${m.img}" alt="${esc(m.title)} — вид сверху"><span class="tag">${m.tag}</span></div>` +
        `<div class="bd"><h3>${esc(m.title)}<small>${esc(m.sub)}</small></h3><p>${esc(m.text)}</p><ul>` +
        m.facts.map(([n, t]) => `<li><b>${esc(n)}</b>${esc(t)}</li>`).join('') +
        `<li class="goal">${esc(m.goal)}</li></ul><div class="go"><span>В БОЙ</span><span>→</span></div></div></button>`).join('');
      /* нет снимка карты — остаётся градиент-заглушка */
      for (const img of box.querySelectorAll('img')) img.addEventListener('error', () => img.remove());
      for (const c of box.querySelectorAll('.mcard')) c.addEventListener('click', () => deploy(c.dataset.map));
      const p = P.load();
      const g = gen(p.general);
      const sum = P.summarize(g ? p.loadouts[g.key] : null);
      const wid = sum.primary || sum.secondary;
      const w = wid && P.weaponById(wid);
      let html;
      if (!g) html = 'Генерал не выбран — в бой пойдёт <b>случайный генерал</b> со <b>случайным оружием</b>.';
      else if (!w && !sum.m67 && !sum.m84) html = `<b>${esc(g.name)} «${esc(g.callsign)}»</b> без снаряжения — выдадим <b>случайное оружие</b>.`;
      else html = `В бой идёт <b>${esc(g.name)} «${esc(g.callsign)}»</b>, команда ${teamName(g.team)}` + (w ? `, в руках <b>${esc(w.title)}</b>.` : ', только гранаты.');
      $('#mapsNote').innerHTML = html;
    }

    function deploy(map) {
      const m = MAPS.find((x) => x.id === map);
      const p0 = P.load();
      const d = P.resolveDeploy(p0);
      const randomGeneral = !p0.general;
      const randomKit = d.loadout !== p0.loadouts[d.general];
      P.update((pp) => { pp.general = d.general; });
      try { localStorage.setItem('signum:deploy', JSON.stringify(Object.assign({}, d, { map, t: Date.now() }))); } catch (e) { /* приватный режим */ }
      const g = gen(d.general);
      const msgs = [];
      if (randomGeneral) msgs.push('Случайный генерал: ' + g.name + ' «' + g.callsign + '»');
      if (randomKit) {
        const s = P.summarize(d.loadout);
        const w = P.weaponById(s.primary || s.secondary);
        msgs.push('Случайное оружие: ' + (w ? w.title : '—'));
      }
      for (const t of msgs) api.toast(t, 2200);
      const url = m.page + '?battle=1';
      if (msgs.length) setTimeout(() => L.nav(url), 1300); else L.nav(url);
      return { url, deploy: d };
    }

    function openArmory() {
      let key = api.getSelected();
      const url = () => 'armory.html?general=' + encodeURIComponent(key);
      if (!key) {
        const g = P.GENERALS[Math.floor(Math.random() * P.GENERALS.length)];
        key = g.key;
        api.setSelected(key);
        api.toast('Генерал не выбран — назначен ' + g.name + ' «' + g.callsign + '»', 2000);
        setTimeout(() => L.nav(url()), 1300);
      } else L.nav(url());
      return key;
    }

    $('#btnBattle').addEventListener('click', openMaps);
    $('#btnSettings').addEventListener('click', () => openSettings());
    $('#btnArmory').addEventListener('click', openArmory);

    /* ------------------------------------------------ подсказки ---- */
    const coachEl = $('#coach'), ringEl = $('#coachRing');
    function coachShow() {
      const st = coach.steps[coach.i], n = coach.steps.length;
      const last = coach.i === n - 1;
      coachEl.innerHTML = (n > 1 ? `<div class="step">ШАГ ${coach.i + 1} ИЗ ${n}</div>` : '') +
        `<h4>${st.title}</h4><div>${st.text}</div><div class="sg-coach-nav">` +
        (last ? '' : '<button type="button" class="skip">Пропустить</button>') +
        `<button type="button" class="next">${last ? 'Понятно' : 'Далее'}</button></div>`;
      coachEl.querySelector('.next').addEventListener('click', coachNext);
      const sk = coachEl.querySelector('.skip');
      if (sk) sk.addEventListener('click', coachEnd);
      coachPlace();
    }
    function coachPlace() {
      if (!coach) return;
      const st = coach.steps[coach.i];
      const t = typeof st.target === 'function' ? st.target() : st.target ? $(st.target) : null;
      const r = t && t.getBoundingClientRect();
      const W = innerWidth, H = innerHeight;
      coachEl.className = 'sg-coach on';
      const bw = coachEl.offsetWidth, bh = coachEl.offsetHeight;
      if (!r || r.width === 0 || getComputedStyle(t).opacity === '0') {
        ringEl.classList.remove('on');
        coachEl.classList.add('center');
        /* без цели — внизу левой части, не закрывая генералов */
        const m = document.body.classList.contains('menu') && $('#menu');
        const freeW = W - (m ? m.offsetWidth : 0);
        coachEl.style.left = Math.round(Math.max(12, (freeW - bw) / 2)) + 'px';
        coachEl.style.top = Math.round(Math.min(H - bh - 12, H * 0.64 - bh / 2)) + 'px';
        return;
      }
      const pad = 8;
      ringEl.classList.add('on');
      Object.assign(ringEl.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
      const place = st.place || 'below';
      let x, y;
      if (place === 'left') { x = r.left - pad - 18 - bw; y = r.top + r.height / 2 - 30; }
      else if (place === 'above') { x = r.left; y = r.top - pad - 16 - bh; }
      else { x = r.left + r.width / 2 - 34; y = r.bottom + pad + 16; }
      const cx = Math.max(12, Math.min(W - bw - 12, x)), cy = Math.max(12, Math.min(H - bh - 12, y));
      coachEl.classList.add(place);
      coachEl.style.left = Math.round(cx) + 'px';
      coachEl.style.top = Math.round(cy) + 'px';
      if (place === 'left') coachEl.style.setProperty('--ay', Math.round(Math.max(14, Math.min(bh - 26, r.top + r.height / 2 - cy - 6))) + 'px');
      else coachEl.style.setProperty('--ax', Math.round(Math.max(14, Math.min(bw - 26, r.left + Math.min(r.width / 2, 40) - cx - 6))) + 'px');
    }
    function coachNext() {
      if (!coach) return;
      if (coach.i < coach.steps.length - 1) { coach.i++; coachShow(); } else coachEnd();
    }
    function coachEnd() {
      if (!coach) return;
      const done = coach.onDone;
      coach = null;
      coachEl.className = 'sg-coach';
      ringEl.classList.remove('on');
      done && done();
    }
    function runCoach(steps, onDone) {
      close();
      coach = { steps, i: 0, onDone };
      api.onModal && api.onModal(true);
      coachShow();
    }
    setInterval(coachPlace, 250);
    window.addEventListener('resize', coachPlace);

    function tutorial(force) {
      const p = P.load();
      if (p.tutorialDone && !force) return false;
      const K = p.settings.keys, kl = (a) => esc(P.keyLabel(K[a]));
      runCoach([
        { title: 'SIGNUM', text: '<b>Signum</b> — по-латыни «знамя легиона», знак и сигнал к атаке. Под ним строй держится вместе. ' +
          'Перед вами полигон: четыре генерала, две команды — <b>ДЕЛЬТА</b> и <b>АЛЬФА</b>.' },
        { title: 'ПОЛЁТ КАМЕРЫ', target: '#wasd', place: 'above',
          text: `<b>${kl('fwd')} ${kl('left')} ${kl('back')} ${kl('right')}</b> — камера летит по полигону, меню уезжает. Мышь — обзор, ` +
            `<b>${kl('sprint')}</b> — быстрее, <b>${kl('jump')}</b> / <b>${kl('crouch')}</b> — выше / ниже. Постойте 5 секунд или нажмите <b>${kl('menu')}</b> — меню вернётся.` },
        { title: 'ВЫБОР ГЕНЕРАЛА', target: () => api.labelOf(P.GENERALS[0].key), place: 'below',
          text: `Подлетите к любому генералу и <b>удерживайте ${kl('use')}</b> — он станет вашим, а камера войдёт в него. ` +
            `Удерживайте ${kl('use')} ещё раз, чтобы выйти, и выберите другого так же.` },
        { title: 'ОРУЖИЕ', target: '#btnArmory', place: 'left',
          text: 'Оружие, модули (прицелы, фонари, глушители) и <b>6 слотов</b> снаряжения: оружие, патроны, гранаты. ' +
            'Выбор сохраняется за генералом — оружие появится у него в руках.' },
        { title: 'НАСТРОЙКИ', target: '#btnSettings', place: 'left',
          text: 'Переназначьте клавиши (бег, огонь, прицел…) и выберите качество графики: низкое, среднее или высокое.' },
        { title: 'В БОЙ', target: '#btnBattle', place: 'left',
          text: 'Выбор карты: <b>Тихий бор</b> или <b>Ангар-07</b>. Если ничего не выбрали — пойдёте за <b>случайного генерала</b> со <b>случайным оружием</b>.' }
      ], () => { P.update((pp) => { pp.tutorialDone = true; }); api.onModal && api.onModal(false); });
      return true;
    }

    /* После первого возвращения из оружейной. */
    function armoryHint(key) {
      const p = P.load();
      if (p.hints && p.hints.armory) return false;
      const g = gen(key);
      const w = g && api.weaponOf(key);
      if (!w) return false;
      const kl = esc(P.keyLabel(p.settings.keys.use));
      runCoach([
        { title: 'ОРУЖИЕ ВЫДАНО', target: () => api.labelOf(key), place: 'below',
          text: `<b>${esc(g.name)} «${esc(g.callsign)}»</b> теперь держит <b>${esc(w)}</b> с выбранными модулями. Остальные генералы пока без оружия.` },
        { title: 'ДРУГОЙ ГЕНЕРАЛ', target: '#wasd', place: 'above',
          text: `Подлетите к другому генералу и удерживайте <b>${kl}</b> — он станет выбранным. Затем «Оружие» — и вооружите его тоже.` }
      ], () => { P.update((pp) => { pp.hints = Object.assign({}, pp.hints, { armory: true }); }); api.onModal && api.onModal(false); });
      return true;
    }

    Object.assign(L, {
      openSettings, openMaps, close, deploy, openArmory, refresh, key, tutorial, armoryHint, setTab,
      isModal: () => !!modal,
      capturing: () => !!(modal || waitAct || coach),
      coachActive: () => !!coach, coachNext, coachEnd,
      waiting: () => waitAct, MAPS
    });
    refresh();
    return L;
  }

  return { create, MAPS };
});
