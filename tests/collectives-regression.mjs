import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('index.html');
const js=read('collectives-command-center.js');
const css=read('collectives-command-center.css');

assert.doesNotThrow(()=>new Function(js),'Collectives command center must parse as classic JavaScript');
assert.match(html,/id="view-collectives"/,'Our Collectives must have a first-class application view');
assert.match(html,/<h1>Our Collectives<\/h1>/,'The executive workspace must use the approved name');
assert.match(html,/our-collectives\.png" alt="Our Collectives logo"/,'the command-center header must use the supplied Collectives logo');
assert.doesNotMatch(html,/data-view="portfolio"|>Portfolio<\/span>/,'Portfolio must not be introduced as an Essentials destination');
assert.match(js,/DB\.venture/,'Job Collectives data must come from the existing store');
assert.match(js,/DB\.buildApps/,'Code owned products must come from the existing store');
assert.match(js,/DB\.pipeline/,'Code client development must remain distinct from owned products');
assert.match(js,/CODE_OWNED_PRODUCTS=\['naknak','pallo','diskarte','pasahero','dingo','melo','jobsystems'\]/,'known Code products must be reconciled without creating demo records');
assert.match(js,/DB\.creativeProjects/,'Creative client projects must come from the existing store');
assert.match(js,/DB\.tasks/,'cross-workspace progress must reuse shared tasks');
assert.match(js,/'justsigned':'Owned brand'/,'known Creative ownership must be represented without inventing records');
assert.match(js,/'dulce and banana':'External \/ family'/,'external Creative work must stay distinct from owned brands');
assert.doesNotMatch(js,/Total Ventures[^\n]*12|Active Projects[^\n]*18|Tasks[^\n]*24/,'reference screenshot totals must never be hard-coded');
assert.match(css,/@media\(max-width:768px\)/,'the command center must include a mobile layout');
assert.match(css,/html\[data-theme="light"\] #view-collectives/,'the command center must support light mode');
assert.match(css,/@media\(prefers-reduced-motion:reduce\)/,'the command center must honor reduced-motion preferences');

console.log('PASS: Our Collectives data reuse, classification, responsive layout, and no-demo-data checks verified.');
