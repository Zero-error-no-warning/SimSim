import {importScenario} from '../src/scenario-import.js?v=20261005-parameters-terrain-6';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Simulation,clone,validateScenario} from '../src/engine.js?v=20261005-parameters-terrain-6';
import {prepareAnalysis,runDetection,summarizeRow,restoreAnalysisResult} from '../src/detection.js?v=20261005-parameters-terrain-6';
import {trialScenario} from '../src/parameters.js?v=20261005-parameters-terrain-6';
const source=JSON.parse(fs.readFileSync(new URL('../data/island-patrol-demo.jsn',import.meta.url),'utf8'));
const {conditions}=prepareAnalysis(source);assert.equal(conditions.length,12);assert.equal(source.analysis.trials*conditions.length,600);
const base=new Simulation(source),members=base.scenario.units.filter(u=>u.groupId==='patrol-uuv');
assert.equal(members.length,8);assert.equal(new Set(members.map(u=>u.motion.loopStart)).size,8);
assert(base.evaluate(0).units.every(u=>!u.error));assert(base.evaluate(3600).units.every(u=>!u.error));
const more=clone(source);more.groups[0].count=32;const larger=new Simulation(more);assert.deepEqual(base.evaluate(1234).units,larger.evaluate(1234).units.slice(0,9),'Existing member phase/speed/motion streams survive count changes');
const changed=clone(source);changed.trial++;assert.notDeepEqual(members.map(u=>u.motion.loopStart),new Simulation(changed).scenario.units.filter(u=>u.groupId).map(u=>u.motion.loopStart));
const even=clone(source);even.groups[0].loopStartMode='even';even.groups[0].count=4;even.groups[0].template.motion.loopStart=.25;assert.deepEqual(new Simulation(even).scenario.units.filter(u=>u.groupId).map(u=>u.motion.loopStart),[.25,.5,.75,0]);
const bad=clone(source);bad.groups[0].loopStartMode='bad';assert.throws(()=>validateScenario(bad),/loopStartMode/);
const start=performance.now(),rows=[];
for(const condition of conditions){const trials=[];for(let trial=0;trial<50;trial++){const sample=trialScenario(source,condition,trial),model=new Simulation(sample.scenario),r=runDetection(model);assert.equal(r.invalidUnits,0);assert.equal(r.constrainedPaths,0);trials.push({...r,trial,sampled:sample.sampled});}rows.push({...summarizeRow(condition.count,trials),condition});}
// Paired streams preserve discoveries when adding observers, and when increasing their range.
for(let trial=0;trial<50;trial++)for(const a of rows)for(const b of rows){const [n1,r1]=a.condition.settings.map(s=>s.value),[n2,r2]=b.condition.settings.map(s=>s.value);if(n2>=n1&&r2>=r1&&a.trials[trial].success){assert(b.trials[trial].success);assert(b.trials[trial].successTime<=a.trials[trial].successTime);}}
assert(rows[0].rate<rows.at(-1).rate,'Sample must exercise the requested quantity/range comparison');
const result=restoreAnalysisResult({type:'SimSim-analysis',version:5,model:'trigger-behavior-v3',source:importScenario(source),rows});assert.equal(result.completed,600);
console.log(JSON.stringify({status:'PASS',checks:'fictitious two-island terrain, valid transit and patrol, phased group modes, paired quantities/ranges, 600 trials, result round-trip',elapsedMs:Math.round(performance.now()-start),rows:rows.map(r=>({count:r.condition.settings[0].value,range:r.condition.settings[1].value,successes:r.successes,total:r.total}))}));
