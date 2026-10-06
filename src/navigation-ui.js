import {navigationErrors} from './navigation.js?v=20261006-four-panes-16';
import {generateRoute,inspectRoute} from './route-planner.js?v=20261006-four-panes-16';
import {requireElement} from './ui-dom.js?v=20261006-four-panes-16';
const $=requireElement;
export class NavigationUI{
  constructor({getDraft,getUnit,remember,render,pickRoute,pickPoint,commitRoute}){
    Object.assign(this,{getDraft,getUnit,remember,render,pickRoute,pickPoint,commitRoute});this.dialog=$('navigation-dialog');
  }
  bind(){
    $('navigation-save').onclick=()=>this.save();
    $('navigation-resource').onchange=()=>{
      this.existing=this.getDraft()[this.key].find(item=>item.id===$('navigation-resource').value);
      this.item=structuredClone(this.existing??this.newItem);this.fields();
    };
    $('navigation-delete').onclick=()=>this.remove();
    for(const id of ['navigation-close','navigation-cancel'])$(id).onclick=()=>this.dialog.close();
    $('navigation-kind').onchange=()=>{this.item.name=$('navigation-name').value.trim();this.item.kind=$('navigation-kind').value;this.fields();};
    $('navigation-draw').onclick=()=>{try{this.collect(false);this.oldPoints=structuredClone(this.item.points??[]);this.item.points=[];this.dialog.close();this.pickRoute();}catch(e){this.error(e.message);}};
    $('navigation-pick').onclick=()=>{this.collect(false);this.dialog.close();this.pickPoint();};
    $('navigation-domain').onchange=()=>this.heightField();
    $('navigation-via-current').onclick=()=>{try{this.collect();this.seedVia(true);}catch(e){this.error(e.message);}};
    $('navigation-inspect').onclick=()=>this.inspect();
    $('navigation-generate').onclick=()=>this.generate();
  }
  open(kind,id,preset,onSave){
    this.bind();this.kind=kind;this.key=kind==='route'?'routes':'destinations';this.onSave=onSave;
    const items=this.getDraft()[this.key]??[];this.existing=items.find(item=>item.id===id);
    let index=1;while(items.some(item=>item.id===kind+'-'+index))index++;
    const unit=this.getUnit(),point={...(unit?.initial??{x:0,y:0,z:0})};
    this.newItem={id:kind+'-'+index,name:(kind==='route'?'経路':'目的地')+index,...(kind==='route'?{points:[],mode:'once'}:{kind:'point',point}),...preset};
    this.item=structuredClone(this.existing??this.newItem);
    this.fields();this.dialog.showModal();
  }
  fields(){
    $('navigation-title').textContent=this.kind==='route'?'経路の作成・編集':'目的地の作成・編集';
    const resources=$('navigation-resource');resources.replaceChildren(new Option('新しく作る',''));
    for(const item of this.getDraft()[this.key]??[])resources.append(new Option(item.name,item.id));resources.value=this.existing?.id??'';
    $('navigation-name').value=this.item.name;
    $('navigation-route-fields').hidden=this.kind!=='route';$('navigation-destination-fields').hidden=this.kind!=='destination';
    $('navigation-mode').value=this.item.mode??'once';
    $('navigation-points').value=(this.item.points??[]).map(p=>[p.x,p.y,p.z].join(', ')).join('\n');
    $('navigation-kind').value=this.item.kind??'point';
    $('navigation-point-fields').hidden=this.item.kind!=='point';$('navigation-unit-field').hidden=this.item.kind!=='unit';
    const unit=$('navigation-unit');unit.replaceChildren(new Option('ユニットを選択してください',''));
    for(const u of this.getDraft().units)unit.append(new Option(u.name,u.id));unit.value=this.item.unitId??'';
    for(const axis of ['x','y','z'])$('navigation-'+axis).value=(this.item.point?.[axis]??0)/(axis==='z'?1:1000);
    $('navigation-domain').disabled=false;
    $('navigation-domain').value=this.item.navigation?.domain??this.getUnit()?.domain??'surface';
    $('navigation-clearance').value=this.item.navigation?.clearance??0;
    $('navigation-height').value=this.item.points?.[0]?.z??this.getUnit()?.initial?.z??0;
    this.heightField();this.seedVia();$('navigation-inspection').textContent='';
    $('navigation-resource').disabled=!!this.commitRoute;$('navigation-delete').hidden=!!this.commitRoute||!this.existing;
    $('navigation-draw').hidden=!!this.commitRoute;
    $('navigation-save').textContent=this.commitRoute?'経路を保存':'保存して選択';$('navigation-error').hidden=true;
  }
  collect(points=true){
    this.item.name=$('navigation-name').value.trim();
    if(this.kind==='route'){
      this.item.mode=$('navigation-mode').value;
      this.item.navigation={domain:$('navigation-domain').value,clearance:this.number('navigation-clearance')};
      if(points)this.item.points=$('navigation-points').value.trim()?$('navigation-points').value.trim().split(/\n+/).map(line=>{
        const values=line.trim().split(/[,\s]+/).map(Number);if(values.length!==3||values.some(v=>!Number.isFinite(v)))throw Error('経路は一行に東西・南北・高度の3つの数値を指定してください。');
        return {x:values[0],y:values[1],z:values[2]};
      }):[];
    }else{
      this.item.kind=$('navigation-kind').value;
      if(this.item.kind==='unit'){this.item.unitId=$('navigation-unit').value;delete this.item.point;}
      else if(this.item.kind==='point'){this.item.point=Object.fromEntries(['x','y','z'].map(axis=>{
        const raw=$('navigation-'+axis).value;if(!raw.trim()||!Number.isFinite(Number(raw)))throw Error('地点の東西・南北・高さを数値で指定してください。');
        return [axis,Number(raw)*(axis==='z'?1:1000)];
      }));delete this.item.unitId;}
      else{delete this.item.point;delete this.item.unitId;}
    }
  }
  error(message){$('navigation-error').hidden=false;$('navigation-error').textContent=message;}
  save(){
    try{
      this.collect();
      const draft=this.getDraft(),items=(draft[this.key]??[]).filter(item=>item.id!==this.item.id),next=[...items,this.item];
      const errors=navigationErrors(this.commitRoute?{...draft,routes:[this.item],destinations:[]}:{...draft,[this.key]:next});if(errors.length)throw Error(errors.join('\n'));
      if(this.commitRoute){this.commitRoute(structuredClone(this.item));this.dialog.close();return;}
      this.remember();draft[this.key]=next;this.onSave?.(this.item.id);this.dialog.close();this.render();
    }catch(e){this.error(e.message);}
  }
  remove(){
    const draft=this.getDraft(),field=this.kind==='route'?'routeId':'destinationId';
    if(draft.behaviors.some(g=>g.parameters?.some(p=>p.type===this.kind&&p.default===this.item.id))||draft.behaviorAssignments.some(a=>{const g=draft.behaviors.find(g=>g.id===a.behaviorId);return g?.parameters?.some(p=>p.type===this.kind&&a.parameters?.[p.id]===this.item.id);})||draft.behaviors.some(g=>[...g.nodes,...g.edges,...g.triggers].some(n=>n[field]===this.item.id))){this.error('ノードまたは遷移条件で使用中です。参照先を変更してから削除してください。');return;}
    this.remember();draft[this.key]=draft[this.key].filter(item=>item.id!==this.item.id);this.dialog.close();this.render();
  }

