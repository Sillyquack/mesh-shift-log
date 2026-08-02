function isActive(record) {
  return record?.active !== false;
}

function compareLocations(left, right) {
  return Number(left?.sortOrder || 0) - Number(right?.sortOrder || 0)
    || String(left?.name || '').localeCompare(String(right?.name || ''));
}

export function eligibleInventorySessionLocations({
  locations = [],
  standards = [],
  products = [],
  refrigeratorTemplates = [],
} = {}) {
  const activeProductIds = new Set(products.filter(isActive).map((product) => product.id));
  const refrigeratorLocationIds = new Set(refrigeratorTemplates.map((template) => template.locationId));
  const locationIdsWithActiveDefaults = new Set(
    standards
      .filter((standard) => isActive(standard) && activeProductIds.has(standard.productId))
      .map((standard) => standard.locationId),
  );

  return locations
    .filter((location) => (
      isActive(location)
      && location.locationType === 'fridge'
      && refrigeratorLocationIds.has(location.id)
      && locationIdsWithActiveDefaults.has(location.id)
    ))
    .sort(compareLocations);
}

export function inventorySessionSelection({
  eligibleLocations = [],
  selectedLocationIds = [],
  standards = [],
  products = [],
} = {}) {
  const eligibleLocationIds = new Set(eligibleLocations.map((location) => location.id));
  const selectedIds = [...new Set(selectedLocationIds)].filter((locationId) => eligibleLocationIds.has(locationId));
  const selectedIdSet = new Set(selectedIds);
  const activeProductIds = new Set(products.filter(isActive).map((product) => product.id));
  const representedDefaults = standards.filter((standard) => (
    isActive(standard)
    && selectedIdSet.has(standard.locationId)
    && activeProductIds.has(standard.productId)
  ));

  return {
    locationIds: selectedIds,
    locationCount: selectedIds.length,
    defaultLineCount: representedDefaults.length,
    representedDefaults,
  };
}
