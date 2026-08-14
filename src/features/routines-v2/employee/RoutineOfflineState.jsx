function humanizeState(value) {
  return ({
    local_draft: "Draft kept on this device",
    queued: "Waiting to send",
    sending: "Sending now",
    sync_pending: "Waiting for confirmation",
    conflict: "Needs your review",
    rejected: "Could not be saved",
    auth_required: "Sign-in required",
    operator_auth_required: "Operator sign-in required",
  })[value] || "Saved";
}

export default function RoutineOfflineState({ sync = {}, overlay = [] }) {
  const pending = overlay.filter((item) => ["queued", "sending", "sync_pending"].includes(item.state)).length;
  const conflicts = overlay.filter((item) => item.state === "conflict").length;
  const failures = overlay.filter((item) => ["rejected", "auth_required", "operator_auth_required"].includes(item.state)).length;
  const status = sync.status || "disabled";
  const needsSignIn = ["auth_required", "paused_auth"].includes(status) || failures > 0;
  const offline = ["disconnected", "queued"].includes(status);
  const checking = ["connecting", "catching_up"].includes(status);
  const failed = status === "catch_up_failed";

  const label = needsSignIn
    ? "Sign in again to keep saving"
    : failed
      ? "Updates need attention"
      : offline
        ? "Working offline"
        : checking
          ? "Checking for updates"
          : pending
            ? "Saving your recent work"
            : conflicts
              ? "One item needs your review"
              : "Everything is up to date";

  const summary = [
    pending ? `${pending} waiting to send` : "",
    conflicts ? `${conflicts} need review` : "",
    !pending && !conflicts && !failures ? "Your work is safe" : "",
  ].filter(Boolean).join(" · ");

  const tone = needsSignIn || failed ? "error" : offline || checking || pending || conflicts ? "attention" : "current";

  return (
    <section className={`employee-offline is-${tone}`} aria-live="polite" aria-label="Work status">
      <span className="employee-pulse" aria-hidden="true" />
      <div>
        <strong>{label}</strong>
        <small>{summary}</small>
        {overlay.length > 0 ? (
          <details>
            <summary>Show saved-work details</summary>
            <ul>
              {overlay.map((entry) => (
                <li key={entry.operationId}>{humanizeState(entry.state)}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </section>
  );
}
