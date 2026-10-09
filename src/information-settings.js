const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(x);
const position=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k]));
export function selectorErrors(s){
  if(s===undefined)return [];
  return !s||typeof s!=='object'||Array.isArray(s)||Object.keys(s).some(k=>!['class','order','trackId'].includes(k))||s.class!==undefined&&!id(s.class)||s.order!==undefined&&!['latest','nearest'].includes(s.order)||s.trackId!==undefined&&!id(s.trackId)?['接触選択はclass・order（latest/nearest）・trackIdで指定してください。']:[];
}
export function informationErrors(s){
  if(!s||typeof s!=='object')return [];
  const errors=[];
  if(s.informationMetrics!==undefined&&(!s.informationMetrics||!Number.isFinite(s.informationMetrics.maxContactAge)||s.informationMetrics.maxContactAge<0||s.informationMetrics.maxContactAge>86400))errors.push('情報鮮度の基準は0～86400秒です。');
  const units=[...(Array.isArray(s.units)?s.units:[]),...(Array.isArray(s.groups)?s.groups.map(g=>g?.template):[])],ids=new Set(units.map(u=>u?.id));
  const advanced=s.initialInformation!==undefined||s.modelAssumptions!==undefined||units.some(u=>u?.commandSources!==undefined)||s.behaviors?.some?.(g=>g.nodes?.some?.(n=>n.messageKind!==undefined||n.selector!==undefined)||g.edges?.some?.(e=>['condition','command'].includes(e?.when)));
  if(s.version<4&&advanced)errors.push('情報・判断・命令の設定にはversion 4を使用してください。');
  if(s.modelAssumptions?.information!==undefined&&!['restricted','legacy'].includes(s.modelAssumptions.information))errors.push('情報参照はrestrictedまたはlegacyです。');
  for(const u of units)if(u?.commandSources!==undefined&&(!Array.isArray(u.commandSources)||u.commandSources.length>32||u.commandSources.some(x=>!ids.has(x))))errors.push('命令を受け付ける送信元ユニットを指定してください。');
  if(s.initialInformation!==undefined){
    if(!Array.isArray(s.initialInformation)||s.initialInformation.length>2000)errors.push('初期情報は最大2000件です。');
    else for(const item of s.initialInformation){
      const o=item?.observation;
      const validTime=Number.isFinite(o?.observationTime)&&o.observationTime<=0&&o.observationTime>=-86400;
      const validContent=o?.messageKind==='status'?ids.has(o.subjectId)&&['operational','disabled','unknown'].includes(o.reportedState):ids.has(o?.targetId)&&position(o?.targetPosition);
      if(!ids.has(item?.ownerId)||!validTime||!validContent)errors.push('初期情報の所有者・対象・位置・観測時刻が不正です。');
      if(o?.confidence!==undefined&&(!Number.isFinite(o.confidence)||o.confidence<0||o.confidence>1)||o?.positionErrorRadius!==undefined&&(!Number.isFinite(o.positionErrorRadius)||o.positionErrorRadius<0))errors.push('初期情報の信頼度・位置誤差が不正です。');
    }
  }
  for(const g of Array.isArray(s.behaviors)?s.behaviors:[]){
    for(const n of Array.isArray(g.nodes)?g.nodes:[]){errors.push(...selectorErrors(n.selector));
      if(n.messageKind!==undefined&&(n.kind!=='report'||!['observation','status','command'].includes(n.messageKind)))errors.push('報告の内容はobservation・status・commandです。');
      if(n.messageKind==='command'&&(!n.command||!id(n.command.name)))errors.push('命令には英数字のnameを指定してください。');
    }
    for(const e of Array.isArray(g.edges)?g.edges:[]){errors.push(...selectorErrors(e.selector));if(e.commandName!==undefined&&(e.when!=='command'||!id(e.commandName)))errors.push('命令接続のcommandNameが不正です。');}
  }
  return errors;
}
