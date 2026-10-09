import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {surveillanceTemplate} from '../src/mission-templates.js?v=20261009-select-state-30';
import {validateScenario} from '../src/engine.js?v=20261009-select-state-30';
import {createSimulation,sharedSteps} from '../src/recorded-engine.js?v=20261009-select-state-30';
const run=s=>{const m=createSimulation(s);for(const _ of sharedSteps(m,undefined,undefined,{record:true,horizon:s.duration})){}return m;};
test('map template expands into ordinary editable graph; JSON reload runs the identical mission',()=>{
 const s=JSON.parse(fs.readFileSync(new URL('../data/information-mission.txt',import.meta.url)));delete s.experiment;
 const before=JSON.stringify(s),result=surveillanceTemplate(s,{unitId:'observer',receiverId:'relay',center:{x:0,y:0,z:1000},radius:1000,period:30});assert.equal(JSON.stringify(s),before);
 validateScenario(result.scenario);assert.equal(result.scenario.behaviorAssignments.filter(a=>a.targets.includes('unit:observer')).length,1);
 assert(result.scenario.behaviors.find(g=>g.id===result.graphId).nodes.every(n=>['patrol','report'].includes(n.kind)));
 assert.deepEqual(run(result.scenario).result,run(JSON.parse(JSON.stringify(result.scenario))).result);
});
