(function(){
  'use strict';

  var originalRenderFaith=window.renderFaith;
  var originalRenderOfficers=window.renderOfficers;
  var originalRenderFaithTopics=window.renderFaithTopics;
  var faithDragId=null;

  function byId(id){return document.getElementById(id);}
  function text(id,value){var el=byId(id);if(el)el.textContent=value;}
  function esc(value){
    return String(value==null?'':value).replace(/[&<>'"]/g,function(char){
      return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char];
    });
  }
  function todayString(){return typeof localDateStr==='function'?localDateStr(new Date()):new Date().toISOString().slice(0,10);}
  function dateObject(value){return value?new Date(value+'T12:00:00'):null;}
  function shortDate(value){
    var date=dateObject(value);if(!date||Number.isNaN(date.getTime()))return 'No date';
    return date.toLocaleDateString('en-PH',{month:'short',day:'numeric'});
  }
  function weekdayDate(value){
    var date=dateObject(value);if(!date||Number.isNaN(date.getTime()))return 'Not scheduled';
    return date.toLocaleDateString('en-PH',{weekday:'short',month:'short',day:'numeric'});
  }
  function emptyState(icon,title,copy){
    return '<div class="agency-empty"><i class="ti '+icon+'"></i><strong>'+esc(title)+'</strong><span>'+esc(copy)+'</span></div>';
  }
  function faithActivities(){return Array.isArray(DB.faith)?DB.faith:[];}
  function faithOfficers(){return Array.isArray(DB.officers)?DB.officers:[];}
  function faithTopics(){return Array.isArray(DB.faithTopics)?DB.faithTopics:[];}
  function faithTasks(){return (DB.tasks||[]).filter(function(task){return String(task.world||'').toUpperCase()==='FAITH';});}
  function faithEvents(){
    return (DB.calEvents||[]).filter(function(event){
      var type=typeof normaliseType==='function'?normaliseType(event.type):String(event.type||'').toLowerCase();
      return type==='fth'||String(event.title||'').toLowerCase().indexOf('faith:')===0;
    });
  }
  function stageFor(activity){
    var status=String(activity.status||'Pending').toLowerCase();
    if(status==='submitted')return 'Submitted';
    if(status==='approved')return 'Approved';
    if(status==='in preparation'||status==='in progress')return 'In preparation';
    if(status==='done'||status==='completed')return 'Completed';
    return 'Proposed';
  }
  function statusForStage(stage){
    return {Proposed:'Pending',Submitted:'Submitted',Approved:'Approved','In preparation':'In Preparation',Completed:'Done'}[stage]||'Pending';
  }
  function progressForStage(stage){return {Proposed:12,Submitted:32,Approved:52,'In preparation':74,Completed:100}[stage]||12;}

  window.handleFaithDragStart=function(event,id){
    faithDragId=id;
    event.dataTransfer.effectAllowed='move';
    event.currentTarget.style.opacity='.42';
  };
  window.handleFaithDragEnd=function(event){event.currentTarget.style.opacity='1';faithDragId=null;};
  window.handleFaithDrop=function(event,stage){
    event.preventDefault();
    event.currentTarget.classList.remove('is-dragover');
    if(faithDragId==null)return;
    var activity=faithActivities().find(function(item){return String(item.id)===String(faithDragId);});
    if(activity){
      activity.status=statusForStage(stage);
      save('faith');
      if(typeof SB!=='undefined'&&typeof SB.update==='function')SB.update('faith',activity.id,activity,'faith');
      renderFaithCommandCenter();
      if(typeof showToast==='function')showToast('✓ Moved to '+stage);
    }
    faithDragId=null;
  };

  function renderPipeline(){
    var mount=byId('faithActivityPipeline');if(!mount)return;
    var stages=['Proposed','Submitted','Approved','In preparation','Completed'];
    mount.innerHTML=stages.map(function(stage){
      var items=faithActivities().filter(function(activity){return stageFor(activity)===stage;});
      var cards=items.length?items.slice(0,3).map(function(activity){
        var meta=[activity.date?shortDate(activity.date):'No date',activity.assigned||activity.group||'Unassigned'].join(' · ');
        return '<button class="agency-pipeline-item" draggable="true" ondragstart="handleFaithDragStart(event,'+JSON.stringify(activity.id)+')" ondragend="handleFaithDragEnd(event)" onclick="openFaithModal('+JSON.stringify(activity.id)+')"><strong>'+esc(activity.activity||'Untitled activity')+'</strong><small>'+esc(activity.group||'Buklod')+'</small><span class="faith-pipeline-meta"><i class="ti ti-calendar"></i>'+esc(meta)+'</span><span class="faith-pipeline-progress"><i style="width:'+progressForStage(stage)+'%"></i></span><span class="faith-pipeline-item-status">'+esc(activity.status||'Pending')+'</span><i class="ti ti-dots"></i></button>';
      }).join(''):'<div class="agency-pipeline-empty">No activities</div>';
      var more=items.length>3?'<button class="agency-pipeline-add" onclick="setFaithTab(\'register\')">+'+(items.length-3)+' more</button>':'<button class="agency-pipeline-add" onclick="openFaithModal()"><i class="ti ti-plus"></i>Add activity</button>';
      return '<div class="agency-pipeline-column" data-stage="'+esc(stage)+'" ondragover="event.preventDefault();this.classList.add(\'is-dragover\')" ondragleave="this.classList.remove(\'is-dragover\')" ondrop="handleFaithDrop(event,\''+esc(stage)+'\')"><div class="agency-pipeline-column-head"><span>'+esc(stage)+'</span><b>'+items.length+'</b></div><div class="agency-pipeline-column-body">'+cards+more+'</div></div>';
    }).join('');
  }

  function attentionData(){
    var today=todayString();
    var activities=faithActivities();
    var officers=faithOfficers();
    var tasks=faithTasks();
    var approvals=activities.filter(function(item){return item.status==='Submitted'||item.status==='Pending';});
    var followups=officers.filter(function(officer){return !officer.contact||!officer.purok||!officer.committee;});
    var blocked=tasks.filter(function(task){return task.status==='Blocked'||task.status==='No Progress'||(task.due&&task.due<today&&task.status!=='Done');});
    var rows=[];
    activities.filter(function(item){return (item.status==='Submitted'||item.status==='Pending')&&!item.cfo;}).forEach(function(item){rows.push({icon:'ti-file-alert',title:'CFO approval missing',sub:item.activity,label:'Approval',action:'openFaithModal('+JSON.stringify(item.id)+')'});});
    activities.filter(function(item){return item.status!=='Done'&&!item.aevm;}).forEach(function(item){rows.push({icon:'ti-file-info',title:'AEVM details incomplete',sub:item.activity,label:'Details',action:'openFaithModal('+JSON.stringify(item.id)+')'});});
    followups.forEach(function(officer){rows.push({icon:'ti-user-exclamation',title:'Officer details need follow-up',sub:officer.name,label:'Follow up',action:'openOfficerModal('+JSON.stringify(officer.id)+')'});});
    blocked.forEach(function(task){rows.push({icon:'ti-alert-triangle',title:task.title,sub:task.due&&task.due<today?'Overdue '+shortDate(task.due):(task.status||'Needs attention'),label:'Urgent',critical:true,action:'editTask('+JSON.stringify(task.id)+')'});});
    return {approvals:approvals.length,followups:followups.length,blocked:blocked.length,rows:rows};
  }

  function renderAttention(){
    var mount=byId('faithAttentionQueue');if(!mount)return;
    var data=attentionData();
    mount.innerHTML=data.rows.length?data.rows.slice(0,5).map(function(row){
      return '<button class="agency-health-row" onclick="'+row.action+'"><i class="ti '+row.icon+'"></i><span><strong>'+esc(row.title)+'</strong><small>'+esc(row.sub)+'</small></span><em class="'+(row.critical?'is-critical':'')+'">'+esc(row.label)+'</em></button>';
    }).join(''):emptyState('ti-circle-check','Everything is clear','Approvals and follow-ups are up to date.');
    text('faithQueueApproval',data.approvals);
    text('faithQueueFollowup',data.followups);
    text('faithQueueBlocked',data.blocked);
    text('faithQueueTotal',data.approvals+data.followups+data.blocked);
  }

  function renderMetrics(){
    var activities=faithActivities();
    var officers=faithOfficers();
    var today=todayString();
    var now=dateObject(today);
    var quarter=Math.floor(now.getMonth()/3);
    var quarterItems=activities.filter(function(item){
      var date=dateObject(item.date);return date&&date.getFullYear()===now.getFullYear()&&Math.floor(date.getMonth()/3)===quarter;
    });
    var upcoming=activities.filter(function(item){return item.date&&item.date>=today&&item.status!=='Done';}).length;
    var pending=activities.filter(function(item){return item.status==='Pending'||item.status==='Submitted';}).length;
    var followups=officers.filter(function(officer){return !officer.contact||!officer.purok||!officer.committee;}).length;
    var meetingEvents=faithEvents().filter(function(event){return event.date&&event.date>=today&&/(meeting|huddle|officer|caucus|panata)/i.test(event.title||'');}).sort(function(a,b){return a.date.localeCompare(b.date)||(a.time||'').localeCompare(b.time||'');});
    var next=meetingEvents[0];
    text('faithTotal',quarterItems.length||activities.length);
    text('faithUpcomingLabel',upcoming+' upcoming');
    text('faithPending',pending);
    text('faithPendingLabel',pending?pending+' waiting for action':'Nothing waiting');
    text('faithSubmitted',followups);
    text('faithOfficerLabel',followups?followups+' profiles incomplete':'Registry is current');
    text('faithApproved',next?weekdayDate(next.date):'—');
    text('faithNextMeetingLabel',next?(next.time||String(next.title||'').replace(/^Faith:\s*/i,'')):'No meeting scheduled');
  }

  function renderCalendarPreview(){
    var mount=byId('faithAgendaPreview');if(!mount)return;
    var today=todayString();
    var events=faithEvents().filter(function(event){return event.date&&event.date>=today;}).sort(function(a,b){return a.date.localeCompare(b.date)||(a.time||'').localeCompare(b.time||'');}).slice(0,4);
    mount.innerHTML=events.length?events.map(function(event,index){
      return '<button class="faith-preview-row" onclick="setFaithTab(\'calendar\')"><i class="ti ti-calendar-event"></i><span><strong>'+esc(String(event.title||'Faith activity').replace(/^Faith:\s*/i,''))+'</strong><small>'+esc(weekdayDate(event.date))+'</small></span><em>'+esc(event.time||'All day')+'</em></button>';
    }).join(''):emptyState('ti-calendar-off','No upcoming dates','Faith events will appear here.');
  }

  function renderOfficerPreview(){
    var mount=byId('faithOfficerPreview');if(!mount)return;
    var officers=faithOfficers().slice(0,3);
    mount.innerHTML=officers.length?officers.map(function(officer,index){
      var complete=!!(officer.contact&&officer.purok&&officer.committee);
      return '<button class="faith-preview-row" onclick="openOfficerModal('+JSON.stringify(officer.id)+')"><i class="faith-avatar '+(index%2?'alt':'')+'">'+esc((officer.name||'?').charAt(0).toUpperCase())+'</i><span><strong>'+esc(officer.name||'Unnamed officer')+'</strong><small>'+esc(officer.duty||officer.committee||'Buklod officer')+'</small></span><em>'+esc(complete?'On track':'Follow up')+'</em></button>';
    }).join(''):emptyState('ti-users-plus','No officers yet','Add the Buklod officer registry.');
  }

  function renderMeetingPreview(){
    var mount=byId('faithMeetingPreview');if(!mount)return;
    var open=faithTasks().filter(function(task){return task.status!=='Done';}).sort(function(a,b){return (a.due||'9999').localeCompare(b.due||'9999');}).slice(0,4);
    mount.innerHTML=open.length?open.map(function(task){
      return '<button class="faith-preview-row" onclick="editTask('+JSON.stringify(task.id)+')"><i class="ti ti-checkbox"></i><span><strong>'+esc(task.title||'Faith action')+'</strong><small>'+esc(task.status||'Todo')+'</small></span><em>'+esc(task.due?shortDate(task.due):'Open')+'</em></button>';
    }).join(''):emptyState('ti-microphone','No open actions','Meeting action items will appear here.');
  }

  function renderTopicPreview(){
    var mount=byId('faithTopicPreview');if(!mount)return;
    var topics=faithTopics().slice(0,3);
    mount.innerHTML=topics.length?topics.map(function(topic,index){
      return '<button class="faith-preview-row" onclick="openTopicModal('+JSON.stringify(topic.id)+')"><i class="ti '+(topic.type==='upload'?'ti-file-description':'ti-book-2')+'"></i><span><strong>'+esc(topic.title||'Untitled topic')+'</strong><small>'+esc(topic.category||'Seminar topic')+'</small></span><em>'+esc(index===0?'Ready':'Outline')+'</em></button>';
    }).join(''):emptyState('ti-book-off','No topics yet','Prepare your first seminar topic.');
  }

  function renderPNKPreview(){
    var mount=byId('faithPNKPreview');if(!mount)return;
    var today=todayString();
    var currentYear=dateObject(today).getFullYear();
    var activities=faithActivities().filter(function(activity){
      var matchesPNK=/pnk/i.test(activity.group||'')||/pnk/i.test(activity.activity||'');
      var date=dateObject(activity.date);
      return matchesPNK&&(!date||date.getFullYear()===currentYear);
    }).sort(function(a,b){return (a.date||'9999').localeCompare(b.date||'9999');});
    var completed=activities.filter(function(activity){return stageFor(activity)==='Completed';}).length;
    var upcoming=activities.filter(function(activity){return activity.date&&activity.date>=today&&stageFor(activity)!=='Completed';});
    var next=upcoming[0];
    var progress=activities.length?Math.round((completed/activities.length)*100):0;
    if(!activities.length){
      mount.innerHTML='<button class="faith-pnk-empty" onclick="openPNKActivity()"><i class="ti ti-calendar-plus"></i><strong>Build the '+currentYear+' PNK activity plan</strong><span>Add activities, dates, owners, and progress for the entire year.</span></button>';
      return;
    }
    mount.innerHTML='<div class="faith-pnk-year-summary"><div class="faith-pnk-year-head"><span>'+currentYear+' activity plan</span><strong>'+activities.length+' planned</strong></div><div class="faith-pnk-stats"><span><b>'+completed+'</b>Completed</span><span><b>'+upcoming.length+'</b>Upcoming</span></div><button class="faith-pnk-next" '+(next?'onclick="openFaithModal('+JSON.stringify(next.id)+')"':'onclick="openPNKActivity()"')+'><i class="ti '+(next?'ti-calendar-event':'ti-calendar-plus')+'"></i><span><small>'+(next?'Next activity':'Plan another activity')+'</small><strong>'+esc(next?next.activity:'Add to the annual plan')+'</strong></span><em>'+esc(next?shortDate(next.date):'Add')+'</em></button><div class="faith-pnk-progress"><span><i style="width:'+progress+'%"></i></span><b>'+progress+'% complete</b></div></div>';
  }

  window.openPNKActivity=function(){
    openFaithModal();
    var group=byId('fa-group');if(group)group.value='PNK';
  };

  function renderOverview(){
    if(!byId('faith-overview'))return;
    renderMetrics();
    renderPipeline();
    renderAttention();
    renderCalendarPreview();
    renderOfficerPreview();
    renderMeetingPreview();
    renderTopicPreview();
    renderPNKPreview();
  }

  function renderFaithCommandCenter(){
    if(typeof originalRenderFaith==='function'){
      try{originalRenderFaith();}catch(error){console.warn('Legacy Faith register render skipped',error);}
    }else if(typeof renderDomainTimerCard==='function')renderDomainTimerCard('faith');
    renderOverview();
  }

  window.renderFaith=renderFaithCommandCenter;
  window.renderFaithCommandCenter=renderFaithCommandCenter;

  window.renderOfficers=function(){
    if(typeof originalRenderOfficers==='function')originalRenderOfficers();
    renderOfficerPreview();renderAttention();renderMetrics();
  };
  window.renderFaithTopics=function(){
    if(typeof originalRenderFaithTopics==='function')originalRenderFaithTopics();
    renderTopicPreview();renderPNKPreview();
  };

  window.setFaithTab=function(tab){
    if(tab==='activities')tab='overview';
    var panels=['overview','register','officers','topics','meetings','calendar'];
    panels.forEach(function(name){var panel=byId('faith-'+name);if(panel)panel.hidden=name!==tab;});
    var button=byId('faithAddBtn');
    if(button){
      button.style.display='';
      if(tab==='officers'){button.innerHTML='<i class="ti ti-plus"></i><span>New officer</span>';button.onclick=function(){openOfficerModal();};}
      else if(tab==='topics'){button.innerHTML='<i class="ti ti-plus"></i><span>New topic</span>';button.onclick=function(){openTopicModal();};}
      else if(tab==='meetings'){button.innerHTML='<i class="ti ti-microphone"></i><span>Record meeting</span>';button.onclick=function(){var recorder=document.querySelector('#meetingsPanel-FAITH [id^="meetRecBtn-"]');if(recorder)recorder.click();};}
      else if(tab==='calendar'){button.innerHTML='<i class="ti ti-external-link"></i><span>Full calendar</span>';button.onclick=function(){setView('calendar');};}
      else{button.innerHTML='<i class="ti ti-plus"></i><span>New activity</span>';button.onclick=function(){openFaithModal();};}
    }
    if(tab==='overview')renderFaithCommandCenter();
    if(tab==='register'&&typeof originalRenderFaith==='function')originalRenderFaith();
    if(tab==='officers')window.renderOfficers();
    if(tab==='topics')window.renderFaithTopics();
    if(tab==='meetings'&&typeof renderMeetingsPanel==='function')renderMeetingsPanel('meetingsPanel-FAITH','FAITH');
    if(tab==='calendar'){faithCalOffset=0;renderFaithCalendar();}
    var scroller=document.querySelector('#view-faith .agency-scroll');if(scroller)scroller.scrollTo({top:0,behavior:'smooth'});
  };

  window.toggleFaithMenu=function(event){
    event.stopPropagation();
    var menu=byId('faithActionMenu');if(!menu)return;
    var open=menu.classList.toggle('is-open');
    event.currentTarget.setAttribute('aria-expanded',String(open));
  };
  window.closeFaithMenu=function(){
    var menu=byId('faithActionMenu');if(menu)menu.classList.remove('is-open');
    var button=document.querySelector('#view-faith .agency-menu-wrap>[aria-expanded]');if(button)button.setAttribute('aria-expanded','false');
  };
  document.addEventListener('click',function(event){if(!event.target.closest('#view-faith .agency-menu-wrap'))window.closeFaithMenu();});
  document.addEventListener('keydown',function(event){if(event.key==='Escape')window.closeFaithMenu();});

  if(byId('view-faith'))renderFaithCommandCenter();
})();
