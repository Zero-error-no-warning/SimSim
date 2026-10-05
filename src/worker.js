import { createSimulation, sharedSteps, recordingPayload, restoreRecording } from './recorded-engine.js?v=20261005-state-events-4';
let simulation, latest, generation=0, state='idle', failure=null;
function send() {
  if(!simulation||!latest)return;
  const snapshot=simulation.evaluate(simulation.frames?latest.time:0);
  if(simulation.frames&&latest.showTrails){
    const ids=simulation.states.length<=80?simulation.states.map(s=>s.unit.id):[latest.selected];
    snapshot.trails=Object.fromEntries(ids.filter(Boolean).map(id=>[id,simulation.trailPoints(id,snapshot.time)]));
  }
  snapshot.executionState=state;
  snapshot.recordingRunning=state==='running';
  snapshot.recordingPending=!simulation.frames;
  snapshot.actionsPending=!simulation.frames;
  if(failure)snapshot.missionError=failure;
  self.postMessage({
    type:'snapshot',revision:latest.revision,request:latest.request,snapshot
  });
}
self.onmessage=({
  data
})=>{
  // Probe this actual module graph independently of page initialization.
  if(data.type==='ping'){
    self.postMessage({type:'pong'});
    return;
  }
  try {
    if(data.type==='scenario') {
      const token=++generation;
      latest=data;
      failure=null;
      simulation=data.recording?restoreRecording(data.recording):createSimulation(data.scenario);
      state=simulation.frames?'ready':'idle';
      send();
      if(data.autoRecord&&!simulation.frames)calculate(token);
    } else if(data.revision===latest?.revision) {
      latest={
        ...latest,...data,scenario:latest.scenario
      };
      if(data.type==='calculate'){
        const token=++generation;
        simulation=createSimulation(latest.scenario);
        latest.time=0;
        failure=null;
        calculate(token);
      }
      else if(data.type==='cancelRecording'){
        generation++;
        state='cancelled';
        simulation=createSimulation(latest.scenario);
        send();
      }
      else if(data.type==='exportRecording')self.postMessage({
        type:'recordingExport',revision:data.revision,payload:recordingPayload(simulation)
      });
      else send();
    }
  } catch(error){
    state='failed';
    failure=error.message;
    send();
    self.postMessage({
      type:'error',revision:data.revision,message:error.message
    });
  }
};
async function calculate(token) {
  state='running';
  send();
  try {
    const generator=sharedSteps(simulation,simulation.source.mission,undefined,{
      horizon:simulation.source.duration,record:true
    });
    let current=generator.next(),lastYield=performance.now(),lastProgress=0;
    while(!current.done){
      if(performance.now()-lastYield>16){
        await new Promise(r=>setTimeout(r,0));
        lastYield=performance.now();
        if(token!==generation)return;
      }
      if(performance.now()-lastProgress>150){
        lastProgress=performance.now();
        self.postMessage({
          type:'recordingProgress',revision:latest.revision,time:current.value.time,duration:simulation.source.duration
        });
      }
      current=generator.next();
    }
    if(token!==generation)return;
    state='ready';
  }catch(error){
    if(token!==generation)return;
    state='failed';
    failure=error.message;
  }
  send();
}
