// Domain contracts are pure modules. This file collects their analysis view.
export { DOMAINS, BASE_FIELDS, POSITION_FIELDS, MOVEMENT_FIELDS, MOTION_FIELDS, GROUP_FIELDS } from "./entity-configuration.js?v=20261009-map-workspace-29";
export { MEDIA, PROPAGATION_FIELDS, COMMUNICATION_FIELDS, REPORT_FIELDS, LINK_FIELDS, DISRUPTION_FIELDS, OPERATIONAL_FIELDS, COORDINATION_FIELDS } from "./communication-configuration.js?v=20261009-map-workspace-29";
export { SENSOR_FIELDS } from "./detection-configuration.js?v=20261009-map-workspace-29";
export { COMMAND_FIELDS, INITIAL_FIELDS, ASSUMPTION_FIELDS } from "./information-configuration.js?v=20261009-map-workspace-29";
import { MOVEMENT_FIELDS as MOVEMENT_FIELDS2, MOTION_FIELDS as MOTION_FIELDS2, GROUP_FIELDS as GROUP_FIELDS2 } from "./entity-configuration.js?v=20261009-map-workspace-29";
import { SENSOR_FIELDS as SENSOR_FIELDS2 } from "./detection-configuration.js?v=20261009-map-workspace-29";
import { COMMUNICATION_FIELDS as COMMUNICATION_FIELDS2 } from "./communication-configuration.js?v=20261009-map-workspace-29";
export const analysisFieldDescriptors = () => [...MOVEMENT_FIELDS2, ...MOTION_FIELDS2, ...SENSOR_FIELDS2, ...COMMUNICATION_FIELDS2, ...GROUP_FIELDS2].filter((f) => f.analysis).map((f) => ({ key: f.analysis.key, label: f.label.replace(/（[^）]*）/g, ""), family: f.analysis.family, path: f.id.startsWith("sensor.") ? "sensor." + f.path : f.id.startsWith("communication.") ? "communication." + f.path : f.path, min: f.analysis.min ?? f.min, max: f.max, integer: f.integer, default: typeof f.default === "function" ? 0 : f.default, scope: "entity", scale: 1, ...f.analysis }));
