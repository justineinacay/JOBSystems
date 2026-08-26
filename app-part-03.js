// ═══════════════════════════════════════════════════════════════════════════

// ── Mobile Search Overlay ─────────────────────────────────────────────────
function openMobileSearch(){
  const o=document.getElementById('mobileSearchOverlay');
  if(!o)return;
  o.classList.add('open');
  setTimeout(()=>{const i=document.getElementById('mobileSearchInput');if(i)i.focus();},80);
}
function closeMobileSearch(){
  const o=document.getElementById('mobileSearchOverlay');
  if(o)o.classList.remove('open');
  const i=document.getElementById('mobileSearchInput');
  if(i)i.value='';
}
function runMobileSearch(q){
  const res=document.getElementById('mobileSearchResults');if(!res)return;
  if(!q||q.length<2){res.innerHTML='<div style="padding:20px 16px;text-align:center;font-size:var(--text-sm);color:var(--text3)">Start typing to search tasks, events, notes...</div>';return;}
  const ql=q.toLowerCase();
  let html='';
  // Tasks
  const tasks=(DB.tasks||[]).filter(t=>t.title&&t.title.toLowerCase().includes(ql)).slice(0,6);
  if(tasks.length){
    html+='<div style="padding:8px 16px 4px;font-size:var(--text-xs);font-weight:700;letter-spacing:.1em;color:var(--text3);text-transform:uppercase">Tasks</div>';
    tasks.forEach(t=>{
      html+='<div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.04);cursor:pointer;min-height:48px" onclick="closeMobileSearch();mobileNav(\'tasks\',null);setTimeout(()=>openTaskEdit('+t.id+'),400)"><i class="ti ti-circle-check" style="color:var(--teal);font-size:16px;flex-shrink:0"></i><div style="min-width:0"><div style="font-size:var(--text-sm);font-weight:600;color:var(--text1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+t.title+'</div><div style="font-size:var(--text-xs);color:var(--text3);margin-top:2px">'+( t.world||'')+' \u00b7 '+(t.status||'')+'</div></div></div>';
    });
  }
  // Events
  const evs=(DB.calEvents||[]).filter(e=>e.title&&e.title.toLowerCase().includes(ql)).slice(0,4);
  if(evs.length){
    html+='<div style="padding:8px 16px 4px;font-size:var(--text-xs);font-weight:700;letter-spacing:.1em;color:var(--text3);text-transform:uppercase">Events</div>';
    evs.forEach(e=>{
      html+='<div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.04);cursor:pointer;min-height:48px" onclick="closeMobileSearch();mobileNav(\'calendar\',null);calSelectedDate=\''+e.date+'\';setCalView(\'day\');setTimeout(()=>editCalEvent('+e.id+'),400)"><i class="ti ti-calendar" style="color:var(--purple);font-size:16px;flex-shrink:0"></i><div style="min-width:0"><div style="font-size:var(--text-sm);font-weight:600;color:var(--text1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+e.title+'</div><div style="font-size:var(--text-xs);color:var(--text3);margin-top:2px">'+(e.date||'')+'</div></div></div>';
    });
  }
  // Notes
  const notes=(DB.notes||[]).filter(n=>(n.title||'').toLowerCase().includes(ql)||(n.blocks||[]).some(b=>(b.content||'').toLowerCase().includes(ql))).slice(0,4);
  if(notes.length){
    html+='<div style="padding:8px 16px 4px;font-size:var(--text-xs);font-weight:700;letter-spacing:.1em;color:var(--text3);text-transform:uppercase">Notes</div>';
    notes.forEach(n=>{
      html+='<div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.04);cursor:pointer;min-height:48px" onclick="closeMobileSearch();mobileNav(\'notes\',null);setTimeout(()=>{const idx=DB.notes.findIndex(x=>x.id==='+n.id+');if(idx>-1)openNoteEditor(idx);},400)"><i class="ti ti-notes" style="color:var(--amber);font-size:16px;flex-shrink:0"></i><div style="min-width:0"><div style="font-size:var(--text-sm);font-weight:600;color:var(--text1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(n.title||'Untitled')+'</div></div></div>';
    });
  }
  if(!html)html='<div style="padding:20px 16px;text-align:center;font-size:var(--text-sm);color:var(--text3)">No results for "'+q+'"</div>';
  res.innerHTML=html;
}
document.addEventListener('keydown',function(e){if(e.key==='Escape'){closeMobileSearch();}});

// ── Animated View Transitions ─────────────────────────────────────────────
let _lastView='dashboard';
function animateViewTransition(newView){
  if(window.innerWidth>430)return;
  const cur=document.getElementById('view-'+_lastView);
  const next=document.getElementById('view-'+newView);
  if(cur&&cur!==next){cur.classList.add('slide-out-left');setTimeout(()=>cur.classList.remove('slide-out-left'),220);}
  if(next){next.classList.add('slide-in-right');setTimeout(()=>next.classList.remove('slide-in-right'),220);}
  _lastView=newView;
}

// ── Task Swipe Engine ─────────────────────────────────────────────────────
let _swipeState={};
function initTaskSwipe(card,taskId){
  if(!card||card._swipeInit)return;
  card._swipeInit=true;
  let sx=0,sy=0,dx=0,swiping=false;
  card.addEventListener('touchstart',function(e){
    const t=e.touches[0];sx=t.clientX;sy=t.clientY;dx=0;swiping=true;
  },{passive:true});
  card.addEventListener('touchmove',function(e){
    if(!swiping)return;
    const t=e.touches[0];
    dx=t.clientX-sx;
    const dy=Math.abs(t.clientY-sy);
    if(dy>Math.abs(dx))return; // vertical scroll wins
    if(Math.abs(dx)>8)e.preventDefault();
    card.style.transform='translateX('+Math.max(-120,Math.min(40,dx))+'px)';
  },{passive:false});
  card.addEventListener('touchend',function(){
    swiping=false;
    card.style.transform='';
    if(dx<-60){
      // Swipe left — reveal actions
      card.classList.add('swiped-left');
    } else if(dx>60){
      // Swipe right — mark complete
      card.classList.add('swiped-right');
      setTimeout(()=>{
        const task=DB.tasks.find(t=>t.id==taskId);
        if(task){task.status='Done';SB.update('tasks',task.id,task,'tasks');syncTaskToNoteBlock(task);renderTasks();renderBrief();showToast('\u2713 Task marked Done');}
        card.classList.remove('swiped-right');
      },300);
    } else {
      card.classList.remove('swiped-left');
    }
    dx=0;
  },{passive:true});
  // Tap outside to close actions
  card.addEventListener('click',function(e){
    if(card.classList.contains('swiped-left')&&!e.target.closest('.mtc-action-btn')){
      card.classList.remove('swiped-left');e.stopPropagation();
    }
  });
}

// ── Render mobile task cards (called by renderTasks on mobile) ────────────
let _mobileTaskGroupMode=localStorage.getItem('j-pref-mobile-task-group')||'board';
function setMobileTaskGroupMode(mode){
  _mobileTaskGroupMode=mode;
  localStorage.setItem('j-pref-mobile-task-group',mode);
  ['board','project'].forEach(m=>{
    const b=document.getElementById('mtc-group-'+m);
    if(b)b.classList.toggle('active',m===mode);
  });
  renderTasks();
}
function renderMobileTaskCards(tasks,container){
  if(!container)return;
  ['board','project'].forEach(m=>{
    const b=document.getElementById('mtc-group-'+m);
    if(b)b.classList.toggle('active',m===_mobileTaskGroupMode);
  });
  if(!tasks||!tasks.length){
    container.innerHTML='<div style="text-align:center;padding:40px 16px;font-size:var(--text-sm);color:var(--text3)">No tasks. Tap + Task to add one.</div>';
    return;
  }
  const worldStripe={'WORK-IH':'var(--w-ideahub)','WORK-CS':'var(--w-chainsmoker)','VENTURE':'var(--w-venture)','BUILD':'var(--w-build)','SIDES':'var(--w-sides)','FAITH':'var(--w-faith)','LIFE':'var(--w-life)'};
  const worldLabel={'WORK-IH':'Ideahub','WORK-CS':'Chainsmoker','VENTURE':'Venture','BUILD':'Build','SIDES':'Sides','FAITH':'Faith','LIFE':'Life'};
  if(typeof getBoards==='function')getBoards().forEach(board=>{
    worldStripe[board.id]=board.stripe||board.color||worldStripe[board.id];
    worldLabel[board.id]=board.name||worldLabel[board.id]||board.id;
  });
  const priorityDot={'High':'var(--red)','Medium':'var(--amber)','Low':'var(--green)'};

  // Board mode: one section per Domain. Project mode: one section per
  // (Domain, Project) pair, plus an "Unassigned" section per Domain —
  // mirrors the desktop Project tab's grouping exactly.
  const byProject=_mobileTaskGroupMode==='project';
  const worlds=[...new Set(tasks.map(t=>t.world||'Other'))];
  let groups=[];
  if(!byProject){
    groups=worlds.map(world=>({key:world,label:worldLabel[world]||world,stripe:worldStripe[world]||'var(--text3)',tasks:tasks.filter(t=>(t.world||'Other')===world)}));
  }else{
    worlds.forEach(world=>{
      const wtasks=tasks.filter(t=>(t.world||'Other')===world);
      const stripe=worldStripe[world]||'var(--text3)';
      const wlabel=worldLabel[world]||world;
      const projects=typeof getProjectsForWorld==='function'?getProjectsForWorld(world):[];
      projects.forEach(p=>{
        const pTasks=wtasks.filter(t=>t.projectId===p.id);
        if(pTasks.length)groups.push({key:world+'::'+p.id,label:wlabel+' · '+p.name,stripe,tasks:pTasks,isProject:true,world,projectId:p.id});
      });
      const unassigned=wtasks.filter(t=>!t.projectId);
      if(unassigned.length)groups.push({key:world+'::unassigned',label:wlabel+' · Unassigned',stripe,tasks:unassigned,isProject:false});
    });
  }
  let html='';

  groups.forEach(group=>{
    const wtasks=group.tasks;
    const stripe=group.stripe;
    const wlabel=group.label;
    // Computed from the FULL unfiltered task list, not the (possibly
    // Done-excluded) `tasks` this function was called with — otherwise
    // the progress count would always read 0 under the default filter.
    const allProjTasks=group.isProject?(DB.tasks||[]).filter(t=>t.world===group.world&&t.projectId===group.projectId):[];
    const doneCount=group.isProject?allProjTasks.filter(t=>t.status==='Done').length:0;
    const countLabel=group.isProject?doneCount+'/'+allProjTasks.length:wtasks.length;

    // Group header
    html+='<div class="mtc-group-header" style="color:'+stripe+'">'+
      '<div class="mtc-stripe" style="background:'+stripe+'"></div>'+
      wlabel+
      '<span class="mtc-count">'+countLabel+'</span>'+
    '</div>';

    wtasks.forEach(t=>{
      const sc=worldStripe[t.world||'']||'var(--text3)';
      const wl=worldLabel[t.world||'']||t.world||'';
      const pd=priorityDot[t.priority]||'transparent';

      html+=
        '<div class="mobile-task-card" data-task-id="'+t.id+'" '+
          'style="border-left-color:'+sc+';padding:12px 14px" '+
          'onclick="openTaskEdit('+t.id+')">'+

          // Row 1: title + status pill
          '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:7px">'+
            '<div style="font-size:var(--text-sm);font-weight:700;color:var(--text1);line-height:1.35;flex:1">'+t.title+'</div>'+
            '<span class="pill '+(taskStatusPillClass(t.status))+'" style="font-size:10px;flex-shrink:0;white-space:nowrap">'+(t.status||'Todo')+'</span>'+
          '</div>'+

          // Tags row: world + priority dot
          '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">'+
            (wl?'<span style="font-size:10px;font-weight:700;color:'+sc+';border:1px solid '+sc+'40;border-radius:8px;padding:1px 7px;background:'+sc+'10;white-space:nowrap">'+wl+'</span>':'')+
            (t.priority?'<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;color:var(--text3)">'+
              '<span style="width:6px;height:6px;border-radius:50%;background:'+pd+';flex-shrink:0;display:inline-block"></span>'+
              t.priority+'</span>':'')+
            (t.client?'<span style="font-size:10px;color:var(--text3)">· '+t.client+'</span>':'')+
            (t.due?'<span style="font-size:10px;color:'+(t.due<localDateStr(new Date())?'var(--red)':'var(--text3)')+';margin-left:auto">'+formatTaskTableDate(t.due)+'</span>':'')+
          '</div>'+

          // Swipe actions — Edit · Done · Delete
          '<div class="mtc-actions">'+
            '<button class="mtc-action-btn edit" onclick="event.stopPropagation();editTask('+t.id+')" title="Edit"><i class="ti ti-pencil"></i>EDIT</button>'+
            '<button class="mtc-action-btn done" onclick="event.stopPropagation();completeMobileTask('+t.id+')" title="Done"><i class="ti ti-check"></i>DONE</button>'+
            '<button class="mtc-action-btn del" onclick="event.stopPropagation();deleteTask(event,'+t.id+')" title="Delete"><i class="ti ti-trash"></i>DEL</button>'+
          '</div>'+
        '</div>';
    });
  });

  container.innerHTML=html;
  container.querySelectorAll('.mobile-task-card').forEach(card=>{
    initTaskSwipe(card,card.dataset.taskId);
  });
}

// ── Mobile Calendar Week Strip ────────────────────────────────────────────
let _mobileCalSelectedDate=localDateStr(new Date());
function renderMobileCalStrip(){
  if(window.innerWidth>430)return;
  const strip=document.getElementById('mobileCalWeekStrip');
  const agenda=document.getElementById('mobileCalAgenda');
  if(!strip||!agenda)return;
  // Mount strip into cal-main if not already there
  const calMain=document.querySelector('#view-calendar .cal-main');
  if(calMain&&!calMain.contains(strip)){
    calMain.insertBefore(strip,calMain.firstChild);
    calMain.appendChild(agenda);
  }
  strip.style.display='flex';
  agenda.style.display='block';
  // Build 7-day strip centred on today
  const today=new Date();
  const days=[];
  for(let i=-3;i<=3;i++){const d=new Date(today);d.setDate(today.getDate()+i);days.push(d);}
  const DOW=['SUN','MON','TUE','WED','THU','FRI','SAT'];
  strip.innerHTML=days.map(d=>{
    const ds=localDateStr(d);
    const isToday=ds===localDateStr(today);
    const isSel=ds===_mobileCalSelectedDate;
    const hasEv=(DB.calEvents||[]).some(e=>e.date===ds);
    return '<div class="mcws-day'+(isToday?' today':'')+(isSel?' selected':'')+(hasEv?' has-ev':'')+'" onclick="selectMobileCalDay(\''+ds+'\')" data-date="'+ds+'">'+
      '<div class="mcws-dow">'+DOW[d.getDay()]+'</div>'+
      '<div class="mcws-num">'+d.getDate()+'</div>'+
      '<div class="mcws-dot"></div>'+
    '</div>';
  }).join('');
  renderMobileCalAgenda(_mobileCalSelectedDate);
}
function selectMobileCalDay(ds){
  _mobileCalSelectedDate=ds;
  document.querySelectorAll('.mcws-day').forEach(el=>{
    el.classList.toggle('selected',el.dataset.date===ds);
  });
  renderMobileCalAgenda(ds);
}
function renderMobileCalAgenda(ds){
  const agenda=document.getElementById('mobileCalAgenda');if(!agenda)return;
  const evs=(DB.calEvents||[]).filter(e=>e.date===ds);
  const d=new Date(ds+'T00:00:00');
  const label=d.toLocaleDateString('en-PH',{weekday:'long',month:'long',day:'numeric'});
  if(!evs.length){
    agenda.innerHTML='<div class="mca-empty"><div style="font-size:var(--text-xs);font-weight:700;color:var(--teal);margin-bottom:8px">'+label+'</div>No events scheduled.<br><button class="btn btn-t" style="margin-top:12px;font-size:var(--text-xs)" onclick="openCalEventModalOnDate(\''+ds+'\')"><i class="ti ti-plus"></i> Add Event</button></div>';
    return;
  }
  const worldColors={'ih':'var(--w-ideahub)','cs':'var(--w-chainsmoker)','ven':'var(--w-venture)','bld':'var(--w-build)','sid':'var(--w-sides)','fth':'var(--w-faith)','lif':'var(--w-life)','tsk':'var(--teal)'};
  agenda.innerHTML='<div style="padding:10px 16px 6px;font-size:var(--text-xs);font-weight:700;color:var(--teal)">'+label+'</div>'+
    evs.sort((a,b)=>(a.time||'').localeCompare(b.time||'')).map(e=>{
      const clr=worldColors[e.type]||'var(--teal)';
      const t12=e.time?formatTime12(e.time):'All day';
      return '<div class="mca-item" onclick="openCalEventDetail('+e.id+')">'+
        '<div class="mca-time">'+t12+'</div>'+
        '<div class="mca-dot" style="background:'+clr+'"></div>'+
        '<div class="mca-body">'+
          '<div class="mca-title">'+e.title+'</div>'+
          (e.loc?'<div class="mca-sub"><i class="ti ti-map-pin" style="font-size:var(--text-xs)"></i> '+e.loc+'</div>':'')+
        '</div>'+
      '</div>';
    }).join('');
}
function formatTime12(t){
  if(!t)return'';
  const [h,m]=t.split(':').map(Number);
  const ampm=h<12?'AM':'PM';
  const h12=h===0?12:h>12?h-12:h;
  return h12+':'+(String(m).padStart(2,'0'))+' '+ampm;
}

// Hook renderCalendar to also render strip on mobile — but only for
// month/week, where it's the intended simplified substitute. Day, Quarter,
// and Agenda now render their own real (already mobile-safe) views, so the
// strip+agenda must get out of the way instead of stacking on top of them.
const _origRenderCalendar=window.renderCalendar;
window.renderCalendar=function(){
  if(typeof _origRenderCalendar==='function')_origRenderCalendar();
  if(window.innerWidth<=430){
    if(calView==='month'||calView==='week'||calView==='twoweek'){
      renderMobileCalStrip();
    }else{
      const strip=document.getElementById('mobileCalWeekStrip');
      const agenda=document.getElementById('mobileCalAgenda');
      if(strip)strip.style.display='none';
      if(agenda)agenda.style.display='none';
    }
  }
};

