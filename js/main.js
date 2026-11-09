/* Auto Rally – bootstrap, canvas sizing and the main loop.
 *
 * - Canvas fills the screen; its backing store is CSS size × devicePixelRatio
 *   (capped by MAX_DPR and MAX_PIXELS) so drawing stays sharp on high-DPI phones.
 * - All drawing code works in CSS pixels; the context transform maps them to
 *   device pixels.
 * - Physics runs on a fixed 60 Hz timestep; rendering runs on requestAnimationFrame
 *   and receives an interpolation factor (alpha) for smooth motion on any refresh rate.
 */
(function (AR) {
  'use strict';

  var cfg = AR.config;
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d', { alpha: false });

  /* Current view metrics, shared with every other module. */
  var view = AR.view = {
    w: 1, h: 1,            // size in CSS pixels
    pxW: 1, pxH: 1,        // backing-store size in device pixels
    scale: 1,              // device pixels per CSS pixel actually used
    deviceDpr: 1,          // window.devicePixelRatio reported by the browser
    portrait: false
  };

  var stats = AR.stats = { fps: 0, ups: 0, resizes: 0 };

  /* ---------- Resizing ---------- */

  var needsResize = true;

  function requestResize() { needsResize = true; }

  function resize() {
    needsResize = false;

    var rect = canvas.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width));
    var h = Math.max(1, Math.round(rect.height));
    var deviceDpr = window.devicePixelRatio || 1;

    // Pick render scale: device DPR, capped, and reduced further on huge screens.
    var scale = Math.min(deviceDpr, cfg.MAX_DPR);
    if (w * h * scale * scale > cfg.MAX_PIXELS) {
      scale = Math.max(1, Math.sqrt(cfg.MAX_PIXELS / (w * h)));
    }

    var pxW = Math.round(w * scale);
    var pxH = Math.round(h * scale);

    // Only touch canvas.width/height when they change – it clears the canvas.
    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW;
      canvas.height = pxH;
    }

    view.w = w;
    view.h = h;
    view.pxW = pxW;
    view.pxH = pxH;
    view.scale = pxW / w;          // exact ratio after rounding
    view.deviceDpr = deviceDpr;
    view.portrait = h > w;

    // Draw in CSS pixels from now on.
    ctx.setTransform(pxW / w, 0, 0, pxH / h, 0, 0);
    ctx.imageSmoothingEnabled = true;

    stats.resizes++;
    document.documentElement.setAttribute('data-view',
      w + 'x' + h + '@' + view.scale.toFixed(2) + ' canvas=' + pxW + 'x' + pxH);

    if (AR.scene && AR.scene.resize) AR.scene.resize(view);
  }

  // Watch every way the screen size can change.
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(requestResize).observe(canvas);
  }
  window.addEventListener('resize', requestResize);
  window.addEventListener('orientationchange', function () {
    requestResize();
    setTimeout(requestResize, 300);   // some phones report the new size late
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', requestResize);
  }

  /* ---------- Pausing when hidden ---------- */

  var lastTime = 0;
  var accumulator = 0;

  AR.loop = AR.loop || { paused: false };
  // Forget time that passed before this moment (used when a race starts/resumes).
  AR.loop.resetClock = function () { lastTime = 0; accumulator = 0; };

  document.addEventListener('visibilitychange', function () {
    // Drop the time spent in the background so nothing jumps on return.
    lastTime = 0;
    accumulator = 0;
    if (AR.scene && AR.scene.onVisibility) AR.scene.onVisibility(!document.hidden);
  });

  /* ---------- Main loop ---------- */

  var fpsFrames = 0, fpsUpdates = 0, fpsTimer = 0;

  function frame(now) {
    requestAnimationFrame(frame);

    if (!lastTime) lastTime = now;
    var dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > cfg.MAX_FRAME) dt = cfg.MAX_FRAME;
    if (dt < 0) dt = 0;

    // Resize lazily inside the frame (also catches moving the window to a
    // monitor with a different pixel ratio).
    if (needsResize || (window.devicePixelRatio || 1) !== view.deviceDpr) resize();

    var scene = AR.scene;

    // Fixed-timestep updates.
    if (!AR.loop.paused) {
      accumulator += dt;
      var steps = 0;
      while (accumulator >= cfg.STEP && steps < cfg.MAX_STEPS) {
        if (scene && scene.update) scene.update(cfg.STEP, view);
        accumulator -= cfg.STEP;
        steps++;
        fpsUpdates++;
      }
      if (steps === cfg.MAX_STEPS) accumulator = 0; // device too slow: drop backlog
    }

    // Render with interpolation factor.
    var alpha = accumulator / cfg.STEP;
    if (scene && scene.render) scene.render(ctx, view, alpha);

    if (cfg.DEBUG && AR.debug) AR.debug.drawOverlay(ctx, view, stats);

    // FPS / UPS counters, refreshed twice a second.
    fpsFrames++;
    fpsTimer += dt;
    if (fpsTimer >= 0.5) {
      stats.fps = Math.round(fpsFrames / fpsTimer);
      stats.ups = Math.round(fpsUpdates / fpsTimer);
      fpsFrames = fpsUpdates = 0;
      fpsTimer = 0;
    }
  }

  /* ---------- Start ---------- */

  AR.scene = AR.scene || AR.game || null;

  window.addEventListener('keydown', function (e) {
    if (e.key === '`') cfg.DEBUG = !cfg.DEBUG;
  });

  resize();
  requestAnimationFrame(frame);
})(window.AutoRally = window.AutoRally || {});
