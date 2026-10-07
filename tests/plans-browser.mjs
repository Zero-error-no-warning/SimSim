import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {restorePlansResult,summarizePlans} from '../src/plans.js?v=20261007-worker-version-24';
import {restoreRecording} from '../src/recorded-engine.js?v=20261007-worker-version-24';
const {chromium}=await import(process.env.SIMSIM_PLAYWRIGHT??'playwright');
const root=path.resolve(process.env.SIMSIM_WEB_ROOT??fileURLToPath(new URL('..',import.meta.url))),folder=fs.mkdtempSync(path.join(os.tmpdir(),'simsim-sensitivity-'));
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
  const source=JSON.parse(fs.readFileSync(new URL('fixtures/state-measurement.txt',import.meta.url)));delete source.mission;source.analysis.factors=[];
  const input=path.join(folder,'input.txt');fs.writeFileSync(input,JSON.stringify(source));await page.locator('#file').setInputFiles(input);await page.locator('#analysis-open').click();
  assert.equal(await page.locator('#mission-enabled').count(),0);await page.locator('#mission-state').selectOption('b');
  await page.locator('#analysis-run').click();await page.waitForFunction(()=>!document.getElementById('analysis-run').disabled&&document.querySelectorAll('#analysis-rows tr').length===1);assert(!await page.locator('#error-dialog').isVisible());
  await page.locator('#analysis-mode').selectOption('plans');assert(await page.locator('#plans-editor').isVisible());assert(await page.locator('#comparison-editor').isHidden());
  await page.locator('#plan-name').fill('基準：待機3秒');await page.locator('#plan-save').click();assert.equal(await page.locator('#plan-select').inputValue(),'plan-1');assert((await page.locator('#plan-list').textContent()).includes('基準'));
  await page.locator('#analysis-run').click();assert(await page.locator('#error-dialog').isVisible());assert((await page.locator('#error-dialog').textContent()).includes('2件以上'));await page.locator('#close-error').click();
  await page.locator('#analysis-close').click();await page.locator('.unit-item[data-id="group__1"]').click();await page.locator('#unit-task-open').click();await page.locator('#graph-edit-tab').click();await page.locator('#behavior-fit').click();await page.locator('#behavior-canvas [data-node="a"] > rect:first-child').click();await page.locator('#node-value').fill('1');await page.locator('#node-value').press('Tab');await page.locator('#behavior-apply').click();
  await page.locator('#analysis-open').click();assert((await page.locator('#plan-current').textContent()).includes('挙動'));await page.locator('#plan-select').selectOption('');await page.locator('#plan-name').fill('比較：待機1秒');await page.locator('#plan-save').click();assert.equal(await page.locator('#plan-list tr').count(),2);
  await page.locator('#plan-metric').selectOption('mission.time');await page.locator('#analysis-run').click();await page.waitForFunction(()=>!document.getElementById('analysis-run').disabled&&document.querySelectorAll('#plan-result-rows tr').length===1);assert((await page.locator('#plan-result-rows').textContent()).includes('-2秒'));assert.equal(await page.locator('#analysis-rows tr').count(),2);assert.equal(await page.locator('#analysis-chart svg').count(),1);
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#analysis-export').click()]);const file=path.join(folder,'plans.txt');await download.saveAs(file);const restored=restorePlansResult(JSON.parse(fs.readFileSync(file)));assert.equal(restored.completed,4);assert.equal(summarizePlans(restored.source,restored.rows)[0].delta,-2);
  await page.locator('#plan-trial').selectOption('1');await page.locator('#plan-replay-changed').click();await page.waitForFunction(()=>!document.getElementById('play').disabled);const [changedDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#record-save').click()]);const recordFile=path.join(folder,'record.txt');await changedDownload.saveAs(recordFile);const changed=restoreRecording(JSON.parse(fs.readFileSync(recordFile)));assert.equal(changed.source.trial,1);assert.equal(changed.result.successTime,1);
  await page.locator('#analysis-open').click();await page.locator('#plan-replay-base').click();await page.waitForFunction(()=>!document.getElementById('play').disabled);const [baseDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#record-save').click()]);await baseDownload.saveAs(recordFile);const base=restoreRecording(JSON.parse(fs.readFileSync(recordFile)));assert.equal(base.source.trial,1);assert.equal(base.result.successTime,3);
  await page.locator('#analysis-open').click();await page.locator('#analysis-restore').click();assert.equal(await page.locator('#plan-list tr').count(),2);await page.locator('#plan-select').selectOption('plan-1');await page.locator('#plan-load').click();assert(await page.locator('#analysis-dialog').isHidden());await page.locator('#unit-task-open').click();await page.locator('#graph-edit-tab').click();await page.locator('#behavior-fit').click();await page.locator('#behavior-canvas [data-node="a"] > rect:first-child').click();assert.equal(await page.locator('#node-value').inputValue(),'3');await page.locator('#behavior-cancel').click();
  await page.locator('#file').setInputFiles(file);await page.waitForFunction(()=>document.getElementById('analysis-dialog').open||document.getElementById('error-dialog').open);assert(!await page.locator('#error-dialog').isVisible());assert((await page.locator('#analysis-progress').textContent()).includes('再計算なし'));assert.equal(await page.locator('#plan-result-rows tr').count(),1);
  await page.locator('#plan-baseline').selectOption('plan-2');await page.locator('#analysis-run').click();await page.waitForFunction(()=>!document.getElementById('analysis-run').disabled&&document.querySelectorAll('#plan-result-rows tr').length===1);assert((await page.locator('#plan-result-rows').textContent()).includes('+2秒'));
  await page.locator('#plan-select').selectOption('plan-1');await page.locator('#plan-delete').click();assert.equal(await page.locator('#plan-list tr').count(),1);await page.locator('#analysis-close').click();await page.locator('#undo').click();await page.locator('#analysis-open').click();assert.equal(await page.locator('#plan-list tr').count(),2);
  await page.setViewportSize({width:1200,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  await page.locator('#analysis-close').click();await page.locator('#sample-picker').selectOption('plans-demo.txt');await page.waitForFunction(()=>document.getElementById('title').value==='運用案比較：配置・経路・報告周期');await page.locator('#analysis-open').click();await page.locator('#analysis-run').click();await page.waitForFunction(()=>!document.getElementById('analysis-run').disabled&&document.querySelectorAll('#plan-result-rows tr').length===2);assert.equal(await page.locator('#plan-list tr').count(),3);assert(!await page.locator('#error-dialog').isVisible());
  console.log('PASS: always-enabled criteria from unset scenario, plan save/edit/Undo, multi-plan Worker, paired difference/graph/replays, archive reload, baseline switch, sample and compact viewport');
}finally{await browser?.close();await new Promise(r=>server.close(r));fs.rmSync(folder,{recursive:true,force:true});}
