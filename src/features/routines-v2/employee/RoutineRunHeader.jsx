export default function RoutineRunHeader({ run = {}, participant, actorRole, onBack }) {
  const source = run.run ?? run;
  return <header className="employee-run-header"><button type="button" className="employee-back" onClick={onBack}>← Operations</button>
    <div><p className="eyebrow">{source.routine_key ?? source.routineKey ?? "Routine"} · {source.operational_date ?? source.operationalDate}</p>
      <h1>{source.name_snapshot ?? source.name ?? String(source.routine_key ?? "Routine run").replaceAll("_", " ")}</h1>
      <p><span className="employee-status"><strong>{String(source.status ?? "scheduled").replaceAll("_", " ")}</strong></span>
        <span>Template v{source.template_version_number_snapshot ?? source.templateVersionNumber ?? "—"}</span>
        <span>Snapshot {source.snapshot_state ?? source.snapshotState ?? "ready"}</span></p></div>
    <aside><strong>{participant?.displayName ?? "Not joined"}</strong><small>{participant?.role ?? actorRole ?? "employee"}</small></aside></header>;
}
