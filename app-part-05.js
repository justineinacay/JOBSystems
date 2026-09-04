// ═══════════════════════════════════════════════════════════════════════

// ── Budget storage ────────────────────────────────────────────────────────
function getBudgets(){return JSON.parse(localStorage.getItem('j-budgets')||'{}');}
function saveBudgets(b){localStorage.setItem('j-budgets',JSON.stringify(b));}
function isLifeExpenseTransaction(t){return !!t&&(t.type==='Credit'||t.type==='Payment');}

// ── Account list — DB.accounts is the source of truth (with legacy fallback) ──
function getAccountNames(){
  const names=[];
  const seen=new Set();
  const addName=name=>{
    const clean=String(name||'').trim();
    const key=clean.toLocaleLowerCase();
    if(!clean||seen.has(key))return;
    seen.add(key);names.push(clean);
  };
  (DB.accounts||[]).forEach(a=>addName(a.name));
  // Legacy safety net: surface any account name used in old transactions but not in DB.accounts
  (DB.cashflow||[]).forEach(t=>{
    addName(t.account);
    addName(t._fromAccount);
    addName(t._toAccount);
  });
  return names;
}
function addAccount(name,startingBalance){
  name=(name||'').trim();
  if(!name){showToast('⚠ Account name required.');return null;}
  if((DB.accounts||[]).some(a=>a.name.toLowerCase()===name.toLowerCase())){showToast('⚠ An account named "'+name+'" already exists.');return null;}
  const a={id:Date.now(),name,startingBalance:parseFloat(startingBalance)||0};
  DB.accounts=DB.accounts||[];
  DB.accounts.push(a);
  save('accounts');
  SB.upsert('accounts',a,'accounts');
  addHistory('add','Added account: '+a.name,{...a,_dbKey:'accounts'});
  showToast('✓ Account added: '+a.name);
  return a;
}
async function deleteAccount(id){
  const a=(DB.accounts||[]).find(x=>x.id===id);if(!a)return;
  const accountKey=String(a.name||'').trim().toLocaleLowerCase();
  const matches=value=>String(value||'').trim().toLocaleLowerCase()===accountKey;
  const inUse=(DB.cashflow||[]).some(t=>matches(t.account)||matches(t._fromAccount)||matches(t._toAccount));
  if(inUse&&!await jelixConfirm('"'+a.name+'" has existing transactions. Delete the account anyway? Transactions will keep the account name as a label but it will no longer appear in the account list.','Delete'))return;
  DB.accounts=DB.accounts.filter(x=>x.id!==id);
  save('accounts');SB.remove('accounts',id,'accounts');
  addHistory('delete','Deleted account: '+a.name,{...a,_dbKey:'accounts'});
  renderLife();showToast('Account deleted');
}
async function promptNewAccount(onCreated){
  const result=await jelixPrompt('New Account',[
    {key:'name',label:'Account name',placeholder:'e.g. "Seabank", "Emergency Fund"'},
    {key:'sb',label:'Starting balance (optional, defaults to ₱0)',type:'number',default:'0'},
  ],'Add');
  if(!result)return;
  const [name,sbRaw]=result;
  const a=addAccount(name,sbRaw);
  if(a&&typeof onCreated==='function')onCreated(a);
}
function populateAccountSelect(selId,selectedName){
  const sel=document.getElementById(selId);if(!sel)return;
  const names=getAccountNames();
  sel.innerHTML=names.map(n=>`<option value="${n}">${n}</option>`).join('')+'<option value="__new__">+ Add new account…</option>';
  if(selectedName){
    const selectedKey=String(selectedName).trim().toLocaleLowerCase();
    const matchingName=names.find(name=>name.toLocaleLowerCase()===selectedKey);
    if(matchingName)sel.value=matchingName;
  }
}

// ── Account balance calculator ────────────────────────────────────────────
function getAccountBalance(account){
  const accountKey=String(account||'').trim().toLocaleLowerCase();
  const matches=value=>String(value||'').trim().toLocaleLowerCase()===accountKey;
  const acctObj=(DB.accounts||[]).find(a=>matches(a.name));
  const starting=acctObj?(acctObj.startingBalance||0):0;
  return (DB.cashflow||[]).reduce((sum,t)=>{
    if(t.type==='Transfer'){
      if(matches(t._fromAccount))return sum-(t.amount||0);
      if(matches(t._toAccount))return sum+(t.amount||0);
      return sum;
    }
    if(!matches(t.account))return sum;
    if(t.type==='Debit')return sum+(Number(t.amount)||0);      // income → add
    if(isLifeExpenseTransaction(t))return sum-(Number(t.amount)||0); // expense → subtract
    return sum;
  },starting);
}
function getTotalPortfolioBalance(){
  return getAccountNames().reduce((sum,n)=>sum+getAccountBalance(n),0);
}

// ── Format helpers ────────────────────────────────────────────────────────
const fmtPHP = v => '₱'+Math.abs(v).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});
const signedFmt = v => (v>0?'+':v<0?'-':'')+fmtPHP(v);

// ── Overview month state ──────────────────────────────────────────────────
let overviewYear=new Date().getFullYear(), overviewMonth=new Date().getMonth();
function shiftOverviewMonth(dir){
  overviewMonth+=dir;
  if(overviewMonth>11){overviewMonth=0;overviewYear++;}
  if(overviewMonth<0){overviewMonth=11;overviewYear--;}
  renderLife();
}
function setOverviewMonthToday(){overviewYear=new Date().getFullYear();overviewMonth=new Date().getMonth();renderLife();}

function renderLife(){renderDomainTimerCard('life');
  const txns = DB.cashflow||[];
  const monthStr=`${overviewYear}-${String(overviewMonth+1).padStart(2,'0')}`;
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];

  // Month label
  const lbl=document.getElementById('cf-month-label');
  if(lbl)lbl.textContent=MONTHS[overviewMonth]+' '+overviewYear;

  // This month's transactions
  const thisMonth=txns.filter(t=>t.date&&t.date.startsWith(monthStr));
  const debits=thisMonth.filter(t=>t.type==='Debit');
  const credits=thisMonth.filter(isLifeExpenseTransaction);
  const totalIncome=debits.reduce((s,t)=>s+(t.amount||0),0);
  const totalExpense=credits.reduce((s,t)=>s+(t.amount||0),0);
  const net=totalIncome-totalExpense;

  // Carried balance = all transactions BEFORE this month, PLUS each account's starting balance
  // (Carried Balance + Net This Month should always equal the current Total Portfolio Balance)
  const prevTxns=txns.filter(t=>t.date&&t.date<monthStr+'-01');
  const prevInc=prevTxns.filter(t=>t.type==='Debit').reduce((s,t)=>s+(t.amount||0),0);
  const prevExp=prevTxns.filter(t=>t.type==='Credit'||t.type==='Payment').reduce((s,t)=>s+(t.amount||0),0);
  const startingTotal=(DB.accounts||[]).reduce((s,a)=>s+(a.startingBalance||0),0);
  const carried=prevInc-prevExp+startingTotal;

  // ── Summary cards ──────────────────────────────────────────────────────
  const elIncome = document.getElementById('cf-income');
  if(elIncome) elIncome.textContent = fmtPHP(totalIncome);
  const elExpense = document.getElementById('cf-expense');
  if(elExpense) elExpense.textContent = fmtPHP(totalExpense);
  const elCarried = document.getElementById('cf-carried');
  if(elCarried){elCarried.textContent=(carried>=0?'+':'-')+fmtPHP(carried);elCarried.style.color=carried>=0?'var(--green)':'var(--red)';}

  // Net: positive surplus → green, negative deficit → red
  const elNet = document.getElementById('cf-net');
  const elNetLabel = document.getElementById('cf-net-label');
  if(elNet){
    elNet.textContent = (net>0?'+':net<0?'-':'')+fmtPHP(net);
    elNet.style.color = net>0?'var(--green)':net<0?'var(--red)':'var(--text2)';

  }
  if(elNetLabel) elNetLabel.textContent = net>0?'Surplus':net<0?'Deficit':'Balanced';

  const elCount = document.getElementById('cf-count');
  if(elCount) elCount.textContent = thisMonth.length;

  // ── Account balance strip ──────────────────────────────────────────────
  const allAccounts=getAccountNames();
  const stripEl = document.getElementById('cf-account-strip');
  if(stripEl){
    stripEl.innerHTML = (allAccounts.length ? allAccounts.map(acct=>{
      const bal = getAccountBalance(acct);
      return `<div class="hc" style="padding:10px 12px;cursor:pointer" onclick="setCFTab('accounts',document.querySelector('#view-life .cftab .cfbt:nth-child(4)'))">
        <div class="cl">${acct}</div>
        <div style="font-size:16px;font-weight:800;color:${bal>0?'var(--green)':bal<0?'var(--red)':'var(--text2)'};margin-top:3px">${bal>0?'+':bal<0?'-':''}${fmtPHP(bal)}</div>
      </div>`;
    }).join('') : '')
    + `<div class="hc" style="padding:10px 12px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--text3)" onclick="promptNewAccount(()=>{renderLife();})"><i class="ti ti-plus" style="font-size:var(--text-xs);margin-right:5px"></i>Add Account</div>`;
  }

  // ── Recent panels ──────────────────────────────────────────────────────
  const recentDebitEl = document.getElementById('cf-recent-debits');
  if(recentDebitEl){
    recentDebitEl.innerHTML = debits.length ? `<div style="overflow-y:auto;max-height:220px;-webkit-overflow-scrolling:touch">`+debits.map(t=>`
      <div class="brow">
        <div class="bdot" style="background:var(--green)"></div>
        <div class="btxt">${t.desc||'—'}${t.date?`<span style="font-size:var(--text-xs);color:var(--text3);margin-left:6px">${t.date}</span>`:''}</div>
        <span class="btag pg">+${fmtPHP(t.amount)}</span>
      </div>`).join('')+`</div>`
    : '<div style="font-size:var(--text-xs);color:var(--text3)">No income entries yet.</div>';
  }

  const recentCreditEl = document.getElementById('cf-recent-credits');
  if(recentCreditEl){
    recentCreditEl.innerHTML = credits.length ? `<div style="overflow-y:auto;max-height:220px;-webkit-overflow-scrolling:touch">`+credits.map(t=>`
      <div class="brow">
        <div class="bdot" style="background:var(--red)"></div>
        <div class="btxt">${t.desc||'—'}${t.date?`<span style="font-size:var(--text-xs);color:var(--text3);margin-left:6px">${t.date}</span>`:''}</div>
        <span class="btag pr">-${fmtPHP(t.amount)}</span>
      </div>`).join('')+`</div>`
    : '<div style="font-size:var(--text-xs);color:var(--text3)">No expense entries yet.</div>';
  }

  // ── Refresh active sub-tab ─────────────────────────────────────────────
  if(cfActiveTab==='transactions') renderCashTable();
  else if(cfActiveTab==='overview'){renderCashCharts();renderCashForecast();}
  else if(cfActiveTab==='budget') renderBudgetTab();
  else if(cfActiveTab==='accounts') renderAccountsTab();
  else if(cfActiveTab==='loans') renderLoansTab();
}

// ═══════════════════════════════════════════════════════════════════════════
// LOANS — Debt Elimination Tracker
// ═══════════════════════════════════════════════════════════════════════════
if(!DB.loans)DB.loans=[];

// ═══════════════════════════════════════════════════════════════════════════
// BILL TRACKER — LIFE domain. Local-only for now (no matching Supabase table
// exists yet, same situation DB.worlds is in) — bills persist on this device
// via localStorage but won't sync across devices until a 'bills' table is
// added on the Supabase side.
// ═══════════════════════════════════════════════════════════════════════════
let editingBillId=null;
function openBillModal(billId){
  editingBillId=billId||null;
  const b=billId?DB.bills.find(x=>x.id===billId):null;
  document.getElementById('billModalTitle').textContent=b?'Edit Bill':'Add Bill';
  document.getElementById('bill-name').value=b?b.name:'';
  document.getElementById('bill-amount').value=b?b.amount:'';
  document.getElementById('bill-due').value=b?b.dueDate:localDateStr(new Date());
  document.getElementById('bill-method').value=b?b.paymentMethod:'Cash';
  document.getElementById('bill-category').value=b?b.category:'Utilities';
  document.getElementById('bill-recurring').checked=b?!!b.recurring:false;
  openModal('billModal');
}
function saveBillFromModal(){
  const name=document.getElementById('bill-name').value.trim();
  if(!name){showToast('⚠ Bill needs a name');return;}
  const amount=parseFloat(document.getElementById('bill-amount').value)||0;
  const dueDate=document.getElementById('bill-due').value||localDateStr(new Date());
  const paymentMethod=document.getElementById('bill-method').value;
  const category=document.getElementById('bill-category').value;
  const recurring=document.getElementById('bill-recurring').checked;
  let bill;
  if(editingBillId){
    bill=DB.bills.find(x=>x.id===editingBillId);
    if(bill)Object.assign(bill,{name,amount,dueDate,paymentMethod,category,recurring});
  }else{
    bill={id:'bill'+Date.now(),name,amount,dueDate,paymentMethod,category,recurring,status:'unpaid'};
    DB.bills.push(bill);
  }
  save('bills');
  _syncBillToCalendar(bill);
  closeModal('billModal');
  renderBillTracker();
}
function _syncBillToCalendar(bill){
  if(!bill)return;
  let ev=DB.calEvents.find(e=>e._billId===bill.id);
  if(bill.status==='paid'){
    // Paid bills don't need a reminder sitting on the calendar anymore
    if(ev){DB.calEvents=DB.calEvents.filter(e=>e._billId!==bill.id);SB.remove('cal_events',ev.id,'calEvents');}
    return;
  }
  if(ev){
    ev.title='Bill due: '+bill.name;ev.date=bill.dueDate;
    SB.update('cal_events',ev.id,ev,'calEvents');
  }else{
    ev={id:Date.now()+2,_billId:bill.id,title:'Bill due: '+bill.name,date:bill.dueDate,time:'',endTime:'',type:'life',loc:'',notes:'₱'+bill.amount.toLocaleString(undefined,{minimumFractionDigits:2})+' · '+bill.paymentMethod,_isBill:true};
    DB.calEvents.push(ev);
    SB.upsert('cal_events',ev,'calEvents');
  }
}
function toggleBillPaid(billId){
  const b=DB.bills.find(x=>x.id===billId);if(!b)return;
  if(b.status==='paid'){
    b.status='unpaid';
  }else{
    b.status='paid';
    // Recurring bills spawn next month's instance automatically once paid
    if(b.recurring){
      const nextDate=new Date(b.dueDate+'T00:00:00');
      nextDate.setMonth(nextDate.getMonth()+1);
      const nextBill={id:'bill'+Date.now(),name:b.name,amount:b.amount,dueDate:localDateStr(nextDate),paymentMethod:b.paymentMethod,category:b.category,recurring:true,status:'unpaid'};
      DB.bills.push(nextBill);
      _syncBillToCalendar(nextBill);
      showToast('✓ Paid — next month\'s '+b.name+' bill created automatically');
    }
  }
  save('bills');
  _syncBillToCalendar(b);
  renderBillTracker();
}
async function deleteBill(billId){
  if(!await jelixConfirm('Delete this bill?','Delete'))return;
  const ev=DB.calEvents.find(e=>e._billId===billId);
  if(ev){DB.calEvents=DB.calEvents.filter(e=>e._billId!==billId);SB.remove('cal_events',ev.id,'calEvents');}
  DB.bills=DB.bills.filter(b=>b.id!==billId);
  save('bills');
  renderBillTracker();
}
function renderBillTracker(){
  const today=localDateStr(new Date());
  const bills=[...DB.bills].sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
  // Summary cards
  const totalDue=bills.filter(b=>b.status!=='paid').reduce((s,b)=>s+b.amount,0);
  const paidCount=bills.filter(b=>b.status==='paid').length;
  const overdueCount=bills.filter(b=>b.status!=='paid'&&b.dueDate<today).length;
  const upcomingCount=bills.filter(b=>b.status!=='paid'&&b.dueDate>=today).length;
  document.getElementById('bill-summary-cards').innerHTML=`
    <div class="hc"><div class="cl">Total Due</div><div style="font-size:var(--text-lg);font-weight:800;color:var(--amber);margin-top:4px">₱${totalDue.toLocaleString(undefined,{minimumFractionDigits:2})}</div></div>
    <div class="hc"><div class="cl">Paid</div><div style="font-size:var(--text-lg);font-weight:800;color:var(--green);margin-top:4px">${paidCount}</div></div>
    <div class="hc"><div class="cl">Upcoming</div><div style="font-size:var(--text-lg);font-weight:800;color:var(--teal);margin-top:4px">${upcomingCount}</div></div>
    <div class="hc"><div class="cl">Overdue</div><div style="font-size:var(--text-lg);font-weight:800;color:var(--red);margin-top:4px">${overdueCount}</div></div>
  `;
  // Bill list
  const list=document.getElementById('bill-list');
  if(!bills.length){
    list.innerHTML='<div class="hc" style="text-align:center;padding:24px;color:var(--text3);font-size:var(--text-sm)">No bills yet — add your first one above.</div>';
  }else{
    list.innerHTML=bills.map(b=>{
      const isOverdue=b.status!=='paid'&&b.dueDate<today;
      const isPaid=b.status==='paid';
      const statusColor=isPaid?'var(--green)':isOverdue?'var(--red)':'var(--text3)';
      const statusLabel=isPaid?'Paid':isOverdue?'Overdue':'Upcoming';
      return`<div class="hc" style="display:flex;align-items:center;gap:12px;margin-bottom:8px;padding:12px 14px;${isOverdue?'border-color:rgba(239,68,68,.4)':''}">
        <div onclick="toggleBillPaid('${b.id}')" title="${isPaid?'Mark unpaid':'Mark paid'}" style="width:22px;height:22px;border-radius:6px;border:2px solid ${isPaid?'var(--green)':'var(--border2)'};background:${isPaid?'var(--green)':'transparent'};cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center">${isPaid?'<i class="ti ti-check" style="font-size:13px;color:var(--navy1)"></i>':''}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:var(--text-sm);color:var(--text1);font-weight:600;${isPaid?'text-decoration:line-through;opacity:.6':''}">${b.name}${b.recurring?' <i class="ti ti-repeat" style="font-size:10px;color:var(--text3)" title="Recurring monthly"></i>':''}</div>
          <div style="font-size:9px;color:var(--text3);margin-top:2px">${b.dueDate} · ${b.paymentMethod} · ${b.category}</div>
        </div>
        <span style="font-size:9px;font-weight:700;color:${statusColor};text-transform:uppercase;letter-spacing:.05em;flex-shrink:0">${statusLabel}</span>
        <div style="font-size:var(--text-md);font-weight:800;color:var(--text1);flex-shrink:0;min-width:90px;text-align:right">₱${b.amount.toLocaleString(undefined,{minimumFractionDigits:2})}</div>
        <button onclick="openBillModal('${b.id}')" style="background:transparent;border:none;color:var(--text3);cursor:pointer;flex-shrink:0"><i class="ti ti-pencil" style="font-size:13px"></i></button>
        <button onclick="deleteBill('${b.id}')" style="background:transparent;border:none;color:var(--text3);cursor:pointer;flex-shrink:0"><i class="ti ti-trash" style="font-size:13px"></i></button>
      </div>`;
    }).join('');
  }
  // Charts — amount grouped by payment method, and by category
  renderBillCharts(bills);
}
function _billGroupBy(bills,key){
  const groups={};
  bills.forEach(b=>{groups[b[key]]=(groups[b[key]]||0)+b.amount;});
  return Object.entries(groups).sort((a,b)=>b[1]-a[1]);
}
function _billBarChartHtml(title,entries,color){
  if(!entries.length)return`<div class="hc"><div style="font-size:var(--text-xs);font-weight:700;color:${color};letter-spacing:.06em;text-transform:uppercase;margin-bottom:10px">${title}</div><div style="font-size:var(--text-xs);color:var(--text3);text-align:center;padding:12px">No data yet.</div></div>`;
  const max=Math.max(...entries.map(e=>e[1]),1);
  return`<div class="hc">
    <div style="font-size:var(--text-xs);font-weight:700;color:${color};letter-spacing:.06em;text-transform:uppercase;margin-bottom:12px">${title}</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${entries.map(([label,val])=>{
        const pct=Math.round((val/max)*100);
        return`<div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:9px;color:var(--text3);min-width:100px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${label}</span>
          <div style="flex:1;background:var(--navy4);border-radius:4px;height:18px;overflow:hidden"><div style="width:${pct}%;height:100%;background:${color};border-radius:4px"></div></div>
          <span style="font-size:9px;font-weight:700;color:var(--text2);min-width:70px;text-align:right">₱${val.toLocaleString(undefined,{minimumFractionDigits:0})}</span>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}
