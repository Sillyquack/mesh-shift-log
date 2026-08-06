const GROUP_ORDER = Object.freeze(["Do now", "In progress", "Waiting", "Next", "Later", "Completed", "Deviations"]);
const terminal = new Set(["completed", "not_applicable", "transferred", "system_completed", "cancelled"]);

export function taskDisplayGroup(task) {
  const status = task?.status ?? "waiting";
  const phase = task?.timing?.live?.phase ?? task?.timingPhase ?? "waiting";
  if (terminal.has(status)) return "Completed";
  if (status === "in_progress") return "In progress";
  if (status === "blocked" || status === "waiting" || task?.inclusion_state === "pending" || task?.dependencyStatus?.valid === false) return "Waiting";
  if (["available", "due", "overdue", "hard_deadline_passed"].includes(phase)) return "Do now";
  if (["upcoming", "next"].includes(phase)) return "Next";
  return "Later";
}

export function groupRoutineTasks(tasks = []) {
  const groups = Object.fromEntries(GROUP_ORDER.map((label) => [label, []]));
  [...tasks].sort((a, b) => Number(a.sort_order_snapshot ?? a.sortOrder ?? 0) - Number(b.sort_order_snapshot ?? b.sortOrder ?? 0)
    || String(a.id).localeCompare(String(b.id))).forEach((task) => {
    groups[taskDisplayGroup(task)].push(task);
    if ((task.activeDeviations?.length ?? task.deviationCount ?? 0) > 0) groups.Deviations.push(task);
  });
  const nextTask = groups["Do now"][0] ?? groups["In progress"][0] ?? groups.Next[0] ?? null;
  return Object.freeze({ order: GROUP_ORDER, groups: Object.freeze(groups), nextTask });
}

export function taskPrimaryLabel(task) {
  return task?.title_snapshot ?? task?.title ?? task?.instruction_snapshot ?? "Routine task";
}

export function taskStatusLabel(status) {
  return String(status ?? "not_started").replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

export const ROUTINE_OUTCOME_LABELS = Object.freeze({
  ready_on_arrival: "Ready on arrival", standard_met: "Standard met", completed_after_correction: "Completed after correction",
  control_passed: "Control passed", completed_with_deviation: "Control completed with deviation",
  completed_with_manager_override: "Completed with manager override", system_completed: "System completed",
});

export function validateRoutineItemDraft(item, value) {
  const type = item?.item_type_snapshot ?? item?.itemType;
  if (type === "count" && (!Number.isInteger(Number(value)) || Number(value) < 0)) return "Enter a whole number of zero or more.";
  if (["quantity", "measurement"].includes(type) && !Number.isFinite(Number(value))) return "Enter a valid number.";
  return null;
}

export function routineItemDraftValue(item) {
  const type = item?.item_type_snapshot ?? item?.itemType ?? "text";
  const value = item?.value_json ?? item?.value ?? {};
  if (type === "check") return value.checked === true;
  if (type === "text") return value.text ?? "";
  if (["location", "asset", "product"].includes(type)) return value.note ?? value.result ?? value.status ?? "";
  return value.value ?? "";
}

export function routineItemMutationValue(item, draft) {
  const type = item?.item_type_snapshot ?? item?.itemType ?? "text";
  if (type === "check") return { checked: draft === true };
  if (type === "count") return { value: Number(draft) };
  if (["quantity", "measurement"].includes(type)) {
    const unit = item?.unit_snapshot ?? item?.unit;
    return { value: Number(draft), ...(unit ? { unit } : {}) };
  }
  if (type === "text") return { text: String(draft ?? "") };
  if (["location", "asset", "product"].includes(type)) return { note: String(draft ?? "") };
  return { value: String(draft ?? "") };
}
