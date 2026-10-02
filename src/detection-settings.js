import {variableErrors} from './parameters.js?v=0.4';
export const DOMAIN_KEYS=['ground','surface','subsurface','air'];
export const FACTIONS=['friendly','hostile','neutral'];
const finite=v=>typeof v==='number'&&Number.isFinite(v);
export function sensorErrors(unit,prefix='unit') {
  const errors=[],s=unit.sensor;
  if(unit.detectability!==undefined&&(!finite(unit.detectability)||unit.detectability<0||unit.detectability>10))errors.push(prefix+': detectabilityは0～10にしてください。');
  if(s!==undefined) {
    if(!s||typeof s!=='object'||Array.isArray(s))return [...errors,prefix+': sensorはオブジェクトにしてください。'];
    if(typeof s.enabled!=='boolean')errors.push(prefix+': sensor.enabledはbooleanにしてください。');
    if(!finite(s.range)||s.range<=0||s.range>100000)errors.push(prefix+': sensor.rangeは0より大きく100000m以下にしてください。');
    if(!finite(s.probabilityPerMinute)||s.probabilityPerMinute<0||s.probabilityPerMinute>1)errors.push(prefix+': sensor.probabilityPerMinuteは0～1にしてください。');
    if(!Array.isArray(s.domains)||!s.domains.length||s.domains.some(d=>!DOMAIN_KEYS.includes(d)))errors.push(prefix+': sensor.domainsには対象領域を1つ以上指定してください。');
    if(typeof s.terrainLOS!=='boolean')errors.push(prefix+': sensor.terrainLOSはbooleanにしてください。');
    if(s.mountHeight!==undefined&&(!finite(s.mountHeight)||s.mountHeight<0||s.mountHeight>1000))errors.push(prefix+': sensor.mountHeightは0～1000mにしてください。');
  }
  return errors;
}
export function missionErrors(m,duration) {
  if(m===undefined)return [];
  const errors=[];
  if(!m||typeof m!=='object'||Array.isArray(m))return ['missionはオブジェクトにしてください。'];
  if(m.type!=='detect')errors.push('mission.typeはdetectにしてください。');
  if(!FACTIONS.includes(m.observerFaction)||!FACTIONS.includes(m.targetFaction)||m.observerFaction===m.targetFaction)errors.push('観測側と対象側には異なる陣営を指定してください。');
  if(!['any','all'].includes(m.join))errors.push('mission.joinはanyまたはallにしてください。');
  if(!finite(m.deadline)||m.deadline<=0||m.deadline>duration)errors.push('mission.deadlineは0より大きく終了時刻以下にしてください。');
  if(m.targetIds!==undefined&&(!Array.isArray(m.targetIds)||!m.targetIds.length||m.targetIds.length>2000||m.targetIds.some(id=>typeof id!=='string')||new Set(m.targetIds).size!==m.targetIds.length))errors.push('mission.targetIdsは重複しない対象IDの配列にしてください。');
  return errors;
}
export function analysisErrors(a,duration) {
  if(a===undefined)return [];
  if(!a||typeof a!=='object'||Array.isArray(a))return ['analysisはオブジェクトにしてください。'];
  const errors=[];
  if(typeof a.groupId!=='string')errors.push('analysis.groupIdは文字列にしてください。');
  if(a.groupId&&(!Array.isArray(a.counts)||!a.counts.length||a.counts.length>12||a.counts.some(n=>!Number.isInteger(n)||n<0||n>2000)||new Set(a.counts).size!==a.counts.length))errors.push('analysis.countsは重複しない0～2000の整数（最大12条件）にしてください。');
  if(!Number.isInteger(a.trials)||a.trials<1||a.trials>2000)errors.push('analysis.trialsは1～2000にしてください。');
  if(!finite(a.step)||a.step<1||a.step>300||Math.ceil(duration/a.step)>20000)errors.push('判定間隔は1～300秒、シナリオ全体で2万区間以内にしてください。');
  if(!finite(a.requiredRate)||a.requiredRate<0||a.requiredRate>1)errors.push('analysis.requiredRateは0～1にしてください。');
  errors.push(...variableErrors(a,duration));
  return errors;
}
