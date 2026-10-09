import {clone,validateScenario} from './engine.js?v=20261009-configuration-contract-28';
import {constraintsSatisfied} from './experiment-settings.js?v=20261009-configuration-contract-28';
import {controlValues,experimentSample,experimentSummary,experimentIdentity} from './experiment.js?v=20261009-configuration-contract-28';
import {readParameter,writeParameter} from './parameters.js?v=20261009-configuration-contract-28';
import {createSimulation,sharedSteps,recordModel} from './recorded-engine.js?v=20261009-configuration-contract-28';
import {MODEL_BUILD} from './model-version.js?v=20261009-configuration-contract-28';
const contains=(values,bounds)=>Object.entries(bounds).every(([id,[lo,hi]])=>values[id]>=lo&&values[id]<=hi);
export function extractPatterns(experiment,{maxRules=4,minCandidates=4}={}){
 if(experiment.status!=='complete'||experiment.completed!==experiment.planned)throw Error('定石の抽出には探索の完了が必要です。');
 const e=experiment.source.experiment,required=e.requiredRate??experiment.source.analysis.requiredRate,atoms=e.controls.flatMap(c=>{const mid=(c.min+c.max)/2;return c.min===c.max?[]:[{id:c.id,range:[c.min,mid]},{id:c.id,range:[mid,c.max]}];}),rules=[],seen=new Set();
 const consider=parts=>{
  const bounds=Object.fromEntries(parts.map(p=>[p.id,p.range])),candidates=experiment.candidates.filter(c=>contains(c.values,bounds));if(candidates.length<minCandidates)return;
  const ids=new Set(candidates.map(c=>c.id)),rows=experiment.rows.filter(r=>ids.has(r.candidateId)),summary=experimentSummary(rows),signature=candidates.map(c=>c.id).join('|');
  if(seen.has(signature)||summary.invalid||summary.rate<required)return;
  const profiles=experiment.profiles.map(p=>({id:p.id,...experimentSummary(rows.filter(r=>r.profileId===p.id))}));if(profiles.some(p=>p.rate<required))return;seen.add(signature);
  rules.push({id:'pattern-'+rules.length,status:'candidate',bounds,supportCandidates:candidates.length,exploration:summary,profiles,representatives:rows.filter(r=>r.success).slice(0,2).map(r=>r.index),failures:rows.filter(r=>!r.success).slice(0,4).map(r=>r.index),requiredRate:required,sourceExperiment:{model:experiment.model,implementation:experiment.implementation,designSeed:e.designSeed??'SimSim-design'},controls:clone(e.controls),applicability:patternContext(experiment.source),qualification:'設定分布と敵想定に対する候補。区間内の全点の保証ではない。'});
 };
 for(let size=1;size<=3;size++){const visit=(parts,start)=>{if(parts.length===size){consider(parts);return;}for(let i=start;i<atoms.length;i++)if(!parts.some(p=>p.id===atoms[i].id))visit([...parts,atoms[i]],i+1);};visit([],0);}
 return rules.sort((a,b)=>b.exploration.low-a.exploration.low||b.supportCandidates-a.supportCandidates||Object.keys(a.bounds).length-Object.keys(b.bounds).length||a.id.localeCompare(b.id)).slice(0,maxRules).map((r,i)=>({...r,id:'pattern-'+i}));
}
// Exact one-sided binomial lower limit, with Bonferroni adjustment across all
// frozen rules, profiles and tested operating points. No independence between
// comparisons is assumed by this adjustment.
export function binomialLower(successes,n,alpha=.05){
 if(!n||!successes)return 0;
 const coefficients=new Float64Array(n+1);for(let k=1;k<=n;k++)coefficients[k]=coefficients[k-1]+Math.log(n-k+1)-Math.log(k);
 let lo=0,hi=1;for(let i=0;i<50;i++){const p=(lo+hi)/2;let tail=0;for(let k=successes;k<=n;k++)tail+=Math.exp(coefficients[k]+k*Math.log(p)+(n-k)*Math.log1p(-p));if(tail<alpha)lo=p;else hi=p;}return (lo+hi)/2;
}
export async function validatePatterns(experiment,rules,{operatingPoints=8,trials=64,onProgress=()=>{},cancelled=()=>false}={}){
 if(experiment.status!=='complete'||experiment.implementation!==MODEL_BUILD||experiment.model!==recordModel(experiment.source))throw Error('探索の入力・実装版が一致しません。');
 if(!Number.isInteger(operatingPoints)||operatingPoints<1||operatingPoints>16||!Number.isInteger(trials)||trials<1||trials>2000||rules.length>4||rules.length*operatingPoints*trials*experiment.profiles.length>10000)throw Error('検証予算が上限を超えています。');
 // Freeze the extracted definitions; callers cannot supply looser made-up rules.
 const extracted=extractPatterns(experiment);for(const rule of rules)if(!extracted.some(r=>JSON.stringify(r)===JSON.stringify(rule)))throw Error('検証対象は探索から抽出した未変更の候補にしてください。');
 const results=clone(rules),explored=new Set(experiment.candidates.map(c=>JSON.stringify(c.values))),family=Math.max(1,results.length*(1+experiment.profiles.length+operatingPoints*experiment.profiles.length)),alpha=.05/family;let completed=0,last=performance.now();
 for(const rule of results){
  rule.validation={operatingPoints:[],rows:[],alpha,confidenceFamily:family,seedNamespace:'verify-'+rule.id};
  const used=new Set(explored);
  for(let i=0;i<operatingPoints*1000&&rule.validation.operatingPoints.length<operatingPoints;i++){
   const values=controlValues(experiment.source.experiment,i,'verify-'+rule.id,rule.bounds),key=JSON.stringify(values);if(used.has(key)||!constraintsSatisfied(experiment.source.experiment,values))continue;used.add(key);rule.validation.operatingPoints.push({id:'verify-'+rule.id+'-'+rule.validation.operatingPoints.length,values});
  }
  if(rule.validation.operatingPoints.length<operatingPoints){rule.status='insufficient';rule.reason='未試行の運用組合せを必要数生成できません。';continue;}
  for(const candidate of rule.validation.operatingPoints)for(const profile of experiment.profiles)for(let i=0;i<trials;i++){
   if(cancelled()){rule.status='unverified';return results;}
   const trial=(experiment.source.trial??0)+i,{scenario,sampled}=experimentSample(experiment.source,candidate,profile,trial,'verify-'+rule.id),model=createSimulation(scenario),generator=sharedSteps(model,undefined,undefined,{storage:'summary'});let step=generator.next();
   while(!step.done){if(performance.now()-last>16){await new Promise(r=>setTimeout(r,0));last=performance.now();if(cancelled()){rule.status='unverified';return results;}}step=generator.next();}
   const r=step.value;rule.validation.rows.push({candidateId:candidate.id,profileId:profile.id,trial,sampled,success:r.success,successTime:r.successTime,invalidUnits:r.invalidUnits,constrainedPaths:r.constrainedPaths});completed++;
   if(performance.now()-last>16){onProgress({completed,planned:results.length*operatingPoints*trials*experiment.profiles.length});await new Promise(r=>setTimeout(r,0));last=performance.now();}
  }
  const summarize=rows=>{const s=experimentSummary(rows);return {...s,lower:binomialLower(s.successes,s.total,alpha)};};
  rule.validation.summary=summarize(rule.validation.rows);
  rule.validation.profiles=experiment.profiles.map(p=>({id:p.id,...summarize(rule.validation.rows.filter(r=>r.profileId===p.id))}));
  rule.validation.pointProfiles=rule.validation.operatingPoints.flatMap(c=>experiment.profiles.map(p=>({candidateId:c.id,profileId:p.id,...summarize(rule.validation.rows.filter(r=>r.profileId===p.id&&r.candidateId===c.id))})));
  const checks=[rule.validation.summary,...rule.validation.profiles,...rule.validation.pointProfiles];
  rule.status=checks.some(c=>c.invalid)?'invalid':checks.every(c=>c.lower>=rule.requiredRate)?'adopted':'unverified';
  rule.reason=rule.status==='adopted'?'固定した候補・分布・想定の検証基準を満たしました。':rule.status==='invalid'?'設定不正・経路制約を含むため採用できません。':'要求成立率に対する下限が足りません。予算不足または条件内の失敗を確認してください。';
 }
 onProgress({completed,planned:results.length*operatingPoints*trials*experiment.profiles.length});return results;
}
export function patternContext(source){
 const s=clone(validateScenario(source));for(const c of s.experiment?.controls??[])writeParameter(s,c,c.min);
 s.analysis={uncertainties:s.analysis?.uncertainties??[]};s.patternEnvironment={enemyProfiles:s.experiment?.enemyProfiles??[{id:'baseline',changes:[]}],constraints:s.experiment?.constraints??[]};
 for(const key of ['title','seed','trial','experiment'])delete s[key];return s;
}
export function patternPayload(experiment,rules){return {type:'SimSim-patterns',version:1,...experimentIdentity(experiment.source),experiment:clone(experiment),rules:clone(rules)};}
export function applyPattern(source,rule,values,{allowCandidate=false}={}){
 if(rule.status!=='adopted'&&!allowCandidate)throw Error('独立検証で採用条件を満たした定石を選択してください。');
 if(rule.sourceExperiment.implementation!==MODEL_BUILD||rule.sourceExperiment.model!==recordModel(source)||JSON.stringify(patternContext(source))!==JSON.stringify(rule.applicability))throw Error('任務・対象ID・地形・モデル仮定が定石の適用条件と一致しません。');
 if(!contains(values,rule.bounds)||!constraintsSatisfied(source.experiment,values))throw Error('適用値が定石範囲・制約を満たしていません。');
 const s=clone(source),changes=[];for(const c of rule.controls){const value=values[c.id];if(!Number.isFinite(value)||value<c.min||value>c.max)throw Error('適用する運用値が不正です。');changes.push({...c,before:readParameter(s,c),after:value});writeParameter(s,c,value);}validateScenario(s);return {scenario:s,changes};
}
