import {stateField} from './state-contract.js?v=20261009-map-workspace-29';
import {conditionKey} from './navigation.js?v=20261009-map-workspace-29';
import {selectedContact} from './knowledge.js?v=20261009-map-workspace-29';
export const UNKNOWN=null;
const operators={lt:(a,b)=>a<b,lte:(a,b)=>a<=b,gt:(a,b)=>a>b,gte:(a,b)=>a>=b,eq:(a,b)=>a===b,neq:(a,b)=>a!==b};
export function conditionErrors(c,depth=0){
  if(!c||typeof c!=='object'||Array.isArray(c)||depth>8)return ['判断条件は深さ8以下のオブジェクトにしてください。'];
  if(c.all||c.any){const items=c.all??c.any;if(c.all&&c.any||!Array.isArray(items)||!items.length||items.length>16)return ['判断条件のall・anyは1～16件のどちらか一方です。'];return items.flatMap(x=>conditionErrors(x,depth+1));}
  const definition=typeof c.field==='string'?stateField(c.field):null;if(!definition)return ['判断条件はself・knowledge・clockの公開フィールドを指定してください。'];
  if(!['exists',...Object.keys(operators)].includes(c.op))return ['判断条件の比較演算子が不正です。'];
  const type=definition.type;
  if(c.op!=='exists'&&(typeof c.value!==type||!['eq','neq'].includes(c.op)&&type!=='number')||typeof c.value==='number'&&!Number.isFinite(c.value))return ['判断条件の比較値はフィールドの型に合わせてください。順序比較は数値のみです。'];
  return [];
}
export function decisionContext(s,time,selector){
  const contact=selectedContact(s,selector,time);if(contact)delete contact.entityId;
  const resources=Object.fromEntries(Object.entries(s.resources??{}).map(([id,r])=>[id,{remaining:r.remaining,fraction:r.capacity?r.remaining/r.capacity:0}]));
  return {clock:time,self:{status:s.status,operational:s.operational!==false,resources},knowledge:{selectedContact:contact,friendlyReports:Object.fromEntries(Object.entries(s.knowledge.friendlyReports).map(([id,r])=>[id,{...r,age:Math.max(0,time-r.observedAt)}]))}};
}
export function evaluateCondition(c,context){
  if(c.all){const v=c.all.map(x=>evaluateCondition(x,context));return v.includes(false)?false:v.every(x=>x===true)?true:UNKNOWN;}
  if(c.any){const v=c.any.map(x=>evaluateCondition(x,context));return v.includes(true)?true:v.every(x=>x===false)?false:UNKNOWN;}
  const value=c.field.split('.').reduce((o,k)=>o?.[k],context);
  if(c.op==='exists')return value!==undefined&&value!==null;
  if(value===undefined||value===null)return UNKNOWN;
  if(typeof value!==typeof c.value)return UNKNOWN;
  return operators[c.op](value,c.value);
}
export function chooseDecision(s,time){
  const edges=(s.graph?.edges??[]).filter(e=>e.from===s.node?.id&&e.when==='condition'&&!(e.once&&s.fired.has(s.unit.id+'|'+e.from+'|'+conditionKey(e)))).sort((a,b)=>(b.priority??0)-(a.priority??0)||a.to.localeCompare(b.to));
  for(const edge of edges){const context=decisionContext(s,time,edge.selector),value=evaluateCondition(edge.condition,context);if(value===true||value===UNKNOWN&&edge.onUnknown===true)return {edge,value,context};}
  return null;
}
