import { useRef, useState } from "react";
import { useRoutineApplicationBootstrap } from "../hooks/useRoutineApplicationBootstrap.js";
import { setRoutineEngineMode } from "../api/routineApplicationClient.js";
import { canPersonalManagerActivateShadow, routineLauncherLabel, shouldShowRoutineEngineLauncher } from "../data/routineApplicationModel.js";
import "./RoutineEngineShell.css";

function LegacyShadowActivation({ bootstrap, onActivated, modeSetter = setRoutineEngineMode }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const requestKey = useRef(null);
  const submit = async () => {
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 8) {
      setMessage("Provide an operational reason of at least 8 characters.");
      return;
    }
    if (!requestKey.current) requestKey.current = globalThis.crypto.randomUUID();
    setBusy(true);
    setMessage("");
    try {
      await modeSetter({ mode: "shadow", expectedRevision: bootstrap.settingsRevision, reason: normalizedReason, idempotencyKey: requestKey.current });
      requestKey.current = null;
      setReason("");
      setMessage("Shadow mode was enabled by the server. Operational actions remain disabled.");
      await onActivated();
    } catch (error) {
      setMessage(error?.message || "Shadow activation failed. The same request can be retried safely.");
    } finally {
      setBusy(false);
    }
  };
  return <aside className="routine-launcher routine-legacy-manager-entry" aria-label="Routine Engine manager activation">
    <div><span className="routine-launcher-kicker">Personal manager control</span><strong>Routine Engine v2 is in Legacy mode</strong>
      <span>Enable read-only Shadow preview through the existing audited server contract. This does not enable operative work.</span></div>
    <label htmlFor="routine-shadow-reason">Reason<input id="routine-shadow-reason" value={reason} disabled={busy}
      onChange={(event) => { setReason(event.target.value); requestKey.current = null; }} /></label>
    <button type="button" className="primary-button" disabled={busy || reason.trim().length < 8} onClick={submit}>{busy ? "Enabling…" : "Enable Shadow preview"}</button>
    <span role="status" aria-live="polite">{message}</span>
  </aside>;
}

export default function RoutineEngineLauncher({ user, onOpen, loader, modeSetter }) {
  const eligibleAuth = user?.loginSource === "supabase_auth";
  const bootstrap = useRoutineApplicationBootstrap({ enabled: eligibleAuth, loader });
  if (!eligibleAuth || ["idle", "loading"].includes(bootstrap.status)) return null;
  if (bootstrap.status === "error") return (
    <aside className="routine-launcher routine-launcher-error" aria-live="polite">
      <div><strong>Routine Engine preview unavailable</strong><span>The current shift log remains available.</span></div>
      <button type="button" className="ghost-button" onClick={bootstrap.refresh}>Retry</button>
    </aside>
  );
  if (canPersonalManagerActivateShadow(bootstrap.data)) return <LegacyShadowActivation bootstrap={bootstrap.data} onActivated={bootstrap.refresh} modeSetter={modeSetter} />;
  if (!shouldShowRoutineEngineLauncher(bootstrap.data)) return null;
  return (
    <aside className="routine-launcher">
      <div><span className="routine-launcher-kicker">Server-gated preview</span><strong>{routineLauncherLabel(bootstrap.data)}</strong>
        <span>{bootstrap.data.accessState === "operator_required" ? "Choose your operator identity to continue." : "Read-only foundation · legacy remains active."}</span></div>
      <button type="button" className="primary-button" onClick={onOpen}>Open preview</button>
    </aside>
  );
}
