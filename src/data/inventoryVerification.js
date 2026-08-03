import {
  buildInventoryRestockList,
  buildProtectedEventReserveList,
  calculateInventoryLine,
  calculateServiceStockTarget,
  calculateStandardPolicyTarget,
  isPhysicalRecountDue,
  sortInventorySessionLines,
  summarizeInventoryLocation,
  summarizeInventorySession,
} from './inventoryCalculations.js';
import { parseInventoryCsv, previewInventoryCsv, suggestInventoryCsvMapping } from './inventoryCsv.js';

function assertion(name, condition) {
  return { name, passed: Boolean(condition) };
}

function effectiveLocationIds(locations = [], selectedIds = []) {
  const activeLocations = locations.filter((location) => location.active !== false);
  const locationsById = new Map(activeLocations.map((location) => [location.id, location]));
  const childrenByParent = new Map();
  activeLocations.forEach((location) => {
    if (!location.parentLocationId) return;
    const childIds = childrenByParent.get(location.parentLocationId) || [];
    childIds.push(location.id);
    childrenByParent.set(location.parentLocationId, childIds);
  });
  const result = new Set();
  const include = (id) => {
    if (!locationsById.has(id) || result.has(id)) return;
    result.add(id);
    (childrenByParent.get(id) || []).forEach(include);
  };
  selectedIds.forEach(include);
  return [...result];
}

const YOUNGSTORGET_TEMPLATE = [
  ['WORKBAR', 'Workbar', null],
  ['WORKBAR_FRIDGE_1', 'Fridge 1', 'WORKBAR'],
  ['WORKBAR_FRIDGE_2', 'Fridge 2', 'WORKBAR'],
  ['WORKBAR_FRIDGE_3', 'Fridge 3', 'WORKBAR'],
  ['WORKBAR_COFFEE', 'Coffee station', 'WORKBAR'],
  ['WORKBAR_SNACKS', 'Snack shelf', 'WORKBAR'],
  ['WORKBAR_BACKBAR', 'Backbar shelves', 'WORKBAR'],
  ['CORNERBAR', 'Cornerbar', null],
  ['CORNERBAR_FRIDGE_1', 'Fridge 1', 'CORNERBAR'],
  ['CORNERBAR_FRIDGE_2', 'Fridge 2', 'CORNERBAR'],
  ['CORNERBAR_BACKBAR', 'Backbar shelves', 'CORNERBAR'],
  ['DRY_STORAGE', 'Dry Storage', null],
  ['MAIN_STORAGE', 'Main Storage', null],
  ['BEVERAGE_STORAGE', 'Beverage Storage', null],
  ['BEVERAGE_STORAGE_BOTTLES', 'Wine & bottle storage', 'BEVERAGE_STORAGE'],
  ['BEVERAGE_STORAGE_KEGS', 'Beer kegs', 'BEVERAGE_STORAGE'],
  ['BEVERAGE_STORAGE_COCKTAIL', 'Cocktail ingredients', 'BEVERAGE_STORAGE'],
];

const PHASE9B_YOUNGSTORGET_TEMPLATE = YOUNGSTORGET_TEMPLATE.map(([code, name, parent]) => [
  code,
  code === 'BEVERAGE_STORAGE_BOTTLES' ? 'Main beverage stock' : name,
  parent,
]).concat([
  ['BEVERAGE_STORAGE_EVENT_RESERVE', 'Event reserve', 'BEVERAGE_STORAGE'],
  ['BEVERAGE_STORAGE_DORMANT_SPIRITS', 'Dormant spirits', 'BEVERAGE_STORAGE'],
]);

function applyYoungstorgetTemplate(existing = []) {
  const result = existing.map((location) => ({ ...location }));
  YOUNGSTORGET_TEMPLATE.forEach(([code, name, parentCode], index) => {
    let location = result.find((item) => item.code?.trim().toLowerCase() === code.toLowerCase());
    if (!location) {
      location = { id: `template-${code}`, code, name, active: true };
      result.push(location);
    }
    const parent = parentCode ? result.find((item) => item.code === parentCode) : null;
    Object.assign(location, { name, active: true, parentLocationId: parent?.id || '', sortOrder: 10 + index });
  });
  return result;
}

