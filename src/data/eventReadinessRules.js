function validTime(value) {
  const time = new Date(value || "").getTime();
  return Number.isFinite(time) ? time : null;
}

function activeAssignmentsFor(requirement, assignments) {
  return assignments.filter((assignment) =>
    assignment.active &&
    assignment.roleKey === requirement.roleKey &&
    (!requirement.zoneKey || assignment.zone === requirement.zoneKey),
  );
}

function check(values) {
  return {
    checkId: values.checkId,
    category: values.category,
    title: values.title,
    status: values.status,
    weight: values.weight ?? 5,
    rationale: values.rationale || "",
    actionLabel: values.actionLabel || "",
    actionTarget: values.actionTarget || "",
    metadata: values.metadata || {},
  };
}

export function eventLifecycle(eventOperation = {}, smartPlan = null, now = new Date().toISOString()) {
  if (eventOperation.status === "finished") return "completed";
  const nowMs = validTime(now) || Date.now();
  const start = validTime(eventOperation.startsAt);
  const end = validTime(eventOperation.endsAt);
  const prep = validTime(smartPlan?.setup?.prepStartsAt) || start;
  const close = validTime(smartPlan?.setup?.closeEndsAt) || end;
  const arrival = (smartPlan?.setup?.staffingProposal?.scheduleSegments || []).find((item) =>
    ["doors", "guest_arrival", "registration"].includes(item.type),
  );
  const arrivalStart = validTime(arrival?.startsAt);
  if (close && nowMs >= close) return "closing";
  if (end && nowMs >= end) return "closing";
  if (start && nowMs >= start) return "live";
  if (arrivalStart && nowMs >= arrivalStart - 30 * 60000) return "guest_arrival";
  if (prep && nowMs >= prep) return "prep";
  return "planning";
}

