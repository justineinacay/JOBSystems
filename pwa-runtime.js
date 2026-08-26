// ── J.O.B Systems Service Worker — external sw.js only ───────────────────────
// Service workers require a real same-origin HTTPS script. blob: and data:
// URLs are rejected by Chrome, Safari, and sandboxed webviews. So we only
// register when an actual /sw.js file exists at the origin (e.g. GitHub
// Pages). In previews / file:// / in-app browsers we skip silently — the
// app still works fully, just without offline caching.
(function registerSW(){
  if(!('serviceWorker' in navigator)) return;

  // Only attempt on real http/https origins (not blob:, data:, file:)
  var proto = location.protocol;
  if(proto !== 'https:' && proto !== 'http:') {
    console.log('[J.O.B Systems] SW skipped \u2014 not an http(s) origin.');
    return;
  }

  // Resolve sw.js relative to the current page path so it works in subfolders
  // e.g. https://justineinacay.github.io/JELIXOS/sw.js
  var swPath = new URL('sw.js', location.href).href;

  // Verify sw.js exists before registering — avoids the console error when
  // the file hasn't been uploaded yet.
  fetch(swPath, {method:'HEAD'})
    .then(function(res){
      if(!res.ok) throw new Error('sw.js not found');
      return navigator.serviceWorker.register(swPath);
    })
    .then(function(reg){
      console.log('[J.O.B Systems] SW registered \u2713 scope:', reg.scope);
      setInterval(function(){ reg.update(); }, 60*60*1000);
      reg.addEventListener('updatefound', function(){
        var w = reg.installing; if(!w) return;
        w.addEventListener('statechange', function(){
          if(w.state==='installed' && navigator.serviceWorker.controller){
            if(typeof showToast==='function') showToast('\u21bb J.O.B Systems update ready \u2014 reload to apply.');
          }
        });
      });
    })
    .catch(function(){
      // sw.js not present (or preview environment) — run without offline cache
      console.log('[J.O.B Systems] Offline caching unavailable (no sw.js at origin). App runs normally.');
    });
})();
