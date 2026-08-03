import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  PHASE9_PRODUCT_MAPPING_MIGRATION,
  PHASE9_TERMINAL_MIGRATION,
  readPhase9MigrationManifest,
  validatedPhase9MigrationEntries,
} from './phase9MigrationOrder.mjs';

const migration = readFileSync(new URL('../supabase/phase9gd_inventory_product_mappings.sql', import.meta.url), 'utf8');
const operationalMigration = readFileSync(new URL('../supabase/phase9g_inventory_operational_scope.sql', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const aggregate = readFileSync(new URL('./verify-phase9-all.mjs', import.meta.url), 'utf8');

function dollarJson(source, label) {
  const match = source.match(new RegExp(`\\$${label}\\$\\s*([\\s\\S]*?)\\s*\\$${label}\\$::jsonb`));
  assert.ok(match, `${label} JSON block must exist`);
  return JSON.parse(match[1]);
}

const products = dollarJson(migration, 'phase9gd_products');
const defaults = dollarJson(migration, 'phase9gd_defaults');
const resolutions = dollarJson(migration, 'phase9gd_resolutions');
const originalDefaults = dollarJson(operationalMigration, 'defaults');
const originalUnresolved = dollarJson(operationalMigration, 'unresolved');
const byRef = new Map(products.map((product) => [product.ref, product]));

function defaultsFor(ref) {
  return defaults.filter((item) => item.ref === ref);
}

test('Phase 9G-D validates exactly the 13 confirmed stable catalogue identities', () => {
  assert.equal(products.length, 13);
  assert.equal(byRef.size, 13);
  assert.deepEqual([...byRef.keys()].sort(), [
    '4966818', '5010707', '5010715', '5104666', '5804190', '5932918', '6181002',
    '6388581', '6503346', '6631634', '6752422', '707000631', '814467',
  ].sort());
});

test('Fever-Tree Ginger Beer uses the exact existing 0.5 L Millum identity', () => {
  assert.deepEqual(byRef.get('5010715'), {
    ref: '5010715',
    officialName: 'GINGER BEER MIXER 0,5L FL FEVER-TREE (0.5 ltr)',
    displayName: 'Fever-Tree Ginger Beer',
    category: 'Sodas',
    inventoryUnit: 'unit',
  });
});

test('all 17 authoritative location standards retain exact individual-unit quantities and order', () => {
  assert.equal(defaults.length, 17);
  assert.ok(defaults.every((item) => Number.isInteger(item.quantity) && item.quantity >= 0 && item.order > 0));
  assert.match(migration, /individual refrigerator units/i);
});

test('every mapped product uses the refrigerator inventory unit rather than its Millum package unit', () => {
  assert.ok(products.every((product) => product.inventoryUnit === 'unit'));
  assert.doesNotMatch(JSON.stringify(defaults), /case|carton|crate|krt|crt/i);
});

test('Cornerbar Right receives the ten Bobby-confirmed standards', () => {
  assert.equal(defaults.filter((item) => item.location === 'CORNERBAR_RIGHT_FRIDGE').length, 10);
});

test('Cornerbar and Workbar Fruktsmekk Eple share one stable product identity', () => {
  assert.deepEqual(defaultsFor('6388581').map(({ location, quantity }) => ({ location, quantity })), [
    { location: 'CORNERBAR_RIGHT_FRIDGE', quantity: 4 },
    { location: 'WORKBAR_NON_ALCO_FRIDGE', quantity: 12 },
  ]);
});

test('all three Farris defaults use Naturell and never Farris Lime', () => {
  assert.equal(defaultsFor('5104666').length, 3);
  assert.equal(defaultsFor('5104641').length, 0);
  assert.equal(byRef.get('5104666').displayName, 'Farris Naturell');
});

test('both Skog defaults use the 0.33 L identity and never the 0.75 L identity', () => {
  assert.equal(defaultsFor('6631634').length, 2);
  assert.equal(defaultsFor('4030686').length, 0);
  assert.match(byRef.get('6631634').officialName, /0,33L/);
});

test('Pils uses the Aass bottle identity and never the keg identity', () => {
  assert.equal(defaultsFor('5932918').length, 1);
  assert.equal(defaultsFor('4019089').length, 0);
  assert.equal(byRef.get('5932918').displayName, 'Aass Pils');
});

test('Ginger Ninja resolves to Nordic Berries without creating a global generic alias', () => {
  assert.equal(defaultsFor('6181002').length, 1);
  assert.equal(byRef.get('6181002').displayName, 'Ginger Ninja Nordic Berries');
  assert.doesNotMatch(migration, /insert\s+into\s+public\.inventory_product_aliases/i);
});

test('Norwegian Blonde and Oslove Passion Blonde remain separate identities', () => {
  assert.notEqual(defaultsFor('707000631')[0].ref, defaultsFor('4966818')[0].ref);
  assert.equal(byRef.get('707000631').displayName, 'Norwegian Blonde');
  assert.equal(byRef.get('4966818').displayName, 'Oslove Passion Blonde');
});

test('Rabarbra and Hylle remain separate stable products', () => {
  assert.notEqual(defaultsFor('5804190')[0].ref, defaultsFor('6503346')[0].ref);
  assert.match(byRef.get('5804190').displayName, /Rabarbra/);
  assert.match(byRef.get('6503346').displayName, /Hylleblomst/);
});

test('Appelsinjuice uses Juiceriet 250 ml and never Eldorado 1.5 L', () => {
  assert.equal(defaultsFor('6752422').length, 1);
  assert.equal(defaultsFor('3221686').length, 0);
  assert.equal(byRef.get('6752422').displayName, 'Appelsinjuice 250 ml');
});

test('Workbar Bar Right ends with two Fever-Tree standards at quantity two', () => {
  const feverTree = defaults.filter((item) => item.location === 'WORKBAR_BAR_RIGHT_FRIDGE' && ['5010707', '5010715'].includes(item.ref));
  assert.deepEqual(feverTree.map(({ ref, quantity }) => ({ ref, quantity })), [
    { ref: '5010715', quantity: 2 },
    { ref: '5010707', quantity: 2 },
  ]);
});

test('the existing Workbar Ginger Beer row is updated in place instead of counted as a new default', () => {
  assert.ok(originalDefaults.some((item) => item.location === 'WORKBAR_BAR_RIGHT_FRIDGE' && item.ref === '5010715' && item.quantity === 4));
  assert.match(migration, /on conflict \(location_id, product_id\) do update/i);
});

test('the 15 confirmed audit records resolve to exact Millum references', () => {
  assert.equal(resolutions.length, 15);
  assert.equal(new Set(resolutions.map((item) => `${item.location}|${item.name}`)).size, 15);
  assert.ok(resolutions.every((resolution) => byRef.has(resolution.ref)));
});

test('Schweppes is dismissed as audit evidence and is never persisted as a standard', () => {
  assert.equal(defaults.some((item) => /schweppes/i.test(JSON.stringify(item))), false);
  assert.match(migration, /resolution_status = 'dismissed'/);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.inventory_products[\s\S]*?Schweppes/i);
});

test('discontinued Aass Eplemost is only deactivated at refrigerator standards', () => {
  assert.equal(defaultsFor('5744222').length, 0);
  assert.match(migration, /product\.millum_item_ref = '5744222'[\s\S]*?standard\.active/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.inventory_products/i);
});

test('no authoritative location and product pair is duplicated', () => {
  const keys = defaults.map((item) => `${item.location}|${item.ref}`);
  assert.equal(new Set(keys).size, keys.length);
});

test('the verified terminal total is 53 rather than the proposed 54', () => {
  const additions = defaults.filter((item) => !originalDefaults.some((original) => original.location === item.location && original.ref === item.ref));
  assert.equal(originalDefaults.length, 37);
  assert.equal(additions.length, 16);
  assert.equal(originalDefaults.length + additions.length, 53);
});

test('the source handoff contains exactly 37 persisted defaults and 16 unresolved audit records', () => {
  assert.equal(originalDefaults.length, 37);
  assert.equal(originalUnresolved.length, 16);
  assert.equal(originalUnresolved.filter((item) => item.name === 'Schweppes Indian Tonic').length, 1);
});

test('stable UUIDs are selected by Millum reference and never hard-coded', () => {
  assert.match(migration, /product\.millum_item_ref = v_item\.ref/g);
  assert.doesNotMatch(migration, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
});

test('Phase 9G-D changes no RLS, grant, alias, session, or count-line definition', () => {
  assert.doesNotMatch(migration, /create\s+policy|alter\s+table[^;]+enable\s+row\s+level\s+security|\bgrant\b|inventory_product_aliases/i);
  assert.doesNotMatch(migration, /(?:update|delete\s+from)\s+public\.inventory_count_(?:sessions|lines)/i);
});

test('Phase 9G-D remains the product-mapping layer before repeatable Phase 9H and terminal Phase 9I', () => {
  const manifest = readPhase9MigrationManifest();
  const entries = validatedPhase9MigrationEntries(manifest);
  assert.equal(PHASE9_PRODUCT_MAPPING_MIGRATION, 'supabase/phase9gd_inventory_product_mappings.sql');
  assert.equal(PHASE9_TERMINAL_MIGRATION, 'supabase/phase9i_millum_stock_count_exports.sql');
  assert.equal(entries.at(-2).path, 'supabase/phase9h_inventory_session_location_scope.sql');
  assert.equal(entries.at(-3).path, PHASE9_PRODUCT_MAPPING_MIGRATION);
  assert.equal(entries.at(-4).path, 'supabase/phase9gc_inventory_counter_mobile.sql');
  assert.deepEqual(entries.filter((entry) => entry.repeatable).map((entry) => entry.path), [entries.at(-2).path, PHASE9_TERMINAL_MIGRATION]);
  assert.equal(packageJson.scripts['verify:inventory-product-mappings'], 'node scripts/verify-inventory-product-mappings.mjs');
  assert.match(aggregate, /verify:inventory-product-mappings/);
});
