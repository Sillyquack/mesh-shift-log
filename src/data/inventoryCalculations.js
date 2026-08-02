import {
  addInventoryDecimals,
  compareInventoryDecimals,
  normalizeInventoryDecimal,
  subtractInventoryDecimals,
} from './inventoryStructuredQuantities.js';

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function exactOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  try {
    return normalizeInventoryDecimal(value);
  } catch {
    return null;
  }
}

function numberFromExact(value) {
  return value === null ? null : Number(value);
}

function countModeIdentity(item = {}) {
  return item.countMode || item.count_mode_snapshot || 'unit';
}

function integerOrZero(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : 0;
}

function productIdentity(item = {}) {
  return item.productId || item.product_id || '';
}

function locationIdentity(item = {}) {
  return item.locationId || item.location_id || '';
}

function requireCountLineIdentity(item = {}, context = 'Inventory operation') {
  const lineId = item.id || '';
  const productId = productIdentity(item);
  const locationId = locationIdentity(item);
  if (!lineId || !productId || !locationId) {
    throw new Error(`${context} requires count-line, product, and location IDs.`);
  }
  return { lineId, productId, locationId };
}

function displayProductName(item = {}) {
  return item.productName || item.product_name_snapshot || item.name || 'Product';
}

function displayUnitLabel(item = {}) {
  return item.unitLabel || item.unit_label_snapshot || 'unit';
}

function identityPairKey(item = {}) {
  const { locationId, productId } = requireCountLineIdentity(item, 'Approved-count comparison');
  return JSON.stringify([locationId, productId]);
}

export function inventoryProductIdentityReference(item = {}, peers = []) {
  const productId = productIdentity(item);
  if (!productId) return 'Product reference unavailable';
  const displayKey = `${displayProductName(item)}\u0000${displayUnitLabel(item)}`.toLocaleLowerCase();
  const matchingIds = new Set(peers
    .filter((peer) => `${displayProductName(peer)}\u0000${displayUnitLabel(peer)}`.toLocaleLowerCase() === displayKey)
    .map(productIdentity)
    .filter(Boolean));
  if (matchingIds.size < 2) return '';
  return item.sku ? `SKU ${item.sku}` : `Product ref ${productId.slice(0, 8)}`;
}

export function compareInventoryApprovedLines(latestLines = [], previousLines = [], limit = 12) {
  const previousByIdentity = new Map(previousLines
    .map((line) => [identityPairKey(line), line]));
  return latestLines.map((line) => {
    const key = identityPairKey(line);
    const previous = previousByIdentity.get(key);
    const latestQuantityExact = exactOrNull(line.countedQuantityExact ?? line.countedQuantity ?? line.counted_quantity);
    const previousQuantityExact = exactOrNull(previous?.countedQuantityExact ?? previous?.countedQuantity ?? previous?.counted_quantity);
    if (latestQuantityExact === null || previousQuantityExact === null) return null;
    const changeExact = subtractInventoryDecimals(latestQuantityExact, previousQuantityExact);
    return {
      productId: productIdentity(line),
      locationId: locationIdentity(line),
      productName: displayProductName(line),
      locationName: line.locationName || line.location_name_snapshot || 'Location',
      unitLabel: displayUnitLabel(line),
      countMode: countModeIdentity(line),
      latest: numberFromExact(latestQuantityExact),
      previous: numberFromExact(previousQuantityExact),
      change: numberFromExact(changeExact),
      latestExact: latestQuantityExact,
      previousExact: previousQuantityExact,
      changeExact,
      latestComponents: line,
      previousComponents: previous,
    };
  }).filter(Boolean).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, limit);
}

export function compareInventorySessionLines(left = {}, right = {}) {
  return integerOrZero(left.locationSortOrderSnapshot ?? left.location_sort_order_snapshot)
    - integerOrZero(right.locationSortOrderSnapshot ?? right.location_sort_order_snapshot)
    || String(left.locationName ?? left.location_name_snapshot ?? '').localeCompare(String(right.locationName ?? right.location_name_snapshot ?? ''))
    || integerOrZero(left.countOrderSnapshot ?? left.count_order_snapshot)
    - integerOrZero(right.countOrderSnapshot ?? right.count_order_snapshot)
    || integerOrZero(left.productSortOrderSnapshot ?? left.product_sort_order_snapshot)
    - integerOrZero(right.productSortOrderSnapshot ?? right.product_sort_order_snapshot)
    || String(left.productName ?? left.product_name_snapshot ?? '').localeCompare(String(right.productName ?? right.product_name_snapshot ?? ''));
}

