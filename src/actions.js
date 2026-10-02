import {missionErrors} from './detection-settings.js?v=0.5.0';
import {random01,streamKey} from './random.js?v=0.5.0';
import {terrainVisible,contactProbability,mounted,makeIndex,neighbors} from './contact.js?v=0.5.0';
// Event queue and routes are precomputed once per trial; seeking never consumes RNG state.
class Queue {
  constructor(){this.items=[];this.sequence=0;}
  less(a,b){return a.time<b.time||a.time===b.time&&a.sequence<b.sequence;}
  push(e){e.sequence=this.sequence++;const a=this.items;a.push(e);let i=a.length-1;while(i>0){const p=(i-1)>>1;if(!this.less(a[i],a[p]))break;[a[i],a[p]]=[a[p],a[i]];i=p;}}
  peek(){return this.items[0];}
  pop(){const a=this.items,first=a[0],last=a.pop();if(a.length){a[0]=last;let i=0;while(true){let j=i*2+1;if(j>=a.length)break;if(j+1<a.length&&this.less(a[j+1],a[j]))j++;if(!this.less(a[j],a[i]))break;[a[i],a[j]]=[a[j],a[i]];i=j;}}return first;}
}
export function* actionSteps(model,mission=model.scenario.mission,step=model.scenario.analysis?.step??10,{horizon=mission?.deadline??model.scenario.duration}={}) {
  const errors=missionErrors(mission,model.scenario.duration);if(errors.length)throw new Error(errors.join('\n'));
  if(!Number.isFinite(step)||step<1||step>300||Math.ceil(model.scenario.duration/step)>20000)throw new Error('行動判定の区間数が上限を超えています。');
  if(!Number.isFinite(horizon)||horizon<0||horizon>model.scenario.duration)throw new Error('行動計算の終了時刻が不正です。');
  const units=[...model.scenario.units].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),byId=new Map(units.map(u=>[u.id,u])),valid=u=>model.paths.get(u.id).errorAt!=='初期位置';
  const targets=mission?.targetIds?mission.targetIds.map(id=>byId.get(id)):units.filter(u=>mission?u.faction===mission.targetFaction:u.faction!=='neutral');
  if(mission&&(!targets.length||targets.some(u=>!u||u.faction!==mission.targetFaction)))throw new Error('成功条件に合う探知対象がありません。対象陣営・IDを確認してください。');
  const observers=units.filter(u=>u.sensor?.enabled&&valid(u)&&(!mission||u.faction===mission.observerFaction));
  const range=Math.max(1,...observers.map(u=>u.sensor.range)),pairs=new Set(),firstDetections=new Map(),queue=new Queue(),fired=new Set(),events=[];
  const responders=mission?.type==='arrive'?mission.responderIds.map(id=>byId.get(id)):[];
  if(responders.some(u=>!u))throw new Error('到着を評価するユニットが見つかりません。');
  const result={success:false,successTime:null,targetCount:targets.length,detectedCount:0,responderCount:responders.length,reachedCount:0,events:[],actionEvents:events,invalidUnits:units.filter(u=>!valid(u)).length,constrainedPaths:units.filter(u=>model.paths.get(u.id).error).length};
  model.activations.clear();let candidateChecks=0,eventCount=0;
  const record=e=>{if(++eventCount>50000)throw new Error('行動イベントが5万件を超えました。ルール・対象数・判定間隔を見直してください。');const {trace,sequence,key,...saved}=e;events.push(saved);};
  const enqueue=e=>{if(queue.items.length+eventCount>=50000)throw new Error('行動イベントの上限を超えました。');if(e.time<=horizon)queue.push(e);};
  function scheduleArrival(u,departure,key,trace=[]) {
    const path=model.paths.get(u.id);if(!valid(u)||path.error||path.periodic||path.length===0||path.actualSpeed<=0)return;
    enqueue({type:'arrived',unitId:u.id,time:departure+path.length/path.actualSpeed,key:key+'|arrived',trace});
  }
  for(const u of units)if(!u.behavior?.hold)scheduleArrival(u,model.paths.get(u.id).delay??0,'automatic:'+u.id);
  function handle(e) {
    record(e);const u=byId.get(e.unitId);if(!u||!valid(u))return;
    if(e.type==='detected'&&!firstDetections.has(e.targetId)){firstDetections.set(e.targetId,e);result.events.push({time:e.time,sampleTime:e.sampleTime,observerId:u.id,targetId:e.targetId,distance:e.distance,observerPosition:e.observerPosition,targetPosition:e.targetPosition});}
    const state=model.evaluateUnit(u,e.time),waiting=['standby','idle','waiting'].includes(state.status);
    for(const r of [...(u.behavior?.rules??[])].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)) {
      if(r.when!==e.type||r.state==='waiting'&&!waiting)continue;
      const ruleKey=u.id+'|'+r.id;if(r.once&&fired.has(ruleKey))continue;
      // A repeated rule can handle each new report, but cannot revisit itself in one causal chain.
      if((e.trace??[]).includes(ruleKey))continue;
      const trace=[...(e.trace??[]),ruleKey];if(trace.length>64)throw new Error('情報の中継が64段を超えました。');
      if(r.action==='depart') {
        if(!u.behavior.hold||model.activations.has(u.id))continue;
        fired.add(ruleKey);const path=model.paths.get(u.id),ready=e.time+u.behavior.preparation,departure=ready+(path.delay??0);
        model.activations.set(u.id,{triggerTime:e.time,time:ready});
        enqueue({type:'preparing',unitId:u.id,time:e.time,ruleId:r.id,departureTime:departure,targetId:e.targetId,key:e.key+'|'+ruleKey+'|preparing',trace});
        enqueue({type:'departed',unitId:u.id,time:departure,ruleId:r.id,targetId:e.targetId,key:e.key+'|'+ruleKey+'|departed',trace});
        scheduleArrival(u,departure,e.key+'|'+ruleKey,trace);
      }else {
        fired.add(ruleKey);const c=u.communication,receiver=byId.get(r.receiverId),sourcePosition=state.position,receiverPosition=receiver?model.evaluateUnit(receiver,e.time).position:null;
        const distance=receiverPosition?Math.hypot(sourcePosition.x-receiverPosition.x,sourcePosition.y-receiverPosition.y,sourcePosition.z-receiverPosition.z):Infinity;
        const key=e.key+'|'+ruleKey+'|'+r.receiverId;
        let reason=null;
        if(!c?.enabled)reason='通信無効';else if(!receiver||!valid(receiver))reason='受信側の初期配置不正';else if(distance>c.range)reason='通信範囲外';else if(c.terrainLOS&&!terrainVisible(model.terrain,sourcePosition,receiverPosition))reason='地形遮蔽';else if(random01(streamKey(model.scenario,u.id,'communication-v1')+'|'+key)>=c.probability)reason='通信試行失敗';
        const base={unitId:u.id,receiverId:r.receiverId,time:e.time,ruleId:r.id,targetId:e.targetId,targetPosition:e.targetPosition,observationTime:e.observationTime??e.sampleTime,sourcePosition,receiverPosition,distance,key,trace};
        enqueue({...base,type:reason?'sendFailed':'sent',reason});
        if(!reason)enqueue({...base,type:'received',unitId:receiver.id,senderId:u.id,time:e.time+c.delay});
      }
    }
  }
  function drain(time){while(queue.peek()&&queue.peek().time<=time)handle(queue.pop());}
  drain(0);yield {time:0,result};
  for(let start=0;start<horizon;) {
    // Contacts use fixed midpoint intervals. Queue events are processed chronologically before
    // that midpoint and at interval end; communication never changes another observer's RNG grid.
    const boundary=(Math.floor((start+1e-8)/step)+1)*step;
    const end=Math.min(horizon,boundary,mission?.deadline>start?mission.deadline:Infinity);
    if(end<=start){drain(start);continue;}
    const mid=(start+end)/2;drain(mid);const index=makeIndex(observers.map(unit=>({unit,position:mounted(model.evaluateUnit(unit,mid).position,unit)})),range);
    for(const target of targets) {
      if(!valid(target)||target.detectability===0)continue;
      const position=mounted(model.evaluateUnit(target,mid).position,{domain:target.domain});
      for(const observer of neighbors(index,position,range)) {
        if(++candidateChecks%256===0)yield {time:start,result};
        if(observer.unit.faction===target.faction||!mission&&target.faction==='neutral')continue;
        const pair=JSON.stringify([observer.unit.id,target.id]);if(pairs.has(pair))continue;
        const s=observer.unit.sensor;if(!s.domains.includes(target.domain))continue;
        const distance=Math.hypot(observer.position.x-position.x,observer.position.y-position.y,observer.position.z-position.z),probability=contactProbability(s,distance,target.detectability??1,end-start);
        if(probability<=0||s.terrainLOS&&!terrainVisible(model.terrain,observer.position,position))continue;
        const key=streamKey(model.scenario,observer.unit.id,'detect-v1')+'|'+JSON.stringify([target.id,start,end]);
        if(random01(key)<probability){pairs.add(pair);enqueue({type:'detected',unitId:observer.unit.id,targetId:target.id,time:end,sampleTime:mid,observationTime:mid,distance,observerPosition:observer.position,targetPosition:position,key:'contact:'+pair,trace:[]});}
      }
    }
    drain(end);start=end;yield {time:end,result};
  }
  const deadline=mission?.deadline??horizon,detected=new Set(result.events.filter(e=>e.time<=deadline).map(e=>e.targetId)),arrivals=events.filter(e=>e.type==='arrived'&&e.time<=deadline&&mission?.responderIds?.includes(e.unitId));
  result.detectedCount=detected.size;result.reachedCount=new Set(arrivals.map(e=>e.unitId)).size;
  const goalEvents=mission?.type==='arrive'?arrivals:result.events.filter(e=>e.time<=deadline);
  const needed=mission?.join==='all'?(mission.type==='arrive'?responders.length:targets.length):1;
  if(goalEvents.length>=needed&&needed>0){result.success=true;result.successTime=goalEvents[needed-1].time;}
  return result;
}
