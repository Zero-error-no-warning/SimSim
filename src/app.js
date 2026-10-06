import {NavigationUI} from './navigation-ui.js?v=20261006-route-planning-13';
import {scenarioRouteIssues} from './route-inspection.js?v=20261006-route-planning-13';
import {ContextMenu} from './context-menu.js?v=20261006-route-planning-13';
import {TerrainUI} from './terrain-ui.js?v=20261006-route-planning-13';
import { BehaviorUI } from './behavior-ui.js?v=20261006-route-planning-13';
import { createSimulation } from './recorded-engine.js?v=20261006-route-planning-13';
import { sharedAssignment,NODE_KINDS } from './shared-settings.js?v=20261006-route-planning-13';
import { definition,editableDefinition,moveDefinition,editWaypoint,removeWaypoint,addWaypoint,replaceRoute,setPosition,newScenario,removeDefinition,translate,circleRoute } from './editor.js?v=20261006-route-planning-13';
import { importScenario } from './scenario-import.js?v=20261006-route-planning-13';
import { MAX_FILE_BYTES, RECORD_MODEL } from './recording.js?v=20261006-route-planning-13';
import { restoreAnalysisResult } from './detection.js?v=20261006-route-planning-13';
import { AnalysisUI } from './analysis-ui.js?v=20261006-route-planning-13';
import { MapView } from './view.js?v=20261006-route-planning-13';
import { Terrain, DOMAIN_NAMES, validateScenario, clone, MAX_UNITS } from './engine.js?v=20261006-route-planning-13';
import { requireElement,assertDocumentVersion } from './ui-dom.js?v=20261006-route-planning-13';
assertDocumentVersion();
const motionFields=[['motion-horizontal','horizontal',1,0],['motion-vertical','vertical',1,0],['motion-scale','scale',1,2000],['motion-delay','startDelay',1,0],['motion-speed','speedVariation',100,0]];
const $=requireElement;
const mapMenu=new ContextMenu($('map-menu'));
const FACTION_NAMES={
  friendly:'味方',hostile:'相手側',neutral:'中立'
};
const SYMBOLS={
  ground:'■',surface:'◆',subsurface:'●',air:'▲'
};
const STATUS_NAMES={
  standby:'イベント待ち',preparing:'出発準備中',idle:'待機',moving:'移動中',arrived:'経路完了',blocked:'地形制約で停止',waiting:'時間待ち'
};
let scenario,model,snapshot,selected=null,playing=false,time=0,revision=0,request=0,lastAccepted=0,editMode=null,dirty=false,authoring=true,pendingPlacement=null,circleCenter=null,selectedWaypoint=null;
const undo=[],redo=[];
STATUS_NAMES.disabled='無効（計算対象外）';
const worker=new Worker(new URL('./worker.js?v=20261006-route-planning-13',import.meta.url),{
  type:'module',name:'SimSim simulation'
});
let workerReady=false,timeout=null,waitNotice=null,workerWaitMessage=null;
function clearWorkerWait(){
  clearTimeout(timeout);clearTimeout(waitNotice);
}
window.addEventListener('simsim-boot-failed',()=>{
  clearWorkerWait();
  worker.terminate();
},{once:true});
worker.onerror=event=>{
  event.preventDefault();
  pause();
  clearWorkerWait();
  showError('計算Workerの起動・実行に失敗しました。\n'+(event.message||'詳細メッセージなし')+'\n'+(event.filename||'src/worker.js')+':'+(event.lineno||0));
};
worker.onmessageerror=()=>{
  clearWorkerWait();
  pause();
  showError('計算Workerの返信を読み取れませんでした。');
};
worker.onmessage=({
  data
})=>{
  workerReady=true;
  clearWorkerWait();
  if(workerWaitMessage&&$('error-text').textContent===workerWaitMessage&&$('error-dialog').open)$('error-dialog').close();
  workerWaitMessage=null;
  if(data.revision!==revision)return;
  if(data.type==='recordingProgress'){
    $('recording-info').textContent='計算中 '+Math.round(data.time/data.duration*100)+'%';
    return;
  }
  if(data.type==='recordingExport'){
    downloadRecording(data.payload);
    return;
  }
  if(data.type==='error'){
    pause();
    showError(data.message);
    return;
  }
  if(data.request<lastAccepted)return;
  lastAccepted=data.request;
  workerReady=true;
  clearWorkerWait();
  snapshot=data.snapshot;
  $('play').disabled=!!snapshot.actionsPending;
  $('step').disabled=!!snapshot.actionsPending;
  $('timeline').disabled=!!snapshot.actionsPending;
  $('record-run').disabled=!!snapshot.recordingRunning;
  $('record-cancel').disabled=!snapshot.recordingRunning;
  $('record-cancel').hidden=!snapshot.recordingRunning;
  $('record-save').disabled=!snapshot.recording;
  $('recording-info').textContent=snapshot.recording?'記録済み · '+snapshot.recording.frames+'フレーム · '+(snapshot.recording.bytes/1048576).toFixed(2)+' MiB · 再生時の計算なし':snapshot.executionState==='failed'?'計算失敗 · '+snapshot.missionError:snapshot.executionState==='cancelled'?'計算を中止しました':snapshot.recordingPending?'未計算 · 編集後は計算してください':'';
  view.updateSnapshot(snapshot);
  updateTelemetry();
  updateClock();
  analysisUI.onSnapshot();
};
const view=new MapView($('map'),{
  onSelect:id=>select(id),
  onMapClick:point=>handleMapClick(point),
  onEdit:edit=>{
    if(edit.selectOnly){
      selectedWaypoint={
        id:edit.id,index:edit.index
      };notify('経由点 '+(edit.index+1)+' を選択しました。Deleteで削除、ドラッグで移動できます。');return;
    }
    selectedWaypoint=edit.index>=0?{
      id:edit.id,index:edit.index
    }
    :null;commit(next=>{
      if(edit.index<0)moveDefinition(next,edit.id,edit.delta);else editWaypoint(next,edit.id,edit.index,edit.point);
    },edit.index<0?(currentUnit()?.groupId?'群全体を移動しました。':'ユニットと経路を移動しました。'):'経由点を移動しました。');
  },
  onContext:context=>openMapMenu(context),onDragState:(message,warning)=>notify(message,warning),
  onHover:point=>{
    if(point){
      $('cursor-position').textContent='x '+(point.x/1000).toFixed(2)+' km / y '+(point.y/1000).toFixed(2)+' km';
    }else $('cursor-position').textContent='';if(pendingPlacement||editMode?.startsWith('circle')){
      $('placement-hint').hidden=!point;if(point){
        const p=view.screenPoint(view.world(point));$('placement-hint').style.transform='translate('+p.x+'px,'+p.y+'px)';$('placement-hint').textContent=pendingPlacement?'＋ '+pendingPlacement.name:circleCenter?'半径 '+(Math.hypot(point.x-circleCenter.x,point.y-circleCenter.y)/1000).toFixed(2)+' km':'周回の中心';if(circleCenter)view.circlePreview(circleCenter,point,definition(scenario,selected)?.unit);
      }
    }
  }
});
const analysisUI=new AnalysisUI({
  getScenario:()=>scenario,getSnapshot:()=>snapshot,commit:(next,message)=>commit(target=>{
    for(const key of Object.keys(target))delete target[key];Object.assign(target,next);
  },message),showError,notify,
  replay:(next,message)=>{
    const previous=clone(scenario);applyScenario(next,{
      keepResults:true,autoRecord:true,message
    });undo.push(previous);if(undo.length>25)undo.shift();redo.length=0;dirty=true;updateUndo();const target=model.scenario.units.find(u=>u.faction===next.mission?.targetFaction);if(target)select(target.id);
  },
  seek:(value,id)=>{
    setAuthoring(false);setEditMode(null);if(id)select(id);time=Math.max(0,Math.min(scenario.duration,value));post();
  }
});
const behaviorUI=new BehaviorUI({
  getScenario:()=>scenario,getSelected:()=>currentUnit(),commit:(next,message)=>commit(target=>{
    for(const key of Object.keys(target))delete target[key];Object.assign(target,next);
  },message),showError,pickRoute:()=>{
    behaviorUI.startRoute();setEditMode('shared-route');view.placementUnit=behaviorUI.mapUnit();notify('地図を順にクリックして経路を指定。2点以上でEscを押して編集画面へ戻ります。');
  },pickBase:()=>{
    setEditMode('shared-base');view.placementUnit=behaviorUI.mapUnit();notify('目的地を地図でクリックしてください。');
  }
});
const routeUI=new NavigationUI({getDraft:()=>scenario,getUnit:()=>editableDefinition(scenario,selected)?.unit,commitRoute:item=>commit(next=>{
  const d=editableDefinition(next,selected);if(d.navigationRoute){const r=next.routes.find(r=>r.id===d.navigationRoute.id);Object.assign(r,{points:item.points,mode:item.mode,navigation:item.navigation});}
  else{replaceRoute(next,selected,{initial:item.points[0],route:item.points.slice(1),routeMode:item.mode});definition(next,selected).unit.navigation=item.navigation;}
},'経路を保存しました。地図上の点をドラッグして編集できます。')});
function openRoutePlanner(){if(!selected)return;pause();setEditMode(null);setAuthoring(true);const d=editableDefinition(scenario,selected),r=d.navigationRoute;routeUI.open('route',r?.id,{name:r?.name??d.unit.name+'の経路',points:[d.unit.initial,...d.unit.route],mode:d.unit.routeMode,navigation:r?.navigation??d.unit.navigation});$('navigation-domain').value=d.unit.domain;$('navigation-domain').disabled=true;routeUI.heightField();$('navigation-mode').value=d.unit.routeMode;$('navigation-planning').open=true;}
$('route-plan-open').onclick=openRoutePlanner;
let routeIssues=[];
function refreshRouteChecks(){routeIssues=scenarioRouteIssues(scenario);view.setRouteWarnings(routeIssues);$('route-check-status').textContent=routeIssues.length?'要確認 '+routeIssues.length+'区間（赤線）':'地形の問題なし';$('route-check-status').dataset.issues=routeIssues.length;}
$('route-check-open').onclick=()=>{refreshRouteChecks();const list=$('route-check-list');list.replaceChildren();if(!routeIssues.length)list.textContent='固定経路は地形の条件を満たしています。';for(const i of routeIssues){const row=document.createElement('p'),button=document.createElement('button');button.textContent=i.label+' ／ 区間 '+(i.segment+1)+'：'+i.reason;button.onclick=()=>{$('route-check-dialog').close();setAuthoring(true);if(i.unitId)select(i.unitId);view.fit();};row.append(button);list.append(row);}$('route-check-dialog').showModal();};
$('route-check-close').onclick=()=>$('route-check-dialog').close();
const terrainUI=new TerrainUI({getScenario:()=>scenario,view,setMode:setEditMode,commit,notify});
$('unit-task-open').onclick=()=>behaviorUI.open();
$('record-run').onclick=()=>{
  pause();
  time=0;
  post('calculate');
};
$('record-cancel').onclick=()=>post('cancelRecording');
$('record-save').onclick=()=>post('exportRecording');
function downloadRecording(payload){
  const blob=new Blob([JSON.stringify(payload)],{
    type:'text/plain;charset=utf-8'
  }),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;
  a.download='SimSim-recording.txt';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  notify('再生記録を保存しました。開くと再計算せず再生できます。');
}
for(const id of ['record-step','record-interval'])$(id).onchange=()=>{
  if(!$(id).checkValidity()||!$(id).value)return;
  commit(next=>{
    const step=Number($('record-step').value),interval=Number($('record-interval').value);next.recording={
      step,interval:Math.max(step,interval)
    };if(next.analysis)next.analysis.step=step;
  },'計算・記録間隔を変更しました。');
};
function renderCommunication(prefix,u){
  const c=u.communication??{
    enabled:false,range:10000,delay:0,probability:1,terrainLOS:false
  };
  $(prefix+'-communication-enabled').checked=c.enabled;
  $(prefix+'-communication-range').value=c.range/1000;
  $(prefix+'-communication-delay').value=c.delay;
  $(prefix+'-communication-probability').value=c.probability*100;
  $(prefix+'-communication-los').checked=c.terrainLOS;
}
function readCommunication(prefix){
  return {
    enabled:$(prefix+'-communication-enabled').checked,range:Number($(prefix+'-communication-range').value)*1000,delay:Number($(prefix+'-communication-delay').value),probability:Number($(prefix+'-communication-probability').value)/100,terrainLOS:$(prefix+'-communication-los').checked
  };
}
for(const input of document.querySelectorAll('[id^="unit-communication-"]'))input.onchange=()=>{
  if(input.type==='number'&&(!input.value||!input.checkValidity())){
    renderInspector();
    return;
  }
  commit(next=>definition(next,selected).unit.communication=readCommunication('unit'),'通信能力を変更しました。');
};
function renderSensor(prefix,unit) {
  const s=unit.sensor??{
    enabled:false,range:1000,probabilityPerMinute:.5,domains:['ground','surface','subsurface','air'],terrainLOS:false,mountHeight:2
  };
  $(prefix+'-sensor-enabled').checked=s.enabled;
  $(prefix+'-sensor-range').value=s.range/1000;
  $(prefix+'-sensor-probability').value=s.probabilityPerMinute*100;
  $(prefix+'-sensor-los').checked=s.terrainLOS;
  $(prefix+'-sensor-height').value=s.mountHeight??(unit.domain==='ground'?2:0);
  $(prefix+'-detectability').value=unit.detectability??1;
  for(const domain of ['ground','surface','subsurface','air'])$(prefix+'-sensor-'+domain).checked=s.domains.includes(domain);
}
function readSensor(prefix) {
  return {
    enabled:$(prefix+'-sensor-enabled').checked,range:Number($(prefix+'-sensor-range').value)*1000,probabilityPerMinute:Number($(prefix+'-sensor-probability').value)/100,domains:['ground','surface','subsurface','air'].filter(d=>$(prefix+'-sensor-'+d).checked),terrainLOS:$(prefix+'-sensor-los').checked,mountHeight:Number($(prefix+'-sensor-height').value)
  };
}
for(const input of document.querySelectorAll('[id^="unit-sensor-"],#unit-detectability'))input.addEventListener('change',()=>{
  if(!currentUnit()||currentUnit().groupId)return;
  if(!input.checkValidity()||(input.type==='number'&&input.value==='')){
    renderInspector();return;
  }
  commit(next=>{
    const u=next.units.find(u=>u.id===selected);u.sensor={
      ...u.sensor,...readSensor('unit')
    };u.detectability=Number($('unit-detectability').value);
  },'探知設定を変更しました。');
});
function notify(message,warning=false){
  $('notice').textContent=message;
  $('notice').classList.toggle('warning',warning);
}
function showError(message){
  $('error-text').textContent=message;
  if(!$('error-dialog').open)$('error-dialog').showModal();
}
function currentUnit(){
  return model?.scenario.units.find(u=>u.id===selected);
}
function post(type='seek',extra={
}){
  // UI initialization errors must not be reported as worker timeouts.
  if(!workerReady&&timeout===null){
    $('record-run').disabled=true;
    $('recording-info').textContent='計算Workerを起動しています…';
    waitNotice=setTimeout(()=>{
      if(!workerReady)$('recording-info').textContent='計算Workerの起動を待っています。最大60秒待ちます…';
    },10000);
    timeout=setTimeout(()=>{
      if(workerReady)return;
      workerWaitMessage='シナリオを計算Workerへ送信しましたが、60秒以内に返信を確認できませんでした。\n起動の遅延か、配信・認証・環境制限かは未判定です。後から応答が届けば続行できます。\n最新版の環境確認で「SimSim本体の計算Worker」の結果を確認してください。';
      showError(workerWaitMessage);
    },60000);
  }
  worker.postMessage({
    type,revision,request:++request,time,selected,showTrails:view.showTrails,scenario:type==='scenario'?scenario:undefined,...extra
  });
}
function pause(){
  playing=false;
  $('play').textContent='▶ 再生';
}
function applyScenario(next,{
  resetHistory=false,fit=false,message='シナリオを更新しました。',keepResults=false,recording=null,autoRecord=false
}
={
}) {
  if(terrainUI.active)terrainUI.cancel();
  closeMapMenu();
  const checked=importScenario(next),compiled=createSimulation(checked);
  scenario=checked;
  model=compiled;
  pause();
  time=0;
  revision++;
  lastAccepted=0;
  if(resetHistory){
    undo.length=0;
    redo.length=0;
    dirty=false;
  }
  if(selectedWaypoint&&(!definition(scenario,selectedWaypoint.id)||selectedWaypoint.index>=editableDefinition(scenario,selectedWaypoint.id).unit.route.length))selectedWaypoint=null;
  if(!model.scenario.units.some(u=>u.id===selected))selected=model.scenario.units[0]?.id||null;
  snapshot=model.evaluate(0);
  view.setScenario(model.scenario,selected,model);
  refreshRouteChecks();
  view.updateSnapshot(snapshot);
  if(fit){
    view.fit();
    authoring=true;
    view.setAuthoring(true);
    $('authoring-toggle').classList.add('active');
    $('authoring-toggle').setAttribute('aria-pressed','true');
  }
  $('record-step').value=scenario.recording.step;
  $('record-interval').value=scenario.recording.interval;
  $('seed').value=scenario.seed??'SimSim';
  $('trial').value=scenario.trial??0;
  $('title').value=scenario.title;
  $('duration').value=+(scenario.duration/60).toFixed(3);
  $('timeline').max=scenario.duration;
  $('duration-label').textContent=+(scenario.duration/60).toFixed(1)+'分';
  const t=scenario.terrain;
  $('terrain-info').textContent=Number(((t.columns-1)*t.spacing/1000).toFixed(6))+' × '+Number(((t.rows-1)*(t.spacingY??t.spacing)/1000).toFixed(6))+' km · '+t.columns+' × '+t.rows+' 格子';
  document.querySelector('.map-title').textContent=scenario.title;
  analysisUI.onScenario({
    keepResults
  });
  analysisUI.onSnapshot();
  renderUnits();
  renderInspector();
  updateClock();
  updateTelemetry();
  updateUndo();
  setEditMode(editMode&&selected?editMode:null);
  post('scenario',{
    recording,autoRecord
  });
  const invalid=snapshot.units.filter(u=>u.error).length;
  notify(message+(invalid?' 地形制約のある経路: '+invalid+'件。対象ユニットの設定欄で理由を確認できます。':''),invalid>0);
}
function commit(mutate,message) {
  const next=clone(scenario);
  try{
    mutate(next);
    validateScenario(next);
  }catch(error){
    showError(error.message);
    renderInspector();
    return false;
  }
  if(JSON.stringify(next)===JSON.stringify(scenario))return false;
  const previous=clone(scenario);
  try{
    applyScenario(next,{
      message:message+' 時刻を初期位置へ戻しました。'
    });
  }catch(error){
    showError(error.message);
    return false;
  }
  undo.push(previous);
  if(undo.length>25)undo.shift();
  redo.length=0;
  dirty=true;
  updateUndo();
  return true;
}
function updateUndo(){
  $('undo').disabled=!undo.length;
  $('redo').disabled=!redo.length;
}
function select(id){
  selectedWaypoint=null;
  selected=id;
  setEditMode(null);
  view.setSelected(id);
  post();
  renderUnits({
    selectionOnly:true
  });
  renderInspector();
  updateTelemetry();
}
function renderUnits({
  selectionOnly=false
}
={
}) {
  $('group-add').disabled=!currentUnit()||!!currentUnit().groupId;
  const list=$('unit-list'),scrollTop=list.scrollTop,scrollLeft=list.scrollLeft;
  // Keep existing buttons and their focus when selecting an already listed unit.
  if(selectionOnly && [...list.children].some(button=>button.dataset.id===selected)) {
    for(const button of list.children)button.classList.toggle('selected',button.dataset.id===selected);
    return;
  }
  $('unit-count').textContent=model.scenario.units.length;
  $('unit-list').replaceChildren();
  const query=$('unit-search').value.toLowerCase();
  const matches=model.scenario.units.filter(u=>(u.name+' '+u.id).toLowerCase().includes(query));
  const visible=matches.slice(0,80);
  const chosen=matches.find(u=>u.id===selected);
  if(chosen&&!visible.includes(chosen))visible.push(chosen);
  $('list-summary').textContent=matches.length>80?'一致 '+matches.length+'個 · 先頭80個と選択中を表示':'一致 '+matches.length+'個';
  $('group-list').replaceChildren();
  $('task-list').replaceChildren();
  for(const a of scenario.behaviorAssignments){
    const b=document.createElement('button');
    b.className='group-item';
    b.textContent=a.name+' · '+a.targets.length+'担当';
    b.onclick=()=>behaviorUI.open(a.id);
    $('task-list').append(b);
  }
  for(const group of scenario.groups??[]) {
    const b=document.createElement('button');
    b.className='group-item';
    b.textContent=(group.enabled===false?'無効 · ':'')+group.name+' · '+group.count+'個 · 編集';
    b.dataset.group=group.id;
    b.addEventListener('click',()=>openGroup(group.id));
    $('group-list').append(b);
  }
  for(const unit of visible) {
    const button=document.createElement('button');
    button.className='unit-item'+(unit.id===selected?' selected':'')+(unit.enabled===false?' inactive-unit':'');
    button.dataset.id=unit.id;
    const symbol=document.createElement('span');
    symbol.className='unit-symbol '+unit.faction;
    symbol.textContent=SYMBOLS[unit.domain];
    const description=document.createElement('span'),name=document.createElement('strong'),detail=document.createElement('small');
    name.textContent=unit.name;
    detail.textContent=(unit.enabled===false?'無効 · ':'')+DOMAIN_NAMES[unit.domain]+' · '+(unit.manned?'有人':'無人')+' · '+Math.round(unit.speed*3.6)+' km/h';
    description.append(name,detail);
    button.append(symbol,description);
    button.addEventListener('click',()=>select(unit.id));
    button.addEventListener('contextmenu',event=>{event.preventDefault();openMapMenu({x:event.clientX,y:event.clientY,id:unit.id});});
    button.addEventListener('keydown',event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){event.preventDefault();const r=button.getBoundingClientRect();openMapMenu({x:r.right,y:r.top,id:unit.id});}});
    $('unit-list').appendChild(button);
  }
  // Map selection can add a member beyond the first 80. Retain the user's viewport.
  if(selectionOnly){
    list.scrollTop=scrollTop;
    list.scrollLeft=scrollLeft;
  }
}
function renderInspector() {
  const original=currentUnit(),d=editableDefinition(scenario,selected),unit=d?{
    ...original,...d.unit
  }
  :original;
  $('properties').hidden=!unit;
  $('empty-selection').hidden=!!unit;
  $('delete').disabled=!unit;
  if(!unit)return;
  $('definition-fields').disabled=!!unit.groupId;
  $('generated-note').hidden=!unit.groupId;
  $('edit-selected-group').hidden=!unit.groupId;
  $('delete').disabled=!!unit.groupId;
  const m=unit.motion??{
  };
  for(const [id,key,factor,def] of motionFields)$(id).value=(m[key]??def)*factor;
  renderSensor('unit',unit);
  $('unit-enabled').checked=(d?.group??unit).enabled!==false;
  $('unit-enabled-note').textContent=unit.groupId?'この群全体の有効／無効を切り替えます。':unit.enabled===false?'編集用に表示しています。移動・センサー・通信・計測・記録の計算対象から外れます。':'無効にしても設定を保持します。作成済みの群は独立して動作します。';
  $('unit-name').value=unit.name;
  $('unit-domain').value=unit.domain;
  $('unit-faction').value=unit.faction;
  $('unit-manned').value=String(unit.manned);
  $('unit-speed').value=+(unit.speed*3.6).toFixed(2);
  $('unit-x').value=+(unit.initial.x/1000).toFixed(3);
  $('unit-y').value=+(unit.initial.y/1000).toFixed(3);
  const projected=model.terrain.project(unit.initial,unit.domain).point;
  $('height-label').textContent=unit.domain==='subsurface'?'深度（海面下 m）':unit.domain==='ground'?'地表標高（m・自動）':unit.domain==='surface'?'海面標高（m・自動）':'高度（海面基準 m）';
  $('unit-height').value=+(unit.domain==='subsurface'?scenario.terrain.seaLevel-unit.initial.z:projected.z).toFixed(1);
  $('unit-height').disabled=['ground','surface'].includes(unit.domain);
  $('unit-height').min=unit.domain==='subsurface'?'1':'-12000';
  $('unit-height').max=unit.domain==='subsurface'?'12000':'30000';
  $('position-heading').textContent=unit.routeMode==='loop'?'経路の基準点（0%）':'初期位置';
  $('place').textContent=unit.routeMode==='loop'?'地図で基準点を指定':'地図で初期位置を指定';
  $('loop-start').value=(unit.motion?.loopStart??0)*100;
  $('loop-start').disabled=unit.routeMode!=='loop';
  $('route-mode').value=unit.routeMode;
  $('route-count').textContent=unit.route.length+'点';
  $('route-table').replaceChildren();
  if(unit.route.length) {
    const head=document.createElement('div');
    head.className='route-table-head';
    for(const text of ['#','x / 東西','y / 南北','']){
      const span=document.createElement('span');
      span.textContent=text;
      head.append(span);
    }
    $('route-table').append(head);
  }
  unit.route.forEach((point,index)=>{
    const row=document.createElement('div');row.className='waypoint';
    const number=document.createElement('span');number.textContent=index+1;row.append(number);
    for(const key of ['x','y']) {
      const input=document.createElement('input');input.type='number';input.step='any';input.value=+(point[key]/1000).toFixed(3);input.setAttribute('aria-label','経由点'+(index+1)+' '+key+' km');
      input.addEventListener('change',()=>{
        if(input.value===''||!input.checkValidity()){
          renderInspector();return;
        }
        commit(next=>{
          const point={
            ...editableDefinition(next,selected).unit.route[index],[key]:Number(input.value)*1000
          };editWaypoint(next,selected,index,point);
        },'経由点を変更しました。');
      });row.append(input);
    }
    const remove=document.createElement('button');remove.textContent='×';remove.title='経由点'+(index+1)+'を削除';remove.addEventListener('click',()=>commit(next=>removeWaypoint(next,selected,index),'経由点を削除しました。'));row.append(remove);$('route-table').append(row);
  });
  const a=d?.assignment;
  $('unit-task-summary').textContent=a?'タスク: '+a.name:'タスク未割り当て · 設定した経路を進みます';
  $('place').disabled=false;
  $('route-edit').disabled=false;
  $('route-mode').disabled=!!a&&scenario.behaviors.find(g=>g.id===a.behaviorId)?.nodes.some(n=>n.kind==='patrol');
  $('loop-start').value=(d?.navigationRoute||a?.route?.length?a.phase??0:unit.motion?.loopStart??0)*100;
  renderCommunication('unit',unit);
  $('clear-route').disabled=!!d?.navigationRoute||!!a?.route?.length||!unit.route.length;
}
function updateTelemetry() {
  const state=snapshot?.units.find(u=>u.id===selected);
  if(!state)return;
  const detection=snapshot?.mission?.events.find(e=>e.targetId===selected);
  $('state-detection').textContent=detection?'探知 '+(detection.time/60).toFixed(1)+'分':snapshot?.mission?'未探知':'—';
  $('state-motion').textContent=(state.actualSpeed*3.6).toFixed(1)+' km/h / '+(state.startDelay==null?'—':state.startDelay.toFixed(1)+' s');
  $('state-status').textContent=STATUS_NAMES[state.status]+(state.nodeId?' · '+(scenario.behaviors?.find(g=>g.id===state.behaviorId)?.nodes.find(n=>n.id===state.nodeId)?.kind?NODE_KINDS[scenario.behaviors.find(g=>g.id===state.behaviorId).nodes.find(n=>n.id===state.nodeId).kind]:state.nodeId):'');
  $('state-position').textContent=(state.position.x/1000).toFixed(2)+' / '+(state.position.y/1000).toFixed(2)+' km';
  $('state-height').textContent=state.position.z<scenario.terrain.seaLevel?'深度 '+(scenario.terrain.seaLevel-state.position.z).toFixed(0)+' m':state.position.z.toFixed(0)+' m';
  $('state-distance').textContent=(state.distance/1000).toFixed(2)+' km';
  $('state-route').textContent=(state.routeDistance/1000).toFixed(2)+' km';
  $('unit-warning').hidden=!state.error;
  $('unit-warning').textContent=state.error?(state.errorAt+'：'+state.error+'\n到達可能な区間まで移動し、その地点で停止します。'):'';
}
function updateClock() {
  const seconds=Math.floor(snapshot?.time??time);
  $('clock').textContent=[Math.floor(seconds/3600),Math.floor(seconds%3600/60),seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
  if(document.activeElement!==$('timeline'))$('timeline').value=snapshot?.time??time;
}
function setEditMode(mode) {
  if(terrainUI.active&&mode!=='terrain')terrainUI.cancel();
  if(mode)setAuthoring(true);
  else {
    pendingPlacement=null;
    view.placementUnit=null;
    circleCenter=null;
    $('placement-hint').hidden=true;
    view.clearCirclePreview();
  }
  editMode=mode;
  view.setEditMode(mode);
  $('map').classList.toggle('editing',!!mode);
  $('place').classList.toggle('active',mode==='place');
  $('route-edit').classList.toggle('active',mode==='route');
  $('place').textContent=mode==='place'?'指定を終了':currentUnit()?.routeMode==='loop'?'地図で基準点を指定':'地図で初期位置を指定';
  $('route-edit').textContent=mode==='route'?'✓ 経由点の追加を終了':'＋ 地図で経由点を追加';
  $('map-instruction').textContent=mode==='terrain'?'左ドラッグで地形編集 · Space＋ドラッグで視点操作 · 右クリックで標高取得 · Shift＋右クリックで編集メニュー · Escで取消':mode==='create'?'置きたい場所をクリック · Escで取り消し':mode==='circle-center'?'周回の中心をクリック · Escで取り消し':mode==='circle-radius'?'半径と開始位置をクリック · Escで取り消し':mode==='place'?'初期位置をクリック · Escで終了':mode==='route'?'地図クリックで経由点を追加 · Escで終了':authoring?'ユニット・経由点をドラッグ · 右クリックで操作 · Space＋ドラッグで視点操作':'クリックで選択 · Space＋ドラッグで視点操作 · ホイールで拡大';
}
function bindUnit(id,mutate,message) {
  $(id).addEventListener('change',()=>{
    const input=$(id);if(!currentUnit()||currentUnit().groupId)return;if(input.value===''||!input.checkValidity()){
      renderInspector();return;
    }
    commit(next=>mutate(next.units.find(u=>u.id===selected),input.value),message);
  });
}
function setUnitEnabled(id,enabled){
  commit(next=>{const d=definition(next,id);if(d)(d.group??d.unit).enabled=enabled;},enabled?'計算対象に戻しました。再計算してください。':'計算対象から外しました。設定は編集用に保持しています。');
}
$('unit-enabled').onchange=()=>setUnitEnabled(selected,$('unit-enabled').checked);
bindUnit('unit-name',(u,value)=>u.name=value.trim(),'名称を変更しました。');
bindUnit('unit-faction',(u,value)=>u.faction=value,'陣営を変更しました。');
bindUnit('unit-manned',(u,value)=>u.manned=value==='true','運用区分を変更しました。');
bindUnit('unit-speed',(u,value)=>u.speed=Number(value)/3.6,'速度を変更しました。');
for(const [id,key,scale] of [['unit-x','x',1000],['unit-y','y',1000],['unit-height','z',1]])$(id).addEventListener('change',()=>{
  if(!$(id).checkValidity()||$(id).value==='')return;const value=key==='z'&&currentUnit().domain==='subsurface'?scenario.terrain.seaLevel-Number($(id).value):Number($(id).value)*scale;commit(next=>setPosition(next,selected,key,value),'経路の位置・高度を変更しました。');
});
$('loop-start').onchange=()=>commit(next=>{
  const d=editableDefinition(next,selected);if(d.navigationRoute||d.assignment?.route?.length)d.assignment.phase=Number($('loop-start').value)/100;else{
    d.unit.motion??={
    };d.unit.motion.loopStart=Number($('loop-start').value)/100;
  }
},'周回の出発点を変更しました。');
$('route-mode').onchange=()=>commit(next=>{
  const d=editableDefinition(next,selected);if(d.navigationRoute)d.navigationRoute.mode=$('route-mode').value;else if(d.assignment?.route?.length)d.assignment.routeMode=$('route-mode').value;else d.unit.routeMode=$('route-mode').value;
},'経路の繰り返しを変更しました。');
bindUnit('unit-domain',(u,value)=>{
  u.domain=value;const z=value==='subsurface'?scenario.terrain.seaLevel-120:value==='air'?scenario.terrain.seaLevel+1500:scenario.terrain.seaLevel;
  u.initial.z=z;u.route.forEach(p=>p.z=z);const a=sharedAssignment(scenario,selected);if(a?.route?.length){
    throw Error('共有経路の領域変更は担当タスクを解除してから行ってください。');
  }
},'領域を変更しました。');
for(const [id,key,factor] of motionFields)bindUnit(id,(u,v)=>{
  u.motion??={
  };u.motion[key]=Number(v)/factor;
},'航跡のばらつきを変更しました。');
$('unit-search').addEventListener('input',renderUnits);
for(const id of ['seed','trial'])$(id).addEventListener('change',()=>{
  if(!$(id).checkValidity()){
    applyScenario(scenario);return;
  }
  commit(next=>next[id]=id==='trial'?Number($(id).value):$(id).value,'試行設定を変更しました。');
});
$('next-trial').addEventListener('click',()=>commit(next=>next.trial=(next.trial??0)+1,'次の試行を生成しました。'));
let editingGroup=null;
function openGroup(id=null) {
  pause();
  setEditMode(null);
  editingGroup=id;
  const g=scenario.groups?.find(g=>g.id===id),u=g?.template??currentUnit();
  if(!u){
    notify('ひな型にするユニットを選択してください。',true);
    return;
  }
  const select=$('group-template');
  select.replaceChildren();
  if(g){
    const option=new Option('保存済みのひな型: '+g.template.name,'saved');
    select.append(option);
  }
  for(const base of scenario.units)select.append(new Option(base.name,base.id));
  select.value=g?'saved':scenario.units.some(b=>b.id===u.id)?u.id:scenario.units[0]?.id;
  $('group-dialog-title').textContent=g?'群を編集':'群を作る';
  $('group-remove').hidden=!g;
  $('group-name').value=g?.name??u.name+'群';
  $('group-count').value=g?.count??100;
  $('group-placement').value=g?.placement??'random';
  $('group-width').value=(g?.width??1000)/1000;
  $('group-height').value=(g?.height??1000)/1000;
  renderSensor('group',u);
  renderCommunication('group',u);
  const m=g?.template.motion??u.motion??{
  };
  for(const [input,key,factor,def] of groupMotionFields)$(input).value=(m[key]??(g&&key==='horizontal'?0:def))*factor;
  $('group-loop-start').disabled=u.routeMode!=='loop';
  $('group-loop-mode').value=g?.loopStartMode??'template';
  $('group-loop-mode').disabled=u.routeMode!=='loop';
  const bound=g&&sharedAssignment(scenario,g.id+'__1')?.route?.length;
  for(const id of ['group-width','group-height','group-placement','group-loop-start','group-loop-mode'])if(bound)$(id).disabled=true;
  else $(id).disabled=id.startsWith('group-loop')&&u.routeMode!=='loop';
  $('group-bound-note').hidden=!bound;
  $('group-dialog').showModal();
}
const groupMotionFields=[['group-horizontal','horizontal',1,200],['group-common','commonHorizontal',1,0],['group-vertical','vertical',1,0],['group-scale','scale',1,2000],['group-delay','startDelay',1,0],['group-speed','speedVariation',100,0],['group-loop-start','loopStart',100,0]];
$('group-template').addEventListener('change',()=>{
  const source=$('group-template').value==='saved'?scenario.groups?.find(g=>g.id===editingGroup)?.template:scenario.units.find(u=>u.id===$('group-template').value);renderSensor('group',source);renderCommunication('group',source);for(const [input,key,factor,def]of groupMotionFields)$(input).value=(source.motion?.[key]??def)*factor;$('group-loop-start').disabled=source?.routeMode!=='loop';$('group-loop-mode').disabled=source?.routeMode!=='loop';$('group-loop-start').value=(source?.motion?.loopStart??0)*100;
});
$('group-add').addEventListener('click',()=>openGroup());
$('edit-selected-group').addEventListener('click',()=>openGroup(currentUnit()?.groupId));
$('group-cancel').addEventListener('click',()=>$('group-dialog').close());
$('group-remove').addEventListener('click',()=>{
  if(commit(next=>removeDefinition(next,editingGroup+'__1'),'群を削除し、関連する分析変数・成功条件を整理しました。'))$('group-dialog').close();
});
$('group-form').addEventListener('submit',event=>{
  event.preventDefault();if(!$('group-form').reportValidity())return;
  const old=scenario.groups?.find(g=>g.id===editingGroup);
  const source=$('group-template').value==='saved'?old?.template:scenario.units.find(u=>u.id===$('group-template').value);
  if(!source){
    showError('ひな型が見つかりません。');return;
  }
  const template=clone(source);delete template.enabled;template.communication=readCommunication('group');template.sensor={
    ...template.sensor,...readSensor('group')
  };template.detectability=Number($('group-detectability').value);template.motion={
    ...template.motion
  };for(const [input,key,factor] of groupMotionFields){
    if(!$(input).disabled)template.motion[key]=Number($(input).value)/factor;
  }
  const g={
    ...(old??{
    }),id:old?.id??'group-'+Date.now().toString(36),name:$('group-name').value.trim(),loopStartMode:$('group-loop-mode').disabled?old?.loopStartMode??'template':$('group-loop-mode').value,count:Number($('group-count').value),placement:$('group-placement').value,width:Number($('group-width').value)*1000,height:Number($('group-height').value)*1000,template
  };
  const ok=commit(next=>{
    next.groups??=[];const i=next.groups.findIndex(item=>item.id===g.id);if(i<0){
      next.groups.push(g);const a=sharedAssignment(next,source.id);if(a)a.targets.push('group:'+g.id);
    }else next.groups[i]=g;
  },'群を生成しました。');
  if(ok||JSON.stringify(old)===JSON.stringify(g))$('group-dialog').close();
});
$('title').addEventListener('change',()=>{
  if(!$('title').value.trim()){
    $('title').value=scenario.title;return;
  }
  commit(next=>next.title=$('title').value.trim(),'シナリオ名を変更しました。');
});
$('duration').addEventListener('change',()=>{
  if(!$('duration').checkValidity()||!$('duration').value){
    $('duration').value=scenario.duration/60;return;
  }
  commit(next=>{
    next.duration=Number($('duration').value)*60;if(next.mission)next.mission.deadline=Math.min(next.mission.deadline,next.duration);
  },'終了時刻を変更しました。');
});
$('place').addEventListener('click',()=>{
  pause();setEditMode(editMode==='place'?null:'place');
});
$('route-edit').addEventListener('click',()=>{
  pause();setEditMode(editMode==='route'?null:'route');
});
$('clear-route').addEventListener('click',()=>commit(next=>{const d=editableDefinition(next,selected);if(d.navigationRoute||d.assignment?.route?.length)throw Error('共有経路の経由点は一つずつ編集してください。');d.unit.route=[];},'経由点を削除しました。'));
function newId(prefix){
  return prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
}
function setAuthoring(enabled){
  if(!enabled&&terrainUI.active)terrainUI.cancel();
  pause();
  if(enabled&&time!==0){
    time=0;
    snapshot=model.evaluate(0);
    view.updateSnapshot(snapshot);
    post();
  }
  authoring=enabled;
  view.setAuthoring(enabled);
  $('authoring-toggle').classList.toggle('active',enabled);
  $('authoring-toggle').setAttribute('aria-pressed',String(enabled));
}
function beginPlacement(domain,copy=null){
  setEditMode('create');
  pendingPlacement=copy?{
    ...clone(copy),name:(copy.name+' コピー').slice(0,100)
  }
  :{
    domain,name:DOMAIN_NAMES[domain]+'ユニット'
  };
  view.placementUnit=copy?(copy.template??copy):{
    domain,initial:{
      z:domain==='air'?scenario.terrain.seaLevel+1500:domain==='subsurface'?scenario.terrain.seaLevel-120:scenario.terrain.seaLevel
    }
  };
  notify('地図上の置きたい場所をクリックしてください。Escで取り消せます。');
}
function handleMapClick(point){
  if(editMode==='shared-route'){
    const n=behaviorUI.addRoutePoint(point);
    notify('経路 '+n+'点 · Escで編集画面へ戻る');
    return;
  }
  if(editMode==='shared-base'){
    setEditMode(null);
    behaviorUI.setBase(point);
    return;
  }
  if(editMode==='create'&&pendingPlacement){
    const p=pendingPlacement,isGroup=!!p.template,unit=isGroup?p.template:p;
    const z=unit.initial?.z??(unit.domain==='air'?Math.max(model.terrain.height(point.x,point.y),scenario.terrain.seaLevel)+1500:unit.domain==='subsurface'?scenario.terrain.seaLevel-120:scenario.terrain.seaLevel),checked=model.terrain.project({
      ...point,z
    },unit.domain);
    if(checked.error){
      notify(checked.error+' 別の地点を選んでください。',true);
      return;
    }
    const id=newId(isGroup?'group':'unit');
    const ok=commit(next=>{
      if(isGroup){
        const g=clone(p);g.id=id;translate(g.template,{
          x:checked.point.x-g.template.initial.x,y:checked.point.y-g.template.initial.y
        });next.groups??=[];next.groups.push(g);
      }
      else {
        const u=unit.initial?clone(unit):{
          name:pendingPlacement.name,domain:unit.domain,kind:'generic',faction:'friendly',manned:unit.domain!=='subsurface',speed:({
            ground:20,surface:40,subsurface:14,air:180
          }
          [unit.domain])/3.6,initial:checked.point,route:[],routeMode:'once'
        };if(unit.initial)translate(u,{
          x:checked.point.x-u.initial.x,y:checked.point.y-u.initial.y
        });u.id=id;next.units.push(u);
      }
      const original=sharedAssignment(next,selected);if(unit.initial&&original)original.targets.push((isGroup?'group:':'unit:')+id);
    },isGroup?'群を複製しました。':'ユニットを配置しました。');
    if(ok){
      setEditMode(null);
      select(isGroup?id+'__1':id);
    }
    return;
  }
  const d=editableDefinition(scenario,selected);
  if(!d)return;
  if(editMode==='circle-center'){
    circleCenter={
      ...point
    };
    editMode='circle-radius';
    view.setEditMode(editMode);
    $('map-instruction').textContent='半径と開始位置をクリック · Escで取り消し';
    return;
  }
  if(editMode==='circle-radius'){
    try{
      const path=circleRoute(circleCenter,{
        ...point,z:d.unit.initial.z
      });
      for(const p of [path.initial,...path.route]){
        const checked=model.terrain.project(p,d.unit.domain);
        if(checked.error)throw new Error(checked.error+' 周回の半径・中心を調整してください。');
      }
      if(commit(next=>{
        replaceRoute(next,selected,path);
      },'周回経路を作成しました。'))setEditMode(null);
    }catch(error){
      notify(error.message,true);
    }
    return;
  }
  const checked=model.terrain.project(point,d.unit.domain);
  if(checked.error){
    notify(checked.error,true);
    return;
  }
  commit(next=>{
    if(editMode==='place'){
      const u=editableDefinition(next,selected).unit;moveDefinition(next,selected,{
        x:checked.point.x-u.initial.x,y:checked.point.y-u.initial.y
      });
    }else addWaypoint(next,selected,checked.point);
  },editMode==='place'?'初期位置を変更しました。':'経由点を追加しました。');
  if(editMode==='place')setEditMode(null);
}
function deleteSelected(){
  if(selectedWaypoint){
    const w=selectedWaypoint;
    if(commit(next=>removeWaypoint(next,w.id,w.index),'経由点を削除しました。'))selectedWaypoint=null;
    return;
  }
  if(!currentUnit())return;
  commit(next=>removeDefinition(next,selected),'対象を削除しました。関連するタスク・分析変数・評価条件も整理しました。');
  setEditMode(null);
}
$('delete').addEventListener('click',deleteSelected);
$('add').addEventListener('click',()=>beginPlacement($('template').value));
$('authoring-toggle').onclick=()=>{
  setEditMode(null);
  setAuthoring(!authoring);
  setEditMode(null);
};
$('focus-selection').onclick=()=>view.focusSelected();
$('new-scenario').onclick=()=>{
  setEditMode(null);
  commit(next=>newScenario(next),'現在の地形を使って新しいシナリオを作成しました。右クリックからユニットを配置できます。');
  setAuthoring(true);
};
function closeMapMenu(){mapMenu.close();}
function openMapMenu(context){
  if(!scenario)return;
  if(!terrainUI.active&&context.id&&model.scenario.units.some(u=>u.id===context.id)&&context.id!==selected)select(context.id);
  const items=[],d=context.id?definition(scenario,context.id):null;
  const add=(label,action,disabled=false)=>items.push({label,action,disabled}),separator=()=>items.push(null);
  if(terrainUI.active){
    if(context.point&&!context.menu){mapMenu.close(false);terrainUI.sample(context.point);return;}
    if(context.point)add('ここの標高を取得してそろえる',()=>terrainUI.sample(context.point));
    for(const [value,label] of [['raise','高くする'],['lower','低くする'],['flatten','標高をそろえる'],['smooth','平滑化']])add(label,()=>{$('terrain-brush-mode').value=value;terrainUI.fields();});
    separator();add('一筆を元に戻す　Ctrl+Z',()=>terrainUI.history(false),!terrainUI.past.length);add('一筆をやり直す　Ctrl+Shift+Z',()=>terrainUI.history(true),!terrainUI.future.length);
    separator();add('地形を適用',()=>terrainUI.apply());add('地形編集を取り消す　Esc',()=>terrainUI.cancel());
  }else if(context.handle?.index>=0){
    selectedWaypoint={id:context.handle.id,index:context.handle.index};
    add('経由点 '+(context.handle.index+1)+' を削除　Delete',deleteSelected);
    add('経路の検査・自動生成',openRoutePlanner);
    add('経由点を追加',()=>setEditMode('route'));
  }else if(d){
    selectedWaypoint=null;
    add(d.group?'この群の設定':'ユニットの設定',()=>{if(d.group)openGroup(d.group.id);else{$('properties').scrollIntoView({block:'start'});$('unit-name').focus();}});
    add('担当タスクを編集',()=>behaviorUI.open());
    add((d.group??d.unit).enabled===false?'計算に使用する（有効化）':'計算から外す（無効化）',()=>setUnitEnabled(selected,(d.group??d.unit).enabled===false));separator();
    add('経路の検査・自動生成',openRoutePlanner);
    add('経由点を追加',()=>setEditMode('route'));
    add('周回経路を作成（中心 → 半径）',()=>setEditMode('circle-center'));
    add('初期位置を指定',()=>setEditMode('place'));
    add('複製して配置　Ctrl+D',()=>beginPlacement(d.unit.domain,d.group??d.unit));
    if(!d.group)add('この設定から群を作成',()=>openGroup());
    separator();add('選択対象へ移動　F',()=>view.focusSelected());add(d.group?'群を削除　Delete':'ユニットを削除　Delete',deleteSelected);
  }else{
    selectedWaypoint=null;
    for(const [domain,label] of [['subsurface','水中ユニットを配置'],['surface','水上ユニットを配置'],['air','航空ユニットを配置'],['ground','地上ユニットを配置']])add(label,()=>beginPlacement(domain));
    separator();add('地形を編集',()=>terrainUI.open());add('挙動を編集',()=>behaviorUI.open(null,true));
  }
  separator();add('全体を表示',()=>view.fit());
  if(!terrainUI.active)add(authoring?'配置編集を終了':'配置編集を開始',()=>{setEditMode(null);setAuthoring(!authoring);setEditMode(null);});
  mapMenu.open(context.x,context.y,items);
}
$('undo').addEventListener('click',()=>{
  if(!undo.length)return;redo.push(clone(scenario));const next=undo.pop();dirty=true;applyScenario(next,{
    message:'直前の編集を元に戻しました。'
  });
});
$('redo').addEventListener('click',()=>{
  if(!redo.length)return;undo.push(clone(scenario));const next=redo.pop();dirty=true;applyScenario(next,{
    message:'編集をやり直しました。'
  });
});
$('play').addEventListener('click',()=>{
  if(playing){
    pause();notify('一時停止しました。');return;
  }
  if(time>=scenario.duration){
    time=0;view.resetTrails();
  }
  setEditMode(null);setAuthoring(false);setEditMode(null);playing=true;$('play').textContent='Ⅱ 一時停止';notify('移動を実行しています。成功条件がある場合は探知結果も表示します。');
});
$('reset').addEventListener('click',()=>{
  pause();time=0;view.resetTrails();post();notify('時刻を初期位置へ戻しました。');
});
$('step').addEventListener('click',()=>{
  setAuthoring(false);setEditMode(null);time=Math.min(scenario.duration,time+60);post();
});
$('timeline').addEventListener('input',()=>{
  setAuthoring(false);setEditMode(null);time=Number($('timeline').value);post();
});
for(const [id,mode] of [['view3d','3d'],['viewtop','top']])$(id).addEventListener('click',()=>{
  view.setMode(mode);$('view3d').classList.toggle('active',mode==='3d');$('viewtop').classList.toggle('active',mode==='top');updateCaption();
});
$('fit').addEventListener('click',()=>view.fit());
function updateCaption(){
  $('view-caption').textContent=(view.mode==='top'?'真上':'3D')+' / 高さ表示 ×'+view.exaggeration;
}
$('exaggeration').addEventListener('change',()=>{
  view.setExaggeration(Number($('exaggeration').value));updateCaption();
});
$('show-labels').addEventListener('change',()=>view.setLabelsVisible($('show-labels').checked));
$('show-sensor').addEventListener('change',()=>{
  view.showSensor=$('show-sensor').checked;view.sensorRangeGroup.visible=view.showSensor;
});
$('show-water').addEventListener('change',()=>{
  view.showWater=$('show-water').checked;view.water.visible=view.showWater;
});
$('show-routes').addEventListener('change',()=>{
  view.showRoutes=$('show-routes').checked;view.routes.visible=view.showRoutes;
});
$('show-trails').addEventListener('change',()=>{
  view.showTrails=$('show-trails').checked;view.trails.visible=view.showTrails;post();
});
$('close-error').addEventListener('click',()=>$('error-dialog').close());
$('save').addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify(scenario,null,2)+'\n'],{
    type:'text/plain;charset=utf-8'
  }),url=URL.createObjectURL(blob),link=document.createElement('a');
  const name=scenario.title.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,100)||'scenario';
  link.href=url;link.download=name+'.txt';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);dirty=false;notify('シナリオを.txtで保存しました。初期配置・経路・設定を保存し、読み込み時は時刻0から再開します。');
});
$('load').addEventListener('click',()=>$('file').click());
$('file').addEventListener('change',async()=>{
  const file=$('file').files[0];if(!file)return;
  try {
    if(file.size>MAX_FILE_BYTES)throw new Error('ファイルは256MB以下にしてください。');
    const parsed=JSON.parse(await file.text()),restored=parsed.type==='SimSim-analysis'?restoreAnalysisResult(parsed):null;
    if(parsed.type==='SimSim-recording'&&(parsed.version!==2||parsed.model!==RECORD_MODEL))throw Error('旧版の記録は元の版で開いてください。');
    const recording=parsed.type==='SimSim-recording'?parsed:null,next=restored?.source??importScenario(recording?.source??parsed);
    if(dirty&&!confirm('保存していない変更があります。ファイルを読み込みますか？'))return;
    setEditMode(null);applyScenario(next,{
      resetHistory:true,fit:true,recording,message:file.name+'を読み込みました。'
    });if(restored)analysisUI.loadResult(restored);
  }catch(error){
    showError(error.message);
  }
  finally{
    $('file').value='';
  }
});
async function loadDemo(initial=false,file='island-patrol-demo.txt') {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(new URL('../data/'+file,import.meta.url),{
      signal:controller.signal
    });
    if(!response.ok)throw new Error('サンプル取得: HTTP '+response.status);
    const next=importScenario(await response.json());
    if(!initial&&dirty&&!confirm('保存していない変更があります。サンプルへ戻しますか？'))return;
    setEditMode(null);
    applyScenario(next,{
      resetHistory:true,fit:true,message:'架空地形のサンプルを読み込みました。ユニットを選び、経路を編集できます。'
    });
    $('boot').hidden=true;
  }finally{
    clearTimeout(timer);
  }
}
document.addEventListener('load-response-demo',()=>loadDemo(false,'response-demo.txt').catch(error=>showError(error.message)));
document.addEventListener('load-island-demo',()=>loadDemo(false,'island-patrol-demo.txt').catch(error=>showError(error.message)));
document.addEventListener('load-parameter-demo',()=>loadDemo(false,'parameter-demo.txt').catch(error=>showError(error.message)));
document.addEventListener('load-detection-demo',()=>loadDemo(false,'detection-demo.txt').catch(error=>showError(error.message)));
$('sample-picker').addEventListener('change',()=>{
  const file=$('sample-picker').value;if(file)loadDemo(false,file).catch(error=>showError(error.message));$('sample-picker').value='';
});
window.addEventListener('keydown',event=>{
  if(document.querySelector('dialog[open]')||event.defaultPrevented)return;
  if(event.key==='Escape'){
    if(editMode==='shared-route'){
      event.preventDefault();behaviorUI.finishRoute();
    }else if(editMode==='shared-base'){
      event.preventDefault();behaviorUI.cancelPointPick();
    }
    view.cancelDrag();closeMapMenu();setEditMode(null);selectedWaypoint=null;
  }
  if(document.querySelector('dialog[open]'))return;
  if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){
    event.preventDefault();if(terrainUI.active)terrainUI.history(event.shiftKey);else $(event.shiftKey?'redo':'undo').click();
  }
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){
    event.preventDefault();if(terrainUI.active)terrainUI.history(true);else $('redo').click();
  }
  if(terrainUI.active)return;
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='d'){
    event.preventDefault();const d=definition(scenario,selected);if(d)beginPlacement(d.unit.domain,d.group??d.unit);
  }
  if(event.key.toLowerCase()==='f'){
    event.preventDefault();view.focusSelected();
  }
  if(event.key==='Delete'||event.key==='Backspace'){
    event.preventDefault();deleteSelected();
  }
  if(event.code==='Space'&&(event.ctrlKey||event.metaKey)){
    event.preventDefault();if(!terrainUI.active)$('play').click();
  }
});
window.addEventListener('beforeunload',event=>{
  if(dirty){
    event.preventDefault();event.returnValue='';
  }
});
let previous=performance.now(),lastPost=0;
function frame(now) {
  const elapsed=Math.min(.5,(now-previous)/1000);
  previous=now;
  if(playing&&scenario){
    time=Math.min(scenario.duration,time+elapsed*Number($('speed').value));
    if(now-lastPost>80||time>=scenario.duration){
      post();
      lastPost=now;
    }
    if(time>=scenario.duration){
      pause();
      notify('指定した終了時刻に到達しました。');
    }
  }
  view.render();
  requestAnimationFrame(frame);
}
await loadDemo(true);
requestAnimationFrame(frame);
