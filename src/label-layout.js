// Screen-space labels: selected first, bounded placement, never overlap.
export function layoutLabels(items,width,height){
  const placed=[],result=new Map(),margin=5,top=48,bottom=height-42;
  const overlap=(a,b)=>a.x<b.x+b.w+3&&a.x+a.w+3>b.x&&a.y<b.y+b.h+3&&a.y+a.h+3>b.y;
  for(const item of [...items].sort((a,b)=>(b.priority??0)-(a.priority??0)||a.id.localeCompare(b.id))){
    const {w,h}=item;if(w>width-2*margin||h>bottom-top){result.set(item.id,null);continue;}
    const clamp=p=>({x:Math.max(margin,Math.min(width-w-margin,p.x)),y:Math.max(top,Math.min(bottom-h,p.y)),w,h});
    const candidates=[];
    for(const dy of [0,-h-6,h+6,-2*(h+6),2*(h+6),-3*(h+6),3*(h+6),-4*(h+6),4*(h+6)])for(const dx of [18,-w-18,45,-w-45,90,-w-90,150,-w-150])candidates.push(clamp({x:item.x+dx,y:item.y-h/2+dy}));
    const distance=r=>Math.hypot(Math.max(r.x-item.x,0,item.x-r.x-r.w),Math.max(r.y-item.y,0,item.y-r.y-r.h));
    candidates.sort((a,b)=>distance(a)-distance(b));
    const rect=candidates.find(r=>!placed.some(p=>overlap(r,p)));
    result.set(item.id,rect??null);if(rect)placed.push(rect);
  }
  return result;
}
