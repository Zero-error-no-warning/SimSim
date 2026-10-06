import assert from 'node:assert/strict';
import fs from 'node:fs';
import {clone,validateScenario} from '../src/engine.js?v=20261006-label-rail-15';
import {createSimulation,sharedSteps,recordingPayload,restoreRecording} from '../src/recorded-engine.js?v=20261006-label-rail-15';
import {runDetection,prepareAnalysis,summarizeRow,restoreAnalysisResult} from '../src/detection.js?v=20261006-label-rail-15';
const source=JSON.parse(fs.readFileSync(new URL('../data/received-position-demo.txt',import.meta.url)));
const run=s=>{const model=createSimulation(s),g=sharedSteps(model,undefined,undefined,{horizon:s.duration,record:true});for(const x of g){}return model;};
const pos=(model,t,id='uav')=>model.evaluate(t).units.find(u=>u.id===id);
const close=(a,b)=>assert(Math.abs(a-b)<.01,`${a} != ${b}`);
const one=clone(source);one.behaviors[2].initial='move';one.behaviors[2].triggers[0].once=true;
const fixed=run(one);
assert.equal(pos(fixed,10).status,'standby');assert.equal(pos(fixed,10).distance,0);
close(pos(fixed,60).position.x,1100);close(pos(fixed,180).position.x,1100);close(pos(fixed,180).position.z,1000);
assert(pos(fixed,180,'uuv').position.x>pos(fixed,180).position.x+500);
assert.equal(fixed.result.actionEvents.filter(e=>e.type==='triggered'&&e.unitId==='uav').length,1);
for(const e of fixed.result.actionEvents.filter(e=>['sent','received'].includes(e.type)&&e.time<=20)){
 assert.equal(e.observationTime,10);assert.equal(e.originObserverId,'observer');assert.deepEqual(e.targetPosition,{x:1100,y:0,z:-100});
}
const repeated=clone(one);repeated.behaviors[2].triggers[0].once=false;
const updated=run(repeated);assert(updated.result.actionEvents.filter(e=>e.type==='triggered'&&e.unitId==='uav').length>3);
close(pos(updated,60).position.x,1300);close(pos(updated,180).position.x,2500);close(pos(updated,180).position.z,1000);
const reports=updated.result.actionEvents.filter(e=>e.type==='sent'&&e.unitId==='observer');assert(reports.at(-1).targetPosition.x>reports[0].targetPosition.x);
// A wait/report loop also uses fresh successful sensor observations.
const loop=clone(one);loop.behaviors[0].triggers=loop.behaviors[0].triggers.filter(t=>t.event!=='time');loop.behaviors[0].nodes.push({id:'wait',kind:'wait',seconds:30});loop.behaviors[0].edges=[{from:'report',to:'wait',when:'sent'},{from:'wait',to:'report',when:'elapsed'}];
const fresh=run(loop).result.actionEvents.filter(e=>e.type==='sent'&&e.unitId==='observer');assert.equal(fresh[1].observationTime,40);close(fresh[1].targetPosition.x,1400);
// Every relay forwards the original snapshot and observation time, despite delay.
for(const e of updated.result.actionEvents.filter(e=>e.type==='received'&&e.unitId==='uav')){
 const original=reports.find(r=>r.observationTime===e.observationTime);assert.deepEqual(e.targetPosition,original.targetPosition);assert.equal(e.time-original.time,10);
}
const replay=restoreRecording(recordingPayload(updated));for(const t of [10,20,25,60,180])assert.deepEqual(replay.evaluate(t).units,updated.evaluate(t).units);
// No observed position means waiting; a signal must not turn into an origin target.
const empty=clone(repeated);empty.units[0].sensor.enabled=false;const waiting=run(empty);assert.equal(pos(waiting,180).distance,0);assert.equal(pos(waiting,180).status,'standby');
// A destination-height action can fail, but a valid stopped UAV still receives
// and switches to the reported position at its flight altitude.
const recovery=clone(one);recovery.destinations.push({id:'deep',name:'UUV',kind:'unit',unitId:'uuv'});recovery.behaviors[2].initial='bad';recovery.behaviors[2].nodes.push({id:'bad',kind:'move',destinationId:'deep',heightMode:'target'});
const recovered=run(recovery);assert.equal(pos(recovered,10).status,'blocked');assert(recovered.result.actionEvents.some(e=>e.type==='received'&&e.unitId==='uav'));assert.equal(pos(recovered,60).error,null);close(pos(recovered,60).position.x,1100);
const invalid=clone(recovery);invalid.units[2].initial.z=0;const placed=run(invalid);assert.equal(pos(placed,60).status,'blocked');assert(placed.result.actionEvents.some(e=>e.type==='received'&&e.unitId==='uav'));
const disabled=clone(one);disabled.units[2].enabled=false;const absent=run(disabled);assert(absent.result.actionEvents.some(e=>e.type==='sendFailed'&&e.unitId==='relay'&&e.reason.includes('受信先不在')));
for(const field of ['range','probability']){const bad=clone(one);bad.units[0].communication[field]=field==='range'?1:0;assert(!run(bad).result.actionEvents.some(e=>e.type==='received'&&e.unitId==='relay'));}
// Arrival is measured horizontally when height is held; proximity can still
// explicitly measure the three-dimensional observed target coordinate.
const near=clone(one);near.behaviors[2].edges=[{from:'move',to:'done',when:'near',destinationId:'received',distance:100,distanceMode:'horizontal'}];near.behaviors[2].nodes.push({id:'done',kind:'stop'});
close(run(near).result.actionEvents.find(e=>e.type==='near'&&e.unitId==='uav').time,30);
near.behaviors[2].edges[0].distanceMode='absolute';assert(!run(near).result.actionEvents.some(e=>e.type==='near'&&e.unitId==='uav'));
for(const change of [s=>s.behaviors[2].nodes[1].heightMode='invalid',s=>s.behaviors[2].nodes[0].heightMode='keep']){const bad=clone(source);change(bad);assert.throws(()=>validateScenario(bad),/高度・深度/);}
const measured=clone(source);measured.mission={type:'state',assignmentId:'respond',nodeId:'move',join:'any',deadline:180};measured.analysis={trials:1,step:10,requiredRate:.9,factors:[],uncertainties:[]};
const trial=runDetection(createSimulation(measured));assert.equal(trial.successTime,20);const {conditions}=prepareAnalysis(measured);const row={...summarizeRow(conditions[0].count,[{...trial,trial:0,sampled:[]}]),condition:conditions[0]};assert.equal(restoreAnalysisResult({type:'SimSim-analysis',version:5,model:'trigger-behavior-v3',source:measured,rows:[row]}).completed,1);
console.log('PASS: frozen received coordinates, repeat retargeting, UAV altitude over UUV, delayed relay observation times, fresh sensor reports, positionless signals, recovery from failed movement, invalid placement, disabled recipients, communication limits, horizontal/3D proximity and saved replay');
