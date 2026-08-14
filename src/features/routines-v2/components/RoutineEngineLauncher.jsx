import { useRef, useState } from "react";
import { useRoutineApplicationBootstrap } from "../hooks/useRoutineApplicationBootstrap.js";
import { setRoutineEngineMode } from "../api/routineApplicationClient.js";
import {
  canPersonalManagerActivateShadow,
  routineLauncherLabel,
  shouldShowRoutineEngineLauncher,
} from "../data/routineApplicationModel.js";
import "./RoutineEngineShell.css";
import "./RoutineExperience.css";

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
      await modeSetter({
        mode: "shadow",
        expectedRevision: bootstrap.settingsRevision,
        reason: normalizedReason,
        idempotencyKey: requestKey.current,
      });
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

  return (
    <aside className="routine-launcher mesh-role-launcher mesh-role-launcher-activation routine-legacy-manager-entry" aria-label="Routine Engine manager activation">
      <div className="mesh-role-launcher-copy">
        <span>Manager setup</span>
        <strong>Your new Mesh workspace is ready to review.</strong>
        <p>Enable the audited read-only preview first. Nothing operative is activated and the current shift log remains available.</p>
        <span className="sr-only">Routine Engine v2 is in Legacy mode</span>
      </div>
      <div className="mesh-role-activation-form">
        <label htmlFor="routine-shadow-reason">
          Operational reason
          <input
            id="routine-shadow-reason"
            value={reason}
            disabled={busy}
            placeholder="Pre-production interface review"
            onChange={(event) => {
              setReason(event.target.value);
              requestKey.current = null;
            }}
          />
        </label>
        <button type="button" className="mesh-role-launcher-action" disabled={busy || reason.trim().length < 8} onClick={submit}>
          {busy ? "Enabling…" : "Enable Shadow preview"}
        </button>
        <span role="status" aria-live="polite">{message}</span>
      </div>
    </aside>
  );
}

export default function RoutineEngineLauncher({ user, onOpen, loader, modeSetter }) {
  const eligibleAuth = user?.loginSource === "supabase_auth";
  const bootstrap = useRoutineApplicationBootstrap({ enabled: eligibleAuth, loader });

  if (!eligibleAuth || ["idle", "loading"].includes(bootstrap.status)) return null;

  if (bootstrap.status === "error") {
    return (
      <aside className="routine-launcher mesh-role-launcher mesh-role-launcher-error" aria-live="polite">
        <div className="mesh-role-launcher-copy">
          <span>Workspace unavailable</span>
          <strong>We could not open the new experience.</strong>
          <p>The current shift log remains available. Retry without losing any existing work.</p>
          <span className="sr-only">Routine Engine preview unavailable</span>
        </div>
        <button type="button" className="mesh-role-launcher-action" onClick={bootstrap.refresh}>Retry</button>
      </aside>
    );
  }

  if (canPersonalManagerActivateShadow(bootstrap.data)) {
    return <LegacyShadowActivation bootstrap={bootstrap.data} onActivated={bootstrap.refresh} modeSetter={modeSetter} />;
  }
  if (!shouldShowRoutineEngineLauncher(bootstrap.data)) return null;

  const manager = bootstrap.data.managerPreviewAllowed === true;
  const operatorRequired = bootstrap.data.accessState === "operator_required";
  const technicalLabel = routineLauncherLabel(bootstrap.data);

  return (
    <aside className="routine-launcher mesh-role-launcher">
      <div className="mesh-role-launcher-copy">
        <span>{manager ? "Manager workspace" : operatorRequired ? "Choose operator" : "Your shift workspace"}</span>
        <strong>{manager ? "See today clearly. Control the rest when you need it." : "One shift. One clear next step."}</strong>
        <p>{operatorRequired
          ? "Choose the person using this device, then continue directly into the focused shift experience."
          : manager
            ? "Open Today, Attention and Control without calendar imports, database language or system-shaped navigation in the way."
            : "Continue into Now, Shift and Help with the technical machinery kept safely in the background."}</p>
        <span className="sr-only">Server-gated preview · {technicalLabel}</span>
      </div>
      <button type="button" className="mesh-role-launcher-action" onClick={onOpen}>
        <span className="sr-only">Open preview</span>
        <span aria-hidden="true">Open workspace →</span>
      </button>
    </aside>
  );
}
