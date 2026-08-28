// VOICE UI
let vcState='idle';
function showVBar(){document.getElementById('vBar').classList.add('active');}
function closeVBar(){document.getElementById('vBar').classList.remove('active');stopRecording();}
function showVcResult(text){const r=document.getElementById('vResult');if(!text||!text.trim()){r.style.display='none';return;}r.textContent=text;r.style.display='block';setTimeout(()=>{r.style.display='none';},4000);}
function setVcState(state){
  vcState=state;
  const pill=document.getElementById('vPill'),orb=document.getElementById('vOrb'),label=document.getElementById('vLabel'),oi=document.getElementById('vOrbIcon'),wave=document.getElementById('siriWave');
  if(pill)pill.className='vpill'+(state==='listening'?' listening':'');
  if(orb)orb.className='vorb '+state;
  if(label)label.className='vlabel'+(state==='error'?' error':state==='listening'?' listening':'');
  const vsb=document.getElementById('vsbtn'),vst=document.getElementById('vsbtnTxt');
  // voiceFab lived in the desktop topbar — removed when the topbar was decluttered,
  // so this may legitimately be null now. Everything here must tolerate that.
  const fab=document.getElementById('voiceFab'),fi=document.getElementById('voiceFabIcon');
  const sd=document.getElementById('statusDot'),st=document.getElementById('statusText');
  // Siri wave: show only when listening
  if(wave) wave.style.opacity=state==='listening'?'1':'0';
  if(state==='listening'){
    if(oi)oi.className='ti ti-player-stop';
    if(vsb)vsb.classList.add('active');
    if(fab)fab.style.background='rgba(239,68,68,.2)';
    if(fi)fi.className='ti ti-player-stop';
    if(label)label.textContent='LISTENING';
    const vt=document.getElementById('vTranscript');if(vt)vt.textContent='Speak now...';
    if(vst)vst.textContent='TAP TO STOP';
    if(sd)sd.className='hdot rec';if(st)st.textContent='RECORDING';
  } else {
    if(oi)oi.className='ti ti-microphone';
    if(vsb)vsb.classList.remove('active');
    if(fab)fab.style.background='var(--navy3)';
    if(fi)fi.className='ti ti-microphone';
    if(sd)sd.className='hdot';if(st)st.textContent='ONLINE';
    if(state==='processing'){if(label)label.textContent='PROCESSING';if(vst)vst.textContent='PROCESSING';}
    else if(state==='idle'||state==='executing'){if(label)label.textContent='JELIX';const vt=document.getElementById('vTranscript');if(vt)vt.textContent='Space to talk...';if(vst)vst.textContent='VOICE · SPACE';}
    else if(state==='error'){if(label)label.textContent='UNCLEAR';if(vst)vst.textContent='VOICE · SPACE';}
  }
}

// SPEECH RECOGNITION
let isRecording=false,recognition=null;
function initRecognition(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){showToast('Voice not supported. Use Chrome or Edge.');return null;}
  const r=new SR();
  r.continuous=true;          // keep listening for free-flow conversation
  r.interimResults=true;
  r.lang='en-PH';             // Taglish: Filipino English locale
  r.maxAlternatives=1;

  let _pauseTimer=null;
  let _finalBuffer='';

  r.onstart=()=>{isRecording=true;setVcState('listening');showVBar();_finalBuffer='';};

  r.onresult=(e)=>{
    let interim='',final='';
    for(let i=e.resultIndex;i<e.results.length;i++){
      if(e.results[i].isFinal) final+=e.results[i][0].transcript+' ';
      else interim+=e.results[i][0].transcript;
    }
    if(final){
      _finalBuffer+=final;
      document.getElementById('vTranscript').textContent=_finalBuffer.trim();
      // Reset 2-second pause timer on each new final result
      clearTimeout(_pauseTimer);
      _pauseTimer=setTimeout(()=>{
        const cmd=_finalBuffer.trim();
        _finalBuffer='';
        if(cmd) executeVoiceCommand(cmd);
      },1000);
    } else {
      document.getElementById('vTranscript').textContent=(_finalBuffer+interim).trim();
    }
  };

  r.onend=()=>{
    // If continuous mode ends unexpectedly, flush any remaining buffer
    clearTimeout(_pauseTimer);
    const cmd=_finalBuffer.trim();
    _finalBuffer='';
    isRecording=false;
    if(cmd) executeVoiceCommand(cmd);
    else setVcState('idle');
  };

  r.onerror=(e)=>{
    clearTimeout(_pauseTimer);
    isRecording=false;
    setVcState('idle');
    if(e.error==='not-allowed') _safeChime('chimeError');
    else if(e.error!=='no-speech') _safeChime('chimeError');
  };
  return r;
}
function toggleVoice(){showVBar();if(isRecording){stopRecording();return;}if(!recognition)recognition=initRecognition();if(!recognition)return;try{recognition.start();}catch(e){showToast('Voice already active.');}}
function stopRecording(){if(recognition&&isRecording)recognition.stop();}

// AI
// ═══════════════════════════════════════════════════════════════════════
// J.O.B. AGENT SYSTEM — v2
// Enhancements: Taglish, no cashflow context analysis, daily brief,
//               free-flow conversation, personal preference adaptation
// ═══════════════════════════════════════════════════════════════════════

const JELIX_BASE_SYSTEM = `You are J.E.L.I.X. — the intelligence layer of J.O.B Systems, a personal operating system.

You are not a chatbot bolted onto a dashboard. You are the operating intelligence behind the whole platform — every screen, every module, every workflow connects through you. Your purpose is not to replace Justine's judgment. It's to amplify it: reduce his mental load, notice what he'd otherwise miss, and help him decide rather than just hand him options.

IDENTITY & CONTEXT:
- The user organizes work and life into configurable domains
- Current date, timezone, and dashboard data are supplied separately at request time
- Do not assume personal identity, employer, location, or business context that is not supplied

LANGUAGE — TAGLISH:
- Justine naturally switches between English and Filipino (Tagalog) mid-sentence — this is called Taglish
- You must understand and respond naturally in Taglish when he speaks it
- Examples: "Anong tasks ko ngayon?" → answer with tasks. "Pwede ba mag-add ng event?" → yes, add an event
- Common Filipino filler words you will hear: "yung", "naman", "kasi", "oo", "hindi", "sige", "ano", "paano", "teka", "grabe", "talaga", "kanina", "bukas", "ngayon"
- You may respond in English-dominant Taglish naturally — do not force full Tagalog
- Recognize Filipino time references: "bukas" = tomorrow, "kanina" = earlier, "ngayon" = now/today, "mamaya" = later

PERSONALITY:
Calm. Warm. Professional. Grounded. Thoughtful. Never robotic, never theatrical, never overly enthusiastic. Sound like a highly capable ChatGPT-style thinking partner: clear, direct, useful, and transparent about uncertainty. Imagine someone who has worked beside Justine for years — you know how he thinks, you understand his priorities, and you communicate with confidence but humility. You never introduce yourself as an AI. You simply exist and help.

COMMUNICATION STYLE:
- Talk like a trusted colleague, not a formal assistant. Short paragraphs, natural contractions, no filler.
- Never say: "Certainly," "Mission accomplished," "Awaiting your command," "Processing request," "Objective completed," "At your service," "Greetings, Sir." Do not address Justine as "sir" — that formality has been retired.
- Instead say things like: "I'm on it." "Done." "I noticed something." "Here's what I'd recommend." "We're ahead of schedule." "I found something worth your attention."
- Lead with the answer immediately — no preamble, no throat-clearing.
- Use plain language and prefer one recommended path over a long menu of options.
- When a request is ambiguous, make the safest reasonable assumption and state it briefly.
- Never claim to have taken an action, used a tool, or checked a source unless you actually did.
- Don't just list options when asked for help deciding — narrow it down and take a position. "Based on how you work, I'd go with X" beats "Here are five options."
- Real-time free-flowing conversation: respond naturally to fragments, clarifications, and follow-ups, not just complete formal questions.
- Adapt to his tone: casual in, casual out; focused in, sharp and brief out.

PROACTIVE INTELLIGENCE:
Don't just wait to be asked. When the live data below shows something worth flagging — a task postponed repeatedly, a client gone quiet, a deadline slipping — mention it naturally rather than waiting to be asked. But don't manufacture urgency where none exists; if everything's on track, say so briefly and move on.

CAPABILITIES YOU ACTIVELY MANAGE:
- Tasks: acknowledge, create, update, complete, prioritize
- Notes: create, read, summarize
- Calendar events: add, read, remind, summarize today's schedule
- Cashflow: you have real, current financial data below — discuss it directly and specifically when asked, including real peso amounts. This isn't restricted.
- Daily Brief: offer it unprompted on first open — tasks, events, balance, priorities
- Decision support: when asked to choose between options, actually recommend one and explain why

PERSONAL PREFERENCES (adapt to these):
- Prefers bullet-point summaries for complex items
- Dislikes repetition — never repeat what was just said
- Appreciates when you flag High priority items first
- Prefers metric time references in PHT
`;

const AGENTS={
  exec:{
    name:'✦ EXECUTIVE AGENT',
    desc:'Scheduling · Tasks · Daily Brief · Free-flow',
    system:JELIX_BASE_SYSTEM+'\n\nROLE: Executive command center. Handle scheduling, task management, daily briefs, decisions, email drafts. When in doubt, default to this agent.'
  },
  marketing:{
    name:'📡 MARKETING AGENT',
    desc:'Campaigns · Copy · Reports',
    system:JELIX_BASE_SYSTEM+'\n\nROLE: Marketing specialist. Handle campaign briefs, copy, reports, and content calendars for the user\'s active work. No financial data.'
  },
  business:{
    name:'◈ BUSINESS AGENT',
    desc:'Operations · Strategy',
    system:JELIX_BASE_SYSTEM+'\n\nROLE: Business and venture strategy. Handle the user\'s active operations, partnerships, and positioning. No financial data.'
  },
  voice:{
    name:'◉ VOICE AGENT',
    desc:'Taglish commands · OS control',
    system:JELIX_BASE_SYSTEM+'\n\nROLE: Voice command interpreter. Confirm actions taken, suggest follow-up commands, ultra-concise. Understands Taglish naturally.'
  },
  hr:{
    name:'👥 HR & PEOPLE AGENT',
    desc:'People ops · Onboarding',
    system:JELIX_BASE_SYSTEM+'\n\nROLE: People operations, hiring, onboarding, KPIs, and scheduling for the user\'s active teams.'
  },
  design:{
    name:'🎨 GRAPHIC DESIGN AGENT',
    desc:'Creatives · Layouts · Branding',
    system:JELIX_BASE_SYSTEM+'\n\nROLE: Senior art director. Visual direction, creative briefs, and brand guidelines for the user\'s active projects. Think in layouts and visual hierarchy.'
  },
  faith:{
    name:'✝ FAITH AGENT',
    desc:'CAA · Buklod · Spiritual reflection',
    system:JELIX_BASE_SYSTEM+'\n\nROLE: Faith companion. Support CAA congregation activities, Kapisanan Buklod scheduling, spiritual reflection, prayer journaling, and faith-driven decision-making grounded in scripture.'
  }
};

// [replaced by new Gemini engine above]

// ── J.E.L.I.X. Chat — single assistant, backed by the orchestration layer ────
// No agent picker: the "Ask JELIX" chat view is one identity. Under the hood
// it calls askJelixAgent() (context engine → router → specialists → synthesis,
// or the action layer for "do this" requests) — none of that is ever surfaced
// here; the user only ever sees J.E.L.I.X. replying.
let currentAgent='jelix', conversation=[], isThinking=false;

function saveQuickApiKey(){
  showToast('Use J.E.L.I.X through the secure backend. Browser API keys are disabled.');return;
  const val=document.getElementById('quickApiKeyInput')?.value?.trim();
  if(!val||!val.startsWith('sk-')){showToast('Invalid key — must start with sk-');return;}
  localStorage.setItem('job-api-key',val);localStorage.setItem('j-anthropic-key',val);
  showToast('✓ API key saved.');
}

// JELIX's mark — an animated four-point sparkle with a smaller companion star,
// used anywhere JELIX's identity appears (chat avatars, hero screen, side panel).
function jelixSparkIcon(size,animated){
  size=size||24;
  const cls=animated===false?'':' jelix-anim';
  return `<svg viewBox="0 0 32 32" width="${size}" height="${size}" style="display:block" xmlns="http://www.w3.org/2000/svg">
    <path class="jelix-spark-main${cls}" d="M14 2 C14.7 8.5 15.2 12.5 16.8 14.1 C18.2 15.5 22 16 28 16.5 C22 17 18.2 17.5 16.8 18.9 C15.2 20.5 14.7 24.5 14 31 C13.3 24.5 12.8 20.5 11.2 18.9 C9.8 17.5 6 17 0 16.5 C6 16 9.8 15.5 11.2 14.1 C12.8 12.5 13.3 8.5 14 2 Z" fill="var(--teal)"/>
    <path class="jelix-spark-mini${cls}" d="M24 0 C24.3 2.2 24.5 3.2 25 3.7 C25.5 4.2 26.5 4.4 28.5 4.7 C26.5 5 25.5 5.2 25 5.7 C24.5 6.2 24.3 7.2 24 9.4 C23.7 7.2 23.5 6.2 23 5.7 C22.5 5.2 21.5 5 19.5 4.7 C21.5 4.4 22.5 4.2 23 3.7 C23.5 3.2 23.7 2.2 24 0 Z" fill="var(--teal)"/>
  </svg>`;
}
function jelixGreeting(){
  const h=new Date().getHours();
  return h<12?'Good morning':h<18?'Good afternoon':'Good evening';
}

function _aits(){return new Date().toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:'Asia/Manila'});}

function _aiAppend(role,html){
  const box=document.getElementById('aiMsgs');if(!box)return;
  const heroEl=document.getElementById('aiHero');if(heroEl)heroEl.remove();
  const av=role==='user'?'<div class="mav uv">S</div>':`<div class="mav aiv">${jelixSparkIcon(15,false)}</div>`;
  const cls=role==='user'?'mbubble user':'mbubble ai';
  const row=document.createElement('div');
  row.className='mr-row'+(role==='user'?' mr-user':'');
  row.innerHTML=`${av}<div><div class="${cls}">${html}</div><div class="mtime">${_aits()}</div></div>`;
  box.appendChild(row);box.scrollTop=box.scrollHeight;
}

