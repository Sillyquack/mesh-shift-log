import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
import {
  applyInventoryCounterRefrigeratorDefault,
  loadInventoryCounterWorkspace,
  setInventoryCounterLineQuantity,
  setInventoryCounterLineStructuredQuantity,
  submitInventoryCountAssignment,
} from '../lib/inventoryClient.js';
import { LocationReferenceViewer } from './LocationReferenceGuidance.jsx';
import './InventoryCounterExperience.css';

const COMPLETE_ASSIGNMENT_STATES = new Set(['submitted', 'accepted']);

function normalized(value) {
  return String(value || '').trim().toLowerCase();
}

function formatDateTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Oslo',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function quantity(value) {
  return formatInventoryDecimal(value);
}

function percentage(completed, total) {
  return total ? Math.round((completed / total) * 100) : 0;
}

function firstName(value) {
  return String(value || 'Counter').trim().split(/\s+/)[0] || 'Counter';
}

function stateLabel(state) {
  return ({
    assigned: 'In progress',
    submitted: 'Sent to Bobby',
    returned: 'Correction needed',
    accepted: 'Accepted',
    superseded: 'Replaced',
  })[state] || state || 'Assigned';
}

function StateBadge({ state }) {
  const tone = state === 'accepted'
    ? 'is-complete'
    : ['returned', 'superseded'].includes(state)
      ? 'is-warning'
      : state === 'submitted'
        ? 'is-active'
        : '';
  return <span className={`counter-experience-state ${tone}`.trim()}>{stateLabel(state)}</span>;
}

function ProgressRing({ value, completed, total, label = 'counted' }) {
  return (
    <div
      className="mesh-progress-ring counter-experience-ring"
      style={{ '--mesh-progress': `${value}%` }}
      role="progressbar"
      aria-label={`${value}% ${label}`}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={value}
    >
      <div>
        <strong>{value}%</strong>
        <span>{completed}/{total || 0} {label}</span>
      </div>
    </div>
  );
}

function Feedback({ status }) {
  if (!status?.message) return null;
  return (
    <p
      className={`mesh-status ${status.ok === false ? 'is-error' : 'is-success'}`}
      role="status"
      aria-live="polite"
    >
      {status.message}
    </p>
  );
}

function draftPresentation(line, draft) {
  const dirty = counterLineDraftHasChanges(line, draft);
  const state = [
    COUNTER_DRAFT_STATES.SAVING,
    COUNTER_DRAFT_STATES.FAILED,
    COUNTER_DRAFT_STATES.STALE,
  ].includes(draft.saveState)
    ? draft.saveState
    : dirty
      ? COUNTER_DRAFT_STATES.UNSAVED
      : line.countStatus === 'counted'
        ? COUNTER_DRAFT_STATES.SAVED
        : COUNTER_DRAFT_STATES.IDLE;
  return {
    state,
    label: ({
      idle: 'Ready to count',
      unsaved: 'Unsaved changes',
      saving: 'Saving…',
      saved: 'Saved',
      failed: 'Save failed — retry',
      stale: 'Changed elsewhere — review',
    })[state],
  };
}

function CounterDraftStatus({ line, draft }) {
  const presentation = draftPresentation(line, draft);
  return (
    <div
      className={`counter-experience-save-status is-${presentation.state}`}
      data-save-state={presentation.state}
      role="status"
      aria-live="polite"
    >
      <span aria-hidden="true" />
      <div>
        <strong>{presentation.label}</strong>
        {draft.error ? <small>{draft.error}</small> : null}
      </div>
    </div>
  );
}

function actualQuantityLabel(line, evaluated, dirty) {
  if (dirty && evaluated.ok) return `${quantity(evaluated.countedQuantity)} ${line.unitLabel}`;
  if (line.countedQuantityExact !== null) return `${quantity(line.countedQuantityExact)} ${line.unitLabel}`;
  return 'Not counted';
}

