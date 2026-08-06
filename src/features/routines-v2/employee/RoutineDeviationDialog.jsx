import { useState } from "react";
import RoutineDialogSurface from "./RoutineDialogSurface.jsx";

export default function RoutineDeviationDialog({ onClose, onSubmit, pending, participants = [] }) {
  const [draft, setDraft] = useState({ category: "operational", reasonCode: "", details: "", severity: "important", dueAt: "", assignedParticipantId: "" });
  const field = (key) => (event) => setDraft((current) => ({ ...current, [key]: event.target.value }));
  return <RoutineDialogSurface title="Record deviation" description="A deviation is tracked separately and never appears as a normal green completion." onClose={onClose}>
    <div className="employee-form-grid"><label>Category<select value={draft.category} onChange={field("category")}><option value="operational">Operational</option><option value="timing">Nonblocking timing</option><option value="offline_evidence">Offline evidence warning</option><option value="temporary_acceptance">Temporary manager acceptance</option></select></label>
      <label>Severity<select value={draft.severity} onChange={field("severity")}><option value="minor">Minor</option><option value="important">Important</option><option value="critical">Critical / blocking</option></select></label>
      <label>Reason code<input value={draft.reasonCode} onChange={field("reasonCode")} required /></label><label>Due time<input type="datetime-local" value={draft.dueAt} onChange={field("dueAt")} /></label>
      {participants.length > 0 && <label>Responsible person<select value={draft.assignedParticipantId} onChange={field("assignedParticipantId")}><option value="">Unassigned</option>{participants.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select></label>}
      <label className="employee-form-wide">Details<textarea value={draft.details} onChange={field("details")} required /></label></div>
    <div className="employee-dialog-actions"><button type="button" onClick={onClose}>Cancel</button><button type="button" className="employee-primary" disabled={pending || !draft.reasonCode.trim() || !draft.details.trim()} onClick={() => onSubmit?.({ ...draft, dueAt: draft.dueAt || undefined, assignedParticipantId: draft.assignedParticipantId || undefined })}>Create deviation</button></div>
  </RoutineDialogSurface>;
}
