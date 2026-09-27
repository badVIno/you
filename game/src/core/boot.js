import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sky } from 'three/addons/objects/Sky.js';
import * as PROFILE from './lib/profile.js';

/* Внешние ассеты (модели бойцов, текстуры, окружение) лежат в game/assets.
   С веб-сервера они берутся по относительному пути; при открытии файла
   напрямую (file://) браузер не даёт fetch, поэтому используется копия
   репозитория на jsDelivr. Модули регистрируют загрузки через add(), игра
   стартует после ready(); упавшая загрузка даёт null, и модуль обязан
   откатиться к процедурному варианту. */
const GAssets = (() => {
  /* сначала копия в этом репозитории, затем исходный репозиторий (ассеты те же) */
  const CDN = ['https://cdn.jsdelivr.net/gh/badVIno/you@main/game/', 'https://cdn.jsdelivr.net/gh/v67686792-lang/lolo@main/game/'];
  const local = location.protocol === 'http:' || location.protocol === 'https:';
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
  async function image(path) {
    const bmp = await createImageBitmap(await fetchAny(path, 'blob'), { imageOrientation: 'flipY' });
    return bmp;
  }
  function add(name, promise) {
    jobs.push(Promise.resolve(promise).then((v) => { data[name] = v; },
      (e) => { console.warn('asset ' + name + ' failed:', e && e.message); data[name] = null; }));
  }
  const progress = () => jobs.length;
  return { bases, data, fetchAny, image, add, progress, ready: () => Promise.all(jobs) };
})();
window.GAssets = GAssets;
/* Общий профиль игрока (lib/profile.js) и библиотека оружия (lib/weapons):
   оружие грузится как ассет — при сбое генералы просто остаются без оружия. */
window.GProfile = PROFILE;
GAssets.add('weapons', import('./lib/weapons/index.js'));

const errEl = document.getElementById('err');
const showErr = (e) => {
  errEl.style.display = 'flex';
  errEl.textContent = 'Ошибка:\n' + ((e && e.message) || e) + '\n\n' + ((e && e.stack) || '');
  if (e && e.stack) console.error(e);
};

/* Модули игры собираются в глобальную область (см. tools/build.js). */
window.THREE = THREE;
window.__ADDONS = { RoomEnvironment, Sky };

