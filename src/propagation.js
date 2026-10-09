// Local tangent coordinates, spherical horizon and a sampled effective-Earth
// bulge. This does not turn the map into a geodetic coordinate system.
export const EARTH_RADIUS=6371000;
export function mediumCompatible(medium,a,b,sea=0){
 if(medium==='ideal')return true;
 if(medium==='acoustic')return a.z<=sea+1e-6&&b.z<=sea+1e-6;
 return a.z>=sea-1e-6&&b.z>=sea-1e-6;
}
export function propagationVisible(terrain,a,b,{medium='ideal',terrainLOS=false,earthFactor=1}={}){
 const distance=Math.hypot(b.x-a.x,b.y-a.y),sea=terrain.data.seaLevel;
 if(!mediumCompatible(medium,a,b,sea))return false;
 const curved=['rf','optical'].includes(medium),r=EARTH_RADIUS*earthFactor;
 if(curved){const h=p=>Math.max(0,p.z-sea),horizon=p=>r*Math.acos(r/(r+h(p)));if(distance>horizon(a)+horizon(b)+1e-6)return false;}
 if(!terrainLOS)return true;
 const steps=Math.max(1,Math.ceil(distance/Math.min(125,terrain.cellSize/4)));
 for(let i=0;i<=steps;i++){const f=i/steps,h=terrain.height(a.x+(b.x-a.x)*f,a.y+(b.y-a.y)*f),bulge=curved?distance**2*f*(1-f)/(2*r):0;if(h===null||a.z+(b.z-a.z)*f<h+bulge-1e-6)return false;}
 return true;
}
export const propagationSpeed=medium=>medium==='acoustic'?1500:299792458;
