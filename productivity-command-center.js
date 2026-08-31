/* Live data summaries for the approved Today, Tasks, and Calendar command centers. */
(function(){
  'use strict';

  const DASHBOARD_PREF_KEY='j-dashboard-panels-v1';
  const DEFAULT_DASHBOARD_PANELS={focus:true,actions:true,finance:true,insights:true,timeline:true};
  const WORLD_LABELS={
    VENTURE:'Job Collectives',BUILD:'Code Collectives',SIDES:'Creative Collectives',FAITH:'Faith',LIFE:'Personal',
    'WORK-IH':'Ideahub','WORK-CS':'Chainsmoker',life:'Personal',ven:'Job Collectives',bld:'Code Collectives',sid:'Creative Collectives',fth:'Faith'
  };

  function esc(value){
    if(typeof window.escapeHtml==='function')return window.escapeHtml(String(value??''));
    return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  }
  function byId(id){return document.getElementById(id);}
  function setText(id,value){const el=byId(id);if(el)el.textContent=String(value);}
  function todayString(){return typeof window.localDateStr==='function'?window.localDateStr(new Date()):new Date().toISOString().slice(0,10);}
  function formatShortDate(dateString){
    if(!dateString)return'No date';
    const date=new Date(dateString+'T12:00:00');
    return date.toLocaleDateString('en-PH',{month:'short',day:'numeric',timeZone:'Asia/Manila'});
  }
  function formatMinutes(minutes){
    const total=Math.max(0,Math.round(Number(minutes)||0));
    if(total<60)return total+'m';
    const hours=Math.floor(total/60),remainder=total%60;
    return hours+'h'+(remainder?' '+remainder+'m':'');
  }
  function worldInfo(worldId){
    try{
      const board=(typeof window.getBoards==='function'?window.getBoards():[]).find(item=>item.id===worldId);
      if(board)return{label:board.name||WORLD_LABELS[worldId]||worldId,color:board.stripe||board.color||'var(--command-teal)'};
    }catch(error){}
    return{label:WORLD_LABELS[worldId]||worldId||'Personal',color:'var(--command-teal)'};
  }

  function readDashboardPrefs(){
    try{return{...DEFAULT_DASHBOARD_PANELS,...JSON.parse(localStorage.getItem(DASHBOARD_PREF_KEY)||'{}')};}
    catch(error){return{...DEFAULT_DASHBOARD_PANELS};}
  }
  function applyDashboardPrefs(){
    const prefs=readDashboardPrefs();
    Object.entries(prefs).forEach(([panel,visible])=>{
      document.querySelectorAll('#view-dashboard [data-dashboard-panel="'+panel+'"]').forEach(el=>el.classList.toggle('dashboard-panel-hidden',!visible));
      const input=document.querySelector('#dashboardCustomizeMenu input[data-dashboard-panel="'+panel+'"]');
      if(input)input.checked=visible;
    });
  }
  window.setDashboardPanelVisibility=function(panel,visible){
    if(!(panel in DEFAULT_DASHBOARD_PANELS))return;
    const prefs=readDashboardPrefs();
    prefs[panel]=Boolean(visible);
    localStorage.setItem(DASHBOARD_PREF_KEY,JSON.stringify(prefs));
    applyDashboardPrefs();
  };
  window.toggleDashboardCustomize=function(event){
    if(event)event.stopPropagation();
    const menu=byId('dashboardCustomizeMenu');
    const trigger=document.querySelector('.dashboard-customize-trigger');
    if(!menu||!trigger)return;
    const willOpen=menu.hidden;
    menu.hidden=!willOpen;
    trigger.setAttribute('aria-expanded',String(willOpen));
  };
  document.addEventListener('click',event=>{
    const menu=byId('dashboardCustomizeMenu');
    const trigger=document.querySelector('.dashboard-customize-trigger');
    if(!menu||menu.hidden||event.target.closest('.dashboard-customize-wrap'))return;
    menu.hidden=true;
    if(trigger)trigger.setAttribute('aria-expanded','false');
  });

  function renderTodayCommandCenter(){
    if(typeof DB==='undefined')return;
    const allTasks=Array.isArray(DB.tasks)?DB.tasks:[];
    const openTasks=allTasks.filter(task=>task.status!=='Done');
    const attention=typeof window.getAttentionTasks==='function'?window.getAttentionTasks(1):openTasks.slice(0,1);
    const focus=attention[0];
    let progress=0;
    if(focus){
      const subitems=Array.isArray(focus.subitems)?focus.subitems:[];
      if(subitems.length)progress=Math.round(subitems.filter(item=>item.status==='Done'||item.done===true).length/subitems.length*100);
      else if(focus.status==='In Progress')progress=55;
      else if(focus.status==='No Progress')progress=10;
      else progress=20;
    }else if(allTasks.length){
      progress=Math.round(allTasks.filter(task=>task.status==='Done').length/allTasks.length*100);
    }else progress=100;
    const ring=byId('todayFocusProgressRing');
    if(ring){
      ring.style.setProperty('--focus-progress',progress+'%');
      ring.setAttribute('aria-label','Focus progress '+progress+' percent');
    }
    setText('todayFocusProgressValue',progress+'%');

    const today=todayString();
    const overdue=openTasks.filter(task=>task.due&&task.due<today);
    const dueToday=openTasks.filter(task=>task.due===today);
    let todayEvents=[];
    try{todayEvents=typeof window.eventsForDate==='function'?window.eventsForDate(today):(DB.calEvents||[]).filter(event=>event.date===today);}
    catch(error){todayEvents=(DB.calEvents||[]).filter(event=>event.date===today);}
    const insight=byId('todayJelixInsight');
    if(insight){
      if(overdue.length){
        const oldest=[...overdue].sort((a,b)=>(a.due||'').localeCompare(b.due||''))[0];
        insight.innerHTML='<span><strong>'+overdue.length+' overdue</strong> commitment'+(overdue.length===1?' needs':'s need')+' a decision. Start with “'+esc(oldest.title||'Untitled task')+'” before opening new work.</span>';
      }else if(dueToday.length&&todayEvents.length>=3){
        insight.innerHTML='<span>Your day is carrying <strong>'+dueToday.length+' due task'+(dueToday.length===1?'':'s')+'</strong> around '+todayEvents.length+' calendar events. Protect one uninterrupted focus block.</span>';
      }else if(dueToday.length){
        insight.innerHTML='<span><strong>'+dueToday.length+' task'+(dueToday.length===1?' is':'s are')+' due today.</strong> Your calendar still has room to finish the most important one.</span>';
      }else if(todayEvents.length){
        insight.innerHTML='<span>You have <strong>'+todayEvents.length+' calendar event'+(todayEvents.length===1?'':'s')+'</strong> today and no task deadline pressure. Keep the open space intentional.</span>';
      }else{
        insight.innerHTML='<span>Your schedule is clear of immediate pressure. <strong>Choose one meaningful result</strong> and leave room for recovery.</span>';
      }
    }
    applyDashboardPrefs();
  }

  window.setTaskStatusFilter=function(status){
    ['taskFilter','filterPriority','filterDeadline','filterTime','filterConn','filterPlatform'].forEach(id=>{const el=byId(id);if(el)el.value='all';});
    const statusFilter=byId('taskSF');if(statusFilter)statusFilter.value=status||'all';
    const search=byId('boardSearch');if(search)search.value='';
    if(typeof window.renderTasks==='function')window.renderTasks();
  };

  function normalizeTaskKpiStrip(){
    const strip=document.querySelector('#view-tasks .task-kpi-strip');
    if(!strip)return;
    const seen=new Set();
    strip.querySelectorAll('.task-kpi-card').forEach(card=>{
      const label=(card.querySelector('small')?.textContent||'').trim().toLowerCase();
      const key=label||card.dataset.taskKpi;
      if(!key)return;
      if(seen.has(key))card.remove();
      else seen.add(key);
    });
  }

  function renderTaskCommandCenter(){
    if(typeof DB==='undefined')return;
    normalizeTaskKpiStrip();
    const tasks=Array.isArray(DB.tasks)?DB.tasks:[];
    const today=todayString();
    const open=tasks.filter(task=>task.status!=='Done');
    const inProgress=tasks.filter(task=>task.status==='In Progress');
    const overdue=open.filter(task=>task.due&&task.due<today);
    const dueToday=open.filter(task=>task.due===today);
    const completed=tasks.filter(task=>task.status==='Done');
    const focusMinutes=tasks.reduce((sum,task)=>sum+(Number(task.focusMinutes)||0),0);
    setText('taskKpiTotal',tasks.length);
    setText('taskKpiProgress',inProgress.length);
    setText('taskKpiOverdue',overdue.length);
    setText('taskKpiToday',dueToday.length);
    setText('taskKpiCompleted',completed.length);
    setText('taskKpiFocus',formatMinutes(focusMinutes));

    const percentage=tasks.length?Math.round(completed.length/tasks.length*100):0;
    setText('taskOverviewPercent',percentage+'%');
    const ring=byId('taskOverviewRing');if(ring)ring.style.setProperty('--task-progress',percentage+'%');
    const worldFilter=byId('taskFilter');
    setText('taskOverviewLabel',worldFilter&&worldFilter.value!=='all'?worldInfo(worldFilter.value).label:'All tasks');
    const legend=byId('taskOverviewLegend');
    if(legend){
      const entries=[
        {label:'To do',count:tasks.filter(task=>task.status==='Todo').length,color:'var(--command-warning)'},
        {label:'In progress',count:inProgress.length,color:'var(--command-teal)'},
        {label:'No progress',count:tasks.filter(task=>task.status==='No Progress').length,color:'var(--command-danger)'},
        {label:'Completed',count:completed.length,color:'var(--command-lime)'}
      ];
      legend.innerHTML=entries.map(entry=>'<div><i style="--legend-color:'+entry.color+'"></i><span>'+entry.label+'</span><strong>'+entry.count+'</strong></div>').join('');
    }

    const upcoming=open.filter(task=>task.due&&task.due>=today).sort((a,b)=>a.due.localeCompare(b.due)).slice(0,5);
    const deadlines=byId('taskUpcomingDeadlines');
    if(deadlines){
      deadlines.innerHTML=upcoming.length?upcoming.map(task=>{
        const world=worldInfo(task.world);
        const label=task.due===today?'Today':formatShortDate(task.due);
        return '<button type="button" class="task-side-item" onclick="editTask('+Number(task.id)+')"><i class="side-item-dot" style="--item-color:'+world.color+'"></i><span class="side-item-copy"><span class="side-item-title">'+esc(task.title||'Untitled task')+'</span><span class="side-item-meta">'+esc(world.label)+' · '+esc(task.priority||'No priority')+'</span></span><span class="side-item-date">'+label+'</span></button>';
      }).join(''):'<div class="side-list-empty">No upcoming deadlines. Add a due date when timing matters.</div>';
    }

    const productivity=byId('taskProductivityInsight');
    if(productivity){
      if(overdue.length)productivity.innerHTML='<strong>'+overdue.length+' overdue</strong> item'+(overdue.length===1?' is':'s are')+' competing with current work. Resolve the oldest commitment before adding another priority.';
      else if(inProgress.length>3)productivity.innerHTML='<strong>'+inProgress.length+' tasks are in progress.</strong> Finish or pause one before starting something new to reduce context switching.';
      else if(completed.length&&percentage>=60)productivity.innerHTML='<strong>'+percentage+'% of recorded tasks are complete.</strong> Keep the active queue small and protect the momentum.';
      else productivity.innerHTML='<strong>'+formatMinutes(focusMinutes)+' of focus time logged.</strong> Start a timer from any task when you want a clearer picture of deep-work effort.';
    }

    const overdueCard=byId('smartOverdueCard');
    if(overdueCard){
      overdueCard.classList.toggle('is-clear',overdue.length===0);
      if(overdue.length){
        const oldest=[...overdue].sort((a,b)=>a.due.localeCompare(b.due))[0];
        setText('smartOverdueTitle',overdue.length+' overdue task'+(overdue.length===1?'':'s'));
        setText('smartOverdueText','Oldest: '+(oldest.title||'Untitled task')+' · '+formatShortDate(oldest.due));
      }else{
        setText('smartOverdueTitle','Overdue queue clear');
        setText('smartOverdueText','Nothing needs rescue right now.');
      }
    }
  }

  function calendarEventsForToday(){
    const today=todayString();
    let events=[];
    try{events=typeof window.eventsForDate==='function'?window.eventsForDate(today):(DB.calEvents||[]).filter(event=>event.date===today);}
    catch(error){events=(DB.calEvents||[]).filter(event=>event.date===today);}
    try{
      if(typeof calContextFilter!=='undefined'&&typeof window.normaliseType==='function')events=events.filter(event=>calContextFilter.has(window.normaliseType(event.type))||event._isTask);
    }catch(error){}
    return events.sort((a,b)=>(a.time||'').localeCompare(b.time||''));
  }
  function eventDurationMinutes(event){
    if(!event.time||!event.endTime)return 0;
    const toMinutes=value=>{const parts=value.split(':').map(Number);return parts[0]*60+parts[1];};
    const start=toMinutes(event.time),end=toMinutes(event.endTime);
    return end>=start?end-start:1440-start+end;
  }
  function calendarWorldInfo(event){
    try{
      const type=typeof window.normaliseType==='function'?window.normaliseType(event.type):event.type;
      const world=typeof window.calWorldById==='function'?window.calWorldById(type):null;
      if(world)return{label:world.label||WORLD_LABELS[type]||type,color:world.hex||world.color||'var(--command-teal)'};
    }catch(error){}
    return worldInfo(event.type);
  }
  function renderCalendarCommandCenter(){
    if(typeof DB==='undefined')return;
    const today=todayString();
    const events=calendarEventsForToday();
    const minutes=events.reduce((sum,event)=>sum+eventDurationMinutes(event),0);
    setText('calendarTodayEvents',events.length);
    setText('calendarTodayHours',minutes?formatMinutes(minutes):'0h');
    setText('calendarSummaryDate',new Date(today+'T12:00:00').toLocaleDateString('en-PH',{weekday:'short',month:'short',day:'numeric',timeZone:'Asia/Manila'}));

    const grouped=new Map();
    events.forEach(event=>{
      const world=calendarWorldInfo(event);
      const current=grouped.get(world.label)||{...world,count:0};current.count++;grouped.set(world.label,current);
    });
    const domainSummary=byId('calendarDomainSummary');
    if(domainSummary)domainSummary.innerHTML=[...grouped.values()].map(item=>'<span><i style="--domain-color:'+item.color+'"></i>'+esc(item.label)+' · '+item.count+'</span>').join('')||'<span>No events assigned today</span>';

    const glance=byId('calendarTodayGlance');
    if(glance){
      glance.innerHTML=events.length?events.slice(0,4).map(event=>{
        const world=calendarWorldInfo(event);
        const time=event.time?(typeof window.to12h==='function'?window.to12h(event.time):event.time):'All day';
        return '<button type="button" class="calendar-side-item" onclick="calSelectedDate=\''+today+'\';setCalView(\'day\')"><i class="side-item-dot" style="--item-color:'+world.color+'"></i><span class="side-item-copy"><span class="side-item-title">'+esc(event.title||'Untitled event')+'</span><span class="side-item-meta">'+esc(world.label)+(event.loc?' · '+esc(event.loc):'')+'</span></span><span class="side-item-date">'+esc(time)+'</span></button>';
      }).join(''):'<div class="side-list-empty">No events scheduled today. Your attention is unclaimed.</div>';
    }

    const upcoming=(DB.tasks||[]).filter(task=>task.status!=='Done'&&task.due&&task.due>=today).sort((a,b)=>a.due.localeCompare(b.due)).slice(0,4);
    const deadlines=byId('calendarUpcomingDeadlines');
    if(deadlines){
      deadlines.innerHTML=upcoming.length?upcoming.map(task=>{
        const world=worldInfo(task.world);
        return '<button type="button" class="calendar-side-item" onclick="setView(\'tasks\');setTimeout(function(){editTask('+Number(task.id)+')},100)"><i class="side-item-dot" style="--item-color:'+world.color+'"></i><span class="side-item-copy"><span class="side-item-title">'+esc(task.title||'Untitled task')+'</span><span class="side-item-meta">'+esc(world.label)+'</span></span><span class="side-item-date">'+(task.due===today?'Today':formatShortDate(task.due))+'</span></button>';
      }).join(''):'<div class="side-list-empty">No upcoming task deadlines.</div>';
    }
    renderCalendarSyncHealth();
  }

  function renderCalendarSyncHealth(){
    const connected=typeof window.isGoogleWorkspaceConnected==='function'&&window.isGoogleWorkspaceConnected();
    const dot=byId('calendarSyncHealthDot');
    const summary=byId('calendarSyncSummary');
    const button=byId('calendarSyncAction');
    if(dot)dot.className='sync-health-dot '+(connected?'connected':'disconnected');
    if(summary){
      const last=typeof window.getGoogleLastSyncText==='function'?window.getGoogleLastSyncText():(connected?'Connected':'Not connected');
      summary.innerHTML=connected?'Google Calendar is connected.<small>'+esc(last)+' · background sync checks every 90 seconds</small>':'Google Calendar is not connected.<small>Connect from here to bring external events into J.O.B Systems.</small>';
    }
    if(button&&!button.disabled)button.innerHTML=connected?'<i class="ti ti-refresh"></i><span>Sync calendar</span>':'<i class="ti ti-brand-google"></i><span>Connect Google Calendar</span>';
  }
  window.runCalendarSync=async function(){
    const button=byId('calendarSyncAction');
    const connected=typeof window.isGoogleWorkspaceConnected==='function'&&window.isGoogleWorkspaceConnected();
    if(!connected){
      if(typeof window.connectGoogleWorkspace==='function')await window.connectGoogleWorkspace();
      renderCalendarSyncHealth();
      return;
    }
    if(!button||typeof window.pullGoogleCalendarEvents!=='function')return;
    button.disabled=true;
    button.innerHTML='<i class="ti ti-loader-2 ti-spin"></i><span>Syncing…</span>';
    try{
      await window.pullGoogleCalendarEvents();
      renderCalendarCommandCenter();
      if(typeof window.showToast==='function')window.showToast('Calendar sync complete');
    }catch(error){
      if(typeof window.showToast==='function')window.showToast('Calendar sync could not complete. Your local events are unchanged.');
    }finally{
      button.disabled=false;
      renderCalendarSyncHealth();
    }
  };

  const baseRenderBrief=window.renderBrief;
  if(typeof baseRenderBrief==='function')window.renderBrief=function(){
    const result=baseRenderBrief.apply(this,arguments);renderTodayCommandCenter();return result;
  };
  const baseRenderTasks=window.renderTasks;
  if(typeof baseRenderTasks==='function')window.renderTasks=function(){
    const result=baseRenderTasks.apply(this,arguments);renderTaskCommandCenter();return result;
  };
  const baseRenderCalendar=window.renderCalendar;
  if(typeof baseRenderCalendar==='function')window.renderCalendar=function(){
    const result=baseRenderCalendar.apply(this,arguments);renderCalendarCommandCenter();return result;
  };
  const baseRenderGoogleSyncStatus=window.renderGoogleSyncStatus;
  if(typeof baseRenderGoogleSyncStatus==='function')window.renderGoogleSyncStatus=function(){
    const result=baseRenderGoogleSyncStatus.apply(this,arguments);renderCalendarSyncHealth();return result;
  };

  function initialize(){
    applyDashboardPrefs();
    renderTodayCommandCenter();
    renderTaskCommandCenter();
    renderCalendarCommandCenter();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize);
  else initialize();
})();