function CounterProductCard({
  line,
  draft,
  readOnly,
  workspaceBusy,
  onDraft,
  onSave,
  onMoveIncomplete,
  onActive,
}) {
  const savingRef = useRef(false);
  const evaluated = evaluateCounterLineDraft(line, draft);
  const dirty = counterLineDraftHasChanges(line, draft);
  const saving = draft.saveState === COUNTER_DRAFT_STATES.SAVING;
  const productLabel = line.practicalName || line.productName;
  const officialLabel = line.practicalName && line.practicalName !== line.productName
    ? line.productName
    : '';
  const deviation = evaluated.ok && counterLineIsDeviation(line, draft);
  const inputPrefix = `counter-${line.id}`;
  const change = (changes) => onDraft(line.id, {
    ...changes,
    saveState: COUNTER_DRAFT_STATES.UNSAVED,
    error: '',
  });

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
      error: result?.message || 'This value was not saved. Your entry is still here.',
    });
  };

  return (
    <article
      id={`counter-line-${line.id}`}
      className={`counter-experience-product${deviation ? ' is-deviation' : ''}`}
      data-line-state={line.countStatus}
    >
      <header className="counter-experience-product-heading">
        <div>
          <span className="mesh-section-label">Current product</span>
          <h2>{productLabel}</h2>
          {officialLabel ? <p>Official name: {officialLabel}</p> : null}
        </div>
        <span className={`counter-experience-product-status ${line.countStatus === 'counted' ? 'is-counted' : ''}`}>
          {line.countStatus === 'counted' ? 'Counted' : 'Not counted'}
        </span>
      </header>

      <div className="counter-experience-product-facts">
        <div>
          <span>Target</span>
          <strong>
            {line.standardQuantityExact === null
              ? 'Physical count only'
              : `${quantity(line.standardQuantityExact)} ${line.unitLabel}`}
          </strong>
        </div>
        <div>
          <span>Actual</span>
          <strong>{actualQuantityLabel(line, evaluated, dirty)}</strong>
        </div>
        <div>
          <span>Method</span>
          <strong>{inventoryCountModeLabel(line.countMode)}</strong>
        </div>
      </div>

      {line.historicalSuggestionQuantityExact !== null ? (
        <details className="counter-experience-disclosure">
          <summary>Previous count suggestion</summary>
          <p>
            {quantity(line.historicalSuggestionQuantityExact)} bottle-equivalents ·{' '}
            {line.historicalSuggestionSource || 'Historical Stock Count'}
          </p>
          <small>This is context only, not a verified current count.</small>
          {line.historicalSuggestionNote ? <p>{line.historicalSuggestionNote}</p> : null}
        </details>
      ) : null}

      {deviation ? (
        <p className="counter-experience-deviation">
          <strong>Different from target.</strong> Add a short note when it helps Bobby understand why.
        </p>
      ) : null}

      <section className="counter-experience-entry" aria-label={`Count ${productLabel}`}>
        {line.countMode === INVENTORY_COUNT_MODES.CONTAINER_PLUS_VOLUME ? (
          <>
            <p>Bottle size: {quantity(line.containerCapacityLiters)} L</p>
            <div className="counter-experience-entry-grid">
              <label htmlFor={`${inputPrefix}-whole`}>
                <span>Sealed bottles</span>
                <input
                  id={`${inputPrefix}-whole`}
                  type="text"
                  inputMode="numeric"
                  enterKeyHint="next"
                  autoComplete="off"
                  value={draft.wholeUnits}
                  disabled={readOnly || saving}
                  onFocus={() => onActive(line.id)}
                  onChange={(event) => change({ wholeUnits: event.target.value })}
                />
              </label>
              <label htmlFor={`${inputPrefix}-open`}>
                <span>Combined open litres</span>
                <input
                  id={`${inputPrefix}-open`}
                  type="text"
                  inputMode="decimal"
                  enterKeyHint="next"
                  autoComplete="off"
                  value={draft.openVolumeLiters}
                  disabled={readOnly || saving}
                  onFocus={() => onActive(line.id)}
                  onChange={(event) => change({ openVolumeLiters: event.target.value })}
                />
              </label>
              <div className="counter-experience-calculated">
                <span>Calculated total</span>
                <strong>{evaluated.ok ? `${quantity(evaluated.countedQuantity)} L` : 'Incomplete'}</strong>
              </div>
            </div>
          </>
        ) : line.countMode === INVENTORY_COUNT_MODES.KEG_FRACTION ? (
          <>
            <div className="counter-experience-entry-grid">
              <label htmlFor={`${inputPrefix}-full`}>
                <span>Full kegs</span>
                <input
                  id={`${inputPrefix}-full`}
                  type="text"
                  inputMode="numeric"
                  enterKeyHint="next"
                  autoComplete="off"
                  value={draft.fullKegs}
                  disabled={readOnly || saving}
                  onFocus={() => onActive(line.id)}
                  onChange={(event) => change({ fullKegs: event.target.value })}
                />
              </label>
              <label htmlFor={`${inputPrefix}-partial`}>
                <span>Partial keg</span>
                <input
                  id={`${inputPrefix}-partial`}
                  type="text"
                  inputMode="decimal"
                  enterKeyHint="next"
                  autoComplete="off"
                  value={draft.partialKegFraction}
                  disabled={readOnly || saving}
                  onFocus={() => onActive(line.id)}
                  onChange={(event) => change({ partialKegFraction: event.target.value })}
                />
              </label>
              <div className="counter-experience-calculated">
                <span>Calculated total</span>
                <strong>{evaluated.ok ? `${quantity(evaluated.countedQuantity)} kegs` : 'Incomplete'}</strong>
              </div>
            </div>
            <div className="counter-experience-quick-values" aria-label="Common partial keg values">
              {[
                ['0.25', '¼ keg'],
                ['0.5', '½ keg'],
                ['0.75', '¾ keg'],
              ].map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  disabled={readOnly || saving}
                  onClick={() => change({ partialKegFraction: value })}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <label className="counter-experience-primary-quantity" htmlFor={`${inputPrefix}-quantity`}>
            <span>Actual quantity · {line.unitLabel}</span>
            <input
              id={`${inputPrefix}-quantity`}
              type="text"
              inputMode="decimal"
              enterKeyHint="next"
              autoComplete="off"
              value={draft.countedQuantity}
              disabled={readOnly || saving}
              aria-describedby={`${inputPrefix}-quantity-help`}
              onFocus={() => onActive(line.id)}
              onChange={(event) => change({ countedQuantity: event.target.value })}
            />
            <small id={`${inputPrefix}-quantity-help`}>Enter 0 when physically empty. Blank means not counted.</small>
          </label>
        )}
      </section>

      {!evaluated.ok && dirty ? <p className="counter-experience-field-error">{evaluated.message}</p> : null}
      {line.countedQuantityExact !== null && !dirty ? (
        <p className="counter-experience-saved-value">
          {inventoryStructuredComponentLabel(line) || `${quantity(line.countedQuantityExact)} ${line.unitLabel}`}
        </p>
      ) : null}

      <details className="counter-experience-disclosure counter-experience-note">
        <summary>Add comment or record an extra item</summary>
        <label htmlFor={`${inputPrefix}-note`}>
          <span>Optional note</span>
          <textarea
            id={`${inputPrefix}-note`}
            rows="3"
            value={draft.note}
            disabled={readOnly || saving}
            onFocus={() => onActive(line.id)}
            onChange={(event) => change({ note: event.target.value })}
            placeholder="What should Bobby know?"
          />
        </label>
      </details>

      <CounterDraftStatus line={line} draft={draft} />

      {!readOnly ? (
        <button
          type="button"
          className="counter-experience-save-button"
          disabled={workspaceBusy || !dirty || !evaluated.ok}
          onClick={save}
        >
          {saving
            ? 'Saving…'
            : [COUNTER_DRAFT_STATES.FAILED, COUNTER_DRAFT_STATES.STALE].includes(draft.saveState)
              ? 'Retry save'
              : 'Save & next product'}
        </button>
      ) : null}

      {line.countedByName ? (
        <p className="counter-experience-audit">
          Last saved by {line.countedByName}{line.countedAt ? ` · ${formatDateTime(line.countedAt)}` : ''}
        </p>
      ) : null}
    </article>
  );
}

