const freeze = (items) => Object.freeze([...items]);

export const INVENTORY_LOCATION_CODES = Object.freeze({
  mainStorage: 'MAIN_STORAGE',
  mainStorageExpressShelf: 'MAIN_STORAGE_EXPRESS_SHELF',
  workbar: 'WORKBAR',
  workbarMilkFridge: 'WORKBAR_MILK_FRIDGE',
  workbarCoffee: 'WORKBAR_COFFEE',
  workbarSnacks: 'WORKBAR_SNACKS',
});

export const MAIN_STORAGE_ORIENTATION =
  'Left and right are always described while standing in front of and facing the Main Storage Fridge.';

export const MAIN_STORAGE_ZONES = freeze([
  Object.freeze({ key: 'left-reserve', name: 'Left Reserve', position: 'left', countScope: 'combined-main-storage' }),
  Object.freeze({ key: 'express-shelf', name: 'Express Shelf', position: 'middle', countScope: 'combined-main-storage' }),
  Object.freeze({ key: 'keg-storage', name: 'Keg Storage', position: 'right', countScope: 'combined-main-storage' }),
]);

export const EXPRESS_SHELF_STANDARD = Object.freeze({
  subtitle: 'Fast pick-up point for daily fridge replenishment',
  incompleteStatus: 'Saved standard incomplete — manager setup required.',
  imageStatus: 'Default image awaiting upload.',
  doneWhen: 'Done when the service refrigerator matches its current saved location standard and Express Shelf has been restored to its current saved standard.',
  incomplete: 'Express Shelf standard incomplete — manager setup required.',
  frontlineIncomplete: 'Use Express Shelf first where possible. The saved Express Shelf standard is incomplete. Finish the service-fridge refill and notify the manager.',
  chain: freeze([
    'Fill this fridge from Express Shelf first.',
    'Restore Express Shelf from Left Reserve.',
    'Confirm both standards.',
  ]),
});

export const WORKBAR_MILK_FRIDGE_LINE_NOTE =
  'Opened and visibly date-labelled wine only. Count the actual physical quantity stored in this refrigerator.';

export const WORKBAR_MILK_FRIDGE_WINES = freeze([
  ['9082081', '20.000 Leguas', '6bc1e704-9a6a-440d-81ff-9ee6c4b9b284'],
  ['4000232', 'Abbazia Prosecco Extra Dry', 'c4b469cb-498a-474d-874f-e65558071d50'],
  ['9020587', 'Casamatta Bianco', 'bcf2dcbd-db37-481b-b1d4-1028bc57f8c1'],
  ['9031232', 'Casamatta Rosso', 'bf0e5c33-f877-46ef-b88f-69d6bf691f8d'],
  ['9078232', 'Castellroig Reserva Brut Nature', '79df4e73-8b8f-4b90-8ad4-163897663331'],
  ['9082082', 'Lanzando Pet-Nat White Wine', 'de5a5358-9f7f-4bad-afe9-2e11473cc8b9'],
  ['4026939', "Maschio Prosecco Ca'Bertaldo", 'ca6eed4f-775d-41ff-96d2-edcafb2a1ecb'],
  ['9082515', 'Nugues Beaujolais Lancie', '430bac91-ffd8-4d07-957b-73f1e2372e22'],
  ['4004935', "Ca'N Verdura Negre", 'ba83b551-f408-40d1-8325-22b5f2edafe9'],
  ['4057913', "Ca'Di Rajo Pinot Grigio", 'b9895c67-32ab-41f3-85bb-8266fd0a31cd'],
].map(([millumItemRef, name, productId], index) => Object.freeze({
  millumItemRef,
  name,
  productId,
  countOrder: index + 1,
})));

export const PLANETA_INITIAL_SCOPE_DEFERRAL = Object.freeze({
  millumItemRef: '2295798',
  productId: '73054357-e1af-423b-bf8a-1c32968275f5',
  name: 'PLANETA CHARDONNAY. (0.75 ltr)',
  note: 'Deferred from initial Workbar Milk Fridge count scope because the current immutable Millum profile has no enabled row for item 2295798.',
});

export const UNLISTED_OPENED_WINE = Object.freeze({
  type: 'unlisted_opened_wine',
  title: 'Opened wine not listed',
  frontline: 'This wine is not configured for Stock Count. Record it for manager review. Do not count it under another product.',
});

export function locationSupportsReferenceGuidance(location) {
  return location?.active !== false && (
    location?.countable === true
    || location?.metadata?.referenceGuidanceEnabled === true
  );
}

export function locationCountabilityLocked(location) {
  return location?.metadata?.countabilityLocked === true;
}

export function inventoryAttentionRecords(session, assignmentId = '') {
  const value = session?.metadata?.inventoryManagerAttention;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.values(value)
    .filter((record) => record?.type === UNLISTED_OPENED_WINE.type)
    .filter((record) => !assignmentId || record.assignmentId === assignmentId)
    .sort((left, right) => String(left.reportedAt || '').localeCompare(String(right.reportedAt || '')));
}

export function deriveLocationAlignment(data = {}) {
  const locations = data.locations || [];
  const standards = data.standards || [];
  const guidance = data.referenceGuidance || [];
  const byCode = (code) => locations.find((location) => location.code === code);
  const mainStorage = byCode(INVENTORY_LOCATION_CODES.mainStorage);
  const expressShelf = byCode(INVENTORY_LOCATION_CODES.mainStorageExpressShelf);
  const milkFridge = byCode(INVENTORY_LOCATION_CODES.workbarMilkFridge);
  const snackShelf = byCode(INVENTORY_LOCATION_CODES.workbarSnacks);
  const expressStandards = standards.filter((row) => row.active !== false && row.locationId === expressShelf?.id);
  const milkStandards = standards.filter((row) => row.active !== false && row.locationId === milkFridge?.id);
  const guidanceFor = (location) => guidance.find((row) => row.locationId === location?.id);
  return {
    mainStorage,
    expressShelf,
    milkFridge,
    snackShelf,
    expressStandards,
    milkStandards,
    expressGuidance: guidanceFor(expressShelf),
    milkGuidance: guidanceFor(milkFridge),
    retiredLegacy: locations.filter((location) => location.active === false && location.metadata?.retiredBy === 'phase10z'),
  };
}
