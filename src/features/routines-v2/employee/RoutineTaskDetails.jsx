import { useMemo, useState } from "react";
import { useRoutineTaskAction } from "../hooks/useRoutineTaskAction.js";
import RoutineTaskItemControl from "./RoutineTaskItemControl.jsx";
import RoutineInitialAssessmentPanel from "./RoutineInitialAssessmentPanel.jsx";
import RoutineTaskActionBar from "./RoutineTaskActionBar.jsx";
import RoutineDeviationDialog from "./RoutineDeviationDialog.jsx";
import RoutineDeviationActions from "./RoutineDeviationActions.jsx";
import RoutineNotApplicableDialog from "./RoutineNotApplicableDialog.jsx";
import RoutineCompletionDialog from "./RoutineCompletionDialog.jsx";
import RoutineCriticalReauthDialog from "./RoutineCriticalReauthDialog.jsx";
import RoutineReferenceInline from "./RoutineReferenceInline.jsx";
import RoutinePreviousDeliveryCard from "./RoutinePreviousDeliveryCard.jsx";
import RoutineVerificationPanel from "./RoutineVerificationPanel.jsx";
import RoutineTransferProposalDialog from "./RoutineTransferProposalDialog.jsx";
import RoutineConflictPanel from "./RoutineConflictPanel.jsx";
import { routineItemDraftValue, routineItemMutationValue } from "../data/routineTaskViewModel.js";

