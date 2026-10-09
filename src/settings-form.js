import { getValue, optionsFor, resolvedDefault, resolvedBound, fieldErrors } from "./configuration-schema.js?v=20261009-map-workspace-29";
export const FIELD_RENDERERS = { number: true, text: true, boolean: true, select: true, reference: true, multi: true };
const node = (tag, text) => {
  const n = document.createElement(tag);
  if (text) n.textContent = text;
  return n;
};
export function renderFields(host, fields, record, context, change) {
  for (const field of fields) {
    if (field.when && !field.when(record, context)) continue;
    const wrap = node("label");
    wrap.className = "settings-field";
    wrap.dataset.settingId = field.id;
    const title = node("span", field.label);
    wrap.append(title);
    const raw = getValue(record, field.path), value = raw ?? resolvedDefault(field, record, context);
    let input;
    if (field.type === "multi") {
      input = node("div");
      input.className = "settings-choices";
      for (const [id, label] of optionsFor(field, context)) {
        const l = node("label"), check = node("input");
        check.type = "checkbox";
        check.checked = (value ?? []).includes(id);
        check.disabled = !!field.readonly;
        check.setAttribute("aria-label", field.label + " · " + label);
        check.onchange = () => {
          const checked = [...input.querySelectorAll("input:checked")].map((i) => optionsFor(field, context).find(([v]) => String(v) === i.value)[0]);
          change(field, field.emptyMeansAbsent && !checked.length ? void 0 : checked);
          refreshError();
        };
        check.value = id;
        l.append(check, label);
        input.append(l);
      }
      wrap.append(input);
    } else {
      input = node(field.type === "select" || field.type === "reference" ? "select" : "input");
      input.setAttribute("aria-label", field.label);
      if (field.domId) input.id = field.domId;
      if (input.tagName === "SELECT") {
        input.append(new Option(field.optional ? "既定・対象を限定しない" : "選択してください", ""));
        for (const [id, label] of optionsFor(field, context)) {
          const o = new Option(label, String(id));
          input.append(o);
        }
        if (value !== void 0 && !optionsFor(field, context).some(([id]) => id === value)) input.append(new Option(String(value) + "（ファイルの指定）", String(value)));
        input.value = value === void 0 ? "" : String(value);
      } else if (field.type === "boolean") {
        input.type = "checkbox";
        input.checked = value ?? false;
        wrap.classList.add("settings-boolean");
      } else {
        input.type = field.type === "number" ? "number" : "text";
        input.value = value === void 0 ? "" : field.type === "number" ? Number((value * (field.scale ?? 1)).toPrecision(12)) : value;
        if (field.type === "number") {
          input.step = field.integer ? "1" : "any";
          const min = resolvedBound(field.min, record, context), max = resolvedBound(field.max, record, context);
          if (min !== void 0) input.min = min * (field.scale ?? 1);
          if (max !== void 0) input.max = max * (field.scale ?? 1);
        } else {
          if (field.maxLength) input.maxLength = field.maxLength;
          if (field.pattern) input.pattern = field.pattern.replace("_-", "_\\-");
        }
      }
      input.required = !!field.required && field.type !== "boolean";
      input.disabled = !!field.readonly;
      input.dataset.settingId = field.id;
      input.onchange = () => {
        const empty = input.type !== "checkbox" && !input.value.trim();
        const next = field.type === "boolean" ? input.checked : empty ? void 0 : field.type === "number" ? Number(input.value) / (field.scale ?? 1) : input.tagName === "SELECT" ? optionsFor(field, context).find(([id]) => String(id) === input.value)?.[0] ?? input.value : input.value;
        change(field, next);
        refreshError();
      };
      wrap.append(input);
    }
    if (field.help) wrap.append(node("small", field.help));
    const refreshError = () => {
      wrap.querySelector(".settings-field-error")?.remove();
      const errors = fieldErrors([field], record, context);
      if (errors.length) {
        const error = node("small", errors.join(" "));
        error.className = "settings-field-error";
        wrap.append(error);
      }
    };
    refreshError();
    host.append(wrap);
  }
}
