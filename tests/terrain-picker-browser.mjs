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


  page.on('dialog',d=>d.accept().catch(()=>{}));page.setDefaultTimeout(10000);
  const source={version:3,unitsSystem:'SI',title:'Terrain picker',duration:30,terrain:{columns:9,rows:9,spacing:500,origin:{x:0,y:0},seaLevel:0,elevations:Array(81).fill(-125.625)},units:[],behaviors:[],behaviorAssignments:[],recording:{step:10,interval:10}};
  fs.writeFileSync(path.join(folder,'input.jsn'),JSON.stringify(source));await page.locator('#file').setInputFiles(path.join(folder,'input.jsn'));await page.locator('#viewtop').click();await page.locator('#terrain-edit').click();
  const change=async(id,value)=>{await page.locator('#'+id).fill(String(value));await page.locator('#'+id).press('Tab');};
  const canvas=page.locator('#map canvas'),click=async(button='left')=>{const r=await canvas.boundingBox();await page.mouse.click(r.x+r.width/2,r.y+r.height/2,{button});};
  const pick=async()=>{await click('right');assert(await page.locator('#map-menu').isHidden());return Number(await page.locator('#terrain-brush-target').inputValue());};
  const save=async(name)=>{const [d]=await Promise.all([page.waitForEvent('download'),page.locator('#save').click()]);await d.saveAs(path.join(folder,name));return JSON.parse(fs.readFileSync(path.join(folder,name)));};
  assert.equal(await pick(),-125.625);assert.equal(await page.locator('#terrain-brush-mode').inputValue(),'flatten');assert(await page.locator('#terrain-brush-strength').isVisible());assert(await page.locator('#terrain-undo').isDisabled());
  await change('terrain-brush-radius',1000);await change('terrain-brush-target',100);await change('terrain-brush-strength',0);await click();assert(await page.locator('#terrain-undo').isDisabled());
  await change('terrain-brush-strength',50);await click();assert(await page.locator('#terrain-undo').isEnabled());const first=await pick();assert(first> -125.625&&first<100);
  await change('terrain-brush-target',100);await click();const second=await pick();assert(second>first&&second<100);
  await page.locator('#terrain-undo').click();assert(Math.abs(await pick()-first)<.01);await page.locator('#terrain-redo').click();assert(Math.abs(await pick()-second)<.01);
  await page.locator('.map-toolbar .menu-popover summary').click();await page.locator('#exaggeration').selectOption('16');await page.locator('.map-toolbar .menu-popover summary').click();assert(Math.abs(await pick()-second)<.01);
  await change('terrain-brush-target',-500);await change('terrain-brush-strength',25);await click();const lowered=await pick();assert(lowered<second&&lowered> -500);
  // Dragging with the right button, even back to its starting point, only moves the camera.
  await change('terrain-brush-target',321);await page.locator('#terrain-brush-mode').selectOption('raise');const r=await canvas.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down({button:'right'});await canvas.dispatchEvent('contextmenu',{clientX:r.x+r.width/2,clientY:r.y+r.height/2});await page.mouse.move(r.x+r.width/2+45,r.y+r.height/2+20,{steps:4});await page.mouse.move(r.x+r.width/2,r.y+r.height/2,{steps:4});await page.mouse.up({button:'right'});assert.equal(await page.locator('#terrain-brush-mode').inputValue(),'raise');assert.equal(await page.locator('#terrain-brush-target').inputValue(),'321');assert(await page.locator('#map-menu').isHidden());
  await page.keyboard.down('Shift');await click('right');await page.keyboard.up('Shift');assert(await page.locator('#map-menu').isVisible());assert((await page.locator('#map-menu').textContent()).includes('ここの標高を取得'));await page.locator('#map-menu').getByRole('menuitem',{name:'ここの標高を取得してそろえる',exact:true}).click();assert.equal(await page.locator('#terrain-brush-mode').inputValue(),'flatten');
  await canvas.focus();await page.keyboard.press('Shift+F10');assert(await page.locator('#map-menu').isVisible());await page.keyboard.press('Escape');assert(await page.locator('#terrain-panel').isVisible());
  if(process.env.SIMSIM_PICK_SCREENSHOT){await page.waitForTimeout(400);await page.screenshot({path:process.env.SIMSIM_PICK_SCREENSHOT});}
  await page.locator('#terrain-cancel').click();assert.deepEqual((await save('cancel.jsn')).terrain,source.terrain);
  await page.locator('.map-toolbar .menu-popover summary').click();await page.locator('#exaggeration').selectOption('4');await page.locator('.map-toolbar .menu-popover summary').click();await page.locator('#viewtop').click();await page.locator('#terrain-edit').click();await page.locator('#terrain-brush-mode').selectOption('flatten');await change('terrain-brush-strength',50);await change('terrain-brush-target',100);await click();await page.locator('#terrain-apply').click();const saved=await save('applied.jsn');assert(saved.terrain.elevations.some(h=>h> -125.625&&h<100));await page.locator('#undo').click();assert.deepEqual((await save('undo.jsn')).terrain,source.terrain);await page.locator('#redo').click();assert.deepEqual((await save('redo.jsn')).terrain,saved.terrain);
  await page.locator('#file').setInputFiles(path.join(folder,'applied.jsn'));await page.locator('#record-run').click();await page.waitForFunction(()=>!document.getElementById('play').disabled,{},{timeout:60000});
  // Switching from a large metre increment to smoothing uses the separate percentage.
  await page.locator('#terrain-edit').click();await page.locator('#terrain-brush-mode').selectOption('raise');await change('terrain-brush-amount',10000);await page.locator('#terrain-brush-mode').selectOption('smooth');assert(await page.locator('#terrain-brush-amount').isHidden());assert(await page.locator('#terrain-brush-strength').isVisible());assert((await page.locator('#terrain-edit-info').textContent()).includes('ブラシ範囲は円'));await page.locator('#terrain-cancel').click();
  // In 3D the sampled coordinates must come from the terrain surface, not the sea plane.
  const sloped=structuredClone(source);sloped.terrain.elevations=Array.from({length:81},(_,i)=>-300+(i%9)*50+Math.floor(i/9)*10);fs.writeFileSync(path.join(folder,'slope.jsn'),JSON.stringify(sloped));await page.locator('#file').setInputFiles(path.join(folder,'slope.jsn'));await page.locator('#view3d').click();await page.locator('#terrain-edit').click();await page.waitForTimeout(400);const slopeBox=await canvas.boundingBox(),pickX=Math.round(slopeBox.x+slopeBox.width*.58),pickY=Math.round(slopeBox.y+slopeBox.height*.57);await page.mouse.move(pickX,pickY);const coordinates=(await page.locator('#cursor-position').textContent()).match(/x ([\d.-]+) km \/ y ([\d.-]+) km/);assert(coordinates);const expectedHeight=-300+Number(coordinates[1])*100+Number(coordinates[2])*20;await page.mouse.click(pickX,pickY,{button:'right'});assert(Math.abs(Number(await page.locator('#terrain-brush-target').inputValue())-expectedHeight)<.61,JSON.stringify({coordinates:coordinates[0],expectedHeight,actual:Number(await page.locator('#terrain-brush-target').inputValue())}));assert(await page.locator('#terrain-undo').isDisabled());await page.locator('#terrain-cancel').click();
  assert.deepEqual(errors,[]);console.log('PASS: right-click draft height picker, fractional underwater heights independent of display scale, automatic flatten, partial/zero/repeated strength, Undo/Redo, right-drag and return gesture guards, Shift/context-key menus, cancel/save/reload/Worker and separate smoothing strength');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(folder,{recursive:true,force:true});}