// Hook mobileNav to fire animateViewTransition
const _origMobileNav=window.mobileNav;
window.mobileNav=function(view,tabEl){
  animateViewTransition(view);
  if(typeof _origMobileNav==='function')_origMobileNav(view,tabEl);
};

window.openMobileSearch=openMobileSearch;
window.closeMobileSearch=closeMobileSearch;
window.runMobileSearch=runMobileSearch;
window.renderMobileCalStrip=renderMobileCalStrip;
window.selectMobileCalDay=selectMobileCalDay;
window.renderMobileTaskCards=renderMobileTaskCards;

function completeMobileTask(id){
  const task=DB.tasks.find(t=>t.id==id);
  if(!task)return;
  task.status='Done';
  SB.update('tasks',task.id,task,'tasks');
  syncTaskToNoteBlock(task);
  renderTasks();
  renderBrief();
  showToast('\u2713 Task marked Done');
}
window.completeMobileTask=completeMobileTask;

// ===== DAILY BRIEF =====
let wtFilter='all';
function setWTFilter(f,btn){wtFilter=f;document.querySelectorAll('#worldTasksFilter button').forEach(b=>{b.style.background='transparent';b.style.borderColor='var(--border2)';b.style.color='var(--text3)';});btn.style.background='var(--teal3)';btn.style.borderColor='var(--teal2)';btn.style.color='var(--teal)';renderBriefWorldTasks();}
function renderBriefWorldTasks(){
  const worlds=[
    {k:'WORK-CS',l:'Chainsmoker',c:'var(--w-chainsmoker)',icon:'ti-flame'},
    {k:'VENTURE',l:'Venture',c:'var(--amber)',icon:'ti-rocket'},
    {k:'BUILD',l:'Build',c:'var(--green)',icon:'ti-code'},
    {k:'SIDES',l:'Sides',c:'var(--w-sides)',icon:'ti-coins'},
    {k:'FAITH',l:'Faith',c:'var(--purple)',icon:'ti-heart-handshake'},
    {k:'LIFE',l:'Life',c:'var(--teal2)',icon:'ti-leaf'}
  ];
  const sc={'Todo':taskStatusColor('Todo'),'In Progress':taskStatusColor('In Progress'),'No Progress':taskStatusColor('No Progress'),'Done':taskStatusColor('Done')};
  const el=document.getElementById('briefWorldTasks');if(!el)return;
  let rows='';
  worlds.forEach(w=>{
    let tasks=DB.tasks.filter(t=>t.world===w.k);
    if(wtFilter==='Todo')tasks=tasks.filter(t=>t.status==='Todo');
    else if(wtFilter==='In Progress')tasks=tasks.filter(t=>t.status==='In Progress');
    else if(wtFilter==='No Progress')tasks=tasks.filter(t=>t.status==='No Progress');
    else if(wtFilter==='Done')tasks=tasks.filter(t=>t.status==='Done');
    tasks.forEach(t=>{
      const prioCol=t.priority==='High'?'var(--red)':t.priority==='Medium'?'var(--amber)':'var(--text3)';
      const isMobile=window.innerWidth<=768;
      if(isMobile){
        rows+=`<div style="padding:10px 12px;border:1px solid var(--border);border-radius:10px;margin-bottom:6px;background:var(--navy3);cursor:pointer" onclick="editTask(${t.id})">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
            <i class="ti ${w.icon}" style="color:${w.c};font-size:var(--text-xs);flex-shrink:0"></i>
            <span style="font-size:var(--text-sm);color:var(--text1);font-weight:${t.priority==='High'?'600':'400'};flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.title}</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:var(--text-xs);color:var(--text3)">
            <span>${w.l}</span>
            <span>${t.due||'No due date'}</span>
            <span style="color:${sc[t.status]}">${t.status}</span>
            <span style="color:${prioCol};font-weight:600">${t.priority}</span>
          </div>
        </div>`;
        return;
      }
      rows+=`<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;padding:8px 4px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .1s" onclick="editTask(${t.id})" onmouseover="this.style.background='rgba(0,255,242,.04)'" onmouseout="this.style.background=''">
        <div style="display:flex;align-items:center;gap:6px;min-width:0;padding-right:8px">
          <i class="ti ${w.icon}" style="color:${w.c};font-size:var(--text-xs);line-height:1;display:block;flex-shrink:0"></i>
          <span style="font-size:var(--text-sm);color:var(--text1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:${t.priority==='High'?'600':'400'}">${t.title}</span>
        </div>
        <div style="font-size:var(--text-sm);color:${w.c};display:flex;align-items:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${w.l}</div>
        <div style="font-size:var(--text-sm);color:var(--text3);display:flex;align-items:center">${t.due||'—'}</div>
        <div style="font-size:var(--text-sm);display:flex;align-items:center"><span style="color:${sc[t.status]}">${t.status}</span></div>
        <div style="font-size:var(--text-sm);display:flex;align-items:center;gap:4px"><span style="color:${prioCol};font-weight:600">${t.priority}</span></div>
      </div>`;
    });
  });
  el.innerHTML=rows||'<div style="font-size:var(--text-xs);color:var(--text3);padding:10px">No tasks yet.</div>';
  // Hide the desktop table header on mobile since cards carry their own labels
  const headerRow=el.previousElementSibling;
  if(headerRow&&headerRow.style.gridTemplateColumns)headerRow.style.display=window.innerWidth<=768?'none':'grid';
}
function toggleWorldSection(h){const b=h.nextElementSibling;if(b)b.style.display=b.style.display==='none'?'':'none';}// ── Week strip state ──
let briefWeekOffset=0;
function briefWeekNav(dir){
  if(dir===0){briefWeekOffset=0;}else{briefWeekOffset+=dir;}
  renderBriefWeekStrip();
}
function renderBriefWeekStrip(){
  const today=new Date();
  today.setHours(0,0,0,0);
  const todayStr=localDateStr(today);
  const end=new Date(today);
  end.setDate(end.getDate()+14);
  const endStr=localDateStr(end);
  const label=document.getElementById('briefWeekLabel');
  if(label)label.textContent='Next 14 days';
  const strip=document.getElementById('briefWeekStrip');
  if(!strip)return;
  const taskWorldColors={VENTURE:'var(--w-venture)',BUILD:'var(--w-build)',SIDES:'var(--accent-yellow)',FAITH:'var(--accent-red)',LIFE:'#7A8CFF'};
  const taskCalendarIds=new Set((DB.calEvents||[]).map(e=>e._taskId).filter(Boolean));
  const events=(DB.calEvents||[])
    .filter(e=>e.date>=todayStr&&e.date<=endStr)
    .map(e=>({kind:'event',id:e.id,title:e.title||'Untitled event',date:e.date,time:e.time||'',color:_evResolveColor(calWorldById(normaliseType(e.type)),e).hex}));
  const tasks=(DB.tasks||[])
    .filter(t=>t.status!=='Done'&&t.due>=todayStr&&t.due<=endStr&&!taskCalendarIds.has(t.id))
    .map(t=>({kind:'task',id:t.id,title:t.title||'Untitled task',date:t.due,time:t.startTime||'',color:taskWorldColors[t.world]||'var(--accent-yellow)'}));
  const items=[...events,...tasks]
    .sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'23:59').localeCompare(b.time||'23:59'))
    .slice(0,5);
  const dateLabel=dateStr=>{
    const date=new Date(dateStr+'T12:00:00');
    const diff=Math.round((new Date(dateStr+'T00:00:00')-today)/86400000);
    if(diff===0)return'Today';
    if(diff===1)return'Tomorrow';
    return date.toLocaleDateString('en-PH',{month:'short',day:'numeric',timeZone:'Asia/Manila'});
  };
  strip.innerHTML=items.length?items.map(item=>`
    <button type="button" class="upcoming-item" onclick="${item.kind==='task'?`editTask(${item.id})`:`setView('calendar')`}">
      <span class="upcoming-dot" style="background:${item.color}"></span>
      <span class="upcoming-copy">
        <strong>${escapeHtml(item.title)}</strong>
        <small>${dateLabel(item.date)}</small>
        <span>${item.time?to12h(item.time):'All day'}</span>
      </span>
    </button>`).join(''):`<button type="button" class="upcoming-empty" onclick="openCalEventModalOnDate('${todayStr}')"><i class="ti ti-calendar-plus"></i><span>No upcoming commitments</span><small>Add an event when you are ready.</small></button>`;
}

// ===== QUICK-ADD HELPERS =====
function quickAddTask(world){
  // Pre-fill task modal with world context
  const m=document.getElementById('taskModal');
  if(!m)return;
  openModal('taskModal');
  setTimeout(()=>{
    const w=document.getElementById('t-world');
    if(w)w.value=world;
    const ti=document.getElementById('t-title');
    if(ti)ti.focus();
  },80);
}
function quickSaveIdea(){
  // Opens task modal pre-filled as WORK-IH idea
  openModal('taskModal');
  setTimeout(()=>{
    const w=document.getElementById('t-world');if(w)w.value='WORK-IH';
    const p=document.getElementById('t-priority');if(p)p.value='Medium';
    const pl=document.getElementById('t-platform');if(pl)pl.value='';
    const ti=document.getElementById('t-title');
    if(ti){ti.placeholder='Describe your idea...';ti.focus();}
    // Set modal title
    const mt=document.getElementById('taskModalTitle');if(mt)mt.textContent='SAVE IDEA — WORK';
  },80);
}
function quickAddExpense(){
  openCashModal('Debit');
  setTimeout(()=>{
    const cat=document.getElementById('ca-cat');if(cat)cat.value='Other';
    const d=document.getElementById('ca-desc');if(d){d.placeholder='What did you spend on?';d.focus();}
    // Navigate to Life after save is natural — modal handles it
  },80);
}
function quickAddIncome(){
  openCashModal('Credit');
  setTimeout(()=>{
    const cat=document.getElementById('ca-cat');if(cat)cat.value='Income';
    const d=document.getElementById('ca-desc');if(d){d.placeholder='Income source...';d.focus();}
  },80);
}
function quickLogFaith(){
  openModal('faithModal');
}

// ===== OVERHEAD SCOREBOARD =====
function renderOverheadScoreboard(){
  const el=document.getElementById('overheadScoreboard');
  if(!el)return;
  const today=localDateStr(new Date());
  // Active clients
  const activeClients=(DB.clients||[]).filter(c=>c.status==='Active'||c.status==='Urgent').length;
  // Open tasks by world
  const openTasks=(DB.tasks||[]).filter(t=>t.status!=='Done');
  const highPrio=openTasks.filter(t=>t.priority==='High').length;
  // Cash
  const credits=(DB.cashflow||[]).reduce((s,t)=>t.type==='Credit'?s+(t.amount||0):s,0);
  const debits=(DB.cashflow||[]).reduce((s,t)=>t.type==='Debit'?s+(t.amount||0):s,0);
  const balance=debits-credits;
  // Build apps
  const buildTasks=(DB.tasks||[]).filter(t=>t.world==='BUILD'&&t.status!=='Done').length;
  // Faith / Buklod events this week
  const weekStart=new Date();weekStart.setHours(0,0,0,0);
  const weekEnd=new Date(weekStart);weekEnd.setDate(weekEnd.getDate()+7);
  const faithEvents=(DB.calEvents||[]).filter(e=>{const d=new Date(e.date);return e.type==='pu'&&d>=weekStart&&d<weekEnd;}).length;
  // Today's events
  const todayEvents=(DB.calEvents||[]).filter(e=>e.date===today).length;
  const activeTasks=openTasks.filter(t=>t.status==='In Progress').length;
  const codeOpenTasks=(DB.tasks||[]).filter(t=>t.world==='BUILD'&&t.status!=='Done').length;
  const jobOpenTasks=(DB.tasks||[]).filter(t=>t.world==='VENTURE'&&t.status!=='Done').length;
  const creativeOpenTasks=(DB.tasks||[]).filter(t=>t.world==='SIDES'&&t.status!=='Done').length;
  const faithOpenTasks=(DB.tasks||[]).filter(t=>t.world==='FAITH'&&t.status!=='Done').length;

  const tiles=[
    {icon:'ti-users',label:'Active clients',val:activeClients,color:'var(--w-venture)',onclick:"setView('work-ih')"},
    {icon:'ti-player-play',label:'In progress',val:activeTasks,color:'var(--w-build)',onclick:"setView('tasks')"},
    {icon:'ti-alert-triangle',label:'Needs attention',val:highPrio,color:'var(--red)',onclick:"setView('tasks')"},
    {icon:'ti-list-check',label:'Open tasks',val:openTasks.length,color:'var(--w-sides)',onclick:"setView('tasks')"},
  ];

  el.innerHTML=tiles.map(t=>{
    return `
    <button type="button" class="overview-stat" onclick="${t.onclick}">
      <span class="overview-stat-label"><i class="ti ${t.icon}" style="color:${t.color}"></i>${t.label}</span>
      <strong class="overview-stat-value">${t.val}</strong>
    </button>`;
  }).join('');
}

// ===== SMART SEARCH — content-aware =====
function smartSearch(query){
  if(!query||query.length<2)return[];
  // #tag search — filters Tasks/Notes/Events/Links by exact tag membership
  // instead of substring-matching titles/notes, across all 4 taggable types.
  if(query[0]==='#'){
    const tag=query.slice(1).toLowerCase().trim();
    if(!tag)return[];
    const results=[];
    (DB.tasks||[]).forEach(t=>{if((t.tags||[]).includes(tag))results.push({type:'Task',icon:'ti-checkbox',label:t.title,sub:t.world+' · '+t.status,color:'var(--teal)',action:`editTask(${t.id})`});});
    (DB.notes||[]).forEach(n=>{if((n.tags||[]).includes(tag))results.push({type:'Note',icon:'ti-notes',label:n.title||'Untitled note',sub:'Note',color:'var(--amber)',action:`setView('notes');setTimeout(()=>{const i=DB.notes.findIndex(x=>x.id===${n.id});if(i>=0)openNoteEditor(i);},150)`});});
    (DB.calEvents||[]).forEach(e=>{if((e.tags||[]).includes(tag))results.push({type:'Event',icon:'ti-calendar',label:e.title,sub:e.date+(e.time?' · '+e.time:''),color:'var(--teal)',action:`setView('calendar')`});});
    (DB.savedLinks||[]).forEach(l=>{if((l.tags||[]).includes(tag))results.push({type:'Link',icon:'ti-link',label:l.title||l.url,sub:l.url,color:'var(--blue)',action:`setView('links')`});});
    return results.slice(0,12);
  }
  const q=query.toLowerCase();
  const results=[];
  // Tasks — title + notes + platform + tags
  (DB.tasks||[]).forEach(t=>{
    const hay=[t.title,t.notes,t.platform,t.client,t.world,...(t.tags||[])].filter(Boolean).join(' ').toLowerCase();
    if(hay.includes(q))results.push({type:'Task',icon:'ti-checkbox',label:t.title,sub:t.world+' · '+t.status,color:'var(--teal)',action:`editTask(${t.id})`});
  });
  // Notes — title + block text content + tags (previously not searched at all)
  (DB.notes||[]).forEach(n=>{
    const blockText=(n.blocks||[]).map(b=>b.content||'').join(' ');
    const hay=[n.title,blockText,...(n.tags||[])].filter(Boolean).join(' ').toLowerCase();
    if(hay.includes(q))results.push({type:'Note',icon:'ti-notes',label:n.title||'Untitled note',sub:blockText.substring(0,50),color:'var(--amber)',action:`setView('notes');setTimeout(()=>{const i=DB.notes.findIndex(x=>x.id===${n.id});if(i>=0)openNoteEditor(i);},150)`});
  });
  // Saved Links — title + url + tags
  (DB.savedLinks||[]).forEach(l=>{
    const hay=[l.title,l.url,...(l.tags||[])].filter(Boolean).join(' ').toLowerCase();
    if(hay.includes(q))results.push({type:'Link',icon:'ti-link',label:l.title||l.url,sub:l.url,color:'var(--blue)',action:`setView('links')`});
  });
  // Clients — name + contact + next
  (DB.clients||[]).forEach(c=>{
    const hay=[c.name,c.contact,c.next,c.world].filter(Boolean).join(' ').toLowerCase();
    if(hay.includes(q))results.push({type:'Client',icon:'ti-users',label:c.name,sub:c.status+' · '+c.world,color:'var(--orange)',action:`openModal('clientModal')`});
  });
  // Cashflow — desc + category + account + notes
  (DB.cashflow||[]).forEach(t=>{
    const hay=[t.desc,t.category,t.account,t.notes,t.catNotes].filter(Boolean).join(' ').toLowerCase();
    if(hay.includes(q))results.push({type:'Cash',icon:'ti-coin',label:t.desc,sub:t.type+' · ₱'+t.amount+' · '+t.date,color:'var(--amber)',action:`setView('life')`});
  });
  // Journal — title + content
  (DB.journal||[]).forEach(j=>{
    const hay=[j.title,j.content].filter(Boolean).join(' ').toLowerCase();
    if(hay.includes(q))results.push({type:'Journal',icon:'ti-notebook',label:j.title||'Entry',sub:(j.content||'').substring(0,50)+'...',color:'var(--purple)',action:`setView('journal')`});
  });
  // Calendar events — title + notes + loc + tags
  (DB.calEvents||[]).forEach(e=>{
    const hay=[e.title,e.notes,e.loc,...(e.tags||[])].filter(Boolean).join(' ').toLowerCase();
    if(hay.includes(q))results.push({type:'Event',icon:'ti-calendar',label:e.title,sub:e.date+(e.time?' · '+e.time:''),color:'var(--teal)',action:`setView('calendar')`});
  });
  // Faith activities
  (DB.faith||[]).forEach(f=>{
    const hay=[f.activity,f.group,f.assigned].filter(Boolean).join(' ').toLowerCase();
    if(hay.includes(q))results.push({type:'Faith',icon:'ti-heart',label:f.activity,sub:f.group+' · '+f.status,color:'var(--pink)',action:`setView('faith')`});
  });
  return results.slice(0,12);
}

