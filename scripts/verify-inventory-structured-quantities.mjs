import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildInventoryRestockList,
  calculateInventoryLine,
} from '../src/data/inventoryCalculations.js';
import {
  inventoryCsvNumeric,
  makeCsv,
  parseCsvRows,
} from '../src/data/inventoryCsv.js';
import {
  createInventoryManagerLineDraft,
  evaluateInventoryManagerLineDraft,
} from '../src/data/inventoryManagerLineDraft.js';
import {
  addInventoryDecimals,
  calculateStructuredInventoryQuantity,
  decomposeInventoryTarget,
  formatInventoryDecimal,
  inventoryBaseUnit,
  inventoryDecimalDraftState,
  inventoryStructuredComponentLabel,
  INVENTORY_COUNT_MODES,
  normalizeInventoryDecimal,
} from '../src/data/inventoryStructuredQuantities.js';
import {
  PHASE9_TERMINAL_MIGRATION,
  readPhase9MigrationManifest,
} from './phase9MigrationOrder.mjs';

const migration = readFileSync(new URL('../supabase/phase9f_inventory_structured_quantities.sql', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/lib/inventoryClient.js', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../src/components/InventoryWorkspace.jsx', import.meta.url), 'utf8');

let passes = 0;
function test(name, assertion) {
  assertion();
  passes += 1;
  console.log(`PASS 9F-${passes}: ${name}`);
}

test('decimal comma and decimal point normalize to the same exact value', () => {
  assert.equal(normalizeInventoryDecimal('0,400000'), '0.4');
  assert.equal(normalizeInventoryDecimal('0.4'), '0.4');
});

test('incomplete decimal drafts remain valid without becoming saveable values', () => {
  assert.deepEqual(inventoryDecimalDraftState('0,'), { complete: false, valid: true, value: null, message: '' });
  assert.deepEqual(inventoryDecimalDraftState(''), { complete: false, valid: true, value: null, message: '' });
});

test('operational input rejects more than six decimal places', () => {
  assert.throws(() => normalizeInventoryDecimal('0.1234567', { maxScale: 6 }), /no more than 6/);
});

test('binary floating-point artifacts never enter exact addition', () => {
  assert.equal(addInventoryDecimals('0.1', '0.2'), '0.3');
  assert.equal(formatInventoryDecimal(addInventoryDecimals('0.1', '0.2')), '0,3');
  assert.equal(formatInventoryDecimal(0.1 + 0.2), '0,3');
});

test('three 0.7 L sealed bottles plus 0.4 L open is exactly 2.5 L', () => {
  const result = calculateStructuredInventoryQuantity({ countMode: 'container_plus_volume', wholeCount: '3', openVolumeLiters: '0,4', containerCapacityLiters: '0.7' });
  assert.equal(result.countedQuantity, '2.5');
  assert.equal(result.countedWholeUnits, '3');
  assert.equal(result.countedOpenVolumeLiters, '0.4');
});

test('one-liter containers support zero sealed plus 0.25 L open', () => {
  assert.equal(calculateStructuredInventoryQuantity({ countMode: 'container_plus_volume', wholeCount: '0', openVolumeLiters: '0.25', containerCapacityLiters: '1' }).countedQuantity, '0.25');
});

test('aggregate open volume may exceed one container capacity', () => {
  assert.equal(calculateStructuredInventoryQuantity({ countMode: 'container_plus_volume', wholeCount: '1', openVolumeLiters: '1.6', containerCapacityLiters: '0.7' }).countedQuantity, '2.3');
});

test('container zero plus zero remains a recorded exact zero', () => {
  assert.equal(calculateStructuredInventoryQuantity({ countMode: 'container_plus_volume', wholeCount: '0', openVolumeLiters: '0', containerCapacityLiters: '0.7' }).countedQuantity, '0');
});

