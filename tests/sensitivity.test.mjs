import assert from 'node:assert/strict';
import fs from 'node:fs';
import {clone,validateScenario} from '../src/engine.js?v=20261009-select-state-30';
import {createSimulation} from '../src/recorded-engine.js?v=20261009-select-state-30';
import {runDetection,summarizeRow,restoreAnalysisResult} from '../src/detection.js?v=20261009-select-state-30';
import {trialScenario,readParameter,writeParameter} from '../src/parameters.js?v=20261009-select-state-30';
import {sensitivityBindings,defaultSensitivityCandidate} from '../src/sensitivity-settings.js?v=20261009-select-state-30';
import {prepareSensitivity,summarizeSensitivity,restoreSensitivityResult,summarizePaired,metricValue} from '../src/sensitivity.js?v=20261009-select-state-30';
import {removeDefinition,removeBehavior,pruneReferences} from '../src/editor.js?v=20261009-select-state-30';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/state-measurement.txt',import.meta.url)));
fixture.measurements=[{id:'initial',name:'起点',type:'state',assignmentId:'t',nodeId:'a',join:'all',deadline:30},{id:'finish',name:'到達',type:'state',assignmentId:'t',nodeId:'b',join:'all',deadline:30,previousId:'initial'}];
fixture.analysis.mode='sensitivity';fixture.analysis.sensitivity={metric:'point.finish.duration',candidates:[{target:'behavior:g',parameter:'behavior.node.a.seconds',low:1,high:5},{target:'group:group',parameter:'capacity.population',low:0,high:3}]};
const compute=s=>{const p=prepareSensitivity(s),rows=p.conditions.map(condition=>{const trials=[];for(let i=0;i<p.analysis.trials;i++){const trial=p.startTrial+i,{scenario,sampled}=trialScenario(p.trialSource,condition,trial),r=runDetection(createSimulation(scenario));trials.push({...r,trial,sampled});}return {...summarizeRow(condition.count,trials),condition};});return {p,rows};};
const result=compute(fixture),entries=summarizeSensitivity(fixture,result.rows);
assert.equal(result.p.conditions.length,5);assert.equal(result.p.conditions[0].settings.length,0);
assert.equal(result.rows[0].trials[0].successTime,3,'Current count 2 is baseline, not factor value 0');
const time=entries.filter(r=>r.condition.candidate.target==='behavior:g');assert.deepEqual(time.map(r=>r.delta),[-2,2]);assert(time.every(r=>r.pairs===2&&r.rank===1));
const empty=entries.find(r=>r.condition.settings[0].parameter==='capacity.population'&&r.condition.settings[0].value===0);assert.equal(empty.delta,null);assert.equal(empty.pairs,0);assert.equal(empty.changedMissing,2);assert.equal(empty.rank,null);
const payload={type:'SimSim-sensitivity',version:1,model:'trigger-behavior-v3',source:fixture,rows:result.rows,elapsedMs:200};
const restored=restoreSensitivityResult(payload);assert.equal(restored.completed,10);assert.deepEqual(summarizeSensitivity(restored.source,restored.rows),entries);
const rate=clone(fixture);rate.analysis.sensitivity.metric='point.finish.rate';const scores=summarizeSensitivity(rate,result.rows);assert.equal(scores.find(r=>r.condition.settings[0].parameter==='capacity.population'&&r.condition.settings[0].value===0).delta,-1);
for(const id of ['mission.rate','mission.time','point.finish.rate','point.finish.time','point.finish.duration']){const s=clone(fixture);s.analysis.sensitivity.metric=id;assert(prepareSensitivity(s).metric);}
// Use actual communication stochastic outcomes: uncertainty draws match each trial,
// reversing candidates changes neither draws nor calculated results.
const sample=JSON.parse(fs.readFileSync(new URL('fixtures/legacy/sensitivity-demo.txt',import.meta.url)));sample.analysis.trials=8;sample.analysis.uncertainties=[{target:'unit:uuv',parameter:'rate.movement.speed',distribution:'uniform',min:8,max:12}];
const one=compute(sample),reverse=clone(sample);reverse.analysis.sensitivity.candidates.reverse();const two=compute(reverse);
for(const row of one.rows){const r=two.rows.find(r=>r.condition.id===row.condition.id);assert.deepEqual(row.trials,r.trials);for(const t of row.trials)assert.deepEqual(t.sampled,one.rows[0].trials.find(b=>b.trial===t.trial).sampled);}
assert.deepEqual(one.rows.find(r=>r.condition.settings[0]?.parameter==='interaction.communication.probability'&&r.condition.settings[0].value===0).trials.map(t=>t.success),Array(8).fill(false));
assert(one.rows.find(r=>r.condition.settings[0]?.parameter==='interaction.communication.probability'&&r.condition.settings[0].value===1).trials.every(t=>t.success));
const p=restoreSensitivityResult({...payload,source:sample,rows:one.rows});assert.equal(p.completed,56);
// Mean differences use paired successes; comparing separate successful means would be biased.
const a=[{trial:0,success:true,successTime:100},{trial:1,success:false,successTime:null},{trial:2,success:true,successTime:20}],b=[{trial:0,success:false,successTime:null},{trial:1,success:true,successTime:10},{trial:2,success:true,successTime:10}];
const paired=summarizePaired(fixture,a,b,{kind:'time'});assert.equal(paired.delta,-10);assert.equal(paired.pairs,1);assert.equal(paired.low,null);assert.equal(paired.baseline,60);assert.equal(paired.changed,10);assert.equal(paired.pairedBaseline,20);
const bool=summarizePaired(fixture,a,b,{kind:'rate'});assert.equal(bool.delta,0);assert.equal(bool.improved,1);assert.equal(bool.worsened,1);assert(bool.low<0&&bool.high>0);
const ordered={measurements:[{id:'initial',success:true,successTime:8},{id:'finish',success:true,successTime:4}]};assert.equal(metricValue(fixture,ordered,{kind:'duration',measurementId:'finish'}),null);
const partial=restoreSensitivityResult({...payload,rows:[result.rows[0],{...result.rows[1],trials:result.rows[1].trials.slice(0,1)}]});assert.equal(partial.completed,3);assert.equal(partial.planned,10);
assert.throws(()=>restoreSensitivityResult({...payload,rows:[result.rows[1]]}),/基準試行/);
const tampered=clone(payload);tampered.rows[1].trials[0].stateEntries[0].time=12;assert.throws(()=>restoreSensitivityResult(tampered),/一致/);
const duplicates=clone(payload);duplicates.rows.push(duplicates.rows[0]);assert.throws(()=>restoreSensitivityResult(duplicates),/条件数|個数・試行数/);
for(const change of [s=>s.analysis.sensitivity.candidates[0].low=4,s=>s.analysis.sensitivity.candidates[0].low=NaN,s=>s.analysis.sensitivity.candidates[1].high=2.5,s=>s.analysis.sensitivity.metric='point.missing.rate',s=>s.analysis.sensitivity.candidates.push(clone(s.analysis.sensitivity.candidates[0])),s=>{s.analysis.trials=2000;s.analysis.sensitivity.candidates.push({target:'group:group',parameter:'rate.movement.speed',low:50,high:150});},s=>s.analysis.sensitivity.candidates=[]]){const bad=clone(fixture);change(bad);assert.throws(()=>prepareSensitivity(bad));}
const ignoredFactors=clone(fixture);ignoredFactors.analysis.trials=1000;ignoredFactors.analysis.factors[0].values=Array.from({length:12},(_,i)=>i);assert.equal(prepareSensitivity(ignoredFactors).conditions.length,5);ignoredFactors.analysis.mode='comparison';assert.throws(()=>validateScenario(ignoredFactors),/10000/);
const both=clone(fixture);both.analysis.factors=[];both.analysis.uncertainties=[{target:'group:group',parameter:'capacity.population',distribution:'uniform',min:1,max:2}];assert.throws(()=>prepareSensitivity(both),/ばらつき/);
const removed=clone(fixture);removeDefinition(removed,'group__1');assert(!removed.analysis.sensitivity?.candidates.some(c=>c.target==='group:group'));validateScenario(removed);
const removedGraph=clone(fixture);removeBehavior(removedGraph,'g');assert(!removedGraph.analysis.sensitivity);validateScenario(removedGraph);
const changedNode=clone(fixture);changedNode.behaviors[0].nodes[0]={id:'a',kind:'signal'};changedNode.behaviors[0].edges=changedNode.behaviors[0].edges.filter(e=>e.from!=='a');pruneReferences(changedNode);assert(!changedNode.analysis.sensitivity.candidates.some(c=>c.parameter==='behavior.node.a.seconds'));validateScenario(changedNode);
const otherMission=clone(fixture);otherMission.mission={type:'detect',observerFaction:'friendly',targetFaction:'hostile',join:'any',deadline:30};otherMission.units.push({...clone(otherMission.units[0]),id:'target',enabled:true,faction:'hostile',speed:0,route:[],sensor:undefined});otherMission.analysis.factors=[];otherMission.analysis.sensitivity.metric='point.finish.rate';const other=compute(otherMission);assert.equal(other.rows.find(r=>r.condition.settings[0]?.value===0).trials[0].measurements.find(m=>m.id==='finish').stateTargetCount,0);
const defaultZero=defaultSensitivityCandidate(fixture,{target:'group:group',parameter:'extent.deployment.width'});assert.equal(defaultZero.low,0);assert.equal(defaultZero.high,1000);
const uncertaintyBindings=sensitivityBindings(sample);assert(!uncertaintyBindings.some(b=>b.target==='unit:uuv'&&b.parameter==='rate.movement.speed'));assert(!sensitivityBindings(fixture).some(b=>b.target==='unit:template'));
const trigger={target:'behavior:observe',parameter:'behavior.trigger.refresh.seconds'};assert.equal(readParameter(sample,trigger),30);writeParameter(sample,trigger,15);assert.equal(readParameter(sample,trigger),15);
// Existing comparison archives still validate after factoring out common row checks.
const normal=clone(fixture);delete normal.analysis.sensitivity;delete normal.analysis.mode;normal.analysis.factors=[];const {scenario,sampled}=trialScenario(normal,{settings:[]},0),r=runDetection(createSimulation(scenario));assert.equal(restoreAnalysisResult({type:'SimSim-analysis',version:5,model:'trigger-behavior-v3',source:normal,rows:[{condition:{id:'[]'},trials:[{...r,trial:0,sampled}]}]}).completed,1);
console.log('PASS: sensitivity baseline, one-factor changes, paired RNG/reorder, communication effects, signed paired time/rate/duration, missing/order handling, ranking, partial/archive integrity, config/limits, cleanup, node/trigger parameters and legacy comparison');
