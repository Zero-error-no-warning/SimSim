import {availableBindings,readParameter,parameter,bindingKey} from './parameters.js?v=20261007-worker-version-24';

export const MAX_SENSITIVITY_CANDIDATES=32;
export function sensitivityMetrics(s){
  const out=s.mission?[{id:'mission.rate',label:'ミッションの成立率',kind:'rate'},{id:'mission.time',label:'ミッションの成立時刻',kind:'time'}]:[];
  for(const m of s.measurements??[])for(const kind of ['rate','time','duration'])out.push({id:'point.'+m.id+'.'+kind,label:m.name+' · '+({rate:'到達率',time:'成立時刻',duration:'起点からの所要時間'})[kind],kind,measurementId:m.id});
  return out;
}
export function sensitivityBindings(s){
  const uncertain=new Set((s.analysis?.uncertainties??[]).map(bindingKey));
  return availableBindings(s).filter(b=>{
    if(b.target==='scenario'||uncertain.has(bindingKey(b)))return false;
    if(b.target.startsWith('unit:')&&s.units.find(u=>u.id===b.target.slice(5))?.enabled===false)return false;
    if(b.target.startsWith('group:')&&s.groups.find(g=>g.id===b.target.slice(6))?.enabled===false)return false;
    try{return Number.isFinite(readParameter(s,b));}catch{return false;}
  });
}
export function defaultSensitivityCandidate(s,b){
  const p=parameter(b.parameter),base=readParameter(s,b),step=p.integer?Math.max(1,Math.round(Math.abs(base)*.1)):Math.abs(base)*.1||p.scale;
  return {target:b.target,parameter:b.parameter,low:Math.max(p.min,base-step),high:Math.min(p.max,base+step)};
}
export function sensitivityConfigErrors(s){
  const a=s.analysis,c=a?.sensitivity,errors=[];
  if(a?.mode!==undefined&&!['comparison','sensitivity','plans'].includes(a.mode))errors.push('分析の種類はcomparison・sensitivity・plansです。');
  if(c===undefined)return errors;
  if(!c||typeof c!=='object'||Array.isArray(c))return [...errors,'感度分析の設定はオブジェクトにしてください。'];
  if(!sensitivityMetrics(s).some(m=>m.id===c.metric))errors.push('感度分析の評価指標を選択してください。');
  if(!Array.isArray(c.candidates)||c.candidates.length>MAX_SENSITIVITY_CANDIDATES)return [...errors,'感度分析は最大32項目です。'];
  const allowed=new Set(sensitivityBindings(s).map(bindingKey)),seen=new Set();
  for(const b of c.candidates){
    const p=parameter(b?.parameter),key=bindingKey(b??{});
    if(!p||!allowed.has(key)){errors.push('感度分析の対象・性能が不在、無効、または試行のばらつきと重複しています。');continue;}
    if(seen.has(key))errors.push('感度分析の項目は重複できません。');seen.add(key);
    const valid=v=>Number.isFinite(v)&&v>=p.min&&v<=p.max&&(!p.integer||Number.isInteger(v));
    if(!valid(b.low)||!valid(b.high)||b.low>b.high)errors.push(p.label+': 小さい値・大きい値を範囲内で指定してください。');
  }
  return errors;
}
export function pruneSensitivity(s){
  const c=s.analysis?.sensitivity;if(!c)return;
  const allowed=new Set(sensitivityBindings(s).map(bindingKey));c.candidates=c.candidates.filter(b=>allowed.has(bindingKey(b)));
  if(!sensitivityMetrics(s).some(m=>m.id===c.metric)){
    const metric=sensitivityMetrics(s)[0]?.id;
    if(metric)c.metric=metric;else{delete s.analysis.sensitivity;delete s.analysis.mode;}
  }
}