// Patch cmd palette to use smartSearch
const _origFilterCmd=window.filterCmd;
window.filterCmd=function(){
  const q=document.getElementById('cmdInput')?.value||'';
  // Smart content search
  if(q.length>=2){
    const contentHits=smartSearch(q);
    if(contentHits.length){
      const res=document.getElementById('cmdResults');
      if(res){
        const existing=res.querySelector('.smart-results');
        if(existing)existing.remove();
        const wrap=document.createElement('div');wrap.className='smart-results';
        wrap.innerHTML='<div class="cgl">Content Search</div>'+contentHits.map((r,i)=>`
          <div class="cr" onclick="${r.action};document.getElementById('cmdOv').classList.remove('open')" style="gap:9px">
            <div class="cri" style="background:rgba(0,0,0,.3);color:${r.color}"><i class="ti ${r.icon}" style="font-size:var(--text-sm);line-height:1;display:block"></i></div>
            <div style="flex:1;min-width:0">
              <div class="crl">${r.label}</div>
              <div class="crs" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.sub}</div>
            </div>
            <span style="font-size:var(--text-xs);color:${r.color};background:rgba(0,0,0,.3);padding:1px 5px;border-radius:8px;flex-shrink:0">${r.type}</span>
          </div>`).join('');
        res.prepend(wrap);
      }
    }
  }
  if(_origFilterCmd)_origFilterCmd.apply(this,arguments);
};

// ===== TIME-BLOCKING CALENDAR =====
// Renders an hourly time-grid for today in the brief view week strip on demand
function renderTimeGrid(dateStr){
  // Build 24-hour grid from tasks with start/end times + cal events
  const container=document.getElementById('briefWeekStrip');
  if(!container)return;
  const d=dateStr||localDateStr(new Date());
  const events=(DB.calEvents||[]).filter(e=>e.date===d);
  // Tasks with due date matching and time fields
  const taskBlocks=(DB.tasks||[]).filter(t=>t.due===d&&(t.startTime||t.endTime));
  const hours=Array.from({length:17},(_,i)=>i+7); // 7am–11pm
  const fmt12=h=>{const ampm=h>=12?'PM':'AM';const h12=h%12||12;return h12+(ampm==='AM'?'a':'p');};
  const timeToY=h=>((h-7)/16)*100; // % of grid height

  container.innerHTML=`
    <div style="grid-column:1/-1;display:flex;gap:0">
      <!-- Time labels -->
      <div style="width:36px;flex-shrink:0;position:relative;height:320px">
        ${hours.map(h=>`<div style="position:absolute;top:${timeToY(h)}%;font-size:var(--text-xs);color:var(--text3);line-height:1;width:100%;text-align:right;padding-right:4px;transform:translateY(-50%)">${fmt12(h)}</div>`).join('')}
      </div>
      <!-- Grid -->
      <div style="flex:1;position:relative;height:320px;border-left:1px solid var(--border)">
        <!-- Hour lines -->
        ${hours.map(h=>`<div style="position:absolute;top:${timeToY(h)}%;left:0;right:0;border-top:1px solid ${h===new Date().getHours()?'rgba(128,255,250,.3)':'var(--border)'};width:100%"></div>`).join('')}
        <!-- Current time indicator -->
        <div id="tgNowLine" style="position:absolute;left:0;right:0;border-top:2px solid var(--teal);z-index:3">
          <div style="position:absolute;left:-4px;top:-4px;width:8px;height:8px;border-radius:50%;background:var(--teal);box-shadow:0 0 8px var(--teal)"></div>
        </div>
        <!-- Cal events -->
        ${events.map(ev=>{
          if(!ev.time)return '';
          const [hh,mm]=(ev.time||'09:00').split(':').map(Number);
          const top=timeToY(hh+(mm/60));
          const colors={default:'var(--teal)',oc:'var(--orange)',pu:'var(--purple)'};
          const c=colors[ev.type]||colors.default;
          return `<div style="position:absolute;top:${top}%;left:4px;right:4px;background:rgba(0,0,0,.5);border-left:3px solid ${c};border-radius:0 4px 4px 0;padding:3px 7px;font-size:var(--text-xs);color:${c};z-index:2;cursor:pointer;min-height:22px" title="${ev.notes||''}">${ev.time?to12h(ev.time)+' ':''}<b>${ev.title}</b></div>`;
        }).join('')}
        <!-- Task blocks -->
        ${taskBlocks.map(t=>{
          if(!t.startTime)return '';
          const [sh,sm]=(t.startTime||'09:00').split(':').map(Number);
          const [eh,em]=(t.endTime||t.startTime||'10:00').split(':').map(Number);
          const top=timeToY(sh+(sm/60));
          const height=Math.max(2,timeToY(eh+(em/60))-top);
          return `<div style="position:absolute;top:${top}%;left:4px;right:4px;height:${height}%;background:rgba(128,255,250,.12);border:1px solid var(--teal2);border-radius:10px;padding:3px 7px;font-size:var(--text-xs);color:var(--teal);z-index:2;overflow:hidden;cursor:pointer" onclick="editTask(${t.id})">${t.startTime.substring(0,5)} <b>${t.title}</b></div>`;
        }).join('')}
      </div>
    </div>`;

  // Position now line
  const now=new Date();
  const nowPct=timeToY(now.getHours()+(now.getMinutes()/60));
  const nl=document.getElementById('tgNowLine');
  if(nl)nl.style.top=nowPct+'%';
}

// Toggle between week strip and time grid
let timeGridActive=false;
function toggleTimeGrid(){
  timeGridActive=!timeGridActive;
  if(timeGridActive){
    renderTimeGrid(localDateStr(new Date()));
    document.getElementById('tgToggleBtn').textContent='Week View';
  } else {
    renderBriefWeekStrip();
    document.getElementById('tgToggleBtn').textContent='Time Grid';
  }
}

// ===== SMARTER MORNING BRIEFING =====
function buildDailyBriefSummary(){
  const now=new Date();
  const hour=now.getHours();
  const greeting=hour<12?'Good morning':hour<18?'Good afternoon':'Good evening';
  const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const day=days[now.getDay()];
  const todayStr=localDateStr(now);
  const weekEnd=new Date(now);weekEnd.setDate(weekEnd.getDate()+7);

  // Work deadlines — tasks due today or overdue
  const dueTodayTasks=(DB.tasks||[]).filter(t=>t.due===todayStr&&t.status!=='Done');
  const overdue=(DB.tasks||[]).filter(t=>t.due&&t.due<todayStr&&t.status!=='Done');
  const highPrio=(DB.tasks||[]).filter(t=>t.priority==='High'&&t.status!=='Done');

  // Buklod / Faith events this week
  const buklodEvents=(DB.calEvents||[]).filter(e=>{
    const d=new Date(e.date);return (e.type==='pu'||e.title?.toLowerCase().includes('buklod')||e.title?.toLowerCase().includes('church')||e.title?.toLowerCase().includes('faith'))&&d>=now&&d<=weekEnd;
  });

  // Today's calendar
  const todayEvents=(DB.calEvents||[]).filter(e=>e.date===todayStr);

  // Cash
  const credits=(DB.cashflow||[]).reduce((s,t)=>t.type==='Credit'?s+(t.amount||0):s,0);
  const debits=(DB.cashflow||[]).reduce((s,t)=>t.type==='Debit'?s+(t.amount||0):s,0);
  const balance=debits-credits;

  // Active clients
  const urgent=(DB.clients||[]).filter(c=>c.status==='Urgent').length;

  let parts=[];
  parts.push(`${greeting}. J.O.B Systems online. Today is ${day}.`);

  if(overdue.length>0) parts.push(`You have ${overdue.length} overdue task${overdue.length>1?'s':''} past their deadline.`);
  if(highPrio.length>0) parts.push(`${highPrio.length} high-priority task${highPrio.length>1?'s require':' requires'} attention.`);
  if(dueTodayTasks.length>0){
    const names=dueTodayTasks.slice(0,2).map(t=>t.title).join(' and ');
    parts.push(`Due today: ${names}${dueTodayTasks.length>2?` and ${dueTodayTasks.length-2} more`:''}.`);
  }
  if(todayEvents.length>0){
    const evts=todayEvents.slice(0,2).map(e=>`${e.title}${e.time?' at '+e.time:''}`).join(', ');
    parts.push(`On your calendar: ${evts}.`);
  }
  if(buklodEvents.length>0){
    const bNames=buklodEvents.slice(0,2).map(e=>e.title).join(' and ');
    parts.push(`Buklod this week: ${bNames}.`);
  }
  if(urgent>0) parts.push(`${urgent} urgent client${urgent>1?'s':''} need${urgent===1?'s':''} follow-up.`);
  parts.push(`Cash balance: ${balance>0?'surplus of':'deficit of'} ${Math.abs(Math.round(balance)).toLocaleString()} pesos.`);
  parts.push(`All systems nominal. Standing by.`);

  return parts.join(' ');
}

