// ═══════════════════════════════════════════════════════════════════════════
let _jelixPromptResolveFn=null;
function jelixPrompt(title,fields,okLabel){
  // fields: [{key, label, placeholder, default, type}] — type: 'text'|'date'|'number' (default 'text')
  return new Promise(resolve=>{
    _jelixPromptResolveFn=resolve;
    document.getElementById('jelixPromptTitle').textContent=title;
    document.getElementById('jelixPromptOkBtn').textContent=okLabel||'Add';
    const body=document.getElementById('jelixPromptFields');
    body.innerHTML=fields.map((f,i)=>`
      <div class="fg" style="margin:0">
        <label class="fl">${f.label}</label>
        <input id="jelixPromptField-${i}" type="${f.type||'text'}" placeholder="${f.placeholder||''}" value="${f.default||''}" ${f.type==='date'?'':''}>
      </div>
    `).join('');
    openModal('jelixPromptModal');
    setTimeout(()=>{const first=document.getElementById('jelixPromptField-0');if(first){first.focus();first.select?.();}},50);
    // Enter key on the last field submits
    const inputs=body.querySelectorAll('input');
    inputs.forEach((inp,i)=>{
      inp.onkeydown=(e)=>{
        if(e.key==='Enter'){
          e.preventDefault();
          if(i<inputs.length-1)inputs[i+1].focus();
          else _jelixPromptSubmit();
        }
      };
    });
  });
}
function _jelixPromptSubmit(){
  const inputs=[...document.querySelectorAll('#jelixPromptFields input')];
  const values=inputs.map(inp=>inp.value.trim());
  _jelixPromptResolve(values);
}
function _jelixPromptResolve(result){
  closeModal('jelixPromptModal');
  if(_jelixPromptResolveFn){_jelixPromptResolveFn(result);_jelixPromptResolveFn=null;}
}
let _jelixConfirmResolveFn=null;
function jelixConfirm(message,okLabel){
  return new Promise(resolve=>{
    _jelixConfirmResolveFn=resolve;
    document.getElementById('jelixConfirmMessage').textContent=message;
    document.getElementById('jelixConfirmOkBtn').textContent=okLabel||'Confirm';
    openModal('jelixConfirmModal');
  });
}
function _jelixConfirmResolve(result){
  closeModal('jelixConfirmModal');
  if(_jelixConfirmResolveFn){_jelixConfirmResolveFn(result);_jelixConfirmResolveFn=null;}
}
function openModal(id){
  if(id==='taskModal'&&typeof updateTaskClientDropdown==='function'){
    const wEl=document.getElementById('tf-world');
    if(wEl)updateTaskClientDropdown(wEl.value);
  }
  // Related-items section — centralized here rather than in every "+Task"
  // call site, since editingTaskId is reliably set (edit) or null (new) by
  // the time any of them calls openModal('taskModal').
  if(id==='taskModal'&&typeof renderRelatedSection==='function'){
    const rc=document.getElementById('tf-related');
    if(rc)rc.innerHTML=(editingTaskId!=null)?renderRelatedSection('task',editingTaskId):'<div style="font-size:var(--text-xs);color:var(--text3)">Save the task first, then come back to link related items.</div>';
    const tc=document.getElementById('tf-tags');
    if(tc)tc.innerHTML=(editingTaskId!=null)?renderTagsSection('task',editingTaskId):'<div style="font-size:var(--text-xs);color:var(--text3)">Save the task first, then come back to tag it.</div>';
    // New-task case only — editTask() already populated this correctly
    // (with the task's actual projectId) before calling openModal, and
    // this generic branch would otherwise stomp that with an empty pick.
    if(editingTaskId==null&&typeof refreshProjectSelect==='function'){
      const wEl=document.getElementById('tf-world');
      refreshProjectSelect('tf-project',wEl?wEl.value:'LIFE','');
    }
  }
  if(id==='calModal'&&typeof renderRelatedSection==='function'){
    const rc=document.getElementById('ce-related');
    if(rc)rc.innerHTML=(typeof calEditingId!=='undefined'&&calEditingId!=null)?renderRelatedSection('event',calEditingId):'<div style="font-size:var(--text-xs);color:var(--text3)">Save the event first, then come back to link related items.</div>';
    const tc=document.getElementById('ce-tags');
    if(tc)tc.innerHTML=(typeof calEditingId!=='undefined'&&calEditingId!=null)?renderTagsSection('event',calEditingId):'<div style="font-size:var(--text-xs);color:var(--text3)">Save the event first, then come back to tag it.</div>';
  }
  document.getElementById(id).classList.add('open');
}
function closeModal(id){document.getElementById(id).classList.remove('open');editingTaskId=null;editingClientId=null;editingFaithId=null;editingVentureId=null;editingJournalId=null;editingCashId=null;_flushPendingShapeSaves();const focusBtn=document.getElementById('tf-focus-btn');if(focusBtn)focusBtn.style.display='none';}
function openTaskFor(world){document.getElementById('tf-world').value=world;document.getElementById('taskModalTitle').textContent='New Task';openModal('taskModal');}
function openTaskForStatus(world,status){document.getElementById('tf-world').value=world;document.getElementById('tf-status').value=status;document.getElementById('taskModalTitle').textContent='New Task';openModal('taskModal');}
let pendingTaskSourceEventId=null;
function quickAddTaskFromEvent(eventId,dateStr,title){
  editingTaskId=null;
  pendingTaskSourceEventId=eventId||null;
  document.getElementById('taskModalTitle').textContent='New Task (linked to event)';
  ['tf-title','tf-notes','tf-platform'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('tf-title').value=title||'';
  document.getElementById('tf-world').value='LIFE';
  document.getElementById('tf-prio').value='Medium';
  document.getElementById('tf-status').value='Todo';
  document.getElementById('tf-due').value=dateStr||'';
  openModal('taskModal');
}

let editingTaskId=null;
function saveTask(){
  const startTime=document.getElementById('tf-start-time')?.value||'';
  const endTime=document.getElementById('tf-end-time')?.value||'';
  const startDate=document.getElementById('tf-start-date')?.value||'';
  const existing=editingTaskId?DB.tasks.find(x=>x.id===editingTaskId):{};
  const t={id:editingTaskId||Date.now(),title:document.getElementById('tf-title').value.trim()||'Untitled Task',world:document.getElementById('tf-world').value,priority:document.getElementById('tf-prio').value,status:document.getElementById('tf-status').value,startDate,due:document.getElementById('tf-due').value,platform:document.getElementById('tf-platform').value.trim(),client:document.getElementById('tf-client').value.trim(),notes:document.getElementById('tf-notes').value,driveLink:document.getElementById('tf-drive-link')?.value.trim()||'',startTime,endTime,
    projectId:  document.getElementById('tf-project')?.value||null,
    recur:      document.getElementById('tf-recur')?.value||'none',
    groupId:    existing.groupId    || null,
    subitems:   existing.subitems   || [],
    timelineS:  startDate || existing.timelineS || '',
    timelineE:  document.getElementById('tf-due')?.value || existing.timelineE || '',
    numValue:   parseFloat(document.getElementById('tf-num')?.value)||existing.numValue||null,
    connBoard:  existing.connBoard  || null,
    connItemId: existing.connItemId || null,
    sourceNoteId:  existing.sourceNoteId  ?? null,
    sourceBlockId: existing.sourceBlockId ?? null,
    sourceEventId: existing.sourceEventId ?? pendingTaskSourceEventId ?? null,
  };
  pendingTaskSourceEventId=null;
  const isEdit=!!editingTaskId;
  if(editingTaskId){const i=DB.tasks.findIndex(x=>x.id===editingTaskId);if(i>=0)DB.tasks[i]=t;SB.update('tasks',t.id,t,'tasks');}else{DB.tasks.unshift(t);SB.upsert('tasks',t,'tasks');}
  syncTaskToNoteBlock(t);
  addHistory(isEdit?'edit':'add',(isEdit?'Edited':'Added')+' task: '+t.title,{...t,_dbKey:'tasks'});
  // Auto-add task to calendar as a highlight block if it has a due date —
  // tagged with the task's own domain so it shows on that domain's own
  // calendar (which filters by type===worldId), not just a generic bucket.
  if(t.due){
    const domainType=(t.world||'').toLowerCase();
    let existingCal=DB.calEvents.find(e=>e._taskId===t.id);
    if(existingCal){
      // Task was edited — keep its calendar entry in sync rather than duplicate it
      existingCal.title=t.title;existingCal.date=t.due;existingCal.time=startTime;existingCal.endTime=endTime;existingCal.type=domainType;
      SB.update('cal_events',existingCal.id,existingCal,'calEvents');
    }else{
      const calEntry={id:Date.now()+1,_taskId:t.id,title:t.title,date:t.due,time:startTime,endTime:endTime,type:domainType,loc:'',notes:t.world+(t.client?' · '+t.client:''),_isTask:true};
      DB.calEvents.push(calEntry);
      SB.upsert('cal_events',calEntry,'calEvents');
    }
  }
  // Operational Flywheel auto-link
  autoFlywheelLink(t);
  closeModal('taskModal');['tf-title','tf-notes','tf-platform','tf-drive-link','tf-client'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const recurEl=document.getElementById('tf-recur');if(recurEl)recurEl.value='none';
  reRenderAll();showToast('✓ Task saved'+(t.due?' + added to calendar':''));
}
function editTask(id){
  const t=DB.tasks.find(x=>x.id===id);if(!t)return;editingTaskId=id;
  document.getElementById('taskModalTitle').textContent='Edit Task';
  document.getElementById('tf-title').value=t.title;
  document.getElementById('tf-world').value=t.world;
  if(typeof refreshProjectSelect==='function')refreshProjectSelect('tf-project',t.world,t.projectId);
  document.getElementById('tf-prio').value=t.priority;
  document.getElementById('tf-status').value=t.status;
  document.getElementById('tf-due').value=t.due||'';
  const sdEl=document.getElementById('tf-start-date');if(sdEl)sdEl.value=t.startDate||t.timelineS||'';
  document.getElementById('tf-platform').value=t.platform||'';
  document.getElementById('tf-client').value=t.client||'';
  document.getElementById('tf-notes').value=t.notes||'';
  const driveEl=document.getElementById('tf-drive-link');if(driveEl)driveEl.value=t.driveLink||'';
  const stEl=document.getElementById('tf-start-time');if(stEl)stEl.value=t.startTime||'';
  const etEl=document.getElementById('tf-end-time');if(etEl)etEl.value=t.endTime||'';
  const recurEl=document.getElementById('tf-recur');if(recurEl)recurEl.value=t.recur||'none';
  const focusBtn=document.getElementById('tf-focus-btn');
  if(focusBtn){focusBtn.style.display='inline-flex';focusBtn.innerHTML='<i class="ti ti-clock-play"></i> Start Focus Timer'+(t.focusMinutes?' <span style="opacity:.6;margin-left:4px">('+t.focusMinutes+'m logged)</span>':'');}
  const tsEl=document.getElementById('tf-timeline-s');if(tsEl)tsEl.value=t.timelineS||'';
  const teEl=document.getElementById('tf-timeline-e');if(teEl)teEl.value=t.timelineE||'';
  const numEl=document.getElementById('tf-num');if(numEl)numEl.value=t.numValue!=null?t.numValue:'';
  updateTaskClientDropdown(t.world);
  openModal('taskModal');
}
function deleteTask(e,id){
  e.stopPropagation();const t=DB.tasks.find(x=>x.id===id);if(!t)return;
  rememberSyncDeletion('tasks',t);
  if(t.sourceNoteId&&t.sourceBlockId){
    const n=DB.notes.find(x=>x.id===t.sourceNoteId);
    const b=n?.blocks.find(x=>x.id===t.sourceBlockId);
    if(b){b.taskId=null;save('notes');if(currentNote!=null&&DB.notes[currentNote]?.id===n.id){noteBlocks=[...n.blocks];renderBlocks();}renderNotesList();}
  }
  DB.tasks=DB.tasks.filter(x=>x.id!==id);SB.remove('tasks',id,'tasks');
  // Remove associated calendar entry
  const linkedEvents=DB.calEvents.filter(event=>event._taskId===id);
  linkedEvents.forEach(event=>{rememberSyncDeletion('cal_events',event);SB.remove('cal_events',event.id,'calEvents');});
  DB.calEvents=DB.calEvents.filter(event=>event._taskId!==id);
  save('calEvents');
  if(typeof _deleteItemLinksFor==='function')_deleteItemLinksFor('task',id);
  addHistory('delete','Deleted task: '+t.title,{...t,_dbKey:'tasks'});
  reRenderAll();showToast('Task deleted');
}

// Dynamic dropdown for task modal based on world selection
function updateTaskClientDropdown(world){
  const sel=document.getElementById('tf-client-select');
  const inp=document.getElementById('tf-client');
  const lbl=document.getElementById('tf-client-label');
  if(!sel||!inp)return;
  const current=inp.value; // preserve whatever was already loaded (e.g. by editTask) so switching/reopening doesn't lose it
  if(world==='WORK-IH'){
    if(lbl)lbl.textContent='Client';
    const clients=(DB.clients||[]).filter(c=>!c.world||c.world==='WORK-IH');
    sel.innerHTML='<option value="">— Select client —</option>'+clients.map(c=>`<option value="${c.name}">${c.name}</option>`).join('');
    sel.style.display='';inp.style.display='none';
    sel.value=[...sel.options].some(o=>o.value===current)?current:'';
    sel.onchange=()=>{inp.value=sel.value;};
  } else if(world==='WORK-CS'){
    if(lbl)lbl.textContent='Store';
    sel.innerHTML='<option value="">— Select store —</option><optgroup label="Chainsmoker"><option>Chainsmoker Ajax</option><option>Chainsmoker Etobicoke</option><option>Chainsmoker Kanata</option><option>Chainsmoker London</option><option>Chainsmoker Milton</option><option>Chainsmoker Scarborough</option><option>Chainsmoker Windsor</option><option>Chainsmoker Houston</option></optgroup><optgroup label="Sweetheart Cafe"><option>Sweetheart Cafe Ajax</option><option>Sweetheart Cafe Milton</option><option>Sweetheart Cafe Windsor</option><option>Sweetheart Cafe Houston</option></optgroup>';
    sel.style.display='';inp.style.display='none';
    sel.value=[...sel.options].some(o=>o.value===current)?current:'';
    sel.onchange=()=>{inp.value=sel.value;};
  } else if(world==='BUILD'){
    if(lbl)lbl.textContent='App';
    sel.innerHTML='<option value="">— Select app —</option><option>NAKNAK</option><option>DISKARTE</option><option>PASAHERO</option>';
    sel.style.display='';inp.style.display='none';
    sel.value=[...sel.options].some(o=>o.value===current)?current:'';
    sel.onchange=()=>{inp.value=sel.value;};
  } else {
    if(lbl)lbl.textContent='Person';
    sel.style.display='none';inp.style.display='';
    sel.innerHTML='';
  }
}

let editingClientId=null;
function saveClient(){
  const color=document.getElementById('cf-color')?.value?.trim()||'';
  const c={
    id:editingClientId||Date.now(),
    name:document.getElementById('cf-name').value.trim()||'Unnamed',
    desc:document.getElementById('cf-desc')?.value?.trim()||'',
    world:'WORK-IH',
    status:document.getElementById('cf-status').value,
    contact:document.getElementById('cf-contact').value,
    drive:document.getElementById('cf-drive')?.value||'',
    color:/^#[0-9a-fA-F]{6}$/.test(color)?color:''
  };
  const isEdit=!!editingClientId;
  if(editingClientId){const i=DB.clients.findIndex(x=>x.id===editingClientId);if(i>=0)DB.clients[i]=c;SB.update('clients',c.id,c,'clients');}else{DB.clients.unshift(c);SB.upsert('clients',c,'clients');}
  addHistory(isEdit?'edit':'add',(isEdit?'Edited':'Added')+' client: '+c.name,{...c,_dbKey:'clients'});
  closeModal('clientModal');reRenderAll();showToast('✓ Client saved');
}
function editClient(id){
  const c=DB.clients.find(x=>x.id===id);if(!c)return;
  editingClientId=id;
  document.getElementById('clientModalTitle').textContent='Edit Client';
  ['name','desc','status','contact','drive'].forEach(f=>{const el=document.getElementById('cf-'+f);if(el)el.value=c[f]||'';});
  const colorVal=c.color||'#00d4c8';
  const colorInput=document.getElementById('cf-color');
  const colorPicker=document.getElementById('cf-color-picker');
  if(colorInput)colorInput.value=colorVal;
  if(colorPicker)colorPicker.value=/^#[0-9a-fA-F]{6}$/.test(colorVal)?colorVal:'#00d4c8';
  openModal('clientModal');
}
function deleteClientBtn(e,id){e.stopPropagation();const c=DB.clients.find(x=>x.id===id);DB.clients=DB.clients.filter(x=>x.id!==id);SB.remove('clients',id,'clients');addHistory('delete','Deleted client: '+c.name,{...c,_dbKey:'clients'});reRenderAll();showToast('Client deleted');}

let editingVentureId=null;
function toggleVenturePartnerFields(type){
  const pf=document.getElementById('vm-partner-fields');
  if(pf) pf.style.display=type==='Partner/VA'?'block':'none';
}
function openVentureModal(id){
  editingVentureId=id||null;
  const v=id?DB.venture.find(x=>x.id===id):null;
  document.getElementById('ventureModalTitle').textContent=v?'Edit Item':'New Item';
  ['name','type','stage','notes','email','timezone','specialty','rate','availability','portfolio','skills'].forEach(f=>{
    const el=document.getElementById('vm-'+f);if(el)el.value=v?(v[f]||''):'';
  });
  toggleVenturePartnerFields(v?v.type:'Client');
  openModal('ventureModal');
}
function saveVentureItem(){
  const type=document.getElementById('vm-type').value;
  const v={
    id:editingVentureId||Date.now(),
    name:document.getElementById('vm-name').value.trim()||'Unnamed',
    type,stage:document.getElementById('vm-stage').value,
    notes:document.getElementById('vm-notes').value.trim()
  };
  if(type==='Partner/VA'){
    ['email','timezone','specialty','rate','availability','portfolio','skills'].forEach(f=>{
      const el=document.getElementById('vm-'+f);if(el)v[f]=el.value.trim();
    });
  }
  const isEdit=!!editingVentureId;
  if(editingVentureId){const i=DB.venture.findIndex(x=>x.id===editingVentureId);if(i>=0)DB.venture[i]=v;SB.update('venture',v.id,v,'venture');}
  else{DB.venture.unshift(v);SB.upsert('venture',v,'venture');}
  addHistory(isEdit?'edit':'add',(isEdit?'Edited':'Added')+' venture: '+v.name,{...v,_dbKey:'venture'});
  closeModal('ventureModal');renderVenture();showToast('✓ Saved');
}
function openVentureItem(type,stage){
  openVentureModal();
  const typeEl=document.getElementById('vm-type');
  const stageEl=document.getElementById('vm-stage');
  if(typeEl)typeEl.value=type||'Client';
  if(stageEl&&stage)stageEl.value=stage;
  toggleVenturePartnerFields(typeEl?.value||'Client');
}
function toggleVentureMenu(event){
  event?.stopPropagation();
  const menu=document.getElementById('jcActionMenu');if(!menu)return;
  const open=menu.classList.toggle('is-open');
  menu.previousElementSibling?.setAttribute('aria-expanded',String(open));
  if(!window._jcMenuOutsideBound){
    document.addEventListener('click',e=>{if(!e.target.closest('.jc-menu-wrap'))closeVentureMenu();});
    window._jcMenuOutsideBound=true;
  }
}
function closeVentureMenu(){
  const menu=document.getElementById('jcActionMenu');if(!menu)return;
  menu.classList.remove('is-open');
  menu.previousElementSibling?.setAttribute('aria-expanded','false');
}
function renderVenture(){renderDomainTimerCard('venture');
  const safe=value=>typeof escapeHtml==='function'?escapeHtml(String(value??'')):String(value??'');
  const ventures=DB.venture||[];
  const clients=ventures.filter(v=>v.type==='Client');
  const partners=ventures.filter(v=>v.type==='Partner/VA');
  const tasks=(DB.tasks||[]).filter(t=>t.world==='VENTURE');
  const openTasks=tasks.filter(t=>t.status!=='Done');
  const today=localDateStr(new Date());
  const currentMonth=today.slice(0,7);
  const revenue=(DB.cashflow||[]).filter(t=>t.type==='Credit'&&t.desc&&/tjc|job collectives/i.test(t.desc)&&(!t.date||t.date.startsWith(currentMonth))).reduce((sum,t)=>sum+(Number(t.amount)||0),0);
  const pipelineValue=clients.reduce((sum,client)=>sum+(Number(client.value)||Number(client.budget)||0),0);
  const attentionTasks=openTasks.filter(t=>(t.due&&t.due<today)||t.priority==='High'||t.status==='No Progress').sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999'));
  const readiness=Math.max(0,100-(attentionTasks.length*20));
  const availablePartners=partners.filter(p=>!/unavailable|booked|full/i.test(p.availability||'')).length;
  const capacityPct=partners.length?Math.round((availablePartners/partners.length)*100):0;
  const setText=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value;};
  const money=value=>'$'+Number(value||0).toLocaleString('en-US',{maximumFractionDigits:0});

  setText('vtClientCount',clients.length);
  setText('vtPartnerCount',partners.length);
  setText('vtRevenue',money(revenue));
  setText('vtPipelineValue',money(pipelineValue));
  setText('vtSlaReadiness',readiness+'%');
  setText('vtSlaLabel',attentionTasks.length?'Needs attention':'On track');

  const stageClass=stage=>'jc-stage-'+String(stage).toLowerCase().replace(/[^a-z]+/g,'-');
  const renderVPipeline=(containerId,items,stages,type)=>{
    const el=document.getElementById(containerId);if(!el)return;
    el.innerHTML=stages.map(stage=>{
      const stageItems=items.filter(item=>(item.stage||'Lead')===stage);
      return`<div class="jc-pipeline-column ${stageClass(stage)}" data-stage="${stage}" ondragover="event.preventDefault();this.classList.add('is-dragover')" ondragleave="this.classList.remove('is-dragover')" ondrop="this.classList.remove('is-dragover');handlePipelineDrop(event,'${stage}')">
        <div class="jc-pipeline-column-head"><span>${stage}</span><b>${stageItems.length}</b></div>
        <div class="jc-pipeline-column-body">
          ${stageItems.length?stageItems.map(item=>`<button class="jc-pipeline-item" draggable="true" ondragstart="handlePipelineDragStart(event,${item.id})" ondragend="this.style.opacity='1'" onclick="openVentureModal(${item.id})"><strong>${safe(item.name)}</strong>${item.type==='Partner/VA'&&item.specialty?`<small>${safe(item.specialty)}${item.rate?' · $'+safe(item.rate)+'/hr':''}</small>`:item.notes?`<small>${safe(item.notes)}</small>`:''}<i class="ti ti-dots"></i></button>`).join(''):`<div class="jc-pipeline-empty">No ${type==='Client'?'clients':'partners'}</div>`}
          <button class="jc-pipeline-add" onclick="openVentureItem('${type}','${stage}')"><i class="ti ti-plus"></i>Add ${type==='Client'?'client':'partner'}</button>
        </div>
      </div>`;
    }).join('');
  };
  renderVPipeline('vtcKanban',clients,['Lead','Discovery','Proposal','Negotiation','Active'],'Client');
  renderVPipeline('vtpKanban',partners,['Lead','Discovery','Proposal','Active'],'Partner/VA');

  const attentionEl=document.getElementById('vtAttentionList');
  if(attentionEl){
    const unstaffed=clients.filter(client=>client.stage!=='Lead'&&partners.length===0);
    const groups=[];
    if(attentionTasks.length){
      const task=attentionTasks[0];
      groups.push(`<button class="jc-attention-group" onclick="editTask(${task.id})"><span class="jc-attention-title"><i class="ti ti-alert-triangle"></i>Next follow-up <b>${attentionTasks.length}</b></span><strong>${safe(task.title)}</strong><small><em>${task.priority||'Open'} priority</em> · ${safe(task.status||'Todo')} ${task.due?`<time>${safe(formatTaskTableDate(task.due))}</time>`:''}</small></button>`);
    }
    if(unstaffed.length){
      const client=unstaffed[0];
      groups.push(`<button class="jc-attention-group" onclick="openVentureModal(${client.id})"><span class="jc-attention-title"><i class="ti ti-shield-exclamation"></i>Onboarding risk <b>${unstaffed.length}</b></span><strong>${safe(client.name)}</strong><small>No partner assigned</small></button>`);
    }
    attentionEl.innerHTML=groups.length?groups.join(''):`<div class="jc-empty-state"><i class="ti ti-shield-check"></i><strong>No active risks</strong><span>Your delivery queue is on track.</span></div>`;
  }

  const meetingEl=document.getElementById('vtUpcomingMeetings');
  if(meetingEl){
    const upcoming=(DB.calEvents||[]).filter(event=>event.type==='ven'&&event.date>=today).sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||''))).slice(0,3);
    meetingEl.innerHTML=upcoming.length?upcoming.map(event=>`<button class="jc-meeting-row" onclick="editCalEvent(${event.id})"><span class="jc-meeting-date"><b>${new Date(event.date+'T12:00:00').toLocaleDateString('en-US',{month:'short'})}</b>${new Date(event.date+'T12:00:00').getDate()}</span><span><strong>${safe(event.title)}</strong><small>${event.time?to12h(event.time):'All day'}</small></span><i class="ti ti-chevron-right"></i></button>`).join(''):`<div class="jc-empty-state"><i class="ti ti-calendar-off"></i><strong>No upcoming meetings</strong><span>You're all caught up.</span></div>`;
  }

  const capacityEl=document.getElementById('vtPartnerCapacity');
  if(capacityEl){
    capacityEl.innerHTML=`<div class="jc-capacity"><div class="jc-capacity-ring" style="--capacity:${capacityPct}"><span>${capacityPct}%</span></div><div><strong>${availablePartners} of ${partners.length} available</strong><span>Partners / VAs</span><small>${partners.length?'Capacity based on current availability.':'No partners in your network.'}</small></div></div>`;
  }

  const nextActionsEl=document.getElementById('vtNextActions');
  if(nextActionsEl){
    const next=openTasks.slice().sort((a,b)=>((a.due||'9999').localeCompare(b.due||'9999'))).slice(0,3);
    nextActionsEl.innerHTML=next.length?`<div class="jc-task-head"><span>Task</span><span>Priority</span><span>Status</span><span>Due</span></div>${next.map(task=>`<button class="jc-task-row" onclick="editTask(${task.id})"><strong>${safe(task.title)}</strong><span class="jc-priority jc-priority-${String(task.priority||'low').toLowerCase()}">${safe(task.priority||'Low')}</span><span class="jc-status">${safe(task.status||'Todo')}</span><time class="${task.due&&task.due<today?'is-overdue':''}">${task.due?safe(formatTaskTableDate(task.due)):'—'}</time></button>`).join('')}`:`<div class="jc-empty-state"><i class="ti ti-circle-check"></i><strong>No open tasks</strong><span>Everything is complete.</span></div>`;
  }
  _renderVTasks();
}

