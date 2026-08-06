import { useState } from "react";
import { routineConfigurationClient } from "../api/routineConfigurationClient.js";
import { createIdempotencyKey } from "../data/routineManagerModel.js";
import { EmptyState, Field, StatusPill } from "./RoutineManagerPrimitives.jsx";

const empty = { stableKey: "", label: "", description: "", valueType: "integer", unit: "", sourceKind: "manual", active: true };
function valueFor(type, raw) {
  if (type === "integer") { if (!/^-?\d+$/.test(raw.trim())) throw new Error("Enter a whole number."); return Number(raw); }
  if (type === "decimal") { const value = Number(raw); if (!Number.isFinite(value)) throw new Error("Enter a decimal number."); return value; }
  if (type === "boolean") return raw === "true";
  if (type === "text") return raw;
  if (type === "list") return raw.split("\n").map((entry) => entry.trim()).filter(Boolean);
  const value = JSON.parse(raw); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Object values require a JSON object."); return value;
}

export default function RoutineStandardsManager({ standards, onRefresh, client = routineConfigurationClient }) {
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const [logical, setLogical] = useState(empty);
  const [raw, setRaw] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const create = async () => {
    try { await client.createStandard(logical); setCreating(false); setLogical(empty); setMessage("Logical standard created without a value revision."); await onRefresh(); }
    catch (error) { setMessage(error.message); }
  };
  const addRevision = async () => {
    let value; try { value = valueFor(selected.valueType, raw); } catch (error) { setMessage(`${error.message} Nothing was sent.`); return; }
    try { await client.createStandardRevision({ standardId: selected.id, value, effectiveFrom: null, reason, idempotencyKey: createIdempotencyKey(), expectedRevision: selected.revision }); setRaw(""); setReason(""); setMessage("Immutable revision created."); await onRefresh(); }
    catch (error) { setMessage(/stale/i.test(error.message) ? "Stale standard revision. Local value preserved." : error.message); }
  };
  return <section className="rm-stack">
    <header className="rm-subheading"><h3>Routine standards</h3><button type="button" className="ghost-button" onClick={() => setCreating(true)}>New logical standard</button></header>
    {creating ? <form className="rm-card rm-form" onSubmit={(event) => { event.preventDefault(); create(); }}>
      <div className="rm-field-grid"><Field id="standard-key" label="Stable key" help="Immutable logical identity."><input id="standard-key" value={logical.stableKey} onChange={(event) => setLogical({ ...logical, stableKey: event.target.value })} /></Field><Field id="standard-label" label="Label" help="Manager-facing label."><input id="standard-label" value={logical.label} onChange={(event) => setLogical({ ...logical, label: event.target.value })} /></Field></div>
      <Field id="standard-description" label="Description" help="Optional standard context."><textarea id="standard-description" value={logical.description} onChange={(event) => setLogical({ ...logical, description: event.target.value })} /></Field>
      <div className="rm-three-grid"><Field id="standard-value-type" label="Value type" help="Determines the structured revision editor."><select id="standard-value-type" value={logical.valueType} onChange={(event) => setLogical({ ...logical, valueType: event.target.value })}>{["integer", "decimal", "boolean", "text", "object", "list"].map((value) => <option key={value}>{value}</option>)}</select></Field><Field id="standard-source-kind" label="Source kind" help="External sources are read-only here."><select id="standard-source-kind" value={logical.sourceKind} onChange={(event) => setLogical({ ...logical, sourceKind: event.target.value })}>{["manual", "inventory_readonly", "asset_registry_readonly", "location_set"].map((value) => <option key={value}>{value}</option>)}</select></Field><Field id="standard-unit" label="Unit" help="Optional unit label."><input id="standard-unit" value={logical.unit} onChange={(event) => setLogical({ ...logical, unit: event.target.value })} /></Field></div>
      <label className="rm-check"><input type="checkbox" checked={logical.active} onChange={(event) => setLogical({ ...logical, active: event.target.checked })} /> Active</label>
      <div className="rm-actions"><button className="primary-button" disabled={!logical.stableKey || !logical.label}>Create logical standard</button><button type="button" className="ghost-button" onClick={() => setCreating(false)}>Cancel</button></div>
    </form> : null}
    {!standards.length ? <EmptyState title="No standards">Create logical standards before publication.</EmptyState> : <div className="rm-chip-row">{standards.map((standard) => <button type="button" className="ghost-button" key={standard.id} onClick={() => { setSelected(standard); setRaw(standard.valueType === "boolean" ? "true" : ""); }}>{standard.label}</button>)}</div>}
    {selected ? <article className="rm-card">
      <header><div><h4>{selected.label}</h4><code>{selected.stableKey}</code></div><StatusPill state={selected.externalReadonly ? "warning" : "ready"}>{selected.sourceKind}</StatusPill></header>
      <dl className="rm-evidence"><div><dt>Value type</dt><dd>{selected.valueType}</dd></div><div><dt>Unit</dt><dd>{selected.unit || "—"}</dd></div><div><dt>Logical revision</dt><dd>{selected.revision}</dd></div><div><dt>Status</dt><dd>{selected.active ? "Active" : "Inactive"}</dd></div></dl>
      {selected.externalReadonly ? <p className="rm-note">External source standards are read-only here. Values resolve from the authoritative inventory, asset, or location-set source.</p> : <div className="rm-form">
        {selected.valueType === "boolean" ? <Field id="standard-value" label="New revision value" help="Structured boolean."><select id="standard-value" value={raw} onChange={(event) => setRaw(event.target.value)}><option value="true">true</option><option value="false">false</option></select></Field> : selected.valueType === "list" ? <Field id="standard-value" label="New revision values" help="One list value per line; serialized as an array."><textarea id="standard-value" value={raw} onChange={(event) => setRaw(event.target.value)} /></Field> : <Field id="standard-value" label="New revision value" help={selected.valueType === "object" ? "Advanced validated JSON object; never evaluated." : `Structured ${selected.valueType} value.`}><textarea id="standard-value" className={selected.valueType === "object" ? "rm-code-input" : ""} value={raw} onChange={(event) => setRaw(event.target.value)} placeholder={selected.valueType === "object" ? "{\n  \"key\": \"value\"\n}" : "Value"} /></Field>}
        <Field id="standard-reason" label="Revision reason" help="Stored with immutable revision history."><input id="standard-reason" value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
        <button type="button" className="primary-button" onClick={addRevision} disabled={!raw || !reason}>Create immutable revision</button>
      </div>}
      <details><summary>Revision history ({selected.revisions?.length || 0})</summary><ol className="rm-history">{selected.revisions?.map((revision) => <li key={revision.id}><strong>Revision {revision.revisionNumber}</strong><code>{revision.contentHash}</code><pre className="rm-json">{JSON.stringify(revision.value, null, 2)}</pre><small>{revision.reason || "No reason"}</small></li>)}</ol></details>
      <p role="status">{message}</p>
    </article> : null}
    {!selected ? <p role="status">{message}</p> : null}
  </section>;
}
