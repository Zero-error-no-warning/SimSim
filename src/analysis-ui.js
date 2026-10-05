import { numericScale } from './chart-scale.js';
import { clone,validateScenario } from './engine.js';
import { trialScenario,analysisConditions,formatBinding,bindingKey,parameter,normalizedAnalysis } from './parameters.js';
import { ParameterEditor } from './parameter-ui.js';
const $=id=>document.getElementById(id);
const percent=v=>v===null?'—':(v*100).toFixed(1)+'%';
const minutes=v=>v===null?'—':(v/60).toFixed(1)+'分';
export class AnalysisUI {
  constructor({
    getScenario,getSnapshot,commit,replay,seek,showError,notify
  }) {
    Object.assign(this,{
      getScenario,getSnapshot,commit,replay,seek,showError,notify
    });
    this.worker=new Worker(new URL('./analysis-worker.js',import.meta.url),{
      type:'module',name:'SimSim Monte Carlo'
    });
    this.parameters=new ParameterEditor(()=>{
      try{
        this.commit(this.readConfig(),'分析の変数設定を変更しました。');
      }catch(error){
        showError(error.message);
      }
      this.renderConfig();
    });
    this.runId=0;
    this.running=false;
    this.rows=[];
    this.base=null;
    this.worker.onmessage=({
      data
    })=>{
      if(data.runId!==this.runId)return;
      if(data.type==='error'){
        this.running=false;
        this.buttons();
        this.renderResults();
        showError(data.message);
        $('analysis-progress').textContent='分析エラー';
        return;
      }
      this.rows=data.rows;
      this.elapsedMs=data.elapsedMs;
      this.completed=data.completed;
      this.planned=data.planned;
      if(data.type==='complete')this.running=false;
      $('analysis-progress').textContent=(this.running?'実行中':'完了')+' · '+data.completed+' / '+data.planned+'試行 · '+(data.elapsedMs/1000).toFixed(1)+'秒';
      $('analysis-bar').max=data.planned;
      $('analysis-bar').value=data.completed;
      this.renderResults();
      this.buttons();
    };
    this.worker.onerror=event=>{
      event.preventDefault();
      this.stop();
      showError('分析Workerの起動・実行に失敗しました。'+(event.message??''));
    };
    $('analysis-open').onclick=()=>{
      $('analysis-dialog').showModal();
    };
    $('analysis-close').onclick=()=>$('analysis-dialog').close();
    for(const id of ['mission-enabled','mission-type','mission-responders','mission-observer','mission-target','mission-join','mission-deadline','analysis-trials','analysis-step','analysis-required'])$(id).addEventListener('change',()=>{
      if(id==='mission-observer'&&$('mission-observer').value===$('mission-target').value)$('mission-target').value=['friendly','hostile','neutral'].find(v=>v!==$('mission-observer').value);
      if(id==='mission-target'&&$('mission-observer').value===$('mission-target').value)$('mission-observer').value=['friendly','hostile','neutral'].find(v=>v!==$('mission-target').value);
      try{
        const next=this.readConfig(id);this.commit(next,'成功条件・分析設定を変更しました。');
      }catch(error){
        showError(error.message);this.renderConfig();
      }
    });
    $('analysis-run').onclick=()=>this.start();
    $('analysis-cancel').onclick=()=>{
      this.stop();
      $('analysis-progress').textContent='中止 · 完了済みの試行だけを表示しています。';
      this.renderResults();
    };
    $('analysis-restore').onclick=()=>{
      if(this.base){
        this.replay(clone(this.base),'分析元のシナリオに戻しました。');
        this.highlightCount=null;
        $('replay-parameters').textContent='';
        this.renderResults();
      }
    };
    $('chart-axis').onchange=()=>this.renderChart();
    $('chart-log').onchange=()=>this.renderChart();
    $('analysis-export').onclick=()=>this.export();
    $('events-open').onclick=()=>{
      this.renderEvents();
      $('events-dialog').showModal();
    };
    $('events-close').onclick=()=>$('events-dialog').close();
  }
  stop(){
    this.worker.postMessage({
      type:'cancel'
    });
    this.runId++;
    this.running=false;
    this.buttons();
  }
  onScenario({
    keepResults=false
  }
  ={
  }) {
    if(!keepResults){
      this.stop();
      this.rows=[];
      this.base=null;
      this.highlightCount=null;
      this.completed=0;
      this.planned=0;
      $('replay-parameters').textContent='';
      $('analysis-progress').textContent='分析は未実行です。';
      $('analysis-bar').value=0;
      this.renderResults();
    }
    this.renderConfig();
    this.buttons();
  }
  loadResult(result) {
    this.stop();
    this.base=clone(result.source);
    this.rows=result.rows;
    this.completed=result.completed;
    this.planned=result.planned;
    this.elapsedMs=result.elapsedMs;
    this.highlightCount=null;
    $('analysis-progress').textContent='保存済み結果（再計算なし） · '+this.completed+' / '+this.planned+'試行';
    $('analysis-bar').max=this.planned;
    $('analysis-bar').value=this.completed;
    this.renderConfig();
    this.renderResults();
    this.buttons();
    $('analysis-dialog').showModal();
  }
  renderConfig() {
    const s=this.getScenario(),m=s.mission??{
      observerFaction:'friendly',targetFaction:'hostile',join:'any',deadline:s.duration
    },a=normalizedAnalysis(s.analysis??{
      factors:[],trials:100,step:10,requiredRate:.95
    });
    $('mission-enabled').checked=!!s.mission;
    $('mission-type').value=m.type??'detect';
    $('responder-field').hidden=m.type!=='arrive';
    const responders=$('mission-responders');
    responders.replaceChildren();
    const chosen=m.responderIds??[s.units.find(u=>u.behavior?.hold&&u.faction===m.observerFaction)?.id??s.units.find(u=>u.faction===m.observerFaction)?.id];
    for(const u of s.units){
      const option=new Option(u.name,u.id);
      option.selected=chosen.includes(u.id);
      responders.append(option);
    }
    $('mission-join').options[0].textContent=m.type==='arrive'?'対応ユニットのうち一つが到着':'対象のうち一つを探知';
    $('mission-join').options[1].textContent=m.type==='arrive'?'対応ユニットすべてが到着':'対象すべてを探知';
    $('mission-observer').value=m.observerFaction;
    $('mission-target').value=m.targetFaction;
    $('mission-join').value=m.join;
    $('mission-deadline').value=+(m.deadline/60).toFixed(3);
    $('mission-deadline').dataset.display=$('mission-deadline').value;
    $('mission-deadline').dataset.seconds=m.deadline;
    $('mission-deadline').title=m.deadline+'秒';
    $('mission-deadline').max=s.duration/60;
    $('mission-target-note').textContent=m.targetIds?'対象ID指定: '+m.targetIds.join(', ')+'（対象陣営の変更で解除）':'対象側の陣営に属する全ユニットを評価します。';
    $('analysis-trials').value=a.trials;
    $('analysis-step').value=s.recording.step;
    $('analysis-step').disabled=false;
    $('analysis-step').title='通常計算・記録・分析で同じ刻みを使います。';
    $('analysis-required').value=a.requiredRate*100;
    this.parameters.render({
      ...s,analysis:a
    });
    const conditions=analysisConditions({
      ...s,analysis:a
    });
    $('parameter-plan').textContent=conditions.length+'条件 × '+a.trials+'試行 = '+conditions.length*a.trials+'試行';
  }
  readConfig(changedId='') {
    const next=clone(this.getScenario());
    if($('mission-enabled').checked){
      next.mission={
        ...next.mission,type:$('mission-type').value,observerFaction:$('mission-observer').value,targetFaction:$('mission-target').value,join:$('mission-join').value,deadline:$('mission-deadline').value===$('mission-deadline').dataset.display?Number($('mission-deadline').dataset.seconds):Math.round(Number($('mission-deadline').value)*60*1e6)/1e6
      };
      if(next.mission.type==='arrive')next.mission.responderIds=[...$('mission-responders').selectedOptions].map(o=>o.value);
      else delete next.mission.responderIds;
      if(changedId==='mission-target')delete next.mission.targetIds;
    }
    else delete next.mission;
    if(changedId==='analysis-step')next.recording={
      step:Number($('analysis-step').value),interval:Number($('analysis-step').value)
    };
    next.analysis={
      ...next.analysis,...this.parameters.read(),trials:Number($('analysis-trials').value),step:Number($('analysis-step').value),requiredRate:Number($('analysis-required').value)/100
    };
    delete next.analysis.groupId;
    delete next.analysis.counts;
    return validateScenario(next);
  }
  start() {
    try {
      const next=this.readConfig();
      if(JSON.stringify(next)!==JSON.stringify(this.getScenario())&&!this.commit(next,'分析設定を変更しました。'))return;
      this.stop();
      this.base=clone(this.getScenario());
      this.rows=[];
      this.running=true;
      this.highlightCount=null;
      this.completed=0;
      this.planned=analysisConditions(this.base).length*this.base.analysis.trials;
      this.buttons();
      this.renderResults();
      $('analysis-progress').textContent='準備中…';
      $('analysis-bar').max=this.planned;
      $('analysis-bar').value=0;
      this.worker.postMessage({
        type:'run',runId:++this.runId,scenario:this.base
      });
    }catch(error){
      this.showError(error.message);
    }
  }
  buttons() {
    $('analysis-run').disabled=this.running;
    $('analysis-cancel').disabled=!this.running;
    $('analysis-export').disabled=!this.rows.length;
    $('analysis-restore').disabled=!this.base||this.running;
  }
  renderResults() {
    $('analysis-rows').replaceChildren();
    for(const row of this.rows) {
      const tr=document.createElement('tr');
      if((row.condition?.id??row.count)===this.highlightCount)tr.className='selected-result';
      for(const value of [row.condition?.label??row.count,row.successes+' / '+row.total,row.trials.filter(t=>t.detectedCount>0).length+' / '+row.total,percent(row.rate),percent(row.rate===null?null:1-row.rate),percent(row.low)+'–'+percent(row.high),minutes(row.median),row.invalidTrials]){
        const td=document.createElement('td');
        td.textContent=value;
        tr.append(td);
      }
      const td=document.createElement('td'),input=document.createElement('input'),button=document.createElement('button');
      input.type='number';
      input.step='1';
      input.min=row.trials[0]?.trial??0;
      input.max=row.trials.at(-1)?.trial??0;
      input.value=(row.trials.find(t=>!t.success)??row.trials[0])?.trial??0;
      input.setAttribute('aria-label','条件 '+(row.condition?.index??row.count)+' の試行番号');
      input.disabled=this.running;
      button.textContent='再現';
      button.disabled=this.running;
      button.onclick=()=>{
        const trial=row.trials.find(t=>t.trial===Number(input.value));
        if(!trial){
          this.showError('完了済みの試行番号を指定してください。');
          return;
        }
        const condition=row.condition??analysisConditions(this.base).find(c=>c.count===row.count),{
          scenario:next,sampled
        }
        =trialScenario(this.base,condition,trial.trial);
        this.replay(next,'条件 '+condition.index+'・試行 '+trial.trial+' を再現しました。');
        this.seek(trial.successTime??next.mission.deadline);
        $('replay-parameters').textContent='再現中: '+condition.label+' · 試行 '+trial.trial+(sampled.length?' · 抽出値: '+sampled.map(b=>formatBinding(this.base,b,b.value)).join(' / '):'');
        this.highlightCount=condition.id;
        this.renderResults();
        $('analysis-dialog').close();
      };
      td.append(input,button);
      tr.append(td);
      $('analysis-rows').append(tr);
    }
    this.renderChart();
    const requirement=this.base?.analysis.requiredRate??.95;
    $('analysis-summary').textContent=this.rows.length?'要求 '+percent(requirement)+' · 点推定で達成した条件: '+this.rows.filter(r=>r.rate>=requirement).length+' / '+this.rows.length+' · 区間下限でも達成: '+this.rows.filter(r=>r.low>=requirement).length+'。中央値は成功試行だけを集計。'+(this.running?'途中結果です。':''):'成功率と95%信頼区間を表示します。';
  }
  renderChart() {
    const host=$('analysis-chart'),legend=$('analysis-chart-legend'),axis=$('chart-axis');
    host.replaceChildren();
    legend.replaceChildren();
    $('chart-note').textContent='';
    const previous=axis.value,bindings=this.base?analysisConditions(this.base)[0].settings:[];
    axis.replaceChildren();
    for(const b of bindings){
      const p=parameter(b.parameter);
      axis.append(new Option(formatBinding(this.base,b,b.value).split(' = ')[0]+' ('+p.unit+')',bindingKey(b)));
    }
    if(!bindings.length)axis.append(new Option('基準条件','baseline'));
    if([...axis.options].some(o=>o.value===previous))axis.value=previous;
    const key=axis.value,binding=bindings.find(b=>bindingKey(b)===key),p=binding?parameter(binding.parameter):null,log=$('chart-log').checked;
    axis.disabled=!bindings.length;
    $('chart-log').disabled=!bindings.length;
    if(!this.rows.length)return;
    const value=row=>binding?row.condition.settings.find(b=>bindingKey(b)===key).value/p.scale:1;
    const omitted=this.rows.filter(r=>log&&value(r)<=0).length,rows=this.rows.filter(r=>r.rate!==null&&(!log||value(r)>0)),scale=numericScale(rows.map(value),log);
    $('chart-note').textContent=omitted?'対数軸では0以下の '+omitted+' 条件を図から除外しています。表・集計には含まれます。':'';
    if(!scale){
      $('chart-note').textContent+=' 表示できる正の横軸値がありません。';
      return;
    }
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
    svg.setAttribute('viewBox','0 0 640 300');
    svg.setAttribute('role','img');
    svg.setAttribute('aria-label',axis.selectedOptions[0].textContent+'・'+(log?'対数':'線形')+'軸と成功率、95%信頼区間');
    const add=(tag,attrs,text,parent=svg)=>{
      const el=document.createElementNS(ns,tag);
      for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);
      if(text!==undefined)el.textContent=text;
      parent.append(el);
      return el;
    };
    const left=60,right=615,top=20,bottom=230,y=p=>bottom-(bottom-top)*p,x=v=>left+scale.position(v)*(right-left),number=v=>v!==0&&(Math.abs(v)>=1e6||Math.abs(v)<.001)?v.toExponential(1):Number(v.toPrecision(5)).toLocaleString('ja-JP',{
      maximumFractionDigits:6
    });
    for(const rate of [0,.25,.5,.75,1]){
      add('line',{
        x1:left,x2:right,y1:y(rate),y2:y(rate),stroke:'#344e64'
      });
      add('text',{
        x:left-7,y:y(rate)+4,fill:'#a7bfd1','text-anchor':'end','font-size':11
      },Math.round(rate*100)+'%');
    }
    for(const v of scale.ticks){
      add('line',{
        x1:x(v),x2:x(v),y1:top,y2:bottom,stroke:'#263e53'
      });
      add('text',{
        x:x(v),y:bottom+20,fill:'#c5d9e8','text-anchor':'middle','font-size':11
      },number(v));
    }
    add('line',{
      x1:left,x2:right,y1:y(this.base.analysis.requiredRate),y2:y(this.base.analysis.requiredRate),stroke:'#ffc580','stroke-dasharray':'5 4'
    });
    const colors=['#74d8ff','#ffa977','#9be598','#d4adff','#ff91c1','#eddb84','#6ae2d0','#b7c8ef'],series=new Map();
    for(const row of rows){
      const other=row.condition.settings.filter(b=>bindingKey(b)!==key),seriesKey=JSON.stringify(other.map(b=>[bindingKey(b),b.value]));
      if(!series.has(seriesKey))series.set(seriesKey,{
        color:colors[series.size%colors.length],label:other.map(b=>formatBinding(this.base,b,b.value)).join(' / ')||'成功率（縦線は95%区間）'
      });
      const color=series.get(seriesKey).color,group=add('g',{
        'data-condition':row.condition.id,'data-x-value':value(row)
      }),cx=x(value(row));
      add('title',{
      },row.condition.label+' · '+percent(row.rate)+' · 95%区間 '+percent(row.low)+'–'+percent(row.high),group);
      add('line',{
        x1:cx,x2:cx,y1:y(row.low),y2:y(row.high),stroke:color,'stroke-width':2,opacity:.65
      },undefined,group);
      for(const rate of [row.low,row.high])add('line',{
        x1:cx-5,x2:cx+5,y1:y(rate),y2:y(rate),stroke:color
      },undefined,group);
      add('circle',{
        cx,cy:y(row.rate),r:row.condition.id===this.highlightCount?7:4.5,fill:color,stroke:row.condition.id===this.highlightCount?'#fff':'#102537','stroke-width':1.5
      },undefined,group);
    }
    add('text',{
      x:(left+right)/2,y:285,fill:'#a7bfd1','text-anchor':'middle','font-size':11
    },(p?p.label+' ('+p.unit+')':'基準条件')+' · '+(log?'対数':'線形'));
    host.append(svg);
    for(const item of series.values()){
      const el=document.createElement('span'),dot=document.createElement('i');
      dot.style.background=item.color;
      el.append(dot,document.createTextNode(item.label));
      legend.append(el);
    }
  }
  onSnapshot() {
    const mission=this.getSnapshot()?.mission,el=$('mission-status');
    if(!mission){
      el.className='';
      el.textContent=this.getSnapshot()?.missionError?'評価できません: '+this.getSnapshot().missionError:this.getSnapshot()?.executionState==='running'?'計算中…':this.getSnapshot()?.actionsPending?'未計算 · 計算を実行してください':this.getScenario()?.mission?'未計算':'成功条件は未設定';
    }
    else {
      el.className=mission.status;
      el.textContent=({
        pending:'評価中',success:'成功条件成立',failure:'期限までに未成立'
      })[mission.status]+' · 探知 '+mission.detectedCount+' / '+mission.targetCount+(this.getScenario()?.mission?.type==='arrive'?' · 到着 '+mission.reachedCount+' / '+mission.responderCount:'')+' · 期限 '+minutes(mission.deadline);
    }
    if($('events-dialog').open)this.renderEvents();
  }
  renderEvents() {
    const snapshot=this.getSnapshot(),m=snapshot?.mission,list=$('event-list');
    list.replaceChildren();
    const events=snapshot?.actionEvents?.length?snapshot.actionEvents:(m?.events??[]).map(e=>({
      ...e,type:'detected',unitId:e.observerId
    }));
    $('events-summary').textContent=snapshot?.executionState==='running'?'計算中…':snapshot?.actionsPending?'未計算です':'現在時刻までの '+events.length+'件（末尾200件を表示）。探知は判定区間の末尾、通信・出発・到着はイベント時刻で記録します。';
    const name=id=>{
      const s=this.getScenario(),u=s.units.find(u=>u.id===id);
      if(u)return u.name;
      const g=s.groups?.find(g=>id?.startsWith(g.id+'__'));
      return g?g.name+' '+id.slice(g.id.length+2):id??'';
    };
    for(const event of events.slice(-200)) {
      const row=document.createElement('div');
      row.className='event-item'+(event.type==='sendFailed'?' failed':'');
      const text=document.createElement('span'),button=document.createElement('button');
      const details={
        detected:name(event.unitId)+' が '+name(event.targetId)+' を探知 · '+Math.round(event.distance)+'m',sent:name(event.unitId)+' → '+name(event.receiverId)+' 送信',received:name(event.unitId)+' が '+name(event.senderId)+' から受信',sendFailed:name(event.unitId)+' → '+name(event.receiverId)+' 送信失敗 · '+event.reason,preparing:name(event.unitId)+' 出発準備',departed:name(event.unitId)+' 出発',arrived:name(event.unitId)+' 経路終点に到着'
      };
      text.textContent=minutes(event.time)+' · '+(details[event.type]??(event.type==='nodeChanged'?'挙動切替 '+name(event.unitId)+' → '+event.nodeId:event.type==='elapsed'?'待機終了 '+name(event.unitId):event.type));
      button.textContent='この時刻';
      button.onclick=()=>{
        this.seek(event.time,event.type==='detected'?event.targetId:event.unitId);
        $('events-dialog').close();
      };
      row.append(text,button);
      list.append(row);
    }
  }
  export() {
    const payload={
      type:'SimSim-analysis',version:5,model:'unified-behavior-v2',confidence:'Wilson two-sided 95%',completed:this.completed,planned:this.planned,partial:this.completed<this.planned,elapsedMs:this.elapsedMs,source:this.base,rows:this.rows
    };
    const blob=new Blob([JSON.stringify(payload,null,2)+'\n'],{
      type:'text/plain;charset=utf-8'
    }),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;
    a.download='SimSim-analysis.jsn';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
    this.notify('分析条件と試行結果を.jsnで保存しました。');
  }
}
