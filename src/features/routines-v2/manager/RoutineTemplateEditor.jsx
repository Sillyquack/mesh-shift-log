import { useState } from "react";
import { routineTemplateClient } from "../api/routineTemplateClient.js";
import { moveEntry } from "../data/routineManagerModel.js";
import { useRoutineTemplateEditor } from "../hooks/useRoutineTemplateEditor.js";
import { Field } from "./RoutineManagerPrimitives.jsx";
import RoutineDependencyEditor from "./RoutineDependencyEditor.jsx";
import RoutineReferenceLinkEditor from "./RoutineReferenceLinkEditor.jsx";
import RoutineRelationEditor from "./RoutineRelationEditor.jsx";
import RoutineSectionEditor from "./RoutineSectionEditor.jsx";
import RoutineTaskEditor from "./RoutineTaskEditor.jsx";
import RoutineTaskItemEditor from "./RoutineTaskItemEditor.jsx";
import RoutineTemplateDiffPanel from "./RoutineTemplateDiffPanel.jsx";
import RoutineTemplateValidationPanel from "./RoutineTemplateValidationPanel.jsx";

export default function RoutineTemplateEditor({ templateId, versionId, onClose, client = routineTemplateClient }) {
  const editor = useRoutineTemplateEditor({ templateId, versionId });
  const [selectedTask, setSelectedTask] = useState(null);
  const [diff, setDiff] = useState(null);
  const workspace = editor.draft;
  if (!workspace) return <section className="rm-card"><h2>Loading template editor…</h2>{editor.conflict ? <p role="alert">{editor.conflict.message}</p> : null}</section>;

  const readOnly = workspace.immutable;
  const version = workspace.version;
  const items = workspace.taskItems.filter((item) => (item.task_id || item.taskId) === selectedTask?.id);
  const run = (action) => editor.runMutation(action);
  const reorderSections = (index, direction) => {
    const ordered = moveEntry(workspace.sections, index, direction);
    run(() => client.reorderSections({ versionId: version.id, sectionIds: ordered.map((section) => section.id), expectedVersionRevision: version.revision }));
  };

  return <div className="rm-stack rm-template-editor">
    <header className="rm-section-heading">
      <div><p className="eyebrow">{readOnly ? "Published · read only" : "Active draft"}</p><h2>{workspace.template.name} · v{version.version_number || version.versionNumber}</h2><code>{workspace.template.routine_key || workspace.template.routineKey}</code></div>
      <button type="button" className="ghost-button" onClick={() => { if (!editor.dirty || confirm("Discard navigation? Your local unsaved fields will be lost.")) onClose(); }}>Back to templates</button>
    </header>
    {editor.conflict ? <section className="rm-conflict" role="alert">
      <h3>Local draft preserved</h3><p>{editor.conflict.message}</p>
      <div className="rm-actions">
        <button type="button" className="ghost-button" onClick={editor.refresh}>Refresh server state</button>
        <button type="button" className="ghost-button" onClick={editor.keepLocal}>Keep local draft for manual reapply</button>
        <button type="button" className="ghost-button" onClick={editor.discardLocal}>Discard local draft</button>
      </div>
      <details><summary>Local and server values</summary><div className="rm-two-json"><pre>{JSON.stringify(editor.conflict.local, null, 2)}</pre><pre>{JSON.stringify(editor.conflict.server, null, 2)}</pre></div></details>
    </section> : null}
    <section className="rm-card" id="template-metadata">
      <h3>Template metadata</h3>
      <div className="rm-field-grid">
        <Field id="template-name" label="Name" help="Version metadata; routine key remains immutable."><input id="template-name" disabled={readOnly} value={version.name} onChange={(event) => editor.setDraft({ ...workspace, version: { ...version, name: event.target.value } })} /></Field>
        <Field id="template-state" label="State" help="Published versions are immutable and read-only."><input id="template-state" readOnly value={version.state} /></Field>
        <Field id="template-version" label="Version number" help="Assigned by the server."><input id="template-version" readOnly value={version.version_number || version.versionNumber} /></Field>
        <Field id="template-based-on" label="Based on version" help="Immutable draft ancestry."><input id="template-based-on" readOnly value={version.based_on_version_id || version.basedOnVersionId || "None"} /></Field>
      </div>
      <Field id="template-description" label="Description" help="Plain description; no executable content."><textarea id="template-description" disabled={readOnly} value={version.description || ""} onChange={(event) => editor.setDraft({ ...workspace, version: { ...version, description: event.target.value } })} /></Field>
      <p>Current published: {workspace.currentPublishedSummary ? `v${workspace.currentPublishedSummary.versionNumber || "—"} · ${workspace.currentPublishedSummary.contentHash}` : "None"}</p>
      {!readOnly ? <button type="button" className="primary-button" disabled={editor.status === "saving"} onClick={() => run(() => client.saveMetadata({ versionId: version.id, name: version.name, description: version.description, expectedRevision: version.revision }))}>Save metadata</button> : null}
    </section>
    <RoutineSectionEditor sections={workspace.sections} readOnly={readOnly} onReorder={reorderSections} onSave={(section) => run(() => client.saveSection({ versionId: version.id, sectionId: section.id, sectionKey: section.sectionKey || section.section_key, title: section.title, description: section.description, phaseType: section.phaseType || section.phase_type, sortOrder: section.sortOrder ?? section.sort_order, active: section.active !== false, expectedSectionRevision: section.revision, expectedVersionRevision: version.revision }))} />
    <RoutineTaskEditor tasks={workspace.tasks} sections={workspace.sections} locations={workspace.locationChoices} locationSets={workspace.locationSetChoices} readOnly={readOnly} onSelect={setSelectedTask} onSave={(task) => run(() => client.saveTask({ versionId: version.id, sectionId: task.sectionId, taskId: task.id, task: task.task, expectedTaskRevision: task.revision, expectedVersionRevision: version.revision }))} onReorder={(task, index, direction) => { const peers = workspace.tasks.filter((candidate) => (candidate.section_id || candidate.sectionId) === (task.section_id || task.sectionId)); const ordered = moveEntry(peers, index, direction); run(() => client.reorderTasks({ sectionId: task.section_id || task.sectionId, taskIds: ordered.map((candidate) => candidate.id), expectedVersionRevision: version.revision })); }} />
    <RoutineTaskItemEditor items={items} task={selectedTask} standards={workspace.standardChoices} locationSets={workspace.locationSetChoices} readOnly={readOnly} onSave={(item) => run(() => client.saveItem({ versionId: version.id, taskId: selectedTask.id, itemId: item.id, item: { itemKey: item.itemKey, label: item.label, itemType: item.itemType, required: item.required !== false, sourceKind: item.sourceKind, sourceConfig: item.sourceConfig || {}, standardId: item.standardId || null, sourceLocationSetId: item.sourceLocationSetId || null, inputSchema: item.inputSchema || {}, sortOrder: item.sortOrder || 0, active: item.active !== false, metadata: item.metadata || {} }, expectedItemRevision: item.revision, expectedVersionRevision: version.revision }))} onReorder={(index, direction) => { const ordered = moveEntry(items, index, direction); run(() => client.reorderItems({ taskId: selectedTask.id, itemIds: ordered.map((item) => item.id), expectedVersionRevision: version.revision })); }} />
    <RoutineDependencyEditor tasks={workspace.tasks} dependencies={workspace.dependencies} readOnly={readOnly} onSave={(dependencies) => run(() => client.replaceDependencies({ versionId: version.id, dependencies, expectedVersionRevision: version.revision }))} />
    <RoutineRelationEditor tasks={workspace.tasks} relations={workspace.relations} readOnly={readOnly} onSave={(relations) => run(() => client.replaceRelations({ versionId: version.id, relations, expectedVersionRevision: version.revision }))} />
    <RoutineReferenceLinkEditor task={selectedTask} links={workspace.referenceLinks.filter((link) => (link.task_id || link.taskId) === selectedTask?.id)} choices={workspace.referenceChoices} versionRevision={version.revision} readOnly={readOnly} onRefresh={editor.refresh} />
    <RoutineTemplateValidationPanel validation={workspace.validation} />
    <div className="rm-actions">
      <button type="button" className="ghost-button" disabled={!workspace.currentPublishedSummary?.id} onClick={async () => { if (workspace.currentPublishedSummary?.id) setDiff(await client.getRoutineTemplateVersionDiff(workspace.currentPublishedSummary.id, version.id)); }}>Compare to published</button>
      <button type="button" className="ghost-button" disabled={readOnly || editor.status === "saving"} onClick={() => run(() => client.validate({ versionId: version.id }))}>Validate on server</button>
    </div>
    <RoutineTemplateDiffPanel diff={diff} />
  </div>;
}
