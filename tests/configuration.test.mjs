import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CONFIGURATION_MODULES,configurationTarget,configurationContractErrors} from '../src/configuration-contract.js?v=20261009-configuration-contract-28';
import {ConfigurationSession} from '../src/configuration-session.js?v=20261009-configuration-contract-28';
import {FIELD_RENDERERS} from '../src/settings-form.js?v=20261009-configuration-contract-28';
import {EDITOR_RENDERERS} from '../src/settings-ui.js?v=20261009-configuration-contract-28';
import {fieldErrors,setValue} from '../src/configuration-schema.js?v=20261009-configuration-contract-28';
import {RESOURCE_FIELDS} from '../src/resource-schema.js?v=20261009-configuration-contract-28';
import {validateScenario} from '../src/engine.js?v=20261009-configuration-contract-28';
import {stateField} from '../src/state-contract.js?v=20261009-configuration-contract-28';
import {conditionErrors,evaluateCondition,UNKNOWN} from '../src/decision.js?v=20261009-configuration-contract-28';
const sample=()=>JSON.parse(fs.readFileSync(new URL('../data/information-mission.txt',import.meta.url)));
const module=id=>CONFIGURATION_MODULES.find(m=>m.id===id);
test('public contract rejects missing editor or input type; resource ranges and destinations use the same fields',()=>{
 assert.deepEqual(configurationContractErrors(CONFIGURATION_MODULES,FIELD_RENDERERS,EDITOR_RENDERERS),[]);
 assert(configurationContractErrors([{...module('unit.resources'),editor:'unimplemented'}],FIELD_RENDERERS,EDITOR_RENDERERS).length);
 assert(configurationContractErrors([{...module('entity.movement'),fields:[{...module('entity.movement').fields[0],type:'unimplemented'}]}],FIELD_RENDERERS,EDITOR_RENDERERS).length);
 assert(fieldErrors(RESOURCE_FIELDS,{capacity:10,initial:11},{scenario:sample()}).length);
 assert(fieldErrors(RESOURCE_FIELDS,{capacity:10,replenish:{destinationId:'missing',rate:1}},{scenario:sample()}).length);
 const exotic={};setValue(exotic,'__proto__.capacity',10);assert.equal(Object.getPrototypeOf(exotic),Object.prototype);assert.equal(exotic.__proto__.capacity,10);assert.equal({}.capacity,undefined);
});
test('session isolates draft, rejects stale revision, saves one source definition without rewriting runtime state',()=>{
 const source=sample(),before=JSON.stringify(source),session=new ConfigurationSession(source,'uav',7);
 const movement=module('entity.movement');session.set(movement,session.record(movement),movement.fields[0],33);
 assert.equal(JSON.stringify(source),before);assert(session.dirty);assert.throws(()=>session.prepare(8),/上書きせず/);
 const next=session.prepare(7);validateScenario(next);assert.equal(next.units.find(u=>u.id==='uav').speed,33);assert(!Object.hasOwn(next.units.find(u=>u.id==='uav'),'remaining'));
 const untouched=new ConfigurationSession(source,'uav',7);assert(!untouched.dirty);assert.deepEqual(untouched.prepare(7),source);
});
test('generated member edits group template and placement; prefix collision resolves the correct group',()=>{
 const source=JSON.parse(fs.readFileSync(new URL('../data/island-patrol-demo.txt',import.meta.url))),group=source.groups[0],id=group.id+'__1',session=new ConfigurationSession(source,id,1);
 const movement=module('entity.movement');session.set(movement,session.record(movement),movement.fields[0],12);
 assert.equal(session.prepare(1).groups[0].template.speed,12);assert.notEqual(source.groups[0].template.speed,12);
 const collision={units:[],groups:[{id:'a',name:'a',count:2,template:{}},{id:'a__b',name:'b',count:3,template:{}}]};assert.equal(configurationTarget(collision,'a__b__1').group.id,'a__b');
});
test('shared state descriptors allow received information and own resources, reject hidden physical truth, preserve UNKNOWN',()=>{
 assert.equal(stateField('self.resources.fuel.fraction').scale,100);assert.equal(stateField('knowledge.friendlyReports.relay.age').visibility,'received-report');assert.equal(stateField('world.relay.resources.fuel.remaining'),undefined);
 assert(conditionErrors({field:'world.relay.operational',op:'eq',value:true}).length);
 assert.equal(evaluateCondition({field:'knowledge.friendlyReports.relay.age',op:'lte',value:30},{knowledge:{friendlyReports:{}}}),UNKNOWN);
});
