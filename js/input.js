/* Auto Rally – input.
 *
 * Keyboard and touch both feed ONE shared state object that the game reads:
 *   AR.input.state = { left, right, up, down }
 *
 * Keyboard: each physical key is tracked separately (releasing A while still
 * holding ← keeps steering left).
 * Touch:    each finger (pointerId) is tracked separately, so steering and
 * braking work together. In touch mode the auto accelerates by itself
 * ("auto-gas") – but only while the game allows it (from GO until the
 * finish); braking always overrides it.
 *
 * Everything is released when the window loses focus, the tab is hidden, the
 * page is left or the phone is rotated – controls can never stay stuck.
 */
(function (AR) {
  'use strict';

  var cfg = AR.config;

  // KeyboardEvent.code → action (layout-independent physical keys)
  var CODE_MAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down'
  };
  // Fallback for older browsers without KeyboardEvent.code
  var KEY_MAP = {
    ArrowLeft: 'left', Left: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', Right: 'right', d: 'right', D: 'right',
    ArrowUp: 'up', Up: 'up', w: 'up', W: 'up',
    ArrowDown: 'down', Down: 'down', s: 'down', S: 'down'
  };

  var state = { left: false, right: false, up: false, down: false };
  var keys = {};                       // physical key id → action
  var touches = {};                    // pointerId → action
  var touchMode = false;               // on-screen controls visible
  var gasEnabled = false;              // set by the game: true only while racing
  var autoGas = cfg.AUTO_GAS_TOUCH;
  var modeListeners = [], releaseListeners = [];

  function recompute() {
    state.left = state.right = state.up = state.down = false;
    var id;
    for (id in keys) state[keys[id]] = true;
    for (id in touches) state[touches[id]] = true;
    if (touchMode && autoGas && gasEnabled && !state.down) state.up = true;
  }

  function releaseAll() {
    keys = {};
    touches = {};
    recompute();
    for (var i = 0; i < releaseListeners.length; i++) releaseListeners[i]();
  }

  function setTouchMode(on) {
    on = !!on;
    if (on === touchMode) return;
    touchMode = on;
    if (!on) touches = {};
    recompute();
    for (var i = 0; i < modeListeners.length; i++) modeListeners[i](on);
  }

  /* ---------- keyboard ---------- */

  function keyId(e) {
    if (e.code && CODE_MAP[e.code]) return e.code;
    if (KEY_MAP[e.key]) return 'key:' + e.key.toLowerCase();
    return null;
  }
  function actionFor(id) {
    return CODE_MAP[id] || KEY_MAP[id.slice(4)];
  }

  window.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;    // leave browser shortcuts alone
    var id = keyId(e);
    if (!id) return;
    e.preventDefault();                                // stop arrows scrolling the page
    setTouchMode(false);                               // keyboard player: hide touch buttons
    keys[id] = actionFor(id);
    recompute();
  });

  window.addEventListener('keyup', function (e) {
    // On macOS, keyup events for other keys are swallowed while ⌘ is held.
    if (e.key === 'Meta') { releaseAll(); return; }
    var id = keyId(e);
    if (!id) return;
    e.preventDefault();
    delete keys[id];
    recompute();
  });

  /* ---------- stuck-control protection ---------- */

  window.addEventListener('blur', releaseAll);
  window.addEventListener('pagehide', releaseAll);
  window.addEventListener('orientationchange', releaseAll);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) releaseAll();
  });

  AR.input = {
    state: state,
    releaseAll: releaseAll,

    /* touch API used by touch.js */
    touchSet: function (pointerId, action) {
      touches[pointerId] = action;
      recompute();
    },
    touchClear: function (pointerId) {
      if (!(pointerId in touches)) return;
      delete touches[pointerId];
      recompute();
    },
    setGasEnabled: function (on) {
      gasEnabled = !!on;
      recompute();
    },
    setTouchMode: setTouchMode,
    isTouchMode: function () { return touchMode; },
    isGasActive: function () { return touchMode && autoGas && gasEnabled; },
    setAutoGas: function (on) { autoGas = !!on; recompute(); },
    onModeChange: function (fn) { modeListeners.push(fn); },
    onRelease: function (fn) { releaseListeners.push(fn); }
  };
})(window.AutoRally = window.AutoRally || {});
