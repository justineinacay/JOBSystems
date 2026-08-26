// ═══════════════════════════════════════════════════════════════════════════
function _flipCapture(containerId){
  const container=document.getElementById(containerId);if(!container)return new Map();
  const positions=new Map();
  [...container.children].forEach(el=>{if(el.id)positions.set(el.id,el.getBoundingClientRect());});
  return positions;
}
function _flipPlay(containerId,oldPositions){
  const container=document.getElementById(containerId);if(!container)return;
  [...container.children].forEach(el=>{
    if(!el.id)return;
    const oldRect=oldPositions.get(el.id);if(!oldRect)return;
    const newRect=el.getBoundingClientRect();
    const dx=oldRect.left-newRect.left,dy=oldRect.top-newRect.top;
    if(Math.abs(dx)<1&&Math.abs(dy)<1)return;
    el.style.transition='none';
    el.style.transform=`translate(${dx}px,${dy}px)`;
    requestAnimationFrame(()=>{
      el.style.transition='transform 280ms cubic-bezier(.2,0,0,1)';
      el.style.transform='';
      el.addEventListener('transitionend',()=>{el.style.transition='';},{once:true});
    });
  });
}
function _wrapModuleOuterDiv(out,extraAttrs,mergeStyle,innerPrefixHtml,addResizableClass){
  // Matches the module's own outer <div class="hc" ...> regardless of what
  // attributes it already carries (a style="" attribute broke the old exact-
  // string match entirely — Timer's card has one, which is why it silently
  // never got wrapped at all). Merges rather than requires an exact string.
  const re=/^<div class="hc"([^>]*)>/;
  const m=out.match(re);
  if(!m)return out; // truly no match — leave untouched rather than corrupt the HTML
  const existingAttrs=m[1];
  const styleMatch=existingAttrs.match(/style="([^"]*)"/);
  const existingStyle=styleMatch?styleMatch[1].replace(/;?\s*$/,';'):'';
  const attrsWithoutStyle=existingAttrs.replace(/\s*style="[^"]*"/,'');
  const newTag=`<div class="hc${addResizableClass?' dm-resizable':''}"${attrsWithoutStyle} ${extraAttrs} style="${existingStyle}${mergeStyle}">`;
  // innerPrefixHtml (the shape/drag toolbar) goes INSIDE, right after the
  // opening tag — not appended after the whole closing div, which was the
  // actual bug: the toolbar was rendering as an unattached sibling, not a
  // child, even though it visually looked nested.
  return newTag+(innerPrefixHtml||'')+out.slice(m[0].length);
}
function moveDomainModule(worldId,moduleId,dir){
  const i=(DB.worlds||[]).findIndex(w=>w.id===worldId);if(i<0)return;
  let order=domainModuleOrderFor(worldId).filter(id=>domainModulesFor(worldId).includes(id));
  const pos=order.indexOf(moduleId);
  const newPos=pos+dir;
  if(pos<0||newPos<0||newPos>=order.length)return;
  [order[pos],order[newPos]]=[order[newPos],order[pos]];
  // Merge back with the full stored order (including inactive modules) to preserve their relative spots
  const fullOrder=domainModuleOrderFor(worldId);
  const activeOnly=order;
  let ai=0;
  const merged=fullOrder.map(id=>domainModulesFor(worldId).includes(id)?activeOnly[ai++]:id);
  DB.worlds[i].moduleOrder=merged;
  save('worlds');
  if(currentView===worldId){
    const before=_flipCapture('domainGenericBody');
    renderDomainGenericView(worldId);
    _flipPlay('domainGenericBody',before);
  }
}
function reorderDomainModule(worldId,targetId){
  if(!_dmDragId||_dmDragId===targetId)return;
  const i=(DB.worlds||[]).findIndex(w=>w.id===worldId);if(i<0)return;
  let order=domainModuleOrderFor(worldId);
  order=order.filter(id=>id!==_dmDragId);
  const targetIdx=order.indexOf(targetId);
  order.splice(targetIdx,0,_dmDragId);
  DB.worlds[i].moduleOrder=order;
  save('worlds');
  _dmDragId=null;
  _renderDomainModulesList(worldId);
  if(currentView===worldId){
    const before=_flipCapture('domainGenericBody');
    renderDomainGenericView(worldId);
    _flipPlay('domainGenericBody',before);
  }
}
function toggleDomainModule(worldId,moduleId,checked){
  const i=(DB.worlds||[]).findIndex(w=>w.id===worldId);if(i<0)return;
  let mods=domainModulesFor(worldId).slice();
  if(checked&&!mods.includes(moduleId))mods.push(moduleId);
  if(!checked)mods=mods.filter(m=>m!==moduleId);
  DB.worlds[i].modules=mods;
  save('worlds');
  const label=DOMAIN_MODULE_LABELS[moduleId]?.label||moduleId;
  showToast(checked?'✓ '+label+' added':'✓ '+label+' removed');
  _renderDomainModulesList(worldId);
  if(currentView===worldId)renderDomainGenericView(worldId);
}
function _openDomainEventModal(worldId){
  openCalEventModalOnDate(localDateStr(new Date()));
  setTimeout(()=>{const sel=document.getElementById('ce-type');if(sel)sel.value=worldId;},50);
}
function _newDomainNote(worldId){
  const n={id:Date.now(),title:'New Note',worldId:worldId,blocks:[{id:Date.now()+'.1',type:'h1',content:'',done:false},{id:Date.now()+'.2',type:'p',content:'',done:false}]};
  DB.notes.push(n);save('notes');
  SB.upsert('notes',n,'notes').catch(()=>{});
  setView('notes');
  setTimeout(()=>{currentNote=DB.notes.length-1;renderNotesList();openNoteEditor(currentNote);},150);
}