function renderBillCharts(bills){
  const byMethod=_billGroupBy(bills,'paymentMethod');
  const byCategory=_billGroupBy(bills,'category');
  document.getElementById('bill-charts').innerHTML=`
    <div class="mr" style="grid-template-columns:1fr 1fr;gap:14px">
      ${_billBarChartHtml('By Payment Method',byMethod,'var(--amber)')}
      ${_billBarChartHtml('By Category',byCategory,'var(--teal)')}
    </div>
  `;
}
function renderLoansTab(){
  const loans=DB.loans||[];
  const totalPaid=loans.reduce(function(s,l){return s+(l.amountPaid||0);},0);
  const totalRemaining=loans.reduce(function(s,l){return s+(l.remaining!=null?l.remaining:(l.principal||0));},0);
  const g=function(t){return document.getElementById(t);};
  if(g('loan-total'))g('loan-total').textContent='₱'+totalRemaining.toLocaleString('en-PH',{minimumFractionDigits:2});
  if(g('loan-paid'))g('loan-paid').textContent='₱'+totalPaid.toLocaleString('en-PH',{minimumFractionDigits:2});
  if(g('loan-count'))g('loan-count').textContent=loans.filter(function(l){return (l.remaining!=null?l.remaining:l.principal)>0;}).length;
  const list=g('loan-list');if(!list)return;
  if(!loans.length){list.innerHTML='<div style="text-align:center;color:var(--text3);font-size:var(--text-sm);padding:30px">No loans added yet. Click + Add Loan to start tracking.</div>';renderLoanStrategy();return;}
  list.innerHTML=loans.map(function(l){
    const paid=l.paymentsMade||0;
    const total=l.totalPayments||0;
    const remaining=l.remaining!=null?l.remaining:l.principal;
    const pct=l.principal>0?Math.round(((l.principal-remaining)/l.principal)*100):0;
    const done=remaining<=0;
    const clr=done?'var(--green)':'var(--text1)';
    const remClr=done?'var(--green)':'var(--red)';
    const barClr=done?'var(--green)':'var(--teal)';
    const paidOff=done?' ✔ PAID OFF':'';
    const remFmt='₱'+remaining.toLocaleString('en-PH',{minimumFractionDigits:2});
    const monFmt='₱'+(l.monthlyPayment||0).toLocaleString('en-PH',{minimumFractionDigits:2});
    const paymentPlanLabel=total?Math.max(0,total-paid)+' payments left':l.monthlyPayment?'Monthly payment '+monFmt:'Payment plan not set';
    return '<div class="hc" style="margin-bottom:10px;opacity:'+(done?0.5:1)+'">'+
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">'+
        '<div>'+
          '<div style="font-size:var(--text-sm);font-weight:700;color:'+clr+'">'+l.lender+paidOff+'</div>'+
          '<div style="font-size:var(--text-xs);color:var(--text3);margin-top:2px">'+(l.interestRate||0)+'% interest · '+monFmt+'/mo · Due '+(l.dueDate||'—')+'</div>'+
        '</div>'+
        '<div style="text-align:right">'+
          '<div style="font-size:16px;font-weight:800;color:'+remClr+'">'+remFmt+'</div>'+
          '<div style="font-size:var(--text-xs);color:var(--text3)">remaining</div>'+
        '</div>'+
      '</div>'+
      '<div style="background:var(--navy3);border-radius:10px;height:6px;margin-bottom:6px">'+
        '<div style="background:'+barClr+';height:6px;border-radius:10px;width:'+pct+'%;transition:width .4s"></div>'+
      '</div>'+
      '<div style="display:flex;justify-content:space-between;font-size:var(--text-xs);color:var(--text3);margin-bottom:8px">'+
        '<span>'+fmtPHP(l.amountPaid||0)+' paid of '+fmtPHP(l.principal||0)+'</span>'+
        '<span>'+paymentPlanLabel+' · '+pct+'% paid off</span>'+
      '</div>'+
      '<div style="display:flex;gap:6px">'+
        '<button class="btn life-loan-payment" style="font-size:var(--text-xs);padding:3px 10px" onclick="recordLoanPayment('+l.id+')"><i class="ti ti-check"></i> Record Payment</button>'+
        '<button class="btn" style="font-size:var(--text-xs);padding:3px 10px" onclick="editLoan('+l.id+')"><i class="ti ti-pencil"></i> Edit</button>'+
        '<button class="btn" style="font-size:var(--text-xs);padding:3px 10px;color:var(--red)" onclick="deleteLoan('+l.id+')"><i class="ti ti-trash"></i></button>'+
      '</div>'+
    '</div>';
  }).join('');
  renderLoanStrategy();
}

function openLoanModal(id){
  const l=id?DB.loans.find(x=>x.id===id):{};
  const ex=l||{};
  const title=id?'Edit Loan':'Add Loan';
  const m=document.createElement('div');
  m.className='mov open';m.id='loanModal';
  m.onclick=function(e){if(e.target===m)closeLoanModal();};
  m.innerHTML='<div class="modal" style="width:min(460px,96vw)">'+
    '<div class="mh"><div class="mt">'+title+'</div><button class="mc" onclick="closeLoanModal()">×</button></div>'+
    '<div class="mb">'+
      '<div class="fg"><label class="fl">Lender / Loan Name</label><input id="lm-lender" placeholder="e.g. BDO Personal Loan" value="'+(ex.lender||'')+'"></div>'+
      '<div class="fr">'+
        '<div class="fg"><label class="fl">Principal Amount (₱)</label><input type="number" id="lm-principal" value="'+(ex.principal||'')+'" placeholder="0.00"></div>'+
        '<div class="fg"><label class="fl">Interest Rate (%)</label><input type="number" id="lm-rate" value="'+(ex.interestRate||'')+'" placeholder="0.00" step="0.01"></div>'+
      '</div>'+
      '<div class="fr">'+
        '<div class="fg"><label class="fl">Monthly Payment (₱)</label><input type="number" id="lm-monthly" value="'+(ex.monthlyPayment||'')+'" placeholder="0.00"></div>'+
        '<div class="fg"><label class="fl">Total No. of Payments</label><input type="number" id="lm-total" value="'+(ex.totalPayments||'')+'" placeholder="e.g. 24"></div>'+
      '</div>'+
      '<div class="fr">'+
        '<div class="fg"><label class="fl">Total Amount Paid (₱) <span style="font-size:9px;color:var(--text3);font-weight:400">Cumulative total paid so far</span></label><input type="number" id="lm-made" value="'+(ex.amountPaid||0)+'" placeholder="0.00" step="0.01"></div>'+
        '<div class="fg"><label class="fl">Payment Due Date</label><input type="date" id="lm-due" value="'+(ex.dueDate||'')+'"></div>'+
      '</div>'+
      '<div class="fg"><label class="fl">Notes</label><textarea id="lm-notes" rows="2" placeholder="Loan terms, account number, etc.">'+(ex.notes||'')+'</textarea></div>'+
    '</div>'+
    '<div class="mf" style="justify-content:space-between">'+
      (id?'<button class="btn btn-d" onclick="deleteLoan('+id+');closeLoanModal()"><i class="ti ti-trash"></i> Delete</button>':'')+
      '<div style="display:flex;gap:8px;margin-left:auto">'+
        '<button class="btn btn-g" onclick="closeLoanModal()">Cancel</button>'+
        '<button class="btn btn-t" onclick="saveLoan('+(id?id:'null')+')">Save Loan</button>'+
      '</div>'+
    '</div>'+
  '</div>';
  const old_modal=document.getElementById('loanModal');
  if(old_modal)old_modal.remove();
  document.body.appendChild(m);
}
function closeLoanModal(){const m=document.getElementById('loanModal');if(m)m.remove();}
function saveLoan(editId){
  const principal=parseFloat(document.getElementById('lm-principal').value)||0;
  const amountPaid=parseFloat(document.getElementById('lm-made').value)||0;
  const monthly=parseFloat(document.getElementById('lm-monthly').value)||0;
  const remaining=Math.max(0,principal-amountPaid);
  const l={
    id:editId||Date.now(),
    lender:document.getElementById('lm-lender').value.trim()||'Unnamed Loan',
    principal,
    interestRate:parseFloat(document.getElementById('lm-rate').value)||0,
    monthlyPayment:monthly,
    totalPayments:parseInt(document.getElementById('lm-total').value)||0,
    amountPaid,
    remaining,
    dueDate:document.getElementById('lm-due').value,
    notes:document.getElementById('lm-notes').value.trim(),
  };
  if(editId){const i=DB.loans.findIndex(x=>x.id===editId);if(i>=0)DB.loans[i]=l;SB.update('loans',l.id,l,'loans');}
  else{DB.loans.unshift(l);SB.upsert('loans',l,'loans');}
  save('loans');closeLoanModal();renderLoansTab();
  showToast('✓ Loan saved');
}
function renderLoanStrategy(){
  const el=document.getElementById('loan-strategy-section');if(!el)return;
  const loans=(DB.loans||[]).filter(l=>(l.remaining!=null?l.remaining:l.principal)>0);
  if(!loans.length){el.innerHTML='';return;}

  // Average monthly income — trailing 3 months of Debit entries, for a stable estimate
  // rather than one potentially unusual month.
  const today=new Date();
  const threeMoAgo=localDateStr(new Date(today.getFullYear(),today.getMonth()-3,today.getDate()));
  const recentIncome=(DB.cashflow||[]).filter(t=>t.type==='Debit'&&t.date>=threeMoAgo);
  const monthsSpan=Math.max(1,Math.round((today-new Date(threeMoAgo))/(30*86400000)));
  const avgMonthlyIncome=recentIncome.reduce((s,t)=>s+(t.amount||0),0)/monthsSpan;

  const totalMonthlyObligation=loans.reduce((s,l)=>s+(l.monthlyPayment||0),0);
  const leftoverAfterLoans=avgMonthlyIncome-totalMonthlyObligation;
  const obligationPct=avgMonthlyIncome>0?Math.round((totalMonthlyObligation/avgMonthlyIncome)*100):0;
  const isOverextended=avgMonthlyIncome>0&&totalMonthlyObligation>avgMonthlyIncome;

  // Payment order: soonest due date first (avoid late fees / relationship damage) —
  // ties broken by highest interest rate (avalanche method: costs you the most while it sits unpaid).
  const today30=localDateStr(new Date(today.getTime()+30*86400000));
  const sorted=[...loans].sort((a,b)=>{
    const ad=a.dueDate||'9999',bd=b.dueDate||'9999';
    if(ad!==bd)return ad<bd?-1:1;
    return (b.interestRate||0)-(a.interestRate||0);
  });
  // Highest-interest loan among all active — where extra payment (beyond minimums) does the most good
  const highestInterestLoan=[...loans].sort((a,b)=>(b.interestRate||0)-(a.interestRate||0))[0];

  el.innerHTML=`
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
      <i class="ti ti-shield-lock" style="color:var(--amber);font-size:16px"></i>
      <span style="font-size:var(--text-sm);font-weight:700;color:var(--amber)">Strategic Payoff Plan</span>
    </div>
    <div style="font-size:var(--text-xs);color:var(--text3);margin-bottom:14px">Based on your average income over the last ${monthsSpan} month${monthsSpan!==1?'s':''} and each loan's due date — private to you.</div>

    <div class="mr" style="grid-template-columns:repeat(3,1fr);margin-bottom:14px">
      <div class="hc"><div class="cl">Avg Monthly Income</div><div style="font-size:18px;font-weight:800;color:var(--green);margin-top:4px">${fmtPHP(avgMonthlyIncome)}</div></div>
      <div class="hc"><div class="cl">Total Loan Obligations</div><div style="font-size:18px;font-weight:800;color:var(--red);margin-top:4px">${fmtPHP(totalMonthlyObligation)}</div><div style="font-size:9px;color:var(--text3);margin-top:2px">${obligationPct}% of income</div></div>
      <div class="hc" style="border-color:${isOverextended?'var(--red)':'var(--border)'}"><div class="cl">Left After Loans</div><div style="font-size:18px;font-weight:800;color:${leftoverAfterLoans>=0?'var(--green)':'var(--red)'};margin-top:4px">${leftoverAfterLoans>=0?'+':''}${fmtPHP(leftoverAfterLoans)}</div></div>
    </div>

    ${isOverextended?`<div style="background:rgba(255,34,68,.08);border:1px solid rgba(255,34,68,.3);border-radius:10px;padding:12px 14px;margin-bottom:14px;display:flex;gap:10px;align-items:flex-start">
      <i class="ti ti-alert-triangle" style="color:var(--red);font-size:16px;flex-shrink:0;margin-top:1px"></i>
      <div style="font-size:var(--text-xs);color:var(--text2)">Your loan payments (${fmtPHP(totalMonthlyObligation)}) currently exceed your average monthly income (${fmtPHP(avgMonthlyIncome)}). This isn't sustainable long-term — worth a hard look at which payments can be renegotiated, or whether a source of income needs to grow before this gap closes.</div>
    </div>`:''}

    <div style="font-size:var(--text-xs);font-weight:700;color:var(--text3);letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">Recommended Payment Order</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">
      ${sorted.map((l,i)=>{
        const dueSoon=l.dueDate&&l.dueDate<=today30;
        const isHighestInterest=highestInterestLoan&&l.lender===highestInterestLoan.lender&&l.interestRate===highestInterestLoan.interestRate;
        return `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--navy3);border:1px solid var(--border);border-left:3px solid ${dueSoon?'var(--red)':'var(--border2)'};border-radius:8px">
          <div style="width:22px;height:22px;border-radius:50%;background:var(--navy2);border:1px solid var(--border2);display:flex;align-items:center;justify-content:center;font-size:var(--text-xs);font-weight:700;color:var(--text2);flex-shrink:0">${i+1}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:var(--text-sm);font-weight:700;color:var(--text1)">${l.lender}${isHighestInterest?' <span style="font-size:9px;color:var(--amber);font-weight:700;border:1px solid var(--amber);border-radius:8px;padding:1px 6px;margin-left:4px">PRIORITIZE EXTRA HERE</span>':''}</div>
            <div style="font-size:var(--text-xs);color:var(--text3);margin-top:2px">Due ${l.dueDate||'—'}${dueSoon?' · due within 30 days':''} · ${l.interestRate||0}% interest</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:var(--text-sm);font-weight:800;color:var(--text1)">${fmtPHP(l.monthlyPayment||0)}</div>
            <div style="font-size:9px;color:var(--text3)">minimum</div>
          </div>
        </div>`;
      }).join('')}
    </div>

    ${leftoverAfterLoans>0&&highestInterestLoan?`<div style="background:rgba(0,255,136,.06);border:1px solid rgba(0,255,136,.25);border-radius:10px;padding:12px 14px;font-size:var(--text-xs);color:var(--text2)">
      <i class="ti ti-bulb" style="color:var(--green);margin-right:5px"></i>You have <strong style="color:var(--green)">${fmtPHP(leftoverAfterLoans)}</strong> left after minimums this month. Putting any of that toward <strong>${highestInterestLoan.lender}</strong> (your highest-interest loan at ${highestInterestLoan.interestRate}%) saves you the most over time — pay all other minimums on schedule first, then throw extra there.
    </div>`:''}
  `;
}
async function recordLoanPayment(id){
  const l=DB.loans.find(x=>x.id===id);if(!l)return;
  const accounts=[...new Set((DB.cashflow||[]).map(t=>t.account).filter(Boolean))];
  const acctList=accounts.length?accounts:['GCash','BPI','Maya','Cash'];
  const result=await jelixPrompt('Record Payment — '+l.lender,[
    {key:'amt',label:'Payment amount (₱)',type:'number',placeholder:'0.00'},
    {key:'acct',label:'Deduct from account ('+acctList.join(', ')+')',default:acctList[0]||'GCash'},
  ],'Record');
  if(!result)return;
  const amt=parseFloat(result[0]);
  if(!amt||isNaN(amt)||amt<=0){showToast('⚠ Enter a valid amount.');return;}
  const acct=result[1];
  if(!acct)return;
  // Update loan record
  l.amountPaid=(l.amountPaid||0)+amt;
  l.remaining=Math.max(0,(l.principal||0)-l.amountPaid);
  SB.update('loans',l.id,l,'loans');save('loans');
  // Log as Credit (expense) in cashflow — reduces account balance. Was
  // 'Payment' (a type that doesn't exist anywhere else in the app —
  // every other expense total, monthly report, and budget check only
  // ever looks for 'Credit'), which meant every loan payment logged this
  // way was silently invisible in almost all bookkeeping views. category
  // 'Loan' already carries the "this was a loan payment" distinction —
  // that's the right place for it, not a parallel type value that only
  // one code path understood.
  const entry={
    id:Date.now(),
    type:'Credit',
    desc:'Loan payment — '+l.lender,
    amount:amt,
    account:acct.trim()||'GCash',
    category:'Loan',
    date:localDateStr(new Date()),
    notes:'Auto-logged from loan tracker'
  };
  DB.cashflow.unshift(entry);save('cashflow');SB.upsert('cashflow',entry,'cashflow');
  renderLoansTab();renderLife();
  showToast(l.remaining<=0?'✔ '+l.lender+' fully paid!':'✓ ₱'+amt.toLocaleString('en-PH',{minimumFractionDigits:2})+' paid from '+acct+' · ₱'+l.remaining.toLocaleString('en-PH',{minimumFractionDigits:2})+' remaining');
  speak(l.remaining<=0?'Loan fully paid off. Debt eliminated.':'Payment recorded. '+fmtPHP(l.remaining)+' remaining.');
}
function editLoan(id){openLoanModal(id);}
function deleteLoan(id){
  const l=DB.loans.find(x=>x.id===id);if(!l)return;
  DB.loans=DB.loans.filter(x=>x.id!==id);SB.remove('loans',id,'loans');save('loans');renderLoansTab();
  showToast('Loan removed');
}

let cashSortOrder='desc'; // 'desc' = newest first, 'asc' = oldest first
function toggleCashSort(){
  cashSortOrder=cashSortOrder==='desc'?'asc':'desc';
  const btn=document.getElementById('cashSortBtn');
  if(btn){btn.innerHTML='<i class="ti ti-arrows-sort" style="font-size:12px;line-height:1;display:inline-block;margin-right:3px"></i>'+(cashSortOrder==='desc'?'Newest':'Oldest');}
  renderCashTable();
}

// Category is the real bookkeeping dimension (what a Credit/Debit was
// FOR — Loan, Subscription, Food...), separate from type (which direction
// the money moved). It was a plain-text column, making Loan payments and
// Housing bills look no different from a coffee purchase at a glance —
// color-code it like everything else that got this treatment this session.
const CASHFLOW_CATEGORY_STYLE={
  Income:{tone:'income',icon:'ti-trending-up'},
  Loan:{tone:'danger',icon:'ti-building-bank'},
  Payment:{tone:'danger',icon:'ti-receipt'},
  Subscription:{tone:'purple',icon:'ti-refresh'},
  Housing:{tone:'blue',icon:'ti-home'},
  Utilities:{tone:'blue',icon:'ti-bolt'},
  Food:{tone:'yellow',icon:'ti-tools-kitchen-2'},
  Transport:{tone:'yellow',icon:'ti-car'},
  Entertainment:{tone:'yellow',icon:'ti-device-tv'},
  Business:{tone:'income',icon:'ti-briefcase'},
  Health:{tone:'danger',icon:'ti-heart'},
  Family:{tone:'purple',icon:'ti-users'},
  Other:{tone:'neutral',icon:'ti-dots'}
};
function cashflowCategoryBadge(cat){
  if(!cat)return'<span style="color:var(--text3)">—</span>';
  const style=CASHFLOW_CATEGORY_STYLE[cat]||{tone:'neutral',icon:'ti-tag'};
  return`<span class="cashflow-category-badge tone-${style.tone}"><i class="ti ${style.icon}"></i>${cat}</span>`;
}
function renderCashTable(){
  const typeF    = document.getElementById('cf-filter-type')?.value    || 'all';
  const acctF    = document.getElementById('cf-filter-account')?.value || 'all';
  const catF     = document.getElementById('cf-filter-cat')?.value     || 'all';
  const monthF   = document.getElementById('cf-filter-month')?.value   || '';

  // Populate filter dropdowns
  const acctSel  = document.getElementById('cf-filter-account');
  const catSel   = document.getElementById('cf-filter-cat');
  if(acctSel && acctSel.options.length<=1){
    const accounts=getAccountNames();
    accounts.forEach(a=>{const o=document.createElement('option');o.value=a;o.textContent=a;acctSel.appendChild(o);});
  }
  if(catSel && catSel.options.length<=1){
    const cats=[...new Set((DB.cashflow||[]).map(t=>t.category).filter(Boolean))];
    cats.forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;catSel.appendChild(o);});
  }

  let txns=[...(DB.cashflow||[])].sort((a,b)=>{
    if(cashSortOrder==='asc') return a.date>b.date?1:a.date<b.date?-1:0;
    return b.date>a.date?1:b.date<a.date?-1:0;
  });
  if(typeF!=='all')  txns=txns.filter(t=>typeF==='Credit'?isLifeExpenseTransaction(t):t.type===typeF);
  if(acctF!=='all'){
    const accountKey=String(acctF).trim().toLocaleLowerCase();
    const matches=value=>String(value||'').trim().toLocaleLowerCase()===accountKey;
    txns=txns.filter(t=>matches(t.account)||matches(t._fromAccount)||matches(t._toAccount));
  }
  if(catF!=='all')   txns=txns.filter(t=>t.category===catF);
  if(monthF)         txns=txns.filter(t=>(t.date||'').startsWith(monthF));

  // ── MOBILE: render as stacked cards instead of wide table ──
  if(window.innerWidth<=430){
    const mlist=document.getElementById('mobileTransactionList');
    const tb=document.getElementById('cashTbody');
    const em=document.getElementById('cashEmpty');
    if(tb)tb.innerHTML='';
    if(!txns.length){
      if(em)em.style.display='';
      if(mlist)mlist.innerHTML='';
      return;
    }
    if(em)em.style.display='none';
    if(mlist){
      mlist.innerHTML=txns.map(t=>{
        const isDebit=t.type==='Debit';
        const isCredit=isLifeExpenseTransaction(t);
        const typeColor=isDebit?'var(--success-text)':isCredit?'var(--danger-text)':'var(--info-text)';
        const typeBg=isDebit?'var(--success-bg)':isCredit?'var(--danger-bg)':'var(--info-bg)';
        const amtDisplay=isDebit?'+\u20b1'+fmtPHP(t.amount).replace('\u20b1',''):isCredit?'-\u20b1'+fmtPHP(t.amount).replace('\u20b1',''):'\u21c4\u20b1'+fmtPHP(t.amount).replace('\u20b1','');
        return '<div style="display:flex;align-items:center;gap:10px;padding:11px 14px;border-bottom:1px solid var(--border);cursor:pointer;-webkit-tap-highlight-color:transparent" onclick="editCashEntry('+t.id+')">'+
          '<div style="width:8px;height:8px;border-radius:50%;background:'+typeColor+';flex-shrink:0"></div>'+
          '<div style="flex:1;min-width:0">'+
            '<div style="font-size:var(--text-sm);font-weight:600;color:var(--text1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(t.desc||'\u2014')+'</div>'+
            '<div style="font-size:var(--text-xs);color:var(--text3);margin-top:2px;display:flex;gap:8px">'+
              '<span>'+(t.date||'')+'</span>'+
              (t.account?'<span>'+t.account+'</span>':'')+
              (t.category?cashflowCategoryBadge(t.category):'')+
            '</div>'+
          '</div>'+
          '<div style="flex-shrink:0;text-align:right">'+
            '<div style="font-size:var(--text-sm);font-weight:800;color:'+typeColor+'">'+amtDisplay+'</div>'+
            '<div class="pill" style="color:'+typeColor+';background:'+typeBg+';font-size:var(--text-sm);display:inline-block;margin-top:2px">'+t.type.toUpperCase()+'</div>'+
          '</div>'+
        '</div>';
      }).join('');
    }
    return;
  }
  // ── END MOBILE ──

  const em=document.getElementById('cashEmpty');
  const tb=document.getElementById('cashTbody');
  if(!txns.length){
    if(tb) tb.innerHTML='';
    if(em) em.style.display='';
    return;
  }
  if(em) em.style.display='none';

  // Running balance per account
  const allSorted=[...(DB.cashflow||[])].sort((a,b)=>a.date>b.date?1:-1);
  const runBalMap={};
  const balanceKey=value=>String(value||'').trim().toLocaleLowerCase();
  allSorted.forEach(t=>{
    if(t.type==='Transfer'){
      const from=balanceKey(t._fromAccount||t.account);
      const to=balanceKey(t._toAccount);
      if(from){runBalMap[from]=(runBalMap[from]||0)-(Number(t.amount)||0);}
      if(to){runBalMap[to]=(runBalMap[to]||0)+(Number(t.amount)||0);}
      t._runBal=runBalMap[from]||0;
      return;
    }
    const acct=balanceKey(t.account);
    if(!runBalMap[acct])runBalMap[acct]=0;
    if(t.type==='Debit')runBalMap[acct]+=Number(t.amount)||0;
    if(isLifeExpenseTransaction(t))runBalMap[acct]-=Number(t.amount)||0;
    t._runBal=runBalMap[acct];
  });
  // Map id→runBal
  const runBalById={};
  allSorted.forEach(t=>{ runBalById[t.id]=t._runBal; });

  if(tb) tb.innerHTML=txns.map((t,i)=>{
    const isDebit=t.type==='Debit';
    const isCredit=isLifeExpenseTransaction(t);
    const isTransfer=t.type==='Transfer';
    const typeColor=isDebit?'var(--success-text)':isCredit?'var(--danger-text)':'var(--info-text)';
    const typeBg=isDebit?'var(--success-bg)':isCredit?'var(--danger-bg)':'var(--info-bg)';
    const amtDisplay=isDebit?'+'+fmtPHP(t.amount):isCredit?'-'+fmtPHP(t.amount):'⇄'+fmtPHP(t.amount);
    const amtColor=isDebit?'var(--green)':isCredit?'var(--red)':'var(--teal)';
    const bal=runBalById[t.id]??0;
    const balColor=bal>=0?'var(--green)':'var(--red)';
    const balDisplay=(bal>=0?'+':'')+fmtPHP(bal);
    const prevNeighbor=txns[i-1];
    const nextNeighbor=txns[i+1];
    return `<tr data-id="${t.id}" draggable="true" style="cursor:grab">
      <td style="font-size:var(--text-sm);color:var(--text3);white-space:nowrap"><i class="ti ti-grip-vertical drag-grip-desktop" style="font-size:var(--text-xs);color:var(--text3);margin-right:4px;vertical-align:middle"></i><span class="reorder-mobile-btns" style="display:none;gap:2px;margin-right:4px"><button onclick="event.stopPropagation();moveCashTxn(${t.id},${prevNeighbor?prevNeighbor.id:'null'})" ${!prevNeighbor?'disabled':''} style="background:transparent;border:none;color:var(--text3);cursor:pointer;padding:0"><i class="ti ti-chevron-up" style="font-size:11px;line-height:1;display:block"></i></button><button onclick="event.stopPropagation();moveCashTxn(${t.id},${nextNeighbor?nextNeighbor.id:'null'})" ${!nextNeighbor?'disabled':''} style="background:transparent;border:none;color:var(--text3);cursor:pointer;padding:0"><i class="ti ti-chevron-down" style="font-size:11px;line-height:1;display:block"></i></button></span>${t.date||'—'}</td>
      <td style="font-size:var(--text-sm);font-weight:500;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${t.desc||''}">${t.desc||'—'}${t.notes?'<div style="font-size:var(--text-xs);color:var(--text3);font-style:italic">'+t.notes+'</div>':''}</td>
      <td><span class="pill" style="color:${typeColor};background:${typeBg};font-size:var(--text-sm)">${t.type.toUpperCase()}</span></td>
      <td>${cashflowCategoryBadge(t.category)}${t.catNotes?'<div style="font-size:var(--text-xs);color:var(--text3)">'+t.catNotes+'</div>':''}</td>
      <td style="font-size:var(--text-sm);color:var(--text3)">${t.account||'—'}</td>
      <td style="font-size:var(--text-sm);font-weight:700;color:${amtColor};white-space:nowrap">${amtDisplay}</td>
      <td style="font-size:var(--text-sm);color:${balColor};white-space:nowrap">${balDisplay}</td>
      <td style="white-space:nowrap">
        <button class="btn" style="padding:2px 7px;background:rgba(0,255,242,.08);border:1px solid var(--border2);color:var(--teal)" onclick="editCash(${t.id})"><i class="ti ti-pencil" style="font-size:var(--text-xs);line-height:1;display:block"></i></button>
        <button class="btn btn-d" style="padding:2px 7px;margin-left:3px" onclick="deleteCash(${t.id})"><i class="ti ti-trash" style="font-size:var(--text-xs);line-height:1;display:block"></i></button>
      </td>
    </tr>`;
  }).join('');
  initCashDragSort();
}

