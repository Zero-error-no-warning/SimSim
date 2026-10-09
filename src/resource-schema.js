import { number, multi, reference, fieldErrors } from "./configuration-schema.js?v=20261009-configuration-contract-28";
export const NODE_LABELS = [["follow", "経路移動"], ["patrol", "周回"], ["move", "目的地移動"], ["wait", "時間待ち"], ["signal", "情報待ち"], ["report", "報告"], ["stop", "停止"]];
export const RESOURCE_FIELDS = [
  number("resource.capacity", "capacity", "容量（最大量）", 1e-6, 1e12, { required: true, default: 100 }),
  number("resource.initial", "initial", "初期残量", 0, (r) => r.capacity, { default: (r) => r.capacity, role: "initial" }),
  number("resource.perSecond", "perSecond", "時間当たりの消費（量/秒）", 0, 1e9, { default: 0 }),
  number("resource.perMetre", "perMetre", "移動当たりの消費（量/km）", 0, 1e9, { default: 0, scale: 1e3, storageUnit: "量/m", displayUnit: "量/km" }),
  number("resource.perMessage", "perMessage", "送信1回の消費量", 0, 1e9, { default: 0 }),
  multi("resource.effects", "effects", "空になったら停止する機能", [["movement", "移動"], ["sensor", "探知"], ["communication", "通信"]], { default: ["movement", "sensor", "communication"] }),
  ...NODE_LABELS.map(([kind, label]) => number("resource.node." + kind, "byNodeKind." + kind, label + "の追加消費（量/秒）", 0, 1e9, { default: 0, section: "詳細" })),
  reference("resource.replenish.destination", "replenish.destinationId", "補給する地点", "points", { section: "補給", when: (r) => r.replenish !== void 0, required: true }),
  number("resource.replenish.rate", "replenish.rate", "補給速度（量/秒）", 1e-6, 1e9, { section: "補給", when: (r) => r.replenish !== void 0, required: true, default: 1 })
];
export const RESOURCE_CONTRACT = { id: "unit.resources", label: "燃料・電池などの資源", owner: "entity", category: "capabilities", kind: "keyed", path: "resources", fields: RESOURCE_FIELDS, maxItems: 8, keyPattern: "^[A-Za-z0-9_-]{1,64}$", version: 4, absentMeaning: "資源による制約なし", editor: "resourceCollection", analysis: { supported: false, reason: "資源IDを含む分析変数は未対応" } };
export function resourceContractErrors(s) {
  const errors = [];
  for (const unit of [...Array.isArray(s.units) ? s.units : [], ...Array.isArray(s.groups) ? s.groups.map((g) => g?.template) : []]) if (unit?.resources !== void 0) {
    const resources = unit.resources;
    if (s.version < 4 || !resources || typeof resources !== "object" || Array.isArray(resources) || Object.keys(resources).length > RESOURCE_CONTRACT.maxItems) {
      errors.push("資源はversion 4のunit.resourcesに最大8種類指定してください。");
      continue;
    }
    for (const [id, r] of Object.entries(resources)) {
      if (!new RegExp(RESOURCE_CONTRACT.keyPattern).test(id)) {
        errors.push("資源のIDが不正です。");
        continue;
      }
      if (!r || typeof r !== "object" || Array.isArray(r)) {
        errors.push("資源の容量・初期残量が不正です。");
        continue;
      }
      errors.push(...fieldErrors(RESOURCE_FIELDS.filter((f) => !f.when || f.when(r)), r, { scenario: s }));
      if (r.byNodeKind !== void 0 && (!r.byNodeKind || typeof r.byNodeKind !== "object" || Array.isArray(r.byNodeKind) || Object.keys(r.byNodeKind).some((k) => !NODE_LABELS.some(([id2]) => id2 === k)))) errors.push("資源のノード別消耗が不正です。");
      if (r.replenish !== void 0 && (!r.replenish || typeof r.replenish !== "object" || Array.isArray(r.replenish))) errors.push("補給は地点の目的地と正の補給率を指定してください。");
    }
  }
  return errors;
}
