import {importScenario} from './scenario-import.js?v=20261007-sensitivity-22';
import {clone,validateScenario} from './engine.js?v=20261007-sensitivity-22';
import {trialScenario,readParameter,bindingKey,formatBinding} from './parameters.js?v=20261007-sensitivity-22';
import {prepareAnalysis,restoreAnalysisRows} from './detection.js?v=20261007-sensitivity-22';
import {median} from './measurement-points.js?v=20261007-sensitivity-22';
import {sensitivityMetrics,sensitivityConfigErrors} from './sensitivity-settings.js?v=20261007-sensitivity-22';
import {RECORD_MODEL} from './recording.js?v=20261007-sensitivity-22';

export function sensitivityTrialSource(s){
  const next=clone(s);next.analysis.factors=[];delete next.analysis.groupId;delete next.analysis.counts;
  delete next.analysis.mode;delete next.analysis.sensitivity;return next;
}
export function prepareSensitivity(source){
  const scenario=importScenario(source),config=scenario.analysis?.sensitivity,errors=sensitivityConfigErrors(scenario);
  if(!config?.candidates.length)errors.push('感度分析で調べる性能を一つ以上選択してください。');
  if(errors.length)throw Error(errors.join('\n'));
  const trialSource=sensitivityTrialSource(scenario),prepared=prepareAnalysis(trialSource),metric=sensitivityMetrics(scenario).find(m=>m.id===config.metric);
  const conditions=[{id:'baseline',index:1,label:'基準条件（現在の設定）',settings:[]}];
  for(const candidate of config.candidates){
    const base=readParameter(scenario,candidate);
    if(candidate.low>base||candidate.high<base)throw Error(formatBinding(scenario,candidate,base)+'：小さい値 ≤ 基準値 ≤ 大きい値にしてください。');
    if(candidate.low===base&&candidate.high===base)throw Error('基準値と異なる値を一つ以上指定してください。');
    for(const [direction,value] of [['low',candidate.low],['high',candidate.high]]){
      if(value===base)continue;
      const setting={target:candidate.target,parameter:candidate.parameter,value};
      conditions.push({id:JSON.stringify([bindingKey(candidate),direction,value]),index:conditions.length+1,label:formatBinding(scenario,candidate,value),settings:[setting],candidate:{target:candidate.target,parameter:candidate.parameter},direction,baseValue:base});
    }
  }
  if(conditions.length*prepared.analysis.trials>10000)throw Error('感度分析の条件数×試行数は10000以下にしてください。');
  // Validation includes zero groups, terrain ranges, graph constraints and total population.
  for(const condition of conditions)validateScenario(trialScenario(trialSource,condition,prepared.startTrial,{maximum:true}).scenario);
  return {...prepared,scenario,trialSource,metric,conditions};
}
export function metricValue(s,trial,metric){
  const r=metric.measurementId?trial.measurements?.find(m=>m.id===metric.measurementId):trial;
  if(!r)return null;
  if(metric.kind==='rate')return r.success?1:0;
  if(!r.success)return null;
  if(metric.kind==='time')return r.successTime;
  const point=s.measurements.find(m=>m.id===metric.measurementId),previous=point.previousId?trial.measurements?.find(m=>m.id===point.previousId):null;
  if(point.previousId&&!previous?.success)return null;
  const duration=r.successTime-(previous?.successTime??0);return duration>=0?duration:null;
}
const mean=values=>values.length?values.reduce((n,v)=>n+v,0)/values.length:null;
// Two-sided 95% Student t critical values. Larger samples use the normal limit.
const t95=[null,12.706,4.303,3.182,2.776,2.571,2.447,2.365,2.306,2.262,2.228,2.201,2.179,2.160,2.145,2.131,2.120,2.110,2.101,2.093,2.086,2.080,2.074,2.069,2.064,2.060,2.056,2.052,2.048,2.045,2.042];
export function summarizePaired(s,baseline,changed,metric){
  const originals=new Map(baseline.map(t=>[t.trial,t])),pairs=[],common=[];
  for(const t of changed){const b=originals.get(t.trial);if(!b)continue;const before=metricValue(s,b,metric),after=metricValue(s,t,metric);common.push({trial:t.trial,before,after,invalid:b.invalidUnits>0||t.invalidUnits>0});if(before!==null&&after!==null)pairs.push({trial:t.trial,before,after,delta:after-before});}
  const differences=pairs.map(p=>p.delta),delta=mean(differences),n=pairs.length;
  const error=n>1?Math.sqrt(differences.reduce((v,d)=>v+(d-delta)**2,0)/(n-1)/n):null;
  const critical=n>1?(t95[n-1]??(n<=61?2.042:n<=121?2:1.96)):null;
  const half=error===null?null:critical*error;
  const before=baseline.map(t=>metricValue(s,t,metric)).filter(v=>v!==null),after=changed.map(t=>metricValue(s,t,metric)).filter(v=>v!==null);
  return {total:common.length,pairs:n,delta,low:half===null?null:Math.max(metric.kind==='rate'?-1:-Infinity,delta-half),high:half===null?null:Math.min(metric.kind==='rate'?1:Infinity,delta+half),baseline:mean(before),changed:mean(after),baselineMedian:median(before),changedMedian:median(after),baselineEligible:before.length,changedEligible:after.length,pairedBaseline:mean(pairs.map(p=>p.before)),pairedChanged:mean(pairs.map(p=>p.after)),unpaired:common.length-n,baselineMissing:common.filter(p=>p.before===null).length,changedMissing:common.filter(p=>p.after===null).length,invalidPairs:common.filter(p=>p.invalid).length,improved:pairs.filter(p=>metric.kind==='rate'?p.delta>0:p.delta<0).length,worsened:pairs.filter(p=>metric.kind==='rate'?p.delta<0:p.delta>0).length,unchanged:pairs.filter(p=>p.delta===0).length};
}
export function summarizeSensitivity(s,rows){
  const metric=sensitivityMetrics(s).find(m=>m.id===s.analysis.sensitivity.metric),base=rows.find(r=>r.condition.id==='baseline');
  if(!base)return [];
  const entries=rows.filter(r=>r.condition.id!=='baseline').map(r=>({...summarizePaired(s,base.trials,r.trials,metric),condition:r.condition}));
  const score=new Map();for(const r of entries){const key=bindingKey(r.condition.candidate),value=r.delta===null?null:Math.abs(r.delta);if(value!==null)score.set(key,Math.max(score.get(key)??0,value));}
  const keys=[...new Set(entries.map(r=>bindingKey(r.condition.candidate)))].sort((a,b)=>(score.get(b)??-1)-(score.get(a)??-1)||a.localeCompare(b));
  return entries.map(r=>({...r,rank:r.delta===null?null:keys.indexOf(bindingKey(r.condition.candidate))+1})).sort((a,b)=>(a.rank??Infinity)-(b.rank??Infinity)||a.condition.index-b.condition.index);
}
export function restoreSensitivityResult(payload){
  if(!payload||payload.type!=='SimSim-sensitivity'||payload.version!==1||payload.model!==RECORD_MODEL)throw Error('この感度分析結果の形式・モデル版は読み込めません。');
  if(payload.source?.version!==3)throw Error('感度分析の元シナリオはversion 3にしてください。');
  const prepared=prepareSensitivity(payload.source),restored=restoreAnalysisRows({...prepared,scenario:prepared.trialSource},{...payload,source:prepared.trialSource});
  if(restored.rows.length&&!restored.rows.some(r=>r.condition.id==='baseline'))throw Error('感度分析の基準試行がありません。');
  const base=restored.rows.find(r=>r.condition.id==='baseline');
  if(base&&restored.rows.some(r=>r.condition.id!=='baseline'&&r.trials.some(t=>!base.trials.some(b=>b.trial===t.trial))))throw Error('変更条件に対応する基準試行がありません。');
  return {...restored,source:prepared.scenario,mode:'sensitivity'};
}
