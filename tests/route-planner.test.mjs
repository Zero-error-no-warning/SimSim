import assert from 'node:assert/strict';
import {Terrain,validateScenario,clone} from '../src/engine.js?v=20261006-four-panes-16';
import {generateRoute,inspectRoute,inspectSegment} from '../src/route-planner.js?v=20261006-four-panes-16';
import {scenarioRouteIssues} from '../src/route-inspection.js?v=20261006-four-panes-16';
import {importScenario} from '../src/scenario-import.js?v=20261006-four-panes-16';
import {createSimulation,sharedSteps,recordingPayload,restoreRecording} from '../src/recorded-engine.js?v=20261006-four-panes-16';
import {editWaypoint} from '../src/editor.js?v=20261006-four-panes-16';
const p=(x,y=0,z=-100)=>({x,y,z});
const terrain={columns:17,rows:17,spacing:1000,spacingY:800,origin:{x:-8000,y:-6400},seaLevel:0,elevations:Array.from({length:289},(_,i)=>Math.round(-400+900*Math.exp(-(((i%17-8)/2)**2+((Math.floor(i/17)-8)/2)**2))))};
const profile={domain:'subsurface',clearance:20},anchors=[p(-7000),p(7000)],request={...profile,height:-100,via:anchors};
assert.equal(inspectRoute(terrain,anchors,profile).ok,false);
const planned=generateRoute(terrain,request);assert(planned.points.length>2);assert(planned.points.every(p=>p.z===-100));assert.deepEqual(planned.points[0],anchors[0]);assert.deepEqual(planned.points.at(-1),anchors[1]);assert(inspectRoute(terrain,planned.points,profile).ok);
const land={...terrain,elevations:terrain.elevations.map(h=>-h)};const walking=generateRoute(land,{domain:'ground',clearance:20,via:anchors});assert(walking.points.length>2);assert(inspectRoute(land,walking.points,{domain:'ground',clearance:20}).ok);
const flying=generateRoute(terrain,{domain:'air',height:200,clearance:20,via:anchors});assert(flying.points.length>2);assert(flying.points.every(p=>p.z===200));assert(inspectRoute(terrain,flying.points,{domain:'air',clearance:20}).ok);
// Dense independent samples verify the resulting geometry, including rectangular cells.
const t=new Terrain(terrain);for(let i=1;i<planned.points.length;i++)for(let j=0;j<=1000;j++){const a=planned.points[i-1],b=planned.points[i],f=j/1000,q=p(a.x+(b.x-a.x)*f,a.y+(b.y-a.y)*f);assert(!t.project(q,'subsurface').error);assert(t.height(q.x,q.y)<=-125+1e-6);}
const via=[p(-7000,-5000),p(7000,-5000),p(7000,5000)];const loop=generateRoute(terrain,{...request,via},{mode:'loop'});assert(inspectRoute(terrain,loop.points,profile,{loop:true}).ok);for(const v of via)assert(loop.points.some(q=>Math.hypot(q.x-v.x,q.y-v.y)<1e-8));
// Endpoints alone would miss the quadratic extremum within one bilinear cell.
const saddle={columns:2,rows:2,spacing:100,origin:{x:0,y:0},seaLevel:0,elevations:[-400,800,800,-400]};
assert(inspectSegment(saddle,p(0,0),p(100,100),{domain:'subsurface'}));
assert(inspectSegment(saddle,p(0,0,30),p(100,100,30),{domain:'air'}));
const sea={columns:3,rows:3,spacing:100,origin:{x:0,y:0},seaLevel:20,elevations:Array(9).fill(-400)};
assert(generateRoute(sea,{domain:'surface',via:[p(0,0),p(200,200)]}).points.every(q=>q.z===20));
assert.throws(()=>generateRoute(sea,{domain:'subsurface',height:19,clearance:1,via:[p(0,0),p(200,200)]}),/必須地点/);
assert.throws(()=>generateRoute(terrain,{...request,via:[p(0),p(7000)]}),/必須地点/);
assert.throws(()=>generateRoute(terrain,{...request,via:[p(-9000),p(7000)]}),/範囲外/);
const barrier={columns:3,rows:3,spacing:100,origin:{x:0,y:0},seaLevel:0,elevations:[-400,400,-400,-400,400,-400,-400,400,-400]};
assert.throws(()=>generateRoute(barrier,{...request,via:[p(0,100),p(200,100)]}),/生成できません/);
assert(inspectRoute(barrier,[p(0,0),p(0,200),p(200,200)],profile,{loop:true}).issues.some(i=>i.segment===2));
const u={id:'uuv',name:'UUV',domain:'subsurface',faction:'friendly',manned:false,speed:20,initial:anchors[0],route:[],routeMode:'once'};
const raw={version:3,unitsSystem:'SI',title:'Generated route',duration:1200,seed:'route',terrain,units:[u],routes:[{id:'safe',name:'Safe',mode:'once',generate:request}],behaviors:[{id:'g',name:'Follow',initial:'go',nodes:[{id:'go',kind:'follow',routeId:'safe'},{id:'done',kind:'stop'}],edges:[{from:'go',to:'done',when:'arrived'}],triggers:[]}],behaviorAssignments:[{id:'task',name:'Task',behaviorId:'g',targets:['unit:uuv'],spacing:'none'}],recording:{step:10,interval:10}};
const canonical=importScenario(raw);assert(raw.routes[0].generate);assert(!canonical.routes[0].generate);assert.deepEqual(canonical.routes[0].points,planned.points);assert.equal(scenarioRouteIssues(canonical).length,0);
const simulation=createSimulation(canonical),steps=sharedSteps(simulation,undefined,undefined,{horizon:1200,record:true});while(!steps.next().done){};assert.equal(simulation.evaluate(1200).units[0].nodeId,'done');assert(!simulation.evaluate(1200).units[0].error);assert.deepEqual(restoreRecording(recordingPayload(simulation)).evaluate(1200).units,simulation.evaluate(1200).units);
const edited=clone(canonical);editWaypoint(edited,'uuv',0,p(0));assert(scenarioRouteIssues(edited).length);assert.deepEqual(importScenario(edited).routes[0].points,edited.routes[0].points);assert.throws(()=>validateScenario({...raw,routes:[{...raw.routes[0],points:anchors}]}),/どちらか一方/);
const individual=clone(canonical);individual.behaviors=[];individual.behaviorAssignments=[];individual.routes=[];individual.units[0].route=[p(7000)];assert(scenarioRouteIssues(individual).length);individual.units[0].enabled=false;assert.equal(scenarioRouteIssues(individual).length,0);
const inactive=clone(edited);inactive.units[0].enabled=false;delete inactive.routes[0].navigation;assert.equal(scenarioRouteIssues(inactive).length,0);
const typed=clone(canonical);typed.behaviors[0].parameters=[{id:'path',name:'Path',type:'route',default:'safe'}];typed.behaviors[0].nodes[0].routeId={$param:'path'};assert.equal(scenarioRouteIssues(typed).length,0);
console.log('PASS: exact bilinear segment inspection, island detours at fixed depth, required points, loop closure, rectangular grids, all domain constraints, import materialization, manual edits, typed assignments, disabled units and recorded execution');
