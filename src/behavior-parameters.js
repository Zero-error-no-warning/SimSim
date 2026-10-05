// Typed placeholders on a behavior, concrete bindings on each assignment.
export const PARAMETER_TYPES={number:'数値',route:'経路',destination:'目的地',unit:'単体ユニット'};
export const PARAMETER_FIELDS={routeId:'route',destinationId:'destination',receiverId:'unit',seconds:'number',speedFraction:'number',distance:'number'};
export const isParameterRef=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===1&&typeof v.$param==='string';
export function resolveValue(value,graph,assignment){
  if(!isParameterRef(value))return value;
  const p=Array.isArray(graph?.parameters)?graph.parameters.find(p=>p?.id===value.$param):null;
  return Object.hasOwn(assignment?.parameters??{},value.$param)?assignment.parameters[value.$param]:p?.default;
}
export function resolveGraph(graph,assignment){
  if(!graph)return graph;
  const resolve=item=>item&&typeof item==='object'?Object.fromEntries(Object.entries(item).map(([key,value])=>[key,resolveValue(value,graph,assignment)])):item;
  return {...graph,nodes:graph.nodes.map(resolve),edges:graph.edges.map(resolve),triggers:(graph.triggers??[]).map(resolve)};
}
export function parameterErrors(s,g,a){
  if(!Array.isArray(g.nodes)||!Array.isArray(g.edges)||g.triggers!==undefined&&!Array.isArray(g.triggers))return ['挙動のノード・条件の形式が不正です。'];
  const errors=[],parameters=g.parameters??[],ids=new Set();
  if(!Array.isArray(parameters)||parameters.length>64)return ['担当時に指定する値は最大64件の配列です。'];
  const valid=(p,value)=>p.type==='number'?Number.isFinite(value):typeof value==='string'&&(p.type==='route'?s.routes:p.type==='destination'?s.destinations:s.units)?.some?.(item=>item.id===value);
  for(const p of parameters){
    if(!p||!/^[a-zA-Z0-9_-]{1,80}$/.test(p.id??'')||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>120||!Object.hasOwn(PARAMETER_TYPES,p.type)){errors.push('担当値のID・名前・種類が不正または重複しています。');continue;}
    ids.add(p.id);
    if(p.unit!==undefined&&(p.type!=='number'||!['s','m','ratio'].includes(p.unit)))errors.push('担当値の単位が不正です。');
    if(Object.hasOwn(p,'default')&&!valid(p,p.default))errors.push('担当値「'+p.name+'」の既定値が不正です。');
    if(a&&!valid(p,resolveValue({$param:p.id},g,a)))errors.push('タスク「'+a.name+'」で「'+p.name+'」を指定してください。');
  }
  for(const item of [...g.nodes,...g.edges,...(g.triggers??[])].filter(item=>item&&typeof item==='object'))for(const [field,value] of Object.entries(item))if(value&&typeof value==='object'&&(Object.hasOwn(value,'$param')||PARAMETER_FIELDS[field])){
    const p=isParameterRef(value)?parameters.find(p=>p?.id===value.$param):null;
    const expectedUnit={seconds:'s',distance:'m',speedFraction:'ratio'}[field];
    if(!p||p.type!==PARAMETER_FIELDS[field]||expectedUnit&&p.unit&&p.unit!==expectedUnit)errors.push('担当値の参照・種類・単位が不正です: '+field);
  }
  if(a?.parameters!==undefined&&(!a.parameters||typeof a.parameters!=='object'||Array.isArray(a.parameters)||Object.keys(a.parameters).some(id=>!ids.has(id))))errors.push('タスクの担当値に未定義の項目があります。');
  return errors;
}
