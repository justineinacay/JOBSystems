(function(){
  'use strict';

  var state={
    section:localStorage.getItem('j-life-hub-section')||'today',
    money:localStorage.getItem('j-life-money-section')||'overview',
    home:localStorage.getItem('j-life-home-section')||'billtracker'
  };
  var initialized=false;
  var applyingSection=false;
  var lifeTrendChart=null;

  function safe(value){
    return String(value==null?'':value).replace(/[&<>'"]/g,function(char){
      return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char];
    });
  }

  function todayString(){
    return typeof localDateStr==='function'?localDateStr(new Date()):new Date().toISOString().slice(0,10);
  }

  function php(value){
    var amount=Number(value)||0;
    return '₱'+Math.abs(amount).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});
  }

  function signedPHP(value){
    var amount=Number(value)||0;
    return (amount>0?'+':amount<0?'−':'')+php(amount);
  }

  function dateLabel(value,options){
    if(!value)return'—';
    var date=new Date(value.length===10?value+'T00:00:00':value);
    if(isNaN(date.getTime()))return value;
    return date.toLocaleDateString('en-PH',options||{month:'short',day:'numeric'});
  }

  function lifeReviewWeek(){
    var today=new Date(todayString()+'T00:00:00');
    var start=new Date(today);
    start.setDate(today.getDate()-((today.getDay()+6)%7));
    var end=new Date(start);
    end.setDate(start.getDate()+6);
    var key=typeof localDateStr==='function'?localDateStr(start):start.toISOString().slice(0,10);
    var startLabel=start.toLocaleDateString('en-PH',{month:'short',day:'numeric'});
    var endLabel=end.toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'});
    return {key:key,label:startLabel+' – '+endLabel};
  }

  function getLifeReviewData(defaults){
    var week=lifeReviewWeek();
    var data={steps:{money:false,wellbeing:false,admin:false,priorities:false},reflections:{worked:'',attention:'',next:''},completedAt:null};
    try{
      var stored=JSON.parse(localStorage.getItem('j-life-weekly-review-'+week.key)||'null');
      if(stored){
        data.steps=Object.assign(data.steps,stored.steps||{});
        data.reflections=Object.assign(data.reflections,stored.reflections||{});
        data.completedAt=stored.completedAt||null;
      }else if(defaults){
        data.steps.wellbeing=!!defaults.checked;
        data.steps.admin=defaults.overdueBills===0;
      }
    }catch(error){}
    return data;
  }

  function saveLifeReviewData(data){
    localStorage.setItem('j-life-weekly-review-'+lifeReviewWeek().key,JSON.stringify(data));
  }

  function isExpense(transaction){
    return typeof isLifeExpenseTransaction==='function'?isLifeExpenseTransaction(transaction):transaction&&(transaction.type==='Credit'||transaction.type==='Payment');
  }

  function isLifeTask(task){
    return String(task&&task.world||'').toLowerCase()==='life';
  }

  function isLifeEvent(event){
    var tags=[event&&event.type,event&&event.world,event&&event.worldId,event&&event.world_id];
    return tags.some(function(value){return String(value||'').toLowerCase()==='life';});
  }

  function latestHealthLog(keywords){
    var logs=typeof getHealthLogs==='function'?getHealthLogs().slice():[];
    logs.sort(function(a,b){return String(b.date||'').localeCompare(String(a.date||''))||Number(b.id||0)-Number(a.id||0);});
    return logs.find(function(log){
      var metric=String(log.metric||'').toLowerCase();
      return keywords.some(function(keyword){return metric.indexOf(keyword)>=0;});
    })||null;
  }

  function metricCard(icon,label,value,note,tone,action){
    return '<button class="life-metric-card '+(tone||'')+'"'+(action?' onclick="'+action+'"':'')+'>'+ 
      '<span class="life-metric-icon"><i class="ti '+icon+'"></i></span>'+ 
      '<span class="life-metric-copy"><small>'+safe(label)+'</small><strong>'+safe(value)+'</strong><em>'+safe(note)+'</em></span>'+ 
      '<i class="ti ti-chevron-right life-metric-arrow"></i>'+ 
    '</button>';
  }

  function panelTitle(eyebrow,title,actionLabel,action){
    return '<div class="life-panel-title"><div><small>'+safe(eyebrow)+'</small><h2>'+safe(title)+'</h2></div>'+ 
      (actionLabel?'<button onclick="'+action+'">'+safe(actionLabel)+'<i class="ti ti-arrow-up-right"></i></button>':'')+'</div>';
  }

  function placeLifeTimer(){
    var view=document.getElementById('view-life');
    var header=view&&view.querySelector('.vh');
    if(!header)return;
    var timer=document.getElementById('domainTimer-life');
    if(typeof renderDomainTimerCard==='function'){
      renderDomainTimerCard('life');
      timer=document.getElementById('domainTimer-life');
    }else if(!timer&&typeof mountDomainTimer==='function'){
      mountDomainTimer('life');
      timer=document.getElementById('domainTimer-life');
    }
    var actions=header.querySelector('.life-header-actions');
    if(timer&&actions&&timer.parentNode!==header)header.insertBefore(timer,actions);
  }

  function initialize(){
    if(initialized)return;
    var view=document.getElementById('view-life');
    if(!view)return;
    initialized=true;
    view.classList.add('life-command-center');

    var header=view.querySelector('.vh');
    var title=header&&header.querySelector('.vt');
    var subtitle=header&&header.querySelector('.vs');
    if(title)title.innerHTML='<i class="ti ti-leaf"></i>LIFE';
    if(subtitle)subtitle.textContent='Money · Health · Fitness · Home · Personal growth';
    var legacyActions=header&&header.querySelector('.va');
    if(legacyActions)legacyActions.classList.add('life-legacy-actions');
    if(header&&!header.querySelector('.life-header-actions')){
      header.insertAdjacentHTML('beforeend','<div class="life-header-actions">'+
        '<button class="life-review-button" onclick="lifeSetSection(\'review\')"><i class="ti ti-checklist"></i><span>Weekly review</span></button>'+ 
        '<div class="life-add-wrap"><button class="life-add-button" onclick="toggleLifeAddMenu(event)"><i class="ti ti-plus"></i><span>Add</span><i class="ti ti-chevron-down"></i></button>'+ 
          '<div class="life-add-menu" id="lifeAddMenu">'+ 
            '<button onclick="lifeTriggerAction(\'income\')"><i class="ti ti-arrow-down-left"></i><span><b>Money in</b><small>Income or received funds</small></span></button>'+ 
            '<button onclick="lifeTriggerAction(\'expense\')"><i class="ti ti-arrow-up-right"></i><span><b>Money out</b><small>Expense or payment</small></span></button>'+ 
            '<button onclick="lifeTriggerAction(\'transfer\')"><i class="ti ti-arrows-exchange"></i><span><b>Transfer</b><small>Move money between accounts</small></span></button>'+ 
            '<button onclick="lifeTriggerAction(\'health\')"><i class="ti ti-heart-plus"></i><span><b>Health entry</b><small>Log a personal health metric</small></span></button>'+ 
            '<button onclick="lifeTriggerAction(\'bill\')"><i class="ti ti-receipt"></i><span><b>Bill</b><small>Add an obligation or reminder</small></span></button>'+ 
          '</div></div></div>');
    }
    placeLifeTimer();

    var body=view.querySelector('.vb');
    if(!body)return;
    body.classList.add('life-page-scroll');
    var legacyTabs=body.querySelector('.cftab');
    if(legacyTabs)legacyTabs.classList.add('life-legacy-tabs');
    var legacyContent=Array.prototype.find.call(body.children,function(child){return child!==legacyTabs;});
    if(legacyContent)legacyContent.classList.add('life-content');

    if(!body.querySelector('.life-primary-nav')){
      var navigation=document.createElement('nav');
      navigation.className='life-primary-nav';
      navigation.setAttribute('aria-label','Life workspace');
      navigation.innerHTML=[
        ['today','ti-layout-dashboard','Today'],
        ['money','ti-wallet','Money'],
        ['health','ti-heartbeat','Health'],
        ['fitness','ti-barbell','Fitness'],
        ['home','ti-home','Home & Admin'],
        ['review','ti-checklist','Review']
      ].map(function(item){return '<button data-life-section="'+item[0]+'" onclick="lifeSetSection(\''+item[0]+'\')"><i class="ti '+item[1]+'"></i><span>'+item[2]+'</span></button>';}).join('');
      body.insertBefore(navigation,legacyTabs||body.firstChild);
      var secondary=document.createElement('nav');
      secondary.className='life-secondary-nav';
      secondary.id='lifeSecondaryNav';
      secondary.setAttribute('aria-label','Life section details');
      body.insertBefore(secondary,legacyTabs||navigation.nextSibling);
    }

    if(legacyContent&&!document.getElementById('life-today-dashboard')){
      var today=document.createElement('section');
      today.id='life-today-dashboard';
      today.className='life-custom-panel';
      today.innerHTML='<div id="lifeTodayContent"></div>';
      legacyContent.insertBefore(today,legacyContent.firstChild);
      var review=document.createElement('section');
      review.id='life-review-dashboard';
      review.className='life-custom-panel';
      review.innerHTML='<div id="lifeReviewContent"></div>';
      legacyContent.insertBefore(review,today.nextSibling);
      var fitness=document.createElement('section');
      fitness.id='life-fitness-dashboard';
      fitness.className='life-custom-panel';
      fitness.innerHTML='<div id="lifeFitnessContent"></div>';
      legacyContent.insertBefore(fitness,review.nextSibling);
    }

    document.addEventListener('click',function(event){
      var menu=document.getElementById('lifeAddMenu');
      if(menu&&!event.target.closest('.life-add-wrap'))menu.classList.remove('is-open');
    });

    wrapExistingFunctions();
    renderLifeCommandCenter();
    applySection(true);
    placeLifeTimer();
  }

  function wrapExistingFunctions(){
    if(typeof window.renderLife==='function'&&!window._lifeCommandRenderWrapped){
      var originalRenderLife=window.renderLife;
      window.renderLife=function(){
        var result=originalRenderLife.apply(this,arguments);
        if(initialized){placeLifeTimer();renderLifeCommandCenter();applySection(false);}
        return result;
      };
      window._lifeCommandRenderWrapped=true;
    }
    if(typeof window.setCFTab==='function'&&!window._lifeCommandTabsWrapped){
      var originalSetCFTab=window.setCFTab;
      window.setCFTab=function(tab,button){
        var result=originalSetCFTab.apply(this,arguments);
        if(initialized&&!applyingSection){
          if(tab==='biomonitor')state.section='health';
          else if(tab==='billtracker'||tab==='property'){state.section='home';state.home=tab;}
          else{state.section='money';state.money=tab;}
          applySection(false);
        }
        return result;
      };
      window._lifeCommandTabsWrapped=true;
    }
  }

  function legacyButton(tab){
    var tabs=['overview','transactions','budget','accounts','property','loans','billtracker','biomonitor'];
    var index=tabs.indexOf(tab);
    return index>=0?document.querySelectorAll('#view-life .life-legacy-tabs .cfbt')[index]:null;
  }

  function setLegacyTab(tab){
    if(typeof window.setCFTab!=='function')return;
    applyingSection=true;
    window.setCFTab(tab,legacyButton(tab));
    applyingSection=false;
  }

  function hideLegacyPanels(){
    ['overview','transactions','budget','accounts','property','loans','billtracker','biomonitor'].forEach(function(tab){
      var panel=document.getElementById('cf-'+tab);if(panel)panel.style.display='none';
    });
  }

  function updatePrimaryNavigation(){
    var activeButton=null;
    document.querySelectorAll('#view-life [data-life-section]').forEach(function(button){
      var active=button.getAttribute('data-life-section')===state.section;
      button.classList.toggle('is-active',active);
      button.setAttribute('aria-current',active?'page':'false');
      if(active)activeButton=button;
    });
    var nav=activeButton&&activeButton.closest('.life-primary-nav');
    if(nav&&nav.scrollWidth>nav.clientWidth){
      requestAnimationFrame(function(){
        nav.scrollLeft=Math.max(0,activeButton.offsetLeft-(nav.clientWidth-activeButton.offsetWidth)/2);
      });
    }
  }

  function renderSecondaryNavigation(){
    var nav=document.getElementById('lifeSecondaryNav');if(!nav)return;
    var items=[];
    var active='';
    if(state.section==='money'){
      items=[['overview','Summary'],['transactions','Transactions'],['budget','Budget'],['accounts','Accounts'],['loans','Debt']];
      active=state.money;
    }else if(state.section==='home'){
      items=[['billtracker','Bills'],['property','Property & home']];
      active=state.home;
    }
    nav.innerHTML=items.map(function(item){
      return '<button class="'+(item[0]===active?'is-active':'')+'" onclick="lifeSetDetail(\''+item[0]+'\')">'+safe(item[1])+'</button>';
    }).join('');
    nav.hidden=!items.length;
  }

  function applySection(scrollTop){
    var today=document.getElementById('life-today-dashboard');
    var review=document.getElementById('life-review-dashboard');
    var fitness=document.getElementById('life-fitness-dashboard');
    if(!today||!review||!fitness)return;
    var view=document.getElementById('view-life');
    var body=view&&view.querySelector('.vb');
    if(scrollTop!==false&&body)body.scrollTop=0;
    updatePrimaryNavigation();
    renderSecondaryNavigation();
    today.hidden=state.section!=='today';
    review.hidden=state.section!=='review';
    fitness.hidden=state.section!=='fitness';
    hideLegacyPanels();

    if(state.section==='today'){
      setLegacyTab('overview');
      hideLegacyPanels();
      renderLifeToday();
    }else if(state.section==='review'){
      setLegacyTab('overview');
      hideLegacyPanels();
      renderLifeReview();
    }else if(state.section==='money'){
      setLegacyTab(state.money);
    }else if(state.section==='health'){
      setLegacyTab('biomonitor');
      if(typeof window.renderHealthGameDashboard==='function')window.renderHealthGameDashboard();
    }else if(state.section==='fitness'){
      setLegacyTab('overview');
      hideLegacyPanels();
      if(typeof window.renderFitnessCommandCenter==='function')window.renderFitnessCommandCenter();
    }else if(state.section==='home'){
      setLegacyTab(state.home);
    }

    localStorage.setItem('j-life-hub-section',state.section);
    localStorage.setItem('j-life-money-section',state.money);
    localStorage.setItem('j-life-home-section',state.home);
    if(scrollTop!==false&&body){
      body.scrollTop=0;
      requestAnimationFrame(function(){body.scrollTop=0;});
    }
  }

  function moneySnapshot(){
    var now=new Date();
    var ym=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
    var transactions=DB.cashflow||[];
    var month=transactions.filter(function(item){return String(item.date||'').indexOf(ym)===0;});
    var income=month.filter(function(item){return item.type==='Debit';}).reduce(function(sum,item){return sum+(Number(item.amount)||0);},0);
    var expenses=month.filter(isExpense).reduce(function(sum,item){return sum+(Number(item.amount)||0);},0);
    var available=typeof getTotalPortfolioBalance==='function'?getTotalPortfolioBalance():income-expenses;
    var debt=(DB.loans||[]).reduce(function(sum,loan){return sum+(Number(loan.remaining!=null?loan.remaining:loan.principal)||0);},0);
    var budgets=typeof getBudgets==='function'?getBudgets():{};
    var budget=Object.keys(budgets).reduce(function(sum,key){return sum+(Number(budgets[key].limit)||0);},0);
    var unpaid=(DB.bills||[]).filter(function(bill){return bill.status!=='paid';});
    var inThirty=new Date();inThirty.setDate(inThirty.getDate()+30);
    var cutoff=todayString();
    var cutoff30=typeof localDateStr==='function'?localDateStr(inThirty):inThirty.toISOString().slice(0,10);
    var upcomingBills=unpaid.filter(function(bill){return bill.dueDate>=cutoff&&bill.dueDate<=cutoff30;});
    var obligations=upcomingBills.reduce(function(sum,bill){return sum+(Number(bill.amount)||0);},0);
    return {ym:ym,income:income,expenses:expenses,net:income-expenses,available:available,debt:debt,budget:budget,unpaid:unpaid,upcomingBills:upcomingBills,obligations:obligations,afterBills:available-obligations};
  }

  function focusTask(){
    var today=todayString();
    return (DB.tasks||[]).filter(function(task){return isLifeTask(task)&&task.status!=='Done';}).sort(function(a,b){
      var aOver=a.due&&a.due<today?0:1,bOver=b.due&&b.due<today?0:1;
      if(aOver!==bOver)return aOver-bOver;
      var priorities={High:0,Medium:1,Low:2};
      var ap=priorities[a.priority]==null?3:priorities[a.priority];
      var bp=priorities[b.priority]==null?3:priorities[b.priority];
      if(ap!==bp)return ap-bp;
      return String(a.due||'9999').localeCompare(String(b.due||'9999'));
    })[0]||null;
  }

  function renderLifeToday(){
    var mount=document.getElementById('lifeTodayContent');if(!mount)return;
    var snapshot=moneySnapshot();
    var task=focusTask();
    var wellness=typeof getWellness==='function'?getWellness():{};
    var todayData=wellness[todayString()]||{};
    var sleep=latestHealthLog(['sleep']);
    var steps=latestHealthLog(['steps','step count']);
    var moodLabels={1:'Low',2:'Heavy',3:'Steady',4:'Good',5:'Great'};
    var wellbeing=todayData.mood||todayData.energy||todayData.stress||todayData.water?'Checked in':'Pending';
    var budgetPct=snapshot.budget>0?Math.min(100,Math.round(snapshot.expenses/snapshot.budget*100)):0;
    var tasks=(DB.tasks||[]).filter(function(item){return isLifeTask(item)&&item.status!=='Done';}).sort(function(a,b){return String(a.due||'9999').localeCompare(String(b.due||'9999'));}).slice(0,4);
    var bills=snapshot.unpaid.slice().sort(function(a,b){return String(a.dueDate||'9999').localeCompare(String(b.dueDate||'9999'));}).slice(0,4);
    var events=(DB.calEvents||[]).filter(function(event){return isLifeEvent(event)&&event.date>=todayString();}).sort(function(a,b){return String(a.date||'').localeCompare(String(b.date||''));}).slice(0,4);
    var propertyCount=(DB.propertyTransactions||[]).length;

    mount.innerHTML='<section class="life-focus-card">'+
      '<div><small>Today focus</small><h1>'+safe(task?task.title:'Choose one personal commitment that reduces pressure.')+'</h1><p>'+safe(task?(task.due?'Due '+dateLabel(task.due,{weekday:'short',month:'short',day:'numeric'}):'A clear next action for your Life workspace.'):'Your money, wellbeing, and home admin stay calm when one useful action moves first.')+'</p></div>'+ 
      '<div class="life-focus-actions">'+(task?'<button onclick="editTask('+task.id+')"><i class="ti ti-target-arrow"></i>Open focus</button>':'<button onclick="lifeOpenTasks()"><i class="ti ti-plus"></i>Add priority</button>')+'<button class="secondary" onclick="lifeAskJelix()"><i class="ti ti-sparkles"></i>Ask J.E.L.I.X</button></div>'+ 
    '</section>'+ 
    '<section class="life-metric-grid">'+
      metricCard('ti-wallet','Available balance',signedPHP(snapshot.available),'Across '+(typeof getAccountNames==='function'?getAccountNames().length:0)+' accounts','tone-green',"lifeSetSection('money')")+
      metricCard('ti-chart-line','Net this month',signedPHP(snapshot.net),snapshot.net>=0?'Current surplus':'Current deficit',snapshot.net>=0?'tone-green':'tone-red',"lifeSetSection('money')")+
      metricCard('ti-building-bank','Debt remaining',php(snapshot.debt),(DB.loans||[]).filter(function(loan){return Number(loan.remaining!=null?loan.remaining:loan.principal)>0;}).length+' active loans','tone-red',"lifeSetDetail('loans')")+
      metricCard('ti-heart-check','Wellbeing check-in',wellbeing,todayData.mood?'Mood: '+(moodLabels[todayData.mood]||todayData.mood):'A private daily pulse','tone-blue',"lifeSetSection('health')")+
    '</section>'+ 
    '<section class="life-dual-grid">'+
      '<article class="life-panel">'+panelTitle('Money plan','Know what is safe before spending','Open Money',"lifeSetSection('money')")+
        '<div class="life-money-hero"><small>Available after next 30-day bills</small><strong class="'+(snapshot.afterBills>=0?'positive':'negative')+'">'+signedPHP(snapshot.afterBills)+'</strong><p>'+php(snapshot.obligations)+' in upcoming obligations</p></div>'+ 
        '<div class="life-budget-row"><span><b>Monthly budget</b><small>'+(snapshot.budget?php(snapshot.expenses)+' of '+php(snapshot.budget):'No category limits set yet')+'</small></span><em>'+budgetPct+'%</em></div>'+ 
        '<div class="life-progress"><i style="width:'+budgetPct+'%"></i></div>'+ 
        '<div class="life-mini-list">'+(snapshot.upcomingBills.length?snapshot.upcomingBills.slice(0,3).map(function(bill){return '<button onclick="lifeSetSection(\'home\')"><span><i class="ti ti-receipt"></i><b>'+safe(bill.name)+'</b><small>'+dateLabel(bill.dueDate)+'</small></span><strong>'+php(bill.amount)+'</strong></button>';}).join(''):'<div class="life-empty-inline"><i class="ti ti-circle-check"></i>No bills due in the next 30 days.</div>')+'</div>'+ 
      '</article>'+ 
      '<article class="life-panel life-chart-panel">'+panelTitle('Financial trend','Income and expenses over six months','Full financial insights',"lifeSetSection('money')")+
        '<div class="life-chart-summary"><span><small>This month income</small><strong>'+php(snapshot.income)+'</strong></span><span><small>This month expenses</small><strong class="negative">'+php(snapshot.expenses)+'</strong></span></div>'+ 
        '<div class="life-chart-wrap"><canvas id="lifeFinancialTrendChart"></canvas></div>'+ 
      '</article>'+ 
    '</section>'+ 
    '<section class="life-lower-grid">'+
      '<article class="life-panel">'+panelTitle('Personal priorities','Your next useful Life actions','View tasks','lifeOpenTasks()')+
        '<div class="life-action-list">'+(tasks.length?tasks.map(function(item){return '<button onclick="editTask('+item.id+')"><i class="ti '+(item.priority==='High'?'ti-alert-circle':'ti-circle')+'"></i><span><b>'+safe(item.title)+'</b><small>'+(item.due?dateLabel(item.due,{weekday:'short',month:'short',day:'numeric'}):'No due date')+'</small></span><em>'+safe(item.priority||'Normal')+'</em></button>';}).join(''):'<div class="life-empty"><i class="ti ti-circle-check"></i><b>No open Life tasks</b><span>Add only what genuinely needs your attention.</span></div>')+'</div>'+ 
      '</article>'+ 
      '<article class="life-panel">'+panelTitle('Home & admin','Bills, property, and household records','Open Home',"lifeSetSection('home')")+
        '<div class="life-home-links">'+
          '<button onclick="lifeSetDetail(\'billtracker\')"><i class="ti ti-receipt"></i><span><b>Bills</b><small>'+snapshot.unpaid.length+' unpaid</small></span><em>'+php(snapshot.unpaid.reduce(function(sum,bill){return sum+(Number(bill.amount)||0);},0))+'</em></button>'+ 
          '<button onclick="lifeSetDetail(\'property\')"><i class="ti ti-home-dollar"></i><span><b>Property</b><small>Rental and home records</small></span><em>'+propertyCount+' entries</em></button>'+ 
          '<button onclick="lifeTriggerAction(\'bill\')"><i class="ti ti-calendar-dollar"></i><span><b>Add an obligation</b><small>Create a bill and calendar reminder</small></span><i class="ti ti-plus"></i></button>'+ 
        '</div>'+ 
      '</article>'+ 
      '<article class="life-panel">'+panelTitle('Upcoming','Personal dates and obligations','Open calendar',"setView('calendar')")+
        '<div class="life-upcoming-list">'+((events.length||bills.length)?events.map(function(event){return '<button onclick="openCalEventDetail('+event.id+')"><time>'+dateLabel(event.date,{month:'short',day:'numeric'})+'</time><span><b>'+safe(event.title)+'</b><small>'+safe(event.time||'All day')+'</small></span></button>';}).concat(bills.slice(0,Math.max(0,4-events.length)).map(function(bill){return '<button onclick="lifeSetDetail(\'billtracker\')"><time>'+dateLabel(bill.dueDate,{month:'short',day:'numeric'})+'</time><span><b>'+safe(bill.name)+'</b><small>Bill · '+php(bill.amount)+'</small></span></button>';})).join(''):'<div class="life-empty"><i class="ti ti-calendar-check"></i><b>No upcoming Life dates</b><span>Your personal calendar is clear.</span></div>')+'</div>'+ 
      '</article>'+ 
    '</section>'+ 
    '<section class="life-panel life-wellbeing-panel">'+panelTitle('Wellbeing today','A light check-in, not another dashboard','Open Health',"lifeSetSection('health')")+
      '<div class="life-wellbeing-grid">'+
        '<button onclick="quickLog(\'Sleep\')"><i class="ti ti-moon"></i><span><small>Sleep</small><strong>'+(sleep?safe(Number(sleep.value).toFixed(1))+' hrs':'Not logged')+'</strong></span></button>'+ 
        '<button onclick="lifeSetSection(\'health\')"><i class="ti ti-droplet"></i><span><small>Water</small><strong>'+safe(todayData.water||0)+' / 8</strong></span></button>'+ 
        '<button onclick="lifeSetSection(\'health\')"><i class="ti ti-mood-smile"></i><span><small>Mood</small><strong>'+safe(todayData.mood?moodLabels[todayData.mood]||todayData.mood:'Check in')+'</strong></span></button>'+ 
        '<button onclick="quickLog(\'Steps\')"><i class="ti ti-walk"></i><span><small>Movement</small><strong>'+(steps?safe(Math.round(steps.value).toLocaleString())+' steps':'Not logged')+'</strong></span></button>'+ 
      '</div>'+ 
      '<button class="life-wide-button" onclick="lifeSetSection(\'health\')"><i class="ti ti-heart-plus"></i>Complete today’s wellbeing check-in</button>'+ 
    '</section>'+ 
    '<section class="life-insight"><i class="ti ti-sparkles"></i><div><small>J.E.L.I.X insight</small><p>'+safe(snapshot.net<0?'Your expenses are currently higher than income. Review the largest category before adding another commitment.':snapshot.debt>0?'Your monthly position is positive. Protect the surplus and choose one debt payment to prioritize.':'Your personal systems are clear. Keep the next action small and sustainable.')+'</p></div><button onclick="lifeAskJelix()">Think this through<i class="ti ti-arrow-right"></i></button></section>';

    renderLifeTrendChart();
  }

  function renderLifeTrendChart(){
    var canvas=document.getElementById('lifeFinancialTrendChart');
    if(!canvas||typeof Chart==='undefined')return;
    var isLight=document.documentElement.dataset.theme==='light';
    var chartText=isLight?'#596159':'#a3aaa7';
    var chartGrid=isLight?'rgba(24,27,24,.09)':'rgba(255,255,255,.055)';
    var now=new Date(),labels=[],income=[],expenses=[];
    for(var i=5;i>=0;i--){
      var date=new Date(now.getFullYear(),now.getMonth()-i,1);
      var ym=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0');
      labels.push(date.toLocaleDateString('en-PH',{month:'short'}));
      var month=(DB.cashflow||[]).filter(function(item){return String(item.date||'').indexOf(ym)===0;});
      income.push(month.filter(function(item){return item.type==='Debit';}).reduce(function(sum,item){return sum+(Number(item.amount)||0);},0));
      expenses.push(month.filter(isExpense).reduce(function(sum,item){return sum+(Number(item.amount)||0);},0));
    }
    if(lifeTrendChart)lifeTrendChart.destroy();
    lifeTrendChart=new Chart(canvas,{type:'line',data:{labels:labels,datasets:[
      {label:'Income',data:income,borderColor:'#7fff00',backgroundColor:'rgba(127,255,0,.07)',fill:true,tension:.35,borderWidth:2,pointRadius:3,pointHoverRadius:5},
      {label:'Expenses',data:expenses,borderColor:'#ff5d78',backgroundColor:'rgba(255,93,120,.04)',fill:true,tension:.35,borderWidth:2,pointRadius:3,pointHoverRadius:5}
    ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{labels:{color:chartText,boxWidth:12,usePointStyle:true}},tooltip:{callbacks:{label:function(context){return context.dataset.label+': '+php(context.raw);}}}},scales:{x:{ticks:{color:chartText},grid:{display:false}},y:{ticks:{color:chartText,callback:function(value){return '₱'+Number(value).toLocaleString('en-PH');}},grid:{color:chartGrid}}}}});
  }

  function renderLifeReview(){
    var mount=document.getElementById('lifeReviewContent');if(!mount)return;
    var snapshot=moneySnapshot();
    var wellness=typeof getWellness==='function'?getWellness():{};
    var checked=!!wellness[todayString()];
    var overdueBills=snapshot.unpaid.filter(function(bill){return bill.dueDate<todayString();});
    var openTasks=(DB.tasks||[]).filter(function(task){return isLifeTask(task)&&task.status!=='Done';}).sort(function(a,b){
      var today=todayString();
      var aOver=a.due&&a.due<today?0:1,bOver=b.due&&b.due<today?0:1;
      if(aOver!==bOver)return aOver-bOver;
      var priority={High:0,Medium:1,Low:2};
      var ap=priority[a.priority]==null?3:priority[a.priority];
      var bp=priority[b.priority]==null?3:priority[b.priority];
      if(ap!==bp)return ap-bp;
      return String(a.due||'9999').localeCompare(String(b.due||'9999'));
    });
    var review=getLifeReviewData({checked:checked,overdueBills:overdueBills.length});
    var stepKeys=['money','wellbeing','admin','priorities'];
    var completedSteps=stepKeys.filter(function(key){return review.steps[key];}).length;
    var progress=Math.round(completedSteps/stepKeys.length*100);
    var week=lifeReviewWeek();
    var dueSoon=openTasks.filter(function(task){return task.due&&task.due<=todayString();}).length;
    var reflectionCount=Object.keys(review.reflections).filter(function(key){return String(review.reflections[key]||'').trim();}).length;
    var stepDefinitions=[
      ['money','ti-wallet','Review money','Confirm cash flow and obligations'],
      ['wellbeing','ti-heartbeat','Check wellbeing','Notice energy before planning'],
      ['admin','ti-home-check','Clear home admin','Resolve bills and household loops'],
      ['priorities','ti-target-arrow','Choose next actions','Carry forward only what matters']
    ];
    mount.innerHTML='<section class="life-review-command">'+
      '<div class="life-review-hero">'+
        '<div class="life-review-hero-copy"><small>Weekly review</small><h1>Close personal loops calmly.</h1><p>Review money, wellbeing, home admin, and next actions without turning your life into another job.</p><div class="life-review-period"><span><i class="ti ti-calendar-week"></i>'+safe(week.label)+'</span><span><i class="ti ti-notes"></i>'+reflectionCount+' of 3 reflections saved</span></div></div>'+ 
        '<div class="life-review-hero-actions"><div class="life-review-ring" style="--review-progress:'+progress+'"><div><strong>'+progress+'%</strong><small>complete</small></div></div><button onclick="lifeAskJelix()"><i class="ti ti-sparkles"></i>Review with J.E.L.I.X</button></div>'+ 
      '</div>'+ 
      '<div class="life-review-summary-grid">'+
        '<button class="life-review-summary-card" onclick="lifeSetSection(\'money\')"><span class="is-green"><i class="ti ti-wallet"></i></span><div><small>Money position</small><strong class="'+(snapshot.net>=0?'positive':'negative')+'">'+signedPHP(snapshot.net)+'</strong><p>'+php(snapshot.obligations)+' due in the next 30 days</p></div><i class="ti ti-chevron-right"></i></button>'+ 
        '<button class="life-review-summary-card" onclick="lifeSetSection(\'health\')"><span class="is-blue"><i class="ti ti-heartbeat"></i></span><div><small>Wellbeing</small><strong>'+(checked?'Checked in':'Needs a check-in')+'</strong><p>'+(checked?'Today’s personal pulse is recorded':'Take one minute before planning')+'</p></div><i class="ti ti-chevron-right"></i></button>'+ 
        '<button class="life-review-summary-card" onclick="lifeSetSection(\'home\')"><span class="'+(overdueBills.length?'is-red':'is-green')+'"><i class="ti ti-home-check"></i></span><div><small>Home & admin</small><strong>'+overdueBills.length+' overdue</strong><p>'+snapshot.unpaid.length+' bills remain open</p></div><i class="ti ti-chevron-right"></i></button>'+ 
      '</div>'+ 
      '<div class="life-review-workspace">'+
        '<section class="life-panel life-review-loops">'+
          '<div class="life-review-section-head"><div><small>Priority queue</small><h2>Open loops worth carrying forward</h2><p>'+dueSoon+' items are overdue or due today. Decide, schedule, or remove them.</p></div><button onclick="lifeOpenTasks()">View all<i class="ti ti-arrow-up-right"></i></button></div>'+ 
          '<div class="life-review-loop-list">'+(openTasks.length?openTasks.slice(0,8).map(function(task){
            var overdue=task.due&&task.due<todayString();
            var dueToday=task.due===todayString();
            var tone=overdue?'is-overdue':task.status==='Blocked'?'is-blocked':task.priority==='High'?'is-high':'';
            var status=overdue?'Overdue':dueToday?'Due today':task.status||task.priority||'Open';
            return '<button class="life-review-loop '+tone+'" onclick="editTask('+task.id+')"><span class="life-review-loop-check"><i class="ti ti-circle"></i></span><span class="life-review-loop-copy"><b>'+safe(task.title)+'</b><small>'+(task.due?dateLabel(task.due,{weekday:'short',month:'short',day:'numeric'}):'No due date')+' · '+safe(task.priority||'Normal')+'</small></span><em>'+safe(status)+'</em><i class="ti ti-chevron-right"></i></button>';
          }).join(''):'<div class="life-empty"><i class="ti ti-circle-check"></i><b>Life tasks are clear</b><span>Nothing needs to be carried into next week.</span></div>')+'</div>'+ 
        '</section>'+ 
        '<aside class="life-review-side">'+
          '<article class="life-panel life-review-reflection">'+
            '<div class="life-review-section-head"><div><small>Weekly reflection</small><h2>Pause before planning again</h2></div><span>'+reflectionCount+'/3</span></div>'+ 
            '<label><span>What worked this week?</span><textarea id="lifeReviewWorked" rows="2" placeholder="Name the routines, choices, or support that helped.">'+safe(review.reflections.worked)+'</textarea></label>'+ 
            '<label><span>What needs attention?</span><textarea id="lifeReviewAttention" rows="2" placeholder="Capture one pressure point without solving everything.">'+safe(review.reflections.attention)+'</textarea></label>'+ 
            '<label><span>What will matter next week?</span><textarea id="lifeReviewNext" rows="2" placeholder="Choose one direction worth protecting.">'+safe(review.reflections.next)+'</textarea></label>'+ 
            '<button class="life-review-save" onclick="lifeSaveReviewReflection()"><i class="ti ti-device-floppy"></i>Save reflection</button>'+ 
          '</article>'+ 
          '<article class="life-panel life-review-rhythm">'+
            '<div class="life-review-section-head"><div><small>Review rhythm</small><h2>Four calm decisions</h2></div><span>'+completedSteps+'/4</span></div>'+ 
            '<div class="life-review-steps">'+stepDefinitions.map(function(step){var done=!!review.steps[step[0]];return '<button class="'+(done?'is-complete':'')+'" onclick="lifeToggleReviewStep(\''+step[0]+'\')"><i class="ti '+(done?'ti-square-check-filled':'ti-square')+'"></i><span><b>'+step[2]+'</b><small>'+step[3]+'</small></span></button>';}).join('')+'</div>'+ 
            '<div class="life-review-progress"><span><i style="width:'+progress+'%"></i></span><strong>'+progress+'%</strong></div>'+ 
            '<button class="life-review-complete" onclick="lifeFinishWeeklyReview()"><i class="ti ti-check"></i>'+(review.completedAt?'Reviewed '+dateLabel(review.completedAt,{month:'short',day:'numeric'}):'Mark weekly review complete')+'</button>'+ 
          '</article>'+ 
        '</aside>'+ 
      '</div>'+ 
    '</section>';
  }

  function renderLifeCommandCenter(){
    if(!initialized)return;
    if(state.section==='today')renderLifeToday();
    if(state.section==='review')renderLifeReview();
    if(state.section==='health'&&typeof window.renderHealthGameDashboard==='function')window.renderHealthGameDashboard();
    if(state.section==='fitness'&&typeof window.renderFitnessCommandCenter==='function')window.renderFitnessCommandCenter();
  }

  window.lifeSetSection=function(section){
    if(['today','money','health','fitness','home','review'].indexOf(section)<0)section='today';
    state.section=section;
    applySection(true);
  };
  window.setLifeSection=window.lifeSetSection;

  window.lifeSetDetail=function(tab){
    if(tab==='billtracker'||tab==='property'){state.section='home';state.home=tab;}
    else{state.section='money';state.money=tab;}
    applySection(true);
  };

  window.toggleLifeAddMenu=function(event){
    if(event)event.stopPropagation();
    var menu=document.getElementById('lifeAddMenu');if(menu)menu.classList.toggle('is-open');
  };

  window.lifeTriggerAction=function(action){
    var menu=document.getElementById('lifeAddMenu');if(menu)menu.classList.remove('is-open');
    if(action==='income'&&typeof openCashModal==='function')openCashModal('Debit');
    else if(action==='expense'&&typeof openCashModal==='function')openCashModal('Credit');
    else if(action==='transfer'&&typeof openTransferModal==='function')openTransferModal();
    else if(action==='bill'&&typeof openBillModal==='function')openBillModal();
    else if(action==='health'){
      state.section='health';applySection(false);
      if(typeof quickLog==='function')quickLog('Sleep');
    }
  };

  window.lifeAskJelix=function(){
    if(typeof openJelixDrawer==='function')openJelixDrawer();
    else if(typeof setView==='function')setView('ai');
    setTimeout(function(){
      var input=document.getElementById('aiInput');
      if(input&&!input.value)input.value='Help me review my Life workspace and choose the most useful next action.';
      if(input)input.focus();
    },250);
  };

  window.lifeOpenTasks=function(){
    if(typeof setView==='function')setView('tasks');
    setTimeout(function(){
      var filter=document.getElementById('taskFilter');
      if(filter){filter.value='LIFE';if(typeof renderTasks==='function')renderTasks();}
    },100);
  };

  window.lifeToggleReviewStep=function(step){
    var review=getLifeReviewData();
    if(!Object.prototype.hasOwnProperty.call(review.steps,step))return;
    review.steps[step]=!review.steps[step];
    if(!review.steps[step])review.completedAt=null;
    saveLifeReviewData(review);
    renderLifeReview();
  };

  window.lifeSaveReviewReflection=function(){
    var review=getLifeReviewData();
    review.reflections.worked=(document.getElementById('lifeReviewWorked')||{}).value||'';
    review.reflections.attention=(document.getElementById('lifeReviewAttention')||{}).value||'';
    review.reflections.next=(document.getElementById('lifeReviewNext')||{}).value||'';
    saveLifeReviewData(review);
    if(typeof showToast==='function')showToast('✓ Weekly reflection saved');
    renderLifeReview();
  };

  window.lifeFinishWeeklyReview=function(){
    var review=getLifeReviewData();
    review.steps={money:true,wellbeing:true,admin:true,priorities:true};
    review.completedAt=new Date().toISOString();
    saveLifeReviewData(review);
    if(typeof showToast==='function')showToast('✓ Weekly Life review complete');
    renderLifeReview();
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});
  else initialize();
  setTimeout(initialize,350);
})();
