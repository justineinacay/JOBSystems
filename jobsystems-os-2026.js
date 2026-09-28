/* JOBSystems Personal Operating System — 2026 compatibility layer */
(function(){
  'use strict';

  var OS_VIEW_TITLES={
    dashboard:'Today',tasks:'Tasks',calendar:'Calendar',projects:'Projects',
    finances:'Finance',knowledge:'Knowledge',review:'Reviews',ai:'J.E.L.I.X.',
    settings:'Settings','worlds-settings':'More',notes:'Knowledge',memory:'Knowledge',
    inbox:'Inbox',links:'Knowledge','all-files':'Knowledge',venture:'Job Collectives',
    build:'Code Collectives',sides:'Creative Collectives',faith:'Faith',life:'Personal'
  };
  var OS_WORKSPACES={
    venture:{label:'Job Collectives',color:'#4F8CFF',icon:'ti-briefcase'},
    build:{label:'Code Collectives',color:'#2DD4BF',icon:'ti-code'},
    sides:{label:'Creative Collectives',color:'#F5BE35',icon:'ti-palette'},
    faith:{label:'Faith',color:'#FF5D5D',icon:'ti-heart-handshake'},
    life:{label:'Personal',color:'#A78BFA',icon:'ti-user'}
  };
  var OS_CODE_TO_ID={
    venture:'venture',ven:'venture',
    build:'build',bld:'build',
    sides:'sides',sid:'sides',
    faith:'faith',fth:'faith',
    life:'life',lif:'life',personal:'life'
  };
  var osKnowledgeFilter='all';
  var osKnowledgeQuery='';

  function osEsc(value){
    if(typeof escapeHtml==='function')return escapeHtml(String(value==null?'':value));
    return String(value==null?'':value).replace(/[&<>"']/g,function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch];
    });
  }
  function osToday(){
    return typeof localDateStr==='function'?localDateStr(new Date()):new Date().toISOString().slice(0,10);
  }
  function osFmtDate(value){
    if(!value)return 'No deadline';
    try{return new Date(value+'T00:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric'});}catch(e){return value;}
  }
  function osMoney(value){
    return new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:0}).format(Number(value)||0);
  }
  function osWorkspaceMeta(raw){
    var key=String(raw||'').toLowerCase();
    var mapped=OS_CODE_TO_ID[key]||key;
    if(OS_WORKSPACES[mapped])return {id:mapped,label:OS_WORKSPACES[mapped].label,color:OS_WORKSPACES[mapped].color,icon:OS_WORKSPACES[mapped].icon};
    var custom=(typeof DB!=='undefined'&&DB.worlds||[]).find(function(w){return String(w.id).toLowerCase()===key;});
    if(custom){
      var color=custom.color&&/^#/.test(custom.color)?custom.color:'#969D98';
      return {id:custom.id,label:custom.label||custom.id,color:color,icon:custom.icon||'ti-grid-dots'};
    }
    return {id:key||'other',label:raw||'Unassigned',color:'#969D98',icon:'ti-circle'};
  }
  function osProjectWorld(project){
    if(project&&project.worldId)return project.worldId;
    var task=(typeof DB!=='undefined'&&DB.tasks||[]).find(function(t){return project&&String(t.projectId)===String(project.id);});
    return task?task.world:'';
  }
  function osProjectTasks(project){
    if(typeof DB==='undefined')return [];
    return (DB.tasks||[]).filter(function(t){return project&&String(t.projectId)===String(project.id);});
  }
  function osOpenTask(id){
    if(typeof setView==='function')setView('tasks');
    setTimeout(function(){if(typeof openTaskEdit==='function')openTaskEdit(id);},120);
  }
  function osOpenNote(index){
    if(typeof setView==='function')setView('notes');
    setTimeout(function(){if(typeof openNoteEditor==='function')openNoteEditor(index);},120);
  }
  function osAskJelix(prompt){
    if(typeof openJelixDrawer==='function'){
      openJelixDrawer();
      setTimeout(function(){
        var input=document.querySelector('#jelix-drawer input, #jelix-drawer textarea');
        if(input&&prompt){input.value=prompt;input.dispatchEvent(new Event('input',{bubbles:true}));}
      },120);
      return;
    }
    if(typeof setView==='function')setView('ai');
    if(prompt&&typeof qp==='function')setTimeout(function(){qp(prompt);},120);
  }

  function osMigrateWorkspacePresentation(){
    if(typeof DB==='undefined'||!Array.isArray(DB.worlds))return;
    var changed=false;
    DB.worlds.forEach(function(w){
      var spec=OS_WORKSPACES[w.id];
      if(!spec)return;
      if(w.label!==spec.label){w.label=spec.label;changed=true;}
      if(w.color!==spec.color){w.color=spec.color;changed=true;}
    });
    if(changed&&typeof save==='function'){
      try{save('worlds');}catch(e){console.warn('[JOBSystems OS] Workspace presentation migration stayed local.',e);}
    }
  }

  function osInstallBrand(){
    document.title='JOBSystems — Personal Operating System';
    var apple=document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if(apple)apple.content='JOBSystems';
    var theme=document.querySelector('meta[name="theme-color"]');
    if(theme)theme.content=document.documentElement.dataset.theme==='light'?'#F4F6F3':'#080B0A';

    var brand=document.querySelector('.sidebar-brand-name');
    if(brand)brand.innerHTML='JOBSystems<small>Personal Operating System</small>';
    var sideBrand=document.querySelector('.sidebar-brand');
    if(sideBrand)sideBrand.setAttribute('aria-label','JOBSystems home');
    var desktopBrand=document.querySelector('.tb-logo span');
    if(desktopBrand)desktopBrand.textContent='JOBSystems';
    document.querySelectorAll('#accountMenu').forEach(function(menu){
      menu.querySelectorAll('div').forEach(function(el){
        if(el.children.length===0&&el.textContent.trim()==='J.O.B Systems')el.textContent='JOBSystems';
      });
    });
  }

  function osInstallSidebar(){
    var nav=document.querySelector('.side-nav');
    if(!nav)return;
    nav.innerHTML=
      '<div class="ngl nav-section-heading">Essentials</div>'+
      '<div class="ni active" onclick="setView(\'dashboard\')" data-view="dashboard"><i class="ti ti-home"></i><span class="nav-label">Today</span></div>'+
      '<div class="ni" onclick="setView(\'tasks\')" data-view="tasks"><i class="ti ti-checklist"></i><span class="nav-label">Tasks</span><span class="nbadge" id="taskBadge">0</span></div>'+
      '<div class="ni" onclick="setView(\'calendar\')" data-view="calendar"><i class="ti ti-calendar"></i><span class="nav-label">Calendar</span></div>'+
      '<div class="ni" onclick="setView(\'projects\')" data-view="projects"><i class="ti ti-folders"></i><span class="nav-label">Projects</span></div>'+
      '<div class="ni" onclick="setView(\'finances\')" data-view="finances"><i class="ti ti-wallet"></i><span class="nav-label">Finance</span></div>'+
      '<div class="ni" onclick="setView(\'knowledge\')" data-view="knowledge"><i class="ti ti-book-2"></i><span class="nav-label">Knowledge</span></div>'+
      '<div class="ni" onclick="setView(\'review\')" data-view="review"><i class="ti ti-refresh"></i><span class="nav-label">Reviews</span></div>'+
      '<div class="ngl nav-section-heading nav-workspaces-heading" id="navWorldsLabel"><span>Workspaces</span><button class="nav-section-action" onclick="openWorldModal()" title="Add workspace" aria-label="Add workspace"><i class="ti ti-plus"></i></button></div>'+
      '<div id="navWorldsList"></div>'+
      '<div class="ngl nav-section-heading">System</div>'+
      '<div class="ni nav-ai-entry" onclick="setView(\'ai\')" data-view="ai"><i class="ti ti-sparkles"></i><span class="nav-label">J.E.L.I.X.</span></div>'+
      '<div class="ni" onclick="setView(\'settings\')" data-view="settings"><i class="ti ti-settings"></i><span class="nav-label">Settings</span></div>'+
      '<div class="nav-more-group">'+
        '<div class="ni nav-more-toggle" onclick="toggleDesktopMore(this)" role="button" tabindex="0" aria-expanded="false"><i class="ti ti-dots"></i><span class="nav-label">More</span><i class="ti ti-chevron-right nav-more-chevron"></i></div>'+
        '<div class="nav-more-items" id="desktopMoreItems">'+
          '<div class="ni" onclick="setView(\'inbox\')" data-view="inbox"><i class="ti ti-inbox"></i><span class="nav-label">Inbox</span><span class="nbadge" id="inboxBadge">0</span></div>'+
          '<div class="ni" onclick="setView(\'notes\')" data-view="notes"><i class="ti ti-notes"></i><span class="nav-label">Notes</span></div>'+
          '<div class="ni" onclick="setView(\'links\')" data-view="links"><i class="ti ti-link"></i><span class="nav-label">Saved links</span></div>'+
          '<div class="ni" onclick="setView(\'all-files\')" data-view="all-files"><i class="ti ti-files"></i><span class="nav-label">Files</span></div>'+
          '<div class="ni" onclick="setView(\'memory\')" data-view="memory"><i class="ti ti-brain"></i><span class="nav-label">Memory</span></div>'+
          '<div class="ni" onclick="setView(\'history\')" data-view="history"><i class="ti ti-history"></i><span class="nav-label">History</span></div>'+
        '</div>'+
      '</div>';
    if(typeof renderSideNav==='function')renderSideNav();
    osNormalizeWorkspaceNav();
  }

  function osNormalizeWorkspaceNav(){
    var labels={venture:'Job Collectives',build:'Code Collectives',sides:'Creative Collectives',faith:'Faith',life:'Personal'};
    Object.keys(labels).forEach(function(id){
      var row=document.querySelector('#navWorldsList [data-world-id="'+id+'"]');
      if(!row)return;
      var span=row.querySelector('span');
      if(span)span.textContent=labels[id];
      row.title=labels[id];
    });
    var view=window.JOBSystemsCurrentView||(typeof currentView!=='undefined'?currentView:'dashboard');
    document.querySelectorAll('.side-panel [data-view]').forEach(function(el){el.classList.toggle('active',el.dataset.view===view);});
    var extras=['inbox','notes','links','all-files','memory','history','jarvis-capture','jarvis-connect','jarvis-weekly','jarvis-context','jarvis-pattern','jarvis-decision','jarvis-claude'];
    var group=document.querySelector('.nav-more-group');
    if(group){
      group.classList.toggle('open',extras.indexOf(view)>-1);
      var trigger=group.querySelector('.nav-more-toggle');
      if(trigger)trigger.setAttribute('aria-expanded',String(extras.indexOf(view)>-1));
    }
  }

  function osInstallTopbar(){
    var right=document.querySelector('.tb-r');
    if(!right||right.querySelector('.os-top-avatar'))return;
    var avatar=document.createElement('button');
    avatar.type='button';
    avatar.className='os-top-avatar';
    avatar.setAttribute('aria-label','Open profile menu');
    avatar.title='Profile';
    avatar.textContent='JI';
    avatar.addEventListener('click',function(event){if(typeof toggleAccountMenu==='function')toggleAccountMenu(event);});
    right.appendChild(avatar);
    var search=document.getElementById('desktopSearchBar');
    if(search){
      var span=search.querySelector('span');
      if(span)span.textContent='Search tasks, projects, notes...';
    }
  }

  function osEnsureViews(){
    var main=document.getElementById('mainContent');
    if(!main)return;
    if(!document.getElementById('view-projects')){
      var projects=document.createElement('div');
      projects.className='view';
      projects.id='view-projects';
      projects.innerHTML=
        '<div class="os-page-shell">'+
          '<header class="os-page-header"><div class="os-page-header-copy"><div class="os-page-eyebrow">Personal productivity OS</div><h1>Projects</h1><p>Move important work from idea to done.</p></div>'+
          '<button class="os-button primary" type="button" id="osProjectNew"><i class="ti ti-plus"></i> New project</button></header>'+
          '<div id="osProjectsBody"></div>'+
        '</div>';
      main.appendChild(projects);
    }
    if(!document.getElementById('view-knowledge')){
      var knowledge=document.createElement('div');
      knowledge.className='view';
      knowledge.id='view-knowledge';
      knowledge.innerHTML=
        '<div class="os-page-shell">'+
          '<header class="os-page-header"><div class="os-page-header-copy"><div class="os-page-eyebrow">Personal knowledge hub</div><h1>Knowledge</h1><p>Keep what matters easy to find.</p></div>'+
          '<button class="os-button secondary" type="button" onclick="osAskJelixGlobal()"><i class="ti ti-sparkles"></i> Ask J.E.L.I.X.</button></header>'+
          '<div id="osKnowledgeBody"></div>'+
        '</div>';
      main.appendChild(knowledge);
    }
    var finance=document.getElementById('view-finances');
    if(finance&&!finance.dataset.osFinanceShell){
      finance.dataset.osFinanceShell='1';
      finance.innerHTML=
        '<div class="os-page-shell">'+
          '<header class="os-page-header"><div class="os-page-header-copy"><div class="os-page-eyebrow">Personal finance</div><h1>Finance</h1><p>Know where your money is going.</p></div>'+
          '<button class="os-button primary" type="button" onclick="openCashModal(\'Credit\')"><i class="ti ti-plus"></i> Add transaction</button></header>'+
          '<div id="osFinanceBody"></div>'+
        '</div>';
    }
    var newProject=document.getElementById('osProjectNew');
    if(newProject&&!newProject.dataset.bound){
      newProject.dataset.bound='1';
      newProject.addEventListener('click',function(){
        var worlds=(typeof DB!=='undefined'&&DB.worlds)||[];
        var world=worlds[0];
        if(typeof createProjectFlow==='function'&&world)createProjectFlow((world.id||'life').toUpperCase());
        else if(typeof setView==='function')setView('tasks');
      });
    }
  }

  function osProjectStatus(project,tasks){
    var today=osToday();
    var open=tasks.filter(function(t){return t.status!=='Done';});
    var overdue=open.filter(function(t){return t.due&&t.due<today;});
    if(tasks.length&&open.length===0)return {label:'Completed',tone:'var(--green)'};
    if(overdue.length)return {label:'At Risk',tone:'var(--os-danger)'};
    if(tasks.length===0)return {label:'Planning',tone:'var(--os-warning)'};
    return {label:'Active',tone:'var(--os-lime)'};
  }
  function osRenderProjects(){
    var body=document.getElementById('osProjectsBody');
    if(!body||typeof DB==='undefined')return;
    var projects=(DB.projects||[]).slice();
    var rows=projects.map(function(project){
      var tasks=osProjectTasks(project);
      var done=tasks.filter(function(t){return t.status==='Done';}).length;
      var open=tasks.length-done;
      var progress=tasks.length?Math.round(done/tasks.length*100):0;
      var dueTasks=tasks.filter(function(t){return t.status!=='Done'&&t.due;}).sort(function(a,b){return String(a.due).localeCompare(String(b.due));});
      var next=dueTasks[0]||null;
      var meta=osWorkspaceMeta(osProjectWorld(project));
      var status=osProjectStatus(project,tasks);
      return {project:project,tasks:tasks,done:done,open:open,progress:progress,next:next,meta:meta,status:status};
    });
    var active=rows.filter(function(r){return r.status.label==='Active'||r.status.label==='Planning';}).length;
    var risk=rows.filter(function(r){return r.status.label==='At Risk';}).length;
    var completed=rows.filter(function(r){return r.status.label==='Completed';}).length;
    var today=osToday();
    var upcoming=rows.filter(function(r){return r.next&&r.next.due>=today;}).length;

    var metrics=
      '<div class="os-metric-strip">'+
        '<div class="os-metric"><small>Active</small><strong>'+active+'</strong></div>'+
        '<div class="os-metric"><small>At Risk</small><strong>'+risk+'</strong></div>'+
        '<div class="os-metric"><small>Completed</small><strong>'+completed+'</strong></div>'+
        '<div class="os-metric"><small>Upcoming milestones</small><strong>'+upcoming+'</strong></div>'+
      '</div>';

    var projectHtml='';
    if(!rows.length){
      projectHtml='<div class="os-empty"><div><i class="ti ti-folders"></i><strong>No projects yet</strong><span>Create a project from a workspace or the Tasks project view. Your existing tasks remain untouched.</span></div></div>';
    }else{
      projectHtml='<div class="os-project-list">'+rows.map(function(r){
        return '<article class="os-project-card" role="button" tabindex="0" data-os-project="'+osEsc(r.project.id)+'">'+
          '<div class="os-project-top"><div class="os-project-title">'+osEsc(r.project.name||'Untitled Project')+'</div>'+
          '<span class="os-badge" style="color:'+r.status.tone+'"><span class="os-dot"></span>'+r.status.label+'</span></div>'+
          '<div class="os-project-meta"><span class="os-badge" style="color:'+r.meta.color+'"><span class="os-dot"></span>'+osEsc(r.meta.label)+'</span>'+
          (r.next?'<span class="os-badge"><i class="ti ti-calendar"></i>'+osFmtDate(r.next.due)+'</span>':'<span class="os-badge">No deadline</span>')+'</div>'+
          '<div class="os-progress" aria-label="'+r.progress+' percent complete"><span style="width:'+r.progress+'%"></span></div>'+
          '<div class="os-project-stats"><span>'+r.progress+'% complete</span><span>'+r.open+' task'+(r.open===1?'':'s')+' remaining</span></div>'+
        '</article>';
      }).join('')+'</div>';
    }

    var attention=rows.filter(function(r){return r.status.label==='At Risk';}).slice(0,5);
    var attentionHtml=attention.length?attention.map(function(r){
      var overdue=r.tasks.filter(function(t){return t.status!=='Done'&&t.due&&t.due<today;}).length;
      return '<div class="os-attention-item" data-os-project="'+osEsc(r.project.id)+'"><div class="os-item-icon" style="color:'+r.meta.color+'"><i class="ti '+r.meta.icon+'"></i></div>'+
        '<div class="os-item-copy"><div class="os-item-title">'+osEsc(r.project.name||'Untitled Project')+'</div><div class="os-item-sub">'+overdue+' overdue task'+(overdue===1?'':'s')+' · '+osEsc(r.meta.label)+'</div></div>'+
        '<i class="ti ti-chevron-right" style="color:var(--os-text-3)"></i></div>';
    }).join(''):'<div class="os-empty" style="min-height:110px"><div><strong>No project risks detected</strong><span>Projects with overdue tasks will appear here.</span></div></div>';

    var recommendation=attention.length?
      'Start with '+osEsc(attention[0].project.name||'the first at-risk project')+'. It has the strongest deadline signal right now.':
      (rows.length?'No project currently has an overdue task. Review the next milestone before adding more work.':'Create projects only where a group of tasks has a shared outcome.');

    body.innerHTML=metrics+
      '<div class="os-page-grid">'+
        '<div class="os-main-column"><section class="os-panel"><div class="os-section-heading"><h2>Projects</h2><small>'+rows.length+' total</small></div>'+projectHtml+'</section></div>'+
        '<aside class="os-context-column">'+
          '<section class="os-panel"><div class="os-section-heading"><h2>Needs attention</h2><small>Deadline signals</small></div><div class="os-attention-list">'+attentionHtml+'</div></section>'+
          '<section class="os-panel os-jelix-card"><div class="os-section-heading"><h2><span class="os-jelix-mark">✦</span> J.E.L.I.X. context</h2></div><p style="margin:0;color:var(--os-text-2);font-size:12px;line-height:1.55">'+recommendation+'</p><button class="os-button secondary" style="margin-top:12px;width:100%" onclick="osAskJelixGlobal(\'Review my active projects and tell me what needs attention next.\')"><i class="ti ti-sparkles"></i> Ask J.E.L.I.X.</button></section>'+
        '</aside>'+
      '</div>';

    body.querySelectorAll('[data-os-project]').forEach(function(card){
      function open(){
        if(typeof setView==='function')setView('tasks');
        if(typeof setBoardView==='function')setTimeout(function(){setBoardView('project');},120);
      }
      card.addEventListener('click',open);
      card.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});
    });
  }

  function osNoteText(note){
    var blocks=(note&&note.blocks)||[];
    return blocks.map(function(b){return b.content||'';}).join(' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  }
  function osKnowledgeRecords(){
    if(typeof DB==='undefined')return [];
    var records=[];
    (DB.notes||[]).forEach(function(note,index){
      records.push({type:'notes',title:note.title||'Untitled note',sub:osNoteText(note).slice(0,110)||'Note',index:index,pinned:!!note.pinned,world:note.worldId||''});
    });
    (DB.savedLinks||[]).forEach(function(link){
      records.push({type:'links',title:link.title||link.url||'Saved link',sub:link.url||'',url:link.url||'',world:link.worldId||''});
    });
    if(typeof _getAllFilesItems==='function'){
      try{_getAllFilesItems().forEach(function(file){records.push({type:'files',title:file.name||'File',sub:file.url||'',url:file.url||'',world:file.worldId||''});});}catch(e){}
    }
    (DB.memories||[]).forEach(function(memory){
      records.push({type:'memory',title:memory.title||memory.name||'Memory',sub:memory.content||memory.text||memory.value||'Saved memory',memory:memory});
    });
    return records;
  }
  function osSetKnowledgeFilter(filter){
    osKnowledgeFilter=filter||'all';
    osRenderKnowledge();
  }
  function osSetKnowledgeQuery(value){
    osKnowledgeQuery=String(value||'').trim().toLowerCase();
    osRenderKnowledge();
  }
  function osRenderKnowledge(){
    var body=document.getElementById('osKnowledgeBody');
    if(!body)return;
    var all=osKnowledgeRecords();
    var filtered=all.filter(function(r){
      if(osKnowledgeFilter!=='all'&&r.type!==osKnowledgeFilter)return false;
      if(!osKnowledgeQuery)return true;
      return (r.title+' '+r.sub).toLowerCase().indexOf(osKnowledgeQuery)>-1;
    });
    var counts={
      all:all.length,
      notes:all.filter(function(r){return r.type==='notes';}).length,
      links:all.filter(function(r){return r.type==='links';}).length,
      files:all.filter(function(r){return r.type==='files';}).length,
      memory:all.filter(function(r){return r.type==='memory';}).length
    };
    var chips=[
      ['all','All'],['notes','Notes'],['links','Saved resources'],['files','Documents'],['memory','Memory']
    ].map(function(pair){
      return '<button class="os-chip '+(osKnowledgeFilter===pair[0]?'active':'')+'" type="button" data-os-kfilter="'+pair[0]+'">'+pair[1]+' · '+counts[pair[0]]+'</button>';
    }).join('');

    var pinned=all.filter(function(r){return r.pinned;}).slice(0,4);
    var list=filtered.slice(0,40);
    var listHtml=list.length?list.map(function(r){
      var icons={notes:'ti-notes',links:'ti-link',files:'ti-file',memory:'ti-brain'};
      var meta=osWorkspaceMeta(r.world);
      return '<div class="os-knowledge-item" data-os-ktype="'+r.type+'" data-os-kindex="'+(r.index==null?'':r.index)+'" data-os-url="'+osEsc(r.url||'')+'">'+
        '<div class="os-item-icon" style="color:'+(r.world?meta.color:'var(--os-text-2)')+'"><i class="ti '+(icons[r.type]||'ti-file')+'"></i></div>'+
        '<div class="os-item-copy"><div class="os-item-title">'+osEsc(r.title)+'</div><div class="os-item-sub">'+osEsc(r.sub||r.type)+'</div></div>'+
        '<span class="os-badge">'+(r.type==='links'?'Resource':r.type==='files'?'Document':r.type==='memory'?'Memory':'Note')+'</span>'+
      '</div>';
    }).join(''):'<div class="os-empty"><div><i class="ti ti-search-off"></i><strong>No matching knowledge</strong><span>Try another search or capture a note.</span></div></div>';

    var pinnedHtml=pinned.length?pinned.map(function(r){
      return '<div class="os-attention-item"><div class="os-item-icon"><i class="ti ti-pin"></i></div><div class="os-item-copy"><div class="os-item-title">'+osEsc(r.title)+'</div><div class="os-item-sub">'+osEsc(r.sub)+'</div></div></div>';
    }).join(''):'<div style="color:var(--os-text-3);font-size:11px;line-height:1.5">Pin important notes in the existing note workflow and they will surface here.</div>';

    body.innerHTML=
      '<div class="os-page-grid">'+
        '<div class="os-main-column">'+
          '<section class="os-panel">'+
            '<div class="os-search"><i class="ti ti-search"></i><input id="osKnowledgeSearch" type="search" value="'+osEsc(osKnowledgeQuery)+'" placeholder="Search knowledge..." aria-label="Search knowledge"></div>'+
            '<div class="os-knowledge-chips">'+chips+'</div>'+
            '<div class="os-section-heading"><h2>Knowledge</h2><small>'+filtered.length+' result'+(filtered.length===1?'':'s')+'</small></div>'+
            '<div class="os-knowledge-list">'+listHtml+'</div>'+
          '</section>'+
        '</div>'+
        '<aside class="os-context-column">'+
          '<section class="os-panel"><div class="os-section-heading"><h2>Pinned</h2><small>Quick reference</small></div>'+pinnedHtml+'</section>'+
          '<section class="os-panel os-jelix-card"><div class="os-section-heading"><h2><span class="os-jelix-mark">✦</span> Ask across knowledge</h2></div><p style="margin:0;color:var(--os-text-2);font-size:12px;line-height:1.55">Use J.E.L.I.X. for synthesis when the connected assistant has access to the information you need. This view itself only searches data already stored in JOBSystems.</p><button class="os-button secondary" style="margin-top:12px;width:100%" onclick="osAskJelixGlobal(\'Help me find and summarize the relevant information in my JOBSystems knowledge.\')"><i class="ti ti-sparkles"></i> Ask J.E.L.I.X.</button></section>'+
        '</aside>'+
      '</div>';

    var search=document.getElementById('osKnowledgeSearch');
    if(search){
      search.addEventListener('input',function(e){
        osKnowledgeQuery=String(e.target.value||'').trim().toLowerCase();
        clearTimeout(window.__osKnowledgeTimer);
        window.__osKnowledgeTimer=setTimeout(osRenderKnowledge,120);
      });
      if(osKnowledgeQuery)requestAnimationFrame(function(){search.focus();search.setSelectionRange(search.value.length,search.value.length);});
    }
    body.querySelectorAll('[data-os-kfilter]').forEach(function(btn){btn.addEventListener('click',function(){osSetKnowledgeFilter(btn.dataset.osKfilter);});});
    body.querySelectorAll('.os-knowledge-item').forEach(function(item){
      item.addEventListener('click',function(){
        var type=item.dataset.osKtype;
        if(type==='notes')return osOpenNote(Number(item.dataset.osKindex));
        if(type==='memory'&&typeof setView==='function')return setView('memory');
        var url=item.dataset.osUrl;
        if(url&&/^https?:\/\//i.test(url))window.open(url,'_blank','noopener,noreferrer');
      });
    });
  }

  function osRenderFinance(){
    var body=document.getElementById('osFinanceBody');
    if(!body||typeof DB==='undefined')return;
    var now=new Date();
    var today=osToday();
    var monthStart=today.slice(0,8)+'01';
    var all=(DB.cashflow||[]).slice();
    var month=all.filter(function(t){return t.date&&t.date>=monthStart&&t.date<=today;});
    var income=month.filter(function(t){return t.type==='Debit';}).reduce(function(sum,t){return sum+(Number(t.amount)||0);},0);
    var expenses=month.filter(function(t){return t.type==='Credit'||t.type==='Payment';}).reduce(function(sum,t){return sum+(Number(t.amount)||0);},0);
    var net=income-expenses;
    var fallback=all.reduce(function(sum,t){return sum+(t.type==='Debit'?(Number(t.amount)||0):-(Number(t.amount)||0));},0);
    var names=typeof getAccountNames==='function'?getAccountNames():[];
    var balance=(names.length&&typeof getTotalPortfolioBalance==='function')?getTotalPortfolioBalance():fallback;

    var dates=[];
    for(var i=6;i>=0;i--){var d=new Date(now);d.setDate(now.getDate()-i);dates.push(d);}
    var daily=dates.map(function(date){
      var key=typeof localDateStr==='function'?localDateStr(date):date.toISOString().slice(0,10);
      return all.filter(function(t){return t.date===key;}).reduce(function(sum,t){return sum+(t.type==='Debit'?(Number(t.amount)||0):-(Number(t.amount)||0));},0);
    });
    var max=Math.max.apply(null,daily.map(function(v){return Math.abs(v);}).concat([1]));
    var bars=dates.map(function(date,index){
      var value=daily[index];
      var height=Math.max(8,Math.round(Math.abs(value)/max*86));
      var label=date.toLocaleDateString('en-PH',{weekday:'short'}).slice(0,1);
      return '<div class="os-cashflow-day" title="'+osEsc(osFmtDate(typeof localDateStr==='function'?localDateStr(date):date.toISOString().slice(0,10))+' · '+osMoney(value))+'"><span class="'+(value<0?'negative':'positive')+'" style="height:'+height+'px"></span><small>'+label+'</small></div>';
    }).join('');

    var recent=all.slice().sort(function(a,b){return String(b.date||'').localeCompare(String(a.date||''));}).slice(0,7);
    var recentHtml=recent.length?recent.map(function(t){
      var isIncome=t.type==='Debit';
      return '<div class="os-transaction-row" data-os-cash-id="'+osEsc(t.id)+'"><div class="os-item-icon '+(isIncome?'income':'expense')+'"><i class="ti ti-'+(isIncome?'arrow-down-left':'arrow-up-right')+'"></i></div>'+
        '<div class="os-item-copy"><div class="os-item-title">'+osEsc(t.desc||t.description||'Transaction')+'</div><div class="os-item-sub">'+osEsc(t.category||t.account||'Uncategorised')+' · '+osEsc(t.date||'No date')+'</div></div>'+
        '<strong class="'+(isIncome?'os-income':'os-expense')+'">'+(isIncome?'+':'−')+osMoney(t.amount)+'</strong></div>';
    }).join(''):'<div class="os-empty" style="min-height:120px"><div><i class="ti ti-receipt"></i><strong>No transactions yet</strong><span>Add a real transaction to start the finance view.</span></div></div>';

    var accountHtml=names.length?names.slice(0,6).map(function(name,index){
      var value=typeof getAccountBalance==='function'?getAccountBalance(name):0;
      return '<div class="os-account-row"><span class="os-account-mark" style="--account-accent:'+[ 'var(--os-job)','var(--os-code)','var(--os-creative)','var(--os-personal)' ][index%4]+'"><i class="ti ti-wallet"></i></span><div class="os-item-copy"><div class="os-item-title">'+osEsc(name)+'</div><div class="os-item-sub">Account balance</div></div><strong class="'+(value<0?'os-expense':'')+'">'+osMoney(value)+'</strong></div>';
    }).join(''):'<div style="color:var(--os-text-3);font-size:11px;line-height:1.5">No accounts yet. Add accounts from the Personal workspace finance tools.</div>';

    var bills=(DB.bills||[]).filter(function(b){return b.status!=='paid';}).sort(function(a,b){return String(a.dueDate||'9999').localeCompare(String(b.dueDate||'9999'));}).slice(0,5);
    var billHtml=bills.length?bills.map(function(b){
      var overdue=b.dueDate&&b.dueDate<today;
      return '<div class="os-bill-row"><div class="os-item-copy"><div class="os-item-title">'+osEsc(b.name||'Bill')+'</div><div class="os-item-sub">'+(overdue?'Overdue · ':'Due ')+osEsc(osFmtDate(b.dueDate))+'</div></div><strong class="'+(overdue?'os-expense':'')+'">'+osMoney(b.amount)+'</strong></div>';
    }).join(''):'<div style="color:var(--os-text-3);font-size:11px;line-height:1.5">No unpaid bills are currently recorded.</div>';

    body.innerHTML=
      '<div class="os-metric-strip os-finance-metrics">'+
        '<div class="os-metric os-balance-metric"><small>Available balance</small><strong class="'+(balance<0?'os-expense':'')+'">'+osMoney(balance)+'</strong></div>'+
        '<div class="os-metric"><small>Income · this month</small><strong class="os-income">'+osMoney(income)+'</strong></div>'+
        '<div class="os-metric"><small>Expenses · this month</small><strong class="os-expense">'+osMoney(expenses)+'</strong></div>'+
        '<div class="os-metric"><small>Net cash flow</small><strong class="'+(net<0?'os-expense':'os-income')+'">'+osMoney(net)+'</strong></div>'+
      '</div>'+
      '<div class="os-page-grid">'+
        '<div class="os-main-column">'+
          '<section class="os-panel"><div class="os-section-heading"><h2>Cash flow</h2><small>Last 7 days</small></div><div class="os-cashflow-chart">'+bars+'</div></section>'+
          '<section class="os-panel"><div class="os-section-heading"><h2>Recent transactions</h2><button class="os-text-action" type="button" data-os-finance-detail="transactions">View all</button></div><div class="os-transaction-list">'+recentHtml+'</div></section>'+
        '</div>'+
        '<aside class="os-context-column">'+
          '<section class="os-panel"><div class="os-section-heading"><h2>Accounts</h2><button class="os-text-action" type="button" data-os-finance-detail="accounts">Manage</button></div>'+accountHtml+'</section>'+
          '<section class="os-panel"><div class="os-section-heading"><h2>Upcoming bills</h2><small>'+bills.length+' open</small></div>'+billHtml+'</section>'+
        '</aside>'+
      '</div>';

    body.querySelectorAll('[data-os-cash-id]').forEach(function(row){
      row.addEventListener('click',function(){
        var id=row.dataset.osCashId;
        var record=all.find(function(t){return String(t.id)===String(id);});
        if(record&&typeof editCash==='function')editCash(record.id);
      });
    });
    body.querySelectorAll('[data-os-finance-detail]').forEach(function(btn){
      btn.addEventListener('click',function(){
        var tab=btn.dataset.osFinanceDetail;
        if(typeof openMobileFinanceDetail==='function')openMobileFinanceDetail(tab);
        else if(typeof setView==='function')setView('life');
      });
    });
  }

  function osInstallTodayQuickActions(){
    var body=document.querySelector('#view-dashboard>.vb');
    var focus=body&&body.querySelector('.today-focus');
    if(!body||!focus||body.querySelector('.os-quick-actions'))return;
    var actions=document.createElement('section');
    actions.className='os-quick-actions';
    actions.setAttribute('aria-label','Quick actions');
    actions.innerHTML=
      '<button class="os-quick-action" type="button" data-os-action="task"><i class="ti ti-plus"></i><span>Add Task</span></button>'+
      '<button class="os-quick-action" type="button" data-os-action="jelix"><i class="ti ti-sparkles"></i><span>Ask J.E.L.I.X.</span></button>'+
      '<button class="os-quick-action" type="button" data-os-action="event"><i class="ti ti-calendar-plus"></i><span>Add Event</span></button>'+
      '<button class="os-quick-action" type="button" data-os-action="note"><i class="ti ti-note"></i><span>Quick Note</span></button>';
    focus.insertAdjacentElement('afterend',actions);
    actions.addEventListener('click',function(e){
      var btn=e.target.closest('[data-os-action]');if(!btn)return;
      var action=btn.dataset.osAction;
      if(action==='task'&&typeof openModal==='function')openModal('taskModal');
      if(action==='event'&&typeof openCalEventModal==='function')openCalEventModal();
      if(action==='note'&&typeof newNote==='function')newNote();
      if(action==='jelix')osAskJelix('What should I do next today?');
    });
  }

  function osInstallMobileChrome(){
    var header=document.getElementById('mobileTopBar');
    if(header){
      header.innerHTML=
        '<div class="os-mobile-brand"><img src="jobsystems-logo.png" alt=""><span class="os-mobile-page-title" id="osMobilePageTitle">Today</span></div>'+
        '<div class="os-mobile-actions">'+
          '<button class="os-mobile-icon" type="button" aria-label="Search" onclick="openMobileSearch()"><i class="ti ti-search"></i></button>'+
          '<button class="os-mobile-icon" type="button" aria-label="Profile" id="osMobileProfile"><i class="ti ti-user"></i></button>'+
        '</div>';
      var profile=document.getElementById('osMobileProfile');
      if(profile)profile.addEventListener('click',function(e){if(typeof toggleAccountMenu==='function')toggleAccountMenu(e);});
    }
    var nav=document.getElementById('mobileBottomNav');
    if(nav){
      nav.innerHTML=
        '<button class="os-mbn-tab active" id="osMbnToday" type="button" onclick="setView(\'dashboard\')"><i class="ti ti-home"></i><span>Today</span></button>'+
        '<button class="os-mbn-tab" id="osMbnTasks" type="button" onclick="setView(\'tasks\')"><i class="ti ti-checklist"></i><span>Tasks</span></button>'+
        '<button class="os-mbn-tab" id="osMbnCalendar" type="button" onclick="setView(\'calendar\')"><i class="ti ti-calendar"></i><span>Calendar</span></button>'+
        '<button class="os-mbn-tab" id="osMbnProjects" type="button" onclick="setView(\'projects\')"><i class="ti ti-folders"></i><span>Projects</span></button>'+
        '<button class="os-mbn-tab" id="osMbnMore" type="button" onclick="setView(\'worlds-settings\')"><i class="ti ti-grid-dots"></i><span>More</span></button>';
    }
    if(!document.querySelector('.os-mobile-jelix')){
      var jelix=document.createElement('button');
      jelix.type='button';
      jelix.className='os-mobile-jelix';
      jelix.setAttribute('aria-label','Open J.E.L.I.X.');
      jelix.innerHTML='✦';
      jelix.addEventListener('click',function(){osAskJelix();});
      document.body.appendChild(jelix);
    }
  }

  function osInstallMorePrimary(){
    var scroll=document.querySelector('#view-worlds-settings .mobile-workspaces-scroll');
    if(!scroll||scroll.querySelector('.os-more-primary'))return;
    var primary=document.createElement('div');
    primary.className='os-more-primary';
    primary.innerHTML=
      '<button type="button" onclick="setView(\'finances\')"><i class="ti ti-wallet"></i><span>Finance</span></button>'+
      '<button type="button" onclick="setView(\'knowledge\')"><i class="ti ti-book-2"></i><span>Knowledge</span></button>'+
      '<button type="button" onclick="setView(\'review\')"><i class="ti ti-refresh"></i><span>Reviews</span></button>'+
      '<button type="button" onclick="setView(\'ai\')"><i class="ti ti-sparkles"></i><span>J.E.L.I.X.</span></button>'+
      '<button type="button" onclick="setView(\'settings\')"><i class="ti ti-settings"></i><span>Settings</span></button>'+
      '<button type="button" onclick="openHelpAssistant()"><i class="ti ti-help"></i><span>Help</span></button>';
    scroll.insertBefore(primary,scroll.firstChild);
  }

  function osUpdateMobileChrome(view){
    var title=document.getElementById('osMobilePageTitle');
    if(title)title.textContent=OS_VIEW_TITLES[view]||OS_VIEW_TITLES[String(view||'').toLowerCase()]||'JOBSystems';
    var map={
      dashboard:'osMbnToday',tasks:'osMbnTasks',calendar:'osMbnCalendar',projects:'osMbnProjects',
      finances:'osMbnMore',knowledge:'osMbnMore',review:'osMbnMore',ai:'osMbnMore',
      settings:'osMbnMore','worlds-settings':'osMbnMore',venture:'osMbnMore',build:'osMbnMore',
      sides:'osMbnMore',faith:'osMbnMore',life:'osMbnMore',notes:'osMbnMore',memory:'osMbnMore',
      inbox:'osMbnMore',links:'osMbnMore','all-files':'osMbnMore'
    };
    document.querySelectorAll('.os-mbn-tab').forEach(function(tab){tab.classList.remove('active');});
    var active=document.getElementById(map[view]||'osMbnMore');
    if(active)active.classList.add('active');
  }

  function osPatchSetView(){
    if(window.__jobsystemsOsSetViewPatched||typeof window.setView!=='function')return;
    window.__jobsystemsOsSetViewPatched=true;
    var previous=window.setView;
    window.setView=function(view){
      var target=view==='finance'?'finances':view==='reviews'?'review':view;
      previous(target);
      window.JOBSystemsCurrentView=target;
      if(target==='projects')osRenderProjects();
      if(target==='knowledge')osRenderKnowledge();
      if(target==='finances')osRenderFinance();
      if(target==='worlds-settings')osInstallMorePrimary();
      osUpdateMobileChrome(target);
      osNormalizeWorkspaceNav();
    };
  }

  function osInstallResizeBehavior(){
    var handler=function(){
      var view=window.JOBSystemsCurrentView||(typeof currentView!=='undefined'?currentView:'dashboard');
      osUpdateMobileChrome(view);
      if(window.innerWidth<768&&view==='calendar'&&typeof setCalView==='function'){
        var selected=localStorage.getItem('j-os-mobile-cal-agenda-v1');
        if(!selected){
          try{setCalView('agenda');localStorage.setItem('j-os-mobile-cal-agenda-v1','1');}catch(e){}
        }
      }
    };
    window.addEventListener('resize',handler,{passive:true});
    handler();
  }

  function osApplyReviewCopy(){
    var title=document.querySelector('#view-review .review-page-header h1');
    if(title)title.textContent='Reviews';
    var p=document.querySelector('#view-review .review-page-header p');
    if(p)p.textContent='Reflect, adjust, and move forward.';
    var financeTitle=document.querySelector('#view-finances .mobile-finance-header h1');
    if(financeTitle)financeTitle.textContent='Finance';
    var financeP=document.querySelector('#view-finances .mobile-finance-header p');
    if(financeP)financeP.textContent='Know where your money is going.';
  }

  function osInit(){
    osMigrateWorkspacePresentation();
    osInstallBrand();
    osEnsureViews();
    osInstallSidebar();
    osInstallTopbar();
    osInstallTodayQuickActions();
    osInstallMobileChrome();
    osInstallMorePrimary();
    osApplyReviewCopy();
    osPatchSetView();
    osInstallResizeBehavior();

    window.osAskJelixGlobal=osAskJelix;
    window.osSetKnowledgeFilter=osSetKnowledgeFilter;
    window.osSetKnowledgeQuery=osSetKnowledgeQuery;
    window.renderJOBSystemsProjects=osRenderProjects;
    window.renderJOBSystemsKnowledge=osRenderKnowledge;
    window.renderJOBSystemsFinance=osRenderFinance;

    var initial=typeof currentView!=='undefined'?currentView:'dashboard';
    window.JOBSystemsCurrentView=initial;
    osUpdateMobileChrome(initial);
    osNormalizeWorkspaceNav();
    if(initial==='projects')osRenderProjects();
    if(initial==='knowledge')osRenderKnowledge();
    if(initial==='finances')osRenderFinance();

    document.addEventListener('click',function(e){
      if(e.target.closest('#navWorldsList'))setTimeout(osNormalizeWorkspaceNav,0);
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',osInit,{once:true});
  else osInit();
})();