test('container validation rejects negative, fractional whole, and missing capacity inputs', () => {
  assert.throws(() => calculateStructuredInventoryQuantity({ countMode: 'container_plus_volume', wholeCount: '-1', openVolumeLiters: '0', containerCapacityLiters: '0.7' }), /whole number/);
  assert.throws(() => calculateStructuredInventoryQuantity({ countMode: 'container_plus_volume', wholeCount: '1.5', openVolumeLiters: '0', containerCapacityLiters: '0.7' }), /whole number/);
  assert.throws(() => calculateStructuredInventoryQuantity({ countMode: 'container_plus_volume', wholeCount: '1', openVolumeLiters: '0', containerCapacityLiters: '' }), /decimal quantity/);
});

test('two full kegs plus a half keg is exactly 2.5 keg equivalents', () => {
  const result = calculateStructuredInventoryQuantity({ countMode: 'keg_fraction', fullKegs: '2', partialKegFraction: '0.5' });
  assert.equal(result.countedQuantity, '2.5');
  assert.equal(result.countedFullKegs, '2');
  assert.equal(result.countedPartialKegFraction, '0.5');
});

test('0.4, 0.25, and 0.75 partial kegs remain available manual fractions', () => {
  for (const value of ['0,4', '0.25', '0.75']) {
    assert.equal(calculateStructuredInventoryQuantity({ countMode: 'keg_fraction', fullKegs: '0', partialKegFraction: value }).countedQuantity, normalizeInventoryDecimal(value));
  }
});

test('an exact partial fraction of one transparently carries into full kegs', () => {
  const result = calculateStructuredInventoryQuantity({ countMode: 'keg_fraction', fullKegs: '2', partialKegFraction: '1' });
  assert.equal(result.countedQuantity, '3');
  assert.equal(result.countedFullKegs, '3');
  assert.equal(result.countedPartialKegFraction, '0');
});

test('keg validation rejects negative, fractional full, and greater-than-one partial inputs', () => {
  assert.throws(() => calculateStructuredInventoryQuantity({ countMode: 'keg_fraction', fullKegs: '-1', partialKegFraction: '0' }), /whole number/);
  assert.throws(() => calculateStructuredInventoryQuantity({ countMode: 'keg_fraction', fullKegs: '1.5', partialKegFraction: '0' }), /whole number/);
  assert.throws(() => calculateStructuredInventoryQuantity({ countMode: 'keg_fraction', fullKegs: '1', partialKegFraction: '1.1' }), /less than 1/);
});

test('use-par decomposition is deterministic for containers', () => {
  assert.deepEqual(decomposeInventoryTarget({ countMode: 'container_plus_volume', targetQuantity: '2.5', containerCapacityLiters: '0.7' }), {
    countedQuantity: '2.5', countedWholeUnits: '3', countedOpenVolumeLiters: '0.4', countedFullKegs: null, countedPartialKegFraction: null,
  });
});

test('use-par decomposition is deterministic for kegs', () => {
  assert.deepEqual(decomposeInventoryTarget({ countMode: 'keg_fraction', targetQuantity: '2.5' }), {
    countedQuantity: '2.5', countedWholeUnits: null, countedOpenVolumeLiters: null, countedFullKegs: '2', countedPartialKegFraction: '0.5',
  });
});

test('line discrepancy and restock use exact canonical decimal strings', () => {
  const calculation = calculateInventoryLine({ countedQuantityExact: '0.3', effectiveTargetQuantityExact: '0.5', stockPolicy: 'exact_par', countStatus: 'counted', countMethod: 'manual' });
  assert.equal(calculation.varianceQuantityExact, '-0.2');
  assert.equal(calculation.restockQuantityExact, '0.2');
});

