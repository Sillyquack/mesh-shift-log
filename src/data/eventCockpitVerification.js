import { buildRoleEventBrief } from "./eventBriefBuilder.js";
import { buildEventOperationsTimeline } from "./eventOperationsTimeline.js";
import { evaluateEventReadiness } from "./eventReadinessRules.js";

const NOW = "2026-07-20T17:30:00.000Z";
const event = (overrides = {}) => ({
  id: "event-1",
  title: "Event",
  venue: "Workbar",
  startsAt: "2026-07-20T18:00:00.000Z",
  endsAt: "2026-07-20T22:00:00.000Z",
  status: "active",
  metadata: {},
  ...overrides,
});
const assignment = (roleKey, zone, authUserId = "user-1") => ({
  id: `${roleKey}-${zone}-${authUserId}`,
  eventId: "event-1",
  active: true,
  roleKey,
  roleLabel: roleKey.replaceAll("_", " "),
  zone,
  assignedAuthUserId: authUserId,
  assignedOperatorName: authUserId,
});
const plan = (overrides = {}) => ({
  id: "plan-1",
  status: "applied",
  setup: {
    prepStartsAt: "2026-07-20T17:00:00.000Z",
    closeEndsAt: "2026-07-20T23:00:00.000Z",
    staffingProposal: {
      guestCount: 30,
      guestCountSource: "calendar_text",
      activeZones: ["workbar"],
      scheduleSegments: [
        { segmentId: "coffee-1730", type: "break", title: "Coffee service", startsAt: "2026-07-20T17:30:00.000Z", endsAt: "2026-07-20T18:00:00.000Z", zones: ["workbar"] },
        { segmentId: "presentation-1800", type: "presentation", title: "Presentation", startsAt: "2026-07-20T18:00:00.000Z", endsAt: "2026-07-20T19:00:00.000Z", zones: ["workbar"] },
      ],
      requirements: [
        { requirementId: "all:event_floor_manager", roleKey: "event_floor_manager", roleLabel: "Event Floor Manager", zoneKey: "all", recommendedCount: 1, minimumCount: 1, required: true, included: true },
        { requirementId: "workbar:workbar_staff", roleKey: "workbar_staff", roleLabel: "Workbar Staff", zoneKey: "workbar", recommendedCount: 1, minimumCount: 1, required: true, included: true },
      ],
      ...overrides,
    },
  },
  rigRefs: [],
});

