// ===== SUPABASE =====
const SB_URL='https://ddxkmidantqgnxfxsrrz.supabase.co';
const SB_KEY='sb_publishable_zmncT-P48Tu3zsq33Cd5cg_zbq69aWN';
// ── Sync status — every read/write already funnels through sbFetch, so that's
// the one place to track it rather than instrumenting dozens of call sites.
// Shows an iCloud-style "Synced / Syncing… / Sync issue" badge instead of
// sync problems only surfacing as silently-missing data days later.
let _syncPending=0,_syncLastError=null,_syncLastOkAt=null;
function _syncBadgeUpdate(){
  // querySelectorAll, not getElementById — desktop and mobile each have their
  // own badge element (mobile's is icon-only, no room for the label), both
  // reflecting the same underlying state.
  const els=document.querySelectorAll('.sync-badge');if(!els.length)return;
  let cls,title,html;
  if(_syncPending>0){
    cls='syncing';title='';html='<i class="ti ti-refresh"></i><span>Syncing…</span>';
  } else if(_syncLastError){
    cls='error';title=_syncLastError;html='<i class="ti ti-alert-triangle"></i><span>Sync issue</span>';
  } else {
    cls='idle';
    title=_syncLastOkAt?('Last synced '+_syncLastOkAt.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Manila'})):'';
    html=_syncLastOkAt?'<i class="ti ti-cloud-check"></i><span>Synced</span>':'<i class="ti ti-cloud-off"></i><span>Not synced</span>';
  }
  els.forEach(el=>{el.className='sync-badge '+cls+(el.classList.contains('sync-badge-mobile')?' sync-badge-mobile':'');el.title=title||'Retry sync';el.setAttribute('aria-label',title||'Retry sync');el.innerHTML=html;});
}
async function sbFetch(table,method='GET',body=null,match=null){
  let url=`${SB_URL}/rest/v1/${table}`;
  const qs=[];if(match)qs.push(match);if(method==='GET')qs.push('order=created_at.desc');
  if(qs.length)url+='?'+qs.join('&');
  // Use the authenticated user's own token when signed in — this is what makes auth.uid()
  // resolve correctly in RLS policies. Falls back to the anon key only if no session exists
  // (keeps the app from hard-breaking before auth is set up, though real tables will reject
  // writes once RLS is rewritten to require a matching user_id).
  _syncPending++;_syncBadgeUpdate();
  try{
    const session=await getAuthSession();
    const authToken=session?session.access_token:SB_KEY;
    const prefer=method==='POST'?'resolution=merge-duplicates,return=representation':method==='PATCH'?'return=representation':'';
    const opts={method,headers:{'apikey':SB_KEY,'Authorization':'Bearer '+authToken,'Content-Type':'application/json','Prefer':prefer}};
    if(body)opts.body=JSON.stringify(body);
    const res=await fetch(url,opts);
    if(!res.ok){
      let errMsg=res.status+' '+res.statusText;
      try{const errBody=await res.clone().json();errMsg=errBody.message||errBody.error||errMsg;}catch(e){}
      throw new Error(errMsg);
    }
    _syncLastError=null;_syncLastOkAt=new Date();
    if(res.status===204)return method==='GET'?[]:true;
    return await res.json();
  }catch(err){
    _syncLastError=err.message;
    throw err;
  }finally{
    _syncPending--;_syncBadgeUpdate();
  }
}

// ── Supabase Auth — real per-user authentication behind the PIN lock ────────
// The PIN screen stays as the quick app-level lock (unchanged). This layer is
// the actual DATA-level authentication: without a valid session here, RLS
// policies (once rewritten to auth.uid() = user_id) refuse all access, even
// with the anon key in hand.
async function authSignUp(email,password){
  try{
    const res=await fetch(`${SB_URL}/auth/v1/signup`,{
      method:'POST',
      headers:{'apikey':SB_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({email,password})
    });
    const data=await res.json();
    if(!res.ok)return{ok:false,error:data.msg||data.error_description||data.error||'Sign-up failed'};
    if(data.access_token)_storeAuthSession(data);
    return{ok:true,data};
  }catch(e){return{ok:false,error:e.message};}
}
async function authSignIn(email,password){
  try{
    const res=await fetch(`${SB_URL}/auth/v1/token?grant_type=password`,{
      method:'POST',
      headers:{'apikey':SB_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({email,password})
    });
    const data=await res.json();
    if(!res.ok)return{ok:false,error:data.msg||data.error_description||data.error||'Sign-in failed'};
    _storeAuthSession(data);
    return{ok:true,data};
  }catch(e){return{ok:false,error:e.message};}
}
function _storeAuthSession(data){
  const session={
    access_token:data.access_token,
    refresh_token:data.refresh_token,
    expires_at:Date.now()+((data.expires_in||3600)*1000),
    user_id:data.user?.id||null,
    email:data.user?.email||null,
  };
  localStorage.setItem('j-auth-session',JSON.stringify(session));
  return session;
}
async function _refreshAuthSession(refreshToken){
  try{
    const res=await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`,{
      method:'POST',
      headers:{'apikey':SB_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({refresh_token:refreshToken})
    });
    const data=await res.json();
    if(!res.ok)return null;
    return _storeAuthSession(data);
  }catch(e){return null;}
}
async function getAuthSession(){
  const raw=localStorage.getItem('j-auth-session');
  if(!raw)return null;
  let session;
  try{session=JSON.parse(raw);}catch(e){return null;}
  // Refresh proactively if within 60s of expiry
  if(Date.now()>session.expires_at-60000){
    const refreshed=await _refreshAuthSession(session.refresh_token);
    return refreshed;
  }
  return session;
}
const JOB_AI_URL='https://ddxkmidantqgnxfxsrrz.supabase.co/functions/v1/job-ai';
const _jelixDelay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function requestJobAI({message,history='',world='',purpose='dashboard_assistant',system=''}){
  const session=await getAuthSession();
  if(!session?.access_token)return{ok:false,text:'Sign in to use J.E.L.I.X.'};
  try{
    const requestOptions={method:'POST',headers:{'apikey':SB_KEY,'Authorization':'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({message,history,world,purpose,system})};
    let res=await fetch(JOB_AI_URL,requestOptions);
    if([429,502,503,504].includes(res.status)){
      await _jelixDelay(700);
      res=await fetch(JOB_AI_URL,requestOptions);
    }
    const data=await res.json().catch(()=>({}));
    if(!res.ok){
      const text=res.status===401?'Your J.E.L.I.X. session has expired. Please sign in again.':res.status===429?'J.E.L.I.X. is receiving too many requests right now.':res.status>=500?'J.E.L.I.X. cannot reach the secure AI service right now.':data?.error||'J.E.L.I.X. is unavailable right now.';
      return{ok:false,text,status:res.status,code:data?.code||'AI_REQUEST_FAILED',retryable:[429,502,503,504].includes(res.status),request_id:data?.request_id};
    }
    return{ok:true,text:data?.text||'No response.',request_id:data?.request_id};
  }catch(error){
    console.warn('[J.E.L.I.X.] request failed',error);
    return{ok:false,text:navigator.onLine===false?'You’re offline. Reconnect and try J.E.L.I.X. again.':'J.E.L.I.X. can’t reach its secure service right now.',status:0,code:'NETWORK_ERROR',retryable:true};
  }
}
function isSignedIn(){
  const raw=localStorage.getItem('j-auth-session');
  if(!raw)return false;
  try{return !!JSON.parse(raw).access_token;}catch(e){return false;}
}
function getAuthUserId(){
  const raw=localStorage.getItem('j-auth-session');
  if(!raw)return null;
  try{return JSON.parse(raw).user_id;}catch(e){return null;}
}
function authSignOut(){
  localStorage.removeItem('j-auth-session');
  window.location.reload();
}
async function confirmSignOut(){
  if(await jelixConfirm("Sign out completely? You'll need your email and password to sign back in.",'Sign Out'))authSignOut();
}
async function confirmSignOutEverywhere(){
  if(await jelixConfirm('Sign out on every device? Use this if a device is lost or you suspect someone else has access. All sessions everywhere will need to sign in again.','Sign Out Everywhere'))authSignOutEverywhere();
}
async function authSignOutEverywhere(){
  const raw=localStorage.getItem('j-auth-session');
  if(!raw){authSignOut();return;}
  let session;
  try{session=JSON.parse(raw);}catch(e){authSignOut();return;}
  try{
    await fetch(`${SB_URL}/auth/v1/logout?scope=global`,{
      method:'POST',
      headers:{'apikey':SB_KEY,'Authorization':'Bearer '+session.access_token}
    });
  }catch(e){
    // Even if the network call fails, still clear locally and reload —
    // the more important thing is this device stops trusting the old session.
  }
  localStorage.removeItem('j-auth-session');
  showToast('Signed out on every device.');
  setTimeout(()=>window.location.reload(),800);
}
let _authMode='signin';
function toggleAuthMode(){
  _authMode=_authMode==='signin'?'signup':'signin';
  document.getElementById('authSubmitBtn').textContent=_authMode==='signin'?'Sign In':'Create Account';
  document.getElementById('authToggleText').textContent=_authMode==='signin'?'First time here?':'Already have an account?';
  document.getElementById('authToggleLink').textContent=_authMode==='signin'?'Create your account':'Sign in instead';
  document.getElementById('authScreenError').style.display='none';
}
async function submitAuthForm(){
  const email=document.getElementById('auth-email').value.trim();
  const password=document.getElementById('auth-password').value;
  const errEl=document.getElementById('authScreenError');
  const btn=document.getElementById('authSubmitBtn');
  errEl.style.display='none';
  if(!email||!password){errEl.textContent='Enter both email and password.';errEl.style.display='block';return;}
  if(password.length<6){errEl.textContent='Password must be at least 6 characters.';errEl.style.display='block';return;}
  btn.disabled=true;btn.textContent='Please wait...';
  const result=_authMode==='signin'?await authSignIn(email,password):await authSignUp(email,password);
  btn.disabled=false;
  if(!result.ok){
    errEl.textContent=result.error;
    errEl.style.display='block';
    btn.textContent=_authMode==='signin'?'Sign In':'Create Account';
    return;
  }
  if(_authMode==='signup'&&!result.data.access_token){
    // Email confirmation required before session is issued
    errEl.style.display='none';
    document.getElementById('authScreenSubtitle').textContent='Check your email to confirm, then sign in.';
    toggleAuthMode();
    btn.textContent='Sign In';
    return;
  }
  document.getElementById('authScreen').style.display='none';
  proceedToLockScreen();
}
function proceedToLockScreen(){
  const ls=document.getElementById('lockScreen');
  if(ls)ls.style.display='flex';
}
async function checkAuthGate(){
  const authEl=document.getElementById('authScreen');
  if(isSignedIn()){
    const session=await getAuthSession();
    if(session){proceedToLockScreen();return;}
  }
  // No valid session — show the auth screen instead of the PIN lock
  if(authEl)authEl.style.display='flex';
}

const SYNC_TOMBSTONE_KEY='j-sync-tombstones-v1';
function readSyncTombstones(){
  let tombstones={};
  try{tombstones=JSON.parse(localStorage.getItem(SYNC_TOMBSTONE_KEY)||'{}')||{};}catch(e){}
  return tombstones;
}
function syncTombstoneKeys(table,record){
  if(!record)return[];
  const prefix=table==='cal_events'?'cal_events':'tasks';
  const keys=[];
  if(record.id!=null)keys.push(prefix+':id:'+String(record.id));
  if(record.google_task_id)keys.push('tasks:google:'+String(record.google_task_id));
  if(record.gmail_message_id)keys.push('tasks:gmail:'+String(record.gmail_message_id));
  if(record.google_event_id)keys.push('cal_events:google:'+String(record.google_event_id));
  return keys;
}
function cloudSyncTombstoneId(table,record){
  const uid=getAuthUserId();
  if(!uid||!record||record.id==null)return'';
  const entity=table==='cal_events'?'cal_events':'tasks';
  return uid+':'+entity+':'+String(record.id);
}
function cloudSyncGoogleId(table,record){
  if(!record)return null;
  return table==='cal_events'?(record.google_event_id||null):(record.google_task_id||null);
}
async function persistSyncDeletion(table,record){
  const uid=getAuthUserId();
  const id=cloudSyncTombstoneId(table,record);
  if(!uid||!id)return;
  const entity=table==='cal_events'?'cal_events':'tasks';
  try{
    await sbFetch('sync_tombstones','POST',{id,user_id:uid,entity_type:entity,record_id:record.id,google_id:cloudSyncGoogleId(entity,record),gmail_message_id:entity==='tasks'?(record.gmail_message_id||null):null,active:true,deleted_at:new Date().toISOString(),cleared_at:null});
  }catch(error){console.warn('[Sync] Could not persist deletion marker',error);}
}
async function removePersistedSyncDeletion(table,record){
  const id=cloudSyncTombstoneId(table,record);if(!id)return;
  try{await sbFetch('sync_tombstones','PATCH',{active:false,cleared_at:new Date().toISOString()},'id=eq.'+encodeURIComponent(id));}catch(error){console.warn('[Sync] Could not clear deletion marker',error);}
}
function rememberSyncDeletion(table,record,persist=true){
  const keys=syncTombstoneKeys(table,record);if(!keys.length)return;
  const tombstones=readSyncTombstones();
  keys.forEach(key=>{tombstones[key]=Date.now();});
  localStorage.setItem(SYNC_TOMBSTONE_KEY,JSON.stringify(tombstones));
  if(persist)return persistSyncDeletion(table,record);
}
function isSyncTombstoned(table,record){
  const tombstones=readSyncTombstones();
  return syncTombstoneKeys(table,record).some(key=>Boolean(tombstones[key]));
}
function clearSyncTombstone(table,record,persist=true){
  const tombstones=readSyncTombstones();let changed=false;
  syncTombstoneKeys(table,record).forEach(key=>{if(tombstones[key]){delete tombstones[key];changed=true;}});
  if(changed)localStorage.setItem(SYNC_TOMBSTONE_KEY,JSON.stringify(tombstones));
  if(persist)return removePersistedSyncDeletion(table,record);
}
function recordFromCloudSyncTombstone(row){
  const record={id:row.record_id};
  if(row.entity_type==='tasks'){
    record.google_task_id=row.google_id||null;
    record.gmail_message_id=row.gmail_message_id||null;
  }
  if(row.entity_type==='cal_events')record.google_event_id=row.google_id||null;
  return record;
}
function removeSyncDeletedRecordLocally(entity,record){
  const key=entity==='cal_events'?'calEvents':'tasks';
  DB[key]=(DB[key]||[]).filter(item=>{
    if(String(item.id)===String(record.id))return false;
    if(record.google_task_id&&item.google_task_id===record.google_task_id)return false;
    if(record.gmail_message_id&&item.gmail_message_id===record.gmail_message_id)return false;
    if(record.google_event_id&&item.google_event_id===record.google_event_id)return false;
    return true;
  });
  save(key);
}
async function loadCloudSyncTombstones(){
  try{
    const rows=await sbFetch('sync_tombstones');
    (rows||[]).forEach(row=>{
      const record=recordFromCloudSyncTombstone(row);
      if(row.active===false)clearSyncTombstone(row.entity_type,record,false);
      else{
        rememberSyncDeletion(row.entity_type,record,false);
        removeSyncDeletedRecordLocally(row.entity_type,record);
      }
    });
  }catch(error){console.warn('[Sync] Cloud deletion markers unavailable',error);}
}

const SB={
  // Known date/timestamp-typed field names across all tables — Postgres rejects "" for
  // date columns (needs a real date or NULL), so any empty string here must become null
  // before it's sent, regardless of which table it's going to.
  _DATE_FIELDS:new Set(['due','date','startDate','endDate','submitted','recurEnd','oath','dueDate','deadline','updated','birthDate','startTime','endTime','time']),
  _sanitizeDates(obj){
    const out={...obj};
    for(const k in out){
      if(this._DATE_FIELDS.has(k)&&out[k]==='')out[k]=null;
    }
    return out;
  },
  async load(table,key){
    try{
      let rows=await sbFetch(table);
      if((table==='tasks'||table==='cal_events')&&rows&&rows.length){
        const stale=rows.filter(row=>isSyncTombstoned(table,row));
        rows=rows.filter(row=>!isSyncTombstoned(table,row));
        stale.forEach(row=>sbFetch(table,'DELETE',null,`id=eq.${row.id}`).catch(()=>{}));
      }
      if(rows&&((table==='tasks'||table==='cal_events')||rows.length)){
        if(table==='cashflow')DB[key]=rows.map(r=>({...r,desc:r.description||r.desc||''}));
        else if(table==='saved_links')DB[key]=rows.map(r=>({...r,previewImage:r.preview_image,worldId:r.world_id,projectId:r.project_id}));
        else if(table==='item_links')DB[key]=rows.map(r=>({...r,fromType:r.from_type,fromId:r.from_id,toType:r.to_type,toId:r.to_id}));
        else if(table==='cal_events')DB[key]=rows.map(r=>({...r,recurExceptions:r.recur_exceptions||{}}));
        else if(table==='projects')DB[key]=rows.map(r=>({...r,worldId:r.world_id}));
        else DB[key]=rows;
        save(key);
      }
    }catch(err){
      // Silent — Supabase unavailable, using localStorage fallback
    }
  },
  async upsert(table,row,key){
    let r=this._sanitizeDates(row);
    if(table==='cashflow'){r.description=row.desc;delete r.desc;delete r._fromAccount;delete r._toAccount;delete r._runBal;}
    if(table==='cal_events'){r.recur_exceptions=row.recurExceptions||{};delete r.recurExceptions;delete r._expandedDate;delete r._recurring;delete r._taskId;delete r._isTask;delete r._billId;delete r._isBill;}
    if(table==='projects'){r.world_id=row.worldId;delete r.worldId;}
    if(table==='memories'){delete r.source;}
    if(table==='tasks'){if(r.driveLink!==undefined){r.link=r.driveLink;delete r.driveLink;}}
    if(table==='saved_links'){r.preview_image=row.previewImage;r.world_id=row.worldId;r.project_id=row.projectId;delete r.previewImage;delete r.worldId;delete r.projectId;}
    if(table==='item_links'){r.from_type=row.fromType;r.from_id=row.fromId;r.to_type=row.toType;r.to_id=row.toId;delete r.fromType;delete r.fromId;delete r.toType;delete r.toId;}
    delete r._dbKey;
    const uid=getAuthUserId();
    if(!uid){
      showToast('⚠ Not signed in — saved locally, but changes won\'t sync until you log in again.');
      save(key);
      return;
    }
    r.user_id=uid;
    save(key); // persist locally first — a cloud failure below must never cost the local edit
    try{
      await sbFetch(table,'POST',r);
    }catch(err){
      showToast('\u26a0 Save failed ('+table+'): '+err.message);
      console.error('SB.upsert error',table,err);
    }
    if(table==='tasks')_pushTaskToGoogle(row);
    if(table==='cal_events')_pushCalEventToGoogle(row);
  },
  async update(table,id,changes,key){
    let c=this._sanitizeDates(changes);
    if(table==='cashflow'){if(c.desc){c.description=c.desc;delete c.desc;}delete c._fromAccount;delete c._toAccount;delete c._runBal;}
    if(table==='cal_events'){if(c.recurExceptions!==undefined){c.recur_exceptions=c.recurExceptions;delete c.recurExceptions;}delete c._expandedDate;delete c._recurring;delete c._taskId;delete c._isTask;delete c._billId;delete c._isBill;}
    if(table==='projects'&&c.worldId!==undefined){c.world_id=c.worldId;delete c.worldId;}
    if(table==='memories'){delete c.source;}
    if(table==='tasks'){if(c.driveLink!==undefined){c.link=c.driveLink;delete c.driveLink;}}
    if(table==='saved_links'){if(c.previewImage!==undefined){c.preview_image=c.previewImage;delete c.previewImage;}if(c.worldId!==undefined){c.world_id=c.worldId;delete c.worldId;}if(c.projectId!==undefined){c.project_id=c.projectId;delete c.projectId;}}
    if(table==='cal_events'&&c.worldId!==undefined){c.world_id=c.worldId;delete c.worldId;}
    // Conflict check -- only when this record has a remembered updated_at
    // baseline (set on load/last successful write). A mismatch means
    // another device changed this row since we last saw it; last-write-wins
    // would silently drop that change, so ask instead of guessing.
    const localRec=(DB[key]||[]).find(x=>x.id===id);
    if(localRec&&localRec.updated_at){
      try{
        const check=await sbFetch(table,'GET',null,`id=eq.${id}&select=updated_at`);
        const serverUpdatedAt=Array.isArray(check)&&check[0]?check[0].updated_at:null;
        if(serverUpdatedAt&&serverUpdatedAt!==localRec.updated_at){
          const resolution=await _showConflictModal(table,key,id,localRec,c);
          if(resolution==='theirs')return;
        }
      }catch(e){}
    }
    save(key); // persist locally first — a cloud failure below must never cost the local edit
    try{
      const updated=await sbFetch(table,'PATCH',c,`id=eq.${id}`);
      if(Array.isArray(updated)&&updated[0]&&localRec)localRec.updated_at=updated[0].updated_at;
    }catch(err){
      showToast('\u26a0 Update failed ('+table+'): '+err.message);
      console.error('SB.update error',table,err);
    }
    // Push the full current record (not just this partial patch) so a Google
    // sync triggered by e.g. a status-only change still has title/notes/due \u2014
    // `changes` alone may omit fields Google's API needs on every call.
    if(table==='tasks'){
      const full=(DB[key]||[]).find(x=>x.id===id);
      if(full)_pushTaskToGoogle(full);
      // Level-triggered, not edge-triggered: callers already mutate the
      // local object to status='Done' in place before calling SB.update,
      // so there's no "previous status" left to compare against here.
      // Runs every time a Done recurring task is saved, but
      // _maybeGenerateNextTaskOccurrence dedupes against an existing
      // next occurrence, so repeat calls are harmless no-ops.
      if(full&&full.status==='Done'&&typeof _maybeGenerateNextTaskOccurrence==='function')_maybeGenerateNextTaskOccurrence(full);
    }
    if(table==='cal_events'){const full=(DB[key]||[]).find(x=>x.id===id);if(full)_pushCalEventToGoogle(full);}
  },
  async remove(table,id,key){
    let googleId=null,googleListId=null,gmailId=null,record=null;
    if(table==='tasks'||table==='cal_events'){
      try{
        const prev=JSON.parse(localStorage.getItem('j-'+key)||'[]');
        record=prev.find(x=>x.id===id);
        if(record){
          googleId=table==='tasks'?record.google_task_id:record.google_event_id;
          if(table==='tasks')googleListId=record.google_task_list_id;
          if(table==='tasks')gmailId=record.gmail_message_id;
          await rememberSyncDeletion(table,record);
        }
      }catch(e){}
    }
    save(key);
    if(googleId){
      if(table==='tasks')_deleteGoogleTaskFor({google_task_id:googleId,google_task_list_id:googleListId});
      if(table==='cal_events')_deleteGoogleCalEventFor({google_event_id:googleId});
    }
    if(gmailId)archiveAndUnstarGmailMessage(gmailId).catch(error=>console.warn('[Gmail sync] Could not archive deleted task source',error));
    try{
      await sbFetch(table,'DELETE',null,`id=eq.${id}`);
    }catch(err){
      showToast('\u26a0 Cloud delete will retry on the next sync.');
      console.error('SB.remove error',table,err);
    }
  },
  async addHistory(e){
    try{await sbFetch('history','POST',e);}catch(err){/* silent */}
  }
};

// -- Conflict resolution -- shared by every table via SB.update() above.
// Keeps the summary generic (key: value lines, skipping housekeeping
// columns) rather than a bespoke diff view per table -- with ~20 different
// schemas, a real field-by-field diff view per table isn't worth building
// right now; a plain-text side-by-side is enough to make an informed choice.
function _summarizeRecordForConflict(rec){
  if(!rec)return '(deleted on the other device)';
  const skip=new Set(['id','user_id','created_at','updated_at']);
  const lines=Object.entries(rec).filter(([k,v])=>!skip.has(k)&&v!==''&&v!=null&&!k.startsWith('_'));
  if(!lines.length)return '(no visible fields)';
  return lines.map(([k,v])=>k+': '+(typeof v==='object'?JSON.stringify(v):v)).join('\n');
}
function _showConflictModal(table,key,id,localRec,pendingChanges){
  return new Promise(resolve=>{
    const merged={...localRec,...pendingChanges};
    document.getElementById('conflictMineContent').textContent=_summarizeRecordForConflict(merged);
    document.getElementById('conflictTheirsContent').textContent='Loading...';
    openModal('conflictModal');
    sbFetch(table,'GET',null,`id=eq.${id}`).then(rows=>{
      const serverRec=Array.isArray(rows)?rows[0]:null;
      document.getElementById('conflictTheirsContent').textContent=_summarizeRecordForConflict(serverRec);
      const mineBtn=document.getElementById('conflictKeepMineBtn');
      const theirsBtn=document.getElementById('conflictKeepTheirsBtn');
      const cleanup=()=>{mineBtn.onclick=null;theirsBtn.onclick=null;closeModal('conflictModal');};
      mineBtn.onclick=()=>{cleanup();resolve('mine');};
      theirsBtn.onclick=()=>{
        cleanup();
        if(serverRec){
          const idx=(DB[key]||[]).findIndex(x=>x.id===id);
          if(idx>-1)DB[key][idx]=serverRec;else DB[key].push(serverRec);
          save(key);
          try{reRenderAll();}catch(e){}
        }
        resolve('theirs');
      };
    }).catch(()=>{
      // Couldn't even load "theirs" -- safest default is to not silently
      // overwrite, so let the user retry rather than force a blind choice.
      document.getElementById('conflictTheirsContent').textContent='Could not load the other version -- try again.';
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// J.E.L.I.X. ORCHESTRATION LAYER
// User ↓ JELIX ↓ Intent Detection ↓ Context Engine ↓ Agent Router ↓
// Specialist Agent ↓ ChatGPT ↓ Response ↓ JELIX
// Runs entirely client-side inside this PWA, backed by Supabase. The user
// only ever sees "JELIX" — specialist agents never speak directly.
// ═══════════════════════════════════════════════════════════════════════════

// ── Context Engine — every request gets this without the user repeating anything ──
function gatherJelixContext(){
  const today=localDateStr(new Date());
  const openTasks=(DB.tasks||[]).filter(t=>t.status!=='Done');
  const dueSoon=openTasks.filter(t=>t.due&&t.due<=localDateStr(new Date(Date.now()+3*86400000))).sort((a,b)=>(a.due||'').localeCompare(b.due||''));
  const todayEvents=(DB.calEvents||[]).filter(e=>e.date===today);
  const upcomingEvents=(DB.calEvents||[]).filter(e=>e.date>today).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,8);
  const monthKey=today.slice(0,7);
  const monthTxns=(DB.cashflow||[]).filter(t=>(t.date||'').startsWith(monthKey));
  return{
    today,
    currentView:typeof currentView!=='undefined'?currentView:'dashboard',
    currentWorld:typeof csActiveClient!=='undefined'?csActiveClient:null,
    openTaskCount:openTasks.length,
    dueSoon:_jelixCompact(dueSoon,['title','world','priority','due','client'],8),
    todayEvents:_jelixCompact(todayEvents,['title','time','endTime','type','loc'],8),
    upcomingEvents:_jelixCompact(upcomingEvents,['title','date','time','type'],8),
    monthTxns,
    monthKey
  };
}
function _jelixCompact(records,keys,limit){
  return (records||[]).slice(0,limit||8).map(r=>{
    const o={};keys.forEach(k=>{if(r[k]!==undefined&&r[k]!=='')o[k]=r[k];});return o;
  });
}

// ── Specialist Agent Registry — 12 agents. Each owns a domain, a context
// slice, and a system prompt. None of them ever address the user directly;
// JELIX Core synthesizes their findings into one reply. ──────────────────────
const JELIX_AGENTS={
  ATLAS:{name:'ATLAS',domain:'Tasks, projects, Kanban, dependencies, priorities',provider:'chatgpt',
    context:g=>({openTaskCount:g.openTaskCount,dueSoon:g.dueSoon})},
  COMET:{name:'COMET',domain:'Calendar, scheduling, meetings, availability',provider:'chatgpt',
    context:g=>({today:g.todayEvents,upcoming:g.upcomingEvents})},
  FORGE:{name:'FORGE',domain:'Finance, expenses, budget, revenue, forecasts',provider:'chatgpt',
    context:g=>{
      const debits=g.monthTxns.filter(t=>t.type==='Debit').reduce((s,t)=>s+(t.amount||0),0);
      const credits=g.monthTxns.filter(t=>t.type==='Credit').reduce((s,t)=>s+(t.amount||0),0);
      return{month:g.monthKey,income:debits,spend:credits,net:debits-credits,budgetLimit:(DB.budget&&DB.budget.monthlyLimit)||null};
    }},
  NEXUS:{name:'NEXUS',domain:'Marketing, CRM, social media, SEO, campaigns, content',provider:'chatgpt',
    context:()=>({posts:_jelixCompact(DB.socialPosts,['platform','status','date','client'],8),
      campaigns:_jelixCompact(DB.campaigns,['name','status','client'],5),
      influencers:_jelixCompact(DB.influencers,['name','platform','status'],5)})},
  ORBIT:{name:'ORBIT',domain:'Business operations, clients, pipelines, sales',provider:'chatgpt',
    context:()=>({clients:_jelixCompact(DB.clients,['name','status','world'],10),
      pipeline:_jelixCompact(DB.pipeline,['stage','client','value'],8)})},
  VAULT:{name:'VAULT',domain:'Knowledge base, memory, notes, documents, SOPs, search',provider:'chatgpt',
    context:()=>({notes:_jelixCompact(DB.notes,['title','worldId'],8)})},
  ECHO:{name:'ECHO',domain:'Conversation memory, context, relationships, history',provider:'chatgpt',
    context:()=>({memories:_jelixCompact(DB.memories,['memory','category','world','date'],8),
      recentActivity:_jelixCompact(DB.history,['type','label','at'],8)})},
  PRISM:{name:'PRISM',domain:'Analytics, KPIs, business intelligence, charts, reports',provider:'chatgpt',
    context:g=>{
      const debits=g.monthTxns.filter(t=>t.type==='Debit').reduce((s,t)=>s+(t.amount||0),0);
      const credits=g.monthTxns.filter(t=>t.type==='Credit').reduce((s,t)=>s+(t.amount||0),0);
      const doneTasks=(DB.tasks||[]).filter(t=>t.status==='Done').length;
      const totalTasks=(DB.tasks||[]).length;
      return{monthRevenue:debits,monthSpend:credits,taskCompletionRate:totalTasks?Math.round(100*doneTasks/totalTasks)+'%':'n/a',
        activeSocialPosts:(DB.socialPosts||[]).length,openPipelineDeals:(DB.pipeline||[]).length};
    }},
  AURA:{name:'AURA',domain:'Habits, goals, reflection, personal growth',provider:'chatgpt',
    context:()=>({journal:_jelixCompact(DB.journal,['title','mood','date'],5),
      faith:_jelixCompact(DB.faith,['title','date'],3)})},
  SPARK:{name:'SPARK',domain:'Brainstorming, research, strategy, innovation',provider:'chatgpt',
    context:()=>({})},
  PILOT:{name:'PILOT',domain:'Decision support, executive recommendations, risk analysis, planning',provider:'chatgpt',
    context:g=>({overdueTasks:g.dueSoon.filter(t=>t.due<g.today).length,upcomingWeekEvents:g.upcomingEvents.length})},
  SENTRY:{name:'SENTRY',domain:'Permissions, security, system health, monitoring',provider:'chatgpt',
    context:()=>({googleWorkspaceConnected:isGoogleWorkspaceConnected(),hasAIKey:hasAnyAIKey(),
      pinConfigured:!!localStorage.getItem('j-sys-pin'),realtimeActive:!!(realtimeSocket&&realtimeSocket.readyState===1)})}
};

// ── Intent Router — decides which specialist(s) this request needs ──────────
async function classifyJelixAgents(userMessage,historyText){
  const roster=Object.values(JELIX_AGENTS).map(a=>`${a.name}: ${a.domain}`).join('\n');
  const system=`You are JELIX's intent router. Given the recent conversation and the newest message, return ONLY a JSON array of the agent names (from the roster below) whose domain is relevant to the NEWEST message. Follow-ups like "yes", "break it down", "what about those" refer back to whatever the conversation was already about — use the recent conversation to resolve what they mean. Pick 1-4 agents, most relevant first. If nothing matches, return [].\n\nRoster:\n${roster}${historyText?`\n\nRecent conversation:\n${historyText}`:''}\n\nRespond with ONLY the JSON array, e.g. ["FORGE","PRISM"]. No prose.`;
  const res=await callAIProvider(system,[{role:'user',content:userMessage}],{maxTokens:200,provider:'chatgpt'});
  if(!res.ok)return _keywordFallbackAgents(userMessage);
  try{
    const match=res.text.match(/\[[\s\S]*\]/);
    const ids=JSON.parse(match?match[0]:res.text);
    const valid=ids.filter(id=>JELIX_AGENTS[id]);
    return valid.length?valid:_keywordFallbackAgents(userMessage);
  }catch(e){
    return _keywordFallbackAgents(userMessage);
  }
}
// Safety net if the classifier call fails or returns something unparseable —
// simple keyword match so the pipeline degrades gracefully, never silently.
function _keywordFallbackAgents(userMessage){
  const m=userMessage.toLowerCase();
  const hits=[];
  if(/task|todo|project|kanban|priorit/.test(m))hits.push('ATLAS');
  if(/calendar|schedul|meeting|availab|event/.test(m))hits.push('COMET');
  if(/expense|budget|revenue|financ|cash|money|₱|forecast/.test(m))hits.push('FORGE');
  if(/marketing|social|seo|campaign|crm|content/.test(m))hits.push('NEXUS');
  if(/client|pipeline|sales|deal/.test(m))hits.push('ORBIT');
  if(/note|document|sop|knowledge|search/.test(m))hits.push('VAULT');
  if(/remember|memory|history|earlier|before/.test(m))hits.push('ECHO');
  if(/perform|kpi|analytic|report|how is|how are/.test(m))hits.push('PRISM');
  if(/habit|morning|goal|reflect|journal/.test(m))hits.push('AURA');
  if(/idea|brainstorm|strategy|research|innovat/.test(m))hits.push('SPARK');
  if(/should i|recommend|decide|risk|plan/.test(m))hits.push('PILOT');
  if(/security|permission|health|connect|status/.test(m))hits.push('SENTRY');
  return hits.length?hits:['PILOT'];
}

// ── Specialist execution ─────────────────────────────────────────────────────
async function runSpecialistAgent(agentId,userMessage,globalContext,historyText){
  const agent=JELIX_AGENTS[agentId];if(!agent)return null;
  const slice=agent.context(globalContext);
  const system=`You are the ${agent.name} specialist inside J.O.B Systems, an internal module JELIX consults — you never speak to the user directly. Domain: ${agent.domain}. Answer the NEWEST message using ONLY the data given below; if it's insufficient, say what's missing briefly. The newest message may be a short follow-up ("yes", "break it down") — use the recent conversation to understand what it's actually asking for. Be concise and factual — a few sentences or a short list, not a report.\n\nRelevant data:\n${JSON.stringify(slice)}${historyText?`\n\nRecent conversation:\n${historyText}`:''}`;
  const res=await callAIProvider(system,[{role:'user',content:userMessage}],{maxTokens:700,provider:'chatgpt'});
  return{agentId,ok:res.ok,text:res.ok?res.text:('('+agent.name+' unavailable: '+res.error+')')};
}

// ── Synthesis — JELIX Core merges specialist findings into one reply ────────
async function synthesizeJelixReply(userMessage,specialistResults,globalContext,historyText){
  const findings=specialistResults.map(r=>`- ${r.text}`).join('\n');
  const system=`You are J.E.L.I.X. — Justine's Executive Intelligence Partner inside J.O.B Systems. Calm, warm, professional, grounded, thoughtful. Never robotic, never theatrical, never overly enthusiastic. You quietly consulted internal specialists to answer this — never mention them, their names, or that you "consulted" anything; just answer as if you simply knew. Today is ${globalContext.today}. Reply directly and naturally, 2-5 sentences unless the request needs a list. Output ONLY your answer to the user — never restate, quote, or comment on these instructions themselves.${historyText?`\n\nRecent conversation (for context — the newest message may be a short follow-up that only makes sense next to this):\n${historyText}`:''}\n\nWhat you found:\n${findings}`;
  const res=await callAIProvider(system,[{role:'user',content:userMessage}],{maxTokens:700,provider:'chatgpt'});
  return res.ok?res.text:findings; // if synthesis call fails, at least surface the raw findings
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION LAYER — real writes into JELIX OS + Google Workspace, executed
// The action definitions remain documented for a future server-side approval
// workflow. J.E.L.I.X is read-only today and does not execute these writes.
// ═══════════════════════════════════════════════════════════════════════════
const JELIX_AGENT_TOOLS=[
  {name:'send_email',description:'Send an email via Gmail.',
    parameters:{type:'OBJECT',properties:{to:{type:'STRING'},subject:{type:'STRING'},body:{type:'STRING'}},required:['to','subject','body']}},
  {name:'create_event',description:'Create an event on Google Calendar (external, syncs to Google).',
    parameters:{type:'OBJECT',properties:{calendarId:{type:'STRING',description:"'primary' unless a specific calendar is named"},title:{type:'STRING'},startISO:{type:'STRING',description:'ISO 8601 datetime'},endISO:{type:'STRING',description:'ISO 8601 datetime'},notes:{type:'STRING'}},required:['title','startISO','endISO']}},
  {name:'write_drive_file',description:'Create a file in Google Drive.',
    parameters:{type:'OBJECT',properties:{fileName:{type:'STRING'},content:{type:'STRING'},mimeType:{type:'STRING'}},required:['fileName','content']}},
  {name:'create_task',description:'Create a task inside J.O.B Systems (ATLAS — internal Kanban, not Google).',
    parameters:{type:'OBJECT',properties:{title:{type:'STRING'},world:{type:'STRING',description:'e.g. WORK-IH, WORK-CS, VENTURE, BUILD, SIDES, FAITH, LIFE'},priority:{type:'STRING',description:"'High'|'Medium'|'Low'"},due:{type:'STRING',description:'YYYY-MM-DD, optional'},client:{type:'STRING'}},required:['title']}},
  {name:'create_internal_event',description:'Create an event on the internal JELIX OS calendar (COMET — not Google).',
    parameters:{type:'OBJECT',properties:{title:{type:'STRING'},date:{type:'STRING',description:'YYYY-MM-DD'},time:{type:'STRING',description:'HH:MM, optional'},endTime:{type:'STRING',description:'HH:MM, optional'},notes:{type:'STRING'}},required:['title','date']}},
  {name:'log_transaction',description:'Log a cashflow transaction (FORGE — Debit=income, Credit=expense).',
    parameters:{type:'OBJECT',properties:{type:{type:'STRING',description:"'Debit' or 'Credit'"},amount:{type:'NUMBER'},desc:{type:'STRING'},category:{type:'STRING'},account:{type:'STRING'}},required:['type','amount','desc']}},
  {name:'search_gmail',description:'Search Gmail and read matching messages — use for "check my email", "did X reply", "find the email about Y".',
    parameters:{type:'OBJECT',properties:{query:{type:'STRING',description:'Gmail search syntax, e.g. from:someone@x.com or subject:invoice'},maxResults:{type:'NUMBER'}},required:['query']}},
  {name:'list_calendar_events',description:'Read upcoming events directly from Google Calendar (not the internal JELIX OS calendar) — use for "what\'s on my Google Calendar", "check my real calendar".',
    parameters:{type:'OBJECT',properties:{maxResults:{type:'NUMBER'}},required:[]}},
  {name:'search_drive_files',description:'Search files in Google Drive — use for "find my file about X", "do I have a doc on Y".',
    parameters:{type:'OBJECT',properties:{query:{type:'STRING',description:'text to search for in file names/content'}},required:['query']}}
];
// ── Google Workspace: read ──────────────────────────────────────────────────
async function searchGoogleGmail(query,maxResults){
  const token=await ensureGoogleToken();
  if(!token)return{ok:false,error:'Google Workspace not connected'};
  try{
    const params=new URLSearchParams({q:query,maxResults:String(maxResults||5)});
    const listRes=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?'+params.toString(),{headers:{'Authorization':'Bearer '+token}});
    if(!listRes.ok)return{ok:false,error:'Gmail search failed '+listRes.status};
    const listData=await listRes.json();
    const ids=(listData.messages||[]).slice(0,maxResults||5).map(m=>m.id);
    const msgs=await Promise.all(ids.map(async id=>{
      const r=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,{headers:{'Authorization':'Bearer '+token}});
      if(!r.ok)return null;
      const d=await r.json();
      const h=(d.payload?.headers||[]).reduce((o,x)=>{o[x.name]=x.value;return o;},{});
      return{from:h.From,subject:h.Subject,date:h.Date,snippet:d.snippet};
    }));
    return{ok:true,messages:msgs.filter(Boolean)};
  }catch(e){return{ok:false,error:e.message};}
}
async function searchGoogleDrive(query){
  const token=await ensureGoogleToken();
  if(!token)return{ok:false,error:'Google Workspace not connected'};
  try{
    const params=new URLSearchParams({q:`name contains '${query.replace(/'/g,"\\'")}'`,pageSize:'8',fields:'files(id,name,mimeType,modifiedTime,webViewLink)'});
    const res=await fetch('https://www.googleapis.com/drive/v3/files?'+params.toString(),{headers:{'Authorization':'Bearer '+token}});
    if(!res.ok)return{ok:false,error:'Drive search failed '+res.status};
    const data=await res.json();
    return{ok:true,files:data.files||[]};
  }catch(e){return{ok:false,error:e.message};}
}
// ── Drive file picker — shared modal used from task/client forms and the
// notes block menu, wrapping the searchGoogleDrive() the AI assistant
// already used, instead of building a separate search path per caller.
let _drivePickerCallback=null,_drivePickerFiles=[],_drivePickerDebounce=null;
function openDrivePicker(onSelect){
  _drivePickerCallback=onSelect;
  const q=document.getElementById('drivePickerQuery');if(q)q.value='';
  document.getElementById('drivePickerResults').innerHTML='<div style="padding:16px;color:var(--text3);font-size:var(--text-xs)">Type to search your Drive...</div>';
  openModal('drivePickerModal');
  setTimeout(()=>q?.focus(),80);
}
function runDrivePickerSearch(q){
  clearTimeout(_drivePickerDebounce);
  const results=document.getElementById('drivePickerResults');
  if(!q||q.length<2){results.innerHTML='<div style="padding:16px;color:var(--text3);font-size:var(--text-xs)">Type to search your Drive...</div>';return;}
  _drivePickerDebounce=setTimeout(async()=>{
    results.innerHTML='<div style="padding:16px;color:var(--text3);font-size:var(--text-xs)">Searching...</div>';
    const r=await searchGoogleDrive(q);
    if(!r.ok){results.innerHTML='<div style="padding:16px;color:var(--red);font-size:var(--text-xs)">'+(r.error||'Search failed — connect Google Workspace in Settings first')+'</div>';return;}
    if(!r.files.length){results.innerHTML='<div style="padding:16px;color:var(--text3);font-size:var(--text-xs)">No files found</div>';return;}
    _drivePickerFiles=r.files;
    results.innerHTML=r.files.map((f,i)=>`<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;cursor:pointer" onmouseover="this.style.background='var(--navy3)'" onmouseout="this.style.background='transparent'" onclick="selectDriveFile(${i})"><i class="ti ti-file" style="color:#4285F4;font-size:16px;flex-shrink:0"></i><div style="min-width:0;flex:1"><div style="font-size:var(--text-sm);color:var(--text1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.name}</div></div></div>`).join('');
  },350);
}
function selectDriveFile(i){
  const f=_drivePickerFiles[i];
  if(f&&_drivePickerCallback)_drivePickerCallback(f);
  closeModal('drivePickerModal');
}

function jelixCreateInternalTask(f){
  const t={id:Date.now(),title:f.title||'Untitled Task',world:f.world||'LIFE',priority:f.priority||'Medium',status:'To Do',due:f.due||'',client:f.client||'',notes:'',platform:'',startDate:'',startTime:'',endTime:'',groupId:null,subitems:[],timelineS:'',timelineE:f.due||'',numValue:null,connBoard:null,connItemId:null};
  DB.tasks.unshift(t);SB.upsert('tasks',t,'tasks');
  addHistory('add','JELIX added task: '+t.title,{...t,_dbKey:'tasks'});
  reRenderAll();
  return{ok:true,taskId:t.id};
}
function jelixCreateInternalEvent(f){
  const e={id:Date.now(),title:f.title||'Event',date:f.date,time:f.time||'',endTime:f.endTime||'',type:'lif',loc:'',notes:f.notes||'',allDay:!f.time,overnight:false,reminder:false,remindMin:30,recur:'none'};
  DB.calEvents.push(e);SB.upsert('cal_events',e,'calEvents');
  addHistory('add','JELIX added event: '+e.title,{...e,_dbKey:'calEvents'});
  reRenderAll();
  return{ok:true,eventId:e.id};
}
function jelixLogTransaction(f){
  const t={id:Date.now(),type:f.type==='Debit'?'Debit':'Credit',date:localDateStr(new Date()),desc:f.desc||'Transaction',amount:parseFloat(f.amount)||0,account:f.account||'Cash',category:f.category||'General',catNotes:'',notes:''};
  DB.cashflow.unshift(t);SB.upsert('cashflow',t,'cashflow');
  addHistory('add','JELIX logged '+t.type+': ₱'+t.amount+' — '+t.desc,{...t,_dbKey:'cashflow'});
  renderLife();renderBrief();
  return{ok:true,txnId:t.id};
}
async function _runJelixTool(name,args){
  if(name==='send_email')return sendGoogleGmail(args.to,args.subject,args.body);
  if(name==='create_event')return createGoogleCalendarEvent(args.calendarId||'primary',args.title,args.startISO,args.endISO,args.notes||'');
  if(name==='write_drive_file')return writeGoogleDriveFile(args.fileName,args.content,args.mimeType||'text/plain');
  if(name==='create_task')return jelixCreateInternalTask(args);
  if(name==='create_internal_event')return jelixCreateInternalEvent(args);
  if(name==='log_transaction')return jelixLogTransaction(args);
  if(name==='search_gmail')return searchGoogleGmail(args.query,args.maxResults||5);
  if(name==='list_calendar_events')return fetchGoogleCalendarEvents(args.maxResults||10);
  if(name==='search_drive_files')return searchGoogleDrive(args.query);
  return{ok:false,error:'Unknown tool: '+name};
}
// Logs a completed action to Supabase for a visible history — fire-and-forget,
// never blocks the actual write above.
async function _logJelixAction(intent,payload,world,result){
  try{
    const uid=getAuthUserId();
    const taskRow={intent,payload,world:world||null,status:result.ok?'done':'failed'};
    if(uid)taskRow.user_id=uid;
    const inserted=await sbFetch('agent_tasks','POST',taskRow);
    const task=Array.isArray(inserted)?inserted[0]:inserted;
    if(task?.id){
      const logRow={task_id:task.id,result,executor:'jelix-browser'};
      if(uid)logRow.user_id=uid;
      await sbFetch('agent_log','POST',logRow);
    }
  }catch(e){/* history is best-effort — never block the real action on this */}
  if(document.getElementById('agentQueueList'))renderAgentQueue();
}
// Direct call for the future approved action workflow.
async function runJelixIntent(intent,payload,world){
  const result=await _runJelixTool(intent,payload);
  if(result.ok)showToast('✓ '+intent+' completed');
  else showToast('⚠ '+intent+' failed: '+result.error);
  _logJelixAction(intent,payload,world,result);
  return result;
}
function jelixSendEmail(to,subject,body,world){return runJelixIntent('send_email',{to,subject,body},world);}
function jelixCreateEvent(calendarId,title,startISO,endISO,notes,world){return runJelixIntent('create_event',{calendarId,title,startISO,endISO,notes},world);}
function jelixDriveWrite(fileName,content,mimeType,world){return runJelixIntent('write_drive_file',{fileName,content,mimeType},world);}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT — the only function the rest of the app (or the Settings
// input box) needs to call. ChatGPT currently provides read-only insight and
// analysis over the signed-in dashboard context; approved writes can be added
// later through a server-side action layer.
// ═══════════════════════════════════════════════════════════════════════════
async function askJelixAgent(userMessage,world){
  const result=await requestJobAI({message:userMessage,history:_getRecentChatHistory(8),world:world||'',purpose:'jelix_chat'});
  if(result.ok||result.status===401||result.text==='Sign in to use J.E.L.I.X.')return result;
  return{ok:true,text:_jelixLocalContinuityReply(userMessage,world),degraded:true,service_error:result.code};

}
function _jelixLocalContinuityReply(userMessage,world){
  const message=String(userMessage||'').toLowerCase();
  const context=gatherJelixContext();
  const worldId=String(world||'').toUpperCase();
  const worldMatches=item=>!worldId||String(item.world||'').toUpperCase()===worldId;
  const openTasks=(DB.tasks||[]).filter(item=>item.status!=='Done'&&worldMatches(item));
  const overdue=openTasks.filter(item=>item.due&&item.due<context.today).sort((a,b)=>String(a.due).localeCompare(String(b.due)));
  const nextTasks=openTasks.slice().sort((a,b)=>String(a.due||'9999-12-31').localeCompare(String(b.due||'9999-12-31'))).slice(0,3);
  const todayEvents=(DB.calEvents||[]).filter(item=>item.date===context.today).sort((a,b)=>String(a.time||'99:99').localeCompare(String(b.time||'99:99')));
  const upcoming=(DB.calEvents||[]).filter(item=>item.date>context.today).sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))).slice(0,3);
  const monthTransactions=(DB.cashflow||[]).filter(item=>String(item.date||'').startsWith(context.monthKey));
  const income=monthTransactions.filter(item=>item.type==='Debit').reduce((sum,item)=>sum+(Number(item.amount)||0),0);
  const expenses=monthTransactions.filter(item=>item.type==='Credit').reduce((sum,item)=>sum+(Number(item.amount)||0),0);
  const peso=value=>'₱'+Number(value||0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});
  const prefix='The secure AI service is temporarily unavailable, but I can still read the dashboard data already on this device.';
  if(/task|todo|priority|overdue|next action|what.*do/.test(message)){
    const taskList=nextTasks.length?nextTasks.map(item=>item.title+(item.due?' — '+item.due:'')).join('; '):'No open tasks are currently visible.';
    return `${prefix} You have ${openTasks.length} open task${openTasks.length===1?'':'s'}${overdue.length?`, including ${overdue.length} overdue`:''}. Next visible items: ${taskList}`;
  }
  if(/calendar|schedule|meeting|event|today|tomorrow/.test(message)){
    const todayList=todayEvents.length?todayEvents.map(item=>(item.time?item.time+' ':'')+item.title).join('; '):'No events are visible for today.';
    const nextList=upcoming.length?upcoming.map(item=>item.date+' — '+item.title).join('; '):'No later events are currently visible.';
    return `${prefix} Today: ${todayList} Upcoming: ${nextList}`;
  }
  if(/money|finance|expense|income|budget|cash|balance/.test(message)){
    return `${prefix} For ${context.monthKey}, visible income is ${peso(income)}, visible expenses are ${peso(expenses)}, and the current net is ${peso(income-expenses)}.`;
  }
  if(/status|brief|summary|overview|dashboard/.test(message)){
    return `${prefix} Current snapshot: ${openTasks.length} open task${openTasks.length===1?'':'s'}, ${overdue.length} overdue, ${todayEvents.length} event${todayEvents.length===1?'':'s'} today, and a visible monthly net of ${peso(income-expenses)}.`;
  }
  return `${prefix} I can still help with a local task, calendar, finance, or dashboard summary. For drafting, deeper analysis, or general questions, please try again shortly.`;
}
// Pulls the last N exchanges from the visible chat thread so follow-up
// messages ("yes", "break it down", "what about those") resolve against
// what was actually being discussed, instead of being classified in a vacuum.
function _getRecentChatHistory(maxTurns){
  const box=document.getElementById('aiMsgs');if(!box)return'';
  const rows=[...box.querySelectorAll('.mr-row')].filter(r=>r.id!=='thinkRow');
  const turns=rows.slice(-1*(maxTurns||6)).map(row=>{
    const isUser=row.classList.contains('mr-user');
    const bubble=row.querySelector('.mbubble');
    const text=(bubble?.innerText||bubble?.textContent||'').trim();
    return text?(isUser?'Justine: ':'JELIX: ')+text:null;
  }).filter(Boolean);
  return turns.join('\n');
}
// Dictation directly into the chat input — speak, see it appear, edit if
// needed, then send. Deliberately separate from toggleVoice()/the voice-bar
// command system: this doesn't auto-execute anything, it just fills the box.
let _chatDictationRecognition=null,_chatDictating=false;
function toggleChatDictation(){
  const input=document.getElementById('aiInput');if(!input)return;
  const btn=document.getElementById('aiDictateBtn');
  if(_chatDictating){
    if(_chatDictationRecognition)try{_chatDictationRecognition.stop();}catch(e){}
    return;
  }
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){showToast('Voice not supported. Use Chrome or Edge.');return;}
  const r=new SR();
  r.continuous=true;r.interimResults=true;r.lang='en-PH';r.maxAlternatives=1;
  let finalText=input.value?input.value.trim()+' ':'';
  r.onstart=()=>{_chatDictating=true;if(btn){btn.style.background='rgba(239,68,68,.2)';btn.style.color='var(--red)';const ic=btn.querySelector('i');if(ic)ic.className='ti ti-player-stop';}};
  r.onresult=(e)=>{
    let interim='';
    for(let i=e.resultIndex;i<e.results.length;i++){
      if(e.results[i].isFinal)finalText+=e.results[i][0].transcript+' ';
      else interim+=e.results[i][0].transcript;
    }
    input.value=(finalText+interim).trim();
    autoResize(input);
  };
  const reset=()=>{_chatDictating=false;if(btn){btn.style.background='var(--navy3)';btn.style.color='var(--text2)';const ic=btn.querySelector('i');if(ic)ic.className='ti ti-microphone';}};
  r.onend=reset;r.onerror=reset;
  _chatDictationRecognition=r;
  try{r.start();}catch(e){showToast('Could not start dictation.');}
}