test('same-name products stay separate across stable IDs and locations aggregate by ID', () => {
  const lines = [
    { id: 'a1', productId: 'a', locationId: '1', productName: 'Same', unitLabel: 'L', countMode: 'container_plus_volume', stockPolicy: 'exact_par', effectiveTargetQuantityExact: '2.5', countedQuantityExact: '2' },
    { id: 'a2', productId: 'a', locationId: '2', productName: 'Same', unitLabel: 'L', countMode: 'container_plus_volume', stockPolicy: 'exact_par', effectiveTargetQuantityExact: '1', countedQuantityExact: '0.7' },
    { id: 'b1', productId: 'b', locationId: '1', productName: 'Same', unitLabel: 'keg equivalents', countMode: 'keg_fraction', stockPolicy: 'exact_par', effectiveTargetQuantityExact: '1', countedQuantityExact: '0.5' },
  ];
  const restock = buildInventoryRestockList(lines);
  assert.equal(restock.length, 2);
  assert.equal(restock.find((row) => row.productId === 'a').totalMissingExact, '0.8');
});

test('one product ID with incompatible snapshotted modes fails loudly', () => {
  assert.throws(() => buildInventoryRestockList([
    { id: 'a1', productId: 'a', locationId: '1', countMode: 'unit', stockPolicy: 'exact_par', effectiveTargetQuantityExact: '2', countedQuantityExact: '1' },
    { id: 'a2', productId: 'a', locationId: '2', countMode: 'keg_fraction', stockPolicy: 'exact_par', effectiveTargetQuantityExact: '2', countedQuantityExact: '1' },
  ]), /incompatible count-mode snapshots/);
});

test('history labels retain entered bottle and keg components', () => {
  assert.equal(inventoryStructuredComponentLabel({ countMode: 'container_plus_volume', countedWholeUnitsExact: '3', countedOpenVolumeLitersExact: '0.4', countedQuantityExact: '2.5' }), '3 sealed + 0,4 L open = 2,5 L');
  assert.equal(inventoryStructuredComponentLabel({ countMode: 'keg_fraction', countedFullKegsExact: '2', countedPartialKegFractionExact: '0.5', countedQuantityExact: '2.5' }), '2 full + 0,5 partial = 2,5 kegs');
});

test('base-unit formatting is mode-specific and never changes configured unit data', () => {
  assert.equal(inventoryBaseUnit('unit', 'bottle'), 'bottle');
  assert.equal(inventoryBaseUnit('container_plus_volume', 'bottle'), 'L');
  assert.equal(inventoryBaseUnit('keg_fraction', 'piece'), 'keg equivalents');
});

test('trusted exact CSV numerics use decimal comma while text remains protected', () => {
  const csv = makeCsv(['Mode', 'Whole', 'Open', 'Counted', 'Text'], [
    ['container_plus_volume', inventoryCsvNumeric('0'), inventoryCsvNumeric('0.4'), inventoryCsvNumeric('2.5'), '=formula'],
    ['keg_fraction', null, null, inventoryCsvNumeric('0'), 'line\n"quoted";value'],
  ]);
  const rows = parseCsvRows(csv).rows;
  assert.deepEqual(rows[1], ['container_plus_volume', '0', '0,4', '2,5', "'=formula"]);
  assert.equal(rows[2][1], '');
  assert.equal(rows[2][3], '0');
  assert.equal(rows[2][4], 'line\n"quoted";value');
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  assert.equal(csv.slice(1).includes('\uFEFF'), false);
});

test('Phase 9F remains ordered before repeatable Phase 9H-9K and terminal Phase 9M', () => {
  const manifest = readPhase9MigrationManifest();
  assert.equal(PHASE9_TERMINAL_MIGRATION, 'supabase/20260804200000_phase9o_millum_wine_value_conversion.sql');
  assert.ok(manifest.orderedMigrations.findIndex((entry) => entry.path === 'supabase/phase9f_inventory_structured_quantities.sql') < manifest.orderedMigrations.length - 1);
  assert.equal(manifest.orderedMigrations.at(-1).path, PHASE9_TERMINAL_MIGRATION);
  assert.deepEqual(manifest.orderedMigrations.filter((entry) => entry.repeatable).map((entry) => entry.path), [
    'supabase/phase9h_inventory_session_location_scope.sql',
    'supabase/phase9i_millum_stock_count_exports.sql',
    'supabase/phase9j_inventory_shelf_storage_guidance.sql',
    'supabase/phase9k_millum_complete_count_export.sql',
  ]);
});

