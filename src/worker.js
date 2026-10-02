import {Simulation} from './engine.js?v=0.4';
import {detectionSteps,snapshotMission} from './detection.js?v=0.4';
let simulation,result,missionError,latest,generation=0;
function send() {
  if(!simulation||!latest)return;
  const snapshot=simulation.evaluate(latest.time);
  if(missionError)snapshot.missionError=missionError;
  if(result)snapshot.mission=snapshotMission(result,simulation.scenario.mission,snapshot.time);
  self.postMessage({type:'snapshot',revision:latest.revision,request:latest.request,snapshot});
}
self.onmessage=({data})=>{
  try {
    if(data.type==='scenario') {
      const token=++generation;
      simulation=new Simulation(data.scenario);result=null;missionError=null;latest=data;send();
      if(data.scenario.mission)analyze(simulation,token);
    }else if(data.revision===latest?.revision){latest=data;send();}
  }catch(error){self.postMessage({type:'error',revision:data.revision,message:error.message});}
};
async function analyze(model,token) {
  try {
    const generator=detectionSteps(model);let state=generator.next(),lastYield=performance.now();
    while(!state.done) {
      if(performance.now()-lastYield>16){await new Promise(r=>setTimeout(r,0));lastYield=performance.now();if(token!==generation)return;}
      state=generator.next();
    }
    if(token!==generation)return;result=state.value;
  }catch(error){if(token!==generation)return;missionError=error.message;}
  send();
}
