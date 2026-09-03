(function(){
  'use strict';

  var PROFILE_KEY='j-fitness-profile';
  var WEEK_KEY='j-fitness-week-';
  var WORKOUT_KEY='j-fitness-workout-';
  var COMPLETIONS_KEY='j-fitness-completions';
  var timerId=null;

  var warmup=[
    ['ti-run','Jog in place','01:00'],
    ['ti-refresh','Arm circles','00:30 each direction'],
    ['ti-run','High knees','01:00'],
    ['ti-stretching','Bodyweight squat','01:00'],
    ['ti-walk','Alternating lunges','02:00']
  ];
  var phases=[
    {name:'Round 01',tone:'orange',items:[['Burpees','12 reps'],['Jump squats','12 reps'],['Mountain climbers','30 sec'],['High knees','30 sec'],['Modified push-up','6–8 reps'],['Plank shoulder taps','30 sec']]},
    {name:'Round 02',tone:'blue',items:[['Jumping jacks','30 sec'],['Lunges (alternating)','2 min total'],['Plank jacks','30 sec'],['Russian twist','30 sec'],['Lying leg raise','30 sec'],['Side hops','30 sec']]},
    {name:'Final push',tone:'lime',items:[['Tuck jumps','1 min'],['Butt kicks','1 min'],['Kettlebell swings','20 swings'],['Modified push-up','6–8 reps'],['Pacer steps','30 sec'],['Plank hold','30 sec']]}
  ];
  var schedule=[
    {key:'mon',day:'Mon',icon:'ti-barbell',title:'HIIT + Strength',duration:'35–45 min',tone:'lime'},
    {key:'wed',day:'Wed',icon:'ti-run',title:'Cardio / Active recovery',duration:'30–45 min',tone:'blue'},
    {key:'fri',day:'Fri',icon:'ti-barbell',title:'HIIT + Strength',duration:'35–45 min',tone:'lime'}
  ];

  function safe(value){
    return String(value==null?'':value).replace(/[&<>'"]/g,function(char){
      return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char];
    });
  }

  function today(){
    return typeof localDateStr==='function'?localDateStr(new Date()):new Date().toISOString().slice(0,10);
  }

  function weekStart(){
    var date=new Date(today()+'T00:00:00');
    date.setDate(date.getDate()-((date.getDay()+6)%7));
    return typeof localDateStr==='function'?localDateStr(date):date.toISOString().slice(0,10);
  }

  function readJSON(key,fallback){
    try{return Object.assign({},fallback,JSON.parse(localStorage.getItem(key)||'null')||{});}catch(error){return Object.assign({},fallback);}
  }

  function profile(){
    var data=readJSON(PROFILE_KEY,{goal:'Transform',heightCm:172.72,weightKg:110,training:'2–3x'});
    var latest=weightLogs().slice(-1)[0];
    if(latest)data.weightKg=Number(latest.value)||data.weightKg;
    return data;
  }

  function weekPlan(){return readJSON(WEEK_KEY+weekStart(),{mon:false,wed:false,fri:false});}
  function saveWeekPlan(data){localStorage.setItem(WEEK_KEY+weekStart(),JSON.stringify(data));}
  function workout(){return readJSON(WORKOUT_KEY+today(),{progress:0,startedAt:null,elapsed:0,completed:false});}
  function saveWorkout(data){localStorage.setItem(WORKOUT_KEY+today(),JSON.stringify(data));}

  function weightLogs(){
    var logs=typeof getHealthLogs==='function'?getHealthLogs():[];
    return logs.filter(function(entry){return String(entry.metric||'').toLowerCase().indexOf('weight')>=0;})
      .sort(function(a,b){return String(a.date||'').localeCompare(String(b.date||''));})
      .slice(-6);
  }

  function waterCount(){
    var data=typeof getWellness==='function'?getWellness():{};
    return Number(data[today()]&&data[today()].water)||0;
  }

  function setWaterCount(count){
    count=Math.max(0,Math.min(8,Number(count)||0));
    if(typeof logWater==='function')logWater(count);
    else{
      var data=typeof getWellness==='function'?getWellness():{};
      if(!data[today()])data[today()]={};
      data[today()].water=count;
      if(typeof saveWellnessData==='function')saveWellnessData(data);
      else localStorage.setItem('j-wellness',JSON.stringify(data));
    }
  }

  function completions(){
    try{return JSON.parse(localStorage.getItem(COMPLETIONS_KEY)||'[]');}catch(error){return[];}
  }

  function monthlyCompletionCount(){
    var month=today().slice(0,7);
    return completions().filter(function(date){return String(date).slice(0,7)===month;}).length;
  }

  function elapsedSeconds(data){
    var base=Number(data.elapsed)||0;
    if(data.startedAt&&!data.completed)base+=Math.max(0,Math.floor((Date.now()-Number(data.startedAt))/1000));
    return base;
  }

  function clock(seconds){
    var mins=Math.floor(seconds/60),secs=seconds%60;
    return String(mins).padStart(2,'0')+':'+String(secs).padStart(2,'0');
  }

  function panelHeading(number,title,meta){
    return '<header class="fitness-panel-heading"><span>'+safe(number)+'</span><div><h2>'+safe(title)+'</h2>'+(meta?'<p>'+safe(meta)+'</p>':'')+'</div></header>';
  }

  function renderWeightChart(){
    var logs=weightLogs();
    if(logs.length<2)return '<div class="fitness-chart-empty"><i class="ti ti-chart-line"></i><strong>No trend yet</strong><span>Log another weight to begin your chart.</span></div>';
    var values=logs.map(function(item){return Number(item.value)||0;});
    var min=Math.min.apply(Math,values),max=Math.max.apply(Math,values);
    var range=Math.max(1,max-min);
    var points=values.map(function(value,index){
      var x=12+(index/(values.length-1))*276;
      var y=82-((value-min)/range)*58;
      return {x:x,y:y,value:value,date:logs[index].date};
    });
    return '<svg class="fitness-weight-chart" viewBox="0 0 300 100" role="img" aria-label="Recent weight trend">'+
      '<path d="'+points.map(function(point,index){return(index?'L':'M')+point.x.toFixed(1)+' '+point.y.toFixed(1);}).join(' ')+'" fill="none" stroke="currentColor" stroke-width="2"/>'+
      points.map(function(point){return '<circle cx="'+point.x.toFixed(1)+'" cy="'+point.y.toFixed(1)+'" r="3.5"><title>'+safe(point.date)+' · '+safe(point.value)+' kg</title></circle>';}).join('')+
    '</svg>';
  }

  function render(){
    var mount=document.getElementById('lifeFitnessContent');
    if(!mount)return;
    var data=profile(),week=weekPlan(),session=workout(),water=waterCount();
    var weekDone=schedule.filter(function(item){return week[item.key];}).length;
    var currentWeight=Number(data.weightKg)||110;
    var monthly=monthlyCompletionCount();
    var monthGoal=10;
    var monthPct=Math.min(100,Math.round(monthly/monthGoal*100));
    var progress=Math.max(0,Math.min(100,Number(session.progress)||0));
    var buttonLabel=session.completed?'Workout complete':progress?'Next phase':'Start workout';
    var buttonIcon=session.completed?'ti-check':'ti-player-play';

    mount.innerHTML='<main class="fitness-dashboard">'+
      '<section class="fitness-overview">'+
        '<div class="fitness-title"><small>Personal training system</small><h1>Fitness</h1><p>Current goal <strong>'+safe(data.goal)+'</strong></p></div>'+
        '<div class="fitness-profile-metrics">'+
          '<div><i class="ti ti-ruler-measure"></i><span><small>Height</small><strong>'+safe(Number(data.heightCm).toFixed(2))+' cm</strong><em>5′8″</em></span></div>'+
          '<div><i class="ti ti-scale"></i><span><small>Weight</small><strong>'+safe(currentWeight.toFixed(1))+' kg</strong><em>Latest log</em></span></div>'+
          '<div><i class="ti ti-calendar-week"></i><span><small>Training</small><strong>'+safe(data.training)+'</strong><em>per week</em></span></div>'+
        '</div>'+
        '<div class="fitness-week-ring" style="--fitness-week:'+Math.round(weekDone/3*100)+'%"><div><strong>'+weekDone+'/3</strong><small>This week</small></div></div>'+
        '<button class="fitness-icon-button" onclick="fitnessToggleProfile()" aria-label="Edit fitness profile"><i class="ti ti-pencil"></i></button>'+
      '</section>'+
      '<form class="fitness-profile-form" id="fitnessProfileForm" hidden onsubmit="fitnessSaveProfile(event)">'+
        '<label><span>Goal</span><input id="fitnessGoal" value="'+safe(data.goal)+'"></label>'+
        '<label><span>Height (cm)</span><input id="fitnessHeight" type="number" min="80" max="250" step="0.01" value="'+safe(data.heightCm)+'"></label>'+
        '<label><span>Training</span><select id="fitnessTraining"><option'+(data.training==='2–3x'?' selected':'')+'>2–3x</option><option'+(data.training==='3–4x'?' selected':'')+'>3–4x</option><option'+(data.training==='4–5x'?' selected':'')+'>4–5x</option></select></label>'+
        '<button type="submit"><i class="ti ti-check"></i>Save profile</button>'+
      '</form>'+
      '<section class="fitness-top-grid">'+
        '<article class="fitness-panel fitness-today">'+panelHeading('01','Today’s workout','HIIT A · Warm up · 5–6 min')+
          '<div class="fitness-warmup">'+warmup.map(function(item,index){return '<div><span>'+(index+1)+'</span><i class="ti '+item[0]+'"></i><strong>'+safe(item[1])+'</strong><small>'+safe(item[2])+'</small></div>';}).join('')+'</div>'+
          '<div class="fitness-today-actions"><button class="fitness-primary" onclick="fitnessAdvanceWorkout()"'+(session.completed?' disabled':'')+'><i class="ti '+buttonIcon+'"></i>'+safe(buttonLabel)+'</button><span><i class="ti ti-clock"></i><strong id="fitnessElapsed">'+clock(elapsedSeconds(session))+'</strong></span><button class="fitness-secondary" onclick="fitnessResetWorkout()"><i class="ti ti-refresh"></i>Reset</button></div>'+
        '</article>'+
        '<article class="fitness-panel fitness-week">'+panelHeading('02','My week',weekDone+' of 3 workouts complete')+
          '<div class="fitness-schedule">'+schedule.map(function(item){return '<button class="'+(week[item.key]?'is-complete ':'')+'tone-'+item.tone+'" onclick="fitnessToggleDay(\''+item.key+'\')"><span>'+item.day+'</span><i class="ti '+item.icon+'"></i><strong>'+item.title+'</strong><small>'+item.duration+'</small><em><i class="ti '+(week[item.key]?'ti-circle-check-filled':'ti-circle')+'"></i>'+(week[item.key]?'Complete':'Mark complete')+'</em></button>';}).join('')+'</div>'+
        '</article>'+
      '</section>'+
      '<section class="fitness-panel fitness-roadmap">'+panelHeading('03','The workout roadmap',progress+'% complete')+
        '<div class="fitness-roadmap-track"><span style="width:'+progress+'%"></span></div>'+
        '<div class="fitness-phases">'+phases.map(function(phase,index){var threshold=(index+1)*25;return '<article class="tone-'+phase.tone+(progress>=threshold?' is-active':'')+'"><header><span>'+safe(phase.name)+'</span><em>'+threshold+'%</em></header><div>'+phase.items.map(function(item){return '<p><b>'+safe(item[0])+'</b><small>'+safe(item[1])+'</small></p>';}).join('')+'</div><footer><i class="ti ti-clock-pause"></i>Rest 30–45 sec</footer></article>';}).join('')+'</div>'+
      '</section>'+
      '<section class="fitness-bottom-grid">'+
        '<article class="fitness-panel fitness-food">'+panelHeading('04','Food & hydration','Keep it simple and consistent')+
          '<div class="fitness-food-guide"><div><i class="ti ti-meat"></i><strong>Protein first</strong><small>Chicken, fish, eggs, lean meat, tofu</small></div><div><i class="ti ti-bowl-spoon"></i><strong>Rice</strong><small>1 cup per meal</small></div><div><i class="ti ti-burger"></i><strong>High-fat foods</strong><small>Limit, don’t eliminate</small></div></div>'+
          '<div class="fitness-hydration"><div><strong>Hydration tracker</strong><small>'+water+' of 8 glasses</small></div><div class="fitness-water-buttons">'+Array.from({length:8},function(_,index){var amount=index+1;return '<button class="'+(amount<=water?'is-filled':'')+'" onclick="fitnessSetWater('+amount+')" aria-label="Log '+amount+' glasses"><i class="ti ti-droplet-filled"></i></button>';}).join('')+'</div><button onclick="fitnessSetWater('+Math.min(8,water+1)+')"><i class="ti ti-plus"></i>Log water</button></div>'+
        '</article>'+
        '<article class="fitness-panel fitness-progress">'+panelHeading('05','Progress','Consistency over intensity')+
          '<div class="fitness-progress-grid"><div class="fitness-weight-card"><header><span><small>Current weight</small><strong>'+currentWeight.toFixed(1)+' kg</strong></span><button onclick="fitnessShowWeightEntry()"><i class="ti ti-plus"></i>Log</button></header>'+renderWeightChart()+'<form id="fitnessWeightForm" hidden onsubmit="fitnessSaveWeight(event)"><input id="fitnessWeightValue" type="number" min="30" max="300" step="0.1" value="'+currentWeight.toFixed(1)+'"><button type="submit">Save weight</button></form></div>'+
          '<div class="fitness-month-card"><div class="fitness-month-ring" style="--fitness-month:'+monthPct+'%"><strong>'+monthly+'/'+monthGoal+'</strong><small>workouts</small></div><span><strong>'+monthPct+'%</strong><small>This month</small></span></div></div>'+
        '</article>'+
      '</section>'+
      '<footer class="fitness-footer"><i class="ti ti-star-filled"></i><span><strong>Consistency today. Transformation tomorrow.</strong><small>Be patient with the process and trust the plan.</small></span><em>You vs you.</em></footer>'+
    '</main>';

    syncTimer();
  }

  function syncTimer(){
    if(timerId){clearInterval(timerId);timerId=null;}
    var data=workout();
    if(!data.startedAt||data.completed)return;
    timerId=setInterval(function(){
      var target=document.getElementById('fitnessElapsed');
      if(target)target.textContent=clock(elapsedSeconds(workout()));
      else{clearInterval(timerId);timerId=null;}
    },1000);
  }

  window.renderFitnessCommandCenter=render;

  window.fitnessToggleProfile=function(){
    var form=document.getElementById('fitnessProfileForm');if(form)form.hidden=!form.hidden;
  };

  window.fitnessSaveProfile=function(event){
    if(event)event.preventDefault();
    var data=profile();
    data.goal=(document.getElementById('fitnessGoal')||{}).value||data.goal;
    data.heightCm=Number((document.getElementById('fitnessHeight')||{}).value)||data.heightCm;
    data.training=(document.getElementById('fitnessTraining')||{}).value||data.training;
    localStorage.setItem(PROFILE_KEY,JSON.stringify(data));
    if(typeof showToast==='function')showToast('Fitness profile saved.');
    render();
  };

  window.fitnessToggleDay=function(key){
    var data=weekPlan();if(!Object.prototype.hasOwnProperty.call(data,key))return;
    data[key]=!data[key];saveWeekPlan(data);render();
  };

  window.fitnessAdvanceWorkout=function(){
    var data=workout();if(data.completed)return;
    if(!data.startedAt)data.startedAt=Date.now();
    data.progress=Math.min(100,(Number(data.progress)||0)+25);
    if(data.progress>=100){
      var finishedElapsed=elapsedSeconds(data);
      data.completed=true;
      data.elapsed=finishedElapsed;
      data.startedAt=null;
      var dates=completions();if(dates.indexOf(today())<0){dates.push(today());localStorage.setItem(COMPLETIONS_KEY,JSON.stringify(dates));}
      var dayKey={1:'mon',3:'wed',5:'fri'}[new Date(today()+'T00:00:00').getDay()];
      var plan=weekPlan();
      if(dayKey)plan[dayKey]=true;
      else{var next=schedule.find(function(item){return !plan[item.key];});if(next)plan[next.key]=true;}
      saveWeekPlan(plan);
      if(typeof getHealthLogs==='function'&&typeof saveHealthLogs==='function'){
        var logs=getHealthLogs();
        if(!logs.some(function(entry){return entry.source==='fitness-module'&&entry.date===today();})){
          logs.unshift({id:Date.now(),date:today(),category:'Exercise',metric:'HIIT A Workout',value:Math.max(1,Math.round(data.elapsed/60)),unit:'min',notes:'Completed in Fitness workspace',source:'fitness-module'});
          saveHealthLogs(logs);
        }
      }
      if(typeof showToast==='function')showToast('Workout complete. Strong work.');
    }
    saveWorkout(data);render();
  };

  window.fitnessResetWorkout=function(){
    saveWorkout({progress:0,startedAt:null,elapsed:0,completed:false});
    render();
  };

  window.fitnessSetWater=function(amount){setWaterCount(amount);render();};

  window.fitnessShowWeightEntry=function(){
    var form=document.getElementById('fitnessWeightForm');if(form){form.hidden=false;var input=document.getElementById('fitnessWeightValue');if(input)input.focus();}
  };

  window.fitnessSaveWeight=function(event){
    if(event)event.preventDefault();
    var value=Number((document.getElementById('fitnessWeightValue')||{}).value);
    if(!value||value<30||value>300){if(typeof showToast==='function')showToast('Enter a valid weight from 30 to 300 kg.');return;}
    if(typeof getHealthLogs==='function'&&typeof saveHealthLogs==='function'){
      var logs=getHealthLogs();
      logs.unshift({id:Date.now(),date:today(),category:'Vitals',metric:'Weight',value:value,unit:'kg',notes:'Logged from Fitness workspace',source:'fitness-module'});
      saveHealthLogs(logs);
    }
    var data=profile();data.weightKg=value;localStorage.setItem(PROFILE_KEY,JSON.stringify(data));
    if(typeof showToast==='function')showToast('Weight logged.');
    render();
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){if(document.getElementById('lifeFitnessContent'))render();},{once:true});
})();
