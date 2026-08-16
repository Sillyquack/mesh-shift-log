import { useState } from "react";
import { routineConfigurationClient } from "../api/routineConfigurationClient.js";
import { ROUTINE_LOCATION_TYPES } from "../data/routineLocationTypes.js";
import { Field, StatusPill } from "./RoutineManagerPrimitives.jsx";

const empty = { stableKey: "", name: "", locationType: "room", parentLocationId: "", sortOrder: 0, active: true, metadata: { description: "" } };

export default function RoutineLocationsManager({ locations, onRefresh, client = routineConfigurationClient }) {
  const [draft, setDraft] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const edit = (location) => setDraft({ ...location, parentLocationId: location.parentLocationId || "", metadata: location.metadata || {} });
  const save = async () => {
    setBusy(true);
    try { await client.saveLocation(draft); setMessage("Location saved with server revision."); setDraft(empty); await onRefresh(); }
    catch (error) { setMessage(/stale/i.test(error.message) ? "Stale revision. Local location draft preserved." : error.message); }
    finally { setBusy(false); }
  };
  const setActive = async () => {
    setBusy(true);
    try { await client.setLocationActive({ id: draft.id, active: !draft.active, expectedRevision: draft.revision }); setMessage("Location status saved."); await onRefresh(); }
    catch (error) { setMessage(/stale/i.test(error.message) ? "Stale revision. Local location draft preserved." : error.message); }
    finally { setBusy(false); }
  };
  return <section className="rm-stack">
    <header className="rm-subheading"><h3>Routine locations</h3><button type="button" className="ghost-button" onClick={() => setDraft({ ...empty, sortOrder: locations.length })}>New location</button></header>
    <div className="rm-split">
      <div className="rm-list">{locations.map((location) => <button type="button" key={location.id} onClick={() => edit(location)}><span><strong>{location.name}</strong><small>{location.stableKey} · {location.locationType} · order {location.sortOrder} · rev {location.revision}</small></span><StatusPill state={location.active ? "ready" : "blocked"}>{location.active ? "Active" : "Inactive"}</StatusPill></button>)}</div>
      <form className="rm-card rm-form" onSubmit={(event) => { event.preventDefault(); save(); }}>
        <Field id="location-key" label="Stable key" help="Immutable after creation; a database trigger rejects changes."><input id="location-key" value={draft.stableKey} readOnly={Boolean(draft.id)} onChange={(event) => setDraft({ ...draft, stableKey: event.target.value })} /></Field>
        <Field id="location-name" label="Name" help="Visible manager and future operator label."><input id="location-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
        <div className="rm-three-grid">
          <Field id="location-type" label="Type" help="Closed server vocabulary."><select id="location-type" value={draft.locationType} onChange={(event) => setDraft({ ...draft, locationType: event.target.value })}>{ROUTINE_LOCATION_TYPES.map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field id="location-parent" label="Parent" help="Same organization; cycles are blocked by server and trigger."><select id="location-parent" value={draft.parentLocationId} onChange={(event) => setDraft({ ...draft, parentLocationId: event.target.value })}><option value="">No parent</option>{locations.filter((location) => location.id !== draft.id).map((location) => <option value={location.id} key={location.id}>{location.name}</option>)}</select></Field>
          <Field id="location-order" label="Order" help="Keyboard-editable display order."><input id="location-order" type="number" min="0" max="100000" value={draft.sortOrder} onChange={(event) => setDraft({ ...draft, sortOrder: Number(event.target.value) })} /></Field>
        </div>
        <Field id="location-description" label="Description" help="Stored as structured metadata."><textarea id="location-description" value={draft.metadata?.description || ""} onChange={(event) => setDraft({ ...draft, metadata: { ...draft.metadata, description: event.target.value } })} /></Field>
        <div className="rm-actions"><button className="primary-button" disabled={busy || !draft.name || !draft.stableKey}>{busy ? "Saving…" : "Save location"}</button>{draft.id ? <button type="button" className="ghost-button" disabled={busy} onClick={setActive}>{draft.active ? "Deactivate" : "Activate"}</button> : null}</div>
        <p role="status">{message}</p>
      </form>
    </div>
  </section>;
}
