import { useState } from "react";
import { useRoutineHandover } from "../hooks/useRoutineHandover.js";

export default function RoutineHandoverCreatePanel({ runId, onCreated, api }) {
  const handover = useRoutineHandover(null, { api });
  const [targetRunId, setTargetRunId] = useState("");
  const [handoverType, setHandoverType] = useState("shift_transition");
  const create = async () => {
    const response = await handover.execute("createOrGet", { fromRunId: runId, handoverType,
      toRunId: targetRunId || undefined });
    if (response?.ok) await onCreated?.(response.data);
  };
  return <section className="employee-panel"><p className="eyebrow">Handover draft</p><h3>Create or get handover</h3>
    <p>The server generates required critical and important items. Existing drafts are returned idempotently.</p>
    <div className="employee-form-grid"><label>Handover type<select value={handoverType} onChange={(event) => setHandoverType(event.target.value)}><option value="shift_transition">Shift transition</option><option value="run_transition">Run transition</option><option value="external_target">External target</option></select></label>
      <label>Target run ID<input value={targetRunId} onChange={(event) => setTargetRunId(event.target.value)} autoComplete="off" /></label></div>
    <button type="button" className="employee-primary" disabled={handover.pending || !targetRunId.trim()} onClick={create}>{handover.pending ? "Checking server…" : "Create or get draft"}</button>
    {handover.error && <p role="alert">The handover request failed. The target draft remains here.</p>}</section>;
}
