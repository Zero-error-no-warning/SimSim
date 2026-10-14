import {clickWorkspace,showNavigator} from './workspace-browser-helpers.mjs';
import {UI_BUILD} from '../src/ui-dom.js?v=20261014-route-map-32';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const {chromium}=await import(process.env.SIMSIM_PLAYWRIGHT??'playwright');
const root=path.resolve('.'),server=http.createServer((req,res)=>{const file=path.join(root,new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');try{res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.SIMSIM_BROWSER_EXECUTABLE?{executablePath:process.env.SIMSIM_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack);});page.setDefaultTimeout(15000);
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForSelector('#boot[hidden]',{state:'attached'});
 await page.evaluate(async build=>{const {MapView}=await import('/src/view.js?v='+build);const render=MapView.prototype.render;MapView.prototype.render=function(){window.testView=this;return render.call(this);};},UI_BUILD);await page.waitForFunction(()=>window.testView);
 await showNavigator(page);await page.locator('.unit-item[data-id=uav]').click();await clickWorkspace(page,'settings-open');await page.locator('[data-settings-category=operation]').click();await page.locator('[data-settings-module="entity.route"] > summary').click();await page.locator('#route-plan-open').click();
 const original=await page.locator('#navigation-points').inputValue();assert(original.split('\n').length>=2);await page.locator('#navigation-draw').click();await page.waitForSelector('.route-map-panel');
 const points=()=>page.evaluate(()=>structuredClone(window.testView.routeEditor.points));const start=await points();assert.equal(start.length,original.split('\n').length);
 assert(await page.locator('#settings-editor').isHidden());assert(await page.locator('#navigation-dialog').isHidden());
 // Native values are preserved in the custom selection popup.
 await page.locator('[data-route-point]').click();await page.locator('#simsim-select-options [data-option-index="1"]').click();assert.equal(await page.locator('[data-route-point]').inputValue(),'1');
 await page.locator('[data-route-height]').fill('1800');await page.locator('[data-route-height]').press('Tab');assert.equal((await points())[1].z,1800);
 const xy=async i=>page.evaluate(i=>{const v=window.testView,p=v.screenPoint(v.routeEditor.sprites[i].position),r=v.renderer.domElement.getBoundingClientRect();return {x:r.left+p.x,y:r.top+p.y};},i);
 let p=await xy(1);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+45,p.y,{steps:5});await page.mouse.up();const horizontal=(await points())[1];assert(Math.abs(horizontal.x-start[1].x)>1);assert.equal(horizontal.z,1800);
 p=await xy(1);await page.keyboard.down('Shift');await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x,p.y-30,{steps:5});await page.mouse.up();await page.keyboard.up('Shift');const vertical=(await points())[1];assert.equal(vertical.x,horizontal.x);assert.equal(vertical.y,horizontal.y);assert(vertical.z>horizontal.z);
 // Add a point to the visible plane, then remove it; reject impossible underwater height.
 const q=await page.evaluate(()=>{const v=window.testView,p=v.screenPoint(v.world({x:6000,y:4000,z:v.routeEditor.height})),r=v.renderer.domElement.getBoundingClientRect();return{x:p.x+r.x,y:p.y+r.y};});await page.mouse.click(q.x,q.y);assert.equal((await points()).length,start.length+1);await page.locator('[data-route-delete]').click();assert.equal((await points()).length,start.length);
 await page.locator('[data-route-height]').fill('-100');await page.locator('[data-route-height]').press('Tab');assert((await page.locator('.route-map-panel output').innerText()).length);assert((await points()).every(p=>p.z>0));
 await page.screenshot({path:'/tmp/simsim-route-editor.png'});await page.locator('[data-route-done]').click();await page.waitForSelector('#navigation-dialog[open]');assert((await page.locator('#navigation-points').inputValue()).includes(String(vertical.z)));
 const edited=await page.locator('#navigation-points').inputValue();await page.locator('#navigation-draw').click();await page.locator('[data-route-delete]').click();await page.keyboard.press('Escape');await page.waitForSelector('#navigation-dialog[open]');assert.equal(await page.locator('#navigation-points').inputValue(),edited);
 await page.locator('#navigation-save').click();await page.locator('#settings-apply').click();await page.waitForSelector('#settings-editor[hidden]',{state:'attached'});
 // The node's named route uses the same map editor and returns to the task draft.
 await clickWorkspace(page,'unit-task-open');await page.locator('#graph-edit-tab').click();await page.locator('#behavior-canvas g[data-node="patrol"] > rect').first().click();await page.locator('#node-route-edit').click();const named=await page.locator('#navigation-points').inputValue();await page.locator('#navigation-draw').click();assert.equal((await points()).length,named.split('\n').length);await page.locator('[data-route-cancel]').click();await page.waitForSelector('#navigation-dialog[open]');assert.equal(await page.locator('#navigation-points').inputValue(),named);assert(await page.locator('#behavior-dialog').isVisible());
 const routeId=await page.locator('#navigation-resource').inputValue();await page.locator('#navigation-draw').click();await page.locator('[data-route-point]').selectOption('1');await page.locator('[data-route-height]').fill('2200');await page.locator('[data-route-height]').press('Tab');await page.locator('[data-route-done]').click();await page.locator('#navigation-save').click();await page.locator('#behavior-apply').click();await page.locator('#settings-apply').click();
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#save').click()]);const saved=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(saved.routes.find(r=>r.id===routeId).points[1].z,2200);
 assert.deepEqual(errors,[]);console.log('PASS: unit/task route entry, preserving points, popup selection, add/delete, horizontal and vertical dragging, numeric height validation, map cancel, nested draft return and apply');
}finally{await browser?.close();server.close();}
