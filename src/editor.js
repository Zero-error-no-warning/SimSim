import {resolveValue} from './behavior-parameters.js?v=20261006-terrain-grid-17';
import { sharedAssignment } from './shared-settings.js?v=20261006-terrain-grid-17';
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
  const graph=s.behaviors?.find(g=>g.id===assignment?.behaviorId),initial=graph?.nodes.find(n=>n.id===graph.initial),navigationRoute=s.routes?.find(r=>r.id===resolveValue(initial?.routeId,graph,assignment)),points=navigationRoute?.points??assignment?.route;
  const navigationJoin=initial?.joinMode==='nearest';
  return points?.length?{
    ...d,assignment,navigationRoute,navigationJoin,unit:{...d.unit,initial:navigationJoin?d.unit.initial:points[0],route:navigationJoin?points:points.slice(1),routeMode:initial?.kind==='patrol'?'loop':navigationRoute?.mode??assignment?.routeMode??'once'}
  }:{...d,assignment};
}
export function removeWaypoint(s,id,index) {
  const d=editableDefinition(s,id);
  if(!d||index<0||index>=d.unit.route.length)throw Error('経由点が見つかりません。');
  const shared=d.navigationRoute?.points??d.assignment?.route;
  const route=shared?.length?shared:d.unit.route;
  if(d.assignment&&s.behaviors.find(g=>g.id===d.assignment.behaviorId)?.nodes.some(n=>n.kind==='patrol')&&route.length<=3)throw Error('周回経路は3点以上必要です。');
  route.splice(shared?.length?index+(d.navigationJoin?0:1):index,1);
}
export function addWaypoint(s,id,p) {
  const d=editableDefinition(s,id);
  const shared=d.navigationRoute?.points??d.assignment?.route;
  if(shared?.length)shared.push({
    ...p
  });
  else d.unit.route.push({
    ...p
  });
}
export function replaceRoute(s,id,path) {
  const d=editableDefinition(s,id);
  if(d.navigationRoute||d.assignment?.route?.length){
    if(d.navigationRoute){d.navigationRoute.points=[path.initial,...path.route];d.navigationRoute.mode=path.routeMode;}
    else{d.assignment.route=[path.initial,...path.route];d.assignment.routeMode=path.routeMode;}
    d.assignment.phase=0;
  }else {
    Object.assign(d.unit,path);
    d.unit.motion={
      ...d.unit.motion,loopStart:0
    };
  }
}
export function setPosition(s,id,key,value) {
  const d=editableDefinition(s,id);
  if(d.navigationJoin){d.unit.initial[key]=value;return;}
  const points=[d.unit.initial,...d.unit.route],delta=value-d.unit.initial[key];
  for(const p of points)p[key]+=delta;
}
export function pruneReferences(s) {
  if(s.measurements){
    s.measurements=s.measurements.filter(m=>{const a=s.behaviorAssignments?.find(a=>a.id===m.assignmentId),g=s.behaviors?.find(g=>g.id===a?.behaviorId);return g?.nodes.some(n=>n.id===m.nodeId);});
    for(const m of s.measurements)if(m.previousId&&!s.measurements.some(p=>p.id===m.previousId))delete m.previousId;
  }
  if(s.mission?.type==='state'){
    const a=s.behaviorAssignments?.find(a=>a.id===s.mission.assignmentId),g=s.behaviors?.find(g=>g.id===a?.behaviorId);
    if(!g?.nodes.some(n=>n.id===s.mission.nodeId))delete s.mission;
  }
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
  s.routes=[];s.destinations=[];
  s.behaviors=[];
  s.behaviorAssignments=[];
  delete s.mission;
  delete s.measurements;
  s.analysis={
    factors:[],uncertainties:[],trials:100,step:s.recording.step,requiredRate:.9
  };
}
export function moveDefinition(s,id,delta){
  const d=editableDefinition(s,id);
  if(!d)throw new Error('移動対象が見つかりません。');
  if(d.navigationJoin){d.unit.initial.x+=delta.x;d.unit.initial.y+=delta.y;return;}
  const a=sharedAssignment(s,id);
  const points=d.navigationRoute?.points??a?.route;
  if(points?.length)for(const p of points){
    p.x+=delta.x;
    p.y+=delta.y;
  }else translate(d.unit,delta);
}
export function editWaypoint(s,id,index,point){
  const d=editableDefinition(s,id);
  if(!d||index<0||index>=d.unit.route.length)throw new Error('経由点が見つかりません。');
  const shared=d.navigationRoute?.points??d.assignment?.route;
  if(shared?.length)shared[index+(d.navigationJoin?0:1)]={
    ...point
  };
  else d.unit.route[index]={
    ...point
  };
}
export function removeDefinition(s,id) {
  const d=definition(s,id);
  if(!d)return;
  if(!d.group&&s.destinations?.some(goal=>goal.kind==='unit'&&goal.unitId===id))throw Error('目的地として参照されています。目的地のユニットを変更してから削除してください。');
  if(!d.group&&(s.behaviors?.some(g=>g.parameters?.some(p=>p.type==='unit'&&p.default===id))||s.behaviorAssignments?.some(a=>s.behaviors?.find(g=>g.id===a.behaviorId)?.parameters?.some(p=>p.type==='unit'&&a.parameters?.[p.id]===id))))throw Error('担当値のユニットとして参照されています。参照先を変更してから削除してください。');
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
  if(s.mission&&s.mission.type!=='state'&&![...s.units,...(s.groups??[]).map(g=>g.template)].some(u=>u.faction===s.mission.targetFaction))delete s.mission;
  if(s.behaviorAssignments)s.behaviorAssignments=s.behaviorAssignments.map(a=>({
    ...a,targets:a.targets.filter(t=>t.startsWith('group:')?s.groups?.some(g=>g.id===t.slice(6)):s.units.some(u=>u.id===t.slice(5)))
  })).filter(a=>a.targets.length);
  pruneReferences(s);
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
