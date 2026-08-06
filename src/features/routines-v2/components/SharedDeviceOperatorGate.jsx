import { useEffect, useRef, useState } from "react";
import { useRoutineOperatorIdentity } from "../hooks/useRoutineOperatorIdentity.js";

export default function SharedDeviceOperatorGate({ organizationId, deviceAuthUserId, onAuthenticated, operatorApi }) {
  const identity = useRoutineOperatorIdentity({ enabled: true, api: operatorApi, organizationId, deviceAuthUserId });
  const [selectedOperatorId, setSelectedOperatorId] = useState("");
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState("");
  const firstOperatorRef = useRef(null);

  useEffect(() => { if (!identity.session && identity.status === "ready") firstOperatorRef.current?.focus(); }, [identity.session, identity.status]);

  async function submit(event) {
    event.preventDefault();
    if (!selectedOperatorId || !pin || identity.status === "authenticating") return;
    setMessage("");
    try {
      const result = await identity.authenticate({ operatorId: selectedOperatorId, pin });
      setPin("");
      if (!result.ok) { setMessage("Operator sign-in failed. Check the PIN or wait before trying again."); return; }
      await onAuthenticated?.();
    } catch {
      setPin("");
      setMessage("Operator sign-in failed. Check the PIN or wait before trying again.");
    }
  }

  function moveOperatorFocus(event) {
    if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    const options = [...event.currentTarget.querySelectorAll('[role="radio"]:not(:disabled)')];
    if (!options.length) return;
    event.preventDefault();
    const current = options.indexOf(document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
      : ["ArrowUp", "ArrowLeft"].includes(event.key) ? (current <= 0 ? options.length - 1 : current - 1)
        : (current + 1) % options.length;
    options[next].focus();
    options[next].click();
  }

  if (identity.status === "loading") return <section className="routine-state-card" role="status" aria-live="polite"><h2>Loading operator access…</h2></section>;
  if (identity.status === "error") return (
    <section className="routine-state-card" role="alert"><h2>Operator access unavailable</h2><p>The device could not load its authorized operators.</p>
      <button type="button" className="primary-button" onClick={identity.refresh}>Try again</button></section>
  );

  return (
    <main className="routine-operator-gate">
      <section className="routine-operator-card">
        <div className="routine-gate-heading"><p className="eyebrow">{identity.device?.label || "Workbar Device"}</p><h1>Who is working now?</h1>
          <p>Select your own operator identity. The device account never becomes the employee identity.</p></div>
        <form onSubmit={submit} className="routine-operator-form">
          <fieldset disabled={identity.status === "authenticating" || identity.status === "ending"}>
            <legend>Choose operator</legend>
            <div className="routine-operator-list" role="radiogroup" aria-label="Available operators" onKeyDown={moveOperatorFocus}>
              {identity.operators.map((operator, index) => (
                <button ref={index === 0 ? firstOperatorRef : null} key={operator.id} type="button" role="radio"
                  aria-checked={selectedOperatorId === operator.id} disabled={operator.locked}
                  className={`routine-operator-option ${selectedOperatorId === operator.id ? "selected" : ""}`}
                  onClick={() => { setSelectedOperatorId(operator.id); setMessage(""); }}>
                  <span><strong>{operator.displayName}</strong><small>{operator.role || "staff"}</small></span>
                  <span>{operator.locked ? "Temporarily unavailable" : selectedOperatorId === operator.id ? "Selected" : "Choose"}</span>
                </button>
              ))}
            </div>
            {!identity.operators.length && <p className="routine-empty-copy">No pilot operators are available for this device.</p>}
            <label className="routine-pin-field">PIN
              <input type="password" inputMode="numeric" pattern="[0-9]*" autoComplete="off" autoCorrect="off" spellCheck={false}
                value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 12))}
                disabled={!selectedOperatorId} aria-describedby="routine-pin-help" />
            </label>
            <small id="routine-pin-help">Your PIN is sent only for server verification and is cleared after every attempt.</small>
          </fieldset>
          <div className="routine-gate-actions">
            <button type="submit" className="primary-button" disabled={!selectedOperatorId || pin.length < 6 || identity.status === "authenticating"}>
              {identity.status === "authenticating" ? "Signing in…" : "Open preview"}
            </button>
          </div>
          <p className="routine-auth-message" role="status" aria-live="assertive">{message}</p>
        </form>
      </section>
    </main>
  );
}
