import {importScenario} from '../src/scenario-import.js?v=20261006-four-panes-16';
import assert from 'node:assert/strict';
import {clone,Simulation,validateScenario} from '../src/engine.js?v=20261006-four-panes-16';
import {availableBindings,analysisConditions,trialScenario} from '../src/parameters.js?v=20261006-four-panes-16';
import {prepareAnalysis,runDetection,summarizeRow,restoreAnalysisResult} from '../src/detection.js?v=20261006-four-panes-16';
const source={version:1,unitsSystem:'SI',title:'Loop departure',duration:3600,seed:'loop-test',trial:3,
  terrain:{columns:11,rows:11,spacing:250,origin:{x:0,y:0},seaLevel:0,elevations:Array(121).fill(-500)},
  units:[{id:'patrol',name:'Patrol',domain:'surface',faction:'friendly',manned:false,speed:10,initial:{x:500,y:500,z:0},route:[{x:1500,y:500,z:0},{x:1500,y:1000,z:0},{x:500,y:1000,z:0}],routeMode:'loop'}]};
const state=(sim,t=0)=>sim.evaluate(t).units[0],close=(a,b,tol=1e-7)=>assert(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<tol,JSON.stringify({a,b}));
const original=new Simulation(source);assert.equal(original.paths.get('patrol').length,3000);
for(const [phase,position] of [[0,{x:500,y:500,z:0}],[.25,{x:1250,y:500,z:0}],[.5,{x:1500,y:1000,z:0}],[.75,{x:750,y:1000,z:0}],[1,{x:500,y:500,z:0}]]){
  const s=clone(source);s.units[0].motion={loopStart:phase};const sim=new Simulation(s);
  close(state(sim).position,position);assert.equal(state(sim).distance,0);assert(Math.abs(state(sim).routeDistance-3000)<1e-7);close(state(sim,300).position,position);
  close(state(sim,20).position,state(original,phase%1*300+20).position);const expected=sim.evaluate(57);sim.evaluate(1200);sim.evaluate(3);assert.deepEqual(sim.evaluate(57),expected);
}
const delayed=clone(source);delayed.units[0].motion={loopStart:.25,startDelay:200};const delaySim=new Simulation(delayed),delay=state(delaySim).startDelay;
assert(delay>0);assert.equal(state(delaySim,delay/2).status,'waiting');close(state(delaySim,delay/2).position,{x:1250,y:500,z:0});close(state(delaySim,delay+20).position,{x:1450,y:500,z:0});
const idle=clone(delayed);idle.units[0].speed=0;const idleSim=new Simulation(idle);assert.equal(state(idleSim,1000).status,'idle');close(state(idleSim,1000).position,{x:1250,y:500,z:0});
for(const mode of ['once','pingpong']){const s=clone(source);s.units[0].routeMode=mode;const normal=new Simulation(s);s.units[0].motion={loopStart:.75};assert.deepEqual(normal.evaluate(20),new Simulation(s).evaluate(20));assert(!availableBindings(s).some(b=>b.parameter==='state.route.phase'));}
const empty=clone(source);empty.units[0].route=[];empty.units[0].motion={loopStart:.5};assert.equal(state(new Simulation(empty)).status,'idle');
const invalid=clone(source);invalid.units[0].motion={loopStart:1.01};assert.throws(()=>validateScenario(invalid),/loopStart/);
invalid.units[0].motion.loopStart=-.1;assert.throws(()=>validateScenario(invalid),/loopStart/);
// Phase must not teleport through later land crossings, or normalize against only the valid prefix.
const coast=clone(source);coast.terrain.elevations=Array.from({length:121},(_,i)=>i%11>=6?100:-500);coast.units[0].motion={loopStart:.75};
const coastSim=new Simulation(coast);close(state(coastSim).position,{x:750,y:1000,z:0});assert.equal(state(coastSim,1000).status,'blocked');assert(state(coastSim,1000).position.x<1500);
coast.units[0].motion.loopStart=.5;assert.equal(state(new Simulation(coast)).status,'blocked');assert.equal(state(new Simulation(coast)).errorAt,'初期位置');
const ground=clone(source);ground.units[0].domain='ground';ground.terrain.elevations=Array.from({length:121},(_,i)=>100+i%11*10+Math.floor(i/11)*20);ground.units[0].motion={loopStart:.37};const g=new Simulation(ground);const gp=state(g).position;assert(Math.abs(gp.z-g.terrain.height(gp.x,gp.y))<1e-9);
const noisy=clone(source);noisy.units[0].domain='subsurface';noisy.units[0].initial.z=-100;noisy.units[0].route.forEach(p=>p.z=-100);noisy.units[0].motion={horizontal:30,vertical:5,scale:1000};const noiseBase=new Simulation(noisy);noisy.units[0].motion.loopStart=.37;const ns=new Simulation(noisy);close(state(ns).position,state(noiseBase,noiseBase.paths.get('patrol').length*.37/10).position,1e-6);close(state(ns,ns.paths.get('patrol').length/10).position,state(ns).position,1e-6);
const grouped=clone(source);grouped.groups=[{id:'group',name:'Group',count:3,placement:'grid',width:0,height:0,template:{...clone(source.units[0]),motion:{loopStart:.5}}}];const group=new Simulation(grouped);for(const u of group.evaluate(0).units.slice(1))close(u.position,{x:1500,y:1000,z:0});
const largeGroup=clone(grouped);largeGroup.groups[0].count=1000;const large=new Simulation(largeGroup);assert.equal(large.evaluate(0).units.length,1001);assert(large.evaluate(500).units.every(u=>!u.error));
const mission=clone(source);mission.duration=60;mission.trial=0;mission.units[0].sensor={enabled:true,range:100,probabilityPerMinute:1,domains:['surface'],terrainLOS:false,mountHeight:0};mission.units.push({...clone(source.units[0]),id:'target',name:'Target',faction:'hostile',routeMode:'once',route:[],speed:0,initial:{x:1500,y:1000,z:0}});mission.mission={type:'detect',observerFaction:'friendly',targetFaction:'hostile',join:'any',deadline:1};mission.analysis={trials:3,step:1,requiredRate:.95,factors:[{target:'unit:patrol',parameter:'state.route.phase',values:[0,.5]}],uncertainties:[]};
const rows=prepareAnalysis(mission).conditions.map(condition=>{const trials=[];for(let trial=0;trial<3;trial++){const sample=trialScenario(mission,condition,trial);trials.push({...runDetection(new Simulation(sample.scenario)),trial,sampled:sample.sampled});}return {...summarizeRow(condition.count,trials),condition};});assert.equal(rows[0].rate,0);assert.equal(rows[1].rate,1,'Departure changes actual sensing location');
assert.equal(restoreAnalysisResult({type:'SimSim-analysis',version:5,model:'trigger-behavior-v3',source:importScenario(mission),rows}).completed,6);
mission.analysis.factors=[];mission.analysis.uncertainties=[{target:'unit:patrol',parameter:'state.route.phase',distribution:'uniform',min:0,max:1}];const condition=analysisConditions(mission)[0];const first=trialScenario(mission,condition,5),second=trialScenario(mission,condition,5);assert.deepEqual(first,second);assert(first.sampled[0].value>=0&&first.sampled[0].value<1);assert(availableBindings(mission).some(b=>b.parameter==='state.route.phase'));
console.log('PASS: arc-length loop phases, 0/100 equivalence, wrapping, delay/idle, replay, non-loop/empty, bounds, terrain stops/invalid departure, sloped ground, noisy 3D paths, groups, detection consumer, Monte Carlo/export replay');
