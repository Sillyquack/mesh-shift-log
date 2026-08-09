export const ROUTINE_PRODUCTION_AMENDMENT_VERSION = "mesh-routine-content@1.2R";
export const ROUTINE_PRODUCTION_AMENDMENT_HASH = "2dcfc69b822f973c23e54934b6799faa5b9400ae0529096f049067811a417f25";

const LOCATION_KEYS = ["coffee-canister-kitchen-reserve", "workbar-bar-coffee-canister-cupboard"];
const REFERENCE_KEYS = ["coffee-canister-lunch-reserve", "coffee-canister-rinsed-storage"];
const TASK_IDS = Object.freeze({ opening: ["O02", "O28", "O29", "O34", "O35"], closing: ["C06", "C17"] });

const json = (value) => JSON.stringify(value);
const same = (left, right) => json(left) === json(right);
const value = (entry, camelKey, snakeKey = camelKey) => entry?.[camelKey] ?? entry?.[snakeKey];
const taskKey = (entry) => value(entry, "taskKey", "task_key");
const itemKey = (entry) => value(entry, "itemKey", "item_key");

function assertTransition(label, current, before, after) {
  if (!same(current, before) && !same(current, after)) {
    throw new Error(`${label} differs from both the locked 1.1R baseline and reviewed 1.2R target.`);
  }
  return same(current, after) ? null : { before, after };
}

