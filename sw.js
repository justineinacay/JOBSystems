// J.O.B Systems — Service Worker
// Strategy: Cache-first for app assets, network-first for Supabase API calls.
// Cache name is versioned — bump CACHE_VERSION on every meaningful deploy so
// old caches are automatically discarded instead of serving stale content.

const CACHE_VERSION = 'jobsystems-v1';
const APP_SHELL = [
  './',
  './index.html',
];

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
  const isNetworkFirst = NETWORK_FIRST_HOSTS.some((host) => url.hostname.includes(host));

  if (isNetworkFirst) {
    // Network-first: try live data, fall back to cache only if genuinely offline
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Cache-first for everything else (the app shell itself, fonts, icons)
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
