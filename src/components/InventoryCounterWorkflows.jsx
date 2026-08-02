import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  compareInventoryDecimals,
  formatInventoryDecimal,
  inventoryCountModeLabel,
  inventoryStructuredComponentLabel,
  INVENTORY_COUNT_MODES,
} from '../data/inventoryStructuredQuantities.js';
import {
  COUNTER_DRAFT_STATES,
  counterAssignmentIsEditable,
  counterLineDraftHasChanges,
  counterLineIsDeviation,
  createCounterLineDraft,
  evaluateCounterLineDraft,
  findAdjacentIncompleteLineId,
  reconcileCounterDrafts,
  summarizeCounterAssignment,
} from '../data/inventoryCounterMobile.js';
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

function CounterDraftStatus({ line, draft }) {
  const dirty = counterLineDraftHasChanges(line, draft);
  const state = [COUNTER_DRAFT_STATES.SAVING, COUNTER_DRAFT_STATES.FAILED, COUNTER_DRAFT_STATES.STALE].includes(draft.saveState)
    ? draft.saveState
    : dirty
      ? COUNTER_DRAFT_STATES.UNSAVED
      : line.countStatus === 'counted'
        ? COUNTER_DRAFT_STATES.SAVED
        : COUNTER_DRAFT_STATES.IDLE;
  const label = {
    idle: 'Not counted',
    unsaved: 'Unsaved changes',
    saving: 'Saving…',
    saved: 'Saved',
    failed: 'Save failed — retry',
    stale: 'Changed elsewhere — review and retry',
  }[state];
  return (
    <div className={`counter-save-status ${state}`} data-save-state={state} role="status" aria-live="polite">
      <strong>{label}</strong>
      {draft.error && <span>{draft.error}</span>}
    </div>
  );
}

