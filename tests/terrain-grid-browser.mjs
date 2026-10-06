import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {UI_BUILD,UI_VERSION} from '../src/ui-dom.js?v=20261006-patrol-transition-18';
const {chromium}=await import(process.env.SIMSIM_PLAYWRIGHT??'playwright');
const root=path.resolve(process.env.SIMSIM_WEB_ROOT??fileURLToPath(new URL('..',import.meta.url))),folder=fs.mkdtempSync(path.join(os.tmpdir(),'simsim-terrain-grid-'));
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
  page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});page.on('dialog',async d=>{await d.accept().catch(()=>{});});
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>document.getElementById('recording-info').textContent.includes('未計算'));
  assert.equal(await page.locator('#app-version').textContent(),UI_VERSION);assert.equal(await page.locator('html').getAttribute('data-simsim-build'),UI_BUILD);
  const source=JSON.parse(fs.readFileSync(new URL('../data/navigation-demo.txt',import.meta.url)));
  source.terrain.elevations=source.terrain.elevations.map((_,i)=>-300+i%source.terrain.columns+10*Math.floor(i/source.terrain.columns));
  const input=path.join(folder,'input.txt');fs.writeFileSync(input,JSON.stringify(source));await page.locator('#file').setInputFiles(input);
  const save=async filename=>{const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#save').click()]);const file=path.join(folder,filename);await download.saveAs(file);return JSON.parse(fs.readFileSync(file));};
  const open=async()=>{await page.locator('#terrain-edit').click();await page.locator('#terrain-size-panel').evaluate(e=>e.open=true);};
  await open();assert.equal(await page.locator('#terrain-columns').inputValue(),'9');assert.equal(await page.locator('#terrain-rows').inputValue(),'7');
  assert((await page.locator('#terrain-grid-info').textContent()).includes('東西 1000 m'));assert((await page.locator('#terrain-info').textContent()).includes('地形格子数 9 × 7'));
  await page.locator('#terrain-columns').fill('17');await page.locator('#terrain-rows').fill('13');assert.equal(await page.locator('#terrain-width').inputValue(),'8');assert.equal(await page.locator('#terrain-height').inputValue(),'6');
  assert((await page.locator('#terrain-grid-info').textContent()).includes('東西 500 m'));await page.locator('#terrain-resize').click();assert(await page.locator('#terrain-size-error').isHidden());assert((await page.locator('#terrain-edit-info').textContent()).includes('地形格子数 17 × 13'));
  await page.locator('#terrain-undo').click();assert.equal(await page.locator('#terrain-columns').inputValue(),'9');await page.locator('#terrain-redo').click();assert.equal(await page.locator('#terrain-columns').inputValue(),'17');
  await page.locator('#terrain-cancel').click();assert.deepEqual((await save('cancel.txt')).terrain,source.terrain);
  // Apply accepts count inputs directly, without requiring a separate preview.
  await open();await page.locator('#terrain-columns').fill('33');await page.locator('#terrain-rows').fill('25');await page.locator('#terrain-apply').click();
  const refined=await save('refined.txt');assert.equal(refined.terrain.columns,33);assert.equal(refined.terrain.rows,25);assert.equal(refined.terrain.spacing,250);assert.equal(refined.terrain.elevations.length,33*25);assert.deepEqual(refined.terrain.origin,source.terrain.origin);assert.deepEqual(refined.units,source.units);assert.deepEqual(refined.routes,source.routes);assert.deepEqual(refined.destinations,source.destinations);
  for(let row=0;row<7;row++)for(let col=0;col<9;col++)assert.equal(refined.terrain.elevations[row*4*33+col*4],source.terrain.elevations[row*9+col]);
  assert((await page.locator('#terrain-info').textContent()).includes('格子間隔 250 × 250 m'));
  await page.locator('#undo').click();assert.deepEqual((await save('undo.txt')).terrain,source.terrain);await page.locator('#redo').click();assert.deepEqual((await save('redo.txt')).terrain,refined.terrain);
  await page.locator('#file').setInputFiles(path.join(folder,'refined.txt'));await open();assert.equal(await page.locator('#terrain-columns').inputValue(),'33');
  for(const value of ['1','514','2.5','']){
    await page.locator('#terrain-columns').fill(value);await page.locator('#terrain-resize').click();assert(await page.locator('#terrain-size-error').isVisible());assert((await page.locator('#terrain-size-error').textContent()).includes('地形格子数'));assert(await page.locator('#terrain-undo').isDisabled());
  }
  await page.locator('#terrain-columns').fill('33');await page.locator('#terrain-rows').fill('2');await page.locator('#terrain-height').fill('20');await page.locator('#terrain-resize').click();assert((await page.locator('#terrain-size-error').textContent()).includes('格子'));
  await page.locator('#terrain-rows').fill('25');await page.locator('#terrain-height').fill('6');await page.locator('#terrain-resize').click();assert(await page.locator('#terrain-size-error').isHidden());assert(await page.locator('#terrain-undo').isDisabled());
  // A rectangular resample updates both intervals while keeping world bounds.
  await page.locator('#terrain-columns').fill('17');await page.locator('#terrain-resize').click();assert((await page.locator('#terrain-edit-info').textContent()).includes('格子間隔 500 × 250 m'));
  await page.locator('#terrain-undo').click();assert.equal(await page.locator('#terrain-columns').inputValue(),'33');
  await page.setViewportSize({width:1200,height:900});assert(await page.locator('#terrain-panel').evaluate(e=>e.scrollWidth<=e.clientWidth));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  // A smaller brush can now change the newly interpolated grid.
  await page.locator('#terrain-size-panel').evaluate(e=>e.open=false);await page.locator('#viewtop').click();await page.locator('#terrain-brush-mode').selectOption('lower');await page.locator('#terrain-brush-radius').fill('600');await page.locator('#terrain-brush-radius').press('Tab');await page.locator('#terrain-brush-amount').fill('10');await page.locator('#terrain-brush-amount').press('Tab');
  const canvas=await page.locator('#map>canvas').boundingBox();await page.mouse.click(canvas.x+canvas.width*.5,canvas.y+canvas.height*.5);assert(await page.locator('#terrain-undo').isEnabled());
  await page.locator('#terrain-apply').click();const painted=await save('painted.txt');assert.notDeepEqual(painted.terrain.elevations,refined.terrain.elevations);assert.equal(painted.terrain.elevations.length,33*25);
  await page.locator('#record-run').click();await page.waitForFunction(()=>!document.getElementById('play').disabled,{},{timeout:60000});await page.locator('#timeline').evaluate(e=>{e.value=60;e.dispatchEvent(new Event('input',{bubbles:true}));});await page.waitForFunction(()=>document.getElementById('clock').textContent==='00:01:00');
  const [record]=await Promise.all([page.waitForEvent('download'),page.locator('#record-save').click()]);await record.saveAs(path.join(folder,'record.txt'));await page.locator('#file').setInputFiles(path.join(folder,'record.txt'));await page.waitForFunction(()=>!document.getElementById('play').disabled);
  assert((await page.locator('#terrain-info').textContent()).includes('地形格子数 33 × 25'));assert.equal(await page.locator('#app-version').textContent(),UI_VERSION);
  if(process.env.SIMSIM_TERRAIN_GRID_SCREENSHOT){await open();await page.screenshot({path:process.env.SIMSIM_TERRAIN_GRID_SCREENSHOT});}
  assert.deepEqual(errors,[]);console.log('PASS: dated UI version, coarse sample resolution, independent terrain grid counts, preview/apply/Undo/Redo/cancel, interpolation, validation, fine brush, save/reload, Worker/record replay and compact desktop layout');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(folder,{recursive:true,force:true});}
