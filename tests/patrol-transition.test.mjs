import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {clone} from '../src/engine.js?v=20261006-patrol-cruise-19';
import {createSimulation,sharedSteps,recordingPayload,restoreRecording} from '../src/recorded-engine.js?v=20261006-patrol-cruise-19';

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
// Distributed, uneven placements used to leave four of nine units stationary
// for the entire 600 seconds, despite distinct positions and a valid route.
const uneven=JSON.parse(readFileSync(new URL('fixtures/patrol-spacing.txt',import.meta.url)));
for(const spacing of ['even','fixed'])for(const gain of [.01,1])for(const fraction of [.05,.7,1])for(const step of [1,10]){
  const source=clone(uneven);
  source.behaviorAssignments[0].spacing=spacing;source.behaviorAssignments[0].gain=gain;
  source.behaviors[0].nodes[1].speedFraction=fraction;
  source.recording={step,interval:step};
  const {model}=run(source);
  for(let time=2*step;time<=600;time+=step){
    const before=model.evaluate(time-step).units,after=model.evaluate(time).units;
    for(let i=0;i<after.length;i++){
      const travel=after[i].distance-before[i].distance;
      assert(travel>=2*fraction*.5*step-1e-3,`Spacing must not stop ${after[i].id}: ${JSON.stringify({spacing,gain,fraction,step,time,travel})}`);
      assert(travel<=2*step+1e-3,'Patrol must stay within the unit speed limit');
    }
  }
}
// The adjustment must still spread the group, rather than merely forcing all
// units to move at the same slow speed. IDs cannot impose a formation order.
const converging=clone(uneven);converging.duration=20000;converging.recording={step:5,interval:5};
const settled=run(converging).model;
const phases=settled.states.map(s=>s.progress/s.path.length).sort((a,b)=>a-b);
for(let i=0;i<phases.length;i++)near(phases[(i+1)%phases.length]-phases[i]+(i===phases.length-1?1:0),1/phases.length);
const renamed=clone(uneven);renamed.units.forEach((u,i)=>{u.id='x'+(8-i);});renamed.behaviorAssignments[0].targets=renamed.units.map(u=>'unit:'+u.id);
const original=run(uneven).model,changedIds=run(renamed).model;
for(const state of original.states){const other=changedIds.states.find(s=>s.unit.name===state.unit.name);assert.deepEqual(other.position,state.position);near(other.distance,state.distance);}
// Disabling feedback keeps the requested cruise speed even with uneven gaps.
const unadjusted=clone(uneven);unadjusted.behaviorAssignments[0].gain=0;
const constant=run(unadjusted).model;
for(const s of constant.states)near(s.distance,599*1.4);
console.log('PASS: coincident arrivals/proximity -> patrol, distributed uneven spacing without stops, start/nearest entry, even/fixed spacing, continuous positions, deterministic order, summary/replay and initial departures');