export function sortInventorySessionLines(lines = []) {
  return [...lines].sort(compareInventorySessionLines);
}

export function calculateServiceStockTarget({ productId, standards = [], locations = [], products = [] }) {
  const activeLocations = locations.filter((location) => location.active !== false);
  const roots = activeLocations.filter((location) => ['WORKBAR', 'CORNERBAR'].includes(String(location.code || '').trim().toUpperCase()));
  const descendantIds = new Set();
  const includeChildren = (parentId) => activeLocations.filter((location) => location.parentLocationId === parentId).forEach((location) => {
    if (descendantIds.has(location.id)) return;
    descendantIds.add(location.id);
    includeChildren(location.id);
  });
  roots.forEach((root) => includeChildren(root.id));
  const productActive = products.some((product) => product.id === productId && product.active !== false);
  if (!productActive) return 0;
  return standards.filter((standard) => standard.active !== false
    && standard.productId === productId
    && (standard.stockPolicy || 'exact_par') === 'exact_par'
    && descendantIds.has(standard.locationId))
    .reduce((total, standard) => total + (numberOrNull(standard.parQuantity) || 0), 0);
}

export function calculateStandardPolicyTarget(standard = {}, context = {}) {
  const policy = standard.stockPolicy || 'exact_par';
  if (policy === 'verify_unchanged') return { effectiveTarget: null, serviceTargetBasis: null };
  if (policy === 'protected_event_reserve') {
    const caseSize = numberOrNull(standard.caseSize) || 0;
    const targetCases = numberOrNull(standard.targetCases) || 0;
    const loose = numberOrNull(standard.targetLooseQuantity) || 0;
    return { effectiveTarget: caseSize * targetCases + loose, serviceTargetBasis: null };
  }
  if (policy === 'operating_reserve' && standard.targetMode === 'derived_multiplier') {
    const serviceTargetBasis = calculateServiceStockTarget({ productId: standard.productId, ...context });
    return { effectiveTarget: serviceTargetBasis * (numberOrNull(standard.reserveMultiplier) || 0), serviceTargetBasis };
  }
  return { effectiveTarget: numberOrNull(standard.parQuantity) || 0, serviceTargetBasis: null };
}

export function isPhysicalRecountDue(line = {}, now = new Date()) {
  const lastPhysical = line.previousPhysicalCountedAt || line.previous_physical_counted_at_snapshot;
  const intervalDays = numberOrNull(line.physicalRecountIntervalDays ?? line.physical_recount_interval_days_snapshot);
  if (!lastPhysical || !intervalDays) return true;
  return new Date(lastPhysical).getTime() + intervalDays * 86400000 < new Date(now).getTime();
}

