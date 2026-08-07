import { useState } from "react";
import {
  AVAILABILITY_MODES,
  COMPLETION_POLICIES,
  CRITICALITIES,
  INITIAL_POLICIES,
  NA_POLICIES,
  REPEAT_POLICIES,
  TASK_TYPES,
  VERIFICATION_POLICIES,
  buildTaskPayload,
} from "../data/routineTemplateEditorModel.js";
import { Field, MoveButtons } from "./RoutineManagerPrimitives.jsx";
import RoutineConditionBuilder from "./RoutineConditionBuilder.jsx";
import RoutineTimingEditor from "./RoutineTimingEditor.jsx";

const options = (values) => values.map((value) => <option key={value}>{value}</option>);
const camel = (task) => ({
  ...task,
  taskKey: task.taskKey || task.task_key || "",
  sectionId: task.sectionId || task.section_id || "",
  doneCriteria: task.doneCriteria || task.done_criteria || "",
  taskType: task.taskType || task.task_type || "action",
  initialAssessmentPolicy: task.initialAssessmentPolicy || task.initial_assessment_policy || "none",
  completionPolicy: task.completionPolicy || task.completion_policy || "standard_required",
  notApplicablePolicy: task.notApplicablePolicy || task.not_applicable_policy || "forbidden",
  verificationPolicy: task.verificationPolicy || task.verification_policy || "none",
  repeatPolicy: task.repeatPolicy || task.repeat_policy || "once_per_run",
  availabilityMode: task.availabilityMode || task.availability_mode || "immediate",
  conditionJson: task.conditionJson || task.condition_json || {},
  locationId: task.locationId || task.location_id || "",
  locationSetId: task.locationSetId || task.location_set_id || "",
  locationDescription: task.locationDescription || task.location_description || "",
  visibleDayOffset: task.visibleDayOffset ?? task.visible_day_offset ?? 0,
  visibleFromLocalTime: task.visibleFromLocalTime || task.visible_from_local_time || "",
  startDayOffset: task.startDayOffset ?? task.start_day_offset ?? 0,
  startFromLocalTime: task.startFromLocalTime || task.start_from_local_time || "",
  targetDayOffset: task.targetDayOffset ?? task.target_day_offset ?? 0,
  targetLocalTime: task.targetLocalTime || task.target_local_time || "",
  overdueDayOffset: task.overdueDayOffset ?? task.overdue_day_offset ?? 0,
  overdueLocalTime: task.overdueLocalTime || task.overdue_local_time || "",
  hardDeadlineDayOffset: task.hardDeadlineDayOffset ?? task.hard_deadline_day_offset ?? 0,
  hardDeadlineLocalTime: task.hardDeadlineLocalTime || task.hard_deadline_local_time || "",
  sortOrder: task.sortOrder ?? task.sort_order ?? 0,
  metadata: task.metadata || {},
});

