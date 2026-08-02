import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
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
} from '../src/data/inventoryCounterMobile.js';
import { PHASE9_TERMINAL_MIGRATION, validatedPhase9MigrationEntries } from './phase9MigrationOrder.mjs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const permissions = readFileSync(new URL('../src/lib/permissions.js', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../src/components/InventoryWorkspace.jsx', import.meta.url), 'utf8');
const workflows = readFileSync(new URL('../src/components/InventoryCounterWorkflows.jsx', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/lib/inventoryClient.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/phase9gc_inventory_counter_mobile.sql', import.meta.url), 'utf8');
const counterUi = workflows.slice(workflows.indexOf('export function CounterInventoryWorkspace'), workflows.indexOf('function assignmentReview'));

const unitLine = (changes = {}) => ({
  id: 'line-unit',
  countMode: 'unit',
  countStatus: 'not_counted',
  countedQuantityExact: null,
  standardQuantityExact: '10',
  countedWholeUnitsExact: null,
  countedOpenVolumeLitersExact: null,
  countedFullKegsExact: null,
  countedPartialKegFractionExact: null,
  note: '',
  updatedAt: '2026-08-02T10:00:00Z',
  ...changes,
});

const assignment = (lines, changes = {}) => ({
  id: 'assignment-1',
  state: 'assigned',
  lines,
  location: { id: 'location-1', name: 'Workbar Fridge' },
  session: { id: 'session-1', title: 'August Stock Count', countDate: '2026-08-02' },
  ...changes,
});

test('counter-only role routing remains automatic while managers retain the manager workspace', () => {
  assert.match(permissions, /hasVerifiedInventoryIdentity\(user, 'counter'\)/);
  assert.match(app, /if \(showInventory \|\| inventoryCounterUser\)/);
  assert.match(workspace, /if \(isInventoryCounter\(props\.user\)\)[\s\S]*?<CounterInventoryWorkspace/);
  assert.match(workspace, /return <AuthorizedInventoryWorkspace \{\.\.\.props\} \/>/);
});

test('Phase 9G-C and Phase 9G-D remain before the repeatable Phase 9H terminal migration', () => {
  const entries = validatedPhase9MigrationEntries();
  assert.equal(PHASE9_TERMINAL_MIGRATION, 'supabase/phase9h_inventory_session_location_scope.sql');
  assert.equal(entries.at(-2).path, 'supabase/phase9gd_inventory_product_mappings.sql');
  assert.equal(entries.at(-3).path, 'supabase/phase9gc_inventory_counter_mobile.sql');
  assert.deepEqual(entries.filter((entry) => entry.repeatable).map((entry) => entry.path), [PHASE9_TERMINAL_MIGRATION]);
});

test('mobile migration exposes only the assigned standard through the existing guarded RPC', () => {
  assert.match(migration, /security definer\nset search_path = pg_catalog/);
  assert.match(migration, /inventory_resolve_counter\(\)/);
  assert.match(migration, /'standard_quantity', line\.par_quantity_snapshot/);
  assert.match(migration, /assignment\.counter_membership_id = v_actor\.membership_id/);
  assert.match(migration, /assignment\.state <> 'superseded'/);
  assert.doesNotMatch(migration, /'variance_quantity'|'reserve_target'|alter table|create table|grant select/i);
  assert.match(migration, /revoke all on function public\.get_inventory_counter_workspace\(\) from public, anon, authenticated/);
});

test('counter client still uses one RPC loader and normalizes the assigned standard', () => {
  const loader = client.slice(client.indexOf('export async function loadInventoryCounterWorkspace'), client.indexOf('export async function getInventoryCountSession'));
  assert.match(loader, /rpc\('get_inventory_counter_workspace'\)/);
  assert.doesNotMatch(loader, /\.from\(/);
  assert.match(client, /standardQuantityExact: exactDecimal\(row\.standard_quantity\)/);
});

test('counter home renders session, assignments, progress, state, resume actions, and return messages', () => {
  for (const label of ['Counter home', 'Your refrigerator assignments', 'counted', 'incomplete', 'Resume counting', 'Open refrigerator', 'View status', 'Returned by Bobby']) assert.ok(workflows.includes(label), label);
  assert.match(counterUi, /data-counter-screen="home"/);
});

test('blank, explicit zero, and a saved zero remain three distinct states', () => {
  const line = unitLine();
  const blank = createCounterLineDraft(line);
  const zero = { ...blank, countedQuantity: '0' };
  assert.equal(evaluateCounterLineDraft(line, blank).ok, false);
  assert.equal(evaluateCounterLineDraft(line, zero).countedQuantity, '0');
  assert.equal(counterLineDraftHasChanges(line, zero), true);
  assert.equal(createCounterLineDraft(unitLine({ countStatus: 'counted', countedQuantityExact: '0' })).saveState, COUNTER_DRAFT_STATES.SAVED);
});

test('structured bottle and keg drafts retain the Phase 9F exact quantity model', () => {
  const bottle = unitLine({ countMode: 'container_plus_volume', containerCapacityLiters: '0.7' });
  const keg = unitLine({ countMode: 'keg_fraction' });
  const bottleResult = evaluateCounterLineDraft(bottle, { ...createCounterLineDraft(bottle), wholeUnits: '3', openVolumeLiters: '0.4' });
  const kegResult = evaluateCounterLineDraft(keg, { ...createCounterLineDraft(keg), fullKegs: '2', partialKegFraction: '0.5' });
  assert.equal(bottleResult.countedQuantity, '2.5');
  assert.equal(kegResult.countedQuantity, '2.5');
  assert.match(workflows, /Sealed bottles[\s\S]*?Open liters/);
  assert.match(workflows, /Full kegs[\s\S]*?Partial keg fraction/);
});

test('previous and next navigation move among incomplete lines without returning the current line', () => {
  const lines = [unitLine({ id: 'a' }), unitLine({ id: 'b', countStatus: 'counted', countedQuantityExact: '1' }), unitLine({ id: 'c' })];
  assert.equal(findAdjacentIncompleteLineId(lines, '', 1), 'a');
  assert.equal(findAdjacentIncompleteLineId(lines, 'a', 1), 'c');
  assert.equal(findAdjacentIncompleteLineId(lines, 'c', -1), 'a');
  assert.equal(findAdjacentIncompleteLineId([unitLine({ id: 'a' })], 'a', 1), '');
});

test('default application requires physical confirmation and explains preservation semantics', () => {
  assert.match(counterUi, /Bruk standard/);
  assert.match(counterUi, /I physically checked this refrigerator/);
  assert.match(counterUi, /previously uncounted exact-standard lines/);
  assert.match(counterUi, /Saved quantities, deviations, and comments are preserved/);
  assert.match(counterUi, /physicalConfirmation: true/);
});

test('unsaved drafts survive ordinary assignment rerenders', () => {
  const line = unitLine();
  const draft = { ...createCounterLineDraft(line), countedQuantity: '7', saveState: COUNTER_DRAFT_STATES.UNSAVED };
  const reconciled = reconcileCounterDrafts({ [line.id]: draft }, [assignment([line])]);
  assert.equal(reconciled[line.id].countedQuantity, '7');
  assert.equal(reconciled[line.id].saveState, COUNTER_DRAFT_STATES.UNSAVED);
});

test('failed saves retain drafts and expose an explicit retry state', () => {
  const line = unitLine();
  const draft = { ...createCounterLineDraft(line), countedQuantity: '7', saveState: COUNTER_DRAFT_STATES.FAILED, error: 'Network unavailable' };
  const reconciled = reconcileCounterDrafts({ [line.id]: draft }, [assignment([line])]);
  assert.equal(reconciled[line.id].countedQuantity, '7');
  assert.equal(reconciled[line.id].error, 'Network unavailable');
  assert.match(workflows, /Save failed — retry/);
  assert.match(workflows, /Retry save/);
});

test('server changes mark a retained local draft stale instead of overwriting it', () => {
  const line = unitLine();
  const draft = { ...createCounterLineDraft(line), countedQuantity: '7', saveState: COUNTER_DRAFT_STATES.UNSAVED };
  const changedLine = { ...line, countedQuantityExact: '4', countStatus: 'counted', updatedAt: '2026-08-02T10:05:00Z' };
  const reconciled = reconcileCounterDrafts({ [line.id]: draft }, [assignment([changedLine])]);
  assert.equal(reconciled[line.id].countedQuantity, '7');
  assert.equal(reconciled[line.id].saveState, COUNTER_DRAFT_STATES.STALE);
});

test('stale-write and safe-refresh messaging retain the local value', () => {
  assert.match(client, /changed on another device[\s\S]*?your unsaved value is still here/i);
  assert.match(workflows, /Changed elsewhere — review and retry/);
  assert.match(counterUi, /Refresh safely — keep local drafts/);
});

test('submission review reports incomplete, deviation, note, invalid, and unsafe counts', () => {
  for (const label of ['Ready to send?', 'incomplete', 'deviations', 'notes', 'unsaved/failed', 'invalid drafts']) assert.ok(workflows.includes(label), label);
  assert.match(workflows, /summary\.incomplete\.length > 0 \|\| summary\.unsafeDrafts\.length > 0 \|\| summary\.invalidDrafts\.length > 0 \|\| busy/);
  assert.match(workflows, /Ferdig – send til Bobby/);
});

test('assignment summaries distinguish deviations, comments, incomplete work, and unsafe drafts', () => {
  const counted = unitLine({ id: 'counted', countStatus: 'counted', countedQuantityExact: '8', note: 'Damaged label' });
  const incomplete = unitLine({ id: 'incomplete' });
  const draft = { ...createCounterLineDraft(incomplete), countedQuantity: '3', saveState: COUNTER_DRAFT_STATES.UNSAVED };
  const summary = summarizeCounterAssignment(assignment([counted, incomplete]), { incomplete: draft });
  assert.equal(summary.counted.length, 1);
  assert.equal(summary.incomplete.length, 1);
  assert.equal(summary.deviations.length, 1);
  assert.equal(summary.notes.length, 1);
  assert.equal(summary.unsafeDrafts.length, 1);
  assert.equal(counterLineIsDeviation(counted), true);
});

test('rapid repeated taps are guarded before React disabled-state rendering', () => {
  assert.match(counterUi, /const operationRef = useRef\(''\)/);
  assert.match(counterUi, /if \(operationRef\.current\) return \{ ok: false, mode: 'busy'/);
  assert.match(workflows, /const savingRef = useRef\(false\)/);
  assert.match(workflows, /if \(savingRef\.current \|\| !evaluated\.ok \|\| !dirty\) return/);
});

test('submitted and accepted assignments render explicit read-only states', () => {
  assert.equal(counterAssignmentIsEditable('submitted'), false);
  assert.equal(counterAssignmentIsEditable('accepted'), false);
  assert.match(counterUi, /Sent to Bobby — waiting for review/);
  assert.match(counterUi, /Accepted by Bobby/);
  assert.match(counterUi, /const readOnly = assignment \? !counterAssignmentIsEditable\(assignment\.state\)/);
});

test('returned assignments are editable, auto-open, and show the manager message', () => {
  assert.equal(counterAssignmentIsEditable('returned'), true);
  assert.match(counterUi, /result\.assignments\.find\(\(item\) => item\.state === 'returned'/);
  assert.match(counterUi, /Returned by Bobby — correction required/);
  assert.match(counterUi, /assignment\.returnMessage/);
});

test('superseded assignments are never actionable in the defensive frontend state', () => {
  assert.equal(counterAssignmentIsEditable('superseded'), false);
  assert.match(workflows, /const actionable = assignment\.state !== 'superseded'/);
  assert.match(workflows, /This assignment was replaced and is no longer actionable/);
});

test('counter UI contains no manager configuration, replacement, history, or export controls', () => {
  assert.doesNotMatch(counterUi, /Counter authorization|Assign refrigerators|Bytt teller|Replace counter|Export CSV|Count history|Approve stock count|Create correction|Save current count as default/i);
});

test('network and expired-auth failures never claim that a draft was saved', () => {
  assert.match(client, /sign-in expired[\s\S]*?not yet saved remain only on this screen/i);
  assert.match(client, /could not reach the server[\s\S]*?unsaved value is still here/i);
  assert.match(counterUi, /Your Stock Count sign-in could not be verified[\s\S]*?unsaved values remain/);
});

test('extra products stay out of catalogue access and use a scoped comment limitation', () => {
  assert.match(counterUi, /Annen vare eller avvik/);
  assert.match(counterUi, /no counter-safe full-catalogue extra-product lookup/i);
  assert.doesNotMatch(counterUi, /loadInventoryWorkspace|inventory_products|inventory_product_aliases/);
});

test('mobile controls have semantic labels, suitable keyboards, visible statuses, and unload protection', () => {
  assert.match(workflows, /htmlFor=\{`\$\{inputPrefix\}-quantity`\}/);
  assert.match(workflows, /inputMode="decimal"/);
  assert.match(workflows, /inputMode="numeric"/);
  assert.match(workflows, /aria-live="polite"/);
  assert.match(workflows, /role="progressbar"/);
  assert.match(counterUi, /beforeunload/);
  assert.match(counterUi, /window\.confirm\('Unsaved or failed Stock Count values/);
});

test('narrow viewport CSS avoids horizontal scrolling and provides large touch targets', () => {
  assert.match(styles, /\.counter-workspace\s*\{[\s\S]*?overflow-x: clip/);
  assert.match(styles, /@media \(max-width: 600px\)[\s\S]*?padding-inline: 10px/);
  assert.match(styles, /\.counter-save-button,[\s\S]*?min-height: 48px/);
  assert.match(styles, /\.counter-primary-quantity input[\s\S]*?min-height: 58px/);
  assert.match(styles, /font-size: max\(16px, 1em\)/);
});
