import {analysisConditions,trialScenario,readParameter,bindingKey} from './parameters.js?v=0.4';
import {Simulation,clone,validateScenario} from './engine.js?v=0.4';
import {random01,streamKey} from './random.js?v=0.2';
import {missionErrors,analysisErrors} from './detection-settings.js?v=0.4';

export function terrainVisible(terrain,a,b) {
  const distance=Math.hypot(b.x-a.x,b.y-a.y),steps=Math.max(1,Math.ceil(distance/Math.min(125,terrain.data.spacing/4)));
  for(let i=0;i<=steps;i++) {
    const f=i/steps,x=a.x+(b.x-a.x)*f,y=a.y+(b.y-a.y)*f,z=a.z+(b.z-a.z)*f,h=terrain.height(x,y);
    if(h===null||z<h-1e-6)return false;
  }
  return true;
}
export function contactProbability(sensor,distance,detectability,seconds) {
  if(seconds<=0||detectability<=0||distance>=sensor.range||sensor.probabilityPerMinute<=0)return 0;
  if(sensor.probabilityPerMinute>=1)return 1;
  const hazard=-Math.log1p(-sensor.probabilityPerMinute)/60;
  return -Math.expm1(-hazard*seconds*detectability*(1-distance/sensor.range)**2);
}
const mounted=(p,u)=>({...p,z:p.z+(u.sensor?.mountHeight??(u.domain==='ground'?2:0))});
const spatialKey=(x,y,size)=>Math.floor(x/size)+','+Math.floor(y/size);
function makeIndex(items,size) {
  const cells=new Map();for(const item of items){const key=spatialKey(item.position.x,item.position.y,size);if(!cells.has(key))cells.set(key,[]);cells.get(key).push(item);}return cells;
}
function* neighbors(cells,p,size) {
  const x=Math.floor(p.x/size),y=Math.floor(p.y/size);
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)for(const item of cells.get((x+dx)+','+(y+dy))??[])yield item;
}
export function* detectionSteps(model,mission=model.scenario.mission,step=model.scenario.analysis?.step??10) {
  const errors=missionErrors(mission,model.scenario.duration);
  if(!mission)throw new Error('成功条件を設定してください。');
  if(errors.length)throw new Error(errors.join('\n'));
  if(!Number.isFinite(step)||step<1||step>300||Math.ceil(mission.deadline/step)>20000)throw new Error('探知判定の区間数が上限を超えています。判定間隔を見直してください。');
  const units=model.scenario.units,byId=new Map(units.map(u=>[u.id,u]));
  const targets=mission.targetIds?mission.targetIds.map(id=>byId.get(id)):units.filter(u=>u.faction===mission.targetFaction);
  if(!targets.length||targets.some(u=>!u||u.faction!==mission.targetFaction))throw new Error('成功条件に合う対象がありません。対象陣営・IDを確認してください。');
  const valid=u=>model.paths.get(u.id).errorAt!=='初期位置';
  const observers=units.filter(u=>u.faction===mission.observerFaction&&u.sensor?.enabled&&valid(u)).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const range=Math.max(1,...observers.map(u=>u.sensor.range)),events=[],detected=new Set();let candidateChecks=0;
  const stationary=observers.filter(u=>model.paths.get(u.id).length===0||u.speed===0);
  const moving=observers.filter(u=>!stationary.includes(u));
  const staticIndex=makeIndex(stationary.map(unit=>({unit,position:mounted(model.evaluateUnit(unit,0).position,unit)})),range);
  const result={success:false,successTime:null,targetCount:targets.length,detectedCount:0,events,invalidUnits:units.filter(u=>!valid(u)).length,constrainedPaths:units.filter(u=>model.paths.get(u.id).error).length};
  for(let tick=0,start=0;start<mission.deadline;tick++) {
    const end=Math.min(mission.deadline,start+step),dt=end-start,mid=(start+end)/2;
    const dynamicIndex=makeIndex(moving.map(unit=>({unit,position:mounted(model.evaluateUnit(unit,mid).position,unit)})),range);
    for(const target of targets) {
      if(detected.has(target.id)||!valid(target)||target.detectability===0)continue;
      const p=mounted(model.evaluateUnit(target,mid).position,{domain:target.domain});
      for(const observer of [...neighbors(staticIndex,p,range),...neighbors(dynamicIndex,p,range)]) {
        if(++candidateChecks%256===0)yield {time:start,result};
        const s=observer.unit.sensor;if(!s.domains.includes(target.domain))continue;
        const distance=Math.hypot(observer.position.x-p.x,observer.position.y-p.y,observer.position.z-p.z);
        const probability=contactProbability(s,distance,target.detectability??1,dt);
        if(probability<=0)continue;
        if(s.terrainLOS&&!terrainVisible(model.terrain,observer.position,p))continue;
        const key=streamKey(model.scenario,observer.unit.id,'detect-v1')+'|'+JSON.stringify([target.id,start,end]);
        if(random01(key)<probability) {
          detected.add(target.id);
          events.push({time:end,sampleTime:mid,observerId:observer.unit.id,targetId:target.id,distance,observerPosition:observer.position,targetPosition:p});
          break;
        }
      }
    }
    result.detectedCount=detected.size;
    const succeeded=mission.join==='any'?detected.size>0:detected.size===targets.length;
    if(succeeded&&result.successTime===null){result.success=true;result.successTime=end;}
    start=end;yield {time:end,result};
    // Still collect other targets after an 'any' success, to support consistent replay.
    if(detected.size===targets.length)break;
  }
  return result;
}
export function runDetection(model,mission=model.scenario.mission,step=model.scenario.analysis?.step??10) {
  const generator=detectionSteps(model,mission,step);let state=generator.next();while(!state.done)state=generator.next();return state.value;
}
export function snapshotMission(result,mission,time) {
  const events=result.events.filter(e=>e.time<=time),detectedCount=events.length;
  const success=mission.join==='any'?detectedCount>0:detectedCount===result.targetCount;
  return {events,detectedCount,targetCount:result.targetCount,status:success?'success':time>=mission.deadline?'failure':'pending',deadline:mission.deadline};
}
export function wilson(successes,total) {
  if(total===0)return {rate:null,low:null,high:null};
  const z=1.959963984540054,p=successes/total,den=1+z*z/total,center=(p+z*z/(2*total))/den,half=z*Math.sqrt(p*(1-p)/total+z*z/(4*total*total))/den;
  return {rate:p,low:Math.max(0,center-half),high:Math.min(1,center+half)};
}
export function scenarioForCount(source,groupId,count,trial) {
  const next=clone(source),group=next.groups?.find(g=>g.id===groupId);if(!group)throw new Error('比較する群が見つかりません。');
  if(count===0)next.groups=next.groups.filter(g=>g.id!==groupId);else group.count=count;
  next.trial=trial;return next;
}
export function prepareAnalysis(source) {
  const scenario=validateScenario(source),errors=[...missionErrors(scenario.mission,scenario.duration),...analysisErrors(scenario.analysis,scenario.duration)];
  if(!scenario.mission||!scenario.analysis)errors.push('成功条件と分析条件を設定してください。');
  if(errors.length)throw new Error(errors.join('\n'));
  const a=scenario.analysis,startTrial=scenario.trial??0;
  if(startTrial+a.trials-1>1000000000)throw new Error('試行番号の上限を超えます。');
  const conditions=analysisConditions(scenario);
  for(const c of conditions){for(const b of [...c.settings,...(a.uncertainties??[])])readParameter(scenario,b);validateScenario(trialScenario(scenario,c,startTrial,{maximum:true}).scenario);}
  return {scenario,analysis:a,startTrial,conditions};
}
export function summarizeRow(count,trials) {
  const successes=trials.filter(t=>t.success).length,times=trials.filter(t=>t.success).map(t=>t.successTime).sort((a,b)=>a-b),n=times.length;
  const median=n?(n%2?times[(n-1)/2]:(times[n/2-1]+times[n/2])/2):null;
  return {count,total:trials.length,successes,...wilson(successes,trials.length),median,invalidTrials:trials.filter(t=>t.invalidUnits>0).length,trials};
}

