// Named navigation resources, shared by state nodes and proximity conditions.
export function routeFor(s,a,n,u){
  const route=n?.routeId?s.routes?.find(r=>r.id===n.routeId):null;
  return {id:route?.id??'default',points:route?.points??a?.route??[u.initial,...u.route],mode:n?.kind==='patrol'?'loop':route?.mode??a?.routeMode??u.routeMode};
}
export function destinationFor(s,a,n){
  return n?.destinationId?s.destinations?.find(d=>d.id===n.destinationId):a?.base?{kind:'point',point:a.base}:null;
}
export function conditionKey(c){
  const event=c.when??c.event;
  return event==='near'?[event,c.destinationId,c.distance,c.distanceMode??'absolute'].join('|'):event==='time'?event+'|'+c.seconds:event;
}
export const measuredDistance=(a,b,mode='absolute')=>Math.hypot(a.x-b.x,a.y-b.y,mode==='horizontal'?0:a.z-b.z);
export function navigationErrors(s){
  const errors=[],number=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
  const point=p=>p&&['x','y','z'].every(k=>number(p[k],-1000000,1000000));
  for(const [key,max] of [['routes',128],['destinations',256]]){
    const list=s[key]??[],ids=new Set();
    if(!Array.isArray(list)||list.length>max){errors.push(key==='routes'?'経路は最大128件の配列です。':'目的地は最大256件の配列です。');continue;}
    for(const item of list){
      if(!item||!/^[a-zA-Z0-9_-]{1,80}$/.test(item.id??'')||ids.has(item.id)||typeof item.name!=='string'||!item.name.trim()||item.name.length>120){errors.push('経路・目的地のIDまたは名前が不正・重複しています。');continue;}
      ids.add(item.id);
      if(key==='routes'){
        if(!Array.isArray(item.points)||item.points.length<2||item.points.length>500||item.points.some(p=>!point(p)))errors.push('経路は2～500点の座標で指定してください。');
        if(!['once','loop','pingpong'].includes(item.mode??'once'))errors.push('経路の繰り返し方式が不正です。');
      }else if(item.kind==='point'){
        if(!point(item.point))errors.push('目的地の地点座標が不正です。');
      }else if(item.kind==='unit'){
        if(!s.units?.some(u=>u.id===item.unitId))errors.push('目的地のユニットがありません。');
      }else errors.push('目的地は地点またはユニットを指定してください。');
    }
  }
  return errors;
}
export function proximityErrors(s,c){
  const errors=[];
  if(!Array.isArray(s.destinations)||!s.destinations.some(d=>d?.id===c.destinationId))errors.push('接近条件の目的地を選択してください。');
  if(!Number.isFinite(c.distance)||c.distance<0||c.distance>1000000)errors.push('接近距離は0～1000000mです。');
  if(!['horizontal','absolute'].includes(c.distanceMode??'absolute'))errors.push('距離の種類は水平距離または絶対距離です。');
  return errors;
}
