// Published decision state. Metadata never grants access to physical truth.
const state = (field, label, type, options = {}) => ({ field, label, type, scale: 1, visibility: "self", record: "snapshot", aggregate: "unsupported", unknown: "missing", ...options });
export const STATE_FIELDS = [
  state("clock", "開始からの時間（秒）", "number", { visibility: "clock", record: "time" }),
  state("self.status", "自分の動作状態", "string", { choices: [["idle", "未開始"], ["moving", "移動中"], ["arrived", "到着"], ["blocked", "経路制約で停止"], ["waiting", "待機中"], ["standby", "情報・起動待ち"], ["preparing", "準備中"], ["disabled", "無効・停止"], ["depleted", "資源枯渇"]] }),
  state("self.operational", "自分が稼働している", "boolean"),
  state("knowledge.selectedContact.age", "接触情報の経過時間（秒）", "number", { visibility: "selected-contact" }),
  state("knowledge.selectedContact.identity.confidence", "接触の識別確信度（%）", "number", { visibility: "selected-contact", scale: 100 }),
  state("knowledge.selectedContact.positionErrorRadius", "接触の位置誤差（m）", "number", { visibility: "selected-contact" }),
  state("self.resources.{id}.fraction", "資源の残量（%）", "number", { pattern: /^self\.resources\.[A-Za-z0-9_-]+\.fraction$/, scale: 100 }),
  state("self.resources.{id}.remaining", "資源の残量（量）", "number", { pattern: /^self\.resources\.[A-Za-z0-9_-]+\.remaining$/ }),
  state("knowledge.friendlyReports.{id}.age", "状態報告からの時間（秒）", "number", { pattern: /^knowledge\.friendlyReports\.[A-Za-z0-9_-]+\.age$/, visibility: "received-report" }),
  state("knowledge.friendlyReports.{id}.reportedState", "報告された稼働状態", "string", { pattern: /^knowledge\.friendlyReports\.[A-Za-z0-9_-]+\.reportedState$/, visibility: "received-report", choices: [["operational", "稼働"], ["disabled", "停止"], ["unknown", "不明"]] })
];
export const stateField = (field) => STATE_FIELDS.find((f) => f.field === field || f.pattern?.test(field));
export function decisionStateFields(source) {
  const fields = STATE_FIELDS.filter((f) => !f.pattern).map((f) => ({ ...f })), resources = new Set([...source.units ?? [], ...(source.groups ?? []).map((g) => g.template)].flatMap((u) => Object.keys(u.resources ?? {})));
  for (const id of resources) for (const suffix of ["fraction", "remaining"]) {
    const field = "self.resources." + id + "." + suffix, definition = stateField(field), name = { fuel: "燃料", energy: "電池・エネルギー", battery: "電池" }[id] ?? id;
    fields.push({ ...definition, field, label: definition.label.replace("資源", name) });
  }
  for (const u of source.units.filter((u2) => u2.faction === "friendly")) for (const suffix of ["age", "reportedState"]) {
    const field = "knowledge.friendlyReports." + u.id + "." + suffix, definition = stateField(field);
    fields.push({ ...definition, field, label: u.name + "の" + definition.label });
  }
  return fields;
}
