import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const chromePath=process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
const mime={'.css':'text/css','.html':'text/html','.ico':'image/x-icon','.js':'text/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp'};

assert.ok(existsSync(chromePath),`Chrome was not found at ${chromePath}.`);

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

async function profile({name,width,height,mobile,cpuRate,latency,downloadThroughput}){
  const debugPort=appPort+(name==='desktop'?1:2);
  const profileDir=mkdtempSync(path.join(tmpdir(),`jobsystems-${name}-`));
  const chrome=spawn(chromePath,[
    `--remote-debugging-port=${debugPort}`,'--remote-allow-origins=*','--headless=new','--disable-gpu',
    '--no-first-run','--no-default-browser-check',`--user-data-dir=${profileDir}`,'about:blank'
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
    const resources=new Map();
    const consoleErrors=[];
    socket.onmessage=event=>{
      const message=JSON.parse(event.data);
      if(message.method==='Network.responseReceived')resources.set(message.params.requestId,{url:message.params.response.url,type:message.params.type,status:message.params.response.status,encoded:0});
      if(message.method==='Network.loadingFinished'&&resources.has(message.params.requestId))resources.get(message.params.requestId).encoded=message.params.encodedDataLength||0;
      if(message.method==='Runtime.consoleAPICalled'&&message.params.type==='error')consoleErrors.push(message.params.args.map(arg=>arg.value||arg.description||'').join(' '));
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
    await Promise.all([send('Page.enable'),send('Runtime.enable'),send('Network.enable'),send('Performance.enable')]);
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile,screenWidth:width,screenHeight:height});
    if(cpuRate>1)await send('Emulation.setCPUThrottlingRate',{rate:cpuRate});
    if(latency)await send('Network.emulateNetworkConditions',{offline:false,latency,downloadThroughput,uploadThroughput:downloadThroughput});
    await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__startupLongTasks=[];new PerformanceObserver(list=>{for(const entry of list.getEntries())window.__startupLongTasks.push({start:entry.startTime,duration:entry.duration});}).observe({type:'longtask',buffered:true});`});
    await send('Page.navigate',{url:`http://127.0.0.1:${appPort}/index.html?startup-profile=${name}`});
    for(let attempt=0;attempt<200;attempt+=1){
      if(await evaluate(`document.readyState==='complete'`))break;
      await sleep(50);
    }
    await sleep(1500);
    const timing=await evaluate(`(()=>{const nav=performance.getEntriesByType('navigation')[0];const paint=Object.fromEntries(performance.getEntriesByType('paint').map(entry=>[entry.name,entry.startTime]));return{domContentLoaded:nav.domContentLoadedEventEnd,load:nav.loadEventEnd,firstPaint:paint['first-paint']||0,firstContentfulPaint:paint['first-contentful-paint']||0,longTasks:window.__startupLongTasks||[],scripts:[...document.scripts].filter(script=>script.src).map(script=>new URL(script.src).pathname),styles:[...document.querySelectorAll('link[rel="stylesheet"]')].map(link=>new URL(link.href).pathname)}})()`);
    const metrics=Object.fromEntries((await send('Performance.getMetrics')).metrics.map(item=>[item.name,item.value]));
    const loaded=[...resources.values()].filter(resource=>resource.status<400);
    const byType=type=>loaded.filter(resource=>resource.type===type).reduce((sum,resource)=>sum+resource.encoded,0);
    return{
      profile:name,
      timingMs:{domContentLoaded:Math.round(timing.domContentLoaded),load:Math.round(timing.load),firstContentfulPaint:Math.round(timing.firstContentfulPaint)},
      mainThreadMs:Math.round((metrics.TaskDuration||0)*1000),
      scriptExecutionMs:Math.round((metrics.ScriptDuration||0)*1000),
      longTasks:{count:timing.longTasks.length,totalMs:Math.round(timing.longTasks.reduce((sum,task)=>sum+task.duration,0))},
      resources:{requests:loaded.length,totalKb:Math.round(loaded.reduce((sum,resource)=>sum+resource.encoded,0)/1024),scriptKb:Math.round(byType('Script')/1024),styleKb:Math.round(byType('Stylesheet')/1024),scripts:timing.scripts.length,styles:timing.styles.length},
      consoleErrors
    };
  }finally{
    if(socket?.readyState===WebSocket.OPEN)socket.close();
    chrome.kill('SIGTERM');
    await sleep(200);
    try{rmSync(profileDir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}catch{}
  }
}

try{
  const results=[];
  results.push(await profile({name:'desktop',width:1440,height:900,mobile:false,cpuRate:1,latency:0,downloadThroughput:-1}));
  results.push(await profile({name:'mobile',width:390,height:844,mobile:true,cpuRate:4,latency:80,downloadThroughput:1_600_000}));
  console.log(JSON.stringify(results,null,2));
}finally{
  server.close();
}
