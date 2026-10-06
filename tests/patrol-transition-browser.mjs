import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSimulation,sharedSteps,restoreRecording} from '../src/recorded-engine.js?v=20261006-patrol-cruise-19';
import {UI_VERSION} from '../src/ui-dom.js?v=20261006-patrol-cruise-19';
const {chromium}=await import(process.env.SIMSIM_PLAYWRIGHT??'playwright');
const root=path.resolve(process.env.SIMSIM_WEB_ROOT??fileURLToPath(new URL('..',import.meta.url))),folder=fs.mkdtempSync(path.join(os.tmpdir(),'simsim-patrol-transition-'));
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
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.waitForFunction(()=>document.getElementById('recording-info').textContent.includes('未計算'));
  assert.equal(await page.locator('#app-version').textContent(),UI_VERSION);
  for(const when of ['arrived','near']){
    const source=JSON.parse(fs.readFileSync(new URL('fixtures/patrol-transition.txt',import.meta.url)));
    source.behaviors[0].edges[0]={from:'move',to:'patrol',when,...(when==='near'?{destinationId:'d',distance:10,distanceMode:'horizontal'}:{})};
    const fixture=path.join(folder,when+'.txt');fs.writeFileSync(fixture,JSON.stringify(source));
    await page.locator('#file').setInputFiles(fixture);
    await page.waitForFunction(()=>document.getElementById('title').value==='移動から協調周回');
    await page.locator('#record-run').click();
    await page.waitForFunction(()=>!document.getElementById('play').disabled,{},{timeout:60000});
    assert(!await page.locator('#error-dialog').isVisible());
    const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#record-save').click()]);
    const archive=path.join(folder,when+'-record.txt');await download.saveAs(archive);
    const payload=JSON.parse(fs.readFileSync(archive)),recording=restoreRecording(payload);
    assert(payload.result.actionEvents.filter(e=>e.type==='nodeChanged'&&e.nodeId==='patrol').length===3);
    const units=recording.evaluate(2000).units;
    assert(units.every(u=>u.nodeId==='patrol'&&u.distance>4000));
    assert(new Set(units.map(u=>JSON.stringify(u.position))).size===3);
    await page.locator('#timeline').evaluate(el=>{el.value=10;el.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.locator('#timeline').evaluate(el=>{el.value=2000;el.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.locator('#file').setInputFiles(archive);
    await page.waitForFunction(()=>!document.getElementById('play').disabled);
    assert(!await page.locator('#error-dialog').isVisible());
  }
  // Run the reported distributed-stall case through the deployed Worker too.
  const uneven=JSON.parse(fs.readFileSync(new URL('fixtures/patrol-spacing.txt',import.meta.url)));
  const input=path.join(folder,'uneven.txt');fs.writeFileSync(input,JSON.stringify(uneven));
  await page.locator('#file').setInputFiles(input);
  await page.waitForFunction(()=>document.getElementById('title').value==='不均等な配置での協調周回');
  await page.locator('#record-run').click();
  await page.waitForFunction(()=>!document.getElementById('play').disabled,{},{timeout:60000});
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#record-save').click()]);
  const archive=path.join(folder,'uneven-record.txt');await download.saveAs(archive);
  const recording=restoreRecording(JSON.parse(fs.readFileSync(archive)));
  const local=createSimulation(uneven);for(const _ of sharedSteps(local,undefined,undefined,{record:true})){}
  for(let time=10;time<=600;time+=10){
    const before=recording.evaluate(time-1).units,after=recording.evaluate(time).units;
    assert(after.every((u,i)=>u.distance-before[i].distance>=.7-1e-3),'Every unit keeps cruising');
    assert.deepEqual(after,local.evaluate(time).units,'Worker and local calculations agree');
  }
  await page.locator('#file').setInputFiles(archive);
  await page.waitForFunction(()=>!document.getElementById('play').disabled);
  assert(!await page.locator('#error-dialog').isVisible());
  assert.deepEqual(errors,[]);
  console.log('PASS: move -> arrival/proximity -> cooperative patrol, uneven placement without stops, Worker/local agreement, saved recording, seeking/reopen and visible version');
}finally{await browser?.close();await new Promise(r=>server.close(r));fs.rmSync(folder,{recursive:true,force:true});}
