/* Auto Rally – sound, generated entirely with the Web Audio API (no audio files).
 *
 *   one-shot voices ─┬─ sfxBus (race sounds; silenced while paused) ─┐
 *   button clicks ───┴─ uiBus ───────────────────────────────────────┼─ master (mute) ─ analyser ─ speakers
 *   engine (built once, never re-created) ── engine gain ────────────┘
 *
 * - The AudioContext is created/resumed on the first user gesture (browser autoplay rules).
 * - Every one-shot voice disconnects itself when it ends; at most MAX_VOICES play at once.
 * - While muted no new voices are created at all, and the master gain is 0.
 * - Any audio failure is caught: the game never depends on sound working.
 */
(function (AR) {
  'use strict';

  var Ctx = window.AudioContext || window.webkitAudioContext;
  var MASTER = 0.8;
  var MAX_VOICES = 16;

  var ctx = null, master, sfxBus, uiBus, analyser;
  var engine = null;
  var engineOn = false, racePaused = false, muted = false;
  var last = { sp: 0, throttle: false, brake: false, turbo: false };
  var voices = new Set();
  var stats = { created: 0, skipped: 0, engineBuilds: 0, played: [] };

  function noop() {}
  function attempt(fn) { try { return fn(); } catch (e) { return undefined; } }

  /* ---------- context ---------- */

  function init() {
    if (ctx || !Ctx) return ctx;
    attempt(function () {
      var c = new Ctx();
      master = c.createGain();
      master.gain.value = muted ? 0 : MASTER;
      analyser = c.createAnalyser();
      analyser.fftSize = 1024;
      master.connect(analyser);
      analyser.connect(c.destination);
      sfxBus = c.createGain(); sfxBus.connect(master);
      uiBus = c.createGain(); uiBus.connect(master);
      ctx = c;
    });
    return ctx;
  }

  function unlock() {
    if (!init()) return;
    if (ctx.state === 'suspended' && !document.hidden) {
      attempt(function () { var p = ctx.resume(); if (p && p.catch) p.catch(noop); });
    }
  }
  ['pointerdown', 'touchend', 'keydown', 'click'].forEach(function (type) {
    document.addEventListener(type, unlock, true);
  });
  // Save battery in the background; come back when visible.
  document.addEventListener('visibilitychange', function () {
    if (!ctx) return;
    attempt(function () {
      var p = document.hidden ? ctx.suspend() : ctx.resume();
      if (p && p.catch) p.catch(noop);
    });
  });

  function ramp(param, value, tc) {
    attempt(function () {
      var t = ctx.currentTime;
      param.cancelScheduledValues(t);
      param.setTargetAtTime(value, t, tc);
    });
  }
  function setNow(param, value) {
    attempt(function () {
      var t = ctx.currentTime;
      param.cancelScheduledValues(t);
      param.value = value;                 // takes effect at once (not on the next scheduled block)
      param.setValueAtTime(value, t);
    });
  }

  /* ---------- building blocks (work on live and offline contexts) ---------- */

  function noiseBuffer(c) {
    if (!c.__noise) {
      var b = c.createBuffer(1, Math.floor(c.sampleRate * 0.6), c.sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      c.__noise = b;
    }
    return c.__noise;
  }
  function envelope(c, v, t0, o) {
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.vol, t0 + (o.attack || 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    v.nodes.push(g);
    return g;
  }
  /* o: { f, f2, type, dur, vol, delay, attack } */
  function tone(c, out, t, v, o) {
    var t0 = t + (o.delay || 0);
    var osc = c.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t0 + o.dur);
    var g = envelope(c, v, t0, o);
    osc.connect(g); g.connect(out);
    osc.start(t0); osc.stop(t0 + o.dur + 0.03);
    v.nodes.push(osc); v.sources.push(osc);
  }
  /* o: { dur, vol, filter, freq, freq2, q, delay } */
  function noise(c, out, t, v, o) {
    var t0 = t + (o.delay || 0);
    var src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    var f = c.createBiquadFilter();
    f.type = o.filter || 'lowpass';
    f.frequency.setValueAtTime(o.freq, t0);
    if (o.freq2) f.frequency.exponentialRampToValueAtTime(o.freq2, t0 + o.dur);
    f.Q.value = o.q || 1;
    var g = envelope(c, v, t0, o);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t0); src.stop(t0 + o.dur + 0.03);
    v.nodes.push(src, f); v.sources.push(src);
  }

  /* ---------- the sounds ---------- */

  var SFX = {
    click: function (c, out, t, v) {
      tone(c, out, t, v, { f: 1500, f2: 900, type: 'triangle', dur: 0.05, vol: 0.12 });
    },
    beep: function (c, out, t, v) {                          // 3, 2, 1
      tone(c, out, t, v, { f: 660, type: 'square', dur: 0.16, vol: 0.16 });
    },
    go: function (c, out, t, v) {                            // higher, longer, a chord
      tone(c, out, t, v, { f: 1046, type: 'square', dur: 0.5, vol: 0.16 });
      tone(c, out, t, v, { f: 1568, type: 'square', dur: 0.45, vol: 0.08 });
      tone(c, out, t, v, { f: 523, type: 'triangle', dur: 0.55, vol: 0.16 });
    },
    coin: function (c, out, t, v) {                          // classic two-note "ding"
      tone(c, out, t, v, { f: 988, type: 'square', dur: 0.07, vol: 0.1 });
      tone(c, out, t, v, { f: 1319, type: 'square', dur: 0.24, vol: 0.1, delay: 0.07 });
    },
    turbo: function (c, out, t, v) {                         // rising roar + whoosh
      tone(c, out, t, v, { f: 160, f2: 1100, type: 'sawtooth', dur: 0.5, vol: 0.14, attack: 0.03 });
      noise(c, out, t, v, { dur: 0.55, vol: 0.22, filter: 'bandpass', freq: 400, freq2: 3500, q: 1.4, attack: 0.05 });
    },
    shield: function (c, out, t, v) {                        // bright arpeggio + shimmer
      [523, 659, 784, 1047].forEach(function (f, i) {
        tone(c, out, t, v, { f: f, type: 'triangle', dur: 0.2, vol: 0.14, delay: i * 0.06 });
      });
      tone(c, out, t, v, { f: 2093, type: 'sine', dur: 0.45, vol: 0.06, delay: 0.24 });
    },
    block: function (c, out, t, v) {                         // shield deflects a hit
      tone(c, out, t, v, { f: 1300, f2: 520, type: 'triangle', dur: 0.22, vol: 0.16 });
      noise(c, out, t, v, { dur: 0.12, vol: 0.1, filter: 'highpass', freq: 3000 });
    },
    'hit-cone': function (c, out, t, v) {                    // plastic knock
      noise(c, out, t, v, { dur: 0.12, vol: 0.32, filter: 'bandpass', freq: 1800, q: 2 });
      tone(c, out, t, v, { f: 340, f2: 180, type: 'triangle', dur: 0.16, vol: 0.22 });
    },
    'hit-pothole': function (c, out, t, v) {                 // deep thud
      tone(c, out, t, v, { f: 120, f2: 42, type: 'sine', dur: 0.32, vol: 0.5 });
      noise(c, out, t, v, { dur: 0.22, vol: 0.28, filter: 'lowpass', freq: 450 });
    },
    'hit-barricade': function (c, out, t, v) {               // metallic clang
      tone(c, out, t, v, { f: 233, type: 'square', dur: 0.4, vol: 0.13 });
      tone(c, out, t, v, { f: 349, type: 'square', dur: 0.32, vol: 0.1 });
      tone(c, out, t, v, { f: 523, type: 'square', dur: 0.26, vol: 0.07 });
      noise(c, out, t, v, { dur: 0.26, vol: 0.36, filter: 'highpass', freq: 1500 });
    },
    'hit-cow': function (c, out, t, v) {                     // bump + "moo"
      tone(c, out, t, v, { f: 95, f2: 50, type: 'sine', dur: 0.18, vol: 0.4 });
      var osc = c.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(128, t + 0.05);
      osc.frequency.linearRampToValueAtTime(152, t + 0.22);
      osc.frequency.exponentialRampToValueAtTime(98, t + 0.9);
      var f = c.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 750; f.Q.value = 5;
      var g = envelope(c, v, t + 0.05, { vol: 0.32, attack: 0.09, dur: 0.85 });
      osc.connect(f); f.connect(g); g.connect(out);
      osc.start(t + 0.05); osc.stop(t + 0.95);
      v.nodes.push(osc, f); v.sources.push(osc);
    },
    lap: function (c, out, t, v) {
      tone(c, out, t, v, { f: 784, type: 'triangle', dur: 0.15, vol: 0.2 });
      tone(c, out, t, v, { f: 1175, type: 'triangle', dur: 0.32, vol: 0.2, delay: 0.12 });
    },
    finallap: function (c, out, t, v) {
      [784, 988, 1319].forEach(function (f, i) {
        tone(c, out, t, v, { f: f, type: 'triangle', dur: i === 2 ? 0.4 : 0.14, vol: 0.2, delay: i * 0.11 });
      });
    },
    finish: function (c, out, t, v) {                        // fanfare
      [523, 659, 784, 1047].forEach(function (f, i) {
        tone(c, out, t, v, { f: f, type: 'square', dur: 0.15, vol: 0.12, delay: i * 0.12 });
      });
      [523, 659, 784, 1047].forEach(function (f) {
        tone(c, out, t, v, { f: f, type: 'triangle', dur: 1.0, vol: 0.11, delay: 0.5, attack: 0.02 });
      });
    },
    record: function (c, out, t, v) {                        // sparkle for a new best time
      [1568, 2093, 2637, 3136, 4186].forEach(function (f, i) {
        tone(c, out, t, v, { f: f, type: 'sine', dur: 0.3, vol: 0.07, delay: i * 0.07 });
      });
    }
  };

  /* ---------- one-shot voices ---------- */

  function cleanup(v) {
    if (!voices.has(v)) return;
    voices.delete(v);
    v.nodes.forEach(function (n) { attempt(function () { n.disconnect(); }); });
  }

  function play(name) {
    stats.played.push({ name: name, muted: muted, t: Date.now() });
    if (stats.played.length > 60) stats.played.shift();
    var bus = name === 'click' ? uiBus : sfxBus;
    if (muted || !SFX[name] || !ctx || ctx.state !== 'running' || voices.size >= MAX_VOICES ||
        (racePaused && bus === sfxBus)) {
      stats.skipped++;
      return false;
    }
    var v = { nodes: [], sources: [], ended: 0 };
    var ok = attempt(function () { SFX[name](ctx, bus, ctx.currentTime + 0.005, v); return true; });
    voices.add(v);
    if (!ok || !v.sources.length) { cleanup(v); return false; }
    stats.created++;
    v.sources.forEach(function (s) {
      s.onended = function () { if (++v.ended >= v.sources.length) cleanup(v); };
    });
    return true;
  }

  /* ---------- engine (two-stroke "putt-putt") ---------- */

  function buildEngine() {
    if (engine || !ctx) return engine;
    attempt(function () {
      var e = {};
      e.out = ctx.createGain(); e.out.gain.value = 0; e.out.connect(master);
      e.filter = ctx.createBiquadFilter(); e.filter.type = 'lowpass'; e.filter.frequency.value = 500; e.filter.Q.value = 3;
      e.am = ctx.createGain(); e.am.gain.value = 0.6;
      e.osc1 = ctx.createOscillator(); e.osc1.type = 'sawtooth'; e.osc1.frequency.value = 45;
      e.osc2 = ctx.createOscillator(); e.osc2.type = 'square'; e.osc2.frequency.value = 22.5;
      e.sub = ctx.createGain(); e.sub.gain.value = 0.35;
      e.lfo = ctx.createOscillator(); e.lfo.type = 'sine'; e.lfo.frequency.value = 11;   // firing pulse
      e.lfoDepth = ctx.createGain(); e.lfoDepth.gain.value = 0.4;
      e.whine = ctx.createOscillator(); e.whine.type = 'sine'; e.whine.frequency.value = 1100; // Turbo whistle
      e.whineGain = ctx.createGain(); e.whineGain.gain.value = 0;
      e.osc1.connect(e.am);
      e.osc2.connect(e.sub); e.sub.connect(e.am);
      e.lfo.connect(e.lfoDepth); e.lfoDepth.connect(e.am.gain);
      e.am.connect(e.filter); e.filter.connect(e.out);
      e.whine.connect(e.whineGain); e.whineGain.connect(e.out);
      e.osc1.start(); e.osc2.start(); e.lfo.start(); e.whine.start();
      engine = e;
      stats.engineBuilds++;
    });
    return engine;
  }

  function applyEngine(tc) {
    if (!engine) return;
    var sp = last.sp;
    var f = 42 + 95 * sp + (last.throttle ? 10 : 0) - (last.brake ? 8 : 0);      // pitch follows speed
    ramp(engine.osc1.frequency, f, tc);
    ramp(engine.osc2.frequency, f / 2, tc);
    ramp(engine.lfo.frequency, 8 + f / 5, tc);
    ramp(engine.filter.frequency, 380 + 1500 * sp + (last.throttle ? 450 : 0) - (last.brake ? 200 : 0), tc);
    var on = engineOn && !racePaused;
    var vol = on ? (0.11 + 0.05 * Math.min(sp, 1.35) + (last.throttle ? 0.04 : 0)) * (last.brake ? 0.75 : 1) : 0;
    ramp(engine.out.gain, vol, on ? tc : 0.03);
    ramp(engine.whine.frequency, 900 + 650 * sp, tc);
    ramp(engine.whineGain.gain, on && last.turbo ? 0.035 : 0, 0.08);
  }

  /* ---------- public API ---------- */

  AR.audio = {
    isSupported: function () { return !!Ctx; },
    isMuted: function () { return muted; },

    setMuted: function (m) {
      muted = !!m;
      if (!ctx) return;
      if (muted) setNow(master.gain, 0);                  // silence immediately
      else ramp(master.gain, MASTER, 0.02);               // quick fade back in
    },

    play: play,

    engineStart: function () {
      if (!buildEngine()) { engineOn = true; return; }
      engineOn = true;
      applyEngine(0.08);
    },
    engineStop: function () {
      engineOn = false;
      if (engine) ramp(engine.out.gain, 0, 0.05);
      if (engine) ramp(engine.whineGain.gain, 0, 0.03);
    },
    /* sp = speed / top speed (may exceed 1 with Turbo) */
    engineUpdate: function (sp, throttle, brake, turbo) {
      last.sp = sp; last.throttle = !!throttle; last.brake = !!brake; last.turbo = !!turbo;
      if (!engine && engineOn && ctx && ctx.state === 'running') buildEngine();   // audio unlocked mid-race
      if (engine && engineOn) applyEngine(0.08);
    },

    /* Pause: engine and race sounds go silent; menu clicks still work. */
    pauseRace: function (p) {
      racePaused = !!p;
      if (!ctx) return;
      ramp(sfxBus.gain, racePaused ? 0 : 1, 0.02);
      applyEngine(0.08);
    },

    /* Back to the menu / restart: stop everything that is sounding. */
    stopAll: function () {
      engineOn = false;
      racePaused = false;
      voices.forEach(function (v) {
        v.sources.forEach(function (s) { attempt(function () { s.stop(); }); });
        cleanup(v);
      });
      if (!ctx) return;
      setNow(sfxBus.gain, 1);
      if (engine) { setNow(engine.out.gain, 0); setNow(engine.whineGain.gain, 0); }
    },

    /* ---------- diagnostics (used by tests and the debug panel) ---------- */
    debug: function () {
      var rms = 0;
      if (analyser) {
        var buf = new Float32Array(analyser.fftSize);
        if (analyser.getFloatTimeDomainData) {
          analyser.getFloatTimeDomainData(buf);
          for (var i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
          rms = Math.sqrt(rms / buf.length);
        }
      }
      return {
        state: ctx ? ctx.state : 'none', muted: muted, engineOn: engineOn, paused: racePaused,
        master: master ? master.gain.value : null,
        engineGain: engine ? engine.out.gain.value : 0,
        engineFreq: engine ? engine.osc1.frequency.value : 0,
        engineFilter: engine ? engine.filter.frequency.value : 0,
        whine: engine ? engine.whineGain.gain.value : 0,
        sfxBus: sfxBus ? sfxBus.gain.value : null,
        voices: voices.size, created: stats.created, skipped: stats.skipped,
        engineBuilds: stats.engineBuilds, played: stats.played.slice(), rms: rms
      };
    },
    sounds: Object.keys(SFX),
    /* Render one sound offline (no speakers needed) and measure it. */
    renderOffline: function (name) {
      var OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      var sr = 22050, oc = new OC(1, sr * 2, sr), v = { nodes: [], sources: [] };
      SFX[name](oc, oc.destination, 0, v);
      return oc.startRendering().then(function (b) {
        var d = b.getChannelData(0), sum = 0, peak = 0, lastLoud = 0, zc = 0, n = 0;
        for (var i = 0; i < d.length; i++) {
          var a = Math.abs(d[i]);
          if (a > peak) peak = a;
          if (a > 0.002) { lastLoud = i; sum += d[i] * d[i]; n++; }
          if (i && (d[i - 1] < 0) !== (d[i] < 0) && a > 0.002) zc++;
        }
        return { name: name, peak: peak, rms: n ? Math.sqrt(sum / n) : 0, duration: lastLoud / sr,
                 pitch: n ? zc / 2 / (n / sr) : 0, nodes: v.nodes.length };
      });
    }
  };
})(window.AutoRally = window.AutoRally || {});
