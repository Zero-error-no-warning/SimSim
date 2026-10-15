import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {UI_BUILD} from '../src/ui-dom.js?v=20261015-sensor-planes-37';
const {chromium}=await import(process.env.SIMSIM_PLAYWRIGHT??'playwright');
const root=path.resolve('.'),server=http.createServer((req,res)=>{
 const file=path.join(root,new URL(req.url,'http://local').pathname);res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');try{res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.SIMSIM_BROWSER_EXECUTABLE?{executablePath:process.env.SIMSIM_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1100,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/tests/fixtures/map-view.html');
 const result=await page.evaluate(async build=>{
  const {MapView}=await import('/src/view.js?v='+build),{createSimulation}=await import('/src/recorded-engine.js?v='+build);
  const source=await(await fetch('/data/information-mission.txt')).json();source.terrain.elevations[24]=800;source.units.find(u=>u.id==='uav').initial={x:12000,y:5000,z:2000};source.units.find(u=>u.id==='uuv').initial={x:6000,y:10000,z:-200};const model=createSimulation(source),view=new MapView(document.getElementById('map'),{});window.mapTest=view;
  view.setScenario(model.scenario,'uav',model);view.fit();view.updateSnapshot(model.evaluate(0));view.render();
  const initial={spacing:view.gridSpacing,count:view.projectionPoints.count,lines:view.altitudeLines.geometry.drawRange.count,coast:view.coastline.geometry.attributes.position.count,opacity:view.terrainMesh.material.opacity,vertexColors:view.terrainMesh.material.vertexColors,altitude:document.querySelector('[data-map-kind=altitude]').textContent};
  view.knowledgeOwner='uav';view.updateSnapshot(model.evaluate(0));view.render();const known=view.projectionPoints.count;
  view.knowledgeOwner=null;view.updateSnapshot(model.evaluate(0));view.setExaggeration(1);view.render();const positions=view.altitudeLines.geometry.attributes.position;const base=positions.getY(1);
  const changed=structuredClone(source.terrain);changed.seaLevel=125;changed.elevations=changed.elevations.map(z=>z+125);view.previewTerrain(changed);view.render();const water=view.water.position.y;
  view.previewTerrain(source.terrain);view.camera.position.copy(view.controls.target).add({x:15000,y:-15000,z:10000});view.controls.update();view.render();const below=view.camera.position.y<view.controls.target.y;
  return {initial,units:model.scenario.units.length,known,base,water,below};
 },UI_BUILD);
 assert.equal(result.initial.count,result.units);assert.equal(result.initial.lines,result.units*2);assert(result.initial.spacing<5000);assert(result.initial.coast>0);assert(result.initial.opacity<.15);assert.equal(result.initial.vertexColors,false);assert(result.initial.altitude.includes('海面上'));assert.equal(result.known,1);assert.equal(result.base,0);assert.equal(result.water,125);assert(result.below);
 await page.screenshot({path:'/tmp/simsim-briefing-underwater.png'});
 await page.evaluate(()=>{const v=window.mapTest;v.fit();v.setExaggeration(4);v.render();});await page.screenshot({path:'/tmp/simsim-briefing-map.png'});
 await page.evaluate(()=>{const v=window.mapTest;v.setMode('top');v.render();});await page.screenshot({path:'/tmp/simsim-briefing-top.png'});
 assert.deepEqual(errors,[]);console.log('PASS: conforming grid/coast, transparent terrain, altitude projections, information mask, exaggeration, nonzero sea preview, underwater and top views');
}finally{await browser?.close();server.close();}
