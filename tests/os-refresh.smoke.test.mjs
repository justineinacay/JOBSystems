import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = name => readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('all changed application scripts parse as JavaScript',()=>{
  for(const name of ['os-refresh-2026.js','jobsystems-os-2026.js','app-part-01.js','app-part-05.js','sw.js']){
    assert.doesNotThrow(()=>new vm.Script(read(name),{filename:name}),name);
  }
});

test('main HTML and installable worker include command center assets',()=>{
  const html=read('index.html'),worker=read('sw.js');
  for(const asset of ['os-refresh-2026.js?v=20261011-1','os-refresh-2026.css?v=20261013-1']){
    assert.ok(html.includes(asset),'HTML must load '+asset);
    assert.ok(worker.includes(asset),'worker must precache '+asset);
  }
  assert.ok(worker.includes("jobsystems-v54"),'cache version should rotate for deployments');
});

test('Supabase API GETs always bypass cache and never substitute HTML',()=>{
  const sw=read('sw.js');
  assert.match(sw,/NETWORK_FIRST_HOSTS\.some\(\(host\).*url\.hostname === host/s);
  assert.match(sw,/event\.respondWith\(fetch\(request\)\);\s*return;/);
  assert.doesNotMatch(sw,/cached \|\| caches\.match\('\.\/index\.html'\)/);
});

test('transfer balances account for source and destination',()=>{
  const finance=read('app-part-05.js');
  const func=finance.match(/function getAccountBalance\(account\)\{[\s\S]*?^\}/m);
  assert.ok(func,'balance calculation should exist');
  const context={
    DB:{accounts:[{name:'Account A',startingBalance:100},{name:'Account B',startingBalance:0}],
      cashflow:[{type:'Transfer',amount:30,account:'Account A',from_account:'Account A',to_account:'Account B'}]},
    isLifeExpenseTransaction:()=>false
  };
  vm.runInNewContext(func[0],context);
  assert.equal(context.getAccountBalance('Account A'),70);
  assert.equal(context.getAccountBalance('Account B'),30);
  assert.equal(context.getAccountBalance('Account A')+context.getAccountBalance('Account B'),100);
});

test('sync saves transfer endpoint fields and surfaces failures',()=>{
  const core=read('app-part-01.js');
  assert.match(core,/r\.from_account=row\._fromAccount/);
  assert.match(core,/r\.to_account=row\._toAccount/);
  assert.match(core,/window\.JOBSystemsSyncFailures=\[\]/);
  assert.match(core,/window\.JOBSystemsSyncWarnings=\[\]/);
  assert.match(core,/Sync needs attention/);
});

test('navigation and dashboard controls use existing modules',()=>{
  const os=read('jobsystems-os-2026.js'),refresh=read('os-refresh-2026.js');
  for(const id of ['osMbnToday','osMbnTasks','osMbnCalendar','osMbnMore','osMbnQuickAdd'])assert.ok(os.includes(id),id);
  for(const action of ['new-task','new-event','new-note','expense','jelix','customize'])assert.ok(refresh.includes(action),action);
  assert.match(refresh,/getTotalPortfolioBalance/);
  assert.match(refresh,/data-osr-view/);
  assert.match(refresh,/data-osr-task/);
  assert.match(refresh,/has an unknown destination/);
});

test('workspace presentation no longer resets custom colors on boot',()=>{
  const os=read('jobsystems-os-2026.js');
  assert.doesNotMatch(os,/if\(w\.color!==spec\.color\)\{w\.color=spec\.color/);
});

test('responsive design includes accessible dialogs and mobile safe area',()=>{
  const css=read('os-refresh-2026.css');
  const js=read('os-refresh-2026.js');
  assert.match(css,/@media\(max-width:768px\)/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.match(css,/:focus-visible/);
  assert.match(js,/state\.dialog\.showModal\(\)/);
  assert.match(js,/aria-label="Quick add"/);
  assert.match(css,/#lockScreen\{background:#151615!important;color:#f4f4f1!important\}/,'the PIN screen must keep readable contrast before optional styles load');
});
