import {validateInformationMetrics} from './information-metrics.js?v=20261009-configuration-contract-28';
import {MODEL_BUILD} from './model-version.js?v=20261009-configuration-contract-28';
import {measurePoints,validateMeasurements} from './measurement-points.js?v=20261009-configuration-contract-28';
import {StateTracker,stateMembers,validateStateResult} from './state-measurement.js?v=20261009-configuration-contract-28';
export { RECORD_MODEL,recordModel,compatibleModel } from './recorded-engine.js?v=20261009-configuration-contract-28';
import { clone } from './engine.js?v=20261009-configuration-contract-28';
import { RecordedSimulation, RECORD_MODEL,recordModel,compatibleModel, STATUS, MAX_RECORD_BYTES } from './recorded-engine.js?v=20261009-configuration-contract-28';
export const MAX_FILE_BYTES = 256 * 1048576;
const encode = a => {
  const bytes=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);
  let s='';
  for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(s);
};
const decode = (text, Type, length) => {
  if(typeof text!=='string'||text.length>Math.ceil(length*Type.BYTES_PER_ELEMENT/3)*4+4)throw Error('記録配列の長さが不正です。');
  const s=atob(text);
  if(s.length!==length*Type.BYTES_PER_ELEMENT)throw Error('記録配列の長さが不正です。');
  const a=new Uint8Array(s.length);
  for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);
  return new Type(a.buffer);
};
export function recordingPayload(model) {
  if(!model.frames)throw Error('計算・記録を先に実行してください。');
  const payload={
    type:'SimSim-recording',version:2,model:recordModel(model.source),source:clone(model.source),...(model.source.version>=4?{implementation:MODEL_BUILD,resourceNames:model.resourceNames}:{}),unitIds:model.states.map(s=>s.unit.id),nodeNames:model.nodeNames,result:model.result,frames:model.frames.map(f=>({
      time:f.time,values:encode(f.values),nodes:encode(f.nodes),status:encode(f.status),...(f.resources?{resources:encode(f.resources)}:{})
    }))
  };
  if(new TextEncoder().encode(JSON.stringify(payload)).byteLength>MAX_FILE_BYTES)throw Error('保存形式で256MiBを超えます。期間・個数を減らしてください。');
  return payload;
}
const position = p => p&&['x','y','z'].every(k=>Number.isFinite(p[k]));
const types = new Set(['detected','sent','sendFailed','received','arrived','elapsed','nodeChanged','departed','preparing','initialized','triggered','near','decision','commandRejected','deliveryFailed','operationalChanged','resourceChanged']);
export function restoreRecording(payload) {
  if(payload?.type!=='SimSim-recording'||payload.version!==2||!compatibleModel(payload)||!Array.isArray(payload.frames)||!payload.frames.length)throw Error('対応していない記録モデルです。旧版の記録は元の版で再生してください。');
  const model=new RecordedSimulation(payload.source),n=model.states.length;
  if(model.source.version>=4&&payload.implementation!==MODEL_BUILD)throw Error('記録の実装版が一致しません。保存した版で再生してください。');
  if(payload.source.version<3||JSON.stringify(payload.unitIds)!==JSON.stringify(model.states.map(s=>s.unit.id))||JSON.stringify(payload.nodeNames)!==JSON.stringify(model.nodeNames))throw Error('記録対象・ノード・シナリオ版が一致しません。');
  if(model.source.version>=4&&JSON.stringify(payload.resourceNames)!==JSON.stringify(model.resourceNames))throw Error('記録の資源参照が一致しません。');
  if(payload.frames.length*(n*23+8+model.resourceNames.length*4)>MAX_RECORD_BYTES||payload.frames.length>100001)throw Error('再生記録が上限を超えています。');
  let previous=-1;
  model.frames=payload.frames.map((f,i)=>{
    if(!Number.isFinite(f.time)||f.time<=previous||f.time>model.source.duration||i===0&&f.time!==0)throw Error('記録時刻が不正です。');previous=f.time;
    const values=decode(f.values,Float32Array,n*5),nodes=decode(f.nodes,Uint16Array,n),status=decode(f.status,Uint8Array,n);
    const resources=model.source.version>=4?decode(f.resources,Float32Array,model.resourceNames.length):undefined;
    if(resources?.some((v,i)=>!Number.isFinite(v)||v<0||v>model.byId.get(model.resourceNames[i].split(':')[0]).resources[model.resourceNames[i].split(':')[1]].capacity*(1+1e-6)))throw Error('資源残量の記録が不正です。');
    if(values.some(v=>!Number.isFinite(v))||status.some(v=>v>=STATUS.length))throw Error('記録値が不正です。');
    nodes.forEach((v,i)=>{
      const s=model.states[i],name=model.nodeNames[v-1];
      if(s.graph&&v===0&&![STATUS.indexOf('standby'),STATUS.indexOf('blocked')].includes(status[i]))throw Error('起動前の記録状態が不正です。');
      if(s.graph? v!==0&&(!name||!s.graph.nodes.some(node=>s.graph.id+':'+node.id===name)):v!==0)throw Error('記録ノードが担当の挙動と一致しません。');
    });
    return {
      time:f.time,values,nodes,status,...(resources?{resources}:{})
    };
  });
  if(previous!==model.source.duration)throw Error('終了時刻までの記録がありません。');
  const r=payload.result;
  if(!r||typeof r.success!=='boolean'||!Array.isArray(r.events)||!Array.isArray(r.actionEvents)||r.events.length+r.actionEvents.length>200000||r.successTime!==null&&(!Number.isFinite(r.successTime)||r.successTime<0||r.successTime>model.source.duration)||r.success!==(r.successTime!==null))throw Error('記録の評価・イベントが不正です。');
  for(const [key,min] of [['targetCount',0],['detectedCount',0],['responderCount',0],['reachedCount',0],['invalidUnits',0],['constrainedPaths',0]])if(!Number.isInteger(r[key])||r[key]<min||r[key]>2000)throw Error('記録の件数が不正です。');
  if(model.source.version>=4&&(!Array.isArray(r.informationEvents)||r.informationEvents.length>100000))throw Error('情報記録が不正です。');
  for(const list of [r.events,r.actionEvents,...(r.informationEvents?[r.informationEvents]:[])]) {
    let time=-1;
    for(const e of list){
      if(!e||!types.has(e.type)||!Number.isFinite(e.time)||e.time<time||e.time<0||e.time>model.source.duration||!model.byId.has(e.unitId))throw Error('イベントの種類・参照・時刻が不正です。');
      time=e.time;
      for(const key of ['targetId','receiverId','senderId','observerId'])if(e[key]!==undefined&&!model.byId.has(e[key]))throw Error('イベントの参照先がありません。');
      for(const key of ['targetPosition','sourcePosition','receiverPosition','observerPosition'])if(e[key]!==undefined&&!position(e[key]))throw Error('イベントの位置が不正です。');
      if(e.type==='detected'&&(!e.targetId||!position(e.targetPosition)||!position(e.observerPosition)))throw Error('探知情報が不正です。');
      if(e.type==='received'&&(!e.senderId||!position(e.sourcePosition)||!position(e.receiverPosition)))throw Error('受信情報が不正です。');
      const s=model.byId.get(e.unitId);
      if(e.type==='near'&&(!model.source.destinations?.some(d=>d.id===e.destinationId)||!Number.isFinite(e.distance)||e.distance<0||!['horizontal','absolute'].includes(e.distanceMode)))throw Error('接近イベントの記録が不正です。');
      if(e.type==='initialized'&&(e.time!==0||s.graph?.initial!==e.nodeId))throw Error('初期状態の記録が不正です。');
      if(e.type==='triggered'&&!s.graph?.triggers.some(t=>t.id===e.triggerId&&t.event===e.event&&t.to===e.nodeId)
        && !(e.event==='scenarioStart'&&e.time===0&&s.graph?.initial===e.nodeId&&payload.source.behaviors?.find(g=>g.id===s.graph.id)?.triggers?.some(t=>t.id===e.triggerId&&t.event==='scenarioStart'&&t.to===e.nodeId)))throw Error('起動イベントの条件が不正です。');
      if(e.nodeId!==undefined&&!s.graph?.nodes.some(n=>n.id===e.nodeId))throw Error('イベントのノードが不正です。');
    }
  }
  if(model.source.mission?.type==='state'){
    validateStateResult(model.source,r);const expected=new StateTracker(model.source.mission,stateMembers(model.source)).update(r.actionEvents);
    if(JSON.stringify(expected.stateEntries)!==JSON.stringify(r.stateEntries)||expected.successTime!==r.successTime)throw Error('状態の初回到達記録がイベント履歴と一致しません。');
  }
  if(model.source.measurements?.length){
    validateMeasurements(model.source,r.measurements);
    if(JSON.stringify(measurePoints(model.source,r.actionEvents))!==JSON.stringify(r.measurements))throw Error('計測点の到達記録がイベント履歴と一致しません。');
  }
  validateInformationMetrics(model.source,r.informationMetrics,model.states.map(s=>s.unit.id));
  model.result=clone(r);
  // A replay keeps its original frames; normalize legacy initial-event names for resaving.
  for(const list of [model.result.events,model.result.actionEvents])for(const e of list)if(e.type==='triggered'&&e.event==='scenarioStart'){
    e.type='initialized';delete e.event;delete e.triggerId;
  }
  return model;
}