// Mobile fallback for transaction reordering (mirrors the drag-and-drop date-swap logic)
function moveCashTxn(srcId,neighborId){
  if(neighborId===null||neighborId===undefined)return;
  const srcIdx=DB.cashflow.findIndex(t=>t.id===srcId);
  const targetIdx=DB.cashflow.findIndex(t=>t.id===neighborId);
  if(srcIdx<0||targetIdx<0)return;
  const srcTxn=DB.cashflow[srcIdx];
  const targetTxn=DB.cashflow[targetIdx];
  srcTxn.date=targetTxn.date;
  DB.cashflow.splice(srcIdx,1);
  const newTargetIdx=DB.cashflow.findIndex(t=>t.id===neighborId);
  DB.cashflow.splice(newTargetIdx,0,srcTxn);
  save('cashflow');
  SB.update('cashflow',srcTxn.id,srcTxn,'cashflow');
  renderCashTable();renderLife();
  showToast('✓ Reordered — date set to '+srcTxn.date);
}

// ── Drag-and-drop transaction reordering — recalculates date + running balance ──
function initCashDragSort(){
  const tbody=document.getElementById('cashTbody');
  if(!tbody)return;
  let dragSrcId=null;
  const rows=[...tbody.querySelectorAll('tr[data-id]')];
  rows.forEach(row=>{
    row.addEventListener('dragstart',function(e){
      dragSrcId=parseInt(this.dataset.id);
      this.style.opacity='.4';
      e.dataTransfer.effectAllowed='move';
    });
    row.addEventListener('dragend',function(){this.style.opacity='1';dragSrcId=null;});
    row.addEventListener('dragover',function(e){e.preventDefault();e.dataTransfer.dropEffect='move';this.style.background='rgba(128,255,250,.06)';});
    row.addEventListener('dragleave',function(){this.style.background='';});
    row.addEventListener('drop',function(e){
      e.preventDefault();this.style.background='';
      const targetId=parseInt(this.dataset.id);
      if(dragSrcId===null||dragSrcId===targetId)return;
      const srcIdx=DB.cashflow.findIndex(t=>t.id===dragSrcId);
      const targetIdx=DB.cashflow.findIndex(t=>t.id===targetId);
      if(srcIdx<0||targetIdx<0)return;
      const srcTxn=DB.cashflow[srcIdx];
      const targetTxn=DB.cashflow[targetIdx];
      // Reordering changes the transaction's date to match its new position, so the
      // running balance (which is always derived from date order) recalculates automatically.
      srcTxn.date=targetTxn.date;
      // Also move it in the underlying array so same-day ties resolve in the dropped order
      DB.cashflow.splice(srcIdx,1);
      const newTargetIdx=DB.cashflow.findIndex(t=>t.id===targetId);
      DB.cashflow.splice(newTargetIdx,0,srcTxn);
      save('cashflow');
      SB.update('cashflow',srcTxn.id,srcTxn,'cashflow');
      addHistory('edit','Reordered transaction: '+srcTxn.desc+' → '+srcTxn.date,{...srcTxn,_dbKey:'cashflow'});
      renderCashTable();renderLife();
      showToast('✓ Reordered — date set to '+srcTxn.date);
    });
  });
}

function renderCashCharts(){
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mIn=new Array(12).fill(0), mOut=new Array(12).fill(0);
  (DB.cashflow||[]).forEach(t=>{
    const transactionDate=new Date(t.date);
    const m=transactionDate.getMonth();
    if(isNaN(m)||transactionDate.getFullYear()!==overviewYear) return;
    if(t.type==='Debit')  mIn[m]+=(t.amount||0);
    if(isLifeExpenseTransaction(t)) mOut[m]+=(t.amount||0);
  });

  // Monthly flow bar chart
  const ctx1=document.getElementById('cashflowChart');
  if(ctx1){
    if(cfCharts.flow) cfCharts.flow.destroy();
    cfCharts.flow=new Chart(ctx1,{
    type:'bar',
    data:{labels:months,datasets:[
      {label:'Income (Debit)',data:mIn,backgroundColor:'rgba(34,197,94,.5)',borderColor:'rgba(34,197,94,.9)',borderWidth:1},
      {label:'Expense (Credit)',data:mOut,backgroundColor:'rgba(239,68,68,.4)',borderColor:'rgba(239,68,68,.9)',borderWidth:1}
    ]},
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{
        legend:{labels:{color:'#7ab8c8',font:{size:10},padding:10}},
        tooltip:{callbacks:{label:function(ctx){return ' ₱'+ctx.raw.toLocaleString('en-PH',{minimumFractionDigits:2});}}}
      },
      scales:{
        x:{ticks:{color:'#3a6878',font:{size:9}},grid:{color:'rgba(255,255,255,.04)'}},
        y:{ticks:{color:'#3a6878',font:{size:9},callback:function(v){return '₱'+Number(v).toLocaleString('en-PH');}},grid:{color:'rgba(255,255,255,.04)'}}
      }
    }
  });
  }

  // Category doughnut — all expense transactions
  const cats={};
  const selectedMonth=`${overviewYear}-${String(overviewMonth+1).padStart(2,'0')}`;
  (DB.cashflow||[]).filter(t=>isLifeExpenseTransaction(t)&&(t.date||'').startsWith(selectedMonth)).forEach(t=>{cats[t.category]=(cats[t.category]||0)+(t.amount||0);});
  const ctx2=document.getElementById('catChart');
  const catEmpty=document.getElementById('catChartEmpty');
  const hasCategoryData=Object.keys(cats).length>0;
  if(ctx2){
    if(cfCharts.cat) cfCharts.cat.destroy();
    cfCharts.cat=null;
    ctx2.hidden=!hasCategoryData;
    if(catEmpty) catEmpty.hidden=hasCategoryData;
    if(!hasCategoryData) return renderCashTrendChart();
    const colors=['rgba(239,68,68,.7)','rgba(255,140,0,.7)','rgba(168,85,247,.7)','rgba(34,197,94,.7)','rgba(245,158,11,.7)','rgba(0,212,200,.7)','rgba(255,40,160,.7)','rgba(59,130,246,.7)'];
    cfCharts.cat=new Chart(ctx2,{
    type:'doughnut',
    data:{labels:Object.keys(cats),datasets:[{data:Object.values(cats),backgroundColor:colors.slice(0,Object.keys(cats).length),borderColor:'#040d1a',borderWidth:2}]},
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{
        legend:{position:'right',labels:{color:'#7ab8c8',font:{size:10},boxWidth:10,padding:8}},
        tooltip:{callbacks:{label:function(ctx){return ctx.label+': ₱'+ctx.raw.toLocaleString('en-PH',{minimumFractionDigits:2});}}}
      }
    }
  });
  }

  renderCashTrendChart();
}

function renderCashTrendChart(){
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  // 6-month trend line
  const now=new Date(); const curMonth=now.getMonth(); const curYear=now.getFullYear();
  const trendLabels=[],trendIn=[],trendOut=[];
  for(let i=5;i>=0;i--){
    const d=new Date(curYear,curMonth-i,1);
    trendLabels.push(months[d.getMonth()]+' '+d.getFullYear().toString().slice(2));
    const ym=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    const inc=(DB.cashflow||[]).filter(t=>t.type==='Debit'&&(t.date||'').startsWith(ym)).reduce((s,t)=>s+t.amount,0);
    const exp=(DB.cashflow||[]).filter(t=>isLifeExpenseTransaction(t)&&(t.date||'').startsWith(ym)).reduce((s,t)=>s+t.amount,0);
    trendIn.push(inc); trendOut.push(exp);
  }
  const ctx3=document.getElementById('trendChart');
  if(ctx3){
    if(cfCharts.trend) cfCharts.trend.destroy();
    cfCharts.trend=new Chart(ctx3,{
    type:'line',
    data:{labels:trendLabels,datasets:[
      {label:'Income',data:trendIn,borderColor:'rgba(34,197,94,.8)',backgroundColor:'rgba(34,197,94,.08)',tension:.4,fill:true,pointBackgroundColor:'rgba(34,197,94,1)',pointRadius:4,pointHoverRadius:6},
      {label:'Expenses',data:trendOut,borderColor:'rgba(239,68,68,.8)',backgroundColor:'rgba(239,68,68,.06)',tension:.4,fill:true,pointBackgroundColor:'rgba(239,68,68,1)',pointRadius:4,pointHoverRadius:6}
    ]},
    options:{
      responsive:true,
      maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{labels:{color:'#7ab8c8',font:{size:10},padding:10}},
        tooltip:{callbacks:{label:function(ctx){return ' ₱'+ctx.raw.toLocaleString('en-PH',{minimumFractionDigits:2});}}}
      },
      scales:{
        x:{ticks:{color:'#3a6878',font:{size:9}},grid:{color:'rgba(255,255,255,.04)'}},
        y:{ticks:{color:'#3a6878',font:{size:9},callback:function(v){return '₱'+Number(v).toLocaleString('en-PH');}},grid:{color:'rgba(255,255,255,.04)'}}
      }
    }
  });
  }
}
// ── 30/60/90-day cash flow forecast ──────────────────────────────────────
function renderCashForecast(){
  const txn=DB.cashflow||[];
  if(!txn.length)return;
  // Group by month to get true monthly averages (not just /3 of 90 days)
  const monthMap={};
  txn.forEach(t=>{
    if(!t.date)return;
    const mo=t.date.substring(0,7); // YYYY-MM
    if(!monthMap[mo])monthMap[mo]={inc:0,exp:0};
    if(t.type==='Debit') monthMap[mo].inc+=(t.amount||0);
    if(isLifeExpenseTransaction(t)) monthMap[mo].exp+=(t.amount||0);
  });
  const months=Object.keys(monthMap).sort();
  if(!months.length)return;
  // Use last 3 months for average (or all if fewer)
  const recent=months.slice(-3);
  const avgInc=recent.reduce((s,m)=>s+monthMap[m].inc,0)/recent.length;
  const avgExp=recent.reduce((s,m)=>s+monthMap[m].exp,0)/recent.length;
  const runrate=avgInc-avgExp;
  // Current month partial balance (what's already in this month)
  const thisMonth=new Date().toISOString().substring(0,7);
  const thisInc=(monthMap[thisMonth]||{inc:0}).inc;
  const thisExp=(monthMap[thisMonth]||{exp:0}).exp;
  const partialNet=thisInc-thisExp;
  // Days remaining in current month
  const now=new Date();
  const daysInMonth=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
  const daysPassed=now.getDate();
  const daysLeft=daysInMonth-daysPassed;
  const dailyRate=runrate/30;
  // Projections: current month remainder + future months
  const p30=partialNet+(dailyRate*daysLeft);
  const p60=p30+runrate;
  const p90=p60+runrate;
  const fmt=v=>(v>=0?'+':'')+fmtPHP(Math.abs(v));
  const color=v=>v>=0?'var(--green)':'var(--red)';
  const set=(id,v)=>{const el=document.getElementById(id);if(el){el.textContent=fmt(v);el.style.color=color(v);}};
  set('cf-f30',p30);set('cf-f60',p60);set('cf-f90',p90);
  const lbl=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v>=0?'Projected surplus':'Projected deficit';};
  lbl('cf-f30-lbl',p30);lbl('cf-f60-lbl',p60);lbl('cf-f90-lbl',p90);
  const ai=document.getElementById('cf-avg-income');if(ai)ai.textContent=fmtPHP(avgInc);
  const ae=document.getElementById('cf-avg-exp');if(ae)ae.textContent=fmtPHP(avgExp);
  const rr=document.getElementById('cf-runrate');if(rr){rr.textContent=(runrate>=0?'+':'')+fmtPHP(Math.abs(runrate))+'/mo';rr.style.color=color(runrate);}
  // Update forecast grid border colors
  const f30c=document.querySelector('#cf-forecast-grid>div:nth-child(1)');
  const f60c=document.querySelector('#cf-forecast-grid>div:nth-child(2)');
  const f90c=document.querySelector('#cf-forecast-grid>div:nth-child(3)');
  if(f30c)f30c.style.borderTopColor=color(p30);
  if(f60c)f60c.style.borderTopColor=color(p60);
  if(f90c)f90c.style.borderTopColor=color(p90);
}

// ── Budget tab ────────────────────────────────────────────────────────────
function renderBudgetTab(){
  const budgets = getBudgets();
  const now = new Date();
  const ym = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');

  // Compute this month's spending per category
  const monthSpend={};
  (DB.cashflow||[]).filter(t=>isLifeExpenseTransaction(t)&&(t.date||'').startsWith(ym)).forEach(t=>{
    monthSpend[t.category]=(monthSpend[t.category]||0)+(t.amount||0);
  });

  const totalBudget=Object.values(budgets).reduce((s,b)=>s+(b.limit||0),0);
  const totalSpent=Object.keys(budgets).reduce((s,cat)=>s+(monthSpend[cat]||0),0);
  const overBudget=Object.keys(budgets).filter(cat=>(monthSpend[cat]||0)>(budgets[cat].limit||0)).length;

  // Summary cards
  const sumEl=document.getElementById('cf-budget-summary');
  if(sumEl) sumEl.innerHTML=`
    <div class="hc"><div class="cl">Total Budget</div><div class="cv" style="color:var(--teal)">${fmtPHP(totalBudget)}</div></div>
    <div class="hc oc"><div class="cl">Spent This Month</div><div class="cv oc">${fmtPHP(totalSpent)}</div></div>
    <div class="hc" style="border-color:${overBudget>0?'rgba(239,68,68,.4)':'rgba(0,255,136,.3)'}"><div class="cl">Over Budget</div><div class="cv" style="color:${overBudget>0?'var(--red)':'var(--green)'}">${overBudget} categor${overBudget===1?'y':'ies'}</div></div>
  `;

  const listEl=document.getElementById('cf-budget-list');
  if(!listEl) return;

  if(!Object.keys(budgets).length){
    listEl.innerHTML='<div style="text-align:center;padding:30px;color:var(--text3);font-size:var(--text-sm)">No budgets set yet. Click <strong style="color:var(--teal)">Set Budget</strong> to add a category limit.</div>';
    return;
  }

  listEl.innerHTML=Object.entries(budgets).map(([cat,b])=>{
    const spent=monthSpend[cat]||0;
    const limit=b.limit||0;
    const pct=limit>0?Math.min((spent/limit)*100,100):0;
    const alertPct=b.alert||80;
    const isOver=spent>limit&&limit>0;
    const isWarn=pct>=alertPct&&!isOver;
    const barColor=isOver?'var(--red)':isWarn?'var(--amber)':'var(--green)';
    const remaining=limit-spent;
    return `
      <div style="background:var(--navy2);border:1px solid ${isOver?'rgba(239,68,68,.4)':'var(--border)'};border-radius:12px;padding:14px;margin-bottom:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="display:flex;align-items:center;gap:8px">
            <div style="font-size:var(--text-sm);font-weight:700;color:var(--text1)">${cat}</div>
            ${isOver?'<span style="font-size:var(--text-xs);font-weight:700;color:var(--red);border:1px solid var(--red);border-radius:6px;padding:1px 5px">OVER BUDGET</span>':isWarn?'<span style="font-size:var(--text-xs);font-weight:700;color:var(--amber);border:1px solid var(--amber);border-radius:6px;padding:1px 5px">⚠ NEAR LIMIT</span>':''}
          </div>
          <div style="display:flex;gap:5px;align-items:center">
            <span style="font-size:var(--text-xs);color:var(--text3)">${fmtPHP(spent)} / ${fmtPHP(limit)}</span>
            <button onclick="openBudgetModal('${cat}')" style="background:transparent;border:1px solid var(--border2);border-radius:8px;color:var(--text3);font-size:var(--text-xs);padding:2px 7px;cursor:pointer">Edit</button>
            <button onclick="deleteBudget('${cat}')" style="background:transparent;border:1px solid rgba(239,68,68,.3);border-radius:8px;color:var(--red);font-size:var(--text-xs);padding:2px 7px;cursor:pointer">×</button>
          </div>
        </div>
        <div style="background:var(--navy3);border-radius:8px;height:8px;overflow:hidden;margin-bottom:6px">
          <div style="width:${pct.toFixed(1)}%;height:100%;background:${barColor};border-radius:8px;transition:width .4s"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:var(--text-xs);color:var(--text3)">
          <span>${pct.toFixed(0)}% used · Alert at ${alertPct}%</span>
          <span style="color:${remaining>=0?'var(--green)':'var(--red)'}">${remaining>=0?fmtPHP(remaining)+' remaining':fmtPHP(Math.abs(remaining))+' over'}</span>
        </div>
      </div>`;
  }).join('');
}

function openBudgetModal(cat){
  const budgets=getBudgets();
  const existing=cat?budgets[cat]:null;
  document.getElementById('budgetModalTitle').textContent=cat?'EDIT BUDGET — '+cat.toUpperCase():'SET BUDGET LIMIT';
  if(cat){const s=document.getElementById('bgt-cat');if(s){s.value=cat;s.disabled=!!cat;}}
  else{const s=document.getElementById('bgt-cat');if(s)s.disabled=false;}
  document.getElementById('bgt-limit').value=existing?existing.limit:'';
  document.getElementById('bgt-alert').value=existing?existing.alert:80;
  openModal('budgetModal');
}

