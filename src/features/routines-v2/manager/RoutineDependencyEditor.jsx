import { useMemo, useState } from "react";
import { DEPENDENCY_TYPES } from "../data/routineTemplateEditorModel.js";
import { Field } from "./RoutineManagerPrimitives.jsx";

function cyclic(entries) {
  const graph = new Map();
  entries.forEach((entry) => graph.set(entry.predecessorTaskId, [...(graph.get(entry.predecessorTaskId) || []), entry.successorTaskId]));
  const visiting = new Set(); const done = new Set();
  function visit(id) { if (visiting.has(id)) return true; if (done.has(id)) return false; visiting.add(id); if ((graph.get(id) || []).some(visit)) return true; visiting.delete(id); done.add(id); return false; }
  return [...graph.keys()].some(visit);
}

export default function RoutineDependencyEditor({ tasks, dependencies, readOnly, onSave }) {
  const [entries, setEntries] = useState(() => dependencies.map((dependency) => ({ predecessorTaskId: dependency.predecessor_task_id || dependency.predecessorTaskId, successorTaskId: dependency.successor_task_id || dependency.successorTaskId, dependencyType: dependency.dependency_type || dependency.dependencyType, metadata: dependency.metadata || {} })));
  const cycle = useMemo(() => cyclic(entries), [entries]);
  const patch = (index, value) => setEntries(entries.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...value } : entry));
  return <section className="rm-card">
    <header><h3>Dependencies</h3>{!readOnly ? <button type="button" className="ghost-button" onClick={() => setEntries([...entries, { predecessorTaskId: tasks[0]?.id || "", successorTaskId: tasks[1]?.id || "", dependencyType: "must_complete", metadata: {} }])}>Add dependency</button> : null}</header>
    {cycle ? <p className="rm-inline-blocker" role="alert">Cycle warning. The authoritative server validator will block publication.</p> : null}
    {entries.map((entry, index) => <div className="rm-subpanel" key={`${entry.predecessorTaskId}-${entry.successorTaskId}-${index}`}>
      <div className="rm-three-grid">
        <Field id={`dep-from-${index}`} label="Predecessor" help="Source task."><select id={`dep-from-${index}`} disabled={readOnly} value={entry.predecessorTaskId} onChange={(event) => patch(index, { predecessorTaskId: event.target.value })}>{tasks.map((task) => <option value={task.id} key={task.id}>{task.title}</option>)}</select></Field>
        <Field id={`dep-to-${index}`} label="Successor" help="Dependent task."><select id={`dep-to-${index}`} disabled={readOnly} value={entry.successorTaskId} onChange={(event) => patch(index, { successorTaskId: event.target.value })}>{tasks.map((task) => <option value={task.id} key={task.id}>{task.title}</option>)}</select></Field>
        <Field id={`dep-type-${index}`} label="Type" help="Closed dependency vocabulary."><select id={`dep-type-${index}`} disabled={readOnly} value={entry.dependencyType} onChange={(event) => patch(index, { dependencyType: event.target.value, metadata: {} })}>{DEPENDENCY_TYPES.map((value) => <option key={value}>{value}</option>)}</select></Field>
      </div>
      {entry.dependencyType === "must_reach_time" ? <Field id={`dep-time-${index}`} label="Must-reach-time boundary" help="Local time boundary; server resolves operational time."><input id={`dep-time-${index}`} type="time" disabled={readOnly} value={entry.metadata.localTime || ""} onChange={(event) => patch(index, { metadata: { ...entry.metadata, localTime: event.target.value } })} /></Field> : null}
      <label className="rm-check"><input type="checkbox" disabled={readOnly} checked={entry.metadata.continuousCompletion === true} onChange={(event) => patch(index, { metadata: { ...entry.metadata, continuousCompletion: event.target.checked } })} /> Continuous completion relationship</label>
      {!readOnly ? <button type="button" className="ghost-button" onClick={() => setEntries(entries.filter((_, entryIndex) => entryIndex !== index))}>Remove dependency</button> : null}
    </div>)}
    {!readOnly ? <button type="button" className="primary-button" disabled={cycle} onClick={() => onSave(entries)}>Save complete dependency set</button> : null}
  </section>;
}
