import { availableBindings,bindingKey,parameter,readParameter,normalizedAnalysis } from './parameters.js?v=20261006-measurement-history-14';
import { requireElement } from './ui-dom.js?v=20261006-measurement-history-14';
const $=requireElement,copy=v=>JSON.parse(JSON.stringify(v));
export class ParameterEditor {
  constructor(onChange){
    this.onChange=()=>{
      if(!this.rendering)onChange();
    };
    for(const kind of ['factors','uncertainties'])$('add-'+kind).onclick=()=>this.add(kind);
  }
  render(s){
    this.rendering=true;
    try{
      this.scenario=s;
      this.factors=s.analysis?normalizedAnalysis(s.analysis).factors:[];
      this.uncertainties=copy(s.analysis?.uncertainties??[]);
      this.draw();
    }finally{
      this.rendering=false;
    }
  }
  read(){
    return {
      factors:copy(this.factors),uncertainties:copy(this.uncertainties)
    };
  }
  choices(current=null){
    const used=new Set([...this.factors,...this.uncertainties].filter(b=>b!==current).map(bindingKey));
    return availableBindings(this.scenario).filter(b=>!used.has(bindingKey(b)));
  }
  add(kind){
    const b=this.choices()[0];
    if(!b)return;
    const value=readParameter(this.scenario,b);
    this[kind].push(kind==='factors'?{
      target:b.target,parameter:b.parameter,values:[value]
    }
    :{
      target:b.target,parameter:b.parameter,distribution:'uniform',min:value,max:value
    });
    this.onChange();
  }
  draw(){
    for(const kind of ['factors','uncertainties']){
      const host=$(kind+'-editor');
      host.replaceChildren();
      this[kind].forEach((b,index)=>{
        const row=document.createElement('div');row.className='parameter-row';const p=parameter(b.parameter),targetSelect=document.createElement('select'),propertySelect=document.createElement('select');
        targetSelect.className='parameter-target';propertySelect.className='parameter-property';
        targetSelect.setAttribute('aria-label',(kind==='factors'?'比較':'ばらつき')+'対象 '+(index+1));propertySelect.setAttribute('aria-label',(kind==='factors'?'比較':'ばらつき')+'属性 '+(index+1));
        const choices=this.choices(b);if(!choices.some(c=>bindingKey(c)===bindingKey(b)))choices.push({
          ...b,targetLabel:choices.find(c=>c.target===b.target)?.targetLabel??b.target+'（現在の定義には不在）'
        });
        const targets=new Map(choices.map(c=>[c.target,c.targetLabel]));
        for(const [target,label] of targets)targetSelect.append(new Option(label,target));targetSelect.value=b.target;
        for(const c of choices.filter(c=>c.target===b.target)){
          const def=parameter(c.parameter);propertySelect.append(new Option(def.label+' ('+def.unit+')',c.parameter));
        }
        propertySelect.value=b.parameter;
        const change=(target,key)=>{
          const value=readParameter(this.scenario,{
            target,parameter:key
          });Object.assign(b,{
            target,parameter:key
          });if(kind==='factors')b.values=[value];else Object.assign(b,{
            min:value,max:value,mode:value
          });this.onChange();
        };
        targetSelect.onchange=()=>{
          const available=choices.filter(c=>c.target===targetSelect.value),key=available.some(c=>c.parameter===b.parameter)?b.parameter:available[0].parameter;change(targetSelect.value,key);
        };
        propertySelect.onchange=()=>change(b.target,propertySelect.value);
        const field=(label,control)=>{
          const wrap=document.createElement('label');wrap.className='field';wrap.append(document.createTextNode(label),control);return wrap;
        };
        row.append(field('対象（ユニット・群）',targetSelect),field('属性',propertySelect));
        const remove=document.createElement('button');remove.textContent='削除';remove.type='button';remove.onclick=()=>{
          this[kind].splice(index,1);this.onChange();
        };
        const input=(key,label,value)=>{
          const wrap=document.createElement('label');wrap.className='field';wrap.textContent=label;const el=document.createElement('input');el.type='number';el.step=p.integer?'1':'any';el.min=p.min/p.scale;el.max=(p.key==='mission.deadline'?this.scenario.duration:p.max)/p.scale;el.value=Number((value/p.scale).toPrecision(12));el.setAttribute('aria-label',p.label+' '+label);el.onchange=()=>{
            b[key]=Number(el.value)*p.scale;this.onChange();
          };wrap.append(el);return wrap;
        };
        if(kind==='factors'){
          const wrap=document.createElement('label');wrap.className='field';wrap.textContent='比較値（'+p.unit+'・カンマ区切り）';const values=document.createElement('input');values.value=b.values.map(v=>Number((v/p.scale).toPrecision(12))).join(', ');values.setAttribute('aria-label',p.label+' 比較値');values.onchange=()=>{
            b.values=values.value.split(/[,、\s]+/).filter(Boolean).map(v=>Number(v)*p.scale);this.onChange();
          };wrap.append(values);row.append(wrap);
        }else{
          const distribution=document.createElement('select');distribution.className='parameter-distribution';distribution.setAttribute('aria-label',p.label+' 分布');distribution.append(new Option('一様分布','uniform'),new Option('三角分布','triangular'));distribution.value=b.distribution;distribution.onchange=()=>{
            b.distribution=distribution.value;if(b.distribution==='triangular'&&b.mode===undefined)b.mode=p.integer?Math.round((b.min+b.max)/2):(b.min+b.max)/2;this.onChange();
          };row.append(distribution);
          const fields=document.createElement('div');fields.className='parameter-bounds';fields.append(input('min','最小',b.min),input('max','最大',b.max));if(b.distribution==='triangular')fields.append(input('mode','最頻値',b.mode));row.append(fields);
        }
        row.append(remove);host.append(row);
      });
      $('add-'+kind).disabled=this[kind].length>=(kind==='factors'?9:8)||!this.choices().length;
    }
  }
}
