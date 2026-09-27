/* ============================================================================
   SIGNUM — боевой режим. Подключается к странице карты при ?battle
   (см. tools/patch_maps.py): ждёт готовности карты, строит навигацию и силы
   сторон, показывает экран развёртывания, дальше крутится в хуке кадра карты.
   ========================================================================== */
import * as PROFILE from '../profile.js';
import { MAP_RULES } from './config.js';
import { Battle } from './battle.js';
import { Hud } from './hud.js';
import { PlayerCtl } from './player.js';
import { BattleAudio } from './audio.js';
import { ProxyVis } from './vis_proxy.js';

const load = document.createElement('div');
load.id = 'sg-load';
load.innerHTML = '<div class="t">SIGNUM</div><div class="s" id="sg-ls">ПОДГОТОВКА КАРТЫ…</div><div class="bar"><i id="sg-lb"></i></div>';
document.body.appendChild(load);
const stage = (t, k) => { document.getElementById('sg-ls').textContent = t; document.getElementById('sg-lb').style.width = (k * 100) + '%'; };
window.SIGNUM_FATAL = (e) => { stage('ОШИБКА: ' + ((e && e.message) || e), 1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

async function waitMap() {
  for (let i = 0; i < 2400; i++) {
    if (window.MAP_READY && window.MAP_API) return 'forest';
    if (window.ANGAR && window.ANGAR.scene) return 'hangar';
    if (window.MAP_ERROR) throw new Error(window.MAP_ERROR);
    await wait(100);
  }
  throw new Error('карта не загрузилась');
}

/* Снимок карты сверху (ортографическая камера) — фон тактической карты и радара. */
function captureTopDown(A, T, units) {
  const I = A.mapImage, S = 1024;
  const r = A.renderer, cam = new T.OrthographicCamera(-I.size / 2, I.size / 2, I.size / 2, -I.size / 2, 1, 900);
  cam.position.set(I.x0 + I.size / 2, 400, I.z0 + I.size / 2);
  cam.up.set(0, 0, -1);
  cam.lookAt(I.x0 + I.size / 2, 0, I.z0 + I.size / 2);
  const fog = A.scene.fog, size = r.getSize(new T.Vector2()), pr = r.getPixelRatio();
  const restore = A.prepareCapture ? A.prepareCapture() : null;
  A.scene.fog = null;
  if (units) units.visible = false;
  r.setPixelRatio(1); r.setSize(S, S, false);
  r.setRenderTarget(null);
  r.render(A.scene, cam);
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  ctx.drawImage(r.domElement, 0, 0, S, S);
  /* лёгкое затемнение и контраст — маркеры читаются лучше */
  ctx.fillStyle = 'rgba(8,12,10,.18)'; ctx.fillRect(0, 0, S, S);
  r.setPixelRatio(pr); r.setSize(size.x, size.y, false);
  A.scene.fog = fog;
  if (units) units.visible = true;
  if (restore) restore();
  return cv;
}

async function main() {
  const kind = await waitMap();
  stage('СБОРКА БОЯ…', 0.35);
  await frame();
  const profile = PROFILE.load();
  let deploy = null;
  try { deploy = JSON.parse(localStorage.getItem('signum:deploy') || 'null'); } catch (e) { deploy = null; }
  let random = false;
  if (!deploy || deploy.map !== kind) { deploy = PROFILE.resolveDeploy(profile); random = !profile.general; }
  if (deploy.random) random = true;
  const sum = PROFILE.summarize(deploy.loadout);
  if (!sum.primary && !sum.secondary) { deploy.loadout = PROFILE.randomLoadout(); random = true; }
  const rules = MAP_RULES[kind];
  let battle = null, hud = null, ctl = null;
  let last = performance.now();
  const onFrame = (dt) => {
    if (!battle || !window.SIGNUM_BATTLE_ACTIVE) { if (hud) hud.update(dt); return; }
    const t0 = performance.now();
    battle.update(dt);
    ctl.update(dt);
    battle.vis.update(dt, battle.units, battle);
    hud.update(dt);
    PERF.logic = PERF.logic * 0.95 + (performance.now() - t0) * 0.05;
  };
  const PERF = { logic: 0 };
  const mod = kind === 'forest' ? await import('./adapters/forest.js') : await import('./adapters/hangar.js');
  const A = (kind === 'forest' ? mod.createForestAdapter : mod.createHangarAdapter)(onFrame);
  const T = A.T;
  stage('НАВИГАЦИЯ И УКРЫТИЯ…', 0.5);
  await frame();
  const audio = new BattleAudio(A.audio, () => {
    const c = A.camera, right = new T.Vector3(1, 0, 0).applyQuaternion(c.quaternion);
    return { pos: c.position, right };
  });
  audio.setVolume(profile.settings.volume ?? 0.8);
  let vis = new ProxyVis(T, A.scene);
  battle = new Battle({ T, A, rules, deploy, vis, audio });
  battle.setup();
  A.setBattle(battle);
  stage('БОЙЦЫ…', 0.7);
  await frame();
  try {
    const V = await import('./visuals.js');
    vis = await V.createVisuals(T, A, battle, profile, (t, k) => stage(t, 0.7 + k * 0.25));
    battle.vis = vis;
  } catch (e) { console.warn('[battle] модели бойцов недоступны, упрощённые фигуры:', e); }
  for (const u of battle.units) vis.add(u);
  hud = new Hud(battle, A, profile);
  battle.hud = hud;
  ctl = new PlayerCtl(battle, A, profile, deploy, hud);
  battle.playerCtl = ctl;
  try {
    const VM = await import('./viewmodel.js');
    ctl.vm = await VM.createViewmodel(T, A, ctl, profile);
  } catch (e) { console.warn('[battle] viewmodel:', e); }
  stage('СНИМОК КАРТЫ…', 0.97);
  await frame();
  try { hud.setMapImage(captureTopDown(A, T, vis.root)); } catch (e) { console.warn('[battle] карта:', e); }
  load.remove();
  window.__SIGNUM = { battle, A, hud, ctl, T, PERF, captureTopDown: () => captureTopDown(A, T, vis.root) };
  hud.deploy({ general: deploy.general, team: deploy.team, sum: PROFILE.summarize(deploy.loadout), random }, () => {
    audio.init();
    A.start(deploy.team);
    const u = battle.player;
    battle.placeAtSpawn(u, false);
    A.player.respawn(u.pos.x, u.pos.z, u.yaw);
    window.SIGNUM_BATTLE_ACTIVE = true;
    ctl.lock();
    ctl.vm && ctl.vm.show(ctl.weapon);
    hud.message(`${rules.title.split('·')[0].trim()} · вперёд, к флагу противника`, 3);
  });
}

main().catch((e) => { console.error(e); window.SIGNUM_FATAL(e); });
