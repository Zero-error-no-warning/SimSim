// Shared graph definitions and assignments are independent of unit capabilities.
export const NODE_KINDS={patrol:'周回監視',report:'報告',return:'帰投',wait:'待機',stop:'終了'};
export const EDGE_EVENTS={detected:'敵を探知',sent:'送信成功',sendFailed:'送信失敗',arrived:'到着',elapsed:'待機終了',received:'情報受信'};
export const hasSharedBehaviors=s=>(s.behaviorAssignments??[]).length>0;
const number=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
const point=p=>p&&['x','y','z'].every(k=>number(p[k],-1000000,1000000));
export function sharedErrors(s){
 const errors=[],graphs=s.behaviors??[],assignments=s.behaviorAssignments??[],ids=new Set(),aid=new Set(),used=new Set();
 if(!Array.isArray(graphs)||graphs.length>50)return ['behaviorsは最大50件の配列にしてください。'];
 for(const g of graphs){
  if(!g||typeof g.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(g.id)||ids.has(g.id)){errors.push('挙動IDが不正または重複しています。');continue;}ids.add(g.id);
  if(typeof g.name!=='string'||!g.name.trim()||g.name.length>120)errors.push('挙動名は1～120文字にしてください。');
  if(!Array.isArray(g.nodes)||!g.nodes.length||g.nodes.length>64||!Array.isArray(g.edges)||g.edges.length>128){errors.push('挙動は1～64ノード、最大128接続にしてください。');continue;}
  const nodes=new Set();for(const n of g.nodes){if(!n||typeof n.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(n.id)||nodes.has(n.id)||!NODE_KINDS[n.kind])errors.push('ノードID・種類が不正です。');nodes.add(n?.id);if(n?.kind==='wait'&&!number(n.seconds,1,86400))errors.push('待機時間は1～86400秒です。');if(n?.kind==='patrol'&&!number(n.speedFraction??.7,.05,1))errors.push('巡回速度比は0.05～1です。');if(n?.kind==='report'&&!s.units?.some(u=>u.id===n.receiverId))errors.push('報告先の単体ユニットがありません。');if(n?.x!==undefined&&!number(n.x,0,4000)||n?.y!==undefined&&!number(n.y,0,4000))errors.push('ノード位置が不正です。');}
  if(!nodes.has(g.entry))errors.push('開始ノードがありません。');const outgoing=new Set();for(const e of g.edges){const key=e?.from+'|'+e?.when;if(!e||!nodes.has(e.from)||!nodes.has(e.to)||!EDGE_EVENTS[e.when]||outgoing.has(key))errors.push('接続の始点・終点・条件が不正または重複しています。');outgoing.add(key);}
 }
 if(!Array.isArray(assignments)||assignments.length>100)return [...errors,'挙動の割り当ては最大100件です。'];
 for(const a of assignments){
  if(!a||typeof a.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(a.id)||aid.has(a.id)){errors.push('割り当てIDが不正または重複しています。');continue;}aid.add(a.id);if(typeof a.name!=='string'||!a.name.trim()||a.name.length>120)errors.push('協調グループ名は1～120文字にしてください。');
  if(!ids.has(a.behaviorId))errors.push('割り当て先の挙動がありません。');
  if(!Array.isArray(a.targets)||!a.targets.length||a.targets.length>100){errors.push('割り当てる単体・群を選んでください。');continue;}
  for(const target of a.targets){if(typeof target!=='string'){errors.push('割り当て対象IDは文字列にしてください。');continue;}const kind=target?.split(':')[0],id=target?.slice(kind.length+1),u=kind==='unit'?s.units?.find(u=>u.id===id):kind==='group'?s.groups?.find(g=>g.id===id)?.template:null;if(!u||used.has(target))errors.push('割り当て対象が不正または重複しています。');used.add(target);if(u?.behavior?.rules?.length||u?.behavior?.hold)errors.push('共有挙動の担当には旧行動ルールを併用できません。');}
  if(!Array.isArray(a.route)||a.route.length<3||a.route.length>500||a.route.some(p=>!point(p)))errors.push('共有周回経路は3～500点で指定してください。');
  if(!point(a.base))errors.push('帰投地点が不正です。');
  if(!['even','fixed','none'].includes(a.spacing))errors.push('間隔方式が不正です。');
  if(!number(a.spacingDistance??500,0,100000)||!number(a.gain??.01,0,1))errors.push('間隔・調整係数が不正です。');
 }
 const c=s.recording??{};if(!number(c.step??1,.1,60)||!number(c.interval??5,.1,300)||(c.interval??5)<(c.step??1)||Math.abs((c.interval??5)/(c.step??1)-Math.round((c.interval??5)/(c.step??1)))>1e-8||s.duration/(c.step??1)>100000)errors.push('計算刻み0.1～60秒、記録間隔は刻みの整数倍（300秒以下）、最大10万ステップにしてください。');
 if(hasSharedBehaviors(s)&&s.units?.some(u=>u.behavior?.rules?.length||u.behavior?.hold)||hasSharedBehaviors(s)&&s.groups?.some(g=>g.template?.behavior?.rules?.length||g.template?.behavior?.hold))errors.push('共有挙動の計算では旧条件付き行動を解除してください。');
 return errors;
}
export function patrolGraph(id='patrol-return',receiverId){return {id,name:'周回監視・報告・帰投',entry:'patrol',nodes:[{id:'patrol',kind:'patrol',speedFraction:.7,x:40,y:70},{id:'report',kind:'report',receiverId,x:340,y:70},{id:'home',kind:'return',x:640,y:70},{id:'wait',kind:'wait',seconds:300,x:640,y:270}],edges:[{from:'patrol',to:'report',when:'detected'},{from:'report',to:'home',when:'sent'},{from:'report',to:'home',when:'sendFailed'},{from:'home',to:'wait',when:'arrived'}]};}

export function sharedAssignment(s,id){const u=s.units?.find(u=>u.id===id),groupId=u?.groupId??s.groups?.find(g=>id?.slice(0,id.lastIndexOf('__'))===g.id)?.id;return s.behaviorAssignments?.find(a=>a.targets.includes('unit:'+id)||groupId&&a.targets.includes('group:'+groupId));}
