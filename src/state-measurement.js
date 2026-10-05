// A goal is first entry into a state. Leaving/re-entering never erases or adds entry.
export function stateGoalErrors(s){
  const m=s.mission;if(m?.type!=='state')return [];
  const a=s.behaviorAssignments?.find(a=>a.id===m.assignmentId),g=s.behaviors?.find(g=>g.id===a?.behaviorId);
  if(!a)return ['計測対象のタスクがありません。'];
  if(!g?.nodes?.some(n=>n.id===m.nodeId))return ['計測対象の状態を選択してください。'];
  return [];
}
export function stateMembers(s,m=s.mission){
  if(m?.type!=='state')return [];
  const a=s.behaviorAssignments?.find(a=>a.id===m.assignmentId),ids=[];
  for(const target of a?.targets??[]){
    if(target.startsWith('unit:')){const u=s.units.find(u=>u.id===target.slice(5));if(u&&u.enabled!==false)ids.push(u.id);}
    else{const g=s.groups?.find(g=>g.id===target.slice(6));if(g&&g.enabled!==false)for(let i=1;i<=g.count;i++)ids.push(g.id+'__'+i);}
  }
  return ids.sort();
}
export const stateNeeded=(m,count)=>m.join==='all'?count:m.join==='count'?m.requiredCount:1;
export function stateSummary(entries,m,count,time=m.deadline){
  const reached=entries.filter(e=>e.time<=Math.min(time,m.deadline)).sort((a,b)=>a.time-b.time||a.unitId.localeCompare(b.unitId)),needed=stateNeeded(m,count);
  return {stateTargetCount:count,stateReachedCount:reached.length,stateEntries:reached,success:count>0&&needed>0&&reached.length>=needed,successTime:count>0&&needed>0&&reached.length>=needed?reached[needed-1].time:null};
}
export class StateTracker{
  constructor(m,members){this.mission=m;this.members=new Set(members);this.first=new Map();this.cursor=0;}
  update(events){
    for(;this.cursor<events.length;this.cursor++){
      const e=events[this.cursor];
      if(['initialized','nodeChanged'].includes(e.type)&&e.nodeId===this.mission.nodeId&&e.time<=this.mission.deadline&&this.members.has(e.unitId)&&!this.first.has(e.unitId))this.first.set(e.unitId,e.time);
    }
    return stateSummary([...this.first].map(([unitId,time])=>({unitId,time})),this.mission,this.members.size);
  }
}
export function validateStateResult(s,result){
  const m=s.mission;if(m?.type!=='state')return;
  const members=new Set(stateMembers(s)),entries=result.stateEntries;
  if(result.stateTargetCount!==members.size||!Array.isArray(entries)||entries.length>members.size||new Set(entries.map(e=>e?.unitId)).size!==entries.length||entries.some(e=>!e||!members.has(e.unitId)||!Number.isFinite(e.time)||e.time<0||e.time>m.deadline))throw Error('状態到達の対象・初回到達時刻が不正です。');
  const expected=stateSummary(entries,m,members.size);
  if(result.stateReachedCount!==expected.stateReachedCount||result.success!==expected.success||result.successTime!==expected.successTime)throw Error('状態到達数・成立時刻と計測条件が一致していません。');
}
