// Генерирует game/lib/weapons/{engine,<id>}.js из страниц-полигонов game/weapons/*.html
// (esbuild-бандлы с маркерами «// src/...») и встраивает в эти страницы связь с оружейной SIGNUM
// (postMessage + режим ?embed=1; повторный запуск ничего не дублирует).
// Запуск: node game/tools/build_weapons.mjs
// Движок (материалы, геометрия, крепления, библиотека модулей) у всех страниц общий — берётся из первой
// и сверяется с остальными; секции оружия выносятся в отдельные модули (имена верхнего уровня пересекаются).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'weapons');
const OUT = path.join(ROOT, 'lib', 'weapons');
const FILES = { ak74: 'ak74_modular.html', akm: 'akm.html', m416: 'm416.html', scar: 'scar-h.html', svd: 'svd.html', m870: 'remington870.html', mp5a3: 'mp5a3.html', glock18c: 'glock18c.html' };

const ENGINE_RE = /^engine\/(materials|geo|lib\/common|mounts|ctx)\.js$|^engine\/lib\/[\w-]+\.js$|^weapons\/shared\.js$/;
const DECL_RE = /^(?:var|let|const|function\*?|async function|class)\s+([A-Za-z_$][\w$]*)|^import\s+\*\s+as\s+([\w$]+)|^import\s+\{([^}]*)\}/;

function sections(file) {
  const L = fs.readFileSync(file, 'utf8').replace(/\r/g, '').split('\n');
  const start = L.findIndex((l) => l.startsWith('var __defProp'));
  const end = L.findIndex((l, i) => i > start && /^<\/script>/.test(l));
  const marks = [];
  for (let i = start; i < end; i++) { const m = L[i].match(/^\/\/ src\/(.+)$/); if (m) marks.push({ name: m[1], i }); }
  const out = [{ name: '_header', lines: L.slice(start, marks[0].i) }];
  marks.forEach((m, k) => out.push({ name: m.name, lines: L.slice(m.i, k + 1 < marks.length ? marks[k + 1].i : end) }));
  return out;
}

function decls(lines) {
  const s = new Set(), ns = new Set();
  for (const l of lines) {
    const m = l.match(DECL_RE);
    if (!m) continue;
    if (m[1]) s.add(m[1]);
    else if (m[2]) ns.add(m[2]);
    else for (const x of m[3].split(',')) { const n = x.trim().split(/\s+as\s+/).pop(); if (n) ns.add(n); }
  }
  return { own: s, imported: ns };
}

const esc = (s) => s.replace(/\$/g, '\\$');
const uses = (text, name) => new RegExp(`(^|[^\\w$.])${esc(name)}\\b`, 'm').test(text);

const parsed = Object.fromEntries(Object.entries(FILES).map(([id, f]) => [id, sections(path.join(SRC, f))]));

// движок
const engineOf = (secs) => secs.filter((s) => s.name === '_header' || ENGINE_RE.test(s.name));
const ref = engineOf(parsed.akm);
const refText = ref.map((s) => s.lines.join('\n')).join('\n');
for (const [id, secs] of Object.entries(parsed)) {
  const t = engineOf(secs).map((s) => s.lines.join('\n')).join('\n');
  if (t !== refText) console.warn(`! ${id}: секции движка отличаются от akm (${t.length} vs ${refText.length})`);
}
const eng = decls(ref.flatMap((s) => s.lines));
const engNames = [...eng.own].sort();
const engine = [
  '// СГЕНЕРИРОВАНО game/tools/build_weapons.mjs из game/weapons/*.html — не редактировать вручную.',
  '// Общий движок оружейной: материалы, геометрия, крепления, сборщик и библиотека модулей.',
  refText.replace(/"three\/addons\//g, '"three/addons/'),
  '',
  `export { ${engNames.join(', ')} };`,
  ''
].join('\n');
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'engine.js'), engine);
console.log(`engine.js: ${engine.split('\n').length} строк, ${engNames.length} экспортов, ${(engine.length / 1024).toFixed(0)} КБ`);

