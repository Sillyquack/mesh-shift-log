function formatConflictSummary(value) {
  if (typeof value === "string") return value;
  if (value == null) return "No summary provided";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Summary unavailable";
  }
}

export default function RoutineConflictPanel({ conflict, onRefresh, onKeep, onDiscard, onCreateNew, resolutionConfirmed = false,
  onResolutionConfirmed, pending = false }) {
  if (!conflict) return null;
  return <section className="employee-conflict" role="alert"><p className="eyebrow">Conflict — no automatic merge</p><h3>Server and local changes differ</h3>
    <div className="employee-conflict-grid"><div><strong>Server state · revision {conflict.serverRevision}</strong><pre>{formatConflictSummary(conflict.serverSummary)}</pre></div>
      <div><strong>Local draft · based on {conflict.localRevision}</strong><pre>{formatConflictSummary(conflict.localSummary)}</pre></div></div>
    <small>Changed by {conflict.actor ?? "another operator"}{conflict.at ? ` at ${new Date(conflict.at).toLocaleString()}` : ""}</small>
    {onResolutionConfirmed && <label className="employee-conflict-confirm"><input type="checkbox" checked={resolutionConfirmed}
      onChange={(event) => onResolutionConfirmed(event.target.checked)} /> I compared the local draft with the refreshed server state</label>}
    <div className="employee-actions"><button type="button" disabled={pending} onClick={onRefresh}>Refresh server</button><button type="button" disabled={pending} onClick={onKeep}>Keep local draft</button>
      <button type="button" disabled={pending} onClick={onDiscard}>Discard local draft</button><button type="button" disabled={pending || (onResolutionConfirmed && !resolutionConfirmed)} onClick={onCreateNew}>Create new operation after manual resolution</button></div>
  </section>;
}
