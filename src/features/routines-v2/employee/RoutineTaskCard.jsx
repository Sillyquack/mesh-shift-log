import { useEffect, useState } from "react";
import { getRoutineTaskActionContext } from "../api/routineEmployeeClient.js";
import { taskPrimaryLabel, taskStatusLabel, ROUTINE_OUTCOME_LABELS } from "../data/routineTaskViewModel.js";
import RoutineAssignmentBadge from "./RoutineAssignmentBadge.jsx";
import RoutineTimingStatus from "./RoutineTimingStatus.jsx";
import RoutineTaskDetails from "./RoutineTaskDetails.jsx";

export default function RoutineTaskCard({ task, initiallyOpen = false, loader = getRoutineTaskActionContext, onConfirmed, actionApi, reauthApi, pendingOverlay, online }) {
  const [open, setOpen] = useState(initiallyOpen); const [context, setContext] = useState(task.actionContext ?? null); const [state, setState] = useState("idle");
  useEffect(() => { if (!open || context) return; let active = true; setState("loading"); loader(task.id).then((value) => { if (active) { setContext(value); setState("ready"); } }, () => { if (active) setState("error"); }); return () => { active = false; }; }, [context, loader, open, task.id]);
  const refresh = async () => { const value = await loader(task.id); setContext(value); onConfirmed?.(value); };
  const source = context?.task ?? task;
  return <article className={`employee-task-card employee-task-${source.status ?? "not-started"}`}><button type="button" className="employee-task-summary" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
    <span className="employee-task-number">{source.sort_order_snapshot ?? source.sortOrder ?? "•"}</span><span><strong>{taskPrimaryLabel(source)}</strong><small>{source.location_name_snapshot ?? source.location ?? "Location assigned by routine"}</small></span>
    <span><em>{taskStatusLabel(source.status)}</em><small>{ROUTINE_OUTCOME_LABELS[source.outcome] ?? source.outcome?.replaceAll("_", " ")}</small></span><b aria-hidden="true">{open ? "−" : "+"}</b></button>
    <div className="employee-task-meta"><RoutineTimingStatus timing={context?.timing ?? source.timing} /><RoutineAssignmentBadge relationship={context?.actorRelationship ?? source.actorRelationship} />
      {(source.completedBy || source.completed_by_display_name_snapshot) && <span><strong>{source.completedBy ?? source.completed_by_display_name_snapshot}</strong><small>{source.completed_at ? new Date(source.completed_at).toLocaleString() : "Completed"}</small></span>}</div>
    {open && <div className="employee-task-expanded">{state === "loading" && <p role="status">Loading server action context…</p>}{state === "error" && <p role="alert">Task context could not be loaded. Your local work was not changed.</p>}
      {context && <RoutineTaskDetails context={context} onConfirmed={refresh} actionApi={actionApi} reauthApi={reauthApi} pendingOverlay={pendingOverlay} online={online} />}</div>}</article>;
}
