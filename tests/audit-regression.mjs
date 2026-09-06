import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('index.html');
const sw=read('sw.js');
const api=read('app-part-01.js');
const security=read('app-part-02.js');

assert.match(api,/sbFetch\('history','POST',\{\.\.\.e,user_id:uid\}\)/,'history rows must include their authenticated owner');
assert.doesNotMatch(security,/j-sys-pin'\)\|\|'0000'/,'the device lock must not use a public default PIN');
assert.match(security,/SYSTEM_PIN_HASH_KEY='j-sys-pin-hash'/,'device PINs must use the hashed storage path');
assert.doesNotMatch(security,/localStorage\.setItem\('j-sys-pin',p\)/,'device PINs must not be stored as readable text');
assert.match(security,/name:'PBKDF2',hash:'SHA-256'/,'device PIN hashing must use a slow browser-native key derivation');
assert.match(security,/const iterations=150000/,'device PIN hashing must resist inexpensive offline guesses');
assert.match(html,/<main class="main" id="mainContent"/,'the primary content needs a main landmark');
assert.match(html,/<nav class="side-panel"[^>]+aria-label="Primary navigation"/,'desktop navigation needs a landmark');
assert.match(html,/<details class="task-more-details"/,'task capture must keep secondary fields behind progressive disclosure');
assert.match(html,/accessibility-hardening\.js\?v=20260905-1/,'accessibility runtime must be loaded');
assert.match(html,/audit-hardening\.css\?v=20260905-1/,'readability styles must be loaded');
assert.match(html,/<noscript>[\s\S]*J\.O\.B Systems needs JavaScript/,'a disabled-JavaScript launch must explain how to recover');
assert.doesNotMatch(html,/class="ni[^\"]*"[^>]*title=/,'collapsed navigation must not expose hover-only text labels');

const shellMatch=sw.match(/const APP_SHELL = \[([\s\S]*?)\];/);
assert.ok(shellMatch,'service worker app shell must be declared');
const entries=[...shellMatch[1].matchAll(/'([^']+)'/g)].map((match)=>match[1]);
for(const entry of entries){
  const pathname=entry.split('?')[0].replace(/^\.\//,'');
  if(!pathname)continue;
  assert.ok(fs.existsSync(path.join(root,pathname)),`cached app-shell file is missing: ${pathname}`);
}

for(const required of ['assets/workspace-logos/faith.png','assets/workspace-logos/personal.png','icons/icon-192.png','icons/icon-512.png']){
  assert.ok(entries.some((entry)=>entry.split('?')[0].replace(/^\.\//,'')===required),`${required} must be available offline`);
}
assert.match(sw,/const EXTERNAL_SHELL = \[[\s\S]*chart\.umd\.min\.js/,'the installed shell must pre-cache its chart runtime');
assert.match(sw,/Promise\.allSettled\([\s\S]*EXTERNAL_SHELL/,'third-party presentation assets must be cached without blocking installation');

const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map((match)=>match[1]);
assert.equal(new Set(ids).size,ids.length,'HTML IDs must be unique');

console.log(`PASS: ${entries.length} app-shell assets exist; sync, security, landmarks, progressive disclosure, and cache coverage verified.`);