let _pipelineDragItemId=null;
function handlePipelineDragStart(e,itemId){
  _pipelineDragItemId=itemId;
  e.dataTransfer.effectAllowed='move';
  e.target.style.opacity='.4';
}
function handlePipelineDrop(e,newStage){
  e.preventDefault();
  e.currentTarget.style.background='';
  if(_pipelineDragItemId==null)return;
  const v=DB.venture.find(x=>x.id===_pipelineDragItemId);
  if(v&&v.stage!==newStage){
    v.stage=newStage;
    save('venture');
    SB.update('venture',v.id,v,'venture');
    addHistory('edit','Moved "'+v.name+'" to '+newStage,{...v,_dbKey:'venture'});
    renderVenture();
    showToast('✓ Moved to '+newStage);
  }
  _pipelineDragItemId=null;
}
let _vtView='list';
let _ventureDragTaskId=null;
function handleVentureKanbanDragStart(e,taskId){
  _ventureDragTaskId=taskId;
  e.dataTransfer.effectAllowed='move';
  e.target.style.opacity='.4';
}
function handleVentureKanbanDrop(e,newStatus){
  e.preventDefault();
  e.currentTarget.style.background='';
  if(_ventureDragTaskId==null)return;
  const t=DB.tasks.find(x=>x.id===_ventureDragTaskId);
  if(t&&t.status!==newStatus){
    t.status=newStatus;
    save('tasks');
    SB.update('tasks',t.id,t,'tasks');
    addHistory('edit','Moved "'+t.title+'" to '+newStatus,{...t,_dbKey:'tasks'});
    _renderVTasks();
    showToast('✓ Moved to '+newStatus);
  }
  _ventureDragTaskId=null;
}
function setVTView(v,btn){
  _vtView=v;
  document.querySelectorAll('#vtt-list,#vtt-kanban').forEach(b=>{b.classList.remove('active');});
  if(btn) btn.classList.add('active');
  _renderVTasks();
}

function _renderVTasks(){
  const el=document.getElementById('vtTaskList');if(!el)return;
  const pf=document.getElementById('vtPrioFilter')?.value||'all';
  const sf=document.getElementById('vtStatFilter')?.value||'all';
  let tasks=(DB.tasks||[]).filter(t=>t.world==='VENTURE');
  if(pf!=='all') tasks=tasks.filter(t=>t.priority===pf);
  if(sf!=='all') tasks=tasks.filter(t=>t.status===sf);

  const pDot=p=>p==='High'?'#ef4444':p==='Medium'?'#f59e0b':'#4ade80';
  const sCl=taskStatusPillClass;
  const pCl=p=>p==='High'?'pr':p==='Medium'?'pam':'pgr';

  if(!tasks.length){
    el.innerHTML=`<div style="padding:24px;text-align:center;color:var(--text3);font-size:var(--text-sm)">No VENTURE tasks yet. Click + Add Task to begin.</div>`;
    return;
  }

  if(_vtView==='list'){
    el.innerHTML=`<table class="ht" style="width:100%">
      <thead><tr>
        <th>Title</th><th>Priority</th><th>Status</th><th>Due</th><th>Notes</th><th></th>
      </tr></thead>
      <tbody>${tasks.map(t=>`<tr onclick="editTask(${t.id})" style="cursor:pointer">
        <td style="font-weight:600;color:var(--text1)">${t.title}</td>
        <td><span style="display:flex;align-items:center;gap:5px"><div style="width:7px;height:7px;border-radius:50%;background:${pDot(t.priority)};flex-shrink:0"></div><span class="pill ${pCl(t.priority)}" style="font-size:var(--text-xs)">${t.priority}</span></span></td>
        <td><span class="pill ${sCl(t.status)}" style="font-size:var(--text-xs)">${t.status||'Todo'}</span></td>
        <td style="font-size:var(--text-xs);color:${t.due&&t.due<localDateStr(new Date())?'var(--red)':'var(--text3)'}">${t.due||'—'}</td>
        <td style="font-size:var(--text-xs);color:var(--text3);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.notes||'—'}</td>
        <td><button class="btn btn-d" style="padding:2px 7px" onclick="event.stopPropagation();deleteTask(event,${t.id})"><i class="ti ti-trash" style="font-size:var(--text-xs);line-height:1;display:block"></i></button></td>
      </tr>`).join('')}</tbody>
    </table>`;
  } else {
    // Kanban view — columns by status
    const statuses=['Todo','In Progress','No Progress','Done'];
    const stColor=taskStatusColor;
    el.innerHTML=`<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:12px 16px;height:100%;align-content:start">
      ${statuses.map(s=>{
        const col=tasks.filter(t=>(t.status||'Todo')===s);
        const ac=stColor(s);
        return`<div data-status="${s}" ondragover="event.preventDefault();this.style.background='var(--hover-tint)'" ondragleave="this.style.background=''" ondrop="handleVentureKanbanDrop(event,'${s}')" style="display:flex;flex-direction:column;gap:6px;border-radius:10px;transition:background .15s;padding:4px">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:5px 0">
            <span style="font-size:var(--text-xs);font-weight:700;color:${ac};text-transform:uppercase;letter-spacing:.07em">${s}</span>
            <span style="font-size:var(--text-xs);color:${ac};background:${ac}18;border:1px solid ${ac}35;border-radius:10px;padding:0 7px;line-height:17px;font-weight:700">${col.length}</span>
          </div>
          ${col.map(t=>`<div draggable="true" ondragstart="handleVentureKanbanDragStart(event,${t.id})" ondragend="this.style.opacity='1'" style="background:var(--navy3);border:1px solid var(--border);border-left:3px solid ${pDot(t.priority)};border-radius:8px;padding:8px 10px;cursor:grab;transition:all .15s" onclick="editTask(${t.id})" onmouseover="this.style.borderColor='${ac}'" onmouseout="this.style.borderColor='var(--border)'">
            <div style="font-size:var(--text-xs);font-weight:700;color:var(--text1);line-height:1.4;margin-bottom:4px">${t.title}</div>
            <div style="display:flex;gap:5px;align-items:center">
              <span class="pill ${pCl(t.priority)}" style="font-size:var(--text-xs)">${t.priority}</span>
              ${t.due?`<span style="font-size:var(--text-xs);color:var(--text3)">${t.due}</span>`:''}
            </div>
          </div>`).join('')}
          ${!col.length?`<div style="font-size:var(--text-xs);color:var(--text3);padding:8px;text-align:center;font-style:italic;border:1px dashed var(--border);border-radius:8px">Drop here</div>`:''}
        </div>`;
      }).join('')}
    </div>`;
  }
}

let _vtCurrentFilter='all';
function vtFilterTasks(filter,btn){ _vtCurrentFilter=filter; _renderVTasks(); }

function setVentureTab(tab,el){
  if(tab==='clients')tab='overview';
  const panels={overview:'vt-overview-view',partners:'vt-partners-view',meetings:'vt-meetings',calendar:'vt-calendar',tasks:'vt-tasks-view'};
  Object.entries(panels).forEach(([key,id])=>{const panel=document.getElementById(id);if(panel)panel.hidden=key!==tab;});
  if(tab==='meetings') renderMeetingsPanel('meetingsPanel-VENTURE','VENTURE');
  else if(tab==='calendar') renderDomainCalendar('ven','ventureCalGrid','ventureCalLabel','ven','#3448d8','var(--blue)');
  else if(tab==='tasks') _renderVTasks();
  else renderVenture();
  document.querySelector('#view-venture .jc-scroll')?.scrollTo({top:0,behavior:'smooth'});
}

