import {Terrain} from './engine.js?v=20261005-state-measurement-8';
// Edit the existing elevation grid; display exaggeration never changes SI data.
export function paintTerrain(data,point,{mode,radius,amount=50,target=0}){
  if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))throw Error('地形ブラシの位置が不正です。');
  const sx=data.spacing,sy=data.spacingY??sx,cell=Math.min(sx,sy);
  if(!['raise','lower','flatten','smooth'].includes(mode)||!Number.isFinite(radius)||radius<cell/2||!Number.isFinite(amount)||amount<0||!Number.isFinite(target)||target< -12000||target>10000)throw Error('地形ブラシの範囲・高さが不正です。');
  const x=(point.x-data.origin.x)/sx,y=(point.y-data.origin.y)/sy,rx=radius/sx,ry=radius/sy,source=mode==='smooth'?[...data.elevations]:data.elevations;
  let changed=0;
  for(let row=Math.max(0,Math.ceil(y-ry));row<=Math.min(data.rows-1,Math.floor(y+ry));row++)for(let col=Math.max(0,Math.ceil(x-rx));col<=Math.min(data.columns-1,Math.floor(x+rx));col++){
    const distance=Math.hypot((col-x)*sx,(row-y)*sy)/radius;if(distance>=1)continue;
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

// Keep grid counts and map coordinates; sample existing heights at the new grid points.
export function resizeTerrain(data,width,height){
  const sx=width/(data.columns-1),sy=height/(data.rows-1);
  if(!Number.isFinite(sx)||!Number.isFinite(sy)||sx<1||sy<1||sx>10000||sy>10000)throw Error('領域サイズは各グリッドの間隔が1～10000mになる範囲で指定してください。');
  const terrain=new Terrain(data),next={...structuredClone(data),spacing:sx};
  if(Math.abs(sx-sy)<1e-9)delete next.spacingY;else next.spacingY=sy;
  next.elevations=Array.from({length:data.columns*data.rows},(_,i)=>{
    const x=data.origin.x+(i%data.columns)*sx,y=data.origin.y+Math.floor(i/data.columns)*sy;
    return terrain.height(Math.max(terrain.minX,Math.min(terrain.maxX,x)),Math.max(terrain.minY,Math.min(terrain.maxY,y)));
  });
  return next;
}
