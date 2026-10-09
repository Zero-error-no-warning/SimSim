import {clone,validateScenario} from './engine.js?v=20261007-plan-switch-25';
import {writeParameter,trialScenario,parameter} from './parameters.js?v=20261007-plan-switch-25';
import {random01} from './random.js?v=20261007-plan-switch-25';
import {constraintsSatisfied,experimentErrors} from './experiment-settings.js?v=20261007-plan-switch-25';
import {createSimulation,sharedSteps,recordModel} from './recorded-engine.js?v=20261007-plan-switch-25';
import {wilson} from './detection.js?v=20261007-plan-switch-25';
import {UI_BUILD} from './ui-dom.js?v=20261007-plan-switch-25';
export function controlValues(e,index,phase='explore',bounds={}){
 const values={};for(const c of e.controls){const [min,max]=bounds[c.id]??[c.min,c.max],u=random01((e.designSeed??'SimSim-design')+'|'+phase+'|'+index+'|'+c.id);let value=min+u*(max-min);if(parameter(c.parameter).integer)value=Math.round(value);values[c.id]=value;}return values;
}
export function experimentCandidates(s){
 const e=s.experiment,errors=experimentErrors(s);if(errors.length)throw Error(errors.join('\n'));
 const items=[],seen=new Set();for(let i=0;i<Math.max(100,(e.candidates??32)*100)&&items.length<(e.candidates??32);i++){
  const values=controlValues(e,i),key=JSON.stringify(values);if(seen.has(key)||!constraintsSatisfied(e,values))continue;seen.add(key);items.push({id:'candidate-'+items.length,values});
 }
 if(items.length<(e.candidates??32))throw Error('制約を満たす異なる運用値を必要数生成できません。候補数・範囲・制約を見直してください。');return items;
}
export function experimentSample(source,candidate,profile,trial,phase='explore'){
 const base=clone(source);base.seed=(source.seed??'SimSim')+'|'+phase;delete base.experiment;
 for(const b of profile.changes)writeParameter(base,b,b.value);
 const settings=source.experiment.controls.map(c=>({...c,value:candidate.values[c.id]}));
 const {scenario,sampled}=trialScenario(base,{settings},trial);validateScenario(scenario);return {scenario,sampled};
}
export function experimentSummary(rows){const successes=rows.filter(r=>r.success).length;return {total:rows.length,successes,failures:rows.length-successes,invalid:rows.filter(r=>r.invalidUnits||r.constrainedPaths).length,...wilson(successes,rows.length)};}
export function experimentIdentity(s){return {model:recordModel(s),implementation:UI_BUILD,source:clone(s)};}
export async function runExperiment(source,{checkpoint,onProgress=()=>{},cancelled=()=>false}={}){
 const s=validateScenario(source),candidates=experimentCandidates(s),profiles=s.experiment.enemyProfiles??[{id:'baseline',changes:[]}],trials=s.experiment.trials??64,planned=candidates.length*profiles.length*trials;
 if(checkpoint&&(checkpoint.type!=='SimSim-experiment'||checkpoint.version!==1||checkpoint.implementation!==UI_BUILD||checkpoint.model!==recordModel(s)||JSON.stringify(checkpoint.source)!==JSON.stringify(s)||!Array.isArray(checkpoint.rows)||checkpoint.rows.length>planned))throw Error('再開データと入力・実装版が一致しません。');
 const result={type:'SimSim-experiment',version:1,...experimentIdentity(s),candidates,profiles,rows:checkpoint?clone(checkpoint.rows):[],planned,completed:checkpoint?.rows.length??0,status:'running'};
 for(let index=0;index<result.rows.length;index++){const r=result.rows[index],candidate=candidates[Math.floor(index/(profiles.length*trials))],profile=profiles[Math.floor(index/trials)%profiles.length];if(r.index!==index||r.candidateId!==candidate.id||r.profileId!==profile.id||r.trial!==(s.trial??0)+index%trials||typeof r.success!=='boolean')throw Error('再開データの試行対応が不正です。');}
 let last=performance.now();for(let index=result.completed;index<planned;index++){
  if(cancelled()){result.status='paused';break;}
  const candidate=candidates[Math.floor(index/(profiles.length*trials))],profile=profiles[Math.floor(index/trials)%profiles.length],trial=(s.trial??0)+index%trials,{scenario,sampled}=experimentSample(s,candidate,profile,trial),m=createSimulation(scenario),g=sharedSteps(m,undefined,undefined,{storage:'summary'});
  let step=g.next();while(!step.done){if(performance.now()-last>16){await new Promise(r=>setTimeout(r,0));last=performance.now();if(cancelled()){result.status='paused';return result;}}step=g.next();}
  const r=step.value;result.rows.push({index,candidateId:candidate.id,profileId:profile.id,trial,sampled,success:r.success,successTime:r.successTime,invalidUnits:r.invalidUnits,constrainedPaths:r.constrainedPaths,informationMetrics:r.informationMetrics,...(r.measurements?{measurements:r.measurements}:{})});result.completed=result.rows.length;
  if(performance.now()-last>16||index===planned-1){onProgress(result);await new Promise(r=>setTimeout(r,0));last=performance.now();}
 }
 if(result.completed===planned)result.status='complete';result.summary=experimentSummary(result.rows);onProgress(result);return result;
}
