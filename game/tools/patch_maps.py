#!/usr/bin/env python3
"""Встраивает боевой режим SIGNUM в страницы карт (forest.html, hangar.html).

Правки минимальные и идемпотентные (метки /*SIGNUM-...*/), поэтому скрипт можно
прогнать повторно или на новой версии карты:
  * ранний скрипт в <head>: флаг ?battle, качество графики из профиля;
  * дополнительные экспорты во внешний API карты (коллизии, лучи, взрывы, флаги…);
  * хук кадра window.MAP_HOOKS (после симуляции, до отрисовки);
  * загрузчик lib/battle/main.js (только при ?battle — без него карта работает как раньше).
"""
import pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def sub_once(src, old, new, tag):
    if tag in src:
        return src
    if src.count(old) != 1:
        sys.exit(f'anchor for {tag!r} found {src.count(old)} times')
    return src.replace(old, new, 1)


LOADER = ('<script type="module">/*SIGNUM-LOADER*/if (window.SIGNUM_BATTLE) import("./lib/battle/main.js")'
          '.catch((e) => { console.error(e); window.SIGNUM_FATAL && window.SIGNUM_FATAL(e); });</script>\n</body>')


def patch_forest(src):
    boot = ('<meta charset="utf-8">\n<script>/*SIGNUM-BOOT*/(function(){var b=/[?&]battle\\b/.test(location.search);'
            'window.SIGNUM_BATTLE=b;if(!b)return;document.documentElement.classList.add("signum-battle");'
            'try{var p=JSON.parse(localStorage.getItem("signum:profile")||"{}");var q=(p.settings&&p.settings.quality)||"medium";'
            'localStorage.setItem("tikhiy_bor_q",{low:"low",medium:"medium",high:"high"}[q]||"medium");}catch(e){}})();</script>\n'
            '<link rel="stylesheet" href="lib/ui.css"><link rel="stylesheet" href="lib/battle/battle.css">')
    src = sub_once(src, '<meta charset="utf-8">', boot, 'SIGNUM-BOOT')
    api = ('window.MAP_API = {\n    validate,\n    /*SIGNUM-API*/ pushOut, supportTop, ceilingAt, nearby, hFast, rayCast, losClear, die, toast,'
           ' blast: BLAST, flagList: FLAGS, bases: BASE, houses: HOUSES, mines: MINES, frame: FRAME, enter, pauseGame,'
           ' pauseState: PAUSE, lakeRho, inBog, edgeDist, trenchDist, forestFast, blastExposure, initAudio, audio: AUDIO,'
           ' fx: FX, ladderAt, cal: CAL, ammoState: AMMO, inter: INTER, groundHit, crate: CRATE, spawnsAt: SPAWNS,')
    src = sub_once(src, 'window.MAP_API = {\n    validate,', api, 'SIGNUM-API')
    src = sub_once(src, '  updateLeaves(dt);\n  burnPlayer(',
                   '  updateLeaves(dt);\n  /*SIGNUM-HOOK*/ if (window.MAP_HOOKS) for (const f of window.MAP_HOOKS) f(dt);\n  burnPlayer(',
                   'SIGNUM-HOOK')
    src = sub_once(src, '  updateHud(dt);\n  const hint = hudEls()',
                   '  updateHud(dt);\n  /*SIGNUM-HUD*/ if (window.MAP_HUD_HOOKS) for (const f of window.MAP_HUD_HOOKS) f(dt);\n  const hint = hudEls()',
                   'SIGNUM-HUD')
    src = sub_once(src, '</body>', LOADER, 'SIGNUM-LOADER')
    return src


def patch_hangar(src):
    boot = ('<meta charset="utf-8">\n<script>/*SIGNUM-BOOT*/(function(){var b=/[?&]battle\\b/.test(location.search);'
            'window.SIGNUM_BATTLE=b;if(!b)return;document.documentElement.classList.add("signum-battle");'
            'try{var p=JSON.parse(localStorage.getItem("signum:profile")||"{}");var q=(p.settings&&p.settings.quality)||"medium";'
            'var u=new URL(location.href);if(!u.searchParams.has("q")){u.searchParams.set("q",{low:"low",medium:"med",high:"high"}[q]||"med");'
            'history.replaceState(null,"",u);}var a=JSON.parse(localStorage.getItem("angar07.settings")||"{}");delete a.keys;'
            'localStorage.setItem("angar07.settings",JSON.stringify(a));}catch(e){}})();</script>\n'
            '<script type="importmap">{"imports":{"three":"./lib/battle/three-shim.js","three/addons/":"https://unpkg.com/three@0.166.1/examples/jsm/"}}</script>\n'
            '<link rel="stylesheet" href="lib/ui.css"><link rel="stylesheet" href="lib/battle/battle.css">')
    src = sub_once(src, '<meta charset="utf-8">', boot, 'SIGNUM-BOOT')
    api = ('function api(stats) {\n  return {\n    /*SIGNUM-API*/ HOOKS, explode, bulletHit, impactFX, rayAll, rayFirst, GRP, hurt, feed, SND, spawnAt, setFly,'
           ' FLAGS, DAY, SURF_NAME, grenadeExplode, requestLock, AMMO_BOXES, updateSupply,\n    THREE,')
    src = sub_once(src, 'function api(stats) {\n  return {\n    THREE,', api, 'SIGNUM-API')
    src = sub_once(src, '  updateBurning(dt, t);\n',
                   '  updateBurning(dt, t);\n  /*SIGNUM-HOOK*/ if (window.MAP_HOOKS) for (const f of window.MAP_HOOKS) f(dt, t);\n',
                   'SIGNUM-HOOK')
    src = sub_once(src, '</body>', LOADER, 'SIGNUM-LOADER')
    return src


for name, fn in (('forest.html', patch_forest), ('hangar.html', patch_hangar)):
    p = ROOT / name
    raw = p.read_bytes().decode('utf-8')
    crlf = '\r\n' in raw
    s = raw.replace('\r\n', '\n')
    out = fn(s)
    if crlf:
        out = out.replace('\n', '\r\n')
    if out != raw:
        p.write_bytes(out.encode('utf-8'))
        print('patched', name)
    else:
        print('unchanged', name)