async function editMonthlyBudget(){
  const cur=(DB.budget&&DB.budget.monthlyLimit)||30000;
  const result=await jelixPrompt('Monthly Budget',[{key:'val',label:'Monthly budget limit (₱)',type:'number',default:String(cur)}],'Save');
  if(!result)return;
  const val=result[0];
  const num=parseFloat(val.replace(/[^0-9.]/g,''));
  if(isNaN(num)||num<=0){showToast('⚠ Enter a valid amount.');return;}
  DB.budget={monthlyLimit:num};
  localStorage.setItem('j-budget',JSON.stringify(DB.budget));
  renderBrief();
  showToast('✓ Budget updated');
}
let todayMoneyRangeDays=[7,14,30].includes(Number(localStorage.getItem('j-today-money-range')))?Number(localStorage.getItem('j-today-money-range')):7;
function setTodayMoneyRange(value){
  const days=Number(value);
  if(![7,14,30].includes(days))return;
  todayMoneyRangeDays=days;
  localStorage.setItem('j-today-money-range',String(days));
  renderQuietBrief();
}
function renderQuietBrief(){
  renderBriefWeekStrip();

  const now=new Date();
  const today=localDateStr(now);
  const tomorrowDate=new Date(now);tomorrowDate.setDate(now.getDate()+1);
  const tomorrow=localDateStr(tomorrowDate);
  const fmt=value=>'₱'+Math.abs(value||0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});
  const signedMoney=value=>(value<0?'-':'')+fmt(value);
  const dueLabel=task=>{
    if(!task.due)return'Open';
    if(task.due<today)return'Overdue';
    if(task.due===today)return'Today';
    if(task.due===tomorrow)return'Tomorrow';
    return new Date(task.due+'T12:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric',timeZone:'Asia/Manila'});
  };
  const worldNames={VENTURE:'Job Collectives',BUILD:'Code Collectives',SIDES:'Creative Collectives',FAITH:'Faith',LIFE:'Personal','WORK-IH':'Archive','WORK-CS':'Work'};
  const openTasks=(DB.tasks||[]).filter(task=>task.status!=='Done');
  const urgent=getAttentionTasks(6).slice(0,5);
  const overdueTasks=openTasks.filter(task=>task.due&&task.due<today);
  const dueTodayTasks=openTasks.filter(task=>task.due===today);

  const toDo=document.getElementById('briefToDo');
  if(toDo){
    toDo.innerHTML=urgent.length?urgent.map((task,index)=>`
      <button type="button" class="next-action-row${index===0?' is-first':''}" onclick="editTask(${task.id})">
        <span class="next-action-check" aria-hidden="true"></span>
        <span class="next-action-copy">
          <strong>${escapeHtml(task.title||'Untitled task')}</strong>
          <small>${escapeHtml(worldNames[task.world]||task.world||'Personal')}</small>
        </span>
        <span class="next-action-due"><span>${dueLabel(task)}</span><i class="ti ti-calendar"></i></span>
      </button>`).join(''):`<button type="button" class="next-actions-empty" onclick="openModal('taskModal')"><i class="ti ti-circle-check"></i><span>Your next-actions list is clear.</span><small>Add a task when something matters.</small></button>`;
  }

  const focusTitle=document.getElementById('todayFocusTitle');
  const focusMeta=document.getElementById('todayFocusMeta');
  const focusText=document.getElementById('todayFocusText');
  if(urgent.length){
    const focus=urgent[0];
    if(focusTitle)focusTitle.textContent=focus.title;
    if(focusMeta)focusMeta.innerHTML=`<span>${focus.priority==='High'?'High impact':escapeHtml(focus.priority||'Next action')}</span><i></i><span>${dueLabel(focus)}</span>`;
    if(focusText)focusText.textContent='Your clearest next move.';
  }else if(openTasks.length){
    if(focusTitle)focusTitle.textContent='Choose one useful next action';
    if(focusMeta)focusMeta.innerHTML=`<span>${openTasks.length} open task${openTasks.length===1?'':'s'}</span><i></i><span>No immediate pressure</span>`;
    if(focusText)focusText.textContent='Keep the day intentional.';
  }else{
    if(focusTitle)focusTitle.textContent='Protect the clear space';
    if(focusMeta)focusMeta.innerHTML='<span>Nothing urgent</span><i></i><span>Plan deliberately</span>';
    if(focusText)focusText.textContent='Use the calm well.';
  }

  const dailyBrief=document.getElementById('todayDailyBriefText');
  if(dailyBrief){
    if(overdueTasks.length){
      dailyBrief.innerHTML=`<strong>${overdueTasks.length} overdue item${overdueTasks.length===1?' needs':'s need'} a decision</strong><span>Clear the oldest commitment before adding more work.</span>`;
    }else if(dueTodayTasks.length){
      dailyBrief.innerHTML=`<strong>${dueTodayTasks.length} item${dueTodayTasks.length===1?' is':'s are'} due today</strong><span>Protect enough space to finish what already matters.</span>`;
    }else if(urgent.length){
      dailyBrief.innerHTML='<strong>Your priority queue is ready</strong><span>Start with the first high-impact action and keep the rest quiet.</span>';
    }else{
      dailyBrief.innerHTML='<strong>The day has breathing room</strong><span>Choose one meaningful action or protect the open space.</span>';
    }
  }

  const allCash=(DB.cashflow||[]);
  const accountNames=typeof getAccountNames==='function'?getAccountNames():[];
  const fallbackBalance=allCash.reduce((sum,entry)=>sum+(entry.type==='Debit'?entry.amount||0:-(entry.amount||0)),0);
  const available=accountNames.length&&typeof getTotalPortfolioBalance==='function'?getTotalPortfolioBalance():fallbackBalance;
  const rangeDays=todayMoneyRangeDays;
  const rangeDates=Array.from({length:rangeDays},(_,index)=>{const date=new Date(now);date.setDate(now.getDate()-((rangeDays-1)-index));return date;});
  const rangeStart=localDateStr(rangeDates[0]);
  const rangeCash=allCash.filter(entry=>entry.date>=rangeStart&&entry.date<=today);
  const rangeIncome=rangeCash.filter(entry=>entry.type==='Debit').reduce((sum,entry)=>sum+(entry.amount||0),0);
  const rangeExpenses=rangeCash.filter(entry=>entry.type==='Credit').reduce((sum,entry)=>sum+(entry.amount||0),0);
  const rangeNet=rangeIncome-rangeExpenses;
  const dailyNet=rangeDates.map(date=>{
    const dateString=localDateStr(date);
    return allCash.filter(entry=>entry.date===dateString).reduce((sum,entry)=>sum+(entry.type==='Debit'?entry.amount||0:-(entry.amount||0)),0);
  });
  const chartMax=Math.max(...dailyNet.map(value=>Math.abs(value)),1);
  const finance=document.getElementById('briefFinances');
  if(finance){
    const incomeCount=rangeCash.filter(entry=>entry.type==='Debit').length;
    const expenseCount=rangeCash.filter(entry=>entry.type==='Credit').length;
    finance.innerHTML=`
      <div class="money-topline">
        <div class="money-available">
          <span>Available balance</span>
          <strong class="${available<0?'negative':''}">${signedMoney(available)}</strong>
          <small>${accountNames.length} account${accountNames.length===1?'':'s'} connected</small>
        </div>
        <label class="money-range" aria-label="Money chart period"><select class="money-range-select" onchange="setTodayMoneyRange(this.value)"><option value="7"${rangeDays===7?' selected':''}>Last 7 days</option><option value="14"${rangeDays===14?' selected':''}>Last 14 days</option><option value="30"${rangeDays===30?' selected':''}>Last 30 days</option></select></label>
      </div>
      <div class="money-core">
        <div class="money-summary-stack">
          <div class="money-totals">
            <div><span>Income</span><strong class="income">+${fmt(rangeIncome)}</strong><small>${incomeCount} source${incomeCount===1?'':'s'}</small></div>
            <div><span>Expenses</span><strong class="expense">-${fmt(rangeExpenses)}</strong><small>${expenseCount} transaction${expenseCount===1?'':'s'}</small></div>
          </div>
          <div class="money-note"><span class="money-note-dot"></span><span>Net this period</span><strong class="${rangeNet<0?'negative':''}">${rangeNet>=0?'+':''}${signedMoney(rangeNet)}</strong></div>
        </div>
        <div class="money-chart-panel">
          <div class="money-chart-head"><span>Daily cash flow</span><small>${rangeNet<0?'Spending exceeded income':'Income stayed ahead'}</small></div>
          <div class="money-chart" style="--money-days:${rangeDays}" aria-label="${rangeDays} day cash flow">
            ${dailyNet.map((value,index)=>`<span class="money-bar-column" title="${rangeDates[index].toLocaleDateString('en-PH',{weekday:'long',month:'short',day:'numeric',timeZone:'Asia/Manila'})}: ${signedMoney(value)}"><i class="money-bar${value<0?' negative':index===rangeDays-1?' today':''}" style="height:${Math.max(8,Math.round(Math.abs(value)/chartMax*62))}px"></i><small>${rangeDays===7||index%5===0||index===rangeDays-1?rangeDates[index].toLocaleDateString('en-PH',{weekday:'short',timeZone:'Asia/Manila'}).slice(0,1):''}</small></span>`).join('')}
          </div>
        </div>
      </div>`;
  }

  const badge=document.getElementById('taskBadge');
  if(badge)badge.textContent=openTasks.length;
}
function renderBrief(){
  renderQuietBrief();
  return;
  renderOverheadScoreboard();
  renderBriefWorldTasks();
  renderBriefWeekStrip();

  // KEY METRICS: CASH FLOW — THIS MONTH ONLY, with budget overview and a proper-sized chart
  const now=new Date();
  const monthKey=now.toISOString().slice(0,7); // YYYY-MM
  const monthLabel=now.toLocaleDateString('en-PH',{month:'long',year:'numeric'});
  const monthTxns=DB.cashflow.filter(t=>(t.date||'').startsWith(monthKey));
  const debits=monthTxns.filter(t=>t.type==='Debit');
  const credits=monthTxns.filter(t=>t.type==='Credit');
  const total=debits.reduce((s,t)=>s+(t.amount||0),0);
  const creditTotal=credits.reduce((s,t)=>s+(t.amount||0),0);
  const balance=total-creditTotal;
  const fmt=v=>'₱'+v.toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});
  const signedMoney=v=>(v<0?'-':'')+fmt(Math.abs(v));
  // Budget overview — spend (credits/expenses) this month vs monthly limit
  const budgetLimit=(DB.budget&&DB.budget.monthlyLimit)||30000;
  const budgetPct=Math.min(100,Math.round((creditTotal/budgetLimit)*100));
  const budgetColor=budgetPct>=100?'var(--red)':budgetPct>=80?'var(--amber)':'var(--teal)';
  const budgetRemaining=budgetLimit-creditTotal;
  const accountNames=typeof getAccountNames==='function'?getAccountNames():[];
  const portfolioBalance=accountNames.length&&typeof getTotalPortfolioBalance==='function'?getTotalPortfolioBalance():balance;
  const recentTxns=[...monthTxns].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,5);
  const recentTxnsHtml=recentTxns.length?recentTxns.map(t=>{
    const income=t.type==='Debit';
    const description=escapeHtml(t.desc||t.description||'Transaction');
    const account=escapeHtml(t.account||'Cash');
    const date=t.date?new Date(t.date+'T12:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric',timeZone:'Asia/Manila'}):'';
    return `<div class="finance-row"><span class="finance-row-icon ${income?'income':'expense'}"><i class="ti ti-${income?'arrow-down-left':'arrow-up-right'}"></i></span><div class="finance-row-copy"><strong>${description}</strong><span>${account}${date?' · '+date:''}</span></div><span class="finance-amount ${income?'income':'expense'}">${income?'+':'-'}${fmt(Math.abs(t.amount||0))}</span></div>`;
  }).join(''):`<div class="finance-empty">No transactions this month.</div>`;
  const accountRowsHtml=accountNames.length?accountNames.slice(0,4).map(name=>{
    const accountBalance=getAccountBalance(name);
    return `<div class="finance-row"><span class="finance-row-icon account"><i class="ti ti-wallet"></i></span><div class="finance-row-copy"><strong>${escapeHtml(name)}</strong><span>Account balance</span></div><span class="finance-amount ${accountBalance>=0?'income':'expense'}">${signedMoney(accountBalance)}</span></div>`;
  }).join(''):`<div class="finance-empty">Add an account in Cash Flow to track balances here.</div>`;
  // Chart: trailing 7 days (not the whole month) — gives each bar enough
  // room for its own value label without overlapping its neighbors.
  const last7Dates=Array.from({length:7},(_,i)=>{
    const d=new Date(now);d.setDate(now.getDate()-(6-i));
    return d;
  });
  const dailySpend=last7Dates.map(d=>{
    const dayStr=localDateStr(d);
    return credits.filter(t=>t.date===dayStr).reduce((s,t)=>s+(t.amount||0),0);
  });
  const chartMax=Math.max(...dailySpend,1);
  const CH=52,CW=280,TOP_PAD=18; // TOP_PAD reserves headroom so the peak-value label never collides with its bar
  const maxIdx=dailySpend.indexOf(Math.max(...dailySpend));
  const slotW=CW/dailySpend.length;
  const barGap=Math.min(10,slotW*.25);
  const barW=Math.max(1.5,slotW-barGap);
  const gridLines=[0,1,2].map(i=>`<line x1="0" y1="${16+(CH-16)/2*i}" x2="${CW}" y2="${16+(CH-16)/2*i}" stroke="var(--border)" stroke-width="1"/>`).join('');
  const bars=dailySpend.map((v,i)=>{
    const h=Math.max(1.5,(v/chartMax)*(CH-TOP_PAD));
    const x=i*slotW+barGap/2;
    const y=CH-h;
    const isMax=i===maxIdx&&v>0;
    const isToday=i===dailySpend.length-1;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${isMax?'var(--amber)':isToday?'var(--teal)':'var(--teal3)'}"/>`;
  }).join('');
  const maxBarX=maxIdx*slotW+slotW/2;
  // With only 7 bars now, every non-zero day gets its own legible label —
  // this is the "per-day indicator" that a 31-bar month couldn't fit.
  const dayLabels=dailySpend.map((v,i)=>{
    if(v<=0||i===maxIdx)return'';
    const barX=i*slotW+slotW/2;
    const barY=CH-Math.max(1.5,(v/chartMax)*(CH-TOP_PAD));
    return `<text x="${barX.toFixed(1)}" y="${Math.max(barY-5,9).toFixed(1)}" font-size="8" fill="var(--text2)" text-anchor="middle" font-weight="700">₱${Math.round(v).toLocaleString()}</text>`;
  }).join('');
  const chartSvg=`<svg width="100%" height="${CH+16}" viewBox="0 0 ${CW} ${CH+16}" preserveAspectRatio="none" style="display:block;overflow:visible">
    ${gridLines}
    ${bars}
    ${dayLabels}
    ${chartMax>1?`<text x="${Math.min(Math.max(maxBarX,16),CW-16).toFixed(1)}" y="11" font-size="9" fill="var(--amber)" text-anchor="middle" font-weight="700">₱${Math.round(dailySpend[maxIdx]).toLocaleString()}</text>`:''}
  </svg>`;

  document.getElementById('briefFinances').innerHTML=`
    <div class="finance-period"><span>${monthLabel}</span><span>${accountNames.length?accountNames.length+' account'+(accountNames.length!==1?'s':''):'Cash view'}</span></div>
    <div class="finance-summary-grid">
      <div class="finance-metric primary"><span>Available</span><strong>${signedMoney(portfolioBalance)}</strong><small>Across accounts</small></div>
      <div class="finance-metric income"><span>Income</span><strong>+${fmt(total)}</strong><small>This month</small></div>
      <div class="finance-metric expense"><span>Expenses</span><strong>-${fmt(creditTotal)}</strong><small>This month</small></div>
      <div class="finance-metric ${budgetRemaining<0?'over':'budget'}"><span>Budget left</span><strong>${signedMoney(budgetRemaining)}</strong><small>${budgetPct}% used</small></div>
    </div>

    <!-- Daily spend — 7-day trailing window, one bar per day -->
    <div style="background:var(--navy3);border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
        <span style="font-size:var(--text-xs);color:var(--text3)">Last 7 days</span>
        <span style="font-size:var(--text-xs);color:var(--teal);font-weight:700">Today: ₱${Math.round(dailySpend[dailySpend.length-1]).toLocaleString()}</span>
      </div>
      ${chartSvg}
      <div style="display:flex;justify-content:space-between;margin-top:4px">
        ${last7Dates.map(d=>`<span style="font-size:9px;color:var(--text4);flex:1;text-align:center">${d.toLocaleDateString('en-PH',{weekday:'short',timeZone:'Asia/Manila'}).slice(0,2)}</span>`).join('')}
      </div>
    </div>

    <!-- Budget overview -->
    <div style="background:var(--navy3);border:1px solid var(--border);border-radius:10px;padding:10px 12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:var(--text-xs);color:var(--text3);font-weight:700;letter-spacing:.04em;text-transform:uppercase">Budget Overview</span>
        <span onclick="editMonthlyBudget()" style="font-size:var(--text-xs);color:var(--teal);cursor:pointer">Edit</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
        <span style="font-size:var(--text-sm);font-weight:700;color:${budgetColor}">${fmt(creditTotal)}</span>
        <span style="font-size:var(--text-xs);color:var(--text3)">of ${fmt(budgetLimit)}</span>
      </div>
      <div style="height:6px;background:var(--navy4);border-radius:4px;overflow:hidden">
        <div style="height:100%;width:${budgetPct}%;background:${budgetColor};border-radius:4px;transition:width .3s"></div>
      </div>
      <div style="font-size:var(--text-xs);color:var(--text3);margin-top:5px">${budgetPct}% of monthly budget used</div>
    </div>

    <div class="finance-subsection">
      <div class="finance-subsection-head"><span>Recent activity</span><button onclick="setView('life')">View all</button></div>
      ${recentTxnsHtml}
    </div>

    <div class="finance-subsection">
      <div class="finance-subsection-head"><span>Accounts</span><button onclick="setView('life')">Manage</button></div>
      ${accountRowsHtml}
      ${accountNames.length>4?`<div class="finance-more">+${accountNames.length-4} more in Cash Flow</div>`:''}
    </div>`;

  // TO DO NOW — full row list style matching screenshot
  const urgent=getAttentionTasks(6);
  const worldColor=w=>(w||'').startsWith('WORK-CS')?'var(--w-chainsmoker)':w==='VENTURE'?'var(--w-venture)':w==='BUILD'?'var(--w-build)':w==='SIDES'?'var(--w-sides)':w==='FAITH'?'var(--w-faith)':w==='LIFE'?'var(--w-life)':'var(--w-ideahub)';
  document.getElementById('briefToDo').innerHTML=urgent.map(t=>{
    const attentionLabel=t.due&&t.due<localDateStr(new Date())?'Overdue':t.due===localDateStr(new Date())?'Due today':t.status==='No Progress'?'Blocked':t.priority==='High'?'High priority':'Open';
    return `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--navy3);border:1px solid var(--border);border-radius:10px;cursor:pointer;transition:all .15s" onclick="editTask(${t.id})" onmouseover="this.style.background='rgba(0,255,242,.04)'" onmouseout="this.style.background='var(--navy3)'">
      <div style="width:18px;height:18px;border:1px solid var(--red);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <span style="color:var(--red);font-size:var(--text-xs);font-weight:900;line-height:1">!</span>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:var(--text-sm);font-weight:700;color:var(--text1);line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(t.title)}</div>
        <div style="font-size:var(--text-xs);color:var(--text3);margin-top:1px"><span style="color:var(--teal)">${attentionLabel}</span>${t.world?' · '+escapeHtml(t.world):''}${t.client?' · '+escapeHtml(t.client):''}${t.link?' · Link: <span style="color:var(--teal)">'+escapeHtml(t.link)+'</span>':''}</div>
      </div>
      <button onclick="event.stopPropagation();editTask(${t.id})" style="background:transparent;border:1px solid var(--border2);border-radius:8px;color:var(--text3);font-size:var(--text-xs);padding:3px 9px;cursor:pointer;flex-shrink:0;white-space:nowrap" onmouseover="this.style.borderColor='var(--teal)';this.style.color='var(--teal)'" onmouseout="this.style.borderColor='var(--border2)';this.style.color='var(--text3)'">Direct entry</button>
    </div>`;
  }).join('')||`<div style="font-size:var(--text-xs);color:var(--text3);padding:8px;text-align:center">No open tasks. Clean slate.</div>`;

  const due=DB.tasks.filter(t=>t.status!=='Done').length;
  const badge=document.getElementById('taskBadge');
  if(badge)badge.textContent=due;
  const focusTitle=document.getElementById('todayFocusTitle');
  const focusText=document.getElementById('todayFocusText');
  if(focusTitle&&focusText){
    if(urgent.length){
      focusTitle.textContent=urgent[0].title;
      focusText.textContent=urgent.length===1?'This is the clearest next move for today.':urgent.length+' tasks need attention. Start here, then move through the rest calmly.';
    }else if(due){
      focusTitle.textContent='Keep the day moving';
      focusText.textContent=due+' open task'+(due===1?'':'s')+' across your domains. Nothing urgent is asking for attention.';
    }else{
      focusTitle.textContent='A clear place to begin';
      focusText.textContent='No open tasks are competing for attention. Capture something new or use the time well.';
    }
  }
}

// ===== KANBAN BUILDER (shared) =====

// ════════════════════════════════════════════════════════════════════════
// JELIX BOARD ENGINE — Monday.com architecture: Workspace > Board > Group > Item > Subitem
// Supabase schema mapping: tasks (+ metadata JSONB) → DB.tasks
// ════════════════════════════════════════════════════════════════════════

// ── Schema: JSONB metadata fields mapped to task properties ──────────────
// task.groupId    → string  — which Group this item belongs to (null = world default)
// task.subitems   → array   — [{id, title, status, assignee}]
// task.timelineS  → string  — start date (YYYY-MM-DD)   — maps to metadata.timeline.start
// task.timelineE  → string  — end date                  — maps to metadata.timeline.end
// task.numValue   → number  — numeric aggregate field    — maps to metadata.number
// task.connBoard  → string  — 'SIDES'|'VENTURE'|null    — Operational Flywheel link
// task.connItemId → number  — linked item ID in connBoard

