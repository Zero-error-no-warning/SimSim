import fs from 'node:fs';
import {CONFIGURATION_MODULES,configurationContractErrors} from '../src/configuration-contract.js?v=20261009-select-state-30';
import {FIELD_RENDERERS} from '../src/settings-form.js?v=20261009-select-state-30';
import {EDITOR_RENDERERS} from '../src/settings-ui.js?v=20261009-select-state-30';
import {STATE_FIELDS} from '../src/state-contract.js?v=20261009-select-state-30';
import {PARAMETERS} from '../src/parameters.js?v=20261009-select-state-30';
const errors=configurationContractErrors(CONFIGURATION_MODULES,FIELD_RENDERERS,EDITOR_RENDERERS);
for(const m of CONFIGURATION_MODULES)for(const f of m.fields){if(f.analysis&&!PARAMETERS.some(p=>p.key===f.analysis.key))errors.push(f.id+': 分析台帳に未接続');}
for(const f of STATE_FIELDS)if(!f.type||!f.visibility||!f.record||!f.aggregate||!f.unknown)errors.push(f.field+': 状態の参照契約が不足');
if(errors.length)throw Error(errors.join('\n'));
const printable=v=>typeof v==='function'?'対象・関連値から解決':v===undefined?'省略可':Array.isArray(v)?v.join(', '):String(v);
const rows=CONFIGURATION_MODULES.flatMap(m=>[
 '\n'+m.label+' / '+m.id+' / 所有者: '+m.owner+' / 編集: '+m.editor+' / 未設定: '+m.absentMeaning,
 ...m.fields.map(f=>'  '+f.id+' → '+(m.path?m.path+'.':'')+f.path+' | '+f.label+' | '+f.type+(f.required?' 必須':'')+' | 範囲: '+printable(f.min)+'〜'+printable(f.max)+' | 表示倍率: '+(f.scale??1)+' | 既定: '+printable(f.default)+' | '+(f.readonly?'編集不可: '+(f.readonlyReason??'識別子'):f.analysis?'分析: '+f.analysis.key:'分析未対応'))
]).join('\n');
const reference='設定契約から生成した入力台帳（設定契約版28）\n保存は従来のシナリオ形式。配列・資源IDごとの項目は各要素に適用。\n表示倍率は保存値→画面値。省略値は表示のために解決し、編集しない限りファイルへ追加しない。\n関連制約・参照・シナリオ版はvalidateScenarioで追加検証する。\n'+rows+'\n\n判断状態の台帳\n'+STATE_FIELDS.map(f=>f.field+' | '+f.type+' | '+f.label+' | 参照: '+f.visibility+' | 表示倍率: '+f.scale+' | 未知: '+f.unknown+' | 集約: '+f.aggregate).join('\n')+'\n';
const url=new URL('../docs/llm-scenario-generation.txt',import.meta.url),source=fs.readFileSync(url,'utf8'),marker='\n[GENERATED CONFIGURATION CONTRACT]\n',base=source.split(marker)[0],expected=base+marker+reference;
if(process.argv.includes('--write'))fs.writeFileSync(url,expected);
else if(source!==expected)throw Error('契約仕様表が古くなっています。node tools/check-configuration.mjs --write を実行してください。');
console.log('PASS: '+CONFIGURATION_MODULES.length+' configuration modules, '+CONFIGURATION_MODULES.reduce((n,m)=>n+m.fields.length,0)+' fields, editors, analysis/state exposure and generated LLM reference');
