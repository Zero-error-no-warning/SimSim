import test from 'node:test';import assert from 'node:assert/strict';
import {sampleRoute,smoothRoute,closeProfile,profileValue,defaultProfile,routeFeatureErrors,pathDuration} from '../src/route-curves.js?v=20261015-direction-markers-36';
import {Simulation} from '../src/engine.js?v=20261015-direction-markers-36';
import {createSimulation,sharedSteps,recordingPayload,restoreRecording} from '../src/recorded-engine.js?v=20261015-direction-markers-36';
import {inspectRoute} from '../src/route-planner.js?v=20261015-direction-markers-36';
const p=(x,y=0,z=100)=>({x,y,z});
const source=()=>({version:4,unitsSystem:'SI',title:'curves',duration:100,seed:'curve',terrain:{columns:5,rows:5,spacing:1000,origin:{x:-1000,y:-1000,z:0},seaLevel:0,elevations:Array(25).fill(-500)},units:[{id:'u',name:'u',domain:'air',faction:'friendly',manned:false,speed:100,initial:p(0),route:[p(1000)],routeMode:'once'}],behaviors:[],behaviorAssignments:[],recording:{step:1,interval:1}});
const near=(actual,expected,tolerance=1e-5)=>assert(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);
const linearProfile=()=>({points:[{t:0,v:.5},{t:1,v:1.5}]});
test('Bezier handles create a spatial arc; constant speed advances by arc length',()=>{
 const s=source(),u=s.units[0];u.initial.out={x:1000/3,y:0,z:1000};u.route[0].in={x:-1000/3,y:0,z:1000};const points=sampleRoute([u.initial,...u.route]);assert(points.length>10);const mid=points.find(p=>Math.abs(p.x-500)<.01);near(mid.z,850);const model=new Simulation(s),path=model.paths.get('u');assert(path.length>1000);const at=model.evaluate(pathDuration(path)/2).units[0].position;near(at.x,500,.1);near(at.z,850,.1);assert.deepEqual(sampleRoute([p(0),p(1000)]),[p(0),p(1000)]);
});
test('whole-route speed is integrated in time, including waypoint insertion and speed scaling',()=>{
 const s=source(),u=s.units[0];u.speedProfile=linearProfile();const model=new Simulation(s);near(model.evaluate(5).units[0].position.x,375);near(model.evaluate(2).units[0].actualSpeed,70);near(model.evaluate(0).units[0].eta,10);assert.equal(model.evaluate(10).units[0].status,'arrived');u.route=[p(400),p(1000)];near(new Simulation(s).evaluate(5).units[0].position.x,375);u.speed=200;near(new Simulation(s).evaluate(2.5).units[0].position.x,375);
});
test('loop automatically joins endpoint values and derivatives; whole laps are periodic',()=>{
 const profile={points:[{t:0,v:.8,out:{t:.1,v:.2}},{t:.5,v:1.5},{t:1,v:3,in:{t:-.2,v:-.3}}]};closeProfile(profile);near(profile.points[0].v,profile.points.at(-1).v);near(profile.points[0].out.v/profile.points[0].out.t,profile.points.at(-1).in.v/profile.points.at(-1).in.t);near(profileValue(profile,0),profileValue(profile,1),1e-7);
 const s=source(),u=s.units[0];u.route=[p(1000),p(1000,1000)];u.routeMode='loop';smoothRoute([u.initial,...u.route],true);u.speedProfile=profile;const m=new Simulation(s),period=pathDuration(m.paths.get('u'));const a=m.evaluate(1).units[0],b=m.evaluate(period+1).units[0];near(a.position.x,b.position.x);near(a.position.y,b.position.y);near(a.actualSpeed,b.actualSpeed);
});
test('terrain inspection checks curved interiors and malformed metadata is rejected',()=>{
 const s=source(),u=s.units[0];u.initial.out={x:300,y:0,z:-300};u.route[0].in={x:-300,y:0,z:-300};assert.equal(inspectRoute(s.terrain,[u.initial,...u.route],{domain:'air'}).ok,false);assert(new Simulation(s).paths.get('u').error);assert(routeFeatureErrors([p(0)],{points:[{t:0,v:0},{t:1,v:0}]}).length);assert(routeFeatureErrors([{...p(0),out:{x:1,y:0,z:NaN}}]).length);
});
function run(s){const m=createSimulation(s);for(const step of sharedSteps(m,undefined,undefined,{record:true,horizon:s.duration})){}return m;}
test('task follow uses shared curves/profile, exact arrival boundary and replay seek',()=>{
 const s=source(),u=s.units[0];u.initial.out={x:300,y:0,z:800};u.route[0].in={x:-300,y:0,z:800};s.routes=[{id:'r',name:'r',points:[u.initial,...u.route],mode:'once',speedProfile:linearProfile()}];s.behaviors=[{id:'g',name:'g',initial:'f',nodes:[{id:'f',kind:'follow',routeId:'r'},{id:'end',kind:'stop'}],triggers:[],edges:[{from:'f',to:'end',when:'arrived'}]}];s.behaviorAssignments=[{id:'a',name:'a',behaviorId:'g',targets:['unit:u'],spacing:'none'}];const m=run(s),duration=pathDuration(m.paths.get('u'));near(m.result.actionEvents.find(e=>e.type==='arrived').time,duration,.001);assert(m.evaluate(duration/2).units[0].position.z>100);const restored=restoreRecording(recordingPayload(m));assert.deepEqual(restored.evaluate(5).units,m.evaluate(5).units);assert.deepEqual(restored.evaluate(2).units,m.evaluate(2).units);
});
test('patrol resumes after a zero-speed plateau and closes the speed loop',()=>{
 const s=source();s.units[0].route=[p(1000),p(1000,1000)];s.units[0].routeMode='loop';s.units[0].speedProfile={points:[{t:0,v:1},{t:.3,v:0},{t:.5,v:0},{t:1,v:1}]};s.behaviors=[{id:'g',name:'g',initial:'f',nodes:[{id:'f',kind:'patrol',speedFraction:1}],triggers:[],edges:[]}];s.behaviorAssignments=[{id:'a',name:'a',behaviorId:'g',targets:['unit:u'],spacing:'none',route:[s.units[0].initial,...s.units[0].route],speedProfile:s.units[0].speedProfile}];const m=run(s),duration=pathDuration(m.paths.get('u'));near(m.evaluate(duration*.35).units[0].distance,m.evaluate(duration*.45).units[0].distance,.05);assert(m.evaluate(duration*.7).units[0].distance>m.evaluate(duration*.45).units[0].distance+1);
});
test('resource exhaustion uses integrated travel under changing speed',()=>{const s=source();s.units[0].speedProfile=linearProfile();s.units[0].resources={fuel:{capacity:500,initial:500,perMetre:1,effects:['movement']}};const m=run(s);const end=m.evaluate(15).units[0];near(end.distance,500,.001);near(end.position.x,500,.001);});
