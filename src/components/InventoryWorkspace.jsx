import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildInventoryRestockList,
  buildProtectedEventReserveList,
  calculateInventoryLine,
  calculateStandardPolicyTarget,
  compareInventoryApprovedLines,
  inventoryProductIdentityReference,
  inventoryStatusLabel,
  sortInventorySessionLines,
  summarizeInventoryLocation,
  summarizeInventorySession,
} from '../data/inventoryCalculations.js';
import {
  downloadCsv,
  inventoryCsvNumeric,
  makeCsv,
  parseInventoryCsv,
  previewInventoryCsv,
  suggestInventoryCsvMapping,
} from '../data/inventoryCsv.js';
import {
  formatInventoryDecimal,
  inventoryBaseUnit,
  inventoryCountModeLabel,
  inventoryDecimalDraftState,
  inventoryStructuredComponentLabel,
  INVENTORY_COUNT_MODES,
  normalizeInventoryDecimal,
} from '../data/inventoryStructuredQuantities.js';
import {
  createInventoryManagerLineDraft,
  createInventoryManagerSaveGuard,
  evaluateInventoryManagerLineDraft,
  executeInventoryManagerLineSave,
  INVENTORY_MANAGER_SAVE_KINDS,
  INVENTORY_MANAGER_SAVE_STATES,
  inventoryLocationCompletionBlocked,
  inventoryManagerLineDraftAfterFailure,
  inventoryManagerLineDraftHasChanges,
  inventoryManagerLineDraftStatus,
} from '../data/inventoryManagerLineDraft.js';
import {
  ensureInventoryIdempotencyKey,
  inventorySessionExceptionSummary,
  inventorySessionKindLabel,
  inventorySessionLockLabel,
  isInventorySessionActive,
  isInventorySessionEditable,
} from '../data/inventorySessionLifecycle.js';
import {
  compareInventoryCatalogueOrder,
  filterOwnedInventoryCatalogue,
  INVENTORY_REFRIGERATOR_DEFINITIONS,
} from '../data/inventoryOperationalScope.js';
import {
  eligibleInventorySessionLocations,
  inventorySessionSelection,
} from '../data/inventorySessionLocations.js';
import {
  beginInventoryHistoryDetailRequest,
  createInventoryHistoryDetailState,
  inventoryHistoryDetailView,
  selectInventoryHistoryDetail,
  settleInventoryHistoryDetailRequest,
} from '../data/inventoryHistoryDetail.js';
import {
  createMillumExportActionGuard,
  createMillumExportFile,
  downloadMillumExportFile,
  shareMillumExportFile,
} from '../data/inventoryMillumExport.js';
import {
  approveInventoryCountSession,
  cancelInventoryCountSession,
  clearInventoryCountLine,
  completeInventoryCountLocation,
  completeInventoryCountSession,
  confirmInventoryCountLineUnchanged,
  copyInventoryStandards,
  createInventoryCountSession,
  createInventoryCorrectionSession,
  getInventoryCountSession,
  getInventoryMillumExport,
  importInventoryCatalog,
  loadInventoryWorkspace,
  markInventoryCountLineUsePar,
  markInventoryLocationUsePar,
  saveInventoryLocation,
  saveInventoryProduct,
  saveInventoryStandardsBulk,
  setInventoryLocationCountable,
  setInventoryStorageMultiplier,
  setInventoryCountLineCaseQuantity,
  setInventoryCountLineQuantity,
  setInventoryCountLineStructuredQuantity,
  setupMeshYoungstorgetInventoryLocations,
  skipInventoryCountLine,
  verifyInventoryRefrigeratorTemplate,
} from '../lib/inventoryClient.js';
import { subscribeToInventoryRealtime } from '../lib/inventoryRealtime.js';
import { canCoordinateInventory, canManageInventory, canUseInventory, isInventoryCounter } from '../lib/permissions.js';
import { CounterAssignmentManager, CounterInventoryWorkspace } from './InventoryCounterWorkflows.jsx';
import { LocationReferenceGuidanceManager, LocationReferenceViewer } from './LocationReferenceGuidance.jsx';

const EMPTY_PRODUCT = { name: '', shortName: '', sku: '', barcode: '', category: 'Other', unitLabel: 'piece', countMode: 'unit', containerCapacityLiters: '', supplierName: '', notes: '', active: true, sortOrder: 0, millumItemRef: '', ownershipStatus: 'unverified', reserveTargetOverride: null };
const EMPTY_LOCATION = { name: '', code: '', locationType: 'storage', parentLocationId: '', zone: '', description: '', active: true, sortOrder: 0 };
const PRODUCT_CATEGORY_PRESETS = ['Beer', 'Wine', 'Sparkling wine', 'Spirits', 'Soft drinks', 'Mineral water', 'Coffee', 'Milk and alternatives', 'Snacks', 'Food', 'Consumables', 'Cleaning', 'Other'];
const YOUNGSTORGET_LOCATION_TEMPLATE = [
  { code: 'CORNERBAR', name: 'Cornerbar', children: ['Left Fridge', 'Middle Fridge', 'Right Fridge'] },
  { code: 'WORKBAR', name: 'Workbar', children: ['Bar Left Fridge', 'Bar Right Fridge', 'Non-Alco Fridge'] },
];

const STOCK_POLICY_OPTIONS = [
  ['exact_par', 'Exact par'],
  ['physical_count_only', 'Physical count only (no target)'],
  ['operating_reserve', 'Operating reserve'],
  ['protected_event_reserve', 'Protected event reserve'],
  ['verify_unchanged', 'Verify unchanged'],
];

function osloDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function formatDateTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function quantity(value) {
  return formatInventoryDecimal(value);
}

function contextualLocationName(location, locations = []) {
  const parent = locations.find((item) => item.id === location?.parentLocationId);
  return parent ? `${parent.name} · ${location.name}` : (location?.name || 'Location');
}

function groupedInventoryLocations(locations = [], { includeParentAreas = true } = {}) {
  const sorted = [...locations].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name));
  const parents = sorted.filter((location) => sorted.some((child) => child.parentLocationId === location.id));
  const childIds = new Set(sorted.filter((location) => location.parentLocationId).map((location) => location.id));
  const parentIds = new Set(parents.map((location) => location.id));
  const groups = parents.map((parent) => ({
    key: parent.id,
    label: parent.name,
    sortOrder: parent.sortOrder || 0,
    locations: [
      ...(includeParentAreas ? [parent] : []),
      ...sorted.filter((location) => location.parentLocationId === parent.id),
    ],
  }));
  const storage = sorted.filter((location) => !location.parentLocationId && !parentIds.has(location.id) && location.locationType === 'storage');
  if (storage.length) groups.push({ key: 'storage', label: 'Storage', sortOrder: Math.min(...storage.map((location) => location.sortOrder || 0)), locations: storage });
  const other = sorted.filter((location) => !childIds.has(location.id) && !parentIds.has(location.id) && !storage.some((item) => item.id === location.id));
  if (other.length) groups.push({ key: 'other', label: 'Other locations', sortOrder: Math.min(...other.map((location) => location.sortOrder || 0)), locations: other });
  return groups.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

