import {Terrain} from './terrain.js?v=20261006-patrol-cruise-19';
const DOMAINS=['ground','surface','subsurface','air'];
const finite=Number.isFinite,lerp=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
export function navigationProfileErrors(p){
  if(!p||typeof p!=='object'||Array.isArray(p)||!DOMAINS.includes(p.domain)||p.clearance!==undefined&&(!finite(p.clearance)||p.clearance<0||p.clearance>10000))return ['経路検査の領域・地表／海底からの余裕（0～10000m）が不正です。'];
  return [];
}
export function generationErrors(g,mode='once'){
  const errors=navigationProfileErrors(g);
  if(!g||errors.length)return errors;
  if(!Array.isArray(g.via)||g.via.length<(mode==='loop'?3:2)||g.via.length>100||g.via.some(p=>!p||!['x','y'].every(k=>finite(p[k])&&Math.abs(p[k])<=1000000)))errors.push('自動生成の必須経由地点は2～100点（周回は3点以上）の東西・南北座標です。');
  if(['air','subsurface'].includes(g.domain)&&(!finite(g.height)||g.height<-1000000||g.height>1000000))errors.push('自動生成する高度・深度のz座標を指定してください。');
  if(g.height!==undefined&&(!finite(g.height)||Math.abs(g.height)>1000000))errors.push('高度・深度は数値で指定してください。');
  return errors;
}
function margin(t,p,domain){
  const h=t.height(p.x,p.y),sea=t.data.seaLevel;
  if(h===null)return -Infinity;
  return domain==='ground'?h-sea:domain==='surface'?sea-h-5:domain==='subsurface'?Math.min(p.z-h-5,sea-p.z-1):p.z-Math.max(h,sea)-10;
}
function violation(t,p,profile){
  const m=margin(t,p,profile.domain),clearance=profile.clearance??0;
  if(m<clearance-1e-7||['ground','air'].includes(profile.domain)&&m<=0){
    const checked=t.project(p,profile.domain);
    return {point:{...p},reason:checked.error??'地表・海底／海面からの余裕 '+clearance+'mを満たしていません。',margin:m};
  }
  return null;
}
// A bilinear terrain is quadratic along a straight segment inside each cell.
// Test its extrema as well as cell crossings, including a linearly changing z.
export function inspectSegment(terrain,a,b,profile){
  const t=terrain instanceof Terrain?terrain:new Terrain(terrain),start=violation(t,a,profile),end=violation(t,b,profile);
  if(start)return start;if(end)return end;
  const cuts=[0,1],d=t.data;
  for(const [axis,count,spacing,origin] of [['x',d.columns,d.spacing,d.origin.x],['y',d.rows,d.spacingY??d.spacing,d.origin.y]]){
    const delta=b[axis]-a[axis];if(!delta)continue;
    const low=Math.min(a[axis],b[axis]),high=Math.max(a[axis],b[axis]);
    for(let k=Math.max(1,Math.ceil((low-origin)/spacing));k<=Math.min(count-2,Math.floor((high-origin)/spacing));k++){const f=(origin+k*spacing-a[axis])/delta;if(f>0&&f<1)cuts.push(f);}
  }
  cuts.sort((x,y)=>x-y);
  for(let i=1;i<cuts.length;i++){
    const lo=cuts[i-1],hi=cuts[i];if(hi-lo<1e-12)continue;
    const p0=lerp(a,b,lo),p1=lerp(a,b,hi),pm=lerp(a,b,(lo+hi)/2),h0=t.height(p0.x,p0.y),h1=t.height(p1.x,p1.y),hm=t.height(pm.x,pm.y);
    const qa=2*(h0+h1-2*hm),qb=h1-h0-qa,candidates=[0,1];
    if(Math.abs(qa)>1e-12)for(const numerator of [-qb,p1.z-p0.z-qb]){const f=numerator/(2*qa);if(f>0&&f<1)candidates.push(f);}
    for(const f of candidates){const problem=violation(t,lerp(a,b,lo+(hi-lo)*f),profile);if(problem)return problem;}
  }
  return null;
}
export function inspectRoute(terrain,points,profile,{loop=false}={}){
  const errors=navigationProfileErrors(profile);if(errors.length)throw Error(errors[0]);
  const t=terrain instanceof Terrain?terrain:new Terrain(terrain),issues=[];
  if(!Array.isArray(points)||!points.length)return {ok:true,issues};
  if(points.length===1){const problem=violation(t,points[0],profile);if(problem)issues.push({segment:0,from:points[0],to:points[0],...problem});}
  for(let i=1;i<points.length+(loop?1:0);i++){
    const a=points[i-1],b=points[i%points.length],problem=inspectSegment(t,a,b,profile);
    if(problem)issues.push({segment:i-1,from:{...a},to:{...b},...problem});
  }
  return {ok:!issues.length,issues};
}
class Heap{
  constructor(){this.values=[];}
  push(v){let i=this.values.length;this.values.push(v);while(i){const p=(i-1)>>1;if(this.values[p].score<=v.score)break;this.values[i]=this.values[p];i=p;}this.values[i]=v;}
  pop(){const first=this.values[0],last=this.values.pop();if(this.values.length){let i=0;while(i*2+1<this.values.length){let c=i*2+1;if(c+1<this.values.length&&this.values[c+1].score<this.values[c].score)c++;if(this.values[c].score>=last.score)break;this.values[i]=this.values[c];i=c;}this.values[i]=last;}return first;}
}
function planLeg(t,start,goal,profile,grid){
  if(!inspectSegment(t,start,goal,profile))return [{...start},{...goal}];
  const {nx,ny,sx,sy,height}=grid,n=nx*ny,points=new Array(n),costs=new Float64Array(n).fill(Infinity),parents=new Int32Array(n).fill(-1),closed=new Uint8Array(n),heap=new Heap();
  const at=i=>{if(points[i]!==undefined)return points[i];const p={x:t.minX+(i%nx)*sx,y:t.minY+Math.floor(i/nx)*sy,z:height},checked=t.project(p,profile.domain);return points[i]=violation(t,p,profile)?null:checked.point;};
  const neighbors=p=>{
    const x=Math.round((p.x-t.minX)/sx),y=Math.round((p.y-t.minY)/sy),out=[];
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const xx=x+dx,yy=y+dy;if(xx<0||xx>=nx||yy<0||yy>=ny)continue;const i=yy*nx+xx,q=at(i);if(q&&!inspectSegment(t,p,q,profile))out.push(i);}return out;
  };
  const goals=new Set(neighbors(goal));if(!goals.size)throw Error('目的地付近に接続できる通行可能な経路がありません。地点・高度／深度・余裕を調整してください。');
  for(const i of neighbors(start)){costs[i]=distance(start,at(i));heap.push({i,score:costs[i]+distance(at(i),goal)});}
  let last=-1;
  while(heap.values.length){
    const {i}=heap.pop();if(closed[i])continue;closed[i]=1;
    if(goals.has(i)){last=i;break;}
    const x=i%nx,y=Math.floor(i/nx),p=at(i);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy)continue;const xx=x+dx,yy=y+dy;if(xx<0||xx>=nx||yy<0||yy>=ny)continue;
      const j=yy*nx+xx;if(closed[j])continue;const q=at(j);if(!q)continue;
      const cost=costs[i]+distance(p,q);if(cost>=costs[j]||inspectSegment(t,p,q,profile))continue;
      parents[j]=i;costs[j]=cost;heap.push({i:j,score:cost+distance(q,goal)});
    }
  }
  if(last<0)throw Error('この領域・高度／深度・余裕では経路を生成できませんでした。通れる海峡・陸地がつながっているか、必須地点を確認してください。');
  const path=[{...goal}];for(let i=last;i>=0;i=parents[i])path.push(at(i));path.push({...start});path.reverse();
  const result=[path[0]];let i=0;
  while(i<path.length-1){let j=path.length-1;while(j>i+1&&inspectSegment(t,path[i],path[j],profile))j--;result.push(path[j]);i=j;}
  return result;
}
export function generateRoute(terrain,g,{mode='once'}={}){
  const errors=generationErrors(g,mode);if(errors.length)throw Error(errors.join('\n'));
  const t=terrain instanceof Terrain?terrain:new Terrain(terrain),profile={domain:g.domain,clearance:g.clearance??0},height=g.height??t.data.seaLevel;
  const anchors=g.via.map((p,i)=>{const q={x:p.x,y:p.y,z:height},problem=violation(t,q,profile);if(problem)throw Error('必須地点 '+(i+1)+'：'+problem.reason);return t.project(q,g.domain).point;});
  if(anchors.every(p=>distance(p,anchors[0])<1e-6))throw Error('異なる出発地点・目的地を指定してください。');
  const width=t.maxX-t.minX,span=t.maxY-t.minY,step=Math.max(Math.min(t.data.spacing,t.data.spacingY??t.data.spacing)/4,Math.max(width,span)/256),nx=Math.max(2,Math.ceil(width/step)+1),ny=Math.max(2,Math.ceil(span/step)+1),grid={nx,ny,sx:width/(nx-1),sy:span/(ny-1),height};
  const points=[anchors[0]];
  for(let i=1;i<anchors.length+(mode==='loop'?1:0);i++){
    if(distance(points.at(-1),anchors[i%anchors.length])<1e-8)continue;
    points.push(...planLeg(t,points.at(-1),anchors[i%anchors.length],profile,grid).slice(1));
  }
  if(mode==='loop'&&distance(points[0],points.at(-1))<1e-6)points.pop();
  if(points.length>500)throw Error('生成経路が500点を超えました。必須地点を減らしてください。');
  if(points.length<(mode==='loop'?3:2))throw Error('周回は異なる必須地点を3点以上指定してください。');
  const result=inspectRoute(t,points,profile,{loop:mode==='loop'});if(!result.ok)throw Error('生成経路の検査に失敗しました。条件を調整してください。');
  return {points,navigation:profile};
}
export function materializeRoutes(s){
  for(const r of s.routes??[])if(r.generate){try{const generated=generateRoute(s.terrain,r.generate,{mode:r.mode??'once'});Object.assign(r,generated);delete r.generate;}catch(e){throw Error('経路「'+r.name+'」：'+e.message);}}
  return s;
}
