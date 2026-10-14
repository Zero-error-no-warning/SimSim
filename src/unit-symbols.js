// The map and unit browser share this drawing, including selection and disabled colors.
export const UNIT_COLORS={friendly:'#6bd0fa',hostile:'#f99587',neutral:'#d5c789'};
export const DEFAULT_SYMBOL_MODE='direction';
export function routeHeading(points=[],position){
  let heading=0,best=Infinity;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;
    if(Math.hypot(dx,dy)<=1e-6)continue;
    if(!position)return Math.atan2(dx,dy);
    const f=Math.max(0,Math.min(1,((position.x-a.x)*dx+(position.y-a.y)*dy+(position.z-a.z)*dz)/(dx*dx+dy*dy+dz*dz))),distance=Math.hypot(position.x-a.x-f*dx,position.y-a.y-f*dy,position.z-a.z-f*dz);
    if(distance<best-1e-6||Math.abs(distance-best)<1e-6&&f<1){best=distance;heading=Math.atan2(dx,dy);if(distance<1e-6&&f<1)break;}
  }
  return heading;
}
export function drawUnitSymbol(canvas,unit,{mode=DEFAULT_SYMBOL_MODE,selected=false,heading=0}={}){
  canvas.width=96;canvas.height=96;const c=canvas.getContext('2d',{willReadFrequently:true});
  const color=unit.enabled===false?'#788391':UNIT_COLORS[unit.faction]??UNIT_COLORS.neutral;
  if(mode==='direction'){
    c.translate(48,48);c.rotate(Number.isFinite(heading)?heading:0);
    c.beginPath();c.moveTo(0,-36);c.lineTo(27,29);c.lineTo(-27,29);c.closePath();
    c.fillStyle=color;c.fill();c.lineWidth=selected?5:3;c.strokeStyle=selected?'#ffd18b':'#102437';c.stroke();
    return canvas;
  }
  c.fillStyle='#102437';c.strokeStyle=selected?'#ffd18b':color;c.lineWidth=4;
  c.beginPath();c.arc(48,48,37,0,Math.PI*2);c.fill();c.stroke();
  c.fillStyle=color;c.strokeStyle=color;c.lineWidth=3;c.beginPath();
  if(unit.domain==='ground'){c.rect(32,32,32,32);c.fill();}
  else if(unit.domain==='surface'){
    c.moveTo(48,24);c.lineTo(65,52);c.lineTo(57,68);c.lineTo(39,68);c.lineTo(31,52);c.closePath();c.fill();
  }else if(unit.domain==='subsurface'){
    c.ellipse(48,48,15,24,0,0,Math.PI*2);c.fill();c.fillRect(62,43,8,10);
  }else{
    c.moveTo(48,23);c.lineTo(55,43);c.lineTo(72,55);c.lineTo(72,61);c.lineTo(53,55);c.lineTo(53,67);c.lineTo(61,73);c.lineTo(35,73);c.lineTo(43,67);c.lineTo(43,55);c.lineTo(24,61);c.lineTo(24,55);c.lineTo(41,43);c.closePath();c.fill();
  }
  if(!unit.manned){c.fillStyle='#102437';c.beginPath();c.arc(48,48,4,0,Math.PI*2);c.fill();}
  return canvas;
}
