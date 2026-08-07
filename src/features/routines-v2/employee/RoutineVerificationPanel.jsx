import { useState } from "react";

export default function RoutineVerificationPanel({ title = "Task verification", revision, policy, executor, canVerify, pending, onVerify, stale, requiredTasks = [] }) {
  const [result, setResult] = useState("passed"); const [note, setNote] = useState(""); const [physical, setPhysical] = useState(false);
  const physicalRequired = ["self_recheck", "independent", "second_person", "second_person_required", "closing_responsible"].includes(policy);
  return <section className="employee-panel"><p className="eyebrow">{policy?.replaceAll("_", " ") ?? "Server policy"}</p><h3>{title}</h3>
    <p>Revision {revision ?? "—"} · performed by {executor ?? "—"}{stale && <strong className="employee-warning"> · verification is stale after a material change</strong>}</p>
    {requiredTasks.length > 0 && <ul>{requiredTasks.map((task) => <li key={task.id ?? task.taskId ?? task.taskKey ?? `${task.title}-${task.revision ?? task.taskRevision}`}>{task.title ?? task.taskKey} · revision {task.revision ?? task.taskRevision}</li>)}</ul>}
    <fieldset disabled={!canVerify?.allowed || pending}><legend>Physical verification</legend><label><input type="checkbox" checked={physical} onChange={(event) => setPhysical(event.target.checked)} />Physical recheck completed</label>
      <label>Result<select value={result} onChange={(event) => setResult(event.target.value)}><option value="passed">Pass</option><option value="failed">Fail — create deviation and block</option></select></label>
      <label>Note<textarea value={note} onChange={(event) => setNote(event.target.value)} /></label></fieldset>
    <button type="button" className="employee-primary" disabled={!canVerify?.allowed || pending || (physicalRequired && !physical)} onClick={() => onVerify?.({ result, note, physicalRecheckConfirmed: physical })}>Complete verification</button>
    {!canVerify?.allowed && <small>{canVerify?.reasonCode}</small>}</section>;
}
