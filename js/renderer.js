/* Auto Rally – pseudo-3D renderer.
 *
 * Camera rig (rebuilt on every resize):
 *   cx, cy   vanishing point (cy = horizon line)
 *   f        focal length in CSS pixels (same for x and y, so shapes never stretch)
 *   camH     camera height – derived per screen so that, at the player's distance,
 *            the road is a comfortable width AND sits near the bottom of the screen.
 *            Portrait screens get a higher camera, showing more road.
 *
 * Each frame:
 *   1. background: sky gradient, sun, clouds, three parallax hill layers
 *   2. pass 1 (near → far): project segments, accumulate curve offset, cull
 *      segments hidden behind hill crests
 *   3. pass 2 (far → near): painter's algorithm – draw each segment then its
 *      sprites, so nearer hills naturally hide things behind them.
 *      Each segment overlaps the farther one by 1px, so no seams can appear.
 */
(function (AR) {
  'use strict';

  var cfg = AR.config, U = AR.util;
  var RW = cfg.ROAD_WIDTH, SEG = cfg.SEGMENT_LENGTH;
  var NEAR = 1;                                 // near clip plane (world units)
  var FOG_LEVELS = 16;

  var R = AR.renderer = {};

  var rig = { w: 1, h: 1, cx: 0, cy: 0, f: 1, camH: 1000 };
  var drawDistance = cfg.DRAW_DISTANCE;
  var quality = 'high';
  var dirty = true;

  /* ---------- colours & fog palette ---------- */

  var COLORS = {
    grassL: '#62c143', grassD: '#56b33a',
    dirtL: '#d6ab6c', dirtD: '#cba060',
    kerbR: '#e53b2c', kerbW: '#f6f6f6',
    roadL: '#6e717a', roadD: '#686b74',
    line: '#f4f4f4',
    checkW: '#f8f8f8', checkB: '#1e1e1e'
  };
  var FOG_COLOR = '#e6e3c6';                     // warm haze matching the horizon
  var pal = {};
  (function buildPalette() {
    for (var k in COLORS) {
      var arr = [];
      for (var l = 0; l < FOG_LEVELS; l++) arr.push(U.mix(COLORS[k], FOG_COLOR, (l / (FOG_LEVELS - 1)) * 0.92));
      pal[k] = arr;
    }
  })();
  var fogTable = [];                             // fog level per segment index n
  function buildFogTable() {
    fogTable.length = 0;
    for (var n = 0; n < drawDistance; n++) {
      var d = n / drawDistance;
      var amount = 1 - Math.exp(-d * d * cfg.FOG_DENSITY);
      fogTable.push(Math.min(FOG_LEVELS - 1, Math.floor(amount * FOG_LEVELS)));
    }
  }
  buildFogTable();

  /* ---------- background assets (rebuilt on resize) ---------- */

  var skyGrad = null;
  var sunCanvas = null;
  var layers = [];
  var CLOUDS = [[0.06, 0.16, 1.0], [0.34, 0.08, 0.75], [0.98, 0.24, 0.9], [1.18, 0.12, 0.65]];

  function makeCanvas(view, wCss, hCss) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(wCss * view.scale));
    c.height = Math.max(1, Math.round(hCss * view.scale));
    var g = c.getContext('2d');
    g.scale(c.width / wCss, c.height / hCss);
    return { c: c, g: g };
  }

  /* A horizontally tileable hill silhouette (integer sine frequencies wrap perfectly). */
  function makeLayer(view, hCss, top, bottom, seed, base, amps, trees, speed, vspeed) {
    var w = view.w;
    var cv = makeCanvas(view, w, hCss), g = cv.g;
    var rng = U.rng(seed);
    var waves = [];
    for (var i = 0; i < amps.length; i++) {
      waves.push({ k: [1, 2, 3, 5, 7, 11][i], a: amps[i], p: rng() * Math.PI * 2 });
    }
    function surf(x) {
      var t = x / w, y = base;
      for (var j = 0; j < waves.length; j++) y -= waves[j].a * Math.sin(Math.PI * 2 * waves[j].k * t + waves[j].p);
      return y * hCss;
    }
    var grad = g.createLinearGradient(0, 0, 0, hCss);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, hCss);
    for (var x = 0; x <= w; x += 3) g.lineTo(x, surf(x));
    g.lineTo(w, surf(w));
    g.lineTo(w, hCss);
    g.closePath();
    g.fill();
    if (trees) {
      g.fillStyle = trees.color;
      for (var n = 0; n < trees.count; n++) {
        var tx = rng() * w, r = trees.r[0] + rng() * (trees.r[1] - trees.r[0]);
        for (var dx = -w; dx <= w; dx += w) {   // draw wrapped copies so the tile stays seamless
          var px = tx + dx;
          if (px < -r || px > w + r) continue;
          g.beginPath();
          g.arc(px, surf(U.wrap(px, w)) + r * 0.6, r, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    return { canvas: cv.c, h: hCss, speed: speed, vspeed: vspeed };
  }

  R.resize = function (view) {
    var w = view.w, h = view.h, portrait = h > w;
    rig.w = w;
    rig.h = h;
    rig.cx = w / 2;
    rig.cy = Math.round(h * (portrait ? 0.40 : 0.47));

    var playerScreenY = h * (portrait ? 0.81 : 0.87);       // where the road under the auto sits (leaves room for thumbs in portrait)
    var roadHalfPx = (portrait ? 0.45 : 0.31) * Math.min(w, h * 1.9);
    rig.f = roadHalfPx * cfg.PLAYER_DIST / RW;
    rig.camH = RW * (playerScreenY - rig.cy) / roadHalfPx;
    rig.playerScreenY = Math.round(playerScreenY);

    // Background layers sized from the shorter screen side so they look alike in both orientations.
    var m = Math.min(w, h);
    layers = [
      makeLayer(view, m * 0.26, '#9dbfd2', '#c4d6d3', 11, 0.55, [0.12, 0.10, 0.06, 0.03], null, 0.0015, 0.004),
      makeLayer(view, m * 0.15, '#74b862', '#8cc771', 23, 0.55, [0.08, 0.12, 0.05, 0.03],
        { color: '#5aa34d', count: 70, r: [m * 0.008, m * 0.016] }, 0.003, 0.008),
      makeLayer(view, m * 0.06, '#5fae47', '#69b84e', 37, 0.45, [0.10, 0.06, 0.08],
        { color: '#3f8f3c', count: 120, r: [m * 0.006, m * 0.013] }, 0.005, 0.012)
    ];

    // Sun with soft glow, pre-rendered.
    var sr = m * 0.065;
    var sc = makeCanvas(view, sr * 6, sr * 6), g = sc.g;
    var glow = g.createRadialGradient(sr * 3, sr * 3, sr * 0.8, sr * 3, sr * 3, sr * 3);
    glow.addColorStop(0, 'rgba(255, 245, 200, 0.85)');
    glow.addColorStop(0.35, 'rgba(255, 235, 170, 0.35)');
    glow.addColorStop(1, 'rgba(255, 235, 170, 0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, sr * 6, sr * 6);
    g.fillStyle = '#fff3b0';
    g.beginPath(); g.arc(sr * 3, sr * 3, sr, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffd84d';
    g.beginPath(); g.arc(sr * 3, sr * 3, sr * 0.86, 0, Math.PI * 2); g.fill();
    sunCanvas = { canvas: sc.c, size: sr * 6 };

    dirty = true;                                // sky gradient needs the live context
  };

  R.setQuality = function (q) {
    quality = q;
    drawDistance = q === 'low' ? cfg.DRAW_DISTANCE_LOW : cfg.DRAW_DISTANCE;
    buildFogTable();
  };
  R.getQuality = function () { return quality; };
  R.getRig = function () { return rig; };

  /* ---------- background ---------- */

  function drawBackground(ctx, st) {
    var w = rig.w, h = rig.h, cy = rig.cy;
    if (dirty) {
      skyGrad = ctx.createLinearGradient(0, 0, 0, cy);
      skyGrad.addColorStop(0, '#2a86d8');
      skyGrad.addColorStop(0.5, '#6db9ee');
      skyGrad.addColorStop(0.82, '#c6e6f1');
      skyGrad.addColorStop(1, '#f6e6bb');
      dirty = false;
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, cy + 1);

    // Ground behind the road (seen beyond crests) – hazy far grass.
    ctx.fillStyle = pal.grassD[FOG_LEVELS - 4];
    ctx.fillRect(0, cy, w, h - cy);

    var off = st.curveAcc;

    // Sun drifts slightly with the bends
    var sunX = (U.wrap(0.74 - off * 0.0008, 1.4) - 0.2) * w;
    ctx.drawImage(sunCanvas.canvas, sunX - sunCanvas.size / 2, cy * 0.32 - sunCanvas.size / 2, sunCanvas.size, sunCanvas.size);

    // Clouds drift with time and bends
    var cw = Math.min(w, h) * 0.32, chh = cw * 70 / 160;
    for (var i = 0; i < CLOUDS.length; i++) {
      var c = CLOUDS[i];
      var x = (U.wrap(c[0] - off * 0.001 - st.time * 0.004 * c[2], 1.3) - 0.15) * w;
      ctx.drawImage(AR.sprites.cloud.canvas, x, cy * c[1], cw * c[2], chh * c[2]);
    }

    // Parallax hill layers, tiled twice horizontally
    for (var j = 0; j < layers.length; j++) {
      var L = layers[j];
      var ox = U.wrap(off * L.speed, 1) * w;
      var y = cy - L.h + 2 + U.clamp(st.playerY * L.vspeed * rig.f / 1000, -L.h * 0.5, L.h * 0.5);
      ctx.drawImage(L.canvas, -ox, y, w, L.h);
      ctx.drawImage(L.canvas, w - ox, y, w, L.h);
      if (y + L.h < cy) {                          // fill any gap if layer is lifted
        ctx.fillStyle = j === layers.length - 1 ? '#69b84e' : pal.grassD[FOG_LEVELS - 4];
        ctx.fillRect(0, y + L.h - 1, w, cy - y - L.h + 1);
      }
    }
  }

  /* ---------- road ---------- */

  function quad(ctx, x1, y1, w1, x2, y2, w2, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1 - w1, y1);
    ctx.lineTo(x1 + w1, y1);
    ctx.lineTo(x2 + w2, y2);
    ctx.lineTo(x2 - w2, y2);
    ctx.closePath();
    ctx.fill();
  }

  /* Quad covering the strip between fractions a..b of the road (−1 = left edge, +1 = right edge). */
  function band(ctx, s, y2, a, b, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(s.sx1 + s.sw1 * a, s.sy1);
    ctx.lineTo(s.sx1 + s.sw1 * b, s.sy1);
    ctx.lineTo(s.sx2 + s.sw2 * b, y2);
    ctx.lineTo(s.sx2 + s.sw2 * a, y2);
    ctx.closePath();
    ctx.fill();
  }

  function drawSegment(ctx, s) {
    var f = s.fog, light = s.stripe === 0;
    var x1 = s.sx1, y1 = s.sy1, w1 = s.sw1;
    var x2 = s.sx2, y2 = s.sy2 - 1, w2 = s.sw2;    // 1px overlap into the farther segment

    ctx.fillStyle = (light ? pal.grassL : pal.grassD)[f];
    ctx.fillRect(0, y2, rig.w, y1 - y2);

    quad(ctx, x1, y1, w1 * 1.45, x2, y2, w2 * 1.45, (light ? pal.dirtL : pal.dirtD)[f]);  // dusty shoulder
    quad(ctx, x1, y1, w1 * 1.12, x2, y2, w2 * 1.12, (light ? pal.kerbR : pal.kerbW)[f]); // rumble strip

    if (s.start) {
      quad(ctx, x1, y1, w1, x2, y2, w2, pal.checkW[f]);
      var cells = 10, phase = s.index % 2;
      for (var k = 0; k < cells; k++) {
        if ((k + phase) % 2) band(ctx, s, y2, -1 + 2 * k / cells, -1 + 2 * (k + 1) / cells, pal.checkB[f]);
      }
      return;
    }

    quad(ctx, x1, y1, w1, x2, y2, w2, (light ? pal.roadL : pal.roadD)[f]);

    if (w1 > 24) {                                  // lane paint only where it is visible
      var line = pal.line[f];
      band(ctx, s, y2, -0.97, -0.94, line);         // solid edge lines
      band(ctx, s, y2, 0.94, 0.97, line);
      if (light) band(ctx, s, y2, -0.018, 0.018, line);   // dashed centre line
    }
  }

  function drawSprites(ctx, s, pr) {
    var sc = s.scale1, w = rig.w, h = rig.h;
    var inFront = pr && s.cz1 < cfg.PLAYER_DIST;      // nearer to the camera than the auto
    for (var i = 0; i < s.sprites.length; i++) {
      var sp = s.sprites[i], def = sp.def;
      var dw = def.worldW * sc;
      if (dw < 1.5) continue;
      var dh = def.worldH * sc;
      var dx = s.sx1 + sp.offset * sc * RW + dw * sp.align;
      var dy = s.sy1 - dh;
      if (dx > w || dx + dw < 0 || dy > h || dy + dh < 0) continue;
      if (s.fog > 9) ctx.globalAlpha = Math.max(0, 1 - (s.fog - 9) / 6);
      // Never let scenery hide the auto: ghost anything in front that overlaps it.
      if (inFront && dx < pr.x + pr.w && dx + dw > pr.x && dy < pr.y + pr.h && dy + dh > pr.y) ctx.globalAlpha = 0.4;
      ctx.drawImage(def.canvas, dx, dy, dw, dh);
      ctx.globalAlpha = 1;
    }
  }

  var list = [];

  function drawRoad(ctx, st) {
    var track = AR.track, segs = track.segments, N = segs.length, L = track.length;
    var pos = st.position;
    var base = track.findSegment(pos);
    var basePct = U.wrap(pos, L) % SEG / SEG;

    var camY = rig.camH + st.playerY;
    var cx = rig.cx, cy = rig.cy, f = rig.f, h = rig.h;

    var x = 0, dx = -(base.curve * basePct);
    var maxy = h, count = 0;

    // Curves bend the road sideways as it recedes. Measure that bend at the
    // auto's distance and shift the view by it, so the road under the auto
    // always stays put while the bend shows ahead.
    var px = 0, pdx = dx, pz = base.z1 - pos;
    for (var k = 0; k < 64; k++) {
      var ps = segs[(base.index + k) % N];
      if (pz + SEG > cfg.PLAYER_DIST) { px += pdx * (cfg.PLAYER_DIST - pz) / SEG; break; }
      px += pdx;
      pdx += ps.curve;
      pz += SEG;
    }
    var camX = st.cameraX * RW + px;
    var playerDrawn = !st.drawPlayer;

    // Pass 1: near → far projection and crest culling
    for (var n = 0; n < drawDistance; n++) {
      var s = segs[(base.index + n) % N];
      var cz1 = s.z1 + (s.index < base.index ? L : 0) - pos;
      var cz2 = cz1 + SEG;
      s.inView = false;
      s.roadVisible = false;
      if (cz1 <= NEAR) { x += dx; dx += s.curve; continue; }

      var sc1 = f / cz1, sc2 = f / cz2;
      s.scale1 = sc1;
      s.cz1 = cz1;
      s.sx1 = cx + sc1 * (x - camX);
      s.sy1 = Math.round(cy - sc1 * (s.y1 - camY));
      s.sw1 = sc1 * RW;
      s.sx2 = cx + sc2 * (x + dx - camX);
      s.sy2 = Math.round(cy - sc2 * (s.y2 - camY));
      s.sw2 = sc2 * RW;
      x += dx;
      dx += s.curve;

      s.fog = fogTable[n];
      s.inView = true;
      list[count++] = s;

      if (s.sy2 < s.sy1 && s.sy2 < maxy) {          // front-facing and not hidden by a nearer crest
        s.roadVisible = true;
        maxy = s.sy2;
      }
    }

    // Pass 2: far → near painter's algorithm. The auto is drawn right after the
    // road of the segment it stands on, so roadside objects nearer than it
    // correctly overlap it.
    var items = AR.items;
    for (var i = count - 1; i >= 0; i--) {
      var seg = list[i];
      var hasItems = items && seg.items && seg.items.length;
      if (seg.roadVisible) {
        drawSegment(ctx, seg);
        if (hasItems) items.drawFlat(ctx, seg);             // potholes lie on the road surface
      }
      if (!playerDrawn && seg.cz1 < cfg.PLAYER_DIST) { st.drawPlayer(ctx); playerDrawn = true; }
      if (seg.sprites.length) drawSprites(ctx, seg, st.playerRect);
      if (hasItems) items.drawUpright(ctx, seg, rig.w);    // coins, power-ups, upright obstacles
    }
    if (!playerDrawn) st.drawPlayer(ctx);
  }

  /* st = { position, playerY, cameraX, curveAcc, time, drawPlayer(ctx), playerRect } */
  R.render = function (ctx, view, st) {
    drawBackground(ctx, st);
    drawRoad(ctx, st);
  };
})(window.AutoRally = window.AutoRally || {});
