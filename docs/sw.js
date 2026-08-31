/*
  Sail la Vie — service worker
  Strategy:
    - index.html AND all of our own JS (i18n.js, history-maps.js, etc.):
      network-first with a cache fallback. This means "online → always get
      the latest push, no extra steps"; "offline → falls back to whatever
      was last successfully cached, so the app still opens with zero
      connection." (Previously our own JS was cache-first — see the bottom
      of this file for why that silently broke every JS-only deploy.)
    - Third-party libraries (Leaflet, jsPDF, html2canvas, fonts): cache-first
      once fetched, since they're version-pinned URLs and genuinely won't
      change under us — no need to hit the network for these every time.
  All of the user's actual logbook data lives in IndexedDB/localStorage,
  which the browser keeps regardless of the service worker — this file only
  caches the *code*, not the trip data.

  Bump CACHE_NAME on any release where you want to force a clean cache
  (e.g. if a stale entry ever gets stuck) — it's no longer required for
  ordinary updates to show up, since those are now network-first.

  --- Why JS updates used to go missing ---
  A browser only checks for a new service worker by byte-comparing THIS FILE
  against the one it already has installed. Editing history-maps.js or
  i18n.js alone never touches this file, so the browser never even knew to
  look for an update — the old cache-first JS just kept being served
  indefinitely, regardless of how many times you pushed, hard-refreshed, or
  cleared the browser's own cache. Switching those files to network-first
  (below) removes the dependency on that detection mechanism entirely.
*/
const CACHE_NAME = 'sail-la-vie-shell-v6';

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

  if (isSameOrigin) {
    // Network-first for everything we own — the HTML shell and our own JS —
    // so a push is live on the very next load while online, with the cached
    // copy only used as an offline fallback.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || (isHtml ? caches.match('./index.html') : undefined)))
    );
    return;
  }

  // Cache-first for third-party CDN libraries (Leaflet, jsPDF, html2canvas,
  // Google Fonts) — cross-origin, version-pinned URLs that won't change.
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

// Tapping the "Trip Recording" notification (see showRecordingNotification()
// in journey.js) should bring the app forward rather than just dismissing
// the notification and doing nothing.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});
