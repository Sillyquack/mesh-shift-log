import { useState } from "react";

export default function RoutineDoubleShiftTransition({ context, pending, onSubmit }) {
  const [choice, setChoice] = useState("continuing_on_site"); const [expectedReturnTime, setExpectedReturnTime] = useState("");
  const [interimOwnerProfileId, setInterimOwnerProfileId] = useState(""); const [reason, setReason] = useState("");
  const returnRequired = choice === "temporarily_away"; const interimRequired = choice === "handing_operation_to_another";
  const reasonRequired = choice === "unable_to_complete_closing" || interimRequired;
  return <section className="employee-ds-card"><p className="eyebrow">DS02 · Opening complete</p><h2>Transition between shifts</h2>
    <div className="employee-summary-cards"><article><strong>Corrections</strong><span>{context.openingSummary?.corrections ?? 0}</span></article><article><strong>Open deviations</strong><span>{context.openingSummary?.openDeviations ?? 0}</span></article>
      <article><strong>Rooms and serviceware</strong><span>{context.openingSummary?.rooms ?? "Server summary"}</span></article><article><strong>Events and technical</strong><span>{context.openingSummary?.technicalIssues ?? 0}</span></article></div>
    <fieldset><legend>What happens next?</legend>{[["continuing_on_site", "Continuing on site"], ["temporarily_away", "Temporarily away"], ["handing_operation_to_another", "Handing operation to another"], ["unable_to_complete_closing", "Unable to complete Closing"]].map(([value, label]) => <label key={value}><input type="radio" name="transition" value={value} checked={choice === value} onChange={(event) => setChoice(event.target.value)} />{label}</label>)}</fieldset>
    {(returnRequired || interimRequired || reasonRequired) && <div className="employee-form-grid">
      {returnRequired && <label>Expected return time<input type="time" value={expectedReturnTime} onChange={(event) => setExpectedReturnTime(event.target.value)} /></label>}
      {interimRequired && <label>Interim owner profile ID<input value={interimOwnerProfileId} onChange={(event) => setInterimOwnerProfileId(event.target.value)} autoComplete="off" /></label>}
      {reasonRequired && <label>Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label>}</div>}
    <button type="button" className="employee-primary" disabled={!context.actions?.canSubmitDS02?.allowed || pending
      || (returnRequired && !expectedReturnTime) || (interimRequired && !interimOwnerProfileId.trim()) || (reasonRequired && !reason.trim())}
      onClick={() => onSubmit?.({ transitionStatus: choice, expectedReturnLocalTime: expectedReturnTime || undefined,
        interimOwnerProfileId: interimOwnerProfileId || undefined, note: reason || undefined })}>Submit transition</button></section>;
}
