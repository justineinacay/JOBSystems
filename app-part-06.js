// ═══════════════════════════════════════════════════════════════════════════
// SAVED LINKS — a first-class content type alongside tasks/notes/events.
// Paste a URL, a Supabase Edge Function (fetch-link-metadata) fetches it
// server-side and parses title/og:image/favicon, since the browser can't
// fetch arbitrary third-party pages itself (CORS). worldId null = sits in
// the Inbox until manually assigned to a Domain.
// ═══════════════════════════════════════════════════════════════════════════
const LINK_METADATA_URL='https://ddxkmidantqgnxfxsrrz.supabase.co/functions/v1/fetch-link-metadata';

async function fetchLinkMetadata(url){
  const session=await getAuthSession();
  const authToken=session?session.access_token:SB_KEY;
  try{
    const res=await fetch(LINK_METADATA_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':SB_KEY,'Authorization':'Bearer '+authToken},
      body:JSON.stringify({url}),
    });
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'metadata_fetch_failed');
    return data; // {title, previewImage, favicon}
  }catch(err){
    console.warn('fetchLinkMetadata failed, falling back to bare URL:',err);
    // Never blocks saving — worst case the user gets just the URL as the
    // title and no preview image/favicon, editable by hand afterward.
    return {title:url,previewImage:null,favicon:null};
  }
}

async function addSavedLinkFlow(){
  const result=await jelixPrompt('Add Link',[{key:'url',label:'URL',placeholder:'https://…'}],'Save');
  const url=(result?.[0]||'').trim();
  if(!url)return;
  let parsed;
  try{parsed=new URL(url);}catch(e){showToast('⚠ That doesn\'t look like a valid URL.');return;}
  if(parsed.protocol!=='http:'&&parsed.protocol!=='https:'){showToast('⚠ Only http/https links are supported.');return;}
  showToast('↻ Fetching link preview…');
  const meta=await fetchLinkMetadata(parsed.href);
  const link={
    id:'link_'+Date.now(),
    url:parsed.href,
    title:meta.title||parsed.href,
    previewImage:meta.previewImage||null,
    favicon:meta.favicon||null,
    worldId:null, // always lands in the Inbox first; assign a Domain afterward
    projectId:null,
    tags:[],
  };
  DB.savedLinks.unshift(link);
  save('savedLinks');
  SB.upsert('saved_links',link,'savedLinks').catch(()=>{});
  addHistory('add','Saved link: '+link.title,{...link,_dbKey:'savedLinks'});
  renderLinksView();
  showToast('✓ Link saved');
}

async function refreshSavedLink(id){
  const link=DB.savedLinks.find(l=>l.id===id);
  if(!link)return;
  showToast('↻ Refreshing preview…');
  const meta=await fetchLinkMetadata(link.url);
  link.title=meta.title||link.title;
  link.previewImage=meta.previewImage;
  link.favicon=meta.favicon;
  save('savedLinks');
  SB.update('saved_links',id,{title:link.title,previewImage:link.previewImage,favicon:link.favicon},'savedLinks').catch(()=>{});
  renderLinksView();
  showToast('✓ Preview refreshed');
}

async function deleteSavedLink(id){
  if(!await jelixConfirm('Delete this link?','Delete'))return;
  const link=DB.savedLinks.find(l=>l.id===id);
  DB.savedLinks=DB.savedLinks.filter(l=>l.id!==id);
  save('savedLinks');
  SB.remove('saved_links',id,'savedLinks');
  if(typeof _deleteItemLinksFor==='function')_deleteItemLinksFor('link',id);
  if(link)addHistory('delete','Deleted link: '+link.title,{...link,_dbKey:'savedLinks'});
  renderLinksView();
}

function assignSavedLinkToWorld(id,worldId){
  const link=DB.savedLinks.find(l=>l.id===id);
  if(!link)return;
  link.worldId=worldId||null;
  save('savedLinks');
  SB.update('saved_links',id,{worldId:link.worldId},'savedLinks').catch(()=>{});
  renderLinksView();
  if(typeof renderInboxView==='function')renderInboxView();
}

