export default function RoutineDoubleShiftPlan({ context, pending, onConfirm, onOpenRun }) {
  const workspace = context.bundle ?? {}; const bundle = workspace.bundle ?? workspace; const runs = workspace.runs ?? {};
  return <section className="employee-ds-card"><p className="eyebrow">DS01 · Plan</p><h2>One connected operational day</h2>
    <dl className="employee-summary-list"><div><dt>Operational date</dt><dd>{bundle.operational_date ?? bundle.operationalDate}</dd></div>
      <div><dt>Expected Closing start</dt><dd>{bundle.expected_closing_start_at ?? "Server scheduled"}</dd></div><div><dt>Expected return</dt><dd>{context.expectedReturnAt ?? "Not set"}</dd></div>
      <div><dt>Event context</dt><dd>{workspace.eventContext?.label ?? "No linked event context"}</dd></div></dl>
    <div className="employee-linked-runs"><button type="button" onClick={() => onOpenRun?.(runs.opening?.id)} disabled={!runs.opening?.id}>Opening · {runs.opening?.status ?? "pending"}</button>
      <button type="button" onClick={() => onOpenRun?.(runs.closing?.id)} disabled={!runs.closing?.id}>Closing · {runs.closing?.status ?? "pending"}</button></div>
    {(workspace.missingCriticalRoles ?? []).length > 0 && <p className="employee-warning">Missing critical roles: {workspace.missingCriticalRoles.join(", ")}</p>}
    <button type="button" className="employee-primary" disabled={!context.actions?.canConfirmDS01?.allowed || pending} onClick={onConfirm}>Confirm plan</button>
    {!context.actions?.canConfirmDS01?.allowed && <small>{context.actions?.canConfirmDS01?.reasonCode}</small>}</section>;
}
