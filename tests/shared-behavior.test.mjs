import {importScenario} from '../src/scenario-import.js?v=20261009-information-analysis-26';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {clone,validateScenario} from '../src/engine.js?v=20261009-information-analysis-26';
import {RecordedSimulation,sharedSteps,recordingPayload,restoreRecording,createSimulation} from '../src/recorded-engine.js?v=20261009-information-analysis-26';
import {runDetection,restoreAnalysisResult,prepareAnalysis,summarizeRow} from '../src/detection.js?v=20261009-information-analysis-26';
import {trialScenario,availableBindings} from '../src/parameters.js?v=20261009-information-analysis-26';
const demo=JSON.parse(readFileSync(new URL('fixtures/legacy/shared-demo.txt',import.meta.url)));
function run(s,record=true){const m=new RecordedSimulation(s),g=sharedSteps(m,s.mission,undefined,{horizon:s.duration,record});let v=g.next();while(!v.done)v=g.next();return {m,r:v.value};}
const {m,r}=run(demo);assert(m.frames.length>1);assert(r.events.length);assert(r.actionEvents.some(e=>e.type==='nodeChanged'&&e.nodeId==='home'));assert(r.actionEvents.some(e=>e.type==='arrived'));assert(r.actionEvents.some(e=>e.type==='received'));const before=m.computeCount,a=m.evaluate(110),b=m.evaluate(0);assert.equal(b.time,0);assert.deepEqual(m.evaluate(110),a);assert.equal(m.computeCount,before);const restored=restoreRecording(recordingPayload(m));assert.deepEqual(restored.evaluate(110),{...a,recording:{...a.recording,computeCount:0}});assert.equal(restored.computeCount,0);
const repeat=run(demo);assert.deepEqual(repeat.r,r);assert.deepEqual(repeat.m.frames,m.frames);const reordered=clone(demo);reordered.units.reverse();assert.deepEqual(run(reordered).r,r);
const bare=clone(demo);delete bare.mission;const bareRun=run(bare);assert(bareRun.r.actionEvents.some(e=>e.type==='detected'));assert(bareRun.m.evaluate(500).mission===undefined);
const otherGoal=clone(demo);otherGoal.mission.observerFaction='hostile';otherGoal.mission.targetFaction='friendly';const independent=run(otherGoal);assert(independent.r.actionEvents.some(e=>e.type==='detected'));assert.equal(independent.r.success,false);
const stationary=clone(demo);stationary.groups[0].template.sensor.enabled=false;stationary.duration=120;stationary.mission.deadline=120;const noTargets=run(stationary);assert.equal(noTargets.r.success,false);assert(noTargets.m.evaluate(120).units.filter(u=>u.behaviorId).every(u=>u.nodeId==='patrol'));
const failures=clone(demo);failures.groups[0].template.communication.probability=0;const failed=run(failures);assert(failed.r.actionEvents.some(e=>e.type==='sendFailed'));assert(!failed.r.actionEvents.some(e=>e.type==='received'));
const invalid=clone(demo);invalid.behaviorAssignments[0].targets.push('group:patrol');assert.throws(()=>validateScenario(invalid),/重複/);const malformed=recordingPayload(m);malformed.frames[1].values='';assert.throws(()=>restoreRecording(malformed),/長さ/);
const {conditions}=prepareAnalysis(demo),rows=[];for(const c of conditions){const trials=[];for(let i=0;i<2;i++){const {scenario:s,sampled}=trialScenario(demo,c,i),result=runDetection(createSimulation(s));trials.push({trial:i,sampled,...result});}rows.push({...summarizeRow(c.count,trials),condition:c});}assert.equal(rows.length,6);assert(restoreAnalysisResult({type:'SimSim-analysis',version:5,model:'trigger-behavior-v3',source:importScenario(demo),rows}).completed===12);assert(availableBindings(demo).some(b=>b.target==='assignment:cohort'));
// Record-free Monte Carlo does not retain trajectory arrays.
const summary=run(demo,false);assert.equal(summary.m.frames,null);assert.deepEqual(summary.r,r);
// Exactly one arrival is emitted when a terminal return node has no outgoing edge.
const terminal=clone(demo);terminal.behaviors[0].edges=terminal.behaviors[0].edges.filter(e=>e.from!=='home');const term=run(terminal);const ids=term.r.actionEvents.filter(e=>e.type==='arrived').map(e=>e.unitId);assert.equal(new Set(ids).size,ids.length);
// Different speeds cause unequal gaps without feedback; cooperation reduces their spread.
function spread(s){const runResult=run(s).m,states=runResult.states.filter(x=>x.assignment),fractions=states.map(x=>x.progress/x.path.length).sort((a,b)=>a-b),gaps=fractions.map((f,i)=>(fractions[(i+1)%fractions.length]-f+1)%1),mean=1/gaps.length;return gaps.reduce((v,g)=>v+(g-mean)**2,0);}
const coop=clone(stationary);coop.duration=600;coop.mission.deadline=600;const drift=clone(coop);drift.behaviorAssignments[0].gain=0;assert(spread(coop)<spread(drift));
// A 1000-unit, one-hour record measures buffers, not total browser/process memory.
const large=clone(stationary);large.duration=3600;large.mission.deadline=3600;large.groups[0].count=1000;large.recording.interval=10;const start=performance.now(),largeRun=run(large);assert.equal(largeRun.m.states.length,1002);assert(largeRun.m.recordBytes<256*1048576);console.log('1000-member/hour:',JSON.stringify({frames:largeRun.m.frames.length,MiB:largeRun.m.recordBytes/1048576,seconds:(performance.now()-start)/1000}));
console.log('PASS: shared graphs, independent states, report/return, cooperative gaps, typed recordings, seek without computation, archive restore, summary-only trials, version-5 analysis, 1000 units');
