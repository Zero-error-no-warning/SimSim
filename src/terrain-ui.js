import {paintTerrain} from './terrain-editor.js?v=20261005-parameters-terrain-6';
import {requireElement} from './ui-dom.js?v=20261005-parameters-terrain-6';
const $=requireElement;
export class TerrainUI{
  constructor({getScenario,view,setMode,commit,notify}){
    Object.assign(this,{getScenario,view,setMode,commit,notify});this.active=false;
    $('terrain-edit').onclick=()=>this.active?this.cancel():this.open();
    $('terrain-apply').onclick=()=>this.apply();$('terrain-cancel').onclick=()=>this.cancel();
    $('terrain-undo').onclick=()=>this.history(false);$('terrain-redo').onclick=()=>this.history(true);
    for(const id of ['terrain-brush-mode','terrain-brush-radius','terrain-brush-amount','terrain-brush-target'])$(id).onchange=()=>this.fields();
    view.onTerrainStroke=(phase,point)=>this.stroke(phase,point);
  }
  open(){
    this.draft=structuredClone(this.getScenario().terrain);this.past=[];this.future=[];this.strokeBefore=null;this.active=true;
    this.showWater=this.view.showWater;this.view.showWater=false;this.view.water.visible=false;$('show-water').checked=false;
    this.setMode('terrain');$('terrain-panel').hidden=false;$('terrain-edit').classList.add('active');
    $('terrain-brush-radius').value=Math.max(this.draft.spacing*3,500);$('terrain-brush-radius').min=this.draft.spacing/2;
    this.fields();this.notify('地形をドラッグして編集 · 適用で確定 · Escで取消');
  }
  fields(){
    const mode=$('terrain-brush-mode').value;
    $('terrain-brush-target').parentElement.hidden=mode!=='flatten';$('terrain-brush-amount').parentElement.hidden=mode==='flatten';
    $('terrain-brush-amount-label').textContent=mode==='smooth'?'平滑化の強さ（%）':'一筆の変化量（m）';
    $('terrain-brush-amount').max=mode==='smooth'?100:10000;
    this.brush={mode,radius:Number($('terrain-brush-radius').value),amount:Number($('terrain-brush-amount').value),target:Number($('terrain-brush-target').value)};
    this.valid=['terrain-brush-radius','terrain-brush-amount','terrain-brush-target'].every(id=>$(id).value.trim()&&$(id).checkValidity());
    this.view.terrainBrushRadius=this.brush.radius;this.buttons();
  }
  buttons(){
    $('terrain-undo').disabled=!this.past.length;$('terrain-redo').disabled=!this.future.length;
    $('terrain-edit-info').textContent='格子 '+this.draft.spacing+'m · 標高は海面の高さとは別に指定 · '+(this.valid?'ブラシ範囲は円で表示':'ブラシの数値を確認してください');
  }
  stroke(phase,point){
    if(!this.active)return;
    if(phase==='start'){
      if(!this.valid)return;this.strokeBefore=[...this.draft.elevations];this.lastPoint=null;
    }
    if((phase==='start'||phase==='move')&&point&&this.strokeBefore){
      const length=this.lastPoint?Math.hypot(point.x-this.lastPoint.x,point.y-this.lastPoint.y):0,spacing=Math.max(this.draft.spacing/2,this.brush.radius/4);
      if(this.lastPoint&&length<spacing)return;
      const count=Math.max(1,Math.ceil(length/spacing)),previous=this.lastPoint??point;
      for(let i=1;i<=count;i++)paintTerrain(this.draft,{x:previous.x+(point.x-previous.x)*i/count,y:previous.y+(point.y-previous.y)*i/count},this.brush);
      this.lastPoint=point;this.view.previewTerrain(this.draft);
    }
    if(phase==='end'||phase==='cancel'){
      if(this.strokeBefore){
        if(phase==='cancel'){this.draft.elevations=this.strokeBefore;this.view.previewTerrain(this.draft);}
        else if(this.draft.elevations.some((v,i)=>v!==this.strokeBefore[i])){this.past.push(this.strokeBefore);if(this.past.length>25)this.past.shift();this.future=[];}
      }
      this.strokeBefore=null;this.lastPoint=null;this.buttons();
    }
  }
  history(forward){
    const from=forward?this.future:this.past,to=forward?this.past:this.future;if(!from.length)return;
    to.push(this.draft.elevations);this.draft.elevations=from.pop();this.view.previewTerrain(this.draft);this.buttons();
  }
  close(){
    this.view.cancelTerrainStroke();this.active=false;$('terrain-panel').hidden=true;$('terrain-edit').classList.remove('active');
    this.view.showWater=this.showWater;this.view.water.visible=this.showWater;$('show-water').checked=this.showWater;
    this.view.clearTerrainBrush();this.view.previewTerrain(this.getScenario().terrain);this.setMode(null);
  }
  cancel(){if(!this.active)return;this.close();this.notify('地形編集を取り消しました。');}
  apply(){
    if(!this.active)return;this.stroke('end');const data=this.draft;this.close();
    this.commit(next=>next.terrain=data,'地形を変更しました。計算を実行してください。');
  }
}
