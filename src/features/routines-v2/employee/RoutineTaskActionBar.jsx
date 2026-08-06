import { useState } from "react";

export default function RoutineTaskActionBar({ actions = {}, pending, onAction, onDeviation, onNotApplicable, onComplete, onTransfer }) {
  const [pauseOpen, setPauseOpen] = useState(false); const [pauseReason, setPauseReason] = useState("");
  const [reopenOpen, setReopenOpen] = useState(false); const [reopenReason, setReopenReason] = useState("");
  const available = (key) => actions[key]?.allowed === true;
  const primary = available("canComplete") ? ["Complete", onComplete] : available("canStart") ? ["Start task", () => onAction("startRoutineTask")]
    : available("canClaim") ? ["Claim task", () => onAction("claimRoutineTask")] : available("canPause") ? ["Pause", () => setPauseOpen(true)] : null;
  return <div className="employee-task-actions"><div className="employee-primary-row">{primary && <button type="button" className="employee-primary" disabled={pending} onClick={primary[1]}>{pending ?? primary[0]}</button>}
    {!primary && <span className="employee-disabled-reason">{Object.values(actions).find((action) => action?.reasonCode)?.reasonCode ?? "No action available"}</span>}</div>
    {pauseOpen && <div className="employee-inline-form"><label>Why pause?<input value={pauseReason} onChange={(event) => setPauseReason(event.target.value)} /></label>
      <button type="button" disabled={!pauseReason.trim() || pending} onClick={async () => { const response = await onAction("pauseRoutineTask", { reason: pauseReason });
        if (response?.ok || response?.mode === "queued") { setPauseOpen(false); setPauseReason(""); } }}>Pause task</button></div>}
    {reopenOpen && <div className="employee-inline-form"><label>Why reopen?<input value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} /></label>
      <button type="button" disabled={!reopenReason.trim() || pending} onClick={async () => { const response = await onAction("reopenRoutineTask", { reason: reopenReason });
        if (response?.ok) { setReopenOpen(false); setReopenReason(""); } }}>Reopen task</button></div>}
    <details className="employee-secondary-actions"><summary>More actions</summary><div><button type="button" disabled={!available("canRelease") || pending} onClick={() => onAction("releaseRoutineTask")}>Release</button>
      <button type="button" disabled={!available("canBlock") || pending} onClick={onDeviation}>Deviation</button>
      {available("canTransfer") && <button type="button" disabled={pending} onClick={onTransfer}>Transfer</button>}
      {available("canMarkNotApplicable") && <button type="button" disabled={pending} onClick={onNotApplicable}>Not applicable</button>}
      {available("canReopen") && <button type="button" disabled={pending} onClick={() => setReopenOpen(true)}>Reopen</button>}</div></details></div>;
}
