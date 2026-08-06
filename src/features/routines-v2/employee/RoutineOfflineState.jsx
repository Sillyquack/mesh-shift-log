export default function RoutineOfflineState({ sync = {}, overlay = [] }) {
  const pending = overlay.filter((item) => ["queued", "sending", "sync_pending"].includes(item.state)).length;
  const conflicts = overlay.filter((item) => item.state === "conflict").length;
  return <section className="employee-offline" aria-live="polite" aria-label="Synchronization status">
    <span className="employee-pulse" aria-hidden="true" /><div><strong>{sync.transport === "postgres_realtime" ? "Realtime connected" : "Cursor polling"}</strong>
      <small>{pending} pending · {conflicts} conflicts · server cache confirmed</small>
      {overlay.length > 0 && <ul>{overlay.map((entry) => <li key={entry.operationId}>{({ local_draft: "Local draft", queued: "Queued", sending: "Sending",
        sync_pending: "Sync pending", conflict: "Conflict", rejected: "Rejected", auth_required: "Auth required",
        operator_auth_required: "Operator reauthentication required" })[entry.state] ?? "Server confirmed"}</li>)}</ul>}</div>
  </section>;
}