export function calculateInventoryLine(line = {}) {
  const countedQuantityExact = exactOrNull(line.countedQuantityExact ?? line.countedQuantity ?? line.counted_quantity);
  const parQuantityExact = exactOrNull(line.parQuantityExact ?? line.parQuantity ?? line.par_quantity_snapshot) ?? '0';
  const countedQuantity = numberFromExact(countedQuantityExact);
  const parQuantity = numberFromExact(parQuantityExact);
  const minimumQuantity = numberOrNull(line.minimumQuantity ?? line.minimum_quantity_snapshot);
  const stockPolicy = line.stockPolicy || line.stock_policy_snapshot || 'exact_par';
  const effectiveTargetExact = stockPolicy === 'verify_unchanged'
    ? null
    : exactOrNull(line.effectiveTargetQuantityExact ?? line.effectiveTargetQuantity ?? line.effective_target_quantity_snapshot) ?? parQuantityExact;
  const effectiveTarget = numberFromExact(effectiveTargetExact);
  const countStatus = line.countStatus || line.count_status || 'not_counted';
  const countMethod = line.countMethod || line.count_method || 'uncounted';
  const skipped = countStatus === 'skipped';
  const uncounted = countedQuantity === null && !skipped;
  const pristineForUnchanged = countMethod === 'uncounted' && countStatus === 'not_counted' && countedQuantity === null;
  const currentPhysicalCount = ['manual', 'imported', 'adjusted'].includes(countMethod) && countedQuantity !== null;
  const varianceQuantityExact = countedQuantityExact === null || effectiveTargetExact === null
    ? null : subtractInventoryDecimals(countedQuantityExact, effectiveTargetExact);
  const restockDifferenceExact = countedQuantityExact === null || effectiveTargetExact === null
    ? null : subtractInventoryDecimals(effectiveTargetExact, countedQuantityExact);
  const restockQuantityExact = restockDifferenceExact === null
    ? null : compareInventoryDecimals(restockDifferenceExact, '0') > 0 ? restockDifferenceExact : '0';
  const varianceQuantity = numberFromExact(varianceQuantityExact);
  const restockQuantity = numberFromExact(restockQuantityExact);
  const readinessPercent = countedQuantity === null || effectiveTarget === null
    ? null
    : effectiveTarget === 0 ? 100 : Math.min(100, Math.round((countedQuantity / effectiveTarget) * 100));
  return {
    countedQuantity,
    countedQuantityExact,
    parQuantity,
    parQuantityExact,
    minimumQuantity,
    stockPolicy,
    effectiveTarget,
    effectiveTargetExact,
    countMethod,
    countStatus,
    skipped,
    uncounted,
    counted: countedQuantity !== null,
    varianceQuantity,
    varianceQuantityExact,
    restockQuantity,
    restockQuantityExact,
    shortage: restockQuantity !== null && restockQuantity > 0,
    belowMinimum: countedQuantity !== null && minimumQuantity !== null && countedQuantity < minimumQuantity,
    overPar: varianceQuantity !== null && varianceQuantity > 0,
    acceptedAsStandard: countMethod === 'use_par' && countedQuantity !== null,
    manual: countMethod === 'manual' && countedQuantity !== null,
    confirmedUnchanged: countMethod === 'confirmed_unchanged' && countedQuantity !== null,
    pristineForUnchanged,
    currentPhysicalCount,
    readinessPercent,
    physicalRecountDue: stockPolicy === 'verify_unchanged' && !currentPhysicalCount ? isPhysicalRecountDue(line) : false,
    needsReview: countStatus === 'needs_review',
  };
}

export function summarizeInventoryLocation(lines = [], completion = null) {
  const calculated = lines.map(calculateInventoryLine);
  const summary = {
    total: calculated.length,
    counted: calculated.filter((line) => line.counted).length,
    manual: calculated.filter((line) => line.manual).length,
    acceptedAsStandard: calculated.filter((line) => line.acceptedAsStandard).length,
    uncounted: calculated.filter((line) => line.uncounted).length,
    skipped: calculated.filter((line) => line.skipped).length,
    shortages: calculated.filter((line) => line.shortage).length,
    shortageUnits: calculated.reduce((total, line) => total + (line.restockQuantity || 0), 0),
    belowMinimum: calculated.filter((line) => line.belowMinimum).length,
    needsReview: calculated.filter((line) => line.needsReview).length,
    complete: Boolean(completion),
  };
  if (summary.complete) summary.status = 'complete';
  else if (summary.needsReview) summary.status = 'needs_review';
  else if (!summary.counted && !summary.skipped) summary.status = 'not_started';
  else if (!summary.uncounted && summary.acceptedAsStandard === summary.total) summary.status = 'accepted_as_standard';
  else if (!summary.uncounted) summary.status = 'counted';
  else summary.status = 'in_progress';
  return summary;
}

