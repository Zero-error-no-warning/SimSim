import assert from 'node:assert/strict';import fs from 'node:fs';
import {clone,validateScenario} from '../src/engine.js?v=20261009-map-workspace-29';
import {capturePlan} from '../src/plan-settings.js?v=20261009-map-workspace-29';
import {planEditor,switchPlan,savePlan,deleteActivePlan,planHasDraft} from '../src/plan-editing.js?v=20261009-map-workspace-29';
import {preparePlans} from '../src/plans.js?v=20261009-map-workspace-29';
const source=JSON.parse(fs.readFileSync(new URL('fixtures/state-measurement.txt',import.meta.url)));source.analysis.factors=[];source.analysis.mode='plans';source.analysis.plans={metric:'mission.time',baselineId:'',items:[]};
let s=clone(source);savePlan(s,'A');assert.equal(planEditor(s).activeId,'plan-1');savePlan(s,'B',{create:true});assert.equal(planEditor(s).activeId,'plan-2');
// B receives an extra independent entity, while A remains the original operation.
const y=clone(s.units[0]);y.id='Y';y.name='追加Y';y.enabled=true;s.units.push(y);s.behaviors[0].nodes[0].seconds=1;assert(planHasDraft(s,'plan-2'));
s=switchPlan(s,'plan-1');assert.equal(s.units.length,1);assert.equal(s.behaviors[0].nodes[0].seconds,3);assert.equal(s.analysis.plans.items[1].operation.units.length,1);assert(planHasDraft(s,'plan-2'));
s.behaviors[0].nodes[0].seconds=8;s=switchPlan(s,'plan-2');assert.equal(s.units.length,2);assert.equal(s.behaviors[0].nodes[0].seconds,1);assert(planHasDraft(s,'plan-1'));
const loaded=validateScenario(JSON.parse(JSON.stringify(s)));s=switchPlan(loaded,'plan-1');assert.equal(s.behaviors[0].nodes[0].seconds,8);assert.equal(s.units.length,1);
// Analysis uses saved A/B, never unnamed or deferred editing buffers.
const plan=preparePlans(s);for(const c of plan.conditions)assert.equal(plan.sources[c.id].behaviors[0].nodes[0].seconds,3);
s=switchPlan(s,'plan-2');savePlan(s,'B');assert(!planHasDraft(s,'plan-2'));assert.equal(s.analysis.plans.items[1].operation.units.length,2);assert.equal(preparePlans(s).sources['plan:plan-2'].behaviors[0].nodes[0].seconds,1);
const prev=clone(s);s=switchPlan(s,'plan-1');assert.equal(s.behaviors[0].nodes[0].seconds,8);assert.deepEqual(switchPlan(clone(prev),'plan-1'),s);
// A named copy retains the edited original and does not alter the saved baseline.
savePlan(s,'C',{create:true});assert.equal(s.analysis.plans.items[0].operation.behaviors[0].nodes[0].seconds,3);assert.equal(switchPlan(clone(s),'plan-1').behaviors[0].nodes[0].seconds,8);
deleteActivePlan(s);assert.equal(s.analysis.plans.items.length,2);assert.equal(s.behaviors[0].nodes[0].seconds,8);assert(planEditor(s).drafts.some(d=>d.id==='plan-3'));validateScenario(s);
s=switchPlan(s,'plan-2');s=switchPlan(s,'plan-3');assert.equal(s.behaviors[0].nodes[0].seconds,8);savePlan(s,'D');assert(s.analysis.plans.items.some(p=>p.name==='D'));validateScenario(s);
const legacy=clone(source);legacy.analysis.plans.items=[{id:'old',name:'旧案',operation:capturePlan(legacy)}];legacy.analysis.plans.baselineId='old';assert.equal(planEditor(legacy).activeId,'old');assert(!legacy.analysis.plans.editor);
assert.throws(()=>switchPlan(clone(s),'absent'),/切替先/);
const broken=clone(s);broken.analysis.plans.editor.activeId='absent';assert.throws(()=>validateScenario(broken),/編集中/);
const repeated=clone(s);repeated.analysis.plans.editor.drafts.push(clone(repeated.analysis.plans.editor.drafts[0]));assert.throws(()=>validateScenario(repeated),/保持する/);
const nested=clone(s);nested.analysis.plans.editor.drafts[0].operation.analysis={};assert.throws(()=>validateScenario(nested),/編集中/);
console.log('PASS: per-plan deferred editing, Y addition isolation, switch/round-trip preservation, saved-only analysis, updating/copying/deleting without dropped edits, legacy matching and schema guards');
