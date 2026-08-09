export const ROUTINE_PRODUCTION_AMENDMENT_VERSION = "mesh-routine-content@1.3R";
export const ROUTINE_PRODUCTION_AMENDMENT_HASH = "b416001c2885bbf54bdb029b8e7164cbb903a76b8344396a4e9fcffa26107fe1";

const ROUTE_STANDARD_KEY = "serviceware-office-recovery-route-confirmation";
const ROUTE_LOCATION_SET_KEY = "serviceware-recovery-route";
const ROUTE_ITEMS = Object.freeze({ O15: "recovery_route_checked", C03: "recovery_locations_checked", C27: "full_recovery_route_checked" });
const json = (value) => JSON.stringify(value);
const same = (left, right) => json(left) === json(right);
const value = (entry, camelKey, snakeKey = camelKey) => entry?.[camelKey] ?? entry?.[snakeKey];
const taskKey = (entry) => value(entry, "taskKey", "task_key");
const itemKey = (entry) => value(entry, "itemKey", "item_key");

function assertTransition(label, current, before, after) {
  if (!same(current, before) && !same(current, after)) {
    throw new Error(`${label} differs from both the locked 1.2R baseline and reviewed 1.3R target.`);
  }
  return same(current, after) ? null : { before, after };
}

function packTask(pack, routineKey, id) {
  const task = pack?.[routineKey]?.tasks?.find((entry) => entry.id === id);
  if (!task) throw new Error(`Locked pack projection is missing ${id}.`);
  return task;
}

function serverTask(workspace, expected) {
  const task = workspace?.tasks?.find((entry) => taskKey(entry) === expected.taskKey);
  if (!task) throw new Error(`Production draft is missing ${expected.id}/${expected.taskKey}.`);
  return task;
}

const taskFieldValues = (task) => ({
  locationDescription: value(task, "locationDescription", "location_description") || "",
  instructions: task.instructions || "",
  doneCriteria: value(task, "doneCriteria", "done_criteria") || task.doneCriteriaText || "",
  "metadata.timingSourceText": task.metadata?.timingSourceText || "",
  "metadata.deviationRules": task.metadata?.deviationRules || [],
  "metadata.referenceGuidance": task.metadata?.referenceGuidance || [],
  targetLocalTime: value(task, "targetLocalTime", "target_local_time") || task.timing?.targetLocalTime || "",
  hardDeadlineLocalTime: value(task, "hardDeadlineLocalTime", "hard_deadline_local_time") || task.timing?.hardDeadlineLocalTime || "",
});

function taskTransitions(id, current, before, after) {
  const currentFields = taskFieldValues(current);
  const beforeFields = taskFieldValues(before);
  const afterFields = taskFieldValues(after);
  return Object.keys(afterFields).filter((field) => !same(beforeFields[field], afterFields[field])).map((field) => {
    const transition = assertTransition(`${id}.${field}`, currentFields[field], beforeFields[field], afterFields[field]);
    return transition && { field, ...transition };
  }).filter(Boolean);
}

function currentStandardValue(standard) {
  const currentId = value(standard, "currentRevisionId", "current_revision_id");
  if (!currentId) return undefined;
  const revision = standard.revisions?.find((entry) => entry.id === currentId);
  if (!revision) throw new Error(`${ROUTE_STANDARD_KEY} current revision is missing from the manager workspace.`);
  return value(revision, "value", "value_json");
}

function itemTransition(id, current, before, after, routeStandardId) {
  const fields = [];
  const labelTransition = assertTransition(`${id}.${after.key}.label`, current.label || "", before.label || "", after.label || "");
  if (labelTransition) fields.push({ field: "label", ...labelTransition });

  const currentKind = value(current, "sourceKind", "source_kind");
  const currentStandardId = value(current, "standardId", "standard_id") || null;
  const currentLocationSetId = value(current, "sourceLocationSetId", "source_location_set_id") || null;
  const beforeBinding = currentKind === before.sourceKind && currentStandardId === null && currentLocationSetId !== null;
  const afterBinding = currentKind === after.sourceKind && currentStandardId === routeStandardId && currentLocationSetId === null;
  if (!beforeBinding && !afterBinding) throw new Error(`${id}.${after.key}.sourceBinding differs from both the locked 1.2R baseline and reviewed 1.3R target.`);
  if (!afterBinding) fields.push({ field: "sourceBinding", before: before.sourceKind, after: after.sourceKind });
  return fields;
}