  number(id){const raw=$(id).value;if(!raw.trim()||!Number.isFinite(Number(raw)))throw Error('高度・深度と余裕を数値で指定してください。');return Number(raw);}
  heightField(){$('navigation-height').disabled=['ground','surface'].includes($('navigation-domain').value);}
  seedVia(all=false){const points=this.item.points?.length?this.item.points:[this.getUnit()?.initial].filter(Boolean),anchors=all||points.length<3?points:this.item.mode==='loop'?[points[0],points[Math.floor(points.length/2)],points.at(-1)]:[points[0],points.at(-1)];$('navigation-via').value=anchors.map(p=>[p.x,p.y].join(', ')).join('\n');}
  inspect(){
    try{this.collect();const errors=navigationErrors({...this.getDraft(),routes:[this.item],destinations:[]});if(errors.length)throw Error(errors.join('\n'));
      const result=inspectRoute(this.getDraft().terrain,this.item.points,this.item.navigation,{loop:this.item.mode==='loop'});
      $('navigation-error').hidden=true;
      $('navigation-inspection').textContent=result.ok?'全区間で地形・余裕の条件を満たしています。':result.issues.map(i=>'区間 '+(i.segment+1)+'：'+i.reason).join('\n');
      $('navigation-inspection').dataset.issues=result.issues.length;
    }catch(e){this.error(e.message);}
  }
  generate(){
    try{
      this.collect(false);
      const via=$('navigation-via').value.trim().split(/\n+/).filter(Boolean).map(line=>{const values=line.trim().split(/[,\s]+/).map(Number);if(values.length!==2||values.some(v=>!Number.isFinite(v)))throw Error('必須地点は一行に東西・南北の2つの数値を指定してください。');return {x:values[0],y:values[1]};});
      const request={...this.item.navigation,via,height:this.number('navigation-height')};
      const result=generateRoute(this.getDraft().terrain,request,{mode:this.item.mode});
      Object.assign(this.item,result);$('navigation-points').value=result.points.map(p=>[p.x,p.y,p.z].join(', ')).join('\n');
      this.inspect();$('navigation-inspection').textContent='生成した '+result.points.length+'点を検査済みです。座標を編集して保存できます。';
    }catch(e){this.error(e.message);}
  }
  addPoint(point){this.item.points.push({...point});return this.item.points.length;}
  finishRoute(){
    if(this.item.points.length<2)this.item.points=this.oldPoints;
    this.fields();this.dialog.showModal();
  }
  setPoint(point){this.item.point={...point};this.fields();this.dialog.showModal();}
}
