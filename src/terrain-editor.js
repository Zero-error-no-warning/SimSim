// Edit the existing elevation grid; display exaggeration never changes SI data.
export function paintTerrain(data,point,{mode,radius,amount=50,target=0}){
  if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))throw Error('地形ブラシの位置が不正です。');
  if(!['raise','lower','flatten','smooth'].includes(mode)||!Number.isFinite(radius)||radius<data.spacing/2||!Number.isFinite(amount)||amount<0||!Number.isFinite(target)||target< -12000||target>10000)throw Error('地形ブラシの範囲・高さが不正です。');
  const x=(point.x-data.origin.x)/data.spacing,y=(point.y-data.origin.y)/data.spacing,r=radius/data.spacing,source=mode==='smooth'?[...data.elevations]:data.elevations;
  let changed=0;
  for(let row=Math.max(0,Math.ceil(y-r));row<=Math.min(data.rows-1,Math.floor(y+r));row++)for(let col=Math.max(0,Math.ceil(x-r));col<=Math.min(data.columns-1,Math.floor(x+r));col++){
    const distance=Math.hypot(col-x,row-y)/r;if(distance>=1)continue;
    const weight=(1-distance*distance)**2,index=row*data.columns+col,h=source[index];let next;
    if(mode==='flatten')next=h+(target-h)*weight;
    else if(mode==='smooth'){
      let total=0,count=0;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const yy=row+dy,xx=col+dx;if(yy>=0&&yy<data.rows&&xx>=0&&xx<data.columns){total+=source[yy*data.columns+xx];count++;}}
      next=h+(total/count-h)*weight*Math.min(1,amount/100);
    }else next=h+(mode==='raise'?1:-1)*amount*weight;
    next=Math.max(-12000,Math.min(10000,next));
    if(Math.abs(next-data.elevations[index])>1e-9){data.elevations[index]=next;changed++;}
  }
  return changed;
}
