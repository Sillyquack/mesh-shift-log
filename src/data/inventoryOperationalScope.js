export const INVENTORY_REFRIGERATOR_DEFINITIONS = Object.freeze([
  { code: 'CORNERBAR_LEFT_FRIDGE', name: 'Cornerbar Left Fridge', zone: 'cornerbar', parentCode: 'CORNERBAR', sortOrder: 21 },
  { code: 'CORNERBAR_MIDDLE_FRIDGE', name: 'Cornerbar Middle Fridge', zone: 'cornerbar', parentCode: 'CORNERBAR', sortOrder: 22 },
  { code: 'CORNERBAR_RIGHT_FRIDGE', name: 'Cornerbar Right Fridge', zone: 'cornerbar', parentCode: 'CORNERBAR', sortOrder: 23 },
  { code: 'WORKBAR_BAR_LEFT_FRIDGE', name: 'Workbar Bar Left Fridge', zone: 'workbar', parentCode: 'WORKBAR', sortOrder: 11 },
  { code: 'WORKBAR_BAR_RIGHT_FRIDGE', name: 'Workbar Bar Right Fridge', zone: 'workbar', parentCode: 'WORKBAR', sortOrder: 12 },
  { code: 'WORKBAR_NON_ALCO_FRIDGE', name: 'Workbar Non-Alco Fridge', zone: 'workbar', parentCode: 'WORKBAR', sortOrder: 13 },
]);

export const BOBBY_OWNED_MILLUM_GROUPS = Object.freeze([
  'HARD ALCOHOL',
  'COFFEE',
  'SNACKS',
  'SODAS',
  'WINE',
  'BEER',
  'Cocktail ingredients',
]);

export const MILLUM_KITCHEN_GROUPS_EXCLUDED_FROM_BOBBY_SCOPE = Object.freeze([
  'FRUIT AND VEGETABLES',
  'FREEZER',
  'MEAT AND FISH',
  'DAIRY',
  'DRY STORAGE',
]);

const ownedGroupKeys = new Set(BOBBY_OWNED_MILLUM_GROUPS.map((group) => group.toLocaleLowerCase('en')));

function normalized(value) {
  return String(value || '').trim().toLocaleLowerCase('en');
}

export function isBobbyOwnedMillumGroup(group) {
  return ownedGroupKeys.has(normalized(group));
}

export function inventoryCatalogueSearchText(product) {
  return [
    product?.name,
    product?.shortName,
    product?.millumItemRef,
    ...(product?.aliases || []),
  ].map(normalized).filter(Boolean).join(' ');
}

export function filterOwnedInventoryCatalogue(products, { search = '', millumGroup = '' } = {}) {
  const searchKey = normalized(search);
  const groupKey = normalized(millumGroup);
  return (products || []).filter((product) => {
    if (product?.active === false || product?.ownershipStatus !== 'owned') return false;
    const groups = product?.millumGroups || [];
    if (groupKey && !groups.some((group) => normalized(group.name) === groupKey)) return false;
    return !searchKey || inventoryCatalogueSearchText(product).includes(searchKey);
  });
}

export function inventoryCatalogueOrder(product) {
  const groups = product?.millumGroups || [];
  const first = groups.reduce((current, group) => {
    const candidate = [Number(group.groupSortOrder || 999), Number(group.itemSortOrder || 999)];
    if (!current || candidate[0] < current[0] || (candidate[0] === current[0] && candidate[1] < current[1])) return candidate;
    return current;
  }, null);
  return first || [999, Number(product?.sortOrder || 999)];
}

export function compareInventoryCatalogueOrder(left, right) {
  const leftOrder = inventoryCatalogueOrder(left);
  const rightOrder = inventoryCatalogueOrder(right);
  return leftOrder[0] - rightOrder[0]
    || leftOrder[1] - rightOrder[1]
    || String(left?.name || '').localeCompare(String(right?.name || ''));
}

export function combinedRefrigeratorDefault({ productId, standards, refrigeratorLocationIds }) {
  const locationIds = new Set(refrigeratorLocationIds || []);
  return (standards || []).reduce((total, standard) => (
    standard?.active !== false
      && standard?.productId === productId
      && locationIds.has(standard?.locationId)
      ? total + Number(standard?.parQuantity || 0)
      : total
  ), 0);
}

export function calculateFixedReserveTarget(combinedDefault, override = null) {
  const base = Number(combinedDefault);
  const replacement = override === null || override === undefined || override === '' ? null : Number(override);
  if (!Number.isFinite(base) || base < 0) throw new Error('Combined refrigerator default must be a non-negative finite number.');
  if (replacement !== null && (!Number.isFinite(replacement) || replacement < 0)) throw new Error('Reserve override must be a non-negative finite number.');
  const reserveTarget = replacement === null ? base * 3 : replacement;
  return { refrigeratorDefault: base, reserveTarget, combinedDesired: base + reserveTarget, overridden: replacement !== null };
}
