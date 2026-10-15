import test from 'node:test';import assert from 'node:assert/strict';
import {routeHeading} from '../src/unit-symbols.js?v=20261015-sensor-planes-37';
test('initial bearings use horizontal route tangents and each patrol position',()=>{
 const p=(x,y,z=0)=>({x,y,z});assert.equal(routeHeading([]),0);assert.equal(routeHeading([p(0,0),p(0,0,100)]),0);
 assert.equal(routeHeading([p(0,0),p(10,0)]),Math.PI/2);assert.equal(routeHeading([p(0,0),p(0,10)]),0);
 const loop=[p(0,0),p(10,0),p(10,10),p(0,10),p(0,0)];
 assert.equal(routeHeading(loop,p(5,0)),Math.PI/2);assert.equal(routeHeading(loop,p(10,5)),0);assert.equal(routeHeading(loop,p(5,10)),-Math.PI/2);assert.equal(routeHeading(loop,p(0,5)),Math.PI);
 assert.equal(routeHeading(loop,p(10,0)),0);
});
