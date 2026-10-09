import {sensitivityMetrics} from './sensitivity-settings.js?v=20261009-authoring-display-27';
export const PLAN_FIELDS=['units','groups','behaviors','behaviorAssignments','routes','destinations'];
const copy=v=>JSON.parse(JSON.stringify(v));
export function capturePlan(s){return Object.fromEntries(PLAN_FIELDS.map(k=>[k,copy(s[k]??[])]));}
export function applyPlan(s,plan){return {...copy(s),...copy(plan.operation)};}
export function planConfigErrors(s){
  const c=s.analysis?.plans;if(c===undefined)return [];
  if(!c||typeof c!=='object'||Array.isArray(c))return ['運用案の設定はオブジェクトにしてください。'];
  const errors=[];
  if(typeof c.metric!=='string')errors.push('運用案の評価指標を選択してください。');
  // Deleted measurements can be replaced in the editor; execution requires a valid metric.
  if(!Array.isArray(c.items)||c.items.length>8)return [...errors,'運用案は最大8件です。'];
  const ids=new Set();
  for(const p of c.items){
    if(!p||typeof p.id!=='string'||! /^[A-Za-z0-9_-]{1,80}$/.test(p.id)||ids.has(p.id))errors.push('運用案IDは重複しない英数字・_・-にしてください。');
    ids.add(p?.id);
    if(typeof p?.name!=='string'||!p.name.trim()||p.name.length>120)errors.push('運用案名は1～120文字にしてください。');
    if(!p?.operation||typeof p.operation!=='object'||Array.isArray(p.operation)||Object.keys(p.operation).some(k=>!PLAN_FIELDS.includes(k))||PLAN_FIELDS.some(k=>!Array.isArray(p.operation[k])))errors.push('運用案には配置・経路・挙動の配列を保存してください。');
  }
  const e=c.editor;
  if(e!==undefined){
    const validId=id=>typeof id==='string'&&(id===''||/^[A-Za-z0-9_-]{1,80}$/.test(id));
    if(!e||typeof e!=='object'||Array.isArray(e)||!validId(e.activeId)||!Array.isArray(e.drafts)||e.drafts.length>16)errors.push('運用案の編集保持は有効な案IDと最大16件の配列にしてください。');
    else{
      const draftIds=new Set();
      for(const d of e.drafts){
        if(!d||!validId(d.id)||draftIds.has(d.id)||typeof d.name!=='string'||!d.name.trim()||d.name.length>120)errors.push('保持する運用案のID・名前が不正です。');
        draftIds.add(d?.id);
        if(!d?.operation||typeof d.operation!=='object'||Array.isArray(d.operation)||Object.keys(d.operation).some(k=>!PLAN_FIELDS.includes(k))||PLAN_FIELDS.some(k=>!Array.isArray(d.operation[k])))errors.push('編集中の運用案には配置・経路・挙動の配列を保持してください。');
      }
      if(e.activeId&&!ids.has(e.activeId)&&!draftIds.has(e.activeId))errors.push('編集中の運用案がありません。');
    }
  }
  if(c.items.length&&!ids.has(c.baselineId))errors.push('基準となる運用案を選択してください。');
  return errors;
}
export function planDifferences(base,operation){
  const labels={units:'単体の配置・能力・経路',groups:'群の配置・個数・能力',behaviors:'挙動・報告間隔',behaviorAssignments:'担当・共有設定',routes:'共有経路',destinations:'目的地'};
  return PLAN_FIELDS.filter(k=>JSON.stringify(base[k])!==JSON.stringify(operation[k])).map(k=>labels[k]);
}
export function planMetric(s){return sensitivityMetrics(s).find(m=>m.id===s.analysis?.plans?.metric);}