function renderBriefCal_LEGACY(m,y){
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dayLabels=['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const today=new Date();
  const firstDay=new Date(y,m,1).getDay();
  const daysInMonth=new Date(y,m+1,0).getDate();
  const prevDays=new Date(y,m,0).getDate();
  const titleEl=document.getElementById('briefCalTitle');
  if(titleEl)titleEl.textContent=months[m]+' '+y;
  let html=`<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:3px">${dayLabels.map(d=>`<div style="font-size:var(--text-xs);font-weight:700;color:var(--text3);text-align:center;padding:2px 0;letter-spacing:.05em">${d}</div>`).join('')}</div>`;
  html+='<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px">';
  for(let i=firstDay-1;i>=0;i--){html+=`<div style="min-height:72px;background:var(--navy3);border:1px solid var(--border);border-radius:8px;padding:5px;opacity:.3"><div style="font-size:var(--text-xs);color:var(--text3)">${prevDays-i}</div></div>`;}
  for(let day=1;day<=daysInMonth;day++){
    const isToday=today.getDate()===day&&today.getMonth()===m&&today.getFullYear()===y;
    const ds=y+'-'+(String(m+1).padStart(2,'0'))+'-'+(String(day).padStart(2,'0'));
    const evs=DB.calEvents.filter(e=>e.date===ds);
    html+=`<div style="min-height:72px;background:var(--navy3);border:1px solid ${isToday?'var(--teal)':'var(--border)'};border-radius:8px;padding:5px;cursor:pointer;transition:border-color .1s" onclick="openCalEventModalOnDate('${ds}')" onmouseover="this.style.borderColor='var(--teal2)'" onmouseout="this.style.borderColor='${isToday?'var(--teal)':'var(--border)'}'">
      <div style="font-size:var(--text-sm);font-weight:${isToday?'700':'500'};color:${isToday?'var(--teal)':'var(--text2)'}">${day}</div>
      ${evs.slice(0,2).map(e=>`<div style="font-size:var(--text-xs);background:${e.type==='oc'?'var(--orange3)':e.type==='pu'?'rgba(168,85,247,.1)':'var(--teal3)'};color:${e.type==='oc'?'var(--orange)':e.type==='pu'?'var(--purple)':'var(--teal)'};border-radius:6px;padding:2px 4px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.title}</div>`).join('')}
    </div>`;
  }
  const rem=42-(firstDay+daysInMonth);
  for(let i=1;i<=rem;i++){html+=`<div style="min-height:72px;background:var(--navy3);border:1px solid var(--border);border-radius:8px;padding:5px;opacity:.3"><div style="font-size:var(--text-xs);color:var(--text3)">${i}</div></div>`;}
  html+='</div>';
  const calEl=document.getElementById('briefCalendar');
  if(calEl)calEl.innerHTML=html;
}
let _dragVentureId=null;
function dragVentureCard(e,id){_dragVentureId=id;e.dataTransfer.effectAllowed='move';}
function dropVentureCard(e,newStage){
  e.preventDefault();
  if(!_dragVentureId)return;
  const idx=DB.venture.findIndex(v=>v.id===_dragVentureId);
  if(idx<0)return;
  DB.venture[idx].stage=newStage;
  SB.update('venture',DB.venture[idx].id,DB.venture[idx],'venture');
  addHistory('edit','Moved '+DB.venture[idx].name+' to '+newStage,DB.venture[idx]);
  renderVenture();showToast('Moved to '+newStage+'');
  _dragVentureId=null;
}
let editingAppId=null;
function openAppModal(id){
  editingAppId=id||null;
  const a=id?(DB.buildApps||[]).find(x=>x.id===id):null;
  document.getElementById('appModalTitle').textContent=a?'Edit App':'Add App';
  const iconInput=document.getElementById('am-icon');
  const iconPreview=document.getElementById('am-icon-preview');
  const iconGrid=document.getElementById('iconGrid');
  const currentIcon=a?a.icon:'ti-device-mobile';
  if(iconInput){iconInput.value=currentIcon;}
  if(iconPreview){iconPreview.className='ti '+currentIcon;}
  if(iconGrid){
    const ICONS=['ti-device-mobile','ti-device-tablet','ti-brand-android','ti-brand-apple','ti-rocket','ti-code','ti-cpu','ti-database','ti-api','ti-terminal','ti-bug','ti-shield','ti-lock','ti-heart','ti-star','ti-crown','ti-bolt','ti-flame','ti-leaf','ti-brain','ti-robot','ti-camera','ti-music','ti-map','ti-compass','ti-car','ti-plane','ti-home','ti-shopping-cart','ti-chart-bar','ti-chart-line','ti-coins','ti-wallet','ti-receipt','ti-users','ti-user','ti-message','ti-mail','ti-bell','ti-calendar','ti-clock','ti-settings','ti-tool','ti-brush','ti-palette','ti-photo','ti-video','ti-microphone','ti-headphones','ti-game-pad','ti-puzzle'];
    iconGrid.innerHTML=ICONS.map(ic=>`<div onclick="document.getElementById('am-icon').value='${ic}';document.getElementById('am-icon-preview').className='ti ${ic}';document.querySelectorAll('#iconGrid .icon-btn').forEach(b=>b.classList.remove('sel'));this.classList.add('sel')" class="icon-btn${currentIcon===ic?' sel':''}" style="display:flex;align-items:center;justify-content:center;padding:6px;border-radius:10px;cursor:pointer;border:1px solid ${currentIcon===ic?'var(--teal2)':'transparent'};background:${currentIcon===ic?'rgba(128,255,250,.1)':'transparent'};transition:all .1s" title="${ic}"><i class="ti ${ic}" style="font-size:16px;color:${currentIcon===ic?'var(--teal)':'var(--text3)'};line-height:1;display:block"></i></div>`).join('');
  }
  // Populate text fields
  ['name','desc','status','tech','repo','playstore','appstore','notes'].forEach(f=>{
    const el=document.getElementById('am-'+f);
    if(el)el.value=a?(a[f]||''):'';
  });
  if(!a){const statusEl=document.getElementById('am-status');if(statusEl)statusEl.value='In Dev';}
  const colorVal=a?(a.color&&/^#/.test(a.color)?a.color:'#00d4c8'):'#00d4c8';
  document.getElementById('am-color').value=colorVal;
  const cp=document.getElementById('am-color-picker');if(cp)cp.value=colorVal;
  const delBtn=document.getElementById('am-delete-btn');if(delBtn)delBtn.style.display=a?'block':'none';
  openModal('appModal');
}
function saveApp(){
  const name=document.getElementById('am-name').value.trim();
  if(!name){showToast('App name required');return;}
  const color=document.getElementById('am-color').value.trim()||'#00d4c8';
  const a={
    id:editingAppId||Date.now(),
    name,
    desc:document.getElementById('am-desc').value.trim(),
    status:document.getElementById('am-status').value,
    icon:document.getElementById('am-icon').value.trim()||'ti-device-mobile',
    color:/^#[0-9a-fA-F]{6}$/.test(color)?color:'var(--teal)',
    tech:document.getElementById('am-tech').value.trim(),
    repo:document.getElementById('am-repo').value.trim(),
    playstore:document.getElementById('am-playstore').value.trim(),
    appstore:document.getElementById('am-appstore').value.trim(),
    notes:document.getElementById('am-notes').value.trim(),
  };
  if(!DB.buildApps)DB.buildApps=[];
  if(editingAppId){const i=DB.buildApps.findIndex(x=>x.id===editingAppId);if(i>=0)DB.buildApps[i]=a;}
  else DB.buildApps.unshift(a);
  save('buildApps');
  closeModal('appModal');
  renderBuild();
  showToast('✓ App saved');
}
async function deleteApp(){
  if(!editingAppId)return;
  const a=(DB.buildApps||[]).find(x=>x.id===editingAppId);
  if(!a||!await jelixConfirm(`Delete "${a.name}"?`,'Delete'))return;
  DB.buildApps=DB.buildApps.filter(x=>x.id!==editingAppId);
  save('buildApps');
  closeModal('appModal');
  renderBuild();
  showToast('App deleted');
}

function renderBuild(){renderDomainTimerCard('build');
  const apps=DB.buildApps||[];
  const grid=document.getElementById('buildApps');
  if(grid){
    grid.innerHTML=(apps.length?apps:[]).map(app=>{
      const appTasks=DB.tasks.filter(t=>t.world==='build'&&(t.client===app.name||(t.title||'').includes(app.name)));
      const open=appTasks.filter(t=>t.status!=='Done');const done=appTasks.filter(t=>t.status==='Done').length;
      const total=appTasks.length;const pct=total?Math.round(done/total*100):0;
      const accentColor=/^#/.test(app.color)?app.color:'var(--teal)';
      const statusColor=app.status==='Active'||app.status==='Launched'?'var(--green)':app.status==='In Dev'||app.status==='Beta'?'var(--amber)':app.status==='Paused'?'var(--red)':'var(--text3)';
      return`<div style="background:var(--navy2);border:1px solid var(--border);border-top:2px solid ${accentColor};border-radius:14px;display:flex;flex-direction:column;gap:8px;padding:16px;transition:box-shadow .2s;cursor:pointer" onclick="openAppModal(${app.id})">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:38px;height:38px;border-radius:10px;background:${accentColor}18;border:1px solid ${accentColor}35;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="ti ${app.icon||'ti-device-mobile'}" style="font-size:18px;color:${accentColor};line-height:1;display:block"></i></div>
          <div style="flex:1;min-width:0">
            <div style="font-size:var(--text-sm);font-weight:800;color:var(--text1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${app.name}</div>
            <div style="font-size:var(--text-xs);color:${statusColor};font-weight:600">${app.status}</div>
          </div>
        </div>
        ${app.desc?`<div style="font-size:var(--text-xs);color:var(--text3);line-height:1.5">${app.desc}</div>`:''}
        ${app.tech?`<div style="font-size:var(--text-xs);color:var(--text3)"><i class="ti ti-code" style="font-size:10px;display:inline-block;margin-right:4px"></i>${app.tech}</div>`:''}
        <div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span style="font-size:var(--text-xs);color:var(--text3)">${done}/${total} tasks</span>
            <span style="font-size:var(--text-xs);font-weight:700;color:${accentColor}">${pct}%</span>
          </div>
          <div style="height:3px;background:var(--hover-tint);border-radius:6px"><div style="height:100%;width:${pct}%;background:${accentColor};border-radius:6px;transition:width .4s"></div></div>
        </div>
        ${open.length?`<div style="font-size:var(--text-xs);color:var(--text2);background:var(--hover-tint);border:1px solid var(--border);border-radius:12px;padding:6px 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">→ ${open[0].title}</div>`:''}
        <div style="display:flex;gap:5px;margin-top:2px">
          ${app.repo?`<a href="${app.repo}" target="_blank" onclick="event.stopPropagation()" style="font-size:var(--text-xs);color:var(--text3);display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border:1px solid var(--border);border-radius:10px;text-decoration:none;transition:all .15s" onmouseover="this.style.borderColor=this.style.color='var(--teal)'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text3)'"><i class="ti ti-brand-github" style="font-size:11px;line-height:1;display:block"></i>Repo</a>`:''}
          ${app.playstore?`<a href="${app.playstore}" target="_blank" onclick="event.stopPropagation()" style="font-size:var(--text-xs);color:var(--text3);display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border:1px solid var(--border);border-radius:10px;text-decoration:none"><i class="ti ti-brand-google-play" style="font-size:11px;line-height:1;display:block"></i>Play</a>`:''}
          ${app.appstore?`<a href="${app.appstore}" target="_blank" onclick="event.stopPropagation()" style="font-size:var(--text-xs);color:var(--text3);display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border:1px solid var(--border);border-radius:10px;text-decoration:none"><i class="ti ti-brand-apple" style="font-size:11px;line-height:1;display:block"></i>App Store</a>`:''}
          <button onclick="event.stopPropagation();openTaskFor('build')" style="font-size:var(--text-xs);color:var(--text3);padding:3px 8px;border:1px solid var(--border);border-radius:10px;background:transparent;cursor:pointer;margin-left:auto;transition:all .15s" onmouseover="this.style.borderColor='var(--teal)';this.style.color='var(--teal)'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text3)'"><i class="ti ti-plus" style="font-size:10px;line-height:1;display:inline-block;margin-right:3px"></i>Task</button>
        </div>
      </div>`;
    }).join('')+(apps.length<8?`<div onclick="openAppModal()" style="background:var(--navy2);border:2px dashed var(--border);border-radius:14px;padding:24px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;cursor:pointer;color:var(--text3);transition:all .15s" onmouseover="this.style.borderColor='var(--teal)';this.style.color='var(--teal)'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text3)'"><i class="ti ti-plus" style="font-size:24px;line-height:1;display:block"></i><span style="font-size:var(--text-xs);font-weight:700;letter-spacing:.06em;text-transform:uppercase">Add App</span></div>`:'');
  }
  renderBuildTasks();
  renderBuildStats();
}

// ── Code Collectives — dashboard stats bar (was "monitoring only") ────────
function renderBuildStats(){
  const el=document.getElementById('buildStats');if(!el)return;
  const apps=DB.buildApps||[];
  const buildTasks=DB.tasks.filter(t=>t.world==='BUILD'||t.world==='build');
  const openTasks=buildTasks.filter(t=>t.status!=='Done').length;
  const inDev=apps.filter(a=>a.status==='In Dev'||a.status==='Beta').length;
  const launched=apps.filter(a=>a.status==='Active'||a.status==='Launched').length;
  const activeProjects=(DB.pipeline||[]).filter(p=>p.stage==='Active').length;
  const pipelineValue=(DB.pipeline||[]).filter(p=>p.stage!=='Delivered').reduce((s,p)=>s+(parseFloat(p.budget)||0),0);
  el.innerHTML=`
    <div class="hc"><div class="cl">Total Apps</div><div class="cv">${apps.length}</div></div>
    <div class="hc"><div class="cl">In Dev / Beta</div><div class="cv" style="color:var(--amber)">${inDev}</div></div>
    <div class="hc"><div class="cl">Active / Launched</div><div class="cv" style="color:var(--green)">${launched}</div></div>
    <div class="hc"><div class="cl">Open Build Tasks</div><div class="cv" style="color:var(--teal)">${openTasks}</div></div>
    <div class="hc"><div class="cl">Active Client Projects</div><div class="cv" style="color:var(--teal)">${activeProjects}</div></div>
    <div class="hc oc"><div class="cl">Pipeline Value</div><div class="cv oc">₱${pipelineValue.toLocaleString('en-PH')}</div></div>
  `;
}

// ── Code Collectives — tab navigation ──────────────────────────────────
function setBCTab(tab,btn){
  ['tracker','pipeline','calendar'].forEach(t=>{
    const panel=document.getElementById('bc-'+t);if(panel)panel.style.display=t===tab?(t==='calendar'?'block':'flex'):'none';
    const tabBtn=document.getElementById('bctab-'+t);if(tabBtn)tabBtn.classList.toggle('active',t===tab);
  });
  const headerBtns=document.getElementById('buildHeaderBtns');
  if(headerBtns){
    headerBtns.innerHTML=tab==='pipeline'
      ? '<button class="btn btn-g" onclick="openPipelineModal()"><i class="ti ti-plus"></i> Project</button>'
      : tab==='calendar'
      ? '<button class="btn btn-g" onclick="openCalEventModal()"><i class="ti ti-calendar-plus"></i> Event</button>'
      : '<button class="btn btn-g" onclick="openTaskFor(\'BUILD\')"><i class="ti ti-plus"></i> Task</button>';
  }
  if(tab==='pipeline')renderPipeline();
  else if(tab==='calendar')renderDomainCalendar('bld','buildCalGrid','buildCalLabel','bld','#00ff88','var(--green)');
  else renderBuild();
}

// ── Client Pipeline (Code Collectives — external dev projects) ─────────
let editingPipelineId=null;
function openPipelineModal(id){
  editingPipelineId=id||null;
  const p=id?(DB.pipeline||[]).find(x=>x.id===id):null;
  document.getElementById('pipelineModalTitle').textContent=p?'Edit Project':'New Project';
  document.getElementById('pl-name').value=p?p.name||'':'';
  document.getElementById('pl-client').value=p?p.client||'':'';
  document.getElementById('pl-stage').value=p?normalizeCodeStage(p.stage):'Inquiry';
  document.getElementById('pl-budget').value=p?p.budget||'':'';
  document.getElementById('pl-deadline').value=p?p.deadline||'':'';
  document.getElementById('pl-tech').value=p?p.tech||'':'';
  document.getElementById('pl-repo').value=p?p.repo||'':'';
  document.getElementById('pl-supabase').value=p?p.supabase||'':'';
  document.getElementById('pl-website').value=p?p.website||'':'';
  document.getElementById('pl-social').value=p?p.social||'':'';
  document.getElementById('pl-notes').value=p?p.notes||'':'';
  const delBtn=document.getElementById('pl-delete-btn');if(delBtn)delBtn.style.display=p?'block':'none';
  openModal('pipelineModal');
}
function savePipelineProject(){
  const name=document.getElementById('pl-name').value.trim();
  if(!name){showToast('⚠ Project name required.');return;}
  const p={
    id:editingPipelineId||Date.now(),
    name,
    client:document.getElementById('pl-client').value.trim(),
    stage:document.getElementById('pl-stage').value,
    budget:parseFloat(document.getElementById('pl-budget').value)||0,
    deadline:document.getElementById('pl-deadline').value,
    tech:document.getElementById('pl-tech').value.trim(),
    repo:document.getElementById('pl-repo').value.trim(),
    supabase:document.getElementById('pl-supabase').value.trim(),
    website:document.getElementById('pl-website').value.trim(),
    social:document.getElementById('pl-social').value.trim(),
    notes:document.getElementById('pl-notes').value.trim(),
  };
  DB.pipeline=DB.pipeline||[];
  const isEdit=!!editingPipelineId;
  if(isEdit){const i=DB.pipeline.findIndex(x=>x.id===editingPipelineId);if(i>=0)DB.pipeline[i]=p;SB.update('pipeline',p.id,p,'pipeline');}
  else{DB.pipeline.unshift(p);SB.upsert('pipeline',p,'pipeline');}
  addHistory(isEdit?'edit':'add',(isEdit?'Edited':'Added')+' pipeline project: '+p.name,{...p,_dbKey:'pipeline'});
  editingPipelineId=null;
  closeModal('pipelineModal');
  renderPipeline();renderBuildStats();
  showToast('✓ Project saved');
}
async function deletePipelineProject(id){
  const targetId=id||editingPipelineId;
  const p=(DB.pipeline||[]).find(x=>x.id===targetId);if(!p)return;
  if(!id&&!await jelixConfirm('Delete "'+p.name+'"?','Delete'))return;
  DB.pipeline=DB.pipeline.filter(x=>x.id!==targetId);
  save('pipeline');
  SB.remove('pipeline',targetId,'pipeline');
  addHistory('delete','Deleted pipeline project: '+p.name,{...p,_dbKey:'pipeline'});
  editingPipelineId=null;
  closeModal('pipelineModal');
  renderPipeline();renderBuildStats();
  showToast('Project deleted');
}
function movePipelineStage(id,stage){
  const p=(DB.pipeline||[]).find(x=>x.id===id);if(!p)return;
  p.stage=stage;save('pipeline');SB.update('pipeline',p.id,p,'pipeline');renderPipeline();renderBuildStats();
}
let _codePipelineDragId=null;
function handleCodePipelineDragStart(e,id){
  _codePipelineDragId=id;
  e.dataTransfer.effectAllowed='move';
  e.target.style.opacity='.4';
}
function handleCodePipelineDrop(e,newStage){
  e.preventDefault();
  e.currentTarget.style.background='';
  if(_codePipelineDragId==null)return;
  movePipelineStage(_codePipelineDragId,newStage);
  showToast('✓ Moved to '+newStage);
  _codePipelineDragId=null;
}
function renderPipeline(){
  const board=document.getElementById('pipelineBoard');if(!board)return;
  const stages=[
    {id:'Lead',label:'Lead',color:'var(--text3)'},
    {id:'Active',label:'Active',color:'var(--teal)'},
    {id:'Delivered',label:'Delivered',color:'var(--green)'},
  ];
  const items=DB.pipeline||[];
  board.innerHTML=stages.map(s=>{
    const stageItems=items.filter(p=>p.stage===s.id);
    return `<div data-stage="${s.id}" ondragover="event.preventDefault();this.style.background='var(--hover-tint)'" ondragleave="this.style.background=''" ondrop="handleCodePipelineDrop(event,'${s.id}')" style="display:flex;flex-direction:column;background:var(--navy2);border:1px solid var(--border);border-top:2px solid ${s.color};border-radius:10px;overflow:hidden;min-height:0;transition:background .15s">
      <div style="padding:12px 14px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
        <span style="font-size:var(--text-xs);font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${s.color}">${s.label}</span>
        <span style="font-size:var(--text-xs);color:var(--text3)">${stageItems.length}</span>
      </div>
      <div style="flex:1;padding:10px;display:flex;flex-direction:column;gap:10px;overflow-y:auto">
        ${stageItems.length?stageItems.map(p=>`
          <div draggable="true" ondragstart="handleCodePipelineDragStart(event,${p.id})" ondragend="this.style.opacity='1'" onclick="openPipelineModal(${p.id})" style="background:var(--navy3);border:1px solid var(--border);border-radius:8px;padding:14px;cursor:grab">
            <div style="font-size:var(--text-md);font-weight:700;color:var(--text1);margin-bottom:4px">${p.name}</div>
            ${p.client?`<div style="font-size:var(--text-xs);color:var(--teal);margin-bottom:6px">${p.client}</div>`:''}
            ${p.tech?`<div style="font-size:var(--text-xs);color:var(--text3);margin-bottom:8px"><i class="ti ti-code" style="font-size:10px;margin-right:4px"></i>${p.tech}</div>`:''}
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
              <span style="font-size:var(--text-xs);color:var(--text3)">${p.deadline||'No deadline'}</span>
              ${p.budget?`<span style="font-size:var(--text-sm);font-weight:800;color:var(--amber)">₱${p.budget.toLocaleString()}</span>`:''}
            </div>
            ${(p.repo||p.supabase||p.website||p.social)?`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px" onclick="event.stopPropagation()">
              ${p.repo?`<a href="${p.repo}" target="_blank" title="Repo" style="color:var(--text3);display:inline-flex;padding:4px 6px;border:1px solid var(--border);border-radius:10px;text-decoration:none" onmouseover="this.style.color='var(--teal)';this.style.borderColor='var(--teal)'" onmouseout="this.style.color='var(--text3)';this.style.borderColor='var(--border)'"><i class="ti ti-brand-github" style="font-size:13px;line-height:1;display:block"></i></a>`:''}
              ${p.supabase?`<a href="${p.supabase}" target="_blank" title="Supabase" style="color:var(--text3);display:inline-flex;padding:4px 6px;border:1px solid var(--border);border-radius:10px;text-decoration:none" onmouseover="this.style.color='var(--green)';this.style.borderColor='var(--green)'" onmouseout="this.style.color='var(--text3)';this.style.borderColor='var(--border)'"><i class="ti ti-database" style="font-size:13px;line-height:1;display:block"></i></a>`:''}
              ${p.website?`<a href="${p.website}" target="_blank" title="Website" style="color:var(--text3);display:inline-flex;padding:4px 6px;border:1px solid var(--border);border-radius:10px;text-decoration:none" onmouseover="this.style.color='var(--teal)';this.style.borderColor='var(--teal)'" onmouseout="this.style.color='var(--text3)';this.style.borderColor='var(--border)'"><i class="ti ti-world" style="font-size:13px;line-height:1;display:block"></i></a>`:''}
              ${p.social?`<a href="${p.social}" target="_blank" title="Social" style="color:var(--text3);display:inline-flex;padding:4px 6px;border:1px solid var(--border);border-radius:10px;text-decoration:none" onmouseover="this.style.color='var(--amber)';this.style.borderColor='var(--amber)'" onmouseout="this.style.color='var(--text3)';this.style.borderColor='var(--border)'"><i class="ti ti-share" style="font-size:13px;line-height:1;display:block"></i></a>`:''}
            </div>`:''}
            <div style="display:flex;gap:4px" onclick="event.stopPropagation()">
              ${stages.filter(x=>x.id!==s.id).map(x=>`<button onclick="movePipelineStage(${p.id},'${x.id}')" style="flex:1;font-size:9px;padding:4px 4px;background:transparent;border:1px solid var(--border);border-radius:10px;color:var(--text3);cursor:pointer">→ ${x.label}</button>`).join('')}
            </div>
          </div>`).join(''):'<div style="font-size:var(--text-xs);color:var(--text3);text-align:center;padding:16px">Empty</div>'}
      </div>
    </div>`;
  }).join('');
}
function renderBuildTasks(){
  const tbody=document.getElementById('buildTbody');if(!tbody)return;
  const sf=document.getElementById('buildTaskFilter')?.value||'all';
  let tasks=DB.tasks.filter(t=>t.world==='BUILD');
  if(sf!=='all')tasks=tasks.filter(t=>t.status===sf);
  const pDot=p=>p==='High'?'#ef4444':p==='Medium'?'#f59e0b':'#4ade80';
  const sCl=taskStatusPillClass;
  const pCl=p=>p==='High'?'pr':p==='Medium'?'pam':'pgr';
  tbody.innerHTML=tasks.length?tasks.map(t=>`<tr onclick="editTask(${t.id})" style="cursor:pointer">
    <td style="font-size:var(--text-sm);font-weight:600;color:var(--text1)">${t.title}</td>
    <td style="font-size:var(--text-sm);color:var(--text3)">${t.client||t.platform||'—'}</td>
    <td><span style="display:inline-flex;align-items:center;gap:4px"><span style="width:6px;height:6px;border-radius:50%;background:${pDot(t.priority)};display:inline-block"></span><span class="pill ${pCl(t.priority)}" style="font-size:var(--text-sm)">${t.priority}</span></span></td>
    <td><span class="pill ${sCl(t.status)}" style="font-size:var(--text-sm)">${t.status||'Todo'}</span></td>
    <td style="font-size:var(--text-sm);color:var(--text3)">${t.due||'—'}</td>
    <td><button class="btn btn-d" style="padding:2px 6px" onclick="event.stopPropagation();deleteTask(event,${t.id})"><i class="ti ti-trash" style="font-size:var(--text-xs);line-height:1;display:block"></i></button></td>
  </tr>`).join(''):`<tr><td colspan="6" style="text-align:center;color:var(--text3);font-size:var(--text-sm);padding:20px">No BUILD tasks yet. Use + Task to add one.</td></tr>`;
}
function renderSides(){renderDomainTimerCard('sides');
  const countEl=document.getElementById('sidesCount');if(countEl)countEl.textContent=DB.sides.length;
  const activeEl=document.getElementById('sidesActive');if(activeEl)activeEl.textContent=DB.sides.filter(p=>p.status==='Active').length;
  const rev=DB.sides.reduce((s,p)=>s+(p.price||0),0);const revEl=document.getElementById('sidesRevenue');if(revEl)revEl.textContent='₱'+rev.toLocaleString('en-PH');
  const grid=document.getElementById('sidesProductGrid');if(!grid)return;
  if(!DB.sides.length){grid.innerHTML='<div style="font-size:var(--text-xs);color:var(--text3);grid-column:1/-1">No products yet. Click + Product to start.</div>';return;}
  grid.innerHTML=DB.sides.map(p=>{
    const todos=p.todos||[];const done=todos.filter(t=>t.done).length;
    return`<div style="background:var(--navy2);border:1px solid var(--border);border-radius:12px;overflow:hidden">
      <div style="padding:11px 13px;border-bottom:1px solid var(--border);background:rgba(245,158,11,.05)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px"><div style="font-size:var(--text-xs);font-weight:700;color:var(--amber)">${p.name}</div><span class="pill pt" style="font-size:var(--text-xs)">${p.status}</span></div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:3px"><div style="font-size:var(--text-xs);color:var(--text3)">${p.platform||'—'}</div>${p.price?`<span style="font-size:var(--text-xs);font-weight:700;color:var(--amber)">₱${p.price.toLocaleString()}</span>`:''}</div>
        ${p.drive?`<a href="${p.drive}" target="_blank" onclick="event.stopPropagation()" style="font-size:var(--text-xs);color:var(--teal);display:inline-flex;align-items:center;gap:3px;margin-top:4px"><i class="ti ti-brand-google-drive" style="font-size:var(--text-xs);line-height:1;display:block"></i>Drive</a>`:''}
      </div>
      <div style="padding:10px 13px">
        <div style="font-size:var(--text-xs);font-weight:700;color:var(--text3);letter-spacing:.08em;text-transform:uppercase;margin-bottom:7px;display:flex;align-items:center;justify-content:space-between"><span>To-Do (${done}/${todos.length})</span><button style="background:var(--teal3);border:1px solid var(--teal2);border-radius:8px;color:var(--teal);font-size:var(--text-xs);padding:1px 7px;cursor:pointer" onclick="addSidesTodo(${p.id})">+ Add</button></div>
        ${todos.map((t,i)=>`<div style="display:flex;align-items:center;gap:7px;padding:4px 0;border-bottom:1px solid var(--border)"><div onclick="toggleSideTodo(${p.id},${i})" style="width:13px;height:13px;border:1px solid ${t.done?'var(--teal)':'var(--border2)'};border-radius:6px;flex-shrink:0;cursor:pointer;background:${t.done?'var(--teal)':'transparent'};display:flex;align-items:center;justify-content:center;font-size:var(--text-xs);color:var(--navy)">${t.done?'✓':''}</div><span style="flex:1;font-size:var(--text-xs);color:${t.done?'var(--text3)':'var(--text1)'};text-decoration:${t.done?'line-through':'none'}">${t.text}</span><button style="background:transparent;border:none;color:var(--text3);cursor:pointer;font-size:var(--text-xs);padding:0 3px" onclick="removeSideTodo(${p.id},${i})">×</button></div>`).join('')}
        ${!todos.length?'<div style="font-size:var(--text-xs);color:var(--text3)">No tasks yet.</div>':''}
      </div>
      <div style="padding:6px 13px;border-top:1px solid var(--border);display:flex;gap:5px"><button class="btn btn-g" style="flex:1;font-size:var(--text-xs)" onclick="event.stopPropagation();editSidesProduct(${p.id})"><i class="ti ti-pencil" style="font-size:var(--text-xs);line-height:1;display:inline-block"></i> Edit</button><button class="btn btn-d" style="flex:1;font-size:var(--text-xs)" onclick="event.stopPropagation();deleteSide(${p.id})"><i class="ti ti-trash" style="font-size:var(--text-xs);line-height:1;display:inline-block"></i> Delete</button></div>
    </div>`;}).join('');
}
let editingSidesId=null;
function addSidesProduct(){editingSidesId=null;document.getElementById('sidesModalTitle').textContent='New Product';['sp-name','sp-platform','sp-price','sp-drive','sp-notes'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});document.getElementById('sp-status').value='Active';openModal('sidesModal');}
function editSidesProduct(pid){const p=DB.sides.find(x=>x.id===pid);if(!p)return;editingSidesId=pid;document.getElementById('sidesModalTitle').textContent='Edit Product';document.getElementById('sp-name').value=p.name||'';document.getElementById('sp-platform').value=p.platform||'';document.getElementById('sp-status').value=p.status||'Active';document.getElementById('sp-price').value=p.price||'';document.getElementById('sp-drive').value=p.drive||'';document.getElementById('sp-notes').value=p.notes||'';openModal('sidesModal');}
function saveSidesProduct(){const name=document.getElementById('sp-name').value.trim();if(!name)return showToast('Product name required.');const p={id:editingSidesId||Date.now(),name,platform:document.getElementById('sp-platform').value.trim()||'RaketPH',status:document.getElementById('sp-status').value,price:parseFloat(document.getElementById('sp-price').value)||0,drive:document.getElementById('sp-drive').value.trim(),notes:document.getElementById('sp-notes').value.trim(),todos:editingSidesId?(DB.sides.find(x=>x.id===editingSidesId)?.todos||[]):[]};if(editingSidesId){const i=DB.sides.findIndex(x=>x.id===editingSidesId);if(i>=0)DB.sides[i]=p;SB.update('sides',p.id,p,'sides');}else{DB.sides.push(p);SB.upsert('sides',p,'sides');}closeModal('sidesModal');renderSides();showToast('✓ Product saved');}
async function deleteSide(id){if(!await jelixConfirm('Delete this product?','Delete'))return;DB.sides=DB.sides.filter(x=>x.id!==id);SB.remove('sides',id,'sides');renderSides();}
async function addSidesTodo(pid){const result=await jelixPrompt('New Task',[{key:'text',label:'Task'}],'Add');const text=result?.[0];if(!text)return;const p=DB.sides.find(x=>x.id===pid);if(!p)return;p.todos=p.todos||[];p.todos.push({text,done:false});SB.update('sides',pid,p,'sides');renderSides();}
function toggleSideTodo(pid,idx){const p=DB.sides.find(x=>x.id===pid);if(!p||!p.todos)return;p.todos[idx].done=!p.todos[idx].done;SB.update('sides',pid,p,'sides');renderSides();}
function removeSideTodo(pid,idx){const p=DB.sides.find(x=>x.id===pid);if(!p||!p.todos)return;p.todos.splice(idx,1);SB.update('sides',pid,p,'sides');renderSides();}

// ── Creative Collectives — tab navigation ───────────────────────────────
function setCCTab(tab,btn){
  ['collateral','projects','social','campaigns','products','calendar'].forEach(t=>{
    const panel=document.getElementById('cc-'+t);if(panel)panel.style.display=t===tab?'':'none';
    const tabBtn=document.getElementById('cctab-'+t);if(tabBtn)tabBtn.classList.toggle('active',t===tab);
  });
  const headerBtns=document.getElementById('sidesHeaderBtns');
  if(headerBtns){
    const btnMap={
      collateral:'<button class="btn btn-o" onclick="openCollateralModal()"><i class="ti ti-plus"></i> Collateral</button>',
      projects:'<button class="btn btn-o" onclick="openCreativeProjectModal()"><i class="ti ti-plus"></i> Project</button>',
      social:'<button class="btn btn-o" onclick="openSocialModal()"><i class="ti ti-plus"></i> Post</button>',
      campaigns:'<button class="btn btn-o" onclick="openCampaignModal()"><i class="ti ti-plus"></i> Campaign</button>',
      products:'<button class="btn btn-o" onclick="addSidesProduct()"><i class="ti ti-plus"></i> Product</button>',
      calendar:'<button class="btn btn-o" onclick="openCalEventModal()"><i class="ti ti-calendar-plus"></i> Event</button>',
    };
    headerBtns.innerHTML=btnMap[tab]||btnMap.collateral;
  }
  if(tab==='collateral')renderCollateral();
  else if(tab==='projects')renderCreativeProjects();
  else if(tab==='social')renderSocialWorkflow();
  else if(tab==='campaigns')renderCampaigns();
  else if(tab==='calendar')renderDomainCalendar('sid','sidesCalGrid','sidesCalLabel','sid','#ffaa00','var(--amber)');
  else renderSides();
}

// ── Marketing Collateral Library ────────────────────────────────────────
let editingCollateralId=null;
function openCollateralModal(id){
  editingCollateralId=id||null;
  const c=id?(DB.collateral||[]).find(x=>x.id===id):null;
  document.getElementById('collateralModalTitle').textContent=c?'Edit Collateral':'New Collateral';
  document.getElementById('col-name').value=c?c.name||'':'';
  document.getElementById('col-type').value=c?c.type||'Social Post':'Social Post';
  document.getElementById('col-status').value=c?c.status||'Draft':'Draft';
  document.getElementById('col-client').value=c?c.client||'':'';
  document.getElementById('col-format').value=c?c.format||'':'';
  document.getElementById('col-link').value=c?c.link||'':'';
  document.getElementById('col-tags').value=c?(c.tags||[]).join(', '):'';
  document.getElementById('col-notes').value=c?c.notes||'':'';
  const delBtn=document.getElementById('col-delete-btn');if(delBtn)delBtn.style.display=c?'block':'none';
  openModal('collateralModal');
}
function saveCollateral(){
  const name=document.getElementById('col-name').value.trim();
  if(!name){showToast('⚠ Collateral title required.');return;}
  const c={
    id:editingCollateralId||Date.now(),
    name,
    type:document.getElementById('col-type').value,
    status:document.getElementById('col-status').value,
    client:document.getElementById('col-client').value.trim(),
    format:document.getElementById('col-format').value.trim(),
    link:document.getElementById('col-link').value.trim(),
    tags:document.getElementById('col-tags').value.split(',').map(t=>t.trim()).filter(Boolean),
    notes:document.getElementById('col-notes').value.trim(),
    updated:localDateStr(new Date()),
  };
  DB.collateral=DB.collateral||[];
  const isEdit=!!editingCollateralId;
  if(isEdit){const i=DB.collateral.findIndex(x=>x.id===editingCollateralId);if(i>=0)DB.collateral[i]=c;SB.update('collateral',c.id,c,'collateral');}
  else{DB.collateral.unshift(c);SB.upsert('collateral',c,'collateral');}
  save('collateral');
  addHistory(isEdit?'edit':'add',(isEdit?'Edited':'Added')+' collateral: '+c.name,{...c,_dbKey:'collateral'});
  editingCollateralId=null;
  closeModal('collateralModal');
  renderCollateral();
  showToast('✓ Collateral saved');
}
async function deleteCollateral(id){
  const targetId=id||editingCollateralId;
  const c=(DB.collateral||[]).find(x=>x.id===targetId);if(!c)return;
  if(!id&&!await jelixConfirm('Delete "'+c.name+'"?','Delete'))return;
  DB.collateral=DB.collateral.filter(x=>x.id!==targetId);
  save('collateral');SB.remove('collateral',targetId,'collateral');
  addHistory('delete','Deleted collateral: '+c.name,{...c,_dbKey:'collateral'});
  editingCollateralId=null;
  closeModal('collateralModal');
  renderCollateral();
  showToast('Collateral deleted');
}
function renderCollateral(){
  const grid=document.getElementById('collateralGrid');if(!grid)return;
  const items=DB.collateral||[];
  const statsEl=document.getElementById('collateralStats');
  if(statsEl){
    const total=items.length;
    const inReview=items.filter(c=>c.status==='In Review').length;
    const approved=items.filter(c=>c.status==='Approved'||c.status==='Delivered').length;
    statsEl.innerHTML=`<div class="hc"><div class="cl">Total Assets</div><div class="cv">${total}</div></div><div class="hc"><div class="cl">In Review</div><div class="cv" style="color:var(--amber)">${inReview}</div></div><div class="hc oc"><div class="cl">Approved / Delivered</div><div class="cv oc">${approved}</div></div>`;
  }
  const typeF=document.getElementById('collateralFilterType')?.value||'all';
  const statusF=document.getElementById('collateralFilterStatus')?.value||'all';
  const clientF=(document.getElementById('collateralFilterClient')?.value||'').toLowerCase().trim();
  let filtered=items;
  if(typeF!=='all')filtered=filtered.filter(c=>c.type===typeF);
  if(statusF!=='all')filtered=filtered.filter(c=>c.status===statusF);
  if(clientF)filtered=filtered.filter(c=>(c.client||'').toLowerCase().includes(clientF));

  if(!filtered.length){
    grid.innerHTML='<div style="font-size:var(--text-xs);color:var(--text3);grid-column:1/-1;padding:20px;text-align:center">'+(items.length?'No collateral matches these filters.':'No collateral yet. Click "+ Collateral" to add your first asset.')+'</div>';
    return;
  }
  const statusColor={Draft:'var(--text3)','In Review':'var(--amber)',Approved:'var(--teal)',Delivered:'var(--green)'};
  const typeIcon={'Social Post':'ti-brand-instagram','Ad Creative':'ti-ad','Flyer':'ti-file-description','Brand Asset':'ti-palette','Presentation':'ti-presentation','Video':'ti-video','Email Template':'ti-mail','Print':'ti-printer',Other:'ti-file'};
  grid.innerHTML=filtered.map(c=>{
    const sc=statusColor[c.status]||'var(--text3)';
    return `<div style="background:var(--navy2);border:1px solid var(--border);border-top:2px solid ${sc};border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:8px;cursor:pointer" onclick="openCollateralModal(${c.id})">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:6px;min-width:0">
          <i class="ti ${typeIcon[c.type]||'ti-file'}" style="font-size:14px;color:var(--amber);flex-shrink:0"></i>
          <div style="font-size:var(--text-sm);font-weight:700;color:var(--text1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.name}</div>
        </div>
        <span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:8px;background:${sc}22;color:${sc};flex-shrink:0;text-transform:uppercase;letter-spacing:.04em">${c.status}</span>
      </div>
      <div style="font-size:var(--text-xs);color:var(--text3);display:flex;gap:8px;flex-wrap:wrap">
        <span>${c.type}</span>${c.client?`<span>· ${c.client}</span>`:''}${c.format?`<span>· ${c.format}</span>`:''}
      </div>
      ${c.tags&&c.tags.length?`<div style="display:flex;gap:4px;flex-wrap:wrap">${c.tags.map(t=>`<span style="font-size:9px;color:var(--text3);background:var(--hover-tint);border:1px solid var(--border);border-radius:8px;padding:1px 7px">#${t}</span>`).join('')}</div>`:''}
      <div style="display:flex;gap:6px;margin-top:2px">
        ${c.link?`<a href="${c.link}" target="_blank" onclick="event.stopPropagation()" style="font-size:var(--text-xs);color:var(--teal);display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border:1px solid var(--border);border-radius:10px;text-decoration:none"><i class="ti ti-external-link" style="font-size:11px;line-height:1;display:block"></i>Open</a>`:''}
        <span style="font-size:9px;color:var(--text3);margin-left:auto;align-self:center">Updated ${c.updated||'—'}</span>
      </div>
    </div>`;
  }).join('');
}

// ── Creative Collectives — Client Projects ──────────────────────────────
let editingCreativeProjectId=null;
let creativeProjectDeliverables=[];
function addCreativeDeliverable(){
  const input=document.getElementById('cp-new-deliverable');
  const text=input.value.trim();if(!text)return;
  creativeProjectDeliverables.push({text,done:false});
  input.value='';
  renderCreativeDeliverablesList();
}
function toggleCreativeDeliverable(i){creativeProjectDeliverables[i].done=!creativeProjectDeliverables[i].done;renderCreativeDeliverablesList();}
function removeCreativeDeliverable(i){creativeProjectDeliverables.splice(i,1);renderCreativeDeliverablesList();}
function renderCreativeDeliverablesList(){
  const el=document.getElementById('cp-deliverables-list');if(!el)return;
  el.innerHTML=creativeProjectDeliverables.map((d,i)=>`<div style="display:flex;align-items:center;gap:7px;padding:4px 0;border-bottom:1px solid var(--border)">
    <div onclick="toggleCreativeDeliverable(${i})" style="width:13px;height:13px;border:1px solid ${d.done?'var(--teal)':'var(--border2)'};border-radius:6px;flex-shrink:0;cursor:pointer;background:${d.done?'var(--teal)':'transparent'};display:flex;align-items:center;justify-content:center;font-size:9px;color:var(--navy)">${d.done?'✓':''}</div>
    <span style="flex:1;font-size:var(--text-xs);color:${d.done?'var(--text3)':'var(--text1)'};text-decoration:${d.done?'line-through':'none'}">${d.text}</span>
    <button onclick="removeCreativeDeliverable(${i})" style="background:transparent;border:none;color:var(--text3);cursor:pointer;font-size:var(--text-xs);padding:0 3px">×</button>
  </div>`).join('');
}
function openCreativeProjectModal(id){
  editingCreativeProjectId=id||null;
  const p=id?(DB.creativeProjects||[]).find(x=>x.id===id):null;
  document.getElementById('creativeProjectModalTitle').textContent=p?'Edit Project':'New Project';
  document.getElementById('cp-name').value=p?p.name||'':'';
  document.getElementById('cp-client').value=p?p.client||'':'';
  document.getElementById('cp-status').value=p?normalizeCreativeStatus(p.status):'Brief';
  document.getElementById('cp-budget').value=p?p.budget||'':'';
  document.getElementById('cp-deadline').value=p?p.deadline||'':'';
  document.getElementById('cp-notes').value=p?p.notes||'':'';
  creativeProjectDeliverables=p?JSON.parse(JSON.stringify(p.deliverables||[])):[];
  renderCreativeDeliverablesList();
  const delBtn=document.getElementById('cp-delete-btn');if(delBtn)delBtn.style.display=p?'block':'none';
  openModal('creativeProjectModal');
}
function saveCreativeProject(){
  const name=document.getElementById('cp-name').value.trim();
  if(!name){showToast('⚠ Project name required.');return;}
  const p={
    id:editingCreativeProjectId||Date.now(),
    name,
    client:document.getElementById('cp-client').value.trim(),
    status:document.getElementById('cp-status').value,
    budget:parseFloat(document.getElementById('cp-budget').value)||0,
    deadline:document.getElementById('cp-deadline').value,
    notes:document.getElementById('cp-notes').value.trim(),
    deliverables:creativeProjectDeliverables,
  };
  DB.creativeProjects=DB.creativeProjects||[];
  const isEdit=!!editingCreativeProjectId;
  if(isEdit){const i=DB.creativeProjects.findIndex(x=>x.id===editingCreativeProjectId);if(i>=0)DB.creativeProjects[i]=p;SB.update('creative_projects',p.id,p,'creativeProjects');}
  else{DB.creativeProjects.unshift(p);SB.upsert('creative_projects',p,'creativeProjects');}
  addHistory(isEdit?'edit':'add',(isEdit?'Edited':'Added')+' creative project: '+p.name,{...p,_dbKey:'creativeProjects'});
  editingCreativeProjectId=null;
  closeModal('creativeProjectModal');
  renderCreativeProjects();
  showToast('✓ Project saved');
}
async function deleteCreativeProject(id){
  const targetId=id||editingCreativeProjectId;
  const p=(DB.creativeProjects||[]).find(x=>x.id===targetId);if(!p)return;
  if(!id&&!await jelixConfirm('Delete "'+p.name+'"?','Delete'))return;
  DB.creativeProjects=DB.creativeProjects.filter(x=>x.id!==targetId);
  save('creativeProjects');
  SB.remove('creative_projects',targetId,'creativeProjects');
  addHistory('delete','Deleted creative project: '+p.name,{...p,_dbKey:'creativeProjects'});
  editingCreativeProjectId=null;
  closeModal('creativeProjectModal');
  renderCreativeProjects();
  showToast('Project deleted');
}
function renderCreativeProjects(){
  const grid=document.getElementById('creativeProjectGrid');if(!grid)return;
  const items=DB.creativeProjects||[];
  const statsEl=document.getElementById('creativeProjectStats');
  if(statsEl){
    const active=items.filter(p=>p.status!=='Delivered').length;
    const delivered=items.filter(p=>p.status==='Delivered').length;
    const totalBudget=items.filter(p=>p.status!=='Delivered').reduce((s,p)=>s+(p.budget||0),0);
    statsEl.innerHTML=`<div class="hc"><div class="cl">Total Projects</div><div class="cv">${items.length}</div></div><div class="hc"><div class="cl">Active</div><div class="cv" style="color:var(--teal)">${active}</div></div><div class="hc oc"><div class="cl">Open Budget</div><div class="cv oc">₱${totalBudget.toLocaleString('en-PH')}</div></div>`;
  }
  if(!items.length){grid.innerHTML='<div style="font-size:var(--text-xs);color:var(--text3);grid-column:1/-1;padding:20px;text-align:center">No client projects yet. Click "+ Project" to start tracking one.</div>';return;}
  const statusColor={Brief:'var(--text3)',Concept:'var(--amber)',Production:'var(--teal)','Client Review':'var(--amber)',Delivered:'var(--green)',Planning:'var(--text3)','In Progress':'var(--teal)',Review:'var(--amber)'};
  grid.innerHTML=items.map(p=>{
    const sc=statusColor[p.status]||'var(--text3)';
    const deliverables=p.deliverables||[];
    const doneCount=deliverables.filter(d=>d.done).length;
    return `<div style="background:var(--navy2);border:1px solid var(--border);border-top:2px solid ${sc};border-radius:10px;padding:14px;cursor:pointer" onclick="openCreativeProjectModal(${p.id})">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
        <div style="font-size:var(--text-sm);font-weight:700;color:var(--text1)">${p.name}</div>
        <span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:8px;background:${sc}22;color:${sc};text-transform:uppercase;letter-spacing:.04em;flex-shrink:0">${p.status}</span>
      </div>
      ${p.client?`<div style="font-size:var(--text-xs);color:var(--teal);margin-bottom:6px">${p.client}</div>`:''}
      ${deliverables.length?`<div style="font-size:var(--text-xs);color:var(--text3);margin-bottom:4px">${doneCount}/${deliverables.length} deliverables</div><div style="height:3px;background:var(--navy3);border-radius:6px;margin-bottom:8px"><div style="height:100%;width:${Math.round(doneCount/deliverables.length*100)}%;background:${sc};border-radius:6px"></div></div>`:''}
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:var(--text-xs);color:var(--text3)">
        <span>${p.deadline||'No deadline'}</span>
        ${p.budget?`<span style="font-weight:700;color:var(--amber)">₱${p.budget.toLocaleString()}</span>`:''}
      </div>
    </div>`;
  }).join('');
}

// ── Creative Collectives — Social Media Workflow ────────────────────────
let editingSocialId=null;
function openSocialModal(id){
  editingSocialId=id||null;
  const s=id?(DB.socialPosts||[]).find(x=>x.id===id):null;
  document.getElementById('socialModalTitle').textContent=s?'Edit Post':'New Post';
  document.getElementById('soc-platform').value=s?s.platform||'Instagram':'Instagram';
  document.getElementById('soc-client').value=s?s.client||'':'';
  document.getElementById('soc-caption').value=s?s.caption||'':'';
  document.getElementById('soc-date').value=s?s.date||'':'';
  document.getElementById('soc-status').value=s?s.status||'Draft':'Draft';
  document.getElementById('soc-link').value=s?s.link||'':'';
  document.getElementById('soc-notes').value=s?s.notes||'':'';
  const delBtn=document.getElementById('soc-delete-btn');if(delBtn)delBtn.style.display=s?'block':'none';
  openModal('socialModal');
}
function saveSocialPost(){
  const caption=document.getElementById('soc-caption').value.trim();
  const client=document.getElementById('soc-client').value.trim();
  if(!caption&&!client){showToast('⚠ Add at least a client or caption.');return;}
  const s={
    id:editingSocialId||Date.now(),
    platform:document.getElementById('soc-platform').value,
    client,
    caption,
    date:document.getElementById('soc-date').value,
    status:document.getElementById('soc-status').value,
    link:document.getElementById('soc-link').value.trim(),
    notes:document.getElementById('soc-notes').value.trim(),
  };
  DB.socialPosts=DB.socialPosts||[];
  const isEdit=!!editingSocialId;
  if(isEdit){const i=DB.socialPosts.findIndex(x=>x.id===editingSocialId);if(i>=0)DB.socialPosts[i]=s;SB.update('social_posts',s.id,s,'socialPosts');}
  else{DB.socialPosts.unshift(s);SB.upsert('social_posts',s,'socialPosts');}
  addHistory(isEdit?'edit':'add',(isEdit?'Edited':'Added')+' social post: '+(s.caption.substring(0,40)||s.client),{...s,_dbKey:'socialPosts'});
  editingSocialId=null;
  closeModal('socialModal');
  renderSocialWorkflow();
  showToast('✓ Post saved');
}
async function deleteSocialPost(id){
  const targetId=id||editingSocialId;
  const s=(DB.socialPosts||[]).find(x=>x.id===targetId);if(!s)return;
  if(!id&&!await jelixConfirm('Delete this post?','Delete'))return;
  DB.socialPosts=DB.socialPosts.filter(x=>x.id!==targetId);
  save('socialPosts');
  SB.remove('social_posts',targetId,'socialPosts');
  addHistory('delete','Deleted social post',{...s,_dbKey:'socialPosts'});
  editingSocialId=null;
  closeModal('socialModal');
  renderSocialWorkflow();
  showToast('Post deleted');
}
function moveSocialStage(id,status){
  const s=(DB.socialPosts||[]).find(x=>x.id===id);if(!s)return;
  s.status=status;save('socialPosts');SB.update('social_posts',s.id,s,'socialPosts');renderSocialWorkflow();
}
let _socialDragId=null;
function handleSocialDragStart(e,id){
  _socialDragId=id;
  e.dataTransfer.effectAllowed='move';
  e.target.style.opacity='.4';
}
function handleSocialDrop(e,newStatus){
  e.preventDefault();
  e.currentTarget.style.background='';
  if(_socialDragId==null)return;
  moveSocialStage(_socialDragId,newStatus);
  showToast('✓ Moved to '+newStatus);
  _socialDragId=null;
}
function renderSocialWorkflow(){
  const items=DB.socialPosts||[];
  const statsEl=document.getElementById('socialStats');
  if(statsEl){
    const needsApproval=items.filter(s=>s.status==='Needs Approval').length;
    const scheduled=items.filter(s=>s.status==='Scheduled').length;
    const posted=items.filter(s=>s.status==='Posted').length;
    statsEl.innerHTML=`<div class="hc"><div class="cl">Total Posts</div><div class="cv">${items.length}</div></div><div class="hc"><div class="cl">Needs Approval</div><div class="cv" style="color:var(--amber)">${needsApproval}</div></div><div class="hc"><div class="cl">Scheduled</div><div class="cv" style="color:var(--teal)">${scheduled}</div></div><div class="hc oc"><div class="cl">Posted</div><div class="cv oc">${posted}</div></div>`;
  }
  const platformF=document.getElementById('socialFilterPlatform')?.value||'all';
  const clientF=(document.getElementById('socialFilterClient')?.value||'').toLowerCase().trim();
  let filtered=items;
  if(platformF!=='all')filtered=filtered.filter(s=>s.platform===platformF);
  if(clientF)filtered=filtered.filter(s=>(s.client||'').toLowerCase().includes(clientF));
  renderSocialBoardInto('socialBoard',filtered);
}
// WORK-CS Social Calendar tab — same board, scoped to the active client (Chainsmoker/Sweetheart Cafe)
function renderCSSocialCalendar(){
  const items=(DB.socialPosts||[]).filter(s=>csClientMatch(s.client));
  renderSocialBoardInto('csSocialBoard',items);
}
function renderSocialBoardInto(elId,filtered){
  const board=document.getElementById(elId);if(!board)return;
  const stages=[
    {id:'Draft',label:'Draft',color:'var(--text3)'},
    {id:'Needs Approval',label:'Needs Approval',color:'var(--amber)'},
    {id:'Scheduled',label:'Scheduled',color:'var(--teal)'},
    {id:'Posted',label:'Posted',color:'var(--green)'},
  ];
  const platformIcon={Instagram:'ti-brand-instagram',Facebook:'ti-brand-facebook',TikTok:'ti-brand-tiktok',LinkedIn:'ti-brand-linkedin','X / Twitter':'ti-brand-x',YouTube:'ti-brand-youtube'};
  board.innerHTML=stages.map(stage=>{
    const stageItems=filtered.filter(s=>s.status===stage.id);
    return `<div data-stage="${stage.id}" ondragover="event.preventDefault();this.style.background='var(--hover-tint)'" ondragleave="this.style.background=''" ondrop="handleSocialDrop(event,'${stage.id}')" style="display:flex;flex-direction:column;background:var(--navy2);border:1px solid var(--border);border-top:2px solid ${stage.color};border-radius:10px;overflow:hidden;min-height:220px;transition:background .15s">
      <div style="padding:10px 12px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:var(--text-xs);font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:${stage.color}">${stage.label}</span>
        <span style="font-size:var(--text-xs);color:var(--text3)">${stageItems.length}</span>
      </div>
      <div style="flex:1;padding:8px;display:flex;flex-direction:column;gap:8px;overflow-y:auto">
        ${stageItems.length?stageItems.map(s=>`
          <div draggable="true" ondragstart="handleSocialDragStart(event,${s.id})" ondragend="this.style.opacity='1'" onclick="openSocialModal(${s.id})" style="background:var(--navy3);border:1px solid var(--border);border-radius:8px;padding:10px 12px;cursor:grab">
            <div style="display:flex;align-items:center;gap:5px;margin-bottom:4px">
              <i class="ti ${platformIcon[s.platform]||'ti-share'}" style="font-size:12px;color:var(--amber)"></i>
              <span style="font-size:var(--text-xs);font-weight:700;color:var(--text1)">${s.client||s.platform}</span>
            </div>
            ${s.caption?`<div style="font-size:var(--text-xs);color:var(--text3);overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;margin-bottom:6px">${s.caption}</div>`:''}
            <div style="font-size:9px;color:var(--text3);margin-bottom:6px">${s.date||'No date set'}</div>
            <div style="display:flex;gap:4px" onclick="event.stopPropagation()">
              ${stages.filter(x=>x.id!==stage.id).map(x=>`<button onclick="moveSocialStage(${s.id},'${x.id}')" title="Move to ${x.label}" style="flex:1;font-size:9px;padding:3px 2px;background:transparent;border:1px solid var(--border);border-radius:10px;color:var(--text3);cursor:pointer">→</button>`).join('')}
            </div>
          </div>`).join(''):'<div style="font-size:var(--text-xs);color:var(--text3);text-align:center;padding:16px">Empty</div>'}
      </div>
    </div>`;
  }).join('');
}

// ── Campaigns (shared model — used by WORK-CS Marketing suite AND Creative Collectives) ──
let editingCampaignId=null;
function openCampaignModal(id){
  editingCampaignId=id||null;
  const c=id?(DB.campaigns||[]).find(x=>x.id===id):null;
  document.getElementById('campaignModalTitle').textContent=c?'Edit Campaign':'New Campaign';
  document.getElementById('cam-name').value=c?c.name||'':'';
  const inCSMktg=document.getElementById('cs-marketing')&&document.getElementById('cs-marketing').style.display!=='none';
  document.getElementById('cam-client').value=c?(c.client||''):(inCSMktg?CS_CLIENTS[csActiveClient].label:'');
  document.getElementById('cam-platform').value=c?c.platform||'':'';
  document.getElementById('cam-status').value=c?c.status||'Planning':'Planning';
  document.getElementById('cam-goal').value=c?c.goal||'':'';
  document.getElementById('cam-audience').value=c?c.audience||'':'';
  document.getElementById('cam-start').value=c?c.startDate||'':'';
  document.getElementById('cam-end').value=c?c.endDate||'':'';
  document.getElementById('cam-budget').value=c?c.budget||'':'';
  document.getElementById('cam-spent').value=c?c.spent||'':'';
  document.getElementById('cam-results').value=c?c.results||'':'';
  document.getElementById('cam-notes').value=c?c.notes||'':'';
  document.getElementById('genCopyResults').innerHTML='';
  const delBtn=document.getElementById('cam-delete-btn');if(delBtn)delBtn.style.display=c?'block':'none';
  openModal('campaignModal');
}
async function generateCampaignCopy(){
  const name=document.getElementById('cam-name').value.trim();
  if(!name){showToast('⚠ Name the campaign first.');return;}
  if(!hasAnyAIKey()){showToast('⚠ Sign in to use ChatGPT-powered J.E.L.I.X.');return;}
  const type=document.getElementById('cam-platform').value.trim()||'General campaign';
  const offer=document.getElementById('cam-goal').value.trim();
  const audience=document.getElementById('cam-audience').value.trim();
  const inCSMktg=document.getElementById('cs-marketing')&&document.getElementById('cs-marketing').style.display!=='none';
  const brandLabel=inCSMktg?CS_CLIENTS[csActiveClient].label:(document.getElementById('cam-client').value.trim()||'this brand');
  const btn=document.getElementById('genCopyBtn');
  const resultsEl=document.getElementById('genCopyResults');
  btn.disabled=true;btn.textContent='Generating...';
  resultsEl.innerHTML='';
  const prompt=`You are a copywriter for ${brandLabel}.
Write marketing copy for this promo:
Name: ${name}
Type: ${type}
Offer detail: ${offer||'not specified — infer something plausible'}
Target audience: ${audience||'general local customers'}

Produce exactly 3 distinct copy variations, each with a hook (under 12 words), a value statement (1-2 sentences), and a CTA (under 8 words). Premium but approachable tone, no clichés, minimal emoji.
Respond ONLY with valid JSON, no preamble, no markdown fences:
{"variants":[{"hook":"...","value":"...","cta":"..."},{"hook":"...","value":"...","cta":"..."},{"hook":"...","value":"...","cta":"..."}]}`;
  const result=await callAIProvider('You are a precise marketing copywriter. Always respond with valid JSON only.',[{role:'user',content:prompt}],{maxTokens:1000});
  btn.disabled=false;btn.textContent='Generate 3 variations';
  if(!result.ok){
    resultsEl.innerHTML=`<div style="font-size:var(--text-xs);color:var(--red)">Couldn't generate copy: ${result.error}</div>`;
    return;
  }
  try{
    const parsed=JSON.parse(result.text.replace(/```json|```/g,'').trim());
    resultsEl.innerHTML=parsed.variants.map((v,i)=>`
      <div style="background:var(--navy2);border:1px solid var(--border);border-radius:8px;padding:10px 12px">
        <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px">Variant ${i+1} — Hook</div>
        <div style="font-size:var(--text-sm);color:var(--text1);font-weight:600;margin-bottom:6px">${v.hook}</div>
        <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px">Value</div>
        <div style="font-size:var(--text-sm);color:var(--text2);margin-bottom:6px">${v.value}</div>
        <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px">CTA</div>
        <div style="font-size:var(--text-sm);color:var(--teal);font-weight:700;margin-bottom:8px">${v.cta}</div>
        <button class="btn btn-g" style="font-size:var(--text-xs)" onclick='useCampaignVariant(${JSON.stringify(v)})'>Use this variant</button>
      </div>`).join('');
  }catch(e){
    resultsEl.innerHTML=`<div style="font-size:var(--text-xs);color:var(--red)">Got a response but couldn't parse it as JSON. Try again.</div>`;
  }
}
function useCampaignVariant(v){
  document.getElementById('cam-notes').value=`Hook: ${v.hook}\nValue: ${v.value}\nCTA: ${v.cta}`;
  showToast('✓ Variant applied to notes — edit freely before saving');
}
function saveCampaign(){
  const name=document.getElementById('cam-name').value.trim();
  if(!name){showToast('⚠ Campaign name required.');return;}
  const c={
    id:editingCampaignId||Date.now(),
    name,
    client:document.getElementById('cam-client').value.trim(),
    platform:document.getElementById('cam-platform').value.trim(),
    status:document.getElementById('cam-status').value,
    goal:document.getElementById('cam-goal').value.trim(),
    audience:document.getElementById('cam-audience').value.trim(),
    startDate:document.getElementById('cam-start').value,
    endDate:document.getElementById('cam-end').value,
    budget:parseFloat(document.getElementById('cam-budget').value)||0,
    spent:parseFloat(document.getElementById('cam-spent').value)||0,
    results:document.getElementById('cam-results').value.trim(),
    notes:document.getElementById('cam-notes').value.trim(),
  };
  DB.campaigns=DB.campaigns||[];
  const isEdit=!!editingCampaignId;
  if(isEdit){const i=DB.campaigns.findIndex(x=>x.id===editingCampaignId);if(i>=0)DB.campaigns[i]=c;SB.update('campaigns',c.id,c,'campaigns');}
  else{DB.campaigns.unshift(c);SB.upsert('campaigns',c,'campaigns');}
  addHistory(isEdit?'edit':'add',(isEdit?'Edited':'Added')+' campaign: '+c.name,{...c,_dbKey:'campaigns'});
  editingCampaignId=null;
  closeModal('campaignModal');
  renderCampaigns();
  showToast('✓ Campaign saved');
}
async function deleteCampaign(id){
  const targetId=id||editingCampaignId;
  const c=(DB.campaigns||[]).find(x=>x.id===targetId);if(!c)return;
  if(!id&&!await jelixConfirm('Delete "'+c.name+'"?','Delete'))return;
  DB.campaigns=DB.campaigns.filter(x=>x.id!==targetId);
  save('campaigns');SB.remove('campaigns',targetId,'campaigns');
  addHistory('delete','Deleted campaign: '+c.name,{...c,_dbKey:'campaigns'});
  editingCampaignId=null;
  closeModal('campaignModal');
  renderCampaigns();
  showToast('Campaign deleted');
}
function renderCampaigns(){
  // Scope to active client when rendered inside WORK-CS Marketing suite; show all when rendered in Creative Collectives
  const inCS=document.getElementById('cs-marketing')&&document.getElementById('cs-marketing').style.display!=='none';
  const grid=document.getElementById(inCS?'campaignGrid':'ccCampaignGrid');if(!grid)return;
  const items=inCS?(DB.campaigns||[]).filter(c=>csClientMatch(c.client)):(DB.campaigns||[]);
  const statsElId=inCS?null:'ccCampaignStats';
  if(statsElId){
    const statsEl=document.getElementById(statsElId);
    if(statsEl){
      const active=items.filter(c=>c.status==='Active').length;
      const totalBudget=items.reduce((s,c)=>s+(c.budget||0),0);
      const totalSpent=items.reduce((s,c)=>s+(c.spent||0),0);
      statsEl.innerHTML=`<div class="hc"><div class="cl">Total Campaigns</div><div class="cv">${items.length}</div></div><div class="hc"><div class="cl">Active</div><div class="cv" style="color:var(--teal)">${active}</div></div><div class="hc"><div class="cl">Total Budget</div><div class="cv">₱${totalBudget.toLocaleString('en-PH')}</div></div><div class="hc oc"><div class="cl">Spent</div><div class="cv oc">₱${totalSpent.toLocaleString('en-PH')}</div></div>`;
    }
  }
  if(!items.length){grid.innerHTML='<div style="font-size:var(--text-xs);color:var(--text3);grid-column:1/-1;padding:20px;text-align:center">No campaigns yet.</div>';return;}
  const statusColor={Planning:'var(--text3)',Active:'var(--teal)',Paused:'var(--amber)',Completed:'var(--green)'};
  grid.innerHTML=items.map(c=>{
    const sc=statusColor[c.status]||'var(--text3)';
    const spendPct=c.budget?Math.min(100,Math.round((c.spent/c.budget)*100)):0;
    return `<div style="background:var(--navy2);border:1px solid var(--border);border-top:2px solid ${sc};border-radius:10px;padding:14px;cursor:pointer" onclick="openCampaignModal(${c.id})">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
        <div style="font-size:var(--text-sm);font-weight:700;color:var(--text1)">${c.name}</div>
        <span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:8px;background:${sc}22;color:${sc};text-transform:uppercase;flex-shrink:0">${c.status}</span>
      </div>
      <div style="font-size:var(--text-xs);color:var(--teal);margin-bottom:6px">${c.client||''}${c.platform?' · '+c.platform:''}</div>
      ${c.goal?`<div style="font-size:var(--text-xs);color:var(--text3);margin-bottom:8px"><i class="ti ti-target-arrow" style="font-size:10px;margin-right:3px"></i>${c.goal}</div>`:''}
      ${c.budget?`<div style="margin-bottom:6px"><div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text3);margin-bottom:2px"><span>₱${c.spent.toLocaleString()} spent</span><span>₱${c.budget.toLocaleString()} budget</span></div><div style="height:4px;background:var(--navy3);border-radius:6px"><div style="height:100%;width:${spendPct}%;background:${spendPct>90?'var(--red)':sc};border-radius:6px"></div></div></div>`:''}
      ${c.results?`<div style="font-size:var(--text-xs);color:var(--text2);background:var(--hover-tint);border-radius:10px;padding:5px 8px;margin-top:6px">${c.results}</div>`:''}
      <div style="font-size:9px;color:var(--text3);margin-top:8px">${c.startDate||'?'} → ${c.endDate||'ongoing'}</div>
    </div>`;
  }).join('');
}

// ── Influencer Logbook (scoped to active WORK-CS client) ────────────────
let editingInfluencerId=null;
function openInfluencerModal(id){
  editingInfluencerId=id||null;
  const inf=id?(DB.influencers||[]).find(x=>x.id===id):null;
  document.getElementById('influencerModalTitle').textContent=inf?'Edit Influencer':'New Influencer';
  document.getElementById('inf-name').value=inf?inf.name||'':'';
  document.getElementById('inf-platform').value=inf?inf.platform||'':'';
  document.getElementById('inf-handle').value=inf?inf.handle||'':'';
  document.getElementById('inf-followers').value=inf?inf.followers||'':'';
  document.getElementById('inf-rate').value=inf?inf.rate||'':'';
  document.getElementById('inf-status').value=inf?inf.status||'Contacted':'Contacted';
  document.getElementById('inf-contact').value=inf?inf.contact||'':'';
  document.getElementById('inf-notes').value=inf?inf.notes||'':'';
  const delBtn=document.getElementById('inf-delete-btn');if(delBtn)delBtn.style.display=inf?'block':'none';
  openModal('influencerModal');
}
function saveInfluencer(){
  const name=document.getElementById('inf-name').value.trim();
  if(!name){showToast('⚠ Influencer name required.');return;}
  const inf={
    id:editingInfluencerId||Date.now(),
    client:CS_CLIENTS[csActiveClient].label,
    name,
    platform:document.getElementById('inf-platform').value.trim(),
    handle:document.getElementById('inf-handle').value.trim(),
    followers:document.getElementById('inf-followers').value.trim(),
    rate:parseFloat(document.getElementById('inf-rate').value)||0,
    status:document.getElementById('inf-status').value,
    contact:document.getElementById('inf-contact').value.trim(),
    notes:document.getElementById('inf-notes').value.trim(),
  };
  DB.influencers=DB.influencers||[];
  const isEdit=!!editingInfluencerId;
  if(isEdit){const i=DB.influencers.findIndex(x=>x.id===editingInfluencerId);if(i>=0)DB.influencers[i]=inf;SB.update('influencers',inf.id,inf,'influencers');}
  else{DB.influencers.unshift(inf);SB.upsert('influencers',inf,'influencers');}
  addHistory(isEdit?'edit':'add',(isEdit?'Edited':'Added')+' influencer: '+inf.name,{...inf,_dbKey:'influencers'});
  editingInfluencerId=null;
  closeModal('influencerModal');
  renderInfluencers();
  showToast('✓ Influencer saved');
}
async function deleteInfluencer(id){
  const targetId=id||editingInfluencerId;
  const inf=(DB.influencers||[]).find(x=>x.id===targetId);if(!inf)return;
  if(!await jelixConfirm('Delete "'+inf.name+'"?','Delete'))return;
  DB.influencers=DB.influencers.filter(x=>x.id!==targetId);
  save('influencers');SB.remove('influencers',targetId,'influencers');
  addHistory('delete','Deleted influencer: '+inf.name,{...inf,_dbKey:'influencers'});
  editingInfluencerId=null;
  closeModal('influencerModal');
  renderInfluencers();
  showToast('Influencer deleted');
}
function renderInfluencers(){
  const tbody=document.getElementById('influencerTbody');if(!tbody)return;
  const items=(DB.influencers||[]).filter(inf=>csClientMatch(inf.client));
  const emptyEl=document.getElementById('influencerEmpty');
  if(!items.length){tbody.innerHTML='';if(emptyEl)emptyEl.style.display='';return;}
  if(emptyEl)emptyEl.style.display='none';
  const statusColor={Contacted:'var(--text3)',Negotiating:'var(--amber)',Confirmed:'var(--teal)',Posted:'var(--green)',Paid:'var(--green)'};
  tbody.innerHTML=items.map(inf=>`<tr onclick="openInfluencerModal(${inf.id})" style="cursor:pointer">
    <td style="font-weight:600">${inf.name}</td>
    <td style="font-size:var(--text-xs)">${inf.platform||'—'}</td>
    <td style="font-size:var(--text-xs);color:var(--teal)">${inf.handle||'—'}</td>
    <td style="font-size:var(--text-xs)">${inf.followers||'—'}</td>
    <td style="font-size:var(--text-xs)">${inf.rate?'₱'+inf.rate.toLocaleString():'—'}</td>
    <td><span class="pill" style="font-size:var(--text-xs);background:${statusColor[inf.status]}22;color:${statusColor[inf.status]}">${inf.status}</span></td>
    <td><button class="btn btn-d" style="padding:2px 6px" onclick="event.stopPropagation();deleteInfluencer(${inf.id})"><i class="ti ti-trash" style="font-size:var(--text-xs);line-height:1;display:block"></i></button></td>
  </tr>`).join('');
}

// ── Pricing Monitor (scoped to active WORK-CS client) ────────────────────
let editingPricingId=null;
function updateMarginPreview(){
  const cost=parseFloat(document.getElementById('prc-cost').value)||0;
  const price=parseFloat(document.getElementById('prc-price').value)||0;
  const el=document.getElementById('prc-margin-preview');if(!el)return;
  if(!price){el.textContent='';return;}
  const margin=((price-cost)/price*100).toFixed(1);
  el.textContent=`Margin: ${margin}% (₱${(price-cost).toFixed(2)} per unit)`;
}
function openPricingModal(id){
  editingPricingId=id||null;
  const p=id?(DB.pricing||[]).find(x=>x.id===id):null;
  document.getElementById('pricingModalTitle').textContent=p?'Edit Pricing Item':'New Pricing Item';
  document.getElementById('prc-item').value=p?p.item||'':'';
  document.getElementById('prc-cost').value=p?p.cost||'':'';
  document.getElementById('prc-price').value=p?p.price||'':'';
  document.getElementById('prc-notes').value=p?p.notes||'':'';
  updateMarginPreview();
  const delBtn=document.getElementById('prc-delete-btn');if(delBtn)delBtn.style.display=p?'block':'none';
  openModal('pricingModal');
}
function savePricing(){
  const item=document.getElementById('prc-item').value.trim();
  if(!item){showToast('⚠ Item name required.');return;}
  const p={
    id:editingPricingId||Date.now(),
    client:CS_CLIENTS[csActiveClient].label,
    item,
    cost:parseFloat(document.getElementById('prc-cost').value)||0,
    price:parseFloat(document.getElementById('prc-price').value)||0,
    notes:document.getElementById('prc-notes').value.trim(),
    updated:localDateStr(new Date()),
  };
  DB.pricing=DB.pricing||[];
  const isEdit=!!editingPricingId;
  if(isEdit){const i=DB.pricing.findIndex(x=>x.id===editingPricingId);if(i>=0)DB.pricing[i]=p;SB.update('pricing',p.id,p,'pricing');}
  else{DB.pricing.unshift(p);SB.upsert('pricing',p,'pricing');}
  addHistory(isEdit?'edit':'add',(isEdit?'Edited':'Added')+' pricing item: '+p.item,{...p,_dbKey:'pricing'});
  editingPricingId=null;
  closeModal('pricingModal');
  renderPricing();
  showToast('✓ Pricing saved');
}
async function deletePricing(id){
  const targetId=id||editingPricingId;
  const p=(DB.pricing||[]).find(x=>x.id===targetId);if(!p)return;
  if(!await jelixConfirm('Delete "'+p.item+'"?','Delete'))return;
  DB.pricing=DB.pricing.filter(x=>x.id!==targetId);
  save('pricing');SB.remove('pricing',targetId,'pricing');
  addHistory('delete','Deleted pricing item: '+p.item,{...p,_dbKey:'pricing'});
  editingPricingId=null;
  closeModal('pricingModal');
  renderPricing();
  showToast('Pricing item deleted');
}
function renderPricing(){
  const tbody=document.getElementById('pricingTbody');if(!tbody)return;
  const items=(DB.pricing||[]).filter(p=>csClientMatch(p.client));
  const emptyEl=document.getElementById('pricingEmpty');
  if(!items.length){tbody.innerHTML='';if(emptyEl)emptyEl.style.display='';return;}
  if(emptyEl)emptyEl.style.display='none';
  tbody.innerHTML=items.map(p=>{
    const margin=p.price?(((p.price-p.cost)/p.price)*100):0;
    const marginColor=margin>=50?'var(--green)':margin>=25?'var(--amber)':'var(--red)';
    return `<tr onclick="openPricingModal(${p.id})" style="cursor:pointer">
      <td style="font-weight:600">${p.item}</td>
      <td style="font-size:var(--text-xs)">₱${p.cost.toLocaleString()}</td>
      <td style="font-size:var(--text-xs)">₱${p.price.toLocaleString()}</td>
      <td style="font-size:var(--text-xs);font-weight:700;color:${marginColor}">${margin.toFixed(1)}%</td>
      <td style="font-size:var(--text-xs);color:var(--text3)">${p.updated||'—'}</td>
      <td><button class="btn btn-d" style="padding:2px 6px" onclick="event.stopPropagation();deletePricing(${p.id})"><i class="ti ti-trash" style="font-size:var(--text-xs);line-height:1;display:block"></i></button></td>
    </tr>`;
  }).join('');
}

// ── Credentials Vault — usernames/links only, no passwords (policy decision) ──
let editingCredentialId=null;
function openCredentialModal(id){
  editingCredentialId=id||null;
  const c=id?(DB.credentials||[]).find(x=>x.id===id):null;
  document.getElementById('credentialModalTitle').textContent=c?'Edit Credential':'New Credential';
  document.getElementById('cred-platform').value=c?c.platform||'':'';
  document.getElementById('cred-username').value=c?c.username||'':'';
  document.getElementById('cred-link').value=c?c.link||'':'';
  document.getElementById('cred-notes').value=c?c.notes||'':'';
  const delBtn=document.getElementById('cred-delete-btn');if(delBtn)delBtn.style.display=c?'block':'none';
  openModal('credentialModal');
}
function saveCredential(){
  const platform=document.getElementById('cred-platform').value.trim();
  if(!platform){showToast('⚠ Platform name required.');return;}
  const c={
    id:editingCredentialId||Date.now(),
    client:CS_CLIENTS[csActiveClient].label,
    platform,
    username:document.getElementById('cred-username').value.trim(),
    link:document.getElementById('cred-link').value.trim(),
    notes:document.getElementById('cred-notes').value.trim(),
  };
  DB.credentials=DB.credentials||[];
  const isEdit=!!editingCredentialId;
  if(isEdit){const i=DB.credentials.findIndex(x=>x.id===editingCredentialId);if(i>=0)DB.credentials[i]=c;SB.update('credentials',c.id,c,'credentials');}
  else{DB.credentials.unshift(c);SB.upsert('credentials',c,'credentials');}
  addHistory(isEdit?'edit':'add',(isEdit?'Edited':'Added')+' credential: '+c.platform,{...c,_dbKey:'credentials'});
  editingCredentialId=null;
  closeModal('credentialModal');
  renderCredentials();
  showToast('✓ Credential saved');
}
async function deleteCredential(id){
  const targetId=id||editingCredentialId;
  const c=(DB.credentials||[]).find(x=>x.id===targetId);if(!c)return;
  if(!id&&!await jelixConfirm('Delete "'+c.platform+'"?','Delete'))return;
  DB.credentials=DB.credentials.filter(x=>x.id!==targetId);
  save('credentials');SB.remove('credentials',targetId,'credentials');
  addHistory('delete','Deleted credential: '+c.platform,{...c,_dbKey:'credentials'});
  editingCredentialId=null;
  closeModal('credentialModal');
  renderCredentials();
  showToast('Credential deleted');
}
function renderCredentials(){
  const grid=document.getElementById('credentialGrid');if(!grid)return;
  const items=(DB.credentials||[]).filter(c=>csClientMatch(c.client));
  if(!items.length){grid.innerHTML='<div style="font-size:var(--text-xs);color:var(--text3);grid-column:1/-1;padding:20px;text-align:center">No credentials logged yet.</div>';return;}
  grid.innerHTML=items.map(c=>`<div style="background:var(--navy2);border:1px solid var(--border);border-radius:8px;padding:12px;cursor:pointer" onclick="openCredentialModal(${c.id})">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><i class="ti ti-key" style="color:var(--amber);font-size:13px"></i><span style="font-size:var(--text-sm);font-weight:700;color:var(--text1)">${c.platform}</span></div>
    ${c.username?`<div style="font-size:var(--text-xs);color:var(--text2);margin-bottom:3px">${c.username}</div>`:''}
    ${c.link?`<a href="${c.link}" target="_blank" onclick="event.stopPropagation()" style="font-size:var(--text-xs);color:var(--teal);display:inline-flex;align-items:center;gap:3px;text-decoration:none"><i class="ti ti-external-link" style="font-size:10px"></i>Open login</a>`:''}
  </div>`).join('');
}

function openFaithModal(id){editingFaithId=id||null;window._pendingFaithTaskId=null;const a=id?DB.faith.find(x=>x.id===id):null;document.getElementById('faithModalTitle').textContent=a?'Edit Activity':'Add Activity';['activity','group','date','submitted','cfo','aevm','status','assigned','drive'].forEach(f=>{const el=document.getElementById('fa-'+f);if(el)el.value=a?(a[f]||''):'';});renderFaithTaskLinkRow();openModal('faithModal');}
function saveFaithActivity(){const a={id:editingFaithId||Date.now(),activity:document.getElementById('fa-activity').value.trim(),group:document.getElementById('fa-group').value.trim(),date:document.getElementById('fa-date').value,submitted:document.getElementById('fa-submitted').value,cfo:document.getElementById('fa-cfo').value.trim(),aevm:document.getElementById('fa-aevm').value.trim(),status:document.getElementById('fa-status').value,assigned:document.getElementById('fa-assigned').value.trim(),drive:document.getElementById('fa-drive').value.trim()};if(!a.activity){showToast('Activity name required');return;}const isEdit=!!editingFaithId;const existing=isEdit?DB.faith.find(x=>x.id===editingFaithId):null;a.calEventId=existing?existing.calEventId:null;a.taskId=existing?existing.taskId:(window._pendingFaithTaskId||null);window._pendingFaithTaskId=null;if(editingFaithId){const i=DB.faith.findIndex(x=>x.id===editingFaithId);if(i>=0)DB.faith[i]=a;SB.update('faith',a.id,a,'faith');}else{DB.faith.unshift(a);SB.upsert('faith',a,'faith');}syncFaithToCalendar(a);addHistory(isEdit?'edit':'add',(isEdit?'Edited':'Added')+' faith: '+a.activity,{...a,_dbKey:'faith'});closeModal('faithModal');renderFaith();showToast('✓ Activity saved');}
function renderFaithTaskLinkRow(){
  const el=document.getElementById('fa-task-link-row');if(!el)return;
  const a=editingFaithId?DB.faith.find(x=>x.id===editingFaithId):null;
  const linkedTask=a&&a.taskId?DB.tasks.find(t=>t.id===a.taskId):null;
  if(linkedTask){
    el.innerHTML=`<div style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--teal3);border:1px solid var(--teal2);border-radius:8px">
      <i class="ti ti-checklist" style="color:var(--teal);font-size:15px"></i>
      <span style="flex:1;font-size:var(--text-sm);color:var(--text1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Linked: ${linkedTask.title}</span>
      <span onclick="editTask(${linkedTask.id})" style="font-size:var(--text-xs);color:var(--teal);cursor:pointer">Open</span>
      <span onclick="unlinkFaithTask()" style="font-size:var(--text-xs);color:var(--red);cursor:pointer">Unlink</span>
    </div>`;
  }else{
    el.innerHTML=`<div onclick="createTaskFromFaith()" style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--hover-tint);border:1px dashed var(--border2);border-radius:8px;cursor:pointer;justify-content:center">
      <i class="ti ti-checklist-plus" style="color:var(--text3);font-size:15px"></i>
      <span style="font-size:var(--text-sm);color:var(--text3)">Create linked task in FAITH</span>
    </div>`;
  }
}
function createTaskFromFaith(){
  const activity=document.getElementById('fa-activity').value.trim();
  if(!activity){showToast('⚠ Name the activity first.');return;}
  const t={id:Date.now(),title:activity,world:'FAITH',priority:'Medium',status:'Todo',due:document.getElementById('fa-date').value||'',notes:'Linked from Faith activity: '+(document.getElementById('fa-group').value.trim()||'')};
  DB.tasks.unshift(t);
  SB.upsert('tasks',t,'tasks');
  addHistory('add','Created task from faith activity: '+t.title,{...t,_dbKey:'tasks'});
  if(editingFaithId){
    const a=DB.faith.find(x=>x.id===editingFaithId);
    if(a){a.taskId=t.id;SB.update('faith',a.id,{taskId:t.id},'faith');}
  }else{
    // Not yet saved as an activity — stash the pending link, applied on save
    window._pendingFaithTaskId=t.id;
  }
  renderTasks();
  renderFaithTaskLinkRow();
  showToast('✓ Task created and linked');
}
function unlinkFaithTask(){
  if(!editingFaithId)return;
  const a=DB.faith.find(x=>x.id===editingFaithId);
  if(a){a.taskId=null;SB.update('faith',a.id,{taskId:null},'faith');}
  renderFaithTaskLinkRow();
  showToast('Task unlinked');
}
// Faith → Calendar sync: activities with a date get a linked, editable calendar event.
// Title/date stay representative on Faith edits; everything else (time, location, notes)
// is independently editable on the calendar side once created — no ongoing two-way lock.
function syncFaithToCalendar(a){
  if(!a.date){
    // No date (or date removed) — if there was a linked event, remove it so it doesn't dangle
    if(a.calEventId){
      DB.calEvents=DB.calEvents.filter(e=>e.id!==a.calEventId);
      SB.remove('cal_events',a.calEventId,'calEvents');
      a.calEventId=null;
    }
    return;
  }
  const linked=a.calEventId?DB.calEvents.find(e=>e.id===a.calEventId):null;
  if(linked){
    linked.title='Faith: '+a.activity;
    linked.date=a.date;
    SB.update('cal_events',linked.id,linked,'calEvents');
    save('calEvents');
  }else{
    const ev={id:Date.now()+Math.floor(Math.random()*1000),title:'Faith: '+a.activity,date:a.date,time:'',endTime:'',type:'fth',loc:'',notes:a.group?('Group: '+a.group):'',_sourceFaithId:a.id};
    DB.calEvents.push(ev);
    save('calEvents');
    SB.upsert('cal_events',ev,'calEvents');
    a.calEventId=ev.id;
    save('faith');
    SB.update('faith',a.id,a,'faith');
  }
  if(typeof renderCalendar==='function')renderCalendar();
}
function deleteFaith(id){const a=DB.faith.find(x=>x.id===id);DB.faith=DB.faith.filter(x=>x.id!==id);SB.remove('faith',id,'faith');if(a&&a.calEventId){DB.calEvents=DB.calEvents.filter(e=>e.id!==a.calEventId);SB.remove('cal_events',a.calEventId,'calEvents');save('calEvents');}addHistory('delete','Deleted faith: '+a.activity,{...a,_dbKey:'faith'});renderFaith();if(typeof renderCalendar==='function')renderCalendar();showToast('Deleted');}
function renderFaith(){renderDomainTimerCard('faith');
  const tb=document.getElementById('faithTbody'),em=document.getElementById('faithEmpty');
  if(!DB.faith.length){tb.innerHTML='';em.style.display='';return;}
  em.style.display='none';
  const isMobile=window.innerWidth<=768;
  const statusPill=f=>`<span class="pill ${f.status==='Done'||f.status==='Approved'?'pg':f.status==='Submitted'?'pt':f.status==='Rejected'?'pr':'po'}" style="font-size:var(--text-sm)">${f.status}</span>`;
  if(isMobile){
    tb.innerHTML=DB.faith.map(f=>`<tr onclick="openFaithModal(${f.id})" style="cursor:pointer"><td colspan="10" style="padding:12px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
        <div><div style="font-size:var(--text-sm);font-weight:700;color:var(--text1)">${f.activity}</div><div style="font-size:var(--text-xs);color:var(--text3);margin-top:2px">${f.group||'—'}</div></div>
        ${statusPill(f)}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:var(--text-xs);color:var(--text3)">
        <span><i class="ti ti-calendar" style="font-size:10px"></i> ${f.date||'—'}</span>
        <span>CFO ${f.cfo||'—'}</span>
        <span>AEVM ${f.aevm||'—'}</span>
        ${f.assigned?`<span><i class="ti ti-user" style="font-size:10px"></i> ${f.assigned}</span>`:''}
        ${f.drive?`<a href="${f.drive}" target="_blank" onclick="event.stopPropagation()" style="color:var(--teal)"><i class="ti ti-brand-google-drive" style="font-size:10px"></i> Drive</a>`:''}
      </div>
    </td></tr>`).join('');
  }else{
    tb.innerHTML=DB.faith.map((f,i)=>`<tr data-id="${f.id}" draggable="true" onclick="openFaithModal(${f.id})"><td style="font-weight:500"><i class="ti ti-grip-vertical drag-grip-desktop" style="font-size:var(--text-xs);color:var(--text3);margin-right:6px;vertical-align:middle;cursor:grab" onclick="event.stopPropagation()"></i><span class="reorder-mobile-btns" style="display:none;gap:2px;margin-right:6px"><button onclick="event.stopPropagation();moveArrayItem('faith',${f.id},-1,renderFaith)" ${i===0?'disabled':''} style="background:transparent;border:none;color:var(--text3);cursor:pointer;padding:0"><i class="ti ti-chevron-up" style="font-size:11px;line-height:1;display:block"></i></button><button onclick="event.stopPropagation();moveArrayItem('faith',${f.id},1,renderFaith)" ${i===DB.faith.length-1?'disabled':''} style="background:transparent;border:none;color:var(--text3);cursor:pointer;padding:0"><i class="ti ti-chevron-down" style="font-size:11px;line-height:1;display:block"></i></button></span>${f.group||'—'}</td><td style="font-size:var(--text-sm)">${f.activity}</td><td style="font-size:var(--text-sm);color:var(--text3)">${f.date||'—'}</td><td style="font-size:var(--text-sm);color:var(--text3)">${f.submitted||'—'}</td><td style="font-size:var(--text-sm)">${f.cfo||'—'}</td><td style="font-size:var(--text-sm)">${f.aevm||'—'}</td><td>${statusPill(f)}</td><td style="font-size:var(--text-sm)">${f.assigned||'—'}</td><td>${f.drive?`<a href="${f.drive}" target="_blank" onclick="event.stopPropagation()" style="color:var(--teal);font-size:var(--text-sm);display:inline-flex;align-items:center;gap:3px"><i class="ti ti-brand-google-drive" style="font-size:var(--text-sm);line-height:1;display:block"></i>Open</a>`:'—'}</td><td><button class="btn btn-d" style="padding:2px 6px" onclick="event.stopPropagation();deleteFaith(${f.id})"><i class="ti ti-trash" style="font-size:var(--text-xs);line-height:1;display:block"></i></button></td></tr>`).join('');
    initArrayDragSort('faithTbody','faith',renderFaith);
  }
  document.getElementById('faithTotal').textContent=DB.faith.length;
  document.getElementById('faithApproved').textContent=DB.faith.filter(f=>f.status==='Approved'||f.status==='Done').length;
  document.getElementById('faithSubmitted').textContent=DB.faith.filter(f=>f.status==='Submitted').length;
  document.getElementById('faithPending').textContent=DB.faith.filter(f=>f.status==='Pending').length;
}

// ── Faith tab navigation ──────────────────────────────────────────────────
function setFaithTab(tab,btn){
  ['activities','officers','topics','meetings','calendar'].forEach(t=>{
    const el=document.getElementById('faith-'+t);if(el)el.style.display=t===tab?'':'none';
  });
  document.querySelectorAll('.cfbt[id^="ftab-"]').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  const addBtn=document.getElementById('faithAddBtn');
  if(addBtn){
    if(tab==='officers'){addBtn.innerHTML='<i class="ti ti-plus"></i> Officer';addBtn.onclick=openOfficerModal;addBtn.style.display='';}
    else if(tab==='topics'){addBtn.innerHTML='<i class="ti ti-plus"></i> Topic';addBtn.onclick=openTopicModal;addBtn.style.display='';}
    else if(tab==='meetings'){addBtn.innerHTML='<i class="ti ti-microphone"></i> Record';addBtn.onclick=()=>document.querySelector('#meetingsPanel-FAITH [id^="meetRecBtn-"]')?.click();addBtn.style.display='';}
    else if(tab==='calendar'){addBtn.style.display='none';}
    else{addBtn.innerHTML='<i class="ti ti-plus"></i> Activity';addBtn.onclick=openFaithModal;addBtn.style.display='';}
  }
  if(tab==='officers') renderOfficers();
  if(tab==='topics') renderFaithTopics();
  if(tab==='meetings') renderMeetingsPanel('meetingsPanel-FAITH','FAITH');
  if(tab==='calendar'){faithCalOffset=0;renderFaithCalendar();}
}
let faithCalOffset=0;
let _domainCalOffsets={sid:0,bld:0,ven:0};
// Generic domain mini-calendar — used by Creative/Code/Job Collectives, same pattern as Faith's.
function renderDomainCalendar(domainKey,gridId,labelId,typeFilter,accentColor,accentVar){
  const grid=document.getElementById(gridId);const label=document.getElementById(labelId);
  if(!grid||!label)return;
  const now=new Date();
  const offset=_domainCalOffsets[domainKey]||0;
  const viewDate=new Date(now.getFullYear(),now.getMonth()+offset,1);
  const y=viewDate.getFullYear(),m=viewDate.getMonth();
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  label.textContent=MONTHS[m]+' '+y;
  const first=new Date(y,m,1).getDay();
  const days=new Date(y,m+1,0).getDate();
  const prev=new Date(y,m,0).getDate();
  const today=localDateStr(new Date());
  const from=localDateStr(new Date(y,m,1));
  const to=localDateStr(new Date(y,m+1,0));
  const domainEvents=expandRecurring((DB.calEvents||[]).filter(e=>normaliseType(e.type)===typeFilter),from,to);
  let html='';
  'SMTWTFS'.split('').forEach(d=>html+=`<div style="font-size:var(--text-xs);text-align:center;color:var(--text3);font-weight:700;padding:4px">${d}</div>`);
  for(let i=0;i<first;i++)html+=`<div style="opacity:.2;padding:8px;font-size:var(--text-xs)">${prev-(first-1-i)}</div>`;
  for(let d=1;d<=days;d++){
    const ds=y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    const isT=ds===today;
    const dayEvents=domainEvents.filter(e=>(e._expandedDate||e.date)===ds);
    html+=`<div onclick="setView('calendar');calSelectedDate='${ds}';setCalView('day')" style="min-height:74px;padding:6px;border:1px solid var(--border);border-radius:12px;cursor:pointer;background:${isT?accentColor+'14':'var(--navy2)'};display:flex;flex-direction:column;gap:3px">
      <div style="font-size:var(--text-xs);font-weight:${isT?800:600};color:${isT?accentVar:'var(--text2)'}">${d}</div>
      ${dayEvents.slice(0,2).map(e=>`<div style="font-size:9px;padding:1px 4px;background:${accentColor}1e;border-left:2px solid ${accentVar};border-radius:6px;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e.title}</div>`).join('')}
      ${dayEvents.length>2?`<div style="font-size:9px;color:var(--text3)">+${dayEvents.length-2} more</div>`:''}
    </div>`;
  }
  grid.innerHTML=html;
}
function shiftDomainCal(domainKey,dir,renderFn){
  _domainCalOffsets[domainKey]=(_domainCalOffsets[domainKey]||0)+dir;
  renderFn();
}
function renderFaithCalendar(){
  const grid=document.getElementById('faithCalGrid');const label=document.getElementById('faithCalLabel');
  if(!grid||!label)return;
  const now=new Date();
  const viewDate=new Date(now.getFullYear(),now.getMonth()+faithCalOffset,1);
  const y=viewDate.getFullYear(),m=viewDate.getMonth();
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  label.textContent=MONTHS[m]+' '+y;
  const first=new Date(y,m,1).getDay();
  const days=new Date(y,m+1,0).getDate();
  const prev=new Date(y,m,0).getDate();
  const today=localDateStr(new Date());
  const from=localDateStr(new Date(y,m,1));
  const to=localDateStr(new Date(y,m+1,0));
  // Faith calendar events (type='fth'), plus faith activities that don't yet have a linked event
  const faithEvents=expandRecurring((DB.calEvents||[]).filter(e=>e.type==='fth'),from,to);
  let html='';
  'SMTWTFS'.split('').forEach(d=>html+=`<div style="font-size:var(--text-xs);text-align:center;color:var(--text3);font-weight:700;padding:4px">${d}</div>`);
  for(let i=0;i<first;i++)html+=`<div style="opacity:.2;padding:8px;font-size:var(--text-xs)">${prev-(first-1-i)}</div>`;
  for(let d=1;d<=days;d++){
    const ds=y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    const isT=ds===today;
    const dayEvents=faithEvents.filter(e=>(e._expandedDate||e.date)===ds);
    html+=`<div onclick="setView('calendar');calSelectedDate='${ds}';setCalView('day')" style="min-height:74px;padding:6px;border:1px solid var(--border);border-radius:12px;cursor:pointer;background:${isT?'rgba(168,85,247,.08)':'var(--navy2)'};display:flex;flex-direction:column;gap:3px">
      <div style="font-size:var(--text-xs);font-weight:${isT?800:600};color:${isT?'var(--purple)':'var(--text2)'}">${d}</div>
      ${dayEvents.slice(0,2).map(e=>`<div style="font-size:9px;padding:1px 4px;background:rgba(168,85,247,.12);border-left:2px solid var(--purple);border-radius:6px;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e.title.replace(/^Faith:\s*/,'')}</div>`).join('')}
      ${dayEvents.length>2?`<div style="font-size:9px;color:var(--text3)">+${dayEvents.length-2} more</div>`:''}
    </div>`;
  }
  grid.innerHTML=html;
}
function exportFaithData(){const rows=DB.faith.map(f=>[f.group,f.activity,f.date,f.submitted,f.cfo,f.aevm,f.status,f.assigned].join(','));const csv='Group,Activity,Date,Submitted,CFO,AEVM,Status,Assigned\n'+rows.join('\n');const b=new Blob([csv],{type:'text/csv'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download='faith-activities.csv';a.click();URL.revokeObjectURL(u);}

// ── Touch-friendly reorder (drag-and-drop doesn't fire on touchscreens) ──
function moveArrayItem(dbKey,id,dir,renderFn){
  const arr=DB[dbKey];
  const idx=arr.findIndex(x=>String(x.id)===String(id));
  if(idx<0)return;
  const newIdx=idx+dir;
  if(newIdx<0||newIdx>=arr.length)return;
  [arr[idx],arr[newIdx]]=[arr[newIdx],arr[idx]];
  save(dbKey);
  if(typeof renderFn==='function')renderFn();
}

// ── Generic array drag-and-drop reorder (used by Faith Activities/Officers) ──
function initArrayDragSort(tbodyId,dbKey,renderFn){
  const tbody=document.getElementById(tbodyId);
  if(!tbody)return;
  let dragSrcId=null;
  tbody.querySelectorAll('tr[data-id]').forEach(row=>{
    row.addEventListener('dragstart',function(e){
      dragSrcId=this.dataset.id;
      this.style.opacity='.4';
      e.dataTransfer.effectAllowed='move';
    });
    row.addEventListener('dragend',function(){this.style.opacity='1';dragSrcId=null;});
    row.addEventListener('dragover',function(e){e.preventDefault();e.dataTransfer.dropEffect='move';this.style.background='rgba(128,255,250,.06)';});
    row.addEventListener('dragleave',function(){this.style.background='';});
    row.addEventListener('drop',function(e){
      e.preventDefault();this.style.background='';
      const targetId=this.dataset.id;
      if(dragSrcId===null||dragSrcId===targetId)return;
      const arr=DB[dbKey];
      const srcIdx=arr.findIndex(x=>String(x.id)===String(dragSrcId));
      const targetIdx=arr.findIndex(x=>String(x.id)===String(targetId));
      if(srcIdx<0||targetIdx<0)return;
      const [moved]=arr.splice(srcIdx,1);
      const newTargetIdx=arr.findIndex(x=>String(x.id)===String(targetId));
      arr.splice(newTargetIdx,0,moved);
      save(dbKey);
      if(typeof renderFn==='function')renderFn();
      showToast('✓ Reordered');
    });
  });
}

// ── Officers ──────────────────────────────────────────────────────────────
if(!DB.officers)DB.officers=[];
let editingOfficerId=null;
function openOfficerModal(id){
  editingOfficerId=id||null;
  const o=id?DB.officers.find(x=>x.id===id):{};
  document.getElementById('officerModalTitle').textContent=id?'Edit Officer':'Add Officer';
  ['name','duty','contact','facebook','purok','committee','address'].forEach(f=>{const el=document.getElementById('of-'+f);if(el)el.value=o?o[f]||'':'';});
  const oathEl=document.getElementById('of-oath');if(oathEl)oathEl.value=o?o.oath||'':'';
  openModal('officerModal');
}
function saveOfficer(){
  const name=document.getElementById('of-name').value.trim();
  if(!name){showToast('Name required');return;}
  const o={
    id:editingOfficerId||Date.now(),
    name,
    duty:document.getElementById('of-duty').value.trim(),
    contact:document.getElementById('of-contact').value.trim(),
    facebook:document.getElementById('of-facebook').value.trim(),
    address:document.getElementById('of-address').value.trim(),
    purok:document.getElementById('of-purok').value.trim(),
    committee:document.getElementById('of-committee').value.trim(),
    oath:document.getElementById('of-oath').value,
    date:localDateStr(new Date())
  };
  if(editingOfficerId){const i=DB.officers.findIndex(x=>x.id===editingOfficerId);if(i>=0)DB.officers[i]=o;}
  else DB.officers.unshift(o);
  save('officers');closeModal('officerModal');renderOfficers();showToast('✓ Officer saved');
}
async function deleteOfficer(id){if(!await jelixConfirm('Delete this officer?','Delete'))return;DB.officers=DB.officers.filter(x=>x.id!==id);save('officers');renderOfficers();showToast('Deleted');}
function renderOfficers(){
  const tb=document.getElementById('officerTbody');if(!tb)return;
  if(!DB.officers.length){tb.innerHTML='<tr><td colspan="9" style="text-align:center;color:var(--text3);font-size:var(--text-sm);padding:20px">No officers yet. Click "+ Add Officer" to begin.</td></tr>';return;}
  const isMobile=window.innerWidth<=768;
  if(isMobile){
    tb.innerHTML=DB.officers.map(o=>`<tr onclick="openOfficerModal(${o.id})" style="cursor:pointer"><td colspan="9" style="padding:12px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
        <div style="font-size:var(--text-sm);font-weight:700;color:var(--text1)">${o.name}</div>
        <span class="pill pt" style="font-size:var(--text-xs)">${o.duty||'—'}</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:var(--text-xs);color:var(--text3)">
        ${o.contact?`<span><i class="ti ti-phone" style="font-size:10px"></i> ${o.contact}</span>`:''}
        ${o.purok?`<span>${o.purok}</span>`:''}
        ${o.committee?`<span>${o.committee}</span>`:''}
        ${o.facebook?`<a href="${o.facebook.startsWith('http')?o.facebook:'https://'+o.facebook}" target="_blank" onclick="event.stopPropagation()" style="color:var(--teal)">Facebook</a>`:''}
      </div>
      ${o.address?`<div style="font-size:var(--text-xs);color:var(--text3);margin-top:4px">${o.address}</div>`:''}
    </td></tr>`).join('');
    return;
  }
  tb.innerHTML=DB.officers.map((o,i)=>`<tr data-id="${o.id}" draggable="true" onclick="openOfficerModal(${o.id})" style="cursor:pointer">
    <td style="font-weight:600;color:var(--text1)"><i class="ti ti-grip-vertical drag-grip-desktop" style="font-size:var(--text-xs);color:var(--text3);margin-right:6px;vertical-align:middle;cursor:grab" onclick="event.stopPropagation()"></i><span class="reorder-mobile-btns" style="display:none;gap:2px;margin-right:6px"><button onclick="event.stopPropagation();moveArrayItem('officers',${o.id},-1,renderOfficers)" ${i===0?'disabled':''} style="background:transparent;border:none;color:var(--text3);cursor:pointer;padding:0"><i class="ti ti-chevron-up" style="font-size:11px;line-height:1;display:block"></i></button><button onclick="event.stopPropagation();moveArrayItem('officers',${o.id},1,renderOfficers)" ${i===DB.officers.length-1?'disabled':''} style="background:transparent;border:none;color:var(--text3);cursor:pointer;padding:0"><i class="ti ti-chevron-down" style="font-size:11px;line-height:1;display:block"></i></button></span>${o.name}</td>
    <td><span class="pill pt" style="font-size:var(--text-xs)">${o.duty||'—'}</span></td>
    <td style="font-size:var(--text-xs)">${o.contact||'—'}</td>
    <td style="font-size:var(--text-xs)">${o.facebook?`<a href="${o.facebook.startsWith('http')?o.facebook:'https://'+o.facebook}" target="_blank" onclick="event.stopPropagation()" style="color:var(--teal)">View</a>`:'—'}</td>
    <td style="font-size:var(--text-xs);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${o.address||'—'}</td>
    <td style="font-size:var(--text-xs)">${o.purok||'—'}</td>
    <td style="font-size:var(--text-xs)">${o.committee||'—'}</td>
    <td style="font-size:var(--text-xs)">${o.oath||'—'}</td>
    <td><button class="btn btn-d" style="padding:2px 6px" onclick="event.stopPropagation();deleteOfficer(${o.id})"><i class="ti ti-trash" style="font-size:var(--text-xs);line-height:1;display:block"></i></button></td>
  </tr>`).join('');
  initArrayDragSort('officerTbody','officers',renderOfficers);
}

// ── Topics ────────────────────────────────────────────────────────────────
if(!DB.faithTopics)DB.faithTopics=[];
let editingTopicId=null;
function openTopicModal(id){
  editingTopicId=id||null;
  const t=id?DB.faithTopics.find(x=>x.id===id):{};
  document.getElementById('topicModalTitle').textContent=id?'Edit Topic':'New Topic';
  ['title','notes','drive'].forEach(f=>{const el=document.getElementById('tp-'+f);if(el)el.value=t?t[f]||'':'';});
  const catEl=document.getElementById('tp-cat');if(catEl)catEl.value=t?t.category||'Leadership':'Leadership';
  const dateEl=document.getElementById('tp-date');if(dateEl)dateEl.value=t?t.date||localDateStr(new Date()):localDateStr(new Date());
  openModal('topicModal');
}
function saveFaithTopic(){
  const title=document.getElementById('tp-title').value.trim();
  if(!title){showToast('Topic title required');return;}
  const t={
    id:editingTopicId||Date.now(),
    title,
    category:document.getElementById('tp-cat').value,
    date:document.getElementById('tp-date').value,
    notes:document.getElementById('tp-notes').value.trim(),
    drive:document.getElementById('tp-drive').value.trim(),
    type:'manual'
  };
  if(editingTopicId){const i=DB.faithTopics.findIndex(x=>x.id===editingTopicId);if(i>=0)DB.faithTopics[i]=t;}
  else DB.faithTopics.unshift(t);
  save('faithTopics');closeModal('topicModal');renderFaithTopics();showToast('✓ Topic saved');
}
function uploadFaithTopic(event){
  const files=event.target.files;if(!files||!files.length)return;
  Array.from(files).forEach(file=>{
    const t={id:Date.now()+Math.random(),title:file.name.replace(/\.[^.]+$/,''),category:'PNK Session',date:localDateStr(new Date()),notes:'Uploaded document: '+file.name,drive:'',type:'upload',fileName:file.name,fileSize:Math.round(file.size/1024)+'KB'};
    DB.faithTopics.unshift(t);
  });
  save('faithTopics');renderFaithTopics();event.target.value='';showToast('✓ '+files.length+' file(s) uploaded');
}
async function deleteTopic(id){if(!await jelixConfirm('Delete this topic?','Delete'))return;DB.faithTopics=DB.faithTopics.filter(x=>x.id!==id);save('faithTopics');renderFaithTopics();showToast('Deleted');}
function renderFaithTopics(){
  const grid=document.getElementById('faithTopicsGrid');if(!grid)return;
  if(!DB.faithTopics.length){grid.innerHTML='<div style="grid-column:1/-1;text-align:center;color:var(--text3);font-size:var(--text-sm);padding:30px">No topics yet. Upload a document or click "+ New Topic".</div>';return;}
  const catColor=c=>c==='Leadership'?'var(--orange)':c==='Self-Enhancement'?'var(--teal)':c==='Spiritual Growth'?'var(--purple)':c==='Organizational'?'#1A73E8':c==='PNK Session'?'var(--pink)':'var(--text3)';
  grid.innerHTML=DB.faithTopics.map(t=>`
    <div style="background:var(--navy3);border:1px solid var(--border);border-radius:10px;padding:12px 14px;cursor:pointer;transition:all .15s;border-top:2px solid ${catColor(t.category)}" onclick="openTopicModal(${t.id})" onmouseover="this.style.borderColor='var(--purple)'" onmouseout="this.style.borderColor='var(--border)';this.style.borderTopColor='${catColor(t.category)}'">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px;gap:6px">
        <div style="font-size:var(--text-sm);font-weight:700;color:var(--text1);line-height:1.3;flex:1">${t.title}</div>
        <button onclick="event.stopPropagation();deleteTopic(${t.id})" style="background:transparent;border:none;color:var(--text3);cursor:pointer;padding:1px;flex-shrink:0"><i class="ti ti-trash" style="font-size:var(--text-xs);line-height:1;display:block"></i></button>
      </div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px">
        <span style="font-size:var(--text-xs);font-weight:700;color:${catColor(t.category)};border:1px solid ${catColor(t.category)};border-radius:6px;padding:1px 5px">${t.category}</span>
        ${t.type==='upload'?`<span style="font-size:var(--text-xs);color:var(--text3);border:1px solid var(--border2);border-radius:6px;padding:1px 5px">📄 ${t.fileName||'Document'}</span>`:''}
        <span style="font-size:var(--text-xs);color:var(--text3)">${t.date}</span>
      </div>
      ${t.notes?`<div style="font-size:var(--text-xs);color:var(--text3);line-height:1.4;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${t.notes}</div>`:''}
      ${t.drive?`<a href="${t.drive}" target="_blank" onclick="event.stopPropagation()" style="display:inline-flex;align-items:center;gap:4px;margin-top:7px;font-size:var(--text-xs);color:var(--teal);text-decoration:none"><i class="ti ti-brand-google-drive" style="font-size:var(--text-xs);line-height:1;display:block"></i>Open Drive</a>`:''}
    </div>`).join('');
}

// LIFE
let cfActiveTab='overview',cfCharts={};
// The Time Today card is shared across every Life tab (renderLife() mounts
// it once, above the tab bar) but it's only really relevant on Overview —
// on Transactions/Budget/etc it was just permanent overhead above content
// that has nothing to do with time tracking. Force it compact outside
// Overview without touching the user's actual stored full/mini choice, so
// coming back to Overview restores whatever they'd actually picked.
let _cfForceTimerMini=false;
function setCFTab(t,btn){
  cfActiveTab=t;
  _cfForceTimerMini=(t!=='overview');
  refreshDomainTimerDisplay('life');
  // Scroll content to top
  const vb=document.querySelector('#view-life .vb');if(vb)vb.scrollTop=0;
  ['overview','transactions','budget','accounts','property','loans','billtracker','biomonitor'].forEach(tab=>{
    const el=document.getElementById('cf-'+tab);
    if(el) el.style.display=tab===t?'':'none';
  });
  document.querySelectorAll('#view-life .cftab .cfbt').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  if(t==='transactions') renderCashTable();
  else if(t==='overview'){renderCashCharts();renderCashForecast();}
  else if(t==='budget')  renderBudgetTab();
  else if(t==='accounts')renderAccountsTab();
  else if(t==='loans')   renderLoansTab();
  else if(t==='billtracker')renderBillTracker();
  else if(t==='biomonitor'){renderHealth();renderHealthTrend();restoreTodayWellness();}
}


// setCFTab defined below


let editingCashId=null;
function syncDateDisplay(inputId,displayId){
  const inp=document.getElementById(inputId);
  const lbl=document.getElementById(displayId.replace('-display','-label'));
  if(!inp||!lbl)return;
  if(inp.value){
    const d=new Date(inp.value+'T00:00:00');
    lbl.textContent=d.toLocaleDateString('en-PH',{weekday:'short',year:'numeric',month:'long',day:'numeric'});
    lbl.style.color='var(--text1)';
  }else{lbl.textContent='Select date...';lbl.style.color='var(--text3)';}
}
function toggleCashAccountOther(){const v=document.getElementById('ca-account').value;const w=document.getElementById('ca-account-other-wrap');if(w)w.style.display=v==='Other'?'':'none';}
function toggleCashCatOther(){const v=document.getElementById('ca-cat').value;const w=document.getElementById('ca-cat-other-wrap');if(w)w.style.display=v==='Other'?'':'none';}
function openCashModal(type,id){
  editingCashId=id||null;
  const existing=id?DB.cashflow.find(x=>x.id===id):null;
  document.getElementById('cashModalTitle').textContent=existing?'Edit Transaction':'Add '+(type==='Debit'?'Debit':'Credit');
  document.getElementById('ca-type').value=existing?existing.type:(type||'Debit');
  document.getElementById('ca-date').value=existing?existing.date:localDateStr(new Date());
  syncDateDisplay('ca-date','ca-date-display');
  document.getElementById('ca-desc').value=existing?existing.desc:'';
  document.getElementById('ca-amount').value=existing?existing.amount:'';
  document.getElementById('ca-notes').value=existing?(existing.notes||''):'';
  // Account
  const acctSel=document.getElementById('ca-account');
  populateAccountSelect('ca-account',existing?existing.account:'Cash');
  if(!acctSel._acctNewBound){
    acctSel._acctNewBound=true;
    acctSel.addEventListener('change',()=>{
      if(acctSel.value==='__new__'){
        const prev=(existing?existing.account:'Cash')||'Cash';
        promptNewAccount(a=>{populateAccountSelect('ca-account',a.name);});
        if(acctSel.value==='__new__')populateAccountSelect('ca-account',prev); // cancelled — revert
      }
    });
  }
  // Category
  const catSel=document.getElementById('ca-cat');
  const knownCats=['Housing','Food','Transport','Utilities','Business','Health','Entertainment','Income','Loan','Payment','Subscription','Family','Other'];
  if(existing){
    if(knownCats.includes(existing.category)){catSel.value=existing.category;}
    else{catSel.value='Other';}
    document.getElementById('ca-cat-other').value=existing.catNotes||'';
  }else{catSel.value='Other';}
  toggleCashAccountOther();toggleCashCatOther();
  openModal('cashModal');
}
// ── Aliases for mobile-view tap handlers (kept as thin wrappers around the real functions) ──
function editCash(id){openCashModal(null,id);}
function editCashEntry(id){editCash(id);}
function openTaskEdit(id){editTask(id);}
function openCalEventDetail(id){editCalEvent(id);}
function logWaterGlass(){logWater(Math.min(8,(todayWellness.water||0)+1));}

function renderContextEngine(){
  const el=document.getElementById('contextEngineBody');if(!el)return;
  const today=localDateStr(new Date());
  const openTasks=(DB.tasks||[]).filter(t=>t.status!=='Done');
  const highPri=openTasks.filter(t=>t.priority==='High');
  const overdue=openTasks.filter(t=>t.due&&t.due<today);
  const upcomingEvents=expandRecurring(DB.calEvents||[],today,localDateStr(new Date(Date.now()+7*86400000))).slice(0,5);
  const recentMemories=(DB.memories||[]).slice(0,6);
  const worldStats=(DB.worlds||[]).map(w=>({
    label:w.label,
    open:openTasks.filter(t=>t.world===w.id).length,
  })).filter(w=>w.open>0).sort((a,b)=>b.open-a.open).slice(0,5);

  el.innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
      <div class="hc"><div class="cl">Open Tasks</div><div class="cv">${openTasks.length}</div></div>
      <div class="hc"><div class="cl">High Priority</div><div class="cv" style="color:var(--red)">${highPri.length}</div></div>
      <div class="hc"><div class="cl">Overdue</div><div class="cv" style="color:var(--amber)">${overdue.length}</div></div>
      <div class="hc oc"><div class="cl">Memories Logged</div><div class="cv oc">${(DB.memories||[]).length}</div></div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div class="hc">
        <div style="font-size:var(--text-xs);font-weight:700;color:var(--teal);letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px">Active Load by Domain</div>
        ${worldStats.length?worldStats.map(w=>`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:var(--text-xs)"><span style="color:var(--text2)">${w.label}</span><span style="color:var(--teal);font-weight:700">${w.open} open</span></div>`).join(''):'<div style="font-size:var(--text-xs);color:var(--text3)">All clear.</div>'}
      </div>
      <div class="hc">
        <div style="font-size:var(--text-xs);font-weight:700;color:var(--teal);letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px">Next 7 Days</div>
        ${upcomingEvents.length?upcomingEvents.map(e=>`<div style="padding:5px 0;border-bottom:1px solid var(--border);font-size:var(--text-xs)"><span style="color:var(--text1);font-weight:600">${e.title}</span><span style="color:var(--text3)"> · ${e._expandedDate||e.date}</span></div>`).join(''):'<div style="font-size:var(--text-xs);color:var(--text3)">Nothing scheduled.</div>'}
      </div>
    </div>

    ${overdue.length?`<div style="margin-top:14px;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.25);border-radius:8px;padding:12px 14px">
      <div style="font-size:var(--text-xs);font-weight:700;color:var(--red);letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">Needs Attention</div>
      ${overdue.slice(0,5).map(t=>`<div onclick="editTask(${t.id})" style="cursor:pointer;padding:4px 0;font-size:var(--text-xs);color:var(--text2)">→ ${t.title} <span style="color:var(--red)">· overdue since ${t.due}</span></div>`).join('')}
    </div>`:''}

    ${recentMemories.length?`<div style="margin-top:14px">
      <div style="font-size:var(--text-xs);font-weight:700;color:var(--text3);letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">Recent Context</div>
      ${recentMemories.map(m=>`<div style="font-size:var(--text-xs);color:var(--text3);padding:4px 0;border-bottom:1px solid var(--border)">${(m.memory||'').substring(0,120)}</div>`).join('')}
    </div>`:''}

    <div style="font-size:9px;color:var(--text3);margin-top:14px">Snapshot generated ${new Date().toLocaleString('en-PH',{hour:'2-digit',minute:'2-digit',day:'numeric',month:'short'})}</div>
  `;
}
function saveCashflow(){
  const acctSel=document.getElementById('ca-account').value;
  const acct=(acctSel==='Other'||acctSel==='__new__')?(document.getElementById('ca-account-other')?.value.trim()||'Cash'):acctSel;
  const catSel=document.getElementById('ca-cat').value;
  const catNotes=catSel==='Other'?document.getElementById('ca-cat-other').value.trim():'';
  const t={
    id:editingCashId||Date.now(),
    type:document.getElementById('ca-type').value,
    date:document.getElementById('ca-date').value,
    desc:document.getElementById('ca-desc').value.trim()||'Transaction',
    amount:parseFloat(document.getElementById('ca-amount').value)||0,
    account:acct,
    category:catSel,
    catNotes:catNotes,
    notes:document.getElementById('ca-notes').value.trim()
  };
  if(editingCashId){
    const idx=DB.cashflow.findIndex(x=>x.id===editingCashId);
    if(idx>=0)DB.cashflow[idx]=t;
    SB.update('cashflow',t.id,t,'cashflow');
    addHistory('edit','Edited transaction: '+t.desc,{...t,_dbKey:'cashflow'});
    showToast('✓ Transaction updated');
  }else{
    DB.cashflow.unshift(t);
    SB.upsert('cashflow',t,'cashflow');
    addHistory('add','Added '+t.type+': ₱'+t.amount+' — '+t.desc,{...t,_dbKey:'cashflow'});
    showToast('✓ Transaction saved');
  }
  editingCashId=null;
  closeModal('cashModal');
  renderLife();renderBrief();
}
function deleteCash(id){const t=DB.cashflow.find(x=>x.id===id);DB.cashflow=DB.cashflow.filter(x=>x.id!==id);SB.remove('cashflow',id,'cashflow');addHistory('delete','Deleted transaction: '+t.desc,{...t,_dbKey:'cashflow'});renderLife();renderBrief();showToast('Deleted');}
// ═══════════════════════════════════════════════════════════════════════
// LIFE — PERSONAL CASH FLOW ENGINE (v3)
// Convention: Debit = income (+), Credit = expense (-)
// Balance per account = sum(Debits) - sum(Credits) for that account
