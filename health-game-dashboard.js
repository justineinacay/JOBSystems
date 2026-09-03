(function(){
  'use strict';

  var DASH_ID='healthGameDashboard';
  var COMPLETIONS_KEY='j-fitness-completions';

  function today(){return typeof localDateStr==='function'?localDateStr(new Date()):new Date().toISOString().slice(0,10);}
  function dateObj(value){return new Date(value+'T00:00:00');}
  function iso(date){var year=date.getFullYear(),month=String(date.getMonth()+1).padStart(2,'0'),day=String(date.getDate()).padStart(2,'0');return year+'-'+month+'-'+day;}
  function safe(value){return typeof window.safe==='function'?window.safe(String(value==null?'':value)):String(value==null?'':value).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]);});}
  function logs(){return typeof getHealthLogs==='function'?getHealthLogs():[];}
  function wellness(){return typeof getWellness==='function'?getWellness():{};}
  function number(value){var n=Number(value);return Number.isFinite(n)?n:0;}
  function isWithin(date,days){var end=dateObj(today());var start=new Date(end);start.setDate(end.getDate()-(days-1));var d=dateObj(date);return d>=start&&d<=end;}
  function latest(metric){var list=logs();for(var i=0;i<list.length;i++){if(String(list[i].metric||'').toLowerCase().indexOf(metric)>=0)return list[i];}return null;}
  function todayLogs(){return logs().filter(function(item){return item.date===today();});}
  function todayHas(keyword){return todayLogs().some(function(item){return String(item.metric||'').toLowerCase().indexOf(keyword)>=0||String(item.category||'').toLowerCase()===keyword;});}
  function waterToday(){var entry=wellness()[today()];return Math.max(0,Math.min(8,number(entry&&entry.water)||number((todayLogs().find(function(item){return String(item.metric||'').toLowerCase().indexOf('water')>=0;})||{}).value)));}
  function workoutDoneToday(){try{var session=JSON.parse(localStorage.getItem('j-fitness-workout-'+today())||'null');if(session&&session.completed)return true;}catch(e){}return todayLogs().some(function(item){return String(item.category||'').toLowerCase()==='exercise'||String(item.metric||'').toLowerCase().indexOf('workout')>=0;});}
  function wellnessDoneToday(){var entry=wellness()[today()];return !!(entry&&(entry.mood||entry.energy||entry.stress||entry.notes));}
  function nutritionDoneToday(){return todayLogs().some(function(item){return String(item.category||'').toLowerCase()==='nutrition'||String(item.metric||'').toLowerCase().indexOf('nutrition')>=0||String(item.metric||'').toLowerCase().indexOf('meal')>=0;});}
  function streak(){
    var active={};logs().forEach(function(item){if(item.date)active[item.date]=true;});
    var wellnessData=wellness();Object.keys(wellnessData).forEach(function(key){if(wellnessData[key]&&(wellnessData[key].mood||wellnessData[key].energy||wellnessData[key].water))active[key]=true;});
    var count=0,d=dateObj(today());
    while(active[iso(d)]&&count<365){count++;d.setDate(d.getDate()-1);}
    return count;
  }
  function weekDates(){var end=dateObj(today()),day=end.getDay()||7;var monday=new Date(end);monday.setDate(end.getDate()-day+1);return Array.from({length:7},function(_,i){var d=new Date(monday);d.setDate(monday.getDate()+i);return iso(d);});}
  function exerciseDays(){var days={};logs().forEach(function(item){if(isWithin(item.date,7)&&(String(item.category||'').toLowerCase()==='exercise'||String(item.metric||'').toLowerCase().indexOf('workout')>=0))days[item.date]=true;});try{var completion=JSON.parse(localStorage.getItem(COMPLETIONS_KEY)||'[]');completion.forEach(function(item){if(isWithin(item,7))days[item]=true;});}catch(e){}return days;}
  function xpStats(questCount,dayStreak){
    var all=logs(),exercise=all.filter(function(item){return String(item.category||'').toLowerCase()==='exercise'||String(item.metric||'').toLowerCase().indexOf('workout')>=0;}).length;
    var checks=Object.keys(wellness()).filter(function(key){var item=wellness()[key];return item&&(item.mood||item.energy||item.stress);}).length;
    var xp=all.length*25+exercise*40+checks*15+Math.min(dayStreak,30)*10+questCount*20;
    var level=Math.max(1,Math.floor(xp/600)+1),current=xp%600;
    return {xp:xp,level:level,current:current,next:600,percent:Math.round(current/600*100)};
  }
  function score(questCount,dayStreak){return Math.min(100,Math.round(questCount/4*65+Math.min(dayStreak,7)/7*20+Math.min(logs().filter(function(item){return isWithin(item.date,7);}).length,5)/5*15));}
  function quests(){return [
    {icon:'ti-run',tone:'lime',title:'Complete your planned exercise',detail:'Log your workout and duration',xp:40,done:workoutDoneToday()},
    {icon:'ti-droplet-filled',tone:'blue',title:'Reach your hydration target',detail:'Log 8 glasses of water',xp:20,done:waterToday()>=8},
    {icon:'ti-salad',tone:'amber',title:'Log today’s nutrition',detail:'Add your meals and macros',xp:25,done:nutritionDoneToday()},
    {icon:'ti-brain',tone:'purple',title:'Finish your wellness check-in',detail:'Mood, energy, and stress',xp:15,done:wellnessDoneToday()}
  ];}
  function trend(){
    var days=weekDates(),activity=days.map(function(day){return logs().filter(function(item){return item.date===day;}).length+(wellness()[day]?1:0);});
    var max=Math.max(1,Math.max.apply(Math,activity));
    return {days:days,values:activity,max:max};
  }
  function chartMarkup(){
    var data=trend(),points=data.values.map(function(value,index){var x=21+index*43;var y=90-(value/data.max*60);return x+','+y;}).join(' ');
    return '<div class="health-game-chart-wrap"><svg class="health-game-chart" viewBox="0 0 300 112" role="img" aria-label="Seven-day health activity trend"><path class="health-game-grid" d="M21 30H279M21 60H279M21 90H279"></path><polyline points="'+points+'"></polyline>'+data.values.map(function(value,index){var x=21+index*43;var y=90-(value/data.max*60);return '<circle cx="'+x+'" cy="'+y+'" r="3"></circle>';}).join('')+'</svg><div class="health-game-chart-labels">'+data.days.map(function(day){return '<span>'+dateObj(day).toLocaleDateString('en-PH',{weekday:'short'}).slice(0,2)+'</span>';}).join('')+'</div></div>';
  }
  function dayLabel(day){return dateObj(day).toLocaleDateString('en-PH',{weekday:'short'}).toUpperCase();}
  function weeklyMarkup(){
    var days=weekDates(),active=exerciseDays();
    return days.slice(0,5).map(function(day,index){var completed=!!active[day];return '<div class="health-game-week-day '+(completed?'is-complete':'')+'"><span>'+dayLabel(day)+'</span><i class="ti '+(index%2?'ti-barbell':'ti-run')+'"></i><strong>'+(['HIIT + Core','Cardio / Recovery','Upper Body','Mobility','Strength'][index])+'</strong><small>'+(['45 min','30 min','50 min','25 min','45 min'][index])+'</small><em><i class="ti '+(completed?'ti-circle-check-filled':'ti-circle')+'"></i>'+(completed?'Complete':'Upcoming')+'</em></div>';}).join('');
  }
  function badgeMarkup(done,icon,label,tone){return '<div class="health-game-badge '+(done?'is-earned':'is-locked')+' tone-'+tone+'"><i class="ti '+icon+'"></i><span>'+safe(label)+'</span></div>';}
  function render(){
    var host=document.getElementById('cf-biomonitor');if(!host)return;
    var mount=document.getElementById(DASH_ID);
    if(!mount){mount=document.createElement('section');mount.id=DASH_ID;mount.setAttribute('aria-label','Fitness game dashboard');host.insertBefore(mount,host.firstChild);}
    var q=quests(),done=q.filter(function(item){return item.done;}).length,streakDays=streak(),xp=xpStats(done,streakDays),success=score(done,streakDays),latestWeight=latest('weight'),latestHr=latest('heart rate'),latestSleep=latest('sleep'),exerciseCount=logs().filter(function(item){return String(item.category||'').toLowerCase()==='exercise'||String(item.metric||'').toLowerCase().indexOf('workout')>=0;}).length;
    var weekly=Object.keys(exerciseDays()).length;
    mount.innerHTML='<div class="health-game-header"><div><span class="health-game-kicker">PERSONAL HEALTH SYSTEM</span><h2>Fitness Game Dashboard</h2><p>Track manually. Build consistency. Win progress.</p></div><div class="health-game-head-stats"><span><i class="ti ti-flame"></i><strong>'+streakDays+'</strong><small>Day streak</small></span><span><i class="ti ti-diamond"></i><strong>'+xp.xp+'</strong><small>Total XP</small></span></div><button class="health-game-log" aria-label="Log health data" onclick="openModal(\'healthLogModal\')"><i class="ti ti-plus"></i><span>Log health data</span></button></div>'+
      '<div class="health-game-grid">'+
        '<article class="health-game-card health-game-progress-card"><div class="health-game-card-title"><span><i class="ti ti-chart-histogram"></i>Your progress</span><small>Level '+xp.level+'</small></div><div class="health-game-progress-main"><div class="health-game-level"><strong>'+xp.level+'</strong><span>LEVEL</span><i class="ti ti-star-filled"></i><small>Momentum builder</small></div><div class="health-game-xp"><div class="health-game-xp-row"><strong>'+xp.current+' <small>XP</small></strong><span>'+xp.current+' / '+xp.next+' XP</span></div><div class="health-game-xp-bar"><i style="width:'+xp.percent+'%"></i></div><p>'+Math.max(0,xp.next-xp.current)+' XP to Level '+(xp.level+1)+'</p><div class="health-game-mini-stats"><span><i class="ti ti-flame"></i><b>'+streakDays+'</b><small>Day streak</small></span><span><i class="ti ti-target"></i><b>'+done+'/4</b><small>Quests today</small></span><span><i class="ti ti-chart-line"></i><b>'+Math.max(0,Math.round(Math.min(100,weekly/5*100)))+'%</b><small>Best week</small></span><span><i class="ti ti-trophy"></i><b>'+Math.min(5,done+(streakDays>6?2:0))+'</b><small>Badges</small></span></div></div></div></article>'+
        '<article class="health-game-card health-game-score-card"><div class="health-game-card-title"><span><i class="ti ti-trophy"></i>Success score</span><small>Today</small></div><div class="health-game-score-wrap"><div class="health-game-score-ring" style="--score:'+success+'%"><span class="health-game-score-value"><strong>'+success+'</strong><small>/100</small></span></div><div class="health-game-score-copy"><strong>'+ (success>=70?'Strong momentum!':success>=35?'Keep building!':'Start with one win.') +'</strong><p>'+ (done?done+' daily quest'+(done===1?' is':'s are')+' complete.':'Choose one simple action to begin today.') +'</p><button onclick="document.getElementById(\'healthGameQuests\').scrollIntoView({behavior:\'smooth\',block:\'center\'})">View score breakdown</button></div></div></article>'+
        '<article class="health-game-card health-game-quests-card" id="healthGameQuests"><div class="health-game-card-title"><span><i class="ti ti-target"></i>Daily quest board</span><small>Resets at midnight</small></div><p class="health-game-card-subtitle">Small actions compound into a stronger system.</p><div class="health-game-quest-list">'+q.map(function(item){return '<button class="health-game-quest '+(item.done?'is-complete':'')+' tone-'+item.tone+'" onclick="healthGameQuest(\''+item.title+'\')"><i class="ti '+item.icon+'"></i><span><b>'+safe(item.title)+'</b><small>'+safe(item.detail)+'</small></span><strong>+'+item.xp+' XP</strong><i class="ti '+(item.done?'ti-circle-check-filled':'ti-circle')+'"></i></button>';}).join('')+'</div><div class="health-game-quest-total"><span>'+ (done===4?'All quests completed! You earned a 100 XP bonus.':done+' of 4 quests complete') +'</span><strong>+'+(done===4?100:done*20)+' XP</strong></div></article>'+
        '<article class="health-game-card health-game-challenge-card"><div class="health-game-card-title"><span><i class="ti ti-calendar-week"></i>Weekly challenge</span><small>5-day target</small></div><p class="health-game-card-subtitle">Log meaningful health data on different days.</p><div class="health-game-week-strip">'+weekDates().slice(0,7).map(function(day){var active=!!exerciseDays()[day];return '<span class="'+(active?'is-active':'')+'"><b>'+dayLabel(day).slice(0,1)+'</b><small>'+dateObj(day).getDate()+'</small></span>';}).join('')+'</div><div class="health-game-challenge-row"><strong>'+Math.min(5,weekly)+' / 5 days completed</strong><span>'+Math.min(100,Math.round(weekly/5*100))+'%</span></div><div class="health-game-xp-bar"><i style="width:'+Math.min(100,weekly/5*100)+'%"></i></div><div class="health-game-achievement"><i class="ti ti-medal-2"></i><span><small>Next achievement</small><b>'+ (weekly>=5?'Perfect week':'Momentum builder') +'</b></span><strong>'+ (weekly>=5?'CLAIMED':'+'+(5-weekly)+' day'+(5-weekly===1?'':'s')) +'</strong></div></article>'+
        '<article class="health-game-card health-game-trend-card"><div class="health-game-card-title"><span><i class="ti ti-chart-line"></i>7-day trend overview</span><select aria-label="Health trend metric"><option>Activity</option><option>Heart rate</option><option>Weight</option></select></div>'+chartMarkup()+'<div class="health-game-stat-rows"><span><i class="ti ti-heart-rate-monitor"></i>Avg. heart rate<strong>'+(latestHr?Math.round(number(latestHr.value))+' bpm':'—')+'</strong></span><span><i class="ti ti-barbell"></i>Total workouts<strong>'+exerciseCount+' sessions</strong></span><span><i class="ti ti-moon"></i>Avg. sleep<strong>'+(latestSleep?number(latestSleep.value).toFixed(1)+' hrs':'—')+'</strong></span><span><i class="ti ti-droplet"></i>Water intake<strong>'+waterToday()+' / 8 glasses</strong></span></div></article>'+
        '<article class="health-game-card health-game-badges-card"><div class="health-game-card-title"><span><i class="ti ti-award"></i>Recent badges</span><small>'+Math.min(5,done+(streakDays>6?2:0))+' earned</small></div><div class="health-game-badges">'+badgeMarkup(exerciseCount>0,'ti-shoe','First step','lime')+badgeMarkup(waterToday()>=8,'ti-droplet-filled','Hydration hero','blue')+badgeMarkup(streakDays>=3,'ti-flame','Streak master','orange')+badgeMarkup(wellnessDoneToday(),'ti-sun','Wellness check','purple')+badgeMarkup(done===4,'ti-trophy','Perfect day','amber')+'</div></article>'+
      '</div><div class="health-game-how"><strong>How it works</strong><span><i class="ti ti-clipboard-heart"></i>Log manually</span><i class="ti ti-arrow-right"></i><span><i class="ti ti-star"></i>Earn XP</span><i class="ti ti-arrow-right"></i><span><i class="ti ti-chart-line"></i>Build consistency</span><i class="ti ti-arrow-right"></i><span><i class="ti ti-trophy"></i>Unlock rewards</span></div>';
    var details=host.querySelector('[data-health-game-details]');
    if(!details){details=document.createElement('div');details.setAttribute('data-health-game-details','');details.className='health-game-details';details.innerHTML='<span><i class="ti ti-list"></i>Detailed health data</span><small>Use the existing quick log, wellness check-in, and health history below for deeper entries.</small>';mount.insertAdjacentElement('afterend',details);}
  }
  window.renderHealthGameDashboard=render;
  window.healthGameQuest=function(title){
    var map={'Complete your planned exercise':'Exercise','Reach your hydration target':'Water','Log today’s nutrition':'Nutrition','Finish your wellness check-in':'Mental'};
    var type=map[title];
    if(type==='Water'&&typeof logWaterGlass==='function'){logWaterGlass();return;}
    if(type&&typeof quickLog==='function'){quickLog(type);return;}
    var quest=document.getElementById('healthGameQuests');if(quest)quest.scrollIntoView({behavior:'smooth',block:'center'});
  };
})();
