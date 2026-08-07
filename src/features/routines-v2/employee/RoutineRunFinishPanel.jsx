import { useState } from "react";

export default function RoutineRunFinishPanel({ context, pending, onAction }) {
  const [reason, setReason] = useState(""); const [finishOpen, setFinishOpen] = useState(false);
  const validation = context.completionValidation ?? {}; const blockers = validation.blockers ?? []; const warnings = validation.warnings ?? [];
  const actions = context.actions ?? {}; const run = context.run?.run ?? context.run;
  return <section className="employee-finish-panel"><p className="eyebrow">Run boundary</p><h2>Finish and verification</h2>
    <div className="employee-finish-grid"><article><strong>{blockers.length}</strong><span>Blockers</span><ul>{blockers.map((item, index) => <li key={item.code ?? index}>{item.message ?? item.code ?? item}</li>)}</ul></article>
      <article><strong>{warnings.length}</strong><span>Warnings</span><ul>{warnings.map((item, index) => <li key={item.code ?? index}>{item.message ?? item.code ?? item}</li>)}</ul></article>
      <article><strong>{context.pendingTransfers?.length ?? 0}</strong><span>Pending transfers</span></article><article><strong>{context.handoverRequirements?.length ?? 0}</strong><span>Handover requirements</span></article></div>
    {context.deliveryPreview && <details open><summary>Closing delivery preview</summary><pre className="employee-json-summary">{JSON.stringify(context.deliveryPreview, null, 2)}</pre></details>}
    <div className="employee-actions"><button type="button" disabled={!actions.canRequestFinalVerification?.allowed || pending} onClick={() => onAction("requestFinalVerification", { runId: run.id, expectedRevision: run.revision })}>Request final verification</button>
      <button type="button" className="employee-primary" disabled={!actions.canFinish?.allowed || pending} onClick={() => setFinishOpen(true)}>Finish run</button></div>
    {finishOpen && <div className="employee-inline-confirm"><p>The server will validate blockers again and generate delivery evidence. The run changes only after the applied receipt.</p>
      <button type="button" disabled={pending} onClick={() => onAction("finishRoutineRun", { runId: run.id, expectedRevision: run.revision })}>Finish with server validation</button></div>}
    {(actions.canReopen?.allowed || actions.canCancel?.allowed) && <div className="employee-admin-actions"><label>Reason<input value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      {actions.canReopen?.allowed && <button type="button" disabled={!reason.trim() || pending} onClick={() => onAction("reopenRoutineRun", { runId: run.id, expectedRevision: run.revision, reason })}>Reopen run</button>}
      {actions.canCancel?.allowed && <button type="button" disabled={!reason.trim() || pending} onClick={() => onAction("cancelRoutineRun", { runId: run.id, expectedRevision: run.revision, reason })}>Cancel run</button>}</div>}
    {!actions.canFinish?.allowed && <small>{actions.canFinish?.reasonCode}</small>}</section>;
}
