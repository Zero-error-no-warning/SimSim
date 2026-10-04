import {clone} from './engine.js?v=0.7.0-dev';
const $=id=>document.getElementById(id);
export class ActionUI {
  constructor({getScenario,getSelected,commit,showError,pause}) {
    Object.assign(this,{getScenario,getSelected,commit,showError,pause});
    $('actions-open').onclick=()=>this.open();$('unit-actions-open').onclick=()=>this.open();
    $('actions-close').onclick=()=>$('actions-dialog').close();
    $('action-target').onchange=()=>this.render();
    $('rule-add').onclick=()=>this.addRule();
    $('actions-form').onsubmit=e=>{e.preventDefault();this.save();};
  }
  entity(s=this.getScenario()) {const value=$('action-target').value;return value.startsWith('group:')?s.groups?.find(g=>g.id===value.slice(6))?.template:s.units.find(u=>u.id===value.slice(5));}
  open() {
    this.pause();const s=this.getScenario(),selected=this.getSelected(),target=$('action-target');target.replaceChildren();
    for(const u of s.units)target.append(new Option('ユニット: '+u.name,'unit:'+u.id));
    for(const g of s.groups??[])target.append(new Option('群: '+g.name,'group:'+g.id));
    const preferred=selected?.groupId?'group:'+selected.groupId:selected?'unit:'+selected.id:null;if(preferred&&[...target.options].some(o=>o.value===preferred))target.value=preferred;
    this.render();$('actions-dialog').showModal();
  }
  render() {
    const u=this.entity();$('action-definition').disabled=!u;$('rules-list').replaceChildren();if(!u)return;
    const b=u.behavior??{hold:false,preparation:0,rules:[]},c=u.communication??{enabled:false,range:10000,delay:0,probability:1,terrainLOS:false};
    $('action-hold').checked=b.hold;$('action-preparation').value=b.preparation;$('communication-enabled').checked=c.enabled;$('communication-range').value=c.range/1000;$('communication-delay').value=c.delay;$('communication-probability').value=c.probability*100;$('communication-los').checked=c.terrainLOS;
    $('action-route-note').textContent='出発後は設定済みの経路（'+u.route.length+'点）を進みます。'+(u.routeMode!=='once'?'周回・往復では到着イベントを発生させません。':'経由点なし・速度0・地形制約のある経路は到着成功になりません。');
    for(const rule of b.rules)this.addRule(rule);this.buttons();
  }
  buttons(){$('rule-add').disabled=!this.entity()||$('rules-list').children.length>=16;}
  addRule(rule=null) {
    if($('rules-list').children.length>=16)return;
    const row=document.createElement('div');row.className='behavior-rule';row.dataset.ruleId=rule?.id??'rule-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
    const field=(label,cls,options,value)=>{const wrapper=document.createElement('label');wrapper.className='field';wrapper.textContent=label;const select=document.createElement('select');select.className=cls;for(const [v,t] of options)select.append(new Option(t,v));select.value=value;wrapper.append(select);row.append(wrapper);return select;};
    field('条件','rule-when',[['detected','対象を初めて探知した'],['received','情報を受信した'],['arrived','経路の終点に到着した']],rule?.when??'received');
    field('追加条件','rule-state',[['any','状態を問わない'],['waiting','待機中のみ']],rule?.state??'any');
    const action=field('動作','rule-action',[['send','情報を送信する'],['depart','準備後に出発する']],rule?.action??'send');
    const receiver=field('送信先','rule-receiver',this.getScenario().units.map(u=>[u.id,u.name]),rule?.receiverId??this.getScenario().units[0]?.id);
    if(rule?.receiverId&&![...receiver.options].some(o=>o.value===rule.receiverId)){receiver.append(new Option('見つからない送信先: '+rule.receiverId,rule.receiverId));receiver.value=rule.receiverId;}
    const toggle=()=>receiver.parentElement.hidden=action.value!=='send';action.onchange=toggle;toggle();
    field('実行回数','rule-once',[['true','この試行で一度だけ'],['false','新しいイベントごと']],String(rule?.once??true));
    const remove=document.createElement('button');remove.type='button';remove.textContent='削除';remove.onclick=()=>{row.remove();this.buttons();};row.append(remove);$('rules-list').append(row);this.buttons();
  }
  save() {
    try {
      const next=clone(this.getScenario()),u=this.entity(next);if(!u)return;
      u.communication={enabled:$('communication-enabled').checked,range:Number($('communication-range').value)*1000,delay:Number($('communication-delay').value),probability:Number($('communication-probability').value)/100,terrainLOS:$('communication-los').checked};
      u.behavior={hold:$('action-hold').checked,preparation:Number($('action-preparation').value),rules:[...$('rules-list').children].map(row=>{const read=cls=>row.querySelector('.'+cls).value;return {id:row.dataset.ruleId,when:read('rule-when'),state:read('rule-state'),action:read('rule-action'),once:read('rule-once')==='true',...(read('rule-action')==='send'?{receiverId:read('rule-receiver')}:{})};})};
      if(this.commit(next,'条件付き行動と通信を変更しました。'))$('actions-dialog').close();
      else if(JSON.stringify(next)===JSON.stringify(this.getScenario()))$('actions-dialog').close();
    }catch(error){this.showError(error.message);}
  }
}
