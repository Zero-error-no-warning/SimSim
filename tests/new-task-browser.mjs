import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
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
  await page.locator('#new-scenario').click();assert.equal(await page.locator('.unit-item').count(),0);
  // Empty projects and the last graph's deletion both have no assignment/graph.
  await page.locator('#behaviors-open').click();await page.locator('#behavior-dialog').waitFor({state:'visible'});
  assert(await page.locator('#assignment-name').isDisabled());assert(await page.locator('#node-measure').isDisabled());assert((await page.locator('#node-measure-note').textContent()).includes('選択してください'));
  await page.locator('#assignment-new').click();assert((await page.locator('#error-text').textContent()).includes('割り当て可能な担当がありません'));await page.locator('#close-error').click();await page.locator('#behavior-cancel').click();if(await page.locator('#settings-editor').isVisible())await page.locator('#settings-back').click();
  await page.locator('#template').selectOption('air');await page.locator('#add').click();const box=await page.locator('#map canvas').boundingBox();await page.mouse.click(box.x+box.width*.5,box.y+box.height*.5);assert.equal(await page.locator('.unit-item').count(),1);
  await page.locator('#behaviors-open').click();await page.locator('#behavior-dialog').waitFor({state:'visible'});await page.locator('#assignment-new').click();
  assert(!(await page.locator('#assignment-name').isDisabled()));const task=await page.locator('#assignment-list').inputValue();assert(task);
  await page.locator('#graph-edit-tab').click();await page.locator('#behavior-fit').click();const initial=await page.locator('#behavior-canvas .initial-label').locator('..').getAttribute('data-node');
  await page.locator('#behavior-canvas [data-node="'+initial+'"] > rect:first-child').click();assert(!(await page.locator('#node-measure').isDisabled()));assert((await page.locator('#node-measure-note').textContent()).includes(await page.locator('#assignment-name').inputValue()));
  await page.locator('#behavior-delete').click();assert.equal(await page.locator('#behavior-canvas [data-node]').count(),0);assert(await page.locator('#assignment-name').isDisabled());assert(await page.locator('#node-measure').isDisabled());
  await page.locator('#behavior-undo').click();assert.equal(await page.locator('#assignment-list option[value="'+task+'"]').count(),1);assert((await page.locator('#behavior-canvas [data-node]').count())>0);
  await page.locator('#behavior-redo').click();assert.equal(await page.locator('#behavior-canvas [data-node]').count(),0);
  await page.locator('#task-edit-tab').click();await page.locator('#assignment-new').click();await page.locator('#behavior-apply').click();if(await page.locator('#behavior-dialog').isHidden()&&await page.locator('#settings-editor').isVisible())await page.locator('#settings-apply').click();await page.locator('#behavior-dialog').waitFor({state:'hidden'});assert.equal(await page.locator('#task-list button').count(),1);
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#save').click()]);const file=path.join(folder,'created.txt');await download.saveAs(file);const source=JSON.parse(fs.readFileSync(file));assert.equal(source.version,3);assert.equal(source.units.length,1);assert.equal(source.behaviors.length,1);assert.equal(source.behaviorAssignments.length,1);
  await page.locator('#new-scenario').click();await page.locator('#file').setInputFiles(file);await page.waitForFunction(()=>document.querySelectorAll('#task-list button').length===1);
  await page.locator('#record-run').click();await page.waitForFunction(()=>!document.getElementById('play').disabled,{},{timeout:60000});assert(!await page.locator('#error-dialog').isVisible());
  assert.deepEqual(errors,[]);console.log('PASS: empty new scenario, no eligible units, first-unit task creation, measurement controls, last graph deletion with Undo/Redo, task recreation/apply, version-3 save/reopen and Worker calculation');
}finally{await browser?.close();await new Promise(r=>server.close(r));fs.rmSync(folder,{recursive:true,force:true});}
