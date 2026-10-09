import {runExperiment} from './experiment.js?v=20261009-select-state-30';
import {validatePatterns} from './patterns.js?v=20261009-select-state-30';
import {RUNTIME_BUILD} from './ui-dom.js?v=20261009-select-state-30';
import {preparePlans} from './plans.js?v=20261009-select-state-30';
import {prepareSensitivity} from './sensitivity.js?v=20261009-select-state-30';
import { trialScenario } from './parameters.js?v=20261009-select-state-30';
import { createSimulation } from './recorded-engine.js?v=20261009-select-state-30';
import { prepareAnalysis,detectionSteps,summarizeRow } from './detection.js?v=20261009-select-state-30';
let generation=0;
self.onmessage=({
  data
})=>{
  if(data.type==='ping'){self.postMessage({type:'pong',build:RUNTIME_BUILD});return;}
  if(data.type==='cancel'){
    generation++;
    return;
  }
  if(['experiment','validatePatterns'].includes(data.type)){runOperations(data,++generation);return;}
  if(['run','sensitivity','plans'].includes(data.type))run(data,++generation);
};
async function run(data,token) {
  const start=performance.now();
  try {
    const {
      scenario,trialSource,sources,analysis,startTrial,conditions
    }
    =(data.type==='plans'?preparePlans(data.scenario):data.type==='sensitivity'?prepareSensitivity(data.scenario):prepareAnalysis(data.scenario)),rows=[],planned=conditions.length*analysis.trials;
    let completed=0,lastProgress=0,lastYield=performance.now();
    for(const condition of conditions) {
      const trials=[];
      for(let i=0;i<analysis.trials;i++) {
        if(token!==generation)return;
        const trial=startTrial+i,{
          scenario:sample,sampled
        }
        =trialScenario(sources?.[condition.id]??trialSource??scenario,condition,trial),model=createSimulation(sample),generator=detectionSteps(model,sample.mission,analysis.step,{storage:'summary'});
        let state=generator.next();
        while(!state.done) {
          if(performance.now()-lastYield>16){
            await new Promise(r=>setTimeout(r,0));
            lastYield=performance.now();
            if(token!==generation)return;
          }
          state=generator.next();
        }
        const result=state.value;
        trials.push({
          ...(result.informationMetrics?{informationMetrics:result.informationMetrics}:{}),...(result.measurements?{measurements:result.measurements}:{}),          ...(sample.mission?.type==='state'?{stateEntries:result.stateEntries,stateTargetCount:result.stateTargetCount,stateReachedCount:result.stateReachedCount}:{}),reachedCount:result.reachedCount??0,responderCount:result.responderCount??0,trial,sampled,success:result.success,successTime:result.successTime,detectedCount:result.detectedCount,targetCount:result.targetCount,invalidUnits:result.invalidUnits,constrainedPaths:result.constrainedPaths
        });
        completed++;
        if(performance.now()-lastProgress>120||i===analysis.trials-1){
          lastProgress=performance.now();
          self.postMessage({
            type:'progress',runId:data.runId,completed,planned,elapsedMs:performance.now()-start,rows:[...rows,{
              ...summarizeRow(condition.count,trials),condition
            }]
          });
        }
        await new Promise(r=>setTimeout(r,0));
        lastYield=performance.now();
      }
      rows.push({
        ...summarizeRow(condition.count,trials),condition
      });
    }
    if(token===generation)self.postMessage({
      type:'complete',runId:data.runId,completed,planned,elapsedMs:performance.now()-start,rows
    });
  }catch(error){
    if(token===generation)self.postMessage({
      type:'error',runId:data.runId,message:error.message
    });
  }
}

async function runOperations(data,token){
 try{let lastProgress=0;
  if(data.type==='experiment'){
   const result=await runExperiment(data.scenario,{checkpoint:data.checkpoint,cancelled:()=>token!==generation,onProgress:result=>{if(performance.now()-lastProgress>120){lastProgress=performance.now();self.postMessage({type:'experimentProgress',runId:data.runId,result});}}});
   self.postMessage({type:'experimentComplete',runId:data.runId,result});
  }else{
   const rules=await validatePatterns(data.experiment,data.rules,{operatingPoints:data.operatingPoints,trials:data.trials,cancelled:()=>token!==generation,onProgress:progress=>self.postMessage({type:'patternProgress',runId:data.runId,...progress})});self.postMessage({type:'patternComplete',runId:data.runId,rules});
  }
 }catch(error){self.postMessage({type:'experimentError',runId:data.runId,message:error.message});}
}
