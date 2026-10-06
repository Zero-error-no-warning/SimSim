import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.SIMSIM_PLAYWRIGHT ?? 'playwright');
const root=path.resolve(process.env.SIMSIM_WEB_ROOT??fileURLToPath(new URL('..',import.meta.url))),folder=fs.mkdtempSync(path.join(os.tmpdir(),'simsim-browser-'));
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://local').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)){res.statusCode=403;res.end();return;}
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:");
  res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'text/plain');
  try{res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try {
  browser=await chromium.launch({headless:true,...(process.env.SIMSIM_BROWSER_EXECUTABLE?{executablePath:process.env.SIMSIM_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.waitForSelector('#boot[hidden]',{state:'attached'});
  assert(await page.locator('#play').isDisabled());
  assert.equal(await page.locator('#actions-open').count(),0);
  await page.waitForFunction(()=>document.getElementById('mission-status').textContent.includes('未計算'));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight));
  // Tasks open in the selected assignment context; graph authoring is a separate tab.
  await page.locator('.unit-item[data-id="patrol-uuv__1"]').click();
  await page.locator('#unit-task-open').click();
  assert.equal(await page.locator('#assignment-list').inputValue(),'island-watch');
  assert(await page.locator('#graph-editor').isHidden());
  await page.locator('#graph-edit-tab').click();
  await page.locator('[data-node="patrol"] > rect:first-child').click();
  assert(await page.locator('#edge-condition').isHidden());
  assert.equal(await page.locator('#trigger-kind').count(),0);
  assert.equal(await page.locator('.behavior-toolbar #node-kind,.behavior-toolbar #edge-condition').count(),0);
  assert.equal(await page.locator('#node-entry').count(),0);
  assert.equal(await page.locator('#behavior-canvas [data-trigger]').count(),0);
  assert.equal(await page.locator('#behavior-canvas [data-port]').count(),0);
  assert(await page.locator('#node-initial').isChecked());
  assert.equal(await page.locator('#behavior-canvas .initial-label').textContent(),'初期状態');
  assert.equal(await page.locator('#trigger-policy').count(),0);
  const viewport=()=>page.locator('#behavior-canvas').evaluate(el=>el.getAttribute('viewBox').split(' ').map(Number));
  const worldAt=(x,y)=>page.locator('#behavior-canvas').evaluate((el,{x,y})=>{
    const p=el.createSVGPoint();p.x=x;p.y=y;const q=p.matrixTransform(el.getScreenCTM().inverse());return {x:q.x,y:q.y};
  },{x,y});
  const canvas=await page.locator('#behavior-canvas').boundingBox(),cx=Math.round(canvas.x+canvas.width*.35),cy=Math.round(canvas.y+canvas.height*.45);
  const beforeZoom=await viewport(),anchor=await worldAt(cx,cy);
  await page.mouse.move(cx,cy);await page.mouse.wheel(0,-250);
  await page.waitForFunction(w=>Number(document.getElementById('behavior-canvas').getAttribute('viewBox').split(' ')[2])<w,beforeZoom[2]);
  const afterZoom=await viewport(),anchorAfter=await worldAt(cx,cy);
  assert(afterZoom[2]<beforeZoom[2]);assert(Math.abs(anchor.x-anchorAfter.x)<.01,JSON.stringify({canvas,cx,cy,beforeZoom,afterZoom,anchor,anchorAfter}));assert(Math.abs(anchor.y-anchorAfter.y)<.01);
  // Background pan and minimap move both change the viewport, not the stored node coordinates.
  const beforePan=await viewport();
  await page.mouse.move(canvas.x+15,canvas.y+15);await page.mouse.down();await page.mouse.move(canvas.x+65,canvas.y+45);await page.mouse.up();
  assert.notDeepEqual(await viewport(),beforePan);
  await page.locator('#behavior-fit').click();
  assert(await page.locator('#behavior-canvas').evaluate(el=>{
    const [x,y,w,h]=el.getAttribute('viewBox').split(' ').map(Number);
    return [...el.querySelectorAll('.behavior-node > rect:first-child')].every(n=>Number(n.getAttribute('x'))>=x&&Number(n.getAttribute('y'))>=y&&Number(n.getAttribute('x'))+210<=x+w&&Number(n.getAttribute('y'))+72<=y+h);
  }));
  const mini=await page.locator('#behavior-minimap').boundingBox(),beforeMini=await viewport();
  await page.mouse.move(mini.x+mini.width*.75,mini.y+mini.height*.5);await page.mouse.down();await page.mouse.move(mini.x+mini.width*.7,mini.y+mini.height*.6);await page.mouse.up();
  assert.notDeepEqual(await viewport(),beforeMini);assert.equal(await page.locator('#behavior-minimap .minimap-viewport').count(),1);
  await page.locator('#behavior-fit').click();
  // Drag a processing node after zoom: saved SVG coordinates follow the pointer scale.
  const rect=page.locator('#behavior-canvas [data-node="patrol"] > rect:first-child'),old=await rect.evaluate(el=>({x:Number(el.getAttribute('x')),y:Number(el.getAttribute('y'))})),box=await rect.boundingBox();
  const start={x:Math.round(box.x+box.width*.5),y:Math.round(box.y+box.height*.5)},wp=await worldAt(start.x,start.y),wq=await worldAt(start.x+35,start.y+20);
  await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+35,start.y+20);await page.mouse.up();
  const moved=await rect.evaluate(el=>({x:Number(el.getAttribute('x')),y:Number(el.getAttribute('y'))}));
  assert(Math.abs(moved.x-old.x-(wq.x-wp.x))<.01);assert(Math.abs(moved.y-old.y-(wq.y-wp.y))<.01);
  const addNode=async id=>{await page.locator('#graph-add-menu summary').click();await page.locator('#'+id).click();};
  await addNode('node-add');
  const temporaryWait=await page.locator('#behavior-canvas .behavior-node.selected').getAttribute('data-node');
  assert.equal(await page.locator('#node-kind').inputValue(),'');
  assert((await page.locator('#behavior-canvas .behavior-node.selected').textContent()).includes('未設定'));
  await page.locator('#behavior-apply').click();
  assert(await page.locator('#behavior-dialog').isVisible());
  assert((await page.locator('#behavior-validation').innerText()).includes('未設定の状態'));
  await page.locator('#node-kind').selectOption('wait');
  await page.locator('#node-initial').check();
  assert.equal(await page.locator('#behavior-canvas .initial-node').getAttribute('data-node'),temporaryWait);
  await page.locator('#behavior-undo').click();
  assert.equal(await page.locator('#behavior-canvas .initial-node').getAttribute('data-node'),'patrol');
  await page.locator('#behavior-redo').click();
  assert(await page.locator('#node-initial').isChecked());
  await page.locator('#behavior-undo').click();
  assert.equal(await page.locator('#node-value').inputValue(),'300');
  await page.locator('#behavior-fit').click();
  const connect=async(from,to)=>{
    await page.locator('#graph-connect').click();
    await page.locator('#behavior-canvas [data-node="'+from+'"] > rect:first-child').click();
    await page.locator('#behavior-canvas [data-node="'+to+'"] > rect:first-child').click();
  };
  const clickLine=async index=>{
    const hit=page.locator('#behavior-canvas [data-edge="'+index+'"] .behavior-edge-hit');
    await hit.scrollIntoViewIfNeeded();
    const point=await hit.evaluate(el=>{
      const p=el.getPointAtLength(el.getTotalLength()/2),q=el.ownerSVGElement.createSVGPoint();q.x=p.x;q.y=p.y;
      const screen=q.matrixTransform(el.getScreenCTM());return {x:screen.x,y:screen.y};
    });
    await page.mouse.click(point.x,point.y);
  };
  // A line exists before a condition is chosen. Clicking its body selects it.
  await connect('patrol',temporaryWait);
  assert(await page.locator('#edge-properties').isVisible());assert.equal(await page.locator('#edge-condition').inputValue(),'');
  assert((await page.locator('#behavior-canvas [data-edge="0"]').textContent()).includes('条件を設定'));
  await page.locator('#behavior-apply').click();assert((await page.locator('#behavior-validation').innerText()).includes('遷移条件が未設定'));
  await page.locator('#edge-condition').selectOption('detected');
  await page.locator('#behavior-canvas [data-node="patrol"] > rect:first-child').click();assert(await page.locator('#edge-condition').isHidden());
  await clickLine(0);assert.equal(await page.locator('#edge-condition').inputValue(),'detected');
  assert.equal(await page.locator('#behavior-canvas [data-edge]').count(),1);
  await page.locator('#edge-condition').selectOption('received');await page.locator('#behavior-undo').click();
  assert.equal(await page.locator('#edge-condition').inputValue(),'detected');
  await page.locator('#behavior-redo').click();assert.equal(await page.locator('#edge-condition').inputValue(),'received');
  // Another wire preserves the first branch and only offers unused conditions.
  await connect('patrol',temporaryWait);
  assert.equal(await page.locator('#behavior-canvas [data-edge]').count(),2);
  assert(await page.locator('#edge-condition option[value="received"]').evaluate(el=>el.disabled),JSON.stringify(await page.evaluate(()=>({labels:[...document.querySelectorAll('#behavior-canvas [data-edge]')].map(e=>e.textContent),options:[...document.getElementById('edge-condition').options].map(o=>({value:o.value,disabled:o.disabled})),summary:document.getElementById('edge-summary').textContent}))));
  await page.locator('#edge-condition').selectOption('detected');
  await clickLine(0);assert.equal(await page.locator('#edge-condition').inputValue(),'received');
  await clickLine(1);assert.equal(await page.locator('#edge-condition').inputValue(),'detected');
  await page.locator('#graph-connect').click();await page.locator('#behavior-canvas [data-node="patrol"] > rect:first-child').click();
  await page.keyboard.press('Escape');assert(await page.locator('#behavior-dialog').isVisible());
  assert.equal(await page.locator('#graph-connect').getAttribute('aria-pressed'),'false');
  await connect(temporaryWait,temporaryWait);await page.locator('#edge-condition').selectOption('elapsed');
  assert.equal(await page.locator('#behavior-canvas [data-edge]').count(),3);
  await clickLine(2);assert.equal(await page.locator('#edge-condition').inputValue(),'elapsed');await page.locator('#behavior-canvas').focus();await page.keyboard.press('Delete');
  await connect(temporaryWait,'patrol');await page.locator('#edge-condition').selectOption('elapsed');
  // Changing a state retains connections, but incompatible conditions need editing.
  await page.locator('#behavior-canvas [data-node="'+temporaryWait+'"] > rect:first-child').click();
  await page.locator('#node-kind').selectOption('report');
  assert.equal(await page.locator('#behavior-canvas [data-edge]').count(),3);
  assert((await page.locator('#behavior-canvas [data-edge="2"]').textContent()).includes('条件を設定'));
  await page.locator('#node-kind').selectOption('wait');
  await clickLine(2);await page.locator('#edge-condition').selectOption('elapsed');
  await page.locator('#behavior-canvas').focus();await page.keyboard.press('Delete');assert.equal(await page.locator('#behavior-canvas [data-edge]').count(),2);
  await page.locator('#behavior-undo').click();assert.equal(await page.locator('#behavior-canvas [data-edge]').count(),3);
  // Completed drafts use the existing persisted model and reopen with conditions.
  await page.locator('#behavior-apply').click();await page.waitForSelector('#behavior-dialog:not([open])',{state:'attached'});
  const editedSave=await Promise.all([page.waitForEvent('download'),page.locator('#save').click()]);
  await editedSave[0].saveAs(path.join(folder,'edited-scenario.txt'));
  const editedSource=JSON.parse(fs.readFileSync(path.join(folder,'edited-scenario.txt'))),editedGraph=editedSource.behaviors.find(g=>g.nodes.some(n=>n.id===temporaryWait));
  assert.equal(editedGraph.nodes.find(n=>n.id===temporaryWait).kind,'wait');
  assert.deepEqual(editedGraph.edges.map(e=>e.when),['received','detected','elapsed']);
  await page.locator('#file').setInputFiles(path.join(folder,'edited-scenario.txt'));
  await page.locator('#unit-task-open').click();await page.locator('#graph-edit-tab').click();await page.locator('#behavior-fit').click();
  assert.equal(await page.locator('#behavior-canvas [data-edge]').count(),3);
  // Entrances are placed before their kind is chosen, and have no automatic target.
  await addNode('trigger-add');
  assert(await page.locator('#trigger-properties').isVisible());assert.equal(await page.locator('#trigger-event').inputValue(),'');
  assert.equal(await page.locator('#trigger-target').inputValue(),'');
  await page.locator('#behavior-apply').click();assert((await page.locator('#behavior-validation').innerText()).includes('未設定のイベントノード'));
  assert.equal(await page.locator('#trigger-event option[value="scenarioStart"]').count(),0);
  await page.locator('#trigger-event').selectOption('received');
  await page.locator('#trigger-event').selectOption('time');await page.locator('#trigger-seconds').fill('22.5');await page.locator('#trigger-seconds').press('Tab');
  await page.locator('#trigger-once').selectOption('repeat');
  assert.equal(await page.locator('#trigger-seconds-label').textContent(),'発火間隔（秒）');
  await page.locator('#behavior-fit').click();
  const added=page.locator('#behavior-canvas .trigger-node').last();
  await page.locator('#graph-connect').click();await added.locator('rect').click();
  await page.locator('#behavior-canvas [data-node="patrol"] > rect:first-child').click();
  // Re-select the new entrance and verify its target was set by graphical connection.
  await added.locator('rect').click();assert.equal(await page.locator('#trigger-target').inputValue(),'patrol');
  assert.equal(await page.locator('#trigger-seconds').inputValue(),'22.5');
  assert.equal(await page.locator('#trigger-once').inputValue(),'repeat');
  await page.locator('#behavior-apply').click();await page.waitForSelector('#behavior-dialog:not([open])',{state:'attached'});
  await page.locator('#unit-task-open').click();await page.locator('#graph-edit-tab').click();await page.locator('#behavior-fit').click();
  await page.locator('#behavior-canvas .trigger-node rect').click();assert.equal(await page.locator('#trigger-once').inputValue(),'repeat');
  await page.locator('#behavior-canvas').focus();await page.keyboard.press('Delete');assert.equal(await page.locator('#behavior-canvas .trigger-node').count(),0);
  await page.locator('#behavior-canvas [data-node="'+temporaryWait+'"] > rect:first-child').click();await page.locator('#behavior-canvas').focus();await page.keyboard.press('Delete');
  await addNode('node-add');await page.locator('#node-kind').selectOption('stop');await page.locator('#behavior-fit').click();
  await page.locator('#graph-connect').click();await page.locator('#behavior-canvas .behavior-node.selected > rect:first-child').click();
  assert((await page.locator('#behavior-instruction').textContent()).includes('終了状態から'));
  await page.locator('#graph-connect').click();await page.locator('#behavior-canvas').focus();await page.keyboard.press('Delete');
  await page.locator('#behavior-fit').click();
  if(process.env.SIMSIM_GRAPH_SCREENSHOT)await page.locator('#behavior-dialog').screenshot({path:process.env.SIMSIM_GRAPH_SCREENSHOT});
  await page.locator('#task-edit-tab').click();
  await page.locator('#assignment-phase').fill('50');await page.locator('#assignment-phase').press('Tab');
  await page.locator('#behavior-apply').click();await page.waitForSelector('#behavior-dialog:not([open])',{state:'attached'});
  await page.locator('.unit-item[data-id="transit-submarine"]').click();
  await page.locator('#unit-task-open').click();assert.equal(await page.locator('#assignment-list').inputValue(),'');await page.locator('#behavior-cancel').click();
  // Save definition and verify the task parameter, not the obsolete raw unit route.
  const save=await Promise.all([page.waitForEvent('download'),page.locator('#save').click()]);
  await save[0].saveAs(path.join(folder,'scenario.txt'));
  const source=JSON.parse(fs.readFileSync(path.join(folder,'scenario.txt')));assert.equal(source.version,3);assert.equal(source.behaviorAssignments[0].phase,.5);assert(!('entry' in source.behaviors[0]));assert.equal(source.behaviors[0].initial,'patrol');assert.deepEqual(source.behaviors[0].triggers,[]);
  // Compute once, seek backwards/forwards, export and reopen the record.
  await page.locator('#record-run').click();await page.waitForFunction(()=>!document.getElementById('play').disabled,{},{timeout:60000});
  const info=await page.locator('#recording-info').innerText();assert(info.includes('記録済み'));
  for(const t of [1000,20,1000]){
    await page.locator('#timeline').evaluate((el,t)=>{el.value=t;el.dispatchEvent(new Event('input',{bubbles:true}));},t);
    await page.waitForFunction(t=>{const seconds=document.getElementById('clock').textContent.split(':').map(Number);return seconds[0]*3600+seconds[1]*60+seconds[2]===t;},t);
  }
  assert.equal(await page.locator('#recording-info').innerText(),info);
  const record=await Promise.all([page.waitForEvent('download'),page.locator('#record-save').click()]);await record[0].saveAs(path.join(folder,'record.txt'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(folder,'record.txt'))).model,'trigger-behavior-v3');
  await page.locator('#file').setInputFiles(path.join(folder,'record.txt'));await page.waitForFunction(()=>!document.getElementById('play').disabled);assert((await page.locator('#recording-info').innerText()).includes('記録済み'));
  // New clears graph references, and Undo restores them.
  await page.locator('#new-scenario').click();assert.equal(await page.locator('.unit-item').count(),0);assert.equal(await page.locator('#task-list button').count(),0);
  await page.locator('#undo').click();assert.equal(await page.locator('.unit-item').count(),9);
  // Monte Carlo through the actual worker and trial replay.
  await page.locator('#analysis-open').click();await page.locator('#analysis-trials').fill('2');await page.locator('#analysis-trials').press('Tab');
  await page.locator('#analysis-run').click();await page.waitForFunction(()=>document.getElementById('analysis-progress').textContent.startsWith('完了'),{},{timeout:60000});
  assert((await page.locator('#analysis-progress').innerText()).includes('24 / 24'));
  await page.getByRole('button',{name:'再現',exact:true}).first().click();
  await page.waitForFunction(()=>!document.getElementById('play').disabled,{},{timeout:60000});
  // Compact desktop layout and display controls retain their state.
  if(await page.locator('#analysis-dialog').isVisible())await page.locator('#analysis-close').click();
  await page.locator('.map-toolbar .menu-popover summary').click();await page.locator('#show-labels').uncheck();
  await page.locator('#viewtop').click();assert(!(await page.locator('#show-labels').isChecked()));
  await page.setViewportSize({width:1200,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('.unit-item[data-id="patrol-uuv__1"]').click();await page.locator('#unit-task-open').click();await page.locator('#graph-edit-tab').click();await page.locator('#behavior-fit').click();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert(await page.locator('#behavior-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth));
  await addNode('node-add');await page.locator('#node-kind').selectOption('wait');await page.locator('#behavior-fit').click();
  const compactWait=await page.locator('#behavior-canvas .behavior-node.selected').getAttribute('data-node');
  await connect('patrol',compactWait);await page.locator('#edge-condition').selectOption('received');
  await clickLine(0);assert.equal(await page.locator('#edge-condition').inputValue(),'received');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('#behavior-cancel').click();
  assert.deepEqual(errors,[]);
  if(process.env.SIMSIM_SCREENSHOT)await page.screenshot({path:process.env.SIMSIM_SCREENSHOT,fullPage:true});
  console.log('PASS: offline CSP; desktop create-before-configure; draft validation; clickable wires and labels; edge condition Undo/Redo; duplicate-condition protection; state-kind edits retain wires; graph definition save/reopen; initial state and event editing; port-free directed connections and self-loops; zoom/pan/fit/minimap; scaled drag; calculation/record seek/reopen; Monte Carlo/replay; no browser errors');
} finally {
  await browser?.close();await new Promise(r=>server.close(r));fs.rmSync(folder,{recursive:true,force:true});
}
