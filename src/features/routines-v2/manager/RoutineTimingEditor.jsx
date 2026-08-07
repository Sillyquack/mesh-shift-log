import { AVAILABILITY_MODES, timingPreview } from "../data/routineTemplateEditorModel.js";
import { Field } from "./RoutineManagerPrimitives.jsx";

const rows = [
  ["visible", "Visible", "visibleFromLocalTime"],
  ["start", "Can start", "startFromLocalTime"],
  ["target", "Target", "targetLocalTime"],
  ["overdue", "Overdue", "overdueLocalTime"],
  ["hardDeadline", "Hard deadline", "hardDeadlineLocalTime"],
];

export default function RoutineTimingEditor({ task, onChange, readOnly = false }) {
  const set = (key, value) => onChange({ ...task, [key]: value });
  return <section className="rm-subpanel">
    <h4>Timing contract</h4>
    <Field id="availability-mode" label="Availability mode" help="Checkpoint, continuous, and dependency rules are validated by the server.">
      <select id="availability-mode" disabled={readOnly} value={task.availabilityMode} onChange={(event) => set("availabilityMode", event.target.value)}>
        {AVAILABILITY_MODES.map((value) => <option key={value}>{value}</option>)}
      </select>
    </Field>
    <div className="rm-timing-grid">
      {rows.map(([prefix, label, timeKey]) => <div key={prefix}>
        <Field id={`${prefix}-day`} label={`${label} day`} help="Operational-day offset.">
          <input id={`${prefix}-day`} type="number" min="-7" max="31" disabled={readOnly} value={task[`${prefix}DayOffset`] ?? 0} onChange={(event) => set(`${prefix}DayOffset`, event.target.value)} />
        </Field>
        <Field id={`${prefix}-time`} label={`${label} time`} help="Local Europe/Oslo preview.">
          <input id={`${prefix}-time`} type="time" disabled={readOnly} value={task[timeKey] || ""} onChange={(event) => set(timeKey, event.target.value)} />
        </Field>
      </div>)}
    </div>
    <div className="rm-timeline" aria-label="Local non-authoritative timing preview">
      {timingPreview(task).map((value) => <span key={value}>{value}</span>)}
    </div>
    <p className="rm-note">Final UTC and DST resolution is performed by the server when a run is created. This preview is never used as a validation gate.</p>
  </section>;
}
