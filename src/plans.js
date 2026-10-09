import {importScenario} from './scenario-import.js?v=20261007-plan-switch-25';
import {prepareAnalysis,restoreAnalysisRows} from './detection.js?v=20261007-plan-switch-25';
import {applyPlan,planMetric} from './plan-settings.js?v=20261007-plan-switch-25';
import {summarizePaired} from './sensitivity.js?v=20261007-plan-switch-25';
import {RECORD_MODEL,compatibleModel} from './recording.js?v=20261007-plan-switch-25';
export function planTrialSource(s,condition){
  const p=s.analysis.plans.items.find(p=>'plan:'+p.id===condition.id);
  if(!p)throw Error('運用案が見つかりません。');
  const next=applyPlan(s,p);next.analysis.factors=[];
  for(const key of ['mode','plans','sensitivity','groupId','counts'])delete next.analysis[key];
  return next;
}
export function preparePlans(source){
  const scenario=importScenario(source),config=scenario.analysis?.plans;
  if(!config||config.items.length<2)throw Error('比較する運用案を2件以上保存してください。');
  const metric=planMetric(scenario);if(!metric)throw Error('運用案の評価指標を選択してください。');
  if(config.items.length*scenario.analysis.trials>10000)throw Error('運用案数×試行数は10000以下にしてください。');
  const items=[config.items.find(p=>p.id===config.baselineId),...config.items.filter(p=>p.id!==config.baselineId)];
  const conditions=items.map((p,i)=>({id:'plan:'+p.id,index:i+1,label:p.name,settings:[],planId:p.id})),sources={};let prepared;
  for(const c of conditions){
    try{const trialSource=planTrialSource(scenario,c);prepared=prepareAnalysis(trialSource);sources[c.id]=prepared.scenario;}
    catch(e){throw Error('運用案「'+c.label+'」: '+e.message);}
  }
  return {...prepared,scenario,conditions,sources,metric};
}
export function summarizePlans(s,rows){
  const base=rows.find(r=>r.condition.id==='plan:'+s.analysis.plans.baselineId),metric=planMetric(s);
  return base&&metric?rows.filter(r=>r!==base).map(r=>({...summarizePaired(s,base.trials,r.trials,metric),condition:r.condition})):[];
}
export function restorePlansResult(payload){
  if(!payload||payload.type!=='SimSim-plans'||payload.version!==1||!compatibleModel(payload)||payload.source?.version<3)throw Error('この運用案比較結果の形式・モデル版は読み込めません。');
  const prepared=preparePlans(payload.source),rows=[],seen=new Set();
  if(!Array.isArray(payload.rows)||payload.rows.length>prepared.conditions.length)throw Error('運用案比較結果の件数が不正です。');
  for(const row of payload.rows){
    const condition=prepared.conditions.find(c=>c.id===row?.condition?.id);
    if(!condition||seen.has(condition.id))throw Error('運用案比較結果の案が不正・重複しています。');seen.add(condition.id);
    const scenario=prepared.sources[condition.id],restored=restoreAnalysisRows({...prepared,scenario,conditions:[condition]},{...payload,source:scenario,rows:[row]});rows.push(...restored.rows);
  }
  rows.sort((a,b)=>a.condition.index-b.condition.index);
  const base=rows.find(r=>r.condition.id===prepared.conditions[0].id);
  if(rows.length&&!base)throw Error('運用案比較の基準試行がありません。');
  if(base&&rows.some(r=>r.trials.some(t=>!base.trials.some(b=>b.trial===t.trial))))throw Error('運用案に対応する基準試行がありません。');
  return {source:prepared.scenario,mode:'plans',rows,completed:rows.reduce((n,r)=>n+r.total,0),planned:prepared.conditions.length*prepared.analysis.trials,elapsedMs:Number.isFinite(payload.elapsedMs)&&payload.elapsedMs>=0?payload.elapsedMs:0};
}
