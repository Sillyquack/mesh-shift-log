import { useRef, useState } from "react";
import { applyRoutineProductionAmendment, loadRoutineProductionAmendmentPlan } from "../api/routineProductionReadinessAmendmentClient.js";
import { amendmentOperationLabel, ROUTINE_PRODUCTION_AMENDMENT_HASH } from "../data/routineProductionReadinessAmendmentModel.js";
import { createIdempotencyKey, shortHash } from "../data/routineManagerModel.js";
import { StatusPill } from "./RoutineManagerPrimitives.jsx";

const referenceKeys = ["coffee-canister-lunch-reserve", "coffee-canister-rinsed-storage"];

export default function RoutineProductionReadinessAmendment({ providerHash, onApplied }) {
  const [plan, setPlan] = useState(null);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [evidence, setEvidence] = useState([]);
  const referenceIdempotencyKeys = useRef(null);
  if (!referenceIdempotencyKeys.current) referenceIdempotencyKeys.current = Object.fromEntries(referenceKeys.map((key) => [key, createIdempotencyKey()]));
  if (providerHash !== ROUTINE_PRODUCTION_AMENDMENT_HASH) return null;

  const preview = async () => {
    setStatus("loading"); setMessage("");
    try { const result = await loadRoutineProductionAmendmentPlan(); setPlan(result.plan); setStatus("ready"); }
    catch (error) { setStatus("error"); setMessage(error.message); }
  };
  const apply = async () => {
    if (!plan || !confirmed || status === "applying") return;
    setStatus("applying"); setMessage("");
    try {
      const result = await applyRoutineProductionAmendment({ referenceIdempotencyKeys: referenceIdempotencyKeys.current });
      setPlan(result.plan); setEvidence(result.evidence); setConfirmed(false); setStatus("complete");
      setMessage("Reviewed 1.2R draft amendment applied and read back. Nothing was installed, published or made operational.");
      await onApplied?.();
    } catch (error) {
      setEvidence(error.completedEvidence || []); setStatus("error");
      setMessage(`${error.message}${error.remainingResource ? ` Remaining group: ${error.remainingResource}.` : ""}`);
    }
  };

  return <section className="rm-card rm-form" data-production-amendment-state={status}>
    <header><h3>Reviewed 1.2R draft amendment</h3><StatusPill state={plan?.complete ? "ready" : status === "error" ? "blocked" : "warning"}>{plan?.complete ? "Applied" : "Manager RPC only"}</StatusPill></header>
    <p>Applies only the locked terminology diff to the existing Opening and Closing drafts. It cannot install, publish, promote or create operative data.</p>
    <p>Provider: <code>{shortHash(providerHash)}</code></p>
    {!plan ? <button type="button" className="ghost-button" disabled={status === "loading"} onClick={preview}>{status === "loading" ? "Building exact diff…" : "Build exact amendment diff"}</button> : <>
      <p><strong>{plan.operations.length}</strong> remaining resource mutations; <strong>{plan.remainders.length}</strong> allowed non-semantic remainder.</p>
      <ul className="rm-issues">{plan.operations.map((operation) => <li key={`${operation.kind}-${operation.id || operation.key}`}>{amendmentOperationLabel(operation)}</li>)}</ul>
      {plan.remainders.map((entry) => <p className="rm-note" key={entry.key}>{entry.key}: {entry.reason}</p>)}
      {!plan.complete ? <><label className="rm-check"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> I confirm this applies only the reviewed 1.1R→1.2R draft amendment through existing manager RPCs.</label>
        <button type="button" className="primary-button" disabled={!confirmed || status === "applying"} onClick={apply}>{status === "applying" ? "Applying and reading back…" : "Apply reviewed draft amendment"}</button></> : null}
    </>}
    {evidence.length ? <details><summary>Sanitized operation evidence</summary><ul>{evidence.map((entry) => <li key={entry.resource}>{entry.resource}: rev {entry.beforeRevision} → {entry.afterRevision}; idempotency {entry.idempotency}</li>)}</ul></details> : null}
    <p role={status === "error" ? "alert" : "status"}>{message}</p>
  </section>;
}
