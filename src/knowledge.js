// Knowledge is local to an owner. Entity matching is an explicit perfect-ID
// approximation; decision expressions receive observations, never world state.
export const restrictedInformation=s=>s.version>=4&&s.modelAssumptions?.information!=='legacy';
const copy=v=>JSON.parse(JSON.stringify(v));
export function createKnowledge(unit,scenario){
  const k={contacts:{},friendlyReports:{},commands:[]};
  for(const item of scenario.initialInformation??[])if(item.ownerId===unit.id)rememberInformation(k,item.observation,0);
  return k;
}
export function rememberInformation(k,o,receivedAt=o.time??0){
  if(!o)return false;
  if(o.messageKind==='status'&&o.subjectId){
    const old=k.friendlyReports[o.subjectId],observedAt=o.observationTime??o.time??receivedAt;
    if(old&&old.observedAt>observedAt)return false;
    k.friendlyReports[o.subjectId]={subjectId:o.subjectId,reportedState:o.reportedState,position:o.targetPosition?copy(o.targetPosition):undefined,observedAt,receivedAt,originObserverId:o.originObserverId??o.senderId};return true;
  }
  if(!o.targetId||!o.targetPosition)return false;
  const observedAt=o.observationTime??o.sampleTime??o.time??receivedAt,old=k.contacts[o.targetId];
  if(old&&old.observedAt>observedAt)return false;
  k.contacts[o.targetId]={trackId:old?.trackId??'track-'+(Object.keys(k.contacts).length+1),position:copy(o.targetPosition),observedAt,receivedAt,originObserverId:o.originObserverId??o.observerId??o.senderId,positionErrorRadius:o.positionErrorRadius??0,identity:{class:o.targetClass??'unknown',confidence:o.confidence??1}};
  return true;
}
export function selectedContact(s,selector={},time=0){
  const items=Object.entries(s.knowledge.contacts).map(([entityId,o])=>({...o,entityId,age:Math.max(0,time-o.observedAt)})).filter(o=>!selector.class||o.identity.class===selector.class);
  if(selector.trackId)return items.find(o=>o.trackId===selector.trackId)??null;
  items.sort((a,b)=>selector.order==='nearest'?Math.hypot(a.position.x-s.position.x,a.position.y-s.position.y,a.position.z-s.position.z)-Math.hypot(b.position.x-s.position.x,b.position.y-s.position.y,b.position.z-s.position.z)||a.trackId.localeCompare(b.trackId):b.observedAt-a.observedAt||a.trackId.localeCompare(b.trackId));
  return items[0]??null;
}
export function knownPosition(s,id){return s.knowledge.contacts[id]?.position??s.knowledge.friendlyReports[id]?.position??null;}
export function knowledgeAt(scenario,ownerId,events,time){
  const unit=scenario.units.find(u=>u.id===ownerId)??{id:ownerId},k=createKnowledge(unit,scenario);
  for(const e of events??[])if(e.unitId===ownerId&&e.time<=time){
    if(e.messageKind==='command')k.commands.push(copy(e));else rememberInformation(k,e,e.time);
  }
  return k;
}