// ── Workspace → Board → Group config ─────────────────────────────────────
// BOARDS now derives live from DB.worlds (Domains) — renaming/adding/removing a Domain
// in Settings automatically reflects here, instead of a disconnected hardcoded list.
function getBoards(){
  const stripeFallback={'work-ih':'#80fffa','work-cs':'#ff2244',venture:'#ff8c00',build:'#00ff88',sides:'#ffaa00',faith:'#bf5fff',life:'#3b82f6'};
  const tgFallback={'work-ih':'tg-ih','work-cs':'tg-cs',venture:'tg-ven',build:'tg-bld',sides:'tg-sid',faith:'tg-fth',life:'tg-lif'};
  return (DB.worlds||[]).map(w=>{
    const taskWorldId=w.id.toUpperCase();
    const resolvedColor=(w.color&&/^#/.test(w.color))?w.color:(w.cssVar?'var('+w.cssVar+')':'var(--teal)');
    return{
      id:taskWorldId,
      name:w.label.replace(/^WORK\s*—\s*/,''), // short label for compact board cards
      icon:w.icon||'ti-star',
      color:resolvedColor,
      stripe:stripeFallback[w.id]||resolvedColor,
      tgClass:tgFallback[w.id]||'tg-lif',
    };
  });
}

// The New/Edit Task modal's Domain <select> uses fixed option VALUES
// (WORK-IH, VENTURE, BUILD, SIDES, FAITH, LIFE, WORK-CS) because those exact
// strings are compared against t.world all over the codebase — so they must
// stay put. But the option TEXT was hardcoded too, which is why renaming a
// domain (e.g. VENTURE → "Job Collectives") via Edit Domain updated the
// sidebar and kanban boards but not this dropdown. This keeps the text in
// sync with DB.worlds[i].label, the same source everything else reads from.
const TASK_WORLD_TO_DOMAIN_ID={'WORK-IH':'work-ih','VENTURE':'venture','BUILD':'build','SIDES':'sides','FAITH':'faith','LIFE':'life'};
function populateTaskWorldDropdown(){
  const sel=document.getElementById('tf-world');
  if(!sel)return;
  const cur=sel.value;
  [...sel.options].forEach(opt=>{
    const domainId=TASK_WORLD_TO_DOMAIN_ID[opt.value];
    const domain=domainId&&(DB.worlds||[]).find(w=>w.id===domainId);
    if(domain&&domain.label)opt.textContent=domain.label;
  });
  if(cur)sel.value=cur;
}

// ── Column visibility state ──────────────────────────────────────────────
const boardColVis={timeline:false,conn:false,time:true};
// Per-column width overrides set by dragging a header's resize handle,
// persisted so the layout survives reloads.
let boardColWidths={};
try{boardColWidths=JSON.parse(localStorage.getItem('j-board-col-widths')||'{}');}catch(e){boardColWidths={};}
function startColResize(e,colKey,colIdx){
  e.preventDefault();
  e.stopPropagation();
  const table=e.target.closest('table');
  if(!table)return;
  const th=table.querySelector(`th[data-col-key="${colKey}"]`);
  if(!th)return;
  const startX=e.clientX;
  const startW=th.getBoundingClientRect().width;
  const MIN_W=50;
  function onMove(ev){
    const newW=Math.max(MIN_W,Math.round(startW+(ev.clientX-startX)));
    th.style.width=newW+'px';
    table.querySelectorAll(`td:nth-child(${colIdx})`).forEach(td=>{td.style.width=newW+'px';});
    boardColWidths[colKey]=newW;
  }
  function onUp(){
    document.removeEventListener('mousemove',onMove);
    document.removeEventListener('mouseup',onUp);
    try{localStorage.setItem('j-board-col-widths',JSON.stringify(boardColWidths));}catch(e){}
  }
  document.addEventListener('mousemove',onMove);
  document.addEventListener('mouseup',onUp);
}
function toggleBoardCol(col,btn){
  boardColVis[col]=!boardColVis[col];
  btn.classList.toggle('active',boardColVis[col]);
  renderTasks();
}

// ── Supabase schema → DB.tasks mapping function ──────────────────────────
// Call after SB.load to normalise JSONB metadata into flat task fields
function normaliseSBTask(raw){
  const m=raw.metadata||{};
  return{
    ...raw,
    groupId:   raw.group_id   || raw.groupId   || null,
    subitems:  m.subitems     || raw.subitems   || [],
    timelineS: m.timeline?.start || raw.timelineS || raw.due || '',
    timelineE: m.timeline?.end   || raw.timelineE || '',
    numValue:  m.number       || raw.numValue   || null,
    connBoard: m.conn_board   || raw.connBoard  || null,
    connItemId:m.conn_item_id || raw.connItemId || null,
    driveLink: raw.link       || raw.driveLink  || '',
  };
}
// Patch SB.load to normalise after fetch
const _origSBLoad=SB.load.bind(SB);
SB.load=function(table,key,...args){
  return _origSBLoad(table,key,...args).then?.(r=>{
    if(key==='tasks'&&DB.tasks)DB.tasks=DB.tasks.map(normaliseSBTask);
    return r;
  });
};

// ── View state ────────────────────────────────────────────────────────────
let boardView=(typeof getPref==='function'&&getPref('pref-board-view'))||'table';
let boardSortCol='due',boardSortDir='asc';
let subitemExpanded=new Set();
let selectedTaskIds=new Set();
let collapsedGroups=new Set();

function setBoardView(v){
  boardView=v;
  ['table','kanban','boards','project'].forEach(vv=>{
    const b=document.getElementById('btv-'+vv);
    if(b)b.classList.toggle('active',vv===v);
  });
  const bb=document.getElementById('boardBody');
  if(bb){
    bb.style.cssText='flex:1;min-height:0;height:100%;overflow:'+(v==='kanban'?'hidden':'auto')+';display:flex;flex-direction:column';
  }
  renderTasks();
}

// ── Filter + sort pipeline ─────────────────────────────────────────────────
function getFilteredTasks(){
  const wf  = document.getElementById('taskFilter')?.value    || 'all';
  const sf  = document.getElementById('taskSF')?.value        || 'all';
  const prio= document.getElementById('filterPriority')?.value|| 'all';
  const dl  = document.getElementById('filterDeadline')?.value|| 'all';
  const tf  = document.getElementById('filterTime')?.value    || 'all';
  const cf  = document.getElementById('filterConn')?.value    || 'all';
  const plf = document.getElementById('filterPlatform')?.value|| 'all';
  const q   = (document.getElementById('boardSearch')?.value  || '').toLowerCase().trim();

  const today     = localDateStr(new Date());
  const weekEnd   = new Date(); weekEnd.setDate(weekEnd.getDate()+7);
  const weekEndStr= localDateStr(weekEnd);
  const monthEnd  = new Date(); monthEnd.setMonth(monthEnd.getMonth()+1);
  const monthEndStr=localDateStr(monthEnd);

  const tasks = DB.tasks.map(t=>normaliseSBTask(t)).filter(t=>{
    // Hide Done tasks unless specifically filtered for Done
    if(sf==='all' && t.status==='Done')              return false;
    // Board / world
    if(wf!=='all' && t.world!==wf)               return false;
    // Status
    if(sf!=='all' && t.status!==sf)               return false;
    // Priority
    if(prio!=='all' && t.priority!==prio)         return false;
    // Deadline range
    if(dl!=='all'){
      const due=t.due||'';
      if(dl==='overdue'  && !(due && due<today))  return false;
      if(dl==='today'    && due!==today)           return false;
      if(dl==='week'     && !(due>=today&&due<=weekEndStr)) return false;
      if(dl==='month'    && !(due>=today&&due<=monthEndStr))return false;
      if(dl==='none'     && due)                   return false;
    }
    // Time block
    if(tf==='timed'   && !t.startTime)            return false;
    if(tf==='untimed' && t.startTime)              return false;
    // Connected board
    if(cf==='none'    && t.connBoard)              return false;
    if(cf!=='all'&&cf!=='none' && t.connBoard!==cf)return false;
    // Platform
    if(plf!=='all' && (t.platform||'').toLowerCase()!==plf.toLowerCase()) return false;
    // Search
    if(q && !(t.title+' '+(t.client||'')+' '+(t.notes||'')+' '+(t.platform||'')).toLowerCase().includes(q)) return false;
    return true;
  });

  // Update active filter badge
  const activeCount=[wf,sf,prio,dl,tf,cf,plf].filter(v=>v!=='all'&&v!=='none').length+(q?1:0);
  const badge=document.getElementById('filterActiveBadge');
  if(badge){
    badge.style.display=activeCount>0?'':'none';
    badge.textContent=activeCount+' active';
  }
  return tasks;
}

function clearBoardFilters(){
  ['taskFilter','taskSF','filterPriority','filterDeadline','filterTime','filterConn','filterPlatform'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.value='all';
  });
  const s=document.getElementById('boardSearch');if(s)s.value='';
  renderTasks();
}

// Populate dynamic filters (platform) from live DB
function populateDynamicFilters(){
  // Platform
  const platforms=[...new Set(DB.tasks.filter(t=>t.platform).map(t=>t.platform))].sort();
  const plSel=document.getElementById('filterPlatform');
  if(plSel){
    const cur=plSel.value;
    plSel.innerHTML='<option value="all">Platform</option>'+platforms.map(p=>`<option value="${p}">${p}</option>`).join('');
    if(platforms.includes(cur))plSel.value=cur;
  }
}

function sortTasks(tasks){
  const dir=boardSortDir==='asc'?1:-1;
  return [...tasks].sort((a,b)=>{
    const av=a[boardSortCol]||'';const bv=b[boardSortCol]||'';
    return av<bv?-dir:av>bv?dir:0;
  });
}

// ── Timeline helpers ───────────────────────────────────────────────────────
function timelineBar(t){
  const s=t.timelineS||t.due||'';const e=t.timelineE||t.due||'';
  if(!s)return '<span style="color:var(--text3);font-size:var(--text-xs)">—</span>';
  const today=localDateStr(new Date());
  const sd=new Date(s),ed=new Date(e||s),nd=new Date(today);
  const total=Math.max((ed-sd)/86400000,1);
  const elapsed=Math.max(Math.min((nd-sd)/86400000,total),0);
  const pct=Math.round((elapsed/total)*100);
  const isOver=nd>ed;
  const isWarn=!isOver&&pct>70;
  const cls=isOver?'overdue':isWarn?'warning':'';
  const label=e&&e!==s?s+' → '+e:s;
  return`<div class="timeline-bar-wrap"><div class="timeline-bar"><div class="timeline-bar-fill ${cls}" style="width:${pct}%"></div></div><div class="timeline-dates">${label}</div></div>`;
}

// ── Connected board chip ───────────────────────────────────────────────────
function connChip(t){
  if(!t.connBoard)return '<span style="color:var(--text3);font-size:var(--text-xs)">—</span>';
  const isS=t.connBoard==='SIDES';
  return`<div class="conn-chip${isS?' sides':''}" onclick="event.stopPropagation();setView('${t.connBoard.toLowerCase()}')"><i class="ti ti-link" style="font-size:var(--text-xs);line-height:1;display:block"></i>${t.connBoard}${t.connItemId?' #'+t.connItemId:''}</div>`;
}

// ── World pill helper ──────────────────────────────────────────────────────
function worldPill(t){
  const b=getBoards().find(bd=>bd.id===t.world);
  const color=b?b.color:'var(--text3)';
  const stripe=b?b.stripe:'var(--border)';
  return`<span class="pill world-pill" style="font-size:var(--text-xs);color:${color};background:var(--navy3);border:1px solid ${stripe}">${b?b.name:t.world}</span>`;
}

// ── Subitem rows ───────────────────────────────────────────────────────────
function renderSubitemRows(t,colCount){
  if(!subitemExpanded.has(t.id))return'';
  const subs=t.subitems||[];
  const addRow=`<tr class="subitem-row"><td colspan="${colCount}" style="padding:4px 10px 4px 36px">
    <button class="add-subitem-btn" onclick="addSubitem(${t.id})"><i class="ti ti-plus" style="font-size:var(--text-xs);line-height:1;display:block"></i> Add sub-item</button>
  </td></tr>`;
  if(!subs.length)return addRow;
  return subs.map(s=>`<tr class="subitem-row" onclick="editSubitem(${t.id},'${s.id}')">
    <td><span style="opacity:.4;margin-right:4px">↳</span>${s.title||'Sub-item'}</td>
    <td></td><td>${s.assignee||'—'}</td>
    <td></td>
    <td><span class="pill ${taskStatusPillClass(s.status)}" style="font-size:var(--text-xs)">${s.status||'Todo'}</span></td>
    <td colspan="${colCount-5}"></td>
  </tr>`).join('')+addRow;
}

// ── Group aggregate footer ─────────────────────────────────────────────────
function groupFooter(tasks,colCount){
  const done=tasks.filter(t=>t.status==='Done').length;
  const total=tasks.length;
  const numSum=tasks.reduce((s,t)=>s+(t.numValue||0),0);
  const pct=total?Math.round((done/total)*100):0;
  return`<tr class="group-footer">
    <td colspan="2">${total} items · ${pct}% complete</td>
    <td colspan="2"></td>
    <td>${numSum>0?`<span class="num-agg">Σ ${numSum}</span>`:'—'}</td>
    <td colspan="${colCount-5}"></td>
  </tr>`;
}

function closeTaskRowMenus(exceptId){
  document.querySelectorAll('.task-row-menu.open').forEach(menu=>{
    if(menu.id===exceptId)return;
    menu.classList.remove('open');
    const trigger=menu.parentElement?.querySelector('.task-row-menu-trigger');
    if(trigger)trigger.setAttribute('aria-expanded','false');
  });
}
function toggleTaskRowMenu(event,taskId){
  event.preventDefault();
  event.stopPropagation();
  const menu=document.getElementById('task-row-menu-'+taskId);
  if(!menu)return;
  const shouldOpen=!menu.classList.contains('open');
  closeTaskRowMenus(shouldOpen?menu.id:null);
  menu.classList.toggle('open',shouldOpen);
  const trigger=menu.parentElement?.querySelector('.task-row-menu-trigger');
  if(trigger)trigger.setAttribute('aria-expanded',String(shouldOpen));
}
function toggleTaskDoneFromMenu(event,taskId){
  event.preventDefault();
  event.stopPropagation();
  const task=DB.tasks.find(item=>item.id===taskId);
  if(!task)return;
  moveKanbanTask(taskId,task.status==='Done'?'Todo':'Done');
  closeTaskRowMenus();
}
function formatTaskTableDate(dateStr){
  if(!dateStr)return'—';
  const date=new Date(dateStr+'T12:00:00');
  if(Number.isNaN(date.getTime()))return dateStr;
  const options={month:'short',day:'numeric',timeZone:'Asia/Manila'};
  if(date.getFullYear()!==new Date().getFullYear())options.year='numeric';
  return date.toLocaleDateString('en-PH',options);
}
document.addEventListener('click',event=>{
  if(!event.target.closest('.task-row-menu-wrap'))closeTaskRowMenus();
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape')closeTaskRowMenus();
});

// ── TABLE VIEW ─────────────────────────────────────────────────────────────
function renderBoardTable(tasks){
  const el=document.getElementById('boardBody');
  if(!el)return;

  // Equalized column widths — no auto stretch. User-resized widths (dragged
  // via the handle on each header) are persisted per column key and applied
  // as overrides on top of these defaults.
  const cols=[
    {key:'title',    label:'Item',      w:'280px',  sortable:true},
    {key:'world',    label:'Board',     w:'110px',  sortable:true},
    {key:'priority', label:'Priority',  w:'90px',   sortable:true},
    {key:'status',   label:'Status',    w:'110px',  sortable:true},
    {key:'due',      label:'Deadline',  w:'100px',  sortable:true},
    ...(boardColVis.time?[{key:'startTime',label:'Time',w:'90px',sortable:false}]:[]),
    {key:'platform', label:'Platform',  w:'100px',  sortable:true},
    {key:'_actions', label:'',          w:'42px',   sortable:false},
  ].map(c=>({...c,w:(boardColWidths[c.key]?boardColWidths[c.key]+'px':c.w)}));
  const cc=cols.length;

  // Group by world → then by groupId
  const boards=[...new Set(tasks.map(t=>t.world))];

  // Single scrollable container with ONE table — header stays aligned across all groups
  const thead='<tr>'+cols.map((c,i)=>{
    const idx=i+1;
    const sortCls=boardSortCol===c.key?'sort-'+boardSortDir:'';
    const sortAttr=c.sortable?`onclick="toggleBoardSort('${c.key}')"`:'';
    const sortArrow=c.sortable?'<span class="sort-arrow"></span>':'';
    const resizeHandle=c.key!=='_actions'?`<span class="col-resize-handle" onclick="event.stopPropagation()" onmousedown="startColResize(event,'${c.key}',${idx})"></span>`:'';
    return `<th data-col-key="${c.key}" data-col-idx="${idx}" style="width:${c.w}" class="${sortCls}" ${sortAttr}>${c.label}${sortArrow}${resizeHandle}</th>`;
  }).join('')+'</tr>';
  let tbodyHtml='';

  boards.forEach(world=>{
    const boardTasks=sortTasks(tasks.filter(t=>t.world===world));
    const board=getBoards().find(b=>b.id===world)||{name:world,tgClass:'tg-lif',color:'var(--text2)',stripe:'#666'};
    const groupIds=[...new Set(boardTasks.map(t=>t.groupId||'_default'))];
    groupIds.forEach(gid=>{
      const gTasks=boardTasks.filter(t=>(t.groupId||'_default')===gid);
      const gLabel=gid==='_default'?board.name:gid;
      const gKey=world+'::'+gid;
      const collapsed=collapsedGroups.has(gKey);
      const stripe=board.stripe||'var(--border)';
      // Group header row — spans all columns
      tbodyHtml+=`<tr class="group-header-row" onclick="toggleGroup('${gKey}')" style="cursor:pointer">
        <td colspan="${cc}" style="padding:7px 12px;background:var(--navy3);border-left:4px solid ${stripe};border-bottom:1px solid var(--border)">
          <div style="display:flex;align-items:center;gap:8px">
            <i class="ti ti-chevron-${collapsed?'right':'down'}" style="font-size:var(--text-xs);color:var(--text3);line-height:1;display:block;transition:transform .2s"></i>
            <span class="board-group-name" style="font-size:var(--text-xs);font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:${board.color}">${gLabel}</span>
            <span style="font-size:var(--text-xs);background:var(--navy2);border:1px solid var(--border);border-radius:10px;padding:1px 7px;color:var(--text3)">${gTasks.length}</span>
            <button onclick="event.stopPropagation();openTaskFor('${world}')" style="margin-left:auto;border:1px solid var(--border2);border-radius:8px;padding:2px 8px;cursor:pointer;background:transparent;font-size:var(--text-xs);color:var(--text3)">+ Add item</button>
          </div>
        </td>
      </tr>`;
      if(!collapsed){
        gTasks.forEach(t=>{
          const sel=selectedTaskIds.has(t.id);
          const hasSubs=(t.subitems||[]).length;
          const expanded=subitemExpanded.has(t.id);
          tbodyHtml+=`<tr class="item-row${sel?' selected':''}" data-id="${t.id}" onclick="editTask(${t.id})" oncontextmenu="showCtx(event,${t.id},'task')" style="font-size:12px;cursor:grab">
            <td style="font-weight:600;width:280px;max-width:280px">
              <div style="display:flex;align-items:center;gap:6px;overflow:hidden">
                ${hasSubs?`<button class="subitem-toggle-btn" onclick="event.stopPropagation();toggleSubitems(${t.id})">${expanded?'▾':'▸'}</button>`:'<span style="width:14px;display:inline-block;flex-shrink:0"></span>'}
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${t.title}</span>
                ${t.recur&&t.recur!=='none'?`<i class="ti ti-repeat" title="Repeats: ${t.recur}" style="color:var(--text3);font-size:11px;flex-shrink:0"></i>`:''}
                ${t.priority==='High'?'<span style="color:var(--red);font-size:11px;flex-shrink:0">!</span>':''}
              </div>
            </td>
            <td style="width:110px">${worldPill(t)}</td>
            <td style="width:90px"><span style="display:flex;align-items:center;gap:4px"><div class="pdot ${t.priority==='High'?'ph':t.priority==='Medium'?'pm':'pl'}"></div>${t.priority||'—'}</span></td>
            <td style="width:110px"><span class="pill ${taskStatusPillClass(t.status)}">${t.status}</span></td>
            <td class="${t.due&&t.due<localDateStr(new Date())?'task-date-overdue':''}" style="width:100px;color:var(--text3)">${formatTaskTableDate(t.due)}</td>
            ${boardColVis.time?`<td style="width:90px;color:var(--text3)">${t.startTime?to12h(t.startTime)+(t.endTime?' – '+to12h(t.endTime):''):'—'}</td>`:''}
            <td style="width:100px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.platform||'—'}</td>
            <td class="task-row-actions" style="width:42px" onclick="event.stopPropagation()">
              <div class="task-row-menu-wrap">
                <button class="task-row-menu-trigger" type="button" aria-label="Task actions" aria-expanded="false" onclick="toggleTaskRowMenu(event,${t.id})"><i class="ti ti-dots"></i></button>
                <div class="task-row-menu" id="task-row-menu-${t.id}" role="menu">
                  <button type="button" role="menuitem" onclick="event.stopPropagation();closeTaskRowMenus();editTask(${t.id})"><i class="ti ti-pencil"></i><span>Edit task</span></button>
                  <button type="button" role="menuitem" onclick="toggleTaskDoneFromMenu(event,${t.id})"><i class="ti ti-${t.status==='Done'?'rotate-clockwise':'circle-check'}"></i><span>${t.status==='Done'?'Reopen':'Mark done'}</span></button>
                  <button type="button" role="menuitem" class="danger" onclick="closeTaskRowMenus();deleteTask(event,${t.id})"><i class="ti ti-trash"></i><span>Delete task</span></button>
                </div>
              </div>
            </td>
          </tr>
          ${renderSubitemRows(t,cc)}`;
        });
        const done=gTasks.filter(t=>t.status==='Done').length;
        const pct=gTasks.length?Math.round((done/gTasks.length)*100):0;
        tbodyHtml+=`<tr class="group-footer"><td colspan="${cc}" style="padding:4px 12px 8px"><span style="font-size:var(--text-xs);color:var(--text3)">${gTasks.length} items · ${pct}% complete</span></td></tr>`;
      }
    });
  });

  if(!tasks.length) tbodyHtml+='<tr><td colspan="'+cc+'" style="padding:32px;text-align:center;color:var(--text3);font-size:var(--text-sm)">No tasks match the current filters.</td></tr>';

  el.innerHTML='<div class="task-table-scroll"><table class="board-table" style="min-width:1000px;table-layout:fixed;width:100%"><thead>'+thead+'</thead><tbody>'+tbodyHtml+'</tbody></table></div>';
}

