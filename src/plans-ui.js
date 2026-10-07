import {pruneSensitivity} from './sensitivity-settings.js?v=20261007-plans-23';
import {bindingTargetExists} from './parameters.js?v=20261007-plans-23';
import {clone} from './engine.js?v=20261007-plans-23';
import {capturePlan,applyPlan,planDifferences,planMetric} from './plan-settings.js?v=20261007-plans-23';
import {sensitivityMetrics} from './sensitivity-settings.js?v=20261007-plans-23';
import {summarizePlans} from './plans.js?v=20261007-plans-23';
import {requireElement as $} from './ui-dom.js?v=20261007-plans-23';
const format=(n,kind,delta=false)=>n===null?'—':(delta&&n>0?'+':'')+Number((n*(kind==='rate'?100:1)).toFixed(2))+(kind==='rate'?(delta?'ポイント':'%'):'秒');
export class PlansUI{
  constructor(owner){
    this.owner=owner;
    $('plan-select').onchange=()=>this.renderSelection();
    $('plan-save').onclick=()=>this.saveCurrent();
    $('plan-load').onclick=()=>this.change(s=>{const p=s.analysis.plans.items.find(p=>p.id===$('plan-select').value);if(!p)throw Error('運用案を選択してください。');Object.assign(s,applyPlan(s,p));s.analysis.factors=(s.analysis.factors??[]).filter(b=>bindingTargetExists(s,b));pruneSensitivity(s);},true);
    $('plan-delete').onclick=()=>this.change(s=>{const c=s.analysis.plans;c.items=c.items.filter(p=>p.id!==$('plan-select').value);if(!c.items.some(p=>p.id===c.baselineId))c.baselineId=c.items[0]?.id??'';});
    $('plan-baseline').onchange=()=>this.change(s=>{s.analysis.plans.baselineId=$('plan-baseline').value;});
    $('plan-metric').onchange=()=>this.change(s=>{s.analysis.plans.metric=$('plan-metric').value;});
    $('plan-result-select').onchange=()=>this.renderResults();
    for(const side of ['base','changed'])$('plan-replay-'+side).onclick=()=>{
      const id=side==='base'?'plan:'+owner.base.analysis.plans.baselineId:$('plan-result-select').value,row=owner.rows.find(r=>r.condition.id===id),t=row?.trials.find(t=>t.trial===Number($('plan-trial').value));if(t)owner.replayTrial(row,t);
    };
  }
  config(s){return s.analysis?.plans??{metric:sensitivityMetrics(s)[0]?.id??'mission.rate',baselineId:'',items:[]};}
  read(){const s=this.owner.getScenario();return s.analysis?.plans||$('analysis-mode').value==='plans'?{plans:clone(this.config(s))}:{};}
  change(fn,close=false){
    try{const s=this.owner.readConfig();s.analysis.plans=this.config(s);fn(s);if(this.owner.commit(s,'運用案を変更しました。')&&close)$('analysis-dialog').close();}
    catch(e){this.owner.showError(e.message);this.owner.renderConfig();}
  }
  saveCurrent(){
    const id=$('plan-select').value,name=$('plan-name').value.trim();
    this.change(s=>{const c=s.analysis.plans;if(!name)throw Error('運用案名を入力してください。');let p=c.items.find(p=>p.id===id);if(!p){if(c.items.length>=8)throw Error('運用案は最大8件です。');let i=1;while(c.items.some(p=>p.id==='plan-'+i))i++;p={id:'plan-'+i};c.items.push(p);c.baselineId||=p.id;}Object.assign(p,{name,operation:capturePlan(s)});this.selected=p.id;});
  }
  renderConfig(){
    const s=this.owner.getScenario(),c=this.config(s),select=$('plan-select'),old=this.selected??select.value;this.selected=null;
    $('plans-editor').hidden=s.analysis?.mode!=='plans';select.replaceChildren(new Option('＋ 新しい案として保存',''),...c.items.map(p=>new Option(p.name,p.id)));if(c.items.some(p=>p.id===old))select.value=old;
    $('plan-baseline').replaceChildren(...c.items.map(p=>new Option(p.name,p.id)));$('plan-baseline').value=c.baselineId;$('plan-baseline').disabled=!c.items.length;
    $('plan-metric').replaceChildren(...sensitivityMetrics(s).map(m=>new Option(m.label,m.id)));$('plan-metric').value=c.metric;
    $('plan-budget').textContent=c.items.length+'案（最大8） × '+(s.analysis?.trials??100)+'試行。合計10000試行まで。';
    this.renderSelection();
  }
  renderSelection(){
    const s=this.owner.getScenario(),c=this.config(s),p=c.items.find(p=>p.id===$('plan-select').value),current=capturePlan(s);$('plan-name').value=p?.name??'運用案 '+(c.items.length+1);$('plan-save').textContent=p?'現在の設定で更新':'現在の設定を保存';$('plan-load').disabled=!p;$('plan-delete').disabled=!p;
    const differences=p?planDifferences(p.operation,current):[];$('plan-current').textContent=p?(differences.length?'保存した案と現在の編集の違い：'+differences.join('、'):'現在の編集は保存した案と一致しています。'):'配置・経路・報告間隔・挙動・能力・担当をまとめて保存します。';
    const base=c.items.find(p=>p.id===c.baselineId),body=$('plan-list');body.replaceChildren();
    for(const item of c.items){const tr=document.createElement('tr');for(const v of [item.name+(item===base?'（基準）':''),base?planDifferences(base.operation,item.operation).join('、')||'基準と同じ':'—']){const td=document.createElement('td');td.textContent=v;tr.append(td);}body.append(tr);}
  }
  renderResults(){
    const o=this.owner,active=o.resultMode==='plans'&&!!o.base;$('plans-results').hidden=!active;if(!active)return;
    const entries=summarizePlans(o.base,o.rows),metric=planMetric(o.base),base=o.rows.find(r=>r.condition.id==='plan:'+o.base.analysis.plans.baselineId),body=$('plan-result-rows');body.replaceChildren();
    $('plan-result-heading').textContent='基準案との差 · '+metric.label;
    for(const r of entries){const tr=document.createElement('tr');for(const value of [r.condition.label,format(r.pairedBaseline,metric.kind),format(r.pairedChanged,metric.kind),format(r.delta,metric.kind,true),r.low===null?'—':format(r.low,metric.kind,true)+' ～ '+format(r.high,metric.kind,true),r.pairs+' / '+r.total,r.improved+' / '+r.worsened,r.baselineMissing+' / '+r.changedMissing,r.invalidPairs]){const td=document.createElement('td');td.textContent=value;tr.append(td);}body.append(tr);}
    const select=$('plan-result-select'),old=select.value;select.replaceChildren(...entries.map(r=>new Option(r.condition.label,r.condition.id)));if(entries.some(r=>r.condition.id===old))select.value=old;
    const changed=o.rows.find(r=>r.condition.id===select.value),pick=$('plan-trial'),trial=pick.value;pick.replaceChildren(...(changed?.trials??[]).filter(t=>base?.trials.some(b=>b.trial===t.trial)).map(t=>new Option('試行 '+t.trial+' · 基準 '+(base.trials.find(b=>b.trial===t.trial).success?'成立':'未達')+'／比較 '+(t.success?'成立':'未達'),String(t.trial))));if([...pick.options].some(p=>p.value===trial))pick.value=trial;
    for(const side of ['base','changed'])$('plan-replay-'+side).disabled=o.running||!pick.options.length;
    $('plan-result-note').textContent='基準：'+(base?.condition.label??'—')+'。率は全対応試行、時間は両案で成立した対応試行の平均差です。未達は時間を0に置き換えず除外します。正の率差は改善、負の時間差は短縮。'+(o.running?'途中結果です。':'');
  }
}