export default function RoutineTaskEditor({ tasks, sections, locations = [], locationSets = [], readOnly, onSave, onReorder, onSelect }) {
  const [draft, setDraft] = useState(null);
  const edit = (task) => { const normalized = camel(task); setDraft(normalized); onSelect?.(normalized); };
  const newTask = () => edit({ taskKey: "", sectionId: sections[0]?.id || "", title: "", instructions: "", doneCriteria: "", taskType: "action", criticality: "normal", mandatory: true, initialAssessmentPolicy: "none", completionPolicy: "standard_required", notApplicablePolicy: "forbidden", verificationPolicy: "none", repeatPolicy: "once_per_run", availabilityMode: "immediate", conditionJson: {}, sortOrder: tasks.length, active: true, metadata: {} });
  return <section className="rm-card">
    <header><h3>Tasks</h3>{!readOnly ? <button type="button" className="ghost-button" onClick={newTask}>Add task</button> : null}</header>
    <div className="rm-list">
      {tasks.map((task, index) => <div className="rm-list-row" id={`task-${task.task_key || task.taskKey}`} key={task.id}>
        <button type="button" className="rm-row-main" onClick={() => edit(task)}><strong>{task.title}</strong><small>{task.task_key || task.taskKey} · {task.task_type || task.taskType} · {task.active === false ? "inactive" : "active"}</small></button>
        {!readOnly ? <MoveButtons index={index} total={tasks.length} label={task.title} onMove={(direction) => onReorder(task, index, direction)} /> : null}
      </div>)}
    </div>
    {draft ? <form className="rm-form rm-editor-form" onSubmit={(event) => { event.preventDefault(); onSave({ ...draft, task: buildTaskPayload(draft) }); }}>
      <div className="rm-field-grid">
        <Field id="task-key" label="Task key" help="Stable within the logical template."><input id="task-key" readOnly={Boolean(draft.id) || readOnly} value={draft.taskKey} onChange={(event) => setDraft({ ...draft, taskKey: event.target.value })} /></Field>
        <Field id="task-section" label="Section" help="Task belongs to one section."><select id="task-section" disabled={readOnly} value={draft.sectionId} onChange={(event) => setDraft({ ...draft, sectionId: event.target.value })}>{sections.map((section) => <option value={section.id} key={section.id}>{section.title}</option>)}</select></Field>
      </div>
      <Field id="task-title" label="Title" help="Required; up to 300 characters."><input id="task-title" disabled={readOnly} value={draft.title || ""} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></Field>
      <Field id="task-instructions" label="Instructions" help="Plain operational instructions."><textarea id="task-instructions" disabled={readOnly} value={draft.instructions || ""} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} /></Field>
      <Field id="task-done" label="Done criteria" help="Mandatory work needs concrete criteria."><textarea id="task-done" disabled={readOnly} value={draft.doneCriteria || ""} onChange={(event) => setDraft({ ...draft, doneCriteria: event.target.value })} /></Field>
      <div className="rm-policy-grid">
        {[["taskType", "Task type", TASK_TYPES], ["criticality", "Criticality", CRITICALITIES], ["initialAssessmentPolicy", "Initial assessment", INITIAL_POLICIES], ["completionPolicy", "Completion", COMPLETION_POLICIES], ["notApplicablePolicy", "N/A policy", NA_POLICIES], ["verificationPolicy", "Verification", VERIFICATION_POLICIES], ["repeatPolicy", "Repeat", REPEAT_POLICIES], ["availabilityMode", "Availability", AVAILABILITY_MODES]].map(([key, label, values]) => <Field id={`task-${key}`} key={key} label={label} help="Server-controlled enum."><select id={`task-${key}`} disabled={readOnly} value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}>{options(values)}</select></Field>)}
      </div>
      <div className="rm-three-grid">
        <Field id="task-location" label="Location" help="Optional exact routine location."><select id="task-location" disabled={readOnly} value={draft.locationId} onChange={(event) => setDraft({ ...draft, locationId: event.target.value })}><option value="">No exact location</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></Field>
        <Field id="task-location-set" label="Location set" help="Optional ordered route."><select id="task-location-set" disabled={readOnly} value={draft.locationSetId} onChange={(event) => setDraft({ ...draft, locationSetId: event.target.value })}><option value="">No location set</option>{locationSets.map((set) => <option key={set.id} value={set.id}>{set.name}</option>)}</select></Field>
        <Field id="task-location-description" label="Location description" help="Human-readable placement context."><input id="task-location-description" disabled={readOnly} value={draft.locationDescription} onChange={(event) => setDraft({ ...draft, locationDescription: event.target.value })} /></Field>
      </div>
      <div className="rm-field-grid">
        <Field id="task-metadata-category" label="Metadata category" help="Structured manager field."><input id="task-metadata-category" disabled={readOnly} value={draft.metadata.category || ""} onChange={(event) => setDraft({ ...draft, metadata: { ...draft.metadata, category: event.target.value } })} /></Field>
        <Field id="task-metadata-owner" label="Metadata owner label" help="Structured manager field."><input id="task-metadata-owner" disabled={readOnly} value={draft.metadata.ownerLabel || ""} onChange={(event) => setDraft({ ...draft, metadata: { ...draft.metadata, ownerLabel: event.target.value } })} /></Field>
      </div>
      <label className="rm-check"><input type="checkbox" disabled={readOnly} checked={draft.mandatory !== false} onChange={(event) => setDraft({ ...draft, mandatory: event.target.checked })} /> Mandatory</label>
      <label className="rm-check"><input type="checkbox" disabled={readOnly} checked={draft.active !== false} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /> Active; deactivation preserves history</label>
      <RoutineConditionBuilder value={draft.conditionJson} readOnly={readOnly} onChange={(conditionJson) => setDraft({ ...draft, conditionJson })} />
      <RoutineTimingEditor task={draft} readOnly={readOnly} onChange={setDraft} />
      {!readOnly ? <button className="primary-button">Save task</button> : null}
    </form> : null}
  </section>;
}