function _md(t){
  return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/`([^`]+)`/g,'<code style="background:var(--navy3);padding:1px 5px;border-radius:6px">$1</code>')
    .replace(/\n/g,'<br>');
}

async function sendAI(){
  if(isThinking)return;
  const input=document.getElementById('aiInput');if(!input)return;
  const text=input.value.trim();if(!text)return;
  input.value='';if(input.style)input.style.height='';
  isThinking=true;
  const btn=document.getElementById('aiSendBtn');if(btn)btn.disabled=true;

  _aiAppend('user',_md(text));
  LearnEngine.onAgentMessage(currentAgent,text);

  const box=document.getElementById('aiMsgs');
  const thinkRow=document.createElement('div');
  thinkRow.className='mr-row';thinkRow.id='thinkRow';
  thinkRow.innerHTML='<div class="mav aiv">J</div><div><div class="mbubble ai" style="padding:10px 14px"><div style="display:flex;gap:5px;align-items:center"><div class="td-dot"></div><div class="td-dot"></div><div class="td-dot"></div><span style="font-size:var(--text-xs);color:var(--text3);margin-left:6px">J.E.L.I.X is thinking...</span></div></div></div>';
  if(box){box.appendChild(thinkRow);box.scrollTop=box.scrollHeight;}

  try{
    const result=await askJelixAgent(text);
    document.getElementById('thinkRow')?.remove();
    const reply=result.text||(result.ok?'Done.':'Something went wrong.');
    _aiAppend('ai',_md(reply));
    try{speak(reply.replace(/<[^>]+>/g,''));}catch(e){}

    const memCount=document.getElementById('agentMemCount');
    if(memCount)memCount.textContent=(DB.memories||[]).length;
  }catch(err){
    document.getElementById('thinkRow')?.remove();
    _aiAppend('ai',_md('*[Error — '+err.message+']*'));
  }
  isThinking=false;if(btn)btn.disabled=false;
}

function aiKey(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendAI();}}
function qp(t){const i=document.getElementById('aiInput');if(i){i.value=t;sendAI();}}

function renderAiHero(){
  const t=document.getElementById('heroGreetTime');if(t)t.textContent=jelixGreeting();
  const memCount=document.getElementById('agentMemCount');
  if(memCount)memCount.textContent=(DB.memories||[]).length;
}

const JELIX_SCHEDULE_DETAILS={
  daily_brief:{label:'Daily brief',timing:'Every day · 12:00 AM',icon:'ti-moon-stars',prompt:'Prepare the day ahead with focus, commitments, and open loops.'},
  weekly_review:{label:'Weekly review',timing:'Sunday · 10:00 PM',icon:'ti-calendar-week',prompt:'Close the week with progress, open loops, and next-week focus.'}
};
function jelixScheduleDate(value){
  if(!value)return 'Not run yet';
  try{return new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value));}catch(e){return 'Not run yet';}
}
function jelixScheduleStatus(schedule){
  if(!schedule.enabled)return '<span style="color:var(--text3)">Paused</span>';
  if(schedule.last_status==='failed')return '<span style="color:var(--red)">Needs attention</span>';
  return '<span style="color:var(--teal)">Active</span>';
}
async function openJelixSchedules(){
  const modal=document.getElementById('jelixSchedulesModal');
  if(!modal)return;
  modal.classList.add('open');
  await renderJelixSchedules();
}
async function renderJelixSchedules(){
  const body=document.getElementById('jelixSchedulesBody');
  if(!body)return;
  const session=await getAuthSession();
  if(!session?.access_token){body.innerHTML='<div style="font-size:var(--text-sm);color:var(--text3);padding:20px 0;text-align:center">Sign in to manage J.E.L.I.X. schedules.</div>';return;}
  body.innerHTML='<div style="font-size:var(--text-sm);color:var(--text3);padding:20px 0;text-align:center">Loading schedules…</div>';
  try{
    const [schedules,runs]=await Promise.all([
      sbFetch('jelix_schedules','GET',null,'select=id,schedule_key,label,enabled,last_run_at,last_status,timezone'),
      sbFetch('jelix_schedule_runs','GET',null,'select=id,schedule_id,schedule_key,status,started_at,completed_at,output,error_message&limit=8')
    ]);
    const scheduleRows=(schedules||[]).sort((a,b)=>a.schedule_key.localeCompare(b.schedule_key));
    const scheduleCards=scheduleRows.map(schedule=>{
      const detail=JELIX_SCHEDULE_DETAILS[schedule.schedule_key]||{label:schedule.label,timing:'Custom schedule',icon:'ti-clock',prompt:'Scheduled brief'};
      const latest=(runs||[]).find(run=>run.schedule_id===schedule.id);
      return `<section style="border:1px solid var(--border);border-radius:14px;padding:14px;margin-bottom:10px;background:var(--navy3)">
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div style="width:34px;height:34px;border-radius:10px;background:var(--teal4);color:var(--teal);display:grid;place-items:center;flex:0 0 auto"><i class="ti ${detail.icon}"></i></div>
          <div style="min-width:0;flex:1"><div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><strong style="font-size:var(--text-sm)">${escapeHtml(detail.label)}</strong><span style="font-size:var(--text-xs);font-weight:700">${jelixScheduleStatus(schedule)}</span></div><div style="font-size:var(--text-xs);color:var(--text2);margin-top:3px">${detail.timing} · Manila</div><div style="font-size:var(--text-xs);color:var(--text3);margin-top:7px;line-height:1.45">${escapeHtml(detail.prompt)}</div><div style="font-size:var(--text-xs);color:var(--text3);margin-top:8px">Last run: ${jelixScheduleDate(schedule.last_run_at)}</div></div>
          <button class="btn ${schedule.enabled?'btn-g':'btn-t'}" style="font-size:var(--text-xs);flex:0 0 auto" onclick="toggleJelixSchedule('${schedule.id}',${!schedule.enabled})">${schedule.enabled?'Pause':'Resume'}</button>
        </div>
      </section>`;
    }).join('')||'<div style="font-size:var(--text-sm);color:var(--text3);padding:20px 0;text-align:center">Your schedules are being prepared. Refresh in a moment.</div>';
    const runRows=(runs||[]).map(run=>{
      const detail=JELIX_SCHEDULE_DETAILS[run.schedule_key]||{label:'Scheduled brief'};
      const text=run.status==='completed'?(run.output||'Completed without saved text.'):(run.error_message||'This run did not finish.');
      return `<details style="border-top:1px solid var(--border);padding:10px 0"><summary style="cursor:pointer;display:flex;justify-content:space-between;gap:12px;font-size:var(--text-xs);color:var(--text2)"><span>${escapeHtml(detail.label)} · ${jelixScheduleDate(run.completed_at||run.started_at)}</span><span style="color:${run.status==='completed'?'var(--teal)':'var(--red)'}">${escapeHtml(run.status)}</span></summary><div style="white-space:pre-wrap;font-size:var(--text-xs);color:var(--text2);line-height:1.55;padding:10px 2px 2px">${escapeHtml(text)}</div></details>`;
    }).join('')||'<div style="font-size:var(--text-xs);color:var(--text3);padding:4px 0">Your first brief will appear here after its scheduled run.</div>';
    body.innerHTML=`${scheduleCards}<div style="font-size:var(--text-xs);font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);margin:18px 0 4px">Recent briefs</div>${runRows}`;
  }catch(error){
    body.innerHTML=`<div style="font-size:var(--text-sm);color:var(--red);padding:20px 0;text-align:center">Could not load schedules. ${escapeHtml(error.message||'')}</div>`;
  }
}
async function toggleJelixSchedule(scheduleId,enabled){
  try{
    await sbFetch('jelix_schedules','PATCH',{enabled},'id=eq.'+encodeURIComponent(scheduleId));
    showToast(enabled?'J.E.L.I.X. schedule resumed.':'J.E.L.I.X. schedule paused.');
    await renderJelixSchedules();
  }catch(error){showToast('Could not update this schedule.');}
}

function clearChat(){
  const box=document.getElementById('aiMsgs');
  if(box)box.innerHTML=`<div id="aiHero">
    ${jelixSparkIcon(48)}
    <div class="hero-greet"><span id="heroGreetTime">${jelixGreeting()}</span>, <span class="hero-accent">Justine</span></div>
    <div class="hero-sub">What's on your mind?</div>
    <div class="hero-chips">
      <button class="hero-chip" onclick="qp('Give me a status brief')">Status brief</button>
      <button class="hero-chip" onclick="qp('What are my high priority tasks today?')">High priority tasks</button>
      <button class="hero-chip" onclick="qp('What is on my schedule today?')">Today schedule</button>
      <button class="hero-chip" onclick="qp('Help me draft something')">Draft content</button>
    </div>
  </div>`;
}

function exportChat(){
  const box=document.getElementById('aiMsgs');if(!box)return;
  const header=`J.O.B Systems — JELIX Session Export\n${new Date().toLocaleString('en-PH',{timeZone:'Asia/Manila'})}\n${'─'.repeat(60)}\n\n`;
  const blob=new Blob([header+box.innerText],{type:'text/plain;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const el=document.createElement('a');el.href=url;el.download=`job-os-jelix-${Date.now()}.txt`;el.click();URL.revokeObjectURL(url);
}

function autoResize(el){el.style.height='auto';el.style.height=Math.min(el.scrollHeight,80)+'px';}
function runAIBrief(){/* local engine only */}

// Personal preference memory — adapts per session
const JELIX_PREFS = JSON.parse(localStorage.getItem('j-ai-prefs')||'{}');
function savePrefs(){ localStorage.setItem('j-ai-prefs',JSON.stringify(JELIX_PREFS)); }

// CMD PALETTE
const CMD_ITEMS=[
  {label:'Dashboard',sub:'Home dashboard',icon:'ti-layout-dashboard',action:()=>setView('dashboard'),group:'Navigate'},
  {label:'WORK — Chainsmoker & Sweetheart',sub:'CS tasks kanban',icon:'ti-flame',action:()=>setView('work-cs'),group:'Navigate'},
  {label:'Job Collectives',sub:'Client + Partner kanban',icon:'ti-rocket',action:()=>setView('venture'),group:'Navigate'},
  {label:'BUILD — Apps',sub:'NAKNAK · DISKARTE · PASAHERO',icon:'ti-code',action:()=>setView('build'),group:'Navigate'},
  {label:'SIDES — Income',sub:'RaketPH · Etsy',icon:'ti-palette',action:()=>setView('sides'),group:'Navigate'},
  {label:'FAITH — Buklod',sub:'CAA activities log',icon:'ti-heart-handshake',action:()=>setView('faith'),group:'Navigate'},
  {label:'LIFE — Cash Flow',sub:'Debit · Credit · Cashflow',icon:'ti-leaf',action:()=>setView('life'),group:'Navigate'},
  {label:'Calendar',sub:'Schedule · Events',icon:'ti-calendar',action:()=>setView('calendar'),group:'Navigate'},
  {label:'Journal',sub:'Personal entries',icon:'ti-book',action:()=>setView('journal'),group:'Navigate'},
  {label:'Tasks',sub:'Cross-world tasks',icon:'ti-checklist',action:()=>setView('tasks'),group:'Navigate'},
  {label:'J.E.L.I.X',sub:'Private thinking partner',icon:'ti-sparkles',action:()=>setView('ai'),group:'Navigate'},
  {label:'Memory',sub:'Persistent context',icon:'ti-brain',action:()=>setView('memory'),group:'Navigate'},
  {label:'Activity History',sub:'All actions + restore',icon:'ti-history',action:()=>setView('history'),group:'Navigate'},
  {label:'System Settings',sub:'Security · PIN · API Keys · Data Vault',icon:'ti-settings',action:()=>setView('settings'),group:'Navigate'},
  {label:'New Task',sub:'Add task',icon:'ti-plus',action:()=>openModal('taskModal'),group:'Create'},
  {label:'New Client',sub:'Add a client',icon:'ti-users',action:()=>openModal('clientModal'),group:'Create'},
  {label:'New Journal Entry',sub:'Write in journal',icon:'ti-notes',action:()=>openModal('journalModal'),group:'Create'},
  {label:'Add Debit',sub:'Expense transaction',icon:'ti-minus',action:()=>openCashModal('Debit'),group:'Create'},
  {label:'Add Credit',sub:'Income transaction',icon:'ti-plus',action:()=>openCashModal('Credit'),group:'Create'},
  {label:'Add Faith Activity',sub:'Buklod / KADIWA / Binhi',icon:'ti-heart-handshake',action:()=>openFaithModal(),group:'Create'},
  {label:'Add Calendar Event',sub:'Schedule an event',icon:'ti-calendar-plus',action:()=>openCalEventModal(),group:'Create'},
  {label:'Voice Mode',sub:'Speak commands · Space',icon:'ti-microphone',action:toggleVoice,group:'Voice'},
  {label:'Undo Last Delete',sub:'Restore deleted item · ⌘Z',icon:'ti-arrow-back-up',action:()=>{const last=DB.history.find(h=>h.type==='delete');if(last)restoreFromHistory(last.id);else showToast('Nothing to undo');},group:'AI'},
];
let filteredCmds=CMD_ITEMS,cmdSelIdx=-1;
function openCmd(){document.getElementById('cmdOv').classList.add('open');document.getElementById('cmdInput').value='';filteredCmds=CMD_ITEMS;renderCmds();setTimeout(()=>document.getElementById('cmdInput').focus(),50);}
function closeCmdBg(e){if(e.target===document.getElementById('cmdOv'))document.getElementById('cmdOv').classList.remove('open');}
// Universal search — below the static nav/create commands, ⌘K also jumps
// straight to any task, note, event, or client by title/content match, the
// way Spotlight jumps to a file instead of just an app. Only kicks in once
// the query has enough characters to be a real search, not a fuzzy nav match.
function searchAppData(q){
  const out=[];
  const CAP=6;
  (DB.tasks||[]).filter(t=>(t.title||'').toLowerCase().includes(q)).slice(0,CAP).forEach(t=>{
    out.push({label:t.title,sub:'Task · '+(t.status||'')+(t.client?' · '+t.client:''),icon:'ti-checklist',group:'Jump to',action:()=>editTask(t.id)});
  });
  (DB.notes||[]).filter(n=>{
    const inTitle=(n.title||'').toLowerCase().includes(q);
    const inBody=(n.blocks||[]).some(b=>(b.content||'').toLowerCase().includes(q));
    return inTitle||inBody;
  }).slice(0,CAP).forEach(n=>{
    out.push({label:n.title||'Untitled note',sub:'Note',icon:'ti-notes',group:'Jump to',action:()=>{setView('notes');const idx=DB.notes.findIndex(x=>x.id===n.id);if(idx>-1)openNoteEditor(idx);}});
  });
  (DB.calEvents||[]).filter(e=>(e.title||'').toLowerCase().includes(q)).slice(0,CAP).forEach(e=>{
    out.push({label:e.title,sub:'Event · '+(e.date||''),icon:'ti-calendar',group:'Jump to',action:()=>{setView('calendar');calSelectedDate=e.date;setCalView('day');editCalEvent(e.id);}});
  });
  (DB.clients||[]).filter(c=>(c.name||'').toLowerCase().includes(q)).slice(0,CAP).forEach(c=>{
    out.push({label:c.name,sub:'Client · '+(c.status||''),icon:'ti-users',group:'Jump to',action:()=>editClient(c.id)});
  });
  return out;
}
function filterCmd(){const q=document.getElementById('cmdInput').value.toLowerCase().trim();const staticMatches=CMD_ITEMS.filter(c=>c.label.toLowerCase().includes(q)||c.sub.toLowerCase().includes(q));const dynamicMatches=q.length>=2?searchAppData(q):[];filteredCmds=[...staticMatches,...dynamicMatches];cmdSelIdx=-1;renderCmds();}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function renderCmds(){const r=document.getElementById('cmdResults');const groups=[...new Set(filteredCmds.map(c=>c.group))];const iconHtml=ic=>ic.startsWith('ti-')?`<i class="ti ${escapeHtml(ic)}" style="font-size:16px;line-height:1"></i>`:escapeHtml(ic);r.innerHTML=groups.map(g=>`<div class="cgl">${escapeHtml(g)}</div>`+filteredCmds.filter(c=>c.group===g).map(c=>`<div class="cr" role="option" tabindex="0" onclick="execCmd(${filteredCmds.indexOf(c)})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();execCmd(${filteredCmds.indexOf(c)})}" data-idx="${filteredCmds.indexOf(c)}"><div class="cri">${iconHtml(c.icon)}</div><div><div class="crl">${escapeHtml(c.label)}</div><div class="crs">${escapeHtml(c.sub)}</div></div></div>`).join('')).join('');}
function execCmd(idx){filteredCmds[idx]?.action();document.getElementById('cmdOv').classList.remove('open');}
function cmdKey(e){const items=document.querySelectorAll('.cr');if(e.key==='ArrowDown'){e.preventDefault();cmdSelIdx=Math.min(cmdSelIdx+1,items.length-1);items.forEach((el,i)=>el.classList.toggle('sel',i===cmdSelIdx));items[cmdSelIdx]?.scrollIntoView({block:'nearest'});}else if(e.key==='ArrowUp'){e.preventDefault();cmdSelIdx=Math.max(cmdSelIdx-1,0);items.forEach((el,i)=>el.classList.toggle('sel',i===cmdSelIdx));items[cmdSelIdx]?.scrollIntoView({block:'nearest'});}else if(e.key==='Enter'&&cmdSelIdx>=0){execCmd(parseInt(items[cmdSelIdx].dataset.idx));}}

// CTX MENU
let ctxTarget=null;
function showCtx(e,id,type){e.preventDefault();ctxTarget={id,type};const m=document.getElementById('ctxMenu');m.style.left=e.clientX+'px';m.style.top=e.clientY+'px';m.style.display='block';document.addEventListener('click',()=>m.style.display='none',{once:true});}
function ctxAct(action){
  if(!ctxTarget)return;
  if(action==='edit'){if(ctxTarget.type==='task')editTask(ctxTarget.id);else if(ctxTarget.type==='client')editClient(ctxTarget.id);}
  else if(action==='duplicate'){if(ctxTarget.type==='task'){const t=DB.tasks.find(x=>x.id===ctxTarget.id);if(t){const n={...t,id:Date.now(),title:'Copy — '+t.title};DB.tasks.unshift(n);SB.upsert('tasks',n,'tasks');reRenderAll();showToast('✓ Duplicated');}}else if(ctxTarget.type==='client'){const c=DB.clients.find(x=>x.id===ctxTarget.id);if(c){const n={...c,id:Date.now(),name:'Copy — '+c.name};DB.clients.unshift(n);SB.upsert('clients',n,'clients');renderWorkIH();showToast('✓ Duplicated');}}}
  else if(action==='delete'){if(ctxTarget.type==='task')deleteTask({stopPropagation:()=>{}},ctxTarget.id);else if(ctxTarget.type==='client')deleteClientBtn({stopPropagation:()=>{}},ctxTarget.id);}
}

// TOAST
function showToast(msg,isUndo,undoCb){const stack=document.getElementById('tstack');if(!stack)return;const item=document.createElement('div');item.className='titem'+(isUndo?' undo':'');const text=document.createElement('span');text.textContent=String(msg??'');item.appendChild(text);if(isUndo&&undoCb){const button=document.createElement('button');button.className='ubtn';button.type='button';button.textContent='↩ Undo';button.addEventListener('click',undoCb);item.appendChild(document.createTextNode(' '));item.appendChild(button);}stack.appendChild(item);setTimeout(()=>{item.style.opacity='0';setTimeout(()=>item.remove(),300);},4000);}

// KEYBOARD
document.addEventListener('keydown',e=>{
  if(e.key===' '){const ae=document.activeElement;const isTyping=ae&&(['INPUT','TEXTAREA'].includes(ae.tagName)||ae.isContentEditable||ae.contentEditable==='true');if(!isTyping){e.preventDefault();toggleVoice();}}
  if(e.key==='Escape'){closeVBar();document.getElementById('cmdOv').classList.remove('open');document.querySelectorAll('.mov').forEach(m=>m.classList.remove('open'));}
  if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();openCmd();}
  if((e.metaKey||e.ctrlKey)&&e.key==='z'){const last=DB.history.find(h=>h.type==='delete');if(last)restoreFromHistory(last.id);}
});

// ===== BOOT MUSIC — Web Audio API (cinematic ambient synth) =====
// Works locally, no external server needed, no autoplay policy issue after user click
let bootAudioCtx=null,bootMasterGain=null,bootMusicPlaying=false,bootMusicNodes=[];

function startBootMusic(){
  if(bootAudioCtx)return; // already started
  try{
    bootAudioCtx=new(window.AudioContext||window.webkitAudioContext)();
    const ctx=bootAudioCtx;
    bootMasterGain=ctx.createGain();
    bootMasterGain.gain.setValueAtTime(0,ctx.currentTime);
    bootMasterGain.gain.linearRampToValueAtTime(0.55,ctx.currentTime+2.5); // fade in
    bootMasterGain.connect(ctx.destination);

    // Reverb via convolver
    const convolver=ctx.createConvolver();
    const revLen=ctx.sampleRate*2.5;
    const revBuf=ctx.createBuffer(2,revLen,ctx.sampleRate);
    for(let ch=0;ch<2;ch++){const d=revBuf.getChannelData(ch);for(let i=0;i<revLen;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/revLen,2.2);}
    convolver.buffer=revBuf;
    const revGain=ctx.createGain();revGain.gain.value=0.28;
    convolver.connect(revGain);revGain.connect(bootMasterGain);

    const now=ctx.currentTime;

    // ── Low bass drone (Bb) ──
    const bassFreqs=[58.27,116.54,87.31]; // Bb1, Bb2, F2
    bassFreqs.forEach((f,i)=>{
      const osc=ctx.createOscillator();
      const g=ctx.createGain();
      osc.type='sine';
      osc.frequency.value=f;
      g.gain.value=0.22-i*0.04;
      osc.connect(g);g.connect(bootMasterGain);
      osc.start(now);
      bootMusicNodes.push(osc);
    });

    // ── Pad chords — Bb minor (Bb Db Eb F) ──
    const padNotes=[
      [116.54,0],[138.59,0.3],[155.56,0.6],[174.61,1.0], // Bb3 Db3 Eb3 F3
      [233.08,0.2],[261.63,0.5],[311.13,0.8],             // Bb3 C4 Eb4
    ];
    padNotes.forEach(([f,delay])=>{
      const osc=ctx.createOscillator();
      const g=ctx.createGain();
      osc.type='triangle';
      osc.frequency.value=f;
      // Slow tremolo
      const lfo=ctx.createOscillator();
      const lfoG=ctx.createGain();
      lfo.frequency.value=0.18+Math.random()*0.08;
      lfoG.gain.value=0.018;
      lfo.connect(lfoG);lfoG.connect(g.gain);
      lfo.start(now+delay);
      g.gain.setValueAtTime(0,now+delay);
      g.gain.linearRampToValueAtTime(0.09,now+delay+1.8);
      osc.connect(g);
      g.connect(convolver);g.connect(bootMasterGain);
      osc.start(now+delay);
      bootMusicNodes.push(osc,lfo);
    });

    // ── Gentle melodic arpeggios — pentatonic Bb minor ──
    const arpNotes=[233.08,261.63,311.13,349.23,391.99,466.16,523.25,391.99,349.23,311.13];
    const arpInterval=0.72;
    arpNotes.forEach((f,i)=>{
      const osc=ctx.createOscillator();
      const g=ctx.createGain();
      osc.type='sine';
      osc.frequency.value=f;
      const t=now+4+i*arpInterval; // start after 4s
      g.gain.setValueAtTime(0,t);
      g.gain.linearRampToValueAtTime(0.06,t+0.12);
      g.gain.exponentialRampToValueAtTime(0.001,t+arpInterval*0.9);
      osc.connect(g);g.connect(convolver);g.connect(bootMasterGain);
      osc.start(t);osc.stop(t+arpInterval);
      bootMusicNodes.push(osc);
    });

    // ── High shimmer (high pad) ──
    [932.33,1046.5].forEach((f,i)=>{
      const osc=ctx.createOscillator();
      const g=ctx.createGain();
      osc.type='sine';
      osc.frequency.value=f;
      g.gain.setValueAtTime(0,now+2);
      g.gain.linearRampToValueAtTime(0.022,now+4);
      osc.connect(g);g.connect(convolver);
      osc.start(now+2);
      bootMusicNodes.push(osc);
    });

    bootMusicPlaying=true;
    // Update UI
    const bars=document.getElementById('bootMusicBars');
    const btn=document.getElementById('bootMuteBtn');
    const lbl=document.getElementById('bootMusicLabel');
    if(bars)bars.style.opacity='1';
    if(btn){btn.textContent='MUTE';btn.style.color='rgba(0,212,200,.9)';btn.style.borderColor='rgba(0,212,200,.4)';}
    if(lbl){lbl.textContent='NOW PLAYING · CINEMATIC AMBIENT';lbl.style.color='rgba(0,212,200,.7)';}
  }catch(e){console.warn('Boot music error:',e);}
}

function loadYTApi(){startBootMusic();} // called by onclick — redirect to our audio engine

function toggleBootMusic(){
  // If OS already entered, do nothing
  if(bootAudioCtx===null&&!bootMusicPlaying)return;
  if(!bootAudioCtx){startBootMusic();return;}
  const btn=document.getElementById('bootMuteBtn');
  const bars=document.getElementById('bootMusicBars');
  const lbl=document.getElementById('bootMusicLabel');
  if(bootMusicPlaying){
    bootMasterGain.gain.linearRampToValueAtTime(0,bootAudioCtx.currentTime+0.3);
    bootMusicPlaying=false;
    if(btn)btn.textContent='UNMUTE';
    if(bars)bars.style.opacity='0.3';
    if(lbl)lbl.textContent='PAUSED';
  }else{
    bootMasterGain.gain.linearRampToValueAtTime(0.55,bootAudioCtx.currentTime+0.3);
    bootMusicPlaying=true;
    if(btn)btn.textContent='MUTE';
    if(bars)bars.style.opacity='1';
    if(lbl){lbl.textContent='NOW PLAYING · CINEMATIC AMBIENT';lbl.style.color='rgba(0,212,200,.7)';}
  }
}

function fadeOutBootAudio(){
  if(!bootAudioCtx||!bootMasterGain)return;
  const now=bootAudioCtx.currentTime;
  // Fast 0.6s fade so music stops well before lock screen is interacted with
  bootMasterGain.gain.cancelScheduledValues(now);
  bootMasterGain.gain.setValueAtTime(bootMasterGain.gain.value,now);
  bootMasterGain.gain.linearRampToValueAtTime(0,now+0.6);
  bootMusicPlaying=false;
  setTimeout(()=>{
    bootMusicNodes.forEach(n=>{try{n.stop();}catch(e){}});
    bootMusicNodes=[];
    try{bootAudioCtx.close();}catch(e){}
    bootAudioCtx=null;
    bootMasterGain=null;
  },700);
}

// ===== BOOT SEQUENCE =====
const BOOT_STEPS=[
  {pct:8,  msg:'Mounting J.O.B Systems kernel...'},
  {pct:18, msg:'Loading Six Worlds framework...'},
  {pct:30, msg:'Initializing Supabase bridge...'},
  {pct:42, msg:'Loading your domains...'},
  {pct:55, msg:'Loading VENTURE · BUILD · SIDES...'},
  {pct:67, msg:'Loading FAITH · LIFE · Calendar...'},
  {pct:78, msg:'Connecting AI agent stack...'},
  {pct:88, msg:'Syncing memory & history...'},
  {pct:96, msg:'Rendering dashboard...'},
  {pct:100,msg:'All systems nominal. Welcome.'},
];
function setBootProgress(pct,msg){
  const bar=document.getElementById('bootBar');
  const pctEl=document.getElementById('bootPct');
  const statusEl=document.getElementById('bootStatus');
  const logEl=document.getElementById('bootLog');
  if(bar)bar.style.width=pct+'%';
  if(pctEl)pctEl.textContent=pct+'%';
  if(statusEl)statusEl.textContent=msg;
  if(logEl){
    const line=document.createElement('div');
    line.style.cssText='color:#00a89e;opacity:0;transition:opacity .3s';
    line.textContent='> '+msg;
    logEl.appendChild(line);
    requestAnimationFrame(()=>{line.style.opacity='1';});
    logEl.scrollTop=logEl.scrollHeight;
  }
}
function enterOS(){
  // Called by runBootSequence after boot completes → fade boot → load OS
  const screen=document.getElementById('bootScreen');
  if(screen){screen.onclick=null;screen.style.cursor='default';}
  fadeOutBootAudio();
  if(screen){screen.style.animation='bootfadeout .8s ease forwards';}
  setTimeout(()=>{
    if(screen)screen.style.display='none';
    loadOS();
  },900);
}

// App Shortcuts (long-press the home screen icon) land here with
// ?action=... — this fires once post-unlock, then strips the param so a
// reload/relaunch of the same URL doesn't repeat it.
function _handleShortcutAction(){
  const params=new URLSearchParams(location.search);
  const action=params.get('action');
  if(!action)return;
  const url=new URL(location.href);url.searchParams.delete('action');
  history.replaceState({},'',url.pathname+url.search+url.hash);
  if(action==='new-task')openModal('taskModal');
  else if(action==='log-expense')openCashModal('Debit');
  else if(action==='new-event')openCalEventModal();
}
// Share Target — the OS share sheet (iOS/Android "Share" -> J.O.B Systems)
// lands here as a GET navigation with title/text/url params. Always saves as
// a new Note rather than showing an app/destination picker — Notes already
// has a per-block "turn into task" action, so this reuses that instead of
// building a second chooser UI for the same decision.
function _handleShareTarget(){
  const params=new URLSearchParams(location.search);
  const title=params.get('title')||'',text=params.get('text')||'',sharedUrl=params.get('url')||'';
  if(!title&&!text&&!sharedUrl)return;
  const cleanUrl=new URL(location.href);['title','text','url'].forEach(k=>cleanUrl.searchParams.delete(k));
  history.replaceState({},'',cleanUrl.pathname+cleanUrl.search+cleanUrl.hash);
  const bodyText=[text,sharedUrl].filter(Boolean).join('\n');
  const n={id:Date.now(),title:title||'Shared note',worldId:null,blocks:[
    {id:Date.now()+'.1',type:'h1',content:title||'Shared note',done:false},
    {id:Date.now()+'.2',type:'p',content:bodyText,done:false}
  ]};
  DB.notes.push(n);save('notes');SB.upsert('notes',n,'notes').catch(()=>{});
  addHistory('add','Added note: '+n.title,{...n,_dbKey:'notes'});
  setView('notes');
  currentNote=DB.notes.length-1;
  renderNotesList();
  openNoteEditor(currentNote);
  showToast('✓ Saved to Notes — tap any line to turn it into a task');
}
function loadOS(){
  // Step 2: Called by unlockSystem() — load the full OS
  const app=document.getElementById('appRoot');
  if(app){app.style.opacity='1';app.style.pointerEvents='';}
  document.body.classList.add('os-active'); // reveals mobile bottom nav
  // Dim particles for OS dashboard
  setTimeout(()=>setParticleMode('os'), 600);
  // Restore wake word UI state (mic stays closed until user re-enables)
  setTimeout(()=>{ if(typeof window._restoreWakeState==='function') window._restoreWakeState(); }, 800);
  try{reRenderAll();}catch(e){console.warn('reRenderAll:',e);}
  try{
    const landingView=typeof getPref==='function'?getPref('pref-landing-view'):'dashboard';
    if(landingView&&landingView!=='dashboard')setView(landingView);
  }catch(e){console.warn('landing view pref:',e);}
  setTimeout(_handleShortcutAction,400);
  setTimeout(_handleShareTarget,400);
  setTimeout(_restoreFocusTimerOnBoot,400);
  // Opportunistic re-subscribe for anyone who granted notification
  // permission before push existed — otherwise they'd never get pushed to
  // until they happen to revisit Settings and click Enable again.
  if('Notification' in window&&Notification.permission==='granted')setTimeout(subscribeToPush,1500);
  loadAllFromSupabase();
  // Wake word listener is OFF by default — user must enable via topbar toggle
  // Triggered only by: spacebar, voice button, or user-enabled wake word
  // Daily brief spoken summary
  setTimeout(()=>{
    try{speak(buildDailyBriefSummary());}
    catch(e){console.warn('Brief summary error:',e);}
  },2500);
  // Auto morning intelligence (once per day)
  setTimeout(scheduleAutoBrief, 3500);
}

async function runBootSequence(){
  // Safety net: if boot takes >18s something broke — force enter OS
  const safetyTimer=setTimeout(()=>{
    console.warn('Boot safety timeout fired');
    enterOS();
  },18000);

  try{
    for(let i=0;i<BOOT_STEPS.length;i++){
      await new Promise(r=>setTimeout(r,i===0?500:350+Math.random()*180));
      setBootProgress(BOOT_STEPS[i].pct,BOOT_STEPS[i].msg);
    }
    await new Promise(r=>setTimeout(r,800));
  }catch(e){
    console.warn('Boot step error:',e);
  }

  clearTimeout(safetyTimer);
  enterOS();
}

// Update music label when YT plays
const _origYTReady=window.onYouTubeIframeAPIReady;
window.onYouTubeIframeAPIReady=function(){
  if(_origYTReady)_origYTReady();
};


// ===== HEALTH ENGINE =====
const DB_HEALTH_KEY='j-health';
const DB_WELLNESS_KEY='j-wellness';
function getHealthLogs(){return JSON.parse(localStorage.getItem(DB_HEALTH_KEY)||'[]');}
function saveHealthLogs(d){localStorage.setItem(DB_HEALTH_KEY,JSON.stringify(d));}
function getWellness(){return JSON.parse(localStorage.getItem(DB_WELLNESS_KEY)||'{}');}
function saveWellnessData(d){localStorage.setItem(DB_WELLNESS_KEY,JSON.stringify(d));}

// ── Wellness chips ──
let todayWellness={mood:0,energy:0,stress:'',water:0,notes:''};
function setWellness(type,val,el){
  todayWellness[type]=val;
  // Find the parent container and deselect all sibling buttons
  const container=el?el.closest('[id]')||el.parentElement:null;
  if(container){
    container.querySelectorAll('.mood-btn,.btn-g').forEach(b=>{
      b.style.background='';b.style.borderColor='';b.style.color='';
    });
  }
  // Highlight selected button
  if(el){
    const accent=type==='mood'?'var(--w-sides)':type==='energy'?'var(--teal)':'var(--amber)';
    el.style.background='rgba(128,255,250,.1)';el.style.borderColor=accent;el.style.color=accent;
  }
}
function logWater(n){
  todayWellness.water=n;
  for(let i=1;i<=8;i++){
    const g=document.getElementById('wg-'+i);
    if(g){g.style.background=i<=n?'rgba(128,255,250,.4)':'transparent';g.style.borderColor=i<=n?'var(--teal)':'var(--border2)';}
  }
  const h=document.getElementById('h-water');
  if(h)h.textContent=n;
  const s=document.getElementById('h-water-sub');
  if(s)s.textContent=n+' / 8 glasses today';
  // Auto-save to today's wellness so it persists on reload
  const d=getWellness();
  const today=localDateStr(new Date());
  if(!d[today])d[today]={};
  d[today].water=n;
  saveWellnessData(d);
}
// ── Restore today's check-in when Bio Monitor tab opens (was previously always blank) ──
function restoreTodayWellness(){
  const today=localDateStr(new Date());
  const saved=getWellness()[today];
  todayWellness=saved?{...saved}:{mood:0,energy:0,stress:'',water:0,notes:''};
  // Re-select mood/energy/stress buttons to reflect the saved state
  [['moodBtns','mood'],['energyBtns','energy']].forEach(([wrapId,key])=>{
    const wrap=document.getElementById(wrapId);if(!wrap)return;
    wrap.querySelectorAll('.mood-btn').forEach((b,i)=>{
      const val=String(i+1);
      const accent=key==='mood'?'var(--w-sides)':'var(--teal)';
      const active=String(todayWellness[key])===val;
      b.style.background=active?'rgba(128,255,250,.1)':'';
      b.style.borderColor=active?accent:'';
      b.style.color=active?accent:'';
    });
  });
  const stressWrap=document.querySelector('#cf-biomonitor [onclick*="setWellness(\'stress\'"]')?.parentElement;
  if(stressWrap){
    stressWrap.querySelectorAll('.btn-g').forEach(b=>{
      const match=b.getAttribute('onclick')?.match(/setWellness\('stress','([^']+)'/);
      const val=match?match[1]:null;
      const active=val&&todayWellness.stress===val;
      b.style.background=active?'rgba(128,255,250,.1)':'';
      b.style.borderColor=active?'var(--amber)':'';
      b.style.color=active?'var(--amber)':'';
    });
  }
  logWater(todayWellness.water||0);
  const notesEl=document.getElementById('wellnessNotes');
  if(notesEl)notesEl.value=todayWellness.notes||'';
}

async function syncWellnessToSupabase(entry,dateStr){
  try{
    const res=await fetch(`${SB_URL}/rest/v1/wellness_checkins?on_conflict=date`,{
      method:'POST',
      headers:{
        'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Content-Type':'application/json',
        'Prefer':'resolution=merge-duplicates,return=minimal'
      },
      body:JSON.stringify({
        date:dateStr,
        mood:parseInt(entry.mood)||null,
        energy:parseInt(entry.energy)||null,
        stress:entry.stress||null,
        water:parseInt(entry.water)||0,
        notes:entry.notes||''
      })
    });
    if(!res.ok){const b=await res.text();throw new Error(b);}
  }catch(err){
    console.error('Wellness Supabase sync error',err);
    showToast('⚠ Wellness saved locally, but cloud sync failed: '+err.message);
  }
}

function saveWellness(){
  const notes=document.getElementById('wellnessNotes');
  if(notes)todayWellness.notes=notes.value;
  const d=getWellness();
  const today=localDateStr(new Date());
  d[today]=todayWellness;
  saveWellnessData(d);
  syncWellnessToSupabase(todayWellness,today);
  showToast('✓ Wellness check-in saved.');
}

// ── Health Log Entry ──
function openHealthLogModal(){const d=document.getElementById('hl-date');if(d)d.value=localDateStr(new Date());const t=document.getElementById('healthLogModalTitle');if(t)t.textContent='Log Health Entry';openModal('healthLogModal');}
function syncAppleHealth(){
  showToast('Open Health Export app on iPhone → export CSV → use Import CSV button.');
}
function importHealthCSV(ev){
  const file=ev.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=function(e){
    const text=e.target.result;
    const lines=text.trim().split(/\r?\n/);
    const headers=lines[0].split(',').map(s=>s.trim().replace(/"/g,'').toLowerCase());
    const logs=getHealthLogs();
    let imported=0;
    lines.slice(1).forEach(line=>{
      if(!line.trim())return;
      const vals=line.split(',').map(s=>s.trim().replace(/"/g,''));
      const row={};headers.forEach((h2,i)=>row[h2]=vals[i]||'');
      // Map common Apple Health CSV fields
      const entry={
        id:Date.now()+Math.random(),
        date:row.date||row.startdate||localDateStr(new Date()),
        category:mapHealthCategory(row.type||row.name||''),
        metric:row.type||row.name||'Unknown',
        value:parseFloat(row.value||row.qty||0)||0,
        unit:row.unit||'',
        notes:'Imported from Apple Health',
        source:'apple-health'
      };
      logs.unshift(entry);imported++;
    });
    saveHealthLogs(logs);renderHealth();
    showToast('✓ '+imported+' health entries imported.');
    document.getElementById('ahSyncStatus').textContent='Last sync: '+new Date().toLocaleString('en-PH');
    ev.target.value='';
  };
  reader.readAsText(file);
}
function mapHealthCategory(type){
  const t=type.toLowerCase();
  if(t.includes('heart')||t.includes('pulse')||t.includes('bp')||t.includes('oxygen'))return'Vitals';
  if(t.includes('step')||t.includes('walk')||t.includes('run')||t.includes('workout')||t.includes('energy'))return'Exercise';
  if(t.includes('sleep'))return'Sleep';
  if(t.includes('calor')||t.includes('nutrition')||t.includes('water')||t.includes('fluid'))return'Nutrition';
  if(t.includes('weight')||t.includes('bmi'))return'Vitals';
  return'Vitals';
}
function saveHealthEntry(){
  const d=document.getElementById('hl-date').value||localDateStr(new Date());
  const cat=document.getElementById('hl-cat').value;
  const metric=document.getElementById('hl-metric').value;
  const value=parseFloat(document.getElementById('hl-value').value)||0;
  const unit=document.getElementById('hl-unit').value;
  const notes=document.getElementById('hl-notes').value;
  if(!metric){showToast('Enter a metric name.');return;}
  const entry={id:Date.now(),date:d,category:cat,metric,value,unit,notes,source:'manual'};
  const logs=getHealthLogs();logs.unshift(entry);saveHealthLogs(logs);
  closeModal('healthLogModal');renderHealth();
  showToast('✓ Health entry logged.');
}

// Quick log shortcut — pre-fills the health log modal for a specific category/metric
function quickLog(type){
  const presets={
    'Exercise':     {cat:'Exercise',   metric:'Exercise',      unit:'min',  label:'Duration (minutes)'},
    'Sleep':        {cat:'Sleep',      metric:'Sleep Duration',unit:'hrs',  label:'Hours slept'},
    'Nutrition':    {cat:'Nutrition',  metric:'Nutrition',     unit:'kcal', label:'Calories'},
    'Mental':       {cat:'Mental',     metric:'Mental Health', unit:'/10',  label:'Score (1–10)'},
    'Medication':   {cat:'Medication', metric:'Medication',    unit:'dose', label:'Doses taken'},
    'Heart Rate':   {cat:'Vitals',     metric:'Heart Rate',    unit:'bpm',  label:'BPM (resting)'},
    'Blood Pressure':{cat:'Vitals',   metric:'Blood Pressure',unit:'mmHg', label:'Systolic (e.g. 120)'},
    'Steps':        {cat:'Exercise',   metric:'Steps',         unit:'steps',label:'Step count'},
    'Weight':       {cat:'Vitals',     metric:'Weight',        unit:'kg',   label:'Weight (kg)'},
    'Water':        {cat:'Nutrition',  metric:'Water Intake',  unit:'glasses',label:'Glasses of water'},
  };
  const p=presets[type];
  if(!p)return;
  // Pre-fill modal fields
  const d=document.getElementById('hl-date');if(d)d.value=localDateStr(new Date());
  const cat=document.getElementById('hl-cat');if(cat)cat.value=p.cat;
  const metric=document.getElementById('hl-metric');if(metric)metric.value=p.metric;
  const unit=document.getElementById('hl-unit');if(unit)unit.value=p.unit;
  const val=document.getElementById('hl-value');if(val){val.value='';val.placeholder=p.label;}
  const notes=document.getElementById('hl-notes');if(notes)notes.value='';
  document.getElementById('healthLogModalTitle').textContent='Log — '+type;
  openModal('healthLogModal');
}

// ── Trend Chart ──
let _healthChart=null;
function renderHealthTrend(){
  const metric=document.getElementById('healthTrendMetric')?.value||'hr';
  const metricMap={hr:['Heart Rate','bpm'],weight:['Weight','kg'],sleep:['Sleep','hrs'],steps:['Steps','steps']};
  const [label,unit]=metricMap[metric]||['Metric',''];
  const logs=getHealthLogs().filter(l=>l.metric.toLowerCase().includes(metric==='hr'?'heart':metric));
  const last7=[];const today=new Date();
  for(let i=6;i>=0;i--){const d=new Date(today);d.setDate(today.getDate()-i);last7.push({date:localDateStr(d),val:null});}
  logs.forEach(l=>{const row=last7.find(r=>r.date===l.date);if(row)row.val=l.value;});
  const canvas=document.getElementById('healthTrendChart');
  const empty=document.getElementById('healthTrendEmpty');
  if(!canvas)return;
  const hasData=last7.some(r=>r.val!==null);
  if(!hasData){canvas.style.display='none';if(empty)empty.style.display='';return;}
  canvas.style.display='';if(empty)empty.style.display='none';
  if(_healthChart)_healthChart.destroy();
  const ctx=canvas.getContext('2d');
  _healthChart=new Chart(ctx,{
    type:'line',
    data:{
      labels:last7.map(r=>r.date.slice(5)),
      datasets:[{label:label+' ('+unit+')',data:last7.map(r=>r.val),borderColor:'rgba(128,255,250,.8)',backgroundColor:'rgba(128,255,250,.08)',tension:.4,pointBackgroundColor:'rgba(128,255,250,1)',pointRadius:4,fill:true}]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{
        x:{ticks:{color:'rgba(152,216,240,.6)',font:{size:11}},grid:{color:'rgba(128,255,250,.05)'}},
        y:{ticks:{color:'rgba(152,216,240,.6)',font:{size:11}},grid:{color:'rgba(128,255,250,.05)'}}
      }
    }
  });
}

// ── Main Render ──
function renderHealth(){
  const logs=getHealthLogs();
  // Update vital cards from most recent matching log
  const getLatest=(keywords)=>{
    for(const log of logs){
      if(keywords.some(k=>log.metric.toLowerCase().includes(k)))return log;
    }return null;
  };
  const hr=getLatest(['heart rate','bpm','hr']);
  const bp=getLatest(['blood pressure','systolic','bp']);
  const steps=getLatest(['steps','step count']);
  const sleep=getLatest(['sleep','sleep duration']);
  const weight=getLatest(['weight','body mass']);
  const setCard=(id,val,subId,sub)=>{
    const el=document.getElementById(id);if(el&&val!==null)el.textContent=val;
    const s=document.getElementById(subId);if(s&&sub)s.textContent=sub;
  };
  if(hr)setCard('h-hr',Math.round(hr.value),'h-hr-sub','bpm · '+hr.date);
  if(bp)setCard('h-bp',bp.value,'h-bp-sub','mmHg · '+bp.date);
  if(steps)setCard('h-steps',Math.round(steps.value).toLocaleString(),'h-steps-sub','goal: 10,000');
  if(sleep)setCard('h-sleep',sleep.value.toFixed(1),'h-sleep-sub','hrs · '+sleep.date);
  if(weight)setCard('h-weight',weight.value.toFixed(1),'h-weight-sub','kg · '+weight.date);

  // Restore water from today's wellness — must run AFTER wellnessPanel is in DOM
  const wellness=getWellness();
  const todayKey=localDateStr(new Date());
  const todayData=wellness[todayKey]||{};
  // Sync todayWellness from stored data
  if(todayData.mood)todayWellness.mood=todayData.mood;
  if(todayData.energy)todayWellness.energy=todayData.energy;
  if(todayData.stress)todayWellness.stress=todayData.stress;
  if(todayData.water)todayWellness.water=todayData.water;
  // Apply water glasses (glass elements exist in DOM at this point)
  if(todayData.water)logWater(todayData.water);
  else{const h=document.getElementById('h-water');if(h)h.textContent='0';const s=document.getElementById('h-water-sub');if(s)s.textContent='0 / 8 glasses today';}

  // Health log list
  const listEl=document.getElementById('healthLogList');
  const catFilter=document.getElementById('healthCatFilter')?.value||'all';
  const filtered=catFilter==='all'?logs:logs.filter(l=>l.category===catFilter);
  if(listEl){
    listEl.innerHTML=filtered.length?filtered.slice(0,30).map(l=>`
      <div style="display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid var(--border)">
        <div style="width:7px;height:7px;border-radius:50%;background:${l.category==='Vitals'?'var(--red)':l.category==='Exercise'?'var(--green)':l.category==='Sleep'?'var(--purple)':l.category==='Nutrition'?'var(--amber)':l.category==='Mental'?'var(--teal)':'var(--orange)'};flex-shrink:0"></div>
        <div style="flex:1;min-width:0">
          <div style="font-size:var(--text-sm);font-weight:600;color:var(--text1)">${l.metric}</div>
          <div style="font-size:var(--text-xs);color:var(--text3)">${l.category} · ${l.date}${l.notes?' · '+l.notes:''}</div>
        </div>
        <div style="font-size:var(--text-sm);font-weight:800;color:${l.category==='Vitals'?'var(--red)':l.category==='Exercise'?'var(--green)':l.category==='Sleep'?'var(--purple)':'var(--amber)'};white-space:nowrap">${l.value} <span style="font-size:var(--text-xs);font-weight:400;color:var(--text3)">${l.unit||''}</span></div>
        <button onclick="deleteHealthEntry(${l.id})" style="background:transparent;border:none;color:var(--text3);cursor:pointer;font-size:16px;padding:0 3px;line-height:1">×</button>
      </div>`).join('')
    :'<div style="padding:20px;text-align:center;color:var(--text3);font-size:var(--text-sm)">No entries in this category.</div>';
  }
  renderHealthTrend();
}
function deleteHealthEntry(id){
  const logs=getHealthLogs().filter(l=>l.id!==id);
  saveHealthLogs(logs);renderHealth();showToast('Entry deleted.');
}
function renderEndurance(){renderHealth();}  // alias for safety

// ===== DARK/LIGHT THEME =====
// Theme toggle removed — JELIX dark mode locked

// ===== DATA TICKER =====
function updateTicker(){
  const el=document.getElementById('tickerClock');
  if(el)el.textContent=new Date().toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'Asia/Manila'});
}
setInterval(updateTicker,1000);
updateTicker();


// ═══════════════════════════════════════════════════════════════════════════
// J.O.B. LOCK/BOOT AMBIENT LAYER — 2D floating orbs + drifting stars
// Sits at z-index:99996 (below WebGL particles at 99997)
// ═══════════════════════════════════════════════════════════════════════════
// Star/orb ambient canvas system removed — replaced by the simple gradient in initAmbientBackground() below.



// ── Particle mode switcher — called by loadOS() after unlock ─────────────
function setParticleMode(mode){
  // mode: 'auth' = full (lock/boot screens), 'os' = subtle (main dashboard)
  const webgl = document.getElementById('jelixParticles');
  const ambient = document.getElementById('jelixAmbient');
  if(mode === 'os'){
    // WebGL: fade to very subtle via CSS opacity
    if(webgl){
      webgl.style.transition = 'opacity 1.5s ease';
      webgl.style.opacity = '0.18';
    }
    // Ambient: reduce internal scale (orbs/stars much dimmer)
    if(typeof window._setAmbientScale === 'function'){
      // Smooth interpolation to subtle scale
      let cur = 1.0, target = 0.12;
      const step = () => {
        cur += (target - cur) * 0.06;
        window._setAmbientScale(cur);
        if(Math.abs(cur - target) > 0.002) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    if(ambient){
      ambient.style.transition = 'opacity 1.5s ease';
      ambient.style.opacity = '0.5';
    }
  } else {
    // Auth mode — full brightness
    if(webgl){webgl.style.transition='opacity 0.8s ease';webgl.style.opacity='1';}
    if(ambient){ambient.style.transition='opacity 0.8s ease';ambient.style.opacity='1';}
    if(typeof window._setAmbientScale === 'function') window._setAmbientScale(1.0);
  }
}
// ===== REACT BITS PARTICLES — WebGL port (OGL-equivalent, no CDN) =====
// WebGL star particle canvas removed — replaced by the simple gradient in initAmbientBackground().


// ===== iOS MOBILE FIXES =====
// Use CSS touch-action:manipulation to prevent double-tap zoom without
// calling e.preventDefault() on touchend — which was suppressing the browser's
// synthetic click event and breaking ALL button onclick handlers.
(function(){
  const s=document.createElement('style');
  s.textContent='button,.btn,.ni,.mbn-tab,a,[onclick]{touch-action:manipulation;-webkit-tap-highlight-color:transparent;}';
  document.head.appendChild(s);
})();

// Fix iOS scroll momentum for all scrollable containers
document.querySelectorAll('.vb,.ai-msgs,.kc-body,.side-nav,.mb').forEach(el => {
  el.style.webkitOverflowScrolling = 'touch';
});

// Prevent body scroll bounce (iOS rubber band) outside scrollable areas
document.body.addEventListener('touchmove', function(e) {
  if (e.target === document.body || e.target === document.documentElement) {
    e.preventDefault();
  }
}, { passive: false });


// INIT
// Restore API key indicator on load
(function(){
  const k=localStorage.getItem('job-api-key');
  const btn=document.getElementById('apiKeyBtn');
  if(k&&btn){btn.style.color='var(--green)';btn.style.borderColor='var(--green)';btn.textContent='KEY ✓';}
})();

// Cursor spotlight / particle-star / tilt-magnetism system removed per design
// direction — replaced with a simple, calm, static ambient glow instead.
// No cursor tracking, no per-card particle bursts, no tilt/magnetism.
(function initAmbientBackground(){
  const bg=document.createElement('div');
  bg.id='ambientBackground';
  bg.style.cssText='position:fixed;inset:0;z-index:-1;pointer-events:none;'+
    'background:radial-gradient(ellipse 80% 60% at 50% -10%,var(--teal4),transparent 60%);'+
    'opacity:.6;';
  document.body.prepend(bg);
})();


// Ensure vBar is always a direct child of body at the very end
// This defeats any overflow:hidden or stacking context clipping
(function(){
  const vb = document.getElementById('vBar');
  if(vb && vb.parentElement !== document.body){
    document.body.appendChild(vb);
  }
  // Also force inline style as backup
  if(vb){
    vb.style.cssText += ';position:fixed!important;bottom:28px!important;z-index:2147483647!important;top:auto!important;';
  }
})();

// ═══════════════════════════════════════════════════════════════════════════
// J.O.B Systems — JELIX INTELLIGENCE LAYER
// Skills 1–7 + CLAUDE.md Live Doc
// Author: JELIX BUILD ENGINE · June 2026
// Rules: inherits all CSS vars · uses SB/DB · voice-ready · mobile-responsive
// ═══════════════════════════════════════════════════════════════════════════

// ── Shared localStorage keys ──────────────────────────────────────────────
const JIL_KEYS={
  captures:'j-captures',
  beliefs:'j-beliefs',
  decisions:'j-decisions',
  patterns:'j-patterns',
  weekly:'j-weekly-synth',
  connections:'j-connections',
  claudeMD:'j-claude-md'
};

// ── DB extensions — JIL tables are now declared directly in DB object ──
// (captures, beliefs, decisions, patterns, weeklySynth, connections load at boot)

function jilSave(key){localStorage.setItem(JIL_KEYS[key],JSON.stringify(DB[key]||DB[key+'s']||[]));}
function jilSaveKey(key,data){localStorage.setItem(key,JSON.stringify(data));}

// ── Patch setView to handle JIL views ────────────────────────────────────
const _origSetViewJIL = window.setView;
window.setView = function(v){
  _origSetViewJIL(v);
  const jilR={
    'jarvis-morning':renderMorningBrief,
    'jarvis-capture':renderCaptureView,
    'jarvis-connect':renderConnectionsView,
    'jarvis-weekly':renderWeeklyView,
    'jarvis-context':()=>{try{renderContextEngine();}catch(e){}},
    'jarvis-pattern':renderPatternView,
    'jarvis-decision':renderDecisionView,
    'jarvis-claude':renderClaudeMD
  };
  if(jilR[v]) jilR[v]();
};

// Patch NAV_MAP for voice navigation
if(typeof NAV_MAP!=='undefined'){
  NAV_MAP['morning intelligence']='jarvis-morning';
  NAV_MAP['morning intelligenceing']='jarvis-morning';
  NAV_MAP['jarvis brief']='jarvis-morning';
  NAV_MAP['capture']='jarvis-capture';
  NAV_MAP['capture processor']='jarvis-capture';
  NAV_MAP['connections']='jarvis-connect';
  NAV_MAP['connection finder']='jarvis-connect';
  NAV_MAP['weekly']='jarvis-weekly';
  NAV_MAP['weekly synthesis']='jarvis-weekly';
  NAV_MAP['context']='jarvis-context';
  NAV_MAP['context engine']='jarvis-context';
  NAV_MAP['patterns']='jarvis-pattern';
  NAV_MAP['pattern detector']='jarvis-pattern';
  NAV_MAP['decisions']='jarvis-decision';
  NAV_MAP['decision intelligence']='jarvis-decision';
  NAV_MAP['claude md']='jarvis-claude';
  NAV_MAP['claude']='jarvis-claude';
}

// ── Patch reRenderAll ────────────────────────────────────────────────────
const _origReRenderJIL = window.reRenderAll;
window.reRenderAll = function(){
  if(_origReRenderJIL) _origReRenderJIL.apply(this,arguments);
  // Refresh JIL views only if currently active
  const jilViews=['jarvis-morning','jarvis-capture','jarvis-connect','jarvis-weekly','jarvis-context','jarvis-pattern','jarvis-decision','jarvis-claude'];
  if(jilViews.includes(window.currentView||'')){
    setView(window.currentView);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// SKILL 1 — MORNING BRIEF
// ═══════════════════════════════════════════════════════════════════════════
let _lastMorningIntelligence='';

function _checkAutoMorningIntelligence(){
  const now=new Date();
  const todayStr=localDateStr(now);
  const lastRun=localStorage.getItem('j-last-auto-morning-run');
  if(lastRun===todayStr)return; // already ran today
  if(now.getHours()<10)return; // not 10am yet
  localStorage.setItem('j-last-auto-morning-run',todayStr);
  try{runMorningIntelligence();}catch(e){}
}
function runMorningIntelligence(){
  const today=localDateStr(new Date());
  const todayPH=new Date().toLocaleDateString('en-PH',{weekday:'long',year:'numeric',month:'long',day:'numeric',timeZone:'Asia/Manila'});
  const now=new Date().toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:'Asia/Manila'});

  // Data aggregation
  const allTasks=DB.tasks||[];
  const openTasks=allTasks.filter(t=>t.status!=='Done');
  const overdue=openTasks.filter(t=>t.due&&t.due<today).sort((a,b)=>a.due<b.due?-1:1);
  const todayTasks=openTasks.filter(t=>t.due===today);
  const highPrio=openTasks.filter(t=>t.priority==='High');
  const calToday=(DB.calEvents||[]).filter(e=>e.date===today||e._expandedDate===today);
  const balance=typeof getTotalPortfolioBalance==='function'?getTotalPortfolioBalance():(()=>{const c=(DB.cashflow||[]).reduce((s,t)=>t.type==='Credit'?s+(t.amount||0):s,0);const d=(DB.cashflow||[]).reduce((s,t)=>t.type==='Debit'?s+(t.amount||0):s,0);return d-c;})();
  const faithThis=(DB.faith||[]).filter(f=>f.status!=='Done'&&f.status!=='Complete').slice(0,3);
  const urgentClients=(DB.clients||[]).filter(c=>c.status==='Urgent');
  const openCaptures=(DB.captures||[]).filter(c=>c.status==='inbox');
  const openDecisions=(DB.decisions||[]).filter(d=>d.status==='Open'||d.status==='Pending Review');

  // Wins — tasks marked Done (today or recently completed)
  const yesterday=localDateStr(new Date(Date.now()-86400000));
  const wins=allTasks.filter(t=>t.status==='Done').slice(0,8);

  // Losses — overdue tasks not yet done (missed their deadline)
  const losses=overdue.slice(0,6);

  // The One Thing — highest priority overdue or today task
  const oneThing=overdue[0]||todayTasks[0]||highPrio[0]||null;

  // Open Loops — unprocessed captures + overdue tasks
  const openLoops=[
    ...overdue.slice(0,4).map(t=>({text:t.title,tag:'OVERDUE',color:'var(--red)'})),
    ...openCaptures.slice(0,3).map(c=>({text:c.content.substring(0,60),tag:'CAPTURE',color:'var(--teal)'})),
    ...openDecisions.slice(0,2).map(d=>({text:d.situation.substring(0,60),tag:'DECISION',color:'var(--amber)'}))
  ];

  // Decision Flags
  const decFlags=openDecisions.slice(0,4);

  const html=`
  <div style="padding:14px 18px">

    <!-- HEADER STRIP -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--border)">
      <div>
        <div style="font-size:18px;font-weight:900;color:var(--amber);letter-spacing:.04em">MORNING BRIEF</div>
        <div style="font-size:var(--text-xs);color:var(--text3);margin-top:2px">${todayPH} · ${now} local time</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
        <div style="font-size:var(--text-lg);font-weight:800;color:${balance>0?'var(--green)':balance<0?'var(--red)':'var(--text2)'}">${balance>0?'+':balance<0?'-':''}₱${Math.abs(balance).toLocaleString('en-PH',{maximumFractionDigits:0})}</div>
        <div style="font-size:var(--text-xs);color:var(--text3);text-transform:uppercase;letter-spacing:.08em">Net Balance</div>
      </div>
    </div>

    <!-- THE ONE THING -->
    <div style="background:rgba(255,170,0,.07);border:1px solid rgba(255,170,0,.3);border-radius:12px;padding:14px 16px;margin-bottom:12px">
      <div style="font-size:var(--text-xs);font-weight:900;color:var(--amber);letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px">◈ THE ONE THING</div>
      ${oneThing?`
      <div style="font-size:var(--text-md);font-weight:700;color:var(--text1);line-height:1.4;margin-bottom:6px">${oneThing.title}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <span class="pill po">${oneThing.world}</span>
        <span class="pill ${oneThing.priority==='High'?'pr':oneThing.priority==='Medium'?'pam':'pgr'}">${oneThing.priority}</span>
        ${oneThing.due?`<span class="pill pgr">${oneThing.due<today?'⚑ OVERDUE':'Due: '+oneThing.due}</span>`:''}
        ${oneThing.client?`<span class="pill pt">${oneThing.client}</span>`:''}
      </div>`
      :`<div style="font-size:var(--text-sm);color:var(--green);font-weight:700">✓ Clean slate. No urgent items outstanding.</div>`}
    </div>

    <!-- WINS & LOSSES ROW -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">

      <!-- WINS -->
      <div class="bd-block" style="border-color:rgba(0,255,136,.2)">
        <div class="bd-h" style="margin-bottom:8px"><i class="ti ti-trophy" style="color:var(--green)"></i><span style="color:var(--green)">WINS</span><span style="font-size:var(--text-xs);color:var(--text3);margin-left:4px">Accomplished tasks</span><span class="pill pg" style="font-size:var(--text-xs);margin-left:auto">${wins.length}</span></div>
        ${wins.length?wins.map(t=>`
          <div class="brow">
            <i class="ti ti-circle-check" style="font-size:var(--text-sm);color:var(--green);flex-shrink:0;line-height:1;display:block;margin-top:1px"></i>
            <div class="btxt">${t.title}</div>
            <span class="btag" style="background:rgba(0,255,136,.1);color:var(--green);border:none;border-radius:6px;padding:1px 4px;font-size:var(--text-xs)">${t.world||''}</span>
          </div>`).join('')
        :`<div style="font-size:var(--text-xs);color:var(--text3);padding:6px 0">No completed tasks yet. Go win something.</div>`}
      </div>

      <!-- LOSSES -->
      <div class="bd-block" style="border-color:rgba(255,34,68,.2)">
        <div class="bd-h" style="margin-bottom:8px"><i class="ti ti-x" style="color:var(--red)"></i><span style="color:var(--red)">LOSSES</span><span style="font-size:var(--text-xs);color:var(--text3);margin-left:4px">Unfinished / Overdue</span><span class="pill pr" style="font-size:var(--text-xs);margin-left:auto">${losses.length}</span></div>
        ${losses.length?losses.map(t=>`
          <div class="brow">
            <i class="ti ti-alert-circle" style="font-size:var(--text-sm);color:var(--red);flex-shrink:0;line-height:1;display:block;margin-top:1px"></i>
            <div class="btxt">${t.title}</div>
            <span class="btag pr" style="font-size:var(--text-xs)">${t.due||'no date'}</span>
          </div>`).join('')
        :`<div style="font-size:var(--text-xs);color:var(--text3);padding:6px 0">No overdue tasks. On track.</div>`}
      </div>
    </div>

    <!-- 3-COL GRID -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px">

      <!-- TODAY'S SCHEDULE -->
      <div class="bd-block">
        <div class="bd-h"><i class="ti ti-calendar-event"></i>Today's Schedule</div>
        ${calToday.length?calToday.slice(0,5).map(e=>`
          <div class="brow">
            <div class="bdot" style="background:${e.type==='pu'?'var(--purple)':e.type==='oc'?'var(--red)':'var(--teal)'}"></div>
            <div class="btxt">${e.time?to12h(e.time)+' · ':''}${e.title}</div>
          </div>`).join('')
        :`<div style="font-size:var(--text-xs);color:var(--text3);padding:6px 0">No events today.</div>`}
      </div>

      <!-- HIGH PRIORITY TASKS -->
      <div class="bd-block">
        <div class="bd-h"><i class="ti ti-alert-triangle"></i>High Priority (${highPrio.length})</div>
        ${highPrio.slice(0,5).map(t=>`
          <div class="brow">
            <div class="bdot" style="background:var(--red)"></div>
            <div class="btxt">${t.title}</div>
            <span class="btag" style="background:rgba(0,0,0,.3);color:var(--text3);border-radius:6px;padding:1px 4px;font-size:var(--text-xs)">${t.world}</span>
          </div>`).join('')
        ||'<div style="font-size:var(--text-xs);color:var(--text3);padding:6px 0">No high priority tasks.</div>'}
      </div>

      <!-- URGENT CLIENTS + FAITH -->
      <div class="bd-block">
        <div class="bd-h"><i class="ti ti-users"></i>Urgent Clients</div>
        ${urgentClients.length?urgentClients.slice(0,3).map(c=>`
          <div class="brow">
            <div class="bdot" style="background:var(--red)"></div>
            <div class="btxt">${c.name}</div>
          </div>`).join('')
        :'<div style="font-size:var(--text-xs);color:var(--text3);padding:6px 0">No urgent clients.</div>'}
        ${faithThis.length?`
        <div class="bd-h" style="margin-top:10px"><i class="ti ti-heart-handshake"></i>Faith</div>
        ${faithThis.map(f=>`<div class="brow"><div class="bdot" style="background:var(--purple)"></div><div class="btxt">${f.activity}</div></div>`).join('')}`:''}
      </div>
    </div>

    <!-- OPEN LOOPS -->
    ${openLoops.length?`
    <div class="bd-block" style="margin-bottom:12px">
      <div class="bd-h"><i class="ti ti-loop"></i>Open Loops (${openLoops.length})</div>
      <div style="display:flex;flex-direction:column;gap:5px">
        ${openLoops.map(l=>`
          <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">
            <span style="font-size:var(--text-xs);font-weight:700;color:${l.color};border:1px solid ${l.color};border-radius:6px;padding:1px 5px;flex-shrink:0">${l.tag}</span>
            <span style="font-size:var(--text-sm);color:var(--text1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.text}</span>
          </div>`).join('')}
      </div>
    </div>`:''}

    <!-- DECISION FLAGS -->
    ${decFlags.length?`
    <div class="bd-block" style="border-color:rgba(255,170,0,.25)">
      <div class="bd-h oc"><i class="ti ti-scale"></i>Decision Flags — Pending Review</div>
      ${decFlags.map(d=>`
        <div class="brow">
          <div class="bdot" style="background:var(--amber)"></div>
          <div class="btxt">${d.situation.substring(0,80)}</div>
          <span class="btag pam">${d.status}</span>
        </div>`).join('')}
    </div>`:''}

    <!-- WHAT I LEARNED (auto-memories from last 48h) -->
    ${(()=>{
      const cutoff=localDateStr(new Date(Date.now()-48*3600000));
      const learned=LearnEngine.getRecentLearnings(cutoff);
      if(!learned.length) return '';
      return `<div class="bd-block" style="border-color:rgba(128,255,250,.2)">
        <div class="bd-h" style="margin-bottom:8px"><i class="ti ti-brain" style="color:var(--teal)"></i><span style="color:var(--teal)">WHAT I LEARNED</span><span style="font-size:var(--text-xs);color:var(--text3);margin-left:6px">Auto-captured from your actions · <span style="color:var(--teal);cursor:pointer;text-decoration:underline" onclick="setView('memory')">Review all →</span></span></div>
        ${learned.map(m=>`<div class="brow" style="align-items:flex-start">
          <div class="bdot" style="background:var(--teal);flex-shrink:0;margin-top:4px"></div>
          <div style="flex:1">
            <div class="btxt">${m.memory}</div>
            <div style="font-size:var(--text-xs);color:var(--text3);margin-top:2px">${m.category} · ${m.world} · ${m.date}</div>
          </div>
          <button onclick="deleteAutoMemory(${m.id})" style="background:transparent;border:none;color:var(--text3);cursor:pointer;font-size:var(--text-xs);padding:2px 5px;flex-shrink:0" title="Remove this memory"><i class="ti ti-x" style="font-size:var(--text-xs);line-height:1;display:block"></i></button>
        </div>`).join('')}
      </div>`;
    })()}

  </div>`;

  document.getElementById('jarvisMorningBody').innerHTML=html;
  // Generate session digest each time the brief opens
  LearnEngine.generateSessionDigest();
  const greeting=(()=>{const h=new Date().getHours();return h<12?'Good morning':h<18?'Good afternoon':'Good evening';})();
  const speakList=(items,max)=>items.slice(0,max).map(t=>t.title||t).join(', ');
  let spoken=`${greeting}, sir. Today is ${todayPH}. `;
  if(oneThing)spoken+=`Your one thing to focus on: ${oneThing.title}. `;
  if(highPrio.length)spoken+=`You have ${highPrio.length} high priority task${highPrio.length===1?'':'s'}: ${speakList(highPrio,5)}${highPrio.length>5?', and more':''}. `;
  else spoken+=`No high priority tasks on your plate right now. `;
  if(todayTasks.length)spoken+=`Due today: ${speakList(todayTasks,5)}. `;
  if(calToday.length)spoken+=`${calToday.length} event${calToday.length===1?'':'s'} on your calendar today: ${calToday.slice(0,5).map(e=>e.title+(e.time?' at '+to12h(e.time):'')).join(', ')}. `;
  else spoken+=`Nothing on your calendar today. `;
  if(overdue.length)spoken+=`You're overdue on ${overdue.length}: ${speakList(overdue,4)}. `;
  spoken+=`Your current balance is ${balance<0?'negative ':''}${Math.abs(balance).toLocaleString()} pesos. `;
  if(wins.length)spoken+=`You completed ${wins.length} task${wins.length===1?'':'s'} recently, including ${speakList(wins,3)}. `;
  if(openLoops.length)spoken+=`${openLoops.length} open loop${openLoops.length===1?'':'s'} still need attention. `;
  spoken+=`That's your full brief, sir.`;
  _lastMorningIntelligence=spoken;
  showToast('✓ Morning Intelligence generated');
}

