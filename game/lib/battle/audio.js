/* ============================================================================
   Звук боя: синтез выстрелов по калибру, щелчок сверхзвуковой пули рядом,
   взрывы, светошумовая, звон гранаты. Задержка по скорости звука, спад и
   фильтрация по дистанции, панорама. Контекст берётся у карты.
   ========================================================================== */
const C_SOUND = 343;
const CAL = {
  r545: { body: 1.0, crack: 1, pitch: 1.1 }, r556: { body: 1.0, crack: 1, pitch: 1.12 },
  r762: { body: 1.25, crack: 1, pitch: 0.92 }, r762n: { body: 1.35, crack: 1, pitch: 0.88 },
  r762r: { body: 1.5, crack: 1, pitch: 0.85 }, p9: { body: 0.7, crack: 0, pitch: 1.25 }, g12: { body: 1.45, crack: 0, pitch: 0.8 }
};
export class BattleAudio {
  constructor(getCtx, listener) {
    this.getCtx = getCtx; this.listener = listener; this.vol = 0.8;
    this.ctx = null; this.buf = null; this.recent = 0; this.recentT = 0;
  }
  init() {
    if (this.ctx) return true;
    const a = this.getCtx();
    if (!a) return false;
    this.ctx = a.ctx; this.out = this.ctx.createGain(); this.out.gain.value = this.vol; this.out.connect(a.out);
    const n = this.ctx.sampleRate * 1.2, b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.buf = b;
    return true;
  }
  setVolume(v) { this.vol = v; if (this.out) this.out.gain.value = v; }
  voice(p) {
    const L = this.listener();
    const dx = p.x - L.pos.x, dy = p.y - L.pos.y, dz = p.z - L.pos.z, d = Math.hypot(dx, dy, dz);
    const pan = Math.max(-1, Math.min(1, (dx * L.right.x + dz * L.right.z) / (d + 1)));
    return { d, pan };
  }
  chain(t, d, pan, gain, lp) {
    const c = this.ctx, g = c.createGain(), f = c.createBiquadFilter(), p = c.createStereoPanner();
    f.type = 'lowpass'; f.frequency.value = lp;
    p.pan.value = pan;
    g.gain.value = 0;
    f.connect(g); g.connect(p); p.connect(this.out);
    return { g, f, in: f };
  }
  noise(t, dur, dest, rate = 1) {
    const s = this.ctx.createBufferSource(); s.buffer = this.buf; s.playbackRate.value = rate;
    s.connect(dest); s.start(t, Math.random() * 0.5, dur); return s;
  }
  shot(p, cal, own, unit) {
    if (!this.init()) return;
    const now = this.ctx.currentTime;
    /* ограничение полифонии: в перестрелке 80 стволов */
    if (now - this.recentT > 0.05) { this.recentT = now; this.recent = 0; }
    if (!own && ++this.recent > 6) return;
    const K = CAL[cal] || CAL.r545;
    const { d, pan } = own ? { d: 0.5, pan: 0 } : this.voice(p);
    if (d > 900) return;
    const t = now + (own ? 0 : d / C_SOUND);
    const att = own ? 1 : Math.min(1, 14 / (d + 6));
    const lp = own ? 9000 : Math.max(700, 9000 - d * 22);
    const ch = this.chain(t, d, pan, att, lp);
    const g = ch.g.gain;
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(0.9 * att * K.body, t + 0.002);
    g.exponentialRampToValueAtTime(0.25 * att * K.body, t + 0.03);
    g.exponentialRampToValueAtTime(0.0008, t + (own ? 0.55 : 0.35 + Math.min(1.2, d / 200)));
    this.noise(t, 1.1, ch.in, K.pitch);
    const o = this.ctx.createOscillator(), og = this.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(140 * K.pitch, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    og.gain.setValueAtTime(0.7 * att * K.body, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(og); og.connect(ch.in); o.start(t); o.stop(t + 0.2);
    /* дальний отзвук леса/ангара */
    if (!own && d > 60) {
      const e = this.chain(t + 0.08, d, pan, att, 600);
      e.g.gain.setValueAtTime(0, t + 0.08); e.g.gain.linearRampToValueAtTime(0.18 * att, t + 0.2); e.g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
      this.noise(t + 0.08, 1.2, e.in, 0.5);
    }
  }
  crack(close) {
    if (!this.init()) return;
    const t = this.ctx.currentTime, ch = this.chain(t, 0, (Math.random() - 0.5) * 0.8, 1, 12000);
    ch.g.gain.setValueAtTime(0, t); ch.g.gain.linearRampToValueAtTime(close ? 0.7 : 0.35, t + 0.001); ch.g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    this.noise(t, 0.06, ch.in, 2);
  }
  boom(p, k = 1) {
    if (!this.init()) return;
    const { d, pan } = this.voice(p), t = this.ctx.currentTime + d / C_SOUND, att = Math.min(1.2, 30 / (d + 10)) * k;
    const ch = this.chain(t, d, pan, att, Math.max(400, 5000 - d * 10));
    ch.g.gain.setValueAtTime(0, t); ch.g.gain.linearRampToValueAtTime(1.2 * att, t + 0.005); ch.g.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
    this.noise(t, 1.2, ch.in, 0.45);
    const o = this.ctx.createOscillator(), og = this.ctx.createGain();
    o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.5);
    og.gain.setValueAtTime(1.2 * att, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    o.connect(og); og.connect(ch.in); o.start(t); o.stop(t + 0.8);
  }
  bang(p) { this.boom(p, 0.8); }
  clink(p) {
    if (!this.init()) return;
    const { d, pan } = this.voice(p);
    if (d > 40) return;
    const t = this.ctx.currentTime, ch = this.chain(t, d, pan, 1, 8000), a = Math.min(0.3, 3 / (d + 3));
    const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 2300 + Math.random() * 800;
    ch.g.gain.setValueAtTime(a, t); ch.g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(ch.in); o.start(t); o.stop(t + 0.13);
  }
  thud() {
    if (!this.init()) return;
    const t = this.ctx.currentTime, ch = this.chain(t, 0, 0, 1, 900);
    ch.g.gain.setValueAtTime(0.5, t); ch.g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    this.noise(t, 0.3, ch.in, 0.4);
  }
  click() {
    if (!this.init()) return;
    const t = this.ctx.currentTime, ch = this.chain(t, 0, 0.2, 1, 6000);
    ch.g.gain.setValueAtTime(0.25, t); ch.g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    this.noise(t, 0.04, ch.in, 1.5);
  }
}
