import { removeAssignment,removeBehavior } from './editor.js';
import { clone,validateScenario } from './engine.js';
import { NODE_KINDS,NODE_EVENTS,EDGE_EVENTS,patrolGraph,sharedAssignment } from './shared-settings.js';
const $=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg';
export class BehaviorUI{
  constructor({
    getScenario,getSelected,commit,pickRoute,pickBase,showError
  }){
    Object.assign(this,{
      getScenario,getSelected,commit,pickRoute,pickBase,showError
    });
    this.dialog=$('behavior-dialog');
    this.svg=$('behavior-canvas');
    this.past=[];
    this.future=[];
    $('behaviors-open').onclick=()=>this.open(null,true);
    $('task-edit-tab').onclick=()=>this.tab('task');
    $('graph-edit-tab').onclick=()=>this.tab('graph');
    $('behavior-close').onclick=()=>this.dialog.close();
    $('behavior-cancel').onclick=()=>this.dialog.close();
    $('behavior-apply').onclick=()=>this.apply();
    $('behavior-zoom-in').onclick=()=>this.zoom(.75);
    $('behavior-zoom-out').onclick=()=>this.zoom(1/.75);
    $('behavior-fit').onclick=()=>{
      this.canvasView=null;
      this.fitAll=true;
      this.renderGraph();
    };
    $('behavior-list').onchange=()=>{
      this.canvasView=null;
      this.fitAll=false;
      this.graphId=$('behavior-list').value;
      this.selected=null;
      this.render();
    };
    $('assignment-list').onchange=()=>{
      this.assignmentId=$('assignment-list').value;
      this.graphId=this.assignment()?.behaviorId??this.graphId;
      this.render();
    };
    $('behavior-new').onclick=()=>{
      this.remember();
      const g=patrolGraph('behavior-'+Date.now().toString(36));
      g.name='新しい挙動';
      this.draft.behaviors.push(g);
      this.graphId=g.id;
      this.selected=null;
      this.render();
    };
    $('behavior-duplicate').onclick=()=>{
      if(!this.graph())return;
      this.remember();
      const g=clone(this.graph());
      g.id='behavior-'+Date.now().toString(36);
      g.name+=' コピー';
      this.draft.behaviors.push(g);
      this.graphId=g.id;
      this.render();
    };
    $('behavior-delete').onclick=()=>{
      this.remember();
      removeBehavior(this.draft,this.graphId);
      this.graphId=this.draft.behaviors[0]?.id;
      this.assignmentId=this.draft.behaviorAssignments[0]?.id;
      this.selected=null;
      this.render();
    };
    $('node-add').onclick=()=>{
      if(!this.graph())return;
      this.remember();
      const kind=$('node-kind').value,id='node-'+Date.now().toString(36),n={
        id,kind,x:100+(this.graph().nodes.length%3)*260,y:400+Math.floor(this.graph().nodes.length/3)*100
      };
      if(kind==='wait')n.seconds=300;
      if(kind==='patrol')n.speedFraction=.7;
      if(kind==='report')n.receiverRole='report';
      this.graph().nodes.push(n);
      this.selected=id;
      this.render();
    };
    $('node-delete').onclick=()=>{
      const g=this.graph();
      if(!this.selected||g.nodes.length===1)return;
      this.remember();
      g.nodes=g.nodes.filter(n=>n.id!==this.selected);
      g.edges=g.edges.filter(e=>e.from!==this.selected&&e.to!==this.selected);
      if(g.entry===this.selected)g.entry=g.nodes[0].id;
      this.selected=null;
      this.render();
    };
    $('node-entry').onclick=()=>{
      if(this.selected){
        this.remember();
        this.graph().entry=this.selected;
        this.render();
      }
    };
    for(const id of ['behavior-name','node-value','node-receiver','assignment-name','assignment-behavior','assignment-targets','assignment-spacing','assignment-distance','assignment-gain','assignment-receiver','assignment-phase','assignment-preparation','node-sensor'])$(id).onchange=()=>this.readFields(id);
    $('assignment-new').onclick=()=>{
      const targets=[...this.draft.units.map(u=>['unit:'+u.id,u]),...(this.draft.groups??[]).map(g=>['group:'+g.id,g.template])].filter(([id])=>!this.draft.behaviorAssignments.some(a=>a.targets.includes(id)));
      const selected=this.getSelected(),preferred=selected?.groupId?'group:'+selected.groupId:'unit:'+selected?.id;
      const [target,source]=targets.find(([id])=>id===preferred)??targets[0]??[];
      if(!source){
        this.showError('割り当て可能な担当がありません。ユニット・群を追加するか既存タスクの担当を変更してください。');
        return;
      }
      this.remember();
      if(!this.graph()){
        const g=patrolGraph('behavior-'+Date.now().toString(36));
        this.draft.behaviors.push(g);
        this.graphId=g.id;
      }
      const g=this.graph(),needsRoute=g.nodes.some(n=>n.kind==='patrol'),t=this.draft.terrain,r=Math.min(1000,(t.columns-1)*t.spacing/4,(t.rows-1)*t.spacing/4),cx=t.origin.x+(t.columns-1)*t.spacing/2,cy=t.origin.y+(t.rows-1)*t.spacing/2;
      const route=source.route.length>=2?[source.initial,...source.route]:[{
        x:cx-r,y:cy-r,z:source.initial.z
      },{
        x:cx+r,y:cy-r,z:source.initial.z
      },{
        x:cx+r,y:cy+r,z:source.initial.z
      },{
        x:cx-r,y:cy+r,z:source.initial.z
      }];
      const a={
        id:'assignment-'+Date.now().toString(36),name:source.name+'のタスク',behaviorId:g.id,targets:[target],...(needsRoute?{
          route:clone(route),spacing:'even'
        }
        :{
          spacing:'none'
        }),base:clone(source.initial),receiverId:this.draft.units[0]?.id,spacingDistance:500,gain:.01
      };
      this.draft.behaviorAssignments.push(a);
      this.assignmentId=a.id;
      this.render();
    };
    $('assignment-delete').onclick=()=>{
      this.remember();
      removeAssignment(this.draft,this.assignmentId);
      this.assignmentId=this.draft.behaviorAssignments[0]?.id;
      this.render();
    };
    $('assignment-route').onclick=()=>{
      if(this.assignment()){
        this.dialog.close();
        this.pickRoute();
      }
    };
    $('assignment-base').onclick=()=>{
      if(this.assignment()){
        this.dialog.close();
        this.pickBase();
      }
    };
    $('assignment-copy-route').onclick=()=>{
      const u=this.getSelected(),source=u?.groupId?this.draft.groups.find(g=>g.id===u.groupId)?.template:u;
      if(!source||source.route.length<2){
        this.showError('3点以上の経路を持つ単体または群を選択してください。');
        return;
      }
      this.remember();
      this.assignment().route=clone([source.initial,...source.route]);
      this.render();
    };
    $('behavior-undo').onclick=()=>{
      if(this.past.length){
        this.future.push(clone(this.draft));
        this.draft=this.past.pop();
        this.render();
      }
    };
    $('behavior-redo').onclick=()=>{
      if(this.future.length){
        this.past.push(clone(this.draft));
        this.draft=this.future.pop();
        this.render();
      }
    };
    this.svg.addEventListener('pointerdown',e=>this.down(e));
    this.svg.addEventListener('pointermove',e=>this.move(e));
    this.svg.addEventListener('pointerup',()=>{
      this.drag=null;this.pan=null;
    });
    this.svg.addEventListener('pointercancel',()=>{
      if(this.drag){
        this.draft=this.past.pop();this.drag=null;this.render();
      }
    });
  }
  mapUnit(){
    const a=this.assignment(),target=a?.targets[0];
    return target?.startsWith('group:')?this.draft.groups.find(g=>g.id===target.slice(6))?.template:this.draft.units.find(u=>u.id===target?.slice(5));
  }
  graph(){
    return this.draft?.behaviors.find(g=>g.id===this.graphId);
  }
  assignment(){
    return this.draft?.behaviorAssignments.find(a=>a.id===this.assignmentId);
  }
  remember(){
    this.past.push(clone(this.draft));
    if(this.past.length>25)this.past.shift();
    this.future=[];
  }
  tab(name){
    $('task-editor').hidden=name!=='task';
    $('graph-editor').hidden=name!=='graph';
    $('task-edit-tab').classList.toggle('active',name==='task');
    $('graph-edit-tab').classList.toggle('active',name==='graph');
    if(name==='graph')this.renderGraph();
  }
  open(id,newTask=false){
    this.draft=clone(this.getScenario());
    this.draft.version=3;
    this.draft.behaviors??=[];
    this.draft.behaviorAssignments??=[];
    this.draft.recording??={
      step:1,interval:5
    };
    const a=newTask?null:this.draft.behaviorAssignments.find(a=>a.id===id)??sharedAssignment(this.draft,this.getSelected()?.id);
    this.graphId=a?.behaviorId??this.draft.behaviors[0]?.id;
    this.assignmentId=a?.id??null;
    this.selected=null;
    this.connecting=null;
    this.canvasView=null;
    this.fitAll=false;
    this.past=[];
    this.future=[];
    this.render();
    this.tab('task');
    this.dialog.showModal();
  }
  apply(){
    try{
      validateScenario(this.draft);
      if(JSON.stringify(this.draft)===JSON.stringify(this.getScenario())||this.commit(this.draft,'タスクと挙動を変更しました。計算を実行してください。'))this.dialog.close();
    }catch(e){
      $('behavior-validation').hidden=false;
      $('behavior-validation').textContent=e.message;
    }
  }
  readFields(id){
    this.remember();
    const g=this.graph(),n=g?.nodes.find(n=>n.id===this.selected),a=this.assignment();
    if(id==='behavior-name'&&g)g.name=$('behavior-name').value;
    if(id==='node-value'&&n){
      if(n.kind==='wait')n.seconds=Number($('node-value').value);
      else if(n.kind==='patrol')n.speedFraction=Number($('node-value').value)/100;
    }
    if(id==='node-receiver'&&n){
      if($('node-receiver').value==='role'){
        delete n.receiverId;
        n.receiverRole='report';
      }else {
        delete n.receiverRole;
        n.receiverId=$('node-receiver').value;
      }
    }
    if(id==='node-sensor'&&n)n.sensor=$('node-sensor').checked;
    if(a){
      if(id==='assignment-name')a.name=$('assignment-name').value;
      if(id==='assignment-behavior')a.behaviorId=$('assignment-behavior').value;
      if(id==='assignment-targets')a.targets=[...$('assignment-targets').selectedOptions].map(o=>o.value);
      if(id==='assignment-spacing')a.spacing=$('assignment-spacing').value;
      if(id==='assignment-distance')a.spacingDistance=Number($('assignment-distance').value);
      if(id==='assignment-gain')a.gain=Number($('assignment-gain').value);
      if(id==='assignment-receiver')a.receiverId=$('assignment-receiver').value;
      if(id==='assignment-phase')a.phase=Number($('assignment-phase').value)/100;
      if(id==='assignment-preparation')a.preparation=Number($('assignment-preparation').value);
    }
    this.render();
  }
  startRoute(){
    this.remember();
    this.oldRoute=clone(this.assignment().route??[]);
    this.assignment().route=[];
  }
  addRoutePoint(p){
    this.assignment().route.push({
      ...p
    });
    return this.assignment().route.length;
  }
  finishRoute(){
    if(this.assignment().route.length<(this.graph().nodes.some(n=>n.kind==='patrol')?3:2))this.assignment().route=this.oldRoute.length?this.oldRoute:undefined;
    this.render();
    this.dialog.showModal();
  }
  setBase(p){
    this.remember();
    this.assignment().base={
      ...p
    };
    this.render();
    this.dialog.showModal();
  }
  edgeOptions(kind){
    const select=$('edge-condition');
    select.replaceChildren();
    for(const k of NODE_EVENTS[kind]??[])select.append(new Option(EDGE_EVENTS[k],k));
  }
  coord(e){
    const p=this.svg.createSVGPoint();
    p.x=e.clientX;
    p.y=e.clientY;
    return p.matrixTransform(this.svg.getScreenCTM().inverse());
  }
  down(e){
    const port=e.target.closest('[data-port]'),node=e.target.closest('[data-node]');
    if(port){
      if(port.dataset.port==='out'){
        this.connecting=port.dataset.node;
        const kind=this.graph().nodes.find(n=>n.id===this.connecting).kind;
        this.edgeOptions(kind);
        $('edge-condition').value=NODE_EVENTS[kind][0]??'';
        $('behavior-instruction').textContent='接続先の左の丸をクリックしてください。条件は上のリストで指定します。';
      }else if(this.connecting){
        if(!$('edge-condition').value)return;
        this.remember();
        const g=this.graph(),when=$('edge-condition').value;
        g.edges=g.edges.filter(x=>!(x.from===this.connecting&&x.when===when));
        g.edges.push({
          from:this.connecting,to:port.dataset.node,when
        });
        this.connecting=null;
        this.render();
      }
      return;
    }
    if(!node){
      if(!this.canvasView)return;
      const p=this.coord(e);
      this.pan={
        x:p.x,y:p.y,view:{
          ...this.canvasView
        },matrix:this.svg.getScreenCTM().inverse()
      };
      this.svg.setPointerCapture(e.pointerId);
      return;
    }
    this.selected=node.dataset.node;
    this.remember();
    const n=this.graph().nodes.find(n=>n.id===this.selected),p=this.coord(e);
    this.drag={
      id:n.id,x:p.x-(n.x??40),y:p.y-(n.y??70)
    };
    this.svg.setPointerCapture(e.pointerId);
    this.render();
  }
  move(e){
    if(this.pan){
      const screen=this.svg.createSVGPoint();
      screen.x=e.clientX;
      screen.y=e.clientY;
      const p=screen.matrixTransform(this.pan.matrix),v=this.pan.view;
      this.canvasView={
        ...v,x:v.x+this.pan.x-p.x,y:v.y+this.pan.y-p.y
      };
      this.renderGraph();
      return;
    }
    if(!this.drag)return;
    const p=this.coord(e),n=this.graph().nodes.find(n=>n.id===this.drag.id);
    n.x=Math.max(0,Math.min(1700,p.x-this.drag.x));
    n.y=Math.max(0,Math.min(800,p.y-this.drag.y));
    this.renderGraph();
  }
  render(){
    const select=(id,items,value)=>{
      const e=$(id);
      e.replaceChildren();
      for(const [key,label]of items)e.append(new Option(label,key));
      e.value=value??items[0]?.[0]??'';
    };
    if(!this.graph())this.graphId=this.draft.behaviors[0]?.id;
    select('behavior-list',this.draft.behaviors.map(g=>[g.id,g.name]),this.graphId);
    select('assignment-list',[['','タスクを選択、または新規作成'],...this.draft.behaviorAssignments.map(a=>[a.id,a.name])],this.assignmentId??'');
    select('assignment-behavior',this.draft.behaviors.map(g=>[g.id,g.name]),this.assignment()?.behaviorId);
    $('behavior-name').value=this.graph()?.name??'';
    const a=this.assignment();
    $('assignment-fields').disabled=!a;
    $('assignment-name').value=a?.name??'';
    const targets=$('assignment-targets');
    targets.replaceChildren();
    for(const [key,name]of [...this.draft.units.map(u=>['unit:'+u.id,u.name]),...(this.draft.groups??[]).map(g=>['group:'+g.id,'群: '+g.name+' ('+g.count+'個)'])]){
      const o=new Option(name,key);
      o.selected=a?.targets.includes(key);
      o.disabled=this.draft.behaviorAssignments.some(other=>other.id!==a?.id&&other.targets.includes(key));
      targets.append(o);
    }
    $('assignment-spacing').value=a?.spacing??'even';
    $('assignment-distance').value=a?.spacingDistance??500;
    $('assignment-gain').value=a?.gain??.01;
    $('assignment-summary').textContent=a?'共有経路 '+(a.route?.length??0)+'点 · '+(a.base?'帰投先 x '+(a.base.x/1000).toFixed(2)+' / y '+(a.base.y/1000).toFixed(2)+' km':'個々の経路を使用'):'';
    select('assignment-receiver',this.draft.units.map(u=>[u.id,u.name]),a?.receiverId);
    $('assignment-phase').value=(a?.phase??0)*100;
    $('assignment-preparation').value=a?.preparation??0;
    const graph=this.draft.behaviors.find(g=>g.id===a?.behaviorId),patrol=graph?.nodes.some(n=>n.kind==='patrol'),home=graph?.nodes.some(n=>n.kind==='return');
    $('assignment-base').hidden=!home;
    for(const id of ['assignment-spacing','assignment-distance','assignment-gain','assignment-phase'])$(id).parentElement.hidden=!patrol;
    $('assignment-preparation').parentElement.hidden=!graph?.nodes.some(n=>n.parameter==='preparation');
    $('assignment-receiver').parentElement.hidden=!graph?.nodes.some(n=>n.receiverRole);
    const n=this.graph()?.nodes.find(n=>n.id===this.selected);
    $('node-properties').hidden=!n;
    $('node-selected').textContent=n?NODE_KINDS[n.kind]:'';
    $('node-value-field').hidden=!n||!['wait','patrol'].includes(n.kind);
    $('node-value-label').textContent=n?.kind==='wait'?'待機秒数':'能力速度に対する巡回速度 (%)';
    $('node-value').value=n?.kind==='wait'?(n.parameter==='preparation'?a?.preparation??0:n.seconds):(n?.speedFraction??.7)*100;
    $('node-value').disabled=n?.parameter==='preparation';
    if(n?.parameter==='preparation')$('node-value-label').textContent='準備時間は「担当・経路」で設定';
    $('node-receiver-field').hidden=n?.kind!=='report';
    select('node-receiver',[['role','タスクの報告先'],...this.draft.units.map(u=>[u.id,u.name])],n?.receiverRole?'role':n?.receiverId);
    $('node-sensor').checked=n?.sensor!==false;
    if(n)this.edgeOptions(n.kind);
    $('behavior-duplicate').disabled=!this.graph();
    $('behavior-delete').disabled=!this.graph();
    $('node-add').disabled=!this.graph();
    $('assignment-delete').disabled=!a;
    $('behavior-validation').hidden=true;
    $('behavior-undo').disabled=!this.past.length;
    $('behavior-redo').disabled=!this.future.length;
    $('behavior-instruction').textContent='ノードをドラッグ · 右の丸→接続先の左の丸で接続 · 設定は選択して編集';
    this.renderGraph();
  }
  zoom(f){
    if(!this.canvasView)return;
    const v=this.canvasView,w=Math.max(250,Math.min(4000,v.w*f)),h=v.h*w/v.w;
    this.canvasView={
      x:v.x+(v.w-w)/2,y:v.y+(v.h-h)/2,w,h
    };
    this.renderGraph();
  }
  renderGraph(){
    this.svg.replaceChildren();
    const g=this.graph();
    if(!g)return;
    const maxX=Math.max(1000,...g.nodes.map(n=>(n.x??40)+240)),maxY=Math.max(450,...g.nodes.map(n=>(n.y??70)+110));
    if(!this.canvasView)this.canvasView={
      x:0,y:0,w:innerWidth<700&&!this.fitAll?500:maxX,h:maxY
    };
    const v=this.canvasView;
    this.svg.setAttribute('viewBox',v.x+' '+v.y+' '+v.w+' '+v.h);
    const add=(tag,attrs,text,parent=this.svg)=>{
      const e=document.createElementNS(ns,tag);
      for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);
      if(text!==undefined)e.textContent=text;
      parent.append(e);
      return e;
    };
    const counts=new Map();
    for(const edge of g.edges){
      const a=g.nodes.find(n=>n.id===edge.from),b=g.nodes.find(n=>n.id===edge.to);
      if(!a||!b)continue;
      const x=(a.x??40)+210,y=(a.y??70)+36,bx=b.x??40,by=(b.y??70)+36;
      add('path',{
        d:`M${x},${y} C${x+65},${y} ${bx-65},${by} ${bx},${by}`,class:'behavior-edge'
});
const key=edge.from+'|'+edge.to,count=counts.get(key)??0;
counts.set(key,count+1);
const label=add('text',{
  x:(x+bx)/2,y:(y+by)/2-12+count*18,class:'edge-label',tabindex:0,role:'button'
},EDGE_EVENTS[edge.when]+' ×');
label.addEventListener('click',()=>{
  this.remember();g.edges=g.edges.filter(e=>e!==edge);this.render();
});
label.addEventListener('keydown',e=>{
  if(e.key==='Enter'||e.key==='Delete'){
    this.remember();g.edges=g.edges.filter(x=>x!==edge);this.render();
  }
});
}
for(const n of g.nodes){
  const x=n.x??40,y=n.y??70,group=add('g',{
    'data-node':n.id,class:'behavior-node'+(this.selected===n.id?' selected':'')
  });
  add('rect',{
    x,y,width:210,height:72,rx:12
  },undefined,group);
  add('text',{
    x:x+14,y:y+29
  },(g.entry===n.id?'▶ ':'')+NODE_KINDS[n.kind],group);
  add('text',{
    x:x+14,y:y+52,class:'node-small'
  },n.kind==='patrol'?'群で間隔を調整':n.kind==='wait'?n.seconds+'秒':n.kind==='report'?'情報を送信':n.id,group);
  add('circle',{
    cx:x,cy:y+36,r:9,'data-port':'in','data-node':n.id,class:'behavior-port'
  },undefined,group);
  add('circle',{
    cx:x+210,cy:y+36,r:9,'data-port':'out','data-node':n.id,class:'behavior-port'
  },undefined,group);
}
}
}