export function runEventCockpitVerification() {
  const baseAssignments = [assignment("event_floor_manager", "all"), assignment("workbar_staff", "workbar")];
  const overdueTask = { id: "task-overdue", eventId: "event-1", title: "Prep coffee", dueAt: "2026-07-20T17:15:00.000Z", status: "pending", priority: "normal", zone: "workbar", assignedRoleKey: "workbar_staff" };
  const timelineA = buildEventOperationsTimeline({ eventOperation: event(), smartPlan: plan(), eventTasks: [overdueTask], roleAssignments: baseAssignments, now: NOW });
  const readinessA = evaluateEventReadiness({ eventOperation: event(), smartPlan: plan(), eventTasks: [overdueTask], roleAssignments: baseAssignments, now: NOW });

  const barPlan = plan({
    guestCount: 80,
    activeZones: ["bar"],
    scheduleSegments: [{ segmentId: "bar-1730", type: "bar_open", title: "Bar opens", startsAt: NOW, endsAt: "2026-07-20T22:00:00.000Z", zones: ["bar"] }],
    requirements: [
      { requirementId: "all:event_floor_manager", roleKey: "event_floor_manager", roleLabel: "Event Floor Manager", zoneKey: "all", recommendedCount: 1, minimumCount: 1, required: true, included: true },
      { requirementId: "bar:bar_staff", roleKey: "bar_staff", roleLabel: "Bar Staff", zoneKey: "bar", recommendedCount: 2, minimumCount: 2, required: true, included: true },
    ],
  });
  const readinessB = evaluateEventReadiness({ eventOperation: event({ venue: "MY-1-Bar" }), smartPlan: barPlan, roleAssignments: [assignment("event_floor_manager", "all"), assignment("bar_staff", "bar")], now: NOW });

  const largePlan = plan({ guestCount: 180, activeZones: ["atrium", "bar", "backstage"], requirements: plan().setup.staffingProposal.requirements });
  const technicalIssue = { id: "issue-1", eventId: "event-1", updateType: "technical", title: "Projector offline", zone: "backstage", priority: "critical", status: "open", occurredAt: NOW, metadata: {} };
  const readinessC = evaluateEventReadiness({ eventOperation: event({ venue: "Atrium + Bar + CommunityStage" }), smartPlan: largePlan, roleAssignments: baseAssignments, liveUpdates: [technicalIssue], now: NOW });

  const delay = { id: "delay-1", eventId: "event-1", updateType: "delay", title: "Presentation delayed", zone: "workbar", priority: "important", status: "open", occurredAt: NOW, createdByName: "Bobby", metadata: { timelineOverride: { targetTitle: "Presentation", updatedStartsAt: "2026-07-20T18:20:00.000Z" } } };
  const timelineE = buildEventOperationsTimeline({ eventOperation: event(), smartPlan: plan(), liveUpdates: [delay], now: NOW });
  const changedPresentation = timelineE.items.find((item) => item.title === "Presentation");

  const doneTask = { ...overdueTask, id: "done", status: "done", completedAt: NOW };
  const timelineF = buildEventOperationsTimeline({ eventOperation: event(), smartPlan: plan(), eventTasks: [doneTask], now: NOW });

  const openRolePlan = plan({ requirements: [{ requirementId: "runners:runner", roleKey: "runner", roleLabel: "Runner", zoneKey: "runners", recommendedCount: 1, minimumCount: 1, required: true, included: true }] });
  const roleTask = { ...overdueTask, id: "runner-task", assignedRoleKey: "runner", zone: "runners" };
  const readinessG = evaluateEventReadiness({ eventOperation: event(), smartPlan: openRolePlan, eventTasks: [roleTask], roleAssignments: [], now: NOW });

  const roleBrief = buildRoleEventBrief({
    user: { authUserId: "atrium-user", name: "Atrium Person" },
    eventOperation: event(),
    roleAssignments: [assignment("atrium_staff", "atrium", "atrium-user")],
    eventTasks: [
      { ...overdueTask, id: "atrium-task", zone: "atrium", assignedRoleKey: "atrium_staff" },
      { ...overdueTask, id: "bar-task", zone: "bar", assignedRoleKey: "bar_staff" },
    ],
    timeline: { items: [{ id: "atrium", zone: "atrium" }, { id: "bar", zone: "bar" }] },
    liveUpdates: [{ ...technicalIssue, zone: "bar", priority: "normal" }, { ...technicalIssue, id: "global", zone: "all", priority: "critical" }],
  });
  const offline = evaluateEventReadiness({ eventOperation: event(), smartPlan: plan(), roleAssignments: baseAssignments, backendAvailable: false, now: NOW });
  const completionBlocked = evaluateEventReadiness({ eventOperation: event({ status: "active" }), smartPlan: plan(), eventTasks: [{ ...overdueTask, priority: "critical" }], roleAssignments: baseAssignments, now: "2026-07-20T23:30:00.000Z" });

  return [
    { id: "A", passed: readinessA.level === "needs_attention" && timelineA.overdueItems.length === 1 && timelineA.activeZones.includes("workbar") && !timelineA.activeZones.includes("bar") },
    { id: "B", passed: readinessB.warnings.some((item) => item.checkId === "required-staffing") && !barPlan.setup.staffingProposal.requirements.some((item) => item.roleKey === "workbar_manager") },
    { id: "C", passed: readinessC.level === "at_risk" && readinessC.warnings.some((item) => item.checkId === "multi-zone-coordination") && readinessC.blockers.some((item) => item.checkId === "live-issues") },
    { id: "D", passed: plan({ guestCount: 20 }).setup.staffingProposal.guestCount === 20 },
    { id: "E", passed: changedPresentation?.startsAt === "2026-07-20T18:20:00.000Z" && changedPresentation.metadata.originalStartsAt === "2026-07-20T18:00:00.000Z" },
    { id: "F", passed: timelineF.completedItems.some((item) => item.taskId === "done") && !timelineF.overdueItems.some((item) => item.taskId === "done") },
    { id: "G", passed: readinessG.taskRisk.blockedByOpenRole.some((item) => item.id === "runner-task") },
    { id: "H", passed: roleBrief.roles.length === 1 && !Object.hasOwn(roleBrief, "staffDirectory") },
    { id: "I", passed: roleBrief.roles[0]?.roleKey === "atrium_staff" },
    { id: "J", passed: offline.warnings.some((item) => item.checkId === "backend-status") && offline.summary !== "Ready" },
    { id: "K", passed: roleBrief.tasks.some((item) => item.id === "atrium-task") && !roleBrief.tasks.some((item) => item.id === "bar-task") && roleBrief.liveUpdates.some((item) => item.id === "global") },
    { id: "L", passed: completionBlocked.canCompleteNormally === false && completionBlocked.blockers.length > 0 },
  ];
}

