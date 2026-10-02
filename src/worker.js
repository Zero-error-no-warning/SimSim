import {Simulation} from './engine.js';
let simulation;
self.onmessage = ({data}) => {
  try {
    if(data.type==='scenario') simulation=new Simulation(data.scenario);
    if(!simulation) throw new Error('シナリオが設定されていません。');
    self.postMessage({type:'snapshot',revision:data.revision,request:data.request,snapshot:simulation.evaluate(data.time)});
  } catch(error) {self.postMessage({type:'error',revision:data.revision,message:error.message});}
};
