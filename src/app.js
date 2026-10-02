import {restoreAnalysisResult} from './detection.js?v=0.3';
import {AnalysisUI} from './analysis-ui.js?v=0.3';
import {MapView} from './view.js?v=0.3';
import {Simulation, Terrain, DOMAIN_NAMES, validateScenario, clone, MAX_UNITS} from './engine.js?v=0.3';

const motionFields=[['motion-horizontal','horizontal',1,0],['motion-vertical','vertical',1,0],['motion-scale','scale',1,2000],['motion-delay','startDelay',1,0],['motion-speed','speedVariation',100,0]];
const $=id=>document.getElementById(id);
const FACTION_NAMES={friendly:'味方',hostile:'相手側',neutral:'中立'};
const SYMBOLS={ground:'■',surface:'◆',subsurface:'●',air:'▲'};
const STATUS_NAMES={idle:'待機',moving:'移動中',arrived:'経路完了',blocked:'地形制約で停止',waiting:'出発待ち'};
let scenario,model,snapshot,selected=null,playing=false,time=0,revision=0,request=0,lastAccepted=0,editMode=null,dirty=false;
const undo=[],redo=[];
const worker=new Worker(new URL('./worker.js?v=0.3',import.meta.url),{type:'module',name:'SimSim simulation'});
let workerReady=false;
const timeout=setTimeout(()=>{if(!workerReady)showError('計算Workerの応答がありません。src/worker.jsとsrc/engine.jsの配信・MIMEタイプを確認してください。');},12000);
worker.onerror=event=>{event.preventDefault();pause();clearTimeout(timeout);showError('計算Workerの起動・実行に失敗しました。\n'+(event.message||'F12のConsoleを確認してください。'));};
worker.onmessage=({data})=>{
  if(data.revision!==revision)return;
  if(data.type==='error'){pause();showError(data.message);return;}
  if(data.request<lastAccepted)return;
  lastAccepted=data.request;workerReady=true;clearTimeout(timeout);snapshot=data.snapshot;
  view.updateSnapshot(snapshot);updateTelemetry();updateClock();analysisUI.onSnapshot();
};
const view=new MapView($('map'),{
  onSelect:id=>select(id),
  onMapClick:point=>{
    const unit=currentUnit();if(!unit)return;
    const checked=model.terrain.project(point,unit.domain);
    if(checked.error){notify(checked.error,true);return;}
    commit(next=>{
      const target=next.units.find(u=>u.id===selected);
      if(editMode==='place')target.initial={...checked.point};
      else target.route.push({...checked.point});
    },editMode==='place'?'初期位置を変更しました。':'経由点を追加しました。');
    if(editMode==='place')setEditMode(null);
  },
  onHover:point=>{$('cursor-position').textContent=point?'x '+(point.x/1000).toFixed(2)+' km / y '+(point.y/1000).toFixed(2)+' km':'';}
});

const analysisUI=new AnalysisUI({getScenario:()=>scenario,getSnapshot:()=>snapshot,commit:(next,message)=>commit(target=>{for(const key of Object.keys(target))delete target[key];Object.assign(target,next);},message),showError,notify,
  replay:(next,message)=>{const previous=clone(scenario);applyScenario(next,{keepResults:true,message});undo.push(previous);if(undo.length>25)undo.shift();redo.length=0;dirty=true;updateUndo();const target=model.scenario.units.find(u=>u.faction===next.mission?.targetFaction);if(target)select(target.id);},
  seek:(value,id)=>{pause();if(id)select(id);time=Math.max(0,Math.min(scenario.duration,value));post();}
});
function renderSensor(prefix,unit) {
  const s=unit.sensor??{enabled:false,range:1000,probabilityPerMinute:.5,domains:['ground','surface','subsurface','air'],terrainLOS:false,mountHeight:2};
  $(prefix+'-sensor-enabled').checked=s.enabled;$(prefix+'-sensor-range').value=s.range/1000;$(prefix+'-sensor-probability').value=s.probabilityPerMinute*100;$(prefix+'-sensor-los').checked=s.terrainLOS;$(prefix+'-sensor-height').value=s.mountHeight??(unit.domain==='ground'?2:0);$(prefix+'-detectability').value=unit.detectability??1;
  for(const domain of ['ground','surface','subsurface','air'])$(prefix+'-sensor-'+domain).checked=s.domains.includes(domain);
}
function readSensor(prefix) {return {enabled:$(prefix+'-sensor-enabled').checked,range:Number($(prefix+'-sensor-range').value)*1000,probabilityPerMinute:Number($(prefix+'-sensor-probability').value)/100,domains:['ground','surface','subsurface','air'].filter(d=>$(prefix+'-sensor-'+d).checked),terrainLOS:$(prefix+'-sensor-los').checked,mountHeight:Number($(prefix+'-sensor-height').value)};}
for(const input of document.querySelectorAll('[id^="unit-sensor-"],#unit-detectability'))input.addEventListener('change',()=>{
  if(!currentUnit()||currentUnit().groupId)return;
  if(!input.checkValidity()||(input.type==='number'&&input.value==='')){renderInspector();return;}
  commit(next=>{const u=next.units.find(u=>u.id===selected);u.sensor={...u.sensor,...readSensor('unit')};u.detectability=Number($('unit-detectability').value);},'探知設定を変更しました。');
});

