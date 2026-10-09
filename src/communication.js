import {random01,streamKey} from './random.js?v=20261009-authoring-display-27';
import {propagationVisible,propagationSpeed,mediumCompatible} from './propagation.js?v=20261009-authoring-display-27';
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
 const errors=[],ids=new Set(s.units?.map?.(u=>u?.id)??[]),number=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
 const check=c=>{
  if(c.medium!==undefined&&!['ideal','rf','optical','acoustic','satellite'].includes(c.medium))errors.push('通信・探知媒体はideal/rf/optical/acoustic/satelliteです。');
  for(const [k,min,max] of [['mountHeight',0,10000],['earthFactor',.5,2],['propagationSpeed',1,299792458],['windowSeconds',.1,86400],['outageProbability',0,1]])if(c[k]!==undefined&&!number(c[k],min,max))errors.push('通信・探知の'+k+'が不正です。');
  if(c.failureModel!==undefined&&!['independent','trial','window'].includes(c.failureModel))errors.push('通信障害モデルはindependent/trial/windowです。');
 };
 for(const u of [...(s.units??[]),...(s.groups??[]).map(g=>g.template)]){if(u?.communication)check(u.communication);if(u?.sensor)check(u.sensor);
  if(u?.periodicReports!==undefined&&(!Array.isArray(u.periodicReports)||u.periodicReports.length>8||u.periodicReports.some(r=>!r||!['observation','status'].includes(r.messageKind)||!Array.isArray(r.receiverIds)||r.receiverIds.length>32||r.receiverIds.some(id=>!ids.has(id))||!number(r.interval,.1,86400))))errors.push('周期報告は観測または状態、受信先と正の周期を指定してください。');
  if(u?.statusReports!==undefined&&(!Array.isArray(u.statusReports.receiverIds)||u.statusReports.receiverIds.length>32||u.statusReports.receiverIds.some(id=>!ids.has(id))||!number(u.statusReports.interval,.1,86400)))errors.push('定期状態報告の受信先・周期が不正です。');
 }
 if(s.communicationLinks!==undefined){const seen=new Set();if(!Array.isArray(s.communicationLinks)||s.communicationLinks.length>256)errors.push('通信リンクは最大256件です。');else for(const l of s.communicationLinks){if(!l||!ids.has(l.senderId)||!ids.has(l.receiverId)||typeof l.id!=='string'||seen.has(l.id)||typeof l.enabled!=='boolean'||!number(l.range,.001,100000)||!number(l.delay,0,86400)||!number(l.probability,0,1)||typeof l.terrainLOS!=='boolean')errors.push('通信リンクのID・端点・能力が不正です。');if(l){seen.add(l.id);check(l);}}}
 if(s.communicationDisruptions!==undefined){if(!Array.isArray(s.communicationDisruptions)||s.communicationDisruptions.length>256)errors.push('通信障害は最大256件です。');else for(const d of s.communicationDisruptions){if(!d||!number(d.start,0,s.duration)||!number(d.end,0,s.duration)||d.end<=d.start||d.available!==undefined&&typeof d.available!=='boolean'||d.probabilityMultiplier!==undefined&&!number(d.probabilityMultiplier,0,1)||d.delayAdded!==undefined&&!number(d.delayAdded,0,86400)||d.linkIds!==undefined&&(!Array.isArray(d.linkIds)||d.linkIds.some(id=>!s.communicationLinks?.some(l=>l.id===id))))errors.push('通信障害の時間・対象・効果が不正です。');if(d)check(d);}}
 if(s.operationalEvents!==undefined){if(!Array.isArray(s.operationalEvents)||s.operationalEvents.length>2000)errors.push('稼働状態の外部事象は最大2000件です。');else for(const e of s.operationalEvents)if(!e||!ids.has(e.unitId)||!number(e.time,0,s.duration)||typeof e.operational!=='boolean')errors.push('稼働状態の対象・時刻・状態が不正です。');}
 for(const a of s.behaviorAssignments??[]){if(a.coordination!==undefined&&!['ideal','reported'].includes(a.coordination))errors.push('協調方式はideal/reportedです。');if(a.reportMaxAge!==undefined&&!number(a.reportMaxAge,0,86400)||a.missingReport!==undefined&&!['cruise','stop'].includes(a.missingReport))errors.push('報告鮮度・欠落時の動作が不正です。');}
 const advanced=s.communicationLinks!==undefined||s.communicationDisruptions!==undefined||s.operationalEvents!==undefined||s.units?.some?.(u=>u.statusReports||u.periodicReports||u.communication?.medium||u.sensor?.medium)||s.behaviorAssignments?.some?.(a=>a.coordination);
 if(s.version<4&&advanced)errors.push('媒体・障害・状態報告はversion 4を使用してください。');
 return errors;
}

export const periodicReports=u=>[...(u.statusReports?[{...u.statusReports,messageKind:'status'}]:[]),...(u.periodicReports??[])];
