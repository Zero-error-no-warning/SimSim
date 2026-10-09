// Pure contracts shared by validation, authoring and documentation. No DOM dependencies.
export const getValue = (object, path) => path.split(".").reduce((value, key) => value && Object.hasOwn(value, key) ? value[key] : void 0, object);
export function setValue(object, path, value) {
  const keys = path.split(".");
  let parent = object;
  for (const key of keys.slice(0, -1)) {
    if (!Object.hasOwn(parent, key) || !parent[key] || typeof parent[key] !== "object") Object.defineProperty(parent, key, { value: {}, writable: true, enumerable: true, configurable: true });
    parent = parent[key];
  }
  if (value === void 0) delete parent[keys.at(-1)];
  else Object.defineProperty(parent, keys.at(-1), { value, writable: true, enumerable: true, configurable: true });
}
export const number = (id, path, label, min, max, options = {}) => ({ id, path, label, type: "number", min, max, scale: 1, role: "setting", ...options });
export const choice = (id, path, label, options, extra = {}) => ({ id, path, label, type: "select", options, role: "setting", ...extra });
export const boolean = (id, path, label, extra = {}) => ({ id, path, label, type: "boolean", role: "setting", ...extra });
export const text = (id, path, label, maxLength, extra = {}) => ({ id, path, label, type: "text", maxLength, role: "setting", ...extra });
export const reference = (id, path, label, source, extra = {}) => ({ id, path, label, type: "reference", source, role: "setting", ...extra });
export const multi = (id, path, label, options, extra = {}) => ({ id, path, label, type: "multi", options, role: "setting", ...extra });
export const resolvedDefault = (field, record, context) => typeof field.default === "function" ? field.default(record, context) : field.default;
export const resolvedBound = (bound, record, context) => typeof bound === "function" ? bound(record, context) : bound;
export function optionsFor(field, context) {
  if (field.source) {
    const s = context.scenario;
    return (field.source === "points" ? (s.destinations ?? []).filter((d) => d.kind === "point") : field.source === "links" ? s.communicationLinks ?? [] : s.units ?? []).map((item) => [item.id, item.name ?? item.id]);
  }
  return field.options ?? [];
}
export function fieldErrors(fields, record, context = {}) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return ["設定はオブジェクトで指定してください。"];
  const errors = [];
  for (const field of fields) {
    const value = getValue(record, field.path);
    if (value === void 0) {
      if (field.required) errors.push(field.label + " [" + field.path + "] を指定してください。");
      continue;
    }
    let valid = true;
    if (field.type === "number") {
      const min = resolvedBound(field.min, record, context), max = resolvedBound(field.max, record, context);
      valid = Number.isFinite(value) && (min === void 0 || value >= min) && (max === void 0 || value <= max) && (!field.integer || Number.isInteger(value));
    } else if (field.type === "boolean") valid = typeof value === "boolean";
    else if (field.type === "text") valid = typeof value === "string" && value.length <= (field.maxLength ?? Infinity) && (!field.required || !!value.trim()) && (!field.pattern || new RegExp(field.pattern).test(value));
    else if (field.type === "select") valid = optionsFor(field, context).some(([id]) => id === value);
    else if (field.type === "reference") valid = typeof value === "string" && optionsFor(field, context).some(([id]) => id === value);
    else if (field.type === "multi") valid = Array.isArray(value) && value.length >= (field.minItems ?? 0) && value.length <= (field.maxItems ?? Infinity) && value.every((v) => optionsFor(field, context).some(([id]) => id === v));
    if (!valid) errors.push(field.label + " [" + field.path + "] の値・範囲・参照が不正です。");
  }
  return errors;
}