test('database schema uses exact numeric configuration and typed component columns', () => {
  assert.match(migration, /container_capacity_liters numeric\(20,6\)/);
  assert.match(migration, /counted_whole_units bigint/);
  assert.match(migration, /counted_open_volume_liters numeric\(20,6\)/);
  assert.match(migration, /counted_full_kegs bigint/);
  assert.match(migration, /counted_partial_keg_fraction numeric\(7,6\)/);
  assert.doesNotMatch(migration, /\b(?:real|double precision)\b/i);
});

test('database constraints enforce mode configuration and canonical equations', () => {
  assert.match(migration, /count_mode in \('unit', 'container_plus_volume', 'keg_fraction'\)/);
  assert.match(migration, /counted_quantity = counted_whole_units \* container_capacity_liters_snapshot \+ counted_open_volume_liters/);
  assert.match(migration, /counted_partial_keg_fraction < 1/);
  assert.match(migration, /counted_quantity = counted_full_kegs \+ counted_partial_keg_fraction/);
});

test('server RPC calculates totals and retains stale lifecycle locking', () => {
  assert.match(migration, /create or replace function public\.set_inventory_count_line_structured_quantity/);
  assert.match(migration, /inventory_lock_mutable_count_line\(input_line_id, v_actor\.organization_id, input_expected_updated_at/);
  assert.match(migration, /v_total := v_whole \* v_line\.container_capacity_liters_snapshot \+ input_open_volume_liters/);
  assert.match(migration, /if v_partial = 1 then/);
});

test('snapshot trigger preserves correction snapshots and uses current config only for new standard sessions', () => {
  assert.match(migration, /if v_session\.session_kind = 'correction'[\s\S]*?v_source\.count_mode_snapshot/);
  assert.match(migration, /else[\s\S]*?v_product\.count_mode/);
});

test('approved-line immutability remains in the earlier integrity layer and direct writes stay revoked', () => {
  assert.match(migration, /revoke all privileges on table public\.inventory_count_lines from authenticated/);
  assert.doesNotMatch(migration, /drop trigger if exists inventory_count_lines_integrity/);
});

test('client query results include snapshots and all structured components', () => {
  for (const field of ['count_mode_snapshot', 'container_capacity_liters_snapshot', 'counted_whole_units', 'counted_open_volume_liters', 'counted_full_kegs', 'counted_partial_keg_fraction']) {
    assert.match(client, new RegExp(`\\b${field}\\b`));
  }
});

test('frontend manager draft preserves structured components and their exact total', () => {
  const line = {
    id: 'stable-line-id',
    countMode: INVENTORY_COUNT_MODES.CONTAINER_PLUS_VOLUME,
    containerCapacityLiters: '0.7',
    countedQuantityExact: '2.5',
    countedWholeUnitsExact: '3',
    countedOpenVolumeLitersExact: '0.4',
    countFullCases: null,
    countLooseQuantity: null,
    countedFullKegsExact: null,
    countedPartialKegFractionExact: null,
    countMethod: 'manual',
    countStatus: 'counted',
    note: '',
    updatedAt: '2026-08-02T21:00:00.000Z',
  };
  const draft = createInventoryManagerLineDraft(line);
  const evaluated = evaluateInventoryManagerLineDraft(line, draft);
  assert.equal(draft.wholeUnits, '3');
  assert.equal(draft.openVolumeLiters, '0.4');
  assert.equal(evaluated.countedQuantity, '2.5');
  assert.equal(evaluated.dirty, false);
});

test('session export includes stable identity, mode, snapshots, components, total, target, and gap', () => {
  for (const header of ['Product ID', 'Count mode', 'Base unit', 'Container capacity L', 'Whole / sealed', 'Open liters', 'Full kegs', 'Partial keg fraction', 'Target', 'Counted', 'Gap']) {
    assert.ok(workspace.includes(`'${header}'`));
  }
  assert.match(workspace, /inventoryCsvNumeric/);
});

console.log(`Inventory structured quantity assertions: ${passes}/${passes} passed.`);
