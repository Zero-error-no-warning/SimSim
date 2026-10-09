import {fieldErrors} from './configuration-schema.js?v=20261009-select-state-30';
import {COMMAND_FIELDS,INITIAL_FIELDS,ASSUMPTION_FIELDS} from './configuration-fields.js?v=20261009-select-state-30';
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(x);
export function selectorErrors(s){
  if(s===undefined)return [];
  return !s||typeof s!=='object'||Array.isArray(s)||Object.keys(s).some(k=>!['class','order','trackId'].includes(k))||s.class!==undefined&&!id(s.class)||s.order!==undefined&&!['latest','nearest'].includes(s.order)||s.trackId!==undefined&&!id(s.trackId)?['接触選択はclass・order（latest/nearest）・trackIdで指定してください。']:[];
}
export function informationErrors(s){
  if(!s||typeof s!=='object')return [];
  const errors=[];
  const units=[...(Array.isArray(s.units)?s.units:[]),...(Array.isArray(s.groups)?s.groups.map(g=>g?.template):[])],context={scenario:{...s,units}};
  const advanced=s.initialInformation!==undefined||s.modelAssumptions!==undefined||units.some(u=>u?.commandSources!==undefined)||s.behaviors?.some?.(g=>g.nodes?.some?.(n=>n.messageKind!==undefined||n.selector!==undefined)||g.edges?.some?.(e=>['condition','command'].includes(e?.when)));
  if(s.version<4&&advanced)errors.push('情報・判断・命令の設定にはversion 4を使用してください。');
  errors.push(...fieldErrors(ASSUMPTION_FIELDS,s,context));
  if(s.informationMetrics!==undefined&&(!s.informationMetrics||s.informationMetrics.maxContactAge===undefined))errors.push('情報鮮度の基準を指定してください。');
  for(const u of units)if(u)errors.push(...fieldErrors(COMMAND_FIELDS,u,context));
  if(s.initialInformation!==undefined){
    if(!Array.isArray(s.initialInformation)||s.initialInformation.length>2000)errors.push('初期情報は最大2000件です。');
    else for(const item of s.initialInformation)errors.push(...fieldErrors(INITIAL_FIELDS.filter(f=>!f.when||item&&f.when(item)),item,context));
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
