import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/engine.js?v=20261014-route-map-32';
import {createSimulation,sharedSteps,recordingPayload,restoreRecording} from '../src/recorded-engine.js?v=20261014-route-map-32';
const source=(domain='air')=>({version:3,unitsSystem:'SI',title:'3D route',duration:20,seed:'vertical',terrain:{columns:3,rows:3,spacing:1000,origin:{x:-1000,y:-1000,z:0},seaLevel:0,elevations:Array(9).fill(-500)},units:[{id:'unit',name:'unit',domain,faction:'friendly',manned:false,speed:100,initial:{x:0,y:0,z:domain==='air'?1000:-100},route:domain==='air'?[{x:300,y:0,z:1400},{x:300,y:0,z:1800}]:[{x:0,y:0,z:-300}],routeMode:'once'}],recording:{step:.5,interval:.5}});
const near=(actual,expected)=>assert(Math.abs(actual-expected)<1e-5,`${actual} != ${expected}`);
test('air route uses slant distance and supports a purely vertical segment',()=>{
 const model=new Simulation(source());const at=t=>model.evaluate(t).units[0];near(at(2.5).position.x,150);near(at(2.5).position.z,1200);near(at(7).position.x,300);near(at(7).position.z,1600);assert.equal(at(9).status,'arrived');near(at(9).distance,900);
});
test('task route preserves height changes through recording, rewind and restore',()=>{
 const s=source(),u=s.units[0];s.routes=[{id:'climb',name:'climb',points:[u.initial,...u.route],mode:'once'}];s.behaviors=[{id:'g',name:'g',initial:'follow',triggers:[],nodes:[{id:'follow',kind:'follow',routeId:'climb',joinMode:'start'},{id:'done',kind:'stop'}],edges:[{from:'follow',to:'done',when:'arrived'}]}];s.behaviorAssignments=[{id:'a',name:'a',behaviorId:'g',targets:['unit:unit'],spacing:'none'}];
 const model=createSimulation(s);for(const step of sharedSteps(model,undefined,undefined,{record:true,horizon:20})){}near(model.evaluate(7).units[0].position.z,1600);near(model.evaluate(2.5).units[0].position.z,1200);const restored=restoreRecording(recordingPayload(model));near(restored.evaluate(7).units[0].position.z,1600);
});
test('subsurface routes can change depth without horizontal travel',()=>{const model=new Simulation(source('subsurface'));near(model.evaluate(1).units[0].position.z,-200);assert.equal(model.evaluate(2).units[0].status,'arrived');});
