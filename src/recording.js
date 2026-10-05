export { RECORD_MODEL } from './recorded-engine.js?v=20261005-startup-1';
import { clone } from './engine.js?v=20261005-startup-1';
import { RecordedSimulation, RECORD_MODEL, STATUS, MAX_RECORD_BYTES } from './recorded-engine.js?v=20261005-startup-1';
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
    type:'SimSim-recording',version:2,model:RECORD_MODEL,source:clone(model.source),unitIds:model.states.map(s=>s.unit.id),nodeNames:model.nodeNames,result:model.result,frames:model.frames.map(f=>({
      time:f.time,values:encode(f.values),nodes:encode(f.nodes),status:encode(f.status)
    }))
  };
  if(new TextEncoder().encode(JSON.stringify(payload)).byteLength>MAX_FILE_BYTES)throw Error('保存形式で256MiBを超えます。期間・個数を減らしてください。');
  return payload;
}
const position = p => p&&['x','y','z'].every(k=>Number.isFinite(p[k]));
const types = new Set(['detected','sent','sendFailed','received','arrived','elapsed','nodeChanged','departed','preparing','triggered']);
export function restoreRecording(payload) {
  if(payload?.type!=='SimSim-recording'||payload.version!==2||payload.model!==RECORD_MODEL||!Array.isArray(payload.frames)||!payload.frames.length)throw Error('対応していない記録モデルです。旧版の記録は元の版で再生してください。');
  const model=new RecordedSimulation(payload.source),n=model.states.length;
  if(payload.source.version!==3||JSON.stringify(payload.unitIds)!==JSON.stringify(model.states.map(s=>s.unit.id))||JSON.stringify(payload.nodeNames)!==JSON.stringify(model.nodeNames))throw Error('記録対象・ノード・シナリオ版が一致しません。');
  if(payload.frames.length*(n*23+8)>MAX_RECORD_BYTES||payload.frames.length>100001)throw Error('再生記録が上限を超えています。');
  let previous=-1;
  model.frames=payload.frames.map((f,i)=>{
    if(!Number.isFinite(f.time)||f.time<=previous||f.time>model.source.duration||i===0&&f.time!==0)throw Error('記録時刻が不正です。');previous=f.time;
    const values=decode(f.values,Float32Array,n*5),nodes=decode(f.nodes,Uint16Array,n),status=decode(f.status,Uint8Array,n);
    if(values.some(v=>!Number.isFinite(v))||status.some(v=>v>=STATUS.length))throw Error('記録値が不正です。');
    nodes.forEach((v,i)=>{
      const s=model.states[i],name=model.nodeNames[v-1];
      if(s.graph&&v===0&&![STATUS.indexOf('standby'),STATUS.indexOf('blocked')].includes(status[i]))throw Error('起動前の記録状態が不正です。');
      if(s.graph? v!==0&&(!name||!s.graph.nodes.some(node=>s.graph.id+':'+node.id===name)):v!==0)throw Error('記録ノードが担当の挙動と一致しません。');
    });
    return {
      time:f.time,values,nodes,status
    };
  });
  if(previous!==model.source.duration)throw Error('終了時刻までの記録がありません。');
  const r=payload.result;
  if(!r||typeof r.success!=='boolean'||!Array.isArray(r.events)||!Array.isArray(r.actionEvents)||r.events.length+r.actionEvents.length>200000||r.successTime!==null&&(!Number.isFinite(r.successTime)||r.successTime<0||r.successTime>model.source.duration)||r.success!==(r.successTime!==null))throw Error('記録の評価・イベントが不正です。');
  for(const [key,min] of [['targetCount',0],['detectedCount',0],['responderCount',0],['reachedCount',0],['invalidUnits',0],['constrainedPaths',0]])if(!Number.isInteger(r[key])||r[key]<min||r[key]>2000)throw Error('記録の件数が不正です。');
  for(const list of [r.events,r.actionEvents]) {
    let time=-1;
    for(const e of list){
      if(!e||!types.has(e.type)||!Number.isFinite(e.time)||e.time<time||e.time<0||e.time>model.source.duration||!model.byId.has(e.unitId))throw Error('イベントの種類・参照・時刻が不正です。');
      time=e.time;
      for(const key of ['targetId','receiverId','senderId','observerId'])if(e[key]!==undefined&&!model.byId.has(e[key]))throw Error('イベントの参照先がありません。');
      for(const key of ['targetPosition','sourcePosition','receiverPosition','observerPosition'])if(e[key]!==undefined&&!position(e[key]))throw Error('イベントの位置が不正です。');
      if(e.type==='detected'&&(!e.targetId||!position(e.targetPosition)||!position(e.observerPosition)))throw Error('探知情報が不正です。');
      if(e.type==='received'&&(!e.senderId||!position(e.sourcePosition)||!position(e.receiverPosition)))throw Error('受信情報が不正です。');
      const s=model.byId.get(e.unitId);
      if(e.type==='triggered'&&!s.graph?.triggers.some(t=>t.id===e.triggerId&&t.event===e.event&&t.to===e.nodeId))throw Error('起動イベントの条件が不正です。');
      if(e.nodeId!==undefined&&!s.graph?.nodes.some(n=>n.id===e.nodeId))throw Error('イベントのノードが不正です。');
    }
  }
  model.result=clone(r);
  return model;
}
