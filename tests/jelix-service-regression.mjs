import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = name => readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('J.E.L.I.X. does not retry exhausted provider credits',()=>{
  const edge=read('supabase/functions/job-ai/index.ts');
  const client=read('app-part-01.js');
  assert.match(edge,/providerCreditsUnavailable/);
  assert.match(edge,/AI_PROVIDER_CREDITS_UNAVAILABLE/);
  assert.match(edge,/!providerCreditsUnavailable\(error\).*\[429, 500, 502, 503, 504\]/s);
  assert.match(client,/data\?\.retryable===true&&\[429,502,503,504\]/);
  assert.doesNotMatch(client,/if\(\[429,502,503,504\]\.includes\(res\.status\)\)/);
});

test('local continuity explains account failure without calling it temporary',()=>{
  const client=read('app-part-01.js');
  assert.match(client,/serviceError==='AI_PROVIDER_CREDITS_UNAVAILABLE'/);
  assert.match(client,/secure AI account needs attention/);
  assert.match(client,/request_id:result\.request_id/);
});

test('voice bar makes idle microphone state explicit and clears mobile navigation',()=>{
  const html=read('index.html'),voice=read('app-part-07.js'),css=read('app-shell-01.css');
  assert.match(html,/id="vOrb"[^>]+aria-label="Start voice capture"[^>]+aria-pressed="false"/);
  assert.match(html,/Mic off · Press Space to talk/);
  assert.match(voice,/aria-pressed.*state==='listening'/);
  assert.match(css,/@media\(max-width:768px\)[\s\S]*bottom:calc\(82px \+ env\(safe-area-inset-bottom,0px\)\)/);
});

test('updated J.E.L.I.X. assets are cache-busted together',()=>{
  const html=read('index.html'),worker=read('sw.js');
  for(const asset of ['app-shell-01.css?v=20261011-1','app-part-01.js?v=20261011-1','app-part-07.js?v=20261011-1']){
    assert.ok(html.includes(asset),asset+' must load in HTML');
    assert.ok(worker.includes(asset),asset+' must be precached');
  }
  assert.match(worker,/jobsystems-v52/);
  assert.doesNotThrow(()=>new vm.Script(read('app-part-01.js')));
  assert.doesNotThrow(()=>new vm.Script(read('app-part-07.js')));
});