function saveBudget(){
  const cat=document.getElementById('bgt-cat').value;
  const limit=parseFloat(document.getElementById('bgt-limit').value)||0;
  const alert=parseInt(document.getElementById('bgt-alert').value)||80;
  if(!limit){showToast('⚠ Enter a budget limit.');return;}
  const budgets=getBudgets();
  budgets[cat]={limit,alert};
  saveBudgets(budgets);
  closeModal('budgetModal');
  renderBudgetTab();
  showToast('✓ Budget set: '+cat+' — '+fmtPHP(limit)+'/mo');
}

function deleteBudget(cat){
  const budgets=getBudgets();
  delete budgets[cat];
  saveBudgets(budgets);
  renderBudgetTab();
  showToast('Budget removed: '+cat);
}

// ── Accounts tab ──────────────────────────────────────────────────────────
function renderAccountsTab(){
  const el=document.getElementById('cf-accounts-grid');
  if(!el) return;
  const accountNames=getAccountNames();
  const addTile=`<button class="hc life-account-add" onclick="promptNewAccount(()=>{renderLife();})"><i class="ti ti-plus"></i><span>Add account</span><small>Bank, wallet, cash, or savings</small></button>`;
  if(!accountNames.length){
    el.innerHTML=addTile;
    return;
  }
  el.innerHTML=accountNames.map(acct=>{
    const accountKey=String(acct).trim().toLocaleLowerCase();
    const matches=value=>String(value||'').trim().toLocaleLowerCase()===accountKey;
    const txns=(DB.cashflow||[]).filter(t=>matches(t.account)||matches(t._fromAccount)||matches(t._toAccount));
    const income=txns.filter(t=>t.type==='Debit'&&matches(t.account)).reduce((s,t)=>s+(Number(t.amount)||0),0);
    const expense=txns.filter(t=>isLifeExpenseTransaction(t)&&matches(t.account)).reduce((s,t)=>s+(Number(t.amount)||0),0);
    const bal=getAccountBalance(acct);
    const lastTxn=txns.sort((a,b)=>b.date>a.date?1:-1)[0];
    const acctObj=(DB.accounts||[]).find(a=>matches(a.name));
    return `
      <article class="hc life-account-card">
        <div class="life-account-head">
          <div><small>Account</small><strong>${acct}</strong></div>
          <div class="life-account-meta">
            <span>${txns.length} transaction${txns.length!==1?'s':''}</span>
            ${acctObj?`<button onclick="deleteAccount(${acctObj.id})" title="Delete account"><i class="ti ti-trash"></i></button>`:''}
          </div>
        </div>
        <div class="life-account-balance ${bal>=0?'positive':'negative'}">${bal>=0?'+':'−'}${fmtPHP(Math.abs(bal))}</div>
        <div class="life-account-stats">
          <div class="life-account-stat is-income">
            <small>Money in</small>
            <strong>+${fmtPHP(income)}</strong>
          </div>
          <div class="life-account-stat is-expense">
            <small>Money out</small>
            <strong>−${fmtPHP(expense)}</strong>
          </div>
        </div>
        <div class="life-account-last">${lastTxn?`<span>Latest</span><b>${lastTxn.desc||'Transaction'}</b><time>${lastTxn.date||''}</time>`:'<span>No activity yet</span>'}</div>
        <div class="life-account-actions">
          <button onclick="openCashModal('Debit');setTimeout(()=>{populateAccountSelect('ca-account','${acct}')},80)" class="btn btn-g"><i class="ti ti-plus"></i>Money in</button>
          <button onclick="openTransferModal('${acct}')" class="btn btn-g"><i class="ti ti-arrows-exchange"></i>Transfer</button>
        </div>
      </article>`;
  }).join('')+addTile;
}

// ── Transfer functions ─────────────────────────────────────────────────────
function openTransferModal(fromAcct){
  document.getElementById('tr-date').value=localDateStr(new Date());
  document.getElementById('tr-amount').value='';
  document.getElementById('tr-notes').value='';
  populateAccountSelect('tr-from',fromAcct||undefined);
  populateAccountSelect('tr-to',undefined);
  ['tr-from','tr-to'].forEach(id=>{
    const sel=document.getElementById(id);
    if(sel&&!sel._acctNewBound){
      sel._acctNewBound=true;
      sel.addEventListener('change',()=>{
        if(sel.value==='__new__'){
          promptNewAccount(a=>{populateAccountSelect(id,a.name);});
          if(sel.value==='__new__')populateAccountSelect(id,undefined); // cancelled — revert to first account
        }
      });
    }
  });
  openModal('transferModal');
  setTimeout(()=>document.getElementById('tr-amount').focus(),80);
}

function saveTransfer(){
  const from=document.getElementById('tr-from').value;
  const to=document.getElementById('tr-to').value;
  const amount=parseFloat(document.getElementById('tr-amount').value)||0;
  const date=document.getElementById('tr-date').value;
  const notes=document.getElementById('tr-notes').value.trim();

  if(from===to){showToast('⚠ Source and destination cannot be the same.');return;}
  if(!amount||amount<=0){showToast('⚠ Enter a valid amount.');return;}
  if(!date){showToast('⚠ Select a date.');return;}

  // Single entry — transfers are one record with _fromAccount and _toAccount
  // The running balance calc already handles from/to correctly
  const id=Date.now();
  const entry={id,type:'Transfer',desc:'Transfer: '+from+' → '+to,amount,account:from,category:'Transfer',date,notes,_fromAccount:from,_toAccount:to};

  DB.cashflow.unshift(entry);
  save('cashflow');
  SB.upsert('cashflow',entry,'cashflow');

  closeModal('transferModal');
  addHistory('add','Transfer: '+from+' → '+to+' ₱'+amount,{_dbKey:'cashflow'});
  showToast('✓ Transfer complete: '+from+' → '+to+' '+fmtPHP(amount));
  renderLife();
}

// ── setCFTab — handle new tabs ─────────────────────────────────────────────

// CALENDAR
let selectedCalDate='';
// ════════════════════════════════════════════════════════════════
// JELIX CALENDAR ENGINE — GCal-parity functional module
// ════════════════════════════════════════════════════════════════

// ── World config ─────────────────────────────────────────────────
const CAL_WORLDS = [
  {id:'cs',  label:'Retired workspace',    color:'var(--red)',    hex:'#ff2244'},
  {id:'ven', label:'Job Collectives',      color:'var(--orange)', hex:'#ff8c00'},
  {id:'bld', label:'Code Collectives',     color:'var(--green)',  hex:'#00ff88'},
  {id:'sid', label:'Creative Collectives', color:'var(--amber)',  hex:'#ffaa00'},
  {id:'fth', label:'Faith',     color:'var(--purple)', hex:'#bf5fff'},
  {id:'lif', label:'Personal',  color:'#3b82f6',       hex:'#3b82f6'},
];
// Legacy type map (backward compat with old oc/pu/pt etc)
const CAL_TYPE_MAP = {pt:'ih',oc:'cs',po:'ven',pg:'bld',pam:'sid',pu:'fth',pgr:'lif',task:'task'};

// ── Domain color sync ───────────────────────────────────────────────────
// The sidebar (renderSideNav → getBoards) already reads its colors straight
// from DB.worlds, and the "Edit Domain" pencil icon already writes hex
// colors into DB.worlds — that's the one real, editable source of truth.
// The calendar used to keep its own separate hardcoded palette above, which
// is why editing a domain's color there never showed up on the calendar.
// This maps the calendar's short internal ids to the real DB.worlds ids and
// mirrors any custom hex onto CAL_WORLDS so every calendar view (event
// blocks, legend, pills, dots, agenda) reflects the same color everywhere.
const CAL_WORLDS_DEFAULTS=CAL_WORLDS.map(w=>({id:w.id,color:w.color,hex:w.hex}));
// Overlap layout — two events at the same time used to render fully
// stacked on top of each other (identical left/right), making both
// unreadable. Standard calendar-style collision layout: cluster events
// whose time ranges transitively overlap, greedily assign each a column
// within its cluster, then every event in a cluster gets 1/N width.
function _layoutEventColumns(events){
  const t2m=t=>{const[h,m]=t.split(':').map(Number);return h*60+m;};
  const items=events.map(e=>{
    const s=t2m(e.time);
    let en=e.endTime?t2m(e.endTime):s+60;
    if(en<=s)en=s+60; // overnight/zero-length guard
    return{e,s,en};
  }).sort((a,b)=>a.s-b.s||a.en-b.en);
  const layout=new Map();
  let cluster=[],clusterEnd=-Infinity;
  const flushCluster=()=>{
    if(!cluster.length)return;
    const columns=[]; // columns[i] = end time of the last event placed in that column
    cluster.forEach(item=>{
      let placed=false;
      for(let c=0;c<columns.length;c++){
        if(columns[c]<=item.s){columns[c]=item.en;layout.set(item.e,{col:c,cols:0});placed=true;break;}
      }
      if(!placed){columns.push(item.en);layout.set(item.e,{col:columns.length-1,cols:0});}
    });
    cluster.forEach(item=>{layout.get(item.e).cols=columns.length;});
    cluster=[];
  };
  items.forEach(item=>{
    if(item.s>=clusterEnd)flushCluster();
    cluster.push(item);
    clusterEnd=Math.max(clusterEnd,item.en);
  });
  flushCluster();
  return layout;
}
function _colStyle(layout,e){
  const pos=layout.get(e);
  if(!pos||pos.cols<=1)return'left:3px;right:3px;';
  return`left:calc(${(pos.col/pos.cols*100).toFixed(3)}% + 2px);width:calc(${(100/pos.cols).toFixed(3)}% - 4px);right:auto;`;
}
const CAL_TO_DOMAIN_ID={ih:'work-ih',cs:'work-cs',ven:'venture',bld:'build',sid:'sides',fth:'faith',lif:'life'};
// Reverse of the above (real DB.worlds slug -> calendar short code) — was
// missing entirely, which is a real, separate bug from the missing 'cs'
// forward mapping: normaliseType() had no way to resolve a stored type of
// 'life' or 'venture' (the full slug — what bill-due reminders, Google
// Calendar sync, and task-due-date auto-entries all actually write) back
// to the short code ('lif'/'ven') that calContextFilter and calWorldById
// actually key on. Any calendar entry written with a full-slug type was
// silently invisible, filtered out with no error — not a rare edge case,
// three different features write full-slug types today.
const DOMAIN_ID_TO_CAL=Object.fromEntries(Object.entries(CAL_TO_DOMAIN_ID).map(([k,v])=>[v,k]));
function syncCalWorldColors(){
  const rootStyle=getComputedStyle(document.documentElement);
  CAL_WORLDS.forEach((w,i)=>{
    const domainId=CAL_TO_DOMAIN_ID[w.id];
    const domain=domainId&&(DB.worlds||[]).find(x=>x.id===domainId);
    let resolvedHex=null;
    if(domain&&domain.color){
      if(/^#/.test(domain.color)){
        // User picked a literal custom color via Edit Domain
        resolvedHex=domain.color;
      }else{
        // Default/unedited state — color is a CSS var() reference (e.g.
        // 'var(--w-faith)'). Resolve it to its actual current value so the
        // calendar matches even domains nobody has manually recolored.
        const varName=domain.cssVar||(domain.color.match(/var\((--[\w-]+)\)/)||[])[1];
        if(varName){
          const v=rootStyle.getPropertyValue(varName).trim();
          if(v)resolvedHex=v;
        }
      }
    }
    if(resolvedHex){
      w.color=resolvedHex;w.hex=resolvedHex;
    }else{
      const def=CAL_WORLDS_DEFAULTS[i];
      w.color=def.color;w.hex=def.hex;
    }
  });
}
syncCalWorldColors();

function calWorldById(id){
  const builtin=CAL_WORLDS.find(w=>w.id===id);
  if(builtin)return builtin;
  if(id==='ih')return{id:'ih',label:'Retired domain',color:'var(--text3)',hex:'#8A857C'};
  const custom=(DB.worlds||[]).find(w=>w.id===id);
  if(custom){
    const isHex=custom.color&&/^#/.test(custom.color);
    return{id:custom.id,label:custom.label,color:isHex?custom.color:'var('+(custom.cssVar||'--teal')+')',hex:isHex?custom.color:'#80fffa'};
  }
  return CAL_WORLDS[0];
}
// Per-event color override (Phase B) — an occurrence's color resolves as
// exception.color ?? event.color ?? domainColor(event.type), most specific
// wins. Wraps calWorldById's return so every existing render call site
// that does `const w=_evResolveColor(calWorldById(normaliseType(e.type)),e)` picks this up
// for free by just passing e through, no other changes needed there.
function _evResolveColor(w,e){
  return (e&&e.color)?{...w,hex:e.color,color:e.color}:w;
}
function calendarTextColor(hex){
  const value=String(hex||'').replace('#','');
  if(!/^[0-9a-f]{6}$/i.test(value))return '#FFFFFF';
  const channels=[0,2,4].map(index=>parseInt(value.slice(index,index+2),16)/255);
  const luminance=channels.map(channel=>channel<=.03928?channel/12.92:Math.pow((channel+.055)/1.055,2.4)).reduce((total,channel,index)=>total+channel*[.2126,.7152,.0722][index],0);
  return luminance>.42?'#172006':'#FFFFFF';
}
function calendarBlockStyle(hex,continuation=false){
  return `background:var(--navy2);border:1px solid var(--border);border-left:3px ${continuation?'dashed':'solid'} ${hex};color:var(--text1)`;
}
function normaliseType(t){
  if(!t)return'lif';
  if(CAL_TYPE_MAP[t])return CAL_TYPE_MAP[t]; // old legacy 3-letter codes (oc/pu/pt etc)
  const lower=String(t).toLowerCase();
  if(CAL_WORLDS.some(w=>w.id===lower))return lower; // already a valid short code
  if(DOMAIN_ID_TO_CAL[lower])return DOMAIN_ID_TO_CAL[lower]; // full slug -> short code
  if((DB.worlds||[]).some(w=>w.id===lower))return lower; // custom domain beyond the original 7 — no short code exists, its own id passes straight through
  return'lif';
}
function evColor(e){
  if(e._isTask)return 'var(--amber)';
  const w=_evResolveColor(calWorldById(normaliseType(e.type)),e);
  return w.color;
}
function evClass(e){
  if(e._isTask)return 'cev cev-task';
  return 'cev cev-'+(normaliseType(e.type));
}

// ── State ──────────────────────────────────────────────────────────
let calView=(typeof getPref==='function'&&getPref('pref-cal-view'))||'agenda';
let calYear=new Date().getFullYear(),calMonth=new Date().getMonth();
let calSelectedDate=localDateStr(new Date());
// Was CAL_WORLDS ids only (the 7 built-ins) — any custom domain added since
// resolves via normaliseType() to its own raw id (see above), which this
// Set needs to already contain or its events stay filtered out even though
// normaliseType now resolves them correctly. All on by default either way.
let calContextFilter=new Set((DB.worlds||[]).map(w=>DOMAIN_ID_TO_CAL[w.id]||w.id));
let calEditingId=null;
// Which occurrence's date was actually clicked, when editing a recurring
// event via a specific expanded occurrence (not the series template
// directly). Drives the "Apply to: this / this+following / all" choice.
let calEditingOccurrenceDate=null;

// ── Utility: expand recurring events for a date range ─────────────
// ── Local date string helper ─────────────────────────────────────────────
// CRITICAL: .toISOString() always converts to UTC. Manila is UTC+8, so any
// local-midnight Date, when run through .toISOString().split('T')[0], shifts
// backward by a full day (e.g. Saturday becomes Friday). This app is built
// entirely around Asia/Manila local time, so date strings must always be
// derived from LOCAL date components, never toISOString().
// Converts a 24-hour "HH:MM" string (as stored by <input type="time">) to
// 12-hour display format "h:MM AM/PM" — used everywhere a stored time gets
// shown to the user, since raw input values are always 24-hour internally.
function to12h(t){
  if(!t)return t;
  const parts=t.split(':');
  let h=parseInt(parts[0],10);
  const m=parts[1]||'00';
  const ampm=h>=12?'PM':'AM';
  h=h%12;if(h===0)h=12;
  return h+':'+m+' '+ampm;
}
// ── Recurring tasks ──────────────────────────────────────────────────────
// Deliberately computes the next date from the CURRENT due date, not from
// whenever you actually complete it — matches Apple Reminders/Things'
// default ("strict" recurrence). Completing a weekly task 3 days late
// still schedules the next one exactly 7 days after the original due
// date, not 7 days after you got to it, so a slip doesn't compound.
function _computeNextRecurDate(dueDateStr,recur){
  if(!dueDateStr)return null;
  const d=new Date(dueDateStr+'T00:00:00');
  if(recur==='daily')d.setDate(d.getDate()+1);
  else if(recur==='weekly')d.setDate(d.getDate()+7);
  else if(recur==='biweekly')d.setDate(d.getDate()+14);
  else if(recur==='monthly')d.setMonth(d.getMonth()+1);
  else if(recur==='yearly')d.setFullYear(d.getFullYear()+1);
  else return null;
  return localDateStr(d);
}
function _maybeGenerateNextTaskOccurrence(task){
  if(!task||!task.recur||task.recur==='none'||!task.due)return;
  const nextDue=_computeNextRecurDate(task.due,task.recur);
  if(!nextDue)return;
  // Avoid double-generating if this fires more than once for the same
  // completion (e.g. a conflict-resolution re-save) — check for an
  // already-existing next occurrence from this parent at this due date.
  if(DB.tasks.some(t=>t.recurParentId===task.id&&t.due===nextDue))return;
  const next={
    id:Date.now(),title:task.title,world:task.world,priority:task.priority,status:'Todo',
    due:nextDue,platform:task.platform||'',client:task.client||'',notes:task.notes||'',
    driveLink:task.driveLink||'',startTime:task.startTime||'',endTime:task.endTime||'',
    recur:task.recur,groupId:null,
    subitems:(task.subitems||[]).map(s=>({...s,status:'Todo'})),
    timelineS:'',timelineE:nextDue,numValue:null,connBoard:null,connItemId:null,
    sourceNoteId:null,sourceBlockId:null,sourceEventId:null,recurParentId:task.id,
  };
  DB.tasks.unshift(next);
  SB.upsert('tasks',next,'tasks');
  addHistory('add','Recurring task: '+next.title+' (due '+nextDue+')',{...next,_dbKey:'tasks'});
  try{reRenderAll();}catch(e){}
}
const RECUR_DOW_MAP={SU:0,MO:1,TU:2,WE:3,TH:4,FR:5,SA:6};
// Applies a per-occurrence override/cancellation from e.recurExceptions
// (keyed by the occurrence's expanded date) on top of the virtual
// occurrence expandRecurring() would otherwise return unchanged. Returns
// null to mean "skip this occurrence" — the user cancelled just this one.
function _applyRecurException(e,dateStr){
  const ex=(e.recurExceptions||{})[dateStr];
  const occ={...e,_expandedDate:dateStr,_recurring:true};
  if(!ex)return occ;
  if(ex.cancelled)return null;
  return {...occ,...ex,_hasException:true};
}
function expandRecurring(events,fromDate,toDate){
  const from=new Date(fromDate);from.setHours(0,0,0,0);
  const to=new Date(toDate);to.setHours(23,59,59,999);
  const out=[];
  events.forEach(e=>{
    const base=new Date(e.date+'T00:00:00');
    if(!e.recur||e.recur==='none'){
      if(base>=from&&base<=to)out.push(e);
      return;
    }
    const until=e.recurEnd?new Date(e.recurEnd+'T23:59:59'):null;
    const hardStop=until&&until<to?until:to;
    const maxCount=e.recurCount&&e.recurCount>0?e.recurCount:Infinity;
    let occCount=0;

    const customDays=Array.isArray(e.recurDays)&&e.recurDays.length?e.recurDays:null;
    const isDowFiltered=e.recur==='weekdays'||e.recur==='weekends'
      ||(e.recur==='custom'&&e.recurUnit==='week'&&customDays)
      ||((e.recur==='weekly'||e.recur==='biweekly')&&customDays);

    if(isDowFiltered){
      // Day-of-week filtered recurrence: scan day-by-day (robust for weekdays/weekends/
      // and any weekly-cadence recurrence — weekly, biweekly, or custom — with specific days chosen)
      let allowedDOW;
      if(e.recur==='weekdays')allowedDOW=[1,2,3,4,5];
      else if(e.recur==='weekends')allowedDOW=[0,6];
      else allowedDOW=customDays.map(d=>RECUR_DOW_MAP[d]).filter(n=>n!==undefined);
      const intervalWeeks=e.recur==='custom'?(parseInt(e.recurN)||1):e.recur==='biweekly'?2:1;
      const baseWeekStart=new Date(base);baseWeekStart.setDate(base.getDate()-base.getDay());
      let cur=new Date(base);
      let safety=0;
      while(cur<=hardStop&&occCount<maxCount&&safety<1500){
        safety++;
        if(allowedDOW.includes(cur.getDay())&&cur>=base){
          const curWeekStart=new Date(cur);curWeekStart.setDate(cur.getDate()-cur.getDay());
          const weeksDiff=Math.round((curWeekStart-baseWeekStart)/(7*86400000));
          if(weeksDiff>=0&&weeksDiff%intervalWeeks===0){
            occCount++;
            if(cur>=from&&cur<=to){
              const occ=_applyRecurException(e,localDateStr(cur));
              if(occ)out.push(occ);
            }
          }
        }
        cur.setDate(cur.getDate()+1);
      }
      return;
    }

    // Jump-style recurrence: daily / weekly / biweekly / monthly / monthly-nth / yearly / custom(day|month)
    let cur=new Date(base);
    let safetyMax=0;
    while(cur<=hardStop&&occCount<maxCount&&safetyMax<500){
      safetyMax++;
      occCount++;
      if(cur>=from&&cur<=to){
        const occ=_applyRecurException(e,localDateStr(cur));
        if(occ)out.push(occ);
      }
      switch(e.recur){
        case 'daily':     cur.setDate(cur.getDate()+1);break;
        case 'weekly':    cur.setDate(cur.getDate()+7);break;
        case 'biweekly':  cur.setDate(cur.getDate()+14);break;
        case 'monthly':   cur.setMonth(cur.getMonth()+1);break;
        case 'monthly-nth':{
          // Nth weekday of month
          const dow=base.getDay(),nth=Math.ceil(base.getDate()/7);
          cur.setMonth(cur.getMonth()+1);
          cur.setDate(1);
          let count=0;
          while(cur.getDay()!==dow)cur.setDate(cur.getDate()+1);
          while(count<nth-1){cur.setDate(cur.getDate()+7);count++;}
          break;
        }
        case 'yearly':    cur.setFullYear(cur.getFullYear()+1);break;
        case 'custom':{
          const n=parseInt(e.recurN)||1;
          if(e.recurUnit==='month')cur.setMonth(cur.getMonth()+n);
          else if(e.recurUnit==='week')cur.setDate(cur.getDate()+7*n);
          else cur.setDate(cur.getDate()+n);
          break;
        }
        default:cur=new Date(hardStop.getTime()+1);
      }
    }
  });
  return out;
}

