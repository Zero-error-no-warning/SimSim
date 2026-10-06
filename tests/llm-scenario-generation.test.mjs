import assert from 'node:assert/strict';
import fs from 'node:fs';
import {importScenario} from '../src/scenario-import.js?v=20261006-received-position-12';
import {createSimulation,sharedSteps,recordingPayload,restoreRecording} from '../src/recorded-engine.js?v=20261006-received-position-12';
import {prepareAnalysis,runDetection} from '../src/detection.js?v=20261006-received-position-12';
import {trialScenario,PARAMETERS} from '../src/parameters.js?v=20261006-received-position-12';
const text=fs.readFileSync(new URL('../docs/llm-scenario-generation.txt',import.meta.url),'utf8');
assert(!/__MINIMAL__|__RECEIVED__|__GROUP__|__PARAMETERS__/.test(text));
const blocks=[...text.matchAll(/```json\n([\s\S]*?)\n```/g)].map(m=>JSON.parse(m[1]));assert.equal(blocks.length,9);
const scenarios=blocks.filter(b=>b.version===3);assert.equal(scenarios.length,3);
const evidence=[];
for(const raw of scenarios){
 const source=importScenario(raw),model=createSimulation(source);for(const update of sharedSteps(model,undefined,undefined,{record:true,horizon:source.duration})){}
 assert.equal(model.result.invalidUnits,0);assert(!model.states.some(s=>s.error),JSON.stringify(model.states.filter(s=>s.error).map(s=>({id:s.unit.id,error:s.error}))));
 const archive=restoreRecording(recordingPayload(model));assert.deepEqual(archive.evaluate(source.duration).units,model.evaluate(source.duration).units);
 const report={title:source.title,success:model.result.success,time:model.result.successTime};
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
const reuse=JSON.parse(JSON.stringify(scenarios[1]));
reuse.behaviors.push({id:'reuse',name:'担当値の文書例',initial:'wait',triggers:[],parameters:fragments[0].parameters,nodes:fragments[1].nodes,edges:[{from:'wait',to:'follow',when:'elapsed'},{from:'follow',to:'move',when:'arrived'},{from:'move',to:'report',when:'arrived'}]});
reuse.units.push({...JSON.parse(JSON.stringify(reuse.units[2])),id:'reused-unit',name:'再利用の担当',initial:{x:0,y:0,z:1000},route:[]});
reuse.routes.push({id:'route-a',name:'担当経路',mode:'once',points:[{x:0,y:0,z:1000},{x:500,y:0,z:1000}]});
reuse.destinations.push({id:'reported-target',name:'受信した目的',kind:'received'});
reuse.behaviorAssignments.push({id:'reuse-task',name:'担当値の検証',behaviorId:'reuse',targets:['unit:reused-unit'],...fragments[2]});
const typed=createSimulation(importScenario(reuse));for(const update of sharedSteps(typed,undefined,undefined,{horizon:reuse.duration})){}
assert.equal(typed.states.find(s=>s.unit.id==='reused-unit').graph.nodes[0].seconds,60);
assert.equal(typed.states.find(s=>s.unit.id==='reused-unit').node.id,'move');
assert.equal(typed.states.find(s=>s.unit.id==='reused-unit').status,'standby');
for(const p of PARAMETERS)assert(text.includes('`'+p.key+'`'));
console.log(JSON.stringify({jsonBlocks:blocks.length,completeScenarios:scenarios.length,analysisParameters:PARAMETERS.length,evidence},null,2));
