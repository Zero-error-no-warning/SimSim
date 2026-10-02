// Versioned deterministic hash streams: drawing and evaluation order consume no random state.
export function random01(key) {
  let h=2166136261;
  for(let i=0;i<key.length;i++){h^=key.charCodeAt(i);h=Math.imul(h,16777619);}
  h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);h^=h>>>16;
  return (h>>>0)/4294967296;
}
const smooth=t=>t*t*(3-2*t);
export function noiseVector(key,distance,scale) {
  const k=Math.floor(distance/scale),f=smooth(distance/scale-k);
  const at=n=>{const angle=random01(key+'|angle|'+n)*Math.PI*2,r=Math.sqrt(random01(key+'|radius|'+n));return [Math.cos(angle)*r,Math.sin(angle)*r,random01(key+'|z|'+n)*2-1];};
  const a=at(k),b=at(k+1);return a.map((v,i)=>v+(b[i]-v)*f);
}
export function streamKey(scenario,id,kind) {return 'simsim-rng-v1|'+JSON.stringify([scenario.seed??'SimSim',scenario.trial??0,id,kind]);}
export function expandGroups(scenario) {
  const units=scenario.units.map(u=>({...u}));
  for(const group of scenario.groups??[]) {
    const columns=Math.ceil(Math.sqrt(group.count)),rows=Math.ceil(group.count/columns);
    for(let index=0;index<group.count;index++) {
      const id=group.id+'__'+(index+1),key=streamKey(scenario,id,'deployment');
      const fx=group.placement==='random'?random01(key+'|x'):(index%columns+.5)/columns;
      const fy=group.placement==='random'?random01(key+'|y'):(Math.floor(index/columns)+.5)/rows;
      const dx=(fx-.5)*group.width,dy=(fy-.5)*group.height;
      const translate=p=>({...p,x:p.x+dx,y:p.y+dy});
      const mode=group.loopStartMode??'template';
      const motion=group.template.routeMode==='loop'&&mode!=='template'?{...group.template.motion,loopStart:((group.template.motion?.loopStart??0)+(mode==='even'?index/group.count:random01(streamKey(scenario,id,'loop-start-placement-v1'))))%1}:group.template.motion;
      units.push({...group.template,...(motion?{motion}:{}),id,name:(group.name+' '+(index+1)).slice(0,120),groupId:group.id,initial:translate(group.template.initial),route:group.template.route.map(translate)});
    }
  }
  return units;
}
