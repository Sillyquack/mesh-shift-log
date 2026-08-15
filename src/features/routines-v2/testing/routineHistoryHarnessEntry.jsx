import React from "react";
import { createRoot } from "react-dom/client";
import "../../../styles.css";
import "../../../design-system/MeshExperienceSystem.css";
import "../../../experience/RoutineStudioExperience.css";
import "../components/RoutineEngineShell.css";
import "../manager/RoutineManager.css";
import RoutineChunkErrorBoundary from "../components/RoutineChunkErrorBoundary.jsx";
import RoutineHistoryWorkspace from "../history/RoutineHistoryWorkspace.jsx";
import RoutineHistoryRunDetail from "../history/RoutineHistoryRunDetail.jsx";
import RoutineHistoryTaskDetail from "../history/RoutineHistoryTaskDetail.jsx";
import RoutineHistoryCorrectionDialog from "../history/RoutineHistoryCorrectionDialog.jsx";
import RoutineManagerOverrideDialog from "../history/RoutineManagerOverrideDialog.jsx";
import RoutineLegacyHistoryPanel from "../history/RoutineLegacyHistoryPanel.jsx";
import RoutineManagerReviewDashboard from "../history/RoutineManagerReviewDashboard.jsx";
import RoutineReleaseGate from "../history/RoutineReleaseGate.jsx";
import RoutineOfflineState from "../employee/RoutineOfflineState.jsx";
import { getRoutineLegacyHistorySummary, getUnifiedRoutineHistory, listRoutineV2History } from "../api/routineHistoryClient.js";
import { getRoutinePilotReadiness, setRoutinePilotNewWorkPaused } from "../api/routineReleaseClient.js";
import { setRoutineEngineMode } from "../api/routineApplicationClient.js";
import { ROUTINE_E2E_HISTORY_FIXTURE as HISTORY_FIXTURE } from "./routineE2EFixtureContract.js";

const search = new URLSearchParams(location.search);
const scenario = search.get("scenario") || "manager-history-desktop";
const liveBackend = search.get("live") === "1";
const uuid = (tail) => `94000000-0000-4000-8000-${String(tail).padStart(12, "0")}`;
const entries = [
  { id: uuid(1), sourceSystem: "routine_engine_v2", sourceConfidence: "authoritative", operationalDate: "2026-08-06", routineKey: "opening", scopeKey: "main_bar", status: "finished", templateVersionNumber: 3, participantCount: 2, deviationCount: 1, hasMismatch: true },
  { id: uuid(2), sourceSystem: "routine_engine_v2", sourceConfidence: "authoritative", operationalDate: "2026-08-05", routineKey: "closing", scopeKey: "main_bar", status: "finished", templateVersionNumber: 3, participantCount: 2, deviationCount: 0, hasMismatch: false },
];
const participants = [{ id: uuid(11), display_name_snapshot: "Mina Larsen", identity_type: "personal_profile" }, { id: uuid(12), display_name_snapshot: "Nora Operator", identity_type: "shared_device_operator", operator_id: uuid(13) }];
const runDetail = { sourceSystem: "routine_engine_v2", sourceConfidence: "authoritative", run: { id: uuid(1), routine_key: "Opening", operational_date: "2026-08-06", status: "finished", revision: 18, template_version_number_snapshot: 3, template_content_hash_snapshot: "a".repeat(64), snapshot_hash: "b".repeat(64), current_finish_sequence: 2 }, participants,
  actions: { canCreateManagerOverride: true, canRecordCorrection: true, canReopenRun: true, canCancelRun: false, reopenTaskIds: [], assignDeviationIds: [], mitigateDeviationIds: [], resolveDeviationIds: [], cancelDeviationIds: [] },
  tasks: [{ id: uuid(21), revision: 7, title_snapshot: "Inspect north entrance", task_key_snapshot: "T-01", status: "completed", outcome: "completed_after_correction" }, { id: uuid(22), revision: 4, title_snapshot: "Confirm service-ready coffee station", task_key_snapshot: "T-02", status: "completed", outcome: "standard_met" }],
  events: [{ id: uuid(31), event_type: "run_started", server_created_at: "2026-08-06T08:02:00Z", details: "Server-confirmed start" }, { id: uuid(32), event_type: "task_completed", server_created_at: "2026-08-06T09:42:00Z", details: "Physical recheck confirmed" }, { id: uuid(33), event_type: "run_finished", server_created_at: "2026-08-06T10:03:00Z", details: "Finish sequence 2" }],
  deviations: [{ id: uuid(41), category: "security", severity: "important", status: "resolved" }], managerOverrides: [{ id: uuid(51), override_type: "verification", reason: "Supervised temporary acceptance", remaining_risk: "Low until latch replacement", temporary_measure: "Shift lead checks every hour", follow_up_due_at: "2026-08-07T10:00:00Z", created_at: "2026-08-06T09:00:00Z" }],
  taskVerifications: [], runVerifications: [], handovers: [], transfers: [], deliveries: [{ id: uuid(61), source_finish_sequence: 2, delivery_status: "current" }], comparisons: [{ id: uuid(71), comparison_sequence: 2, comparison_result: "mismatch", reconciliation_status: "resolved" }], doubleShift: [{ phase: "opening", bundle: { id: uuid(81), status: "completed", operational_date: "2026-08-06" } }], corrections: [{ id: uuid(91), field_or_claim: "Door result", reason: "Corrected after physical recheck", created_at: "2026-08-06T09:50:00Z" }], syncEvidence: [{ eventId: uuid(31), actorSource: "shared_device_operator", clientInstanceId: uuid(99), serverCreatedAt: "2026-08-06T08:02:00Z" }] };
