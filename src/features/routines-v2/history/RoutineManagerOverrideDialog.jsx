import { useState } from "react";
import { historyError } from "../data/routineHistoryModel.js";
import { useRoutineDialogFocusTrap } from "./useRoutineDialogFocusTrap.js";

export default function RoutineManagerOverrideDialog({ run, taskId = null, participants = [], api, onClose, onSaved }) {
  const [draft, setDraft] = useState({ overrideType: "other", reason: "", remainingRisk: "", temporaryMeasure: "", owner: "", dueAt: "", expiresAt: "" });
  const [state, setState] = useState({ busy: false, error: null }); const { dialogRef, trapFocus } = useRoutineDialogFocusTrap();
  const submit = async (event) => { event.preventDefault(); setState({ busy: true, error: null }); try {
    const response = await api({ runId: run.id, taskId, overrideType: draft.overrideType, reason: draft.reason, remainingRisk: draft.remainingRisk,
      temporaryMeasure: draft.temporaryMeasure, followUpOwnerParticipantId: draft.owner, followUpDueAt: new Date(draft.dueAt).toISOString(),
      expiresAt: draft.expiresAt ? new Date(draft.expiresAt).toISOString() : null, expectedRunRevision: run.revision, idempotencyKey: crypto.randomUUID() });
    if (response?.ok === false) throw response.error || new Error(response.message); onSaved?.(); onClose();
  } catch (error) { setState({ busy: false, error: historyError(error) }); } };
  return <div className="rh-dialog-backdrop" role="presentation"><section ref={dialogRef} className="rh-dialog danger" role="dialog" aria-modal="true" aria-labelledby="override-title" onKeyDown={(event) => { trapFocus(event); if (event.key === "Escape") onClose(); }}><form onSubmit={submit}>
    <header><h2 id="override-title">Record manager override</h2><p>This is a visible risk decision. It is never displayed as standard met.</p></header>
    <label>Override type<select value={draft.overrideType} onChange={(event) => setDraft({ ...draft, overrideType: event.target.value })}><option value="other">Other controlled exception</option><option value="run_completion">Run completion</option><option value="not_applicable">Not applicable</option><option value="verification">Verification</option><option value="transfer">Transfer</option></select></label>
    <label>Reason<textarea required minLength="3" value={draft.reason} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} /></label>
    <label>Remaining risk<textarea required minLength="3" value={draft.remainingRisk} onChange={(event) => setDraft({ ...draft, remainingRisk: event.target.value })} /></label>
    <label>Temporary measure<textarea required minLength="3" value={draft.temporaryMeasure} onChange={(event) => setDraft({ ...draft, temporaryMeasure: event.target.value })} /></label>
    <label>Follow-up owner<select required value={draft.owner} onChange={(event) => setDraft({ ...draft, owner: event.target.value })}><option value="">Select participant</option>{participants.map((item) => <option key={item.id} value={item.id}>{item.display_name_snapshot || item.identity_type}</option>)}</select></label>
    <label>Follow-up due<input required type="datetime-local" value={draft.dueAt} onChange={(event) => setDraft({ ...draft, dueAt: event.target.value })} /></label>
    <label>Optional expiry<input type="datetime-local" value={draft.expiresAt} onChange={(event) => setDraft({ ...draft, expiresAt: event.target.value })} aria-describedby={state.error ? "override-error" : undefined} /></label>
    {state.error && <p id="override-error" className="rh-error" role="alert">The request failed ({state.error.kind}). Your local override form is preserved; it was not auto-rebased.</p>}
    <footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={state.busy}>{state.busy ? "Recording…" : "Record override"}</button></footer>
  </form></section></div>;
}
