/* ============================================================================
   Звук. Полный синтез через WebAudio, внешних файлов нет.

   Выстрел собирается из четырёх слоёв: ударный фронт (щелчок сверхзвука),
   низкий «бум» пороховых газов, механика затвора и хвост отражений от
   деревьев и построек. Шаги и снаряжение звучат тише, но именно они дают
   ощущение веса.
   ========================================================================== */
(function (root, factory) {
  const A = factory(root.GUtil);
  if (typeof module !== 'undefined' && module.exports) module.exports = A;
  else root.GAudio = A;
})(typeof self !== 'undefined' ? self : this, function (U) {
  'use strict';

  const rnd = (a, b) => a + Math.random() * (b - a);

  function create() {
    const A = {
      ctx: null, on: true, master: null, dry: null, conv: null, echo: null, nb: null,
      listener: null
    };

    A.init = function () {
      if (A.ctx) return A.ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { A.on = false; return null; }
      const ctx = A.ctx = new AC();

      /* Тракт микрофона бодикама (по AudioEngine из bodycam_angar.html):
         маленькая капсула не берёт низ (срез 120 Гц) и верх (7,8 кГц), у неё
         подъём присутствия около 2,8 кГц; дальше — перегруз предусилителя и
         жёсткий компрессор с автоуровнем. Именно это даёт «звук с бодикама»:
         выстрел сплющен и хрустит, а шаги, дыхание и шорох снаряжения —
         близко и громко. */
      const master = ctx.createGain(); master.gain.value = A.vol;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 120; hp.Q.value = 0.7;
      const pres = ctx.createBiquadFilter(); pres.type = 'peaking'; pres.frequency.value = 2800; pres.Q.value = 0.9; pres.gain.value = 4;
      const lpm = ctx.createBiquadFilter(); lpm.type = 'lowpass'; lpm.frequency.value = 7800;
      const drive = ctx.createWaveShaper();
      const curve = new Float32Array(2048);
      for (let i = 0; i < curve.length; i++) { const x = i / (curve.length - 1) * 2 - 1; curve[i] = Math.tanh(2.2 * x) / Math.tanh(2.2); }
      drive.curve = curve; drive.oversample = '2x';
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -26; comp.knee.value = 6; comp.ratio.value = 12;
      comp.attack.value = 0.001; comp.release.value = 0.45;
      const makeup = ctx.createGain(); makeup.gain.value = 1.9;
      const out = ctx.createGain(); out.gain.value = 0.62;
      master.connect(hp); hp.connect(pres); pres.connect(lpm); lpm.connect(drive);
      drive.connect(comp); comp.connect(makeup); makeup.connect(out); out.connect(ctx.destination);

      const dry = ctx.createGain(); dry.gain.value = 1; dry.connect(master);

      /* открытое пространство: короткая ранняя часть, длинный тихий хвост */
      const conv = ctx.createConvolver();
      conv.buffer = mkIR(ctx, 1.9);
      const wet = ctx.createGain(); wet.gain.value = 0.46;
      conv.connect(wet); wet.connect(master);

      /* шлепок от кромки леса: заметная задержка ~0,17 с (≈ 28 м) */
      const dl = ctx.createDelay(1.0); dl.delayTime.value = 0.168;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1150;
      const fb = ctx.createGain(); fb.gain.value = 0.24;
      const dg = ctx.createGain(); dg.gain.value = 0.36;
      dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(dg); dg.connect(master);

      A.master = master; A.dry = dry; A.conv = conv; A.echo = dl;
      A.nb = mkNoise(ctx, 2.4);

      /* Фон: ветер в соснах (низкий шум с медленным «дыханием»), шипение
         капсулы. И ветер в микрофоне: на ходу и особенно на бегу воздух
         бьёт в капсулу — низкое бубнение, громкость задаёт A.motion(). */
      const loop = (freqType, f, q, g) => {
        const s = ctx.createBufferSource(); s.buffer = A.nb; s.loop = true;
        const fl = ctx.createBiquadFilter(); fl.type = freqType; fl.frequency.value = f; fl.Q.value = q;
        const gg = ctx.createGain(); gg.gain.value = g;
        s.connect(fl); fl.connect(gg); gg.connect(master); s.start(0, Math.random() * 2);
        return { s, fl, gg };
      };
      const wind = loop('lowpass', 520, 0.5, 0.030);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09;
      const lfoG = ctx.createGain(); lfoG.gain.value = 0.014;
      lfo.connect(lfoG); lfoG.connect(wind.gg.gain); lfo.start();
      loop('highpass', 4800, 0.6, 0.009);
      A.micWind = loop('lowpass', 260, 0.9, 0.0001);
      A.micWind.s.playbackRate.value = 0.8;
      return ctx;
    };

    /* k — 0..1 от скорости: ветер в микрофоне */
    A.motion = function (k) {
      if (!A.ctx || !A.micWind || !A.on) return;
      const t = A.ctx.currentTime, kk = U.clamp01(k);
      A.micWind.gg.gain.setTargetAtTime(0.0001 + 0.075 * kk * kk, t, 0.25);
      A.micWind.fl.frequency.setTargetAtTime(180 + 260 * kk, t, 0.3);
    };

    function mkNoise(ctx, sec) {
      const n = Math.floor(ctx.sampleRate * sec);
      const b = ctx.createBuffer(2, n, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c);
        let last = 0;
        for (let i = 0; i < n; i++) {
          const w = Math.random() * 2 - 1;
          last = 0.86 * last + 0.14 * w;
          d[i] = w * 0.72 + last * 0.55;
        }
      }
      return b;
    }

    function mkIR(ctx, sec) {
      const n = Math.floor(ctx.sampleRate * sec);
      const b = ctx.createBuffer(2, n, ctx.sampleRate);
      const taps = [0.013, 0.022, 0.034, 0.051, 0.068, 0.089, 0.113, 0.146, 0.183, 0.229];
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c);
        let lp = 0;
        for (let i = 0; i < n; i++) {
          const t = i / ctx.sampleRate;
          const env = Math.pow(1 - t / sec, 2.7) * Math.exp(-t * 1.4);
          const w = Math.random() * 2 - 1;
          lp = lp * 0.64 + w * 0.36;
          d[i] = (w * 0.34 + lp * 0.66) * env * 0.5;
        }
        for (let k = 0; k < taps.length; k++) {
          const idx = Math.floor((taps[k] + (c ? 0.0038 : 0)) * ctx.sampleRate);
          if (idx < n) d[idx] += (Math.random() < 0.5 ? -1 : 1) * 0.46 * Math.pow(1 - k / taps.length, 1.7);
        }
      }
      return b;
    }

    /* шумовой слой */
    A.nz = function (t0, dur, o) {
      const ctx = A.ctx; o = o || {};
      const src = ctx.createBufferSource();
      src.buffer = A.nb; src.loop = true;
      src.playbackRate.value = o.rate || 1;
      let node = src;
      if (o.type) {
        const f = ctx.createBiquadFilter();
        f.type = o.type; f.Q.value = o.q === undefined ? 1 : o.q;
        f.frequency.setValueAtTime(o.freq || 1000, t0);
        if (o.freq2) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.freq2), t0 + dur);
        node.connect(f); node = f;
      }
      if (o.hp) {
        const h = ctx.createBiquadFilter();
        h.type = 'highpass'; h.frequency.value = o.hp; h.Q.value = 0.7;
        node.connect(h); node = h;
      }
      const g = ctx.createGain();
      const pk = Math.max(0.0006, (o.gain === undefined ? 0.3 : o.gain) * (o.vol === undefined ? 1 : o.vol));
      const atk = o.atk === undefined ? 0.0012 : o.atk;
      g.gain.setValueAtTime(0.0004, t0);
      g.gain.exponentialRampToValueAtTime(pk, t0 + atk);
      g.gain.exponentialRampToValueAtTime(0.0004, t0 + dur);
      g.gain.setValueAtTime(0, t0 + dur + 0.005);
      node.connect(g);
      g.connect(A.dry);
      if (o.wet) { const w = ctx.createGain(); w.gain.value = o.wet; g.connect(w); w.connect(A.conv); }
      if (o.echo) { const e = ctx.createGain(); e.gain.value = o.echo; g.connect(e); e.connect(A.echo); }
      src.start(t0, Math.random() * 1.6);
      src.stop(t0 + dur + 0.03);
    };

    /* тональный слой */
    A.osc = function (t0, dur, f0, f1, gain, type, o) {
      const ctx = A.ctx; o = o || {};
      const s = ctx.createOscillator();
      s.type = type || 'sine';
      s.frequency.setValueAtTime(f0, t0);
      if (f1 && f1 !== f0) s.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0004, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0006, gain), t0 + (o.atk || 0.0015));
      g.gain.exponentialRampToValueAtTime(0.0004, t0 + dur);
      g.gain.setValueAtTime(0, t0 + dur + 0.005);
      s.connect(g); g.connect(A.dry);
      if (o.wet) { const w = ctx.createGain(); w.gain.value = o.wet; g.connect(w); w.connect(A.conv); }
      if (o.echo) { const e = ctx.createGain(); e.gain.value = o.echo; g.connect(e); e.connect(A.echo); }
      s.start(t0); s.stop(t0 + dur + 0.03);
    };

    A.now = (d) => A.ctx.currentTime + (d || 0);
    const ready = () => A.on && A.init();

    /* ------------------------------------------------------- выстрел -- */
    A.shot = function (opts) {
      if (!ready()) return;
      const o = opts || {};
      const t = A.now(0.001);
      const supp = o.suppressed ? 0.42 : 1;   // глушитель режет фронт и хвост
      const v = (o.vol === undefined ? 1 : o.vol);

      /* фронт: широкополосный щелчок */
      A.nz(t, 0.030, { type: 'highpass', freq: 1500, q: 0.6, gain: 0.95 * supp * v, atk: 0.0006, wet: 0.5, echo: 0.42 });
      A.nz(t, 0.012, { type: 'bandpass', freq: rnd(3200, 4400), q: 1.0, gain: 0.72 * supp * v, atk: 0.0004 });
      /* тело: пороховой «бум» */
      A.nz(t + 0.001, 0.115, { type: 'lowpass', freq: 640, freq2: 180, q: 0.9, gain: 0.85 * v, atk: 0.0022, wet: 0.55, echo: 0.5 });
      A.osc(t, 0.090, 138, 46, 0.52 * v, 'sine', { wet: 0.4, echo: 0.3 });
      A.osc(t, 0.045, 260, 88, 0.28 * supp * v, 'triangle', { wet: 0.3 });
      /* мех: лязг затворной рамы */
      A.nz(t + 0.014, 0.045, { type: 'bandpass', freq: 2350, q: 2.0, gain: 0.30 * v, wet: 0.3 });
      A.nz(t + 0.036, 0.040, { type: 'bandpass', freq: 1580, q: 1.6, gain: 0.26 * v, wet: 0.28 });
      /* хвост: раскат по участку */
      A.nz(t + 0.045, 0.62, { type: 'lowpass', freq: 900, freq2: 220, q: 0.7, gain: 0.20 * supp * v, atk: 0.02, wet: 0.85, echo: 0.6 });
    };

    A.dryFire = function () {
      if (!ready()) return;
      const t = A.now(0.001);
      A.nz(t, 0.020, { type: 'bandpass', freq: 2700, q: 3.0, gain: 0.30, atk: 0.0006 });
      A.osc(t, 0.030, 420, 190, 0.10, 'square');
    };

    /* --------------------------------------------------- перезарядка --
       Прежние звуки строились на синусах и треугольниках с медленным спадом —
       ухо слышало их как колокольчики. Металл звучит иначе: очень резкая
       атака (доли миллисекунды), плотный шумовой удар и НЕгармоничные
       призвуки, которые гаснут за 30–60 мс. Поэтому здесь всё собрано из
       узкополосного шума, а тональные слои — короткие и приглушённые. */

    /* Удар металла о металл.

       ДОБРОТНОСТЬ ОГРАНИЧЕНА. Деталь оружия закреплена в ствольной коробке и
       зажата рукой — она не может звенеть как камертон. Узкий фильтр (Q = 7…11)
       именно это и делал: чем выше Q, тем дольше «висит» тон, и стук
       превращался в звоночек. Здесь Q держится в районе 2,5–4: слышен удар и
       характер металла, но без послезвучия.

       Частоты сдвинуты вниз и разведены нецелыми отношениями (1,47 / 2,09):
       у реальной железки обертоны негармоничные, поэтому слух не собирает
       их в «ноту». */
    function clack(t, o) {
      const g = o.gain === undefined ? 0.3 : o.gain;
      const f = (o.freq || 2000) * 0.78;
      const q = Math.min(o.q === undefined ? 3.0 : o.q * 0.38, 4.0);
      const dur = (o.dur || 0.030) * 0.85;
      A.nz(t, dur, { type: 'bandpass', freq: f, q: q,
        gain: g, atk: 0.0004, wet: o.wet === undefined ? 0.12 : o.wet * 0.7 });
      A.nz(t + 0.001, dur * 0.6, { type: 'bandpass', freq: f * 1.47,
        q: q * 1.15, gain: g * 0.40, atk: 0.0003 });
      A.nz(t + 0.002, dur * 0.4, { type: 'bandpass', freq: f * 2.09,
        q: q * 1.3, gain: g * 0.18, atk: 0.0003 });
      /* низ: «тело» детали — основная масса звука, очень короткое */
      A.nz(t, dur * 1.5, { type: 'lowpass', freq: o.body || 420,
        q: 0.7, gain: g * 0.70, atk: 0.0012, wet: 0.10 });
    }

    /* Нажатие защёлки магазина: короткий сухой щелчок пружины. */
    A.magOut = function () {
      if (!ready()) return;
      const t = A.now(0.001);
      clack(t, { freq: 2650, q: 9, gain: 0.30, dur: 0.020, body: 380 });
      /* трение магазина о приёмник — шорох, а не тон */
      A.nz(t + 0.012, 0.075, { type: 'bandpass', freq: 1150, q: 1.1,
        gain: 0.16, atk: 0.006, wet: 0.16 });
    };

    /* Магазин выходит из шахты и падает: глухой удар по грунту. */
    A.magDrop = function () {
      if (!ready()) return;
      const t = A.now(0.001);
      A.nz(t, 0.055, { type: 'bandpass', freq: 780, q: 1.6, gain: 0.26,
        atk: 0.0022, wet: 0.2 });
      A.nz(t, 0.110, { type: 'lowpass', freq: 240, q: 0.9, gain: 0.30,
        atk: 0.004, wet: 0.24 });
      /* Дребезг патронов в коробе. Q снижен с 8 до 1,8: латунь в стальном
         коробе стучит глухо и вразнобой, звенящего тона там нет. */
      for (let i = 0; i < 3; i++)
        A.nz(t + 0.02 + Math.random() * 0.05, 0.020,
          { type: 'bandpass', freq: rnd(900, 1900), q: 1.8, gain: 0.042 });
    };

    /* Новый магазин входит в шахту: удар корпуса + защёлка. */
    A.magIn = function () {
      if (!ready()) return;
      const t = A.now(0.001);
      /* подвод и удар о приёмник */
      A.nz(t, 0.045, { type: 'lowpass', freq: 520, q: 0.9, gain: 0.34,
        atk: 0.0018, wet: 0.2 });
      clack(t + 0.004, { freq: 1850, q: 6, gain: 0.34, dur: 0.028, body: 460 });
      /* характерный для АК доворот и щелчок фиксатора */
      clack(t + 0.052, { freq: 3100, q: 11, gain: 0.30, dur: 0.018, body: 340 });
    };

    /* Затворная рама на возврате: тяжёлый лязг с металлическим звоном. */
    A.boltRelease = function () {
      if (!ready()) return;
      const t = A.now(0.001);
      /* рама идёт вперёд — шорох пружины */
      A.nz(t, 0.035, { type: 'bandpass', freq: 2400, q: 2.2, gain: 0.22, atk: 0.001 });
      /* удар в переднее положение: главный акцент */
      clack(t + 0.030, { freq: 1450, q: 5, gain: 0.62, dur: 0.045, body: 300, wet: 0.3 });
      A.nz(t + 0.030, 0.140, { type: 'lowpass', freq: 300, q: 0.9, gain: 0.42,
        atk: 0.0016, wet: 0.3 });
      /* Послезвучие ствольной коробки. Было Q = 9 на 3,6 кГц — ровно тот
         «звоночек» в конце перезарядки. Теперь это короткий широкий призвук. */
      A.nz(t + 0.036, 0.055, { type: 'bandpass', freq: 2100, q: 2.0, gain: 0.075, atk: 0.001 });
    };
    A.selector = function () {
      if (!ready()) return;
      const t = A.now(0.001);
      /* Переводчик огня АКМ: сухой щелчок штампованной пластины по коробке.
         Тональный слой убран — он давал музыкальный призвук. Фильтры широкие
         (Q < 1), иначе на хвосте остаётся различимая высота тона. */
      A.nz(t, 0.016, { type: 'highpass', freq: 1200, q: 0.5, gain: 0.30, atk: 0.0004 });
      A.nz(t, 0.024, { type: 'lowpass', freq: 520, q: 0.6, gain: 0.15, atk: 0.0009 });
    };

    /* -------------------------------------------------------- гильза -- */
    A.caseHit = function (v) {
      if (!A.on || !A.ctx) return;
      const t = A.now(0.001);
      const g = 0.075 * U.clamp(v, 0.15, 1);
      /* Гильза о грунт: латунь по земле стучит глухо. Q снижен с 6,5 до 2,2,
         иначе каждая гильза давала отчётливый звон. */
      A.nz(t, 0.024, { type: 'bandpass', freq: rnd(1500, 2600), q: 2.2, gain: g, wet: 0.16 });
      A.nz(t + 0.004, 0.016, { type: 'highpass', freq: 4200, q: 0.7, gain: g * 0.32, wet: 0.12 });
    };

    /* --------------------------------------------------------- шаги --- */
    /* Берц по лесной подстилке (хвоя, сухие листья, веточки поверх грунта).
       Строение — как у footstep() из bodycam_angar.html, но под лес:

       шаг  — пятка: глухой удар грунта (короткий тон 110→55 Гц + низкий
              шум), через 55–85 мс перекат на носок; подстилка трещит серией
              коротких щелчков 1,8–4,5 кГц — хвоя и листья ломаются под
              подошвой; изредка хрустит веточка;
       бег  — стопа ставится на середину: один тяжёлый удар (105 кг с бронёй),
              хруст короче и гуще, бронежилет и подсумки подпрыгивают
              (глухой удар 380–560 Гц), магазины в подсумках постукивают,
              ткань шуршит.
       Тонов с долгим спадом нет: через подъём присутствия у микрофона они
       превращаются в «тик-тик». side — правая/левая нога: у ног немного
       разный тембр, шаги не звучат как копия друг друга. */
    function litter(t0, span, count, gain, lo, hi) {
      for (let i = 0; i < count; i++) {
        const t = t0 + Math.pow(Math.random(), 1.6) * span;
        A.nz(t, rnd(0.008, 0.022), { type: 'bandpass', freq: rnd(lo, hi), q: rnd(0.9, 1.6),
          gain: gain * rnd(0.45, 1), atk: 0.0006 });
      }
    }
    A.step = function (hard, vol, run, side) {
      if (!ready()) return;
      const t = A.now(0.001);
      const k = (vol === undefined ? 1 : vol);
      const r = U.clamp01(run || 0);
      const v = rnd(0.85, 1.15);
      const f = rnd(0.92, 1.08) * (side > 0 ? 1.04 : 0.96);

      if (r < 0.5) {
        /* пятка */
        A.osc(t, 0.07, 110 * f, 55, 0.26 * k * v, 'sine');
        A.nz(t, 0.05, { type: 'lowpass', freq: 620 * f, q: 0.6, gain: 0.30 * k * v, atk: 0.0012, wet: 0.08 });
        litter(t + 0.003, 0.07, 5 + (Math.random() * 3 | 0), 0.05 * k, 1800, 4200);
        /* перекат на носок */
        const roll = t + rnd(0.055, 0.085);
        A.nz(roll, 0.045, { type: 'lowpass', freq: 880 * f, q: 0.6, gain: 0.12 * k * v, atk: 0.0015 });
        litter(roll, 0.05, 3 + (Math.random() * 2 | 0), 0.035 * k, 2200, 4500);
        /* ткань брюк и куртки */
        A.nz(t + 0.02, 0.09, { type: 'bandpass', freq: 1300 * f, q: 0.6, gain: 0.022 * k, atk: 0.02 });
      } else {
        /* один тяжёлый удар середины стопы */
        A.osc(t, 0.09, 95 * f, 45, 0.44 * k * v * r, 'sine');
        A.nz(t, 0.06, { type: 'lowpass', freq: 780 * f, q: 0.6, gain: 0.42 * k * v, atk: 0.0012, wet: 0.08 });
        litter(t + 0.002, 0.05, 7 + (Math.random() * 4 | 0), 0.065 * k, 1600, 4500);
        /* отталкивание носком: подстилка разлетается */
        A.nz(t + rnd(0.05, 0.07), 0.05, { type: 'highpass', freq: 2600, q: 0.5, gain: 0.03 * k * r, atk: 0.004 });
        /* бронежилет и подсумки подпрыгивают и садятся обратно */
        A.nz(t + rnd(0.04, 0.07), 0.07, { type: 'bandpass', freq: rnd(380, 560), q: 1.1, gain: 0.16 * k * r, atk: 0.002 });
        /* магазины в подсумках */
        if (Math.random() < 0.4) A.nz(t + rnd(0.05, 0.09), 0.02, { type: 'bandpass', freq: rnd(1000, 1400), q: 2.5, gain: 0.035 * k * r, atk: 0.0008 });
        /* ткань и стропы */
        A.nz(t + 0.03, 0.15, { type: 'bandpass', freq: 2200, q: 0.5, gain: 0.03 * k * r, atk: 0.04 });
      }
      /* веточка под ногой */
      if (Math.random() < 0.07 + 0.05 * r) {
        const ts = t + rnd(0.004, 0.03);
        A.nz(ts, 0.012, { type: 'bandpass', freq: rnd(2200, 3200), q: 2.2, gain: 0.10 * k, atk: 0.0004 });
        A.nz(ts + rnd(0.012, 0.03), 0.01, { type: 'bandpass', freq: rnd(1600, 2600), q: 2.0, gain: 0.05 * k, atk: 0.0004 });
      }
    };

    /* Снаряжение на корпусе: нейлон, стропы, подсумки. Тоже без металла. */
    A.gearRattle = function (vol) {
      if (!ready()) return;
      const t = A.now(0.001);
      const v = vol === undefined ? 1 : vol;
      for (let i = 0; i < 2; i++) {
        A.nz(t + rnd(0, 0.06), 0.075, { type: 'bandpass', freq: rnd(600, 1400),
          q: 1.2, gain: 0.026 * v, atk: 0.010 });
      }
    };

    /* Дыхание ртом (как breath() в исходнике): вдох — выше и мягче, выдох —
       ниже и плотнее. k — 0..1, от спокойного до сбитого после бега. */
    A.breath = function (k, inhale) {
      if (!ready() || !(k > 0.02)) return;
      const t = A.now(0.001);
      if (inhale) {
        A.nz(t, 0.30 + 0.1 * k, { type: 'bandpass', freq: rnd(1300, 1600), q: 0.9, gain: 0.05 * k, atk: 0.14 });
      } else {
        A.nz(t, 0.28 + 0.12 * k, { type: 'bandpass', freq: rnd(700, 950), q: 0.8, gain: 0.08 * k, atk: 0.03 });
        A.nz(t, 0.2, { type: 'lowpass', freq: 420, q: 0.7, gain: 0.05 * k, atk: 0.02 });
      }
    };

    /* попадание в мишень: звонкий шлепок картона/стали с задержкой по
       дистанции — звук летит 343 м/с, на 30 м это заметные 90 мс */
    A.targetHit = function (dist, steel) {
      if (!ready()) return;
      const t = A.now(0.001 + U.clamp(dist, 0, 120) / 343);
      const v = U.clamp(1 - dist / 90, 0.2, 1);
      if (steel) {
        A.osc(t, 0.30, rnd(760, 1150), rnd(300, 420), 0.20 * v, 'triangle', { wet: 0.5, echo: 0.4 });
        A.nz(t, 0.12, { type: 'bandpass', freq: 2600, q: 2.4, gain: 0.16 * v, wet: 0.4 });
      } else {
        A.nz(t, 0.055, { type: 'bandpass', freq: rnd(900, 1500), q: 1.4, gain: 0.22 * v, wet: 0.45, echo: 0.3 });
        A.osc(t, 0.07, rnd(180, 280), 90, 0.10 * v, 'sine', { wet: 0.3 });
      }
    };

    A.targetFall = function (dist) {
      if (!ready()) return;
      const t = A.now(0.35 + U.clamp(dist, 0, 120) / 343);
      const v = U.clamp(1 - dist / 90, 0.2, 1);
      A.nz(t, 0.16, { type: 'lowpass', freq: 500, q: 0.8, gain: 0.22 * v, atk: 0.004, wet: 0.5, echo: 0.3 });
      A.osc(t, 0.14, 120, 52, 0.14 * v, 'sine', { wet: 0.35 });
    };

    /* «щелчок» интерфейса и подтверждение захвата персонажа */
    A.ui = function (up) {
      if (!ready()) return;
      const t = A.now(0.001);
      A.osc(t, 0.07, up ? 520 : 380, up ? 880 : 240, 0.07, 'sine');
      A.nz(t, 0.02, { type: 'highpass', freq: 3800, gain: 0.05 });
    };

    A.resume = function () {
      if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume();
    };
    A.setMuted = function (m) {
      A.on = !m;
      if (A.master) A.master.gain.value = m ? 0 : A.vol;
    };
    /* громкость из настроек (0..1) */
    A.vol = 0.8;
    A.setVolume = function (v) {
      A.vol = Math.max(0, Math.min(1, +v || 0));
      if (A.master && A.on) A.master.gain.value = A.vol;
    };

    return A;
  }

  return { create };
});