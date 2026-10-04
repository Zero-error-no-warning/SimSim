import {Simulation,clone,validateScenario} from './engine.js?v=0.7.0-dev';
import {hasSharedBehaviors} from './shared-settings.js?v=0.7.0-dev';
import {random01,streamKey} from './random.js?v=0.7.0-dev';
import {terrainVisible,contactProbability,mounted,makeIndex,neighbors} from './contact.js?v=0.7.0-dev';
export const RECORD_MODEL='shared-behavior-v1';
const STATUS=['idle','moving','arrived','blocked','waiting','standby','preparing'];
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z),mod=(a,b)=>(a%b+b)%b;
const mix=(a,b,f)=>({x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,z:a.z+(b.z-a.z)*f});
function pathPoint(path,along){
 const d=path.length?Math.min(path.length,Math.max(0,along)):0,n=path.nodes;let l=0,r=n.length-1;while(l<r){const m=Math.ceil((l+r)/2);if(n[m].d<=d)l=m;else r=m-1;}
 const a=n[l],b=n[Math.min(l+1,n.length-1)];return {point:mix(a,b,b.d>a.d?(d-a.d)/(b.d-a.d):0),segment:l,heading:Math.atan2(b.x-a.x,b.y-a.y)};
}
export class RecordedSimulation extends Simulation {
 constructor(source){
  super(source);this.frames=null;this.result=null;this.computeCount=0;this.nodeNames=[];
  const graphs=new Map((source.behaviors??[]).map(g=>[g.id,g]));this.assignments=source.behaviorAssignments??[];this.states=[];this.byId=new Map();
  for(const u of [...this.scenario.units].sort((a,b)=>(a.id<b.id?-1:a.id>b.id?1:0))){
   const assignment=this.assignments.find(a=>a.targets.includes('unit:'+u.id)||u.groupId&&a.targets.includes('group:'+u.groupId)),graph=assignment?graphs.get(assignment.behaviorId):null;
   const s={unit:u,assignment,graph,node:null,nodeTime:0,position:{...this.terrain.project(u.initial,u.domain).point},heading:0,status:'idle',distance:0,progress:0,segment:-1,error:null};this.states.push(s);this.byId.set(u.id,s);
   if(graph){s.path=this.compile({...u,initial:assignment.route[0],route:assignment.route.slice(1),routeMode:'loop',motion:{...u.motion,loopStart:0}});this.paths.set(u.id,s.path);for(const n of graph.nodes)if(!this.nodeNames.includes(graph.id+':'+n.id))this.nodeNames.push(graph.id+':'+n.id);}
  }
  if(this.nodeNames.length>65534)throw Error('ノード数が上限を超えました。');
  for(const a of this.assignments){const members=this.states.filter(s=>s.assignment===a);members.forEach((s,i)=>{s.initialPhase=a.spacing==='none'?(s.unit.motion?.loopStart??0):i/members.length;this.enter(s,s.graph.entry,0,true);});}
  for(const s of this.states)if(!s.assignment)Object.assign(s,super.evaluateUnit(s.unit,0));
 }
 enter(s,nodeId,time,initial=false){
  s.node=s.graph.nodes.find(n=>n.id===nodeId);s.nodeTime=time;s.sent=false;s.elapsed=false;s.join=null;s.status='idle';s.error=null;
  if(s.node.kind==='patrol'){
   if(initial){s.progress=s.initialPhase*s.path.length;const p=pathPoint(s.path,s.progress);s.position=p.point;s.heading=p.heading;s.segment=p.segment;}
   else {let best=Infinity;for(const n of s.path.nodes){const d=dist(n,s.position);if(d<best){best=d;s.progress=n.d;}}s.join=pathPoint(s.path,s.progress).point;}
   if(s.path.errorAt==='初期位置'){s.error=s.path.error;s.status='blocked';}else s.status='moving';
  }
  if(s.node.kind==='return')s.status='moving';
  if(s.node.kind==='wait')s.status='waiting';
 }
 transition(s,event,time,events){
  if(!s.graph)return false;const e=s.graph.edges.find(e=>e.from===s.node.id&&e.when===event);if(!e)return false;
  const from=s.node.id;this.enter(s,e.to,time);events.push({type:'nodeChanged',time,unitId:s.unit.id,from,nodeId:e.to});return true;
 }
 evaluate(time){
  const t=Math.max(0,Math.min(this.scenario.duration,Number(time)||0));if(!this.frames)return {time:0,units:this.states.map(s=>this.stateSnapshot(s)),actionsPending:true,recordingPending:true};
  let l=0,r=this.frames.length-1;while(l<r){const m=Math.ceil((l+r)/2);if(this.frames[m].time<=t)l=m;else r=m-1;}
  const a=this.frames[l],b=this.frames[Math.min(l+1,this.frames.length-1)],f=b.time>a.time?(t-a.time)/(b.time-a.time):0;
  const units=this.states.map((s,i)=>{const k=i*5,x=a.values,y=b.values,d=mod(y[k+3]-x[k+3]+Math.PI,Math.PI*2)-Math.PI,node=this.nodeNames[a.nodes[i]-1];return {id:s.unit.id,position:{x:x[k]+(y[k]-x[k])*f,y:x[k+1]+(y[k+1]-x[k+1])*f,z:x[k+2]+(y[k+2]-x[k+2])*f},heading:x[k+3]+d*f,distance:x[k+4]+(y[k+4]-x[k+4])*f,status:STATUS[a.status[i]],nodeId:node?.split(':').slice(1).join(':'),behaviorId:s.graph?.id,error:a.status[i]===3?'記録された地形制約停止':null,startDelay:null,actualSpeed:b.time>a.time?Math.max(0,(y[k+4]-x[k+4])/(b.time-a.time)):0,routeDistance:s.path?.length??this.paths.get(s.unit.id).length,eta:null};});
  const result=this.result,events=result.events.filter(e=>e.time<=t),arrivals=result.actionEvents.filter(e=>e.type==='arrived'&&e.time<=t&&this.source.mission?.responderIds?.includes(e.unitId));
  return {time:t,units,actionEvents:result.actionEvents.filter(e=>e.time<=t),mission:this.source.mission?{events,detectedCount:events.length,targetCount:result.targetCount,reachedCount:new Set(arrivals.map(e=>e.unitId)).size,responderCount:result.responderCount,status:result.successTime!==null&&result.successTime<=t?'success':t>=this.source.mission.deadline?'failure':'pending',deadline:this.source.mission.deadline}:undefined,recording:{frames:this.frames.length,bytes:this.recordBytes,computeCount:this.computeCount,step:this.source.recording?.step??1,interval:this.source.recording?.interval??5},actionsPending:false};
 }
 stateSnapshot(s){return {id:s.unit.id,position:{...s.position},status:s.status,heading:s.heading,distance:s.distance,routeDistance:s.path?.length??0,error:s.error,startDelay:null,actualSpeed:s.unit.speed,nodeId:s.node?.id,behaviorId:s.graph?.id,eta:null};}
 routePoints(id){return this.byId.get(id)?.assignment?[...this.byId.get(id).path.nodes]:super.routePoints(id);}
 record(time,frames){
  if(frames.at(-1)?.time===time)return;const n=this.states.length,values=new Float32Array(n*5),nodes=new Uint16Array(n),status=new Uint8Array(n);
  this.states.forEach((s,i)=>{values.set([s.position.x,s.position.y,s.position.z,s.heading,s.distance],i*5);nodes[i]=s.graph?this.nodeNames.indexOf(s.graph.id+':'+s.node.id)+1:0;status[i]=Math.max(0,STATUS.indexOf(s.status));});
  frames.push({time,values,nodes,status});if(frames.length*n*23>256*1024*1024)throw Error('再生記録が256MiBを超えました。記録間隔・期間・個数を調整してください。');
 }
 get recordBytes(){return this.frames?.reduce((n,f)=>n+8+f.values.byteLength+f.nodes.byteLength+f.status.byteLength,0)??0;}
}
function moveTo(model,s,destination,speed,dt){
 const checked=model.terrain.project(destination,s.unit.domain);if(checked.error){s.status='blocked';s.error=checked.error;return false;}
 const length=dist(s.position,checked.point),travel=Math.min(length,speed*dt),p=mix(s.position,checked.point,length?travel/length:1),steps=Math.max(1,Math.ceil(travel/Math.min(125,model.terrain.data.spacing/4)));
 for(let i=1;i<=steps;i++){const q=model.terrain.project(mix(s.position,p,i/steps),s.unit.domain);if(q.error){s.status='blocked';s.error=q.error;return false;}}
 s.heading=Math.atan2(p.x-s.position.x,p.y-s.position.y);s.position=model.terrain.project(p,s.unit.domain).point;s.distance+=travel;s.status=length<=travel+1e-7?'arrived':'moving';return s.status==='arrived';
}
export function* sharedSteps(input,mission=input.source?.mission??input.scenario.mission,_step,options={}){
 const model=input instanceof RecordedSimulation?input:new RecordedSimulation(input.source),horizon=options.horizon??mission?.deadline??model.source.duration,record=options.record??false,dt=model.source.recording?.step??1,interval=model.source.recording?.interval??5;
 if(!Number.isFinite(horizon)||horizon<0||horizon>model.source.duration)throw Error('計算終了時刻が不正です。');
 // Runtime instances are single-use. A new trial always constructs fresh instances.
 if(model.computeCount)throw Error('同じ実行状態を再計算できません。シナリオから新しい試行を作成してください。');model.computeCount++;
 const states=model.states,events=[],detected=new Map(),pairs=new Set(),messages=[],frames=record?[]:null,goalTargets=mission?.targetIds?mission.targetIds.map(id=>model.byId.get(id)):states.filter(s=>mission?s.unit.faction===mission.targetFaction:s.unit.faction!=='neutral'),targets=states.filter(s=>s.unit.faction!=='neutral'),responders=mission?.type==='arrive'?mission.responderIds:[],reached=new Set();
 if(mission&&(!goalTargets.length||goalTargets.some(s=>!s||s.unit.faction!==mission.targetFaction)))throw Error('成功条件に合う対象がありません。');
 const result={success:false,successTime:null,targetCount:goalTargets.length,detectedCount:0,responderCount:responders.length,reachedCount:0,events:[],actionEvents:events,invalidUnits:states.filter(s=>s.error).length,constrainedPaths:0};
 let lastRecord=0;const range=Math.max(1,...states.filter(s=>s.unit.sensor?.enabled).map(s=>s.unit.sensor.range));
 function emit(s,when,t,extra={}){events.push({type:when,time:t,unitId:s.unit.id,nodeId:s.node?.id,...extra});return model.transition(s,when,t,events);}
 function controls(){const speeds=new Map();for(const a of model.assignments){const members=states.filter(s=>s.assignment===a&&s.node?.kind==='patrol'&&s.status!=='blocked'&&!s.join).sort((x,y)=>x.progress/x.path.length-y.progress/y.path.length);for(let i=0;i<members.length;i++){const s=members[i],fraction=s.progress/s.path.length,next=members[(i+1)%members.length],gap=members.length===1?s.path.length:mod(next.progress/next.path.length-fraction,1)*s.path.length,desired=a.spacing==='fixed'?(a.spacingDistance??500):s.path.length/members.length,max=s.path.actualSpeed,nominal=max*(s.node.speedFraction??.7);speeds.set(s.unit.id,a.spacing==='none'||members.length===1?nominal:Math.max(0,Math.min(max,nominal+(a.gain??.01)*(gap-desired))));}}return speeds;}
 function report(s,t){const c=s.unit.communication,receiver=model.byId.get(s.node.receiverId),distance=receiver?dist(s.position,receiver.position):Infinity,key=streamKey(model.source,s.unit.id,'shared-report')+'|'+s.node.id+'|'+s.nodeTime;let reason=null;
  if(!c?.enabled)reason='通信無効';else if(!receiver)reason='受信先不在';else if(distance>c.range)reason='通信範囲外';else if(c.terrainLOS&&!terrainVisible(model.terrain,s.position,receiver.position))reason='地形遮蔽';else if(random01(key)>=c.probability)reason='通信試行失敗';
  s.sent=true;const target=s.observation;const extra={receiverId:receiver?.unit.id,distance,reason,targetId:target?.targetId,targetPosition:target?.targetPosition,observationTime:target?.time};if(!reason)messages.push({type:'received',time:t+c.delay,unitId:receiver.unit.id,senderId:s.unit.id,...extra,sourcePosition:{...s.position},receiverPosition:{...receiver.position}});return emit(s,reason?'sendFailed':'sent',t,extra);
 }
 function immediate(t){let changed=false;for(let depth=0;depth<32;depth++){let next=false;for(const s of states){if(s.node?.kind==='report'&&!s.sent)next=report(s,t)||next;else if(s.node?.kind==='wait'&&!s.elapsed&&t-s.nodeTime>=(s.node.seconds??1)){s.elapsed=true;next=emit(s,'elapsed',t)||next;}}messages.sort((a,b)=>a.time-b.time||a.unitId.localeCompare(b.unitId));while(messages[0]?.time<=t){const m=messages.shift();events.push(m);next=model.transition(model.byId.get(m.unitId),'received',t,events)||next;}changed=changed||next;if(!next)return changed;}throw Error('即時ノード遷移が32段を超えました。循環を見直してください。');}
 immediate(0);if(record)model.record(0,frames);
 for(let tick=0,start=0;start<horizon;tick++){
  const end=Math.min(horizon,start+dt,mission?.deadline>start?mission.deadline:Infinity),step=end-start,speeds=controls();let changed=false;
  for(const s of states){
   if(!s.assignment){const prev=s.status;Object.assign(s,Simulation.prototype.evaluateUnit.call(model,s.unit,end));if(prev!==s.status){changed=true;if(s.status==='arrived'){events.push({type:'arrived',time:end,unitId:s.unit.id});if(responders.includes(s.unit.id))reached.add(s.unit.id);}}continue;}
   if(s.status==='blocked')continue;
   if(s.node.kind==='patrol'){
    if(s.join){if(moveTo(model,s,s.join,s.path.actualSpeed,step))s.join=null;changed=true;continue;}
    if(s.path.length===0){s.status='blocked';s.error='周回経路の長さが0です。';changed=true;continue;}
    const old=s.progress,advance=(speeds.get(s.unit.id)??s.path.actualSpeed)*step,next=old+advance;
    if(s.path.error&&next>=s.path.length){s.progress=s.path.length;s.position={...s.path.nodes.at(-1)};s.status='blocked';s.error=s.path.error;changed=true;continue;}
    s.progress=mod(next,s.path.length);const p=pathPoint(s.path,s.progress);s.position=p.point;s.heading=p.heading;s.distance+=advance;s.status='moving';if(p.segment!==s.segment){changed=true;s.segment=p.segment;}
   }else if(s.node.kind==='return'&&s.status!=='arrived'){if(moveTo(model,s,s.assignment.base,s.unit.speed,step)){changed=true;if(responders.includes(s.unit.id))reached.add(s.unit.id);emit(s,'arrived',end);}}
  }
  // All observations use the same end-of-step snapshot; transitions affect the next step.
  const observers=states.filter(s=>s.unit.sensor?.enabled&&s.status!=='blocked'&&(!s.assignment||s.node.kind==='patrol')),index=makeIndex(observers.map(s=>({unit:s.unit,position:mounted(s.position,s.unit),state:s})),range);
  for(const target of targets){if(target.status==='blocked'||target.unit.detectability===0)continue;const p=mounted(target.position,{domain:target.unit.domain});for(const item of neighbors(index,p,range)){
   const s=item.state,sensor=s.unit.sensor,pair=s.unit.id+'|'+target.unit.id;if(s.unit.faction===target.unit.faction||pairs.has(pair)||!sensor.domains.includes(target.unit.domain))continue;
   const distance=dist(item.position,p),probability=contactProbability(sensor,distance,target.unit.detectability??1,step);if(probability<=0||sensor.terrainLOS&&!terrainVisible(model.terrain,item.position,p))continue;
   if(random01(streamKey(model.source,s.unit.id,'shared-detect')+'|'+JSON.stringify([target.unit.id,start,end]))<probability){pairs.add(pair);const event={type:'detected',time:end,sampleTime:end,observerId:s.unit.id,unitId:s.unit.id,targetId:target.unit.id,distance,observerPosition:{...item.position},targetPosition:{...p}};if((!mission||s.unit.faction===mission.observerFaction&&goalTargets.includes(target))&&!detected.has(target.unit.id)){detected.set(target.unit.id,event);result.events.push(event);}s.observation=event;changed=emit(s,'detected',end,event)||changed;}
  }}
  messages.sort((a,b)=>a.time-b.time||a.unitId.localeCompare(b.unitId));while(messages[0]?.time<=end){const m=messages.shift();events.push(m);changed=model.transition(model.byId.get(m.unitId),'received',end,events)||changed;}
  changed=immediate(end)||changed;
  if(events.length>100000)throw Error('行動イベントが10万件を超えました。');
  const beforeDeadline=!mission||end<=mission.deadline;result.detectedCount=Array.from(detected.values()).filter(e=>!mission||e.time<=mission.deadline).length;result.reachedCount=responders.filter(id=>events.some(e=>e.type==='arrived'&&e.unitId===id&&(!mission||e.time<=mission.deadline))).length;
  const successes=mission?.type==='arrive'?result.reachedCount:result.detectedCount,needed=mission?.join==='all'?(mission.type==='arrive'?responders.length:goalTargets.length):1;
  if(mission&&beforeDeadline&&successes>=needed&&result.successTime===null){result.success=true;result.successTime=end;}
  if(record&&(changed||end-lastRecord>=interval-1e-8||end===horizon)){model.record(end,frames);lastRecord=end;}
  start=end;yield {time:end,result};
 }
 result.constrainedPaths=states.filter(s=>s.status==='blocked').length;
 // Keep deadline counts even when a replay was calculated beyond the deadline.
 if(record){model.frames=frames;model.result=result;}return result;
}
export function createSimulation(source){return hasSharedBehaviors(source)?new RecordedSimulation(source):new Simulation(source);}
const encode=a=>{const b=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);let s='';for(let i=0;i<b.length;i+=8192)s+=String.fromCharCode(...b.subarray(i,i+8192));return btoa(s);};
const decode=(text,Type,length)=>{if(typeof text!=='string'||text.length>Math.ceil(length*Type.BYTES_PER_ELEMENT/3)*4+4)throw Error('記録配列の長さが不正です。');const s=atob(text);if(s.length!==length*Type.BYTES_PER_ELEMENT)throw Error('記録配列の長さが不正です。');const a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return new Type(a.buffer);};
export function recordingPayload(model){if(!model.frames)throw Error('計算・記録を先に実行してください。');return {type:'SimSim-recording',version:1,model:RECORD_MODEL,source:clone(model.source),unitIds:model.states.map(s=>s.unit.id),nodeNames:model.nodeNames,result:model.result,frames:model.frames.map(f=>({time:f.time,values:encode(f.values),nodes:encode(f.nodes),status:encode(f.status)}))};}
export function restoreRecording(payload){
 if(payload?.type!=='SimSim-recording'||payload.version!==1||payload.model!==RECORD_MODEL||!Array.isArray(payload.frames)||!payload.frames.length)throw Error('対応していない再生記録です。');
 const source=validateScenario(payload.source);if(!hasSharedBehaviors(source))throw Error('共有挙動の記録が必要です。');const model=new RecordedSimulation(source),n=model.states.length;if(JSON.stringify(payload.unitIds)!==JSON.stringify(model.states.map(s=>s.unit.id))||JSON.stringify(payload.nodeNames)!==JSON.stringify(model.nodeNames))throw Error('記録対象・ノードがシナリオと一致しません。');
 if(payload.frames.length*n*23>256*1024*1024||payload.frames.length>100001)throw Error('再生記録が上限を超えています。');let previous=-1;
 model.frames=payload.frames.map((f,i)=>{if(!Number.isFinite(f.time)||f.time<=previous||f.time>source.duration||i===0&&f.time!==0)throw Error('記録時刻が不正です。');previous=f.time;const values=decode(f.values,Float32Array,n*5),nodes=decode(f.nodes,Uint16Array,n),status=decode(f.status,Uint8Array,n);if(values.some(v=>!Number.isFinite(v))||nodes.some(v=>v>model.nodeNames.length)||status.some(v=>v>=STATUS.length))throw Error('記録値が不正です。');return {time:f.time,values,nodes,status};});
 if(previous!==source.duration)throw Error('終了時刻までの記録がありません。');const r=payload.result;if(!r||typeof r.success!=='boolean'||!Array.isArray(r.events)||!Array.isArray(r.actionEvents)||r.events.length+r.actionEvents.length>200000||r.successTime!==null&&(!Number.isFinite(r.successTime)||r.successTime<0||r.successTime>source.duration))throw Error('記録の評価・イベントが不正です。');for(const e of [...r.events,...r.actionEvents])if(!Number.isFinite(e.time)||e.time<0||e.time>source.duration)throw Error('イベント時刻が不正です。');model.result=clone(r);return model;
}