// ═══════════════════════════════════════════════════════════════════════════
// DOMAIN TIME ALLOCATION — an adjustable daily-hours budget per domain, with
// a start/pause timer tracking actual time spent today against it. Works
// identically for built-in worlds (Ideahub, Chainsmoker, etc.) and custom
// domains — both live in DB.worlds, so one engine covers all of them.
// ═══════════════════════════════════════════════════════════════════════════
function _timerKey(worldId){return 'j-timer-'+worldId+'-'+localDateStr(new Date());}
function _timerState(worldId){
  try{return JSON.parse(localStorage.getItem(_timerKey(worldId))||'null')||{accumSec:0,running:false,startedAt:null};}
  catch(e){return{accumSec:0,running:false,startedAt:null};}
}
function _timerSaveState(worldId,state){localStorage.setItem(_timerKey(worldId),JSON.stringify(state));}
function _timerElapsedSec(worldId){
  const s=_timerState(worldId);
  let sec=s.accumSec||0;
  if(s.running&&s.startedAt)sec+=(Date.now()-s.startedAt)/1000;
  return sec;
}
function toggleDomainTimer(worldId){
  const s=_timerState(worldId);
  if(s.running){
    s.accumSec=(s.accumSec||0)+(Date.now()-s.startedAt)/1000;
    s.running=false;s.startedAt=null;
  }else{
    s.running=true;s.startedAt=Date.now();
    localStorage.removeItem('j-timer-badge-hidden-'+worldId); // starting this timer always surfaces its badge again
  }
  _timerSaveState(worldId,s);
  refreshDomainTimerDisplay(worldId);
  renderFloatingTimerBadge();
  if(s.running)_ensureDomainTimerTick();
}
function _resetDomainTimerState(worldId){
  _timerSaveState(worldId,{accumSec:0,running:false,startedAt:null});
  refreshDomainTimerDisplay(worldId);
  renderFloatingTimerBadge();
}
async function resetDomainTimer(worldId){
  if(!await jelixConfirm("Reset today's timer for this domain?",'Reset'))return;
  _resetDomainTimerState(worldId);
}
async function editDomainAllottedHours(worldId){
  const w=(DB.worlds||[]).find(x=>x.id===worldId);if(!w)return;
  const result=await jelixPrompt('Allotted Hours',[{key:'val',label:'Hours allotted per day for '+w.label,type:'number',default:String(w.allottedHours||'')}],'Save');
  if(!result)return;
  const val=result[0];
  const num=parseFloat(val);
  if(isNaN(num)||num<0){showToast('Enter a valid number of hours.');return;}
  w.allottedHours=num;
  save('worlds');
  refreshDomainTimerDisplay(worldId);
}
let _domainTimerTickInterval=null;
function _ensureDomainTimerTick(){
  if(_domainTimerTickInterval)return;
  _domainTimerTickInterval=setInterval(()=>{
    const s=_timerState(currentView);
    if(s.running)refreshDomainTimerDisplay(currentView);
    renderFloatingTimerBadge();
  },1000);
}
// Per-domain in-page card: full vs. a slim one-line minimized state.
function _timerCardStateKey(worldId){return 'j-timer-cardstate-'+worldId;}
function timerCardIsMini(worldId){
  if(worldId==='life'&&_cfForceTimerMini)return true;
  const stored=localStorage.getItem(_timerCardStateKey(worldId));
  if(stored)return stored==='mini';
  // No explicit preference yet — the full card (timer + progress bar +
  // Start/Reset) is a big chunk of vertical space to default to on a
  // phone screen before any real content is visible. Default compact on
  // mobile, full on desktop where there's room to spare; whichever state
  // the user explicitly picks via the expand/collapse chevron sticks
  // after that, on both.
  return window.innerWidth<=768;
}
function toggleTimerCardState(worldId){
  localStorage.setItem(_timerCardStateKey(worldId),timerCardIsMini(worldId)?'full':'mini');
  refreshDomainTimerDisplay(worldId);
}
function domainTimerCardHTML(worldId){
  const w=(DB.worlds||[]).find(x=>x.id===worldId);if(!w)return'';
  const colorVal=(w.color&&/^#/.test(w.color))?w.color:('var('+(w.cssVar||'--teal')+')');
  const allotted=w.allottedHours||0;
  const elapsedSec=_timerElapsedSec(worldId);
  const elapsedHrs=elapsedSec/3600;
  const s=_timerState(worldId);
  const pct=allotted>0?Math.min(100,Math.round((elapsedHrs/allotted)*100)):0;
  const overBudget=allotted>0&&elapsedHrs>allotted;
  const fmtHM=sec=>{const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),ss=Math.floor(sec%60);return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(ss).padStart(2,'0');};

  if(worldId==='venture'){
    return`<div class="jc-timer-card">
      <div class="jc-timer-label"><i class="ti ti-clock-hour-4"></i><span>Time today</span></div>
      <strong>${fmtHM(elapsedSec)}</strong>
      <button class="jc-timer-note" onclick="editDomainAllottedHours('${worldId}')">${allotted>0?allotted+'h allotted':"No daily allotment set yet — click to set one."}</button>
      <button class="jc-timer-toggle${s.running?' is-running':''}" onclick="toggleDomainTimer('${worldId}')" aria-label="${s.running?'Pause':'Start'} Job Collectives timer"><i class="ti ${s.running?'ti-player-pause':'ti-player-play'}"></i><span>${s.running?'Pause':'Start'}</span></button>
      <button class="jc-timer-reset" onclick="resetDomainTimer('${worldId}')" aria-label="Reset Job Collectives timer"><i class="ti ti-refresh"></i></button>
    </div>`;
  }

  if(worldId==='build'||worldId==='sides'||worldId==='faith'||worldId==='life'){
    const label=worldId==='build'?'Code Collectives':worldId==='sides'?'Creative Collectives':worldId==='faith'?'Faith — Buklod':'Life';
    return`<div class="agency-timer-card">
      <div class="agency-timer-label"><i class="ti ti-clock-hour-4"></i><span>Time today</span></div>
      <strong>${fmtHM(elapsedSec)}</strong>
      <button class="agency-timer-note" onclick="editDomainAllottedHours('${worldId}')">${allotted>0?allotted+'h allotted':"No daily allotment set yet"}</button>
      <button class="agency-timer-toggle${s.running?' is-running':''}" onclick="toggleDomainTimer('${worldId}')" aria-label="${s.running?'Pause':'Start'} ${label} timer"><i class="ti ${s.running?'ti-player-pause':'ti-player-play'}"></i><span>${s.running?'Pause':'Start'}</span></button>
      <button class="agency-timer-reset" onclick="resetDomainTimer('${worldId}')" aria-label="Reset ${label} timer"><i class="ti ti-refresh"></i></button>
    </div>`;
  }

  if(timerCardIsMini(worldId)){
    return`<div class="hc" style="margin:8px 18px 0;flex-shrink:0;padding:6px 12px;display:flex;align-items:center;gap:8px">
      <span style="width:7px;height:7px;border-radius:50%;background:${s.running?colorVal:'var(--text4)'};flex-shrink:0${s.running?';box-shadow:0 0 6px '+colorVal:''}"></span>
      <span style="font-size:9px;font-weight:700;color:${colorVal};letter-spacing:.06em;text-transform:uppercase;flex-shrink:0">Time Today</span>
      <span style="font-size:var(--text-xs);font-weight:800;color:var(--text1);font-variant-numeric:tabular-nums">${fmtHM(elapsedSec)}</span>
      ${allotted>0?`<span style="font-size:9px;color:var(--text3)">of ${allotted}h</span>`:''}
      <div style="flex:1"></div>
      <button class="btn ${s.running?'btn-d':'btn-t'}" style="font-size:9px;padding:3px 8px;flex-shrink:0" onclick="toggleDomainTimer('${worldId}')"><i class="ti ${s.running?'ti-player-pause':'ti-player-play'}"></i></button>
      <button onclick="toggleTimerCardState('${worldId}')" style="background:transparent;border:none;color:var(--text3);cursor:pointer;padding:2px;flex-shrink:0" title="Expand"><i class="ti ti-chevron-down" style="font-size:13px;display:block"></i></button>
    </div>`;
  }
  return`<div class="hc" style="margin:8px 18px 0;flex-shrink:0;padding:10px 14px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;flex-wrap:wrap;gap:6px">
      <span style="font-size:9px;font-weight:700;color:${colorVal};letter-spacing:.08em;text-transform:uppercase"><i class="ti ti-clock-hour-4"></i> Time Today</span>
      <div style="display:flex;align-items:center;gap:8px">
        <span onclick="editDomainAllottedHours('${worldId}')" style="font-size:9px;color:var(--text3);cursor:pointer">${allotted>0?allotted+'h allotted':'Set allotted hours'} <i class="ti ti-pencil" style="font-size:8px"></i></span>
        <button onclick="toggleTimerCardState('${worldId}')" style="background:transparent;border:none;color:var(--text3);cursor:pointer;padding:2px" title="Minimize"><i class="ti ti-chevron-up" style="font-size:13px;display:block"></i></button>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap">
      <div style="font-size:17px;font-weight:800;color:${overBudget?'var(--red)':'var(--text1)'};font-variant-numeric:tabular-nums;letter-spacing:-.01em;flex-shrink:0">${fmtHM(elapsedSec)}</div>
      <div style="flex:1;min-width:120px">
        ${allotted>0?`<div style="height:5px;background:var(--navy4);border-radius:4px;overflow:hidden;margin-bottom:2px"><div style="height:100%;width:${pct}%;background:${overBudget?'var(--red)':colorVal};border-radius:4px;transition:width .3s"></div></div>
        <div style="font-size:9px;color:var(--text3)">${overBudget?'Over by '+(elapsedHrs-allotted).toFixed(1)+'h':(allotted-elapsedHrs).toFixed(1)+'h remaining'}</div>`:`<div style="font-size:9px;color:var(--text3)">No daily allotment set yet — click above to set one.</div>`}
      </div>
      <button class="btn ${s.running?'btn-d':'btn-t'}" style="font-size:9px;padding:5px 9px;flex-shrink:0" onclick="toggleDomainTimer('${worldId}')"><i class="ti ${s.running?'ti-player-pause':'ti-player-play'}"></i> ${s.running?'Pause':'Start'}</button>
      <button class="btn btn-g" style="font-size:9px;flex-shrink:0;padding:5px 7px" onclick="resetDomainTimer('${worldId}')" title="Reset today"><i class="ti ti-refresh"></i></button>
    </div>
  </div>`;
}
// ── Global floating side badge — visible from ANY view while a timer is
// running, so switching domains never means losing track of one that's
// still going. Independent of each page's own mini/full card state.
function _activeRunningTimerWorld(){
  return (DB.worlds||[]).find(w=>_timerState(w.id).running);
}
function _activeTimerWorlds(){
  // "Active" = has something worth showing a badge for: currently running,
  // OR paused mid-session with time already on the clock. Only genuinely
  // reset-to-zero timers (or ones you've explicitly hidden) have no badge.
  return (DB.worlds||[]).filter(w=>{
    const s=_timerState(w.id);
    return s.running||(s.accumSec||0)>0;
  });
}
function renderFloatingTimerBadge(){
  const active=_activeTimerWorlds();
  // Remove badges only for timers that are truly done (reset to zero and
  // not running) — checked directly against timer state, not by looking
  // the world up in DB.worlds, which was the earlier bug.
  document.querySelectorAll('[id^="floatingTimerBadge-"]').forEach(el=>{
    const wid=el.id.replace('floatingTimerBadge-','');
    const s=_timerState(wid);
    if(!s.running&&(s.accumSec||0)<=0)el.remove();
  });
  active.forEach((w,idx)=>{
    const hidden=localStorage.getItem('j-timer-badge-hidden-'+w.id)==='1';
    let badge=document.getElementById('floatingTimerBadge-'+w.id);
    if(hidden){if(badge)badge.style.display='none';return;}
    const isNew=!badge;
    if(isNew){
      badge=document.createElement('div');
      badge.id='floatingTimerBadge-'+w.id;
      document.body.appendChild(badge);
      _makeTimerBadgeDraggable(badge,w.id);
    }
    const colorVal=(w.color&&/^#/.test(w.color))?w.color:('var('+(w.cssVar||'--teal')+')');
    const elapsedSec=_timerElapsedSec(w.id);
    const isRunning=_timerState(w.id).running;
    const fmtHMS=sec=>{const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=Math.floor(sec%60);return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');};
    // Structural styling only — deliberately NOT using cssText here, because
    // cssText replaces the entire style attribute at once. That was the
    // actual bug: this function runs every second via the tick, and cssText
    // was silently wiping out left/top on every single call — position is
    // only ever set once, inside the isNew block below, so after the very
    // first tick the badge had no position left at all. Using individual
    // property assignment here only touches what's listed, leaving position
    // (and anything the user set by dragging) completely untouched.
    if(isNew){
      badge.style.position='fixed';
      badge.style.zIndex='9000';
      badge.style.display='flex';
      badge.style.alignItems='center';
      badge.style.gap='8px';
      badge.style.padding='10px 10px 10px 14px';
      badge.style.boxShadow='0 2px 16px rgba(0,0,0,.4)';
      badge.style.cursor='grab';
      badge.style.userSelect='none';
      badge.style.border='1px solid var(--border2)';
    }
    badge.style.background='var(--navy2)';
    badge.style.borderLeft='3px solid '+colorVal;
    badge.style.opacity=isRunning?'1':'.75';
    // Position: restore a saved drag position, otherwise stack down the right edge by index
    if(isNew){
      let pos=null;
      try{pos=JSON.parse(localStorage.getItem('j-timer-badge-pos-'+w.id)||'null');}catch(e){}
      if(pos){badge.style.left=pos.x+'px';badge.style.top=pos.y+'px';badge.style.borderRadius='12px';}
      else{badge.style.right='0px';badge.style.top=(120+idx*68)+'px';badge.style.borderRadius='12px 0 0 12px';}
    }
    badge.innerHTML=`
      <div onclick="setView('${w.id}')" style="display:flex;flex-direction:column;align-items:flex-start;cursor:pointer">
        <span style="font-size:9px;color:var(--text3);font-weight:700;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;max-width:90px;overflow:hidden;text-overflow:ellipsis">${w.label}${isRunning?'':' · Paused'}</span>
        <span style="font-size:15px;font-weight:800;color:var(--text1);font-variant-numeric:tabular-nums;white-space:nowrap">${fmtHMS(elapsedSec)}</span>
      </div>
      <button onclick="event.stopPropagation();toggleDomainTimer('${w.id}')" title="${isRunning?'Pause':'Resume'}" style="background:transparent;border:none;color:${colorVal};cursor:pointer;padding:4px;flex-shrink:0"><i class="ti ${isRunning?'ti-player-pause':'ti-player-play'}" style="font-size:18px;display:block"></i></button>
      <button onclick="event.stopPropagation();stopDomainTimer('${w.id}')" title="Stop" style="background:transparent;border:none;color:var(--red);cursor:pointer;padding:4px;flex-shrink:0"><i class="ti ti-player-stop" style="font-size:16px;display:block"></i></button>
      <button onclick="event.stopPropagation();hideFloatingTimerBadge('${w.id}')" style="background:transparent;border:none;color:var(--text3);cursor:pointer;padding:2px;flex-shrink:0" title="Hide"><i class="ti ti-x" style="font-size:13px;display:block"></i></button>
    `;
    badge.style.display='flex';
  });
}
// ═══════════════════════════════════════════════════════════════════════════
// FLOATING JOB AVATAR — a small persistent companion that lives on the edge
// of the screen across every view. Defaults to the LEFT side specifically
// because timer badges already own the right edge — this keeps them from
// ever competing for the same space. Draggable (same pattern as the timer
// badges), position persists, and it can be turned off from Settings if it
// ever gets in the way rather than cluttering the avatar itself with a
// close button.
// ═══════════════════════════════════════════════════════════════════════════
function renderJobFloatingAvatar(){
  if(localStorage.getItem('j-job-avatar-hidden')==='1')return;
  let el=document.getElementById('jobFloatingAvatar');
  const isNew=!el;
  if(isNew){
    el=document.createElement('div');
    el.id='jobFloatingAvatar';
    el.className='job-avatar-img';
    el.title='Ask JELIX';
    el.style.cssText='position:fixed;z-index:8500;width:56px;height:56px;border-radius:50%;border:2px solid var(--teal2);box-shadow:0 4px 20px rgba(0,0,0,.5);cursor:grab;user-select:none';
    document.body.appendChild(el);
    let pos=null;
    try{pos=JSON.parse(localStorage.getItem('j-job-avatar-pos')||'null');}catch(e){}
    if(pos){el.style.left=pos.x+'px';el.style.top=pos.y+'px';}
    else{el.style.left='8px';el.style.top='45%';}
    _makeJobAvatarDraggable(el);
  }
  el.style.display='block';
}
function hideJobFloatingAvatar(){
  localStorage.setItem('j-job-avatar-hidden','1');
  const el=document.getElementById('jobFloatingAvatar');
  if(el)el.style.display='none';
}
function showJobFloatingAvatar(){
  localStorage.removeItem('j-job-avatar-hidden');
  renderJobFloatingAvatar();
}
function _makeJobAvatarDraggable(el){
  let dragging=false,startX=0,startY=0,origX=0,origY=0,moved=false;
  const onDown=(e)=>{
    dragging=true;moved=false;
    const p=e.touches?e.touches[0]:e;
    startX=p.clientX;startY=p.clientY;
    const rect=el.getBoundingClientRect();
    origX=rect.left;origY=rect.top;
    el.style.cursor='grabbing';
    document.addEventListener('mousemove',onMove);document.addEventListener('touchmove',onMove,{passive:false});
    document.addEventListener('mouseup',onUp);document.addEventListener('touchend',onUp);
  };
  const onMove=(e)=>{
    if(!dragging)return;
    const p=e.touches?e.touches[0]:e;
    const dx=p.clientX-startX,dy=p.clientY-startY;
    if(Math.abs(dx)>3||Math.abs(dy)>3)moved=true;
    if(moved){
      if(e.cancelable)e.preventDefault();
      const newX=Math.max(4,Math.min(window.innerWidth-el.offsetWidth-4,origX+dx));
      const newY=Math.max(4,Math.min(window.innerHeight-el.offsetHeight-4,origY+dy));
      el.style.left=newX+'px';el.style.top=newY+'px';
    }
  };
  const onUp=()=>{
    if(!dragging)return;
    dragging=false;el.style.cursor='grab';
    document.removeEventListener('mousemove',onMove);document.removeEventListener('touchmove',onMove);
    document.removeEventListener('mouseup',onUp);document.removeEventListener('touchend',onUp);
    if(moved){
      const rect=el.getBoundingClientRect();
      localStorage.setItem('j-job-avatar-pos',JSON.stringify({x:rect.left,y:rect.top}));
    }else{
      // A tap/click without dragging opens JELIX
      setView('ai');
    }
  };
  el.addEventListener('mousedown',onDown);
  el.addEventListener('touchstart',onDown,{passive:true});
}
function _makeTimerBadgeDraggable(el,worldId){
  let dragging=false,startX=0,startY=0,origX=0,origY=0,moved=false;
  const onDown=(e)=>{
    // Don't start a drag from the buttons — let their own clicks fire normally
    if(e.target.closest('button'))return;
    dragging=true;moved=false;
    const p=e.touches?e.touches[0]:e;
    startX=p.clientX;startY=p.clientY;
    const rect=el.getBoundingClientRect();
    origX=rect.left;origY=rect.top;
    el.style.cursor='grabbing';
    document.addEventListener('mousemove',onMove);document.addEventListener('touchmove',onMove,{passive:false});
    document.addEventListener('mouseup',onUp);document.addEventListener('touchend',onUp);
  };
  const onMove=(e)=>{
    if(!dragging)return;
    const p=e.touches?e.touches[0]:e;
    const dx=p.clientX-startX,dy=p.clientY-startY;
    if(Math.abs(dx)>3||Math.abs(dy)>3)moved=true;
    if(moved){
      if(e.cancelable)e.preventDefault();
      const newX=Math.max(4,Math.min(window.innerWidth-el.offsetWidth-4,origX+dx));
      const newY=Math.max(4,Math.min(window.innerHeight-el.offsetHeight-4,origY+dy));
      el.style.left=newX+'px';el.style.top=newY+'px';el.style.right='';el.style.borderRadius='12px';
    }
  };
  const onUp=()=>{
    if(!dragging)return;
    dragging=false;el.style.cursor='grab';
    document.removeEventListener('mousemove',onMove);document.removeEventListener('touchmove',onMove);
    document.removeEventListener('mouseup',onUp);document.removeEventListener('touchend',onUp);
    if(moved){
      const rect=el.getBoundingClientRect();
      localStorage.setItem('j-timer-badge-pos-'+worldId,JSON.stringify({x:rect.left,y:rect.top}));
    }
  };
  el.addEventListener('mousedown',onDown);
  el.addEventListener('touchstart',onDown,{passive:true});
}
async function stopDomainTimer(worldId){
  if(!await jelixConfirm('Stop the timer for '+((DB.worlds||[]).find(w=>w.id===worldId)?.label||worldId)+'? This resets today\'s elapsed time to zero.','Stop'))return;
  _resetDomainTimerState(worldId);
  renderFloatingTimerBadge();
}
function hideFloatingTimerBadge(worldId){
  localStorage.setItem('j-timer-badge-hidden-'+worldId,'1');
  renderFloatingTimerBadge();
}
function mountDomainTimer(worldId){
  const view=document.getElementById('view-'+worldId);if(!view)return;
  if(document.getElementById('domainTimer-'+worldId))return;
  const vh=view.querySelector('.vh');
  const mount=document.createElement('div');
  mount.id='domainTimer-'+worldId;
  if(vh&&vh.parentNode)vh.parentNode.insertBefore(mount,vh.nextSibling);
  else view.insertBefore(mount,view.firstChild);
}
function renderDomainTimerCard(worldId){
  mountDomainTimer(worldId);
  const mount=document.getElementById('domainTimer-'+worldId);if(!mount)return;
  mount.innerHTML=domainTimerCardHTML(worldId);
  if(_timerState(worldId).running)_ensureDomainTimerTick();
}
// Dispatcher used by the timer's own controls and the live tick — works
// whether the active view is a built-in world (has a mounted card) or a
// custom domain (re-renders the generic view, which builds its own card).
function refreshDomainTimerDisplay(worldId){
  const mount=document.getElementById('domainTimer-'+worldId);
  if(mount){mount.innerHTML=domainTimerCardHTML(worldId);return;}
  if(currentView===worldId&&document.getElementById('view-domain-generic')?.classList.contains('active')){
    renderDomainGenericView(worldId);
  }
}

// ── Domain templates — one-click starter presets instead of adding modules
// one at a time every time you make a new domain. Only shown for a brand
// new domain (editing an existing one leaves its modules alone).
const DOMAIN_TEMPLATES={
  blank:{name:'Blank',icon:'ti-square',modules:DOMAIN_MODULE_DEFAULTS.slice()},
  client:{name:'Client Project',icon:'ti-briefcase',modules:['kanban','pipeline','contacts','countdown','notes']},
  personal:{name:'Personal Project',icon:'ti-rocket',modules:['tasks','kanban','goals','notes']},
  wellness:{name:'Habit / Wellness',icon:'ti-heart',modules:['habits','routine','metrics','goals']},
  finance:{name:'Finance / Budget',icon:'ti-wallet',modules:['budget','metrics','notes']}
};
let _selectedWmTemplate='blank';
function _renderWmTemplateGrid(){
  const grid=document.getElementById('wm-template-grid');if(!grid)return;
  grid.innerHTML=Object.entries(DOMAIN_TEMPLATES).map(([key,t])=>{
    const active=_selectedWmTemplate===key;
    return`<div onclick="_selectWmTemplate('${key}')" style="cursor:pointer;padding:8px 6px;border-radius:10px;border:1px solid ${active?'var(--teal)':'var(--border)'};background:${active?'rgba(128,255,250,.08)':'var(--navy3)'};text-align:center">
      <i class="ti ${t.icon}" style="font-size:16px;color:${active?'var(--teal)':'var(--text3)'}"></i>
      <div style="font-size:10px;color:var(--text2);margin-top:3px">${t.name}</div>
    </div>`;
  }).join('');
}
function _selectWmTemplate(key){_selectedWmTemplate=key;_renderWmTemplateGrid();}
function openWorldModal(id){
  editingWorldId=id||null;
  const w=id?(DB.worlds||[]).find(x=>x.id===id):null;
  document.getElementById('worldModalTitle').textContent=w?'Edit Domain':'Add Domain';
  const templateRow=document.getElementById('wm-template-row');
  if(templateRow)templateRow.style.display=w?'none':'block';
  _selectedWmTemplate='blank';
  _renderWmTemplateGrid();
  document.getElementById('wm-label').value=w?w.label:'';
  document.getElementById('wm-id').value=w?w.id:'';
  document.getElementById('wm-id').disabled=!!id;
  document.getElementById('wm-icon').value=w?w.icon:'ti-star';
  pendingWorldLogo=workspaceLogoFor(w);
  const logoInput=document.getElementById('wm-logo-file');if(logoInput)logoInput.value='';
  _renderWmIconGrid();
  _updateWmIconPreview();
  const colorVal=w?(w.color&&/^#/.test(w.color)?w.color:'#00d4c8'):'#00d4c8';
  document.getElementById('wm-color').value=colorVal;
  document.getElementById('wm-color-picker').value=colorVal;
  const delBtn=document.getElementById('wm-delete-btn');
  if(delBtn){const prot=w&&w.id==='work-ih';delBtn.style.display=(w&&!prot)?'block':'none';}
  openModal('worldModal');
}
function saveWorld(){
  const label=document.getElementById('wm-label').value.trim();
  const rawId=editingWorldId||document.getElementById('wm-id').value.trim().toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
  if(!label||!rawId){showToast('Name and slug required');return;}
  if(!editingWorldId&&(DB.worlds||[]).some(w=>w.id===rawId)){showToast('A world with that slug already exists');return;}
  const color=document.getElementById('wm-color').value.trim()||'#00d4c8';
  const icon=document.getElementById('wm-icon').value.trim()||'ti-star';
  const logo=pendingWorldLogo||'';
  if(editingWorldId){
    const i=(DB.worlds||[]).findIndex(w=>w.id===editingWorldId);
    if(i>=0){DB.worlds[i]={...DB.worlds[i],label,icon,color,logo};}
  }else{
    if(!DB.worlds)DB.worlds=[];
    const tmpl=DOMAIN_TEMPLATES[_selectedWmTemplate]||DOMAIN_TEMPLATES.blank;
    DB.worlds.push({id:rawId,label,icon,color,logo,cssVar:null,core:false,modules:tmpl.modules.slice(),moduleOrder:tmpl.modules.slice()});
  }
  save('worlds');
  closeModal('worldModal');
  renderSideNav();
  if(typeof renderNotesFolderRail==='function')renderNotesFolderRail();
  if(typeof populateTaskWorldDropdown==='function')populateTaskWorldDropdown();
  if(typeof syncCalWorldColors==='function'){
    syncCalWorldColors();
    if(typeof renderCalendar==='function'&&document.getElementById('view-calendar')?.classList.contains('active'))renderCalendar();
  }
  showToast(`✓ Domain "${label}" ${editingWorldId?'updated':'created'}`);
}
async function deleteWorld(id){
  const w=(DB.worlds||[]).find(x=>x.id===id);
  if(!w){showToast('Domain not found');return;}
  if(w.id==='work-ih'){showToast('Cannot delete the primary WORK world.');return;}
  if(!await jelixConfirm(`Delete world "${w.label}"?`,'Delete'))return;
  DB.worlds=DB.worlds.filter(x=>x.id!==id);
  save('worlds');
  // Unfile any notes that were in this folder rather than orphaning them
  (DB.notes||[]).forEach(n=>{if(n.worldId===id)n.worldId=null;});
  save('notes');
  // Unfile any tasks assigned to this domain too — previously only notes were
  // handled here, so a deleted domain's tasks kept a dangling t.world value
  // that matched nothing, silently vanishing from every board/filter that
  // grouped by domain instead of showing up as unfiled like notes do.
  // t.world is case-inconsistent across the codebase (built-in domains store
  // it uppercased, custom ones match w.id verbatim) so compare lowercased.
  const idLower=id.toLowerCase();
  (DB.tasks||[]).forEach(t=>{
    if((t.world||'').toLowerCase()===idLower){
      t.world=null;
      SB.update('tasks',t.id,{world:null},'tasks');
    }
  });
  if(notesActiveFolder===id)notesActiveFolder='all';
  renderSideNav();
  if(typeof renderNotesFolderRail==='function')renderNotesFolderRail();
  if(typeof renderNotesList==='function')renderNotesList();
  if(typeof populateTaskWorldDropdown==='function')populateTaskWorldDropdown();
  closeModal('worldModal');
  showToast('Domain deleted');
}

// ── Nav collapse / expand ────────────────────────────────────────────────────
function toggleNav(){
  const app=document.querySelector('.app');if(!app)return;
  const collapsed=app.classList.toggle('nav-collapsed');
  localStorage.setItem('j-nav-collapsed',collapsed?'1':'0');
  applyCollapsedNavStyling();
}
(function(){
  const app=document.querySelector('.app');
  if(localStorage.getItem('j-nav-mode-version')!=='2'){
    localStorage.setItem('j-nav-collapsed','0');
    localStorage.setItem('j-nav-mode-version','2');
  }
  if(app) app.classList.toggle('nav-collapsed',localStorage.getItem('j-nav-collapsed')==='1');
  applyCollapsedNavStyling();
})();
// Auth gate — decides whether to show sign-in or go straight to the PIN lock
checkAuthGate();

// ── Quick Capture NLP Router ─────────────────────────────────────────────────
// Natural-language due date/time — "Call John tomorrow 3pm" becomes title
// "Call John" with due=tomorrow, time=15:00, instead of the whole phrase
// landing as a literal task title. Deliberately covers only common,
// unambiguous phrasings (today/tomorrow/next <day>/<day>/in N days/M-D
// dates, plus a clock time) rather than a full NLP date library — good
// enough for a quick-add bar, and safe: anything it doesn't recognize is
// just left in the title untouched rather than guessed wrong.
function _parseNaturalDateTime(text){
  let clean=text;
  let due=null,time=null;
  const now=new Date();
  const WEEKDAYS=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

  const timeMatch=clean.match(/\b(\d{1,2})(:(\d{2}))?\s*(am|pm)\b/i)||clean.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if(timeMatch){
    if(timeMatch[4]){
      let h=parseInt(timeMatch[1],10);
      const min=timeMatch[3]?parseInt(timeMatch[3],10):0;
      const ap=timeMatch[4].toLowerCase();
      if(ap==='pm'&&h<12)h+=12;
      if(ap==='am'&&h===12)h=0;
      time=String(h).padStart(2,'0')+':'+String(min).padStart(2,'0');
    }else{
      time=String(parseInt(timeMatch[1],10)).padStart(2,'0')+':'+timeMatch[2];
    }
    clean=clean.replace(timeMatch[0],'').trim();
  }

  const lower=clean.toLowerCase();
  if(/\btoday\b/.test(lower)){
    due=localDateStr(now);
    clean=clean.replace(/\btoday\b/i,'').trim();
  }else if(/\btomorrow\b/.test(lower)){
    const d=new Date(now);d.setDate(d.getDate()+1);
    due=localDateStr(d);
    clean=clean.replace(/\btomorrow\b/i,'').trim();
  }else{
    const wdMatch=lower.match(/\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    if(wdMatch){
      const targetDow=WEEKDAYS.indexOf(wdMatch[2]);
      const d=new Date(now);
      let diff=(targetDow-d.getDay()+7)%7;
      if(diff===0)diff=7; // "monday" said on a Monday means next Monday, not today
      d.setDate(d.getDate()+diff);
      due=localDateStr(d);
      clean=clean.replace(new RegExp('\\b(next\\s+)?'+wdMatch[2]+'\\b','i'),'').trim();
    }else{
      const inMatch=lower.match(/\bin\s+(\d+)\s+(day|days|week|weeks)\b/);
      if(inMatch){
        const n=parseInt(inMatch[1],10);
        const d=new Date(now);
        d.setDate(d.getDate()+(inMatch[2].startsWith('week')?n*7:n));
        due=localDateStr(d);
        clean=clean.replace(/\bin\s+\d+\s+(day|days|week|weeks)\b/i,'').trim();
      }else{
        const dateMatch=clean.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
        if(dateMatch){
          const mo=parseInt(dateMatch[1],10)-1;
          const da=parseInt(dateMatch[2],10);
          let yr=dateMatch[3]?parseInt(dateMatch[3],10):now.getFullYear();
          if(yr<100)yr+=2000;
          due=localDateStr(new Date(yr,mo,da));
          clean=clean.replace(dateMatch[0],'').trim();
        }
      }
    }
  }
  // Strip a preposition left dangling once the date/time it referred to is gone
  // (e.g. "Meeting at 3pm tomorrow" -> "Meeting at" once both are removed).
  clean=clean.replace(/\s{2,}/g,' ').replace(/\b(at|on|by|for)\s*$/i,'').replace(/^[,\s]+|[,\s]+$/g,'').trim();
  return{cleanText:clean,due,time};
}
function runCapture(){
  const input=document.getElementById('captureInput');if(!input)return;
  const raw=input.value.trim();if(!raw)return;input.value='';
  // Feed learning engine
  LearnEngine.onCapture(raw);
  // Also log into the Capture Processor's own record — even though the quick-actions
  // below execute immediately, this keeps a persistent, reviewable trail in the
  // Capture Processor inbox instead of the action just vanishing once it's done.
  let capEntry=null;
  try{
    capEntry={id:Date.now()+1,content:raw,type:'Idea',world:'',notes:'Via Capture bar',status:'inbox',date:localDateStr(new Date()),time:new Date().toISOString()};
    DB.captures.unshift(capEntry);
    save('captures');
    SB.upsert('captures',capEntry,'captures');
    if(typeof renderCaptureView==='function')renderCaptureView();
  }catch(e){}
  const WM={'cs':'WORK-CS','chainsmoker':'WORK-CS','ih':'WORK-IH','ideahub':'WORK-IH',
    'build':'BUILD','faith':'FAITH','buklod':'FAITH','sides':'SIDES','raket':'SIDES',
    'venture':'VENTURE','tjc':'VENTURE','life':'LIFE'};
  const VM={'WORK-CS':'work-cs','WORK-IH':'work-ih','BUILD':'build','FAITH':'faith',
    'SIDES':'sides','VENTURE':'venture','LIFE':'life'};
  const NM={'dashboard':'dashboard','home':'dashboard','tasks':'tasks','notes':'notes',
    'calendar':'calendar','cal':'calendar','ai':'ai','memory':'memory',
    'history':'history','settings':'settings','health':'life','morning':'jarvis-morning'};
  const m=raw.match(/^\/([a-z]+(?:-[a-z]+)?)\s*([\s\S]*)/i);
  if(!m){
    showToast('✓ Saved to Inbox — triage it when ready');
    setView('jarvis-capture');
    return;
  }
  const prefix=m[1].toLowerCase();const body=(m[2]||'').trim();
  if(!capEntry)return;
  capEntry.status='processed';
  capEntry.type=prefix==='debit'||prefix==='credit'?'Reference':'Task';
  capEntry.world=WM[prefix]||'';
  save('captures');
  SB.update('captures',capEntry.id,{status:capEntry.status,type:capEntry.type,world:capEntry.world},'captures').catch(()=>{});
  if(WM[prefix]){
    const world=WM[prefix];
    const parsed=_parseNaturalDateTime(body||'New task');
    const title=parsed.cleanText||body||'New task';
    const task={id:Date.now(),title,world,priority:'Medium',status:'Todo',due:parsed.due||'',startTime:parsed.time||'',platform:'',client:'',notes:'',subitems:[],timelineS:'',timelineE:parsed.due||'',numValue:null,connBoard:null,connItemId:null,groupId:null};
    DB.tasks.unshift(task);save('tasks');
    try{SB.upsert('tasks',task,'tasks');}catch(e){}
    try{addHistory('add','Quick capture \u2192 '+world+': '+title,{...task,_dbKey:'tasks'});}catch(e){}
    try{renderTasks();renderBrief();}catch(e){}
    const when=[parsed.due,parsed.time].filter(Boolean).join(' ');
    showToast('\u2713 Task \u2192 '+world+': '+title.substring(0,35)+(when?' \u00b7 '+when:''));
    setTimeout(()=>{try{setView(VM[world]||'tasks');}catch(e){}},350);return;
  }
  if(prefix==='debit'||prefix==='credit'){
    const nm=body.match(/^[₱$]?([\d,]+(?:\.\d+)?)\s*(.*)/);
    if(nm){
      const amount=parseFloat(nm[1].replace(/,/g,''));const desc=(nm[2]||body).trim()||'Quick entry';
      if(!isNaN(amount)&&amount>0){
        const type=prefix==='debit'?'Debit':'Credit';
        const cf={id:Date.now(),type,amount,desc,date:localDateStr(new Date()),account:'Cash',cat:'Business',notes:'Quick Capture'};
        DB.cashflow.unshift(cf);save('cashflow');
        try{SB.upsert('cashflow',cf,'cashflow');}catch(e){}
        try{addHistory('add',type+' \u20b1'+amount+': '+desc,{...cf,_dbKey:'cashflow'});}catch(e){}
        try{renderBrief();}catch(e){}
        showToast('\u2713 '+type+' \u20b1'+amount.toLocaleString()+' \u2014 '+desc.substring(0,30));return;
      }
    }
    showToast('\u26a0 Format: /'+prefix+' [amount] [description]');return;
  }
  if(NM[prefix]){try{setView(NM[prefix]);}catch(e){}return;}
  showToast('\u26a0 Unknown: /'+prefix+' \u00b7 Try /cs /ih /build /faith /venture /sides /life /debit /credit');
}

// ===== TTS =====
let isMuted=localStorage.getItem('j-voice-output')!=='on',ttsVoice=null;
function loadVoices(){const v=speechSynthesis.getVoices();ttsVoice=v.find(x=>x.lang==='en-US'&&/natural|neural|samantha|ava|alex/i.test(x.name))||v.find(x=>x.lang.startsWith('en-US'))||v.find(x=>x.lang.startsWith('en'))||null;}
speechSynthesis.onvoiceschanged=loadVoices;loadVoices();
// ── TTS Priority: OpenAI (Onyx) → Browser ────────────────────────────────
let currentAudio=null; // track playing audio to allow cancel

function cleanForSpeech(text){
  return text
    .replace(/```[\s\S]*?```/g,'code block')
    .replace(/[*_`#>\[\]]/g,'')
    .replace(/https?:\/\/\S+/g,'link')
    .replace(/₱/g,'PHP ')
    .replace(/\n{2,}/g,'. ')
    .replace(/\n/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .substring(0,800);
}

// Spoken output intentionally uses the device voice layer. It keeps the
// OpenAI key server-side while giving the assistant a calm, natural delivery.
async function _speakElevenLabs(text){
  return false;
  const key=localStorage.getItem('jelix-elevenlabs-key');
  if(!key)return false;
  try{
    const res=await fetch('https://api.elevenlabs.io/v1/text-to-speech/ppLqTilh7rH7fbUVlXsf',{
      method:'POST',
      headers:{'xi-api-key':key,'Content-Type':'application/json','Accept':'audio/mpeg'},
      body:JSON.stringify({
        text,
        model_id:'eleven_turbo_v2_5',
        voice_settings:{stability:0.5,similarity_boost:0.75,style:0.15,use_speaker_boost:true}
      })
    });
    if(!res.ok)return false;
    const blob=await res.blob();
    currentAudio=new Audio(URL.createObjectURL(blob));
    currentAudio.play();
    return true;
  }catch(e){return false;}
}
async function speak(text){
  if(isMuted||!text)return;
  speechSynthesis.cancel();
  if(currentAudio){currentAudio.pause();currentAudio=null;}
  const clean=cleanForSpeech(text);
  _setJelixAvatarSpeaking(true);
  const finishSpeaking=()=>_setJelixAvatarSpeaking(false);
  const secureUtt=new SpeechSynthesisUtterance(clean);secureUtt.lang='en-US';secureUtt.rate=0.98;secureUtt.pitch=1.0;secureUtt.volume=1;if(ttsVoice)secureUtt.voice=ttsVoice;
  secureUtt.onend=finishSpeaking;secureUtt.onerror=finishSpeaking;speechSynthesis.speak(secureUtt);return;
}
// Toggles a more intense twinkle on every JELIX avatar currently on screen —
// this is what makes the sparkle mark visibly "come alive" while it talks.
function _setJelixAvatarSpeaking(on){
  document.querySelectorAll('.jelix-avatar-live').forEach(el=>el.classList.toggle('jelix-speaking',on));
}

async function speakSlow(text){
  // Morning brief — deliberate delivery
  if(isMuted||!text)return;
  speechSynthesis.cancel();
  if(currentAudio){currentAudio.pause();currentAudio=null;}
  const clean=cleanForSpeech(text);
  const secureUtt=new SpeechSynthesisUtterance(clean);secureUtt.lang='en-US';secureUtt.rate=0.88;secureUtt.pitch=1.0;secureUtt.volume=1;if(ttsVoice)secureUtt.voice=ttsVoice;speechSynthesis.speak(secureUtt);return;
}

function lockOS(){
  speechSynthesis.cancel();
  if(currentAudio){currentAudio.pause();currentAudio=null;}
  currentPinInput='';
  const dots=document.querySelectorAll('.pin-dot');
  dots.forEach(d=>d.classList.remove('filled'));
  const err=document.getElementById('pinError');
  if(err){err.style.opacity='0';err.textContent='';}
  const raw=document.getElementById('rawPinInput');if(raw)raw.value='';
  const ls=document.getElementById('lockScreen');
  const app=document.getElementById('appRoot');
  if(ls&&app){
    app.style.display='none';
    ls.style.display='flex';
    ls.style.opacity='1';
    showToast('System locked.');
    speak('J.O.B Systems locked. Enter PIN to continue.');
  }
}
function toggleMute(){isMuted=!isMuted;localStorage.setItem('j-voice-output',isMuted?'off':'on');const btn=document.getElementById('muteBtn'),icon=document.getElementById('muteIcon'),label=document.getElementById('acctMuteLabel');if(isMuted){speechSynthesis.cancel();if(currentAudio){currentAudio.pause();currentAudio=null;}icon.className='ti ti-volume-off';btn.style.borderColor='var(--red)';btn.style.color='var(--red)';if(label)label.textContent='Voice Output: Off';showToast('Voice muted');}else{icon.className='ti ti-volume';btn.style.borderColor='var(--border2)';btn.style.color='var(--text2)';if(label)label.textContent='Voice Output: On';speak('Voice activated. J.O.B Systems online.');}}

// ── Topbar: Account menu + Notifications dropdown ──────────────────────
function toggleAccountMenu(e){
  const menu=document.getElementById('accountMenu');
  if(!menu)return;
  const isOpen=menu.style.display==='block';
  closeTopDropdowns();
  const profile=document.getElementById('navProfileCard');
  const chevron=document.getElementById('profileMenuChevron');
  if(profile)profile.setAttribute('aria-expanded',isOpen?'false':'true');
  if(chevron)chevron.style.transform=isOpen?'':'rotate(180deg)';
  if(!isOpen){
    // Anchor near whichever trigger opened it (sidebar profile card)
    const trigger=(e&&e.currentTarget)||document.getElementById('navProfileCard');
    if(trigger){
      const r=trigger.getBoundingClientRect();
      menu.style.position='fixed';
      const opensUpward=r.top>window.innerHeight-320;
      menu.style.top=opensUpward?'':((r.bottom+8)+'px');
      menu.style.bottom=opensUpward?((window.innerHeight-r.top+8)+'px'):'';
      // Keep it on-screen horizontally
      const left=Math.min(Math.max(8,r.left),window.innerWidth-296);
      menu.style.left=left+'px';
      menu.style.right='';
    }
    menu.style.display='block';
    setTimeout(()=>{
      document.addEventListener('click',function closeAcct(e){
        if(!e.target.closest('#accountMenu')&&!e.target.closest('#navProfileCard')){
          menu.style.display='none';
          if(profile)profile.setAttribute('aria-expanded','false');
          if(chevron)chevron.style.transform='';
          document.removeEventListener('click',closeAcct);
        }
      });
    },10);
  }
}
let _notifHideTimer=null;
function showNotifPreview(){
  if(!window.matchMedia||!window.matchMedia('(hover: hover)').matches)return; // touch devices don't get hover-preview — avoids the tap/hover race entirely
  const panel=document.getElementById('topNotifPanel');if(!panel)return;
  cancelHideNotifPreview();
  if(panel.style.display==='block')return; // already open via click
  renderTopNotifPanel();
  panel.style.display='block';
  panel.dataset.hoverOnly='1';
}
function scheduleHideNotifPreview(){
  if(_notifHideTimer)clearTimeout(_notifHideTimer);
  _notifHideTimer=setTimeout(()=>{
    const panel=document.getElementById('topNotifPanel');
    if(panel&&panel.dataset.hoverOnly==='1'){panel.style.display='none';panel.dataset.hoverOnly='';}
  },250);
}
function cancelHideNotifPreview(){
  if(_notifHideTimer){clearTimeout(_notifHideTimer);_notifHideTimer=null;}
}
function toggleTopNotif(e){
  const panel=document.getElementById('topNotifPanel');
  if(!panel)return;
  // A real click-opened panel closes on the next click. But on touch devices,
  // tapping fires a synthetic mouseenter (which opens the hover preview) a
  // moment before the click itself — so "is it open" must specifically mean
  // "opened by click", not "opened by anything". Otherwise the tap's own
  // hover-preview gets mistaken for an already-open panel and just closes it.
  const isOpenByClick=panel.style.display==='block'&&panel.dataset.hoverOnly!=='1';
  closeTopDropdowns();
  if(isOpenByClick)return;
  renderTopNotifPanel();
  // Anchor near whichever trigger opened it (desktop topbar bell or mobile header bell)
  const trigger=(e&&e.currentTarget)||document.getElementById('topNotifBtn');
  if(trigger){
    const r=trigger.getBoundingClientRect();
    panel.style.position='fixed';
    const opensDownward=r.top<window.innerHeight-420;
    panel.style.top=opensDownward?((r.bottom+8)+'px'):'';
    panel.style.bottom=opensDownward?'':((window.innerHeight-r.top+8)+'px');
    const left=Math.min(Math.max(8,r.right-340),window.innerWidth-348);
    panel.style.left=left+'px';
    panel.style.right='';
  }
  panel.style.display='block';
  panel.dataset.hoverOnly=''; // click-opened — stays open regardless of mouse position
  setTimeout(()=>{
    document.addEventListener('click',function closeNotif(e){
      if(!e.target.closest('#topNotifPanel')&&!e.target.closest('#topNotifBtn')&&!e.target.closest('#mobileNotifBtn')){
        panel.style.display='none';
        document.removeEventListener('click',closeNotif);
      }
    });
  },10);
}
function closeTopDropdowns(){
  const menu=document.getElementById('accountMenu');if(menu)menu.style.display='none';
  const profile=document.getElementById('navProfileCard');if(profile)profile.setAttribute('aria-expanded','false');
  const chevron=document.getElementById('profileMenuChevron');if(chevron)chevron.style.transform='';
  const panel=document.getElementById('topNotifPanel');if(panel)panel.style.display='none';
}
function renderTopNotifPanel(){
  const panel=document.getElementById('topNotifPanel');if(!panel)return;
  const items=typeof getUrgentItems==='function'?getUrgentItems():[];
  const today=localDateStr(new Date());
  // Today's calendar events — a second notification category alongside urgent tasks
  let todayEvents=[];
  try{
    todayEvents=(typeof expandRecurring==='function'?expandRecurring(DB.calEvents||[],today,today):[])
      .sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99'));
  }catch(e){}
  const totalCount=items.length+todayEvents.length;
  panel.innerHTML=`
    <div style="padding:14px 16px;border-bottom:1px solid var(--border);font-size:var(--text-sm);font-weight:700;color:var(--text1);display:flex;justify-content:space-between;align-items:center">
      <span>Notifications</span>
      ${totalCount?`<span style="font-size:var(--text-xs);font-weight:600;color:var(--text3)">${totalCount}</span>`:''}
    </div>
    <div style="max-height:400px;overflow-y:auto;padding:6px">
      ${items.length?`<div style="font-size:var(--text-xs);font-weight:700;color:var(--text3);letter-spacing:.06em;text-transform:uppercase;padding:8px 10px 4px">Urgent Tasks</div>`:''}
      ${items.map(t=>{
        const isOverdue=t.due&&t.due<today;
        return `<div class="acct-menu-item" onclick="closeTopDropdowns();editTask(${t.id})" style="align-items:flex-start">
          <i class="ti ${isOverdue?'ti-clock-exclamation':'ti-flag'}" style="color:${isOverdue?'var(--red)':'var(--amber)'};margin-top:2px"></i>
          <div style="min-width:0"><div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.title}</div><div style="font-size:var(--text-xs);color:${isOverdue?'var(--red)':'var(--text3)'}">${t.due?(isOverdue?'Overdue · ':'')+t.due:'No due date'}</div></div>
        </div>`;
      }).join('')}
      ${todayEvents.length?`<div style="font-size:var(--text-xs);font-weight:700;color:var(--text3);letter-spacing:.06em;text-transform:uppercase;padding:10px 10px 4px">Today's Schedule</div>`:''}
      ${todayEvents.map(e=>`<div class="acct-menu-item" onclick="closeTopDropdowns();setView('calendar');calSelectedDate='${e._expandedDate||e.date}';setCalView('day')" style="align-items:flex-start">
        <i class="ti ti-calendar-event" style="color:var(--teal);margin-top:2px"></i>
        <div style="min-width:0"><div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.title}</div><div style="font-size:var(--text-xs);color:var(--text3)">${e.time?to12h(e.time):'All day'}</div></div>
      </div>`).join('')}
      ${!totalCount?'<div style="padding:20px;text-align:center;color:var(--text3);font-size:var(--text-sm)">All clear.</div>':''}
    </div>
  `;
  const badge=document.getElementById('topNotifBadge');
  if(badge)badge.style.display=totalCount?'block':'none';
}
async function setOpenAIKey(){showToast('Use J.E.L.I.X through the secure backend. Browser API keys are disabled.');}
// ── Unified ChatGPT provider call — OpenAI key stays server-side ───────────
async function callAIProvider(system,msgs,opts){
  const transcript=(msgs||[]).map(m=>(m.role||'user').toUpperCase()+': '+(m.content||'')).join('\n');
  const result=await requestJobAI({message:transcript||'Please help with this request.',system:system||'',purpose:'utility_ai'});
  return result.ok?result:{ok:false,error:result.text};
}
function hasAnyAIKey(){
  return isSignedIn();
}
// ── Google Workspace OAuth (PKCE — no client secret shipped in this public file) ──
const GOOGLE_OAUTH_CLIENT_ID='253506334952-5rrceaqgokqhcrknf4o1pkqto8rliucu.apps.googleusercontent.com';
// Token exchange goes through a Supabase Edge Function ("google-oauth-token")
// that holds the client_secret as a function secret — never in this file.
// One-time setup needed: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET as
// secrets on that function via the Supabase Dashboard — see DEPLOY_OAUTH_PROXY.md.
const GOOGLE_TOKEN_PROXY_URL='https://ddxkmidantqgnxfxsrrz.supabase.co/functions/v1/google-oauth-token';
const GOOGLE_OAUTH_REDIRECT_URI='https://justineinacay.github.io/JOBSystems/';
const GOOGLE_OAUTH_SCOPES=[
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/tasks',
].join(' ');

function _base64UrlEncode(buf){
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
async function _pkceChallenge(verifier){
  const data=new TextEncoder().encode(verifier);
  const digest=await crypto.subtle.digest('SHA-256',data);
  return _base64UrlEncode(digest);
}
function _randomVerifier(){
  const arr=new Uint8Array(64);crypto.getRandomValues(arr);
  return _base64UrlEncode(arr.buffer);
}

async function connectGoogleWorkspace(){
  const verifier=_randomVerifier();
  sessionStorage.setItem('j-google-pkce-verifier',verifier);
  const challenge=await _pkceChallenge(verifier);
  const params=new URLSearchParams({
    client_id:GOOGLE_OAUTH_CLIENT_ID,
    redirect_uri:GOOGLE_OAUTH_REDIRECT_URI,
    response_type:'code',
    scope:GOOGLE_OAUTH_SCOPES,
    access_type:'offline',
    prompt:'consent',
    code_challenge:challenge,
    code_challenge_method:'S256',
  });
  window.location.href='https://accounts.google.com/o/oauth2/v2/auth?'+params.toString();
}

async function _handleGoogleOAuthCallback(){
  const params=new URLSearchParams(window.location.search);
  const code=params.get('code');
  if(!code)return;
  const verifier=sessionStorage.getItem('j-google-pkce-verifier');
  if(!verifier)return;
  try{
    const res=await fetch(GOOGLE_TOKEN_PROXY_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        grant_type:'authorization_code',
        code,
        code_verifier:verifier,
        redirect_uri:GOOGLE_OAUTH_REDIRECT_URI,
      })
    });
    const raw=await res.text();
    let data;
    try{data=JSON.parse(raw);}catch(parseErr){
      console.error('Google OAuth proxy returned non-JSON:',raw.substring(0,300));
      showToast('⚠ Google connection failed: proxy returned an unexpected response (not JSON). Check the Edge Function is deployed and reachable — see console for details.');
      sessionStorage.removeItem('j-google-pkce-verifier');
      window.history.replaceState({},document.title,window.location.pathname);
      return;
    }
    if(data.access_token){
      const expiry=Date.now()+((data.expires_in||3600)*1000);
      localStorage.setItem('j-google-access-token',data.access_token);
      localStorage.setItem('j-google-token-expiry',String(expiry));
      if(data.refresh_token)localStorage.setItem('j-google-refresh-token',data.refresh_token);
      showToast('✓ Google Workspace connected.');
      if(typeof startGoogleSyncLoop==='function')startGoogleSyncLoop();
    }else{
      showToast('⚠ Google connection failed: '+(data.error_description||data.error||'unknown error'));
      console.error('Google OAuth token exchange failed',data);
    }
  }catch(e){
    showToast('⚠ Google connection failed: '+e.message);
  }
  // Clean the ?code=... off the URL so a refresh doesn't retry the exchange
  sessionStorage.removeItem('j-google-pkce-verifier');
  window.history.replaceState({},document.title,window.location.pathname);
}
// Run on boot — harmless no-op if there's no ?code= in the URL
if(window.location.search.includes('code=')){
  document.addEventListener('DOMContentLoaded',_handleGoogleOAuthCallback);
}

function isGoogleWorkspaceConnected(){
  const token=localStorage.getItem('j-google-access-token');
  const expiry=parseInt(localStorage.getItem('j-google-token-expiry')||'0');
  return !!token&&Date.now()<expiry;
}
async function disconnectGoogleWorkspace(){
  if(!await jelixConfirm('Disconnect your Google Workspace account?','Disconnect'))return;
  localStorage.removeItem('j-google-access-token');
  localStorage.removeItem('j-google-token-expiry');
  localStorage.removeItem('j-google-refresh-token');
  showToast('Google Workspace disconnected.');
  renderSettingsView();
}
// NOTE: refreshing an expired access token normally requires the client_secret for
// "Web application"-type OAuth clients — that secret is intentionally NOT embedded in
// this public file. When the token expires, connectGoogleWorkspace() must be called
// again (one click, same consent screen, usually instant since already authorized).
async function _refreshGoogleToken(){
  const refreshToken=localStorage.getItem('j-google-refresh-token');
  if(!refreshToken)return null;
  try{
    const res=await fetch(GOOGLE_TOKEN_PROXY_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({grant_type:'refresh_token',refresh_token:refreshToken})
    });
    const raw=await res.text();
    let data;
    try{data=JSON.parse(raw);}catch(parseErr){
      console.error('Google token refresh proxy returned non-JSON:',raw.substring(0,300));
      return null;
    }
    if(!data.access_token)return null;
    const expiry=Date.now()+((data.expires_in||3600)*1000);
    localStorage.setItem('j-google-access-token',data.access_token);
    localStorage.setItem('j-google-token-expiry',String(expiry));
    // Google may or may not rotate the refresh token — keep the existing one unless a new one arrives
    if(data.refresh_token)localStorage.setItem('j-google-refresh-token',data.refresh_token);
    return data.access_token;
  }catch(e){
    console.error('Google token refresh failed',e);
    return null;
  }
}
async function ensureGoogleToken(){
  if(isGoogleWorkspaceConnected())return localStorage.getItem('j-google-access-token');
  // Expired but we have a refresh token — refresh silently through the proxy instead
  // of forcing a manual reconnect (this is now possible since the secret lives server-side).
  const refreshToken=localStorage.getItem('j-google-refresh-token');
  if(refreshToken)return await _refreshGoogleToken();
  return null;
}
async function fetchGoogleCalendarEvents(maxResults){
  const token=await ensureGoogleToken();
  if(!token)return{ok:false,error:'Not connected'};
  try{
    const now=new Date().toISOString();
    const params=new URLSearchParams({timeMin:now,maxResults:String(maxResults||10),singleEvents:'true',orderBy:'startTime'});
    const res=await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?'+params.toString(),{
      headers:{'Authorization':'Bearer '+token}
    });
    if(!res.ok)return{ok:false,error:'Google Calendar API error '+res.status};
    const data=await res.json();
    return{ok:true,events:data.items||[]};
  }catch(e){
    return{ok:false,error:e.message};
  }
}

// ── Gmail: send ─────────────────────────────────────────────────────────────
// Gmail's send endpoint takes a raw base64url-encoded RFC 2822 message.
async function sendGoogleGmail(to,subject,body){
  const token=await ensureGoogleToken();
  if(!token)return{ok:false,error:'Google Workspace not connected'};
  try{
    const raw=`To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${body}`;
    const encoded=btoa(unescape(encodeURIComponent(raw))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    const res=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{
      method:'POST',
      headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({raw:encoded})
    });
    if(!res.ok){const errBody=await res.text().catch(()=>'');return{ok:false,error:'Gmail send failed '+res.status+(errBody?': '+errBody.substring(0,200):'')};}
    const data=await res.json();
    return{ok:true,messageId:data.id};
  }catch(e){
    return{ok:false,error:e.message};
  }
}

// ── Gmail: starred messages — the Gmail↔task sync source list ───────────────
// Reuses searchGoogleGmail's metadata-fetch approach but keeps the message id
// on each result (searchGoogleGmail drops it), since the id is what a task
// needs to remember to later archive/unstar the source email.
async function fetchStarredGmailMessages(maxResults){
  const token=await ensureGoogleToken();
  if(!token)return{ok:false,error:'Google Workspace not connected'};
  try{
    const params=new URLSearchParams({q:'is:starred',maxResults:String(maxResults||20)});
    const listRes=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?'+params.toString(),{headers:{'Authorization':'Bearer '+token}});
    if(!listRes.ok)return{ok:false,error:'Gmail search failed '+listRes.status};
    const listData=await listRes.json();
    const ids=(listData.messages||[]).map(m=>m.id);
    const msgs=await Promise.all(ids.map(async id=>{
      const r=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,{headers:{'Authorization':'Bearer '+token}});
      if(!r.ok)return null;
      const d=await r.json();
      const h=(d.payload?.headers||[]).reduce((o,x)=>{o[x.name]=x.value;return o;},{});
      return{id,from:h.From||'',subject:h.Subject||'(no subject)',snippet:d.snippet||''};
    }));
    return{ok:true,messages:msgs.filter(Boolean)};
  }catch(e){return{ok:false,error:e.message};}
}
// Removes STARRED and INBOX (archives it) — idempotent, safe to call even if
// already archived/unstarred, so no extra "already handled" state is needed
// beyond gmail_message_id itself.
async function archiveAndUnstarGmailMessage(messageId){
  const token=await ensureGoogleToken();
  if(!token)return{ok:false,error:'Google Workspace not connected'};
  try{
    const res=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,{
      method:'POST',
      headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({removeLabelIds:['STARRED','INBOX']})
    });
    if(!res.ok&&res.status!==404)return{ok:false,error:'Gmail archive failed '+res.status};
    return{ok:true};
  }catch(e){
    return{ok:false,error:e.message};
  }
}
async function pullStarredGmailTasks(){
  if(!isGoogleWorkspaceConnected())return;
  const r=await fetchStarredGmailMessages(20);
  if(!r.ok){_markGoogleSyncError('Gmail',r.error);return;}
  const uid=getAuthUserId();
  if(!uid)return;
  let changed=false;
  for(const msg of r.messages){
    if(DB.tasks.some(t=>t.gmail_message_id===msg.id))continue;
    const fromName=(msg.from.match(/^([^<]+)/)||[])[1]?.trim()||msg.from;
    const task={id:Date.now()+Math.floor(Math.random()*1000),title:msg.subject,world:'LIFE',priority:'Medium',
      status:'Todo',due:'',platform:'Gmail',client:fromName,notes:msg.snippet,subitems:[],
      timelineS:'',timelineE:'',numValue:null,connBoard:null,connItemId:null,groupId:null,gmail_message_id:msg.id};
    DB.tasks.unshift(task);
    _jelixSyncingFromGoogle=true;
    try{await SB.upsert('tasks',task,'tasks');}finally{_jelixSyncingFromGoogle=false;}
    changed=true;
  }
  _markGoogleSyncOk();
  if(changed){save('tasks');try{renderTasks();renderBrief();}catch(e){}}
}
// Completing a task that came from a starred email archives + unstars the
// email — this is the "PWA → Gmail" half. Runs alongside the normal Google
// Tasks push in _pushTaskToGoogle rather than needing its own SB hook.
async function _syncGmailTaskCompletion(task){
  if(_jelixSyncingFromGoogle||!isGoogleWorkspaceConnected()||!task.gmail_message_id||task.status!=='Done')return;
  try{
    const r=await archiveAndUnstarGmailMessage(task.gmail_message_id);
    if(!r.ok)showToast('⚠ Couldn\'t archive the source email for "'+task.title+'": '+r.error);
  }catch(e){console.error('[Gmail sync] archive failed',e);}
}

// ── Calendar: create event ──────────────────────────────────────────────────
// startISO/endISO: full ISO datetimes, e.g. '2026-07-20T14:00:00+08:00'
async function createGoogleCalendarEvent(calendarId,title,startISO,endISO,notes,wantMeet){
  const token=await ensureGoogleToken();
  if(!token)return{ok:false,error:'Google Workspace not connected'};
  // A bare "YYYY-MM-DD" (all-day event, no time component) must go in Google's
  // `date` field, not `dateTime` — `dateTime` requires a full RFC3339 timestamp
  // and Google's API rejects a plain date passed there.
  const isDateOnly=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s);
  try{
    const body={
      summary:title,
      description:notes||'',
      start:isDateOnly(startISO)?{date:startISO}:{dateTime:startISO},
      end:isDateOnly(endISO)?{date:endISO}:{dateTime:endISO}
    };
    // conferenceDataVersion=1 on the URL is required for Google to actually
    // honor conferenceData.createRequest — without it the field is silently
    // ignored and no Meet link comes back.
    let url=`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId||'primary')}/events`;
    if(wantMeet){
      url+='?conferenceDataVersion=1';
      body.conferenceData={createRequest:{requestId:'jelix-'+Date.now(),conferenceSolutionKey:{type:'hangoutsMeet'}}};
    }
    const res=await fetch(url,{
      method:'POST',
      headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
    if(!res.ok){const errBody=await res.text().catch(()=>'');return{ok:false,error:'Calendar create failed '+res.status+(errBody?': '+errBody.substring(0,200):'')};}
    const data=await res.json();
    const meetLink=(data.conferenceData?.entryPoints||[]).find(p=>p.entryPointType==='video')?.uri||'';
    return{ok:true,eventId:data.id,htmlLink:data.htmlLink,meetLink};
  }catch(e){
    return{ok:false,error:e.message};
  }
}

async function updateGoogleCalendarEvent(eventId,changes){
  const token=await ensureGoogleToken();
  if(!token)return{ok:false,error:'Google Workspace not connected'};
  try{
    const res=await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,{
      method:'PATCH',
      headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify(changes)
    });
    if(!res.ok){const errBody=await res.text().catch(()=>'');return{ok:false,error:'Calendar update failed '+res.status+(errBody?': '+errBody.substring(0,200):'')};}
    return{ok:true};
  }catch(e){
    return{ok:false,error:e.message};
  }
}
async function deleteGoogleCalendarEvent(eventId){
  const token=await ensureGoogleToken();
  if(!token)return{ok:false,error:'Google Workspace not connected'};
  try{
    const res=await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,{
      method:'DELETE',
      headers:{'Authorization':'Bearer '+token}
    });
    if(!res.ok&&res.status!==404&&res.status!==410){const errBody=await res.text().catch(()=>'');return{ok:false,error:'Calendar delete failed '+res.status+(errBody?': '+errBody.substring(0,200):'')};}
    return{ok:true};
  }catch(e){
    return{ok:false,error:e.message};
  }
}

// ── Google Tasks — list/create/update/delete ─────────────────────────────────
// Uses the default task list ("@default") — this app doesn't manage multiple
// Google task lists, just the one the user sees in the Google Tasks app.
async function fetchGoogleTaskLists(){
  const token=await ensureGoogleToken();
  if(!token)return{ok:false,error:'Google Workspace not connected'};
  try{
    const res=await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=100',{
      headers:{'Authorization':'Bearer '+token}
    });
    if(!res.ok)return{ok:false,error:'Google Task lists API error '+res.status};
    const data=await res.json();
    return{ok:true,lists:data.items||[]};
  }catch(e){
    return{ok:false,error:e.message};
  }
}
async function fetchGoogleTasks(){
  const listsRes=await fetchGoogleTaskLists();
  if(!listsRes.ok)return listsRes;
  const token=await ensureGoogleToken();
  if(!token)return{ok:false,error:'Google Workspace not connected'};
  try{
    const lists=listsRes.lists.length?listsRes.lists:[{id:'@default'}];
    const perList=await Promise.all(lists.map(async list=>{
      const params=new URLSearchParams({showCompleted:'true',showHidden:'true',maxResults:'100'});
      const res=await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(list.id)}/tasks?`+params.toString(),{
        headers:{'Authorization':'Bearer '+token}
      });
      if(!res.ok)return[];
      const data=await res.json();
      return(data.items||[]).map(t=>({...t,_listId:list.id}));
    }));
    return{ok:true,tasks:perList.flat()};
  }catch(e){
    return{ok:false,error:e.message};
  }
}
async function createGoogleTask(title,notes,dueDate,listId){
  const token=await ensureGoogleToken();
  if(!token)return{ok:false,error:'Google Workspace not connected'};
  try{
    const body={title:title||'Untitled task',notes:notes||''};
    if(dueDate)body.due=new Date(dueDate+'T00:00:00Z').toISOString();
    const res=await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId||'@default')}/tasks`,{
      method:'POST',
      headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
    if(!res.ok){const errBody=await res.text().catch(()=>'');return{ok:false,error:'Google Task create failed '+res.status+(errBody?': '+errBody.substring(0,200):'')};}
    const data=await res.json();
    return{ok:true,taskId:data.id,listId:listId||'@default'};
  }catch(e){
    return{ok:false,error:e.message};
  }
}
async function updateGoogleTask(googleTaskId,changes,listId){
  const token=await ensureGoogleToken();
  if(!token)return{ok:false,error:'Google Workspace not connected'};
  try{
    const res=await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId||'@default')}/tasks/${encodeURIComponent(googleTaskId)}`,{
      method:'PATCH',
      headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify(changes)
    });
    if(!res.ok){
      if(res.status===404)return{ok:false,error:'not_found'};
      const errBody=await res.text().catch(()=>'');
      return{ok:false,error:'Google Task update failed '+res.status+(errBody?': '+errBody.substring(0,200):'')};
    }
    return{ok:true};
  }catch(e){
    return{ok:false,error:e.message};
  }
}
async function deleteGoogleTask(googleTaskId,listId){
  const token=await ensureGoogleToken();
  if(!token)return{ok:false,error:'Google Workspace not connected'};
  try{
    const res=await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId||'@default')}/tasks/${encodeURIComponent(googleTaskId)}`,{
      method:'DELETE',
      headers:{'Authorization':'Bearer '+token}
    });
    if(!res.ok&&res.status!==404)return{ok:false,error:'Google Task delete failed '+res.status};
    return{ok:true};
  }catch(e){
    return{ok:false,error:e.message};
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GOOGLE TASKS / CALENDAR TWO-WAY SYNC
// Push: hooked into SB.upsert/update/remove for the 'tasks' and 'cal_events'
// tables (see SB object above) — every local create/edit/delete already
// funnels through those three methods regardless of which view triggered it,
// so this is the one place that needs to know about Google instead of the
// 11+ call sites that create/edit tasks throughout the app.
// Pull: polled on an interval while the app is open (see startGoogleSyncLoop)
// plus once right after connecting. No server-side webhook exists for this
// app (it's a static site), so "vice versa" means "within ~90s", not instant.
//
// Calendar scope is intentionally narrower than Tasks: only plain events
// (no google_task_id-linked recurrence, and not events auto-generated by
// syncFaithToCalendar/_syncBillToCalendar/syncTaskToNoteBlock, which already
// have their own source-of-truth elsewhere) are pushed/pulled, so this
// doesn't fight with that existing derived-event system or send malformed
// recurrence data to Google.
// ═══════════════════════════════════════════════════════════════════════════
let _jelixSyncingFromGoogle=false;

async function _pushTaskToGoogle(task){
  if(_jelixSyncingFromGoogle||!isGoogleWorkspaceConnected()||isSyncTombstoned('tasks',task))return;
  _syncGmailTaskCompletion(task);
  try{
    if(!task.google_task_id){
      const r=await createGoogleTask(task.title,task.notes,task.due,task.google_task_list_id);
      if(r.ok){
        task.google_task_id=r.taskId;
        task.google_task_list_id=r.listId;
        _jelixSyncingFromGoogle=true;
        try{await SB.update('tasks',task.id,{google_task_id:r.taskId,google_task_list_id:r.listId},'tasks');}finally{_jelixSyncingFromGoogle=false;}
      }else{
        showToast('⚠ Couldn\'t push "'+task.title+'" to Google Tasks: '+r.error);
      }
    }else{
      const changes={title:task.title,notes:task.notes||'',status:task.status==='Done'?'needsAction':'needsAction'};
      if(task.status==='Done')changes.status='completed';
      if(task.due)changes.due=new Date(task.due+'T00:00:00Z').toISOString();
      const r=await updateGoogleTask(task.google_task_id,changes,task.google_task_list_id);
      if(!r.ok&&r.error==='not_found'){
        // Was deleted on Google's side between syncs — recreate it rather than
        // silently dropping the local task from sync forever.
        const r2=await createGoogleTask(task.title,task.notes,task.due,task.google_task_list_id);
        if(r2.ok){
          task.google_task_id=r2.taskId;
          task.google_task_list_id=r2.listId;
          _jelixSyncingFromGoogle=true;
          try{await SB.update('tasks',task.id,{google_task_id:r2.taskId,google_task_list_id:r2.listId},'tasks');}finally{_jelixSyncingFromGoogle=false;}
        }
      }else if(!r.ok){
        showToast('⚠ Couldn\'t update "'+task.title+'" on Google Tasks: '+r.error);
      }
    }
  }catch(e){console.error('[Google Tasks sync] push failed',e);}
}
async function _deleteGoogleTaskFor(task){
  if(_jelixSyncingFromGoogle||!isGoogleWorkspaceConnected()||!task||!task.google_task_id)return;
  try{
    const r=await deleteGoogleTask(task.google_task_id,task.google_task_list_id);
    if(!r.ok)showToast('⚠ Couldn\'t remove the linked task from Google Tasks: '+r.error);
  }catch(e){console.error('[Google Tasks sync] delete push failed',e);}
}

const CAL_SYNC_EXCLUDE=new Set(['_sourceFaithId','_billId','_isBill','_taskId','_isTask','_recurring']);
function _isSyncableCalEvent(ev){
  if(!ev)return false;
  for(const k of CAL_SYNC_EXCLUDE)if(ev[k])return false;
  // The real "Add Event" form always sets recur to the literal string 'none'
  // when no recurrence is picked (not '' or undefined) — checking truthiness
  // alone would exclude every normal one-off event, since 'none' is truthy.
  if(ev.recur&&ev.recur!=='none')return false;
  return true;
}
function _calEventToGoogle(ev){
  const notes=ev.notes||'';
  if(ev.time){
    const start=`${ev.date}T${ev.time}:00`;
    const end=ev.endTime?`${ev.date}T${ev.endTime}:00`:start;
    return{summary:ev.title,description:notes,start:{dateTime:start},end:{dateTime:end}};
  }
  return{summary:ev.title,description:notes,start:{date:ev.date},end:{date:ev.date}};
}
let _pendingMeetRequests=new Set();
async function _pushCalEventToGoogle(ev){
  if(_jelixSyncingFromGoogle||!isGoogleWorkspaceConnected()||!_isSyncableCalEvent(ev)||isSyncTombstoned('cal_events',ev))return;
  try{
    if(!ev.google_event_id){
      const wantMeet=_pendingMeetRequests.has(ev.id);
      _pendingMeetRequests.delete(ev.id);
      const g=_calEventToGoogle(ev);
      const r=await createGoogleCalendarEvent('primary',g.summary,g.start.dateTime||g.start.date,g.end.dateTime||g.end.date,g.description,wantMeet);
      if(r.ok){
        ev.google_event_id=r.eventId;
        const patch={google_event_id:r.eventId};
        // Store the Meet link in whichever of loc/notes is free rather than
        // adding a new Supabase column just for this — loc is usually empty
        // for a video-only meeting anyway, so it reads naturally as "where".
        if(r.meetLink){
          if(!ev.loc){ev.loc=r.meetLink;patch.loc=r.meetLink;}
          else{ev.notes=(ev.notes?ev.notes+'\n\n':'')+'🎥 Google Meet: '+r.meetLink;patch.notes=ev.notes;}
          showToast('✓ Google Meet link added');
        }
        _jelixSyncingFromGoogle=true;
        try{await SB.update('cal_events',ev.id,patch,'calEvents');}finally{_jelixSyncingFromGoogle=false;}
        if(typeof renderCalendar==='function'&&currentView==='calendar')renderCalendar();
      }else{
        showToast('⚠ Couldn\'t push "'+ev.title+'" to Google Calendar: '+r.error);
      }
    }else{
      const r=await updateGoogleCalendarEvent(ev.google_event_id,_calEventToGoogle(ev));
      if(!r.ok)showToast('⚠ Couldn\'t update "'+ev.title+'" on Google Calendar: '+r.error);
    }
  }catch(e){console.error('[Google Calendar sync] push failed',e);}
}
async function _deleteGoogleCalEventFor(ev){
  if(_jelixSyncingFromGoogle||!isGoogleWorkspaceConnected()||!ev||!ev.google_event_id)return;
  try{
    const r=await deleteGoogleCalendarEvent(ev.google_event_id);
    if(!r.ok)showToast('⚠ Couldn\'t remove the linked event from Google Calendar: '+r.error);
  }catch(e){console.error('[Google Calendar sync] delete push failed',e);}
}

// ── Sync visibility ───────────────────────────────────────────────────────
// A background poll failing (expired token, network blip, revoked access)
// used to be invisible unless someone read the console — surface it once
// per failure streak instead of every 90s, and always show the last time
// a full cycle actually succeeded so "is this even working" has an answer.
let _googleSyncErrorShown=false;
function _markGoogleSyncOk(){
  localStorage.setItem('j-google-last-sync',String(Date.now()));
  _googleSyncErrorShown=false;
  try{if(typeof renderGoogleSyncStatus==='function')renderGoogleSyncStatus();}catch(e){}
}
function _markGoogleSyncError(context,error){
  console.error('[Google sync] '+context,error);
  if(!_googleSyncErrorShown){
    _googleSyncErrorShown=true;
    showToast('⚠ Google sync ('+context+') failed: '+error+' — will keep retrying.');
  }
}
function getGoogleLastSyncText(){
  const raw=localStorage.getItem('j-google-last-sync');
  if(!raw)return isGoogleWorkspaceConnected()?'Not synced yet':'Not connected';
  const secs=Math.floor((Date.now()-parseInt(raw,10))/1000);
  if(secs<10)return'Synced just now';
  if(secs<60)return'Synced '+secs+'s ago';
  const mins=Math.floor(secs/60);
  if(mins<60)return'Synced '+mins+'m ago';
  const hrs=Math.floor(mins/60);
  return'Synced '+hrs+'h ago';
}
function renderGoogleSyncStatus(){
  const el=document.getElementById('googleSyncLastText');
  if(el)el.textContent=getGoogleLastSyncText();
}

async function pullGoogleTasks(){
  if(!isGoogleWorkspaceConnected())return;
  const r=await fetchGoogleTasks();
  if(!r.ok){_markGoogleSyncError('Tasks',r.error);return;}
  const uid=getAuthUserId();
  if(!uid)return;
  let changed=false;
  const seenGoogleIds=new Set();
  for(const gt of r.tasks){
    if(isSyncTombstoned('tasks',{google_task_id:gt.id})){
      deleteGoogleTask(gt.id,gt._listId||'@default').catch(()=>{});
      continue;
    }
    seenGoogleIds.add(gt.id);
    const local=DB.tasks.find(t=>t.google_task_id===gt.id);
    const wantStatus=gt.status==='completed'?'Done':null;
    if(local){
      const patch={};
      if(local.title!==gt.title)patch.title=gt.title;
      if(wantStatus&&local.status!==wantStatus)patch.status=wantStatus;
      if(Object.keys(patch).length){
        Object.assign(local,patch);
        _jelixSyncingFromGoogle=true;
        try{await SB.update('tasks',local.id,patch,'tasks');}finally{_jelixSyncingFromGoogle=false;}
        changed=true;
      }
    }else{
      const task={id:Date.now()+Math.floor(Math.random()*1000),title:gt.title||'Untitled task',world:'LIFE',priority:'Medium',
        status:wantStatus||'Todo',due:gt.due?gt.due.slice(0,10):'',platform:'',client:'',notes:gt.notes||'',subitems:[],
        timelineS:'',timelineE:'',numValue:null,connBoard:null,connItemId:null,groupId:null,
        google_task_id:gt.id,google_task_list_id:gt._listId||'@default'};
      DB.tasks.unshift(task);
      _jelixSyncingFromGoogle=true;
      try{await SB.upsert('tasks',task,'tasks');}finally{_jelixSyncingFromGoogle=false;}
      changed=true;
    }
  }
  // Deleted on Google's side since the last poll → remove locally too.
  const toRemove=DB.tasks.filter(t=>t.google_task_id&&!seenGoogleIds.has(t.google_task_id));
  for(const t of toRemove){
    DB.tasks=DB.tasks.filter(x=>x.id!==t.id);
    _jelixSyncingFromGoogle=true;
    try{await SB.remove('tasks',t.id,'tasks');}finally{_jelixSyncingFromGoogle=false;}
    changed=true;
  }
  _markGoogleSyncOk();
  if(changed){save('tasks');try{renderTasks();renderBrief();}catch(e){}}
}

async function pullGoogleCalendarEvents(){
  if(!isGoogleWorkspaceConnected())return;
  const r=await fetchGoogleCalendarEvents(100);
  if(!r.ok){_markGoogleSyncError('Calendar',r.error);return;}
  const uid=getAuthUserId();
  if(!uid)return;
  let changed=false;
  const seenGoogleIds=new Set();
  for(const ge of r.events){
    if(ge.status==='cancelled')continue;
    if(isSyncTombstoned('cal_events',{google_event_id:ge.id})){
      deleteGoogleCalendarEvent(ge.id).catch(()=>{});
      continue;
    }
    seenGoogleIds.add(ge.id);
    const local=DB.calEvents.find(e=>e.google_event_id===ge.id);
    const start=ge.start&&(ge.start.dateTime||ge.start.date);
    if(!start)continue;
    const date=start.slice(0,10);
    const time=ge.start.dateTime?start.slice(11,16):'';
    const endTime=ge.end&&ge.end.dateTime?ge.end.dateTime.slice(11,16):'';
    if(local){
      const patch={};
      if(local.title!==ge.summary)patch.title=ge.summary||local.title;
      if(local.date!==date)patch.date=date;
      if(local.time!==time)patch.time=time;
      if(Object.keys(patch).length){
        Object.assign(local,patch);
        _jelixSyncingFromGoogle=true;
        try{await SB.update('cal_events',local.id,patch,'calEvents');}finally{_jelixSyncingFromGoogle=false;}
        changed=true;
      }
    }else{
      const ev={id:Date.now()+Math.floor(Math.random()*1000),title:ge.summary||'Untitled event',date,time,endTime,
        type:'life',loc:ge.location||'',notes:ge.description||'',google_event_id:ge.id};
      DB.calEvents.unshift(ev);
      _jelixSyncingFromGoogle=true;
      try{await SB.upsert('cal_events',ev,'calEvents');}finally{_jelixSyncingFromGoogle=false;}
      changed=true;
    }
  }
  const toRemove=DB.calEvents.filter(e=>e.google_event_id&&!seenGoogleIds.has(e.google_event_id));
  for(const e of toRemove){
    DB.calEvents=DB.calEvents.filter(x=>x.id!==e.id);
    _jelixSyncingFromGoogle=true;
    try{await SB.remove('cal_events',e.id,'calEvents');}finally{_jelixSyncingFromGoogle=false;}
    changed=true;
  }
  _markGoogleSyncOk();
  if(changed){save('calEvents');try{renderCalendar();}catch(e){}}
}

let _googleSyncInterval=null;
function startGoogleSyncLoop(){
  if(_googleSyncInterval)return;
  if(!isGoogleWorkspaceConnected())return;
  pullGoogleTasks();
  pullGoogleCalendarEvents();
  pullStarredGmailTasks();
  _googleSyncInterval=setInterval(()=>{
    if(!isGoogleWorkspaceConnected())return;
    pullGoogleTasks();
    pullGoogleCalendarEvents();
    pullStarredGmailTasks();
  },90000);
}
document.addEventListener('DOMContentLoaded',()=>{
  if(isGoogleWorkspaceConnected())startGoogleSyncLoop();
});
// The full slash-command cheat sheet is genuinely useful as a placeholder on
// desktop, but it truncates mid-command on a phone-width input — swap to a
// short hint below that width instead of showing a cut-off command.
function _updateCaptureInputPlaceholder(){
  const el=document.getElementById('captureInput');
  if(!el)return;
  el.placeholder=window.innerWidth<480?'Type / for commands':'/cs /ih /build /faith /venture /debit 500 · /credit 1000';
}
document.addEventListener('DOMContentLoaded',_updateCaptureInputPlaceholder);
window.addEventListener('resize',_updateCaptureInputPlaceholder);

// ── Drive: write a file ─────────────────────────────────────────────────────
// Uses drive.file scope — this app can only see/manage files it creates itself,
// which is the least-privilege option and doesn't require Google verification.
async function writeGoogleDriveFile(fileName,content,mimeType,folderId){
  const token=await ensureGoogleToken();
  if(!token)return{ok:false,error:'Google Workspace not connected'};
  try{
    const metadata={name:fileName,mimeType:mimeType||'text/plain'};
    if(folderId)metadata.parents=[folderId];
    const boundary='jelix-'+Date.now();
    const body=
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`+
      `--${boundary}\r\nContent-Type: ${metadata.mimeType}\r\n\r\n${content}\r\n`+
      `--${boundary}--`;
    const res=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',{
      method:'POST',
      headers:{'Authorization':'Bearer '+token,'Content-Type':`multipart/related; boundary=${boundary}`},
      body
    });
    if(!res.ok){const errBody=await res.text().catch(()=>'');return{ok:false,error:'Drive write failed '+res.status+(errBody?': '+errBody.substring(0,200):'')};}
    const data=await res.json();
    return{ok:true,fileId:data.id};
  }catch(e){
    return{ok:false,error:e.message};
  }
}

