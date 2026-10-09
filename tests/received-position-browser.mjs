import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {restoreRecording} from '../src/recorded-engine.js?v=20261009-authoring-display-27';
const {chromium}=await import(process.env.SIMSIM_PLAYWRIGHT??'playwright');
const root=path.resolve(process.env.SIMSIM_WEB_ROOT??fileURLToPath(new URL('..',import.meta.url))),folder=fs.mkdtempSync(path.join(os.tmpdir(),'simsim-new-task-'));
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
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.setDefaultTimeout(5000);page.on('pageerror',e=>{errors.push(e.stack);console.log(e.stack);});page.on('dialog',d=>d.accept());
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>document.getElementById('recording-info').textContent.includes('未計算'));
  await page.locator('#file').setInputFiles(path.resolve(new URL('fixtures/legacy/received-position-demo.txt',import.meta.url).pathname));await page.waitForFunction(()=>document.getElementById('title').value==='受信した観測位置へ移動');
  await page.locator('#behaviors-open').click();await page.locator('#behavior-dialog').waitFor({state:'visible'});
  await page.locator('#assignment-list').selectOption('respond');await page.locator('#graph-edit-tab').click();await page.locator('#behavior-fit').click();
  await page.locator('#behavior-canvas [data-node="move"] > rect:first-child').click();
  assert.equal(await page.locator('#node-height-mode').inputValue(),'keep');assert((await page.locator('#node-destination option:checked').textContent()).includes('受信した目標位置'));
  await page.locator('#node-height-mode').selectOption('target');await page.locator('#behavior-undo').click();assert.equal(await page.locator('#node-height-mode').inputValue(),'keep');
  await page.locator('#node-destination-edit').click();assert.equal(await page.locator('#navigation-kind').inputValue(),'received');assert((await page.locator('#navigation-kind option:checked').textContent()).includes('探知・受信'));assert(await page.locator('#navigation-point-fields').isHidden());assert(await page.locator('#navigation-unit-field').isHidden());
  await page.locator('#navigation-kind').selectOption('unit');assert(await page.locator('#navigation-unit-field').isVisible());await page.locator('#navigation-kind').selectOption('received');await page.locator('#navigation-save').click();
  await page.locator('#behavior-apply').click();
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#save').click()]);const file=path.join(folder,'received.txt');await download.saveAs(file);const saved=JSON.parse(fs.readFileSync(file));
  assert.deepEqual(saved.destinations[0],{id:'received',name:'受信した目標位置',kind:'received'});assert.equal(saved.behaviors[2].nodes.find(n=>n.id==='move').heightMode,'keep');assert.equal(saved.behaviors[2].triggers[0].once,false);
  await page.locator('#new-scenario').click();await page.locator('#file').setInputFiles(file);await page.waitForFunction(()=>document.getElementById('title').value==='受信した観測位置へ移動');
  await page.locator('#record-run').click();await page.waitForFunction(()=>!document.getElementById('play').disabled,{},{timeout:60000});assert(!await page.locator('#error-dialog').isVisible());
  await page.locator('#timeline').evaluate(el=>{el.value=180;el.dispatchEvent(new Event('input',{bubbles:true}));});await page.locator('#events-open').click();
  const history=await page.locator('#event-list').textContent();assert(history.includes('観測位置'));assert(history.includes('観測時刻'));assert(history.includes('高さ -100m'));assert(!history.includes('送信失敗'));
  await page.locator('#events-close').click();
  const [record]=await Promise.all([page.waitForEvent('download'),page.locator('#record-save').click()]);const archive=path.join(folder,'record.txt');await record.saveAs(archive);const recording=JSON.parse(fs.readFileSync(archive));assert(recording.result.actionEvents.some(e=>e.type==='received'&&e.targetPosition.z===-100&&e.observationTime===10));
  const local=JSON.parse(fs.readFileSync(new URL('fixtures/local-detection-move.txt',import.meta.url)));
  for(const once of [false,true]){
    local.behaviors[0].triggers[0].once=once;local.duration=once?400:100;
    const input=path.join(folder,'local.txt');fs.writeFileSync(input,JSON.stringify(local));
    await page.locator('#file').setInputFiles(input);await page.waitForFunction(()=>document.getElementById('title').value==='自分で探知した位置へ移動して周回');
    await page.locator('#record-run').click();await page.waitForFunction(()=>!document.getElementById('play').disabled,{},{timeout:60000});assert(!await page.locator('#error-dialog').isVisible());
    const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#record-save').click()]);const output=path.join(folder,'local-record.txt');await download.saveAs(output);
    const replay=restoreRecording(JSON.parse(fs.readFileSync(output)));assert(!replay.result.actionEvents.some(e=>e.type==='received'));
    const early=replay.evaluate(10).units.find(u=>u.id==='observer');assert(early.distance>150);assert.equal(early.status,'moving');
    if(once){const last=replay.evaluate(400).units.find(u=>u.id==='observer');assert.equal(last.nodeId,'patrol');assert(last.distance>5000);}
    await page.locator('#file').setInputFiles(output);await page.waitForFunction(()=>!document.getElementById('play').disabled);assert(!await page.locator('#error-dialog').isVisible());
  }
  assert.deepEqual(errors,[]);console.log('PASS: local detection -> observed-position movement -> patrol with Worker/replay, received-position editor, hidden manual coordinates, height control Undo, save/reopen, repeated event settings, Worker calculation, observation coordinates/time history and exported recording');
}finally{await browser?.close();await new Promise(r=>server.close(r));fs.rmSync(folder,{recursive:true,force:true});}
