import { useState } from "react";
import { routineTemplateClient } from "../api/routineTemplateClient.js";
import { createIdempotencyKey, shortHash } from "../data/routineManagerModel.js";
import { EmptyState, Field, Modal, StatusPill } from "./RoutineManagerPrimitives.jsx";
import RoutinePublicationDialog from "./RoutinePublicationDialog.jsx";
import RoutineTemplateActiveDialog from "./RoutineTemplateActiveDialog.jsx";
import RoutineTemplateDiffPanel from "./RoutineTemplateDiffPanel.jsx";
import RoutineTemplateEditor from "./RoutineTemplateEditor.jsx";

export default function RoutineTemplatesManager({ templates, onRefresh, client = routineTemplateClient }) {
  const [editor, setEditor] = useState(null);
  const [creating, setCreating] = useState(false);
  const [create, setCreate] = useState({ routineKey: "", name: "", description: "" });
  const [selected, setSelected] = useState([]);
  const [publication, setPublication] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [activeDialog, setActiveDialog] = useState(null);
  const [message, setMessage] = useState("");
  if (editor) return <RoutineTemplateEditor templateId={editor.templateId} versionId={editor.versionId} onClose={() => { setEditor(null); onRefresh(); }} />;
  const createTemplate = async () => {
    try { const result = await client.createTemplate({ ...create, idempotencyKey: createIdempotencyKey() }); setCreating(false); setCreate({ routineKey: "", name: "", description: "" }); setEditor({ templateId: result.template.id, versionId: result.draft.id }); }
    catch (error) { setMessage(error.message); }
  };
  const openPublish = async (versions) => {
    try { const preview = await client.previewPublication(versions.map((version) => version.id)); setPublication({ versions, preview }); }
    catch (error) { setMessage(error.message); }
  };
  const compare = async (template) => {
    try { const diff = await client.getRoutineTemplateVersionDiff(template.currentPublishedVersion.id, template.activeDraft.id); setComparison({ name: template.name, diff }); }
    catch (error) { setMessage(error.message); }
  };
  return <section className="rm-stack">
    <header className="rm-section-heading"><div><p className="eyebrow">Versioned templates</p><h2>Template overview</h2></div><div className="rm-actions"><button type="button" className="ghost-button" onClick={() => setCreating(true)}>Create empty template</button><button type="button" className="primary-button" disabled={!selected.length} onClick={() => openPublish(templates.filter((template) => selected.includes(template.activeDraft?.id)).map((template) => template.activeDraft))}>Publish batch</button></div></header>
    {creating ? <form className="rm-card rm-form" onSubmit={(event) => { event.preventDefault(); createTemplate(); }}><div className="rm-field-grid"><Field id="new-routine-key" label="Routine key" help="Immutable logical key after creation."><input id="new-routine-key" value={create.routineKey} onChange={(event) => setCreate({ ...create, routineKey: event.target.value })} /></Field><Field id="new-template-name" label="Name" help="Manager-facing template name."><input id="new-template-name" value={create.name} onChange={(event) => setCreate({ ...create, name: event.target.value })} /></Field></div><Field id="new-template-description" label="Description" help="Optional."><textarea id="new-template-description" value={create.description} onChange={(event) => setCreate({ ...create, description: event.target.value })} /></Field><div className="rm-actions"><button className="primary-button">Create template and draft</button><button type="button" className="ghost-button" onClick={() => setCreating(false)}>Cancel</button></div></form> : null}
    {!templates.length ? <EmptyState title="No routine templates">Nothing is seeded automatically. Create an empty logical template when approved.</EmptyState> : <div className="rm-template-list">{templates.map((template) => {
      const validation = template.validation || {}; const blockers = validation.blockers || []; const warnings = validation.warnings || [];
      return <article className="rm-card" key={template.id}>
        <header><label className="rm-check"><input type="checkbox" disabled={!template.activeDraft} checked={selected.includes(template.activeDraft?.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, template.activeDraft.id] : selected.filter((id) => id !== template.activeDraft.id))} /><span><strong>{template.name}</strong><code>{template.routineKey}</code></span></label><StatusPill state={blockers.length ? "blocked" : warnings.length || template.activeDraft ? "warning" : "ready"}>{blockers.length ? `${blockers.length} blockers` : warnings.length ? `${warnings.length} warnings` : template.activeDraft ? "Draft" : "Published"}</StatusPill></header>
        <div className="rm-template-meta"><span>{template.active ? "Active logical template" : "Inactive logical template"}</span><span>Published v{template.currentPublishedVersion?.versionNumber || "—"}</span><span>Draft v{template.activeDraft?.versionNumber || "—"}</span><span title={template.currentPublishedVersion?.contentHash}>{shortHash(template.currentPublishedVersion?.contentHash)}</span><span>{template.counts?.sections || 0} sections · {template.counts?.tasks || 0} tasks · {template.counts?.items || 0} items · {template.counts?.references || 0} refs</span></div>
        <p className="rm-note">Updated {template.activeDraft?.updatedAt || template.updatedAt || "—"}{template.updatedBy ? ` by ${template.updatedBy}` : ""}</p>
        {template.linkedRelationships?.length ? <p>Linked Opening/Closing: {template.linkedRelationships.map((relation) => `${relation.targetRoutineKey}/${relation.targetTaskKey}`).join(", ")}</p> : <p className="rm-note">No linked Opening/Closing relationships.</p>}
        <div className="rm-actions">
          {template.activeDraft ? <button type="button" className="primary-button" onClick={() => setEditor({ templateId: template.id, versionId: template.activeDraft.id })}>Open draft</button> : template.currentPublishedVersion ? <button type="button" className="primary-button" onClick={async () => { const result = await client.createDraft({ templateId: template.id, basedOnVersionId: template.currentPublishedVersion.id, idempotencyKey: createIdempotencyKey() }); setEditor({ templateId: template.id, versionId: result.id || result.draft?.id }); }}>Create draft from published</button> : null}
          {template.currentPublishedVersion ? <button type="button" className="ghost-button" onClick={() => setEditor({ templateId: template.id, versionId: template.currentPublishedVersion.id })}>View published</button> : null}
          {template.activeDraft && template.currentPublishedVersion ? <button type="button" className="ghost-button" onClick={() => compare(template)}>Compare draft to published</button> : null}
          {template.activeDraft ? <><button type="button" className="ghost-button" onClick={() => openPublish([template.activeDraft])}>Validate & publish</button><button type="button" className="ghost-button" onClick={async () => { const reason = prompt("Discard reason"); if (reason) { await client.discardDraft({ versionId: template.activeDraft.id, reason, expectedRevision: template.activeDraft.revision }); await onRefresh(); } }}>Discard draft</button></> : null}
          <button type="button" className="ghost-button" onClick={() => setActiveDialog(template)}>{template.active ? "Deactivate" : "Activate"}</button>
        </div>
      </article>;
    })}</div>}
    {publication ? <RoutinePublicationDialog versions={publication.versions} preview={publication.preview} onClose={() => setPublication(null)} onPublish={async (payload) => { const result = await client.publish(payload); setPublication(null); await onRefresh(); return result; }} /> : null}
    {comparison ? <Modal title={`Draft comparison · ${comparison.name}`} onClose={() => setComparison(null)} actions={<button type="button" className="primary-button" onClick={() => setComparison(null)}>Close</button>}><RoutineTemplateDiffPanel diff={comparison.diff} /></Modal> : null}
    {activeDialog ? <RoutineTemplateActiveDialog template={activeDialog} onClose={() => setActiveDialog(null)} onConfirm={async (payload) => { const result = await client.setTemplateActive(payload); setMessage(`Server confirmed ${result.active ? "activation" : "deactivation"} at logical revision ${result.revision}.`); await onRefresh(); return result; }} /> : null}
    <p role="status">{message}</p>
  </section>;
}
