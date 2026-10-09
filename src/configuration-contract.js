import { BASE_FIELDS, POSITION_FIELDS, MOVEMENT_FIELDS, MOTION_FIELDS, SENSOR_FIELDS, COMMUNICATION_FIELDS, GROUP_FIELDS, REPORT_FIELDS, COMMAND_FIELDS, LINK_FIELDS, DISRUPTION_FIELDS, OPERATIONAL_FIELDS, INITIAL_FIELDS, ASSUMPTION_FIELDS, COORDINATION_FIELDS } from "./configuration-fields.js?v=20261009-select-state-30";
import { RESOURCE_CONTRACT } from "./resource-schema.js?v=20261009-select-state-30";
export const CATEGORIES = [["basic", "基本・配置"], ["capabilities", "能力・資源"], ["operation", "運用"], ["information", "情報・権限"]];
export const SCENARIO_CATEGORIES = [["information", "初期情報"], ["communication", "通信・障害"], ["operation", "停止事象"], ["assumptions", "モデル前提"]];
const module = (id, label, category, owner, fields, extra = {}) => ({ id, label, category, owner, fields, kind: "fields", editor: "fields", absentMeaning: extra.optionalObject ? "未搭載" : extra.kind === "array" ? "追加設定なし" : "省略した属性には既存モデルの既定値を使用", analysis: { supported: false, reason: "分析台帳で許可した項目だけを使用します。" }, ...extra });
export const CONFIGURATION_MODULES = [
  module("entity.basic", "基本属性", "basic", "entity", BASE_FIELDS),
  module("entity.position", "初期位置・経路の基準点", "basic", "entity", POSITION_FIELDS, { editor: "position" }),
  module("group.placement", "群の配置", "basic", "group", GROUP_FIELDS),
  module("entity.movement", "移動・被探知性能", "capabilities", "entity", MOVEMENT_FIELDS),
  module("entity.sensor", "探知装置", "capabilities", "entity", SENSOR_FIELDS, { path: "sensor", optionalObject: true }),
  module("entity.communication", "通信装置", "capabilities", "entity", COMMUNICATION_FIELDS, { path: "communication", optionalObject: true }),
  RESOURCE_CONTRACT,
  module("entity.motion", "航跡のばらつき・開始割合", "operation", "entity", MOTION_FIELDS),
  module("assignment.coordination", "担当タスクの協調", "operation", "assignment", COORDINATION_FIELDS, { version: 4 }),
  module("entity.route", "経路と担当タスク", "operation", "entity", [], { editor: "navigation" }),
  module("entity.periodicReports", "移動と並行する報告", "operation", "entity", REPORT_FIELDS, { path: "periodicReports", kind: "array", editor: "collection", maxItems: 8, version: 4 }),
  module("entity.commands", "命令の許可元", "information", "entity", COMMAND_FIELDS, { version: 4 }),
  module("scenario.initialInformation", "初期に持つ情報", "information", "scenario", INITIAL_FIELDS, { path: "initialInformation", kind: "array", editor: "collection", maxItems: 2e3, version: 4 }),
  module("scenario.links", "有向通信リンク", "communication", "scenario", LINK_FIELDS, { path: "communicationLinks", kind: "array", editor: "collection", maxItems: 256, version: 4 }),
  module("scenario.disruptions", "継続通信障害", "communication", "scenario", DISRUPTION_FIELDS, { path: "communicationDisruptions", kind: "array", editor: "collection", maxItems: 256, version: 4 }),
  module("scenario.operational", "停止・復旧事象", "operation", "scenario", OPERATIONAL_FIELDS, { path: "operationalEvents", kind: "array", editor: "collection", maxItems: 2e3, version: 4 }),
  module("scenario.assumptions", "モデルの前提と計測", "assumptions", "scenario", ASSUMPTION_FIELDS, { version: 4 })
];
export const configurationFields = () => CONFIGURATION_MODULES.flatMap((m) => m.fields.map((f) => ({ ...f, module: m.id, category: m.category, owner: m.owner })));
export function configurationTarget(s, id) {
  const unit = s.units?.find((u) => u.id === id);
  if (unit) return { unit, id, label: unit.name, scope: "この単体に適用" };
  const group = s.groups?.find((g) => g.id === id || id?.slice(0, id.lastIndexOf("__")) === g.id);
  return group ? { unit: group.template, group, id, label: group.name, scope: "群「" + group.name + "」の全" + group.count + "機に適用" } : null;
}
export const MODULE_EDITORS = { fields: true, position: true, navigation: true, collection: true, resourceCollection: true };
export function configurationContractErrors(modules = CONFIGURATION_MODULES, types, editors = MODULE_EDITORS) {
  const ids = /* @__PURE__ */ new Set(), errors = [];
  for (const m of modules) {
    if (!editors[m.editor]) errors.push(m.id + ": 編集入口が未登録です。");
    if (!m.owner || !m.category || !m.absentMeaning) errors.push(m.id + ": 所有者・分類・未設定の意味を登録してください。");
    for (const f of m.fields) {
      if (ids.has(f.id)) errors.push(f.id + ": 設定IDが重複しています。");
      ids.add(f.id);
      if (!f.path || !f.label || !f.role || !types[f.type]) errors.push(f.id + ": 標準入力が未登録です。");
      if (f.readonly && !f.readonlyReason && f.id !== "entity.id") errors.push(f.id + ": 編集不可の理由を登録してください。");
      if (f.scale !== void 0 && (!Number.isFinite(f.scale) || f.scale <= 0)) errors.push(f.id + ": 単位変換が不正です。");
    }
  }
  return errors;
}