function canManageLiveUpdate({ actor, assignment, update }) {
  if (!actor.active || actor.organizationId !== update.organizationId) return false;
  if (actor.canManageEventOps) return true;
  if (actor.sharedDevice || !assignment?.active) return false;
  if (assignment.eventId !== update.eventId || assignment.organizationId !== update.organizationId) return false;
  if (!["event_floor_manager", "cornerbar_manager", "atrium_manager", "workbar_manager", "headrunner"].includes(assignment.roleKey)) return false;
  if (assignment.authUserId !== actor.authUserId) return false;
  const assignmentZone = assignment.zone?.trim().toLowerCase() || "all";
  const updateZone = update.zone?.trim().toLowerCase() || "all";
  return updateZone === "all" ? assignmentZone === "all" : ["all", updateZone].includes(assignmentZone);
}

function canAccessLiveUpdate({ actor, assignment, eventRecord, presence = null, selectedOperator = "" }) {
  if (!actor.active || actor.organizationId !== eventRecord.organizationId) return false;
  if (actor.canManageEventOps) return true;
  if (!assignment?.active || assignment.eventId !== eventRecord.id || assignment.organizationId !== eventRecord.organizationId) return false;
  if (!actor.sharedDevice) return assignment.authUserId === actor.authUserId;
  const operatorName = selectedOperator.trim().toLowerCase();
  return Boolean(
    operatorName &&
    !assignment.authUserId &&
    assignment.operatorName.trim().toLowerCase() === operatorName &&
    presence?.available === true &&
    presence.authUserId === actor.authUserId &&
    presence.organizationId === eventRecord.organizationId &&
    presence.date === eventRecord.date &&
    presence.operatorName.trim().toLowerCase() === operatorName
  );
}

function verifyLiveUpdateTransition({ actor, assignment, update, requestedStatus }) {
  if (!canManageLiveUpdate({ actor, assignment, update })) return "denied";
  if (requestedStatus === "cancelled" && !actor.canManageEventOps) return "denied";
  if (update.status === requestedStatus) return "idempotent";
  if (["resolved", "cancelled"].includes(update.status)) return "incompatible";
  return "permitted";
}

