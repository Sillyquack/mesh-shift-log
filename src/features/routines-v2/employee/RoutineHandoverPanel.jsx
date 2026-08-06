import { useEffect, useRef, useState } from "react";
import { useRoutineHandover } from "../hooks/useRoutineHandover.js";

export default function RoutineHandoverPanel({ handoverId, initialContext, loader, api }) {
  const handover = useRoutineHandover(handoverId, { loader, api }); const context = handover.context ?? initialContext;
  const [summary, setSummary] = useState(context?.handover?.summary ?? ""); const [manualItems, setManualItems] = useState(() => context?.items?.filter((item) => item.source === "manual") ?? []);
  const draftTouched = useRef(false);
  useEffect(() => {
    if (!context || draftTouched.current) return;
    setSummary(context.handover?.summary ?? "");
    setManualItems(context.items?.filter((item) => (item.source ?? item.source_type) === "manual") ?? []);
  }, [context]);
  if (!context) return <section className="employee-panel" role="status">Loading handover…</section>;
  const record = context.handover; const actions = context.actions;
  const save = () => handover.execute("replaceDraft", { handoverId: record.id, summary,
    manualItems: manualItems.map((item) => ({ sourceTaskId: item.sourceTaskId ?? item.source_task_id ?? undefined,
      category: item.category || "operational", title: item.title ?? item.label, details: item.details || undefined,
      severity: item.severity || "normal", responsibleParticipantId: item.responsibleParticipantId ?? item.responsible_participant_id ?? undefined,
      dueAt: item.dueAt ?? item.due_at ?? undefined })), expectedRevision: record.revision });
  return <section className="employee-panel"><p className="eyebrow">{context.actorRelation} · {record.status}</p><h3>Handover</h3>
    <label>Summary<textarea value={summary} onChange={(event) => { draftTouched.current = true; setSummary(event.target.value); }} disabled={!actions.canEdit?.allowed} /></label>
    <ul className="employee-handover-items">{(context.items ?? []).filter((item) => (item.source ?? item.source_type) !== "manual").map((item) => <li key={item.id}><strong>{item.title ?? item.label}</strong><span>Generated · cannot be deleted</span></li>)}
      {manualItems.map((item, index) => <li key={item.id ?? item.clientKey}><div className="employee-form-grid"><label>Category<select value={item.category ?? "operational"} disabled={!actions.canEdit?.allowed} onChange={(event) => { draftTouched.current = true; setManualItems((items) => items.map((entry, entryIndex) => entryIndex === index ? { ...entry, category: event.target.value } : entry)); }}><option value="operational">Operational</option><option value="timing">Timing</option><option value="safety">Safety</option><option value="service">Service</option></select></label>
        <label>Manual item<input value={item.title ?? item.label ?? ""} disabled={!actions.canEdit?.allowed} onChange={(event) => { draftTouched.current = true; setManualItems((items) => items.map((entry, entryIndex) => entryIndex === index ? { ...entry, title: event.target.value } : entry)); }} /></label>
        <label>Severity<select value={item.severity ?? "normal"} disabled={!actions.canEdit?.allowed} onChange={(event) => { draftTouched.current = true; setManualItems((items) => items.map((entry, entryIndex) => entryIndex === index ? { ...entry, severity: event.target.value } : entry)); }}><option value="normal">Normal</option><option value="important">Important</option><option value="critical">Critical</option></select></label>
        <label>Due time<input type="datetime-local" value={(item.dueAt ?? item.due_at ?? "").slice(0, 16)} disabled={!actions.canEdit?.allowed} onChange={(event) => { draftTouched.current = true; setManualItems((items) => items.map((entry, entryIndex) => entryIndex === index ? { ...entry, dueAt: event.target.value } : entry)); }} /></label>
        <label className="employee-form-wide">Details<textarea value={item.details ?? ""} disabled={!actions.canEdit?.allowed} onChange={(event) => { draftTouched.current = true; setManualItems((items) => items.map((entry, entryIndex) => entryIndex === index ? { ...entry, details: event.target.value } : entry)); }} /></label></div>
        {actions.canEdit?.allowed && <button type="button" onClick={() => { draftTouched.current = true; setManualItems((items) => items.filter((_, entryIndex) => entryIndex !== index)); }}>Remove manual item</button>}</li>)}</ul>
    {actions.canEdit?.allowed && <button type="button" onClick={() => { draftTouched.current = true; setManualItems((items) => [...items, { clientKey: crypto.randomUUID(), category: "operational", title: "New manual handover item", severity: "normal" }]); }}>Add manual item</button>}
    <div className="employee-actions"><button type="button" disabled={!actions.canEdit?.allowed || handover.pending} onClick={save}>Save draft</button>
      <button type="button" disabled={!actions.canRefresh?.allowed || handover.pending} onClick={() => handover.execute("refreshGenerated", { handoverId: record.id, expectedRevision: record.revision })}>Refresh generated items</button>
      <button type="button" className="employee-primary" disabled={!actions.canSubmit?.allowed || handover.pending} onClick={() => handover.execute("submit", { handoverId: record.id, expectedRevision: record.revision })}>Submit</button>
      <button type="button" className="employee-primary" disabled={!actions.canAccept?.allowed || handover.pending} onClick={() => handover.execute("accept", { handoverId: record.id, expectedRevision: record.revision })}>Accept</button></div>
    {handover.error && <p role="alert">Handover refresh failed. Manual items and summary are preserved.</p>}</section>;
}