function GroupedLocationSelect({ locations, value, onChange, includeParentAreas = true, preferPhysical = false, label = 'Choose location' }) {
  const groups = groupedInventoryLocations(locations, { includeParentAreas });
  return (
    <select value={value} onChange={onChange}>
      <option value="">{label}</option>
      {groups.map((group) => (
        <optgroup key={group.key} label={group.label}>
          {[...group.locations].sort((a, b) => preferPhysical ? Number(Boolean(b.parentLocationId)) - Number(Boolean(a.parentLocationId)) : 0).map((location) => <option key={location.id} value={location.id}>{contextualLocationName(location, locations)}{location.parentLocationId ? '' : group.key !== 'storage' && includeParentAreas ? ' (direct stock)' : ''}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

function Status({ children, tone = '' }) {
  return <span className={`inventory-status ${tone}`.trim()}>{children}</span>;
}

function Message({ status }) {
  if (!status?.message) return null;
  return <p className={`inventory-message ${status.ok === false ? 'error' : 'success'}`} role="status" aria-live="polite">{status.message}</p>;
}

function InventoryOverview({ sessions, activeSession, lines, locations, onOpenSession, onStart, canCoordinate }) {
  const summary = summarizeInventorySession(lines, locations, activeSession?.metadata?.locationCompletions || {});
  const lastApproved = sessions.find((session) => session.status === 'approved');
  return (
    <div className="inventory-stack">
      {activeSession ? (
        <section className="inventory-panel">
          <div className="inventory-panel-heading">
            <div><p className="eyebrow">{activeSession.status === 'completed' ? 'Awaiting approval' : 'Active count'}</p><h2>{activeSession.title}</h2><p className="muted">{activeSession.countDate} · {inventorySessionKindLabel(activeSession)}</p></div>
            <Status tone="active">{activeSession.status.replace('_', ' ')}</Status>
          </div>
          <div className="inventory-summary-grid">
            <div><strong>{summary.completedLocations} / {summary.locations}</strong><span>locations complete</span></div>
            <div><strong>{summary.counted} / {summary.total}</strong><span>products recorded</span></div>
            <div><strong>{summary.manual}</strong><span>manual counts</span></div>
            <div><strong>{summary.acceptedAsStandard}</strong><span>accepted as standard</span></div>
            <div><strong>{summary.shortages}</strong><span>shortage lines</span></div>
            <div><strong>{summary.uncounted}</strong><span>remaining</span></div>
            <div><strong>{summary.serviceStockReadiness === null ? '-' : `${summary.serviceStockReadiness}%`}</strong><span>service stock readiness</span></div>
            <div><strong>{summary.operatingReserveReadiness === null ? '-' : `${summary.operatingReserveReadiness}%`}</strong><span>operating reserve readiness</span></div>
            <div><strong>{summary.eventReserveReadiness === null ? '-' : `${summary.eventReserveReadiness}%`}</strong><span>event reserve readiness</span></div>
            <div><strong>{summary.dormantPhysicalRecountDue}</strong><span>dormant physical recounts due</span></div>
          </div>
          <div className="inventory-progress" aria-label={`${summary.progressPercent}% counted`}><span style={{ width: `${summary.progressPercent}%` }} /></div>
          <button type="button" className="primary-button inventory-full-button" onClick={() => onOpenSession(activeSession.id)}>{activeSession.status === 'completed' ? 'Review and approve stock count' : 'Continue stock count'}</button>
        </section>
      ) : (
        <section className="inventory-panel inventory-empty">
          <h2>No count in progress</h2>
          <p className="muted">Start a count when the team is ready. Opening this module never creates one automatically.</p>
          {canCoordinate && <button type="button" className="primary-button" onClick={onStart}>Start stock count</button>}
        </section>
      )}
      <section className="inventory-panel">
        <h2>Recent history</h2>
        {lastApproved ? <p><strong>{lastApproved.title}</strong><br /><span className="muted">Approved {formatDateTime(lastApproved.approvedAt)} by {lastApproved.approvedByName || 'manager'}</span></p> : <p className="muted">No approved stock count is available yet.</p>}
      </section>
    </div>
  );
}

function SessionCreator({ products, locations, standards, storageSettings, onCancel, onCreate, busy }) {
  const eligibleLocations = useMemo(() => eligibleInventorySessionLocations({
    locations,
    standards,
    products,
  }), [locations, standards, products]);
  const [draft, setDraft] = useState(() => ({
    title: `Daily stock count - ${osloDate()}`,
    countType: 'daily',
    countDate: osloDate(),
    locationIds: eligibleInventorySessionLocations({ locations, standards, products }).map((item) => item.id),
    note: '',
    idempotencyKey: ensureInventoryIdempotencyKey(''),
  }));
  const selection = useMemo(() => inventorySessionSelection({
    eligibleLocations,
    selectedLocationIds: draft.locationIds,
    standards,
    products,
  }), [eligibleLocations, draft.locationIds, standards, products]);
  const eligibleLocationIds = useMemo(() => new Set(eligibleLocations.map((location) => location.id)), [eligibleLocations]);
  const locationGroups = useMemo(() => groupedInventoryLocations(locations)
    .map((group) => ({ ...group, locations: group.locations.filter((location) => eligibleLocationIds.has(location.id)) }))
    .filter((group) => group.locations.length > 0), [locations, eligibleLocationIds]);
  const toggleLocation = (locationId, checked) => setDraft((current) => ({
    ...current,
    locationIds: checked
      ? [...new Set([...current.locationIds, locationId])]
      : current.locationIds.filter((id) => id !== locationId),
  }));
  return (
    <section className="inventory-panel">
      <div className="inventory-panel-heading"><div><p className="eyebrow">New session</p><h2>Start stock count</h2></div><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button></div>
      <div className="inventory-form-grid">
        <label>Title<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label>Count type<select value={draft.countType} onChange={(event) => setDraft({ ...draft, countType: event.target.value })}><option value="opening">Opening</option><option value="closing">Closing</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="ad_hoc">Ad hoc</option><option value="event">Event</option><option value="other">Other</option></select></label>
        <label>Count date<input type="date" value={draft.countDate} onChange={(event) => setDraft({ ...draft, countDate: event.target.value })} /></label>
        <label className="inventory-wide">Optional note<textarea rows="2" value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></label>
      </div>
      <fieldset className="inventory-location-picker">
        <legend>Countable locations with active standards</legend>
        {locationGroups.map((group) => (
          <div className="inventory-location-choice-group" key={group.key}>
            <strong>{group.label}</strong>
            {group.locations.map((location) => {
              const checked = selection.locationIds.includes(location.id);
              return (
                <label className={`inventory-location-option ${checked ? 'selected' : ''}`} key={location.id}>
                  <input type="checkbox" checked={checked} onChange={(event) => toggleLocation(location.id, event.target.checked)} />
                  <span>{contextualLocationName(location, locations)}</span>
                </label>
              );
            })}
          </div>
        ))}
      </fieldset>
      <div className="inventory-preview" role="status" aria-live="polite"><strong>{selection.locationCount} eligible location{selection.locationCount === 1 ? '' : 's'} selected</strong><span>{selection.defaultLineCount} active standard line{selection.defaultLineCount === 1 ? '' : 's'} represented</span><span>{selection.representedDefaults.filter((item) => calculateStandardPolicyTarget(item, { standards, locations, products, storageSettings }).effectiveTarget > 0).length} configured targets above zero</span></div>
      {selection.representedDefaults.some((item) => !['verify_unchanged', 'physical_count_only'].includes(item.stockPolicy) && calculateStandardPolicyTarget(item, { standards, locations, products, storageSettings }).effectiveTarget === 0) && <p className="inventory-warning">Some target-based products have a target of zero. Review those standards if that is not intentional.</p>}
      <button type="button" className="primary-button inventory-full-button" disabled={busy || !draft.title.trim() || !selection.locationCount || !selection.defaultLineCount} onClick={() => onCreate({ ...draft, locationIds: selection.locationIds })}>{busy ? 'Starting count...' : 'Confirm and start count'}</button>
    </section>
  );
}

function InventoryManagerDraftStatus({ line, draft, evaluated, onReview }) {
  const status = inventoryManagerLineDraftStatus(line, draft, evaluated);
  return (
    <div id={`inventory-count-${line.id}-save-status`} className={`inventory-line-save-status ${status.state}`} data-save-state={status.state} role="status" aria-live="polite">
      <strong>{status.label}</strong>
      {status.message && <span>{status.message}</span>}
      {status.state === 'stale' && <button type="button" className="secondary-button" onClick={onReview}>Review latest saved value</button>}
    </div>
  );
}

function CountLineCard({ line, identityReference, draft, onDraft, onSave, onReview, action, busy, readOnly, canManage }) {
  const calculated = calculateInventoryLine(line);
  const inputId = `inventory-count-${line.id}`;
  const policyLabel = STOCK_POLICY_OPTIONS.find(([value]) => value === calculated.stockPolicy)?.[1] || 'Exact par';
  const previousPhysicalAvailable = line.previousPhysicalCountQuantity !== null && Boolean(line.previousPhysicalCountedAt);
  const evaluated = evaluateInventoryManagerLineDraft(line, draft);
  const saving = draft.saveState === INVENTORY_MANAGER_SAVE_STATES.SAVING;
  const retrying = draft.saveState === INVENTORY_MANAGER_SAVE_STATES.FAILED;
  const saveDisabled = readOnly || busy || !evaluated.canSave || draft.saveState === INVENTORY_MANAGER_SAVE_STATES.STALE;
  const modeLabel = inventoryCountModeLabel(line.countMode);
  const update = (changes) => onDraft({ ...changes, saveState: INVENTORY_MANAGER_SAVE_STATES.UNSAVED, message: '', error: '' });
  return (
    <article className={`inventory-line-card ${calculated.shortage ? 'shortage' : ''}`}>
      <div className="inventory-line-heading"><div><h3>{line.productName}</h3><p>{line.unitLabel}{identityReference ? ` · ${identityReference}` : ''} · {modeLabel} · {policyLabel}{calculated.effectiveTargetExact !== null ? ` · Target ${quantity(calculated.effectiveTargetExact)} ${line.unitLabel}` : ''}</p></div><Status tone={calculated.shortage ? 'warning' : calculated.counted ? 'good' : ''}>{calculated.uncounted ? 'Not counted' : calculated.confirmedUnchanged ? 'Confirmed unchanged' : calculated.acceptedAsStandard ? 'Fully stocked' : calculated.skipped ? 'Skipped' : 'Physical count'}</Status></div>
      {calculated.stockPolicy === 'operating_reserve' && line.targetMode === 'derived_multiplier' && <p className="inventory-policy-note">Service stock {quantity(line.serviceTargetBasis)} × {quantity(line.reserveMultiplier)} = reserve target {quantity(calculated.effectiveTarget)}</p>}
      {calculated.stockPolicy === 'physical_count_only' && <p className="inventory-policy-note"><strong>Physical count only.</strong> This line has no automatic target and can never be bulk-defaulted to zero.</p>}
      {line.historicalSuggestionQuantityExact !== null && <div className="inventory-historical-suggestion"><strong>Previous count suggestion: {quantity(line.historicalSuggestionQuantityExact)} bottle-equivalents</strong><span>{line.historicalSuggestionSource || 'Historical Stock Count'} · verify the current sealed/open quantities physically.</span>{line.historicalSuggestionNote && <p>{line.historicalSuggestionNote}</p>}</div>}
      {calculated.stockPolicy === 'protected_event_reserve' && <div className="inventory-protected-note"><strong>Protected event reserve</strong><span>Target: {quantity(line.targetCases)} cases × {quantity(line.caseSize)} units + {quantity(line.targetLooseQuantity)} loose = {quantity(calculated.effectiveTarget)} units.</span><span>Not for daily restocking. Count this separately from Main beverage stock.</span></div>}
      {line.countMode === INVENTORY_COUNT_MODES.CONTAINER_PLUS_VOLUME ? <><p className="inventory-policy-note">Container size: {quantity(line.containerCapacityLiters)} L per bottle. Open liters are the combined liquid remaining across all open bottles.</p><div className="inventory-case-count"><label htmlFor={`${inputId}-whole`}>Sealed bottles<input id={`${inputId}-whole`} type="text" inputMode="numeric" value={draft.wholeUnits} disabled={readOnly || busy} onChange={(event) => update({ saveKind: INVENTORY_MANAGER_SAVE_KINDS.STRUCTURED, wholeUnits: event.target.value })} /></label><label htmlFor={`${inputId}-open`}>Open liters<input id={`${inputId}-open`} type="text" inputMode="decimal" value={draft.openVolumeLiters} disabled={readOnly || busy} onChange={(event) => update({ saveKind: INVENTORY_MANAGER_SAVE_KINDS.STRUCTURED, openVolumeLiters: event.target.value })} /></label><div><span>Calculated total liters</span><strong>{evaluated.ok ? `${quantity(evaluated.countedQuantity)} L` : '-'}</strong></div></div></> : line.countMode === INVENTORY_COUNT_MODES.KEG_FRACTION ? <><div className="inventory-case-count"><label htmlFor={`${inputId}-full-kegs`}>Full kegs<input id={`${inputId}-full-kegs`} type="text" inputMode="numeric" value={draft.fullKegs} disabled={readOnly || busy} onChange={(event) => update({ saveKind: INVENTORY_MANAGER_SAVE_KINDS.STRUCTURED, fullKegs: event.target.value })} /></label><label htmlFor={`${inputId}-partial-keg`}>Partial keg fraction<input id={`${inputId}-partial-keg`} type="text" inputMode="decimal" value={draft.partialKegFraction} disabled={readOnly || busy} onChange={(event) => update({ saveKind: INVENTORY_MANAGER_SAVE_KINDS.STRUCTURED, partialKegFraction: event.target.value })} /></label><div><span>Calculated keg equivalent</span><strong>{evaluated.ok ? `${quantity(evaluated.countedQuantity)} kegs` : '-'}</strong></div></div><div className="inventory-action-row inventory-keg-fractions" aria-label="Common partial keg fractions">{[['0.25', '¼ keg'], ['0.5', '½ keg'], ['0.75', '¾ keg']].map(([value, label]) => <button type="button" className="secondary-button" key={value} disabled={readOnly || busy} onClick={() => update({ saveKind: INVENTORY_MANAGER_SAVE_KINDS.STRUCTURED, partialKegFraction: value })}>{label}</button>)}</div></> : calculated.stockPolicy === 'protected_event_reserve' ? <><div className="inventory-case-count"><label htmlFor={`${inputId}-full-cases`}>Full cases<input id={`${inputId}-full-cases`} type="number" min="0" step="1" inputMode="numeric" value={draft.fullCases} disabled={readOnly || busy} onChange={(event) => update({ saveKind: INVENTORY_MANAGER_SAVE_KINDS.CASES, fullCases: event.target.value })} /></label><label htmlFor={`${inputId}-loose`}>Loose units<input id={`${inputId}-loose`} type="number" min="0" step="any" inputMode="decimal" value={draft.looseQuantity} disabled={readOnly || busy} onChange={(event) => update({ saveKind: INVENTORY_MANAGER_SAVE_KINDS.CASES, looseQuantity: event.target.value })} /></label><div><span>Calculated total</span><strong>{quantity((Number(draft.fullCases) || 0) * (line.caseSize || 0) + (Number(draft.looseQuantity) || 0))}</strong></div></div><details><summary>Count total units instead</summary><label htmlFor={inputId}>Physical total units</label><input id={inputId} type="text" inputMode="decimal" value={draft.countedQuantity} disabled={readOnly || busy} onChange={(event) => update({ saveKind: INVENTORY_MANAGER_SAVE_KINDS.QUANTITY, countedQuantity: event.target.value })} /></details></> : <label className="inventory-manager-primary-quantity" htmlFor={inputId}>Physical counted quantity<input id={inputId} type="text" inputMode="decimal" value={draft.countedQuantity} disabled={readOnly || busy} aria-describedby={`${inputId}-quantity-help`} onChange={(event) => update({ saveKind: INVENTORY_MANAGER_SAVE_KINDS.QUANTITY, countedQuantity: event.target.value })} /><span id={`${inputId}-quantity-help`}>Enter 0 when physically empty. Blank means not counted. Unit: {line.unitLabel}.</span></label>}
      {!calculated.uncounted && !calculated.skipped && line.countMode !== INVENTORY_COUNT_MODES.UNIT && <p className="inventory-policy-note"><strong>{inventoryStructuredComponentLabel(line)}</strong></p>}
      {!calculated.uncounted && !calculated.skipped && calculated.stockPolicy !== 'verify_unchanged' && <p className={calculated.shortage ? 'inventory-variance shortage-text' : 'inventory-variance'}>{calculated.stockPolicy === 'protected_event_reserve' ? `${line.countFullCases == null ? 'Physical total count' : `${quantity(line.countFullCases)} / ${quantity(line.targetCases)} cases · ${quantity(line.countLooseQuantity)} loose`} · ${quantity(calculated.countedQuantityExact)} / ${quantity(calculated.effectiveTargetExact)} ${line.unitLabel} · ${calculated.readinessPercent}% ready${calculated.shortage ? ` · ${quantity(calculated.restockQuantityExact)} ${line.unitLabel} short` : ''}` : calculated.varianceQuantity < 0 ? `${calculated.stockPolicy === 'operating_reserve' ? 'Reserve gap' : 'Restock required'}: ${quantity(calculated.restockQuantityExact)} ${line.unitLabel}` : calculated.varianceQuantity > 0 ? `Above target by ${quantity(calculated.varianceQuantityExact)} ${line.unitLabel}` : `At target (${line.unitLabel})`}</p>}
      {calculated.stockPolicy === 'verify_unchanged' && <div className="inventory-dormant-check"><strong>{calculated.currentPhysicalCount ? 'Physical count recorded for this session' : calculated.skipped ? 'Clear this line before confirming unchanged' : calculated.physicalRecountDue ? 'Physical recount required' : calculated.confirmedUnchanged ? 'Previous physical quantity confirmed unchanged' : 'Unchanged confirmation available'}</strong>{calculated.currentPhysicalCount ? <span>Current physical count: {quantity(calculated.countedQuantity)}{line.countedAt ? ` on ${formatDateTime(line.countedAt)}` : ''}</span> : previousPhysicalAvailable ? <span>Last physically counted: {quantity(line.previousPhysicalCountQuantity)} on {formatDateTime(line.previousPhysicalCountedAt)}</span> : <span>No previous finalized physical count is available.</span>}<p>Shopbox movement validation is not connected. Confirmation is a manager attestation that no movement is known, not an automatic stock check.</p>{calculated.pristineForUnchanged && <button type="button" className="secondary-button" disabled={readOnly || busy || !canManage || calculated.physicalRecountDue || !previousPhysicalAvailable} onClick={() => action('unchanged')}>Confirm unchanged</button>}</div>}
      <details><summary>Add or edit note</summary><label htmlFor={`${inputId}-note`}>Count note (optional)</label><textarea id={`${inputId}-note`} rows="2" value={draft.note} disabled={readOnly || busy} aria-describedby={`${inputId}-note-help ${inputId}-save-status`} onChange={(event) => update({ note: event.target.value })} /><span id={`${inputId}-note-help`} className="inventory-field-help">A note documents context. It does not change the target or restock requirement.</span></details>
      <InventoryManagerDraftStatus line={line} draft={draft} evaluated={evaluated} onReview={onReview} />
      {!readOnly && <button type="button" className="primary-button inventory-full-button manager-line-save-button" disabled={saveDisabled} aria-describedby={`${inputId}-save-status`} onClick={onSave}>{saving ? 'Saving…' : retrying ? 'Retry save' : evaluated.buttonLabel}</button>}
      <div className="inventory-line-actions">{calculated.stockPolicy === 'exact_par' && <button type="button" className="secondary-button" disabled={readOnly || busy} onClick={() => action('par')}>Mark fully stocked</button>}<button type="button" className="secondary-button" disabled={readOnly || busy} onClick={() => action('clear')}>Clear</button><button type="button" className="text-button" disabled={readOnly || busy || !draft.note.trim()} onClick={() => action('skip')}>Skip with note</button></div>
      {line.countedByName && <p className="inventory-audit">Recorded by {line.countedByName}{line.countedAt ? ` · ${formatDateTime(line.countedAt)}` : ''}</p>}
    </article>
  );
}

export function MillumExportView({ session, onBack, loadExport = getInventoryMillumExport }) {
  const [exportData, setExportData] = useState(null);
  const [loadState, setLoadState] = useState({ loading: true, error: '' });
  const [actionState, setActionState] = useState({ busy: false, message: '', error: '' });
  const actionGuardRef = useRef(createMillumExportActionGuard());
  const filePromiseRef = useRef(null);

  const load = useCallback(async () => {
    setLoadState({ loading: true, error: '' });
    const result = await loadExport(session.id);
    if (result.ok) {
      setExportData(result.record);
      setLoadState({ loading: false, error: '' });
    } else {
      setExportData(null);
      setLoadState({ loading: false, error: result.message || 'The approved Millum export could not be loaded.' });
    }
  }, [loadExport, session.id]);

  useEffect(() => { load(); }, [load]);

  const getFile = () => {
    if (!filePromiseRef.current) {
      filePromiseRef.current = createMillumExportFile(exportData).catch((error) => {
        filePromiseRef.current = null;
        throw error;
      });
    }
    return filePromiseRef.current;
  };

  const runPdfAction = (operation) => actionGuardRef.current.run(async () => {
    setActionState({ busy: true, message: '', error: '' });
    try {
      const generated = await getFile();
      const result = await operation(generated);
      setActionState({ busy: false, message: result?.message || `PDF ready (${generated.pageCount} pages).`, error: '' });
      return result;
    } catch (error) {
      setActionState({ busy: false, message: '', error: error?.message || 'The PDF could not be generated. Retry or use the diagnostics below.' });
      return null;
    }
  });

  if (loadState.loading) return <section className="inventory-panel" role="status" aria-live="polite"><p>Loading approved Millum export…</p></section>;
  if (loadState.error) return <div className="inventory-stack"><button type="button" className="secondary-button inventory-export-back" onClick={onBack}>Back to approved count</button><section className="inventory-panel inventory-empty" role="alert"><h2>Millum export unavailable</h2><p>{loadState.error}</p><button type="button" className="secondary-button" onClick={load}>Retry</button></section></div>;

  const diagnostics = exportData?.diagnostics || [];
  const mappingDiagnostics = exportData?.mappingDiagnostics || [];
  return (
    <div className="inventory-stack inventory-millum-export">
      <section className="inventory-session-header inventory-millum-header">
        <button type="button" className="secondary-button" onClick={onBack}>Back to approved count</button>
        <div><p className="eyebrow">Manager-only · immutable approved source</p><h2>Millum view / Export count</h2><p>{exportData.countDate} · Session {exportData.sessionShortRef} · Profile v{exportData.profileVersion}</p></div>
        <Status tone={exportData.ready ? 'good' : ''}>{exportData.ready ? 'Ready' : 'Blocked'}</Status>
      </section>
      <section className="inventory-panel inventory-millum-instructions">
        <div><h3>Manual Millum entry</h3><p>Type the prominent final value from each row into <strong>Counted break bulk</strong>. The approved Stock Count remains unchanged.</p></div>
        <div className="inventory-action-row">
          <button type="button" className="primary-button" disabled={!exportData.ready || actionState.busy} onClick={() => runPdfAction(async ({ file, pageCount }) => { downloadMillumExportFile(file); return { message: `PDF downloaded (${pageCount} pages).` }; })}>{actionState.busy ? 'Preparing PDF…' : 'Download PDF'}</button>
          <button type="button" className="secondary-button" disabled={!exportData.ready || actionState.busy} onClick={() => runPdfAction(async ({ file }) => shareMillumExportFile(file))}>Share PDF</button>
        </div>
        {actionState.message && <p className="inventory-message success" role="status">{actionState.message}</p>}
        {actionState.error && <p className="inventory-message error" role="alert">{actionState.error}</p>}
      </section>
      {diagnostics.length > 0 && <section className="inventory-panel inventory-millum-diagnostics" role="alert"><h3>Clean export blocked</h3><p>Resolve these manager-only mapping or source-count gaps in a future approved count/profile before generating the final PDF.</p><ul>{diagnostics.map((item, index) => <li key={`${item.code}-${item.rowKey || item.productId || index}`}><strong>{item.itemNumber ? `${item.itemNumber} · ` : ''}{item.productName}</strong><span>{item.message}</span></li>)}</ul></section>}
      <div className="inventory-millum-groups" aria-label="Millum Counted break bulk values">
        {(exportData.groups || []).map((group) => <section className="inventory-panel inventory-millum-group" key={group.name}><h3>{group.name}</h3><div className="inventory-millum-table" role="table" aria-label={group.name}><div className="inventory-millum-row inventory-millum-columns" role="row"><strong role="columnheader">Item</strong><strong role="columnheader">Product</strong><strong role="columnheader">Counted break bulk</strong></div>{(group.rows || []).map((row) => <div className={`inventory-millum-row ${row.state !== 'ready' ? 'blocked' : ''}`} role="row" key={row.rowKey}><span role="cell">{row.itemNumber}</span><span role="cell">{row.productName}</span><strong role="cell" aria-label={row.state === 'ready' ? `Final Millum value ${row.finalValue}` : 'Missing final Millum value'}>{row.state === 'ready' ? row.finalValue : 'Missing'}</strong></div>)}</div></section>)}
      </div>
      <details className="inventory-panel inventory-millum-profile-diagnostics"><summary>Profile mapping diagnostics ({mappingDiagnostics.length})</summary><p className="muted">Disabled manifest positions stay preserved in profile v{exportData.profileVersion} but never receive copied values or appear in the clean PDF.</p><ul>{mappingDiagnostics.map((item) => <li key={item.rowKey}><strong>{item.group} row {item.rowOrder} · {item.itemNumber}</strong><span>{item.officialName} · {item.message}</span></li>)}</ul></details>
    </div>
  );
}

function CountSession({ session, sessions, lines, locations, referenceGuidance, canManage, canCoordinate, requestWriteAccess, onRefresh, onOpenSession, onBack, setStatus, remoteNotice, clearRemoteNotice }) {
  const [locationId, setLocationId] = useState(lines[0]?.locationId || '');
  const [lineDrafts, setLineDrafts] = useState({});
  const [busyId, setBusyId] = useState('');
  const [bulkReview, setBulkReview] = useState(null);
  const lineSaveGuardRef = useRef(createInventoryManagerSaveGuard());
  const bulkTriggerRef = useRef(null);
  const bulkDialogRef = useRef(null);
  const bulkCancelRef = useRef(null);
  const [completionNote, setCompletionNote] = useState('');
  const [allowExceptions, setAllowExceptions] = useState(false);
  const [exceptionReason, setExceptionReason] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [millumOpen, setMillumOpen] = useState(false);
  const [correctionIdempotencyKey, setCorrectionIdempotencyKey] = useState(() => ensureInventoryIdempotencyKey(''));
  const orderedLines = useMemo(() => sortInventorySessionLines(lines), [lines]);
  const locationIds = [...new Set(orderedLines.map((line) => line.locationId))];
  const completionMap = session.metadata?.locationCompletions || {};
  const sessionSummary = summarizeInventorySession(lines, locations, completionMap);
  const locationLines = orderedLines.filter((line) => line.locationId === locationId);
  const locationSummary = summarizeInventoryLocation(locationLines, completionMap[locationId]);
  const exactUncounted = locationLines.filter((line) => line.stockPolicy === 'exact_par' && calculateInventoryLine(line).uncounted).length;
  const currentLocation = locations.find((item) => item.id === locationId) || { name: locationLines[0]?.locationName || 'Location' };
  const currentLocationLabel = contextualLocationName(currentLocation, locations);
  const readOnly = !isInventorySessionEditable(session.status);
  const lockLabel = inventorySessionLockLabel(session.status);
  const exceptionSummary = inventorySessionExceptionSummary(session);
  const originalSession = session.originalSessionId ? sessions.find((item) => item.id === session.originalSessionId) : null;
  const correctionSessions = sessions.filter((item) => item.originalSessionId === session.id);
  const isDirty = lines.some((line) => {
    const draft = lineDrafts[line.id];
    return draft && (inventoryManagerLineDraftHasChanges(line, draft)
      || [INVENTORY_MANAGER_SAVE_STATES.SAVING, INVENTORY_MANAGER_SAVE_STATES.FAILED, INVENTORY_MANAGER_SAVE_STATES.STALE].includes(draft.saveState));
  });
  const bulkDialogOpen = Boolean(bulkReview);

  useEffect(() => {
    setLineDrafts({});
    setBulkReview(null);
    setCompletionNote(session.completionNote || '');
    setAllowExceptions(false);
    setExceptionReason('');
    setActionReason('');
    setMillumOpen(false);
    setCorrectionIdempotencyKey(ensureInventoryIdempotencyKey(''));
  }, [session.id]);
  useEffect(() => {
    setLocationId((current) => current && lines.some((line) => line.locationId === current)
      ? current
      : (lines[0]?.locationId || ''));
  }, [session.id, lines]);
  useEffect(() => {
    if (!bulkDialogOpen) return undefined;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => bulkCancelRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [bulkDialogOpen]);

  const runWrite = async (id, operation) => {
    if (!(await requestWriteAccess())) return;
    setBusyId(id);
    const result = await operation();
    setBusyId('');
    setStatus(result);
    if (result.ok) {
      setLineDrafts((current) => { const next = { ...current }; delete next[id]; return next; });
      await onRefresh();
    }
    return result;
  };
  const updateLineDraft = (line, changes) => {
    setLineDrafts((current) => ({
      ...current,
      [line.id]: { ...(current[line.id] || createInventoryManagerLineDraft(line)), ...changes },
    }));
  };
  const saveLine = (line) => {
    const draft = lineDrafts[line.id] || createInventoryManagerLineDraft(line);
    const evaluated = evaluateInventoryManagerLineDraft(line, draft);
    return executeInventoryManagerLineSave({
      key: line.id,
      evaluated,
      guard: lineSaveGuardRef.current,
      operation: async () => {
        if (!(await requestWriteAccess())) return { skipped: true };
        setBusyId(line.id);
        updateLineDraft(line, { saveState: INVENTORY_MANAGER_SAVE_STATES.SAVING, error: '', message: '' });
        try {
          const common = { lineId: line.id, expectedUpdatedAt: line.updatedAt, note: evaluated.note };
          const result = draft.saveKind === INVENTORY_MANAGER_SAVE_KINDS.CASES
            ? await setInventoryCountLineCaseQuantity({ ...common, fullCases: evaluated.fullCases, looseQuantity: evaluated.looseQuantity })
            : draft.saveKind === INVENTORY_MANAGER_SAVE_KINDS.STRUCTURED
              ? await setInventoryCountLineStructuredQuantity({
                ...common,
                wholeUnits: evaluated.countedWholeUnits,
                openVolumeLiters: evaluated.countedOpenVolumeLiters,
                fullKegs: evaluated.countedFullKegs,
                partialKegFraction: evaluated.countedPartialKegFraction,
              })
              : await setInventoryCountLineQuantity({ ...common, countedQuantity: evaluated.countedQuantity });
          if (!result?.ok) {
            setStatus(result);
            setLineDrafts((current) => ({
              ...current,
              [line.id]: inventoryManagerLineDraftAfterFailure(current[line.id] || draft, result),
            }));
            return result;
          }
          const refreshResult = await onRefresh();
          const savedMessage = evaluated.noteOnly
            ? `Note saved. Physical count remains ${quantity(result.record?.countedQuantityExact ?? line.countedQuantityExact)} ${line.unitLabel}.`
            : evaluated.noteChanged ? 'Count and note saved.' : 'Physical count saved.';
          if (refreshResult?.ok === false) {
            setStatus({ ...refreshResult, message: 'The count was saved, but the latest server state could not be loaded. Review before saving again.' });
            setLineDrafts((current) => ({
              ...current,
              [line.id]: {
                ...createInventoryManagerLineDraft(result.record || line),
                saveState: INVENTORY_MANAGER_SAVE_STATES.STALE,
                error: 'Saved, but refresh failed. Review the latest saved value before another save.',
              },
            }));
            return result;
          }
          setStatus({ ...result, message: savedMessage });
          setLineDrafts((current) => ({
            ...current,
            [line.id]: {
              ...createInventoryManagerLineDraft(result.record || line),
              saveState: INVENTORY_MANAGER_SAVE_STATES.SAVED,
              message: savedMessage,
            },
          }));
          return result;
        } catch (error) {
          const failure = { ok: false, message: error?.message || 'The count was not saved. Check the connection and retry.' };
          setStatus(failure);
          setLineDrafts((current) => ({
            ...current,
            [line.id]: inventoryManagerLineDraftAfterFailure(current[line.id] || draft, failure),
          }));
          return failure;
        } finally {
          setBusyId('');
        }
      },
    });
  };
  const reviewLine = async (line) => {
    const result = await onRefresh();
    if (result?.ok === false) return;
    setLineDrafts((current) => current[line.id] ? ({
      ...current,
      [line.id]: {
        ...current[line.id],
        saveState: INVENTORY_MANAGER_SAVE_STATES.UNSAVED,
        error: '',
        message: 'Latest saved value loaded. Your draft is preserved for review.',
      },
    }) : current);
  };
  const lineAction = (line, kind) => {
    const common = { lineId: line.id, expectedUpdatedAt: line.updatedAt };
    const draft = lineDrafts[line.id] || createInventoryManagerLineDraft(line);
    if (kind === 'unchanged') return runWrite(line.id, () => confirmInventoryCountLineUnchanged(common));
    if (kind === 'par') return runWrite(line.id, () => markInventoryCountLineUsePar({ ...common, note: draft.note }));
    if (kind === 'clear') return runWrite(line.id, () => clearInventoryCountLine(common));
    return runWrite(line.id, () => skipInventoryCountLine({ ...common, note: draft.note }));
  };
  const dismissBulkReview = () => {
    setBulkReview(null);
    window.requestAnimationFrame(() => bulkTriggerRef.current?.focus());
  };
  const handleBulkDialogKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      dismissBulkReview();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...(bulkDialogRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled)') || [])]
      .filter((element) => element.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const confirmBulkReview = () => {
    if (!bulkReview?.acknowledged) return;
    const replace = bulkReview.replace;
    setBulkReview(null);
    runWrite('bulk', () => markInventoryLocationUsePar({ sessionId: session.id, locationId, replaceExisting: replace, expectedSessionUpdatedAt: session.updatedAt }));
  };
  const exportSession = () => downloadCsv(`mesh-stock-count-${session.countDate}.csv`, makeCsv(['Date', 'Session', 'Status', 'Location', 'Product', 'Product ID', 'Count mode', 'Base unit', 'Container capacity L', 'Whole / sealed', 'Open liters', 'Full kegs', 'Partial keg fraction', 'Stock policy', 'Target', 'Counted', 'Gap', 'Count method', 'Components', 'Note', 'Counted by', 'Counted at'], orderedLines.map((line) => { const calculated = calculateInventoryLine(line); const numeric = (value) => inventoryCsvNumeric(value); return [session.countDate, session.title, session.status, line.locationName, line.productName, line.productId, line.countMode, line.unitLabel, numeric(line.containerCapacityLiters), numeric(line.countedWholeUnitsExact), numeric(line.countedOpenVolumeLitersExact), numeric(line.countedFullKegsExact), numeric(line.countedPartialKegFractionExact), line.stockPolicy, numeric(calculated.effectiveTargetExact), numeric(line.countedQuantityExact), numeric(calculated.restockQuantityExact), line.countMethod, inventoryStructuredComponentLabel(line), line.note, line.countedByName, line.countedAt]; })));
  if (millumOpen) return <MillumExportView session={session} onBack={() => setMillumOpen(false)} />;
  return (
    <div className="inventory-stack">
      <section className="inventory-session-header">
        <button type="button" className="secondary-button" onClick={onBack}>Back to overview</button>
        <div><p className="eyebrow">{session.countDate} · {inventorySessionKindLabel(session)}</p><h2>{session.title}</h2><p>{sessionSummary.counted} of {sessionSummary.total} recorded · {sessionSummary.shortages} shortages</p>{lockLabel && <p className="inventory-audit"><strong>{lockLabel}</strong></p>}</div>
        <Status tone={session.status === 'approved' ? 'good' : 'active'}>{session.status}</Status>
      </section>
      {remoteNotice && <div className="inventory-remote-notice" role="status"><span>{isDirty ? 'Stock count changed elsewhere. Your unsaved entry is preserved.' : 'Stock count changed elsewhere.'}</span><button type="button" className="secondary-button" onClick={() => { clearRemoteNotice(); if (!isDirty) onRefresh(); }}>Review</button></div>}
      {(originalSession || correctionSessions.length > 0) && <section className="inventory-panel"><h2>Correction history</h2>{originalSession && <button type="button" className="text-button" onClick={() => onOpenSession(originalSession.id)}>Original approved count: {originalSession.title}</button>}{correctionSessions.map((correction) => <button type="button" className="text-button" key={correction.id} onClick={() => onOpenSession(correction.id)}>Correction: {correction.title} · {correction.status.replace('_', ' ')}</button>)}</section>}
      <nav className="inventory-location-tabs" aria-label="Count locations">{locationIds.map((id) => { const location = locations.find((item) => item.id === id); const summary = summarizeInventoryLocation(lines.filter((line) => line.locationId === id), completionMap[id]); return <button type="button" key={id} className={id === locationId ? 'active' : ''} onClick={() => setLocationId(id)}><span>{location ? contextualLocationName(location, locations) : lines.find((line) => line.locationId === id)?.locationName}</span><small>{summary.counted}/{summary.total} · {inventoryStatusLabel(summary.status)}</small></button>; })}</nav>
      <section className="inventory-location-header">
        <div><h2>{currentLocationLabel}</h2><p>{locationSummary.counted} of {locationSummary.total} recorded · {locationSummary.shortages} restock {locationSummary.shortages === 1 ? 'need' : 'needs'} · {locationSummary.needsReview} need review</p><p className="inventory-policy-note">Restock needs mean the physical quantity is below its target. Notes document context but do not change the target or replenishment quantity.</p></div>
        <div className="inventory-location-controls"><button ref={bulkTriggerRef} type="button" className="secondary-button" disabled={readOnly || !exactUncounted} onClick={() => setBulkReview({ replace: false, acknowledged: false })}>Mark exact-par lines fully stocked</button><button type="button" className="primary-button" disabled={readOnly || inventoryLocationCompletionBlocked(locationSummary)} onClick={() => runWrite(`complete-${locationId}`, () => completeInventoryCountLocation({ sessionId: session.id, locationId }))}>{completionMap[locationId] ? 'Location complete' : 'Complete location'}</button></div>
      </section>
      {isInventorySessionEditable(session.status) && <LocationReferenceViewer locationName={currentLocationLabel} guidance={referenceGuidance.find((item) => item.locationId === locationId) || { locationId }} />}
      <div className="inventory-line-list">{locationLines.map((line) => <CountLineCard key={line.id} line={line} identityReference={inventoryProductIdentityReference(line, locationLines)} draft={lineDrafts[line.id] || createInventoryManagerLineDraft(line)} onDraft={(changes) => updateLineDraft(line, changes)} onSave={() => saveLine(line)} onReview={() => reviewLine(line)} action={(kind) => lineAction(line, kind)} busy={busyId === line.id} readOnly={readOnly} canManage={canManage} />)}</div>
      <section className="inventory-panel inventory-session-actions">
        <h2>Session actions</h2>
        <div className="inventory-summary-grid"><div><strong>{sessionSummary.completedLocations}/{sessionSummary.locations}</strong><span>locations complete</span></div><div><strong>{sessionSummary.uncounted}</strong><span>uncounted</span></div><div><strong>{sessionSummary.skipped}</strong><span>skipped</span></div><div><strong>{sessionSummary.needsReview}</strong><span>needs review</span></div></div>
        <label>Review note<textarea rows="2" value={completionNote} disabled={session.status === 'approved' || session.status === 'cancelled'} onChange={(event) => setCompletionNote(event.target.value)} /></label>
        {canCoordinate && !readOnly && <div className="inventory-reopen"><label className="inventory-danger-option"><input type="checkbox" checked={allowExceptions} onChange={(event) => setAllowExceptions(event.target.checked)} /><span>Finalize with documented exceptions</span></label>{allowExceptions && <label>Required exception reason<textarea rows="2" value={exceptionReason} onChange={(event) => setExceptionReason(event.target.value)} /></label>}</div>}
        {exceptionSummary.hasExceptions && <div className="inventory-warning"><strong>Finalized with exceptions</strong><p>{exceptionSummary.reason}</p><p>{exceptionSummary.counts.skipped} skipped · {exceptionSummary.counts.uncounted} uncounted · {exceptionSummary.counts.needsReview} needs review · {exceptionSummary.counts.incompleteLocations} incomplete locations</p><p>Finalized by {session.finalizedByName || session.completedByName}{session.finalizedAt ? ` · ${formatDateTime(session.finalizedAt)}` : ''}</p></div>}
        <div className="inventory-action-row"><button type="button" className="secondary-button" onClick={exportSession}>Export session CSV</button>{canManage && session.status === 'approved' && <button type="button" className="primary-button" onClick={() => setMillumOpen(true)}>Millum view / Export count</button>}{canCoordinate && !readOnly && <button type="button" className="primary-button" disabled={allowExceptions && !exceptionReason.trim()} onClick={() => runWrite('complete-session', () => completeInventoryCountSession({ sessionId: session.id, note: completionNote, allowExceptions, exceptionReason }))}>Complete session</button>}{canManage && session.status === 'completed' && <button type="button" className="primary-button" onClick={() => runWrite('approve', () => approveInventoryCountSession({ sessionId: session.id, note: completionNote }))}>Approve stock count</button>}</div>
        {canManage && session.status === 'approved' && <div className="inventory-reopen"><label>Reason for correction<input value={actionReason} onChange={(event) => setActionReason(event.target.value)} /></label><button type="button" className="secondary-button" disabled={!actionReason.trim()} onClick={async () => { const result = await runWrite('correction', () => createInventoryCorrectionSession({ originalSessionId: session.id, reason: actionReason, idempotencyKey: correctionIdempotencyKey })); const correctionId = result?.data?.session?.id; if (result?.ok && correctionId) onOpenSession(correctionId); }}>Create correction count</button><p className="muted">The approved count remains permanently locked. Corrections are recorded in a new linked session.</p></div>}
        {canManage && !['approved', 'cancelled'].includes(session.status) && <div className="inventory-reopen"><label>Cancellation reason<input value={actionReason} onChange={(event) => setActionReason(event.target.value)} /></label><button type="button" className="text-button danger-text" disabled={!actionReason.trim()} onClick={() => runWrite('cancel', () => cancelInventoryCountSession({ sessionId: session.id, reason: actionReason }))}>Cancel session</button></div>}
      </section>
      {bulkReview && (
        <div className="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) dismissBulkReview(); }}>
          <section ref={bulkDialogRef} className="pilot-modal inventory-modal" role="dialog" aria-modal="true" aria-labelledby="inventory-bulk-title" aria-describedby="inventory-bulk-description" onKeyDown={handleBulkDialogKeyDown}>
            <h2 id="inventory-bulk-title">{currentLocationLabel}</h2>
            <div id="inventory-bulk-description" className="inventory-modal-copy">
              {bulkReview.replace ? <><p>All non-skipped exact-par lines that differ from the fully stocked target will be replaced.</p><p>Manual, imported and adjusted exact-par counts may be replaced.</p><p>Protected event reserve, operating reserve, dormant stock and skipped lines remain unchanged.</p><p><strong>This is a manager-only action.</strong></p></> : <><p>{exactUncounted} uncounted exact-par lines will be marked fully stocked.</p><p>This is an explicit stocking attestation, not a physical count.</p><p>Other policies and existing counts remain unchanged.</p></>}
            </div>
            <label className="inventory-danger-option" htmlFor="inventory-bulk-acknowledgement">
              <input id="inventory-bulk-acknowledgement" type="checkbox" checked={bulkReview.acknowledged} onChange={(event) => setBulkReview((current) => ({ ...current, acknowledged: event.target.checked }))} />
              <span>I confirm the eligible exact-par lines in this location are fully stocked</span>
            </label>
            {canManage && <label className="inventory-danger-option" htmlFor="inventory-bulk-replace"><input id="inventory-bulk-replace" type="checkbox" checked={bulkReview.replace} onChange={(event) => setBulkReview((current) => ({ ...current, replace: event.target.checked }))} /><span>Replace existing exact-par counts (manager only)</span></label>}
            <div className="inventory-action-row"><button ref={bulkCancelRef} type="button" className="secondary-button" onClick={dismissBulkReview}>Cancel</button><button type="button" className="primary-button" disabled={!bulkReview.acknowledged || busyId === 'bulk'} onClick={confirmBulkReview}>{bulkReview.replace ? 'Replace with fully stocked' : 'Mark fully stocked'}</button></div>
          </section>
        </div>
      )}
    </div>
  );
}

function RestockView({ session, lines }) {
  const restock = buildInventoryRestockList(lines);
  const eventReserve = buildProtectedEventReserveList(lines);
  const exportRestock = () => downloadCsv(`mesh-restock-${session?.countDate || osloDate()}.csv`, makeCsv(['Product', 'Product ID', 'Count mode', 'Unit', 'Location', 'Missing quantity', 'Category'], restock.flatMap((product) => product.locations.map((location) => [product.productName, product.productId, product.countMode, product.unitLabel, location.locationName, inventoryCsvNumeric(location.missingQuantityExact), product.category]))));
  return <div className="inventory-stack"><section className="inventory-panel"><div className="inventory-panel-heading"><div><p className="eyebrow">Daily and operating stock</p><h2>Restock list</h2></div><button type="button" className="secondary-button" disabled={!restock.length} onClick={exportRestock}>Export CSV</button></div><p className="muted">Exact-par shortages and operating-reserve gaps only. This is not a transfer order and does not claim storage stock is available.</p>{restock.length ? restock.map((product) => { const reference = inventoryProductIdentityReference(product, restock); return <article className="inventory-restock-card" key={product.productId}><h3>{product.productName}</h3>{reference && <p className="inventory-audit">{reference}</p>}<p><strong>Total gap: {quantity(product.totalMissingExact)} {product.unitLabel}</strong></p>{product.locations.map((location) => <p key={location.lineId}>{location.locationName}: {quantity(location.missingQuantityExact)}</p>)}</article>; }) : <p>No daily or operating-reserve requirements in the selected session.</p>}</section>{eventReserve.length > 0 && <section className="inventory-panel"><div><p className="eyebrow">Protected stock</p><h2>Event reserve readiness</h2></div><p className="inventory-protected-note"><strong>Not for daily restocking</strong><span>Event reserve remains separate from Main beverage stock. No transfer is created here.</span></p>{eventReserve.map((item) => { const reference = inventoryProductIdentityReference(item, eventReserve); return <article className="inventory-restock-card" key={item.id}><h3>{item.productName}</h3>{reference && <p className="inventory-audit">{reference}</p>}<p><strong>{item.readinessPercent ?? 0}% ready</strong></p><p>{item.countFullCases ?? '-'} / {item.targetCases ?? '-'} cases · {quantity(item.actualUnits)} / {quantity(item.targetUnits)} units</p><p>{quantity(item.shortageUnits)} units short</p></article>; })}</section>}</div>;
}

function ProductManager({ products, run }) {
  const [product, setProduct] = useState(EMPTY_PRODUCT);
  const [search, setSearch] = useState('');
  const visibleProducts = products.filter((item) => !search || `${item.name} ${item.shortName} ${item.aliases?.join(' ')} ${item.millumItemRef} ${item.sku} ${item.category}`.toLowerCase().includes(search.toLowerCase()));
  const requestedName = product.name.trim().toLowerCase();
  const representedProduct = requestedName && products.find((item) => item.id !== product.id && item.ownershipStatus === 'owned' && [item.name, item.shortName, ...(item.aliases || [])].some((value) => value?.trim().toLowerCase() === requestedName));
  const identityPeers = products.map((item) => ({ ...item, productId: item.id, productName: item.name }));
  const capacityState = inventoryDecimalDraftState(product.containerCapacityLiters, { maxScale: 6, allowNegative: false });
  const capacityValid = product.countMode !== INVENTORY_COUNT_MODES.CONTAINER_PLUS_VOLUME || (capacityState.complete && capacityState.valid && Number(capacityState.value) > 0);
  const saveProduct = () => run(() => saveInventoryProduct({
    ...product,
    containerCapacityLiters: product.countMode === INVENTORY_COUNT_MODES.CONTAINER_PLUS_VOLUME
      ? normalizeInventoryDecimal(product.containerCapacityLiters, { maxScale: 6, allowNegative: false })
      : null,
  }));
  const exportCatalog = () => downloadCsv('mesh-inventory-products.csv', makeCsv(['Product name', 'Practical name', 'Product ID', 'Millum item ref', 'Millum groups', 'SKU', 'Barcode', 'Category', 'Configured unit', 'Count mode', 'Container capacity L', 'Active', 'Supplier'], products.map((item) => [item.name, item.shortName, item.id, item.millumItemRef, item.millumGroups?.map((group) => group.name).join(' | '), item.sku, item.barcode, item.category, item.unitLabel, item.countMode, inventoryCsvNumeric(item.containerCapacityLiters), item.active ? 'yes' : 'no', item.supplierName])));
  return (
    <section className="inventory-panel">
      <div className="inventory-panel-heading"><h2>Products</h2><button type="button" className="secondary-button" onClick={exportCatalog}>Export CSV</button></div>
      <label>Search products<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <div className="inventory-form-grid">
        <label>Name<input value={product.name} onChange={(event) => setProduct({ ...product, name: event.target.value })} /></label>
        <label>Practical display name<input value={product.shortName || ''} onChange={(event) => setProduct({ ...product, shortName: event.target.value })} /></label>
        {product.millumItemRef && <label>Millum item reference<input value={product.millumItemRef} readOnly /></label>}
        <label>Unit<input value={product.unitLabel} onChange={(event) => setProduct({ ...product, unitLabel: event.target.value })} /></label>
        <label>Category<input list="inventory-product-categories" value={product.category} onChange={(event) => setProduct({ ...product, category: event.target.value })} /><datalist id="inventory-product-categories">{PRODUCT_CATEGORY_PRESETS.map((category) => <option key={category} value={category} />)}</datalist></label>
        <label>SKU<input value={product.sku} onChange={(event) => setProduct({ ...product, sku: event.target.value })} /></label>
        <label>Count mode<select value={product.countMode || INVENTORY_COUNT_MODES.UNIT} onChange={(event) => setProduct({ ...product, countMode: event.target.value, containerCapacityLiters: event.target.value === INVENTORY_COUNT_MODES.CONTAINER_PLUS_VOLUME ? (product.containerCapacityLiters ?? '') : '' })}><option value={INVENTORY_COUNT_MODES.UNIT}>Units</option><option value={INVENTORY_COUNT_MODES.CONTAINER_PLUS_VOLUME}>Bottles + open liters</option><option value={INVENTORY_COUNT_MODES.KEG_FRACTION}>Full + partial kegs</option></select></label>
        {product.countMode === INVENTORY_COUNT_MODES.CONTAINER_PLUS_VOLUME && <label>Container capacity (L)<input type="text" inputMode="decimal" placeholder="0,7" value={product.containerCapacityLiters ?? ''} onChange={(event) => setProduct({ ...product, containerCapacityLiters: event.target.value })} /></label>}
      </div>
      <p className="muted">Count mode is snapshotted when a Stock Count starts. Bottles + open liters requires an exact positive container capacity; later product changes do not reinterpret existing sessions.</p>
      {!capacityValid && <p className="inventory-warning">Enter a positive container capacity using no more than 6 decimal places.</p>}
      {representedProduct && <p className="inventory-warning">{representedProduct.name} already represents this official or practical name. Select that stable product instead of creating a duplicate.</p>}
      <div className="inventory-action-row"><button type="button" className="primary-button" disabled={!product.name.trim() || !product.unitLabel.trim() || !capacityValid || Boolean(representedProduct)} onClick={saveProduct}>{product.id ? 'Save product' : 'Add product'}</button></div>
      <div className="inventory-config-list">{visibleProducts.map((item) => { const reference = inventoryProductIdentityReference({ ...item, productId: item.id, productName: item.name }, identityPeers); return <article key={item.id}><div><strong>{item.shortName || item.name}</strong><span>{item.shortName && item.shortName !== item.name ? `${item.name} · ` : ''}{item.category || 'Other'}{item.millumItemRef ? ` · Millum ${item.millumItemRef}` : ''} · {inventoryCountModeLabel(item.countMode)}{item.containerCapacityLiters ? ` · ${quantity(item.containerCapacityLiters)} L each` : ''} · {inventoryBaseUnit(item.countMode, item.unitLabel)}{reference ? ` · ${reference}` : ''}{!item.active ? ' · Archived' : ''}</span></div><div><button type="button" className="secondary-button" onClick={() => setProduct({ ...item, containerCapacityLiters: item.containerCapacityLiters ?? '' })}>Edit</button><button type="button" className="text-button" onClick={() => run(() => saveInventoryProduct({ ...item, active: !item.active }))}>{item.active ? 'Archive' : 'Reactivate'}</button></div></article>; })}</div>
    </section>
  );
}

function LocationManager({ locations, requestWriteAccess, refresh, run, setStatus }) {
  const [location, setLocation] = useState(EMPTY_LOCATION);
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupSummary, setSetupSummary] = useState(null);
  const [customOpen, setCustomOpen] = useState(false);
  const groups = groupedInventoryLocations(locations);
  const applyTemplate = async () => {
    if (!(await requestWriteAccess())) return;
    setSetupBusy(true);
    const result = await setupMeshYoungstorgetInventoryLocations();
    setSetupBusy(false);
    if (!result.ok) { setStatus(result); return; }
    setSetupSummary(result.data);
    setStatus({ ok: true, message: `Operational setup complete: ${result.data?.refrigerators || 0} refrigerators, ${result.data?.catalogueProducts || 0} owned Millum products, ${result.data?.defaultRows || 0} confirmed defaults, and ${result.data?.unresolvedMappings || 0} unresolved mappings.` });
    await refresh(true);
  };
  const editLocation = (item) => { setLocation(item); setCustomOpen(true); };
  return (
    <div className="inventory-stack">
      <section className="inventory-panel inventory-template-setup">
        <div><p className="eyebrow">Phase 9G operational setup</p><h2>Six refrigerators and Millum catalogue</h2><p className="muted">Normalize the six real refrigerators and seed the verified Bobby-owned Millum catalogue. Existing location IDs and historical count snapshots remain untouched; uncertain default names stay unresolved.</p></div>
        <div className="inventory-template-review" aria-label="Location setup review">
          {YOUNGSTORGET_LOCATION_TEMPLATE.map((group) => <div key={group.code}><strong>{group.name}</strong>{group.children.map((child) => <span key={child}>{child}</span>)}</div>)}
        </div>
        <button type="button" className="primary-button inventory-full-button" disabled={setupBusy} onClick={applyTemplate}>{setupBusy ? 'Setting up operational inventory...' : 'Set up six refrigerators and catalogue'}</button>
        {setupSummary && <div className="inventory-setup-result" role="status"><strong>Setup complete</strong><span>{setupSummary.refrigerators || 0} refrigerators</span><span>{setupSummary.catalogueProducts || 0} owned products</span><span>{setupSummary.defaultRows || 0} confirmed defaults</span><span>{setupSummary.unresolvedMappings || 0} unresolved</span></div>}
      </section>
      <section className="inventory-panel">
        <div className="inventory-panel-heading"><div><p className="eyebrow">Current structure</p><h2>Locations</h2></div><Status>{locations.filter((item) => item.active).length} active</Status></div>
        <div className="inventory-location-tree">{groups.map((group) => <section key={group.key}><h3>{group.label}</h3>{group.locations.map((item) => <article key={item.id} className={!item.active ? 'archived' : ''}><div><strong>{contextualLocationName(item, locations)}</strong><span>{item.code || 'No code'} · {item.locationType || 'location'} · {item.countable ? 'Countable' : 'Not selectable for counts'}{!item.active ? ' · Archived' : ''}</span></div><div><button type="button" className="secondary-button" onClick={() => editLocation(item)}>Edit</button><button type="button" className="secondary-button" onClick={() => run(() => setInventoryLocationCountable(item.id, !item.countable))}>{item.countable ? 'Disable counting' : 'Enable counting'}</button><button type="button" className="text-button" onClick={() => run(() => saveInventoryLocation({ ...item, active: !item.active }))}>{item.active ? 'Archive' : 'Reactivate'}</button></div></article>)}</section>)}</div>
      </section>
      <details className="inventory-panel inventory-secondary-setup" open={customOpen} onToggle={(event) => setCustomOpen(event.currentTarget.open)}>
        <summary>Custom location</summary>
        <p className="muted">Add a location outside the standard template or edit the selected location.</p>
        <div className="inventory-form-grid">
          <label>Name<input value={location.name} onChange={(event) => setLocation({ ...location, name: event.target.value })} /></label>
          <label>Type<select value={location.locationType} onChange={(event) => setLocation({ ...location, locationType: event.target.value })}><option value="area">Area</option><option value="bar">Bar</option><option value="fridge">Fridge</option><option value="shelf">Shelf</option><option value="storage">Storage</option><option value="cellar">Cellar</option><option value="freezer">Freezer</option><option value="other">Other</option></select></label>
          <label>Parent<GroupedLocationSelect locations={locations.filter((item) => item.id !== location.id)} value={location.parentLocationId} onChange={(event) => setLocation({ ...location, parentLocationId: event.target.value })} label="No parent" /></label>
          <label>Code<input value={location.code} onChange={(event) => setLocation({ ...location, code: event.target.value })} /></label>
        </div>
        <div className="inventory-action-row"><button type="button" className="primary-button" disabled={!location.name.trim()} onClick={async () => { const result = await run(() => saveInventoryLocation(location)); if (result?.ok) setLocation(EMPTY_LOCATION); }}>{location.id ? 'Save location' : 'Add custom location'}</button>{location.id && <button type="button" className="secondary-button" onClick={() => setLocation(EMPTY_LOCATION)}>Cancel edit</button>}</div>
      </details>
    </div>
  );
}

function RefrigeratorDefaultsManager({ products, locations, standards, refrigeratorTemplates, unresolvedMappings, reserves, requestWriteAccess, refresh, setStatus }) {
  const refrigerators = INVENTORY_REFRIGERATOR_DEFINITIONS.map((definition) => {
    const location = locations.find((item) => item.active && item.code === definition.code);
    return location ? { ...definition, location } : null;
  }).filter(Boolean);
  const [locationId, setLocationId] = useState('');
  const [search, setSearch] = useState('');
  const [millumGroup, setMillumGroup] = useState('');
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(false);
  const selected = refrigerators.find((item) => item.location.id === locationId) || refrigerators[0];
  useEffect(() => { if (!locationId && refrigerators[0]) setLocationId(refrigerators[0].location.id); }, [locationId, refrigerators[0]?.location.id]);
  const ownedProducts = useMemo(() => products.filter((product) => product.ownershipStatus === 'owned'), [products]);
  const baseline = useMemo(() => Object.fromEntries(ownedProducts.map((product) => {
    const standard = standards.find((item) => item.locationId === selected?.location.id && item.productId === product.id);
    const sourceOrder = Math.min(...(product.millumGroups || []).map((group) => group.itemSortOrder || 999), product.sortOrder || 999);
    return [product.id, { assigned: Boolean(standard?.active), quantity: standard?.parQuantity ?? 0, countOrder: standard?.countOrder ?? sourceOrder, contributesToStorageTarget: standard?.contributesToStorageTarget === true }];
  })), [ownedProducts, standards, selected?.location.id]);
  useEffect(() => { setDrafts(baseline); }, [baseline]);
  const groupOptions = useMemo(() => {
    const groups = new Map();
    for (const product of ownedProducts) for (const group of product.millumGroups || []) groups.set(group.name, Math.min(groups.get(group.name) ?? 999, group.groupSortOrder));
    return [...groups].sort((left, right) => left[1] - right[1]).map(([name]) => name);
  }, [ownedProducts]);
  const visibleProducts = filterOwnedInventoryCatalogue(ownedProducts, { search, millumGroup }).sort(compareInventoryCatalogueOrder);
  const changedProducts = ownedProducts.filter((product) => {
    const current = drafts[product.id]; const original = baseline[product.id];
    return current && original && (current.assigned !== original.assigned || Number(current.quantity || 0) !== Number(original.quantity || 0) || current.contributesToStorageTarget !== original.contributesToStorageTarget);
  });
  const invalidQuantity = changedProducts.some((product) => drafts[product.id].assigned && (!Number.isFinite(Number(drafts[product.id].quantity)) || Number(drafts[product.id].quantity) < 0));
  const template = refrigeratorTemplates.find((item) => item.locationId === selected?.location.id);
  const unresolved = unresolvedMappings.filter((item) => item.locationId === selected?.location.id);
  const reserveByProduct = new Map(reserves.map((item) => [item.productId, item]));
  const update = (productId, patch) => setDrafts((current) => ({ ...current, [productId]: { ...current[productId], ...patch } }));
  const save = async () => {
    if (!selected || !changedProducts.length || invalidQuantity || !(await requestWriteAccess())) return;
    setSaving(true);
    const result = await saveInventoryStandardsBulk({
      locationId: selected.location.id,
      rows: changedProducts.map((product) => drafts[product.id].assigned ? {
        productId: product.id,
        assigned: true,
        parQuantity: Number(drafts[product.id].quantity),
        countOrder: Number(drafts[product.id].countOrder || 0),
        stockPolicy: 'exact_par',
        contributesToStorageTarget: true,
      } : { productId: product.id, assigned: false }),
    });
    setSaving(false);
    setStatus(result.ok ? { ok: true, message: `${selected.name} defaults saved. The template is incomplete until a manager verifies it.` } : result);
    if (result.ok) await refresh(true);
  };
  const verify = async () => {
    if (!selected || !(await requestWriteAccess())) return;
    const result = await verifyInventoryRefrigeratorTemplate(selected.location.id);
    setStatus(result.ok ? { ok: true, message: `${selected.name} marked verified.` } : result);
    if (result.ok) await refresh(true);
  };
  if (!refrigerators.length) return <section className="inventory-panel"><h2>Refrigerator defaults</h2><p className="inventory-warning">Run the six-refrigerator operational setup from Locations before editing defaults.</p></section>;
  return (
    <section className="inventory-panel inventory-fridge-defaults">
      <div className="inventory-panel-heading"><div><p className="eyebrow">Manager-only operational template</p><h2>Refrigerator defaults</h2></div><Status tone={template?.status === 'verified' ? 'good' : 'warning'}>{template?.status === 'verified' ? 'Verified' : 'Incomplete'}</Status></div>
      <p className="muted">Defaults are stable product assignments, not a current count. Temporary substitutions and physical extras belong in the Stock Count and never overwrite this template.</p>
      <div className="inventory-standards-toolbar">
        <label>Refrigerator<select value={selected?.location.id || ''} onChange={(event) => setLocationId(event.target.value)}>{refrigerators.map((item) => <option value={item.location.id} key={item.code}>{item.name}</option>)}</select></label>
        <label>Search catalogue<input type="search" placeholder="Official name, practical name, alias or Millum ref" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <label>Millum category<select value={millumGroup} onChange={(event) => setMillumGroup(event.target.value)}><option value="">All owned categories</option>{groupOptions.map((group) => <option value={group} key={group}>{group}</option>)}</select></label>
      </div>
      <div className="inventory-fridge-catalogue" aria-label={`${selected?.name} owned product catalogue`}>
        {visibleProducts.map((product) => {
          const row = drafts[product.id] || baseline[product.id];
          const reserve = reserveByProduct.get(product.id);
          const groupNames = product.millumGroups?.map((group) => group.name).join(' · ');
          return <article className="inventory-fridge-product" key={product.id}><label className="inventory-fridge-product-choice"><input type="checkbox" checked={Boolean(row?.assigned)} onChange={(event) => update(product.id, { assigned: event.target.checked })} /><span><strong>{product.shortName || product.name}</strong>{product.shortName && product.shortName !== product.name && <small>{product.name}</small>}<small>Millum {product.millumItemRef} · {groupNames || product.category}</small></span></label><label>Default quantity<input type="number" min="0" step="any" disabled={!row?.assigned} value={row?.quantity ?? 0} onChange={(event) => update(product.id, { quantity: event.target.value })} /></label>{reserve && <small className="inventory-reserve-summary">All fridges {quantity(reserve.refrigeratorDefaultQuantity)} · reserve {quantity(reserve.reserveTargetQuantity)}{reserve.reserveTargetOverride !== null ? ' override' : ' (3×)'} · desired {quantity(reserve.combinedDesiredQuantity)}</small>}</article>;
        })}
        {!visibleProducts.length && <p className="muted">No Bobby-owned Millum products match this filter.</p>}
      </div>
      {unresolved.length > 0 && <details className="inventory-unresolved-mappings"><summary>{unresolved.length} unresolved default mapping{unresolved.length === 1 ? '' : 's'} for this refrigerator</summary><p className="muted">These quantities were intentionally not merged into catalogue products.</p>{unresolved.map((item) => <article key={item.id}><strong>{item.requestedName}: {quantity(item.requestedDefaultQuantity)}</strong><span>{item.reason}</span><small>{item.candidateMillumItemRefs.length ? `Candidate Millum refs: ${item.candidateMillumItemRefs.join(', ')}` : 'No candidate in the supplied export'}</small></article>)}</details>}
      {invalidQuantity && <p className="inventory-warning">Default quantities must be non-negative numbers.</p>}
      <div className="inventory-standards-save"><span>{changedProducts.length} changed product{changedProducts.length === 1 ? '' : 's'}</span><button type="button" className="primary-button" disabled={saving || !changedProducts.length || invalidQuantity} onClick={save}>{saving ? 'Saving defaults...' : 'Save changed defaults'}</button><button type="button" className="secondary-button" disabled={saving || changedProducts.length > 0 || template?.status === 'verified' || !ownedProducts.some((product) => baseline[product.id]?.assigned)} onClick={verify}>Mark template verified</button></div>
      {template?.status === 'verified' && <p className="inventory-audit">Verified {formatDateTime(template.verifiedAt)} by {template.verifiedByName}. Any later default edit returns it to incomplete.</p>}
    </section>
  );
}

function StandardsManager({ products, locations, standards, storageSettings, requestWriteAccess, refresh, run, setStatus }) {
  const activeLocations = locations.filter((item) => item.active);
  const identityPeers = products.map((item) => ({ ...item, productId: item.id, productName: item.name }));
  const preferredLocation = activeLocations.find((item) => item.parentLocationId) || activeLocations.find((item) => item.locationType === 'storage') || activeLocations[0];
  const [locationId, setLocationId] = useState('');
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(false);
  const [storageMultiplier, setStorageMultiplier] = useState(String(storageSettings?.targetMultiplier ?? 3));
  const [multiplierBusy, setMultiplierBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [copy, setCopy] = useState({ sourceLocationId: '', destinationLocationId: '', overwriteExisting: false });
  useEffect(() => { if (!locationId && preferredLocation) setLocationId(preferredLocation.id); }, [locationId, preferredLocation?.id]);
  const selectedLocation = locations.find((location) => location.id === locationId);
  const suggestedPolicy = (() => {
    const code = String(selectedLocation?.code || '').toUpperCase();
    const parent = locations.find((location) => location.id === selectedLocation?.parentLocationId);
    const parentCode = String(parent?.code || '').toUpperCase();
    if (code === 'MAIN_STORAGE' || code === 'BEVERAGE_STORAGE_BOTTLES') return 'operating_reserve';
    if (code === 'BEVERAGE_STORAGE_EVENT_RESERVE') return 'protected_event_reserve';
    if (code === 'BEVERAGE_STORAGE_DORMANT_SPIRITS') return 'verify_unchanged';
    if (['WORKBAR', 'CORNERBAR'].includes(parentCode)) return 'exact_par';
    return 'exact_par';
  })();
  const baseline = useMemo(() => Object.fromEntries(products.map((product) => {
    const standard = standards.find((item) => item.locationId === locationId && item.productId === product.id);
    const stockPolicy = standard?.stockPolicy || suggestedPolicy;
    return [product.id, {
      assigned: Boolean(standard?.active), parQuantity: standard?.parQuantity ?? 0,
      countOrder: standard?.countOrder ?? product.sortOrder ?? 0, stockPolicy,
      targetMode: standard?.targetMode || (stockPolicy === 'operating_reserve' ? 'derived_multiplier' : ''),
      caseSize: standard?.caseSize ?? product.defaultPackSize ?? 24,
      targetCases: standard?.targetCases ?? 0,
      targetLooseQuantity: standard?.targetLooseQuantity ?? 0,
      physicalRecountIntervalDays: standard?.physicalRecountIntervalDays ?? 90,
      contributesToStorageTarget: standard?.contributesToStorageTarget === true,
      historicalSuggestionQuantity: standard?.historicalSuggestionQuantity ?? '',
      historicalSuggestionNote: standard?.historicalSuggestionNote ?? '',
      historicalSuggestionSource: standard?.historicalSuggestionSource ?? '',
    }];
  })), [products, standards, locationId, suggestedPolicy]);
  useEffect(() => { setStorageMultiplier(String(storageSettings?.targetMultiplier ?? 3)); }, [storageSettings?.targetMultiplier]);
  useEffect(() => { setDrafts(baseline); setSaveStatus(null); }, [baseline]);
  const updateDraft = (productId, patch) => setDrafts((current) => ({ ...current, [productId]: { ...current[productId], ...patch } }));
  const isChanged = (productId) => {
    const row = drafts[productId]; const original = baseline[productId];
    const fields = ['assigned', 'parQuantity', 'countOrder', 'stockPolicy', 'targetMode', 'caseSize', 'targetCases', 'targetLooseQuantity', 'physicalRecountIntervalDays', 'contributesToStorageTarget', 'historicalSuggestionQuantity', 'historicalSuggestionNote', 'historicalSuggestionSource'];
    return Boolean(row && original && fields.some((field) => String(row[field] ?? '') !== String(original[field] ?? '')));
  };
  const changedProducts = products.filter((product) => isChanged(product.id));
  const invalidRow = changedProducts.map((product) => drafts[product.id]).find((row) => row.assigned && (
    Number(row.countOrder) < 0 || !Number.isInteger(Number(row.countOrder))
    || (['exact_par'].includes(row.stockPolicy) && (row.parQuantity === '' || Number(row.parQuantity) < 0))
    || (row.stockPolicy === 'operating_reserve' && row.targetMode === 'fixed_quantity' && (row.parQuantity === '' || Number(row.parQuantity) < 0))
    || (row.stockPolicy === 'physical_count_only' && row.historicalSuggestionQuantity !== '' && (!Number.isFinite(Number(row.historicalSuggestionQuantity)) || Number(row.historicalSuggestionQuantity) < 0))
    || (row.stockPolicy === 'protected_event_reserve' && (Number(row.caseSize) <= 0 || Number(row.targetCases) < 0 || !Number.isInteger(Number(row.targetCases)) || Number(row.targetLooseQuantity) < 0))
    || (row.stockPolicy === 'verify_unchanged' && (Number(row.physicalRecountIntervalDays) <= 0 || !Number.isInteger(Number(row.physicalRecountIntervalDays))))
  ));
  const validationError = invalidRow ? 'Review the highlighted policy values. Targets and historical suggestions cannot be negative; case sizes and recount intervals must be greater than zero.' : '';
  const saveChanges = async () => {
    if (validationError || !locationId || !changedProducts.length) return;
    if (!(await requestWriteAccess())) return;
    setSaving(true); setSaveStatus({ message: 'Saving standards...' });
    const rows = changedProducts.map((product) => drafts[product.id].assigned ? {
      productId: product.id, assigned: true, parQuantity: Number(drafts[product.id].parQuantity || 0),
      countOrder: Number(drafts[product.id].countOrder), stockPolicy: drafts[product.id].stockPolicy,
      targetMode: drafts[product.id].targetMode || null,
      caseSize: Number(drafts[product.id].caseSize || 0), targetCases: Number(drafts[product.id].targetCases || 0),
      targetLooseQuantity: Number(drafts[product.id].targetLooseQuantity || 0),
      physicalRecountIntervalDays: Number(drafts[product.id].physicalRecountIntervalDays || 90),
      contributesToStorageTarget: drafts[product.id].contributesToStorageTarget === true,
      historicalSuggestionQuantity: drafts[product.id].historicalSuggestionQuantity,
      historicalSuggestionNote: drafts[product.id].historicalSuggestionNote,
      historicalSuggestionSource: drafts[product.id].historicalSuggestionSource,
    } : { productId: product.id, assigned: false });
    const result = await saveInventoryStandardsBulk({ locationId, rows });
    setSaving(false);
    if (!result.ok) { setSaveStatus(result); setStatus(result); return; }
    const data = result.data || {};
    const message = `Standards saved: ${data.created || 0} added, ${data.updated || 0} updated, ${data.archived || 0} archived, ${data.preserved || 0} unchanged.`;
    setSaveStatus({ ok: true, message }); setStatus({ ok: true, message }); await refresh(true);
  };
  const matchesSearch = (product) => !search || `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(search.toLowerCase());
  const activeProducts = products.filter((product) => product.active && matchesSearch(product)).sort((a, b) => Number(Boolean(baseline[b.id]?.assigned)) - Number(Boolean(baseline[a.id]?.assigned)) || (baseline[a.id]?.countOrder || 0) - (baseline[b.id]?.countOrder || 0) || (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name));
  const archivedProducts = products.filter((product) => !product.active && baseline[product.id]?.assigned && matchesSearch(product));
  const renderRow = (product, archived = false) => {
    const row = drafts[product.id] || baseline[product.id]; if (!row) return null;
    const target = calculateStandardPolicyTarget({ ...row, productId: product.id }, { standards, locations, products, storageSettings });
    const reference = inventoryProductIdentityReference({ ...product, productId: product.id, productName: product.name }, identityPeers) || product.sku;
    return <article className={`inventory-standard-row inventory-policy-standard ${archived ? 'archived' : ''}`} key={product.id}><div className="inventory-standard-product"><label><input type="checkbox" checked={row.assigned} disabled={archived && !row.assigned} onChange={(event) => updateDraft(product.id, { assigned: event.target.checked })} /><span><strong>{product.name}</strong><small>{product.category || 'Other'}{reference ? ` · ${reference}` : ''}{archived ? ' · Archived product' : ''}</small></span></label><Status tone={isChanged(product.id) ? 'warning' : row.assigned ? 'good' : ''}>{isChanged(product.id) ? 'Unsaved' : row.assigned ? 'Assigned' : 'Available'}</Status></div><div className="inventory-policy-fields"><label>Stock policy<select disabled={!row.assigned} value={row.stockPolicy} onChange={(event) => updateDraft(product.id, { stockPolicy: event.target.value, targetMode: event.target.value === 'operating_reserve' ? (row.targetMode || 'derived_multiplier') : '' })}>{STOCK_POLICY_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>{row.stockPolicy === 'exact_par' && <><label>Target quantity<input type="number" min="0" step="any" disabled={!row.assigned} value={row.parQuantity} onChange={(event) => updateDraft(product.id, { parQuantity: event.target.value })} /></label>{selectedLocation?.locationType === 'fridge' && <label className="inventory-danger-option"><input type="checkbox" disabled={!row.assigned} checked={row.contributesToStorageTarget === true} onChange={(event) => updateDraft(product.id, { contributesToStorageTarget: event.target.checked })} /><span>Include this refrigerator target in Main Storage</span></label>}</>}{row.stockPolicy === 'physical_count_only' && <><div className="inventory-policy-result"><span>No automatic target</span><strong>Must be physically counted; bulk actions cannot verify it.</strong></div><label>Previous count suggestion<input type="number" min="0" step="any" disabled={!row.assigned} placeholder="Optional bottle-equivalent" value={row.historicalSuggestionQuantity} onChange={(event) => updateDraft(product.id, { historicalSuggestionQuantity: event.target.value })} /></label><label>Suggestion source<input disabled={!row.assigned} placeholder="e.g. June 2026 Stock Count" value={row.historicalSuggestionSource} onChange={(event) => updateDraft(product.id, { historicalSuggestionSource: event.target.value })} /></label><label className="inventory-wide">Suggestion note<textarea rows="2" disabled={!row.assigned} value={row.historicalSuggestionNote} onChange={(event) => updateDraft(product.id, { historicalSuggestionNote: event.target.value })} /></label></>}{row.stockPolicy === 'operating_reserve' && <><label>Target mode<select disabled={!row.assigned} value={row.targetMode} onChange={(event) => updateDraft(product.id, { targetMode: event.target.value })}><option value="derived_multiplier">Derived from qualifying refrigerator targets</option><option value="fixed_quantity">Fixed quantity</option></select></label>{row.targetMode === 'derived_multiplier' ? <div className="inventory-policy-result"><span>Qualifying refrigerator targets: {quantity(target.serviceTargetBasis)}</span><strong>{quantity(target.serviceTargetBasis)} × {quantity(storageSettings?.targetMultiplier ?? 3)} = {quantity(target.effectiveTarget)}</strong></div> : <label>Target quantity<input type="number" min="0" step="any" disabled={!row.assigned} value={row.parQuantity} onChange={(event) => updateDraft(product.id, { parQuantity: event.target.value })} /></label>}</>}{row.stockPolicy === 'protected_event_reserve' && <><label>Case size<input type="number" min="0.01" step="any" disabled={!row.assigned} value={row.caseSize} onChange={(event) => updateDraft(product.id, { caseSize: event.target.value })} /></label><label>Target cases<input type="number" min="0" step="1" disabled={!row.assigned} value={row.targetCases} onChange={(event) => updateDraft(product.id, { targetCases: event.target.value })} /></label><label>Loose target<input type="number" min="0" step="any" disabled={!row.assigned} value={row.targetLooseQuantity} onChange={(event) => updateDraft(product.id, { targetLooseQuantity: event.target.value })} /></label><div className="inventory-policy-result protected"><span>Protected event reserve · not for daily restocking</span><strong>Target: {quantity(target.effectiveTarget)} units</strong></div></>}{row.stockPolicy === 'verify_unchanged' && <><label>Physical recount interval (days)<input type="number" min="1" step="1" disabled={!row.assigned} value={row.physicalRecountIntervalDays} onChange={(event) => updateDraft(product.id, { physicalRecountIntervalDays: event.target.value })} /></label><div className="inventory-policy-result"><span>Shopbox is not integrated.</span><strong>Unchanged confirmation is a manager attestation, not automatic movement validation.</strong></div></>}<label>Count order<input type="number" min="0" step="1" disabled={!row.assigned} value={row.countOrder} onChange={(event) => updateDraft(product.id, { countOrder: event.target.value })} /></label></div></article>;
  };
  const exportStandards = () => downloadCsv('mesh-inventory-standards.csv', makeCsv(['Location', 'Product', 'Product ID', 'SKU', 'Stock policy', 'Target mode', 'Configured target', 'Storage source', 'Historical suggestion', 'Suggestion source', 'Case size', 'Target cases', 'Loose target', 'Recount interval', 'Count order'], standards.map((item) => { const product = products.find((candidate) => candidate.id === item.productId); return [contextualLocationName(locations.find((location) => location.id === item.locationId), locations), product?.name || '', item.productId, product?.sku || '', item.stockPolicy, item.targetMode, item.parQuantity, item.contributesToStorageTarget, item.historicalSuggestionQuantity, item.historicalSuggestionSource, item.caseSize, item.targetCases, item.targetLooseQuantity, item.physicalRecountIntervalDays, item.countOrder]; })));
  return (
    <section className="inventory-panel">
      <div className="inventory-panel-heading"><div><p className="eyebrow">Location-first setup</p><h2>Location standards</h2></div><button type="button" className="secondary-button" onClick={exportStandards}>Export CSV</button></div>
      <div className="inventory-storage-setting"><label>Organization Main Storage multiplier<input type="number" min="0.01" max="100" step="any" value={storageMultiplier} onChange={(event) => setStorageMultiplier(event.target.value)} /></label><button type="button" className="secondary-button" disabled={multiplierBusy || !Number.isFinite(Number(storageMultiplier)) || Number(storageMultiplier) <= 0 || Number(storageMultiplier) > 100 || Number(storageMultiplier) === Number(storageSettings?.targetMultiplier ?? 3)} onClick={async () => { if (!(await requestWriteAccess())) return; setMultiplierBusy(true); const result = await setInventoryStorageMultiplier(Number(storageMultiplier)); setMultiplierBusy(false); setStatus(result); if (result.ok) await refresh(true); }}>{multiplierBusy ? 'Saving…' : 'Save multiplier'}</button><p className="muted">Applied only to future derived Main Storage snapshots. Physical counts are never used in the calculation.</p></div>
      <div className="inventory-standards-toolbar"><label>1. Choose location<GroupedLocationSelect locations={activeLocations} value={locationId} onChange={(event) => setLocationId(event.target.value)} preferPhysical label="Choose counting location" /></label><label>2. Search active products<input type="search" placeholder="Name, SKU or category" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
      <p className="muted">Physical counting locations are listed first and selected by default. Suggested policies are shown for new assignments but nothing is saved until you choose products and press Save.</p>
      {selectedLocation?.code === 'BEVERAGE_STORAGE_EVENT_RESERVE' && <p className="inventory-protected-note"><strong>Protected event reserve</strong><span>Keep physically separate from Main beverage stock. This phase records readiness but creates no transfer.</span></p>}
      {locationId ? <><div className="inventory-standard-list">{activeProducts.map((product) => renderRow(product))}</div>{!activeProducts.length && <p className="muted">No active products match this search.</p>}{archivedProducts.length > 0 && <details className="inventory-archived-standards"><summary>Archived products with active standards ({archivedProducts.length})</summary><p className="muted">Uncheck an archived product to archive its location standard without deleting history.</p><div className="inventory-standard-list">{archivedProducts.map((product) => renderRow(product, true))}</div></details>}<div className="inventory-standards-save"><span>{changedProducts.length} changed product{changedProducts.length === 1 ? '' : 's'}</span><button type="button" className="primary-button" disabled={saving || !changedProducts.length || Boolean(validationError)} onClick={saveChanges}>{saving ? 'Saving standards...' : 'Save changed standards'}</button></div>{validationError && <p className="inventory-message error" role="alert">{validationError}</p>}<Message status={saveStatus} /></> : <p className="inventory-warning">Choose a location before configuring products.</p>}
      <details className="inventory-secondary-setup"><summary>Copy standards between locations</summary><div className="inventory-form-grid"><label>From<GroupedLocationSelect locations={activeLocations} value={copy.sourceLocationId} onChange={(event) => setCopy({ ...copy, sourceLocationId: event.target.value })} /></label><label>To<GroupedLocationSelect locations={activeLocations} value={copy.destinationLocationId} onChange={(event) => setCopy({ ...copy, destinationLocationId: event.target.value })} /></label></div><button type="button" className="secondary-button" disabled={!copy.sourceLocationId || !copy.destinationLocationId || copy.sourceLocationId === copy.destinationLocationId} onClick={() => run(() => copyInventoryStandards(copy))}>Copy and preserve existing</button></details>
    </section>
  );
}

function CatalogManager({ data, requestWriteAccess, refresh, setStatus }) {
  const { products, locations, standards, refrigeratorTemplates, unresolvedMappings, reserves, storageSettings } = data;
  const [view, setView] = useState('fridges');
  const run = async (operation) => { if (!(await requestWriteAccess())) return; const result = await operation(); setStatus(result); if (result.ok) await refresh(true); return result; };
  return <div className="inventory-stack"><nav className="inventory-subtabs"><button type="button" className={view === 'fridges' ? 'active' : ''} onClick={() => setView('fridges')}>Fridge defaults</button><button type="button" className={view === 'products' ? 'active' : ''} onClick={() => setView('products')}>Products</button><button type="button" className={view === 'locations' ? 'active' : ''} onClick={() => setView('locations')}>Locations</button><button type="button" className={view === 'standards' ? 'active' : ''} onClick={() => setView('standards')}>Standards</button><button type="button" className={view === 'guidance' ? 'active' : ''} onClick={() => setView('guidance')}>Reference images</button><button type="button" className={view === 'import' ? 'active' : ''} onClick={() => setView('import')}>CSV import</button></nav>{view === 'fridges' && <RefrigeratorDefaultsManager products={products} locations={locations} standards={standards} refrigeratorTemplates={refrigeratorTemplates} unresolvedMappings={unresolvedMappings} reserves={reserves} requestWriteAccess={requestWriteAccess} refresh={refresh} setStatus={setStatus} />}{view === 'products' && <ProductManager products={products} run={run} />}{view === 'locations' && <LocationManager locations={locations} requestWriteAccess={requestWriteAccess} refresh={refresh} run={run} setStatus={setStatus} />}{view === 'standards' && <StandardsManager products={products} locations={locations} standards={standards} storageSettings={storageSettings} requestWriteAccess={requestWriteAccess} refresh={refresh} run={run} setStatus={setStatus} />}{view === 'guidance' && <LocationReferenceGuidanceManager data={data} requestWriteAccess={requestWriteAccess} refresh={refresh} setStatus={setStatus} />}{view === 'import' && <CsvImport products={products} locations={locations} requestWriteAccess={requestWriteAccess} refresh={refresh} setStatus={setStatus} />}</div>;
}

function CsvImport({ products, locations, requestWriteAccess, refresh, setStatus }) {
  const [parsed, setParsed] = useState(null);
  const [mapping, setMapping] = useState({});
  const [preview, setPreview] = useState([]);
  const load = async (file) => { const next = parseInventoryCsv(await file.text()); setParsed(next); const suggested = suggestInventoryCsvMapping(next.headers); setMapping(suggested); setPreview(previewInventoryCsv({ parsed: next, mapping: suggested, products, locations })); };
  const updateMapping = (field, header) => { const next = { ...mapping, [field]: header }; setMapping(next); setPreview(previewInventoryCsv({ parsed, mapping: next, products, locations })); };
  const confirm = async () => { if (!(await requestWriteAccess())) return; const rows = preview.filter((row) => row.ready).map((row) => row.values); const result = await importInventoryCatalog({ rows, overwriteStandards: false }); setStatus(result.ok ? { ...result, message: `Imported ${result.data?.rows || rows.length} validated row(s). Existing standards were preserved.` } : result); if (result.ok) await refresh(true); };
  const fields = [['productId', 'Product ID'], ['name', 'Product name'], ['unitLabel', 'Unit'], ['sku', 'SKU'], ['barcode', 'Barcode'], ['category', 'Category'], ['location', 'Location name'], ['locationCode', 'Location code'], ['parQuantity', 'Par'], ['minimumQuantity', 'Minimum'], ['countOrder', 'Count order'], ['supplierName', 'Supplier'], ['notes', 'Notes']];
  const invalid = preview.filter((row) => !row.ready).length;
  return <section className="inventory-panel"><h2>CSV import</h2><p className="muted">Choose a UTF-8 comma or semicolon separated file. Nothing is imported until the validated preview is confirmed.</p><label>CSV file<input type="file" accept=".csv,text/csv" onChange={(event) => event.target.files?.[0] && load(event.target.files[0])} /></label>{parsed && <><h3>Column mapping</h3><div className="inventory-form-grid">{fields.map(([field, label]) => <label key={field}>{label}<select value={mapping[field] || ''} onChange={(event) => updateMapping(field, event.target.value)}><option value="">Not mapped</option>{parsed.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}</div><h3>Validation preview</h3><p>{preview.filter((row) => row.ready).length} ready · {invalid} blocked</p><div className="inventory-import-preview">{preview.slice(0, 100).map((row) => <article key={row.rowNumber} className={row.ready ? '' : 'invalid'}><strong>Row {row.rowNumber}: {row.values.name || 'Unnamed product'}</strong>{row.errors.map((error) => <span key={error} className="error-text">{error}</span>)}{row.warnings.map((warning) => <span key={warning} className="warning-text">{warning}</span>)}</article>)}</div><button type="button" className="primary-button" disabled={!preview.length || invalid > 0} onClick={confirm}>Confirm validated import</button></>}</section>;
}

function InventoryHistory({ sessions, locations, onOpenSession }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [comparison, setComparison] = useState([]);
  const approved = sessions.filter((session) => session.status === 'approved').slice(0, 2);
  useEffect(() => {
    let active = true;
    if (approved.length < 2) { setComparison([]); return () => { active = false; }; }
    Promise.all(approved.map((session) => getInventoryCountSession(session.id))).then((results) => {
      if (!active || results.some((result) => !result.ok)) return;
      const [latest, previous] = results;
      setComparison(compareInventoryApprovedLines(latest.lines, previous.lines));
    });
    return () => { active = false; };
  }, [approved.map((session) => session.id).join('|')]);
  const visible = sessions.filter((session) => {
    if (statusFilter !== 'all' && session.status !== statusFilter) return false;
    if (typeFilter !== 'all' && session.countType !== typeFilter) return false;
    if (dateFrom && session.countDate < dateFrom) return false;
    if (dateTo && session.countDate > dateTo) return false;
    return !search || `${session.title} ${session.completedByName} ${session.approvedByName}`.toLowerCase().includes(search.toLowerCase());
  });
  return <div className="inventory-stack"><section className="inventory-panel"><h2>Count history</h2><p className="muted">Historical sessions use the product labels and stocking standards captured when each count started. Approved counts are permanent; corrections appear as linked sessions.</p><div className="inventory-form-grid"><label>From<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label><label>To<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label><label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="approved">Approved</option><option value="cancelled">Cancelled</option></select></label><label>Count type<select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">All types</option>{[...new Set(sessions.map((session) => session.countType))].map((type) => <option key={type} value={type}>{type.replace('_', ' ')}</option>)}</select></label><label className="inventory-wide">Search title or completion actor<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div><div className="inventory-history-list">{visible.map((session) => <button type="button" key={session.id} onClick={() => onOpenSession(session.id)}><span><strong>{session.title}</strong><small>{session.countDate} · {inventorySessionKindLabel(session)} · {session.countType.replace('_', ' ')}{session.completedByName ? ` · completed by ${session.completedByName}` : ''}{session.finalizedWithExceptions ? ' · exceptions documented' : ''}</small></span><Status tone={session.status === 'approved' ? 'good' : ''}>{session.status}</Status></button>)}</div>{!visible.length && <p className="muted">No count sessions match these filters.</p>}</section><section className="inventory-panel"><h2>Latest approved vs previous approved</h2>{approved.length < 2 ? <p className="muted">Two approved sessions are needed for comparison.</p> : comparison.length ? <div className="inventory-comparison-list">{comparison.map((item) => <article key={`${item.locationId}-${item.productId}`}><div><strong>{item.productName}</strong><span>{item.locationName}{inventoryProductIdentityReference(item, comparison) ? ` · ${inventoryProductIdentityReference(item, comparison)}` : ''}</span></div><p>Latest {quantity(item.latestExact)} · Previous {quantity(item.previousExact)} · <strong>{Number(item.changeExact) > 0 ? '+' : ''}{quantity(item.changeExact)} {item.unitLabel}</strong></p>{item.countMode !== INVENTORY_COUNT_MODES.UNIT && <small>Latest: {inventoryStructuredComponentLabel(item.latestComponents)} · Previous: {inventoryStructuredComponentLabel(item.previousComponents)}</small>}</article>)}</div> : <p className="muted">No matching manually stored quantities were available to compare.</p>}</section></div>;
}

function AuthorizedInventoryWorkspace({ user, requestWriteAccess, onClose }) {
  const manager = canManageInventory(user);
  const coordinator = canCoordinateInventory(user);
  const organizationId = user?.organizationId || user?.organization_id || '';
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState({ products: [], locations: [], standards: [], sessions: [], refrigeratorTemplates: [], unresolvedMappings: [], reserves: [], storageSettings: null, referenceGuidance: [], counterProfiles: [], counterMemberships: [], assignments: [] });
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [sessionDetail, setSessionDetail] = useState(createInventoryHistoryDetailState);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreator, setShowCreator] = useState(false);
  const [status, setStatus] = useState(null);
  const [realtimeStatus, setRealtimeStatus] = useState({ state: 'connecting' });
  const [remoteNotice, setRemoteNotice] = useState(false);
  const mounted = useRef(true);
  const selectedSessionIdRef = useRef('');
  const sessionDetailRequestRef = useRef(0);

  const refresh = useCallback(async (includeArchived = manager) => {
    const result = await loadInventoryWorkspace({ includeArchived });
    if (!mounted.current) return result;
    if (result.ok) {
      setData(result);
      const open = result.sessions.find((session) => isInventorySessionActive(session.status));
      if (!selectedSessionIdRef.current && open) {
        selectedSessionIdRef.current = open.id;
        setSessionDetail((current) => selectInventoryHistoryDetail(current, open.id));
        setSelectedSessionId(open.id);
      }
      setStatus(null);
    } else setStatus(result);
    setLoading(false);
    return result;
  }, [manager]);

  const refreshSession = useCallback(async (requestedSessionId = selectedSessionIdRef.current) => {
    const id = requestedSessionId;
    if (!id) return null;
    const requestId = ++sessionDetailRequestRef.current;
    setSessionDetail((current) => beginInventoryHistoryDetailRequest(current, id, requestId));
    const result = await getInventoryCountSession(id);
    if (mounted.current) {
      setSessionDetail((current) => settleInventoryHistoryDetailRequest(current, {
        selectedSessionId: selectedSessionIdRef.current,
        requestedSessionId: id,
        requestId,
        result,
      }));
      if (!result.ok && selectedSessionIdRef.current === id) setStatus(result);
    }
    return result;
  }, []);

  useEffect(() => {
    selectedSessionIdRef.current = selectedSessionId;
    if (selectedSessionId) refreshSession(selectedSessionId);
  }, [selectedSessionId, refreshSession]);
  useEffect(() => { mounted.current = true; refresh(); return () => { mounted.current = false; }; }, [refresh]);
  useEffect(() => {
    const subscription = subscribeToInventoryRealtime({ organizationId, sessionId: selectedSessionId, enabled: Boolean(organizationId), onStatus: setRealtimeStatus, onRefresh: () => setRemoteNotice(true) });
    const timer = window.setInterval(() => { if (selectedSessionIdRef.current) setRemoteNotice(true); else refresh(); }, 30000);
    return () => { subscription.unsubscribe(); window.clearInterval(timer); };
  }, [organizationId, selectedSessionId, refresh]);

  const listedActiveSession = data.sessions.find((session) => isInventorySessionActive(session.status)) || null;
  const activeSession = sessionDetail.record?.id === listedActiveSession?.id ? sessionDetail.record : listedActiveSession;
  const selectedDetail = inventoryHistoryDetailView(sessionDetail, selectedSessionId);
  const selectedSession = selectedDetail.record
    || data.sessions.find((session) => session.id === selectedSessionId)
    || activeSession;
  const selectedLines = selectedDetail.state === 'ready' ? selectedDetail.lines : [];
  const openSession = (id) => {
    selectedSessionIdRef.current = id;
    setSessionDetail((current) => selectInventoryHistoryDetail(current, id));
    setSelectedSessionId(id);
    setTab('count');
  };
  const create = async (draft) => {
    if (!(await requestWriteAccess())) return;
    setCreating(true);
    const result = await createInventoryCountSession(draft);
    setCreating(false);
    if (!result.ok) { setStatus(result); return; }
    const id = result.data?.session?.id;
    setStatus({ ok: true, message: `Stock count started with ${result.data?.summary?.lineCount || 0} product lines.` });
    setShowCreator(false);
    await refresh();
    if (id) openSession(id);
  };
  if (loading) return <main className="page inventory-workspace" role="status" aria-live="polite" aria-busy="true"><section className="inventory-panel"><p>Loading inventory and stocktaking...</p></section></main>;
  return (
    <main className="page inventory-workspace">
      <header className="inventory-topbar"><button type="button" className="secondary-button" onClick={onClose}>Back</button><div><p className="eyebrow">Mesh Youngstorget</p><h1>Stock Count</h1></div><Status tone={realtimeStatus.state === 'connected' ? 'good' : ''}>{realtimeStatus.state === 'connected' ? 'Live' : 'Polling backup'}</Status></header>
      <nav className="inventory-main-tabs" aria-label="Inventory views"><button type="button" className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Overview</button><button type="button" className={tab === 'count' ? 'active' : ''} onClick={() => setTab('count')}>Count</button>{manager && <button type="button" className={tab === 'assignments' ? 'active' : ''} onClick={() => setTab('assignments')}>Assignments</button>}<button type="button" className={tab === 'restock' ? 'active' : ''} onClick={() => setTab('restock')}>Restock</button>{coordinator && <button type="button" className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>History</button>}{manager && <button type="button" className={tab === 'manage' ? 'active' : ''} onClick={() => setTab('manage')}>Manage</button>}</nav>
      <Message status={status} />
      {status?.ok === false && <button type="button" className="secondary-button inventory-retry-button" onClick={() => refresh()}>Retry inventory refresh</button>}
      {showCreator ? <SessionCreator products={data.products} locations={data.locations} standards={data.standards} storageSettings={data.storageSettings} onCancel={() => setShowCreator(false)} onCreate={create} busy={creating} /> : tab === 'overview' ? <InventoryOverview sessions={data.sessions} activeSession={activeSession} lines={activeSession?.id === selectedSession?.id ? selectedLines : []} locations={data.locations} onOpenSession={openSession} onStart={() => setShowCreator(true)} canCoordinate={coordinator} /> : tab === 'count' ? selectedDetail.state === 'loading' ? <section className="inventory-panel inventory-empty" role="status" aria-live="polite" aria-busy="true"><h2>Loading Stock Count detail...</h2><p className="muted">Loading the session and its snapshotted product lines together.</p></section> : selectedDetail.state === 'error' ? <section className="inventory-panel inventory-empty" role="alert"><h2>Stock Count detail unavailable</h2><p className="muted">{selectedDetail.error}</p><button type="button" className="secondary-button" onClick={() => refreshSession(selectedSessionId)}>Retry session detail</button></section> : selectedDetail.record ? <CountSession session={selectedDetail.record} sessions={data.sessions} lines={selectedDetail.lines} locations={data.locations} referenceGuidance={data.referenceGuidance || []} canManage={manager} canCoordinate={coordinator} requestWriteAccess={requestWriteAccess} onRefresh={async () => { const sessionResult = await refreshSession(); const workspaceResult = await refresh(); return sessionResult?.ok === false ? sessionResult : workspaceResult?.ok === false ? workspaceResult : { ok: true }; }} onOpenSession={openSession} onBack={() => setTab('overview')} setStatus={setStatus} remoteNotice={remoteNotice} clearRemoteNotice={() => setRemoteNotice(false)} /> : <section className="inventory-panel inventory-empty"><h2>No active stock count</h2>{coordinator && <button type="button" className="primary-button" onClick={() => setShowCreator(true)}>Start stock count</button>}</section> : tab === 'assignments' ? <CounterAssignmentManager data={data} activeSession={activeSession} lines={activeSession?.id === selectedSession?.id ? selectedLines : []} requestWriteAccess={requestWriteAccess} refresh={async () => { await refreshSession(); await refresh(); }} setStatus={setStatus} /> : tab === 'restock' ? <RestockView session={selectedSession} lines={selectedLines} /> : tab === 'history' ? <InventoryHistory sessions={data.sessions} locations={data.locations} onOpenSession={openSession} /> : <CatalogManager data={data} requestWriteAccess={requestWriteAccess} refresh={refresh} setStatus={setStatus} />}
      {data.refreshedAt && <p className="inventory-last-refresh">Last successful refresh: {formatDateTime(data.refreshedAt)}</p>}
    </main>
  );
}

export default function InventoryWorkspace(props) {
  if (isInventoryCounter(props.user)) {
    return <CounterInventoryWorkspace requestWriteAccess={props.requestWriteAccess} onClose={props.onClose} />;
  }
  if (!canUseInventory(props.user)) {
    return (
      <main className="page inventory-workspace">
        <section className="inventory-panel inventory-empty" role="alert">
          <p className="eyebrow">Stock Count</p>
          <h1>Stock Count access required</h1>
          <p className="muted">Stock Count requires an active manager or counter profile signed in with Supabase Email Auth. Staff-code, event-floor and shared-device sessions cannot access this workspace.</p>
          <button type="button" className="primary-button" onClick={props.onClose}>Back</button>
        </section>
      </main>
    );
  }
  return <AuthorizedInventoryWorkspace {...props} />;
}
