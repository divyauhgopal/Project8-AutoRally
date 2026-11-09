/* Auto Rally – HUD and screens (HTML overlays above the canvas).
 *
 * Screens: menu, countdown, pause, results (+ "FINISH!" banner and lap toasts).
 * HUD: lap, current lap time, total time, speed, pause button.
 * The UI never changes game state itself – buttons call handlers registered
 * by game.js via ui.on(name, fn).
 */
(function (AR) {
  'use strict';

  var race = AR.race;
  var hud = document.getElementById('hud');
  var screens = document.getElementById('screens');

  var PAUSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>';

  var BOLT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2 5 13.5h5.5L9 22l9-12h-5.6z"/></svg>';
  var SHIELD_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z"/></svg>';
  var PLAY_ICON = '<svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.2v13.6c0 .8.9 1.3 1.6.8l10-6.8c.6-.4.6-1.2 0-1.6l-10-6.8C8.9 3.9 8 4.4 8 5.2z"/></svg>';
  var INSTALL_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 3h2v9.2l3.3-3.3 1.4 1.4L12 16l-5.7-5.7 1.4-1.4 3.3 3.3zM5 18h14v2H5z"/></svg>';
  var TROPHY_ICON = '<svg class="trophy" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v2h3v2c0 2.8-2 5-4.6 5.4A5 5 0 0 1 13 14.9V17h3v3H8v-3h3v-2.1a5 5 0 0 1-2.4-2.5C6 12 4 9.8 4 7V5h3zm-1 4c0 1.4.8 2.6 2 3.1V7zm12 0v3.1c1.2-.5 2-1.7 2-3.1z"/></svg>';

  hud.innerHTML =
    '<div class="hud-col hud-left">' +
      '<div class="hud-card hud-lap"><span class="hud-label">LAP</span>' +
        '<span class="hud-value" id="hud-lap">1/3</span>' +
        '<span class="hud-sub" id="hud-laptime">0:00.00</span></div>' +
      '<div class="hud-card hud-coins" aria-label="Coins"><i class="coin-icon"></i><span id="hud-coins">0</span></div>' +
    '</div>' +
    '<div class="hud-col hud-center">' +
      '<div class="hud-card hud-time"><span class="hud-label">TIME</span>' +
        '<span class="hud-value" id="hud-time">0:00.00</span>' +
        '<span class="hud-sub hud-speed"><span id="hud-speed">0</span> km/h</span></div>' +
      '<div class="pw pw-turbo" id="pw-turbo" hidden>' + BOLT_ICON + '<b>TURBO</b><span id="pw-turbo-t"></span><i><u id="pw-turbo-bar"></u></i></div>' +
      '<div class="pw pw-shield" id="pw-shield" hidden>' + SHIELD_ICON + '<b>SHIELD</b><span id="pw-shield-t"></span><i><u id="pw-shield-bar"></u></i></div>' +
    '</div>' +
    '<button class="hud-pause" id="hud-pause" type="button" aria-label="Pause">' + PAUSE_ICON + '</button>';

  screens.innerHTML =
    // Main menu
    '<section class="screen screen-menu" id="screen-menu" hidden>' +
      '<div class="menu-card">' +
        '<h1 class="title"><span class="title-auto">AUTO</span><span class="title-rally">RALLY</span></h1>' +
        '<div class="title-strip" aria-hidden="true"></div>' +
        '<p class="tagline">Race your auto-rickshaw through the streets and fields of Rallypur!</p>' +
        '<button class="btn btn-primary btn-big btn-start" id="btn-start" type="button">' + PLAY_ICON + '<span>Start Race</span></button>' +
        '<ul class="features" aria-label="How to play">' +
          '<li><b>3</b> laps</li>' +
          '<li><i class="coin-icon"></i>Coins</li>' +
          '<li class="f-turbo">' + BOLT_ICON + 'Turbo</li>' +
          '<li class="f-shield">' + SHIELD_ICON + 'Shield</li>' +
          '<li class="f-avoid">Dodge cows &amp; potholes</li>' +
        '</ul>' +
        '<p class="hint hint-keys"><kbd>←</kbd><kbd>→</kbd> steer <kbd>↑</kbd> go <kbd>↓</kbd> brake <kbd>P</kbd> pause <kbd>M</kbd> sound</p>' +
        '<p class="hint hint-touch"><kbd>◀</kbd><kbd>▶</kbd> steer · <kbd>BRAKE</kbd> slow down · auto-accelerates</p>' +
        '<div class="update-note" id="update-note" hidden role="status">' +
          '<span>Update available</span>' +
          '<button class="btn btn-primary btn-small" id="btn-update" type="button">Update</button>' +
          '<button class="link-btn" id="btn-update-later" type="button">Later</button>' +
        '</div>' +
        '<div class="best-box">' +
          '<p class="best-line" id="menu-best"></p>' +
          '<div class="menu-links">' +
            '<button class="link-btn" id="btn-reset-best" type="button" hidden>Reset best time</button>' +
            '<button class="install-btn" id="btn-install" type="button" hidden>' + INSTALL_ICON + 'Install app</button>' +
          '</div>' +
        '</div>' +
        '<p class="storage-note" id="storage-note" hidden>Best times can’t be saved in this browser mode – they last until you close the page.</p>' +
      '</div>' +
    '</section>' +
    // Reset confirmation
    '<section class="screen screen-confirm" id="screen-confirm" hidden role="dialog" aria-modal="true" aria-labelledby="confirm-title">' +
      '<div class="menu-card small">' +
        '<h2 class="screen-title small" id="confirm-title">Reset best time?</h2>' +
        '<p class="confirm-text">Your record <b id="confirm-best"></b> will be deleted. This can’t be undone.</p>' +
        '<div class="btn-row">' +
          '<button class="btn" id="btn-confirm-cancel" type="button">Cancel</button>' +
          '<button class="btn btn-danger" id="btn-confirm-reset" type="button">Reset</button>' +
        '</div>' +
      '</div>' +
    '</section>' +
    // Countdown
    '<div class="countdown" id="countdown" aria-live="assertive"></div>' +
    // Lap toast / finish banner
    '<div class="toast" id="toast" aria-live="polite"></div>' +
    // Pause
    '<section class="screen screen-pause" id="screen-pause" hidden>' +
      '<div class="menu-card small">' +
        '<h2 class="screen-title">PAUSED</h2>' +
        '<p class="pause-info" id="pause-info"></p>' +
        '<button class="btn btn-primary" id="btn-resume" type="button">Resume</button>' +
        '<button class="btn" id="btn-restart" type="button">Restart Race</button>' +
        '<button class="btn" id="btn-pause-menu" type="button">Main Menu</button>' +
        '<p class="hint hint-keys">Press <kbd>P</kbd> or <kbd>Esc</kbd> to resume</p>' +
      '</div>' +
    '</section>' +
    // Results
    '<section class="screen screen-results" id="screen-results" hidden>' +
      '<div class="menu-card results-card" id="results-card">' +
        '<div class="res-main">' +
          '<h2 class="screen-title finish">FINISH!</h2>' +
          '<p class="result-label">Total time</p>' +
          '<p class="result-time" id="result-time">0:00.00</p>' +
          '<p class="new-best" id="new-best" hidden>NEW BEST TIME!</p>' +
          '<p class="best-compare" id="best-compare"></p>' +
        '</div>' +
        '<div class="res-side">' +
          '<ol class="lap-list" id="lap-list"></ol>' +
          '<p class="result-coins"><i class="coin-icon"></i><b id="result-coins">0</b> coins collected</p>' +
          '<div class="btn-row">' +
            '<button class="btn btn-primary" id="btn-again" type="button">Race Again</button>' +
            '<button class="btn" id="btn-results-menu" type="button">Main Menu</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</section>';

  // Sound on/off – one button, visible on every screen (outside the HUD and screens).
  var SOUND_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="spk" d="M4 9v6h4l5 4V5L8 9z"/>' +
    '<path class="wave" d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke-width="2" stroke-linecap="round"/></svg>';
  var SOUND_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="spk" d="M4 9v6h4l5 4V5L8 9z"/>' +
    '<path class="cross" d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke-width="2.2" stroke-linecap="round"/></svg>';
  var muteBtn = document.createElement('button');
  muteBtn.className = 'mute-btn';
  muteBtn.id = 'btn-mute';
  muteBtn.type = 'button';
  document.getElementById('ui').appendChild(muteBtn);

  function $(id) { return document.getElementById(id); }

  var el = {
    lap: $('hud-lap'), lapTime: $('hud-laptime'), time: $('hud-time'), speed: $('hud-speed'),
    menu: $('screen-menu'), pause: $('screen-pause'), results: $('screen-results'),
    countdown: $('countdown'), toast: $('toast'),
    resultTime: $('result-time'), lapList: $('lap-list'), resultCoins: $('result-coins'),
    resultsCard: $('results-card'), newBest: $('new-best'), bestCompare: $('best-compare'),
    menuBest: $('menu-best'), resetBest: $('btn-reset-best'), storageNote: $('storage-note'),
    confirm: $('screen-confirm'), confirmBest: $('confirm-best'),
    coins: $('hud-coins'),
    turbo: $('pw-turbo'), turboT: $('pw-turbo-t'), turboBar: $('pw-turbo-bar'),
    shield: $('pw-shield'), shieldT: $('pw-shield-t'), shieldBar: $('pw-shield-bar')
  };

  function power(box, label, bar, remaining, total) {
    var on = remaining > 0;
    if (box.hidden === on) box.hidden = !on;
    if (!on) return;
    setText(label, remaining.toFixed(1) + 's');
    bar.style.transform = 'scaleX(' + (remaining / total).toFixed(3) + ')';
    box.classList.toggle('ending', remaining < 1.5);
  }

  /* ---------- events ---------- */

  var handlers = {};
  function emit(name) { if (handlers[name]) handlers[name](); }
  function click() { if (AR.audio) AR.audio.play('click'); }
  function bind(id, name) { $(id).addEventListener('click', function () { click(); emit(name); }); }
  bind('btn-start', 'start');
  bind('btn-resume', 'resume');
  bind('btn-restart', 'restart');
  bind('btn-pause-menu', 'menu');
  bind('btn-again', 'restart');
  bind('btn-results-menu', 'menu');
  bind('hud-pause', 'pause');
  bind('btn-update', 'update');
  bind('btn-update-later', 'updateLater');
  bind('btn-install', 'install');

  /* Reset-best confirmation dialog (handled inside the UI; only "confirmed" reaches the game). */
  function openConfirm() {
    el.confirm.hidden = false;
    focus('btn-confirm-cancel');                       // safe default
  }
  function closeConfirm() {
    if (el.confirm.hidden) return;
    el.confirm.hidden = true;
    if (!el.menu.hidden) focus(el.resetBest.hidden ? 'btn-start' : 'btn-reset-best');
  }
  $('btn-reset-best').addEventListener('click', function () { click(); openConfirm(); });
  $('btn-confirm-cancel').addEventListener('click', function () { click(); closeConfirm(); });
  $('btn-confirm-reset').addEventListener('click', function () {
    click();
    emit('resetBest');
    closeConfirm();
    focus('btn-start');
  });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !el.confirm.hidden) { e.preventDefault(); e.stopImmediatePropagation(); closeConfirm(); }
  }, true);

  muteBtn.addEventListener('click', function () { emit('mute'); });

  /* ---------- helpers ---------- */

  function show(node, on) { node.hidden = !on; }
  function focus(id) {
    var b = $(id);
    try { b.focus({ preventScroll: true }); } catch (e) { b.focus(); }
  }
  function restartAnim(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth;                  // reflow so the CSS animation plays again
    node.classList.add(cls);
  }
  function setText(node, txt) { if (node.textContent !== txt) node.textContent = txt; }

  var toastTimer = 0;

  var ui = AR.ui = {
    on: function (name, fn) { handlers[name] = fn; },

    /* body class drives which overlays are visible: state-menu, state-countdown, … */
    setState: function (state) {
      document.body.className = document.body.className.replace(/\bstate-\S+/g, '').trim();
      document.body.classList.add('state-' + state);
      show(el.menu, state === 'menu');
      show(el.pause, state === 'paused');
      show(el.results, state === 'results');
      el.confirm.hidden = true;
      if (state === 'menu') focus('btn-start');
      if (state === 'paused') {
        // Where the race stands, so the player knows what they are coming back to.
        $('pause-info').textContent = 'Lap ' + Math.min(race.lap, race.laps) + '/' + race.laps + ' · ' + race.format(race.time()) +
          (AR.items ? ' · ' + AR.items.state.coins + ' coins' : '');
        focus('btn-resume');
      }
      if (state === 'results') focus('btn-again');
      if (state === 'menu' || state === 'results') { ui.hideCountdown(); ui.hideToast(); }
    },

    countdown: function (text) {
      setText(el.countdown, text);
      el.countdown.classList.toggle('go', text === 'GO!');
      el.countdown.hidden = false;
      restartAnim(el.countdown, 'pop');
    },
    hideCountdown: function () { el.countdown.hidden = true; },

    toast: function (text, cls, ms) {
      setText(el.toast, text);
      el.toast.className = 'toast ' + (cls || '');
      el.toast.hidden = false;
      restartAnim(el.toast, 'pop');
      clearTimeout(toastTimer);
      if (ms) toastTimer = setTimeout(ui.hideToast, ms);
    },
    hideToast: function () { clearTimeout(toastTimer); el.toast.hidden = true; },

    /* it = items state: { coins, turbo, shield } (seconds remaining) */
    updateHud: function (speedKmh, it) {
      setText(el.lap, Math.min(race.lap, race.laps) + '/' + race.laps);
      setText(el.lapTime, race.format(race.finished ? race.lapTimes[race.lapTimes.length - 1] || 0 : race.currentLapTime()));
      setText(el.time, race.format(race.time()));
      setText(el.speed, String(speedKmh));
      if (it) {
        setText(el.coins, String(it.coins));
        power(el.turbo, el.turboT, el.turboBar, it.turbo, AR.config.TURBO_TIME);
        power(el.shield, el.shieldT, el.shieldBar, it.shield, AR.config.SHIELD_TIME);
      }
    },

    isDialogOpen: function () { return !el.confirm.hidden; },

    /* PWA: update notice (menu only) and Install button */
    showUpdate: function (on) {
      var n = $('update-note');
      if (n.hidden === !on) return;
      n.hidden = !on;
      document.body.classList.toggle('has-update', !!on);
    },
    showInstall: function (on) { $('btn-install').hidden = !on; },

    setMuted: function (m) {
      muteBtn.innerHTML = m ? SOUND_OFF : SOUND_ON;
      muteBtn.classList.toggle('muted', !!m);
      muteBtn.setAttribute('aria-pressed', m ? 'true' : 'false');
      muteBtn.setAttribute('aria-label', m ? 'Sound is off – turn sound on' : 'Sound is on – mute');
      muteBtn.title = m ? 'Sound off (M)' : 'Sound on (M)';
    },

    /* Menu: best = { time, … } or null; canSave = localStorage works. */
    setBest: function (best, canSave) {
      if (best) {
        el.menuBest.innerHTML = TROPHY_ICON + '<span>Best time </span><b>' + race.format(best.time) + '</b>';
        setText(el.confirmBest, race.format(best.time));
      } else {
        el.menuBest.textContent = 'No best time yet – finish a race to set one!';
      }
      el.menuBest.classList.toggle('empty', !best);
      el.resetBest.hidden = !best;
      el.storageNote.hidden = canSave !== false;
    },

    /* result = storage.submitRace() result { isNew, previous, best } */
    showResults: function (coins, result) {
      setText(el.resultCoins, String(coins || 0));
      setText(el.resultTime, race.format(race.finalTime));
      var isNew = !!(result && result.isNew);
      el.newBest.hidden = !isNew;
      el.resultsCard.classList.toggle('is-record', isNew);
      var cmp = '';
      if (result && isNew && result.previous) {
        cmp = 'Previous best ' + race.format(result.previous.time) + ' · <span class="faster">' +
          (result.previous.time - race.finalTime).toFixed(2) + ' s faster!</span>';
      } else if (result && isNew) {
        cmp = 'Your first record – can you beat it?';
      } else if (result && result.best) {
        cmp = 'Best time <b>' + race.format(result.best.time) + '</b> · ' +
          '<span class="slower">+' + (race.finalTime - result.best.time).toFixed(2) + ' s</span>';
      }
      el.bestCompare.innerHTML = cmp;
      var best = race.bestLapIndex(), html = '';
      for (var i = 0; i < race.lapTimes.length; i++) {
        html += '<li' + (i === best ? ' class="best"' : '') + '><span>Lap ' + (i + 1) + '</span><b>' +
          race.format(race.lapTimes[i]) + '</b>' + (i === best ? '<em>fastest</em>' : '') + '</li>';
      }
      el.lapList.innerHTML = html;
    }
  };

  el.countdown.hidden = true;
  el.toast.hidden = true;
})(window.AutoRally = window.AutoRally || {});
