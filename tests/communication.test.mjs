import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createSimulation,sharedSteps,recordingPayload,restoreRecording} from '../src/recorded-engine.js?v=20261007-plan-switch-25';
import {propagationVisible} from '../src/propagation.js?v=20261007-plan-switch-25';
import {Terrain} from '../src/terrain.js?v=20261007-plan-switch-25';
const base=()=>{const s=JSON.parse(fs.readFileSync(new URL('../data/information-mission.txt',import.meta.url)));delete s.experiment;s.analysis.uncertainties=[];return s;};
const run=s=>{const m=createSimulation(s);for(const _ of sharedSteps(m,undefined,undefined,{record:true,horizon:s.duration})){}return m;};
test('RF/optical spherical horizon, elevated horizon and acoustic medium boundary',()=>{
 const terrain=new Terrain({columns:9,rows:2,spacing:10000,origin:{x:0,y:0},elevations:Array(18).fill(-100),seaLevel:0}),a={x:0,y:0,z:10},b={x:40000,y:0,z:10};
 assert(!propagationVisible(terrain,a,b,{medium:'rf'}));assert(propagationVisible(terrain,{...a,z:1000},b,{medium:'rf'}));assert(propagationVisible(terrain,a,b,{medium:'ideal'}));
 assert(!propagationVisible(terrain,a,{...b,z:-10},{medium:'rf'}));assert(!propagationVisible(terrain,a,{...b,z:-10},{medium:'acoustic'}));assert(propagationVisible(terrain,{...a,z:-10},{...b,z:-10},{medium:'acoustic'}));
});
test('external loss stops local activity without silently updating HQ; undelivered queued reports are dropped',()=>{
 const s=base();s.units[2].statusReports={receiverIds:['relay'],interval:10};s.units[2].communication={enabled:true,range:100000,delay:5,probability:1,terrainLOS:false};s.operationalEvents=[{unitId:'uav',time:12,operational:false}];
 const m=run(s);assert.equal(m.evaluate(11).units.find(u=>u.id==='uav').operational,true);assert.equal(m.evaluate(12).units.find(u=>u.id==='uav').operational,false);assert.equal(m.byId.get('uav').status,'disabled');
 const k=m.evaluate(100).knowledge.relay.friendlyReports.uav;assert.equal(k.reportedState,'operational');assert.equal(k.observedAt,10);assert(m.byId.get('uav').distance<1000);
 assert.deepEqual(restoreRecording(recordingPayload(m)).evaluate(100).knowledge,m.evaluate(100).knowledge);
 const absent=base();absent.operationalEvents=[{unitId:'relay',time:12,operational:false}];const dropped=run(absent);assert(dropped.result.actionEvents.some(e=>e.type==='deliveryFailed'&&e.time===17));assert(!dropped.evaluate(180).knowledge.relay.contacts.uuv);
});
test('packet loss is not a sendFailed decision signal; retries use separate message randomness',()=>{
 const s=base();s.units[0].communication.probability=.5;s.duration=180;
 const m=run(s),attempts=m.result.actionEvents.filter(e=>e.unitId==='observer'&&e.type==='sent');assert(attempts.length>3);assert(new Set(attempts.map(e=>e.messageId)).size===attempts.length);assert(m.result.actionEvents.some(e=>e.type==='deliveryFailed'));assert(!m.result.actionEvents.some(e=>e.type==='sendFailed'&&e.unitId==='observer'));
 assert.deepEqual(run(s).result,m.result);
});
test('redundant links deliver once; media/time-specific outage does not disable the other link',()=>{
 const s=base();s.communicationLinks=[{id:'sat',senderId:'observer',receiverId:'relay',enabled:true,range:100000,delay:7,probability:1,terrainLOS:false,medium:'satellite'},{id:'backup',senderId:'observer',receiverId:'relay',enabled:true,range:100000,delay:7,probability:1,terrainLOS:false,medium:'ideal'},{id:'down',senderId:'relay',receiverId:'uav',enabled:true,range:100000,delay:3,probability:1,terrainLOS:false}];s.communicationDisruptions=[{start:0,end:180,medium:'satellite',available:false}];
 const m=run(s);assert(m.result.actionEvents.some(e=>e.type==='received'&&e.linkId==='backup'));assert(!m.result.actionEvents.some(e=>e.type==='received'&&e.linkId==='sat'));
 delete s.communicationDisruptions;const both=run(s),received=both.result.actionEvents.filter(e=>e.type==='received'&&e.unitId==='relay');assert.equal(new Set(received.map(e=>e.messageId)).size,received.length);
});
