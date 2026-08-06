export default function RoutineRunProgress({ progress = {}, sync }) {
  const total = Number(progress.total ?? 0); const handled = Number(progress.handled ?? 0);
  const value = total ? Math.round((handled / total) * 100) : 0;
  return <section className="employee-run-progress" aria-label="Run progress"><div><strong>{handled} of {total} handled</strong><span>{value}%</span></div>
    <progress max="100" value={value}>{value}%</progress><ul><li>{progress.remaining ?? 0} remaining</li><li>{progress.criticalRemaining ?? 0} critical</li>
      <li>{progress.blocked ?? 0} blocked</li><li>{progress.deviations ?? progress.deviationCount ?? 0} deviations</li>
      <li>{progress.timingWarnings ?? 0} timing warnings</li><li>{progress.pendingTransfers ?? 0} transfers pending</li>
      <li>{sync?.pendingCount ?? 0} sync pending</li></ul></section>;
}
