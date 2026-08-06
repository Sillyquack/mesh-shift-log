import { useState } from "react";
import { RELATION_TYPES, deliveryRelationMetadata } from "../data/routineTemplateEditorModel.js";
import { Field } from "./RoutineManagerPrimitives.jsx";

export default function RoutineRelationEditor({ tasks, relations, readOnly, onSave }) {
  const [entries, setEntries] = useState(() => relations.map((relation) => ({ sourceTaskId: relation.source_task_id || relation.sourceTaskId, targetRoutineKey: relation.target_routine_key || relation.targetRoutineKey, targetTaskKey: relation.target_task_key || relation.targetTaskKey, relationType: relation.relation_type || relation.relationType, metadata: relation.metadata || {} })));
  const patch = (index, value) => setEntries(entries.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...value } : entry));
  const metadataPatch = (index, entry, value) => patch(index, { metadata: { ...entry.metadata, ...value } });
  return <section className="rm-card">
    <header><h3>Cross-run relations</h3>{!readOnly ? <button type="button" className="ghost-button" onClick={() => setEntries([...entries, { sourceTaskId: tasks[0]?.id || "", targetRoutineKey: "", targetTaskKey: "", relationType: "shared_context", metadata: {} }])}>Add relation</button> : null}</header>
    {entries.map((entry, index) => <div className="rm-subpanel" key={`${entry.sourceTaskId}-${entry.targetRoutineKey}-${entry.targetTaskKey}-${index}`}>
      <div className="rm-three-grid">
        <Field id={`rel-source-${index}`} label="Source task" help="Task in this version."><select id={`rel-source-${index}`} disabled={readOnly} value={entry.sourceTaskId} onChange={(event) => patch(index, { sourceTaskId: event.target.value })}>{tasks.map((task) => <option value={task.id} key={task.id}>{task.title}</option>)}</select></Field>
        <Field id={`rel-routine-${index}`} label="Target routine key" help="Stable logical key."><input id={`rel-routine-${index}`} disabled={readOnly} value={entry.targetRoutineKey} onChange={(event) => patch(index, { targetRoutineKey: event.target.value })} /></Field>
        <Field id={`rel-task-${index}`} label="Target task key" help="Stable target task key."><input id={`rel-task-${index}`} disabled={readOnly} value={entry.targetTaskKey} onChange={(event) => patch(index, { targetTaskKey: event.target.value })} /></Field>
        <Field id={`rel-type-${index}`} label="Relation type" help="Closed vocabulary."><select id={`rel-type-${index}`} disabled={readOnly} value={entry.relationType} onChange={(event) => patch(index, { relationType: event.target.value, metadata: event.target.value === "delivery_comparison" ? deliveryRelationMetadata() : {} })}>{RELATION_TYPES.map((value) => <option key={value}>{value}</option>)}</select></Field>
      </div>
      {entry.relationType === "delivery_comparison" ? <div className="rm-field-grid">
        <Field id={`delivery-key-${index}`} label="Delivery key" help="Structured comparison identity."><input id={`delivery-key-${index}`} disabled={readOnly} value={entry.metadata.deliveryKey || ""} onChange={(event) => metadataPatch(index, entry, { deliveryKey: event.target.value })} /></Field>
        <Field id={`delivery-label-${index}`} label="Label" help="Human-readable comparison."><input id={`delivery-label-${index}`} disabled={readOnly} value={entry.metadata.label || ""} onChange={(event) => metadataPatch(index, entry, { label: event.target.value })} /></Field>
        <Field id={`delivery-category-${index}`} label="Category" help="Structured grouping."><input id={`delivery-category-${index}`} disabled={readOnly} value={entry.metadata.category || ""} onChange={(event) => metadataPatch(index, entry, { category: event.target.value })} /></Field>
        <Field id={`delivery-mode-${index}`} label="Comparison mode" help="No uncontrolled relation JSON."><select id={`delivery-mode-${index}`} disabled={readOnly} value={entry.metadata.comparisonMode || "value"} onChange={(event) => metadataPatch(index, entry, { comparisonMode: event.target.value })}><option>value</option><option>status</option><option>evidence</option></select></Field>
        <Field id={`delivery-evidence-${index}`} label="Evidence item keys" help="Comma-separated stable item keys."><input id={`delivery-evidence-${index}`} disabled={readOnly} value={(entry.metadata.evidenceItemKeys || []).join(", ")} onChange={(event) => metadataPatch(index, entry, { evidenceItemKeys: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} /></Field>
        {["required", "allowNA", "sameScope", "requireTaskVerification", "requireRunVerification"].map((key) => <label className="rm-check" key={key}><input type="checkbox" disabled={readOnly} checked={entry.metadata[key] === true} onChange={(event) => metadataPatch(index, entry, { [key]: event.target.checked })} />{key}</label>)}
      </div> : null}
      {!readOnly ? <button type="button" className="ghost-button" onClick={() => setEntries(entries.filter((_, entryIndex) => entryIndex !== index))}>Remove relation</button> : null}
    </div>)}
    {!readOnly ? <button type="button" className="primary-button" onClick={() => onSave(entries)}>Save complete relation set</button> : null}
  </section>;
}
