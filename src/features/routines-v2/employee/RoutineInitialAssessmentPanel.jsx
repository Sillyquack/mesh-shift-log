import { useState } from "react";
import RoutinePreviousDeliveryCard from "./RoutinePreviousDeliveryCard.jsx";

export default function RoutineInitialAssessmentPanel({ policy = {}, previousDelivery, comparison, disabled, onSubmit }) {
  const [choice, setChoice] = useState(""); const [reasonCode, setReasonCode] = useState(""); const [details, setDetails] = useState("");
  if (policy.recorded) return <section className="employee-assessment"><strong>Initial assessment</strong><p>{policy.result ?? "Recorded"}</p>
    <small>Server-confirmed and read-only{policy.recordedBy ? ` · ${policy.recordedBy}` : ""}{policy.recordedAt ? ` · ${new Date(policy.recordedAt).toLocaleString()}` : ""}</small></section>;
  if (!policy.policy || policy.policy === "none") return null;
  const ready = policy.policy === "ready_on_arrival";
  const choices = ready ? [["ready", "Already at standard"], ["correction_required", "Correction required"]]
    : [["ready", "No issue found"], ["control_issue_found", "Issue found"]];
  const issue = ["correction_required", "control_issue_found"].includes(choice);
  return <section className="employee-assessment"><RoutinePreviousDeliveryCard delivery={previousDelivery} comparison={comparison} /><h3>Initial assessment</h3>
    <fieldset><legend>Record the condition before work starts</legend>{choices.map(([value, label]) => <label key={value}><input type="radio" name="assessment" value={value} checked={choice === value} onChange={(event) => setChoice(event.target.value)} disabled={disabled} />{label}</label>)}</fieldset>
    {issue && <div className="employee-form-grid"><label>Reason code<input value={reasonCode} onChange={(event) => setReasonCode(event.target.value)} required /></label>
      <label>Short explanation<textarea value={details} onChange={(event) => setDetails(event.target.value)} required /></label></div>}
    <button type="button" className="employee-primary" disabled={disabled || !choice || (issue && (!reasonCode.trim() || !details.trim()))}
      onClick={() => onSubmit?.({ assessment: choice, reasonCode, details })}>Record assessment</button></section>;
}
