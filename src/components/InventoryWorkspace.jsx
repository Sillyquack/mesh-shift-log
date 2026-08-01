import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildInventoryRestockList,
  buildProtectedEventReserveList,
  calculateInventoryLine,
  calculateStandardPolicyTarget,
  inventoryStatusLabel,
  sortInventorySessionLines,
  summarizeInventoryLocation,
  summarizeInventorySession,
} from '../data/inventoryCalculations.js';
import {
  downloadCsv,
  makeCsv,
  parseInventoryCsv,
  previewInventoryCsv,
  suggestInventoryCsvMapping,
} from '../data/inventoryCsv.js';
import {
  approveInventoryCountSession,
  cancelInventoryCountSession,
  clearInventoryCountLine,
  completeInventoryCountLocation,
  completeInventoryCountSession,
  confirmInventoryCountLineUnchanged,
  copyInventoryStandards,
  createInventoryCountSession,
  getInventoryCountSession,
  importInventoryCatalog,
  loadInventoryWorkspace,
  markInventoryCountLineUsePar,
  markInventoryLocationUsePar,
  reopenInventoryCountSession,
  saveInventoryLocation,
  saveInventoryProduct,
  saveInventoryStandardsBulk,
  setInventoryCountLineCaseQuantity,
  setInventoryCountLineQuantity,
  setupMeshYoungstorgetInventoryLocations,
  skipInventoryCountLine,
} from '../lib/inventoryClient.js';
import { subscribeToInventoryRealtime } from '../lib/inventoryRealtime.js';
import { canCoordinateInventory, canManageInventory, isSharedDeviceUser } from '../lib/permissions.js';

const EMPTY_PRODUCT = { name: '', sku: '', barcode: '', category: 'Other', unitLabel: 'piece', supplierName: '', notes: '', active: true, sortOrder: 0 };
const EMPTY_LOCATION = { name: '', code: '', locationType: 'storage', parentLocationId: '', zone: '', description: '', active: true, sortOrder: 0 };
const PRODUCT_CATEGORY_PRESETS = ['Beer', 'Wine', 'Sparkling wine', 'Spirits', 'Soft drinks', 'Mineral water', 'Coffee', 'Milk and alternatives', 'Snacks', 'Food', 'Consumables', 'Cleaning', 'Other'];
const YOUNGSTORGET_LOCATION_TEMPLATE = [
  { code: 'WORKBAR', name: 'Workbar', children: ['Fridge 1', 'Fridge 2', 'Fridge 3', 'Coffee station', 'Snack shelf', 'Backbar shelves'] },
  { code: 'CORNERBAR', name: 'Cornerbar', children: ['Fridge 1', 'Fridge 2', 'Backbar shelves'] },
  { code: 'STORAGE', name: 'Storage', children: ['Dry Storage', 'Main Storage'] },
  { code: 'BEVERAGE_STORAGE', name: 'Beverage Storage', children: ['Main beverage stock', 'Beer kegs', 'Cocktail ingredients', 'Event reserve', 'Dormant spirits'] },
];

const STOCK_POLICY_OPTIONS = [
  ['exact_par', 'Exact par'],
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
  if (value === null || value === undefined || value === '') return '-';
  return Number(value).toLocaleString('en-GB', { maximumFractionDigits: 3 });
}

function effectiveInventoryLocationIds(locations = [], selectedIds = []) {
  const activeLocations = locations.filter((location) => location.active !== false);
  const locationsById = new Map(activeLocations.map((location) => [location.id, location]));
  const childIdsByParent = new Map();
  activeLocations.forEach((location) => {
    if (!location.parentLocationId) return;
    const childIds = childIdsByParent.get(location.parentLocationId) || [];
    childIds.push(location.id);
    childIdsByParent.set(location.parentLocationId, childIds);
  });
  const effectiveIds = new Set();
  const includeLocation = (locationId) => {
    if (!locationsById.has(locationId) || effectiveIds.has(locationId)) return;
    effectiveIds.add(locationId);
    (childIdsByParent.get(locationId) || []).forEach(includeLocation);
  };
  selectedIds.forEach(includeLocation);
  return [...effectiveIds];
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
            <div><p className="eyebrow">Active count</p><h2>{activeSession.title}</h2><p className="muted">{activeSession.countDate}</p></div>
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
          <button type="button" className="primary-button inventory-full-button" onClick={() => onOpenSession(activeSession.id)}>Continue stock count</button>
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

function SessionCreator({ products, locations, standards, onCancel, onCreate, busy }) {
  const [draft, setDraft] = useState(() => ({ title: `Daily stock count - ${osloDate()}`, countType: 'daily', countDate: osloDate(), locationIds: locations.filter((item) => item.active).map((item) => item.id), note: '' }));
  const effectiveLocationIds = useMemo(() => effectiveInventoryLocationIds(locations, draft.locationIds), [locations, draft.locationIds]);
  const selectedStandards = standards.filter((standard) => standard.active && effectiveLocationIds.includes(standard.locationId) && products.some((product) => product.id === standard.productId && product.active));
  const inactiveProductStandards = standards.filter((standard) => standard.active && effectiveLocationIds.includes(standard.locationId) && !products.some((product) => product.id === standard.productId && product.active));
  const emptyLocations = locations.filter((location) => location.active !== false && effectiveLocationIds.includes(location.id) && !standards.some((standard) => standard.active && standard.locationId === location.id));
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
        <legend>Locations</legend>
        {groupedInventoryLocations(locations.filter((item) => item.active)).map((group) => (
          <div className="inventory-location-choice-group" key={group.key}>
            <strong>{group.label}</strong>
            {group.locations.map((location) => <label key={location.id}><input type="checkbox" checked={draft.locationIds.includes(location.id)} onChange={(event) => setDraft({ ...draft, locationIds: event.target.checked ? [...draft.locationIds, location.id] : draft.locationIds.filter((id) => id !== location.id) })} />{contextualLocationName(location, locations)}{!location.parentLocationId && group.key !== 'storage' ? ' (includes active child locations)' : ''}</label>)}
          </div>
        ))}
      </fieldset>
      <div className="inventory-preview"><strong>{effectiveLocationIds.length} locations included</strong><span>{selectedStandards.length} configured product lines</span><span>{selectedStandards.filter((item) => calculateStandardPolicyTarget(item, { standards, locations, products }).effectiveTarget > 0).length} configured targets above zero</span></div>
      {emptyLocations.length > 0 && <p className="inventory-warning">No active products: {emptyLocations.map((item) => contextualLocationName(item, locations)).join(', ')}</p>}
      {inactiveProductStandards.length > 0 && <p className="inventory-warning">{inactiveProductStandards.length} archived product configuration(s) will not be included.</p>}
      {selectedStandards.some((item) => item.stockPolicy !== 'verify_unchanged' && calculateStandardPolicyTarget(item, { standards, locations, products }).effectiveTarget === 0) && <p className="inventory-warning">Some selected products have a target of zero. Review those standards if that is not intentional.</p>}
      <button type="button" className="primary-button inventory-full-button" disabled={busy || !draft.title.trim() || !selectedStandards.length} onClick={() => onCreate(draft)}>{busy ? 'Starting count...' : 'Confirm and start count'}</button>
    </section>
  );
}