function renderLinksView(){
  const container=document.getElementById('linksListContainer');
  if(!container)return;
  const links=[...DB.savedLinks].sort((a,b)=>(b.id>a.id?1:-1));
  if(!links.length){
    container.innerHTML='<div style="font-size:var(--text-xs);color:var(--text3);text-align:center;padding:24px">No links saved yet. Paste a URL to get started.</div>';
    return;
  }
  container.innerHTML=links.map(l=>{
    const world=(DB.worlds||[]).find(w=>w.id===l.worldId);
    const worldLabel=world?world.label:'Inbox';
    const worldOptions=['<option value="">Inbox (unassigned)</option>']
      .concat((DB.worlds||[]).map(w=>`<option value="${w.id}" ${w.id===l.worldId?'selected':''}>${w.label}</option>`)).join('');
    return `<div class="hc" style="display:flex;gap:12px;align-items:flex-start;margin-bottom:10px;padding:12px">
      ${l.previewImage?`<img src="${l.previewImage}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;flex-shrink:0;background:var(--navy3)" onerror="this.style.display='none'">`:`<div style="width:64px;height:64px;border-radius:8px;flex-shrink:0;background:var(--navy3);display:flex;align-items:center;justify-content:center"><i class="ti ti-link" style="font-size:22px;color:var(--text3)"></i></div>`}
      <div style="flex:1;min-width:0">
        <a href="${l.url}" target="_blank" rel="noopener" style="font-size:var(--text-sm);font-weight:600;color:var(--text1);text-decoration:none;display:flex;align-items:center;gap:6px">
          ${l.favicon?`<img src="${l.favicon}" style="width:14px;height:14px;flex-shrink:0" onerror="this.style.display='none'">`:''}
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.title}</span>
        </a>
        <div style="font-size:var(--text-xs);color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px">${l.url}</div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:8px;flex-wrap:wrap">
          <select onchange="assignSavedLinkToWorld('${l.id}',this.value)" style="font-size:var(--text-xs);padding:3px 6px;width:auto">${worldOptions}</select>
          <button onclick="refreshSavedLink('${l.id}')" title="Refresh preview" style="background:transparent;border:1px solid var(--border2);border-radius:8px;color:var(--text3);font-size:var(--text-xs);padding:3px 8px;cursor:pointer"><i class="ti ti-refresh"></i></button>
          <button onclick="deleteSavedLink('${l.id}')" title="Delete" style="background:transparent;border:1px solid var(--border2);border-radius:8px;color:var(--text3);font-size:var(--text-xs);padding:3px 8px;cursor:pointer"><i class="ti ti-trash"></i></button>
        </div>
        <div style="margin-top:8px" id="link-related-${l.id}">${typeof renderRelatedSection==='function'?renderRelatedSection('link',l.id):''}</div>
        <div style="margin-top:6px" id="link-tags-${l.id}">${typeof renderTagsSection==='function'?renderTagsSection('link',l.id):''}</div>
      </div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
// UNIVERSAL LINKING — relate any task/note/event/link to any other, across
// types. Stored as one row per relation in DB.itemLinks; read as
// bidirectional (a query checks both the from_ and to_ side for a given
// item) even though each row only has one direction on disk.
// ═══════════════════════════════════════════════════════════════════════════
function _resolveLinkedItem(type,id){
  if(type==='task'){const t=DB.tasks.find(x=>String(x.id)===String(id));return t?{type,id,label:t.title||'Untitled task',icon:'ti-checkbox'}:null;}
  if(type==='note'){const n=DB.notes.find(x=>String(x.id)===String(id));return n?{type,id,label:n.title||'Untitled note',icon:'ti-notes'}:null;}
  if(type==='event'){const e=DB.calEvents.find(x=>String(x.id)===String(id));return e?{type,id,label:e.title||'Untitled event',icon:'ti-calendar'}:null;}
  if(type==='link'){const l=DB.savedLinks.find(x=>String(x.id)===String(id));return l?{type,id,label:l.title||l.url,icon:'ti-link'}:null;}
  return null;
}
function _openLinkedItem(type,id){
  if(type==='task'){setView('tasks');setTimeout(()=>editTask(DB.tasks.find(x=>String(x.id)===String(id))?.id),150);}
  else if(type==='note'){setView('notes');setTimeout(()=>{const i=DB.notes.findIndex(x=>String(x.id)===String(id));if(i>=0)openNoteEditor(i);},150);}
  else if(type==='event'){setView('calendar');setTimeout(()=>editCalEvent(DB.calEvents.find(x=>String(x.id)===String(id))?.id),150);}
  else if(type==='link'){setView('links');}
}
function getLinkedItems(type,id){
  return DB.itemLinks
    .filter(l=>(l.fromType===type&&String(l.fromId)===String(id))||(l.toType===type&&String(l.toId)===String(id)))
    .map(l=>{
      const isFrom=l.fromType===type&&String(l.fromId)===String(id);
      const other=isFrom?{type:l.toType,id:l.toId}:{type:l.fromType,id:l.fromId};
      const resolved=_resolveLinkedItem(other.type,other.id);
      return resolved?{linkId:l.id,...resolved}:null;
    })
    .filter(Boolean); // silently drop relations pointing at a since-deleted item
}
function addItemLink(fromType,fromId,toType,toId){
  const exists=DB.itemLinks.some(l=>
    (l.fromType===fromType&&String(l.fromId)===String(fromId)&&l.toType===toType&&String(l.toId)===String(toId))||
    (l.fromType===toType&&String(l.fromId)===String(toId)&&l.toType===fromType&&String(l.toId)===String(fromId))
  );
  if(exists)return;
  const link={id:'itemlink_'+Date.now(),fromType,fromId:String(fromId),toType,toId:String(toId)};
  DB.itemLinks.push(link);
  save('itemLinks');
  SB.upsert('item_links',link,'itemLinks').catch(()=>{});
}
function removeItemLink(linkId){
  DB.itemLinks=DB.itemLinks.filter(l=>l.id!==linkId);
  save('itemLinks');
  SB.remove('item_links',linkId,'itemLinks');
}
// Cascading cleanup — call from every content type's delete function so a
// removed item doesn't leave dangling relations pointing at nothing.
function _deleteItemLinksFor(type,id){
  const toDelete=DB.itemLinks.filter(l=>(l.fromType===type&&String(l.fromId)===String(id))||(l.toType===type&&String(l.toId)===String(id)));
  if(!toDelete.length)return;
  const ids=new Set(toDelete.map(l=>l.id));
  DB.itemLinks=DB.itemLinks.filter(l=>!ids.has(l.id));
  save('itemLinks');
  toDelete.forEach(l=>SB.remove('item_links',l.id,'itemLinks'));
}
// Shared renderer, embedded in the Task/Note/Event edit modals and each
// Link card — a chip per related item (click to jump to it, × to unlink)
// plus a "+ Link item" button that opens the picker.
function renderRelatedSection(type,id){
  const items=getLinkedItems(type,id);
  const chips=items.map(it=>`<span class="conn-chip" style="cursor:pointer">
    <i class="ti ${it.icon}" style="font-size:10px" onclick="_openLinkedItem('${it.type}','${it.id}')"></i>
    <span onclick="_openLinkedItem('${it.type}','${it.id}')">${(it.label||'').substring(0,28)}</span>
    <i class="ti ti-x" style="font-size:9px;margin-left:2px;opacity:.6" onclick="removeItemLink('${it.linkId}');_refreshRelatedSection('${type}','${id}')"></i>
  </span>`).join('');
  return `<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
    ${chips}
    <button type="button" onclick="openLinkPicker('${type}','${id}')" style="background:transparent;border:1px dashed var(--border2);border-radius:100px;padding:3px 10px;font-size:var(--text-xs);color:var(--text3);cursor:pointer"><i class="ti ti-plus"></i> Link item</button>
  </div>`;
}
// Re-render whichever Related section is currently on screen for this item —
// covers the 3 possible containers (task/note/event modals) plus Links cards.
function _refreshRelatedSection(type,id){
  const map={task:'tf-related',note:'note-related',event:'ce-related'};
  const container=map[type]&&document.getElementById(map[type]);
  if(container)container.innerHTML=renderRelatedSection(type,id);
  if(type==='link'&&typeof renderLinksView==='function')renderLinksView();
}

// ── Link picker overlay ──────────────────────────────────────────────────
let _linkPickerSource=null; // {type,id}
function openLinkPicker(type,id){
  _linkPickerSource={type,id};
  const modal=document.getElementById('linkPickerModal');
  if(!modal)return;
  modal.classList.add('open');
  const input=document.getElementById('linkPickerInput');
  if(input){input.value='';setTimeout(()=>input.focus(),50);}
  filterLinkPicker();
}
function closeLinkPicker(){
  document.getElementById('linkPickerModal')?.classList.remove('open');
  _linkPickerSource=null;
}
function filterLinkPicker(){
  const q=(document.getElementById('linkPickerInput')?.value||'').toLowerCase().trim();
  const results=document.getElementById('linkPickerResults');
  if(!results||!_linkPickerSource)return;
  const {type:srcType,id:srcId}=_linkPickerSource;
  const already=new Set(getLinkedItems(srcType,srcId).map(it=>it.type+':'+it.id));
  const pools=[
    ...DB.tasks.map(t=>({type:'task',id:t.id,label:t.title,sub:t.world,icon:'ti-checkbox'})),
    ...DB.notes.map(n=>({type:'note',id:n.id,label:n.title||'Untitled note',sub:'Note',icon:'ti-notes'})),
    ...DB.calEvents.map(e=>({type:'event',id:e.id,label:e.title,sub:e.date,icon:'ti-calendar'})),
    ...DB.savedLinks.map(l=>({type:'link',id:l.id,label:l.title||l.url,sub:l.url,icon:'ti-link'})),
  ].filter(it=>!(it.type===srcType&&String(it.id)===String(srcId))) // never link an item to itself
   .filter(it=>!already.has(it.type+':'+it.id))
   .filter(it=>!q||(it.label||'').toLowerCase().includes(q)||(it.sub||'').toLowerCase().includes(q));
  const shown=pools.slice(0,30);
  results.innerHTML=shown.length?shown.map(it=>`
    <div class="cr" onclick="pickLinkedItem('${it.type}','${it.id}')" style="gap:9px;cursor:pointer">
      <div class="cri" style="background:rgba(0,0,0,.3);color:var(--teal)"><i class="ti ${it.icon}" style="font-size:var(--text-sm);line-height:1;display:block"></i></div>
      <div style="flex:1;min-width:0">
        <div class="crl">${it.label}</div>
        <div class="crs" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${it.sub||''}</div>
      </div>
      <span style="font-size:var(--text-xs);color:var(--text3);background:rgba(0,0,0,.3);padding:1px 5px;border-radius:8px;flex-shrink:0;text-transform:capitalize">${it.type}</span>
    </div>`).join(''):'<div style="font-size:var(--text-xs);color:var(--text3);text-align:center;padding:16px">No matching items.</div>';
}
function pickLinkedItem(type,id){
  if(!_linkPickerSource)return;
  addItemLink(_linkPickerSource.type,_linkPickerSource.id,type,id);
  const {type:srcType,id:srcId}=_linkPickerSource;
  closeLinkPicker();
  _refreshRelatedSection(srcType,srcId);
}

// ═══════════════════════════════════════════════════════════════════════════
// INBOX — a computed view, not stored state. Tasks/Notes/Links with no
// Domain assigned land here until manually triaged. Calendar events are
// deliberately excluded: unlike tasks/notes, events have no Domain-picker
// UI at all today, so treating a missing world_id as "unsorted" would just
// flood the Inbox with every existing event rather than surface anything
// genuinely new.
// ═══════════════════════════════════════════════════════════════════════════
function _getInboxItems(){
  const tasks=(DB.tasks||[]).filter(t=>!t.world).map(t=>({type:'task',id:t.id,title:t.title||'Untitled task',icon:'ti-checkbox',color:'var(--teal)'}));
  const notes=(DB.notes||[]).filter(n=>!n.worldId).map(n=>({type:'note',id:n.id,title:n.title||'Untitled note',icon:'ti-notes',color:'var(--amber)'}));
  const links=(DB.savedLinks||[]).filter(l=>!l.worldId).map(l=>({type:'link',id:l.id,title:l.title||l.url,icon:'ti-link',color:'var(--blue)'}));
  return [...tasks,...notes,...links].sort((a,b)=>(String(b.id)>String(a.id)?1:-1));
}
function updateInboxBadge(){
  const badge=document.getElementById('inboxBadge');
  if(badge)badge.textContent=_getInboxItems().length;
}
function assignInboxItemToWorld(type,id,worldId){
  worldId=worldId||null;
  if(type==='task'){
    const t=DB.tasks.find(x=>String(x.id)===String(id));if(!t)return;
    t.world=worldId;save('tasks');SB.update('tasks',t.id,{world:worldId},'tasks').catch(()=>{});
  }else if(type==='note'){
    const n=DB.notes.find(x=>String(x.id)===String(id));if(!n)return;
    n.worldId=worldId;save('notes');SB.update('notes',n.id,{worldId},'notes').catch(()=>{});
  }else if(type==='link'){
    assignSavedLinkToWorld(id,worldId);return; // already saves + re-renders
  }
  renderInboxView();
  if(typeof renderTasks==='function')renderTasks();
  if(typeof renderNotesList==='function')renderNotesList();
}
function renderInboxView(){
  const container=document.getElementById('inboxListContainer');
  if(!container)return;
  const items=_getInboxItems();
  updateInboxBadge();
  if(!items.length){
    container.innerHTML='<div style="font-size:var(--text-xs);color:var(--text3);text-align:center;padding:24px">Inbox zero. New tasks, notes, and links with no Domain will show up here.</div>';
    return;
  }
  const worldOptionsFor=(currentId)=>['<option value="">Assign a Domain…</option>']
    .concat((DB.worlds||[]).map(w=>`<option value="${w.id}">${w.label}</option>`)).join('');
  container.innerHTML=items.map(it=>`
    <div class="hc" style="display:flex;align-items:center;gap:10px;margin-bottom:8px;padding:10px 12px">
      <i class="ti ${it.icon}" style="font-size:16px;color:${it.color};flex-shrink:0"></i>
      <div onclick="_openLinkedItem('${it.type}','${it.id}')" style="flex:1;min-width:0;cursor:pointer;font-size:var(--text-sm);color:var(--text1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${it.title}</div>
      <span style="font-size:var(--text-xs);color:var(--text3);background:rgba(0,0,0,.3);padding:1px 6px;border-radius:8px;flex-shrink:0;text-transform:capitalize">${it.type}</span>
      <select onchange="assignInboxItemToWorld('${it.type}','${it.id}',this.value)" style="font-size:var(--text-xs);padding:3px 6px;width:auto;flex-shrink:0">${worldOptionsFor(it.id)}</select>
    </div>`).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
// PROJECTS — a layer between Domain and item. Scoped to one Domain; a
// Project never crosses Domains. Tasks/Notes/Events get a projectId
// field (null = "Unassigned" within that Domain, never invisible).
// ═══════════════════════════════════════════════════════════════════════════
function getProjectsForWorld(worldId){
  return (DB.projects||[]).filter(p=>p.worldId===worldId);
}
function createProject(worldId,name,color){
  name=(name||'').trim();
  if(!name)return null;
  const p={id:'proj_'+Date.now(),worldId,name,color:color||null};
  DB.projects.push(p);
  save('projects');
  SB.upsert('projects',p,'projects').catch(()=>{});
  addHistory('add','Added project: '+p.name,{...p,_dbKey:'projects'});
  return p;
}
async function createProjectFlow(worldId){
  const result=await jelixPrompt('New Project',[{key:'name',label:'Project name',placeholder:'e.g. TJC Partnership'}],'Add');
  const name=result?.[0];
  if(!name)return null;
  const p=createProject(worldId,name);
  renderTasks();
  return p;
}
async function renameProject(id){
  const p=(DB.projects||[]).find(x=>x.id===id);if(!p)return;
  const result=await jelixPrompt('Rename Project',[{key:'name',label:'Project name',default:p.name}],'Save');
  const name=result?.[0];
  if(!name||!name.trim())return;
  p.name=name.trim();
  save('projects');
  SB.update('projects',id,{name:p.name},'projects').catch(()=>{});
  renderTasks();
}
// Deleting a Project never deletes its items — they fall back to
// "Unassigned" within the same Domain, mirroring the fix already shipped
// for deleting a Domain not deleting its tasks.
async function deleteProject(id){
  const p=(DB.projects||[]).find(x=>x.id===id);if(!p)return;
  if(!await jelixConfirm(`Delete project "${p.name}"? Its tasks/notes/events become Unassigned — nothing is deleted.`,'Delete'))return;
  [['tasks','tasks'],['notes','notes'],['calEvents','cal_events'],['savedLinks','saved_links']].forEach(([key,table])=>{
    (DB[key]||[]).forEach(item=>{
      if(item.projectId===id){
        item.projectId=null;
        SB.update(table,item.id,{projectId:null},key).catch(()=>{});
      }
    });
    save(key);
  });
  DB.projects=(DB.projects||[]).filter(x=>x.id!==id);
  save('projects');
  SB.remove('projects',id,'projects');
  addHistory('delete','Deleted project: '+p.name,{...p,_dbKey:'projects'});
  renderTasks();
}
// Merge: everything in `sourceId` moves to `targetId`, source Project is
// removed. Both must belong to the same Domain (a Project's worldId is
// fixed — merging across Domains would silently relabel items into a
// different Domain's Project, which isn't what "merge" should mean).
async function mergeProjects(sourceId,targetId){
  if(!sourceId||!targetId||sourceId===targetId)return;
  const source=(DB.projects||[]).find(x=>x.id===sourceId);
  const target=(DB.projects||[]).find(x=>x.id===targetId);
  if(!source||!target)return;
  if(source.worldId!==target.worldId){showToast('⚠ Can only merge Projects within the same Domain.');return;}
  if(!await jelixConfirm(`Merge "${source.name}" into "${target.name}"? Everything moves over, "${source.name}" is removed.`,'Merge'))return;
  [['tasks','tasks'],['notes','notes'],['calEvents','cal_events'],['savedLinks','saved_links']].forEach(([key,table])=>{
    (DB[key]||[]).forEach(item=>{
      if(item.projectId===sourceId){
        item.projectId=targetId;
        SB.update(table,item.id,{projectId:targetId},key).catch(()=>{});
      }
    });
    save(key);
  });
  DB.projects=(DB.projects||[]).filter(x=>x.id!==sourceId);
  save('projects');
  SB.remove('projects',sourceId,'projects');
  addHistory('edit','Merged project "'+source.name+'" into "'+target.name+'"',{_dbKey:'projects'});
  renderTasks();
  showToast('✓ Merged into '+target.name);
}
async function mergeProjectsFlow(worldId){
  const projects=getProjectsForWorld(worldId);
  if(projects.length<2){showToast('Need at least 2 projects in this Domain to merge.');return;}
  const list=projects.map((p,i)=>`${i+1}. ${p.name}`).join('\n');
  const result=await jelixPrompt('Merge Projects',[
    {key:'from',label:'Merge FROM (number)\n'+list,type:'number',placeholder:'1'},
    {key:'to',label:'Merge INTO (number)',type:'number',placeholder:'2'},
  ],'Merge');
  if(!result)return;
  const srcIdx=parseInt(result[0],10)-1;
  const tgtIdx=parseInt(result[1],10)-1;
  if(isNaN(srcIdx)||!projects[srcIdx]||isNaN(tgtIdx)||!projects[tgtIdx])return;
  mergeProjects(projects[srcIdx].id,projects[tgtIdx].id);
}
// Shared picker, embedded in Task/Note/Event edit modals alongside the
// existing Domain picker — filtered to whichever Domain is currently
// selected on that item, since a Project never crosses Domains. Follows
// the same pattern as every other field in these modals: a plain form
// control read at Save time, not an auto-saving widget.
function projectOptionsHtml(worldId,selectedId){
  const projects=getProjectsForWorld(worldId);
  return ['<option value="">No Project</option>']
    .concat(projects.map(p=>`<option value="${p.id}" ${p.id===selectedId?'selected':''}>${p.name}</option>`))
    .concat(['<option value="__new__">+ New Project…</option>'])
    .join('');
}
// Repopulates a Project <select> for whichever Domain is now selected —
// called both when a modal opens and whenever its Domain picker changes.
function refreshProjectSelect(selectId,worldId,selectedId){
  const sel=document.getElementById(selectId);
  if(!sel)return;
  sel.innerHTML=projectOptionsHtml(worldId,selectedId||'');
}
// Shared onchange — intercepts "+ New Project" so picking it prompts for
// a name and re-selects the new Project, instead of saving "__new__".
async function handleProjectSelectChange(selectEl,worldId){
  if(selectEl.value==='__new__'){
    const p=await createProjectFlow(worldId);
    refreshProjectSelect(selectEl.id,worldId,p?p.id:'');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ALL FILES — pure read-time aggregation, no new storage. Scans every
// existing attachment source (task Drive links, note Drive-file blocks,
// Domain Gallery module files, saved Link previews) and lists them in
// one place. Nothing is cached, so a deleted source item just stops
// appearing next render — no stale/dangling entries possible.
// ═══════════════════════════════════════════════════════════════════════════
// Note "Drive File" blocks aren't a distinct block type — addNoteDriveBlock()
// stores them as a plain paragraph formatted "📎 name — url". Parsing that
// back out here rather than changing the note format itself, which would
// touch the block editor for a benefit only this aggregation needs.
const _NOTE_DRIVE_BLOCK_RE=/^📎 (.+?) — (https?:\/\/\S+)$/;
// Inferred from the URL's extension, when it has one — good enough for
// direct file links and Gallery/Link previews; Drive "view" URLs rarely
// expose a real extension, so those land in "Other" rather than guessing.
const _FILE_TYPE_EXT={
  image:['jpg','jpeg','png','gif','webp','svg','bmp','heic'],
  document:['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','csv','pages','key','numbers'],
};
function _inferFileType(url){
  const m=(url||'').split('?')[0].match(/\.([a-z0-9]+)$/i);
  const ext=m?m[1].toLowerCase():null;
  if(ext&&_FILE_TYPE_EXT.image.includes(ext))return'image';
  if(ext&&_FILE_TYPE_EXT.document.includes(ext))return'document';
  return'other';
}
function _getAllFilesItems(){
  const items=[];
  (DB.tasks||[]).forEach(t=>{
    if(t.driveLink)items.push({name:t.title||'Untitled task',url:t.driveLink,thumbnail:null,sourceType:'task',sourceId:t.id,worldId:t.world||null});
  });
  (DB.notes||[]).forEach(n=>{
    (n.blocks||[]).forEach(b=>{
      if(b.type!=='p'||!b.content)return;
      const m=b.content.match(_NOTE_DRIVE_BLOCK_RE);
      if(m)items.push({name:m[1],url:m[2],thumbnail:null,sourceType:'note',sourceId:n.id,worldId:n.worldId||null});
    });
  });
  (DB.worlds||[]).forEach(w=>{
    (w.galleryFiles||[]).forEach(f=>{
      items.push({name:f.name,url:f.url,thumbnail:null,sourceType:'domain',sourceId:w.id,worldId:w.id});
    });
  });
  (DB.savedLinks||[]).forEach(l=>{
    items.push({name:l.title||l.url,url:l.url,thumbnail:l.previewImage||l.favicon||null,sourceType:'link',sourceId:l.id,worldId:l.worldId||null});
  });
  items.forEach(it=>{it.fileType=_inferFileType(it.url);});
  return items;
}
function _openFileSource(sourceType,sourceId){
  if(sourceType==='task'){setView('tasks');setTimeout(()=>editTask(sourceId),150);}
  else if(sourceType==='note'){setView('notes');setTimeout(()=>{const i=DB.notes.findIndex(x=>x.id===sourceId);if(i>=0)openNoteEditor(i);},150);}
  else if(sourceType==='domain'){setView(sourceId);}
  else if(sourceType==='link'){setView('links');}
}
function renderAllFilesView(){
  const container=document.getElementById('allFilesListContainer');
  if(!container)return;
  const filterEl=document.getElementById('allFilesWorldFilter');
  const worldFilter=filterEl?filterEl.value:'';
  const typeFilterEl=document.getElementById('allFilesTypeFilter');
  const typeFilter=typeFilterEl?typeFilterEl.value:'';
  let items=_getAllFilesItems();
  if(worldFilter)items=items.filter(it=>it.worldId===worldFilter);
  if(typeFilter)items=items.filter(it=>it.fileType===typeFilter);
  if(filterEl&&!filterEl._populated){
    filterEl._populated=true;
    filterEl.innerHTML='<option value="">All Domains</option>'+(DB.worlds||[]).map(w=>`<option value="${w.id}">${w.label}</option>`).join('');
  }
  if(!items.length){
    container.innerHTML='<div style="font-size:var(--text-xs);color:var(--text3);text-align:center;padding:24px">No files attached anywhere yet — Drive links on tasks/notes, Domain Gallery files, and Link previews all show up here.</div>';
    return;
  }
  const sourceLabel={task:'Task',note:'Note',domain:'Domain Gallery',link:'Link'};
  const sourceIcon={task:'ti-checkbox',note:'ti-notes',domain:'ti-photo',link:'ti-link'};
  container.innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px">${items.map(it=>`
    <div onclick="_openFileSource('${it.sourceType}','${it.sourceId}')" style="cursor:pointer;background:var(--navy2);border:1px solid var(--border);border-radius:12px;padding:10px;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center">
      ${it.thumbnail?`<img src="${it.thumbnail}" style="width:100%;height:70px;object-fit:cover;border-radius:8px;background:var(--navy3)" onerror="this.replaceWith(Object.assign(document.createElement('div'),{innerHTML:'<i class=&quot;ti ti-file&quot; style=&quot;font-size:28px;color:var(--text3)&quot;></i>'}))">`
        :`<div style="width:100%;height:70px;display:flex;align-items:center;justify-content:center;background:var(--navy3);border-radius:8px"><i class="ti ti-file" style="font-size:28px;color:var(--text3)"></i></div>`}
      <div style="font-size:var(--text-xs);color:var(--text1);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%">${it.name}</div>
      <span style="font-size:9px;color:var(--text3);display:flex;align-items:center;gap:3px"><i class="ti ${sourceIcon[it.sourceType]}" style="font-size:9px"></i>${sourceLabel[it.sourceType]}</span>
    </div>`).join('')}</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// TAGS — freeform, cross-Domain labels on any Task/Note/Event/Link. A tag
// is just a string in that item's `tags` array; creating one is using it —
// there's no separate tag-management screen, autocomplete just suggests
// whatever's already been typed elsewhere via a shared <datalist>.
// ═══════════════════════════════════════════════════════════════════════════
function _getTaggableItem(type,id){
  if(type==='task')return DB.tasks.find(x=>String(x.id)===String(id));
  if(type==='note')return DB.notes.find(x=>String(x.id)===String(id));
  if(type==='event')return DB.calEvents.find(x=>String(x.id)===String(id));
  if(type==='link')return DB.savedLinks.find(x=>String(x.id)===String(id));
  return null;
}
function _saveTaggableItem(type,id){
  const map={task:['tasks','tasks'],note:['notes','notes'],event:['cal_events','calEvents'],link:['saved_links','savedLinks']};
  const entry=map[type];if(!entry)return;
  const [table,key]=entry;
  const item=_getTaggableItem(type,id);if(!item)return;
  save(key);
  SB.update(table,id,{tags:item.tags||[]},key).catch(()=>{});
}
function getAllTags(){
  const all=[...DB.tasks,...DB.notes,...DB.calEvents,...DB.savedLinks].flatMap(x=>x.tags||[]);
  return [...new Set(all)].filter(Boolean).sort();
}
function renderTagsDatalist(){
  const dl=document.getElementById('allTagsDatalist');
  if(dl)dl.innerHTML=getAllTags().map(t=>`<option value="${t}">`).join('');
}
function addTagToItem(type,id,rawTag){
  const tag=(rawTag||'').trim().toLowerCase().replace(/^#/,'');
  if(!tag)return;
  const item=_getTaggableItem(type,id);if(!item)return;
  if(!item.tags)item.tags=[];
  if(item.tags.includes(tag))return;
  item.tags.push(tag);
  _saveTaggableItem(type,id);
  renderTagsDatalist();
  _refreshTagsSection(type,id);
}
function removeTagFromItem(type,id,tag){
  const item=_getTaggableItem(type,id);if(!item)return;
  item.tags=(item.tags||[]).filter(t=>t!==tag);
  _saveTaggableItem(type,id);
  _refreshTagsSection(type,id);
}
function renderTagsSection(type,id){
  const item=_getTaggableItem(type,id);
  const tags=(item&&item.tags)||[];
  const chips=tags.map(tag=>{
    const safeTag=tag.replace(/'/g,"\\'");
    return `<span class="conn-chip" style="cursor:default"><span onclick="manageTagEverywhere('${safeTag}')" style="cursor:pointer" title="Rename or remove this tag everywhere">#${tag}</span><i class="ti ti-x" style="font-size:9px;margin-left:4px;opacity:.6;cursor:pointer" title="Remove from just this item" onclick="removeTagFromItem('${type}','${id}','${safeTag}')"></i></span>`;
  }).join('');
  return `<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
    ${chips}
    <input list="allTagsDatalist" placeholder="+ tag" onkeydown="if(event.key==='Enter'){event.preventDefault();addTagToItem('${type}','${id}',this.value);this.value='';}" style="font-size:var(--text-xs);width:90px;padding:3px 8px;background:transparent;border:1px dashed var(--border2);border-radius:100px">
  </div>`;
}
// Click the tag text (not the per-item × icon) to rename or remove it
// across every task/note/event/link that has it, not just this one.
async function manageTagEverywhere(tag){
  const result=await jelixPrompt(`#${tag}`,[{key:'input',label:'New name (or type DELETE to remove this tag everywhere)',default:tag}],'Save');
  const input=result?.[0];
  if(input===undefined||input===null)return;
  const trimmed=input.trim();
  if(!trimmed)return;
  if(trimmed.toUpperCase()==='DELETE'){
    if(!await jelixConfirm(`Remove #${tag} from every task, note, event, and link that has it?`,'Delete'))return;
    _applyTagEverywhere(tag,null);
    showToast('✓ Tag removed everywhere');
  }else{
    const newTag=trimmed.toLowerCase().replace(/^#/,'');
    if(!newTag||newTag===tag)return;
    _applyTagEverywhere(tag,newTag);
    showToast('✓ Tag renamed everywhere');
  }
}
function _applyTagEverywhere(oldTag,newTagOrNull){
  const sources=[['tasks','tasks'],['notes','notes'],['calEvents','cal_events'],['savedLinks','saved_links']];
  sources.forEach(([key,table])=>{
    let changed=false;
    (DB[key]||[]).forEach(item=>{
      if(!item.tags||!item.tags.includes(oldTag))return;
      changed=true;
      item.tags=newTagOrNull
        ?[...new Set(item.tags.map(t=>t===oldTag?newTagOrNull:t))]
        :item.tags.filter(t=>t!==oldTag);
      SB.update(table,item.id,{tags:item.tags},key).catch(()=>{});
    });
    if(changed)save(key);
  });
  renderTagsDatalist();
  // Refresh every place tags are currently visible on screen, including
  // whichever edit modal is open right now (its Tags section was just
  // rendered from the pre-change data, so it needs an explicit re-draw —
  // reopening it later would already pick up the change on its own).
  if(typeof renderLinksView==='function')renderLinksView();
  if(typeof renderTasks==='function')renderTasks();
  if(editingTaskId!=null)_refreshTagsSection('task',editingTaskId);
  if(document.getElementById('noteEditorModal')?.classList.contains('open')&&DB.notes[currentNote])_refreshTagsSection('note',DB.notes[currentNote].id);
  if(typeof calEditingId!=='undefined'&&calEditingId!=null)_refreshTagsSection('event',calEditingId);
}
function _refreshTagsSection(type,id){
  const map={task:'tf-tags',note:'note-tags',event:'ce-tags'};
  const container=map[type]&&document.getElementById(map[type]);
  if(container)container.innerHTML=renderTagsSection(type,id);
  if(type==='link'){
    const linkContainer=document.getElementById('link-tags-'+id);
    if(linkContainer)linkContainer.innerHTML=renderTagsSection(type,id);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EDIT / VIEW MODE — global toggle. Edit mode shows drag handles, delete
// buttons, shape presets, resize handles, and the slash/+ block menus, and
// makes text genuinely editable. View mode hides all of that and makes
// everything read-only — but links, checkboxes-as-state, and buttons
// (task click-to-open, etc.) stay fully functional either way.
// ═══════════════════════════════════════════════════════════════════════════
let jelixEditMode=localStorage.getItem('j-edit-mode')!=='off';
// Cross-tab sync — if this app is open in more than one browser tab, each
// tab only reads jelixEditMode from storage once, at load. Without this,
// toggling Edit/View in one tab does nothing to any other tab that's
// already open, so it can look like the change "didn't save" when you
// switch to a different tab that's just showing its own stale state.
window.addEventListener('storage',(e)=>{
  if(e.key==='j-edit-mode'){
    const newMode=e.newValue!=='off';
    if(newMode!==jelixEditMode){
      jelixEditMode=newMode;
      document.querySelectorAll('.jelix-edit-toggle').forEach(btn=>{
        btn.innerHTML=jelixEditMode?'<i class="ti ti-edit"></i> Editing':'<i class="ti ti-eye"></i> Viewing';
        btn.style.color=jelixEditMode?'var(--teal)':'var(--text3)';
        btn.style.borderColor=jelixEditMode?'var(--teal2)':'var(--border)';
      });
      if(document.getElementById('view-notes')?.classList.contains('active'))renderBlocks();
      if(document.getElementById('view-domain-generic')?.classList.contains('active'))renderDomainGenericView(currentView);
      if(typeof _refreshStaticCardToolbars==='function')_refreshStaticCardToolbars();
    }
  }
});
function toggleEditMode(){
  // Flush any pending debounced resize save FIRST — if the mode switch's
  // re-render happens before a resize-in-progress finishes its 400ms
  // debounce, the render reads the old (pre-resize) shape and the resize
  // is lost. Forcing it through now closes that race.
  _flushPendingShapeSaves();
  jelixEditMode=!jelixEditMode;
  localStorage.setItem('j-edit-mode',jelixEditMode?'on':'off');
  document.querySelectorAll('.jelix-edit-toggle').forEach(btn=>{
    btn.innerHTML=jelixEditMode?'<i class="ti ti-edit"></i> Editing':'<i class="ti ti-eye"></i> Viewing';
    btn.style.color=jelixEditMode?'var(--teal)':'var(--text3)';
    btn.style.borderColor=jelixEditMode?'var(--teal2)':'var(--border)';
  });
  if(document.getElementById('view-notes')?.classList.contains('active'))renderBlocks();
  if(document.getElementById('view-domain-generic')?.classList.contains('active'))renderDomainGenericView(currentView);
  _refreshStaticCardToolbars();
}
function _editToggleButtonHtml(){
  return`<button class="jelix-edit-toggle btn btn-g" onclick="toggleEditMode()" style="font-size:var(--text-xs);color:${jelixEditMode?'var(--teal)':'var(--text3)'};border-color:${jelixEditMode?'var(--teal2)':'var(--border)'}"><i class="ti ti-${jelixEditMode?'edit':'eye'}"></i> ${jelixEditMode?'Editing':'Viewing'}</button>`;
}
function saveBlocks(){
  if(DB.notes[currentNote]){
    DB.notes[currentNote].blocks=[...noteBlocks];
    save('notes');
    SB.update('notes',DB.notes[currentNote].id,DB.notes[currentNote],'notes').catch(()=>{});
  }
}
let _saveBlocksTimer=null;
function saveBlocksDebounced(){
  clearTimeout(_saveBlocksTimer);
  _saveBlocksTimer=setTimeout(saveBlocks,1000);
}
// Generic debounce for other frequent-write paths (Database cell typing, etc.)
const _dbChangeDebounceMap=new WeakMap();
function _dbCellChangeDebounced(onChange){
  if(!_dbChangeDebounceMap.has(onChange))_dbChangeDebounceMap.set(onChange,debounce(onChange,800));
  _dbChangeDebounceMap.get(onChange)();
}
const SLASH_COMMAND_TYPES=[
  {t:'h1',label:'Heading 1',icon:'ti-h-1'},
  {t:'h2',label:'Heading 2',icon:'ti-h-2'},
  {t:'h3',label:'Heading 3',icon:'ti-h-3'},
  {t:'h4',label:'Heading 4',icon:'ti-h-4'},
  {t:'p',label:'Paragraph',icon:'ti-pilcrow'},
  {t:'todo',label:'To-do',icon:'ti-checkbox'},
  {t:'bullet',label:'Bullet List',icon:'ti-list'},
  {t:'numbered',label:'Numbered List',icon:'ti-list-numbers'},
  {t:'toggle',label:'Toggle List',icon:'ti-chevron-right'},
  {t:'switch',label:'Toggle (Switch)',icon:'ti-toggle-left'},
  {t:'quote',label:'Quote',icon:'ti-quote'},
  {t:'code',label:'Code Block',icon:'ti-code'},
  {t:'callout',label:'Callout',icon:'ti-bulb'},
  {t:'divider',label:'Divider',icon:'ti-minus'},
  {t:'table',label:'Table',icon:'ti-table'},
  {t:'database',label:'Database',icon:'ti-database'}
];
function _showSlashMenu(blockIndex,contentEl){
  let menu=document.getElementById('jelixSlashMenu');
  if(!menu){
    menu=document.createElement('div');
    menu.id='jelixSlashMenu';
    menu.style.cssText='position:fixed;z-index:9999;background:var(--navy1);border:1px solid var(--border2);border-radius:10px;padding:6px;box-shadow:0 6px 20px rgba(0,0,0,.45);max-height:280px;overflow-y:auto;min-width:190px';
    document.body.appendChild(menu);
    document.addEventListener('mousedown',(e)=>{if(!menu.contains(e.target))_hideSlashMenu();});
  }
  menu.innerHTML=SLASH_COMMAND_TYPES.map(x=>`<div onmousedown="event.preventDefault();_applySlashCommand(${blockIndex},'${x.t}')" style="padding:6px 9px;cursor:pointer;border-radius:6px;display:flex;align-items:center;gap:7px;font-size:var(--text-sm);color:var(--text1)" onmouseover="this.style.background='var(--navy3)'" onmouseout="this.style.background='transparent'"><i class="ti ${x.icon}" style="font-size:13px;color:var(--teal);width:16px;flex-shrink:0"></i>${x.label}</div>`).join('');
  const r=contentEl.getBoundingClientRect();
  menu.style.display='block';
  const menuH=menu.offsetHeight||280;
  menu.style.left=Math.max(8,Math.min(window.innerWidth-210,r.left))+'px';
  menu.style.top=(r.bottom+window.innerHeight-r.bottom<menuH+20?r.top-menuH-6:r.bottom+4)+'px';
}
function _hideSlashMenu(){const m=document.getElementById('jelixSlashMenu');if(m)m.style.display='none';}
function _applySlashCommand(blockIndex,type){
  if(!noteBlocks[blockIndex])return;
  noteBlocks[blockIndex].type=type;
  noteBlocks[blockIndex].content='';
  if(type==='table')noteBlocks[blockIndex].tableData=[['',''],['','']];
  if(type==='database')noteBlocks[blockIndex].dbData=jdbNewDatabase();
  saveBlocks();
  _hideSlashMenu();
  renderBlocks();
  setTimeout(()=>{const els=document.querySelectorAll('.bcontent');if(els[blockIndex])els[blockIndex].focus();},20);
}
function renderBlocks(){const c=document.getElementById('blocksContainer');c.innerHTML='';
  let numberedRun=0; // tracks consecutive numbered-list position, resets on any other type
  noteBlocks.forEach((b,i)=>{
    if(b.type!=='numbered')numberedRun=0;
    if(b.type==='divider'){const row=document.createElement('div');row.innerHTML='<hr style="border:none;border-top:1px solid var(--border);margin:6px 0">';c.appendChild(row);return;}
    if(b.type==='callout'){
      const box=document.createElement('div');
      box.style.cssText='background:var(--teal3);border-left:3px solid var(--teal);border-radius:10px;padding:8px 12px;margin:4px 0;flex:1;min-width:0;width:100%;font-size:var(--text-sm);color:var(--text1);min-height:32px;max-height:60vh;outline:none;resize:vertical;overflow-y:auto;box-sizing:border-box';
      if(b.height)box.style.height=b.height+'px';
      box.contentEditable='true';box.textContent=b.content;
      box.oninput=()=>{noteBlocks[i].content=box.textContent;saveBlocks();};
      // Persist manual resizes — this box has a native resize handle but
      // nothing was ever saving the result, so any resize was silently lost
      // the moment the block list re-rendered (e.g. adding another block).
      let calloutFirstFire=true,calloutSaveTimer=null;
      const ro=new ResizeObserver(entries=>{
        if(calloutFirstFire){calloutFirstFire=false;return;}
        const h=Math.round(entries[0].contentRect.height);
        clearTimeout(calloutSaveTimer);
        calloutSaveTimer=setTimeout(()=>{noteBlocks[i].height=h;saveBlocks();},400);
      });
      ro.observe(box);
      window._pendingShapeFlushes=window._pendingShapeFlushes||new Map();
      window._pendingShapeFlushes.set('note-callout-'+b.id,()=>{clearTimeout(calloutSaveTimer);const h=Math.round(box.getBoundingClientRect().height);if(h>0){noteBlocks[i].height=h;saveBlocks();}});
      const row=document.createElement('div');row.style.cssText='display:flex;align-items:flex-start;gap:5px;padding:1px 0;width:100%';row.appendChild(box);
      const del2=document.createElement('button');del2.innerHTML='<i class="ti ti-x" style="font-size:var(--text-xs);line-height:1;display:block"></i>';del2.style.cssText='background:transparent;border:none;color:var(--text3);cursor:pointer;opacity:0;transition:opacity .15s;padding:0 2px;flex-shrink:0;margin-top:3px';
      del2.onclick=()=>{noteBlocks.splice(i,1);saveBlocks();renderBlocks();};
      row.addEventListener('mouseenter',()=>del2.style.opacity='1');row.addEventListener('mouseleave',()=>del2.style.opacity='0');
      row.appendChild(del2);c.appendChild(row);return;
    }
    if(b.type==='switch'){
      const row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:10px;padding:6px 2px';
      const label=document.createElement('div');label.contentEditable='true';label.textContent=b.content||'';label.style.cssText='flex:1;font-size:var(--text-sm);color:var(--text1);outline:none;min-width:0';
      label.oninput=()=>{noteBlocks[i].content=label.textContent;saveBlocks();};
      const sw=document.createElement('div');sw.style.cssText=`width:36px;height:20px;border-radius:100px;background:${b.done?'var(--teal)':'var(--navy4)'};position:relative;cursor:pointer;flex-shrink:0;transition:background .15s`;
      sw.innerHTML=`<span style="position:absolute;top:2px;left:${b.done?'18px':'2px'};width:16px;height:16px;border-radius:50%;background:var(--text1);transition:left .15s"></span>`;
      sw.onclick=()=>{noteBlocks[i].done=!noteBlocks[i].done;saveBlocks();renderBlocks();};
      row.appendChild(label);row.appendChild(sw);
      const del=document.createElement('button');del.innerHTML='<i class="ti ti-x" style="font-size:var(--text-xs)"></i>';del.style.cssText='background:transparent;border:none;color:var(--text3);cursor:pointer;flex-shrink:0';
      del.onclick=()=>{noteBlocks.splice(i,1);saveBlocks();renderBlocks();};
      row.appendChild(del);
      c.appendChild(row);return;
    }
    if(b.type==='database'){
      if(!b.dbData)b.dbData=jdbNewDatabase();
      const wrap=document.createElement('div');wrap.style.cssText='display:flex;flex-direction:column;gap:6px;margin:6px 0;background:var(--navy3);border:1px solid var(--border);border-radius:10px;padding:10px';
      const header=document.createElement('div');header.style.cssText='display:flex;align-items:center;justify-content:space-between';
      header.innerHTML='<span style="font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--teal)"><i class="ti ti-database"></i> Database</span>';
      const del=document.createElement('button');del.innerHTML='<i class="ti ti-x" style="font-size:11px"></i>';del.style.cssText='background:transparent;border:none;color:var(--text3);cursor:pointer';
      del.onclick=()=>{noteBlocks.splice(i,1);saveBlocks();renderBlocks();};
      header.appendChild(del);
      wrap.appendChild(header);
      const host=document.createElement('div');
      wrap.appendChild(host);
      c.appendChild(wrap);
      renderDatabaseBlock(host,b.dbData,()=>saveBlocks());
      return;
    }
    if(b.type==='table'){
      if(!b.tableData)b.tableData=[['','',],['','',]];
      const wrap=document.createElement('div');wrap.style.cssText='display:flex;flex-direction:column;gap:4px;margin:4px 0';
      const table=document.createElement('table');table.className='btable';
      b.tableData.forEach((rowData,ri)=>{
        const tr=document.createElement('tr');
        rowData.forEach((cell,ci)=>{
          const td=document.createElement('td');td.contentEditable='true';td.textContent=cell;
          td.oninput=()=>{noteBlocks[i].tableData[ri][ci]=td.textContent;saveBlocks();};
          tr.appendChild(td);
        });
        table.appendChild(tr);
      });
      wrap.appendChild(table);
      const controls=document.createElement('div');controls.style.cssText='display:flex;gap:6px';
      const addRowBtn=document.createElement('button');addRowBtn.textContent='+ Row';addRowBtn.style.cssText='background:var(--navy3);border:1px solid var(--border);border-radius:6px;color:var(--text3);font-size:9px;padding:3px 8px;cursor:pointer';
      addRowBtn.onclick=()=>{noteBlocks[i].tableData.push(new Array(noteBlocks[i].tableData[0].length).fill(''));saveBlocks();renderBlocks();};
      const addColBtn=document.createElement('button');addColBtn.textContent='+ Col';addColBtn.style.cssText=addRowBtn.style.cssText;
      addColBtn.onclick=()=>{noteBlocks[i].tableData.forEach(r=>r.push(''));saveBlocks();renderBlocks();};
      const delBtn=document.createElement('button');delBtn.innerHTML='<i class="ti ti-trash" style="font-size:9px"></i>';delBtn.style.cssText=addRowBtn.style.cssText;
      delBtn.onclick=()=>{noteBlocks.splice(i,1);saveBlocks();renderBlocks();};
      controls.appendChild(addRowBtn);controls.appendChild(addColBtn);controls.appendChild(delBtn);
      wrap.appendChild(controls);
      c.appendChild(wrap);return;
    }
    if(b.type==='page'||b.type==='pagelink'){
      const row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:8px;padding:8px 10px;margin:2px 0;background:var(--navy3);border:1px solid var(--border);border-radius:8px;cursor:pointer';
      const targetNote=b.linkedNoteId?DB.notes.find(n=>n.id===b.linkedNoteId):null;
      row.innerHTML=`<i class="ti ti-file-text" style="color:var(--teal)"></i><span style="flex:1;font-size:var(--text-sm);color:var(--text1)">${targetNote?targetNote.title:(b.type==='page'?'Untitled sub-page':'Choose a page to link...')}</span><i class="ti ti-chevron-right" style="color:var(--text3);font-size:12px"></i>`;
      row.onclick=()=>{
        if(targetNote){
          const idx=DB.notes.indexOf(targetNote);
          currentNote=idx;noteBlocks=[...targetNote.blocks];
          document.getElementById('noteTitle').textContent=targetNote.title;
          renderBlocks();
        }else if(b.type==='pagelink'){
          _pickNoteForLink(i);
        }
      };
      const del=document.createElement('button');del.innerHTML='<i class="ti ti-x" style="font-size:var(--text-xs)"></i>';del.style.cssText='background:transparent;border:none;color:var(--text3);cursor:pointer;flex-shrink:0';
      del.onclick=(e)=>{e.stopPropagation();noteBlocks.splice(i,1);saveBlocks();renderBlocks();};
      row.appendChild(del);
      c.appendChild(row);return;
    }
    const row=document.createElement('div');row.style.cssText='display:flex;align-items:flex-start;gap:5px;padding:1px 0';
    let fmtBtn=null;
    if(b.type==='todo'){
      const ch=document.createElement('div');ch.className='bcheck'+(b.done?' done':'');if(b.done)ch.textContent='✓';
      ch.onclick=()=>{noteBlocks[i].done=!noteBlocks[i].done;saveBlocks();syncBlockToTask(noteBlocks[i]);renderBlocks();};
      row.appendChild(ch);
      const taskBtn=document.createElement('button');
      const linked=!!b.taskId&&DB.tasks.some(t=>t.id===b.taskId);
      taskBtn.innerHTML=`<i class="ti ${linked?'ti-checklist':'ti-subtask'}" style="font-size:var(--text-xs);line-height:1;display:block"></i>`;
      taskBtn.title=linked?'Linked to Tasks Dashboard — click to unlink':'Send to Tasks Dashboard';
      taskBtn.style.cssText='background:transparent;border:none;cursor:pointer;padding:0 2px;flex-shrink:0;margin-top:2px;color:'+(linked?'var(--teal)':'var(--text3)');
      taskBtn.onclick=(e)=>{e.stopPropagation();toggleBlockTaskLink(i);};
      fmtBtn=taskBtn;
    }else if(b.type==='bullet'){
      const dot=document.createElement('span');dot.textContent='·';dot.style.cssText='color:var(--teal);font-size:var(--text-md);margin-top:2px;flex-shrink:0;padding:0 3px';row.appendChild(dot);
      const toggleBtn=document.createElement('button');toggleBtn.innerHTML='<i class="ti ti-align-left" style="font-size:var(--text-xs);line-height:1;display:block"></i>';toggleBtn.title='Switch to paragraph';
      toggleBtn.style.cssText='background:transparent;border:none;color:var(--text3);cursor:pointer;padding:0 2px;flex-shrink:0;margin-top:2px;opacity:0;transition:opacity .15s';
      toggleBtn.onclick=(e)=>{e.stopPropagation();noteBlocks[i].type='p';saveBlocks();renderBlocks();};
      fmtBtn=toggleBtn;
    }else if(b.type==='numbered'){
      numberedRun++;
      const num=document.createElement('span');num.textContent=numberedRun+'.';num.style.cssText='color:var(--teal);font-size:var(--text-sm);margin-top:3px;flex-shrink:0;padding:0 3px;min-width:16px';row.appendChild(num);
      const toggleBtn=document.createElement('button');toggleBtn.innerHTML='<i class="ti ti-align-left" style="font-size:var(--text-xs);line-height:1;display:block"></i>';toggleBtn.title='Switch to paragraph';
      toggleBtn.style.cssText='background:transparent;border:none;color:var(--text3);cursor:pointer;padding:0 2px;flex-shrink:0;margin-top:2px;opacity:0;transition:opacity .15s';
      toggleBtn.onclick=(e)=>{e.stopPropagation();noteBlocks[i].type='p';saveBlocks();renderBlocks();};
      fmtBtn=toggleBtn;
    }else if(b.type==='toggle'){
      const arrow=document.createElement('button');arrow.innerHTML=`<i class="ti ti-chevron-${b.collapsed===false?'down':'right'}" style="font-size:var(--text-xs);line-height:1;display:block"></i>`;
      arrow.style.cssText='background:transparent;border:none;color:var(--text2);cursor:pointer;padding:0 2px;flex-shrink:0;margin-top:3px';
      arrow.onclick=()=>{noteBlocks[i].collapsed=noteBlocks[i].collapsed===false?true:false;saveBlocks();renderBlocks();};
      row.appendChild(arrow);
    }else if(b.type==='p'){
      const toggleBtn=document.createElement('button');toggleBtn.innerHTML='<i class="ti ti-list" style="font-size:var(--text-xs);line-height:1;display:block"></i>';toggleBtn.title='Switch to bullet list';
      toggleBtn.style.cssText='background:transparent;border:none;color:var(--text3);cursor:pointer;padding:0 2px;flex-shrink:0;margin-top:2px;opacity:0;transition:opacity .15s';
      toggleBtn.onclick=(e)=>{e.stopPropagation();noteBlocks[i].type='bullet';saveBlocks();renderBlocks();};
      fmtBtn=toggleBtn;
    }
    const richTextEligible=b.type!=='todo';
    const content=document.createElement('div');content.className='bcontent'+(b.done?' bdone':'');content.dataset.t=b.type;content.contentEditable='true';
    if(richTextEligible)content.innerHTML=b.content||''; else content.textContent=b.content||'';
    content.oninput=()=>{
      let val=content.textContent; // plain-text check, used only for bullet auto-detect below
      // "/" as the entire content of an empty block opens the slash command menu
      if(val==='/'){_showSlashMenu(i,content);}else{_hideSlashMenu();}
      // Auto-detect bullet formatting: "- " or "* " at the start of a paragraph
      if(noteBlocks[i].type==='p'&&/^([-*])\s/.test(val)){
        val=val.replace(/^([-*])\s/,'');
        noteBlocks[i].type='bullet';
        noteBlocks[i].content=val;
        saveBlocks();renderBlocks();
        setTimeout(()=>{const els=c.querySelectorAll('.bcontent');if(els[i]){els[i].focus();placeCaretAtEnd(els[i]);}},10);
        return;
      }
      noteBlocks[i].content=richTextEligible?content.innerHTML:val;saveBlocksDebounced();
      syncBlockToTaskDebounced(noteBlocks[i]);
    };
    const headingLike=['h1','h2','h3','h4','quote'];
    content.onkeydown=(e)=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();noteBlocks.splice(i+1,0,{id:Date.now()+'.'+Math.random().toString(36).slice(2,7),type:headingLike.includes(b.type)?'p':b.type,content:'',done:false});saveBlocks();renderBlocks();setTimeout(()=>{const els=c.querySelectorAll('.bcontent');if(els[i+1])els[i+1].focus();},10);}if(e.key==='Backspace'&&content.textContent===''&&noteBlocks.length>1){e.preventDefault();unlinkBlockTask(noteBlocks[i]);noteBlocks.splice(i,1);saveBlocks();renderBlocks();}};
    row.appendChild(content);
    if(fmtBtn){row.addEventListener('mouseenter',()=>fmtBtn.style.opacity='1');row.addEventListener('mouseleave',()=>fmtBtn.style.opacity=b.type==='todo'?'1':'0');fmtBtn.style.opacity=b.type==='todo'?'1':'0';row.appendChild(fmtBtn);}
    const del=document.createElement('button');del.innerHTML='<i class="ti ti-x" style="font-size:var(--text-xs);line-height:1;display:block"></i>';del.style.cssText='background:transparent;border:none;color:var(--text3);cursor:pointer;opacity:0;transition:opacity .15s;padding:0 2px;flex-shrink:0;margin-top:3px';del.onclick=()=>{unlinkBlockTask(noteBlocks[i]);noteBlocks.splice(i,1);saveBlocks();renderBlocks();};row.addEventListener('mouseenter',()=>del.style.opacity='1');row.addEventListener('mouseleave',()=>del.style.opacity='0');row.appendChild(del);
    c.appendChild(row);
    if(b.type==='toggle'&&b.collapsed===false){
      const detail=document.createElement('div');detail.dataset.toggleDetail='1';detail.style.cssText='margin-left:22px;padding:4px 10px;border-left:2px solid var(--border);font-size:var(--text-sm);color:var(--text2);min-height:24px;outline:none';
      detail.contentEditable='true';detail.textContent=b.toggleContent||'';
      detail.dataset.placeholder='Add details...';
      detail.oninput=()=>{noteBlocks[i].toggleContent=detail.textContent;saveBlocks();};
      c.appendChild(detail);
    }
  });
  // Drag-reorder blocks within the note (Edit mode only) — maps container
  // children to noteBlocks by position, skipping toggle-detail divs (which
  // are extra content under a toggle, not blocks of their own).
  if(jelixEditMode){
    const blockEls=[...c.children].filter(el=>!el.dataset.toggleDetail);
    blockEls.forEach((el,pos)=>{
      el.draggable=true;
      el.style.cursor='grab';
      el.style.position=el.style.position||'relative';
      el.addEventListener('dragstart',()=>{window._blockDragPos=pos;el.style.opacity='.4';});
      el.addEventListener('dragend',()=>{el.style.opacity='1';});
      el.addEventListener('dragover',(e)=>{e.preventDefault();el.style.outline='1px solid var(--teal)';});
      el.addEventListener('dragleave',()=>{el.style.outline='';});
      el.addEventListener('drop',(e)=>{
        e.preventDefault();el.style.outline='';
        const from=window._blockDragPos;
        if(from===undefined||from===pos)return;
        const [moved]=noteBlocks.splice(from,1);
        noteBlocks.splice(pos,0,moved);
        saveBlocks();renderBlocks();
      });
      // Touch-device fallback — HTML5 drag doesn't work reliably on mobile
      const updown=document.createElement('div');
      updown.style.cssText='position:absolute;left:-24px;top:2px;display:flex;flex-direction:column;gap:1px;opacity:0;transition:opacity .15s';
      updown.innerHTML=`<button onmousedown="event.preventDefault()" onclick="moveNoteBlock(${pos},-1)" style="background:transparent;border:none;color:var(--text4);cursor:pointer;padding:0;line-height:1"><i class="ti ti-chevron-up" style="font-size:11px;display:block"></i></button><button onmousedown="event.preventDefault()" onclick="moveNoteBlock(${pos},1)" style="background:transparent;border:none;color:var(--text4);cursor:pointer;padding:0;line-height:1"><i class="ti ti-chevron-down" style="font-size:11px;display:block"></i></button>`;
      el.appendChild(updown);
      el.addEventListener('mouseenter',()=>updown.style.opacity='1');
      el.addEventListener('mouseleave',()=>updown.style.opacity='0');
    });
  }
  const addBtn=document.querySelector('.addbl');
  if(!jelixEditMode){
    c.querySelectorAll('[contenteditable="true"]').forEach(el=>el.contentEditable='false');
    c.querySelectorAll('button').forEach(btn=>{if(btn.innerHTML.includes('ti-x')||btn.innerHTML.includes('ti-trash')||btn.innerHTML.includes('ti-pencil'))btn.style.display='none';});
    if(addBtn)addBtn.style.display='none';
  }else if(addBtn){addBtn.style.display='';}
}
function moveNoteBlock(pos,dir){
  const newPos=pos+dir;
  if(newPos<0||newPos>=noteBlocks.length)return;
  [noteBlocks[pos],noteBlocks[newPos]]=[noteBlocks[newPos],noteBlocks[pos]];
  saveBlocks();renderBlocks();
}
async function _pickNoteForLink(blockIndex){
  const titles=DB.notes.map((n,idx)=>(idx+1)+'. '+(n.title||'Untitled'));
  const result=await jelixPrompt('Link to Page',[{key:'choice',label:'Page number:\n'+titles.join('\n'),type:'number',placeholder:'1'}],'Link');
  const choice=result?.[0];
  if(!choice)return;
  const idx=parseInt(choice.trim(),10)-1;
  if(idx>=0&&idx<DB.notes.length){
    noteBlocks[blockIndex].linkedNoteId=DB.notes[idx].id;
    saveBlocks();renderBlocks();
  }
}
function placeCaretAtEnd(el){const range=document.createRange();range.selectNodeContents(el);range.collapse(false);const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);}