const taskDetail = { sourceSystem: "routine_engine_v2", task: { id: uuid(21), run_id: uuid(1), title_snapshot: "Inspect north entrance", status: "completed" }, items: [{ id: uuid(101), label_snapshot: "Latch fully seated", status: "completed" }], events: runDetail.events.slice(1, 2), deviations: runDetail.deviations, managerOverrides: runDetail.managerOverrides, verifications: [], corrections: runDetail.corrections };
const legacySummary = { sourceSystem: "legacy_shift_log", sourceConfidence: "legacy_record_only", unscopedLegacyCount: 7, automaticAssignment: false, detailsForUnscopedRows: false };
const legacyItems = [{ id: uuid(201), sourceSystem: "legacy_shift_log", operationalDate: "2026-08-04", recordType: "shift_session", title: "Legacy Opening", status: "completed", availableFields: { displayName: "Legacy shift lead" }, unavailableFields: ["templateVersion", "snapshotHash", "immutableEventTimeline"] }];
const categories = Object.fromEntries(["databaseFoundation", "security", "releaseContract", "operationalTemplates", "templateValidation", "locationsAndRoutes", "standards", "referenceImages", "operatorsAndDevices", "pilotMemberships", "realtimeAndSync", "storage", "operationalContent", "legacySafety", "endToEndVerification"].map((key, index) => [key, { ready: ![3, 12, 14].includes(index), blockers: [3, 12, 14].includes(index) ? [`${key} requires approved disposable evidence.`] : [], warnings: key === "referenceImages" ? ["2 reference placeholders remain."] : key === "legacySafety" ? ["7 unscoped legacy rows require manual review."] : [], evidence: { checked: true, category: key }, evidenceHash: String(index).padStart(64, "0") }]));
const blockedReadiness = { ready: false, blockers: ["Missing approved Opening, Closing and Double Shift content.", "Chromium and WebKit attestation required."], warnings: ["2 reference placeholders remain.", "7 unscoped legacy rows require manual review."], categories, readinessHash: "c".repeat(64), generatedAt: "2026-08-06T11:00:00Z", currentStage: "staff_preview", currentMode: "shadow", settingsRevision: 9, pilotNewWorkPaused: false };
const readyReadiness = { ...blockedReadiness, ready: true, blockers: [], categories: Object.fromEntries(Object.entries(categories).map(([key, value]) => [key, { ...value, ready: true, blockers: [] }])) };
const noop = () => {};
const success = async () => ({ ok: true });