function packTask(pack, routineKey, id) {
  const entry = pack?.[routineKey]?.tasks?.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Locked pack is missing ${id}.`);
  return entry;
}

function serverTask(workspace, expected) {
  const entry = workspace?.tasks?.find((candidate) => taskKey(candidate) === expected.taskKey);
  if (!entry) throw new Error(`Production draft is missing ${expected.id}/${expected.taskKey}.`);
  return entry;
}

function taskFieldTransitions(id, current, before, after) {
  const transitions = [];
  const add = (field, currentValue, beforeValue, afterValue) => {
    const transition = assertTransition(`${id}.${field}`, currentValue, beforeValue, afterValue);
    if (transition) transitions.push({ field, ...transition });
  };
  if (id === "O02") add("metadata.timingSourceText", current.metadata?.timingSourceText, before.metadata?.timingSourceText, after.metadata?.timingSourceText);
  if (["O28", "O34", "C06"].includes(id)) add("locationDescription", value(current, "locationDescription", "location_description") || "", before.locationDescription || "", after.locationDescription || "");
  if (["O29", "O34", "O35", "C06"].includes(id)) add("metadata.deviationRules", current.metadata?.deviationRules, before.metadata?.deviationRules, after.metadata?.deviationRules);
  if (id === "C17") {
    add("instructions", current.instructions || "", before.instructions || "", after.instructions || "");
    add("metadata.structuredItemsSource", current.metadata?.structuredItemsSource, before.structuredItemsText, after.structuredItemsText);
  }
  return transitions;
}

export function buildRoutineProductionAmendmentPlan({ baselinePack, providerPack, foundation, references, workspaces }) {
  if (providerPack?.packVersion !== "1.2R" || providerPack?.packHash !== ROUTINE_PRODUCTION_AMENDMENT_HASH) {
    throw new Error("Canonical provider is not the reviewed mesh-routine-content@1.2R payload.");
  }
  if (baselinePack?.packVersion !== "1.1R") throw new Error("Locked 1.1R baseline is unavailable.");
  const operations = [];

  for (const key of LOCATION_KEYS) {
    const current = foundation?.locations?.find((entry) => value(entry, "stableKey", "stable_key") === key);
    const before = baselinePack.locations.find((entry) => entry.key === key);
    const after = providerPack.locations.find((entry) => entry.key === key);
    if (!current || !before || !after) throw new Error(`Location scope is incomplete for ${key}.`);
    const transition = assertTransition(`location:${key}.name`, current.name, before.name, after.name);
    if (transition) operations.push({ kind: "location", key, fields: [{ field: "name", ...transition }] });
  }

  for (const key of REFERENCE_KEYS) {
    const current = references?.references?.find((entry) => value(entry, "stableKey", "reference_key") === key);
    const before = baselinePack.references.find((entry) => entry.key === key);
    const after = providerPack.references.find((entry) => entry.key === key);
    if (!current || !before || !after) throw new Error(`Reference scope is incomplete for ${key}.`);
    const fields = [
      ["label", current.label || "", before.label || "", after.label || ""],
      ["description", current.description || "", before.description || "", after.description || ""],
    ].map(([field, currentValue, beforeValue, afterValue]) => {
      const transition = assertTransition(`reference:${key}.${field}`, currentValue, beforeValue, afterValue);
      return transition && { field, ...transition };
    }).filter(Boolean);
    if (fields.length) operations.push({ kind: "reference", key, fields });
  }

  for (const routineKey of ["opening", "closing"]) {
    for (const id of TASK_IDS[routineKey]) {
      const before = packTask(baselinePack, routineKey, id);
      const after = packTask(providerPack, routineKey, id);
      const current = serverTask(workspaces?.[routineKey], after);
      const fields = taskFieldTransitions(id, current, before, after);
      if (fields.length) operations.push({ kind: "task", routineKey, id, key: after.taskKey, fields });
    }
  }

  const beforeC17 = packTask(baselinePack, "closing", "C17");
  const afterC17 = packTask(providerPack, "closing", "C17");
  const changedItems = afterC17.items.filter((entry) => {
    const baseline = beforeC17.items.find((candidate) => candidate.key === entry.key);
    return baseline && !same({ label: baseline.label, sourceText: baseline.metadata?.sourceText }, { label: entry.label, sourceText: entry.metadata?.sourceText });
  });
  if (changedItems.length !== 1) throw new Error("Reviewed C17 item amendment is not exactly one item.");
  const desiredItem = changedItems[0];
  const baselineItem = beforeC17.items.find((entry) => entry.key === desiredItem.key);
  const currentC17 = serverTask(workspaces?.closing, afterC17);
  const currentItem = workspaces?.closing?.taskItems?.find((entry) => value(entry, "taskId", "task_id") === currentC17.id && itemKey(entry) === desiredItem.key);
  if (!currentItem) throw new Error(`Production C17 item is missing ${desiredItem.key}.`);
  const itemFields = [
    ["label", currentItem.label || "", baselineItem.label || "", desiredItem.label || ""],
    ["metadata.sourceText", currentItem.metadata?.sourceText, baselineItem.metadata?.sourceText, desiredItem.metadata?.sourceText],
  ].map(([field, currentValue, beforeValue, afterValue]) => {
    const transition = assertTransition(`C17.${desiredItem.key}.${field}`, currentValue, beforeValue, afterValue);
    return transition && { field, ...transition };
  }).filter(Boolean);
  if (itemFields.length) operations.push({ kind: "task_item", routineKey: "closing", id: "C17", key: desiredItem.key, taskKey: afterC17.taskKey, fields: itemFields });

  const baselineStandard = baselinePack.standards.find((entry) => entry.key === "workbar-coffee-canister-assigned-target");
  const providerStandard = providerPack.standards.find((entry) => entry.key === "workbar-coffee-canister-assigned-target");
  const currentStandard = foundation?.standards?.find((entry) => value(entry, "stableKey", "standard_key") === "workbar-coffee-canister-assigned-target");
  if (!baselineStandard || !providerStandard || !currentStandard) throw new Error("Workbar Coffee Canisters standard scope is incomplete.");
  const standardTransition = assertTransition("standard:workbar-coffee-canister-assigned-target.label", currentStandard.label, baselineStandard.label, providerStandard.label);
  const remainders = standardTransition ? [{ kind: "standard_label", key: "workbar-coffee-canister-assigned-target", reason: "No supported standard metadata RPC exists; structured value and revision remain unchanged.", ...standardTransition }] : [];

  return Object.freeze({ version: ROUTINE_PRODUCTION_AMENDMENT_VERSION, hash: ROUTINE_PRODUCTION_AMENDMENT_HASH, operations, remainders, complete: operations.length === 0 });
}

export function amendmentOperationLabel(operation) {
  return `${operation.kind}:${operation.id || operation.key} — ${operation.fields.map((field) => field.field).join(", ")}`;
}
