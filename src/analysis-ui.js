import {clone,validateScenario} from './engine.js?v=0.3';
import {scenarioForCount} from './detection.js?v=0.3';
const $=id=>document.getElementById(id);
const percent=v=>v===null?'—':(v*100).toFixed(1)+'%';
const minutes=v=>v===null?'—':(v/60).toFixed(1)+'分';
export class AnalysisUI {
  constructor({getScenario,getSnapshot,commit,replay,seek,showError,notify}) {
    Object.assign(this,{getScenario,getSnapshot,commit,replay,seek,showError,notify});
    this.worker=new Worker(new URL('./analysis-worker.js?v=0.3',import.meta.url),{type:'module',name:'SimSim Monte Carlo'});
    this.runId=0;this.running=false;this.rows=[];this.base=null;
    this.worker.onmessage=({data})=>{
      if(data.runId!==this.runId)return;
      if(data.type==='error'){this.running=false;this.buttons();this.renderResults();showError(data.message);$('analysis-progress').textContent='分析エラー';return;}
      this.rows=data.rows;this.elapsedMs=data.elapsedMs;this.completed=data.completed;this.planned=data.planned;
      if(data.type==='complete')this.running=false;
      $('analysis-progress').textContent=(this.running?'実行中':'完了')+' · '+data.completed+' / '+data.planned+'試行 · '+(data.elapsedMs/1000).toFixed(1)+'秒';
      $('analysis-bar').max=data.planned;$('analysis-bar').value=data.completed;this.renderResults();this.buttons();
    };
    this.worker.onerror=event=>{event.preventDefault();this.stop();showError('分析Workerの起動・実行に失敗しました。'+(event.message??''));};
    $('analysis-open').onclick=()=>{$('analysis-dialog').showModal();};
    $('analysis-close').onclick=()=>$('analysis-dialog').close();
    $('detection-demo').onclick=()=>document.dispatchEvent(new Event('load-detection-demo'));
    for(const id of ['mission-enabled','mission-observer','mission-target','mission-join','mission-deadline','analysis-group','analysis-counts','analysis-trials','analysis-step','analysis-required'])$(id).addEventListener('change',()=>{
      if(id==='mission-observer'&&$('mission-observer').value===$('mission-target').value)$('mission-target').value=['friendly','hostile','neutral'].find(v=>v!==$('mission-observer').value);
      if(id==='mission-target'&&$('mission-observer').value===$('mission-target').value)$('mission-observer').value=['friendly','hostile','neutral'].find(v=>v!==$('mission-target').value);
      try{const next=this.readConfig(id);this.commit(next,'成功条件・分析設定を変更しました。');}catch(error){showError(error.message);this.renderConfig();}
    });
    $('analysis-run').onclick=()=>this.start();
    $('analysis-cancel').onclick=()=>{this.stop();$('analysis-progress').textContent='中止 · 完了済みの試行だけを表示しています。';this.renderResults();};
    $('analysis-restore').onclick=()=>{if(this.base){this.replay(clone(this.base),'分析元のシナリオに戻しました。');this.highlightCount=null;this.renderResults();}};
    $('analysis-export').onclick=()=>this.export();
    $('events-open').onclick=()=>{this.renderEvents();$('events-dialog').showModal();};
    $('events-close').onclick=()=>$('events-dialog').close();
  }
  stop(){this.worker.postMessage({type:'cancel'});this.runId++;this.running=false;this.buttons();}
  onScenario({keepResults=false}={}) {
    if(!keepResults){this.stop();this.rows=[];this.base=null;this.highlightCount=null;this.completed=0;this.planned=0;$('analysis-progress').textContent='分析は未実行です。';$('analysis-bar').value=0;this.renderResults();}
    this.renderConfig();this.buttons();
  }
  loadResult(result) {
    this.stop();this.base=clone(result.source);this.rows=result.rows;this.completed=result.completed;this.planned=result.planned;this.elapsedMs=result.elapsedMs;this.highlightCount=null;
    $('analysis-progress').textContent='保存済み結果（再計算なし） · '+this.completed+' / '+this.planned+'試行';$('analysis-bar').max=this.planned;$('analysis-bar').value=this.completed;this.renderConfig();this.renderResults();this.buttons();$('analysis-dialog').showModal();
  }
  renderConfig() {
    const s=this.getScenario(),m=s.mission??{observerFaction:'friendly',targetFaction:'hostile',join:'any',deadline:s.duration},a=s.analysis??{groupId:s.groups?.[0]?.id??'',counts:[0,100,300,1000],trials:100,step:10,requiredRate:.95};
    $('mission-enabled').checked=!!s.mission;$('mission-observer').value=m.observerFaction;$('mission-target').value=m.targetFaction;$('mission-join').value=m.join;$('mission-deadline').value=+(m.deadline/60).toFixed(3);$('mission-deadline').dataset.display=$('mission-deadline').value;$('mission-deadline').dataset.seconds=m.deadline;$('mission-deadline').title=m.deadline+'秒';$('mission-deadline').max=s.duration/60;
    $('mission-target-note').textContent=m.targetIds?'対象ID指定: '+m.targetIds.join(', ')+'（対象陣営の変更で解除）':'対象側の陣営に属する全ユニットを評価します。';
    $('analysis-group').replaceChildren();for(const g of s.groups??[])$('analysis-group').append(new Option(g.name+' ('+g.count+'個)',g.id));
    if(!(s.groups??[]).some(g=>g.id===a.groupId)&&this.base?.groups?.some(g=>g.id===a.groupId))$('analysis-group').append(new Option('分析時の群（現在は除外）',a.groupId));
    $('analysis-group').value=a.groupId;$('analysis-counts').value=a.counts.join(', ');$('analysis-trials').value=a.trials;$('analysis-step').value=a.step;$('analysis-required').value=a.requiredRate*100;
  }
  readConfig(changedId='') {
    const next=clone(this.getScenario());
    if($('mission-enabled').checked){next.mission={...next.mission,type:'detect',observerFaction:$('mission-observer').value,targetFaction:$('mission-target').value,join:$('mission-join').value,deadline:$('mission-deadline').value===$('mission-deadline').dataset.display?Number($('mission-deadline').dataset.seconds):Math.round(Number($('mission-deadline').value)*60*1e6)/1e6};if(changedId==='mission-target')delete next.mission.targetIds;}
    else delete next.mission;
    next.analysis={...next.analysis,groupId:$('analysis-group').value,counts:$('analysis-counts').value.split(/[,、\s]+/).filter(Boolean).map(Number),trials:Number($('analysis-trials').value),step:Number($('analysis-step').value),requiredRate:Number($('analysis-required').value)/100};
    return validateScenario(next);
  }
  start() {
    try {
      const next=this.readConfig();
      if(JSON.stringify(next)!==JSON.stringify(this.getScenario())&&!this.commit(next,'分析設定を変更しました。'))return;
      this.stop();this.base=clone(this.getScenario());this.rows=[];this.running=true;this.highlightCount=null;this.completed=0;this.planned=this.base.analysis.counts.length*this.base.analysis.trials;this.buttons();this.renderResults();
      $('analysis-progress').textContent='準備中…';$('analysis-bar').max=this.planned;$('analysis-bar').value=0;this.worker.postMessage({type:'run',runId:++this.runId,scenario:this.base});
    }catch(error){this.showError(error.message);}
  }
  buttons() {
    $('analysis-run').disabled=this.running;$('analysis-cancel').disabled=!this.running;$('analysis-export').disabled=!this.rows.length;$('analysis-restore').disabled=!this.base||this.running;
  }
  renderResults() {
    $('analysis-rows').replaceChildren();
    for(const row of this.rows) {
      const tr=document.createElement('tr');if(row.count===this.highlightCount)tr.className='selected-result';
      for(const value of [row.count,row.successes+' / '+row.total,percent(row.rate),percent(row.rate===null?null:1-row.rate),percent(row.low)+'–'+percent(row.high),minutes(row.median),row.invalidTrials]){const td=document.createElement('td');td.textContent=value;tr.append(td);}
      const td=document.createElement('td'),input=document.createElement('input'),button=document.createElement('button');input.type='number';input.step='1';input.min=row.trials[0]?.trial??0;input.max=row.trials.at(-1)?.trial??0;input.value=(row.trials.find(t=>!t.success)??row.trials[0])?.trial??0;input.setAttribute('aria-label',row.count+'個の条件の試行番号');input.disabled=this.running;button.textContent='再現';button.disabled=this.running;
      button.onclick=()=>{const trial=row.trials.find(t=>t.trial===Number(input.value));if(!trial){this.showError('完了済みの試行番号を指定してください。');return;}const next=scenarioForCount(this.base,this.base.analysis.groupId,row.count,trial.trial);this.replay(next,row.count+'個・試行 '+trial.trial+' を再現しました。');this.seek(trial.successTime??this.base.mission.deadline);this.highlightCount=row.count;this.renderResults();$('analysis-dialog').close();};
      td.append(input,button);tr.append(td);$('analysis-rows').append(tr);
    }
    this.renderChart();
    const requirement=this.base?.analysis.requiredRate??.95;
    const point=this.rows.find(r=>r.rate!==null&&r.rate>=requirement),lower=this.rows.find(r=>r.low!==null&&r.low>=requirement);
    $('analysis-summary').textContent=this.rows.length?'要求 '+percent(requirement)+' · 点推定で満たす最少の比較点: '+(point?point.count+'個':'未確認')+' · 区間下限でも満たす比較点: '+(lower?lower.count+'個':'未確認')+'。中央値は成功試行だけを集計。'+(this.running?'途中結果です。':''):'成功率と95%信頼区間を表示します。';
  }
  renderChart() {
    const host=$('analysis-chart');host.replaceChildren();if(!this.rows.length)return;
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 640 260');svg.setAttribute('role','img');svg.setAttribute('aria-label','個数ごとの成功率と95%信頼区間');
    const add=(tag,attrs,text)=>{const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);if(text!==undefined)el.textContent=text;svg.append(el);return el;};
    const left=55,right=625,top=20,bottom=210,y=p=>bottom-(bottom-top)*p;
    for(const p of [0,.25,.5,.75,1]){add('line',{x1:left,x2:right,y1:y(p),y2:y(p),stroke:'#344e64'});add('text',{x:left-7,y:y(p)+4,fill:'#a7bfd1','text-anchor':'end','font-size':11},Math.round(p*100)+'%');}
    const required=this.base?.analysis.requiredRate??.95;add('line',{x1:left,x2:right,y1:y(required),y2:y(required),stroke:'#ffc580','stroke-dasharray':'5 4'});
    const width=(right-left)/this.rows.length;
    this.rows.forEach((row,index)=>{const x=left+(index+.5)*width;if(row.rate===null)return;add('rect',{x:x-width*.25,y:y(row.rate),width:width*.5,height:bottom-y(row.rate),fill:row.count===this.highlightCount?'#ffbc75':'#2786b6',opacity:.6});add('line',{x1:x,x2:x,y1:y(row.low),y2:y(row.high),stroke:'#d6effb','stroke-width':2});for(const p of [row.low,row.high])add('line',{x1:x-5,x2:x+5,y1:y(p),y2:y(p),stroke:'#d6effb'});add('circle',{cx:x,cy:y(row.rate),r:4,fill:'#74d8ff'});add('text',{x,y:bottom+19,fill:'#c5d9e8','text-anchor':'middle','font-size':11},row.count);});
    add('text',{x:(left+right)/2,y:250,fill:'#91acbf','text-anchor':'middle','font-size':11},'比較した群の個数（各条件を等間隔に表示）');host.append(svg);
  }
  onSnapshot() {
    const mission=this.getSnapshot()?.mission,el=$('mission-status');
    if(!mission){el.className='';el.textContent=this.getSnapshot()?.missionError?'評価できません: '+this.getSnapshot().missionError:this.getScenario()?.mission?'探知を計算中…':'成功条件は未設定';}
    else {el.className=mission.status;el.textContent=({pending:'評価中',success:'成功条件成立',failure:'期限までに未成立'})[mission.status]+' · 探知 '+mission.detectedCount+' / '+mission.targetCount+' · 期限 '+minutes(mission.deadline);}
    if($('events-dialog').open)this.renderEvents();
  }
  renderEvents() {
    const m=this.getSnapshot()?.mission,list=$('event-list');list.replaceChildren();$('events-summary').textContent=m?'現在時刻までの初回探知 '+m.events.length+'件。判定区間の末尾時刻で記録します。':'成功条件を設定すると探知履歴を表示します。';
    for(const event of m?.events.slice(-200)??[]) {
      const row=document.createElement('div');row.className='event-item';const text=document.createElement('span'),button=document.createElement('button');text.textContent=minutes(event.time)+' · '+event.observerId+' → '+event.targetId+' · 距離 '+Math.round(event.distance)+'m';button.textContent='この時刻';button.onclick=()=>{this.seek(event.time,event.targetId);$('events-dialog').close();};row.append(text,button);list.append(row);
    }
  }
  export() {
    const payload={type:'SimSim-analysis',version:1,model:'range-hazard-v1',confidence:'Wilson two-sided 95%',completed:this.completed,planned:this.planned,partial:this.completed<this.planned,elapsedMs:this.elapsedMs,source:this.base,rows:this.rows};
    const blob=new Blob([JSON.stringify(payload,null,2)+'\n'],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='SimSim-analysis.jsn';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);this.notify('分析条件と試行結果を.jsnで保存しました。');
  }
}
