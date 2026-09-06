import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const chromePath=process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const takeScreenshots=process.argv.includes('--screenshots');
const sleep=(milliseconds)=>new Promise(resolve=>setTimeout(resolve,milliseconds));
const mime={'.css':'text/css','.html':'text/html','.ico':'image/x-icon','.js':'text/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp'};

assert.ok(existsSync(chromePath),`Chrome was not found at ${chromePath}. Set CHROME_PATH to run the render smoke test.`);

const server=createServer((request,response)=>{
  const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
  const relative=pathname==='/'?'index.html':pathname.replace(/^\/+/, '');
  const file=path.resolve(root,relative);
  if(!file.startsWith(root+path.sep)||!existsSync(file)||!statSync(file).isFile()){
    response.writeHead(404);response.end('Not found');return;
  }
  response.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
  response.end(readFileSync(file));
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const appPort=server.address().port;
const debugPort=appPort+1;
const profile=mkdtempSync(path.join(tmpdir(),'jobsystems-render-'));
const chrome=spawn(chromePath,[
  `--remote-debugging-port=${debugPort}`,'--remote-allow-origins=*','--headless=new','--disable-gpu','--hide-scrollbars',
  '--no-first-run','--no-default-browser-check',`--user-data-dir=${profile}`,'about:blank'
],{stdio:'ignore'});

let socket;
try{
  let targets;
  for(let attempt=0;attempt<100;attempt+=1){
    try{targets=await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();if(targets.length)break;}catch{}
    await sleep(100);
  }
  assert.ok(targets?.length,'Chrome DevTools did not become ready.');
  socket=new WebSocket(targets.find(target=>target.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let requestId=0;
  const pending=new Map();
  socket.onmessage=event=>{
    const message=JSON.parse(event.data);
    const request=message.id&&pending.get(message.id);
    if(!request)return;
    pending.delete(message.id);
    message.error?request.reject(new Error(message.error.message)):request.resolve(message.result);
  };
  const send=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++requestId;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));
  });
  const evaluate=async expression=>{
    const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(result.exceptionDetails)throw new Error(result.result.description||result.exceptionDetails.text);
    return result.result.value;
  };
  const viewport=async (width,height,mobile)=>send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile,screenWidth:width,screenHeight:height});
  const openApp=async()=>{
    await send('Page.navigate',{url:`http://127.0.0.1:${appPort}/index.html?render-smoke=1`});
    await sleep(2600);
    assert.match(await evaluate('document.title'),/J\.O\.B Systems/);
    assert.equal(await evaluate("!!document.querySelector('label[for=\"auth-email\"]')&&!!document.querySelector('label[for=\"auth-password\"]')"),true,'sign-in fields need associated labels');
    await evaluate(`(()=>{['authScreen','bootScreen','lockScreen'].forEach(id=>{const element=document.getElementById(id);if(element)element.style.display='none'});const app=document.getElementById('appRoot');if(app){app.style.display='grid';app.style.opacity='1';app.style.pointerEvents=''}document.body.classList.add('os-active');try{reRenderAll()}catch(error){}return true})()`);
  };
  const views=[
    ['tasks',"setView('tasks')"],
    ['today',"setView('dashboard')"],
    ['health',"setView('life');lifeSetSection('health')"],
    ['training',"setView('life');lifeSetSection('fitness')"],
    ['calendar',"setView('calendar')"],
    ['review',"setView('review')"]
  ];
  const inspectMobile=()=>evaluate(`(()=>{const active=document.querySelector('.view.active');if(!active)throw new Error('No active view');const visible=element=>{const style=getComputedStyle(element);return element.getClientRects().length&&style.visibility!=='hidden'&&style.opacity!=='0'&&!element.closest('.mov:not(.open),[hidden]')};const intentionallyIconOnly=element=>element.matches('.dashboard-customize-trigger,.agency-timer-toggle')&&parseFloat(getComputedStyle(element).fontSize)===0;const tiny=[...active.querySelectorAll('small,p,label,button,span,strong,b,em')].filter(element=>visible(element)&&!intentionallyIconOnly(element)&&(element.textContent||'').trim()&&parseFloat(getComputedStyle(element).fontSize)<12).map(element=>(element.textContent||'').replace(/\\s+/g,' ').trim().slice(0,50));const shortControls=[...active.querySelectorAll('button,[role=button]')].filter(element=>visible(element)&&element.getBoundingClientRect().height<43).map(element=>{const style=getComputedStyle(element);return{name:(element.getAttribute('aria-label')||element.textContent||'control').replace(/\\s+/g,' ').trim().slice(0,50),className:element.className,height:Math.round(element.getBoundingClientRect().height),minHeight:style.minHeight,maxHeight:style.maxHeight,transform:style.transform,onclick:element.getAttribute('onclick'),parent:element.parentElement?.id||element.parentElement?.className}});const nav=document.querySelector('#mobileBottomNav .mbn-bar').getBoundingClientRect();return{overflow:document.documentElement.scrollWidth-innerWidth,navBottom:Math.round(nav.bottom),tiny,shortControls}})()`);
  const inspectTinyText=()=>evaluate(`(()=>{const active=document.querySelector('.view.active');const visible=element=>{const style=getComputedStyle(element);return element.getClientRects().length&&style.visibility!=='hidden'&&style.opacity!=='0'&&!element.closest('.mov:not(.open),[hidden]')};return[...active.querySelectorAll('small,p,label,button,span,strong,b,em')].filter(element=>visible(element)&&(element.textContent||'').trim()&&parseFloat(getComputedStyle(element).fontSize)>0&&parseFloat(getComputedStyle(element).fontSize)<12).map(element=>({text:(element.textContent||'').replace(/\\s+/g,' ').trim().slice(0,42),className:element.className,size:getComputedStyle(element).fontSize,parent:element.parentElement?.className,control:element.closest('button')?.className})).slice(0,40)})()`);

  await send('Page.enable');await send('Runtime.enable');
  await viewport(390,844,true);
  await send('Emulation.setScriptExecutionDisabled',{value:true});
  await send('Page.navigate',{url:`http://127.0.0.1:${appPort}/index.html?render-smoke=no-js`});
  await sleep(500);
  assert.equal(await evaluate("!!document.querySelector('.noscript-message')?.getClientRects().length"),true,'the no-JavaScript recovery message must be visible');
  await send('Emulation.setScriptExecutionDisabled',{value:false});
  await openApp();
  assert.equal(await evaluate(`document.documentElement.dataset.theme`),'dark','a fresh install must open in dark mode');
  const themeSwitch=await evaluate(`toggleTheme({currentTarget:document.getElementById('navThemeToggleBtn')}).then(()=>({theme:document.documentElement.dataset.theme,icon:document.getElementById('navThemeToggleIcon').dataset.theme,label:document.getElementById('navThemeToggleBtn').getAttribute('aria-label'),userSet:localStorage.getItem('j-theme-user-set')}))`);
  assert.deepEqual(themeSwitch,{theme:'light',icon:'light',label:'Switch to dark mode',userSet:'true'},'the animated toggle must update its theme, icon, accessible label, and saved preference');
  await evaluate(`applyTheme('dark')`);
  assert.equal(await evaluate(`(()=>{const elements=[...document.querySelectorAll('[onclick]:not(button):not(a):not(input):not(select):not(textarea):not(summary)')];return elements.every(element=>element.getAttribute('role')==='button'&&element.tabIndex===0)})()`),true,'non-native click targets need keyboard semantics');
  const accessibleNames=await evaluate(`(()=>{const text=element=>(element.getAttribute('aria-label')||element.getAttribute('aria-labelledby')||(element.textContent||'').trim());return{fields:[...document.querySelectorAll('input:not([type="hidden"]),select,textarea')].filter(field=>!field.getAttribute('aria-label')&&!field.getAttribute('aria-labelledby')&&!(field.labels&&field.labels.length)).length,buttons:[...document.querySelectorAll('button,[role="button"]')].filter(element=>!text(element)).length,dialogs:[...document.querySelectorAll('.mov')].filter(modal=>modal.getAttribute('role')!=='dialog'||modal.getAttribute('aria-modal')!=='true'||!modal.getAttribute('aria-labelledby')).map(modal=>modal.id||modal.className)}})()`);
  assert.deepEqual(accessibleNames,{fields:0,buttons:0,dialogs:[]},`interactive controls and dialogs need accessible names: ${JSON.stringify(accessibleNames)}`);
  const pinSecurity=await evaluate(`setSystemPin('4826').then(async()=>{const record=JSON.parse(localStorage.getItem('j-sys-pin-hash'));const valid=await verifySystemPin('4826');const rejected=await verifySystemPin('0000');localStorage.removeItem('j-sys-pin-hash');return{version:record.version,iterations:record.iterations,plaintext:localStorage.getItem('j-sys-pin'),valid,rejected}})`);
  assert.deepEqual(pinSecurity,{version:2,iterations:150000,plaintext:null,valid:true,rejected:false},'the device PIN must be slow-hashed, verifiable, and absent from plaintext storage');
  if(takeScreenshots)mkdirSync(path.join(root,'output/playwright'),{recursive:true});
  for(const [name,action] of views){
    await evaluate(action);await sleep(550);
    await evaluate(`document.querySelectorAll('#tstack .titem').forEach(item=>item.remove())`);
    const result=await inspectMobile();
    assert.equal(result.overflow,0,`${name} overflows the phone viewport by ${result.overflow}px`);
    assert.ok(result.navBottom>=840&&result.navBottom<=844,`${name} bottom navigation is not aligned to the viewport edge`);
    assert.deepEqual(result.tiny,[],`${name} contains visible text below 12px: ${result.tiny.join(', ')}`);
    assert.deepEqual(result.shortControls,[],`${name} contains touch controls below 43px: ${JSON.stringify(result.shortControls)}`);
    if(takeScreenshots){
      const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      writeFileSync(path.join(root,`output/playwright/smoke-mobile-${name}.png`),Buffer.from(screenshot.data,'base64'));
    }
  }

  await evaluate(`document.documentElement.dataset.theme='light'`);
  for(const [name,action] of views){
    await evaluate(action);await sleep(200);
    const result=await inspectMobile();
    assert.equal(result.overflow,0,`${name} overflows the phone viewport in light mode`);
    assert.deepEqual(result.tiny,[],`${name} contains text below 12px in light mode: ${result.tiny.join(', ')}`);
    assert.deepEqual(result.shortControls,[],`${name} contains undersized touch controls in light mode: ${JSON.stringify(result.shortControls)}`);
    if(takeScreenshots){
      const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      writeFileSync(path.join(root,`output/playwright/smoke-mobile-light-${name}.png`),Buffer.from(screenshot.data,'base64'));
    }
  }
  const lightContrast=await evaluate(`(()=>{const rgb=value=>(value.match(/\\d+(?:\\.\\d+)?/g)||[]).slice(0,3).map(Number);const luminance=value=>{const channels=rgb(value).map(channel=>{channel/=255;return channel<=.04045?channel/12.92:Math.pow((channel+.055)/1.055,2.4)});return .2126*channels[0]+.7152*channels[1]+.0722*channels[2]};const ratio=(foreground,background)=>{const a=luminance(foreground),b=luminance(background);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)};const pair=(text,card)=>ratio(getComputedStyle(document.querySelector(text)).color,getComputedStyle(document.querySelector(card)).backgroundColor);return{health:pair('#cf-biomonitor .health-game-header h2','#cf-biomonitor .health-game-header'),training:pair('#view-life .fitness-title h1','#view-life .fitness-overview')}})()`);
  assert.ok(lightContrast.health>=4.5&&lightContrast.training>=4.5,`dark feature cards need readable text in light mode: ${JSON.stringify(lightContrast)}`);
  await evaluate(`document.documentElement.dataset.theme='dark';setView('tasks');document.querySelector('.task-page-add')?.focus();openModal('taskModal')`);
  await sleep(100);
  assert.equal(await evaluate(`(()=>{const modal=document.getElementById('taskModal');return modal.classList.contains('open')&&modal.getAttribute('role')==='dialog'&&modal.contains(document.activeElement)&&!document.getElementById('taskMoreDetails').open})()`),true,'the quick-task dialog must be labelled, focused, and progressive');
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await sleep(100);
  assert.equal(await evaluate(`!document.getElementById('taskModal').classList.contains('open')`),true,'Escape must close the active dialog');

  await send('Network.enable');
  assert.equal(await evaluate(`navigator.serviceWorker.ready.then(()=>true)`),true,'the service worker must install');
  await evaluate(`new Promise(resolve=>{if(navigator.serviceWorker.controller)return resolve(true);navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(true),{once:true});setTimeout(()=>resolve(false),5000)})`);
  await send('Page.navigate',{url:`http://127.0.0.1:${appPort}/index.html?render-smoke=offline-client`});await sleep(1800);
  const workerState=await evaluate(`navigator.serviceWorker.getRegistrations().then(registrations=>({controlled:!!navigator.serviceWorker.controller,href:location.href,registrations:registrations.map(registration=>({scope:registration.scope,active:registration.active?.state,waiting:registration.waiting?.state,installing:registration.installing?.state}))}))`);
  assert.equal(workerState.controlled,true,`the installed app must be controlled by its service worker: ${JSON.stringify(workerState)}`);
  await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await send('Page.reload',{ignoreCache:true});
  let offlineState={title:'',ready:false};
  for(let attempt=0;attempt<50;attempt+=1){
    await sleep(100);
    offlineState=await evaluate(`({title:document.title,ready:!!document.querySelector('label[for="auth-email"]')})`);
    if(/J\.O\.B Systems/.test(offlineState.title)&&offlineState.ready)break;
  }
  assert.match(offlineState.title,/J\.O\.B Systems/,'the installed app shell must reopen offline');
  assert.equal(offlineState.ready,true,'the offline shell must finish initializing and remain usable');
  await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});

  await viewport(1440,900,false);await send('Page.reload',{ignoreCache:true});await sleep(2400);
  await evaluate(`(()=>{['authScreen','bootScreen','lockScreen'].forEach(id=>{const element=document.getElementById(id);if(element)element.style.display='none'});const app=document.getElementById('appRoot');if(app){app.style.display='grid';app.style.opacity='1';app.style.pointerEvents=''}document.body.classList.add('os-active');return true})()`);
  for(const [name,action] of views){
    await evaluate(action);await sleep(250);
    assert.equal(await evaluate('document.documentElement.scrollWidth-innerWidth'),0,`${name} overflows the desktop viewport`);
    const tinyText=await inspectTinyText();
    assert.deepEqual(tinyText,[],`${name} contains desktop text below 12px: ${JSON.stringify(tinyText)}`);
    if(takeScreenshots){
      const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      writeFileSync(path.join(root,`output/playwright/smoke-desktop-${name}.png`),Buffer.from(screenshot.data,'base64'));
    }
  }
  console.log(`PASS: ${views.length} core views pass dark/light phone layout, keyboard-dialog, no-JavaScript, offline-shell, and desktop overflow checks.`);
}finally{
  if(socket?.readyState===WebSocket.OPEN)socket.close();
  chrome.kill('SIGTERM');
  server.close();
  await sleep(250);
  rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:150});
}