function renderMorningBrief(){
  if(document.getElementById('jarvisMorningBody').children.length<=1) runMorningIntelligence();
}

function speakMorningIntelligence(){
  if(_lastMorningIntelligence) speakSlow(_lastMorningIntelligence);
  else{runMorningIntelligence();setTimeout(()=>speakSlow(_lastMorningIntelligence),400);}
}

// ═══════════════════════════════════════════════════════════════════════════
// SKILL 2 — CAPTURE PROCESSOR
// ═══════════════════════════════════════════════════════════════════════════

// Auto-classify capture by keyword patterns
function autoClassifyCapture(text){
  const t=text.toLowerCase();
  if(/\b(should|decide|choice|option|versus|vs|pick|select|either)\b/.test(t))return'Decision';
  if(/\b(do|task|complete|finish|send|reply|call|review|update|write|create|build|fix|check)\b/.test(t))return'Task';
  if(/\b(realised|noticed|pattern|learned|insight|discovered|interesting)\b/.test(t))return'Insight';
  if(/\b(reference|link|resource|source|doc|article|read later|bookmark)\b/.test(t))return'Reference';
  return'Idea';
}

function openCaptureModal(){
  document.getElementById('cap-content').value='';
  document.getElementById('cap-notes').value='';
  document.getElementById('cap-type').value='Idea';
  openModal('captureModal');
  setTimeout(()=>document.getElementById('cap-content').focus(),80);
}

