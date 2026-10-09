import {inspectRoute} from './route-planner.js?v=20261009-configuration-contract-28';
import {Terrain} from './terrain.js?v=20261009-configuration-contract-28';
import {expandGroups} from './random.js?v=20261009-configuration-contract-28';
import {resolveGraph} from './behavior-parameters.js?v=20261009-configuration-contract-28';
import {routeFor} from './navigation.js?v=20261009-configuration-contract-28';
// Inspect nominal, fixed routes. A moving destination or a future event join has
// no predetermined segment; the execution engine checks those as they execute.
export function scenarioRouteIssues(s){
  const terrain=new Terrain(s.terrain),issues=[],seen=new Set();
  const check=(points,profile,loop,label,unitId,routeId)=>{
    const key=JSON.stringify([points,profile,loop]);if(seen.has(key))return;seen.add(key);
    const result=inspectRoute(terrain,points,profile,{loop});
    for(const issue of result.issues)issues.push({...issue,label,unitId,routeId});
  };
  for(const r of s.routes??[])if(r.navigation)check(r.points,r.navigation,r.mode==='loop',r.name,null,r.id);
  for(const u of expandGroups(s)){
    if(u.enabled===false)continue;
    const a=s.behaviorAssignments?.find(a=>a.targets.includes('unit:'+u.id)||u.groupId&&a.targets.includes('group:'+u.groupId)),g=resolveGraph(s.behaviors?.find(g=>g.id===a?.behaviorId),a);
    const nodes=g?.nodes.filter(n=>['follow','patrol'].includes(n.kind))??[null];
    for(const n of nodes){
      const r=routeFor(s,a,n,u),resource=s.routes?.find(item=>item.id===r.id),profile={domain:u.domain,clearance:resource?.navigation?.clearance??u.navigation?.clearance??0};
      check(r.points,profile,r.mode==='loop',resource?.name??u.name,u.id,resource?.id);
      if(n?.id===g?.initial&&n?.joinMode==='nearest'&&r.points.length>1){
        const initial=terrain.project(u.initial,u.domain).point;let nearest=null,best=Infinity;
        for(let i=1;i<r.points.length+(r.mode==='loop'?1:0);i++){
          const p=terrain.project(r.points[i-1],u.domain).point,q=terrain.project(r.points[i%r.points.length],u.domain).point,d={x:q.x-p.x,y:q.y-p.y,z:q.z-p.z},length=d.x*d.x+d.y*d.y+d.z*d.z,f=length?Math.max(0,Math.min(1,((initial.x-p.x)*d.x+(initial.y-p.y)*d.y+(initial.z-p.z)*d.z)/length)):0,at={x:p.x+d.x*f,y:p.y+d.y*f,z:p.z+d.z*f},distance=Math.hypot(initial.x-at.x,initial.y-at.y,initial.z-at.z);
          if(distance<best){best=distance;nearest=at;}
        }
        if(nearest)check([initial,nearest],profile,false,u.name+'：初期位置から経路への接続',u.id,resource?.id);
      }
    }
  }
  return issues;
}
