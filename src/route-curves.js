// Cubic spatial handles are offsets from their waypoint, in metres.
export const mixPoint=(a,b,t)=>Object.fromEntries(['x','y','z'].map(k=>[k,a[k]+(b[k]-a[k])*t]));
const add=(p,h)=>Object.fromEntries(['x','y','z'].map(k=>[k,p[k]+(h?.[k]??0)]));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
export function routeFeatureErrors(points,profile){
 const errors=[];
 for(const p of Array.isArray(points)?points:[])for(const key of ['in','out'])if(p?.[key]!==undefined&&(!p[key]||!['x','y','z'].every(k=>Number.isFinite(p[key][k])&&Math.abs(p[key][k])<=1000000)))errors.push('曲線ハンドルはx,y,zの有限なオフセット（m）で指定してください。');
 if(profile!==undefined){
  const list=profile?.points;
  if(!Array.isArray(list)||list.length<2||list.length>64||list[0]?.t!==0||list.at(-1)?.t!==1)errors.push('速度グラフは時間0～1の両端を含む2～64点です。');
  else for(let i=0;i<list.length;i++){
   const p=list[i];if(!p||!Number.isFinite(p.t)||!Number.isFinite(p.v)||p.v<0||p.v>20||i>0&&p.t<=list[i-1].t)errors.push('速度グラフの時間は昇順、速度倍率は0～20です。');
   for(const side of ['in','out'])if(p?.[side]!==undefined){const h=p[side],neighbor=list[i+(side==='in'?-1:1)],gap=neighbor?Math.abs(neighbor.t-p.t):1;if(!h||!Number.isFinite(h.t)||!Number.isFinite(h.v)||Math.abs(h.t)>gap||side==='in'&&h.t>0||side==='out'&&h.t<0||p.v+h.v<0||p.v+h.v>20)errors.push('速度ハンドルは隣接する時間範囲内、速度倍率0～20にしてください。');}
  }
  if(Array.isArray(list)&&!errors.length&&profileTable(profile,false).average<=1e-10)errors.push('速度グラフには0より大きい速度が必要です。');
 }
 return errors;
}
export function smoothRoute(points,loop){
 for(let i=0;i<points.length;i++){
  const p=points[i],prev=points[i-1]??(loop?points.at(-1):p),next=points[i+1]??(loop?points[0]:p);
  const tangent=Object.fromEntries(['x','y','z'].map(k=>[k,(next[k]-prev[k])/6]));
  if(i>0||loop)p.in=Object.fromEntries(['x','y','z'].map(k=>[k,-tangent[k]]));
  if(i<points.length-1||loop)p.out={...tangent};
 }
 return points;
}
export function sampleRoute(points,loop=false,{step=125,tolerance=1,maxPoints=100000}={}){
 if(!points?.length)return [];
 const out=[points[0]],segments=points.length-1+(loop&&points.length>1?1:0);
 const append=p=>{out.push(p);if(out.length>maxPoints)throw Error('曲線の点数が上限を超えました。経路やハンドルを短くしてください。');};
 const flat=(p,a,b)=>{const d={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},len=d.x*d.x+d.y*d.y+d.z*d.z,t=len?Math.max(0,Math.min(1,((p.x-a.x)*d.x+(p.y-a.y)*d.y+(p.z-a.z)*d.z)/len)):0;return distance(p,mixPoint(a,b,t));};
 const split=(a,b,c,d,depth)=>{
  const length=distance(a,b)+distance(b,c)+distance(c,d);
  if(depth>=22||length<=step&&Math.max(flat(b,a,d),flat(c,a,d))<=tolerance){append(d);return;}
  const ab=mixPoint(a,b,.5),bc=mixPoint(b,c,.5),cd=mixPoint(c,d,.5),abc=mixPoint(ab,bc,.5),bcd=mixPoint(bc,cd,.5),mid=mixPoint(abc,bcd,.5);
  split(a,ab,abc,mid,depth+1);split(mid,bcd,cd,d,depth+1);
 };
 for(let i=0;i<segments;i++){const a=points[i],b=points[(i+1)%points.length];if(!a.out&&!b.in)append(b);else split(a,add(a,a.out??mixPoint({x:0,y:0,z:0},{x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},1/3)),add(b,b.in??{x:(a.x-b.x)/3,y:(a.y-b.y)/3,z:(a.z-b.z)/3}),b,0);}
 return out;
}
export function defaultProfile(){return {points:[{t:0,v:1,out:{t:1/3,v:0}},{t:1,v:1,in:{t:-1/3,v:0}}]};}
export function closeProfile(profile,side='start'){
 const p=profile.points,a=p[0],b=p.at(-1);if(side==='end')a.v=b.v;else b.v=a.v;
 a.out??={t:(p[1].t-a.t)/3,v:0};b.in??={t:-(b.t-p.at(-2).t)/3,v:0};
 if(!a.out.t)a.out.t=Math.min(.0001,(p[1].t-a.t)/3);if(!b.in.t)b.in.t=-Math.min(.0001,(b.t-p.at(-2).t)/3);
 let slope=side==='end'?b.in.v/b.in.t:a.out.v/a.out.t;if(!Number.isFinite(slope))slope=0;
 const limit=(offset)=>offset>0?[(0-a.v)/offset,(20-a.v)/offset]:[(20-a.v)/offset,(0-a.v)/offset];
 const x=limit(a.out.t),y=limit(b.in.t);slope=Math.max(x[0],y[0],Math.min(x[1],y[1],slope));
 a.out.v=slope*a.out.t;b.in.v=slope*b.in.t;return profile;
}
const cubic=(a,b,c,d,t)=>a*(1-t)**3+3*b*(1-t)**2*t+3*c*(1-t)*t*t+d*t*t*t;
export function profileValue(profile,time){
 const points=profile.points,t=Math.max(0,Math.min(1,time));if(t===0)return points[0].v;if(t===1)return points.at(-1).v;let i=1;while(i<points.length-1&&points[i].t<t)i++;
 const a=points[i-1],b=points[i],x1=a.t+(a.out?.t??(b.t-a.t)/3),x2=b.t+(b.in?.t??-(b.t-a.t)/3),y1=a.v+(a.out?.v??(b.v-a.v)/3),y2=b.v+(b.in?.v??(a.v-b.v)/3);
 // Clamp crossed handles to their shared midpoint so time remains monotonic.
 const c1=Math.min(x1,(x1+x2)/2),c2=Math.max(x2,(x1+x2)/2);let lo=0,hi=1;
 for(let n=0;n<30;n++){const u=(lo+hi)/2;if(cubic(a.t,c1,c2,b.t,u)<t)lo=u;else hi=u;}
 const xlo=cubic(a.t,c1,c2,b.t,lo),xhi=cubic(a.t,c1,c2,b.t,hi),u=xhi>xlo?lo+(t-xlo)/(xhi-xlo)*(hi-lo):(lo+hi)/2;return Math.max(0,cubic(a.v,y1,y2,b.v,u));
}
const clockCache=new Map();
export function profileTable(profile,loop){
 const key=JSON.stringify([profile,loop]);if(clockCache.has(key))return clockCache.get(key);
 const p=structuredClone(profile);if(loop)closeProfile(p);const count=512,values=Array.from({length:count+1},(_,i)=>profileValue(p,i/count)),areas=[0];
 for(let i=1;i<=count;i++)areas.push(areas.at(-1)+(values[i-1]+values[i])/(2*count));
 const average=areas.at(-1),result={profile:p,average,values,areas:areas.map(v=>v/(average||1)),count};clockCache.set(key,result);if(clockCache.size>64)clockCache.delete(clockCache.keys().next().value);return result;
}
function lookup(values,t){const x=Math.max(0,Math.min(1,t))*(values.length-1),i=Math.min(values.length-2,Math.floor(x));return values[i]+(values[i+1]-values[i])*(x-i);}
export function attachClock(path,profile){if(profile){path.clock=profileTable(profile,path.periodic);path.duration=path.actualSpeed>0&&path.clock.average>0?path.length/(path.actualSpeed*path.clock.average):Infinity;}return path;}
export const pathDuration=path=>path.duration??(path.actualSpeed>0?path.length/path.actualSpeed:Infinity);
export function pathTravel(path,time){
 if(!path.clock)return path.actualSpeed*Math.max(0,time);
 const duration=pathDuration(path);if(!duration||!Number.isFinite(duration))return 0;
 const x=Math.max(0,time)/duration,laps=path.periodic?Math.floor(x):0,f=path.periodic?x-laps:Math.min(1,x);
 return path.length*(laps+lookup(path.clock.areas,f));
}
export function pathSpeed(path,time){if(!path.clock)return path.actualSpeed;const d=pathDuration(path),t=d>0&&Number.isFinite(d)?Math.max(0,time)/d:0;return path.actualSpeed*lookup(path.clock.values,path.periodic?t%1:Math.min(1,t));}
export function pathTime(path,distance){
 if(!path.clock)return path.actualSpeed?distance/path.actualSpeed:0;
 if(!Number.isFinite(pathDuration(path)))return 0;
 const x=path.length?Math.max(0,distance)/path.length:0,laps=Math.floor(x),f=x-laps,a=path.clock.areas;let lo=0,hi=a.length-1;
 while(hi-lo>1){const i=(lo+hi)>>1;if(a[i]<f)lo=i;else hi=i;}
 const phase=(lo+(a[hi]>a[lo]?(f-a[lo])/(a[hi]-a[lo]):0))/(a.length-1);
 return (laps+phase)*pathDuration(path);
}
