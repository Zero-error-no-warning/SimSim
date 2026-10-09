import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createSimulation,sharedSteps,recordingPayload,restoreRecording} from '../src/recorded-engine.js?v=20261009-configuration-contract-28';
const source=()=>{const s=JSON.parse(fs.readFileSync(new URL('../data/information-mission.txt',import.meta.url)));delete s.experiment;s.analysis.uncertainties=[];return s;};
const run=(s,storage='replay')=>{const m=createSimulation(s);let result;const g=sharedSteps(m,undefined,undefined,{record:storage==='replay',storage,horizon:s.duration});let step=g.next();while(!step.done)step=g.next();result=step.value;return {m,result};};
test('depletion stops movement/sensing/communication and recorded own resource state seeks correctly',()=>{
 const s=source();s.units[2].resources={energy:{capacity:12,perSecond:1}};const {m}=run(s);assert.equal(m.byId.get('uav').distance,840);assert.equal(m.byId.get('uav').status,'depleted');assert.equal(m.evaluate(5).units.find(u=>u.id==='uav').resources.energy.remaining,7);assert.equal(m.evaluate(12).units.find(u=>u.id==='uav').resources.energy.remaining,0);
 const restored=restoreRecording(recordingPayload(m));for(const t of [0,5,12,120])assert.deepEqual(restored.evaluate(t).units,m.evaluate(t).units);
});
test('low energy drives return, replenishment and a new patrol without a second hidden task implementation',()=>{
 const s=source();s.duration=180;s.units[0].sensor.enabled=false;s.units[2].resources={energy:{capacity:20,perSecond:.1,byNodeKind:{patrol:1},replenish:{destinationId:'base',rate:2}}};s.destinations.push({id:'base',name:'補給地点',kind:'point',point:{x:0,y:0,z:1000}});const g=s.behaviors[2];g.triggers=[];g.nodes=[{id:'patrol',kind:'patrol',routeId:'patrol',joinMode:'start',speedFraction:.7},{id:'return',kind:'move',destinationId:'base',heightMode:'target'},{id:'service',kind:'wait',seconds:180}];g.edges=[{from:'patrol',to:'return',when:'condition',condition:{field:'self.resources.energy.fraction',op:'lte',value:.5}},{from:'return',to:'service',when:'arrived'},{from:'service',to:'patrol',when:'condition',condition:{field:'self.resources.energy.fraction',op:'gte',value:.99}}];s.mission.nodeId='service';s.measurements=[];
 const {m}=run(s);assert(m.result.actionEvents.filter(e=>e.type==='nodeChanged'&&e.nodeId==='service').length>1);assert(m.result.actionEvents.some(e=>e.type==='resourceChanged'&&e.remaining===20));assert(m.byId.get('uav').resources.energy.recovered>20);
});
test('summary/events/replay preserve evaluation while summary buffers only a boundary worth of events',()=>{
 const s=source();s.units[0].resources={energy:{capacity:100,perSecond:.1}};const runs=['summary','events','replay'].map(storage=>run(s,storage).result);
 for(const key of ['success','successTime','detectedCount','reachedCount','stateEntries','measurements','informationMetrics','resources','taskSummary'])assert.deepEqual(runs[0][key],runs[2][key]);
 assert.equal(runs[0].actionEvents.length,0);assert(!runs[0].informationEvents);assert.equal(runs[0].storageStats.eventCount,runs[1].actionEvents.length);assert(runs[0].storageStats.maxBufferedEvents<runs[1].actionEvents.length);
 assert.equal(runs[2].taskSummary.find(t=>t.id==='respond').total,1);
});
