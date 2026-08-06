import { useEffect, useMemo, useState } from "react";

export default function RoutineDeviationActions({ deviation, participants = [], pending, onAction }) {
  const choices = useMemo(() => [
    ["assignDeviation", "Assign", deviation.actions?.canAssign],
    ["mitigateDeviation", "Mark mitigated", deviation.actions?.canMitigate],
    ["resolveDeviation", "Resolve", deviation.actions?.canResolve],
    ["cancelDeviation", "Cancel deviation", deviation.actions?.canCancel],
  ].filter(([, , action]) => action?.allowed), [deviation.actions]);
  const [action, setAction] = useState(() => choices[0]?.[0] ?? "");
  const [participantId, setParticipantId] = useState(""); const [note, setNote] = useState(""); const [result, setResult] = useState(null);
  useEffect(() => { if (!choices.some(([value]) => value === action)) setAction(choices[0]?.[0] ?? ""); }, [action, choices]);
  if (!choices.length) return null;
  const submit = async () => {
    const payload = { deviationId: deviation.id, expectedRevision: deviation.revision };
    if (action === "assignDeviation") payload.participantId = participantId;
    else if (action === "resolveDeviation") payload.resolutionNote = note;
    else if (action === "cancelDeviation") payload.reason = note;
    else payload.note = note;
    const response = await onAction(action, payload); setResult(response);
    if (response?.ok) { setNote(""); setParticipantId(""); }
  };
  const valid = action === "assignDeviation" ? Boolean(participantId) : Boolean(note.trim());
  return <details className="employee-deviation-actions"><summary>Manage deviation</summary><div className="employee-inline-form">
    <label>Action<select value={action} onChange={(event) => { setAction(event.target.value); setResult(null); }}>{choices.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {action === "assignDeviation" ? <label>Responsible person<select value={participantId} onChange={(event) => setParticipantId(event.target.value)}><option value="">Select participant…</option>
      {participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.displayName} · {participant.role}</option>)}</select></label>
      : <label>Substantive note<textarea value={note} onChange={(event) => setNote(event.target.value)} /></label>}
    <button type="button" disabled={pending || !valid} onClick={submit}>{pending ? "Saving…" : "Apply server action"}</button>
    {result && !result.ok && <p role="alert">The server rejected this action. Your selection and note are preserved.</p>}</div></details>;
}
