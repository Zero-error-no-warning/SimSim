import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {extractPatterns,validatePatterns,binomialLower,applyPattern} from '../src/patterns.js?v=20261007-plan-switch-25';
import {runExperiment} from '../src/experiment.js?v=20261007-plan-switch-25';
import {UI_BUILD} from '../src/ui-dom.js?v=20261007-plan-switch-25';
const source=()=>{const s=JSON.parse(fs.readFileSync(new URL('../data/information-mission.txt',import.meta.url)));s.experiment={candidates:16,trials:1,requiredRate:.5,designSeed:'patterns',controls:[{id:'speed',target:'unit:uav',parameter:'rate.movement.speed',min:80,max:120},{id:'period',target:'behavior:observe',parameter:'behavior.trigger.refresh.seconds',min:20,max:60}]};s.analysis.uncertainties=[];return s;};
test('rules preserve combinations and multiple applicable patterns, include failures, and require different operating candidates',()=>{
 const s=source(),candidates=Array.from({length:64},(_,i)=>({id:'c-'+i,values:{speed:82.5+(i%8)*5,period:22.5+Math.floor(i/8)*5}})),rows=candidates.map((c,i)=>({index:i,candidateId:c.id,profileId:'baseline',trial:0,success:(c.values.speed<100)===(c.values.period<40),successTime:30,invalidUnits:0,constrainedPaths:0}));s.experiment.requiredRate=.95;
 const r={source:s,status:'complete',completed:64,planned:64,candidates,rows,profiles:[{id:'baseline',changes:[]}],model:'information-behavior-v4',implementation:UI_BUILD};const rules=extractPatterns(r);assert(rules.length>=2);assert(rules.every(r=>Object.keys(r.bounds).length===2));assert(rules.every(r=>r.supportCandidates>=4));
 const few={...r,candidates:candidates.slice(0,3),rows:rows.slice(0,3),completed:3,planned:3};assert.deepEqual(extractPatterns(few),[]);
});
test('independent validation samples new control combinations and random namespace; saved rule applicability protects mission',async()=>{
 const s=source(),experiment=await runExperiment(s),rules=extractPatterns(experiment);assert(rules.length);const validated=await validatePatterns(experiment,rules,{operatingPoints:2,trials:30});
 for(const r of validated){assert(!r.validation.operatingPoints.some(p=>experiment.candidates.some(c=>JSON.stringify(c.values)===JSON.stringify(p.values))));assert(r.validation.seedNamespace.startsWith('verify-'));assert.equal(r.validation.rows.length,60);}
 const rule=validated.find(r=>r.status==='adopted');assert(rule,'At 100% successes and sufficient budget a rule passes the adjusted lower limit');
 const applied=applyPattern(s,rule,rule.validation.operatingPoints[0].values);assert.equal(applied.changes.length,2);assert.deepEqual(applied.scenario.mission,s.mission);
 const changed=source();changed.mission.deadline=100;assert.throws(()=>applyPattern(changed,rule,rule.validation.operatingPoints[0].values),/適用条件/);
 await assert.rejects(()=>validatePatterns(experiment,[{...rules[0],requiredRate:0}],{operatingPoints:1,trials:1}),/未変更/);
});
test('exact lower limits penalize small samples rather than calling a single success a validated pattern',()=>{
 assert(Math.abs(binomialLower(10,10,.05)-Math.pow(.05,.1))<1e-10);assert.equal(binomialLower(0,10),0);assert(binomialLower(1,1)<.1);assert(binomialLower(64,64,.0005)<.9);
});
