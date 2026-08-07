import { useState } from "react";

export default function RoutineDoubleShiftReassignment({ context, pending, onReassign }) {
  const [profileId, setProfileId] = useState("");
  const [reason, setReason] = useState("");
  const action = context.actions?.canReassignClosing;
  return <section className="employee-ds-card"><p className="eyebrow">Closing responsibility</p><h2>Reassignment</h2>
    <p>Current Closing assignment: <strong>{context.reassignmentState?.closingAssignedTo ?? "Server assigned"}</strong></p>
    <p>Opening contribution remains attributed to its original participant.</p>
    {action?.allowed && <div className="employee-form-grid"><label>Replacement user profile ID<input value={profileId} onChange={(event) => setProfileId(event.target.value)} autoComplete="off" /></label>
      <label>Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <button type="button" className="employee-primary" disabled={pending || !profileId.trim() || !reason.trim()} onClick={() => onReassign?.({ toUserProfileId: profileId, reason })}>Reassign Closing</button></div>}
    {!action?.allowed && <small>{action?.reasonCode ?? "Reassignment is not available for this actor."}</small>}</section>;
}
