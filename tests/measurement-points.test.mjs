import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {clone,validateScenario} from '../src/engine.js?v=20261009-select-state-30';
import {createSimulation,sharedSteps,recordingPayload,restoreRecording} from '../src/recorded-engine.js?v=20261009-select-state-30';
import {runDetection,prepareAnalysis,summarizeRow,restoreAnalysisResult} from '../src/detection.js?v=20261009-select-state-30';
import {trialScenario} from '../src/parameters.js?v=20261009-select-state-30';
import {measurePoints,summarizeMeasurements} from '../src/measurement-points.js?v=20261009-select-state-30';
import {removeAssignment,pruneReferences,newScenario} from '../src/editor.js?v=20261009-select-state-30';
import {layoutLabels,layoutDockedLabels} from '../src/label-layout.js?v=20261009-select-state-30';
const source=JSON.parse(readFileSync(new URL('./fixtures/state-measurement.txt',import.meta.url)));
source.mission.deadline=2; // Additional points must execute beyond the main goal's deadline.
source.measurements=[
  {id:'start',name:'初期状態',type:'state',assignmentId:'t',nodeId:'a',join:'all',deadline:30},
  {id:'next',name:'次の状態',type:'state',assignmentId:'t',nodeId:'b',join:'count',requiredCount:2,deadline:30,previousId:'start'},
  {id:'early',name:'期限不足',type:'state',assignmentId:'t',nodeId:'b',join:'any',deadline:2,previousId:'next'},
  {id:'reverse',name:'順序逆転',type:'state',assignmentId:'t',nodeId:'a',join:'any',deadline:30,previousId:'next'}
];
validateScenario(source);
const run=s=>{const model=createSimulation(s),g=sharedSteps(model,s.mission,undefined,{horizon:s.duration,record:true});let r=g.next();while(!r.done)r=g.next();return model;};
const model=run(source),r=model.result;
assert.equal(r.success,false);assert.equal(r.measurements[0].successTime,0);assert.equal(r.measurements[1].successTime,3);assert.equal(r.measurements[2].success,false);
assert.equal(runDetection(createSimulation(source)).measurements[1].successTime,3);
assert.deepEqual(r.measurements,measurePoints(source,r.actionEvents));
assert.equal(measurePoints(source,r.actionEvents,2)[1].success,false);
const rows=summarizeMeasurements(source,[{measurements:r.measurements}]);assert.equal(rows[1].medianDuration,3);assert.equal(rows[2].conditionalRate,0);assert.equal(rows[3].outOfOrder,1);assert.equal(rows[3].medianDuration,null);
const saved=recordingPayload(model);assert.deepEqual(restoreRecording(saved).result.measurements,r.measurements);
const corrupt=clone(saved);corrupt.result.measurements[1].stateEntries[0].time=5;assert.throws(()=>restoreRecording(corrupt),/一致/);
const {conditions}=prepareAnalysis(source),analysisRows=conditions.map(c=>{const trials=[0,1].map(trial=>{const {scenario,sampled}=trialScenario(source,c,trial);return {trial,sampled,...runDetection(createSimulation(scenario))};});return {...summarizeRow(c.count,trials),condition:c};});
assert(analysisRows[0].trials.every(t=>t.measurements.every(m=>!m.success&&m.stateTargetCount===0)));
const archive={type:'SimSim-analysis',version:5,model:'trigger-behavior-v3',source,rows:analysisRows};assert.equal(restoreAnalysisResult(archive).rows[1].trials[0].measurements[1].successTime,3);
const badArchive=clone(archive);badArchive.rows[1].trials[0].measurements.pop();assert.throws(()=>restoreAnalysisResult(badArchive),/結果数/);
for(const modify of [s=>s.measurements[1].id='start',s=>s.measurements[0].previousId='next',s=>s.measurements[0].deadline=31,s=>s.measurements[0].nodeId='missing',s=>{s.measurements[0].join='count';s.measurements[0].requiredCount=0;}]){
  const s=clone(source);modify(s);assert.throws(()=>validateScenario(s));
}
const removed=clone(source);removeAssignment(removed,'t');assert.deepEqual(removed.measurements,[]);
const deleted=clone(source);deleted.behaviors[0].nodes=deleted.behaviors[0].nodes.filter(n=>n.id!=='b');pruneReferences(deleted);assert.deepEqual(deleted.measurements.map(m=>m.id),['start','reverse']);assert.equal(deleted.measurements[1].previousId,undefined);
const empty=clone(source);newScenario(empty);assert.equal(empty.measurements,undefined);
// A dense cluster has disjoint, bounded rectangles and retains the selected label.
const items=Array.from({length:80},(_,i)=>({id:String(i),x:220,y:180,w:150,h:40,priority:i===79?3:1})),layout=layoutLabels(items,600,400),rects=[...layout.values()].filter(Boolean);
assert(layout.get('79'));assert(rects.length>1&&rects.length<80);
for(const [i,a] of rects.entries()){assert(a.x>=5&&a.x+a.w<=595&&a.y>=48&&a.y+a.h<=358);for(const b of rects.slice(i+1))assert(!(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y));}
const dock=layoutDockedLabels(items,600,400,180);assert(dock.get('79'));
const docked=[...dock.values()].filter(Boolean);for(const [i,a] of docked.entries()){assert(a.x>=600&&a.x+a.w<=780);for(const b of docked.slice(i+1))assert(!(a.y<b.y+b.h&&a.y+a.h>b.y));}
const sample=JSON.parse(readFileSync(new URL('fixtures/legacy/measurement-history-demo.txt',import.meta.url)));const sampleResult=runDetection(createSimulation(sample));assert(sampleResult.measurements.every(m=>m.success));assert(sampleResult.success);
console.log('PASS: independent deadlines, first entry, stage durations/order, zero population, recording/analysis integrity, cleanup, dense labels and stage sample');