async function setGeminiAPIKey(){
  showToast('ChatGPT is the only AI provider. Use the secure backend after signing in.');
}
async function setJelixAPIKey(){
  showToast('ChatGPT is the only AI provider. Use the secure backend after signing in.');
}


// ═══════════════════════════════════════════════════════════════════════════
// J.O.B. SECURITY ENGINE — PIN + WebAuthn Biometric
// ═══════════════════════════════════════════════════════════════════════════
let currentPinInput='';
function getSystemPin(){return localStorage.getItem('j-sys-pin')||'0000';}
function setSystemPin(p){localStorage.setItem('j-sys-pin',p);}

// ── Hardware keyboard PIN trap ──────────────────────────────────────────
// Single authoritative handler. rawPinInput is readonly — no oninput, no onkeydown.
// All digit capture happens here and ONLY here.
window.addEventListener('keydown',function(e){
  const ls=document.getElementById('lockScreen');
  if(!ls||ls.style.display==='none') return;
  // Don't fire if a modal or other input has focus
  const tag=(document.activeElement||{}).tagName;
  if(tag==='INPUT'||tag==='TEXTAREA') return;
  if(e.key>='0'&&e.key<='9'){
    e.preventDefault();
    e.stopImmediatePropagation();
    if(currentPinInput.length>=4) return;
    currentPinInput+=e.key;
    updatePinDisplay();
    _safeChime('chimeNotify');
    if(currentPinInput.length===4) _checkPin();
  } else if(e.key==='Backspace'){
    e.preventDefault();
    currentPinInput=currentPinInput.slice(0,-1);
    updatePinDisplay();
  } else if(e.key==='Escape'){
    clearPin();
  }
},true); // capture phase