// ═══════════════════════════════════════════════════════════════════════════
// TEXT FORMATTING — a floating toolbar appears on text selection inside any
// Notes block (except To-do, which stays plain text since it syncs to Tasks).
// Bold/Italic/Underline/color/size, applied to just the selected text.
// ═══════════════════════════════════════════════════════════════════════════
function _initTextSelectionToolbar(){
  if(window._jelixSelToolbarInit)return;
  window._jelixSelToolbarInit=true;
  document.addEventListener('mouseup',_maybeShowSelToolbar);
  document.addEventListener('keyup',_maybeShowSelToolbar);
  document.addEventListener('mousedown',(e)=>{
    const tb=document.getElementById('jelixSelToolbar');
    if(tb&&!tb.contains(e.target))tb.style.display='none';
  });
}
function _maybeShowSelToolbar(){
  if(!jelixEditMode){const tb=document.getElementById('jelixSelToolbar');if(tb)tb.style.display='none';return;}
  const sel=window.getSelection();
  if(!sel||sel.isCollapsed||!sel.toString().trim()){const tb=document.getElementById('jelixSelToolbar');if(tb)tb.style.display='none';return;}
  const range=sel.getRangeAt(0);
  let node=range.commonAncestorContainer;
  if(node.nodeType===3)node=node.parentElement;
  const block=node?.closest?.('.bcontent');
  const container=document.getElementById('blocksContainer');
  if(!block||block.dataset.t==='todo'||!container||!container.contains(block)){const tb=document.getElementById('jelixSelToolbar');if(tb)tb.style.display='none';return;}
  _showSelToolbar(range,block);
}
function _showSelToolbar(range,block){
  let tb=document.getElementById('jelixSelToolbar');
  if(!tb){
    tb=document.createElement('div');tb.id='jelixSelToolbar';
    tb.style.cssText='position:fixed;z-index:9999;background:var(--navy1);border:1px solid var(--border2);border-radius:10px;padding:5px;display:flex;align-items:center;gap:2px;box-shadow:0 6px 20px rgba(0,0,0,.45)';
    const mkBtn=(label,cmd,arg,extraStyle)=>`<button onmousedown="event.preventDefault();document.execCommand('${cmd}',false,${arg===undefined?'undefined':`'${arg}'`});_saveActiveBlockAfterFormat()" style="background:transparent;border:none;color:var(--text2);cursor:pointer;padding:5px 8px;border-radius:6px;font-size:12px;${extraStyle||''}" onmouseover="this.style.background='var(--navy3)'" onmouseout="this.style.background='transparent'">${label}</button>`;
    tb.innerHTML=
      mkBtn('B','bold',undefined,'font-weight:800')+
      mkBtn('I','italic',undefined,'font-style:italic')+
      mkBtn('U','underline',undefined,'text-decoration:underline')+
      '<div style="width:1px;align-self:stretch;background:var(--border2);margin:2px 3px"></div>'+
      ['#f1f5f9','#00d4c8','#ffaa00','#ff6b7f','#bf5fff'].map(c=>`<button onmousedown="event.preventDefault();document.execCommand('foreColor',false,'${c}');_saveActiveBlockAfterFormat()" style="width:16px;height:16px;border-radius:50%;background:${c};border:1px solid var(--border2);cursor:pointer;padding:0;flex-shrink:0"></button>`).join('')+
      '<div style="width:1px;align-self:stretch;background:var(--border2);margin:2px 3px"></div>'+
      mkBtn('S','fontSize',2,'font-size:9px')+
      mkBtn('M','fontSize',4,'font-size:12px')+
      mkBtn('L','fontSize',6,'font-size:15px');
    document.body.appendChild(tb);
  }
  tb._activeBlockIndex=[...document.querySelectorAll('.bcontent')].indexOf(block);
  const r=range.getBoundingClientRect();
  tb.style.display='flex';
  const tbWidth=tb.offsetWidth||260;
  tb.style.left=Math.max(8,Math.min(window.innerWidth-tbWidth-8,r.left+r.width/2-tbWidth/2))+'px';
  tb.style.top=Math.max(8,r.top-44)+'px';
}
function _saveActiveBlockAfterFormat(){
  const tb=document.getElementById('jelixSelToolbar');
  const idx=tb?tb._activeBlockIndex:-1;
  const els=document.querySelectorAll('.bcontent');
  if(idx>=0&&els[idx]&&noteBlocks[idx]){
    noteBlocks[idx].content=els[idx].innerHTML;
    saveBlocks();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE (TABLE VIEW) — a real typed table, not just a plain grid: columns
// have types (Text/Number/Select/Date/Checkbox), select columns get
// color-coded pills. One engine, used both as a Notes block and a Domain
// module — the host just supplies where the data lives and how to persist it.
// ═══════════════════════════════════════════════════════════════════════════
const JDB_SELECT_COLORS=['var(--teal)','var(--amber)','var(--red)','var(--purple)','var(--green)','#3b82f6','var(--pink)'];
function jdbNewDatabase(){
  return{
    columns:[{id:'c1',name:'Name',type:'text'},{id:'c2',name:'Status',type:'select',options:[{v:'Not started',c:'var(--text3)'},{v:'In progress',c:'var(--amber)'},{v:'Done',c:'var(--green)'}]}],
    rows:[]
  };
}
function jdbColId(){return 'c'+Date.now()+Math.random().toString(36).slice(2,5);}
function jdbRowId(){return 'r'+Date.now()+Math.random().toString(36).slice(2,5);}
// ── View switcher — same columns/rows, five different presentations ────────
const JDB_VIEWS=[
  {id:'table',label:'Table',icon:'ti-table'},
  {id:'board',label:'Board',icon:'ti-layout-kanban'},
  {id:'gallery',label:'Gallery',icon:'ti-layout-grid'},
  {id:'list',label:'List',icon:'ti-list'},
  {id:'feed',label:'Feed',icon:'ti-news'},
  {id:'dashboard',label:'Dashboard',icon:'ti-chart-bar'},
  {id:'timeline',label:'Timeline',icon:'ti-clock'},
  {id:'map',label:'Map',icon:'ti-map-pin'},
  {id:'barv',label:'Bar Chart',icon:'ti-chart-bar'},
  {id:'barh',label:'Bar Chart (H)',icon:'ti-chart-bar'},
  {id:'line',label:'Line Chart',icon:'ti-chart-line'},
  {id:'donut',label:'Donut Chart',icon:'ti-chart-donut'},
  {id:'number',label:'Number',icon:'ti-hash'}
];
function _jdbTitleCol(dbData){return dbData.columns.find(c=>c.type==='text')||dbData.columns[0];}
function _jdbRowLabel(dbData,row){const tc=_jdbTitleCol(dbData);return(tc&&row.cells[tc.id])||'Untitled';}
function renderDatabaseBlock(hostEl,dbData,onChange){
  if(!dbData.columns||!dbData.columns.length){const d=jdbNewDatabase();dbData.columns=d.columns;dbData.rows=dbData.rows||[];}
  if(!dbData.rows)dbData.rows=[];
  if(!dbData.view)dbData.view='table';
  hostEl.innerHTML='';
  const tabs=document.createElement('div');tabs.style.cssText='display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap';
  JDB_VIEWS.forEach(v=>{
    const tab=document.createElement('button');
    const active=dbData.view===v.id;
    tab.innerHTML=`<i class="ti ${v.icon}" style="font-size:11px"></i> ${v.label}`;
    tab.style.cssText=`background:${active?'var(--teal3)':'var(--navy3)'};color:${active?'var(--teal)':'var(--text3)'};border:1px solid ${active?'var(--teal2)':'var(--border)'};border-radius:7px;font-size:9px;font-weight:700;padding:5px 10px;cursor:pointer`;
    tab.onclick=()=>{dbData.view=v.id;onChange();renderDatabaseBlock(hostEl,dbData,onChange);};
    tabs.appendChild(tab);
  });
  hostEl.appendChild(tabs);
  const body=document.createElement('div');
  hostEl.appendChild(body);
  const rerender=()=>renderDatabaseBlock(hostEl,dbData,onChange);
  if(dbData.view==='board')renderDatabaseBoardView(body,dbData,onChange,rerender);
  else if(dbData.view==='gallery')renderDatabaseGalleryView(body,dbData,onChange,rerender);
  else if(dbData.view==='list')renderDatabaseListView(body,dbData,onChange,rerender);
  else if(dbData.view==='feed')renderDatabaseFeedView(body,dbData,onChange,rerender);
  else if(dbData.view==='dashboard')renderDatabaseDashboardView(body,dbData,onChange,rerender);
  else if(dbData.view==='timeline')renderDatabaseTimelineView(body,dbData,onChange,rerender);
  else if(dbData.view==='map')renderDatabaseMapView(body,dbData,onChange,rerender);
  else if(dbData.view==='barv')renderDatabaseBarView(body,dbData,onChange,rerender,'v');
  else if(dbData.view==='barh')renderDatabaseBarView(body,dbData,onChange,rerender,'h');
  else if(dbData.view==='line')renderDatabaseLineView(body,dbData,onChange,rerender);
  else if(dbData.view==='donut')renderDatabaseDonutView(body,dbData,onChange,rerender);
  else if(dbData.view==='number')renderDatabaseNumberView(body,dbData,onChange,rerender);
  else renderDatabaseTableView(body,dbData,onChange);
}
// ── Board view — groups rows by a select column, Kanban-style ──────────────
function renderDatabaseBoardView(hostEl,dbData,onChange,rerender){
  const groupCol=dbData.columns.find(c=>c.type==='select');
  if(!groupCol){
    hostEl.innerHTML='<div style="font-size:var(--text-xs);color:var(--text3);padding:16px;text-align:center">Board view needs a Select column to group by — add one in Table view first.</div>';
    return;
  }
  const titleCol=_jdbTitleCol(dbData);
  const groups=(groupCol.options||[]).map(o=>o.v);
  groups.push(''); // ungrouped bucket
  const wrap=document.createElement('div');wrap.style.cssText='display:flex;gap:10px;overflow-x:auto;padding-bottom:4px';
  groups.forEach(g=>{
    const opt=(groupCol.options||[]).find(o=>o.v===g);
    const rowsInGroup=dbData.rows.filter(r=>(r.cells[groupCol.id]||'')===g);
    const col=document.createElement('div');col.style.cssText='min-width:200px;flex-shrink:0;background:var(--navy2);border:1px solid var(--border);border-top:2px solid '+(opt?opt.c:'var(--text4)')+';border-radius:10px;overflow:hidden';
    col.innerHTML=`<div style="padding:7px 10px;border-bottom:1px solid var(--border);font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${opt?opt.c:'var(--text3)'}">${g||'No '+groupCol.name} <span style="color:var(--text3);font-weight:600">(${rowsInGroup.length})</span></div>`;
    const list=document.createElement('div');list.style.cssText='padding:6px;display:flex;flex-direction:column;gap:5px;max-height:400px;overflow-y:auto';
    rowsInGroup.forEach(row=>{
      const card=document.createElement('div');card.style.cssText='background:var(--navy3);border:1px solid var(--border);border-radius:7px;padding:8px 9px;font-size:var(--text-xs);color:var(--text1);cursor:pointer';
      card.textContent=titleCol?(row.cells[titleCol.id]||'Untitled'):'Untitled';
      card.onclick=async()=>{
        const opts=groups.filter(x=>x!==g);
        const result=await jelixPrompt('Move Item',[{key:'choice',label:'Move to which '+groupCol.name+'?\n'+opts.map((o,i)=>(i+1)+'. '+(o||'(none)')).join('\n'),type:'number',placeholder:'1'}],'Move');
        const choice=result?.[0];
        if(!choice)return;
        const idx=parseInt(choice.trim(),10)-1;
        if(idx>=0&&idx<opts.length){row.cells[groupCol.id]=opts[idx];onChange();rerender();}
      };
      list.appendChild(card);
    });
    const addBtn=document.createElement('div');addBtn.style.cssText='padding:6px;text-align:center;font-size:9px;color:var(--text3);cursor:pointer;border-top:1px solid var(--border)';
    addBtn.innerHTML='<i class="ti ti-plus"></i> Add';
    addBtn.onclick=async()=>{
      const result=await jelixPrompt('New '+(titleCol?titleCol.name:'Item'),[{key:'name',label:(titleCol?titleCol.name:'Item')+' name'}],'Add');
      const name=result?.[0];if(!name)return;
      const row={id:jdbRowId(),cells:{}};
      if(titleCol)row.cells[titleCol.id]=name;
      row.cells[groupCol.id]=g;
      dbData.rows.push(row);onChange();rerender();
    };
    col.appendChild(list);col.appendChild(addBtn);
    wrap.appendChild(col);
  });
  hostEl.appendChild(wrap);
}
// ── Gallery view — card grid ─────────────────────────────────────────────
function renderDatabaseGalleryView(hostEl,dbData,onChange,rerender){
  const titleCol=_jdbTitleCol(dbData);
  const otherCols=dbData.columns.filter(c=>c!==titleCol).slice(0,3);
  const grid=document.createElement('div');grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px';
  dbData.rows.forEach(row=>{
    const card=document.createElement('div');card.style.cssText='background:var(--navy3);border:1px solid var(--border);border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:5px;position:relative';
    const title=document.createElement('div');title.style.cssText='font-size:var(--text-sm);font-weight:700;color:var(--text1)';title.textContent=_jdbRowLabel(dbData,row);
    card.appendChild(title);
    otherCols.forEach(col=>{
      const val=row.cells[col.id];if(val===undefined||val==='')return;
      const line=document.createElement('div');line.style.cssText='font-size:9px;color:var(--text3)';
      if(col.type==='select'){const opt=(col.options||[]).find(o=>o.v===val);line.innerHTML=`<span style="background:${opt?opt.c+'22':'var(--navy4)'};color:${opt?opt.c:'var(--text3)'};padding:1px 7px;border-radius:100px;font-weight:600">${val}</span>`;}
      else if(col.type==='checkbox')line.textContent=val?'✓ '+col.name:'';
      else line.textContent=col.name+': '+val;
      if(line.textContent||line.innerHTML)card.appendChild(line);
    });
    const del=document.createElement('button');del.innerHTML='<i class="ti ti-x" style="font-size:10px"></i>';del.style.cssText='position:absolute;top:6px;right:6px;background:transparent;border:none;color:var(--text4);cursor:pointer';
    del.onclick=()=>{dbData.rows=dbData.rows.filter(r=>r.id!==row.id);onChange();rerender();};
    card.appendChild(del);
    grid.appendChild(card);
  });
  hostEl.appendChild(grid);
  const addBtn=document.createElement('button');addBtn.innerHTML='<i class="ti ti-plus" style="font-size:10px"></i> New Card';
  addBtn.style.cssText='background:var(--navy3);border:1px solid var(--border);border-radius:6px;color:var(--text3);font-size:9px;padding:5px 10px;cursor:pointer;margin-top:8px';
  addBtn.onclick=()=>{dbData.rows.push({id:jdbRowId(),cells:{}});onChange();rerender();};
  hostEl.appendChild(addBtn);
}
// ── List view — compact rows, title + inline fields ─────────────────────
function renderDatabaseListView(hostEl,dbData,onChange,rerender){
  const titleCol=_jdbTitleCol(dbData);
  const list=document.createElement('div');list.style.cssText='display:flex;flex-direction:column;gap:4px';
  dbData.rows.forEach(row=>{
    const item=document.createElement('div');item.style.cssText='display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--navy3);border:1px solid var(--border);border-radius:8px';
    const title=document.createElement('span');title.style.cssText='flex:1;font-size:var(--text-sm);color:var(--text1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap';title.textContent=_jdbRowLabel(dbData,row);
    item.appendChild(title);
    dbData.columns.filter(c=>c!==titleCol&&c.type==='select').slice(0,1).forEach(col=>{
      const val=row.cells[col.id];if(!val)return;
      const opt=(col.options||[]).find(o=>o.v===val);
      const pill=document.createElement('span');pill.style.cssText=`font-size:9px;font-weight:600;padding:2px 8px;border-radius:100px;background:${opt?opt.c+'22':'var(--navy4)'};color:${opt?opt.c:'var(--text3)'};flex-shrink:0`;pill.textContent=val;
      item.appendChild(pill);
    });
    const del=document.createElement('button');del.innerHTML='<i class="ti ti-x" style="font-size:10px"></i>';del.style.cssText='background:transparent;border:none;color:var(--text4);cursor:pointer;flex-shrink:0';
    del.onclick=()=>{dbData.rows=dbData.rows.filter(r=>r.id!==row.id);onChange();rerender();};
    item.appendChild(del);
    list.appendChild(item);
  });
  hostEl.appendChild(list);
  const addBtn=document.createElement('button');addBtn.innerHTML='<i class="ti ti-plus" style="font-size:10px"></i> New Item';
  addBtn.style.cssText='background:var(--navy3);border:1px solid var(--border);border-radius:6px;color:var(--text3);font-size:9px;padding:5px 10px;cursor:pointer;margin-top:6px';
  addBtn.onclick=()=>{dbData.rows.push({id:jdbRowId(),cells:{}});onChange();rerender();};
  hostEl.appendChild(addBtn);
}
// ── Feed view — chronological cards, newest first if a Date column exists ──
function renderDatabaseFeedView(hostEl,dbData,onChange,rerender){
  const titleCol=_jdbTitleCol(dbData);
  const dateCol=dbData.columns.find(c=>c.type==='date');
  const rows=dateCol?[...dbData.rows].sort((a,b)=>(b.cells[dateCol.id]||'').localeCompare(a.cells[dateCol.id]||'')):dbData.rows;
  const feed=document.createElement('div');feed.style.cssText='display:flex;flex-direction:column;gap:8px';
  rows.forEach(row=>{
    const card=document.createElement('div');card.style.cssText='background:var(--navy3);border:1px solid var(--border);border-left:3px solid var(--teal);border-radius:8px;padding:10px 12px';
    const top=document.createElement('div');top.style.cssText='display:flex;justify-content:space-between;align-items:center;margin-bottom:4px';
    const title=document.createElement('span');title.style.cssText='font-size:var(--text-sm);font-weight:700;color:var(--text1)';title.textContent=_jdbRowLabel(dbData,row);
    top.appendChild(title);
    if(dateCol&&row.cells[dateCol.id]){const d=document.createElement('span');d.style.cssText='font-size:9px;color:var(--text3)';d.textContent=row.cells[dateCol.id];top.appendChild(d);}
    card.appendChild(top);
    dbData.columns.filter(c=>c!==titleCol&&c!==dateCol).forEach(col=>{
      const val=row.cells[col.id];if(val===undefined||val==='')return;
      const line=document.createElement('div');line.style.cssText='font-size:var(--text-xs);color:var(--text3);margin-top:2px';
      line.textContent=col.name+': '+val;
      card.appendChild(line);
    });
    feed.appendChild(card);
  });
  hostEl.appendChild(feed);
  const addBtn=document.createElement('button');addBtn.innerHTML='<i class="ti ti-plus" style="font-size:10px"></i> New Entry';
  addBtn.style.cssText='background:var(--navy3);border:1px solid var(--border);border-radius:6px;color:var(--text3);font-size:9px;padding:5px 10px;cursor:pointer;margin-top:8px';
  addBtn.onclick=()=>{dbData.rows.push({id:jdbRowId(),cells:{}});onChange();rerender();};
  hostEl.appendChild(addBtn);
}
// ── Dashboard view — aggregate stats, not raw rows ──────────────────────
function renderDatabaseDashboardView(hostEl,dbData,onChange,rerender){
  const wrap=document.createElement('div');wrap.style.cssText='display:flex;flex-direction:column;gap:12px';
  const totalCard=document.createElement('div');totalCard.style.cssText='background:var(--navy3);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center';
  totalCard.innerHTML=`<div style="font-size:24px;font-weight:800;color:var(--teal)">${dbData.rows.length}</div><div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em">Total Rows</div>`;
  wrap.appendChild(totalCard);
  dbData.columns.filter(c=>c.type==='select').forEach(col=>{
    const box=document.createElement('div');box.style.cssText='background:var(--navy3);border:1px solid var(--border);border-radius:10px;padding:10px 12px';
    box.innerHTML=`<div style="font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);margin-bottom:8px">${col.name}</div>`;
    (col.options||[]).forEach(opt=>{
      const count=dbData.rows.filter(r=>r.cells[col.id]===opt.v).length;
      const pct=dbData.rows.length?Math.round((count/dbData.rows.length)*100):0;
      const row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:8px;margin-bottom:5px';
      row.innerHTML=`<span style="font-size:var(--text-xs);color:${opt.c};min-width:90px;flex-shrink:0">${opt.v}</span><div style="flex:1;height:6px;background:var(--navy4);border-radius:4px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${opt.c};border-radius:4px"></div></div><span style="font-size:9px;color:var(--text3);flex-shrink:0">${count}</span>`;
      box.appendChild(row);
    });
    wrap.appendChild(box);
  });
  dbData.columns.filter(c=>c.type==='checkbox').forEach(col=>{
    const done=dbData.rows.filter(r=>r.cells[col.id]).length;
    const box=document.createElement('div');box.style.cssText='background:var(--navy3);border:1px solid var(--border);border-radius:10px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center';
    box.innerHTML=`<span style="font-size:var(--text-xs);color:var(--text2)">${col.name}</span><span style="font-size:var(--text-sm);font-weight:700;color:var(--teal)">${done} / ${dbData.rows.length}</span>`;
    wrap.appendChild(box);
  });
  hostEl.appendChild(wrap);
}
// ── Shared chart controls: pick a column to group/aggregate by ─────────────
function _jdbChartControls(hostEl,dbData,onChange,rerender,needsValue){
  if(!dbData.chartConfig)dbData.chartConfig={};
  const bar=document.createElement('div');bar.style.cssText='display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center';
  const groupSel=document.createElement('select');groupSel.style.cssText='background:var(--navy3);border:1px solid var(--border);border-radius:6px;color:var(--text2);font-size:9px;padding:5px 8px';
  groupSel.innerHTML='<option value="">Group by...</option>'+dbData.columns.filter(c=>c.type==='select'||c.type==='text').map(c=>`<option value="${c.id}" ${dbData.chartConfig.groupCol===c.id?'selected':''}>${c.name}</option>`).join('');
  groupSel.onchange=()=>{dbData.chartConfig.groupCol=groupSel.value;onChange();rerender();};
  bar.appendChild(groupSel);
  if(needsValue){
    const valSel=document.createElement('select');valSel.style.cssText=groupSel.style.cssText;
    valSel.innerHTML='<option value="">Count of rows</option>'+dbData.columns.filter(c=>c.type==='number').map(c=>`<option value="${c.id}" ${dbData.chartConfig.valueCol===c.id?'selected':''}>Sum of ${c.name}</option>`).join('');
    valSel.onchange=()=>{dbData.chartConfig.valueCol=valSel.value;onChange();rerender();};
    bar.appendChild(valSel);
  }
  hostEl.appendChild(bar);
}
function _jdbAggregate(dbData){
  const groupColId=dbData.chartConfig?.groupCol;
  if(!groupColId)return null;
  const valueColId=dbData.chartConfig?.valueCol;
  const buckets={};
  dbData.rows.forEach(r=>{
    const key=r.cells[groupColId]||'(none)';
    const val=valueColId?(parseFloat(r.cells[valueColId])||0):1;
    buckets[key]=(buckets[key]||0)+val;
  });
  return Object.entries(buckets);
}
function _jdbEmpty(msg){const d=document.createElement('div');d.style.cssText='font-size:var(--text-xs);color:var(--text3);padding:20px;text-align:center';d.textContent=msg;return d;}
// ── Timeline view — rows plotted along a Date column ────────────────────
function renderDatabaseTimelineView(hostEl,dbData,onChange,rerender){
  const dateCol=dbData.columns.find(c=>c.type==='date');
  if(!dateCol){hostEl.appendChild(_jdbEmpty('Timeline needs a Date column — add one in Table view first.'));return;}
  const rows=dbData.rows.filter(r=>r.cells[dateCol.id]).sort((a,b)=>a.cells[dateCol.id].localeCompare(b.cells[dateCol.id]));
  if(!rows.length){hostEl.appendChild(_jdbEmpty('No rows with a date yet.'));return;}
  const track=document.createElement('div');track.style.cssText='position:relative;padding-left:16px;border-left:2px solid var(--border)';
  rows.forEach(row=>{
    const item=document.createElement('div');item.style.cssText='position:relative;padding:0 0 16px 14px';
    item.innerHTML=`<span style="position:absolute;left:-21px;top:2px;width:9px;height:9px;border-radius:50%;background:var(--teal);border:2px solid var(--navy1)"></span>
      <div style="font-size:9px;color:var(--text3);margin-bottom:2px">${row.cells[dateCol.id]}</div>
      <div style="font-size:var(--text-sm);color:var(--text1);font-weight:600">${_jdbRowLabel(dbData,row)}</div>`;
    track.appendChild(item);
  });
  hostEl.appendChild(track);
}
// ── Map view — location list (pin + label). No live map tiles/geocoding in
// a single-file app without a maps API key, so this is an honest list view
// rather than a fake interactive map. ────────────────────────────────────
function renderDatabaseMapView(hostEl,dbData,onChange,rerender){
  const locCol=dbData.columns.find(c=>/location|address|place|map/i.test(c.name))||dbData.columns.find(c=>c.type==='text'&&c!==_jdbTitleCol(dbData));
  if(!locCol){hostEl.appendChild(_jdbEmpty('Add a text column named "Location" or "Address" to use Map view.'));return;}
  const note=document.createElement('div');note.style.cssText='font-size:9px;color:var(--text4);margin-bottom:8px';note.textContent='Location list (no live map tiles in-app) — tap a pin to search it on Google Maps.';
  hostEl.appendChild(note);
  const list=document.createElement('div');list.style.cssText='display:flex;flex-direction:column;gap:6px';
  dbData.rows.forEach(row=>{
    const loc=row.cells[locCol.id];if(!loc)return;
    const item=document.createElement('div');item.style.cssText='display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--navy3);border:1px solid var(--border);border-radius:8px;cursor:pointer';
    item.innerHTML=`<i class="ti ti-map-pin" style="color:var(--red)"></i><div style="flex:1"><div style="font-size:var(--text-sm);color:var(--text1);font-weight:600">${_jdbRowLabel(dbData,row)}</div><div style="font-size:9px;color:var(--text3)">${loc}</div></div><i class="ti ti-external-link" style="color:var(--text3);font-size:11px"></i>`;
    item.onclick=()=>window.open('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(loc),'_blank');
    list.appendChild(item);
  });
  hostEl.appendChild(list);
}
// ── Bar chart — vertical or horizontal, grouped/aggregated ──────────────
function renderDatabaseBarView(hostEl,dbData,onChange,rerender,orientation){
  _jdbChartControls(hostEl,dbData,onChange,rerender,true);
  const entries=_jdbAggregate(dbData);
  if(!entries){hostEl.appendChild(_jdbEmpty('Pick a column to group by above.'));return;}
  if(!entries.length){hostEl.appendChild(_jdbEmpty('No data yet.'));return;}
  const max=Math.max(...entries.map(e=>e[1]),1);
  const box=document.createElement('div');
  if(orientation==='v'){
    box.style.cssText='display:flex;align-items:flex-end;gap:14px;height:160px;padding:10px 6px;overflow-x:auto';
    entries.forEach(([label,val])=>{
      const col=document.createElement('div');col.style.cssText='display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0;height:100%;justify-content:flex-end;min-width:40px';
      const h=Math.max(4,(val/max)*110);
      col.innerHTML=`<span style="font-size:9px;font-weight:700;color:var(--text2)">${val}</span><div style="width:32px;height:${h}px;background:var(--teal);border-radius:4px 4px 0 0"></div><span style="font-size:9px;color:var(--text3);max-width:48px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${label}</span>`;
      box.appendChild(col);
    });
  }else{
    box.style.cssText='display:flex;flex-direction:column;gap:8px;padding:6px';
    entries.forEach(([label,val])=>{
      const w=Math.max(2,(val/max)*100);
      const row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:8px';
      row.innerHTML=`<span style="font-size:9px;color:var(--text3);min-width:80px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${label}</span><div style="flex:1;background:var(--navy4);border-radius:4px;height:16px;overflow:hidden"><div style="width:${w}%;height:100%;background:var(--teal);border-radius:4px"></div></div><span style="font-size:9px;font-weight:700;color:var(--text2);min-width:24px">${val}</span>`;
      box.appendChild(row);
    });
  }
  hostEl.appendChild(box);
}
// ── Line chart — a number column's values across rows ordered by Date ────
function renderDatabaseLineView(hostEl,dbData,onChange,rerender){
  const dateCol=dbData.columns.find(c=>c.type==='date');
  const numCol=dbData.columns.find(c=>c.type==='number');
  if(!dateCol||!numCol){hostEl.appendChild(_jdbEmpty('Line chart needs a Date column and a Number column.'));return;}
  const rows=dbData.rows.filter(r=>r.cells[dateCol.id]).sort((a,b)=>a.cells[dateCol.id].localeCompare(b.cells[dateCol.id]));
  if(rows.length<2){hostEl.appendChild(_jdbEmpty('Need at least 2 dated rows to draw a line.'));return;}
  const vals=rows.map(r=>parseFloat(r.cells[numCol.id])||0);
  const max=Math.max(...vals,1),min=Math.min(...vals,0);
  const CW=Math.max(280,rows.length*40),CH=100;
  const pts=vals.map((v,i)=>{
    const x=(i/(vals.length-1))*CW;
    const y=CH-((v-min)/(max-min||1))*CH;
    return[x,y];
  });
  const path=pts.map((p,i)=>(i===0?'M':'L')+p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ');
  const dots=pts.map((p,i)=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="var(--teal)"/><text x="${p[0].toFixed(1)}" y="${(p[1]-8).toFixed(1)}" font-size="7" fill="var(--text3)" text-anchor="middle">${vals[i]}</text>`).join('');
  hostEl.innerHTML=`<div style="font-size:9px;color:var(--text3);margin-bottom:6px">${numCol.name} over time</div>
    <svg width="100%" height="${CH+20}" viewBox="0 0 ${CW} ${CH+20}" preserveAspectRatio="none" style="overflow:visible">
      <path d="${path}" fill="none" stroke="var(--teal)" stroke-width="2" vector-effect="non-scaling-stroke"/>
      ${dots}
    </svg>`;
}
// ── Donut chart — proportions of a grouped column ────────────────────────
function renderDatabaseDonutView(hostEl,dbData,onChange,rerender){
  _jdbChartControls(hostEl,dbData,onChange,rerender,false);
  const entries=_jdbAggregate(dbData);
  if(!entries){hostEl.appendChild(_jdbEmpty('Pick a column to group by above.'));return;}
  if(!entries.length){hostEl.appendChild(_jdbEmpty('No data yet.'));return;}
  const total=entries.reduce((s,e)=>s+e[1],0)||1;
  const colors=JDB_SELECT_COLORS;
  const R=45,C=2*Math.PI*R;
  let offset=0;
  const segs=entries.map(([label,val],i)=>{
    const frac=val/total;
    const dash=frac*C;
    const seg=`<circle cx="60" cy="60" r="${R}" fill="none" stroke="${colors[i%colors.length]}" stroke-width="16" stroke-dasharray="${dash.toFixed(1)} ${(C-dash).toFixed(1)}" stroke-dashoffset="${(-offset).toFixed(1)}" transform="rotate(-90 60 60)"/>`;
    offset+=dash;
    return seg;
  }).join('');
  const legend=entries.map(([label,val],i)=>`<div style="display:flex;align-items:center;gap:6px;font-size:9px;color:var(--text2)"><span style="width:8px;height:8px;border-radius:2px;background:${colors[i%colors.length]};flex-shrink:0"></span>${label} (${val})</div>`).join('');
  const wrap=document.createElement('div');wrap.style.cssText='display:flex;align-items:center;gap:18px;flex-wrap:wrap';
  wrap.innerHTML=`<svg width="120" height="120" viewBox="0 0 120 120">${segs}<text x="60" y="65" text-anchor="middle" font-size="16" font-weight="800" fill="var(--text1)">${total}</text></svg><div style="display:flex;flex-direction:column;gap:5px">${legend}</div>`;
  hostEl.appendChild(wrap);
}
// ── Number view — one big aggregate number ────────────────────────────────
function renderDatabaseNumberView(hostEl,dbData,onChange,rerender){
  const numCol=dbData.columns.find(c=>c.type==='number');
  const ctrl=document.createElement('div');ctrl.style.cssText='display:flex;gap:8px;margin-bottom:12px';
  const sel=document.createElement('select');sel.style.cssText='background:var(--navy3);border:1px solid var(--border);border-radius:6px;color:var(--text2);font-size:9px;padding:5px 8px';
  sel.innerHTML='<option value="count">Total Rows</option>'+dbData.columns.filter(c=>c.type==='number').map(c=>`<option value="${c.id}" ${dbData.chartConfig?.numberCol===c.id?'selected':''}>Sum of ${c.name}</option>`).join('');
  if(dbData.chartConfig?.numberCol)sel.value=dbData.chartConfig.numberCol;
  sel.onchange=()=>{if(!dbData.chartConfig)dbData.chartConfig={};dbData.chartConfig.numberCol=sel.value;onChange();rerender();};
  ctrl.appendChild(sel);
  hostEl.appendChild(ctrl);
  const mode=dbData.chartConfig?.numberCol;
  let value,label;
  if(!mode||mode==='count'){value=dbData.rows.length;label='Total Rows';}
  else{const col=dbData.columns.find(c=>c.id===mode);value=dbData.rows.reduce((s,r)=>s+(parseFloat(r.cells[mode])||0),0);label='Sum of '+(col?col.name:'');}
  const big=document.createElement('div');big.style.cssText='text-align:center;padding:24px';
  big.innerHTML=`<div style="font-size:44px;font-weight:800;color:var(--teal);letter-spacing:-.02em">${value.toLocaleString()}</div><div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-top:4px">${label}</div>`;
  hostEl.appendChild(big);
}
function renderDatabaseTableView(hostEl,dbData,onChange){
  if(!dbData.columns||!dbData.columns.length){const d=jdbNewDatabase();dbData.columns=d.columns;dbData.rows=dbData.rows||[];}
  if(!dbData.rows)dbData.rows=[];
  hostEl.innerHTML='';
  const wrap=document.createElement('div');wrap.style.cssText='overflow-x:auto';
  const table=document.createElement('table');table.className='jdb-table';
  // Header
  const thead=document.createElement('tr');
  dbData.columns.forEach(col=>{
    const th=document.createElement('th');th.style.minWidth='140px';
    const nameInp=document.createElement('input');nameInp.className='jdb-th-name';nameInp.value=col.name;
    nameInp.oninput=()=>{col.name=nameInp.value;_dbCellChangeDebounced(onChange);};
    const typeSel=document.createElement('select');typeSel.className='jdb-th-type';
    ['text','number','select','date','checkbox'].forEach(t=>{
      const o=document.createElement('option');o.value=t;o.textContent=t[0].toUpperCase()+t.slice(1);o.selected=col.type===t;typeSel.appendChild(o);
    });
    typeSel.onchange=()=>{col.type=typeSel.value;if(col.type==='select'&&!col.options)col.options=[];onChange();renderDatabaseTableView(hostEl,dbData,onChange);};
    th.appendChild(nameInp);th.appendChild(typeSel);
    thead.appendChild(th);
  });
  const thAdd=document.createElement('th');thAdd.style.cssText='width:36px;cursor:pointer;text-align:center';
  thAdd.innerHTML='<i class="ti ti-plus" style="color:var(--text3);font-size:13px"></i>';
  thAdd.onclick=()=>{dbData.columns.push({id:jdbColId(),name:'Column',type:'text'});onChange();renderDatabaseTableView(hostEl,dbData,onChange);};
  thead.appendChild(thAdd);
  table.appendChild(thead);
  // Rows
  dbData.rows.forEach(row=>{
    const tr=document.createElement('tr');
    dbData.columns.forEach(col=>{
      const td=document.createElement('td');
      const val=row.cells[col.id];
      if(col.type==='checkbox'){
        const cb=document.createElement('input');cb.type='checkbox';cb.className='jdb-checkbox';cb.checked=!!val;
        cb.onchange=()=>{row.cells[col.id]=cb.checked;onChange();};
        td.appendChild(cb);
      }else if(col.type==='date'){
        const d=document.createElement('input');d.type='date';d.value=val||'';d.className='jdb-cell-text';
        d.onchange=()=>{row.cells[col.id]=d.value;onChange();};
        td.appendChild(d);
      }else if(col.type==='select'){
        const sel=document.createElement('select');sel.className='jdb-cell-text';sel.style.cssText+='background:transparent';
        const none=document.createElement('option');none.value='';none.textContent='—';sel.appendChild(none);
        (col.options||[]).forEach(opt=>{const o=document.createElement('option');o.value=opt.v;o.textContent=opt.v;o.selected=val===opt.v;sel.appendChild(o);});
        const addOpt=document.createElement('option');addOpt.value='__add__';addOpt.textContent='+ Add option...';sel.appendChild(addOpt);
        sel.onchange=async()=>{
          if(sel.value==='__add__'){
            const result=await jelixPrompt('New Option',[{key:'newVal',label:'Option name'}],'Add');
            const newVal=result?.[0];
            if(newVal){
              if(!col.options)col.options=[];
              col.options.push({v:newVal,c:JDB_SELECT_COLORS[col.options.length%JDB_SELECT_COLORS.length]});
              row.cells[col.id]=newVal;onChange();renderDatabaseTableView(hostEl,dbData,onChange);
            }else{sel.value=val||'';}
            return;
          }
          row.cells[col.id]=sel.value;onChange();
        };
        td.appendChild(sel);
        if(val){const opt=(col.options||[]).find(o=>o.v===val);if(opt)td.style.background=opt.c+'14';}
      }else{
        const inp=document.createElement('input');inp.type=col.type==='number'?'number':'text';inp.className='jdb-cell-text';inp.value=val||'';
        inp.oninput=()=>{row.cells[col.id]=col.type==='number'?parseFloat(inp.value)||0:inp.value;_dbCellChangeDebounced(onChange);};
        td.appendChild(inp);
      }
      tr.appendChild(td);
    });
    const tdDel=document.createElement('td');tdDel.style.cssText='text-align:center;cursor:pointer';
    tdDel.innerHTML='<i class="ti ti-x" style="color:var(--text3);font-size:11px"></i>';
    tdDel.onclick=()=>{dbData.rows=dbData.rows.filter(r=>r.id!==row.id);onChange();renderDatabaseTableView(hostEl,dbData,onChange);};
    tr.appendChild(tdDel);
    table.appendChild(tr);
  });
  wrap.appendChild(table);
  hostEl.appendChild(wrap);
  const addRowBtn=document.createElement('button');
  addRowBtn.innerHTML='<i class="ti ti-plus" style="font-size:10px"></i> New Row';
  addRowBtn.style.cssText='background:var(--navy3);border:1px solid var(--border);border-radius:6px;color:var(--text3);font-size:9px;padding:5px 10px;cursor:pointer;margin-top:6px';
  addRowBtn.onclick=()=>{dbData.rows.push({id:jdbRowId(),cells:{}});onChange();renderDatabaseTableView(hostEl,dbData,onChange);};
  hostEl.appendChild(addRowBtn);
}

// ── Notes ↔ Tasks Dashboard live sync ──────────────────────────────
function toggleBlockTaskLink(i){
  const b=noteBlocks[i];
  const linked=b.taskId&&DB.tasks.some(t=>t.id===b.taskId);
  if(linked){
    // Unlink — leave both the note block and the task intact, just cut the connection
    const t=DB.tasks.find(t=>t.id===b.taskId);
    if(t){t.sourceNoteId=null;t.sourceBlockId=null;SB.update('tasks',t.id,t,'tasks');}
    b.taskId=null;saveBlocks();renderBlocks();
    showToast('Unlinked from Tasks Dashboard');
    return;
  }
  ensureBlockId(b);
  const n=DB.notes[currentNote];
  const t={id:Date.now(),title:(b.content||'Untitled task').trim()||'Untitled task',world:'LIFE',priority:'Medium',status:b.done?'Done':'Todo',due:'',platform:'',client:'',notes:'From note: '+(n?.title||''),startTime:'',endTime:'',groupId:null,subitems:[],timelineS:'',timelineE:'',numValue:null,connBoard:null,connItemId:null,sourceNoteId:n?.id||null,sourceBlockId:b.id};
  DB.tasks.unshift(t);SB.upsert('tasks',t,'tasks');
  b.taskId=t.id;saveBlocks();renderBlocks();
  addHistory('add','Added task from note: '+t.title,{...t,_dbKey:'tasks'});
  if(typeof renderTasks==='function')renderTasks();
  showToast('✓ Synced to Tasks Dashboard');
}
function syncBlockToTask(b){
  if(!b.taskId)return;
  const t=DB.tasks.find(x=>x.id===b.taskId);
  if(!t)return;
  t.title=(b.content||'Untitled task').trim()||'Untitled task';
  t.status=b.done?'Done':(t.status==='Done'?'Todo':t.status);
  SB.update('tasks',t.id,t,'tasks');
  if(typeof renderTasks==='function')renderTasks();
}
const syncBlockToTaskDebounced=debounce((b)=>syncBlockToTask(b),1000);
function unlinkBlockTask(b){
  if(!b||!b.taskId)return;
  const t=DB.tasks.find(x=>x.id===b.taskId);
  if(t){t.sourceNoteId=null;t.sourceBlockId=null;SB.update('tasks',t.id,t,'tasks');}
}
function syncTaskToNoteBlock(t){
  if(!t||!t.sourceNoteId||!t.sourceBlockId)return;
  const n=DB.notes.find(x=>x.id===t.sourceNoteId);
  if(!n)return;
  const b=n.blocks.find(x=>x.id===t.sourceBlockId);
  if(!b)return;
  b.content=t.title;
  b.done=t.status==='Done';
  save('notes');
  if(currentNote!=null&&DB.notes[currentNote]&&DB.notes[currentNote].id===n.id){noteBlocks=[...n.blocks];renderBlocks();}
  renderNotesList();
}
function showBlockMenu(e){e.preventDefault();const m=document.getElementById('blockMenu');m.style.left=e.clientX+'px';m.style.top=e.clientY+'px';m.classList.add('open');document.addEventListener('click',()=>m.classList.remove('open'),{once:true});}
function addNoteDriveBlock(f){
  const id=Date.now()+'.'+Math.random().toString(36).slice(2,7);
  noteBlocks.push({id,type:'p',content:'📎 '+f.name+' — '+f.webViewLink,done:false});
  saveBlocks();renderBlocks();
}
async function addBlock(type){
  document.getElementById('blockMenu').classList.remove('open');
  const id=Date.now()+'.'+Math.random().toString(36).slice(2,7);
  if(type==='table'){
    noteBlocks.push({id,type,content:'',done:false,tableData:[['',''],['','']]});
    saveBlocks();renderBlocks();return;
  }
  if(type==='database'){
    noteBlocks.push({id,type,content:'',done:false,dbData:jdbNewDatabase()});
    saveBlocks();renderBlocks();return;
  }
  if(type==='page'){
    const result=await jelixPrompt('New Sub-page',[{key:'title',label:'Sub-page title',default:'Untitled'}],'Create');
    const title=result?.[0]||'Untitled';
    const child={id:Date.now()+1,title,worldId:DB.notes[currentNote]?.worldId||null,blocks:[{id:Date.now()+'.c1',type:'h1',content:title,done:false}]};
    DB.notes.push(child);save('notes');
    noteBlocks.push({id,type,content:'',done:false,linkedNoteId:child.id});
    saveBlocks();renderBlocks();renderNotesList();return;
  }
  if(type==='pagelink'){
    noteBlocks.push({id,type,content:'',done:false,linkedNoteId:null});
    saveBlocks();renderBlocks();
    await _pickNoteForLink(noteBlocks.length-1);
    return;
  }
  noteBlocks.push({id,type,content:'',done:false});
  saveBlocks();renderBlocks();
  setTimeout(()=>{const els=document.querySelectorAll('.bcontent');const last=els[els.length-1];if(last)last.focus();},20);
}
function ensureBlockId(b){if(!b.id)b.id=Date.now()+'.'+Math.random().toString(36).slice(2,7);return b.id;}

// JOURNAL
let editingJournalId=null;
function renderJournal(){/* journal view removed — no-op */}
function viewJournal(id){/* journal view removed */}
function saveJournalEntry(){const j={id:editingJournalId||Date.now(),title:document.getElementById('jm-title').value.trim()||'Untitled',content:document.getElementById('jm-content').value,mood:document.getElementById('jm-mood').value,date:new Date().toISOString()};const isEdit=!!editingJournalId;if(editingJournalId){const i=DB.journal.findIndex(x=>x.id===editingJournalId);if(i>=0)DB.journal[i]=j;SB.update('journal',j.id,j,'journal');}else{DB.journal.unshift(j);SB.upsert('journal',j,'journal');}addHistory(isEdit?'edit':'add',(isEdit?'Edited':'Added')+' journal: '+j.title,{...j,_dbKey:'journal'});closeModal('journalModal');renderJournal();showToast('✓ Journal saved');}
function editJournal(id){const j=DB.journal.find(x=>x.id===id);if(!j)return;editingJournalId=id;document.getElementById('journalModalTitle').textContent='Edit Entry';document.getElementById('jm-title').value=j.title||'';document.getElementById('jm-content').value=j.content||'';document.getElementById('jm-mood').value=j.mood||'🟢';openModal('journalModal');}
function deleteJournal(id){const j=DB.journal.find(x=>x.id===id);if(!j)return;DB.journal=DB.journal.filter(x=>x.id!==id);SB.remove('journal',id,'journal');addHistory('delete','Deleted journal: '+j.title,{...j,_dbKey:'journal'});showToast('Journal deleted');}

// MEMORY
let editingMemoryId=null;
function openMemoryModal(id){
  editingMemoryId=id||null;
  const m=id?DB.memories.find(x=>x.id===id):null;
  document.getElementById('memModalTitle').textContent=id?'Edit Memory':'Add Memory';
  document.getElementById('mm-memory').value=m?m.memory:'';
  document.getElementById('mm-cat').value=m?m.category:'General';
  document.getElementById('mm-world').value=m?m.world:'LIFE';
  openModal('memoryModal');
}
function saveMemoryItem(){
  const mem=document.getElementById('mm-memory').value.trim();
  if(!mem){showToast('Memory text required');return;}
  const m={id:editingMemoryId||Date.now(),memory:mem,category:document.getElementById('mm-cat').value,world:document.getElementById('mm-world').value,date:localDateStr(new Date())};
  if(editingMemoryId){const i=DB.memories.findIndex(x=>x.id===editingMemoryId);if(i>=0)DB.memories[i]=m;SB.update('memories',m.id,m,'memories');}
  else{DB.memories.unshift(m);SB.upsert('memories',m,'memories');}
  closeModal('memoryModal');renderMemory();showToast('✓ Memory saved');
}
function addMemory(){openMemoryModal();}// legacy alias
function deleteMemoryItem(id){DB.memories=DB.memories.filter(m=>m.id!==id);SB.remove('memories',id,'memories');renderMemory();}
function deleteAutoMemory(id){DB.memories=DB.memories.filter(m=>m.id!==id);SB.remove('memories',id,'memories');save('memories');renderMemory();showToast('Memory removed');}

// ═══════════════════════════════════════════════════════════════════════════
// MEETING NOTE TAKER
// ═══════════════════════════════════════════════════════════════════════════
let _meetRec=null,_meetFinal='',_meetInterim='',_meetStartTs=null,_meetWorld='WORK-IH',_meetDraft=null;

function renderMeetingsPanel(containerId,world){
  const el=document.getElementById(containerId);if(!el)return;
  _meetWorld=world;
  const worldMeetings=(DB.meetings||[]).filter(m=>m.world===world).sort((a,b)=>b.date.localeCompare(a.date));
  const wColor={'WORK-IH':'var(--w-ideahub)','WORK-CS':'var(--w-chainsmoker)','VENTURE':'var(--w-venture)','FAITH':'var(--w-faith)','BUILD':'var(--w-build)','SIDES':'var(--w-sides)','LIFE':'var(--w-life)'}[world]||'var(--teal)';

  el.innerHTML=`<div class="meetings-panel">
    <!-- RECORDER SECTION -->
    <div class="meetings-recorder">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <input id="meetTitle-${world}" class="mi" placeholder="Meeting title (optional)..." style="flex:1;min-width:160px;font-size:var(--text-xs)">
        <button id="meetRecBtn-${world}" onclick="toggleMeetRecording('${world}')" style="display:flex;align-items:center;gap:7px;padding:7px 16px;border-radius:10px;border:1px solid rgba(239,68,68,.4);background:rgba(239,68,68,.08);color:var(--red);cursor:pointer;font-size:var(--text-xs);font-weight:700;flex-shrink:0;transition:all .2s">
          <i class="ti ti-microphone" style="font-size:var(--text-sm);line-height:1;display:block"></i>
          <span id="meetRecLabel-${world}">Start Recording</span>
        </button>
      </div>
      <!-- Live transcript area (hidden until recording) -->
      <div id="meetLiveWrap-${world}" style="display:none">
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:6px">
          <div class="rec-pulse" id="meetPulse-${world}"></div>
          <span style="font-size:var(--text-xs);color:var(--red);font-weight:700">RECORDING</span>
          <span id="meetTimer-${world}" style="font-size:var(--text-xs);color:var(--text3);margin-left:auto">0:00</span>
        </div>
        <div class="rec-live-text" id="meetLive-${world}">Speak now...</div>
      </div>
    </div>
    <!-- MEETING LOG -->
    <div class="meetings-log">
      ${worldMeetings.length?worldMeetings.map(m=>`
        <div class="meeting-card" onclick="expandMeeting(${m.id})">
          <div class="meeting-card-head">
            <i class="ti ti-file-text" style="font-size:var(--text-sm);color:${wColor};line-height:1;display:block;flex-shrink:0"></i>
            <div style="flex:1;min-width:0">
              <div style="font-size:var(--text-sm);font-weight:700;color:var(--text1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.title||'Untitled Meeting'}</div>
              <div style="font-size:var(--text-xs);color:var(--text3)">${m.date} · ${m.duration||'—'} · ${m.actionItems?.length||0} action items</div>
            </div>
            <button onclick="event.stopPropagation();deleteMeeting(${m.id},'${world}')" style="background:transparent;border:none;color:var(--text3);cursor:pointer;flex-shrink:0"><i class="ti ti-trash" style="font-size:var(--text-xs);line-height:1;display:block"></i></button>
          </div>
          ${m.summary?`<div class="meeting-card-body">${m.summary.substring(0,180)}${m.summary.length>180?'…':''}</div>`:''}
          ${m.actionItems?.length?`<div style="padding:6px 13px;display:flex;flex-wrap:wrap;gap:5px;border-top:1px solid var(--border)">${m.actionItems.slice(0,3).map(a=>`<span style="font-size:9px;padding:2px 7px;border-radius:10px;background:${wColor}15;color:${wColor};border:1px solid ${wColor}30">${a.text.substring(0,40)}</span>`).join('')}${m.actionItems.length>3?`<span style="font-size:9px;color:var(--text3)">+${m.actionItems.length-3} more</span>`:''}</div>`:''}
        </div>`).join('')
      :`<div style="text-align:center;padding:40px 20px;color:var(--text3)">
          <i class="ti ti-microphone" style="font-size:32px;display:block;margin-bottom:10px;opacity:.3"></i>
          <div style="font-size:var(--text-sm);margin-bottom:5px">No meetings recorded yet</div>
          <div style="font-size:var(--text-xs)">Hit "Start Recording" to begin your first meeting note.</div>
        </div>`}
    </div>
  </div>`;
}

function toggleMeetRecording(world){
  if(_meetRec && _meetRec._world===world){
    // Stop recording
    _meetRec.stop();
    stopMeetTimer();
  } else {
    // Start recording
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){showToast('Speech not supported. Use Chrome or Edge.');return;}
    _meetFinal='';_meetInterim='';_meetWorld=world;_meetStartTs=Date.now();
    const r=new SR();
    r.continuous=true;r.interimResults=true;r.lang='en-PH';r.maxAlternatives=1;
    r._world=world;
    r.onstart=()=>{
      const btn=document.getElementById('meetRecBtn-'+world);
      const lbl=document.getElementById('meetRecLabel-'+world);
      const wrap=document.getElementById('meetLiveWrap-'+world);
      if(btn){btn.style.background='rgba(239,68,68,.2)';btn.style.borderColor='var(--red)';}
      if(lbl) lbl.textContent='Stop Recording';
      if(wrap) wrap.style.display='';
      startMeetTimer(world);
    };
    r.onresult=(e)=>{
      let interim='',final='';
      for(let i=e.resultIndex;i<e.results.length;i++){
        if(e.results[i].isFinal) final+=e.results[i][0].transcript+' ';
        else interim+=e.results[i][0].transcript;
      }
      if(final) _meetFinal+=final;
      const liveEl=document.getElementById('meetLive-'+world);
      if(liveEl) liveEl.textContent=(_meetFinal+interim).trim()||'Speak now...';
    };
    r.onend=()=>{
      _meetRec=null;
      stopMeetTimer();
      const btn=document.getElementById('meetRecBtn-'+world);
      const lbl=document.getElementById('meetRecLabel-'+world);
      if(btn){btn.style.background='rgba(239,68,68,.08)';btn.style.borderColor='rgba(239,68,68,.4)';}
      if(lbl) lbl.textContent='Start Recording';
      const transcript=_meetFinal.trim();
      if(transcript.length>10) openMeetingReview(transcript,world);
      else showToast('Recording too short — no transcript captured.');
    };
    r.onerror=(e)=>{
      showToast('Microphone error: '+e.error+'. Check permissions.');
      _meetRec=null;stopMeetTimer();
    };
    _meetRec=r;
    r.start();
  }
}

let _meetTimerInterval=null;
function startMeetTimer(world){
  const el=document.getElementById('meetTimer-'+world);
  if(!el)return;
  let secs=0;
  _meetTimerInterval=setInterval(()=>{
    secs++;
    const m=Math.floor(secs/60);const s=secs%60;
    el.textContent=m+':'+(s<10?'0':'')+s;
  },1000);
}
function stopMeetTimer(){clearInterval(_meetTimerInterval);_meetTimerInterval=null;}

// ── Extract summary, action items, decisions from transcript ──────────────
function extractMeetingData(transcript){
  const lines=transcript.split(/[.!?\n]+/).map(l=>l.trim()).filter(l=>l.length>5);

  // Summary — first 3 meaningful sentences + any conclusion-type sentence
  const summaryLines=lines.slice(0,3);
  const conclusionRe=/\b(so|therefore|in summary|conclusion|to recap|overall|the plan|we agreed|moving forward)\b/i;
  const extra=lines.slice(3).find(l=>conclusionRe.test(l));
  if(extra&&!summaryLines.includes(extra)) summaryLines.push(extra);
  const summary=summaryLines.join('. ').trim();

  // Action items — lines with strong intent signals
  const actionRe=/\b(i will|i'll|you will|you'll|we will|we'll|let's|please|follow up|action|task|do|send|create|prepare|schedule|review|update|check|make|deliver|finish|complete|by|deadline|before)\b/i;
  const actionItems=lines.filter(l=>actionRe.test(l)&&l.length>10).map(l=>({text:l,done:false})).slice(0,10);

  // Decisions — lines with decision signals
  const decisionRe=/\b(decided|decision|agreed|going with|confirmed|approved|selected|chosen|we'll use|the plan is|we're going|final)\b/i;
  const decisions=lines.filter(l=>decisionRe.test(l)&&l.length>10).map(l=>l.trim()).slice(0,5);

  return{summary,actionItems,decisions};
}

function openMeetingReview(transcript,world){
  const titleInput=document.getElementById('meetTitle-'+world);
  const title=titleInput?titleInput.value.trim():'';
  const duration=(()=>{const s=Math.round((Date.now()-(_meetStartTs||Date.now()))/1000);return Math.floor(s/60)+'m '+s%60+'s';})();
  const extracted=extractMeetingData(transcript);

  _meetDraft={transcript,world,title,duration,extracted};

  // Populate review modal
  document.getElementById('mr-title').value=title||new Date().toLocaleDateString('en-PH',{month:'short',day:'numeric'})+' Meeting';
  document.getElementById('mr-world').value=world;
  document.getElementById('mr-summary').value=extracted.summary;
  document.getElementById('mr-transcript').value=transcript;

  // Action items
  const actEl=document.getElementById('mr-actions');
  if(actEl){
    if(extracted.actionItems.length){
      actEl.innerHTML=extracted.actionItems.map((a,i)=>{
        const id='ai-ext-'+i;
        return`<div class="meet-action-row" id="mar-${id}" style="margin-bottom:4px">
          <div style="display:flex;align-items:flex-start;gap:8px;padding:7px 10px;background:var(--navy3);border:1px solid var(--border);border-radius:10px">
            <input type="checkbox" checked id="mra-${id}" style="accent-color:var(--teal);flex-shrink:0;margin-top:2px;width:14px;height:14px;cursor:pointer">
            <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:5px">
              <input value="${a.text.replace(/"/g,'&quot;')}" id="mrat-${id}"
                style="width:100%;background:transparent;border:none;border-bottom:1px solid var(--border2);color:var(--text1);font-size:12px;outline:none;padding:1px 0 4px"
                onfocus="this.style.borderBottomColor='var(--teal)'" onblur="this.style.borderBottomColor='var(--border2)'">
              <div id="mrad-wrap-${id}" style="display:none">
                <textarea id="mrad-${id}" placeholder="Details..." rows="2"
                  style="width:100%;background:rgba(0,0,0,.2);border:1px solid var(--border);border-radius:8px;color:var(--text2);font-size:11px;outline:none;padding:5px 7px;resize:vertical;font-family:var(--font)"></textarea>
              </div>
              <div style="display:flex;align-items:center;gap:8px">
                <button onclick="document.getElementById('mrad-wrap-${id}').style.display=document.getElementById('mrad-wrap-${id}').style.display==='none'?'':'none';this.textContent=document.getElementById('mrad-wrap-${id}').style.display==='none'?'+ details':'− details'"
                  style="background:transparent;border:none;color:var(--text3);font-size:11px;cursor:pointer;padding:0">+ details</button>
                <select id="mraa-${id}" style="font-size:11px;background:var(--navy3);border:1px solid var(--border);border-radius:8px;color:var(--text3);padding:1px 5px">
                  <option value="">Assign to...</option><option>Me</option><option>Client</option><option>Team</option>
                </select>
              </div>
            </div>
            <button onclick="document.getElementById('mar-${id}').remove()" style="background:transparent;border:none;color:var(--text3);cursor:pointer;flex-shrink:0;padding:2px 4px;font-size:13px;line-height:1">×</button>
          </div>
        </div>`;
      }).join('');
    } else {
      actEl.innerHTML='<div class="meet-action-empty" style="font-size:11px;color:var(--text3);font-style:italic;padding:4px">None detected. Click + Add to enter manually.</div>';
    }
  }
  // Decisions
  const decEl=document.getElementById('mr-decisions');
  if(decEl){
    decEl.innerHTML=extracted.decisions.length
      ?extracted.decisions.map(d=>`<div style="display:flex;align-items:flex-start;gap:7px;padding:4px 0;border-bottom:1px solid var(--border);font-size:var(--text-xs);color:var(--text2)"><i class="ti ti-circle-check" style="color:var(--teal);flex-shrink:0;font-size:var(--text-sm);line-height:1.3;display:block"></i>${d}</div>`).join('')
      :'<div style="font-size:var(--text-xs);color:var(--text3);font-style:italic">None detected.</div>';
  }

  // If any AI key is available, enhance summary
  if(hasAnyAIKey() && transcript.length>50){
    enhanceMeetingSummaryWithAI(transcript);
  }

  openModal('meetingReviewModal');
}

async function enhanceMeetingSummaryWithAI(transcript,apiKey){
  try{
    const result=await callAIProvider(
      'You are a meeting note assistant inside a personal operating system. Extract a clean 3-sentence summary and up to 5 specific action items from the transcript. Reply in JSON only, no markdown fences: {"summary":"...","actionItems":["...","..."]}',
      [{role:'user',content:'Transcript:\n'+transcript.substring(0,3000)}],
      {maxTokens:600}
    );
    if(!result.ok)return;
    const json=JSON.parse(result.text.replace(/```json|```/g,'').trim());
    if(json.summary) document.getElementById('mr-summary').value=json.summary;
    if(json.actionItems?.length){
      const actEl=document.getElementById('mr-actions');
      if(actEl) actEl.innerHTML=json.actionItems.map((a,idx)=>{
        const id='ai-ai-'+idx;
        return`<div class="meet-action-row" id="mar-${id}" style="margin-bottom:4px"><div style="display:flex;align-items:flex-start;gap:8px;padding:7px 10px;background:var(--navy3);border:1px solid var(--border);border-radius:10px"><input type="checkbox" checked id="mra-${id}" style="accent-color:var(--teal);flex-shrink:0;margin-top:2px;width:14px;height:14px;cursor:pointer"><div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px"><input value="${(a||'').replace(/"/g,'&quot;')}" id="mrat-${id}" style="width:100%;background:transparent;border:none;border-bottom:1px solid var(--border2);color:var(--text1);font-size:12px;outline:none;padding:1px 0 4px"></div><button onclick="document.getElementById('mar-${id}').remove()" style="background:transparent;border:none;color:var(--text3);cursor:pointer;flex-shrink:0;font-size:13px;line-height:1">×</button></div></div>`;
      }).join('');
      showToast('✓ AI enhanced your meeting summary');
    }
  }catch(e){/* fail silently — regex fallback already populated */}
}

function addMeetingActionItem(){
  const actEl=document.getElementById('mr-actions');if(!actEl)return;
  const i='ai-'+Date.now();
  const row=document.createElement('div');
  row.className='meet-action-row';
  row.id='mar-'+i;
  row.innerHTML=`
    <div style="display:flex;align-items:flex-start;gap:8px;padding:7px 10px;background:var(--navy3);border:1px solid var(--border);border-radius:10px;margin-bottom:4px">
      <input type="checkbox" checked id="mra-${i}" style="accent-color:var(--teal);flex-shrink:0;margin-top:2px;width:14px;height:14px;cursor:pointer">
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:5px">
        <input placeholder="Action item..." id="mrat-${i}"
          style="width:100%;background:transparent;border:none;border-bottom:1px solid var(--border2);color:var(--text1);font-size:12px;outline:none;padding:1px 0 4px"
          onfocus="this.style.borderBottomColor='var(--teal)'" onblur="this.style.borderBottomColor='var(--border2)'">
        <div id="mrad-wrap-${i}" style="display:none">
          <textarea id="mrad-${i}" placeholder="Details, context, or notes..." rows="2"
            style="width:100%;background:rgba(0,0,0,.2);border:1px solid var(--border);border-radius:8px;color:var(--text2);font-size:11px;outline:none;padding:5px 7px;resize:vertical;font-family:var(--font)"></textarea>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <button onclick="document.getElementById('mrad-wrap-${i}').style.display=document.getElementById('mrad-wrap-${i}').style.display==='none'?'':'none';this.textContent=document.getElementById('mrad-wrap-${i}').style.display==='none'?'+ details':'− details'"
            style="background:transparent;border:none;color:var(--text3);font-size:11px;cursor:pointer;padding:0">+ details</button>
          <select id="mraa-${i}" style="font-size:11px;background:var(--navy3);border:1px solid var(--border);border-radius:8px;color:var(--text3);padding:1px 5px">
            <option value="">Assign to...</option>
            <option>Me</option><option>Client</option><option>Team</option>
          </select>
        </div>
      </div>
      <button onclick="document.getElementById('mar-${i}').remove()" style="background:transparent;border:none;color:var(--text3);cursor:pointer;flex-shrink:0;padding:2px 4px;font-size:13px;line-height:1">×</button>
    </div>`;
  // Remove empty-state placeholder if present
  const empty=actEl.querySelector('.meet-action-empty');if(empty)empty.remove();
  actEl.appendChild(row);
  row.querySelector('input[type=text],input:not([type=checkbox]):not([type=button])').focus();
}

function saveMeetingApproved(){
  const title=document.getElementById('mr-title').value.trim()||'Untitled Meeting';
  const world=document.getElementById('mr-world').value;
  const summary=document.getElementById('mr-summary').value.trim();
  const transcript=document.getElementById('mr-transcript').value.trim();
  const today=localDateStr(new Date());

  // Collect checked action items from new checklist structure
  const actionItems=[];
  document.querySelectorAll('#mr-actions .meet-action-row').forEach(row=>{
    const cb=row.querySelector('input[type="checkbox"]');
    if(!cb||!cb.checked) return;
    const titleInput=row.querySelector('input:not([type="checkbox"])');
    const detailInput=row.querySelector('textarea');
    const assignInput=row.querySelector('select');
    const txt=titleInput?.value?.trim();
    if(txt) actionItems.push({
      text:txt,
      details:detailInput?.value?.trim()||'',
      assignedTo:assignInput?.value||'',
      done:false
    });
  });

  const m={
    id:Date.now(),title,world,date:today,
    duration:_meetDraft?.duration||'',
    summary,transcript,
    actionItems,
    createdAt:new Date().toISOString()
  };

  if(!DB.meetings) DB.meetings=[];
  DB.meetings.unshift(m);
  save('meetings');
  // Note: meetings table not in Supabase schema — local only
  addHistory('add','Meeting: '+title,{...m,_dbKey:'meetings'});

  // Create tasks from action items
  const tasksCreated=actionItems.length;
  actionItems.forEach(a=>{
    const t={id:Date.now()+Math.random(),title:a.text.substring(0,100),world,priority:'Medium',status:'Todo',due:'',platform:'',client:'',notes:'From meeting: '+title,subitems:[],timelineS:'',timelineE:'',numValue:null,connBoard:null,connItemId:null,groupId:null};
    DB.tasks.unshift(t);SB.upsert('tasks',t,'tasks');
  });
  if(tasksCreated>0){save('tasks');renderTasks();renderBrief();}

  // Feed LearnEngine
  LearnEngine._learn('Held meeting: "'+title+'" in '+world+(actionItems.length?' with '+actionItems.length+' action items':''),'Session Pattern',world);

  closeModal('meetingReviewModal');
  // Re-render the meetings panel for the world
  const panelId='meetingsPanel-'+world;
  renderMeetingsPanel(panelId,world);
  showToast('✓ Meeting saved'+(tasksCreated?' · '+tasksCreated+' task'+(tasksCreated>1?'s':'')+' created':''));
}

function discardMeetingDraft(){
  _meetDraft=null;
  closeModal('meetingReviewModal');
  showToast('Meeting draft discarded.');
}

async function deleteMeeting(id,world){
  if(!await jelixConfirm('Delete this meeting note?','Delete'))return;
  DB.meetings=DB.meetings.filter(m=>m.id!==id);
  save('meetings');
  // meetings is local-only — no Supabase remove needed
  renderMeetingsPanel('meetingsPanel-'+world,world);
  showToast('Meeting deleted');
}

function expandMeeting(id){
  const m=(DB.meetings||[]).find(x=>x.id===id);if(!m)return;
  // Populate review modal in view-only mode
  document.getElementById('mr-title').value=m.title||'';
  document.getElementById('mr-world').value=m.world||'WORK-IH';
  document.getElementById('mr-summary').value=m.summary||'';
  document.getElementById('mr-transcript').value=m.transcript||'';
  const actEl=document.getElementById('mr-actions');
  if(actEl) actEl.innerHTML=(m.actionItems||[]).map((a,i)=>`
    <div style="display:flex;align-items:center;gap:7px;padding:5px 8px;background:var(--navy3);border:1px solid var(--border);border-radius:8px">
      <input type="checkbox" ${a.done?'checked':''} id="mra-${i}" style="accent-color:var(--teal);flex-shrink:0">
      <input value="${(a.text||'').replace(/"/g,'&quot;')}" id="mrat-${i}" style="flex:1;background:transparent;border:none;color:var(--text1);font-size:var(--text-xs);outline:none" readonly>
    </div>`).join('')||'<div style="font-size:var(--text-xs);color:var(--text3);font-style:italic">No action items.</div>';
  openModal('meetingReviewModal');
}
function renderMemory(){
  const wf=document.getElementById('memWorldFilter')?.value||'all';
  const mems=wf==='all'?DB.memories:DB.memories.filter(m=>m.world===wf);
  const tot=document.getElementById('memTotal');if(tot)tot.textContent=DB.memories.length;
  const ag=document.getElementById('memAgentCount');if(ag)ag.textContent=DB.memories.filter(m=>m.category==='Agent Preference').length;
  const br=document.getElementById('memBrandCount');if(br)br.textContent=DB.memories.filter(m=>m.category==='Brand').length;
  const dc=document.getElementById('memDecCount');if(dc)dc.textContent=DB.memories.filter(m=>m.category==='Decision').length;
  const catColor=c=>c==='Agent Preference'?'var(--teal)':c==='Brand'?'var(--orange)':c==='Decision'?'var(--amber)':c==='Client Preference'?'var(--purple)':c==='Product'?'var(--green)':c==='Session Pattern'||c==='Navigation Pattern'||c==='Task Pattern'?'var(--text3)':'var(--text3)';
  document.getElementById('memoryTbody').innerHTML=mems.length?mems.map(m=>`<tr onclick="${m.source==='auto'?'':('openMemoryModal('+m.id+')')}" style="cursor:${m.source==='auto'?'default':'pointer'}">
    <td style="font-size:var(--text-sm);max-width:260px;color:var(--text1)">${m.memory}</td>
    <td><span style="font-size:9px;color:${catColor(m.category)};border:1px solid ${catColor(m.category)}40;border-radius:8px;padding:1px 5px;background:${catColor(m.category)}12">${m.category}</span></td>
    <td><span class="pill pt" style="font-size:9px">${m.world}</span></td>
    <td style="font-size:var(--text-xs);color:var(--text3)">${m.date}</td>
    <td><span style="font-size:9px;padding:1px 5px;border-radius:6px;background:${m.source==='auto'?'rgba(0,255,242,.08)':'rgba(255,255,255,.04)'};color:${m.source==='auto'?'var(--teal)':'var(--text3)'}">${m.source==='auto'?'⚡ auto':'manual'}</span></td>
    <td><button class="btn btn-d" style="padding:2px 6px" onclick="event.stopPropagation();deleteMemoryItem(${m.id})"><i class="ti ti-trash" style="font-size:var(--text-xs);line-height:1;display:block"></i></button></td>
  </tr>`).join('')
  :'<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:20px;font-size:var(--text-sm)">No memories yet. The OS learns automatically as you use it.</td></tr>';
}

// ===== VOICE COMMAND ENGINE =====
const WAKE_WORDS=['hey jelix','hey felix','hey jelly','hey jellix','angelix','hi jelix','jelix'];
function stripWakeWord(text){const t=text.toLowerCase().trim();for(const w of WAKE_WORDS){if(t.startsWith(w)){const rest=text.slice(w.length).replace(/^[\s,]+/,'').trim();return rest||null;}}return text;}

// ── Levenshtein distance (character-level edit distance) ──
function getLevenshtein(a,b){
  a=a.toLowerCase();b=b.toLowerCase();
  const m=a.length,n=b.length;
  const dp=Array.from({length:m+1},(_,i)=>Array.from({length:n+1},(_,j)=>i===0?j:j===0?i:0));
  for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)
    dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return dp[m][n];
}

// ── Fuzzy finder — returns best match from array or null if confidence too low ──
// keyFn extracts the string field to compare against (e.g. x => x.title)
// threshold: max edit distance per 4 chars of query (scales with length)
function fuzzyFind(query,arr,keyFn,threshold){
  if(!query||!arr||!arr.length)return null;
  const q=query.toLowerCase().trim();
  const maxDist=threshold!==undefined?threshold:Math.max(2,Math.floor(q.length/4));
  let best=null,bestScore=Infinity;
  for(const item of arr){
    const key=(keyFn(item)||'').toLowerCase();
    // Exact substring match wins immediately
    if(key.includes(q))return item;
    // Also try matching query tokens against key tokens
    const qTokens=q.split(/\s+/);
    const keyTokens=key.split(/\s+/);
    let tokenHit=false;
    for(const qt of qTokens){
      if(qt.length<3)continue;
      for(const kt of keyTokens){
        if(kt.includes(qt)||qt.includes(kt)){tokenHit=true;break;}
      }
      if(tokenHit)break;
    }
    if(tokenHit)return item;
    // Full Levenshtein on whole string
    const dist=getLevenshtein(q,key);
    if(dist<bestScore){bestScore=dist;best=item;}
  }
  return bestScore<=maxDist?best:null;
}

// ── Intent registry — ordered most-specific first ──
const FLUID_VOICE_INTENTS=[

  // ── NAVIGATE ────────────────────────────────────────────────────────────
  {re:/^(go\s+to|open|show|navigate\s+to|switch\s+to|go)\s+(?<dest>.+)/i, action:'navigate'},

  // ── TASK — add (very flexible natural speech) ───────────────────────────
  // "add task reply to RTP" / "create a task for..." / "new task: ..." / "add a to-do..."
  {re:/\b(add|create|new|mag\-?add|gumawa)\b.{0,12}\b(task|todo|to[\-\s]?do)\b[:\-,\s]*(?<title>.+)/i, action:'add_task'},
  // "I need to [verb] [thing]" → task
  {re:/^i\s+need\s+to\s+(?<title>.+)/i, action:'add_task'},
  // "remind me to [thing]" → task
  {re:/^remind\s+me\s+to\s+(?<title>.+)/i, action:'add_task'},

  // ── TASK — delete / remove ───────────────────────────────────────────────
  // "delete task reply to RTP" / "remove task [name]" / "delete the task called..."
  {re:/\b(delete|remove|trash|drop|cancel|burahin|alisin)\b.{0,10}\b(task|todo)\b[:\-,\s]*(?<target>.+)/i, action:'delete_task'},
  // "delete [task name]" — bare delete with no keyword (fuzzy fallback)
  {re:/^(delete|remove|trash)\s+(?<target>.+)/i, action:'delete_task'},

  // ── TASK — mark done ────────────────────────────────────────────────────
  {re:/\b(mark|set|tapos\s+na|done\s+na)\b.{0,20}\b(?<target>.+?)\b.{0,10}\b(done|complete|completed|finished|tapos)/i, action:'update_task_status_done'},
  {re:/^(mark|set|update)\s+(?<target>.+?)\s+as\s+(?<status>done|complete|completed|in\s*progress|no\s*progress|blocked|todo)/i, action:'update_task_status'},
  {re:/^(complete|finish|tapos)\s+(?<target>.+)/i, action:'update_task_status_done'},

  // ── TASK — priority ─────────────────────────────────────────────────────
  {re:/^(set|make|change|mark)\s+(?<target>.+?)\s+(priority\s+)?(to\s+|as\s+)?(?<prio>high|medium|low)/i, action:'update_task_priority'},

  // ── CASHFLOW — debit (income, received money) ────────────────────────────
  // "debit salary 25000" / "add debit salary 25000" / "received salary 25000"
  // "log income salary 25000" / "i received 25000 from ideahub"
  {re:/\b(debit|income|received|pumasok|natanggap|salary|sweldo)\b[:\-,\s]*(?<desc>[^0-9₱]+?)\s+[₱]?(?<amount>[\d,]+(?:\.\d+)?)/i, action:'add_debit'},
  // "add debit [desc] [amount]"
  {re:/\b(add|log)\s+debit[:\-,\s]+(?<desc>.+?)\s+[₱]?(?<amount>[\d,]+(?:\.\d+)?)/i, action:'add_debit'},
  // "[desc] [amount] debit" — reversed order
  {re:/(?<desc>.+?)\s+[₱]?(?<amount>[\d,]+(?:\.\d+)?)\s+(debit|income)/i, action:'add_debit'},

  // ── CASHFLOW — credit (expense, paid out) ────────────────────────────────
  // "credit rent 15000" / "add credit groceries 2000" / "bayad rent 15000"
  // "paid rent 15000" / "spent 2000 on groceries" / "expense food 500"
  {re:/\b(credit|expense|expenses|paid|bayad|nagbayad|spent|bought|labas)\b[:\-,\s]*(?<desc>[^0-9₱]+?)\s+[₱]?(?<amount>[\d,]+(?:\.\d+)?)/i, action:'add_credit'},
  // "add credit [desc] [amount]"
  {re:/\b(add|log)\s+credit[:\-,\s]+(?<desc>.+?)\s+[₱]?(?<amount>[\d,]+(?:\.\d+)?)/i, action:'add_credit'},
  // "[desc] [amount] credit/expense" — reversed order
  {re:/(?<desc>.+?)\s+[₱]?(?<amount>[\d,]+(?:\.\d+)?)\s+(credit|expense)/i, action:'add_credit'},

  // ── CASHFLOW — transfer (moving money between your own accounts) ─────────
  // "transfer 5000 from gcash to maribank" / "move 2000 from cash to bpi"
  {re:/\b(transfer|move)\b\s+[₱]?(?<amount>[\d,]+(?:\.\d+)?)\s+from\s+(?<from>[a-z0-9 ]+?)\s+to\s+(?<to>[a-z0-9 ]+)/i, action:'add_transfer'},
  // "transfer 5000 gcash to maribank" (no "from")
  {re:/\b(transfer|move)\b\s+[₱]?(?<amount>[\d,]+(?:\.\d+)?)\s+(?<from>[a-z0-9 ]+?)\s+to\s+(?<to>[a-z0-9 ]+)/i, action:'add_transfer'},

  // ── CLIENT ──────────────────────────────────────────────────────────────
  {re:/\b(add|new|create)\b.{0,8}\bclient\b[:\-,\s]*(?<name>.+)/i, action:'add_client'},
  {re:/\b(delete|remove)\b.{0,8}\bclient\b[:\-,\s]*(?<target>.+)/i, action:'delete_client'},

  // ── VENTURE ─────────────────────────────────────────────────────────────
  {re:/\b(add|new|create)\b.{0,8}\b(venture|lead|pipeline)\b[:\-,\s]*(?<name>.+)/i, action:'add_venture'},
  {re:/\b(delete|remove)\b.{0,8}\b(venture|lead)\b[:\-,\s]*(?<target>.+)/i, action:'delete_venture'},
  {re:/\b(move|advance|push)\b.{0,6}(?<target>.+?)\s+to\s+(?<stage>lead|discovery|proposal|negotiation|active|won)/i, action:'move_venture'},

  // ── FAITH ───────────────────────────────────────────────────────────────
  {re:/\b(add|log|record)\b.{0,8}\b(faith|activity|buklod|church)\b[:\-,\s]*(?<activity>.+)/i, action:'add_faith'},
  {re:/\b(delete|remove)\b.{0,8}\b(faith|activity)\b[:\-,\s]*(?<target>.+)/i, action:'delete_faith'},

  // ── UPDATE CLIENT STATUS ────────────────────────────────────────────────
  {re:/\b(set|mark|update)\b.{0,8}\bclient\b.{0,10}(?<target>.+?)\b(to|as)\b.{0,6}(?<status>active|pending|urgent|paused|done)/i, action:'update_client_status'},

  // ── JOURNAL ─────────────────────────────────────────────────────────────
  {re:/^(journal|write|log entry|note|diary)[:\-,\s]+(?<content>.+)/i, action:'add_journal'},

  // ── MUTE / UNMUTE ───────────────────────────────────────────────────────
  {re:/\b(mute|silence|tahimik)\b/i, action:'mute'},
  {re:/\b(unmute|speak|voice\s+on|magsalita)\b/i, action:'unmute'},
];

// Navigation alias table
const NAV_MAP={
  'dashboard':'dashboard','home':'dashboard','dashboard':'dashboard',
  'work ideahub':'work-ih','ideahub':'work-ih','work ih':'work-ih',
  'work chainsmoker':'work-cs','chainsmoker':'work-cs','sweetheart':'work-cs','cs':'work-cs',
  'venture':'venture','tjc':'venture','job collectives':'venture',
  'build':'build','app studio':'build',
  'sides':'sides','income':'sides',
  'faith':'faith','buklod':'faith','church':'faith',
  'life':'life','cashflow':'life','cash flow':'life','personal':'life',
  'calendar':'calendar','schedule':'calendar',
  'journal':'journal','diary':'journal',
  'tasks':'tasks','all tasks':'tasks',
  'notes':'notes',
  'ai':'ai','jelix ai':'ai','agents':'ai',
  'memory':'memory',
  'settings':'settings',
  'system settings':'settings',
  'security':'settings',
  'history':'history',
  'health':'life','bio monitor':'life','endurance':'life',
};

function parseVoiceCommand(text){
  const t=text.toLowerCase().trim();

  // Pure navigation shortcut (bare keyword with no verb)
  for(const[k,v] of Object.entries(NAV_MAP)){if(t===k||t===k+'.')return{action:'navigate',view:v};}

  // Iterate intent registry
  for(const intent of FLUID_VOICE_INTENTS){
    const m=t.match(intent.re);
    if(!m)continue;
    const g=m.groups||{};

    switch(intent.action){

      case 'navigate':{
        const dest=(g.dest||'').trim();
        for(const[k,v] of Object.entries(NAV_MAP)){if(dest.includes(k))return{action:'navigate',view:v};}
        // fuzzy nav fallback against keys
        const navKeys=Object.keys(NAV_MAP);
        const best=fuzzyFind(dest,navKeys,x=>x,1);
        if(best)return{action:'navigate',view:NAV_MAP[best]};
        return{action:'navigate',view:'dashboard'};
      }

      case 'delete_task':
        return{action:'delete_task',target:(g.target||text.replace(intent.re,'').trim())};

      case 'delete_client':
        return{action:'delete_client',target:(g.target||text.replace(intent.re,'').trim())};

      case 'delete_venture':
        return{action:'delete_venture',target:(g.target||text.replace(intent.re,'').trim())};

      case 'delete_faith':
        return{action:'delete_faith',target:(g.target||text.replace(intent.re,'').trim())};

      case 'move_venture':{
        const stageMap={'lead':'Lead','discovery':'Discovery','proposal':'Proposal','negotiation':'Negotiation','active':'Active','won':'Won'};
        return{action:'move_venture',target:(g.target||'').trim(),stage:stageMap[(g.stage||'').toLowerCase()]||'Discovery'};
      }

      case 'update_task_status_done':
        return{action:'update_task_status',target:(g.target||'').trim(),status:'Done'};

      case 'update_task_status':{
        const sm={'done':'Done','complete':'Done','completed':'Done','in progress':'In Progress','no progress':'No Progress','blocked':'No Progress','todo':'Todo'};
        const rawStatus=(g.status||'done').toLowerCase().trim();
        return{action:'update_task_status',target:(g.target||'').trim(),status:sm[rawStatus]||'Done'};
      }

      case 'update_task_priority':{
        const prioMatch=t.match(/\b(high|medium|low)\b/i);
        const prio=prioMatch?prioMatch[1].charAt(0).toUpperCase()+prioMatch[1].slice(1).toLowerCase():'Medium';
        return{action:'update_task_priority',target:(g.target||'').trim(),priority:prio};
      }

      case 'update_client_status':{
        const csm={active:'Active',pending:'Pending',urgent:'Urgent',paused:'Paused',done:'Done'};
        const rawCS=(g.status||'active').toLowerCase();
        return{action:'update_client_status',target:(g.target||'').trim(),status:csm[rawCS]||'Active'};
      }

      case 'add_task':{
        const title=(g.title||text.replace(intent.re,'').trim()||text).trim();
        let world='LIFE',priority='Medium',platform='';
        if(/chainsmoker|sweetheart/i.test(title))world='WORK-CS';
        if(/tjc|venture|partner/i.test(title))world='VENTURE';
        if(/naknak|diskarte|pasahero/i.test(title))world='BUILD';
        if(/buklod|faith|church/i.test(title))world='FAITH';
        if(/cash|expense|life/i.test(title))world='LIFE';
        if(/urgent|asap|high\s+prio/i.test(title))priority='High';
        if(/\blow\b|someday/i.test(title))priority='Low';
        const pm=title.match(/\b(instagram|facebook|tiktok|linkedin|twitter|x\.com|email|ubereats|grab)\b/i);
        if(pm)platform=pm[1];
        return{action:'add_task',title,world,priority,status:'Todo',due:'',platform,client:'',notes:''};
      }

      case 'add_client':
        return{action:'add_client',name:(g.name||text.replace(intent.re,'').trim()),status:'Active',revenue:'$$',next:'',contact:''};

      case 'add_venture':{
        const name=(g.name||text.replace(intent.re,'').trim());
        return{action:'add_venture',name,type:'Client',stage:'Lead',notes:''};
      }

      case 'add_faith':{
        const activity=(g.activity||text.replace(intent.re,'').trim());
        return{action:'add_faith',activity,group:'',date:localDateStr(new Date()),status:'Pending',assigned:'',cfo:'',aevm:'',submitted:'',drive:''};
      }

      case 'add_credit':
        return{action:'add_cashflow',type:'Credit',
          desc:(g.desc||g.title||'').trim()||'Voice entry',
          amount:parseFloat((g.amount||'0').replace(/,/g,'').replace(/₱/g,'')),
          category:'Other',account:'Cash'};

      case 'add_debit':
        return{action:'add_cashflow',type:'Debit',
          desc:(g.desc||g.title||'').trim()||'Voice entry',
          amount:parseFloat((g.amount||'0').replace(/,/g,'').replace(/₱/g,'')),
          category:'Income',account:'Cash'};

      case 'add_transfer':{
        const amount=parseFloat((g.amount||'0').replace(/,/g,'').replace(/₱/g,''));
        const fromRaw=(g.from||'').trim();
        const toRaw=(g.to||'').trim();
        return{action:'add_transfer',amount,fromAccount:fromRaw,toAccount:toRaw};
      }

      case 'add_journal':{
        const content=(g.content||text.replace(intent.re,'').trim());
        return{action:'add_journal',title:content.substring(0,50)||'Voice Entry',content,mood:'🟢'};
      }

      case 'mute':  return{action:'mute'};
      case 'unmute':return{action:'unmute'};
    }
  }
  // ── Smart NLP fallback — infer intent from keywords alone ────────────────
  const tl = text.toLowerCase();

  // Amount pattern present → likely cashflow
  const amtMatch = tl.match(/[₱]?([\d,]+(?:\.\d+)?)(?:\s+pesos?)?/);
  const amt = amtMatch ? parseFloat(amtMatch[1].replace(/,/g,'')) : 0;

  if(amt > 0){
    // Has debit/income keywords → Debit (income)
    if(/\b(salary|sweldo|pumasok|received|income|debit|bayad\s+sa\s+akin|natanggap|kita)\b/i.test(tl)){
      const desc = tl.replace(/[₱\d,\.]+/g,'').replace(/\b(salary|sweldo|income|debit|received|natanggap|pumasok|kita|pesos?)\b/ig,'').trim()||'Voice entry';
      return{action:'add_cashflow',type:'Debit',desc,amount:amt,category:'Income',account:'Cash'};
    }
    // Has credit/expense keywords → Credit (expense)
    if(/\b(credit|expense|paid|bayad|spent|bought|nagbayad|labas|gastos|ubos)\b/i.test(tl)){
      const desc = tl.replace(/[₱\d,\.]+/g,'').replace(/\b(credit|expense|paid|bayad|spent|bought|nagbayad|labas|gastos|ubos|pesos?)\b/ig,'').trim()||'Voice entry';
      return{action:'add_cashflow',type:'Credit',desc,amount:amt,category:'Other',account:'Cash'};
    }
  }

  // Has task keywords without amount → add_task
  if(/\b(task|todo|remind|gawin|gawain|trabaho|dapat|kailangan)\b/i.test(tl)){
    const title = tl
      .replace(/\b(add|new|create|task|todo|remind\s+me\s+to|gawin|gawain|dapat|kailangan|a|an|the)\b/ig,'')
      .trim() || text;
    if(title.length > 2) return{action:'add_task',title,world:'LIFE',priority:'Medium',status:'Todo',due:'',platform:'',client:'',notes:''};
  }

  // Has delete keywords → try delete_task fuzzy
  if(/\b(delete|remove|trash|burahin|alisin|tanggalin)\b/i.test(tl)){
    const target = tl.replace(/\b(delete|remove|trash|burahin|alisin|tanggalin|the|a|an)\b/ig,'').trim();
    if(target.length > 2) return{action:'delete_task',target};
  }

  return{action:'unknown',message:text};
}

async function executeVoiceCommand(text){
  if(text) LearnEngine.onVoiceCommand(text);
  setVcState('processing');document.getElementById('vTranscript').textContent=text;showVBar();
  const stripped=stripWakeWord(text);
  if(stripped===null){
    setVcState('idle');document.getElementById('vLabel').textContent="I'M LISTENING";document.getElementById('vTranscript').textContent='Go ahead...';
    speak('Yeah, go ahead.');
    if(!recognition)recognition=initRecognition();
    try{recognition.start();}catch(e){}
    return;
  }
  const cmd=parseVoiceCommand(stripped);
  try{
    const dispatchPromise=dispatchVoiceAction(cmd,stripped);
    const timeoutPromise=new Promise(resolve=>setTimeout(()=>resolve('__TIMEOUT__'),15000));
    const raceResult=await Promise.race([dispatchPromise,timeoutPromise]);
    if(raceResult==='__TIMEOUT__'){
      setVcState('idle');
      showToast('⚠ That took too long — check your connection and try again.');
      console.warn('Voice command timed out after 15s:',stripped);
    }
  }catch(e){
    console.error('Voice command failed:',e);
    setVcState('idle');
    showToast('⚠ Voice command hit an error — check console for details.');
  }
}

async function dispatchVoiceAction(cmd,rawText){
  let result='';
  try{
    switch(cmd.action){

      // ── NAVIGATE ──────────────────────────────────────────────
      case 'navigate':
        setView(cmd.view||'dashboard');
        result='Navigated to '+cmd.view+'.';
        break;

      // ── ADD TASK ──────────────────────────────────────────────
      case 'add_task':{
        const t={id:Date.now(),title:cmd.title||rawText,world:cmd.world||'LIFE',priority:cmd.priority||'Medium',status:cmd.status||'Todo',due:cmd.due||'',platform:cmd.platform||'',client:cmd.client||'',notes:cmd.notes||''};
        DB.tasks.unshift(t);
        SB.upsert('tasks',t,'tasks');
        addHistory('add','Added task: '+t.title,{...t,_dbKey:'tasks'});
        reRenderAll();
        result='Task added: "'+t.title+'"';
        break;
      }

      // ── UPDATE TASK STATUS ────────────────────────────────────
      case 'update_task_status':{
        const t=fuzzyFind(cmd.target,DB.tasks,x=>x.title);
        if(!t){result='No task found matching "'+cmd.target+'".';break;}
        const prev=t.status;
        t.status=cmd.status;
        SB.update('tasks',t.id,t,'tasks');
        save('tasks');
        syncTaskToNoteBlock(t);
        addHistory('edit','Status: '+t.title+' → '+cmd.status,t);
        reRenderAll();
        result='"'+t.title+'" marked '+cmd.status+'.';
        break;
      }

      // ── UPDATE TASK PRIORITY ──────────────────────────────────
      case 'update_task_priority':{
        const t=fuzzyFind(cmd.target,DB.tasks,x=>x.title);
        if(!t){result='No task found matching "'+cmd.target+'".';break;}
        t.priority=cmd.priority;
        SB.update('tasks',t.id,t,'tasks');
        save('tasks');
        addHistory('edit','Priority: '+t.title+' → '+cmd.priority,t);
        reRenderAll();
        result='"'+t.title+'" set to '+cmd.priority+' priority.';
        break;
      }

      // ── DELETE TASK ───────────────────────────────────────────
      case 'delete_task':{
        const t=fuzzyFind(cmd.target,DB.tasks,x=>x.title);
        if(!t){result='No task found matching "'+cmd.target+'".';break;}
        DB.tasks=DB.tasks.filter(x=>x.id!==t.id);
        SB.remove('tasks',t.id,'tasks');
        addHistory('delete','Deleted task: '+t.title,{...t,_dbKey:'tasks'});
        reRenderAll();
        result='Task deleted: "'+t.title+'"';
        break;
      }

      // ── ADD CLIENT ────────────────────────────────────────────
      case 'add_client':{
        const c={id:Date.now(),name:cmd.name||'New Client',world:'VENTURE',status:cmd.status||'Active',revenue:cmd.revenue||'$$',next:cmd.next||'',contact:cmd.contact||''};
        DB.clients.unshift(c);
        SB.upsert('clients',c,'clients');
        addHistory('add','Added client: '+c.name,{...c,_dbKey:'clients'});
        renderWorkIH();
        result='Client added: "'+c.name+'"';
        break;
      }

      // ── UPDATE CLIENT STATUS ──────────────────────────────────
      case 'update_client_status':{
        const c=fuzzyFind(cmd.target,DB.clients,x=>x.name);
        if(!c){result='No client found matching "'+cmd.target+'".';break;}
        c.status=cmd.status;
        SB.update('clients',c.id,c,'clients');
        save('clients');
        addHistory('edit','Client status: '+c.name+' → '+cmd.status,c);
        renderWorkIH();
        result='"'+c.name+'" set to '+cmd.status+'.';
        break;
      }

      // ── DELETE CLIENT ─────────────────────────────────────────
      case 'delete_client':{
        const c=fuzzyFind(cmd.target,DB.clients,x=>x.name);
        if(!c){result='No client found matching "'+cmd.target+'".';break;}
        DB.clients=DB.clients.filter(x=>x.id!==c.id);
        SB.remove('clients',c.id,'clients');
        addHistory('delete','Deleted client: '+c.name,{...c,_dbKey:'clients'});
        renderWorkIH();
        result='Client removed: "'+c.name+'"';
        break;
      }

      // ── ADD VENTURE ITEM ──────────────────────────────────────
      case 'add_venture':{
        const v={id:Date.now(),name:cmd.name||'New Lead',type:cmd.type||'Client',stage:cmd.stage||'Lead',notes:cmd.notes||''};
        DB.venture.unshift(v);
        SB.upsert('venture',v,'venture');
        addHistory('add','Added venture: '+v.name,{...v,_dbKey:'venture'});
        renderVenture();
        result='Venture item added: "'+v.name+'" at '+v.stage+'.';
        break;
      }

      // ── MOVE VENTURE STAGE ────────────────────────────────────
      case 'move_venture':{
        const ven=fuzzyFind(cmd.target,DB.venture,x=>x.name);
        if(!ven){result='No venture item found matching "'+cmd.target+'".';break;}
        const prev=ven.stage;
        ven.stage=cmd.stage;
        SB.update('venture',ven.id,ven,'venture');
        save('venture');
        addHistory('edit','Moved '+ven.name+': '+prev+' → '+cmd.stage,ven);
        renderVenture();
        result='"'+ven.name+'" moved to '+cmd.stage+'.';
        break;
      }

      // ── DELETE VENTURE ITEM ───────────────────────────────────
      case 'delete_venture':{
        const ven=fuzzyFind(cmd.target,DB.venture,x=>x.name);
        if(!ven){result='No venture item found matching "'+cmd.target+'".';break;}
        DB.venture=DB.venture.filter(x=>x.id!==ven.id);
        SB.remove('venture',ven.id,'venture');
        addHistory('delete','Deleted venture: '+ven.name,{...ven,_dbKey:'venture'});
        renderVenture();
        result='Venture item removed: "'+ven.name+'"';
        break;
      }

      // ── ADD FAITH ACTIVITY ────────────────────────────────────
      case 'add_faith':{
        const a={id:Date.now(),activity:cmd.activity||rawText,group:cmd.group||'',date:cmd.date||localDateStr(new Date()),submitted:cmd.submitted||'',cfo:cmd.cfo||'',aevm:cmd.aevm||'',status:cmd.status||'Pending',assigned:cmd.assigned||'',drive:cmd.drive||''};
        DB.faith.unshift(a);
        SB.upsert('faith',a,'faith');
        addHistory('add','Added faith: '+a.activity,{...a,_dbKey:'faith'});
        renderFaith();
        result='Faith activity logged: "'+a.activity+'"';
        break;
      }

      // ── DELETE FAITH ACTIVITY ─────────────────────────────────
      case 'delete_faith':{
        const a=fuzzyFind(cmd.target,DB.faith,x=>x.activity);
        if(!a){result='No faith activity found matching "'+cmd.target+'".';break;}
        DB.faith=DB.faith.filter(x=>x.id!==a.id);
        SB.remove('faith',a.id,'faith');
        addHistory('delete','Deleted faith: '+a.activity,{...a,_dbKey:'faith'});
        renderFaith();
        result='Faith activity removed: "'+a.activity+'"';
        break;
      }

      // ── ADD CASHFLOW ──────────────────────────────────────────
      case 'add_cashflow':{
        const t={id:Date.now(),type:cmd.type||'Debit',date:localDateStr(new Date()),desc:cmd.desc||rawText,amount:cmd.amount||0,account:cmd.account||'Cash',category:cmd.category||'Other'};
        DB.cashflow.unshift(t);
        SB.upsert('cashflow',t,'cashflow');
        addHistory('add','Added '+t.type+': ₱'+t.amount,{...t,_dbKey:'cashflow'});
        renderLife();renderBrief();
        result=(t.type==='Credit'?'Credit':'Debit')+' of ₱'+t.amount.toLocaleString()+' recorded.';
        break;
      }

      // ── ADD TRANSFER (between your own accounts) ───────────────────────
      case 'add_transfer':{
        if(!cmd.amount||cmd.amount<=0){result='Didn\'t catch a valid amount for that transfer.';break;}
        const accountNames=(DB.accounts||[]).map(a=>a.name);
        const fromMatch=fuzzyFind(cmd.fromAccount,accountNames,x=>x)||cmd.fromAccount||'Cash';
        const toMatch=fuzzyFind(cmd.toAccount,accountNames,x=>x)||cmd.toAccount||'Cash';
        if(fromMatch===toMatch){result='Source and destination sound the same — try again with two different accounts.';break;}
        const entry={id:Date.now(),type:'Transfer',desc:'Transfer: '+fromMatch+' → '+toMatch,amount:cmd.amount,account:fromMatch,category:'Transfer',date:localDateStr(new Date()),notes:'Added by voice',_fromAccount:fromMatch,_toAccount:toMatch};
        DB.cashflow.unshift(entry);
        save('cashflow');
        SB.upsert('cashflow',entry,'cashflow');
        addHistory('add','Transfer: '+fromMatch+' → '+toMatch+' ₱'+cmd.amount,{...entry,_dbKey:'cashflow'});
        renderLife();renderBrief();
        result='Transferred ₱'+cmd.amount.toLocaleString()+' from '+fromMatch+' to '+toMatch+'.';
        break;
      }

      // ── ADD JOURNAL ───────────────────────────────────────────
      case 'add_journal':{
        const j={id:Date.now(),title:cmd.title||'Voice Entry',content:cmd.content||rawText,mood:'🟢',date:new Date().toISOString()};
        DB.journal.unshift(j);
        SB.upsert('journal',j,'journal');
        addHistory('add','Added journal: '+j.title,{...j,_dbKey:'journal'});
        setView('journal');
        result='Journal entry saved: "'+j.title+'"';
        break;
      }

      // ── MUTE / UNMUTE ─────────────────────────────────────────
      case 'mute':
        isMuted=true;speechSynthesis.cancel();
        showToast('Voice muted');
        result='Voice muted.';
        break;

      case 'unmute':
        isMuted=false;
        result='Voice activated.';
        speak(result);
        break;

      // ── NATURAL CONVERSATION ─────────────────────────────────────
      // Not a structured command (no "add task", "go to", etc. pattern
      // matched) — don't scold the user with command syntax. Just talk
      // to JELIX naturally, the same as typing in the chat would.
      case 'unknown':
      default:{
        setVcState('processing');
        const agentRes=await askJelixAgent(rawText);
        result=agentRes.text||'Done.';
        speak(result.replace(/<[^>]+>/g,''));
        break;
      }
    }
  }catch(e){
    _safeChime('chimeError'); result='Something went wrong processing that — check console for details.'; console.error('Voice dispatch error:',e);
  }

  setVcState('idle');
  // Always show something — silent failures are exactly what makes this feel broken
  if(result) showVcResult(result);
  if(result) showToast(result.length>60?result.substring(0,57)+'…':result);
  addHistory('voice','Voice: '+rawText.substring(0,60),{cmd:cmd?.action||'unknown',raw:rawText});
  if(cmd && cmd.action && cmd.action!=='unknown'){
    _safeChime('chimeSuccess');
  }
}
