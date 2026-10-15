import {clickWorkspace,showNavigator} from './workspace-browser-helpers.mjs';
import {UI_BUILD} from '../src/ui-dom.js?v=20261015-sensor-planes-37';
import assert from 'node:assert/strict';import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
const {chromium}=await import(process.env.SIMSIM_PLAYWRIGHT??'playwright'),root=path.resolve('.');
const server=http.createServer((req,res)=>{const file=path.join(root,new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');try{res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.SIMSIM_BROWSER_EXECUTABLE?{executablePath:process.env.SIMSIM_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack);});page.setDefaultTimeout(15000);
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForSelector('#boot[hidden]',{state:'attached'});
 await page.evaluate(async build=>{const {MapView}=await import('/src/view.js?v='+build),render=MapView.prototype.render;MapView.prototype.render=function(){window.testView=this;return render.call(this);};},UI_BUILD);await page.waitForFunction(()=>window.testView);
 await page.locator('#sample-picker').selectOption('curved-route-demo.txt');await page.waitForFunction(()=>document.getElementById('title').value==='3次元の曲線と経路全体の速度変化');await showNavigator(page);await page.locator('.unit-item[data-id=sea]').click();
 const camera=()=>page.evaluate(()=>{const v=window.testView;return {position:v.camera.position.toArray(),target:v.controls.target.toArray(),zoom:v.camera.zoom};});
 const beforeCamera=await camera();
 // A waypoint click enters inline editing directly, without opening another screen.
 const waypoint=await page.evaluate(()=>{const v=window.testView,h=v.handles.find(h=>h.index===1),p=v.screenPoint(h.mesh.position),r=v.renderer.domElement.getBoundingClientRect();return{x:p.x+r.x,y:p.y+r.y};});
 await page.mouse.click(waypoint.x,waypoint.y);await page.waitForSelector('.route-inline-panel');
 assert.deepEqual(await camera(),beforeCamera);assert.equal(await page.locator('dialog[open]').count(),0);assert(await page.locator('#settings-editor').isHidden());
 const read=()=>page.evaluate(async build=>{const {routeEditingData}=await import('/src/editor.js?v='+build);return structuredClone(routeEditingData(window.testView.scenario,window.testView.selected));},UI_BUILD);
 const original=await read();await page.locator('[data-route-smooth]').click();const smooth=await read();assert(smooth.points.some(p=>p.in&&p.out));
 assert.deepEqual(await camera(),beforeCamera);
 // One complete drag is one undo step, and Escape during a drag commits nothing.
 const knob=()=>page.evaluate(()=>{const v=window.testView,h=v.routeEditor.handleMarkers.find(h=>h.side==='out'),p=v.screenPoint(h.sprite.position),r=v.renderer.domElement.getBoundingClientRect();return {x:p.x+r.x,y:p.y+r.y,index:h.index};});
 let h=await knob();await page.mouse.move(h.x,h.y);await page.mouse.down();await page.mouse.move(h.x,h.y-25,{steps:5});await page.mouse.up();const dragged=await read();assert.notDeepEqual(dragged.points,smooth.points);
 await page.keyboard.press('Control+z');assert.deepEqual((await read()).points,smooth.points);assert(await page.locator('.route-inline-panel').isVisible());
 await page.keyboard.press('Control+y');assert.deepEqual((await read()).points,dragged.points);
 h=await knob();await page.mouse.move(h.x,h.y);await page.mouse.down();await page.mouse.move(h.x+20,h.y,{steps:4});await page.keyboard.press('Escape');await page.mouse.up();assert.deepEqual((await read()).points,dragged.points);
 h=await knob();await page.mouse.move(h.x,h.y);await page.mouse.down();await page.mouse.move(h.x+15,h.y,{steps:3});await page.keyboard.press('Control+z');await page.mouse.up();assert.deepEqual((await read()).points,smooth.points);await page.keyboard.press('Control+y');assert.deepEqual((await read()).points,dragged.points);
 // Speed edits are committed in place; periodic endpoints remain linked.
 await page.locator('[data-route-speed] > summary').click();const host=page.locator('[data-route-speed-host]');await host.locator('[data-speed-enabled]').check();await host.locator('[data-speed-preset=hill]').click();
 const prior=await read();const circle=host.locator('circle[data-speed-node="0"][data-speed-side=out]');await circle.scrollIntoViewIfNeeded();const b=await circle.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+8,b.y+b.height/2-15,{steps:5});await page.mouse.up();
 const edited=await read();assert.notDeepEqual(edited.speedProfile,prior.speedProfile);assert.equal(edited.speedProfile.points[0].v,edited.speedProfile.points.at(-1).v);
 await page.keyboard.press('Control+z');assert.deepEqual((await read()).speedProfile,prior.speedProfile);await page.keyboard.press('Control+y');assert.deepEqual((await read()).speedProfile,edited.speedProfile);
 // A map insertion changes only geometry, and undo keeps the speed profile.
 await page.locator('[data-route-insert]').click();const add=await page.evaluate(()=>{const v=window.testView,p=v.screenPoint(v.world({x:-2500,y:500,z:v.routeEditor.height})),r=v.renderer.domElement.getBoundingClientRect();return{x:p.x+r.x,y:p.y+r.y};});await page.mouse.click(add.x,add.y);assert.equal((await read()).points.length,edited.points.length+1);assert.deepEqual((await read()).speedProfile,edited.speedProfile);await page.keyboard.press('Control+z');assert.deepEqual((await read()).points,edited.points);
 // Switching units is possible directly on the map while the editor is open.
 const other=await page.evaluate(()=>{const v=window.testView,r=v.renderer.domElement.getBoundingClientRect(),[id,m]=[...v.markers].find(([id,m])=>{const p=v.screenPoint(m.position);return id!==v.selected&&v.pickUnit({clientX:p.x+r.x,clientY:p.y+r.y})===id;}),p=v.screenPoint(m.position);return{id,x:p.x+r.x,y:p.y+r.y};});await page.mouse.click(other.x,other.y);await page.waitForFunction(id=>window.testView.selected===id,other.id);assert.equal(await page.locator('.route-inline-panel').count(),0);
 await page.locator('.unit-item[data-id=sea]').click();
 // Clicking a path itself is another direct entry. Pick a visible segment midpoint.
 const line=await page.evaluate(()=>{const v=window.testView,r=v.renderer.domElement.getBoundingClientRect();for(const l of v.routes.children){if(l.userData.unitId!==v.selected||!l.visible)continue;const a=l.geometry.attributes.position;for(let i=1;i<a.count;i++){const x=(a.getX(i-1)+a.getX(i))/2,y=(a.getY(i-1)+a.getY(i))/2,z=(a.getZ(i-1)+a.getZ(i))/2,p=v.screenPoint(v.world({x,y:-z,z:y/v.exaggeration}));if(p.visible&&p.x>50&&p.x<r.width-50&&p.y>100&&p.y<r.height-50){const event={clientX:p.x+r.x,clientY:p.y+r.y};if(!v.pickUnit(event)&&!v.pickHandle(event))return{x:event.clientX,y:event.clientY};}}}return null;});assert(line);await page.mouse.click(line.x,line.y);await page.waitForSelector('.route-inline-panel');assert.equal(await page.locator('dialog[open]').count(),0);
 await page.screenshot({path:'/tmp/simsim-inline-route-speed.png'});
 // The regular save button is available without closing inline editing.
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#save').click()]);const saved=JSON.parse(fs.readFileSync(await download.path(),'utf8'));const {routeEditingData}=await import('../src/editor.js?v=20261015-sensor-planes-37'+UI_BUILD);const savedRoute=routeEditingData(saved,'sea');assert.deepEqual(savedRoute.points,edited.points);assert.deepEqual(savedRoute.speedProfile,edited.speedProfile);
 await page.locator('[data-route-done]').click();assert.equal(await page.locator('.route-inline-panel').count(),0);assert.deepEqual((await read()).speedProfile,edited.speedProfile);assert.deepEqual(errors,[]);
 console.log('PASS: direct waypoint/path entry, unchanged camera, immediate curve and speed persistence, one undo per drag, Escape rollback, periodic speed graph, insertion/profile preservation, other-unit map selection, save without closing editor');
}finally{await browser?.close();server.close();}
