import fs from 'node:fs';
import {MODEL_BUILD} from '../src/model-version.js?v=20261009-authoring-display-27';
import {UI_BUILD} from '../src/ui-dom.js?v=20261009-authoring-display-27';
import {createSimulation,sharedSteps} from '../src/recorded-engine.js?v=20261009-authoring-display-27';
const source=JSON.parse(fs.readFileSync(new URL('../data/sustainment-mission.txt',import.meta.url))),rows=[];
for(const storage of ['summary','events','replay']){
 const start=performance.now(),model=createSimulation(source),initialized=performance.now(),generator=sharedSteps(model,undefined,undefined,{horizon:source.duration,storage,record:storage==='replay'});let step=generator.next();while(!step.done)step=generator.next();const result=step.value;
 rows.push({storage,units:model.states.length,duration:source.duration,initializationMs:initialized-start,executionMs:performance.now()-initialized,recordBytes:model.recordBytes,resultBytes:Buffer.byteLength(JSON.stringify(result)),...result.storageStats,success:result.success,successTime:result.successTime});
}
console.log(JSON.stringify({implementation:MODEL_BUILD,uiBuild:UI_BUILD,scenario:source.title,rows},null,2));
