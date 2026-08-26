// J.O.B Systems — Service Worker
// Strategy: Network-first for the app shell (index.html) and Supabase API
// calls — always try to fetch the latest deploy, only fall back to cache if
// genuinely offline. Cache-first for static assets that don't change on
// every deploy (fonts, icons).
//
// v1 used cache-first for the app shell, which meant a fixed/updated
// index.html could sit correctly on GitHub Pages while every device kept
// silently serving an old cached copy forever, because the SW's own file
// hadn't changed and CACHE_VERSION was never bumped to force a purge. That's
// what caused an already-fixed bug (the driveLink Supabase column error) to
// keep reappearing on-device after the source was already correct.
const CACHE_VERSION = 'jobsystems-v20';
const APP_SHELL = [
  './',
  './index.html',
];
const APP_SHELL_PATHS = new Set(APP_SHELL.map((p) => new URL(p, self.location.href).href));

// Supabase requests should always try the network first — cached financial/task
// data going stale silently would be worse than a failed offline request.
const NETWORK_FIRST_HOSTS = [
  'supabase.co',
  'supabase.in',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // never cache writes

  const url = new URL(request.url);
  const isNetworkFirst =
    NETWORK_FIRST_HOSTS.some((host) => url.hostname.includes(host)) ||
    APP_SHELL_PATHS.has(request.url) ||
    request.mode === 'navigate'; // any page-load navigation gets the freshest shell

  if (isNetworkFirst) {
    // Network-first: try the live deploy, fall back to cache only if genuinely offline
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first for everything else (fonts, icons, static assets that don't
  // change on every deploy)
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        // Only cache successful, same-origin responses
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    }).catch(() => {
      // Offline and not cached — for navigations, fall back to the app shell
      if (request.mode === 'navigate') {
        return caches.match('./index.html');
      }
    })
  );
});

// Web Push — the send-due-notifications Edge Function (via pg_cron) posts a
// plain {title, body} JSON payload. This fires even when no tab is open, as
// long as the browser/OS still has this service worker registered.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  const title = data.title || 'J.O.B Systems';
  const options = {
    body: data.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { url: data.url || './' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
