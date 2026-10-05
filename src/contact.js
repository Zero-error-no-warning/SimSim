export function terrainVisible(terrain,a,b) {
  const distance=Math.hypot(b.x-a.x,b.y-a.y),steps=Math.max(1,Math.ceil(distance/Math.min(125,terrain.data.spacing/4)));
  for(let i=0;i<=steps;i++) {
    const f=i/steps,x=a.x+(b.x-a.x)*f,y=a.y+(b.y-a.y)*f,z=a.z+(b.z-a.z)*f,h=terrain.height(x,y);
    if(h===null||z<h-1e-6)return false;
  }
  return true;
}
export function contactProbability(sensor,distance,detectability,seconds) {
  if(seconds<=0||detectability<=0||distance>=sensor.range||sensor.probabilityPerMinute<=0)return 0;
  if(sensor.probabilityPerMinute>=1)return 1;
  const hazard=-Math.log1p(-sensor.probabilityPerMinute)/60;
  return -Math.expm1(-hazard*seconds*detectability*(1-distance/sensor.range)**2);
}
export const mounted=(p,u)=>({
  ...p,z:p.z+(u.sensor?.mountHeight??(u.domain==='ground'?2:0))
});
const spatialKey=(x,y,size)=>Math.floor(x/size)+','+Math.floor(y/size);
export function makeIndex(items,size) {
  const cells=new Map();
  for(const item of items){
    const key=spatialKey(item.position.x,item.position.y,size);
    if(!cells.has(key))cells.set(key,[]);
    cells.get(key).push(item);
  }
  return cells;
}
export function* neighbors(cells,p,size) {
  const x=Math.floor(p.x/size),y=Math.floor(p.y/size);
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)for(const item of cells.get((x+dx)+','+(y+dy))??[])yield item;
}
