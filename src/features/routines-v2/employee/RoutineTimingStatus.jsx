import { taskStatusLabel } from "../data/routineTaskViewModel.js";

export default function RoutineTimingStatus({ timing }) {
  const live = timing?.live ?? timing ?? {};
  const phase = live.phase ?? "not scheduled";
  const boundary = live.nextBoundaryAt ?? live.next_boundary_at;
  return <span className={`employee-status employee-status-${String(phase).replaceAll("_", "-")}`}>
    <strong>{taskStatusLabel(phase)}</strong>{boundary && <small>Next boundary {new Date(boundary).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>}
  </span>;
}