function CountLineCard({ line, draftValue, setDraftValue, caseDraft, setCaseDraft, note, setNote, action, busy, readOnly, canManage }) {
  const calculated = calculateInventoryLine(line);
  const inputId = `inventory-count-${line.id}`;
  const policyLabel = STOCK_POLICY_OPTIONS.find(([value]) => value === calculated.stockPolicy)?.[1] || 'Exact par';
  const previousPhysicalAvailable = line.previousPhysicalCountQuantity !== null && Boolean(line.previousPhysicalCountedAt);
  return (
    <article className={`inventory-line-card ${calculated.shortage ? 'shortage' : ''}`}>
      <div className="inventory-line-heading"><div><h3>{line.productName}</h3><p>{line.unitLabel} · {policyLabel}{calculated.effectiveTarget !== null ? ` · Target ${quantity(calculated.effectiveTarget)}` : ''}</p></div><Status tone={calculated.shortage ? 'warning' : calculated.counted ? 'good' : ''}>{calculated.uncounted ? 'Not counted' : calculated.confirmedUnchanged ? 'Confirmed unchanged' : calculated.acceptedAsStandard ? 'Fully stocked' : calculated.skipped ? 'Skipped' : 'Physical count'}</Status></div>
      {calculated.stockPolicy === 'operating_reserve' && line.targetMode === 'derived_multiplier' && <p className="inventory-policy-note">Service stock {quantity(line.serviceTargetBasis)} × {quantity(line.reserveMultiplier)} = reserve target {quantity(calculated.effectiveTarget)}</p>}
      {calculated.stockPolicy === 'protected_event_reserve' && <div className="inventory-protected-note"><strong>Protected event reserve</strong><span>Target: {quantity(line.targetCases)} cases × {quantity(line.caseSize)} units + {quantity(line.targetLooseQuantity)} loose = {quantity(calculated.effectiveTarget)} units.</span><span>Not for daily restocking. Count this separately from Main beverage stock.</span></div>}
      {calculated.stockPolicy === 'protected_event_reserve' ? <><div className="inventory-case-count"><label>Full cases<input type="number" min="0" step="1" inputMode="numeric" value={caseDraft.fullCases} disabled={readOnly || busy} onChange={(event) => setCaseDraft({ ...caseDraft, fullCases: event.target.value })} /></label><label>Loose units<input type="number" min="0" step="any" inputMode="decimal" value={caseDraft.looseQuantity} disabled={readOnly || busy} onChange={(event) => setCaseDraft({ ...caseDraft, looseQuantity: event.target.value })} /></label><div><span>Calculated total</span><strong>{quantity((Number(caseDraft.fullCases) || 0) * (line.caseSize || 0) + (Number(caseDraft.looseQuantity) || 0))}</strong></div></div><button type="button" className="primary-button inventory-full-button" disabled={readOnly || busy || caseDraft.fullCases === '' || Number(caseDraft.fullCases) < 0 || Number(caseDraft.looseQuantity || 0) < 0} onClick={() => action('case-save')}>Save case count</button><details><summary>Count total units instead</summary><label htmlFor={inputId}>Physical total units</label><div className="inventory-quantity-row"><input id={inputId} type="number" min="0" step="any" inputMode="decimal" value={draftValue} disabled={readOnly || busy} onChange={(event) => setDraftValue(event.target.value)} /><button type="button" className="secondary-button" disabled={readOnly || busy || draftValue === '' || Number(draftValue) < 0} onClick={() => action('save')}>Save total</button></div></details></> : <><label htmlFor={inputId}>Physical counted quantity</label><div className="inventory-quantity-row"><input id={inputId} type="number" min="0" step="any" inputMode="decimal" value={draftValue} disabled={readOnly || busy} onChange={(event) => setDraftValue(event.target.value)} /><button type="button" className="primary-button" disabled={readOnly || busy || draftValue === '' || Number(draftValue) < 0} onClick={() => action('save')}>Save physical count</button></div></>}
      {!calculated.uncounted && !calculated.skipped && calculated.stockPolicy !== 'verify_unchanged' && <p className={calculated.shortage ? 'inventory-variance shortage-text' : 'inventory-variance'}>{calculated.stockPolicy === 'protected_event_reserve' ? `${line.countFullCases == null ? 'Physical total count' : `${quantity(line.countFullCases)} / ${quantity(line.targetCases)} cases · ${quantity(line.countLooseQuantity)} loose`} · ${quantity(calculated.countedQuantity)} / ${quantity(calculated.effectiveTarget)} units · ${calculated.readinessPercent}% ready${calculated.shortage ? ` · ${quantity(calculated.restockQuantity)} short` : ''}` : calculated.varianceQuantity < 0 ? `${calculated.stockPolicy === 'operating_reserve' ? 'Reserve gap' : 'Restock required'}: ${quantity(calculated.restockQuantity)}` : calculated.varianceQuantity > 0 ? `Above target by ${quantity(calculated.varianceQuantity)}` : 'At target'}</p>}
      {calculated.stockPolicy === 'verify_unchanged' && <div className="inventory-dormant-check"><strong>{calculated.currentPhysicalCount ? 'Physical count recorded for this session' : calculated.skipped ? 'Clear this line before confirming unchanged' : calculated.physicalRecountDue ? 'Physical recount required' : calculated.confirmedUnchanged ? 'Previous physical quantity confirmed unchanged' : 'Unchanged confirmation available'}</strong>{calculated.currentPhysicalCount ? <span>Current physical count: {quantity(calculated.countedQuantity)}{line.countedAt ? ` on ${formatDateTime(line.countedAt)}` : ''}</span> : previousPhysicalAvailable ? <span>Last physically counted: {quantity(line.previousPhysicalCountQuantity)} on {formatDateTime(line.previousPhysicalCountedAt)}</span> : <span>No previous finalized physical count is available.</span>}<p>Shopbox movement validation is not connected. Confirmation is a manager attestation that no movement is known, not an automatic stock check.</p>{calculated.pristineForUnchanged && <button type="button" className="secondary-button" disabled={readOnly || busy || !canManage || calculated.physicalRecountDue || !previousPhysicalAvailable} onClick={() => action('unchanged')}>Confirm unchanged</button>}</div>}
      <details><summary>Add or edit note</summary><label htmlFor={`${inputId}-note`}>Count note</label><textarea id={`${inputId}-note`} rows="2" value={note} disabled={readOnly || busy} onChange={(event) => setNote(event.target.value)} /></details>
      <div className="inventory-line-actions">{calculated.stockPolicy === 'exact_par' && <button type="button" className="secondary-button" disabled={readOnly || busy} onClick={() => action('par')}>Mark fully stocked</button>}<button type="button" className="secondary-button" disabled={readOnly || busy} onClick={() => action('clear')}>Clear</button><button type="button" className="text-button" disabled={readOnly || busy || !note.trim()} onClick={() => action('skip')}>Skip with note</button></div>
      {line.countedByName && <p className="inventory-audit">Recorded by {line.countedByName}{line.countedAt ? ` · ${formatDateTime(line.countedAt)}` : ''}</p>}
    </article>
  );
}