export function evaluateEventReadiness({
  eventOperation = {},
  smartPlan = null,
  linkedCalendarEvents = [],
  eventTasks = [],
  roleAssignments = [],
  staffPresence = [],
  responsibilityHandovers = [],
  rigGuides = [],
  liveUpdates = [],
  backendAvailable = true,
  now = new Date().toISOString(),
} = {}) {
  const checks = [];
  const staffing = smartPlan?.setup?.staffingProposal || {};
  const requirements = (staffing.requirements || []).filter((item) => item.included !== false);
  const openUpdates = liveUpdates.filter((item) => ["open", "acknowledged"].includes(item.status));
  const criticalOpenUpdates = openUpdates.filter((item) => ["important", "critical"].includes(item.priority));
  const openTasks = eventTasks.filter((item) => !["done", "cancelled", "missed"].includes(item.status));
  const nowMs = validTime(now) || Date.now();
  const overdueTasks = openTasks.filter((item) => validTime(item.dueAt) && validTime(item.dueAt) < nowMs);
  const criticalOverdue = overdueTasks.filter((item) => item.priority === "critical");
  const overrides = eventOperation.metadata?.readinessOverrides || [];
  const overrideByCheck = new Map(overrides.filter((item) => item.accepted).map((item) => [item.checkId, item]));
  const add = (item) => checks.push(check(item));

  add({
    checkId: "event-times",
    category: "event_info",
    title: "Official event time",
    status: validTime(eventOperation.startsAt) && validTime(eventOperation.endsAt) && validTime(eventOperation.endsAt) > validTime(eventOperation.startsAt) ? "pass" : "blocker",
    weight: 16,
    rationale: "A valid official start and end are required.",
    actionLabel: "Edit Event Board",
    actionTarget: "event-board",
  });
  add({
    checkId: "event-venue",
    category: "event_info",
    title: "Venue or linked resource",
    status: eventOperation.venue || linkedCalendarEvents.length ? "pass" : "warning",
    weight: 5,
    rationale: "Operational teams need a clear venue.",
    actionLabel: "Linked Resources",
    actionTarget: "linked-resources",
  });
  add({
    checkId: "smart-plan",
    category: "plan",
    title: "Smart Plan",
    status: smartPlan ? (["applied", "dismissed"].includes(smartPlan.status) ? "pass" : "warning") : "warning",
    weight: 8,
    rationale: smartPlan ? `Plan status is ${smartPlan.status}.` : "No Smart Plan is available.",
    actionLabel: "Open Smart Plan",
    actionTarget: "smart-plan",
  });
  add({
    checkId: "guest-count",
    category: "event_info",
    title: "Guest count",
    status: staffing.guestCount ? "pass" : "warning",
    weight: 4,
    rationale: staffing.guestCount ? `Known attendance: ${staffing.guestCount}.` : "Attendance is unknown; venue capacity is not attendance.",
    actionLabel: "Staffing & Zones",
    actionTarget: "staffing",
  });

  const efmAssigned = roleAssignments.some((item) => item.active && item.roleKey === "event_floor_manager");
  const complexEvent = (staffing.activeZones || []).length >= 3 || Number(staffing.guestCount || 0) >= 100;
  add({
    checkId: "event-floor-manager",
    category: "staffing",
    title: "Event Floor Manager assigned",
    status: efmAssigned ? "pass" : complexEvent ? "blocker" : "warning",
    weight: complexEvent ? 18 : 10,
    rationale: efmAssigned ? "Overall event responsibility is assigned." : "No Event Floor Manager is assigned.",
    actionLabel: "Command Structure",
    actionTarget: "command-structure",
  });

  const requiredOpen = requirements.filter((requirement) =>
    requirement.required && activeAssignmentsFor(requirement, roleAssignments).length < Number(requirement.minimumCount || 1),
  );
  add({
    checkId: "required-staffing",
    category: "staffing",
    title: "Required staffing filled",
    status: requiredOpen.length ? (complexEvent ? "blocker" : "warning") : requirements.length ? "pass" : "not_applicable",
    weight: 14,
    rationale: requiredOpen.length ? `${requiredOpen.length} required staffing position${requiredOpen.length === 1 ? " is" : "s are"} open.` : "Required staffing minimums are filled.",
    actionLabel: "Staffing & Zones",
    actionTarget: "staffing",
    metadata: { openRequirementIds: requiredOpen.map((item) => item.requirementId) },
  });
  const headrunnerNeeded = (staffing.activeZones || []).length >= 3;
  const headrunnerAssigned = roleAssignments.some((item) => item.active && item.roleKey === "headrunner");
  add({
    checkId: "multi-zone-coordination",
    category: "zones",
    title: "Multi-zone coordination",
    status: !headrunnerNeeded ? "not_applicable" : headrunnerAssigned ? "pass" : "warning",
    weight: 8,
    rationale: headrunnerNeeded && !headrunnerAssigned ? "Three or more zones are active without a Headrunner." : "Runner coordination matches event complexity.",
    actionLabel: "Command Structure",
    actionTarget: "command-structure",
  });
  const presentNames = new Set(
    staffPresence
      .filter((item) => item.available !== false)
      .map((item) => String(item.operatorName || "").trim().toLowerCase())
      .filter(Boolean),
  );
  const assignedPresent = roleAssignments.filter((item) =>
    item.active && presentNames.has(String(item.assignedOperatorName || "").trim().toLowerCase()),
  );
  const lifecycle = eventLifecycle(eventOperation, smartPlan, now);
  add({
    checkId: "staff-presence",
    category: "staffing",
    title: "Assigned staff presence",
    status: !["prep", "guest_arrival", "live", "closing"].includes(lifecycle)
      ? "not_applicable"
      : !roleAssignments.some((item) => item.active)
        ? "not_applicable"
        : assignedPresent.length
          ? "pass"
          : "warning",
    weight: 5,
    rationale: assignedPresent.length
      ? `${assignedPresent.length} assigned team member${assignedPresent.length === 1 ? " is" : "s are"} checked in.`
      : "Assignments exist, but no matching staff presence is currently visible.",
    actionLabel: "Check-in / Presence",
    actionTarget: "presence",
  });
  add({
    checkId: "overdue-critical-tasks",
    category: "tasks",
    title: "Critical overdue tasks",
    status: criticalOverdue.length ? "blocker" : overdueTasks.length ? "warning" : "pass",
    weight: 18,
    rationale: criticalOverdue.length ? `${criticalOverdue.length} critical task${criticalOverdue.length === 1 ? " is" : "s are"} overdue.` : overdueTasks.length ? `${overdueTasks.length} task${overdueTasks.length === 1 ? " is" : "s are"} overdue.` : "No tasks are overdue.",
    actionLabel: "Event Task Board",
    actionTarget: "tasks",
  });
  const includedPlanItems = (smartPlan?.planItems || []).filter((item) => item.included !== false);
  const planItemCounts = eventTasks.reduce((map, task) => {
    const id = task.metadata?.planItemId;
    if (id) map.set(id, (map.get(id) || 0) + 1);
    return map;
  }, new Map());
  const missingAppliedPlanItems = smartPlan?.status === "applied"
    ? includedPlanItems.filter((item) => !planItemCounts.has(item.planItemId))
    : [];
  const duplicatePlanTasks = [...planItemCounts.entries()].filter(([, count]) => count > 1);
  add({
    checkId: "plan-task-integrity",
    category: "tasks",
    title: "Smart Plan task integrity",
    status: missingAppliedPlanItems.length ? "blocker" : duplicatePlanTasks.length ? "warning" : includedPlanItems.length ? "pass" : "not_applicable",
    weight: 10,
    rationale: missingAppliedPlanItems.length
      ? `${missingAppliedPlanItems.length} applied Smart Plan item${missingAppliedPlanItems.length === 1 ? " is" : "s are"} missing from Event Tasks.`
      : duplicatePlanTasks.length
        ? `${duplicatePlanTasks.length} Smart Plan item${duplicatePlanTasks.length === 1 ? " has" : "s have"} duplicate Event Tasks.`
        : "Applied Smart Plan items map cleanly to Event Tasks.",
    actionLabel: "Event Task Board",
    actionTarget: "tasks",
  });
  const unassignedTasks = openTasks.filter((task) => !task.assignedAuthUserId && !task.assignedOperatorName && !task.assignedRoleKey && task.metadata?.audience !== "all_event_staff");
  const blockedByOpenRole = openTasks.filter((task) => {
    if (!task.assignedRoleKey) return false;
    const requirement = requirements.find((item) =>
      item.roleKey === task.assignedRoleKey &&
      (!task.zone || task.zone === "all" || item.zoneKey === task.zone),
    );
    if (!requirement?.required) return false;
    return !roleAssignments.some((assignment) =>
      assignment.active &&
      assignment.roleKey === task.assignedRoleKey &&
      (!task.zone || task.zone === "all" || assignment.zone === "all" || assignment.zone === task.zone),
    );
  });
  add({
    checkId: "task-owners",
    category: "tasks",
    title: "Task ownership",
    status: unassignedTasks.length ? "warning" : eventTasks.length ? "pass" : "not_applicable",
    weight: 6,
    rationale: unassignedTasks.length ? `${unassignedTasks.length} open task${unassignedTasks.length === 1 ? " has" : "s have"} no owner or role.` : "Operational tasks have an audience.",
    actionLabel: "Event Task Board",
    actionTarget: "tasks",
  });
  const closingTasks = eventTasks.filter((item) =>
    item.metadata?.phase === "after" || /close|closing|cleanup|clean up/i.test(item.title || ""),
  );
  const criticalClosingOpen = closingTasks.filter((item) =>
    item.priority === "critical" && !["done", "cancelled", "missed"].includes(item.status),
  );
  add({
    checkId: "event-close-tasks",
    category: "tasks",
    title: "Event closing tasks",
    status: lifecycle !== "closing"
      ? "not_applicable"
      : criticalClosingOpen.length
        ? "blocker"
        : closingTasks.length
          ? "pass"
          : "warning",
    weight: 10,
    rationale: criticalClosingOpen.length
      ? `${criticalClosingOpen.length} critical closing task${criticalClosingOpen.length === 1 ? " is" : "s are"} still open.`
      : closingTasks.length
        ? "Closing work is represented in Event Tasks."
        : "No explicit closing tasks were found for this event.",
    actionLabel: "Event Task Board",
    actionTarget: "tasks",
  });
  add({
    checkId: "event-handover",
    category: "handover",
    title: "Event handover",
    status: lifecycle !== "closing" ? "not_applicable" : responsibilityHandovers.length ? "pass" : "warning",
    weight: 8,
    rationale: responsibilityHandovers.length
      ? "A responsibility handover is recorded."
      : "No responsibility handover has been recorded for event close.",
    actionLabel: "Prepare handover",
    actionTarget: "handover",
  });
  add({
    checkId: "live-issues",
    category: "handover",
    title: "Open operational issues",
    status: criticalOpenUpdates.some((item) => item.priority === "critical") ? "blocker" : criticalOpenUpdates.length ? "warning" : "pass",
    weight: 12,
    rationale: criticalOpenUpdates.length ? `${criticalOpenUpdates.length} important or critical live update${criticalOpenUpdates.length === 1 ? " is" : "s are"} unresolved.` : "No important live issues are open.",
    actionLabel: "Live Updates",
    actionTarget: "updates",
  });
  const rigRefs = smartPlan?.rigRefs || [];
  add({
    checkId: "rig-guides",
    category: "rigging",
    title: "Relevant rig guides",
    status: !rigRefs.length ? "not_applicable" : rigRefs.every((id) => rigGuides.some((guide) => guide.id === id)) ? "pass" : "warning",
    weight: 4,
    rationale: rigRefs.length ? "Rig references are checked against the guide registry." : "No rig guide is required by the current plan.",
    actionLabel: "Guides",
    actionTarget: "guides",
  });
  add({
    checkId: "backend-status",
    category: "event_info",
    title: "Backend status",
    status: backendAvailable ? "pass" : "warning",
    weight: 6,
    rationale: backendAvailable ? "Live event data is available." : "Backend status unavailable; loaded data may be outdated.",
  });

  const evaluated = checks.map((item) => ({
    ...item,
    acceptedRisk: Boolean(overrideByCheck.get(item.checkId)),
    override: overrideByCheck.get(item.checkId) || null,
  }));
  const applicable = evaluated.filter((item) => item.status !== "not_applicable");
  const totalWeight = applicable.reduce((sum, item) => sum + item.weight, 0) || 1;
  const earned = applicable.reduce((sum, item) => {
    if (item.status === "pass") return sum + item.weight;
    if (item.acceptedRisk && item.status === "warning") return sum + item.weight * 0.65;
    if (item.status === "warning") return sum + item.weight * 0.35;
    return sum;
  }, 0);
  const score = Math.max(0, Math.min(100, Math.round((earned / totalWeight) * 100)));
  const blockers = evaluated.filter((item) => item.status === "blocker");
  const warnings = evaluated.filter((item) => item.status === "warning");
  const positives = evaluated.filter((item) => item.status === "pass");
  let level = blockers.length ? "at_risk" : warnings.length ? "needs_attention" : "ready";
  if (lifecycle === "live") level = blockers.length ? "at_risk" : "live";
  if (lifecycle === "closing") level = "closing";
  if (lifecycle === "completed") level = "completed";
  return {
    score: blockers.length ? Math.min(score, 84) : score,
    level,
    lifecycle,
    summary: blockers.length ? "At risk" : warnings.length ? "Needs attention" : lifecycle === "live" ? "Live" : lifecycle === "completed" ? "Completed" : "Ready",
    checks: evaluated,
    blockers,
    warnings,
    positives,
    recommendedActions: evaluated.filter((item) => ["blocker", "warning"].includes(item.status)).map((item) => ({ label: item.actionLabel, target: item.actionTarget, checkId: item.checkId })).filter((item) => item.label),
    taskRisk: {
      criticalOverdue,
      overdue: overdueTasks,
      dueIn15: openTasks.filter((item) => validTime(item.dueAt) && validTime(item.dueAt) >= nowMs && validTime(item.dueAt) <= nowMs + 15 * 60000),
      dueIn30: openTasks.filter((item) => validTime(item.dueAt) && validTime(item.dueAt) > nowMs + 15 * 60000 && validTime(item.dueAt) <= nowMs + 30 * 60000),
      unassigned: unassignedTasks,
      blockedByOpenRole,
      completedRecently: eventTasks.filter((item) => item.status === "done" && validTime(item.completedAt) && validTime(item.completedAt) >= nowMs - 60 * 60000),
    },
    canCompleteNormally:
      ["closing", "completed"].includes(lifecycle) &&
      blockers.length === 0 &&
      criticalOpenUpdates.length === 0 &&
      criticalClosingOpen.length === 0 &&
      (lifecycle === "completed" || responsibilityHandovers.length > 0),
  };
}
