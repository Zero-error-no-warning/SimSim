import { sharedAssignment } from "./shared-settings.js?v=20261009-configuration-contract-28";
import { configurationTarget } from "./configuration-contract.js?v=20261009-configuration-contract-28";
import { getValue, setValue } from "./configuration-schema.js?v=20261009-configuration-contract-28";
import { setPosition, editableDefinition, pruneReferences } from "./editor.js?v=20261009-configuration-contract-28";
export class ConfigurationSession {
  constructor(source, id, revision, scope = "entity") {
    this.draft = structuredClone(source);
    this.original = JSON.stringify(source);
    this.id = id;
    this.revision = revision;
    this.scope = scope;
    this.target = scope === "scenario" ? { label: "シナリオ設定", scope: "シナリオ全体に適用" } : configurationTarget(this.draft, id);
    if (!this.target) throw Error("設定の対象がありません。");
  }
  get dirty() {
    return JSON.stringify(this.draft) !== this.original;
  }
  record(module) {
    const target = configurationTarget(this.draft, this.id);
    return module.owner === "scenario" ? this.draft : module.owner === "group" ? target?.group : module.owner === "assignment" ? sharedAssignment(this.draft, this.id) : target?.unit;
  }
  set(module, record, field, value) {
    if (module.version || field.version) this.draft.version = Math.max(this.draft.version, module.version ?? field.version);
    if (module.editor === "position") setPosition(this.draft, this.id, field.path.split(".").at(-1), value);
    else if (field.path === "motion.loopStart") {
      const d = editableDefinition(this.draft, this.id);
      if (d.navigationRoute || d.assignment?.route?.length) d.assignment.phase = value;
      else setValue(record, field.path, value);
    } else if (field.id === "entity.domain" && value !== record.domain) {
      const d = editableDefinition(this.draft, this.id);
      if (d.navigationRoute || d.assignment?.route?.length) throw Error("共有経路の領域を変更する前に担当タスクを変更してください。");
      setValue(record, field.path, value);
      const z = value === "subsurface" ? this.draft.terrain.seaLevel - 120 : value === "air" ? this.draft.terrain.seaLevel + 1500 : this.draft.terrain.seaLevel;
      record.initial.z = z;
      for (const p of record.route) p.z = z;
    } else setValue(record, field.path, value);
  }
  position() {
    return editableDefinition(this.draft, this.id)?.unit ?? this.target.unit;
  }
  assertRevision(revision) {
    if (revision !== this.revision) throw Error("編集中に元の定義が変更されました。下書きを上書きせず、設定を開き直してください。");
  }
  prepare(revision) {
    this.assertRevision(revision);
    pruneReferences(this.draft);
    return structuredClone(this.draft);
  }
}
