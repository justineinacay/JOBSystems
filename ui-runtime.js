(function(){
  const container = document.getElementById('jelix-container');
  const tilt       = document.getElementById('jelix-tilt');
  const face       = document.getElementById('jelix-face');
  const bubble     = document.getElementById('jelix-bubble');
  const led        = document.getElementById('jelix-led');
  if(!container) return;
  // Declared here (not further down where it used to live) — evaluateState()
  // below references drawerOpen synchronously before that later line ever
  // ran, which threw a TDZ ReferenceError on every load and silently killed
  // all the click/right-click listener setup that follows it in this IIFE.
  let drawerOpen = false;

  // =================================================================
  // 1. MOUSE TRACKING — head-tilt substitute for eye tracking
  // =================================================================
  let targetRot = 0, targetTx = 0, targetTy = 0;
  let curRot = 0, curTx = 0, curTy = 0;
  const ROT_LIMIT = 6, SHIFT_LIMIT = 4, EASE = 0.06;

  document.addEventListener('mousemove', (e) => {
    const rect = container.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    targetRot = (dx / dist) * ROT_LIMIT;
    targetTx  = (dx / dist) * SHIFT_LIMIT;
    targetTy  = (dy / dist) * SHIFT_LIMIT;
  });
  function animateTilt(){
    curRot += (targetRot - curRot) * EASE;
    curTx  += (targetTx  - curTx)  * EASE;
    curTy  += (targetTy  - curTy)  * EASE;
    tilt.style.transform = `translate(${curTx.toFixed(2)}px, ${curTy.toFixed(2)}px) rotate(${curRot.toFixed(2)}deg)`;
    requestAnimationFrame(animateTilt);
  }
  requestAnimationFrame(animateTilt);

  // =================================================================
  // 2. BLINK SUBSTITUTE
  // =================================================================
  function scheduleBlink(){
    const nextBlinkIn = 6000 + Math.random() * 8000;
    setTimeout(() => { blinkOnce(); scheduleBlink(); }, nextBlinkIn);
  }
  function blinkOnce(){
    face.classList.add('blinking');
    face.addEventListener('animationend', () => face.classList.remove('blinking'), { once: true });
  }
  window.jelixForceBlink = blinkOnce;
  scheduleBlink();

  // =================================================================
  // 3. DIALOGUE BUBBLE
  // =================================================================
  let bubbleHideTimer = null;
  function say(text, holdMs = 6000){
    if(drawerOpen) return; // don't talk over an open conversation
    bubble.textContent = text;
    bubble.classList.add('visible');
    clearTimeout(bubbleHideTimer);
    bubbleHideTimer = setTimeout(() => bubble.classList.remove('visible'), holdMs);
  }

  // =================================================================
  // 4. STATE MACHINE — wired to real task + cashflow data
  //    sleepy > concerned > chatting > thinking > default, priority order
  // =================================================================
  const SUPPORTIVE_LINES = [
    "Noted, sir. I'll keep watch \u2014 you focus on the next thing.",
    "One step at a time. I've got the rest in view.",
    "You're doing fine, sir. Say the word if you need a hand.",
    "Steady pace beats a rushed one. I'll be right here."
  ];
  const SLEEPY_LINE = "It is past midnight, sir. Adequate rest is essential for optimal cognitive function.";
  const CONCERNED_LINE = "I notice a spike in urgent tasks, sir. Shall we tackle one, or do you need a moment first?";

  let currentState = null;
  let lastNudge = {urgent:0, overdue:0, cashMonth:''};

  function getUrgentCount(){
    try{ return (DB.tasks||[]).filter(t=>t.status!=='Done' && t.priority==='High').length; }catch(e){ return 0; }
  }
  function getOverdueCount(){
    try{
      const today = localDateStr(new Date());
      return (DB.tasks||[]).filter(t=>t.status!=='Done' && t.due && t.due<today).length;
    }catch(e){ return 0; }
  }
  function getMonthNet(){
    try{
      const monthKey = localDateStr(new Date()).slice(0,7);
      const txns = (DB.cashflow||[]).filter(t=>(t.date||'').startsWith(monthKey));
      const credit = txns.filter(t=>t.type==='Credit').reduce((s,t)=>s+(t.amount||0),0);
      const debit  = txns.filter(t=>t.type==='Debit').reduce((s,t)=>s+(t.amount||0),0);
      return {net: debit - credit, monthKey}; // Debit=income, Credit=expense per app convention
    }catch(e){ return {net:0, monthKey:''}; }
  }
  function isLateNight(){
    const hour = new Date().getHours();
    return hour >= 0 && hour < 6;
  }
  function isHighWorkload(){
    return getUrgentCount() >= 5 || getOverdueCount() >= 1;
  }
  function evaluateState(){
    if (drawerOpen)             applyState('chatting');
    else if (isThinkingPolled)  applyState('thinking');
    else if (isLateNight())     applyState('sleepy');
    else if (isHighWorkload())  applyState('concerned');
    else                        applyState('default');
  }
  function applyState(state){
    const changed = state !== currentState;
    currentState = state;
    container.classList.remove('state-default','state-concerned','state-sleepy','state-chatting','state-thinking');
    container.classList.add('state-' + state);
    if (changed){
      if (state === 'sleepy')    say(SLEEPY_LINE, 8000);
      if (state === 'concerned') say(CONCERNED_LINE, 8000);
    }
  }
  window.jelixSetState = function(state){ currentState = null; applyState(state); };

  // ---- poll isThinking (global var set by sendAI) for the Thinking/Processing state ----
  let isThinkingPolled = false;
  setInterval(()=>{
    try{ isThinkingPolled = !!isThinking; }catch(e){ isThinkingPolled = false; }
    evaluateState();
  }, 400);

  evaluateState();
  setInterval(evaluateState, 60 * 1000);

  // ---- context-aware proactive nudges: high-priority tasks, overdue, cashflow milestone ----
  function checkNudges(){
    if (drawerOpen || bubble.classList.contains('visible')) return;
    const urgent = getUrgentCount();
    const overdue = getOverdueCount();
    const {net, monthKey} = getMonthNet();
    if (urgent >= 4 && urgent !== lastNudge.urgent){
      lastNudge.urgent = urgent;
      say(`You have ${urgent} high-priority tasks pending, sir.`, 7000);
      return;
    }
    if (overdue >= 1 && overdue !== lastNudge.overdue){
      lastNudge.overdue = overdue;
      say(`${overdue} task${overdue>1?'s are':' is'} overdue. Want me to pull them up?`, 7000);
      return;
    }
    if (net > 0 && monthKey !== lastNudge.cashMonth){
      lastNudge.cashMonth = monthKey;
      say('Cash flow is positive this month, sir. Good pace.', 7000);
    }
  }
  setInterval(checkNudges, 90 * 1000);
  setTimeout(checkNudges, 8000);

  // =================================================================
  // 5. CLICK — open the chat drawer (Active/Chatting state)
  // =================================================================
  let suppressClick = false;
  container.addEventListener('click', () => {
    if (suppressClick) { suppressClick = false; return; }
    container.classList.remove('jelix-pulse');
    void container.offsetWidth;
    container.classList.add('jelix-pulse');
    openJelixDrawer();
  });

  // =================================================================
  // 6. RIGHT-CLICK — quick-action popover
  // =================================================================
  const qmenu = document.getElementById('jelix-quickmenu');
  container.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    suppressClick = true; // avoid the click firing right after contextmenu on some browsers
    qmenu.style.display = 'block';
    const menuW = qmenu.offsetWidth || 180, menuH = qmenu.offsetHeight || 160;
    let left = e.clientX, top = e.clientY;
    if (left + menuW > window.innerWidth)  left = window.innerWidth - menuW - 10;
    if (top + menuH > window.innerHeight)  top = window.innerHeight - menuH - 10;
    qmenu.style.left = left + 'px';
    qmenu.style.top = top + 'px';
    const closeOnce = (ev) => { if(!qmenu.contains(ev.target)) qmenu.style.display='none'; };
    document.addEventListener('click', closeOnce, { once: true });
  });
  window.jelixQuickAction = function(kind){
    qmenu.style.display = 'none';
    if (kind === 'task'){ try{ openModal('taskModal'); }catch(e){} }
    else if (kind === 'expense'){ try{ openCashModal('Debit'); }catch(e){} }
    else if (kind === 'ask'){ openJelixDrawer(); }
    else if (kind === 'cmd'){ try{ openCmd(); }catch(e){} }
    else if (kind === 'fly'){ jelixFly(); }
    else if (kind === 'play'){ jelixPlay(); }
    else if (kind === 'hide'){ jelixHide(); }
  };

  // =================================================================
  // 6b. FLY / PLAY / HIDE — playful, dashboard-scoped extras. None of
  //    these touch app data; they're purely cosmetic states on top of
  //    the existing idle float / tilt / state-machine behavior.
  // =================================================================
  const hiddenTab = document.getElementById('jelix-hidden-tab');
  let flying = false, playing = false;

  function jelixFly(){
    if (flying || playing || drawerOpen) return;
    flying = true;
    const cs = getComputedStyle(container);
    const origRight = cs.right, origBottom = cs.bottom;
    const w = container.offsetWidth, h = container.offsetHeight;
    const pad = 16;
    const maxLeft = Math.max(pad, window.innerWidth - w - pad);
    const maxTop = Math.max(pad, window.innerHeight - h - pad);
    // Switch from bottom/right anchoring to left/top so it can roam freely
    container.style.left = (window.innerWidth - w - parseFloat(origRight)) + 'px';
    container.style.top = (window.innerHeight - h - parseFloat(origBottom)) + 'px';
    container.style.right = 'auto';
    container.style.bottom = 'auto';
    container.classList.add('jelix-flying');
    void container.offsetWidth; // force reflow so the next style change transitions
    let stops = 0;
    const maxStops = 4;
    (function nextStop(){
      stops++;
      container.style.left = (pad + Math.random() * (maxLeft - pad)) + 'px';
      container.style.top  = (pad + Math.random() * (maxTop - pad)) + 'px';
      if (stops < maxStops){
        setTimeout(nextStop, 1300);
      } else {
        setTimeout(() => {
          container.style.left = '';
          container.style.top = '';
          container.style.right = origRight;
          container.style.bottom = origBottom;
          setTimeout(() => { container.classList.remove('jelix-flying'); flying = false; }, 1200);
        }, 1300);
      }
    })();
  }

  function jelixPlay(){
    if (playing || flying || drawerOpen) return;
    playing = true;
    container.classList.add('jelix-playing');
    if (bubble){
      const lines = ['Wheee! \u2728','Playtime!','Bzzt~ having fun!'];
      bubble.textContent = lines[Math.floor(Math.random()*lines.length)];
      bubble.classList.add('visible');
    }
    setTimeout(() => {
      container.classList.remove('jelix-playing');
      if (bubble) bubble.classList.remove('visible');
      playing = false;
    }, 4000);
  }

  function jelixHide(){
    container.classList.add('jelix-hidden');
    if (hiddenTab) hiddenTab.classList.add('visible');
    try{ localStorage.setItem('j-jelix-hidden','1'); }catch(e){}
  }
  function jelixShow(){
    container.classList.remove('jelix-hidden');
    if (hiddenTab) hiddenTab.classList.remove('visible');
    try{ localStorage.removeItem('j-jelix-hidden'); }catch(e){}
  }
  if (hiddenTab) hiddenTab.addEventListener('click', jelixShow);
  try{ if (localStorage.getItem('j-jelix-hidden') === '1') jelixHide(); }catch(e){}

  // =================================================================
  // 7. SLIDE-OUT DRAWER — reparents the real J.E.L.I.X. chat panel
  //    (#view-ai .ai-layout) into the drawer, then back on close.
  //    This keeps a single source of truth: no duplicated chat logic,
  //    memory badge, dictation, export/clear all keep working as-is.
  // =================================================================
  const drawerEl = document.getElementById('jelix-drawer');
  const backdropEl = document.getElementById('jelix-drawer-backdrop');
  const drawerBody = document.getElementById('jelix-drawer-body');
  const drawerStatus = document.getElementById('jelix-drawer-status');
  let chatHomeParent = null; // where .ai-layout normally lives, so we can restore it

  window.openJelixDrawer = function(){
    if (drawerOpen) return;
    const layout = document.querySelector('#view-ai .ai-layout');
    if (layout){
      chatHomeParent = layout.parentNode;
      drawerBody.appendChild(layout);
      layout.style.height = '100%';
      layout.style.width = '100%';
    }
    drawerOpen = true;
    drawerEl.classList.add('open');
    backdropEl.classList.add('open');
    container.classList.add('jelix-drawer-open');
    bubble.classList.remove('visible');
    if (drawerStatus) drawerStatus.textContent = 'Executive Intelligence Partner';
    evaluateState();
    setTimeout(()=>{ try{ document.getElementById('aiInput')?.focus(); }catch(e){} }, 400);
    try{ if(typeof renderAiHero==='function') renderAiHero(); }catch(e){}
  };
  window.closeJelixDrawer = function(){
    if (!drawerOpen) return;
    drawerOpen = false;
    drawerEl.classList.remove('open');
    backdropEl.classList.remove('open');
    container.classList.remove('jelix-drawer-open');
    const layout = drawerBody.querySelector('.ai-layout');
    if (layout && chatHomeParent){
      chatHomeParent.appendChild(layout);
    }
    evaluateState();
  };

  // If the user navigates the app elsewhere while the drawer is open,
  // close it first so the chat panel returns to its normal home.
  if (typeof window.setView === 'function' && !window._jelixSetViewWrapped){
    const _origSetView = window.setView;
    window.setView = function(v){
      if (drawerOpen) closeJelixDrawer();
      return _origSetView.apply(this, arguments);
    };
    window._jelixSetViewWrapped = true;
  }

  document.addEventListener('keydown', (e)=>{
    if (e.key === 'Escape' && drawerOpen) closeJelixDrawer();
  });

})();
