import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACK_PATH = resolve(ROOT, "content/routine-engine/mesh-routine-content-v1.json");
const DOC_PATH = resolve(ROOT, "docs/routine-engine-v2-mesh-content-v1.md");
const SQL_PATH = resolve(ROOT, "supabase/phase10l_mesh_routine_content_pack.sql");
const PACK_START = "-- BEGIN GENERATED MESH CONTENT PACK PAYLOAD";
const PACK_END = "-- END GENERATED MESH CONTENT PACK PAYLOAD";

const SOURCE_HASHES = Object.freeze({
  opening: "ea00e80bde6c17ea1d3f1095949363d79d606dcee16f05f742426c1c5248e079",
  closing: "27698f86716a141268546c623609f8b956213e53f20d00c03935cad01bd9244c",
  doubleShift: "f4fce4d5a3dcafecd7dfca2a5bf780f7c3652634da2cb0f068daa5d4f506a0eb",
});

const TOP_LEVEL_FIELDS = Object.freeze([
  "schemaVersion", "packKey", "packVersion", "name", "description", "sections",
  "locations", "locationSets", "standards", "references", "opening", "closing",
  "doubleShiftSteps", "doubleShiftCopy", "unresolvedRequirements", "sourceDocuments", "packHash",
]);

const ROOM_KEYS = ["project-room-001", "project-room-002", "project-room-003", "project-room-004", "project-room-006", "boardroom"];
const FRIDGE_KEYS = ["workbar-bar-left-fridge", "workbar-bar-right-fridge", "workbar-non-alcoholic-fridge", "workbar-milk-fridge", "cornerbar-left-fridge", "cornerbar-middle-fridge", "cornerbar-right-fridge"];
const TOILET_KEYS = ["workbar-toilets", "basement-toilets", "cornerbar-toilets"];
const DOOR_KEYS = ["front-door", "vindfang-door", "kitchen-atrium-door", "atrium-workbar-door", "cornerbar-atrium-door", "garbage-hallway-atrium-door", "cornerbar-street-door", "cornerbar-street-upper-security-lock"];

const LOCATIONS = [
  ["workbar", "Workbar", "zone"], ["atrium", "Atrium", "zone"], ["cornerbar", "Cornerbar", "zone"],
  ["members-lounge", "Members lounge", "zone"], ["kitchen", "Kitchen", "zone"],
  ["cleaning-station", "Cleaning station", "station"], ["self-service-counter", "Self-service counter", "station"],
  ["coffee-machine", "Coffee machine", "equipment"], ["coffee-canister-kitchen-reserve", "Coffee Canister kitchen reserve", "storage"],
  ["register", "Register", "station"], ["workbar-screen", "Workbar screen", "equipment"],
  ["serviceware-storage", "Serviceware storage", "storage"], ["waste-room-route", "Waste room / waste route", "collection_point"],
  ["project-room-001", "001", "room"], ["project-room-002", "002", "room"], ["project-room-003", "003", "room"],
  ["project-room-004", "004", "room"], ["project-room-006", "006", "room"], ["boardroom", "Boardroom", "room"],
  ["workbar-bar-left-fridge", "Workbar Bar Left", "fridge"], ["workbar-bar-right-fridge", "Workbar Bar Right", "fridge"],
  ["workbar-non-alcoholic-fridge", "Workbar Non-Alcoholic Fridge", "fridge"], ["workbar-milk-fridge", "Workbar Milk Fridge", "fridge"],
  ["cornerbar-left-fridge", "Cornerbar Left", "fridge"], ["cornerbar-middle-fridge", "Cornerbar Middle", "fridge"], ["cornerbar-right-fridge", "Cornerbar Right", "fridge"],
  ["workbar-toilets", "Workbar toilets", "toilet"], ["basement-toilets", "Basement toilets", "toilet"], ["cornerbar-toilets", "Cornerbar toilets", "toilet"],
  ["front-door", "Front door", "door"], ["vindfang-door", "Vindfang door", "door"], ["kitchen-atrium-door", "Kitchen / Atrium door", "door"],
  ["atrium-workbar-door", "Atrium / Workbar door", "door"], ["cornerbar-atrium-door", "Cornerbar / Atrium door", "door"],
  ["garbage-hallway-atrium-door", "Garbage hallway / Atrium door", "door"], ["cornerbar-street-door", "Cornerbar street door", "door"],
  ["cornerbar-street-upper-security-lock", "Cornerbar street upper security lock", "door"],
  ["workbar-dishwashers", "Workbar dishwashers", "equipment"], ["kitchen-dishwashers", "Kitchen dishwashers", "equipment"],
  ["device-charging-station", "Device charging station", "equipment"], ["music-control", "Music control", "equipment"],
  ["lighting-control", "Lighting control", "equipment"], ["salto-control", "Salto control", "equipment"],
].map(([key, name, type], sortOrder) => ({ key, name, type, sortOrder, metadata: {} }));

const LOCATION_SETS = [
  ["opening-project-rooms", "Opening project rooms", ROOM_KEYS, {}],
  ["closing-project-rooms", "Closing project rooms", ROOM_KEYS, {}],
  ["workbar-public-toilets", "Workbar public toilets", ["workbar-toilets"], {}],
  ["all-operational-toilets", "All operational toilets", TOILET_KEYS, {}],
  ["active-audio-zones", "Active audio zones", ["workbar", "atrium", "cornerbar"], {}],
  ["active-service-zones", "Active service zones", ["workbar", "atrium", "cornerbar"], {}],
  ["all-operational-fridges", "All operational fridges", FRIDGE_KEYS, {}],
  ["workbar-bar-fridges", "Workbar bar fridges", FRIDGE_KEYS.slice(0, 2), {}],
  ["cornerbar-fridges", "Cornerbar fridges", FRIDGE_KEYS.slice(4), {}],
  ["closing-door-check", "Closing door check", DOOR_KEYS, {}],
  ["final-guest-area-sweep", "Final guest area sweep", ["workbar", "members-lounge", ...TOILET_KEYS, "cornerbar", "atrium", ...ROOM_KEYS, "kitchen"], {}],
  ["serviceware-recovery-route", "Serviceware recovery route", ["workbar", "members-lounge", "atrium", "cornerbar", ...ROOM_KEYS, "kitchen", "serviceware-storage"], { managerIncomplete: true }],
].map(([key, name, members, metadata], sortOrder) => ({ key, name, description: key === "serviceware-recovery-route" ? "Known physical recovery points only. Relevant office-floor points remain unresolved." : null, members, sortOrder, metadata }));