export function restoreAnalysisResult(payload) {
  if(!payload||payload.type!=='SimSim-analysis'||![1,2].includes(payload.version)||payload.model!=='range-hazard-v1')throw new Error('この分析結果の形式・モデル版は読み込めません。');
  const {scenario,analysis,startTrial,conditions}=prepareAnalysis(payload.source),counts=new Set(),rows=[];
  if(payload.version===1&&(analysis.factors?.length||analysis.uncertainties?.length))throw new Error('旧版の結果は個数比較のみ対応します。');
  if(!Array.isArray(payload.rows)||payload.rows.length>conditions.length)throw new Error('分析結果の条件数が不正です。');
  for(const row of payload.rows) {
    const condition=payload.version===1?conditions.find(c=>c.count===row?.count):conditions.find(c=>c.id===row?.condition?.id);
    if(!row||!condition||counts.has(condition.id)||!Array.isArray(row.trials)||!row.trials.length||row.trials.length>analysis.trials)throw new Error('分析結果の個数・試行数が不正です。');
    counts.add(condition.id);const ids=new Set(),trials=[];
    for(const t of row.trials) {
      if(!t||!Number.isInteger(t.trial)||t.trial<startTrial||t.trial>=startTrial+analysis.trials||ids.has(t.trial)||typeof t.success!=='boolean')throw new Error('分析結果の試行番号・成否が不正です。');
      ids.add(t.trial);
      for(const [key,min,max] of [['targetCount',1,2000],['detectedCount',0,2000],['invalidUnits',0,2000],['constrainedPaths',0,2000]])if(!Number.isInteger(t[key])||t[key]<min||t[key]>max)throw new Error('分析結果の'+key+'が不正です。');
      if(t.detectedCount>t.targetCount||t.success!==(scenario.mission.join==='any'?t.detectedCount>0:t.detectedCount===t.targetCount))throw new Error('分析結果の探知数と成否が一致していません。');
      const generated=trialScenario(scenario,condition,t.trial);
      if(payload.version===2&&(!Array.isArray(t.sampled)||t.sampled.length!==generated.sampled.length||new Set(t.sampled.map(b=>bindingKey(b??{}))).size!==t.sampled.length||generated.sampled.some(b=>!t.sampled.some(v=>v&&bindingKey(v)===bindingKey(b)&&v.value===b.value))))throw new Error('分析結果の抽出値がシード・分布と一致しません。');
      if(t.success?!(Number.isFinite(t.successTime)&&t.successTime>0&&t.successTime<=generated.scenario.mission.deadline):t.successTime!==null)throw new Error('分析結果の成立時刻が不正です。');
      trials.push({trial:t.trial,success:t.success,successTime:t.successTime,targetCount:t.targetCount,detectedCount:t.detectedCount,invalidUnits:t.invalidUnits,constrainedPaths:t.constrainedPaths,sampled:generated.sampled});
    }
    trials.sort((a,b)=>a.trial-b.trial);rows.push({...summarizeRow(condition.count,trials),condition});
  }
  rows.sort((a,b)=>a.condition.index-b.condition.index);
  return {source:scenario,rows,completed:rows.reduce((n,r)=>n+r.total,0),planned:conditions.length*analysis.trials,elapsedMs:Number.isFinite(payload.elapsedMs)&&payload.elapsedMs>=0?payload.elapsedMs:0};
}
