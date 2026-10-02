// Pure simulation model: metres, seconds; x=east, y=north, z=height above sea level.
export const DOMAINS = ['ground', 'surface', 'subsurface', 'air'];
export const DOMAIN_NAMES = {ground:'地上', surface:'水上', subsurface:'水中', air:'空中'};
export const clone = value => JSON.parse(JSON.stringify(value));
const finite = value => typeof value === 'number' && Number.isFinite(value);
const pointValid = p => p && ['x','y','z'].every(k => finite(p[k]));

export function validateScenario(value) {
  const errors = [];
  if (!value || typeof value !== 'object') throw new Error('シナリオはオブジェクトで指定してください。');
  if (value.version !== 1) errors.push('versionは1にしてください。');
  if (value.unitsSystem !== 'SI') errors.push('unitsSystemはSI（m・s）にしてください。');
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 160) errors.push('titleは1～160文字で指定してください。');
  if (!finite(value.duration) || value.duration <= 0 || value.duration > 86400) errors.push('durationは0より大きく86400秒以下にしてください。');
  const t = value.terrain;
  if (!t || !Number.isInteger(t.columns) || !Number.isInteger(t.rows) || t.columns < 2 || t.rows < 2 || t.columns > 513 || t.rows > 513) {
    errors.push('terrainのcolumns・rowsは2～513の整数にしてください。');
  } else {
    if (!finite(t.spacing) || t.spacing < 1 || t.spacing > 10000) errors.push('terrain.spacingは1～10000mにしてください。');
    if (!t.origin || !finite(t.origin.x) || !finite(t.origin.y)) errors.push('terrain.originのx・yが必要です。');
    if (!Array.isArray(t.elevations) || t.elevations.length !== t.columns*t.rows || t.elevations.some(h => !finite(h) || h < -12000 || h > 10000)) errors.push('terrain.elevationsは格子数と同じ長さの標高配列（-12000～10000m）にしてください。');
    if (!finite(t.seaLevel)) errors.push('terrain.seaLevelが必要です。');
  }
  if (!Array.isArray(value.units) || value.units.length > 200) errors.push('unitsは最大200件の配列にしてください。');
  else {
    const ids = new Set();
    value.units.forEach((u,index) => {
      const prefix = 'units['+index+']';
      if (!u || typeof u !== 'object') {errors.push(prefix+': オブジェクトが必要です。');return;}
      if (typeof u.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(u.id) || ids.has(u.id)) errors.push(prefix+': idは重複しない英数字・_・-にしてください。');
      ids.add(u.id);
      if (typeof u.name !== 'string' || !u.name.trim() || u.name.length > 120) errors.push(prefix+': nameは1～120文字にしてください。');
      if (!DOMAINS.includes(u.domain)) errors.push(prefix+': domainが不正です。');
      if (!['friendly','hostile','neutral'].includes(u.faction)) errors.push(prefix+': factionが不正です。');
      if (typeof u.manned !== 'boolean') errors.push(prefix+': mannedはbooleanにしてください。');
      if (!finite(u.speed) || u.speed < 0 || u.speed > 1500) errors.push(prefix+': speedは0～1500m/sにしてください。');
      if (!pointValid(u.initial)) errors.push(prefix+': initialのx,y,zが必要です。');
      if (!['once','loop','pingpong'].includes(u.routeMode)) errors.push(prefix+': routeModeが不正です。');
      if (!Array.isArray(u.route) || u.route.length > 500 || u.route.some(p => !pointValid(p))) errors.push(prefix+': routeは最大500件、各点にx,y,zが必要です。');
    });
  }
  if (errors.length) throw new Error(errors.slice(0,30).join('\n'));
  return clone(value);
}