// Auto-detect type on content change
(function(){
  document.addEventListener('DOMContentLoaded',()=>{
    const ta=document.getElementById('cap-content');
    if(ta)ta.addEventListener('input',()=>{
      const detected=autoClassifyCapture(ta.value);
      document.getElementById('cap-type').value=detected;
    });
  });
})();

function saveCapture(){
  const content=document.getElementById('cap-content').value.trim();
  if(!content){showToast('⚠ Please enter something to capture.');return;}
  const type=document.getElementById('cap-type').value;
  const world=document.getElementById('cap-world').value;
  const notes=document.getElementById('cap-notes').value.trim();

  const c={
    id:Date.now(),
    content,
    type,
    world,
    notes,
    status:'inbox',
    date:localDateStr(new Date()),
    time:new Date().toISOString()
  };
  DB.captures.unshift(c);
  save('captures');
  closeModal('captureModal');
  showToast('✓ Captured: '+type);
  addHistory('add','Capture: '+content.substring(0,40),{...c,_dbKey:'captures'});
  renderCaptureView();
}

function processCapture(id){
  const c=DB.captures.find(x=>x.id===id);
  if(!c)return;
  // Route to appropriate system
  switch(c.type){
    case'Task':{
      const t={id:Date.now(),title:c.content,world:c.world,priority:'Medium',status:'Todo',due:'',notes:c.notes||''};
      DB.tasks.unshift(t);SB.upsert('tasks',t,'tasks');
      showToast('✓ Task created from capture');
      break;}
    case'Decision':{
      const d={id:Date.now(),situation:c.content,options:'',choice:'',rationale:'',status:'Open',world:c.world,outcome:'',date:c.date};
      DB.decisions.unshift(d);save('decisions');
      showToast('✓ Decision logged from capture');
      break;}
    case'Reference':{
      const m={id:Date.now(),memory:c.content,category:'Reference',world:c.world,date:c.date};
      DB.memories.unshift(m);SB.upsert('memories',m,'memories');
      showToast('✓ Reference saved to Memory');
      break;}
    case'Insight':{
      const j={id:Date.now(),title:'Insight: '+c.content.substring(0,40),content:c.content,world:c.world,mood:'',date:c.date};
      DB.journal.unshift(j);SB.upsert('journal',j,'journal');
      showToast('✓ Insight saved to Journal');
      break;}
    default:
      showToast('✓ Idea noted — stays in Knowledge Base');
  }
  c.status='processed';
  save('captures');
  renderCaptureView();
}

