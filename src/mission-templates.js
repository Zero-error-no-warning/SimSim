import {bindingFaction} from './experiment-settings.js';
import {clone} from './engine.js?v=20261007-plan-switch-25';
export function surveillanceTemplate(source,{unitId,receiverId,center,radius=1000,period=30}){
 const s=clone(source),u=s.units.find(u=>u.id===unitId),receiver=s.units.find(u=>u.id===receiverId);
 if(!u||u.faction!=='friendly'||!receiver||receiver.id===unitId||receiver.faction!=='friendly')throw Error('監視担当と別の味方報告先を指定してください。');
 if(!Number.isFinite(radius)||radius<=0||radius>100000||!Number.isFinite(period)||period<=0||period>86400)throw Error('半径・報告周期が不正です。');
 s.version=4;const unique=(prefix,items)=>{let i=1;while(items.some(x=>x.id===prefix+i))i++;return prefix+i;};
 s.routes??=[];const routeId=unique('surveillance-route-',s.routes),points=Array.from({length:12},(_,i)=>({x:center.x+radius*Math.cos(i*Math.PI/6),y:center.y+radius*Math.sin(i*Math.PI/6),z:u.initial.z}));
 s.routes.push({id:routeId,name:'監視円 '+u.name,mode:'loop',points});
 const graphId=unique('surveillance-',s.behaviors),assignmentId=unique('surveillance-task-',s.behaviorAssignments);
 s.behaviors.push({id:graphId,name:'監視・定期報告',initial:'patrol',triggers:[{id:'contact',event:'detected',to:'report',once:false},{id:'periodic',event:'time',seconds:period,to:'report',once:false}],nodes:[{id:'patrol',kind:'patrol',routeId,joinMode:'nearest',speedFraction:.7,x:100,y:100},{id:'report',kind:'report',receiverId,messageKind:'observation',x:400,y:100}],edges:[{from:'report',to:'patrol',when:'sent'},{from:'report',to:'patrol',when:'sendFailed'}]});
 for(const a of s.behaviorAssignments)a.targets=a.targets.filter(t=>t!=='unit:'+unitId);
 s.behaviorAssignments=s.behaviorAssignments.filter(a=>a.targets.length||s.mission?.assignmentId===a.id||s.measurements?.some(m=>m.assignmentId===a.id));
 s.behaviorAssignments.push({id:assignmentId,name:'監視 '+u.name,behaviorId:graphId,targets:['unit:'+unitId],spacing:'none',coordination:'reported'});
 u.sensor??={enabled:true,range:radius*2,probabilityPerMinute:.8,domains:['ground','surface','subsurface','air'],terrainLOS:false,mountHeight:0};
 u.communication??={enabled:true,range:100000,delay:0,probability:1,terrainLOS:false,medium:'ideal'};
 if(s.experiment){s.experiment.controls=s.experiment.controls.filter(c=>bindingFaction(s,c)==='friendly');const ids=new Set(s.experiment.controls.map(c=>c.id));s.experiment.constraints=s.experiment.constraints?.filter(c=>c.terms.every(t=>ids.has(t.controlId)));if(!s.experiment.controls.length)delete s.experiment;}
 return {scenario:s,assignmentId,graphId};
}