function assignmentCallToAction(assignment, summary) {
  if (assignment.state === 'returned') return 'Fix returned count';
  if (COMPLETE_ASSIGNMENT_STATES.has(assignment.state)) return 'View progress';
  if (summary.counted.length) return 'Continue counting';
  return 'Start counting';
}

function AssignmentCard({ assignment, drafts, onOpen, featured = false }) {
  const summary = summarizeCounterAssignment(assignment, drafts);
  const progress = percentage(summary.counted.length, summary.lines.length);
  const actionable = assignment.state !== 'superseded';
  return (
    <article className={`counter-experience-assignment${featured ? ' is-featured' : ''}`}>
      <div className="counter-experience-assignment-copy">
        <div className="counter-experience-assignment-heading">
          <div>
            <span className="mesh-section-label">{assignment.session.title} · {assignment.session.countDate}</span>
            <h2>{assignment.location.name}</h2>
          </div>
          <StateBadge state={assignment.state} />
        </div>
        <p>
          {summary.incomplete.length
            ? `${summary.incomplete.length} products still need a physical count.`
            : summary.lines.length
              ? 'Every product in this location has a saved count.'
              : 'No products are configured in this assignment.'}
        </p>
        {assignment.state === 'returned' ? (
          <div className="mesh-status is-warning">
            <strong>Returned by Bobby:</strong> {assignment.returnMessage || 'Review the location and correct the count.'}
          </div>
        ) : null}
        {summary.unsafeDrafts.length ? (
          <div className="mesh-status is-warning">
            {summary.unsafeDrafts.length} unsaved or failed {summary.unsafeDrafts.length === 1 ? 'entry' : 'entries'} remain on this device.
          </div>
        ) : null}
        {actionable ? (
          <button type="button" className="mesh-primary-action" onClick={() => onOpen(assignment.id)}>
            {assignmentCallToAction(assignment, summary)} →
          </button>
        ) : null}
      </div>
      <ProgressRing
        value={progress}
        completed={summary.counted.length}
        total={summary.lines.length}
      />
    </article>
  );
}