function eventsForDate(dateStr){
  const mon=new Date(dateStr);mon.setDate(1);
  const expanded=expandRecurring(DB.calEvents,
    localDateStr(new Date(mon.getFullYear(),mon.getMonth()-1,1)),
    localDateStr(new Date(mon.getFullYear(),mon.getMonth()+2,0))
  );
  return expanded
    .filter(e=>(e._expandedDate||e.date)===dateStr)
    .filter(e=>calContextFilter.has(normaliseType(e.type))||e._isTask);
}

// ── Reminder system ───────────────────────────────────────────────
// Delivers via the service worker's showNotification() when one is active
// (works even with the installed PWA backgrounded/minimized, not just the
// foreground tab) and falls back to a plain Notification otherwise. This is
// still "the app has to have been opened on this device recently" -- actual
// closed-app push (kill the app entirely, get notified hours later from a
// server) needs a VAPID keypair + a scheduled server-side job and isn't
// buildable as a pure static PWA; this covers everything short of that.
function updateNotifPermStatus(){
  const el=document.getElementById('notifPermStatus'),btn=document.getElementById('notifEnableBtn');
  if(!el||!('Notification' in window))return;
  const p=Notification.permission;
  el.textContent=p==='granted'?'✓ Enabled':p==='denied'?'Blocked — allow notifications for this site in your browser settings.':'Not enabled yet';
  if(btn)btn.style.display=p==='granted'?'none':'inline-flex';
}
function enableNotifications(){
  if(!('Notification' in window)){showToast('Notifications are not supported in this browser');return;}
  Notification.requestPermission().then(p=>{
    updateNotifPermStatus();
    showToast(p==='granted'?'✓ Notifications enabled':'Notifications not enabled');
    if(p==='granted')subscribeToPush();
  });
}
// Web Push — VAPID public key is safe to ship client-side (that's the whole
// point of the public/private split); only the private key, held by the
// send-due-notifications Edge Function, can actually sign push messages.
const VAPID_PUBLIC_KEY='BO9SfQ9ESDyX1XQHLkOuDFEblIF6MzyNMf6Dkf1M5t45Y1J0Rh2a9EQ2ejmmdQePKjTKYPWZILV0rbv21_kEgc0';
function _urlBase64ToUint8Array(base64String){
  const padding='='.repeat((4-base64String.length%4)%4);
  const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
  const rawData=atob(base64);
  return Uint8Array.from([...rawData].map(c=>c.charCodeAt(0)));
}
async function subscribeToPush(){
  if(!('serviceWorker' in navigator)||!('PushManager' in window))return;
  if(Notification.permission!=='granted')return;
  const uid=getAuthUserId();
  if(!uid)return; // subscribing without a signed-in user has nowhere to attach the row to
  try{
    const reg=await navigator.serviceWorker.ready;
    let sub=await reg.pushManager.getSubscription();
    if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:_urlBase64ToUint8Array(VAPID_PUBLIC_KEY)});
    const j=sub.toJSON();
    // Check first — re-subscribing on a device that's already registered
    // would otherwise 409 on the (user_id, endpoint) unique constraint.
    const existing=await sbFetch('push_subscriptions','GET',null,`user_id=eq.${uid}&endpoint=eq.${encodeURIComponent(j.endpoint)}&select=id`);
    if(Array.isArray(existing)&&existing.length)return;
    await sbFetch('push_subscriptions','POST',{user_id:uid,endpoint:j.endpoint,p256dh:j.keys.p256dh,auth:j.keys.auth});
  }catch(e){
    console.error('subscribeToPush error',e);
  }
}
function _fireReminder(title,body){
  if(!('Notification' in window)||Notification.permission!=='granted')return;
  const opts={body,icon:'icons/icon-192.png',badge:'icons/icon-192.png'};
  if(navigator.serviceWorker&&navigator.serviceWorker.controller){
    navigator.serviceWorker.ready.then(reg=>reg.showNotification(title,opts)).catch(()=>{try{new Notification(title,opts);}catch(e){}});
  } else {
    try{new Notification(title,opts);}catch(e){}
  }
}
// Local dedup so a date-only "due today" nudge (task/bill) fires once per
// item per day instead of every 30s the app happens to be open -- persisted
// so reloading the page the same day doesn't re-spam it either.
const _dueNudged=new Set(JSON.parse(localStorage.getItem('j-due-nudged')||'[]'));
function _markNudged(key){_dueNudged.add(key);localStorage.setItem('j-due-nudged',JSON.stringify([..._dueNudged].slice(-500)));}
// ── Focus timer ──────────────────────────────────────────────────────────
// Pomodoro-style, tied to a specific task. State persists across reloads
// (localStorage) using an absolute endsAt timestamp rather than a
// countdown that would drift or reset on refresh -- reopening the tab
// mid-session picks up the real remaining time, not a stale one.
let _focusTimer={taskId:null,taskTitle:'',endsAt:null,remainingMs:null,paused:false,intervalId:null,durationMin:25};
function _saveFocusTimerState(){
  if(_focusTimer.taskId){
    localStorage.setItem('j-focus-timer',JSON.stringify({taskId:_focusTimer.taskId,taskTitle:_focusTimer.taskTitle,endsAt:_focusTimer.endsAt,remainingMs:_focusTimer.remainingMs,paused:_focusTimer.paused,durationMin:_focusTimer.durationMin}));
  }else{
    localStorage.removeItem('j-focus-timer');
  }
}
function startFocusTimer(taskId,durationMin){
  durationMin=durationMin||25;
  const t=DB.tasks.find(x=>x.id===taskId);
  _focusTimer={taskId,taskTitle:t?t.title:'Focus session',endsAt:Date.now()+durationMin*60000,remainingMs:null,paused:false,intervalId:_focusTimer.intervalId,durationMin};
  _saveFocusTimerState();
  const w=document.getElementById('focusTimerWidget');if(w)w.style.display='flex';
  const btn=document.getElementById('focusTimerPauseBtn');if(btn)btn.innerHTML='<i class="ti ti-player-pause"></i>';
  _startFocusTimerTick();
  showToast('▶ Focus timer started — '+durationMin+' min');
}
function _startFocusTimerTick(){
  clearInterval(_focusTimer.intervalId);
  _focusTimer.intervalId=setInterval(_tickFocusTimer,1000);
  _tickFocusTimer();
}
function _tickFocusTimer(){
  if(!_focusTimer.taskId||_focusTimer.paused)return;
  const remaining=_focusTimer.endsAt-Date.now();
  if(remaining<=0){_completeFocusTimer();return;}
  const totalSec=Math.ceil(remaining/1000);
  const clockEl=document.getElementById('focusTimerClock');
  if(clockEl)clockEl.textContent=String(Math.floor(totalSec/60)).padStart(2,'0')+':'+String(totalSec%60).padStart(2,'0');
  const titleEl=document.getElementById('focusTimerTaskTitle');
  if(titleEl)titleEl.textContent=_focusTimer.taskTitle;
}
function toggleFocusTimerPause(){
  if(!_focusTimer.taskId)return;
  if(_focusTimer.paused){
    _focusTimer.endsAt=Date.now()+_focusTimer.remainingMs;
    _focusTimer.paused=false;
  }else{
    _focusTimer.remainingMs=Math.max(0,_focusTimer.endsAt-Date.now());
    _focusTimer.paused=true;
  }
  _saveFocusTimerState();
  const btn=document.getElementById('focusTimerPauseBtn');
  if(btn)btn.innerHTML=_focusTimer.paused?'<i class="ti ti-player-play"></i>':'<i class="ti ti-player-pause"></i>';
}
function stopFocusTimer(){
  if(!_focusTimer.taskId)return;
  if(!_focusTimer.paused){
    const elapsedMin=Math.round((_focusTimer.durationMin*60000-Math.max(0,_focusTimer.endsAt-Date.now()))/60000);
    if(elapsedMin>0)_logFocusTime(_focusTimer.taskId,elapsedMin);
  }
  clearInterval(_focusTimer.intervalId);
  _focusTimer={taskId:null,taskTitle:'',endsAt:null,remainingMs:null,paused:false,intervalId:null,durationMin:25};
  _saveFocusTimerState();
  const w=document.getElementById('focusTimerWidget');if(w)w.style.display='none';
}
function _completeFocusTimer(){
  const taskId=_focusTimer.taskId,taskTitle=_focusTimer.taskTitle,durationMin=_focusTimer.durationMin;
  _logFocusTime(taskId,durationMin);
  _fireReminder('Focus session complete','Nice work — '+durationMin+' min on "'+taskTitle+'"');
  showToast('✓ Focus session complete!');
  clearInterval(_focusTimer.intervalId);
  _focusTimer={taskId:null,taskTitle:'',endsAt:null,remainingMs:null,paused:false,intervalId:null,durationMin:25};
  _saveFocusTimerState();
  const w=document.getElementById('focusTimerWidget');if(w)w.style.display='none';
}
function _logFocusTime(taskId,minutes){
  const t=DB.tasks.find(x=>x.id===taskId);
  if(!t)return;
  t.focusMinutes=(t.focusMinutes||0)+minutes;
  SB.update('tasks',t.id,{focusMinutes:t.focusMinutes},'tasks');
  try{renderTasks();}catch(e){}
}
function _restoreFocusTimerOnBoot(){
  try{
    const raw=localStorage.getItem('j-focus-timer');
    if(!raw)return;
    const saved=JSON.parse(raw);
    if(!saved.taskId)return;
    if(!saved.paused&&saved.endsAt<=Date.now()){
      // Session finished while the app was closed -- log it silently
      // rather than firing a stale "complete" notification on reopen.
      _logFocusTime(saved.taskId,saved.durationMin);
      localStorage.removeItem('j-focus-timer');
      return;
    }
    _focusTimer={taskId:saved.taskId,taskTitle:saved.taskTitle,endsAt:saved.endsAt,remainingMs:saved.remainingMs,paused:saved.paused,intervalId:null,durationMin:saved.durationMin};
    const w=document.getElementById('focusTimerWidget');if(w)w.style.display='flex';
    if(!saved.paused){
      _startFocusTimerTick();
    }else{
      const totalSec=Math.ceil(saved.remainingMs/1000);
      const clockEl=document.getElementById('focusTimerClock');if(clockEl)clockEl.textContent=String(Math.floor(totalSec/60)).padStart(2,'0')+':'+String(totalSec%60).padStart(2,'0');
      const titleEl=document.getElementById('focusTimerTaskTitle');if(titleEl)titleEl.textContent=saved.taskTitle;
      const btn=document.getElementById('focusTimerPauseBtn');if(btn)btn.innerHTML='<i class="ti ti-player-play"></i>';
    }
  }catch(e){}
}
function checkReminders(){
  if(!('Notification' in window))return;
  const now=new Date();
  const todayStr=localDateStr(now);
  // Also check tomorrow for overnight events
  const tmrStr=localDateStr(new Date(now.getTime()+86400000));
  const candidates=DB.calEvents.filter(e=>(e.date===todayStr||e.date===tmrStr)&&e.reminder&&e.time);
  candidates.forEach(e=>{
    const [h,m]=e.time.split(':').map(Number);
    const evTime=new Date(e.date+'T00:00:00');evTime.setHours(h,m,0,0);
    const diffMin=(evTime-now)/60000;
    const remMin=parseInt(e.remindMin||30,10);
    if(diffMin>0&&diffMin<=remMin&&!e._reminded){
      e._reminded=true;
      const msg=`"${e.title}" starts in ${Math.round(diffMin)} min`;
      showToast('\u23f0 Reminder: '+msg,5000);
      // Dashboard urgent banner
      let banner=document.getElementById('jelix-reminder-banner');
      if(!banner){
        banner=document.createElement('div');
        banner.id='jelix-reminder-banner';
        banner.style.cssText='position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:9999;background:var(--navy2);border:1px solid var(--teal);border-radius:8px;padding:10px 18px;font-size:var(--text-sm);font-weight:700;color:var(--teal);display:flex;align-items:center;gap:10px;box-shadow:0 0 20px rgba(128,255,250,.2)';
        document.body.appendChild(banner);
      }
      banner.innerHTML='\u23f0 '+msg+'<button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:16px;margin-left:8px">\u00d7</button>';
      setTimeout(()=>{if(banner.parentElement)banner.remove();},remMin*60000);
      // Voice announcement
      if('speechSynthesis' in window){
        const utt=new SpeechSynthesisUtterance('JELIX reminder. '+e.title+' starts in '+Math.round(diffMin)+' minutes.');
        utt.rate=0.95;utt.pitch=1.1;window.speechSynthesis.speak(utt);
      }
      _fireReminder('J.O.B Systems Reminder',e.title+' starts in '+Math.round(diffMin)+' min');
    }
  });
  // Tasks due today/tomorrow, and unpaid bills due today/tomorrow -- these
  // never carried a reminder:true/time flag so the loop above never saw
  // them, meaning due items silently never nudged you at all.
  (DB.tasks||[]).filter(t=>t.status!=='Done'&&(t.due===todayStr||t.due===tmrStr)).forEach(t=>{
    const key='task-'+t.id+'-'+t.due;
    if(_dueNudged.has(key))return;
    _markNudged(key);
    const when=t.due===todayStr?'today':'tomorrow';
    showToast('Task due '+when+': '+t.title,5000);
    _fireReminder('Task due '+when,t.title);
  });
  (DB.bills||[]).filter(b=>b.status!=='paid'&&(b.dueDate===todayStr||b.dueDate===tmrStr)).forEach(b=>{
    const key='bill-'+b.id+'-'+b.dueDate;
    if(_dueNudged.has(key))return;
    _markNudged(key);
    const when=b.dueDate===todayStr?'today':'tomorrow';
    showToast('Bill due '+when+': '+b.name,5000);
    _fireReminder('Bill due '+when,b.name+(b.amount?' - ₱'+b.amount.toLocaleString(undefined,{minimumFractionDigits:2}):''));
  });
}
setInterval(checkReminders,30000);

// ── Conflict detection ─────────────────────────────────────────────
function detectConflicts(dateStr,startTime,endTime,excludeId){
  if(!startTime||!endTime)return[];
  const t2m=t=>{ const[h,m]=t.split(':').map(Number);return h*60+m; };
  const s=t2m(startTime),en=t2m(endTime);
  return eventsForDate(dateStr).filter(e=>{
    if(e.id===excludeId||!e.time||!e.endTime)return false;
    const es=t2m(e.time),ee=t2m(e.endTime);
    return s<ee&&en>es;
  });
}

// ── View switching ─────────────────────────────────────────────────
function setCalView(v){
  calView=v;
  ['day','week','twoweek','month','quarter','agenda'].forEach(vv=>{
    // Sync both sets of buttons (desktop + mobile)
    ['cvt-'+vv,'cvt-'+vv+'2'].forEach(id=>{
      const btn=document.getElementById(id);
      if(btn)btn.classList.toggle('active',vv===v);
    });
  });
  renderCalendar();
}

function renderCalTwoWeek(){
  const el=document.getElementById('calMainArea');
  const DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const base=new Date(calSelectedDate);
  const dow=base.getDay();
  const weekStart=new Date(base);weekStart.setDate(base.getDate()-dow);
  const dates=Array.from({length:14},(_,i)=>{
    const d=new Date(weekStart);d.setDate(weekStart.getDate()+i);
    return localDateStr(d);
  });
  const today=localDateStr(new Date());
  const fromDate=dates[0],toDate=dates[13];
  const allExpanded=expandRecurring(DB.calEvents,fromDate,toDate);
  const MAX_CHIPS=4;

  let html=`<div style="display:flex;flex-direction:column;height:100%;min-height:0;padding:14px">
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px">
      ${DAYS.map(d=>`<div style="font-size:var(--text-xs);text-align:center;color:var(--text3);font-weight:700;padding:4px">${d}</div>`).join('')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);grid-template-rows:repeat(2,1fr);gap:8px;flex:1;min-height:0">
      ${dates.map(ds=>{
        const d=new Date(ds+'T00:00:00');
        const isT=ds===today;
        const dayEvents=allExpanded.filter(e=>(e._expandedDate||e.date)===ds&&(calContextFilter.has(normaliseType(e.type))||e._isTask));
        const dayTasks=(DB.tasks||[]).filter(t=>t.due===ds);
        const items=[...dayEvents.map(e=>({label:e.title,world:_evResolveColor(calWorldById(normaliseType(e.type)),e),id:e.id})),...dayTasks.map(t=>({label:t.title,world:null,id:t.id}))];
        const shown=items.slice(0,MAX_CHIPS);
        const extra=items.length-shown.length;
        const cellBg=isT?'var(--accent-lime-soft)':'var(--navy2)';
        const cellBorder=isT?'var(--teal)':'var(--border)';
        return `<div onclick="calSelectedDate='${ds}';setCalView('day')" style="border:1px solid ${cellBorder};border-radius:10px;padding:8px;cursor:pointer;background:${cellBg};display:flex;flex-direction:column;gap:4px;overflow:hidden;transition:border-color .15s" onmouseover="this.style.borderColor='var(--teal2)'" onmouseout="this.style.borderColor='${cellBorder}'">
          <div style="font-size:var(--text-sm);font-weight:${isT?800:600};color:${isT?'var(--teal)':'var(--text1)'}">${d.getDate()}</div>
          ${shown.map(it=>{const c=it.world?it.world.hex:'#D97706';return`<div style="font-size:var(--text-xs);padding:2px 6px;border-radius:5px;background:${c};color:${calendarTextColor(c)};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${(it.label||'').replace(/</g,'&lt;')}</div>`;}).join('')}
          ${extra>0?`<div style="font-size:9px;color:var(--text3);padding-left:2px">+${extra} more</div>`:''}
        </div>`;
      }).join('')}
    </div>
  </div>`;
  el.innerHTML=html;
}

function calNav(dir){
  if(calView==='day'){
    const d=new Date(calSelectedDate);d.setDate(d.getDate()+dir);
    calSelectedDate=localDateStr(d);
  } else if(calView==='week'){
    const d=new Date(calSelectedDate);d.setDate(d.getDate()+dir*7);
    calSelectedDate=localDateStr(d);
  } else if(calView==='twoweek'){
    const d=new Date(calSelectedDate);d.setDate(d.getDate()+dir*14);
    calSelectedDate=localDateStr(d);
  } else if(calView==='quarter'){
    calMonth+=dir*3;
    if(calMonth>11){calMonth-=12;calYear++;}
    if(calMonth<0){calMonth+=12;calYear--;}
  } else {
    calMonth+=dir;
    if(calMonth>11){calMonth=0;calYear++;}
    if(calMonth<0){calMonth=11;calYear--;}
  }
  renderCalendar();
}

function calNavToday(){
  const t=new Date();
  calSelectedDate=localDateStr(t);
  calYear=t.getFullYear();calMonth=t.getMonth();
  renderCalendar();
}

function calMiniNav(dir){calMonth+=dir;if(calMonth>11){calMonth=0;calYear++;}if(calMonth<0){calMonth=11;calYear--;}renderCalendar();}

