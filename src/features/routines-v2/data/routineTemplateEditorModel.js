export const CONDITION_FACTS = Object.freeze(["weekday","local_time","organization_flag","location_active","event_zone_active","booking_exists","asset_used_today","standard_value_exists","previous_task_status","transfer_status"]);
export const CONDITION_OPERATORS = Object.freeze(["equals","not_equals","in","greater_than","less_than","exists"]);
export const TASK_TYPES = Object.freeze(["action","control","measurement","procedure","checkpoint","continuous","verification","handover","gate"]);
export const CRITICALITIES = Object.freeze(["normal","important","critical"]);
export const INITIAL_POLICIES = Object.freeze(["none","ready_on_arrival","control_result"]);
export const COMPLETION_POLICIES = Object.freeze(["standard_required","control_allows_deviation","manager_override"]);
export const NA_POLICIES = Object.freeze(["forbidden","allowed_with_reason","system_only"]);
export const VERIFICATION_POLICIES = Object.freeze(["none","self_recheck","independent","second_person_required","manager_required","closing_responsible"]);
export const REPEAT_POLICIES = Object.freeze(["once_per_run","once_per_phase","after_last_use","continuous","conditional","complementary"]);
export const AVAILABILITY_MODES = Object.freeze(["immediate","time_window","after_task","condition","continuous"]);
export const ITEM_TYPES = Object.freeze(["check","count","quantity","measurement","text","choice","location","asset","product","status"]);
export const SOURCE_KINDS = Object.freeze(["static","location_set","routine_standard","inventory_readonly","asset_registry_readonly","event_context"]);
export const DEPENDENCY_TYPES = Object.freeze(["must_complete","must_resolve","must_reach_time","must_receive_transfer","complete_predecessor_on_successor"]);
export const RELATION_TYPES = Object.freeze(["shared_context","repeat_required","complementary_action","carry_forward_until_resolved","independent_verification","conditional_companion","delivery_comparison"]);

export function conditionLeaf(fact = "weekday", operator = "equals", value = "") { return { fact, operator, ...(operator === "exists" ? {} : { value }) }; }
export function conditionGroup(kind = "all") { return kind === "not" ? { not: conditionLeaf() } : { [kind]: [conditionLeaf()] }; }
export function isClosedCondition(value, depth = 0) {
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > 5) return false;
  const keys = Object.keys(value);
  if (!keys.length) return true;
  if (keys.length === 1 && ["all","any","not"].includes(keys[0])) {
    const kind = keys[0];
    if (kind === "not") return isClosedCondition(value.not, depth + 1);
    return Array.isArray(value[kind]) && value[kind].length > 0 && value[kind].length <= 20 && value[kind].every((entry) => isClosedCondition(entry, depth + 1));
  }
  if (!CONDITION_FACTS.includes(value.fact) || !CONDITION_OPERATORS.includes(value.operator)) return false;
  return keys.every((key) => ["fact","operator","value"].includes(key)) && (value.operator === "exists" || Object.hasOwn(value, "value"));
}

export function timingPreview(task) {
  return [
    ["Visible", task.visibleFromLocalTime], ["Can start", task.startFromLocalTime],
    ["Target", task.targetLocalTime], ["Overdue", task.overdueLocalTime],
    ["Hard deadline", task.hardDeadlineLocalTime],
  ].filter(([, value]) => value).map(([label, value]) => `${label} ${value.slice(0,5)}`);
}

export function buildTaskPayload(task) {
  return {
    taskKey: task.taskKey, sectionId: task.sectionId, title: task.title, instructions: task.instructions || null,
    doneCriteria: task.doneCriteria || null, taskType: task.taskType, criticality: task.criticality,
    mandatory: task.mandatory !== false, initialAssessmentPolicy: task.initialAssessmentPolicy,
    completionPolicy: task.completionPolicy, notApplicablePolicy: task.notApplicablePolicy,
    verificationPolicy: task.verificationPolicy, repeatPolicy: task.repeatPolicy,
    availabilityMode: task.availabilityMode, condition: task.conditionJson || {},
    locationId: task.locationId || null, locationSetId: task.locationSetId || null,
    locationDescription: task.locationDescription || null,
    visibleDayOffset: Number(task.visibleDayOffset || 0), visibleFromLocalTime: task.visibleFromLocalTime || null,
    startDayOffset: Number(task.startDayOffset || 0), startFromLocalTime: task.startFromLocalTime || null,
    targetDayOffset: Number(task.targetDayOffset || 0), targetLocalTime: task.targetLocalTime || null,
    overdueDayOffset: Number(task.overdueDayOffset || 0), overdueLocalTime: task.overdueLocalTime || null,
    hardDeadlineDayOffset: Number(task.hardDeadlineDayOffset || 0), hardDeadlineLocalTime: task.hardDeadlineLocalTime || null,
    sortOrder: Number(task.sortOrder || 0), active: task.active !== false, metadata: task.metadata || {},
  };
}

export function deliveryRelationMetadata(value = {}) {
  return { deliveryKey: value.deliveryKey || "", label: value.label || "", category: value.category || "general",
    comparisonMode: value.comparisonMode || "value", required: value.required !== false, allowNA: value.allowNA === true,
    sameScope: value.sameScope !== false, evidenceItemKeys: value.evidenceItemKeys || [],
    requireTaskVerification: value.requireTaskVerification === true, requireRunVerification: value.requireRunVerification === true };
}

export function validationTarget(issue = {}) { return issue.itemKey ? `item-${issue.itemKey}` : issue.taskKey ? `task-${issue.taskKey}` : issue.sectionKey ? `section-${issue.sectionKey}` : "template-metadata"; }
export function diffSummary(diff = {}) {
  const sections = diff.sections || {}, tasks = diff.tasks || {}, relations = diff.relations || {}, references = diff.referenceLinks || {};
  return [
    `${(tasks.added || []).length} tasks added`, `${(tasks.changed || []).length} tasks changed`,
    `${(tasks.deactivated || []).length} tasks deactivated`, `${(tasks.reordered || []).length + (sections.reordered || []).length} order changes`,
    `${relations.deliveryComparisonCount || 0} delivery relations`, `${Math.abs((references.toCount || 0) - (references.fromCount || 0))} reference links changed`,
  ];
}
