import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  calculateStructuredInventoryQuantity,
  compareInventoryDecimals,
  formatInventoryDecimal,
  inventoryCountModeLabel,
  inventoryDecimalDraftState,
  inventoryStructuredComponentLabel,
  INVENTORY_COUNT_MODES,
  normalizeInventoryDecimal,
} from '../data/inventoryStructuredQuantities.js';
import { INVENTORY_REFRIGERATOR_DEFINITIONS } from '../data/inventoryOperationalScope.js';
import {
  acceptInventoryCountAssignment,
  applyInventoryCounterRefrigeratorDefault,
  createInventoryCountAssignment,
  loadInventoryCounterWorkspace,
  replaceInventoryCountAssignment,
  returnInventoryCountAssignment,
  setInventoryCounterLineQuantity,
  setInventoryCounterLineStructuredQuantity,
  setInventoryCounterMembership,
  submitInventoryCountAssignment,
} from '../lib/inventoryClient.js';

function formatDateTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Oslo', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value));
}

function quantity(value) {
  return formatInventoryDecimal(value);
}

function Message({ status }) {
  if (!status?.message) return null;
  return <p className={`inventory-message ${status.ok === false ? 'error' : 'success'}`} role="status" aria-live="polite">{status.message}</p>;
}

function StateBadge({ state }) {
  const label = ({ assigned: 'In progress', submitted: 'Sent to Bobby', returned: 'Returned', accepted: 'Accepted', superseded: 'Superseded' })[state] || state;
  const tone = state === 'accepted' ? 'good' : ['returned', 'superseded'].includes(state) ? 'warning' : state === 'submitted' ? 'active' : '';
  return <span className={`inventory-status ${tone}`.trim()}>{label}</span>;
}

function StatusBadge({ label, tone = '' }) {
  return <span className={`inventory-status ${tone}`.trim()}>{label}</span>;
}

