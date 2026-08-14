import { useEffect, useMemo, useRef, useState } from "react";
import { eventRigGuides } from "../data/eventRigGuides.js";
import { buildEventManagerBrief, buildHandoverPreview, buildRoleEventBrief } from "../data/eventBriefBuilder.js";
import { buildEventOperationsTimeline, timelineItemsWithin } from "../data/eventOperationsTimeline.js";
import { evaluateEventReadiness } from "../data/eventReadinessRules.js";
import { listCalendarSources, listImportedCalendarEvents } from "../lib/calendarImportClient.js";
import { getCurrentEventPlan } from "../lib/eventPlanClient.js";

const TABS = [
  ["overview", "Overview"],
  ["readiness", "Readiness"],
  ["timeline", "Run of Show"],
  ["staffing", "Staffing & Zones"],
  ["tasks", "Tasks & Risks"],
  ["updates", "Live Updates"],
  ["handover", "Handover"],
  ["brief", "Event Brief"],
];

const UPDATE_PRESETS = [
  ["issue", "Issue"],
  ["delay", "Delay"],
  ["change", "Operational change"],
  ["client_request", "Client request"],
  ["technical", "Technical issue"],
  ["staffing", "Staffing issue"],
  ["stock", "Stock/restock"],
  ["catering", "Catering issue"],
  ["decision", "Operational decision"],
  ["note", "General note"],
];

function formatTime(value) {
  if (!value) return "--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Oslo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function formatRange(start, end) {
  return `${formatTime(start)}${end ? `–${formatTime(end)}` : ""}`;
}

function toLocalInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function localInputToIso(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

function identityAssignments(user, assignments) {
  const authUserId = user?.authUserId || user?.backendUserId || "";
  const names = [user?.operatorName, user?.name].map(normalized).filter(Boolean);
  return assignments.filter((assignment) => {
    if (!assignment.active) return false;
    if (assignment.assignedAuthUserId && authUserId) return assignment.assignedAuthUserId === authUserId;
    if (assignment.assignedAuthUserId) return false;
    return names.includes(normalized(assignment.assignedOperatorName));
  });
}

function staffingCounts(plan, assignments, presence, now) {
  const requirements = (plan?.setup?.staffingProposal?.requirements || []).filter((item) => item.included !== false);
  const recommended = requirements.reduce((sum, item) => sum + Number(item.recommendedCount || 0), 0);
  const assigned = assignments.filter((item) => item.active).length;
  const presentNames = new Set(presence.filter((item) => item.available !== false).map((item) => normalized(item.operatorName)).filter(Boolean));
  const present = assignments.filter((item) => item.active && presentNames.has(normalized(item.assignedOperatorName))).length;
  const nowMs = new Date(now).getTime();
  const onShiftNow = requirements.reduce((sum, item) => {
    const start = new Date(item.shiftStartsAt || "").getTime();
    const end = new Date(item.shiftEndsAt || "").getTime();
    return sum + (Number.isFinite(start) && Number.isFinite(end) && start <= nowMs && end > nowMs ? Number(item.recommendedCount || 0) : 0);
  }, 0);
  return { recommended, assigned, present, onShiftNow, open: Math.max(0, recommended - assigned) };
}

function countdown(item, now) {
  const minutes = Math.max(0, Math.ceil((new Date(item?.startsAt || "").getTime() - new Date(now).getTime()) / 60000));
  return item ? `${item.title}${minutes ? ` in ${minutes} min` : " now"}` : "No upcoming milestone";
}

export function EventCockpitSummaryCard({ eventOperation, eventTasks, assignments, presence, liveUpdates, onOpen }) {
  const [plan, setPlan] = useState(null);
  const now = new Date().toISOString();
  useEffect(() => {
    let cancelled = false;
    if (!eventOperation?.id) return undefined;
    getCurrentEventPlan(eventOperation.id).then((result) => {
      if (!cancelled && result.ok) setPlan(result.record || null);
    });
    return () => { cancelled = true; };
  }, [eventOperation?.id]);
  if (!eventOperation) return null;
  const timeline = buildEventOperationsTimeline({ eventOperation, smartPlan: plan, eventTasks, roleAssignments: assignments, staffPresence: presence, liveUpdates, now });
  const readiness = evaluateEventReadiness({ eventOperation, smartPlan: plan, eventTasks, roleAssignments: assignments, liveUpdates, now });
  const staffing = staffingCounts(plan, assignments, presence, now);
  return (
    <section className="manager-list cockpit-summary-card">
      <div className="section-heading static-heading">
        <div><p className="eyebrow">Event Cockpit</p><h2>{eventOperation.title}</h2></div>
        <span>{readiness.score}% · {readiness.summary}</span>
      </div>
      <p className="muted">{eventOperation.venue || "Venue not set"} · {formatRange(eventOperation.startsAt, eventOperation.endsAt)}</p>
      <p className="muted">Operational window {formatRange(timeline.operationalWindow.prepStartsAt, timeline.operationalWindow.closeEndsAt)}</p>
      <div className="cockpit-summary-grid">
        <div><small>Now</small><strong>{timeline.nowItems[0]?.title || readiness.lifecycle.replaceAll("_", " ")}</strong></div>
        <div><small>Next</small><strong>{countdown(timeline.nextItems[0], now)}</strong></div>
        <div><small>Staffing</small><strong>{staffing.assigned} assigned · {staffing.open} open</strong></div>
        <div><small>Tasks / Issues</small><strong>{readiness.taskRisk.dueIn30.length} due soon · {timeline.overdueItems.length} overdue · {liveUpdates.filter((item) => item.status === "open").length} issues</strong></div>
      </div>
      <button type="button" className="primary-button compact-button" onClick={onOpen}>Open Event Cockpit</button>
    </section>
  );
}

export default function EventOperationsCockpit({
  user,
  eventOperation,
  eventTasks = [],
  assignments = [],
  presence = [],
  handovers = [],
  liveUpdates = [],
  managerView = false,
  backendStatus = {},
  refreshToken = "",
  onClose,
  onRefresh,
  onTaskStatus,
  onCreateLiveUpdate,
  onAcknowledgeLiveUpdate,
  onResolveLiveUpdate,
  onCancelLiveUpdate,
  onUpdateEvent,
  onCreateHandover,
  onOpenGuide,
  onNavigate,
}) {
  const [tab, setTab] = useState("overview");
  const [plan, setPlan] = useState(null);
  const [linkedEvents, setLinkedEvents] = useState([]);
  const [linkedSources, setLinkedSources] = useState([]);
  const [now, setNow] = useState(new Date().toISOString());
  const [horizon, setHorizon] = useState(30);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [updateForm, setUpdateForm] = useState({ updateType: "note", title: "", details: "", zone: "all", priority: "normal", ownerRoleKey: "", occurredAt: toLocalInput(new Date()), operationalTime: "", targetTitle: "" });
  const [resolutionNotes, setResolutionNotes] = useState({});
  const [handoverForm, setHandoverForm] = useState({ toName: "", scope: "all", notes: "" });
  const [overrideForm, setOverrideForm] = useState({ checkId: "", reason: "" });
  const [completionReason, setCompletionReason] = useState("");
  const updateTitleRef = useRef(null);
  const cockpitRef = useRef(null);
  const lastRefreshTokenRef = useRef(refreshToken);
  const myAssignments = useMemo(() => identityAssignments(user, assignments), [user, assignments]);
  const myZones = useMemo(() => new Set(myAssignments.map((item) => item.zone || "all")), [myAssignments]);
  const myRoles = useMemo(() => new Set(myAssignments.map((item) => item.roleKey)), [myAssignments]);
  const canUseOperationalPresets = managerView || [
    "event_floor_manager", "cornerbar_manager", "atrium_manager", "workbar_manager", "headrunner",
  ].some((roleKey) => myRoles.has(roleKey));
  const updatePresets = canUseOperationalPresets
    ? UPDATE_PRESETS
    : UPDATE_PRESETS.filter(([value]) => ["note", "issue"].includes(value));
  const relevant = (zone) => managerView || !zone || zone === "all" || myZones.has("all") || myZones.has(zone);
  const scopedTasks = managerView ? eventTasks : eventTasks.filter((task) =>
    relevant(task.zone) && (
      task.metadata?.audience === "all_event_staff" ||
      myRoles.has(task.assignedRoleKey) ||
      task.assignedAuthUserId === (user.authUserId || user.backendUserId) ||
      normalized(task.assignedOperatorName) === normalized(user.operatorName || user.name)
    ),
  );
  const scopedUpdates = managerView ? liveUpdates : liveUpdates.filter((item) => item.priority === "critical" || relevant(item.zone));

  useEffect(() => {
    cockpitRef.current?.focus();
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date().toISOString()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let cancelled = false;
    async function loadContext() {
      if (!eventOperation?.id) return;
      const planResult = managerView ? await getCurrentEventPlan(eventOperation.id) : { ok: false };
      if (!cancelled && planResult.ok) setPlan(planResult.record || null);
      if (!managerView) return;
      const from = new Date(new Date(eventOperation.startsAt || Date.now()).getTime() - 24 * 3600000).toISOString();
      const to = new Date(new Date(eventOperation.endsAt || Date.now()).getTime() + 24 * 3600000).toISOString();
      const [eventsResult, sourcesResult] = await Promise.all([
        listImportedCalendarEvents({ from, to }),
        listCalendarSources(),
      ]);
      if (cancelled) return;
      const linked = (eventsResult.records || []).filter((item) => item.linkedEventOperationId === eventOperation.id);
      setLinkedEvents(linked);
      const sourceIds = new Set(linked.map((item) => item.sourceId));
      setLinkedSources((sourcesResult.records || []).filter((item) => sourceIds.has(item.id)));
    }
    loadContext().catch(() => setStatus({ type: "error", message: "Some Cockpit context could not be refreshed. Loaded event data remains visible." }));
    return () => { cancelled = true; };
  }, [eventOperation?.id, managerView, refreshToken]);
  useEffect(() => {
    if (lastRefreshTokenRef.current && refreshToken && lastRefreshTokenRef.current !== refreshToken) {
      setStatus({ type: "pending", message: "Event data changed. The Cockpit has refreshed without clearing your open form." });
    }
    lastRefreshTokenRef.current = refreshToken;
  }, [refreshToken]);

  const timeline = useMemo(() => buildEventOperationsTimeline({ eventOperation, smartPlan: plan, linkedCalendarEvents: linkedEvents, linkedCalendarSources: linkedSources, eventTasks: scopedTasks, roleAssignments: assignments, staffPresence: presence, responsibilityHandovers: handovers, liveUpdates: scopedUpdates, now }), [eventOperation, plan, linkedEvents, linkedSources, scopedTasks, assignments, presence, handovers, scopedUpdates, now]);
  const readiness = useMemo(() => evaluateEventReadiness({ eventOperation, smartPlan: plan, linkedCalendarEvents: linkedEvents, linkedCalendarSources: linkedSources, eventTasks: managerView ? eventTasks : scopedTasks, roleAssignments: managerView ? assignments : myAssignments, staffPresence: presence, responsibilityHandovers: handovers, rigGuides: eventRigGuides, liveUpdates: scopedUpdates, backendAvailable: backendStatus.state === "connected", now }), [eventOperation, plan, linkedEvents, linkedSources, eventTasks, scopedTasks, assignments, myAssignments, presence, handovers, scopedUpdates, backendStatus.state, now, managerView]);
  const staffing = staffingCounts(plan, assignments, presence, now);
  const brief = managerView
    ? buildEventManagerBrief({ eventOperation, smartPlan: plan, timeline, readiness, eventTasks, roleAssignments: assignments, liveUpdates, responsibilityHandovers: handovers, rigGuides: eventRigGuides })
    : buildRoleEventBrief({ user, eventOperation, roleAssignments: myAssignments, eventTasks: scopedTasks, timeline, liveUpdates: scopedUpdates, rigGuides: eventRigGuides });
  const handoverPreview = buildHandoverPreview({ timeline, readiness, roleAssignments: assignments, liveUpdates });
  const upcoming = horizon === 0 ? timeline.nextItems : timelineItemsWithin(timeline.nextItems, now, horizon);
  const openUpdates = scopedUpdates.filter((item) => ["open", "acknowledged"].includes(item.status));

  function navigate(target) {
    if (["updates", "handover", "tasks", "staffing", "timeline", "readiness"].includes(target)) {
      setTab(target);
      return;
    }
    onNavigate?.(target);
  }

  async function submitUpdate(event) {
    event.preventDefault();
    if (!updateForm.title.trim()) {
      setStatus({ type: "error", message: "Live update title is required." });
      return;
    }
    setStatus({ type: "pending", message: "Saving live update..." });
    const metadata = updateForm.operationalTime && ["delay", "change"].includes(updateForm.updateType)
      ? { timelineOverride: { targetTitle: updateForm.targetTitle || updateForm.title, updatedStartsAt: localInputToIso(updateForm.operationalTime) } }
      : {};
    const result = await onCreateLiveUpdate?.({
      eventId: eventOperation.id,
      updateType: updateForm.updateType,
      title: updateForm.title.trim(),
      details: updateForm.details.trim(),
      zone: updateForm.zone,
      priority: updateForm.priority,
      ownerRoleKey: updateForm.ownerRoleKey,
      occurredAt: localInputToIso(updateForm.occurredAt),
      createdByName: user.operatorName || user.name,
      metadata,
    });
    if (!result?.ok) {
      setStatus({ type: "error", message: result?.message || "Live update was not saved. Retry when backend access is available." });
      return;
    }
    setUpdateForm((current) => ({ ...current, title: "", details: "", operationalTime: "", targetTitle: "" }));
    setShowUpdateForm(false);
    setStatus({ type: "success", message: "Live update added." });
  }

  async function changeUpdateStatus(action, update) {
    const actionFn = action === "acknowledged" ? onAcknowledgeLiveUpdate : action === "resolved" ? onResolveLiveUpdate : onCancelLiveUpdate;
    setStatus({ type: "pending", message: `Saving ${action} status...` });
    const result = await actionFn?.(update.id, resolutionNotes[update.id] || "");
    setStatus(result?.ok ? { type: "success", message: result.message || `Update ${action}.` } : { type: "error", message: result?.message || "Update status could not be saved." });
  }

  async function acceptRisk(checkItem) {
    if (!managerView || !overrideForm.reason.trim()) return;
    const current = eventOperation.metadata?.readinessOverrides || [];
    const override = { checkId: checkItem.checkId, accepted: true, reason: overrideForm.reason.trim(), acceptedByAuthUserId: user.authUserId || user.backendUserId || "", acceptedByName: user.name, acceptedAt: new Date().toISOString() };
    const result = await onUpdateEvent?.(eventOperation.id, { ...eventOperation, metadata: { ...(eventOperation.metadata || {}), readinessOverrides: [...current.filter((item) => item.checkId !== checkItem.checkId), override] } });
    setStatus(result?.ok ? { type: "success", message: "Risk acceptance saved transparently." } : { type: "error", message: result?.message || "Risk acceptance could not be saved." });
    if (result?.ok) setOverrideForm({ checkId: "", reason: "" });
  }

  async function revokeRisk(checkId) {
    const current = eventOperation.metadata?.readinessOverrides || [];
    const result = await onUpdateEvent?.(eventOperation.id, { ...eventOperation, metadata: { ...(eventOperation.metadata || {}), readinessOverrides: current.filter((item) => item.checkId !== checkId) } });
    setStatus(result?.ok ? { type: "success", message: "Accepted risk revoked." } : { type: "error", message: result?.message || "Risk acceptance could not be revoked." });
  }

  async function completeEvent(withWarnings) {
    if (!managerView) return;
    if (!withWarnings && !readiness.canCompleteNormally) {
      setStatus({ type: "error", message: "Resolve blockers or use Complete with accepted warnings and record a reason." });
      return;
    }
    if (withWarnings && !completionReason.trim()) {
      setStatus({ type: "error", message: "Add a completion reason before completing with warnings." });
      return;
    }
    const result = await onUpdateEvent?.(eventOperation.id, {
      ...eventOperation,
      status: "finished",
      metadata: { ...(eventOperation.metadata || {}), completion: { confirmedAt: new Date().toISOString(), confirmedByName: user.name, acceptedWarnings: withWarnings, reason: completionReason.trim() } },
    });
    setStatus(result?.ok ? { type: "success", message: "Event marked complete. History remains available." } : { type: "error", message: result?.message || "Event completion could not be saved." });
  }

  async function saveHandover(event) {
    event.preventDefault();
    if (!handoverForm.toName.trim()) return setStatus({ type: "error", message: "Receiving person is required." });
    const previewText = [
      ...handoverPreview.criticalTasks.map((item) => `Critical: ${item}`),
      ...handoverPreview.openIssues.map((item) => `Issue: ${item}`),
      ...handoverPreview.nextMilestones.map((item) => `Next: ${item}`),
      handoverForm.notes,
    ].filter(Boolean).join("\n");
    const result = await onCreateHandover?.({ eventId: eventOperation.id, fromName: eventOperation.activeResponsibleName || user.name, toName: handoverForm.toName.trim(), responsibilityScope: handoverForm.scope, notes: previewText, createdByName: user.name });
    setStatus(result?.ok ? { type: "success", message: "Handover saved." } : { type: "error", message: result?.message || "Handover could not be saved." });
  }

  return (
    <section ref={cockpitRef} tabIndex="-1" className="manager-list event-cockpit-view">
      <header className="cockpit-header no-print">
        <button type="button" className="ghost-button compact-button" onClick={onClose}>Back</button>
        <div><p className="eyebrow">Event Operations Cockpit</p><h2>{eventOperation?.title || "Event"}</h2><span>{eventOperation?.venue || "Venue not set"} · {formatRange(eventOperation?.startsAt, eventOperation?.endsAt)}</span>{backendStatus.lastEventAt && <small>Last live refresh signal {formatTime(backendStatus.lastEventAt)}</small>}</div>
        <button type="button" className="ghost-button compact-button" onClick={() => onRefresh?.("cockpit_manual")}>Refresh</button>
      </header>
      <div className="cockpit-live-strip">
        <article><small>NOW</small><strong>{timeline.nowItems[0]?.title || readiness.lifecycle.replaceAll("_", " ")}</strong><span>{timeline.nowItems[0] ? formatRange(timeline.nowItems[0].startsAt, timeline.nowItems[0].endsAt) : timeline.currentResponsibility}</span></article>
        <article><small>NEXT</small><strong>{countdown(timeline.nextItems[0], now)}</strong><span>{timeline.nextItems[0]?.zone || "Event floor"}</span></article>
        <article className={readiness.blockers.length ? "is-risk" : ""}><small>AT RISK</small><strong>{timeline.overdueItems.length} overdue · {staffing.open} staffing open</strong><span>{openUpdates.length} live update(s) open</span></article>
      </div>
      {status.message && <p role="status" className={status.type === "error" ? "critical-warning" : status.type === "success" ? "all-clear" : "status-message"}>{status.message}</p>}
      {backendStatus.state && backendStatus.state !== "connected" && <p className="critical-warning">Live data may be outdated. Last Realtime status: {backendStatus.state}.</p>}
      <nav className="cockpit-tabs no-print" aria-label="Cockpit sections">
        {TABS.filter(([key]) => managerView || !["readiness", "staffing"].includes(key)).map(([key, label]) => <button key={key} type="button" className={tab === key ? "is-active" : ""} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}
      </nav>

      {tab === "overview" && <div className="cockpit-grid">
        <section><h3>Event Overview</h3><p><strong>{readiness.score}% — {readiness.summary}</strong></p><p>Lifecycle: {readiness.lifecycle.replaceAll("_", " ")}</p><p>Operational window: {formatRange(timeline.operationalWindow.prepStartsAt, timeline.operationalWindow.closeEndsAt)}</p><p>Current responsibility: {timeline.currentResponsibility}</p><p>Active zones: {timeline.activeZones.join(" · ") || "None detected"}</p></section>
        <section><h3>Next {horizon || "rest of event"} minutes</h3><select aria-label="Timeline horizon" value={horizon} onChange={(event) => setHorizon(Number(event.target.value))}><option value="15">Next 15 minutes</option><option value="30">Next 30 minutes</option><option value="60">Next 60 minutes</option><option value="0">Rest of event</option></select>{upcoming.slice(0, 5).map((item) => <p key={item.id}><strong>{formatTime(item.startsAt)}</strong> {item.title} · {item.zone}</p>)}{!upcoming.length && <p className="muted">No milestones in this horizon.</p>}</section>
        <section><h3>Staffing</h3><p>{staffing.recommended} planned · {staffing.assigned} assigned · {staffing.present} present</p><p>{staffing.onShiftNow} expected now · {staffing.open} open</p>{managerView && <button type="button" className="text-button no-print" onClick={() => navigate("staffing")}>Open Staffing & Zones</button>}</section>
        <section><h3>Tasks and Risks</h3><p>{readiness.taskRisk.criticalOverdue.length} critical overdue</p><p>{readiness.taskRisk.dueIn15.length} due in 15 min · {readiness.taskRisk.blockedByOpenRole.length} blocked by open role</p><div className="backup-actions no-print"><button type="button" className="text-button" onClick={() => setTab("tasks")}>View task risks</button><button type="button" className="text-button" onClick={() => setTab("brief")}>{managerView ? "View event brief" : "View my event brief"}</button></div></section>
      </div>}

      {tab === "readiness" && managerView && <section className="cockpit-section"><div className="readiness-heading"><h3>Readiness: {readiness.score}% — {readiness.summary}</h3><span>{readiness.blockers.length} blockers · {readiness.warnings.length} warnings · {readiness.positives.length} passed</span></div>{readiness.checks.map((item) => <article key={item.checkId} className={`readiness-check status-${item.status}`}><div><strong>{item.status === "pass" ? "PASS" : item.status === "blocker" ? "BLOCKER" : item.status === "warning" ? "WARNING" : "N/A"}: {item.title}</strong><p>{item.rationale}</p>{item.acceptedRisk && <p>Accepted risk: {item.override.reason} — {item.override.acceptedByName}</p>}</div><div className="no-print">{item.actionTarget && <button type="button" className="text-button" onClick={() => navigate(item.actionTarget)}>{item.actionLabel}</button>}{item.status === "warning" && !item.acceptedRisk && <><input aria-label={`Reason for ${item.title}`} placeholder="Reason to accept warning" value={overrideForm.checkId === item.checkId ? overrideForm.reason : ""} onChange={(event) => setOverrideForm({ checkId: item.checkId, reason: event.target.value })}/><button type="button" className="ghost-button compact-button" onClick={() => acceptRisk(item)}>Accept risk</button></>}{item.acceptedRisk && <button type="button" className="text-button" onClick={() => revokeRisk(item.checkId)}>Revoke acceptance</button>}</div></article>)}</section>}

      {tab === "timeline" && <section className="cockpit-section"><h3>Unified Run of Show</h3>{timeline.items.map((item) => <article key={item.id} className={`timeline-row status-${item.status}`}><time>{item.startsAt ? formatTime(item.startsAt) : "--:--"}</time><div><strong>{item.title}</strong><span>{item.zone} · {item.status.replaceAll("_", " ")}</span>{item.metadata.originalStartsAt && <small>Original {formatTime(item.metadata.originalStartsAt)} · Changed during event by {item.metadata.changedByName}</small>}{item.description && <details><summary>Show more</summary><p>{item.description}</p></details>}</div></article>)}</section>}

      {tab === "staffing" && managerView && <section className="cockpit-section"><h3>Staffing and Zones</h3><div className="cockpit-metrics"><span>Recommended <strong>{staffing.recommended}</strong></span><span>Assigned <strong>{staffing.assigned}</strong></span><span>Present <strong>{staffing.present}</strong></span><span>On shift now <strong>{staffing.onShiftNow}</strong></span><span>Open <strong>{staffing.open}</strong></span></div>{timeline.activeZones.map((zone) => { const zoneAssignments = assignments.filter((item) => item.active && (item.zone === zone || item.zone === "all")); const zonePresence = zoneAssignments.filter((item) => presence.some((person) => person.available !== false && normalized(person.operatorName) === normalized(item.assignedOperatorName))); const overdue = timeline.overdueItems.filter((item) => item.zone === zone).length; return <article key={zone} className="zone-readiness-card"><strong>{zone}</strong><span>{zoneAssignments.length} assigned · {zonePresence.length} present · {overdue} overdue</span><small>{zoneAssignments.map((item) => `${item.roleLabel}: ${item.assignedOperatorName}`).join(" · ") || "No staff assigned"}</small></article>; })}<div className="backup-actions no-print"><button type="button" className="ghost-button compact-button" onClick={() => navigate("staffing")}>Staffing & Zones</button><button type="button" className="ghost-button compact-button" onClick={() => navigate("command-structure")}>Command Structure</button></div></section>}

      {tab === "tasks" && <section className="cockpit-section"><h3>Task Risk</h3>{[["Critical overdue", readiness.taskRisk.criticalOverdue], ["Due in 15 minutes", readiness.taskRisk.dueIn15], ["Due in 30 minutes", readiness.taskRisk.dueIn30], ["Blocked by open role", readiness.taskRisk.blockedByOpenRole], ["Unassigned", readiness.taskRisk.unassigned], ["Completed recently", readiness.taskRisk.completedRecently]].map(([label, items]) => <div key={label} className="risk-group"><h4>{label} ({items.length})</h4>{items.map((task) => <article key={task.id} className="log-row"><strong>{task.title}</strong><span>{task.zone || "all"} · {task.assignedOperatorName || task.assignedRoleKey || "unassigned"}</span>{!["done", "cancelled", "missed"].includes(task.status) && <div className="backup-actions no-print"><button type="button" className="ghost-button compact-button" onClick={() => onTaskStatus?.(task.id, "acknowledged", "")}>Acknowledge</button><button type="button" className="primary-button compact-button" onClick={() => onTaskStatus?.(task.id, "done", "Completed from Event Cockpit")}>Mark done</button></div>}</article>)}</div>)}<button type="button" className="text-button no-print" onClick={() => navigate("tasks")}>Open full Event Task Board</button></section>}

      {tab === "updates" && <section className="cockpit-section"><div className="section-heading static-heading"><div><h3>Live Updates</h3><span>{openUpdates.length} open</span></div><button type="button" className="primary-button compact-button no-print" onClick={() => { setShowUpdateForm(true); window.requestAnimationFrame(() => updateTitleRef.current?.focus()); }}>Add live update</button></div>{showUpdateForm && <form className="cockpit-update-form no-print" onSubmit={submitUpdate}><label>Type<select value={updateForm.updateType} onChange={(event) => setUpdateForm((current) => ({ ...current, updateType: event.target.value }))}>{updatePresets.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Title<input ref={updateTitleRef} value={updateForm.title} onChange={(event) => setUpdateForm((current) => ({ ...current, title: event.target.value }))}/></label><label>Details<textarea rows="3" value={updateForm.details} onChange={(event) => setUpdateForm((current) => ({ ...current, details: event.target.value }))}/></label><label>Zone<select value={updateForm.zone} onChange={(event) => setUpdateForm((current) => ({ ...current, zone: event.target.value }))}>{["all", "cornerbar", "atrium", "workbar", "runners", "bar", "support", "other", "backstage", "project_rooms"].map((zone) => <option key={zone} value={zone}>{zone}</option>)}</select></label><label>Priority<select value={updateForm.priority} onChange={(event) => setUpdateForm((current) => ({ ...current, priority: event.target.value }))}>{["normal", "important", "critical"].map((value) => <option key={value}>{value}</option>)}</select></label><label>Owner role<input value={updateForm.ownerRoleKey} onChange={(event) => setUpdateForm((current) => ({ ...current, ownerRoleKey: event.target.value }))}/></label><label>Occurred time<input type="datetime-local" value={updateForm.occurredAt} onChange={(event) => setUpdateForm((current) => ({ ...current, occurredAt: event.target.value }))}/></label>{["delay", "change"].includes(updateForm.updateType) && <><label>Timeline item title<input placeholder="Presentation" value={updateForm.targetTitle} onChange={(event) => setUpdateForm((current) => ({ ...current, targetTitle: event.target.value }))}/></label><label>New operational time<input type="datetime-local" value={updateForm.operationalTime} onChange={(event) => setUpdateForm((current) => ({ ...current, operationalTime: event.target.value }))}/></label></>}<div className="backup-actions"><button type="submit" className="primary-button compact-button">Save live update</button><button type="button" className="ghost-button compact-button" onClick={() => setShowUpdateForm(false)}>Cancel</button></div></form>}{scopedUpdates.map((update) => <article key={update.id} className={`live-update-row priority-${update.priority}`}><div><strong>{update.title}</strong><span>{update.updateType.replaceAll("_", " ")} · {update.zone} · {update.status}</span><small>{formatTime(update.occurredAt)} · {update.createdByName}</small>{update.details && <p>{update.details}</p>}</div>{canUseOperationalPresets && ["open", "acknowledged"].includes(update.status) && <div className="no-print"><input aria-label={`Resolution note for ${update.title}`} placeholder="Resolution note" value={resolutionNotes[update.id] || ""} onChange={(event) => setResolutionNotes((current) => ({ ...current, [update.id]: event.target.value }))}/><div className="backup-actions"><button type="button" className="ghost-button compact-button" onClick={() => changeUpdateStatus("acknowledged", update)}>Acknowledge</button><button type="button" className="primary-button compact-button" onClick={() => changeUpdateStatus("resolved", update)}>{update.metadata?.timelineOverride ? "Resolve and revert timeline" : "Resolve"}</button>{managerView && <button type="button" className="text-button" onClick={() => changeUpdateStatus("cancelled", update)}>Cancel update</button>}</div></div>}</article>)}</section>}

      {tab === "handover" && <section className="cockpit-section"><h3>Handover Summary</h3><p><strong>Critical tasks:</strong> {handoverPreview.criticalTasks.join(" · ") || "None"}</p><p><strong>Open issues:</strong> {handoverPreview.openIssues.join(" · ") || "None"}</p><p><strong>Next milestones:</strong> {handoverPreview.nextMilestones.join(" · ") || "None"}</p><p><strong>Zone leads:</strong> {handoverPreview.zoneLeads.join(" · ") || "None"}</p>{managerView && <form className="cockpit-handover-form no-print" onSubmit={saveHandover}><label>Receiving person<input value={handoverForm.toName} onChange={(event) => setHandoverForm((current) => ({ ...current, toName: event.target.value }))}/></label><label>Scope<select value={handoverForm.scope} onChange={(event) => setHandoverForm((current) => ({ ...current, scope: event.target.value }))}>{["all", "event_close", "cornerbar", "atrium", "workbar", "runners", "bar", "support", "backstage"].map((value) => <option key={value}>{value}</option>)}</select></label><label>Additional notes<textarea rows="4" value={handoverForm.notes} onChange={(event) => setHandoverForm((current) => ({ ...current, notes: event.target.value }))}/></label><button type="submit" className="primary-button compact-button">Prepare and save handover</button></form>}</section>}

      {tab === "brief" && <section className="cockpit-section event-brief-print"><div className="section-heading static-heading"><div><h3>{managerView ? "Manager Event Brief" : "My Event Brief"}</h3><span>{brief.title}</span></div>{managerView && <button type="button" className="ghost-button compact-button no-print" onClick={() => window.print()}>Print event brief</button>}</div><p>{brief.venue} · {formatRange(eventOperation.startsAt, eventOperation.endsAt)}</p>{managerView ? <><p>Operational window: {formatRange(brief.operationalWindow.prepStartsAt, brief.operationalWindow.closeEndsAt)}</p><p>Guests: {brief.guestCount ?? "Unknown"} ({brief.guestCountSource})</p><p>Zones: {brief.activeZones.join(" · ") || "None"}</p><p>Staffing: {brief.staffing.assigned}/{brief.staffing.recommended} assigned</p><p>Readiness: {brief.readiness.score}% · {brief.readiness.summary}</p><h4>Run of Show</h4>{brief.milestones.map((item) => <p key={item.id}>{formatTime(item.startsAt)} · {item.title} · {item.zone}</p>)}<h4>Assignments</h4>{brief.staffing.assignments.map((item, index) => <p key={`${item.role}-${index}`}>{item.role} · {item.zone} · {item.name}</p>)}<h4>Rig Guides</h4><p>{brief.rigGuides.join(" · ") || "None"}</p></> : <>{brief.roles.map((item) => <p key={`${item.roleKey}-${item.zone}`}><strong>{item.roleLabel}</strong> · {item.zone} · Reports to {item.reportsTo}</p>)}<h4>My tasks</h4>{brief.tasks.map((item) => <p key={item.id}>{item.title} · {item.status}</p>)}<h4>Relevant timeline</h4>{brief.timeline.map((item) => <p key={item.id}>{formatTime(item.startsAt)} · {item.title}</p>)}</>}</section>}

      {managerView && <section className="cockpit-completion"><h3>Ready to close event?</h3><p>{readiness.blockers.length} blockers · {openUpdates.length} open updates · {readiness.taskRisk.criticalOverdue.length} critical overdue tasks</p><label className="no-print">Completion/override reason<textarea rows="2" value={completionReason} onChange={(event) => setCompletionReason(event.target.value)}/></label><div className="backup-actions no-print"><button type="button" className="primary-button compact-button" onClick={() => completeEvent(false)}>Confirm complete</button><button type="button" className="ghost-button compact-button" onClick={() => completeEvent(true)}>Complete with accepted warnings</button><button type="button" className="text-button" onClick={() => setStatus({ type: "pending", message: "Event remains open." })}>Keep event open</button></div></section>}

      <section className="cockpit-section"><h3>Guides and Rigging</h3>{eventRigGuides.filter((guide) => (plan?.rigRefs || []).includes(guide.id) || guide.venueKeys?.some((zone) => timeline.activeZones.includes(zone))).map((guide) => <button key={guide.id} type="button" className="text-button no-print" onClick={() => onOpenGuide?.(guide.id)}>{guide.title}</button>)}</section>
    </section>
  );
}
