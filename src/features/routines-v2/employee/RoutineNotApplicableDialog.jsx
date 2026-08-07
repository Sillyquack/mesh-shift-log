import { useState } from "react";
import RoutineDialogSurface from "./RoutineDialogSurface.jsx";

export default function RoutineNotApplicableDialog({ task, policy, online = true, onClose, onSubmit, pending }) {
  const [reason, setReason] = useState(""); const onlineOnly = task?.availability_mode_snapshot !== "manual";
  return <RoutineDialogSurface title="Mark not applicable" description="This records a historical outcome; it does not delete the task." onClose={onClose}>
    <p><strong>{task?.title_snapshot ?? task?.title}</strong></p><p>{policy?.consequence ?? "The task becomes read-only and can only be reopened by an authorized actor."}</p>
    {onlineOnly && !online && <p className="employee-warning" role="alert">Timed N/A is online-only. Reconnect before continuing.</p>}
    <label>Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} required /></label>
    <div className="employee-dialog-actions"><button type="button" onClick={onClose}>Cancel</button><button type="button" className="employee-primary" disabled={pending || !online || !reason.trim()} onClick={() => onSubmit?.({ reason })}>Mark not applicable</button></div>
  </RoutineDialogSurface>;
}
