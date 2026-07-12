const PRIORITY_ORDER = { critical: 0, important: 1, normal: 2, low: 3 };
const SOURCE_ORDER = {
  live_update: 0,
  event_boundary: 1,
  run_of_show: 2,
  task: 3,
  staffing: 4,
  handover: 5,
};

function validIso(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

function itemStatus(item, nowMs) {
  if (item.status === "completed" || item.status === "cancelled") return item.status;
  const start = new Date(item.startsAt || "").getTime();
  const end = new Date(item.endsAt || "").getTime();
  if (!Number.isFinite(start)) return "unscheduled";
  if (item.sourceType === "task" && item.actionable && start < nowMs) return "overdue";
  if (start <= nowMs && (!Number.isFinite(end) || end > nowMs)) return "active";
  if (Number.isFinite(end) && end <= nowMs) return "completed";
  return "upcoming";
}

function timelineItem(item) {
  return {
    id: item.id,
    sourceType: item.sourceType,
    sourceId: item.sourceId || "",
    type: item.type || "milestone",
    title: item.title || "Untitled milestone",
    description: item.description || "",
    startsAt: validIso(item.startsAt),
    endsAt: validIso(item.endsAt),
    zone: item.zone || "all",
    roleKey: item.roleKey || "",
    priority: item.priority || "normal",
    status: item.status || "upcoming",
    actionable: item.actionable === true,
    taskId: item.taskId || "",
    updateId: item.updateId || "",
    metadata: item.metadata && typeof item.metadata === "object" ? { ...item.metadata } : {},
  };
}

function dedupe(items) {
  const seen = new Map();
  const result = [];
  const rank = (item) => {
    if (item.sourceType === "task") return 0;
    if (item.sourceType === "event_boundary") return 1;
    if (item.metadata?.source === "smart_plan") return 2;
    if (item.metadata?.source === "linked_calendar") return 4;
    return 3;
  };
  items.forEach((item) => {
    const minute = item.startsAt ? item.startsAt.slice(0, 16) : "unscheduled";
    const key = [normalized(item.title), item.zone, minute].join("|");
    const previousIndex = seen.get(key);
    if (previousIndex === undefined) {
      seen.set(key, result.length);
      result.push(item);
    } else if (rank(item) < rank(result[previousIndex])) {
      result[previousIndex] = item;
    }
  });
  return result;
}

function applyOperationalOverrides(items, liveUpdates) {
  return items.map((item) => {
    const update = liveUpdates
      .filter((record) => ["open", "acknowledged"].includes(record.status))
      .find((record) => {
        const override = record.metadata?.timelineOverride;
        if (!override?.updatedStartsAt) return false;
        if (override.sourceId && override.sourceId === item.sourceId) return true;
        return override.targetTitle && normalized(override.targetTitle) === normalized(item.title);
      });
    if (!update) return item;
    const updatedStartsAt = validIso(update.metadata.timelineOverride.updatedStartsAt);
    if (!updatedStartsAt) return item;
    const originalStart = item.startsAt;
    const duration = item.endsAt && item.startsAt
      ? new Date(item.endsAt).getTime() - new Date(item.startsAt).getTime()
      : 0;
    return {
      ...item,
      startsAt: updatedStartsAt,
      endsAt: duration > 0 ? new Date(new Date(updatedStartsAt).getTime() + duration).toISOString() : item.endsAt,
      metadata: {
        ...item.metadata,
        originalStartsAt: originalStart,
        operationallyChanged: true,
        changedByName: update.createdByName || "Event Operations",
        changeUpdateId: update.id,
      },
    };
  });
}

export function buildEventOperationsTimeline({
  eventOperation = {},
  smartPlan = null,
  linkedCalendarEvents = [],
  linkedCalendarSources = [],
  eventTasks = [],
  roleAssignments = [],
  staffPresence = [],
  responsibilityHandovers = [],
  liveUpdates = [],
  now = new Date().toISOString(),
} = {}) {
  const setup = smartPlan?.setup || {};
  const staffing = setup.staffingProposal || {};
  const linkedStart = linkedCalendarEvents.find((item) => validIso(item.startsAt))?.startsAt;
  const linkedEnd = linkedCalendarEvents.find((item) => validIso(item.endsAt))?.endsAt;
  const operationalWindow = {
    prepStartsAt: validIso(setup.prepStartsAt || eventOperation.startsAt || linkedStart),
    eventStartsAt: validIso(eventOperation.startsAt || linkedStart),
    eventEndsAt: validIso(eventOperation.endsAt || linkedEnd),
    closeEndsAt: validIso(setup.closeEndsAt || eventOperation.endsAt || linkedEnd),
  };
  const items = [];
  const addBoundary = (type, title, startsAt) => {
    if (!startsAt) return;
    items.push(timelineItem({
      id: `boundary:${type}`,
      sourceType: "event_boundary",
      sourceId: eventOperation.id || "event",
      type,
      title,
      startsAt,
      zone: "all",
    }));
  };
  addBoundary("prep_start", "Operational prep begins", operationalWindow.prepStartsAt);
  addBoundary("event_start", "Official event begins", operationalWindow.eventStartsAt);
  addBoundary("event_end", "Official event ends", operationalWindow.eventEndsAt);
  addBoundary("close_end", "Operational close ends", operationalWindow.closeEndsAt);

  (staffing.scheduleSegments || setup.scheduleSegments || []).forEach((segment) => {
    items.push(timelineItem({
      id: `segment:${segment.segmentId || segment.id}`,
      sourceType: "run_of_show",
      sourceId: segment.segmentId || segment.id || "",
      type: segment.type,
      title: segment.title,
      description: segment.description,
      startsAt: segment.startsAt,
      endsAt: segment.endsAt,
      zone: segment.zones?.[0] || segment.zone || "all",
      metadata: { signals: segment.signals || [] },
    }));
  });

  const appliedPlanItemIds = new Set(
    eventTasks.map((task) => task.metadata?.planItemId).filter(Boolean),
  );
  (smartPlan?.planItems || [])
    .filter((item) => item.included !== false && !appliedPlanItemIds.has(item.planItemId))
    .forEach((item) => items.push(timelineItem({
      id: `plan:${item.planItemId}`,
      sourceType: "run_of_show",
      sourceId: item.planItemId || "",
      type: item.metadata?.kind || item.phase || "plan_item",
      title: item.title,
      description: item.description,
      startsAt: item.dueAt,
      zone: item.zone || "all",
      roleKey: item.assignedRoleKey || "",
      priority: item.priority || "normal",
      metadata: { source: "smart_plan", planStatus: smartPlan.status || "" },
    })));

  linkedCalendarEvents.forEach((calendarEvent) => {
    const source = linkedCalendarSources.find((item) => item.id === calendarEvent.sourceId);
    items.push(timelineItem({
      id: `calendar:${calendarEvent.id}`,
      sourceType: "run_of_show",
      sourceId: calendarEvent.id,
      type: "linked_resource",
      title: calendarEvent.title || source?.name || "Linked event resource",
      description: "Linked operational resource",
      startsAt: calendarEvent.startsAt,
      endsAt: calendarEvent.endsAt,
      zone: "all",
      metadata: { source: "linked_calendar", sourceName: source?.name || calendarEvent.sourceName || "" },
    }));
  });

  eventTasks.forEach((task) => {
    items.push(timelineItem({
      id: `task:${task.id}`,
      sourceType: "task",
      sourceId: task.id,
      type: task.metadata?.kind || "task_due",
      title: task.title,
      description: task.description,
      startsAt: task.dueAt,
      zone: task.zone || "all",
      roleKey: task.assignedRoleKey,
      priority: task.priority,
      status: task.status === "done" ? "completed" : ["cancelled", "missed"].includes(task.status) ? "cancelled" : "upcoming",
      actionable: !["done", "cancelled", "missed"].includes(task.status),
      taskId: task.id,
      metadata: { taskStatus: task.status || "pending" },
    }));
  });

  (staffing.requirements || []).filter((item) => item.included !== false).forEach((requirement) => {
    if (requirement.shiftStartsAt) items.push(timelineItem({
      id: `staffing:${requirement.requirementId}:start`,
      sourceType: "staffing",
      sourceId: requirement.requirementId,
      type: "staffing_shift_start",
      title: `${requirement.roleLabel} shift starts`,
      startsAt: requirement.shiftStartsAt,
      endsAt: requirement.shiftEndsAt,
      zone: requirement.zoneKey,
      roleKey: requirement.roleKey,
      metadata: { recommendedCount: requirement.recommendedCount },
    }));
  });

  responsibilityHandovers.forEach((handover) => items.push(timelineItem({
    id: `handover:${handover.id}`,
    sourceType: "handover",
    sourceId: handover.id,
    type: "responsibility_handover",
    title: `Responsibility handed to ${handover.toName}`,
    description: handover.notes,
    startsAt: handover.createdAt,
    zone: handover.responsibilityScope || "all",
    status: "completed",
  })));

  liveUpdates.forEach((update) => items.push(timelineItem({
    id: `update:${update.id}`,
    sourceType: "live_update",
    sourceId: update.id,
    type: update.updateType,
    title: update.title,
    description: update.details,
    startsAt: update.occurredAt,
    zone: update.zone || "all",
    roleKey: update.ownerRoleKey,
    priority: update.priority,
    status: update.status === "resolved" ? "completed" : update.status === "cancelled" ? "cancelled" : "upcoming",
    updateId: update.id,
    metadata: update.metadata,
  })));

  const nowMs = new Date(now).getTime();
  const scheduled = dedupe(applyOperationalOverrides(items, liveUpdates))
    .map((item) => ({ ...item, status: itemStatus(item, nowMs) }))
    .sort((a, b) => {
      const timeA = a.startsAt ? new Date(a.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
      const timeB = b.startsAt ? new Date(b.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
      return timeA - timeB ||
        (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2) ||
        (SOURCE_ORDER[a.sourceType] ?? 9) - (SOURCE_ORDER[b.sourceType] ?? 9) ||
        a.id.localeCompare(b.id);
    });
  const activeZones = [...new Set([
    ...(staffing.activeZones || []),
    ...roleAssignments.filter((item) => item.active).map((item) => item.zone),
    ...scheduled.filter((item) => ["active", "upcoming", "overdue"].includes(item.status)).map((item) => item.zone),
  ].filter((zone) => zone && zone !== "all"))];
  const handover = responsibilityHandovers.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  return {
    operationalWindow,
    items: scheduled,
    nowItems: scheduled.filter((item) => item.status === "active" || (item.sourceType === "task" && item.status === "overdue")),
    nextItems: scheduled.filter((item) => item.status === "upcoming" && new Date(item.startsAt).getTime() > nowMs),
    overdueItems: scheduled.filter((item) => item.status === "overdue"),
    completedItems: scheduled.filter((item) => item.status === "completed"),
    unscheduledItems: scheduled.filter((item) => item.status === "unscheduled"),
    activeZones,
    currentResponsibility: handover?.toName || eventOperation.activeResponsibleName || "Not assigned",
    presentNames: [...new Set(staffPresence.filter((item) => item.available !== false).map((item) => item.operatorName).filter(Boolean))],
    warnings: operationalWindow.eventStartsAt && operationalWindow.eventEndsAt ? [] : ["Official event start/end is incomplete."],
  };
}

export function timelineItemsWithin(items = [], now, horizonMinutes = 30) {
  const nowMs = new Date(now).getTime();
  const horizon = nowMs + horizonMinutes * 60000;
  return items.filter((item) => {
    const time = new Date(item.startsAt || "").getTime();
    return Number.isFinite(time) && time > nowMs && time <= horizon;
  });
}
