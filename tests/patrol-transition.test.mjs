import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {clone} from '../src/engine.js?v=20261006-patrol-transition-18';
import {createSimulation,sharedSteps,recordingPayload,restoreRecording} from '../src/recorded-engine.js?v=20261006-patrol-transition-18';

const point=(x,y=0)=>({x,y,z:0});
const fixture=JSON.parse(readFileSync(new URL('fixtures/patrol-transition.txt',import.meta.url)));
function scenario({count=3,when='arrived',spacing='even',entry=0,joinMode='nearest'}={}){
  const source=clone(fixture);
  source.units=Array.from({length:count},(_,i)=>({...clone(fixture.units[0]),id:'u'+i,name:'U'+i,initial:point(entry,-100)}));
  source.destinations[0].point=point(entry);
  source.behaviors[0].nodes[1].joinMode=joinMode;
  source.behaviors[0].edges=[{from:'move',to:'patrol',when,...(when==='near'?{destinationId:'d',distance:10,distanceMode:'horizontal'}:{})}];
  source.behaviorAssignments[0].targets=source.units.map(u=>'unit:'+u.id);
  source.behaviorAssignments[0].spacing=spacing;
  return source;
}
function run(source,record=true){const model=createSimulation(source),steps=sharedSteps(model,undefined,undefined,{record});let step=steps.next();while(!step.done)step=steps.next();return {model,result:step.value};}
const near=(a,b)=>assert(Math.abs(a-b)<1e-5,`${a} != ${b}`);

// Arriving together must allow motion and separation, including entry in the
// middle of a route segment. Transitioning never relocates the units.
for(const when of ['arrived','near'])for(const entry of [0,500])for(const joinMode of ['nearest','start'])for(const spacing of ['even','fixed']){
  const source=scenario({when,entry,joinMode,spacing}),{model,result}=run(source),at=when==='arrived'?10:9;
  const entered=model.evaluate(at).units;
  assert(entered.every(u=>u.nodeId==='patrol'));
  for(const u of entered){near(u.position.x,entry);near(u.position.y,when==='arrived'?0:-10);near(u.distance,at*10);}
  assert(model.states.every(s=>s.distance>4000),`All members must patrol: ${JSON.stringify({when,entry,joinMode,spacing})}`);
  assert(model.states.every(s=>s.join===null&&s.status==='moving'));
  const phases=model.states.map(s=>s.progress/s.path.length).sort((a,b)=>a-b);
  const gaps=phases.map((phase,i)=>phases[(i+1)%phases.length]-phase+(i===phases.length-1?1:0));
  assert(gaps.every(g=>g>.25&&g<.42),`Members must separate: ${gaps}`);
  const reversed=clone(source);reversed.units.reverse();reversed.behaviorAssignments[0].targets.reverse();
  assert.deepEqual(run(reversed).model.frames,model.frames,'Coincident ordering must be reproducible');
  const summary=run(source,false);
  assert.deepEqual(summary.result,result,'Summary and replay must use the same control');
  assert.deepEqual(summary.model.states.map(s=>s.position),model.states.map(s=>s.position));
  assert.deepEqual(restoreRecording(recordingPayload(model)).evaluate(1200).units,model.evaluate(1200).units);
}

// Single units and tasks without spacing feedback keep their nominal speed.
for(const when of ['arrived','near'])for(const [count,spacing] of [[1,'even'],[1,'fixed'],[1,'none'],[3,'none']]){
  const {model}=run(scenario({when,count,spacing}));
  const a=model.evaluate(30).units,b=model.evaluate(40).units;
  for(let i=0;i<count;i++){near(b[i].distance-a[i].distance,70);assert.equal(b[i].nodeId,'patrol');}
}
// Initial same-point departures have the same circular ordering as transitions.
for(const joinMode of ['start','nearest']){
  const source=scenario({joinMode});source.behaviors[0].initial='patrol';
  const {model}=run(source);assert(model.states.every(s=>s.distance>4000));
}
console.log('PASS: coincident arrivals/proximity -> patrol, start/nearest entry, even/fixed spacing, continuous positions, deterministic order, summary/replay and initial departures');
