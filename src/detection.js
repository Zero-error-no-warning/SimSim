import {stateSummary,validateStateResult} from './state-measurement.js?v=20261006-received-position-12';
import { sharedSteps,RecordedSimulation,RECORD_MODEL } from './recorded-engine.js?v=20261006-received-position-12';
import { analysisConditions,trialScenario,readParameter,bindingKey } from './parameters.js?v=20261006-received-position-12';
import { clone,validateScenario } from './engine.js?v=20261006-received-position-12';
import { missionErrors,analysisErrors } from './detection-settings.js?v=20261006-received-position-12';
export { terrainVisible,contactProbability } from './contact.js?v=20261006-received-position-12';
import { importScenario } from './scenario-import.js?v=20261006-received-position-12';
export function* detectionSteps(model,mission=model.scenario.mission,step=model.scenario.analysis?.step??10,options={
}) {
  if(!(model instanceof RecordedSimulation)&&model.source.version!==3&&step!==undefined){
    const source=importScenario(model.source);
    source.recording={
      step,interval:step
    };
    if(source.analysis)source.analysis.step=step;
    model=new RecordedSimulation(source);
  }
  return yield* sharedSteps(model,mission,step,options);
}
export function runDetection(model,mission=model.scenario.mission,step=model.scenario.analysis?.step??10) {
  const generator=detectionSteps(model,mission,step);
  let state=generator.next();
  while(!state.done)state=generator.next();
  return state.value;
}
export function snapshotMission(result,mission,time) {
  const events=result.events.filter(e=>e.time<=time),detectedCount=events.length;
  const reachedCount=(result.actionEvents??[]).filter(e=>e.type==='arrived'&&e.time<=time&&mission.responderIds?.includes(e.unitId)).length;
  const success=result.successTime!==null&&result.successTime<=time;
  return {
    ...(mission.type==='state'?stateSummary(result.stateEntries,mission,result.stateTargetCount,time):{}),events,detectedCount,targetCount:result.targetCount,reachedCount,responderCount:result.responderCount??0,status:success?'success':time>=mission.deadline?'failure':'pending',deadline:mission.deadline
  };
}
export function wilson(successes,total) {
  if(total===0)return {
    rate:null,low:null,high:null
  };
  const z=1.959963984540054,p=successes/total,den=1+z*z/total,center=(p+z*z/(2*total))/den,half=z*Math.sqrt(p*(1-p)/total+z*z/(4*total*total))/den;
  return {
    rate:p,low:Math.max(0,center-half),high:Math.min(1,center+half)
  };
}
export function scenarioForCount(source,groupId,count,trial) {
  return trialScenario(importScenario(source),{
    settings:[{
      target:'group:'+groupId,parameter:'capacity.population',value:count
    }]
  },trial).scenario;
}
export function prepareAnalysis(source) {
  const scenario=importScenario(source),errors=[...missionErrors(scenario.mission,scenario.duration),...analysisErrors(scenario.analysis,scenario.duration)];
  if(!scenario.mission||!scenario.analysis)errors.push('成功条件と分析条件を設定してください。');
  if(errors.length)throw new Error(errors.join('\n'));
  const a=scenario.analysis,startTrial=scenario.trial??0;
  if(startTrial+a.trials-1>1000000000)throw new Error('試行番号の上限を超えます。');
  const conditions=analysisConditions(scenario);
  for(const c of conditions){
    for(const b of [...c.settings,...(a.uncertainties??[])])readParameter(scenario,b);
    validateScenario(trialScenario(scenario,c,startTrial,{
      maximum:true
    }).scenario);
  }
  return {
    scenario,analysis:a,startTrial,conditions
  };
}
export function summarizeRow(count,trials) {
  const successes=trials.filter(t=>t.success).length,times=trials.filter(t=>t.success).map(t=>t.successTime).sort((a,b)=>a-b),n=times.length;
  const median=n?(n%2?times[(n-1)/2]:(times[n/2-1]+times[n/2])/2):null;
  return {
    count,total:trials.length,successes,...wilson(successes,trials.length),median,invalidTrials:trials.filter(t=>t.invalidUnits>0).length,trials
  };
}
export function restoreAnalysisResult(payload) {
  if(!payload||payload.type!=='SimSim-analysis'||payload.version!==5||payload.model!==RECORD_MODEL)throw new Error('この分析結果の形式・モデル版は読み込めません。');
  const {
    scenario,analysis,startTrial,conditions
  }
  =prepareAnalysis(payload.source),counts=new Set(),rows=[];
  if(payload.source.version!==3)throw new Error('旧モデルの集計は旧版で開いてください。シナリオ定義は変換できます。');
  if(!Array.isArray(payload.rows)||payload.rows.length>conditions.length)throw new Error('分析結果の条件数が不正です。');
  for(const row of payload.rows) {
    const condition=conditions.find(c=>c.id===row?.condition?.id);
    if(!row||!condition||counts.has(condition.id)||!Array.isArray(row.trials)||!row.trials.length||row.trials.length>analysis.trials)throw new Error('分析結果の個数・試行数が不正です。');
    counts.add(condition.id);
    const ids=new Set(),trials=[];
    for(const t of row.trials) {
      if(!t||!Number.isInteger(t.trial)||t.trial<startTrial||t.trial>=startTrial+analysis.trials||ids.has(t.trial)||typeof t.success!=='boolean')throw new Error('分析結果の試行番号・成否が不正です。');
      ids.add(t.trial);
      for(const [key,min,max] of [['targetCount',0,2000],['detectedCount',0,2000],['invalidUnits',0,2000],['constrainedPaths',0,2000]])if(!Number.isInteger(t[key])||t[key]<min||t[key]>max)throw new Error('分析結果の'+key+'が不正です。');
      if(t.detectedCount>t.targetCount||scenario.mission.type==='detect'&&t.success!==(t.targetCount>0&&(scenario.mission.join==='any'?t.detectedCount>0:t.detectedCount===t.targetCount)))throw new Error('分析結果の探知数と成否が一致していません。');
      const generated=trialScenario(scenario,condition,t.trial);
      if((!Array.isArray(t.sampled)||t.sampled.length!==generated.sampled.length||new Set(t.sampled.map(b=>bindingKey(b??{
      }))).size!==t.sampled.length||generated.sampled.some(b=>!t.sampled.some(v=>v&&bindingKey(v)===bindingKey(b)&&v.value===b.value))))throw new Error('分析結果の抽出値がシード・分布と一致しません。');
      if(t.success?!(Number.isFinite(t.successTime)&&t.successTime>=0&&t.successTime<=generated.scenario.mission.deadline):t.successTime!==null)throw new Error('分析結果の成立時刻が不正です。');
      if(scenario.mission.type==='state')validateStateResult(generated.scenario,t);
      if(scenario.mission.type==='arrive'&&(!Number.isInteger(t.reachedCount)||t.reachedCount<0||t.reachedCount>generated.scenario.mission.responderIds.filter(id=>generated.scenario.units.some(u=>u.id===id&&u.enabled!==false)).length||t.success!==(scenario.mission.join==='any'?t.reachedCount>0:t.reachedCount>0&&t.reachedCount===generated.scenario.mission.responderIds.filter(id=>generated.scenario.units.some(u=>u.id===id&&u.enabled!==false)).length)))throw new Error('到着数と成否が一致していません。');
      trials.push({
        ...(scenario.mission.type==='state'?{stateEntries:t.stateEntries,stateTargetCount:t.stateTargetCount,stateReachedCount:t.stateReachedCount}:{}),reachedCount:t.reachedCount??0,responderCount:generated.scenario.mission.responderIds?.filter(id=>generated.scenario.units.some(u=>u.id===id&&u.enabled!==false)).length??0,trial:t.trial,success:t.success,successTime:t.successTime,targetCount:t.targetCount,detectedCount:t.detectedCount,invalidUnits:t.invalidUnits,constrainedPaths:t.constrainedPaths,sampled:generated.sampled
      });
    }
    trials.sort((a,b)=>a.trial-b.trial);
    rows.push({
      ...summarizeRow(condition.count,trials),condition
    });
  }
  rows.sort((a,b)=>a.condition.index-b.condition.index);
  return {
    source:scenario,rows,completed:rows.reduce((n,r)=>n+r.total,0),planned:conditions.length*analysis.trials,elapsedMs:Number.isFinite(payload.elapsedMs)&&payload.elapsedMs>=0?payload.elapsedMs:0
  };
}
