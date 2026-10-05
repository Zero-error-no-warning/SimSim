import assert from 'node:assert/strict';
import {clone,validateScenario} from '../src/engine.js?v=20261005-navigation-5';
import {createSimulation,sharedSteps,recordingPayload,restoreRecording} from '../src/recorded-engine.js?v=20261005-navigation-5';
import {moveDefinition,editWaypoint,removeDefinition} from '../src/editor.js?v=20261005-navigation-5';
const point=(x,y=0,z=0)=>({x,y,z});
const unit=(id,x=0,speed=10)=>({id,name:id,domain:'surface',faction:id==='actor'?'friendly':'hostile',manned:false,speed,initial:point(x),route:[point(x+10000)],routeMode:'once'});
const base={version:3,unitsSystem:'SI',title:'Named navigation',duration:250,seed:'nav',terrain:{columns:5,rows:5,spacing:10000,origin:point(-10000,-10000),seaLevel:0,elevations:Array(25).fill(-500)},units:[unit('actor')],routes:[{id:'a',name:'A',points:[point(0),point(1000)]},{id:'b',name:'B',points:[point(0,1000),point(1000,1000)]}],destinations:[{id:'x',name:'X',kind:'point',point:point(1000)}],behaviors:[{id:'g',name:'G',initial:'a',triggers:[{id:'switch',event:'time',seconds:10,to:'b'}],nodes:[{id:'a',kind:'follow',routeId:'a'},{id:'b',kind:'follow',routeId:'b'},{id:'done',kind:'stop'}],edges:[{from:'b',to:'done',when:'arrived'}]}],behaviorAssignments:[{id:'task',name:'Task',behaviorId:'g',targets:['unit:actor'],spacing:'none'}],recording:{step:10,interval:10}};
function run(value){const m=createSimulation(value),steps=sharedSteps(m,undefined,undefined,{horizon:value.duration,record:true});let next=steps.next();while(!next.done)next=steps.next();return m;}
const near=(a,b,epsilon=1e-5)=>assert(Math.abs(a-b)<epsilon,`${a} != ${b}`);
const switched=run(base);
near(switched.evaluate(10).units[0].position.x,100);near(switched.evaluate(10).units[0].position.y,0);
near(switched.evaluate(20).units[0].position.x,100-100*100/Math.hypot(100,1000));
near(switched.evaluate(20).units[0].position.y,1000*100/Math.hypot(100,1000));
near(switched.evaluate(250).units[0].distance,1100+Math.hypot(100,1000),.001);
assert.equal(switched.evaluate(250).units[0].nodeId,'done');
assert.deepEqual(restoreRecording(recordingPayload(switched)).evaluate(20).units,switched.evaluate(20).units);
// The requested sensor -> alternative route transition preserves the current position.
const sensor=clone(base);sensor.behaviors[0].triggers=[];sensor.behaviors[0].edges.push({from:'a',to:'b',when:'detected'});sensor.units.push({...unit('enemy',100,0),route:[]});
sensor.units[0].sensor={enabled:true,range:500,probabilityPerMinute:1,domains:['surface'],terrainLOS:false};
const detected=run(sensor);assert.equal(detected.result.actionEvents.find(e=>e.type==='detected').time,10);near(detected.evaluate(10).units.find(u=>u.id==='actor').position.x,100);
// A point destination has an exact arrival event, and a unit destination follows moving positions.
const moving=clone(base);moving.behaviors[0]={id:'g',name:'G',initial:'move',triggers:[],nodes:[{id:'move',kind:'move',destinationId:'x'},{id:'done',kind:'stop'}],edges:[{from:'move',to:'done',when:'arrived'}]};
const arrived=run(moving);near(arrived.result.actionEvents.find(e=>e.type==='arrived').time,100);
moving.units.push(unit('target',1000,5));moving.destinations=[{id:'target',name:'Target',kind:'unit',unitId:'target'}];moving.behaviors[0].nodes[0].destinationId='target';
moving.behaviors[0].edges=[{from:'move',to:'done',when:'near',destinationId:'target',distance:500,distanceMode:'absolute'}];
const pursuit=run(moving);near(pursuit.result.actionEvents.find(e=>e.type==='near').time,100);near(pursuit.evaluate(100).units.find(u=>u.id==='actor').position.x,1000);
// Height difference is ignored only in horizontal-distance mode.
const distance=clone(base);distance.duration=100;distance.units[0].domain='air';distance.units[0].initial.z=1000;distance.routes[0].points.forEach(p=>p.z=1000);distance.destinations[0].point.z=2000;
distance.behaviors[0].triggers=[];distance.behaviors[0].edges=[{from:'a',to:'done',when:'near',destinationId:'x',distance:500,distanceMode:'horizontal'}];
near(run(distance).result.actionEvents.find(e=>e.type==='near').time,50);
distance.behaviors[0].edges[0].distanceMode='absolute';distance.behaviors[0].edges[0].distance=900;assert(!run(distance).result.actionEvents.some(e=>e.type==='near'));
distance.behaviors[0].edges[0].distance=1100;near(run(distance).result.actionEvents.find(e=>e.type==='near').time,(1000-Math.sqrt(1100**2-1000**2))/10);
// Fast passes are not missed between coarse steps; repeat triggers need exit and re-entry.
const fast=clone(base);fast.units[0].speed=1000;fast.routes[0].points[1].x=10000;fast.destinations[0].point.x=500;fast.behaviors[0].triggers=[];
fast.behaviors[0].edges=[{from:'a',to:'done',when:'near',destinationId:'x',distance:100,distanceMode:'horizontal'}];near(run(fast).result.actionEvents.find(e=>e.type==='near').time,.4);
const repeat=clone(moving);repeat.duration=400;repeat.units[0].speed=0;repeat.units[1].initial=point(0);repeat.units[1].route=[point(1000)];repeat.units[1].routeMode='pingpong';repeat.units[1].speed=10;
repeat.behaviors[0]={id:'g',name:'G',initial:'signal',triggers:[{id:'near',event:'near',to:'signal',destinationId:'target',distance:100,distanceMode:'absolute',once:false}],nodes:[{id:'signal',kind:'signal'}],edges:[]};
assert.deepEqual(run(repeat).result.actionEvents.filter(e=>e.type==='triggered').map(e=>e.time),[0,190,390]);
repeat.behaviors[0].triggers[0].once=true;assert.equal(run(repeat).result.actionEvents.filter(e=>e.type==='triggered').length,1);
const saved=run(repeat);assert.deepEqual(restoreRecording(recordingPayload(saved)).evaluate(200).units,saved.evaluate(200).units);
// Reference checks and main-map editing use the same named initial route.
const edited=clone(base);moveDefinition(edited,'actor',{x:20,y:30});assert.deepEqual(edited.routes[0].points[0],point(20,30));editWaypoint(edited,'actor',0,point(300,300));assert.deepEqual(edited.routes[0].points[1],point(300,300));
assert.throws(()=>removeDefinition(moving,'target'),/目的地/);
for(const change of [s=>s.routes[0].points=[],s=>s.behaviors[0].nodes[0].routeId='missing',s=>s.destinations[0].kind='unknown',s=>s.routes={},s=>s.destinations={}]){const bad=clone(base);change(bad);assert.throws(()=>validateScenario(bad),/経路|目的地/);}
const old=clone(moving);old.destinations=[];old.behaviors[0].nodes[0]={id:'move',kind:'return'};old.behaviors[0].edges=[];old.behaviorAssignments[0].base=point(1000);assert.equal(createSimulation(old).source.behaviors[0].nodes[0].kind,'move');
console.log('PASS: named routes, sensor switching without teleport, cumulative movement, waypoint edits, point and moving-unit destinations, horizontal/3D distance, exact and fast threshold crossings, repeated re-entry, legacy return migration and recorded replay');
