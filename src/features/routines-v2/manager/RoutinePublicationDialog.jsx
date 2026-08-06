import { useState } from "react";
import { createIdempotencyKey } from "../data/routineManagerModel.js";
import { Field, Modal } from "./RoutineManagerPrimitives.jsx";
import RoutineTemplateDiffPanel from "./RoutineTemplateDiffPanel.jsx";

export default function RoutinePublicationDialog({ versions, preview, onClose, onPublish }) {
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [idempotencyKey] = useState(createIdempotencyKey);
  const publish = async () => {
    if (!confirmed || !note.trim()) return;
    setBusy(true);
    try {
      const result = await onPublish({ versionIds: versions.map((version) => version.id || version.versionId), expectedRevisions: Object.fromEntries(versions.map((version) => [version.id || version.versionId, version.revision])), publishNote: note, idempotencyKey });
      setMessage(`Published atomically${result?.batch?.id ? ` · batch ${result.batch.id}` : ""}.`);
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  };
  return <Modal title={versions.length > 1 ? "Publish batch" : "Publish template"} onClose={onClose} actions={<><button type="button" className="ghost-button" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="primary-button" disabled={busy || !confirmed || !note.trim() || preview?.valid === false} onClick={publish}>{busy ? "Publishing…" : "Publish atomically"}</button></>}>
    <p>{versions.length} draft version(s). One invalid version blocks the complete batch. Single publication uses this same atomic batch RPC.</p>
    {preview?.crossTemplateRelations?.length ? <details><summary>Cross-template relations ({preview.crossTemplateRelations.length})</summary><ul>{preview.crossTemplateRelations.map((relation, index) => <li key={index}>{relation.targetRoutineKey} · {relation.targetTaskKey} · {relation.relationType}</li>)}</ul></details> : null}
    {preview?.blockers?.length ? <ul className="rm-issues rm-blockers">{preview.blockers.map((item, index) => <li key={index}>{item.issue?.message || JSON.stringify(item.issue)}</li>)}</ul> : null}
    {preview?.warnings?.length ? <ul className="rm-issues">{preview.warnings.map((item, index) => <li key={index}>{item.issue?.message || JSON.stringify(item.issue)}</li>)}</ul> : null}
    {preview?.versions?.map((version) => <RoutineTemplateDiffPanel key={version.versionId} diff={version.diffSummary} />)}
    <Field id="publish-note" label="Publish note" help="Required immutable publication note."><textarea id="publish-note" value={note} onChange={(event) => setNote(event.target.value)} /></Field>
    <label className="rm-check"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> I confirm that these immutable versions should be published.</label>
    <p className="rm-note">A retry from this open dialog reuses the same idempotency key. A failed batch is never split into separate publications.</p>
    <p role="status">{message}</p>
  </Modal>;
}
