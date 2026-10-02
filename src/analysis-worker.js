import {Simulation} from './engine.js?v=0.3';
import {prepareAnalysis,scenarioForCount,detectionSteps,summarizeRow} from './detection.js?v=0.3';
let generation=0;
self.onmessage=({data})=>{
  if(data.type==='cancel'){generation++;return;}
  if(data.type==='run')run(data,++generation);
};
async function run(data,token) {
  const start=performance.now();
  try {
    const {scenario,analysis,startTrial}=prepareAnalysis(data.scenario),rows=[],planned=analysis.counts.length*analysis.trials;let completed=0,lastProgress=0,lastYield=performance.now();
    for(const count of [...analysis.counts].sort((a,b)=>a-b)) {
      const trials=[];
      for(let i=0;i<analysis.trials;i++) {
        if(token!==generation)return;
        const trial=startTrial+i,model=new Simulation(scenarioForCount(scenario,analysis.groupId,count,trial)),generator=detectionSteps(model,scenario.mission,analysis.step);
        let state=generator.next();
        while(!state.done) {
          if(performance.now()-lastYield>16){await new Promise(r=>setTimeout(r,0));lastYield=performance.now();if(token!==generation)return;}
          state=generator.next();
        }
        const result=state.value;trials.push({trial,success:result.success,successTime:result.successTime,detectedCount:result.detectedCount,targetCount:result.targetCount,invalidUnits:result.invalidUnits,constrainedPaths:result.constrainedPaths});completed++;
        if(performance.now()-lastProgress>120||i===analysis.trials-1){lastProgress=performance.now();self.postMessage({type:'progress',runId:data.runId,completed,planned,elapsedMs:performance.now()-start,rows:[...rows,summarizeRow(count,trials)]});}
        await new Promise(r=>setTimeout(r,0));lastYield=performance.now();
      }
      rows.push(summarizeRow(count,trials));
    }
    if(token===generation)self.postMessage({type:'complete',runId:data.runId,completed,planned,elapsedMs:performance.now()-start,rows});
  }catch(error){if(token===generation)self.postMessage({type:'error',runId:data.runId,message:error.message});}
}
