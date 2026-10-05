import {isParameterRef,parameterErrors,resolveGraph} from './behavior-parameters.js?v=20261005-terrain-pick-9';
import {navigationErrors,proximityErrors,conditionKey} from './navigation.js?v=20261005-terrain-pick-9';
export const NODE_KINDS = {
  follow: '経路を進む', patrol: '協調して周回', signal: '情報を待つ',
  report: '報告', move: '目的に向かって進む', wait: '時間待ち', stop: '終了'
};
export const TRIGGER_EVENTS = {
  received: '情報受信', time: '時間経過', detected: '対象探知', near: '指定距離まで近づく'
};
export function graphInitial(g) {
  return g.initial ?? g.entry ?? (Array.isArray(g.triggers)?g.triggers.find(t=>t?.event==='scenarioStart')?.to:undefined);
}
// Legacy entry and scene-start nodes are accepted at the import boundary.
export function graphTriggers(g) {
  return (g.triggers ?? []).filter(t=>t?.event!=='scenarioStart');
}
export function migrateTriggers(s) {
  for (const g of s.behaviors ?? []) {
    const initial=graphInitial(g);
    if(initial!==undefined)g.initial=initial;
    g.triggers=graphTriggers(g);
    for(const t of g.triggers)delete t.policy;
    for(const n of g.nodes)if(n.kind==='return')n.kind='move';
    delete g.entry;
  }
  return s;
}
export const EDGE_EVENTS = {
  detected: '対象を探知', sent: '送信成功', sendFailed: '送信失敗', arrived: '到着', elapsed: '待機終了', received: '情報受信', near:'指定距離まで近づく'
};
export const NODE_EVENTS = {
  follow: ['detected', 'received', 'arrived', 'near'], patrol: ['detected', 'received', 'near'],
  signal: ['received', 'detected', 'near'], report: ['sent', 'sendFailed', 'near'],
  move: ['arrived', 'received', 'detected', 'near'], return: ['arrived', 'received', 'detected', 'near'], wait: ['elapsed', 'received', 'detected', 'near'], stop: []
};
// A query about assignments, never an engine selector.
export const hasSharedBehaviors = s => (s.behaviorAssignments ?? []).length > 0;
const number = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;
const point = p => p && ['x', 'y', 'z'].every(k => number(p[k], -1000000, 1000000));
export function sharedErrors(s, resolved=false) {
  const errors = navigationErrors(s), graphs = s.behaviors ?? [], assignments = s.behaviorAssignments ?? [];
  if (!Array.isArray(graphs) || graphs.length > 50) return ['挙動は最大50件の配列です。'];
  if (!Array.isArray(assignments) || assignments.length > 100) return ['タスクは最大100件の配列です。'];
  const routeCatalog=Array.isArray(s.routes)?s.routes:[],destinationCatalog=Array.isArray(s.destinations)?s.destinations:[];
  const ids = new Set(), aids = new Set(), used = new Set();
  for (const g of graphs) {
    if (!g || !/^[a-zA-Z0-9_-]{1,80}$/.test(g.id ?? '') || ids.has(g.id)) {
      errors.push('挙動IDが不正または重複しています。');
      continue;
    }
    ids.add(g.id);
    if (typeof g.name !== 'string' || !g.name.trim() || g.name.length > 120) errors.push('挙動名は1～120文字です。');
    if (!Array.isArray(g.nodes) || !g.nodes.length || g.nodes.length > 64 || !Array.isArray(g.edges) || g.edges.length > 128) {
      errors.push('挙動は1～64ノード、最大128接続です。');
      continue;
    }
    if(!resolved)errors.push(...parameterErrors(s,g));
    const scalar=(v,min,max)=>!resolved&&isParameterRef(v)||number(v,min,max);
    const concrete=v=>!isParameterRef(v);
    const nodes = new Map(), outgoing = new Set();
    for (const n of g.nodes) {
      if (!n || !/^[a-zA-Z0-9_-]{1,80}$/.test(n.id ?? '') || nodes.has(n.id) || !(NODE_KINDS[n.kind]||n.kind==='return')) {
        errors.push('ノードID・種類が不正です。');
        continue;
      }
      nodes.set(n.id, n);
      if(n.routeId!==undefined&&(!['follow','patrol'].includes(n.kind)||concrete(n.routeId)&&!routeCatalog.some(r=>r?.id===n.routeId)))errors.push('状態ノードの経路参照が不正です。');
      if(n.destinationId!==undefined&&(!['move','return'].includes(n.kind)||concrete(n.destinationId)&&!destinationCatalog.some(d=>d?.id===n.destinationId)))errors.push('状態ノードの目的地参照が不正です。');
      if(n.kind==='patrol'&&n.routeId&&concrete(n.routeId)&&routeCatalog.find(r=>r?.id===n.routeId)?.points?.length<3)errors.push('周回経路は3点以上必要です。');
      if (n.kind === 'wait' && !scalar(n.seconds, 0, 86400)) errors.push('待機時間は0～86400秒です。');
      if (n.kind === 'patrol' && !scalar(n.speedFraction ?? .7, .05, 1)) errors.push('巡回速度比は0.05～1です。');
      if (n.kind === 'report' && !n.receiverId && !n.receiverRole) errors.push('報告先または報告先の役割を指定してください。');
      if (n.receiverId && concrete(n.receiverId) && !s.units?.some(u => u.id === n.receiverId)) errors.push('報告先の単体ユニットがありません: ' + n.receiverId);
      if(n.joinMode!==undefined&&(!['follow','patrol'].includes(n.kind)||!['start','nearest'].includes(n.joinMode)))errors.push('経路への入り方は最初から／最短地点からを選択してください。');
      if (n.sensor !== undefined && typeof n.sensor !== 'boolean') errors.push('ノードのsensorはbooleanです。');
      if (n.x !== undefined && !number(n.x, 0, 4000) || n.y !== undefined && !number(n.y, 0, 4000)) errors.push('ノード位置が不正です。');
    }
    const initial=graphInitial(g),triggers=g.triggers??[], tids=new Set(), events=new Set();
    if(initial!==undefined&&!nodes.has(initial))errors.push('初期状態の参照先がありません。');
    if(g.initial!==undefined&&g.entry!==undefined&&g.initial!==g.entry || g.triggers?.some?.(t=>t?.event==='scenarioStart'&&t.to!==initial))errors.push('初期状態の指定が重複しています。');
    if (!Array.isArray(triggers) || triggers.length>32) errors.push('イベントノードは最大32件の配列です。');
    else if(initial===undefined&&!triggers.length)errors.push('初期状態またはイベントノードを指定してください。');
    else for (const t of triggers) {
      if (!t || !/^[a-zA-Z0-9_-]{1,80}$/.test(t.id??'') || tids.has(t.id) || !(Object.hasOwn(TRIGGER_EVENTS,t.event)||t.event==='scenarioStart') || !nodes.has(t.to)) errors.push('イベントノードのID・種類・接続先が不正です。');
      tids.add(t?.id);
      const key=t?conditionKey(t):'';
      if (events.has(key)) errors.push('同じイベント・時間のイベントノードは一つだけ指定できます。');
      events.add(key);
      if (t?.event==='time' && (!scalar(t.seconds,0,86400)||t.once===false&&t.seconds===0)) errors.push('時間イベントは0～86400秒、繰り返す場合は0より大きい秒数です。');
      if (t?.policy!==undefined && !['idle','interrupt'].includes(t.policy)) errors.push('起動方法はidle・interruptです。');
      if (t?.once!==undefined && typeof t.once!=='boolean') errors.push('イベントノードのonceはbooleanです。');
      if(t?.event==='near')errors.push(...proximityErrors(s,t,!resolved));
      if (t?.x!==undefined && !number(t.x,0,4000) || t?.y!==undefined && !number(t.y,0,4000)) errors.push('イベントノードの位置が不正です。');
    }
    for (const e of g.edges) {
      const key = e?.from + '|' + (e?conditionKey(e):''), node = nodes.get(e?.from);
      if (!e || !node || !nodes.has(e.to) || !(NODE_EVENTS[node.kind] ?? []).includes(e.when) || outgoing.has(key)) errors.push('接続条件が始点ノードに対応しないか、接続が不正・重複しています。');
      if (e?.once !== undefined && typeof e.once !== 'boolean') errors.push('接続のonceはbooleanです。');
      if(e?.when==='near')errors.push(...proximityErrors(s,e,!resolved));
      outgoing.add(key);
    }
  }
  for (const a of assignments) {
    if (!a || !/^[a-zA-Z0-9_-]{1,80}$/.test(a.id ?? '') || aids.has(a.id)) {
      errors.push('タスクIDが不正または重複しています。');
      continue;
    }
    aids.add(a.id);
    if (typeof a.name !== 'string' || !a.name.trim() || a.name.length > 120) errors.push('タスク名は1～120文字です。');
    const g = graphs.find(g => g.id === a.behaviorId);
    if (!g) errors.push('タスクの挙動がありません。');
    if (!Array.isArray(a.targets) || (!a.targets.length&&!(s.mission?.type==='state'&&s.mission.assignmentId===a.id)) || a.targets.length > 100) {
      errors.push('タスクの担当を選んでください。');
      continue;
    }
    for (const t of a.targets) {
      const kind = typeof t === 'string' ? t.split(':')[0] : '', id = typeof t === 'string' ? t.slice(kind.length + 1) : '';
      const u = kind === 'unit' ? s.units?.find(u => u.id === id) : kind === 'group' ? s.groups?.find(g => g.id === id)?.template : null;
      if (!u || used.has(t)) errors.push('タスクの担当が不正または重複しています。');
      used.add(t);
    }
    if(g){
      const bindingErrors=parameterErrors(s,g,a);errors.push(...bindingErrors);
      if(!bindingErrors.length&&g.parameters?.length){const resolvedGraph=resolveGraph(g,a);errors.push(...sharedErrors({...s,behaviors:[resolvedGraph],behaviorAssignments:[]},true).map(message=>'タスク「'+a.name+'」: '+message));}
    }
    const concreteGraph=g&&Array.isArray(g.nodes)&&Array.isArray(g.edges)?resolveGraph(g,a):null;
    const patrol = concreteGraph?.nodes.some(n => n.kind === 'patrol'&&!n.routeId), home = concreteGraph?.nodes.some(n => ['return','move'].includes(n.kind)&&!n.destinationId);
    if (patrol && (!Array.isArray(a.route) || a.route.length < 3)) errors.push('周回タスクは3点以上の共有経路が必要です。');
    if (a.route !== undefined && (!Array.isArray(a.route) || a.route.length > 500 || a.route.some(p => !point(p)))) errors.push('タスクの経路が不正です。');
    if (home && !point(a.base)) errors.push('目的に向かって進む状態の目的地を選択してください。');
    if (a.base !== undefined && !point(a.base)) errors.push('帰投地点が不正です。');
    if (a.routeMode !== undefined && !['once', 'loop', 'pingpong'].includes(a.routeMode)) errors.push('タスクの経路方式が不正です。');
    if (!['even', 'fixed', 'none'].includes(a.spacing ?? 'none')) errors.push('間隔方式が不正です。');
    if (!number(a.spacingDistance ?? 500, 0, 100000) || !number(a.gain ?? .01, 0, 1) || !number(a.preparation ?? 0, 0, 86400) || !number(a.phase ?? 0, 0, 1)) errors.push('タスクの間隔・調整係数・準備時間・開始割合が不正です。');
    if (concreteGraph?.nodes.some(n => n.receiverRole&&!n.receiverId) && !s.units?.some(u => u.id === a.receiverId)) errors.push('タスクの報告先を選んでください。');
  }
  const c = s.recording ?? {
  }, step = c.step ?? s.analysis?.step ?? 10, interval = c.interval ?? step;
  if (!number(step, .1, 300) || !number(interval, .1, 300) || interval < step || Math.abs(interval / step - Math.round(interval / step)) > 1e-8 || s.duration / step > 100000) errors.push('計算刻み0.1～300秒、記録間隔は刻みの整数倍・300秒以下、最大10万ステップです。');
  if (s.version === 3 && s.analysis && s.analysis.step !== step) errors.push('分析と記録の計算刻みを一致させてください。');
  return errors;
}
export function patrolGraph(id = 'patrol-return', receiverId) {
  return {
    id, name: '周回監視・報告・帰投', initial:'patrol', triggers: [], nodes: [
    {
      id: 'patrol', kind: 'patrol', speedFraction: .7, x: 340, y: 70
    },
    {
      id: 'report', kind: 'report', ...(receiverId ? {
        receiverId
      }
      : {
        receiverRole: 'report'
      }), x: 640, y: 70
    },
    {
      id: 'home', kind: 'move', x: 940, y: 70
    },
    {
      id: 'wait', kind: 'wait', seconds: 300, x: 940, y: 270
    }
    ], edges: [{
      from: 'patrol', to: 'report', when: 'detected'
    }, {
      from: 'report', to: 'home', when: 'sent'
    }, {
      from: 'report', to: 'home', when: 'sendFailed'
    }, {
      from: 'home', to: 'wait', when: 'arrived'
    }]
  };
}
export function sharedAssignment(s, id) {
  const u = s.units?.find(u => u.id === id), groupId = u?.groupId ?? s.groups?.find(g => id?.slice(0, id.lastIndexOf('__')) === g.id)?.id;
  return s.behaviorAssignments?.find(a => a.targets.includes('unit:' + id) || groupId && a.targets.includes('group:' + groupId));
}
