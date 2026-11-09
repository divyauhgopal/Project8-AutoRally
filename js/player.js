/* Auto Rally – the auto-rickshaw: physics and drawing.
 *
 * Position across the road is `x` in road half-widths:
 *   |x| ≤ 1.00  road        |x| ≤ 1.12  kerb (rumble strip)
 *   |x| ≤ 1.45  dirt shoulder (speed limited)   beyond: grass (slower still)
 *   |x| is clamped to X_LIMIT – the auto can never leave the track area.
 *
 * Physics runs in the fixed 60 Hz update; drawing interpolates between the
 * previous and current update for smooth motion on any refresh rate.
 */
(function (AR) {
  'use strict';

  var cfg = AR.config, U = AR.util;
  var MAX = cfg.MAX_SPEED;

  var P = AR.player = {
    x: 0, prevX: 0,
    speed: 0,
    steer: 0,             // smoothed steering −1..1
    tilt: 0, prevTilt: 0, // body roll (radians)
    surface: 'road',
    time: 0
  };

  P.reset = function (x, speed) {
    P.x = P.prevX = x || 0;
    P.speed = speed || 0;
    P.steer = P.tilt = P.prevTilt = 0;
    P.surface = 'road';
  };

  function surfaceAt(ax) {
    if (ax <= 1.0) return 'road';
    if (ax <= 1.12) return 'kerb';
    if (ax <= 1.45) return 'shoulder';
    return 'grass';
  }

  /* Collision feedback (visual only – the speed penalty is applied by items.js). */
  P.hitTimer = 0;
  P.hitStrength = 0;
  P.hit = function (strength) {
    P.hitTimer = 0.45;
    P.hitStrength = strength || 1;
  };

  /* One fixed physics step. Returns the distance travelled.
   * boost (optional, Turbo): { max, accel } – pushes the auto forward and raises the
   * speed cap; without it the physics are exactly as before. */
  P.update = function (dt, input, seg, boost) {
    var sp = P.speed / MAX;

    // Steering: ease toward the requested direction (no jerky snapping)
    var target = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    P.steer += (target - P.steer) * Math.min(1, dt * cfg.STEER_RESPONSE);

    P.prevX = P.x;
    // Steering needs some speed (full authority from ~65% speed upward)
    P.x += P.steer * dt * cfg.STEER_RATE * Math.min(1, sp * 1.5);
    // Curves push the auto toward the outside, growing with speed²
    P.x -= dt * cfg.STEER_RATE * sp * sp * seg.curve * cfg.CENTRIFUGAL;

    // Throttle / brake / coast (brake wins if both are held)
    if (input.down) P.speed -= cfg.BRAKE * dt;
    else if (input.up) P.speed += cfg.ACCEL * (1 - 0.55 * sp) * dt;   // eases off near top speed
    else P.speed -= cfg.COAST * dt;
    if (boost && !input.down) P.speed += boost.accel * dt;            // Turbo push

    // Off-road slowdown
    var ax = Math.abs(P.x);
    P.surface = surfaceAt(ax);
    var limit = P.surface === 'shoulder' ? MAX * cfg.SHOULDER_LIMIT :
                P.surface === 'grass' ? MAX * cfg.GRASS_LIMIT : Infinity;   // road: capped below
    if (P.speed > limit) P.speed = Math.max(limit, P.speed - cfg.OFFROAD_DECEL * dt);

    // Track boundary
    if (ax > cfg.X_LIMIT) {
      P.x = P.x > 0 ? cfg.X_LIMIT : -cfg.X_LIMIT;
      P.speed -= cfg.WALL_DRAG * dt;
    }
    if (boost) {
      P.speed = U.clamp(P.speed, 0, boost.max);
    } else if (P.speed > MAX) {
      // Above top speed only after Turbo: ease back down instead of snapping.
      P.speed = Math.max(MAX, P.speed - cfg.OVERSPEED_DECEL * dt);
      if (P.speed - MAX < cfg.ACCEL * dt) P.speed = MAX;   // plain throttle overshoot: clamp as before
    }
    P.speed = Math.max(0, P.speed);
    if (P.hitTimer > 0) P.hitTimer = Math.max(0, P.hitTimer - dt);

    // Body roll: lean into the steer, plus a little outward lean on bends
    sp = P.speed / MAX;
    var targetTilt = P.steer * sp * 0.08 - seg.curve * sp * sp * 0.008;
    P.prevTilt = P.tilt;
    P.tilt += (targetTilt - P.tilt) * Math.min(1, dt * 8);

    P.time += dt;
    return P.speed * dt;
  };

  /* ---------- drawing ---------- */

  var BASE_W = 200, BASE_H = 200;        // design size of the auto artwork
  var sprite = null;                     // canvas rendered at exact on-screen size

  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  /* Rear view of a yellow-and-green auto-rickshaw. */
  function drawAuto(g) {
    var grad;

    // Rear wheels
    rr(g, 16, 146, 32, 50, 9); g.fillStyle = '#161616'; g.fill();
    rr(g, 152, 146, 32, 50, 9); g.fill();
    g.fillStyle = '#9aa0a8';
    g.fillRect(24, 164, 16, 14);
    g.fillRect(160, 164, 16, 14);

    // Side mirrors
    g.strokeStyle = '#333'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(22, 74); g.lineTo(9, 62); g.moveTo(178, 74); g.lineTo(191, 62); g.stroke();
    g.fillStyle = '#c9ced6';
    g.beginPath(); g.ellipse(8, 58, 6, 8, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(192, 58, 6, 8, 0, 0, Math.PI * 2); g.fill();

    // Yellow canopy (hood)
    grad = g.createLinearGradient(0, 6, 0, 100);
    grad.addColorStop(0, '#ffe066');
    grad.addColorStop(1, '#f7b500');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(22, 102);
    g.lineTo(25, 40);
    g.quadraticCurveTo(28, 8, 62, 6);
    g.lineTo(138, 6);
    g.quadraticCurveTo(172, 8, 175, 40);
    g.lineTo(178, 102);
    g.closePath();
    g.fill();
    g.strokeStyle = '#1e1e1e'; g.lineWidth = 3; g.stroke();
    // Canopy seam highlight
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(40, 14); g.quadraticCurveTo(100, 8, 160, 14); g.stroke();

    // Rear window with driver silhouette
    rr(g, 46, 30, 108, 50, 12);
    grad = g.createLinearGradient(0, 30, 0, 80);
    grad.addColorStop(0, '#34495e');
    grad.addColorStop(1, '#1c2833');
    g.fillStyle = grad; g.fill();
    g.strokeStyle = '#1e1e1e'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#0f171e';
    g.beginPath(); g.arc(100, 54, 13, 0, Math.PI * 2); g.fill();          // head
    rr(g, 74, 64, 52, 20, 9); g.fill();                                  // shoulders
    g.save();
    rr(g, 46, 30, 108, 50, 12); g.clip();
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.beginPath(); g.moveTo(60, 30); g.lineTo(84, 30); g.lineTo(58, 80); g.lineTo(34, 80); g.closePath(); g.fill();
    g.restore();

    // Black band under the canopy
    g.fillStyle = '#1e1e1e';
    g.fillRect(22, 90, 156, 12);

    // Green body
    grad = g.createLinearGradient(0, 100, 0, 168);
    grad.addColorStop(0, '#27b35a');
    grad.addColorStop(1, '#137a37');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(22, 100);
    g.lineTo(178, 100);
    g.quadraticCurveTo(186, 102, 186, 116);
    g.lineTo(184, 164);
    g.lineTo(16, 164);
    g.lineTo(14, 116);
    g.quadraticCurveTo(14, 102, 22, 100);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.fillRect(20, 104, 160, 4);                                          // body highlight

    // Tail lights + indicators
    rr(g, 24, 114, 22, 13, 4); g.fillStyle = '#e8262b'; g.fill();
    rr(g, 154, 114, 22, 13, 4); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(28, 116, 8, 3); g.fillRect(158, 116, 8, 3);
    rr(g, 26, 130, 14, 8, 3); g.fillStyle = '#ff9f1c'; g.fill();
    rr(g, 160, 130, 14, 8, 3); g.fill();

    // Yellow commercial number plate
    rr(g, 68, 124, 64, 24, 4); g.fillStyle = '#ffd23f'; g.fill();
    g.strokeStyle = '#1e1e1e'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#1e1e1e';
    g.font = '800 12px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('KA 01 AR', 100, 137);

    // Bumper
    rr(g, 8, 158, 184, 12, 5); g.fillStyle = '#2b2b2b'; g.fill();
    g.fillStyle = '#c9ced6';
    g.fillRect(14, 159, 172, 2);

    // Decorative tassels
    var cols = ['#e63946', '#ff9f1c', '#e63946', '#ff9f1c'];
    for (var i = 0; i < 4; i++) {
      var tx = i < 2 ? 30 + i * 9 : 152 + (i - 2) * 9;
      g.fillStyle = cols[i];
      g.beginPath(); g.moveTo(tx, 102); g.lineTo(tx + 6, 102); g.lineTo(tx + 3, 112); g.closePath(); g.fill();
    }
  }

  var spriteW = 0;

  /* Re-render the artwork whenever the on-screen size changes, so it stays crisp. */
  P.resize = function (view, rig) {
    spriteW = cfg.AUTO_WIDTH * rig.f / cfg.PLAYER_DIST;       // CSS px at the player's distance
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(spriteW * view.scale));
    c.height = Math.max(1, Math.ceil(spriteW * BASE_H / BASE_W * view.scale));
    var g = c.getContext('2d');
    g.scale(c.width / BASE_W, c.height / BASE_H);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    drawAuto(g);
    sprite = c;
  };

  /* Screen rectangle the auto occupies (used to ghost scenery in front of it). */
  P.screenRect = function (rig, alpha, camX, out) {
    var x = U.lerp(P.prevX, P.x, alpha);
    var h = spriteW * BASE_H / BASE_W;
    out.x = rig.cx + (x - camX) * cfg.ROAD_WIDTH * rig.f / cfg.PLAYER_DIST - spriteW / 2;
    out.y = rig.playerScreenY - h;
    out.w = spriteW;
    out.h = h;
    return out;
  };

  /* Draw at the road position under the auto. camX = camera offset in road half-widths. */
  P.draw = function (ctx, rig, alpha, camX) {
    if (!sprite) return;
    var x = U.lerp(P.prevX, P.x, alpha);
    var tilt = U.lerp(P.prevTilt, P.tilt, alpha);
    var scale = rig.f / cfg.PLAYER_DIST;
    var w = spriteW, h = spriteW * BASE_H / BASE_W;
    var sx = rig.cx + (x - camX) * cfg.ROAD_WIDTH * scale;
    var sy = rig.playerScreenY;
    var sp = P.speed / MAX;

    // Bumps: gentle engine shake on the road, rough bouncing off it
    var bounce = Math.sin(P.time * 55) * w * 0.004 * (0.3 + sp);
    if (P.surface === 'kerb') bounce = Math.sin(P.time * 70) * w * 0.012 * sp;
    else if (P.surface === 'shoulder' || P.surface === 'grass') {
      bounce = (Math.sin(P.time * 37) + Math.sin(P.time * 23)) * w * 0.012 * (0.3 + sp);
    }

    // Ground shadow (does not tilt)
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(sx, sy - h * 0.01, w * 0.5, h * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();

    // Collision wobble
    var jolt = 0;
    if (P.hitTimer > 0) {
      var k = P.hitTimer / 0.45 * P.hitStrength;
      jolt = Math.sin(P.time * 45) * 0.09 * k;
      bounce -= Math.abs(Math.sin(P.time * 30)) * h * 0.05 * k;
    }

    ctx.save();
    ctx.translate(sx, sy + bounce - h * 0.02);
    ctx.rotate(tilt + jolt);
    ctx.transform(1, 0, -P.steer * 0.06, 1, 0, 0);    // slight skew: the auto turns its nose
    ctx.drawImage(sprite, -w / 2, -h, w, h);
    ctx.restore();
  };
})(window.AutoRally = window.AutoRally || {});