function LocationStateNotice({ assignment }) {
  if (assignment.state === 'returned') {
    return (
      <section className="mesh-status is-warning counter-experience-location-notice" role="status">
        <div>
          <strong>Correction required</strong>
          <p>{assignment.returnMessage || 'Bobby returned this location for another physical check.'}</p>
          {assignment.returnedAt ? <small>{formatDateTime(assignment.returnedAt)}</small> : null}
        </div>
      </section>
    );
  }
  if (assignment.state === 'submitted') {
    return (
      <section className="mesh-status counter-experience-location-notice" role="status">
        <div>
          <strong>Sent to Bobby</strong>
          <p>This location is read-only while it is being reviewed.</p>
        </div>
      </section>
    );
  }
  if (assignment.state === 'accepted') {
    return (
      <section className="mesh-status is-success counter-experience-location-notice" role="status">
        <div>
          <strong>Accepted by Bobby</strong>
          <p>This location is finished and remains read-only.</p>
        </div>
      </section>
    );
  }
  if (assignment.state === 'superseded') {
    return (
      <section className="mesh-status is-warning counter-experience-location-notice" role="status">
        <div>
          <strong>Assignment replaced</strong>
          <p>This location is no longer actionable from this counter account.</p>
        </div>
      </section>
    );
  }
  return null;
}

function ExactStandardPanel({
  assignment,
  summary,
  physicalConfirmation,
  busy,
  onPhysicalConfirmation,
  onApply,
}) {
  return (
    <details className="counter-experience-standard-panel mesh-panel">
      <summary>
        <span>Fast path</span>
        <strong>Does this location exactly match the standard?</strong>
      </summary>
      <div>
        <p>
          Physically check the location first. This fills only eligible, previously uncounted exact-target lines.
          Saved values, targetless products, historical suggestions, deviations and comments stay untouched.
        </p>
        <label>
          <input
            type="checkbox"
            checked={physicalConfirmation}
            disabled={busy || summary.unsafeDrafts.length > 0}
            onChange={(event) => onPhysicalConfirmation(event.target.checked)}
          />
          <span>I physically checked this entire location</span>
        </label>
        {summary.unsafeDrafts.length > 0 ? (
          <p className="counter-experience-inline-warning">Save or resolve local entries before applying the standard.</p>
        ) : null}
        <button
          type="button"
          className="mesh-secondary-action"
          disabled={!physicalConfirmation || busy || summary.unsafeDrafts.length > 0}
          onClick={onApply}
        >
          {busy ? 'Applying…' : 'Apply exact targets to eligible products'}
        </button>
      </div>
    </details>
  );
}

function CountNavigation({ view, onView }) {
  return (
    <nav className="mesh-bottom-nav counter-experience-nav" aria-label="Stock Count sections">
      {[
        ['count', '●', 'Count'],
        ['progress', '≡', 'Progress'],
        ['review', '✓', 'Review'],
      ].map(([key, icon, label]) => (
        <button
          key={key}
          type="button"
          className={view === key ? 'is-active' : ''}
          aria-current={view === key ? 'page' : undefined}
          onClick={() => onView(key)}
        >
          <span aria-hidden="true">{icon}</span>
          <strong>{label}</strong>
        </button>
      ))}
    </nav>
  );
}

function productProgressState(line, draft) {
  const presentation = draftPresentation(line, draft);
  if ([COUNTER_DRAFT_STATES.FAILED, COUNTER_DRAFT_STATES.STALE].includes(presentation.state)) {
    return { tone: 'is-risk', label: presentation.label };
  }
  if ([COUNTER_DRAFT_STATES.UNSAVED, COUNTER_DRAFT_STATES.SAVING].includes(presentation.state)) {
    return { tone: 'is-warning', label: presentation.label };
  }
  if (line.countStatus === 'counted') return { tone: 'is-complete', label: 'Counted' };
  return { tone: '', label: 'Not counted' };
}

