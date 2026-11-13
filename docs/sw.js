/*
  NimoSail — service worker
  Strategy:
    - index.html AND all of our own JS (i18n.js, history-maps.js, etc.):
      network-first with a cache fallback. This means "online → always get
      the latest push, no extra steps"; "offline → falls back to whatever
      was last successfully cached, so the app still opens with zero
      connection." (Previously our own JS was cache-first — see "Why JS updates
      used to go missing" below for why that silently broke every JS-only deploy.)
    - Third-party libraries (Mapbox GL JS, jsPDF, html2canvas, fonts): cache-first
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

  --- Why Supabase reads used to go stale forever ---
  The cache-first branch below was written for pinned third-party CDN
  library URLs (Mapbox GL JS, jsPDF, etc.) — but it matched on "any cross-origin
  GET request", and Supabase's API is cross-origin too. The very first
  successful boats/crew/profile fetch got cached, and every identical
  request after that (which is all of them, since the URL and query never
  change) replayed that same first response forever — invisible to and
  unfixable from any fetch-header or WebView cache-setting change, since the
  service worker intercepts the request before either of those layers ever
  sees it. Supabase (and any other live API traffic) is now explicitly
  excluded from caching entirely, further down.
*/
const CACHE_NAME = 'nimosail-shell-v84';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './images/icon-192.png',
  './images/icon-512.png',
  './images/icon-512-maskable.png',
  './images/Logo.png',
  './js/vendor-supabase.js',
  './js/error-report.js',
  './js/i18n.js',
  './js/auth.js',
  './js/storage.js',
  './js/photo-store.js',
  './js/state-core.js',
  './js/journey.js',
  './js/history-maps.js',
  './js/map-wind.js',
  './js/track-icons.js',
  './js/everywhere-map.js',
  './js/sail-weather.js',
  './js/boats-crew.js',
  './js/noticeboard.js',
  './js/notifications.js',
  './js/push.js',
  './js/profile-settings.js',
  './js/friends.js',
  './js/helpers.js',
  './js/photo-viewer.js',
  './js/certificate.js',
  './js/trip-pdf.js',
  './js/units.js',
  './js/about.js',
  './js/share.js',
  './js/crew-friends.js',
  './js/gpx-import.js',
  './js/reel.js',
  './js/vendor-mp4-muxer.js'
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
        // Only remove THIS app's old caches. Other apps on petejackson141.github.io
        // (Interval Studio, Master GMDSS...) share the same cache storage, so
        // deleting every other name would wipe their offline copies too.
        names.filter((n) => n !== CACHE_NAME && (n.startsWith('nimosail-shell-') || n.startsWith('sail-la-vie-shell-')))
             .map((n) => caches.delete(n))
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

  // Live API traffic (Supabase) must never be served from the service
  // worker's cache, and must never be written into it either — it's
  // per-user, constantly-changing data, not a static asset. This has to be
  // checked before the same-origin/cross-origin split below, since Supabase
  // requests are cross-origin and would otherwise fall into the cache-first
  // branch meant only for pinned third-party library URLs.
  // Open-Meteo (weather at Cast Off + the sail's weather report) is live data
  // too — a cached answer would be wrong or stuck, so it's never cached either.
  const isSupabase = url.hostname.endsWith('.supabase.co');
  // GitHub's API answers the in-app "Update available" check (js/about.js) —
  // a cached answer would hide new releases forever, so it's never cached.
  // Mapbox map data (styles, map tiles, fonts, icons) is fetched fresh by the map
  // itself — caching it here would bloat the phone's storage and Mapbox's terms
  // don't allow it. Only the version-pinned Mapbox library files (/mapbox-gl-js/)
  // fall through to the normal cache-first rule for third-party libraries.
  const isMapboxData = url.hostname.endsWith('mapbox.com') && !url.pathname.startsWith('/mapbox-gl-js/');
  // OpenStreetMap's place lookup (auto place names, js/journey.js) is a live answer
  // for one position — caching it would hand every sail the first sail's place.
  const isPlaceLookup = url.hostname === 'nominatim.openstreetmap.org';
  const isLiveApi = isSupabase || isMapboxData || isPlaceLookup || url.hostname.endsWith('open-meteo.com') || url.hostname === 'api.github.com';
  if (isLiveApi) {
    event.respondWith(fetch(req));
    return;
  }

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

  // Cache-first for third-party CDN libraries (Mapbox GL JS, jsPDF, html2canvas,
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

// ---------- Web push (iPhone / browser version, 07.11.2026) ----------
// send-push (Supabase) sends {title, body, data:{type, ...}}. The app may not
// be running at all, so the service worker shows the notification itself.
// Every push MUST show a notification: Apple and Chrome cancel the
// subscription of a site that receives pushes without showing anything.
self.addEventListener('push', (event) => {
  let p = {};
  try { p = event.data ? event.data.json() : {}; }
  catch (e) { p = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(p.title || 'NimoSail', {
    body: p.body || '',
    icon: './images/icon-192.png',
    data: p.data || {}
  }));
});

// Tapping a notification brings the app forward rather than just dismissing
// it. Two kinds of notification end up here:
//   - the "Trip Recording" one (showRecordingNotification() in journey.js):
//     no data.type, so the app just comes to the front;
//   - a web push (above): data.type says which screen to open. An app that's
//     already open gets a message (push.js listens for it); a closed app is
//     opened with ?push=<type> in the address (push.js, handlePushLaunch).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if (data.type) client.postMessage({ pushTap: data });
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(data.type ? './?push=' + encodeURIComponent(data.type) : './');
    })
  );
});
