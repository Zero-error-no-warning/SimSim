import {importScenario} from '../src/scenario-import.js?v=20261005-state-events-4';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Simulation,clone,validateScenario,Terrain} from '../src/engine.js?v=20261005-state-events-4';
import {terrainVisible,contactProbability,runDetection,snapshotMission,wilson,scenarioForCount,prepareAnalysis,summarizeRow,restoreAnalysisResult} from '../src/detection.js?v=20261005-state-events-4';
const sensor={enabled:true,range:1000,probabilityPerMinute:1,domains:['surface'],terrainLOS:true,mountHeight:0};
const unit=(id,faction,x=1000,y=1000)=>({id,name:id,domain:'surface',faction,manned:true,speed:0,initial:{x,y,z:0},route:[],routeMode:'once'});
const scenario={version:1,unitsSystem:'SI',title:'Detection test',duration:60,seed:'detection-test',trial:0,terrain:{columns:5,rows:5,spacing:500,origin:{x:0,y:0},seaLevel:0,elevations:Array(25).fill(-500)},units:[{...unit('observer','friendly'),sensor},unit('target','hostile')],mission:{type:'detect',observerFaction:'friendly',targetFaction:'hostile',join:'any',deadline:60}};
const run=s=>runDetection(new Simulation(s));
assert.equal(run(scenario).success,true);assert.equal(run(scenario).successTime,10);
const result=run(scenario);assert.equal(snapshotMission(result,scenario.mission,9).status,'pending');assert.equal(snapshotMission(result,scenario.mission,10).status,'success');assert.deepEqual(run(scenario),result);
const reverse=clone(scenario);reverse.units.reverse();assert.deepEqual(run(reverse),result);
const zero=clone(scenario);zero.units[0].sensor.probabilityPerMinute=0;assert.equal(run(zero).success,false);assert.equal(snapshotMission(run(zero),zero.mission,60).status,'failure');
const invisible=clone(scenario);invisible.units[1].detectability=0;assert.equal(run(invisible).success,false);
const wrongDomain=clone(scenario);wrongDomain.units[0].sensor.domains=['air'];assert.equal(run(wrongDomain).success,false);
const far=clone(scenario);far.units[1].initial.x=2000;assert.equal(run(far).success,false,'Range boundary has zero probability');
const invalid=clone(scenario);invalid.units[1].initial.x=-100;assert.equal(run(invalid).success,false);assert.equal(run(invalid).invalidUnits,1);
const partial=clone(scenario);partial.mission.deadline=3;assert.equal(run(partial).successTime,3);
const all=clone(scenario);all.units.push(unit('far-target','hostile',2000));all.mission.join='all';assert.equal(run(all).success,false);assert.equal(run(all).detectedCount,1);
all.mission.join='any';assert.equal(run(all).success,true);assert.equal(run(all).targetCount,2);
const specific=clone(all);specific.mission.targetIds=['far-target'];assert.equal(run(specific).success,false);
specific.mission.targetIds=['missing'];assert.throws(()=>run(specific),/対象/);
const noTargets=clone(scenario);noTargets.units.pop();assert.throws(()=>run(noTargets),/対象/);
const noObserver=clone(scenario);noObserver.units.shift();assert.equal(run(noObserver).success,false);
const ridge={columns:3,rows:2,spacing:500,origin:{x:0,y:0},seaLevel:0,elevations:[100,1000,100,100,1000,100]};
assert.equal(terrainVisible(new Terrain(ridge),{x:0,y:250,z:102},{x:1000,y:250,z:102}),false);
assert.equal(terrainVisible(new Terrain(ridge),{x:0,y:250,z:1500},{x:1000,y:250,z:1500}),true);
const terrainTest=clone(scenario);terrainTest.terrain=ridge;for(const u of terrainTest.units){u.domain='ground';u.initial={x:u.id==='observer'?0:1000,y:250,z:100};}
terrainTest.units[0].sensor.range=2000;terrainTest.units[0].sensor.domains=['ground'];terrainTest.units[0].sensor.mountHeight=2;
assert.equal(run(terrainTest).success,false);terrainTest.units[0].sensor.terrainLOS=false;assert.equal(run(terrainTest).success,true);
const probabilistic=clone(scenario);probabilistic.units[0].sensor.probabilityPerMinute=.5;
let success60=0,success10=0;for(let trial=0;trial<2000;trial++){probabilistic.trial=trial;const m=new Simulation(probabilistic);success60+=+runDetection(m,m.scenario.mission,60).success;success10+=+runDetection(m,m.scenario.mission,10).success;}
assert(Math.abs(success60/2000-.5)<.04);assert(Math.abs(success10/2000-.5)<.04);
assert(Math.abs(contactProbability({...sensor,probabilityPerMinute:.5},0,1,60)-.5)<1e-10);
assert(Math.abs(contactProbability({...sensor,probabilityPerMinute:.5},0,2,60)-.75)<1e-10);
const interval=wilson(50,100);assert(Math.abs(interval.low-.4038315303659957)<1e-10);assert(Math.abs(interval.high-.5961684696340044)<1e-10);
assert(wilson(0,100).high>0&&wilson(100,100).low<1);assert.equal(wilson(0,0).rate,null);
const malformed=clone(scenario);malformed.units[0].sensor.domains=[];assert.throws(()=>validateScenario(malformed),/domains/);
const demo=JSON.parse(fs.readFileSync(new URL('../data/detection-demo.jsn',import.meta.url),'utf8'));demo.analysis.groupId='observers';demo.analysis.counts=demo.analysis.factors.shift().values;prepareAnalysis(demo);
const start=performance.now(),summary=[];
for(const count of demo.analysis.counts){const trials=[];for(let trial=0;trial<50;trial++){const model=new Simulation(scenarioForCount(demo,'observers',count,trial)),r=runDetection(model);trials.push({...r,trial});}summary.push(summarizeRow(count,trials));}
for(let trial=0;trial<50;trial++){for(let i=1;i<summary.length;i++){const a=summary[i-1].trials[trial],b=summary[i].trials[trial];assert(!a.success||b.success,'Adding observers must preserve successful detections with paired streams');if(a.success)assert(b.successTime<=a.successTime);}}
assert(summary[0].rate<summary.at(-1).rate);
const before=clone(demo);scenarioForCount(demo,'observers',0,3);assert.deepEqual(demo,before,'Sweep must not mutate source');
const payload={type:'SimSim-analysis',version:5,model:'trigger-behavior-v3',source:importScenario(demo),rows:summary.map(row=>({...row,condition:prepareAnalysis(demo).conditions.find(c=>c.settings[0].value===row.count),trials:row.trials.map(t=>({...t,sampled:[]}))})),elapsedMs:500};
const restored=restoreAnalysisResult(payload);assert.equal(restored.completed,200);assert.equal(restored.rows[3].rate,summary[3].rate);
const broken=clone(payload);broken.rows[0].trials[0].successTime=999999;broken.rows[0].trials[0].success=true;assert.throws(()=>restoreAnalysisResult(broken),/一致|時刻/);
const stale=clone(payload);stale.rows[0].rate=1;assert.equal(restoreAnalysisResult(stale).rows[0].rate,summary[0].rate,'Imported summary must be recalculated from trials');
console.log(JSON.stringify({status:'PASS',checks:'detection, time prefixes, paired streams, any/all, domain filtering, invalid units, terrain LOS, probability scaling/timestep convergence, Wilson CI, validation, count sweeps',elapsedMs:Math.round(performance.now()-start),rows:summary.map(({count,rate,low,high,median})=>({count,rate,low,high,median}))}));
