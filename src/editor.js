import { sharedAssignment } from './shared-settings.js?v=20261005-worker-wait-2';
// All UI paths resolve the same editable route. Distances in metres.
export function definition(s,id) {
  const unit=s.units.find(u=>u.id===id);
  if(unit)return {
    unit
  };
  const group=s.groups?.find(g=>id?.slice(0,id.lastIndexOf('__'))===g.id);
  return group?{
    unit:group.template,group
  }
  :null;
}
export function translate(entity,delta) {
  for(const p of [entity.initial,...entity.route]){
    p.x+=delta.x;
    p.y+=delta.y;
  }
}
export function editableDefinition(s,id) {
  let d=definition(s,id);
  if(!d)return null;
  if(d.unit.groupId){
    const group=s.groups?.find(g=>g.id===d.unit.groupId);
    if(group)d={
      unit:group.template,group
    };
  }
  const assignment=sharedAssignment(s,id);
  return assignment?.route?.length?{
    ...d,assignment,unit:{
      ...d.unit,initial:assignment.route[0],route:assignment.route.slice(1),routeMode:s.behaviors.find(g=>g.id===assignment.behaviorId)?.nodes.some(n=>n.kind==='patrol')?'loop':assignment.routeMode??'once'
    }
  }
  :{
    ...d,assignment
  };
}
export function removeWaypoint(s,id,index) {
  const d=editableDefinition(s,id);
  if(!d||index<0||index>=d.unit.route.length)throw Error('経由点が見つかりません。');
  const route=d.assignment?.route?.length?d.assignment.route:d.unit.route;
  if(d.assignment&&s.behaviors.find(g=>g.id===d.assignment.behaviorId)?.nodes.some(n=>n.kind==='patrol')&&route.length<=3)throw Error('周回経路は3点以上必要です。');
  route.splice(d.assignment?.route?.length?index+1:index,1);
}
export function addWaypoint(s,id,p) {
  const d=editableDefinition(s,id);
  if(d.assignment?.route?.length)d.assignment.route.push({
    ...p
  });
  else d.unit.route.push({
    ...p
  });
}
export function replaceRoute(s,id,path) {
  const d=editableDefinition(s,id);
  if(d.assignment?.route?.length){
    d.assignment.route=[path.initial,...path.route];
    d.assignment.routeMode=path.routeMode;
    d.assignment.phase=0;
  }else {
    Object.assign(d.unit,path);
    d.unit.motion={
      ...d.unit.motion,loopStart:0
    };
  }
}
export function setPosition(s,id,key,value) {
  const d=editableDefinition(s,id),points=[d.unit.initial,...d.unit.route],delta=value-d.unit.initial[key];
  for(const p of points)p[key]+=delta;
}
export function pruneReferences(s) {
  for(const key of ['factors','uncertainties'])if(s.analysis?.[key])s.analysis[key]=s.analysis[key].filter(b=>b.target==='scenario'?!!s.mission:b.target.startsWith('assignment:')?s.behaviorAssignments?.some(a=>a.id===b.target.slice(11)):b.target.startsWith('group:')?s.groups?.some(g=>g.id===b.target.slice(6)):s.units.some(u=>u.id===b.target.slice(5)));
}
export function removeAssignment(s,id) {
  s.behaviorAssignments=s.behaviorAssignments.filter(a=>a.id!==id);
  pruneReferences(s);
}
export function removeBehavior(s,id) {
  s.behaviors=s.behaviors.filter(g=>g.id!==id);
  s.behaviorAssignments=s.behaviorAssignments.filter(a=>a.behaviorId!==id);
  pruneReferences(s);
}
export function newScenario(s) {
  s.title='新しいシナリオ';
  s.units=[];
  s.groups=[];
  s.behaviors=[];
  s.behaviorAssignments=[];
  delete s.mission;
  s.analysis={
    factors:[],uncertainties:[],trials:100,step:s.recording.step,requiredRate:.9
  };
}
export function moveDefinition(s,id,delta){
  const d=definition(s,id);
  if(!d)throw new Error('移動対象が見つかりません。');
  const a=sharedAssignment(s,id);
  if(a?.route?.length)for(const p of a.route){
    p.x+=delta.x;
    p.y+=delta.y;
  }else translate(d.unit,delta);
}
export function editWaypoint(s,id,index,point){
  const d=editableDefinition(s,id);
  if(!d||index<0||index>=d.unit.route.length)throw new Error('経由点が見つかりません。');
  if(d.assignment?.route?.length)d.assignment.route[index+1]={
    ...point
  };
  else d.unit.route[index]={
    ...point
  };
}
export function removeDefinition(s,id) {
  const d=definition(s,id);
  if(!d)return;
  if(!d.group&&(s.behaviors?.some(g=>g.nodes.some(n=>n.receiverId===id))||s.behaviorAssignments?.some(a=>a.receiverId===id)))throw Error('報告先として参照されています。タスク・報告ノードの宛先を変更してから削除してください。');
  if(d.group)s.groups=s.groups.filter(g=>g.id!==d.group.id);
  else s.units=s.units.filter(u=>u.id!==id);
  const present=new Set(s.units.map(u=>u.id));
  for(const g of s.groups??[])for(let n=1;n<=g.count;n++)present.add(g.id+'__'+n);
  for(const u of [...s.units,...(s.groups??[]).map(g=>g.template)])if(u.behavior)u.behavior.rules=u.behavior.rules.filter(r=>r.action!=='send'||s.units.some(v=>v.id===r.receiverId));
  if(s.mission?.targetIds){
    s.mission.targetIds=s.mission.targetIds.filter(id=>present.has(id));
    if(!s.mission.targetIds.length)delete s.mission;
  }
  if(s.mission?.responderIds){
    s.mission.responderIds=s.mission.responderIds.filter(id=>s.units.some(u=>u.id===id));
    if(!s.mission.responderIds.length)delete s.mission;
  }
  if(s.mission&&![...s.units,...(s.groups??[]).map(g=>g.template)].some(u=>u.faction===s.mission.targetFaction))delete s.mission;
  if(s.behaviorAssignments)s.behaviorAssignments=s.behaviorAssignments.map(a=>({
    ...a,targets:a.targets.filter(t=>t.startsWith('group:')?s.groups?.some(g=>g.id===t.slice(6)):s.units.some(u=>u.id===t.slice(5)))
  })).filter(a=>a.targets.length);
  if(s.analysis){
    if(s.analysis.groupId&&!s.groups?.some(g=>g.id===s.analysis.groupId)){
      delete s.analysis.groupId;
      delete s.analysis.counts;
    }
    for(const key of ['factors','uncertainties'])s.analysis[key]=s.analysis[key]?.filter(b=>b.target==='scenario'?!!s.mission:b.target.startsWith('assignment:')?s.behaviorAssignments?.some(a=>a.id===b.target.slice(11)):b.target.startsWith('group:')?s.groups?.some(g=>g.id===b.target.slice(6)):s.units.some(u=>u.id===b.target.slice(5)));
  }
}
export function circleRoute(center,edge,count=32){
  const radius=Math.hypot(edge.x-center.x,edge.y-center.y),angle=Math.atan2(edge.y-center.y,edge.x-center.x);
  if(radius<50||radius>50000)throw new Error('周回半径は50～50000mにしてください。');
  const points=Array.from({
    length:count
  },(_,i)=>({
    x:center.x+radius*Math.cos(angle+Math.PI*2*i/count),y:center.y+radius*Math.sin(angle+Math.PI*2*i/count),z:edge.z
  }));
  return {
    initial:points[0],route:points.slice(1),routeMode:'loop'
  };
}
