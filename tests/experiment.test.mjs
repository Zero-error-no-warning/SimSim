import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateScenario} from '../src/engine.js?v=20261007-plan-switch-25';
import {runExperiment,experimentCandidates,experimentSample} from '../src/experiment.js?v=20261007-plan-switch-25';
const source=()=>{const s=JSON.parse(fs.readFileSync(new URL('../data/information-mission.txt',import.meta.url)));s.duration=60;s.mission.deadline=60;s.measurements.forEach(m=>m.deadline=60);s.analysis.uncertainties=[];s.experiment={candidates:4,trials:3,designSeed:'test-design',controls:[{id:'delay',target:'unit:observer',parameter:'interaction.communication.delay',min:1,max:40},{id:'speed',target:'unit:uav',parameter:'rate.movement.speed',min:40,max:120}],enemyProfiles:[{id:'slow',changes:[{target:'unit:uuv',parameter:'rate.movement.speed',value:5}]},{id:'fast',changes:[{target:'unit:uuv',parameter:'rate.movement.speed',value:15}]}]};return s;};
test('controls cannot alter hostile entities, mission deadlines or an uncertainty binding',()=>{
 for(const change of [s=>s.experiment.controls[0].target='unit:uuv',s=>{s.experiment.controls[0].target='scenario';s.experiment.controls[0].parameter='mission.deadline';},s=>s.analysis.uncertainties=[{target:'unit:observer',parameter:'interaction.communication.delay',distribution:'uniform',min:1,max:40}]]){const s=source();change(s);assert.throws(()=>validateScenario(s));}
 const s=source(),c=experimentCandidates(s)[0],sample=experimentSample(s,c,s.experiment.enemyProfiles[0],0);assert.deepEqual(sample.scenario.mission,s.mission);assert.equal(sample.scenario.units.find(u=>u.id==='uuv').speed,5);assert.equal(sample.scenario.units.find(u=>u.id==='uav').speed,c.values.speed);
});
test('deterministic multi-variable experiment resumes at a trial boundary and retains independent information measures',async()=>{
 const s=source(),full=await runExperiment(s);assert.equal(full.completed,24);assert.equal(full.summary.total,24);assert(full.rows.every(r=>r.informationMetrics.units.observer.firstDetectionAt===10));
 assert(full.rows.some(r=>r.informationMetrics.units.uav.firstReportAt>r.informationMetrics.units.observer.firstDetectionAt));
 const checkpoint={...full,status:'paused',completed:7,rows:full.rows.slice(0,7)},resumed=await runExperiment(s,{checkpoint});assert.deepEqual(resumed.rows,full.rows);
 const changed=source();changed.seed='changed';await assert.rejects(()=>runExperiment(changed,{checkpoint}),/一致/);
});
test('infeasible control combinations are setup errors, never normal operation failures',()=>{
 const s=source();s.experiment.constraints=[{terms:[{controlId:'delay'}],op:'gte',value:100}];assert.throws(()=>experimentCandidates(s),/制約/);
});
