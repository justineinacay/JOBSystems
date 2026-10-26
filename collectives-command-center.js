(function(){
  'use strict';

  var state={workspace:'all',query:'',selected:null,bound:false};
  var WORKSPACES={
    venture:{label:'Job Collectives',short:'Job',tone:'job',icon:'ti-users-group',view:'venture'},
    build:{label:'Code Collectives',short:'Code',tone:'code',icon:'ti-code',view:'build'},
    sides:{label:'Creative Collectives',short:'Creative',tone:'creative',icon:'ti-infinity',view:'sides'}
  };
  var CREATIVE_OWNERSHIP={
    'justsigned':'Owned brand','just signed':'Owned brand','tatayo':'Owned brand',
    'dulce and banana':'External / family','dulce & banana':'External / family',
    'ezam':'Client / portfolio','getsemane':'Client / portfolio'
  };
  var CODE_OWNED_PRODUCTS=['naknak','pallo','diskarte','pasahero','dingo','melo','jobsystems'];

  function esc(value){
    if(typeof escapeHtml==='function')return escapeHtml(String(value==null?'':value));
    return String(value==null?'':value).replace(/[&<>"']/g,function(char){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];});
  }
  function today(){return typeof localDateStr==='function'?localDateStr(new Date()):new Date().toISOString().slice(0,10);}
  function money(value){return new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:0}).format(Number(value)||0);}
  function formatDate(value){
    if(!value)return 'No date';
    try{return new Date(value+'T00:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric',year:new Date(value+'T00:00:00').getFullYear()!==new Date().getFullYear()?'numeric':undefined});}catch(error){return value;}
  }
  function normalizedWorld(value){
    var world=String(value||'').toLowerCase();
    if(world==='venture'||world==='ven')return 'venture';
    if(world==='build'||world==='bld')return 'build';
    if(world==='sides'||world==='sid')return 'sides';
    return world;
  }
  function taskWorld(task){return normalizedWorld(task.world||task.worldId||task.world_id);}
  function taskDone(task){return String(task.status||'').toLowerCase()==='done'||task.completed===true;}
  function itemStage(item){return item.stage||item.status||'Unspecified';}
  function creativeOwnership(item){
    var key=String(item.name||item.client||'').trim().toLowerCase();
    return item.ownership||CREATIVE_OWNERSHIP[key]||'Unclassified';
  }
  function normalizedName(value){return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,'');}
  function isKnownCodeProduct(item){
    var name=normalizedName(item.name);
    return CODE_OWNED_PRODUCTS.some(function(product){return name===product||name.indexOf(product)===0;});
  }
  function relatedTasks(item){
    var names=[item.name,item.client].filter(Boolean).map(function(value){return String(value).toLowerCase();});
    return (DB.tasks||[]).filter(function(task){
      if(taskWorld(task)!==item.workspace)return false;
      if(item.projectId!=null&&String(task.projectId)===String(item.projectId))return true;
      var client=String(task.client||'').toLowerCase();
      var title=String(task.title||'').toLowerCase();
      return names.some(function(name){return client===name||title.indexOf(name)>=0;});
    });
  }
  function progressFor(item){
    var tasks=relatedTasks(item);
    if(tasks.length)return Math.round(tasks.filter(taskDone).length/tasks.length*100);
    if(Array.isArray(item.deliverables)&&item.deliverables.length)return Math.round(item.deliverables.filter(function(entry){return entry.done;}).length/item.deliverables.length*100);
    return null;
  }
  function portfolio(){
    var rows=[];
    (DB.venture||[]).forEach(function(item){
      rows.push({key:'venture:'+item.id,source:'venture',id:item.id,workspace:'venture',name:item.name||'Untitled relationship',description:item.notes||item.specialty||'',kind:item.type||'Relationship',ownership:'Job Collectives',stage:item.stage||'Unspecified',deadline:item.deadline||'',raw:item});
    });
    (DB.buildApps||[]).forEach(function(item){
      rows.push({key:'buildApp:'+item.id,source:'buildApp',id:item.id,workspace:'build',name:item.name||'Untitled product',description:item.desc||item.tech||'',kind:'Owned product',ownership:'Code Collectives',stage:item.status||'Unspecified',deadline:item.deadline||'',raw:item});
    });
    (DB.pipeline||[]).forEach(function(item){
      var owned=isKnownCodeProduct(item);
      rows.push({key:'pipeline:'+item.id,source:'pipeline',id:item.id,workspace:'build',name:item.name||'Untitled client project',description:item.client||item.tech||'',kind:owned?'Owned product':'Client development',ownership:owned?'Code Collectives':(item.client||'Client project'),stage:item.stage||'Unspecified',deadline:item.deadline||'',raw:item});
    });
    (DB.sides||[]).forEach(function(item){
      rows.push({key:'creativeBrand:'+item.id,source:'creativeBrand',id:item.id,workspace:'sides',name:item.name||'Untitled brand',description:item.desc||item.notes||'',kind:'Brand / product',ownership:creativeOwnership(item),stage:item.status||'Unspecified',deadline:item.deadline||'',raw:item});
    });
    (DB.creativeProjects||[]).forEach(function(item){
      rows.push({key:'creativeProject:'+item.id,source:'creativeProject',id:item.id,workspace:'sides',name:item.name||'Untitled project',description:item.client||item.notes||'',kind:'Creative project',ownership:creativeOwnership(item),stage:item.status||'Unspecified',deadline:item.deadline||'',raw:item});
    });
    return rows.map(function(item){item.progress=progressFor(item);return item;});
  }
  function collectiveTasks(){return (DB.tasks||[]).filter(function(task){return !!WORKSPACES[taskWorld(task)];});}
  function isActiveStage(stage){return !/done|delivered|cancelled|archived|inactive|paused/i.test(String(stage||''));}
  function filterRows(rows){
    var query=state.query.trim().toLowerCase();
    return rows.filter(function(item){
      if(state.workspace!=='all'&&item.workspace!==state.workspace)return false;
      if(!query)return true;
      return [item.name,item.description,item.kind,item.ownership,item.stage].join(' ').toLowerCase().indexOf(query)>=0;
    });
  }
  function empty(icon,title,copy){return '<div class="collectives-empty"><i class="ti '+icon+'"></i><strong>'+esc(title)+'</strong><span>'+esc(copy)+'</span></div>';}

  function renderMetrics(rows,tasks){
    var target=document.getElementById('collectivesMetrics');if(!target)return;
    var open=tasks.filter(function(task){return !taskDone(task);});
    var due=open.filter(function(task){return task.due;});
    var completed=tasks.filter(taskDone).length;
    var progress=tasks.length?Math.round(completed/tasks.length*100):0;
    var income=(DB.cashflow||[]).filter(function(row){
      var world=normalizedWorld(row.world||row.worldId||row.world_id);
      return WORKSPACES[world]&&(String(row.type||'').toLowerCase()==='credit'||Number(row.amount)>0);
    }).reduce(function(sum,row){return sum+Math.abs(Number(row.amount)||0);},0);
    var metrics=[
      ['ti-cube','Portfolio records',rows.length,'Across real workspace data','blue'],
      ['ti-activity','Active records',rows.filter(function(item){return isActiveStage(item.stage);}).length,'Products, clients, and projects','teal'],
      ['ti-checkbox','Open tasks',open.length,open.filter(function(task){return task.priority==='High'||task.priority==='Urgent';}).length+' high priority','amber'],
      ['ti-calendar-event','Dated actions',due.length,'Open tasks with deadlines','purple'],
      ['ti-cash','Recorded income',money(income),'Collective-tagged transactions','gold'],
      ['ti-chart-pie','Task progress',progress+'%',completed+' of '+tasks.length+' completed','cyan']
    ];
    target.innerHTML=metrics.map(function(metric){return '<article class="collectives-metric '+metric[4]+'"><i class="ti '+metric[0]+'"></i><div><span>'+esc(metric[1])+'</span><strong>'+esc(metric[2])+'</strong><small>'+esc(metric[3])+'</small></div></article>';}).join('');
  }
  function renderFilters(rows){
    var target=document.getElementById('collectivesWorkspaceFilters');if(!target)return;
    var counts={all:rows.length,venture:0,build:0,sides:0};rows.forEach(function(item){counts[item.workspace]++;});
    var filters=[['all','All'],['venture','Job'],['build','Code'],['sides','Creative']];
    target.innerHTML=filters.map(function(filter){return '<button type="button" class="'+(state.workspace===filter[0]?'active':'')+'" data-collectives-filter="'+filter[0]+'">'+esc(filter[1])+' <span>'+counts[filter[0]]+'</span></button>';}).join('');
  }
  function card(item){
    var workspace=WORKSPACES[item.workspace];
    var progress=item.progress==null?'<span class="collectives-progress-unknown">No linked tasks</span>':'<span class="collectives-card-progress"><i><em style="width:'+item.progress+'%"></em></i><b>'+item.progress+'%</b></span>';
    return '<button type="button" class="collectives-portfolio-card tone-'+workspace.tone+'" data-collectives-item="'+esc(item.key)+'">'+
      '<span class="collectives-card-top"><i class="ti '+workspace.icon+'"></i><span><strong>'+esc(item.name)+'</strong><small>'+esc(workspace.label)+'</small></span><em class="ti ti-chevron-right"></em></span>'+
      '<span class="collectives-card-description">'+esc(item.description||'No description recorded.')+'</span>'+progress+
      '<span class="collectives-card-meta"><b>'+esc(item.kind)+'</b><b>'+esc(item.stage)+'</b></span></button>';
  }
  function renderPortfolio(rows){
    var target=document.getElementById('collectivesPortfolio');if(!target)return;
    var filtered=filterRows(rows);
    var count=document.getElementById('collectivesPortfolioCount');if(count)count.textContent=filtered.length+' shown';
    target.innerHTML=filtered.length?filtered.map(card).join(''):empty('ti-search-off','No matching records','Try another search or workspace filter.');
  }
  function renderProgress(tasks){
    var target=document.getElementById('collectivesProgress');if(!target)return;
    target.innerHTML=Object.keys(WORKSPACES).map(function(key){
      var own=tasks.filter(function(task){return taskWorld(task)===key;});
      var done=own.filter(taskDone).length;
      var percent=own.length?Math.round(done/own.length*100):0;
      var meta=WORKSPACES[key];
      return '<button type="button" data-collectives-filter="'+key+'"><span class="collectives-ring tone-'+meta.tone+'" style="--value:'+percent+'"><b>'+percent+'%</b></span><strong>'+esc(meta.short)+'</strong><small>'+done+' of '+own.length+' tasks</small></button>';
    }).join('');
  }
  function renderMilestones(rows,tasks){
    var target=document.getElementById('collectivesMilestones');if(!target)return;
    var items=[];
    rows.filter(function(item){return item.deadline&&isActiveStage(item.stage);}).forEach(function(item){items.push({date:item.deadline,title:item.name,workspace:item.workspace,key:item.key,type:'item'});});
    tasks.filter(function(task){return !taskDone(task)&&task.due;}).forEach(function(task){items.push({date:task.due,title:task.title,workspace:taskWorld(task),id:task.id,type:'task'});});
    items.sort(function(a,b){return a.date.localeCompare(b.date);});
    target.innerHTML=items.length?items.slice(0,6).map(function(item){var meta=WORKSPACES[item.workspace];return '<button type="button" '+(item.type==='task'?'data-collectives-task="'+item.id+'"':'data-collectives-item="'+esc(item.key)+'"')+'><i class="tone-'+meta.tone+'"></i><span><strong>'+esc(item.title)+'</strong><small>'+esc(meta.short)+'</small></span><time>'+esc(formatDate(item.date))+'</time></button>';}).join(''):empty('ti-flag','No dated milestones','Add due dates to tasks or projects to build the roadmap.');
  }
  function renderUpcoming(tasks){
    var target=document.getElementById('collectivesUpcoming');if(!target)return;
    var start=today();var items=tasks.filter(function(task){return !taskDone(task)&&task.due&&task.due>=start;}).sort(function(a,b){return a.due.localeCompare(b.due);}).slice(0,6);
    target.innerHTML=items.length?items.map(function(task){var meta=WORKSPACES[taskWorld(task)];return '<button type="button" data-collectives-task="'+task.id+'"><time>'+esc(formatDate(task.due))+'</time><span><strong>'+esc(task.title)+'</strong><small>'+esc(meta.label)+'</small></span><i class="ti ti-chevron-right"></i></button>';}).join(''):empty('ti-calendar-check','No upcoming deadlines','Dated collective tasks will appear here.');
  }
  function renderRisks(tasks){
    var target=document.getElementById('collectivesRisks');if(!target)return;
    var start=today();var items=tasks.filter(function(task){return !taskDone(task)&&((task.due&&task.due<start)||task.priority==='High'||task.priority==='Urgent'||task.status==='No Progress');}).sort(function(a,b){return (a.due||'9999').localeCompare(b.due||'9999');}).slice(0,6);
    target.innerHTML=items.length?items.map(function(task){var overdue=task.due&&task.due<start;return '<button type="button" data-collectives-task="'+task.id+'"><span class="collectives-risk-icon '+(overdue?'critical':'warning')+'"><i class="ti '+(overdue?'ti-alert-circle':'ti-alert-triangle')+'"></i></span><span><strong>'+esc(task.title)+'</strong><small>'+esc(overdue?'Overdue '+formatDate(task.due):(task.priority||task.status||'Needs attention'))+'</small></span><i class="ti ti-chevron-right"></i></button>';}).join(''):empty('ti-shield-check','No immediate blockers','No overdue, high-priority, or stalled collective tasks.');
  }
  function renderReview(tasks){
    var target=document.getElementById('collectivesWeeklyReview');if(!target)return;
    var now=new Date();var weekAgo=new Date(now);weekAgo.setDate(now.getDate()-7);
    var period=document.getElementById('collectivesReviewPeriod');if(period)period.textContent=weekAgo.toLocaleDateString('en-PH',{month:'short',day:'numeric'})+'–'+now.toLocaleDateString('en-PH',{month:'short',day:'numeric'});
    var changed=tasks.filter(function(task){var raw=task.updated_at||task.updatedAt||task.created_at||task.createdAt;return raw&&new Date(raw)>=weekAgo;});
    var done=changed.filter(taskDone).length;
    var added=changed.filter(function(task){var raw=task.created_at||task.createdAt;return raw&&new Date(raw)>=weekAgo;}).length;
    var overdue=tasks.filter(function(task){return !taskDone(task)&&task.due&&task.due<today();}).length;
    target.innerHTML='<dl><div><dt>Completed</dt><dd>'+done+'</dd></div><div><dt>Added</dt><dd>'+added+'</dd></div><div><dt>Overdue now</dt><dd>'+overdue+'</dd></div></dl><p>'+(changed.length?'Based on '+changed.length+' task records changed this week.':'No timestamped task changes were recorded this week.')+'</p>';
  }
  function openItem(key){
    var item=portfolio().find(function(entry){return entry.key===key;});if(!item)return;
    state.selected=item;
    var detail=document.getElementById('collectivesDetail');if(!detail)return;
    var meta=WORKSPACES[item.workspace];var tasks=relatedTasks(item);var progress=item.progress;
    detail.hidden=false;
    detail.innerHTML='<div class="collectives-detail-scrim" data-collectives-close></div><aside role="dialog" aria-modal="true" aria-labelledby="collectivesDetailTitle"><button class="collectives-detail-close" type="button" data-collectives-close aria-label="Close details"><i class="ti ti-x"></i></button><span class="collectives-detail-workspace tone-'+meta.tone+'"><i class="ti '+meta.icon+'"></i>'+esc(meta.label)+'</span><h2 id="collectivesDetailTitle">'+esc(item.name)+'</h2><p>'+esc(item.description||'No description recorded.')+'</p><dl><div><dt>Type</dt><dd>'+esc(item.kind)+'</dd></div><div><dt>Classification</dt><dd>'+esc(item.ownership)+'</dd></div><div><dt>Stage</dt><dd>'+esc(item.stage)+'</dd></div><div><dt>Progress</dt><dd>'+(progress==null?'No linked tasks':progress+'%')+'</dd></div></dl><section><h3>Linked tasks</h3>'+(tasks.length?tasks.slice(0,8).map(function(task){return '<button type="button" data-collectives-task="'+task.id+'"><span>'+esc(task.title)+'</span><small>'+esc(task.status||'Open')+'</small></button>';}).join(''):empty('ti-link-off','No linked tasks','Link tasks with the record name, client, or project ID.'))+'</section><button class="collectives-button" type="button" data-collectives-open-source="'+esc(item.key)+'">Open in '+esc(meta.label)+' <i class="ti ti-arrow-up-right"></i></button></aside>';
  }
  function openSource(key){
    var item=portfolio().find(function(entry){return entry.key===key;});if(!item)return;
    closeDetail();setView(WORKSPACES[item.workspace].view);
    setTimeout(function(){
      if(item.source==='venture'&&typeof openVentureModal==='function')openVentureModal(item.id);
      else if(item.source==='buildApp'&&typeof openAppModal==='function')openAppModal(item.id);
      else if(item.source==='pipeline'&&typeof openPipelineModal==='function')openPipelineModal(item.id);
      else if(item.source==='creativeProject'&&typeof openCreativeProjectModal==='function')openCreativeProjectModal(item.id);
      else if(item.source==='creativeBrand'&&typeof editSidesProduct==='function')editSidesProduct(item.id);
    },180);
  }
  function closeDetail(){var detail=document.getElementById('collectivesDetail');if(detail){detail.hidden=true;detail.innerHTML='';}state.selected=null;}
  function setFilter(filter){state.workspace=filter;renderCollectivesCommandCenter();}
  function bind(){
    if(state.bound)return;state.bound=true;
    document.addEventListener('click',function(event){
      var filter=event.target.closest('[data-collectives-filter]');if(filter){setFilter(filter.dataset.collectivesFilter);return;}
      var item=event.target.closest('[data-collectives-item]');if(item){openItem(item.dataset.collectivesItem);return;}
      var task=event.target.closest('[data-collectives-task]');if(task){setView('tasks');setTimeout(function(){if(typeof editTask==='function')editTask(Number(task.dataset.collectivesTask));},150);return;}
      var source=event.target.closest('[data-collectives-open-source]');if(source){openSource(source.dataset.collectivesOpenSource);return;}
      if(event.target.closest('[data-collectives-close]'))closeDetail();
    });
    document.addEventListener('input',function(event){if(event.target.id==='collectivesSearch'){state.query=event.target.value;renderPortfolio(portfolio());}});
    document.addEventListener('keydown',function(event){if(event.key==='Escape')closeDetail();});
  }
  function renderCollectivesCommandCenter(){
    if(!document.getElementById('collectivesPortfolio'))return;
    bind();var rows=portfolio();var tasks=collectiveTasks();
    renderMetrics(rows,tasks);renderFilters(rows);renderPortfolio(rows);renderProgress(tasks);renderMilestones(rows,tasks);renderUpcoming(tasks);renderRisks(tasks);renderReview(tasks);
    var search=document.getElementById('collectivesSearch');if(search&&search.value!==state.query)search.value=state.query;
  }
  window.renderCollectivesCommandCenter=renderCollectivesCommandCenter;
})();
