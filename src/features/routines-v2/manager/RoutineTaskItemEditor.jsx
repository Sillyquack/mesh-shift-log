import { useState } from "react";
import { ITEM_TYPES, NA_POLICIES, SOURCE_KINDS } from "../data/routineTemplateEditorModel.js";
import { Field, MoveButtons } from "./RoutineManagerPrimitives.jsx";

function normalize(item) {
  return {
    ...item,
    itemKey: item.itemKey || item.item_key || "",
    itemType: item.itemType || item.item_type || "check",
    sourceKind: item.sourceKind || item.source_kind || "static",
    sourceConfig: item.sourceConfig || item.source_config || {},
    standardId: item.standardId || item.standard_id || "",
    sourceLocationSetId: item.sourceLocationSetId || item.source_location_set_id || "",
    inputSchema: item.inputSchema || item.input_schema || {},
    sortOrder: item.sortOrder ?? item.sort_order ?? 0,
    metadata: item.metadata || { notApplicablePolicy: "forbidden", options: [] },
  };
}

function SourceFields({ draft, setDraft, readOnly }) {
  const patch = (key, value) => setDraft({ ...draft, sourceConfig: { ...draft.sourceConfig, [key]: value } });
  if (draft.sourceKind === "inventory_readonly") return <div className="rm-field-grid">
    <Field id="inventory-product-key" label="Inventory product key" help="Read-only inventory lookup; no inventory writes."><input id="inventory-product-key" disabled={readOnly} value={draft.sourceConfig.productKey || ""} onChange={(event) => patch("productKey", event.target.value)} /></Field>
    <Field id="inventory-location-key" label="Inventory location key" help="Optional read-only source scope."><input id="inventory-location-key" disabled={readOnly} value={draft.sourceConfig.locationKey || ""} onChange={(event) => patch("locationKey", event.target.value)} /></Field>
  </div>;
  if (draft.sourceKind === "asset_registry_readonly") return <div className="rm-field-grid">
    <Field id="asset-kind" label="Asset kind" help="Read-only asset registry lookup."><input id="asset-kind" disabled={readOnly} value={draft.sourceConfig.assetKind || ""} onChange={(event) => patch("assetKind", event.target.value)} /></Field>
    <Field id="asset-status-field" label="Status field" help="Whitelisted source field."><input id="asset-status-field" disabled={readOnly} value={draft.sourceConfig.statusField || ""} onChange={(event) => patch("statusField", event.target.value)} /></Field>
  </div>;
  if (draft.sourceKind === "event_context") return <div className="rm-field-grid">
    <Field id="event-context-key" label="Event context key" help="Server-provided context only."><input id="event-context-key" disabled={readOnly} value={draft.sourceConfig.contextKey || ""} onChange={(event) => patch("contextKey", event.target.value)} /></Field>
    <Field id="event-zone-key" label="Event zone key" help="Optional zone context."><input id="event-zone-key" disabled={readOnly} value={draft.sourceConfig.zoneKey || ""} onChange={(event) => patch("zoneKey", event.target.value)} /></Field>
  </div>;
  return null;
}