function Shell({ title, children }) { return <div className="routine-shell"><aside className="rm-review-fixture" role="note"><strong>Review fixture</strong><span>Deterministic local evidence. No production data or controls are active.</span></aside><main className="rm-workspace rm-experience-workspace"><header className="rm-topbar"><div><p className="eyebrow">Release review fixture · {scenario}</p><h1>{title}</h1></div><button type="button">Back to preview home</button></header><section className="rm-panel">{children}</section></main></div>; }
function History({ manager = true, source = entries }) { return <Shell title={manager ? "Manager Control Center" : "Operations Preview"}><RoutineHistoryWorkspace manager={manager} loader={async () => ({ sourceSystem: "routine_engine_v2", items: source, hasMore: false })} runLoader={async () => runDetail} taskLoader={async () => taskDetail} legacySummaryLoader={async () => legacySummary} legacyLoader={async () => ({ items: legacyItems })} /></Shell>; }
function Run({ mismatch = false, doubleShift = false }) { const value = { ...runDetail, comparisons: mismatch ? runDetail.comparisons : [{ ...runDetail.comparisons[0], comparison_result: "matched", reconciliation_status: "not_required" }], doubleShift: doubleShift ? runDetail.doubleShift : [] }; return <Shell title="Routine History"><RoutineHistoryRunDetail detail={value} mutations={new Proxy({}, { get: () => success })} onBack={noop} onOpenTask={noop} onCorrection={noop} onOverride={noop} /></Shell>; }
function Dialog({ type }) { const [open, setOpen] = React.useState(false); const label = type === "override" ? "Open manager override dialog" : "Open history correction dialog"; return <Shell title="Manager History"><button type="button" onClick={() => setOpen(true)}>{label}</button>{open && (type === "override" ? <RoutineManagerOverrideDialog run={runDetail.run} participants={participants} api={success} onClose={() => setOpen(false)} /> : <RoutineHistoryCorrectionDialog runId={runDetail.run.id} entity={{ type: "task", id: uuid(21) }} api={success} onClose={() => setOpen(false)} />)}</Shell>; }
function Legacy({ unscoped = true }) { return <Shell title="Unified History"><RoutineLegacyHistoryPanel summary={{ ...legacySummary, unscopedLegacyCount: unscoped ? 7 : 0 }} items={legacyItems} /></Shell>; }
function Release({ ready = false, paused = false, stale = false }) { const value = { ...(ready ? readyReadiness : blockedReadiness), pilotNewWorkPaused: paused, currentMode: paused ? "pilot" : "shadow" }; return <Shell title="Manager Control Center"><RoutineReleaseGate loader={async () => value} promotionApi={stale ? async () => { throw Object.assign(new Error("Stale readiness hash"), { kind: "stale" }); } : success} pauseApi={success} /></Shell>; }
function Review() { return <Shell title="Manager Control Center"><RoutineManagerReviewDashboard loader={async () => ({ runs: 14, finishedRuns: 11, reopenedRuns: 2, openDeviations: 3, mismatches: 1, corrections: 2 })} followupLoader={async () => [{ id: uuid(301), status: "overdue", overrideType: "verification", reason: "Replace north entrance latch", followUpDueAt: "2026-08-05T10:00:00Z" }]} correctionLoader={async () => runDetail.corrections} /></Shell>; }
function Evidence({ mode }) { return <Shell title={mode === "pause" ? "Pilot pause" : "Sync health"}>{mode === "pause" ? <><div className="rh-callout warning"><strong>New pilot work paused</strong><p>Active run 9400…0001 can continue and finish. New runs, bundles and scheduled starts are blocked.</p></div><Run /></> : <RoutineOfflineState sync={{ transport: mode === "cursor" ? "cursor_polling" : "postgres_realtime", status: mode === "offline" ? "disconnected" : "online" }} overlay={mode === "offline" ? [{ operationId: "local-1", label: "Physical recheck draft", state: "queued", serverConfirmed: false }] : []} />}</Shell>; }
function Milestones({ rollback = false }) { const labels = rollback ? ["New work paused", "Active run finished", "Double Shift completed", "History fingerprint stable", "Pilot → shadow accepted"] : ["Foundation configured", "Opening/Closing batch published", "Memberships installed", "Chromium + WebKit attested", "pilot_ready attested", "Disposable pilot activated", "Claim race: one winner", "Offline draft retained", "Opening → Closing delivered", "DS01–DS04 complete", "History complete"]; return <Shell title={rollback ? "Disposable rollback to shadow" : "Disposable full pilot flow"}><ol className="rh-timeline" aria-label="Disposable pilot verification milestones">{labels.map((label, index) => <li key={label} className="kind-event"><span className="rh-timeline-dot" aria-hidden="true" /><div><strong>{label}</strong><p>PASS · isolated disposable backend evidence {index + 1}</p></div></li>)}</ol></Shell>; }
function ThrowChunk() { throw new TypeError("Failed to fetch dynamically imported module: history-new-hash.js"); }

