/* ============================================================================
   SIGNUM — общий профиль игрока (localStorage), единый для всех страниц:
   лобби (start.html), оружейная (armory.html), карты (forest.html, hangar.html).

   Схема:
   {
     v: 1,
     tutorialDone: false,            // подсказки первого запуска пройдены
     general: 'delta_1' | null,      // выбранный генерал
     loadouts: { delta_1: Loadout|null, delta_2, alpha_1, alpha_2 },
     settings: { quality, sens, fov, volume, keys: { action: code } }
   }
   Loadout = { slots: [Slot|null × 6], weapons: { [weaponId]: cfg } }
     cfg — конфигурация модулей оружейной (формат gunsmith: slotKey -> {id,pos}|id|null)
   Slot =
     { kind: 'primary',   id: 'akm' }          // основное (только одно)
     { kind: 'secondary', id: 'glock18c' }     // пистолет (только один)
     { kind: 'ammo', for: 'primary' | 'secondary' }   // 120 патронов основного / 30–33 пистолета
     { kind: 'grenade', id: 'm67' | 'm84' }    // одна граната
   ========================================================================== */

export const KEY = 'signum:profile';

export const GENERALS = [
  { key: 'delta_1', team: 'delta', name: 'ДЕЛЬТА-1', callsign: 'Кедр' },
  { key: 'delta_2', team: 'delta', name: 'ДЕЛЬТА-2', callsign: 'Сойка' },
  { key: 'alpha_1', team: 'alpha', name: 'АЛЬФА-1', callsign: 'Ворон' },
  { key: 'alpha_2', team: 'alpha', name: 'АЛЬФА-2', callsign: 'Тис' }
];

/* Порядок — как в меню оружейной. file — страница-полигон в game/weapons. */
export const WEAPONS = [
  { id: 'ak74', title: 'АК-74М', kind: 'primary', cal: '5,45×39', file: 'ak74_modular.html' },
  { id: 'akm', title: 'АКМ', kind: 'primary', cal: '7,62×39', file: 'akm.html' },
  { id: 'm416', title: 'M416', kind: 'primary', cal: '5,56×45', file: 'm416.html' },
  { id: 'scar', title: 'SCAR-H', kind: 'primary', cal: '7,62×51', file: 'scar-h.html' },
  { id: 'svd', title: 'СВД', kind: 'primary', cal: '7,62×54R', file: 'svd.html' },
  { id: 'm870', title: 'Remington 870', kind: 'primary', cal: '12/76', file: 'remington870.html' },
  { id: 'mp5a3', title: 'MP5A3', kind: 'primary', cal: '9×19', file: 'mp5a3.html' },
  { id: 'glock18c', title: 'Glock 18C', kind: 'secondary', cal: '9×19', file: 'glock18c.html' }
];
export const weaponById = (id) => WEAPONS.find((w) => w.id === id) || null;

export const SLOT_COUNT = 6;
export const AMMO_PER_SLOT = { primary: 120 };
/* Патронов пистолета в слоте: 33 при удлинённом магазине, иначе 30. */
export function pistolAmmoPerSlot(cfg) {
  const m = cfg && cfg.mag;
  const id = typeof m === 'string' ? m : (m && m.id) || '';
  return /33|50|drum|ext/i.test(id) ? 33 : 30;
}

/* Действия управления: группа, подпись, клавиша по умолчанию.
   Коды — KeyboardEvent.code; мышь — 'Mouse0' (ЛКМ), 'Mouse2' (ПКМ), 'Mouse1'. */
export const ACTIONS = [
  { id: 'fwd', group: 'Движение', label: 'Вперёд', def: 'KeyW' },
  { id: 'back', group: 'Движение', label: 'Назад', def: 'KeyS' },
  { id: 'left', group: 'Движение', label: 'Влево', def: 'KeyA' },
  { id: 'right', group: 'Движение', label: 'Вправо', def: 'KeyD' },
  { id: 'sprint', group: 'Движение', label: 'Бег', def: 'ShiftLeft' },
  { id: 'crouch', group: 'Движение', label: 'Присесть', def: 'KeyC' },
  { id: 'jump', group: 'Движение', label: 'Прыжок', def: 'Space' },
  { id: 'leanL', group: 'Движение', label: 'Наклон влево', def: 'KeyQ' },
  { id: 'leanR', group: 'Движение', label: 'Наклон вправо', def: 'KeyE' },
  { id: 'fire', group: 'Бой', label: 'Огонь', def: 'Mouse0' },
  { id: 'aim', group: 'Бой', label: 'Прицеливание', def: 'Mouse2' },
  { id: 'reload', group: 'Бой', label: 'Перезарядка', def: 'KeyR' },
  { id: 'fireMode', group: 'Бой', label: 'Режим огня', def: 'KeyB' },
  { id: 'primary', group: 'Бой', label: 'Основное оружие', def: 'Digit1' },
  { id: 'secondary', group: 'Бой', label: 'Пистолет', def: 'Digit2' },
  { id: 'frag', group: 'Бой', label: 'Граната М67', def: 'KeyG' },
  { id: 'flash', group: 'Бой', label: 'Светошумовая М84', def: 'KeyT' },
  { id: 'use', group: 'Взаимодействие', label: 'Выбрать / пополнить (удерживать)', def: 'KeyF' },
  { id: 'order', group: 'Взаимодействие', label: 'Отметить бойца для приказа', def: 'KeyX' },
  { id: 'map', group: 'Взаимодействие', label: 'Тактическая карта', def: 'KeyM' },
  { id: 'menu', group: 'Взаимодействие', label: 'Меню', def: 'Tab' },
  { id: 'inspect', group: 'Взаимодействие', label: 'Осмотреть оружие', def: 'KeyV' },
  { id: 'thirdPerson', group: 'Взаимодействие', label: 'Вид от третьего лица (полигон)', def: 'KeyP' }
];