function CounterLineCard({ line, draft, readOnly, workspaceBusy, onDraft, onSave, onMoveIncomplete, onActive }) {
  const savingRef = useRef(false);
  const evaluated = evaluateCounterLineDraft(line, draft);
  const dirty = counterLineDraftHasChanges(line, draft);
  const saving = draft.saveState === COUNTER_DRAFT_STATES.SAVING;
  const productLabel = line.practicalName || line.productName;
  const officialLabel = line.practicalName && line.practicalName !== line.productName ? line.productName : '';
  const deviation = evaluated.ok && counterLineIsDeviation(line, draft);
  const inputPrefix = `counter-${line.id}`;
  const change = (changes) => onDraft(line.id, { ...changes, saveState: COUNTER_DRAFT_STATES.UNSAVED, error: '' });

  const save = async () => {
    if (savingRef.current || !evaluated.ok || !dirty) return;
    savingRef.current = true;
    onDraft(line.id, { saveState: COUNTER_DRAFT_STATES.SAVING, error: '' });
    const result = await onSave(line, evaluated);
    savingRef.current = false;
    if (result?.ok) {
      onDraft(line.id, { saveState: COUNTER_DRAFT_STATES.SAVED, error: '' });
      onMoveIncomplete(line.id, 1);
      return;
    }
    const stale = /changed on another device|refresh before trying again/i.test(result?.message || '');
    onDraft(line.id, {
      saveState: stale ? COUNTER_DRAFT_STATES.STALE : COUNTER_DRAFT_STATES.FAILED,
      error: result?.message || 'The value was not saved. Retry when the connection is available.',
    });
  };

  return (
    <article id={`counter-line-${line.id}`} className={`inventory-line-card counter-line-card${deviation ? ' counter-line-deviation' : ''}`} data-line-state={line.countStatus}>
      <div className="inventory-line-heading">
        <div>
          <h3>{productLabel}</h3>
          {officialLabel && <p className="counter-official-name">Official: {officialLabel}</p>}
          <p>{line.millumItemRef ? `Millum ${line.millumItemRef} · ` : ''}{inventoryCountModeLabel(line.countMode)} · {line.unitLabel}</p>
        </div>
        <StatusBadge label={line.countStatus === 'counted' ? 'Counted' : 'Not counted'} tone={line.countStatus === 'counted' ? 'good' : ''} />
      </div>
      <div className="counter-standard-actual" aria-label={`${productLabel} standard and actual quantity`}>
        <div><span>Configured standard</span><strong>{line.standardQuantityExact === null ? 'Not set' : `${quantity(line.standardQuantityExact)} ${line.unitLabel}`}</strong></div>
        <div><span>Actual</span><strong>{evaluated.ok ? `${quantity(evaluated.countedQuantity)} ${line.unitLabel}` : 'Not counted'}</strong></div>
      </div>
      {deviation && <p className="counter-deviation-label"><strong>Deviation:</strong> actual quantity differs from the configured standard.</p>}
      {line.countMode === INVENTORY_COUNT_MODES.CONTAINER_PLUS_VOLUME ? (
        <>
          <p className="inventory-policy-note">Bottle size: {quantity(line.containerCapacityLiters)} L. Enter sealed bottles and combined open liters.</p>
          <div className="inventory-case-count counter-structured-fields">
            <label htmlFor={`${inputPrefix}-whole`}>Sealed bottles<input id={`${inputPrefix}-whole`} type="text" inputMode="numeric" enterKeyHint="next" autoComplete="off" value={draft.wholeUnits} disabled={readOnly || saving} onFocus={() => onActive(line.id)} onChange={(event) => change({ wholeUnits: event.target.value })} /></label>
            <label htmlFor={`${inputPrefix}-open`}>Open liters<input id={`${inputPrefix}-open`} type="text" inputMode="decimal" enterKeyHint="next" autoComplete="off" value={draft.openVolumeLiters} disabled={readOnly || saving} onFocus={() => onActive(line.id)} onChange={(event) => change({ openVolumeLiters: event.target.value })} /></label>
            <div><span>Calculated total</span><strong>{evaluated.ok ? `${quantity(evaluated.countedQuantity)} L` : 'Incomplete'}</strong></div>
          </div>
        </>
      ) : line.countMode === INVENTORY_COUNT_MODES.KEG_FRACTION ? (
        <>
          <div className="inventory-case-count counter-structured-fields">
            <label htmlFor={`${inputPrefix}-full`}>Full kegs<input id={`${inputPrefix}-full`} type="text" inputMode="numeric" enterKeyHint="next" autoComplete="off" value={draft.fullKegs} disabled={readOnly || saving} onFocus={() => onActive(line.id)} onChange={(event) => change({ fullKegs: event.target.value })} /></label>
            <label htmlFor={`${inputPrefix}-partial`}>Partial keg fraction<input id={`${inputPrefix}-partial`} type="text" inputMode="decimal" enterKeyHint="next" autoComplete="off" value={draft.partialKegFraction} disabled={readOnly || saving} onFocus={() => onActive(line.id)} onChange={(event) => change({ partialKegFraction: event.target.value })} /></label>
            <div><span>Calculated total</span><strong>{evaluated.ok ? `${quantity(evaluated.countedQuantity)} kegs` : 'Incomplete'}</strong></div>
          </div>
          <div className="inventory-action-row inventory-keg-fractions" aria-label="Common partial keg fractions">{[['0.25', '¼ keg'], ['0.5', '½ keg'], ['0.75', '¾ keg']].map(([value, label]) => <button type="button" className="secondary-button" key={value} disabled={readOnly || saving} onClick={() => change({ partialKegFraction: value })}>{label}</button>)}</div>
        </>
      ) : (
        <label className="counter-primary-quantity" htmlFor={`${inputPrefix}-quantity`}>Actual quantity<input id={`${inputPrefix}-quantity`} type="text" inputMode="decimal" enterKeyHint="next" autoComplete="off" value={draft.countedQuantity} disabled={readOnly || saving} aria-describedby={`${inputPrefix}-quantity-help`} onFocus={() => onActive(line.id)} onChange={(event) => change({ countedQuantity: event.target.value })} /><span id={`${inputPrefix}-quantity-help`}>Enter 0 when physically empty. Blank means not counted. Unit: {line.unitLabel}.</span></label>
      )}
      {!evaluated.ok && dirty && <p className="error-text">{evaluated.message}</p>}
      {line.countedQuantityExact !== null && !dirty && <p className="inventory-policy-note"><strong>{inventoryStructuredComponentLabel(line) || `${quantity(line.countedQuantityExact)} ${line.unitLabel}`}</strong></p>}
      <label htmlFor={`${inputPrefix}-note`}>Annen vare eller avvik (optional comment)<textarea id={`${inputPrefix}-note`} rows="2" value={draft.note} disabled={readOnly || saving} onFocus={() => onActive(line.id)} onChange={(event) => change({ note: event.target.value })} /></label>
      <CounterDraftStatus line={line} draft={draft} />
      {!readOnly && <button type="button" className="primary-button inventory-full-button counter-save-button" disabled={workspaceBusy || !dirty || !evaluated.ok} onClick={save}>{saving ? 'Saving…' : draft.saveState === COUNTER_DRAFT_STATES.FAILED || draft.saveState === COUNTER_DRAFT_STATES.STALE ? 'Retry save' : line.countMode === INVENTORY_COUNT_MODES.CONTAINER_PLUS_VOLUME ? 'Save bottle count' : line.countMode === INVENTORY_COUNT_MODES.KEG_FRACTION ? 'Save keg count' : 'Save actual quantity'}</button>}
      {line.countedByName && <p className="inventory-audit">Last saved by {line.countedByName}{line.countedAt ? ` · ${formatDateTime(line.countedAt)}` : ''}</p>}
    </article>
  );
}