// Mobile OS keypad fallback — only used when rawPinInput receives oninput
// (rawPinInput is readonly so this never fires from keyboard)
function handleRawPinInput(val){}

// Safe chime wrappers — chime functions load late in the file; never crash PIN
function _safeChime(fn){try{if(typeof window[fn]==='function')window[fn]();}catch(e){}}

function enterPin(num){
  if(currentPinInput.length>=4)return;
  currentPinInput+=String(num);
  updatePinDisplay();
  const raw=document.getElementById('rawPinInput');if(raw)raw.value=currentPinInput;
  _safeChime('chimeNotify');
  if(currentPinInput.length===4) _checkPin();
}
function _checkPin(){
  const correct=getSystemPin();
  if(currentPinInput===correct){
    clearPin();_safeChime('chimeSuccess');unlockSystem();
  }else{
    const display=document.getElementById('pinDisplay');
    const err=document.getElementById('pinError');
    if(display)display.style.animation='shake 0.4s';
    if(err){err.textContent='INCORRECT PIN';err.style.opacity='1';}
    _safeChime('chimeError');
    setTimeout(()=>{if(display)display.style.animation='';if(err)err.style.opacity='0';clearPin();},800);
  }
}
function clearPin(){
  currentPinInput='';
  const raw=document.getElementById('rawPinInput');if(raw)raw.value='';
  updatePinDisplay();
}
function updatePinDisplay(){
  const dots=document.querySelectorAll('.pin-dot');
  dots.forEach((dot,i)=>dot.classList.toggle('filled',i<currentPinInput.length));
}

