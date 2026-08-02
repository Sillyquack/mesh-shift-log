import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  BOBBY_OWNED_MILLUM_GROUPS,
  calculateFixedReserveTarget,
  filterOwnedInventoryCatalogue,
  INVENTORY_REFRIGERATOR_DEFINITIONS,
  isBobbyOwnedMillumGroup,
  MILLUM_KITCHEN_GROUPS_EXCLUDED_FROM_BOBBY_SCOPE,
} from '../src/data/inventoryOperationalScope.js';
import { PHASE9_TERMINAL_MIGRATION, readPhase9MigrationManifest, validatedPhase9MigrationEntries } from './phase9MigrationOrder.mjs';

const migration = readFileSync(new URL('../supabase/phase9g_inventory_operational_scope.sql', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/lib/inventoryClient.js', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../src/components/InventoryWorkspace.jsx', import.meta.url), 'utf8');

function dollarJson(label) {
  const match = migration.match(new RegExp(`\\$${label}\\$\\s*([\\s\\S]*?)\\s*\\$${label}\\$::jsonb`));
  assert.ok(match, `${label} JSON block must exist`);
  return JSON.parse(match[1]);
}

const catalogue = dollarJson('catalogue');
const aliases = dollarJson('aliases');
const defaults = dollarJson('defaults');
const unresolved = dollarJson('unresolved');

test('operational model defines exactly the six real refrigerators', () => {
  assert.deepEqual(INVENTORY_REFRIGERATOR_DEFINITIONS.map(({ name }) => name), [
    'Cornerbar Left Fridge',
    'Cornerbar Middle Fridge',
    'Cornerbar Right Fridge',
    'Workbar Bar Left Fridge',
    'Workbar Bar Right Fridge',
    'Workbar Non-Alco Fridge',
  ]);
  assert.equal(new Set(INVENTORY_REFRIGERATOR_DEFINITIONS.map(({ code }) => code)).size, 6);
});

test('no Workbar Bar Middle refrigerator is defined, seeded, or shown', () => {
  const combined = `${JSON.stringify(INVENTORY_REFRIGERATOR_DEFINITIONS)} ${workspace}`;
  assert.doesNotMatch(combined, /Workbar Bar Middle Fridge|WORKBAR_BAR_MIDDLE_FRIDGE/i);
});

test('legacy location rows are renamed in place to the six stable operational codes', () => {
  for (const legacyCode of ['CORNERBAR_FRIDGE_1', 'CORNERBAR_FRIDGE_2', 'CORNERBAR_FRIDGE_3', 'WORKBAR_FRIDGE_1', 'WORKBAR_FRIDGE_2', 'WORKBAR_FRIDGE_3']) assert.match(migration, new RegExp(`'${legacyCode}'`));
  assert.match(migration, /set name = input_name, code = input_code[\s\S]*?where location\.id = v_location\.id/i);
});

test('ownership is derived only from the seven explicit Millum groups', () => {
  assert.deepEqual(BOBBY_OWNED_MILLUM_GROUPS, ['HARD ALCOHOL', 'COFFEE', 'SNACKS', 'SODAS', 'WINE', 'BEER', 'Cocktail ingredients']);
  for (const group of BOBBY_OWNED_MILLUM_GROUPS) assert.equal(isBobbyOwnedMillumGroup(group), true);
  for (const group of MILLUM_KITCHEN_GROUPS_EXCLUDED_FROM_BOBBY_SCOPE) assert.equal(isBobbyOwnedMillumGroup(group), false);
  assert.deepEqual([...new Set(catalogue.map((item) => item.group))], BOBBY_OWNED_MILLUM_GROUPS);
});

test('coffee, snacks, and cocktail goods remain included while ordinary kitchen groups remain excluded', () => {
  assert.ok(catalogue.some((item) => item.group === 'COFFEE'));
  assert.ok(catalogue.some((item) => item.group === 'SNACKS'));
  assert.ok(catalogue.some((item) => item.group === 'Cocktail ingredients'));
  assert.equal(catalogue.some((item) => MILLUM_KITCHEN_GROUPS_EXCLUDED_FROM_BOBBY_SCOPE.includes(item.group)), false);
});

test('catalogue preserves 99 stable Millum identities and 100 ordered group memberships', () => {
  assert.equal(new Set(catalogue.map((item) => item.ref)).size, 99);
  assert.equal(catalogue.length, 100);
  assert.equal(catalogue.filter((item) => item.group === 'HARD ALCOHOL').reduce((total, item) => total + item.occurrences, 0), 40);
  assert.ok(catalogue.every((item) => item.ref && item.name && item.group && item.unit && item.groupOrder > 0 && item.itemOrder > 0));
});

test('catalogue search matches official name, practical name, verified alias, and Millum item reference', () => {
  const products = [{
    id: 'stable-product-id', name: 'OFFICIAL MILLUM NAME', shortName: 'Practical', aliases: ['House alias'],
    millumItemRef: '123456', ownershipStatus: 'owned', active: true,
    millumGroups: [{ name: 'SODAS', groupSortOrder: 8, itemSortOrder: 1 }],
  }];
  for (const search of ['official', 'practical', 'house alias', '123456']) assert.equal(filterOwnedInventoryCatalogue(products, { search }).length, 1);
  assert.equal(filterOwnedInventoryCatalogue(products, { millumGroup: 'SODAS' }).length, 1);
  assert.equal(filterOwnedInventoryCatalogue(products, { millumGroup: 'WINE' }).length, 0);
});

