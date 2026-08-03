import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  eligibleInventorySessionLocations,
  inventorySessionSelection,
} from '../src/data/inventorySessionLocations.js';

const workspace = readFileSync(new URL('../src/components/InventoryWorkspace.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const selectionSource = readFileSync(new URL('../src/data/inventorySessionLocations.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/phase9j_inventory_shelf_storage_guidance.sql', import.meta.url), 'utf8');

const currentOrganizationId = 'fixture-organization-a';
const foreignOrganizationId = 'fixture-organization-b';
const currentRefrigerators = [
  { id: 'fixture-workbar-bar-left', name: 'Workbar Bar Left Fridge', parentLocationId: 'workbar', sortOrder: 11, defaultCount: 6 },
  { id: 'fixture-workbar-bar-right', name: 'Workbar Bar Right Fridge', parentLocationId: 'workbar', sortOrder: 12, defaultCount: 8 },
  { id: 'fixture-workbar-non-alco', name: 'Workbar Non-Alco Fridge', parentLocationId: 'workbar', sortOrder: 13, defaultCount: 15 },
  { id: 'fixture-cornerbar-left', name: 'Cornerbar Left Fridge', parentLocationId: 'cornerbar', sortOrder: 21, defaultCount: 4 },
  { id: 'fixture-cornerbar-middle', name: 'Cornerbar Middle Fridge', parentLocationId: 'cornerbar', sortOrder: 22, defaultCount: 3 },
  { id: 'fixture-cornerbar-right', name: 'Cornerbar Right Fridge', parentLocationId: 'cornerbar', sortOrder: 23, defaultCount: 17 },
];
const fridgeIds = currentRefrigerators.map((fixture) => fixture.id);
const workbarNonAlcoId = currentRefrigerators.find((fixture) => fixture.name === 'Workbar Non-Alco Fridge').id;
const workbarBarLeftId = currentRefrigerators.find((fixture) => fixture.name === 'Workbar Bar Left Fridge').id;
const locations = [
  { id: 'cornerbar', organizationId: currentOrganizationId, name: 'Cornerbar', locationType: 'bar', active: true, sortOrder: 10 },
  { id: 'workbar', organizationId: currentOrganizationId, name: 'Workbar', locationType: 'bar', active: true, sortOrder: 20 },
  ...currentRefrigerators.map((fixture) => ({
    id: fixture.id,
    organizationId: currentOrganizationId,
    name: fixture.name,
    locationType: 'fridge',
    parentLocationId: fixture.parentLocationId,
    active: true,
    countable: true,
    sortOrder: fixture.sortOrder,
  })),
  { id: 'storage', name: 'Main beverage stock', locationType: 'storage', active: true, countable: false, sortOrder: 30 },
  { id: 'archived-fridge', name: 'Archived fridge', locationType: 'fridge', active: false, countable: true, sortOrder: 31 },
  { id: 'empty-fridge', name: 'Empty fridge', locationType: 'fridge', active: true, countable: true, sortOrder: 32 },
  { id: 'inactive-default-fridge', name: 'Inactive default fridge', locationType: 'fridge', active: true, countable: true, sortOrder: 33 },
  { id: 'inactive-product-fridge', name: 'Inactive product fridge', locationType: 'fridge', active: true, countable: true, sortOrder: 34 },
];
const refrigeratorTemplates = [
  ...fridgeIds,
  'cornerbar',
  'storage',
  'archived-fridge',
  'empty-fridge',
  'inactive-default-fridge',
  'inactive-product-fridge',
].map((locationId) => ({ locationId }));
const products = [
  ...Array.from({ length: 54 }, (_, index) => ({
    id: `product-${index + 1}`,
    organizationId: currentOrganizationId,
    active: index !== 53,
  })),
  { id: 'foreign-organization-product', organizationId: foreignOrganizationId, active: true },
];
const standards = [];
let productIndex = 0;
for (const fixture of currentRefrigerators) {
  for (let index = 0; index < fixture.defaultCount; index += 1) {
    standards.push({
      id: `default-${productIndex + 1}`,
      organizationId: currentOrganizationId,
      locationId: fixture.id,
      productId: products[productIndex].id,
      active: true,
    });
    productIndex += 1;
  }
}
standards.push(
  { id: 'parent-default', locationId: 'cornerbar', productId: 'product-1', active: true },
  { id: 'storage-default', locationId: 'storage', productId: 'product-1', active: true },
  { id: 'archived-fridge-default', locationId: 'archived-fridge', productId: 'product-1', active: true },
  { id: 'inactive-default', locationId: 'inactive-default-fridge', productId: 'product-1', active: false },
  { id: 'inactive-product-default', locationId: 'inactive-product-fridge', productId: 'product-54', active: true },
  { id: 'inactive-selected-default', organizationId: currentOrganizationId, locationId: workbarNonAlcoId, productId: 'product-1', active: false },
  { id: 'foreign-organization-default', organizationId: foreignOrganizationId, locationId: 'foreign-organization-fridge', productId: 'foreign-organization-product', active: true },
);

const eligibilityInput = { locations, standards, products, refrigeratorTemplates };

test('eligibility derives the current six operational refrigerators and 53 active defaults', () => {
  const eligible = eligibleInventorySessionLocations(eligibilityInput);
  const selection = inventorySessionSelection({
    eligibleLocations: eligible,
    selectedLocationIds: eligible.map((location) => location.id),
    standards,
    products,
  });
  assert.deepEqual(eligible.map((location) => location.id), fridgeIds);
  assert.equal(selection.locationCount, 6);
  assert.equal(selection.defaultLineCount, 53);
});

test('Workbar Non-Alco represents exactly 15 active defaults', () => {
  const eligible = eligibleInventorySessionLocations(eligibilityInput);
  const selection = inventorySessionSelection({
    eligibleLocations: eligible,
    selectedLocationIds: [workbarNonAlcoId],
    standards,
    products,
  });
  assert.equal(selection.locationCount, 1);
  assert.equal(selection.defaultLineCount, 15);
});

test('parents, storage, empty, archived, inactive-default, and inactive-product locations are excluded', () => {
  const eligibleIds = new Set(eligibleInventorySessionLocations(eligibilityInput).map((location) => location.id));
  for (const id of ['cornerbar', 'workbar', 'storage', 'empty-fridge', 'archived-fridge', 'inactive-default-fridge', 'inactive-product-fridge']) {
    assert.equal(eligibleIds.has(id), false, id);
  }
});

test('eligibility automatically admits a new countable location with an active persisted standard', () => {
  const eligible = eligibleInventorySessionLocations({
    locations: [...locations, { id: 'future-fridge', name: 'Future fridge', locationType: 'fridge', active: true, countable: true, sortOrder: 40 }],
    standards: [...standards, { id: 'future-default', locationId: 'future-fridge', productId: 'product-1', active: true }],
    products,
    refrigeratorTemplates: [...refrigeratorTemplates, { locationId: 'future-fridge' }],
  });
  assert.equal(eligible.some((location) => location.id === 'future-fridge'), true);
  assert.equal(eligible.length, 7);
});

test('deselecting Workbar Non-Alco produces the production-proven 5/38 scope', () => {
  const eligible = eligibleInventorySessionLocations(eligibilityInput);
  const selection = inventorySessionSelection({
    eligibleLocations: eligible,
    selectedLocationIds: fridgeIds.filter((locationId) => locationId !== workbarNonAlcoId),
    standards,
    products,
  });
  assert.equal(selection.locationCount, 5);
  assert.equal(selection.defaultLineCount, 38);
});

test("deselecting another refrigerator subtracts that refrigerator's actual default count", () => {
  const eligible = eligibleInventorySessionLocations(eligibilityInput);
  const selection = inventorySessionSelection({
    eligibleLocations: eligible,
    selectedLocationIds: fridgeIds.filter((locationId) => locationId !== workbarBarLeftId),
    standards,
    products,
  });
  assert.equal(selection.locationCount, 5);
  assert.equal(selection.defaultLineCount, 47);
});

test('represented defaults are derived from selected active data rather than a hard-coded total', () => {
  const eligible = eligibleInventorySessionLocations(eligibilityInput);
  const dynamicProduct = { id: 'dynamic-product', active: true };
  const selection = inventorySessionSelection({
    eligibleLocations: eligible,
    selectedLocationIds: fridgeIds,
    standards: [...standards, {
      id: 'dynamic-default',
      locationId: workbarBarLeftId,
      productId: dynamicProduct.id,
      active: true,
    }],
    products: [...products, dynamicProduct],
  });
  assert.equal(selection.defaultLineCount, 54);
});

test('inactive and foreign-organization defaults do not inflate the selected scope', () => {
  const eligible = eligibleInventorySessionLocations(eligibilityInput);
  const selection = inventorySessionSelection({
    eligibleLocations: eligible,
    selectedLocationIds: fridgeIds,
    standards,
    products,
  });
  assert.equal(selection.defaultLineCount, 53);
  assert.notEqual(foreignOrganizationId, currentOrganizationId);
  assert.equal(selection.representedDefaults.some((standard) => standard.id === 'inactive-selected-default'), false);
  assert.equal(selection.representedDefaults.some((standard) => standard.id === 'foreign-organization-default'), false);
});

test('selection sanitizes duplicates and ineligible or foreign-looking identifiers', () => {
  const eligible = eligibleInventorySessionLocations(eligibilityInput);
  const selection = inventorySessionSelection({
    eligibleLocations: eligible,
    selectedLocationIds: [workbarBarLeftId, 'storage', workbarBarLeftId, 'foreign-location'],
    standards,
    products,
  });
  assert.deepEqual(selection.locationIds, [workbarBarLeftId]);
  assert.equal(selection.defaultLineCount, 6);
});

test('session creator renders only derived eligibility and a live selected/default summary', () => {
  assert.match(workspace, /eligibleInventorySessionLocations\(\{[\s\S]*?locations,[\s\S]*?standards,[\s\S]*?products/);
  assert.match(workspace, /inventorySessionSelection\(\{[\s\S]*?selectedLocationIds: draft\.locationIds/);
  assert.match(workspace, /Countable locations with active standards/);
  assert.match(workspace, /role="status" aria-live="polite"/);
  assert.match(workspace, /selection\.locationCount[\s\S]*?selection\.defaultLineCount/);
  assert.match(workspace, /onCreate\(\{ \.\.\.draft, locationIds: selection\.locationIds \}\)/);
  assert.doesNotMatch(workspace, /locationIds:\s*locations\.filter\(\(item\) => item\.active\)/);
  assert.doesNotMatch(workspace, />\s*(?:6|53)\s+(?:eligible|active default)/i);
});

test('the corrected fixture does not hard-code production totals into runtime or database behavior', () => {
  assert.match(selectionSource, /representedDefaults = standards\.filter/);
  assert.match(selectionSource, /selectedIdSet\.has\(standard\.locationId\)/);
  assert.doesNotMatch(selectionSource, /defaultLineCount:\s*(?:38|53)|locationCount:\s*6/);
  assert.match(migration, /location\.organization_id = v_actor\.organization_id/);
});

test('mobile selector controls retain tap size, checkbox geometry, wrapping, focus, and bounded scrolling', () => {
  assert.match(styles, /\.inventory-location-option\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?min-height:\s*48px;/);
  assert.match(styles, /\.inventory-location-option input\[type='checkbox'\]\s*\{[\s\S]*?width:\s*22px;[\s\S]*?min-width:\s*22px;[\s\S]*?flex:\s*0 0 22px;/);
  assert.match(styles, /\.inventory-location-option > span\s*\{[\s\S]*?overflow-wrap:\s*break-word;[\s\S]*?word-break:\s*normal;/);
  assert.match(styles, /\.inventory-location-option:focus-within\s*\{[\s\S]*?outline:/);
  assert.match(styles, /\.inventory-location-picker\s*\{[\s\S]*?max-height:[\s\S]*?overflow-x:\s*hidden;[\s\S]*?overflow-y:\s*auto;/);
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]*?\.inventory-location-picker,[\s\S]*?grid-template-columns:\s*1fr;/);
});

test('Phase 9J validates every selected countable location at the authoritative server boundary', () => {
  assert.match(migration, /security definer\nset search_path = pg_catalog/);
  assert.match(migration, /location\.active[\s\S]*?location\.countable/);
  assert.match(migration, /standard\.active/);
  assert.match(migration, /product\.active/);
  assert.match(migration, /foreach v_location_id in array v_selected_location_ids/);
  assert.match(migration, /location\.organization_id = v_actor\.organization_id/);
  assert.match(migration, /for share of location, standard, product/);
  assert.match(migration, /Every selected location must be active, countable/);
  assert.match(migration, /revoke all on function public\.create_inventory_count_session[\s\S]*?from public, anon, authenticated;[\s\S]*?grant execute[\s\S]*?to authenticated;/);
});

test('the terminal assignment boundary rejects inactive, non-countable, or out-of-session locations', () => {
  assert.match(migration, /inventory_location_is_countable\(input_location_id, v_actor\.organization_id\)/);
  assert.match(migration, /from public\.inventory_count_lines line[\s\S]*?line\.session_id = v_session\.id and line\.location_id = input_location_id/);
  assert.match(migration, /Choose an active countable location in this Stock Count/);
});
