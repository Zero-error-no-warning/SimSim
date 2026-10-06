import assert from 'node:assert/strict';
import {clone,validateScenario} from '../src/engine.js?v=20261006-label-rail-15';
import {createSimulation,sharedSteps,recordingPayload,restoreRecording} from '../src/recorded-engine.js?v=20261006-label-rail-15';
import {importScenario} from '../src/scenario-import.js?v=20261006-label-rail-15';
import {prepareAnalysis,runDetection,restoreAnalysisResult,summarizeRow,snapshotMission} from '../src/detection.js?v=20261006-label-rail-15';
import {trialScenario,readParameter,availableBindings} from '../src/parameters.js?v=20261006-label-rail-15';
const unit=(id,faction,x=0)=>({id,name:id,domain:'surface',faction,manned:false,speed:0,initial:{x,y:0,z:0},route:[],routeMode:'once'});
const communication={enabled:true,range:20000,delay:7,probability:1,terrainLOS:false};
const reportGraph=(id,entry,when,receiver)=>({id,name:id,entry,nodes:[{id:entry,kind:entry==='signal'?'signal':'follow'},{id:'report',kind:'report',receiverId:receiver}],edges:[{from:entry,to:'report',when},{from:'report',to:entry,when:'sent',resume:true},{from:'report',to:entry,when:'sendFailed',resume:true}]});
const source={version:3,unitsSystem:'SI',title:'Unified actions',duration:300,seed:'actions-test',trial:0,
  terrain:{columns:5,rows:3,spacing:1000,origin:{x:-1000,y:-1000},seaLevel:0,elevations:Array(15).fill(-500)},
  units:[{...unit('sensor','friendly'),sensor:{enabled:true,range:10000,probabilityPerMinute:1,domains:['surface'],terrainLOS:false,mountHeight:0},communication},
    {...unit('relay','friendly',500),communication:{...communication,delay:3}},
    {...unit('responder','friendly'),domain:'air',speed:10,initial:{x:0,y:0,z:100},route:[{x:1000,y:0,z:100}]},unit('target','hostile',100)],
  behaviors:[reportGraph('sense','follow','detected','relay'),reportGraph('relay','signal','received','responder'),
    {id:'respond',name:'Respond',entry:'signal',nodes:[{id:'signal',kind:'signal'},{id:'ready',kind:'wait',seconds:20,parameter:'preparation'},{id:'follow',kind:'follow'}],edges:[{from:'signal',to:'ready',when:'received',once:true},{from:'ready',to:'follow',when:'elapsed'}]}],
  behaviorAssignments:[{id:'sense',name:'Sense',behaviorId:'sense',targets:['unit:sensor'],spacing:'none'},
    {id:'relay',name:'Relay',behaviorId:'relay',targets:['unit:relay'],spacing:'none'},
    {id:'respond',name:'Respond',behaviorId:'respond',targets:['unit:responder'],spacing:'none',preparation:20}],
  recording:{step:10,interval:10},mission:{type:'arrive',observerFaction:'friendly',targetFaction:'hostile',join:'any',deadline:150,responderIds:['responder']},
  analysis:{trials:5,step:10,requiredRate:.9,factors:[],uncertainties:[]}};
