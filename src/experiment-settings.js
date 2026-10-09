import {parameter,bindingKey,readParameter} from './parameters.js?v=20261009-map-workspace-29';
export function bindingFaction(s,b){
 const [kind,id]=b.target.split(':');
 if(kind==='unit')return s.units.find(u=>u.id===id)?.faction;
 if(kind==='group')return s.groups?.find(g=>g.id===id)?.template.faction;
 const assignments=kind==='assignment'?s.behaviorAssignments.filter(a=>a.id===id):kind==='behavior'?s.behaviorAssignments.filter(a=>a.behaviorId===id):[];
 const factions=assignments.flatMap(a=>a.targets.map(target=>bindingFaction(s,{target})));return factions.length&&factions.every(f=>f===factions[0])?factions[0]:undefined;
}
export function constraintsSatisfied(e,values){
 return (e.constraints??[]).every(c=>{const left=c.terms.reduce((sum,t)=>sum+values[t.controlId]*(t.coefficient??1),0);return c.op==='lte'?left<=c.value+1e-9:c.op==='gte'?left>=c.value-1e-9:Math.abs(left-c.value)<1e-9;});
}
export function experimentErrors(s){
 const e=s.experiment;if(e===undefined)return [];
 if(s.version<4||!e||typeof e!=='object')return ['実験にはversion 4とexperimentオブジェクトを指定してください。'];
 const errors=[],seen=new Set(),ids=new Set(),number=(x,min,max)=>Number.isFinite(x)&&x>=min&&x<=max;
 if(!Array.isArray(e.controls)||!e.controls.length||e.controls.length>8)return ['運用変数controlsは1～8件です。'];
 if(!s.mission||!s.analysis)errors.push('実験には任務目標とanalysisを指定してください。');
 for(const c of e.controls){const p=parameter(c?.parameter);if(!c||!p||typeof c.id!=='string'||!c.id.match(/^[A-Za-z0-9_-]{1,64}$/)||ids.has(c.id)||!number(c.min,p.min,p.max)||!number(c.max,p.min,p.max)||c.min>c.max||p.integer&&(!Number.isInteger(c.min)||!Number.isInteger(c.max))){errors.push('運用変数のID・範囲が不正です。');continue;}
  ids.add(c.id);try{readParameter(s,c);if(bindingFaction(s,c)!=='friendly')errors.push('運用変数は味方の対象に限定してください。');}catch(err){errors.push(err.message);}
  const key=bindingKey(c);if(seen.has(key)||s.analysis?.uncertainties?.some(u=>bindingKey(u)===key))errors.push('運用変数・状況変数の同じ属性を重複指定できません。');seen.add(key);
 }
 const profiles=e.enemyProfiles??[{id:'baseline',changes:[]}];
 if(!Array.isArray(profiles)||!profiles.length||profiles.length>8)errors.push('敵想定は1～8件です。');else{const used=new Set();for(const profile of profiles){if(!profile||typeof profile.id!=='string'||used.has(profile.id)||!Array.isArray(profile.changes)||profile.changes.length>16){errors.push('敵想定のID・変更値が不正です。');continue;}used.add(profile.id);for(const b of profile.changes){try{const p=parameter(b.parameter);if(!p||!number(b.value,p.min,p.max)||p.integer&&!Number.isInteger(b.value)||bindingFaction(s,b)!=='hostile')errors.push('敵想定の変更は敵の登録属性・範囲に限定してください。');else readParameter(s,b);if(s.analysis?.uncertainties?.some(u=>bindingKey(u)===bindingKey(b)))errors.push('敵想定値を状況変数で上書きできません。');}catch(err){errors.push(err.message);}}}}
 if(e.constraints!==undefined&&(!Array.isArray(e.constraints)||e.constraints.length>32))errors.push('変数制約は最大32件です。');else for(const c of e.constraints??[])if(!c||!['lte','gte','eq'].includes(c.op)||!Number.isFinite(c.value)||!Array.isArray(c.terms)||!c.terms.length||c.terms.length>8||c.terms.some(t=>!ids.has(t.controlId)||t.coefficient!==undefined&&!Number.isFinite(t.coefficient)))errors.push('変数制約の式が不正です。');
 const candidates=e.candidates??32,trials=e.trials??64;
 if(!Number.isInteger(candidates)||candidates<1||candidates>64||!Number.isInteger(trials)||trials<1||trials>2000||candidates*trials*profiles.length>10000)errors.push('候補数1～64、試行数1～2000、全体10000試行以下にしてください。');
 if(e.requiredRate!==undefined&&!number(e.requiredRate,0,1))errors.push('定石の要求成立率は0～1です。');
 return errors;
}
