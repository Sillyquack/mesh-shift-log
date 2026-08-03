import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { summarizeInventorySession } from '../src/data/inventoryCalculations.js';
import {
  beginInventoryHistoryDetailRequest,
  createInventoryHistoryDetailState,
  inventoryHistoryDetailView,
  selectInventoryHistoryDetail,
  settleInventoryHistoryDetailRequest,
} from '../src/data/inventoryHistoryDetail.js';

const migration = readFileSync(new URL('../supabase/phase9j_inventory_shelf_storage_guidance.sql', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/lib/inventoryClient.js', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../src/components/InventoryWorkspace.jsx', import.meta.url), 'utf8');
const assertions = readFileSync(new URL('../supabase/tests/phase9/history-detail-assertions.sql', import.meta.url), 'utf8');
const detailLoader = client.slice(
  client.indexOf('export async function getInventoryCountSession'),
  client.indexOf('export async function getInventoryMillumExport'),
);

test('manager history detail is one guarded organization-scoped RPC with explicit grants', () => {
  assert.match(migration, /create or replace function public\.get_inventory_manager_count_session_detail\(input_session_id uuid\)/);
  assert.match(migration, /security definer\nset search_path = pg_catalog/);
  assert.match(migration, /inventory_session_is_visible\(input_session_id\)/);
  assert.match(migration, /line\.session_id = input_session_id[\s\S]*?line\.organization_id = v_organization_id/);
  assert.match(migration, /inventory_count_line_client_record\(line\.id\)/);
  assert.match(migration, /revoke all on function public\.get_inventory_manager_count_session_detail\(uuid\)[\s\S]*?from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.get_inventory_manager_count_session_detail\(uuid\)[\s\S]*?to authenticated/);
});

test('history loader consumes the atomic response and has no direct count-line query', () => {
  assert.match(detailLoader, /rpc\('get_inventory_manager_count_session_detail'/);
  assert.match(detailLoader, /normalizeSession\(data\?\.session\)/);
  assert.match(detailLoader, /record\.id !== sessionId/);
  assert.match(detailLoader, /Array\.isArray\(data\?\.lines\)/);
  assert.match(detailLoader, /data\.lines\.map\(normalizeLine\)/);
  assert.doesNotMatch(detailLoader, /from\('inventory_count_lines'\)|Promise\.all/);
});

test('known production shape summarizes as 6/6 locations and 53/53 lines', () => {
  const locationLineCounts = [6, 8, 15, 4, 3, 17];
  const locations = locationLineCounts.map((_, index) => ({
    id: `location-${index + 1}`,
    name: `Fridge ${index + 1}`,
  }));
  const completionMap = Object.fromEntries(locations.map((location) => [
    location.id,
    { completedAt: '2026-08-03T12:00:00Z', completedByName: 'Bobby' },
  ]));
  const lines = locationLineCounts.flatMap((count, locationIndex) => Array.from({ length: count }, (_, lineIndex) => ({
    id: `line-${locationIndex + 1}-${lineIndex + 1}`,
    locationId: locations[locationIndex].id,
    productId: `product-${locationIndex + 1}-${lineIndex + 1}`,
    productName: `Product ${locationIndex + 1}-${lineIndex + 1}`,
    locationName: locations[locationIndex].name,
    unitLabel: 'unit',
    parQuantity: 1,
    countedQuantity: 1,
    countMethod: 'manual',
    countStatus: 'counted',
    stockPolicy: 'exact_par',
  })));
  const summary = summarizeInventorySession(lines, locations, completionMap);
  assert.equal(summary.locations, 6);
  assert.equal(summary.completedLocations, 6);
  assert.equal(summary.total, 53);
  assert.equal(summary.counted, 53);
});

test('selecting another session renders loading instead of stale or false zero detail', () => {
  let state = createInventoryHistoryDetailState();
  state = selectInventoryHistoryDetail(state, 'approved-a');
  state = beginInventoryHistoryDetailRequest(state, 'approved-a', 1);
  state = settleInventoryHistoryDetailRequest(state, {
    selectedSessionId: 'approved-a',
    requestedSessionId: 'approved-a',
    requestId: 1,
    result: { ok: true, record: { id: 'approved-a', status: 'approved' }, lines: [{ id: 'line-a' }] },
  });
  assert.equal(inventoryHistoryDetailView(state, 'approved-a').state, 'ready');

  state = selectInventoryHistoryDetail(state, 'approved-b');
  const loadingView = inventoryHistoryDetailView(state, 'approved-b');
  assert.equal(loadingView.state, 'loading');
  assert.deepEqual(loadingView.lines, []);
  state = beginInventoryHistoryDetailRequest(state, 'approved-b', 2);

  const afterOldResponse = settleInventoryHistoryDetailRequest(state, {
    selectedSessionId: 'approved-b',
    requestedSessionId: 'approved-a',
    requestId: 1,
    result: { ok: true, record: { id: 'approved-a' }, lines: [{ id: 'stale-line' }] },
  });
  assert.equal(afterOldResponse, state);
  assert.equal(inventoryHistoryDetailView(afterOldResponse, 'approved-b').state, 'loading');

  state = settleInventoryHistoryDetailRequest(state, {
    selectedSessionId: 'approved-b',
    requestedSessionId: 'approved-b',
    requestId: 2,
    result: { ok: true, record: { id: 'approved-b', status: 'approved' }, lines: [{ id: 'line-b' }] },
  });
  assert.deepEqual(inventoryHistoryDetailView(state, 'approved-b').lines, [{ id: 'line-b' }]);
});

test('failed or incomplete detail loads render an error instead of a zero-line session', () => {
  let state = selectInventoryHistoryDetail(createInventoryHistoryDetailState(), 'approved-a');
  state = beginInventoryHistoryDetailRequest(state, 'approved-a', 1);
  state = settleInventoryHistoryDetailRequest(state, {
    selectedSessionId: 'approved-a',
    requestedSessionId: 'approved-a',
    requestId: 1,
    result: { ok: false, message: 'Denied' },
  });
  const view = inventoryHistoryDetailView(state, 'approved-a');
  assert.equal(view.state, 'error');
  assert.equal(view.record, null);
  assert.deepEqual(view.lines, []);
});

test('React count detail gates CountSession behind ready state and exposes loading and retry states', () => {
  assert.match(workspace, /selectedDetail\.state === 'loading'[\s\S]*?Loading Stock Count detail/);
  assert.match(workspace, /selectedDetail\.state === 'error'[\s\S]*?Retry session detail/);
  assert.match(workspace, /selectedDetail\.record \? <CountSession session=\{selectedDetail\.record\}[\s\S]*?lines=\{selectedDetail\.lines\}/);
  assert.match(workspace, /settleInventoryHistoryDetailRequest\([\s\S]*?selectedSessionId: selectedSessionIdRef\.current/);
});

test('executable database coverage includes every required history authorization and lifecycle case', () => {
  for (const phrase of [
    'approved session returns its complete historical lines and locations',
    'active session detail remains available',
    'completed session detail remains available',
    'correction session detail remains available',
    'cross-organization history access is rejected',
    'counter cannot access manager history',
    'approved session and line history remains byte-stable',
  ]) assert.match(assertions, new RegExp(phrase, 'i'));
});

console.log('Inventory approved-history detail regression suite passed.');