const SELF_SERVICE_COMPONENTS = [
  "milk jug with milk during service", "sugar", "sweetener", "stirrers", "loose-leaf tea slots",
  "measuring spoon glass", "empty tea bags", "honey", "toothpicks", "napkins", "small-waste container",
  "one Coffee Canister during service", "one basket with knives and forks", "one container with teaspoons",
  "takeaway cups", "large lids", "small lids", "two sets/stacks of plates", "baked goods", "fruit", "snacks",
  "food/non-alcoholic fridge products", "eggs",
];
const OVERNIGHT_POLICY = [
  "no fresh milk left out", "no old coffee left out", "milk jug emptied and cleaned",
  "Coffee Canisters cleaned and stored", "dry goods/serviceware full", "baked-goods surface clean and empty",
  "fruit/snacks at approved overnight standard", "waste container emptied", "surfaces clean and dry",
];

const STANDARDS = [
  ["workbar-milk-fridge-target", "Workbar Milk Fridge target", "object", "manual", { regularMilk: 2, oatly: 2 }],
  ["lunch-coffee-canister-ready-target", "Lunch Coffee Canister ready target", "object", "manual", { membersLounge: 1, kitchenReserve: 3, totalReady: 4 }],
  ["baked-goods-daily", "Baked goods daily", "object", "manual", { requiredEveryDay: true }],
  ["self-service-fixed-components", "Self-service fixed components", "list", "manual", SELF_SERVICE_COMPONENTS],
  ["self-service-overnight-policy", "Self-service overnight policy", "list", "manual", OVERNIGHT_POLICY],
  ["coffee-canister-total-inventory-target", "Total Coffee Canister inventory target", "integer", "manual"],
  ["coffee-cups-full-target", "Coffee cups full target", "integer", "manual"],
  ["coffee-cups-service-ready-target", "Coffee cups service-ready target", "integer", "manual"],
  ["wine-glasses-full-target", "Wine glasses full target", "integer", "manual"],
  ["wine-glasses-service-ready-target", "Wine glasses service-ready target", "integer", "manual"],
  ["self-service-tea-slot-names", "Six named loose-leaf tea slots", "list", "manual"],
  ["serviceware-office-recovery-route-confirmation", "Serviceware office recovery route confirmation", "object", "location_set"],
  ["door-and-lock-rules", "Door and lock rules", "object", "manual"],
  ["fridge-closing-rules", "Fridge closing rules", "object", "manual"],
].map(([key, label, valueType, sourceKind, currentValue]) => ({
  key, label, description: currentValue === undefined ? "Unresolved publication and readiness blocker." : null,
  valueType, sourceKind, ...(currentValue === undefined ? {} : { currentRevision: { value: currentValue, reason: "Authoritative Mesh content pack v1R." } }),
}));

const REFERENCES = [
  ["workbar-cleaning-station-opening", "Workbar cleaning station opening", ["O07"]],
  ["members-lounge-coffee-point", "Members lounge coffee point", ["O10", "O11", "O26"]],
  ["workbar-food-non-alcoholic-fridge", "Workbar food and non-alcoholic fridge", ["O13", "C08", "C28"]],
  ["workbar-milk-fridge", "Workbar Milk Fridge", ["O09", "C09", "C29"]],
  ["self-service-opening-standard", "Self-service opening standard", ["O14"]],
  ["self-service-overnight-standard", "Self-service overnight standard", ["C07", "C32"]],
  ["project-room-standard", "Project-room standard", ["O16", "O31", "C04"]],
  ["workbar-standard-layout", "Workbar standard layout", ["O23", "O25", "O29", "O35", "C05", "C14", "C22"]],
  ["atrium-standard-layout", "Atrium standard layout", ["O23", "O25", "C05", "C14", "C22"]],
  ["coffee-canister-lunch-reserve", "Coffee Canister lunch reserve", ["O06", "O28", "O34"]],
  ["coffee-canister-rinsed-storage", "Coffee Canister rinsed storage", ["C06", "C17"]],
  ["coffee-cups-full-storage", "Coffee cups full storage", ["O15", "O29", "O35", "C27"]],
  ["wine-glasses-full-storage", "Wine glasses full storage", ["O15", "O29", "O35", "C27"]],
  ["workbar-bar-left-fridge", "Workbar Bar Left fridge", ["C10", "C30", "C33"]],
  ["workbar-bar-right-fridge", "Workbar Bar Right fridge", ["C10", "C30", "C33"]],
  ["cornerbar-left-fridge", "Cornerbar Left fridge", ["C10", "C30", "C33"]],
  ["cornerbar-middle-fridge", "Cornerbar Middle fridge", ["C10", "C30", "C33"]],
  ["cornerbar-right-fridge", "Cornerbar Right fridge", ["C10", "C30", "C33"]],
  ["opened-wine-date-label", "Opened wine date label", ["C11", "C31"]],
  ["cleaning-station-final-close", "Cleaning station final close", ["C13"]],
  ["coffee-machine-night-state", "Coffee machine night state", ["C18"]],
  ["milk-system-cleaning-parts", "Milk-system cleaning parts", ["C19"]],
  ["bar-equipment-storage", "Bar equipment storage", ["C20"]],
  ["beer-tap-parts", "Beer-tap parts", ["C20"]],
  ["beer-drip-trays", "Beer drip trays", ["C20"]],
  ["workbar-dishwasher-night-state", "Workbar dishwasher night state", ["C23"]],
  ["kitchen-dishwasher-night-state", "Kitchen dishwasher night state", ["C24"]],
  ["device-charging-station", "Device charging station", ["C37"]],
  ["workbar-screen-night-state", "Workbar screen night state", ["C39"]],
  ["closed-lighting-preset", "Closed lighting preset", ["C40"]],
  ["closing-door-check", "Closing door check", ["C42"]],
  ["cornerbar-upper-security-lock", "Cornerbar upper security lock", ["C42"]],
  ["salto-closing-status", "Salto closing status", ["C43"]],
].map(([key, label, taskIds]) => ({ key, label, description: `Placeholder reference for ${label}.`, placeholderText: "Referansebilde kommer", buttonLabel: "Vis hvordan det skal se ut", taskIds }));

