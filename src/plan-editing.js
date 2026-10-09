import {capturePlan,applyPlan,planDifferences} from './plan-settings.js?v=20261009-information-analysis-26';
const copy=v=>JSON.parse(JSON.stringify(v));
export function planEditor(s){
  const c=s.analysis?.plans;
  if(c?.editor)return copy(c.editor);
  const current=capturePlan(s),matches=(c?.items??[]).filter(p=>!planDifferences(p.operation,current).length);
  return {activeId:(matches.find(p=>p.id===c.baselineId)??matches[0])?.id??'',drafts:[]};
}
export function retainPlanEdits(s){
  const c=s.analysis.plans,e=planEditor(s),id=e.activeId,p=c.items.find(p=>p.id===id),old=e.drafts.find(d=>d.id===id),operation=capturePlan(s);
  e.drafts=e.drafts.filter(d=>d.id!==id);
  if(!p||planDifferences(p.operation,operation).length)e.drafts.push({id,name:p?.name??old?.name??'未保存の案',operation});
  c.editor=e;return e;
}
export function switchPlan(s,id){
  const e=retainPlanEdits(s),c=s.analysis.plans,p=c.items.find(p=>p.id===id),draft=e.drafts.find(d=>d.id===id);
  if(id&&!p&&!draft)throw Error('切替先の運用案がありません。');
  const next=applyPlan(s,draft??p??{operation:capturePlan(s)});
  next.analysis.plans.editor.activeId=id;return next;
}
export function savePlan(s,name,{create=false}={}){
  const c=s.analysis.plans,e=retainPlanEdits(s),oldId=e.activeId;let p=!create&&c.items.find(p=>p.id===oldId);
  if(!p){
    if(c.items.length>=8)throw Error('運用案は最大8件です。');
    let i=1;while([...c.items,...e.drafts].some(p=>p.id==='plan-'+i))i++;
    p={id:'plan-'+i};c.items.push(p);c.baselineId||=p.id;
  }
  Object.assign(p,{name:name.trim(),operation:capturePlan(s)});e.activeId=p.id;
  e.drafts=e.drafts.filter(d=>d.id!==p.id&&(c.items.some(p=>p.id===oldId)||d.id!==oldId));
  return p;
}
export function deleteActivePlan(s){
  const c=s.analysis.plans,e=retainPlanEdits(s),p=c.items.find(p=>p.id===e.activeId);
  if(!p)throw Error('削除する運用案を選択してください。');
  // Keep the displayed operation as an unnamed editing buffer, even if another
  // unsaved buffer already exists. Deleting a saved comparison never drops edits.
  e.drafts=e.drafts.filter(d=>d.id!==p.id);e.drafts.push({id:p.id,name:p.name.slice(0,100)+'（保存済み案を削除）',operation:capturePlan(s)});
  c.items=c.items.filter(item=>item.id!==p.id);
  if(!c.items.some(p=>p.id===c.baselineId))c.baselineId=c.items[0]?.id??'';
}
export function planHasDraft(s,id){
  const e=planEditor(s),p=s.analysis?.plans?.items.find(p=>p.id===id);
  if(!p)return true;
  const operation=id===e.activeId?capturePlan(s):e.drafts.find(d=>d.id===id)?.operation;
  return !!operation&&planDifferences(p.operation,operation).length>0;
}
