const finite=v=>typeof v==='number'&&Number.isFinite(v);
export const hasActions=s=>s.mission?.type==='arrive'||[...(s.units??[]),...(s.groups??[]).map(g=>g.template)].some(u=>u.behavior?.hold||u.behavior?.rules?.length);
export function actionErrors(unit,prefix='unit',recipientIds=new Set()) {
  const errors=[],c=unit.communication,b=unit.behavior;
  if(c!==undefined){
    if(!c||typeof c!=='object'||Array.isArray(c))errors.push(prefix+': communicationはオブジェクトにしてください。');
    else {
      if(typeof c.enabled!=='boolean'||typeof c.terrainLOS!=='boolean')errors.push(prefix+': 通信のenabled・terrainLOSはbooleanにしてください。');
      for(const [k,min,max] of [['range',.001,100000],['delay',0,86400],['probability',0,1]])if(!finite(c[k])||c[k]<min||c[k]>max)errors.push(prefix+': communication.'+k+'は'+min+'～'+max+'にしてください。');
    }
  }
  if(b!==undefined){
    if(!b||typeof b!=='object'||Array.isArray(b))return [...errors,prefix+': behaviorはオブジェクトにしてください。'];
    if(typeof b.hold!=='boolean')errors.push(prefix+': behavior.holdはbooleanにしてください。');
    if(!finite(b.preparation)||b.preparation<0||b.preparation>86400)errors.push(prefix+': behavior.preparationは0～86400秒にしてください。');
    if(!Array.isArray(b.rules)||b.rules.length>16)errors.push(prefix+': 行動ルールは最大16件にしてください。');
    else {const ids=new Set();for(const r of b.rules){
      if(!r||typeof r!=='object'){errors.push(prefix+': ルールはオブジェクトにしてください。');continue;}
      if(typeof r.id!=='string'||! /^[a-zA-Z0-9_-]{1,50}$/.test(r.id)||ids.has(r.id))errors.push(prefix+': ルールidは重複しない英数字・_・-にしてください。');ids.add(r.id);
      if(!['detected','received','arrived'].includes(r.when)||!['send','depart'].includes(r.action)||!['any','waiting'].includes(r.state)||typeof r.once!=='boolean')errors.push(prefix+': ルールの条件・動作・実行回数が不正です。');
      if(r.action==='send'&&!recipientIds.has(r.receiverId))errors.push(prefix+': 送信先の単体ユニットが見つかりません: '+r.receiverId);
      if(r.action==='depart'&&!b.hold)errors.push(prefix+': 出発ルールには「指令まで待機」を設定してください。');
    }}
  }
  return errors;
}