export class Terrain {
  constructor(data) {
    this.data = data;
    this.minX = data.origin.x; this.minY = data.origin.y;
    this.maxX = this.minX+(data.columns-1)*data.spacing;
    this.maxY = this.minY+(data.rows-1)*data.spacing;
  }
  contains(x,y) {return finite(x) && finite(y) && x >= this.minX && x <= this.maxX && y >= this.minY && y <= this.maxY;}
  height(x,y) {
    if (!this.contains(x,y)) return null;
    const d=this.data, gx=(x-this.minX)/d.spacing, gy=(y-this.minY)/d.spacing;
    const ix=Math.min(d.columns-2,Math.floor(gx)), iy=Math.min(d.rows-2,Math.floor(gy));
    const fx=gx-ix, fy=gy-iy, at=(dx,dy)=>d.elevations[(iy+dy)*d.columns+ix+dx];
    return (at(0,0)*(1-fx)+at(1,0)*fx)*(1-fy)+(at(0,1)*(1-fx)+at(1,1)*fx)*fy;
  }
  project(point,domain) {
    const p={...point}, h=this.height(p.x,p.y), sea=this.data.seaLevel;
    if (h===null) return {point:p, error:'地形データの範囲外です'};
    if (domain==='ground') {p.z=h;if(h<=sea) return {point:p,error:'地上ユニットは陸上に配置してください'};}
    if (domain==='surface') {p.z=sea;if(h>sea-5) return {point:p,error:'水上ユニットには5m以上の水深が必要です'};}
    if (domain==='subsurface' && (p.z>sea-1 || p.z<h+5 || h>=sea)) return {point:p,error:'水中ユニットは海面下かつ海底から5m以上離してください'};
    if (domain==='air' && p.z<=Math.max(h,sea)+10) return {point:p,error:'空中ユニットは地表・海面から10mより高くしてください'};
    return {point:p,error:null};
  }
}

const distance = (a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const lerpPoint = (a,b,f)=>({x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,z:a.z+(b.z-a.z)*f});
export class Simulation {
  constructor(scenario) {
    this.scenario=validateScenario(scenario);
    this.terrain=new Terrain(this.scenario.terrain);
    this.paths=new Map(this.scenario.units.map(u=>[u.id,this.compile(u)]));
  }
  compile(unit) {
    const start=this.terrain.project(unit.initial,unit.domain);
    const nodes=[{...start.point,d:0}];
    if (start.error) return {nodes,length:0,error:start.error,errorAt:'初期位置',periodic:false};
    const points=[unit.initial,...unit.route];
    if (unit.route.length && unit.routeMode==='loop') points.push(unit.initial);
    if (unit.route.length && unit.routeMode==='pingpong') points.push(...points.slice(0,-1).reverse());
    const sampleDistance=Math.min(125,this.scenario.terrain.spacing/4);
    for(let index=1;index<points.length;index++) {
      const a=points[index-1],b=points[index];
      const samples=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/sampleDistance));
      // Bound work on invalid out-of-area imports without allocating enormous arrays.
      if (samples > 20000) return {nodes,length:nodes.at(-1).d,error:'経路区間が長すぎます',errorAt:'区間 '+index,periodic:false};
      for(let n=1;n<=samples;n++) {
        const projected=this.terrain.project(lerpPoint(a,b,n/samples),unit.domain);
        if (projected.error) return {nodes,length:nodes.at(-1).d,error:projected.error,errorAt:'区間 '+index,periodic:false};
        const previous=nodes.at(-1),d=previous.d+distance(previous,projected.point);
        if(d>previous.d) nodes.push({...projected.point,d});
      }
    }
    return {nodes,length:nodes.at(-1).d,error:null,errorAt:null,periodic:unit.routeMode!=='once'};
  }
  evaluate(time) {
    const t=Math.min(this.scenario.duration,Math.max(0,Number(time)||0));
    return {time:t,units:this.scenario.units.map(u=>{
      const path=this.paths.get(u.id),travel=u.speed*t;
      const d=path.periodic && path.length>0 ? travel%path.length : Math.min(travel,path.length);
      let left=0,right=path.nodes.length-1;
      while(left<right) {const mid=Math.ceil((left+right)/2);if(path.nodes[mid].d<=d) left=mid;else right=mid-1;}
      const a=path.nodes[left],b=path.nodes[Math.min(left+1,path.nodes.length-1)];
      let position=lerpPoint(a,b,b.d>a.d?(d-a.d)/(b.d-a.d):0);
      if(u.domain==='ground') position.z=this.terrain.height(position.x,position.y) ?? position.z;
      let status=path.length===0?'idle':'moving';
      if(path.error && travel>=path.length) status='blocked';
      else if(!path.periodic && path.length>0 && travel>=path.length) status='arrived';
      else if(u.speed===0) status='idle';
      return {id:u.id,position,status,heading:Math.atan2(b.x-a.x,b.y-a.y),distance:Math.min(travel,path.periodic?travel:path.length),routeDistance:path.length,
        error:path.error,errorAt:path.errorAt,eta:u.speed>0?path.length/u.speed:null};
    })};
  }
  routePoints(id) {return this.paths.get(id)?.nodes || [];}
}
