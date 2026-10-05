import {ContextMenu} from './context-menu.js?v=20261005-state-measurement-8';
import {BehaviorParameterUI} from './behavior-parameter-ui.js?v=20261005-state-measurement-8';
import {isParameterRef} from './behavior-parameters.js?v=20261005-state-measurement-8';
import {NavigationUI} from './navigation-ui.js?v=20261005-state-measurement-8';
import {routeFor,destinationFor,conditionKey,proximityErrors} from './navigation.js?v=20261005-state-measurement-8';
import { removeAssignment,removeBehavior,pruneReferences } from './editor.js?v=20261005-state-measurement-8';
import { clone,validateScenario } from './engine.js?v=20261005-state-measurement-8';
import { NODE_KINDS,NODE_EVENTS,EDGE_EVENTS,TRIGGER_EVENTS,patrolGraph,sharedAssignment } from './shared-settings.js?v=20261005-state-measurement-8';
import { requireElement } from './ui-dom.js?v=20261005-state-measurement-8';
const $=requireElement,ns='http://www.w3.org/2000/svg';
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
    const menu=document.createElement('div');menu.id='behavior-menu';menu.setAttribute('aria-label','ノード図の操作');this.dialog.append(menu);this.menu=new ContextMenu(menu);
    this.svg.addEventListener('contextmenu',e=>{
      e.preventDefault();if(this.panMoved)return;
      const context={target:this.contextTarget??e.target,clientX:e.clientX,clientY:e.clientY};
      if(this.pan?.button===2){this.pendingMenu=context;return;}this.openMenu(context);
    });
    this.svg.addEventListener('keydown',e=>{
      if(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10'){
        e.preventDefault();const r=(e.target===this.svg?this.svg:e.target).getBoundingClientRect();this.openMenu({target:e.target,clientX:r.x+r.width/2,clientY:r.y+r.height/2});
      }
    });
    this.dialog.addEventListener('close',()=>{this.menu.close(false);this.spaceHeld=false;this.svg.classList.remove('camera-ready');});
    window.addEventListener('keyup',e=>{if(e.code==='Space'){this.spaceHeld=false;this.svg.classList.remove('camera-ready');}});
    window.addEventListener('blur',()=>{
      this.spaceHeld=false;this.pan=null;this.pendingMenu=null;this.svg.classList.remove('camera-ready');
      if(this.drag){if(this.drag.recorded)this.draft=this.past.pop();this.drag=null;this.render();}
    });
    this.navigation=new NavigationUI({getDraft:()=>this.draft,getUnit:()=>this.mapUnit(),remember:()=>this.remember(),render:()=>this.render(),pickRoute:()=>{this.navigationMode='route';this.dialog.close();this.pickRoute();},pickPoint:()=>{this.navigationMode='point';this.dialog.close();this.pickBase();}});
    this.parameters=new BehaviorParameterUI(this);
    $('route-new').onclick=()=>this.openResource('route',false,true);
    $('destination-new').onclick=()=>this.openResource('destination',false,true);
    for(const kind of ['route','destination']){
      $('node-'+kind+'-new').onclick=()=>this.openResource(kind);
      $('node-'+kind+'-edit').onclick=()=>this.openResource(kind,true);
    }
    for(const prefix of ['edge','trigger'])$(''+prefix+'-near-new').onclick=()=>this.openResource('destination',false,false,prefix);
    this.past=[];
    this.future=[];
    this.selectedEdge=null;
    $('behaviors-open').onclick=()=>this.open(null,true);
    $('task-edit-tab').onclick=()=>this.tab('task');
    $('graph-edit-tab').onclick=()=>this.tab('graph');
    $('behavior-close').onclick=()=>this.dialog.close();
    $('behavior-cancel').onclick=()=>this.dialog.close();
    $('behavior-apply').onclick=()=>this.apply();
    $('node-measure').onclick=()=>this.measureSelected();
    $('graph-connect').onclick=()=>{
      this.connecting=this.connecting?null:{id:null};
      this.render();
    };
    this.dialog.addEventListener('keydown',e=>{
      if(e.defaultPrevented)return;
      if(e.key==='Escape'&&this.connecting){e.preventDefault();this.connecting=null;this.render();return;}
      if(e.code==='Space'&&!e.ctrlKey&&!e.metaKey&&!$('graph-editor').hidden&&this.svg.matches(':hover')&&!['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)){
        e.preventDefault();this.svg.focus({preventScroll:true});this.spaceHeld=true;this.svg.classList.add('camera-ready');return;
      }
      if($('graph-editor').hidden||['INPUT','SELECT','TEXTAREA','BUTTON'].includes(e.target.tagName)||e.target.isContentEditable)return;
      const modifier=e.ctrlKey||e.metaKey;
      if(e.code==='Space'&&!modifier){e.preventDefault();this.spaceHeld=true;this.svg.classList.add('camera-ready');}
      if(modifier&&e.key.toLowerCase()==='z'){e.preventDefault();$(e.shiftKey?'behavior-redo':'behavior-undo').click();}
      if(modifier&&e.key.toLowerCase()==='y'){e.preventDefault();$('behavior-redo').click();}
      if(modifier&&e.key.toLowerCase()==='d'){e.preventDefault();this.duplicateSelected();}
      if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();this.deleteSelection();}
      if(e.key.toLowerCase()==='f'){e.preventDefault();$('behavior-fit').click();}
    });
    this.dialog.addEventListener('cancel',e=>{if(this.connecting){e.preventDefault();this.connecting=null;this.render();}});
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
      this.selectedEdge=null;
      this.render();
    };
    $('assignment-list').onchange=()=>{
      this.assignmentId=$('assignment-list').value;
      this.graphId=this.assignment()?.behaviorId??this.graphId;
      this.selected=null;this.selectedTrigger=null;this.selectedEdge=null;this.connecting=null;
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
      this.selectedEdge=null;
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
      this.selected=null;this.selectedTrigger=null;this.selectedEdge=null;
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
      this.selectedEdge=null;
      this.render();
    };
    $('node-add').onclick=()=>{
      if(!this.graph())return;
      this.remember();
      const id=this.newId('node'),n={id,...this.newPosition(false)};
      this.graph().nodes.push(n);
      this.selected=id;
      this.selectedTrigger=null;
      this.selectedEdge=null;
      this.connecting=null;
      $('graph-add-menu').open=false;
      this.reveal(n);
      this.render();
    };
    $('node-delete').onclick=()=>{
      const g=this.graph();
      if(!this.selected||g.nodes.length===1)return;
      this.remember();
      g.nodes=g.nodes.filter(n=>n.id!==this.selected);
      g.edges=g.edges.filter(e=>e.from!==this.selected&&e.to!==this.selected);
      g.triggers=g.triggers.filter(t=>t.to!==this.selected);
      if(g.initial===this.selected)delete g.initial;
      const m=this.draft.mission,a=this.draft.behaviorAssignments.find(a=>a.id===m?.assignmentId);
      if(m?.type==='state'&&a?.behaviorId===g.id&&m.nodeId===this.selected){delete this.draft.mission;pruneReferences(this.draft);}
      this.selected=null;
      this.selectedTrigger=null;
      this.selectedEdge=null;
      this.render();
    };
    $('trigger-add').onclick=()=>{
      if(!this.graph())return;
      this.remember();
      const g=this.graph(),id=this.newId('trigger');
      g.triggers.push({id,...this.newPosition(true)});
      this.selected=null;
      this.selectedTrigger=id;
      this.selectedEdge=null;
      this.connecting=null;
      $('graph-add-menu').open=false;
      this.reveal(g.triggers.at(-1));
      this.render();
    };
    $('trigger-delete').onclick=()=>{
      this.remember();
      this.graph().triggers=this.graph().triggers.filter(t=>t.id!==this.selectedTrigger);
      this.selectedTrigger=null;
      this.selectedEdge=null;
      this.render();
    };
    $('edge-delete').onclick=()=>{
      if(!this.edge())return;
      this.remember();
      this.graph().edges.splice(this.selectedEdge,1);
      this.selectedEdge=null;
      this.render();
    };
    $('edge-condition').onchange=()=>this.readFields('edge-condition');
    for(const id of ['trigger-event','trigger-target','trigger-seconds','trigger-once','trigger-near-destination','trigger-near-distance','trigger-near-mode'])$(id).onchange=()=>this.readFields(id);
    for(const id of ['behavior-name','node-join-mode','node-kind','node-route','node-destination','edge-near-destination','edge-near-distance','edge-near-mode','node-initial','node-value','node-receiver','assignment-name','assignment-behavior','assignment-targets','assignment-spacing','assignment-distance','assignment-gain','assignment-receiver','assignment-phase','assignment-preparation','node-sensor'])$(id).onchange=()=>this.readFields(id);
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
      const g=this.graph(),needsRoute=g.nodes.some(n=>n.kind==='patrol'),t=this.draft.terrain,r=Math.min(1000,(t.columns-1)*t.spacing/4,(t.rows-1)*(t.spacingY??t.spacing)/4),cx=t.origin.x+(t.columns-1)*t.spacing/2,cy=t.origin.y+(t.rows-1)*(t.spacingY??t.spacing)/2;
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
        this.connecting=null;
        this.render();
      }
    };
    $('behavior-redo').onclick=()=>{
      if(this.future.length){
        this.past.push(clone(this.draft));
        this.draft=this.future.pop();
        this.connecting=null;
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
      this.drag=null;this.pan=null;this.svg.focus({preventScroll:true});
      if(this.pendingMenu){const context=this.pendingMenu;this.pendingMenu=null;if(!this.panMoved)this.openMenu(context);}
    });
    this.svg.addEventListener('pointercancel',()=>{
      if(this.drag){
        if(this.drag.recorded)this.draft=this.past.pop();this.drag=null;this.render();
      }else{this.pan=null;
      }
    });
  }
  mapUnit(){
    const a=this.assignment(),target=a?.targets[0];
    const unit=(target?.startsWith('group:')?this.draft.groups.find(g=>g.id===target.slice(6))?.template:this.draft.units.find(u=>u.id===target?.slice(5)))??this.getSelected()??this.draft.units[0]??this.draft.groups?.[0]?.template;
    return this.navigationMode==='point'&&this.navigation.item?.point&&unit?{...unit,initial:{...unit.initial,z:this.navigation.item.point.z}}:unit;
  }
  graph(){
    return this.draft?.behaviors.find(g=>g.id===this.graphId);
  }
  assignment(){
    return this.draft?.behaviorAssignments.find(a=>a.id===this.assignmentId);
  }
  edge(){return this.selectedEdge===null?null:this.graph()?.edges[this.selectedEdge];}
  newId(prefix){
    const ids=new Set([...this.graph().nodes,...this.graph().triggers].map(n=>n.id));
    let index=1;while(ids.has(prefix+'-'+index))index++;
    return prefix+'-'+index;
  }
  newPosition(trigger){
    if(this.addPosition){const p=this.addPosition;this.addPosition=null;return {x:Math.max(0,Math.min(3790,p.x)),y:Math.max(0,Math.min(3928,p.y))};}
    const v=this.canvasView??{x:0,y:0,w:1000,h:450},items=this.items();
    const x=Math.max(0,Math.min(3790,v.x+v.w/2-105-(trigger?240:0))),y=Math.max(0,Math.min(3928,v.y+v.h/2-36));
    for(let i=0;i<30;i++){
      const p={x:Math.max(0,Math.min(3790,x+(i%3)*40)),y:Math.max(0,Math.min(3928,y+Math.floor(i/3)*85))};
      if(!items.some(n=>Math.abs(n.x-p.x)<220&&Math.abs(n.y-p.y)<80))return p;
    }
    return {x,y};
  }
  reveal(n){
    const v=this.canvasView;if(!v)return;
    if(n.x<v.x+20)v.x=n.x-20;
    if(n.x+230>v.x+v.w)v.x=n.x+230-v.w;
    if(n.y<v.y+20)v.y=n.y-20;
    if(n.y+92>v.y+v.h)v.y=n.y+92-v.h;
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
    this.draft.routes??=[];this.draft.destinations??=[];
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
    this.selectedEdge=null;
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
  measureSelected(){
    const a=this.assignment(),g=this.graph(),n=g?.nodes.find(n=>n.id===this.selected);
    if(!n||a?.behaviorId!==g?.id)return;
    this.remember();
    const m=this.draft.mission;
    this.draft.mission={type:'state',assignmentId:a.id,nodeId:n.id,join:m?.type==='state'?m.join:'any',deadline:m?.deadline??this.draft.duration,...(m?.type==='state'&&m.join==='count'?{requiredCount:m.requiredCount}:{})};
    this.render();
  }
  apply(){
    try{
      for(const g of this.draft.behaviors){
        if(g.nodes.some(n=>!NODE_KINDS[n.kind]))throw Error('未設定の状態ノードがあります。ノードをクリックして種類を選択してください。');
        if(g.triggers.some(t=>!TRIGGER_EVENTS[t.event]))throw Error('未設定のイベントノードがあります。ノードをクリックしてイベントの種類を選択してください。');
        if(g.triggers.some(t=>!g.nodes.some(n=>n.id===t.to)))throw Error('イベントノードの遷移先がありません。イベントノードから状態ノードへ線をつないでください。');
        if(g.edges.some(e=>!NODE_EVENTS[g.nodes.find(n=>n.id===e.from)?.kind]?.includes(e.when)))throw Error('遷移条件が未設定の線があります。線をクリックして条件を選択してください。終了ノードからの線は削除してください。');
      }
      validateScenario(this.draft);
      if(JSON.stringify(this.draft)===JSON.stringify(this.getScenario())||this.commit(this.draft,'タスクと挙動を変更しました。計算を実行してください。'))this.dialog.close();
    }catch(e){
      $('behavior-validation').hidden=false;
      $('behavior-validation').textContent=e.message;
    }
  }
  readFields(id){
    const g=this.graph(),n=g?.nodes.find(n=>n.id===this.selected),a=this.assignment(),t=g?.triggers.find(t=>t.id===this.selectedTrigger),edge=this.edge();
    if(id==='edge-condition'&&edge){
      const when=$('edge-condition').value;
      if(when&&when!=='near'&&g.edges.some(e=>e!==edge&&e.from===edge.from&&e.when===when)){
        this.render();$('edge-warning').hidden=false;$('edge-warning').textContent='この条件は同じ状態の別の線で使用しています。別の条件を選択してください。';return;
      }
    }
    this.remember();
    if(id==='edge-condition'&&edge){
      const value=$('edge-condition').value;
      if(value)edge.when=value;else delete edge.when;
      this.conditionDefaults(edge,value);
    }
    if(t){
      if(id==='trigger-event'){
        const event=$('trigger-event').value;
        if(event)t.event=event;else delete t.event;
        this.conditionDefaults(t,event);
        if(t.event==='time'){
          const used=new Set(g.triggers.filter(other=>other!==t&&other.event==='time').map(other=>other.seconds));
          let seconds=t.seconds??300;while(used.has(seconds)&&seconds<86400)seconds+=300;
          t.seconds=Math.min(86400,seconds);
        }else delete t.seconds;
      }
      if(id==='trigger-target')t.to=$('trigger-target').value;
      if(id==='trigger-seconds')t.seconds=Number($('trigger-seconds').value);
      if(id==='trigger-once')t.once=$('trigger-once').value==='once';
    }
    for(const [prefix,c] of [['edge',edge],['trigger',t]])if(c&&(c.when??c.event)==='near'){
      if(id===prefix+'-near-destination')c.destinationId=$(prefix+'-near-destination').value;
      if(id===prefix+'-near-distance')c.distance=Number($(prefix+'-near-distance').value);
      if(id===prefix+'-near-mode')c.distanceMode=$(prefix+'-near-mode').value;
    }
    if(id==='node-join-mode'&&n){if($('node-join-mode').value)n.joinMode=$('node-join-mode').value;else delete n.joinMode;}
    if(id==='node-route'&&n){const value=$('node-route').value;if(value)n.routeId=value;else delete n.routeId;}
    if(id==='node-destination'&&n){const value=$('node-destination').value;if(value)n.destinationId=value;else delete n.destinationId;}
    if(id==='behavior-name'&&g)g.name=$('behavior-name').value;
    if(id==='node-initial'&&n){
      if($('node-initial').checked)g.initial=n.id;else if(g.initial===n.id)delete g.initial;
    }
    if(id==='node-kind'&&n){
      const kind=$('node-kind').value;
      if(kind)n.kind=kind;else delete n.kind;
      if(!['follow','patrol'].includes(kind)){delete n.routeId;delete n.joinMode;}else n.joinMode??=kind==='patrol'?'nearest':'start';
      if(kind!=='move')delete n.destinationId;
      if(kind==='wait')n.seconds??=300;else {delete n.seconds;delete n.parameter;}
      if(kind==='patrol')n.speedFraction??=.7;else delete n.speedFraction;
      if(kind==='report'){if(!n.receiverId&&!n.receiverRole)n.receiverRole='report';}
      else {delete n.receiverId;delete n.receiverRole;}
      for(const e of g.edges.filter(e=>e.from===n.id))if(!NODE_EVENTS[kind]?.includes(e.when))delete e.when;
    }
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
      if(id==='assignment-behavior'){if(this.draft.mission?.type==='state'&&this.draft.mission.assignmentId===a.id){delete this.draft.mission;pruneReferences(this.draft);}a.behaviorId=$('assignment-behavior').value;delete a.parameters;this.graphId=a.behaviorId;}
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
  conditionDefaults(c,event){
    if(event==='near'){c.distance??=1000;c.distanceMode??='horizontal';c.destinationId??=this.draft.destinations[0]?.id;}
    else{delete c.distance;delete c.distanceMode;delete c.destinationId;}
  }
  openResource(kind,edit=false,fromMenu=false,prefix){
    $('graph-add-menu').open=false;
    const n=this.graph()?.nodes.find(n=>n.id===this.selected),c=prefix==='edge'?this.edge():prefix==='trigger'?this.graph()?.triggers.find(t=>t.id===this.selectedTrigger):null;
    const reference=kind==='route'?n?.routeId:c?.destinationId??n?.destinationId;
    let preset;
    if(edit&&!reference){
      if(kind==='route'){const u=this.mapUnit();if(u)preset={points:structuredClone(routeFor(this.draft,this.assignment(),n,u).points),mode:routeFor(this.draft,this.assignment(),n,u).mode,name:'担当の経路'};}
      else{const d=destinationFor(this.draft,this.assignment(),n);if(d)preset={...structuredClone(d),name:'担当の目的地'};}
    }
    this.navigation.open(kind,edit?reference:null,preset,id=>{
      if(c)c.destinationId=id;
      else if(n&&kind==='route'&&['follow','patrol'].includes(n.kind))n.routeId=id;
      else if(n&&kind==='destination'&&n.kind==='move')n.destinationId=id;
    });
  }
  cancelPointPick(){
    this.dialog.showModal();
    if(this.navigationMode){this.navigationMode=null;this.navigation.fields();this.navigation.dialog.showModal();}
  }
  startRoute(){
    if(this.navigationMode==='route')return;
    this.remember();
    this.oldRoute=clone(this.assignment().route??[]);
    this.assignment().route=[];
  }
  addRoutePoint(p){
    if(this.navigationMode==='route')return this.navigation.addPoint(p);
    this.assignment().route.push({
      ...p
    });
    return this.assignment().route.length;
  }
  finishRoute(){
    if(this.navigationMode==='route'){this.navigationMode=null;this.dialog.showModal();this.navigation.finishRoute();return;}
    if(this.assignment().route.length<(this.graph().nodes.some(n=>n.kind==='patrol')?3:2))this.assignment().route=this.oldRoute.length?this.oldRoute:undefined;
    this.render();
    this.dialog.showModal();
  }
  setBase(p){
    if(this.navigationMode==='point'){this.navigationMode=null;this.dialog.showModal();this.navigation.setPoint(p);return;}
    this.remember();
    this.assignment().base={
      ...p
    };
    this.render();
    this.dialog.showModal();
  }
  edgeOptions(kind,edge){
    const select=$('edge-condition');
    select.replaceChildren();
    select.append(new Option('条件を選択してください',''));
    for(const k of NODE_EVENTS[kind]??[]){
      const option=new Option(EDGE_EVENTS[k],k);
      option.disabled=k!=='near'&&this.graph().edges.some(e=>e!==edge&&e.from===edge?.from&&e.when===k);
      select.append(option);
    }
    select.value=edge?.when??'';
  }
  coord(e){
    const p=this.svg.createSVGPoint();
    p.x=e.clientX;
    p.y=e.clientY;
    return p.matrixTransform(this.svg.getScreenCTM().inverse());
  }
  down(e){
    if(![0,1,2].includes(e.button))return;
    this.menu.close(false);this.panMoved=false;this.pendingMenu=null;this.contextTarget=e.button===2?e.target:null;this.svg.focus({preventScroll:true});
    if(e.button!==0||this.spaceHeld){
      if(!this.canvasView)return;
      e.preventDefault();const p=this.coord(e);
      this.pan={x:p.x,y:p.y,view:{...this.canvasView},matrix:this.svg.getScreenCTM().inverse(),screenX:e.clientX,screenY:e.clientY,button:e.button};
      this.svg.setPointerCapture(e.pointerId);return;
    }
    const node=e.target.closest('[data-node]'),trigger=e.target.closest('[data-trigger]');
    if(e.shiftKey&&(node||trigger)&&!this.connecting)this.connecting={id:null};
    if(this.connecting&&(node||trigger)){
      this.connectNode(node?.dataset.node??trigger.dataset.trigger,!!trigger);return;
    }
    const connection=e.target.closest('[data-edge]'),startLine=e.target.closest('[data-start-line]');
    if(connection||startLine){this.selectConnection(connection?Number(connection.dataset.edge):null,startLine?.dataset.startLine);return;}
    if(!node&&!trigger){
      if(!this.canvasView)return;
      this.connecting=null;this.selected=null;this.selectedTrigger=null;this.selectedEdge=null;
      const p=this.coord(e);
      this.pan={x:p.x,y:p.y,view:{...this.canvasView},matrix:this.svg.getScreenCTM().inverse(),screenX:e.clientX,screenY:e.clientY,button:e.button};
      this.svg.setPointerCapture(e.pointerId);this.render();return;
    }
    this.connecting=null;this.selected=node?.dataset.node??null;this.selectedTrigger=trigger?.dataset.trigger??null;this.selectedEdge=null;
    const n=this.items().find(n=>n.trigger?n.id===this.selectedTrigger:n.id===this.selected),p=this.coord(e);
    this.drag={id:n.id,trigger:n.trigger,x:p.x-n.x,y:p.y-n.y,recorded:false};
    this.svg.setPointerCapture(e.pointerId);this.render();
  }
  deleteSelection(){
    if(this.selectedEdge!==null)$('edge-delete').click();
    else if(this.selectedTrigger)$('trigger-delete').click();
    else if(this.selected)$('node-delete').click();
  }
  duplicateSelected(){
    const g=this.graph(),trigger=!!this.selectedTrigger,n=trigger?g?.triggers.find(t=>t.id===this.selectedTrigger):g?.nodes.find(n=>n.id===this.selected);
    if(!n)return;this.remember();const copy={...clone(n),id:this.newId(trigger?'trigger':'node'),x:Math.min(3790,n.x+40),y:Math.min(3928,n.y+85)};
    (trigger?g.triggers:g.nodes).push(copy);this.selected=trigger?null:copy.id;this.selectedTrigger=trigger?copy.id:null;this.selectedEdge=null;this.reveal(copy);this.render();
  }
  openMenu(e){
    if(!this.graph())return;
    const target=e.target,edge=target.closest('[data-edge]'),line=target.closest('[data-start-line]'),node=target.closest('[data-node]'),trigger=target.closest('[data-trigger]');
    const position=this.coord(e),items=[],add=(label,action,disabled=false)=>items.push({label,action,disabled});
    this.connecting=null;this.selected=node?.dataset.node??null;this.selectedTrigger=trigger?.dataset.trigger??line?.dataset.startLine??null;this.selectedEdge=edge?Number(edge.dataset.edge):null;
    this.render();
    if(edge||line){
      add('遷移条件を編集',()=>$(edge?'edge-condition':'trigger-event').focus());
      add('線を削除　Delete',()=>{if(edge)$('edge-delete').click();else{this.remember();delete this.graph().triggers.find(t=>t.id===this.selectedTrigger).to;this.render();}});
    }else if(node||trigger){
      add('種類を編集',()=>$(node?'node-kind':'trigger-event').focus());
      const n=this.graph().nodes.find(n=>n.id===this.selected);
      add('ここから接続',()=>{this.connecting={id:null};this.connectNode(node?.dataset.node??trigger.dataset.trigger,!!trigger);},!!n?.kind&&!NODE_EVENTS[n.kind]?.length);
      if(node)add('計測対象にする',()=>$('node-measure').click(),$('node-measure').disabled);
      if(node)add('初期状態にする',()=>{this.remember();this.graph().initial=this.selected;this.render();},this.graph().initial===this.selected);
      add('複製　Ctrl+D',()=>this.duplicateSelected());
      add('削除　Delete',()=>this.deleteSelection(),!!node&&this.graph().nodes.length===1);
    }else{
      add('ここに状態ノードを作る',()=>{this.addPosition=position;$('node-add').click();});
      add('ここにイベントノードを作る',()=>{this.addPosition=position;$('trigger-add').click();});
      items.push(null);add('経路を作る',()=>$('route-new').click());add('目的地を作る',()=>$('destination-new').click());
    }
    items.push(null);add('元に戻す　Ctrl+Z',()=>$('behavior-undo').click(),!this.past.length);add('やり直す　Ctrl+Shift+Z',()=>$('behavior-redo').click(),!this.future.length);add('全体を表示　F',()=>$('behavior-fit').click());
    this.menu.open(e.clientX,e.clientY,items,this.svg);
  }
  connectNode(id,trigger){
    const g=this.graph();
    if(!this.connecting.id){
      const source=trigger?g.triggers.find(t=>t.id===id):g.nodes.find(n=>n.id===id);
      if(!trigger&&source.kind&&!(NODE_EVENTS[source.kind]?.length)){
        $('behavior-instruction').textContent='終了状態からは遷移できません。別の接続元を選んでください。';return;
      }
      this.connecting={id,trigger};
      this.render();return;
    }
    if(trigger){$('behavior-instruction').textContent='接続先は状態ノードを選んでください。';return;}
    this.remember();
    this.selected=null;
    if(this.connecting.trigger){
      g.triggers.find(t=>t.id===this.connecting.id).to=id;
      this.selectedTrigger=this.connecting.id;this.selectedEdge=null;
    }else{
      g.edges.push({from:this.connecting.id,to:id});
      this.selectedEdge=g.edges.length-1;this.selectedTrigger=null;
    }
    this.connecting=null;
    this.render();
  }
  selectConnection(index,triggerId){
    this.selected=null;
    this.selectedTrigger=triggerId??null;
    this.selectedEdge=index;
    this.connecting=null;
    this.render();
  }
  move(e){
    if(this.pan){
      if(Math.hypot(e.clientX-this.pan.screenX,e.clientY-this.pan.screenY)>5)this.panMoved=true;
      const screen=this.svg.createSVGPoint();
      screen.x=e.clientX;screen.y=e.clientY;
      const p=screen.matrixTransform(this.pan.matrix),v=this.pan.view;
      this.canvasView={...v,x:v.x+this.pan.x-p.x,y:v.y+this.pan.y-p.y};
      this.renderGraph();
      return;
    }
    if(!this.drag)return;
    const p=this.coord(e),n=(this.drag.trigger?this.graph().triggers:this.graph().nodes).find(n=>n.id===this.drag.id);
    const x=Math.max(0,Math.min(4000,p.x-this.drag.x)),y=Math.max(0,Math.min(4000,p.y-this.drag.y));
    if(Math.abs((n.x??0)-x)<.01&&Math.abs((n.y??0)-y)<.01)return;
    if(!this.drag.recorded){this.remember();this.drag.recorded=true;}
    n.x=x;n.y=y;
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
    $('assignment-summary').textContent=a?'共有経路 '+(a.route?.length??0)+'点 · '+(a.base?'既存の目的地 x '+(a.base.x/1000).toFixed(2)+' / y '+(a.base.y/1000).toFixed(2)+' km':'個々の経路を使用'):'';
    select('assignment-receiver',this.draft.units.map(u=>[u.id,u.name]),a?.receiverId);
    $('assignment-phase').value=(a?.phase??0)*100;
    $('assignment-preparation').value=a?.preparation??0;
    const graph=this.draft.behaviors.find(g=>g.id===a?.behaviorId),patrol=graph?.nodes.some(n=>n.kind==='patrol'),home=graph?.nodes.some(n=>n.kind==='move');
    $('assignment-base').hidden=true;
    for(const id of ['assignment-spacing','assignment-distance','assignment-gain','assignment-phase'])$(id).parentElement.hidden=!patrol;
    this.parameters.assignments();
    $('assignment-preparation').parentElement.hidden=!graph?.nodes.some(n=>n.parameter==='preparation');
    $('assignment-receiver').parentElement.hidden=!graph?.nodes.some(n=>n.receiverRole&&!n.receiverId);
    const n=this.graph()?.nodes.find(n=>n.id===this.selected),t=this.graph()?.triggers.find(t=>t.id===this.selectedTrigger),edge=this.edge();
    $('graph-selection-help').hidden=!!(n||t||edge);
    $('trigger-properties').hidden=!t;
    select('trigger-event',[['','種類を選択してください'],...Object.entries(TRIGGER_EVENTS)],t?.event);
    for(const option of $('trigger-event').options)option.disabled=!!option.value&&!['time','near'].includes(option.value)&&this.graph()?.triggers.some(other=>other!==t&&other.event===option.value);
    select('trigger-target',[['','状態ノードに接続してください'],...(this.graph()?.nodes.map(n=>[n.id,NODE_KINDS[n.kind]??'未設定の状態'])??[])],t?.to);
    $('trigger-seconds-field').hidden=t?.event!=='time';
    $('trigger-seconds').value=isParameterRef(t?.seconds)?'':t?.seconds??300;
    $('trigger-seconds').disabled=this.parameters.bind('trigger-seconds-binding',t,'seconds','number','s','イベントの時間');
    $('trigger-once').value=t?.once===false?'repeat':'once';
    $('trigger-seconds-label').textContent=t?.once===false?'発火間隔（秒）':'シーン開始からの秒数';
    $('trigger-add').disabled=!this.graph();
    $('trigger-delete').disabled=!t;
    $('node-delete').disabled=(this.graph()?.nodes.length??0)<=1;
    $('node-properties').hidden=!n;
    $('node-selected').textContent=n?(NODE_KINDS[n.kind]??'未設定の状態'):'';
    select('node-kind',[['','種類を選択してください'],...Object.entries(NODE_KINDS)],n?.kind);
    $('node-initial').checked=!!n&&this.graph()?.initial===n.id;
    const measured=this.draft.mission?.type==='state'&&this.draft.mission.assignmentId===a?.id&&this.draft.mission.nodeId===n?.id;
    $('node-measure').disabled=!n||!n.kind||a?.behaviorId!==this.graph()?.id;
    $('node-measure').textContent=measured?'計測対象に設定済み':'この状態を計測対象にする';
    $('node-measure-note').textContent=a?.behaviorId===this.graph()?.id?'タスク「'+a.name+'」の初回到達を計測します。人数条件・期限は分析で設定できます。':'この挙動を使うタスクを担当タブで選択してください。';
    $('node-route-fields').hidden=!['follow','patrol'].includes(n?.kind);
    const u=this.mapUnit(),legacyRoute=u?routeFor(this.draft,a,{kind:n?.kind},u):null;
    select('node-route',[['','担当の既存経路'+(legacyRoute?'（'+legacyRoute.points.length+'点）':'')],...this.draft.routes.map(r=>[r.id,r.name+'（'+r.points.length+'点）'])],n?.routeId??'');
    const routeBound=this.parameters.bind('node-route-binding',n,'routeId','route',null,'使用する経路');
    $('node-route').disabled=routeBound;$('node-route-new').disabled=routeBound;$('node-route-edit').disabled=routeBound||!n?.routeId&&!u;
    $('node-join-mode').value=n?.joinMode??'';
    $('node-destination-fields').hidden=n?.kind!=='move';
    select('node-destination',[['',a?.base?'担当の既存目的地':'目的地を選択してください'],...this.draft.destinations.map(d=>[d.id,d.name+(d.kind==='unit'?'（ユニット）':'（地点）')])],n?.destinationId??'');
    const destinationBound=this.parameters.bind('node-destination-binding',n,'destinationId','destination',null,'移動する目的');
    $('node-destination').disabled=destinationBound;$('node-destination-new').disabled=destinationBound;$('node-destination-edit').disabled=destinationBound||!n?.destinationId&&!a?.base;
    for(const [prefix,c] of [['edge',edge],['trigger',t]]){
      $(prefix+'-near-fields').hidden=(c?.when??c?.event)!=='near';
      select(prefix+'-near-destination',[['','目的地を選択してください'],...this.draft.destinations.map(d=>[d.id,d.name])],c?.destinationId);
      const goalBound=this.parameters.bind(prefix+'-near-destination-binding',c,'destinationId','destination',null,'近づく目的');
      $(prefix+'-near-destination').disabled=goalBound;$(prefix+'-near-new').disabled=goalBound;
      $(prefix+'-near-distance').value=isParameterRef(c?.distance)?'':c?.distance??1000;
      $(prefix+'-near-distance').disabled=this.parameters.bind(prefix+'-near-distance-binding',c,'distance','number','m','接近距離');
      $(prefix+'-near-mode').value=c?.distanceMode??'horizontal';
    }
    $('node-value-field').hidden=!n||!['wait','patrol'].includes(n.kind);
    $('node-value-label').textContent=n?.kind==='wait'?'待機秒数':'能力速度に対する巡回速度 (%)';
    $('node-value').value=isParameterRef(n?.kind==='wait'?n.seconds:n?.speedFraction)?'':n?.kind==='wait'?(n.parameter==='preparation'?a?.preparation??0:n.seconds):(n?.speedFraction??.7)*100;
    $('node-value').disabled=this.parameters.bind('node-value-binding',n,n?.kind==='patrol'?'speedFraction':'seconds','number',n?.kind==='patrol'?'ratio':'s',n?.kind==='patrol'?'巡回速度比':'待機時間')||n?.parameter==='preparation';
    $('node-value-binding').hidden=n?.parameter==='preparation';
    if(n?.parameter==='preparation')$('node-value-label').textContent='準備時間は「担当・共有設定」で設定';
    $('node-receiver-field').hidden=n?.kind!=='report';
    select('node-receiver',[['role','タスクの報告先'],...this.draft.units.map(u=>[u.id,u.name])],n?.receiverRole?'role':n?.receiverId);
    $('node-receiver').disabled=this.parameters.bind('node-receiver-binding',n,'receiverId','unit',null,'報告先');
    $('node-sensor').checked=n?.sensor!==false;
    $('edge-properties').hidden=!edge;
    const source=this.graph()?.nodes.find(n=>n.id===edge?.from),target=this.graph()?.nodes.find(n=>n.id===edge?.to);
    $('edge-summary').textContent=edge?(NODE_KINDS[source?.kind]??'未設定の状態')+' → '+(NODE_KINDS[target?.kind]??'未設定の状態'):'';
    this.edgeOptions(source?.kind,edge);
    $('edge-condition').disabled=!(NODE_EVENTS[source?.kind]?.length);
    $('edge-warning').hidden=!edge||!!NODE_EVENTS[source?.kind]?.length;
    $('edge-warning').textContent=source?.kind==='stop'?'終了ノードからは遷移できません。この線を削除するか、始点の種類を変更してください。':'始点のノードをクリックして、状態の種類を設定してください。';
    $('behavior-duplicate').disabled=!this.graph();
    $('behavior-delete').disabled=!this.graph();
    $('node-add').disabled=!this.graph();
    $('assignment-delete').disabled=!a;
    $('behavior-validation').hidden=true;
    $('behavior-undo').disabled=!this.past.length;
    $('behavior-redo').disabled=!this.future.length;
    $('graph-connect').disabled=!this.graph();
    $('graph-connect').setAttribute('aria-pressed',String(!!this.connecting));
    $('graph-connect').textContent=this.connecting?'接続をキャンセル':'接続';
    $('behavior-instruction').textContent=this.connecting?(this.connecting.id?'接続先の状態ノードを選んでください。背景クリック・Escでキャンセル。':'接続元のノードを選んでください。次に接続先を選ぶと矢印が作られます。'):'＋追加でノードを作成 · 接続で接続元→接続先を選択 · ノードや線をクリックして設定';
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
    const items=this.items(),minX=Math.min(...items.map(n=>n.x))-90,minY=Math.min(...items.map(n=>n.y))-(g.edges.some(e=>e.from===e.to)?220:90);
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
    const connections=[...g.triggers.map(t=>({from:t.id,to:t.to,trigger:true})),...g.edges.map((e,index)=>({...e,index}))];
    const counts=new Map();
    for(const edge of connections){
      const a=items.find(n=>n.id===edge.from&&!!n.trigger===!!edge.trigger),b=items.find(n=>n.id===edge.to&&!n.trigger);
      if(!a||!b)continue;
      const key=[(edge.trigger?'event:':'state:')+edge.from,'state:'+edge.to].sort().join('|');
      const count=counts.get(key)??0;counts.set(key,count+1);
      const ac={x:a.x+105,y:a.y+36},bc={x:b.x+105,y:b.y+36};
      let x,y,bx,by,d,lx,ly;
      if(a===b){
        x=a.x+60;y=a.y;bx=a.x+150;by=a.y;
        const rise=85+count*35;
        d=`M${x},${y} C${x-50},${y-rise} ${bx+50},${by-rise} ${bx},${by}`;
        lx=a.x+105;ly=a.y-rise*.75-8;
      }else{
        const dx=bc.x-ac.x,dy=bc.y-ac.y,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
        const scale=1/Math.max(Math.abs(dx)/105,Math.abs(dy)/36,1e-8);
        x=ac.x+dx*scale;y=ac.y+dy*scale;bx=bc.x-dx*scale;by=bc.y-dy*scale;
        const offset=35+count*45;
        const c1={x:x+(bx-x)/3+nx*offset,y:y+(by-y)/3+ny*offset};
        const c2={x:x+(bx-x)*2/3+nx*offset,y:y+(by-y)*2/3+ny*offset};
        d=`M${x},${y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${bx},${by}`;
        lx=(x+bx)/2+nx*offset*.75;ly=(y+by)/2+ny*offset*.75-10;
      }
      const attrs=edge.trigger?{'data-start-line':edge.from}:{'data-edge':edge.index};
      const group=add('g',{...attrs,class:'behavior-connection'+((edge.trigger?this.selectedTrigger===edge.from:this.selectedEdge===edge.index)?' selected':''),tabindex:0,role:'button','aria-label':edge.trigger?'イベントノードの遷移先':(edge.when==='near'?this.parameters.label(edge.distance)+'m以内（'+(edge.distanceMode==='horizontal'?'水平':'絶対')+'）':EDGE_EVENTS[edge.when]??'遷移条件を設定')+'：'+(NODE_KINDS[a.kind]??'未設定の状態')+' → '+(NODE_KINDS[b.kind]??'未設定の状態')});
      add('path',{d,class:'behavior-edge'+(edge.trigger?' trigger-edge':!edge.when?' unconfigured':''),'marker-end':edge.trigger?'url(#trigger-arrow)':'url(#behavior-arrow)'},undefined,group);
      add('path',{d,class:'behavior-edge-hit'},undefined,group);
      if(!edge.trigger)add('text',{x:lx,y:ly,class:'edge-label'},edge.when==='near'?(isParameterRef(edge.destinationId)?this.parameters.label(edge.destinationId):this.draft.destinations.find(d=>d.id===edge.destinationId)?.name??'目的地未設定')+' '+this.parameters.label(edge.distance)+'m以内（'+(edge.distanceMode==='horizontal'?'水平':'絶対')+'）':EDGE_EVENTS[edge.when]??'条件を設定',group);
      group.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();this.selectConnection(edge.trigger?null:edge.index,edge.trigger?edge.from:undefined);}});
    }
    for(const n of items){
      const x=n.x,y=n.y,attrs=n.trigger?{'data-trigger':n.id}:{'data-node':n.id};
      const missing=n.trigger?!TRIGGER_EVENTS[n.event]:!NODE_KINDS[n.kind];
      const group=add('g',{...attrs,class:'behavior-node'+(n.trigger?' trigger-node':'')+(missing?' unconfigured':'')+((n.trigger?this.selectedTrigger:this.selected)===n.id?' selected':'')+(this.connecting?.id===n.id&&!!this.connecting.trigger===!!n.trigger?' connecting':'')+(!n.trigger&&g.initial===n.id?' initial-node':'')});
      add('rect',{x,y,width:210,height:72,rx:n.trigger?28:12},undefined,group);
      add('text',{x:x+14,y:y+29},n.trigger?(TRIGGER_EVENTS[n.event]??'未設定のイベントノード'):(NODE_KINDS[n.kind]??'未設定の状態'),group);
      add('text',{x:x+14,y:y+52,class:'node-small'},missing?'クリックして種類を設定':n.trigger?(n.event==='near'?(isParameterRef(n.destinationId)?this.parameters.label(n.destinationId):this.draft.destinations.find(d=>d.id===n.destinationId)?.name.slice(0,8)??'目的地未設定')+' '+this.parameters.label(n.distance)+'m（'+(n.distanceMode==='horizontal'?'水平':'3D')+'）':n.event==='time'?(n.once===false?this.parameters.label(n.seconds)+' 秒ごと':'開始から '+this.parameters.label(n.seconds)+' 秒'):(n.once===false?'発生するたびに遷移':'一度だけ遷移')):
        ['patrol','follow'].includes(n.kind)?(isParameterRef(n.routeId)?this.parameters.label(n.routeId):this.draft.routes.find(r=>r.id===n.routeId)?.name??'担当の経路'):n.kind==='move'?(isParameterRef(n.destinationId)?this.parameters.label(n.destinationId):this.draft.destinations.find(d=>d.id===n.destinationId)?.name??'担当の目的地'):n.kind==='wait'?this.parameters.label(n.seconds)+'秒':n.kind==='report'?'情報を送信':n.id,group);
      if(!n.trigger&&g.initial===n.id){
        add('rect',{x:x+120,y:y-13,width:82,height:23,rx:8,class:'initial-badge'},undefined,group);
        add('text',{x:x+131,y:y+3,class:'initial-label'},'初期状態',group);
      }
      const goal=this.draft.mission,task=this.draft.behaviorAssignments.find(a=>a.id===goal?.assignmentId);
      if(!n.trigger&&goal?.type==='state'&&task?.behaviorId===g.id&&goal.nodeId===n.id){
        add('rect',{x:x+8,y:y-13,width:88,height:23,rx:8,class:'measurement-badge'},undefined,group);
        add('text',{x:x+19,y:y+3,class:'measurement-label'},'計測対象',group);
      }
      group.setAttribute('tabindex','0');group.setAttribute('role','button');
      group.setAttribute('aria-label',(n.trigger?'イベント：':'状態：')+(n.trigger?TRIGGER_EVENTS[n.event]:NODE_KINDS[n.kind]));
      group.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();if(this.connecting)this.connectNode(n.id,!!n.trigger);else{this.selected=n.trigger?null:n.id;this.selectedTrigger=n.trigger?n.id:null;this.selectedEdge=null;this.render();}}});
    }
    // Include the viewport so its rectangle remains visible when panning beyond the graph.
    const mx=Math.min(minX,v.x),my=Math.min(minY,v.y),mw=Math.max(maxX,v.x+v.w)-mx,mh=Math.max(maxY,v.y+v.h)-my;
    this.minimap.setAttribute('viewBox',`${mx} ${my} ${mw} ${mh}`);
    for(const edge of connections){
      const a=items.find(n=>n.id===edge.from&&!!n.trigger===!!edge.trigger),b=items.find(n=>n.id===edge.to&&!n.trigger);
      if(a&&b)add('line',{x1:a.x+105,y1:a.y+36,x2:b.x+105,y2:b.y+36,class:'behavior-edge'},undefined,this.minimap);
    }
    for(const n of items)add('rect',{x:n.x,y:n.y,width:210,height:72,rx:12,fill:n.trigger?'#a57bea':'#66b8d6'},undefined,this.minimap);
    add('rect',{x:v.x,y:v.y,width:v.w,height:v.h,class:'minimap-viewport'},undefined,this.minimap);
  }
}
