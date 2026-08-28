// === JELIX AUTO-SCHEDULER ===
// Morning Intelligence: daily 10AM | Weekly Synthesis: Monday 10AM
(function(){
  function check(){
    var now=new Date(),h=now.getHours(),m=now.getMinutes(),day=now.getDay();
    var key=localDateStr(now);
    if(h===10&&m===0){
      if(!localStorage.getItem('j-brief-'+key)){
        localStorage.setItem('j-brief-'+key,'1');
        if(typeof showToast==='function')showToast('⏰ Morning Intelligence starting...');
        setTimeout(function(){if(typeof setView==='function')setView('jarvis-morning');},1500);
      }
      if(day===1&&!localStorage.getItem('j-synth-'+key)){
        localStorage.setItem('j-synth-'+key,'1');
        setTimeout(function(){if(typeof showToast==='function')showToast('Weekly Synthesis starting...');if(typeof setView==='function')setView('jarvis-weekly');},5000);
      }
    }
  }
  setInterval(check,60000);
  setTimeout(check,8000);
})();
// ── PWA Install Prompt ────────────────────────────────────────────────────
let _pwaInstallEvent = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _pwaInstallEvent = e;

  // Show install toast after 3 seconds
  setTimeout(() => {
    if(_pwaInstallEvent){
      const stack = document.getElementById('tstack');
      if(!stack) return;
      const item = document.createElement('div');
      item.className = 'titem';
      item.style.cssText = 'background:var(--navy3);border-color:var(--teal);max-width:340px;cursor:pointer';
      item.innerHTML = `
        <i class="ti ti-device-mobile" style="font-size:16px;color:var(--teal);line-height:1;display:block;flex-shrink:0"></i>
        <div style="flex:1;min-width:0">
          <div style="font-size:var(--text-sm);font-weight:700;color:var(--teal)">Install J.O.B Systems</div>
          <div style="font-size:var(--text-xs);color:var(--text3);margin-top:2px">Add to home screen for fullscreen app experience</div>
        </div>
        <button id="pwaInstallBtn" style="background:var(--teal);color:var(--navy);border:none;border-radius:8px;padding:4px 10px;font-size:var(--text-xs);font-weight:700;cursor:pointer;flex-shrink:0;white-space:nowrap">Install</button>
      `;
      item.querySelector('#pwaInstallBtn').addEventListener('click', async () => {
        if(!_pwaInstallEvent) return;
        _pwaInstallEvent.prompt();
        const { outcome } = await _pwaInstallEvent.userChoice;
        if(outcome === 'accepted'){
          showToast('✓ J.O.B Systems installed.');
          speak('J.O.B Systems installed. Welcome to the app.');
        }
        _pwaInstallEvent = null;
        item.remove();
      });
      stack.appendChild(item);
      // Auto-dismiss after 15s
      setTimeout(() => { if(item.parentNode) item.remove(); }, 15000);
    }
  }, 3000);
});

// Detect already installed
window.addEventListener('appinstalled', () => {
  _pwaInstallEvent = null;
  console.log('[J.O.B Systems] App installed successfully.');
  showToast('✓ J.O.B Systems is now installed as an app.');
});

// iOS install instruction (Safari doesn't fire beforeinstallprompt)
(function(){
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isInStandalone = window.navigator.standalone === true;
  const shownKey = 'jelix-ios-install-shown';
  if(isIOS && !isInStandalone && !localStorage.getItem(shownKey)){
    localStorage.setItem(shownKey, '1');
    setTimeout(() => {
      const stack = document.getElementById('tstack');
      if(!stack) return;
      const item = document.createElement('div');
      item.className = 'titem';
      item.style.cssText = 'background:var(--navy3);border-color:var(--teal);max-width:340px';
      item.innerHTML = `
        <i class="ti ti-brand-apple" style="font-size:16px;color:var(--teal);line-height:1;display:block;flex-shrink:0"></i>
        <div style="flex:1;min-width:0">
          <div style="font-size:var(--text-sm);font-weight:700;color:var(--teal)">Install on iPhone / iPad</div>
          <div style="font-size:var(--text-xs);color:var(--text3);margin-top:2px">Tap <strong style="color:var(--text2)">Share</strong> → <strong style="color:var(--text2)">Add to Home Screen</strong> to install J.O.B Systems</div>
        </div>
        <button onclick="this.parentNode.remove()" style="background:transparent;border:1px solid var(--border2);border-radius:8px;color:var(--text3);font-size:var(--text-xs);padding:3px 8px;cursor:pointer;flex-shrink:0">Got it</button>
      `;
      stack.appendChild(item);
      setTimeout(() => { if(item.parentNode) item.remove(); }, 20000);
    }, 4000);
  }
})();