function LiveHistory({ manager }) {
  const [probe, setProbe] = React.useState({ status: "loading", count: 0, runIds: [] });
  React.useEffect(() => {
    let active = true;
    listRoutineV2History({ dateFrom: HISTORY_FIXTURE.dateFrom, dateTo: HISTORY_FIXTURE.dateTo, limit: 100 })
      .then((value) => { if (active) setProbe({ status: "ready", count: value.items.length, runIds: value.items.map((item) => item.id) }); })
      .catch((error) => { if (active) setProbe({ status: "error", count: 0, runIds: [], message: String(error?.message || error) }); });
    return () => { active = false; };
  }, []);
  if (probe.status === "loading") return <Shell title={manager ? "Manager History" : "My history"}><p role="status">Connecting to disposable RPC backend…</p></Shell>;
  if (probe.status === "error") return <Shell title={manager ? "Manager History" : "My history"}><p role="alert">Disposable backend round-trip failed: {probe.message}</p></Shell>;
  return <Shell title={manager ? "Manager History" : "My history"}><p role="status" data-live-backend="passed" data-live-count={probe.count} data-live-run-ids={probe.runIds.join(",")} data-live-date-from={HISTORY_FIXTURE.dateFrom} data-live-date-to={HISTORY_FIXTURE.dateTo}>Disposable backend round-trip passed · {probe.count} scoped run records.</p><RoutineHistoryWorkspace manager={manager} /></Shell>;
}

function LivePilotEvidence({ rollback = false }) {
  const [evidence, setEvidence] = React.useState({ status: "loading", value: null });
  React.useEffect(() => {
    let active = true;
    (async () => {
      const readiness = await getRoutinePilotReadiness();
      const replay = rollback
        ? await setRoutinePilotNewWorkPaused({ paused: false, reason: "Disposable pause verification complete.", expectedRevision: readiness.settingsRevision - 2, idempotencyKey: "4f100000-0000-4000-8000-000000000010" })
        : await setRoutineEngineMode({ mode: "pilot", expectedRevision: readiness.settingsRevision - 4, reason: "Disposable pilot activation only.", idempotencyKey: "4f100000-0000-4000-8000-000000000007" });
      if (!replay.idempotentReplay) throw new Error("Disposable mutation replay was not idempotent.");
      const [history, unified, legacy] = await Promise.all([
        listRoutineV2History({ dateFrom: HISTORY_FIXTURE.managerDateFrom, dateTo: HISTORY_FIXTURE.managerDateTo, limit: 100 }),
        getUnifiedRoutineHistory({ dateFrom: HISTORY_FIXTURE.managerDateFrom, dateTo: HISTORY_FIXTURE.managerDateTo, limit: 100 }),
        getRoutineLegacyHistorySummary(),
      ]);
      if (active) setEvidence({ status: "ready", value: { readiness, history, unified, legacy, replay } });
    })().catch(() => { if (active) setEvidence({ status: "error", value: null }); });
    return () => { active = false; };
  }, []);
  if (evidence.status === "loading") return <Shell title="Disposable pilot evidence"><p role="status">Reading disposable pilot evidence through production clients…</p></Shell>;
  if (evidence.status === "error") return <Shell title="Disposable pilot evidence"><p role="alert">Disposable backend round-trip failed.</p></Shell>;
  const { readiness, history, unified, legacy } = evidence.value;
  const milestones = rollback
    ? [`Current mode: ${readiness.currentMode}`, `Release stage retained: ${readiness.currentStage}`, `New-work pause: ${readiness.pilotNewWorkPaused ? "on" : "off"}`, `Immutable history rows: ${history.items.length}`, `Unified source rows: ${unified.items?.length || 0}`]
    : [`Readiness hash: ${readiness.readinessHash.slice(0, 12)}…`, `Current release stage: ${readiness.currentStage}`, `Current mode after disposable rollback: ${readiness.currentMode}`, `Scoped v2 history rows: ${history.items.length}`, `Unscoped legacy aggregate: ${legacy.unscopedLegacyCount}`];
  return <Shell title={rollback ? "Disposable rollback to shadow" : "Disposable full pilot flow"}>
    <p role="status" data-live-backend="passed" data-live-write-replay="passed">Disposable backend round-trip and idempotent mutation replay passed through the production Routine Engine clients.</p>
    <ol className="rh-timeline" aria-label="Disposable pilot verification milestones">{milestones.map((label) => <li key={label} className="kind-event"><span className="rh-timeline-dot" aria-hidden="true" /><div><strong>{label}</strong><p>PASS · server-authoritative disposable evidence</p></div></li>)}</ol>
    {rollback ? <RoutineReleaseGate loader={getRoutinePilotReadiness} /> : <RoutineHistoryWorkspace manager />}
  </Shell>;
}

