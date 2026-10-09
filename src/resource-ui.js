import { renderFields } from "./settings-form.js?v=20261009-select-state-30";
import { RESOURCE_CONTRACT, RESOURCE_FIELDS } from "./resource-schema.js?v=20261009-select-state-30";
export const resourceName = (id) => ({ fuel: "燃料", energy: "電池・エネルギー", battery: "電池" })[id] ?? id;
const el = (tag, text) => {
  const e = document.createElement(tag);
  if (text) e.textContent = text;
  return e;
};
export function renderResourceCollection(host, unit, context, changed, rerender) {
  const entries = Object.entries(unit.resources ?? {});
  if (!entries.length) host.append(el("p", RESOURCE_CONTRACT.absentMeaning));
  for (const [id, record] of entries) {
    const card = el("section");
    card.className = "settings-collection-item";
    card.dataset.resourceId = id;
    const heading = el("div");
    heading.className = "panel-heading";
    heading.append(el("h4", resourceName(id) + " · " + id));
    const remove = el("button", "削除");
    remove.type = "button";
    remove.onclick = () => {
      delete unit.resources[id];
      if (!Object.keys(unit.resources).length) delete unit.resources;
      changed();
      rerender();
    };
    heading.append(remove);
    card.append(heading);
    const normal = el("div");
    normal.className = "settings-field-grid";
    renderFields(normal, RESOURCE_FIELDS.filter((f) => !f.section), record, context, (field, value) => changed(field, value, record));
    card.append(normal);
    const details = el("details");
    details.dataset.settingsSection = "resource." + id + ".advanced";
    details.append(el("summary", "動作別の追加消費・補給"));
    const advanced = el("div");
    advanced.className = "settings-field-grid";
    renderFields(advanced, RESOURCE_FIELDS.filter((f) => f.section === "詳細"), record, context, (field, value) => changed(field, value, record));
    details.append(advanced);
    const label = el("label");
    label.className = "settings-boolean";
    const replenish = el("input");
    replenish.type = "checkbox";
    replenish.checked = record.replenish !== void 0;
    replenish.onchange = () => {
      if (replenish.checked) record.replenish = { destinationId: context.scenario.destinations?.find((d) => d.kind === "point")?.id ?? "", rate: 1 };
      else delete record.replenish;
      changed();
      rerender();
    };
    label.append(replenish, "地点で補給する");
    details.append(label);
    if (record.replenish) {
      const fields = el("div");
      fields.className = "settings-field-grid";
      renderFields(fields, RESOURCE_FIELDS.filter((f) => f.section === "補給"), record, context, (field, value) => changed(field, value, record));
      details.append(fields, el("p", "補給地点の時間待ち・情報待ち・停止中に補給します。"));
    }
    card.append(details);
    host.append(card);
  }
  const add = el("button", "＋ 資源を追加");
  add.id = "resource-add";
  add.type = "button";
  add.disabled = entries.length >= RESOURCE_CONTRACT.maxItems;
  add.onclick = () => {
    let id = "fuel", index = 1;
    while (Object.hasOwn(unit.resources ?? {}, id)) id = "resource-" + index++;
    unit.resources ??= {};
    unit.resources[id] = { capacity: 100, initial: 100 };
    changed();
    rerender();
  };
  host.append(add);
  const custom = el("label", "新しい資源ID");
  custom.className = "settings-field";
  const input = el("input");
  input.placeholder = "例: battery";
  input.maxLength = 64;
  const create = el("button", "指定IDで追加");
  create.type = "button";
  create.disabled = add.disabled;
  create.onclick = () => {
    const id = input.value.trim();
    if (!new RegExp(RESOURCE_CONTRACT.keyPattern).test(id) || Object.hasOwn(unit.resources ?? {}, id)) {
      input.setCustomValidity("重複しない英数字・_・-で指定してください。");
      input.reportValidity();
      return;
    }
    unit.resources ??= {};
    Object.defineProperty(unit.resources, id, { value: { capacity: 100, initial: 100 }, writable: true, enumerable: true, configurable: true });
    changed();
    rerender();
  };
  input.oninput = () => input.setCustomValidity("");
  custom.append(input, create);
  host.append(custom);
}
