import { validateScenario } from './engine.js';
import { normalizedAnalysis } from './parameters.js';
// Compatibility ends here: the application and workers execute version 3 only.
export function importScenario(value) {
  const s = validateScenario(value);
  if (s.version === 3) return s;
  s.version = 3;
  s.behaviors ??= [];
  s.behaviorAssignments ??= [];
  const step = s.recording?.step ?? s.analysis?.step ?? 10;
  s.recording ??= {
    step, interval: step
  };
  if (s.analysis) s.analysis = {
    ...normalizedAnalysis(s.analysis), step
  };
  for (const [target, u] of [
  ...s.units.map(u => ['unit:' + u.id, u]),
  ...(s.groups ?? []).map(g => ['group:' + g.id, g.template])
  ]) {
    const b = u.behavior;
    if (!b) continue;
    if (b.hold || b.rules.length) {
      if (s.behaviorAssignments.some(a => a.targets.includes(target))) throw Error('旧ルールとタスクが重複しています: ' + target);
      const kinds = new Set();
      for (const r of b.rules) {
        if (kinds.has(r.when) || r.state !== 'any' && !(b.hold && r.when === 'received')) throw Error('自動変換できない旧ルールです。同じ条件の複数動作・状態条件はノードで再設計してください: ' + target);
        kinds.add(r.when);
      }
      const id = 'import-' + target.replace(':', '-');
      if (s.behaviors.some(g => g.id === id) || s.behaviorAssignments.some(a => a.id === id)) throw Error('変換先IDが重複しています: ' + id);
      const start = b.hold ? 'signal' : 'follow';
      const nodes = [{
        id: start, kind: b.hold ? 'signal' : 'follow', x: 40, y: 70
      }], edges = [];
      if (b.hold) nodes.push({
        id: 'follow', kind: 'follow', x: 800, y: 70
      });
      b.rules.forEach((r, i) => {
        const from = r.when === 'received' && b.hold ? 'signal' : 'follow';
        if (r.action === 'depart') {
          nodes.push({
            id: r.id, kind: 'wait', parameter: 'preparation', seconds: b.preparation, x: 400, y: 70 + i * 150
          });
          edges.push({
            from, to: r.id, when: r.when, once: r.once
          }, {
            from: r.id, to: 'follow', when: 'elapsed'
          });
        } else {
          nodes.push({
            id: r.id, kind: 'report', receiverId: r.receiverId, x: 400, y: 70 + i * 150
          });
          edges.push({
            from, to: r.id, when: r.when, once: r.once
          }, {
            from: r.id, to: start, when: 'sent', resume: true
          }, {
            from: r.id, to: start, when: 'sendFailed', resume: true
          });
        }
      });
      s.behaviors.push({
        id, name: u.name + 'の挙動', entry: start, nodes, edges
      });
      s.behaviorAssignments.push({
        id, name: u.name + 'のタスク', behaviorId: id, targets: [target], spacing: 'none', preparation: b.preparation
      });
      for (const list of [s.analysis?.factors, s.analysis?.uncertainties]) for (const f of list ?? []) if (f.target === target && f.parameter === 'behavior.preparation') f.target = 'assignment:' + id;
    }
    delete u.behavior;
  }
  return validateScenario(s);
}
