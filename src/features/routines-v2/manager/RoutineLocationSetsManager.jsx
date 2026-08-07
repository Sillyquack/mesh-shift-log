import { useState } from "react";
import { routineConfigurationClient } from "../api/routineConfigurationClient.js";
import { moveEntry } from "../data/routineManagerModel.js";
import { EmptyState, Field, MoveButtons } from "./RoutineManagerPrimitives.jsx";

const empty = { stableKey: "", name: "", description: "", active: true, members: [] };
export default function RoutineLocationSetsManager({ sets, locations, onRefresh, client = routineConfigurationClient }) {
  const [selected, setSelected] = useState(null);
  const [members, setMembers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const choose = (set) => { setSelected({ ...set }); setMembers((set.members || []).map((member) => ({ ...member }))); };
  const saveSet = async () => {
    setBusy(true);
    try {
      const result = await client.saveLocationSet(selected);
      const row = result?.locationSet || result;
      setSelected((current) => ({ ...current, id: row.id, revision: row.revision, stableKey: row.set_key || current.stableKey }));
      setMessage("Logical location set saved."); await onRefresh();
    } catch (error) { setMessage(/stale/i.test(error.message) ? "Stale revision. Local location-set draft preserved." : error.message); }
    finally { setBusy(false); }
  };
  const saveMembers = async () => {
    setBusy(true);
    try { await client.replaceLocationSetMembers({ id: selected.id, members, expectedRevision: selected.revision }); setMessage("Complete desired state saved."); await onRefresh(); }
    catch (error) { setMessage(/stale/i.test(error.message) ? "Stale revision. Local member order preserved." : error.message); }
    finally { setBusy(false); }
  };
  return <section className="rm-stack">
    <header className="rm-subheading"><h3>Location sets</h3><button type="button" className="ghost-button" onClick={() => { setSelected(empty); setMembers([]); }}>New location set</button></header>
    {!sets.length ? <EmptyState title="No location sets">Create reusable routes when locations are ready.</EmptyState> : <div className="rm-chip-row">{sets.map((set) => <button type="button" className="ghost-button" key={set.id} onClick={() => choose(set)}>{set.name} · {(set.members || []).length}</button>)}</div>}
    {selected ? <div className="rm-card rm-form">
      <header><div><h4>{selected.name || "New location set"}</h4>{selected.id ? <code>{selected.stableKey}</code> : null}</div>{!members.length ? <span className="rm-inline-blocker">Publish blocker when used</span> : null}</header>
      <div className="rm-field-grid">
        <Field id="set-key" label="Stable key" help="Immutable in manager UI after creation."><input id="set-key" readOnly={Boolean(selected.id)} value={selected.stableKey} onChange={(event) => setSelected({ ...selected, stableKey: event.target.value })} /></Field>
        <Field id="set-name" label="Name" help="Reusable route name."><input id="set-name" value={selected.name} onChange={(event) => setSelected({ ...selected, name: event.target.value })} /></Field>
      </div>
      <Field id="set-description" label="Description" help="Optional route context."><textarea id="set-description" value={selected.description || ""} onChange={(event) => setSelected({ ...selected, description: event.target.value })} /></Field>
      <label className="rm-check"><input type="checkbox" checked={selected.active !== false} onChange={(event) => setSelected({ ...selected, active: event.target.checked })} /> Active; no hard delete</label>
      <button type="button" className="primary-button" disabled={busy || !selected.stableKey || !selected.name} onClick={saveSet}>Save location set metadata</button>
      {selected.id ? <>
        <div className="rm-list">{members.map((member, index) => { const location = locations.find((candidate) => candidate.id === member.locationId); return <div className="rm-list-row" key={member.locationId}><span><strong>{location?.name || member.locationId}</strong><label className="rm-check"><input type="checkbox" checked={member.required !== false} onChange={(event) => setMembers(members.map((value, memberIndex) => memberIndex === index ? { ...value, required: event.target.checked } : value))} /> Required</label></span><div className="rm-actions"><MoveButtons index={index} total={members.length} label={location?.name || "location"} onMove={(direction) => setMembers(moveEntry(members, index, direction))} /><button type="button" className="ghost-button" onClick={() => setMembers(members.filter((_, memberIndex) => memberIndex !== index))}>Remove</button></div></div>; })}</div>
        <Field id="set-add" label="Add member" help="Duplicate members are blocked."><select id="set-add" value="" onChange={(event) => { if (event.target.value && !members.some((member) => member.locationId === event.target.value)) setMembers([...members, { locationId: event.target.value, sortOrder: members.length, required: true, metadata: {} }]); }}><option value="">Choose location…</option>{locations.map((location) => <option value={location.id} key={location.id}>{location.name}</option>)}</select></Field>
        <button type="button" className="primary-button" disabled={busy} onClick={saveMembers}>Save complete member list</button>
      </> : null}
      <p role="status">{message}</p>
    </div> : null}
  </section>;
}
