import {requireElement as $} from './ui-dom.js?v=20261007-plan-switch-25';
import {NODE_KINDS} from './shared-settings.js?v=20261007-plan-switch-25';
const ns='http://www.w3.org/2000/svg';
const eventNames={decision:'判断',deliveryFailed:'未着（解析）',commandRejected:'命令拒否',operationalChanged:'稼働変更',detected:'探知',sent:'送信',received:'受信',sendFailed:'送信失敗',arrived:'到着',triggered:'割込み',departed:'出発',near:'接近'};
const eventColors={decision:'#e5a9ff',deliveryFailed:'#ff8d93',commandRejected:'#ff8d93',operationalChanged:'#ff8d93',detected:'#f6cc77',sent:'#82c9ff',received:'#96e2b0',sendFailed:'#ff8d93',arrived:'#c7aeff',triggered:'#ffae71',departed:'#b2d8f4',near:'#78dcdf'};
const stateColors={follow:'#377994',patrol:'#3f8e80',signal:'#62658f',wait:'#7c7151',report:'#685c8d',move:'#467eaa',stop:'#835c5c'};
export class HistoryUI{
  constructor({getScenario,getSnapshot,seek}){
    Object.assign(this,{getScenario,getSnapshot,seek});
    $('history-unit').onchange=()=>this.render();
  }
  reset(){this.history=null;this.cursor=null;$('history-chart').replaceChildren();$('history-unit').replaceChildren();$('history-note').textContent='計算後に全期間の履歴を表示します。';}
  load(history){
    this.history=history;
    $('history-unit').replaceChildren(new Option('すべて（先頭30個）',''),...history.unitIds.map(id=>new Option(this.name(id),id)));
    this.render();
  }
  name(id){const s=this.getScenario(),u=s.units.find(u=>u.id===id);if(u)return u.name;const g=s.groups?.find(g=>id.startsWith(g.id+'__'));return g?g.name+' '+id.slice(g.id.length+2):id;}
  onSnapshot(){
    if(!$('events-dialog').open||!this.history)return;
    if(!this.cursor){this.render();return;}
    const x=this.x(this.getSnapshot().time);this.cursor.setAttribute('x1',x);this.cursor.setAttribute('x2',x);
  }
  render(){
    const host=$('history-chart');host.replaceChildren();this.cursor=null;if(!this.history)return;
    const s=this.getScenario(),h=this.history,selected=$('history-unit').value,ids=selected?[selected]:h.unitIds.slice(0,30),events=h.events,byUnit=new Map(ids.map(id=>[id,[]]));
    for(const e of events)byUnit.get(e.unitId)?.push(e);
    const height=60+ids.length*44,width=1100,left=190,right=1080,x=t=>left+(right-left)*Math.max(0,Math.min(h.duration,t))/h.duration;this.x=x;
    const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('role','img');svg.setAttribute('aria-label','ユニット別の状態・探知・通信タイムライン');
    const add=(tag,attrs,text,parent=svg)=>{const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;parent.append(e);return e;};
    for(let i=0;i<=4;i++){const t=h.duration*i/4,cx=x(t);add('line',{x1:cx,x2:cx,y1:26,y2:height-10,stroke:'#355068'});add('text',{x:cx,y:17,'text-anchor':'middle',fill:'#b8cfe1','font-size':12},(t/60).toFixed(1)+'分');}
    ids.forEach((id,i)=>{
      const top=32+i*44,list=byUnit.get(id),a=s.behaviorAssignments.find(a=>a.targets.includes('unit:'+id)||a.targets.some(t=>t.startsWith('group:')&&id.startsWith(t.slice(6)+'__'))),g=s.behaviors.find(g=>g.id===a?.behaviorId);
      const label=add('text',{x:8,y:top+18,fill:'#d6e7f5','font-size':13},this.name(id).slice(0,22));add('title',{},this.name(id),label);
      add('rect',{x:left,y:top,width:right-left,height:36,fill:i%2?'#152c3d':'#102333'});
      const states=list.filter(e=>['initialized','nodeChanged'].includes(e.type));
      states.forEach((e,j)=>{
        const until=states[j+1]?.time??h.duration,w=x(until)-x(e.time),node=g?.nodes.find(n=>n.id===e.nodeId);if(w<.5)return;
        const r=add('rect',{x:x(e.time),y:top,width:Math.max(.5,w),height:19,fill:stateColors[node?.kind]??'#435971','data-node':e.nodeId});
        add('title',{},(NODE_KINDS[node?.kind]??'状態')+' ['+e.nodeId+'] · '+e.time.toFixed(2)+'–'+until.toFixed(2)+'秒',r);
        if(w>75)add('text',{x:x(e.time)+4,y:top+14,fill:'#fff','font-size':11,'pointer-events':'none'},(NODE_KINDS[node?.kind]??e.nodeId).slice(0,Math.floor(w/12)));
      });
      // Events at the same pixel/type share a marker; the complete list remains below.
      const bins=new Map();for(const e of list)if(eventNames[e.type]){const key=e.type+':'+Math.round(x(e.time));if(!bins.has(key))bins.set(key,{e,count:0});bins.get(key).count++;}
      for(const {e,count} of bins.values()){
        const dot=add('circle',{cx:x(e.time),cy:top+28,r:4,fill:eventColors[e.type],'data-event':e.type,'data-time':e.time,tabindex:0,role:'button','aria-label':this.name(id)+' '+eventNames[e.type]+' '+e.time.toFixed(2)+'秒へ移動'});
        add('title',{},eventNames[e.type]+' · '+e.time.toFixed(2)+'秒'+(count>1?' · '+count+'件（同じ表示位置）':'')+(e.reason?' · '+e.reason:''),dot);
        dot.onclick=ev=>{ev.stopPropagation();this.seek(e.time,id);};dot.onkeydown=ev=>{if(['Enter',' '].includes(ev.key)){ev.preventDefault();this.seek(e.time,id);}};
      }
    });
    this.cursor=add('line',{x1:x(this.getSnapshot()?.time??0),x2:x(this.getSnapshot()?.time??0),y1:24,y2:height-10,stroke:'#fff','stroke-width':2,'pointer-events':'none','data-cursor':'true'});
    svg.onclick=ev=>{const rect=svg.getBoundingClientRect(),px=(ev.clientX-rect.left)/rect.width*width,py=(ev.clientY-rect.top)/rect.height*height;if(px<left||px>right)return;const id=ids[Math.floor((py-32)/44)];this.seek((px-left)/(right-left)*h.duration,id);};
    host.append(svg);
    $('history-note').textContent=ids.length+' / '+h.unitIds.length+'個 · 全期間 '+events.length+'件。上段は状態、下段は探知・通信など。クリックで記録の時刻へ移動。'+(!selected&&h.unitIds.length>30?'個別のユニットを選ぶと残りも確認できます。':'');
  }
}
