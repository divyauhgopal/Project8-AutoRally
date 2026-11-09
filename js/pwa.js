/* Auto Rally – installable app (PWA): service worker, safe updates, Install button.
 *
 * - Registers sw.js (only on http/https – opening index.html from disk still works,
 *   just without the offline cache).
 * - Update: when a new version has downloaded, "New version available" is shown on
 *   the MAIN MENU only – never during a countdown, race, pause or results – and the
 *   game reloads only when the player presses Update. Saved data is untouched.
 * - Install: the Install button appears only when the browser offers installation
 *   (beforeinstallprompt), and never when already running as the installed app.
 */
(function (AR) {
  'use strict';

  var ui = AR.ui;
  function noop() {}

  var pwa = AR.pwa = {
    supported: 'serviceWorker' in navigator && /^https?:$/.test(window.location.protocol),
    registration: null,
    waiting: null,            // a downloaded update waiting to be applied
    accepted: false,          // player pressed Update
    dismissed: false,         // player pressed Later (asked again next launch)
    canInstall: false
  };

  /* ---------- Install button ---------- */

  var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator.standalone === true;
  var deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();                       // use our own button instead of the browser's mini-bar
    if (standalone) return;
    deferredPrompt = e;
    pwa.canInstall = true;
    ui.showInstall(true);
  });
  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    pwa.canInstall = false;
    ui.showInstall(false);
  });
  ui.on('install', function () {
    var prompt = deferredPrompt;
    deferredPrompt = null;                    // a prompt can only be used once
    pwa.canInstall = false;
    ui.showInstall(false);
    if (!prompt) return;
    try {
      prompt.prompt();
      if (prompt.userChoice && prompt.userChoice.catch) prompt.userChoice.catch(noop);
    } catch (e) { /* browser refused – nothing else to do */ }
  });

  if (!pwa.supported) return;

  /* ---------- Updates ---------- */

  function safeToShow() { return document.body.classList.contains('state-menu'); }
  function refreshNotice() {
    ui.showUpdate(!!pwa.waiting && !pwa.accepted && !pwa.dismissed && safeToShow());
  }
  setInterval(refreshNotice, 1000);           // follows the player between menu and race

  function setWaiting(worker) {
    pwa.waiting = worker;
    refreshNotice();
  }

  var reloading = false;
  function reloadOnce() {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  }

  ui.on('update', function () {
    if (!pwa.waiting || !safeToShow()) return;
    pwa.accepted = true;
    refreshNotice();
    pwa.waiting.postMessage({ type: 'SKIP_WAITING' });
    setTimeout(reloadOnce, 4000);             // fallback if controllerchange never arrives
  });
  ui.on('updateLater', function () {
    pwa.dismissed = true;
    refreshNotice();
  });

  navigator.serviceWorker.addEventListener('controllerchange', function () {
    // The very first install also changes the controller – only reload for an accepted update.
    if (pwa.accepted) reloadOnce();
  });

  function register() {
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      pwa.registration = reg;
      if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
      reg.addEventListener('updatefound', function () {
        var worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', function () {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) setWaiting(worker);
        });
      });
      // Look for a new version when the player returns to the game, and every 30 minutes.
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) reg.update().catch(noop);
      });
      setInterval(function () { reg.update().catch(noop); }, 30 * 60 * 1000);
    }).catch(noop);                            // no service worker = game still works online
  }

  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register);
})(window.AutoRally = window.AutoRally || {});