const UNRESOLVED = [
  ["coffee-cups-full-target", "Coffee cups full target", ["O15", "C27"]],
  ["coffee-cups-service-ready-target", "Coffee cups service-ready target", ["O29", "O35"]],
  ["wine-glasses-full-target", "Wine glasses full target", ["O15", "C27"]],
  ["wine-glasses-service-ready-target", "Wine glasses service-ready target", ["O29", "O35"]],
  ["coffee-canister-total-inventory-target", "Total Coffee Canister inventory target", ["C17"]],
  ["self-service-tea-slot-names", "Names of the six loose-leaf tea slots", ["O14", "C32"]],
  ["serviceware-office-recovery-route-confirmation", "Exact serviceware recovery route through relevant office floors", ["O15", "C03", "C27"]],
  ["door-and-lock-rules", "Door and lock rules", ["C42", "C46"]],
  ["fridge-closing-rules", "Fridge closing rules", ["C33"]],
].map(([standardKey, label, affectedTaskIds]) => ({ standardKey, label, affectedTaskIds, blockerType: "publication_and_readiness" }));

const SECTION_CONFIG = {
  O: [
    { key: "opening-07-08", title: "Opening 07:00–08:00", phaseType: "startup", taskRange: [1, 23] },
    { key: "opening-08-10", title: "Opening 08:00–10:00", phaseType: "service", taskRange: [24, 29] },
    { key: "opening-10-11", title: "Opening 10:00–11:00", phaseType: "checkpoint", taskRange: [30, 37] },
  ],
  C: [
    { key: "closing-15-18", title: "Closing 15:00–18:00", phaseType: "preclose", taskRange: [1, 15] },
    { key: "closing-18-19", title: "Closing 18:00–19:00", phaseType: "final_close", taskRange: [16, 46] },
  ],
};

const TASK_LOCATION_SETS = {
  O15: "serviceware-recovery-route", O16: "opening-project-rooms", O19: "active-audio-zones", O31: "opening-project-rooms", O32: "workbar-public-toilets",
  C03: "serviceware-recovery-route", C04: "closing-project-rooms", C10: "all-operational-fridges", C15: "active-service-zones", C27: "serviceware-recovery-route",
  C30: "all-operational-fridges", C33: "all-operational-fridges", C38: "active-audio-zones", C41: "final-guest-area-sweep", C42: "closing-door-check",
};

const TASK_LOCATIONS = {
  O03: "coffee-machine", O04: "workbar-dishwashers", O05: "kitchen-dishwashers", O07: "cleaning-station", O09: "workbar-milk-fridge",
  O10: "members-lounge", O11: "members-lounge", O13: "workbar-non-alcoholic-fridge", O14: "self-service-counter", O17: "register", O20: "workbar-screen",
  C13: "cleaning-station", C18: "coffee-machine", C23: "workbar-dishwashers", C24: "kitchen-dishwashers", C29: "workbar-milk-fridge",
  C32: "self-service-counter", C35: "register", C37: "device-charging-station", C39: "workbar-screen", C43: "salto-control",
};

const TIMING = {
  O23: { targetLocalTime: "08:00:00" },
  O29: { visibleFromLocalTime: "09:35:00", startFromLocalTime: "09:40:00", targetLocalTime: "09:45:00", overdueLocalTime: "09:55:00" },
  O35: { visibleFromLocalTime: "10:35:00", startFromLocalTime: "10:40:00", targetLocalTime: "10:45:00", overdueLocalTime: "10:50:00", hardDeadlineLocalTime: "10:55:00" },
  O37: { targetLocalTime: "11:00:00" },
  C14: { visibleFromLocalTime: "17:35:00", targetLocalTime: "17:45:00", overdueLocalTime: "17:55:00" },
};

