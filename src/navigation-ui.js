import {navigationErrors} from './navigation.js?v=20261005-terrain-pick-9';
import {requireElement} from './ui-dom.js?v=20261005-terrain-pick-9';
const $=requireElement;
export class NavigationUI{
  constructor({getDraft,getUnit,remember,render,pickRoute,pickPoint}){
    Object.assign(this,{getDraft,getUnit,remember,render,pickRoute,pickPoint});this.dialog=$('navigation-dialog');
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
  }
  open(kind,id,preset,onSave){
    this.kind=kind;this.key=kind==='route'?'routes':'destinations';this.onSave=onSave;
    const items=this.getDraft()[this.key]??=[];this.existing=items.find(item=>item.id===id);
    let index=1;while(items.some(item=>item.id===kind+'-'+index))index++;
    const unit=this.getUnit(),point={...(unit?.initial??{x:0,y:0,z:0})};
    this.newItem={id:kind+'-'+index,name:(kind==='route'?'経路':'目的地')+index,...(kind==='route'?{points:[],mode:'once'}:{kind:'point',point}),...preset};
    this.item=structuredClone(this.existing??this.newItem);
    this.fields();this.dialog.showModal();
  }
  fields(){
    $('navigation-title').textContent=this.kind==='route'?'経路の作成・編集':'目的地の作成・編集';
    const resources=$('navigation-resource');resources.replaceChildren(new Option('新しく作る',''));
    for(const item of this.getDraft()[this.key])resources.append(new Option(item.name,item.id));resources.value=this.existing?.id??'';
    $('navigation-name').value=this.item.name;
    $('navigation-route-fields').hidden=this.kind!=='route';$('navigation-destination-fields').hidden=this.kind!=='destination';
    $('navigation-mode').value=this.item.mode??'once';
    $('navigation-points').value=(this.item.points??[]).map(p=>[p.x,p.y,p.z].join(', ')).join('\n');
    $('navigation-kind').value=this.item.kind??'point';
    $('navigation-point-fields').hidden=this.item.kind!=='point';$('navigation-unit-field').hidden=this.item.kind!=='unit';
    const unit=$('navigation-unit');unit.replaceChildren(new Option('ユニットを選択してください',''));
    for(const u of this.getDraft().units)unit.append(new Option(u.name,u.id));unit.value=this.item.unitId??'';
    for(const axis of ['x','y','z'])$('navigation-'+axis).value=(this.item.point?.[axis]??0)/(axis==='z'?1:1000);
    $('navigation-delete').hidden=!this.existing;$('navigation-error').hidden=true;
  }
  collect(points=true){
    this.item.name=$('navigation-name').value.trim();
    if(this.kind==='route'){
      this.item.mode=$('navigation-mode').value;
      if(points)this.item.points=$('navigation-points').value.trim()?$('navigation-points').value.trim().split(/\n+/).map(line=>{
        const values=line.trim().split(/[,\s]+/).map(Number);if(values.length!==3||values.some(v=>!Number.isFinite(v)))throw Error('経路は一行に東西・南北・高度の3つの数値を指定してください。');
        return {x:values[0],y:values[1],z:values[2]};
      }):[];
    }else{
      this.item.kind=$('navigation-kind').value;
      if(this.item.kind==='unit'){this.item.unitId=$('navigation-unit').value;delete this.item.point;}
      else{this.item.point=Object.fromEntries(['x','y','z'].map(axis=>{
        const raw=$('navigation-'+axis).value;if(!raw.trim()||!Number.isFinite(Number(raw)))throw Error('地点の東西・南北・高さを数値で指定してください。');
        return [axis,Number(raw)*(axis==='z'?1:1000)];
      }));delete this.item.unitId;}
    }
  }
  error(message){$('navigation-error').hidden=false;$('navigation-error').textContent=message;}
  save(){
    try{
      this.collect();
      const draft=this.getDraft(),items=draft[this.key].filter(item=>item.id!==this.item.id),next=[...items,this.item];
      const errors=navigationErrors({...draft,[this.key]:next});if(errors.length)throw Error(errors.join('\n'));
      this.remember();draft[this.key]=next;this.onSave?.(this.item.id);this.dialog.close();this.render();
    }catch(e){this.error(e.message);}
  }
  remove(){
    const draft=this.getDraft(),field=this.kind==='route'?'routeId':'destinationId';
    if(draft.behaviors.some(g=>g.parameters?.some(p=>p.type===this.kind&&p.default===this.item.id))||draft.behaviorAssignments.some(a=>{const g=draft.behaviors.find(g=>g.id===a.behaviorId);return g?.parameters?.some(p=>p.type===this.kind&&a.parameters?.[p.id]===this.item.id);})||draft.behaviors.some(g=>[...g.nodes,...g.edges,...g.triggers].some(n=>n[field]===this.item.id))){this.error('ノードまたは遷移条件で使用中です。参照先を変更してから削除してください。');return;}
    this.remember();draft[this.key]=draft[this.key].filter(item=>item.id!==this.item.id);this.dialog.close();this.render();
  }
  addPoint(point){this.item.points.push({...point});return this.item.points.length;}
  finishRoute(){
    if(this.item.points.length<2)this.item.points=this.oldPoints;
    this.fields();this.dialog.showModal();
  }
  setPoint(point){this.item.point={...point};this.fields();this.dialog.showModal();}
}
