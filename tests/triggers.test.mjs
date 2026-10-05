import assert from 'node:assert/strict';
import {clone,validateScenario} from '../src/engine.js?v=20261005-parameters-terrain-6';
import {importScenario} from '../src/scenario-import.js?v=20261005-parameters-terrain-6';
import {createSimulation,sharedSteps,recordingPayload,restoreRecording} from '../src/recorded-engine.js?v=20261005-parameters-terrain-6';
const unit=(id,faction,x=0)=>({id,name:id,domain:'surface',faction,manned:false,speed:10,initial:{x,y:0,z:0},route:[{x:x+500,y:0,z:0}],routeMode:'once'});
const base={version:3,unitsSystem:'SI',title:'Trigger regression',duration:100,seed:'trigger-test',
 terrain:{columns:5,rows:3,spacing:1000,origin:{x:-1000,y:-1000},seaLevel:0,elevations:Array(15).fill(-500)},
 units:[unit('actor','friendly'),unit('target','hostile',100)],
 behaviors:[{id:'respond',name:'Respond',triggers:[{id:'at-125','event':'time',seconds:12.5,to:'follow'}],nodes:[{id:'follow',kind:'follow'},{id:'done',kind:'stop'},{id:'wait',kind:'wait',seconds:5}],edges:[{from:'follow',to:'done',when:'arrived'},{from:'wait',to:'done',when:'elapsed'}]}],
 behaviorAssignments:[{id:'a',name:'A',behaviorId:'respond',targets:['unit:actor'],spacing:'none'}],recording:{step:10,interval:10}};