export function summarizeInventorySession(lines = [], locations = [], completionMap = {}) {
  const calculated = lines.map(calculateInventoryLine);
  const locationIds = [...new Set(lines.map((line) => line.locationId || line.location_id).filter(Boolean))];
  const locationSummaries = locationIds.map((locationId) => ({
    locationId,
    location: locations.find((item) => item.id === locationId) || null,
    ...summarizeInventoryLocation(
      lines.filter((line) => (line.locationId || line.location_id) === locationId),
      completionMap?.[locationId],
    ),
  }));
  const readinessFor = (policy) => {
    const policyLines = calculated.filter((line) => line.stockPolicy === policy && line.effectiveTarget !== null);
    const target = policyLines.reduce((total, line) => total + line.effectiveTarget, 0);
    const actual = policyLines.reduce((total, line) => total + Math.min(line.countedQuantity || 0, line.effectiveTarget), 0);
    return target ? Math.round((actual / target) * 100) : null;
  };
  return {
    total: calculated.length,
    counted: calculated.filter((line) => line.counted).length,
    manual: calculated.filter((line) => line.manual).length,
    acceptedAsStandard: calculated.filter((line) => line.acceptedAsStandard).length,
    uncounted: calculated.filter((line) => line.uncounted).length,
    skipped: calculated.filter((line) => line.skipped).length,
    shortages: calculated.filter((line) => line.shortage).length,
    shortageUnits: calculated.reduce((total, line) => total + (line.restockQuantity || 0), 0),
    belowMinimum: calculated.filter((line) => line.belowMinimum).length,
    needsReview: calculated.filter((line) => line.needsReview).length,
    locations: locationSummaries.length,
    completedLocations: locationSummaries.filter((location) => location.complete).length,
    locationSummaries,
    progressPercent: calculated.length ? Math.round(((calculated.filter((line) => line.counted || line.skipped).length) / calculated.length) * 100) : 0,
    serviceStockReadiness: readinessFor('exact_par'),
    operatingReserveReadiness: readinessFor('operating_reserve'),
    eventReserveReadiness: readinessFor('protected_event_reserve'),
    dormantPhysicalRecountDue: calculated.filter((line) => line.stockPolicy === 'verify_unchanged' && line.physicalRecountDue).length,
  };
}

export function buildInventoryRestockList(lines = []) {
  const entries = lines.map((line) => ({ ...line, calculation: calculateInventoryLine(line) }))
    .filter((line) => ['exact_par', 'operating_reserve'].includes(line.calculation.stockPolicy) && line.calculation.restockQuantity > 0);
  const products = new Map();
  entries.forEach((line) => {
    const { lineId, productId, locationId } = requireCountLineIdentity(line, 'Restock aggregation');
    const key = productId;
    const current = products.get(key) || {
      productId,
      productName: displayProductName(line),
      unitLabel: displayUnitLabel(line),
      countMode: countModeIdentity(line),
      category: line.category || line.category_snapshot || 'Other',
      totalMissing: 0,
      totalMissingExact: '0',
      locations: [],
    };
    if (current.countMode !== countModeIdentity(line)) {
      throw new Error(`Restock aggregation found incompatible count-mode snapshots for product ${productId}.`);
    }
    current.totalMissingExact = addInventoryDecimals(current.totalMissingExact, line.calculation.restockQuantityExact);
    current.totalMissing = Number(current.totalMissingExact);
    current.locations.push({
      lineId,
      locationId,
      locationName: line.locationName || line.location_name_snapshot || 'Location',
      missingQuantity: line.calculation.restockQuantity,
      missingQuantityExact: line.calculation.restockQuantityExact,
    });
    products.set(key, current);
  });
  return [...products.values()].sort((a, b) => a.category.localeCompare(b.category) || a.productName.localeCompare(b.productName));
}

export function buildProtectedEventReserveList(lines = []) {
  return lines.map((line) => ({ ...line, calculation: calculateInventoryLine(line) }))
    .filter((line) => line.calculation.stockPolicy === 'protected_event_reserve')
    .map((line) => {
      const { lineId, productId, locationId } = requireCountLineIdentity(line, 'Event-reserve projection');
      return {
        id: lineId,
        productId,
        locationId,
        productName: displayProductName(line),
        unitLabel: displayUnitLabel(line),
        locationName: line.locationName || line.location_name_snapshot || 'Event reserve',
        targetCases: numberOrNull(line.targetCases ?? line.target_cases_snapshot),
        countFullCases: numberOrNull(line.countFullCases ?? line.count_full_cases),
        countLooseQuantity: numberOrNull(line.countLooseQuantity ?? line.count_loose_quantity),
        targetUnits: line.calculation.effectiveTarget,
        actualUnits: line.calculation.countedQuantity,
        shortageUnits: line.calculation.restockQuantity,
        readinessPercent: line.calculation.readinessPercent,
      };
    });
}

export function inventoryStatusLabel(status) {
  return ({
    not_started: 'Not started',
    in_progress: 'In progress',
    counted: 'Counted',
    accepted_as_standard: 'Accepted as standard',
    complete: 'Complete',
    needs_review: 'Needs review',
  })[status] || status || 'Not started';
}
