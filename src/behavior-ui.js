import { removeAssignment,removeBehavior } from './editor.js';
import { clone,validateScenario } from './engine.js';
import { NODE_KINDS,NODE_EVENTS,EDGE_EVENTS,TRIGGER_EVENTS,patrolGraph,sharedAssignment } from './shared-settings.js';
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
    this.minimap=$('behavior-minimap');
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
      this.connecting=null;
      this.selected=null;
      this.selectedTrigger=null;
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
      this.canvasView=null;
      this.connecting=null;
      this.selected=null;
      this.selectedTrigger=null;
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
      this.canvasView=null;
      this.connecting=null;
      this.render();
    };
    $('behavior-delete').onclick=()=>{
      this.remember();
      removeBehavior(this.draft,this.graphId);
      this.graphId=this.draft.behaviors[0]?.id;
      this.canvasView=null;
      this.connecting=null;
      this.assignmentId=this.draft.behaviorAssignments[0]?.id;
      this.selected=null;
      this.selectedTrigger=null;
      this.render();
    };
    $('node-add').onclick=()=>{
      if(!this.graph())return;
      this.remember();
      const kind=$('node-kind').value,id='node-'+Date.now().toString(36),n={
        id,kind,x:360+(this.graph().nodes.length%3)*260,y:400+Math.floor(this.graph().nodes.length/3)*100
      };
      if(kind==='wait')n.seconds=300;
      if(kind==='patrol')n.speedFraction=.7;
      if(kind==='report')n.receiverRole='report';
      this.graph().nodes.push(n);
      this.selected=id;
      this.selectedTrigger=null;
      this.render();
    };
    $('node-delete').onclick=()=>{
      const g=this.graph();
      if(!this.selected||g.nodes.length===1)return;
      this.remember();
      g.nodes=g.nodes.filter(n=>n.id!==this.selected);
      g.edges=g.edges.filter(e=>e.from!==this.selected&&e.to!==this.selected);
      g.triggers=g.triggers.filter(t=>t.to!==this.selected);
      this.selected=null;
      this.selectedTrigger=null;
      this.render();
    };
    $('trigger-add').onclick=()=>{
      if(!this.graph())return;
      this.remember();
      const g=this.graph(),id='trigger-'+Date.now().toString(36),event=$('trigger-kind').value;
      if(!event)return;
      const times=g.triggers.filter(t=>t.event==='time').map(t=>t.seconds),seconds=times.length?Math.max(...times)+300:300;
      g.triggers.push({id,event,to:this.selected??g.nodes[0].id,x:40,y:70+g.triggers.length*120,...(event==='time'?{seconds:Math.min(86400,seconds)}:{})});
      this.selected=null;
      this.selectedTrigger=id;
      this.render();
    };
    $('trigger-delete').onclick=()=>{
      this.remember();
      this.graph().triggers=this.graph().triggers.filter(t=>t.id!==this.selectedTrigger);
      this.selectedTrigger=null;
      this.render();
    };
    for(const id of ['trigger-event','trigger-target','trigger-seconds','trigger-policy','trigger-once'])$(id).onchange=()=>this.readFields(id);
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
      this.canvasView=null;
      this.connecting=null;
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
    this.svg.addEventListener('wheel',e=>{
      e.preventDefault();
      const amount=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?this.svg.clientHeight:1);
      if(!this.drag&&!this.pan)this.zoom(Math.exp(Math.max(-1,Math.min(1,amount*.0015))),this.coord(e));
    },{passive:false});
    this.minimap.addEventListener('pointerdown',e=>{
      if(e.button!==0||!this.canvasView)return;
      this.miniDrag=this.minimap.getScreenCTM().inverse();
      this.minimap.setPointerCapture(e.pointerId);
      this.miniMove(e);
    });
    this.minimap.addEventListener('pointermove',e=>{if(this.miniDrag)this.miniMove(e);});
    for(const event of ['pointerup','pointercancel'])this.minimap.addEventListener(event,()=>this.miniDrag=null);
    this.resizeObserver=new ResizeObserver(()=>{
      if(!this.draft||!this.svg.clientWidth||$('graph-editor').hidden)return;
      this.renderGraph();
    });
    this.resizeObserver.observe(this.svg);
    this.svg.addEventListener('pointerdown',e=>this.down(e));
    this.svg.addEventListener('pointermove',e=>this.move(e));
    this.svg.addEventListener('pointerup',()=>{
      this.drag=null;this.pan=null;
    });
    this.svg.addEventListener('pointercancel',()=>{
      if(this.drag){
        this.draft=this.past.pop();this.drag=null;this.render();
      }else{this.pan=null;
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
    this.draft=validateScenario(this.getScenario());
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
    this.selectedTrigger=null;
    this.connecting=null;
    this.canvasView=null;
    this.fitAll=false;
    this.past=[];
    this.future=[];
    this.render();
    this.tab('task');
    this.dialog.showModal();
    this.canvasView=null;
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
    const g=this.graph(),n=g?.nodes.find(n=>n.id===this.selected),a=this.assignment(),t=g?.triggers.find(t=>t.id===this.selectedTrigger);
    if(t){
      if(id==='trigger-event'){t.event=$('trigger-event').value;if(t.event==='time')t.seconds??=300;else delete t.seconds;}
      if(id==='trigger-target')t.to=$('trigger-target').value;
      if(id==='trigger-seconds')t.seconds=Number($('trigger-seconds').value);
      if(id==='trigger-policy')t.policy=$('trigger-policy').value;
      if(id==='trigger-once')t.once=$('trigger-once').checked;
    }
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
    if(e.button!==0)return;
    const port=e.target.closest('[data-port]'),node=e.target.closest('[data-node]'),trigger=e.target.closest('[data-trigger]');
    if(port){
      if(port.dataset.port==='out'){
        this.connecting={id:port.dataset.trigger??port.dataset.node,trigger:!!port.dataset.trigger};
        if(this.connecting.trigger){
          $('edge-condition').replaceChildren(new Option('起動','activate'));
        }else{
          const kind=this.graph().nodes.find(n=>n.id===this.connecting.id).kind;
          this.edgeOptions(kind);
        }
        $('behavior-instruction').textContent='接続先の左の丸をクリックしてください。起動条件からは処理ノードだけに接続できます。';
      }else if(this.connecting&&port.dataset.node){
        const g=this.graph();
        if(this.connecting.trigger){
          this.remember();
          g.triggers.find(t=>t.id===this.connecting.id).to=port.dataset.node;
        }else{
          const kind=g.nodes.find(n=>n.id===this.connecting.id)?.kind,when=$('edge-condition').value;
          if(!NODE_EVENTS[kind]?.includes(when))return;
          this.remember();
          g.edges=g.edges.filter(x=>!(x.from===this.connecting.id&&x.when===when));
          g.edges.push({from:this.connecting.id,to:port.dataset.node,when});
        }
        this.connecting=null;
        this.render();
      }
      return;
    }
    if(e.target.closest('.edge-label'))return;
    if(!node&&!trigger){
      if(!this.canvasView)return;
      this.connecting=null;
      const p=this.coord(e);
      this.pan={x:p.x,y:p.y,view:{...this.canvasView},matrix:this.svg.getScreenCTM().inverse()};
      this.svg.setPointerCapture(e.pointerId);
      return;
    }
    this.connecting=null;
    this.selected=node?.dataset.node??null;
    this.selectedTrigger=trigger?.dataset.trigger??null;
    this.remember();
    const n=this.items().find(n=>n.trigger? n.id===this.selectedTrigger:n.id===this.selected),p=this.coord(e);
    this.drag={id:n.id,trigger:n.trigger,x:p.x-n.x,y:p.y-n.y};
    this.svg.setPointerCapture(e.pointerId);
    this.render();
  }
  move(e){
    if(this.pan){
      const screen=this.svg.createSVGPoint();
      screen.x=e.clientX;screen.y=e.clientY;
      const p=screen.matrixTransform(this.pan.matrix),v=this.pan.view;
      this.canvasView={...v,x:v.x+this.pan.x-p.x,y:v.y+this.pan.y-p.y};
      this.renderGraph();
      return;
    }
    if(!this.drag)return;
    const p=this.coord(e),n=(this.drag.trigger?this.graph().triggers:this.graph().nodes).find(n=>n.id===this.drag.id);
    n.x=Math.max(0,Math.min(4000,p.x-this.drag.x));
    n.y=Math.max(0,Math.min(4000,p.y-this.drag.y));
    this.renderGraph();
  }
  miniMove(e){
    const point=this.minimap.createSVGPoint();
    point.x=e.clientX;point.y=e.clientY;
    const p=point.matrixTransform(this.miniDrag),v=this.canvasView;
    this.canvasView={...v,x:p.x-v.w/2,y:p.y-v.h/2};
    this.renderGraph();
  }
  items(){
    const g=this.graph();
    return g?[...g.triggers.map((t,i)=>({...t,trigger:true,x:t.x??40,y:t.y??70+i*120})),...g.nodes.map(n=>({...n,x:n.x??320,y:n.y??70}))]:[];
  }
  render(){
    const select=(id,items,value)=>{
      const e=$(id);
      e.replaceChildren();
      for(const [key,label]of items)e.append(new Option(label,key));
      e.value=items.some(([key])=>key===value)?value:items[0]?.[0]??'';
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
    const n=this.graph()?.nodes.find(n=>n.id===this.selected),t=this.graph()?.triggers.find(t=>t.id===this.selectedTrigger);
    $('trigger-properties').hidden=!t;
    select('trigger-event',Object.entries(TRIGGER_EVENTS),t?.event);
    select('trigger-target',this.graph()?.nodes.map(n=>[n.id,NODE_KINDS[n.kind]+' ('+n.id+')'])??[],t?.to);
    $('trigger-seconds-field').hidden=t?.event!=='time';
    $('trigger-seconds').value=t?.seconds??300;
    $('trigger-policy').value=t?.policy??'idle';
    $('trigger-once').checked=t?.once!==false;
    $('trigger-once').disabled=['scenarioStart','time'].includes(t?.event);
    const available=Object.entries(TRIGGER_EVENTS).filter(([event])=>event==='time'||!this.graph()?.triggers.some(t=>t.event===event));
    select('trigger-kind',available,$('trigger-kind').value);
    $('trigger-add').disabled=!this.graph();
    $('trigger-delete').disabled=(this.graph()?.triggers.length??0)<=1;
    $('node-delete').disabled=(this.graph()?.nodes.length??0)<=1;
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
    else if(t)$('edge-condition').replaceChildren(new Option('起動','activate'));
    else $('edge-condition').replaceChildren();
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
  zoom(f,anchor){
    if(!this.canvasView)return;
    const v=this.canvasView,w=Math.max(180,Math.min(10000,v.w*f)),ratio=w/v.w;
    anchor??={x:v.x+v.w/2,y:v.y+v.h/2};
    this.canvasView={x:anchor.x-(anchor.x-v.x)*ratio,y:anchor.y-(anchor.y-v.y)*ratio,w,h:v.h*ratio};
    this.renderGraph();
  }
  renderGraph(){
    this.svg.replaceChildren();
    this.minimap.replaceChildren();
    const g=this.graph();
    if(!g)return;
    const items=this.items(),minX=Math.min(...items.map(n=>n.x))-90,minY=Math.min(...items.map(n=>n.y))-90;
    const maxX=Math.max(...items.map(n=>n.x+210))+90,maxY=Math.max(...items.map(n=>n.y+72))+90;
    const aspect=(this.svg.clientWidth||900)/(this.svg.clientHeight||420);
    if(!this.canvasView){
      const w=Math.max(maxX-minX,(maxY-minY)*aspect,600),h=w/aspect;
      this.canvasView={x:(minX+maxX-w)/2,y:(minY+maxY-h)/2,w,h};
    }
    const v=this.canvasView,h=v.w/aspect;
    if(Math.abs(v.h-h)>.01){v.y+=(v.h-h)/2;v.h=h;}
    this.svg.setAttribute('viewBox',`${v.x} ${v.y} ${v.w} ${v.h}`);
    $('behavior-zoom-label').textContent=Math.round((this.svg.clientWidth||900)/v.w*100)+'%';
    const add=(tag,attrs,text,parent=this.svg)=>{
      const e=document.createElementNS(ns,tag);
      for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);
      if(text!==undefined)e.textContent=text;
      parent.append(e);return e;
    };
    const defs=add('defs',{});
    for(const [id,color]of [['behavior-arrow','#73c6e8'],['trigger-arrow','#bc95ea']]){
      const marker=add('marker',{id,viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:5,markerHeight:5,orient:'auto'},undefined,defs);
      add('path',{d:'M0 0 L10 5 L0 10 Z',fill:color},undefined,marker);
    }
    const connections=[...g.triggers.map(t=>({from:t.id,to:t.to,trigger:true})),...g.edges];
    const counts=new Map();
    for(const edge of connections){
      const a=items.find(n=>n.id===edge.from&&!!n.trigger===!!edge.trigger),b=items.find(n=>n.id===edge.to&&!n.trigger);
      if(!a||!b)continue;
      const x=a.x+210,y=a.y+36,bx=b.x,by=b.y+36;
      add('path',{d:`M${x},${y} C${x+65},${y} ${bx-65},${by} ${bx},${by}`,class:'behavior-edge'+(edge.trigger?' trigger-edge':''),'marker-end':edge.trigger?'url(#trigger-arrow)':'url(#behavior-arrow)'});
      if(edge.trigger)continue;
      const key=edge.from+'|'+edge.to,count=counts.get(key)??0;counts.set(key,count+1);
      const label=add('text',{x:(x+bx)/2,y:(y+by)/2-12+count*18,class:'edge-label',tabindex:0,role:'button'},EDGE_EVENTS[edge.when]+' ×');
      const remove=()=>{this.remember();g.edges=g.edges.filter(e=>e!==edge);this.render();};
      label.addEventListener('click',remove);
      label.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key==='Delete'){e.preventDefault();remove();}});
    }
    for(const n of items){
      const x=n.x,y=n.y,attrs=n.trigger?{'data-trigger':n.id}:{'data-node':n.id};
      const group=add('g',{...attrs,class:'behavior-node'+(n.trigger?' trigger-node':'')+((n.trigger?this.selectedTrigger:this.selected)===n.id?' selected':'')});
      add('rect',{x,y,width:210,height:72,rx:n.trigger?28:12},undefined,group);
      add('text',{x:x+14,y:y+29},n.trigger?TRIGGER_EVENTS[n.event]:NODE_KINDS[n.kind],group);
      add('text',{x:x+14,y:y+52,class:'node-small'},n.trigger?(n.event==='time'?'シーン開始から '+n.seconds+' 秒':'起動条件'):
        n.kind==='patrol'?'群で間隔を調整':n.kind==='wait'?n.seconds+'秒':n.kind==='report'?'情報を送信':n.id,group);
      if(!n.trigger)add('circle',{cx:x,cy:y+36,r:9,'data-port':'in',...attrs,class:'behavior-port'},undefined,group);
      if(n.trigger||NODE_EVENTS[n.kind]?.length)add('circle',{cx:x+210,cy:y+36,r:9,'data-port':'out',...attrs,class:'behavior-port'},undefined,group);
    }
    // Include the viewport so its rectangle remains visible when panning beyond the graph.
    const mx=Math.min(minX,v.x),my=Math.min(minY,v.y),mw=Math.max(maxX,v.x+v.w)-mx,mh=Math.max(maxY,v.y+v.h)-my;
    this.minimap.setAttribute('viewBox',`${mx} ${my} ${mw} ${mh}`);
    for(const edge of connections){
      const a=items.find(n=>n.id===edge.from&&!!n.trigger===!!edge.trigger),b=items.find(n=>n.id===edge.to&&!n.trigger);
      if(a&&b)add('line',{x1:a.x+210,y1:a.y+36,x2:b.x,y2:b.y+36,class:'behavior-edge'},undefined,this.minimap);
    }
    for(const n of items)add('rect',{x:n.x,y:n.y,width:210,height:72,rx:12,fill:n.trigger?'#a57bea':'#66b8d6'},undefined,this.minimap);
    add('rect',{x:v.x,y:v.y,width:v.w,height:v.h,class:'minimap-viewport'},undefined,this.minimap);
  }
}
