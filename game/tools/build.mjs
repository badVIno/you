#!/usr/bin/env node
/* Сборка игры в один файл start.html из модулей src/.
   Порядок модулей важен: каждый модуль регистрирует себя в глобальной
   области (self.GUtil, self.GChar, ...) и берёт оттуда зависимости. */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BAR = '/* ==========================================================================';
const END = '   ========================================================================== */';

/* [файл, заголовок-баннер или null] */
const ORDER = [
  ['shell/head.html', null],
  ['core/boot.js', null],
  ['weapon/attach.js', null],
  ['weapon/ak74.js', null],
  ['core/util.js', 'МОДУЛЬ: util.js'],
  ['soldier/textures.js', 'МОДУЛЬ: textures.js'],
  ['core/geobuf.js', 'МОДУЛЬ: geobuf.js'],
  ['soldier/skeleton.js', 'МОДУЛЬ: skeleton.js'],
  ['soldier/procedural.js', 'МОДУЛЬ: soldier.js'],
  ['soldier/body.js', 'МОДУЛЬ: soldier/body.js'],
  ['soldier/clothing.js', 'МОДУЛЬ: soldier/clothing.js'],
  ['soldier/hands.js', 'МОДУЛЬ: soldier/hands.js'],
  ['soldier/gear.js', 'МОДУЛЬ: soldier/gear.js'],
  ['soldier/character.js', 'МОДУЛЬ: character.js'],
  ['soldier/rig.js', 'МОДУЛЬ: rig.js'],
  ['anim/locomotion.js', 'МОДУЛЬ: anim/locomotion.js'],
  ['world/world.js', 'МОДУЛЬ: world.js'],
  ['world/fx.js', 'МОДУЛЬ: fx.js'],
  ['world/audio.js', 'МОДУЛЬ: audio.js'],
  ['game/player.js', 'МОДУЛЬ: player.js'],
  ['game/game.js', 'МОДУЛЬ: game.js'],
  ['core/start.js', 'ЗАПУСК'],
  ['shell/tail.html', null]
];

const out = [];
for (const [file, banner] of ORDER) {
  if (banner) out.push(BAR, '   ' + banner, END);
  out.push(readFileSync(join(ROOT, 'src', file), 'utf8'));
}
const target = process.argv[2] || join(ROOT, 'start.html');
writeFileSync(target, out.join('\n'));
console.log('built', target, out.join('\n').length, 'chars');