// ── KANBAN VIEW (upgraded with subitems + timeline + connected) ────────────
function renderBoardKanban(tasks){
  const el=document.getElementById('boardBody');
  if(!el)return;
  const statuses=['Todo','In Progress','No Progress','Done'];
  const sc={'Todo':taskStatusColor('Todo'),'In Progress':taskStatusColor('In Progress'),'No Progress':taskStatusColor('No Progress'),'Done':taskStatusColor('Done')};
  const sch={'Todo':taskStatusPillClass('Todo'),'In Progress':taskStatusPillClass('In Progress'),'No Progress':taskStatusPillClass('No Progress'),'Done':taskStatusPillClass('Done')};
  const isMobile=window.innerWidth<=768;

  // Build world color map from DB.worlds (handles renamed worlds)
  const worldColorMap={};
  (DB.worlds||[]).forEach(w=>{
    worldColorMap[w.id]=(w.color&&/^#/.test(w.color))?w.color:('var('+(w.cssVar||'--teal')+')');
  });

  el.style.cssText='flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column';
  let html=`<div style="display:flex;flex:1;${isMobile?'flex-direction:column;overflow-y:auto;overflow-x:hidden':'overflow-x:auto;overflow-y:hidden'};gap:10px;padding:12px">`;
  statuses.forEach(s=>{
    const items=tasks.filter(t=>t.status===s);
    html+=`<div class="kb-status-col" data-status="${s}" ondragover="event.preventDefault();this.style.background='var(--hover-tint)'" ondragleave="this.style.background=''" ondrop="handleKanbanDrop(event,'${s}')" style="display:flex;flex-direction:column;${isMobile?'width:100%;flex-shrink:0':'flex:1 1 0;min-width:240px'};background:var(--navy2);border:1px solid var(--border);border-top:2px solid ${sc[s]};border-radius:12px;overflow:hidden;transition:background .15s">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--border);background:var(--hover-tint)">
        <span style="font-size:var(--text-xs);font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:${sc[s]}">${s}</span>
        <span style="font-size:var(--text-xs);font-weight:700;color:var(--text3)">${items.length}</span>
      </div>
      <div style="${isMobile?'max-height:340px':'flex:1'};overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:6px">
        ${items.length?items.map(t=>{
          const wColor=worldColorMap[t.world]||'var(--border)';
          return`<div draggable="true" ondragstart="handleKanbanDragStart(event,${t.id})" ondragend="this.style.opacity='1'" onclick="editTask(${t.id})" style="background:var(--navy3);border:1px solid var(--border);border-left:3px solid ${wColor};border-radius:8px;padding:10px 12px;cursor:grab;transition:all .15s" onmouseover="this.style.boxShadow='0 2px 12px rgba(0,0,0,.3)'" onmouseout="this.style.boxShadow=''">
            <div style="font-size:var(--text-sm);font-weight:600;color:var(--text1);margin-bottom:4px;line-height:1.4">${t.title}</div>
            ${t.client?`<div style="font-size:var(--text-xs);color:var(--teal);margin-bottom:3px">${t.client}</div>`:''}
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px">
              ${t.due?`<span style="font-size:9px;color:var(--text3)"><i class="ti ti-calendar" style="font-size:9px"></i> ${t.due}</span>`:''}
              <span class="kanban-priority-badge priority-${String(t.priority||'Low').toLowerCase()}" style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:8px">${t.priority||'Low'}</span>
            </div>
            ${isMobile&&s!=='Done'?`<div style="display:flex;gap:4px;margin-top:8px" onclick="event.stopPropagation()">${statuses.filter(x=>x!==s).map(x=>`<button onclick="moveKanbanTask(${t.id},'${x}')" style="flex:1;font-size:9px;padding:4px 2px;background:transparent;border:1px solid var(--border2);border-radius:5px;color:var(--text3)">→ ${x}</button>`).join('')}</div>`:''}
          </div>`;
        }).join(''):`<div style="font-size:var(--text-xs);color:var(--text3);text-align:center;padding:16px">Drop tasks here</div>`}
      </div>
      <div onclick="openTaskForStatus('all','${s}')" style="padding:8px 12px;border-top:1px solid var(--border);font-size:var(--text-xs);color:var(--text3);cursor:pointer;text-align:center;transition:color .15s" onmouseover="this.style.color='var(--teal)'" onmouseout="this.style.color='var(--text3)'">
        <i class="ti ti-plus" style="font-size:11px;line-height:1;display:inline-block;margin-right:4px"></i>Add item
      </div>
    </div>`;
  });
  html+='</div>';
  el.innerHTML=html;
}
let _kanbanDragTaskId=null;
function handleKanbanDragStart(e,taskId){
  _kanbanDragTaskId=taskId;
  e.dataTransfer.effectAllowed='move';
  e.target.style.opacity='.4';
}
function handleKanbanDrop(e,newStatus){
  e.preventDefault();
  e.currentTarget.style.background='';
  if(_kanbanDragTaskId!=null){moveKanbanTask(_kanbanDragTaskId,newStatus);_kanbanDragTaskId=null;}
}
function moveKanbanTask(taskId,newStatus){
  const t=DB.tasks.find(x=>x.id===taskId);
  if(!t||t.status===newStatus)return;
  t.status=newStatus;
  save('tasks');
  SB.update('tasks',t.id,t,'tasks');
  addHistory('edit','Moved "'+t.title+'" to '+newStatus,{...t,_dbKey:'tasks'});
  renderTasks();
  showToast('✓ Moved to '+newStatus);
}

// ── PROJECT VIEW (group by Project within each Domain, drag to reassign) ──
// Mirrors the Kanban view's structure and drag-and-drop mechanism exactly
// (handleKanbanDragStart/handleKanbanDrop/moveKanbanTask above), just with
// Project as the grouping axis instead of Status, and one section-row per
// Domain since a Project never crosses Domains.
function renderBoardProjectGrouped(tasks){
  const el=document.getElementById('boardBody');
  if(!el)return;
  el.style.cssText='flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column';
  const worldsPresent=[...new Set(tasks.map(t=>t.world))];
  if(!worldsPresent.length){
    el.innerHTML='<div id="projBulkBar"></div><div style="padding:32px;text-align:center;color:var(--text3);font-size:var(--text-sm)">No tasks match the current filters.</div>';
    updateProjBulkBar();
    return;
  }
  let html='<div id="projBulkBar"></div><div style="padding:12px;display:flex;flex-direction:column;gap:18px">';
  worldsPresent.forEach(worldId=>{
    const board=getBoards().find(b=>b.id===worldId)||{name:worldId,color:'var(--text2)'};
    const worldTasks=tasks.filter(t=>t.world===worldId);
    const projects=getProjectsForWorld(worldId);
    const sections=[...projects.map(p=>({id:p.id,name:p.name})),{id:null,name:'Unassigned'}];
    html+=`<div>
      <div style="font-size:var(--text-xs);font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${board.color};margin-bottom:8px">${board.name}</div>
      <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:6px">
        ${sections.map(sec=>{
          const secTasks=worldTasks.filter(t=>(t.projectId||null)===sec.id);
          // Completion progress only makes sense for a real Project — the
          // "Unassigned" bucket is a catch-all, not something with a
          // deliverable to track completion against. Computed from the
          // FULL unfiltered task list, not `tasks`/`secTasks` — the board's
          // default filter already hides Done tasks from the visible list,
          // so deriving progress from what's shown would always read 0%.
          const allProjTasks=sec.id?(DB.tasks||[]).filter(t=>t.world===worldId&&t.projectId===sec.id):[];
          const doneCount=allProjTasks.filter(t=>t.status==='Done').length;
          const pct=allProjTasks.length?Math.round(doneCount/allProjTasks.length*100):0;
          return `<div ondragover="event.preventDefault();this.style.background='var(--hover-tint)'" ondragleave="this.style.background=''" ondrop="handleProjectDrop(event,${sec.id?`'${sec.id}'`:'null'},'${worldId}')" style="min-width:220px;flex:1 1 220px;background:var(--navy2);border:1px solid var(--border);border-radius:12px;overflow:hidden;transition:background .15s">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid var(--border);background:var(--hover-tint)">
              <span style="font-size:var(--text-xs);font-weight:700;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${sec.name}</span>
              <span style="display:flex;align-items:center;gap:2px;flex-shrink:0">
                <span style="font-size:var(--text-xs);color:var(--text3);margin-right:2px">${sec.id?doneCount+'/'+allProjTasks.length:secTasks.length}</span>
                ${sec.id?`<button onclick="event.stopPropagation();renameProject('${sec.id}')" title="Rename" style="background:transparent;border:none;color:var(--text3);cursor:pointer;padding:2px"><i class="ti ti-pencil" style="font-size:10px"></i></button><button onclick="event.stopPropagation();deleteProject('${sec.id}')" title="Delete" style="background:transparent;border:none;color:var(--text3);cursor:pointer;padding:2px"><i class="ti ti-trash" style="font-size:10px"></i></button>`:''}
              </span>
            </div>
            ${sec.id&&allProjTasks.length?`<div style="height:3px;background:var(--navy3)"><div style="height:100%;width:${pct}%;background:var(--teal);transition:width .2s"></div></div>`:''}
            <div style="padding:6px;display:flex;flex-direction:column;gap:5px;min-height:64px">
              ${secTasks.length?secTasks.map(t=>`<div draggable="true" ondragstart="handleProjectDragStart(event,${t.id})" ondragend="this.style.opacity='1'" onclick="editTask(${t.id})" style="background:var(--navy3);border:1px solid var(--border);border-radius:8px;padding:8px 10px;cursor:grab;display:flex;gap:6px;align-items:flex-start">
                <input type="checkbox" onclick="event.stopPropagation()" onchange="toggleTaskSelect(${t.id},this.checked)" ${selectedTaskIds.has(t.id)?'checked':''} style="width:auto;accent-color:var(--teal);margin-top:2px;flex-shrink:0">
                <div style="min-width:0;flex:1">
                  <div style="color:var(--text1);font-weight:600;font-size:var(--text-xs);margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.title}</div>
                  <span class="pill ${taskStatusPillClass(t.status)}" style="font-size:9px">${t.status}</span>
                </div>
              </div>`).join(''):'<div style="font-size:var(--text-xs);color:var(--text3);text-align:center;padding:10px">Drop here</div>'}
            </div>
          </div>`;
        }).join('')}
        <div style="flex-shrink:0;display:flex;flex-direction:column;gap:6px;align-items:stretch">
          <button onclick="createProjectFlow('${worldId}')" style="background:transparent;border:1px dashed var(--border2);border-radius:12px;padding:0 16px;color:var(--text3);font-size:var(--text-xs);cursor:pointer;white-space:nowrap;flex:1"><i class="ti ti-plus"></i> New Project</button>
          ${projects.length>1?`<button onclick="mergeProjectsFlow('${worldId}')" style="background:transparent;border:1px dashed var(--border2);border-radius:12px;padding:0 16px;color:var(--text3);font-size:var(--text-xs);cursor:pointer;white-space:nowrap;flex:1"><i class="ti ti-arrows-join"></i> Merge</button>`:''}
        </div>
      </div>
    </div>`;
  });
  html+='</div>';
  el.innerHTML=html;
  updateProjBulkBar();
}
function toggleTaskSelect(taskId,checked){
  if(checked)selectedTaskIds.add(taskId);
  else selectedTaskIds.delete(taskId);
  updateProjBulkBar();
}
function clearProjSelection(){
  selectedTaskIds.clear();
  updateProjBulkBar();
  // Selection state also drives the row-highlight in Table view, which
  // needs a real re-render (not just the lightweight bulk-bar update) to
  // clear; Project view's checkboxes already reflect state on their own.
  if(boardView==='table')renderTasks();
}
// Bulk "Move to Project" — only makes sense when every selected task
// belongs to the same Domain (a Project can't span Domains), so the bar
// disables the picker with an explanatory hint otherwise rather than
// silently doing something wrong.
function updateProjBulkBar(){
  const bar=document.getElementById('projBulkBar');
  if(!bar)return;
  const n=selectedTaskIds.size;
  if(!n){bar.innerHTML='';bar.style.display='none';return;}
  bar.style.display='block';
  const selected=[...selectedTaskIds].map(id=>DB.tasks.find(t=>t.id===id)).filter(Boolean);
  const worldsInSelection=new Set(selected.map(t=>t.world));
  const sameDomain=worldsInSelection.size===1;
  const worldId=sameDomain?[...worldsInSelection][0]:null;
  bar.innerHTML=`<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;margin:12px 12px 0;background:var(--navy3);border:1px solid var(--teal2);border-radius:12px;flex-wrap:wrap">
    <span style="font-size:var(--text-xs);font-weight:700;color:var(--text1)">${n} selected</span>
    ${sameDomain
      ?`<span style="font-size:var(--text-xs);color:var(--text3)">Move to:</span><select onchange="bulkMoveSelectedTasksToProject(this.value)" style="font-size:var(--text-xs);padding:4px 8px;width:auto">${projectOptionsHtml(worldId,'')}</select>`
      :`<span style="font-size:var(--text-xs);color:var(--text3)">Select tasks from one Domain to bulk-move Project.</span>`}
    <button onclick="clearProjSelection()" style="margin-left:auto;background:transparent;border:1px solid var(--border2);border-radius:8px;color:var(--text3);font-size:var(--text-xs);padding:4px 10px;cursor:pointer">Clear</button>
  </div>`;
}
async function bulkMoveSelectedTasksToProject(projectIdOrNew){
  const worldId=[...selectedTaskIds].map(id=>DB.tasks.find(t=>t.id===id)).find(Boolean)?.world;
  if(projectIdOrNew==='__new__'){
    const p=await createProjectFlow(worldId);
    if(!p){updateProjBulkBar();return;}
    projectIdOrNew=p.id;
  }
  const newProjectId=projectIdOrNew||null;
  selectedTaskIds.forEach(id=>{
    const t=DB.tasks.find(x=>x.id===id);
    if(!t)return;
    t.projectId=newProjectId;
    SB.update('tasks',t.id,{projectId:newProjectId},'tasks').catch(()=>{});
  });
  save('tasks');
  addHistory('edit',`Bulk-moved ${selectedTaskIds.size} task(s) to Project`,{_dbKey:'tasks'});
  selectedTaskIds.clear();
  renderTasks();
  showToast('✓ Moved');
}
let _projectDragTaskId=null;
function handleProjectDragStart(e,taskId){
  _projectDragTaskId=taskId;
  e.dataTransfer.effectAllowed='move';
  e.target.style.opacity='.4';
}
function handleProjectDrop(e,projectId,worldId){
  e.preventDefault();
  e.currentTarget.style.background='';
  if(_projectDragTaskId==null)return;
  const t=DB.tasks.find(x=>x.id===_projectDragTaskId);
  _projectDragTaskId=null;
  if(!t)return;
  // Projects don't cross Domains — dragging a task's card only ever
  // appears within its own Domain's row, but guard anyway in case a
  // future layout ever mixes rows.
  if(t.world!==worldId){showToast('⚠ Can only reassign Project within the same Domain.');return;}
  const newProjectId=projectId||null;
  if((t.projectId||null)===newProjectId)return;
  t.projectId=newProjectId;
  save('tasks');
  SB.update('tasks',t.id,{projectId:newProjectId},'tasks').catch(()=>{});
  renderTasks();
}

// ── BOARDS LIST VIEW (Workspace overview) ─────────────────────────────────
function renderBoardsListView(){
  const el=document.getElementById('boardBody');
  if(!el)return;
  let html='<div class="board-list-grid">';
  getBoards().forEach(b=>{
    const items=DB.tasks.filter(t=>t.world===b.id);
    const todo=items.filter(t=>t.status==='Todo'||!t.status).length;
    const inProg=items.filter(t=>t.status==='In Progress').length;
    const noProg=items.filter(t=>t.status==='No Progress').length;
    const done=items.filter(t=>t.status==='Done').length;
    const open=items.length-done;
    const pct=items.length?Math.round((done/items.length)*100):0;
    const highPriority=items.filter(t=>t.status!=='Done'&&t.priority==='High');
    const nextUp=items.filter(t=>t.status!=='Done').sort((a,c)=>(a.due||'9999')<(c.due||'9999')?-1:1)[0];
    html+=`<div class="board-card workspace-board-card" onclick="document.getElementById('taskFilter').value='${b.id}';setBoardView('table')">
      <div class="board-card-stripe"></div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <div style="width:36px;height:36px;border-radius:9px;background:${b.color}18;border:1px solid ${b.color}35;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="ti ${b.icon}" style="color:${b.color};font-size:17px;line-height:1;display:block"></i></div>
        <div style="flex:1;min-width:0">
          <div class="board-card-name" style="font-size:var(--text-md);margin-bottom:1px">${b.name}</div>
          <div class="board-card-meta">${items.length} total · ${open} open</div>
        </div>
        <div class="workspace-board-progress-label">${pct}%</div>
      </div>
      <div style="background:var(--navy3);border-radius:10px;height:6px;overflow:hidden;margin-bottom:14px">
        <div class="workspace-board-progress" style="width:${pct}%"></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px">
        <div class="workspace-board-stat">
          <div style="font-size:15px;font-weight:800;color:var(--text1)">${todo+noProg}</div>
          <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em">To Do</div>
        </div>
        <div class="workspace-board-stat is-active">
          <div style="font-size:15px;font-weight:800">${inProg}</div>
          <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em">Active</div>
        </div>
        <div class="workspace-board-stat is-done">
          <div style="font-size:15px;font-weight:800">${done}</div>
          <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em">Done</div>
        </div>
      </div>
      <div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:flex-end;gap:6px">
        ${highPriority.length?`<div style="font-size:var(--text-xs);color:var(--red);display:flex;align-items:center;gap:5px"><i class="ti ti-alert-triangle" style="font-size:11px"></i>${highPriority.length} high priority open</div>`:''}
        ${nextUp?`<div style="font-size:var(--text-xs);color:var(--text2);background:var(--hover-tint);border:1px solid var(--border);border-radius:12px;padding:7px 10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">→ ${nextUp.title}${nextUp.due?' · '+nextUp.due:''}</div>`:'<div style="font-size:var(--text-xs);color:var(--text3)">All caught up.</div>'}
        <button class="btn btn-g" style="font-size:var(--text-xs);justify-content:center;margin-top:2px" onclick="event.stopPropagation();openTaskFor('${b.id}')"><i class="ti ti-plus" style="font-size:11px;line-height:1;display:inline-block;margin-right:4px"></i>Add Task</button>
      </div>
    </div>`;
  });
  html+='</div>';
  el.innerHTML=html;
}

// ── GROUP / SUBITEM HELPERS ────────────────────────────────────────────────
function toggleGroup(key){
  if(collapsedGroups.has(key))collapsedGroups.delete(key);
  else collapsedGroups.add(key);
  renderTasks();
}
function toggleBoardSort(col){
  if(boardSortCol===col)boardSortDir=boardSortDir==='asc'?'desc':'asc';
  else{boardSortCol=col;boardSortDir='asc';}
  renderTasks();
}
function toggleSubitems(id){
  if(subitemExpanded.has(id))subitemExpanded.delete(id);
  else subitemExpanded.add(id);
  renderTasks();
}
async function addSubitem(taskId){
  const t=DB.tasks.find(x=>x.id===taskId);if(!t)return;
  const result=await jelixPrompt('New Sub-item',[{key:'title',label:'Sub-item title'}],'Add');
  const title=result?.[0];if(!title)return;
  if(!t.subitems)t.subitems=[];
  const sub={id:'sub_'+Date.now(),title:title.trim(),status:'Todo',assignee:''};
  t.subitems.push(sub);
  subitemExpanded.add(taskId);
  SB.update('tasks',t.id,t,'tasks');
  renderTasks();
  showToast('✓ Sub-item added');
}
async function editSubitem(taskId,subId){
  const t=DB.tasks.find(x=>x.id===taskId);if(!t)return;
  const sub=t.subitems?.find(s=>s.id===subId);if(!sub)return;
  const result=await jelixPrompt('Edit Sub-item',[{key:'title',label:'Sub-item title',default:sub.title}],'Save');
  if(!result)return;
  sub.title=result[0].trim();
  SB.update('tasks',t.id,t,'tasks');
  renderTasks();
}

// ── Operational Flywheel connector ────────────────────────────────────────
// Links Sides income tasks → Venture pipeline items
function linkSidesToVenture(sideTaskId,ventureTaskId){
  const s=DB.tasks.find(t=>t.id===sideTaskId);
  const v=DB.tasks.find(t=>t.id===ventureTaskId);
  if(!s||!v)return showToast('Task not found');
  s.connBoard='VENTURE';s.connItemId=ventureTaskId;
  v.connBoard='SIDES';v.connItemId=sideTaskId;
  SB.update('tasks',s.id,s,'tasks');
  SB.update('tasks',v.id,v,'tasks');
  reRenderAll();
  showToast('✓ Flywheel linked: '+s.title+' ↔ '+v.title);
}
// Auto-link on save: if task is SIDES with a Venture client, find or flag
function autoFlywheelLink(t){
  if(t.world==='SIDES'&&t.client){
    const vLink=DB.tasks.find(v=>v.world==='VENTURE'&&v.name===t.client||v.title===t.client);
    if(vLink&&!t.connBoard){linkSidesToVenture(t.id,vLink.id);}
  }
}

// ── Keyboard-first navigation (Tasks table view) ────────────────────────
// j/k move a focus cursor between rows, Enter/o opens it, d toggles
// Done, x deletes (recoverable via the existing delete-undo toast).
// Scoped to the Tasks view, and bails whenever a text input, select, or
// any modal is active so it never hijacks normal typing.
let _kbdFocusTaskId=null;
function _getVisibleTaskRowIds(){
  return[...document.querySelectorAll('#view-tasks .item-row')].map(r=>parseInt(r.dataset.id,10)).filter(id=>!isNaN(id));
}
function _kbdRenderFocus(){
  document.querySelectorAll('#view-tasks .item-row').forEach(r=>r.classList.toggle('kbd-focus',parseInt(r.dataset.id,10)===_kbdFocusTaskId));
  const el=document.querySelector('#view-tasks .item-row.kbd-focus');
  if(el)el.scrollIntoView({block:'nearest'});
}
function _kbdMoveFocus(dir){
  const ids=_getVisibleTaskRowIds();
  if(!ids.length)return;
  const idx=ids.indexOf(_kbdFocusTaskId);
  const next=idx<0?(dir>0?0:ids.length-1):Math.min(Math.max(idx+dir,0),ids.length-1);
  _kbdFocusTaskId=ids[next];
  _kbdRenderFocus();
}
document.addEventListener('keydown',e=>{
  if(currentView!=='tasks')return;
  const tag=(document.activeElement||{}).tagName;
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||document.activeElement?.isContentEditable)return;
  if(document.querySelector('.mov.open'))return; // any modal open
  if(e.key==='j'||e.key==='ArrowDown'){e.preventDefault();_kbdMoveFocus(1);}
  else if(e.key==='k'||e.key==='ArrowUp'){e.preventDefault();_kbdMoveFocus(-1);}
  else if((e.key==='Enter'||e.key==='o')&&_kbdFocusTaskId){e.preventDefault();editTask(_kbdFocusTaskId);}
  else if(e.key==='d'&&_kbdFocusTaskId){
    e.preventDefault();
    const t=DB.tasks.find(x=>x.id===_kbdFocusTaskId);
    if(t){t.status=t.status==='Done'?'Todo':'Done';SB.update('tasks',t.id,{status:t.status},'tasks');renderTasks();_kbdRenderFocus();showToast(t.status==='Done'?'✓ Marked Done':'Reopened');}
  }
  else if((e.key==='x'||e.key==='Backspace')&&_kbdFocusTaskId){
    e.preventDefault();
    const id=_kbdFocusTaskId;_kbdFocusTaskId=null;
    deleteTask({stopPropagation(){}},id);
  }
},true);
// ── Smart views ──────────────────────────────────────────────────────────
function applySmartView(view){
  const wf=document.getElementById('taskFilter'),sf=document.getElementById('taskSF'),
    prio=document.getElementById('filterPriority'),dl=document.getElementById('filterDeadline');
  if(wf)wf.value='all';
  if(prio)prio.value='all';
  if(sf)sf.value='all';
  if(dl)dl.value=view;
  renderTasks();
  document.querySelectorAll('.smart-view-pill').forEach(b=>b.classList.toggle('active',view!=='all'&&b.dataset.sv===view));
}
// ── Main renderTasks ──────────────────────────────────────────────────────
function renderTasks(){
  if(typeof renderUrgentPanel==='function')renderUrgentPanel();
  populateDynamicFilters();
  // Keep smart-view pill highlight in sync if the deadline filter changed
  // via the dropdown directly rather than a pill click.
  const dlNow=document.getElementById('filterDeadline')?.value||'all';
  document.querySelectorAll('.smart-view-pill').forEach(b=>b.classList.toggle('active',dlNow!=='all'&&b.dataset.sv===dlNow));
  const tasks=getFilteredTasks();
  document.getElementById('taskBadge').textContent=DB.tasks.filter(t=>t.status!=='Done').length;
  // Always populate mobile container (CSS decides visibility)
  const mobileEl=document.getElementById('mobileTaskContainer');
  if(mobileEl)renderMobileTaskCards(tasks,mobileEl);
  // Also render desktop view
  if(boardView==='table'){renderBoardTable(tasks);initTaskDragSort();}
  else if(boardView==='kanban') renderBoardKanban(tasks);
  else if(boardView==='boards') renderBoardsListView();
  else if(boardView==='project') renderBoardProjectGrouped(tasks);
}

