// Audit snapshot: assertions reproduce known issues at aa07424, not desired behavior.
// Convert these into regression tests of the corrected behavior when fixing each issue.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {validateScenario,clone} from '../src/engine.js?v=0.7.0-dev';
import {createSimulation,sharedSteps} from '../src/recorded-engine.js?v=0.7.0-dev';
import {trialScenario,availableBindings} from '../src/parameters.js?v=0.7.0-dev';
import {prepareAnalysis} from '../src/detection.js?v=0.7.0-dev';
import {definition} from '../src/editor.js?v=0.7.0-dev';
const sample=JSON.parse(fs.readFileSync(new URL('../data/shared-demo.jsn',import.meta.url),'utf8'));
const error=f=>{try{f();return null;}catch(e){return e.message;}};
const results=[];
// The same mutation as app.js's new-scenario handler.
const empty=clone(sample);empty.units=[];empty.groups=[];delete empty.mission;empty.behaviorAssignments=[];empty.analysis={factors:[],uncertainties:[],trials:100,step:10,requiredRate:.9};
const newError=error(()=>validateScenario(empty));assert.match(newError,/報告先/);results.push({id:'A01',newScenarioError:newError});
// The actual Delete mutation targets the old route, while the handles show the assignment route.
const deletion=clone(sample),before=JSON.stringify(deletion.behaviorAssignments[0].route);
definition(deletion,'patrol__1').unit.route.splice(1,1);
assert.equal(JSON.stringify(deletion.behaviorAssignments[0].route),before);
results.push({id:'A02',displayedRoutePoints:deletion.behaviorAssignments[0].route.length,rawRoutePoints:deletion.groups[0].template.route.length,sharedRouteUnchanged:true});
const zero=trialScenario(sample,{settings:[{target:'group:patrol',parameter:'capacity.population',value:0}]},0).scenario;
assert.equal(createSimulation(zero).constructor.name,'Simulation');assert.equal(createSimulation(sample).constructor.name,'RecordedSimulation');
results.push({id:'A03',positiveCountEngine:createSimulation(sample).constructor.name,zeroCountEngine:createSimulation(zero).constructor.name,sharedStep:sample.recording.step,legacyStep:sample.analysis.step});
const run=s=>{const m=createSimulation(s),g=sharedSteps(m,s.mission,10,{horizon:s.duration,record:true});let it=g.next();while(!it.done)it=g.next();return m;};
const short=clone(sample);short.duration=20;short.mission.deadline=20;short.groups[0].template.sensor.enabled=false;
const baseline=run(short),changed=clone(short);changed.groups[0].template.motion.startDelay=500;changed.groups[0].template.initial.x=6000;changed.groups[0].template.initial.z=1500;changed.groups[0].width=2000;changed.groups[0].height=2000;
const other=run(changed),positions=m=>m.evaluate(20).units.filter(u=>u.id.startsWith('patrol__')).map(u=>({id:u.id,position:u.position,distance:u.distance}));
assert.deepEqual(positions(baseline),positions(other));
const offered=availableBindings(short).filter(b=>b.target==='group:patrol').map(b=>b.parameter);
results.push({id:'A04',changedDelayPositionAltitudePlacementButPatrolUnchanged:true,offeredParameters:offered});
const dead=clone(sample);dead.behaviors[0].edges.push({from:'wait',to:'patrol',when:'sent'});assert.equal(error(()=>validateScenario(dead)),null);
results.push({id:'A05',waitSentTransitionAccepted:true,waitNeverEmitsSent:true});
const orphan=clone(sample);orphan.analysis.factors=[{target:'assignment:cohort',parameter:'coordination.gain',values:[.01,.02]}];
// Use a currently registered assignment parameter rather than depending on its key name.
orphan.analysis.factors[0].parameter=availableBindings(sample).find(b=>b.target==='assignment:cohort').parameter;
orphan.behaviors=[];orphan.behaviorAssignments=[];
assert.equal(error(()=>validateScenario(orphan)),null);const orphanError=error(()=>prepareAnalysis(orphan));assert(orphanError);
results.push({id:'A06',definitionValidationAcceptsOrphan:true,analysisError:orphanError});
// A relay graph must carry the observation from received -> report.
const relay=clone(sample);relay.duration=2;relay.mission.deadline=2;relay.groups[0].count=1;
relay.groups[0].template.sensor={enabled:true,range:10000,probabilityPerMinute:1,domains:['surface'],terrainLOS:false,mountHeight:0};relay.groups[0].template.communication.probability=1;relay.groups[0].template.communication.delay=0;
relay.units.push({...clone(relay.units[0]),id:'relay',name:'Relay',communication:{enabled:true,range:15000,delay:0,probability:1,terrainLOS:false}});
relay.behaviors[0].nodes.find(n=>n.kind==='report').receiverId='relay';
relay.behaviors.push({id:'relay-graph',name:'Relay graph',entry:'wait',nodes:[{id:'wait',kind:'wait',seconds:100},{id:'report',kind:'report',receiverId:'control'},{id:'stop',kind:'stop'}],edges:[{from:'wait',to:'report',when:'received'},{from:'report',to:'stop',when:'sent'}]});
relay.behaviorAssignments.push({...clone(relay.behaviorAssignments[0]),id:'relay-assignment',name:'Relay',behaviorId:'relay-graph',targets:['unit:relay']});
const relayRun=run(relay),received=relayRun.result.actionEvents.filter(e=>e.type==='received');
const first=received.find(e=>e.unitId==='relay'),last=received.find(e=>e.unitId==='control');assert.equal(first.targetId,'transit');assert.equal(last.targetId,undefined);
results.push({id:'A07',firstReceiverTarget:first.targetId,relayReceiverTarget:last.targetId??null});
console.log(JSON.stringify({scope:'Headless pure model and exact UI mutations; no WebGL/browser interaction',probes:results},null,2));