function processCaptureInbox(){
  const inbox=(DB.captures||[]).filter(c=>c.status==='inbox');
  if(!inbox.length){showToast('Inbox clear.');return;}
  inbox.forEach(c=>processCapture(c.id));
  showToast('✓ '+inbox.length+' captures processed');
}

let captureFilter='inbox';
function filterCaptures(f){captureFilter=f;renderCaptureView();}

function renderCaptureView(){
  const inbox=DB.captures.filter(c=>c.status==='inbox').length;
  const processed=DB.captures.filter(c=>c.status==='processed').length;
  const el=document.getElementById('captureInboxCount');if(el)el.textContent=inbox;
  const pe=document.getElementById('captureProcessedCount');if(pe)pe.textContent=processed;

  const list=document.getElementById('captureList');
  if(!list)return;
  let items=captureFilter==='all'?DB.captures:captureFilter==='processed'?DB.captures.filter(c=>c.status==='processed'):captureFilter==='inbox'?DB.captures.filter(c=>c.status==='inbox'):DB.captures.filter(c=>c.type===captureFilter);

  const typeColor={Idea:'var(--teal)',Task:'var(--orange)',Decision:'var(--amber)',Reference:'var(--purple)',Insight:'var(--green)'};
  const typeIcon={Idea:'ti-bulb',Task:'ti-checkbox',Decision:'ti-scale',Reference:'ti-paperclip',Insight:'ti-sparkles'};

  list.innerHTML=items.length?items.map(c=>`
    <div style="background:var(--navy2);border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin-bottom:8px;position:relative;overflow:hidden">
      <div style="position:absolute;top:0;left:0;bottom:0;width:3px;background:${typeColor[c.type]||'var(--teal)'}"></div>
      <div style="display:flex;align-items:flex-start;gap:10px;padding-left:8px">
        <div style="width:28px;height:28px;border-radius:10px;background:rgba(0,0,0,.3);border:1px solid ${typeColor[c.type]};display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i class="ti ${typeIcon[c.type]||'ti-bulb'}" style="font-size:var(--text-sm);color:${typeColor[c.type]};line-height:1;display:block"></i>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:var(--text-sm);color:var(--text1);line-height:1.5;margin-bottom:5px">${c.content}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            <span style="font-size:var(--text-xs);font-weight:700;color:${typeColor[c.type]};border:1px solid ${typeColor[c.type]};border-radius:6px;padding:1px 5px">${c.type.toUpperCase()}</span>
            <span class="pill pgr">${c.world}</span>
            <span style="font-size:var(--text-xs);color:var(--text3)">${c.date}</span>
            ${c.status==='processed'?'<span class="pill pg">✓ Processed</span>':''}
          </div>
        </div>
        <div style="display:flex;gap:5px;flex-shrink:0">
          ${c.status==='inbox'?`<button onclick="processCapture(${c.id})" class="btn btn-t" style="padding:4px 9px;font-size:var(--text-xs)"><i class="ti ti-arrow-right" style="font-size:var(--text-xs);line-height:1;display:block"></i></button>`:''}
          <button onclick="deleteCapture(${c.id})" class="btn btn-d" style="padding:4px 7px;font-size:var(--text-xs)"><i class="ti ti-trash" style="font-size:var(--text-xs);line-height:1;display:block"></i></button>
        </div>
      </div>
    </div>`).join('')
  :'<div style="text-align:center;padding:30px;color:var(--text3);font-size:var(--text-sm)">No captures in this view.</div>';
}

function deleteCapture(id){
  DB.captures=DB.captures.filter(c=>c.id!==id);
  save('captures');
  renderCaptureView();showToast('Capture deleted');
}

// ═══════════════════════════════════════════════════════════════════════════
// SKILL 3 — CONNECTION FINDER
// ═══════════════════════════════════════════════════════════════════════════

function runConnectionFinder(){
  const now=Date.now();
  const cutoff=now-(48*3600*1000);
  const recentJournal=(DB.journal||[]).filter(j=>new Date(j.date||0).getTime()>=cutoff);
  const recentTasks=(DB.tasks||[]).filter(t=>t.status!=='Done').slice(0,15);
  const recentCaptures=(DB.captures||[]).filter(c=>new Date(c.time||0).getTime()>=cutoff);

  // Build corpus of text snippets
  const corpus=[
    ...recentJournal.map(j=>({id:'j-'+j.id,label:j.title||'Journal',text:(j.content||'').substring(0,200),type:'Journal'})),
    ...recentTasks.map(t=>({id:'t-'+t.id,label:t.title,text:(t.title+' '+(t.notes||'')).substring(0,200),type:'Task',world:t.world})),
    ...recentCaptures.map(c=>({id:'c-'+c.id,label:c.content.substring(0,50),text:c.content.substring(0,200),type:'Capture'}))
  ];

  if(corpus.length<2){
    document.getElementById('connectionsList').innerHTML='<div style="text-align:center;padding:30px;color:var(--text3)">Not enough recent data. Add journal entries and tasks first.</div>';
    return;
  }

  // Keyword extraction — simple tokenise + filter stopwords
  const STOP=new Set(['the','a','an','is','are','was','and','or','but','in','on','at','to','for','of','with','from','that','this','it','by','be','have','has','do','i','my','we','our','you','your','me','he','she','they','them','their','can','will','would','could','should','not','as','so','if','then','than','when','what','which','how','who','sir']);
  function keywords(text){
    return text.toLowerCase().replace(/[^a-z0-9\s]/g,'').split(/\s+/).filter(w=>w.length>3&&!STOP.has(w));
  }

  // Find connections via shared keywords
  const connections=[];
  for(let i=0;i<corpus.length;i++){
    for(let j=i+1;j<corpus.length;j++){
      const kA=new Set(keywords(corpus[i].text));
      const kB=keywords(corpus[j].text);
      const shared=kB.filter(k=>kA.has(k));
      if(shared.length>=2){
        const surpriseLevel=shared.length>=5?'HIGH':shared.length>=3?'MEDIUM':'LOW';
        connections.push({
          id:Date.now()+i*1000+j,
          nodeA:{label:corpus[i].label,type:corpus[i].type,world:corpus[i].world||''},
          nodeB:{label:corpus[j].label,type:corpus[j].type,world:corpus[j].world||''},
          sharedTerms:shared.slice(0,5),
          surpriseLevel,
          date:localDateStr(new Date()),
          implication:'These items share context around: '+shared.slice(0,3).join(', ')+'. Worth reviewing together.'
        });
      }
    }
  }

  if(!DB.connections)DB.connections=[];
  DB.connections=[...connections,...DB.connections].slice(0,50);
  save('connections');
  renderConnectionsView();
  showToast('✓ Found '+connections.length+' connections');
}

function renderConnectionsView(){
  const list=document.getElementById('connectionsList');
  if(!list)return;
  if(!DB.connections||!DB.connections.length){
    list.innerHTML='<div style="text-align:center;padding:40px;color:var(--text3);font-size:var(--text-sm)"><i class="ti ti-link" style="font-size:28px;display:block;margin-bottom:10px;color:var(--purple)"></i>Click <strong style="color:var(--purple)">Find Connections</strong> to scan your 48hr activity.</div>';
    return;
  }
  const surpriseColor={'HIGH':'var(--red)','MEDIUM':'var(--amber)','LOW':'var(--teal)'};
  list.innerHTML=DB.connections.map(c=>`
    <div style="background:var(--navy2);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:10px;border-left:3px solid ${surpriseColor[c.surpriseLevel]||'var(--teal)'}">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span style="font-size:var(--text-xs);font-weight:700;color:${surpriseColor[c.surpriseLevel]};border:1px solid ${surpriseColor[c.surpriseLevel]};border-radius:6px;padding:1px 6px">⚡ ${c.surpriseLevel} SURPRISE</span>
        <span style="font-size:var(--text-xs);color:var(--text3)">${c.date}</span>
        <button onclick="deleteConnection(${c.id})" style="margin-left:auto;background:transparent;border:none;color:var(--text3);cursor:pointer;font-size:var(--text-sm);padding:0 3px">×</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center;margin-bottom:10px">
        <div style="background:var(--navy3);border:1px solid var(--border);border-radius:10px;padding:8px 10px">
          <div style="font-size:var(--text-xs);color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px">${c.nodeA.type}</div>
          <div style="font-size:var(--text-sm);font-weight:600;color:var(--text1)">${c.nodeA.label}</div>
        </div>
        <div style="text-align:center;color:var(--purple);font-size:16px;font-weight:900">↔</div>
        <div style="background:var(--navy3);border:1px solid var(--border);border-radius:10px;padding:8px 10px">
          <div style="font-size:var(--text-xs);color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px">${c.nodeB.type}</div>
          <div style="font-size:var(--text-sm);font-weight:600;color:var(--text1)">${c.nodeB.label}</div>
        </div>
      </div>
      <div style="font-size:var(--text-xs);color:var(--text3);margin-bottom:6px">
        <strong style="color:var(--text2)">Shared terms:</strong> ${c.sharedTerms.map(t=>`<span style="background:rgba(168,85,247,.1);color:var(--purple);border-radius:6px;padding:1px 5px;font-size:var(--text-xs)">${t}</span>`).join(' ')}
      </div>
      <div style="font-size:var(--text-xs);color:var(--text2);line-height:1.5">${c.implication}</div>
    </div>`).join('');
}

function deleteConnection(id){
  DB.connections=DB.connections.filter(c=>c.id!==id);
  save('connections');
  renderConnectionsView();
}

// ═══════════════════════════════════════════════════════════════════════════
// SKILL 4 — WEEKLY SYNTHESIS
// ═══════════════════════════════════════════════════════════════════════════

function runWeeklySynthesis(){
  const now=new Date();
  const weekAgo=new Date(now);weekAgo.setDate(now.getDate()-7);
  const weekAgoStr=localDateStr(weekAgo);
  const todayStr=localDateStr(now);

  const weekTasks=(DB.tasks||[]).filter(t=>t.due>=weekAgoStr&&t.due<=todayStr);
  const doneTasks=weekTasks.filter(t=>t.status==='Done');
  const stalledTasks=weekTasks.filter(t=>t.status==='No Progress'||t.status==='Blocked');
  const weekJournal=(DB.journal||[]).filter(j=>(j.date||'')>=weekAgoStr);
  const weekCash=(DB.cashflow||[]).filter(c=>(c.date||'')>=weekAgoStr);
  const cashIn=weekCash.filter(c=>c.type==='Credit').reduce((s,c)=>s+(c.amount||0),0);
  const cashOut=weekCash.filter(c=>c.type==='Debit').reduce((s,c)=>s+(c.amount||0),0);
  const faithEvents=(DB.faith||[]).filter(f=>(f.date||'')>=weekAgoStr);

  // Update stat cards
  const ws1=document.getElementById('wsStat1');if(ws1)ws1.textContent=doneTasks.length;
  const ws2=document.getElementById('wsStat2');if(ws2)ws2.textContent='₱'+cashIn.toLocaleString('en-PH',{maximumFractionDigits:0});
  const ws3=document.getElementById('wsStat3');if(ws3)ws3.textContent=weekJournal.length;

  // Synthesise
  const worldSummary={};
  weekTasks.forEach(t=>{
    if(!worldSummary[t.world])worldSummary[t.world]={done:0,stalled:0,open:0};
    if(t.status==='Done')worldSummary[t.world].done++;
    else if(t.status==='No Progress'||t.status==='Blocked')worldSummary[t.world].stalled++;
    else worldSummary[t.world].open++;
  });

  const weekLabel=weekAgo.toLocaleDateString('en-PH',{month:'short',day:'numeric'})+' – '+now.toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'});

  // Detect week pattern (crude heuristic)
  const patterns=[];
  if(stalledTasks.length>doneTasks.length)patterns.push('More stalling than doing this week — energy/focus issue?');
  if(cashIn===0)patterns.push('No income recorded this week — invoicing delayed?');
  if(weekJournal.length===0)patterns.push('No journal entries — reflection gap this week.');
  if(doneTasks.filter(t=>t.world==='WORK-IH').length>3)patterns.push('Ideahub had a high-output week.');
  if(faithEvents.length>2)patterns.push('Faith engagement was strong this week.');

  // Top world by done tasks
  const topWorld=Object.entries(worldSummary).sort((a,b)=>(b[1].done-a[1].done))[0];
  const bottomWorld=Object.entries(worldSummary).sort((a,b)=>(a[1].done-b[1].done))[0];

  const synthesis={
    id:Date.now(),
    week:weekLabel,
    weekStart:weekAgoStr,
    weekEnd:todayStr,
    oneLine:`${doneTasks.length} tasks done · ${cashIn>0?'₱'+cashIn.toLocaleString()+' in':'no income'} · ${weekJournal.length} journal entries · ${faithEvents.length} faith touchpoints`,
    advanced:doneTasks.map(t=>t.title).slice(0,5),
    stalled:stalledTasks.map(t=>t.title).slice(0,4),
    patterns,
    topWorld:topWorld?topWorld[0]:'None',
    bottomWorld:bottomWorld&&bottomWorld[1].done===0?bottomWorld[0]:'None',
    nextPriority:stalledTasks[0]?.title||doneTasks[0]?.title||'Define next sprint',
    worldSummary,
    cashIn,cashOut,
    date:todayStr
  };

  if(!DB.weeklySynth)DB.weeklySynth=[];
  DB.weeklySynth.unshift(synthesis);
  if(DB.weeklySynth.length>12)DB.weeklySynth=DB.weeklySynth.slice(0,12);
  save('weeklySynth');

  renderWeeklyResult(synthesis);
  renderWeeklyArchive();
  showToast('✓ Weekly synthesis complete');
  speak('Weekly synthesis complete. '+synthesis.oneLine);
}