// ── Sidebar helpers ───────────────────────────────────────────────
function renderCalSidebar(){
  // Mini calendar
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const el=document.getElementById('calMiniMonth');
  if(el)el.textContent=MONTHS[calMonth]+' '+calYear;
  const grid=document.getElementById('calMiniGrid');
  if(!grid)return;
  const first=new Date(calYear,calMonth,1).getDay();
  const days=new Date(calYear,calMonth+1,0).getDate();
  const prev=new Date(calYear,calMonth,0).getDate();
  const today=localDateStr(new Date());
  let html='';
  for(let i=first-1;i>=0;i--){
    html+=`<div class="cal-mini-day om">${prev-i}</div>`;
  }
  for(let d=1;d<=days;d++){
    const ds=calYear+'-'+String(calMonth+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    const isToday=ds===today;
    const isSel=ds===calSelectedDate;
    const hasEv=DB.calEvents.some(e=>e.date===ds)||DB.calEvents.some(e=>e._expandedDate===ds);
    html+=`<div class="cal-mini-day${isToday?' today':isSel?' selected':''}" onclick="calSelectedDate='${ds}';setCalView('day')" title="${ds}">${d}</div>`;
  }
  const rem=42-(first+days);
  for(let i=1;i<=rem;i++) html+=`<div class="cal-mini-day om">${i}</div>`;
  grid.innerHTML=html;

  // Legend / pills / dot row — must reflect live DB.worlds, not the
  // hardcoded CAL_WORLDS array. CAL_WORLDS only exists as the internal
  // short-code registry (ih/cs/ven/bld/sid/fth/lif) that calendar event
  // types resolve through; it always contains all 7 original domains
  // (including Chainsmoker/'cs') regardless of what's actually been
  // deleted from Domains. Rendering the UI straight from it meant a
  // deleted domain kept reappearing here forever — deleting it from
  // DB.worlds never touched this constant, so there was nothing to
  // "come back": it was never reading the real list in the first place.
  const domainList=(DB.worlds||[]).map(w=>calWorldById(DOMAIN_ID_TO_CAL[w.id]||w.id));

  // Legend
  const leg=document.getElementById('calLegend');
  if(leg)leg.innerHTML=domainList.map(w=>`
    <div class="cal-legend-item" onclick="toggleCalContext('${w.id}',this)">
      <div class="cal-legend-dot" style="background:${w.hex};opacity:${calContextFilter.has(w.id)?1:.3}"></div>
      <span style="opacity:${calContextFilter.has(w.id)?1:.4}">${w.label}</span>
    </div>`).join('');

  // Context pills in toolbar (desktop)
  const pills=document.getElementById('calCtxFilters');
  if(pills)pills.innerHTML=domainList.map(w=>`
    <div class="cal-ctx-pill${calContextFilter.has(w.id)?' on':''}" style="background:${calContextFilter.has(w.id)?w.hex:'transparent'};border-color:${calContextFilter.has(w.id)?w.hex:'rgba(255,255,255,.12)'};color:${calContextFilter.has(w.id)?calendarTextColor(w.hex):'var(--text3)'}" onclick="toggleCalContext('${w.id}',null)">${w.label}</div>`).join('');
  // World dots for mobile inline filter
  const dotRow=document.getElementById('calWorldDotRow');
  if(dotRow)dotRow.innerHTML=domainList.map(w=>`<span style="width:8px;height:8px;border-radius:50%;background:${w.hex};display:inline-block;opacity:${calContextFilter.has(w.id)?1:.2};flex-shrink:0" title="${w.label}"></span>`).join('');

  // Upcoming events (next 7 days)
  const up=document.getElementById('calUpcoming');
  if(up){
    const nowD=new Date();const futureD=new Date();futureD.setDate(futureD.getDate()+7);
    const upcoming=expandRecurring(DB.calEvents,localDateStr(nowD),localDateStr(futureD))
      .filter(e=>calContextFilter.has(normaliseType(e.type))||e._isTask)
      .sort((a,b)=>(a._expandedDate||a.date).localeCompare(b._expandedDate||b.date))
      .slice(0,5);
    up.innerHTML=upcoming.map(e=>{
      const w=_evResolveColor(calWorldById(normaliseType(e.type)),e);
      return`<div style="display:flex;gap:9px;align-items:flex-start;cursor:pointer;padding:6px 4px;border-radius:8px;transition:background .15s" onclick="calSelectedDate='${e._expandedDate||e.date}';setCalView('day')" onmouseover="this.style.background='var(--hover-tint)'" onmouseout="this.style.background=''">
        <div style="width:3px;border-radius:6px;background:${w.color};align-self:stretch;flex-shrink:0;min-height:32px"></div>
        <div style="min-width:0">
          <div style="font-size:var(--text-sm);color:var(--text1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500">${e.title}</div>
          <div style="font-size:var(--text-xs);color:var(--text3);margin-top:2px">${e._expandedDate||e.date}${e.time?' · '+to12h(e.time):''}</div>
        </div>
      </div>`;
    }).join('')||'<div style="font-size:var(--text-xs);color:var(--text3)">Nothing upcoming.</div>';
  }
}

function toggleCalFilterDropdown(){
  const dd=document.getElementById('calFilterDropdown');
  if(!dd)return;
  const open=dd.style.display==='none'||!dd.style.display;
  dd.style.display=open?'block':'none';
  if(open) renderCalFilterList();
}
function renderCalFilterList(){
  const list=document.getElementById('calFilterList');
  const dotRow=document.getElementById('calWorldDotRow');
  const worlds=(DB.worlds||[]).map(w=>calWorldById(DOMAIN_ID_TO_CAL[w.id]||w.id));
  // Populate dropdown checkboxes
  if(list) list.innerHTML=worlds.map(w=>`
    <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:6px 8px;border-radius:12px;background:${calContextFilter.has(w.id)?'rgba(128,255,250,.06)':'transparent'}">
      <input type="checkbox" ${calContextFilter.has(w.id)?'checked':''} onchange="toggleCalContext('${w.id}',null);renderCalFilterList();updateCalFilterCount()" style="width:16px;height:16px;accent-color:${w.hex};flex-shrink:0;cursor:pointer">
      <span style="width:8px;height:8px;border-radius:50%;background:${w.hex};flex-shrink:0;display:inline-block"></span>
      <span style="font-size:12px;font-weight:600;color:var(--text1)">${w.label}</span>
    </label>`).join('');
  // Update dot row - show colored dots for each world
  if(dotRow) dotRow.innerHTML=worlds.map(w=>`
    <span style="width:8px;height:8px;border-radius:50%;background:${w.hex};display:inline-block;opacity:${calContextFilter.has(w.id)?1:.25};flex-shrink:0" title="${w.label}"></span>`).join('');
  updateCalFilterCount();
}
function updateCalFilterCount(){
  const cnt=document.getElementById('calFilterCount');
  const activeIds=(DB.worlds||[]).map(w=>DOMAIN_ID_TO_CAL[w.id]||w.id);
  const total=activeIds.length;
  const active=activeIds.filter(id=>calContextFilter.has(id)).length;
  if(cnt) cnt.textContent=active<total?active+'/'+total:'All';
}
function calFilterSelectAll(){(DB.worlds||[]).forEach(w=>{calContextFilter.add(DOMAIN_ID_TO_CAL[w.id]||w.id);});renderCalendar();renderCalFilterList();}
function calFilterClearAll(){calContextFilter.clear();renderCalendar();renderCalFilterList();}
// Close filter dropdown on outside click
document.addEventListener('click',function(e){
  const dd=document.getElementById('calFilterDropdown');
  const btn=document.getElementById('calFilterBtn');
  if(dd&&btn&&!dd.contains(e.target)&&!btn.contains(e.target)){dd.style.display='none';}
},true);
function toggleCalContext(id,el){
  if(calContextFilter.has(id))calContextFilter.delete(id);
  else calContextFilter.add(id);
  renderCalendar();
}

// ── MONTH view ───────────────────────────────────────────────────
function renderCalMonth(){
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAYS=['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const el=document.getElementById('calMainArea');
  const today=localDateStr(new Date());
  const first=new Date(calYear,calMonth,1).getDay();
  const daysInMonth=new Date(calYear,calMonth+1,0).getDate();
  const prevDays=new Date(calYear,calMonth,0).getDate();

  // Range for expansion
  const fromDate=localDateStr(new Date(calYear,calMonth-1,1));
  const toDate=localDateStr(new Date(calYear,calMonth+1,0));
  const allExpanded=expandRecurring(DB.calEvents,fromDate,toDate);

  const getEvs=ds=>allExpanded
    .filter(e=>(e._expandedDate||e.date)===ds&&(calContextFilter.has(normaliseType(e.type))||e._isTask));

  // Build overnight continuation map: nextDay → original event
  const continuations={};
  allExpanded.forEach(e=>{
    if(!e.time||!e.endTime)return;
    const[sh,sm]=e.time.split(':').map(Number);
    const[eh,em]=e.endTime.split(':').map(Number);
    if(eh*60+em<=sh*60+sm){
      const ds=e._expandedDate||e.date;
      const next=new Date(ds);next.setDate(next.getDate()+1);
      const nextStr=localDateStr(next);
      if(!continuations[nextStr])continuations[nextStr]=[];
      continuations[nextStr].push(e);
    }
  });

  let html=`<div style="display:flex;flex-direction:column;height:100%;min-height:600px">`;
  // Day headers
  html+=`<div class="cal-grid">${DAYS.map(d=>`<div class="cday-label">${d}</div>`).join('')}</div>`;
  html+=`<div class="cal-grid" style="flex:1;grid-auto-rows:1fr">`;

  // Prev month overflow
  for(let i=first-1;i>=0;i--){
    const d=prevDays-i;
    html+=`<div class="cday om"><div class="dn">${d}</div></div>`;
  }
  // Current month
  for(let day=1;day<=daysInMonth;day++){
    const ds=calYear+'-'+String(calMonth+1).padStart(2,'0')+'-'+String(day).padStart(2,'0');
    const isToday=ds===today;
    const isSel=ds===calSelectedDate;
    const evs=getEvs(ds);
    const conts=continuations[ds]||[];
    html+=`<div class="cday${isToday?' today':''}${isSel?' selected':''}" onclick="calSelectedDate='${ds}';renderCalendar()" ondblclick="openCalEventModalOnDate('${ds}')">
      <div class="dn">${day}</div>
      ${conts.map(e=>{const w=_evResolveColor(calWorldById(normaliseType(e.type)),e);return`<div style="font-size:var(--text-xs);background:${w.hex};color:${calendarTextColor(w.hex)};border:1px dashed ${calendarTextColor(w.hex)};border-radius:6px;padding:1px 5px;margin-bottom:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer" onclick="event.stopPropagation();showCalPopover(event,${e.id||0},'${e._expandedDate||e.date}')" title="${e.title} (continued)">↩ ${e.title} until ${to12h(e.endTime)}</div>`;}).join('')}
      ${evs.slice(0,Math.max(0,3-conts.length)).map(e=>`<div class="${evClass(e)}" onclick="event.stopPropagation();showCalPopover(event,${e.id||0},'${e._expandedDate||e.date}')" title="${e.title}">${e.time?to12h(e.time)+' ':''}${e.title}</div>`).join('')}
      ${evs.length+conts.length>3?`<div style="font-size:var(--text-xs);color:var(--text3);padding:1px 4px">+${evs.length+conts.length-3} more</div>`:''}
    </div>`;
  }
  // Next month overflow
  const rem=42-(first+daysInMonth);
  for(let i=1;i<=rem;i++){
    html+=`<div class="cday om"><div class="dn">${i}</div></div>`;
  }
  html+='</div></div>';
  el.innerHTML=html;
}

// ── WEEK view ────────────────────────────────────────────────────
// ── Calendar drag-and-drop ───────────────────────────────────────────────
// Repositions an event block by dropping it elsewhere in the day/week grid —
// new date comes from which column it lands in, new time from the vertical
// offset (snapped to 15min). Task-derived blocks (_isTask) also write back
// to the underlying task's due/startTime/endTime, not just the calendar
// entry, so the two stay in sync instead of the task silently reverting it
// on its next save. Recurring occurrences are excluded (not made draggable)
// since "move this one instance vs. the whole series" needs its own UI this
// doesn't have yet — they stay click-to-edit like before.
let _calDrag=null;
function calDragStart(ev,id,taskId){
  ev.stopPropagation();
  _calDrag={id,taskId:taskId||null};
  ev.dataTransfer.effectAllowed='move';
  ev.dataTransfer.setData('text/plain',String(id));
  if(ev.target.classList)ev.target.classList.add('cal-dragging');
}
function calDragEnd(ev){
  if(ev.target.classList)ev.target.classList.remove('cal-dragging');
}
function calSnapMins(mins){return Math.min(1425,Math.max(0,Math.round(mins/15)*15));}
function calMinsToHHMM(mins){mins=((mins%1440)+1440)%1440;return String(Math.floor(mins/60)).padStart(2,'0')+':'+String(mins%60).padStart(2,'0');}
function calDrop(ev,dateStr,pxPerHour){
  ev.preventDefault();
  if(!_calDrag)return;
  const{id,taskId}=_calDrag;_calDrag=null;
  const rect=ev.currentTarget.getBoundingClientRect();
  const startMins=calSnapMins(((ev.clientY-rect.top)/pxPerHour)*60);
  const cal=(DB.calEvents||[]).find(e=>e.id===id);
  if(!cal)return;
  let durMins=60;
  if(cal.time&&cal.endTime){
    const[sh,sm]=cal.time.split(':').map(Number);const[eh,em]=cal.endTime.split(':').map(Number);
    const d=(eh*60+em)-(sh*60+sm);
    if(d>0)durMins=d;
  }
  const newStart=calMinsToHHMM(startMins);
  const newEnd=calMinsToHHMM(startMins+durMins);
  cal.date=dateStr;cal.time=newStart;cal.endTime=newEnd;
  SB.update('cal_events',cal.id,{date:dateStr,time:newStart,endTime:newEnd},'calEvents');
  if(taskId){
    const t=(DB.tasks||[]).find(x=>x.id===taskId);
    if(t){
      t.due=dateStr;t.startTime=newStart;t.endTime=newEnd;
      SB.update('tasks',t.id,{due:dateStr,startTime:newStart,endTime:newEnd},'tasks');
    }
  }
  renderCalendar();
  showToast('Moved to '+dateStr+' '+to12h(newStart));
}
function renderCalWeek(){
  const el=document.getElementById('calMainArea');
  const DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  // Find Mon of week containing calSelectedDate
  const base=new Date(calSelectedDate);
  const dow=base.getDay(); // 0=Sun
  const weekStart=new Date(base);weekStart.setDate(base.getDate()-dow);

  const dates=Array.from({length:7},(_,i)=>{
    const d=new Date(weekStart);d.setDate(weekStart.getDate()+i);
    return localDateStr(d);
  });
  const today=localDateStr(new Date());

  const fromDate=dates[0],toDate=dates[6];
  const allExpanded=expandRecurring(DB.calEvents,fromDate,toDate);
  const getEvs=ds=>allExpanded.filter(e=>(e._expandedDate||e.date)===ds&&(calContextFilter.has(normaliseType(e.type))||e._isTask));

  const hours=Array.from({length:24},(_,i)=>i);
  const t2px=t=>{const[h,m]=t.split(':').map(Number);return(h+(m/60))*48;}; // 48px per hour

  // Now line
  const now=new Date();
  const nowPx=(now.getHours()+(now.getMinutes()/60))*48;
  const nowDate=today;

  let html=`<div style="display:flex;flex-direction:column;height:100%;min-height:0">`;
  // Header
  html+=`<div class="cal-week-header">
    <div class="cal-week-hcol" style="border-right:1px solid var(--border)"></div>
    ${dates.map((ds,i)=>{
      const d=new Date(ds);
      const isT=ds===today;
      return`<div class="cal-week-hcol${isT?' today':''}">
        <div class="wh-day">${DAYS[d.getDay()]}</div>
        <div class="wh-num" onclick="calSelectedDate='${ds}';setCalView('day')" style="cursor:pointer">${d.getDate()}</div>
      </div>`;
    }).join('')}
  </div>`;

  html+=`<div style="flex:1;overflow-y:auto;position:relative">`;
  html+=`<div class="cal-week-grid" style="position:relative;min-height:${24*48}px">`;

  // Time labels
  html+=`<div class="cal-time-col">`;
  hours.forEach(h=>{
    const label=h===0?'12am':h<12?h+'am':h===12?'12pm':(h-12)+'pm';
    html+=`<div class="cal-time-label" style="height:48px;white-space:nowrap">${label}</div>`;
  });
  html+='</div>';

  // Day columns
  dates.forEach((ds,di)=>{
    const isT=ds===today;
    html+=`<div class="cal-day-col" onclick="openCalEventModalOnDate('${ds}')" ondragover="event.preventDefault()" ondrop="calDrop(event,'${ds}',48)">`;
    // Hour lines — plus quarter-hour (15/30/45 min) gridlines
    hours.forEach(h=>{
      html+=`<div class="cal-hour-line" style="top:${h*48}px">
        <div class="cal-qtr-line" style="top:12px"></div>
        <div class="cal-half-line"></div>
        <div class="cal-qtr-line" style="top:36px"></div>
      </div>`;
    });
    // Now line
    if(isT) html+=`<div class="cal-now-line" style="top:${nowPx}px"></div>`;
    // Events — with overnight split support
    const dayTimedEvs=getEvs(ds).filter(e=>!e.allDay&&e.time);
    const dayLayout=_layoutEventColumns(dayTimedEvs);
    dayTimedEvs.forEach(e=>{
      const top=t2px(e.time);
      const w=_evResolveColor(calWorldById(normaliseType(e.type)),e);
      const colStyle=_colStyle(dayLayout,e);
      const isOvernight=e.endTime&&(()=>{const[sh,sm]=e.time.split(':').map(Number);const[eh,em]=e.endTime.split(':').map(Number);return eh*60+em<=sh*60+sm;})();
      if(isOvernight){
        // Clip at midnight — show arrow-down indicator
        const h1=Math.max(24*48-top,20);
        html+=`<div class="cal-event-block" style="top:${top}px;height:${h1}px;${colStyle}${calendarBlockStyle(w.hex)}" onclick="event.stopPropagation();showCalPopover(event,${e.id||0},'${e._expandedDate||e.date}')">
          <div class="ceb-title">${e.title}</div>
          <div class="ceb-time">${to12h(e.time)} ↓</div>
        </div>`;
      } else {
        const bot=e.endTime?t2px(e.endTime):top+48;
        const h=Math.max(bot-top,20);
        const draggable=!e._recurring;
        html+=`<div class="cal-event-block" ${draggable?`draggable="true" ondragstart="calDragStart(event,${e.id||0},${e._taskId?e._taskId:'null'})" ondragend="calDragEnd(event)"`:''} style="top:${top}px;height:${h}px;${colStyle}${calendarBlockStyle(w.hex)}" onclick="event.stopPropagation();showCalPopover(event,${e.id||0},'${e._expandedDate||e.date}')">
          <div class="ceb-title">${e.title}</div>
          <div class="ceb-time">${to12h(e.time)}${e.endTime?'–'+to12h(e.endTime):''}</div>
        </div>`;
      }
    });
    // Continuation blocks from the previous day
    if(di>0){
      const prevDs=dates[di-1];
      getEvs(prevDs).filter(e=>!e.allDay&&e.time&&e.endTime).forEach(e=>{
        const[sh,sm]=e.time.split(':').map(Number);const[eh,em]=e.endTime.split(':').map(Number);
        if(eh*60+em>sh*60+sm)return;
        const w=_evResolveColor(calWorldById(normaliseType(e.type)),e);
        const bot=t2px(e.endTime);const h=Math.max(bot,20);
        html+=`<div class="cal-event-block" style="top:0;height:${h}px;${calendarBlockStyle(w.hex,true)}" onclick="event.stopPropagation();showCalPopover(event,${e.id||0},'${e._expandedDate||e.date}')">
          <div class="ceb-title">↩ ${e.title}</div>
          <div class="ceb-time">until ${to12h(e.endTime)}</div>
        </div>`;
      });
    }
    html+='</div>';
  });
  html+='</div></div></div>';
  el.innerHTML=html;
  // Scroll to 8am
  setTimeout(()=>{const b=el.querySelector('[style*="overflow-y:auto"]');if(b)b.scrollTop=8*48-20;},0);
}

// ── DAY view ─────────────────────────────────────────────────────
function renderCalDay(){
  const el=document.getElementById('calMainArea');
  const today=localDateStr(new Date());
  const d=new Date(calSelectedDate);
  const DAYNAMES=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const fromDate=calSelectedDate,toDate=calSelectedDate;
  const allExpanded=expandRecurring(DB.calEvents,fromDate,toDate);
  const evs=allExpanded.filter(e=>(e._expandedDate||e.date)===calSelectedDate&&(calContextFilter.has(normaliseType(e.type))||e._isTask));
  const timedEvs=evs.filter(e=>e.time);
  const allDayEvs=evs.filter(e=>!e.time||e.allDay);

  const t2px=t=>{const[h,m]=t.split(':').map(Number);return(h+(m/60))*60;};
  const now=new Date();
  const nowPx=(now.getHours()+(now.getMinutes()/60))*60;
  const isToday=calSelectedDate===today;
  const hours=Array.from({length:24},(_,i)=>i);

  let html=`<div class="cal-day-view">`;
  html+=`<div class="cal-day-header">
    <div class="cal-day-title">${DAYNAMES[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}</div>
    ${allDayEvs.length?`<div style="display:flex;gap:5px;margin-top:8px;flex-wrap:wrap">${allDayEvs.map(e=>{const w=_evResolveColor(calWorldById(normaliseType(e.type)),e);return`<div style="background:${w.hex};color:${calendarTextColor(w.hex)};border:1px solid ${w.hex};border-radius:10px;padding:3px 10px;font-size:var(--text-xs);font-weight:600;cursor:pointer" onclick="showCalPopover(event,${e.id||0},'${e._expandedDate||e.date}')">${e.title}</div>`;}).join('')}</div>`:''}
  </div>`;

  html+=`<div style="flex:1;overflow-y:auto;display:flex">`;
  // Time labels
  html+=`<div style="width:68px;flex-shrink:0;position:relative;height:${24*60}px">`;
  hours.forEach(h=>{
    const label=h===0?'12:00 am':h<12?h+':00 am':h===12?'12:00 pm':(h-12)+':00 pm';
    html+=`<div style="position:absolute;top:${h*60}px;right:6px;font-size:var(--text-xs);color:var(--text3);white-space:nowrap;transform:translateY(-50%)">${label}</div>`;
    html+=`<div style="position:absolute;top:${h*60+30}px;right:6px;font-size:var(--text-xs);color:var(--text3);opacity:.5;white-space:nowrap;transform:translateY(-50%)">:30</div>`;
  });
  html+='</div>';
  // Day column
  html+=`<div style="flex:1;position:relative;min-height:${24*60}px;border-left:1px solid var(--border)" onclick="openCalEventModalOnDate('${calSelectedDate}')" ondragover="event.preventDefault()" ondrop="calDrop(event,'${calSelectedDate}',60)">`;
  hours.forEach(h=>{
    html+=`<div style="position:absolute;top:${h*60}px;left:0;right:0;border-top:1px solid var(--border);height:60px">
      <div style="position:absolute;top:15px;left:0;right:0;border-top:1px dashed rgba(255,255,255,.03)"></div>
      <div style="position:absolute;top:30px;left:0;right:0;border-top:1px dashed rgba(255,255,255,.06)"></div>
      <div style="position:absolute;top:45px;left:0;right:0;border-top:1px dashed rgba(255,255,255,.03)"></div>
    </div>`;
  });
  if(isToday) html+=`<div class="cal-now-line" style="top:${nowPx}px;height:2px"></div>`;
  // Timed events — with overnight cross-day support
  const dayLayout=_layoutEventColumns(timedEvs);
  timedEvs.forEach(e=>{
    const top=t2px(e.time);
    const w=_evResolveColor(calWorldById(normaliseType(e.type)),e);
    const colStyle=_colStyle(dayLayout,e);
    const isOvernight=e.endTime&&(()=>{const[sh,sm]=e.time.split(':').map(Number);const[eh,em]=e.endTime.split(':').map(Number);return eh*60+em<=sh*60+sm;})();
    if(isOvernight){
      // Block 1: start time → midnight (1440px mark)
      const h1=Math.max(1440-top,24);
      html+=`<div class="cal-event-block" style="top:${top}px;height:${h1}px;${colStyle}${calendarBlockStyle(w.hex)}" onclick="event.stopPropagation();showCalPopover(event,${e.id||0},'${e._expandedDate||e.date}')">
        <div class="ceb-title">${e.title}</div>
        <div class="ceb-time">${to12h(e.time)} → midnight ↓</div>
        ${e.loc?`<div class="ceb-time"><i class="ti ti-map-pin"></i> ${e.loc}</div>`:''}
      </div>`;
    } else {
      const bot=e.endTime?t2px(e.endTime):top+60;
      const h=Math.max(bot-top,24);
      const draggable=!e._recurring;
      html+=`<div class="cal-event-block" ${draggable?`draggable="true" ondragstart="calDragStart(event,${e.id||0},${e._taskId?e._taskId:'null'})" ondragend="calDragEnd(event)"`:''} style="top:${top}px;height:${h}px;${colStyle}${calendarBlockStyle(w.hex)}" onclick="event.stopPropagation();showCalPopover(event,${e.id||0},'${e._expandedDate||e.date}')">
        <div class="ceb-title">${e.title}</div>
        <div class="ceb-time">${to12h(e.time)}${e.endTime?' – '+to12h(e.endTime):''}</div>
        ${e.loc?`<div class="ceb-time"><i class="ti ti-map-pin"></i> ${e.loc}</div>`:''}
      </div>`;
    }
  });
  // Continuation blocks — events that started yesterday and continue into this day
  const prevDate=new Date(calSelectedDate);prevDate.setDate(prevDate.getDate()-1);
  const prevDateStr=localDateStr(prevDate);
  const prevExpanded=expandRecurring(DB.calEvents,prevDateStr,prevDateStr);
  prevExpanded.filter(e=>(e._expandedDate||e.date)===prevDateStr&&e.time&&e.endTime&&calContextFilter.has(normaliseType(e.type))).forEach(e=>{
    const[sh,sm]=e.time.split(':').map(Number);const[eh,em]=e.endTime.split(':').map(Number);
    if(eh*60+em>sh*60+sm)return;// not overnight
    const w=_evResolveColor(calWorldById(normaliseType(e.type)),e);
    const bot=t2px(e.endTime);const h=Math.max(bot,20);
    html+=`<div class="cal-event-block" style="top:0;height:${h}px;${calendarBlockStyle(w.hex,true)}" onclick="event.stopPropagation();showCalPopover(event,${e.id||0},'${e._expandedDate||e.date}')">
      <div class="ceb-title">↩ ${e.title}</div>
      <div class="ceb-time">cont. until ${to12h(e.endTime)}</div>
    </div>`;
  });
  html+='</div></div></div>';
  el.innerHTML=html;
  setTimeout(()=>{const b=el.querySelector('[style*="overflow-y:auto"]');if(b)b.scrollTop=8*60-20;},0);
}

// ── AGENDA view ──────────────────────────────────────────────────
function renderCalAgenda(){
  const el=document.getElementById('calMainArea');
  const today=new Date();
  const endDate=new Date(today);endDate.setMonth(endDate.getMonth()+3);
  const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const esc=value=>typeof escapeHtml==='function'?escapeHtml(String(value??'')):String(value??'');

  const allExpanded=expandRecurring(
    DB.calEvents,
    localDateStr(today),
    localDateStr(endDate)
  ).filter(e=>calContextFilter.has(normaliseType(e.type))||e._isTask)
   .sort((a,b)=>(a._expandedDate||a.date).localeCompare(b._expandedDate||b.date));

  if(!allExpanded.length){
    el.innerHTML='<div style="padding:32px;text-align:center;color:var(--text3);font-size:var(--text-sm)">No upcoming events for the next 3 months.</div>';
    return;
  }

  // Group by date — include overnight continuations
  const byDate={};
  allExpanded.forEach(e=>{
    const ds=e._expandedDate||e.date;
    if(!byDate[ds])byDate[ds]=[];
    // Mark overnight events
    if(e.time&&e.endTime){
      const[sh,sm]=e.time.split(':').map(Number);
      const[eh,em]=e.endTime.split(':').map(Number);
      if(eh*60+em<=sh*60+sm){
        e._overnight=true;
        // Inject continuation on next day
        const next=new Date(ds);next.setDate(next.getDate()+1);
        const nextStr=localDateStr(next);
        if(!byDate[nextStr])byDate[nextStr]=[];
        byDate[nextStr].push({...e,_continuation:true,_contFromDate:ds});
      }
    }
    byDate[ds].push(e);
  });

  const todayStr=localDateStr(today);
  let html='<div class="cal-agenda"><div class="cal-agenda-heading"><div><span>Upcoming schedule</span><strong>Agenda</strong></div><small>Next 3 months</small></div>';
  Object.keys(byDate).sort().forEach(ds=>{
    const d=new Date(ds);
    const isT=ds===todayStr;
    const dateEvents=byDate[ds];
    html+=`<section class="cal-agenda-group">
      <div class="cal-agenda-date${isT?' today-hdr':''}">
        <div class="adn">${d.getDate()}</div>
        <div class="cal-agenda-date-copy">
          <div class="adow">${isT?'Today · ':''}${DAYS[d.getDay()]}</div>
          <div>${MONTHS[d.getMonth()]} ${d.getFullYear()}</div>
        </div>
        <span class="cal-agenda-count">${dateEvents.length} ${dateEvents.length===1?'event':'events'}</span>
      </div>`;
    byDate[ds].sort((a,b)=>(a.time||'').localeCompare(b.time||'')).forEach(e=>{
      const w=_evResolveColor(calWorldById(normaliseType(e.type)),e);
      if(e._continuation){
        html+=`<div class="cal-agenda-event continuation" style="--event-color:${w.hex}" onclick="showCalPopover(event,${e.id||0},'${e._contFromDate||ds}')">
          <div class="ae-time"><strong>Continues</strong><span>until ${e.endTime?to12h(e.endTime):'—'}</span></div>
          <div class="ae-color"></div>
          <div class="ae-body">
            <div class="ae-title">${esc(e.title)} <span class="ae-recurring">continued</span></div>
            <div class="ae-sub">${esc(w.label)}${e.loc?' · '+esc(e.loc):''}</div>
          </div>
          <button class="ae-more" type="button" aria-label="Open event details" onclick="event.stopPropagation();showCalPopover(event,${e.id||0},'${e._contFromDate||ds}')"><i class="ti ti-dots"></i></button>
        </div>`;
      } else {
        const start=e.time?to12h(e.time):'All day';
        const end=e.time&&e.endTime?to12h(e.endTime):'';
        html+=`<div class="cal-agenda-event" style="--event-color:${w.hex}" onclick="showCalPopover(event,${e.id||0},'${ds}')">
          <div class="ae-time"><strong>${start}</strong>${end?`<span>${end}</span>`:''}</div>
          <div class="ae-color"></div>
          <div class="ae-body">
            <div class="ae-title">${e._isTask?'<i class="ti ti-list-check"></i>':''}${esc(e.title)}${e._recurring?'<span class="ae-recurring">Repeats</span>':''}${e._overnight?'<span class="ae-recurring">Overnight</span>':''}</div>
            <div class="ae-sub"><span>${esc(w.label)}</span>${e.loc?' · '+esc(e.loc):''}${e.notes?' · '+esc(e.notes.substring(0,72)):''}</div>
          </div>
          <button class="ae-more" type="button" aria-label="Open event details" onclick="event.stopPropagation();showCalPopover(event,${e.id||0},'${ds}')"><i class="ti ti-dots"></i></button>
        </div>`;
      }
    });
    html+='</section>';
  });
  html+='</div>';
  el.innerHTML=html;
}

// ── QUARTER view ─────────────────────────────────────────────────
function renderCalQuarter(){
  const el=document.getElementById('calMainArea');
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  // Start from calMonth, show 3 months
  const qMonths=[0,1,2].map(i=>{
    let m=calMonth+i,y=calYear;
    if(m>11){m-=12;y++;}
    return{m,y};
  });
  const today=localDateStr(new Date());
  const qFrom=localDateStr(new Date(qMonths[0].y,qMonths[0].m,1));
  const qTo=localDateStr(new Date(qMonths[2].y,qMonths[2].m+1,0));
  const qEvents=expandRecurring(DB.calEvents,qFrom,qTo);
  const MAX_CHIPS=3;

  let html='<div class="cal-quarter-grid">';
  qMonths.forEach(({m,y})=>{
    const first=new Date(y,m,1).getDay();
    const days=new Date(y,m+1,0).getDate();
    const prev=new Date(y,m,0).getDate();
    html+=`<div class="cal-quarter-month">
      <div class="cal-quarter-mh">${MONTHS[m]} ${y}</div>
      <div class="cal-quarter-mini">
        ${'SMTWTFS'.split('').map(d=>`<div style="font-size:var(--text-xs);text-align:center;color:var(--text3);font-weight:700;padding:2px">${d}</div>`).join('')}
        ${Array.from({length:first-1},(_,i)=>`<div class="cqd om">${prev-(first-2-i)}</div>`).join('')}
        ${Array.from({length:days},(_,i)=>{
          const d=i+1;
          const ds=y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
          const isT=ds===today;
          const dayEvents=qEvents.filter(e=>(e._expandedDate||e.date)===ds);
          const dayTasks=(DB.tasks||[]).filter(t=>t.due===ds);
          const items=[
            ...dayEvents.map(e=>({label:e.title,cls:''})),
            ...dayTasks.map(t=>({label:t.title,cls:'task'}))
          ];
          const shown=items.slice(0,MAX_CHIPS);
          const extra=items.length-shown.length;
          return`<div class="cqd${isT?' today':''}" onclick="calSelectedDate='${ds}';setCalView('day')" title="${ds}">
            <span class="cqd-num">${d}</span>
            ${shown.map(it=>`<span class="cqd-chip${it.cls?' '+it.cls:''}">${(it.label||'').replace(/</g,'&lt;')}</span>`).join('')}
            ${extra>0?`<span class="cqd-more">+${extra} more</span>`:''}
          </div>`;
        }).join('')}
      </div>
    </div>`;
  });
  html+='</div>';
  el.innerHTML=html;
}

// ── Toolbar title ────────────────────────────────────────────────
function updateCalTitle(){
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const el=document.getElementById('calToolbarTitle');
  if(!el)return;
  if(calView==='day'){
    const d=new Date(calSelectedDate);
    el.textContent=MONTHS[d.getMonth()]+' '+d.getDate()+', '+d.getFullYear();
  } else if(calView==='week'){
    const d=new Date(calSelectedDate);
    const dow=d.getDay();
    const ws=new Date(d);ws.setDate(d.getDate()-dow);
    const we=new Date(ws);we.setDate(ws.getDate()+6);
    el.textContent=MONTHS[ws.getMonth()]+' '+ws.getDate()+' – '+MONTHS[we.getMonth()]+' '+we.getDate()+' '+we.getFullYear();
  } else if(calView==='twoweek'){
    const d=new Date(calSelectedDate);
    const dow=d.getDay();
    const ws=new Date(d);ws.setDate(d.getDate()-dow);
    const we=new Date(ws);we.setDate(ws.getDate()+13);
    el.textContent=MONTHS[ws.getMonth()]+' '+ws.getDate()+' – '+MONTHS[we.getMonth()]+' '+we.getDate()+' '+we.getFullYear();
  } else if(calView==='quarter'){
    el.textContent='Q'+(Math.floor(calMonth/3)+1)+' '+calYear;
  } else {
    el.textContent=MONTHS[calMonth]+' '+calYear;
  }
}

// ── Main renderCalendar ──────────────────────────────────────────
function renderCalendar(){
  updateCalTitle();
  renderCalSidebar();
  if(calView==='month')       renderCalMonth();
  else if(calView==='week')   renderCalWeek();
  else if(calView==='twoweek')renderCalTwoWeek();
  else if(calView==='day')    renderCalDay();
  else if(calView==='agenda') renderCalAgenda();
  else if(calView==='quarter')renderCalQuarter();
}

// ── Popover ──────────────────────────────────────────────────────
function showCalPopover(ev,id,dateStr){
  ev.stopPropagation();
  const base=DB.calEvents.find(x=>x.id===id);
  if(!base)return;
  // Merge in this occurrence's exception (title/time/color override) so the
  // popover preview matches what's actually shown on the calendar grid,
  // not the series template underneath it.
  const e=(dateStr&&base.recur&&base.recur!=='none')?(_applyRecurException(base,dateStr)||base):base;
  const pop=document.getElementById('calPopover');
  const w=_evResolveColor(calWorldById(normaliseType(e.type)),e);
  document.getElementById('calPopoverContent').innerHTML=`
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <div style="width:12px;height:12px;border-radius:50%;background:${w.hex};flex-shrink:0"></div>
      <div class="cal-popover-title">${e.title}</div>
    </div>
    <div class="cal-popover-row"><i class="ti ti-calendar"></i>${dateStr||e.date}${e.time?' · '+to12h(e.time)+(e.endTime?' – '+to12h(e.endTime):''):''}</div>
    ${e.loc?`<div class="cal-popover-row"><i class="ti ti-map-pin"></i>${e.loc}</div>`:''}
    ${e.notes?`<div class="cal-popover-row"><i class="ti ti-notes"></i>${e.notes}</div>`:''}
    ${e.recur&&e.recur!=='none'?`<div class="cal-popover-row"><i class="ti ti-repeat"></i>Repeats ${e.recur}${e.recurEnd?' until '+e.recurEnd:''}</div>`:''}
    <div class="cal-popover-row"><i class="ti ti-tag"></i>${w.label}</div>`;
  document.getElementById('calPopTask').onclick=()=>{pop.classList.remove('open');quickAddTaskFromEvent(id,dateStr||e.date,e.title||'Calendar event');};
  document.getElementById('calPopEdit').onclick=()=>{pop.classList.remove('open');editCalEvent(id,dateStr);};
  document.getElementById('calPopDelete').onclick=()=>{pop.classList.remove('open');deleteCalEvent(id);};
  // Position
  pop.style.left=Math.min(ev.clientX+10,window.innerWidth-340)+'px';
  pop.style.top=Math.min(ev.clientY-10,window.innerHeight-260)+'px';
  pop.classList.add('open');
}
document.addEventListener('click',()=>document.getElementById('calPopover')?.classList.remove('open'));

// ── Edit / Delete ────────────────────────────────────────────────
function editCalEvent(id,occurrenceDate){
  const e=DB.calEvents.find(x=>x.id===id);if(!e)return;
  calEditingId=id;
  const isRecurringOccurrence=!!(occurrenceDate&&e.recur&&e.recur!=='none');
  calEditingOccurrenceDate=isRecurringOccurrence?occurrenceDate:null;
  document.getElementById('calModalTitle').textContent='Edit Event';
  // An existing "this event only" override for the clicked occurrence takes
  // priority over the series template when populating the form — editing
  // an already-customized occurrence again should show what's actually
  // there, not silently revert it to the template's values.
  const existingEx=isRecurringOccurrence?(e.recurExceptions||{})[occurrenceDate]:null;
  const v=existingEx?{...e,...existingEx}:e;
  document.getElementById('ce-title').value=v.title||'';
  document.getElementById('ce-date').value=isRecurringOccurrence?occurrenceDate:(e.date||'');
  // Pre-existing gap found while testing: these are <select> dropdowns
  // whose <option>s only ever got generated for the "new event" flow —
  // editing an existing event left them with zero options, so setting
  // .value here silently failed and any occurrence-time override would
  // have saved as blank. Regenerating on every edit-open fixes it for
  // both the old flow and the new "this occurrence" time-override case.
  build12hOptions('ce-time',v.time||'');
  build12hOptions('ce-end-time',v.endTime||'');
  _populateCeTypeCustomDomains();
  document.getElementById('ce-type').value=e.type||'lif';
  if(typeof refreshProjectSelect==='function')refreshProjectSelect('ce-project',_ceTypeToWorldId(e.type||'lif'),e.projectId);
  document.getElementById('ce-loc').value=v.loc||'';
  document.getElementById('ce-notes').value=v.notes||'';
  const rEl=document.getElementById('ce-recur');if(rEl)rEl.value=e.recur||'none';
  const reEl=document.getElementById('ce-recur-end');if(reEl)reEl.value=e.recurEnd||'';
  const alEl=document.getElementById('ce-allday');if(alEl)alEl.checked=!!v.allDay;
  const rmEl=document.getElementById('ce-reminder');if(rmEl)rmEl.checked=!!e.reminder;
  const cnEl=document.getElementById('ce-custom-n');if(cnEl)cnEl.value=e.recurN||'';
  const cuEl=document.getElementById('ce-custom-unit');if(cuEl)cuEl.value=e.recurUnit||'day';
  const recurDaysSet=new Set(Array.isArray(e.recurDays)?e.recurDays:[]);
  document.querySelectorAll('#ce-custom-days-wrap input[type="checkbox"]').forEach(c=>{c.checked=recurDaysSet.has(c.value);});
  const colorEl=document.getElementById('ce-color');if(colorEl)colorEl.value=v.color||'';
  toggleRecurOptions();
  _renderCeApplyToUI(isRecurringOccurrence,occurrenceDate);
  openModal('calModal');
}
// "Apply to:" choice — only meaningful when editing a specific occurrence
// of an existing recurring series (not a plain one-off event, and not
// when creating a brand-new event).
function _renderCeApplyToUI(show,occurrenceDate){
  const wrap=document.getElementById('ce-apply-to-wrap');
  if(!wrap)return;
  if(!show){wrap.style.display='none';return;}
  wrap.style.display='block';
  wrap.innerHTML=`
    <label class="fl">Apply to</label>
    <div style="display:flex;flex-direction:column;gap:4px;font-size:var(--text-sm);color:var(--text2)">
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="radio" name="ce-apply-to" value="this" checked style="width:auto;accent-color:var(--teal)"> This event only</label>
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="radio" name="ce-apply-to" value="following" style="width:auto;accent-color:var(--teal)"> This and following events</label>
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="radio" name="ce-apply-to" value="all" style="width:auto;accent-color:var(--teal)"> All events</label>
    </div>
    <button type="button" onclick="cancelSingleCalOccurrence()" style="margin-top:6px;background:transparent;border:1px solid var(--border2);border-radius:8px;color:var(--red);font-size:var(--text-xs);padding:4px 10px;cursor:pointer"><i class="ti ti-calendar-x"></i> Cancel just this occurrence</button>`;
}
async function cancelSingleCalOccurrence(){
  if(!calEditingId||!calEditingOccurrenceDate)return;
  const e=DB.calEvents.find(x=>x.id===calEditingId);if(!e)return;
  if(!await jelixConfirm('Cancel this one occurrence? The rest of the series stays.','Cancel Occurrence'))return;
  e.recurExceptions=e.recurExceptions||{};
  e.recurExceptions[calEditingOccurrenceDate]={cancelled:true};
  save('calEvents');
  SB.update('cal_events',e.id,{recurExceptions:e.recurExceptions},'calEvents').catch(()=>{});
  calEditingId=null;calEditingOccurrenceDate=null;
  closeModal('calModal');
  renderCalendar();
  showToast('✓ Occurrence cancelled');
}
async function deleteCalEvent(id){
  if(!await jelixConfirm('Delete this event?','Delete'))return;
  const event=DB.calEvents.find(item=>item.id===id);
  if(event)rememberSyncDeletion('cal_events',event);
  DB.calEvents=DB.calEvents.filter(e=>e.id!==id);
  SB.remove('cal_events',id,'calEvents');
  if(typeof _deleteItemLinksFor==='function')_deleteItemLinksFor('event',id);
  renderCalendar();showToast('Event deleted');
}

// ── Modal helpers ─────────────────────────────────────────────────
function toggleRecurOptions(){
  const v=document.getElementById('ce-recur')?.value;
  const endWrap=document.getElementById('ce-recur-end-wrap');
  const custWrap=document.getElementById('ce-custom-wrap');
  const daysWrap=document.getElementById('ce-custom-days-wrap');
  const custUnit=document.getElementById('ce-custom-unit');
  const custIntervalRow=document.getElementById('ce-custom-interval-row');
  if(endWrap)  endWrap.style.display=(v&&v!=='none')?'flex':'none';
  // "Weekly" and "Every 2 weeks" now get the day-picker directly (no need to go through Custom).
  // Custom still shows for anyone who wants a different day/week/month interval.
  const showCustomPanel=(v==='custom');
  const showDaysPicker=(v==='weekly'||v==='biweekly')||(v==='custom'&&custUnit&&custUnit.value==='week');
  if(custWrap) custWrap.style.display=showCustomPanel?'flex':'none';
  if(custIntervalRow) custIntervalRow.style.display=showCustomPanel?'flex':'none';
  if(daysWrap){
    daysWrap.style.display=showDaysPicker?'flex':'none';
    // Pre-select the day matching the event's start date so weekly/biweekly behaves
    // exactly as before if the user doesn't touch it — this is additive, not a breaking change.
    if((v==='weekly'||v==='biweekly')&&!daysWrap._prefilled){
      const dateEl=document.getElementById('ce-date');
      const anyChecked=[...daysWrap.querySelectorAll('input[type="checkbox"]')].some(c=>c.checked);
      if(dateEl&&dateEl.value&&!anyChecked){
        const dow=['SU','MO','TU','WE','TH','FR','SA'][new Date(dateEl.value+'T00:00:00').getDay()];
        const cb=daysWrap.querySelector(`input[value="${dow}"]`);
        if(cb)cb.checked=true;
      }
    }
  }
  if(custUnit&&!custUnit._patched){custUnit._patched=true;custUnit.addEventListener('change',()=>{if(daysWrap)daysWrap.style.display=(custUnit.value==='week'||v==='weekly'||v==='biweekly')?'flex':'none';});}
}
function syncEndDateMin(){
  const sd=document.getElementById('ce-date')?.value;
  const ed=document.getElementById('ce-end-date');
  if(sd&&ed){ed.min=sd;if(!ed.value||ed.value<sd)ed.value=sd;}
}
function checkOvernightFromDates(){
  const sd=document.getElementById('ce-date')?.value;
  const ed=document.getElementById('ce-end-date')?.value;
  const overnightCb=document.getElementById('ce-overnight');
  if(sd&&ed&&overnightCb) overnightCb.checked=ed>sd;
}
function toggleAllDay(){
  const isAllDay=document.getElementById('ce-allday')?.checked;
  const tf=document.getElementById('ce-time');
  const te=document.getElementById('ce-end-time');
  if(tf)tf.disabled=isAllDay;
  if(te)te.disabled=isAllDay;
}

// ── saveCalEvent (upgraded) ───────────────────────────────────────
function build12hOptions(selId,val){
  const sel=document.getElementById(selId);if(!sel)return;
  const opts=['<option value="">-- No time --</option>'];
  for(let h=0;h<24;h++){for(let m=0;m<60;m+=15){
    const hh=String(h).padStart(2,'0'),mm=String(m).padStart(2,'0');
    const ampm=h<12?'AM':'PM',h12=h===0?12:h>12?h-12:h;
    opts.push('<option value="'+hh+':'+mm+'">'+h12+':'+mm+' '+ampm+'</option>');
  }}
  sel.innerHTML=opts.join('');
  if(val)sel.value=val;
}
function toggleReminderInput(){
  const chk=document.getElementById('ce-reminder');
  const wrap=document.getElementById('ce-remind-wrap');
  if(wrap)wrap.style.display=(chk&&chk.checked)?'flex':'none';
}
function toggleCalEntryType(){}
function saveCalEvent(){
  const rawDate=document.getElementById('ce-date').value||selectedCalDate||localDateStr(new Date());
  const allDay=document.getElementById('ce-allday')?.checked||false;
  // Read times FIRST before using them
  const startTimeVal=allDay?'':document.getElementById('ce-time')?.value||'';
  const endTimeVal=allDay?'':document.getElementById('ce-end-time')?.value||'';
  // Read end date — if explicitly set use it, otherwise auto-detect overnight
  let endDate=document.getElementById('ce-end-date')?.value||rawDate;
  let overnight=document.getElementById('ce-overnight')?.checked||false;
  if(startTimeVal&&endTimeVal){
    const[sh,sm]=startTimeVal.split(':').map(Number);
    const[eh,em]=endTimeVal.split(':').map(Number);
    if(eh*60+em<=sh*60+sm){
      overnight=true;
      // Only auto-advance endDate if not manually set
      if(!document.getElementById('ce-end-date')?.value||endDate===rawDate){
        const d=new Date(rawDate+'T00:00:00');d.setDate(d.getDate()+1);
        endDate=localDateStr(d);
      }
    }
  }
  const remMin=parseInt(document.getElementById('ce-remind-min')?.value||30,10);
  const alsoTask=document.getElementById('ce-also-task')?.checked||false;
  const addMeet=document.getElementById('ce-add-meet')?.checked||false;
  const recurEndMode=document.querySelector('input[name="recur-end"]:checked')?.value||'never';
  const recurCount=recurEndMode==='after'?parseInt(document.getElementById('ce-recur-count')?.value||10,10):null;
  const e={
    id:calEditingId||Date.now(),
    title:document.getElementById('ce-title').value.trim()||'Event',
    date:rawDate,
    endDate:endDate!==rawDate?endDate:'',
    time:startTimeVal,endTime:endTimeVal,
    type:document.getElementById('ce-type').value||'lif',
    loc:document.getElementById('ce-loc').value.trim(),
    notes:document.getElementById('ce-notes')?.value.trim()||'',
    allDay,overnight,
    reminder:document.getElementById('ce-reminder')?.checked||false,
    remindMin:remMin,
    recur:document.getElementById('ce-recur')?.value||'none',
    recurEnd:recurEndMode==='on'?(document.getElementById('ce-recur-end')?.value||''):'',
    recurN:document.getElementById('ce-custom-n')?.value||'',
    recurUnit:document.getElementById('ce-custom-unit')?.value||'day',
    recurCount:recurCount,
    recurDays:Array.from(document.querySelectorAll('#ce-custom-days-wrap input[type="checkbox"]:checked')).map(c=>c.value),
    color:document.getElementById('ce-color')?.value||null,
    projectId:document.getElementById('ce-project')?.value||null,
    // Editing via "All events" (or a plain non-recurring save) rebuilds
    // this whole object from the form, which has no idea about exceptions
    // already accumulated on the series — carry them forward explicitly
    // so a routine edit doesn't silently wipe out prior per-occurrence
    // overrides/cancellations.
    recurExceptions:calEditingId?(DB.calEvents.find(x=>x.id===calEditingId)?.recurExceptions||{}):{},
  };
  const wasEdit=!!calEditingId;
  if(addMeet)_pendingMeetRequests.add(e.id);
  const applyTo=calEditingOccurrenceDate?(document.querySelector('input[name="ce-apply-to"]:checked')?.value||'this'):'all';
  if(applyTo==='this'&&calEditingOccurrenceDate){
    // "This event only" — write an override into the PARENT series'
    // recurExceptions; the series itself (pattern, other occurrences,
    // other exceptions) is untouched.
    const parent=DB.calEvents.find(x=>x.id===calEditingId);
    if(parent){
      parent.recurExceptions=parent.recurExceptions||{};
      parent.recurExceptions[calEditingOccurrenceDate]={title:e.title,time:e.time,endTime:e.endTime,loc:e.loc,notes:e.notes,allDay:e.allDay,color:e.color,cancelled:false};
      save('calEvents');
      SB.update('cal_events',parent.id,{recurExceptions:parent.recurExceptions},'calEvents').catch(()=>{});
    }
  } else if(applyTo==='following'&&calEditingOccurrenceDate){
    // "This and following" — cap the original series the day before this
    // occurrence, then spawn a new series starting here with whatever the
    // form now shows (fields and/or recurrence pattern may have changed).
    const parent=DB.calEvents.find(x=>x.id===calEditingId);
    if(parent){
      const dayBefore=new Date(calEditingOccurrenceDate+'T00:00:00');dayBefore.setDate(dayBefore.getDate()-1);
      parent.recurEnd=localDateStr(dayBefore);
      save('calEvents');
      SB.update('cal_events',parent.id,{recurEnd:parent.recurEnd},'calEvents').catch(()=>{});
    }
    const newSeries={...e,id:Date.now(),date:calEditingOccurrenceDate,recurExceptions:{}};
    DB.calEvents.push(newSeries);
    SB.upsert('cal_events',newSeries,'calEvents').catch(()=>{});
  } else if(calEditingId){
    const i=DB.calEvents.findIndex(x=>x.id===calEditingId);
    if(i>=0)DB.calEvents[i]=e;
    SB.update('cal_events',e.id,e,'calEvents');
  } else {
    DB.calEvents.push(e);
    SB.upsert('cal_events',e,'calEvents');
  }
  if(alsoTask&&!calEditingId){
    const t={id:Date.now()+2,title:e.title,world:e.type==='cs'?'WORK-CS':e.type==='ih'?'WORK-IH':'LIFE',priority:'Medium',status:'Todo',due:rawDate,endDate:endDate!==rawDate?endDate:'',platform:'',client:'',notes:e.notes,startTime:startTimeVal,endTime:endTimeVal,groupId:null,subitems:[],timelineS:'',timelineE:'',numValue:null,connBoard:null,connItemId:null,sourceEventId:e.id};
    DB.tasks.unshift(t);SB.upsert('tasks',t,'tasks');
    addHistory('add','Added task from event: '+t.title,{...t,_dbKey:'tasks'});
  }
  const conflicts=detectConflicts(e.date,e.time,e.endTime,e.id);
  if(conflicts.length)showToast('⚠ Time conflict with: '+conflicts.map(c=>c.title).join(', '),4000);
  if(e.reminder&&'Notification' in window&&Notification.permission==='default')Notification.requestPermission();
  calEditingId=null;calEditingOccurrenceDate=null;
  _renderCeApplyToUI(false);
  ['ce-title','ce-loc','ce-notes'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const recurEl=document.getElementById('ce-recur');if(recurEl)recurEl.value='none';
  document.querySelectorAll('#ce-custom-days-wrap input[type="checkbox"]').forEach(c=>c.checked=false);
  const custUnitEl=document.getElementById('ce-custom-unit');if(custUnitEl)custUnitEl.value='week';
  const custNEl=document.getElementById('ce-custom-n');if(custNEl)custNEl.value='1';
  ['ce-overnight','ce-also-task','ce-reminder','ce-add-meet'].forEach(id=>{const el=document.getElementById(id);if(el)el.checked=false;});
  toggleReminderInput();toggleRecurOptions();
  closeModal('calModal');
  addHistory(wasEdit?'edit':'add',(wasEdit?'Edited event: ':'Added event: ')+e.title+(alsoTask?' + task':''),{...e,_dbKey:'calEvents'});
  renderCalendar();renderBrief();
  if(currentView&&(DB.worlds||[]).some(w=>w.id===currentView))renderDomainGenericView(currentView);
  showToast('✓ Event saved'+(alsoTask?' + Task created':'')+(conflicts.length?' (check conflicts)':''));
}

function openCalEventModal(){openCalEventModalOnDate(calSelectedDate||localDateStr(new Date()));}
// Calendar events use short internal codes (ih/cs/ven/...) for built-in
// Domains, or the real DB.worlds id directly for custom ones (see
// _populateCeTypeCustomDomains) — neither matches the uppercase worldId
// convention tasks/notes/Projects use (WORK-IH, VENTURE, ...) directly.
// This bridges the two so the event modal's Project picker filters by
// the same worldId a Project is actually scoped to.
function _ceTypeToWorldId(typeVal){
  const slug=CAL_TO_DOMAIN_ID[typeVal];
  return slug?slug.toUpperCase():typeVal;
}
function _populateCeTypeCustomDomains(){
  const sel=document.getElementById('ce-type');if(!sel)return;
  const builtinIds=new Set(CAL_WORLDS.map(w=>w.id));
  [...sel.options].forEach(o=>{if(o.dataset.custom)o.remove();});
  (DB.worlds||[]).filter(w=>!builtinIds.has(w.id)).forEach(w=>{
    const o=document.createElement('option');o.value=w.id;o.textContent=w.label;o.dataset.custom='1';
    sel.appendChild(o);
  });
}
function openCalEventModalOnDate(date){
  calEditingId=null;calEditingOccurrenceDate=null;
  _renderCeApplyToUI(false);
  const colorResetEl=document.getElementById('ce-color');if(colorResetEl)colorResetEl.value='';
  selectedCalDate=date;
  _populateCeTypeCustomDomains();
  const typeEl=document.getElementById('ce-type');
  if(typeof refreshProjectSelect==='function')refreshProjectSelect('ce-project',_ceTypeToWorldId(typeEl?typeEl.value:'lif'),'');
  document.getElementById('calModalTitle').textContent='Add Event';
  document.getElementById('ce-date').value=date;
  const edEl=document.getElementById('ce-end-date');if(edEl){edEl.value=date;edEl.min=date;}
  build12hOptions('ce-time','');
  build12hOptions('ce-end-time','');
  ['ce-title','ce-loc','ce-notes'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const rEl=document.getElementById('ce-recur');if(rEl)rEl.value='none';
  document.querySelectorAll('#ce-custom-days-wrap input[type="checkbox"]').forEach(c=>c.checked=false);
  const cuResetEl=document.getElementById('ce-custom-unit');if(cuResetEl)cuResetEl.value='week';
  const cnResetEl=document.getElementById('ce-custom-n');if(cnResetEl)cnResetEl.value='1';
  ['ce-allday','ce-overnight','ce-also-task','ce-reminder','ce-add-meet'].forEach(id=>{const el=document.getElementById(id);if(el)el.checked=false;});
  const reEl=document.getElementById('ce-recur-end');if(reEl)reEl.value='';
  const rmMinEl=document.getElementById('ce-remind-min');if(rmMinEl)rmMinEl.value=30;
  toggleReminderInput();
  toggleRecurOptions();
  openModal('calModal');
}
// [duplicate saveCalEvent removed]

// NOTES — callout grid
let noteBlocks=[],currentNote=0;
let notesActiveFolder='all';
function renderNotesFolderRail(){
  const rail=document.getElementById('notesFolderRail');if(!rail)return;
  const worlds=DB.worlds||[];
  const countFor=(wid)=>wid==='all'?DB.notes.length:wid==='unfiled'?DB.notes.filter(n=>!n.worldId).length:DB.notes.filter(n=>n.worldId===wid).length;
  const item=(id,label,icon,color)=>`<div onclick="setNotesFolder('${id}')" style="display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:12px;cursor:pointer;font-size:var(--text-sm);color:${notesActiveFolder===id?'var(--teal)':'var(--text2)'};background:${notesActiveFolder===id?'rgba(128,255,250,.08)':'transparent'};margin-bottom:3px" onmouseover="if('${notesActiveFolder}'!=='${id}')this.style.background='var(--hover-tint)'" onmouseout="if('${notesActiveFolder}'!=='${id}')this.style.background='transparent'">
    <i class="ti ${icon}" style="font-size:15px;color:${color||'inherit'};flex-shrink:0"></i>
    <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${label}</span>
    <span style="font-size:var(--text-xs);color:var(--text3)">${countFor(id)}</span>
  </div>`;
  // Below 768px the rail becomes a horizontal scroll strip (see CSS) instead
  // of a vertical sidebar — a divider line and a "Domains" section label
  // both read as stray vertical slivers in a horizontal pill row, so they're
  // left out there rather than fighting the layout with more CSS overrides.
  const isMobileRail=window.innerWidth<=768;
  let html=item('all','All Notes','ti-notes');
  html+=item('unfiled','Unfiled','ti-file-off');
  if(!isMobileRail){
    html+='<div style="height:1px;background:var(--border);margin:12px 6px"></div>';
    html+='<div style="font-size:var(--text-xs);font-weight:700;color:var(--text3);letter-spacing:.08em;text-transform:uppercase;padding:4px 10px 8px">Domains</div>';
  }
  html+=worlds.map(w=>{
    const color=(w.color&&/^#/.test(w.color))?w.color:'var(--teal)';
    return `<div style="position:relative;display:flex;align-items:center;group" class="notes-folder-row">${item(w.id,w.label,w.icon||'ti-folder',color)}<button onclick="event.stopPropagation();openWorldModal('${w.id}')" title="Edit folder name" style="position:absolute;right:32px;top:9px;background:transparent;border:none;color:var(--text3);cursor:pointer;padding:2px;opacity:0" class="notes-folder-edit"><i class="ti ti-pencil" style="font-size:12px;line-height:1;display:block"></i></button></div>`;
  }).join('');
  html+=`<div onclick="openWorldModal()" style="display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:12px;cursor:pointer;font-size:var(--text-sm);color:var(--text3);margin-top:8px" onmouseover="this.style.color='var(--teal)'" onmouseout="this.style.color='var(--text3)'"><i class="ti ti-plus" style="font-size:15px"></i>Add Domain</div>`;
  rail.innerHTML=html;
  rail.querySelectorAll('.notes-folder-row').forEach(row=>{
    row.addEventListener('mouseenter',()=>{const b=row.querySelector('.notes-folder-edit');if(b)b.style.opacity='1';});
    row.addEventListener('mouseleave',()=>{const b=row.querySelector('.notes-folder-edit');if(b)b.style.opacity='0';});
  });
}
function setNotesFolder(id){notesActiveFolder=id;renderNotesFolderRail();renderNotesList();}
function renderNotesList(){
  const grid=document.getElementById('notesCalloutGrid');if(!grid)return;
  renderNotesFolderRail();
  const filtered=notesActiveFolder==='all'?DB.notes:notesActiveFolder==='unfiled'?DB.notes.filter(n=>!n.worldId):DB.notes.filter(n=>n.worldId===notesActiveFolder);
  if(!filtered.length){grid.innerHTML='<div style="font-size:var(--text-xs);color:var(--text3)">No notes here yet. Click "New Note" to start.</div>';return;}
  grid.innerHTML=filtered.map((n)=>{
    const i=DB.notes.findIndex(x=>x.id===n.id);
    const h1=n.blocks.find(b=>b.type==='h1');
    const h2=n.blocks.find(b=>b.type==='h2');
    const preview=n.blocks.filter(b=>b.type==='p'||b.type==='bullet').map(b=>b.content).filter(Boolean).join(' ').substring(0,80);
    const todos=n.blocks.filter(b=>b.type==='todo');
    const done=todos.filter(b=>b.done).length;
    const world=(DB.worlds||[]).find(w=>w.id===n.worldId);
    return`<div style="background:var(--navy2);border:1px solid var(--border);border-radius:12px;overflow:hidden;cursor:pointer;transition:border-color .15s" onclick="openNoteEditor(${i})" onmouseover="this.style.borderColor='var(--teal2)'" onmouseout="this.style.borderColor='var(--border)'">
      <div style="background:linear-gradient(135deg,var(--teal3),var(--teal4));padding:12px 14px;border-bottom:1px solid var(--teal2)">
        <div style="font-size:var(--text-sm);font-weight:700;color:var(--teal);line-height:1.3">${n.title}</div>
        ${h1&&h1.content?`<div style="font-size:var(--text-sm);color:var(--teal2);margin-top:3px;font-weight:600">${h1.content}</div>`:''}
        ${h2&&h2.content?`<div style="font-size:var(--text-xs);color:var(--text3);margin-top:2px">${h2.content}</div>`:''}
      </div>
      <div style="padding:10px 14px">
        ${preview?`<div style="font-size:var(--text-sm);color:var(--text2);line-height:1.5;margin-bottom:8px">${preview}${preview.length>=80?'…':''}</div>`:''}
        ${todos.length?`<div style="display:flex;align-items:center;gap:6px;font-size:var(--text-xs);color:var(--text3);margin-bottom:6px"><i class="ti ti-checklist" style="font-size:var(--text-xs);line-height:1;display:block;color:var(--teal)"></i>${done}/${todos.length} tasks done</div>`:''}
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px">
          <span style="font-size:9px;color:var(--text3);display:flex;align-items:center;gap:4px">${world?`<i class="ti ${world.icon||'ti-folder'}" style="font-size:10px;color:${(world.color&&/^#/.test(world.color))?world.color:'var(--teal)'}"></i>${world.label}`:'Unfiled'}</span>
          <button class="btn btn-d" style="padding:2px 7px;font-size:var(--text-xs)" onclick="event.stopPropagation();deleteNote(${i})"><i class="ti ti-trash" style="font-size:var(--text-xs);line-height:1;display:block"></i></button>
        </div>
      </div>
    </div>`;
  }).join('');
}
function setNoteFolder(worldId){
  const n=DB.notes[currentNote];if(!n)return;
  n.worldId=worldId||null;
  // The note's old Project (if any) almost certainly doesn't belong to
  // the new Domain — a Project never crosses Domains, so carry it
  // forward only if it does, otherwise clear it rather than leave a
  // dangling reference to a Project in a different Domain.
  if(n.projectId&&!(DB.projects||[]).some(p=>p.id===n.projectId&&p.worldId===worldId)){
    n.projectId=null;
  }
  save('notes');
  SB.update('notes',n.id,{worldId:n.worldId,projectId:n.projectId},'notes').catch(()=>{});
  if(typeof refreshProjectSelect==='function')refreshProjectSelect('note-project',worldId,n.projectId);
  renderNotesList();
  showToast(worldId?'✓ Moved to folder':'✓ Marked unfiled');
}
async function setNoteProject(projectIdOrNew){
  const n=DB.notes[currentNote];if(!n)return;
  if(projectIdOrNew==='__new__'){
    const p=await createProjectFlow(n.worldId);
    if(typeof refreshProjectSelect==='function')refreshProjectSelect('note-project',n.worldId,p?p.id:'');
    if(!p)return;
    projectIdOrNew=p.id;
  }
  n.projectId=projectIdOrNew||null;
  save('notes');
  SB.update('notes',n.id,{projectId:n.projectId},'notes').catch(()=>{});
}
function openNoteEditor(i){currentNote=i;noteBlocks=[...DB.notes[currentNote].blocks];const t=document.getElementById('noteTitle');if(t)t.textContent=DB.notes[currentNote].title;const tm=document.getElementById('notesEditToggleMount');if(tm)tm.innerHTML=_editToggleButtonHtml();renderBlocks();populateNoteFolderSelect();const n=DB.notes[currentNote];if(typeof refreshProjectSelect==='function')refreshProjectSelect('note-project',n.worldId,n.projectId);const rc=document.getElementById('note-related');if(rc&&typeof renderRelatedSection==='function')rc.innerHTML=renderRelatedSection('note',DB.notes[currentNote].id);const tgc=document.getElementById('note-tags');if(tgc&&typeof renderTagsSection==='function')tgc.innerHTML=renderTagsSection('note',DB.notes[currentNote].id);openModal('noteEditorModal');}
function populateNoteFolderSelect(){
  const sel=document.getElementById('noteFolderSelect');if(!sel)return;
  const n=DB.notes[currentNote];
  sel.innerHTML='<option value="">Unfiled</option>'+(DB.worlds||[]).map(w=>`<option value="${w.id}">${w.label}</option>`).join('');
  sel.value=n?.worldId||'';
}
function newNote(){const assignWorld=notesActiveFolder!=='all'&&notesActiveFolder!=='unfiled'?notesActiveFolder:null;const n={id:Date.now(),title:'New Note',worldId:assignWorld,blocks:[{id:Date.now()+'.1',type:'h1',content:'',done:false},{id:Date.now()+'.2',type:'p',content:'',done:false}]};DB.notes.push(n);save('notes');SB.upsert('notes',n,'notes').catch(()=>{});addHistory('add','Added note: '+n.title,{...n,_dbKey:'notes'});currentNote=DB.notes.length-1;renderNotesList();openNoteEditor(currentNote);}
function switchNote(){openNoteEditor(currentNote);}

async function deleteNote(i){if(!await jelixConfirm('Delete this note?','Delete'))return;const n=DB.notes[i];DB.notes.splice(i,1);save('notes');if(n){SB.remove('notes',n.id,'notes');if(typeof _deleteItemLinksFor==='function')_deleteItemLinksFor('note',n.id);addHistory('delete','Deleted note: '+(n.title||'Untitled note'),{...n,_dbKey:'notes'});}currentNote=Math.max(0,currentNote-1);renderNotesList();}
async function deleteCurrentNote(){closeModal('noteEditorModal');await deleteNote(currentNote);}
function saveNoteTitle(){if(DB.notes[currentNote]){DB.notes[currentNote].title=document.getElementById('noteTitle').textContent;save('notes');SB.update('notes',DB.notes[currentNote].id,DB.notes[currentNote],'notes').catch(()=>{});renderNotesList();}}
