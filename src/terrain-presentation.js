// Heights match the two triangles used to draw each terrain cell.
export function meshHeight(terrain,x,y){
 const d=terrain.data,gx=(x-d.origin.x)/d.spacing,gy=(y-d.origin.y)/(d.spacingY??d.spacing);
 const col=Math.max(0,Math.min(d.columns-2,Math.floor(gx))),row=Math.max(0,Math.min(d.rows-2,Math.floor(gy))),u=gx-col,v=gy-row;
 const a=d.elevations[row*d.columns+col],b=d.elevations[row*d.columns+col+1],c=d.elevations[(row+1)*d.columns+col],e=d.elevations[(row+1)*d.columns+col+1];
 return u+v<=1?a+(b-a)*u+(c-a)*v:e+(c-e)*(1-u)+(b-e)*(1-v);
}
export function terrainGrid(terrain){
 const span=Math.max(terrain.maxX-terrain.minX,terrain.maxY-terrain.minY),raw=span/80,power=10**Math.floor(Math.log10(raw));
 const spacing=[1,2,5,10].map(n=>n*power).find(n=>n>=raw);
 const positions=[],major=[],d=terrain.data;
 const segment=(a,b,out)=>out.push(a.x,meshHeight(terrain,a.x,a.y),a.y,b.x,meshHeight(terrain,b.x,b.y),b.y);
 // Split at cell edges and diagonals so every grid segment lies on the mesh.
 const line=(fixed,vertical,index)=>{
  const min=vertical?terrain.minY:terrain.minX,max=vertical?terrain.maxY:terrain.maxX,origin=vertical?d.origin.y:d.origin.x,step=vertical?(d.spacingY??d.spacing):d.spacing;
  const other=(fixed-(vertical?d.origin.x:d.origin.y))/(vertical?d.spacing:(d.spacingY??d.spacing)),fraction=other-Math.min((vertical?d.columns:d.rows)-2,Math.floor(other));
  const cuts=[min,max];for(let n=0;n<(vertical?d.rows:d.columns)-1;n++)for(const v of [origin+n*step,origin+(n+1-fraction)*step])if(v>min&&v<max)cuts.push(v);
  cuts.sort((a,b)=>a-b);const out=index%5===0?major:positions;
  for(let n=1;n<cuts.length;n++)if(cuts[n]>cuts[n-1])segment(vertical?{x:fixed,y:cuts[n-1]}:{x:cuts[n-1],y:fixed},vertical?{x:fixed,y:cuts[n]}:{x:cuts[n],y:fixed},out);
 };
 for(let n=Math.ceil(terrain.minX/spacing);n*spacing<=terrain.maxX;n++)line(n*spacing,true,n);
 for(let n=Math.ceil(terrain.minY/spacing);n*spacing<=terrain.maxY;n++)line(n*spacing,false,n);
 return {spacing,positions,major};
}
export function coastline(terrain){
 const d=terrain.data,points=[];
 for(let r=0;r<d.rows-1;r++)for(let c=0;c<d.columns-1;c++){
  const vertex=(dx,dy)=>({x:d.origin.x+(c+dx)*d.spacing,y:d.origin.y+(r+dy)*(d.spacingY??d.spacing),z:d.elevations[(r+dy)*d.columns+c+dx]});
  const a=vertex(0,0),b=vertex(1,0),v=vertex(0,1),e=vertex(1,1);
  for(const triangle of [[a,b,v],[b,e,v]]){
   const crossings=[];
   for(let i=0;i<3;i++){const p=triangle[i],q=triangle[(i+1)%3];if((p.z>d.seaLevel)===(q.z>d.seaLevel))continue;const f=(d.seaLevel-p.z)/(q.z-p.z);crossings.push(p.x+(q.x-p.x)*f,d.seaLevel,p.y+(q.y-p.y)*f);}
   if(crossings.length===6)points.push(...crossings);
  }
 }
 return points;
}