// оружие
for (const [id, secs] of Object.entries(parsed)) {
  const si = secs.findIndex((s) => s.name === 'weapons/shared.js');
  const ws = secs.slice(si + 1).filter((s) => s.name.startsWith('weapons/'));
  const lines = ws.flatMap((s) => s.lines);
  const text = lines.join('\n');
  const d = decls(lines);
  const defLine = lines.filter((l) => /^var [\w$]+_default = \{/.test(l)).pop();
  if (!defLine) throw new Error(id + ': нет *_default');
  const defName = defLine.match(/^var ([\w$]+)/)[1];
  const need = engNames.filter((n) => !d.own.has(n) && !d.imported.has(n) && uses(text, n));
  const src = [
    `// СГЕНЕРИРОВАНО game/tools/build_weapons.mjs из game/weapons/${FILES[id]} — не редактировать вручную.`,
    `import { ${need.join(', ')} } from './engine.js';`,
    text,
    '',
    `export { ${defName} as def };`,
    ''
  ].join('\n');
  fs.writeFileSync(path.join(OUT, id + '.js'), src);
  console.log(`${id}.js: ${ws.map((s) => s.name).join(' + ')}, импорт ${need.length}, def=${defName}`);
}

// ---------- встраивание страниц в оружейную (armory.html) ----------
// Страница шлёт родителю {type:'gunsmith:cfg', weapon, cfg, stats} после загрузки и при каждом сохранении,
// принимает {type:'gunsmith:set', cfg}. ?embed=1 прячет карточку/статы слева (их показывает оболочка),
// &el=<px> — ширина меню оболочки слева, &et=<px> — высота панели слотов сверху.
const MARK = 'signum:embed';
const CSS = `/* ${MARK} */
body.embed{--el:292px;--et:120px}
body.embed .col-left{visibility:hidden;pointer-events:none;width:calc(var(--el) - 16px)!important;right:auto!important}
body.embed .mods{top:var(--et);bottom:16px;width:340px}
body.embed .bottom{left:var(--el);right:372px;gap:8px}
body.embed .ammo{min-width:0;padding:8px 12px;gap:10px}
body.embed .a-n{font-size:24px}
body.embed .bar{padding:6px;gap:4px}
body.embed .bar .btn{height:30px;padding:0 9px;font-size:11.5px}
body.embed .help,body.embed .ui.show-mods .help{right:372px;bottom:72px}
body.embed .toast,body.embed .ads-hint{top:calc(var(--et) + 4px)}
body.embed .shot-info{top:calc(var(--et) + 48px)}
</style>`;
const PATCHES = [
  ['</style>', CSS],
  ['      localStorage.setItem(LS, JSON.stringify(cfg));\n    } catch (e) {\n    }\n  }\n',
    '      localStorage.setItem(LS, JSON.stringify(cfg));\n    } catch (e) {\n    }\n    signumPost();\n  }\n' +
    `  // ${MARK}: сообщаем оболочке SIGNUM текущую сборку\n` +
    '  function signumPost() {\n    if (parent === window) return;\n    try {\n      parent.postMessage({ type: "gunsmith:cfg", weapon: def.id, cfg, stats: { ...st.stats, mag: st.cap } }, "*");\n    } catch (e) {\n    }\n  }\n'],
  ['  ui = new UI(app);\n  ui.refresh();\n',
    '  ui = new UI(app);\n  ui.refresh();\n' +
    `  // ${MARK}\n` +
    '  if (qs.get("embed") === "1") {\n    document.body.classList.add("embed");\n' +
    '    for (const k of ["el", "et"]) if (qs.get(k)) document.body.style.setProperty("--" + k, (+qs.get(k) || 0) + "px");\n  }\n' +
    '  addEventListener("message", (e) => {\n    const d = e.data;\n    if (!d || d.type !== "gunsmith:set" || !d.cfg) return;\n    ui.open = null;\n    applyConfig({ ...def.defaults, ...d.cfg });\n    saveCfg();\n  });\n' +
    '  signumPost();\n']
];
for (const f of Object.values(FILES)) {
  const file = path.join(SRC, f);
  const raw = fs.readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  let t = raw.replace(/\r\n/g, '\n');
  if (t.includes(MARK)) {
    // уже встроено: обновляем только блок стилей
    const u = t.replace(new RegExp(`/\\* ${MARK} \\*/[\\s\\S]*?</style>`), CSS);
    if (u !== t) fs.writeFileSync(file, crlf ? u.replace(/\n/g, '\r\n') : u);
    console.log(`${f}: уже встроено${u !== t ? ', стили обновлены' : ''}`);
    continue;
  }
  for (const [a, b] of PATCHES) {
    const i = t.indexOf(a);
    if (i < 0) throw new Error(`${f}: не найден фрагмент для встраивания: ${a.slice(0, 40)}`);
    t = t.slice(0, i) + b + t.slice(i + a.length);
  }
  fs.writeFileSync(file, crlf ? t.replace(/\n/g, '\r\n') : t);
  console.log(`${f}: встроено`);
}
