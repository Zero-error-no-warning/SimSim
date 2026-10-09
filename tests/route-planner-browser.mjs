import {clickWorkspace,showNavigator} from './workspace-browser-helpers.mjs';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.SIMSIM_PLAYWRIGHT??'playwright');
const repository=path.resolve(fileURLToPath(new URL('..',import.meta.url))),root=path.resolve(repository,process.env.SIMSIM_WEB_ROOT??'.'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'simsim-navigation-'));
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
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('dialog',dialog=>dialog.accept());
  page.on('pageerror',error=>errors.push(error.message));page.on('console',event=>{if(event.type()==='error')errors.push(event.text());});
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.waitForFunction(()=>document.getElementById('recording-info').textContent.includes('未計算'));
  const source=JSON.parse(fs.readFileSync(path.join(repository,'data/route-planning-demo.txt'),'utf8'));
  source.title='Route planning UI';source.behaviors=[];source.behaviorAssignments=[];source.routes=[];delete source.mission;
  source.units[0].route=[{x:7000,y:0,z:-100}];
  fs.writeFileSync(path.join(folder,'input.txt'),JSON.stringify(source));await page.locator('#file').setInputFiles(path.join(folder,'input.txt'));
  await page.waitForFunction(()=>document.getElementById('title').value==='Route planning UI');
  assert(Number(await page.locator('#route-check-status').getAttribute('data-issues'))>0);
  await showNavigator(page);await page.locator('.unit-item[data-id="planned-uuv"]').click();await clickWorkspace(page,'settings-open');await page.locator('[data-settings-category=operation]').click();await page.locator('[data-settings-module="entity.route"]').evaluate(e=>e.open=true);await page.locator('#route-plan-open').click();
  await page.locator('#navigation-inspect').click();assert(Number(await page.locator('#navigation-inspection').getAttribute('data-issues'))>0);
  await page.locator('#navigation-clearance').fill('20');await page.locator('#navigation-generate').click();
  const generated=await page.locator('#navigation-points').inputValue();assert(generated.split('\n').length>2);assert.equal(await page.locator('#navigation-inspection').getAttribute('data-issues'),'0');
  await page.locator('#navigation-via').fill('0, 0\n7000, 0');await page.locator('#navigation-generate').click();assert(await page.locator('#navigation-error').isVisible());assert.equal(await page.locator('#navigation-points').inputValue(),generated);
  await page.locator('#navigation-save').click();if(await page.locator('#settings-editor').isVisible())await page.locator('#settings-apply').click();assert(await page.locator('#navigation-dialog').isHidden());assert.equal(await page.locator('#route-check-status').getAttribute('data-issues'),'0');
  await clickWorkspace(page,'settings-open');await page.locator('[data-settings-category=operation]').click();await page.locator('[data-settings-module="entity.route"]').evaluate(e=>e.open=true);await page.locator('#route-plan-open').click();const rows=generated.split('\n');rows[1]='0, 0, -100';await page.locator('#navigation-points').fill(rows.join('\n'));await page.locator('#navigation-save').click();if(await page.locator('#settings-editor').isVisible())await page.locator('#settings-apply').click();
  assert(Number(await page.locator('#route-check-status').getAttribute('data-issues'))>0);
  await clickWorkspace(page,'route-check-open');assert((await page.locator('#route-check-list').textContent()).includes('区間'));await page.locator('#route-check-close').click();
  const editedDownload=page.waitForEvent('download');await page.locator('#save').click();const editedPath=await (await editedDownload).path(),edited=JSON.parse(fs.readFileSync(editedPath));assert.equal(edited.units[0].route[0].x,0);assert(!edited.units[0].generate);
  await page.locator('#undo').click();assert.equal(await page.locator('#route-check-status').getAttribute('data-issues'),'0');
  await page.locator('#redo').click();assert(Number(await page.locator('#route-check-status').getAttribute('data-issues'))>0);
  await page.locator('#file').setInputFiles(editedPath);await clickWorkspace(page,'settings-open');await page.locator('[data-settings-category=operation]').click();await page.locator('[data-settings-module="entity.route"]').evaluate(e=>e.open=true);await page.locator('#route-plan-open').click();assert.equal(await page.locator('#navigation-points').inputValue(),rows.join('\n'));await page.locator('#navigation-cancel').click();if(await page.locator('#settings-editor').isVisible()&&await page.locator('#behavior-dialog').isHidden())await page.locator('#settings-back').click();
  // A raw LLM generation request becomes a regular shared route on load/save.
  const raw=fs.readFileSync(path.join(repository,'data/route-planning-demo.txt'),'utf8');fs.writeFileSync(path.join(folder,'generate.txt'),raw);await page.locator('#file').setInputFiles(path.join(folder,'generate.txt'));
  await page.waitForFunction(()=>document.getElementById('title').value==='島と浅瀬を避ける自動生成経路');assert.equal(await page.locator('#route-check-status').getAttribute('data-issues'),'0');
  await showNavigator(page);await page.locator('.unit-item[data-id="planned-uuv"]').click();await clickWorkspace(page,'settings-open');await page.locator('[data-settings-category=operation]').click();await page.locator('[data-settings-module="entity.route"]').evaluate(e=>e.open=true);await page.locator('#route-plan-open').click();assert((await page.locator('#navigation-points').inputValue()).split('\n').length>2);await page.locator('#navigation-cancel').click();if(await page.locator('#settings-editor').isVisible()&&await page.locator('#behavior-dialog').isHidden())await page.locator('#settings-back').click();
  await page.locator('#record-run').click();await page.waitForFunction(()=>document.getElementById('recording-info').textContent.includes('記録済み'),{},{timeout:60000});
  const download=page.waitForEvent('download');await page.locator('#save').click();const saved=JSON.parse(fs.readFileSync(await (await download).path()));assert(!saved.routes[0].generate);assert(saved.routes[0].points.length>2);assert.equal(saved.routes[0].navigation.clearance,20);
  await clickWorkspace(page,'unit-task-open');await page.locator('#graph-edit-tab').click();await page.locator('#behavior-canvas [data-node="go"] > rect:first-child').click();await page.locator('#node-route-edit').click();await page.locator('#navigation-planning summary').click();
  if(!await page.locator('#navigation-domain').isVisible())await page.locator('#navigation-planning summary').click();assert(await page.locator('#navigation-domain').isEnabled());await page.locator('#navigation-inspect').click();assert.equal(await page.locator('#navigation-inspection').getAttribute('data-issues'),'0');
  await page.locator('#navigation-cancel').click();if(await page.locator('#settings-editor').isVisible()&&await page.locator('#behavior-dialog').isHidden())await page.locator('#settings-back').click();await page.locator('#behavior-cancel').click();if(await page.locator('#settings-editor').isVisible())await page.locator('#settings-back').click();
  if(process.env.SIMSIM_ROUTE_SCREENSHOT)await page.screenshot({path:process.env.SIMSIM_ROUTE_SCREENSHOT});assert.deepEqual(errors,[]);
  console.log('PASS: map warnings, fixed-depth generation, invalid anchors preserve output, numeric editing, save/reload, Undo/Redo, LLM generation requests, shared editor and Worker calculation');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(folder,{recursive:true,force:true});}