function structuredDraftResult(line, draft) {
  try {
    if (line.countMode === INVENTORY_COUNT_MODES.CONTAINER_PLUS_VOLUME) {
      return { ok: true, value: calculateStructuredInventoryQuantity({
        countMode: line.countMode,
        wholeCount: draft.wholeUnits,
        openVolumeLiters: draft.openVolumeLiters,
        containerCapacityLiters: line.containerCapacityLiters,
      }) };
    }
    if (line.countMode === INVENTORY_COUNT_MODES.KEG_FRACTION) {
      return { ok: true, value: calculateStructuredInventoryQuantity({
        countMode: line.countMode,
        fullKegs: draft.fullKegs,
        partialKegFraction: draft.partialKegFraction,
      }) };
    }
    return { ok: false, message: 'This line is not a structured count.' };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

function CounterLineCard({ line, readOnly, busy, onSave }) {
  const [draftValue, setDraftValue] = useState(line.countedQuantityExact ?? '');
  const [note, setNote] = useState(line.note || '');
  const [structuredDraft, setStructuredDraft] = useState({
    wholeUnits: line.countedWholeUnitsExact ?? '',
    openVolumeLiters: line.countedOpenVolumeLitersExact ?? '',
    fullKegs: line.countedFullKegsExact ?? '',
    partialKegFraction: line.countedPartialKegFractionExact ?? '',
  });
  const structured = structuredDraftResult(line, structuredDraft);
  const unitDraft = inventoryDecimalDraftState(draftValue, { maxScale: 6, allowNegative: false });
  const productLabel = line.practicalName || line.productName;
  const officialLabel = line.practicalName && line.practicalName !== line.productName ? line.productName : '';

  useEffect(() => {
    setDraftValue(line.countedQuantityExact ?? '');
    setNote(line.note || '');
    setStructuredDraft({
      wholeUnits: line.countedWholeUnitsExact ?? '',
      openVolumeLiters: line.countedOpenVolumeLitersExact ?? '',
      fullKegs: line.countedFullKegsExact ?? '',
      partialKegFraction: line.countedPartialKegFractionExact ?? '',
    });
  }, [line.id, line.updatedAt]);

  const save = () => {
    if (line.countMode === INVENTORY_COUNT_MODES.UNIT) {
      onSave(line, {
        countedQuantity: normalizeInventoryDecimal(draftValue, { maxScale: 6, allowNegative: false }),
        note,
      });
    } else if (structured.ok) {
      onSave(line, { ...structured.value, note });
    }
  };

  return (
    <article id={`counter-line-${line.id}`} className="inventory-line-card counter-line-card">
      <div className="inventory-line-heading">
        <div>
          <h3>{productLabel}</h3>
          {officialLabel && <p>{officialLabel}</p>}
          <p>{line.millumItemRef ? `Millum ${line.millumItemRef} · ` : ''}{inventoryCountModeLabel(line.countMode)} · {line.unitLabel}</p>
        </div>
        <StatusBadge label={line.countStatus === 'counted' ? 'Recorded' : 'Incomplete'} tone={line.countStatus === 'counted' ? 'good' : ''} />
      </div>
      {line.countMode === INVENTORY_COUNT_MODES.CONTAINER_PLUS_VOLUME ? (
        <>
          <p className="inventory-policy-note">Bottle size: {quantity(line.containerCapacityLiters)} L. Enter sealed bottles and combined open liters.</p>
          <div className="inventory-case-count">
            <label>Sealed bottles<input type="text" inputMode="numeric" value={structuredDraft.wholeUnits} disabled={readOnly || busy} onChange={(event) => setStructuredDraft((current) => ({ ...current, wholeUnits: event.target.value }))} /></label>
            <label>Open liters<input type="text" inputMode="decimal" value={structuredDraft.openVolumeLiters} disabled={readOnly || busy} onChange={(event) => setStructuredDraft((current) => ({ ...current, openVolumeLiters: event.target.value }))} /></label>
            <div><span>Total</span><strong>{structured.ok ? `${quantity(structured.value.countedQuantity)} L` : '-'}</strong></div>
          </div>
        </>
      ) : line.countMode === INVENTORY_COUNT_MODES.KEG_FRACTION ? (
        <>
          <div className="inventory-case-count">
            <label>Full kegs<input type="text" inputMode="numeric" value={structuredDraft.fullKegs} disabled={readOnly || busy} onChange={(event) => setStructuredDraft((current) => ({ ...current, fullKegs: event.target.value }))} /></label>
            <label>Partial fraction<input type="text" inputMode="decimal" value={structuredDraft.partialKegFraction} disabled={readOnly || busy} onChange={(event) => setStructuredDraft((current) => ({ ...current, partialKegFraction: event.target.value }))} /></label>
            <div><span>Total</span><strong>{structured.ok ? `${quantity(structured.value.countedQuantity)} kegs` : '-'}</strong></div>
          </div>
          <div className="inventory-action-row inventory-keg-fractions">{[['0.25', '¼'], ['0.5', '½'], ['0.75', '¾']].map(([value, label]) => <button type="button" className="secondary-button" key={value} disabled={readOnly || busy} onClick={() => setStructuredDraft((current) => ({ ...current, partialKegFraction: value }))}>{label}</button>)}</div>
        </>
      ) : (
        <label>Physical counted quantity<div className="inventory-quantity-row"><input type="text" inputMode="decimal" value={draftValue} disabled={readOnly || busy} onChange={(event) => setDraftValue(event.target.value)} /><span>{line.unitLabel}</span></div></label>
      )}
      {!structured.ok && line.countMode !== INVENTORY_COUNT_MODES.UNIT && <p className="error-text">{structured.message}</p>}
      {line.countedQuantityExact !== null && <p className="inventory-policy-note"><strong>{inventoryStructuredComponentLabel(line) || `${quantity(line.countedQuantityExact)} ${line.unitLabel}`}</strong></p>}
      <label>Count note<textarea rows="2" value={note} disabled={readOnly || busy} onChange={(event) => setNote(event.target.value)} /></label>
      {!readOnly && <button type="button" className="primary-button inventory-full-button" disabled={busy || (line.countMode === INVENTORY_COUNT_MODES.UNIT ? !(unitDraft.complete && unitDraft.valid) : !structured.ok)} onClick={save}>{busy ? 'Saving...' : line.countMode === INVENTORY_COUNT_MODES.CONTAINER_PLUS_VOLUME ? 'Save bottle count' : line.countMode === INVENTORY_COUNT_MODES.KEG_FRACTION ? 'Save keg count' : 'Save physical count'}</button>}
      {line.countedByName && <p className="inventory-audit">Recorded by {line.countedByName}{line.countedAt ? ` · ${formatDateTime(line.countedAt)}` : ''}</p>}
    </article>
  );
}

export function CounterInventoryWorkspace({ requestWriteAccess, onClose }) {
  const [assignments, setAssignments] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [physicalConfirmation, setPhysicalConfirmation] = useState(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    const result = await loadInventoryCounterWorkspace();
    if (!mounted.current) return result;
    if (result.ok) {
      setAssignments(result.assignments);
      setSelectedId((current) => result.assignments.some((item) => item.id === current) ? current : (result.assignments[0]?.id || ''));
    } else setStatus(result);
    setLoading(false);
    return result;
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    const timer = window.setInterval(refresh, 30000);
    return () => { mounted.current = false; window.clearInterval(timer); };
  }, [refresh]);

  const assignment = assignments.find((item) => item.id === selectedId) || assignments[0] || null;
  const incomplete = assignment?.lines.filter((line) => line.countStatus !== 'counted') || [];
  const readOnly = assignment ? !['assigned', 'returned'].includes(assignment.state) : true;

  const run = async (id, operation) => {
    if (!(await requestWriteAccess())) return null;
    setBusyId(id);
    const result = await operation();
    setBusyId('');
    setStatus(result);
    if (result.ok) await refresh();
    return result;
  };

  const saveLine = (line, values) => {
    const common = {
      assignmentId: assignment.id,
      lineId: line.id,
      note: values.note,
      expectedAssignmentRevision: assignment.revision,
      expectedLineUpdatedAt: line.updatedAt,
    };
    if (line.countMode === INVENTORY_COUNT_MODES.UNIT) {
      return run(line.id, () => setInventoryCounterLineQuantity({ ...common, countedQuantity: values.countedQuantity }));
    }
    return run(line.id, () => setInventoryCounterLineStructuredQuantity({
      ...common,
      wholeUnits: values.countedWholeUnits,
      openVolumeLiters: values.countedOpenVolumeLiters,
      fullKegs: values.countedFullKegs,
      partialKegFraction: values.countedPartialKegFraction,
    }));
  };

  const nextIncomplete = () => {
    const next = incomplete[0];
    if (next) document.getElementById(`counter-line-${next.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading) return <main className="page inventory-workspace" role="status" aria-live="polite" aria-busy="true"><section className="inventory-panel"><p>Loading your refrigerator assignments...</p></section></main>;
  return (
    <main className="page inventory-workspace counter-workspace">
      <header className="inventory-topbar"><button type="button" className="secondary-button" onClick={onClose}>Log out</button><div><p className="eyebrow">Mesh Youngstorget</p><h1>Stock Count</h1><p className="muted">Assigned refrigerator counting only</p></div></header>
      <Message status={status} />
      {!assignment ? (
        <section className="inventory-panel inventory-empty"><h2>No active refrigerator assignment</h2><p className="muted">Ask Bobby to authorize and assign your refrigerator in the active Stock Count.</p><button type="button" className="secondary-button" onClick={refresh}>Refresh</button></section>
      ) : (
        <>
          {assignments.length > 1 && <nav className="inventory-location-tabs" aria-label="Your refrigerator assignments">{assignments.map((item) => <button type="button" key={item.id} className={item.id === assignment.id ? 'active' : ''} onClick={() => { setSelectedId(item.id); setPhysicalConfirmation(false); }}><span>{item.location.name}</span><small>{item.lines.filter((line) => line.countStatus === 'counted').length}/{item.lines.length} recorded</small></button>)}</nav>}
          <section className="inventory-session-header">
            <div><p className="eyebrow">{assignment.session.countDate}</p><h2>{assignment.location.name}</h2><p>{assignment.session.title} · {assignment.lines.length - incomplete.length} of {assignment.lines.length} recorded</p></div>
            <StateBadge state={assignment.state} />
          </section>
          {assignment.state === 'returned' && <section className="inventory-warning"><strong>Returned by Bobby</strong><p>{assignment.returnMessage}</p><p className="inventory-audit">{formatDateTime(assignment.returnedAt)}</p></section>}
          {assignment.state === 'submitted' && <section className="inventory-panel"><strong>Waiting for Bobby’s review</strong><p className="muted">You can read this refrigerator, but it is locked until Bobby accepts or returns it.</p></section>}
          {assignment.state === 'accepted' && <section className="inventory-panel"><strong>Accepted by Bobby</strong><p className="muted">This refrigerator is finished. Session completion and approval remain manager actions.</p></section>}
          {!readOnly && <section className="inventory-panel counter-default-panel"><h2>Physically full?</h2><p className="muted">After checking the refrigerator, apply its existing default to uncounted lines only. Saved deviations are preserved; the default itself is never changed.</p><label className="inventory-danger-option"><input type="checkbox" checked={physicalConfirmation} onChange={(event) => setPhysicalConfirmation(event.target.checked)} />I physically checked this refrigerator</label><button type="button" className="secondary-button inventory-full-button" disabled={!physicalConfirmation || Boolean(busyId)} onClick={async () => { const result = await run('default', () => applyInventoryCounterRefrigeratorDefault({ assignmentId: assignment.id, physicalConfirmation: true, expectedAssignmentRevision: assignment.revision })); if (result?.ok) setPhysicalConfirmation(false); }}>{busyId === 'default' ? 'Applying...' : 'Apply refrigerator default to uncounted lines'}</button></section>}
          <div className="inventory-action-row counter-progress-actions"><button type="button" className="secondary-button" disabled={!incomplete.length} onClick={nextIncomplete}>Next incomplete line</button><span>{incomplete.length} incomplete</span></div>
          <div className="inventory-line-list">{assignment.lines.map((line) => <CounterLineCard key={line.id} line={line} readOnly={readOnly} busy={busyId === line.id} onSave={saveLine} />)}</div>
          {!readOnly && <section className="inventory-panel counter-submit-panel"><h2>Send this refrigerator for review</h2><p className="muted">This submits only {assignment.location.name}. It does not complete or approve the Stock Count.</p><button type="button" className="primary-button inventory-full-button" disabled={Boolean(busyId) || incomplete.length > 0} onClick={() => run('submit', () => submitInventoryCountAssignment({ assignmentId: assignment.id, expectedAssignmentRevision: assignment.revision, expectedSessionUpdatedAt: assignment.session.updatedAt }))}>{busyId === 'submit' ? 'Sending...' : 'Ferdig – send til Bobby'}</button></section>}
        </>
      )}
    </main>
  );
}

function assignmentReview(assignment, lines, standards) {
  const locationLines = lines.filter((line) => line.locationId === assignment.locationId);
  const standardKeys = new Set(standards.filter((standard) => standard.active !== false && standard.locationId === assignment.locationId).map((standard) => standard.productId));
  return {
    lines: locationLines,
    incomplete: locationLines.filter((line) => line.countStatus !== 'counted'),
    deviations: locationLines.filter((line) => line.countStatus === 'counted' && line.countedQuantityExact !== null && line.parQuantityExact !== null && compareInventoryDecimals(line.countedQuantityExact, line.parQuantityExact) !== 0),
    extras: locationLines.filter((line) => !standardKeys.has(line.productId)),
    notes: locationLines.filter((line) => line.note),
  };
}

export function CounterAssignmentManager({ data, activeSession, lines, requestWriteAccess, refresh, setStatus }) {
  const [counterMembershipId, setCounterMembershipId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [busyId, setBusyId] = useState('');
  const [returnMessages, setReturnMessages] = useState({});
  const [replacementDrafts, setReplacementDrafts] = useState({});
  const operationalCodes = useMemo(() => new Set(INVENTORY_REFRIGERATOR_DEFINITIONS.map((item) => item.code)), []);
  const membershipsByCounter = new Map(data.counterMemberships.map((item) => [item.counterAuthUserId, item]));
  const profilesById = new Map(data.counterProfiles.map((item) => [item.id, item]));
  const activeMemberships = data.counterMemberships.filter((item) => item.active);
  const assignments = activeSession ? data.assignments.filter((item) => item.sessionId === activeSession.id) : [];
  const currentAssignments = assignments.filter((item) => item.state !== 'superseded');
  const supersededAssignments = assignments.filter((item) => item.state === 'superseded');
  const assignedLocationIds = new Set(currentAssignments.map((item) => item.locationId));
  const sessionLocationIds = new Set(lines.map((line) => line.locationId));
  const assignableLocations = data.locations.filter((item) => item.active !== false && operationalCodes.has(item.code) && sessionLocationIds.has(item.id) && !assignedLocationIds.has(item.id));

  useEffect(() => {
    if (!activeMemberships.some((item) => item.id === counterMembershipId)) setCounterMembershipId(activeMemberships[0]?.id || '');
    if (!assignableLocations.some((item) => item.id === locationId)) setLocationId(assignableLocations[0]?.id || '');
  }, [activeMemberships, assignableLocations, counterMembershipId, locationId]);

  const run = async (id, operation) => {
    if (!(await requestWriteAccess())) return null;
    setBusyId(id);
    const result = await operation();
    setBusyId('');
    setStatus(result);
    if (result.ok) await refresh();
    return result;
  };

  const updateReplacementDraft = (assignmentId, changes) => {
    setReplacementDrafts((current) => ({
      ...current,
      [assignmentId]: { dataAction: 'preserve', confirmClear: false, ...(current[assignmentId] || {}), ...changes },
    }));
  };

  return (
    <div className="inventory-stack">
      <section className="inventory-panel">
        <div className="inventory-panel-heading"><div><p className="eyebrow">Supabase Auth counters</p><h2>Counter authorization</h2></div></div>
        <p className="muted">Authorization is separate from the profile role. Counters receive no manager or configuration access.</p>
        {!data.counterProfiles.length && <p>No profiles with the counter role exist. Provision the Supabase Auth profile outside this Stock Count workflow first.</p>}
        <div className="inventory-line-list">{data.counterProfiles.map((profile) => { const membership = membershipsByCounter.get(profile.id); return <article className="inventory-restock-card" key={profile.id}><div className="inventory-line-heading"><div><h3>{profile.displayName}</h3><p>{profile.active ? 'Active Auth profile' : 'Inactive Auth profile'}{profile.isSharedDevice ? ' · shared device blocked' : ''}</p></div><StatusBadge label={membership?.active ? 'Authorized' : 'Not authorized'} tone={membership?.active ? 'good' : ''} /></div><button type="button" className="secondary-button" disabled={Boolean(busyId) || !profile.active || profile.isSharedDevice} onClick={() => run(`membership-${profile.id}`, () => setInventoryCounterMembership({ counterAuthUserId: profile.id, active: !membership?.active }))}>{busyId === `membership-${profile.id}` ? 'Saving...' : membership?.active ? 'Revoke counter authorization' : 'Authorize counter'}</button></article>; })}</div>
      </section>

      <section className="inventory-panel">
        <div className="inventory-panel-heading"><div><p className="eyebrow">Active Stock Count</p><h2>Assign refrigerators</h2></div></div>
        {!activeSession ? <p>No active Stock Count is available.</p> : <><p>{activeSession.title} · {activeSession.countDate}</p><div className="inventory-form-grid"><label>Counter<select value={counterMembershipId} onChange={(event) => setCounterMembershipId(event.target.value)}><option value="">Choose counter</option>{activeMemberships.map((membership) => <option key={membership.id} value={membership.id}>{profilesById.get(membership.counterAuthUserId)?.displayName || 'Counter'}</option>)}</select></label><label>Operational refrigerator<select value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="">Choose refrigerator</option>{assignableLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label></div><button type="button" className="primary-button" disabled={!counterMembershipId || !locationId || Boolean(busyId)} onClick={() => run('assign', () => createInventoryCountAssignment({ sessionId: activeSession.id, locationId, counterMembershipId, expectedSessionUpdatedAt: activeSession.updatedAt }))}>{busyId === 'assign' ? 'Assigning...' : 'Assign refrigerator'}</button></>}
      </section>

      <section className="inventory-panel">
        <div className="inventory-panel-heading"><div><p className="eyebrow">Manager review</p><h2>Assigned refrigerators</h2></div></div>
        {!currentAssignments.length && <p>No current refrigerator assignments exist in this Stock Count.</p>}
        <div className="inventory-line-list">{currentAssignments.map((assignment) => { const membership = data.counterMemberships.find((item) => item.id === assignment.counterMembershipId); const counter = profilesById.get(membership?.counterAuthUserId); const location = data.locations.find((item) => item.id === assignment.locationId); const review = assignmentReview(assignment, lines, data.standards); const replacementDraft = { dataAction: 'preserve', confirmClear: false, ...(replacementDrafts[assignment.id] || {}) }; const replacementCandidates = activeMemberships.filter((item) => item.id !== assignment.counterMembershipId); const clearEligible = assignment.state === 'assigned' && !assignment.submittedAt; return <article className="inventory-line-card" key={assignment.id}><div className="inventory-line-heading"><div><h3>{location?.name || 'Refrigerator'}</h3><p>{counter?.displayName || 'Counter'} · revision {assignment.revision}</p></div><StateBadge state={assignment.state} /></div><div className="inventory-summary-grid"><div><strong>{review.lines.length - review.incomplete.length}/{review.lines.length}</strong><span>recorded</span></div><div><strong>{review.incomplete.length}</strong><span>incomplete</span></div><div><strong>{review.deviations.length}</strong><span>deviations</span></div><div><strong>{review.extras.length}</strong><span>extra products</span></div></div>{review.incomplete.length > 0 && <details><summary>Incomplete lines</summary>{review.incomplete.map((line) => <p key={line.id}>{line.productName}</p>)}</details>}{review.deviations.length > 0 && <details open={assignment.state === 'submitted'}><summary>Deviations from refrigerator default</summary>{review.deviations.map((line) => <p key={line.id}><strong>{line.productName}</strong>: {quantity(line.countedQuantityExact)} / {quantity(line.parQuantityExact)} {line.unitLabel}</p>)}</details>}{review.extras.length > 0 && <details><summary>Extra products</summary>{review.extras.map((line) => <p key={line.id}>{line.productName}</p>)}</details>}{review.notes.length > 0 && <details open={assignment.state === 'submitted'}><summary>Line notes</summary>{review.notes.map((line) => <p key={line.id}><strong>{line.productName}</strong>: {line.note}</p>)}</details>}{assignment.submittedAt && <p className="inventory-audit">Submitted {formatDateTime(assignment.submittedAt)} by {assignment.submittedByName || counter?.displayName}</p>}{assignment.returnMessage && <div className="inventory-warning"><strong>Return message</strong><p>{assignment.returnMessage}</p></div>}{assignment.state === 'submitted' && <div className="inventory-stack"><label>Message required when returning<textarea rows="2" value={returnMessages[assignment.id] || ''} onChange={(event) => setReturnMessages((current) => ({ ...current, [assignment.id]: event.target.value }))} /></label><div className="inventory-action-row"><button type="button" className="secondary-button" disabled={Boolean(busyId) || !(returnMessages[assignment.id] || '').trim()} onClick={() => run(`return-${assignment.id}`, () => returnInventoryCountAssignment({ assignmentId: assignment.id, returnMessage: returnMessages[assignment.id], expectedAssignmentRevision: assignment.revision }))}>Return for correction</button><button type="button" className="primary-button" disabled={Boolean(busyId) || review.incomplete.length > 0} onClick={() => run(`accept-${assignment.id}`, () => acceptInventoryCountAssignment({ assignmentId: assignment.id, expectedAssignmentRevision: assignment.revision }))}>Accept refrigerator</button></div><p className="inventory-policy-note">Return submitted work before replacing its counter.</p></div>}{['assigned', 'returned'].includes(assignment.state) && <details className="inventory-replacement-panel"><summary>Bytt teller</summary><div className="inventory-stack"><p className="inventory-warning"><strong>Immediate access change</strong><br />The former counter immediately loses access to this refrigerator. The replacement receives only this current assignment.</p><label>Replacement counter<select value={replacementDraft.replacementCounterMembershipId || ''} onChange={(event) => updateReplacementDraft(assignment.id, { replacementCounterMembershipId: event.target.value })}><option value="">Choose authorized counter</option>{replacementCandidates.map((item) => <option key={item.id} value={item.id}>{profilesById.get(item.counterAuthUserId)?.displayName || 'Counter'}</option>)}</select></label><label>Required replacement reason<textarea rows="2" value={replacementDraft.reason || ''} onChange={(event) => updateReplacementDraft(assignment.id, { reason: event.target.value })} /></label><fieldset><legend>Existing working data</legend><label><input type="radio" name={`replacement-data-${assignment.id}`} checked={replacementDraft.dataAction === 'preserve'} onChange={() => updateReplacementDraft(assignment.id, { dataAction: 'preserve', confirmClear: false })} />Preserve quantities, notes, and original line audit</label><label><input type="radio" name={`replacement-data-${assignment.id}`} disabled={!clearEligible} checked={replacementDraft.dataAction === 'clear_unsubmitted'} onChange={() => updateReplacementDraft(assignment.id, { dataAction: 'clear_unsubmitted' })} />Clear never-submitted working data</label>{!clearEligible && <p className="inventory-policy-note">Clear is unavailable because this assignment has already been submitted.</p>}</fieldset>{replacementDraft.dataAction === 'clear_unsubmitted' && <label className="inventory-danger-option"><input type="checkbox" checked={replacementDraft.confirmClear === true} onChange={(event) => updateReplacementDraft(assignment.id, { confirmClear: event.target.checked })} />I understand the entered working values will be cleared after their audit snapshot is retained</label>}<button type="button" className="secondary-button" disabled={Boolean(busyId) || !replacementDraft.replacementCounterMembershipId || !(replacementDraft.reason || '').trim() || (replacementDraft.dataAction === 'clear_unsubmitted' && replacementDraft.confirmClear !== true)} onClick={() => run(`replace-${assignment.id}`, () => replaceInventoryCountAssignment({ assignmentId: assignment.id, replacementCounterMembershipId: replacementDraft.replacementCounterMembershipId, reason: replacementDraft.reason, dataAction: replacementDraft.dataAction, confirmClear: replacementDraft.confirmClear, expectedAssignmentRevision: assignment.revision }))}>{busyId === `replace-${assignment.id}` ? 'Replacing...' : 'Replace counter'}</button></div></details>}</article>; })}</div>
        {supersededAssignments.length > 0 && <><div className="inventory-panel-heading"><div><p className="eyebrow">Audit history</p><h3>Superseded assignments</h3></div></div><div className="inventory-line-list">{supersededAssignments.map((assignment) => { const membership = data.counterMemberships.find((item) => item.id === assignment.counterMembershipId); const counter = profilesById.get(membership?.counterAuthUserId); const replacement = assignments.find((item) => item.id === assignment.supersededByAssignmentId); const replacementMembership = data.counterMemberships.find((item) => item.id === replacement?.counterMembershipId); const replacementCounter = profilesById.get(replacementMembership?.counterAuthUserId); const location = data.locations.find((item) => item.id === assignment.locationId); return <article className="inventory-line-card inventory-superseded-assignment" key={assignment.id}><div className="inventory-line-heading"><div><h3>{location?.name || 'Refrigerator'}</h3><p>{counter?.displayName || 'Counter'} → {replacementCounter?.displayName || 'Replacement counter'}</p></div><StateBadge state="superseded" /></div><p><strong>{assignment.supersededRecordedLineCount ?? 0}/{assignment.supersededTotalLineCount ?? 0}</strong> recorded when replaced · revision {assignment.revision}</p><p><strong>Reason:</strong> {assignment.supersessionReason}</p><p><strong>Working data:</strong> {assignment.replacementDataAction === 'clear_unsubmitted' ? 'Cleared after audit snapshot' : 'Preserved'}</p><p className="inventory-audit">Replaced {formatDateTime(assignment.supersededAt)} by {assignment.supersededByName}</p></article>; })}</div></>}
      </section>
    </div>
  );
}
