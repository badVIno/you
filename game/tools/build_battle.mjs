#!/usr/bin/env node
/* Бандл моделей бойцов для боевого режима: те же модули game/src, что и в
   лобби (бойцы, кисти GLB, риг рук, поза, хват оружия), без логики лобби.
   Результат — lib/battle/soldiers.gen.js (классический скрипт; перед
   загрузкой страница задаёт window.THREE). Запуск: node game/tools/build_battle.mjs */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODULES = ['core/util.js', 'viewmodel/vm.js', 'viewmodel/hand_assets.js', 'viewmodel/hands.js', 'viewmodel/wspec.js',
  'soldier/textures.js', 'core/geobuf.js', 'soldier/skeleton.js', 'soldier/procedural.js', 'soldier/body.js',
  'soldier/clothing.js', 'soldier/gear.js', 'soldier/character.js', 'soldier/rig.js', 'anim/locomotion.js', 'anim/pose.js', 'weapon/hold.js'];

const PRELUDE = `/* СГЕНЕРИРОВАНО tools/build_battle.mjs — не править вручную. */
(function () {
  if (window.GAssets) return;
  const local = location.protocol === 'http:' || location.protocol === 'https:';
  const CDN = ['https://cdn.jsdelivr.net/gh/badVIno/you@main/game/'];
  const bases = local ? [new URL('./', location.href).href, ...CDN] : CDN;
  const data = {}, jobs = [];
  async function fetchAny(path, kind) {
    let err;
    for (const b of bases) {
      try {
        const r = await fetch(b + path);
        if (!r.ok) throw new Error(r.status + ' ' + path);
        return kind === 'json' ? await r.json() : kind === 'blob' ? await r.blob() : await r.arrayBuffer();
      } catch (e) { err = e; }
    }
    throw err;
  }
  async function image(path) { return createImageBitmap(await fetchAny(path, 'blob'), { imageOrientation: 'flipY' }); }
  function add(name, p) { jobs.push(Promise.resolve(p).then((v) => { data[name] = v; }, (e) => { console.warn('asset ' + name + ' failed:', e && e.message); data[name] = null; })); }
  window.GAssets = { bases, data, fetchAny, image, add, progress: () => jobs.length, ready: () => Promise.all(jobs) };
})();
`;
const out = [PRELUDE];
for (const m of MODULES) {
  const p = join(ROOT, 'src', m);
  if (!existsSync(p)) { console.warn('skip (нет файла):', m); continue; }
  out.push(`/* ---- ${m} ---- */`, readFileSync(p, 'utf8'));
}
const target = join(ROOT, 'lib/battle/soldiers.gen.js');
writeFileSync(target, out.join('\n'));
console.log('built', target, out.join('\n').length, 'chars');