function initTaskDragSort(){
  // Add drag-to-reorder on all task table rows
  const tbody=document.querySelector('#boardBody tbody');
  if(!tbody)return;
  let dragSrc=null;
  const rows=[...tbody.querySelectorAll('tr[data-id]')];
  rows.forEach(row=>{
    row.draggable=true;
    row.style.cursor='grab';
    row.addEventListener('dragstart',function(e){dragSrc=this;this.style.opacity='.4';e.dataTransfer.effectAllowed='move';});
    row.addEventListener('dragend',function(){this.style.opacity='1';dragSrc=null;});
    row.addEventListener('dragover',function(e){e.preventDefault();e.dataTransfer.dropEffect='move';this.style.background='rgba(128,255,250,.06)';});
    row.addEventListener('dragleave',function(){this.style.background='';});
    row.addEventListener('drop',function(e){
      e.preventDefault();this.style.background='';
      if(!dragSrc||dragSrc===this)return;
      const srcId=parseInt(dragSrc.dataset.id);
      const dstId=parseInt(this.dataset.id);
      const srcIdx=DB.tasks.findIndex(t=>t.id===srcId);
      const dstIdx=DB.tasks.findIndex(t=>t.id===dstId);
      if(srcIdx<0||dstIdx<0)return;
      const [moved]=DB.tasks.splice(srcIdx,1);
      DB.tasks.splice(dstIdx,0,moved);
      save('tasks');
      renderTasks();
    });
  });
}

// ── Upgraded buildKanban (used by WorkIH, WorkCS, Venture) ───────────────
function buildKanban(containerId,tasks,world,statusList,statusColors,isOrange){
  const container=document.getElementById(containerId);if(!container)return;
  const tgm={'Todo':'todo','In Progress':'prog','No Progress':'noprog','Done':'done'};
  container.innerHTML=statusList.map(s=>{
    const items=tasks.filter(t=>t.status===s);
    const b=getBoards().find(b=>b.id===world);
    return`<div class="kc">
      <div class="kch ${tgm[s]||'todo'}">
        <span class="kch-title">${s.toUpperCase()}</span>
        <span class="pill ${taskStatusPillClass(s)}" style="font-size:var(--text-xs)">${items.length}</span>
      </div>
      <div class="kc-body" id="kc-${containerId}-${s.replace(/ /g,'_')}" data-status="${s}" ondragover="event.preventDefault();this.style.background='var(--hover-tint)'" ondragleave="this.style.background=''" ondrop="handleBuildKanbanDrop(event,'${s}')">
        ${items.map(t=>{
          const subs=t.subitems||[];
          return`<div class="kcard ${isOrange?'oc':''}" draggable="true" ondragstart="handleBuildKanbanDragStart(event,${t.id})" ondragend="this.style.opacity='1'" onclick="editTask(${t.id})" oncontextmenu="showCtx(event,${t.id},'task')" style="border-top:2px solid ${b?b.stripe:(isOrange?'var(--orange)':'var(--teal)')};cursor:grab">
            <div class="kct">${t.title}</div>
            ${t.client?`<div class="kcm"><span style="color:${isOrange?'var(--orange)':'var(--teal)'}">◈</span>${t.client}</div>`:''}
            ${t.platform?`<div class="kcm"><i class="ti ti-device-desktop" style="font-size:var(--text-xs);line-height:1;display:block"></i>${t.platform}</div>`:''}
            ${t.due?`<div class="kcp">Due: ${t.due}</div>`:''}
            <div class="kcm" style="margin-top:3px"><div class="pdot ${t.priority==='High'?'ph':t.priority==='Medium'?'pm':'pl'}"></div>${t.priority}</div>
            ${t.connBoard?`<div class="kc-conn">${connChip(t)}</div>`:''}
            ${subs.length?`<div class="kc-subitems"><div style="font-size:var(--text-xs);color:var(--text3);margin-bottom:3px">↳ ${subs.length} sub-item${subs.length>1?'s':''}</div></div>`:''}
          </div>`;
        }).join('')}
      </div>
      <div class="kc-add" onclick="openTaskForStatus('${world}','${s}')"><i class="ti ti-plus" style="font-size:var(--text-xs);line-height:1;display:block"></i> Add item</div>
    </div>`;
  }).join('');
}
let _buildKanbanDragId=null;
function handleBuildKanbanDragStart(e,taskId){
  _buildKanbanDragId=taskId;
  e.dataTransfer.effectAllowed='move';
  e.target.style.opacity='.4';
}
function handleBuildKanbanDrop(e,newStatus){
  e.preventDefault();
  e.currentTarget.style.background='';
  if(_buildKanbanDragId==null)return;
  const t=DB.tasks.find(x=>x.id===_buildKanbanDragId);
  if(t&&t.status!==newStatus){
    t.status=newStatus;
    save('tasks');
    SB.update('tasks',t.id,t,'tasks');
    addHistory('edit','Moved "'+t.title+'" to '+newStatus,{...t,_dbKey:'tasks'});
    renderTasks();
    if(typeof Store!=='undefined'&&Store._renderMap&&Store._renderMap[currentView])Store._renderMap[currentView]();
    showToast('✓ Moved to '+newStatus);
  }
  _buildKanbanDragId=null;
}

// ===== WORK IH =====
function setIHView(v,el){
  ['ih-table','ih-kanban','ih-ctasks','ih-meetings','ih-unified'].forEach(id=>{const d=document.getElementById(id);if(d)d.style.display='none';});
  const map={table:'ih-table',kanban:'ih-kanban',ctasks:'ih-ctasks',meetings:'ih-meetings',unified:'ih-unified'};
  const d=document.getElementById(map[v]);if(d)d.style.display=v==='unified'?'flex':'';
  ['ihv-t','ihv-k','ihv-ct','ihv-m','ihv-u'].forEach(id=>{const b=document.getElementById(id);if(b){b.style.background='transparent';b.style.borderColor='var(--border2)';b.style.color='var(--text2)';}});
  if(el){el.style.background='var(--teal3)';el.style.borderColor='var(--teal2)';el.style.color='var(--teal)';}
  if(v==='kanban'){const tasks=DB.tasks.filter(t=>t.world==='WORK-IH');buildKanban('ihKanbanCols',tasks,'WORK-IH',['Todo','In Progress','No Progress','Done'],{},false);}
  if(v==='ctasks'){populateIHClientFilter();renderIHClientTasks();}
  if(v==='meetings'){renderMeetingsPanel('meetingsPanel-WORK-IH','WORK-IH');}
  if(v==='unified'){renderIHUnified();}
}
function renderIHUnified(){
  const tasksEl=document.getElementById('ihUnifiedTasks');
  const calEl=document.getElementById('ihUnifiedCalendar');
  if(!tasksEl||!calEl)return;
  const tasks=(DB.tasks||[]).filter(t=>t.world==='WORK-IH'&&t.status!=='Done');
  tasksEl.innerHTML=tasks.length?tasks.map(t=>`<div onclick="editTask(${t.id})" style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--navy3);border:1px solid var(--border);border-radius:10px;cursor:pointer;flex-shrink:0">
    <span style="width:7px;height:7px;border-radius:50%;background:${t.priority==='High'?'var(--red)':t.priority==='Medium'?'var(--amber)':'var(--text3)'};flex-shrink:0"></span>
    <span style="flex:1;font-size:var(--text-sm);color:var(--text1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.title}</span>
    ${t.due?`<span style="font-size:9px;color:var(--text3);flex-shrink:0">${t.due}</span>`:''}
  </div>`).join(''):'<div style="font-size:var(--text-xs);color:var(--text3);text-align:center;padding:16px">No open tasks yet.</div>';
  const today=localDateStr(new Date());
  const upcoming=(DB.calEvents||[]).filter(e=>e.type==='work-ih'&&e.date>=today).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,15);
  calEl.innerHTML=upcoming.length?upcoming.map(e=>`<div onclick="editCalEvent(${e.id})" style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--w-ideahub)14;border-left:2px solid var(--w-ideahub);border-radius:8px;cursor:pointer;flex-shrink:0">
    <span style="flex:1;font-size:var(--text-sm);color:var(--text1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.title}</span>
    <span style="font-size:9px;color:var(--text3);flex-shrink:0">${e.date}${e.time?' · '+to12h(e.time):''}</span>
  </div>`).join(''):'<div style="font-size:var(--text-xs);color:var(--text3);text-align:center;padding:16px">Nothing scheduled yet.</div>';
}
// Deterministic color palette for IH client cards
const IH_CLIENT_COLORS=[
  {accent:'#00d4c8',bg:'rgba(0,212,200,.08)',border:'rgba(0,212,200,.25)'},   // teal
  {accent:'#a855f7',bg:'rgba(168,85,247,.08)',border:'rgba(168,85,247,.25)'}, // purple
  {accent:'#f59e0b',bg:'rgba(245,158,11,.08)',border:'rgba(245,158,11,.25)'}, // amber
  {accent:'#22c55e',bg:'rgba(34,197,94,.08)',border:'rgba(34,197,94,.25)'},   // green
  {accent:'#ff6b1a',bg:'rgba(255,107,26,.08)',border:'rgba(255,107,26,.25)'}, // orange
  {accent:'#ec4899',bg:'rgba(236,72,153,.08)',border:'rgba(236,72,153,.25)'}, // pink
  {accent:'#06b6d4',bg:'rgba(6,182,212,.08)',border:'rgba(6,182,212,.25)'},   // cyan
  {accent:'#84cc16',bg:'rgba(132,204,22,.08)',border:'rgba(132,204,22,.25)'}, // lime
  {accent:'#f43f5e',bg:'rgba(244,63,94,.08)',border:'rgba(244,63,94,.25)'},   // rose
];
function getClientColor(idx){return IH_CLIENT_COLORS[idx%IH_CLIENT_COLORS.length];}

