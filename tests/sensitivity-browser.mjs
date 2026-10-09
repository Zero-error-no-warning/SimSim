import {clickWorkspace} from './workspace-browser-helpers.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {restoreSensitivityResult,summarizeSensitivity} from '../src/sensitivity.js?v=20261009-map-workspace-29';
import {restoreRecording} from '../src/recorded-engine.js?v=20261009-map-workspace-29';
const {chromium}=await import(process.env.SIMSIM_PLAYWRIGHT??'playwright');
const root=path.resolve(process.env.SIMSIM_WEB_ROOT??fileURLToPath(new URL('..',import.meta.url))),folder=fs.mkdtempSync(path.join(os.tmpdir(),'simsim-sensitivity-'));
const source=JSON.parse(fs.readFileSync(new URL('fixtures/state-measurement.txt',import.meta.url)));
source.measurements=[{id:'initial',name:'起点',type:'state',assignmentId:'t',nodeId:'a',join:'all',deadline:30},{id:'finish',name:'到達',type:'state',assignmentId:'t',nodeId:'b',join:'all',deadline:30,previousId:'initial'}];
source.analysis.mode='sensitivity';source.analysis.sensitivity={metric:'point.finish.duration',candidates:[{target:'behavior:g',parameter:'behavior.node.a.seconds',low:1,high:5},{target:'group:group',parameter:'capacity.population',low:0,high:3}]};
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://local').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:");
  res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'text/plain');
  try{res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.SIMSIM_BROWSER_EXECUTABLE?{executablePath:process.env.SIMSIM_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>document.getElementById('recording-info').textContent.includes('未計算'));
  await page.locator('#file').setInputFiles(path.resolve(new URL('fixtures/legacy/sensitivity-demo.txt',import.meta.url).pathname));await page.waitForFunction(()=>document.getElementById('title').value==='感度分析：通信・移動・報告周期');
  await page.locator('#analysis-open').click();assert.equal(await page.locator('#analysis-mode').inputValue(),'sensitivity');assert(await page.locator('#comparison-editor').isHidden());assert(await page.locator('#sensitivity-editor').isVisible());
  await page.locator('#analysis-run').click();await page.waitForFunction(()=>!document.getElementById('analysis-run').disabled&&document.querySelectorAll('#sensitivity-rows tr').length===6);
  const sampleRows=await page.locator('#sensitivity-rows').textContent();assert(sampleRows.includes('通信成功確率'));assert(sampleRows.includes('refresh'));assert.equal(await page.locator('#sensitivity-chart svg').count(),1);
  await page.locator('#sensitivity-rows tr').filter({hasText:'通信成功確率'}).first().click();await page.locator('#sensitivity-focus').click();assert(await page.locator('.unit-item[data-id="relay"]').evaluate(e=>e.classList.contains('selected')&&e.classList.contains('sensitivity-target')));
  const input=path.join(folder,'input.txt');fs.writeFileSync(input,JSON.stringify(source));await page.locator('#file').setInputFiles(input);await page.locator('#analysis-open').click();
  assert.equal(await page.locator('#sensitivity-metric').inputValue(),'point.finish.duration');await page.locator('#sensitivity-target').selectOption('behavior:g');
  const candidate=page.locator('#sensitivity-candidates tr[data-parameter="behavior.node.a.seconds"]');assert.equal(await candidate.locator('input[type=number]').first().inputValue(),'1');
  await candidate.locator('input[type=number]').first().fill('2');await candidate.locator('input[type=number]').first().press('Tab');assert.equal(await candidate.locator('input[type=number]').first().inputValue(),'2');
  await page.locator('#analysis-close').click();await page.locator('#undo').click();await page.locator('#analysis-open').click();await page.locator('#sensitivity-target').selectOption('behavior:g');assert.equal(await candidate.locator('input[type=number]').first().inputValue(),'1');
  await page.locator('#analysis-run').click();await page.waitForFunction(()=>!document.getElementById('analysis-run').disabled&&document.querySelectorAll('#sensitivity-rows tr').length===4);
  const node=page.locator('#sensitivity-rows tr').filter({hasText:'状態 a'}).first();assert((await node.textContent()).includes('-2秒'));assert((await page.locator('#sensitivity-rows').textContent()).includes('0 / 2'));
  await node.click();await page.locator('#sensitivity-focus').click();assert(await page.locator('#behavior-dialog').isVisible());assert(await page.locator('#graph-editor').isVisible());assert.equal(await page.locator('#node-value').inputValue(),'3');assert.equal(await page.locator('.unit-item.sensitivity-target').count(),2);
  await page.locator('#behavior-cancel').click();if(await page.locator('#settings-editor').isVisible())await page.locator('#settings-back').click();await page.locator('#analysis-open').click();
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#analysis-export').click()]);const file=path.join(folder,'sensitivity.txt');await download.saveAs(file);const payload=JSON.parse(fs.readFileSync(file));assert.equal(payload.type,'SimSim-sensitivity');const restored=restoreSensitivityResult(payload);assert.equal(restored.completed,10);assert.equal(summarizeSensitivity(restored.source,restored.rows).find(r=>r.condition.candidate.target==='behavior:g').delta,-2);
  // Replays use the same trial number but different single-parameter settings.
  await page.locator('#sensitivity-trial').selectOption('1');await page.locator('#sensitivity-replay-changed').click();await page.waitForFunction(()=>!document.getElementById('play').disabled);
  const [record]=await Promise.all([page.waitForEvent('download'),clickWorkspace(page,'record-save')]);const recordFile=path.join(folder,'record.txt');await record.saveAs(recordFile);const changed=restoreRecording(JSON.parse(fs.readFileSync(recordFile)));assert.equal(changed.source.trial,1);assert.equal(changed.result.successTime,1);
  await page.locator('#analysis-open').click();await page.locator('#sensitivity-replay-base').click();await page.waitForFunction(()=>!document.getElementById('play').disabled);const [baseDownload]=await Promise.all([page.waitForEvent('download'),clickWorkspace(page,'record-save')]);await baseDownload.saveAs(recordFile);const base=restoreRecording(JSON.parse(fs.readFileSync(recordFile)));assert.equal(base.source.trial,1);assert.equal(base.result.successTime,3);
  await page.locator('#file').setInputFiles(file);await page.waitForFunction(()=>document.getElementById('analysis-dialog').open||document.getElementById('error-dialog').open);assert(!await page.locator('#error-dialog').isVisible());assert((await page.locator('#analysis-progress').textContent()).includes('再計算なし'));assert.equal(await page.locator('#sensitivity-rows tr').count(),4);
  // Group focus links all generated members; returning to the baseline preserves results.
  await page.locator('#sensitivity-rows tr').filter({hasText:'個数'}).last().click();await page.locator('#sensitivity-focus').click();assert.equal(await page.locator('.unit-item.sensitivity-target').count(),2);
  await page.locator('#analysis-open').click();await page.locator('#analysis-mode').selectOption('comparison');assert(await page.locator('#sensitivity-editor').isHidden());await page.locator('#analysis-run').click();await page.waitForFunction(()=>!document.getElementById('analysis-run').disabled&&document.querySelectorAll('#analysis-rows tr').length===2);assert(await page.locator('#sensitivity-results').isHidden());
  // Cancel during baseline calculation and restore a partial archive without fabrication.
  await page.locator('#analysis-close').click();const long=structuredClone(source);long.analysis.trials=1000;fs.writeFileSync(input,JSON.stringify(long));await page.locator('#file').setInputFiles(input);await page.locator('#analysis-open').click();await page.locator('#analysis-run').click();await page.waitForFunction(()=>document.getElementById('analysis-bar').value>0);await page.locator('#analysis-cancel').click();assert((await page.locator('#analysis-progress').textContent()).includes('中止'));
  const [partialDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#analysis-export').click()]);const partialFile=path.join(folder,'partial.txt');await partialDownload.saveAs(partialFile);const partial=restoreSensitivityResult(JSON.parse(fs.readFileSync(partialFile)));assert(partial.completed>0&&partial.completed<partial.planned);
  await page.locator('#analysis-close').click();await page.locator('#file').setInputFiles(partialFile);await page.waitForFunction(()=>document.getElementById('analysis-dialog').open||document.getElementById('error-dialog').open);assert(!await page.locator('#error-dialog').isVisible());
  // Compact screen and scroll containers keep the application inside its viewport.
  await page.setViewportSize({width:1200,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(process.env.SIMSIM_SENSITIVITY_SCREENSHOT){await page.locator('#analysis-close').click();await page.locator('#file').setInputFiles(file);await page.waitForFunction(()=>document.getElementById('analysis-dialog').open);await page.screenshot({path:process.env.SIMSIM_SENSITIVITY_SCREENSHOT});}
  assert.deepEqual(errors,[]);console.log('PASS: sensitivity sample/Worker, config/Undo, duration/rate/missing results, chart ranking, node/group focus, paired replay, export/restore, comparison switch, cancellation/partial archive and 1200px viewport');
}finally{await browser?.close();await new Promise(r=>server.close(r));fs.rmSync(folder,{recursive:true,force:true});}
