import {sampleRoute,smoothRoute,defaultProfile} from './route-curves.js?v=20261014-inline-route-editor-35';
import {SpeedProfileUI} from './speed-profile-ui.js?v=20261014-inline-route-editor-35';
import * as THREE from '../vendor/three/three.module.min.js';
import {Terrain} from './terrain.js?v=20261014-inline-route-editor-35';
import {inspectRoute} from './route-planner.js?v=20261014-inline-route-editor-35';
export class RouteMapEditor {
  constructor(view,{item,unit,terrain,onFinish,onChange,inline=false,index,numberOffset=1}){
    Object.assign(this,{view,onFinish,onChange,inline,numberOffset});this.points=structuredClone(item.points??[]);this.mode=item.mode;this.speedProfile=structuredClone(item.speedProfile);this.baseSpeed=unit?.speed??10;this.linkHandles=true;this.terrain=new Terrain(terrain);
    this.domain=item.navigation?.domain??unit?.domain??'surface';this.clearance=item.navigation?.clearance??0;
    this.height=this.points.at(-1)?.z??unit?.initial?.z??terrain.seaLevel;this.index=index??(inline?0:this.points.length-1);
    this.group=new THREE.Group();view.scene.add(this.group);view.routeEditor=this;
    this.panel=document.createElement('section');this.panel.className='route-map-panel';this.panel.setAttribute('aria-label','地図で経路を編集');
    this.panel.innerHTML='<strong>経路を地図で編集</strong><p>空白をクリック：末尾に追加<br>点をドラッグ：水平移動<br>Shift＋点をドラッグ：高さ変更<br>Space＋ドラッグ：視点操作</p><label>経由点<select data-route-point></select></label><label>高さのz座標（m）<input data-route-height type="number" min="-1000000" max="1000000" step="any"></label><small>海面が0mなら、水深120mは −120m</small><div><button data-route-delete>点を削除</button><button data-route-insert>次に点を追加</button></div><details data-route-curves><summary>曲線の形</summary><div class="compact-actions"><button data-route-smooth>滑らかな曲線にする</button><button data-route-straight>全て直線に戻す</button></div><label class="check-field"><input data-route-curved type="checkbox">この点からの区間を曲線にする</label><label class="check-field"><input data-route-linked type="checkbox" checked>進入・退出ハンドルを連動</label><small>青緑の点が曲線ハンドル。ドラッグで水平、Shift＋ドラッグで高さを変更。</small></details><details data-route-speed><summary>経路全体の速度</summary><div data-route-speed-host></div></details><output role="status"></output><div><button data-route-cancel>取消</button><button data-route-done class="primary">編集画面へ戻る</button></div>';
    view.element.append(this.panel);this.select=this.panel.querySelector('select');this.input=this.panel.querySelector('input');this.status=this.panel.querySelector('output');
    if(inline){
      this.panel.classList.add('route-inline-panel');this.panel.setAttribute('aria-label','選択経路の曲線・速度編集');
      this.panel.querySelector('strong').textContent=item.name??'選択経路を編集';
      if(item.scopeNote){const note=document.createElement('small');note.textContent=item.scopeNote;this.panel.querySelector('strong').after(note);}
      this.panel.querySelector('p').textContent='番号の点：通過位置 ／ 青緑の点：曲がり方。Shift＋ドラッグで高さ変更。変更はその場で反映、Ctrl＋Zで元に戻す。';
      this.panel.querySelector('[data-route-cancel]').hidden=true;this.panel.querySelector('[data-route-done]').textContent='閉じる';
    }
    this.select.onchange=()=>{this.index=Number(this.select.value);this.refresh();};
    this.input.disabled=['surface','ground'].includes(this.domain);this.input.onchange=()=>{
      if(!this.input.value.trim()||!this.input.checkValidity()){this.status.textContent='高さを有効な数値で指定してください。';return;}
      const z=Number(this.input.value),p=this.points[this.index];if(!p){this.height=z;return;}this.move(this.index,{...p,z});this.refresh();
    };
    this.panel.querySelector('[data-route-delete]').onclick=()=>{if(this.index>=0){this.points.splice(this.index,1);this.index=Math.min(this.index,this.points.length-1);this.insertAfter=undefined;this.refresh();}};
    this.panel.querySelector('[data-route-insert]').onclick=()=>{this.insertAfter=this.index;this.status.textContent='次の点を挿入する位置をクリックしてください。';};
    const shapeDetails=this.panel.querySelector('[data-route-curves]'),speedDetails=this.panel.querySelector('[data-route-speed]');
    shapeDetails.ontoggle=()=>{if(shapeDetails.open)speedDetails.open=false;};speedDetails.ontoggle=()=>{if(speedDetails.open)shapeDetails.open=false;};
    this.panel.querySelector('[data-route-smooth]').onclick=()=>{smoothRoute(this.points,this.mode==='loop');this.refresh();};
    this.panel.querySelector('[data-route-straight]').onclick=()=>{for(const p of this.points){delete p.in;delete p.out;}this.refresh();};
    this.panel.querySelector('[data-route-linked]').onchange=e=>this.linkHandles=e.target.checked;
    this.panel.querySelector('[data-route-curved]').onchange=e=>{const p=this.points[this.index],next=this.points[(this.index+1)%this.points.length];if(!p||!next)return;if(e.target.checked){p.out??={x:(next.x-p.x)/3,y:(next.y-p.y)/3,z:(next.z-p.z)/3};next.in??={x:(p.x-next.x)/3,y:(p.y-next.y)/3,z:(p.z-next.z)/3};}else{delete p.out;delete next.in;}this.refresh();};
    this.speedUI=new SpeedProfileUI(this.panel.querySelector('[data-route-speed-host]'),{profile:this.speedProfile,mode:this.mode,speed:this.baseSpeed,getPoints:()=>this.points,pointLabel:i=>i+this.numberOffset,onChange:profile=>this.speedProfile=profile});
    if(inline){
      this.speedUI.onCommit=()=>this.changed();
      for(const selector of ['[data-route-height]','[data-route-curved]']){const control=this.panel.querySelector(selector),handler=control.onchange;control.onchange=e=>{handler(e);this.changed();};}
      for(const selector of ['[data-route-delete]','[data-route-smooth]','[data-route-straight]']){const control=this.panel.querySelector(selector),handler=control.onclick;control.onclick=e=>{handler(e);this.changed();};}
      shapeDetails.open=true;
      this.panel.querySelector('[data-route-insert]').textContent='次の点を地図で追加';
    }
    this.panel.querySelector('[data-route-done]').onclick=()=>this.finish(true);this.panel.querySelector('[data-route-cancel]').onclick=()=>this.finish(false);
    this.key=e=>{if(document.querySelector('select[aria-expanded="true"]'))return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();if(this.speedUI.drag)this.speedUI.cancelDrag();else if(this.drag)this.cancelDrag();else this.finish(false);}};window.addEventListener('keydown',this.key,true);
    this.blur=()=>this.cancelDrag();window.addEventListener('blur',this.blur);
    this.blockOutside=e=>{if(!view.element.contains(e.target)&&!document.getElementById('display-menu')?.contains(e.target)&&!e.target.closest('#simsim-select-options')){e.preventDefault();e.stopImmediatePropagation();}};if(!inline)document.addEventListener('click',this.blockOutside,true);
    this.refresh();
  }
  clear(){for(const child of [...this.group.children]){this.group.remove(child);child.geometry?.dispose();child.material?.map?.dispose();child.material?.dispose();}}
  refresh(){
    this.clear();this.select.replaceChildren();this.points.forEach((p,i)=>this.select.add(new Option((i+this.numberOffset)+'：z '+Math.round(p.z)+' m',i)));this.select.value=String(this.index);
    this.height=this.points[this.index]?.z??this.height;this.input.value=this.height;
    this.panel.querySelector('[data-route-delete]').disabled=this.index<0||this.inline&&this.points.length<=(this.mode==='loop'?3:2);
    const path=sampleRoute(this.points,this.mode==='loop');
    const coords=path.map(p=>this.view.world(p,15));
    this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(coords),new THREE.LineBasicMaterial({color:'#ffd18b',depthTest:false,depthWrite:false})));
    this.sprites=this.points.map((p,i)=>{const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const c=canvas.getContext('2d');c.fillStyle=i===this.index?'#ffd18b':'#132738';c.strokeStyle='#ffd18b';c.lineWidth=3;c.beginPath();c.arc(32,32,28,0,Math.PI*2);c.fill();c.stroke();c.fillStyle=i===this.index?'#132738':'#fff';c.font='bold 25px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(String(i+this.numberOffset),32,33);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),depthTest:false,depthWrite:false}));sprite.position.copy(this.view.world(p,20));sprite.renderOrder=30;this.group.add(sprite);return sprite;});
    this.handleMarkers=[];const p=this.points[this.index];
    if(p)for(const side of ['in','out'])if(p[side]){
      const target={x:p.x+p[side].x,y:p.y+p[side].y,z:p.z+p[side].z},sprite=new THREE.Sprite(new THREE.SpriteMaterial({color:'#75dce7',depthTest:false,depthWrite:false}));sprite.position.copy(this.view.world(target,20));sprite.renderOrder=31;this.group.add(sprite);this.handleMarkers.push({sprite,point:target,side,index:this.index});
      this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([this.view.world(p,20),this.view.world(target,20)]),new THREE.LineBasicMaterial({color:'#75dce7',transparent:true,opacity:.7,depthTest:false,depthWrite:false})));
    }
    const next=this.points[(this.index+1)%this.points.length],curved=this.panel.querySelector('[data-route-curved]');curved.disabled=this.index<0||this.mode!=='loop'&&this.index===this.points.length-1;curved.checked=!!(p?.out||next?.in);
    this.speedUI?.render();
    const stems=this.points.flatMap(p=>[this.view.world(p),this.view.world({...p,z:this.terrain.data.seaLevel})]);this.group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(stems),new THREE.LineBasicMaterial({color:'#ffd18b',transparent:true,opacity:.4,depthTest:false,depthWrite:false})));
    this.render();
  }
  render(){for(const sprite of [...this.sprites,...(this.handleMarkers??[]).map(h=>h.sprite)]){const v=this.view,scale=v.mode==='top'?(v.camera.top-v.camera.bottom)/v.camera.zoom/v.element.clientHeight:2*Math.tan(THREE.MathUtils.degToRad(v.camera.fov/2))*sprite.position.distanceTo(v.camera.position)/v.element.clientHeight;sprite.scale.setScalar(scale*28);}}
  move(index,p){const checked=this.terrain.project(p,this.domain);if(checked.error){this.status.textContent=checked.error;return false;}this.points[index]={...this.points[index],...checked.point};this.status.textContent='';return true;}
  down(event){
    if(event.button!==0)return false;const v=this.view;v.updatePointer(event);
    const r=v.renderer.domElement.getBoundingClientRect();let index=-1,best=18;
    this.sprites.forEach((s,i)=>{const p=v.screenPoint(s.position),d=Math.hypot(p.x-event.clientX+r.left,p.y-event.clientY+r.top);if(p.visible&&d<best){best=d;index=i;}});
    let handle;for(const h of this.handleMarkers){const p=v.screenPoint(h.sprite.position),distance=Math.hypot(p.x-event.clientX+r.left,p.y-event.clientY+r.top);if(p.visible&&distance<best){best=distance;index=h.index;handle=h;}}
    if(this.inline&&this.insertAfter===undefined&&!handle){
      const id=v.pickUnit(event),unit=id?v.screenPoint(v.markers.get(id).position):null,unitDistance=unit?Math.hypot(unit.x-event.clientX+r.left,unit.y-event.clientY+r.top):Infinity;
      if(index<0||unitDistance<best)return false;
    }
    event.preventDefault();event.stopImmediatePropagation();
    if(index>=0)this.index=index;
    const base=handle?.point??this.points[index],origin=v.pointFor({domain:this.domain,initial:{z:base?.z??this.height}});
    this.drag={index,handle:handle?.side,original:structuredClone(this.points[index]),base:base?{...base}:null,origin,x:event.clientX,y:event.clientY,pointerId:event.pointerId,vertical:event.shiftKey&&!this.input.disabled,moved:false};v.controls.enabled=false;v.renderer.domElement.setPointerCapture(event.pointerId);this.refresh();
    return true;
  }
  movePointer(event){
    const d=this.drag;if(!d||d.pointerId!==event.pointerId)return;event.stopImmediatePropagation();if(Math.hypot(event.clientX-d.x,event.clientY-d.y)<4&&!d.moved)return;d.moved=true;if(d.index<0)return;
    const v=this.view;v.updatePointer(event);let p;
    if(d.vertical){const a=v.screenPoint(v.world(d.base)),b=v.screenPoint(v.world({...d.base,z:d.base.z+100})),dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;if(l<.01){this.status.textContent='高さは斜めの視点でドラッグするか、数値欄で変更してください。';return;}const z=d.base.z+100*((event.clientX-d.x)*dx+(event.clientY-d.y)*dy)/l;p={...d.base,z:Math.round(Math.max(-1e6,Math.min(1e6,z)))};
    }else{const q=v.pointFor({domain:this.domain,initial:{z:d.base.z}});if(q&&d.origin)p={x:d.base.x+q.x-d.origin.x,y:d.base.y+q.y-d.origin.y,z:d.base.z};}
    if(p){if(d.handle){const origin=this.points[d.index],offset={x:p.x-origin.x,y:p.y-origin.y,z:p.z-origin.z};origin[d.handle]=offset;if(this.linkHandles&&origin[d.handle==='in'?'out':'in'])origin[d.handle==='in'?'out':'in']={x:-offset.x,y:-offset.y,z:-offset.z};this.refresh();}else if(this.move(d.index,p))this.refresh();}
  }
  up(event){
    const d=this.drag;if(!d||event.pointerId!==d.pointerId)return;event.stopImmediatePropagation();this.release();
    if(d.index<0&&!d.moved){const v=this.view;v.updatePointer(event);const p=v.pointFor({domain:this.domain,initial:{z:this.height}});if(p){const checked=this.terrain.project(p,this.domain);if(checked.error)this.status.textContent=checked.error;else if(this.points.length>=500)this.status.textContent='経路は500点までです。';else{const index=this.insertAfter===undefined?this.points.length:this.insertAfter+1;this.points.splice(index,0,checked.point);this.index=index;this.insertAfter=undefined;this.refresh();}}}
    if(this.inline&&(d.moved||d.index<0))this.changed();
  }
  release(){const d=this.drag;this.drag=null;this.view.controls.enabled=true;const c=this.view.renderer.domElement;if(d&&c.hasPointerCapture(d.pointerId))c.releasePointerCapture(d.pointerId);}
  cancelDrag(){if(!this.drag)return;if(this.drag.base)this.points[this.drag.index]=this.drag.original;this.release();this.refresh();}
  changed(){
    if(!this.inline)return;
    const applied=this.onChange?.({points:structuredClone(this.points),speedProfile:structuredClone(this.speedProfile)});
    const result=inspectRoute(this.terrain,this.points,{domain:this.domain,clearance:this.clearance},{loop:this.mode==='loop'});
    this.status.textContent=applied===false?'変更はありません。':result.ok?'変更を反映しました。Ctrl＋Zで元に戻せます。':result.issues.map(i=>'区間 '+(i.segment+1)+'：'+i.reason).join(' / ');
  }
  sync(item,unit,terrain){
    this.cancelDrag();this.speedUI.cancelDrag(false);
    this.points=structuredClone(item.points);this.speedProfile=structuredClone(item.speedProfile);this.mode=item.mode;this.terrain=new Terrain(terrain);this.baseSpeed=unit.speed;this.index=Math.max(0,Math.min(this.index,this.points.length-1));
    this.speedUI.profile=structuredClone(item.speedProfile??defaultProfile());this.speedUI.enabled=!!item.speedProfile;this.speedUI.checkbox.checked=this.speedUI.enabled;this.speedUI.speed=unit.speed;this.speedUI.mode=item.mode;this.speedUI.loop=item.mode!=='once';this.speedUI.selected=Math.min(this.speedUI.selected,this.speedUI.profile.points.length-1);
    this.refresh();
  }
  finish(save){
    this.cancelDrag();if(save&&!this.inline){if(this.points.length<2){this.status.textContent='経路は2点以上必要です。';return;}const result=inspectRoute(this.terrain,this.points,{domain:this.domain,clearance:this.clearance},{loop:this.mode==='loop'});if(!result.ok){this.status.textContent=result.issues.map(i=>'区間 '+(i.segment+1)+'：'+i.reason).join(' / ');return;}}
    this.clear();this.view.scene.remove(this.group);this.view.routeEditor=null;this.panel.remove();window.removeEventListener('keydown',this.key,true);window.removeEventListener('blur',this.blur);document.removeEventListener('click',this.blockOutside,true);this.speedUI.dispose();this.onFinish(save?structuredClone(this.points):null,this.speedProfile);
  }
}
