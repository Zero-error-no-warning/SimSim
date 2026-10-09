import { availableBindings } from "./parameters.js?v=20261009-configuration-contract-28";
import { CONFIGURATION_MODULES, CATEGORIES, SCENARIO_CATEGORIES, configurationTarget, configurationContractErrors } from "./configuration-contract.js?v=20261009-configuration-contract-28";
import { getValue, setValue, resolvedDefault } from "./configuration-schema.js?v=20261009-configuration-contract-28";
import { ConfigurationSession } from "./configuration-session.js?v=20261009-configuration-contract-28";
import { renderFields, FIELD_RENDERERS } from "./settings-form.js?v=20261009-configuration-contract-28";
import { renderResourceCollection, resourceName } from "./resource-ui.js?v=20261009-configuration-contract-28";
import { validateScenario } from "./engine.js?v=20261009-configuration-contract-28";
const el = (tag, text) => {
  const n = document.createElement(tag);
  if (text) n.textContent = text;
  return n;
};
export const EDITOR_RENDERERS = { fields: (ui, ...a) => ui.renderFieldsModule(...a), position: (ui, ...a) => ui.renderFieldsModule(...a), collection: (ui, ...a) => ui.renderCollection(...a), resourceCollection: (ui, ...a) => ui.renderResources(...a), navigation: (ui, ...a) => ui.renderNavigation(...a) };
export class SettingsUI {
  constructor({ getScenario, getRevision, getSelected, commit, pause, navigation, behavior, analysis }) {
    Object.assign(this, { getScenario, getRevision, getSelected, commit, pause, navigation, behavior, analysis });
    const errors = configurationContractErrors(CONFIGURATION_MODULES, FIELD_RENDERERS, EDITOR_RENDERERS);
    if (errors.length) throw Error(errors.join("\n"));
    this.host = document.getElementById("settings-editor");
    this.form = document.getElementById("settings-content");
    this.main = this.host.parentElement;
    this.active = false;
    this.category = "basic";
    document.getElementById("settings-apply").onclick = () => this.apply();
    document.getElementById("settings-back").onclick = () => {
      if (this.navigate(() => this.close())) this.close();
    };
    document.getElementById("settings-cancel").onclick = () => {
      if (this.navigate(() => this.close())) this.close();
    };
    document.getElementById("settings-search").oninput = () => this.render();
    document.getElementById("settings-discard").onclick = () => {
      document.getElementById("settings-leave-dialog").close();
      const action = this.pending;
      this.pending = null;
      this.close();
      action?.();
    };
    document.getElementById("settings-keep").onclick = () => {
      document.getElementById("settings-leave-dialog").close();
      this.pending = null;
    };
    document.getElementById("settings-leave-apply").onclick = () => {
      if (this.apply()) {
        document.getElementById("settings-leave-dialog").close();
        const action = this.pending;
        this.pending = null;
        action?.();
      }
    };
    for (const button of document.querySelectorAll("[data-inspector-tab]")) button.onclick = () => this.inspectorTab(button.dataset.inspectorTab);
    this.inspectorTab("overview");
    document.getElementById("settings-open").onclick = () => this.open();
    document.getElementById("scenario-settings-open").onclick = () => this.open("information", null, "scenario");
  }
  inspectorTab(name) {
    for (const b of document.querySelectorAll("[data-inspector-tab]")) b.setAttribute("aria-pressed", String(b.dataset.inspectorTab === name));
    for (const section of document.querySelectorAll("[data-inspector-page]")) section.hidden = section.dataset.inspectorPage !== name;
  }
  open(category = "basic", focus = null, scope = "entity") {
    const start = () => {
      this.pause();
      this.session = new ConfigurationSession(this.getScenario(), this.getSelected(), this.getRevision(), scope);
      this.active = true;
      this.category = category;
      this.focusModule = focus;
      this.sections = /* @__PURE__ */ new Map();
      document.getElementById("settings-search").value = "";
      document.getElementById("settings-error").textContent = "";
      this.host.hidden = false;
      this.main.classList.add("configuration-open");
      this.main.parentElement.classList.add("configuration-mode");
      this.render();
    };
    if (this.active && this.session.scope === scope && this.session.id === this.getSelected()) {
      this.category = category;
      this.focusModule = focus;
      document.getElementById("settings-search").value = "";
      this.render();
    } else if (this.navigate(start)) start();
  }
  close() {
    this.mapPicking = false;
    this.active = false;
    this.session = null;
    this.host.hidden = true;
    this.main.classList.remove("configuration-open");
    this.main.parentElement.classList.remove("configuration-mode", "configuration-specialized");
  }
  navigate(action) {
    if (!this.active) return true;
    const dedicated = document.querySelector(".settings-inline-editor[open]");
    if (dedicated) {
      let hint = dedicated.querySelector(".settings-specialized-notice");
      if (!hint) {
        hint = el("p");
        hint.className = "settings-specialized-notice validation-message";
        dedicated.prepend(hint);
      }
      hint.textContent = "先にこの編集画面の保存・適用または取消を行ってください。";
      return false;
    }
    if (!this.session.dirty) {
      this.close();
      return true;
    }
    this.pending = action;
    if (!document.getElementById("settings-leave-dialog").open) document.getElementById("settings-leave-dialog").showModal();
    return false;
  }
  apply() {
    if (!this.active) return true;
    try {
      for (const input of this.form.querySelectorAll("input,select")) if (!input.disabled && !input.checkValidity()) {
        for (let ancestor = input.parentElement; ancestor && ancestor !== this.form; ancestor = ancestor.parentElement) if (ancestor.tagName === "DETAILS") ancestor.open = true;
        input.reportValidity();
        throw Error("入力欄の空欄・範囲・形式を修正してください。");
      }
      const next = this.session.prepare(this.getRevision());
      validateScenario(next);
      if (!this.session.dirty) {
        this.close();
        return true;
      }
      if (!this.commit(next, "設定を適用しました。計算を実行してください。")) return false;
      this.close();
      return true;
    } catch (e) {
      document.getElementById("settings-error").textContent = e.message;
      return false;
    }
  }
  context() {
    const s = this.session;
    return { scenario: s.draft, unit: configurationTarget(s.draft, s.id)?.unit, group: configurationTarget(s.draft, s.id)?.group };
  }
  changed(module, record, field, value) {
    try {
      if (module.version) this.session.draft.version = Math.max(this.session.draft.version, module.version);
      if (field) this.session.set(module, record, field, value);
      document.getElementById("settings-error").textContent = "";
      document.getElementById("settings-dirty").textContent = this.session.dirty ? "下書き · 適用で保存元を変更" : "保存済みの設定を表示";
      if (field && ["select", "reference"].includes(field.type) || field?.id === "resource.capacity") this.render();
    } catch (e) {
      document.getElementById("settings-error").textContent = e.message;
      this.render();
    }
  }
  render() {
    if (!this.active) return;
    const s = this.session, context = this.context(), categories = s.scope === "scenario" ? SCENARIO_CATEGORIES : CATEGORIES;
    document.getElementById("settings-title").textContent = s.target.label + "の設定";
    document.getElementById("settings-scope").textContent = s.scope === "entity" ? configurationTarget(s.draft, s.id).scope : s.target.scope;
    document.getElementById("settings-dirty").textContent = s.dirty ? "下書き · 適用で保存元を変更" : "保存済みの設定を表示";
    const nav = document.getElementById("settings-categories");
    nav.replaceChildren();
    for (const [id, label] of categories) {
      const button = el("button", label);
      button.type = "button";
      button.dataset.settingsCategory = id;
      button.setAttribute("aria-pressed", String(this.category === id));
      button.onclick = () => {
        this.category = id;
        this.focusModule = null;
        document.getElementById("settings-search").value = "";
        this.render();
      };
      nav.append(button);
    }
    const search = document.getElementById("settings-search").value.toLowerCase().trim();
    for (const section of this.form.querySelectorAll("details[data-settings-section]")) this.sections.set(section.dataset.settingsSection, section.open);
    this.form.replaceChildren();
    const modules = CONFIGURATION_MODULES.filter((m) => s.scope === "scenario" ? m.owner === "scenario" : m.owner === "entity" || m.owner === "group" && context.group || m.owner === "assignment" || m.id === "scenario.initialInformation");
    let shown = 0;
    for (const module of modules) {
      if (!search && module.category !== this.category || search && ![module.label, ...module.fields.map((f) => f.label + " " + f.id)].join(" ").toLowerCase().includes(search)) continue;
      const card = el("details");
      card.className = "settings-module";
      card.dataset.settingsModule = module.id;
      card.dataset.settingsSection = "module." + module.id;
      card.open = !!search || this.focusModule === module.id || (this.sections.get("module." + module.id) ?? (!this.focusModule && shown === 0));
      shown++;
      card.append(el("summary", module.label));
      const body = el("div");
      body.className = "settings-module-body";
      card.append(body);
      this.form.append(card);
      const record = s.record(module);
      EDITOR_RENDERERS[module.editor](this, module, body, record, context);
      this.renderAnalysis(module, body, context);
    }
    if (!shown) this.form.append(el("p", "該当する設定はありません。"));
    for (const section of this.form.querySelectorAll("details[data-settings-section]")) if (!section.dataset.settingsSection.startsWith("module.") && this.sections.has(section.dataset.settingsSection)) section.open = this.sections.get(section.dataset.settingsSection);
  }
  renderFieldsModule(module, host, root, context) {
    if (!root) {
      host.append(el("p", "担当タスクがありません。運用の「経路と担当タスク」から割り当ててください。"));
      return;
    }
    let record = module.path ? getValue(root, module.path) : root;
    if (module.optionalObject && !record) {
      host.append(el("p", "未搭載"));
      const add = el("button", "＋ " + module.label + "を搭載");
      add.type = "button";
      add.onclick = () => {
        const r = {};
        for (const f of module.fields) if (f.required) setValue(r, f.path, structuredClone(resolvedDefault(f, r, context)));
        setValue(root, module.path, r);
        this.changed(module);
        this.focusModule = module.id;
        this.render();
      };
      host.append(add);
      return;
    }
    if (module.optionalObject) {
      const remove = el("button", "装置を取り外す");
      remove.type = "button";
      remove.onclick = () => {
        setValue(root, module.path, void 0);
        this.changed(module);
        this.render();
      };
      host.append(remove);
    }
    if (module.editor === "position") record = this.session.position();
    if (module.id === "entity.motion") {
      const assignment = this.session.record({ owner: "assignment" });
      if (assignment && this.session.position().routeMode === "loop") record = { ...root, motion: { ...root.motion, loopStart: assignment.phase ?? 0 } };
    }
    if (module.owner === "assignment") host.append(el("p", "この担当タスクの全員に適用します。"));
    const grid = el("div");
    grid.className = "settings-field-grid";
    renderFields(grid, module.fields, record, context, (field, value) => this.changed(module, module.editor === "position" || module.id === "entity.motion" ? root : record, field, value));
    host.append(grid);
  }
  renderResources(module, host, unit, context) {
    renderResourceCollection(host, unit, context, (field, value, record) => this.changed(module, record ?? unit, field, value), () => {
      this.focusModule = module.id;
      this.render();
    });
  }
  list(module, root) {
    if (module.id === "entity.periodicReports") return [...root.statusReports ? [{ ...root.statusReports, messageKind: "status" }] : [], ...root.periodicReports ?? []].map((r) => structuredClone(r));
    return structuredClone(getValue(root, module.path) ?? []);
  }
  renderCollection(module, host, root, context) {
    const unitInitial = module.id === "scenario.initialInformation" && this.session.scope === "entity";
    if (unitInitial && context.group) {
      host.append(el("p", "初期情報の所有者は単体ユニットです。シナリオ設定から所有者を指定してください。"));
      return;
    }
    const items = this.list(module, root), write = () => {
      setValue(root, module.path, items.length ? items : void 0);
      if (module.id === "entity.periodicReports") delete root.statusReports;
      this.changed(module);
    };
    const visible = items.map((r, i) => [r, i]).filter(([r]) => !unitInitial || r.ownerId === this.session.id);
    if (!visible.length) host.append(el("p", "未設定"));
    if (module.id === "scenario.links") host.append(el("p", "設定した有向リンクだけが通信に使われます。全件削除すると、送信装置の範囲内で通信する既定モデルへ戻ります。"));
    if (module.id === "scenario.initialInformation") host.append(el("p", "開始時点で知っている内容を指定します。敵の真の配置とは独立した情報です。"));
    for (const [record, index] of visible) {
      const card = el("details");
      card.className = "settings-collection-item";
      card.dataset.settingsSection = module.id + "." + index;
      card.open = visible.length <= 3;
      card.append(el("summary", index + 1 + ": " + (record.id ?? record.unitId ?? record.ownerId ?? record.messageKind ?? module.label)));
      const fields = el("div");
      fields.className = "settings-field-grid";
      renderFields(fields, module.fields.map((f) => unitInitial && f.path === "ownerId" ? { ...f, readonly: true } : f), record, context, (field, value) => {
        setValue(record, field.path, field.emptyMeansAbsent && !value?.length ? void 0 : value);
        if (field.version) this.session.draft.version = Math.max(this.session.draft.version, field.version);
        write();
        if (field.type === "select" || field.type === "reference") {
          this.focusModule = module.id;
          this.render();
        }
      });
      card.append(fields);
      const remove = el("button", "削除");
      remove.type = "button";
      remove.onclick = () => {
        items.splice(index, 1);
        write();
        this.focusModule = module.id;
        this.render();
      };
      card.append(remove);
      host.append(card);
    }
    const add = el("button", "＋ 追加");
    add.type = "button";
    add.dataset.addCollection = module.id;
    add.disabled = items.length >= module.maxItems;
    add.onclick = () => {
      const record = {};
      for (const f of module.fields) {
        if (f.when && !f.when(record, context)) continue;
        const value = resolvedDefault(f, record, context);
        if (value !== void 0) setValue(record, f.path, structuredClone(value));
      }
      if (module.id === "scenario.initialInformation") {
        record.ownerId = unitInitial ? this.session.id : context.scenario.units[0]?.id ?? "";
        record.observation.targetId = context.scenario.units.find((u) => u.id !== record.ownerId)?.id ?? record.ownerId;
      }
      if (module.id === "scenario.links") {
        let n = 1;
        while (items.some((i) => i.id === "link-" + n)) n++;
        record.id = "link-" + n;
        record.senderId = context.scenario.units[0]?.id ?? "";
        record.receiverId = context.scenario.units[1]?.id ?? "";
      }
      if (module.id === "scenario.operational") record.unitId = context.scenario.units[0]?.id ?? "";
      items.push(record);
      write();
      this.focusModule = module.id;
      this.render();
    };
    host.append(add);
  }
  renderAnalysis(module, host, context) {
    const target = context.group ? "group:" + context.group.id : "unit:" + this.session.id, keys = new Set(module.fields.filter((f) => f.analysis).map((f) => f.analysis.key)), bindings = availableBindings(this.session.draft).filter((b) => b.target === target && keys.has(b.parameter));
    const footer = el("div");
    footer.className = "settings-analysis";
    if (!bindings.length) {
      footer.append(el("small", module.analysis.reason ?? "この項目は分析変数に未対応です。"));
    } else {
      const select = el("select");
      select.setAttribute("aria-label", module.label + "の分析変数");
      for (const b of bindings) select.append(new Option(b.label, b.parameter));
      footer.append(select);
      for (const [kind, label] of [["factors", "比較に追加"], ["uncertainties", "ばらつきに追加"]]) {
        const button = el("button", label);
        button.type = "button";
        button.onclick = () => {
          const binding = { target, parameter: select.value };
          const action = () => this.analysis?.(binding, kind);
          if (this.navigate(action)) action();
        };
        footer.append(button);
      }
    }
    host.append(footer);
  }
  renderNavigation(module, host) {
    const d = this.session.position();
    host.append(el("p", "経路 " + (d.route?.length ?? 0) + "点 · " + ({ loop: "周回", once: "一度だけ", pingpong: "往復" }[d.routeMode] ?? d.routeMode)));
    for (const [label, action] of [["経路を編集・検査", () => this.navigation()], ["担当・挙動を編集", () => this.behavior()]]) {
      const button = el("button", label);
      button.type = "button";
      button.onclick = action;
      if (label === "経路を編集・検査") button.id = "route-plan-open";
      host.append(button);
    }
    host.append(el("p", "地図の配置編集では経由点を直接操作できます。"));
  }
  dedicated(dialog, open) {
    if (!this.active) this.open("operation", "entity.route");
    const slot = document.getElementById("settings-specialized"), parent = dialog.parentElement;
    slot.hidden = false;
    this.form.hidden = true;
    this.host.querySelector(".settings-footer").hidden = true;
    this.main.parentElement.classList.add("configuration-specialized");
    slot.append(dialog);
    dialog.dataset.inlineEditor = "true";
    dialog.classList.add("settings-inline-editor");
    let actionButton, actionText, cancelButton, cancelText;
    const finish = () => {
      if (this.mapPicking) return;
      if (actionButton) actionButton.textContent = actionText;
      if (cancelButton) cancelButton.textContent = cancelText;
      dialog.querySelector(".settings-editor-context")?.remove();
      dialog.removeEventListener("close", finish);
      delete dialog.dataset.inlineEditor;
      dialog.classList.remove("settings-inline-editor");
      parent.append(dialog);
      slot.hidden = true;
      this.form.hidden = false;
      this.host.querySelector(".settings-footer").hidden = false;
      this.main.parentElement.classList.remove("configuration-specialized");
      if (this.active) this.render();
    };
    dialog.addEventListener("close", finish);
    try {
      open();
      actionButton = dialog.querySelector("#behavior-apply,#navigation-save");
      cancelButton = dialog.querySelector("#behavior-cancel,#navigation-cancel");
      if (actionButton) {
        actionText = actionButton.textContent;
        actionButton.textContent = "下書きへ反映";
      }
      if (cancelButton) {
        cancelText = cancelButton.textContent;
        cancelButton.textContent = "取消して設定へ戻る";
      }
      const hint = el("p", "ここでの変更は下書きに反映されます。設定画面の「適用」で確定します。");
      hint.className = "settings-editor-context route-help";
      dialog.prepend(hint);
    } catch (error) {
      finish();
      throw error;
    }
  }
  suspendForMap() {
    this.mapPicking = true;
    this.host.hidden = true;
    this.main.classList.remove("configuration-open");
    this.main.parentElement.classList.remove("configuration-mode", "configuration-specialized");
  }
  restoreFromMap() {
    this.mapPicking = false;
    if (this.active) {
      this.host.hidden = false;
      this.main.classList.add("configuration-open");
      this.main.parentElement.classList.add("configuration-mode", "configuration-specialized");
    }
  }
  inspector(source, selected, unit) {
    const target = configurationTarget(source, selected), host = document.getElementById("inspector-overview");
    host.replaceChildren();
    document.getElementById("properties").hidden = !unit;
    document.getElementById("empty-selection").hidden = !!unit;
    document.getElementById("delete").disabled = !unit || !!target?.group;
    if (!unit) return;
    document.getElementById("inspector-name").textContent = unit.name;
    document.getElementById("inspector-scope").textContent = target.scope;
    const add = (title, value, category, focus) => {
      const button = el("button");
      button.className = "inspector-summary";
      button.append(el("strong", title), el("span", value));
      button.onclick = () => this.open(category, focus);
      host.append(button);
      return button;
    };
    const u = target.unit, a = source.behaviorAssignments?.find((a2) => a2.targets.includes("unit:" + selected) || target.group && a2.targets.includes("group:" + target.group.id));
    const task = add("担当・経路", a?.name ?? "担当タスクなし · 個別経路", "operation", "entity.route");
    task.id = "unit-task-open";
    task.onclick = () => this.behavior();
    add("移動", +(u.speed * 3.6).toFixed(1) + " km/h", "capabilities", "entity.movement");
    add("探知装置", u.sensor ? u.sensor.enabled ? "使用 · " + u.sensor.range / 1e3 + " km" : "停止中" : "未搭載", "capabilities", "entity.sensor");
    add("通信装置", u.communication ? u.communication.enabled ? "使用 · " + u.communication.range / 1e3 + " km" : "停止中" : "未搭載", "capabilities", "entity.communication");
    add("資源", Object.entries(u.resources ?? {}).map(([id, r]) => resourceName(id) + " · 容量 " + r.capacity + " / 初期 " + (r.initial ?? r.capacity)).join("、") || "未設定 · 制約なし", "capabilities", "unit.resources");
  }
}
