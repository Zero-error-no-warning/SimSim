import {random01,streamKey} from './random.js?v=0.5.0';
// One registry connects semantic primitive names, units, validation and current engine fields.
// The serialized scenario fields remain authoritative; no mirrored attribute values are stored.
const define=(key,label,family,path,min,max,options={})=>({key,label,family,path,min,max,scale:1,scope:'entity',...options});
export const PARAMETERS=[
  define('rate.movement.speed','移動速度','Rate','speed',0,1500,{unit:'m/s',default:0}),
  define('extent.sense.radius','最大探知距離','Extent','sensor.range',.001,100000,{unit:'km',scale:1000,sensor:true}),
  define('interaction.detection.probability','距離0で1分の探知確率','Interaction','sensor.probabilityPerMinute',0,1,{unit:'%',scale:.01,sensor:true}),
  define('extent.communication.radius','最大通信距離','Extent','communication.range',.001,100000,{unit:'km',scale:1000,communication:true}),
  define('interaction.communication.delay','通信遅延','Interaction','communication.delay',0,86400,{unit:'s',communication:true}),
  define('interaction.communication.probability','通信成功確率','Interaction','communication.probability',0,1,{unit:'%',scale:.01,communication:true}),
  define('behavior.preparation','出発準備時間','Behavior','behavior.preparation',0,86400,{unit:'s',behavior:true}),
  define('extent.signature.coefficient','被探知係数','Extent','detectability',0,10,{unit:'倍',default:1}),
  define('state.position.x','配置・経路の中心 x','State','initial.x',-1000000,1000000,{unit:'km',scale:1000,translate:'x'}),
  define('state.position.y','配置・経路の中心 y','State','initial.y',-1000000,1000000,{unit:'km',scale:1000,translate:'y'}),
  define('state.position.z','高度・深度 z','State','initial.z',-20000,100000,{unit:'m',translate:'z',vertical:true}),
  define('extent.sense.mountHeight','センサー取付高','Extent','sensor.mountHeight',0,1000,{unit:'m',sensor:true,default:0}),
  define('state.route.phase','周回の出発点','State','motion.loopStart',0,1,{unit:'%',scale:.01,default:0,loopOnly:true}),
  define('motion.horizontal','個体の水平ずれ上限','Motion','motion.horizontal',0,10000,{unit:'m',default:0}),
  define('motion.commonHorizontal','群共通の水平ずれ上限','Motion','motion.commonHorizontal',0,10000,{unit:'m',default:0}),
  define('motion.vertical','上下ずれ上限','Motion','motion.vertical',0,3000,{unit:'m',default:0,vertical:true}),
  define('motion.scale','航跡の変動間隔','Motion','motion.scale',10,100000,{unit:'m',default:2000}),
  define('motion.startDelay','出発遅れ上限','Motion','motion.startDelay',0,86400,{unit:'s',default:0}),
  define('motion.speedVariation','個体速度のばらつき','Motion','motion.speedVariation',0,1,{unit:'±%',scale:.01,default:0}),
  define('capacity.population','群の個数','Capacity','count',0,2000,{unit:'個',scope:'group',integer:true}),
  define('extent.deployment.width','配置幅 x','Extent','width',0,100000,{unit:'km',scale:1000,scope:'group'}),
  define('extent.deployment.height','配置幅 y','Extent','height',0,100000,{unit:'km',scale:1000,scope:'group'}),
  define('mission.deadline','成功条件の期限','Mission','mission.deadline',.000001,86400,{unit:'min',scale:60,scope:'scenario'})
];
export const parameter=key=>PARAMETERS.find(p=>p.key===key);
export const bindingKey=b=>JSON.stringify([b.target,b.parameter]);
// Legacy count controls are converted to an ordinary comparison factor for editing.
export function normalizedAnalysis(a) {
  const next=JSON.parse(JSON.stringify(a));
  next.factors=[...(a.groupId?[{target:'group:'+a.groupId,parameter:'capacity.population',values:[...a.counts].sort((x,y)=>x-y)}]:[]),...(next.factors??[])];
  delete next.groupId;delete next.counts;return next;
}
const copy=v=>JSON.parse(JSON.stringify(v));
function resolve(s,target,p) {
  if(target==='scenario'){if(p.scope!=='scenario'||!s.mission)throw new Error('成功条件を設定してください。');return s;}
  const colon=target?.indexOf(':')??-1,kind=target?.slice(0,colon),id=target?.slice(colon+1);
  const object=kind==='unit'?s.units?.find(u=>u.id===id):kind==='group'?s.groups?.find(g=>g.id===id):null;
  if(!object||p.scope==='scenario'||(p.scope==='group'&&kind!=='group'))throw new Error('変数の対象が見つかりません: '+target);
  const entity=kind==='group'&&p.scope==='entity'?object.template:object;
  if(p.loopOnly&&entity.routeMode!=='loop')throw new Error('周回の出発点は周回経路の対象に指定してください。');
  if(p.communication&&!entity.communication?.enabled)throw new Error('通信変数の対象で通信を有効にしてください。');
  if(p.behavior&&!entity.behavior)throw new Error('条件付き行動の設定がありません。');
  if(p.sensor&&!entity.sensor)throw new Error('探知変数の対象にセンサーがありません。');
  return entity;
}
const getPath=(o,path)=>path.split('.').reduce((v,k)=>v?.[k],o);
export function readParameter(s,b) {const p=parameter(b.parameter);if(!p)throw new Error('未対応の変数です。');const entity=resolve(s,b.target,p);return getPath(entity,p.path)??(p.key==='extent.sense.mountHeight'&&entity.domain==='ground'?2:p.default);}
export function writeParameter(s,b,value) {
  const p=parameter(b.parameter),o=resolve(s,b.target,p),parts=p.path.split('.');
  if(p.translate){const delta=value-o.initial[p.translate];for(const point of o.route??[])point[p.translate]+=delta;}
  let parent=o;for(const k of parts.slice(0,-1)){if(parent[k]===undefined)parent[k]={};parent=parent[k];}parent[parts.at(-1)]=value;
}
export function availableBindings(s) {
  const out=[];
  const add=(target,name,entity,kind)=>{for(const p of PARAMETERS){if(p.loopOnly&&entity.routeMode!=='loop'||p.scope==='scenario'||p.scope==='group'&&kind!=='group'||p.sensor&&!entity.sensor?.enabled||p.communication&&!entity.communication?.enabled||p.behavior&&!entity.behavior||p.vertical&&['ground','surface'].includes(entity.domain))continue;out.push({target,targetLabel:(kind==='group'?'群: ':'ユニット: ')+name,parameter:p.key,label:name+' · '+p.family+' · '+p.label+' ('+p.unit+')'});}};
  for(const u of s.units??[])add('unit:'+u.id,u.name,u,'unit');
  for(const g of s.groups??[])add('group:'+g.id,g.name,g.template,'group');
  if(s.mission)for(const p of PARAMETERS.filter(p=>p.scope==='scenario'))out.push({target:'scenario',targetLabel:'シナリオ・ミッション',parameter:p.key,label:p.label+' ('+p.unit+')'});
  return out;
}
export function formatBinding(s,b,value) {
  const p=parameter(b.parameter);let name=b.target;
  if(b.target.startsWith('group:'))name=s.groups?.find(g=>g.id===b.target.slice(6))?.name??name;
  if(b.target.startsWith('unit:'))name=s.units?.find(u=>u.id===b.target.slice(5))?.name??name;
  return name+' / '+p.label+' = '+Number((value/p.scale).toFixed(5))+' '+p.unit;
}
export function variableErrors(a,duration) {
  const errors=[],used=new Set();
  if(a.groupId)used.add(bindingKey({target:'group:'+a.groupId,parameter:'capacity.population'}));
  for(const [kind,list] of [['factors',a.factors??[]],['uncertainties',a.uncertainties??[]]]) {
    const limit=kind==='factors'?9:8;
    if(!Array.isArray(list)||list.length>limit){errors.push(kind+'は最大'+limit+'変数にしてください。');continue;}
    for(const b of list){
      const p=parameter(b?.parameter),key=bindingKey(b??{});
      if(!p||typeof b.target!=='string'){errors.push('未対応の変数または対象です。');continue;}
      if(used.has(key))errors.push('同じ変数を重複して指定できません。');used.add(key);
      const max=p.key==='mission.deadline'?Math.min(p.max,duration):p.max;
      const valid=v=>typeof v==='number'&&Number.isFinite(v)&&v>=p.min&&v<=max&&(!p.integer||Number.isInteger(v));
      if(kind==='factors') {
        if(!Array.isArray(b.values)||!b.values.length||b.values.length>12||b.values.some(v=>!valid(v))||new Set(b.values).size!==b.values.length)errors.push(p.label+': 比較値は範囲内で重複しない数値を1～12個指定してください。');
      }else if(!['uniform','triangular'].includes(b.distribution)||!valid(b.min)||!valid(b.max)||b.min>b.max||b.distribution==='triangular'&&(!valid(b.mode)||b.mode<b.min||b.mode>b.max))errors.push(p.label+': 分布の範囲・最頻値が不正です。');
    }
  }
  const conditions=(a.groupId?a.counts?.length??0:1)*(Array.isArray(a.factors)?a.factors.reduce((n,f)=>n*(f?.values?.length??0),1):1);
  if(conditions>24)errors.push('比較値の組合せは最大24条件にしてください。');
  if(conditions*a.trials>10000)errors.push('条件数×試行数は10000以下にしてください。');
  return errors;
}
export function analysisConditions(s) {
  const a=s.analysis;let conditions=a.groupId?[...a.counts].sort((x,y)=>x-y).map(count=>({count,settings:[{target:'group:'+a.groupId,parameter:'capacity.population',value:count}]})):[{settings:[]}];
  for(const f of a.factors??[])conditions=conditions.flatMap(c=>f.values.map(value=>({...c,settings:[...c.settings,{target:f.target,parameter:f.parameter,value}]})));
  return conditions.map((c,i)=>({...c,id:JSON.stringify(c.settings.map(b=>[bindingKey(b),b.value]).sort((x,y)=>x[0]<y[0]?-1:x[0]>y[0]?1:0)),index:i+1,label:c.settings.map(b=>formatBinding(s,b,b.value)).join(' / ')||'基準条件'}));
}
export function trialScenario(source,condition,trial,{maximum=false}={}) {
  const scenario=copy(source),sampled=[];scenario.trial=trial;
  // Shared uncertainty sample per binding and trial, independent of comparison values/order.
  for(const b of source.analysis.uncertainties??[]) {
    const u=random01(streamKey(scenario,bindingKey(b),'parameter-sample-v1'));
    let value=b.min;
    if(maximum)value=b.max;
    else if(b.max>b.min){if(b.distribution==='uniform')value=b.min+u*(b.max-b.min);else {const span=b.max-b.min,c=(b.mode-b.min)/span;value=u<c?b.min+Math.sqrt(u*span*(b.mode-b.min)):b.max-Math.sqrt((1-u)*span*(b.max-b.mode));}}
    if(parameter(b.parameter).integer)value=Math.round(value);
    sampled.push({target:b.target,parameter:b.parameter,value});
  }
  // Apply before removing a zero-count group, so other template factors still resolve.
  for(const b of [...condition.settings,...sampled])writeParameter(scenario,b,b.value);
  scenario.groups=scenario.groups?.filter(g=>g.count!==0);
  return {scenario,sampled};
}