function Harness() {
  if (liveBackend && scenario === "staff-my-history") return <LiveHistory manager={false} />;
  if (liveBackend && scenario === "shared-operator-history") return <LiveHistory manager={false} />;
  if (liveBackend && scenario === "disposable-full-pilot-flow") return <LivePilotEvidence />;
  if (liveBackend && scenario === "disposable-rollback-shadow") return <LivePilotEvidence rollback />;
  if (["manager-history-desktop", "manager-history-mobile", "mobile-320", "mobile-390", "dark-mode", "zoom-200", "keyboard-only", "reduced-motion", "legacy-back-navigation"].includes(scenario)) return <History />;
  if (scenario === "staff-my-history") return <History manager={false} source={entries.slice(0, 1)} />;
  if (scenario === "shared-operator-history") return <History manager={false} source={[{ ...entries[0], participantCount: 1 }]} />;
  if (scenario === "run-detail" || scenario === "delivery-evidence") return <Run />;
  if (scenario === "task-timeline") return <Shell title="Task History"><RoutineHistoryTaskDetail detail={taskDetail} onBack={noop} /></Shell>;
  if (["mismatch-comparison", "reconciliation-history"].includes(scenario)) return <Run mismatch />;
  if (scenario === "double-shift-history") return <Run doubleShift />;
  if (scenario === "manager-override-dialog") return <Dialog type="override" />;
  if (scenario === "override-follow-up") return <Review />;
  if (scenario === "history-correction-dialog") return <Dialog type="correction" />;
  if (scenario === "legacy-source-label") return <Legacy unscoped={false} />;
  if (scenario === "unscoped-legacy-warning" || scenario === "unified-history") return <Legacy />;
  if (["release-readiness-blocked", "readiness-details"].includes(scenario)) return <Release />;
  if (scenario === "pilot-attestation-dialog") return <Release ready />;
  if (scenario === "stale-readiness-error") return <Release ready stale />;
  if (scenario === "pilot-pause-control") return <Release ready paused />;
  if (scenario === "active-work-pause-state") return <Evidence mode="pause" />;
  if (scenario === "sync-health") return <Evidence mode="cursor" />;
  if (scenario === "chunk-load-recovery") return <RoutineChunkErrorBoundary><ThrowChunk /></RoutineChunkErrorBoundary>;
  if (scenario === "disposable-full-pilot-flow") return <Milestones />;
  if (scenario === "disposable-rollback-shadow") return <Milestones rollback />;
  return <Evidence mode="offline" />;
}

createRoot(document.getElementById("root")).render(<Harness />);
