export class InformationMetrics{
 constructor(states,maxAge=30){this.maxAge=maxAge;this.units=Object.fromEntries(states.map(s=>[s.unit.id,{firstDetectionAt:null,firstReportAt:null,firstCommandAt:null,firstArrivalAt:null,sent:0,deliveryFailures:0,freshContactSeconds:0,lastReportAge:null}]));this.coverage=new Map();}
 observe(e){const r=this.units[e.unitId];if(!r)return;
  if(e.type==='detected'&&r.firstDetectionAt===null)r.firstDetectionAt=e.time;
  if(e.type==='received'&&e.messageKind!=='command'&&r.firstReportAt===null)r.firstReportAt=e.time;
  if(e.type==='received'&&e.messageKind==='command'&&r.firstCommandAt===null)r.firstCommandAt=e.time;
  if(e.type==='arrived'&&r.firstArrivalAt===null)r.firstArrivalAt=e.time;
  if(e.type==='sent')r.sent++;
  if(e.type==='deliveryFailed')r.deliveryFailures++;
  if(e.type==='received'&&e.messageKind!=='command')r.lastReportAge=Math.max(0,e.time-(e.observationTime??e.time));
  if(e.targetId&&e.targetPosition&&['initial','detected','received'].includes(e.type)){
   const observed=e.observationTime??e.time,end=observed+this.maxAge,start=e.time;
   if(end>start){const old=this.coverage.get(e.unitId);if(old&&start<=old.end){r.freshContactSeconds+=Math.max(0,end-old.end);old.end=Math.max(old.end,end);}else{r.freshContactSeconds+=end-start;this.coverage.set(e.unitId,{start,end});}}
  }
 }
 finish(horizon){for(const [id,c] of this.coverage)if(c.end>horizon)this.units[id].freshContactSeconds-=Math.min(c.end-horizon,c.end-c.start);return {maxContactAge:this.maxAge,units:this.units};}
}

export function validateInformationMetrics(s,metrics,owners){
 if(s.version<4)return;
 if(!metrics||metrics.maxContactAge!==(s.informationMetrics?.maxContactAge??30)||!metrics.units||Object.keys(metrics.units).sort().join('|')!==owners.slice().sort().join('|'))throw Error('情報指標の対象・鮮度基準が一致しません。');
 for(const r of Object.values(metrics.units)){
  for(const key of ['firstDetectionAt','firstReportAt','firstCommandAt','firstArrivalAt'])if(r[key]!==null&&(!Number.isFinite(r[key])||r[key]<0||r[key]>s.duration))throw Error('情報指標の到達時刻が不正です。');
  for(const key of ['sent','deliveryFailures'])if(!Number.isInteger(r[key])||r[key]<0||r[key]>1e9)throw Error('情報指標の件数が不正です。');
  if(!Number.isFinite(r.freshContactSeconds)||r.freshContactSeconds< -1e-6||r.freshContactSeconds>s.duration+1e-6||r.lastReportAge!==null&&(!Number.isFinite(r.lastReportAge)||r.lastReportAge<0||r.lastReportAge>s.duration+86400))throw Error('情報指標の鮮度・継続時間が不正です。');
 }
}
