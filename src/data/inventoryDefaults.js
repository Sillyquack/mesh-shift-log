import { WORKBAR_VISUAL_STANDARD_KEYS } from './workbarVisualStandards.js';

export const INVENTORY_REFERENCE_LOCATION_CATALOG = Object.freeze([
  { code: 'WORKBAR_BAR_LEFT_FRIDGE', label: 'Workbar Bar Left Fridge', area: 'Workbar', refrigerator: true },
  { code: 'WORKBAR_BAR_RIGHT_FRIDGE', label: 'Workbar Bar Right Fridge', area: 'Workbar', refrigerator: true },
  { code: 'WORKBAR_NON_ALCO_FRIDGE', label: 'Workbar Non-Alco Fridge', area: 'Workbar', refrigerator: true },
  { code: 'WORKBAR_MILK_FRIDGE', label: 'Workbar Milk Fridge', area: 'Workbar', refrigerator: true },
  { code: 'WORKBAR_BAR_SHELVES', label: 'Workbar Bar Shelves', area: 'Workbar', refrigerator: false },
  { code: 'CORNERBAR_LEFT_FRIDGE', label: 'Cornerbar Left Fridge', area: 'Cornerbar', refrigerator: true },
  { code: 'CORNERBAR_MIDDLE_FRIDGE', label: 'Cornerbar Middle Fridge', area: 'Cornerbar', refrigerator: true },
  { code: 'CORNERBAR_RIGHT_FRIDGE', label: 'Cornerbar Right Fridge', area: 'Cornerbar', refrigerator: true },
  { code: 'CORNERBAR_BAR_SHELVES', label: 'Cornerbar Bar Shelves', area: 'Cornerbar', refrigerator: false },
  { code: 'MAIN_STORAGE', label: 'Main Storage', area: 'Main Storage', refrigerator: false },
  { code: 'MAIN_STORAGE_EXPRESS_SHELF', label: 'Main Storage Express Shelf', area: 'Main Storage', refrigerator: false },
]);

export const INVENTORY_REFERENCE_LOCATION_CODES = Object.freeze(
  INVENTORY_REFERENCE_LOCATION_CATALOG.map((location) => location.code),
);

export const INVENTORY_LOCATION_VISUAL_STANDARD_KEYS = Object.freeze({
  WORKBAR_BAR_LEFT_FRIDGE: WORKBAR_VISUAL_STANDARD_KEYS.BAR_LEFT_FRIDGE,
  WORKBAR_BAR_RIGHT_FRIDGE: WORKBAR_VISUAL_STANDARD_KEYS.BAR_RIGHT_FRIDGE,
  WORKBAR_NON_ALCO_FRIDGE: WORKBAR_VISUAL_STANDARD_KEYS.NON_ALCO_FRIDGE,
  WORKBAR_MILK_FRIDGE: WORKBAR_VISUAL_STANDARD_KEYS.BAR_MILK_FRIDGE,
});

function hasQuantity(value) {
  return value !== null && value !== undefined && value !== '';
}

export function classifyRefrigeratorTemplate({
  location,
  template = null,
  products = [],
}) {
  if (!location?.refrigerator) return null;

  const activeProducts = products.filter((product) => product.active !== false);
  const productCount = activeProducts.length;
  const parCount = activeProducts.filter((product) => hasQuantity(product.parQuantity)).length;
  const defaultRestockCount = activeProducts.filter(
    (product) => hasQuantity(product.defaultRestockQuantity),
  ).length;
  const verified = template?.templateStatus === 'verified'
    && Boolean(template.verifiedAt)
    && Boolean(template.verifiedByName);
  const reasons = [];

  if (!template) reasons.push('No refrigerator-template row.');
  if (productCount === 0) reasons.push('No active products are configured.');
  if (!verified && productCount > 0) reasons.push('Manager verification pending.');

  return {
    status: verified ? 'verified' : 'incomplete',
    label: verified ? 'Manager verified' : 'Incomplete',
    reasons,
    productCount,
    parCount,
    defaultRestockCount,
    canVerify: productCount > 0,
    verifiedAt: verified ? template.verifiedAt : '',
    verifiedByName: verified ? template.verifiedByName : '',
  };
}

export function buildInventoryDefaultRecords({
  locations = [],
  guidanceRows = [],
  templateRows = [],
  productRows = [],
} = {}) {
  const locationsByCode = new Map(
    locations.map((location) => [String(location.code || '').toUpperCase(), location]),
  );
  const guidanceByLocation = new Map(
    guidanceRows.map((guidance) => [guidance.locationId, guidance]),
  );
  const templatesByLocation = new Map(
    templateRows.map((template) => [template.locationId, template]),
  );
  const productsByLocation = new Map();
  productRows.forEach((product) => {
    const current = productsByLocation.get(product.locationId) || [];
    current.push(product);
    productsByLocation.set(product.locationId, current);
  });

  return INVENTORY_REFERENCE_LOCATION_CATALOG.map((catalogLocation) => {
    const backendLocation = locationsByCode.get(catalogLocation.code) || null;
    const location = {
      ...catalogLocation,
      id: backendLocation?.id || '',
      organizationId: backendLocation?.organizationId || '',
      name: backendLocation?.name || catalogLocation.label,
      active: backendLocation?.active ?? false,
      countable: backendLocation?.countable ?? false,
      locationType: backendLocation?.locationType || '',
      metadata: backendLocation?.metadata || {},
    };
    const guidance = guidanceByLocation.get(location.id) || null;
    const template = templatesByLocation.get(location.id) || null;
    const products = productsByLocation.get(location.id) || [];
    return {
      ...location,
      visualStandardKey: INVENTORY_LOCATION_VISUAL_STANDARD_KEYS[location.code] || '',
      guidance,
      hasReferencePhoto: Boolean(guidance?.objectPath),
      template,
      products,
      templateState: classifyRefrigeratorTemplate({ location, template, products }),
    };
  });
}
