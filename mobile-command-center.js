(() => {
  let captureType='Task';
  let mobileFinanceRangeDays=7;

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

  window.setMobileFinanceRange=(value)=>{
    const next=Number(value);
    mobileFinanceRangeDays=[7,14,30].includes(next)?next:7;
    renderMobileFinances();
  };

  window.openMobileFinanceDetail=(tab)=>{
    setView('life');
    requestAnimationFrame(()=>{
      if(typeof lifeSetDetail==='function')lifeSetDetail(tab||'overview');
      else if(typeof setCFTab==='function')setCFTab(tab||'overview',null);
    });
  };

  window.openMobileSettingsSection=(section)=>{
    setView('settings');
    if(section!=='integrations')return;
    requestAnimationFrame(()=>{
      const target=document.getElementById('settingsGoogleWorkspaceCard')||document.getElementById('settingsAiIntegrationsCard');
      target?.scrollIntoView({behavior:'smooth',block:'start'});
    });
  };

  window.renderMobileFinances=()=>{
    const body=document.getElementById('mobileFinanceBody');
    if(!body)return;
    const now=new Date();
    const today=typeof localDateStr==='function'?localDateStr(now):now.toISOString().slice(0,10);
    const dates=Array.from({length:mobileFinanceRangeDays},(_,index)=>{
      const date=new Date(now);
      date.setDate(now.getDate()-((mobileFinanceRangeDays-1)-index));
      return date;
    });
    const start=typeof localDateStr==='function'?localDateStr(dates[0]):dates[0].toISOString().slice(0,10);
    const transactions=(DB.cashflow||[]).filter(item=>item.date>=start&&item.date<=today);
    const income=transactions.filter(item=>item.type==='Debit').reduce((sum,item)=>sum+(Number(item.amount)||0),0);
    const expenses=transactions.filter(item=>item.type==='Credit'||item.type==='Payment').reduce((sum,item)=>sum+(Number(item.amount)||0),0);
    const names=typeof getAccountNames==='function'?getAccountNames():[];
    const fallback=(DB.cashflow||[]).reduce((sum,item)=>sum+(item.type==='Debit'?(Number(item.amount)||0):-(Number(item.amount)||0)),0);
    const balance=names.length&&typeof getTotalPortfolioBalance==='function'?getTotalPortfolioBalance():fallback;
    const dailyNet=dates.map(date=>{
      const key=typeof localDateStr==='function'?localDateStr(date):date.toISOString().slice(0,10);
      return (DB.cashflow||[]).filter(item=>item.date===key).reduce((sum,item)=>sum+(item.type==='Debit'?(Number(item.amount)||0):-(Number(item.amount)||0)),0);
    });
    const chartMax=Math.max(...dailyNet.map(value=>Math.abs(value)),1);
    const money=value=>'₱'+Math.abs(Number(value)||0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});
    const signed=value=>(Number(value)<0?'−':Number(value)>0?'+':'')+money(value);
    const accountRows=names.slice(0,4).map((name,index)=>{
      const accountBalance=typeof getAccountBalance==='function'?getAccountBalance(name):0;
      return `<button type="button" class="mobile-finance-row" onclick="openMobileFinanceDetail('accounts')"><span class="mobile-account-mark tone-${index%4}"><i class="ti ti-wallet"></i></span><span><strong>${escapeValue(name)}</strong><small>Account balance</small></span><em class="${accountBalance<0?'is-expense':'is-income'}">${signed(accountBalance)}</em><i class="ti ti-chevron-right"></i></button>`;
    }).join('');
    const recent=(DB.cashflow||[]).slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,4);
    const recentRows=recent.map(item=>{
      const isIncome=item.type==='Debit';
      return `<button type="button" class="mobile-finance-row" onclick="editCash(${escapeValue(JSON.stringify(item.id))})"><span class="mobile-transaction-mark ${isIncome?'is-income':'is-expense'}"><i class="ti ti-${isIncome?'arrow-down-left':'arrow-up-right'}"></i></span><span><strong>${escapeValue(item.desc||item.description||'Transaction')}</strong><small>${escapeValue(item.account||'Cash')} · ${escapeValue(item.date||'No date')}</small></span><em class="${isIncome?'is-income':'is-expense'}">${isIncome?'+':'−'}${money(item.amount)}</em><i class="ti ti-chevron-right"></i></button>`;
    }).join('');
    const incomeCount=transactions.filter(item=>item.type==='Debit').length;
    const expenseCount=transactions.filter(item=>item.type==='Credit'||item.type==='Payment').length;
    body.innerHTML=`
      <button type="button" class="mobile-balance-card" onclick="openMobileFinanceDetail('overview')"><span>Available balance</span><strong class="${balance<0?'is-expense':''}">${signed(balance)}</strong><small>${names.length} account${names.length===1?'':'s'} connected</small><i class="ti ti-chevron-right"></i></button>
      <div class="mobile-finance-metrics">
        <button type="button" onclick="openMobileFinanceDetail('transactions')"><span>Income</span><strong class="is-income">+${money(income)}</strong><small>${incomeCount} source${incomeCount===1?'':'s'}</small></button>
        <button type="button" onclick="openMobileFinanceDetail('transactions')"><span>Expenses</span><strong class="is-expense">−${money(expenses)}</strong><small>${expenseCount} transaction${expenseCount===1?'':'s'}</small></button>
      </div>
      <section class="mobile-cashflow-card">
        <div class="mobile-finance-section-head"><div><span>Cash flow</span><strong>Daily movement</strong></div><label><span class="sr-only">Cash-flow period</span><select onchange="setMobileFinanceRange(this.value)"><option value="7"${mobileFinanceRangeDays===7?' selected':''}>7 days</option><option value="14"${mobileFinanceRangeDays===14?' selected':''}>14 days</option><option value="30"${mobileFinanceRangeDays===30?' selected':''}>30 days</option></select></label></div>
        <div class="mobile-cashflow-chart" style="--finance-days:${mobileFinanceRangeDays}">${dailyNet.map((value,index)=>`<span title="${escapeValue(dates[index].toLocaleDateString('en-PH',{month:'short',day:'numeric'}))}: ${signed(value)}"><i class="${value<0?'is-expense':index===dailyNet.length-1?'is-today':''}" style="height:${Math.max(7,Math.round(Math.abs(value)/chartMax*72))}px"></i><small>${mobileFinanceRangeDays===7?dates[index].toLocaleDateString('en-PH',{weekday:'short'}).slice(0,1):(index%5===0||index===dailyNet.length-1?dates[index].getDate():'')}</small></span>`).join('')}</div>
      </section>
      <section class="mobile-finance-list-card"><div class="mobile-finance-section-head"><div><span>Accounts</span><strong>Where your money sits</strong></div><button type="button" onclick="openMobileFinanceDetail('accounts')">Manage</button></div>${accountRows||'<button type="button" class="mobile-finance-empty" onclick="openMobileFinanceDetail(\'accounts\')"><i class="ti ti-wallet-plus"></i><span>Add your first account</span></button>'}</section>
      <section class="mobile-finance-list-card"><div class="mobile-finance-section-head"><div><span>Recent activity</span><strong>Latest transactions</strong></div><button type="button" onclick="openMobileFinanceDetail('transactions')">View all</button></div>${recentRows||'<button type="button" class="mobile-finance-empty" onclick="openCashModal(\'Credit\')"><i class="ti ti-receipt"></i><span>Add your first transaction</span></button>'}</section>`;
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
    const map={dashboard:'mbt-dashboard',tasks:'mbt-tasks',calendar:'mbt-calendar',finances:'mbt-finances',settings:'mbt-workspaces',memory:'mbt-workspaces',notes:'mbt-workspaces',inbox:'mbt-workspaces','all-files':'mbt-workspaces','jarvis-context':'mbt-workspaces','worlds-settings':'mbt-workspaces'};
    const target=document.getElementById(map[currentView]||'mbt-workspaces');
    target?.classList.add('active');
  };

  const originalSync=window.syncMobileNavActive;
  window.syncMobileNavActive=function(view){
    if(window.innerWidth>768&&typeof originalSync==='function')return originalSync(view);
    const nav=document.getElementById('mobileBottomNav');
    if(!nav)return;
    const map={dashboard:'mbt-dashboard',tasks:'mbt-tasks',calendar:'mbt-calendar',finances:'mbt-finances',settings:'mbt-workspaces',memory:'mbt-workspaces',notes:'mbt-workspaces',inbox:'mbt-workspaces','all-files':'mbt-workspaces','jarvis-context':'mbt-workspaces','worlds-settings':'mbt-workspaces'};
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
