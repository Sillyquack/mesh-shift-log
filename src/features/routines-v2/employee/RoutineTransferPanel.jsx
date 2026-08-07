import { useState } from "react";
import { useRoutineTransfer } from "../hooks/useRoutineTransfer.js";
import RoutineTaskItemControl from "./RoutineTaskItemControl.jsx";
import RoutineCriticalReauthDialog from "./RoutineCriticalReauthDialog.jsx";
import { routineItemDraftValue, routineItemMutationValue, validateRoutineItemDraft } from "../data/routineTaskViewModel.js";

export default function RoutineTransferPanel({ transferId, initialContext, loader, api, reauthApi }) {
  const transfer = useRoutineTransfer(transferId, { loader, api }); const context = transfer.context ?? initialContext;
  const [note, setNote] = useState(""); const [physical, setPhysical] = useState(false); const [critical, setCritical] = useState(false);
  const [resultCode, setResultCode] = useState("standard_met"); const [evidence, setEvidence] = useState({}); const [reauthPayload, setReauthPayload] = useState(null);
  if (!context) return <section className="employee-panel" role="status">Loading transfer…</section>;
  const record = context.transfer; const actions = context.actions; const event = context.eventContext;
  const eventItems = Array.isArray(event?.evidenceRequirements) ? event.evidenceRequirements : event?.evidenceRequirements?.items ?? [];
  const execute = (action, extra = {}) => transfer.execute(event ? `${action}Event` : action, { transferId: record.id, expectedRevision: record.revision, expectedTransferRevision: record.revision, ...extra });
  const eventEvidence = () => ({ items: eventItems.map((item) => ({ itemKey: item.itemKey ?? item.item_key_snapshot,
    status: "completed", value: routineItemMutationValue(item, evidence[item.itemKey ?? item.id] ?? routineItemDraftValue(item)), resultCode: null, note: null })),
    summary: note.trim() || undefined });
  const evidenceInvalid = eventItems.some((item) => {
    const value = evidence[item.itemKey ?? item.id] ?? routineItemDraftValue(item);
    const itemType = item.itemType ?? item.item_type_snapshot;
    return Boolean(validateRoutineItemDraft(item, value)) || ((item.required ?? item.required_snapshot) && (value === "" || value == null || (itemType === "check" && value !== true)));
  });
  const complete = async () => {
    const payload = event ? { resultCode, evidence: eventEvidence(), physicalCheckConfirmed: physical,
      criticalConfirmation: critical, completionNote: note } : { note };
    if (event && context.criticalReauthRequired) { setReauthPayload(payload); return; }
    await execute("complete", payload);
  };
  return <section className="employee-panel"><p className="eyebrow">{context.actorRelation} · {record.status}</p><h3>{event ? "Event recipient evidence" : "Task transfer"}</h3>
    <p><strong>{context.sourceTask?.title}</strong> · {context.sourceTask?.location}</p><p>{record.reason}</p>
    {eventItems.map((item) => { const key = item.itemKey ?? item.id; return <RoutineTaskItemControl key={key} item={item}
      value={evidence[key] ?? routineItemDraftValue(item)} onChange={(value) => setEvidence((current) => ({ ...current, [key]: value }))} />; })}
    {event && <><label>Completion result<select value={resultCode} onChange={(eventValue) => setResultCode(eventValue.target.value)}>
      <option value="standard_met">Standard met</option><option value="completed_after_correction">Completed after correction</option>
      <option value="control_completed_with_deviation">Completed with deviation</option><option value="completed_with_manager_override">Completed with manager override</option>
    </select></label><label className="employee-critical-check"><input type="checkbox" checked={physical} onChange={(eventValue) => setPhysical(eventValue.target.checked)} />Physical check completed</label>
      {context.criticalConfirmationRequired && <label className="employee-critical-check"><input type="checkbox" checked={critical} onChange={(eventValue) => setCritical(eventValue.target.checked)} />I confirm this critical Event-transfer evidence.</label>}</>}
    <label>Response note<textarea value={note} onChange={(eventValue) => setNote(eventValue.target.value)} /></label>
    <div className="employee-actions"><button type="button" disabled={!actions.canAccept?.allowed || transfer.pending} onClick={() => execute("accept")}>Accept</button>
      <button type="button" disabled={!actions.canReject?.allowed || transfer.pending || !note.trim()} onClick={() => execute("reject", { reason: note })}>Reject</button>
      <button type="button" className="employee-primary" disabled={!actions.canComplete?.allowed || transfer.pending || (event && (!physical || evidenceInvalid
        || (context.criticalConfirmationRequired && !critical) || (["completed_after_correction","control_completed_with_deviation"].includes(resultCode) && !note.trim())))} onClick={complete}>Complete transfer</button>
      <button type="button" disabled={!actions.canCancel?.allowed || transfer.pending || !note.trim()} onClick={() => execute("cancel", { reason: note })}>Cancel</button></div>
    {transfer.error && <p role="alert">The transfer request failed. Evidence and notes are preserved.</p>}
    {reauthPayload && <RoutineCriticalReauthDialog api={reauthApi} onClose={() => setReauthPayload(null)} onAuthenticated={async () => {
      const payload = reauthPayload; setReauthPayload(null); await execute("complete", payload);
    }} />}</section>;
}
