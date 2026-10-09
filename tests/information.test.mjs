import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {clone,validateScenario} from '../src/engine.js?v=20261007-plan-switch-25';
import {createSimulation,sharedSteps,recordingPayload,restoreRecording} from '../src/recorded-engine.js?v=20261007-plan-switch-25';
import {rememberInformation} from '../src/knowledge.js?v=20261007-plan-switch-25';
const base=JSON.parse(fs.readFileSync(new URL('../data/received-position-demo.txt',import.meta.url)));
const source=()=>{const s=clone(base);s.version=4;s.duration=60;s.units[0].sensor.enabled=false;s.behaviors[0].triggers=[];s.behaviors[1].triggers=[];s.behaviors[2].initial='move';s.behaviors[2].triggers=[];return s;};
const run=s=>{const m=createSimulation(s);for(const _ of sharedSteps(m,undefined,undefined,{record:true,horizon:s.duration})){}return m;};
test('v4 known destinations never use hidden world positions; initial intelligence remains a snapshot',()=>{
 const s=source();s.destinations=[{id:'known',name:'既知位置',kind:'unit',unitId:'uuv',access:'known'}];s.behaviors[2].nodes[1].destinationId='known';
 const m=run(s);assert.equal(m.byId.get('uav').distance,0);assert.equal(m.byId.get('uav').status,'standby');
 s.initialInformation=[{ownerId:'uav',observation:{targetId:'uuv',targetPosition:{x:800,y:0,z:-100},observationTime:-5}}];
 const informed=run(s);assert.equal(informed.byId.get('uav').position.x,800);assert.equal(informed.byId.get('uuv').position.x,1600);
 const replay=restoreRecording(recordingPayload(informed));for(const t of [0,20,60]){assert.deepEqual(replay.evaluate(t).units,informed.evaluate(t).units);assert.deepEqual(replay.evaluate(t).knowledge,informed.evaluate(t).knowledge);assert.deepEqual(replay.evaluate(t).actionEvents,informed.evaluate(t).actionEvents);}
 s.destinations[0].access='truth';assert.throws(()=>validateScenario(s),/真位置/);
});
test('contacts remain separate and stale delayed intelligence cannot overwrite fresh contacts',()=>{
 const m=createSimulation(source()),k=m.byId.get('uav').knowledge;
 for(const [id,t,x] of [['uuv',20,800],['relay',15,500],['uuv',10,200]])rememberInformation(k,{targetId:id,targetPosition:{x,y:0,z:0},observationTime:t},25);
 assert.equal(Object.keys(k.contacts).length,2);assert.equal(k.contacts.uuv.position.x,800);assert.equal(k.contacts.uuv.receivedAt,25);
});
test('three-valued conditions use local age and explicit unknown branches; deterministic priority',()=>{
 const s=source(),g=s.behaviors[2];g.initial='patrol';g.nodes.push({id:'stale',kind:'stop'},{id:'missing',kind:'stop'});
 g.edges=[{from:'patrol',to:'stale',when:'condition',condition:{field:'knowledge.selectedContact.age',op:'gt',value:20},priority:5},{from:'patrol',to:'missing',when:'condition',condition:{field:'knowledge.selectedContact.age',op:'gt',value:20},onUnknown:true,priority:0}];
 assert.equal(run(s).byId.get('uav').node.id,'missing');
 s.initialInformation=[{ownerId:'uav',observation:{targetId:'uuv',targetPosition:{x:800,y:0,z:0},observationTime:0}}];
 const m=run(s),e=m.result.actionEvents.find(e=>e.type==='decision');assert.equal(e.time,30);assert.equal(e.to,'stale');assert.equal(e.context.knowledge.selectedContact.age,30);assert(!('entityId' in e.context.knowledge.selectedContact));
 g.edges[0].condition.field='truth.units.uuv.position.x';assert.throws(()=>validateScenario(s),/公開フィールド/);
});
test('only authorized delivered commands select command edges; no command moves a remote unit before delivery',()=>{
 const s=source(),sender=s.behaviors[0],receiver=s.behaviors[2];sender.initial='report';sender.triggers=[];sender.nodes[1].receiverId='uav';sender.nodes[1].messageKind='command';sender.nodes[1].command={name:'respond'};
 receiver.initial='patrol';receiver.nodes.push({id:'done',kind:'stop'});receiver.edges=[{from:'patrol',to:'done',when:'command',commandName:'respond'}];
 const denied=run(s);assert.equal(denied.byId.get('uav').node.id,'patrol');assert(denied.result.actionEvents.some(e=>e.type==='commandRejected'));assert.equal(denied.evaluate(60).knowledge.uav.commands.length,0);
 s.units[2].commandSources=['observer'];const accepted=run(s);assert.equal(accepted.evaluate(6).units.find(u=>u.id==='uav').nodeId,'patrol');assert.equal(accepted.evaluate(7).units.find(u=>u.id==='uav').nodeId,'done');assert.equal(accepted.evaluate(7).knowledge.uav.commands.length,1);
 const replay=restoreRecording(recordingPayload(accepted));assert.deepEqual(replay.evaluate(7).knowledge,accepted.evaluate(7).knowledge);
});
