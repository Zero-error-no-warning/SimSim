import { Simulation } from './engine.js?v=20261005-navigation-5';
import { importScenario } from './scenario-import.js?v=20261005-navigation-5';
import { random01, streamKey } from './random.js?v=20261005-navigation-5';
import { terrainVisible, contactProbability, mounted, makeIndex, neighbors } from './contact.js?v=20261005-navigation-5';
import {routeFor,destinationFor,conditionKey,measuredDistance} from './navigation.js?v=20261005-navigation-5';
import { graphTriggers } from './shared-settings.js?v=20261005-navigation-5';
export { recordingPayload, restoreRecording, MAX_FILE_BYTES } from './recording.js?v=20261005-navigation-5';
export const RECORD_MODEL = 'trigger-behavior-v3';
export const STATUS = ['idle', 'moving', 'arrived', 'blocked', 'waiting', 'standby', 'preparing'];
export const MAX_RECORD_BYTES = 128 * 1048576;
const dist = (a, b) => Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z);
const mod = (a, b) => (a % b + b) % b;
const mix = (a, b, f) => ({
  x:a.x+(b.x-a.x)*f, y:a.y+(b.y-a.y)*f, z:a.z+(b.z-a.z)*f
});
function pathPoint(path, along) {
  const d = Math.min(path.length, Math.max(0, along)), n = path.nodes;
  let l = 0, r = n.length-1;
  while (l < r) {
    const m = Math.ceil((l+r)/2);
    if (n[m].d <= d) l=m;
    else r=m-1;
  }
  const a=n[l], b=n[Math.min(l+1,n.length-1)];
  return {
    point:mix(a,b,b.d>a.d?(d-a.d)/(b.d-a.d):0), segment:l, heading:Math.atan2(b.x-a.x,b.y-a.y)
  };
}
// One execution model for ordinary routes, tasks, zero-population trials and recordings.
export class RecordedSimulation extends Simulation {
  constructor(value) {
    super(importScenario(value), {
      deferPaths:true
    });
    this.frames=null;
    this.result=null;
    this.computeCount=0;
    this.nodeNames=[];
    this.assignments=this.source.behaviorAssignments;
    this.initialEvents=[];
    const graphs=new Map(this.source.behaviors.map(g=>[g.id,g]));
    this.states=[];
    this.byId=new Map();
    for (const u of [...this.scenario.units].sort((a,b)=>a.id.localeCompare(b.id))) {
      const assignment=this.assignments.find(a=>a.targets.includes('unit:'+u.id)||u.groupId&&a.targets.includes('group:'+u.groupId));
      const graph=assignment?graphs.get(assignment.behaviorId):null;
      const initialNode=graph?.nodes.find(n=>n.id===graph.initial),chosen=routeFor(this.source,assignment,initialNode,u);
      const shared=assignment?.route?.length>=2||initialNode?.routeId;
      const geometry=shared?{
        ...u,initial:chosen.points[0],route:chosen.points.slice(1),routeMode:initialNode?.kind==='patrol'?'loop':chosen.mode,motion:{...u.motion,loopStart:0}
      }:u;
      const path=this.compile(geometry);
      this.paths.set(u.id,path);
      const s={
        unit:u,assignment,graph,path,basePath:path,pathCache:new Map(),routeContexts:new Map(),nearInside:new Map(),node:null,nodeTime:0,position:{
          ...path.nodes[0]
        },heading:0,status:'idle',distance:0,progress:0,segment:-1,error:path.errorAt==='初期位置'?path.error:null,fired:new Set(),triggerFired:new Set(),triggerTimes:new Map(),activated:false,observation:null,trace:[],routeStarted:null,routePaused:0
      };
      this.states.push(s);
      this.byId.set(u.id,s);
      for (const n of graph?.nodes??[]) if (!this.nodeNames.includes(graph.id+':'+n.id)) this.nodeNames.push(graph.id+':'+n.id);
    }
    for (const a of this.assignments) {
      const members=this.states.filter(s=>s.assignment===a);
      members.forEach((s,i)=>{
        s.initialPhase=mod((a.phase??0)+(a.spacing==='none'?(s.unit.motion?.loopStart??0):i/members.length),1);
        s.status=s.error?'blocked':'standby';
        if(s.graph.initial){
          s.activated=true;
          this.enter(s,s.graph.initial,0,true);
          this.initialEvents.push({type:'initialized',time:0,unitId:s.unit.id,nodeId:s.graph.initial});
        }
      });
    }
    for (const s of this.states) if (!s.graph) Object.assign(s,super.evaluateUnit(s.unit,0));
  }
  enter(s, id, t, initial=false, resume=false) {
    const previous=s.node;
    if(previous?.kind==='follow')s.routeContexts.set(previous.routeId??'default',{path:s.path,started:s.routeStarted,travel:s.routeTravel??0,paused:t,join:s.join});
    s.node=s.graph.nodes.find(n=>n.id===id);
    s.nodeTime=t;
    s.sent=false;
    s.elapsed=false;
    s.destinationArrived=false;
    s.join=null;
    s.nearInside=new Map([...s.nearInside].filter(([key])=>key.startsWith('trigger:')));
    if(['follow','patrol'].includes(s.node.kind)){
      const selected=routeFor(this.source,s.assignment,s.node,s.unit),key=selected.id+'|'+s.node.kind;
      if(initial)s.pathCache.set(key,s.path);
      if(!s.pathCache.has(key)){
        const legacy=!s.node.routeId;
        s.pathCache.set(key,this.compile({...s.unit,initial:selected.points[0],route:selected.points.slice(1),routeMode:selected.mode,motion:{...s.unit.motion,...(legacy?{}:{loopStart:0})}}));
      }
      s.path=s.pathCache.get(key);this.paths.set(s.unit.id,s.path);
    }
    if (s.error) {
      s.status='blocked';
      return;
    }
    s.status='idle';
    if (s.node.kind==='patrol') {
      if (initial) {
        s.progress=s.initialPhase*s.path.length;
        const p=pathPoint(s.path,s.progress);
        s.position=p.point;
        s.heading=p.heading;
        s.segment=p.segment;
      }
      else {
        let best=Infinity;
        for(const n of s.path.nodes){
          const d=dist(n,s.position);
          if(d<best){
            best=d;
            s.progress=n.d;
          }
        }
        s.join=pathPoint(s.path,s.progress).point;
      }
      s.readyAt=t+(initial?s.path.delay:0);
      s.status=t<s.readyAt?'waiting':'moving';
    } else if (s.node.kind==='follow') {
      const saved=resume?s.routeContexts.get(s.node.routeId??'default'):null;
      if(saved&&saved.path===s.path){s.routeStarted=saved.started===null?null:saved.started+t-saved.paused;s.routeTravel=saved.travel;s.join=saved.join;}
      else{
        s.routeTravel=0;s.routeArrived=false;
        s.join=!initial&&dist(s.position,s.path.nodes[0])>1e-7?s.path.nodes[0]:null;
        s.routeStarted=s.join?null:t;
      }
      s.status=s.join?'moving':t<(s.routeStarted??t)+(initial?s.path.delay:0)?'waiting':s.path.length&&s.path.actualSpeed?'moving':'idle';
    } else if (s.node.kind==='signal') s.status='standby';
    else if (s.node.kind==='wait') s.status=s.node.parameter==='preparation'?'preparing':'waiting';
    else if (s.node.kind==='move') s.status='moving';
  }
  activate(s, event, t, events, payload) {
    if(!s?.graph || s.status==='blocked')return false;
    const trigger=graphTriggers(s.graph).find(x=>x.event===event && (event!=='near'||conditionKey(x)===payload?.conditionKey) && (event!=='time'||Math.abs(this.nextTriggerTime(s,x)-t)<1e-8)
      && (!s.triggerFired.has(x.id) || x.once===false));
    if(!trigger)return false;
    const key=s.unit.id+'|trigger|'+trigger.id;
    if(payload?.trace?.includes(key))return false;
    if(payload){s.observation=payload;s.trace=[...(payload.trace??[]),key];}
    else {s.observation=null;s.trace=[];}
    if(s.trace.length>64)throw Error('情報の中継が64段を超えました。');
    s.triggerFired.add(trigger.id);
    s.triggerTimes.set(trigger.id,t);
    const from=s.node?.id;
    s.activated=true;
    this.enter(s,trigger.to,t);
    events.push({type:'triggered',time:t,unitId:s.unit.id,triggerId:trigger.id,event,nodeId:trigger.to});
    events.push({type:'nodeChanged',time:t,unitId:s.unit.id,from:from??null,nodeId:trigger.to});
    if(s.node.parameter==='preparation')events.push({type:'preparing',time:t,unitId:s.unit.id,nodeId:s.node.id});
    if(s.node.kind==='follow')events.push({type:'departed',time:t,unitId:s.unit.id,nodeId:s.node.id});
    return true;
  }
  nextTriggerTime(s,trigger){
    if(!s.triggerFired.has(trigger.id))return trigger.seconds;
    return trigger.once===false?(s.triggerTimes.get(trigger.id)??0)+trigger.seconds:Infinity;
  }
  transition(s, when, t, events, payload) {
    if (!s?.graph || s.status==='blocked') return false;
    if(this.activate(s,when,t,events,payload))return true;
    if(!s.node)return false;
    const edge=s.graph.edges.find(e=>e.from===s.node.id&&e.when===when&&(when!=='near'||conditionKey(e)===payload?.conditionKey));
    if (!edge) return false;
    const key=s.unit.id+'|'+edge.from+'|'+conditionKey(edge);
    if (edge.once&&s.fired.has(key) || payload?.trace?.includes(key)) return false;
    if (edge.once) s.fired.add(key);
    if (payload) {
      s.observation=payload;
      s.trace=[...(payload.trace??[]),key];
    }
    if (s.trace.length>64) throw Error('情報の中継が64段を超えました。');
    if (s.node.kind==='follow') s.pauseTime=t;
    const from=s.node.id;
    this.enter(s,edge.to,t,false,edge.resume);
    events.push({
      type:'nodeChanged',time:t,unitId:s.unit.id,from,nodeId:edge.to
    });
    if(s.node.parameter==='preparation')events.push({
      type:'preparing',time:t,unitId:s.unit.id,nodeId:s.node.id
    });
    if(s.node.kind==='follow'&&!edge.resume)events.push({
      type:'departed',time:t,unitId:s.unit.id,nodeId:s.node.id
    });
    return true;
  }
  destination(s,reference=s.node,positions){
    const d=destinationFor(this.source,s.assignment,reference);
    if(!d)return null;
    return d.kind==='point'?d.point:positions?.get(d.unitId)??this.byId.get(d.unitId)?.position??null;
  }
  predict(s,seconds,speeds,positions){
    if(s.status==='blocked'||!s.node&&s.graph)return s.position;
    if(!s.graph||s.node.kind==='follow'&&!s.join){
      const offset=s.graph?s.routeStarted??0:0;
      return Simulation.prototype.evaluateUnit.call(this,s.unit,Math.max(0,seconds-offset)).position;
    }
    const dt=Math.max(0,seconds-(this.currentTime??0));
    if(s.node.kind==='patrol'&&!s.join)return pathPoint(s.path,mod(s.progress+(speeds.get(s.unit.id)??s.path.actualSpeed)*Math.max(0,seconds-Math.max(this.currentTime??0,s.readyAt)),s.path.length||1)).point;
    const target=s.join??(s.node.kind==='move'?this.destination(s,s.node,positions):null);
    if(!target)return s.position;
    const length=dist(s.position,target),travel=Math.min(length,s.path.actualSpeed*dt);
    return mix(s.position,target,length?travel/length:1);
  }
  stateSnapshot(s) {
    return {
      id:s.unit.id,position:{
        x:s.position.x,y:s.position.y,z:s.position.z
      },heading:s.heading,status:s.status,distance:s.distance,routeDistance:s.path.length,error:s.error,errorAt:s.path.errorAt,actualSpeed:s.path.actualSpeed,startDelay:s.path.delay,nodeId:s.node?.id,behaviorId:s.graph?.id,eta:null
    };
  }
  evaluate(time) {
    const t=Math.max(0,Math.min(this.source.duration,Number(time)||0));
    if (!this.frames) return {
      time:0,units:this.states.map(s=>this.stateSnapshot(s)),actionsPending:true,recordingPending:true
    };
    let l=0,r=this.frames.length-1;
    while(l<r){
      const m=Math.ceil((l+r)/2);
      if(this.frames[m].time<=t)l=m;
      else r=m-1;
    }
    const a=this.frames[l],b=this.frames[Math.min(l+1,this.frames.length-1)],f=b.time>a.time?(t-a.time)/(b.time-a.time):0;
    const units=this.states.map((s,i)=>{
      const k=i*5,x=a.values,y=b.values,node=this.nodeNames[a.nodes[i]-1],d=mod(y[k+3]-x[k+3]+Math.PI,Math.PI*2)-Math.PI;
      return {
        ...this.stateSnapshot(s),position:{
          x:x[k]+(y[k]-x[k])*f,y:x[k+1]+(y[k+1]-x[k+1])*f,z:x[k+2]+(y[k+2]-x[k+2])*f
        },heading:x[k+3]+d*f,distance:x[k+4]+(y[k+4]-x[k+4])*f,status:STATUS[a.status[i]],nodeId:node?.split(':')[1],error:a.status[i]===3?'記録された地形制約停止':null,actualSpeed:b.time>a.time?Math.max(0,(y[k+4]-x[k+4])/(b.time-a.time)):0
      };
    });
    const result=this.result,events=result.events.filter(e=>e.time<=t),mission=this.source.mission;
    return {
      time:t,units,actionEvents:result.actionEvents.filter(e=>e.time<=t),mission:mission?{
        events,detectedCount:new Set(events.map(e=>e.targetId)).size,targetCount:result.targetCount,reachedCount:new Set(result.actionEvents.filter(e=>e.type==='arrived'&&e.time<=t&&mission.responderIds?.includes(e.unitId)).map(e=>e.unitId)).size,responderCount:result.responderCount,status:result.successTime!==null&&result.successTime<=t?'success':t>=mission.deadline?'failure':'pending',deadline:mission.deadline
      }
      :undefined,recording:{
        frames:this.frames.length,bytes:this.recordBytes,computeCount:this.computeCount,step:this.source.recording.step,interval:this.source.recording.interval
      },actionsPending:false
    };
  }
  // Playback trails are a function of recorded time, not of frames previously displayed.
  trailPoints(id,time,maxPoints=1000) {
    if (!this.frames) return [];
    const i=this.states.findIndex(s=>s.unit.id===id);
    if(i<0)return [];
    const frames=this.frames.filter(f=>f.time<=time),stride=Math.max(1,Math.ceil(frames.length/maxPoints));
    const points=frames.filter((_,n)=>n%stride===0||n===frames.length-1).map(f=>({
      x:f.values[i*5],y:f.values[i*5+1],z:f.values[i*5+2]
    }));
    const last=this.frames.findLast(f=>f.time<=time),next=this.frames.find(f=>f.time>time)??last;
    if(last){
      const f=next.time>last.time?(time-last.time)/(next.time-last.time):0,k=i*5;
      points.push({
        x:last.values[k]+(next.values[k]-last.values[k])*f,y:last.values[k+1]+(next.values[k+1]-last.values[k+1])*f,z:last.values[k+2]+(next.values[k+2]-last.values[k+2])*f
      });
    }
    return points;
  }
  record(t,frames) {
    if(frames.at(-1)?.time===t)return;
    const n=this.states.length,values=new Float32Array(n*5),nodes=new Uint16Array(n),status=new Uint8Array(n);
    this.states.forEach((s,i)=>{
      values.set([s.position.x,s.position.y,s.position.z,s.heading,s.distance],i*5);nodes[i]=s.node?this.nodeNames.indexOf(s.graph.id+':'+s.node.id)+1:0;status[i]=STATUS.indexOf(s.status);
    });
    frames.push({
      time:t,values,nodes,status
    });
    if(frames.length>100001||frames.length*(n*23+8)>MAX_RECORD_BYTES)throw Error('再生記録が128MiBを超えました。期間・個数・記録間隔を調整してください。');
  }
  get recordBytes(){
    return this.frames?.reduce((n,f)=>n+8+f.values.byteLength+f.nodes.byteLength+f.status.byteLength,0)??0;
  }
}
function moveTo(model,s,destination,speed,dt) {
  const checked=model.terrain.project(destination,s.unit.domain);
  if(checked.error){
    s.status='blocked';
    s.error=checked.error;
    return false;
  }
  const length=dist(s.position,checked.point),travel=Math.min(length,speed*dt),p=mix(s.position,checked.point,length?travel/length:1),steps=Math.max(1,Math.ceil(travel/Math.min(125,model.terrain.data.spacing/4)));
  for(let i=1;i<=steps;i++){
    const q=model.terrain.project(mix(s.position,p,i/steps),s.unit.domain);
    if(q.error){
      s.status='blocked';
      s.error=q.error;
      return false;
    }
  }
  s.heading=Math.atan2(p.x-s.position.x,p.y-s.position.y);
  s.position=model.terrain.project(p,s.unit.domain).point;
  s.distance+=travel;
  s.status=length<=travel+1e-7?'arrived':'moving';
  return s.status==='arrived';
}
export function* sharedSteps(input, mission=input.source?.mission??input.scenario.mission, _step, options={
}) {
  const model=input instanceof RecordedSimulation?input:new RecordedSimulation(input.source);
  const horizon=options.horizon??mission?.deadline??model.source.duration,record=options.record??false;
  const dt=model.source.recording.step,interval=model.source.recording.interval;
  if(!Number.isFinite(horizon)||horizon<0||horizon>model.source.duration)throw Error('計算終了時刻が不正です。');
  if(model.computeCount)throw Error('計算済みです。新しい試行を作成してください。');
  model.computeCount++;
  const states=model.states,events=[...model.initialEvents],detected=new Map(),pairs=new Set(),messages=[],frames=record?[]:null;
  const targets=states.filter(s=>s.unit.faction!=='neutral'),goalTargets=mission?.targetIds?mission.targetIds.map(id=>model.byId.get(id)):states.filter(s=>mission?s.unit.faction===mission.targetFaction:s.unit.faction!=='neutral');
  if(mission&&(!goalTargets.length||goalTargets.some(s=>!s||s.unit.faction!==mission.targetFaction)))throw Error('成功条件に合う対象がありません。');
  const responders=mission?.type==='arrive'?mission.responderIds:[];
  const result={
    success:false,successTime:null,targetCount:goalTargets.length,detectedCount:0,responderCount:responders.length,reachedCount:0,events:[],actionEvents:events,invalidUnits:states.filter(s=>s.error).length,constrainedPaths:0
  };
  let candidateChecks=0,lastRecord=0,lastContact=0;
  const range=Math.max(1,...states.filter(s=>s.unit.sensor?.enabled).map(s=>s.unit.sensor.range));
  const emit=(s,when,t,extra={
  })=>{
    events.push({
      type:when,time:t,unitId:s.unit.id,nodeId:s.node?.id,...extra
    });
    return model.transition(s,when,t,events,extra);
  };
  function controls() {
    const speeds=new Map();
    for(const a of model.assignments){
      const groups=new Map();
      for(const s of states.filter(s=>s.assignment===a&&s.node?.kind==='patrol'&&s.status!=='blocked'&&!s.join)){
        const key=s.node.routeId??'default';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(s);
      }
      for(const members of groups.values()){
        members.sort((x,y)=>x.progress/x.path.length-y.progress/y.path.length);
        for(let i=0;i<members.length;i++){
          const s=members[i],next=members[(i+1)%members.length],gap=members.length===1?s.path.length:mod(next.progress/next.path.length-s.progress/s.path.length,1)*s.path.length,desired=a.spacing==='fixed'?(a.spacingDistance??500):s.path.length/members.length,max=s.path.actualSpeed,nominal=max*(s.node.speedFraction??.7);
          speeds.set(s.unit.id,a.spacing==='none'||members.length===1?nominal:Math.max(0,Math.min(max,nominal+(a.gain??.01)*(gap-desired))));
        }
      }
    }
    return speeds;
  }
  function report(s,t) {
    const c=s.unit.communication,receiver=model.byId.get(s.node.receiverId??s.assignment.receiverId),distance=receiver?dist(s.position,receiver.position):Infinity;
    const target=s.observation,key=streamKey(model.source,s.unit.id,'unified-report-v2')+'|'+JSON.stringify([s.node.id,target?.targetId,target?.originObserverId??target?.observerId??s.unit.id]);
    let reason=null;
    if(!c?.enabled)reason='通信無効';
    else if(!receiver||receiver.error)reason='受信先不在・配置不正';
    else if(distance>c.range)reason='通信範囲外';
    else if(c.terrainLOS&&!terrainVisible(model.terrain,s.position,receiver.position))reason='地形遮蔽';
    else if(random01(key)>=c.probability)reason='通信試行失敗';
    s.sent=true;
    const extra={
      receiverId:receiver?.unit.id,distance:Number.isFinite(distance)?distance:null,reason,targetId:target?.targetId,targetPosition:target?.targetPosition,observationTime:target?.observationTime??target?.sampleTime??target?.time,originObserverId:target?.originObserverId??target?.observerId??s.unit.id,trace:s.trace,sourcePosition:{
        ...s.position
      },receiverPosition:receiver?{
        ...receiver.position
      }
      :undefined
    };
    if(!reason)messages.push({
      ...extra,type:'received',time:t+c.delay,unitId:receiver.unit.id,senderId:s.unit.id
    });
    return emit(s,reason?'sendFailed':'sent',t,extra);
  }
  function nearConditions(s){
    return [...(s.graph?.triggers??[]).filter(c=>c.event==='near').map(c=>({c,key:'trigger:'+c.id})),...(s.graph?.edges??[]).filter(c=>c.from===s.node?.id&&c.when==='near').map(c=>({c,key:'edge:'+c.from+'|'+conditionKey(c)}))];
  }
  function checkNear(s,t){
    let changed=false;
    for(const {c,key} of nearConditions(s)){
      const target=model.destination(s,c);
      if(!target)continue;
      const distance=measuredDistance(s.position,target,c.distanceMode),inside=distance<=c.distance+1e-6,was=s.nearInside.get(key)??false;
      s.nearInside.set(key,inside);
      if(inside&&!was&&!(key.startsWith('trigger:')&&c.once!==false&&s.triggerFired.has(c.id))){
        const payload={destinationId:c.destinationId,distance,distanceMode:c.distanceMode??'absolute',conditionKey:conditionKey(c)};
        if(emit(s,'near',t,payload)){changed=true;break;}
      }
    }
    return changed;
  }
  function proximityBoundary(start,end,speeds){
    const positions=new Map(states.map(s=>[s.unit.id,{...s.position}]));
    // Split at bends only when distance conditions are present, then solve relative linear motion.
    const relevant=new Set();
    for(const s of states)for(const {c} of nearConditions(s)){
      relevant.add(s);
      const d=destinationFor(model.source,s.assignment,c);if(d?.kind==='unit'&&model.byId.has(d.unitId))relevant.add(model.byId.get(d.unitId));
    }
    if(!relevant.size)return end;
    for(const s of relevant){
      if(s.status==='blocked')continue;
      if(s.join&&s.path.actualSpeed)end=Math.min(end,start+dist(s.position,s.join)/s.path.actualSpeed);
      if(!s.join&&(!s.graph||['follow','patrol'].includes(s.node?.kind))&&s.path.actualSpeed&&s.path.length){
        const along=s.node?.kind==='patrol'?s.progress:mod((s.routeTravel??s.distance),s.path.length);
        const next=s.path.nodes.find(p=>p.d>along+1e-7);
        if(next)end=Math.min(end,start+(next.d-along)/(speeds.get(s.unit.id)??s.path.actualSpeed));
      }
    }
    const future=new Map(states.map(s=>[s.unit.id,model.predict(s,end,speeds,positions)]));
    let boundary=end;
    for(const s of states)for(const {c,key} of nearConditions(s)){
      if(s.nearInside.get(key)||key.startsWith('trigger:')&&c.once!==false&&s.triggerFired.has(c.id))continue;
      const a=model.destination(s,c,positions),b=model.destination(s,c,future);if(!a||!b)continue;
      const p=s.position,q=future.get(s.unit.id),r=[p.x-a.x,p.y-a.y,c.distanceMode==='horizontal'?0:p.z-a.z],v=[q.x-b.x-r[0],q.y-b.y-r[1],c.distanceMode==='horizontal'?0:q.z-b.z-r[2]];
      const aa=v.reduce((sum,x)=>sum+x*x,0),bb=2*r.reduce((sum,x,i)=>sum+x*v[i],0),cc=r.reduce((sum,x)=>sum+x*x,0)-c.distance*c.distance,discriminant=bb*bb-4*aa*cc;
      if(aa>1e-12&&cc>1e-6&&discriminant>=0){const fraction=(-bb-Math.sqrt(discriminant))/(2*aa);if(fraction>1e-9&&fraction<=1)boundary=Math.min(boundary,start+(end-start)*fraction);}
    }
    return boundary;
  }
  function immediate(t) {
    let changed=false;
    for(const s of states)for(let i=0;i<(s.graph?.triggers.length??0);i++){
      if(!model.activate(s,'time',t,events))break;
      changed=true;
    }
    const settle=s=>{
      for(let depth=0;depth<64;depth++){
        if(s.status==='blocked')return;
        let next=checkNear(s,t);
        if(next){changed=true;continue;}
        if(s.node?.kind==='report'&&!s.sent)next=report(s,t);
        else if(s.node?.kind==='wait'&&!s.elapsed&&t-s.nodeTime>=(s.node.parameter==='preparation'?s.assignment.preparation??s.node.seconds:s.node.seconds)){
          s.elapsed=true;
          next=emit(s,'elapsed',t);
        }
        changed=changed||next;
        if(!next)return;
      }
      throw Error('即時ノード遷移が64段を超えました。循環を見直してください。');
    };
    for(const s of states)settle(s);
    let delivered=0;
    while(true){
      messages.sort((a,b)=>a.time-b.time||a.unitId.localeCompare(b.unitId));
      if(!messages[0]||messages[0].time>t)return changed;
      if(++delivered>100000||events.length>100000)throw Error('情報イベントが10万件を超えました。');
      const m=messages.shift(),s=model.byId.get(m.unitId);
      events.push(m);
      s.observation=m;
      changed=model.transition(s,'received',t,events,m)||changed;
      settle(s);
    }
  }
  immediate(0);
  if(record)model.record(0,frames);
  for(let start=0;start<horizon;){
    const nextContact=Math.min(horizon,(Math.floor((start+1e-8)/dt)+1)*dt,mission?.deadline>start?mission.deadline:Infinity);
    let nextEvent=Infinity;
    for(const m of messages)if(m.time>start+1e-8)nextEvent=Math.min(nextEvent,m.time);
    for(const s of states){
      if(s.status==='blocked')continue;
      if(s.node?.kind==='wait'&&!s.elapsed){
        const seconds=s.node.parameter==='preparation'?s.assignment.preparation??s.node.seconds:s.node.seconds;
        if(s.nodeTime+seconds>start+1e-8)nextEvent=Math.min(nextEvent,s.nodeTime+seconds);
      }
      for(const trigger of s.graph?.triggers??[])if(trigger.event==='time'){
        const at=model.nextTriggerTime(s,trigger);
        if(at>start+1e-8)nextEvent=Math.min(nextEvent,at);
      }
      if((!s.graph||s.node?.kind==='follow')&&!s.join&&!s.path.periodic&&s.path.length&&s.path.actualSpeed&&!s.routeArrived){
        const at=(s.graph?s.routeStarted??0:0)+s.path.delay+s.path.length/s.path.actualSpeed;
        if(at>start+1e-8)nextEvent=Math.min(nextEvent,at);
      }
      if(s.join&&s.path.actualSpeed){const at=start+dist(s.position,s.join)/s.path.actualSpeed;if(at>start+1e-8)nextEvent=Math.min(nextEvent,at);}
      if(s.node?.kind==='move'&&s.status!=='arrived'&&s.path.actualSpeed&&destinationFor(model.source,s.assignment,s.node)?.kind==='point'){
        const at=start+dist(s.position,model.destination(s))/s.path.actualSpeed;
        if(at>start+1e-8)nextEvent=Math.min(nextEvent,at);
      }
    }
    model.currentTime=start;
    const speeds=controls(),end=proximityBoundary(start,Math.min(nextContact,nextEvent),speeds),step=end-start;
    const positions=new Map(states.map(s=>[s.unit.id,{...s.position}])),future=new Map(states.map(s=>[s.unit.id,model.predict(s,end,speeds,positions)]));
    let changed=false;
    for(const s of states){
      if(s.status==='blocked')continue;
      if(s.graph&&!s.node)continue;
      if(s.node?.kind==='follow'&&s.join){
        if(moveTo(model,s,s.join,s.path.actualSpeed,step)){s.join=null;s.routeStarted=end;s.routeTravel=0;}
        changed=true;continue;
      }
      if(!s.graph||s.node.kind==='follow'){
        const prev=s.status,oldSegment=s.segment,offset=s.graph?s.routeStarted??0:0;
        const state=Simulation.prototype.evaluateUnit.call(model,s.unit,Math.max(0,end-offset));
        if(s.graph){const cumulative=s.distance+Math.max(0,state.distance-(s.routeTravel??0));s.routeTravel=state.distance;Object.assign(s,state);s.distance=cumulative;}else Object.assign(s,state);
        s.segment=pathPoint(s.path,s.path.periodic?state.distance%s.path.length:state.distance).segment;
        if(prev!==s.status||oldSegment!==s.segment)changed=true;
        if(s.status==='arrived'&&!s.routeArrived){
          s.routeArrived=true;
          changed=emit(s,'arrived',end)||changed;
        }
      } else if(s.node.kind==='patrol'){
        if(end<=s.readyAt){
          s.status='waiting';
          continue;
        }
        const activeStep=end-Math.max(start,s.readyAt);
        if(s.join){
          if(moveTo(model,s,s.join,s.path.actualSpeed,activeStep))s.join=null;
          changed=true;
          continue;
        }
        if(!s.path.length){
          s.status='blocked';
          s.error='周回経路の長さが0です。';
          changed=true;
          continue;
        }
        const advance=(speeds.get(s.unit.id)??s.path.actualSpeed)*activeStep,next=s.progress+advance;
        if(s.path.error&&next>=s.path.length){
          s.position={
            ...s.path.nodes.at(-1)
          };
          s.status='blocked';
          s.error=s.path.error;
          changed=true;
          continue;
        }
        s.progress=mod(next,s.path.length);
        const p=pathPoint(s.path,s.progress);
        s.position=p.point;
        s.heading=p.heading;
        s.distance+=advance;
        s.status='moving';
        if(p.segment!==s.segment){
          changed=true;
          s.segment=p.segment;
        }
      } else if(s.node.kind==='move'){
        const target=model.destination(s,s.node,future),unitTarget=destinationFor(model.source,s.assignment,s.node)?.kind==='unit';
        if(!target){s.status='blocked';s.error='目的地が見つかりません。';changed=true;continue;}
        if(s.status!=='arrived'||unitTarget)if(moveTo(model,s,target,s.path.actualSpeed,step)&&s.status==='arrived'&&!s.destinationArrived){
          s.destinationArrived=true;
          changed=true;
          emit(s,'arrived',end);
        }
      }
    }
    // Collect contacts from one snapshot, then apply transitions in stable order.
    if(Math.abs(end-nextContact)<1e-8){
      const observers=states.filter(s=>s.unit.sensor?.enabled&&s.status!=='blocked'&&s.node?.kind!=='stop'&&s.node?.sensor!==false);
      const index=makeIndex(observers.map(s=>({
        unit:s.unit,position:mounted(s.position,s.unit),state:s
      })),range),contacts=[];
      for(const target of targets){
        if(target.error&&target.path.errorAt==='初期位置'||target.unit.detectability===0)continue;
        const p=mounted(target.position,{
          domain:target.unit.domain
        });
        for(const item of neighbors(index,p,range)){
          if(++candidateChecks%256===0)yield {
            time:start,result
          };
          const s=item.state,sensor=s.unit.sensor,pair=s.unit.id+'|'+target.unit.id;
          if(s.unit.faction===target.unit.faction||pairs.has(pair)||!sensor.domains.includes(target.unit.domain))continue;
          const distance=dist(item.position,p),probability=contactProbability(sensor,distance,target.unit.detectability??1,end-lastContact);
          if(probability<=0||sensor.terrainLOS&&!terrainVisible(model.terrain,item.position,p))continue;
          if(random01(streamKey(model.source,s.unit.id,'unified-detect-v2')+'|'+JSON.stringify([target.unit.id,lastContact,end]))<probability){
            pairs.add(pair);
            contacts.push({
              type:'detected',time:end,sampleTime:end,observationTime:end,observerId:s.unit.id,unitId:s.unit.id,targetId:target.unit.id,distance,observerPosition:{
                ...item.position
              },targetPosition:{
                ...p
              },trace:[]
            });
          }
        }
      }
      contacts.sort((a,b)=>a.unitId.localeCompare(b.unitId)||a.targetId.localeCompare(b.targetId));
      for(const e of contacts){
        const s=model.byId.get(e.unitId);
        if((!mission||s.unit.faction===mission.observerFaction&&goalTargets.some(x=>x.unit.id===e.targetId))&&!detected.has(e.targetId)){
          detected.set(e.targetId,e);
          result.events.push(e);
        }
        s.observation=e;
        changed=emit(s,'detected',end,e)||changed;
      }
      lastContact=end;
    }
    changed=immediate(end)||changed;
    if(events.length+messages.length>100000)throw Error('行動イベントが10万件を超えました。');
    result.detectedCount=result.events.filter(e=>!mission||e.time<=mission.deadline).length;
    result.reachedCount=new Set(events.filter(e=>e.type==='arrived'&&responders.includes(e.unitId)&&(!mission||e.time<=mission.deadline)).map(e=>e.unitId)).size;
    const successes=mission?.type==='arrive'?result.reachedCount:result.detectedCount,needed=mission?.join==='all'?(mission.type==='arrive'?responders.length:goalTargets.length):1;
    if(mission&&end<=mission.deadline&&successes>=needed&&result.successTime===null){
      result.success=true;
      result.successTime=end;
    }
    if(record&&(changed||end-lastRecord>=interval-1e-8||end===horizon)){
      model.record(end,frames);
      lastRecord=end;
    }
    start=end;
    yield {
      time:end,result
    };
    if(!record&&!states.some(s=>s.graph)&&mission?.type==='detect'&&result.detectedCount===goalTargets.length)break;
  }
  result.constrainedPaths=states.filter(s=>s.status==='blocked').length;
  if(record){
    model.frames=frames;
    model.result=result;
  }
  return result;
}
export const createSimulation = source => new RecordedSimulation(source);