function notify(message,warning=false){$('notice').textContent=message;$('notice').classList.toggle('warning',warning);}
function showError(message){$('error-text').textContent=message;if(!$('error-dialog').open)$('error-dialog').showModal();}
function currentUnit(){return model?.scenario.units.find(u=>u.id===selected);}
function post(type='seek'){worker.postMessage({type,revision,request:++request,time,scenario:type==='scenario'?scenario:undefined});}
function pause(){playing=false;$('play').textContent='▶ 再生';}
function applyScenario(next,{resetHistory=false,fit=false,message='シナリオを更新しました。',keepResults=false}={}) {
  const checked=validateScenario(next),compiled=new Simulation(checked);
  scenario=checked;model=compiled;pause();time=0;revision++;lastAccepted=0;
  if(resetHistory){undo.length=0;redo.length=0;dirty=false;}
  if(!model.scenario.units.some(u=>u.id===selected))selected=model.scenario.units[0]?.id||null;
  snapshot=model.evaluate(0);view.setScenario(model.scenario,selected,model);view.updateSnapshot(snapshot);
  if(fit)view.fit();
  $('seed').value=scenario.seed??'SimSim';$('trial').value=scenario.trial??0;
  $('title').value=scenario.title;$('duration').value=+(scenario.duration/60).toFixed(3);
  $('timeline').max=scenario.duration;$('duration-label').textContent=+(scenario.duration/60).toFixed(1)+'分';
  const t=scenario.terrain;$('terrain-info').textContent=((t.columns-1)*t.spacing/1000).toFixed(0)+' × '+((t.rows-1)*t.spacing/1000).toFixed(0)+' km · 格子 '+t.spacing+' m';
  document.querySelector('.map-title').textContent=scenario.title;
  analysisUI.onScenario({keepResults});analysisUI.onSnapshot();renderUnits();renderInspector();updateClock();updateTelemetry();updateUndo();setEditMode(editMode&&selected?editMode:null);post('scenario');
  const invalid=snapshot.units.filter(u=>u.error).length;
  notify(message+(invalid?' 地形制約のある経路: '+invalid+'件。対象ユニットの設定欄で理由を確認できます。':''),invalid>0);
}
function commit(mutate,message) {
  const next=clone(scenario);mutate(next);
  try{validateScenario(next);}catch(error){showError(error.message);renderInspector();return false;}
  if(JSON.stringify(next)===JSON.stringify(scenario))return false;
  const previous=clone(scenario);
  try{applyScenario(next,{message:message+' 時刻を初期位置へ戻しました。'});}catch(error){showError(error.message);return false;}
  undo.push(previous);if(undo.length>25)undo.shift();redo.length=0;dirty=true;updateUndo();return true;
}
function updateUndo(){$('undo').disabled=!undo.length;$('redo').disabled=!redo.length;}
function select(id){selected=id;setEditMode(null);view.setSelected(id);renderUnits({selectionOnly:true});renderInspector();updateTelemetry();}
function renderUnits({selectionOnly=false}={}) {
  $('group-add').disabled=!currentUnit()||!!currentUnit().groupId;
  const list=$('unit-list'),scrollTop=list.scrollTop,scrollLeft=list.scrollLeft;
  // Keep existing buttons and their focus when selecting an already listed unit.
  if(selectionOnly && [...list.children].some(button=>button.dataset.id===selected)) {
    for(const button of list.children)button.classList.toggle('selected',button.dataset.id===selected);
    return;
  }
  $('unit-count').textContent=model.scenario.units.length;$('unit-list').replaceChildren();
  const query=$('unit-search').value.toLowerCase();
  const matches=model.scenario.units.filter(u=>(u.name+' '+u.id).toLowerCase().includes(query));
  const visible=matches.slice(0,80);const chosen=matches.find(u=>u.id===selected);if(chosen&&!visible.includes(chosen))visible.push(chosen);
  $('list-summary').textContent=matches.length>80?'一致 '+matches.length+'個 · 先頭80個と選択中を表示':'一致 '+matches.length+'個';
  $('group-list').replaceChildren();
  for(const group of scenario.groups??[]) {
    const b=document.createElement('button');b.className='group-item';b.textContent=group.name+' · '+group.count+'個 · 編集';b.dataset.group=group.id;b.addEventListener('click',()=>openGroup(group.id));$('group-list').append(b);
  }
  for(const unit of visible) {
    const button=document.createElement('button');button.className='unit-item'+(unit.id===selected?' selected':'');button.dataset.id=unit.id;
    const symbol=document.createElement('span');symbol.className='unit-symbol '+unit.faction;symbol.textContent=SYMBOLS[unit.domain];
    const description=document.createElement('span'),name=document.createElement('strong'),detail=document.createElement('small');
    name.textContent=unit.name;detail.textContent=DOMAIN_NAMES[unit.domain]+' · '+(unit.manned?'有人':'無人')+' · '+Math.round(unit.speed*3.6)+' km/h';
    description.append(name,detail);button.append(symbol,description);button.addEventListener('click',()=>select(unit.id));$('unit-list').appendChild(button);
  }
  // Map selection can add a member beyond the first 80. Retain the user's viewport.
  if(selectionOnly){list.scrollTop=scrollTop;list.scrollLeft=scrollLeft;}
}
function renderInspector() {
  const unit=currentUnit();$('properties').hidden=!unit;$('empty-selection').hidden=!!unit;$('delete').disabled=!unit;
  if(!unit)return;
  $('definition-fields').disabled=!!unit.groupId;$('generated-note').hidden=!unit.groupId;$('edit-selected-group').hidden=!unit.groupId;$('delete').disabled=!!unit.groupId;
  const m=unit.motion??{};for(const [id,key,factor,def] of motionFields)$(id).value=(m[key]??def)*factor;
  renderSensor('unit',unit);
  $('unit-name').value=unit.name;$('unit-domain').value=unit.domain;$('unit-faction').value=unit.faction;$('unit-manned').value=String(unit.manned);
  $('unit-speed').value=+(unit.speed*3.6).toFixed(2);$('unit-x').value=+(unit.initial.x/1000).toFixed(3);$('unit-y').value=+(unit.initial.y/1000).toFixed(3);
  const projected=model.terrain.project(unit.initial,unit.domain).point;
  $('height-label').textContent=unit.domain==='subsurface'?'深度（海面下 m）':unit.domain==='ground'?'地表標高（m・自動）':unit.domain==='surface'?'海面標高（m・自動）':'高度（海面基準 m）';
  $('unit-height').value=+(unit.domain==='subsurface'?scenario.terrain.seaLevel-unit.initial.z:projected.z).toFixed(1);
  $('unit-height').disabled=['ground','surface'].includes(unit.domain);
  $('unit-height').min=unit.domain==='subsurface'?'1':'-12000';$('unit-height').max=unit.domain==='subsurface'?'12000':'30000';
  $('route-mode').value=unit.routeMode;$('route-count').textContent=unit.route.length+'点';$('route-table').replaceChildren();
  if(unit.route.length) {
    const head=document.createElement('div');head.className='route-table-head';
    for(const text of ['#','x / 東西','y / 南北','']){const span=document.createElement('span');span.textContent=text;head.append(span);} $('route-table').append(head);
  }
  unit.route.forEach((point,index)=>{
    const row=document.createElement('div');row.className='waypoint';
    const number=document.createElement('span');number.textContent=index+1;row.append(number);
    for(const key of ['x','y']) {
      const input=document.createElement('input');input.type='number';input.step='.1';input.value=+(point[key]/1000).toFixed(3);input.setAttribute('aria-label','経由点'+(index+1)+' '+key+' km');
      input.addEventListener('change',()=>{if(input.value===''||!input.checkValidity()){renderInspector();return;}commit(next=>next.units.find(u=>u.id===selected).route[index][key]=Number(input.value)*1000,'経由点を変更しました。');});row.append(input);
    }
    const remove=document.createElement('button');remove.textContent='×';remove.title='経由点'+(index+1)+'を削除';remove.addEventListener('click',()=>commit(next=>next.units.find(u=>u.id===selected).route.splice(index,1),'経由点を削除しました。'));row.append(remove);$('route-table').append(row);
  });
  $('clear-route').disabled=!unit.route.length;
}
function updateTelemetry() {
  const state=snapshot?.units.find(u=>u.id===selected);if(!state)return;
  const detection=snapshot?.mission?.events.find(e=>e.targetId===selected);$('state-detection').textContent=detection?'探知 '+(detection.time/60).toFixed(1)+'分':snapshot?.mission?'未探知':'—';
  $('state-motion').textContent=(state.actualSpeed*3.6).toFixed(1)+' km/h / '+state.startDelay.toFixed(1)+' s';
  $('state-status').textContent=STATUS_NAMES[state.status];$('state-position').textContent=(state.position.x/1000).toFixed(2)+' / '+(state.position.y/1000).toFixed(2)+' km';
  $('state-height').textContent=state.position.z<scenario.terrain.seaLevel?'深度 '+(scenario.terrain.seaLevel-state.position.z).toFixed(0)+' m':state.position.z.toFixed(0)+' m';
  $('state-distance').textContent=(state.distance/1000).toFixed(2)+' km';$('state-route').textContent=(state.routeDistance/1000).toFixed(2)+' km';
  $('unit-warning').hidden=!state.error;$('unit-warning').textContent=state.error?(state.errorAt+'：'+state.error+'\n到達可能な区間まで移動し、その地点で停止します。'):'';
}
function updateClock() {
  const seconds=Math.floor(snapshot?.time??time);$('clock').textContent=[Math.floor(seconds/3600),Math.floor(seconds%3600/60),seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
  if(document.activeElement!==$('timeline'))$('timeline').value=snapshot?.time??time;
}
function setEditMode(mode) {
  if(currentUnit()?.groupId)mode=null;
  editMode=mode;view.setEditMode(mode);$('map').classList.toggle('editing',!!mode);
  $('place').classList.toggle('active',mode==='place');$('route-edit').classList.toggle('active',mode==='route');
  $('place').textContent=mode==='place'?'指定を終了':'地図で初期位置を指定';$('route-edit').textContent=mode==='route'?'✓ 経由点の追加を終了':'＋ 地図で経由点を追加';
  $('map-instruction').textContent=mode==='place'?'初期位置にする地点をクリック · Escで終了':mode==='route'?'経由点を順にクリック · Escで終了 · 右ドラッグで移動':'クリックで選択 · ドラッグで回転 · 右ドラッグで移動 · ホイールで拡大';
}
function bindUnit(id,mutate,message) {
  $(id).addEventListener('change',()=>{const input=$(id);if(!currentUnit()||currentUnit().groupId)return;if(input.value===''||!input.checkValidity()){renderInspector();return;}commit(next=>mutate(next.units.find(u=>u.id===selected),input.value),message);});
}
bindUnit('unit-name',(u,value)=>u.name=value.trim(),'名称を変更しました。');
bindUnit('unit-faction',(u,value)=>u.faction=value,'陣営を変更しました。');
bindUnit('unit-manned',(u,value)=>u.manned=value==='true','運用区分を変更しました。');
bindUnit('unit-speed',(u,value)=>u.speed=Number(value)/3.6,'速度を変更しました。');
bindUnit('unit-x',(u,value)=>u.initial.x=Number(value)*1000,'初期位置を変更しました。');
bindUnit('unit-y',(u,value)=>u.initial.y=Number(value)*1000,'初期位置を変更しました。');
bindUnit('unit-height',(u,value)=>{const height=u.domain==='subsurface'?scenario.terrain.seaLevel-Number(value):Number(value);u.initial.z=height;u.route.forEach(p=>p.z=height);},'高度・深度を変更しました。');
bindUnit('route-mode',(u,value)=>u.routeMode=value,'経路の繰り返しを変更しました。');
bindUnit('unit-domain',(u,value)=>{
  u.domain=value;const z=value==='subsurface'?scenario.terrain.seaLevel-120:value==='air'?scenario.terrain.seaLevel+1500:scenario.terrain.seaLevel;
  u.initial.z=z;u.route.forEach(p=>p.z=z);
},'領域を変更しました。');
for(const [id,key,factor] of motionFields)bindUnit(id,(u,v)=>{u.motion??={};u.motion[key]=Number(v)/factor;},'航跡のばらつきを変更しました。');
$('unit-search').addEventListener('input',renderUnits);
for(const id of ['seed','trial'])$(id).addEventListener('change',()=>{if(!$(id).checkValidity()){applyScenario(scenario);return;}commit(next=>next[id]=id==='trial'?Number($(id).value):$(id).value,'試行設定を変更しました。');});
$('next-trial').addEventListener('click',()=>commit(next=>next.trial=(next.trial??0)+1,'次の試行を生成しました。'));
let editingGroup=null;
function openGroup(id=null) {
  pause();setEditMode(null);editingGroup=id;
  const g=scenario.groups?.find(g=>g.id===id),u=g?.template??currentUnit();
  if(!u){notify('ひな型にするユニットを選択してください。',true);return;}
  const select=$('group-template');select.replaceChildren();
  if(g){const option=new Option('保存済みのひな型: '+g.template.name,'saved');select.append(option);}
  for(const base of scenario.units)select.append(new Option(base.name,base.id));
  select.value=g?'saved':scenario.units.some(b=>b.id===u.id)?u.id:scenario.units[0]?.id;
  $('group-dialog-title').textContent=g?'群を編集':'群を作る';$('group-remove').hidden=!g;
  $('group-name').value=g?.name??u.name+'群';$('group-count').value=g?.count??100;$('group-placement').value=g?.placement??'random';
  $('group-width').value=(g?.width??1000)/1000;$('group-height').value=(g?.height??1000)/1000;
  renderSensor('group',u);
  const m=g?.template.motion??u.motion??{};
  for(const [input,key,factor,def] of groupMotionFields)$(input).value=(m[key]??def)*factor;
  $('group-dialog').showModal();
}
const groupMotionFields=[['group-horizontal','horizontal',1,200],['group-common','commonHorizontal',1,0],['group-vertical','vertical',1,0],['group-scale','scale',1,2000],['group-delay','startDelay',1,0],['group-speed','speedVariation',100,0]];
$('group-add').addEventListener('click',()=>openGroup());
$('edit-selected-group').addEventListener('click',()=>openGroup(currentUnit()?.groupId));
$('group-cancel').addEventListener('click',()=>$('group-dialog').close());
$('group-remove').addEventListener('click',()=>{if(commit(next=>next.groups=next.groups.filter(g=>g.id!==editingGroup),'群を削除しました。'))$('group-dialog').close();});
$('group-form').addEventListener('submit',event=>{
  event.preventDefault();if(!$('group-form').reportValidity())return;
  const old=scenario.groups?.find(g=>g.id===editingGroup);
  const source=$('group-template').value==='saved'?old?.template:scenario.units.find(u=>u.id===$('group-template').value);
  if(!source){showError('ひな型が見つかりません。');return;}
  const template=clone(source);template.sensor={...template.sensor,...readSensor('group')};template.detectability=Number($('group-detectability').value);template.motion={...template.motion};for(const [input,key,factor] of groupMotionFields)template.motion[key]=Number($(input).value)/factor;
  const g={...(old??{}),id:old?.id??'group-'+Date.now().toString(36),name:$('group-name').value.trim(),count:Number($('group-count').value),placement:$('group-placement').value,width:Number($('group-width').value)*1000,height:Number($('group-height').value)*1000,template};
  const ok=commit(next=>{next.groups??=[];const i=next.groups.findIndex(item=>item.id===g.id);if(i<0)next.groups.push(g);else next.groups[i]=g;},'群を生成しました。');
  if(ok||JSON.stringify(old)===JSON.stringify(g))$('group-dialog').close();
});
$('title').addEventListener('change',()=>{if(!$('title').value.trim()){$('title').value=scenario.title;return;}commit(next=>next.title=$('title').value.trim(),'シナリオ名を変更しました。');});
$('duration').addEventListener('change',()=>{if(!$('duration').checkValidity()||!$('duration').value){$('duration').value=scenario.duration/60;return;}commit(next=>{next.duration=Number($('duration').value)*60;if(next.mission)next.mission.deadline=Math.min(next.mission.deadline,next.duration);},'終了時刻を変更しました。');});
$('place').addEventListener('click',()=>{pause();setEditMode(editMode==='place'?null:'place');});
$('route-edit').addEventListener('click',()=>{pause();setEditMode(editMode==='route'?null:'route');});
$('clear-route').addEventListener('click',()=>commit(next=>next.units.find(u=>u.id===selected).route=[],'経由点を削除しました。'));
$('delete').addEventListener('click',()=>{const name=currentUnit().name;commit(next=>next.units=next.units.filter(u=>u.id!==selected),name+'を削除しました。');setEditMode(null);});
$('add').addEventListener('click',()=>{
  if(model.scenario.units.length>=MAX_UNITS){showError('単体＋群の上限は2000ユニットです。');return;}
  const domain=$('template').value,terrain=model.terrain,t=scenario.terrain;
  let point=null;
  for(let y=0;y<t.rows&&!point;y++)for(let x=0;x<t.columns&&!point;x++) {
    const candidate={x:t.origin.x+x*t.spacing,y:t.origin.y+y*t.spacing,z:domain==='air'?t.seaLevel+1500:domain==='subsurface'?t.seaLevel-120:t.seaLevel};
    if(!terrain.project(candidate,domain).error)point=terrain.project(candidate,domain).point;
  }
  if(!point){showError('この地形に、指定領域のユニットを置ける地点が見つかりません。');return;}
  const id='unit-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6);selected=id;
  commit(next=>next.units.push({id,name:DOMAIN_NAMES[domain]+'ユニット '+(next.units.length+1),domain,kind:'generic',faction:'friendly',manned:domain!=='subsurface',speed:({ground:20,surface:40,subsurface:14,air:180}[domain])/3.6,initial:point,route:[],routeMode:'once',components:[]}), 'ユニットを追加しました。');
  setEditMode('place');
});
$('undo').addEventListener('click',()=>{if(!undo.length)return;redo.push(clone(scenario));const next=undo.pop();dirty=true;applyScenario(next,{message:'直前の編集を元に戻しました。'});});
$('redo').addEventListener('click',()=>{if(!redo.length)return;undo.push(clone(scenario));const next=redo.pop();dirty=true;applyScenario(next,{message:'編集をやり直しました。'});});
$('play').addEventListener('click',()=>{
  if(playing){pause();notify('一時停止しました。');return;}
  if(time>=scenario.duration){time=0;view.resetTrails();}
  setEditMode(null);playing=true;$('play').textContent='Ⅱ 一時停止';notify('移動を実行しています。成功条件がある場合は探知結果も表示します。');
});
$('reset').addEventListener('click',()=>{pause();time=0;view.resetTrails();post();notify('時刻を初期位置へ戻しました。');});
$('step').addEventListener('click',()=>{pause();time=Math.min(scenario.duration,time+60);post();});
$('timeline').addEventListener('input',()=>{pause();time=Number($('timeline').value);post();});
for(const [id,mode] of [['view3d','3d'],['viewtop','top']])$(id).addEventListener('click',()=>{view.setMode(mode);$('view3d').classList.toggle('active',mode==='3d');$('viewtop').classList.toggle('active',mode==='top');updateCaption();});
$('fit').addEventListener('click',()=>view.fit());
function updateCaption(){$('view-caption').textContent=(view.mode==='top'?'真上':'3D')+' / 高さ表示 ×'+view.exaggeration;}
$('exaggeration').addEventListener('change',()=>{view.setExaggeration(Number($('exaggeration').value));updateCaption();});
$('show-sensor').addEventListener('change',()=>{view.showSensor=$('show-sensor').checked;view.sensorRangeGroup.visible=view.showSensor;});
$('show-water').addEventListener('change',()=>{view.showWater=$('show-water').checked;view.water.visible=view.showWater;});
$('show-routes').addEventListener('change',()=>{view.showRoutes=$('show-routes').checked;view.routes.visible=view.showRoutes;});
$('show-trails').addEventListener('change',()=>{view.showTrails=$('show-trails').checked;view.trails.visible=view.showTrails;});
$('close-error').addEventListener('click',()=>$('error-dialog').close());
$('save').addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify(scenario,null,2)+'\n'],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  const name=scenario.title.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,100)||'scenario';
  link.href=url;link.download=name+'.jsn';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);dirty=false;notify('シナリオを.jsnで保存しました。初期配置・経路・設定を保存し、読み込み時は時刻0から再開します。');
});
$('load').addEventListener('click',()=>$('file').click());
$('file').addEventListener('change',async()=>{
  const file=$('file').files[0];if(!file)return;
  try {
    if(file.size>15*1024*1024)throw new Error('ファイルは15MB以下にしてください。');
    const parsed=JSON.parse(await file.text()),restored=parsed.type==='SimSim-analysis'?restoreAnalysisResult(parsed):null;
    const next=restored?.source??validateScenario(parsed);
    if(dirty&&!confirm('保存していない変更があります。ファイルを読み込みますか？'))return;
    setEditMode(null);applyScenario(next,{resetHistory:true,fit:true,message:file.name+'を読み込みました。'});if(restored)analysisUI.loadResult(restored);
  }catch(error){showError(error.message);}
  finally{$('file').value='';}
});
async function loadDemo(initial=false,file='demo.jsn') {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(new URL('../data/'+file,import.meta.url),{signal:controller.signal});if(!response.ok)throw new Error('サンプル取得: HTTP '+response.status);
    const next=validateScenario(await response.json());
    if(!initial&&dirty&&!confirm('保存していない変更があります。サンプルへ戻しますか？'))return;
    setEditMode(null);applyScenario(next,{resetHistory:true,fit:true,message:'架空地形のサンプルを読み込みました。ユニットを選び、経路を編集できます。'});$('boot').hidden=true;
  }finally{clearTimeout(timer);}
}
document.addEventListener('load-detection-demo',()=>loadDemo(false,'detection-demo.jsn').catch(error=>showError(error.message)));
$('group-demo').addEventListener('click',()=>loadDemo(false,'group-demo.jsn').catch(error=>showError(error.message)));
$('demo').addEventListener('click',()=>loadDemo().catch(error=>showError(error.message)));
window.addEventListener('keydown',event=>{
  if(event.key==='Escape')setEditMode(null);
  if(document.querySelector('dialog[open]'))return;
  if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();$(event.shiftKey?'redo':'undo').click();}
  if(event.code==='Space'){event.preventDefault();$('play').click();}
});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
let previous=performance.now(),lastPost=0;
function frame(now) {
  const elapsed=Math.min(.5,(now-previous)/1000);previous=now;
  if(playing&&scenario){time=Math.min(scenario.duration,time+elapsed*Number($('speed').value));if(now-lastPost>80||time>=scenario.duration){post();lastPost=now;}if(time>=scenario.duration){pause();notify('指定した終了時刻に到達しました。');}}
  view.render();requestAnimationFrame(frame);
}
await loadDemo(true);requestAnimationFrame(frame);
