// ═══════════════════════════════════════════════════════════════════════════
// J.E.L.I.X OS — Service Worker v1.3
// Upload to the SAME folder as index.html on GitHub Pages.
// ── HOW TO BUST THE CACHE ON NEXT DEPLOY ───────────────────────────────────
// Change CACHE_VERSION below (e.g. 'v1.3' → 'v1.4').
// On next load the old cache is deleted and everything re-fetches fresh.
// ═══════════════════════════════════════════════════════════════════════════

const CACHE_VERSION = 'v1.3';
const CACHE = 'jelix-' + CACHE_VERSION;

// Static assets to pre-cache on install (fonts, icons, chart library).
// Your app shell loads instantly even offline after the first visit.
const PRE_CACHE = [
  'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800;900&display=swap',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

// ── INSTALL ─────────────────────────────────────────────────────────────────
// Pre-cache static assets. skipWaiting() activates the new SW immediately
// without waiting for existing tabs to close.
self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(PRE_CACHE).catch(function () {
        // Pre-cache failures are non-fatal — app still works online
      });
    })
  );
});

// ── ACTIVATE ────────────────────────────────────────────────────────────────
// Delete ALL caches that are not the current version.
// This is the cache-busting step — runs every time CACHE_VERSION is bumped.
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) {
              // Delete any jelix-* cache that isn't the current version
              return key.startsWith('jelix-') && key !== CACHE;
            })
            .map(function (key) {
              console.log('[SW] Deleting old cache:', key);
              return caches.delete(key);
            })
        );
      })
      .then(function () {
        // Take control of all open tabs immediately
        return self.clients.claim();
      })
  );
});

// ── FETCH ───────────────────────────────────────────────────────────────────
self.addEventListener('fetch', function (e) {
  var u;
  try { u = new URL(e.request.url); } catch (err) { return; }

  // ── 1. NEVER CACHE: Supabase, Anthropic, weather ──────────────────────
  // These are live data endpoints — always go to the network.
  // If offline, return a clean JSON error so the app handles it gracefully.
  var isLiveAPI = (
    u.hostname.indexOf('supabase.co') > -1 ||
    u.hostname.indexOf('anthropic.com') > -1 ||
    u.hostname.indexOf('open-meteo.com') > -1
  );
  if (isLiveAPI) {
    e.respondWith(
      fetch(e.request).catch(function () {
        return new Response(
          JSON.stringify({ error: 'offline', message: 'No network connection.' }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // ── 2. CACHE-FIRST: fonts + CDN static assets ─────────────────────────
  // These rarely change. Serve from cache instantly; update in background.
  var isCDN = (
    u.hostname.indexOf('fonts.googleapis.com') > -1 ||
    u.hostname.indexOf('fonts.gstatic.com') > -1 ||
    u.hostname.indexOf('jsdelivr.net') > -1 ||
    u.hostname.indexOf('cdnjs.cloudflare.com') > -1
  );
  if (isCDN) {
    e.respondWith(
      caches.match(e.request).then(function (cached) {
        if (cached) return cached;
        return fetch(e.request).then(function (res) {
          var cl = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, cl); });
          return res;
        });
      })
    );
    return;
  }

  // ── 3. NETWORK-FIRST: the app HTML (index.html) + everything else ──────
  // Always try the network first so you get the latest version of the app.
  // Only fall back to cache if the network is unavailable (offline mode).
  e.respondWith(
    fetch(e.request)
      .then(function (res) {
        // Cache the fresh response for offline fallback
        if (res.ok) {
          var cl = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, cl); });
        }
        return res;
      })
      .catch(function () {
        // Network failed — serve from cache if available
        return caches.match(e.request).then(function (cached) {
          return cached || new Response(
            '<h1 style="font-family:sans-serif;color:#00d4c8;background:#020912;margin:0;padding:40px;min-height:100vh">J.E.L.I.X OS is offline. Please reconnect to load the app.</h1>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        });
      })
  );
});
