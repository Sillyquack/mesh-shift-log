import { useMemo, useState } from "react";
import { useRoutineRunWorkspace } from "../hooks/useRoutineRunWorkspace.js";
import { useRoutineRunActions } from "../hooks/useRoutineRunActions.js";
import RoutineRunHeader from "./RoutineRunHeader.jsx";
import RoutineRunProgress from "./RoutineRunProgress.jsx";
import RoutineTaskGroups from "./RoutineTaskGroups.jsx";
import RoutineRunFinishPanel from "./RoutineRunFinishPanel.jsx";
import RoutineVerificationPanel from "./RoutineVerificationPanel.jsx";
import RoutineHandoverPanel from "./RoutineHandoverPanel.jsx";
import RoutineTransferPanel from "./RoutineTransferPanel.jsx";
import RoutineCriticalReauthDialog from "./RoutineCriticalReauthDialog.jsx";
import RoutineHandoverCreatePanel from "./RoutineHandoverCreatePanel.jsx";

export default function RoutineRunWorkspace({ runId, onBack, loader, subscribe, refreshSignal, taskLoader, runApi, taskApi, reauthApi, overlay, online }) {
  const workspace = useRoutineRunWorkspace(runId, { loader, subscribe, refreshSignal }); const actions = useRoutineRunActions({ api: runApi, onConfirmed: workspace.refresh });
  const [reauthRetry, setReauthRetry] = useState(null); const [boundaryResult, setBoundaryResult] = useState(null);
  const context = workspace.data; const tasks = useMemo(() => context?.run?.tasks ?? [], [context]);
  if (!context && ["loading", "idle"].includes(workspace.status)) return <main className="employee-workspace employee-loading" role="status">Loading run and server action context…</main>;
  if (!context) return <main className="employee-workspace"><button type="button" onClick={onBack}>← Operations</button><p role="alert">This run could not be loaded. Local drafts were not changed.</p></main>;
  const execute = async (name, payload) => {
    if (context.criticalReauthRequired && ["completeRunVerification", "finishRoutineRun"].includes(name)) {
      setReauthRetry({ name, payload });
      return { ok: false, mode: "operator_auth_required" };
    }
    if (name === "finishRoutineRun" && !online) {
      const queued = await overlay?.queueRunFinish?.({ runId: payload.runId, baseRunRevision: payload.expectedRevision });
      const result = queued?.ok ? { ok: false, mode: "queued", message: "Finish intent queued — run remains server-confirmed and unfinished." } : queued;
      setBoundaryResult(result); return result;
    }
    const response = await actions.execute(name, payload);
    if (name === "finishRoutineRun" && response?.mode === "network_error") {
      const queued = await overlay?.queueRunFinish?.({ runId: payload.runId, baseRunRevision: payload.expectedRevision });
      setBoundaryResult(queued?.ok ? { ok: false, mode: "queued", message: "Finish intent queued — run remains server-confirmed and unfinished." } : queued);
      return queued;
    }
    return response;
  };
  return <main className="employee-workspace"><RoutineRunHeader run={context.run} participant={context.participant} actorRole={context.actorRole} onBack={onBack} />
    {context.readOnlyPreview && <p className="employee-readonly" role="status">Read-only preview — operational actions are not enabled</p>}
    {context.actions.canJoin?.allowed && <div className="employee-run-boundary-action"><button type="button" className="employee-primary" disabled={actions.pending} onClick={() => execute("joinRoutineRun", { runId: context.run?.id ?? context.run?.run?.id })}>Join this run</button></div>}
    {context.actions.canStartRun?.allowed && <div className="employee-run-boundary-action"><button type="button" className="employee-primary" disabled={actions.pending} onClick={() => execute("startRoutineRun", { runId: context.run?.id ?? context.run?.run?.id, expectedRevision: context.run?.revision ?? context.run?.run?.revision })}>Start run</button></div>}
    <RoutineRunProgress progress={context.progress} sync={{ pendingCount: overlay?.pendingCount ?? 0 }} />
    <RoutineTaskGroups tasks={tasks} onConfirmed={workspace.refresh} taskLoader={taskLoader} actionApi={taskApi} reauthApi={reauthApi} pendingOverlay={overlay} online={online} />
    {(context.currentVerifications?.run ?? context.run?.runVerifications ?? []).length > 0 && <section className="employee-panel"><h2>Run verification history</h2>
      <ul>{(context.currentVerifications?.run ?? context.run?.runVerifications ?? []).map((verification) => <li key={verification.id}><strong>{verification.verification_type ?? verification.verificationType}</strong>
        <span> · {verification.result} · revision {verification.run_revision_verified ?? verification.runRevision}</span></li>)}</ul></section>}
    {(context.runVerificationOptions ?? []).map((option) => <RoutineVerificationPanel key={option.verificationType} title={`${String(option.verificationType).replaceAll("_", " ")} run verification`}
      revision={context.run?.revision ?? context.run?.run?.revision} policy={option.verificationType} executor={context.participant?.displayName}
      canVerify={option.action} pending={actions.pending === "completeRunVerification"} requiredTasks={option.tasks}
      onVerify={(values) => execute("completeRunVerification", { runId: context.run?.id ?? context.run?.run?.id,
        expectedRunRevision: context.run?.revision ?? context.run?.run?.revision, verificationType: option.verificationType,
        items: option.tasks.map((task) => ({ taskId: task.taskId, required: task.required !== false, result: values.result,
          physicalCheckConfirmed: values.physicalRecheckConfirmed, note: values.note })), result: values.result, note: values.note })} />)}
    {(context.handoverRequirements ?? []).map((handover) => <RoutineHandoverPanel key={handover.id} handoverId={handover.id} />)}
    {context.actions.canCreateHandover?.allowed && <RoutineHandoverCreatePanel runId={context.run?.id ?? context.run?.run?.id} onCreated={workspace.refresh} />}
    {(context.pendingTransfers ?? []).map((transfer) => <RoutineTransferPanel key={transfer.id} transferId={transfer.id} reauthApi={reauthApi} />)}
    <RoutineRunFinishPanel context={context} pending={actions.pending} onAction={execute} />
    <p className="employee-action-result" aria-live="polite">{boundaryResult?.message ?? (actions.result?.ok ? "Server confirmed" : actions.result?.message)}</p>
    {reauthRetry && <RoutineCriticalReauthDialog api={reauthApi} onClose={() => setReauthRetry(null)} onAuthenticated={async () => {
      const retry = reauthRetry; setReauthRetry(null); await actions.execute(retry.name, retry.payload);
    }} />}</main>;
}
