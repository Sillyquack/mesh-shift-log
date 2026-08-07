export default function RoutineIdentityBadge({ identity }) {
  if (!identity) return null;
  const shared = identity.actorSource === "shared_device_operator" || identity.kind === "shared";
  return (
    <div className="routine-identity-badge" aria-label={`Signed in as ${identity.displayName || "unknown user"}`}>
      <span className="routine-status-dot" aria-hidden="true" />
      <span>
        <strong>{identity.displayName || "Unknown identity"}</strong>
        <small>{shared ? `Operator on ${identity.device?.label || "Workbar Device"}` : `Personal account · ${identity.role || "staff"}`}</small>
      </span>
    </div>
  );
}
