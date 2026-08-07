export default function RoutineAssignmentBadge({ relationship }) {
  const assigned = relationship?.assignedTo;
  return <span className="employee-assignment"><strong>{assigned?.displayName ?? "Unclaimed"}</strong>
    <small>{relationship?.isAssigned ? "Assigned to you" : assigned?.role ?? "Available to claim"}</small></span>;
}
