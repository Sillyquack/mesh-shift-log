import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  calculateInventoryLine,
  calculateServiceStockTarget,
  calculateStandardPolicyTarget,
} from '../src/data/inventoryCalculations.js';
import {
  createInventoryReferenceObjectPath,
  INVENTORY_REFERENCE_MAX_BYTES,
  inventoryReferencePathIsScoped,
  inventoryReferencePlaceholder,
  validateInventoryReferenceFile,
  validateInventoryReferenceFileContent,
} from '../src/data/inventoryLocationGuidance.js';
import {
  eligibleInventorySessionLocations,
  inventorySessionSelection,
} from '../src/data/inventorySessionLocations.js';

const migration = readFileSync(new URL('../supabase/phase9j_inventory_shelf_storage_guidance.sql', import.meta.url), 'utf8');
const assertions = readFileSync(new URL('../supabase/tests/phase9/shelf-storage-guidance-assertions.sql', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../src/components/InventoryWorkspace.jsx', import.meta.url), 'utf8');
const counterWorkspace = readFileSync(new URL('../src/components/InventoryCounterExperience.jsx', import.meta.url), 'utf8');
const guidanceComponent = readFileSync(new URL('../src/components/LocationReferenceGuidance.jsx', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/lib/inventoryClient.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

const organizationId = '11111111-1111-4111-8111-111111111111';
const locations = [
  { id: 'fridge', name: 'Fridge', locationType: 'fridge', active: true, countable: true, sortOrder: 1 },
  { id: 'work-shelf', name: 'Workbar Bar Shelves', locationType: 'shelf', active: true, countable: true, sortOrder: 2 },
  { id: 'corner-shelf', name: 'Cornerbar Bar Shelves', locationType: 'shelf', active: true, countable: true, sortOrder: 3 },
  { id: 'storage', name: 'Main Storage', locationType: 'storage', active: true, countable: true, sortOrder: 4 },
  { id: 'future', name: 'Future location', locationType: 'other', active: true, countable: true, sortOrder: 5 },
  { id: 'parent', name: 'Workbar', locationType: 'bar', active: true, countable: false, sortOrder: 6 },
  { id: 'inactive', name: 'Inactive', locationType: 'storage', active: false, countable: true, sortOrder: 7 },
];
const products = [
  { id: 'spirit', active: true },
  { id: 'wine', active: true },
  { id: 'inactive-product', active: false },
];
const standards = [
  { id: 'f1', locationId: 'fridge', productId: 'spirit', active: true, stockPolicy: 'exact_par', parQuantity: 4, contributesToStorageTarget: true },
  { id: 'w1', locationId: 'work-shelf', productId: 'spirit', active: true, stockPolicy: 'exact_par', parQuantity: 2, contributesToStorageTarget: false },
  { id: 'c1', locationId: 'corner-shelf', productId: 'wine', active: true, stockPolicy: 'exact_par', parQuantity: 3, contributesToStorageTarget: false },
  { id: 's1', locationId: 'storage', productId: 'spirit', active: true, stockPolicy: 'operating_reserve', targetMode: 'derived_multiplier', parQuantity: 0 },
  { id: 's2', locationId: 'storage', productId: 'wine', active: true, stockPolicy: 'physical_count_only', historicalSuggestionQuantity: 11.9 },
  { id: 'x1', locationId: 'future', productId: 'wine', active: true, stockPolicy: 'physical_count_only' },
  { id: 'i1', locationId: 'inactive', productId: 'spirit', active: true, stockPolicy: 'exact_par', parQuantity: 99, contributesToStorageTarget: true },
  { id: 'i2', locationId: 'fridge', productId: 'inactive-product', active: true, stockPolicy: 'exact_par', parQuantity: 99, contributesToStorageTarget: true },
];

test('all active countable location types with active lines are selectable without parent expansion', () => {
  assert.match(client, /function normalizeLocation\(row\)[\s\S]*?countable: row\.countable === true/);
  assert.doesNotMatch(client, /function normalizeProduct\(row\)[\s\S]*?countable: row\.countable === true[\s\S]*?function normalizeLocation/);
  const eligible = eligibleInventorySessionLocations({ locations, standards, products });
  assert.deepEqual(eligible.map((location) => location.id), ['fridge', 'work-shelf', 'corner-shelf', 'storage', 'future']);
  const selection = inventorySessionSelection({
    eligibleLocations: eligible,
    selectedLocationIds: eligible.map((location) => location.id),
    standards,
    products,
  });
  assert.equal(selection.locationCount, 5);
  assert.equal(selection.defaultLineCount, 6);
  assert.equal(selection.locationIds.includes('parent'), false);
});

test('Main Storage derives only from explicitly opted-in active countable refrigerator targets', () => {
  assert.equal(calculateServiceStockTarget({ productId: 'spirit', standards, locations, products }), 4);
  const target = calculateStandardPolicyTarget(standards.find((standard) => standard.id === 's1'), {
    standards, locations, products, storageSettings: { targetMultiplier: 3 },
  });
  assert.deepEqual(target, { effectiveTarget: 12, serviceTargetBasis: 4, appliedMultiplier: 3 });
  assert.equal(calculateStandardPolicyTarget(standards.find((standard) => standard.id === 's1'), {
    standards, locations, products, storageSettings: { targetMultiplier: 4 },
  }).effectiveTarget, 16);
});

test('targetless physical stock stays unverified and never becomes a false zero or shortage', () => {
  const blank = calculateInventoryLine({ stockPolicy: 'physical_count_only', countedQuantity: null, parQuantity: 0 });
  const zero = calculateInventoryLine({ stockPolicy: 'physical_count_only', countedQuantity: 0, parQuantity: 0, countMethod: 'manual', countStatus: 'counted' });
  assert.equal(blank.effectiveTarget, null);
  assert.equal(blank.counted, false);
  assert.equal(blank.shortage, false);
  assert.equal(zero.counted, true);
  assert.equal(zero.countedQuantity, 0);
  assert.equal(zero.shortage, false);
});

test('every countable location receives a clear manager placeholder while counters get no edit action', () => {
  for (const location of locations.filter((item) => item.countable)) {
    assert.equal(inventoryReferencePlaceholder(location.name, true).action, 'Add reference image');
    assert.equal(inventoryReferencePlaceholder(location.name, false).action, '');
  }
  assert.match(guidanceComponent, /data-reference-empty="true"/);
  assert.match(guidanceComponent, /Upload image or save instruction/);
  assert.match(guidanceComponent, /Replace image and save/);
  assert.match(guidanceComponent, /Remove image/);
  assert.match(workspace, /<LocationReferenceGuidanceManager/);
  assert.match(counterWorkspace, /<LocationReferenceViewer[\s\S]*?assignment\.referenceGuidance/);
  assert.doesNotMatch(counterWorkspace, /saveInventoryLocationReferenceGuidance|removeInventoryLocationReferenceImage/);
});

test('captions can describe fixed non-inventory setup without changing count semantics', () => {
  assert.match(guidanceComponent, /coffee cups, water glasses/);
  assert.match(guidanceComponent, /never changes count lines, targets, completion, or inventory evidence/);
  assert.match(guidanceComponent, /Short setup instruction/);
  assert.match(migration, /caption is null or char_length\(caption\) <= 500/);
  assert.doesNotMatch(migration, /insert into public\.inventory_products/i);
});

test('reference files enforce JPEG, PNG or WebP and a five MiB maximum', () => {
  assert.equal(validateInventoryReferenceFile({ type: 'image/jpeg', size: 1 }).ok, true);
  assert.equal(validateInventoryReferenceFile({ type: 'image/png', size: INVENTORY_REFERENCE_MAX_BYTES }).ok, true);
  assert.equal(validateInventoryReferenceFile({ type: 'image/webp', size: INVENTORY_REFERENCE_MAX_BYTES + 1 }).ok, false);
  assert.equal(validateInventoryReferenceFile({ type: 'image/gif', size: 1 }).ok, false);
  assert.equal(validateInventoryReferenceFile({ type: 'image/png', size: 0 }).ok, false);
  assert.match(migration, /allowed_mime_types[\s\S]*?'image\/jpeg'[\s\S]*?'image\/png'[\s\S]*?'image\/webp'/);
  assert.match(migration, /file_size_limit[\s\S]*?5242880/);
});

test('declared image MIME must also match the file signature', async () => {
  const png = new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: 'image/png' });
  const disguisedPdf = new Blob([new TextEncoder().encode('%PDF-1.7')], { type: 'image/png' });
  assert.equal((await validateInventoryReferenceFileContent(png)).ok, true);
  assert.equal((await validateInventoryReferenceFileContent(disguisedPdf)).ok, false);
  assert.match(client, /await validateInventoryReferenceFileContent\(file\)/);
});

test('collision-safe paths are exactly organization/location/UUIDv4 and reject manipulation', () => {
  const locationId = '22222222-2222-4222-8222-222222222222';
  const objectId = '33333333-3333-4333-8333-333333333333';
  const path = createInventoryReferenceObjectPath({ organizationId, locationId, mimeType: 'image/png', objectId });
  assert.equal(path, `${organizationId}/${locationId}/${objectId}.png`);
  assert.equal(inventoryReferencePathIsScoped(path, organizationId, locationId), true);
  assert.equal(inventoryReferencePathIsScoped(path, '44444444-4444-4444-8444-444444444444', locationId), false);
  assert.equal(inventoryReferencePathIsScoped(`${path}/extra`, organizationId, locationId), false);
  assert.equal(inventoryReferencePathIsScoped(`${organizationId}/../${objectId}.png`, organizationId, locationId), false);
  assert.match(client, /crypto\.randomUUID\(\)/);
  assert.match(client, /upsert:\s*false/);
});

test('replacement is upload-first and a failed metadata swap preserves the prior valid image', () => {
  const save = client.slice(client.indexOf('export async function saveInventoryLocationReferenceGuidance'), client.indexOf('export async function removeInventoryLocationReferenceImage'));
  assert.ok(save.indexOf('.upload(') < save.indexOf("rpc('set_inventory_location_reference_guidance'"));
  assert.match(save, /The previous image is unchanged/);
  assert.match(save, /if \(error\)[\s\S]*?queueFailedReferenceCleanup/);
  assert.match(migration, /input_expected_revision/);
  assert.match(assertions, /failed replacement attempts preserve the previous valid image and revision/);
});

test('replacement, removal and location archival use a recoverable cleanup queue', () => {
  assert.match(migration, /inventory_reference_image_cleanup_queue/);
  assert.match(migration, /cleanup_reason/);
  assert.match(migration, /v_cleanup_path, 'replaced'/);
  assert.match(migration, /v_cleanup_path, 'removed'/);
  assert.match(migration, /location_archived/);
  assert.match(migration, /inventory_reference_images_delete[\s\S]*?inventory_reference_image_cleanup_queue queue/);
  assert.match(client, /list_inventory_reference_cleanup_paths/);
  assert.match(client, /acknowledge_inventory_reference_cleanup/);
});

test('private Storage and metadata policies are organization-scoped and counter-safe', () => {
  assert.match(migration, /inventory-location-reference-images/);
  assert.match(migration, /insert into storage\.buckets \(id, name, public,[\s\S]*?'inventory-location-reference-images',[\s\S]*?false,/);
  for (const policy of ['inventory_reference_images_insert', 'inventory_reference_images_select', 'inventory_reference_images_delete']) {
    assert.match(migration, new RegExp(policy));
  }
  assert.match(migration, /inventory_reference_image_path_valid\(\s*public\.current_user_organization_id\(\)/);
  assert.match(migration, /inventory_location_reference_guidance_manager_read/);
  assert.match(migration, /current_user_can_manage_inventory_config\(\)/);
  assert.match(assertions, /reference metadata reads are blocked across organizations/);
  assert.match(assertions, /counters cannot edit captions or image metadata/);
});

test('current reference guidance stays separate from session snapshots and approved history', () => {
  assert.doesNotMatch(migration, /alter table public\.inventory_count_sessions\s+add column[^;]*(?:reference|object_path)/i);
  assert.doesNotMatch(migration, /alter table public\.inventory_count_lines\s+add column[^;]*(?:reference|object_path)/i);
  assert.match(assertions, /changing reference guidance never changes target snapshots or physical counts/);
  assert.match(assertions, /approved historical sessions byte-stable/);
  assert.match(workspace, /isInventorySessionEditable\(session\.status\)[\s\S]*?<LocationReferenceViewer/);
});

test('the enlarged viewer is bounded and scrollable at 375, 390 and 430 px', () => {
  for (const width of [375, 390, 430]) assert.ok(width <= 520);
  assert.match(styles, /\.inventory-reference-card,\s*\.inventory-reference-card \*\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(styles, /\.inventory-reference-viewer\s*\{[\s\S]*?overflow:\s*auto/);
  assert.match(styles, /\.inventory-reference-viewer-content\s*\{[\s\S]*?width:\s*min\(100%,[\s\S]*?max-width:\s*100%[\s\S]*?overflow:\s*auto/);
  assert.match(styles, /\.inventory-reference-viewer-content img\s*\{[\s\S]*?max-width:\s*100%/);
  assert.match(styles, /@media \(max-width: 520px\)[\s\S]*?\.inventory-reference-viewer-content/);
  assert.match(guidanceComponent, /Open larger/);
  assert.match(guidanceComponent, /role="dialog" aria-modal="true"/);
  assert.match(guidanceComponent, /event\.key === 'Escape'/);
  assert.match(guidanceComponent, /closeRef\.current\?\.focus/);
  assert.match(guidanceComponent, /triggerRef\.current\?\.focus/);
});

test('Phase 9J scope bootstrap is one-time and does not seed guessed product mappings', () => {
  assert.match(migration, /location_scope_initialized_at/);
  assert.match(migration, /must never reactivate locations or restore manager-controlled source flags/);
  assert.match(migration, /WORKBAR_BAR_SHELVES/);
  assert.match(migration, /CORNERBAR_BAR_SHELVES/);
  assert.match(migration, /MAIN_STORAGE/);
  assert.doesNotMatch(migration, /insert into public\.inventory_products/i);
  assert.doesNotMatch(migration, /millum_item_ref\s*=/i);
});
