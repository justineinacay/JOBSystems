(function(){
  'use strict';

  function safe(value){
    if(typeof escapeHtml==='function')return escapeHtml(String(value==null?'':value));
    return String(value==null?'':value).replace(/[&<>"']/g,function(char){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];
    });
  }
  function setText(id,value){
    var element=document.getElementById(id);
    if(element)element.textContent=value;
  }
  function taskDate(value){
    return value&&typeof formatTaskTableDate==='function'?formatTaskTableDate(value):(value||'—');
  }
  function todayString(){
    return typeof localDateStr==='function'?localDateStr(new Date()):new Date().toISOString().slice(0,10);
  }
  function emptyState(icon,title,copy){
    return '<div class="agency-empty"><i class="ti '+icon+'"></i><strong>'+safe(title)+'</strong><span>'+safe(copy)+'</span></div>';
  }

  window.toggleAgencyMenu=function(event,id){
    if(event)event.stopPropagation();
    var menu=document.getElementById(id);
    if(!menu)return;
    var open=menu.classList.toggle('is-open');
    if(menu.previousElementSibling)menu.previousElementSibling.setAttribute('aria-expanded',String(open));
    if(!window._agencyMenuOutsideBound){
      document.addEventListener('click',function(clickEvent){
        if(!clickEvent.target.closest('.agency-menu-wrap'))window.closeAgencyMenus();
      });
      window._agencyMenuOutsideBound=true;
    }
  };
  window.closeAgencyMenus=function(){
    document.querySelectorAll('.agency-action-menu.is-open').forEach(function(menu){
      menu.classList.remove('is-open');
      if(menu.previousElementSibling)menu.previousElementSibling.setAttribute('aria-expanded','false');
    });
  };

  window.normalizeCodeStage=function(stage){
    var legacy={Lead:'Inquiry',Active:'Build',Testing:'QA / Launch'};
    return legacy[stage]||stage||'Inquiry';
  };

  function codeStages(includeDelivered){
    var stages=['Inquiry','Discovery','Proposal','Build','QA / Launch'];
    if(includeDelivered)stages.push('Delivered');
    return stages;
  }

  function renderCodePipelineInto(containerId,includeDelivered){
    var board=document.getElementById(containerId);
    if(!board)return;
    var projects=DB.pipeline||[];
    board.innerHTML=codeStages(includeDelivered).map(function(stage){
      var stageItems=projects.filter(function(project){return window.normalizeCodeStage(project.stage)===stage;});
      var cards=stageItems.length?stageItems.map(function(project){
        var deadline=project.deadline?'<time>'+safe(taskDate(project.deadline))+'</time>':'';
        return '<button class="agency-pipeline-item" draggable="true" ondragstart="handleCodePipelineDragStart(event,'+project.id+')" ondragend="this.style.opacity=\'1\'" onclick="openPipelineModal('+project.id+')">'+
          '<strong>'+safe(project.name)+'</strong><small>'+safe(project.client||project.tech||'Client project')+'</small>'+deadline+'<i class="ti ti-dots"></i></button>';
      }).join(''):'<div class="agency-pipeline-empty">No projects</div>';
      return '<div class="agency-pipeline-column stage-'+stage.toLowerCase().replace(/[^a-z]+/g,'-')+'" data-stage="'+safe(stage)+'" ondragover="event.preventDefault();this.classList.add(\'is-dragover\')" ondragleave="this.classList.remove(\'is-dragover\')" ondrop="this.classList.remove(\'is-dragover\');handleCodePipelineDrop(event,\''+safe(stage)+'\')">'+
        '<div class="agency-pipeline-column-head"><span>'+safe(stage)+'</span><b>'+stageItems.length+'</b></div>'+
        '<div class="agency-pipeline-column-body">'+cards+'<button class="agency-pipeline-add" onclick="openPipelineModal()"><i class="ti ti-plus"></i>Add project</button></div></div>';
    }).join('');
  }

  function renderCodeCommandCenter(){
    if(!document.getElementById('codeOverviewPipeline'))return;
    var apps=DB.buildApps||[];
    var projects=DB.pipeline||[];
    var tasks=(DB.tasks||[]).filter(function(task){return task.world==='BUILD'||task.world==='build';});
    var openTasks=tasks.filter(function(task){return task.status!=='Done';});
    var today=todayString();
    var activeProjects=projects.filter(function(project){return window.normalizeCodeStage(project.stage)!=='Delivered';});
    var pipelineValue=activeProjects.reduce(function(sum,project){return sum+(Number(project.budget)||0);},0);
    var buildsInProgress=apps.filter(function(app){return app.status==='In Dev'||app.status==='Beta';}).length+
      projects.filter(function(project){return ['Build','QA / Launch'].indexOf(window.normalizeCodeStage(project.stage))>=0;}).length;
    var launchCandidates=projects.filter(function(project){return ['Build','QA / Launch'].indexOf(window.normalizeCodeStage(project.stage))>=0;});
    var launchReady=launchCandidates.length?Math.round(launchCandidates.filter(function(project){return window.normalizeCodeStage(project.stage)==='QA / Launch';}).length/launchCandidates.length*100):0;

    setText('codePipelineValue','₱'+pipelineValue.toLocaleString('en-PH'));
    setText('codePipelineLabel',projects.filter(function(project){return window.normalizeCodeStage(project.stage)==='Proposal';}).length+' proposals · '+projects.filter(function(project){return window.normalizeCodeStage(project.stage)==='Discovery';}).length+' in discovery');
    setText('codeActiveProjects',activeProjects.length);
    setText('codeBuildsInProgress',buildsInProgress);
    setText('codeLaunchReadiness',launchReady+'%');
    setText('codeLaunchLabel',launchCandidates.length?launchCandidates.length+' builds approaching launch':'No builds queued');
    renderCodePipelineInto('codeOverviewPipeline',false);

    var risks=openTasks.filter(function(task){
      return (task.due&&task.due<today)||task.priority==='High'||task.status==='No Progress';
    }).sort(function(a,b){return (a.due||'9999').localeCompare(b.due||'9999');});
    var health=document.getElementById('codeDeliveryHealth');
    if(health){
      health.innerHTML=risks.length?risks.slice(0,4).map(function(task){
        var critical=task.due&&task.due<today;
        return '<button class="agency-health-row" onclick="editTask('+task.id+')"><i class="ti '+(critical?'ti-alert-circle':'ti-alert-triangle')+'"></i><span><strong>'+safe(task.title)+'</strong><small>'+safe(task.client||task.status||'Build task')+'</small></span><em class="'+(critical?'is-critical':'is-warning')+'">'+(critical?'Overdue':safe(task.priority||'Risk'))+'</em></button>';
      }).join(''):emptyState('ti-shield-check','Delivery is on track','No critical blockers detected.');
    }

    var activeBuilds=document.getElementById('codeActiveBuilds');
    if(activeBuilds){
      var buildRows=apps.filter(function(app){return app.status!=='Paused';}).slice(0,4);
      activeBuilds.innerHTML=buildRows.length?buildRows.map(function(app){
        var related=tasks.filter(function(task){return task.client===app.name||(task.title||'').indexOf(app.name)>=0;});
        var done=related.filter(function(task){return task.status==='Done';}).length;
        var percent=related.length?Math.round(done/related.length*100):0;
        var next=related.find(function(task){return task.status!=='Done';});
        return '<button class="agency-progress-row" onclick="openAppModal('+app.id+')"><span><strong>'+safe(app.name)+'</strong><small>'+safe(next?next.title:(app.status||'No next milestone'))+'</small></span><b>'+percent+'%</b><i><em style="width:'+percent+'%"></em></i></button>';
      }).join(''):emptyState('ti-app-window','No active builds','Add your first app or client project.');
    }

    var roadmap=document.getElementById('codeRoadmap');
    if(roadmap){
      var roadmapItems=activeProjects.slice().sort(function(a,b){return (a.deadline||'9999').localeCompare(b.deadline||'9999');}).slice(0,4);
      roadmap.innerHTML=roadmapItems.length?'<div class="agency-timeline">'+roadmapItems.map(function(project){
        return '<button onclick="openPipelineModal('+project.id+')"><i></i><span><small>'+safe(project.deadline?taskDate(project.deadline):window.normalizeCodeStage(project.stage))+'</small><strong>'+safe(project.name)+'</strong></span></button>';
      }).join('')+'</div>':emptyState('ti-route','No roadmap items','Pipeline milestones will appear here.');
    }

    var capacity=document.getElementById('codeCapacity');
    if(capacity){
      var total=20;
      var allocated=Math.min(total,openTasks.length*2);
      var available=total-allocated;
      var percent=Math.round(available/total*100);
      capacity.innerHTML='<div class="agency-capacity"><div class="agency-capacity-ring" style="--capacity:'+percent+'"><span>'+percent+'%<small>available</small></span></div><dl><div><dt>Total capacity</dt><dd>'+total+'</dd></div><div><dt>Allocated</dt><dd>'+allocated+'</dd></div><div><dt>Available</dt><dd>'+available+'</dd></div></dl></div>';
    }

    var talent=document.getElementById('codeTalentNeeds');
    if(talent){
      talent.innerHTML='<div class="agency-connection"><strong>Recruit through Job Collectives</strong><span>Access pre-vetted technical talent.</span></div><div class="agency-role-list"><span><b>Frontend Developer</b><em>High</em></span><span><b>Automation Specialist</b><em>Medium</em></span><span><b>Backend Developer</b><em>Medium</em></span></div>';
    }

    var actions=document.getElementById('codeNextActions');
    if(actions){
      var nextActions=openTasks.slice().sort(function(a,b){return (a.due||'9999').localeCompare(b.due||'9999');}).slice(0,5);
      actions.innerHTML=nextActions.length?nextActions.map(function(task){
        return '<button class="agency-action-row" onclick="editTask('+task.id+')"><span><strong>'+safe(task.title)+'</strong><small>'+safe(task.client||'Code Collectives')+'</small></span><time class="'+(task.due&&task.due<today?'is-overdue':'')+'">'+safe(task.due?taskDate(task.due):'—')+'</time></button>';
      }).join(''):emptyState('ti-circle-check','No open tasks','Everything is complete.');
    }
  }

  window.renderBuildStats=renderCodeCommandCenter;
  window.renderPipeline=function(){renderCodePipelineInto('pipelineBoard',true);};
  window.setBCTab=function(tab){
    var panels={overview:'bc-overview',tracker:'bc-tracker',pipeline:'bc-pipeline',calendar:'bc-calendar'};
    Object.keys(panels).forEach(function(key){
      var panel=document.getElementById(panels[key]);
      if(panel)panel.hidden=key!==tab;
    });
    if(tab==='pipeline')window.renderPipeline();
    else if(tab==='calendar')renderDomainCalendar('bld','buildCalGrid','buildCalLabel','bld','#53c9a8','var(--green)');
    else renderBuild();
    var scroller=document.querySelector('#view-build .agency-scroll');
    if(scroller)scroller.scrollTo({top:0,behavior:'smooth'});
  };

  window.normalizeCreativeStatus=function(status){
    var legacy={Planning:'Brief','In Progress':'Production',Review:'Client Review'};
    return legacy[status]||status||'Brief';
  };

  var creativePipelineDragId=null;
  window.handleCreativePipelineDragStart=function(event,id){
    creativePipelineDragId=id;
    event.dataTransfer.effectAllowed='move';
    event.target.style.opacity='.4';
  };
  window.handleCreativePipelineDrop=function(event,status){
    event.preventDefault();
    event.currentTarget.classList.remove('is-dragover');
    if(creativePipelineDragId==null)return;
    var project=(DB.creativeProjects||[]).find(function(item){return item.id===creativePipelineDragId;});
    if(project){
      project.status=status;
      save('creativeProjects');
      SB.update('creative_projects',project.id,project,'creativeProjects');
      renderCreativeCommandCenter();
      showToast('✓ Moved to '+status);
    }
    creativePipelineDragId=null;
  };

  function renderCreativeCommandCenter(){
    if(!document.getElementById('creativeOverviewPipeline'))return;
    var projects=DB.creativeProjects||[];
    var collateral=DB.collateral||[];
    var campaigns=DB.campaigns||[];
    var social=DB.socialPosts||[];
    var tasks=(DB.tasks||[]).filter(function(task){return task.world==='SIDES'||task.world==='sides';});
    var openTasks=tasks.filter(function(task){return task.status!=='Done';});
    var today=todayString();
    var activeProjects=projects.filter(function(project){return window.normalizeCreativeStatus(project.status)!=='Delivered';});
    var pipelineValue=activeProjects.reduce(function(sum,project){return sum+(Number(project.budget)||0);},0);
    var clientNames={};
    projects.concat(collateral,campaigns).forEach(function(item){if(item.client)clientNames[item.client]=true;});
    var reviewCount=projects.filter(function(project){return window.normalizeCreativeStatus(project.status)==='Client Review';}).length+
      collateral.filter(function(item){return item.status==='In Review';}).length;
    var liveCampaigns=campaigns.filter(function(campaign){return campaign.status==='Active';}).length;

    setText('creativePipelineValue','₱'+pipelineValue.toLocaleString('en-PH'));
    setText('creativePipelineLabel',projects.filter(function(project){return window.normalizeCreativeStatus(project.status)==='Concept';}).length+' concepts · '+projects.filter(function(project){return window.normalizeCreativeStatus(project.status)==='Client Review';}).length+' in review');
    setText('creativeActiveClients',Object.keys(clientNames).length);
    setText('creativeInReview',reviewCount);
    setText('creativeCampaignsLive',liveCampaigns);

    var pipeline=document.getElementById('creativeOverviewPipeline');
    if(pipeline){
      var stages=['Brief','Concept','Production','Client Review','Delivered'];
      pipeline.innerHTML=stages.map(function(stage){
        var stageItems=projects.filter(function(project){return window.normalizeCreativeStatus(project.status)===stage;});
        var cards=stageItems.length?stageItems.map(function(project){
          var deadline=project.deadline?'<time>'+safe(taskDate(project.deadline))+'</time>':'';
          return '<button class="agency-pipeline-item" draggable="true" ondragstart="handleCreativePipelineDragStart(event,'+project.id+')" ondragend="this.style.opacity=\'1\'" onclick="openCreativeProjectModal('+project.id+')"><strong>'+safe(project.name)+'</strong><small>'+safe(project.client||'Client project')+'</small>'+deadline+'<i class="ti ti-dots"></i></button>';
        }).join(''):'<div class="agency-pipeline-empty">No projects</div>';
        return '<div class="agency-pipeline-column stage-'+stage.toLowerCase().replace(/[^a-z]+/g,'-')+'" data-stage="'+safe(stage)+'" ondragover="event.preventDefault();this.classList.add(\'is-dragover\')" ondragleave="this.classList.remove(\'is-dragover\')" ondrop="handleCreativePipelineDrop(event,\''+safe(stage)+'\')"><div class="agency-pipeline-column-head"><span>'+safe(stage)+'</span><b>'+stageItems.length+'</b></div><div class="agency-pipeline-column-body">'+cards+'<button class="agency-pipeline-add" onclick="openCreativeProjectModal()"><i class="ti ti-plus"></i>Add project</button></div></div>';
      }).join('');
    }

    var approval=document.getElementById('creativeApprovalQueue');
    if(approval){
      var rows=[];
      projects.filter(function(project){return window.normalizeCreativeStatus(project.status)==='Client Review';}).forEach(function(project){
        rows.push({type:'project',id:project.id,title:project.name,sub:project.client||'Client feedback',label:'Review'});
      });
      collateral.filter(function(item){return item.status==='In Review';}).forEach(function(item){
        rows.push({type:'collateral',id:item.id,title:item.name,sub:item.client||item.type,label:'Review'});
      });
      projects.filter(function(project){return project.deadline&&project.deadline<today&&window.normalizeCreativeStatus(project.status)!=='Delivered';}).forEach(function(project){
        rows.push({type:'project',id:project.id,title:project.name,sub:'Deadline '+taskDate(project.deadline),label:'Overdue',critical:true});
      });
      approval.innerHTML=rows.length?rows.slice(0,5).map(function(row){
        var action=row.type==='project'?'openCreativeProjectModal':'openCollateralModal';
        return '<button class="agency-health-row" onclick="'+action+'('+row.id+')"><i class="ti '+(row.critical?'ti-alert-circle':'ti-message-circle')+'"></i><span><strong>'+safe(row.title)+'</strong><small>'+safe(row.sub)+'</small></span><em class="'+(row.critical?'is-critical':'is-warning')+'">'+safe(row.label)+'</em></button>';
      }).join(''):emptyState('ti-circle-check','Approvals are clear','No client feedback is waiting.');
    }

    var calendar=document.getElementById('creativeCampaignCalendar');
    if(calendar){
      var events=[];
      campaigns.forEach(function(item){events.push({date:item.startDate,title:item.name,type:'Campaign',id:item.id,action:'openCampaignModal'});});
      social.forEach(function(item){events.push({date:item.date,title:item.caption||item.client||'Social post',type:item.platform||'Social',id:item.id,action:'openSocialModal'});});
      events=events.filter(function(item){return item.date&&item.date>=today;}).sort(function(a,b){return a.date.localeCompare(b.date);}).slice(0,4);
      calendar.innerHTML=events.length?'<div class="agency-timeline">'+events.map(function(item){
        return '<button onclick="'+item.action+'('+item.id+')"><i></i><span><small>'+safe(taskDate(item.date))+' · '+safe(item.type)+'</small><strong>'+safe(item.title)+'</strong></span></button>';
      }).join('')+'</div>':emptyState('ti-calendar-off','No upcoming campaigns','Scheduled work will appear here.');
    }

    var active=document.getElementById('creativeActiveProjects');
    if(active){
      active.innerHTML=activeProjects.length?activeProjects.slice(0,5).map(function(project){
        var deliverables=project.deliverables||[];
        var stage=window.normalizeCreativeStatus(project.status);
        var percent=deliverables.length?Math.round(deliverables.filter(function(item){return item.done;}).length/deliverables.length*100):(stage==='Client Review'?80:(stage==='Production'?50:20));
        var next=deliverables.find(function(item){return !item.done;});
        return '<button class="agency-progress-row" onclick="openCreativeProjectModal('+project.id+')"><span><strong>'+safe(project.name)+'</strong><small>'+safe(next?next.text:stage)+'</small></span><b>'+percent+'%</b><i><em style="width:'+percent+'%"></em></i></button>';
      }).join(''):emptyState('ti-briefcase-off','No active projects','Add a client project to begin.');
    }

    var capacity=document.getElementById('creativeCapacity');
    if(capacity){
      var total=20;
      var allocated=Math.min(total,activeProjects.length*3+reviewCount);
      var available=total-allocated;
      var percent=Math.round(available/total*100);
      capacity.innerHTML='<div class="agency-capacity"><div class="agency-capacity-ring" style="--capacity:'+percent+'"><span>'+percent+'%<small>available</small></span></div><dl><div><dt>Total capacity</dt><dd>'+total+'</dd></div><div><dt>Allocated</dt><dd>'+allocated+'</dd></div><div><dt>Available</dt><dd>'+available+'</dd></div></dl></div>';
    }

    var talent=document.getElementById('creativeTalentNeeds');
    if(talent){
      talent.innerHTML='<div class="agency-connection"><strong>Recruit through Job Collectives</strong><span>Access pre-vetted creative talent.</span></div><div class="agency-role-list"><span><b>Graphic Designer</b><em>High</em></span><span><b>Copywriter</b><em>Medium</em></span><span><b>Video Editor</b><em>Medium</em></span></div>';
    }

    var actions=document.getElementById('creativeNextActions');
    if(actions){
      var actionRows=openTasks.map(function(task){return {type:'task',id:task.id,title:task.title,sub:task.client||'Creative Collectives',due:task.due};});
      activeProjects.filter(function(project){return project.deadline;}).forEach(function(project){
        actionRows.push({type:'project',id:project.id,title:'Advance '+project.name,sub:window.normalizeCreativeStatus(project.status),due:project.deadline});
      });
      actionRows.sort(function(a,b){return (a.due||'9999').localeCompare(b.due||'9999');});
      actions.innerHTML=actionRows.length?actionRows.slice(0,5).map(function(row){
        var action=row.type==='task'?'editTask':'openCreativeProjectModal';
        return '<button class="agency-action-row" onclick="'+action+'('+row.id+')"><span><strong>'+safe(row.title)+'</strong><small>'+safe(row.sub)+'</small></span><time class="'+(row.due&&row.due<today?'is-overdue':'')+'">'+safe(row.due?taskDate(row.due):'—')+'</time></button>';
      }).join(''):emptyState('ti-circle-check','No next actions','Your delivery queue is clear.');
    }
  }

  var originalRenderSides=window.renderSides;
  window.renderSides=function(){
    if(typeof originalRenderSides==='function')originalRenderSides();
    renderCreativeCommandCenter();
  };

  ['renderCreativeProjects','renderCollateral','renderSocialWorkflow','renderCampaigns'].forEach(function(name){
    var original=window[name];
    if(typeof original!=='function')return;
    window[name]=function(){
      var result=original.apply(this,arguments);
      renderCreativeCommandCenter();
      return result;
    };
  });

  window.setCCTab=function(tab){
    var panels={overview:'cc-overview',projects:'cc-projects',collateral:'cc-collateral',social:'cc-social',campaigns:'cc-campaigns',products:'cc-products',calendar:'cc-calendar'};
    Object.keys(panels).forEach(function(key){
      var panel=document.getElementById(panels[key]);
      if(panel)panel.hidden=key!==tab;
    });
    if(tab==='overview')renderCreativeCommandCenter();
    else if(tab==='collateral')renderCollateral();
    else if(tab==='projects')renderCreativeProjects();
    else if(tab==='social')renderSocialWorkflow();
    else if(tab==='campaigns')renderCampaigns();
    else if(tab==='calendar')renderDomainCalendar('sid','sidesCalGrid','sidesCalLabel','sid','#f3cc3f','var(--amber)');
    else window.renderSides();
    var scroller=document.querySelector('#view-sides .agency-scroll');
    if(scroller)scroller.scrollTo({top:0,behavior:'smooth'});
  };

  function refreshVisibleAgency(){
    if(document.getElementById('view-build')&&document.getElementById('view-build').classList.contains('active'))renderBuild();
    if(document.getElementById('view-sides')&&document.getElementById('view-sides').classList.contains('active'))window.renderSides();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refreshVisibleAgency);
  else refreshVisibleAgency();
})();
