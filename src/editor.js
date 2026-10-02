// Pure, undoable scenario edits. Distances in metres; dragging moves x/y only.
export function definition(s,id) {
  const unit=s.units.find(u=>u.id===id);if(unit)return {unit};
  const group=s.groups?.find(g=>id?.slice(0,id.lastIndexOf('__'))===g.id);return group?{unit:group.template,group}:null;
}
export function translate(entity,delta) {for(const p of [entity.initial,...entity.route]){p.x+=delta.x;p.y+=delta.y;}}
export function moveDefinition(s,id,delta){const d=definition(s,id);if(!d)throw new Error('移動対象が見つかりません。');translate(d.unit,delta);}
export function editWaypoint(s,id,index,point){const d=definition(s,id);if(!d||index<0||index>=d.unit.route.length)throw new Error('経由点が見つかりません。');d.unit.route[index]={...point};}
export function removeDefinition(s,id) {
  const d=definition(s,id);if(!d)return;
  if(d.group)s.groups=s.groups.filter(g=>g.id!==d.group.id);else s.units=s.units.filter(u=>u.id!==id);
  const present=new Set(s.units.map(u=>u.id));for(const g of s.groups??[])for(let n=1;n<=g.count;n++)present.add(g.id+'__'+n);
  for(const u of [...s.units,...(s.groups??[]).map(g=>g.template)])if(u.behavior)u.behavior.rules=u.behavior.rules.filter(r=>r.action!=='send'||s.units.some(v=>v.id===r.receiverId));
  if(s.mission?.targetIds){s.mission.targetIds=s.mission.targetIds.filter(id=>present.has(id));if(!s.mission.targetIds.length)delete s.mission;}
  if(s.mission?.responderIds){s.mission.responderIds=s.mission.responderIds.filter(id=>s.units.some(u=>u.id===id));if(!s.mission.responderIds.length)delete s.mission;}
  if(s.mission&&![...s.units,...(s.groups??[]).map(g=>g.template)].some(u=>u.faction===s.mission.targetFaction))delete s.mission;
  if(s.analysis){
    if(s.analysis.groupId&&!s.groups?.some(g=>g.id===s.analysis.groupId)){delete s.analysis.groupId;delete s.analysis.counts;}
    for(const key of ['factors','uncertainties'])s.analysis[key]=s.analysis[key]?.filter(b=>b.target==='scenario'?!!s.mission:b.target.startsWith('group:')?s.groups?.some(g=>g.id===b.target.slice(6)):s.units.some(u=>u.id===b.target.slice(5)));
  }
}
export function circleRoute(center,edge,count=32){const radius=Math.hypot(edge.x-center.x,edge.y-center.y),angle=Math.atan2(edge.y-center.y,edge.x-center.x);if(radius<50||radius>50000)throw new Error('周回半径は50～50000mにしてください。');const points=Array.from({length:count},(_,i)=>({x:center.x+radius*Math.cos(angle+Math.PI*2*i/count),y:center.y+radius*Math.sin(angle+Math.PI*2*i/count),z:edge.z}));return {initial:points[0],route:points.slice(1),routeMode:'loop'};}
