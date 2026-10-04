import {hasActions} from './action-settings.js?v=0.7.0-dev';
import {createSimulation,RecordedSimulation,sharedSteps,recordingPayload,restoreRecording} from './recorded-engine.js?v=0.7.0-dev';
import {detectionSteps,snapshotMission} from './detection.js?v=0.7.0-dev';
let simulation,result,missionError,latest,generation=0,running=false;
function send(){if(!simulation||!latest)return;const shared=simulation instanceof RecordedSimulation,pending=shared?!simulation.frames:hasActions(simulation.scenario)&&!result&&!missionError;const snapshot=simulation.evaluate(pending?0:latest.time);if(missionError)snapshot.missionError=missionError;
 if(result&&!shared){if(simulation.scenario.mission)snapshot.mission=snapshotMission(result,simulation.scenario.mission,snapshot.time);snapshot.actionEvents=(result.actionEvents??[]).filter(e=>e.time<=snapshot.time);}
 snapshot.actionsPending=pending;snapshot.recordingPending=shared&&pending;snapshot.recordingRunning=running;self.postMessage({type:'snapshot',revision:latest.revision,request:latest.request,snapshot});}
self.onmessage=({data})=>{try{
 if(data.type==='scenario'){const token=++generation;simulation=data.recording?restoreRecording(data.recording):createSimulation(data.scenario);result=null;missionError=null;running=false;latest=data;send();if(data.autoRecord&&simulation instanceof RecordedSimulation&&!simulation.frames)analyze(simulation,token,true);else if(!(simulation instanceof RecordedSimulation)&&(data.scenario.mission||hasActions(data.scenario)))analyze(simulation,token,false);}
 else if(data.revision===latest?.revision){
  if(data.type==='calculate'){latest={...latest,time:0,request:data.request};const token=++generation;simulation=createSimulation(latest.scenario);missionError=null;analyze(simulation,token,true);}
  else if(data.type==='cancelRecording'){generation++;running=false;simulation=createSimulation(latest.scenario);send();}
  else if(data.type==='exportRecording'){self.postMessage({type:'recordingExport',revision:data.revision,payload:recordingPayload(simulation)});}
  else {latest={...latest,...data,scenario:latest.scenario};send();}
 }
}catch(error){self.postMessage({type:'error',revision:data.revision,message:error.message});}};
async function analyze(model,token,record){running=true;send();try{
 const generator=model instanceof RecordedSimulation?sharedSteps(model,model.source.mission,undefined,{horizon:model.source.duration,record:true}):detectionSteps(model,model.scenario.mission,model.scenario.analysis?.step??10,{horizon:model.scenario.duration});let state=generator.next(),lastYield=performance.now(),lastProgress=0;
 while(!state.done){if(performance.now()-lastYield>16){await new Promise(r=>setTimeout(r,0));lastYield=performance.now();if(token!==generation)return;}if(record&&performance.now()-lastProgress>150){self.postMessage({type:'recordingProgress',revision:latest.revision,time:state.value.time,duration:model.source.duration});lastProgress=performance.now();}state=generator.next();}
 if(token!==generation)return;result=state.value;
}catch(error){if(token!==generation)return;missionError=error.message;}if(token===generation){running=false;send();}}