export function buildRoutineProductionAmendmentPlan({ baselinePack, providerPack, foundation, workspaces }) {
  if (baselinePack?.packVersion !== "1.2R" || baselinePack?.packHash !== "2dcfc69b822f973c23e54934b6799faa5b9400ae0529096f049067811a417f25") {
    throw new Error("Locked mesh-routine-content@1.2R baseline is unavailable.");
  }
  if (providerPack?.packVersion !== "1.3R" || providerPack?.packHash !== ROUTINE_PRODUCTION_AMENDMENT_HASH) {
    throw new Error("Canonical provider is not the reviewed mesh-routine-content@1.3R payload.");
  }

  const operations = [];
  const beforeStandard = baselinePack.standards.find((entry) => entry.key === ROUTE_STANDARD_KEY);
  const afterStandard = providerPack.standards.find((entry) => entry.key === ROUTE_STANDARD_KEY);
  const currentStandard = foundation?.standards?.find((entry) => value(entry, "stableKey", "standard_key") === ROUTE_STANDARD_KEY);
  if (!beforeStandard || !afterStandard?.currentRevision || !currentStandard) throw new Error("Serviceware route standard scope is incomplete.");
  const standardTransition = assertTransition(`standard:${ROUTE_STANDARD_KEY}.value`, currentStandardValue(currentStandard), beforeStandard.currentRevision?.value, afterStandard.currentRevision.value);
  if (standardTransition) operations.push({ kind: "standard_revision", key: ROUTE_STANDARD_KEY, standardId: currentStandard.id,
    expectedRevision: currentStandard.revision, value: afterStandard.currentRevision.value, reason: afterStandard.currentRevision.reason });

  const beforeSet = baselinePack.locationSets.find((entry) => entry.key === ROUTE_LOCATION_SET_KEY);
  const afterSet = providerPack.locationSets.find((entry) => entry.key === ROUTE_LOCATION_SET_KEY);
  const currentSet = foundation?.locationSets?.find((entry) => value(entry, "stableKey", "set_key") === ROUTE_LOCATION_SET_KEY);
  if (!beforeSet || !afterSet || !currentSet) throw new Error("Serviceware route scope anchor is incomplete.");
  const setFields = [
    ["description", currentSet.description || "", beforeSet.description || "", afterSet.description || ""],
  ].map(([field, current, before, after]) => {
    const transition = assertTransition(`location_set:${ROUTE_LOCATION_SET_KEY}.${field}`, current, before, after);
    return transition && { field, ...transition };
  }).filter(Boolean);
  if (setFields.length) operations.push({ kind: "location_set", key: ROUTE_LOCATION_SET_KEY, fields: setFields });

  for (const [routineKey, id] of [["opening", "O15"], ["closing", "C03"], ["closing", "C27"]]) {
    const before = packTask(baselinePack, routineKey, id);
    const after = packTask(providerPack, routineKey, id);
    const current = serverTask(workspaces?.[routineKey], after);
    const fields = taskTransitions(id, current, before, after);
    if (fields.length) operations.push({ kind: "task", routineKey, id, key: after.taskKey, fields });
  }

  for (const [routineKey, id] of [["opening", "O15"], ["closing", "C03"], ["closing", "C27"]]) {
    const beforeTask = packTask(baselinePack, routineKey, id);
    const afterTask = packTask(providerPack, routineKey, id);
    const currentTask = serverTask(workspaces?.[routineKey], afterTask);
    const before = beforeTask.items.find((entry) => entry.key === ROUTE_ITEMS[id]);
    const after = afterTask.items.find((entry) => entry.key === ROUTE_ITEMS[id]);
    const current = workspaces?.[routineKey]?.taskItems?.find((entry) => value(entry, "taskId", "task_id") === currentTask.id && itemKey(entry) === ROUTE_ITEMS[id]);
    if (!before || !after || !current) throw new Error(`${id} shared-route item scope is incomplete.`);
    const fields = itemTransition(id, current, before, after, currentStandard.id);
    if (fields.length) operations.push({ kind: "task_item", routineKey, id, key: after.key, taskKey: afterTask.taskKey,
      targetStandardId: currentStandard.id, fields });
  }

  return Object.freeze({ version: ROUTINE_PRODUCTION_AMENDMENT_VERSION, hash: ROUTINE_PRODUCTION_AMENDMENT_HASH,
    operations, remainders: [], complete: operations.length === 0 });
}

export function amendmentOperationLabel(operation) {
  if (operation.kind === "standard_revision") return `standard:${operation.key} — first authoritative revision`;
  return `${operation.kind}:${operation.id || operation.key} — ${operation.fields.map((field) => field.field).join(", ")}`;
}
