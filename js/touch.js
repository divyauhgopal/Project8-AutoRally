/* Auto Rally – on-screen touch controls.
 *
 *   left thumb:  steering pad  [ ◀ | ▶ ]  – one element, so the thumb can slide
 *                between left and right without lifting
 *   right thumb: BRAKE
 *
 * Pointer Events with pointer capture: each finger stays bound to the control
 * it pressed, even if it slides off, until it is lifted. pointerup,
 * pointercancel and lostpointercapture all release it.
 *
 * Controls appear automatically on touch screens (or on the first touch) and
 * hide when a keyboard driving key is pressed. Force with ?touch=1 / ?touch=0.
 */
(function (AR) {
  'use strict';

  var input = AR.input;
  var root = document.getElementById('touch-controls');

  var ARROW_L = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 3.5 5.5 12 16 20.5z"/></svg>';
  var ARROW_R = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3.5 18.5 12 8 20.5z"/></svg>';

  root.innerHTML =
    '<div class="tc-pad" role="group" aria-label="Steering">' +
      '<div class="tc-btn tc-left" aria-label="Steer left">' + ARROW_L + '</div>' +
      '<div class="tc-btn tc-right" aria-label="Steer right">' + ARROW_R + '</div>' +
    '</div>' +
    '<div class="tc-btn tc-brake" aria-label="Brake">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.3 2h7.4L21 7.3v7.4L15.7 20H8.3L3 14.7V7.3z"/></svg>' +
      '<span>BRAKE</span></div>';

  var pad = root.querySelector('.tc-pad');
  var btnL = root.querySelector('.tc-left');
  var btnR = root.querySelector('.tc-right');
  var brake = root.querySelector('.tc-brake');

  var padPointers = {};      // pointerId → 'left' | 'right'
  var brakePointers = {};    // pointerId → true

  function refresh() {
    var l = false, r = false, b = false, id;
    for (id in padPointers) { if (padPointers[id] === 'left') l = true; else r = true; }
    for (id in brakePointers) b = true;
    btnL.classList.toggle('pressed', l);
    btnR.classList.toggle('pressed', r);
    brake.classList.toggle('pressed', b);
  }

  function capture(el, e) {
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
  }

  function padSide(e) {
    var r = pad.getBoundingClientRect();
    return e.clientX < r.left + r.width / 2 ? 'left' : 'right';
  }

  /* ---------- steering pad ---------- */

  pad.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    capture(pad, e);
    var side = padSide(e);
    padPointers[e.pointerId] = side;
    input.touchSet(e.pointerId, side);
    refresh();
  });
  pad.addEventListener('pointermove', function (e) {
    if (!(e.pointerId in padPointers)) return;
    var side = padSide(e);
    if (side === padPointers[e.pointerId]) return;
    padPointers[e.pointerId] = side;
    input.touchSet(e.pointerId, side);
    refresh();
  });
  function padRelease(e) {
    if (!(e.pointerId in padPointers)) return;
    delete padPointers[e.pointerId];
    input.touchClear(e.pointerId);
    refresh();
  }

  /* ---------- brake ---------- */

  brake.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    capture(brake, e);
    brakePointers[e.pointerId] = true;
    input.touchSet(e.pointerId, 'down');
    refresh();
  });
  function brakeRelease(e) {
    if (!(e.pointerId in brakePointers)) return;
    delete brakePointers[e.pointerId];
    input.touchClear(e.pointerId);
    refresh();
  }

  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (type) {
    pad.addEventListener(type, padRelease);
    brake.addEventListener(type, brakeRelease);
  });

  // Global release (blur, app switch, rotation…) also clears the button visuals.
  input.onRelease(function () {
    padPointers = {};
    brakePointers = {};
    refresh();
  });

  /* ---------- show / hide ---------- */

  input.onModeChange(function (on) {
    root.hidden = !on;
    document.body.classList.toggle('touch-mode', on);
    if (!on) { padPointers = {}; brakePointers = {}; refresh(); }
  });

  var forced = new URLSearchParams(window.location.search).get('touch');
  if (forced === '1') input.setTouchMode(true);
  else if (forced !== '0' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
    input.setTouchMode(true);
  }

  // Any touch on the screen switches to touch mode.
  document.addEventListener('pointerdown', function (e) {
    if (forced === '0') return;
    if (e.pointerType === 'touch' || e.pointerType === 'pen') input.setTouchMode(true);
  }, true);

  /* ---------- stop the browser hijacking touches ---------- */

  function block(e) { if (e.cancelable) e.preventDefault(); }
  document.addEventListener('contextmenu', block);                     // long-press menu
  document.addEventListener('selectstart', block);                     // text selection
  document.addEventListener('dblclick', block);                        // double-tap zoom
  document.addEventListener('gesturestart', block);                    // iOS pinch-zoom
  document.addEventListener('touchmove', block, { passive: false });   // scrolling / pull-to-refresh
  root.addEventListener('touchstart', block, { passive: false });      // iOS magnifier & mouse emulation
})(window.AutoRally = window.AutoRally || {});