async function submitJelixAgentPrompt(){
  const input=document.getElementById('agentPromptInput');if(!input)return;
  const msg=input.value.trim();if(!msg)return;
  const outEl=document.getElementById('agentPromptResult');
  if(outEl)outEl.textContent='JELIX is working on it...';
  input.value='';
  const res=await askJelixAgent(msg);
  if(outEl)outEl.textContent=res.text;
}
// Pulls the most recent queued/executed tasks straight from Supabase (not
// cached in DB) since this is an operational log, not app state.
async function renderAgentQueue(){
  const el=document.getElementById('agentQueueList');if(!el)return;
  el.textContent='Action execution is disabled while J.E.L.I.X is read-only.';
  return;
  try{
    const tasks=await sbFetch('agent_tasks','GET',null,'limit=8');
    if(!tasks||!tasks.length){el.innerHTML='<div style="padding:6px 0">No agent actions yet.</div>';return;}
    const statusColor=s=>s==='done'?'var(--green)':s==='failed'?'var(--red)':s==='executing'?'var(--amber)':'var(--text3)';
    el.innerHTML=tasks.map(t=>`
      <div style="display:flex;align-items:center;gap:10px;padding:7px 10px;background:var(--navy3);border:1px solid var(--border);border-left:3px solid ${statusColor(t.status)};border-radius:10px;margin-bottom:6px">
        <div style="flex:1;min-width:0">
          <div style="font-size:var(--text-sm);font-weight:700;color:var(--text1)">${t.intent}${t.world?' · '+t.world:''}</div>
          <div style="font-size:9px;color:var(--text4);margin-top:1px">${new Date(t.created_at).toLocaleString('en-PH')}</div>
        </div>
        <span style="font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:${statusColor(t.status)}">${t.status}</span>
      </div>`).join('');
  }catch(err){
    el.innerHTML='<div style="padding:6px 0;color:var(--text4)">Agent history unavailable — check Supabase connection.</div>';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// J.O.B. REALTIME — Cross-Device Sync Engine
// WebSocket listener: pushes Supabase INSERT/UPDATE/DELETE to all open tabs
// ═══════════════════════════════════════════════════════════════════════════
let realtimeSocket=null;
const REALTIME_TABLES=[
  {name:'tasks',      key:'tasks'},
  {name:'clients',    key:'clients'},
  {name:'cashflow',   key:'cashflow'},
  {name:'cal_events', key:'calEvents'},
  {name:'journal',    key:'journal'},
  {name:'notes',      key:'notes'},
  {name:'venture',    key:'venture'},
  {name:'faith',      key:'faith'},
  {name:'sides',      key:'sides'},
  {name:'memories',   key:'memories'},
  {name:'history',    key:'history'},
  {name:'loans',      key:'loans'},
  {name:'accounts',   key:'accounts'},
  {name:'collateral', key:'collateral'},
  {name:'social_posts',      key:'socialPosts'},
  {name:'creative_projects', key:'creativeProjects'},
  {name:'pipeline',          key:'pipeline'},
  {name:'campaigns',         key:'campaigns'},
  {name:'influencers',       key:'influencers'},
  {name:'pricing',           key:'pricing'},
  {name:'credentials',       key:'credentials'},
  {name:'agent_tasks',       key:'agentTasks'},
  {name:'agent_log',         key:'agentLog'},
  {name:'sync_tombstones',   key:null}
];

function initRealtime(){
  if(realtimeSocket&&realtimeSocket.readyState<2)return; // already open or connecting
  realtimeSocket=new WebSocket(
    `wss://ddxkmidantqgnxfxsrrz.supabase.co/realtime/v1/websocket?apikey=${SB_KEY}&vsn=1.0.0`
  );
  realtimeSocket.onopen=function(){
    REALTIME_TABLES.forEach(function(t){
      realtimeSocket.send(JSON.stringify({
        topic:`realtime:public:${t.name}`,
        event:'phx_join',
        payload:{},
        ref:t.name
      }));
    });
    showToast('⚡ Realtime sync active');
  };
  realtimeSocket.onmessage=function(ev){
    var msg;try{msg=JSON.parse(ev.data);}catch(e){return;}
    if(msg.event!=='INSERT'&&msg.event!=='UPDATE'&&msg.event!=='DELETE')return;
    var tableName=msg.topic.replace('realtime:public:','');
    var tableMap=REALTIME_TABLES.find(function(t){return t.name===tableName;});
    if(!tableMap)return;
    var record=msg.payload.record;
    var oldRecord=msg.payload.old_record;
    var type=msg.payload.type;
    var key=tableMap.key;
    if(tableName==='sync_tombstones'){
      var tombstoneRecord=record||oldRecord;
      if(!tombstoneRecord)return;
      var sourceRecord=recordFromCloudSyncTombstone(tombstoneRecord);
      if((type==='INSERT'||type==='UPDATE')&&tombstoneRecord.active!==false){
        rememberSyncDeletion(tombstoneRecord.entity_type,sourceRecord,false);
        removeSyncDeletedRecordLocally(tombstoneRecord.entity_type,sourceRecord);Store.notify();
      }else clearSyncTombstone(tombstoneRecord.entity_type,sourceRecord,false);
      return;
    }
    if((tableName==='tasks'||tableName==='cal_events')&&(type==='INSERT'||type==='UPDATE')&&isSyncTombstoned(tableName,record)){
      if(record&&record.id!=null)sbFetch(tableName,'DELETE',null,`id=eq.${record.id}`).catch(()=>{});
      return;
    }
    if(tableName==='agent_tasks'||tableName==='agent_log'){
      // Operational log, not app state — don't push into DB[], just refresh the panel
      if(tableName==='agent_tasks'&&type==='UPDATE'&&record&&record.status){
        if(record.status==='done')showToast('✓ JELIX Executor finished: '+record.intent);
        else if(record.status==='failed')showToast('⚠ JELIX Executor failed: '+record.intent);
      }
      if(document.getElementById('agentQueueList'))renderAgentQueue();
      return;
    }
    if(!DB[key])DB[key]=[];
    if(type==='INSERT'){
      if(!DB[key].find(function(r){return r.id===record.id;})){
        if(tableName==='cashflow')record.desc=record.description||record.desc||'';
        DB[key].unshift(record);
        save(key);
        Store.notify(); // only repaint active view
        showToast('\u21BB '+tableName+' synced from another device');
      }
    }else if(type==='UPDATE'){
      var idx=DB[key].findIndex(function(r){return r.id===record.id;});
      if(idx>-1){
        if(tableName==='cashflow')record.desc=record.description||record.desc||'';
        DB[key][idx]=record;
        save(key);
        Store.notify(); // only repaint active view
      }
    }else if(type==='DELETE'&&oldRecord){
      DB[key]=DB[key].filter(function(r){return r.id!==oldRecord.id;});
      save(key);
      Store.notify(); // only repaint active view
    }
  };
  realtimeSocket.onclose=function(){
    realtimeSocket=null;
    if(_osLoaded)setTimeout(initRealtime,5000); // auto-reconnect
  };
  realtimeSocket.onerror=function(err){
    console.warn('[J.O.B Systems] Realtime offline — using localStorage only');
  };
}

async function loadAllFromSupabase(){
  showToast('↻ Syncing with Supabase...');
  await loadCloudSyncTombstones();
  await Promise.all([SB.load('tasks','tasks'),SB.load('clients','clients'),SB.load('venture','venture'),SB.load('faith','faith'),SB.load('cashflow','cashflow'),SB.load('cal_events','calEvents'),SB.load('journal','journal'),SB.load('notes','notes'),SB.load('memories','memories'),SB.load('sides','sides'),SB.load('history','history'),SB.load('loans','loans'),SB.load('accounts','accounts'),SB.load('collateral','collateral'),SB.load('social_posts','socialPosts'),SB.load('creative_projects','creativeProjects'),SB.load('pipeline','pipeline'),SB.load('campaigns','campaigns'),SB.load('influencers','influencers'),SB.load('pricing','pricing'),SB.load('credentials','credentials'),SB.load('saved_links','savedLinks'),SB.load('item_links','itemLinks'),SB.load('projects','projects'),_pullWorldsFromCloud()]);
  reRenderAll();if(typeof renderTagsDatalist==='function')renderTagsDatalist();if(typeof updateInboxBadge==='function')updateInboxBadge();showToast('✓ Supabase synced');speak('All systems synced.');
}
// ═══════════════════════════════════════════════════════════════════════════
// STORE — Centralized render bus
// Store.notify(view?) triggers DOM repaints only for the active view
// ═══════════════════════════════════════════════════════════════════════════
const Store={
  _renderMap:{
    dashboard:()=>{try{renderBrief();}catch(e){}},
    'work-ih':()=>{try{renderWorkIH();}catch(e){}},
    'work-cs':()=>{try{renderWorkCS();if(csActiveView==='marketing')renderMktgActive();}catch(e){}},
    venture:()=>{try{renderVenture();}catch(e){}},
    build:()=>{try{renderBuild();renderBuildTasks();renderPipeline();}catch(e){}},
    sides:()=>{try{renderSides();renderCollateral();renderCreativeProjects();renderSocialWorkflow();}catch(e){}},
    faith:()=>{try{renderFaith();}catch(e){}},
    life:()=>{try{renderLife();}catch(e){}},
    calendar:()=>{try{renderCalendar();}catch(e){}},
    tasks:()=>{try{renderTasks();}catch(e){}},
    notes:()=>{try{renderNotesList();}catch(e){}},
    links:()=>{try{renderLinksView();}catch(e){}},
    inbox:()=>{try{if(typeof renderInboxView==='function')renderInboxView();}catch(e){}},
    memory:()=>{try{renderMemory();}catch(e){}},
    history:()=>{try{renderHistory();}catch(e){}},
    review:()=>{try{renderReviewView();}catch(e){}},
    ai:()=>{try{renderAiHero();}catch(e){}},
    'worlds-settings':()=>{try{renderWorldsSettings();}catch(e){}},
    settings:()=>{try{renderSettingsView();}catch(e){}},
  },
  // notify(view) — re-render specific view; if omitted, re-render only active view
  notify(view){
    const target=view||currentView;
    const fn=this._renderMap[target];
    if(fn)requestAnimationFrame(fn);
    else if((DB.worlds||[]).some(w=>w.id===target)){
      // Custom domain — has no entry in the static render map above, since
      // there's one of these per domain the user creates. Its content
      // (tasks, kanban, calendar, pipeline, notes) is all rendered by the
      // one generic function instead.
      requestAnimationFrame(()=>{try{renderDomainGenericView(target);}catch(e){}});
    }
    // Always keep brief sidebar counters in sync
    try{renderBrief();}catch(e){}
  },
  // notifyAll — full sync (use sparingly, only on boot/data import)
  notifyAll(){
    Object.values(this._renderMap).forEach(fn=>{try{fn();}catch(e){}});
    if(currentView&&!this._renderMap[currentView]&&(DB.worlds||[]).some(w=>w.id===currentView)){
      try{renderDomainGenericView(currentView);}catch(e){}
    }
  }
};

// Replace reRenderAll with Store-based targeted repaint
function reRenderAll(){Store.notifyAll();}

// ── Dynamic sidebar world nav ─────────────────────────────────────────────
function _miniProgressRing(pct,color){
  const r=7,c=2*Math.PI*r;
  const offset=c-(pct/100)*c;
  return `<svg width="18" height="18" viewBox="0 0 18 18" style="flex-shrink:0;transform:rotate(-90deg)">
    <circle cx="9" cy="9" r="${r}" fill="none" stroke="var(--border2)" stroke-width="2"/>
    <circle cx="9" cy="9" r="${r}" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="${c}" stroke-dashoffset="${offset}" stroke-linecap="round"/>
  </svg>`;
}
function focusCaptureFromNav(){
  setView('dashboard');
  setTimeout(()=>{
    const input=document.getElementById('captureInput');
    if(input){input.focus();input.scrollIntoView({block:'center',behavior:'smooth'});}
  },80);
}
function toggleDesktopMore(trigger){
  const group=trigger?.closest('.nav-more-group');
  if(!group)return;
  const open=group.classList.toggle('open');
  trigger.setAttribute('aria-expanded',String(open));
}
function openHelpAssistant(){
  setView('ai');
  setTimeout(()=>{if(typeof qp==='function')qp('Help me use JOBSystems effectively today');},100);
}
const DEFAULT_WORKSPACE_LOGOS={
  venture:'assets/workspace-logos/job-collectives.png',
  build:'assets/workspace-logos/code-collectives.png',
  sides:'assets/workspace-logos/creative-collectives.png',
  faith:'assets/workspace-logos/faith.png',
  life:'assets/workspace-logos/personal.png'
};
function workspaceLogoFor(world){
  return world?.logo||DEFAULT_WORKSPACE_LOGOS[world?.id]||'';
}
function renderSideNav(){
  updateInboxBadge();
  const container=document.getElementById('navWorldsList');
  if(!container)return;
  container.innerHTML=(DB.worlds||[]).map(function(w){
    const colorVal=(w.color&&/^#/.test(w.color))?w.color:('var('+(w.cssVar||'--w-ideahub')+')');
    const worldTasks=(DB.tasks||[]).filter(t=>t.world===w.id.toUpperCase());
    const doneCount=worldTasks.filter(t=>t.status==='Done').length;
    const openCount=worldTasks.length-doneCount;
    const pct=worldTasks.length?Math.round((doneCount/worldTasks.length)*100):0;
    const logoSrc=workspaceLogoFor(w);
    return '<div class="ni world-ni" draggable="true" data-view="'+w.id+'" data-world-id="'+w.id+'" title="'+w.label+'" style="cursor:pointer;position:relative;--ni-color:'+colorVal+'"'
      +' ondragstart="_navDragId=\''+w.id+'\';event.currentTarget.style.opacity=\'.4\'"'
      +' ondragend="event.currentTarget.style.opacity=\'1\'"'
      +' ondragover="event.preventDefault();event.currentTarget.style.background=\'var(--teal4)\'"'
      +' ondragleave="event.currentTarget.style.background=\'\'"'
      +' ondrop="event.preventDefault();event.currentTarget.style.background=\'\';reorderWorldNav(\''+w.id+'\')"'
      +'>'
      +(logoSrc?'<img class="workspace-nav-logo" src="'+escapeHtml(logoSrc)+'" alt="" aria-hidden="true">':'<i class="ti '+(w.icon||'ti-star')+'" style="color:'+colorVal+'"></i>')
      +'<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+w.label+'</span>'
      +'</div>';
  }).join('');
  // Attach click handlers safely (no inline quotes)
  container.querySelectorAll('[data-world-id]').forEach(function(el){
    el.addEventListener('click',function(e){
      setView(el.dataset.worldId);
    });
  });
  document.querySelectorAll('[data-view]').forEach(function(el){
    el.classList.toggle('active',el.dataset.view===currentView);
  });
  const moreViews=['tasks','inbox','notes','links','all-files','memory','history','jarvis-capture','jarvis-connect','jarvis-weekly','jarvis-context','jarvis-pattern','jarvis-decision','jarvis-claude'];
  const moreGroup=document.querySelector('.nav-more-group');
  const moreToggle=moreGroup?.querySelector('.nav-more-toggle');
  if(moreGroup){moreGroup.classList.toggle('open',moreViews.includes(currentView));if(moreToggle)moreToggle.setAttribute('aria-expanded',String(moreViews.includes(currentView)));}
  renderUrgentPanel();
  applyCollapsedNavStyling();
}
// Reapplies collapsed-rail spacing to every nav row — called after any nav rebuild
// (renderSideNav runs on every view change and rebuilds this HTML from scratch, which
// would otherwise silently drop collapsed-state styling applied only at toggle time).
function applyCollapsedNavStyling(){
  const app=document.querySelector('.app');
  const toggle=document.getElementById('desktopNavToggle');
  if(!app||!toggle)return;
  const collapsed=app.classList.contains('nav-collapsed');
  toggle.setAttribute('aria-expanded',String(!collapsed));
  toggle.setAttribute('aria-label',collapsed?'Expand navigation':'Collapse navigation');
  toggle.setAttribute('title',collapsed?'Expand navigation':'Collapse navigation');
  const icon=toggle.querySelector('i');
  if(icon)icon.className=collapsed?'ti ti-layout-sidebar-left-expand':'ti ti-layout-sidebar-left-collapse';
}

// ── Urgent notifications strip (bottom of desktop nav) ──────────────────
let urgentPopoverOpen=false;
function getUrgentItems(){
  const today=localDateStr(new Date());
  const priorityRank={High:0,Medium:1,Low:2};
  return (DB.tasks||[])
    .filter(t=>t.status!=='Done')
    .map(t=>({...t,_isOverdue:!!(t.due&&t.due<today)}))
    .filter(t=>t._isOverdue||t.priority==='High')
    .sort((a,b)=>{
      // Overdue always ranks above everything else, sorted by how overdue (oldest due date first)
      if(a._isOverdue!==b._isOverdue)return a._isOverdue?-1:1;
      if(a._isOverdue&&b._isOverdue)return (a.due||'9999')<(b.due||'9999')?-1:1;
      // Then by priority tier: High → Medium → Low
      const pa=priorityRank[a.priority]??3,pb=priorityRank[b.priority]??3;
      if(pa!==pb)return pa-pb;
      // Within the same tier, soonest due date first
      return (a.due||'9999')<(b.due||'9999')?-1:1;
    })
    .slice(0,8);
}
function renderUrgentPanel(){
  const el=document.getElementById('urgentPanel');
  const items=getUrgentItems();
  const badge=document.getElementById('topNotifBadge');
  if(badge)badge.style.display=items.length?'block':'none';
  const mobileBadge=document.getElementById('mobileNotifBadge');
  if(mobileBadge)mobileBadge.style.display=items.length?'block':'none';
  const summary=document.getElementById('topNotifSummary');
  if(summary){
    const overdueCount=items.filter(t=>t._isOverdue).length;
    if(!items.length){summary.textContent='All clear';summary.style.color='var(--text2)';}
    else{summary.textContent=items.length+' Urgent'+(overdueCount?' · '+overdueCount+' overdue':'');summary.style.color=overdueCount?'var(--red)':'var(--amber)';}
  }
  if(!el)return;
  const today=localDateStr(new Date());
  if(!items.length){
    el.innerHTML='<div class="urgent-strip none"><i class="ti ti-circle-check" style="font-size:var(--text-xs)"></i><span>All clear</span></div>';
    return;
  }
  const overdueCount=items.filter(t=>t.due&&t.due<today).length;
  el.style.position='relative';
  el.innerHTML=`
    <div class="urgent-strip" onclick="toggleUrgentPopover()">
      <i class="ti ti-alert-triangle" style="font-size:var(--text-xs)"></i>
      <span style="flex:1">${items.length} Urgent${overdueCount?' · '+overdueCount+' overdue':''}</span>
      <i class="ti ti-chevron-up" style="font-size:11px;transition:transform .15s;transform:rotate(${urgentPopoverOpen?'180deg':'0deg'})"></i>
    </div>
    ${urgentPopoverOpen?`<div class="urgent-popover">
      ${items.map(t=>{
        const isOverdue=t.due&&t.due<today;
        return `<div class="urgent-item" onclick="urgentPopoverOpen=false;editTask(${t.id})">
          <i class="ti ${isOverdue?'ti-clock-exclamation':'ti-flag'}" style="font-size:12px;color:${isOverdue?'var(--red)':'var(--amber)'};flex-shrink:0;margin-top:1px"></i>
          <div style="flex:1;min-width:0">
            <div style="font-size:var(--text-xs);color:var(--text1);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.title}</div>
            <div style="font-size:9px;color:${isOverdue?'var(--red)':'var(--text3)'}">${t.due?(isOverdue?'Overdue · ':'')+t.due:'No due date'}${t.world?' · '+t.world:''}</div>
          </div>
        </div>`;
      }).join('')}
    </div>`:''}
  `;
}
// ── Mobile quick-add (Task/Event) FAB ────────────────────────────────────
let mobileQuickAddOpen=false;
function getQuickAddWorld(){
  const active=currentView&&currentView!=='dashboard'&&currentView!=='tasks'&&currentView!=='calendar'&&currentView!=='life'&&currentView!=='settings'&&currentView!=='worlds-settings' ? currentView : '';
  return active&&(DB.worlds||[]).some(w=>w.id===active)?active:'LIFE';
}
function toggleMobileQuickAdd(){
  mobileQuickAddOpen=!mobileQuickAddOpen;
  const sheet=document.getElementById('mobileQuickAddSheet');
  const icon=document.getElementById('mbnAddIcon');
  if(sheet)sheet.style.display=mobileQuickAddOpen?'block':'none';
  if(icon)icon.style.transform=mobileQuickAddOpen?'rotate(45deg)':'rotate(0deg)';
  if(mobileQuickAddOpen){
    setTimeout(()=>{
      document.addEventListener('click',function closeQA(e){
        if(!e.target.closest('#mobileQuickAddSheet')&&!e.target.closest('#mbnAddBtn')){
          closeMobileQuickAdd();
          document.removeEventListener('click',closeQA);
        }
      });
    },10);
  }
}
function closeMobileQuickAdd(){
  mobileQuickAddOpen=false;
  const sheet=document.getElementById('mobileQuickAddSheet');
  const icon=document.getElementById('mbnAddIcon');
  if(sheet)sheet.style.display='none';
  if(icon)icon.style.transform='rotate(0deg)';
}
function toggleUrgentPopover(){
  urgentPopoverOpen=!urgentPopoverOpen;
  renderUrgentPanel();
  if(urgentPopoverOpen){
    setTimeout(()=>{
      document.addEventListener('click',function closeUrgent(e){
        if(!e.target.closest('#urgentPanel')){
          urgentPopoverOpen=false;renderUrgentPanel();
          document.removeEventListener('click',closeUrgent);
        }
      });
    },10);
  }
}
// ── Curated professional icon set for domains/modules — Tabler Icons only,
// deliberately no emoji. Covers work, finance, creative, ops, and general use.
const JELIX_ICON_SET=[
  'ti-star','ti-briefcase','ti-rocket','ti-code','ti-palette','ti-heart-handshake','ti-leaf',
  'ti-building','ti-building-store','ti-chart-bar','ti-chart-line','ti-target','ti-flag',
  'ti-folder','ti-file-text','ti-users','ti-user','ti-calendar','ti-clock-hour-4','ti-bell',
  'ti-bookmark','ti-tag','ti-shield','ti-lock','ti-key','ti-home','ti-map-pin','ti-phone',
  'ti-mail','ti-message','ti-camera','ti-video','ti-music','ti-book','ti-school','ti-tool',
  'ti-settings','ti-database','ti-server','ti-cloud','ti-coffee','ti-truck','ti-shopping-cart',
  'ti-credit-card','ti-cash','ti-receipt','ti-scale','ti-gavel','ti-stethoscope','ti-plane',
  'ti-world','ti-language','ti-microphone','ti-broadcast','ti-device-laptop','ti-device-mobile',
  'ti-wallet','ti-chart-pie','ti-list-check','ti-layout-kanban','ti-git-branch','ti-brain',
  'ti-bulb','ti-award','ti-trophy','ti-flame','ti-droplet','ti-sun','ti-moon','ti-plant'
];
let pendingWorldLogo='';
function _updateWmIconPreview(){
  const val=document.getElementById('wm-icon')?.value.trim()||'ti-star';
  const prev=document.getElementById('wm-icon-preview');
  if(!prev)return;
  prev.innerHTML=pendingWorldLogo
    ?`<img src="${escapeHtml(pendingWorldLogo)}" alt="Workspace logo preview" style="width:100%;height:100%;object-fit:cover;border-radius:9px">`
    :`<i class="ti ${val}" style="color:var(--teal);font-size:var(--text-md)"></i>`;
}
function handleWorldLogoUpload(input){
  const file=input?.files?.[0];
  if(!file)return;
  if(!file.type.startsWith('image/')){showToast('Choose an image file.');input.value='';return;}
  if(file.size>5*1024*1024){showToast('Choose an image smaller than 5 MB.');input.value='';return;}
  const reader=new FileReader();
  reader.onload=event=>{
    const image=new Image();
    image.onload=()=>{
      const size=128;
      const canvas=document.createElement('canvas');
      canvas.width=size;canvas.height=size;
      const context=canvas.getContext('2d');
      context.clearRect(0,0,size,size);
      const scale=Math.max(size/image.width,size/image.height);
      const width=image.width*scale,height=image.height*scale;
      context.drawImage(image,(size-width)/2,(size-height)/2,width,height);
      pendingWorldLogo=canvas.toDataURL('image/png');
      _updateWmIconPreview();
    };
    image.onerror=()=>showToast('That image could not be used.');
    image.src=String(event.target?.result||'');
  };
  reader.readAsDataURL(file);
}
function clearWorldLogo(){
  pendingWorldLogo='';
  const input=document.getElementById('wm-logo-file');if(input)input.value='';
  _updateWmIconPreview();
}
function _renderWmIconGrid(){
  const grid=document.getElementById('wm-icon-grid');if(!grid)return;
  grid.innerHTML=JELIX_ICON_SET.map(ic=>`<div onclick="document.getElementById('wm-icon').value='${ic}';_updateWmIconPreview()" title="${ic}" style="width:100%;aspect-ratio:1;border-radius:8px;background:var(--navy2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:border-color .1s" onmouseover="this.style.borderColor='var(--teal2)'" onmouseout="this.style.borderColor='var(--border)'"><i class="ti ${ic}" style="color:var(--text2);font-size:var(--text-md)"></i></div>`).join('');
}
let _navDragId=null;
function reorderWorldNav(targetId){
  if(!_navDragId||_navDragId===targetId)return;
  const worlds=DB.worlds||[];
  const dragIdx=worlds.findIndex(w=>w.id===_navDragId);
  const targetIdx=worlds.findIndex(w=>w.id===targetId);
  if(dragIdx<0||targetIdx<0)return;
  const [moved]=worlds.splice(dragIdx,1);
  worlds.splice(worlds.indexOf(worlds.find(w=>w.id===targetId)),0,moved);
  DB.worlds=worlds;
  save('worlds');
  _navDragId=null;
  renderSideNav();
}
// ── Generic drag-reorder for static nav sections (Intelligence, etc.) ──────
// These items aren't backed by a JS array like Domains — this persists the
// order as a list of data-view values and re-arranges the real DOM nodes to
// match, on every boot and after every drop.
function makeNavSectionSortable(containerId,storageKey){
  const container=document.getElementById(containerId);if(!container)return;
  const items=[...container.children];
  items.forEach(el=>{
    if(el.dataset.sortableBound)return;
    el.dataset.sortableBound='1';
    el.setAttribute('draggable','true');
    el.addEventListener('dragstart',()=>{_navDragId=el.dataset.view;el.style.opacity='.4';});
    el.addEventListener('dragend',()=>{el.style.opacity='1';});
    el.addEventListener('dragover',(e)=>{e.preventDefault();el.style.background='var(--teal4)';});
    el.addEventListener('dragleave',()=>{el.style.background='';});
    el.addEventListener('drop',(e)=>{
      e.preventDefault();el.style.background='';
      if(!_navDragId||_navDragId===el.dataset.view)return;
      const dragEl=container.querySelector('[data-view="'+_navDragId+'"]');
      if(!dragEl)return;
      container.insertBefore(dragEl,el);
      const order=[...container.children].map(c=>c.dataset.view);
      localStorage.setItem(storageKey,JSON.stringify(order));
      _navDragId=null;
    });
  });
  try{
    const saved=JSON.parse(localStorage.getItem(storageKey)||'null');
    if(Array.isArray(saved)){
      saved.forEach(view=>{
        const el=container.querySelector('[data-view="'+view+'"]');
        if(el)container.appendChild(el);
      });
    }
  }catch(e){}
}
// ═══════════════════════════════════════════════════════════════════════════
// GENERIC DOMAIN VIEW — what a custom domain (Add Domain) actually renders.
// Modules (tasks/kanban/calendar/notes) are toggleable per-domain and stored
// on the world object itself (DB.worlds[i].modules), local-only like the
// rest of the Domains config.
// ═══════════════════════════════════════════════════════════════════════════
const DOMAIN_MODULE_ALL_IDS=['timer','tasks','kanban','calendar','pipeline','database','link','habits','goals','scratchpad','contacts','countdown','notes','budget','metrics','gallery','routine','webpage','activity'];
const DOMAIN_MODULE_DEFAULTS=['timer','tasks','kanban','calendar','notes'];
const DOMAIN_MODULE_LABELS={
  contacts:{label:'Contacts',icon:'ti-address-book',desc:'People tied to this domain — tap to call or email'},
  countdown:{label:'Countdown',icon:'ti-hourglass',desc:'Days remaining to a date that matters'},
  habits:{label:'Habit Tracker',icon:'ti-repeat',desc:'Daily checkboxes with a running streak count'},
  goals:{label:'Goals',icon:'ti-target-arrow',desc:'Progress bars toward a target — not a task, a milestone'},
  scratchpad:{label:'Scratchpad',icon:'ti-note',desc:'A single freeform text box for quick notes, no blocks or pages'},
  link:{label:'Links',icon:'ti-link',desc:'A curated list of links, opens in a new tab'},
  database:{label:'Database — Table View',icon:'ti-database',desc:'A typed table: text, number, select, date, checkbox columns'},
  timer:{label:'Time Allocation',icon:'ti-clock-hour-4',desc:'Daily hours budget with a start/pause timer'},
  tasks:{label:'Task List',icon:'ti-list-check',desc:'A simple task list scoped to this domain'},
  kanban:{label:'Kanban Board',icon:'ti-layout-kanban',desc:'Todo / In Progress / No Progress / Done'},
  calendar:{label:'Calendar',icon:'ti-calendar',desc:'Upcoming events tagged to this domain'},
  pipeline:{label:'Pipeline',icon:'ti-git-branch',desc:'Lead → Contacted → Proposal → Won stage board'},
  notes:{label:'Notes',icon:'ti-notes',desc:'Notes filed under this domain'},
  budget:{label:'Budget',icon:'ti-wallet',desc:'A domain-scoped income/expense ledger with a running balance'},
  metrics:{label:'Metrics',icon:'ti-chart-bar',desc:'Custom-labeled number tiles you name and update yourself'},
  gallery:{label:'Gallery',icon:'ti-photo',desc:'A grid of Google Drive files attached to this domain'},
  routine:{label:'Daily Routine',icon:'ti-list-check',desc:'A checklist that resets every day — not a streak, a routine'},
  webpage:{label:'Embedded Page',icon:'ti-browser',desc:'Pin an external tool (Sheet, Figma, Notion) via its embed URL'},
  activity:{label:'Activity',icon:'ti-activity',desc:'A live feed of changes made within this domain'}
};
function domainModulesFor(worldId){
  const w=(DB.worlds||[]).find(x=>x.id===worldId);
  return (w&&Array.isArray(w.modules))?w.modules:DOMAIN_MODULE_DEFAULTS.slice();
}
// Order is tracked separately from visibility — dragging to reorder works
// on all module types (even ones currently off), so turning one on later
// keeps whatever position you last dragged it to.
function domainModuleOrderFor(worldId){
  const w=(DB.worlds||[]).find(x=>x.id===worldId);
  const stored=(w&&Array.isArray(w.moduleOrder))?w.moduleOrder.slice():[];
  const merged=stored.filter(id=>DOMAIN_MODULE_ALL_IDS.includes(id));
  DOMAIN_MODULE_ALL_IDS.forEach(id=>{if(!merged.includes(id))merged.push(id);});
  return merged;
}

// ── Per-module renderers — each returns an HTML string for one card ────────
// ── Task status color coding — single source of truth ───────────────────
// Every view (kanban, table, domain modules, client cards, Venture/Build
// boards...) used to define its own local copy of "status -> color".
// They'd drifted apart: some mapped No Progress to amber, one mapped it
// to red; the shared .pt/.pam/.pgr pill classes all alias to the exact
// same warning color, so 3 of the 4 statuses were visually identical
// pretty much everywhere. This is the one place that decides the
// mapping now — a real red-to-green spread across all 4 states.
function taskStatusPillClass(status){
  return status==='Done'?'pts-done':status==='In Progress'?'pts-progress':status==='No Progress'?'pts-noprogress':'pts-todo';
}
function taskStatusColor(status){
  // Explicit traffic-light spread: No Progress=red, Todo=orange,
  // In Progress=yellow, Done=green. In Progress needed a real yellow
  // (--yellow-text) rather than --info-text, which is the exact same
  // hex as --teal (#C9E85C, a yellow-GREEN) -- too close to Todo's
  // orange to tell apart at pill/dot size.
  return status==='Done'?'var(--success-text)':status==='In Progress'?'var(--yellow-text)':status==='No Progress'?'var(--danger-text)':'var(--warning-text)';
}
const DOMAIN_MODULE_RENDERERS={
  contacts:(worldId,colorVal)=>{
    const w=(DB.worlds||[]).find(x=>x.id===worldId);
    const contacts=(w&&w.contacts)||[];
    return`<div class="hc">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-shrink:0">
        <span style="font-size:var(--text-xs);font-weight:700;color:${colorVal};letter-spacing:.08em;text-transform:uppercase"><i class="ti ti-address-book"></i> Contacts</span>
        <button class="btn btn-t" style="font-size:var(--text-xs)" onclick="_addDomainContact('${worldId}')"><i class="ti ti-plus"></i> Add Contact</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;flex:1;min-height:0;overflow-y:auto">
        ${contacts.length?contacts.map(p=>`<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--navy3);border:1px solid var(--border);border-radius:10px">
          <div style="width:30px;height:30px;border-radius:50%;background:${colorVal}22;color:${colorVal};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:var(--text-xs);flex-shrink:0">${(p.name||'?')[0].toUpperCase()}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:var(--text-sm);color:var(--text1);font-weight:600">${p.name}</div>
            <div style="font-size:9px;color:var(--text3)">${p.role||''}</div>
          </div>
          ${p.email?`<a href="mailto:${p.email}" onclick="event.stopPropagation()" style="color:var(--text3);flex-shrink:0"><i class="ti ti-mail" style="font-size:14px"></i></a>`:''}
          ${p.phone?`<a href="tel:${p.phone}" onclick="event.stopPropagation()" style="color:var(--text3);flex-shrink:0"><i class="ti ti-phone" style="font-size:14px"></i></a>`:''}
          <button onclick="_removeDomainContact('${worldId}','${p.id}')" style="background:transparent;border:none;color:var(--text3);cursor:pointer;flex-shrink:0"><i class="ti ti-x" style="font-size:11px"></i></button>
        </div>`).join(''):'<div style="font-size:var(--text-xs);color:var(--text3);text-align:center;padding:12px">No contacts yet.</div>'}
      </div>
    </div>`;
  },
  countdown:(worldId,colorVal)=>{
    const w=(DB.worlds||[]).find(x=>x.id===worldId);
    const countdowns=(w&&w.countdowns)||[];
    const today=new Date();today.setHours(0,0,0,0);
    return`<div class="hc">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-shrink:0">
        <span style="font-size:var(--text-xs);font-weight:700;color:${colorVal};letter-spacing:.08em;text-transform:uppercase"><i class="ti ti-hourglass"></i> Countdown</span>
        <button class="btn btn-t" style="font-size:var(--text-xs)" onclick="_addDomainCountdown('${worldId}')"><i class="ti ti-plus"></i> Add</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;flex:1;min-height:0;overflow-y:auto">
        ${countdowns.length?countdowns.map(cd=>{
          const target=new Date(cd.date+'T00:00:00');
          const days=Math.round((target-today)/86400000);
          const label=days<0?Math.abs(days)+'d ago':days===0?'Today':days+'d left';
          return`<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 10px;background:var(--navy3);border:1px solid var(--border);border-radius:10px">
            <div>
              <div style="font-size:var(--text-sm);color:var(--text1);font-weight:600">${cd.name}</div>
              <div style="font-size:9px;color:var(--text3)">${cd.date}</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:var(--text-md);font-weight:800;color:${days<0?'var(--text3)':days===0?'var(--amber)':colorVal}">${label}</span>
              <button onclick="_removeDomainCountdown('${worldId}','${cd.id}')" style="background:transparent;border:none;color:var(--text3);cursor:pointer"><i class="ti ti-x" style="font-size:11px"></i></button>
            </div>
          </div>`;
        }).join(''):'<div style="font-size:var(--text-xs);color:var(--text3);text-align:center;padding:12px">Nothing counting down yet.</div>'}
      </div>
    </div>`;
  },
  habits:(worldId,colorVal)=>{
    const w=(DB.worlds||[]).find(x=>x.id===worldId);
    const habits=(w&&w.habits)||[];
    const today=localDateStr(new Date());
    const streakFor=h=>{
      let streak=0,d=new Date();
      while(true){
        const ds=localDateStr(d);
        if((h.completedDates||[]).includes(ds)){streak++;d.setDate(d.getDate()-1);}
        else break;
      }
      return streak;
    };
    return`<div class="hc">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-shrink:0">
        <span style="font-size:var(--text-xs);font-weight:700;color:${colorVal};letter-spacing:.08em;text-transform:uppercase"><i class="ti ti-repeat"></i> Habits</span>
        <button class="btn btn-t" style="font-size:var(--text-xs)" onclick="_addDomainHabit('${worldId}')"><i class="ti ti-plus"></i> Add Habit</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;flex:1;min-height:0;overflow-y:auto">
        ${habits.length?habits.map(h=>{
          const done=(h.completedDates||[]).includes(today);
          const streak=streakFor(h);
          return`<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--navy3);border:1px solid var(--border);border-radius:10px">
            <div onclick="_toggleDomainHabit('${worldId}','${h.id}')" style="width:20px;height:20px;border-radius:6px;border:2px solid ${done?colorVal:'var(--border2)'};background:${done?colorVal:'transparent'};cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center">${done?'<i class="ti ti-check" style="font-size:12px;color:var(--navy1)"></i>':''}</div>
            <span style="flex:1;font-size:var(--text-sm);color:var(--text1)">${h.name}</span>
            ${streak>0?`<span style="font-size:9px;color:var(--amber);font-weight:700;flex-shrink:0"><i class="ti ti-flame"></i> ${streak}</span>`:''}
            <button onclick="_removeDomainHabit('${worldId}','${h.id}')" style="background:transparent;border:none;color:var(--text3);cursor:pointer;flex-shrink:0"><i class="ti ti-x" style="font-size:11px"></i></button>
          </div>`;
        }).join(''):'<div style="font-size:var(--text-xs);color:var(--text3);text-align:center;padding:12px">No habits yet.</div>'}
      </div>
    </div>`;
  },
  goals:(worldId,colorVal)=>{
    const w=(DB.worlds||[]).find(x=>x.id===worldId);
    const goals=(w&&w.goals)||[];
    return`<div class="hc">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-shrink:0">
        <span style="font-size:var(--text-xs);font-weight:700;color:${colorVal};letter-spacing:.08em;text-transform:uppercase"><i class="ti ti-target-arrow"></i> Goals</span>
        <button class="btn btn-t" style="font-size:var(--text-xs)" onclick="_addDomainGoal('${worldId}')"><i class="ti ti-plus"></i> Add Goal</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;flex:1;min-height:0;overflow-y:auto">
        ${goals.length?goals.map(g=>{
          const pct=g.target>0?Math.min(100,Math.round((g.progress/g.target)*100)):0;
          return`<div onclick="_updateDomainGoalProgress('${worldId}','${g.id}')" style="padding:9px 10px;background:var(--navy3);border:1px solid var(--border);border-radius:10px;cursor:pointer">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
              <span style="font-size:var(--text-sm);color:var(--text1);font-weight:600">${g.name}</span>
              <span style="font-size:9px;color:var(--text3)">${g.progress} / ${g.target}</span>
            </div>
            <div style="height:6px;background:var(--navy4);border-radius:4px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:${pct>=100?'var(--green)':colorVal};border-radius:4px"></div>
            </div>
          </div>`;
        }).join(''):'<div style="font-size:var(--text-xs);color:var(--text3);text-align:center;padding:12px">No goals yet.</div>'}
      </div>
    </div>`;
  },
  scratchpad:(worldId,colorVal)=>{
    const w=(DB.worlds||[]).find(x=>x.id===worldId);
    const text=(w&&w.scratchpad)||'';
    return`<div class="hc">
      <div style="font-size:var(--text-xs);font-weight:700;color:${colorVal};letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px;flex-shrink:0"><i class="ti ti-note"></i> Scratchpad</div>
      <textarea oninput="_saveDomainScratchpad('${worldId}',this.value)" placeholder="Quick notes, no formatting needed..." style="flex:1;min-height:0;resize:none;background:var(--navy3);border:1px solid var(--border);border-radius:10px;padding:10px;color:var(--text1);font-size:var(--text-sm);font-family:inherit;outline:none">${text}</textarea>
    </div>`;
  },
  link:(worldId,colorVal)=>{
    const w=(DB.worlds||[]).find(x=>x.id===worldId);
    const links=(w&&w.links)||[];
    return`<div class="hc">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-shrink:0">
        <span style="font-size:var(--text-xs);font-weight:700;color:${colorVal};letter-spacing:.08em;text-transform:uppercase"><i class="ti ti-link"></i> Links</span>
        <button class="btn btn-t" style="font-size:var(--text-xs)" onclick="_addDomainLink('${worldId}')"><i class="ti ti-plus"></i> Add Link</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;flex:1;min-height:0;overflow-y:auto">
        ${links.length?links.map((l,idx)=>`<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--navy3);border:1px solid var(--border);border-radius:8px">
          <i class="ti ti-link" style="color:${colorVal};flex-shrink:0"></i>
          <a href="${l.url}" target="_blank" rel="noopener" style="flex:1;min-width:0;font-size:var(--text-sm);color:var(--text1);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${l.url}">${l.label||l.url}</a>
          <button onclick="_removeDomainLink('${worldId}',${idx})" style="background:transparent;border:none;color:var(--text3);cursor:pointer;flex-shrink:0"><i class="ti ti-x" style="font-size:11px"></i></button>
        </div>`).join(''):'<div style="font-size:var(--text-xs);color:var(--text3);text-align:center;padding:12px">No links yet.</div>'}
      </div>
    </div>`;
  },
  database:(worldId,colorVal)=>{
    return`<div class="hc">
      <div style="font-size:var(--text-xs);font-weight:700;color:${colorVal};letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px"><i class="ti ti-database"></i> Database</div>
      <div id="domainDbHost-${worldId}"></div>
    </div>`;
  },
  timer:(worldId)=>domainTimerCardHTML(worldId).replace('margin:12px 18px 0','margin:0'),
  tasks:(worldId,colorVal,worldTag,tasks)=>{
    const open=tasks.filter(t=>t.status!=='Done').slice(0,25);
    const priColor=p=>p==='High'?'var(--red)':p==='Medium'?'var(--amber)':'var(--text3)';
    const statColor=taskStatusColor;
    return`<div class="hc">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-shrink:0">
        <span style="font-size:var(--text-xs);font-weight:700;color:${colorVal};letter-spacing:.08em;text-transform:uppercase"><i class="ti ti-list-check"></i> Tasks</span>
        <button class="btn btn-t" style="font-size:var(--text-xs)" onclick="openTaskForStatus('${worldTag}','Todo')"><i class="ti ti-plus"></i> Add Task</button>
      </div>
      <div style="flex:1;min-height:0;overflow:auto">
        <table class="jdb-table" style="width:100%">
          <tr><th style="padding:6px 8px;font-size:9px;font-weight:800;color:var(--text3);text-transform:uppercase;text-align:left">Title</th><th style="padding:6px 8px;font-size:9px;font-weight:800;color:var(--text3);text-transform:uppercase;text-align:left">Priority</th><th style="padding:6px 8px;font-size:9px;font-weight:800;color:var(--text3);text-transform:uppercase;text-align:left">Status</th><th style="padding:6px 8px;font-size:9px;font-weight:800;color:var(--text3);text-transform:uppercase;text-align:left">Due</th><th style="padding:6px 8px;font-size:9px;font-weight:800;color:var(--text3);text-transform:uppercase;text-align:left">Client</th></tr>
          ${open.length?open.map(t=>`<tr>
            <td style="padding:7px 8px;cursor:pointer;font-size:var(--text-sm);color:var(--text1)" onclick="editTask(${t.id})">${t.title}</td>
            <td style="padding:7px 8px"><span style="font-size:9px;font-weight:700;color:${priColor(t.priority)}">${t.priority||'—'}</span></td>
            <td style="padding:7px 8px"><span style="font-size:9px;font-weight:700;color:${statColor(t.status)}">${t.status||'—'}</span></td>
            <td style="padding:7px 8px;font-size:9px;color:var(--text3)">${t.due||'—'}</td>
            <td style="padding:7px 8px;font-size:9px;color:var(--text3)">${t.client||'—'}</td>
          </tr>`).join(''):`<tr><td colspan="5" style="padding:16px;text-align:center;font-size:var(--text-xs);color:var(--text3)">No open tasks yet.</td></tr>`}
        </table>
      </div>
    </div>`;
  },
  kanban:(worldId,colorVal,worldTag,tasks)=>{
    const statuses=['Todo','In Progress','No Progress','Done'];
    const sc=Object.fromEntries(statuses.map(s=>[s,taskStatusColor(s)]));
    return`<div class="hc">
      <div style="font-size:var(--text-xs);font-weight:700;color:${colorVal};letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px;flex-shrink:0"><i class="ti ti-layout-kanban"></i> Kanban</div>
      <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:4px;flex:1;min-height:0">
        ${statuses.map(s=>{
          const items=tasks.filter(t=>t.status===s);
          return `<div style="min-width:220px;flex-shrink:0;background:var(--navy2);border:1px solid var(--border);border-top:2px solid ${sc[s]};border-radius:10px;overflow:hidden;display:flex;flex-direction:column">
            <div style="padding:7px 10px;border-bottom:1px solid var(--border);font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${sc[s]};display:flex;justify-content:space-between;flex-shrink:0"><span>${s}</span><span>${items.length}</span></div>
            <div style="padding:6px;display:flex;flex-direction:column;gap:5px;flex:1;min-height:120px;overflow-y:auto">
              ${items.length?items.map(t=>`<div onclick="editTask(${t.id})" style="background:var(--navy3);border:1px solid var(--border);border-radius:7px;padding:7px 9px;cursor:pointer;font-size:var(--text-xs);color:var(--text1)">${t.title}</div>`).join(''):`<div style="font-size:9px;color:var(--text3);text-align:center;padding:8px">—</div>`}
            </div>
            ${s!=='Done'?`<div onclick="openTaskForStatus('${worldTag}','${s}')" style="padding:6px;text-align:center;font-size:9px;color:var(--text3);cursor:pointer;border-top:1px solid var(--border);flex-shrink:0"><i class="ti ti-plus"></i> Add</div>`:''}
          </div>`;
        }).join('')}
      </div>
    </div>`;
  },
  calendar:(worldId,colorVal)=>{
    const today=localDateStr(new Date());
    const upcoming=(DB.calEvents||[]).filter(e=>e.type===worldId&&e.date>=today).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,6);
    return`<div class="hc">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-shrink:0">
        <span style="font-size:var(--text-xs);font-weight:700;color:${colorVal};letter-spacing:.08em;text-transform:uppercase"><i class="ti ti-calendar"></i> Calendar</span>
        <button class="btn btn-t" style="font-size:var(--text-xs)" onclick="_openDomainEventModal('${worldId}')"><i class="ti ti-plus"></i> Add Event</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;flex:1;min-height:0;overflow-y:auto">
        ${upcoming.length?upcoming.map(e=>`<div onclick="editCalEvent(${e.id})" style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:${colorVal}14;border-left:2px solid ${colorVal};border-radius:8px;cursor:pointer">
          <span style="flex:1;font-size:var(--text-sm);color:var(--text1)">${e.title}</span>
          <span style="font-size:9px;color:var(--text3);flex-shrink:0">${e.date}${e.time?' · '+to12h(e.time):''}</span>
        </div>`).join(''):'<div style="font-size:var(--text-xs);color:var(--text3);text-align:center;padding:12px">Nothing scheduled yet.</div>'}
      </div>
    </div>`;
  },
  pipeline:(worldId,colorVal)=>{
    const stages=['Lead','Contacted','Proposal','Won'];
    const items=(DB.pipeline||[]).filter(p=>p.worldId===worldId);
    return`<div class="hc">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-shrink:0">
        <span style="font-size:var(--text-xs);font-weight:700;color:${colorVal};letter-spacing:.08em;text-transform:uppercase"><i class="ti ti-git-branch"></i> Pipeline</span>
        <button class="btn btn-t" style="font-size:var(--text-xs)" onclick="_addDomainPipelineItem('${worldId}')"><i class="ti ti-plus"></i> Add Deal</button>
      </div>
      <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:4px;flex:1;min-height:0">
        ${stages.map(s=>{
          const stageItems=items.filter(p=>p.stage===s);
          const total=stageItems.reduce((sum,p)=>sum+(parseFloat(p.value)||0),0);
          return`<div style="min-width:210px;flex-shrink:0;background:var(--navy2);border:1px solid var(--border);border-radius:10px;overflow:hidden;display:flex;flex-direction:column">
            <div style="padding:7px 10px;border-bottom:1px solid var(--border);font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${colorVal};flex-shrink:0">${s} <span style="color:var(--text3);font-weight:600">(${stageItems.length})</span></div>
            <div style="padding:6px;display:flex;flex-direction:column;gap:5px;flex:1;min-height:120px;overflow-y:auto">
              ${stageItems.length?stageItems.map(p=>`<div onclick="_advanceDomainPipelineItem('${worldId}',${p.id})" style="background:var(--navy3);border:1px solid var(--border);border-radius:7px;padding:7px 9px;cursor:pointer">
                <div style="font-size:var(--text-xs);color:var(--text1);font-weight:600">${p.title}</div>
                ${p.value?`<div style="font-size:9px;color:var(--text3);margin-top:2px">₱${Number(p.value).toLocaleString()}</div>`:''}
              </div>`).join(''):`<div style="font-size:9px;color:var(--text3);text-align:center;padding:8px">—</div>`}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  },
  notes:(worldId,colorVal,worldTag,tasks,notes)=>{
    return`<div class="hc">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:var(--text-xs);font-weight:700;color:${colorVal};letter-spacing:.08em;text-transform:uppercase"><i class="ti ti-notes"></i> Notes</span>
        <button class="btn btn-t" style="font-size:var(--text-xs)" onclick="_newDomainNote('${worldId}')"><i class="ti ti-plus"></i> New Note</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${notes.length?notes.slice(0,8).map(n=>`<div onclick="setView('notes');setTimeout(()=>{const i=DB.notes.findIndex(x=>x.id===${n.id});if(i>=0){currentNote=i;renderNotesList();openNoteEditor(i);}},100)" style="padding:8px 10px;background:var(--navy3);border:1px solid var(--border);border-radius:10px;cursor:pointer;font-size:var(--text-sm);color:var(--text1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${n.title||'Untitled'}</div>`).join(''):'<div style="font-size:var(--text-xs);color:var(--text3);text-align:center;padding:12px">No notes yet.</div>'}
      </div>
    </div>`;
  },
  budget:(worldId,colorVal)=>{
    const w=(DB.worlds||[]).find(x=>x.id===worldId);
    const entries=(w&&w.budgetEntries)||[];
    const income=entries.filter(e=>e.type==='income').reduce((s,e)=>s+(e.amount||0),0);
    const expense=entries.filter(e=>e.type==='expense').reduce((s,e)=>s+(e.amount||0),0);
    const balance=income-expense;
    return`<div class="hc">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-shrink:0">
        <span style="font-size:var(--text-xs);font-weight:700;color:${colorVal};letter-spacing:.08em;text-transform:uppercase"><i class="ti ti-wallet"></i> Budget</span>
        <div style="display:flex;gap:6px">
          <button class="btn btn-g" style="font-size:9px;padding:3px 8px;color:var(--green)" onclick="_addDomainBudgetEntry('${worldId}','income')"><i class="ti ti-plus"></i> Income</button>
          <button class="btn btn-g" style="font-size:9px;padding:3px 8px;color:var(--red)" onclick="_addDomainBudgetEntry('${worldId}','expense')"><i class="ti ti-minus"></i> Expense</button>
        </div>
      </div>
      <div style="text-align:center;padding:8px 0 12px;flex-shrink:0">
        <div style="font-size:9px;color:var(--text3);letter-spacing:.06em;text-transform:uppercase">Balance</div>
        <div style="font-size:22px;font-weight:800;color:${balance>=0?'var(--green)':'var(--red)'}">₱${balance.toLocaleString(undefined,{minimumFractionDigits:2})}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:5px;flex:1;min-height:0;overflow-y:auto">
        ${entries.length?entries.slice().reverse().map(e=>`<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--navy3);border:1px solid var(--border);border-radius:8px">
          <i class="ti ${e.type==='income'?'ti-arrow-up-right':'ti-arrow-down-right'}" style="color:${e.type==='income'?'var(--green)':'var(--red)'};flex-shrink:0"></i>
          <div style="flex:1;min-width:0;font-size:var(--text-xs);color:var(--text1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.desc||(e.type==='income'?'Income':'Expense')}</div>
          <div style="font-size:var(--text-xs);font-weight:700;color:${e.type==='income'?'var(--green)':'var(--red)'};flex-shrink:0">${e.type==='income'?'+':'-'}₱${(e.amount||0).toLocaleString()}</div>
          <button onclick="_removeDomainBudgetEntry('${worldId}','${e.id}')" style="background:transparent;border:none;color:var(--text3);cursor:pointer;flex-shrink:0"><i class="ti ti-x" style="font-size:11px"></i></button>
        </div>`).join(''):'<div style="font-size:var(--text-xs);color:var(--text3);text-align:center;padding:12px">No entries yet.</div>'}
      </div>
    </div>`;
  },
  metrics:(worldId,colorVal)=>{
    const w=(DB.worlds||[]).find(x=>x.id===worldId);
    const metrics=(w&&w.metrics)||[];
    return`<div class="hc">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-shrink:0">
        <span style="font-size:var(--text-xs);font-weight:700;color:${colorVal};letter-spacing:.08em;text-transform:uppercase"><i class="ti ti-chart-bar"></i> Metrics</span>
        <button class="btn btn-t" style="font-size:var(--text-xs)" onclick="_addDomainMetric('${worldId}')"><i class="ti ti-plus"></i> Add Metric</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px;flex:1;min-height:0;overflow-y:auto;align-content:start">
        ${metrics.length?metrics.map(m=>`<div onclick="_updateDomainMetric('${worldId}','${m.id}')" style="cursor:pointer;padding:10px 8px;background:var(--navy3);border:1px solid var(--border);border-radius:10px;text-align:center;position:relative">
          <button onclick="event.stopPropagation();_removeDomainMetric('${worldId}','${m.id}')" style="position:absolute;top:3px;right:5px;background:transparent;border:none;color:var(--text3);cursor:pointer"><i class="ti ti-x" style="font-size:10px"></i></button>
          <div style="font-size:17px;font-weight:800;color:${colorVal}">${m.value}${m.unit?'<span style="font-size:10px;opacity:.7">'+m.unit+'</span>':''}</div>
          <div style="font-size:9px;color:var(--text3);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.label}</div>
        </div>`).join(''):'<div style="grid-column:1/-1;font-size:var(--text-xs);color:var(--text3);text-align:center;padding:12px">No metrics yet.</div>'}
      </div>
    </div>`;
  },
  gallery:(worldId,colorVal)=>{
    const w=(DB.worlds||[]).find(x=>x.id===worldId);
    const files=(w&&w.galleryFiles)||[];
    return`<div class="hc">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-shrink:0">
        <span style="font-size:var(--text-xs);font-weight:700;color:${colorVal};letter-spacing:.08em;text-transform:uppercase"><i class="ti ti-photo"></i> Gallery</span>
        <button class="btn btn-t" style="font-size:var(--text-xs)" onclick="_addDomainGalleryFile('${worldId}')"><i class="ti ti-brand-google-drive"></i> Add File</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:8px;flex:1;min-height:0;overflow-y:auto;align-content:start">
        ${files.length?files.map(f=>`<a href="${f.url}" target="_blank" rel="noopener" style="text-decoration:none;display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 6px;background:var(--navy3);border:1px solid var(--border);border-radius:10px;position:relative">
          <button onclick="event.preventDefault();event.stopPropagation();_removeDomainGalleryFile('${worldId}','${f.id}')" style="position:absolute;top:2px;right:4px;background:transparent;border:none;color:var(--text3);cursor:pointer"><i class="ti ti-x" style="font-size:10px"></i></button>
          <i class="ti ti-file" style="color:${colorVal};font-size:22px"></i>
          <span style="font-size:9px;color:var(--text2);text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%">${f.name}</span>
        </a>`).join(''):'<div style="grid-column:1/-1;font-size:var(--text-xs);color:var(--text3);text-align:center;padding:12px">No files yet — needs Google Workspace connected in Settings.</div>'}
      </div>
    </div>`;
  },
  routine:(worldId,colorVal)=>{
    const w=(DB.worlds||[]).find(x=>x.id===worldId);
    const items=(w&&w.routineItems)||[];
    const today=localDateStr(new Date());
    const doneToday=(w&&w.routineCompletion&&w.routineCompletion[today])||[];
    return`<div class="hc">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-shrink:0">
        <span style="font-size:var(--text-xs);font-weight:700;color:${colorVal};letter-spacing:.08em;text-transform:uppercase"><i class="ti ti-list-check"></i> Daily Routine</span>
        <button class="btn btn-t" style="font-size:var(--text-xs)" onclick="_addDomainRoutineItem('${worldId}')"><i class="ti ti-plus"></i> Add Step</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:5px;flex:1;min-height:0;overflow-y:auto">
        ${items.length?items.map(it=>{const done=doneToday.includes(it.id);return`<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--navy3);border:1px solid var(--border);border-radius:8px">
          <div onclick="_toggleDomainRoutineItem('${worldId}','${it.id}')" style="width:16px;height:16px;border-radius:5px;border:1.5px solid ${done?colorVal:'var(--border2)'};background:${done?colorVal:'transparent'};cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center">${done?'<i class="ti ti-check" style="font-size:11px;color:var(--navy)"></i>':''}</div>
          <div style="flex:1;min-width:0;font-size:var(--text-xs);color:${done?'var(--text3)':'var(--text1)'};text-decoration:${done?'line-through':'none'}">${it.text}</div>
          <button onclick="_removeDomainRoutineItem('${worldId}','${it.id}')" style="background:transparent;border:none;color:var(--text3);cursor:pointer;flex-shrink:0"><i class="ti ti-x" style="font-size:11px"></i></button>
        </div>`;}).join(''):'<div style="font-size:var(--text-xs);color:var(--text3);text-align:center;padding:12px">No routine steps yet.</div>'}
      </div>
      ${items.length?`<div style="font-size:9px;color:var(--text3);text-align:center;margin-top:6px;flex-shrink:0">${doneToday.length}/${items.length} done today — resets at midnight</div>`:''}
    </div>`;
  },
  webpage:(worldId,colorVal)=>{
    const w=(DB.worlds||[]).find(x=>x.id===worldId);
    const url=w&&w.embedUrl;
    return`<div class="hc" style="padding:0;overflow:hidden">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;flex-shrink:0">
        <span style="font-size:var(--text-xs);font-weight:700;color:${colorVal};letter-spacing:.08em;text-transform:uppercase"><i class="ti ti-browser"></i> Embedded Page</span>
        <button class="btn btn-g" style="font-size:var(--text-xs)" onclick="_setDomainEmbedUrl('${worldId}')">${url?'Change':'Set URL'}</button>
      </div>
      ${url?`<iframe src="${url}" style="flex:1;width:100%;border:none;min-height:200px" loading="lazy"></iframe>`
        :`<div style="flex:1;display:flex;align-items:center;justify-content:center;padding:20px;text-align:center;font-size:var(--text-xs);color:var(--text3)">No page set yet. Use a site's actual "embed" or "publish to web" URL (Google Sheets/Docs, Figma, Notion) — some sites block being framed entirely and won't load here even with the right URL.</div>`}
    </div>`;
  },
  activity:(worldId,colorVal,worldTag)=>{
    const items=(DB.history||[]).filter(h=>{
      const d=h.data||{};
      return d.world===worldTag||d.worldId===worldId||(typeof d.type==='string'&&d.type.toLowerCase()===worldId);
    }).slice(0,25);
    return`<div class="hc">
      <div style="font-size:var(--text-xs);font-weight:700;color:${colorVal};letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px;flex-shrink:0"><i class="ti ti-activity"></i> Activity</div>
      <div style="display:flex;flex-direction:column;gap:6px;flex:1;min-height:0;overflow-y:auto">
        ${items.length?items.map(h=>{
          const ts=new Date(h.time).toLocaleString('en-PH',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:true,timeZone:'Asia/Manila'});
          const tc={add:'var(--green)',edit:colorVal,delete:'var(--red)'}[h.type]||'var(--text3)';
          return`<div style="display:flex;gap:8px;align-items:flex-start;padding:6px 8px;border-radius:8px">
            <div style="width:6px;height:6px;border-radius:50%;background:${tc};margin-top:5px;flex-shrink:0"></div>
            <div style="min-width:0"><div style="font-size:var(--text-xs);color:var(--text1)">${h.label}</div><div style="font-size:9px;color:var(--text3)">${ts}</div></div>
          </div>`;
        }).join(''):'<div style="font-size:var(--text-xs);color:var(--text3);text-align:center;padding:12px">No activity yet in this domain.</div>'}
      </div>
    </div>`;
  }
};
function _moduleSizeKey(worldId,moduleId){return 'j-modsize-'+worldId+'-'+moduleId;}
// Built-in domain cards (Ideahub, Job Collectives, etc.) are static DOM nodes
// that persist for the whole session — unlike the custom-domain generic view,
// they're never rebuilt from scratch, so this only needs to run once at boot.
function _buildStaticCardToolbar(elId){
  const toolbar=document.createElement('div');
  toolbar.className='jelix-static-toolbar';
  toolbar.style.cssText='display:flex;align-items:center;justify-content:flex-end;gap:3px;margin-bottom:6px;flex-shrink:0';
  toolbar.onclick=(e)=>e.stopPropagation(); // don't let toolbar clicks trigger the card's own onclick (e.g. TJC Revenue's portal link)
  toolbar.innerHTML=Object.entries(DM_SHAPE_PRESETS).map(([name,p])=>
    `<button class="dm-shape-btn" title="${p.title}" onclick="_setStaticCardShape('${elId}','${name}')"><i class="ti ${p.icon}" style="font-size:11px"></i></button>`
  ).join('')+
    `<button class="dm-shape-btn" title="Move earlier" onclick="_moveStaticCard('${elId}',-1)"><i class="ti ti-arrow-up" style="font-size:11px"></i></button>
     <button class="dm-shape-btn" title="Move later" onclick="_moveStaticCard('${elId}',1)"><i class="ti ti-arrow-down" style="font-size:11px"></i></button>
     <span draggable="true" onmousedown="event.stopPropagation()" title="Drag to reorder (desktop)" style="cursor:grab;color:var(--text4);font-size:14px;padding:3px;line-height:1"><i class="ti ti-grip-vertical" style="display:block"></i></span>`;
  return toolbar;
}
// Called when Edit/View mode toggles — adds or removes toolbars on every
// static card currently on screen, so the icons genuinely disappear once
// you're done arranging things, not just conceptually gated.
function _refreshStaticCardToolbars(){
  document.querySelectorAll('.dm-resizable[id^="hc-"]').forEach(el=>{
    const existing=el.querySelector(':scope > .jelix-static-toolbar');
    if(jelixEditMode&&!existing){
      el.insertBefore(_buildStaticCardToolbar(el.id),el.firstChild);
    }else if(!jelixEditMode&&existing){
      existing.remove();
    }
    el.setAttribute('draggable',jelixEditMode?'true':'false');
  });
}
function makeStaticCardsResizable(elIds){
  // Give each shared parent (a group of stat cards, e.g. Faith's Total/
  // Approved/Submitted/Pending) the same explicit 4-column grid custom
  // domains use — this is what actually enables true side-by-side placement.
  // The old .mr auto-fit grid computes column width FROM content, so one
  // card with a leftover bad width (from before yesterday's fix) could
  // squeeze the whole row into a single narrow column — exactly the bug
  // in the screenshot.
  const seenParents=new Set();
  elIds.forEach(elId=>{
    const el=document.getElementById(elId);if(!el)return;
    if(el.parentElement&&!seenParents.has(el.parentElement)){
      seenParents.add(el.parentElement);
      el.parentElement.classList.add('domain-canvas');
      el.parentElement.style.marginBottom='18px';
    }
  });
  elIds.forEach(elId=>{
    const el=document.getElementById(elId);if(!el||el._jdbResizeObserver)return;
    el.classList.add('dm-resizable');
    el.style.width='';el.style.height=''; // clear any leftover bad px size from before
    const groupKey='j-staticgroup-'+elId.split('-').slice(0,2).join('-');
    const shapeKey='j-modsize-static-'+elId;
    let shape={col:2,row:14};
    try{const saved=JSON.parse(localStorage.getItem(shapeKey)||'null');if(saved&&saved.col)shape=saved;}catch(e){}
    el.style.gridColumn='span '+shape.col;el.style.gridRow='span '+shape.row;

    // Shape-preset + reorder toolbar — same visual language as custom domains.
    // Only shown in Edit mode; toggling to View mode removes it entirely,
    // same as the custom-domain module system.
    if(jelixEditMode)el.insertBefore(_buildStaticCardToolbar(elId),el.firstChild);
    el.setAttribute('draggable',jelixEditMode?'true':'false');
    el.addEventListener('dragstart',()=>{window._staticDragId=elId;el.style.opacity='.5';el.style.transform='scale(.97)';});
    el.addEventListener('dragend',()=>{el.style.opacity='1';el.style.transform='';});
    el.addEventListener('dragover',(e)=>{e.preventDefault();el.style.borderColor='var(--teal)';el.style.boxShadow='0 0 0 2px var(--teal2)';});
    el.addEventListener('dragleave',()=>{el.style.borderColor='';el.style.boxShadow='';});
    el.addEventListener('drop',(e)=>{
      e.preventDefault();el.style.borderColor='';el.style.boxShadow='';
      const dragId=window._staticDragId;
      if(!dragId||dragId===elId)return;
      const dragEl=document.getElementById(dragId);
      if(!dragEl||dragEl.parentElement!==el.parentElement)return; // only reorder within the same card group
      const before=new Map();
      [...el.parentElement.children].forEach(c=>{if(c.id)before.set(c.id,c.getBoundingClientRect());});
      el.parentElement.insertBefore(dragEl,el);
      const order=[...el.parentElement.children].map(c=>c.id).filter(Boolean);
      localStorage.setItem(groupKey,JSON.stringify(order));
      [...el.parentElement.children].forEach(c=>{
        if(!c.id)return;
        const oldRect=before.get(c.id);if(!oldRect)return;
        const newRect=c.getBoundingClientRect();
        const dx=oldRect.left-newRect.left,dy=oldRect.top-newRect.top;
        if(Math.abs(dx)<1&&Math.abs(dy)<1)return;
        c.style.transition='none';c.style.transform=`translate(${dx}px,${dy}px)`;
        requestAnimationFrame(()=>{c.style.transition='transform 280ms cubic-bezier(.2,0,0,1)';c.style.transform='';});
      });
    });

    let saveTimer=null;
    let firstFire=true;
    let pendingRect=null;
    const doSave=()=>{
      if(!pendingRect)return;
      const rect=pendingRect;pendingRect=null;
      const container=el.parentElement;if(!container)return;
      const gap=14,cols=4;
      const colWidth=(container.clientWidth-gap*(cols-1))/cols;
      const rowUnit=16;
      const colSpan=Math.max(1,Math.min(cols,Math.round((rect.width+gap)/(colWidth+gap))));
      const rowSpan=Math.max(6,Math.round((rect.height+gap)/(rowUnit+gap/10)));
      localStorage.setItem(shapeKey,JSON.stringify({col:colSpan,row:rowSpan}));
      el.style.width='';el.style.height='';
      el.style.gridColumn='span '+colSpan;el.style.gridRow='span '+rowSpan;
    };
    const ro=new ResizeObserver(entries=>{
      if(firstFire){firstFire=false;return;}
      pendingRect=entries[0].contentRect;
      clearTimeout(saveTimer);
      saveTimer=setTimeout(doSave,400);
    });
    ro.observe(el);
    // Same fix as the custom-domain module system: register so a mode switch
    // or navigation can force this through immediately instead of losing it
    // to the debounce window. This was the actual bug — static cards had
    // their own separate debounce that was never wired into the flush.
    window._pendingShapeFlushes=window._pendingShapeFlushes||new Map();
    window._pendingShapeFlushes.set(el.id,()=>{clearTimeout(saveTimer);doSave();});
    el._jdbResizeObserver=ro;
  });
  // Restore any previously saved order, once per unique parent group
  const seenParents2=new Set();
  elIds.forEach(elId=>{
    const el=document.getElementById(elId);if(!el||!el.parentElement||seenParents2.has(el.parentElement))return;
    seenParents2.add(el.parentElement);
    const groupKey='j-staticgroup-'+elId.split('-').slice(0,2).join('-');
    try{
      const order=JSON.parse(localStorage.getItem(groupKey)||'null');
      if(Array.isArray(order)){
        order.forEach(id=>{const c=document.getElementById(id);if(c&&c.parentElement===el.parentElement)el.parentElement.appendChild(c);});
      }
    }catch(e){}
  });
}
function _setStaticCardShape(elId,shapeName){
  const preset=DM_SHAPE_PRESETS[shapeName];if(!preset)return;
  const el=document.getElementById(elId);if(!el)return;
  localStorage.setItem('j-modsize-static-'+elId,JSON.stringify({col:preset.col,row:preset.row}));
  el.style.width='';el.style.height='';
  el.style.gridColumn='span '+preset.col;el.style.gridRow='span '+preset.row;
}
function _moveStaticCard(elId,dir){
  const el=document.getElementById(elId);if(!el||!el.parentElement)return;
  const siblings=[...el.parentElement.children].filter(c=>c.id);
  const pos=siblings.indexOf(el);
  const newPos=pos+dir;
  if(newPos<0||newPos>=siblings.length)return;
  const before=new Map();
  siblings.forEach(c=>before.set(c.id,c.getBoundingClientRect()));
  if(dir>0)el.parentElement.insertBefore(siblings[newPos],el);
  else el.parentElement.insertBefore(el,siblings[newPos]);
  const groupKey='j-staticgroup-'+elId.split('-').slice(0,2).join('-');
  const order=[...el.parentElement.children].map(c=>c.id).filter(Boolean);
  localStorage.setItem(groupKey,JSON.stringify(order));
  [...el.parentElement.children].forEach(c=>{
    if(!c.id)return;
    const oldRect=before.get(c.id);if(!oldRect)return;
    const newRect=c.getBoundingClientRect();
    const dx=oldRect.left-newRect.left,dy=oldRect.top-newRect.top;
    if(Math.abs(dx)<1&&Math.abs(dy)<1)return;
    c.style.transition='none';c.style.transform=`translate(${dx}px,${dy}px)`;
    requestAnimationFrame(()=>{c.style.transition='transform 280ms cubic-bezier(.2,0,0,1)';c.style.transform='';});
  });
}
function _restoreModuleSizes(worldId,moduleIds){
  moduleIds.forEach(id=>{
    const el=document.getElementById('domainModule-'+worldId+'-'+id);
    if(!el)return;
    // Grid shape (col/row span) is already applied inline by renderDomainGenericView
    // from w.moduleShapes. What's left is watching for manual drag-resize and
    // converting the resulting pixel size back into grid spans, so dragging
    // the corner handle and clicking a shape preset both feed the same system.
    if(el._jdbResizeObserver)el._jdbResizeObserver.disconnect();
    let saveTimer=null;
    let firstFire=true; // ResizeObserver always fires once immediately on .observe() —
                         // that's not a user resize, just it reporting the starting size.
    let pendingEntry=null;
    const doSave=()=>{
      if(!pendingEntry)return;
      const rect=pendingEntry;pendingEntry=null;
      const container=document.getElementById('domainGenericBody');
      if(!container)return;
      const gap=14,cols=4;
      const containerWidth=container.clientWidth;
      const colWidth=(containerWidth-gap*(cols-1))/cols;
      const rowUnit=16;
      let colSpan=Math.max(1,Math.min(cols,Math.round((rect.width+gap)/(colWidth+gap))));
      let rowSpan=Math.max(6,Math.round((rect.height+gap)/(rowUnit+gap/10)));
      const i=(DB.worlds||[]).findIndex(w=>w.id===worldId);
      if(i>=0){
        if(!DB.worlds[i].moduleShapes)DB.worlds[i].moduleShapes={};
        DB.worlds[i].moduleShapes[id]={col:colSpan,row:rowSpan};
        save('worlds');
      }
      // Hand control back to the grid now that the span is persisted —
      // leaving explicit width/height would fight the grid on next render.
      el.style.width='';el.style.height='';
        el.style.gridColumn='span '+colSpan;el.style.gridRow='span '+rowSpan;
    };
    const ro=new ResizeObserver(entries=>{
      if(firstFire){firstFire=false;return;}
      pendingEntry=entries[0].contentRect;
      clearTimeout(saveTimer);
      saveTimer=setTimeout(doSave,400);
    });
    ro.observe(el);
    el._jdbResizeObserver=ro;
    // Register so a mode switch (or anything else) can force this through
    // immediately instead of losing it to the debounce window.
    window._pendingShapeFlushes=window._pendingShapeFlushes||new Map();
    window._pendingShapeFlushes.set(el.id,()=>{clearTimeout(saveTimer);doSave();});
  });
}
function _flushPendingShapeSaves(){
  if(!window._pendingShapeFlushes)return;
  window._pendingShapeFlushes.forEach(fn=>{try{fn();}catch(e){}});
  window._pendingShapeFlushes.clear();
}
let _activeDomainTab={};
const DM_SHAPE_PRESETS={
  square:{col:2,row:20,icon:'ti-square',title:'Square'},
  row:{col:4,row:10,icon:'ti-rectangle',title:'Row (wide, short)'},
  column:{col:1,row:26,icon:'ti-rectangle-vertical',title:'Column (narrow, tall)'},
  rectangle:{col:3,row:15,icon:'ti-layout-board',title:'Rectangle'}
};
function _moduleShapeFor(worldId,moduleId){
  const w=(DB.worlds||[]).find(x=>x.id===worldId);
  const saved=w&&w.moduleShapes&&w.moduleShapes[moduleId];
  return saved||{col:4,row:15};
}
async function resetDomainLayout(worldId){
  if(!await jelixConfirm('Reset this domain\'s module sizes and order back to default? Nothing will be deleted, just re-aligned.','Reset'))return;
  const i=(DB.worlds||[]).findIndex(w=>w.id===worldId);if(i<0)return;
  delete DB.worlds[i].moduleShapes;
  delete DB.worlds[i].moduleOrder;
  save('worlds');
  document.querySelectorAll('[id^="domainModule-'+worldId+'-"]').forEach(el=>{
    if(el._jdbResizeObserver){el._jdbResizeObserver.disconnect();delete el._jdbResizeObserver;}
  });
  if(currentView===worldId)renderDomainGenericView(worldId);
  showToast('✓ Layout reset');
}
// Global cleanup — clears any card sizes saved by the ResizeObserver bug that
// shipped before it was fixed (it was treating its own automatic first
// measurement as if you'd manually resized the card, and persisting that).
// Safe to run any time; only touches saved sizes, never your actual data.
async function resetAllCardLayouts(){
  if(!await jelixConfirm('Reset ALL card sizes and positions across every domain back to default? Your tasks, events, and other data are untouched — this only clears saved layout sizes.','Reset'))return;
  Object.keys(localStorage).forEach(k=>{
    if(k.startsWith('j-modsize-static-')||k.startsWith('j-staticorder-')||k.startsWith('j-staticgroup-'))localStorage.removeItem(k);
  });
  (DB.worlds||[]).forEach(w=>{delete w.moduleShapes;delete w.moduleOrder;});
  save('worlds');
  document.querySelectorAll('.dm-resizable').forEach(el=>{
    if(el._jdbResizeObserver){el._jdbResizeObserver.disconnect();delete el._jdbResizeObserver;}
    el.style.width='';el.style.height='';el.style.gridColumn='';el.style.gridRow='';
  });
  showToast('✓ All card layouts reset — reopen the domain to see it clean.');
  if(currentView&&(DB.worlds||[]).some(w=>w.id===currentView))renderDomainGenericView(currentView);
}
function setDomainModuleShape(worldId,moduleId,shapeName){
  const preset=DM_SHAPE_PRESETS[shapeName];if(!preset)return;
  const i=(DB.worlds||[]).findIndex(w=>w.id===worldId);if(i<0)return;
  if(!DB.worlds[i].moduleShapes)DB.worlds[i].moduleShapes={};
  DB.worlds[i].moduleShapes[moduleId]={col:preset.col,row:preset.row};
  save('worlds');
  const el=document.getElementById('domainModule-'+worldId+'-'+moduleId);
  if(el){el.style.gridColumn='span '+preset.col;el.style.gridRow='span '+preset.row;el.style.width='';el.style.height='';}
}
function renderDomainGenericView(worldId){
  const w=(DB.worlds||[]).find(x=>x.id===worldId);
  const body=document.getElementById('domainGenericBody');
  const titleEl=document.getElementById('domainGenericTitle');
  if(!w||!body)return;
  const colorVal=(w.color&&/^#/.test(w.color))?w.color:('var('+(w.cssVar||'--teal')+')');
  if(titleEl)titleEl.innerHTML=`<i class="ti ${w.icon||'ti-star'}" style="color:${colorVal}"></i>${w.label}`;
  const toggleMount=document.getElementById('domainEditToggleMount');
  if(toggleMount)toggleMount.innerHTML=_editToggleButtonHtml();
  const active=domainModulesFor(worldId);
  const order=domainModuleOrderFor(worldId);
  const worldTag=worldId.toUpperCase();
  const tasks=(DB.tasks||[]).filter(t=>t.world===worldTag);
  const notes=(DB.notes||[]).filter(n=>n.worldId===worldId);
  let visibleOrder=order.filter(id=>active.includes(id));

  // Tabs — group modules into named sections. Only shown if the domain
  // actually has tabs defined; otherwise behaves exactly as before.
  let tabBarHtml='';
  if(w.tabs&&w.tabs.length){
    const moduleTabs=w.moduleTabs||{};
    const currentTab=_activeDomainTab[worldId]||'all';
    const tabButtons=[{id:'all',name:'All'},...w.tabs].map(t=>{
      const isActive=currentTab===t.id;
      return`<button onclick="_setActiveDomainTab('${worldId}','${t.id}')" style="background:${isActive?colorVal+'22':'var(--navy3)'};color:${isActive?colorVal:'var(--text3)'};border:1px solid ${isActive?colorVal:'var(--border)'};border-radius:7px;font-size:var(--text-xs);font-weight:700;padding:6px 12px;cursor:pointer">${t.name}</button>`;
    }).join('');
    tabBarHtml=`<div style="display:flex;gap:6px;flex-wrap:wrap;grid-column:1/-1;grid-row:span 3;margin-bottom:2px;align-self:start">${tabButtons}<button onclick="openDomainModulesModal('${worldId}')" title="Manage tabs" style="background:transparent;border:1px dashed var(--border2);border-radius:7px;color:var(--text3);font-size:var(--text-xs);padding:6px 10px;cursor:pointer"><i class="ti ti-settings"></i></button></div>`;
    if(currentTab!=='all'){
      visibleOrder=visibleOrder.filter(id=>moduleTabs[id]===currentTab);
    }
  }

  const shapeButtons=(worldId,id)=>Object.entries(DM_SHAPE_PRESETS).map(([name,p])=>
    `<button class="dm-shape-btn" title="${p.title}" onclick="setDomainModuleShape('${worldId}','${id}','${name}')"><i class="ti ${p.icon}" style="font-size:11px"></i></button>`
  ).join('');

  let html=visibleOrder.map(id=>{
    const renderer=DOMAIN_MODULE_RENDERERS[id];
    const out=renderer?renderer(worldId,colorVal,worldTag,tasks,notes):'';
    const shape=_moduleShapeFor(worldId,id);
    if(!jelixEditMode){
      // View mode: no drag/resize/shape chrome, just the module content in its saved shape
      return _wrapModuleOuterDiv(out,'id="domainModule-'+worldId+'-'+id+'" data-module-id="'+id+'"','grid-column:span '+shape.col+';grid-row:span '+shape.row+';');
    }
    // Tag each module's own wrapper div: grid shape, resize/reorder handles.
    // This renders as a normal top toolbar row (not an absolute overlay) —
    // every module's own renderer already has its own right-aligned header
    // button ("+ Add Task", "+ Add Deal", etc.), and overlaying on top of
    // that was the actual cause of the Pipeline/Job Collectives collision.
    const handle=`<div style="display:flex;align-items:center;justify-content:flex-end;gap:3px;margin-bottom:6px;flex-shrink:0">
      ${shapeButtons(worldId,id)}
      <button class="dm-shape-btn" title="Move earlier" onclick="moveDomainModule('${worldId}','${id}',-1)"><i class="ti ti-arrow-up" style="font-size:11px"></i></button>
      <button class="dm-shape-btn" title="Move later" onclick="moveDomainModule('${worldId}','${id}',1)"><i class="ti ti-arrow-down" style="font-size:11px"></i></button>
      <div draggable="true" ondragstart="_dmDragId='${id}';const m=event.currentTarget.parentElement.parentElement;m.style.opacity='.5';m.style.transform='scale(.97)'" ondragend="const m=event.currentTarget.parentElement.parentElement;m.style.opacity='1';m.style.transform=''" title="Drag to reorder (desktop)" style="cursor:grab;color:var(--text4);font-size:14px;padding:3px;line-height:1"><i class="ti ti-grip-vertical" style="display:block"></i></div>
    </div>`;
    return _wrapModuleOuterDiv(out,
      'id="domainModule-'+worldId+'-'+id+'" data-module-id="'+id+'" '+
      'ondragover="event.preventDefault();event.currentTarget.style.borderColor=\'var(--teal)\';event.currentTarget.style.boxShadow=\'0 0 0 2px var(--teal2)\';event.currentTarget.style.transform=\'scale(1.01)\'" '+
      'ondragleave="event.currentTarget.style.borderColor=\'var(--border)\';event.currentTarget.style.boxShadow=\'\';event.currentTarget.style.transform=\'\'" '+
      'ondrop="event.preventDefault();event.currentTarget.style.borderColor=\'var(--border)\';event.currentTarget.style.boxShadow=\'\';event.currentTarget.style.transform=\'\';reorderDomainModule(\''+worldId+'\',\''+id+'\')"',
      'resize:both;overflow-y:auto;overflow-x:hidden;min-height:140px;min-width:200px;max-width:100%;display:flex;flex-direction:column;align-self:start;grid-column:span '+shape.col+';grid-row:span '+shape.row+';transition:border-color .15s,box-shadow .15s,transform .15s;',
      handle,
      true
    );
  }).join('');

  const addTile=(jelixEditMode&&visibleOrder.length)?`<div class="dm-add-tile" onclick="openDomainModulesModal('${worldId}')"><i class="ti ti-plus" style="font-size:16px"></i> Add module</div>`:'';

  if(!visibleOrder.length){
    html=`<div style="grid-column:1/-1;grid-row:span 14;align-self:start;text-align:center;padding:40px 20px;color:var(--text3)">
      <i class="ti ti-layout-grid-add" style="font-size:32px;display:block;margin-bottom:10px;opacity:.5"></i>
      <div style="font-size:var(--text-sm);margin-bottom:10px">${w.tabs&&w.tabs.length&&_activeDomainTab[worldId]&&_activeDomainTab[worldId]!=='all'?'No modules assigned to this tab yet.':'No modules added yet.'}</div>
      ${jelixEditMode?`<button class="btn btn-t" onclick="openDomainModulesModal('${worldId}')">${w.tabs&&w.tabs.length?'Manage':'Add'} modules</button>`:''}
    </div>`;
  }
  body.innerHTML=tabBarHtml+html+addTile;
  if(jelixEditMode)_restoreModuleSizes(worldId,visibleOrder);
  if(visibleOrder.includes('database')){
    const host=document.getElementById('domainDbHost-'+worldId);
    if(host){
      if(!w.database)w.database=jdbNewDatabase();
      renderDatabaseBlock(host,w.database,()=>{
        const idx=(DB.worlds||[]).findIndex(x=>x.id===worldId);
        if(idx>=0){DB.worlds[idx].database=w.database;save('worlds');}
      });
    }
  }
}
async function _addDomainHabit(worldId){
  const [name]=await jelixPrompt('Add Habit',[{key:'name',label:'Habit name',placeholder:'e.g. Drink water'}]);
  if(!name)return;
  const i=(DB.worlds||[]).findIndex(w=>w.id===worldId);if(i<0)return;
  if(!DB.worlds[i].habits)DB.worlds[i].habits=[];
  DB.worlds[i].habits.push({id:'h'+Date.now(),name,completedDates:[]});
  save('worlds');
  if(currentView===worldId)renderDomainGenericView(worldId);
}
function _toggleDomainHabit(worldId,habitId){
  const i=(DB.worlds||[]).findIndex(w=>w.id===worldId);if(i<0)return;
  const h=(DB.worlds[i].habits||[]).find(x=>x.id===habitId);if(!h)return;
  const today=localDateStr(new Date());
  if(!h.completedDates)h.completedDates=[];
  const idx=h.completedDates.indexOf(today);
  if(idx>=0)h.completedDates.splice(idx,1);else h.completedDates.push(today);
  save('worlds');
  if(currentView===worldId)renderDomainGenericView(worldId);
}
function _removeDomainHabit(worldId,habitId){
  const i=(DB.worlds||[]).findIndex(w=>w.id===worldId);if(i<0)return;
  DB.worlds[i].habits=(DB.worlds[i].habits||[]).filter(h=>h.id!==habitId);
  save('worlds');
  if(currentView===worldId)renderDomainGenericView(worldId);
}
async function _addDomainGoal(worldId){
  const [name,targetStr]=await jelixPrompt('Add Goal',[
    {key:'name',label:'Goal name',placeholder:'e.g. Read 10 books'},
    {key:'target',label:'Target number',placeholder:'10',type:'number',default:'10'}
  ]);
  if(!name)return;
  const target=parseFloat(targetStr)||10;
  const i=(DB.worlds||[]).findIndex(w=>w.id===worldId);if(i<0)return;
  if(!DB.worlds[i].goals)DB.worlds[i].goals=[];
  DB.worlds[i].goals.push({id:'g'+Date.now(),name,progress:0,target});
  save('worlds');
  if(currentView===worldId)renderDomainGenericView(worldId);
}
async function _updateDomainGoalProgress(worldId,goalId){
  const i=(DB.worlds||[]).findIndex(w=>w.id===worldId);if(i<0)return;
  const g=(DB.worlds[i].goals||[]).find(x=>x.id===goalId);if(!g)return;
  const [val]=await jelixPrompt('Update Progress',[{key:'progress',label:'Progress toward "'+g.name+'"',type:'number',default:String(g.progress)}],'Update');
  if(val===''||val===undefined)return;
  g.progress=parseFloat(val)||0;
  save('worlds');
  if(currentView===worldId)renderDomainGenericView(worldId);
}
const _saveDomainScratchpad=debounce((worldId,text)=>{
  const i=(DB.worlds||[]).findIndex(w=>w.id===worldId);if(i<0)return;
  DB.worlds[i].scratchpad=text;
  save('worlds');
},800);
async function _addDomainContact(worldId){
  const [name,role,email,phone]=await jelixPrompt('Add Contact',[
    {key:'name',label:'Name',placeholder:'e.g. Alex Rivera'},
    {key:'role',label:'Role (optional)',placeholder:'e.g. Client'},
    {key:'email',label:'Email (optional)',placeholder:'name@example.com'},
    {key:'phone',label:'Phone (optional)',placeholder:'+63 900 000 0000'}
  ]);
  if(!name)return;
  const i=(DB.worlds||[]).findIndex(w=>w.id===worldId);if(i<0)return;
  if(!DB.worlds[i].contacts)DB.worlds[i].contacts=[];
  DB.worlds[i].contacts.push({id:'p'+Date.now(),name,role,email,phone});
  save('worlds');
  if(currentView===worldId)renderDomainGenericView(worldId);
}
function _removeDomainContact(worldId,contactId){
  const i=(DB.worlds||[]).findIndex(w=>w.id===worldId);if(i<0)return;
  DB.worlds[i].contacts=(DB.worlds[i].contacts||[]).filter(p=>p.id!==contactId);
  save('worlds');
  if(currentView===worldId)renderDomainGenericView(worldId);
}
// ── Budget module ────────────────────────────────────────────────────────
async function _addDomainBudgetEntry(worldId,type){
  const [amountStr,desc]=await jelixPrompt(type==='income'?'Add Income':'Add Expense',[
    {key:'amount',label:'Amount (₱)',type:'number',placeholder:'0'},
    {key:'desc',label:'Description',placeholder:'e.g. Contractor deposit'}
  ]);
  const amount=parseFloat(amountStr);
  if(!amount||amount<=0)return;
  const i=(DB.worlds||[]).findIndex(w=>w.id===worldId);if(i<0)return;
  if(!DB.worlds[i].budgetEntries)DB.worlds[i].budgetEntries=[];
  DB.worlds[i].budgetEntries.push({id:'b'+Date.now(),type,amount,desc,date:localDateStr(new Date())});
  save('worlds');
  if(currentView===worldId)renderDomainGenericView(worldId);
}
function _removeDomainBudgetEntry(worldId,entryId){
  const i=(DB.worlds||[]).findIndex(w=>w.id===worldId);if(i<0)return;
  DB.worlds[i].budgetEntries=(DB.worlds[i].budgetEntries||[]).filter(e=>e.id!==entryId);
  save('worlds');
  if(currentView===worldId)renderDomainGenericView(worldId);
}
// ── Metrics module ───────────────────────────────────────────────────────
async function _addDomainMetric(worldId){
  const [label,value,unit]=await jelixPrompt('Add Metric',[
    {key:'label',label:'Label',placeholder:'e.g. Followers'},
    {key:'value',label:'Value',type:'number',placeholder:'0'},
    {key:'unit',label:'Unit (optional)',placeholder:'e.g. kg, %, pts'}
  ]);
  if(!label)return;
  const i=(DB.worlds||[]).findIndex(w=>w.id===worldId);if(i<0)return;
  if(!DB.worlds[i].metrics)DB.worlds[i].metrics=[];
  DB.worlds[i].metrics.push({id:'m'+Date.now(),label,value:value||'0',unit:unit||''});
  save('worlds');
  if(currentView===worldId)renderDomainGenericView(worldId);
}
async function _updateDomainMetric(worldId,metricId){
  const i=(DB.worlds||[]).findIndex(w=>w.id===worldId);if(i<0)return;
  const m=(DB.worlds[i].metrics||[]).find(x=>x.id===metricId);if(!m)return;
  const [val]=await jelixPrompt('Update "'+m.label+'"',[{key:'value',label:'New value',default:String(m.value)}],'Update');
  if(val===''||val===undefined)return;
  m.value=val;
  save('worlds');
  if(currentView===worldId)renderDomainGenericView(worldId);
}
function _removeDomainMetric(worldId,metricId){
  const i=(DB.worlds||[]).findIndex(w=>w.id===worldId);if(i<0)return;
  DB.worlds[i].metrics=(DB.worlds[i].metrics||[]).filter(m=>m.id!==metricId);
  save('worlds');
  if(currentView===worldId)renderDomainGenericView(worldId);
}
// ── Gallery module — reuses the Drive picker built for task/note attachments
async function _addDomainGalleryFile(worldId){
  openDrivePicker(f=>{
    const i=(DB.worlds||[]).findIndex(w=>w.id===worldId);if(i<0)return;
    if(!DB.worlds[i].galleryFiles)DB.worlds[i].galleryFiles=[];
    DB.worlds[i].galleryFiles.push({id:'gf'+Date.now(),name:f.name,url:f.webViewLink});
    save('worlds');
    if(currentView===worldId)renderDomainGenericView(worldId);
  });
}
function _removeDomainGalleryFile(worldId,fileId){
  const i=(DB.worlds||[]).findIndex(w=>w.id===worldId);if(i<0)return;
  DB.worlds[i].galleryFiles=(DB.worlds[i].galleryFiles||[]).filter(f=>f.id!==fileId);
  save('worlds');
  if(currentView===worldId)renderDomainGenericView(worldId);
}
// ── Routine module — resets daily; completion tracked per calendar date so
// yesterday's checks don't carry over, without needing a midnight timer.
async function _addDomainRoutineItem(worldId){
  const [text]=await jelixPrompt('Add Routine Step',[{key:'text',label:'Step',placeholder:'e.g. Stretch for 5 minutes'}]);
  if(!text)return;
  const i=(DB.worlds||[]).findIndex(w=>w.id===worldId);if(i<0)return;
  if(!DB.worlds[i].routineItems)DB.worlds[i].routineItems=[];
  DB.worlds[i].routineItems.push({id:'r'+Date.now(),text});
  save('worlds');
  if(currentView===worldId)renderDomainGenericView(worldId);
}
function _toggleDomainRoutineItem(worldId,itemId){
  const i=(DB.worlds||[]).findIndex(w=>w.id===worldId);if(i<0)return;
  const today=localDateStr(new Date());
  if(!DB.worlds[i].routineCompletion)DB.worlds[i].routineCompletion={};
  if(!DB.worlds[i].routineCompletion[today])DB.worlds[i].routineCompletion[today]=[];
  const arr=DB.worlds[i].routineCompletion[today];
  const idx=arr.indexOf(itemId);
  if(idx>=0)arr.splice(idx,1);else arr.push(itemId);
  // Trim old completion history so this object doesn't grow forever
  const keys=Object.keys(DB.worlds[i].routineCompletion).sort();
  if(keys.length>30)delete DB.worlds[i].routineCompletion[keys[0]];
  save('worlds');
  if(currentView===worldId)renderDomainGenericView(worldId);
}
function _removeDomainRoutineItem(worldId,itemId){
  const i=(DB.worlds||[]).findIndex(w=>w.id===worldId);if(i<0)return;
  DB.worlds[i].routineItems=(DB.worlds[i].routineItems||[]).filter(r=>r.id!==itemId);
  save('worlds');
  if(currentView===worldId)renderDomainGenericView(worldId);
}
// ── Embedded webpage module ─────────────────────────────────────────────
async function _setDomainEmbedUrl(worldId){
  const w=(DB.worlds||[]).find(x=>x.id===worldId);
  const [url]=await jelixPrompt('Set Embedded Page',[{key:'url',label:'Embed URL',placeholder:'https://...',default:w?.embedUrl||''}],'Save');
  if(url===undefined)return;
  const i=(DB.worlds||[]).findIndex(x=>x.id===worldId);if(i<0)return;
  DB.worlds[i].embedUrl=url.trim();
  save('worlds');
  if(currentView===worldId)renderDomainGenericView(worldId);
}
async function _addDomainCountdown(worldId){
  const [name,date]=await jelixPrompt('Add Countdown',[
    {key:'name',label:'What are you counting down to?',placeholder:'e.g. Launch Day'},
    {key:'date',label:'Date',type:'date',default:localDateStr(new Date())}
  ]);
  if(!name||!date)return;
  const i=(DB.worlds||[]).findIndex(w=>w.id===worldId);if(i<0)return;
  if(!DB.worlds[i].countdowns)DB.worlds[i].countdowns=[];
  DB.worlds[i].countdowns.push({id:'cd'+Date.now(),name,date});
  save('worlds');
  if(currentView===worldId)renderDomainGenericView(worldId);
}
function _removeDomainCountdown(worldId,countdownId){
  const i=(DB.worlds||[]).findIndex(w=>w.id===worldId);if(i<0)return;
  DB.worlds[i].countdowns=(DB.worlds[i].countdowns||[]).filter(c=>c.id!==countdownId);
  save('worlds');
  if(currentView===worldId)renderDomainGenericView(worldId);
}
async function _addDomainLink(worldId){
  const [label,urlRaw]=await jelixPrompt('Add Link',[
    {key:'label',label:'Link name',placeholder:'e.g. Client Portal'},
    {key:'url',label:'URL',placeholder:'example.com'}
  ]);
  if(!label||!urlRaw)return;
  const url=/^https?:\/\//i.test(urlRaw)?urlRaw:'https://'+urlRaw;
  const i=(DB.worlds||[]).findIndex(w=>w.id===worldId);if(i<0)return;
  if(!DB.worlds[i].links)DB.worlds[i].links=[];
  DB.worlds[i].links.push({label,url});
  save('worlds');
  if(currentView===worldId)renderDomainGenericView(worldId);
}
function _removeDomainLink(worldId,idx){
  const i=(DB.worlds||[]).findIndex(w=>w.id===worldId);if(i<0)return;
  (DB.worlds[i].links||[]).splice(idx,1);
  save('worlds');
  if(currentView===worldId)renderDomainGenericView(worldId);
}
async function _addDomainPipelineItem(worldId){
  const [title,valStr]=await jelixPrompt('Add Deal',[
    {key:'title',label:'Deal / opportunity name',placeholder:'e.g. Acme Corp — retainer'},
    {key:'value',label:'Estimated value (optional)',type:'number',placeholder:'0'}
  ]);
  if(!title)return;
  const p={id:Date.now(),worldId,title,stage:'Lead',value:valStr?parseFloat(valStr)||0:0};
  if(!DB.pipeline)DB.pipeline=[];
  DB.pipeline.unshift(p);save('pipeline');
  SB.upsert('pipeline',p,'pipeline');
  renderDomainGenericView(worldId);
}
async function _advanceDomainPipelineItem(worldId,id){
  const stages=['Lead','Contacted','Proposal','Won'];
  const p=(DB.pipeline||[]).find(x=>x.id===id);if(!p)return;
  const i=stages.indexOf(p.stage);
  if(i<stages.length-1){
    p.stage=stages[i+1];
    save('pipeline');SB.update('pipeline',p.id,p,'pipeline');
    renderDomainGenericView(worldId);
    showToast('→ Moved to '+p.stage);
  }else if(await jelixConfirm('Remove "'+p.title+'" from the pipeline?','Remove')){
    DB.pipeline=DB.pipeline.filter(x=>x.id!==id);
    save('pipeline');
    sbFetch('pipeline','DELETE',null,`id=eq.${id}`).catch(()=>{});
    renderDomainGenericView(worldId);
  }
}
// ── Customize modal — checkbox visibility + drag-to-reorder, Notion-style ──
let _dmDragId=null;
function openDomainModulesModal(worldId){
  const list=document.getElementById('domainModulesList');if(!list)return;
  _renderDomainModulesList(worldId);
  openModal('domainModulesModal');
}
function _setActiveDomainTab(worldId,tabId){
  _activeDomainTab[worldId]=tabId;
  renderDomainGenericView(worldId);
}
function _renderDomainModulesList(worldId){
  const list=document.getElementById('domainModulesList');if(!list)return;
  const w=(DB.worlds||[]).find(x=>x.id===worldId);if(!w)return;
  const active=domainModulesFor(worldId);
  const order=domainModuleOrderFor(worldId);
  const tabs=w.tabs||[];
  const moduleTabs=w.moduleTabs||{};

  const resetSection=`<button class="btn btn-g" style="font-size:var(--text-xs);width:100%;margin-bottom:14px" onclick="resetDomainLayout('${worldId}')"><i class="ti ti-layout-grid"></i> Reset layout to default (fixes odd sizes/overlaps)</button>`;

  const tabsSection=`
    <div style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border)">
      <div style="font-size:var(--text-xs);font-weight:700;color:var(--teal);letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">Tabs</div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px">
        ${tabs.map(t=>`<div style="display:flex;align-items:center;gap:6px">
          <input value="${t.name}" onchange="renameDomainTab('${worldId}','${t.id}',this.value)" style="flex:1;font-size:var(--text-sm)">
          <button onclick="deleteDomainTab('${worldId}','${t.id}')" style="background:transparent;border:none;color:var(--red);cursor:pointer"><i class="ti ti-trash" style="font-size:13px"></i></button>
        </div>`).join('')||'<div style="font-size:9px;color:var(--text3)">No tabs yet — modules show ungrouped.</div>'}
      </div>
      <button class="btn btn-g" style="font-size:var(--text-xs)" onclick="addDomainTab('${worldId}')"><i class="ti ti-plus"></i> Add Tab</button>
    </div>`;

  const modulesSection=order.map(id=>{
    const m=DOMAIN_MODULE_LABELS[id];if(!m)return'';
    const tabOptions=tabs.length?`<select onchange="assignModuleToTab('${worldId}','${id}',this.value)" style="font-size:9px;background:var(--navy2);border:1px solid var(--border);border-radius:6px;padding:3px 5px;flex-shrink:0;max-width:90px">
        <option value="">No tab</option>
        ${tabs.map(t=>`<option value="${t.id}" ${moduleTabs[id]===t.id?'selected':''}>${t.name}</option>`).join('')}
      </select>`:'';
    return`<label draggable="true"
      ondragstart="_dmDragId='${id}';event.currentTarget.style.opacity='.4'"
      ondragend="event.currentTarget.style.opacity='1'"
      ondragover="event.preventDefault();event.currentTarget.style.borderColor='var(--teal)'"
      ondragleave="event.currentTarget.style.borderColor='var(--border)'"
      ondrop="event.preventDefault();event.currentTarget.style.borderColor='var(--border)';reorderDomainModule('${worldId}','${id}')"
      style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:${active.includes(id)?'var(--teal4)':'var(--navy3)'};border:1px solid ${active.includes(id)?'var(--teal2)':'var(--border)'};border-radius:10px;cursor:grab">
      <i class="ti ti-grip-vertical" style="color:var(--text4);font-size:14px;flex-shrink:0"></i>
      <div onclick="toggleDomainModule('${worldId}','${id}',!${active.includes(id)})" title="${active.includes(id)?'On — click to turn off':'Off — click to turn on'}" style="width:34px;height:20px;border-radius:100px;background:${active.includes(id)?'var(--teal)':'var(--navy4)'};position:relative;cursor:pointer;flex-shrink:0;transition:background .15s">
        <span style="position:absolute;top:2px;left:${active.includes(id)?'16px':'2px'};width:16px;height:16px;border-radius:50%;background:var(--text1);transition:left .15s"></span>
      </div>
      <i class="ti ${m.icon}" style="color:${active.includes(id)?'var(--teal)':'var(--text3)'};font-size:var(--text-md);flex-shrink:0"></i>
      <div style="flex:1;min-width:0">
        <div style="font-size:var(--text-sm);font-weight:600;color:var(--text1)">${m.label}</div>
        <div style="font-size:9px;color:var(--text3)">${m.desc}</div>
      </div>
      ${tabOptions}
    </label>`;
  }).join('');

  list.innerHTML=resetSection+tabsSection+'<div style="font-size:var(--text-xs);font-weight:700;color:var(--teal);letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">Modules</div>'+modulesSection;
}
async function addDomainTab(worldId){
  const result=await jelixPrompt('New Tab',[{key:'name',label:'Tab name'}],'Add');
  const name=result?.[0];if(!name)return;
  const i=(DB.worlds||[]).findIndex(w=>w.id===worldId);if(i<0)return;
  if(!DB.worlds[i].tabs)DB.worlds[i].tabs=[];
  DB.worlds[i].tabs.push({id:'tab'+Date.now(),name});
  save('worlds');
  _renderDomainModulesList(worldId);
  if(currentView===worldId)renderDomainGenericView(worldId);
}
function renameDomainTab(worldId,tabId,newName){
  const i=(DB.worlds||[]).findIndex(w=>w.id===worldId);if(i<0)return;
  const tab=(DB.worlds[i].tabs||[]).find(t=>t.id===tabId);if(!tab)return;
  tab.name=newName||tab.name;
  save('worlds');
  if(currentView===worldId)renderDomainGenericView(worldId);
}
async function deleteDomainTab(worldId,tabId){
  if(!await jelixConfirm('Delete this tab? Modules assigned to it will show as "No tab".','Delete'))return;
  const i=(DB.worlds||[]).findIndex(w=>w.id===worldId);if(i<0)return;
  DB.worlds[i].tabs=(DB.worlds[i].tabs||[]).filter(t=>t.id!==tabId);
  if(DB.worlds[i].moduleTabs){
    Object.keys(DB.worlds[i].moduleTabs).forEach(mid=>{if(DB.worlds[i].moduleTabs[mid]===tabId)delete DB.worlds[i].moduleTabs[mid];});
  }
  save('worlds');
  if(_activeDomainTab[worldId]===tabId)_activeDomainTab[worldId]='all';
  _renderDomainModulesList(worldId);
  if(currentView===worldId)renderDomainGenericView(worldId);
}
function assignModuleToTab(worldId,moduleId,tabId){
  const i=(DB.worlds||[]).findIndex(w=>w.id===worldId);if(i<0)return;
  if(!DB.worlds[i].moduleTabs)DB.worlds[i].moduleTabs={};
  if(tabId)DB.worlds[i].moduleTabs[moduleId]=tabId;
  else delete DB.worlds[i].moduleTabs[moduleId];
  save('worlds');
  if(currentView===worldId)renderDomainGenericView(worldId);
}
// ═══════════════════════════════════════════════════════════════════════════
// SMOOTH REORDER — FLIP technique (First-Last-Invert-Play), the same
// approach real drag-and-drop libraries use for that "slides into place"
// feel. No animation library needed: capture where things are, let the
// reorder happen instantly, then animate from old position to new.