let _osLoaded=false;
function unlockSystem(){
  const ls=document.getElementById('lockScreen');
  if(ls){
    ls.style.transition='opacity .3s';
    ls.style.opacity='0';
    setTimeout(()=>{ls.style.display='none';},300);
  }
  _safeChime('chimeSuccess');
  if(!_osLoaded){
    _osLoaded=true;
    // Straight into the OS — no boot sequence, no fake progress screen
    setTimeout(()=>{
      loadOS();
      setTimeout(initRealtime, 1200);
    },300);
  }
}

// WebAuthn — Face ID / Touch ID
async function triggerBiometric(){
  if(!window.PublicKeyCredential){
    showToast('⚠ Biometrics not supported on this device.');
    return;
  }
  const challenge=new Uint8Array(32);
  window.crypto.getRandomValues(challenge);
  try{
    const assertion=await navigator.credentials.get({
      publicKey:{
        challenge,
        rpId:window.location.hostname||'localhost',
        userVerification:'required',
        timeout:60000
      }
    });
    if(assertion){
      _safeChime('chimeSuccess');
      unlockSystem();
    }
  }catch(err){
    // Silent fail — user falls back to PIN
    console.warn('[J.O.B Systems] Biometric cancelled or failed:',err.message);
  }
}

// Auto-trigger biometric on lock screen load
document.addEventListener('DOMContentLoaded',()=>{
  // Render dynamic world navigation
  renderSideNav();
  if(typeof populateTaskWorldDropdown==='function')populateTaskWorldDropdown();
  // Built-in domain cards (Ideahub, Job Collectives, Creative Collectives,
  // FAITH, LIFE) are locked to their original fixed layout — no resize,
  // no drag, no shape presets. Clearing any leftover customization data
  // from when this was interactive, so nothing lingers half-applied.
  Object.keys(localStorage).forEach(k=>{
    if(k.startsWith('j-modsize-static-')||k.startsWith('j-staticorder-')||k.startsWith('j-staticgroup-'))localStorage.removeItem(k);
  });
  _initTextSelectionToolbar();
  _checkAutoMorningIntelligence();
  setInterval(_checkAutoMorningIntelligence,10*60*1000);
  // Make the Intelligence nav section drag-reorderable, restoring any saved order
  makeNavSectionSortable('navIntelligenceList','j-nav-intelligence-order');
  // Restore the floating timer badge if a timer was left running from a previous session
  renderFloatingTimerBadge();
  // Start the watchdog unconditionally — it's a no-op when nothing's running,
  // but guarantees the badge gets re-asserted every second regardless of any
  // edge case, rather than only watching once a timer happens to be active.
  _ensureDomainTimerTick();
  // Auto-trigger biometric on lock screen (first thing shown)
  if(localStorage.getItem('j-bio-enabled')==='true'){
    setTimeout(triggerBiometric,1000);
  }
  // Keyboard PIN entry support
  document.addEventListener('keydown',e=>{
    const ls=document.getElementById('lockScreen');
    if(!ls||ls.style.display==='none')return;
    if(e.key>='0'&&e.key<='9') enterPin(parseInt(e.key));
    if(e.key==='Backspace'||e.key==='Delete') clearPin();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS CONTROLLERS
// ═══════════════════════════════════════════════════════════════════════════
function updateSystemPin(){
  const input=document.getElementById('set-new-pin')?.value||'';
  if(/^\d{4}$/.test(input)){
    setSystemPin(input);
    document.getElementById('set-new-pin').value='';
    showToast('✓ System PIN updated.');
  }else{
    showToast('⚠ PIN must be exactly 4 digits.');
  }
}

function toggleBiometricSetting(){
  const enabled=localStorage.getItem('j-bio-enabled')==='true';
  localStorage.setItem('j-bio-enabled',enabled?'false':'true');
  const btn=document.getElementById('bioToggleBtn');
  if(btn)btn.innerHTML='<i class="ti ti-scan" style="font-size:var(--text-sm);line-height:1;display:inline-block;margin-right:5px"></i>'+(enabled?'Enable FaceID / TouchID':'Disable FaceID / TouchID');
  showToast(enabled?'Biometrics disabled on boot.':'✓ Biometrics enabled. Will prompt on boot.');
}

function saveKey(storageKey,inputId){
  showToast('Browser API keys are disabled. Use J.E.L.I.X through the secure backend.');return;
  const val=document.getElementById(inputId)?.value.trim()||'';
  if(val){localStorage.setItem(storageKey,val);showToast('✓ Key saved.');}
  else{localStorage.removeItem(storageKey);showToast('Key removed.');}
  // Refresh topbar key indicator
  const btn=document.getElementById('apiKeyBtn');
  if(btn&&storageKey==='job-api-key'){
    btn.style.color='var(--green)';btn.style.borderColor='var(--green)';btn.textContent='KEY ✓';
  }
}
async function clearLegacyBrowserAIKeys(){
  const confirmed=await jelixConfirm('Remove all AI provider keys saved in this browser?','Clear Legacy Keys');
  if(!confirmed)return;
  ['job-api-key','j-jelix-api-key','j-anthropic-key','j-gemini-key','j-gemini-model','jelix-openai-key','jelix-elevenlabs-key'].forEach(key=>localStorage.removeItem(key));
  showToast('Legacy browser AI keys cleared.');
  renderSettingsView();
}

// Legacy provider key entry points remain as no-op compatibility shims.
async function testAndSaveGeminiKey(){
  showToast('ChatGPT is the only AI provider. Use the secure backend after signing in.');
}

function exportLocalDB(){
  const data={};
  for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);data[k]=localStorage.getItem(k);}
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='JELIX_Backup_'+localDateStr(new Date())+'.json';
  a.click();
  showToast('✓ Backup downloaded.');
}

function importLocalDB(event){
  const file=event.target.files[0];
  if(!file)return;
  const reader=new FileReader();
  reader.onload=function(e){
    try{
      const data=JSON.parse(e.target.result);
      Object.keys(data).forEach(k=>localStorage.setItem(k,data[k]));
      showToast('✓ Database restored. Rebooting...');
      setTimeout(()=>location.reload(),1500);
    }catch(err){showToast('⚠ Invalid backup file.');}
  };
  reader.readAsText(file);
}

async function factoryReset(){
  if(await jelixConfirm('WARNING: This will wipe all local data, tasks, and settings. This cannot be undone. Proceed?','Wipe Everything')){
    localStorage.clear();
    showToast('Factory reset complete. Rebooting...');
    setTimeout(()=>location.reload(),1000);
  }
}

function renderWorldsSettings(){
  const grid=document.getElementById('mobileWorldsGrid');
  if(!grid)return;
  const worlds=DB.worlds||[];
  const makeCard=(w)=>{
    const c=(w.color&&/^#/.test(w.color))?w.color:('var('+(w.cssVar||'--teal')+')');
    const tasks=(DB.tasks||[]).filter(task=>task.world===w.id&&task.status!=='Done');
    const next=tasks.slice().sort((a,b)=>String(a.due||'9999').localeCompare(String(b.due||'9999')))[0];
    return`<button type="button" class="mobile-workspace-card" onclick="setView('${w.id}')" style="--workspace-accent:${c}">
      <i class="ti ${w.icon||'ti-star'}" aria-hidden="true"></i>
      <strong>${escapeHtml(w.label||w.name||w.id)}</strong>
      <small>${tasks.length} open task${tasks.length===1?'':'s'}</small>
      <span>${next?'Next: '+escapeHtml(next.title||'Untitled task'):'Workspace is clear'}</span>
    </button>`;
  };
  grid.innerHTML=worlds.map(w=>makeCard(w)).join('');
}
async function loadSecurityActivityLog(){
  const el=document.getElementById('securityActivityLog');
  if(!el)return;
  if(!isSignedIn()){el.innerHTML='Sign in to view activity.';return;}
  try{
    const rows=await sbFetch('auth_activity_log','GET',null,'limit=8');
    if(!rows||!rows.length){el.innerHTML='No activity logged yet.';return;}
    const iconFor=(evt,ok)=>{
      if(!ok)return{icon:'ti-alert-triangle',color:'var(--red)'};
      if(evt==='oauth_connect')return{icon:'ti-plug',color:'var(--green)'};
      if(evt==='oauth_refresh')return{icon:'ti-refresh',color:'var(--teal)'};
      return{icon:'ti-circle-check',color:'var(--text3)'};
    };
    el.innerHTML=rows.map(r=>{
      const{icon,color}=iconFor(r.event_type,r.success);
      const when=new Date(r.created_at).toLocaleString('en-PH',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
      const label=r.event_type==='oauth_connect'?'Google Workspace connect':r.event_type==='oauth_refresh'?'Google token refresh':r.event_type;
      return`<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
        <i class="ti ${icon}" style="color:${color};font-size:13px;flex-shrink:0"></i>
        <span style="flex:1;color:var(--text2)">${label}${r.success?'':' — failed'}${r.detail&&!r.success?' ('+r.detail.substring(0,40)+')':''}</span>
        <span style="color:var(--text3);flex-shrink:0">${when}</span>
      </div>`;
    }).join('');
  }catch(e){
    el.innerHTML='Couldn\'t load activity log: '+e.message;
  }
}
async function renderSettingsView(){
  const jobAiStatus=document.getElementById('jobAiStatus');
  if(jobAiStatus)jobAiStatus.innerHTML=isSignedIn()?'<i class="ti ti-circle-check" style="color:var(--green);margin-right:4px"></i>Signed in — J.E.L.I.X is ready after the Edge Function is deployed.':'<i class="ti ti-lock" style="margin-right:4px"></i>Sign in to use J.E.L.I.X.';
  if(typeof updateNotifPermStatus==='function')updateNotifPermStatus();
  const antKey=localStorage.getItem('job-api-key');
  const gemKey=localStorage.getItem('j-gemini-key');
  const oaiKey=localStorage.getItem('jelix-openai-key');
  const elKey=localStorage.getItem('jelix-elevenlabs-key');
  const antEl=document.getElementById('set-anthropic-key');
  const gemEl=document.getElementById('set-gemini-key');
  const oaiEl=document.getElementById('set-openai-key');
  const elEl=document.getElementById('set-elevenlabs-key');
  if(antEl&&antKey)antEl.placeholder='sk-ant-...'+antKey.slice(-6)+' (set)';
  if(gemEl&&gemKey)gemEl.placeholder='AIza...'+gemKey.slice(-6)+' (set)';
  if(elEl&&elKey)elEl.placeholder=elKey.substring(0,8)+'...'+elKey.slice(-4)+' (set)';
  if(oaiEl&&oaiKey)oaiEl.placeholder='sk-proj-...'+oaiKey.slice(-6)+' (set)';
  const gwsStatusEl=document.getElementById('googleWorkspaceStatus');
  if(gwsStatusEl){
    if(isGoogleWorkspaceConnected()){
      gwsStatusEl.innerHTML=`<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(0,255,136,.06);border:1px solid rgba(0,255,136,.25);border-radius:10px;margin-bottom:10px">
        <i class="ti ti-circle-check" style="color:var(--green);font-size:16px"></i>
        <div style="flex:1;min-width:0">
          <div style="font-size:var(--text-sm);color:var(--text1)">Connected — Calendar, Gmail, Drive, Tasks</div>
          <div id="googleSyncLastText" style="font-size:var(--text-xs);color:var(--text3);margin-top:2px">${getGoogleLastSyncText()}</div>
        </div>
        <button class="btn btn-d" style="font-size:var(--text-xs)" onclick="disconnectGoogleWorkspace()">Disconnect</button>
      </div>`;
    }else{
      gwsStatusEl.innerHTML=`<div style="font-size:var(--text-xs);color:var(--text3);margin-bottom:10px">Connects Calendar, Gmail, Drive, and Tasks directly into J.O.B Systems.</div>
      <button class="btn btn-t" onclick="connectGoogleWorkspace()"><i class="ti ti-brand-google"></i> Connect Google Account</button>`;
    }
  }
  loadSecurityActivityLog();
  renderAgentQueue();
  // Bio toggle button
  const bioBtn=document.getElementById('bioToggleBtn');
  if(bioBtn){
    const enabled=localStorage.getItem('j-bio-enabled')==='true';
    bioBtn.innerHTML='<i class="ti ti-scan" style="font-size:var(--text-sm);line-height:1;display:inline-block;margin-right:5px"></i>'+(enabled?'Disable FaceID / TouchID':'Enable FaceID / TouchID');
  }
  // PIN setup hint
  const hasPin=localStorage.getItem('j-sys-pin');
  const pinHint=document.getElementById('pinSetHint');
  if(pinHint)pinHint.textContent=hasPin?'PIN configured ✓':'PIN not set — using system default';
  renderSettingsWorldsList();
  loadPrefs();
  renderSystemHealth();
}

// ── Domains Management (Settings) ──────────────────────────────────────────
function renderSettingsWorldsList(){
  const el=document.getElementById('settingsWorldsList');if(!el)return;
  const worlds=DB.worlds||[];
  el.innerHTML=worlds.map((w,i)=>{
    const color=(w.color&&/^#/.test(w.color))?w.color:'var(--teal)';
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--navy3);border:1px solid var(--border);border-left:3px solid ${color};border-radius:12px">
      <i class="ti ${w.icon||'ti-star'}" style="color:${color};font-size:15px;flex-shrink:0"></i>
      <div style="flex:1;font-size:var(--text-sm);font-weight:600;color:var(--text1)">${w.label}</div>
      <span style="font-size:9px;color:var(--text3)">${(DB.notes||[]).filter(n=>n.worldId===w.id).length} notes</span>
      <button onclick="moveArrayItem('worlds','${w.id}',-1,renderSettingsWorldsList)" ${i===0?'disabled':''} style="background:transparent;border:none;color:var(--text3);cursor:pointer;padding:2px"><i class="ti ti-chevron-up" style="font-size:12px;line-height:1;display:block"></i></button>
      <button onclick="moveArrayItem('worlds','${w.id}',1,renderSettingsWorldsList)" ${i===worlds.length-1?'disabled':''} style="background:transparent;border:none;color:var(--text3);cursor:pointer;padding:2px"><i class="ti ti-chevron-down" style="font-size:12px;line-height:1;display:block"></i></button>
      <button onclick="openWorldModal('${w.id}')" style="background:transparent;border:none;color:var(--text3);cursor:pointer;padding:2px" title="Edit"><i class="ti ti-pencil" style="font-size:12px;line-height:1;display:block"></i></button>
      <button onclick="deleteWorld('${w.id}')" style="background:transparent;border:none;color:var(--red);cursor:pointer;padding:2px" title="Delete"><i class="ti ti-trash" style="font-size:12px;line-height:1;display:block"></i></button>
    </div>`;
  }).join('');
}

// ── Preferences (persisted, applied at boot) ────────────────────────────
const PREF_DEFAULTS={'pref-cal-view':'agenda','pref-board-view':'table','pref-landing-view':'dashboard','pref-voice-confirm':'on','pref-ai-provider':'chatgpt'};
function getTheme(){return document.documentElement.dataset.theme==='dark'?'dark':'light';}
function applyTheme(theme){
  const next=theme==='dark'?'dark':'light';
  document.documentElement.dataset.theme=next;
  localStorage.setItem('j-theme',next);
  const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=next==='dark'?'#111311':'#F5F5F3';
  const icon=document.getElementById('navThemeToggleIcon'),button=document.getElementById('navThemeToggleBtn');
  if(icon)icon.className=next==='dark'?'ti ti-sun':'ti ti-moon';
  if(button){const label=next==='dark'?'Switch to light mode':'Switch to dark mode';button.title=label;button.setAttribute('aria-label',label);}
}
function toggleTheme(){
  localStorage.setItem('j-theme-user-set','true');
  applyTheme(getTheme()==='dark'?'light':'dark');
  if(currentView==='life'&&typeof renderLife==='function')requestAnimationFrame(()=>renderLife());
  showToast(getTheme()==='dark'?'Dark mode on':'Light mode on');
}
applyTheme(document.documentElement.dataset.theme||'dark');
function savePref(id){
  const el=document.getElementById(id);if(!el)return;
  localStorage.setItem('j-'+id,el.value);
  showToast('✓ Preference saved');
}
function loadPrefs(){
  Object.keys(PREF_DEFAULTS).forEach(id=>{
    const el=document.getElementById(id);if(!el)return;
    el.value=localStorage.getItem('j-'+id)||PREF_DEFAULTS[id];
  });
}
function getPref(id){return localStorage.getItem('j-'+id)||PREF_DEFAULTS[id];}

// ── System Health (Settings diagnostic panel) ───────────────────────────
function renderSystemHealth(){
  const grid=document.getElementById('systemHealthGrid');if(!grid)return;
  const counts=[
    ['Tasks',DB.tasks?.length||0],
    ['Notes',DB.notes?.length||0],
    ['Cal Events',DB.calEvents?.length||0],
    ['Cashflow Txns',DB.cashflow?.length||0],
    ['Accounts',DB.accounts?.length||0],
    ['Clients',DB.clients?.length||0],
    ['Worlds',DB.worlds?.length||0],
    ['Build Apps',DB.buildApps?.length||0],
    ['Faith Activities',DB.faith?.length||0],
    ['Officers',DB.officers?.length||0],
    ['Collateral',DB.collateral?.length||0],
    ['Campaigns',DB.campaigns?.length||0],
  ];
  grid.innerHTML=counts.map(([label,count])=>`<div style="background:var(--navy3);border:1px solid var(--border);border-radius:12px;padding:10px 12px;text-align:center">
    <div style="font-size:18px;font-weight:800;color:var(--teal)">${count}</div>
    <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin-top:2px">${label}</div>
  </div>`).join('');
  // Estimate localStorage usage
  let bytes=0;
  try{for(const k in localStorage){if(localStorage.hasOwnProperty(k))bytes+=(localStorage[k]||'').length+k.length;}}catch(e){}
  const kb=(bytes/1024).toFixed(1);
  const footer=document.getElementById('systemHealthFooter');
  if(footer)footer.textContent=`Local storage: ~${kb} KB used · Supabase project: ${typeof SB_URL!=='undefined'?SB_URL.replace('https://','').split('.')[0]:'—'} · Last boot: ${new Date().toLocaleString('en-PH',{hour:'2-digit',minute:'2-digit',day:'numeric',month:'short'})}`;
}

// ===== DB =====
const DB={
  budget:JSON.parse(localStorage.getItem('j-budget')||'null')||{monthlyLimit:0},
  tasks:JSON.parse(localStorage.getItem('j-tasks')||'null')||[],
  clients:JSON.parse(localStorage.getItem('j-clients')||'null')||[],
  venture:JSON.parse(localStorage.getItem('j-venture')||'null')||[],
  notes:JSON.parse(localStorage.getItem('j-notes')||'null')||[],
  // Saved Links — a first-class content type alongside tasks/notes/events.
  // worldId null = sits in the Inbox until manually assigned to a Domain.
  savedLinks:JSON.parse(localStorage.getItem('j-savedLinks')||'null')||[],
  // Universal relations between any two of {task,note,event,link}. One row
  // per relation; read as bidirectional (a query checks both from_/to_ sides
  // for a given item) even though it's stored as a single directed row.
  itemLinks:JSON.parse(localStorage.getItem('j-itemLinks')||'null')||[],
  // Projects — a layer between Domain and item. Scoped to one Domain
  // (world_id), never crosses Domains. null project_id on a task/note/
  // event means "Unassigned" within that Domain, never invisible.
  projects:JSON.parse(localStorage.getItem('j-projects')||'null')||[],
  journal:JSON.parse(localStorage.getItem('j-journal')||'null')||[],
  memories:JSON.parse(localStorage.getItem('j-memories')||'null')||[],
  sides:JSON.parse(localStorage.getItem('j-sides')||'null')||[],
  collateral:JSON.parse(localStorage.getItem('j-collateral')||'null')||[],
  pipeline:JSON.parse(localStorage.getItem('j-pipeline')||'null')||[],
  creativeProjects:JSON.parse(localStorage.getItem('j-creativeProjects')||'null')||[],
  socialPosts:JSON.parse(localStorage.getItem('j-socialPosts')||'null')||[],
  campaigns:JSON.parse(localStorage.getItem('j-campaigns')||'null')||[],
  influencers:JSON.parse(localStorage.getItem('j-influencers')||'null')||[],
  pricing:JSON.parse(localStorage.getItem('j-pricing')||'null')||[],
  credentials:JSON.parse(localStorage.getItem('j-credentials')||'null')||[],
  faith:JSON.parse(localStorage.getItem('j-faith')||'null')||[],
  cashflow:JSON.parse(localStorage.getItem('j-cashflow')||'null')||[],
  accounts:JSON.parse(localStorage.getItem('j-accounts')||'null')||[],
  calEvents:JSON.parse(localStorage.getItem('j-calEvents')||'null')||[],
  history:JSON.parse(localStorage.getItem('j-history')||'null')||[],
  // ── JELIX Intelligence Layer tables (persisted same as core tables) ──
  captures:JSON.parse(localStorage.getItem('j-captures')||'null')||[],
  beliefs:JSON.parse(localStorage.getItem('j-beliefs')||'null')||[],
  decisions:JSON.parse(localStorage.getItem('j-decisions')||'null')||[],
  patterns:JSON.parse(localStorage.getItem('j-patterns')||'null')||[],
  weeklySynth:JSON.parse(localStorage.getItem('j-weeklySynth')||localStorage.getItem('j-weekly-synth')||'null')||[],
  connections:JSON.parse(localStorage.getItem('j-connections')||'null')||[],
  officers:JSON.parse(localStorage.getItem('j-officers')||'null')||[],
  faithTopics:JSON.parse(localStorage.getItem('j-faithTopics')||'null')||[],
  loans:JSON.parse(localStorage.getItem('j-loans')||'null')||[],

  meetings:JSON.parse(localStorage.getItem('j-meetings')||'null')||[],
  buildApps:JSON.parse(localStorage.getItem('j-buildApps')||'null')||[],
  bills:JSON.parse(localStorage.getItem('j-bills')||'[]'),
  worlds:JSON.parse(localStorage.getItem('j-worlds')||'null')||[
    {id:'venture',  label:'VENTURE',                icon:'ti-rocket',         color:'var(--w-venture)',    cssVar:'--w-venture',   core:true},
    {id:'build',    label:'BUILD',                  icon:'ti-code',           color:'var(--w-build)',      cssVar:'--w-build',     core:true},
    {id:'sides',    label:'SIDES',                  icon:'ti-palette',        color:'var(--w-sides)',      cssVar:'--w-sides',     core:true},
    {id:'faith',    label:'FAITH',                   icon:'ti-heart-handshake',color:'var(--w-faith)',      cssVar:'--w-faith',     core:true},
    {id:'life',     label:'LIFE',                    icon:'ti-leaf',           color:'var(--w-life)',       cssVar:'--w-life',      core:true},
  ],
};
function save(k){
  localStorage.setItem('j-'+k,JSON.stringify(DB[k]));
  if(k==='worlds')_syncWorldsToCloud();
}
// ── Domains (Worlds) cloud sync ───────────────────────────────────────────
// Was 100% local-only across all 29 save('worlds') call sites — nothing
// here ever reached Supabase. Domains are a small, human-paced-edit list
// (not thousands of rows like tasks), and each one can carry an open-ended
// bag of custom module data, so rather than diff/upsert per-field like the
// higher-volume tables, this does a full delete-and-reinsert of the whole
// list on every change: simplest correct way to guarantee the cloud copy
// exactly mirrors local state (including deletions) without needing to
// track per-row dirty state, at a scale where that's cheap to do.
let _worldsSyncInFlight=false;
async function _syncWorldsToCloud(){
  if(_worldsSyncInFlight)return; // last write wins; overlapping saves would race the delete+reinsert
  const uid=getAuthUserId();
  if(!uid)return; // not signed in — stays local-only until they are, same as everything else
  _worldsSyncInFlight=true;
  try{
    await sbFetch('worlds','DELETE',null,`user_id=eq.${uid}`);
    const rows=(DB.worlds||[]).map(w=>({id:w.id,user_id:uid,data:w}));
    if(rows.length)await sbFetch('worlds','POST',rows);
  }catch(err){
    showToast('⚠ Domains sync failed: '+err.message);
    console.error('_syncWorldsToCloud error',err);
  }finally{
    _worldsSyncInFlight=false;
  }
}
async function _pullWorldsFromCloud(){
  try{
    const rows=await sbFetch('worlds');
    if(rows&&rows.length){
      DB.worlds=rows.map(r=>r.data).filter(w=>w&&w.id!=='work-ih');
      localStorage.setItem('j-worlds',JSON.stringify(DB.worlds)); // skip save()'s own re-push, we just pulled this exact state
    }
  }catch(err){
    // Silent — same fallback-to-local pattern SB.load uses for every other table
  }
}
// One-time migration: your existing browser already has a saved worlds list
// (the seed array above only applies to a brand-new install) — this removes
// Chainsmoker from that saved list too, once, so it actually disappears from
// your nav instead of just the template. Its task/client/cashflow history is
// untouched; only the domain's nav entry goes away.
if((DB.worlds||[]).some(w=>w.id==='work-cs')){
  DB.worlds=DB.worlds.filter(w=>w.id!=='work-cs');
  save('worlds');
}
if((DB.worlds||[]).some(w=>w.id==='work-ih')){
  DB.worlds=DB.worlds.filter(w=>w.id!=='work-ih');
  save('worlds');
}

// ===== HISTORY =====
function addHistory(type,label,data){
  // Use structuredClone for deep snapshot — prevents reference mutations
  const snapshot=typeof structuredClone==='function'?structuredClone(data):JSON.parse(JSON.stringify(data));
  const e={id:Date.now(),type,label,data:snapshot,time:new Date().toISOString()};
  DB.history.unshift(e);if(DB.history.length>200)DB.history=DB.history.slice(0,200);
  save('history');SB.addHistory(e);
  if(type==='delete')showUndoToast(label,e.id);
  // Feed the learning engine
  LearnEngine.onHistory(type,label,data);
}

// ═══════════════════════════════════════════════════════════════════════════
// LEARN ENGINE — self-learning core
// Observes every DB write, agent message, navigation, and command.
// Extracts patterns, preferences, and decisions → persists to Supabase memories.
// ═══════════════════════════════════════════════════════════════════════════
const LearnEngine = {
  // Session accumulators
  _session: {
    navCounts: {},       // view → count this session
    taskWorlds: {},      // world → tasks created this session
    taskStatuses: [],    // {title, status, world} completions
    agentMessages: [],   // {agent, text, ts}
    voiceCommands: [],   // raw voice commands
    captureTexts: [],    // raw capture inputs
    startTime: Date.now()
  },
  // Debounce timer for batched Supabase writes
  _debounceTimer: null,

  // ── Triggered by addHistory ────────────────────────────────────────────
  onHistory(type, label, data){
    if(!data) return;
    const world = data.world || data._dbKey || '';
    // Task completions — high signal
    if(type === 'edit' && data.status === 'Done'){
      this._session.taskStatuses.push({title: data.title, world, ts: Date.now()});
      this._learn(`Completed task: "${data.title}"`, 'Task Pattern', world || 'WORK-IH');
    }
    // Task creation
    if(type === 'add' && data._dbKey === 'tasks'){
      this._session.taskWorlds[world] = (this._session.taskWorlds[world] || 0) + 1;
      // Learn priority preference if High is set
      if(data.priority === 'High'){
        this._learn(`Frequently creates High priority tasks in ${world}`, 'Priority Pattern', world || 'WORK-IH');
      }
    }
    // Client edits — brand/preference signals
    if((type === 'add' || type === 'edit') && data._dbKey === 'clients'){
      if(data.desc) this._learn(`Client "${data.name}": ${data.desc}`, 'Brand', 'WORK-IH');
    }
    // Venture partner onboarding
    if(type === 'add' && data._dbKey === 'venture' && data.type === 'Partner/VA'){
      if(data.specialty) this._learn(`Onboarded VA "${data.name}" — specialty: ${data.specialty}${data.rate ? ', $'+data.rate+'/hr' : ''}`, 'Organizational', 'VENTURE');
    }
    // Cash flow — spending pattern
    if((type === 'add') && data._dbKey === 'cashflow'){
      if(data.type === 'Credit' && data.amount > 1000){
        this._learn(`Large expense: ₱${data.amount} — ${data.desc || data.category || 'uncategorized'}`, 'Financial Pattern', 'LIFE');
      }
    }
  },

  // ── Triggered by setView (navigation) ─────────────────────────────────
  onNavigate(view){
    this._session.navCounts[view] = (this._session.navCounts[view] || 0) + 1;
    // After 3 visits to the same view in one session — note the pattern
    if(this._session.navCounts[view] === 3){
      const label = view.replace(/-/g,' ').toUpperCase();
      this._learn(`Frequently visits ${label} view`, 'Navigation Pattern', _viewToWorld(view));
    }
  },

  // ── Triggered by agent chat (sendAI) ──────────────────────────────────
  onAgentMessage(agentId, text){
    if(!text || text.length < 8) return;
    this._session.agentMessages.push({agent: agentId, text: text.substring(0,200), ts: Date.now()});
    // Preference signals in agent messages
    const lower = text.toLowerCase();
    const prefSignals = [
      {re:/\bi (prefer|always|never|like|hate|want|need)\b/i, cat:'Agent Preference'},
      {re:/\bmy (rule|policy|process|approach|style)\b/i,     cat:'Process'},
      {re:/\bremember (that|this|to|my)\b/i,                  cat:'General'},
      {re:/\bdon'?t (ever|always|forget|use|include)\b/i,     cat:'Agent Preference'},
      {re:/\b(important|critical|key|must|always) [a-z]/i,    cat:'Process'},
    ];
    for(const sig of prefSignals){
      if(sig.re.test(lower)){
        this._learn(text.substring(0,140), sig.cat, null);
        break; // one memory per message max
      }
    }
  },

  // ── Triggered by voice commands ────────────────────────────────────────
  onVoiceCommand(raw){
    if(!raw) return;
    this._session.voiceCommands.push(raw);
    // After 5 voice commands — note voice usage pattern
    if(this._session.voiceCommands.length === 5){
      this._learn('Uses voice commands regularly — keep TTS responses concise and actionable', 'Agent Preference', 'WORK-IH');
    }
  },

  // ── Triggered by CMD/Capture ───────────────────────────────────────────
  onCapture(text){
    if(!text || text.length < 5) return;
    this._session.captureTexts.push(text);
  },

  // ── End-of-session digest (called on boot / 30-min idle) ──────────────
  generateSessionDigest(){
    const msgs = this._session.agentMessages.length;
    const navTop = Object.entries(this._session.navCounts).sort((a,b)=>b[1]-a[1])[0];
    const taskTop = Object.entries(this._session.taskWorlds).sort((a,b)=>b[1]-a[1])[0];
    const done = this._session.taskStatuses.length;
    if(msgs + done + (navTop?1:0) < 2) return; // not enough signal

    const parts = [];
    if(navTop && navTop[1] > 1) parts.push(`Focused on ${navTop[0].replace(/-/g,' ').toUpperCase()} this session (${navTop[1]} visits)`);
    if(taskTop && taskTop[1] > 1) parts.push(`Created ${taskTop[1]} tasks in ${taskTop[0]}`);
    if(done > 0) parts.push(`Completed ${done} task${done>1?'s':''}: ${this._session.taskStatuses.map(t=>'"'+t.title+'"').slice(0,3).join(', ')}`);
    if(msgs > 0) parts.push(`Chatted with agents ${msgs} time${msgs>1?'s':''} this session`);

    if(parts.length > 0){
      this._learn('Session digest: ' + parts.join('. '), 'Session Pattern', 'WORK-IH');
    }
    // Reset session
    this._session = {navCounts:{}, taskWorlds:{}, taskStatuses:[], agentMessages:[], voiceCommands:[], captureTexts:[], startTime: Date.now()};
  },

  // ── Core: deduplicate, persist, and surface ─────────────────────────────
  _learn(memory, category, world){
    if(!memory || memory.length < 8) return;
    // Deduplicate — skip if very similar memory exists in last 50
    const existing = (DB.memories || []).slice(0, 50);
    const norm = memory.toLowerCase().replace(/\W/g,' ').trim();
    const dupe = existing.some(m => {
      const mn = (m.memory||'').toLowerCase().replace(/\W/g,' ').trim();
      return mn.length > 10 && (mn.includes(norm.substring(0,40)) || norm.includes(mn.substring(0,40)));
    });
    if(dupe) return;

    const m = {
      id: Date.now() + Math.floor(Math.random()*1000),
      memory: memory.substring(0, 200),
      category: category || 'General',
      world: world || 'WORK-IH',
      date: localDateStr(new Date()),
      source: 'auto' // distinguishes auto-learned from manually added
    };
    if(!DB.memories) DB.memories = [];
    DB.memories.unshift(m);
    if(DB.memories.length > 500) DB.memories = DB.memories.slice(0, 500);
    save('memories');
    // Debounced Supabase write — batch rapid-fire events
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      SB.upsert('memories', m, 'memories');
    }, 2000);
    // Silently update memory badge in agent chat if open
    const mc = document.getElementById('agentMemCount');
    if(mc){
      mc.textContent = (DB.memories||[]).length;
    }
  },

  // ── New learnings since last brief (for morning digest) ─────────────────
  getRecentLearnings(since){
    return (DB.memories||[]).filter(m=>m.source==='auto' && m.date >= since).slice(0,10);
  }
};

// ── Wire LearnEngine into navigation ──────────────────────────────────────
function _viewToWorld(v){
  const m={'work-ih':'WORK-IH','work-cs':'WORK-CS',venture:'VENTURE',build:'BUILD',sides:'SIDES',faith:'FAITH',life:'LIFE'};
  return m[v]||'LIFE';
}
function showUndoToast(label,hid){showToast('Deleted: '+label.substring(0,40),true,()=>restoreFromHistory(hid));}
function restoreFromHistory(hid){
  const e=DB.history.find(h=>h.id===hid);if(!e||e.type!=='delete')return;
  const snap=e.data;
  const key=snap._dbKey;
  if(!key||!DB[key]){showToast('Cannot restore: unknown table');return;}
  // Deep clone the snapshot before reinserting to prevent future mutations
  const restored=typeof structuredClone==='function'?structuredClone(snap):JSON.parse(JSON.stringify(snap));
  delete restored._dbKey;
  // Check if it already exists (avoid duplicates on double-restore)
  const exists=DB[key].some(x=>x.id===restored.id);
  if(!exists){
    DB[key].unshift(restored);
    save(key);
    const sbTable=key==='calEvents'?'cal_events':key;
    SB.upsert(sbTable,restored,key);
  }
  // Targeted re-render — only update the affected view, not everything
  const viewMap={tasks:renderTasks,clients:renderWorkIH,venture:renderVenture,faith:renderFaith,cashflow:renderLife,calEvents:renderCalendar,captures:()=>{},beliefs:()=>{},decisions:()=>{},notes:renderNotesList,sides:renderSides,officers:renderOfficers,faithTopics:renderFaithTopics,memories:renderMemory};
  if(viewMap[key])viewMap[key]();
  renderHistory();
  showToast('✓ Restored: '+e.label.substring(0,40));
}
function renderHistory(){
  const f=document.getElementById('histFilter')?.value||'all';
  const items=DB.history.filter(h=>f==='all'||h.type===f);
  const body=document.getElementById('historyBody');
  if(!items.length){body.innerHTML='<div style="font-size:var(--text-xs);color:var(--text3);text-align:center;padding:30px">No activity yet.</div>';return;}
  const tc={add:'var(--green)',edit:'var(--teal)',delete:'var(--red)',navigate:'var(--text3)',voice:'var(--purple)'};
  const ti={add:'ti-plus',edit:'ti-pencil',delete:'ti-trash',navigate:'ti-arrow-right',voice:'ti-microphone'};
  body.innerHTML=items.map(h=>{
    const d=new Date(h.time);const ts=d.toLocaleString('en-PH',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:true,timeZone:'Asia/Manila'});
    return`<div class="hitem"><div class="hicon" style="background:rgba(0,0,0,.3);border:1px solid var(--border);color:${tc[h.type]||'var(--text3)'}"><i class="ti ${ti[h.type]||'ti-activity'}" style="font-size:var(--text-xs);line-height:1;display:block"></i></div><div style="flex:1"><div class="hlabel">${h.label}</div><div class="htime">${ts} · <span style="color:${tc[h.type]||'var(--text3)'}">${h.type.toUpperCase()}</span></div></div>${h.type==='delete'?`<button class="hrestore" onclick="restoreFromHistory(${h.id})"><i class="ti ti-rotate-clockwise" style="display:inline;margin-right:3px"></i>Restore</button>`:''}</div>`;
  }).join('');
}
function clearHistory(){DB.history=[];save('history');renderHistory();showToast('History cleared');}

// ===== CLOCK / WEATHER =====
// calYear/calMonth now managed by calendar engine above
function updateClock(){
  const n=new Date();
  document.getElementById('topClock').textContent=n.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:'Asia/Manila'});
  document.getElementById('topDate').textContent=n.toLocaleDateString('en-PH',{weekday:'short',month:'short',day:'numeric',timeZone:'Asia/Manila'}).toUpperCase();
  const hr=parseInt(n.toLocaleTimeString('en-PH',{hour:'2-digit',hour12:false,timeZone:'Asia/Manila'}));
  const GREETINGS={
    night:['Good evening, Justine'],
    morning:['Good morning, Justine'],
    afternoon:['Good afternoon, Justine'],
    evening:['Good evening, Justine'],
  };
  const daydSeed=parseInt(localDateStr(new Date()).replace(/-/g,''));
  const pick=arr=>arr[daydSeed%arr.length];
  const period=hr<5?'night':hr<12?'morning':hr<18?'afternoon':'evening';
  const timeGreeting=pick(GREETINGS[period]);
  const greetEl=document.getElementById('briefGreeting');
  if(greetEl)greetEl.textContent=timeGreeting;
  const subEl=document.getElementById('briefSub');
  if(subEl)subEl.textContent="You're building something that matters. Stay focused, take aligned action.";
  const it=document.getElementById('initTime');if(it&&!it.textContent)it.textContent=n.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:'Asia/Manila'});
  // Topbar ticker — time + date
  const tt=document.getElementById('tickerTime');if(tt)tt.textContent=n.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true,timeZone:'Asia/Manila'});
  const td=document.getElementById('tickerDate');if(td)td.textContent=n.toLocaleDateString('en-PH',{weekday:'short',month:'short',day:'numeric',timeZone:'Asia/Manila'});
  // Mobile header
  const mt=document.getElementById('mobileTime');if(mt)mt.textContent=n.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:'Asia/Manila'});
  const md=document.getElementById('mobileDate');if(md)md.textContent=n.toLocaleDateString('en-PH',{weekday:'short',month:'short',day:'numeric',timeZone:'Asia/Manila'});
}
setInterval(updateClock,1000);updateClock();
async function fetchWeather(){
  try{
    const r=await fetch('https://api.open-meteo.com/v1/forecast?latitude=14.4500&longitude=120.9830&current_weather=true&temperature_unit=celsius');
    const d=await r.json();
    const temp=Math.round(d.current_weather.temperature);
    document.getElementById('weatherText').textContent=temp+'°C · Local';
    const tw=document.getElementById('tickerWeather');if(tw)tw.innerHTML='<i class="ti ti-cloud" style="font-size:10px;vertical-align:middle"></i> '+temp+'°C Local';
    const mw=document.getElementById('mobileWeather');if(mw)mw.innerHTML='<i class="ti ti-cloud" style="font-size:11px"></i>'+temp+'°C';
  }catch(e){
    document.getElementById('weatherText').textContent='-- °C';
    const tw=document.getElementById('tickerWeather');if(tw)tw.innerHTML='<i class="ti ti-cloud" style="font-size:10px;vertical-align:middle"></i> -- °C';
    const mw=document.getElementById('mobileWeather');if(mw)mw.innerHTML='<i class="ti ti-cloud" style="font-size:11px"></i>-- °C';
  }
}
fetchWeather();setInterval(fetchWeather,600000);

function getTaskAttentionScore(task,today){
  if(!task||task.status==='Done')return -1;
  let score=0;
  if(task.due&&task.due<today)score+=100;
  else if(task.due===today)score+=80;
  else if(task.due&&task.due<=localDateStr(new Date(Date.now()+3*86400000)))score+=45;
  if(task.status==='No Progress')score+=30;
  if(task.priority==='High')score+=25;
  else if(task.priority==='Medium')score+=10;
  if(!task.due)score+=5;
  return score;
}
function getAttentionTasks(limit=6){
  const today=localDateStr(new Date());
  return (DB.tasks||[]).filter(t=>t.status!=='Done')
    .map((task,index)=>({task,index,score:getTaskAttentionScore(task,today)}))
    .sort((a,b)=>b.score-a.score||a.index-b.index)
    .slice(0,limit).map(x=>x.task);
}
function renderReviewView(){
  const body=document.getElementById('reviewBody');if(!body)return;
  const today=localDateStr(new Date());
  const openTasks=(DB.tasks||[]).filter(t=>t.status!=='Done');
  const overdue=openTasks.filter(t=>t.due&&t.due<today);
  const dueToday=openTasks.filter(t=>t.due===today);
  const captures=(DB.captures||[]).filter(c=>c.status==='inbox');
  const unassigned=typeof _getInboxItems==='function'?_getInboxItems():[];
  const attention=getAttentionTasks(5);
  const lastReview=localStorage.getItem('j-last-review');
  const reviewedToday=lastReview===today;
  const esc=value=>typeof escapeHtml==='function'?escapeHtml(String(value??'')):String(value??'');
  const boards=getBoards();
  const rhythm=readReviewRhythmState(today,{captures:captures.length===0,actions:attention.length>0,plan:reviewedToday});
  const rhythmSteps=[
    {id:'captures',label:'Clear captures',done:rhythm.captures},
    {id:'calendar',label:'Review calendar',done:rhythm.calendar},
    {id:'actions',label:'Choose next actions',done:rhythm.actions},
    {id:'plan',label:'Plan the week',done:rhythm.plan},
  ];
  const rhythmDone=rhythmSteps.filter(step=>step.done).length;
  const rhythmProgress=Math.round((rhythmDone/rhythmSteps.length)*100);
  const taskRows=attention.map(task=>{
    const state=task.due&&task.due<today?'Overdue':task.due===today?'Due today':task.status==='No Progress'?'Blocked':task.priority||'Open';
    const domain=boards.find(board=>board.id===String(task.world||'').toUpperCase())?.name||task.world||'Personal';
    const stateClass=state==='Overdue'?'danger':state==='Blocked'?'warning':'neutral';
    return `<div class="os-review-item">
      <button class="os-review-check" type="button" aria-label="Open ${esc(task.title||'task')}" onclick="editTask(${JSON.stringify(task.id)})"><i class="ti ti-check"></i></button>
      <div class="os-review-item-copy"><strong>${esc(task.title||'Untitled task')}</strong><span>${esc(domain)}${task.due?' · '+formatTaskTableDate(task.due):''}</span></div>
      <span class="os-review-state ${stateClass}">${esc(state)}</span>
      <button class="os-review-open" type="button" onclick="editTask(${JSON.stringify(task.id)})">Open <i class="ti ti-chevron-right"></i></button>
    </div>`;
  }).join('');
  const captureRows=captures.slice(0,3).map(c=>`<div class="review-capture-row"><i class="ti ti-inbox"></i><span>${esc(c.content||'Untitled capture')}</span></div>`).join('');
  const rhythmRows=rhythmSteps.map(step=>`<button class="review-rhythm-row${step.done?' complete':''}" type="button" onclick="toggleReviewRhythmStep('${step.id}')"><span><i class="ti ti-check"></i></span><strong>${step.label}</strong></button>`).join('');
  body.innerHTML=`
    <div class="os-review-grid">
      <article class="os-review-stat"><div class="os-review-stat-icon danger"><i class="ti ti-alert-triangle"></i></div><div><span>Overdue tasks</span><strong>${overdue.length}</strong><small>${overdue.length?'Needs a clear decision':'No pressure carried forward'}</small></div></article>
      <article class="os-review-stat"><div class="os-review-stat-icon"><i class="ti ti-calendar-event"></i></div><div><span>Due today</span><strong>${dueToday.length}</strong><small>${dueToday.length?'Protect time for these':'Today has breathing room'}</small></div></article>
      <article class="os-review-stat"><div class="os-review-stat-icon"><i class="ti ti-inbox"></i></div><div><span>Unprocessed captures</span><strong>${captures.length}</strong><small>${captures.length?'Route these before they linger':'Your capture inbox is clear'}</small></div></article>
    </div>
    <section class="os-review-reset">
      <div class="os-review-reset-marker"><i class="ti ti-refresh"></i></div>
      <div class="os-review-reset-copy"><span>${reviewedToday?'Review complete':'Weekly reset'}</span><h2>${reviewedToday?'Clarity restored for today':'Start with the open loops'}</h2><p>${reviewedToday?'Revisit this space whenever plans change.':'Resolve the few items most likely to create pressure later.'}</p></div>
      <div class="os-review-actions"><button class="btn btn-t" onclick="setView('ai');setTimeout(()=>qp('Help me complete my daily review'),100)"><i class="ti ti-sparkles"></i> Ask J.E.L.I.X.</button><button class="btn btn-g" onclick="setView('calendar')"><i class="ti ti-calendar"></i> Open schedule</button><button class="btn btn-g" onclick="setView('tasks')"><i class="ti ti-list-check"></i> Open tasks</button></div>
    </section>
    <div class="os-review-columns">
      <section class="os-review-panel os-review-next"><div class="os-review-panel-head"><div><span>Priority queue</span><h2>Next actions</h2></div><button type="button" onclick="setView('tasks')">View all <i class="ti ti-arrow-up-right"></i></button></div><div class="os-review-list">${taskRows||'<div class="os-review-empty"><i class="ti ti-circle-check"></i><strong>No open tasks</strong><span>Protect the clear space or capture the next useful thing.</span></div>'}</div></section>
      <div class="os-review-side-stack">
        <section class="os-review-panel review-capture-card"><div class="os-review-panel-head"><div><span>Inbox</span><h2>Capture triage</h2></div><strong class="review-panel-count">${captures.length}</strong></div><p>${captures.length?'Process these before they become background noise.':'Nothing is waiting for classification.'}</p><div class="review-capture-list">${captureRows||'<div class="review-capture-clear"><i class="ti ti-circle-check"></i> Inbox is clear</div>'}</div><button class="review-panel-action" type="button" onclick="setView('${captures.length?'jarvis-capture':'inbox'}')">${captures.length?'Triage captures':'Open inbox'} <i class="ti ti-arrow-right"></i></button>${unassigned.length?`<button class="review-unsorted-link" type="button" onclick="setView('inbox')">${unassigned.length} unsorted item${unassigned.length===1?'':'s'} still need a Domain</button>`:''}</section>
        <section class="os-review-panel review-rhythm-card"><div class="os-review-panel-head"><div><span>System</span><h2>Review rhythm</h2></div><strong class="review-panel-count">${rhythmProgress}%</strong></div><div class="review-rhythm-list">${rhythmRows}</div><div class="review-progress"><span style="width:${rhythmProgress}%"></span></div><div class="review-rhythm-next"><span>Next scheduled review</span><strong>${getNextWeeklyReviewLabel()}</strong></div></section>
      </div>
    </div>`;
}
function reviewRhythmKey(dateStr){return'j-review-rhythm-'+dateStr;}
function readReviewRhythmState(dateStr,defaults={}){
  let saved={};
  try{saved=JSON.parse(localStorage.getItem(reviewRhythmKey(dateStr))||'{}')||{};}catch(e){saved={};}
  return{captures:saved.captures??!!defaults.captures,calendar:saved.calendar??false,actions:saved.actions??!!defaults.actions,plan:saved.plan??!!defaults.plan};
}
function toggleReviewRhythmStep(step){
  const today=localDateStr(new Date());
  const state=readReviewRhythmState(today);
  state[step]=!state[step];
  localStorage.setItem(reviewRhythmKey(today),JSON.stringify(state));
  renderReviewView();
}
function getNextWeeklyReviewLabel(){
  const next=new Date();
  const days=(7-next.getDay())%7;
  if(days===0&&next.getHours()>=22)next.setDate(next.getDate()+7);else next.setDate(next.getDate()+days);
  next.setHours(22,0,0,0);
  return next.toLocaleDateString('en-PH',{weekday:'long',month:'short',day:'numeric'})+' · 10:00 PM';
}
function markReviewDone(){
  const today=localDateStr(new Date());
  localStorage.setItem('j-last-review',today);
  const state=readReviewRhythmState(today);
  state.plan=true;
  localStorage.setItem(reviewRhythmKey(today),JSON.stringify(state));
  renderReviewView();
  showToast('✓ Review marked complete for today');
}

// ===== VIEWS =====
let currentView='dashboard';
function setView(v){
  if(v==='work-ih'){
    showToast('Ideahub has been retired from your OS.');
    v='dashboard';
  }
  // Same fix as the Edit/View toggle: a resize's save is debounced 400ms, so
  // navigating away right after resizing (before that timer fires) would
  // otherwise lose it — the next visit reads the old pre-resize shape.
  _flushPendingShapeSaves();
  document.querySelectorAll('.view').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===v));
  let el=document.getElementById('view-'+v);
  // Custom domains (added via + Add Domain) have no dedicated view element —
  // route them into the generic modular domain view instead of going blank.
  const isCustomDomain=!el&&(DB.worlds||[]).some(w=>w.id===v);
  if(isCustomDomain)el=document.getElementById('view-domain-generic');
  if(el)el.classList.add('active');
  currentView=v;addHistory('navigate','Navigated to '+v,{view:v});
  LearnEngine.onNavigate(v);
  renderSideNav();
  const r={dashboard:renderBrief,capture:renderMobileCaptureView,review:renderReviewView,'work-ih':renderWorkIH,'work-cs':renderWorkCS,venture:renderVenture,build:renderBuild,sides:renderSides,faith:renderFaith,life:renderLife,finances:()=>{if(typeof window.renderMobileFinances==='function')window.renderMobileFinances();},calendar:renderCalendar,tasks:renderTasks,notes:renderNotesList,journal:renderJournal,memory:renderMemory,history:renderHistory,settings:renderSettingsView,'worlds-settings':renderWorldsSettings,links:renderLinksView,inbox:()=>{if(typeof renderInboxView==='function')renderInboxView();},'all-files':()=>{if(typeof renderAllFilesView==='function')renderAllFilesView();}};
  if(v==='life'){renderLife();}
  else if(v==='biomonitor'){setView('life');setTimeout(()=>{const btns=document.querySelectorAll('.cfbt');btns.forEach(b=>{if(b.textContent.includes('Bio Monitor')){setCFTab('biomonitor',b);}});},150);}
  else if(isCustomDomain)renderDomainGenericView(v);
  else if(r[v])r[v]();
  // Sync mobile bottom-nav active state
  syncMobileNavActive(v);
  // Scroll the active view to top
  if(el){const vb=el.querySelector('.vb');if(vb)vb.scrollTop=0;}
}

// ═══════════════════════════════════════════════════════════════════════════
// MOBILE BOTTOM NAV — switch view + highlight active tab
// ═══════════════════════════════════════════════════════════════════════════
function mobileNav(view, tabEl){
  // Close the More menu if open
  const moreMenu=document.getElementById('mobileMoreMenu');
  if(moreMenu && !moreMenu.classList.contains('hidden')){
    moreMenu.classList.add('hidden');
  }
  setView(view);
  // Highlight the tapped tab (or the matching fixed tab)
  syncMobileNavActive(view);
}
function mobileCaptureNav(tabEl){
  mobileNav('capture',tabEl);
  setTimeout(()=>document.getElementById('mobileCaptureInput')?.focus(),80);
}

function syncMobileNavActive(view){
  const nav=document.getElementById('mobileBottomNav');
  if(!nav) return;
  const tabMap={
    'life':'mbt-workspaces',
    'tasks':'mbt-tasks',
    'capture':'mbt-workspaces',
    'dashboard':'mbt-dashboard',
    'calendar':'mbt-calendar',
    'finances':'mbt-finances',
    'review':'mbt-workspaces',
    'settings':'mbt-workspaces',
    'memory':'mbt-workspaces',
    'notes':'mbt-workspaces',
    'inbox':'mbt-workspaces',
    'all-files':'mbt-workspaces',
    'jarvis-context':'mbt-workspaces',
    'worlds-settings':'mbt-workspaces',
  };
  nav.querySelectorAll('.mbn-tab,.mbn-center').forEach(t=>t.classList.remove('active'));
  const center=document.getElementById('mbt-dashboard');
  if(center){center.style.background='';center.style.boxShadow='';}
  const id=tabMap[view];
  if(!id) return;
  const tab=document.getElementById(id);
  if(tab){
    tab.classList.add('active');
  }
}

function renderMobileWorldMenu(){
  const grid=document.getElementById('mobileWorldMenuItems');
  if(!grid)return;
  grid.replaceChildren();
  const colors=['mmm-cell-teal','mmm-cell-orange','mmm-cell-green','mmm-cell-amber','mmm-cell-blue','mmm-cell-purple'];
  const icons=['ti-briefcase','ti-rocket','ti-code','ti-coins','ti-leaf','ti-star'];
  (DB.worlds||[]).forEach((world,index)=>{
    const cell=document.createElement('button');
    cell.type='button';
    cell.className='mmm-cell '+colors[index%colors.length];
    cell.innerHTML=`<i class="ti ${icons[index%icons.length]}" aria-hidden="true"></i>`;
    const label=document.createElement('span');
    label.textContent=world.label||world.name||world.id||'Domain';
    cell.appendChild(label);
    cell.addEventListener('click',()=>{mobileNav(world.id,null);toggleMobileMore();});
    grid.appendChild(cell);
  });
  const add=document.createElement('button');
  add.type='button';
  add.className='mmm-cell';
  add.innerHTML='<i class="ti ti-plus" aria-hidden="true"></i>';
  const addLabel=document.createElement('span');
  addLabel.textContent='Add';
  add.appendChild(addLabel);
  add.addEventListener('click',()=>{openWorldModal();toggleMobileMore();});
  grid.appendChild(add);
}

function toggleMobileMore(){
  const moreMenu=document.getElementById('mobileMoreMenu');
  if(!moreMenu) return;
  const isHidden=moreMenu.classList.contains('hidden');
  if(isHidden)renderMobileWorldMenu();
  moreMenu.classList.toggle('hidden');
  // Status strip
  const strip=document.getElementById('mmmStatusStrip');
  if(strip){strip.style.display=isHidden?'flex':'none';if(isHidden)_populateMmmStatus();}
  const nav=document.getElementById('mobileBottomNav');
  if(nav){
    nav.querySelectorAll('.mbn-tab').forEach(t=>t.classList.remove('active'));
    const center=document.getElementById('mbt-dashboard');
    if(center){center.style.background='';center.style.boxShadow='';}
    const moreTab=document.getElementById('mbt-workspaces');
    if(isHidden && moreTab){
      moreTab.classList.add('active');
      setTimeout(()=>initSheetSwipe(),50);
    } else {
      syncMobileNavActive(currentView);
      const sheet=document.getElementById('mobileMoreMenu')?.querySelector('.mmm-sheet');
      if(sheet){sheet.classList.remove('expanded');sheet.style.transform='';}
      _sheetSwipeInit=false;
    }
  }
}

function _populateMmmStatus(){
  try{
    // Greeting by hour
    const h=new Date().getHours();
    const greetEl=document.getElementById('mmmGreeting');
    if(greetEl)greetEl.textContent=(h<12?'Good morning':h<17?'Good afternoon':'Good evening')+'.';
    // Date
    const dateEl=document.getElementById('mmmDate');
    if(dateEl){
      const now=new Date();
      dateEl.textContent=now.toLocaleDateString('en-PH',{weekday:'long',month:'long',day:'numeric'}).toUpperCase();
    }
    // Tasks due today or overdue
    const today=localDateStr(new Date());
    const dueTasks=(DB.tasks||[]).filter(t=>t.due&&t.due<=today&&t.status!=='Done'&&t.status!=='Approved');
    const taskEl=document.getElementById('mmmTaskCount');
    if(taskEl)taskEl.textContent=dueTasks.length>0?dueTasks.length+' task'+(dueTasks.length>1?'s':'')+' due':'No tasks due';
    // Next calendar event today
    const todayEvs=(DB.calEvents||[]).filter(e=>(e._expandedDate||e.date)===today&&e.time).sort((a,b)=>(a.time||'').localeCompare(b.time||''));
    const evEl=document.getElementById('mmmNextEvent');
    if(evEl){
      if(todayEvs.length){
        const ev=todayEvs[0];
        const[hh,mm]=ev.time.split(':').map(Number);
        const ap=hh<12?'AM':'PM';const h12=hh===0?12:hh>12?hh-12:hh;
        evEl.textContent=h12+':'+(String(mm).padStart(2,'0'))+' '+ap+' · '+ev.title.substring(0,18);
      }else{evEl.textContent='No events today';}
    }
    // Cash balance
    const cashEl=document.getElementById('mmmCashBalance');
    if(cashEl&&DB.cashflow){
      const bal=typeof getTotalPortfolioBalance==='function'?getTotalPortfolioBalance():(DB.cashflow||[]).reduce((s,e)=>e.type==='Debit'?s+e.amount:e.type==='Credit'?s-e.amount:s,0);
      cashEl.textContent='₱'+Math.round(bal).toLocaleString();
    }
  }catch(e){console.warn('mmmStatus:',e);}
}

let _sheetSwipeInit=false;
function initSheetSwipe(){
  if(_sheetSwipeInit)return;
  const menu=document.getElementById('mobileMoreMenu');
  const sheet=menu?.querySelector('.mmm-sheet');
  if(!sheet||!menu)return;
  _sheetSwipeInit=true;
  let sy=0,dy=0,dragging=false;
  const handle=sheet.querySelector('.mmm-handle');

  // Dismiss by tapping backdrop
  menu.addEventListener('click',function(e){
    if(e.target===menu)toggleMobileMore();
  });

  function onStart(e){
    const t=e.touches?e.touches[0]:e;
    sy=t.clientY;dy=0;dragging=true;
    sheet.classList.add('dragging');
  }
  function onMove(e){
    if(!dragging)return;
    const t=e.touches?e.touches[0]:e;
    dy=t.clientY-sy;
    if(Math.abs(dy)<4)return;
    // Only intercept vertical drag on handle or when not scrollable
    const isExpanded=sheet.classList.contains('expanded');
    const atTop=sheet.scrollTop<=0;
    if(dy>0&&(atTop||!isExpanded)){
      e.preventDefault();
      sheet.style.transform='translateY('+Math.max(0,dy)+'px)';
    } else if(dy<0&&!isExpanded){
      e.preventDefault();
      sheet.style.transform='translateY('+Math.min(0,dy)+'px)';
    }
  }
  function onEnd(){
    if(!dragging)return;
    dragging=false;
    sheet.classList.remove('dragging');
    sheet.style.transform='';
    const isExpanded=sheet.classList.contains('expanded');
    if(dy>80){
      // Swipe down — collapse or close
      if(isExpanded){
        sheet.classList.remove('expanded');
      } else {
        toggleMobileMore();
      }
    } else if(dy<-80){
      // Swipe up — expand
      sheet.classList.add('expanded');
    }
    dy=0;sy=0;
  }

  sheet.addEventListener('touchstart',onStart,{passive:true});
  sheet.addEventListener('touchmove',onMove,{passive:false});
  sheet.addEventListener('touchend',onEnd,{passive:true});
  if(handle){
    handle.style.cursor='grab';
    handle.style.padding='10px 0';
  }
}

// Expose globally so onclick handlers can reach them
window.mobileNav=mobileNav;
window.toggleMobileMore=toggleMobileMore;
window.syncMobileNavActive=syncMobileNavActive;

// ═══════════════════════════════════════════════════════════════════════════
// JELIX PORTRAIT ENGINE — Mobile Search · Swipe Tasks · Cal Week Strip
