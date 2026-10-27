function debounce(fn,ms){
  let t=null;
  return function(...args){clearTimeout(t);t=setTimeout(()=>fn.apply(this,args),ms||1000);};
}

function localDateStr(d){
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
  return y+'-'+m+'-'+day;
}

// Keep the shell and Today experience eager. Heavier workspace presentation
// layers are fetched only when that workspace is opened; base renderers stay
// available while an enhancement loads.
const _featureAssetPromises=new Map();
function loadFeatureStylesheet(href){
  const absolute=new URL(href,location.href).href;
  if([...document.styleSheets].some(sheet=>sheet.href===absolute))return Promise.resolve();
  if(_featureAssetPromises.has(absolute))return _featureAssetPromises.get(absolute);
  const promise=new Promise(resolve=>{
    const link=document.createElement('link');
    link.rel='stylesheet';link.href=href;link.onload=resolve;link.onerror=resolve;
    document.head.appendChild(link);
  });
  _featureAssetPromises.set(absolute,promise);
  return promise;
}
function loadFeatureScript(src){
  const absolute=new URL(src,location.href).href;
  if([...document.scripts].some(script=>script.src===absolute))return Promise.resolve();
  if(_featureAssetPromises.has(absolute))return _featureAssetPromises.get(absolute);
  const promise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    const timer=setTimeout(()=>reject(new Error('Timed out loading '+src)),8000);
    script.src=src;script.async=true;
    script.onload=()=>{clearTimeout(timer);resolve();};
    script.onerror=()=>{clearTimeout(timer);reject(new Error('Could not load '+src));};
    document.body.appendChild(script);
  });
  _featureAssetPromises.set(absolute,promise);
  return promise;
}
function scheduleIdleWork(callback,timeout=1500){
  if('requestIdleCallback' in window)return requestIdleCallback(callback,{timeout});
  return setTimeout(callback,Math.min(timeout,500));
}
const _viewAssetGroups={
  collectives:{styles:['collectives-command-center.css?v=20261026-1'],scripts:['collectives-command-center.js?v=20261026-1']},
  venture:{styles:['app-job-command-center.css?v=20260827-1']},
  build:{styles:['agency-command-centers.css?v=20260823-1'],scripts:['agency-command-centers.js?v=20260823-1']},
  sides:{styles:['agency-command-centers.css?v=20260823-1'],scripts:['agency-command-centers.js?v=20260823-1']},
  faith:{styles:['faith-command-center.css?v=20260824-2'],scripts:['faith-command-center.js?v=20260824-2']},
  life:{
    styles:['life-command-center.css?v=20260903-1','fitness-command-center.css?v=20260904-2','health-game-dashboard.css?v=20260904-5'],
    scripts:['life-command-center.js?v=20260905-1','fitness-command-center.js?v=20260902-1','health-game-dashboard.js?v=20260905-1']
  },
  ai:{styles:['app-jelix-01.css?v=20260827-1','app-jelix-02.css?v=20260827-1']}
};
function ensureViewAssets(view){
  const group=_viewAssetGroups[view];
  if(!group)return Promise.resolve();
  const key='view:'+view;
  if(_featureAssetPromises.has(key))return _featureAssetPromises.get(key);
  const scripts=(group.scripts||[]).reduce((chain,src)=>chain.then(()=>loadFeatureScript(src)),Promise.resolve());
  const promise=Promise.all([...(group.styles||[]).map(loadFeatureStylesheet),scripts])
    .catch(error=>console.warn('[JOBSystems] Optional view assets unavailable',view,error));
  _featureAssetPromises.set(key,promise);
  return promise;
}
function ensureChartJs(){
  if(typeof window.Chart!=='undefined')return Promise.resolve(window.Chart);
  return loadFeatureScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js').then(()=>window.Chart);
}
