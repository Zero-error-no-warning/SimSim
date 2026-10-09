export class InformationMetrics{
 constructor(states,maxAge=30){this.maxAge=maxAge;this.units=Object.fromEntries(states.map(s=>[s.unit.id,{firstDetectionAt:null,firstReportAt:null,firstCommandAt:null,firstArrivalAt:null,sent:0,deliveryFailures:0,freshContactSeconds:0,lastReportAge:null}]));this.coverage=new Map();}
 observe(e){const r=this.units[e.unitId];if(!r)return;
  if(e.type==='detected'&&r.firstDetectionAt===null)r.firstDetectionAt=e.time;
  if(e.type==='received'&&e.targetId&&r.firstReportAt===null)r.firstReportAt=e.time;
  if(e.type==='received'&&e.messageKind==='command'&&r.firstCommandAt===null)r.firstCommandAt=e.time;
  if(e.type==='arrived'&&r.firstArrivalAt===null)r.firstArrivalAt=e.time;
  if(e.type==='sent')r.sent++;
  if(e.type==='deliveryFailed')r.deliveryFailures++;
  if(e.targetId&&e.targetPosition&&['detected','received'].includes(e.type)){
   const observed=e.observationTime??e.time,end=observed+this.maxAge,start=e.time;
   if(e.type==='received')r.lastReportAge=Math.max(0,start-observed);
   if(end>start){const old=this.coverage.get(e.unitId);if(old&&start<=old.end){r.freshContactSeconds+=Math.max(0,end-old.end);old.end=Math.max(old.end,end);}else{r.freshContactSeconds+=end-start;this.coverage.set(e.unitId,{start,end});}}
  }
 }
 finish(horizon){for(const [id,c] of this.coverage)if(c.end>horizon)this.units[id].freshContactSeconds-=Math.min(c.end-horizon,c.end-c.start);return {maxContactAge:this.maxAge,units:this.units};}
}
