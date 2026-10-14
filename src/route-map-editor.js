import * as THREE from '../vendor/three/three.module.min.js';
import {Terrain} from './terrain.js?v=20261014-placement-height-33';
import {inspectRoute} from './route-planner.js?v=20261014-placement-height-33';
export class RouteMapEditor {
  constructor(view,{item,unit,terrain,onFinish}){
    Object.assign(this,{view,onFinish});this.points=structuredClone(item.points??[]);this.mode=item.mode;this.terrain=new Terrain(terrain);
    this.domain=item.navigation?.domain??unit?.domain??'surface';this.clearance=item.navigation?.clearance??0;
    this.height=this.points.at(-1)?.z??unit?.initial?.z??terrain.seaLevel;this.index=this.points.length-1;
    this.group=new THREE.Group();view.scene.add(this.group);view.routeEditor=this;
    this.panel=document.createElement('section');this.panel.className='route-map-panel';this.panel.setAttribute('aria-label','地図で経路を編集');
    this.panel.innerHTML='<strong>経路を地図で編集</strong><p>空白をクリック：末尾に追加<br>点をドラッグ：水平移動<br>Shift＋点をドラッグ：高さ変更<br>Space＋ドラッグ：視点操作</p><label>経由点<select data-route-point></select></label><label>高さのz座標（m）<input data-route-height type="number" min="-1000000" max="1000000" step="any"></label><small>海面が0mなら、水深120mは −120m</small><div><button data-route-delete>点を削除</button><button data-route-insert>次に点を追加</button></div><output role="status"></output><div><button data-route-cancel>取消</button><button data-route-done class="primary">編集画面へ戻る</button></div>';
    view.element.append(this.panel);this.select=this.panel.querySelector('select');this.input=this.panel.querySelector('input');this.status=this.panel.querySelector('output');
    this.select.onchange=()=>{this.index=Number(this.select.value);this.refresh();};
    this.input.disabled=['surface','ground'].includes(this.domain);this.input.onchange=()=>{
      if(!this.input.value.trim()||!this.input.checkValidity()){this.status.textContent='高さを有効な数値で指定してください。';return;}
      const z=Number(this.input.value),p=this.points[this.index];if(!p){this.height=z;return;}this.move(this.index,{...p,z});this.refresh();
    };
    this.panel.querySelector('[data-route-delete]').onclick=()=>{if(this.index>=0){this.points.splice(this.index,1);this.index=Math.min(this.index,this.points.length-1);this.refresh();}};
    this.panel.querySelector('[data-route-insert]').onclick=()=>{this.insertAfter=this.index;this.status.textContent='次の点を挿入する位置をクリックしてください。';};
    this.panel.querySelector('[data-route-done]').onclick=()=>this.finish(true);this.panel.querySelector('[data-route-cancel]').onclick=()=>this.finish(false);
    this.key=e=>{if(document.querySelector('select[aria-expanded="true"]'))return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();if(this.drag)this.cancelDrag();else this.finish(false);}};window.addEventListener('keydown',this.key,true);
    this.blur=()=>this.cancelDrag();window.addEventListener('blur',this.blur);
    this.blockOutside=e=>{if(!view.element.contains(e.target)&&!document.getElementById('display-menu')?.contains(e.target)&&!e.target.closest('#simsim-select-options')){e.preventDefault();e.stopImmediatePropagation();}};document.addEventListener('click',this.blockOutside,true);
    this.refresh();
  }
  clear(){for(const child of [...this.group.children]){this.group.remove(child);child.geometry?.dispose();child.material?.map?.dispose();child.material?.dispose();}}
  refresh(){
    this.clear();this.select.replaceChildren();this.points.forEach((p,i)=>this.select.add(new Option((i+1)+'：z '+Math.round(p.z)+' m',i)));this.select.value=String(this.index);
    this.height=this.points[this.index]?.z??this.height;this.input.value=this.height;
    this.panel.querySelector('[data-route-delete]').disabled=this.index<0;
    const path=[...this.points];if(this.mode==='loop'&&path.length>1)path.push(path[0]);
    const coords=path.map(p=>this.view.world(p,15));
    this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(coords),new THREE.LineBasicMaterial({color:'#ffd18b',depthTest:false,depthWrite:false})));
    this.sprites=this.points.map((p,i)=>{const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const c=canvas.getContext('2d');c.fillStyle=i===this.index?'#ffd18b':'#132738';c.strokeStyle='#ffd18b';c.lineWidth=3;c.beginPath();c.arc(32,32,28,0,Math.PI*2);c.fill();c.stroke();c.fillStyle=i===this.index?'#132738':'#fff';c.font='bold 25px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(String(i+1),32,33);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),depthTest:false,depthWrite:false}));sprite.position.copy(this.view.world(p,20));sprite.renderOrder=30;this.group.add(sprite);return sprite;});
    const stems=this.points.flatMap(p=>[this.view.world(p),this.view.world({...p,z:this.terrain.data.seaLevel})]);this.group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(stems),new THREE.LineBasicMaterial({color:'#ffd18b',transparent:true,opacity:.4,depthTest:false,depthWrite:false})));
    this.render();
  }
  render(){for(const sprite of this.sprites){const v=this.view,scale=v.mode==='top'?(v.camera.top-v.camera.bottom)/v.camera.zoom/v.element.clientHeight:2*Math.tan(THREE.MathUtils.degToRad(v.camera.fov/2))*sprite.position.distanceTo(v.camera.position)/v.element.clientHeight;sprite.scale.setScalar(scale*28);}}
  move(index,p){const checked=this.terrain.project(p,this.domain);if(checked.error){this.status.textContent=checked.error;return false;}this.points[index]=checked.point;this.status.textContent='';return true;}
  down(event){
    if(event.button!==0)return;event.preventDefault();event.stopImmediatePropagation();const v=this.view;v.updatePointer(event);
    const r=v.renderer.domElement.getBoundingClientRect();let index=-1,best=18;
    this.sprites.forEach((s,i)=>{const p=v.screenPoint(s.position),d=Math.hypot(p.x-event.clientX+r.left,p.y-event.clientY+r.top);if(p.visible&&d<best){best=d;index=i;}});
    if(index>=0)this.index=index;
    const base=this.points[index],origin=v.pointFor({domain:this.domain,initial:{z:base?.z??this.height}});
    this.drag={index,base:base?{...base}:null,origin,x:event.clientX,y:event.clientY,pointerId:event.pointerId,vertical:event.shiftKey&&!this.input.disabled,moved:false};v.controls.enabled=false;v.renderer.domElement.setPointerCapture(event.pointerId);this.refresh();
  }
  movePointer(event){
    const d=this.drag;if(!d||d.pointerId!==event.pointerId)return;event.stopImmediatePropagation();if(Math.hypot(event.clientX-d.x,event.clientY-d.y)<4&&!d.moved)return;d.moved=true;if(d.index<0)return;
    const v=this.view;v.updatePointer(event);let p;
    if(d.vertical){const a=v.screenPoint(v.world(d.base)),b=v.screenPoint(v.world({...d.base,z:d.base.z+100})),dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;if(l<.01){this.status.textContent='高さは斜めの視点でドラッグするか、数値欄で変更してください。';return;}const z=d.base.z+100*((event.clientX-d.x)*dx+(event.clientY-d.y)*dy)/l;p={...d.base,z:Math.round(Math.max(-1e6,Math.min(1e6,z)))};
    }else{const q=v.pointFor({domain:this.domain,initial:{z:d.base.z}});if(q&&d.origin)p={x:d.base.x+q.x-d.origin.x,y:d.base.y+q.y-d.origin.y,z:d.base.z};}
    if(p&&this.move(d.index,p))this.refresh();
  }
  up(event){
    const d=this.drag;if(!d||event.pointerId!==d.pointerId)return;event.stopImmediatePropagation();this.release();
    if(d.index<0&&!d.moved){const v=this.view;v.updatePointer(event);const p=v.pointFor({domain:this.domain,initial:{z:this.height}});if(p){const checked=this.terrain.project(p,this.domain);if(checked.error)this.status.textContent=checked.error;else if(this.points.length>=500)this.status.textContent='経路は500点までです。';else{const index=this.insertAfter===undefined?this.points.length:this.insertAfter+1;this.points.splice(index,0,checked.point);this.index=index;this.insertAfter=undefined;this.refresh();}}}
  }
  release(){const d=this.drag;this.drag=null;this.view.controls.enabled=true;const c=this.view.renderer.domElement;if(d&&c.hasPointerCapture(d.pointerId))c.releasePointerCapture(d.pointerId);}
  cancelDrag(){if(!this.drag)return;if(this.drag.base)this.points[this.drag.index]=this.drag.base;this.release();this.refresh();}
  finish(save){
    this.cancelDrag();if(save){if(this.points.length<2){this.status.textContent='経路は2点以上必要です。';return;}const result=inspectRoute(this.terrain,this.points,{domain:this.domain,clearance:this.clearance},{loop:this.mode==='loop'});if(!result.ok){this.status.textContent=result.issues.map(i=>'区間 '+(i.segment+1)+'：'+i.reason).join(' / ');return;}}
    this.clear();this.view.scene.remove(this.group);this.view.routeEditor=null;this.panel.remove();window.removeEventListener('keydown',this.key,true);window.removeEventListener('blur',this.blur);document.removeEventListener('click',this.blockOutside,true);this.onFinish(save?structuredClone(this.points):null);
  }
}