export default function RoutineTaskItemEditor({ items, task, standards, locationSets, readOnly, onSave, onReorder }) {
  const [draft, setDraft] = useState(null);
  const [schemaText, setSchemaText] = useState("{}");
  const [schemaError, setSchemaError] = useState("");
  const edit = (item) => { const next = normalize(item); setDraft(next); setSchemaText(JSON.stringify(next.inputSchema, null, 2)); setSchemaError(""); };
  if (!task) return <section className="rm-card"><h3>Task items</h3><p>Select a task to edit items.</p></section>;
  const save = (event) => {
    event.preventDefault();
    let inputSchema;
    try { inputSchema = JSON.parse(schemaText); } catch { setSchemaError("Input schema must be valid JSON and was not sent."); return; }
    if (!inputSchema || typeof inputSchema !== "object" || Array.isArray(inputSchema)) { setSchemaError("Input schema must be a JSON object."); return; }
    setSchemaError(""); onSave({ ...draft, inputSchema });
  };
  return <section className="rm-card">
    <header><h3>Task items · {task.title}</h3>{!readOnly ? <button type="button" className="ghost-button" onClick={() => edit({ itemKey: "", label: "", itemType: "check", required: true, sourceKind: "static", sourceConfig: {}, inputSchema: {}, metadata: { notApplicablePolicy: "forbidden", options: [] }, sortOrder: items.length, active: true })}>Add item</button> : null}</header>
    <div className="rm-list">{items.map((item, index) => <div className="rm-list-row" id={`item-${item.item_key || item.itemKey}`} key={item.id}><button type="button" className="rm-row-main" onClick={() => edit(item)}><strong>{item.label}</strong><small>{item.item_key || item.itemKey} · {item.source_kind || item.sourceKind} · {item.active === false ? "inactive" : "active"}</small></button>{!readOnly ? <MoveButtons index={index} total={items.length} label={item.label} onMove={(direction) => onReorder(index, direction)} /> : null}</div>)}</div>
    {draft ? <form className="rm-form" onSubmit={save}>
      <div className="rm-field-grid">
        <Field id="item-key" label="Item key" help="Stable within the task."><input id="item-key" readOnly={Boolean(draft.id) || readOnly} value={draft.itemKey} onChange={(event) => setDraft({ ...draft, itemKey: event.target.value })} /></Field>
        <Field id="item-label" label="Label" help="Visible checklist label."><input id="item-label" disabled={readOnly} value={draft.label || ""} onChange={(event) => setDraft({ ...draft, label: event.target.value })} /></Field>
        <Field id="item-type" label="Item type" help="Closed input vocabulary."><select id="item-type" disabled={readOnly} value={draft.itemType} onChange={(event) => setDraft({ ...draft, itemType: event.target.value })}>{ITEM_TYPES.map((value) => <option key={value}>{value}</option>)}</select></Field>
        <Field id="item-source" label="Source" help="External adapters remain read-only."><select id="item-source" disabled={readOnly} value={draft.sourceKind} onChange={(event) => setDraft({ ...draft, sourceKind: event.target.value, sourceConfig: {} })}>{SOURCE_KINDS.map((value) => <option key={value}>{value}</option>)}</select></Field>
      </div>
      {draft.sourceKind === "routine_standard" ? <Field id="item-standard" label="Routine standard" help="Server pins the immutable revision."><select id="item-standard" disabled={readOnly} value={draft.standardId} onChange={(event) => setDraft({ ...draft, standardId: event.target.value })}><option value="">Choose…</option>{standards.map((standard) => <option value={standard.id} key={standard.id}>{standard.label}</option>)}</select></Field> : null}
      {draft.sourceKind === "location_set" ? <Field id="item-set" label="Location set" help="Expanded by the server."><select id="item-set" disabled={readOnly} value={draft.sourceLocationSetId} onChange={(event) => setDraft({ ...draft, sourceLocationSetId: event.target.value })}><option value="">Choose…</option>{locationSets.map((set) => <option value={set.id} key={set.id}>{set.name}</option>)}</select></Field> : null}
      <SourceFields draft={draft} setDraft={setDraft} readOnly={readOnly} />
      <Field id="item-options" label="Options" help="One option per line; serialized as structured metadata."><textarea id="item-options" disabled={readOnly} value={(draft.metadata.options || []).join("\n")} onChange={(event) => setDraft({ ...draft, metadata: { ...draft.metadata, options: event.target.value.split("\n").filter(Boolean) } })} /></Field>
      <Field id="item-na" label="N/A policy" help="Structured item policy."><select id="item-na" disabled={readOnly} value={draft.metadata.notApplicablePolicy || "forbidden"} onChange={(event) => setDraft({ ...draft, metadata: { ...draft.metadata, notApplicablePolicy: event.target.value } })}>{NA_POLICIES.map((value) => <option key={value}>{value}</option>)}</select></Field>
      <Field id="item-input-schema" label="Advanced input schema" help="Validated JSON object; never evaluated." error={schemaError}><textarea id="item-input-schema" className="rm-code-input" disabled={readOnly} value={schemaText} onChange={(event) => setSchemaText(event.target.value)} /></Field>
      <label className="rm-check"><input type="checkbox" disabled={readOnly} checked={draft.required !== false} onChange={(event) => setDraft({ ...draft, required: event.target.checked })} /> Required</label>
      <label className="rm-check"><input type="checkbox" disabled={readOnly} checked={draft.active !== false} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /> Active; deactivation preserves history</label>
      {!readOnly ? <button className="primary-button">Save task item</button> : null}
    </form> : null}
  </section>;
}
