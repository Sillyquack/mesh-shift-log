export default function RoutineOfflineState({ sync = {}, overlay = [] }) {
  const pending = overlay.filter((item) => ["queued", "sending", "sync_pending"].includes(item.state)).length;
  const conflicts = overlay.filter((item) => item.state === "conflict").length;
  const realtime = sync.transport === "postgres_realtime";
  const cursorPolling = sync.transport === "cursor_polling";
  const status = sync.status || "disabled";
  const statusLabel = realtime
    ? ({ current: "Realtime connected", online: "Realtime connected", connecting: "Realtime connecting", catching_up: "Realtime checking updates",
      disconnected: "Realtime disconnected", catch_up_failed: "Realtime refresh failed", disabled: "Realtime paused" }[status] || "Realtime status unavailable")
    : cursorPolling
      ? ({ current: "Cursor polling current", online: "Cursor polling current", connecting: "Cursor polling connecting", catching_up: "Cursor polling for updates",
        disconnected: "Cursor polling disconnected", catch_up_failed: "Cursor refresh failed", auth_required: "Cursor polling authentication required",
        paused_auth: "Cursor polling authentication required", disabled: "Cursor polling paused" }[status] || "Cursor polling status unavailable")
      : ({ queued: "Offline draft queue", disconnected: "Offline", disabled: "Synchronization paused" }[status] || "Offline synchronization pending");
  const cacheLabel = sync.serverConfirmed === true && !["disconnected", "catch_up_failed"].includes(status)
    ? "server cache confirmed"
    : "server confirmation pending";
  return <section className="employee-offline" aria-live="polite" aria-label="Synchronization status">
    <span className="employee-pulse" aria-hidden="true" /><div><strong>{statusLabel}</strong>
      <small>{pending} pending · {conflicts} conflicts · {cacheLabel}</small>
      {overlay.length > 0 && <ul>{overlay.map((entry) => <li key={entry.operationId}>{({ local_draft: "Local draft", queued: "Queued", sending: "Sending",
        sync_pending: "Sync pending", conflict: "Conflict", rejected: "Rejected", auth_required: "Auth required",
        operator_auth_required: "Operator reauthentication required" })[entry.state] ?? "Server confirmed"}</li>)}</ul>}</div>
  </section>;
}
