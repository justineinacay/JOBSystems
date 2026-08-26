(() => {
  let captureType='Task';

  const escapeValue=(value)=>typeof escapeHtml==='function'?escapeHtml(String(value??'')):String(value??'').replace(/[&<>"']/g,(character)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[character]);

  window.setMobileCaptureType=(type,button)=>{
    captureType=type;
    document.querySelectorAll('.mobile-capture-types button').forEach(item=>item.classList.toggle('active',item===button));
  };

  window.renderMobileCaptureView=()=>{
    const worldSelect=document.getElementById('mobileCaptureWorld');
    if(worldSelect){
      const selected=worldSelect.value;
      const sourceOptions=Array.from(document.querySelectorAll('#cap-world option')).map(option=>({value:option.value,label:option.textContent.trim()}));
      const options=sourceOptions.length?sourceOptions:(DB.worlds||[]).map(world=>({value:world.id,label:world.label||world.name||world.id}));
      if(!options.length)options.push({value:'LIFE',label:'Personal'});
      worldSelect.innerHTML=options.map(option=>`<option value="${escapeValue(option.value)}">${escapeValue(option.label)}</option>`).join('');
      if(options.some(option=>option.value===selected))worldSelect.value=selected;
    }

    const recent=document.getElementById('mobileRecentCaptures');
    if(!recent)return;
    const iconByType={Task:'ti-checkbox',Idea:'ti-bulb',Decision:'ti-scale',Reference:'ti-paperclip',Insight:'ti-sparkles'};
    const items=(DB.captures||[]).slice(0,5);
    recent.innerHTML=items.length?items.map(capture=>`<div class="mobile-capture-row">
      <i class="ti ${iconByType[capture.type]||'ti-bulb'}"></i>
      <div><strong>${escapeValue(capture.content||'Untitled capture')}</strong><small>${escapeValue(capture.type||'Idea')} · ${escapeValue(capture.world||'Inbox')} · ${escapeValue(capture.status||'inbox')}</small></div>
      <button type="button" onclick="processCapture(${JSON.stringify(capture.id)});renderMobileCaptureView()" aria-label="Process capture"><i class="ti ti-arrow-right"></i></button>
    </div>`).join(''):'<div class="mobile-capture-empty"><div><i class="ti ti-circle-check"></i><br>Your capture inbox is clear.</div></div>';
  };

  window.saveMobileCapture=()=>{
    const input=document.getElementById('mobileCaptureInput');
    const content=input?.value.trim();
    if(!content){showToast('Please write something to capture.');input?.focus();return;}
    const world=document.getElementById('mobileCaptureWorld')?.value||'LIFE';
    const capture={id:Date.now(),content,type:captureType,world,notes:'Mobile capture',status:'inbox',date:localDateStr(new Date()),time:new Date().toISOString()};
    DB.captures.unshift(capture);
    save('captures');
    try{SB.upsert('captures',capture,'captures');}catch(error){}
    try{addHistory('add','Capture: '+content.substring(0,40),{...capture,_dbKey:'captures'});}catch(error){}
    input.value='';
    renderMobileCaptureView();
    if(typeof renderCaptureView==='function')renderCaptureView();
    showToast('Captured to '+world+'.');
  };

  const originalRenderReview=window.renderReviewView;
  if(typeof originalRenderReview==='function'){
    window.renderReviewView=function(){
      originalRenderReview.apply(this,arguments);
      const complete=document.querySelector('.review-page-complete');
      if(complete&&window.innerWidth<=768)complete.innerHTML='<i class="ti ti-check"></i> Done';
    };
  }

  const keepBottomNavState=()=>{
    if(window.innerWidth>768)return;
    const nav=document.getElementById('mobileBottomNav');
    if(!nav)return;
    nav.querySelectorAll('.mbn-tab,.mbn-center').forEach(item=>{
      item.removeAttribute('style');
      item.classList.remove('active');
    });
    const map={dashboard:'mbt-dashboard',tasks:'mbt-tasks',calendar:'mbt-calendar',settings:'mbt-settings','worlds-settings':'mbt-workspaces'};
    const target=document.getElementById(map[currentView]||'mbt-workspaces');
    target?.classList.add('active');
  };

  const originalSync=window.syncMobileNavActive;
  window.syncMobileNavActive=function(view){
    if(window.innerWidth>768&&typeof originalSync==='function')return originalSync(view);
    const nav=document.getElementById('mobileBottomNav');
    if(!nav)return;
    const map={dashboard:'mbt-dashboard',tasks:'mbt-tasks',calendar:'mbt-calendar',settings:'mbt-settings','worlds-settings':'mbt-workspaces'};
    nav.querySelectorAll('.mbn-tab,.mbn-center').forEach(item=>{
      item.removeAttribute('style');
      item.classList.remove('active');
    });
    document.getElementById(map[view]||'mbt-workspaces')?.classList.add('active');
  };

  document.addEventListener('DOMContentLoaded',()=>{
    renderMobileCaptureView();
    keepBottomNavState();
  });
  window.addEventListener('resize',keepBottomNavState,{passive:true});
})();