function CountSession({ session, lines, locations, actorName, canManage, canCoordinate, requestWriteAccess, onRefresh, onBack, setStatus, remoteNotice, clearRemoteNotice }) {
  const [locationId, setLocationId] = useState(lines[0]?.locationId || '');
  const [drafts, setDrafts] = useState({});
  const [caseDrafts, setCaseDrafts] = useState({});
  const [notes, setNotes] = useState({});
  const [busyId, setBusyId] = useState('');
  const [bulkReview, setBulkReview] = useState(null);
  const [completionNote, setCompletionNote] = useState('');
  const [reason, setReason] = useState('');
  const orderedLines = useMemo(() => sortInventorySessionLines(lines), [lines]);
  const locationIds = [...new Set(orderedLines.map((line) => line.locationId))];
  const completionMap = session.metadata?.locationCompletions || {};
  const sessionSummary = summarizeInventorySession(lines, locations, completionMap);
  const locationLines = orderedLines.filter((line) => line.locationId === locationId);
  const locationSummary = summarizeInventoryLocation(locationLines, completionMap[locationId]);
  const exactUncounted = locationLines.filter((line) => line.stockPolicy === 'exact_par' && calculateInventoryLine(line).uncounted).length;
  const currentLocation = locations.find((item) => item.id === locationId) || { name: locationLines[0]?.locationName || 'Location' };
  const currentLocationLabel = contextualLocationName(currentLocation, locations);
  const readOnly = !['draft', 'in_progress'].includes(session.status);
  const isDirty = Object.keys(drafts).some((id) => drafts[id] !== String(lines.find((line) => line.id === id)?.countedQuantity ?? '')) || Object.keys(caseDrafts).length > 0 || Object.keys(notes).some((id) => notes[id] !== (lines.find((line) => line.id === id)?.note || ''));

  const runWrite = async (id, operation) => {
    if (!(await requestWriteAccess())) return;
    setBusyId(id);
    const result = await operation();
    setBusyId('');
    setStatus(result);
    if (result.ok) { setDrafts({}); setCaseDrafts({}); setNotes({}); await onRefresh(); }
  };
  const lineAction = (line, kind) => {
    const common = { lineId: line.id, actorName, expectedUpdatedAt: line.updatedAt };
    if (kind === 'save') return runWrite(line.id, () => setInventoryCountLineQuantity({ ...common, countedQuantity: Number(drafts[line.id] ?? line.countedQuantity), note: notes[line.id] ?? line.note }));
    if (kind === 'case-save') { const caseDraft = caseDrafts[line.id] || {}; return runWrite(line.id, () => setInventoryCountLineCaseQuantity({ ...common, fullCases: Number(caseDraft.fullCases ?? line.countFullCases ?? 0), looseQuantity: Number(caseDraft.looseQuantity ?? line.countLooseQuantity ?? 0), note: notes[line.id] ?? line.note })); }
    if (kind === 'unchanged') return runWrite(line.id, () => confirmInventoryCountLineUnchanged(common));
    if (kind === 'par') return runWrite(line.id, () => markInventoryCountLineUsePar({ ...common, note: notes[line.id] ?? line.note }));
    if (kind === 'clear') return runWrite(line.id, () => clearInventoryCountLine(common));
    return runWrite(line.id, () => skipInventoryCountLine({ ...common, note: notes[line.id] ?? line.note }));
  };
  const exportSession = () => downloadCsv(`mesh-stock-count-${session.countDate}.csv`, makeCsv(['Date', 'Session', 'Status', 'Location', 'Product', 'Unit', 'Stock policy', 'Target', 'Counted', 'Gap', 'Count method', 'Note', 'Counted by', 'Counted at'], orderedLines.map((line) => { const calculated = calculateInventoryLine(line); return [session.countDate, session.title, session.status, line.locationName, line.productName, line.unitLabel, line.stockPolicy, calculated.effectiveTarget, line.countedQuantity, calculated.restockQuantity, line.countMethod, line.note, line.countedByName, line.countedAt]; })));
  return (
    <div className="inventory-stack">
      <section className="inventory-session-header">
        <button type="button" className="secondary-button" onClick={onBack}>Back to overview</button>
        <div><p className="eyebrow">{session.countDate}</p><h2>{session.title}</h2><p>{sessionSummary.counted} of {sessionSummary.total} recorded · {sessionSummary.shortages} shortages</p></div>
        <Status tone={session.status === 'approved' ? 'good' : 'active'}>{session.status}</Status>
      </section>
      {remoteNotice && <div className="inventory-remote-notice" role="status"><span>{isDirty ? 'Stock count changed elsewhere. Your unsaved entry is preserved.' : 'Stock count changed elsewhere.'}</span><button type="button" className="secondary-button" onClick={() => { clearRemoteNotice(); if (!isDirty) onRefresh(); }}>Review</button></div>}
      <nav className="inventory-location-tabs" aria-label="Count locations">{locationIds.map((id) => { const location = locations.find((item) => item.id === id); const summary = summarizeInventoryLocation(lines.filter((line) => line.locationId === id), completionMap[id]); return <button type="button" key={id} className={id === locationId ? 'active' : ''} onClick={() => setLocationId(id)}><span>{location ? contextualLocationName(location, locations) : lines.find((line) => line.locationId === id)?.locationName}</span><small>{summary.counted}/{summary.total} · {inventoryStatusLabel(summary.status)}</small></button>; })}</nav>
      <section className="inventory-location-header">
        <div><h2>{currentLocationLabel}</h2><p>{locationSummary.counted} of {locationSummary.total} recorded · {locationSummary.shortages} policy gaps</p></div>
        <div className="inventory-location-controls"><button type="button" className="secondary-button" disabled={readOnly || !exactUncounted} onClick={() => setBulkReview({ replace: false })}>Mark exact-par lines fully stocked</button><button type="button" className="primary-button" disabled={readOnly || locationSummary.uncounted > 0 || locationSummary.needsReview > 0} onClick={() => runWrite(`complete-${locationId}`, () => completeInventoryCountLocation({ sessionId: session.id, locationId, actorName }))}>{completionMap[locationId] ? 'Location complete' : 'Complete location'}</button></div>
      </section>
      <div className="inventory-line-list">{locationLines.map((line) => <CountLineCard key={line.id} line={line} draftValue={drafts[line.id] ?? (line.countedQuantity ?? '')} setDraftValue={(value) => setDrafts((current) => ({ ...current, [line.id]: value }))} caseDraft={caseDrafts[line.id] || { fullCases: line.countFullCases ?? '', looseQuantity: line.countLooseQuantity ?? 0 }} setCaseDraft={(value) => setCaseDrafts((current) => ({ ...current, [line.id]: value }))} note={notes[line.id] ?? line.note} setNote={(value) => setNotes((current) => ({ ...current, [line.id]: value }))} action={(kind) => lineAction(line, kind)} busy={busyId === line.id} readOnly={readOnly} canManage={canManage} />)}</div>
      <section className="inventory-panel inventory-session-actions">
        <h2>Session actions</h2>
        <div className="inventory-summary-grid"><div><strong>{sessionSummary.completedLocations}/{sessionSummary.locations}</strong><span>locations complete</span></div><div><strong>{sessionSummary.uncounted}</strong><span>uncounted</span></div><div><strong>{sessionSummary.skipped}</strong><span>skipped</span></div><div><strong>{sessionSummary.needsReview}</strong><span>needs review</span></div></div>
        <label>Review note<textarea rows="2" value={completionNote} onChange={(event) => setCompletionNote(event.target.value)} /></label>
        <div className="inventory-action-row"><button type="button" className="secondary-button" onClick={exportSession}>Export session CSV</button>{canCoordinate && readOnly === false && <button type="button" className="primary-button" onClick={() => runWrite('complete-session', () => completeInventoryCountSession({ sessionId: session.id, note: completionNote, allowExceptions: Boolean(completionNote.trim()), actorName }))}>Complete session</button>}{canManage && session.status === 'completed' && <button type="button" className="primary-button" onClick={() => runWrite('approve', () => approveInventoryCountSession({ sessionId: session.id, note: completionNote }))}>Approve stock count</button>}</div>
        {canManage && ['completed', 'approved'].includes(session.status) && <div className="inventory-reopen"><label>Reason for reopening<input value={reason} onChange={(event) => setReason(event.target.value)} /></label><button type="button" className="secondary-button" disabled={!reason.trim()} onClick={() => runWrite('reopen', () => reopenInventoryCountSession({ sessionId: session.id, reason }))}>Reopen count</button></div>}
        {canManage && !['approved', 'cancelled'].includes(session.status) && <button type="button" className="text-button danger-text" disabled={!reason.trim()} onClick={() => runWrite('cancel', () => cancelInventoryCountSession({ sessionId: session.id, reason }))}>Cancel session using reason above</button>}
      </section>
      {bulkReview && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="inventory-bulk-title"><section className="pilot-modal inventory-modal"><h2 id="inventory-bulk-title">{currentLocationLabel}</h2>{bulkReview.replace ? <><p>All non-skipped exact-par lines that differ from the fully stocked target will be replaced.</p><p>Manual, imported and adjusted exact-par counts may be replaced.</p><p>Protected event reserve, operating reserve, dormant stock and skipped lines remain unchanged.</p><p><strong>This is a manager-only action.</strong></p></> : <><p>{exactUncounted} uncounted exact-par lines will be marked fully stocked.</p><p>This is an explicit stocking attestation, not a physical count.</p><p>Other policies and existing counts remain unchanged.</p></>}{canManage && <label className="inventory-danger-option"><input type="checkbox" checked={bulkReview.replace} onChange={(event) => setBulkReview({ replace: event.target.checked })} />Replace existing exact-par counts (manager only)</label>}<div className="inventory-action-row"><button type="button" className="secondary-button" onClick={() => setBulkReview(null)}>Cancel</button><button type="button" className="primary-button" onClick={() => { const replace = bulkReview.replace; setBulkReview(null); runWrite('bulk', () => markInventoryLocationUsePar({ sessionId: session.id, locationId, replaceExisting: replace, actorName })); }}>{bulkReview.replace ? 'Replace with fully stocked' : 'Mark fully stocked'}</button></div></section></div>}
    </div>
  );
}

