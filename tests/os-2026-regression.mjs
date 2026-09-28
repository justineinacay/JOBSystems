import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');

const html=read('index.html');
const css=read('jobsystems-os-2026.css');
const js=read('jobsystems-os-2026.js');
const sw=read('sw.js');
const manifest=JSON.parse(read('manifest.json'));

assert.doesNotThrow(()=>new Function(js),'JOBSystems OS runtime must parse as classic JavaScript');
assert.doesNotThrow(()=>new Function(sw),'service worker must parse as classic JavaScript');
assert.match(html,/jobsystems-os-2026\.css\?v=20260929-2/,'OS stylesheet must load after the legacy product styles');
assert.match(html,/jobsystems-os-2026\.js\?v=20260929-1/,'OS runtime must load after the legacy product scripts');
assert.equal(manifest.name,'JOBSystems');
assert.equal(manifest.short_name,'JOBSystems');
assert.equal(manifest.display,'standalone');
assert.equal(manifest.theme_color,'#080B0A');
assert.match(sw,/jobsystems-v48/,'service worker cache must be bumped for the hardening release');
assert.match(sw,/jobsystems-os-2026\.css\?v=20260929-2/,'service worker must cache OS CSS');
assert.match(sw,/jobsystems-os-2026\.js\?v=20260929-1/,'service worker must cache OS JS');
assert.match(js,/view-projects/,'Projects must be a first-class global view');
assert.match(js,/view-knowledge/,'Knowledge must be a first-class global view');
assert.match(js,/function osRenderFinance\(/,'Finance must render from live JOBSystems data');
assert.match(js,/osMbnToday/);
assert.match(js,/osMbnTasks/);
assert.match(js,/osMbnCalendar/);
assert.match(js,/osMbnProjects/);
assert.match(js,/osMbnMore/);
assert.match(css,/--os-lime:#A6FF00/,'JOBSystems lime token must be defined');
assert.match(css,/@media\(max-width:767px\)/,'mobile layout must have a dedicated breakpoint');
assert.match(css,/env\(safe-area-inset-bottom\)/,'installed iOS PWA must respect the bottom safe area');
assert.doesNotMatch(html,/J\.O\.B Systems/,'visible application shell should use JOBSystems branding');
assert.doesNotMatch(sw,/J\.O\.B Systems/,'notifications should use JOBSystems branding');
assert.doesNotMatch(read('jelix-auto-scheduler.js'),/J\.O\.B Systems/,'install prompts should use JOBSystems branding');
assert.doesNotMatch(read('productivity-command-center.js'),/J\.O\.B Systems/,'calendar sync messaging should use JOBSystems branding');
assert.doesNotMatch(html,/\\n<link|\\n<script/,'final assets must not be separated by literal escaped newline text');
assert.match(html,/jelix-auto-scheduler\.js\?v=20260929-2/,'install prompt changes must use a new asset version');
assert.match(html,/productivity-command-center\.js\?v=20260929-2/,'calendar branding changes must use a new asset version');

console.log('PASS: JOBSystems Personal Operating System shell, global views, branding, responsive navigation, and PWA cache checks verified.');
