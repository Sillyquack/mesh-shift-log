import { useState } from "react";
import { replaceRoutineDraftTaskReferenceImages } from "../api/routineReferenceClient.js";
import { createIdempotencyKey, moveEntry } from "../data/routineManagerModel.js";
import { Field, MoveButtons, StatusPill } from "./RoutineManagerPrimitives.jsx";

export default function RoutineReferenceLinkEditor({ task, links, choices, versionRevision, readOnly, onRefresh, replacer = replaceRoutineDraftTaskReferenceImages }) {
  const [entries, setEntries] = useState(() => links.map((link) => ({ referenceId: link.reference_id || link.referenceId, taskItemId: link.task_item_id || link.taskItemId || null, buttonLabel: link.button_label || link.buttonLabel, contextNote: link.context_note || link.contextNote, sortOrder: link.sort_order ?? link.sortOrder, active: link.active !== false })));
  const [message, setMessage] = useState("");
  if (!task) return <section className="rm-card"><h3>Reference links</h3><p>Select a task to manage logical references.</p></section>;
  const save = async () => {
    const result = await replacer({ taskId: task.id, references: entries, expectedVersionRevision: versionRevision, idempotencyKey: createIdempotencyKey() });
    if (result.ok) { setMessage("Reference links replaced atomically."); await onRefresh(); } else setMessage(result.message || "Reference replacement failed; local links preserved.");
  };
  return <section className="rm-card">
    <header><h3>Reference links · {task.title}</h3>{!readOnly ? <button type="button" className="ghost-button" onClick={() => setEntries([...entries, { referenceId: choices[0]?.id || "", taskItemId: null, buttonLabel: "View reference", contextNote: "", sortOrder: entries.length, active: true }])}>Add reference</button> : null}</header>
    {entries.map((entry, index) => {
      const choice = choices.find((candidate) => candidate.id === entry.referenceId);
      return <div className="rm-subpanel" key={`${entry.referenceId}-${index}`}>
        <header><StatusPill state={choice?.currentState === "active_image" ? "ready" : "warning"}>{choice?.currentState || "placeholder"}</StatusPill>{choice?.usedByPublished ? <span>Used by published content</span> : <span>Draft-only reference</span>}</header>
        <div className="rm-three-grid">
          <Field id={`ref-choice-${index}`} label="Logical reference" help="Image selection remains independently versioned."><select id={`ref-choice-${index}`} disabled={readOnly} value={entry.referenceId} onChange={(event) => setEntries(entries.map((value, entryIndex) => entryIndex === index ? { ...value, referenceId: event.target.value } : value))}>{choices.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.label} · {candidate.currentState}</option>)}</select></Field>
          <Field id={`ref-label-${index}`} label="Button label" help="Visible future operator action label."><input id={`ref-label-${index}`} disabled={readOnly} value={entry.buttonLabel || ""} onChange={(event) => setEntries(entries.map((value, entryIndex) => entryIndex === index ? { ...value, buttonLabel: event.target.value } : value))} /></Field>
          <Field id={`ref-note-${index}`} label="Context note" help="Task-specific context."><input id={`ref-note-${index}`} disabled={readOnly} value={entry.contextNote || ""} onChange={(event) => setEntries(entries.map((value, entryIndex) => entryIndex === index ? { ...value, contextNote: event.target.value } : value))} /></Field>
        </div>
        <label className="rm-check"><input type="checkbox" disabled={readOnly} checked={entry.active} onChange={(event) => setEntries(entries.map((value, entryIndex) => entryIndex === index ? { ...value, active: event.target.checked } : value))} /> Active link</label>
        {!readOnly ? <div className="rm-actions"><MoveButtons index={index} total={entries.length} label="reference" onMove={(direction) => setEntries(moveEntry(entries, index, direction))} /><button type="button" className="ghost-button" onClick={() => setEntries(entries.filter((_, entryIndex) => entryIndex !== index))}>Remove from desired state</button></div> : null}
      </div>;
    })}
    {!readOnly ? <button type="button" className="primary-button" onClick={save}>Save complete reference list</button> : null}
    <p role="status">{message}</p>
  </section>;
}
