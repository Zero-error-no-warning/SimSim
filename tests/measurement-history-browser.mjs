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
  // Coincident 3D units have separate screen labels and visible leader lines.
  await page.waitForTimeout(150);const rects=await page.locator('#labels .map-label:visible').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));assert.equal(rects.length,3);
  for(const [i,a] of rects.entries())for(const b of rects.slice(i+1))assert(!(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y));assert.equal(await page.locator('#labels .label-leaders line').evaluateAll(els=>els.filter(e=>e.style.display!=='none').length),3);
  if(process.env.SIMSIM_HISTORY_SCREENSHOT){await page.locator('#events-open').click();await page.screenshot({path:process.env.SIMSIM_HISTORY_SCREENSHOT});}
  assert.deepEqual(errors,[]);console.log('PASS: point editing, stage results, failed-trial replay, export/restore, all-period timeline, filtered lanes, backward seek, archived history and disjoint 3D labels');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(folder,{recursive:true,force:true});}
