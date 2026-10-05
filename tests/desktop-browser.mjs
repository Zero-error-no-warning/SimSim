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

  const source=JSON.parse(fs.readFileSync(path.join(root,'data/navigation-demo.jsn')));
  fs.writeFileSync(path.join(folder,'input.jsn'),JSON.stringify(source));await page.locator('#file').setInputFiles(path.join(folder,'input.jsn'));
  const save=async filename=>{const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#save').click()]);const file=path.join(folder,filename);await download.saveAs(file);return JSON.parse(fs.readFileSync(file));};
  const item=page.locator('.unit-item[data-id="actor"]'),canvas=page.locator('#map canvas');
  assert.equal(await page.locator('#map-operations').count(),0);
  await item.click({button:'right'});assert(await page.locator('#map-menu').isVisible());assert(!(await page.locator('#map-menu').textContent()).includes('水中ユニットを配置'));
  await page.keyboard.press('End');assert((await page.locator('#map-menu :focus').textContent()).includes('配置編集を終了'));await page.keyboard.press('Escape');assert(await page.locator('#map-menu').isHidden());
  await item.focus();await page.keyboard.press('Shift+F10');assert(await page.locator('#map-menu').isVisible());await page.locator('#map-menu').getByRole('menuitem',{name:'担当タスクを編集',exact:true}).click();await page.locator('#graph-edit-tab').click();
  const svg=page.locator('#behavior-canvas'),node=id=>page.locator('#behavior-canvas [data-node="'+id+'"] > rect:first-child'),menu=page.locator('#behavior-menu');
  await node('a').click({button:'right'});assert(await menu.isVisible());assert((await menu.textContent()).includes('ここから接続'));await menu.getByRole('menuitem',{name:'複製　Ctrl+D',exact:true}).click();
  assert.equal(await svg.locator('[data-node]').count(),5);const copy=await svg.locator('.selected').getAttribute('data-node');await svg.focus();await page.keyboard.press('Delete');assert.equal(await svg.locator('[data-node]').count(),4);await page.keyboard.press('Control+z');assert.equal(await svg.locator('[data-node]').count(),5);await page.keyboard.press('Control+Shift+z');assert.equal(await svg.locator('[data-node]').count(),4);
  await node('a').click();const before=await node('a').evaluate(el=>({x:el.getAttribute('x'),y:el.getAttribute('y')})),vb=await svg.getAttribute('viewBox'),box=await node('a').boundingBox();
  await page.keyboard.down('Space');await page.mouse.move(box.x+40,box.y+30);await page.mouse.down();await page.mouse.move(box.x+90,box.y+70,{steps:5});await page.mouse.up();await page.keyboard.up('Space');
  assert.notEqual(await svg.getAttribute('viewBox'),vb);assert.deepEqual(await node('a').evaluate(el=>({x:el.getAttribute('x'),y:el.getAttribute('y')})),before);assert.equal(await svg.locator('.selected').getAttribute('data-node'),'a');
  await page.locator('#behavior-fit').click();let r=await svg.boundingBox();await page.mouse.click(r.x+15,r.y+15,{button:'right'});await menu.getByRole('menuitem',{name:'ここに状態ノードを作る',exact:true}).click();assert.equal(await page.locator('#node-kind').inputValue(),'');const added=await svg.locator('.selected').getAttribute('data-node');await page.locator('#node-kind').selectOption('wait');
  await page.locator('#behavior-fit').click();await node('a').click({button:'right'});await menu.getByRole('menuitem',{name:'ここから接続',exact:true}).click();await node(added).click();assert.equal(await page.locator('#edge-condition').inputValue(),'');assert.equal(await svg.locator('[data-edge]').count(),4);
  await svg.focus();await page.keyboard.press('Delete');assert.equal(await svg.locator('[data-edge]').count(),3);await page.locator('#behavior-fit').click();await node(added).click();await svg.focus();await page.keyboard.press('Delete');
  await page.locator('#behavior-cancel').click();assert.deepEqual((await save('graph-cancel.jsn')).behaviors,source.behaviors);
  await page.locator('#view3d').click();await page.locator('#terrain-edit').click();await canvas.focus();r=await canvas.boundingBox();
  const imageBefore=await canvas.screenshot();await page.keyboard.down('Space');await page.mouse.move(r.x+r.width*.5,r.y+r.height*.5);await page.mouse.down();await page.mouse.move(r.x+r.width*.5+100,r.y+r.height*.5+30,{steps:10});await page.keyboard.up('Space');await page.mouse.move(r.x+r.width*.5+130,r.y+r.height*.5+40,{steps:3});await page.mouse.up();await page.waitForTimeout(300);
  assert(await page.locator('#terrain-undo').isDisabled());assert(!imageBefore.equals(await canvas.screenshot()),'Space drag must actually change 3D viewpoint');
  await page.keyboard.down('Shift');await page.mouse.click(r.x+r.width*.5,r.y+r.height*.5,{button:'right'});await page.keyboard.up('Shift');assert((await page.locator('#map-menu').textContent()).includes('地形を適用'));await page.locator('#map-menu').getByRole('menuitem',{name:'低くする',exact:true}).click();assert.equal(await page.locator('#terrain-brush-mode').inputValue(),'lower');
  await canvas.focus();await page.mouse.move(r.x+r.width*.45,r.y+r.height*.45);await page.mouse.down({button:'right'});await canvas.dispatchEvent('contextmenu',{clientX:r.x+r.width*.45,clientY:r.y+r.height*.45});await page.mouse.move(r.x+r.width*.45+40,r.y+r.height*.45+20,{steps:4});await page.mouse.up({button:'right'});assert(await page.locator('#map-menu').isHidden());assert(await page.locator('#terrain-undo').isDisabled());
  await page.locator('#terrain-apply').click();assert.deepEqual((await save('camera-only.jsn')).terrain,source.terrain);
  // Space gestures during placement and over a unit must not commit any edit.
  await item.click();await page.waitForTimeout(100);const markerLabel=await page.locator('#labels .map-label.selected').boundingBox();await canvas.focus();r=await canvas.boundingBox();await page.keyboard.down('Space');await page.mouse.move(markerLabel.x-18,markerLabel.y+16);await page.mouse.down();await page.mouse.move(markerLabel.x+22,markerLabel.y+16,{steps:5});await page.mouse.up();await page.keyboard.up('Space');assert.deepEqual((await save('camera-unit.jsn')).units,source.units);
  await item.click({button:'right'});await page.locator('#map-menu').getByRole('menuitem',{name:'複製して配置　Ctrl+D',exact:true}).click();await canvas.focus();await page.keyboard.down('Space');await page.mouse.move(r.x+r.width*.5,r.y+r.height*.5);await page.mouse.down();await page.mouse.move(r.x+r.width*.5+40,r.y+r.height*.5,{steps:4});await page.mouse.up();await page.keyboard.up('Space');assert.equal((await save('camera-placement.jsn')).units.length,source.units.length);await page.keyboard.press('Escape');
  await page.locator('#viewtop').click();await page.locator('#terrain-edit').click();await canvas.focus();r=await canvas.boundingBox();const topBefore=await canvas.screenshot();await page.keyboard.down('Space');await page.mouse.move(r.x+r.width*.45,r.y+r.height*.5);await page.mouse.down();await page.mouse.move(r.x+r.width*.45+80,r.y+r.height*.5+30,{steps:5});await page.mouse.up();await page.keyboard.up('Space');assert(await page.locator('#terrain-undo').isDisabled());assert(!topBefore.equals(await canvas.screenshot()));
  await page.mouse.move(r.x+r.width*.5,r.y+r.height*.5);await page.mouse.down();await page.mouse.move(r.x+r.width*.55,r.y+r.height*.5,{steps:3});await page.mouse.up();assert(await page.locator('#terrain-undo').isEnabled());const editedLabel=await page.locator('#labels .map-label.selected').boundingBox();await page.keyboard.down('Shift');await page.mouse.click(editedLabel.x-18,editedLabel.y+16,{button:'right'});await page.keyboard.up('Shift');assert(await page.locator('#terrain-panel').isVisible());assert((await page.locator('#map-menu').textContent()).includes('地形を適用'));await page.keyboard.press('Escape');assert(await page.locator('#terrain-panel').isVisible());await canvas.focus();await page.keyboard.press('Delete');assert(await page.locator('#terrain-panel').isVisible());await page.locator('#terrain-cancel').click();assert.deepEqual((await save('cancel.jsn')).terrain,source.terrain);
  // Exact rectangular area, fixed grid counts, protected shrink and both undo histories.
  await page.locator('#terrain-edit').click();await page.locator('#terrain-size-panel summary').click();
  await page.locator('#terrain-width').fill('5');await page.locator('#terrain-height').fill('6');await page.locator('#terrain-resize').click();assert((await page.locator('#terrain-size-error').textContent()).includes('領域の外'));assert(await page.locator('#terrain-undo').isDisabled());
  await page.locator('#terrain-width').fill('12.3');await page.locator('#terrain-height').fill('7.8');await page.locator('#terrain-resize').click();assert(await page.locator('#terrain-size-error').isHidden());assert((await page.locator('#terrain-edit-info').textContent()).includes('12.3 × 7.8 km'));assert((await page.locator('#terrain-edit-info').textContent()).includes('9 × 7'));
  await page.locator('#terrain-undo').click();assert.equal(await page.locator('#terrain-width').inputValue(),'8');assert.equal(await page.locator('#terrain-height').inputValue(),'6');await page.locator('#terrain-redo').click();assert.equal(await page.locator('#terrain-width').inputValue(),'12.3');
  await page.locator('#terrain-cancel').click();assert.deepEqual((await save('resize-cancel.jsn')).terrain,source.terrain);
  await page.locator('#terrain-edit').click();await page.locator('#terrain-width').fill('12.3');await page.locator('#terrain-height').fill('7.8');await page.locator('#terrain-apply').click();const resized=await save('resized.jsn');assert.equal(resized.terrain.columns,9);assert.equal(resized.terrain.rows,7);assert.equal(resized.terrain.spacing*8,12300);assert.equal(resized.terrain.spacingY*6,7800);assert.deepEqual(resized.units,source.units);
  assert((await page.locator('#terrain-info').textContent()).includes('12.3 × 7.8 km'));await page.locator('#undo').click();assert.deepEqual((await save('resize-undo.jsn')).terrain,source.terrain);await page.locator('#redo').click();assert.deepEqual((await save('resize-redo.jsn')).terrain,resized.terrain);
  await page.locator('#file').setInputFiles(path.join(folder,'resized.jsn'));assert((await page.locator('#terrain-info').textContent()).includes('12.3 × 7.8 km'));await page.locator('#record-run').click();await page.waitForFunction(()=>!document.getElementById('play').disabled,{},{timeout:60000});
  if(process.env.SIMSIM_DESKTOP_SCREENSHOT){await page.locator('#terrain-edit').click();await page.waitForTimeout(400);await page.screenshot({path:process.env.SIMSIM_DESKTOP_SCREENSHOT});}
  assert.deepEqual(errors,[]);
  console.log('PASS: desktop context menus and keyboard navigation, graph add/connect/duplicate/delete/Undo, Space pan preserving node position/selection, 3D rotation and top-view pan while editing terrain, camera gestures do not paint/move/place, fixed-grid exact rectangular size, shrink protection, size Undo/Redo/save/reopen/Worker, save/cancel integrity, no browser errors');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(folder,{recursive:true,force:true});}
