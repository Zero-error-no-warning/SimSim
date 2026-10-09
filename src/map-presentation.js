import {sharedAssignment} from './shared-settings.js?v=20261009-select-state-30';
import {routeFor,destinationFor} from './navigation.js?v=20261009-select-state-30';
import {aggregateTasks} from './resources.js?v=20261009-select-state-30';
const center=points=>({x:points.reduce((n,p)=>n+p.x,0)/points.length,y:points.reduce((n,p)=>n+p.y,0)/points.length,z:points.reduce((n,p)=>n+p.z,0)/points.length});
export function taskPresentations(source,snapshot){
 const units=new Map(source.units.map(u=>[u.id,u])),graphs=new Map(source.behaviors.map(g=>[g.id,g]));
 const states=snapshot.units.map(state=>{const unit=units.get(state.id),assignment=sharedAssignment(source,state.id),graph=graphs.get(assignment?.behaviorId);return {...state,unit,assignment,node:graph?.nodes.find(n=>n.id===(state.nodeId??graph.initial)),operational:state.operational??unit?.enabled!==false};});
 return aggregateTasks(source,states).map(task=>{
  const members=states.filter(s=>s.assignment?.id===task.id),assignment=source.behaviorAssignments.find(a=>a.id===task.id),graph=source.behaviors.find(g=>g.id===assignment.behaviorId),paths=new Map();
  for(const member of members)for(const node of graph?.nodes??[]){
   if(['follow','patrol'].includes(node.kind)){const route=routeFor(source,assignment,node,member.unit),points=route.mode==='loop'?[...route.points,route.points[0]]:route.points;if(points.length>1)paths.set(JSON.stringify(points),points);}
   if(node.id===member.node?.id&&node.kind==='move'){const d=destinationFor(source,assignment,node);if(d?.kind==='point')paths.set(JSON.stringify([member.position,d.point]),[member.position,d.point]);}
  }
  const resourceCapacity=Object.fromEntries([...new Set(members.flatMap(m=>Object.keys(m.resources??{})))].map(id=>[id,members.reduce((n,m)=>n+(m.resources?.[id]?.capacity??0),0)]));
  return {...task,memberIds:members.map(m=>m.id),position:members.length?center(members.map(m=>m.position)):null,faction:members[0]?.unit?.faction??'friendly',paths:[...paths.values()],resourceCapacity};
 });
}
