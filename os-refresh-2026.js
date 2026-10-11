/* JOBSystems · Command Center V2
   Progressive enhancement only: legacy modules remain mounted and functional.
   All cards use the existing DB; no mock figures or external analytics. */
(function(){
  'use strict';
  var WORLD_INFO=[
    {id:'venture',name:'Job Collectives',tone:'job',icon:'briefcase'},
    {id:'build',name:'Code Collectives',tone:'code',icon:'code'},
    {id:'sides',name:'Creative Collectives',tone:'creative',icon:'palette'},
    {id:'faith',name:'Faith',tone:'faith',icon:'heart-handshake'},
    {id:'life',name:'Personal',tone:'personal',icon:'user'}
  ];
  var state={ready:false,expanded:false,renderQueued:false,dialog:null};
  var el=function(id){return document.getElementById(id);};
  var esc=function(s){return String(s===null||s===undefined?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
  var today=function(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
  var tasks=function(){return typeof DB!=='undefined'&&Array.isArray(DB.tasks)?DB.tasks:[];};
  var events=function(){return typeof DB!=='undefined'&&Array.isArray(DB.calEvents)?DB.calEvents:[];};
  var transactions=function(){return typeof DB!=='undefined'&&Array.isArray(DB.cashflow)?DB.cashflow:[];};
  var key=function(){return 'j-os-focus-v2-'+today();};
  var fmt=function(n){return '₱'+(Number(n)||0).toLocaleString('en-PH',{maximumFractionDigits:0});};
  var openTasks=function(){return tasks().filter(function(t){return t.status!=='Done'&&t.status!=='Cancelled';});};
  var normalizeWorld=function(w){
    var s=String(w||'').toLowerCase().trim();
    if(/^work([_-]|$)/.test(s))return 'work';
    if(/venture|job.collective|agency|business|client/.test(s))return 'venture';
    if(/build|code.collective|coding|development/.test(s))return 'build';
    if(/sides|creative.collective|creatives/.test(s))return 'sides';
    if(/faith|church|buklod|ledc|inc/.test(s))return 'faith';
    if(/life|personal|home|health|family/.test(s))return 'life';
    return s;
  };
  var taskWorld=function(t){return normalizeWorld(t.worldId||t.world_id||t.world||t.domain||'life');};
  var priorityScore=function(t){
    var d=String(t.due||'').slice(0,10),now=today(),p=String(t.priority||'').toLowerCase();
    return (d&&d<now?1500:0)+(d===now?800:0)+(/urgent|critical/.test(p)?420:/high/.test(p)?240:/medium/.test(p)?90:0)
      +(t.status==='In Progress'?160:0)+(d&&d>now?Math.max(0,90-Math.round((new Date(d)-new Date(now))/86400000)*8):0);
  };
  var sortedTasks=function(){return openTasks().slice().sort(function(a,b){return priorityScore(b)-priorityScore(a)||String(a.due||'9999').localeCompare(String(b.due||'9999'));});};
  var selection=function(){
    var saved=[];
    try{saved=JSON.parse(localStorage.getItem(key())||'[]');}catch(e){}
    if(!Array.isArray(saved))saved=[];
    var available=sortedTasks(),chosen=[];
    saved.forEach(function(id){var t=available.find(function(x){return String(x.id)===String(id);});if(t&&!chosen.includes(t))chosen.push(t);});
    available.forEach(function(t){if(chosen.length<3&&!chosen.includes(t))chosen.push(t);});
    return chosen.slice(0,3);
  };
  var taskLink=function(t){return '<button type="button" class="osr-row-link" data-osr-task="'+esc(t.id)+'" aria-label="Open task '+esc(t.title||'Untitled')+'"><i class="ti ti-chevron-right"></i></button>';};
  var dueLabel=function(t){
    var d=String(t.due||'').slice(0,10);
    if(!d)return 'No due date';
    if(d<today())return 'Overdue · '+esc(d);
    if(d===today())return 'Due today';
    return 'Due '+esc(d);
  };
  var worldName=function(id){var w=WORLD_INFO.find(function(x){return x.id===id;});return w?w.name:(id==='work'?'Other work':'Personal');};
  var workspaceTag=function(t){var w=taskWorld(t);return '<span class="osr-dot '+esc(w)+'"></span>'+esc(worldName(w));};
  var card=function(title,body,cls,footer){
    return '<section class="osr-card '+(cls||'')+'"><div class="osr-card-head"><h3>'+title+'</h3>'+(footer||'')+'</div>'+body+'</section>';
  };
  function renderTop3(){
    var chosen=selection();
    var cards=chosen.map(function(t,index){
      return '<article class="osr-priority osr-priority-'+(index+1)+'">'+
        '<div class="osr-priority-top"><span class="osr-number">'+(index+1)+'</span><span class="osr-priority-state">'+esc(t.priority||'Normal')+'</span></div>'+
        '<button type="button" data-osr-task="'+esc(t.id)+'" class="osr-priority-title">'+esc(t.title||'Untitled task')+'</button>'+
        '<div class="osr-priority-meta">'+workspaceTag(t)+'</div>'+
        '<div class="osr-priority-foot"><span class="'+(String(t.due||'')<today()&&t.due?'osr-overdue':'')+'"><i class="ti ti-calendar-event"></i> '+dueLabel(t)+'</span>'+taskLink(t)+'</div>'+
      '</article>';
    }).join('');
    while(chosen.length<3){cards+='<article class="osr-priority osr-empty-priority"><span class="osr-number">'+(chosen.length+1)+'</span><p>Space for another priority</p><button type="button" data-osr-action="new-task">Add a task</button></article>';chosen.push({});}
    return card('Top 3 priorities', '<div class="osr-priorities">'+cards+'</div>','osr-focus-card','<button class="osr-text-button" type="button" data-osr-action="customize">Customize <i class="ti ti-adjustments"></i></button>');
  }
  function getDayEvents(){
    var list=[];
    try{if(typeof eventsForDate==='function')list=eventsForDate(today());}catch(e){}
    if(!Array.isArray(list)||!list.length)list=events().filter(function(e){return String(e.date||'').slice(0,10)===today();});
    return list.sort(function(a,b){return getMinutes(a.time||a.startTime)-getMinutes(b.time||b.startTime);}).slice(0,6);
  }
  function getMinutes(s){
    var m=String(s||'').match(/(\d{1,2}):(\d{2})/);
    if(!m)return -1;var n=Number(m[1])*60+Number(m[2]);return /pm/i.test(s)&&Number(m[1])!==12?n+720:n;
  }
  function timeLabel(s){
    var n=getMinutes(s);
    if(n<0)return 'All day';
    return new Date(2026,0,1,Math.floor(n/60),n%60).toLocaleTimeString('en-PH',{hour:'numeric',minute:'2-digit'});
  }
  function renderSchedule(){
    var es=getDayEvents();
    var rows=es.map(function(e){
      return '<div class="osr-schedule-item"><time>'+esc(timeLabel(e.time||e.startTime))+'</time><span class="osr-event-bar"></span><div class="osr-event-main"><strong>'+esc(e.title||'Untitled event')+'</strong><small>'+esc(e.loc||e.location||e.type||'Calendar')+'</small></div></div>';
    }).join('');
    if(!rows)rows='<div class="osr-empty-state"><i class="ti ti-calendar-check"></i><p>No events scheduled today.</p><button type="button" data-osr-action="new-event">Schedule an event</button></div>';
    return card("Today's schedule",'<div class="osr-schedule-list">'+rows+'</div>','osr-schedule-card','<button type="button" class="osr-text-button" data-osr-view="calendar">View Calendar <i class="ti ti-arrow-up-right"></i></button>');
  }
  function renderNext(){
    var top=selection().map(function(t){return String(t.id);});
    var list=sortedTasks().filter(function(t){return !top.includes(String(t.id));}).slice(0,5);
    if(!list.length)list=sortedTasks().slice(0,5);
    var rows=list.map(function(t){
      return '<div class="osr-action-row"><span class="osr-action-icon"><i class="ti ti-square"></i></span>'+
        '<div><button data-osr-task="'+esc(t.id)+'" type="button">'+esc(t.title||'Untitled task')+'</button><small>'+workspaceTag(t)+' · '+dueLabel(t)+'</small></div>'+taskLink(t)+'</div>';
    }).join('');
    if(!rows)rows='<div class="osr-empty-state"><p>Nothing outstanding. Add a task to get started.</p></div>';
    return card('Next actions','<div class="osr-action-list">'+rows+'</div>','osr-actions-card','<button type="button" class="osr-text-button" data-osr-view="tasks">View all <i class="ti ti-arrow-up-right"></i></button>');
  }
  function renderAttention(){
    var overdue=openTasks().filter(function(t){return t.due&&String(t.due).slice(0,10)<today();});
    var high=openTasks().filter(function(t){return /high|urgent|critical/i.test(t.priority||'');});
    var bills=typeof DB!=='undefined'&&Array.isArray(DB.bills)?DB.bills:[];
    var soon=new Date();soon.setDate(soon.getDate()+7);
    var until=soon.getFullYear()+'-'+String(soon.getMonth()+1).padStart(2,'0')+'-'+String(soon.getDate()).padStart(2,'0');
    var upcoming=bills.filter(function(b){var d=String(b.dueDate||b.due||'').slice(0,10);return d>=today()&&d<=until&&!b.paid;});
    var badges=[];
    var incomplete=transactions().filter(function(t){return t.type==='Transfer'&&!(t._toAccount||t.to_account);}).length;
    if(incomplete)badges.push({icon:'alert-triangle',tone:'red',name:incomplete+' transfer'+(incomplete===1?'':'s')+' needs review',caption:'Destination account missing; balance may be understated',view:'finances'});
    if(overdue.length)badges.push({icon:'alert-circle',tone:'red',name:overdue.length+' overdue task'+(overdue.length===1?'':'s'),caption:'Review your deadlines',view:'tasks'});
    if(upcoming.length)badges.push({icon:'receipt',tone:'amber',name:upcoming.length+' bill'+(upcoming.length===1?'':'s')+' due this week',caption:'Check payment schedule',view:'finances'});
    if(high.length)badges.push({icon:'flag',tone:'orange',name:high.length+' high-priority open',caption:'Review next steps',view:'tasks'});
    if(document.querySelector('.sync-badge.sync-error, .sync-badge.sync-issue')||window.JOBSystemsSyncFailures&&window.JOBSystemsSyncFailures.length)badges.push({icon:'cloud-off',tone:'red',name:'Cloud sync needs attention',caption:'Local changes may not be uploaded',view:'settings'});
    if(!badges.length)badges.push({icon:'circle-check',tone:'green',name:'All caught up',caption:'No urgent alerts at the moment',view:'tasks'});
    return card('Needs attention','<div class="osr-attention-list">'+badges.slice(0,4).map(function(x){return '<button type="button" class="osr-attention-row" data-osr-view="'+x.view+'"><span class="osr-attention-icon '+x.tone+'"><i class="ti ti-'+x.icon+'"></i></span><span><strong>'+esc(x.name)+'</strong><small>'+esc(x.caption)+'</small></span><i class="ti ti-chevron-right"></i></button>';}).join('')+'</div>','osr-attention-card');
  }
  function renderFinance(){
    var now=today().slice(0,7),ins=0,outs=0;
    transactions().forEach(function(t){if(String(t.date||'').slice(0,7)!==now)return;
      if(t.type==='Debit')ins+=Number(t.amount)||0;
      else if(t.type==='Credit'||t.type==='Payment')outs+=Number(t.amount)||0;
    });
    var total=0;
    try{if(typeof getTotalPortfolioBalance==='function')total=getTotalPortfolioBalance();}catch(e){}
    var diff=ins-outs;
    var incomplete=transactions().filter(function(t){return t.type==='Transfer'&&!(t._toAccount||t.to_account);}).length;
    return card('Financial snapshot','<div class="osr-money-body"><div class="osr-money-balance"><span>Total account balance</span><strong>'+fmt(total)+'</strong><small>From your recorded accounts and transactions</small></div>'+
      +(incomplete?'<p class="osr-finance-warning">'+incomplete+' transfer'+(incomplete===1?'':'s')+' has an unknown destination. Review your finance records.</p>':'')+
      '<div class="osr-money-stats"><div><span class="osr-money-mark in"></span><span>Money in</span><strong>'+fmt(ins)+'</strong></div><div><span class="osr-money-mark out"></span><span>Money out</span><strong>'+fmt(outs)+'</strong></div><div><span class="osr-money-mark '+(diff>=0?'in':'out')+'"></span><span>Month net</span><strong>'+fmt(diff)+'</strong></div></div></div>','osr-money-card','<button type="button" class="osr-text-button" data-osr-view="finances">View Finance <i class="ti ti-arrow-up-right"></i></button>');
  }
  function renderPulse(){
    var ts=openTasks(),projects=typeof DB!=='undefined'&&Array.isArray(DB.projects)?DB.projects:[];
    var workspaces=WORLD_INFO.slice();if(ts.some(function(t){return taskWorld(t)==='work';}))workspaces.push({id:'work',name:'Other work',tone:'other',icon:'briefcase-2'});
    var rows=workspaces.map(function(w){
      var mine=ts.filter(function(t){return taskWorld(t)===w.id;});
      var risks=mine.filter(function(t){return t.due&&String(t.due).slice(0,10)<today();}).length;
      var projs=projects.filter(function(p){return normalizeWorld(p.worldId||p.world_id||p.world)===w.id;}).length;
      return '<button type="button" class="osr-pulse osr-pulse-'+w.tone+'" data-osr-view="'+(w.id==='work'?'work-cs':w.id)+'"><span class="osr-pulse-title"><i class="ti ti-'+w.icon+'"></i><strong>'+w.name+'</strong></span><span class="osr-pulse-count">'+mine.length+' open tasks</span><small>'+projs+' projects'+(risks?' · '+risks+' overdue':' · On track')+'</small></button>';
    }).join('');
    return card('Workspace pulse','<div class="osr-pulse-grid">'+rows+'</div>','osr-pulse-card','<button type="button" class="osr-text-button" data-osr-view="projects">View Projects <i class="ti ti-arrow-up-right"></i></button>');
  }
  function renderJelix(){
    var ts=selection();var late=openTasks().filter(function(t){return t.due&&String(t.due).slice(0,10)<today();}).length;
    var notes=[];
    if(ts.length)notes.push('Start with '+ts[0].title+'.');
    if(late)notes.push('You have '+late+' overdue task'+(late===1?'':'s')+' to review.');
    if(getDayEvents().length)notes.push('Check today’s schedule before planning deep work.');
    if(!notes.length)notes.push('Your day is clear. Choose one meaningful next action.');
    return card('J.E.L.I.X. daily brief','<div class="osr-jelix-body"><span class="osr-jelix-glyph" aria-hidden="true"><i class="ti ti-sparkles"></i></span><div><p>'+notes.map(esc).join(' ')+'</p><small>Summary based on your current JOBSystems data.</small></div></div>'+
      '<button type="button" class="osr-jelix-ask" data-osr-action="jelix">Ask J.E.L.I.X. about my day <i class="ti ti-arrow-up-right"></i></button>','osr-jelix-card');
  }
  function render(){
    var root=el('osRefreshCommand');if(!root||typeof DB==='undefined')return;
    root.innerHTML='<div class="osr-daily-heading"><div><span class="osr-eyebrow">YOUR DAY AT A GLANCE</span><h2>Make today count.</h2><p>Priorities, schedules, and everything that needs your attention.</p></div>'+
      '<button type="button" class="osr-add-button" data-osr-action="new-task"><i class="ti ti-plus"></i> Quick add</button></div>'+
      '<div class="osr-command-grid">'+renderTop3()+renderSchedule()+renderNext()+renderAttention()+renderFinance()+renderPulse()+renderJelix()+'</div>';
  }
  function scheduleRender(){if(state.renderQueued)return;state.renderQueued=true;requestAnimationFrame(function(){state.renderQueued=false;render();});}
  function toggleAdvanced(){
    state.expanded=!state.expanded;
    document.body.classList.toggle('os-refresh-expanded',state.expanded);
    var toggle=el('osRefreshDetailToggle');
    if(toggle){toggle.setAttribute('aria-expanded',String(state.expanded));toggle.innerHTML='<i class="ti ti-layout-dashboard"></i> '+(state.expanded?'Hide detailed widgets':'Show detailed widgets')+' <i class="ti ti-chevron-'+(state.expanded?'up':'down')+'"></i>';}
  }
  function customize(){
    if(!state.dialog)return;
    var options=sortedTasks();
    var current=selection().map(function(t){return String(t.id);});
    var fields=[0,1,2].map(function(i){
      return '<label>Priority '+(i+1)+'<select name="priority'+i+'"><option value="">Choose a task…</option>'+options.map(function(t){return '<option value="'+esc(t.id)+'"'+(current[i]===String(t.id)?' selected':'')+'>'+esc(t.title||'Untitled task')+'</option>';}).join('')+'</select></label>';
    }).join('');
    state.dialog.innerHTML='<form method="dialog" class="osr-dialog-panel"><div class="osr-dialog-head"><h2>Choose today’s Top 3</h2><button type="button" class="osr-dialog-close" data-osr-dialog-close aria-label="Close"><i class="ti ti-x"></i></button></div><p>Pin your three most important tasks. This choice is saved on this device for today.</p>'+
      fields+'<div class="osr-dialog-actions"><button type="button" data-osr-dialog-close>Cancel</button><button type="submit" value="save" class="osr-dialog-save">Save priorities</button></div></form>';
    state.dialog.returnValue='';
    state.dialog.showModal();
    state.dialog.querySelector('select').focus();
  }
  function quickAdd(){
    var sheet=el('osRefreshQuickAdd');if(!sheet)return;
    sheet.hidden=false;
    sheet.querySelector('button').focus();
    document.body.classList.add('os-refresh-sheet-open');
  }
  function closeQuickAdd(){var sheet=el('osRefreshQuickAdd');if(sheet)sheet.hidden=true;document.body.classList.remove('os-refresh-sheet-open');}
  function action(which){
    closeQuickAdd();
    if(which==='customize'){customize();return;}
    if(which==='new-task'){
      if(typeof openTaskFor==='function')openTaskFor(typeof getQuickAddWorld==='function'?getQuickAddWorld():'LIFE');
      else if(typeof openModal==='function')openModal('taskModal');
    }else if(which==='new-event'){
      if(typeof openCalEventModal==='function')openCalEventModal();
      else if(typeof setView==='function')setView('calendar');
    }else if(which==='new-note'){
      if(typeof newNote==='function')newNote();
      else if(typeof setView==='function')setView('knowledge');
    }else if(which==='expense'){
      if(typeof openCashModal==='function')openCashModal('Credit');
      else if(typeof setView==='function')setView('finances');
    }else if(which==='jelix'){
      if(typeof osAskJelixGlobal==='function')osAskJelixGlobal('Help me prioritize my day based on my current tasks and calendar.');
      else if(typeof setView==='function')setView('ai');
    }
  }
  function openTask(id){
    var t=tasks().find(function(x){return String(x.id)===String(id);});
    if(!t)return;
    if(typeof editTask==='function')editTask(t.id);
    else if(typeof openTaskModal==='function')openTaskModal(t.id);
    else if(typeof setView==='function')setView('tasks');
  }
  function install(){
    if(state.ready)return;
    var body=document.querySelector('#view-dashboard>.vb');if(!body)return;
    state.ready=true;
    var overview=document.createElement('div');overview.id='osRefreshCommand';overview.setAttribute('aria-label','JOBSystems Daily Command Center');overview.className='os-refresh-command';
    body.insertBefore(overview,body.firstChild);
    var button=document.createElement('button');button.type='button';button.id='osRefreshDetailToggle';button.className='osr-detail-toggle';button.setAttribute('aria-expanded','false');button.textContent='Show detailed widgets';
    body.insertBefore(button,overview.nextSibling);
    button.addEventListener('click',toggleAdvanced);
    document.body.classList.add('os-refresh-active');
    var dialog=document.createElement('dialog');dialog.id='osRefreshPriorityDialog';dialog.className='osr-dialog';document.body.appendChild(dialog);state.dialog=dialog;
    dialog.addEventListener('click',function(e){if(e.target===dialog||e.target.closest('[data-osr-dialog-close]'))dialog.close();});
    dialog.addEventListener('close',function(){
      if(dialog.returnValue!=='save')return;
      var selected=[0,1,2].map(function(i){var field=dialog.querySelector('[name="priority'+i+'"]');return field?field.value:'';}).filter(Boolean);
      if(new Set(selected).size!==selected.length){if(typeof showToast==='function')showToast('Choose three different tasks.');return;}
      try{localStorage.setItem(key(),JSON.stringify(selected));}catch(e){}
      scheduleRender();
    });
    var sheet=document.createElement('div');sheet.id='osRefreshQuickAdd';sheet.className='osr-quick-sheet';sheet.hidden=true;
    sheet.innerHTML='<div class="osr-quick-backdrop" data-osr-close-sheet></div><div class="osr-quick-panel" role="dialog" aria-label="Quick add"><div class="osr-quick-head"><strong>Quick add</strong><button type="button" data-osr-close-sheet aria-label="Close quick add"><i class="ti ti-x"></i></button></div>'+
      '<button type="button" data-osr-action="new-task"><i class="ti ti-check"></i> New task</button>'+
      '<button type="button" data-osr-action="new-event"><i class="ti ti-calendar-plus"></i> New event</button>'+
      '<button type="button" data-osr-action="new-note"><i class="ti ti-note"></i> Quick note</button>'+
      '<button type="button" data-osr-action="expense"><i class="ti ti-wallet"></i> Log expense</button></div>';
    document.body.appendChild(sheet);
    document.addEventListener('click',function(e){
      var close=e.target.closest('[data-osr-close-sheet]');if(close){closeQuickAdd();return;}
      var button=e.target.closest('[data-osr-action]');if(button){action(button.dataset.osrAction);return;}
      var view=e.target.closest('[data-osr-view]');if(view&&typeof setView==='function'){setView(view.dataset.osrView);return;}
      var task=e.target.closest('[data-osr-task]');if(task)openTask(task.dataset.osrTask);
    });
    document.addEventListener('keydown',function(e){if(e.key==='Escape')closeQuickAdd();});
    // Refresh after native task/calendar/finance changes without replacing their logic.
    if(typeof window.renderBrief==='function'){
      var old=window.renderBrief;
      window.renderBrief=function(){var r=old.apply(this,arguments);scheduleRender();return r;};
    }
    if(typeof window.setView==='function'){
      var previous=window.setView;
      window.setView=function(){var result=previous.apply(this,arguments);scheduleRender();return result;};
    }
    window.osRefreshOpenQuickAdd=quickAdd;
    window.osRefreshRender=scheduleRender;
    scheduleRender();
    window.addEventListener('focus',scheduleRender);
    window.addEventListener('storage',scheduleRender);
    setInterval(scheduleRender,60000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();