export function runEventLiveUpdateAuthorizationVerification() {
  const organizationId = "organization-a";
  const eventId = "event-a";
  const manager = { active: true, organizationId, authUserId: "manager", displayName: "Manager", canManageEventOps: true, sharedDevice: false };
  const eventFloorManager = { active: true, organizationId, authUserId: "efm", displayName: "Event Floor Manager", canManageEventOps: true, sharedDevice: false };
  const atriumLead = { active: true, organizationId, authUserId: "atrium-lead", displayName: "Atrium Lead", canManageEventOps: false, sharedDevice: false };
  const staff = { active: true, organizationId, authUserId: "staff", displayName: "Staff", canManageEventOps: false, sharedDevice: false };
  const shared = { active: true, organizationId, authUserId: "shared", displayName: "Workbar Device", canManageEventOps: false, sharedDevice: true };
  const atriumAssignment = { active: true, organizationId, eventId, roleKey: "atrium_manager", zone: "atrium", authUserId: "atrium-lead", operatorName: "Atrium Lead" };
  const staffAssignment = { active: true, organizationId, eventId, roleKey: "atrium_staff", zone: "atrium", authUserId: "staff", operatorName: "Staff" };
  const update = (overrides = {}) => ({ organizationId, eventId, zone: "atrium", status: "open", ...overrides });
  const existingScenarios = [
    { id: "M", passed: verifyLiveUpdateTransition({ actor: atriumLead, assignment: atriumAssignment, update: update(), requestedStatus: "resolved" }) === "permitted" },
    { id: "N", passed: verifyLiveUpdateTransition({ actor: atriumLead, assignment: atriumAssignment, update: update({ zone: "bar" }), requestedStatus: "resolved" }) === "denied" },
    { id: "O", passed: verifyLiveUpdateTransition({ actor: atriumLead, assignment: atriumAssignment, update: update({ zone: "all" }), requestedStatus: "resolved" }) === "denied" },
    { id: "P", passed: verifyLiveUpdateTransition({ actor: eventFloorManager, assignment: null, update: update({ zone: "all" }), requestedStatus: "resolved" }) === "permitted" },
    { id: "Q", passed: verifyLiveUpdateTransition({ actor: atriumLead, assignment: atriumAssignment, update: update(), requestedStatus: "cancelled" }) === "denied" },
    { id: "R", passed: verifyLiveUpdateTransition({ actor: manager, assignment: null, update: update(), requestedStatus: "cancelled" }) === "permitted" },
    { id: "S", passed: verifyLiveUpdateTransition({ actor: staff, assignment: staffAssignment, update: update(), requestedStatus: "resolved" }) === "denied" },
    { id: "T", passed: verifyLiveUpdateTransition({ actor: shared, assignment: atriumAssignment, update: update(), requestedStatus: "cancelled" }) === "denied" },
    { id: "U", passed: verifyLiveUpdateTransition({ actor: atriumLead, assignment: atriumAssignment, update: update({ status: "resolved" }), requestedStatus: "resolved" }) === "idempotent" },
    { id: "V", passed: verifyLiveUpdateTransition({ actor: manager, assignment: null, update: update({ organizationId: "organization-b" }), requestedStatus: "resolved" }) === "denied" },
  ];
  const sameNameAssigned = { active: true, organizationId, authUserId: "same-name-assigned", displayName: "Alex", canManageEventOps: false, sharedDevice: false };
  const sameNameOther = { active: true, organizationId, authUserId: "same-name-other", displayName: "Alex", canManageEventOps: false, sharedDevice: false };
  const sameNameAssignment = { active: true, organizationId, eventId, roleKey: "atrium_manager", zone: "atrium", authUserId: "same-name-assigned", operatorName: "Alex" };
  const legacyNameOnlyAssignment = { ...sameNameAssignment, authUserId: "" };
  const eventRecord = { id: eventId, organizationId, date: "2026-07-20" };
  const sharedAssignment = { active: true, organizationId, eventId, roleKey: "workbar_staff", zone: "workbar", authUserId: "", operatorName: "Sheila" };
  const sharedPresence = { organizationId, date: eventRecord.date, authUserId: shared.authUserId, operatorName: "Sheila", available: true };
  return [
    ...existingScenarios,
    { id: "W", passed: canAccessLiveUpdate({ actor: sameNameAssigned, assignment: sameNameAssignment, eventRecord }) && !canAccessLiveUpdate({ actor: sameNameOther, assignment: sameNameAssignment, eventRecord }) },
    { id: "X", passed: legacyNameOnlyAssignment.operatorName === "Alex" && !canAccessLiveUpdate({ actor: sameNameAssigned, assignment: legacyNameOnlyAssignment, eventRecord }) },
    { id: "Y", passed: verifyLiveUpdateTransition({ actor: sameNameAssigned, assignment: sameNameAssignment, update: update(), requestedStatus: "resolved" }) === "permitted" },
    { id: "Z", passed: verifyLiveUpdateTransition({ actor: sameNameOther, assignment: sameNameAssignment, update: update(), requestedStatus: "resolved" }) === "denied" },
    { id: "AA", passed: canAccessLiveUpdate({ actor: shared, assignment: sharedAssignment, eventRecord, presence: sharedPresence, selectedOperator: "Sheila" }) },
    { id: "AB", passed: !canAccessLiveUpdate({ actor: shared, assignment: sharedAssignment, eventRecord, presence: { ...sharedPresence, available: false }, selectedOperator: "Sheila" }) },
  ];
}
