import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  eligibleInventorySessionLocations,
  inventorySessionSelection,
} from '../src/data/inventorySessionLocations.js';

const workspace = readFileSync(new URL('../src/components/InventoryWorkspace.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/phase9h_inventory_session_location_scope.sql', import.meta.url), 'utf8');
const assignments = readFileSync(new URL('../supabase/phase9gb_inventory_counter_assignments.sql', import.meta.url), 'utf8');

const lineCounts = [8, 8, 10, 6, 8, 13];
const fridgeIds = lineCounts.map((_, index) => `fridge-${index + 1}`);
const locations = [
  { id: 'cornerbar', name: 'Cornerbar', locationType: 'bar', active: true, sortOrder: 10 },
  { id: 'workbar', name: 'Workbar', locationType: 'bar', active: true, sortOrder: 20 },
  ...fridgeIds.map((id, index) => ({
    id,
    name: `Operational refrigerator ${index + 1}`,
    locationType: 'fridge',
    parentLocationId: index < 3 ? 'cornerbar' : 'workbar',
    active: true,
    sortOrder: index + 1,
  })),
  { id: 'storage', name: 'Main beverage stock', locationType: 'storage', active: true, sortOrder: 30 },
  { id: 'archived-fridge', name: 'Archived fridge', locationType: 'fridge', active: false, sortOrder: 31 },
  { id: 'empty-fridge', name: 'Empty fridge', locationType: 'fridge', active: true, sortOrder: 32 },
  { id: 'inactive-default-fridge', name: 'Inactive default fridge', locationType: 'fridge', active: true, sortOrder: 33 },
  { id: 'inactive-product-fridge', name: 'Inactive product fridge', locationType: 'fridge', active: true, sortOrder: 34 },
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
const products = Array.from({ length: 54 }, (_, index) => ({
  id: `product-${index + 1}`,
  active: index !== 53,
}));
const standards = [];
let productIndex = 0;
for (const [locationIndex, count] of lineCounts.entries()) {
  for (let index = 0; index < count; index += 1) {
    standards.push({
      id: `default-${productIndex + 1}`,
      locationId: fridgeIds[locationIndex],
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

test('parents, storage, empty, archived, inactive-default, and inactive-product locations are excluded', () => {
  const eligibleIds = new Set(eligibleInventorySessionLocations(eligibilityInput).map((location) => location.id));
  for (const id of ['cornerbar', 'workbar', 'storage', 'empty-fridge', 'archived-fridge', 'inactive-default-fridge', 'inactive-product-fridge']) {
    assert.equal(eligibleIds.has(id), false, id);
  }
});

test('eligibility automatically admits a new refrigerator with a template and active persisted default', () => {
  const eligible = eligibleInventorySessionLocations({
    locations: [...locations, { id: 'future-fridge', name: 'Future fridge', locationType: 'fridge', active: true, sortOrder: 40 }],
    standards: [...standards, { id: 'future-default', locationId: 'future-fridge', productId: 'product-1', active: true }],
    products,
    refrigeratorTemplates: [...refrigeratorTemplates, { locationId: 'future-fridge' }],
  });
  assert.equal(eligible.some((location) => location.id === 'future-fridge'), true);
  assert.equal(eligible.length, 7);
});

test('deselecting a refrigerator updates both selected locations and represented active defaults', () => {
  const eligible = eligibleInventorySessionLocations(eligibilityInput);
  const selection = inventorySessionSelection({
    eligibleLocations: eligible,
    selectedLocationIds: fridgeIds.slice(0, -1),
    standards,
    products,
  });
  assert.equal(selection.locationCount, 5);
  assert.equal(selection.defaultLineCount, 40);
});

test('selection sanitizes duplicates and ineligible or foreign-looking identifiers', () => {
  const eligible = eligibleInventorySessionLocations(eligibilityInput);
  const selection = inventorySessionSelection({
    eligibleLocations: eligible,
    selectedLocationIds: ['fridge-1', 'storage', 'fridge-1', 'foreign-location'],
    standards,
    products,
  });
  assert.deepEqual(selection.locationIds, ['fridge-1']);
  assert.equal(selection.defaultLineCount, 8);
});

test('session creator renders only derived eligibility and a live selected/default summary', () => {
  assert.match(workspace, /eligibleInventorySessionLocations\(\{[\s\S]*?refrigeratorTemplates/);
  assert.match(workspace, /inventorySessionSelection\(\{[\s\S]*?selectedLocationIds: draft\.locationIds/);
  assert.match(workspace, /Refrigerators with active defaults/);
  assert.match(workspace, /role="status" aria-live="polite"/);
  assert.match(workspace, /selection\.locationCount[\s\S]*?selection\.defaultLineCount/);
  assert.match(workspace, /onCreate\(\{ \.\.\.draft, locationIds: selection\.locationIds \}\)/);
  assert.doesNotMatch(workspace, /locationIds:\s*locations\.filter\(\(item\) => item\.active\)/);
  assert.doesNotMatch(workspace, />\s*(?:6|53)\s+(?:eligible|active default)/i);
});

test('mobile selector controls retain tap size, checkbox geometry, wrapping, focus, and bounded scrolling', () => {
  assert.match(styles, /\.inventory-location-option\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?min-height:\s*48px;/);
  assert.match(styles, /\.inventory-location-option input\[type='checkbox'\]\s*\{[\s\S]*?width:\s*22px;[\s\S]*?min-width:\s*22px;[\s\S]*?flex:\s*0 0 22px;/);
  assert.match(styles, /\.inventory-location-option > span\s*\{[\s\S]*?overflow-wrap:\s*break-word;[\s\S]*?word-break:\s*normal;/);
  assert.match(styles, /\.inventory-location-option:focus-within\s*\{[\s\S]*?outline:/);
  assert.match(styles, /\.inventory-location-picker\s*\{[\s\S]*?max-height:[\s\S]*?overflow-x:\s*hidden;[\s\S]*?overflow-y:\s*auto;/);
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]*?\.inventory-location-picker,[\s\S]*?grid-template-columns:\s*1fr;/);
});

test('Phase 9H validates every selected refrigerator at the authoritative server boundary', () => {
  assert.match(migration, /security definer\nset search_path = pg_catalog/);
  assert.match(migration, /inventory_phase9g_is_refrigerator\(location\.id, location\.organization_id\)/);
  assert.match(migration, /inventory_refrigerator_templates template/);
  assert.match(migration, /standard\.active = true/);
  assert.match(migration, /product\.active = true/);
  assert.match(migration, /foreach v_location_id in array v_selected_location_ids/);
  assert.match(migration, /location\.organization_id = v_actor\.organization_id/);
  assert.match(migration, /for share of location, template, standard, product/);
  assert.match(migration, /v_location_count <> cardinality\(v_selected_location_ids\)/);
  assert.match(migration, /revoke all on function public\.create_inventory_count_session[\s\S]*?from public, anon, authenticated;[\s\S]*?grant execute[\s\S]*?to authenticated;/);
  assert.doesNotMatch(migration, /\b(?:create|alter|drop)\s+table\b|\bcreate\s+policy\b|\balter\s+policy\b/i);
});

test('the retained assignment boundary cannot create an assignment for a location without session lines', () => {
  assert.match(assignments, /if not exists \([\s\S]*?from public\.inventory_count_lines line[\s\S]*?line\.session_id = new\.session_id[\s\S]*?line\.location_id = new\.location_id[\s\S]*?Assigned refrigerator is not part of this Stock Count/);
});
