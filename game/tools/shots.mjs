#!/usr/bin/env node
/* Съёмка кадров для визуальной проверки бойцов.
     node tools/shots.mjs shots.json out/
   shots.json — массив { name, js, wait }: js выполняется в странице
   (доступен window.__GAME), затем через wait мс снимается кадр.
   Нужен playwright (npm i playwright && npx playwright install chromium);
   путь к модулю можно задать переменной PLAYWRIGHT. WebGL — SwiftShader. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
/* без файла кадров — интерактивный режим: по строке JSON на команду из stdin
   ({name, js, wait} — кадр, {eval} — выполнить, {reload:true}, {quit:true}) */
const interactive = !process.argv[2] || process.argv[2] === '-';
const shots = interactive ? [] : JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = process.argv[3] || 'shots';
const W = +(process.env.W || 1280), H = +(process.env.H || 800);
mkdirSync(out, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.bin': 'application/octet-stream', '.hdr': 'application/octet-stream' };
const server = createServer((req, res) => {
  const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[' + m.type() + ']', m.text()); });
async function load() {
  const t0 = Date.now();
  await page.goto(`http://localhost:${port}/${process.env.PAGE || 'start.html'}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__GAME, null, { timeout: 240000 });
  console.log('game ready in', ((Date.now() - t0) / 1000).toFixed(1), 's');
  await page.addStyleTag({ content: '#start{display:none!important}' + (process.env.HUD ? '' : '#hud,#prompt,#toast{display:none!important}') });
}
async function shot(s) {
  const r = await page.evaluate(s.js || 'null');
  await page.waitForTimeout(s.wait === undefined ? 1200 : s.wait);
  const file = join(out, s.name + '.png');
  await page.screenshot({ path: file, timeout: 240000 });
  console.log('shot', file, r === undefined ? '' : JSON.stringify(r).slice(0, 1500));
}
await load();
for (const s of shots) await shot(s);
if (interactive) {
  const { createInterface } = await import('node:readline');
  console.log('READY');
  for await (const line of createInterface({ input: process.stdin })) {
    if (!line.trim()) continue;
    try {
      const c = JSON.parse(line);
      if (c.quit) break;
      if (c.reload) await load();
      else if (c.eval) console.log('eval', JSON.stringify(await page.evaluate(c.eval)).slice(0, 4000));
      else await shot(c);
    } catch (e) { console.log('ERR', e.message.split('\n')[0]); }
    console.log('READY');
  }
}
await browser.close();
server.close();
