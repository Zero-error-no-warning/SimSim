import {clone} from './engine.js?v=20261009-information-analysis-26';
import {parameter,readParameter,bindingKey,formatBinding} from './parameters.js?v=20261009-information-analysis-26';
import {sensitivityBindings,sensitivityMetrics,defaultSensitivityCandidate} from './sensitivity-settings.js?v=20261009-information-analysis-26';
import {summarizeSensitivity,metricValue} from './sensitivity.js?v=20261009-information-analysis-26';
import {requireElement as $} from './ui-dom.js?v=20261009-information-analysis-26';
const number=n=>n===null?'—':Number(n.toFixed(3)).toString();
export class SensitivityUI{
  constructor(owner){
    this.owner=owner;this.selected=null;
    $('analysis-mode').onchange=()=>this.save();
    $('sensitivity-target').onchange=()=>this.renderCandidates();
    $('sensitivity-metric').onchange=()=>{this.config.metric=$('sensitivity-metric').value;this.save();};
    $('sensitivity-all').onchange=()=>{
      const target=$('sensitivity-target').value,checked=$('sensitivity-all').checked;
      for(const b of this.bindings.filter(b=>b.target===target)){
        const key=bindingKey(b),existing=this.config.candidates.find(c=>bindingKey(c)===key);this.config.candidates=this.config.candidates.filter(c=>bindingKey(c)!==key);if(checked)this.config.candidates.push(existing??defaultSensitivityCandidate(this.scenario,b));
      }
      this.save();
    };
    $('sensitivity-focus').onclick=()=>{
      const row=this.selectedRow();if(!row)return;
      $('analysis-dialog').close();owner.focusSensitivity(row.condition.candidate);
    };
    for(const changed of [false,true])$('sensitivity-replay-'+(changed?'changed':'base')).onclick=()=>{
      const row=this.selectedRow(),condition=changed?row?.condition:this.owner.rows.find(r=>r.condition.id==='baseline')?.condition;
      const result=this.owner.rows.find(r=>r.condition.id===condition?.id),trial=result?.trials.find(t=>t.trial===Number($('sensitivity-trial').value));
      if(trial)this.owner.replayTrial(result,trial);
    };
  }
  save(){
    try{this.owner.commit(this.owner.readConfig(),'感度分析の設定を変更しました。');}
    catch(e){this.owner.showError(e.message);this.owner.renderConfig();}
  }
  read(){
    return {mode:$('analysis-mode').value,...(this.config?.metric?{sensitivity:clone(this.config)}:{})};
  }
  renderConfig(){
    this.scenario=this.owner.getScenario();this.bindings=sensitivityBindings(this.scenario);
    const stored=this.scenario.analysis?.sensitivity;
    const sensible=this.bindings.filter(b=>!b.parameter.startsWith('state.')&&!b.parameter.startsWith('motion.')&&!b.parameter.startsWith('task.route.')&&!b.parameter.startsWith('extent.deployment.')&&b.parameter!=='extent.sense.mountHeight');
    this.config=clone(stored??{metric:sensitivityMetrics(this.scenario)[0]?.id,candidates:sensible.slice(0,32).map(b=>defaultSensitivityCandidate(this.scenario,b))});
    $('analysis-mode').value=this.scenario.analysis?.mode??'comparison';
    const active=$('analysis-mode').value==='sensitivity';$('sensitivity-editor').hidden=!active;$('comparison-editor').hidden=$('analysis-mode').value!=='comparison';
    $('analysis-run').textContent=active?'感度分析を実行':$('analysis-mode').value==='plans'?'運用案を比較':'分析を実行';
    $('sensitivity-metric').replaceChildren(...sensitivityMetrics(this.scenario).map(m=>new Option(m.label,m.id)));$('sensitivity-metric').value=this.config.metric??'';
    const targets=new Map(this.bindings.map(b=>[b.target,b.targetLabel])),select=$('sensitivity-target'),old=select.value;
    select.replaceChildren(...[...targets].map(([id,name])=>new Option(name,id)));if(targets.has(old))select.value=old;
    this.renderCandidates();
  }
  renderCandidates(){
    const target=$('sensitivity-target').value,bindings=this.bindings.filter(b=>b.target===target),body=$('sensitivity-candidates');body.replaceChildren();
    for(const b of bindings){
      const key=bindingKey(b),p=parameter(b.parameter),base=readParameter(this.scenario,b),chosen=this.config.candidates.find(c=>bindingKey(c)===key),values=chosen??defaultSensitivityCandidate(this.scenario,b),tr=document.createElement('tr');tr.dataset.parameter=b.parameter;
      const label=document.createElement('label'),checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=!!chosen;checkbox.setAttribute('aria-label',p.label+'を調べる');
      checkbox.onchange=()=>{this.config.candidates=this.config.candidates.filter(c=>bindingKey(c)!==key);if(checkbox.checked)this.config.candidates.push(values);this.save();};
      label.append(checkbox,document.createTextNode(p.label+' ('+p.unit+')'));const td=document.createElement('td');td.append(label);tr.append(td);
      const current=document.createElement('td');current.textContent=number(base/p.scale);tr.append(current);
      for(const field of ['low','high']){
        const cell=document.createElement('td'),input=document.createElement('input');input.type='number';input.step=p.integer?'1':'any';input.min=p.min/p.scale;input.max=p.max/p.scale;input.value=Number((values[field]/p.scale).toPrecision(12));input.disabled=!chosen;input.setAttribute('aria-label',p.label+' '+(field==='low'?'小さい値':'大きい値'));
        input.onchange=()=>{chosen[field]=input.value===''?NaN:Number(input.value)*p.scale;this.save();};cell.append(input);tr.append(cell);
      }
      body.append(tr);
    }
    const n=bindings.filter(b=>this.config.candidates.some(c=>bindingKey(c)===bindingKey(b))).length;
    $('sensitivity-all').checked=bindings.length>0&&n===bindings.length;$('sensitivity-all').indeterminate=n>0&&n<bindings.length;$('sensitivity-all').disabled=!bindings.length;
    let variations=1;for(const c of this.config.candidates){const base=readParameter(this.scenario,c);variations+=Number(c.low!==base)+Number(c.high!==base);}
    $('sensitivity-plan').textContent='選択済み '+this.config.candidates.length+'項目（最大32） · 基準1条件＋変更 '+(variations-1)+'条件 × '+($('analysis-trials').value||this.scenario.analysis?.trials||100)+'試行。最大10000試行。';
    $('sensitivity-empty').hidden=bindings.length>0;
  }
  selectedRow(){return this.entries?.find(r=>r.condition.id===this.selected);}
  format(value,kind,{delta=false}={}){return value===null?'—':(delta&&value>0?'+':'')+number(kind==='rate'?value*100:value)+(kind==='rate'?(delta?'ポイント':'%'):'秒');}
  renderResults(){
    const o=this.owner,active=o.resultMode==='sensitivity'&&!!o.base,panel=$('sensitivity-results');panel.hidden=!active;
    if(!active)return;
    const s=o.base,metric=sensitivityMetrics(s).find(m=>m.id===s.analysis.sensitivity.metric);this.entries=summarizeSensitivity(s,o.rows);
    if(!this.entries.some(r=>r.condition.id===this.selected))this.selected=this.entries[0]?.condition.id??null;
    $('sensitivity-result-heading').textContent='感度分析 · '+metric.label;
    const body=$('sensitivity-rows');body.replaceChildren();
    for(const r of this.entries){
      const tr=document.createElement('tr');tr.tabIndex=0;tr.dataset.condition=r.condition.id;tr.className=r.condition.id===this.selected?'selected-result':'';tr.setAttribute('aria-selected',String(r.condition.id===this.selected));
      const p=parameter(r.condition.candidate.parameter),setting=r.condition.settings[0];
      const values=[r.rank??'—',formatBinding(s,setting,setting.value).split(' = ')[0],number(r.condition.baseValue/p.scale)+' → '+number(setting.value/p.scale)+' '+p.unit,this.format(r.pairedBaseline,metric.kind),this.format(r.pairedChanged,metric.kind),this.format(r.delta,metric.kind,{delta:true}),r.low===null?'—':this.format(r.low,metric.kind,{delta:true})+' ～ '+this.format(r.high,metric.kind,{delta:true}),r.pairs+' / '+r.total,r.improved+' / '+r.worsened,r.baselineMissing+' / '+r.changedMissing];
      for(const value of values){const td=document.createElement('td');td.textContent=value;tr.append(td);}
      tr.onclick=()=>{this.selected=r.condition.id;this.renderResults();};tr.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();tr.click();}};body.append(tr);
    }
    this.renderChart(metric);this.renderSelection(metric);
    $('sensitivity-summary').textContent='順位は今回の変更範囲での平均差の絶対値（各項目の最大）です。到達率は全試行、時刻・所要時間は両条件で成立した対応試行のみを集計。表の基準・変更も同じ対応試行の平均です。差がない項目も表示します。'+(o.running?'途中結果です。':'');
  }
  renderSelection(metric){
    const r=this.selectedRow(),o=this.owner,panel=$('sensitivity-selection');panel.hidden=!r;if(!r)return;
    const base=o.rows.find(r=>r.condition.id==='baseline'),changed=o.rows.find(row=>row.condition.id===r.condition.id),s=o.base;
    $('sensitivity-selection-name').textContent=r.condition.label;
    $('sensitivity-selection-note').textContent='全条件の有効値の平均：基準 '+this.format(r.baseline,metric.kind)+'（'+r.baselineEligible+'試行）／変更 '+this.format(r.changed,metric.kind)+'（'+r.changedEligible+'試行）。初期配置不正を含む対応試行 '+r.invalidPairs+'。'+(metric.kind==='rate'?'正の差は成立率の増加です。':'負の差は時間の短縮です。未達・起点未達・順序逆転は時間差から除外します。');
    const pick=$('sensitivity-trial'),old=pick.value,originals=new Map(base.trials.map(t=>[t.trial,t]));pick.replaceChildren(...changed.trials.filter(t=>originals.has(t.trial)).map(t=>{const before=metricValue(s,originals.get(t.trial),metric),after=metricValue(s,t,metric);return new Option('試行 '+t.trial+' · '+this.format(before,metric.kind)+' → '+this.format(after,metric.kind),String(t.trial));}));
    if([...pick.options].some(p=>p.value===old))pick.value=old;
    for(const id of ['sensitivity-replay-base','sensitivity-replay-changed'])$(id).disabled=o.running||!pick.options.length;
  }
  renderChart(metric){
    const host=$('sensitivity-chart');host.replaceChildren();if(!this.entries.length)return;
    const rows=this.entries,ns='http://www.w3.org/2000/svg',height=rows.length*34+65,svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 720 '+height);svg.setAttribute('role','img');svg.setAttribute('aria-label','項目ごとの対応試行の平均差と95%近似区間');
    const add=(tag,attrs,label)=>{const e=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);if(label!==undefined)e.textContent=label;svg.append(e);return e;};
    const limit=Math.max(metric.kind==='rate'?.01:1,...rows.flatMap(r=>[Math.abs(r.delta??0),Math.abs(r.low??0),Math.abs(r.high??0)])),x=v=>465+v/limit*225;
    add('line',{x1:x(0),x2:x(0),y1:20,y2:height-36,stroke:'#a9c5da'});
    for(const v of [-limit,0,limit])add('text',{x:x(v),y:height-12,fill:'#a9c5da','text-anchor':'middle','font-size':12},this.format(v,metric.kind,{delta:true}));
    rows.forEach((r,i)=>{
      const y=30+i*34,g=add('g',{tabindex:0,role:'button','aria-label':r.condition.label+'：'+this.format(r.delta,metric.kind,{delta:true}),'data-condition':r.condition.id});
      const label=formatBinding(this.owner.base,r.condition.settings[0],r.condition.settings[0].value),short=label.length>32?label.slice(0,31)+'…':label;
      const text=document.createElementNS(ns,'text');text.setAttribute('x',8);text.setAttribute('y',y+5);text.setAttribute('fill','#cfe5f3');text.setAttribute('font-size',12);text.textContent=(r.rank??'—')+' · '+short;g.append(text);
      const title=document.createElementNS(ns,'title');title.textContent=label+' · '+this.format(r.delta,metric.kind,{delta:true});g.append(title);
      const rect=document.createElementNS(ns,'rect');rect.setAttribute('x',r.delta===null?x(0):Math.min(x(0),x(r.delta)));rect.setAttribute('y',y-8);rect.setAttribute('width',Math.max(2,Math.abs(x(r.delta??0)-x(0))));rect.setAttribute('height',16);rect.setAttribute('fill',r.delta===null?'#748a9d':(metric.kind==='rate'?r.delta>=0:r.delta<=0)?'#64d6b1':'#f8b16d');if(r.condition.id===this.selected){rect.setAttribute('stroke','#fff');rect.setAttribute('stroke-width',2);}g.append(rect);
      if(r.low!==null){const line=document.createElementNS(ns,'line');for(const [k,v]of Object.entries({x1:x(r.low),x2:x(r.high),y1:y,y2:y,stroke:'#e6f1fa','stroke-width':2}))line.setAttribute(k,v);g.append(line);}
      g.onclick=()=>{this.selected=r.condition.id;this.renderResults();};g.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();g.onclick();}};
    });host.append(svg);
  }
}
