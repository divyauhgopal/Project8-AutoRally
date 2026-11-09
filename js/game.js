/* Auto Rally – game scene and race flow.
 *
 *   MENU → COUNTDOWN → RACING ⇄ PAUSED → FINISHED (results) → COUNTDOWN / MENU
 *
 * - The countdown is exactly 180 fixed steps (3 s); the race clock starts on
 *   the step that shows GO!, which is also when touch auto-gas switches on.
 * - Pausing stops the fixed-step loop entirely, so physics, clouds and the
 *   clock freeze on the exact step they were on.
 * - The race is timed and lapped by race.js.
 *
 * Test hooks (URL parameters):
 *   ?debug=1            stats panel     ?quality=low|high   render quality
 *   ?touch=1 / 0        force touch controls on / off (see touch.js)
 */
(function (AR) {
  'use strict';

  var cfg = AR.config, U = AR.util, track = AR.track, R = AR.renderer;
  var player = AR.player, race = AR.race, ui = AR.ui, input = AR.input, items = AR.items;
  var storage = AR.storage, audio = AR.audio;
  var SEG = cfg.SEGMENT_LENGTH;
  var COUNTDOWN_STEPS = Math.round(3 / cfg.STEP);
  var GO_SHOW_STEPS = Math.round(0.8 / cfg.STEP);

  var params = new URLSearchParams(window.location.search);

  var game = AR.game = {
    state: 'menu',                  // menu | countdown | racing | paused | finished
    position: 0, prevPosition: 0,   // camera distance along the track
    curveAcc: 0, prevCurveAcc: 0,   // accumulated bends → background parallax
    camX: 0, prevCamX: 0,           // camera offset across the road
    time: 0,                        // scene time (clouds etc.), frozen while paused
    countdownSteps: 0,
    goSteps: 0,
    finishedSteps: 0,
    pausedFrom: null
  };

  if (params.has('debug')) cfg.DEBUG = params.get('debug') !== '0';
  var forcedQuality = params.get('quality');
  if (forcedQuality === 'low' || forcedQuality === 'high') R.setQuality(forcedQuality);

  function playerZ(pos) { return U.wrap(pos + cfg.PLAYER_DIST, track.length); }

  function heightAt(z) {
    var s = track.findSegment(z);
    return U.lerp(s.y1, s.y2, (U.wrap(z, track.length) % SEG) / SEG);
  }

  /* Put the auto on the grid: centred, stopped, just behind the start line. */
  function placeOnGrid() {
    game.position = game.prevPosition = U.wrap(-cfg.START_OFFSET - cfg.PLAYER_DIST, track.length);
    game.curveAcc = game.prevCurveAcc = 0;
    player.reset(0, 0);
    game.camX = game.prevCamX = 0;
  }

  var RESULTS_DELAY = Math.round(1.6 / cfg.STEP);     // "FINISH!" banner before results

  function setState(state) {
    var loop = AR.loop = AR.loop || {};
    // Starting or resuming: don't let time from before this moment leak into the race.
    if ((state === 'countdown' || loop.paused) && loop.resetClock) loop.resetClock();
    game.state = state;
    input.setGasEnabled(state === 'racing');          // touch auto-gas only while racing
    loop.paused = state === 'paused';
    ui.setState(state);
  }

  /* ---------- flow ---------- */

  game.toMenu = function () {
    audio.stopAll();                 // no engine or effects on the menu
    input.releaseAll();
    race.reset();
    items.reset();
    placeOnGrid();
    game.lastResult = null;
    ui.setBest(storage.getBest(), storage.isAvailable());
    setState('menu');
  };

  game.startRace = function () {
    audio.stopAll();                 // restart: silence the previous race
    input.releaseAll();
    race.reset();
    items.reset();               // coins back, power-ups off, nothing collected or hit
    placeOnGrid();
    game.lastResult = null;      // the saved best time is untouched
    game.countdownSteps = COUNTDOWN_STEPS;
    game.goSteps = 0;
    game.finishedSteps = 0;
    setState('countdown');
    ui.countdown('3');
    audio.play('beep');
  };

  game.pause = function () {
    if (game.state !== 'racing' && game.state !== 'countdown') return;
    game.pausedFrom = game.state;
    input.releaseAll();
    setState('paused');
    audio.pauseRace(true);           // engine and race sounds silent; menu clicks still work
  };

  game.resume = function () {
    if (game.state !== 'paused') return;
    var to = game.pausedFrom || 'racing';
    game.pausedFrom = null;
    setState(to);
    audio.pauseRace(false);          // engine comes back if it was running
  };

  /* ---------- sound on/off (saved with the other settings) ---------- */
  game.toggleMute = function () {
    var m = !audio.isMuted();
    audio.setMuted(m);
    ui.setMuted(m);
    storage.setSetting('muted', m);
    if (!m) audio.play('click');
  };
  var startMuted = storage.getSetting('muted', false);
  audio.setMuted(startMuted);
  ui.setMuted(startMuted);
  ui.on('mute', game.toggleMute);

  ui.on('start', game.startRace);
  ui.on('restart', game.startRace);
  ui.on('menu', game.toMenu);
  ui.on('pause', game.pause);
  ui.on('resume', game.resume);
  ui.on('resetBest', function () {
    storage.resetBest();
    ui.setBest(storage.getBest(), storage.isAvailable());
  });

  // Auto-pause when the player switches app / tab or the window loses focus.
  document.addEventListener('visibilitychange', function () { if (document.hidden) game.pause(); });
  window.addEventListener('blur', game.pause);

  // Keyboard shortcuts for the flow (driving keys are handled by input.js).
  window.addEventListener('keydown', function (e) {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key;
    if (k === 'm' || k === 'M') { game.toggleMute(); e.preventDefault(); return; }
    if (k === 'p' || k === 'P' || k === 'Escape') {
      if (game.state === 'paused') game.resume(); else game.pause();
      e.preventDefault();
      return;
    }
    // Enter / Space start or restart – unless a focused button will handle it itself.
    var onButton = document.activeElement && document.activeElement.tagName === 'BUTTON' &&
      !document.activeElement.closest('[hidden]');
    if ((k === 'Enter' || k === ' ') && !onButton && !ui.isDialogOpen()) {
      if (game.state === 'menu') { game.startRace(); e.preventDefault(); }
      else if (game.state === 'finished' && game.finishedSteps >= RESULTS_DELAY) { game.startRace(); e.preventDefault(); }
    }
  });

  /* ---------- adaptive quality for slow phones ---------- */
  var slowTime = 0;
  function watchPerformance(dt) {
    if (forcedQuality || R.getQuality() === 'low') return;
    var fps = AR.stats.fps;
    if (fps > 0 && fps < 40) slowTime += dt;
    else slowTime = Math.max(0, slowTime - dt);
    if (slowTime > 4) R.setQuality('low');
  }

  /* ---------- fixed-step update ---------- */

  var NO_INPUT = { left: false, right: false, up: false, down: false };
  var autopilot = { left: false, right: false, up: false, down: false };

  function drive(dt, controls) {
    var seg = track.findSegment(game.position + cfg.PLAYER_DIST);
    var prevZ = playerZ(game.position);
    var d = player.update(dt, controls, seg, items.boost());
    game.curveAcc += seg.curve * d / SEG;
    game.position = U.wrap(game.position + d, track.length);
    game.camX = player.x * cfg.CAMERA_FOLLOW;
    return [prevZ, playerZ(game.position)];
  }

  game.lastEvent = null;    // for tests / debugging

  game.update = function (dt) {
    if (game.state === 'paused') return;             // frozen (loop is also paused)

    game.prevPosition = game.position;
    game.prevCurveAcc = game.curveAcc;
    game.prevCamX = game.camX;
    player.prevX = player.x;
    player.prevTilt = player.tilt;
    game.time += dt;
    watchPerformance(dt);
    if (game.state !== 'racing') items.update(dt, 0, 0, false);     // animations only, no pick-ups

    if (game.state === 'countdown') {
      game.countdownSteps--;
      if (game.countdownSteps <= 0) {
        setState('racing');                          // clock starts on this exact step
        game.goSteps = GO_SHOW_STEPS;
        ui.countdown('GO!');
        audio.play('go');
        audio.engineUpdate(0, false, false, false);
        audio.engineStart();                         // engine starts exactly at GO
      } else if (game.countdownSteps % 60 === 0) {
        ui.countdown(String(game.countdownSteps / 60));
        audio.play('beep');
      }
      return;
    }

    if (game.state === 'racing') {
      var z = drive(dt, input.state);
      items.update(dt, z[0], z[1], true);          // collisions, pick-ups, power-up timers
      var ev = race.step(z[0], z[1], track.length);
      if (ev) game.lastEvent = ev;
      if (race.steps % 3 === 0) {                  // engine follows speed, throttle, brake, Turbo (20×/s)
        audio.engineUpdate(player.speed / cfg.MAX_SPEED, input.state.up, input.state.down, items.state.turbo > 0);
      }
      if (ev === 'lap') {
        ui.toast(race.lap === race.laps ? 'FINAL LAP!' : 'LAP ' + race.lap + ' / ' + race.laps, race.lap === race.laps ? 'final' : '', 1500);
        audio.play(race.lap === race.laps ? 'finallap' : 'lap');
      } else if (ev === 'finish') {
        audio.engineStop();                          // no engine after the finish
        audio.play('finish');
        items.state.turbo = items.state.shield = 0;    // power-ups end with the race
        // The only place a time is ever saved: right after the 3rd lap is completed.
        game.lastResult = storage.submitRace(race.finalTime, race.lapTimes, items.state.coins);
        game.finishedSteps = 0;
        setState('finished');
        ui.toast('FINISH!', 'finish', 0);
      }
      if (game.goSteps > 0 && --game.goSteps === 0) ui.hideCountdown();
      return;
    }

    if (game.state === 'finished') {
      // Victory roll: steer back to the middle and coast to a stop.
      autopilot.left = player.x > 0.15;
      autopilot.right = player.x < -0.15;
      autopilot.down = player.speed > cfg.MAX_SPEED * 0.3;
      drive(dt, autopilot);
      game.finishedSteps++;
      if (game.finishedSteps === RESULTS_DELAY) {
        ui.hideToast();
        ui.showResults(items.state.coins, game.lastResult);
        if (game.lastResult && game.lastResult.isNew) audio.play('record');
        ui.setState('results');
      }
      return;
    }

    // menu: auto idles on the grid
    drive(dt, NO_INPUT);
  };

  /* ---------- render ---------- */

  var renderAlpha = 0;
  var playerRect = { x: 0, y: 0, w: 0, h: 0 };
  var st = {
    position: 0, playerY: 0, cameraX: 0, curveAcc: 0, time: 0, playerRect: null,
    drawPlayer: function (ctx) {
      player.draw(ctx, R.getRig(), renderAlpha, st.cameraX);
      items.drawPlayerOverlay(ctx, playerRect);     // shield bubble, turbo flames
    }
  };

  game.render = function (ctx, view, alpha) {
    renderAlpha = alpha;
    var cur = game.position;
    if (cur < game.prevPosition) cur += track.length;           // wrapped past the line
    st.position = U.wrap(U.lerp(game.prevPosition, cur, alpha), track.length);
    st.curveAcc = U.lerp(game.prevCurveAcc, game.curveAcc, alpha);
    st.playerY = heightAt(st.position + cfg.PLAYER_DIST);
    st.cameraX = U.lerp(game.prevCamX, game.camX, alpha);
    st.time = game.time;
    st.playerRect = player.screenRect(R.getRig(), alpha, st.cameraX, playerRect);
    R.render(ctx, view, st);
    items.drawEffects(ctx, view, R.getRig(), playerRect);
    ui.updateHud(Math.round(player.speed / cfg.MAX_SPEED * cfg.KMH_AT_MAX), items.hud());
  };

  game.resize = function (view) {
    R.resize(view);
    player.resize(view, R.getRig());
  };

  game.info = function () {
    var s = track.findSegment(game.position + cfg.PLAYER_DIST);
    return {
      segment: s.index, segments: track.segments.length,
      curve: s.curve, height: Math.round(heightAt(game.position + cfg.PLAYER_DIST)),
      zone: s.zone, quality: R.getQuality(),
      x: player.x, speed: player.speed, surface: player.surface,
      state: game.state, lap: race.lap, halfway: race.halfway
    };
  };

  game.toMenu();
})(window.AutoRally = window.AutoRally || {});
