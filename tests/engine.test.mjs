import assert from 'node:assert/strict';
import {Simulation, Terrain, validateScenario, clone} from '../src/engine.js?v=20261005-state-events-4';
import fs from 'node:fs';

const terrain={columns:5,rows:5,spacing:500,origin:{x:0,y:0},seaLevel:0,elevations:Array(25).fill(-500)};
const unit={id:'test',name:'test',domain:'surface',faction:'friendly',manned:true,speed:10,initial:{x:0,y:1000,z:0},route:[{x:1000,y:1000,z:0}],routeMode:'once',components:[]};
const scenario={version:1,title:'Test',unitsSystem:'SI',duration:3600,terrain,units:[unit]};
const state=(sim,t)=>sim.evaluate(t).units[0];

const once=new Simulation(scenario);
assert.equal(state(once,50).position.x,500);
assert.equal(state(once,100).position.x,1000);
assert.equal(state(once,100).status,'arrived');
assert.equal(state(once,500).distance,1000);
assert.equal(state(once,-10).position.x,0);
assert.equal(once.evaluate(99999).time,3600);

const ping=clone(scenario);ping.units[0].routeMode='pingpong';
assert.equal(state(new Simulation(ping),150).position.x,500);
assert.equal(state(new Simulation(ping),200).position.x,0);
const loop=clone(scenario);loop.units[0].routeMode='loop';
assert.equal(state(new Simulation(loop),250).position.x,500);
const idle=clone(scenario);idle.units[0].speed=0;
assert.equal(state(new Simulation(idle),500).status,'idle');

const ground=clone(scenario);ground.terrain.elevations=Array(25).fill(100);ground.units[0].domain='ground';ground.units[0].initial.z=999;
assert.equal(state(new Simulation(ground),50).position.z,100);
const land=new Simulation(ground);const first=land.evaluate(123.5);
for(let t=0;t<150;t+=.03)land.evaluate(t);
assert.deepEqual(land.evaluate(123.5),first,'Evaluation must be independent of prior calls/frame frequency');

const slope=clone(scenario);slope.terrain.elevations=Array.from({length:25},(_,i)=>i%5*200-500);
slope.units[0].route[0].x=1500;
const blocked=new Simulation(slope);
assert.equal(state(blocked,200).status,'blocked');
assert(state(blocked,200).position.x<1250);
assert(state(blocked,200).error.includes('水深'));
const submerged=clone(scenario);submerged.units[0].domain='subsurface';submerged.units[0].initial.z=-600;
assert.equal(state(new Simulation(submerged),0).status,'blocked');
const airborne=clone(ground);airborne.units[0].domain='air';airborne.units[0].initial.z=105;
assert.equal(state(new Simulation(airborne),0).status,'blocked');
const out=clone(scenario);out.units[0].initial.x=-1;
assert.equal(state(new Simulation(out),0).status,'blocked');

assert.equal(new Terrain(slope.terrain).height(750,750),-200);
assert.equal(new Terrain(terrain).height(2500,0),null);
const invalid=clone(scenario);invalid.units[0].speed=NaN;
assert.throws(()=>validateScenario(invalid),/speed/);
const duplicate=clone(scenario);duplicate.units.push(clone(unit));
assert.throws(()=>validateScenario(duplicate),/id/);
const future=clone(scenario);future.units[0].components=[{type:'future-sensor',range:1234}];
assert.deepEqual(validateScenario(future).units[0].components,future.units[0].components);

const demo=JSON.parse(fs.readFileSync(new URL('../data/demo.jsn',import.meta.url),'utf8'));
const sample=new Simulation(demo);
assert.equal(sample.scenario.units.length,7);
assert(sample.evaluate(0).units.every(u=>!u.error));
assert(sample.evaluate(3600).units.every(u=>!u.error));
assert.deepEqual(validateScenario(JSON.parse(JSON.stringify(demo))),demo);
console.log('PASS: movement, replay, loops, terrain constraints, validation, metadata, sample round-trip');