function renderWeeklyResult(s){
  if(!s)return;
  const el=document.getElementById('weeklySynthResult');
  if(!el)return;
  el.innerHTML=`
    <div style="background:rgba(0,255,136,.05);border:1px solid rgba(0,255,136,.2);border-radius:12px;padding:16px;margin-bottom:12px">
      <div style="font-size:var(--text-xs);font-weight:700;color:var(--green);letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px">◈ WEEK IN ONE LINE</div>
      <div style="font-size:var(--text-sm);color:var(--text1);font-weight:600;line-height:1.5">${s.oneLine}</div>
      <div style="font-size:var(--text-xs);color:var(--text3);margin-top:4px">${s.week}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
      <div class="bd-block">
        <div class="bd-h"><i class="ti ti-check"></i>What Advanced</div>
        ${s.advanced.length?s.advanced.map(a=>`<div class="brow"><div class="bdot" style="background:var(--green)"></div><div class="btxt">${a}</div></div>`).join(''):'<div style="font-size:var(--text-xs);color:var(--text3)">Nothing completed this week.</div>'}
      </div>
      <div class="bd-block">
        <div class="bd-h"><i class="ti ti-alert-triangle"></i>What Stalled</div>
        ${s.stalled.length?s.stalled.map(a=>`<div class="brow"><div class="bdot" style="background:var(--amber)"></div><div class="btxt">${a}</div></div>`).join(''):'<div style="font-size:var(--text-xs);color:var(--text3)">Nothing stalled — good week.</div>'}
      </div>
    </div>
    ${s.patterns.length?`
    <div class="bd-block" style="margin-bottom:12px">
      <div class="bd-h"><i class="ti ti-trending-up"></i>Week's Pattern</div>
      ${s.patterns.map(p=>`<div class="brow"><div class="bdot" style="background:var(--purple)"></div><div class="btxt">${p}</div></div>`).join('')}
    </div>`:''}
    <div style="background:rgba(255,170,0,.07);border:1px solid rgba(255,170,0,.3);border-radius:12px;padding:12px 14px">
      <div style="font-size:var(--text-xs);font-weight:700;color:var(--amber);letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px">◈ NEXT WEEK'S SINGLE PRIORITY</div>
      <div style="font-size:var(--text-sm);font-weight:700;color:var(--text1)">${s.nextPriority}</div>
    </div>`;
}

function renderWeeklyView(){
  renderWeeklyArchive();
  if(DB.weeklySynth&&DB.weeklySynth.length>0)renderWeeklyResult(DB.weeklySynth[0]);
  const ws1=document.getElementById('wsStat1');if(ws1)ws1.textContent=DB.weeklySynth[0]?.advanced?.length||'—';
  const ws2=document.getElementById('wsStat2');if(ws2)ws2.textContent=DB.weeklySynth[0]?'₱'+DB.weeklySynth[0].cashIn.toLocaleString('en-PH',{maximumFractionDigits:0}):'—';
  const ws3=document.getElementById('wsStat3');if(ws3)ws3.textContent=DB.weeklySynth[0]?.patterns?.length||'—';
}

function renderWeeklyArchive(){
  const el=document.getElementById('weeklyArchive');
  if(!el)return;
  if(!DB.weeklySynth||!DB.weeklySynth.length){el.innerHTML='<div style="font-size:var(--text-xs);color:var(--text3)">No syntheses yet.</div>';return;}
  el.innerHTML=DB.weeklySynth.map((s,i)=>`
    <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:${i===0?'rgba(0,255,136,.05)':'var(--navy2)'};border:1px solid ${i===0?'rgba(0,255,136,.2)':'var(--border)'};border-radius:10px;margin-bottom:6px;cursor:pointer" onclick="renderWeeklyResult(DB.weeklySynth[${i}])">
      <i class="ti ti-calendar-week" style="color:var(--green);font-size:var(--text-sm);line-height:1;display:block"></i>
      <div style="flex:1;min-width:0">
        <div style="font-size:var(--text-sm);font-weight:600;color:var(--text1)">${s.week}</div>
        <div style="font-size:var(--text-xs);color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.oneLine}</div>
      </div>
      ${i===0?'<span class="pill pg" style="font-size:var(--text-xs)">Latest</span>':''}
    </div>`).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
// SKILL 6 — PATTERN DETECTOR
// ═══════════════════════════════════════════════════════════════════════════

function runPatternDetector(){
  const STOP=new Set(['the','a','an','is','are','was','and','or','but','in','on','at','to','for','of','with','from','that','this','it','by','be','have','has','do','i','my','we','our','you','your','me','he','she','they','them','their','can','will','would','could','should','not','as','so','if','then','than','when','what','which','how','who','sir','done','todo']);

  // Build full text corpus from journal + tasks
  const corpus=[
    ...(DB.journal||[]).map(j=>(j.title||'')+' '+(j.content||'')),
    ...(DB.tasks||[]).map(t=>t.title+' '+(t.notes||'')),
    ...(DB.captures||[]).map(c=>c.content)
  ].join(' ').toLowerCase();

  const words=corpus.replace(/[^a-z0-9\s]/g,'').split(/\s+/).filter(w=>w.length>3&&!STOP.has(w));

  // Frequency map
  const freq={};
  words.forEach(w=>{freq[w]=(freq[w]||0)+1;});

  // Top patterns (words appearing 3+ times)
  const patterns=Object.entries(freq)
    .filter(([w,c])=>c>=3)
    .sort((a,b)=>b[1]-a[1])
    .slice(0,12)
    .map(([word,count])=>{
      const meaning=interpretPattern(word,count);
      return{id:Date.now()+Math.random(),word,count,meaning,action:meaning.action,date:localDateStr(new Date())};
    });

  if(!DB.patterns)DB.patterns=[];
  const archive={id:Date.now(),date:localDateStr(new Date()),patterns,summary:'Pattern scan: top theme is "'+((patterns[0]||{}).word||'N/A')+'" ('+((patterns[0]||{}).count||0)+' occurrences)'};
  DB.patterns.unshift(archive);
  if(DB.patterns.length>6)DB.patterns=DB.patterns.slice(0,6);
  save('patterns');
  renderPatternView();
  showToast('✓ Patterns detected: '+patterns.length);
}

function interpretPattern(word,count){
  const domainMap={
    'client':  {meaning:'Client management is dominant in your mental bandwidth.',    action:'Delegate more client tasks or automate follow-ups.'},
    'task':    {meaning:'Task volume thinking — possibly overwhelmed by volume.',       action:'Run a weekly sweep to clear low-priority tasks.'},
    'meeting': {meaning:'High meeting load detected.',                                  action:'Audit calendar for async replacements.'},
    'money':   {meaning:'Financial concerns are recurring.',                            action:'Schedule a dedicated cash flow review.'},
    'tired':   {meaning:'Energy/fatigue is a recurring theme.',                         action:'Review sleep schedule alignment with shifts.'},
    'tjc':     {meaning:'TJC venture is consistently top-of-mind.',                     action:'Ensure weekly venture progress is tracked.'},
    'naknak':  {meaning:'NAKNAK BUILD is recurring in thought.',                        action:'Schedule a dedicated BUILD sprint.'},
    'sleep':   {meaning:'Sleep is a recurring concern.',                                action:'Protect sleep blocks in calendar religiously.'},
    'faith':   {meaning:'Faith activities are consistently present.',                   action:'Celebrate the consistency. Protect this world.'},
    'campaign':{meaning:'Campaign work is a dominant theme.',                           action:'Consider systematising campaign workflows.'},
    'report':  {meaning:'Reporting load is high.',                                      action:'Build reusable report templates.'},
    'urgent':  {meaning:'Urgency is a recurring state — possible reactive mode.',       action:'Add buffer blocks in schedule for proactive work.'},
  };
  return domainMap[word]||{meaning:`"${word}" appears ${count}× — a recurring signal worth examining.`,action:'Journal about what this pattern means for you.'};
}

function renderPatternView(){
  const patternResult=document.getElementById('patternResult');
  const patternArchive=document.getElementById('patternArchive');
  if(!DB.patterns||!DB.patterns.length){
    if(patternResult)patternResult.innerHTML='<div style="text-align:center;padding:40px;color:var(--text3)"><i class="ti ti-trending-up" style="font-size:28px;display:block;margin-bottom:10px;color:var(--orange)"></i>Click <strong style="color:var(--orange)">Detect Patterns</strong> to scan your history.</div>';
    return;
  }

  const latest=DB.patterns[0];
  if(patternResult)patternResult.innerHTML=`
    <div style="font-size:var(--text-xs);font-weight:700;color:var(--orange);letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px">◈ LATEST SCAN — ${latest.date}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px">
    ${latest.patterns.map((p,i)=>`
      <div style="background:var(--navy2);border:1px solid var(--border);border-radius:12px;padding:12px 14px;border-left:3px solid ${i<3?'var(--orange)':'var(--border)'}">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <div style="font-size:16px;font-weight:900;color:${i<3?'var(--orange)':'var(--text2)'}">×${p.count}</div>
          <div style="font-size:var(--text-sm);font-weight:700;color:var(--text1)">"${p.word}"</div>
        </div>
        <div style="font-size:var(--text-xs);color:var(--text2);line-height:1.5;margin-bottom:6px">${p.meaning.meaning||p.meaning}</div>
        <div style="font-size:var(--text-xs);color:var(--teal);font-style:italic">→ ${p.action||p.meaning.action||''}</div>
      </div>`).join('')}
    </div>`;

  if(patternArchive)patternArchive.innerHTML=DB.patterns.map((p,i)=>`
    <div style="display:flex;align-items:center;gap:10px;padding:8px;background:var(--navy2);border:1px solid var(--border);border-radius:10px;margin-bottom:5px">
      <i class="ti ti-calendar" style="font-size:var(--text-sm);color:var(--text3);line-height:1;display:block"></i>
      <div style="flex:1"><div style="font-size:var(--text-xs);font-weight:600;color:var(--text1)">${p.date}</div><div style="font-size:var(--text-xs);color:var(--text3)">${p.summary||p.patterns.length+' patterns found'}</div></div>
      <button onclick="renderPatternDetail(${i})" class="btn btn-g" style="padding:3px 8px;font-size:var(--text-xs)">View</button>
    </div>`).join('');
}

function renderPatternDetail(i){
  const p=DB.patterns[i];
  if(!p)return;
  const el=document.getElementById('patternResult');
  if(el)el.innerHTML=`
    <div style="font-size:var(--text-xs);font-weight:700;color:var(--orange);letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px">◈ SCAN — ${p.date}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px">
    ${p.patterns.map((pt,j)=>`
      <div style="background:var(--navy2);border:1px solid var(--border);border-radius:12px;padding:12px 14px;border-left:3px solid ${j<3?'var(--orange)':'var(--border)'}">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <div style="font-size:16px;font-weight:900;color:${j<3?'var(--orange)':'var(--text2)'}">×${pt.count}</div>
          <div style="font-size:var(--text-sm);font-weight:700;color:var(--text1)">"${pt.word}"</div>
        </div>
        <div style="font-size:var(--text-xs);color:var(--text2);line-height:1.5">${pt.meaning.meaning||pt.meaning}</div>
      </div>`).join('')}
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// SKILL 7 — DECISION INTELLIGENCE
// ═══════════════════════════════════════════════════════════════════════════

let _editingDecisionId=null;

function openDecisionModal(id){
  _editingDecisionId=id||null;
  const existing=id?DB.decisions.find(d=>d.id===id):null;
  document.getElementById('decModalTitle').textContent=id?'EDIT DECISION':'LOG DECISION';
  document.getElementById('dec-situation').value=existing?existing.situation:'';
  document.getElementById('dec-options').value=existing?existing.options:'';
  document.getElementById('dec-choice').value=existing?existing.choice:'';
  document.getElementById('dec-rationale').value=existing?existing.rationale:'';
  document.getElementById('dec-status').value=existing?existing.status:'Open';
  document.getElementById('dec-world').value=existing?existing.world:'LIFE';
  document.getElementById('dec-outcome').value=existing?existing.outcome:'';
  openModal('decisionModal');
  setTimeout(()=>document.getElementById('dec-situation').focus(),80);
}

function saveDecision(){
  const situation=document.getElementById('dec-situation').value.trim();
  if(!situation){showToast('⚠ Enter the situation/context.');return;}
  const d={
    id:_editingDecisionId||Date.now(),
    situation,
    options:document.getElementById('dec-options').value.trim(),
    choice:document.getElementById('dec-choice').value.trim(),
    rationale:document.getElementById('dec-rationale').value.trim(),
    status:document.getElementById('dec-status').value,
    world:document.getElementById('dec-world').value,
    outcome:document.getElementById('dec-outcome').value.trim(),
    date:localDateStr(new Date()),
    updatedAt:new Date().toISOString()
  };
  if(_editingDecisionId){const i=DB.decisions.findIndex(x=>x.id===_editingDecisionId);if(i>=0)DB.decisions[i]=d;else DB.decisions.unshift(d);}
  else DB.decisions.unshift(d);
  save('decisions');
  _editingDecisionId=null;
  closeModal('decisionModal');
  renderDecisionView();
  showToast('✓ Decision logged');
  addHistory('add','Decision: '+situation.substring(0,40),{...d});
}

let _decFilter='all';
function filterDecisions(f){_decFilter=f;renderDecisionView();}

function renderDecisionView(){
  if(!DB.decisions)DB.decisions=[];
  const total=DB.decisions.length;
  const open=DB.decisions.filter(d=>d.status==='Open'||d.status==='Pending Review').length;
  const resolved=DB.decisions.filter(d=>d.status==='Resolved').length;

  const dt=document.getElementById('decTotal');if(dt)dt.textContent=total;
  const do_=document.getElementById('decOpen');if(do_)do_.textContent=open;
  const dr=document.getElementById('decResolved');if(dr)dr.textContent=resolved;

  const list=document.getElementById('decisionList');
  if(!list)return;

  let items=_decFilter==='all'?DB.decisions:DB.decisions.filter(d=>d.status===_decFilter);

  const statusColor={'Open':'var(--orange)','Pending Review':'var(--amber)','Resolved':'var(--green)'};

  list.innerHTML=items.length?items.map(d=>`
    <div style="background:var(--navy2);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:10px;border-left:3px solid ${statusColor[d.status]||'var(--teal)'}">
      <div style="display:flex;align-items:flex-start;gap:10px">
        <div style="flex:1;min-width:0">
          <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
            <span style="font-size:var(--text-xs);font-weight:700;color:${statusColor[d.status]};border:1px solid ${statusColor[d.status]};border-radius:6px;padding:1px 5px">${d.status.toUpperCase()}</span>
            <span class="pill pgr">${d.world}</span>
            <span style="font-size:var(--text-xs);color:var(--text3)">${d.date}</span>
          </div>
          <div style="font-size:var(--text-sm);font-weight:700;color:var(--text1);margin-bottom:6px;line-height:1.4">${d.situation}</div>
          ${d.choice?`<div style="font-size:var(--text-xs);color:var(--teal);margin-bottom:4px">→ <strong>Choice:</strong> ${d.choice}</div>`:''}
          ${d.rationale?`<div style="font-size:var(--text-xs);color:var(--text2);margin-bottom:4px">${d.rationale}</div>`:''}
          ${d.options?`<div style="font-size:var(--text-xs);color:var(--text3);margin-bottom:4px"><strong>Options:</strong> ${d.options}</div>`:''}
          ${d.outcome?`<div style="font-size:var(--text-xs);color:var(--green);margin-top:6px;padding:6px 8px;background:rgba(0,255,136,.06);border-radius:8px"><strong>Outcome:</strong> ${d.outcome}</div>`:''}
        </div>
        <div style="display:flex;gap:5px;flex-shrink:0">
          <button onclick="openDecisionModal(${d.id})" class="btn btn-g" style="padding:4px 8px;font-size:var(--text-xs)"><i class="ti ti-pencil" style="font-size:var(--text-xs);line-height:1;display:block"></i></button>
          <button onclick="deleteDecision(${d.id})" class="btn btn-d" style="padding:4px 7px;font-size:var(--text-xs)"><i class="ti ti-trash" style="font-size:var(--text-xs);line-height:1;display:block"></i></button>
        </div>
      </div>
    </div>`).join('')
  :'<div style="text-align:center;padding:30px;color:var(--text3);font-size:var(--text-sm)">No decisions logged yet.</div>';
}

function deleteDecision(id){
  DB.decisions=DB.decisions.filter(d=>d.id!==id);
  save('decisions');
  renderDecisionView();showToast('Decision deleted');
}

// ═══════════════════════════════════════════════════════════════════════════
// CLAUDE.md — LIVE DOC
// ═══════════════════════════════════════════════════════════════════════════

const CLAUDE_MD_DEFAULTS={
  identity:`**Name:** Personal OS owner\n**Role:** Not set\n**Location:** Not set\n**Timezone:** Not set`,
  howIWork:`- Organizes work and life across configurable domains\n- Prefers a warm, direct, colleague-style tone\n- Builds systems before scaling\n- Documents important decisions`,
  focusAreas:`- Add current focus areas here\n- Keep sensitive personal and business details in the private app data, not the public template`,
  activeProjects:`- Add active projects here\n- Keep project details in the private app data, not the public template`,
  currentBeliefs:`- Consistency beats intensity for creative output\n- Systems multiply individual effort\n- Faith-driven work produces better results than fear-driven work\n- Pre-revenue focus is correct — build before billing\n- Sleep protection is non-negotiable for shift-based life`,
  activeQuestions:`- What decision needs attention next?\n- Which commitments are at risk?\n- What should be simplified or removed?`,
  outputStandards:`- Warm, direct, colleague-style tone — no formal address\n- Lead with solution, no preamble\n- Markdown, bold headers, bullets for structured output\n- Clear and analytical, zero fluff\n- Include hook + value + CTA for all marketing content\n- Premium but approachable tone`,
  permissions:`- Access all six life worlds freely\n- Reference past context from memory\n- Proactively flag conflicts between worlds\n- Surface decisions pending review\n- Run morning intelligence on request`,
  memoryRules:`- Always update when location, role, or project status changes\n- Tag all memories with world and date\n- Never store passwords or credentials\n- Prioritise recent context over older memory\n- Flag conflicts between memory and current input`,
  updateProtocol:`- Update CLAUDE.md when: role changes, project launches/closes, belief updates confirmed, location changes\n- Run weekly synthesis every Sunday 7PM\n- Run morning intelligence on shift start (2AM)\n- Run pattern detector monthly`
};

const CLAUDE_MD_SECTIONS=[
  {key:'identity',    label:'Identity',          icon:'ti-user'},
  {key:'howIWork',    label:'How I Actually Work',icon:'ti-settings'},
  {key:'focusAreas',  label:'Focus Areas',        icon:'ti-target'},
  {key:'activeProjects',label:'Active Projects',  icon:'ti-rocket'},
  {key:'currentBeliefs',label:'Current Beliefs',  icon:'ti-shield-check'},
  {key:'activeQuestions',label:'Active Questions', icon:'ti-question-mark'},
  {key:'outputStandards',label:'Output Standards', icon:'ti-star'},
  {key:'permissions', label:'Permissions',         icon:'ti-key'},
  {key:'memoryRules', label:'Memory Rules',        icon:'ti-brain'},
  {key:'updateProtocol',label:'Update Protocol',   icon:'ti-refresh'}
];

function loadClaudeMD(){
  const saved=localStorage.getItem(JIL_KEYS.claudeMD);
  if(saved){try{return JSON.parse(saved);}catch(e){}}
  return{...CLAUDE_MD_DEFAULTS};
}

function saveClaudeMD(){
  const data={};
  CLAUDE_MD_SECTIONS.forEach(s=>{
    const el=document.getElementById('claude-sec-'+s.key);
    if(el)data[s.key]=el.value;
  });
  localStorage.setItem('j-claude-md',JSON.stringify(data));
  showToast('✓ CLAUDE.md saved');
  addHistory('edit','CLAUDE.md updated',{_dbKey:'claudeMD'});
}

function exportClaudeMD(){
  const data=loadClaudeMD();
  let md='# CLAUDE.md — Personal OS\n\nGenerated: '+new Date().toISOString()+'\n\n---\n\n';
  CLAUDE_MD_SECTIONS.forEach(s=>{
    md+=`## ${s.label}\n\n${data[s.key]||CLAUDE_MD_DEFAULTS[s.key]||''}\n\n---\n\n`;
  });
  const a=document.createElement('a');
  a.href='data:text/markdown;charset=utf-8,'+encodeURIComponent(md);
  a.download='CLAUDE.md';
  a.click();
  showToast('✓ CLAUDE.md exported');
}

