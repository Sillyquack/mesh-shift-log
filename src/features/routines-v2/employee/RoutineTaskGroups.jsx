import { useMemo } from "react";
import { groupRoutineTasks, taskPrimaryLabel } from "../data/routineTaskViewModel.js";
import RoutineTaskCard from "./RoutineTaskCard.jsx";

export default function RoutineTaskGroups({ tasks = [], onConfirmed, taskLoader, actionApi, reauthApi, pendingOverlay, online }) {
  const grouped = useMemo(() => groupRoutineTasks(tasks), [tasks]);
  return <section className="employee-task-groups"><aside className="employee-next-task"><p className="eyebrow">Next task</p><strong>{grouped.nextTask ? taskPrimaryLabel(grouped.nextTask) : "No task is available"}</strong></aside>
    {grouped.order.map((label) => grouped.groups[label].length > 0 && <details key={label} open={["Do now", "In progress"].includes(label)} className="employee-task-group">
      <summary><span>{label}</span><strong>{grouped.groups[label].length}</strong></summary><div>{grouped.groups[label].map((task, index) => <RoutineTaskCard key={`${label}-${task.id}`} task={task} initiallyOpen={label === "Do now" && index === 0}
        loader={taskLoader} onConfirmed={onConfirmed} actionApi={actionApi} reauthApi={reauthApi} pendingOverlay={pendingOverlay} online={online} />)}</div></details>)}</section>;
}