function run(value){const m=createSimulation(value),g=sharedSteps(m,undefined,undefined,{horizon:value.duration,record:true});let v=g.next();while(!v.done)v=g.next();return {m,r:v.value};}
const {m,r}=run(base);
assert.equal(m.evaluate(12).units[0].nodeId,undefined);
assert.equal(m.evaluate(12).units[0].position.x,0);
assert.equal(m.evaluate(12).units[0].status,'standby');
assert.equal(m.evaluate(12.5).units[0].nodeId,'follow');
assert.equal(m.evaluate(22.5).units[0].position.x,100);
assert.equal(r.actionEvents.find(e=>e.type==='triggered').time,12.5);
assert.equal(r.actionEvents.find(e=>e.type==='arrived'&&e.unitId==='actor').time,62.5);
assert(m.frames.some(f=>f.time===12.5));
const prior=m.computeCount;m.evaluate(80);m.evaluate(2);assert.equal(m.computeCount,prior);
const archive=restoreRecording(recordingPayload(m));assert.deepEqual(archive.evaluate(12).units,m.evaluate(12).units);assert.deepEqual(archive.evaluate(22.5).units,m.evaluate(22.5).units);
// Every event interrupts the executing state, with no policy selector.
const multi=clone(base);multi.behaviors[0].triggers.push({id:'at-20',event:'time',seconds:20,to:'wait'});
const interrupted=run(multi);
assert.equal(interrupted.m.evaluate(20).units[0].nodeId,'wait');assert.equal(interrupted.m.evaluate(25).units[0].nodeId,'done');assert.equal(interrupted.m.evaluate(100).units[0].distance,75);
// A terminal node can accept another trigger; a normal wait stays active.
const again=clone(base);again.behaviors[0].triggers=[{id:'start',event:'scenarioStart',to:'wait'},{id:'at-20',event:'time',seconds:20,to:'follow'}];
assert.equal(run(again).r.actionEvents.filter(e=>e.type==='triggered').length,1);
assert.equal(run(again).r.actionEvents.filter(e=>e.type==='initialized').length,1);
// Standby detection activates without an artificial signal processing node.
const detection=clone(base);detection.units[0].speed=0;detection.units[0].sensor={enabled:true,range:1000,probabilityPerMinute:1,domains:['surface'],terrainLOS:false};
detection.behaviors[0].triggers=[{id:'on-detect',event:'detected',to:'wait'}];
assert.equal(run(detection).r.actionEvents.find(e=>e.type==='triggered').time,10);
// The receiver has no executing node until delivery. Its received payload can be relayed.
const received=clone(detection);received.units.push({...unit('relay','friendly',200),speed:0,communication:{enabled:true,range:20000,delay:3,probability:1,terrainLOS:false}},{...unit('final','friendly',300),speed:0});
received.units[0].communication={enabled:true,range:20000,delay:2.5,probability:1,terrainLOS:false};
received.behaviors[0].nodes.push({id:'report',kind:'report',receiverId:'relay'});received.behaviors[0].triggers[0].to='report';received.behaviors[0].edges.push({from:'report',to:'done',when:'sent'});
received.behaviors.push({id:'relay',name:'Relay',triggers:[{id:'on-message',event:'received',to:'send'}],nodes:[{id:'send',kind:'report',receiverId:'final'},{id:'stop',kind:'stop'}],edges:[{from:'send',to:'stop',when:'sent'}]});
received.behaviorAssignments.push({id:'relay',name:'Relay',behaviorId:'relay',targets:['unit:relay'],spacing:'none'});
let rr=run(received);assert.equal(rr.m.evaluate(12).units.find(u=>u.id==='relay').nodeId,undefined);assert.equal(rr.m.evaluate(12.5).units.find(u=>u.id==='relay').nodeId,'stop');
const final=rr.r.actionEvents.find(e=>e.type==='received'&&e.unitId==='final');assert.equal(final.time,15.5);assert.equal(final.targetId,'target');assert.equal(final.observationTime,10);
assert.deepEqual(restoreRecording(recordingPayload(rr.m)).evaluate(10).units,rr.m.evaluate(10).units);
// Two real messages: once defaults true, repeatable triggers handle both after stopping.
received.units.push({...clone(received.units[0]),id:'actor2',name:'actor2'});received.behaviorAssignments[0].targets.push('unit:actor2');
assert.equal(run(received).r.actionEvents.filter(e=>e.type==='triggered'&&e.unitId==='relay').length,1);
received.behaviors[1].triggers[0].once=false;assert.equal(run(received).r.actionEvents.filter(e=>e.type==='triggered'&&e.unitId==='relay').length,2);
// Repeatable zero-delay trigger relays are bounded by causal trigger identities.
received.behaviors[1].nodes[0].receiverId='actor';received.units[0].communication.delay=0;received.units[2].communication.delay=0;
received.behaviors[0].triggers.push({id:'on-return',event:'received',to:'report',once:false,policy:'interrupt'});
assert(run(received).r.actionEvents.length<100);
// Legacy entry and scene-start nodes migrate to a state reference; source is not mutated.
const legacy=clone(base);delete legacy.behaviors[0].triggers;legacy.behaviors[0].entry='wait';const migrated=importScenario(legacy);
assert.equal(migrated.behaviors[0].initial,'wait');assert.deepEqual(migrated.behaviors[0].triggers,[]);assert(!('entry' in migrated.behaviors[0]));assert.equal(legacy.behaviors[0].entry,'wait');
for(const change of [g=>g.triggers=[],g=>g.triggers[0].to='missing',g=>g.triggers[0].event='stop',g=>g.triggers[0].seconds=-1,g=>g.triggers[0].policy='maybe',g=>g.triggers.push(clone(g.triggers[0])),g=>g.triggers[0].once='yes']){
 const bad=clone(base);change(bad.behaviors[0]);assert.throws(()=>validateScenario(bad),/イベント|初期|起動/);
}
const wrong=recordingPayload(m);wrong.result.actionEvents.find(e=>e.type==='triggered').triggerId='missing';assert.throws(()=>restoreRecording(wrong),/起動/);
// Initial state needs no event node. Legacy scene-start nodes disappear on import.
const initialized=clone(base);initialized.behaviors[0].initial='wait';initialized.behaviors[0].triggers=[];
const ir=run(initialized);assert.equal(ir.m.evaluate(0).units[0].nodeId,'wait');assert.equal(ir.m.evaluate(5).units[0].nodeId,'done');
assert.equal(ir.r.actionEvents.filter(e=>e.type==='initialized').length,1);
assert.deepEqual(restoreRecording(recordingPayload(ir.m)).evaluate(0).units,ir.m.evaluate(0).units);
const scene=clone(initialized);delete scene.behaviors[0].initial;scene.behaviors[0].triggers=[{id:'start',event:'scenarioStart',to:'wait'}];
assert.equal(importScenario(scene).behaviors[0].initial,'wait');assert.deepEqual(importScenario(scene).behaviors[0].triggers,[]);
// Repeating time events restart an active state, at exact boundaries between calculation steps.
const periodic=clone(initialized);periodic.behaviors[0].nodes.find(n=>n.id==='wait').seconds=100;
periodic.behaviors[0].triggers=[{id:'tick',event:'time',seconds:12.5,to:'wait',once:false}];
const pr=run(periodic);assert.deepEqual(pr.r.actionEvents.filter(e=>e.type==='triggered').map(e=>e.time),[12.5,25,37.5,50,62.5,75,87.5,100]);
assert.equal(pr.m.evaluate(100).units[0].nodeId,'wait');
periodic.behaviors[0].triggers[0].once=true;assert.equal(run(periodic).r.actionEvents.filter(e=>e.type==='triggered').length,1);
periodic.behaviors[0].triggers[0].once=false;periodic.behaviors[0].triggers[0].seconds=0;assert.throws(()=>validateScenario(periodic),/繰り返す/);
// A shared event wins over a state-specific edge for the same message, including while active.
const common=clone(base);common.behaviors[0].initial='follow';common.behaviors[0].triggers=[{id:'msg',event:'received',to:'wait',once:false}];
common.behaviors[0].edges.push({from:'follow',to:'done',when:'received'});
const cm=createSimulation(common),cs=cm.byId.get('actor'),ce=[];
assert(cm.transition(cs,'received',1,ce));assert.equal(cs.node.id,'wait');
assert(cm.transition(cs,'received',2,ce));assert.equal(cs.nodeTime,2);
cs.graph.triggers[0].once=true;assert.equal(cm.activate(cs,'received',3,ce),false);
// Concurrent periodic and single time events both fire, in definition order.
const collision=clone(initialized);collision.behaviors[0].triggers=[{id:'periodic',event:'time',seconds:10,to:'wait',once:false},{id:'one',event:'time',seconds:20,to:'follow'}];
assert.deepEqual(run(collision).r.actionEvents.filter(e=>e.type==='triggered'&&e.time===20).map(e=>e.triggerId),['periodic','one']);
// Earlier recording files preserve their frames and can be saved again after migration.
const oldRecord=recordingPayload(ir.m);delete oldRecord.source.behaviors[0].initial;
oldRecord.source.behaviors[0].triggers=[{id:'start',event:'scenarioStart',to:'wait'}];
const oldEvent=oldRecord.result.actionEvents.find(e=>e.type==='initialized');oldEvent.type='triggered';oldEvent.event='scenarioStart';oldEvent.triggerId='start';
const oldReplay=restoreRecording(oldRecord);assert.deepEqual(oldReplay.evaluate(5).units,ir.m.evaluate(5).units);
assert.deepEqual(restoreRecording(recordingPayload(oldReplay)).evaluate(5).units,ir.m.evaluate(5).units);
console.log('PASS: trigger timing, standby, multiple entrances, interruption, stop/reactivation, detection, received relay payload, once/repeat, causal cycle bound, legacy migration, validation and seek/archive');
