const statusLabels = Object.freeze({
  disabled: "Sync is paused",
  connecting: "Connecting to routine updates",
  catching_up: "Checking for routine updates",
  current: "Routine preview is current",
  disconnected: "Routine sync is disconnected",
  catch_up_failed: "Routine updates could not be refreshed",
  stopped: "Routine sync stopped",
});

export default function RoutineSyncStatus({ sync, status }) {
  const mode = sync?.mode === "cursor_polling" ? "Secure cursor polling" : sync?.mode === "postgres_realtime" ? "Postgres Realtime" : "Disabled";
  return (
    <div className={`routine-sync-status routine-sync-${status?.status || "disabled"}`} role="status" aria-live="polite">
      <span className="routine-status-dot" aria-hidden="true" />
      <span><strong>{statusLabels[status?.status] || "Routine sync status updated"}</strong><small>{mode}</small></span>
    </div>
  );
}