function renderWorkIH(){renderDomainTimerCard('work-ih');
  const grid=document.getElementById('ihClientCards');if(!grid)return;
  if(!DB.clients.length){grid.innerHTML='<div style="font-size:var(--text-xs);color:var(--text3);padding:10px">No clients yet. Click + Client to begin.</div>';return;}
  grid.innerHTML=DB.clients.map((c,idx)=>{
    const tasks=DB.tasks.filter(t=>t.world==='WORK-IH'&&t.client===c.name);
    const open=tasks.filter(t=>t.status!=='Done');
    const high=open.filter(t=>t.priority==='High');
    const inprog=open.filter(t=>t.status==='In Progress');

    // Brand color: use saved color, fallback to palette
    const fallback=IH_CLIENT_COLORS[idx%IH_CLIENT_COLORS.length];
    const urgentOverride=c.status==='Urgent';
    const accentColor=urgentOverride?'#ef4444':(c.color&&/^#[0-9a-fA-F]{6}$/.test(c.color)?c.color:fallback.accent);
    const accentBg=accentColor+'12';
    const accentBorder=accentColor+'35';

    const statusCl=c.status==='Active'?'pt':c.status==='Urgent'?'pr':c.status==='Done'?'pg':'po';
    const pDot=p=>p==='High'?'#ef4444':p==='Medium'?'#f59e0b':'#4ade80';
    const sCl=taskStatusPillClass;

    return`<div style="background:var(--navy3);border:1px solid ${accentBorder};border-radius:12px;overflow:hidden;display:flex;flex-direction:column;transition:box-shadow .2s;font-size:var(--text-xs)" onmouseover="this.style.boxShadow='0 0 0 1px ${accentColor}50'" onmouseout="this.style.boxShadow='none'">

      <!-- HEADER: accent left bar + name + status -->
      <div style="padding:10px 12px 8px;border-bottom:1px solid ${accentBorder};background:${accentBg};border-left:3px solid ${accentColor}">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:4px">
          <div style="font-size:var(--text-xs);font-weight:800;color:${accentColor};line-height:1.2;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:.01em">${c.name}</div>
          <span class="pill ${statusCl}" style="font-size:var(--text-xs);flex-shrink:0">${c.status}</span>
        </div>
        <!-- Description (replaces "what's next") -->
        ${c.desc?`<div style="font-size:var(--text-xs);color:var(--text3);line-height:1.4;margin-bottom:5px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${c.desc}</div>`:''}
        <!-- Drive + Contact row -->
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:2px">
          ${c.drive?`<a href="${c.drive}" target="_blank" onclick="event.stopPropagation()" style="font-size:var(--text-xs);color:${accentColor};display:inline-flex;align-items:center;gap:3px;text-decoration:none;font-weight:600;border:1px solid ${accentBorder};border-radius:8px;padding:2px 7px;background:${accentBg};transition:all .15s" onmouseover="this.style.opacity='.8'" onmouseout="this.style.opacity='1'"><i class="ti ti-brand-google-drive" style="font-size:var(--text-sm);line-height:1;display:block"></i>Drive</a>`:''}
          ${c.contact?`<span style="font-size:var(--text-xs);color:var(--text3);display:flex;align-items:center;gap:3px"><i class="ti ti-mail" style="font-size:var(--text-xs);line-height:1;display:block"></i>${c.contact}</span>`:''}
        </div>
      </div>

      <!-- TASK STATUS ROW — no numbers, just status indicators -->
      <div style="padding:5px 12px;background:var(--navy3);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:6px;flex-shrink:0;flex-wrap:wrap">
        ${open.length?[
          high.length?`<span style="font-size:var(--text-xs);display:flex;align-items:center;gap:4px"><span style="width:6px;height:6px;border-radius:50%;background:#ef4444;flex-shrink:0;display:inline-block"></span><span style="color:var(--text3)">${high.length} high</span></span>`:'',
          inprog.length?`<span style="font-size:var(--text-xs);display:flex;align-items:center;gap:4px"><span style="width:6px;height:6px;border-radius:50%;background:var(--teal);flex-shrink:0;display:inline-block"></span><span style="color:var(--text3)">${inprog.length} in progress</span></span>`:'',
          `<span style="font-size:var(--text-xs);color:var(--text3)">${open.length} open</span>`
        ].filter(Boolean).join('<span style="color:var(--border2);font-size:var(--text-xs);margin:0 1px">·</span>')
        :`<span style="font-size:var(--text-xs);color:var(--text3);font-style:italic">${tasks.length?'All done ✓':'No tasks yet'}</span>`}
        <div style="flex:1"></div>
        <button style="background:${accentBg};border:1px solid ${accentBorder};border-radius:8px;color:${accentColor};font-size:var(--text-xs);padding:2px 8px;cursor:pointer;font-weight:600;display:flex;align-items:center;gap:3px;transition:opacity .15s" onclick="openTaskForClient(event,${JSON.stringify(c.name).replace(/"/g,'&quot;')})" onmouseover="this.style.opacity='.8'" onmouseout="this.style.opacity='1'"><i class="ti ti-plus" style="font-size:var(--text-xs);line-height:1;display:block"></i>Add Task</button>
      </div>

      <!-- TASK LIST -->
      <div style="padding:6px 12px;flex:1;min-height:52px">
        ${open.slice(0,5).map(t=>`<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.03);cursor:pointer;transition:background .1s;border-radius:6px" onclick="editTask(${t.id})" onmouseover="this.style.background='rgba(255,255,255,.025)'" onmouseout="this.style.background='none'">
          <div style="width:5px;height:5px;border-radius:50%;background:${pDot(t.priority)};flex-shrink:0"></div>
          <span style="flex:1;font-size:var(--text-xs);color:var(--text1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.35">${t.title}</span>
          <span class="pill ${sCl(t.status)}" style="font-size:var(--text-xs);flex-shrink:0">${t.status}</span>
        </div>`).join('')}
        ${open.length>5?`<div style="font-size:var(--text-xs);color:var(--text3);padding:3px 0;font-style:italic">+${open.length-5} more</div>`:''}
        ${!open.length&&!tasks.length?`<div style="font-size:var(--text-xs);color:var(--text3);padding:5px 0;text-align:center;font-style:italic">No tasks yet.</div>`:''}
      </div>

      <!-- FOOTER: Edit + Drive (if set) + Delete -->
      <div style="padding:5px 12px;border-top:1px solid var(--border);display:flex;gap:5px;background:var(--navy3)">
        <button class="btn btn-t" style="flex:1;font-size:var(--text-xs);font-weight:600" onclick="event.stopPropagation();editClient(${c.id})"><i class="ti ti-pencil" style="font-size:var(--text-xs);line-height:1;display:inline-block"></i> Edit</button>
        ${c.drive?`<a href="${c.drive}" target="_blank" onclick="event.stopPropagation()" style="flex:1;display:flex;align-items:center;justify-content:center;gap:4px;font-size:var(--text-xs);font-weight:600;color:${accentColor};background:${accentBg};border:1px solid ${accentBorder};border-radius:10px;text-decoration:none;padding:4px 0;transition:opacity .15s" onmouseover="this.style.opacity='.8'" onmouseout="this.style.opacity='1'"><i class="ti ti-brand-google-drive" style="font-size:var(--text-sm);line-height:1;display:block"></i>Drive</a>`:`<button class="btn btn-g" style="flex:1;font-size:var(--text-xs);font-weight:600;opacity:.4;cursor:default" disabled><i class="ti ti-brand-google-drive" style="font-size:var(--text-xs);line-height:1;display:inline-block"></i> Drive</button>`}
        <button class="btn btn-d" style="padding:2px 8px;flex-shrink:0" onclick="deleteClientBtn(event,${c.id})"><i class="ti ti-trash" style="font-size:var(--text-xs);line-height:1;display:block"></i></button>
      </div>
    </div>`;
  }).join('');
}
function openTaskForClient(e,clientName){e.stopPropagation();document.getElementById('taskModalTitle').textContent='New Task';editingTaskId=null;['title','platform','notes'].forEach(id=>{const el=document.getElementById('tf-'+id);if(el)el.value='';});document.getElementById('tf-world').value='WORK-IH';document.getElementById('tf-prio').value='Medium';document.getElementById('tf-status').value='Todo';document.getElementById('tf-due').value='';document.getElementById('tf-client').value=clientName;openModal('taskModal');}
function askClientTasks(e,id){
  e.stopPropagation();
  const c=DB.clients.find(x=>x.id===id);if(!c)return;
  setView('ai');
  setTimeout(()=>{
    const today=localDateStr(new Date());
    const existingTasks=DB.tasks.filter(t=>t.world==='WORK-IH'&&t.client===c.name&&t.status!=='Done').map(t=>`• ${t.title} (${t.status})`).join('\n')||'None';
    const prompt=`Generate 3–5 specific, actionable marketing tasks for **${c.name}** (WORK-IH · World: Ideahub).\n\nClient status: ${c.status}\nNext action on file: ${c.next||'None'}\nExisting open tasks:\n${existingTasks}\n\nFormat each task clearly: TITLE · Priority (High/Medium/Low) · Brief description.\nAll tasks must be for WORK-IH world only. Focus on what's most impactful right now.`;
    const input=document.getElementById('aiInput');
    if(input){input.value=prompt;sendAI();}
  },350);
}
function populateIHClientFilter(){const sel=document.getElementById('ihCF');if(!sel)return;const clients=[...new Set(DB.tasks.filter(t=>t.world==='WORK-IH'&&t.client).map(t=>t.client))];sel.innerHTML='<option value="all">All Clients</option>'+clients.map(c=>`<option value="${c}">${c}</option>`).join('');}
function renderIHClientTasks(){const cf=document.getElementById('ihCF')?.value||'all';const tasks=DB.tasks.filter(t=>t.world==='WORK-IH'&&(cf==='all'||t.client===cf));document.getElementById('ihCTbody').innerHTML=tasks.map(t=>`<tr onclick="editTask(${t.id})"><td style="font-weight:500">${t.title}</td><td>${t.client||'—'}</td><td style="font-size:var(--text-xs);color:var(--text3)">${t.platform||'—'}</td><td><span style="display:flex;align-items:center;gap:4px"><div class="pdot ${t.priority==='High'?'ph':t.priority==='Medium'?'pm':'pl'}"></div>${t.priority}</span></td><td><span class="pill ${taskStatusPillClass(t.status)}">${t.status}</span></td><td style="font-size:var(--text-xs);color:var(--text3)">${t.due||'—'}</td><td style="font-size:var(--text-xs);color:var(--text3);max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.notes||'—'}</td><td><button class="btn btn-d" style="padding:2px 7px" onclick="deleteTask(event,${t.id})"><i class="ti ti-trash" style="font-size:var(--text-xs);line-height:1;display:block"></i></button></td></tr>`).join('');}

// ===== WORK CS =====
// CS client config
const CS_CLIENTS={
  chainsmoker:{
    label:'Chainsmoker Urban Halal BBQ',icon:'ti-flame',
    accent:'#ef4444',bg:'rgba(239,68,68,.1)',border:'rgba(239,68,68,.3)',
    sub:'',
    filter:t=>!t.client||/chainsmoker/i.test(t.client||'')||(!t.client&&t.world==='WORK-CS')
  },
  sweetheart:{
    label:'Sweetheart Cafe',icon:'ti-coffee',
    accent:'#00d4c8',bg:'rgba(0,212,200,.1)',border:'rgba(0,212,200,.3)',
    sub:'',
    filter:t=>/sweetheart/i.test(t.client||'')
  }
};
let csActiveClient='chainsmoker',csActiveView='kanban';

function setCSClient(client,el){
  csActiveClient=client;
  ['csv-cs','csv-sw'].forEach(id=>{
    const b=document.getElementById(id);if(!b)return;
    b.style.background='var(--hover-tint)';b.style.borderColor='var(--border2)';b.style.color='var(--text2)';
  });
  const cfg=CS_CLIENTS[client];
  el.style.background=cfg.bg;el.style.borderColor=cfg.border;el.style.color=cfg.accent;
  if(csActiveView==='marketing'){updateCSBanner();renderMktgActive();}else{renderCSActive();}
}
function setCSView(v,el){
  csActiveView=v;
  document.getElementById('cs-kanban').style.display=v==='kanban'?'':'none';
  document.getElementById('cs-list').style.display=v==='list'?'':'none';
  const cm=document.getElementById('cs-meetings');if(cm)cm.style.display=v==='meetings'?'':'none';
  const mk=document.getElementById('cs-marketing');if(mk)mk.style.display=v==='marketing'?'flex':'none';
  ['csv-k','csv-l','csv-m','csv-mktg'].forEach(id=>{const b=document.getElementById(id);if(b){b.style.background='var(--hover-tint)';b.style.borderColor='var(--border2)';b.style.color='var(--text2)';}});
  if(el){el.style.background='var(--navy3)';el.style.borderColor='var(--border)';el.style.color='var(--text1)';}
  if(v==='meetings') renderMeetingsPanel('meetingsPanel-WORK-CS','WORK-CS');
  else if(v==='marketing'){updateCSBanner();renderMktgActive();}
  else renderCSActive();
}
let mktgActiveTab='campaigns';
function setMktgTab(tab,btn){
  mktgActiveTab=tab;
  ['campaigns','social','influencers','pricing','vault'].forEach(t=>{
    const el=document.getElementById('mktg-'+t);if(el)el.style.display=t===tab?'':'none';
  });
  document.querySelectorAll('.cfbt[id^="mktgtab-"]').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  renderMktgActive();
}
function csClientMatch(clientField){
  const cf=(clientField||'').toLowerCase();
  return csActiveClient==='chainsmoker' ? (!cf||cf.includes('chainsmoker')) : cf.includes('sweetheart');
}
function renderMktgActive(){
  if(mktgActiveTab==='campaigns')renderCampaigns();
  else if(mktgActiveTab==='social')renderCSSocialCalendar();
  else if(mktgActiveTab==='influencers')renderInfluencers();
  else if(mktgActiveTab==='pricing')renderPricing();
  else if(mktgActiveTab==='vault')renderCredentials();
}
function updateCSBanner(){
  const cfg=CS_CLIENTS[csActiveClient];
  const banner=document.getElementById('cs-client-banner');
  if(banner){banner.style.background=cfg.bg;banner.style.border='1px solid '+cfg.border;}
  const nm=document.getElementById('cs-banner-name');
  if(nm){nm.textContent=cfg.label;nm.style.color=cfg.accent;}
  const ico=document.getElementById('cs-banner-icon');if(ico)ico.className='ti '+cfg.icon;
  const icoWrap=document.getElementById('cs-banner-icon-wrap');if(icoWrap)icoWrap.style.color=cfg.accent;
  return cfg;
}
function renderCSActive(){
  const cfg=updateCSBanner();
  // Filter tasks
  const allCS=DB.tasks.filter(t=>t.world==='WORK-CS');
  const tasks=csActiveClient==='chainsmoker'
    ? allCS.filter(t=>!t.client||/chainsmoker/i.test(t.client))
    : allCS.filter(t=>/sweetheart/i.test(t.client||''));
  // Stats
  const tot=document.getElementById('csTotal');if(tot){tot.textContent=tasks.length;tot.style.color=cfg.accent;}
  const td=document.getElementById('csTodo');if(td){td.textContent=tasks.filter(t=>t.status==='Todo').length;td.style.color=cfg.accent;}
  const pr=document.getElementById('csProg');if(pr){pr.textContent=tasks.filter(t=>t.status==='In Progress').length;pr.style.color=cfg.accent;}
  const dn=document.getElementById('csDone');if(dn){dn.textContent=tasks.filter(t=>t.status==='Done').length;dn.style.color='var(--green)';}
  if(csActiveView==='kanban')renderCSKanban(tasks,cfg);
  else renderCSList(tasks,cfg);
}
function renderWorkCS(){renderDomainTimerCard('work-cs');renderCSActive();}
function renderCSKanban(tasks,cfg){
  if(!tasks){const allCS=DB.tasks.filter(t=>t.world==='WORK-CS');cfg=CS_CLIENTS[csActiveClient];tasks=csActiveClient==='chainsmoker'?allCS.filter(t=>!t.client||/chainsmoker/i.test(t.client)):allCS.filter(t=>/sweetheart/i.test(t.client||''));}
  buildKanban('csKanbanCols',tasks,'WORK-CS',['Todo','In Progress','No Progress','Done'],{},csActiveClient==='chainsmoker');
}
function renderCSList(tasks,cfg){
  if(!tasks){const allCS=DB.tasks.filter(t=>t.world==='WORK-CS');tasks=csActiveClient==='chainsmoker'?allCS.filter(t=>!t.client||/chainsmoker/i.test(t.client)):allCS.filter(t=>/sweetheart/i.test(t.client||''));}
  const tb=document.getElementById('csTbody');if(!tb)return;
  tb.innerHTML=tasks.map(t=>`<tr onclick="editTask(${t.id})"><td style="font-weight:500">${t.title}</td><td style="font-size:var(--text-xs);color:var(--text3)">${t.client||'—'}</td><td style="font-size:var(--text-xs);color:var(--text3)">${t.platform||'—'}</td><td><span style="display:flex;align-items:center;gap:4px"><div class="pdot ${t.priority==='High'?'ph':t.priority==='Medium'?'pm':'pl'}"></div>${t.priority}</span></td><td><span class="pill ${taskStatusPillClass(t.status)}">${t.status}</span></td><td style="font-size:var(--text-xs);color:var(--text3)">${t.due||'—'}</td><td><button class="btn btn-d" style="padding:2px 7px" onclick="deleteTask(event,${t.id})"><i class="ti ti-trash" style="font-size:var(--text-xs);line-height:1;display:block"></i></button></td></tr>`).join('');
}

// ===== TASKS =====


// ===== MODALS =====
// ═══════════════════════════════════════════════════════════════════════════
// IN-APP PROMPT / CONFIRM — replaces browser-native prompt()/confirm() with
// modals styled to match the rest of the app, so "adding elements" never
// pops a raw OS/Chrome dialog. Promise-based so call sites can just
// `await jelixPrompt(...)`.
