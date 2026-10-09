import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createSimulation} from '../src/recorded-engine.js?v=20261009-authoring-display-27';
import {taskPresentations} from '../src/map-presentation.js?v=20261009-authoring-display-27';
const source=()=>JSON.parse(fs.readFileSync(new URL('../data/information-mission.txt',import.meta.url)));
test('initial task and resource presentation works before calculation, including stationary assignments',()=>{
 const s=source();s.units[2].resources={fuel:{capacity:100,initial:25}};const model=createSimulation(s),snapshot=model.evaluate(0),tasks=taskPresentations(model.scenario,snapshot);
 assert.equal(tasks.length,3);assert(tasks.every(t=>t.position&&t.total===1));const task=tasks.find(t=>t.memberIds.includes('uav'));assert.equal(task.resources.fuel,25);assert.equal(task.resourceCapacity.fuel,100);assert(task.paths.length>0);assert(snapshot.knowledge.uav);
});
test('bound routes and point destinations retain separate paths; unassigned actors remain outside tasks',()=>{
 const s=source();delete s.experiment;const g=s.behaviors.find(g=>g.id==='respond'),a=s.behaviorAssignments.find(a=>a.behaviorId==='respond');g.parameters=[{id:'course',name:'経路',type:'route',default:s.routes[0].id}];g.nodes[0].routeId={$param:'course'};a.parameters={course:s.routes[0].id};
 const model=createSimulation(s),snapshot=model.evaluate(0);assert(taskPresentations(model.scenario,snapshot).find(t=>t.id===a.id).paths.some(p=>p[0].x===s.routes[0].points[0].x));
 s.destinations.push({id:'base2',name:'帰投先',kind:'point',point:{x:5000,y:5000,z:1000}});g.initial='move';g.nodes.find(n=>n.id==='move').destinationId='base2';const moved=createSimulation(s),task=taskPresentations(moved.scenario,moved.evaluate(0)).find(t=>t.id===a.id);assert(task.paths.some(p=>p.at(-1).x===5000&&p.at(-1).y===5000));assert(!task.memberIds.includes('uuv'));
});
