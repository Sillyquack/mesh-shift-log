import { useState } from "react";
import { promoteRoutineUiReleaseStage, setRoutinePilotNewWorkPaused } from "../api/routineReleaseClient.js";
import { releaseErrorMessage } from "../data/routineReleaseModel.js";
import { useRoutineReleaseGate } from "../hooks/useRoutineReleaseGate.js";
import RoutinePilotHealth from "./RoutinePilotHealth.jsx";
import { useRoutineDialogFocusTrap } from "./useRoutineDialogFocusTrap.js";
import "./RoutineHistory.css";
import "./RoutineHistoryExperience.css";

export default function RoutineReleaseGate({
  loader,
  promotionApi = promoteRoutineUiReleaseStage,
  pauseApi = setRoutinePilotNewWorkPaused,
}) {
  const gate = useRoutineReleaseGate({ loader });
  const [note, setNote] = useState("");
  const [pauseReason, setPauseReason] = useState("");
  const [dialog, setDialog] = useState(null);
  const [state, setState] = useState({ busy: false, error: null });
  const { dialogRef, trapFocus } = useRoutineDialogFocusTrap(Boolean(dialog));

  if (!gate.data && gate.status === "loading") {
    return <section className="rh-state" role="status">Computing server-authoritative readiness…</section>;
  }
  if (!gate.data) {
    return <section className="rh-state" role="alert"><h2>Release gate unavailable</h2><button type="button" onClick={gate.refresh}>Try again</button></section>;
  }

  const submitPromotion = async (event) => {
    event.preventDefault();
    setState({ busy: true, error: null });
    try {
      await promotionApi({
        expectedRevision: gate.data.settingsRevision,
        expectedReadinessHash: gate.data.readinessHash,
        note,
        idempotencyKey: crypto.randomUUID(),
      });
      setNote("");
      setDialog(null);
      await gate.refresh();
    } catch (error) {
      setState({ busy: false, error });
    }
  };

  const submitPause = async (event) => {
    event.preventDefault();
    setState({ busy: true, error: null });
    try {
      await pauseApi({
        paused: !gate.data.pilotNewWorkPaused,
        reason: pauseReason,
        expectedRevision: gate.data.settingsRevision,
        idempotencyKey: crypto.randomUUID(),
      });
      setPauseReason("");
      setDialog(null);
      await gate.refresh();
    } catch (error) {
      setState({ busy: false, error });
    }
  };

  const ready = gate.data.ready === true;
  const statusLabel = ready ? "Ready for the next controlled step" : "Not ready to promote";

  return (
    <div className="rh-workspace mesh-history-experience">
      <header className="mesh-readiness-hero">
        <div>
          <p className="eyebrow">Production readiness</p>
          <h2>{statusLabel}</h2>
          <p>The server recomputes every category and the readiness hash. Nothing promotes, activates or pauses itself.</p>
          <button type="button" onClick={gate.refresh}>Recompute readiness</button>
        </div>
        <div className={`mesh-readiness-status ${ready ? "is-ready" : "is-blocked"}`} role="status">
          <div><strong>{ready ? "GO" : "NO-GO"}</strong><span>{ready ? "gate clear" : "action required"}</span></div>
        </div>
      </header>

      <section className="mesh-readiness-facts" aria-label="Release facts">
        <article><span>Current stage</span><strong>{gate.data.currentStage}</strong></article>
        <article><span>Current mode</span><strong>{gate.data.currentMode}</strong></article>
        <article><span>New pilot work</span><strong>{gate.data.pilotNewWorkPaused ? "Paused" : "Allowed by current mode"}</strong></article>
      </section>

      <RoutinePilotHealth readiness={gate.data} />

      <details className="mesh-release-controls">
        <summary>Controlled release actions</summary>
        <section className="rh-section rh-release-actions">
          <h3>Controlled actions</h3>
          <button
            type="button"
            disabled={!gate.data.ready || gate.data.currentStage !== "staff_preview"}
            onClick={() => {
              setState({ busy: false, error: null });
              setDialog("promote");
            }}
          >Attest and promote to pilot_ready</button>
          <button
            type="button"
            className="danger-button"
            disabled={gate.data.currentMode !== "pilot"}
            onClick={() => {
              setState({ busy: false, error: null });
              setDialog("pause");
            }}
          >{gate.data.pilotNewWorkPaused ? "Resume new pilot work" : "Pause new pilot work"}</button>
          <p>Promotion never changes mode. Pilot activation remains a separate controlled manager action.</p>
        </section>
      </details>

      {dialog && (
        <div className="rh-dialog-backdrop">
          <section
            ref={dialogRef}
            className="rh-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="release-dialog-title"
            onKeyDown={(event) => {
              trapFocus(event);
              if (event.key === "Escape") setDialog(null);
            }}
          >
            <form onSubmit={dialog === "promote" ? submitPromotion : submitPause}>
              <header>
                <h2 id="release-dialog-title">{dialog === "promote" ? "Pilot-ready attestation" : gate.data.pilotNewWorkPaused ? "Resume new pilot work" : "Emergency pause"}</h2>
                <p>{dialog === "promote" ? "The readiness hash is recomputed inside the same transaction." : "Active work can continue; only new work is blocked."}</p>
              </header>
              <label>
                {dialog === "promote" ? "Attestation note" : "Reason"}
                <textarea
                  required
                  minLength="3"
                  value={dialog === "promote" ? note : pauseReason}
                  onChange={(event) => dialog === "promote" ? setNote(event.target.value) : setPauseReason(event.target.value)}
                  aria-describedby={state.error ? "release-error" : undefined}
                />
              </label>
              {state.error && <p id="release-error" className="rh-error" role="alert">{releaseErrorMessage(state.error.kind)}</p>}
              <footer>
                <button type="button" onClick={() => setDialog(null)}>Cancel</button>
                <button type="submit" disabled={state.busy}>{state.busy ? "Submitting…" : "Confirm controlled action"}</button>
              </footer>
            </form>
          </section>
        </div>
      )}

      <span className="sr-only">Server-authoritative release control · Release gate · Current stage: {gate.data.currentStage} · mode: {gate.data.currentMode}. Nothing changes automatically.</span>
    </div>
  );
}
