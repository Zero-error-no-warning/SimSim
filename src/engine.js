import {measurementErrors} from './measurement-points.js?v=20261006-four-panes-16';
import {Terrain} from './terrain.js?v=20261006-four-panes-16';
export {Terrain} from './terrain.js?v=20261006-four-panes-16';
import {navigationProfileErrors} from './route-planner.js?v=20261006-four-panes-16';
import {materializeRoutes} from './route-planner.js?v=20261006-four-panes-16';
import {stateGoalErrors} from './state-measurement.js?v=20261006-four-panes-16';
import { readParameter } from './parameters.js?v=20261006-four-panes-16';
import { sharedErrors, migrateTriggers } from './shared-settings.js?v=20261006-four-panes-16';
import { actionErrors } from './action-settings.js?v=20261006-four-panes-16';
import { sensorErrors,missionErrors,analysisErrors } from './detection-settings.js?v=20261006-four-panes-16';
import { expandGroups, noiseVector, random01, streamKey } from './random.js?v=20261006-four-panes-16';
// Pure simulation model: metres, seconds; x=east, y=north, z=height above sea level.
export const MAX_UNITS = 2000;
export const DOMAINS = ['ground', 'surface', 'subsurface', 'air'];
export const DOMAIN_NAMES = {
  ground:'地上', surface:'水上', subsurface:'水中', air:'空中'
};
export const clone = value => JSON.parse(JSON.stringify(value));
const finite = value => typeof value === 'number' && Number.isFinite(value);
const pointValid = p => p && ['x','y','z'].every(k => finite(p[k]));
export function validateScenario(value) {
  const errors = [];
  if (!value || typeof value !== 'object') throw new Error('シナリオはオブジェクトで指定してください。');
  if (![1,2,3].includes(value.version)) errors.push('versionは1・2・3にしてください。');
  if (value.unitsSystem !== 'SI') errors.push('unitsSystemはSI（m・s）にしてください。');
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 160) errors.push('titleは1～160文字で指定してください。');
  if (!finite(value.duration) || value.duration <= 0 || value.duration > 86400) errors.push('durationは0より大きく86400秒以下にしてください。');
  const t = value.terrain;
  if (!t || !Number.isInteger(t.columns) || !Number.isInteger(t.rows) || t.columns < 2 || t.rows < 2 || t.columns > 513 || t.rows > 513) {
    errors.push('terrainのcolumns・rowsは2～513の整数にしてください。');
  } else {
    if (!finite(t.spacing) || t.spacing < 1 || t.spacing > 10000) errors.push('terrain.spacingは1～10000mにしてください。');
    if (t.spacingY !== undefined && (!finite(t.spacingY) || t.spacingY < 1 || t.spacingY > 10000)) errors.push('terrain.spacingYは1～10000mにしてください。');
    if (!t.origin || !finite(t.origin.x) || !finite(t.origin.y)) errors.push('terrain.originのx・yが必要です。');
    if (!Array.isArray(t.elevations) || t.elevations.length !== t.columns*t.rows || t.elevations.some(h => !finite(h) || h < -12000 || h > 10000)) errors.push('terrain.elevationsは格子数と同じ長さの標高配列（-12000～10000m）にしてください。');
    if (!finite(t.seaLevel)) errors.push('terrain.seaLevelが必要です。');
  }
  if (value.seed !== undefined && (typeof value.seed !== 'string' || value.seed.length>100)) errors.push('seedは100文字以下の文字列にしてください。');
  if (value.trial !== undefined && (!Number.isInteger(value.trial)||value.trial<0||value.trial>1000000000)) errors.push('trialは0～1000000000の整数にしてください。');
  const groups=value.groups??[],groupIds=new Set();
  if(!Array.isArray(groups)||groups.length>100) errors.push('groupsは最大100件の配列にしてください。');
  else for(const g of groups) {
    if(!g || typeof g!=='object'){
      errors.push('groupはオブジェクトにしてください。');
      continue;
    }
    if(g.enabled!==undefined&&typeof g.enabled!=='boolean')errors.push('group.enabledはbooleanにしてください。');
    if(typeof g.id!=='string'||! /^[a-zA-Z0-9_-]{1,50}$/.test(g.id)||groupIds.has(g.id)) errors.push('group.idは重複しない英数字・_・-（50文字以下）にしてください。');
    groupIds.add(g.id);
    if(typeof g.name!=='string'||!g.name.trim()||g.name.length>100) errors.push('group.nameは1～100文字にしてください。');
    if(!Number.isInteger(g.count)||g.count<1||g.count>MAX_UNITS) errors.push('group.countは1～2000にしてください。');
    if(g.loopStartMode!==undefined&&!['template','even','random'].includes(g.loopStartMode))errors.push('group.loopStartModeはtemplate、even、randomにしてください。');
    if(!['grid','random'].includes(g.placement)) errors.push('group.placementはgridまたはrandomにしてください。');
    for(const k of ['width','height'])if(!finite(g[k])||g[k]<0||g[k]>100000)errors.push('group.'+k+'は0～100000mにしてください。');
  }
  if (!Array.isArray(value.units) || value.units.length > MAX_UNITS) errors.push('unitsは最大2000件の配列にしてください。');
  else {
    const ids = new Set(),recipientIds=new Set(value.units.map(u=>u?.id));
    [...value.units,...(Array.isArray(groups)?groups.map(g=>g?.template):[])].forEach((u,index) => {
      const prefix = 'units['+index+']';
      if (!u || typeof u !== 'object') {
        errors.push(prefix+': オブジェクトが必要です。');return;
      }
      if (typeof u.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(u.id) || (index<value.units.length && ids.has(u.id))) errors.push(prefix+': idは重複しない英数字・_・-にしてください。');
      if(index<value.units.length)ids.add(u.id);
      if (typeof u.name !== 'string' || !u.name.trim() || u.name.length > 120) errors.push(prefix+': nameは1～120文字にしてください。');
      errors.push(...sensorErrors(u,prefix),...actionErrors(u,prefix,recipientIds));
      if(value.version===3&&u.behavior)errors.push(prefix+': 旧行動ルールは読み込み時にノードへ変換してください。');
      if(u.navigation!==undefined)errors.push(...navigationProfileErrors(u.navigation));
      if (!DOMAINS.includes(u.domain)) errors.push(prefix+': domainが不正です。');
      if (!['friendly','hostile','neutral'].includes(u.faction)) errors.push(prefix+': factionが不正です。');
      if(u.enabled!==undefined&&typeof u.enabled!=='boolean')errors.push(prefix+': enabledはbooleanにしてください。');
      if (typeof u.manned !== 'boolean') errors.push(prefix+': mannedはbooleanにしてください。');
      if (!finite(u.speed) || u.speed < 0 || u.speed > 1500) errors.push(prefix+': speedは0～1500m/sにしてください。');
      if (!pointValid(u.initial)) errors.push(prefix+': initialのx,y,zが必要です。');
      if (!['once','loop','pingpong'].includes(u.routeMode)) errors.push(prefix+': routeModeが不正です。');
      if(u.groupId!==undefined && index<value.units.length) errors.push(prefix+': groupIdは生成ユニット専用です。');
      if(u.motion!==undefined) {
        if(!u.motion||typeof u.motion!=='object'||Array.isArray(u.motion)) errors.push(prefix+': motionはオブジェクトにしてください。');
        else for(const [key,min,max] of [['horizontal',0,10000],['vertical',0,3000],['commonHorizontal',0,10000],['scale',10,100000],['startDelay',0,86400],['speedVariation',0,1],['loopStart',0,1]]) {
          if(u.motion[key]!==undefined && (!finite(u.motion[key])||u.motion[key]<min||u.motion[key]>max))errors.push(prefix+': motion.'+key+'は'+min+'～'+max+'にしてください。');
        }
      }
      if (!Array.isArray(u.route) || u.route.length > 500 || u.route.some(p => !pointValid(p))) errors.push(prefix+': routeは最大500件、各点にx,y,zが必要です。');
    });
  }
  if(Array.isArray(value.units)&&Array.isArray(groups)&&!errors.length) {
    const total=value.units.length+groups.reduce((n,g)=>n+g.count,0);
    if(total>MAX_UNITS)errors.push('単体と群を合わせて最大2000ユニットにしてください。');
    else {
      const expanded=expandGroups(value);
      if(new Set(expanded.map(u=>u.id)).size!==total)errors.push('生成ユニットのidが単体ユニットと重複しています。');
    }
  }
  errors.push(...missionErrors(value.mission,value.duration),...analysisErrors(value.analysis,value.duration),...sharedErrors(value),...stateGoalErrors(value),...measurementErrors(value));
  if(value.mission?.type==='arrive'&&value.mission.responderIds?.some(id=>!value.units?.some(u=>u.id===id)))errors.push('到着評価の対象となる単体ユニットが見つかりません。');
  if(value.version===3&&!errors.length)for(const b of [...(value.analysis?.factors??[]),...(value.analysis?.uncertainties??[])]){
    try{
      readParameter(value,b);
    }catch(e){
      errors.push(e.message);
    }
  }
  if (errors.length) throw new Error(errors.slice(0,30).join('\n'));
  return materializeRoutes(migrateTriggers(clone(value)));
}
const distance = (a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const lerpPoint = (a,b,f)=>({
  x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,z:a.z+(b.z-a.z)*f
});
// Rotate a sampled closed path without changing the reference geometry or its direction.
function rotateLoop(points,fraction) {
  const distances=[0];
  for(let i=1;i<points.length;i++)distances.push(distances.at(-1)+distance(points[i-1],points[i]));
  const length=distances.at(-1);
  if(length===0)return points;
  const offset=length*fraction,index=distances.findIndex((d,i)=>i>0&&d>offset),i=index<0?points.length-1:index;
  const start=lerpPoint(points[i-1],points[i],(offset-distances[i-1])/(distances[i]-distances[i-1]));
  return [start,...points.slice(i,-1),...points.slice(0,i),{
    ...start
  }];
}
export class Simulation {
  constructor(scenario,{
    deferPaths=false
  }
  ={
  }) {
    const source=validateScenario(scenario);
    this.source=source;
    this.scenario={
      ...source,units:expandGroups(source)
    };
    this.nodeCount=0;
    
    this.terrain=new Terrain(this.scenario.terrain);
    this.paths=deferPaths?new Map():new Map(this.scenario.units.filter(u=>u.enabled!==false).map(u=>[u.id,this.compile(u)]));
  }
  compile(unit) {
    const start=this.terrain.project(unit.initial,unit.domain);
    let nodes=[{
      ...start.point,d:0
    }];
    const motion=unit.motion??{
    },key=streamKey(this.scenario,unit.id,'motion');
    const delay=(motion.startDelay??0)*random01(key+'|delay');
    const actualSpeed=unit.speed*(1+(random01(key+'|speed')*2-1)*(motion.speedVariation??0));
    const runtime={
      delay,actualSpeed
    },phase=unit.routeMode==='loop'?(motion.loopStart??0)%1:0,phased=phase>0&&unit.route.length>0;
    if (start.error&&!phased) return {
      ...runtime,nodes,length:0,error:start.error,errorAt:'初期位置',periodic:false
    };
    let points=[start.point,...unit.route.map(p=>this.terrain.project(p,unit.domain).point)];
    if(unit.route.length && unit.routeMode==='loop')points.push(start.point);
    const nominalLength=points.slice(1).reduce((d,p,i)=>d+distance(points[i],p),0);
    if(nominalLength>0 && ((motion.horizontal??0)+(motion.vertical??0)+(motion.commonHorizontal??0)>0)) {
      const generated=[start.point],scale=motion.scale??2000,step=Math.min(125,this.terrain.cellSize/4,scale/8);
      let along=0;
      for(let i=1;i<points.length;i++) {
        const a=points[i-1],b=points[i],length=distance(a,b),count=Math.max(1,Math.ceil(length/step));
        if(count>20000)throw new Error('航跡生成の区間が長すぎます。');
        for(let j=1;j<=count;j++) {
          const d=along+length*j/count,p=lerpPoint(a,b,j/count);
          const envelope=Math.min(1,d/scale,(nominalLength-d)/scale);
          // Anchor departure and final destination.
          const fade=Math.max(0,envelope);
          const weight=fade*fade*(3-2*fade);
          const individual=noiseVector(key,d,scale),common=noiseVector(streamKey(this.scenario,unit.groupId??unit.id,'common-motion'),d,scale);
          p.x+=weight*(individual[0]*(motion.horizontal??0)+common[0]*(motion.commonHorizontal??0));
          p.y+=weight*(individual[1]*(motion.horizontal??0)+common[1]*(motion.commonHorizontal??0));
          if(['subsurface','air'].includes(unit.domain))p.z+=weight*individual[2]*(motion.vertical??0);
          generated.push(p);
          if(generated.length>100000)throw new Error('航跡生成の点数が多すぎます。経路を短くするか変動間隔を大きくしてください。');
        }
        along+=length;
      }
      points=generated;
    }
    if(phased) {
      // Sample/project the whole reference loop before choosing a departure point.
      // Retain invalid sections: after rotation the usual constraint check stops at the
      // first obstacle reached from this departure, rather than at the reference anchor.
      const sampled=[points[0]],spacing=Math.min(125,this.terrain.cellSize/4);
      for(let i=1;i<points.length;i++) {
        const a=points[i-1],b=points[i],count=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/spacing));
        if(count>20000)return {
          ...runtime,nodes,length:0,error:'経路区間が長すぎます',errorAt:'初期位置',periodic:false
        };
        for(let j=1;j<=count;j++) {
          sampled.push(this.terrain.project(lerpPoint(a,b,j/count),unit.domain).point);
          if(sampled.length>2000001)throw new Error('経路全体のサンプル点数が上限200万点を超えました。');
        }
      }
      points=rotateLoop(sampled,phase);
      const departure=this.terrain.project(points[0],unit.domain);
      nodes=[{
        ...departure.point,d:0
      }];
      if(departure.error)return {
        ...runtime,nodes,length:0,error:departure.error,errorAt:'初期位置',periodic:false
      };
    }
    const actualForward=points.slice();
    if (unit.route.length && unit.routeMode==='pingpong') points.push(...actualForward.slice(0,-1).reverse());
    const sampleDistance=Math.min(125,this.terrain.cellSize/4);
    for(let index=1;index<points.length;index++) {
      const a=points[index-1],b=points[index];
      const samples=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/sampleDistance));
      // Bound work on invalid out-of-area imports without allocating enormous arrays.
      if (samples > 20000) return {
        ...runtime,nodes,length:nodes.at(-1).d,error:'経路区間が長すぎます',errorAt:'区間 '+index,periodic:false
      };
      for(let n=1;n<=samples;n++) {
        const projected=this.terrain.project(lerpPoint(a,b,n/samples),unit.domain);
        if (projected.error) return {
          ...runtime,nodes,length:nodes.at(-1).d,error:projected.error,errorAt:'区間 '+index,periodic:false
        };
        const previous=nodes.at(-1),d=previous.d+distance(previous,projected.point);
        if(d>previous.d) {
          nodes.push({
            ...projected.point,d
          });
          if(++this.nodeCount>2000000)throw new Error('経路全体のサンプル点数が上限200万点を超えました。');
        }
      }
    }
    return {
      ...runtime,nodes,length:nodes.at(-1).d,error:null,errorAt:null,periodic:unit.routeMode!=='once'
    };
  }
  evaluate(time) {
    const t=Math.min(this.scenario.duration,Math.max(0,Number(time)||0));
    return {
      time:t,units:this.scenario.units.map(u=>this.evaluateUnit(u,t))
    };
  }
  evaluateUnit(u,time,limitTime=true) {
    if(u.enabled===false)return {id:u.id,position:{...u.initial},status:'disabled',heading:0,distance:0,routeDistance:0,error:null,errorAt:null,actualSpeed:0,startDelay:0,eta:null};
    const elapsed=Math.max(0,Number(time)||0),t=limitTime?Math.min(this.scenario.duration,elapsed):elapsed;
    const path=this.paths.get(u.id),actualSpeed=path.actualSpeed??u.speed;
    const delay=path.delay??0,rawTravel=actualSpeed*Math.max(0,t-delay);
    const travel=!path.periodic&&actualSpeed>0&&t>=delay+path.length/actualSpeed?Math.max(rawTravel,path.length):rawTravel;
    const d=path.periodic && path.length>0 ? travel%path.length : Math.min(travel,path.length);
    let left=0,right=path.nodes.length-1;
    while(left<right) {
      const mid=Math.ceil((left+right)/2);
      if(path.nodes[mid].d<=d) left=mid;
      else right=mid-1;
    }
    const a=path.nodes[left],b=path.nodes[Math.min(left+1,path.nodes.length-1)];
    let position=lerpPoint(a,b,b.d>a.d?(d-a.d)/(b.d-a.d):0);
    if(u.domain==='ground') position.z=this.terrain.height(position.x,position.y) ?? position.z;
    let status=path.length===0?'idle':'moving';
    if(path.error && travel>=path.length) status='blocked';
    else if(!path.periodic && path.length>0 && travel>=path.length) status='arrived';
    else if(actualSpeed===0) status='idle';
    else if(t<delay)status='waiting';
    return {
      id:u.id,position,status,heading:Math.atan2(b.x-a.x,b.y-a.y),distance:Math.min(travel,path.periodic?travel:path.length),routeDistance:path.length,
      error:path.error,errorAt:path.errorAt,actualSpeed,startDelay:Number.isFinite(delay)?delay:null,eta:actualSpeed>0&&Number.isFinite(delay)?delay+path.length/actualSpeed:null
    };
  }
  routePoints(id) {
    return this.paths.get(id)?.nodes || [];
  }
}
