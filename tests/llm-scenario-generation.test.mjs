import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Terrain} from '../src/engine.js?v=20261009-configuration-contract-28';
import {importScenario} from '../src/scenario-import.js?v=20261009-configuration-contract-28';
import {createSimulation,sharedSteps,recordingPayload,restoreRecording} from '../src/recorded-engine.js?v=20261009-configuration-contract-28';
import {prepareAnalysis,runDetection} from '../src/detection.js?v=20261009-configuration-contract-28';
import {trialScenario,PARAMETERS} from '../src/parameters.js?v=20261009-configuration-contract-28';
const text=fs.readFileSync(new URL('../docs/llm-scenario-generation.txt',import.meta.url),'utf8');
assert(!/__MINIMAL__|__RECEIVED__|__GROUP__|__PARAMETERS__/.test(text));
const blocks=[...text.matchAll(/```json\n([\s\S]*?)\n```/g)].map(m=>JSON.parse(m[1]));assert.equal(blocks.length,14);
const modern=blocks.filter(b=>b.version===4);assert.equal(modern.length,1);for(const raw of modern){const m=createSimulation(raw);for(const _ of sharedSteps(m,undefined,undefined,{record:true,horizon:raw.duration})){}assert.equal(m.result.invalidUnits,0);assert(m.result.success);assert.deepEqual(restoreRecording(recordingPayload(m)).evaluate(raw.duration).knowledge,m.evaluate(raw.duration).knowledge);}
const scenarios=blocks.filter(b=>b.version===3);assert.equal(scenarios.length,5);
const evidence=[];
for(const raw of scenarios){
 const source=importScenario(raw),model=createSimulation(source);for(const update of sharedSteps(model,undefined,undefined,{record:true,horizon:source.duration})){}
 assert.equal(model.result.invalidUnits,0);assert(!model.states.some(s=>s.error),JSON.stringify(model.states.filter(s=>s.error).map(s=>({id:s.unit.id,error:s.error}))));
 const archive=restoreRecording(recordingPayload(model));assert.deepEqual(archive.evaluate(source.duration).units,model.evaluate(source.duration).units);
 const report={title:source.title,success:model.result.success,time:model.result.successTime};
 if(source.units[0].id==='planned-uuv'){assert(model.result.success);assert.equal(model.evaluate(source.duration).units[0].nodeId,'done');assert(!source.routes[0].generate);assert(source.routes[0].points.length>2);}
 if(source.units[0].id==='boat')assert.equal(model.evaluate(100).units[0].position.x,1500);
 if(source.behaviorAssignments.some(a=>a.id==='respond')){
  assert(model.result.success);assert.equal(model.result.actionEvents.find(e=>e.type==='received'&&e.unitId==='uav').observationTime,10);
  const u=model.evaluate(source.duration).units.find(u=>u.id==='uav');assert.equal(u.position.x,2100);assert.equal(u.position.z,1000);assert.equal(u.nodeId,'done');assert(model.evaluate(source.duration).units.find(u=>u.id==='uuv').position.x>u.position.x);
 }
 if(source.analysis){
  const {conditions,startTrial}=prepareAnalysis(source);let successes=0,trials=0;
  for(const condition of conditions)for(let index=0;index<source.analysis.trials;index++){
   const generated=trialScenario(source,condition,startTrial+index);const s=importScenario(generated.scenario),result=runDetection(createSimulation(s));assert.equal(result.invalidUnits,0);assert.equal(result.constrainedPaths,0);successes+=result.success?1:0;trials++;
  }
  report.conditions=conditions.length;report.trials=trials;report.successes=successes;
 }
 evidence.push(report);
}
// Combine the documented typed-value fragments with actual named resources.
const fragments=blocks.filter(b=>!b.version);
const parameterDefinitions=fragments.find(b=>Array.isArray(b.parameters)),nodeDefinitions=fragments.find(b=>Array.isArray(b.nodes)),parameterBindings=fragments.find(b=>b.parameters&&!Array.isArray(b.parameters));
const reuse=JSON.parse(JSON.stringify(scenarios[1]));
reuse.behaviors.push({id:'reuse',name:'担当値の文書例',initial:'wait',triggers:[],parameters:parameterDefinitions.parameters,nodes:nodeDefinitions.nodes,edges:[{from:'wait',to:'follow',when:'elapsed'},{from:'follow',to:'move',when:'arrived'},{from:'move',to:'report',when:'arrived'}]});
reuse.units.push({...JSON.parse(JSON.stringify(reuse.units[2])),id:'reused-unit',name:'再利用の担当',initial:{x:0,y:0,z:1000},route:[]});
reuse.routes.push({id:'route-a',name:'担当経路',mode:'once',points:[{x:0,y:0,z:1000},{x:500,y:0,z:1000}]});
reuse.destinations.push({id:'reported-target',name:'受信した目的',kind:'received'});
reuse.behaviorAssignments.push({id:'reuse-task',name:'担当値の検証',behaviorId:'reuse',targets:['unit:reused-unit'],...parameterBindings});
const typed=createSimulation(importScenario(reuse));for(const update of sharedSteps(typed,undefined,undefined,{horizon:reuse.duration})){}
assert.equal(typed.states.find(s=>s.unit.id==='reused-unit').graph.nodes[0].seconds,60);
assert.equal(typed.states.find(s=>s.unit.id==='reused-unit').node.id,'move');
assert.equal(typed.states.find(s=>s.unit.id==='reused-unit').status,'standby');
// Ground the new terrain recipes in actual connectivity and interpolated depth.
const islandSource=scenarios.find(s=>s.units.some(u=>u.id==='offshore-uuv')),island=islandSource.terrain;
const coast=blocks.find(b=>b.elevations&&b.columns===9);
assert(coast);assert.equal(coast.elevations.length,coast.columns*coast.rows);
function components(t,land){
 const selected=new Set(t.elevations.map((h,i)=>((h>t.seaLevel)===land)?i:-1).filter(i=>i>=0));let count=0;
 while(selected.size){count++;const stack=[selected.values().next().value];selected.delete(stack[0]);while(stack.length){const i=stack.pop(),x=i%t.columns,y=Math.floor(i/t.columns);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx<0||nx>=t.columns||ny<0||ny>=t.rows)continue;const j=ny*t.columns+nx;if(selected.delete(j))stack.push(j);}}}return count;
}
for(const t of [island,coast]){
 assert.equal(components(t,true),1);assert.equal(components(t,false),1);
 for(let y=0;y<t.rows-1;y++)for(let x=0;x<t.columns-1;x++){
  const i=y*t.columns+x,a=t.elevations[i]>t.seaLevel,b=t.elevations[i+1]>t.seaLevel,c=t.elevations[i+t.columns]>t.seaLevel,d=t.elevations[i+t.columns+1]>t.seaLevel;
  assert(!(a===d&&b===c&&a!==b),'Alternating land/sea creates an ambiguous coastline.');
 }
}
for(let row=0;row<coast.rows;row++){assert(coast.elevations[row*coast.columns]<coast.seaLevel);assert(coast.elevations[(row+1)*coast.columns-1]>coast.seaLevel);}
const terrain=new Terrain(island);for(let x=-7000;x<=7000;x+=125){assert(terrain.height(x,-6000)<=-150);assert.equal(terrain.project({x,y:-6000,z:-100},'subsurface').error,null);}
const sail=createSimulation(islandSource);for(const x of sharedSteps(sail,undefined,undefined,{horizon:islandSource.duration,record:true})){}assert.equal(sail.result.actionEvents.find(e=>e.type==='arrived').time,1400);
const unsafe=JSON.parse(JSON.stringify(islandSource));unsafe.units[0].initial.y=0;unsafe.units[0].route[0].y=0;
const crossing=createSimulation(unsafe);for(const x of sharedSteps(crossing,undefined,undefined,{horizon:unsafe.duration,record:true})){}assert.equal(crossing.evaluate(unsafe.duration).units[0].status,'blocked');
const coastalSource=JSON.parse(JSON.stringify(scenarios[0]));coastalSource.terrain=coast;coastalSource.units[0].initial={x:-7000,y:0,z:0};coastalSource.units[0].route=[{x:-6000,y:0,z:0}];
const coastal= createSimulation(importScenario(coastalSource));for(const x of sharedSteps(coastal,undefined,undefined,{horizon:coastalSource.duration,record:true})){}assert.equal(coastal.evaluate(100).units[0].status,'arrived');
for(const p of PARAMETERS)assert(text.includes('`'+p.key+'`'));
console.log(JSON.stringify({jsonBlocks:blocks.length,completeScenarios:scenarios.length,analysisParameters:PARAMETERS.length,evidence},null,2));