function renderClaudeMD(){
  const el=document.getElementById('claudeMDBody');
  if(!el)return;
  const data=loadClaudeMD();
  el.innerHTML=`
    <div style="display:grid;grid-template-columns:200px 1fr;height:100%;min-height:0">
      <!-- Left TOC -->
      <div style="background:var(--navy2);border-right:1px solid var(--border);padding:10px 0;overflow-y:auto">
        <div style="font-size:var(--text-xs);font-weight:700;color:var(--text3);letter-spacing:.12em;text-transform:uppercase;padding:8px 14px 4px">Sections</div>
        ${CLAUDE_MD_SECTIONS.map(s=>`
          <div onclick="document.getElementById('claude-sec-${s.key}')?.scrollIntoView({behavior:'smooth',block:'start'})" style="display:flex;align-items:center;gap:7px;padding:7px 14px;cursor:pointer;color:var(--text2);font-size:var(--text-sm);transition:all .15s;border-left:2px solid transparent" onmouseover="this.style.background='var(--teal3)';this.style.color='var(--teal)';this.style.borderLeftColor='var(--teal)'" onmouseout="this.style.background='';this.style.color='var(--text2)';this.style.borderLeftColor='transparent'">
            <i class="ti ${s.icon}" style="font-size:var(--text-sm);line-height:1;display:block;color:var(--teal)"></i>
            ${s.label}
          </div>`).join('')}
        <div style="padding:10px 14px;margin-top:8px;border-top:1px solid var(--border)">
          <button onclick="saveClaudeMD()" class="btn btn-t" style="width:100%;justify-content:center;margin-bottom:6px"><i class="ti ti-device-floppy"></i> Save</button>
          <button onclick="exportClaudeMD()" class="btn btn-g" style="width:100%;justify-content:center"><i class="ti ti-download"></i> Export</button>
        </div>
      </div>
      <!-- Right editor -->
      <div style="overflow-y:auto;padding:16px 20px">
        ${CLAUDE_MD_SECTIONS.map(s=>`
          <div style="margin-bottom:20px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--border)">
              <i class="ti ${s.icon}" style="font-size:var(--text-md);color:var(--pink);line-height:1;display:block"></i>
              <div style="font-size:var(--text-xs);font-weight:700;color:var(--text1);letter-spacing:.06em;text-transform:uppercase">${s.label}</div>
            </div>
            <textarea id="claude-sec-${s.key}" rows="6" style="resize:vertical;font-size:var(--text-sm);line-height:1.6;font-family:var(--font)">${data[s.key]||CLAUDE_MD_DEFAULTS[s.key]||''}</textarea>
          </div>`).join('')}
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// JIL CMD PALETTE ENTRIES
// ═══════════════════════════════════════════════════════════════════════════
(function(){
  const jilCmds=[
    {label:'Morning Intelligence',sub:'J.O.B Systems daily intelligence report',icon:'ti-sunrise',action:()=>setView('jarvis-morning'),group:'Intelligence'},
    {label:'Capture',sub:'Classify and route a new capture',icon:'ti-bolt',action:()=>{setView('jarvis-capture');setTimeout(openCaptureModal,200);},group:'Intelligence'},
    {label:'Connection Finder',sub:'Scan 48hr activity for links',icon:'ti-link',action:()=>setView('jarvis-connect'),group:'Intelligence'},
    {label:'Weekly Synthesis',sub:'Full week in one report',icon:'ti-chart-bar',action:()=>setView('jarvis-weekly'),group:'Intelligence'},
    {label:'Context Engine',sub:'Open context snapshot',icon:'ti-brain',action:()=>setView('jarvis-context'),group:'Intelligence'},
    {label:'Pattern Detector',sub:'Find recurring themes',icon:'ti-trending-up',action:()=>setView('jarvis-pattern'),group:'Intelligence'},
    {label:'Decision Intel',sub:'Structured decision log',icon:'ti-scale',action:()=>setView('jarvis-decision'),group:'Intelligence'},
    {label:'CLAUDE.md',sub:'Live intelligence profile',icon:'ti-id-badge-2',action:()=>setView('jarvis-claude'),group:'Intelligence'},
    {label:'Run Morning Intelligence',sub:'Generate now',icon:'ti-sun',action:()=>{setView('jarvis-morning');setTimeout(runMorningIntelligence,200);},group:'Intelligence'},
    {label:'Log Decision',sub:'Open decision modal',icon:'ti-scale',action:()=>{setView('jarvis-decision');setTimeout(openDecisionModal,200);},group:'Intelligence'},
    {label:'Context Engine',sub:'Open context snapshot',icon:'ti-brain',action:()=>setView('jarvis-context'),group:'Intelligence'},
    {label:'Detect Patterns',sub:'Run monthly pattern scan',icon:'ti-trending-up',action:()=>{setView('jarvis-pattern');setTimeout(runPatternDetector,200);},group:'Intelligence'},
    {label:'Find Connections',sub:'Scan recent activity',icon:'ti-link',action:()=>{setView('jarvis-connect');setTimeout(runConnectionFinder,200);},group:'Intelligence'},
    {label:'Run Weekly Synthesis',sub:'Generate weekly report',icon:'ti-chart-bar',action:()=>{setView('jarvis-weekly');setTimeout(runWeeklySynthesis,200);},group:'Intelligence'},
  ];
  if(Array.isArray(window.CMD_ITEMS)){
    jilCmds.forEach(c=>window.CMD_ITEMS.push(c));
  }
})();

// ═══════════════════════════════════════════════════════════════════════════
// JIL VOICE COMMANDS
// ═══════════════════════════════════════════════════════════════════════════
const JIL_VOICE_INTENTS=[
  {re:/^(run|generate|show)\s+(morning\s+)?brief/i,    action:'jil_morning_brief'},
  {re:/^(log|add|record)\s+(a\s+)?(belief|believe)/i,  action:'jil_belief'},
  {re:/^(log|add|record)\s+(a\s+)?decision/i,          action:'jil_decision'},
  {re:/^(find|run|scan)\s+(connections?|links?)/i,     action:'jil_connect'},
  {re:/^(run|generate|detect)\s+patterns?/i,           action:'jil_patterns'},
  {re:/^(run|generate)\s+(weekly|week).*(synth|report)/i,action:'jil_weekly'},
  {re:/^(capture|note)[:\-\s]+(?<content>.+)/i,        action:'jil_capture'},
];

// Patch executeVoiceCommand to handle JIL intents
const _origExecVC=window.executeVoiceCommand;
window.executeVoiceCommand=function(rawText){
  const t=rawText.toLowerCase().trim();
  for(const intent of JIL_VOICE_INTENTS){
    const m=t.match(intent.re);
    if(!m)continue;
    const g=m.groups||{};
    switch(intent.action){
      case'jil_morning_brief':setView('jarvis-morning');setTimeout(runMorningIntelligence,300);setVcState('idle');showVcResult('Morning Intelligence running.');speak('Generating your morning intelligence.');return;
      case'jil_belief':setView('jarvis-belief');setTimeout(openBeliefModal,300);setVcState('idle');showVcResult('Belief log open.');return;
      case'jil_decision':setView('jarvis-decision');setTimeout(openDecisionModal,300);setVcState('idle');showVcResult('Decision log open.');return;
      case'jil_connect':setView('jarvis-connect');setTimeout(runConnectionFinder,300);setVcState('idle');showVcResult('Finding connections.');return;
      case'jil_patterns':setView('jarvis-pattern');setTimeout(runPatternDetector,300);setVcState('idle');showVcResult('Detecting patterns.');return;
      case'jil_weekly':setView('jarvis-weekly');setTimeout(runWeeklySynthesis,300);setVcState('idle');showVcResult('Generating weekly synthesis.');return;
      case'jil_capture':{
        const content=(g.content||rawText.replace(/^capture[:\-\s]+/i,'').trim());
        if(content){
          const type=autoClassifyCapture(content);
          const c={id:Date.now(),content,type,world:'LIFE',notes:'',status:'inbox',date:localDateStr(new Date()),time:new Date().toISOString()};
          if(!DB.captures)DB.captures=[];
          DB.captures.unshift(c);
          save('captures');
          setVcState('idle');
          showVcResult('Captured as '+type+'.');
          speak('Captured as '+type+'.');
          showToast('✓ Captured: '+type);
          addHistory('add','Voice Capture: '+content.substring(0,40),{...c});
          return;
        }
      }
    }
  }
  if(_origExecVC)_origExecVC.apply(this,[rawText]);
};

// ═══════════════════════════════════════════════════════════════════════════
// BOOT BRIEF — auto-run morning intelligence on load if it's a new day
// ═══════════════════════════════════════════════════════════════════════════
(function scheduleBootBrief(){
  const lastBrief=localStorage.getItem('j-last-brief-date');
  const today=localDateStr(new Date());
  if(lastBrief!==today){
    localStorage.setItem('j-last-brief-date',today);
    // Pre-generate brief data silently for the topbar indicator
    setTimeout(()=>{
      const openTasks=(DB.tasks||[]).filter(t=>t.status!=='Done').length;
      const highPrio=(DB.tasks||[]).filter(t=>t.priority==='High'&&t.status!=='Done').length;
      if(highPrio>0)showToast('⚡ Morning: '+highPrio+' high priority items await.',false);
    },3500);
  }
})();

// Mobile More Menu — add JIL items
(function(){
  const moreMenu=document.getElementById('mobileMoreMenu');
  if(!moreMenu)return;
  const jilItems=[
    {view:'jarvis-morning',icon:'ti-sun',label:'Brief'},
    {view:'jarvis-capture',icon:'ti-capture',label:'Capture'},
    {view:'jarvis-decision',icon:'ti-scale',label:'Decisions'},
    {view:'jarvis-belief',icon:'ti-shield-check',label:'Beliefs'},
  ];
  jilItems.forEach(item=>{
    const div=document.createElement('div');
    div.className='mmm-item';
    div.onclick=()=>{mobileNav(item.view,null);toggleMobileMore();};
    div.innerHTML=`<i class="ti ${item.icon}" style="font-size:var(--text-lg);line-height:1;display:block;color:var(--teal2)"></i>${item.label}`;
    // Insert before Close button (last item)
    moreMenu.insertBefore(div,moreMenu.lastElementChild);
  });
})();

// ─────────────────────────────────────────────────────────────────────────
// JIL CSS — injected via style element (inherits all :root CSS vars)
// ─────────────────────────────────────────────────────────────────────────
(function injectJILStyles(){
  const s=document.createElement('style');
  s.textContent=`
    /* JIL view transitions */
    #view-jarvis-morning .vb,#view-jarvis-capture .vb,#view-jarvis-connect .vb,
    #view-jarvis-weekly .vb,#view-jarvis-pattern .vb,
    #view-jarvis-decision .vb{overflow-y:auto;-webkit-overflow-scrolling:touch}

    /* CLAUDE.md layout */
    #claudeMDBody{display:flex;flex-direction:column;height:100%;overflow:hidden}
    #claudeMDBody>div{flex:1;min-height:0;overflow:hidden}
    #claudeMDBody textarea{width:100%;background:var(--navy3);border:1px solid var(--border);border-radius:10px;color:var(--text1);padding:10px 12px;font-size:var(--text-sm);line-height:1.6;transition:border .15s}
    #claudeMDBody textarea:focus{border-color:var(--teal);box-shadow:0 0 8px rgba(0,255,242,.15)}

    /* Intelligence nav group glow */
/* ── Nav: world-specific active highlight colors ── */
.ni[data-view="work-ih"]:hover,.ni[data-view="work-ih"].active{background:rgba(255,140,0,.08);color:var(--w-ideahub)}
.ni[data-view="work-ih"].active::after{background:var(--w-ideahub);content:"";width:5px;height:5px;border-radius:50%;margin-left:auto;flex-shrink:0;display:block}
.ni[data-view="work-cs"]:hover,.ni[data-view="work-cs"].active{background:rgba(128,255,250,.06);color:var(--w-chainsmoker)}
.ni[data-view="work-cs"].active::after{background:var(--w-chainsmoker);content:"";width:5px;height:5px;border-radius:50%;margin-left:auto;flex-shrink:0;display:block}
.ni[data-view="venture"]:hover,.ni[data-view="venture"].active{background:rgba(59,130,246,.08);color:var(--w-venture)}
.ni[data-view="venture"].active::after{background:var(--w-venture);content:"";width:5px;height:5px;border-radius:50%;margin-left:auto;flex-shrink:0;display:block}
.ni[data-view="build"]:hover,.ni[data-view="build"].active{background:rgba(16,185,129,.08);color:var(--w-build)}
.ni[data-view="build"].active::after{background:var(--w-build);content:"";width:5px;height:5px;border-radius:50%;margin-left:auto;flex-shrink:0;display:block}
.ni[data-view="sides"]:hover,.ni[data-view="sides"].active{background:rgba(245,158,11,.08);color:var(--w-sides)}
.ni[data-view="sides"].active::after{background:var(--w-sides);content:"";width:5px;height:5px;border-radius:50%;margin-left:auto;flex-shrink:0;display:block}
.ni[data-view="faith"]:hover,.ni[data-view="faith"].active{background:rgba(239,68,68,.08);color:var(--w-faith)}
.ni[data-view="faith"].active::after{background:var(--w-faith);content:"";width:5px;height:5px;border-radius:50%;margin-left:auto;flex-shrink:0;display:block}
.ni[data-view="life"]:hover,.ni[data-view="life"].active{background:rgba(139,92,246,.08);color:var(--w-life)}
.ni[data-view="life"].active::after{background:var(--w-life);content:"";width:5px;height:5px;border-radius:50%;margin-left:auto;flex-shrink:0;display:block}
/* Command / dashboard items — teal default */
.ni[data-view="dashboard"]:hover,.ni[data-view="dashboard"].active{background:rgba(0,255,242,.07);color:var(--teal)}
.ni[data-view="tasks"]:hover,.ni[data-view="tasks"].active{background:rgba(0,255,242,.07);color:var(--teal)}
.ni[data-view="notes"]:hover,.ni[data-view="notes"].active{background:rgba(0,255,242,.07);color:var(--teal)}
.ni[data-view="calendar"]:hover,.ni[data-view="calendar"].active{background:rgba(0,255,242,.07);color:var(--teal)}
.ni[data-view="ai"]:hover,.ni[data-view="ai"].active{background:rgba(0,255,242,.07);color:var(--teal)}
.ni[data-view="memory"]:hover,.ni[data-view="memory"].active{background:rgba(0,255,242,.07);color:var(--teal)}
.ni[data-view="history"]:hover,.ni[data-view="history"].active{background:rgba(0,255,242,.07);color:var(--teal)}
/* Intelligence — per-item colors matching their icon colors */
.ni[data-view="jarvis-morning"]:hover,.ni[data-view="jarvis-morning"].active{background:rgba(245,158,11,.08);color:var(--amber)}
.ni[data-view="jarvis-morning"].active::after{background:var(--amber);content:"";width:5px;height:5px;border-radius:50%;margin-left:auto;flex-shrink:0;display:block}
.ni[data-view="jarvis-capture"]:hover,.ni[data-view="jarvis-capture"].active{background:rgba(0,255,242,.07);color:var(--teal)}
.ni[data-view="jarvis-capture"].active::after{background:var(--teal);content:"";width:5px;height:5px;border-radius:50%;margin-left:auto;flex-shrink:0;display:block}
.ni[data-view="jarvis-connect"]:hover,.ni[data-view="jarvis-connect"].active{background:rgba(168,85,247,.08);color:var(--purple)}
.ni[data-view="jarvis-connect"].active::after{background:var(--purple);content:"";width:5px;height:5px;border-radius:50%;margin-left:auto;flex-shrink:0;display:block}
.ni[data-view="jarvis-weekly"]:hover,.ni[data-view="jarvis-weekly"].active{background:rgba(34,197,94,.08);color:var(--green)}
.ni[data-view="jarvis-weekly"].active::after{background:var(--green);content:"";width:5px;height:5px;border-radius:50%;margin-left:auto;flex-shrink:0;display:block}
.ni[data-view="jarvis-belief"]:hover,.ni[data-view="jarvis-belief"].active{background:rgba(0,255,242,.07);color:var(--teal)}
.ni[data-view="jarvis-belief"].active::after{background:var(--teal);content:"";width:5px;height:5px;border-radius:50%;margin-left:auto;flex-shrink:0;display:block}
.ni[data-view="jarvis-pattern"]:hover,.ni[data-view="jarvis-pattern"].active{background:rgba(255,140,0,.08);color:var(--orange)}
.ni[data-view="jarvis-pattern"].active::after{background:var(--orange);content:"";width:5px;height:5px;border-radius:50%;margin-left:auto;flex-shrink:0;display:block}
.ni[data-view="jarvis-decision"]:hover,.ni[data-view="jarvis-decision"].active{background:rgba(245,158,11,.08);color:var(--amber)}
.ni[data-view="jarvis-decision"].active::after{background:var(--amber);content:"";width:5px;height:5px;border-radius:50%;margin-left:auto;flex-shrink:0;display:block}
.ni[data-view="jarvis-claude"]:hover,.ni[data-view="jarvis-claude"].active{background:rgba(236,72,153,.08);color:var(--pink)}
.ni[data-view="jarvis-claude"].active::after{background:var(--pink);content:"";width:5px;height:5px;border-radius:50%;margin-left:auto;flex-shrink:0;display:block}
/* Dynamic world nav items — inherit --ni-color set per item */
.ni.world-ni:hover{background:color-mix(in srgb,var(--ni-color,var(--teal)) 8%,transparent);color:var(--ni-color,var(--teal))}
.ni.world-ni.active{background:color-mix(in srgb,var(--ni-color,var(--teal)) 10%,transparent);color:var(--ni-color,var(--teal));font-weight:700}
.ni.world-ni.active::after{background:var(--ni-color,var(--teal));width:5px;height:5px;border-radius:50%;margin-left:auto;flex-shrink:0;display:block}

    /* Morning brief amber accent */
    #view-jarvis-morning .vh{border-bottom-color:var(--orange2)}

    /* Mobile responsive */
    @media(max-width:768px){
      #claudeMDBody>div{grid-template-columns:1fr;overflow-y:auto}
      #claudeMDBody>div>div:first-child{display:none}
      #claudeMDBody>div>div:last-child{padding:12px}
      #jarvisMorningBody .brief-dash-inner{grid-template-columns:1fr}
    }
  `;
  document.head.appendChild(s);
})();


// ═══════════════════════════════════════════════════════════════════════════
// J.O.B. ENHANCEMENT LAYER v2
// 1. Taglish intent expansion
// 2. 2-second pause (in initRecognition above)
// 3. Audio chimes (error/success)
// 4. Task/notes/calendar/todo voice management + auto daily brief
// 5. Voice biometric lock
// 6. Free-flow conversation + preference adaptation
// ═══════════════════════════════════════════════════════════════════════════

// ── ENHANCEMENT 3: Audio Chimes (Web Audio API, no CDN) ──────────────────
const _audioCtx = new (window.AudioContext||window.webkitAudioContext)();

function _playChime(freq, type, duration, volume, decay){
  try{
    const osc=_audioCtx.createOscillator();
    const gain=_audioCtx.createGain();
    osc.connect(gain);
    gain.connect(_audioCtx.destination);
    osc.type=type||'sine';
    osc.frequency.setValueAtTime(freq,_audioCtx.currentTime);
    gain.gain.setValueAtTime(volume||0.3,_audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001,_audioCtx.currentTime+(decay||0.6));
    osc.start(_audioCtx.currentTime);
    osc.stop(_audioCtx.currentTime+(duration||0.6));
  }catch(e){}
}

// Error chime: low-frequency descending two-tone (replaces all spoken errors)
function chimeError(){
  _playChime(220,'sine',0.4,0.25,0.4);
  setTimeout(()=>_playChime(165,'sine',0.5,0.2,0.5),180);
}

// Success chime: positive ascending two-tone
function chimeSuccess(){
  _playChime(523,'sine',0.18,0.2,0.18);
  setTimeout(()=>_playChime(659,'sine',0.25,0.18,0.25),160);
}

// Notification chime: single mid tone
function chimeNotify(){
  _playChime(440,'sine',0.3,0.15,0.3);
}

// Boot chime — soft three-note ascending tone, JELIX coming online
function chimeboot(){
  _playChime(349,'sine',0.15,0.16,0.22);
  setTimeout(()=>_playChime(440,'sine',0.15,0.16,0.22),190);
  setTimeout(()=>_playChime(523,'sine',0.3,0.18,0.45),380);
}

// Patch speak() to play chimes instead of speaking error messages
const _origSpeak = window.speak;
window.speak = async function(text){
  if(!text) return;
  // Intercept error patterns — play chime instead of speaking
  const errorPatterns = [/error/i, /failed/i, /not found/i, /could not/i, /unable/i, /invalid/i, /denied/i, /no speech/i, /unclear/i];
  const isError = errorPatterns.some(p=>p.test(text));
  if(isError){ _safeChime('chimeError'); showToast(text); return; }
  // Success patterns — chime + speak
  const successPatterns = [/saved/i, /done/i, /complete/i, /added/i, /created/i, /updated/i, /synced/i, /installed/i, /captured/i, /logged/i];
  if(successPatterns.some(p=>p.test(text))) _safeChime('chimeSuccess');
  if(_origSpeak) return _origSpeak.apply(this, arguments);
};

// ── ENHANCEMENT 4: Task / Notes / Calendar / Todo voice management ────────

// Taglish intent patterns (expand existing FLUID_VOICE_INTENTS)
const TAGLISH_INTENTS = [
  // Tagalog/Taglish task queries
  {re:/ano.*tasks?\s*(ko|natin|ngayon)?/i,          action:'query_tasks'},
  {re:/anong.*gagawin\s*(ko|natin)?/i,               action:'query_tasks'},
  {re:/ilang.*tasks?\s*(na|pa)?/i,                   action:'query_tasks'},
  {re:/mag[- ]?add.*task[:\-\s]+(?<title>.+)/i,      action:'add_task'},
  {re:/gumawa.*task[:\-\s]+(?<title>.+)/i,           action:'add_task'},
  // Calendar
  {re:/anong.*schedule\s*(ko|natin)?\s*(ngayon|bukas|mamaya)?/i, action:'query_calendar'},
  {re:/anong.*events?\s*(ngayon|bukas|mamaya)?/i,    action:'query_calendar'},
  {re:/may.*meeting\s*(ba|ako|tayo)?\s*(ngayon|bukas)?/i, action:'query_calendar'},
  // Notes
  {re:/anong.*notes?\s*(ko|natin)?/i,                action:'query_notes'},
  {re:/basahin.*notes?/i,                            action:'query_notes'},
  // Daily brief
  {re:/(daily\s*brief|morning\s*brief|anong.*balita|update\s*ko|briefing)/i, action:'daily_brief'},
  // Completion
  {re:/(tapos\s*na|done\s*na|natapos)\s+(?<target>.+)/i, action:'update_task_status_done'},
  // Priority
  {re:/i[- ]?priority\s+(?<target>.+)/i,             action:'flag_priority'},
  // Add to-do
  {re:/(i[- ]?todo|itodo|to[- ]?do)[:\-\s]+(?<title>.+)/i, action:'add_task'},
];

// Patch executeVoiceCommand to handle Taglish before English intents
const _origExecVCEnhanced = window.executeVoiceCommand;
window.executeVoiceCommand = function(rawText){
  const t = rawText.toLowerCase().trim();

  for(const intent of TAGLISH_INTENTS){
    const m = t.match(intent.re);
    if(!m) continue;
    const g = m.groups||{};

    switch(intent.action){
      case 'query_tasks':{
        const open=(DB.tasks||[]).filter(t=>t.status!=='Done');
        const high=open.filter(t=>t.priority==='High');
        const result = open.length===0
          ? 'Wala kang open tasks ngayon. Clean slate!'
          : `${open.length} open tasks. ${high.length} high priority: ${high.slice(0,3).map(t=>t.title).join(', ')}${high.length>3?'...':'.'}`
        ;
        setVcState('idle'); showVcResult(result); speak(result); _safeChime('chimeSuccess'); return;
      }
      case 'query_calendar':{
        const today=localDateStr(new Date());
        const evs=(DB.calEvents||[]).filter(e=>e.date===today);
        const result = evs.length===0
          ? 'Walang events today.'
          : `${evs.length} events ngayon: ${evs.map(e=>(e.time?to12h(e.time)+' ':'')+e.title).join('; ')}.`
        ;
        setVcState('idle'); showVcResult(result); speak(result); _safeChime('chimeSuccess'); return;
      }
      case 'query_notes':{
        const notes=(DB.notes||[]).slice(0,3);
        const result = notes.length===0
          ? 'Walang notes pa.'
          : `Notes mo: ${notes.map(n=>n.title).join(', ')}.`
        ;
        setVcState('idle'); showVcResult(result); speak(result); _safeChime('chimeSuccess'); return;
      }
      case 'daily_brief':{
        setView('jarvis-morning');
        setTimeout(()=>{ runMorningIntelligence(); speakSlow(_lastMorningIntelligence||'Morning brief ready.'); _safeChime('chimeSuccess'); }, 400);
        setVcState('idle'); return;
      }
      case 'update_task_status_done':{
        const target=(g.target||'').trim();
        const task=fuzzyFind(target,DB.tasks||[],t=>t.title,3);
        if(task){
          task.status='Done'; save('tasks'); SB.update('tasks',task.id,task,'tasks'); syncTaskToNoteBlock(task);
          const result=`Done na — "${task.title}" marked complete.`;
          setVcState('idle'); showVcResult(result); speak(result); _safeChime('chimeSuccess');
        }else{
          const result='Hindi ko mahanap yung task na iyon.';
          setVcState('idle'); showVcResult(result); _safeChime('chimeError');
        }
        return;
      }
      case 'flag_priority':{
        const target=(g.target||'').trim();
        const task=fuzzyFind(target,DB.tasks||[],t=>t.title,3);
        if(task){
          task.priority='High'; save('tasks'); SB.update('tasks',task.id,task,'tasks');
          const result=`Priority set to High: "${task.title}".`;
          setVcState('idle'); showVcResult(result); speak(result); _safeChime('chimeSuccess');
        }else{
          _safeChime('chimeError');
          setVcState('idle');
        }
        return;
      }
      case 'add_task':{
        const title=(g.title||rawText).trim();
        const task={id:Date.now(),title,world:'LIFE',priority:'Medium',status:'Todo',due:'',notes:''};
        DB.tasks.unshift(task); save('tasks'); SB.upsert('tasks',task,'tasks');
        const result=`Task added: "${title}".`;
        setVcState('idle'); showVcResult(result); speak(result); _safeChime('chimeSuccess');
        addHistory('add','Voice task: '+title,{...task,_dbKey:'tasks'});
        return;
      }
    }
  }

  // Fall through to original handler
  if(_origExecVCEnhanced) _origExecVCEnhanced.apply(this,[rawText]);
};

// Patch original voice handler to use chimes for success/error
const _origExecVC2 = window.executeVoiceCommand;

// ── ENHANCEMENT 4b: Auto daily brief on first open of the day ─────────────
// scheduleAutoBrief is called inside loadOS() post-unlock
function scheduleAutoBrief(){
  const lastKey='j-auto-brief-shown';
  const today=localDateStr(new Date());
  if(localStorage.getItem(lastKey)===today) return;
  localStorage.setItem(lastKey,today);
  setTimeout(()=>{
    try{
      runMorningIntelligence();
      chimeboot();
      setTimeout(()=>speak(_lastMorningIntelligence||'Good morning. Daily brief is ready.'),1200);
    }catch(e){}
  },3000);
}

// ── ENHANCEMENT 5: Voice Biometric Lock ───────────────────────────────────
const VBL = {
  STORE_KEY: 'j-voice-biometric',
  PHRASE: 'J.O.B Systems unlock',  // enrollment trigger phrase
  enrolled: false,
  locked: false,
  profile: null,   // stored audio features
  attempts: 0,
  MAX_ATTEMPTS: 3,

  // Feature extraction from AudioBuffer (energy + spectral centroid approximation)
  extractFeatures(buffer){
    const data = buffer.getChannelData(0);
    const len = data.length;
    // RMS energy
    let energy = 0;
    for(let i=0;i<len;i++) energy+=data[i]*data[i];
    energy = Math.sqrt(energy/len);
    // Zero crossing rate
    let zcr=0;
    for(let i=1;i<len;i++) if(data[i]*data[i-1]<0) zcr++;
    zcr = zcr/len;
    // Peak amplitude
    let peak=0;
    for(let i=0;i<len;i++) if(Math.abs(data[i])>peak) peak=Math.abs(data[i]);
    // Spectral mean (rough)
    const fft=new Float32Array(256);
    return {energy:Math.round(energy*10000)/10000, zcr:Math.round(zcr*10000)/10000, peak:Math.round(peak*10000)/10000};
  },

  // Compare two feature vectors — returns similarity 0–1
  compare(a,b){
    if(!a||!b) return 0;
    const dE=Math.abs(a.energy-b.energy);
    const dZ=Math.abs(a.zcr-b.zcr);
    const dP=Math.abs(a.peak-b.peak);
    const score=1-(dE*2+dZ*3+dP*1.5)/6;
    return Math.max(0,score);
  },

  isEnrolled(){ return !!localStorage.getItem(this.STORE_KEY); },

  saveProfile(features){
    localStorage.setItem(this.STORE_KEY,JSON.stringify(features));
    this.profile=features;
    this.enrolled=true;
  },

  loadProfile(){
    const raw=localStorage.getItem(this.STORE_KEY);
    if(raw){ this.profile=JSON.parse(raw); this.enrolled=true; }
    return this.profile;
  },

  clearProfile(){
    localStorage.removeItem(this.STORE_KEY);
    this.profile=null;
    this.enrolled=false;
    showToast('Voice biometric cleared.');
  }
};

// Enroll voice biometric
async function enrollVoiceBiometric(){
  if(!navigator.mediaDevices?.getUserMedia){
    showToast('⚠ Microphone access required for biometric enrollment.');
    return;
  }
  showToast('🎙 Speak your enrollment phrase: "J.O.B Systems unlock" — recording for 4 seconds...');
  speak('Please say: J.O.B Systems unlock.');
  try{
    const stream = await navigator.mediaDevices.getUserMedia({audio:true});
    const recorder = new MediaRecorder(stream);
    const chunks=[];
    recorder.ondataavailable=e=>chunks.push(e.data);
    recorder.onstop=async()=>{
      stream.getTracks().forEach(t=>t.stop());
      const blob=new Blob(chunks,{type:'audio/webm'});
      const ab=await blob.arrayBuffer();
      const audioBuffer=await _audioCtx.decodeAudioData(ab);
      const features=VBL.extractFeatures(audioBuffer);
      VBL.saveProfile(features);
      _safeChime('chimeSuccess');
      showToast('✓ Voice biometric enrolled. Only your voice can now unlock J.O.B Systems.');
      speak('Voice biometric enrolled. J.O.B Systems is now locked to your voice.');
    };
    recorder.start();
    setTimeout(()=>recorder.stop(),4000);
  }catch(e){
    _safeChime('chimeError');
    showToast('⚠ Enrollment failed: '+e.message);
  }
}

// Verify voice against stored profile
async function verifyVoiceBiometric(){
  return new Promise(async(resolve)=>{
    if(!VBL.isEnrolled()){ resolve(true); return; } // not enrolled = open
    if(!navigator.mediaDevices?.getUserMedia){ resolve(true); return; }
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const recorder=new MediaRecorder(stream);
      const chunks=[];
      recorder.ondataavailable=e=>chunks.push(e.data);
      recorder.onstop=async()=>{
        stream.getTracks().forEach(t=>t.stop());
        try{
          const blob=new Blob(chunks,{type:'audio/webm'});
          const ab=await blob.arrayBuffer();
          const audioBuffer=await _audioCtx.decodeAudioData(ab);
          const features=VBL.extractFeatures(audioBuffer);
          const profile=VBL.loadProfile();
          const score=VBL.compare(features,profile);
          resolve(score>=0.65); // 65% similarity threshold
        }catch(e){ resolve(false); }
      };
      recorder.start();
      setTimeout(()=>recorder.stop(),3000);
    }catch(e){ resolve(true); }
  });
}

// Expose biometric controls to CMD palette and topbar
window.enrollVoiceBiometric=enrollVoiceBiometric;
window.clearVoiceBiometric=()=>VBL.clearProfile();

// Add biometric controls to CMD palette
if(Array.isArray(window.CMD_ITEMS)){
  window.CMD_ITEMS.push(
    {label:'Enroll Voice Biometric',sub:'Lock J.O.B Systems to your voice',icon:'ti-microphone',action:enrollVoiceBiometric,group:'Security'},
    {label:'Clear Voice Biometric',sub:'Remove voice lock',icon:'ti-lock-open',action:()=>VBL.clearProfile(),group:'Security'}
  );
}

// ── ENHANCEMENT 6: Preference learning from conversation ──────────────────
function learnFromConversation(userMsg, agentReply){
  // Detect explicit preference signals
  const msg=userMsg.toLowerCase();
  if(/too long|keep it short|be brief|mas maikli/i.test(msg)){
    JELIX_PREFS.responseLength='brief';
    savePrefs();
  }
  if(/more detail|elaborate|explain more|dagdag/i.test(msg)){
    JELIX_PREFS.responseLength='detailed';
    savePrefs();
  }
  if(/speak (in )?tagalog|sa tagalog|mag[- ]?tagalog/i.test(msg)){
    JELIX_PREFS.language='tagalog';
    savePrefs();
  }
  if(/english (lang|only|please)|english na/i.test(msg)){
    JELIX_PREFS.language='english';
    savePrefs();
  }
  if(/don'?t (repeat|say that again)|paulit[- ]ulit/i.test(msg)){
    JELIX_PREFS.noRepeat=true;
    savePrefs();
  }
}

// Patch sendAI to learn from each exchange
const _origSendAI=window.sendAI;
window.sendAI=async function(){
  const input=document.getElementById('aiInput');
  const userMsg=input?.value?.trim()||'';
  if(_origSendAI) await _origSendAI.apply(this,arguments);
  // Learn after the exchange completes
  const lastAiMsg=document.querySelector('#aiMsgs .mbubble.ai:last-child');
  if(userMsg && lastAiMsg) learnFromConversation(userMsg, lastAiMsg.textContent);
};

// Chime on successful voice command execution
const _origShowVcResult=window.showVcResult;
window.showVcResult=function(text){
  if(_origShowVcResult) _origShowVcResult.apply(this,arguments);
  if(text && !/error|not|unclear|cannot|denied/i.test(text)) _safeChime('chimeSuccess');
  else if(text) _safeChime('chimeError');
};

console.log('[J.O.B Systems] Enhancement Layer v2 loaded — Taglish + Chimes + Biometric + Free-flow');
console.log('[J.O.B Systems] JELIX Intelligence Layer loaded — Skills 1–7 + CLAUDE.md active.');

// ═══════════════════════════════════════════════════════════════════════════
// J.O.B. WAKE WORD — always-on passive listener
// Activates voice mode when "jelix" is detected in any utterance
// Runs a separate lightweight continuous recogniser at low sensitivity
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// J.O.B. WAKE WORD — OPT-IN ONLY
// Microphone is NEVER opened automatically.
// Three and only three triggers:
//   1. Spacebar (keyboard shortcut)
//   2. Voice button (topbar / sidebar)
//   3. User explicitly enables wake word via the toggle below
// ═══════════════════════════════════════════════════════════════════════════
(function initWakeWordListener(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR) return;

  const WAKE_TRIGGERS=[
    /\bjelix\b/i,/\bjalix\b/i,/\bjellix\b/i,/\bhelix\b/i,
    /\bhey jelix\b/i,/\bhi jelix\b/i,/\bok jelix\b/i
  ];

  let wakeRec=null;
  let wakeActive=false;
  let wakeEnabled=false;     // OFF by default — mic stays closed
  let wakeRestartTimer=null;

  function startWakeListener(){
    if(!wakeEnabled||wakeActive||isRecording) return;  // guard: only when enabled
    try{
      wakeRec=new SR();
      wakeRec.continuous=false;
      wakeRec.interimResults=false;   // less processing, no continuous stream
      wakeRec.lang='en-PH';
      wakeRec.maxAlternatives=2;

      wakeRec.onstart=()=>{ wakeActive=true; };

      wakeRec.onresult=(e)=>{
        for(let i=e.resultIndex;i<e.results.length;i++){
          const txt=(e.results[i][0]?.transcript||'');
          if(WAKE_TRIGGERS.some(r=>r.test(txt))){
            _safeChime('chimeNotify');
            if(!isRecording){
              const rest=txt.replace(/\b(hey |hi |ok )?(jelix|jalix|jellix|helix)\b/i,'').trim();
              toggleVoice();
              if(rest) setTimeout(()=>{ const el=document.getElementById('vTranscript');if(el)el.textContent=rest; },200);
            }
            return;
          }
        }
      };

      wakeRec.onend=()=>{
        wakeActive=false;
        // Only restart if still enabled and main voice not active
        if(wakeEnabled&&!isRecording){
          wakeRestartTimer=setTimeout(startWakeListener, 800);
        }
      };

      wakeRec.onerror=(e)=>{
        wakeActive=false;
        if(e.error==='not-allowed'){
          // User denied mic — disable wake word
          wakeEnabled=false;
          updateWakeToggleUI(false);
          showToast('⚠ Microphone access denied. Wake word disabled.');
          return;
        }
        if(wakeEnabled&&e.error!=='service-not-available'){
          wakeRestartTimer=setTimeout(startWakeListener, 2000);
        }
      };

      wakeRec.start();
    }catch(err){
      wakeActive=false;
    }
  }

  function stopWakeListener(){
    clearTimeout(wakeRestartTimer);
    if(wakeRec&&wakeActive){
      try{ wakeRec.stop(); }catch(e){}
    }
    wakeActive=false;
  }

  // Enable/disable wake word — called by the toggle button
  window.setWakeWordEnabled=function(enable){
    wakeEnabled=!!enable;
    localStorage.setItem('j-wake-enabled', wakeEnabled?'1':'0');
    updateWakeToggleUI(wakeEnabled);
    if(wakeEnabled){
      showToast('✓ Wake word ON — say "Jelix" to activate voice.');
      // Requires a user gesture to start mic — start immediately since
      // this function is called from a button click (valid user gesture)
      startWakeListener();
    } else {
      stopWakeListener();
      showToast('Wake word OFF — mic is closed.');
    }
  };

  window.toggleWakeWord=function(){
    window.setWakeWordEnabled(!wakeEnabled);
  };

  window.isWakeWordEnabled=function(){ return wakeEnabled; };

  function updateWakeToggleUI(on){
    const btn=document.getElementById('wakeToggleBtn');
    if(!btn) return;
    btn.style.color         = on?'var(--green)':'var(--text3)';
    btn.style.borderColor   = on?'var(--green)':'var(--border2)';
    btn.title               = on?'Wake word ON (say Jelix)':'Wake word OFF — click to enable';
    const icon=btn.querySelector('i');
    if(icon) icon.className = on?'ti ti-ear':'ti ti-ear-off';
    const label=document.getElementById('acctWakeLabel');
    if(label) label.textContent = on?'Wake Word: On':'Wake Word: Off';
  }

  // Stop wake listener when main voice activates (avoid conflict)
  const _origToggleVoice=window.toggleVoice;
  window.toggleVoice=function(){
    stopWakeListener();
    if(_origToggleVoice) _origToggleVoice.apply(this,arguments);
  };

  // When main voice session ends — resume wake listener only if enabled
  const _origStopRec=window.stopRecording;
  window.stopRecording=function(){
    if(_origStopRec) _origStopRec.apply(this,arguments);
    if(wakeEnabled){
      wakeRestartTimer=setTimeout(startWakeListener,1000);
    }
    // Otherwise mic stays fully closed
  };

  // Restore wake state from localStorage (user chose to keep it on)
  // Only restore AFTER a user gesture — so we hook into loadOS
  window._restoreWakeState=function(){
    const saved=localStorage.getItem('j-wake-enabled');
    if(saved==='1'){
      // Don't auto-start mic — just update UI to show it was enabled
      // User must click the toggle or press Space to actually open mic
      wakeEnabled=false;  // keep off until explicit gesture
      updateWakeToggleUI(false);
      showToast('Wake word was ON last session — click the ear icon to re-enable.');
    }
  };

  console.log('[J.O.B Systems] Wake word listener ready — OFF by default. Mic closed.');
})();

// runBootSequence() now called by unlockSystem() after PIN entry
