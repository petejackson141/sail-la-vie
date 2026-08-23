/*
  Sail la Vie — service worker
  Strategy:
    - App shell (this HTML, manifest, icons): cache-first, so the app opens
      instantly and works with zero connection.
    - index.html itself: network-first with a cache fallback, so a person
      online gets the latest version, but offline still opens the last one.
    - Third-party libraries (Leaflet, jsPDF, html2canvas, fonts): cache-first
      once fetched, since they're version-pinned URLs and won't change.
  All of the user's actual logbook data lives in IndexedDB/localStorage,
  which the browser keeps regardless of the service worker — this file only
  caches the *code*, not the trip data.

  Bump CACHE_NAME whenever index.html/manifest/icons change, so old caches
  get cleared and the new shell is fetched.
*/
const CACHE_NAME = 'sail-la-vie-shell-v3';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './images/icon-192.png',
  './images/icon-512.png',
  './images/icon-512-maskable.png',
  './images/Logo.png',
  './js/i18n.js',
  './js/storage.js',
  './js/state-core.js',
  './js/journey.js',
  './js/history-maps.js',
  './js/boats-crew.js',
  './js/profile-settings.js',
  './js/pdf-export.js',
  './js/units.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isHtml = req.mode === 'navigate' || req.destination === 'document';

  if (isSameOrigin && isHtml) {
    // Network-first for the app shell HTML so updates are picked up when online.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first for everything else: local assets and pinned CDN libraries
  // (Leaflet, jsPDF, html2canvas, Google Fonts).
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