const CONDITIONS = {
  O22: { fact: "organization_flag", operator: "equals", value: "seasonal_candles" },
  C19: { fact: "weekday", operator: "in", value: ["wednesday", "friday"] },
};

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function normalizedLines(value) { return value.replaceAll("\r\n", "\n").split("\n").map((line) => line.replace(/^ {4}/, "")); }
function sectionText(block, heading, nextHeadings, level = 3) {
  const lines = normalizedLines(block);
  const marker = "#".repeat(level);
  const start = lines.findIndex((line) => line.trim() === `${marker} ${heading}`);
  if (start < 0) return "";
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (nextHeadings.some((next) => lines[index].trim() === `${marker} ${next}`)) { end = index; break; }
  }
  return lines.slice(start + 1, end).join("\n").trim().replace(/\n\n---\s*$/, "");
}
function bullets(value) {
  const result = [];
  for (const rawLine of value.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("- ")) result.push(line.slice(2).trim());
    else if (line && result.length) result[result.length - 1] += ` ${line}`;
  }
  return result;
}
function parseItems(value, taskId) {
  return bullets(value).map((entry, sortOrder) => {
    const match = entry.match(/^`([^`]+)`\s*(?:—|-)?\s*(.*)$/);
    if (!match) throw new Error(`${taskId}: structured item lacks a backticked stable key: ${entry}`);
    const label = match[2] || match[1].replaceAll("_", " ");
    if (label.length > 300) throw new Error(`${taskId}/${match[1]} label exceeds 300 characters.`);
    return { key: match[1], label, itemType: inferItemType(match[1], label), required: true, sourceKind: "static", sourceConfig: {}, inputSchema: inferInputSchema(match[1], label), sortOrder, metadata: { sourceText: entry } };
  });
}
function inferItemType(key, label) {
  const text = `${key} ${label}`.toLowerCase();
  if (/count|quantity|number|amount|inventory/.test(text)) return "count";
  if (/time|date|expected|owner|responsib|reason|constraint|note|summary|details|route|zones|room_use/.test(text)) return "text";
  if (/status|state|result|outcome/.test(text)) return "status";
  if (/room|location|area|zone/.test(text)) return "location";
  if (/asset|ipad|terminal|device|equipment|part/.test(text)) return "asset";
  return "check";
}
function inferInputSchema(key, label) {
  const type = inferItemType(key, label);
  if (type === "count") return { type: "integer", minimum: 0 };
  if (type === "check") return { type: "boolean" };
  return { type: "string", minLength: 1, maxLength: 1000 };
}
function metadataValue(block, label) {
  const lines = normalizedLines(block);
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matcher = new RegExp(`^\\s*\\*\\*${escaped}:\\*\\*\\s*\\x60?([^\\x60]+?)\\x60?\\s*$`, "i");
  return lines.map((line) => line.match(matcher)?.[1]?.trim()).find(Boolean) || null;
}
function normalizePolicy(value) { return value?.replaceAll("-", "_").replaceAll(" ", "_").toLowerCase(); }
function sourceTypeToTaskType(sourceType) { return sourceType === "conditional" ? "action" : sourceType; }
function applyItemSources(task) {
  for (const item of task.items) {
    const text = `${item.key} ${item.label}`.toLowerCase();
    let standardKey = null;
    if (["O09", "C09", "C29"].includes(task.id) && /(milk|oat|fridge|standard)/.test(text)) standardKey = "workbar-milk-fridge-target";
    if (["O06", "O11", "O28", "O34"].includes(task.id) && /(canister|reserve|ready|coffee)/.test(text)) standardKey = "lunch-coffee-canister-ready-target";
    if (["O12"].includes(task.id) && /baked/.test(text)) standardKey = "baked-goods-daily";
    if (task.id === "O14") standardKey = /tea/.test(text) ? "self-service-tea-slot-names" : "self-service-fixed-components";
    if (task.id === "C32") standardKey = /tea/.test(text) ? "self-service-tea-slot-names" : "self-service-overnight-policy";
    if (["O15", "C27"].includes(task.id) && /coffee.*cup|cup/.test(text)) standardKey = "coffee-cups-full-target";
    if (["O15", "C27"].includes(task.id) && /wine.*glass|glass/.test(text)) standardKey = "wine-glasses-full-target";
    if (["O29", "O35"].includes(task.id) && /coffee.*cup|cup/.test(text)) standardKey = "coffee-cups-service-ready-target";
    if (["O29", "O35"].includes(task.id) && /wine.*glass|glass/.test(text)) standardKey = "wine-glasses-service-ready-target";
    if (task.id === "C17" && /(inventory|total|account)/.test(text)) standardKey = "coffee-canister-total-inventory-target";
    if (task.id === "C33") standardKey = "fridge-closing-rules";
    if (task.id === "C42") standardKey = "door-and-lock-rules";
    if (standardKey) { item.sourceKind = "routine_standard"; item.standardKey = standardKey; item.sourceConfig = {}; }
    if (["O13", "C08", "C28"].includes(task.id) && /(product|stock|fridge|egg|food|non-alcohol)/.test(text)) {
      delete item.standardKey; item.sourceKind = "inventory_readonly"; item.sourceConfig = { locationCode: "WORKBAR_NON_ALCO_FRIDGE", access: "read_only" };
    }
    if (task.id === "C37") { delete item.standardKey; item.sourceKind = "asset_registry_readonly"; item.sourceConfig = { access: "read_only" }; }
  }
  if (TASK_LOCATION_SETS[task.id]) {
    const routeItem = task.items.find((item) => /location|route|room|fridge|door|sweep|area|zone/.test(`${item.key} ${item.label}`.toLowerCase()));
    if (routeItem && routeItem.sourceKind === "static") { routeItem.sourceKind = "location_set"; routeItem.locationSetKey = TASK_LOCATION_SETS[task.id]; routeItem.sourceConfig = {}; }
  }
}
function parseRoutine(source, prefix) {
  const matcher = new RegExp(`^## ${prefix}(\\d{2}) — ([^\\n]+)\\n([\\s\\S]*?)(?=^## ${prefix}\\d{2} — |$(?![\\s\\S]))`, "gm");
  const tasks = [];
  let match;
  while ((match = matcher.exec(source)) !== null) {
    const id = `${prefix}${match[1]}`;
    const block = match[0].trim();
    const sourceType = normalizePolicy(metadataValue(block, "Type"));
    const instructions = sectionText(block, "Employee instruction", ["Structured task items", "Done when", "Deviation and blocking rules", "Reference guidance", "Dependencies and relations"]);
    const structuredItemsText = sectionText(block, "Structured task items", ["Done when", "Deviation and blocking rules", "Reference guidance", "Dependencies and relations"]);
    const doneCriteriaText = sectionText(block, "Done when", ["Deviation and blocking rules", "Reference guidance", "Dependencies and relations"]);
    const deviationRulesText = sectionText(block, "Deviation and blocking rules", ["Reference guidance", "Dependencies and relations"]);
    const referenceGuidanceText = sectionText(block, "Reference guidance", ["Dependencies and relations"]);
    const taskNumber = Number(match[1]);
    const section = SECTION_CONFIG[prefix].find((entry) => taskNumber >= entry.taskRange[0] && taskNumber <= entry.taskRange[1]);
    const task = {
      id, taskKey: `${prefix.toLowerCase()}${match[1]}-${metadataValue(block, "Stable key").split(".").slice(2).join("-")}`,
      stableKey: metadataValue(block, "Stable key"), title: match[2].trim(), sectionKey: section.key,
      sourceType, taskType: sourceTypeToTaskType(sourceType), criticality: normalizePolicy(metadataValue(block, "Criticality")),
      mandatory: metadataValue(block, "Mandatory") === "true", initialAssessmentPolicy: normalizePolicy(metadataValue(block, "Initial assessment policy")),
      completionPolicy: normalizePolicy(metadataValue(block, "Completion policy")), notApplicablePolicy: normalizePolicy(metadataValue(block, "Not-applicable policy")),
      verificationPolicy: normalizePolicy(metadataValue(block, "Verification policy")), repeatPolicy: normalizePolicy(metadataValue(block, "Repeat policy")),
      timingText: metadataValue(block, "Timing"), locationDescription: metadataValue(block, "Location"), instructions,
      structuredItemsText, items: parseItems(structuredItemsText, id), doneCriteriaText, deviationRulesText, referenceGuidanceText,
      availabilityMode: CONDITIONS[id] ? "condition" : sourceType === "continuous" ? "continuous" : TIMING[id] ? "time_window" : "immediate",
      condition: CONDITIONS[id] || {}, timing: TIMING[id] || {}, locationKey: TASK_LOCATIONS[id] || null, locationSetKey: TASK_LOCATION_SETS[id] || null,
      metadata: { authoritativeSourceId: id, sourceType, deviationRules: bullets(deviationRulesText), referenceGuidance: bullets(referenceGuidanceText), timingSourceText: metadataValue(block, "Timing") },
      sourceHash: sha256(block),
    };
    applyItemSources(task);
    tasks.push(task);
  }
  return tasks;
}
function parseDoubleShift(source) {
  const matcher = /^# (DS\d{2}) — ([^\n]+)\n([\s\S]*?)(?=^# [^\n]+|$(?![\s\S]))/gm;
  const steps = [];
  const stable = { DS01: "ds01_confirm_plan", DS02: "ds02_opening_transition", DS03: "ds03_return_review", DS04: "ds04_bundle_finalized" };
  let match;
  while ((match = matcher.exec(source)) !== null) {
    const block = match[0].trim();
    const id = match[1];
    const payloadHeading = id === "DS04" ? "System-generated payload" : "Structured step payload";
    const mandatoryText = metadataValue(block, "Mandatory") || "";
    const structuredPayloadText = sectionText(block, payloadHeading, ["Done when", "Blocking/deviation rules", "Blocking rules"], 2);
    steps.push({
      id, stepKey: stable[id], title: match[2].trim(), actor: metadataValue(block, "Actor"), stepType: metadataValue(block, "Step type"),
      mandatory: /^yes\b/i.test(mandatoryText), mandatoryText, prerequisiteText: metadataValue(block, "Prerequisite"), participantText: metadataValue(block, "Participant"),
      repeat: metadataValue(block, "Repeat"), offlinePolicy: metadataValue(block, "Offline policy"),
      criticality: normalizePolicy(metadataValue(block, "Criticality")), instructions: sectionText(block, "Employee instruction", [payloadHeading, "Done when", "Blocking/deviation rules"], 2),
      eligibilityText: sectionText(block, "Eligibility", [payloadHeading, "Done when", "Blocking rules"], 2),
      structuredPayloadText, structuredPayload: bullets(structuredPayloadText),
      doneCriteriaText: sectionText(block, "Done when", ["Blocking/deviation rules", "Blocking rules"], 2),
      blockingRulesText: sectionText(block, id === "DS04" ? "Blocking rules" : "Blocking/deviation rules", [], 2),
      systemGenerated: id === "DS04", sourceHash: sha256(block),
    });
  }
  return steps;
}
function parseDoubleShiftCopy(source) {
  const mobile = source.match(/^# Mobile copy\n([\s\S]*?)(?=^# [^\n]+|$(?![\s\S]))/m)?.[1] || "";
  const copy = {};
  for (const [key, heading] of [["beforeOpening", "Before Opening"], ["betweenShifts", "Between shifts"], ["return", "Return"], ["completion", "Completion"]]) {
    const section = sectionText(`## ${heading}\n${sectionText(mobile, heading, ["Before Opening", "Between shifts", "Return", "Completion"], 2)}`, heading, [], 2);
    const fenced = section.match(/```text\n([\s\S]*?)\n```/);
    if (!fenced) throw new Error(`Double Shift mobile copy is missing ${heading}.`);
    copy[key] = fenced[1];
  }
  return copy;
}
function dependencies() {
  const result = [
    ["O27", "O29", "complete_predecessor_on_successor"], ["O33", "O35", "complete_predecessor_on_successor"],
    ...["O30", "O31", "O32", "O33", "O34", "O35", "O36"].map((id) => [id, "O37", "must_complete"]),
    ...["C03", "C04", "C05", "C06", "C07", "C08", "C09", "C10", "C11", "C12", "C13"].map((id) => [id, "C14", "must_complete"]),
    ["C34", "C35", "must_complete"], ["C35", "C36", "must_complete"], ["C41", "C42", "must_complete"], ["C42", "C43", "must_complete"],
    ...["C27", "C28", "C29", "C30", "C31", "C32", "C33", "C36", "C37", "C38", "C39", "C40", "C41", "C42", "C43", "C44"].map((id) => [id, "C45", "must_complete"]),
    ["C45", "C46", "must_complete"],
  ];
  return result.map(([predecessorTaskId, successorTaskId, dependencyType]) => ({ predecessorTaskId, successorTaskId, dependencyType, metadata: {} }));
}
function relation(sourceTaskId, targetRoutineKey, targetTaskId, relationType, metadata = {}) { return { sourceTaskId, targetRoutineKey, targetTaskId, relationType, metadata }; }
function delivery(sourceTaskId, targetTaskId, deliveryKey, label, evidenceItemKeys) {
  return relation(sourceTaskId, "opening", targetTaskId, "delivery_comparison", { deliveryKey, label, category: "opening_readiness", comparisonMode: "ready_on_arrival", required: true, allowNotApplicable: false, scopePolicy: "same_scope", evidenceItemKeys, requireValidTaskVerification: false, requireValidRunVerification: false });
}
function relations(closingTasks) {
  const itemKeys = (id, pattern) => closingTasks.find((task) => task.id === id).items.filter((item) => pattern.test(`${item.key} ${item.label}`.toLowerCase())).map((item) => item.key);
  return [
    relation("O01", "closing", "C01", "repeat_required"), relation("O03", "closing", "C18", "complementary_action"),
    relation("O04", "closing", "C23", "complementary_action"), relation("O05", "closing", "C24", "complementary_action"),
    relation("O19", "closing", "C38", "complementary_action"), relation("O20", "closing", "C39", "complementary_action"),
    relation("O21", "closing", "C40", "complementary_action"), relation("O17", "closing", "C35", "complementary_action"),
    relation("O06", "closing", "C17", "complementary_action"), relation("O22", "closing", "C22", "conditional_companion", { condition: CONDITIONS.O22 }),
    relation("O16", "closing", "C04", "repeat_required"), relation("O15", "closing", "C27", "repeat_required"),
    delivery("C28", "O13", "workbar-food-non-alcoholic-fridge", "Workbar food/non-alcoholic fridge ready for Opening", itemKeys("C28", /product|stock|fridge|egg|food|non-alcohol/)),
    delivery("C29", "O09", "workbar-milk-fridge", "Workbar Milk Fridge ready for Opening", itemKeys("C29", /milk|oat|fridge|standard/)),
    delivery("C32", "O14", "self-service-overnight-standard", "Self-service overnight standard ready for Opening", itemKeys("C32", /standard|surface|milk|coffee|serviceware|waste|tea/)),
    delivery("C27", "O15", "serviceware-full-targets", "Coffee cups and wine glasses physically accountable for Opening", itemKeys("C27", /coffee.*cup|cup|wine.*glass|glass/)),
    delivery("C04", "O16", "project-rooms-final-standard", "Project rooms physically ready for Opening", itemKeys("C04", /room|boardroom/)),
    delivery("C13", "O07", "cleaning-station-final-standard", "Cleaning station ready for Opening", itemKeys("C13", /clean|station|supply|surface/)),
  ];
}
function validateSource(source, kind, expectedHash) {
  const actualHash = sha256(source);
  if (actualHash !== expectedHash) throw new Error(`${kind} source SHA-256 mismatch: ${actualHash}`);
}
function buildPack(openingSource, closingSource, doubleShiftSource) {
  validateSource(openingSource, "Opening", SOURCE_HASHES.opening);
  validateSource(closingSource, "Closing", SOURCE_HASHES.closing);
  validateSource(doubleShiftSource, "Double Shift", SOURCE_HASHES.doubleShift);
  const openingTasks = parseRoutine(openingSource, "O");
  const closingTasks = parseRoutine(closingSource, "C");
  const doubleShiftSteps = parseDoubleShift(doubleShiftSource);
  const allRelations = relations(closingTasks);
  const pack = {
    schemaVersion: "1.0", packKey: "mesh-routine-content", packVersion: "1.0R",
    name: "Mesh Opening and Closing operational content", description: "Editable Opening and Closing drafts plus Double Shift system-step copy. Installation never publishes or creates operative state.",
    sections: [...SECTION_CONFIG.O.map((value, sortOrder) => ({ ...value, routineKey: "opening", sortOrder })), ...SECTION_CONFIG.C.map((value, sortOrder) => ({ ...value, routineKey: "closing", sortOrder }))],
    locations: LOCATIONS, locationSets: LOCATION_SETS, standards: STANDARDS, references: REFERENCES,
    opening: { routineKey: "opening", name: "Opening", description: "Mesh Opening content from the authoritative v1R source.", sections: SECTION_CONFIG.O.map((value, sortOrder) => ({ ...value, sortOrder })), tasks: openingTasks, dependencies: dependencies().filter((entry) => entry.predecessorTaskId.startsWith("O")), relations: allRelations.filter((entry) => entry.sourceTaskId.startsWith("O")) },
    closing: { routineKey: "closing", name: "Closing", description: "Mesh Closing content from the authoritative v1R source.", sections: SECTION_CONFIG.C.map((value, sortOrder) => ({ ...value, sortOrder })), tasks: closingTasks, dependencies: dependencies().filter((entry) => entry.predecessorTaskId.startsWith("C")), relations: allRelations.filter((entry) => entry.sourceTaskId.startsWith("C")) },
    doubleShiftSteps, doubleShiftCopy: parseDoubleShiftCopy(doubleShiftSource), unresolvedRequirements: UNRESOLVED,
    sourceDocuments: [
      { kind: "opening", fileName: "mesh-opening-content-spec-v1R-combined.md", sha256: SOURCE_HASHES.opening },
      { kind: "closing", fileName: "mesh-closing-content-spec-v1R-combined.md", sha256: SOURCE_HASHES.closing },
      { kind: "double_shift", fileName: "mesh-double-shift-content-spec-v1R.md", sha256: SOURCE_HASHES.doubleShift },
    ],
  };
  validatePack(pack);
  pack.packHash = sha256(canonical(pack));
  return pack;
}
function validatePack(pack, withHash = false) {
  const keys = Object.keys(pack);
  const allowed = new Set(TOP_LEVEL_FIELDS);
  const unknown = keys.filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`Unknown top-level fields: ${unknown.join(", ")}`);
  for (const key of TOP_LEVEL_FIELDS.filter((key) => key !== "packHash")) if (!(key in pack)) throw new Error(`Missing top-level field: ${key}`);
  if (pack.opening.tasks.length !== 37 || pack.closing.tasks.length !== 46 || pack.doubleShiftSteps.length !== 4) throw new Error("Content counts must be Opening 37, Closing 46, Double Shift 4.");
  for (const [tasks, prefix, count] of [[pack.opening.tasks, "O", 37], [pack.closing.tasks, "C", 46]]) {
    const expected = new Set(Array.from({ length: count }, (_, index) => `${prefix}${String(index + 1).padStart(2, "0")}`));
    for (const task of tasks) {
      expected.delete(task.id);
      for (const field of ["instructions", "structuredItemsText", "doneCriteriaText", "deviationRulesText", "referenceGuidanceText"]) if (!task[field]) throw new Error(`${task.id} missing ${field}.`);
      if (!task.items.length) throw new Error(`${task.id} has no structured items.`);
    }
    if (expected.size) throw new Error(`Missing ${prefix} IDs: ${[...expected].join(", ")}`);
  }
  if (pack.locations.some((location) => /(^|\D)005(\D|$)/.test(`${location.key} ${location.name}`))) throw new Error("Room 005 is forbidden.");
  if (/coffee container|coffee urn|coffee pot/i.test(canonical(pack))) throw new Error("Content violates Coffee Canister terminology.");
  if (pack.standards.find((standard) => standard.key === "workbar-milk-fridge-target")?.currentRevision?.value?.regularMilk !== 2 || pack.standards.find((standard) => standard.key === "workbar-milk-fridge-target")?.currentRevision?.value?.oatly !== 2) throw new Error("Workbar Milk Fridge target must be 2 regular milk + 2 Oatly.");
  if (!pack.standards.find((standard) => standard.key === "self-service-fixed-components").currentRevision.value.includes("eggs")) throw new Error("Self-service fixed components must include eggs.");
  if (pack.opening.routineKey === "double_shift" || pack.closing.routineKey === "double_shift" || "doubleShiftTemplate" in pack) throw new Error("Double Shift must not be a third template.");
  if (pack.doubleShiftSteps.some((step, index) => step.id !== `DS${String(index + 1).padStart(2, "0")}` || !step.stepKey || !step.title || !step.mandatory || !step.structuredPayloadText || (step.id !== "DS04" && (!step.instructions || !step.structuredPayload.length || !step.doneCriteriaText || !step.blockingRulesText)))) throw new Error("Double Shift definitions are incomplete or out of order.");
  if (pack.doubleShiftSteps.find((step) => step.id === "DS03")?.mandatoryText !== "yes for a returning Double Shift participant") throw new Error("DS03 conditional mandatory semantics must remain exact.");
  if (!pack.doubleShiftSteps.find((step) => step.id === "DS04")?.systemGenerated || !pack.doubleShiftSteps.find((step) => step.id === "DS04")?.eligibilityText) throw new Error("DS04 must be a system-generated definition with eligibility rules.");
  if (Object.keys(pack.doubleShiftCopy).join("|") !== "beforeOpening|betweenShifts|return|completion" || Object.values(pack.doubleShiftCopy).some((value) => !value)) throw new Error("Double Shift bundle copy is incomplete.");
  for (const requirement of pack.unresolvedRequirements) {
    const standard = pack.standards.find((entry) => entry.key === requirement.standardKey);
    if (!standard || "currentRevision" in standard) throw new Error(`${requirement.standardKey} must remain unresolved without a current revision.`);
  }
  const serialized = canonical(pack).toLowerCase();
  if (/"(?:alarmCode|safeCode|saltoPassword|saltoPin)"\s*:/i.test(serialized)) throw new Error("Credential fields are forbidden.");
  if (withHash) {
    const { packHash, ...withoutHash } = pack;
    const expectedHash = sha256(canonical(withoutHash));
    if (packHash !== expectedHash) throw new Error(`Pack hash mismatch: expected ${expectedHash}, got ${packHash}.`);
  }
}
function generatedDoc(pack) {
  const allDependencies = [...pack.opening.dependencies, ...pack.closing.dependencies];
  const allRelations = [...pack.opening.relations, ...pack.closing.relations];
  const rows = (tasks) => tasks.map((task) => {
    const dependencyCount = allDependencies.filter((entry) => entry.predecessorTaskId === task.id || entry.successorTaskId === task.id).length;
    const referenceCount = pack.references.filter((entry) => entry.taskIds.includes(task.id)).length;
    const relationCount = allRelations.filter((entry) => entry.sourceTaskId === task.id || entry.targetTaskId === task.id).length;
    const blockers = pack.unresolvedRequirements.filter((entry) => entry.affectedTaskIds.includes(task.id)).map((entry) => entry.standardKey).join("; ") || "—";
    return `| ${task.id} | ${task.title.replaceAll("|", "\\|")} | ${task.sectionKey} | ${task.taskType} | ${task.criticality} | ${task.mandatory ? "yes" : "no"} | ${task.initialAssessmentPolicy} | ${task.completionPolicy} | ${task.notApplicablePolicy} | ${task.verificationPolicy} | ${task.repeatPolicy} | ${task.items.length} | ${dependencyCount} | ${referenceCount} | ${relationCount} | ${blockers} | ${task.locationKey || task.locationSetKey || "—"} | ${Object.values(task.timing).filter(Boolean).join(" / ") || "—"} | ${task.sourceHash} |`;
  }).join("\n");
  const relationRows = [...pack.opening.relations, ...pack.closing.relations].map((entry) => `| ${entry.sourceTaskId} | ${entry.relationType} | ${entry.targetRoutineKey}/${entry.targetTaskId} | ${entry.metadata.deliveryKey || "—"} |`).join("\n");
  return `# Mesh Routine Content Pack v1\n\n> Generated from \`content/routine-engine/mesh-routine-content-v1.json\`. Do not edit by hand.\n\n- Pack: \`${pack.packKey}@${pack.packVersion}\`\n- Schema: \`${pack.schemaVersion}\`\n- SHA-256: \`${pack.packHash}\`\n- Opening: ${pack.opening.tasks.length} tasks in ${pack.opening.sections.length} sections\n- Closing: ${pack.closing.tasks.length} tasks in ${pack.closing.sections.length} sections\n- Double Shift: ${pack.doubleShiftSteps.length} system steps; no third template\n- Locations / sets / standards / references: ${pack.locations.length} / ${pack.locationSets.length} / ${pack.standards.length} / ${pack.references.length}\n\nThe task audit below records the exact source-derived policy mapping and source-block SHA-256 for all 83 O/C tasks. Each canonical task also retains its full instruction, structured-item text, done criteria, deviation/blocking rules and reference guidance in the JSON manifest.\n\n## Opening\n\n| ID | Title | Section | Type | Criticality | Required | Initial | Completion | N/A | Verification | Repeat | Items | Dependencies | References | Relations | Unresolved blockers | Location/set | Server timing | Source SHA-256 |\n|---|---|---|---|---|---|---|---|---|---|---|---:|---:|---:|---:|---|---|---|---|\n${rows(pack.opening.tasks)}\n\n## Closing\n\n| ID | Title | Section | Type | Criticality | Required | Initial | Completion | N/A | Verification | Repeat | Items | Dependencies | References | Relations | Unresolved blockers | Location/set | Server timing | Source SHA-256 |\n|---|---|---|---|---|---|---|---|---|---|---|---:|---:|---:|---:|---|---|---|---|\n${rows(pack.closing.tasks)}\n\n## Double Shift system steps\n\n${pack.doubleShiftSteps.map((step) => `- ${step.id} / \`${step.stepKey}\` — ${step.title}${step.systemGenerated ? " (system-generated)" : ""}; source \`${step.sourceHash}\``).join("\n")}\n\n### Bundle copy\n\n${Object.entries(pack.doubleShiftCopy).map(([key, value]) => `- **${key}**\n\n  \`\`\`text\n${value.split("\n").map((line) => `  ${line}`).join("\n")}\n  \`\`\``).join("\n")}\n\n## Unresolved publication and readiness blockers\n\n${pack.unresolvedRequirements.map((entry) => `- \`${entry.standardKey}\`: ${entry.label} (${entry.affectedTaskIds.join(", ")})`).join("\n")}\n\n## Logical references\n\n${pack.references.map((entry) => `- \`${entry.key}\` — ${entry.label}; tasks ${entry.taskIds.join(", ")}`).join("\n")}\n\n## Cross-run relations\n\n| Source | Type | Target | Delivery key |\n|---|---|---|---|\n${relationRows}\n`;
}
function generatedSql(pack) {
  const payload = JSON.stringify(pack);
  if (payload.includes("$mesh_content$")) throw new Error("Pack payload contains the SQL dollar-quote sentinel.");
  return `${PACK_START}\ncreate or replace function public.routine_mesh_content_pack_v1()\nreturns jsonb\nlanguage sql\nimmutable\nset search_path = pg_catalog\nas $routine_mesh_content_pack_v1$\n  select $mesh_content$${payload}$mesh_content$::jsonb;\n$routine_mesh_content_pack_v1$;\n${PACK_END}`;
}
function syncSql(pack, checkOnly) {
  if (!existsSync(SQL_PATH)) return;
  const source = readFileSync(SQL_PATH, "utf8");
  const start = source.indexOf(PACK_START);
  const end = source.indexOf(PACK_END);
  if (start < 0 || end < start) throw new Error("Phase 10L SQL is missing generated payload markers.");
  const expected = `${source.slice(0, start)}${generatedSql(pack)}${source.slice(end + PACK_END.length)}`;
  if (checkOnly) { if (source !== expected) throw new Error("Generated SQL content payload is stale."); }
  else writeFileSync(SQL_PATH, expected);
}
function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) if (argv[index].startsWith("--")) args.set(argv[index], argv[index + 1]?.startsWith("--") ? true : argv[++index] ?? true);
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (args.has("--bootstrap") || args.has("--verify-sources")) {
  const openingPath = resolve(String(args.get("--opening")));
  const closingPath = resolve(String(args.get("--closing")));
  const doubleShiftPath = resolve(String(args.get("--double-shift")));
  const pack = buildPack(readFileSync(openingPath, "utf8"), readFileSync(closingPath, "utf8"), readFileSync(doubleShiftPath, "utf8"));
  if (args.has("--verify-sources")) {
    const existing = JSON.parse(readFileSync(PACK_PATH, "utf8"));
    if (canonical(existing) !== canonical(pack)) throw new Error("Canonical pack differs from the three locked authoritative sources.");
    console.log(`Verified authoritative sources for ${pack.packKey}@${pack.packVersion} ${pack.packHash}`);
  } else {
    mkdirSync(dirname(PACK_PATH), { recursive: true });
    writeFileSync(PACK_PATH, `${JSON.stringify(pack, null, 2)}\n`);
    writeFileSync(DOC_PATH, generatedDoc(pack));
    syncSql(pack, false);
    console.log(`Generated ${pack.packKey}@${pack.packVersion} ${pack.packHash}`);
  }
} else {
  const pack = JSON.parse(readFileSync(PACK_PATH, "utf8"));
  validatePack(pack, true);
  const expectedDoc = generatedDoc(pack);
  const checkOnly = args.has("--check");
  if (checkOnly) {
    if (readFileSync(DOC_PATH, "utf8") !== expectedDoc) throw new Error("Generated content documentation is stale.");
  } else writeFileSync(DOC_PATH, expectedDoc);
  syncSql(pack, checkOnly);
  console.log(`${checkOnly ? "Verified" : "Synchronized"} ${pack.packKey}@${pack.packVersion} ${pack.packHash}`);
}