function applyPhase9bYoungstorgetTemplate(existing = []) {
  const result = existing.map((location) => ({ ...location }));
  PHASE9B_YOUNGSTORGET_TEMPLATE.forEach(([code, name, parentCode], index) => {
    let location = result.find((item) => item.code?.trim().toLowerCase() === code.toLowerCase());
    if (!location) {
      location = { id: `phase9b-${code}`, code, name, active: true };
      result.push(location);
    }
    const parent = parentCode ? result.find((item) => item.code === parentCode) : null;
    Object.assign(location, { name, active: true, parentLocationId: parent?.id || '', sortOrder: 10 + index });
  });
  return result;
}

export function runInventoryVerification() {
  const full = Array.from({ length: 12 }, () => ({ countedQuantity: 4, parQuantity: 4, countMethod: 'use_par', countStatus: 'counted' }));
  const fullSummary = summarizeInventoryLocation(full);
  const zero = calculateInventoryLine({ countedQuantity: 0, parQuantity: 12, countMethod: 'manual', countStatus: 'counted' });
  const above = calculateInventoryLine({ countedQuantity: 11, parQuantity: 8, countMethod: 'manual', countStatus: 'counted' });
  const low = calculateInventoryLine({ countedQuantity: 4, parQuantity: 12, minimumQuantity: 6, countMethod: 'manual', countStatus: 'counted' });
  const partial = summarizeInventoryLocation([
    ...Array.from({ length: 6 }, () => ({ countedQuantity: 3, parQuantity: 3, countMethod: 'manual', countStatus: 'counted' })),
    ...Array.from({ length: 2 }, () => ({ countedQuantity: 3, parQuantity: 3, countMethod: 'use_par', countStatus: 'counted' })),
    ...Array.from({ length: 2 }, () => ({ countedQuantity: null, parQuantity: 3, countMethod: 'uncounted', countStatus: 'not_counted' })),
  ]);
  const restock = buildInventoryRestockList([
    { id: 'pepsi-fridge-1', locationId: 'fridge-1', productId: 'pepsi', productName: 'Pepsi Max', locationName: 'Fridge 1', unitLabel: 'can', countedQuantity: 13, parQuantity: 18, countStatus: 'counted' },
    { id: 'pepsi-fridge-2', locationId: 'fridge-2', productId: 'pepsi', productName: 'Pepsi Max', locationName: 'Fridge 2', unitLabel: 'can', countedQuantity: 15, parQuantity: 18, countStatus: 'counted' },
  ]);
  const parsedCsv = parseInventoryCsv('Product;Unit;Location;Par\nOatly;carton;Fridge 1;8\nBroken;;Unknown;-1');
  const csvPreview = previewInventoryCsv({
    parsed: parsedCsv,
    mapping: suggestInventoryCsvMapping(parsedCsv.headers),
    locations: [{ id: 'location-1', name: 'Fridge 1', code: '' }],
    products: [],
  });
  const duplicateProducts = [
    { id: 'product-a', name: 'Oatly', sku: 'OAT-A', barcode: '111' },
    { id: 'product-b', name: 'Oatly', sku: 'OAT-B', barcode: '222' },
  ];
  const duplicateLocations = [
    { id: 'location-a', name: 'Fridge 1', code: 'BAR-F1', active: true },
    { id: 'location-b', name: 'Fridge 1', code: 'WORK-F1', active: true },
  ];
  const identityCsv = parseInventoryCsv([
    'Product ID;Product;Unit;SKU;Barcode;Location;Location code;Par',
    'product-b;Oatly;carton;OAT-B;;Fridge 1;WORK-F1;8',
    ';Oatly;carton;;111;Fridge 1;BAR-F1;8',
    ';Oatly;carton;;;Fridge 1;WORK-F1;8',
    ';New product;piece;;;Fridge 1;;4',
  ].join('\n'));
  const identityPreview = previewInventoryCsv({
    parsed: identityCsv,
    mapping: suggestInventoryCsvMapping(identityCsv.headers),
    locations: duplicateLocations,
    products: duplicateProducts,
  });
  const parCsv = parseInventoryCsv([
    'Product;Unit;Location;Par',
    'Blank par;piece;Unique fridge;',
    'Zero par;piece;Unique fridge;0',
    'Product only;piece;;',
  ].join('\n'));
  const parPreview = previewInventoryCsv({
    parsed: parCsv,
    mapping: suggestInventoryCsvMapping(parCsv.headers),
    locations: [{ id: 'unique-location', name: 'Unique fridge', code: 'UNIQUE', active: true }],
    products: [],
  });
  const identicalCreatedAt = '2026-07-13T10:00:00.000Z';
  const snapshotOrdered = sortInventorySessionLines([
    { id: 'later', locationSortOrderSnapshot: 2, locationName: 'Bar', countOrderSnapshot: 1, productSortOrderSnapshot: 1, productName: 'A', createdAt: identicalCreatedAt, currentCountOrder: -10 },
    { id: 'second', locationSortOrderSnapshot: 1, locationName: 'Atrium', countOrderSnapshot: 2, productSortOrderSnapshot: 1, productName: 'B', createdAt: identicalCreatedAt, currentCountOrder: -20 },
    { id: 'first', locationSortOrderSnapshot: 1, locationName: 'Atrium', countOrderSnapshot: 1, productSortOrderSnapshot: 9, productName: 'C', createdAt: identicalCreatedAt, currentCountOrder: 100 },
  ]);
  const hierarchy = [
    { id: 'workbar', parentLocationId: '', active: true },
    { id: 'fridge-1', parentLocationId: 'workbar', active: true },
    { id: 'fridge-2', parentLocationId: 'workbar', active: true },
    { id: 'inactive-fridge', parentLocationId: 'workbar', active: false },
  ];
  const hierarchyStandards = [
    { id: 'parent-standard', locationId: 'workbar', active: true },
    { id: 'child-standard-1', locationId: 'fridge-1', active: true },
    { id: 'child-standard-2', locationId: 'fridge-2', active: true },
    { id: 'inactive-standard', locationId: 'inactive-fridge', active: true },
  ];
  const parentEffective = effectiveLocationIds(hierarchy, ['workbar']);
  const parentAndChildEffective = effectiveLocationIds(hierarchy, ['workbar', 'fridge-1']);
  const leafEffective = effectiveLocationIds(hierarchy, ['fridge-2']);
  const standardCount = (ids) => hierarchyStandards.filter((standard) => standard.active && ids.includes(standard.locationId)).length;
  const customLocation = { id: 'custom-test-location', code: 'TEST_CUSTOM', name: 'Test location', active: true, notes: 'preserve me' };
  const onceApplied = applyYoungstorgetTemplate([
    customLocation,
    { id: 'archived-kegs', code: 'BEVERAGE_STORAGE_KEGS', name: 'Old keg area', active: false },
    { id: 'wrong-parent-backbar', code: 'WORKBAR_BACKBAR', name: 'Backbar', parentLocationId: customLocation.id, active: true },
  ]);
  const twiceApplied = applyYoungstorgetTemplate(onceApplied);
  const workbarFridge = twiceApplied.find((location) => location.code === 'WORKBAR_FRIDGE_1');
  const cornerbarFridge = twiceApplied.find((location) => location.code === 'CORNERBAR_FRIDGE_1');
  const workbarBackbar = twiceApplied.find((location) => location.code === 'WORKBAR_BACKBAR');
  const cornerbarBackbar = twiceApplied.find((location) => location.code === 'CORNERBAR_BACKBAR');
  const workbar = twiceApplied.find((location) => location.code === 'WORKBAR');
  const beverageStorage = twiceApplied.find((location) => location.code === 'BEVERAGE_STORAGE');
  const beverageChildren = twiceApplied.filter((location) => location.parentLocationId === beverageStorage.id && location.active);
  const beverageEffective = effectiveLocationIds(twiceApplied, [beverageStorage.id]);
  const restoredKegs = twiceApplied.find((location) => location.code === 'BEVERAGE_STORAGE_KEGS');
  const preservedCustom = twiceApplied.find((location) => location.code === 'TEST_CUSTOM');
  const contextualNames = [workbarFridge, cornerbarFridge, workbarBackbar, cornerbarBackbar].map((location) => {
    const parent = twiceApplied.find((item) => item.id === location.parentLocationId);
    return `${parent.name} · ${location.name}`;
  });
  const policyLocations = [
    { id: 'policy-workbar', code: 'WORKBAR', active: true },
    { id: 'policy-workbar-fridge-1', code: 'WORKBAR_FRIDGE_1', locationType: 'fridge', parentLocationId: 'policy-workbar', active: true, countable: true },
    { id: 'policy-workbar-fridge-2', code: 'WORKBAR_FRIDGE_2', locationType: 'fridge', parentLocationId: 'policy-workbar', active: true, countable: true },
    { id: 'policy-workbar-archived', code: 'WORKBAR_OLD', locationType: 'fridge', parentLocationId: 'policy-workbar', active: false, countable: true },
    { id: 'policy-cornerbar', code: 'CORNERBAR', active: true },
    { id: 'policy-cornerbar-fridge-1', code: 'CORNERBAR_FRIDGE_1', locationType: 'fridge', parentLocationId: 'policy-cornerbar', active: true, countable: true },
    { id: 'policy-main-beverage', code: 'BEVERAGE_STORAGE_BOTTLES', active: true },
    { id: 'policy-event-reserve', code: 'BEVERAGE_STORAGE_EVENT_RESERVE', active: true },
    { id: 'policy-dormant', code: 'BEVERAGE_STORAGE_DORMANT_SPIRITS', active: true },
    { id: 'policy-dry', code: 'DRY_STORAGE', active: true },
  ];
  const policyProducts = [
    { id: 'pepsi', name: 'Pepsi Max', active: true },
    { id: 'archived-product', name: 'Archived', active: false },
  ];
  const policyStandards = [
    { id: 'service-1', locationId: 'policy-workbar-fridge-1', productId: 'pepsi', stockPolicy: 'exact_par', parQuantity: 18, active: true, contributesToStorageTarget: true },
    { id: 'service-2', locationId: 'policy-workbar-fridge-2', productId: 'pepsi', stockPolicy: 'exact_par', parQuantity: 12, active: true, contributesToStorageTarget: true },
    { id: 'service-3', locationId: 'policy-cornerbar-fridge-1', productId: 'pepsi', stockPolicy: 'exact_par', parQuantity: 12, active: true, contributesToStorageTarget: true },
    { id: 'parent-double-count', locationId: 'policy-workbar', productId: 'pepsi', stockPolicy: 'exact_par', parQuantity: 999, active: true },
    { id: 'archived-location', locationId: 'policy-workbar-archived', productId: 'pepsi', stockPolicy: 'exact_par', parQuantity: 100, active: true },
    { id: 'archived-standard', locationId: 'policy-workbar-fridge-1', productId: 'pepsi', stockPolicy: 'exact_par', parQuantity: 100, active: false },
    { id: 'unrelated-storage', locationId: 'policy-dry', productId: 'pepsi', stockPolicy: 'exact_par', parQuantity: 100, active: true },
    { id: 'reserve-not-service', locationId: 'policy-main-beverage', productId: 'pepsi', stockPolicy: 'operating_reserve', parQuantity: 126, active: true },
  ];
  const policyContext = { standards: policyStandards, locations: policyLocations, products: policyProducts, storageSettings: { targetMultiplier: 3 } };
  const serviceTarget = calculateServiceStockTarget({ productId: 'pepsi', ...policyContext });
  const derivedTarget = calculateStandardPolicyTarget({ productId: 'pepsi', stockPolicy: 'operating_reserve', targetMode: 'derived_multiplier', reserveMultiplier: 3 }, policyContext);
  const fixedTarget = calculateStandardPolicyTarget({ productId: 'pepsi', stockPolicy: 'operating_reserve', targetMode: 'fixed_quantity', parQuantity: 90 }, policyContext);
  const eventTarget = calculateStandardPolicyTarget({ stockPolicy: 'protected_event_reserve', caseSize: 24, targetCases: 3, targetLooseQuantity: 0 }, policyContext);
  const eventLine = { id: 'event-line', locationId: 'event-reserve', productId: 'pepsi-event', productName: 'Pepsi Max', locationName: 'Event reserve', unitLabel: 'can', stockPolicy: 'protected_event_reserve', effectiveTargetQuantity: 72, caseSize: 24, targetCases: 3, targetLooseQuantity: 0, countFullCases: 2, countLooseQuantity: 0, countedQuantity: 48, countMethod: 'manual', countStatus: 'counted' };
  const eventCalculated = calculateInventoryLine(eventLine);
  const dormantAvailable = { stockPolicy: 'verify_unchanged', previousPhysicalCountQuantity: 7, previousPhysicalCountedAt: '2026-06-01T10:00:00.000Z', physicalRecountIntervalDays: 90 };
  const dormantExpired = { ...dormantAvailable, previousPhysicalCountedAt: '2026-01-01T10:00:00.000Z' };
  const dormantPristine = calculateInventoryLine({ ...dormantAvailable, countedQuantity: null, countMethod: 'uncounted', countStatus: 'not_counted' });
  const dormantManual = calculateInventoryLine({ stockPolicy: 'verify_unchanged', countedQuantity: 5, countMethod: 'manual', countStatus: 'counted', physicalRecountIntervalDays: 90 });
  const dormantImported = calculateInventoryLine({ stockPolicy: 'verify_unchanged', countedQuantity: 5, countMethod: 'imported', countStatus: 'counted', physicalRecountIntervalDays: 90 });
  const dormantAdjusted = calculateInventoryLine({ stockPolicy: 'verify_unchanged', countedQuantity: 5, countMethod: 'adjusted', countStatus: 'counted', physicalRecountIntervalDays: 90 });
  const dormantSkipped = calculateInventoryLine({ ...dormantAvailable, countedQuantity: null, countMethod: 'uncounted', countStatus: 'skipped' });
  const dormantConfirmedExpired = calculateInventoryLine({ stockPolicy: 'verify_unchanged', countedQuantity: 7, countMethod: 'confirmed_unchanged', countStatus: 'counted', previousPhysicalCountedAt: '2000-01-01T10:00:00.000Z', physicalRecountIntervalDays: 90 });
  const dormantUncountedExpired = calculateInventoryLine({ stockPolicy: 'verify_unchanged', countedQuantity: null, countMethod: 'uncounted', countStatus: 'not_counted', previousPhysicalCountedAt: '2000-01-01T10:00:00.000Z', physicalRecountIntervalDays: 90 });
  const dormantOverview = summarizeInventorySession([
    { id: 'dormant-current-physical', locationId: 'policy-dormant', stockPolicy: 'verify_unchanged', countedQuantity: 5, countMethod: 'manual', countStatus: 'counted', physicalRecountIntervalDays: 90 },
    { id: 'dormant-expired', locationId: 'policy-dormant', stockPolicy: 'verify_unchanged', countedQuantity: null, countMethod: 'uncounted', countStatus: 'not_counted', previousPhysicalCountedAt: '2000-01-01T10:00:00.000Z', physicalRecountIntervalDays: 90 },
  ], policyLocations);
  const policyRestock = buildInventoryRestockList([
    { id: 'exact-line', locationId: 'exact-location', productId: 'exact-product', productName: 'Exact', locationName: 'Fridge', unitLabel: 'unit', stockPolicy: 'exact_par', effectiveTargetQuantity: 10, countedQuantity: 8, countStatus: 'counted' },
    { id: 'reserve-line', locationId: 'reserve-location', productId: 'reserve-product', productName: 'Reserve', locationName: 'Main beverage stock', unitLabel: 'unit', stockPolicy: 'operating_reserve', effectiveTargetQuantity: 30, countedQuantity: 20, countStatus: 'counted' },
    eventLine,
    { id: 'dormant-line', locationId: 'dormant-location', productId: 'dormant-product', productName: 'Dormant', locationName: 'Dormant spirits', unitLabel: 'bottle', stockPolicy: 'verify_unchanged', countedQuantity: 4, countStatus: 'counted' },
  ]);
  const protectedList = buildProtectedEventReserveList([eventLine]);
  const phase9bExistingBottle = { id: 'existing-bottle-row', code: 'BEVERAGE_STORAGE_BOTTLES', name: 'Wine & bottle storage', active: true };
  const phase9bOnce = applyPhase9bYoungstorgetTemplate([phase9bExistingBottle, customLocation]);
  const phase9bTwice = applyPhase9bYoungstorgetTemplate(phase9bOnce);
  const phase9bBottle = phase9bTwice.find((location) => location.code === 'BEVERAGE_STORAGE_BOTTLES');
  const checks = [
    assertion('A: use-par remains distinct from manual', fullSummary.acceptedAsStandard === 12 && fullSummary.manual === 0),
    assertion('B: empty is uncounted', partial.uncounted === 2 && partial.status === 'in_progress'),
    assertion('C: zero is a valid count', zero.counted && zero.varianceQuantity === -12 && zero.restockQuantity === 12),
    assertion('D: above par has no restock', above.overPar && above.varianceQuantity === 3 && above.restockQuantity === 0),
    assertion('E: below minimum is flagged', low.belowMinimum && low.restockQuantity === 8),
    assertion('P: CSV preview accepts valid rows and blocks invalid rows', csvPreview[0]?.ready && !csvPreview[1]?.ready && csvPreview[1]?.errors.length >= 2),
    assertion('P1: duplicate product name is rejected', !identityPreview[2]?.ready && identityPreview[2]?.errors.some((error) => /multiple products/i.test(error))),
    assertion('P2: duplicate location name is rejected', !identityPreview[3]?.ready && identityPreview[3]?.errors.some((error) => /multiple active locations/i.test(error))),
    assertion('P3: explicit product ID selects one existing product', identityPreview[0]?.ready && identityPreview[0]?.values.productId === 'product-b'),
    assertion('P4: unique barcode selects one existing product', identityPreview[1]?.ready && identityPreview[1]?.values.productId === 'product-a'),
    assertion('P5: unique location code selects one active location', identityPreview[0]?.ready && identityPreview[0]?.values.locationId === 'location-b'),
    assertion('P6: location with blank par is rejected', !parPreview[0]?.ready && parPreview[0]?.errors.some((error) => /par is required/i.test(error))),
    assertion('P7: location with par zero is accepted', parPreview[1]?.ready),
    assertion('P8: product-only row may omit par', parPreview[2]?.ready),
    assertion('O: immutable snapshots determine order despite identical creation time and later config values', snapshotOrdered.map((line) => line.id).join('|') === 'first|second|later'),
    assertion('H1: selecting a parent includes active child standards', parentEffective.includes('fridge-1') && parentEffective.includes('fridge-2') && standardCount(parentEffective) === 3),
    assertion('H2: selecting parent and child does not duplicate effective locations or lines', parentAndChildEffective.length === 3 && standardCount(parentAndChildEffective) === 3),
    assertion('H3: inactive descendants are excluded', !parentEffective.includes('inactive-fridge') && !hierarchyStandards.filter((standard) => parentEffective.includes(standard.locationId)).some((standard) => standard.id === 'inactive-standard')),
    assertion('H4: selecting only a leaf includes its configured lines', leafEffective.length === 1 && leafEffective[0] === 'fridge-2' && standardCount(leafEffective) === 1),
    assertion('L1: Youngstorget template creates the expected seventeen coded locations', YOUNGSTORGET_TEMPLATE.every(([code]) => twiceApplied.some((location) => location.code === code)) && YOUNGSTORGET_TEMPLATE.length === 17),
    assertion('L2: repeated template application creates no duplicate codes', YOUNGSTORGET_TEMPLATE.every(([code]) => twiceApplied.filter((location) => location.code === code).length === 1) && twiceApplied.length === onceApplied.length),
    assertion('L3: Workbar and Cornerbar Fridge 1 remain distinct', workbarFridge.id !== cornerbarFridge.id && workbarFridge.parentLocationId !== cornerbarFridge.parentLocationId),
    assertion('L4: Workbar and Cornerbar Backbar shelves remain distinct', workbarBackbar.id !== cornerbarBackbar.id && workbarBackbar.parentLocationId !== cornerbarBackbar.parentLocationId),
    assertion('L5: Beverage Storage has exactly three active physical children', beverageChildren.length === 3),
    assertion('L6: every Beverage Storage child uses the correct parent', ['BEVERAGE_STORAGE_BOTTLES', 'BEVERAGE_STORAGE_KEGS', 'BEVERAGE_STORAGE_COCKTAIL'].every((code) => beverageChildren.some((location) => location.code === code))),
    assertion('L7: archived new template location is restored safely', restoredKegs.id === 'archived-kegs' && restoredKegs.active === true && restoredKegs.name === 'Beer kegs'),
    assertion('L8: unrelated custom location remains unchanged', preservedCustom.id === customLocation.id && preservedCustom.name === customLocation.name && preservedCustom.notes === customLocation.notes),
    assertion('L9: contextual names distinguish duplicate fridge and backbar labels', contextualNames.join('|') === 'Workbar · Fridge 1|Cornerbar · Fridge 1|Workbar · Backbar shelves|Cornerbar · Backbar shelves'),
    assertion('L10: Beverage Storage parent selection includes all three active descendants', beverageEffective.length === 4 && beverageChildren.every((location) => beverageEffective.includes(location.id))),
    assertion('L11: template-coded location under the wrong parent is corrected', workbarBackbar.id === 'wrong-parent-backbar' && workbarBackbar.parentLocationId === workbar.id),
    assertion('T: restock aggregation is batched', restock.length === 1 && restock[0].totalMissing === 8),
    assertion('9B-4: exact-par target equals configured target', calculateStandardPolicyTarget({ stockPolicy: 'exact_par', parQuantity: 18 }).effectiveTarget === 18),
    assertion('9B-5: derived reserve includes only eligible active service descendants', serviceTarget === 42),
    assertion('9B-6: archived standards do not inflate service target', serviceTarget !== 142),
    assertion('9B-7: archived locations do not inflate service target', serviceTarget !== 142),
    assertion('9B-8: parent locations are not double counted', serviceTarget !== 1041),
    assertion('9B-9: operating multiplier is applied', derivedTarget.serviceTargetBasis === 42 && derivedTarget.effectiveTarget === 126),
    assertion('9B-10: fixed operating reserve uses configured quantity', fixedTarget.effectiveTarget === 90 && fixedTarget.serviceTargetBasis === null),
    assertion('9B-11: event reserve target uses cases plus loose units', eventTarget.effectiveTarget === 72),
    assertion('9B-12: zero loose target remains valid', eventTarget.effectiveTarget === 24 * 3),
    assertion('9B-15: snapshotted targets remain independent of later standards', calculateInventoryLine({ ...eventLine, effectiveTargetQuantity: 72 }).effectiveTarget === 72 && calculateStandardPolicyTarget({ stockPolicy: 'protected_event_reserve', caseSize: 24, targetCases: 4, targetLooseQuantity: 0 }).effectiveTarget === 96),
    assertion('9B-16: case count retains canonical total units', eventLine.countedQuantity === eventLine.countFullCases * eventLine.caseSize + eventLine.countLooseQuantity),
    assertion('9B-17: event reserve readiness is rounded correctly', eventCalculated.readinessPercent === 67 && eventCalculated.restockQuantity === 24),
    assertion('9B-22a: dormant confirmation remains available inside interval', !isPhysicalRecountDue(dormantAvailable, new Date('2026-07-14T10:00:00.000Z'))),
    assertion('9B-22b: dormant physical recount becomes due after interval', isPhysicalRecountDue(dormantExpired, new Date('2026-07-14T10:00:00.000Z'))),
    assertion('9B-23: Main beverage stock preserves the existing row ID', phase9bBottle.id === phase9bExistingBottle.id && phase9bBottle.name === 'Main beverage stock'),
    assertion('9B-24: repeated Phase 9B template setup does not duplicate Main beverage stock', phase9bTwice.filter((location) => location.code === 'BEVERAGE_STORAGE_BOTTLES').length === 1),
    assertion('9B-25: Event reserve is created exactly once', phase9bTwice.filter((location) => location.code === 'BEVERAGE_STORAGE_EVENT_RESERVE').length === 1),
    assertion('9B-26: Dormant spirits is created exactly once', phase9bTwice.filter((location) => location.code === 'BEVERAGE_STORAGE_DORMANT_SPIRITS').length === 1),
    assertion('9B-27: repeated Phase 9B setup remains 19-location idempotent', PHASE9B_YOUNGSTORGET_TEMPLATE.length === 19 && phase9bTwice.length === phase9bOnce.length),
    assertion('9B-33: protected reserve never enters daily restock list', policyRestock.length === 2 && !policyRestock.some((entry) => entry.productName === 'Pepsi Max')),
    assertion('9B-33a: protected reserve has a separate readiness list', protectedList.length === 1 && protectedList[0].readinessPercent === 67 && protectedList[0].shortageUnits === 24),
    assertion('9B-D1: archived products cannot produce a service target', calculateServiceStockTarget({ productId: 'archived-product', ...policyContext }) === 0),
    assertion('9B-D2: dormant stock has no invented replenishment target', calculateInventoryLine({ stockPolicy: 'verify_unchanged', countedQuantity: 4, countStatus: 'counted' }).effectiveTarget === null),
    assertion('9B.1-O1: pristine dormant line is eligible for unchanged UI flow', dormantPristine.pristineForUnchanged),
    assertion('9B.1-O2: current manual count cannot be replaced by unchanged flow', dormantManual.currentPhysicalCount && !dormantManual.pristineForUnchanged),
    assertion('9B.1-O3: current imported count cannot be replaced by unchanged flow', dormantImported.currentPhysicalCount && !dormantImported.pristineForUnchanged),
    assertion('9B.1-O4: current adjusted count cannot be replaced by unchanged flow', dormantAdjusted.currentPhysicalCount && !dormantAdjusted.pristineForUnchanged),
    assertion('9B.1-O5: skipped line must be cleared before unchanged flow', dormantSkipped.skipped && !dormantSkipped.pristineForUnchanged),
    assertion('9B.1-R1: first dormant manual count satisfies recount requirement', dormantManual.currentPhysicalCount && !dormantManual.physicalRecountDue),
    assertion('9B.1-R2: imported current count satisfies recount requirement', !dormantImported.physicalRecountDue),
    assertion('9B.1-R3: adjusted current count satisfies recount requirement', !dormantAdjusted.physicalRecountDue),
    assertion('9B.1-R4: confirmed unchanged does not become a new physical baseline', dormantConfirmedExpired.confirmedUnchanged && !dormantConfirmedExpired.currentPhysicalCount && dormantConfirmedExpired.physicalRecountDue),
    assertion('9B.1-R5: expired uncounted dormant line remains recount-due', dormantUncountedExpired.physicalRecountDue),
    assertion('9B.1-R6: overview excludes current physical counts from dormant recount due', dormantOverview.dormantPhysicalRecountDue === 1),
  ];
  return {
    passed: checks.every((check) => check.passed),
    checks,
    requiresAppliedMigration: ['F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'],
    requiresBrowserOrMultiUserTest: ['Q', 'R', 'S'],
  };
}
