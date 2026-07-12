function active(items = []) {
  return items.filter((item) => item.active !== false);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function buildEventManagerBrief({
  eventOperation = {},
  smartPlan = null,
  timeline = {},
  readiness = {},
  eventTasks = [],
  roleAssignments = [],
  liveUpdates = [],
  responsibilityHandovers = [],
  rigGuides = [],
} = {}) {
  const staffing = smartPlan?.setup?.staffingProposal || {};
  const assignments = active(roleAssignments);
  const openUpdates = liveUpdates.filter((item) => ["open", "acknowledged"].includes(item.status));
  return {
    title: eventOperation.title || "Event brief",
    venue: eventOperation.venue || "Venue not set",
    officialStartsAt: eventOperation.startsAt || "",
    officialEndsAt: eventOperation.endsAt || "",
    operationalWindow: timeline.operationalWindow || {},
    guestCount: staffing.guestCount ?? null,
    guestCountSource: staffing.guestCountSource || "unknown",
    activeZones: timeline.activeZones || staffing.activeZones || [],
    milestones: (timeline.items || []).filter((item) => ["event_boundary", "run_of_show", "live_update"].includes(item.sourceType)).slice(0, 20),
    staffing: {
      recommended: (staffing.requirements || []).filter((item) => item.included !== false).reduce((sum, item) => sum + Number(item.recommendedCount || 0), 0),
      assigned: assignments.length,
      assignments: assignments.map((item) => ({ role: item.roleLabel, zone: item.zone, name: item.assignedOperatorName })),
    },
    readiness: {
      score: readiness.score || 0,
      summary: readiness.summary || "Not evaluated",
      blockers: (readiness.blockers || []).map((item) => item.title),
      warnings: (readiness.warnings || []).map((item) => item.title),
    },
    tasks: {
      total: eventTasks.length,
      open: eventTasks.filter((item) => !["done", "cancelled", "missed"].includes(item.status)).length,
      criticalOpen: eventTasks.filter((item) => item.priority === "critical" && !["done", "cancelled", "missed"].includes(item.status)).map((item) => item.title),
    },
    rigGuides: rigGuides.filter((guide) => (smartPlan?.rigRefs || []).includes(guide.id)).map((guide) => guide.title),
    liveIssues: openUpdates.map((item) => ({ title: item.title, zone: item.zone, priority: item.priority })),
    latestHandover: responsibilityHandovers.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null,
  };
}

export function buildRoleEventBrief({
  user = {},
  eventOperation = {},
  roleAssignments = [],
  eventTasks = [],
  timeline = {},
  liveUpdates = [],
  rigGuides = [],
} = {}) {
  const authUserId = user.authUserId || user.backendUserId || "";
  const names = unique([user.operatorName, user.name].map((value) => String(value || "").trim().toLowerCase()));
  const mine = active(roleAssignments).filter((assignment) => {
    if (assignment.assignedAuthUserId && authUserId) return assignment.assignedAuthUserId === authUserId;
    if (assignment.assignedAuthUserId) return false;
    return names.includes(String(assignment.assignedOperatorName || "").trim().toLowerCase());
  });
  const roleKeys = new Set(mine.map((item) => item.roleKey));
  const zones = new Set(mine.map((item) => item.zone || "all"));
  const relevantTask = (task) =>
    task.assignedAuthUserId === authUserId ||
    names.includes(String(task.assignedOperatorName || "").trim().toLowerCase()) ||
    roleKeys.has(task.assignedRoleKey) ||
    task.metadata?.audience === "all_event_staff";
  const relevantZone = (zone) => !zone || zone === "all" || zones.has("all") || zones.has(zone);
  return {
    title: eventOperation.title || "My event brief",
    venue: eventOperation.venue || "Venue not set",
    roles: mine.map((item) => ({ roleKey: item.roleKey, roleLabel: item.roleLabel, zone: item.zone, reportsTo: item.roleKey === "runner" ? "Headrunner" : "Event Floor Manager" })),
    tasks: eventTasks.filter(relevantTask),
    timeline: (timeline.items || []).filter((item) => relevantZone(item.zone) && (item.sourceType !== "staffing" || !item.roleKey || roleKeys.has(item.roleKey))).slice(0, 20),
    liveUpdates: liveUpdates.filter((item) => item.priority === "critical" || relevantZone(item.zone)),
    guideTitles: rigGuides.filter((guide) => guide.venueKeys?.some((zone) => zones.has(zone) || zone === "all")).map((guide) => guide.title),
  };
}

export function buildHandoverPreview({ timeline = {}, readiness = {}, roleAssignments = [], liveUpdates = [] } = {}) {
  const leads = active(roleAssignments).filter((item) => item.roleKey?.includes("manager") || item.roleKey === "headrunner");
  return {
    criticalTasks: (readiness.taskRisk?.criticalOverdue || []).map((item) => item.title),
    openIssues: liveUpdates.filter((item) => ["open", "acknowledged"].includes(item.status) && ["important", "critical"].includes(item.priority)).map((item) => `${item.title} (${item.zone || "all"})`),
    staffingWarnings: (readiness.checks || []).filter((item) => item.category === "staffing" && ["warning", "blocker"].includes(item.status)).map((item) => item.rationale),
    nextMilestones: (timeline.nextItems || []).slice(0, 3).map((item) => item.title),
    zoneLeads: leads.map((item) => `${item.roleLabel}: ${item.assignedOperatorName}`),
    decisions: liveUpdates.filter((item) => item.updateType === "decision" && item.status !== "cancelled").slice(-5).map((item) => item.title),
  };
}
