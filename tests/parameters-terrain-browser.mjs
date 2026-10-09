import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.SIMSIM_PLAYWRIGHT??'playwright');
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),folder=fs.mkdtempSync(path.join(os.tmpdir(),'simsim-navigation-'));
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
  page.on('pageerror',error=>errors.push(error.message));page.on('console',event=>{if(event.type()==='error')errors.push(event.text());});
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.waitForFunction(()=>document.getElementById('recording-info').textContent.includes('未計算'));

  const source=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/legacy/navigation-demo.txt')));
  fs.writeFileSync(path.join(folder,'input.txt'),JSON.stringify(source));await page.locator('#file').setInputFiles(path.join(folder,'input.txt'));
  await page.locator('.unit-item[data-id="actor"]').click();await page.locator('#unit-task-open').click();await page.locator('#graph-edit-tab').click();
  const node=id=>page.locator('#behavior-canvas [data-node="'+id+'"] > rect:first-child');
  await node('a').click();await page.locator('#node-route-binding').selectOption('__new__');
  assert(await page.locator('#behavior-parameter-dialog').isVisible());
  await page.locator('#behavior-parameter-name').fill('巡回経路');await page.locator('#behavior-parameter-default-enabled').uncheck();await page.locator('#behavior-parameter-save').click();
  assert(await page.locator('#node-route').isDisabled());const routeRef=await page.locator('#node-route-binding').inputValue();
  await node('b').click();await page.locator('#node-route-binding').selectOption(routeRef);await page.locator('#node-join-mode').selectOption('nearest');
  await page.locator('#behavior-canvas [data-edge="2"]').focus();await page.keyboard.press('Enter');await page.locator('#edge-near-distance-binding').selectOption('__new__');
  await page.locator('#behavior-parameter-name').fill('接近距離');await page.locator('#behavior-parameter-save').click();
  await node('approach').click();await page.locator('#node-destination-binding').selectOption('__new__');await page.locator('#behavior-parameter-name').fill('移動先');await page.locator('#behavior-parameter-save').click();
  assert(!(await page.locator('#behavior-canvas').textContent()).includes('[object Object]'));
  await page.locator('#behavior-parameters-open').click();await page.locator('#behavior-parameter-list').selectOption({label:'巡回経路'});await page.locator('#behavior-parameter-delete').click();assert((await page.locator('#behavior-parameter-error').textContent()).includes('使用中'));await page.locator('#behavior-parameter-cancel').click();
  await page.locator('#behavior-apply').click();assert(await page.locator('#behavior-dialog').isVisible());assert((await page.locator('#behavior-validation').textContent()).includes('巡回経路'));
  await page.locator('#task-edit-tab').click();const inputs=page.locator('#assignment-parameters [data-parameter]');assert.equal(await inputs.count(),3);
  await inputs.nth(0).selectOption('route-a');const checkbox=page.locator('#assignment-parameters input[type="checkbox"]');await checkbox.nth(0).uncheck();await inputs.nth(1).fill('450');await inputs.nth(1).press('Tab');
  await checkbox.nth(1).uncheck();await inputs.nth(2).selectOption('point-x');
  await page.locator('#behavior-apply').click();await page.waitForSelector('#behavior-dialog:not([open])',{state:'attached'});
  const save=async filename=>{const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#save').click()]);const file=path.join(folder,filename);await download.saveAs(file);return JSON.parse(fs.readFileSync(file));};
  const saved=await save('parameters.txt'),g=saved.behaviors[0];assert.equal(g.parameters.length,3);assert.equal(g.nodes.find(n=>n.id==='b').joinMode,'nearest');assert.equal(saved.behaviorAssignments[0].parameters[g.parameters[0].id],'route-a');assert.equal(saved.behaviorAssignments[0].parameters[g.parameters[1].id],450);
  await page.locator('#file').setInputFiles(path.join(folder,'parameters.txt'));await page.locator('.unit-item[data-id="actor"]').click();await page.locator('#unit-task-open').click();assert.equal(await page.locator('#assignment-parameters [data-parameter]').nth(1).inputValue(),'450');await page.locator('#behavior-cancel').click();
  await page.locator('#record-run').click();await page.waitForFunction(()=>!document.getElementById('play').disabled,{},{timeout:60000});
  await page.locator('#viewtop').click();await page.locator('#terrain-edit').click();assert(await page.locator('#terrain-panel').isVisible());
  await page.locator('#terrain-brush-radius').fill('1800');await page.locator('#terrain-brush-radius').press('Tab');await page.locator('#terrain-brush-amount').fill('100');await page.locator('#terrain-brush-amount').press('Tab');
  let canvas=await page.locator('#map canvas').boundingBox();await page.mouse.move(canvas.x+canvas.width*.45,canvas.y+canvas.height*.5);await page.mouse.down();await page.mouse.move(canvas.x+canvas.width*.6,canvas.y+canvas.height*.5,{steps:8});await page.mouse.up();
  assert(await page.locator('#terrain-undo').isEnabled());await page.locator('#terrain-undo').click();assert(await page.locator('#terrain-redo').isEnabled());await page.locator('#terrain-redo').click();
  if(process.env.SIMSIM_EDITOR_SCREENSHOT)await page.screenshot({path:process.env.SIMSIM_EDITOR_SCREENSHOT});
  await page.locator('#terrain-apply').click();assert(await page.locator('#terrain-panel').isHidden());
  const terrain=await save('terrain.txt');assert(terrain.terrain.elevations.some((v,i)=>v!==saved.terrain.elevations[i]));assert((await page.locator('#recording-info').textContent()).includes('未計算'));
  await page.locator('#undo').click();assert.deepEqual((await save('terrain-undo.txt')).terrain,saved.terrain);await page.locator('#redo').click();assert.deepEqual((await save('terrain-redo.txt')).terrain,terrain.terrain);
  await page.locator('#terrain-edit').click();canvas=await page.locator('#map canvas').boundingBox();await page.mouse.click(canvas.x+canvas.width*.5,canvas.y+canvas.height*.5);await page.keyboard.press('Escape');assert(await page.locator('#terrain-panel').isHidden());assert.deepEqual((await save('terrain-cancel.txt')).terrain,terrain.terrain);
  await page.setViewportSize({width:1200,height:900});await page.locator('#terrain-edit').click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert(await page.locator('#terrain-panel').evaluate(el=>el.scrollWidth<=el.clientWidth));
  await page.locator('#terrain-cancel').click();
  await page.locator('#unit-task-open').click();await page.locator('#graph-edit-tab').click();await page.locator('#behavior-fit').click();await node('a').click();await page.locator('#node-route-binding').selectOption('__new__');assert(await page.locator('#behavior-parameter-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth));await page.locator('#behavior-parameter-cancel').click();await page.locator('#behavior-cancel').click();
  assert.deepEqual(errors,[]);
  console.log('PASS: placeholder creation/reuse, missing binding errors, assignment defaults/overrides, protected deletion, nearest entry, save/reopen, Worker, terrain brush preview/Undo/Redo/apply/cancel, invalidated recordings and desktop layout');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(folder,{recursive:true,force:true});}
