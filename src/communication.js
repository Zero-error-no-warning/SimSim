import {fieldErrors} from './configuration-schema.js?v=20261009-configuration-contract-28';
import {PROPAGATION_FIELDS,REPORT_FIELDS,LINK_FIELDS,DISRUPTION_FIELDS,OPERATIONAL_FIELDS,COORDINATION_FIELDS} from './configuration-fields.js?v=20261009-configuration-contract-28';
import {random01,streamKey} from './random.js?v=20261009-configuration-contract-28';
import {propagationVisible,propagationSpeed,mediumCompatible} from './propagation.js?v=20261009-configuration-contract-28';
const within=(d,t)=>t>=d.start&&t<d.end;
export function transmissionAttempts(model,s,receiver,t,messageId){
 const configured=model.source.communicationLinks;
 const links=configured?configured.filter(l=>l.senderId===s.unit.id&&l.receiverId===receiver?.unit.id):[{id:s.unit.id+'-'+receiver?.unit.id,...s.unit.communication}];
 if(!links.length)return [{reason:'リンク未設定'}];
 return links.map(link=>{
  const c={...s.unit.communication,...link},medium=c.medium??'ideal',a={...s.position,z:s.position.z+(c.mountHeight??0)},b=receiver?{...receiver.position,z:receiver.position.z+(receiver.unit.communication?.mountHeight??0)}:a,distance=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
  let reason=null,multiplier=1,delay=c.delay??0;
  if(!s.operational||!c.enabled)reason='送信装置停止';
  else if(!receiver||!receiver.operational||receiver.unit.communication?.enabled===false)reason='受信装置停止';
  else if(distance>c.range)reason='通信範囲外';
  else if(!mediumCompatible(medium,a,b,model.terrain.data.seaLevel))reason='媒体の使用領域外';
  else if(!propagationVisible(model.terrain,a,b,c))reason='地形・地球曲率による遮蔽';
  for(const d of model.source.communicationDisruptions??[])if(within(d,t)&&(!d.medium||d.medium===medium)&&(!d.linkIds||d.linkIds.includes(link.id))){if(d.available===false)reason='継続通信障害';multiplier*=d.probabilityMultiplier??1;delay+=d.delayAdded??0;}
  const key=streamKey(model.source,link.id,'communication-v4'),window=Math.floor(t/(c.windowSeconds??60));
  if(c.failureModel==='trial'&&random01(key+'|trial')<(c.outageProbability??0)||c.failureModel==='window'&&random01(key+'|window|'+window)<(c.outageProbability??0))reason='継続通信障害';
  const arrives=!reason&&random01(key+'|message|'+messageId)<(c.probability??1)*multiplier;
  // A receiver's state and the physical path are not known without acknowledgement.
  const localReason=!s.operational||!c.enabled?'送信装置停止':null;
  return {linkId:link.id,medium,reason:localReason,deliveryReason:reason,arrives,delay:delay+(medium==='ideal'?0:distance/(c.propagationSpeed??propagationSpeed(medium))),distance};
 });
}
export function communicationErrors(s){
 const errors=[],context={scenario:s},check=(fields,r)=>errors.push(...fieldErrors(fields,r,context));
 for(const u of [...(s.units??[]),...(s.groups??[]).map(g=>g.template)]){
  if(u?.communication)check(PROPAGATION_FIELDS,u.communication);if(u?.sensor)check(PROPAGATION_FIELDS,u.sensor);
  if(u?.periodicReports!==undefined){if(!Array.isArray(u.periodicReports)||u.periodicReports.length>8)errors.push('周期報告は最大8件です。');else for(const r of u.periodicReports)check(REPORT_FIELDS,r);}
  if(u?.statusReports!==undefined)check(REPORT_FIELDS.filter(f=>f.path!=='messageKind'),u.statusReports);
 }
 if(s.communicationLinks!==undefined){const seen=new Set();if(!Array.isArray(s.communicationLinks)||s.communicationLinks.length>256)errors.push('通信リンクは最大256件です。');else for(const l of s.communicationLinks){check(LINK_FIELDS.map(f=>f.path==='id'?{...f,pattern:undefined,maxLength:undefined,required:false}:f),l);if(typeof l?.id!=='string'||seen.has(l.id))errors.push('通信リンクのIDは重複しない文字列です。');seen.add(l?.id);}}
 if(s.communicationDisruptions!==undefined){if(!Array.isArray(s.communicationDisruptions)||s.communicationDisruptions.length>256)errors.push('通信障害は最大256件です。');else for(const d of s.communicationDisruptions){check(DISRUPTION_FIELDS,d);if(d?.end<=d?.start)errors.push('通信障害の終了は開始より後にしてください。');if(d)check(PROPAGATION_FIELDS,d);}}
 if(s.operationalEvents!==undefined){if(!Array.isArray(s.operationalEvents)||s.operationalEvents.length>2000)errors.push('稼働状態の外部事象は最大2000件です。');else for(const e of s.operationalEvents)check(OPERATIONAL_FIELDS,e);}
 for(const a of s.behaviorAssignments??[])check(COORDINATION_FIELDS,a);
 const advanced=s.communicationLinks!==undefined||s.communicationDisruptions!==undefined||s.operationalEvents!==undefined||s.units?.some?.(u=>u.statusReports||u.periodicReports||u.communication?.medium||u.sensor?.medium)||s.behaviorAssignments?.some?.(a=>a.coordination);
 if(s.version<4&&advanced)errors.push('媒体・障害・状態報告はversion 4を使用してください。');
 return errors;
}

export const periodicReports=u=>[...(u.statusReports?[{...u.statusReports,messageKind:'status'}]:[]),...(u.periodicReports??[])];
