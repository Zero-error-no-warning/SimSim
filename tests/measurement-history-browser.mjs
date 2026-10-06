import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const source=JSON.parse(fs.readFileSync(new URL('./fixtures/state-measurement.txt',import.meta.url)));
source.measurements=[{id:'initial',name:'初期',type:'state',assignmentId:'t',nodeId:'a',join:'all',deadline:30},{id:'arrival',name:'到達',type:'state',assignmentId:'t',nodeId:'b',join:'all',deadline:30,previousId:'initial'}];
const {chromium}=await import(process.env.SIMSIM_PLAYWRIGHT??'playwright');
const root=path.resolve(process.env.SIMSIM_WEB_ROOT??fileURLToPath(new URL('..',import.meta.url))),folder=fs.mkdtempSync(path.join(os.tmpdir(),'simsim-navigation-'));
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://local').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)){res.statusCode=403;res.end();return;}
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:");
  res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'text/plain');
  try{res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.SIMSIM_BROWSER_EXECUTABLE?{executablePath:process.env.SIMSIM_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.setDefaultTimeout(15000);page.on('dialog',async d=>{await d.accept().catch(()=>{});});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>document.getElementById('recording-info').textContent.includes('未計算'));
  const input=path.join(folder,'input.txt');fs.writeFileSync(input,JSON.stringify(source));await page.locator('#file').setInputFiles(input);
  await page.locator('#analysis-open').click();await page.locator('#measurement-editor summary').click();
  assert.equal(await page.locator('#measurement-select option').count(),2);await page.locator('#measurement-select').selectOption('arrival');assert.equal(await page.locator('#measurement-previous').inputValue(),'initial');
  await page.locator('#measurement-add').click();assert.equal(await page.locator('#measurement-select option').count(),3);
  await page.locator('#measurement-name').fill('追加点');await page.locator('#measurement-name').press('Tab');assert.equal(await page.locator('#measurement-select option:checked').textContent(),'追加点');
  await page.locator('#measurement-remove').click();assert.equal(await page.locator('#measurement-select option').count(),2);
  await page.locator('#analysis-run').click();await page.waitForFunction(()=>!document.getElementById('analysis-run').disabled&&document.querySelectorAll('#analysis-rows tr').length===2);
  await page.locator('#measurement-condition').selectOption({index:1});
  assert((await page.locator('#measurement-rows tr[data-measurement="arrival"]').textContent()).includes('3.0秒'));assert((await page.locator('#measurement-rows tr[data-measurement="arrival"]').textContent()).includes('100.0%'));
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#analysis-export').click()]);const analysis=path.join(folder,'analysis.txt');await download.saveAs(analysis);
  await page.locator('#measurement-condition').selectOption({index:0});await page.locator('#measurement-rows tr[data-measurement="arrival"] button').click();
  await page.waitForFunction(()=>!document.getElementById('play').disabled);assert((await page.locator('#replay-parameters').textContent()).includes('到達未達'));
  assert.equal(await page.locator('#timeline').inputValue(),'30');await page.locator('#events-open').click();assert((await page.locator('#history-note').textContent()).includes('0 / 0個'));await page.locator('#events-close').click();
  await page.locator('#file').setInputFiles(analysis);await page.waitForFunction(()=>document.getElementById('analysis-dialog').open||document.getElementById('error-dialog').open);assert.equal(await page.locator('#error-dialog').evaluate(e=>e.open),false,await page.locator('#error-text').textContent());await page.locator('#analysis-dialog').waitFor({state:'visible'});assert((await page.locator('#analysis-progress').textContent()).includes('再計算なし'));await page.locator('#measurement-condition').selectOption({index:1});assert((await page.locator('#measurement-rows').textContent()).includes('3.0秒'));await page.locator('#analysis-close').click();
  await page.locator('#record-run').click();await page.waitForFunction(()=>!document.getElementById('play').disabled);
  await page.locator('#events-open').click();assert.equal(await page.locator('#history-chart svg').count(),1);assert(await page.locator('#events-dialog').evaluate(e=>e.clientWidth>1000));assert.equal(await page.locator('#history-unit option').count(),3);
  // All-period history is available at t=0, including the future repeated entry.
  assert.equal(await page.locator('#timeline').inputValue(),'0');const future=page.locator('#history-chart circle[data-event="triggered"][data-time="20"]').first();await future.click();
  await page.waitForFunction(()=>document.getElementById('timeline').value==='20');const cursor20=await page.locator('#history-chart [data-cursor]').getAttribute('x1');assert(await page.locator('#event-list .event-item').count()>2);
  await page.locator('#history-unit').selectOption('group__1');assert.equal(await page.locator('#history-chart [data-node="b"]').count(),5);
  await page.locator('#events-close').click();await page.locator('#reset').click();await page.waitForFunction(()=>document.getElementById('timeline').value==='0');await page.locator('#events-open').click();assert.notEqual(await page.locator('#history-chart [data-cursor]').getAttribute('x1'),cursor20);assert.equal(await future.count(),1);await page.locator('#events-close').click();
  const [recordDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#record-save').click()]);const record=path.join(folder,'record.txt');await recordDownload.saveAs(record);await page.locator('#file').setInputFiles(record);await page.waitForFunction(()=>!document.getElementById('play').disabled);await page.locator('#events-open').click();assert.equal(await page.locator('#history-chart circle[data-time="20"]').count()>0,true);await page.locator('#events-close').click();
  // Four panes and linked selections replace overlapping 3D labels.
  assert.equal(await page.locator('#labels .map-label').count(),0);
  assert.equal(await page.locator('#labels .label-rail').count(),0);
  assert(await page.locator('#map>canvas').evaluate(e=>Math.abs(e.clientWidth-e.parentElement.clientWidth)<2));
  const panels=await page.locator('.task-panel,.unit-panel,.main-panel,.inspector').evaluateAll(els=>els.map(e=>e.getBoundingClientRect().x));
  assert(panels.every((x,i)=>i===0||x>panels[i-1]));
  await page.locator('.task-item[data-task="t"]').click();assert.equal(await page.locator('.unit-item.related').count(),2);
  assert.equal(await page.locator('.unit-item').count(),3); // Unassigned units stay available.
  assert.equal(await page.locator('#behavior-dialog').evaluate(e=>e.open),false);
  await page.locator('.task-edit').click();assert(await page.locator('#behavior-dialog').isVisible());await page.locator('#behavior-cancel').click();
  await page.locator('.unit-item[data-id="group__2"]').hover();await page.waitForTimeout(100);
  assert(await page.locator('#labels line[data-unit="group__2"]').isVisible());
  await page.locator('.unit-item[data-id="group__2"]').click();assert(await page.locator('.unit-item[data-id="group__2"]').evaluate(e=>e.classList.contains('selected')));
  assert(await page.locator('.task-item[data-task="t"]').evaluate(e=>e.classList.contains('related')&&e.classList.contains('selected')));
  await page.locator('.unit-item[data-id="template"]').click();assert.equal(await page.locator('.task-item.selected').count(),0);assert.equal(await page.locator('.unit-item.related').count(),0);
  assert((await page.locator('.unit-item[data-id="template"] .unit-status').textContent()).includes('無効'));
  await page.locator('#unit-search').fill('存在しない名前');assert.equal(await page.locator('.unit-item').count(),1);assert(await page.locator('.unit-item[data-id="template"]').isVisible());await page.locator('#unit-search').fill('');
  // Picking a unit beyond the list limit reveals and scrolls to that row.
  const many=structuredClone(source);many.groups[0].count=100;many.groups[0].width=2000;many.groups[0].height=2000;
  many.units[0].initial={x:3500,y:3500,z:0};fs.writeFileSync(input,JSON.stringify(many));await page.locator('#file').setInputFiles(input);
  await page.locator('#unit-search').fill('group__100');await page.locator('.unit-item[data-id="group__100"]').click();await page.waitForTimeout(150);
  const targetPoint=await page.locator('#labels line[data-unit="group__100"]').evaluate(e=>({x:Number(e.getAttribute('x2')),y:Number(e.getAttribute('y2'))}));
  await page.locator('#unit-search').fill('template');await page.locator('.unit-item[data-id="template"]').click();await page.locator('#unit-search').fill('');assert.equal(await page.locator('.unit-item[data-id="group__100"]').count(),0);
  const mapBox=await page.locator('#map>canvas').boundingBox();await page.mouse.click(mapBox.x+targetPoint.x,mapBox.y+targetPoint.y);
  await page.waitForFunction(()=>document.querySelector('.unit-item[data-id="group__100"]')?.classList.contains('selected'));
  assert.equal(await page.locator('#unit-name').inputValue(),'群 100');
  assert(await page.locator('.unit-item[data-id="group__100"]').evaluate(e=>{const r=e.getBoundingClientRect(),p=e.parentElement.getBoundingClientRect();return r.top>=p.top&&r.bottom<=p.bottom+1;}));
  const before=await page.locator('.unit-panel').boundingBox(),handle=page.locator('.pane-resizer[data-pane="unit"]'),box=await handle.boundingBox();
  await page.mouse.move(box.x+3,box.y+50);await page.mouse.down();await page.mouse.move(box.x+43,box.y+50);await page.mouse.up();
  assert((await page.locator('.unit-panel').boundingBox()).width>before.width+30);
  await handle.focus();await page.keyboard.press('ArrowLeft');
  const mapBefore=await page.locator('#map').boundingBox();await page.locator('#tasks-toggle').click();assert(await page.locator('#task-panel-content').isHidden());assert((await page.locator('#map').boundingBox()).width>mapBefore.width+100);
  await page.reload();await page.waitForFunction(()=>document.getElementById('recording-info').textContent.includes('未計算'));assert(await page.locator('#task-panel-content').isHidden());await page.locator('#tasks-toggle').click();
  await page.setViewportSize({width:1200,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('#viewtop').click();assert(await page.locator('#map>canvas').evaluate(e=>Math.abs(e.clientWidth-e.parentElement.clientWidth)<2));await page.locator('#view3d').click();
  await page.locator('.map-options').evaluate(e=>e.closest('details').open=true);await page.locator('#show-labels').uncheck();assert(await page.locator('#labels').isHidden());await page.locator('#show-labels').check();await page.locator('.map-options').evaluate(e=>e.closest('details').open=false);
  if(process.env.SIMSIM_LABEL_SCREENSHOT)await page.screenshot({path:process.env.SIMSIM_LABEL_SCREENSHOT});
  if(process.env.SIMSIM_HISTORY_SCREENSHOT){await page.locator('#events-open').click();await page.screenshot({path:process.env.SIMSIM_HISTORY_SCREENSHOT});}
  assert.deepEqual(errors,[]);console.log('PASS: point editing, stage results, failed-trial replay, export/restore, all-period timeline, filtered lanes, backward seek, archived history, four panes, linked task/unit selection, hover lines, pane resizing/collapse and persistence');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(folder,{recursive:true,force:true});}