test('refrigerator defaults contain only 37 product-ID-resolvable confirmed rows', () => {
  assert.equal(defaults.length, 37);
  const refs = new Set(catalogue.map((item) => item.ref));
  assert.ok(defaults.every((item) => refs.has(item.ref) && item.quantity >= 0 && item.order > 0));
  assert.match(migration, /location_id, product_id, par_quantity, count_order/);
  assert.doesNotMatch(workspace.slice(workspace.indexOf('function RefrigeratorDefaultsManager'), workspace.indexOf('function StandardsManager')), /Add custom product|Product name<input/);
});

test('temporary observations and substitutions are never refrigerator defaults', () => {
  const seededRefs = new Set(defaults.map((item) => item.ref));
  assert.equal(seededRefs.has('4000232'), false, 'Abbazia observation is not a default');
  assert.equal(seededRefs.has('6017933'), false, 'Sparkling Tea observation is not a default');
  assert.equal(defaults.some((item) => /Schweppes/i.test(item.name || '')), false);
});

test('all 16 ambiguous default rows remain explicit unresolved mappings', () => {
  assert.equal(unresolved.length, 16);
  assert.equal(unresolved.filter((item) => item.name === 'Farris').length, 3);
  assert.ok(unresolved.some((item) => item.name === 'Schweppes Indian Tonic' && item.candidates.length === 0));
  assert.ok(unresolved.every((item) => item.reason && Array.isArray(item.candidates)));
});

test('ambiguous aliases are not silently attached to stable products', () => {
  const aliasNames = new Set(aliases.map((item) => item.alias.toLowerCase()));
  for (const unresolvedAlias of ['blonde', 'passion', 'pils', 'ginger ninja', 'skog', 'eple', 'rabarbra', 'hylle', 'pepsi', 'farris', 'eple & eple', 'appelsinjuice']) assert.equal(aliasNames.has(unresolvedAlias), false);
  assert.equal(new Set(aliases.map((item) => item.alias.toLowerCase())).size, aliases.length);
});

test('fixed reserve is three times combined refrigerator defaults unless overridden', () => {
  assert.deepEqual(calculateFixedReserveTarget(74), { refrigeratorDefault: 74, reserveTarget: 222, combinedDesired: 296, overridden: false });
  assert.deepEqual(calculateFixedReserveTarget(74, 50), { refrigeratorDefault: 74, reserveTarget: 50, combinedDesired: 124, overridden: true });
  assert.throws(() => calculateFixedReserveTarget(-1), /non-negative finite/);
});

test('reserve SQL derives by stable product ID and supports a manager-only override', () => {
  assert.match(migration, /standard\.product_id = product\.id/);
  assert.match(migration, /sum\(standard\.par_quantity\)[\s\S]*?\* 3/);
  assert.match(migration, /create or replace function public\.set_inventory_product_reserve_override/);
  assert.match(migration, /inventory_resolve_actor\(null\)/);
  assert.doesNotMatch(migration, /join[\s\S]{0,100}lower\(trim\(product\.name\)\)/i);
});

test('default editing and verification are manager-only and direct table writes stay revoked', () => {
  assert.match(workspace, /\{manager && <button[^\n]*?>Manage<\/button>\}/);
  assert.match(migration, /revoke all privileges on table public\.inventory_refrigerator_templates from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.verify_inventory_refrigerator_template\(uuid\) to authenticated/);
  assert.match(migration, /current_user_can_manage_inventory_config\(\)/);
});

test('template status is visibly incomplete or verified and edits invalidate verification', () => {
  assert.match(workspace, /template\?\.status === 'verified' \? 'Verified' : 'Incomplete'/);
  assert.match(migration, /inventory_location_products_phase9g_template_state/);
  assert.match(migration, /set template_status = 'incomplete', verified_at = null/);
});

test('free-text duplicate catalogue products are blocked in both UI and database', () => {
  assert.match(workspace, /already represents this official or practical name/);
  assert.match(workspace, /Boolean\(representedProduct\)/);
  assert.match(migration, /inventory_products_phase9g_prevent_duplicate/);
  assert.match(migration, /existing stable Millum product or verified alias already represents/i);
});

test('Phase 9G never rewrites completed or approved session history', () => {
  assert.doesNotMatch(migration, /update\s+public\.inventory_count_(?:sessions|lines)/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.inventory_count_(?:sessions|lines)/i);
  assert.doesNotMatch(migration, /drop trigger if exists inventory_count_lines_integrity/i);
});

test('Phase 9G-B2 is the sole repeatable terminal migration after Phase 9G-B', () => {
  const manifest = readPhase9MigrationManifest();
  const entries = validatedPhase9MigrationEntries(manifest);
  assert.equal(PHASE9_TERMINAL_MIGRATION, 'supabase/phase9gb2_inventory_counter_replacement.sql');
  assert.equal(entries.at(-1).path, PHASE9_TERMINAL_MIGRATION);
  assert.deepEqual(entries.filter((entry) => entry.repeatable).map((entry) => entry.path), [PHASE9_TERMINAL_MIGRATION]);
  assert.ok(entries.findIndex((entry) => entry.path.includes('phase9f_')) < entries.findIndex((entry) => entry.path.includes('phase9g_inventory_')));
  assert.equal(entries.at(-2).path, 'supabase/phase9gb_inventory_counter_assignments.sql');
});

test('client loads category, alias, unresolved, template, and reserve records without text-derived identities', () => {
  for (const field of ['millum_item_ref', 'inventory_product_aliases', 'inventory_product_catalogue_groups', 'inventory_refrigerator_templates', 'inventory_catalogue_unresolved_mappings', 'inventory_refrigerator_reserve_targets']) assert.ok(client.includes(field));
  assert.match(client, /productId: row\.product_id/);
});
