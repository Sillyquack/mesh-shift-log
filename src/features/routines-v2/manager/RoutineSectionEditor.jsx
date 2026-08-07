import { useState } from "react";
import { Field, MoveButtons } from "./RoutineManagerPrimitives.jsx";

export default function RoutineSectionEditor({ sections, readOnly, onSave, onReorder }) {
  const [draft, setDraft] = useState(null);
  return <section className="rm-card">
    <header>
      <h3>Sections</h3>
      {!readOnly ? <button type="button" className="ghost-button" onClick={() => setDraft({ sectionKey: "", title: "", description: "", phaseType: "other", sortOrder: sections.length, active: true })}>Add section</button> : null}
    </header>
    <div className="rm-list">
      {sections.map((section, index) => <div className="rm-list-row" id={`section-${section.section_key || section.sectionKey}`} key={section.id}>
        <button type="button" className="rm-row-main" onClick={() => setDraft(section)}>
          <strong>{section.title}</strong>
          <small>{section.section_key || section.sectionKey} · {section.phase_type || section.phaseType} · {section.active === false ? "inactive" : "active"}</small>
        </button>
        {!readOnly ? <MoveButtons index={index} total={sections.length} label={section.title} onMove={(direction) => onReorder(index, direction)} /> : null}
      </div>)}
    </div>
    {draft ? <form className="rm-form" onSubmit={(event) => { event.preventDefault(); onSave(draft); }}>
      <Field id="section-key" label="Stable section key" help="Immutable after creation and preserved in copied drafts.">
        <input id="section-key" readOnly={Boolean(draft.id) || readOnly} value={draft.section_key || draft.sectionKey || ""} onChange={(event) => setDraft({ ...draft, sectionKey: event.target.value })} />
      </Field>
      <Field id="section-title" label="Title" help="Long titles wrap on small screens.">
        <input id="section-title" disabled={readOnly} value={draft.title || ""} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
      </Field>
      <Field id="section-description" label="Description" help="Optional, non-executable context.">
        <textarea id="section-description" disabled={readOnly} value={draft.description || ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
      </Field>
      <Field id="section-phase" label="Phase type" help="Closed phase vocabulary.">
        <select id="section-phase" disabled={readOnly} value={draft.phase_type || draft.phaseType || "other"} onChange={(event) => setDraft({ ...draft, phaseType: event.target.value })}>
          {["overview", "startup", "service", "checkpoint", "preclose", "final_close", "verification", "security", "handover", "other"].map((value) => <option key={value}>{value}</option>)}
        </select>
      </Field>
      <label className="rm-check"><input type="checkbox" disabled={readOnly} checked={draft.active !== false} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /> Active; deactivation preserves history</label>
      {!readOnly ? <button className="primary-button">Save section</button> : null}
    </form> : null}
  </section>;
}