export const QUALITY = ['low', 'medium', 'high'];
export const QUALITY_LABEL = { low: 'Низкая', medium: 'Средняя', high: 'Высокая' };

function defaults() {
  const keys = {};
  for (const a of ACTIONS) keys[a.id] = a.def;
  return {
    v: 1,
    tutorialDone: false,
    general: null,
    loadouts: { delta_1: null, delta_2: null, alpha_1: null, alpha_2: null },
    settings: { quality: 'medium', sens: 1, fov: 72, volume: 0.8, keys }
  };
}

export function load() {
  const d = defaults();
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
  if (!s || typeof s !== 'object') return d;
  const p = Object.assign(d, s);
  p.settings = Object.assign(defaults().settings, s.settings || {});
  p.settings.keys = Object.assign(defaults().settings.keys, (s.settings && s.settings.keys) || {});
  p.loadouts = Object.assign(defaults().loadouts, s.loadouts || {});
  if (!QUALITY.includes(p.settings.quality)) p.settings.quality = 'medium';
  return p;
}

export function save(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* приватный режим */ }
  /* Оружейные страницы читают своё качество из gunsmith:quality. */
  try { localStorage.setItem('gunsmith:quality', { low: 'low', medium: 'mid', high: 'high' }[p.settings.quality]); } catch (e) { /* нет доступа */ }
  return p;
}

export function update(fn) { const p = load(); fn(p); return save(p); }

export function emptyLoadout() { return { slots: new Array(SLOT_COUNT).fill(null), weapons: {} }; }

export function validateSlots(slots) {
  let prim = 0, sec = 0;
  for (const s of slots) {
    if (!s) continue;
    if (s.kind === 'primary') prim++;
    if (s.kind === 'secondary') sec++;
  }
  if (prim > 1) return 'Можно взять только одно основное оружие';
  if (sec > 1) return 'Можно взять только один пистолет';
  return null;
}

/* Сводка снаряжения: что в руках, сколько патронов и гранат. */
export function summarize(lo) {
  const out = { primary: null, secondary: null, primaryAmmo: 0, secondaryAmmo: 0, m67: 0, m84: 0 };
  if (!lo) return out;
  for (const s of lo.slots) {
    if (!s) continue;
    if (s.kind === 'primary') out.primary = s.id;
    else if (s.kind === 'secondary') out.secondary = s.id;
    else if (s.kind === 'grenade') out[s.id] = (out[s.id] || 0) + 1;
  }
  for (const s of lo.slots) {
    if (!s || s.kind !== 'ammo') continue;
    if (s.for === 'primary') out.primaryAmmo += AMMO_PER_SLOT.primary;
    else out.secondaryAmmo += pistolAmmoPerSlot(lo.weapons && lo.weapons[out.secondary || 'glock18c']);
  }
  return out;
}

/* Случайное снаряжение (если игрок ничего не выбрал перед боем). */
export function randomLoadout() {
  const prim = WEAPONS.filter((w) => w.kind === 'primary');
  const w = prim[Math.floor(Math.random() * prim.length)];
  return {
    slots: [{ kind: 'primary', id: w.id }, { kind: 'ammo', for: 'primary' }, { kind: 'ammo', for: 'primary' },
      { kind: 'secondary', id: 'glock18c' }, { kind: 'ammo', for: 'secondary' }, { kind: 'grenade', id: 'm67' }],
    weapons: {}
  };
}

/* Кто и с чем идёт в бой: выбранный генерал или случайный. */
export function resolveDeploy(p) {
  const general = p.general || GENERALS[Math.floor(Math.random() * GENERALS.length)].key;
  let lo = p.loadouts[general];
  const sum = summarize(lo);
  if (!lo || (!sum.primary && !sum.secondary && !sum.m67 && !sum.m84)) lo = randomLoadout();
  return { general, team: general.startsWith('delta') ? 'delta' : 'alpha', loadout: lo };
}

/* Подпись клавиши для интерфейса. */
export function keyLabel(code) {
  if (!code) return '—';
  const M = { Mouse0: 'ЛКМ', Mouse1: 'СКМ', Mouse2: 'ПКМ', Mouse3: 'М4', Mouse4: 'М5', Space: 'ПРОБЕЛ',
    ShiftLeft: 'SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'CTRL', ControlRight: 'R-CTRL', AltLeft: 'ALT',
    AltRight: 'R-ALT', Tab: 'TAB', Escape: 'ESC', Enter: 'ENTER', Backspace: '⌫', CapsLock: 'CAPS',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '`', Minus: '-', Equal: '=',
    BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\' };
  if (M[code]) return M[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6);
  return code;
}

/* Обратная карта «код -> действия» для обработчиков ввода. */
export function codeMap(p) {
  const m = {};
  for (const [a, c] of Object.entries(p.settings.keys)) if (c) (m[c] || (m[c] = [])).push(a);
  return m;
}