function RestockView({ session, lines }) {
  const restock = buildInventoryRestockList(lines);
  const eventReserve = buildProtectedEventReserveList(lines);
  const exportRestock = () => downloadCsv(`mesh-restock-${session?.countDate || osloDate()}.csv`, makeCsv(['Product', 'Unit', 'Location', 'Missing quantity', 'Category'], restock.flatMap((product) => product.locations.map((location) => [product.productName, product.unitLabel, location.locationName, location.missingQuantity, product.category]))));
  return <div className="inventory-stack"><section className="inventory-panel"><div className="inventory-panel-heading"><div><p className="eyebrow">Daily and operating stock</p><h2>Restock list</h2></div><button type="button" className="secondary-button" disabled={!restock.length} onClick={exportRestock}>Export CSV</button></div><p className="muted">Exact-par shortages and operating-reserve gaps only. This is not a transfer order and does not claim storage stock is available.</p>{restock.length ? restock.map((product) => <article className="inventory-restock-card" key={`${product.productName}-${product.unitLabel}`}><h3>{product.productName}</h3><p><strong>Total gap: {quantity(product.totalMissing)} {product.unitLabel}</strong></p>{product.locations.map((location) => <p key={location.locationName}>{location.locationName}: {quantity(location.missingQuantity)}</p>)}</article>) : <p>No daily or operating-reserve requirements in the selected session.</p>}</section>{eventReserve.length > 0 && <section className="inventory-panel"><div><p className="eyebrow">Protected stock</p><h2>Event reserve readiness</h2></div><p className="inventory-protected-note"><strong>Not for daily restocking</strong><span>Event reserve remains separate from Main beverage stock. No transfer is created here.</span></p>{eventReserve.map((item) => <article className="inventory-restock-card" key={item.id}><h3>{item.productName}</h3><p><strong>{item.readinessPercent ?? 0}% ready</strong></p><p>{item.countFullCases ?? '-'} / {item.targetCases ?? '-'} cases · {quantity(item.actualUnits)} / {quantity(item.targetUnits)} units</p><p>{quantity(item.shortageUnits)} units short</p></article>)}</section>}</div>;
}

