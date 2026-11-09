/* Auto Rally – coins, obstacles and power-ups.
 *
 * Layout: hand-placed obstacles and power-ups (fair, identical every lap and
 * every race) plus coin lines generated around them with a fixed seed.
 * Nothing is placed near the start/finish line, and every obstacle leaves a
 * clear gap wide enough for the auto (checked by items.validate()).
 *
 * Collision zones live in road space:
 *   across the road: |autoX − itemX| < AUTO_HIT_HALF + item.halfW   (road half-widths)
 *   along the road:  item [z, z + depth] overlaps auto [pz, pz + AUTO_LENGTH]
 *
 * "Once per pass": every item remembers the pass (lap crossing) in which it was
 * collected or hit. It cannot act again until the next pass, so a long overlap
 * gives exactly one penalty, and an item already driven past has no effect.
 * Coins, power-ups and knocked-over cones come back on the next lap.
 *
 * All timers advance only in the fixed update, so pausing freezes them exactly.
 */
(function (AR) {
  'use strict';

  var cfg = AR.config, U = AR.util, track = AR.track;
  var SEG = cfg.SEGMENT_LENGTH, RW = cfg.ROAD_WIDTH;
  var N = track.segments.length, L = track.length;
  var TAU = Math.PI * 2;
  var FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

  /* ================= artwork (drawn once) ================= */

  var RES = 2;
  function make(w, h, draw) {
    var c = document.createElement('canvas');
    c.width = Math.ceil(w * RES);
    c.height = Math.ceil(h * RES);
    var g = c.getContext('2d');
    g.scale(RES, RES);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    draw(g, w, h);
    return c;
  }
  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function circle(g, x, y, r, col) { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }

  function drawCoin(g) {
    circle(g, 32, 32, 30, '#c98a00');
    circle(g, 32, 32, 26, '#f4b400');
    circle(g, 32, 32, 20, '#ffd84d');
    g.fillStyle = '#e09a00';                       // embossed star
    g.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 6 : 14;
      g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
    }
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 3;
    g.beginPath(); g.arc(32, 32, 23, Math.PI * 1.1, Math.PI * 1.45); g.stroke();
  }

  function orb(inner, outer, glow, icon) {
    return function (g) {
      var grad = g.createRadialGradient(40, 40, 18, 40, 40, 40);
      grad.addColorStop(0, glow); grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 80, 80);
      grad = g.createLinearGradient(0, 14, 0, 66);
      grad.addColorStop(0, inner); grad.addColorStop(1, outer);
      g.fillStyle = grad;
      g.beginPath(); g.arc(40, 40, 25, 0, TAU); g.fill();
      g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.stroke();
      icon(g);
      g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 3;
      g.beginPath(); g.arc(40, 40, 19, Math.PI * 1.1, Math.PI * 1.4); g.stroke();
    };
  }
  function bolt(g) {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(44, 22); g.lineTo(30, 43); g.lineTo(39, 43); g.lineTo(35, 58); g.lineTo(51, 35); g.lineTo(41, 35);
    g.closePath(); g.fill();
  }
  function shieldIcon(g) {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(40, 23); g.lineTo(53, 28); g.quadraticCurveTo(53, 48, 40, 57); g.quadraticCurveTo(27, 48, 27, 28);
    g.closePath(); g.fill();
    g.fillStyle = '#12a5ba';
    g.beginPath();
    g.moveTo(40, 29); g.lineTo(48, 32); g.quadraticCurveTo(48, 45, 40, 51);
    g.closePath(); g.fill();
  }

  function drawCone(g) {
    rr(g, 2, 47, 36, 8, 2); g.fillStyle = '#d4520f'; g.fill();
    g.fillStyle = '#ff6b1a';
    g.beginPath(); g.moveTo(17, 3); g.lineTo(23, 3); g.lineTo(33, 48); g.lineTo(7, 48); g.closePath(); g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(14.5, 15); g.lineTo(25.5, 15); g.lineTo(27.3, 23); g.lineTo(12.7, 23); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(11.2, 30); g.lineTo(28.8, 30); g.lineTo(30.6, 38); g.lineTo(9.4, 38); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.beginPath(); g.moveTo(18, 4); g.lineTo(20, 4); g.lineTo(15, 47); g.lineTo(11, 47); g.closePath(); g.fill();
  }

  function drawBarricade(g) {
    // legs
    g.strokeStyle = '#6b7280'; g.lineWidth = 5;
    g.beginPath();
    g.moveTo(22, 14); g.lineTo(12, 62); g.moveTo(22, 14); g.lineTo(32, 62);
    g.moveTo(128, 14); g.lineTo(118, 62); g.moveTo(128, 14); g.lineTo(138, 62);
    g.stroke();
    // striped boards
    function board(y, h) {
      g.save();
      rr(g, 4, y, 142, h, 4); g.clip();
      g.fillStyle = '#ffcc00'; g.fillRect(4, y, 142, h);
      g.fillStyle = '#1b1b1b';
      for (var x = -20; x < 160; x += 22) {
        g.beginPath(); g.moveTo(x, y + h); g.lineTo(x + 11, y + h); g.lineTo(x + 11 + h, y); g.lineTo(x + h, y); g.closePath(); g.fill();
      }
      g.restore();
      rr(g, 4, y, 142, h, 4); g.strokeStyle = '#1b1b1b'; g.lineWidth = 2; g.stroke();
    }
    board(12, 20);
    board(38, 12);
    // warning lamps
    circle(g, 12, 9, 6, '#ff3b2a'); circle(g, 138, 9, 6, '#ff3b2a');
    circle(g, 10, 7, 2, 'rgba(255,255,255,0.8)'); circle(g, 136, 7, 2, 'rgba(255,255,255,0.8)');
  }

  function drawPothole(g) {
    g.fillStyle = '#4c4f57';
    g.beginPath();
    g.moveTo(6, 22); g.quadraticCurveTo(10, 4, 40, 5); g.quadraticCurveTo(70, 1, 92, 12);
    g.quadraticCurveTo(100, 26, 82, 35); g.quadraticCurveTo(52, 41, 24, 36); g.quadraticCurveTo(2, 33, 6, 22);
    g.closePath(); g.fill();
    g.fillStyle = '#1c1d22';
    g.beginPath();
    g.moveTo(14, 22); g.quadraticCurveTo(18, 10, 42, 10); g.quadraticCurveTo(66, 8, 84, 16);
    g.quadraticCurveTo(90, 26, 76, 30); g.quadraticCurveTo(50, 35, 28, 31); g.quadraticCurveTo(10, 29, 14, 22);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(90, 130, 170, 0.45)';     // a little muddy water
    g.beginPath(); g.ellipse(52, 24, 22, 5, 0, 0, TAU); g.fill();
    g.strokeStyle = '#33353b'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(92, 14); g.lineTo(99, 10); g.moveTo(6, 24); g.lineTo(1, 28); g.moveTo(60, 38); g.lineTo(64, 40); g.stroke();
  }

  function drawCow(g) {
    // tail
    g.strokeStyle = '#e6dcc6'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(16, 34); g.quadraticCurveTo(6, 46, 9, 66); g.stroke();
    circle(g, 9, 68, 4, '#5a4636');
    // legs
    var legs = [24, 36, 82, 94];
    for (var i = 0; i < legs.length; i++) {
      rr(g, legs[i], 54, 9, 34, 3); g.fillStyle = i % 2 ? '#e2d6be' : '#efe5d0'; g.fill();
      rr(g, legs[i], 84, 9, 6, 2); g.fillStyle = '#3b2f26'; g.fill();
    }
    // body
    rr(g, 14, 26, 92, 36, 17); g.fillStyle = '#f5ecd9'; g.fill();
    g.fillStyle = '#c9a27a';
    g.beginPath(); g.ellipse(46, 40, 13, 9, 0.3, 0, TAU); g.fill();
    // hump
    g.fillStyle = '#f5ecd9';
    g.beginPath(); g.ellipse(84, 26, 13, 9, 0, 0, TAU); g.fill();
    // neck + head
    g.beginPath(); g.moveTo(92, 30); g.lineTo(112, 28); g.lineTo(114, 50); g.lineTo(96, 54); g.closePath(); g.fill();
    rr(g, 104, 24, 22, 32, 10); g.fill();
    rr(g, 112, 44, 16, 13, 6); g.fillStyle = '#f2b8a6'; g.fill();          // muzzle
    circle(g, 120, 50, 1.6, '#7a4a3a');
    circle(g, 114, 34, 2.2, '#1b1b1b');                                     // eye
    // horns + ear
    g.strokeStyle = '#8a6a4a'; g.lineWidth = 3.5;
    g.beginPath(); g.moveTo(108, 25); g.quadraticCurveTo(102, 12, 108, 6); g.moveTo(118, 24); g.quadraticCurveTo(122, 11, 116, 5); g.stroke();
    g.fillStyle = '#e8dcc3';
    g.beginPath(); g.ellipse(102, 30, 7, 3.5, -0.5, 0, TAU); g.fill();
    // marigold garland
    for (var k = 0; k < 7; k++) circle(g, 96 + k * 2.6, 48 + Math.sin(k / 6 * Math.PI) * 6, 2.6, k % 2 ? '#ff9f1c' : '#ffd23f');
  }

  function flip(src) {
    var c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    var g = c.getContext('2d');
    g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(src, 0, 0);
    return c;
  }

  /* ================= item types ================= */
  // halfW: collision half-width (road half-widths). depth: collision length (world units).

  var cowR = make(130, 95, drawCow);
  var DEFS = {
    coin:      { kind: 'coin', canvas: make(64, 64, drawCoin), worldW: 380, worldH: 380, lift: 230, halfW: 0.13, depth: 120 },
    turbo:     { kind: 'power', power: 'turbo', canvas: make(80, 80, orb('#ffb703', '#ff6a00', 'rgba(255,170,40,0.75)', bolt)),
                 worldW: 620, worldH: 620, lift: 200, halfW: 0.18, depth: 150, color: '#ff8c1a', label: 'TURBO!' },
    shield:    { kind: 'power', power: 'shield', canvas: make(80, 80, orb('#4dd9e8', '#0f97ad', 'rgba(80,220,240,0.75)', shieldIcon)),
                 worldW: 620, worldH: 620, lift: 200, halfW: 0.18, depth: 150, color: '#33d1e6', label: 'SHIELD!' },
    cone:      { kind: 'obstacle', canvas: make(40, 56, drawCone), worldW: 330, worldH: 460, halfW: 0.08, depth: 120,
                 slow: 0.6, knock: true, shake: 0.6, text: 'BUMP!' },
    pothole:   { kind: 'obstacle', canvas: make(100, 42, drawPothole), worldW: 950, flat: true, halfW: 0.18, depth: 320,
                 slow: 0.7, shake: 0.8, text: 'THUD!' },
    barricade: { kind: 'obstacle', canvas: make(150, 66, drawBarricade), worldW: 1450, worldH: 640, halfW: 0.34, depth: 120,
                 slow: 0.35, shake: 1, text: 'CRASH!' },
    cow:       { kind: 'obstacle', canvas: cowR, canvasL: flip(cowR), worldW: 1300, worldH: 950, halfW: 0.3, depth: 340,
                 slow: 0.25, shake: 1, text: 'MOO!' }
  };

  /* ================= layout ================= */
  // [segment, type, x]   x in road half-widths (−1 left edge … +1 right edge)

  var OBSTACLES = [
    [75, 'cone', -0.45], [79, 'cone', -0.15],                 // town
    [125, 'barricade', 0.5],
    [205, 'pothole', -0.45],                                  // avenue
    [285, 'cone', 0.5], [300, 'cone', -0.1],
    [355, 'barricade', -0.5],
    [455, 'cow', 0.35],                                       // fields
    [575, 'pothole', -0.5],
    [660, 'cone', -0.6], [664, 'cone', -0.3],
    [740, 'cow', -0.3],
    [830, 'barricade', 0.5],
    [930, 'pothole', 0.05],
    [1010, 'cow', 0.45],
    [1140, 'pothole', -0.45], [1175, 'pothole', 0.45],       // village
    [1230, 'cow', 0],
    [1300, 'barricade', -0.5],
    [1390, 'cow', -0.4],
    [1480, 'pothole', 0.5],                                   // ghat
    [1560, 'cone', -0.55],
    [1650, 'barricade', 0.5],
    [1740, 'cow', 0.35],
    [1860, 'cow', -0.4],                                      // palms
    [1930, 'pothole', 0.5],
    [2010, 'cone', 0], [2014, 'cone', 0.35],
    [2080, 'barricade', -0.5],
    [2180, 'cow', 0.3],                                       // back in town
    [2250, 'pothole', -0.3]
  ];

  var POWERUPS = [
    [145, 'turbo', 0], [400, 'turbo', 0.3], [1025, 'turbo', -0.3], [2150, 'turbo', -0.4],
    [1100, 'shield', 0.5], [1435, 'shield', -0.3], [1830, 'shield', 0.3]
  ];

  var START_CLEAR = 25, END_CLEAR = 15;          // keep the start/finish area empty
  var items = [];

  function addItem(seg, type, x) {
    var it = { id: items.length, type: type, def: DEFS[type], seg: seg, z: seg * SEG, x: x };
    items.push(it);
    track.segments[seg].items = track.segments[seg].items || [];
    track.segments[seg].items.push(it);
    return it;
  }

  var obstacleList = [];
  OBSTACLES.forEach(function (o) { obstacleList.push(addItem(o[0], o[1], o[2])); });
  var powerList = [];
  POWERUPS.forEach(function (p) { powerList.push(addItem(p[0], p[1], p[2])); });

  function nearOther(seg, x) {
    var all = obstacleList.concat(powerList);
    for (var i = 0; i < all.length; i++) {
      var o = all[i];
      var ds = seg - o.seg;
      if (ds >= -3 && ds <= Math.ceil(o.def.depth / SEG) + 6 && Math.abs(o.x - x) < o.def.halfW + 0.35) return true;
    }
    return false;
  }

  (function placeCoins() {
    var rng = U.rng(cfg.TRACK_SEED + 7);
    var lanes = [-0.5, 0, 0.5];
    for (var s0 = START_CLEAR + 7; s0 < N - END_CLEAR - 16; s0 += 58 + Math.floor(rng() * 16)) {
      var pattern = Math.floor(rng() * 3);
      var lane = lanes[Math.floor(rng() * 3)];
      var dir = lane > 0 ? -1 : 1;
      for (var k = 0; k < 5; k++) {
        var seg = s0 + k * 3;
        var x = lane;
        if (pattern === 1) x = lane + dir * Math.sin(k / 4 * Math.PI) * 0.35;   // arc
        if (pattern === 2) x = lane + (k % 2 ? 0.22 : -0.22);                   // zig-zag
        x = U.clamp(x, -0.75, 0.75);
        if (!nearOther(seg, x)) addItem(seg, 'coin', x);
      }
    }
  })();

  for (var si = 0; si < N; si++) if (!track.segments[si].items) track.segments[si].items = [];

  /* ================= per-race state ================= */

  var state = {
    pass: 0,                 // finish-line crossings so far (each lap is a new pass)
    taken: new Int32Array(items.length),   // pass in which each item was used (−1 = never)
    coins: 0,
    turbo: 0, shield: 0,     // seconds remaining
    time: 0,                 // animation clock (frozen while paused)
    effects: [],
    hits: 0, blocked: 0      // statistics
  };

  var api = AR.items = {
    DEFS: DEFS,
    list: items,
    state: state,
    START_CLEAR: START_CLEAR,
    END_CLEAR: END_CLEAR
  };

  api.reset = function () {
    state.pass = 0;
    for (var i = 0; i < state.taken.length; i++) state.taken[i] = -1;
    state.coins = 0;
    state.turbo = state.shield = 0;
    state.effects.length = 0;
    state.hits = state.blocked = 0;
  };
  api.reset();

  /* Visible unless collected (coins, power-ups) or knocked over (cones) in this pass. */
  api.visible = function (it) {
    if (state.taken[it.id] !== state.pass) return true;
    return !(it.def.kind === 'coin' || it.def.kind === 'power' || it.def.knock);
  };

  /* Turbo boost passed to the auto physics (null when no turbo). */
  var boost = { max: cfg.MAX_SPEED * cfg.TURBO_MAX_FACTOR, accel: cfg.TURBO_ACCEL };
  api.boost = function () { return state.turbo > 0 ? boost : null; };

  function effect(type, text, color) {
    state.effects.push({ type: type, text: text || '', color: color || '#fff', t: 0, dur: type === 'sparkle' ? 0.6 : 0.9 });
    if (state.effects.length > 12) state.effects.shift();
  }

  function signedDz(itemZ, pz) {
    var d = itemZ - pz;
    if (d > L / 2) d -= L;
    if (d < -L / 2) d += L;
    return d;
  }

  /* Fixed-step update. collide = false outside racing (effects/timers only). */
  api.update = function (dt, prevZ, curZ, collide) {
    state.time += dt;

    for (var e = state.effects.length - 1; e >= 0; e--) {
      var fx = state.effects[e];
      fx.t += dt;
      if (fx.t >= fx.dur) state.effects.splice(e, 1);
    }

    if (!collide) return;

    if (curZ < prevZ) state.pass++;               // crossed the start/finish line
    // (tiny float remainders are snapped to 0 so 3 s is exactly 180 steps)
    if (state.turbo > 0) { state.turbo -= dt; if (state.turbo < 1e-6) state.turbo = 0; }
    if (state.shield > 0) { state.shield -= dt; if (state.shield < 1e-6) state.shield = 0; }

    var P = AR.player;
    var segIndex = Math.floor(curZ / SEG);
    for (var k = -3; k <= 3; k++) {               // only items close to the auto
      var list = track.segments[(segIndex + k + N) % N].items;
      for (var i = 0; i < list.length; i++) {
        var it = list[i], def = it.def;
        if (state.taken[it.id] === state.pass) continue;          // already used this pass
        var dz = signedDz(it.z, curZ);
        if (!(dz < cfg.AUTO_LENGTH && dz + def.depth > 0)) continue;
        if (Math.abs(P.x - it.x) >= cfg.AUTO_HIT_HALF + def.halfW) continue;

        state.taken[it.id] = state.pass;
        var sound;
        if (def.kind === 'coin') {
          state.coins++;
          effect('sparkle', '+1', '#ffd23f');
          sound = 'coin';
        } else if (def.kind === 'power') {
          if (def.power === 'turbo') state.turbo = cfg.TURBO_TIME;
          else state.shield = cfg.SHIELD_TIME;
          effect('ring', def.label, def.color);
          sound = def.power;
        } else if (state.shield > 0) {
          state.blocked++;
          effect('ring', 'BLOCKED!', '#33d1e6');
          sound = 'block';
        } else {
          state.hits++;
          P.speed *= def.slow;
          P.hit(def.shake);
          effect('bump', def.text, it.type === 'cow' ? '#ffffff' : '#ffd23f');
          sound = 'hit-' + it.type;
        }
        if (AR.audio) AR.audio.play(sound);
      }
    }
  };

  api.hud = function () { return state; };

  /* ================= drawing ================= */

  /* Flat items (potholes) – drawn right after the road surface of their segment. */
  api.drawFlat = function (ctx, s) {
    var list = s.items;
    for (var i = 0; i < list.length; i++) {
      var it = list[i], def = it.def;
      if (!def.flat || !s.roadVisible) continue;
      var sc = s.scale1;
      var dw = def.worldW * sc;
      if (dw < 2) continue;
      var dh = Math.max(2, (s.sy1 - s.sy2) * def.depth / SEG);
      var dx = s.sx1 + it.x * sc * RW - dw / 2;
      if (s.fog > 9) ctx.globalAlpha = Math.max(0, 1 - (s.fog - 9) / 6);
      ctx.drawImage(def.canvas, dx, s.sy1 - dh, dw, dh);
      ctx.globalAlpha = 1;
    }
  };

  /* Upright items – drawn with the segment's scenery (painter's order). */
  api.drawUpright = function (ctx, s, viewW) {
    var list = s.items;
    for (var i = 0; i < list.length; i++) {
      var it = list[i], def = it.def;
      if (def.flat || !api.visible(it)) continue;
      var sc = s.scale1;
      var dw = def.worldW * sc;
      if (dw < 1.5) continue;
      var dh = def.worldH * sc;
      var cx = s.sx1 + it.x * sc * RW;
      if (cx + dw < 0 || cx - dw > viewW) continue;
      if (s.fog > 9) ctx.globalAlpha = Math.max(0, 1 - (s.fog - 9) / 6);

      if (def.kind === 'obstacle') {
        var img = it.type === 'cow' && it.x > 0 ? def.canvasL : def.canvas;   // cows face the road centre
        ctx.drawImage(img, cx - dw / 2, s.sy1 - dh, dw, dh);
      } else {
        // floating pick-up: shadow on the road, bobbing, coins spin
        var bob = Math.sin(state.time * 4 + it.id) * dh * 0.08;
        var lift = def.lift * sc;
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath();
        ctx.ellipse(cx, s.sy1, dw * 0.32, Math.max(1, dw * 0.08), 0, 0, TAU);
        ctx.fill();
        var spin = def.kind === 'coin' ? Math.max(0.18, Math.abs(Math.cos(state.time * 5 + it.id * 0.7))) : 1;
        ctx.drawImage(def.canvas, cx - dw * spin / 2, s.sy1 - lift - dh + bob, dw * spin, dh);
      }
      ctx.globalAlpha = 1;
    }
  };

  /* Shield bubble and turbo flames around the auto (r = auto screen rect). */
  api.drawPlayerOverlay = function (ctx, r) {
    var t = state.time;
    if (state.turbo > 0) {
      var f = 0.75 + Math.sin(t * 40) * 0.25;
      for (var k = 0; k < 2; k++) {
        var fx = r.x + r.w * (k ? 0.68 : 0.32), fy = r.y + r.h * 0.9;
        ctx.fillStyle = 'rgba(255,120,20,0.85)';
        ctx.beginPath(); ctx.ellipse(fx, fy + r.h * 0.1 * f, r.w * 0.07, r.h * 0.13 * f, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,230,120,0.95)';
        ctx.beginPath(); ctx.ellipse(fx, fy + r.h * 0.06 * f, r.w * 0.035, r.h * 0.07 * f, 0, 0, TAU); ctx.fill();
      }
    }
    if (state.shield > 0) {
      var blinkOff = state.shield < 1.5 && Math.floor(t * 8) % 2 === 0;   // warns that it is ending
      if (!blinkOff) {
        var pulse = 1 + Math.sin(t * 6) * 0.03;
        var bx = r.x + r.w / 2, by = r.y + r.h * 0.52, brx = r.w * 0.68 * pulse, bry = r.h * 0.66 * pulse;
        // glassy bubble: clear centre, tinted rim, small highlight
        var glass = ctx.createRadialGradient(bx, by, brx * 0.35, bx, by, brx);
        glass.addColorStop(0, 'rgba(77, 217, 232, 0.04)');
        glass.addColorStop(1, 'rgba(77, 217, 232, 0.3)');
        ctx.fillStyle = glass;
        ctx.strokeStyle = 'rgba(180, 248, 255, 0.85)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(bx, by, brx, bry, 0, 0, TAU);
        ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(bx, by, brx * 0.82, bry * 0.82, 0, Math.PI * 1.15, Math.PI * 1.4);
        ctx.stroke();
      }
    }
  };

  /* Screen-space effects: turbo speed lines, sparkles, bumps, rings, pop-up text. */
  api.drawEffects = function (ctx, view, rig, r) {
    var t = state.time, i;
    if (state.turbo > 0) {
      var a = Math.min(1, state.turbo / 0.5) * 0.3;
      ctx.strokeStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
      ctx.lineWidth = 2;
      var R = Math.hypot(view.w, view.h);
      ctx.beginPath();
      for (i = 0; i < 14; i++) {
        var ang = i * 2.399 + 0.3;                 // golden-angle spread
        var ph = (t * 2.5 + i * 0.37) % 1;
        var r1 = R * (0.18 + ph * 0.55), r2 = r1 + R * 0.12;
        var ca = Math.cos(ang), sa = Math.sin(ang);
        ctx.moveTo(rig.cx + ca * r1, rig.cy + sa * r1 * 0.75);
        ctx.lineTo(rig.cx + ca * r2, rig.cy + sa * r2 * 0.75);
      }
      ctx.stroke();
    }

    var cx = r.x + r.w / 2, top = r.y + r.h * 0.2;
    for (i = 0; i < state.effects.length; i++) {
      var fx = state.effects[i], p = fx.t / fx.dur, k;
      ctx.globalAlpha = 1 - p * p;
      if (fx.type === 'sparkle') {
        ctx.fillStyle = 'rgba(255, 220, 90, 0.25)';            // soft golden glow
        ctx.beginPath(); ctx.arc(cx, top - p * r.h * 0.3, r.w * (0.2 + p * 0.25), 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffd23f';
        for (k = 0; k < 8; k++) {
          var an = k * Math.PI / 4 + 0.4, d = r.w * (0.15 + p * 0.55);
          var sx = cx + Math.cos(an) * d, sy = top + Math.sin(an) * d * 0.7 - p * r.h * 0.3, sz = r.w * 0.05 * (1 - p * 0.5);
          ctx.beginPath(); ctx.moveTo(sx, sy - sz); ctx.lineTo(sx + sz * 0.6, sy); ctx.lineTo(sx, sy + sz); ctx.lineTo(sx - sz * 0.6, sy); ctx.closePath(); ctx.fill();
        }
      } else if (fx.type === 'bump') {
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
        ctx.beginPath();
        for (k = 0; k < 10; k++) {
          var bn = k * Math.PI / 5, b1 = r.w * (0.3 + p * 0.3), b2 = b1 + r.w * 0.18 * (1 - p);
          ctx.moveTo(cx + Math.cos(bn) * b1, r.y + r.h * 0.45 + Math.sin(bn) * b1 * 0.6);
          ctx.lineTo(cx + Math.cos(bn) * b2, r.y + r.h * 0.45 + Math.sin(bn) * b2 * 0.6);
        }
        ctx.stroke();
      } else if (fx.type === 'ring') {
        ctx.strokeStyle = fx.color; ctx.lineWidth = 4 * (1 - p) + 1;
        ctx.beginPath(); ctx.ellipse(cx, r.y + r.h * 0.5, r.w * (0.5 + p * 0.9), r.h * (0.45 + p * 0.8), 0, 0, TAU); ctx.stroke();
      }
      if (fx.text) {
        var pop = 1 + 0.35 * Math.max(0, 1 - p * 6);              // quick scale-in, then steady
        var size = Math.max(16, r.w * (fx.type === 'sparkle' ? 0.22 : 0.28)) * pop;
        ctx.font = 'italic 900 ' + Math.round(size) + 'px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var ty = r.y - size * 0.4 - p * r.h * 0.5;
        ctx.lineWidth = Math.max(3, size * 0.16);
        ctx.strokeStyle = 'rgba(27,31,59,0.9)';
        ctx.strokeText(fx.text, cx, ty);
        ctx.fillStyle = fx.color;
        ctx.fillText(fx.text, cx, ty);
      }
    }
    ctx.globalAlpha = 1;
  };

  /* ================= layout checks (used by tests) ================= */

  api.validate = function () {
    var problems = [], i, j;
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.seg < START_CLEAR || it.seg > N - END_CLEAR) problems.push(it.type + ' at segment ' + it.seg + ' is in the start/finish area');
      if (Math.abs(it.x) + it.def.halfW > 1.0) problems.push(it.type + ' at segment ' + it.seg + ' hangs off the road');
    }
    // Every road position must leave a gap for the auto between obstacles.
    var need = 2 * cfg.AUTO_HIT_HALF + 0.1;
    for (var s = 0; s < N; s++) {
      var z0 = s * SEG, z1 = z0 + SEG, blocks = [];
      for (j = 0; j < obstacleList.length; j++) {
        var o = obstacleList[j];
        if (o.z < z1 + cfg.AUTO_LENGTH && o.z + o.def.depth > z0) blocks.push([o.x - o.def.halfW, o.x + o.def.halfW]);
      }
      if (!blocks.length) continue;
      blocks.sort(function (a, b) { return a[0] - b[0]; });
      var best = 0, edge = -1;
      for (j = 0; j < blocks.length; j++) { best = Math.max(best, blocks[j][0] - edge); edge = Math.max(edge, blocks[j][1]); }
      best = Math.max(best, 1 - edge);
      if (best < need) problems.push('segment ' + s + ': widest gap ' + best.toFixed(2) + ' < ' + need.toFixed(2));
    }
    // No coin or power-up inside an obstacle's zone.
    for (i = 0; i < items.length; i++) {
      if (items[i].def.kind === 'obstacle') continue;
      for (j = 0; j < obstacleList.length; j++) {
        var ob = obstacleList[j], c = items[i];
        if (c.z < ob.z + ob.def.depth && c.z + c.def.depth > ob.z && Math.abs(c.x - ob.x) < c.def.halfW + ob.def.halfW) {
          problems.push(c.type + ' at segment ' + c.seg + ' overlaps ' + ob.type + ' at ' + ob.seg);
        }
      }
    }
    return problems;
  };

  api.counts = function () {
    var c = {};
    items.forEach(function (it) { c[it.type] = (c[it.type] || 0) + 1; });
    return c;
  };
})(window.AutoRally = window.AutoRally || {});
