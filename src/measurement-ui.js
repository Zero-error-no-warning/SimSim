import {clone,validateScenario} from './engine.js?v=20261006-four-panes-16';
import {NODE_KINDS} from './shared-settings.js?v=20261006-four-panes-16';
import {summarizeMeasurements} from './measurement-points.js?v=20261006-four-panes-16';
import {requireElement as $} from './ui-dom.js?v=20261006-four-panes-16';
const pct=n=>n===null?'—':(n*100).toFixed(1)+'%';
const time=n=>n===null?'—':n.toFixed(1)+'秒';
export class MeasurementUI{
  constructor(owner){
    this.owner=owner;
    $('measurement-add').onclick=()=>this.add();
    $('measurement-select').onchange=()=>this.renderConfig();
    $('measurement-remove').onclick=()=>this.change(s=>{
      const id=$('measurement-select').value;s.measurements=s.measurements.filter(m=>m.id!==id);
      for(const m of s.measurements)if(m.previousId===id)delete m.previousId;
    });
    for(const field of ['name','assignment','state','join','count','deadline','previous'])$('measurement-'+field).onchange=()=>this.change(s=>{
      const m=s.measurements.find(m=>m.id===$('measurement-select').value);
      if(field==='name')m.name=$('measurement-name').value;
      if(field==='assignment'){m.assignmentId=$('measurement-assignment').value;const a=s.behaviorAssignments.find(a=>a.id===m.assignmentId),g=s.behaviors.find(g=>g.id===a.behaviorId);m.nodeId=g.initial??g.nodes[0]?.id;}
      if(field==='state')m.nodeId=$('measurement-state').value;
      if(field==='join'){m.join=$('measurement-join').value;if(m.join==='count')m.requiredCount=1;else delete m.requiredCount;}
      if(field==='count')m.requiredCount=Number($('measurement-count').value);
      if(field==='deadline')m.deadline=Number($('measurement-deadline').value);
      if(field==='previous'){if($('measurement-previous').value)m.previousId=$('measurement-previous').value;else delete m.previousId;}
    });
    $('measurement-condition').onchange=()=>this.renderResults();
  }
  change(fn){
    try{const s=clone(this.owner.getScenario());fn(s);this.owner.commit(validateScenario(s),'計測点を変更しました。');}
    catch(e){this.owner.showError(e.message);this.renderConfig();}
  }
  add(){
    const s=this.owner.getScenario(),points=s.measurements??[],a=s.behaviorAssignments.find(a=>a.id===s.mission?.assignmentId)??s.behaviorAssignments.find(a=>s.behaviors.find(g=>g.id===a.behaviorId)?.nodes.length);
    if(!a||points.length>=12){this.owner.showError(a?'計測点は最大12件です。':'状態を持つタスクを作成してください。');return;}
    const g=s.behaviors.find(g=>g.id===a.behaviorId);let i=1;while(points.some(m=>m.id==='point-'+i))i++;
    const id='point-'+i;this.selected=id;
    this.change(next=>{next.measurements??=[];next.measurements.push({id,name:'計測点 '+i,type:'state',assignmentId:a.id,nodeId:s.mission?.type==='state'&&s.mission.assignmentId===a.id?s.mission.nodeId:g.initial??g.nodes[0].id,join:'any',deadline:s.duration});});
    this.renderConfig();
  }
  renderConfig(){
    const s=this.owner.getScenario(),points=s.measurements??[],sel=$('measurement-select'),old=this.selected??sel.value;this.selected=null;
    sel.replaceChildren(...points.map(m=>new Option(m.name,m.id)));if(points.some(m=>m.id===old))sel.value=old;
    const m=points.find(m=>m.id===sel.value);$('measurement-fields').hidden=!m;$('measurement-remove').disabled=!m;$('measurement-add').disabled=points.length>=12;
    if(!m)return;
    $('measurement-name').value=m.name;
    $('measurement-assignment').replaceChildren(...s.behaviorAssignments.map(a=>new Option(a.name,a.id)));$('measurement-assignment').value=m.assignmentId;
    const a=s.behaviorAssignments.find(a=>a.id===m.assignmentId),g=s.behaviors.find(g=>g.id===a?.behaviorId);
    $('measurement-state').replaceChildren(...(g?.nodes??[]).map(n=>new Option((NODE_KINDS[n.kind]??'未設定')+' ['+n.id+']',n.id)));$('measurement-state').value=m.nodeId;
    $('measurement-join').value=m.join;$('measurement-count').value=m.requiredCount??1;$('measurement-count-field').hidden=m.join!=='count';
    $('measurement-deadline').value=m.deadline;$('measurement-deadline').max=s.duration;
    $('measurement-previous').replaceChildren(new Option('シーン開始（時刻0）',''),...points.slice(0,points.indexOf(m)).map(p=>new Option(p.name,p.id)));$('measurement-previous').value=m.previousId??'';
  }
  renderResults(){
    const o=this.owner,s=o.base??o.getScenario(),sel=$('measurement-condition'),old=sel.value;
    $('measurement-results').hidden=!s.measurements?.length||!o.rows.length;
    sel.replaceChildren(...o.rows.map(r=>new Option(r.condition.label,r.condition.id)));if(o.rows.some(r=>r.condition.id===old))sel.value=old;
    const row=o.rows.find(r=>r.condition.id===sel.value),body=$('measurement-rows');body.replaceChildren();if(!row)return;
    for(const r of summarizeMeasurements(s,row.trials)){
      const m=s.measurements.find(m=>m.id===r.id),tr=document.createElement('tr');tr.dataset.measurement=m.id;
      for(const value of [m.name,r.successes+' / '+r.total,pct(r.rate),time(r.medianTime),(s.measurements.find(p=>p.id===m.previousId)?.name??'シーン開始'),r.ordered+' / '+r.eligible+'（'+pct(r.conditionalRate)+'）',time(r.medianDuration)]){const td=document.createElement('td');td.textContent=value;tr.append(td);}
      const td=document.createElement('td'),failed=row.trials.filter(t=>!t.measurements?.find(r=>r.id===m.id)?.success),pick=document.createElement('select'),button=document.createElement('button');
      pick.setAttribute('aria-label',m.name+'の未達試行');pick.replaceChildren(...failed.map(t=>new Option('試行 '+t.trial,String(t.trial))));pick.disabled=!failed.length||o.running;
      button.textContent=failed.length?'未達を再生':'未達なし';button.disabled=!failed.length||o.running;button.onclick=()=>o.replayTrial(row,row.trials.find(t=>t.trial===Number(pick.value)),m.deadline,m.name);
      td.append(pick,button);if(r.outOfOrder){const note=document.createElement('small');note.textContent='順序逆転 '+r.outOfOrder+'試行（所要時間から除外）';td.append(note);}tr.append(td);body.append(tr);
    }
  }
}
