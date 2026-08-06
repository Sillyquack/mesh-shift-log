import { useRef, useState } from "react";
import { routineEmployeeRunMutations, routineEmployeeDoubleShiftMutations } from "../api/routineEmployeeClient.js";
import RoutineOfflineState from "./RoutineOfflineState.jsx";
import RoutineConflictPanel from "./RoutineConflictPanel.jsx";

function Collection({ title, items, empty, render }) {
  return <section className="employee-home-section"><header><h2>{title}</h2><span>{items.length}</span></header>{items.length ? <div className="employee-home-list">{items.map(render)}</div> : <p>{empty}</p>}</section>;
}

export default function RoutineEmployeeHome({ home, onOpenRun, onOpenBundle, onOpenHandover, onOpenTransfer, onBack,
  runApi = routineEmployeeRunMutations, doubleShiftApi = routineEmployeeDoubleShiftMutations, onRefresh, pendingOverlay }) {
  const [pending, setPending] = useState(null); const [message, setMessage] = useState(""); const operationKeys = useRef(new Map()); const busy = useRef(false);
  const [conflictConfirmations, setConflictConfirmations] = useState({});
  const [doubleShiftKeys, setDoubleShiftKeys] = useState(() => ({ opening: home.startableTemplates[0]?.routineKey ?? "", closing: home.startableTemplates[1]?.routineKey ?? "" }));
  const execute = async (key, action, payload) => {
    if (busy.current) return; busy.current = true; const idempotencyKey = operationKeys.current.get(key) ?? globalThis.crypto.randomUUID(); operationKeys.current.set(key, idempotencyKey); setPending(key); setMessage("");
    try { const response = await action({ ...payload, idempotencyKey }); if (response?.ok) { operationKeys.current.delete(key); setMessage("Server confirmed"); await onRefresh?.(); const runId = response.data?.run?.id ?? response.data?.workspace?.run?.id; const bundleId = response.data?.bundle?.id ?? response.data?.workspace?.bundle?.id; if (runId) onOpenRun(runId); else if (bundleId) onOpenBundle(bundleId); }
      else setMessage(response?.message ?? "The server rejected this action."); }
    catch (error) { setMessage(`The request outcome is unknown. Retry uses the same key. ${String(error?.message ?? "")}`); }
    finally { busy.current = false; setPending(null); }
  };
  const identity = home.identity; const clock = home.operationalClock; const overlay = pendingOverlay?.entries ?? [];
  return <main className="employee-workspace"><header className="employee-page-header"><button type="button" onClick={onBack}>← Preview Home</button><div><p className="eyebrow">Operations Preview · {home.uiReleaseStage.replaceAll("_", " ")}</p><h1>Today&apos;s routines</h1></div>
    <aside><strong>{identity.displayName}</strong><small>{identity.actorSource === "shared_device_operator" ? `Operator · ${identity.device?.displayName ?? "shared device"}` : `Personal user · ${identity.role}`}</small></aside></header>
    {home.readOnlyPreview && <p className="employee-readonly" role="status">{home.readOnlyMessage ?? "Read-only preview — operational actions are not enabled"}</p>}
    <section className="employee-home-context"><article><span>Operational date</span><strong>{clock.operationalDate ?? "Unavailable"}</strong><small>{clock.timezone ?? "Europe/Oslo"}</small></article>
      <article><span>Server clock</span><strong>{clock.serverNow ? new Date(clock.serverNow).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Unavailable"}</strong><small>Server authoritative</small></article>
      <RoutineOfflineState sync={home.sync} overlay={overlay} /></section>
    <p className="employee-action-result" aria-live="polite">{message}</p>
    {home.emptyStateReason && <section className="employee-empty"><span aria-hidden="true">R2</span><div><h2>No published operational routines</h2><p>Opening, Closing and Event Operations continue in the current shift log.</p></div></section>}
    <Collection title="Current runs" items={home.currentRuns} empty="No current runs are visible." render={(run) => <article key={run.id}><div><strong>{run.routineKey}</strong><small>{run.scopeKey} · {run.status} · template v{run.templateVersionNumber}</small></div>
      <button type="button" onClick={() => onOpenRun(run.id)}>Open run</button></article>} />
    <Collection title="Runs available to join" items={home.joinableRuns} empty="No runs are currently available to join." render={(run) => <article key={run.id}><div><strong>{run.routineKey}</strong><small>{run.status} · {run.operationalDate}</small></div>
      <button type="button" disabled={!run.canJoin || Boolean(pending)} onClick={() => execute(`join:${run.id}`, runApi.joinRoutineRun, { runId: run.id })}>{pending === `join:${run.id}` ? "Joining…" : "Join run"}</button></article>} />
    <Collection title="Start a routine" items={home.startableTemplates} empty="No published templates can be started." render={(template) => <article key={template.templateId}><div><strong>{template.name}</strong><small>{template.routineKey}</small></div>
      <div><button type="button" disabled={!template.action?.allowed || Boolean(pending)} onClick={() => execute(`create:${template.templateId}`, runApi.createOrGetRoutineRun, { routineKey: template.routineKey, scopeKey: "default", operationalDate: clock.operationalDate })}>{pending === `create:${template.templateId}` ? "Checking server…" : "Start or open"}</button>
        {!template.action?.allowed && <small>Ask a shift lead or manager to create this run</small>}</div></article>} />
    <Collection title="Double Shift" items={home.doubleShiftBundles} empty="No Double Shift bundle is visible." render={(bundle) => <article key={bundle.id}><div><strong>Opening → Closing</strong><small>{bundle.status} · {bundle.operationalDate}</small></div><button type="button" onClick={() => onOpenBundle(bundle.id)}>Open Double Shift</button></article>} />
    {home.startableTemplates.length >= 2 && <section className="employee-home-section employee-panel"><header><h2>Start or open Double Shift</h2></header><div className="employee-form-grid">
      <label>Opening routine<select value={doubleShiftKeys.opening} onChange={(event) => setDoubleShiftKeys((current) => ({ ...current, opening: event.target.value }))}>{home.startableTemplates.map((template) => <option key={`opening-${template.templateId}`} value={template.routineKey}>{template.name}</option>)}</select></label>
      <label>Closing routine<select value={doubleShiftKeys.closing} onChange={(event) => setDoubleShiftKeys((current) => ({ ...current, closing: event.target.value }))}>{home.startableTemplates.map((template) => <option key={`closing-${template.templateId}`} value={template.routineKey}>{template.name}</option>)}</select></label></div>
      <button type="button" disabled={!home.operationalAllowed || Boolean(pending) || !doubleShiftKeys.opening || !doubleShiftKeys.closing || doubleShiftKeys.opening === doubleShiftKeys.closing}
        onClick={() => execute("create:double-shift", doubleShiftApi.createOrGet, { openingRoutineKey: doubleShiftKeys.opening, closingRoutineKey: doubleShiftKeys.closing, scopeKey: "default", operationalDate: clock.operationalDate })}>{pending === "create:double-shift" ? "Checking server…" : "Start or open Double Shift"}</button></section>}
    <div className="employee-home-columns"><Collection title="Assigned tasks" items={home.assignedTasks} empty="No tasks assigned." render={(task) => <article key={task.id}><div><strong>{task.title}</strong><small>{task.location} · {task.status}</small></div><button type="button" onClick={() => onOpenRun(task.runId)}>Open</button></article>} />
      <Collection title="Open deviations" items={home.openDeviations} empty="No open deviations." render={(item) => <article key={item.id}><div><strong>{item.category}</strong><small>{item.severity} · {item.status}</small></div></article>} /></div>
    <div className="employee-home-columns"><Collection title="Handovers requiring action" items={home.pendingHandovers} empty="No pending handovers." render={(item) => <article key={item.id}><div><strong>{item.handoverType}</strong><small>{item.status}</small></div><button type="button" onClick={() => onOpenHandover?.(item.id)}>Open handover</button></article>} />
      <Collection title="Transfers requiring action" items={[...home.pendingTransfers, ...home.eventTransferRequests]} empty="No pending transfers." render={(item) => <article key={item.id}><div><strong>{item.targetType === "event_operation" || item.targetEventId ? "Event transfer" : "Routine transfer"}</strong><small>{item.status} · {item.reason}</small></div><button type="button" onClick={() => onOpenTransfer?.(item.id)}>Open transfer</button></article>} /></div>
    {overlay.filter((entry) => entry.state === "conflict").map((conflict) => <RoutineConflictPanel key={conflict.operationId} conflict={conflict}
      resolutionConfirmed={conflictConfirmations[conflict.operationId] === true} onResolutionConfirmed={(checked) => setConflictConfirmations((current) => ({ ...current, [conflict.operationId]: checked }))}
      onRefresh={async () => { await onRefresh?.(); await pendingOverlay?.refresh?.(); setMessage("Server state refreshed. Your local draft is unchanged."); }}
      onKeep={() => setMessage("Local draft kept. No server state was changed.")}
      onDiscard={async () => { await pendingOverlay?.discard?.(conflict.operationId); setMessage("Local draft discarded by explicit request."); }}
      onCreateNew={async () => {
        if (conflict.taskId) { if (conflict.runId) onOpenRun(conflict.runId); setMessage("Open the affected task and explicitly resolve its current values before creating the replacement operation."); return; }
        const run = home.currentRuns.find((candidate) => candidate.id === conflict.runId);
        const response = await pendingOverlay?.createAfterConflict?.(conflict.operationId,
          { ...conflict.localDraft, baseRunRevision: run?.revision ?? conflict.serverRevision }, { runId: conflict.runId });
        setMessage(response?.ok ? "Replacement finish intent queued after explicit manual resolution. The run remains unfinished until server confirmation."
          : response?.message ?? "The replacement operation was not created; your local draft is unchanged.");
      }} />)}
  </main>;
}
