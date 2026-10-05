import { editableDefinition } from './editor.js';
import { sharedAssignment } from './shared-settings.js';
import * as THREE from '../vendor/three/three.module.min.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { Terrain, Simulation, DOMAIN_NAMES } from './engine.js';
const COLORS={
  friendly:'#6bd0fa',hostile:'#f99587',neutral:'#d5c789'
};
const disposal = group => {
  for(const object of [...group.children]) {
    group.remove(object);
    object.traverse(child=>{
      child.geometry?.dispose();
      if(child.material) for(const material of [].concat(child.material)) {
        material.map?.dispose();material.dispose();
      }
    });
  }
};
export class MapView {
  constructor(element,{
    onSelect,onMapClick,onHover,onEdit,onContext,onDragState
  }) {
    this.element=element;
    this.onSelect=onSelect;
    this.onMapClick=onMapClick;
    this.onHover=onHover;
    this.onEdit=onEdit;
    this.onContext=onContext;
    this.onDragState=onDragState;
    this.authoring=true;
    this.handles=[];
    this.renderer=new THREE.WebGLRenderer({
      antialias:true,alpha:false
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    this.renderer.setClearColor('#112132');
    element.appendChild(this.renderer.domElement);
    this.scene=new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight('#e2f0ff','#25374d',2));
    const sun=new THREE.DirectionalLight('#fff2d7',2.2);
    sun.position.set(-20000,45000,20000);
    this.scene.add(sun);
    this.environment=new THREE.Group();
    this.routes=new THREE.Group();
    this.units=new THREE.Group();
    this.trails=new THREE.Group();
    this.sensorRangeGroup=new THREE.Group();
    this.detectionGroup=new THREE.Group();
    this.showSensor=true;
    this.scene.add(this.environment,this.routes,this.units,this.trails,this.sensorRangeGroup,this.detectionGroup);
    this.camera3d=new THREE.PerspectiveCamera(44,1,10,700000);
    this.cameraTop=new THREE.OrthographicCamera(-20000,20000,16000,-16000,10,700000);
    this.cameraTop.up.set(0,0,-1);
    this.camera=this.camera3d;
    this.mode='3d';
    this.exaggeration=4;
    this.raycaster=new THREE.Raycaster();
    this.pointer=new THREE.Vector2();
    this.markers=new Map();
    this.labels=new Map();
    this.trailPoints=new Map();
    this.latestTime=0;
    this.labelLayer=document.getElementById('labels');
    this.selected=null;
    this.editMode=null;
    this.showRoutes=true;
    this.showTrails=true;
    this.showWater=true;
    this.setControls();
    this.resizeObserver=new ResizeObserver(()=>this.resize());
    this.resizeObserver.observe(element);
    this.resize();
    const canvas=this.renderer.domElement;
    canvas.tabIndex=0;
    canvas.setAttribute('aria-label','シナリオの地図・直接編集');
    canvas.addEventListener('pointerdown',event=>this.pointerDown(event),true);
    canvas.addEventListener('pointerup',event=>this.pointerUp(event),true);
    canvas.addEventListener('pointercancel',()=>this.cancelDrag());
    canvas.addEventListener('lostpointercapture',()=>this.cancelDrag());
    canvas.addEventListener('contextmenu',event=>{
      event.preventDefault();if(this.down&&Math.hypot(event.clientX-this.down.x,event.clientY-this.down.y)>5)return;this.updatePointer(event);const handle=this.authoring?this.pickHandle(event):null,unit=this.pickUnit(event);this.onContext?.({
        x:event.clientX,y:event.clientY,id:unit??handle?.id,handle,point:this.pointFor(null)
      });
    });
    canvas.addEventListener('pointermove',event=>this.pointerMove(event),true);
    canvas.addEventListener('pointerleave',()=>{
      if(!this.drag)this.onHover(null);
    });
    canvas.addEventListener('webglcontextlost',event=>{
      event.preventDefault();const boot=document.getElementById('boot');boot.hidden=false;boot.textContent='WebGLの描画が停止しました。ページを再読み込みしてください。シナリオは保存ボタンで取得できます。';
    });
  }
  editableUnit(){
    return editableDefinition(this.scenario,this.selected)?.unit;
  }
  screenPoint(point){
    const p=point.clone().project(this.camera);
    return {
      x:(p.x*.5+.5)*this.element.clientWidth,y:(-p.y*.5+.5)*this.element.clientHeight,visible:p.z>=-1&&p.z<=1
    };
  }
  pickUnit(event) {
    const rect=this.renderer.domElement.getBoundingClientRect();
    let closest=null,best=Infinity;
    for(const [id,m] of this.markers){
      const p=this.screenPoint(m.position),distance=Math.hypot(p.x-(event.clientX-rect.left),p.y-(event.clientY-rect.top));
      const radius=id===this.selected?20:this.scenario.units.length>80?10:17;
      if(p.visible&&distance<radius&&(distance<best-.1||Math.abs(distance-best)<.1&&id===this.selected)){
        best=distance;
        closest=id;
      }
    }
    return closest;
  }
  pickHandle(event) {
    if(!this.showRoutes)return null;
    const rect=this.renderer.domElement.getBoundingClientRect();
    let best=null,distance=14;
    for(const h of this.handles){
      if(!h.mesh.visible)continue;
      const p=this.screenPoint(h.mesh.position),d=Math.hypot(p.x-(event.clientX-rect.left),p.y-(event.clientY-rect.top));
      if(p.visible&&d<distance){
        distance=d;
        best=h;
      }
    }
    return best;
  }
  pointFor(unit,height=unit?.initial.z) {
    if(!this.terrain)return null;
    if(unit?.domain==='ground'){
      const hit=this.raycaster.intersectObject(this.terrainMesh)[0];
      if(hit)return {
        x:hit.point.x,y:-hit.point.z,z:hit.point.y/this.exaggeration
      };
      return null;
    }
    const z=unit&&!['ground','surface'].includes(unit.domain)?height:this.scenario.terrain.seaLevel,plane=new THREE.Plane(new THREE.Vector3(0,1,0),-z*this.exaggeration),p=new THREE.Vector3();
    if(!this.raycaster.ray.intersectPlane(plane,p)||!this.terrain.contains(p.x,-p.z))return null;
    return {
      x:p.x,y:-p.z,z
    };
  }
  pointerDown(event) {
    this.renderer.domElement.focus({
      preventScroll:true
    });
    if(this.drag){
      event.stopImmediatePropagation();
      return;
    }
    this.down={
      x:event.clientX,y:event.clientY,pointerId:event.pointerId
    };
    if(event.button!==0||!this.authoring||this.editMode)return;
    this.updatePointer(event);
    const id=this.pickUnit(event),handle=id?null:this.pickHandle(event);
    if(!id&&!handle)return;
    event.stopImmediatePropagation();
    event.preventDefault();
    const selected=id??handle.id;
    if(selected!==this.selected)this.onSelect(selected);
    this.updatePointer(event);
    const unit=this.editableUnit(),point=this.pointFor(unit,handle?.point.z??unit.initial.z);
    if(!point)return;
    this.controls.enabled=false;
    this.drag={
      id:selected,index:handle?.index??-1,unit,origin:point,point,base:handle?.point??point,pointerId:event.pointerId,moved:false,valid:true
    };
    this.renderer.domElement.setPointerCapture(event.pointerId);
  }
  pointerMove(event) {
    this.updatePointer(event);
    if(!this.drag){
      this.onHover(this.mapPoint());
      return;
    }
    event.stopImmediatePropagation();
    const d=this.drag;
    if(event.pointerId!==d.pointerId)return;
    if(!d.moved&&Math.hypot(event.clientX-this.down.x,event.clientY-this.down.y)<5)return;
    d.moved=true;
    const p=this.pointFor(d.unit,d.index>=0?d.base.z:d.unit.initial.z);
    const proposed=p?{
      x:d.base.x+p.x-d.origin.x,y:d.base.y+p.y-d.origin.y,z:d.base.z
    }
    :null;
    const checked=proposed?this.terrain.project(proposed,d.unit.domain):{
      error:'地形データの範囲外です'
    };
    d.valid=!checked.error;
    d.error=checked.error;
    d.point=checked.point??d.point;
    this.element.classList.toggle('invalid-drop',!d.valid);
    this.element.classList.add('dragging');
    if(p&&d.valid){
      d.delta={
        x:p.x-d.origin.x,y:p.y-d.origin.y
      };
      this.previewDrag(d);
      this.onHover(checked.point);
    }
    this.onDragState?.(d.valid?'ドラッグして配置 · 放すと確定 · Escで取り消し':d.error+' · 放すと変更を取り消します',!d.valid);
  }
  previewDrag(d) {
    if(d.index<0){
      const selected=this.scenario.units.find(u=>u.id===d.id);
      for(const state of this.snapshot.units){
        const u=this.markers.get(state.id)?.unit;
        if(u&&(u.id===d.id||selected.groupId&&u.groupId===selected.groupId)){
          const position={
            ...state.position,x:state.position.x+d.delta.x,y:state.position.y+d.delta.y
          };
          if(u.domain==='ground')position.z=this.terrain.height(position.x,position.y)??position.z;
          this.markers.get(u.id).position.copy(this.world(position,30));
        }
      }
      this.selectedMarker.position.copy(this.markers.get(d.id).position);
      if(this.sensorSphere){
        this.sensorSphere.position.copy(this.markers.get(d.id).position);
        this.sensorSphere.position.y+=-30+(selected.sensor.mountHeight??(selected.domain==='ground'?2:0))*this.exaggeration;
      }
    }else {
      const h=this.handles.find(h=>h.index===d.index);
      if(h)h.mesh.position.copy(this.world(d.point,25));
    }
    if(this.dragPreview){
      this.routes.remove(this.dragPreview);
      this.dragPreview.geometry.dispose();
      this.dragPreview.material.dispose();
    }
    const points=[d.unit.initial,...d.unit.route].map((p,i)=>d.index<0?{
      ...p,x:p.x+d.delta.x,y:p.y+d.delta.y
    }
    :i===d.index+1?d.point:p);
    if(d.unit.routeMode==='loop'&&points.length>1)points.push(points[0]);
    this.dragPreview=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>this.world(this.terrain.project(p,d.unit.domain).point,25))),new THREE.LineBasicMaterial({
      color:'#ffd18b',depthTest:false
    }));
    this.routes.add(this.dragPreview);
  }
  pointerUp(event) {
    if(this.drag){
      event.stopImmediatePropagation();
      if(event.pointerId!==this.drag.pointerId)return;
      const d=this.drag;
      this.drag=null;
      this.controls.enabled=true;
      this.element.classList.remove('dragging','invalid-drop');
      if(this.renderer.domElement.hasPointerCapture(event.pointerId))this.renderer.domElement.releasePointerCapture(event.pointerId);
      this.buildRoutes();
      this.updateSnapshot(this.snapshot);
      if(!d.moved&&d.index>=0)this.onEdit?.({
        ...d,selectOnly:true
      });
      if(d.moved){
        if(d.valid)this.onEdit?.({
          id:d.id,index:d.index,point:d.point,delta:d.delta
        });
        else this.onDragState?.(d.error+' 変更を取り消しました。',true);
      }
      return;
    }
    if(event.button!==0||!this.down||Math.hypot(event.clientX-this.down.x,event.clientY-this.down.y)>5)return;
    this.updatePointer(event);
    if(this.editMode){
      const point=this.mapPoint();
      if(point)this.onMapClick(point);
      return;
    }
    const id=this.pickUnit(event);
    if(id)this.onSelect(id);
  }
  cancelDrag(){
    if(!this.drag)return;
    this.drag=null;
    this.controls.enabled=true;
    this.element.classList.remove('dragging','invalid-drop');
    this.buildRoutes();
    this.updateSnapshot(this.snapshot);
    this.onDragState?.('ドラッグを取り消しました。');
  }
  setAuthoring(enabled){
    this.cancelDrag();
    this.element.classList.toggle('authoring',enabled);
    if(this.authoring===enabled)return;
    this.authoring=enabled;
    this.buildRoutes();
  }
  clearCirclePreview(){
    if(this.circleLine){
      this.scene.remove(this.circleLine);
      this.circleLine.geometry.dispose();
      this.circleLine.material.dispose();
      this.circleLine=null;
    }
  }
  circlePreview(center,edge,unit){
    this.clearCirclePreview();
    if(!unit)return;
    const radius=Math.hypot(edge.x-center.x,edge.y-center.y),points=Array.from({
      length:65
    },(_,i)=>({
      x:center.x+radius*Math.cos(i/64*Math.PI*2),y:center.y+radius*Math.sin(i/64*Math.PI*2),z:unit.initial.z
    })),invalid=points.some(p=>this.terrain.project(p,unit.domain).error);
    this.circleLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>this.world(this.terrain.project(p,unit.domain).point,25))),new THREE.LineBasicMaterial({
      color:invalid?'#f99587':'#ffc476',depthTest:false
    }));
    this.scene.add(this.circleLine);
  }
  focusSelected(){
    const p=this.markers.get(this.selected)?.position;
    if(!p)return;
    const delta=p.clone().sub(this.controls.target);
    this.camera.position.add(delta);
    this.controls.target.copy(p);
    this.controls.update();
  }
  setControls() {
    this.controls?.dispose();
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);
    this.controls.enableDamping=true;
    this.controls.dampingFactor=.12;
    this.controls.maxPolarAngle=this.mode==='top'?Math.PI:Math.PI*.48;
    this.controls.minDistance=1500;
    this.controls.maxDistance=180000;
    this.controls.minZoom=.35;
    this.controls.maxZoom=30;
    this.controls.screenSpacePanning=this.mode==='top';
    this.controls.enableRotate=this.mode==='3d'&&!this.editMode;
    if(this.editMode) this.controls.mouseButtons.LEFT=null;
  }
  resize() {
    const width=this.element.clientWidth,height=this.element.clientHeight;
    this.renderer.setSize(width,height,false);
    this.camera3d.aspect=width/Math.max(height,1);
    this.camera3d.updateProjectionMatrix();
    const half=this.topHeight || 21000;
    this.cameraTop.left=-half*width/Math.max(height,1);
    this.cameraTop.right=half*width/Math.max(height,1);
    this.cameraTop.top=half;
    this.cameraTop.bottom=-half;
    this.cameraTop.updateProjectionMatrix();
  }
  fit() {
    if(!this.terrain)return;
    const t=this.terrain,cx=(t.minX+t.maxX)/2,cy=(t.minY+t.maxY)/2;
    const width=t.maxX-t.minX,height=t.maxY-t.minY,span=Math.max(width,height);
    const aspect=Math.max(.35,this.element.clientWidth/this.element.clientHeight),distance=span*Math.max(1,1.25/aspect);
    this.camera3d.position.set(cx+distance*.75,distance*1.15,-cy+distance*1.05);
    this.camera3d.lookAt(cx,0,-cy);
    this.topHeight=Math.max(height/2+2000,(width/2+2000)/Math.max(.2,this.element.clientWidth/this.element.clientHeight));
    this.cameraTop.position.set(cx,span*3,-cy);
    this.cameraTop.zoom=1;
    this.cameraTop.lookAt(cx,0,-cy);
    this.controls.target.set(cx,0,-cy);
    this.controls.update();
    this.resize();
  }
  setMode(mode) {
    this.mode=mode;
    this.camera=mode==='top'?this.cameraTop:this.camera3d;
    this.setControls();
    this.fit();
  }
  setEditMode(mode) {
    if(this.editMode===mode)return;
    this.editMode=mode;
    const target=this.controls.target.clone();
    this.setControls();
    this.controls.target.copy(target);
    this.controls.update();
  }
  setSelected(id) {
    this.selected=id;
    this.buildLabels();
    this.selectedMarker.userData.id=id;
    this.selectedMarker.material.map?.dispose();
    const unit=this.scenario.units.find(u=>u.id===id);
    this.selectedMarker.visible=!!unit;
    if(unit){
      this.selectedMarker.material.map=this.symbolTexture(unit,true);
      this.selectedMarker.material.needsUpdate=true;
      const marker=this.markers.get(id);
      if(marker)this.selectedMarker.position.copy(marker.position);
    }
    this.buildRoutes();
    this.buildSensorRange();
    this.resetTrails();
  }
  buildSensorRange() {
    disposal(this.sensorRangeGroup);
    this.sensorSphere=null;
    const unit=this.scenario.units.find(u=>u.id===this.selected);
    if(unit?.sensor?.enabled){
      const material=new THREE.MeshBasicMaterial({
        color:'#80dbae',wireframe:true,transparent:true,opacity:.28,depthWrite:false
      });
      this.sensorSphere=new THREE.Mesh(new THREE.SphereGeometry(unit.sensor.range,20,12),material);
      this.sensorSphere.scale.y=this.exaggeration;
      const position=this.snapshot?.units.find(u=>u.id===unit.id)?.position??unit.initial;
      this.sensorSphere.position.copy(this.world({
        ...position,z:position.z+(unit.sensor.mountHeight??(unit.domain==='ground'?2:0))
      }));
      this.sensorRangeGroup.add(this.sensorSphere);
    }
    this.sensorRangeGroup.visible=this.showSensor;
  }
  buildLabels() {
    this.labelLayer.replaceChildren();
    this.labels.clear();
    this.groupLabels=new Map();
    if(this.scenario.units.length>80)for(const group of this.scenario.groups??[]) {
      const label=document.createElement('div');
      label.className='map-label friendly group-label';
      label.textContent=group.name+' · '+group.count+'個';
      this.labelLayer.append(label);
      this.groupLabels.set(group.id,label);
    }
    const candidates=this.scenario.units.length>80?this.scenario.units.filter(u=>u.id===this.selected):this.scenario.units;
    for(const unit of candidates) {
      const label=document.createElement('div');
      label.className='map-label '+unit.faction+(unit.id===this.selected?' selected':'');
      const name=document.createElement('span');
      name.textContent=unit.name;
      const detail=document.createElement('small');
      detail.textContent=DOMAIN_NAMES[unit.domain]+' · '+(unit.manned?'有人':'無人');
      label.append(name,detail);
      label.classList.toggle('detected',!!this.snapshot?.mission?.events.some(e=>e.targetId===unit.id));
      this.labelLayer.appendChild(label);
      this.labels.set(unit.id,label);
    }
  }
  setExaggeration(value) {
    this.exaggeration=value;
    this.terrainKey=null;
    if(this.scenario){
      this.setScenario(this.scenario,this.selected,this.model);
      this.updateSnapshot(this.snapshot);
    }
  }
  world(point,offset=0) {
    return new THREE.Vector3(point.x,point.z*this.exaggeration+offset,-point.y);
  }
  setScenario(scenario,selected,model) {
    this.scenario=scenario;
    this.terrain=new Terrain(scenario.terrain);
    this.model=model??new Simulation(scenario);
    this.selected=selected;
    const key=JSON.stringify(scenario.terrain);
    if(key!==this.terrainKey) {
      this.terrainKey=key;
      this.buildTerrain();
    }
    disposal(this.units);
    this.markers.clear();
    this.batches=[];
    const styles=new Map();
    for(const unit of scenario.units) {
      const key=[unit.domain,unit.faction,unit.manned].join('|');
      if(!styles.has(key))styles.set(key,[]);
      styles.get(key).push(unit);
    }
    for(const units of styles.values()) {
      const mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({
        map:this.symbolTexture(units[0],false),transparent:true,depthTest:false,depthWrite:false,side:THREE.DoubleSide
      }),units.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled=false;
      mesh.renderOrder=10;
      mesh.userData.ids=units.map(u=>u.id);
      this.units.add(mesh);
      this.batches.push(mesh);
      units.forEach((unit,index)=>this.markers.set(unit.id,{
        position:this.world(unit.initial,30),mesh,index,unit
      }));
    }
    this.selectedMarker=new THREE.Sprite(new THREE.SpriteMaterial({
      depthTest:false,depthWrite:false
    }));
    this.selectedMarker.renderOrder=11;
    this.selectedMarker.userData.id=selected;
    this.units.add(this.selectedMarker);
    this.matrix=new THREE.Matrix4();
    this.markerScale=new THREE.Vector3();
    this.setSelected(selected);
  }
  buildTerrain() {
    disposal(this.environment);
    const d=this.scenario.terrain,positions=[],colors=[],indices=[];
    const deep=new THREE.Color('#244960'),shallow=new THREE.Color('#397c87'),lowland=new THREE.Color('#5c896c'),peak=new THREE.Color('#d9d6b6');
    for(let row=0;row<d.rows;row++)for(let col=0;col<d.columns;col++) {
      const h=d.elevations[row*d.columns+col];
      positions.push(d.origin.x+col*d.spacing,h*this.exaggeration,-(d.origin.y+row*d.spacing));
      const color=h<=d.seaLevel?deep.clone().lerp(shallow,Math.max(0,1-(d.seaLevel-h)/1000)):lowland.clone().lerp(peak,Math.min(1,(h-d.seaLevel)/1000));
      colors.push(color.r,color.g,color.b);
      if(row<d.rows-1&&col<d.columns-1){
        const a=row*d.columns+col,b=a+1,c=a+d.columns,e=c+1;
        indices.push(a,b,c,b,e,c);
      }
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    this.terrainMesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({
      vertexColors:true,roughness:1,side:THREE.DoubleSide
    }));
    this.environment.add(this.terrainMesh);
    const t=this.terrain,width=t.maxX-t.minX,height=t.maxY-t.minY;
    this.water=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({
      color:'#4e94bd',transparent:true,opacity:.18,depthWrite:false,side:THREE.DoubleSide
    }));
    this.water.rotation.x=-Math.PI/2;
    this.water.position.set((t.minX+t.maxX)/2,d.seaLevel*this.exaggeration,-(t.minY+t.maxY)/2);
    this.water.renderOrder=2;
    this.water.visible=this.showWater;
    this.environment.add(this.water);
    const grid=[];
    for(let x=Math.ceil(t.minX/5000)*5000;x<=t.maxX;x+=5000)grid.push(x,8,-t.minY,x,8,-t.maxY);
    for(let y=Math.ceil(t.minY/5000)*5000;y<=t.maxY;y+=5000)grid.push(t.minX,8,-y,t.maxX,8,-y);
    const gridGeometry=new THREE.BufferGeometry();
    gridGeometry.setAttribute('position',new THREE.Float32BufferAttribute(grid,3));
    this.environment.add(new THREE.LineSegments(gridGeometry,new THREE.LineBasicMaterial({
      color:'#90bfd5',transparent:true,opacity:.18
    })));
    const border=[{
      x:t.minX,y:t.minY,z:0
    },{
      x:t.maxX,y:t.minY,z:0
    },{
      x:t.maxX,y:t.maxY,z:0
    },{
      x:t.minX,y:t.maxY,z:0
    },{
      x:t.minX,y:t.minY,z:0
    }].map(p=>this.world(p,12));
    this.environment.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(border),new THREE.LineBasicMaterial({
      color:'#658ba5',transparent:true,opacity:.5
    })));
  }
  symbolTexture(unit,selected) {
    const canvas=document.createElement('canvas');
    canvas.width=96;
    canvas.height=96;
    const c=canvas.getContext('2d');
    c.fillStyle='#102437';
    c.strokeStyle=selected?'#ffd18b':COLORS[unit.faction];
    c.lineWidth=4;
    c.beginPath();
    c.arc(48,48,37,0,Math.PI*2);
    c.fill();
    c.stroke();
    c.fillStyle=COLORS[unit.faction];
    c.strokeStyle=COLORS[unit.faction];
    c.lineWidth=3;
    c.beginPath();
    if(unit.domain==='ground'){
      c.rect(32,32,32,32);
      c.fill();
    }
    else if(unit.domain==='surface'){
      c.moveTo(48,24);
      c.lineTo(65,52);
      c.lineTo(57,68);
      c.lineTo(39,68);
      c.lineTo(31,52);
      c.closePath();
      c.fill();
    }
    else if(unit.domain==='subsurface'){
      c.ellipse(48,48,15,24,0,0,Math.PI*2);
      c.fill();
      c.fillRect(62,43,8,10);
    }
    else {
      c.moveTo(48,23);
      c.lineTo(55,43);
      c.lineTo(72,55);
      c.lineTo(72,61);
      c.lineTo(53,55);
      c.lineTo(53,67);
      c.lineTo(61,73);
      c.lineTo(35,73);
      c.lineTo(43,67);
      c.lineTo(43,55);
      c.lineTo(24,61);
      c.lineTo(24,55);
      c.lineTo(41,43);
      c.closePath();
      c.fill();
    }
    if(!unit.manned){
      c.fillStyle='#102437';
      c.beginPath();
      c.arc(48,48,4,0,Math.PI*2);
      c.fill();
    }
    const texture=new THREE.CanvasTexture(canvas);
    texture.colorSpace=THREE.SRGBColorSpace;
    return texture;
  }
  buildRoutes() {
    disposal(this.routes);
    this.handles=[];
    this.dragPreview=null;
    for(const unit of this.scenario.units) {
      if(this.scenario.units.length>80 && unit.id!==this.selected)continue;
      const points=this.model.routePoints(unit.id).map(p=>this.world(p,unit.domain==='ground'?22:0));
      if(points.length>1){
        const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({
          color:unit.id===this.selected?'#ffd18b':COLORS[unit.faction],transparent:true,opacity:unit.id===this.selected?.95:.42
        }));
        this.routes.add(line);
      }
      if(unit.id===this.selected) {
        const definition=this.editableUnit(),raw=[definition.initial,...definition.route];
        // Planned path remains distinct from the generated route.
        const planned=raw.map(p=>this.world(this.terrain.project(p,definition.domain).point,unit.domain==='ground'?24:0));
        if(planned.length>1){
          const geom=new THREE.BufferGeometry().setFromPoints(planned);
          const line=new THREE.Line(geom,new THREE.LineDashedMaterial({
            color:'#e8f1fb',dashSize:250,gapSize:160,transparent:true,opacity:.65
          }));
          line.computeLineDistances();
          this.routes.add(line);
        }
        if(this.authoring)for(let index=0;index<raw.length;index++) {
          const projection=this.terrain.project(raw[index],definition.domain),canvas=document.createElement('canvas');
          canvas.width=64;
          canvas.height=64;
          const c=canvas.getContext('2d');
          c.fillStyle=projection.error?'#f58d7c':'#ffc476';
          c.strokeStyle='#122335';
          c.lineWidth=6;
          c.beginPath();
          c.arc(32,32,25,0,Math.PI*2);
          c.fill();
          c.stroke();
          c.fillStyle='#122335';
          c.font='bold 30px sans-serif';
          c.textAlign='center';
          c.textBaseline='middle';
          c.fillText(String(index),32,33);
          const texture=new THREE.CanvasTexture(canvas),mesh=new THREE.Sprite(new THREE.SpriteMaterial({
            map:texture,depthTest:false
          }));
          mesh.position.copy(this.world(projection.point,25));
          mesh.renderOrder=12;
          this.routes.add(mesh);
          this.handles.push({
            mesh,id:unit.id,index:index-1,point:{
              ...raw[index]
            }
          });
        }
      }
    }
    this.routes.visible=this.showRoutes;
  }
  updateSnapshot(snapshot) {
    if(!snapshot||this.drag)return;
    this.snapshot=snapshot;
    this.groupAnchors=new Map();
    for(const state of snapshot.units){
      const unit=this.markers.get(state.id)?.unit;
      if(unit?.groupId){
        const info=this.groupAnchors.get(unit.groupId)??{
          x:0,y:0,z:0,count:0,blocked:0
        };
        info.x+=state.position.x;
        info.y+=state.position.y;
        info.z+=state.position.z;
        info.count++;
        if(state.status==='blocked')info.blocked++;
        this.groupAnchors.set(unit.groupId,info);
      }
    }
    if(snapshot.time<this.latestTime || snapshot.time===0)this.resetTrails();
    for(const state of snapshot.units) {
      const marker=this.markers.get(state.id);
      if(marker)marker.position.copy(this.world(state.position,30));
      const points=snapshot.trails?.[state.id]??[];
      this.trailPoints.set(state.id,points.map(p=>this.world(p,35)));
    }
    if(this.markers.has(this.selected))this.selectedMarker.position.copy(this.markers.get(this.selected).position);
    if(this.sensorSphere){
      const unit=this.markers.get(this.selected)?.unit,state=snapshot.units.find(u=>u.id===this.selected);
      if(state)this.sensorSphere.position.copy(this.world({
        ...state.position,z:state.position.z+(unit.sensor.mountHeight??(unit.domain==='ground'?2:0))
      }));
    }
    const detected=new Set(snapshot.mission?.events.map(e=>e.targetId)??[]);
    for(const [id,label] of this.labels){
      label.classList.toggle('detected',detected.has(id));
      label.title=detected.has(id)?'探知済み':'';
    }
    disposal(this.detectionGroup);
    for(const event of snapshot.mission?.events.slice(-3)??[]) {
      const geometry=new THREE.BufferGeometry().setFromPoints([this.world(event.observerPosition,15),this.world(event.targetPosition,15)]);
      this.detectionGroup.add(new THREE.Line(geometry,new THREE.LineBasicMaterial({
        color:'#83e5ae',transparent:true,opacity:.8,depthTest:false
      })));
    }
    for(const event of snapshot.actionEvents?.filter(e=>e.type==='received'&&snapshot.time-e.time<=120).slice(-3)??[]) {
      const geometry=new THREE.BufferGeometry().setFromPoints([this.world(event.sourcePosition,15),this.world(event.receiverPosition,15)]);
      this.detectionGroup.add(new THREE.Line(geometry,new THREE.LineBasicMaterial({
        color:'#ffc580',transparent:true,opacity:.85,depthTest:false
      })));
    }
    for(const state of snapshot.units){
      const label=this.labels.get(state.id);
      if(label){
        const unit=this.markers.get(state.id)?.unit;
        label.querySelector('small').textContent=DOMAIN_NAMES[unit.domain]+' · '+({
          standby:'イベント待ち',preparing:'出発準備',moving:'移動中',arrived:'到着',blocked:'停止',waiting:'時間待ち',idle:'待機'
        })[state.status];
      }
    }
    this.latestTime=snapshot.time;
    disposal(this.trails);
    for(const unit of this.scenario.units) {
      if(this.scenario.units.length>80 && unit.id!==this.selected)continue;
      const points=this.trailPoints.get(unit.id)||[];
      if(points.length>1)this.trails.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({
        color:COLORS[unit.faction],transparent:true,opacity:.75
      })));
    }
    this.trails.visible=this.showTrails;
  }
  resetTrails(){
    this.trailPoints.clear();
    this.latestTime=0;
    disposal(this.trails);
  }
  updatePointer(event) {
    const rect=this.renderer.domElement.getBoundingClientRect();
    this.camera.updateMatrixWorld();
    this.pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    this.raycaster.setFromCamera(this.pointer,this.camera);
  }
  mapPoint() {
    return this.pointFor(this.editMode==='create'||this.editMode?.startsWith('shared-')?this.placementUnit:this.editMode?this.editableUnit():null);
  }
  setLabelsVisible(visible){
    this.labelLayer.hidden=!visible;
  }
  render() {
    if(!this.drag)this.controls.update();
    const width=this.element.clientWidth,height=this.element.clientHeight,occupied=[];
    this.camera.updateMatrixWorld();
    const sorted=[...this.markers.entries()].sort(([a],[b])=>(b===this.selected?1:0)-(a===this.selected?1:0));
    for(const [id,marker] of sorted) {
      const projected=marker.position.clone().project(this.camera),label=this.labels.get(id);
      const visible=projected.z>=-1&&projected.z<=1&&Math.abs(projected.x)<1.1&&Math.abs(projected.y)<1.1;
      if(label)label.hidden=!visible;
      const pixels=id===this.selected?36:this.scenario.units.length>80?15:30;
      const scale=this.mode==='top'?(this.camera.top-this.camera.bottom)/this.camera.zoom/height*pixels:2*Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2))*marker.position.distanceTo(this.camera.position)/height*pixels;
      this.markerScale.setScalar(Math.max(10,scale));
      this.matrix.compose(marker.position,this.camera.quaternion,this.markerScale);
      marker.mesh.setMatrixAt(marker.index,this.matrix);
      if(id===this.selected)this.selectedMarker.scale.copy(this.markerScale);
      if(visible&&label&&!this.labelLayer.hidden){
        let x=(projected.x*.5+.5)*width+18,y=(-projected.y*.5+.5)*height-16;
        const w=label.offsetWidth,h=label.offsetHeight;
        x=Math.max(4,Math.min(width-w-4,x));
        y=Math.max(52,Math.min(height-h-35,y));
        for(let attempt=0;attempt<8;attempt++){
          if(!occupied.some(rect=>x<rect.x+rect.w&&x+w>rect.x&&y<rect.y+rect.h&&y+h>rect.y))break;
          y+=h+3;
          if(y>height-h-36)y=Math.max(52,y-(attempt+2)*(h+3));
        }
        label.style.transform='translate('+Math.round(x)+'px,'+Math.round(y)+'px)';
        occupied.push({
          x,y,w,h
        });
      }
    }
    for(const [id,info] of this.groupAnchors??[]) {
      const label=this.groupLabels.get(id);
      if(!label)continue;
      const p=this.world({
        x:info.x/info.count,y:info.y/info.count,z:info.z/info.count
      }).project(this.camera);
      label.hidden=p.z < -1||p.z>1||Math.abs(p.x)>1.1||Math.abs(p.y)>1.1;
      const group=this.scenario.groups.find(g=>g.id===id);
      label.textContent=group.name+' · '+info.count+'個'+(info.blocked?' · 停止 '+info.blocked:'');
      label.className='map-label group-label '+group.template.faction;
      label.style.transform='translate('+Math.round((p.x*.5+.5)*width+20)+'px,'+Math.round((-p.y*.5+.5)*height+22)+'px)';
    }
    for(const h of this.handles){
      const hp=this.screenPoint(h.mesh.position),sp=this.selectedMarker?this.screenPoint(this.selectedMarker.position):null;
      h.mesh.visible=h.index!==-1||!sp||Math.hypot(hp.x-sp.x,hp.y-sp.y)>24;
      const pixels=22,scale=this.mode==='top'?(this.camera.top-this.camera.bottom)/this.camera.zoom/height*pixels:2*Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2))*h.mesh.position.distanceTo(this.camera.position)/height*pixels;
      h.mesh.scale.setScalar(Math.max(10,scale));
    }
    for(const mesh of this.batches??[]){
      mesh.instanceMatrix.needsUpdate=true;
      mesh.computeBoundingSphere();
    }
    const center=this.controls.target.clone(),north=center.clone().add(new THREE.Vector3(0,0,-1000));
    center.project(this.camera);
    north.project(this.camera);
    document.getElementById('north-arrow').style.transform='rotate('+Math.atan2((north.x-center.x)*width,(north.y-center.y)*height)+'rad)';
    this.renderer.render(this.scene,this.camera);
  }
}
