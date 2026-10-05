import {PARAMETER_TYPES,isParameterRef,resolveValue} from './behavior-parameters.js?v=20261005-parameters-terrain-6';
import {requireElement} from './ui-dom.js?v=20261005-parameters-terrain-6';
const $=requireElement;
const unitName={s:'秒',m:'m',ratio:'%'};
const scale=p=>p.unit==='ratio'?100:1;
export class BehaviorParameterUI{
  constructor(owner){
    this.owner=owner;this.dialog=$('behavior-parameter-dialog');
    this.dialog.addEventListener('close',()=>this.owner.render());
    $('behavior-parameters-open').onclick=()=>this.open();
    for(const id of ['behavior-parameter-close','behavior-parameter-cancel'])$(id).onclick=()=>this.dialog.close();
    $('behavior-parameter-list').onchange=()=>{this.parameter=this.graph.parameters?.find(p=>p.id===$('behavior-parameter-list').value);this.fields();};
    $('behavior-parameter-type').onchange=()=>this.typeFields();
    $('behavior-parameter-unit').onchange=()=>this.typeFields();
    $('behavior-parameter-default-enabled').onchange=()=>this.typeFields();
    $('behavior-parameter-save').onclick=()=>this.save();
    $('behavior-parameter-delete').onclick=()=>this.remove();
  }
  bind(selectId,item,field,type,unit,label){
    const e=$(selectId);e.replaceChildren(new Option('具体値を指定',''));
    for(const p of this.owner.graph()?.parameters??[])if(p.type===type&&(!unit||!p.unit||p.unit===unit))e.append(new Option('担当値: '+p.name,'$param:'+p.id));
    e.append(new Option('＋ 担当時に指定する値を作る','__new__'));
    e.value=isParameterRef(item?.[field])?'$param:'+item[field].$param:'';
    e.onchange=()=>{
      if(!item)return;
      if(e.value==='__new__')this.open({item,field,type,unit,label});
      else{
        this.owner.remember();
        const value=e.value?{$param:e.value.slice(7)}:resolveValue(item[field],this.owner.graph(),this.owner.assignment());
        if(value===undefined)delete item[field];else item[field]=value;
        if(field==='receiverId'&&value!==undefined)delete item.receiverRole;
        this.owner.render();
      }
    };
    return isParameterRef(item?.[field]);
  }
  open(context){
    this.graph=this.owner.graph();if(!this.graph)return;
    this.context=context;this.parameter=null;this.fields();this.dialog.showModal();
  }
  fields(){
    const list=$('behavior-parameter-list');list.replaceChildren(new Option('新しく作る',''));
    for(const p of this.graph.parameters??[])list.append(new Option(p.name,p.id));list.value=this.parameter?.id??'';
    list.parentElement.hidden=!!this.context;
    $('behavior-parameter-name').value=this.parameter?.name??this.context?.label??'';
    $('behavior-parameter-type').value=this.parameter?.type??this.context?.type??'number';
    $('behavior-parameter-type').disabled=!!(this.parameter||this.context);
    $('behavior-parameter-unit').value=this.parameter?.unit??this.context?.unit??'s';
    $('behavior-parameter-unit').disabled=!!(this.parameter||this.context);
    const value=this.parameter?.default??this.context?.item?.[this.context.field];
    $('behavior-parameter-default-enabled').checked=value!==undefined&&!isParameterRef(value)&&value!=='';
    this.typeFields(value);$('behavior-parameter-delete').hidden=!this.parameter;$('behavior-parameter-error').hidden=true;
  }
  typeFields(value){
    const type=$('behavior-parameter-type').value,unit=$('behavior-parameter-unit').value,numeric=type==='number',enabled=$('behavior-parameter-default-enabled').checked;
    $('behavior-parameter-unit').parentElement.hidden=!numeric;
    $('behavior-parameter-number').parentElement.hidden=!numeric||!enabled;
    $('behavior-parameter-reference').parentElement.hidden=numeric||!enabled;
    if(value!==undefined&&!isParameterRef(value))$('behavior-parameter-number').value=typeof value==='number'?value*(unit==='ratio'?100:1):'';
    const ref=$('behavior-parameter-reference');ref.replaceChildren(new Option('選択してください',''));
    for(const item of this.owner.draft[type==='route'?'routes':type==='destination'?'destinations':'units']??[])ref.append(new Option(item.name,item.id));
    if(typeof value==='string')ref.value=value;
  }
  error(message){$('behavior-parameter-error').hidden=false;$('behavior-parameter-error').textContent=message;}
  save(){
    const name=$('behavior-parameter-name').value.trim(),type=$('behavior-parameter-type').value,unit=$('behavior-parameter-unit').value;
    if(!name)return this.error('名前を指定してください。');
    const parameters=this.graph.parameters??[],id=this.parameter?.id??'param-'+Date.now().toString(36),p={id,name,type,...(type==='number'?{unit}:{})};
    if(parameters.some(other=>other.id!==id&&other.name===name))return this.error('別の担当値と異なる名前を指定してください。');
    if($('behavior-parameter-default-enabled').checked){
      const raw=type==='number'?$('behavior-parameter-number').value:$('behavior-parameter-reference').value;
      if(!raw.trim()||type==='number'&&!Number.isFinite(Number(raw)))return this.error('既定値を指定してください。');
      p.default=type==='number'?Number(raw)/scale(p):raw;
    }
    this.owner.remember();this.graph.parameters=[...parameters.filter(other=>other.id!==id),p];
    if(this.context){this.context.item[this.context.field]={$param:id};if(this.context.field==='receiverId')delete this.context.item.receiverRole;}
    this.dialog.close();this.owner.render();
  }
  remove(){
    if([...this.graph.nodes,...this.graph.edges,...this.graph.triggers].some(n=>Object.values(n).some(v=>isParameterRef(v)&&v.$param===this.parameter.id)))return this.error('ノードまたは条件で使用中です。具体値か別の担当値へ変更してから削除してください。');
    this.owner.remember();this.graph.parameters=this.graph.parameters.filter(p=>p.id!==this.parameter.id);
    for(const a of this.owner.draft.behaviorAssignments.filter(a=>a.behaviorId===this.graph.id))if(a.parameters)delete a.parameters[this.parameter.id];
    this.dialog.close();this.owner.render();
  }
  assignments(){
    const root=$('assignment-parameters'),a=this.owner.assignment(),g=this.owner.draft.behaviors.find(g=>g.id===a?.behaviorId);root.replaceChildren();root.hidden=!g?.parameters?.length;
    if(root.hidden)return;
    const title=document.createElement('h3');title.textContent='この担当で使う値';root.append(title);
    for(const p of g.parameters){
      const row=document.createElement('div'),label=document.createElement('label');label.className='field';label.textContent=p.name+(p.type==='number'?'（'+(unitName[p.unit]??'数値')+'）':'（'+PARAMETER_TYPES[p.type]+'）');
      const input=document.createElement(p.type==='number'?'input':'select');input.dataset.parameter=p.id;
      const inherited=!Object.hasOwn(a.parameters??{},p.id),value=resolveValue({$param:p.id},g,a);
      if(p.type==='number'){input.type='number';input.step='any';input.value=value===undefined?'':value*scale(p);}
      else{input.append(new Option('選択してください',''));for(const item of this.owner.draft[p.type==='route'?'routes':p.type==='destination'?'destinations':'units']??[])input.append(new Option(item.name,item.id));input.value=value??'';}
      input.onchange=()=>{this.owner.remember();a.parameters??={};a.parameters[p.id]=p.type==='number'?(input.value.trim()?Number(input.value)/scale(p):null):input.value;this.owner.render();};
      label.append(input);row.append(label);
      if(Object.hasOwn(p,'default')){const check=document.createElement('label'),box=document.createElement('input');check.className='check-field';box.type='checkbox';box.checked=inherited;input.disabled=inherited;check.append(box,document.createTextNode('挙動の既定値を使う'));box.onchange=()=>{this.owner.remember();a.parameters??={};if(box.checked)delete a.parameters[p.id];else a.parameters[p.id]=value;this.owner.render();};row.append(check);}
      if(['route','destination'].includes(p.type))for(const edit of [false,true]){
        const button=document.createElement('button');button.textContent=edit?'編集':'＋ 新規'+PARAMETER_TYPES[p.type];button.disabled=edit&&!value;
        button.onclick=()=>this.owner.navigation.open(p.type,edit?value:null,null,id=>{a.parameters??={};a.parameters[p.id]=id;});row.append(button);
      }
      root.append(row);
    }
  }
  label(value){return isParameterRef(value)?'担当値: '+(this.owner.graph()?.parameters?.find(p=>p.id===value.$param)?.name??'未定義'):String(value??'?');}
}
