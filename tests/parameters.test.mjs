import {importScenario} from '../src/scenario-import.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {clone,Simulation,validateScenario} from '../src/engine.js';
import {prepareAnalysis,runDetection,summarizeRow,restoreAnalysisResult} from '../src/detection.js';
import {analysisConditions,trialScenario,readParameter,writeParameter,bindingKey,normalizedAnalysis} from '../src/parameters.js';
import {numericScale} from '../src/chart-scale.js';
const source=JSON.parse(fs.readFileSync(new URL('../data/detection-demo.jsn',import.meta.url),'utf8'));
const range={target:'group:observers',parameter:'extent.sense.radius',values:[300,900]};
const speed={target:'unit:hostile-transit',parameter:'rate.movement.speed',distribution:'uniform',min:10,max:24};
// Obtain the fixture's actual target ID rather than relying on its display name.
speed.target='unit:'+source.units.find(u=>u.faction==='hostile').id;
const signature={target:speed.target,parameter:'extent.signature.coefficient',distribution:'triangular',min:.2,max:2,mode:1};
source.analysis={...source.analysis,groupId:'observers',counts:[0,100],trials:5,factors:[range],uncertainties:[speed,signature]};
const unified=clone(source);unified.analysis=normalizedAnalysis(source.analysis);assert(!('groupId' in unified.analysis)&&!('counts' in unified.analysis));assert.deepEqual(analysisConditions(unified).map(c=>c.id),analysisConditions(source).map(c=>c.id));
for(const condition of analysisConditions(source))assert.deepEqual(trialScenario(unified,analysisConditions(unified).find(c=>c.id===condition.id),4).scenario.groups,trialScenario(source,condition,4).scenario.groups);
const frozen=clone(source),prepared=prepareAnalysis(source);assert.equal(prepared.conditions.length,4);
for(let trial=0;trial<50;trial++){
  const samples=prepared.conditions.map(c=>trialScenario(source,c,trial));
  for(const sample of samples){assert.deepEqual(sample.sampled,samples[0].sampled,'Pair samples across count/performance conditions');assert(sample.sampled[0].value>=10&&sample.sampled[0].value<=24);assert(sample.sampled[1].value>=.2&&sample.sampled[1].value<=2);validateScenario(sample.scenario);}
  assert.deepEqual(samples[0],trialScenario(source,prepared.conditions[0],trial),'Replay exact definition');
}
assert.deepEqual(source,frozen,'No source mutation');
const reordered=clone(source);reordered.analysis.uncertainties.reverse();
const a=trialScenario(source,prepared.conditions[0],4).sampled,b=trialScenario(reordered,analysisConditions(reordered)[0],4).sampled;
for(const sample of a)assert.equal(sample.value,b.find(s=>bindingKey(s)===bindingKey(sample)).value,'Sample stream independent of parameter order');
assert.notDeepEqual(trialScenario(source,prepared.conditions[0],0).sampled,trialScenario(source,prepared.conditions[0],1).sampled);
const translated=clone(source),target=source.units.find(u=>u.faction==='hostile'),binding={target:speed.target,parameter:'state.position.x'};
writeParameter(translated,binding,target.initial.x+1000);assert.equal(translated.units.find(u=>u.id===target.id).route[0].x,target.route[0].x+1000);assert.equal(readParameter(translated,binding),target.initial.x+1000);
const fixed=clone(source);fixed.analysis.groupId='';fixed.analysis.counts=[];fixed.analysis.factors=[{target:speed.target,parameter:'extent.signature.coefficient',values:[0,1]}];fixed.analysis.uncertainties=[];
const fixedConditions=prepareAnalysis(fixed).conditions;assert.equal(fixedConditions.length,2);assert.equal(runDetection(new Simulation(trialScenario(fixed,fixedConditions[0],0).scenario)).success,false,'Signature zero reaches detection consumer');
const duplicate=clone(source);duplicate.analysis.uncertainties.push({...speed});assert.throws(()=>prepareAnalysis(duplicate),/重複/);
const bound=clone(source);bound.analysis.factors[0].values=[-1];assert.throws(()=>prepareAnalysis(bound),/範囲/);
const many=clone(source);many.analysis.factors.push({target:speed.target,parameter:'rate.movement.speed',values:Array.from({length:12},(_,i)=>i)});assert.throws(()=>prepareAnalysis(many),/重複|24/);
const missing=clone(source);missing.analysis.factors[0].target='group:missing';assert.throws(()=>prepareAnalysis(missing),/対象/);
const overcount=clone(source);overcount.analysis.counts=[2000];assert.throws(()=>prepareAnalysis(overcount),/2000/);
const deadline=clone(fixed);deadline.analysis.factors=[{target:'scenario',parameter:'mission.deadline',values:[100,1000]}];deadline.analysis.uncertainties=[signature];
const rows=prepareAnalysis(deadline).conditions.map(condition=>{
  const trials=[];for(let trial=0;trial<5;trial++){const sample=trialScenario(deadline,condition,trial),r=runDetection(new Simulation(sample.scenario));trials.push({...r,trial,sampled:sample.sampled});}
  return {...summarizeRow(condition.count,trials),condition};
});
const payload={type:'SimSim-analysis',version:5,model:'trigger-behavior-v3',source:deadline,rows};
assert.equal(restoreAnalysisResult(payload).completed,10);
const tamper=clone(payload);tamper.rows[0].trials[0].sampled[0].value+=.1;assert.throws(()=>restoreAnalysisResult(tamper),/抽出値/);
const aggregate=clone(payload);aggregate.rows[0].rate=99;assert.equal(restoreAnalysisResult(aggregate).rows[0].rate,rows[0].rate);
const discrete=clone(fixed);discrete.analysis.factors=[];discrete.analysis.uncertainties=[{target:'group:observers',parameter:'capacity.population',distribution:'uniform',min:0,max:10}];
for(let trial=0;trial<50;trial++)assert(Number.isInteger(trialScenario(discrete,analysisConditions(discrete)[0],trial).sampled[0].value));
const linear=numericScale([0,100,300,1000]);assert(Math.abs((linear.position(300)-linear.position(100))/(linear.position(1000)-linear.position(300))-2/7)<1e-12);
const log=numericScale([0,10,100,1000],true);assert(Math.abs(log.position(100)-log.position(10)-(log.position(1000)-log.position(100)))<1e-12);
assert.equal(numericScale([0,-1],true),null);assert(Number.isFinite(numericScale([100],true).position(100)));assert(Number.isFinite(numericScale([0]).position(0)));
console.log('PASS: cross-factor conditions, paired bounded distributions, reorder independence, replay, translation, engine consumer, limits, result import verification, integer samples, linear/log numeric scale');
