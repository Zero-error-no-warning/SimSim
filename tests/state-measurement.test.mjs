import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {clone,validateScenario,Simulation} from '../src/engine.js?v=20261006-patrol-cruise-19';
import {RecordedSimulation,sharedSteps,recordingPayload,restoreRecording} from '../src/recorded-engine.js?v=20261006-patrol-cruise-19';
import {runDetection,restoreAnalysisResult,prepareAnalysis,summarizeRow,snapshotMission} from '../src/detection.js?v=20261006-patrol-cruise-19';
import {trialScenario} from '../src/parameters.js?v=20261006-patrol-cruise-19';
import {stateMembers,StateTracker} from '../src/state-measurement.js?v=20261006-patrol-cruise-19';
import {removeAssignment,removeBehavior} from '../src/editor.js?v=20261006-patrol-cruise-19';
const source=JSON.parse(readFileSync(new URL('./fixtures/state-measurement.txt',import.meta.url)));
const run=(s,record=true)=>{const model=new RecordedSimulation(s),g=sharedSteps(model,s.mission,undefined,{horizon:s.duration,record});let v=g.next();while(!v.done)v=g.next();return {model,result:v.value};};
validateScenario(source);assert.deepEqual(stateMembers(source),['group__1','group__2']);
const {model,result}=run(source);assert.equal(result.success,true);assert.equal(result.successTime,3);assert.equal(result.stateReachedCount,2);assert.deepEqual(result.stateEntries,[{unitId:'group__1',time:3},{unitId:'group__2',time:3}]);assert(result.actionEvents.filter(e=>e.type==='nodeChanged'&&e.nodeId==='b').length>2);
assert.equal(model.states.length,2);assert(!model.paths.has('template'));assert(!result.actionEvents.some(e=>e.unitId==='template'));
const inactive=model.evaluate(30).units.find(u=>u.id==='template');assert.equal(inactive.status,'disabled');assert.deepEqual(inactive.position,source.units[0].initial);assert.equal(inactive.distance,0);assert.equal(new Simulation(source).evaluateUnit(source.units[0],30).status,'disabled');
assert.equal(model.evaluate(2).mission.stateReachedCount,0);assert.equal(model.evaluate(3).mission.stateReachedCount,2);assert.equal(snapshotMission(result,source.mission,2).status,'pending');
const archive=recordingPayload(model);assert.deepEqual(archive.unitIds,['group__1','group__2']);const replay=restoreRecording(archive);assert.deepEqual(replay.evaluate(30),{...model.evaluate(30),recording:{...model.evaluate(30).recording,computeCount:0}});
assert.deepEqual(run(source,false).result,result);
const initial=clone(source);initial.mission.nodeId='a';assert.equal(run(initial).result.successTime,0);
const early=clone(source);early.mission.deadline=2;assert.equal(run(early).result.stateReachedCount,0);assert.equal(run(early).result.success,false);
const threshold=clone(source);threshold.mission.join='count';threshold.mission.requiredCount=3;assert.equal(run(threshold).result.success,false);threshold.mission.requiredCount=2;assert.equal(run(threshold).result.successTime,3);
const disabled=clone(source);disabled.groups[0].enabled=false;assert.equal(run(disabled).model.states.length,0);assert.equal(run(disabled).result.stateTargetCount,0);assert.equal(run(disabled).result.success,false);assert.equal(restoreRecording(recordingPayload(run(disabled).model)).evaluate(30).units.length,3);
// Disabled observers/contacts and destinations never participate in physical execution.
const sensor=clone(source);delete sensor.analysis;delete sensor.mission;sensor.behaviorAssignments=[];sensor.behaviors=[];sensor.units.push({...clone(sensor.units[0]),id:'enemy',name:'enemy',faction:'hostile',sensor:undefined,enabled:false});const contacts=run(sensor);assert.equal(contacts.result.detectedCount,0);sensor.units[1].enabled=true;assert(run(sensor).result.detectedCount>0);
sensor.mission={type:'detect',observerFaction:'friendly',targetFaction:'hostile',join:'all',deadline:30};sensor.units[1].enabled=false;assert.equal(run(sensor).result.success,false);
// Arrival transitions are measured by entering the next state, not by finishing its action.
const arrival=clone(source);arrival.behaviors[0].triggers=[];arrival.behaviors[0].nodes=[{id:'a',kind:'follow',x:100,y:100},{id:'b',kind:'signal',x:400,y:100}];arrival.behaviors[0].edges=[{from:'a',to:'b',when:'arrived'}];arrival.behaviorAssignments[0].targets.push('unit:template');assert.equal(run(arrival).result.successTime,10);assert.equal(run(arrival).result.stateTargetCount,2);
const receiver=clone(source);receiver.groups[0].template.communication={enabled:true,range:10000,delay:0,probability:1,terrainLOS:false};receiver.behaviors[0].nodes=[{id:'a',kind:'report',receiverId:'template',x:100,y:100},{id:'b',kind:'signal',x:400,y:100}];receiver.behaviors[0].edges=[{from:'a',to:'b',when:'sendFailed'}];receiver.behaviors[0].triggers=[];const missingReceiver=run(receiver);assert(missingReceiver.result.actionEvents.some(e=>e.type==='sendFailed'&&e.reason==='受信先不在（無効・計算対象外）'));assert(!missingReceiver.result.actionEvents.some(e=>e.type==='received'));restoreRecording(recordingPayload(missingReceiver.model));
const destination=clone(arrival);destination.destinations=[{id:'disabled-target',name:'Disabled destination',kind:'unit',unitId:'template'}];destination.behaviors[0].nodes[0]={id:'a',kind:'move',destinationId:'disabled-target',x:100,y:100};const missingDestination=run(destination);assert.equal(missingDestination.result.success,false);assert(missingDestination.model.states.every(s=>s.status==='blocked'));
// Archive and analysis restore reject mismatches; a zero-population condition is legitimate failure.
const bad=clone(archive);bad.result.stateEntries[0].time=4;assert.throws(()=>restoreRecording(bad),/一致/);
const {conditions}=prepareAnalysis(source),rows=[];for(const c of conditions){const trials=[];for(let trial=0;trial<2;trial++){const {scenario,sampled}=trialScenario(source,c,trial);trials.push({trial,sampled,...runDetection(new RecordedSimulation(scenario))});}rows.push({...summarizeRow(c.count,trials),condition:c});}
assert.equal(rows[0].rate,0);assert.equal(rows[0].trials[0].stateTargetCount,0);assert.equal(rows[1].rate,1);
const payload={type:'SimSim-analysis',version:5,model:'trigger-behavior-v3',source,rows};assert.equal(restoreAnalysisResult(payload).completed,4);const tamper=clone(payload);tamper.rows[1].trials[0].stateEntries[0].unitId='template';assert.throws(()=>restoreAnalysisResult(tamper),/不正/);
const deleted=clone(source);removeAssignment(deleted,'t');assert.equal(deleted.mission,undefined);const removed=clone(source);removeBehavior(removed,'g');assert.equal(removed.mission,undefined);
const tracker=new StateTracker(source.mission,['x','y']);assert.equal(tracker.update([{type:'nodeChanged',nodeId:'b',unitId:'x',time:4},{type:'nodeChanged',nodeId:'b',unitId:'x',time:8},{type:'nodeChanged',nodeId:'b',unitId:'y',time:10}]).successTime,10);
console.log('PASS: first entry, initial time zero, re-entry, any/all/count, empty/disabled population, independent templates, active-only contacts/recordings, archive/analysis restore and reference cleanup');
