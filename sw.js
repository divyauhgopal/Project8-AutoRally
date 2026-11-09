/* Auto Rally – service worker: offline play and safe updates.
 *
 * Strategy
 *   - On install, every file the game needs is downloaded into one versioned cache
 *     ("auto-rally-v1"). Requests are answered from that cache first, so the game
 *     starts and plays with no network at all.
 *   - Only the files listed in ASSETS are cached. Other requests (and anything on
 *     another origin) go straight to the network and are never stored.
 *   - Opening the game (any address in scope, with or without ?touch=1 etc.) is
 *     answered with the cached index.html.
 *
 * Updates
 *   - Deploying a new version = changing VERSION below (and the files). The browser
 *     notices the changed sw.js, installs the new cache next to the old one and then
 *     WAITS – the running game keeps using the old files, so nothing changes mid-race.
 *   - The game shows "New version available" on the main menu; pressing Update sends
 *     SKIP_WAITING, the new version takes over and the page reloads once.
 *   - Old caches are deleted on activation. localStorage (best time, settings) is
 *     never touched by the service worker.
 */
'use strict';

const VERSION = 'v1';                    // bump on every deployment that changes any file
const PREFIX = 'auto-rally-';
const CACHE = PREFIX + VERSION;

const ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'css/style.css',
  'js/config.js',
  'js/utils.js',
  'js/storage.js',
  'js/audio.js',
  'js/sprites.js',
  'js/track.js',
  'js/renderer.js',
  'js/input.js',
  'js/touch.js',
  'js/player.js',
  'js/items.js',
  'js/race.js',
  'js/ui.js',
  'js/game.js',
  'js/debug.js',
  'js/main.js',
  'js/pwa.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-192.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // cache: 'reload' skips the browser's HTTP cache so a new version never stores stale copies
      cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })))
    )
  );
  // No skipWaiting() here: an update waits until the player chooses to apply it.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())          // control the first visit straight away
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

const scopePath = new URL(self.registration.scope).pathname;

function isGamePage(url) {
  return url.pathname === scopePath || url.pathname === scopePath + 'index.html';
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;     // never handle other sites

  if (request.mode === 'navigate') {
    if (isGamePage(url)) {
      // The game page: cached copy first (works offline), network only if somehow missing.
      event.respondWith(
        caches.open(CACHE)
          .then((cache) => cache.match('index.html'))
          .then((hit) => hit || fetch(request))
      );
    } else {
      // Any other page in scope: network, falling back to the game when offline.
      event.respondWith(
        fetch(request).catch(() => caches.open(CACHE).then((cache) => cache.match('index.html')))
      );
    }
    return;
  }

  // Game files: cache first, network as a fallback (nothing new is stored).
  event.respondWith(
    caches.open(CACHE)
      .then((cache) => cache.match(request, { ignoreSearch: true }))
      .then((hit) => hit || fetch(request))
  );
});