function ProgressView({ assignment, summary, drafts, onOpenLine, onReview }) {
  const countedIds = new Set(summary.counted.map((line) => line.id));
  const deviationIds = new Set(summary.deviations.map((line) => line.id));
  const progress = percentage(summary.counted.length, summary.lines.length);
  return (
    <section className="counter-experience-progress-view">
      <div className="mesh-section-heading counter-experience-section-heading">
        <div>
          <span className="mesh-section-label">Progress</span>
          <h1>See the whole location.</h1>
          <p>Open any product to count it or correct a saved value.</p>
        </div>
        <strong>{progress}%</strong>
      </div>

      <div className="counter-experience-summary-grid">
        <article><strong>{summary.counted.length}</strong><span>counted</span></article>
        <article><strong>{summary.incomplete.length}</strong><span>incomplete</span></article>
        <article><strong>{summary.deviations.length}</strong><span>deviations</span></article>
        <article className={summary.unsafeDrafts.length ? 'is-warning' : ''}><strong>{summary.unsafeDrafts.length}</strong><span>unsaved / failed</span></article>
      </div>

      <div className="counter-experience-product-list">
        {assignment.lines.map((line, index) => {
          const draft = drafts[line.id] || createCounterLineDraft(line);
          const state = productProgressState(line, draft);
          const displayName = line.practicalName || line.productName;
          return (
            <article key={line.id} className={state.tone}>
              <span className="counter-experience-product-index">{String(index + 1).padStart(2, '0')}</span>
              <div>
                <strong>{displayName}</strong>
                <small>
                  {countedIds.has(line.id)
                    ? `${quantity(line.countedQuantityExact)} ${line.unitLabel}`
                    : line.standardQuantityExact !== null
                      ? `Target ${quantity(line.standardQuantityExact)} ${line.unitLabel}`
                      : 'Physical count only'}
                  {deviationIds.has(line.id) ? ' · different from target' : ''}
                </small>
              </div>
              <span className="counter-experience-progress-state">{state.label}</span>
              <button type="button" onClick={() => onOpenLine(line.id)}>
                {countedIds.has(line.id) ? 'Review' : 'Count'}
              </button>
            </article>
          );
        })}
      </div>

      <button type="button" className="mesh-primary-action counter-experience-wide-action" onClick={onReview}>
        Review location →
      </button>
    </section>
  );
}

function ReviewView({ assignment, summary, busy, readOnly, onCount, onSubmit }) {
  const blocked = summary.incomplete.length > 0
    || summary.unsafeDrafts.length > 0
    || summary.invalidDrafts.length > 0
    || busy;
  const progress = percentage(summary.counted.length, summary.lines.length);
  const blockers = [
    summary.incomplete.length ? `${summary.incomplete.length} products still need a count` : '',
    summary.unsafeDrafts.length ? `${summary.unsafeDrafts.length} entries are unsaved or failed` : '',
    summary.invalidDrafts.length ? `${summary.invalidDrafts.length} entries are invalid` : '',
  ].filter(Boolean);

  return (
    <section className="counter-experience-review-view">
      <div className="mesh-hero counter-experience-review-hero">
        <div>
          <span className="mesh-kicker">Review</span>
          <h1>{blocked ? 'A few things need attention.' : 'Ready to send.'}</h1>
          <p>
            {blocked
              ? 'Nothing will be submitted until every product is saved and the location is complete.'
              : `You are about to send ${assignment.location.name} to Bobby for review.`}
          </p>
          <div className="mesh-facts">
            <span>{summary.deviations.length} deviations</span>
            <span>{summary.notes.length} notes</span>
            <span>{summary.unsafeDrafts.length} unsaved / failed</span>
          </div>
        </div>
        <ProgressRing
          value={progress}
          completed={summary.counted.length}
          total={summary.lines.length}
        />
      </div>

      {blockers.length ? (
        <section className="mesh-panel counter-experience-blockers">
          <span className="mesh-section-label">Before sending</span>
          <h2>Finish these items</h2>
          {blockers.map((item) => <p key={item}><span aria-hidden="true">!</span>{item}</p>)}
          <button type="button" className="mesh-secondary-action" onClick={onCount}>Return to Count</button>
        </section>
      ) : (
        <section className="mesh-panel counter-experience-ready-panel">
          <span aria-hidden="true">✓</span>
          <div>
            <span className="mesh-section-label">Location complete</span>
            <h2>Every active product has a saved count.</h2>
            <p>Submitting sends only this location. Bobby still owns review and final session approval.</p>
          </div>
        </section>
      )}

      <section className="mesh-panel counter-experience-review-details">
        <details open={summary.incomplete.length > 0}>
          <summary>Incomplete products <span>{summary.incomplete.length}</span></summary>
          {summary.incomplete.length
            ? summary.incomplete.map((line) => <p key={line.id}>{line.practicalName || line.productName}</p>)
            : <p>None.</p>}
        </details>
        <details>
          <summary>Deviations from target <span>{summary.deviations.length}</span></summary>
          {summary.deviations.length
            ? summary.deviations.map((line) => (
              <p key={line.id}>
                <strong>{line.practicalName || line.productName}</strong>: {quantity(line.countedQuantityExact)} / {quantity(line.standardQuantityExact)} {line.unitLabel}
              </p>
            ))
            : <p>None.</p>}
        </details>
        <details>
          <summary>Comments <span>{summary.notes.length}</span></summary>
          {summary.notes.length
            ? summary.notes.map((line) => <p key={line.id}><strong>{line.practicalName || line.productName}</strong>: {line.note}</p>)
            : <p>None.</p>}
        </details>
      </section>

      {!readOnly ? (
        <button
          type="button"
          className="mesh-primary-action counter-experience-submit"
          disabled={blocked}
          onClick={onSubmit}
        >
          {busy ? 'Sending…' : 'Send location to Bobby'}
        </button>
      ) : (
        <section className="mesh-status is-success">
          This location is already {assignment.state === 'accepted' ? 'accepted' : 'submitted'} and remains read-only.
        </section>
      )}
    </section>
  );
}