export default function RoutineTaskDetails({ context, onConfirmed, online = globalThis.navigator?.onLine !== false, actionApi, reauthApi, pendingOverlay }) {
  const task = context.task; const action = useRoutineTaskAction({ api: actionApi, onConfirmed });
  const conflict = pendingOverlay?.entries?.find((entry) => entry.state === "conflict" && entry.taskId === task.id) ?? null;
  const serverItemDrafts = () => Object.fromEntries((context.items ?? []).map((item) => [item.id, routineItemDraftValue(item)]));
  const [itemDrafts, setItemDrafts] = useState(() => Object.fromEntries((context.items ?? []).map((item) => {
    const local = conflict?.localDraft?.itemUpdates?.find((update) => update.taskItemId === item.id);
    return [item.id, local ? routineItemDraftValue({ ...item, value_json: local.value }) : routineItemDraftValue(item)];
  })));
  const [comment, setComment] = useState(""); const [dialog, setDialog] = useState(null); const [retry, setRetry] = useState(null); const [queueResult, setQueueResult] = useState(null);
  const [resolutionConfirmed, setResolutionConfirmed] = useState(false); const [conflictPending, setConflictPending] = useState(false);
  const payload = useMemo(() => ({ taskId: task.id, expectedRevision: task.revision }), [task.id, task.revision]);
  const queue = async (name, extra) => {
    const finalActions = { updateRoutineTaskItem: "save_progress", addRoutineTaskComment: "save_progress", pauseRoutineTask: "pause",
      blockRoutineTask: "block", markNotApplicable: "not_applicable", completeRoutineTask: "complete" };
    const finalAction = finalActions[name]; if (!finalAction || !pendingOverlay?.queueTaskBundle) return null;
    const policy = context.offlinePolicy ?? {}; const eligible = name === "addRoutineTaskComment" ? policy.commentQueueAllowed
      : name === "completeRoutineTask" ? policy.completionQueueAllowed
        : name === "markNotApplicable" ? !policy.timedNotApplicableOnlineOnly : policy.draftItemsAllowed;
    if (!eligible) return { ok: false, mode: "offline_rejected", message: "This action requires an online server confirmation." };
    const changedItems = (context.items ?? []).filter((item) => name === "updateRoutineTaskItem" ? item.id === extra.taskItemId
      : routineItemDraftValue(item) !== itemDrafts[item.id]).map((item) => ({ taskItemId: item.id, baseRevision: item.revision,
        status: "completed", value: routineItemMutationValue(item, itemDrafts[item.id]), resultCode: null, reason: null }));
    const bundle = { taskId: task.id, baseTaskRevision: task.revision, clientRecordedAt: new Date().toISOString(), initialAssessment: null,
      itemUpdates: changedItems, comments: name === "addRoutineTaskComment" ? [extra.comment] : [], finalAction,
      pauseReason: name === "pauseRoutineTask" ? extra.reason : null,
      block: name === "blockRoutineTask" ? { category: extra.category, reasonCode: extra.reasonCode, details: extra.details,
        severity: extra.severity, dueAt: extra.dueAt ?? null } : null,
      notApplicableReason: name === "markNotApplicable" ? extra.reason : null,
      completionNote: name === "completeRoutineTask" ? extra.completionNote ?? null : null,
      criticalConfirmation: name === "completeRoutineTask" && extra.criticalConfirmation === true };
    const response = await pendingOverlay.queueTaskBundle({ payload: bundle, runId: task.run_id ?? task.runId,
      timed: ["completeRoutineTask","markNotApplicable"].includes(name) && !eligible, critical: context.criticality === "critical" });
    setQueueResult(response?.ok ? { ok: false, mode: "queued", message: "Queued locally — awaiting a server receipt." } : response);
    return response?.ok ? { ok: false, mode: "queued", message: "Queued locally — awaiting a server receipt." } : response;
  };
  const run = async (name, extra = {}) => {
    const hasChangedItems = name === "completeRoutineTask" && (context.items ?? []).some((item) => routineItemDraftValue(item) !== itemDrafts[item.id]);
    if (hasChangedItems) { const queued = await queue(name, extra); return queued ?? { ok: false, mode: "offline_rejected",
      message: "Save changed items before this server-confirmed completion." }; }
    if (!online) { const queued = await queue(name, extra); return queued ?? { ok: false, mode: "offline_rejected", message: "Reconnect to perform this action." }; }
    const response = await action.run(name, { ...payload, ...extra });
    if (response?.ok && name === "addRoutineTaskComment") setComment("");
    if (!response?.ok && response?.mode === "network_error") return (await queue(name, extra)) ?? response;
    if (!response?.ok && response?.mode === "operator_auth_required") setRetry({ name, extra });
    return response;
  };
  const saveItem = async (item) => run("updateRoutineTaskItem", { taskItemId: item.id, expectedRevision: item.revision,
    value: routineItemMutationValue(item, itemDrafts[item.id]), status: "completed" });
  return <div className="employee-task-details"><p className="employee-done-when"><strong>Done when</strong>{task.done_when_snapshot ?? task.completion_criteria_snapshot ?? "The server validates all required work."}</p>
    {conflict && <RoutineConflictPanel conflict={conflict} pending={conflictPending} resolutionConfirmed={resolutionConfirmed} onResolutionConfirmed={setResolutionConfirmed}
      onRefresh={async () => { setConflictPending(true); try { await onConfirmed?.(); await pendingOverlay?.refresh?.(); setQueueResult({ message: "Server state refreshed. Local inputs are preserved for comparison." }); } finally { setConflictPending(false); } }}
      onKeep={() => setQueueResult({ message: "Local draft kept. No server state was changed." })}
      onDiscard={async () => { setConflictPending(true); try { await pendingOverlay?.discard?.(conflict.operationId); setItemDrafts(serverItemDrafts()); setComment(""); setQueueResult({ message: "Local draft discarded by explicit request." }); } finally { setConflictPending(false); } }}
      onCreateNew={async () => { setConflictPending(true); try {
        const original = conflict.localDraft; const itemUpdates = (original.itemUpdates ?? []).map((update) => {
          const item = (context.items ?? []).find((candidate) => candidate.id === update.taskItemId);
          return item ? { ...update, baseRevision: item.revision, value: routineItemMutationValue(item, itemDrafts[item.id]) } : update;
        });
        const response = await pendingOverlay?.createAfterConflict?.(conflict.operationId,
          { ...original, baseTaskRevision: task.revision, itemUpdates }, { runId: task.run_id ?? task.runId,
            timed: original.finalAction === "complete" ? context.offlinePolicy?.timedCompletionOnlineOnly === true
              : original.finalAction === "not_applicable" && context.offlinePolicy?.timedNotApplicableOnlineOnly === true,
            actorSource: context.identity?.actorSource, effectiveOperatorId: context.identity?.effectiveOperatorId,
            critical: context.criticality === "critical" });
        setQueueResult(response?.ok ? { message: "Replacement operation queued after explicit manual resolution." }
          : { message: response?.message ?? "The replacement operation was not created; your draft is unchanged." });
        if (response?.ok) setResolutionConfirmed(false);
      } finally { setConflictPending(false); } }} />}
    <RoutinePreviousDeliveryCard delivery={context.previousDelivery} comparison={context.comparison} />
    {(context.activeDeviations ?? []).length > 0 && <section className="employee-deviations"><h3>Active deviations</h3>{context.activeDeviations.map((deviation, index) => <article key={deviation.id ?? index} className={deviation.severity === "critical" ? "employee-warning" : ""}><strong>{deviation.category ?? "Operational deviation"}</strong><span>{deviation.severity ?? "important"} · {deviation.status ?? "open"}</span><p>{deviation.details ?? deviation.reason_code ?? deviation.reasonCode}</p>
      <RoutineDeviationActions deviation={deviation} participants={context.runParticipants} pending={Boolean(action.pendingAction)} onAction={run} /></article>)}</section>}
    {context.activeOverride && <section className="employee-override"><p className="eyebrow">Temporary manager acceptance</p><h3>{context.activeOverride.reason ?? "Authorized override"}</h3><p>{context.activeOverride.remainingRisk ?? context.activeOverride.remaining_risk}</p></section>}
    <RoutineInitialAssessmentPanel policy={context.initialAssessmentPolicy} previousDelivery={context.previousDelivery} comparison={context.comparison}
      disabled={!context.actions.canAssess?.allowed || Boolean(action.pendingAction)} onSubmit={(values) => run("recordInitialAssessment", values)} />
    {(context.items ?? []).length > 0 && <section className="employee-items"><h3>Checks</h3>{context.items.map((item) => <RoutineTaskItemControl key={item.id} item={item} value={itemDrafts[item.id]}
      onChange={(value) => setItemDrafts((current) => ({ ...current, [item.id]: value }))} onSave={() => saveItem(item)} disabled={!context.actions.canUpdateItems?.allowed || Boolean(action.pendingAction)} />)}</section>}
    {(context.referenceImages ?? []).map((reference) => <RoutineReferenceInline key={reference.id} reference={reference} />)}
    <section className="employee-comment"><h3>Activity comment</h3><label>Short comment<textarea value={comment} onChange={(event) => setComment(event.target.value)} /></label>
      <button type="button" disabled={!comment.trim() || !context.actions.canComment?.allowed || Boolean(action.pendingAction)} onClick={() => run("addRoutineTaskComment", { comment })}>Send comment</button>
      {action.result && !action.result.ok && <p role="alert">{action.result.message}. Your draft is still here.</p>}</section>
    {(context.verifications ?? []).length > 0 && <section className="employee-panel"><h3>Verification history</h3><ul>{context.verifications.map((verification) => <li key={verification.id}
      className={verification.valid === false ? "employee-warning" : ""}>{verification.result} · revision {verification.taskRevision} · {verification.verifier}
      {verification.valid === false ? " · stale after task change" : ""}</li>)}</ul></section>}
    {context.verificationPolicy !== "none" && task.status === "completed" && <RoutineVerificationPanel revision={task.revision} policy={context.verificationPolicy}
      executor={task.completedBy ?? task.completed_by_display_name_snapshot} canVerify={context.actions.canVerify} pending={action.pendingAction === "verifyRoutineTask"}
      stale={(context.verifications ?? []).some((verification) => verification.valid === false)}
      onVerify={(values) => run("verifyRoutineTask", { ...values, expectedTaskRevision: task.revision })} />}
    <RoutineTaskActionBar actions={context.actions} pending={action.pendingAction} onAction={run} onDeviation={() => setDialog("deviation")}
      onNotApplicable={() => setDialog("na")} onComplete={() => setDialog("complete")} onTransfer={() => setDialog("transfer")} />
    <p className="employee-action-result" aria-live="polite">{queueResult?.message ?? (action.result?.ok ? "Server confirmed" : action.result?.message)}</p>
    {dialog === "deviation" && <RoutineDeviationDialog participants={context.deviationPolicy?.canAssign?.allowed ? context.runParticipants : []} pending={["blockRoutineTask","createDeviation","assignDeviation"].includes(action.pendingAction)} onClose={() => setDialog(null)} onSubmit={async (values) => {
      const mutation = values.severity === "critical" ? "blockRoutineTask" : "createDeviation";
      const response = await run(mutation, mutation === "createDeviation" ? { ...values, sourceType: "manual", expectedTaskRevision: task.revision } : values);
      if (!response?.ok) return;
      if (values.assignedParticipantId && response.data?.deviation?.id) {
        const assignment = await run("assignDeviation", { deviationId: response.data.deviation.id, participantId: values.assignedParticipantId,
          expectedRevision: response.data.deviation.revision }); if (!assignment?.ok) return;
      }
      setDialog(null);
    }} />}
    {dialog === "na" && <RoutineNotApplicableDialog task={task} policy={context.notApplicablePolicy} online={online || !context.offlinePolicy?.timedNotApplicableOnlineOnly} pending={action.pendingAction === "markNotApplicable"} onClose={() => setDialog(null)} onSubmit={async (values) => { const response = await run("markNotApplicable", values); if (response?.ok || response?.mode === "queued") setDialog(null); }} />}
    {dialog === "complete" && <RoutineCompletionDialog context={context} itemDrafts={itemDrafts} pending={action.pendingAction === "completeRoutineTask"} onClose={() => setDialog(null)} onSubmit={async (values) => { if (context.criticalReauthRequired) { setRetry({ name: "completeRoutineTask", extra: values }); setDialog(null); return; } const response = await run("completeRoutineTask", values); if (response?.ok || response?.mode === "queued") setDialog(null); }} />}
    {dialog === "transfer" && <RoutineTransferProposalDialog task={task} pending={action.pendingAction === "proposeTransfer"} onClose={() => setDialog(null)}
      onSubmit={async (values) => { const response = await run("proposeTransfer", { ...values, expectedTaskRevision: task.revision }); if (response?.ok) setDialog(null); }} />}
    {retry && <RoutineCriticalReauthDialog api={reauthApi} onClose={() => setRetry(null)} onAuthenticated={async () => { const current = retry; setRetry(null); await run(current.name, current.extra); }} />}
  </div>;
}
