import { useState } from "react";
import { createIdempotencyKey } from "../data/routineManagerModel.js";
import { Field, Modal, StatusPill } from "./RoutineManagerPrimitives.jsx";

function serverRevision(error) {
  const direct = error?.serverRevision ?? error?.cause?.serverRevision;
  if (Number.isFinite(Number(direct))) return Number(direct);
  try {
    const details = JSON.parse(error?.cause?.details || error?.details || "{}");
    return Number.isFinite(Number(details.serverRevision)) ? Number(details.serverRevision) : null;
  } catch { return null; }
}

function preservedMessage(kind, targetActive) {
  const action = targetActive ? "activation" : "deactivation";
  if (kind === "stale") return `The server revision changed. Your ${action} reason is preserved.`;
  if (kind === "network") return `The server could not be reached. Retry ${action} with the same request key; your reason is preserved.`;
  if (kind === "auth") return `Your sign-in expired. Your ${action} reason is preserved.`;
  if (kind === "validation") return `The server rejected ${action}. Review the reason; it is preserved.`;
  return `The server did not confirm ${action}. Your reason is preserved.`;
}

export default function RoutineTemplateActiveDialog({ template, onClose, onConfirm }) {
  const targetActive = !template.active;
  const [reason, setReason] = useState("");
  const [idempotencyKey] = useState(createIdempotencyKey);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const submit = async () => {
    if (reason.trim().length < 3) {
      setFailure({ kind: "validation", message: "Provide a trimmed reason of at least 3 characters.", serverRevision: null });
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      await onConfirm({ templateId: template.id, active: targetActive, expectedRevision: template.revision, reason: reason.trim(), idempotencyKey });
      onClose();
    } catch (error) {
      const kind = error?.kind || "server";
      setFailure({ kind, message: preservedMessage(kind, targetActive), serverRevision: serverRevision(error) });
    } finally { setBusy(false); }
  };
  return <Modal title={`${targetActive ? "Activate" : "Deactivate"} ${template.name}`} onClose={onClose} closeDisabled={busy} actions={<><button type="button" className="ghost-button" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="primary-button" disabled={busy || reason.trim().length < 3} onClick={submit}>{busy ? "Waiting for server…" : `${targetActive ? "Activate" : "Deactivate"} template`}</button></>}>
    <div className="rm-stack">
      <div className="rm-actions"><StatusPill state={template.active ? "ready" : "blocked"}>{template.active ? "Active" : "Inactive"}</StatusPill><span>Logical revision {template.revision}</span></div>
      {!targetActive ? <p className="rm-consequence">Deactivation prevents new runs from using this template.<br />Published versions and historical runs are not changed.</p> : <p>Reactivation makes this logical template eligible for new runs again. It does not publish a version or change historical runs.</p>}
      <p className="rm-note">Published v{template.currentPublishedVersion?.versionNumber || "—"} and draft v{template.activeDraft?.versionNumber || "—"} remain unchanged.</p>
      <Field id="template-active-reason" label="Reason" help="Required for the immutable manager audit." error={failure?.kind === "validation" ? failure.message : null}><textarea id="template-active-reason" value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} /></Field>
      {failure ? <section className="rm-conflict" role="alert"><h3>{failure.kind === "stale" ? "Revision conflict" : "Request not confirmed"}</h3><p>{failure.message}</p>{failure.kind === "stale" ? <div className="rm-two-json"><pre>{JSON.stringify({ localRevision: template.revision, requestedActive: targetActive, reason }, null, 2)}</pre><pre>{JSON.stringify({ serverRevision: failure.serverRevision ?? "Refresh required", activeState: "Server authoritative" }, null, 2)}</pre></div> : null}</section> : null}
    </div>
  </Modal>;
}
