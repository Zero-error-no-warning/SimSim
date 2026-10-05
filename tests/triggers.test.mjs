import assert from 'node:assert/strict';
import {clone,validateScenario} from '../src/engine.js?v=20261005-worker-wait-2';
import {importScenario} from '../src/scenario-import.js?v=20261005-worker-wait-2';
import {createSimulation,sharedSteps,recordingPayload,restoreRecording} from '../src/recorded-engine.js?v=20261005-worker-wait-2';
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
// Multiple timed entrances: busy time is ignored by default, interrupt is explicit.
const multi=clone(base);multi.behaviors[0].triggers.push({id:'at-20',event:'time',seconds:20,to:'wait'});
assert.equal(run(multi).m.evaluate(25).units[0].nodeId,'follow');
multi.behaviors[0].triggers[1].policy='interrupt';const interrupted=run(multi);
assert.equal(interrupted.m.evaluate(20).units[0].nodeId,'wait');assert.equal(interrupted.m.evaluate(25).units[0].nodeId,'done');assert.equal(interrupted.m.evaluate(100).units[0].distance,75);
// A terminal node can accept another trigger; a normal wait stays active.
const again=clone(base);again.behaviors[0].triggers=[{id:'start',event:'scenarioStart',to:'wait'},{id:'at-20',event:'time',seconds:20,to:'follow'}];
assert.equal(run(again).r.actionEvents.filter(e=>e.type==='triggered').length,2);
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
// Legacy entry survives import only as sceneStart; source is not mutated.
const legacy=clone(base);delete legacy.behaviors[0].triggers;legacy.behaviors[0].entry='wait';const migrated=importScenario(legacy);
assert.equal(migrated.behaviors[0].triggers[0].event,'scenarioStart');assert.equal(migrated.behaviors[0].triggers[0].to,'wait');assert(!('entry' in migrated.behaviors[0]));assert.equal(legacy.behaviors[0].entry,'wait');
for(const change of [g=>g.triggers=[],g=>g.triggers[0].to='missing',g=>g.triggers[0].event='stop',g=>g.triggers[0].seconds=-1,g=>g.triggers[0].policy='maybe',g=>g.triggers.push(clone(g.triggers[0])),g=>g.triggers[0].once='yes']){
 const bad=clone(base);change(bad.behaviors[0]);assert.throws(()=>validateScenario(bad),/起動/);
}
const wrong=recordingPayload(m);wrong.result.actionEvents.find(e=>e.type==='triggered').triggerId='missing';assert.throws(()=>restoreRecording(wrong),/起動/);
console.log('PASS: trigger timing, standby, multiple entrances, interruption, stop/reactivation, detection, received relay payload, once/repeat, causal cycle bound, legacy migration, validation and seek/archive');
