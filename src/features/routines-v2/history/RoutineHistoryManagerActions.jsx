import { useMemo, useState } from "react";
import { historyError } from "../data/routineHistoryModel.js";

const newDraft = () => ({ action: "", targetId: "", participantId: "", reason: "", idempotencyKey: crypto.randomUUID() });
const list = (value) => Array.isArray(value) ? value : [];

export default function RoutineHistoryManagerActions({ detail, mutations, onSaved }) {
  const [draft, setDraft] = useState(newDraft);
  const [state, setState] = useState({ busy: false, error: null });
  const actions = detail.actions || {};
  const options = useMemo(() => [
    actions.canReopenRun && { value: "reopenRun", label: "Reopen finished run" },
    actions.canCancelRun && { value: "cancelRun", label: "Cancel run" },
    list(actions.reopenTaskIds).length && { value: "reopenTask", label: "Reopen handled task" },
    list(actions.assignDeviationIds).length && { value: "assignDeviation", label: "Assign deviation" },
    list(actions.mitigateDeviationIds).length && { value: "mitigateDeviation", label: "Record mitigation" },
    list(actions.resolveDeviationIds).length && { value: "resolveDeviation", label: "Resolve deviation" },
    list(actions.cancelDeviationIds).length && { value: "cancelDeviation", label: "Cancel deviation" },
  ].filter(Boolean), [actions]);

  const targets = useMemo(() => {
    if (draft.action === "reopenTask") {
      const allowed = new Set(list(actions.reopenTaskIds));
      return detail.tasks.filter((item) => allowed.has(item.id)).map((item) => ({ id: item.id, revision: item.revision, label: item.title_snapshot || item.task_key_snapshot || item.id }));
    }
    const key = { assignDeviation: "assignDeviationIds", mitigateDeviation: "mitigateDeviationIds", resolveDeviation: "resolveDeviationIds", cancelDeviation: "cancelDeviationIds" }[draft.action];
    const allowed = new Set(list(actions[key]));
    return key ? detail.deviations.filter((item) => allowed.has(item.id)).map((item) => ({ id: item.id, revision: item.revision, label: `${item.category || "Deviation"} · ${item.status}` })) : [];
  }, [actions, detail.deviations, detail.tasks, draft.action]);

  if (!options.length) return null;
  const chooseAction = (action) => { setDraft({ ...newDraft(), action }); setState({ busy: false, error: null }); };
  const selected = targets.find((item) => item.id === draft.targetId);
  const needsTarget = !["reopenRun", "cancelRun"].includes(draft.action);
  const needsParticipant = draft.action === "assignDeviation";
  const canSubmit = draft.action && (!needsTarget || selected) && (!needsParticipant || draft.participantId) && draft.reason.trim().length >= 3;

  const submit = async (event) => {
    event.preventDefault(); setState({ busy: true, error: null });
    const common = { idempotencyKey: draft.idempotencyKey };
    const calls = {
      reopenRun: () => mutations.reopenRun({ ...common, runId: detail.run.id, expectedRevision: detail.run.revision, reason: draft.reason }),
      cancelRun: () => mutations.cancelRun({ ...common, runId: detail.run.id, expectedRevision: detail.run.revision, reason: draft.reason }),
      reopenTask: () => mutations.reopenTask({ ...common, taskId: selected.id, expectedRevision: selected.revision, reason: draft.reason }),
      assignDeviation: () => mutations.assignDeviation({ ...common, deviationId: selected.id, expectedRevision: selected.revision, participantId: draft.participantId }),
      mitigateDeviation: () => mutations.mitigateDeviation({ ...common, deviationId: selected.id, expectedRevision: selected.revision, note: draft.reason }),
      resolveDeviation: () => mutations.resolveDeviation({ ...common, deviationId: selected.id, expectedRevision: selected.revision, resolutionNote: draft.reason }),
      cancelDeviation: () => mutations.cancelDeviation({ ...common, deviationId: selected.id, expectedRevision: selected.revision, reason: draft.reason }),
    };
    try {
      const response = await calls[draft.action]();
      if (response?.ok === false) throw response.error || new Error(response.message);
      setDraft(newDraft()); setState({ busy: false, error: null }); await onSaved?.();
    } catch (error) { setState({ busy: false, error: historyError(error) }); }
  };

  return <section className="rh-section rh-manager-actions"><h3>Operational manager review</h3><p>These actions reuse the existing lifecycle RPCs and require the displayed server revision. Failures keep this draft unchanged.</p><form className="rh-manager-action-form" onSubmit={submit}>
    <label>Action<select value={draft.action} onChange={(event) => chooseAction(event.target.value)}><option value="">Select permitted action</option>{options.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
    {needsTarget && draft.action && <label>Target<select required value={draft.targetId} onChange={(event) => setDraft({ ...draft, targetId: event.target.value })}><option value="">Select current record</option>{targets.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
    {needsParticipant && <label>Assign to<select required value={draft.participantId} onChange={(event) => setDraft({ ...draft, participantId: event.target.value })}><option value="">Select active participant</option>{detail.participants.filter((item) => item.participation_status !== "removed").map((item) => <option key={item.id} value={item.id}>{item.display_name_snapshot || item.identity_type}</option>)}</select></label>}
    {draft.action && <label>{needsParticipant ? "Assignment reason" : "Substantive reason or note"}<textarea required minLength="3" value={draft.reason} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} aria-describedby={state.error ? "manager-action-error" : undefined} /></label>}
    {state.error && <p id="manager-action-error" className="rh-error" role="alert">The request failed ({state.error.kind}). The local action draft and idempotency key were preserved; nothing was auto-rebased.</p>}
    {draft.action && <button type="submit" disabled={state.busy || !canSubmit}>{state.busy ? "Waiting for server…" : "Confirm manager action"}</button>}
  </form></section>;
}
