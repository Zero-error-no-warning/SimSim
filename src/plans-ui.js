import {planEditor,switchPlan,savePlan,deleteActivePlan,planHasDraft} from './plan-editing.js?v=20261009-configuration-contract-28';
import {pruneSensitivity} from './sensitivity-settings.js?v=20261009-configuration-contract-28';
import {bindingTargetExists} from './parameters.js?v=20261009-configuration-contract-28';
import {clone} from './engine.js?v=20261009-configuration-contract-28';
import {capturePlan,planDifferences,planMetric} from './plan-settings.js?v=20261009-configuration-contract-28';
import {sensitivityMetrics} from './sensitivity-settings.js?v=20261009-configuration-contract-28';
import {summarizePlans} from './plans.js?v=20261009-configuration-contract-28';
import {requireElement as $} from './ui-dom.js?v=20261009-configuration-contract-28';
const format=(n,kind,delta=false)=>n===null?'—':(delta&&n>0?'+':'')+Number((n*(kind==='rate'?100:1)).toFixed(2))+(kind==='rate'?(delta?'ポイント':'%'):'秒');
export class PlansUI{
  constructor(owner){
    this.owner=owner;
    $('plan-select').onchange=()=>this.edit(s=>{
      Object.assign(s,switchPlan(s,$('plan-select').value));
      s.analysis.factors=(s.analysis.factors??[]).filter(b=>bindingTargetExists(s,b));pruneSensitivity(s);
    },'運用案を切り替えました。');
    $('plan-save').onclick=()=>{
      const s=this.editingSource(),p=s.analysis?.plans?.items.find(p=>p.id===planEditor(s).activeId);
      if(p)this.edit(s=>savePlan(s,p.name),'運用案を更新しました。');else this.openName('new');
    };
    $('plan-new').onclick=()=>this.openName('new');
    $('plan-rename').onclick=()=>this.openName('rename');
    $('plan-delete').onclick=()=>this.edit(deleteActivePlan,'保存済みの運用案を削除しました。編集内容は保持しています。');
    $('plan-name-cancel').onclick=()=>$('plan-name-dialog').close();
    $('plan-name-form').onsubmit=e=>{
      e.preventDefault();const name=$('plan-name').value.trim();if(!name)return;
      const success=this.edit(s=>{
        if(this.nameMode==='rename'){const id=planEditor(s).activeId;s.analysis.plans.items.find(p=>p.id===id).name=name;const draft=s.analysis.plans.editor?.drafts.find(d=>d.id===id);if(draft)draft.name=name;}
        else savePlan(s,name,{create:true});
      },this.nameMode==='rename'?'運用案の名前を変更しました。':'新しい運用案を保存しました。');
      if(success)$('plan-name-dialog').close();
    };
    $('plan-baseline').onchange=()=>this.change(s=>{s.analysis.plans.baselineId=$('plan-baseline').value;});
    $('plan-metric').onchange=()=>this.change(s=>{s.analysis.plans.metric=$('plan-metric').value;});
    $('plan-result-select').onchange=()=>this.renderResults();
    for(const side of ['base','changed'])$('plan-replay-'+side).onclick=()=>{
      const id=side==='base'?'plan:'+owner.base.analysis.plans.baselineId:$('plan-result-select').value,row=owner.rows.find(r=>r.condition.id===id),t=row?.trials.find(t=>t.trial===Number($('plan-trial').value));if(t)owner.replayTrial(row,t);
    };
  }
  config(s){return s.analysis?.plans??{metric:sensitivityMetrics(s)[0]?.id??'mission.rate',baselineId:'',items:[]};}
  read(){const s=this.editingSource();return s.analysis?.plans||$('analysis-mode').value==='plans'?{plans:clone(this.config(s))}:{};}
  change(fn,close=false){
    try{const s=this.owner.readConfig();s.analysis.plans=this.config(s);fn(s);if(this.owner.commit(s,'運用案を変更しました。')&&close)$('analysis-dialog').close();}
    catch(e){this.owner.showError(e.message);this.owner.renderConfig();}
  }
  editingSource(){return this.owner.previewing&&this.owner.base?this.owner.base:this.owner.getScenario();}
  edit(fn,message){
    try{
      const s=clone(this.editingSource());s.analysis??={factors:[],trials:100,step:s.recording.step,requiredRate:.95};
      const first=!s.analysis.plans?.items.length;s.analysis.plans=this.config(s);fn(s);
      if(first&&s.analysis.plans.items.length)s.analysis.mode='plans';
      const success=this.owner.commit(s,message);if(success)this.owner.activatePlanEditing?.();else this.renderConfig();$('plan-menu').open=false;return success;
    }catch(e){this.owner.showError(e.message);this.renderConfig();return false;}
  }
  openName(mode){
    this.nameMode=mode;const s=this.editingSource(),c=this.config(s),p=c.items.find(p=>p.id===planEditor(s).activeId);
    $('plan-name-title').textContent=mode==='rename'?'運用案の名前を変更':'新しい運用案として保存';
    $('plan-name').value=mode==='rename'?p?.name??'':p?p.name.slice(0,100)+'の別案':'運用案 '+(c.items.length+1);
    $('plan-menu').open=false;$('plan-name-dialog').showModal();$('plan-name').focus();$('plan-name').select();
  }
  renderConfig(){
    const s=this.editingSource(),c=this.config(s),e=planEditor(s),select=$('plan-select'),p=c.items.find(p=>p.id===e.activeId),dirty=p&&planHasDraft(s,p.id),preview=!!this.owner.previewing;
    const options=c.items.map(p=>new Option(p.name+(planHasDraft(s,p.id)?'（未更新）':''),p.id));
    for(const d of e.drafts.filter(d=>!c.items.some(p=>p.id===d.id)))options.push(new Option(d.name+'（未保存）',d.id));
    if(!options.some(o=>o.value===e.activeId))options.unshift(new Option('未保存の案',e.activeId));
    select.replaceChildren(...options);select.value=e.activeId;
    $('plan-save').textContent=p?'更新':'案として保存';$('plan-save').disabled=preview||!!p&&!dirty;
    $('plan-new').disabled=preview||c.items.length>=8;$('plan-rename').disabled=preview||!p;$('plan-delete').disabled=preview||!p;
    const differences=p?planDifferences(p.operation,capturePlan(s)):[];
    $('plan-current').textContent=preview?'分析試行の再生中 · 案を選ぶと編集に戻ります':p?(dirty?'未更新：'+differences.join('、'):'保存済み'):'未保存';
    $('plan-current').title='切替時に編集内容を保持します。分析は保存済みの案を使用します。シナリオの.txt保存には保持した編集内容も含まれます。';
    $('plans-editor').hidden=this.owner.getScenario().analysis?.mode!=='plans';
    $('plan-baseline').replaceChildren(...c.items.map(p=>new Option(p.name,p.id)));$('plan-baseline').value=c.baselineId;$('plan-baseline').disabled=!c.items.length;
    $('plan-metric').replaceChildren(...sensitivityMetrics(s).map(m=>new Option(m.label,m.id)));$('plan-metric').value=c.metric;
    $('plan-budget').textContent=c.items.length+'案（最大8） × '+(s.analysis?.trials??100)+'試行。合計10000試行まで。';
    const base=c.items.find(p=>p.id===c.baselineId);
    for(const id of ['plan-list','plan-analysis-list']){
      const body=$(id);body.replaceChildren();
      for(const item of c.items){const tr=document.createElement('tr');for(const v of [item.name+(item===base?'（基準）':''),base?planDifferences(base.operation,item.operation).join('、')||'基準と同じ':'—',planHasDraft(s,item.id)?'未更新の編集あり':'保存済み']){const td=document.createElement('td');td.textContent=v;tr.append(td);}body.append(tr);}
    }
    const pending=c.items.filter(p=>planHasDraft(s,p.id)).map(p=>p.name);
    $('plan-analysis-note').textContent=pending.length?'未更新：'+pending.join('、')+'。分析には保存済みの設定を使用します。通常画面で選択して「更新」すると反映されます。':'保存済みの案を比較します。案の切替・保存・更新は通常画面の3D表示上部で行います。';
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