export default function InventoryCounterExperience({ requestWriteAccess, onClose }) {
  const [assignments, setAssignments] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [view, setView] = useState('home');
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
      setSelectedId((current) => (
        result.assignments.some((item) => item.id === current)
          ? current
          : (result.assignments[0]?.id || '')
      ));
      const returned = result.assignments.find((item) => (
        item.state === 'returned'
        && !openedReturnsRef.current.has(`${item.id}:${item.revision}`)
      ));
      if (returned) {
        openedReturnsRef.current.add(`${returned.id}:${returned.revision}`);
        setSelectedId(returned.id);
        setActiveLineId('');
        setView('count');
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
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
    };
  }, [refresh]);

  const assignment = assignments.find((item) => item.id === selectedId) || assignments[0] || null;
  const summary = useMemo(() => summarizeCounterAssignment(assignment, drafts), [assignment, drafts]);
  const hasUnsafeDrafts = useMemo(
    () => assignments.some((item) => summarizeCounterAssignment(item, drafts).unsafeDrafts.length > 0),
    [assignments, drafts],
  );
  const readOnly = assignment ? !counterAssignmentIsEditable(assignment.state) : true;
  const progress = percentage(summary.counted.length, summary.lines.length);
  const countComplete = summary.lines.length > 0
    && summary.incomplete.length === 0
    && summary.unsafeDrafts.length === 0
    && summary.invalidDrafts.length === 0;

  const requestedLine = assignment?.lines.find((line) => line.id === activeLineId) || null;
  const activeLine = requestedLine
    || summary.incomplete[0]
    || assignment?.lines[0]
    || null;

  const nextAssignment = assignments.find((item) => item.state === 'returned')
    || assignments.find((item) => {
      const itemSummary = summarizeCounterAssignment(item, drafts);
      return counterAssignmentIsEditable(item.state)
        && (itemSummary.incomplete.length > 0 || itemSummary.unsafeDrafts.length > 0);
    })
    || assignments[0]
    || null;

  useEffect(() => {
    if (!hasUnsafeDrafts) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsafeDrafts]);

  const updateDraft = (lineId, changes) => {
    const line = assignments.flatMap((item) => item.lines).find((item) => item.id === lineId);
    if (!line) return;
    setDrafts((current) => ({
      ...current,
      [lineId]: {
        ...(current[lineId] || createCounterLineDraft(line)),
        ...changes,
      },
    }));
  };

  const run = async (id, operation, { quietSuccess = false } = {}) => {
    if (operationRef.current) {
      return { ok: false, mode: 'busy', message: 'Another Stock Count save is still in progress.' };
    }
    operationRef.current = id;
    setBusyId(id);
    let result;
    try {
      if (!(await requestWriteAccess())) {
        result = {
          ok: false,
          mode: 'auth_required',
          message: 'Your Stock Count sign-in could not be verified. Your unsaved values remain here.',
        };
      } else {
        result = await operation();
      }
      if (!quietSuccess || !result.ok) setStatus(result);
      if (result.ok) await refresh();
      return result;
    } catch (error) {
      result = {
        ok: false,
        mode: 'sync_error',
        message: error.message || 'The Stock Count request failed. Your draft is still here.',
      };
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
      return run(
        `line-${line.id}`,
        () => setInventoryCounterLineQuantity({ ...common, countedQuantity: values.countedQuantity }),
        { quietSuccess: true },
      );
    }
    return run(
      `line-${line.id}`,
      () => setInventoryCounterLineStructuredQuantity({
        ...common,
        wholeUnits: values.countedWholeUnits,
        openVolumeLiters: values.countedOpenVolumeLiters,
        fullKegs: values.countedFullKegs,
        partialKegFraction: values.countedPartialKegFraction,
      }),
      { quietSuccess: true },
    );
  };

  const moveIncomplete = (currentLineId = activeLineId, direction = 1) => {
    const targetId = findAdjacentIncompleteLineId(assignment?.lines || [], currentLineId, direction);
    if (!targetId) return;
    setActiveLineId(targetId);
    setView('count');
    window.requestAnimationFrame(() => {
      const target = document.getElementById(`counter-line-${targetId}`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target?.querySelector('input:not(:disabled), textarea:not(:disabled)')?.focus({ preventScroll: true });
    });
  };

  const openAssignment = (assignmentId) => {
    const target = assignments.find((item) => item.id === assignmentId);
    setSelectedId(assignmentId);
    setPhysicalConfirmation(false);
    setActiveLineId('');
    setStatus(null);
    setView(target && counterAssignmentIsEditable(target.state) ? 'count' : 'progress');
  };

  const openLine = (lineId) => {
    setActiveLineId(lineId);
    setView('count');
    window.requestAnimationFrame(() => {
      document.getElementById(`counter-line-${lineId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const close = () => {
    if (hasUnsafeDrafts && !window.confirm('Unsaved or failed Stock Count values will be lost if you log out. Log out anyway?')) return;
    onClose();
  };

  const applyDefault = async () => {
    const result = await run(
      'default',
      () => applyInventoryCounterRefrigeratorDefault({
        assignmentId: assignment.id,
        physicalConfirmation: true,
        expectedAssignmentRevision: assignment.revision,
      }),
      { quietSuccess: true },
    );
    if (result?.ok) {
      setPhysicalConfirmation(false);
      setStatus({
        ok: true,
        message: `Standard applied to ${Number(result.data?.updated || 0)} eligible products. ${Number(result.data?.preserved || 0)} existing entries were preserved.`,
      });
    }
  };

  const submit = async () => {
    const result = await run(
      'submit',
      () => submitInventoryCountAssignment({
        assignmentId: assignment.id,
        expectedAssignmentRevision: assignment.revision,
        expectedSessionUpdatedAt: assignment.session.updatedAt,
      }),
      { quietSuccess: true },
    );
    if (result?.ok) {
      setStatus({ ok: true, message: `${assignment.location.name} was sent to Bobby and is now read-only.` });
      setView('progress');
    }
  };

  if (loading) {
    return (
      <main className="counter-experience mesh-experience-shell" role="status" aria-live="polite" aria-busy="true">
        <section className="counter-experience-loading">
          <span className="mesh-kicker">Count Mode</span>
          <h1>Preparing your locations…</h1>
        </section>
      </main>
    );
  }

  const operatorName = normalized(assignment?.counterName)
    ? assignment.counterName
    : 'Counter';

  if (view === 'home' || !assignment) {
    const nextSummary = nextAssignment ? summarizeCounterAssignment(nextAssignment, drafts) : null;
    return (
      <main className="counter-experience mesh-experience-shell">
        <header className="mesh-experience-topbar">
          <button type="button" className="mesh-icon-action" onClick={close} aria-label="Log out">←</button>
          <div className="mesh-experience-brand">
            <span>COUNT MODE</span>
            <strong>Mesh Youngstorget</strong>
          </div>
          <button type="button" className="mesh-avatar-action" onClick={refresh} aria-label="Refresh assignments">↻</button>
        </header>

        <div className="mesh-experience-content">
          <section className="mesh-hero counter-experience-home-hero">
            <div>
              <span className="mesh-kicker">Your Stock Count</span>
              <h1>{assignments.length ? 'One location at a time.' : 'Nothing assigned yet.'}</h1>
              <p>
                {assignments.length
                  ? 'Count what is physically in front of you. Save one product, then move to the next.'
                  : 'Ask Bobby to authorize and assign a location in the active Stock Count.'}
              </p>
              <div className="mesh-facts">
                <span>{assignments.length} assigned</span>
                <span>{assignments.filter((item) => item.state === 'returned').length} returned</span>
                <span>{assignments.filter((item) => item.state === 'accepted').length} accepted</span>
              </div>
            </div>
            {nextSummary ? (
              <ProgressRing
                value={percentage(nextSummary.counted.length, nextSummary.lines.length)}
                completed={nextSummary.counted.length}
                total={nextSummary.lines.length}
              />
            ) : null}
          </section>

          <Feedback status={status} />
          {status?.ok === false ? (
            <button type="button" className="mesh-secondary-action counter-experience-refresh" disabled={Boolean(busyId)} onClick={refresh}>
              Refresh safely — keep local drafts
            </button>
          ) : null}

          {nextAssignment ? (
            <section className="counter-experience-next-location">
              <div className="mesh-section-heading counter-experience-section-heading">
                <div>
                  <span className="mesh-section-label">Up next</span>
                  <h2>Your next location</h2>
                </div>
              </div>
              <AssignmentCard assignment={nextAssignment} drafts={drafts} onOpen={openAssignment} featured />
            </section>
          ) : (
            <section className="mesh-focus-card counter-experience-empty">
              <span aria-hidden="true">✓</span>
              <h2>All clear for now.</h2>
              <p>No active location assignment is visible on this account.</p>
              <button type="button" className="mesh-primary-action" onClick={refresh}>Refresh assignments</button>
            </section>
          )}

          {assignments.length > 1 ? (
            <section className="counter-experience-all-locations">
              <div className="mesh-section-heading counter-experience-section-heading">
                <div>
                  <span className="mesh-section-label">All locations</span>
                  <h2>Your counting journey</h2>
                </div>
              </div>
              <div className="counter-experience-assignment-list">
                {assignments
                  .filter((item) => item.id !== nextAssignment?.id)
                  .map((item) => (
                    <AssignmentCard key={item.id} assignment={item} drafts={drafts} onOpen={openAssignment} />
                  ))}
              </div>
            </section>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <main className="counter-experience mesh-experience-shell">
      <header className="mesh-experience-topbar">
        <button
          type="button"
          className="mesh-icon-action"
          onClick={() => {
            setView('home');
            setStatus(null);
          }}
          aria-label="Back to locations"
        >
          ←
        </button>
        <div className="mesh-experience-brand">
          <span>COUNT MODE</span>
          <strong>{assignment.location.name}</strong>
        </div>
        <button type="button" className="mesh-avatar-action" onClick={refresh} aria-label="Refresh location">
          {firstName(operatorName).slice(0, 1).toUpperCase()}
        </button>
      </header>

      <div className="mesh-experience-content counter-experience-location-content">
        <section className="counter-experience-location-hero">
          <div>
            <span className="mesh-kicker">{assignment.session.title} · {assignment.session.countDate}</span>
            <h1>{assignment.location.name}</h1>
            <p>{summary.incomplete.length} incomplete · {summary.deviations.length} deviations · {summary.unsafeDrafts.length} unsaved / failed</p>
            <StateBadge state={assignment.state} />
          </div>
          <ProgressRing
            value={progress}
            completed={summary.counted.length}
            total={summary.lines.length}
          />
        </section>

        <Feedback status={status} />
        {status?.ok === false ? (
          <button type="button" className="mesh-secondary-action counter-experience-refresh" disabled={Boolean(busyId)} onClick={refresh}>
            Refresh safely — keep local drafts
          </button>
        ) : null}

        <LocationStateNotice assignment={assignment} />

        {view === 'count' ? (
          <section className="counter-experience-count-view">
            <details className="counter-experience-location-guide mesh-panel">
              <summary>
                <span>Visual standard</span>
                <strong>Show how this location should look</strong>
              </summary>
              <LocationReferenceViewer
                locationName={assignment.location.name}
                guidance={assignment.referenceGuidance || { locationId: assignment.location.id }}
              />
            </details>

            {!readOnly ? (
              <ExactStandardPanel
                assignment={assignment}
                summary={summary}
                physicalConfirmation={physicalConfirmation}
                busy={Boolean(busyId)}
                onPhysicalConfirmation={setPhysicalConfirmation}
                onApply={applyDefault}
              />
            ) : null}

            {countComplete ? (
              <section className="mesh-focus-card counter-experience-complete-card">
                <span className="counter-experience-complete-mark" aria-hidden="true">✓</span>
                <span className="mesh-section-label">Count complete</span>
                <h2>Every product is saved.</h2>
                <p>Do one calm physical walk-through, then review the location before sending.</p>
                <button type="button" className="mesh-primary-action" onClick={() => setView('review')}>Open Review →</button>
              </section>
            ) : activeLine ? (
              <section className="mesh-focus-card counter-experience-focus-card">
                <div className="mesh-focus-heading">
                  <span>Up next</span>
                  <time>{summary.incomplete.length} remaining</time>
                </div>
                <CounterProductCard
                  line={activeLine}
                  draft={drafts[activeLine.id] || createCounterLineDraft(activeLine)}
                  readOnly={readOnly}
                  workspaceBusy={Boolean(busyId)}
                  onDraft={updateDraft}
                  onSave={saveLine}
                  onMoveIncomplete={moveIncomplete}
                  onActive={setActiveLineId}
                />
              </section>
            ) : (
              <section className="mesh-focus-card counter-experience-empty">
                <h2>No products in this location.</h2>
                <p>Ask Bobby to review the Stock Count configuration.</p>
              </section>
            )}

            {!readOnly && activeLine && !countComplete ? (
              <nav className="counter-experience-product-navigation" aria-label="Incomplete product navigation">
                <button
                  type="button"
                  disabled={!summary.incomplete.length}
                  onClick={() => moveIncomplete(activeLine.id, -1)}
                >
                  ← Previous incomplete
                </button>
                <span><strong>{summary.incomplete.length}</strong> remaining</span>
                <button
                  type="button"
                  disabled={!summary.incomplete.length}
                  onClick={() => moveIncomplete(activeLine.id, 1)}
                >
                  Next incomplete →
                </button>
              </nav>
            ) : null}
          </section>
        ) : null}

        {view === 'progress' ? (
          <ProgressView
            assignment={assignment}
            summary={summary}
            drafts={drafts}
            onOpenLine={openLine}
            onReview={() => setView('review')}
          />
        ) : null}

        {view === 'review' ? (
          <ReviewView
            assignment={assignment}
            summary={summary}
            busy={busyId === 'submit'}
            readOnly={readOnly}
            onCount={() => setView('count')}
            onSubmit={submit}
          />
        ) : null}
      </div>

      <CountNavigation view={view} onView={setView} />
    </main>
  );
}