function ProductManager({ products, run }) {
  const [product, setProduct] = useState(EMPTY_PRODUCT);
  const [search, setSearch] = useState('');
  const visibleProducts = products.filter((item) => !search || `${item.name} ${item.sku} ${item.category}`.toLowerCase().includes(search.toLowerCase()));
  const duplicateProductName = product.name.trim() && products.find((item) => item.id !== product.id && item.name.trim().toLowerCase() === product.name.trim().toLowerCase());
  const exportCatalog = () => downloadCsv('mesh-inventory-products.csv', makeCsv(['Product name', 'SKU', 'Category', 'Unit', 'Active', 'Supplier'], products.map((item) => [item.name, item.sku, item.category, item.unitLabel, item.active ? 'yes' : 'no', item.supplierName])));
  return (
    <section className="inventory-panel">
      <div className="inventory-panel-heading"><h2>Products</h2><button type="button" className="secondary-button" onClick={exportCatalog}>Export CSV</button></div>
      <label>Search products<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <div className="inventory-form-grid">
        <label>Name<input value={product.name} onChange={(event) => setProduct({ ...product, name: event.target.value })} /></label>
        <label>Unit<input value={product.unitLabel} onChange={(event) => setProduct({ ...product, unitLabel: event.target.value })} /></label>
        <label>Category<input list="inventory-product-categories" value={product.category} onChange={(event) => setProduct({ ...product, category: event.target.value })} /><datalist id="inventory-product-categories">{PRODUCT_CATEGORY_PRESETS.map((category) => <option key={category} value={category} />)}</datalist></label>
        <label>SKU<input value={product.sku} onChange={(event) => setProduct({ ...product, sku: event.target.value })} /></label>
      </div>
      <p className="muted">Choose a preset or type a custom category. Categories describe products; they are not count locations.</p>
      {duplicateProductName && <p className="inventory-warning">A product named {duplicateProductName.name} already exists. Duplicate names are allowed, but SKU or barcode should distinguish them.</p>}
      <button type="button" className="primary-button" disabled={!product.name.trim() || !product.unitLabel.trim()} onClick={() => run(() => saveInventoryProduct(product))}>{product.id ? 'Save product' : 'Add product'}</button>
      <div className="inventory-config-list">{visibleProducts.map((item) => <article key={item.id}><div><strong>{item.name}</strong><span>{item.category || 'Other'} · {item.unitLabel}{!item.active ? ' · Archived' : ''}</span></div><div><button type="button" className="secondary-button" onClick={() => setProduct(item)}>Edit</button><button type="button" className="text-button" onClick={() => run(() => saveInventoryProduct({ ...item, active: !item.active }))}>{item.active ? 'Archive' : 'Reactivate'}</button></div></article>)}</div>
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
    setStatus({ ok: true, message: `Location setup complete: ${result.data?.created || 0} created, ${result.data?.reused || 0} reused, ${result.data?.restored || 0} restored. No duplicate template locations were created.` });
    await refresh(true);
  };
  const editLocation = (item) => { setLocation(item); setCustomOpen(true); };
  return (
    <div className="inventory-stack">
      <section className="inventory-panel inventory-template-setup">
        <div><p className="eyebrow">Recommended first setup</p><h2>Mesh Youngstorget location setup</h2><p className="muted">Create or reuse the 19-location Workbar, Cornerbar, storage and Beverage Storage structure. Existing custom locations and historical counts remain untouched.</p></div>
        <div className="inventory-template-review" aria-label="Location setup review">
          {YOUNGSTORGET_LOCATION_TEMPLATE.map((group) => <div key={group.code}><strong>{group.name}</strong>{group.children.map((child) => <span key={child}>{child}</span>)}</div>)}
        </div>
        <button type="button" className="primary-button inventory-full-button" disabled={setupBusy} onClick={applyTemplate}>{setupBusy ? 'Setting up locations...' : 'Set up Mesh Youngstorget'}</button>
        {setupSummary && <div className="inventory-setup-result" role="status"><strong>Setup complete</strong><span>{setupSummary.created || 0} created</span><span>{setupSummary.reused || 0} reused</span><span>{setupSummary.restored || 0} restored</span><span>No duplicates</span></div>}
      </section>
      <section className="inventory-panel">
        <div className="inventory-panel-heading"><div><p className="eyebrow">Current structure</p><h2>Locations</h2></div><Status>{locations.filter((item) => item.active).length} active</Status></div>
        <div className="inventory-location-tree">{groups.map((group) => <section key={group.key}><h3>{group.label}</h3>{group.locations.map((item) => <article key={item.id} className={!item.active ? 'archived' : ''}><div><strong>{contextualLocationName(item, locations)}</strong><span>{item.code || 'No code'} · {item.locationType || 'location'}{!item.active ? ' · Archived' : ''}</span></div><div><button type="button" className="secondary-button" onClick={() => editLocation(item)}>Edit</button><button type="button" className="text-button" onClick={() => run(() => saveInventoryLocation({ ...item, active: !item.active }))}>{item.active ? 'Archive' : 'Reactivate'}</button></div></article>)}</section>)}</div>
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

function StandardsManager({ products, locations, standards, requestWriteAccess, refresh, run, setStatus }) {
  const activeLocations = locations.filter((item) => item.active);
  const preferredLocation = activeLocations.find((item) => item.parentLocationId) || activeLocations.find((item) => item.locationType === 'storage') || activeLocations[0];
  const [locationId, setLocationId] = useState('');
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [copy, setCopy] = useState({ sourceLocationId: '', destinationLocationId: '', overwriteExisting: false });
  useEffect(() => { if (!locationId && preferredLocation) setLocationId(preferredLocation.id); }, [locationId, preferredLocation?.id]);
  const selectedLocation = locations.find((location) => location.id === locationId);
  const suggestedPolicy = (() => {
    const code = String(selectedLocation?.code || '').toUpperCase();
    const parent = locations.find((location) => location.id === selectedLocation?.parentLocationId);
    const parentCode = String(parent?.code || '').toUpperCase();
    if (code === 'BEVERAGE_STORAGE_BOTTLES') return 'operating_reserve';
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
      reserveMultiplier: standard?.reserveMultiplier ?? 3,
      caseSize: standard?.caseSize ?? product.defaultPackSize ?? 24,
      targetCases: standard?.targetCases ?? 0,
      targetLooseQuantity: standard?.targetLooseQuantity ?? 0,
      physicalRecountIntervalDays: standard?.physicalRecountIntervalDays ?? 90,
    }];
  })), [products, standards, locationId, suggestedPolicy]);
  useEffect(() => { setDrafts(baseline); setSaveStatus(null); }, [baseline]);
  const updateDraft = (productId, patch) => setDrafts((current) => ({ ...current, [productId]: { ...current[productId], ...patch } }));
  const isChanged = (productId) => {
    const row = drafts[productId]; const original = baseline[productId];
    const fields = ['assigned', 'parQuantity', 'countOrder', 'stockPolicy', 'targetMode', 'reserveMultiplier', 'caseSize', 'targetCases', 'targetLooseQuantity', 'physicalRecountIntervalDays'];
    return Boolean(row && original && fields.some((field) => String(row[field] ?? '') !== String(original[field] ?? '')));
  };
  const changedProducts = products.filter((product) => isChanged(product.id));
  const invalidRow = changedProducts.map((product) => drafts[product.id]).find((row) => row.assigned && (
    Number(row.countOrder) < 0 || !Number.isInteger(Number(row.countOrder))
    || (['exact_par'].includes(row.stockPolicy) && (row.parQuantity === '' || Number(row.parQuantity) < 0))
    || (row.stockPolicy === 'operating_reserve' && row.targetMode === 'fixed_quantity' && (row.parQuantity === '' || Number(row.parQuantity) < 0))
    || (row.stockPolicy === 'operating_reserve' && row.targetMode === 'derived_multiplier' && Number(row.reserveMultiplier) <= 0)
    || (row.stockPolicy === 'protected_event_reserve' && (Number(row.caseSize) <= 0 || Number(row.targetCases) < 0 || !Number.isInteger(Number(row.targetCases)) || Number(row.targetLooseQuantity) < 0))
    || (row.stockPolicy === 'verify_unchanged' && (Number(row.physicalRecountIntervalDays) <= 0 || !Number.isInteger(Number(row.physicalRecountIntervalDays))))
  ));
  const validationError = invalidRow ? 'Review the highlighted policy values. Targets cannot be negative; multipliers, case sizes and recount intervals must be greater than zero.' : '';
  const saveChanges = async () => {
    if (validationError || !locationId || !changedProducts.length) return;
    if (!(await requestWriteAccess())) return;
    setSaving(true); setSaveStatus({ message: 'Saving standards...' });
    const rows = changedProducts.map((product) => drafts[product.id].assigned ? {
      productId: product.id, assigned: true, parQuantity: Number(drafts[product.id].parQuantity || 0),
      countOrder: Number(drafts[product.id].countOrder), stockPolicy: drafts[product.id].stockPolicy,
      targetMode: drafts[product.id].targetMode || null,
      reserveMultiplier: Number(drafts[product.id].reserveMultiplier || 0),
      caseSize: Number(drafts[product.id].caseSize || 0), targetCases: Number(drafts[product.id].targetCases || 0),
      targetLooseQuantity: Number(drafts[product.id].targetLooseQuantity || 0),
      physicalRecountIntervalDays: Number(drafts[product.id].physicalRecountIntervalDays || 90),
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
    const target = calculateStandardPolicyTarget({ ...row, productId: product.id }, { standards, locations, products });
    return <article className={`inventory-standard-row inventory-policy-standard ${archived ? 'archived' : ''}`} key={product.id}><div className="inventory-standard-product"><label><input type="checkbox" checked={row.assigned} disabled={archived && !row.assigned} onChange={(event) => updateDraft(product.id, { assigned: event.target.checked })} /><span><strong>{product.name}</strong><small>{product.category || 'Other'}{product.sku ? ` · ${product.sku}` : ''}{archived ? ' · Archived product' : ''}</small></span></label><Status tone={isChanged(product.id) ? 'warning' : row.assigned ? 'good' : ''}>{isChanged(product.id) ? 'Unsaved' : row.assigned ? 'Assigned' : 'Available'}</Status></div><div className="inventory-policy-fields"><label>Stock policy<select disabled={!row.assigned} value={row.stockPolicy} onChange={(event) => updateDraft(product.id, { stockPolicy: event.target.value, targetMode: event.target.value === 'operating_reserve' ? (row.targetMode || 'derived_multiplier') : '' })}>{STOCK_POLICY_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>{row.stockPolicy === 'exact_par' && <label>Target quantity<input type="number" min="0" step="any" disabled={!row.assigned} value={row.parQuantity} onChange={(event) => updateDraft(product.id, { parQuantity: event.target.value })} /></label>}{row.stockPolicy === 'operating_reserve' && <><label>Target mode<select disabled={!row.assigned} value={row.targetMode} onChange={(event) => updateDraft(product.id, { targetMode: event.target.value })}><option value="derived_multiplier">Derived from service stock</option><option value="fixed_quantity">Fixed quantity</option></select></label>{row.targetMode === 'derived_multiplier' ? <><label>Reserve multiplier<input type="number" min="0.01" step="any" disabled={!row.assigned} value={row.reserveMultiplier} onChange={(event) => updateDraft(product.id, { reserveMultiplier: event.target.value })} /></label><div className="inventory-policy-result"><span>Service stock: {quantity(target.serviceTargetBasis)}</span><strong>{quantity(target.serviceTargetBasis)} × {quantity(row.reserveMultiplier)} = {quantity(target.effectiveTarget)}</strong></div></> : <label>Target quantity<input type="number" min="0" step="any" disabled={!row.assigned} value={row.parQuantity} onChange={(event) => updateDraft(product.id, { parQuantity: event.target.value })} /></label>}</>}{row.stockPolicy === 'protected_event_reserve' && <><label>Case size<input type="number" min="0.01" step="any" disabled={!row.assigned} value={row.caseSize} onChange={(event) => updateDraft(product.id, { caseSize: event.target.value })} /></label><label>Target cases<input type="number" min="0" step="1" disabled={!row.assigned} value={row.targetCases} onChange={(event) => updateDraft(product.id, { targetCases: event.target.value })} /></label><label>Loose target<input type="number" min="0" step="any" disabled={!row.assigned} value={row.targetLooseQuantity} onChange={(event) => updateDraft(product.id, { targetLooseQuantity: event.target.value })} /></label><div className="inventory-policy-result protected"><span>Protected event reserve · not for daily restocking</span><strong>Target: {quantity(target.effectiveTarget)} units</strong></div></>}{row.stockPolicy === 'verify_unchanged' && <><label>Physical recount interval (days)<input type="number" min="1" step="1" disabled={!row.assigned} value={row.physicalRecountIntervalDays} onChange={(event) => updateDraft(product.id, { physicalRecountIntervalDays: event.target.value })} /></label><div className="inventory-policy-result"><span>Shopbox is not integrated.</span><strong>Unchanged confirmation is a manager attestation, not automatic movement validation.</strong></div></>}<label>Count order<input type="number" min="0" step="1" disabled={!row.assigned} value={row.countOrder} onChange={(event) => updateDraft(product.id, { countOrder: event.target.value })} /></label></div></article>;
  };
  const exportStandards = () => downloadCsv('mesh-inventory-standards.csv', makeCsv(['Location', 'Product', 'Stock policy', 'Target mode', 'Configured target', 'Multiplier', 'Case size', 'Target cases', 'Loose target', 'Recount interval', 'Count order'], standards.map((item) => [contextualLocationName(locations.find((location) => location.id === item.locationId), locations), products.find((product) => product.id === item.productId)?.name || '', item.stockPolicy, item.targetMode, item.parQuantity, item.reserveMultiplier, item.caseSize, item.targetCases, item.targetLooseQuantity, item.physicalRecountIntervalDays, item.countOrder])));
  return (
    <section className="inventory-panel">
      <div className="inventory-panel-heading"><div><p className="eyebrow">Location-first setup</p><h2>Location standards</h2></div><button type="button" className="secondary-button" onClick={exportStandards}>Export CSV</button></div>
      <div className="inventory-standards-toolbar"><label>1. Choose location<GroupedLocationSelect locations={activeLocations} value={locationId} onChange={(event) => setLocationId(event.target.value)} preferPhysical label="Choose counting location" /></label><label>2. Search active products<input type="search" placeholder="Name, SKU or category" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
      <p className="muted">Physical counting locations are listed first and selected by default. Suggested policies are shown for new assignments but nothing is saved until you choose products and press Save.</p>
      {selectedLocation?.code === 'BEVERAGE_STORAGE_EVENT_RESERVE' && <p className="inventory-protected-note"><strong>Protected event reserve</strong><span>Keep physically separate from Main beverage stock. This phase records readiness but creates no transfer.</span></p>}
      {locationId ? <><div className="inventory-standard-list">{activeProducts.map((product) => renderRow(product))}</div>{!activeProducts.length && <p className="muted">No active products match this search.</p>}{archivedProducts.length > 0 && <details className="inventory-archived-standards"><summary>Archived products with active standards ({archivedProducts.length})</summary><p className="muted">Uncheck an archived product to archive its location standard without deleting history.</p><div className="inventory-standard-list">{archivedProducts.map((product) => renderRow(product, true))}</div></details>}<div className="inventory-standards-save"><span>{changedProducts.length} changed product{changedProducts.length === 1 ? '' : 's'}</span><button type="button" className="primary-button" disabled={saving || !changedProducts.length || Boolean(validationError)} onClick={saveChanges}>{saving ? 'Saving standards...' : 'Save changed standards'}</button></div>{validationError && <p className="inventory-message error" role="alert">{validationError}</p>}<Message status={saveStatus} /></> : <p className="inventory-warning">Choose a location before configuring products.</p>}
      <details className="inventory-secondary-setup"><summary>Copy standards between locations</summary><div className="inventory-form-grid"><label>From<GroupedLocationSelect locations={activeLocations} value={copy.sourceLocationId} onChange={(event) => setCopy({ ...copy, sourceLocationId: event.target.value })} /></label><label>To<GroupedLocationSelect locations={activeLocations} value={copy.destinationLocationId} onChange={(event) => setCopy({ ...copy, destinationLocationId: event.target.value })} /></label></div><button type="button" className="secondary-button" disabled={!copy.sourceLocationId || !copy.destinationLocationId || copy.sourceLocationId === copy.destinationLocationId} onClick={() => run(() => copyInventoryStandards(copy))}>Copy and preserve existing</button></details>
    </section>
  );
}

function CatalogManager({ products, locations, standards, requestWriteAccess, refresh, setStatus }) {
  const [view, setView] = useState('products');
  const run = async (operation) => { if (!(await requestWriteAccess())) return; const result = await operation(); setStatus(result); if (result.ok) await refresh(true); return result; };
  return <div className="inventory-stack"><nav className="inventory-subtabs"><button type="button" className={view === 'products' ? 'active' : ''} onClick={() => setView('products')}>Products</button><button type="button" className={view === 'locations' ? 'active' : ''} onClick={() => setView('locations')}>Locations</button><button type="button" className={view === 'standards' ? 'active' : ''} onClick={() => setView('standards')}>Standards</button><button type="button" className={view === 'import' ? 'active' : ''} onClick={() => setView('import')}>CSV import</button></nav>{view === 'products' && <ProductManager products={products} run={run} />}{view === 'locations' && <LocationManager locations={locations} requestWriteAccess={requestWriteAccess} refresh={refresh} run={run} setStatus={setStatus} />}{view === 'standards' && <StandardsManager products={products} locations={locations} standards={standards} requestWriteAccess={requestWriteAccess} refresh={refresh} run={run} setStatus={setStatus} />}{view === 'import' && <CsvImport products={products} locations={locations} requestWriteAccess={requestWriteAccess} refresh={refresh} setStatus={setStatus} />}</div>;
}

function CsvImport({ products, locations, requestWriteAccess, refresh, setStatus }) {
  const [parsed, setParsed] = useState(null);
  const [mapping, setMapping] = useState({});
  const [preview, setPreview] = useState([]);
  const load = async (file) => { const next = parseInventoryCsv(await file.text()); setParsed(next); const suggested = suggestInventoryCsvMapping(next.headers); setMapping(suggested); setPreview(previewInventoryCsv({ parsed: next, mapping: suggested, products, locations })); };
  const updateMapping = (field, header) => { const next = { ...mapping, [field]: header }; setMapping(next); setPreview(previewInventoryCsv({ parsed, mapping: next, products, locations })); };
  const confirm = async () => { if (!(await requestWriteAccess())) return; const rows = preview.filter((row) => row.ready).map((row) => row.values); const result = await importInventoryCatalog({ rows, overwriteStandards: false }); setStatus(result.ok ? { ...result, message: `Imported ${result.data?.rows || rows.length} validated row(s). Existing standards were preserved.` } : result); if (result.ok) await refresh(true); };
  const fields = [['name', 'Product name'], ['unitLabel', 'Unit'], ['sku', 'SKU'], ['barcode', 'Barcode'], ['category', 'Category'], ['location', 'Location name'], ['locationCode', 'Location code'], ['parQuantity', 'Par'], ['minimumQuantity', 'Minimum'], ['countOrder', 'Count order'], ['supplierName', 'Supplier'], ['notes', 'Notes']];
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
      const previousByKey = new Map(previous.lines.map((line) => [`${line.locationName}|${line.productName}|${line.unitLabel}`.toLowerCase(), line]));
      setComparison(latest.lines.map((line) => {
        const oldLine = previousByKey.get(`${line.locationName}|${line.productName}|${line.unitLabel}`.toLowerCase());
        if (line.countedQuantity === null || oldLine?.countedQuantity === null || oldLine?.countedQuantity === undefined) return null;
        return { productName: line.productName, locationName: line.locationName, unitLabel: line.unitLabel, latest: line.countedQuantity, previous: oldLine.countedQuantity, change: line.countedQuantity - oldLine.countedQuantity };
      }).filter(Boolean).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 12));
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
  return <div className="inventory-stack"><section className="inventory-panel"><h2>Count history</h2><p className="muted">Historical sessions use the product labels and stocking standards captured when each count started.</p><div className="inventory-form-grid"><label>From<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label><label>To<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label><label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="approved">Approved</option><option value="cancelled">Cancelled</option></select></label><label>Count type<select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">All types</option>{[...new Set(sessions.map((session) => session.countType))].map((type) => <option key={type} value={type}>{type.replace('_', ' ')}</option>)}</select></label><label className="inventory-wide">Search title or completion actor<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div><div className="inventory-history-list">{visible.map((session) => <button type="button" key={session.id} onClick={() => onOpenSession(session.id)}><span><strong>{session.title}</strong><small>{session.countDate} · {session.countType.replace('_', ' ')}{session.completedByName ? ` · completed by ${session.completedByName}` : ''}</small></span><Status tone={session.status === 'approved' ? 'good' : ''}>{session.status}</Status></button>)}</div>{!visible.length && <p className="muted">No count sessions match these filters.</p>}</section><section className="inventory-panel"><h2>Latest approved vs previous approved</h2>{approved.length < 2 ? <p className="muted">Two approved sessions are needed for comparison.</p> : comparison.length ? <div className="inventory-comparison-list">{comparison.map((item) => <article key={`${item.locationName}-${item.productName}`}><div><strong>{item.productName}</strong><span>{item.locationName}</span></div><p>Latest {quantity(item.latest)} · Previous {quantity(item.previous)} · <strong>{item.change > 0 ? '+' : ''}{quantity(item.change)} {item.unitLabel}</strong></p></article>)}</div> : <p className="muted">No matching manually stored quantities were available to compare.</p>}</section></div>;
}

export default function InventoryWorkspace({ user, currentOperator, requestWriteAccess, onClose }) {
  const manager = canManageInventory(user);
  const coordinator = canCoordinateInventory(user);
  const actorName = isSharedDeviceUser(user) ? currentOperator?.name || '' : null;
  const organizationId = user?.organizationId || user?.organization_id || '';
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState({ products: [], locations: [], standards: [], sessions: [] });
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [sessionDetail, setSessionDetail] = useState({ record: null, lines: [] });
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreator, setShowCreator] = useState(false);
  const [status, setStatus] = useState(null);
  const [realtimeStatus, setRealtimeStatus] = useState({ state: 'connecting' });
  const [remoteNotice, setRemoteNotice] = useState(false);
  const mounted = useRef(true);
  const selectedSessionIdRef = useRef('');

  const refresh = useCallback(async (includeArchived = manager) => {
    const result = await loadInventoryWorkspace({ includeArchived });
    if (!mounted.current) return result;
    if (result.ok) {
      setData(result);
      const open = result.sessions.find((session) => ['draft', 'in_progress'].includes(session.status));
      if (!selectedSessionIdRef.current && open) setSelectedSessionId(open.id);
      setStatus(null);
    } else setStatus(result);
    setLoading(false);
    return result;
  }, [manager]);

  const refreshSession = useCallback(async () => {
    const id = selectedSessionIdRef.current;
    if (!id) return null;
    const result = await getInventoryCountSession(id);
    if (mounted.current) {
      if (result.ok) setSessionDetail({ record: result.record, lines: result.lines });
      else setStatus(result);
    }
    return result;
  }, []);

  useEffect(() => { selectedSessionIdRef.current = selectedSessionId; if (selectedSessionId) refreshSession(); }, [selectedSessionId, refreshSession]);
  useEffect(() => { mounted.current = true; refresh(); return () => { mounted.current = false; }; }, [refresh]);
  useEffect(() => {
    const subscription = subscribeToInventoryRealtime({ organizationId, sessionId: selectedSessionId, enabled: Boolean(organizationId), onStatus: setRealtimeStatus, onRefresh: () => setRemoteNotice(true) });
    const timer = window.setInterval(() => { if (selectedSessionIdRef.current) setRemoteNotice(true); else refresh(); }, 30000);
    return () => { subscription.unsubscribe(); window.clearInterval(timer); };
  }, [organizationId, selectedSessionId, refresh]);

  const listedActiveSession = data.sessions.find((session) => ['draft', 'in_progress'].includes(session.status)) || null;
  const activeSession = sessionDetail.record?.id === listedActiveSession?.id ? sessionDetail.record : listedActiveSession;
  const selectedSession = sessionDetail.record?.id === selectedSessionId
    ? sessionDetail.record
    : data.sessions.find((session) => session.id === selectedSessionId) || activeSession;
  const selectedLines = sessionDetail.record?.id === selectedSession?.id ? sessionDetail.lines : [];
  const openSession = (id) => { setSelectedSessionId(id); setTab('count'); };
  const create = async (draft) => {
    if (!(await requestWriteAccess())) return;
    setCreating(true);
    const result = await createInventoryCountSession({ ...draft, actorName });
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
      <header className="inventory-topbar"><button type="button" className="secondary-button" onClick={onClose}>Back</button><div><p className="eyebrow">Mesh Youngstorget</p><h1>Inventory &amp; Stocktaking</h1>{actorName && <p className="muted">Selected operator: <strong>{actorName}</strong></p>}</div><Status tone={realtimeStatus.state === 'connected' ? 'good' : ''}>{realtimeStatus.state === 'connected' ? 'Live' : 'Polling backup'}</Status></header>
      <nav className="inventory-main-tabs" aria-label="Inventory views"><button type="button" className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Overview</button><button type="button" className={tab === 'count' ? 'active' : ''} onClick={() => setTab('count')}>Count</button><button type="button" className={tab === 'restock' ? 'active' : ''} onClick={() => setTab('restock')}>Restock</button>{coordinator && <button type="button" className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>History</button>}{manager && <button type="button" className={tab === 'manage' ? 'active' : ''} onClick={() => setTab('manage')}>Manage</button>}</nav>
      <Message status={status} />
      {status?.ok === false && <button type="button" className="secondary-button inventory-retry-button" onClick={() => refresh()}>Retry inventory refresh</button>}
      {showCreator ? <SessionCreator products={data.products} locations={data.locations} standards={data.standards} onCancel={() => setShowCreator(false)} onCreate={create} busy={creating} /> : tab === 'overview' ? <InventoryOverview sessions={data.sessions} activeSession={activeSession} lines={activeSession?.id === selectedSession?.id ? selectedLines : []} locations={data.locations} onOpenSession={openSession} onStart={() => setShowCreator(true)} canCoordinate={coordinator} /> : tab === 'count' ? selectedSession ? <CountSession session={selectedSession} lines={selectedLines} locations={data.locations} actorName={actorName} canManage={manager} canCoordinate={coordinator} requestWriteAccess={requestWriteAccess} onRefresh={async () => { await refreshSession(); await refresh(); }} onBack={() => setTab('overview')} setStatus={setStatus} remoteNotice={remoteNotice} clearRemoteNotice={() => setRemoteNotice(false)} /> : <section className="inventory-panel inventory-empty"><h2>No active stock count</h2>{coordinator && <button type="button" className="primary-button" onClick={() => setShowCreator(true)}>Start stock count</button>}</section> : tab === 'restock' ? <RestockView session={selectedSession} lines={selectedLines} /> : tab === 'history' ? <InventoryHistory sessions={data.sessions} locations={data.locations} onOpenSession={openSession} /> : <CatalogManager products={data.products} locations={data.locations} standards={data.standards} requestWriteAccess={requestWriteAccess} refresh={refresh} setStatus={setStatus} />}
      {data.refreshedAt && <p className="inventory-last-refresh">Last successful refresh: {formatDateTime(data.refreshedAt)}</p>}
    </main>
  );
}
