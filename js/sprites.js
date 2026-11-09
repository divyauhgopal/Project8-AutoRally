/* Auto Rally – procedurally drawn scenery sprites.
 *
 * Every sprite is drawn ONCE at start-up into an off-screen canvas, then simply
 * scaled with drawImage while racing. No image files are needed, so it all works
 * offline and stays tiny.
 *
 * Each sprite: { canvas, worldW, worldH }  (world units; road half-width = 2000)
 */
(function (AR) {
  'use strict';

  var RES = 2;                       // sprite canvas resolution multiplier
  var FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  var TAU = Math.PI * 2;

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

  /* ---------- drawing helpers ---------- */

  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function rect(g, x, y, w, h, col) { g.fillStyle = col; g.fillRect(x, y, w, h); }
  function circle(g, x, y, r, col) {
    g.fillStyle = col;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }
  function shadow(g, cx, by, rx) {
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.beginPath();
    g.ellipse(cx, by - rx * 0.12, rx, rx * 0.14, 0, 0, TAU);
    g.fill();
  }
  function text(g, str, x, y, size, col, weight) {
    g.fillStyle = col;
    g.font = (weight || '800') + ' ' + size + 'px ' + FONT;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(str, x, y);
  }
  function posts(g, x1, x2, top, bottom, col) {
    rect(g, x1 - 2, top, 4, bottom - top, col);
    rect(g, x2 - 2, top, 4, bottom - top, col);
  }

  /* ---------- scenery ---------- */

  function neemTree(g) {
    shadow(g, 65, 160, 46);
    g.fillStyle = '#7a4a24';
    g.beginPath();
    g.moveTo(57, 160); g.lineTo(73, 160); g.lineTo(69, 100); g.lineTo(82, 80);
    g.lineTo(77, 76); g.lineTo(66, 90); g.lineTo(63, 70); g.lineTo(57, 72); g.lineTo(60, 102);
    g.closePath();
    g.fill();
    var blobs = [[65, 58, 38], [36, 72, 27], [94, 72, 27], [50, 38, 25], [82, 40, 25], [65, 84, 28]];
    var i, b;
    for (i = 0; i < blobs.length; i++) { b = blobs[i]; circle(g, b[0], b[1], b[2], '#2e7a31'); }
    for (i = 0; i < blobs.length; i++) { b = blobs[i]; circle(g, b[0] - 3, b[1] - 4, b[2] * 0.82, '#3f9a3c'); }
    for (i = 0; i < blobs.length; i++) { b = blobs[i]; circle(g, b[0] - 7, b[1] - 9, b[2] * 0.42, '#66bb4f'); }
  }

  function frond(g, x, y, ang, len, col) {
    var tx = x + Math.cos(ang) * len;
    var ty = y + Math.sin(ang) * len + len * 0.3;
    var nx = -Math.sin(ang) * len * 0.17, ny = Math.cos(ang) * len * 0.17;
    var mx = (x + tx) / 2, my = (y + ty) / 2 - len * 0.18;
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(mx + nx, my + ny, tx, ty);
    g.quadraticCurveTo(mx - nx, my - ny, x, y);
    g.fill();
  }

  function palmTree(g) {
    shadow(g, 58, 200, 26);
    g.strokeStyle = '#8b5a2b';
    g.lineWidth = 10;
    g.beginPath();
    g.moveTo(56, 200);
    g.quadraticCurveTo(44, 120, 62, 46);
    g.stroke();
    g.strokeStyle = '#6d4420';
    g.lineWidth = 1.5;
    for (var t = 0.1; t < 0.95; t += 0.09) {
      var y = 200 - t * 154;
      var x = (1 - t) * (1 - t) * 56 + 2 * (1 - t) * t * 44 + t * t * 62;
      g.beginPath(); g.moveTo(x - 5, y); g.lineTo(x + 5, y - 2); g.stroke();
    }
    var angs = [-2.9, -2.35, -1.85, -1.3, -0.8, -0.25, 0.25, 3.4];
    for (var i = 0; i < angs.length; i++) frond(g, 62, 46, angs[i], 50, i % 2 ? '#2f8f3a' : '#3ba845');
    circle(g, 58, 52, 5, '#6b4a1e');
    circle(g, 66, 53, 5, '#7a5524');
    circle(g, 62, 58, 5, '#5e3f18');
  }

  function bush(g) {
    shadow(g, 35, 45, 30);
    circle(g, 22, 30, 15, '#2f7f33');
    circle(g, 48, 30, 15, '#2f7f33');
    circle(g, 35, 22, 17, '#3a9a3b');
    circle(g, 30, 18, 7, '#69bf52');
    circle(g, 50, 26, 5, '#e94f8a');   // a few bougainvillea flowers
    circle(g, 20, 27, 4, '#e94f8a');
    circle(g, 38, 12, 4, '#f06aa0');
  }

  function house(wall, trim, door) {
    return function (g) {
      shadow(g, 60, 110, 56);
      rect(g, 10, 30, 100, 78, wall);
      rect(g, 10, 30, 100, 6, 'rgba(0,0,0,0.08)');
      rect(g, 6, 24, 108, 8, trim);                 // parapet
      rr(g, 78, 6, 22, 19, 4); g.fillStyle = '#2b2b2b'; g.fill();   // water tank
      rect(g, 80, 9, 18, 2, '#555');
      rect(g, 20, 60, 24, 48, trim);                // door frame
      rect(g, 23, 63, 18, 45, door);
      rect(g, 31, 63, 1.5, 45, 'rgba(0,0,0,0.25)');
      rect(g, 56, 48, 40, 28, trim);                // window
      rect(g, 59, 51, 34, 22, '#bfe3ff');
      g.strokeStyle = '#3b3b3b'; g.lineWidth = 1.2;
      for (var x = 64; x < 93; x += 6) { g.beginPath(); g.moveTo(x, 51); g.lineTo(x, 73); g.stroke(); }
      rect(g, 10, 100, 100, 8, 'rgba(0,0,0,0.12)');
      rect(g, 52, 84, 48, 10, trim);                // painted band
    };
  }

  function chaiShop(g) {
    shadow(g, 55, 110, 54);
    rect(g, 10, 36, 90, 72, '#e9c46a');
    rect(g, 14, 72, 82, 36, '#8d5524');
    g.strokeStyle = '#6e3f17'; g.lineWidth = 1;
    for (var y = 80; y < 108; y += 7) { g.beginPath(); g.moveTo(14, y); g.lineTo(96, y); g.stroke(); }
    circle(g, 30, 66, 5, '#c0c0c0');                // kettle
    rect(g, 28, 58, 4, 4, '#c0c0c0');
    for (var i = 0; i < 4; i++) rect(g, 50 + i * 9, 62, 5, 9, 'rgba(255,255,255,0.75)');  // glasses
    // striped awning with scalloped edge
    for (var s = 0; s < 8; s++) {
      g.fillStyle = s % 2 ? '#ffffff' : '#e63946';
      g.beginPath();
      g.moveTo(4 + s * 12.75, 36); g.lineTo(4 + (s + 1) * 12.75, 36);
      g.lineTo(2 + (s + 1) * 13, 50); g.lineTo(2 + s * 13, 50);
      g.closePath(); g.fill();
      circle(g, 2 + s * 13 + 6.5, 50, 6.5, s % 2 ? '#ffffff' : '#e63946');
    }
    posts(g, 26, 84, 26, 36, '#5a3a1a');
    rr(g, 18, 6, 74, 24, 5); g.fillStyle = '#ffd23f'; g.fill();
    g.strokeStyle = '#e63946'; g.lineWidth = 2; g.stroke();
    text(g, 'CHAI', 55, 19, 16, '#c1121f');
  }

  function dhaba(g) {
    shadow(g, 80, 110, 78);
    rect(g, 8, 40, 144, 68, '#f4a261');
    rect(g, 4, 34, 152, 8, '#e76f51');
    rect(g, 22, 62, 30, 46, '#5c3317');
    rect(g, 106, 62, 30, 46, '#5c3317');
    rect(g, 62, 56, 36, 24, '#bfe3ff');
    rect(g, 62, 56, 36, 3, '#e76f51');
    // charpai (woven cot) in front
    rect(g, 58, 92, 46, 5, '#8b5a2b');
    g.strokeStyle = '#d9b26f'; g.lineWidth = 1;
    for (var x = 61; x < 103; x += 4) { g.beginPath(); g.moveTo(x, 92); g.lineTo(x + 2, 97); g.stroke(); }
    rect(g, 60, 97, 3, 10, '#6d4420'); rect(g, 99, 97, 3, 10, '#6d4420');
    posts(g, 40, 120, 24, 34, '#5a3a1a');
    rr(g, 26, 2, 108, 26, 5); g.fillStyle = '#c1121f'; g.fill();
    g.strokeStyle = '#ffd23f'; g.lineWidth = 2; g.stroke();
    text(g, 'DHABA', 80, 16, 17, '#ffd23f');
  }

  function temple(g) {
    shadow(g, 45, 150, 44);
    rect(g, 6, 136, 78, 14, '#d9cfbd');
    rect(g, 12, 128, 66, 9, '#e8e0d0');
    rect(g, 20, 86, 50, 43, '#fff6e8');
    g.fillStyle = '#ff8c1a';
    g.beginPath();
    g.moveTo(36, 129); g.lineTo(36, 104); g.arc(45, 104, 9, Math.PI, 0); g.lineTo(54, 129);
    g.closePath(); g.fill();
    // shikhara (tower)
    g.fillStyle = '#fff1dc';
    g.beginPath();
    g.moveTo(17, 88);
    g.quadraticCurveTo(26, 40, 45, 24);
    g.quadraticCurveTo(64, 40, 73, 88);
    g.closePath(); g.fill();
    g.strokeStyle = '#e6cfa8'; g.lineWidth = 1.5;
    for (var y = 40; y < 88; y += 8) {
      var half = 8 + (y - 24) * 0.42;
      g.beginPath(); g.moveTo(45 - half, y); g.lineTo(45 + half, y); g.stroke();
    }
    circle(g, 45, 22, 5, '#f4b400');
    g.strokeStyle = '#6d4420'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(45, 18); g.lineTo(45, 2); g.stroke();
    g.fillStyle = '#ff7a00';
    g.beginPath(); g.moveTo(45, 2); g.lineTo(62, 7); g.lineTo(45, 12); g.closePath(); g.fill();
  }

  function haystack(g) {
    shadow(g, 40, 70, 36);
    g.fillStyle = '#e9b949';
    g.beginPath();
    g.moveTo(4, 68);
    g.quadraticCurveTo(6, 10, 40, 8);
    g.quadraticCurveTo(74, 10, 76, 68);
    g.closePath(); g.fill();
    g.strokeStyle = '#c99a2e'; g.lineWidth = 1.2;
    for (var i = 0; i < 9; i++) {
      var x = 12 + i * 7;
      g.beginPath(); g.moveTo(x, 66); g.quadraticCurveTo(x + 3, 40, 40 + (x - 40) * 0.3, 14); g.stroke();
    }
    rect(g, 39, 0, 2.5, 12, '#6d4420');
  }

  function hut(g) {
    shadow(g, 55, 100, 52);
    rect(g, 16, 52, 78, 46, '#c68b59');
    rect(g, 16, 52, 78, 4, 'rgba(0,0,0,0.12)');
    rect(g, 46, 66, 18, 32, '#4a2c14');
    g.fillStyle = '#d4a24c';
    g.beginPath();
    g.moveTo(4, 56); g.lineTo(30, 14); g.lineTo(80, 14); g.lineTo(106, 56);
    g.closePath(); g.fill();
    g.strokeStyle = '#b5832f'; g.lineWidth = 1.2;
    for (var x = 10; x < 104; x += 6) {
      g.beginPath(); g.moveTo(x, 56); g.lineTo(30 + (x - 4) * 0.49, 15); g.stroke();
    }
    rect(g, 22, 70, 14, 12, '#4a2c14');
  }

  function chevron(dir) {
    return function (g) {
      posts(g, 16, 44, 36, 70, '#555b66');
      rr(g, 3, 4, 54, 34, 4); g.fillStyle = '#ffcc00'; g.fill();
      g.strokeStyle = '#1b1b1b'; g.lineWidth = 2; g.stroke();
      g.lineWidth = 6;
      for (var i = 0; i < 2; i++) {
        var cx = 22 + i * 16;
        g.beginPath();
        g.moveTo(cx - 5 * dir, 12); g.lineTo(cx + 5 * dir, 21); g.lineTo(cx - 5 * dir, 30);
        g.stroke();
      }
    };
  }

  function signBoard(bg, border, line1, line2) {
    return function (g) {
      posts(g, 30, 120, 60, 110, '#555b66');
      rr(g, 5, 4, 140, 62, 7); g.fillStyle = bg; g.fill();
      g.strokeStyle = border; g.lineWidth = 3; g.stroke();
      text(g, line1, 75, 25, 21, '#ffffff');
      text(g, line2, 75, 49, 15, '#ffffff', '700');
    };
  }

  function milestone(g) {
    shadow(g, 20, 56, 17);
    rr(g, 6, 16, 28, 40, 3); g.fillStyle = '#f5f5f0'; g.fill();
    g.fillStyle = '#ffc72c';
    g.beginPath(); g.moveTo(6, 24); g.arc(20, 20, 14, Math.PI, 0); g.lineTo(34, 24); g.closePath(); g.fill();
    text(g, 'AR', 20, 15, 9, '#1b1b1b');
    text(g, '3', 20, 40, 15, '#1b1b1b');
  }

  function rock(g) {
    shadow(g, 35, 45, 32);
    g.fillStyle = '#8d8f94';
    g.beginPath();
    g.moveTo(4, 43); g.lineTo(10, 18); g.lineTo(30, 6); g.lineTo(52, 10); g.lineTo(66, 28); g.lineTo(66, 43);
    g.closePath(); g.fill();
    g.fillStyle = '#a9abb0';
    g.beginPath(); g.moveTo(12, 20); g.lineTo(30, 8); g.lineTo(40, 22); g.lineTo(20, 30); g.closePath(); g.fill();
    g.fillStyle = '#76787d';
    g.beginPath(); g.moveTo(40, 22); g.lineTo(66, 30); g.lineTo(66, 43); g.lineTo(36, 43); g.closePath(); g.fill();
  }

  function startArch(g) {
    // striped pillars
    for (var p = 0; p < 2; p++) {
      var px = p ? 226 : 10;
      for (var y = 40; y < 200; y += 16) rect(g, px, y, 24, 16, (y / 16) % 2 < 1 ? '#e53b2c' : '#ffffff');
      rect(g, px - 3, 194, 30, 6, '#3b3b3b');
    }
    // banner
    rr(g, 0, 18, 260, 56, 6); g.fillStyle = '#1b1f3b'; g.fill();
    g.strokeStyle = '#ffd23f'; g.lineWidth = 3; g.stroke();
    for (var x = 4; x < 256; x += 8) {
      var k = (x - 4) / 8;
      rect(g, x, 23, 8, 6, k % 2 ? '#ffffff' : '#111111');
      rect(g, x, 63, 8, 6, k % 2 ? '#111111' : '#ffffff');
    }
    text(g, 'AUTO RALLY', 130, 46, 28, '#ffd23f', '900');
    // marigold garland
    for (var t = 0; t <= 1.0001; t += 1 / 24) {
      var gx = 36 + t * 188, gy = 80 + Math.sin(t * Math.PI) * 18;
      circle(g, gx, gy, 4.2, Math.round(t * 24) % 2 ? '#ff9f1c' : '#ffd23f');
    }
  }

  function cloud(g) {
    circle(g, 40, 40, 20, '#ffffff');
    circle(g, 70, 30, 26, '#ffffff');
    circle(g, 104, 38, 21, '#ffffff');
    circle(g, 128, 44, 14, '#ffffff');
    g.fillStyle = 'rgba(200, 220, 235, 0.55)';
    g.fillRect(24, 48, 120, 10);
    rr(g, 20, 40, 128, 18, 9); g.fillStyle = '#ffffff'; g.fill();
    rr(g, 24, 50, 120, 8, 4); g.fillStyle = 'rgba(205, 222, 238, 0.9)'; g.fill();
  }

  /* ---------- registry ---------- */

  function sprite(w, h, draw, worldH) {
    var canvas = make(w, h, draw);
    return { canvas: canvas, worldH: worldH, worldW: worldH * w / h };
  }

  var S = AR.sprites = {
    neem:      sprite(130, 160, neemTree, 3800),
    palm:      sprite(124, 200, palmTree, 5200),
    bush:      sprite(70, 45, bush, 800),
    houseP:    sprite(120, 110, house('#f7a8c4', '#ffffff', '#7b3f00'), 2600),
    houseB:    sprite(120, 110, house('#8ecae6', '#ffffff', '#6b3e26'), 2600),
    houseY:    sprite(120, 110, house('#ffd166', '#e76f51', '#5a3a1a'), 2600),
    chai:      sprite(110, 110, chaiShop, 2300),
    dhaba:     sprite(160, 110, dhaba, 2500),
    temple:    sprite(90, 150, temple, 3600),
    haystack:  sprite(80, 70, haystack, 1300),
    hut:       sprite(110, 100, hut, 2100),
    chevronL:  sprite(60, 70, chevron(-1), 1300),
    chevronR:  sprite(60, 70, chevron(1), 1300),
    signTown:  sprite(150, 110, signBoard('#1f7a3a', '#ffffff', 'RALLYPUR', '5 km  →'), 2400),
    signChai:  sprite(150, 110, signBoard('#1d5fa8', '#ffffff', 'CHAI • DHABA', '200 m ahead'), 2400),
    milestone: sprite(40, 56, milestone, 650),
    rock:      sprite(70, 45, rock, 700)
  };

  // The start/finish arch spans the road: pillars sit just outside the kerbs.
  var archCanvas = make(260, 200, startArch);
  var archW = 2 * 2000 * 1.18 * (260 / 216);
  S.arch = { canvas: archCanvas, worldW: archW, worldH: archW * 200 / 260 };

  S.cloud = { canvas: make(160, 70, cloud) };
})(window.AutoRally = window.AutoRally || {});
