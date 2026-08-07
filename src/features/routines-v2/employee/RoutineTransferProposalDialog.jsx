import { useState } from "react";
import RoutineDialogSurface from "./RoutineDialogSurface.jsx";

export default function RoutineTransferProposalDialog({ task, pending, onClose, onSubmit }) {
  const [targetType, setTargetType] = useState("run");
  const [targetId, setTargetId] = useState("");
  const [reason, setReason] = useState("");
  const [dueAt, setDueAt] = useState("");
  const submit = (event) => {
    event.preventDefault();
    onSubmit({ taskId: task.id, targetType, reason, dueAt: dueAt || undefined,
      ...(targetType === "run" ? { targetRunId: targetId } : {}),
      ...(targetType === "participant" ? { targetParticipantId: targetId } : {}),
      ...(targetType === "event_operation" ? { targetEventId: targetId } : {}) });
  };
  return <RoutineDialogSurface title="Propose task transfer" description="The server validates the target, authority and due time." onClose={onClose}>
    <form onSubmit={submit}><label>Target type<select value={targetType} onChange={(event) => setTargetType(event.target.value)}>
      <option value="run">Routine run</option><option value="participant">Run participant</option><option value="event_operation">Event operation</option>
    </select></label><label>Server-recognized target ID<input value={targetId} onChange={(event) => setTargetId(event.target.value)} autoComplete="off" /></label>
      <label>Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <label>Due time (optional)<input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label>
      <div className="employee-actions"><button type="button" onClick={onClose}>Cancel</button><button className="employee-primary" type="submit" disabled={pending || !targetId.trim() || !reason.trim()}>{pending ? "Proposing…" : "Propose transfer"}</button></div>
    </form></RoutineDialogSurface>;
}