const run=s=>{const model=createSimulation(s),g=sharedSteps(model,model.source.mission,undefined,{horizon:s.duration,record:true});let x=g.next();while(!x.done)x=g.next();return {model,result:x.value};};
const {model,result}=run(source);
assert.equal(result.successTime,140);assert.equal(result.reachedCount,1);
const visible=new Set(['detected','sent','received','preparing','departed','arrived']);
assert.deepEqual(result.actionEvents.filter(e=>visible.has(e.type)).map(e=>[e.type,e.time]),[['detected',10],['sent',10],['received',17],['sent',17],['received',20],['preparing',20],['departed',40],['arrived',140]]);
for(const e of result.actionEvents.filter(e=>e.type==='received')){assert.equal(e.targetId,'target');assert.equal(e.observationTime,10);}
assert.equal(model.evaluate(19).units.find(u=>u.id==='responder').status,'standby');
assert.equal(model.evaluate(20).units.find(u=>u.id==='responder').status,'preparing');
assert.equal(model.evaluate(90).units.find(u=>u.id==='responder').position.x,500);
assert.equal(model.evaluate(140).units.find(u=>u.id==='responder').status,'arrived');
const before=model.computeCount;model.evaluate(10);assert.equal(model.computeCount,before);assert.throws(()=>sharedSteps(model).next(),/計算済み/);
assert.deepEqual(restoreRecording(recordingPayload(model)).evaluate(90).units,model.evaluate(90).units);
const reordered=clone(source);reordered.units.reverse();assert.deepEqual(run(reordered).result,result);
for(const failure of ['probability','range','sensor']){const s=clone(source);if(failure==='sensor')s.units[0].sensor.probabilityPerMinute=0;else s.units[0].communication[failure]=0; if(failure==='range')s.units[0].communication.range=1;assert.equal(run(s).result.success,false);}
const late=clone(source);late.behaviorAssignments[2].preparation=31;const l=run(late);assert.equal(l.result.success,false);assert.equal(l.result.actionEvents.find(e=>e.type==='arrived').time,151);assert.equal(snapshotMission(l.result,late.mission,300).status,'failure');
const edge=clone(source);edge.mission.deadline=140;assert(run(edge).result.success);
for(const variant of ['blocked','empty','zero','loop']){const s=clone(source),u=s.units[2];if(variant==='blocked')u.route[0].z=0;if(variant==='empty')u.route=[];if(variant==='zero')u.speed=0;if(variant==='loop')u.routeMode='loop';assert.equal(run(s).result.success,false,variant);}
// Multiple independent messages at the same timestamp must each be relayed.
const repeated=clone(source);repeated.units.push({...clone(source.units[0]),id:'sensor2',name:'sensor2'});repeated.behaviorAssignments[0].targets.push('unit:sensor2');const rep=run(repeated);assert.equal(rep.result.actionEvents.filter(e=>e.type==='sent'&&e.unitId==='relay').length,2);assert.equal(rep.result.actionEvents.filter(e=>e.type==='departed').length,1);
// A cyclic chain is bounded by causal edge identities, without an old rules executor.
const cycle=clone(source);cycle.units[0].communication.delay=0;cycle.units[1].communication.delay=0;cycle.behaviors[1].nodes[1].receiverId='sensor';cycle.behaviors[0].edges.push({from:'follow',to:'report',when:'received'});const cyc=run(cycle);assert(cyc.result.actionEvents.length<50);
const other=clone(source);other.mission.observerFaction='hostile';other.mission.targetFaction='friendly';assert.deepEqual(run(other).result.actionEvents,result.actionEvents,'Evaluation does not restrict execution');
source.analysis.factors=[{target:'assignment:respond',parameter:'behavior.preparation',values:[20,31]}];source.analysis.uncertainties=[{target:'unit:sensor',parameter:'interaction.communication.delay',distribution:'uniform',min:0,max:7}];
assert(availableBindings(source).some(b=>b.parameter==='behavior.preparation'));assert.equal(readParameter(source,{target:'assignment:respond',parameter:'behavior.preparation'}),20);
const {conditions}=prepareAnalysis(source),rows=conditions.map(condition=>{const trials=Array.from({length:5},(_,trial)=>{const sampled=trialScenario(source,condition,trial);return {...runDetection(createSimulation(sampled.scenario)),trial,sampled:sampled.sampled};});return {...summarizeRow(condition.count,trials),condition};});
assert.equal(restoreAnalysisResult({type:'SimSim-analysis',version:5,model:'trigger-behavior-v3',source,rows}).completed,10);
const unsupported={...clone(source),version:1};unsupported.units[0].behavior={hold:false,preparation:0,rules:[{id:'a',when:'detected',action:'send',receiverId:'relay',state:'any',once:true},{id:'b',when:'detected',action:'send',receiverId:'responder',state:'any',once:true}]};unsupported.behaviorAssignments=[];assert.throws(()=>importScenario(unsupported),/自動変換/);
console.log('PASS: unified detection, relay payloads and simultaneous messages, exact latency and arrival, bounded cycles, independent evaluation, recorded seek and current analysis format');
