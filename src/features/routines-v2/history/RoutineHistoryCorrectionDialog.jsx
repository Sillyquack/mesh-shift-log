import { useState } from "react";
import { historyError } from "../data/routineHistoryModel.js";
import { useRoutineDialogFocusTrap } from "./useRoutineDialogFocusTrap.js";

export default function RoutineHistoryCorrectionDialog({ runId, entity, api, onClose, onSaved }) {
  const [draft, setDraft] = useState({ fieldOrClaim: "", originalValue: "", correctedValue: "", reason: "" });
  const [state, setState] = useState({ busy: false, error: null }); const { dialogRef, trapFocus } = useRoutineDialogFocusTrap();
  const submit = async (event) => { event.preventDefault(); setState({ busy: true, error: null }); try {
    const response = await api({ runId, entityType: entity?.type || "run", entityId: entity?.id || runId, fieldOrClaim: draft.fieldOrClaim,
      originalValue: { value: draft.originalValue }, correctedValue: { value: draft.correctedValue }, reason: draft.reason, idempotencyKey: crypto.randomUUID() });
    if (response?.ok === false) throw response.error || new Error(response.message); onSaved?.(); onClose();
  } catch (error) { setState({ busy: false, error: historyError(error) }); } };
  return <div className="rh-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} className="rh-dialog" role="dialog" aria-modal="true" aria-labelledby="correction-title" onKeyDown={(event) => { trapFocus(event); if (event.key === "Escape") onClose(); }}><form onSubmit={submit}>
    <header><h2 id="correction-title">Record history correction</h2><p>This adds a separate immutable note. It never edits the original value.</p></header>
    <label>Field or claim<input required value={draft.fieldOrClaim} onChange={(event) => setDraft({ ...draft, fieldOrClaim: event.target.value })} /></label>
    <label>Original claim/value<textarea required value={draft.originalValue} onChange={(event) => setDraft({ ...draft, originalValue: event.target.value })} /></label>
    <label>Corrected value<textarea required value={draft.correctedValue} onChange={(event) => setDraft({ ...draft, correctedValue: event.target.value })} /></label>
    <label>Reason<textarea required minLength="3" value={draft.reason} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} aria-describedby={state.error ? "correction-error" : undefined} /></label>
    {state.error && <p id="correction-error" className="rh-error" role="alert">The request failed ({state.error.kind}). Your local correction draft is preserved.</p>}
    <footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={state.busy}>{state.busy ? "Recording…" : "Record correction"}</button></footer>
  </form></section></div>;
}
