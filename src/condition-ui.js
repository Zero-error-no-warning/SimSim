import {stateField,decisionStateFields} from './state-contract.js?v=20261009-map-workspace-29';
import {conditionErrors} from './decision.js?v=20261009-map-workspace-29';

const defaults=()=>({field:'knowledge.selectedContact.age',op:'lte',value:30});
const operators=[['lt','より小さい'],['lte','以下'],['gt','より大きい'],['gte','以上'],['eq','と等しい'],['neq','と異なる'],['exists','情報がある']];
const typeOf=field=>stateField(field)?.type??'number';
const stringValues=field=>[...(stateField(field)?.choices??[])];
const initialValue=field=>typeOf(field)==='boolean'?true:typeOf(field)==='string'?stringValues(field)[0][0]:percentage(field)?0.2:30;
const percentage=field=>stateField(field)?.scale===100;
const element=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
const select=(items,value,label)=>{const e=element('select');e.setAttribute('aria-label',label);e.replaceChildren(...items.map(([id,text])=>new Option(text,id)));e.value=value;return e;};
export const conditionFields=source=>decisionStateFields(source).map(f=>[f.field,f.label]);

export class ConditionUI{
 constructor(host,onChange){this.host=host;this.onChange=onChange;}
 render(condition,source){
  this.condition=structuredClone(condition??defaults());this.fields=conditionFields(source);this.host.replaceChildren();
  const hint=element('p','条件を組み合わせて判断します。残量や確信度は%で指定できます。');hint.className='route-help';this.host.append(hint,this.node(this.condition,[],0));
 }
 change(path,transform){const next=structuredClone(this.condition);let c=next;for(const k of path)c=c[k];const replacement=transform(c);if(path.length){let parent=next;for(const k of path.slice(0,-1))parent=parent[k];parent[path.at(-1)]=replacement??c;}else if(replacement)this.condition=replacement;
  const result=path.length||!replacement?next:replacement,errors=conditionErrors(result);if(errors.length)return;this.onChange(result);
 }
 node(c,path,depth){
  const box=element('section');box.className='condition-block';box.dataset.conditionPath=path.join('.');
  const kind=c.all?'all':c.any?'any':'leaf';
  const mode=select([['leaf','一つの条件'],['all','すべて満たす（AND）'],['any','いずれか満たす（OR）']],kind,'条件の組み合わせ');
  if(depth>=8){for(const option of mode.options)if(option.value!=='leaf')option.disabled=true;}
  mode.onchange=()=>this.change(path,old=>mode.value==='leaf'?(old.all??old.any)?.[0]??old:{[mode.value]:old.all??old.any??[old,defaults()]});box.append(mode);
  if(kind!=='leaf'){
   c[kind].forEach((child,i)=>{const row=element('div');row.className='condition-child';row.append(this.node(child,[...path,kind,i],depth+1));const remove=element('button','削除');remove.type='button';remove.disabled=c[kind].length===1;remove.setAttribute('aria-label','条件'+(i+1)+'を削除');remove.onclick=()=>this.change(path,old=>{old[kind].splice(i,1);});row.append(remove);box.append(row);});
   const add=element('button','＋ 条件を追加');add.type='button';add.disabled=c[kind].length>=16||depth>=8;add.onclick=()=>this.change(path,old=>{old[kind].push(defaults());});box.append(add);return box;
  }
  const items=this.fields.some(([id])=>id===c.field)?this.fields:[...this.fields,[c.field,c.field+'（ファイルで指定）']];
  const field=select(items,c.field,'判断する値');field.onchange=()=>this.change(path,old=>{old.field=field.value;old.op='eq';old.value=initialValue(field.value);});box.append(field);
  const type=typeOf(c.field),op=select(operators.filter(([id])=>type==='number'||['eq','neq','exists'].includes(id)),c.op,'比較方法');op.onchange=()=>this.change(path,old=>{old.op=op.value;if(old.op==='exists')delete old.value;else old.value??=initialValue(c.field);});box.append(op);
  if(c.op!=='exists'){
   const choices=type==='string'?stringValues(c.field):[];if(type==='string'&&!choices.some(([id])=>id===c.value))choices.push([c.value,c.value+'（ファイルで指定）']);
   const value=type==='string'?select(choices,c.value,'比較する値'):type==='boolean'?select([['true','はい（稼働）'],['false','いいえ（停止）']],String(c.value),'比較する値'):element('input');value.setAttribute('aria-label','比較する値');
   if(type==='number'){value.type=type==='number'?'number':'text';if(type==='number')value.step='any';value.value=percentage(c.field)?c.value*100:c.value;}
   value.onchange=()=>{if(!value.checkValidity()||type==='number'&&!value.value.trim())return;this.change(path,old=>{old.value=type==='boolean'?value.value==='true':type==='number'?Number(value.value)/(percentage(c.field)?100:1):value.value;});};box.append(value);
  }
  return box;
 }
}
