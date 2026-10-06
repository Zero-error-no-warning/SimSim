import { trialScenario } from './parameters.js?v=20261006-terrain-grid-17';
import { createSimulation } from './recorded-engine.js?v=20261006-terrain-grid-17';
import { prepareAnalysis,detectionSteps,summarizeRow } from './detection.js?v=20261006-terrain-grid-17';
let generation=0;
self.onmessage=({
  data
})=>{
  if(data.type==='cancel'){
    generation++;
    return;
  }
  if(data.type==='run')run(data,++generation);
};
async function run(data,token) {
  const start=performance.now();
  try {
    const {
      scenario,analysis,startTrial,conditions
    }
    =prepareAnalysis(data.scenario),rows=[],planned=conditions.length*analysis.trials;
    let completed=0,lastProgress=0,lastYield=performance.now();
    for(const condition of conditions) {
      const trials=[];
      for(let i=0;i<analysis.trials;i++) {
        if(token!==generation)return;
        const trial=startTrial+i,{
          scenario:sample,sampled
        }
        =trialScenario(scenario,condition,trial),model=createSimulation(sample),generator=detectionSteps(model,sample.mission,analysis.step);
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
          ...(result.measurements?{measurements:result.measurements}:{}),          ...(sample.mission?.type==='state'?{stateEntries:result.stateEntries,stateTargetCount:result.stateTargetCount,stateReachedCount:result.stateReachedCount}:{}),reachedCount:result.reachedCount??0,responderCount:result.responderCount??0,trial,sampled,success:result.success,successTime:result.successTime,detectedCount:result.detectedCount,targetCount:result.targetCount,invalidUnits:result.invalidUnits,constrainedPaths:result.constrainedPaths
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
