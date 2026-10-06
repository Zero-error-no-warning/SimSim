import {StateTracker,stateMembers,validateStateResult} from './state-measurement.js?v=20261006-four-panes-16';

// Additional state goals are independent of the mission's success condition.
export function measurementErrors(s){
  if(s.measurements===undefined)return [];
  if(!Array.isArray(s.measurements)||s.measurements.length>12)return ['measurementsは最大12件の配列にしてください。'];
  const errors=[],seen=new Set();
  for(const m of s.measurements){
    if(!m||typeof m!=='object'){errors.push('計測点はオブジェクトにしてください。');continue;}
    const a=s.behaviorAssignments?.find(a=>a.id===m.assignmentId),g=s.behaviors?.find(g=>g.id===a?.behaviorId);
    if(typeof m.id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(m.id)||seen.has(m.id))errors.push('計測点のidは重複しない英数字・_・-（64文字以内）です。');
    if(typeof m.name!=='string'||!m.name.trim()||m.name.length>120)errors.push('計測点のnameは1～120文字です。');
    if(m.type!=='state'||!g?.nodes?.some(n=>n.id===m.nodeId))errors.push('計測点のtypeはstate、assignmentId・nodeIdは存在するタスク・状態を指定してください。');
    if(!['any','all','count'].includes(m.join)||m.join==='count'&&(!Number.isInteger(m.requiredCount)||m.requiredCount<1||m.requiredCount>2000))errors.push('計測点のjoinはany・all・count、requiredCountは1～2000です。');
    if(!Number.isFinite(m.deadline)||m.deadline<=0||m.deadline>s.duration)errors.push('計測点のdeadlineは0より大きく終了時刻以下にしてください。');
    if(m.previousId!==undefined&&!seen.has(m.previousId))errors.push('所要時間の基準previousIdには、この計測点より前に登録した計測点を指定してください。');
    seen.add(m.id);
  }
  return errors;
}
export function measurePoints(s,events,time=s.duration){
  return (s.measurements??[]).map(m=>({id:m.id,...new StateTracker({...m,deadline:Math.min(time,m.deadline)},stateMembers(s,m)).update(events)}));
}
export function validateMeasurements(s,results){
  if(!(s.measurements?.length))return;
  if(!Array.isArray(results)||results.length!==s.measurements.length)throw Error('計測点の結果数が一致しません。');
  for(const [i,m] of s.measurements.entries()){
    if(results[i]?.id!==m.id)throw Error('計測点の結果IDが一致しません。');
    validateStateResult({...s,mission:m},results[i]);
  }
}
export const median=values=>{
  const a=values.slice().sort((a,b)=>a-b),n=a.length;
  return n?(n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2):null;
};
export function summarizeMeasurements(s,trials){
  return (s.measurements??[]).map(m=>{
    const results=trials.map(t=>t.measurements?.find(r=>r.id===m.id)),successes=results.filter(r=>r?.success);
    const eligible=m.previousId?trials.filter(t=>t.measurements?.find(r=>r.id===m.previousId)?.success):trials;
    const ordered=eligible.filter(t=>{const r=t.measurements?.find(r=>r.id===m.id),p=t.measurements?.find(r=>r.id===m.previousId);return r?.success&&(!p||r.successTime>=p.successTime);});
    const durations=ordered.map(t=>t.measurements.find(r=>r.id===m.id).successTime-(m.previousId?t.measurements.find(r=>r.id===m.previousId).successTime:0));
    return {id:m.id,total:trials.length,successes:successes.length,rate:trials.length?successes.length/trials.length:null,medianTime:median(successes.map(r=>r.successTime)),eligible:eligible.length,ordered:ordered.length,conditionalRate:eligible.length?ordered.length/eligible.length:null,medianDuration:median(durations),outOfOrder:eligible.filter(t=>{const r=t.measurements?.find(r=>r.id===m.id),p=t.measurements?.find(r=>r.id===m.previousId);return p?.success&&r?.success&&r.successTime<p.successTime;}).length};
  });
}
