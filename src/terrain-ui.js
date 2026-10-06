import {paintTerrain,resizeTerrain,sampleTerrainHeight} from './terrain-editor.js?v=20261006-terrain-grid-17';
import {requireElement} from './ui-dom.js?v=20261006-terrain-grid-17';
const $=requireElement;
export class TerrainUI{
  constructor({getScenario,view,setMode,commit,notify}){
    Object.assign(this,{getScenario,view,setMode,commit,notify});this.active=false;
    $('terrain-edit').onclick=()=>this.active?this.cancel():this.open();
    $('terrain-resize').onclick=()=>this.resize();
    $('terrain-apply').onclick=()=>this.apply();$('terrain-cancel').onclick=()=>this.cancel();
    $('terrain-undo').onclick=()=>this.history(false);$('terrain-redo').onclick=()=>this.history(true);
    for(const id of ['terrain-width','terrain-height','terrain-columns','terrain-rows'])$(id).oninput=()=>this.gridFields();
    for(const id of ['terrain-brush-mode','terrain-brush-radius','terrain-brush-amount','terrain-brush-target','terrain-brush-strength'])$(id).onchange=()=>this.fields();
    view.onTerrainStroke=(phase,point)=>this.stroke(phase,point);
  }
  open(){
    this.draft=structuredClone(this.getScenario().terrain);this.past=[];this.future=[];this.strokeBefore=null;this.active=true;
    this.showWater=this.view.showWater;this.view.showWater=false;this.view.water.visible=false;$('show-water').checked=false;
    this.setMode('terrain');$('terrain-panel').hidden=false;$('terrain-edit').classList.add('active');
    this.sizeFields();const cell=Math.min(this.draft.spacing,this.draft.spacingY??this.draft.spacing);
    $('terrain-brush-radius').value=Math.max(cell*3,500);$('terrain-brush-radius').min=cell/2;
    this.fields();this.notify('左ドラッグで地形編集 · Space＋ドラッグで視点操作 · 右クリックで標高取得 · Shift＋右クリックで編集メニュー · Escで取消');
  }
  sizeFields(){
    const d=this.draft;
    $('terrain-columns').value=d.columns;$('terrain-rows').value=d.rows;
    for(const [id,cells,spacing] of [['terrain-width',d.columns-1,d.spacing],['terrain-height',d.rows-1,d.spacingY??d.spacing]]){
      $(id).value=cells*spacing/1000;
    }
    const minimum=Math.min(d.spacing,d.spacingY??d.spacing)/2;if(Number($('terrain-brush-radius').value)<minimum)$('terrain-brush-radius').value=minimum*2;
    this.gridFields();
    $('terrain-size-error').hidden=true;
  }
  gridFields(){
    const columns=Number($('terrain-columns').value),rows=Number($('terrain-rows').value);
    for(const [id,count] of [['terrain-width',columns],['terrain-height',rows]]){
      if(Number.isInteger(count)&&count>=2&&count<=513){$(id).min=(count-1)/1000;$(id).max=(count-1)*10;}
    }
    const valid=['terrain-width','terrain-height','terrain-columns','terrain-rows'].every(id=>$(id).value.trim()&&$(id).checkValidity());
    const sx=Number($('terrain-width').value)*1000/(columns-1),sy=Number($('terrain-height').value)*1000/(rows-1);
    $('terrain-grid-info').textContent=valid?'設定後の格子間隔：東西 '+Number(sx.toFixed(3))+' m ／ 南北 '+Number(sy.toFixed(3))+' m':'領域サイズ・地形格子数を入力してください（格子間隔は1～10000m）。';
  }
  resize(){
    this.view.cancelTerrainStroke();
    try{
      if(!['terrain-columns','terrain-rows'].every(id=>$(id).value.trim()&&$(id).checkValidity()))throw Error('地形格子数は東西・南北それぞれ2～513の整数で指定してください。');
      if(!['terrain-width','terrain-height'].every(id=>$(id).value.trim()&&$(id).checkValidity()))throw Error('領域サイズは各格子の間隔が1～10000mになる範囲で指定してください。');
      const next=resizeTerrain(this.draft,Number($('terrain-width').value)*1000,Number($('terrain-height').value)*1000,{columns:Number($('terrain-columns').value),rows:Number($('terrain-rows').value)}),s=this.getScenario();
      $('terrain-size-error').hidden=true;
      if(next.columns===this.draft.columns&&next.rows===this.draft.rows&&Math.abs(next.spacing-this.draft.spacing)<1e-8&&Math.abs((next.spacingY??next.spacing)-(this.draft.spacingY??this.draft.spacing))<1e-8)return true;
      const maxX=next.origin.x+(next.columns-1)*next.spacing,maxY=next.origin.y+(next.rows-1)*(next.spacingY??next.spacing);
      const points=[],add=(name,list)=>{for(const p of list??[])if(p)points.push({name,p});};
      for(const u of [...s.units,...(this.view.scenario?.units??[])])add(u.name,[u.initial,...u.route]);
      for(const g of s.groups??[])add(g.name,[g.template.initial,...g.template.route]);
      for(const r of s.routes??[])add(r.name,r.points);
      for(const d of s.destinations??[])if(d.kind==='point')add(d.name,[d.point]);
      for(const a of s.behaviorAssignments??[])add(a.name,[...(a.route??[]),a.base]);
      const oldMaxX=this.draft.origin.x+(this.draft.columns-1)*this.draft.spacing,oldMaxY=this.draft.origin.y+(this.draft.rows-1)*(this.draft.spacingY??this.draft.spacing);
      const excluded=points.find(({p})=>p.x>=next.origin.x&&p.y>=next.origin.y&&p.x<=oldMaxX&&p.y<=oldMaxY&&(p.x>maxX||p.y>maxY));
      if(excluded)throw Error('「'+excluded.name+'」の位置・経路・目的地が新しい領域の外になります。先に領域内へ移動するか、削除してください。');
      this.past.push(structuredClone(this.draft));if(this.past.length>25)this.past.shift();this.future=[];this.draft=next;
      this.view.previewTerrain(next);this.view.fit();this.sizeFields();this.fields();
      this.notify('領域サイズ・地形格子数をプレビューしました。適用で確定、取消で元に戻します。');return true;
    }catch(error){$('terrain-size-error').textContent=error.message;$('terrain-size-error').hidden=false;return false;}
  }
  sample(point){
    if(!this.active)return false;
    const height=sampleTerrainHeight(this.draft,point);if(height===null)return false;
    this.stroke('end');
    $('terrain-brush-target').value=height;
    $('terrain-brush-mode').value='flatten';this.fields();
    this.notify('標高 '+Number(height.toFixed(3))+' m を取得しました。「指定標高にそろえる」で塗れます。');return true;
  }
  fields(){
    const minimum=Math.min(this.draft.spacing,this.draft.spacingY??this.draft.spacing)/2;$('terrain-brush-radius').min=minimum;
    const mode=$('terrain-brush-mode').value;
    const strengthMode=mode==='flatten'||mode==='smooth';
    $('terrain-brush-target').parentElement.hidden=mode!=='flatten';$('terrain-brush-amount').parentElement.hidden=strengthMode;
    $('terrain-brush-strength').parentElement.hidden=!strengthMode;
    this.brush={mode,radius:Number($('terrain-brush-radius').value),amount:strengthMode?0:Number($('terrain-brush-amount').value),target:mode==='flatten'?Number($('terrain-brush-target').value):0,strength:strengthMode?Number($('terrain-brush-strength').value)/100:1};
    const fields=['terrain-brush-radius',strengthMode?'terrain-brush-strength':'terrain-brush-amount',...(mode==='flatten'?['terrain-brush-target']:[])];
    this.valid=fields.every(id=>$(id).value.trim()&&$(id).checkValidity());
    this.view.terrainBrushRadius=this.brush.radius;this.buttons();
  }
  buttons(){
    $('terrain-undo').disabled=!this.past.length;$('terrain-redo').disabled=!this.future.length;
    $('terrain-edit-info').textContent='領域 '+Number(((this.draft.columns-1)*this.draft.spacing/1000).toFixed(6))+' × '+Number(((this.draft.rows-1)*(this.draft.spacingY??this.draft.spacing)/1000).toFixed(6))+' km · 地形格子数 '+this.draft.columns+' × '+this.draft.rows+' · 格子間隔 '+Number(this.draft.spacing.toFixed(3))+' × '+Number((this.draft.spacingY??this.draft.spacing).toFixed(3))+' m · '+(this.valid?'ブラシ範囲は円で表示':'ブラシの数値を確認してください');
  }
  stroke(phase,point){
    if(!this.active)return;
    if(phase==='start'){
      if(!this.valid)return;this.strokeBefore=[...this.draft.elevations];this.lastPoint=null;
    }
    if((phase==='start'||phase==='move')&&point&&this.strokeBefore){
      const length=this.lastPoint?Math.hypot(point.x-this.lastPoint.x,point.y-this.lastPoint.y):0,spacing=Math.max(Math.min(this.draft.spacing,this.draft.spacingY??this.draft.spacing)/2,this.brush.radius/4);
      if(this.lastPoint&&length<spacing)return;
      const count=Math.max(1,Math.ceil(length/spacing)),previous=this.lastPoint??point;
      for(let i=1;i<=count;i++)paintTerrain(this.draft,{x:previous.x+(point.x-previous.x)*i/count,y:previous.y+(point.y-previous.y)*i/count},this.brush);
      this.lastPoint=point;this.view.previewTerrain(this.draft);
    }
    if(phase==='end'||phase==='cancel'){
      if(this.strokeBefore){
        if(phase==='cancel'){this.draft.elevations=this.strokeBefore;this.view.previewTerrain(this.draft);}
        else if(this.draft.elevations.some((v,i)=>v!==this.strokeBefore[i])){this.past.push({...structuredClone(this.draft),elevations:this.strokeBefore});if(this.past.length>25)this.past.shift();this.future=[];}
      }
      this.strokeBefore=null;this.lastPoint=null;this.buttons();
    }
  }
  history(forward){
    const from=forward?this.future:this.past,to=forward?this.past:this.future;if(!from.length)return;
    this.view.cancelTerrainStroke();to.push(structuredClone(this.draft));this.draft=from.pop();this.view.previewTerrain(this.draft);this.sizeFields();this.fields();
  }
  close(){
    this.view.cancelTerrainStroke();this.active=false;$('terrain-panel').hidden=true;$('terrain-edit').classList.remove('active');
    this.view.showWater=this.showWater;this.view.water.visible=this.showWater;$('show-water').checked=this.showWater;
    this.view.clearTerrainBrush();this.view.previewTerrain(this.getScenario().terrain);this.setMode(null);
  }
  cancel(){if(!this.active)return;this.close();this.notify('地形編集を取り消しました。');}
  apply(){
    if(!this.active)return;this.stroke('end');if(!this.resize())return;const data=this.draft;this.close();
    this.commit(next=>next.terrain=data,'地形を変更しました。計算を実行してください。');
  }
}