function CounterAssignmentCard({ assignment, drafts, onOpen }) {
  const summary = summarizeCounterAssignment(assignment, drafts);
  const progress = summary.lines.length ? Math.round((summary.counted.length / summary.lines.length) * 100) : 0;
  const actionable = assignment.state !== 'superseded';
  const actionLabel = assignment.state === 'submitted' || assignment.state === 'accepted'
    ? 'View status'
    : summary.counted.length
      ? 'Resume counting'
      : 'Open refrigerator';
  return (
    <article className="inventory-line-card counter-assignment-card">
      <div className="inventory-line-heading"><div><p className="eyebrow">{assignment.session.title} · {assignment.session.countDate}</p><h2>{assignment.location.name}</h2></div><StateBadge state={assignment.state} /></div>
      <div className="counter-home-progress"><strong>{summary.counted.length}/{summary.lines.length} counted</strong><span>{summary.incomplete.length} incomplete</span></div>
      <div className="inventory-progress" role="progressbar" aria-label={`${assignment.location.name} counting progress`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>
      {summary.unsafeDrafts.length > 0 && <p className="counter-unsaved-summary"><strong>{summary.unsafeDrafts.length} unsaved or failed line draft(s)</strong> remain on this device.</p>}
      {assignment.state === 'returned' && <div className="inventory-warning"><strong>Returned by Bobby</strong><p>{assignment.returnMessage}</p></div>}
      {assignment.state === 'submitted' && <p>Submitted and read-only while Bobby reviews it.</p>}
      {assignment.state === 'accepted' && <p>Accepted and read-only. The manager owns session completion.</p>}
      {assignment.state === 'superseded' && <p>This assignment was replaced and is no longer actionable.</p>}
      {actionable && <button type="button" className="primary-button inventory-full-button" onClick={() => onOpen(assignment.id)}>{actionLabel}</button>}
    </article>
  );
}

function CounterSubmissionReview({ assignment, summary, busy, onBack, onSubmit }) {
  const blocked = summary.incomplete.length > 0 || summary.unsafeDrafts.length > 0 || summary.invalidDrafts.length > 0 || busy;
  return (
    <div className="counter-screen" data-counter-screen="review">
      <button type="button" className="secondary-button counter-back-button" onClick={onBack}>Back to counting</button>
      <section className="inventory-session-header"><div><p className="eyebrow">Review refrigerator</p><h2>{assignment.location.name}</h2><p>{assignment.session.title} · {assignment.session.countDate}</p></div><StateBadge state={assignment.state} /></section>
      <section className="inventory-panel counter-review-panel">
        <h2>Ready to send?</h2>
        <div className="inventory-summary-grid">
          <div><strong>{summary.counted.length}/{summary.lines.length}</strong><span>counted</span></div>
          <div><strong>{summary.incomplete.length}</strong><span>incomplete</span></div>
          <div><strong>{summary.deviations.length}</strong><span>deviations</span></div>
          <div><strong>{summary.notes.length}</strong><span>notes</span></div>
          <div><strong>{summary.unsafeDrafts.length}</strong><span>unsaved/failed</span></div>
          <div><strong>{summary.invalidDrafts.length}</strong><span>invalid drafts</span></div>
        </div>
        {summary.incomplete.length > 0 && <details open><summary>Incomplete products</summary>{summary.incomplete.map((line) => <p key={line.id}>{line.practicalName || line.productName}</p>)}</details>}
        {summary.deviations.length > 0 && <details><summary>Deviations from standard</summary>{summary.deviations.map((line) => <p key={line.id}><strong>{line.practicalName || line.productName}</strong>: {quantity(line.countedQuantityExact)} / {quantity(line.standardQuantityExact)} {line.unitLabel}</p>)}</details>}
        {summary.notes.length > 0 && <details><summary>Comments</summary>{summary.notes.map((line) => <p key={line.id}><strong>{line.practicalName || line.productName}</strong>: {line.note}</p>)}</details>}
        {summary.unsafeDrafts.length > 0 && <div className="inventory-warning"><strong>Save or resolve every draft before submitting.</strong><p>Your local values have not been discarded.</p></div>}
        <p className="muted">This sends only {assignment.location.name} to Bobby. It does not complete or approve the Stock Count.</p>
        <button type="button" className="primary-button inventory-full-button" disabled={blocked} onClick={onSubmit}>{busy ? 'Sending…' : 'Ferdig – send til Bobby'}</button>
      </section>
    </div>
  );
}

export function CounterInventoryWorkspace({ requestWriteAccess, onClose }) {
  const [assignments, setAssignments] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [screen, setScreen] = useState('home');
  const [drafts, setDrafts] = useState({});
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [physicalConfirmation, setPhysicalConfirmation] = useState(false);
  const [activeLineId, setActiveLineId] = useState('');
  const mounted = useRef(true);
  const operationRef = useRef('');
  const openedReturnsRef = useRef(new Set());

  const refresh = useCallback(async () => {
    const result = await loadInventoryCounterWorkspace();
    if (!mounted.current) return result;
    if (result.ok) {
      setAssignments(result.assignments);
      setDrafts((current) => reconcileCounterDrafts(current, result.assignments));
      setSelectedId((current) => result.assignments.some((item) => item.id === current) ? current : (result.assignments[0]?.id || ''));
      const returned = result.assignments.find((item) => item.state === 'returned' && !openedReturnsRef.current.has(`${item.id}:${item.revision}`));
      if (returned) {
        openedReturnsRef.current.add(`${returned.id}:${returned.revision}`);
        setSelectedId(returned.id);
        setScreen('count');
      }
    } else {
      setStatus(result);
    }
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
  const summary = useMemo(() => summarizeCounterAssignment(assignment, drafts), [assignment, drafts]);
  const hasUnsafeDrafts = useMemo(() => assignments.some((item) => summarizeCounterAssignment(item, drafts).unsafeDrafts.length > 0), [assignments, drafts]);
  const readOnly = assignment ? !counterAssignmentIsEditable(assignment.state) : true;

  useEffect(() => {
    if (!hasUnsafeDrafts) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsafeDrafts]);

  const updateDraft = (lineId, changes) => {
    const line = assignments.flatMap((item) => item.lines).find((item) => item.id === lineId);
    if (!line) return;
    setDrafts((current) => ({ ...current, [lineId]: { ...(current[lineId] || createCounterLineDraft(line)), ...changes } }));
  };

  const run = async (id, operation, { quietSuccess = false } = {}) => {
    if (operationRef.current) return { ok: false, mode: 'busy', message: 'Another Stock Count save is still in progress.' };
    operationRef.current = id;
    setBusyId(id);
    let result;
    try {
      if (!(await requestWriteAccess())) {
        result = { ok: false, mode: 'auth_required', message: 'Your Stock Count sign-in could not be verified. Your unsaved values remain on this screen.' };
      } else {
        result = await operation();
      }
      if (!quietSuccess || !result.ok) setStatus(result);
      if (result.ok) await refresh();
      return result;
    } catch (error) {
      result = { ok: false, mode: 'sync_error', message: error.message || 'The Stock Count request failed. Your draft is still here.' };
      setStatus(result);
      return result;
    } finally {
      operationRef.current = '';
      setBusyId('');
    }
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
      return run(`line-${line.id}`, () => setInventoryCounterLineQuantity({ ...common, countedQuantity: values.countedQuantity }), { quietSuccess: true });
    }
    return run(`line-${line.id}`, () => setInventoryCounterLineStructuredQuantity({
      ...common,
      wholeUnits: values.countedWholeUnits,
      openVolumeLiters: values.countedOpenVolumeLiters,
      fullKegs: values.countedFullKegs,
      partialKegFraction: values.countedPartialKegFraction,
    }), { quietSuccess: true });
  };

  const moveIncomplete = (currentLineId = activeLineId, direction = 1) => {
    const targetId = findAdjacentIncompleteLineId(assignment?.lines || [], currentLineId, direction);
    if (!targetId) return;
    setActiveLineId(targetId);
    window.requestAnimationFrame(() => {
      const target = document.getElementById(`counter-line-${targetId}`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      target?.querySelector('input:not(:disabled), textarea:not(:disabled)')?.focus({ preventScroll: true });
    });
  };

  const openAssignment = (assignmentId) => {
    setSelectedId(assignmentId);
    setPhysicalConfirmation(false);
    setActiveLineId('');
    setScreen('count');
  };

  const close = () => {
    if (hasUnsafeDrafts && !window.confirm('Unsaved or failed Stock Count values will be lost if you log out. Log out anyway?')) return;
    onClose();
  };

  const applyDefault = async () => {
    const result = await run('default', () => applyInventoryCounterRefrigeratorDefault({ assignmentId: assignment.id, physicalConfirmation: true, expectedAssignmentRevision: assignment.revision }), { quietSuccess: true });
    if (result?.ok) {
      setPhysicalConfirmation(false);
      setStatus({ ok: true, message: `Standard applied to ${Number(result.data?.updated || 0)} eligible uncounted line(s). ${Number(result.data?.preserved || 0)} previously entered line(s) were preserved. Review the remaining incomplete products.` });
    }
  };

  const submit = async () => {
    const result = await run('submit', () => submitInventoryCountAssignment({ assignmentId: assignment.id, expectedAssignmentRevision: assignment.revision, expectedSessionUpdatedAt: assignment.session.updatedAt }), { quietSuccess: true });
    if (result?.ok) {
      setStatus({ ok: true, message: `${assignment.location.name} was sent to Bobby and is now read-only.` });
      setScreen('count');
    }
  };

  if (loading) return <main className="page inventory-workspace" role="status" aria-live="polite" aria-busy="true"><section className="inventory-panel"><p>Loading your refrigerator assignments…</p></section></main>;
  const activeScreen = assignment ? screen : 'home';
  return (
    <main className="page inventory-workspace counter-workspace">
      <header className="inventory-topbar counter-topbar"><button type="button" className="secondary-button" onClick={close}>Log out</button><div><p className="eyebrow">Counter · Mesh Youngstorget</p><h1>Stock Count</h1><p className="muted">Only your assigned refrigerators</p></div></header>
      <Message status={status} />
      {status?.ok === false && <button type="button" className="secondary-button inventory-retry-button" disabled={Boolean(busyId)} onClick={refresh}>Refresh safely — keep local drafts</button>}
      {activeScreen === 'home' ? (
        <div className="counter-screen" data-counter-screen="home">
          <section className="inventory-session-header"><div><p className="eyebrow">Counter home</p><h2>Your refrigerator assignments</h2><p>Open one refrigerator and continue where you left off.</p></div><StatusBadge label={`${assignments.length} assigned`} /></section>
          {!assignments.length ? <section className="inventory-panel inventory-empty"><h2>No active refrigerator assignment</h2><p className="muted">Ask Bobby to authorize and assign your refrigerator in the active Stock Count.</p><button type="button" className="secondary-button" onClick={refresh}>Refresh assignments</button></section> : <div className="inventory-line-list counter-assignment-list">{assignments.map((item) => <CounterAssignmentCard key={item.id} assignment={item} drafts={drafts} onOpen={openAssignment} />)}</div>}
        </div>
      ) : activeScreen === 'review' ? (
        <CounterSubmissionReview assignment={assignment} summary={summary} busy={busyId === 'submit'} onBack={() => setScreen('count')} onSubmit={submit} />
      ) : (
        <div className="counter-screen" data-counter-screen="count">
          <button type="button" className="secondary-button counter-back-button" onClick={() => setScreen('home')}>Back to assignments</button>
          <section className="inventory-session-header counter-count-header">
            <div><p className="eyebrow">{assignment.session.title} · {assignment.session.countDate}</p><h2>{assignment.location.name}</h2><p>{summary.counted.length} of {summary.lines.length} counted · {summary.incomplete.length} incomplete</p></div>
            <StateBadge state={assignment.state} />
          </section>
          {assignment.state === 'returned' && <section className="inventory-warning counter-return-message" role="status"><strong>Returned by Bobby — correction required</strong><p>{assignment.returnMessage}</p><p className="inventory-audit">{formatDateTime(assignment.returnedAt)}</p></section>}
          {assignment.state === 'submitted' && <section className="inventory-panel counter-readonly-state"><strong>Sent to Bobby — waiting for review</strong><p className="muted">This refrigerator is submitted and read-only. Bobby may accept it or return it with a message.</p></section>}
          {assignment.state === 'accepted' && <section className="inventory-panel counter-readonly-state"><strong>Accepted by Bobby</strong><p className="muted">This refrigerator is read-only and finished. Session completion and approval remain manager actions.</p></section>}
          {assignment.state === 'superseded' && <section className="inventory-panel counter-readonly-state"><strong>Assignment replaced</strong><p className="muted">This refrigerator is no longer actionable from this counter account.</p></section>}
          {!readOnly && <section className="inventory-panel counter-default-panel"><h2>Bruk standard</h2><p className="muted">Physically check this refrigerator first. This fills only eligible, previously uncounted exact-standard lines. Saved quantities, deviations, and comments are preserved; the refrigerator template is never edited.</p><label className="inventory-danger-option"><input type="checkbox" checked={physicalConfirmation} disabled={Boolean(busyId) || summary.unsafeDrafts.length > 0} onChange={(event) => setPhysicalConfirmation(event.target.checked)} />I physically checked this refrigerator</label>{summary.unsafeDrafts.length > 0 && <p className="inventory-policy-note">Save or resolve local drafts before applying the standard.</p>}<button type="button" className="secondary-button inventory-full-button" disabled={!physicalConfirmation || Boolean(busyId) || summary.unsafeDrafts.length > 0} onClick={applyDefault}>{busyId === 'default' ? 'Applying…' : 'Apply standard to eligible lines'}</button></section>}
          <nav className="counter-progress-actions" aria-label="Incomplete product navigation"><button type="button" className="secondary-button" disabled={!summary.incomplete.length} onClick={() => moveIncomplete(activeLineId, -1)}>Previous incomplete</button><span><strong>{summary.incomplete.length}</strong> incomplete</span><button type="button" className="secondary-button" disabled={!summary.incomplete.length} onClick={() => moveIncomplete(activeLineId, 1)}>Next incomplete</button></nav>
          <div className="inventory-line-list counter-count-list">{assignment.lines.map((line) => <CounterLineCard key={line.id} line={line} draft={drafts[line.id] || createCounterLineDraft(line)} readOnly={readOnly} workspaceBusy={Boolean(busyId)} onDraft={updateDraft} onSave={saveLine} onMoveIncomplete={moveIncomplete} onActive={setActiveLineId} />)}</div>
          {!readOnly && <section className="inventory-panel counter-extra-note"><h2>Annen vare eller avvik</h2><p className="muted">There is no counter-safe full-catalogue extra-product lookup. Record an observed extra or relevant comment in the closest product’s comment field above; it stays inside this assigned refrigerator.</p></section>}
          {!readOnly && <section className="inventory-panel counter-submit-panel"><h2>Review before sending</h2><p className="muted">Check incomplete products, deviations, comments, and save status before sending this refrigerator to Bobby.</p><button type="button" className="primary-button inventory-full-button" disabled={Boolean(busyId)} onClick={() => setScreen('review')}>Review refrigerator</button></section>}
        </div>
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
