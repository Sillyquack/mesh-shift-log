function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function integerOrZero(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : 0;
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
  const countedQuantity = numberOrNull(line.countedQuantity ?? line.counted_quantity);
  const parQuantity = numberOrNull(line.parQuantity ?? line.par_quantity_snapshot) ?? 0;
  const minimumQuantity = numberOrNull(line.minimumQuantity ?? line.minimum_quantity_snapshot);
  const stockPolicy = line.stockPolicy || line.stock_policy_snapshot || 'exact_par';
  const effectiveTarget = stockPolicy === 'verify_unchanged'
    ? null
    : numberOrNull(line.effectiveTargetQuantity ?? line.effective_target_quantity_snapshot) ?? parQuantity;
  const countStatus = line.countStatus || line.count_status || 'not_counted';
  const countMethod = line.countMethod || line.count_method || 'uncounted';
  const skipped = countStatus === 'skipped';
  const uncounted = countedQuantity === null && !skipped;
  const pristineForUnchanged = countMethod === 'uncounted' && countStatus === 'not_counted' && countedQuantity === null;
  const currentPhysicalCount = ['manual', 'imported', 'adjusted'].includes(countMethod) && countedQuantity !== null;
  const varianceQuantity = countedQuantity === null || effectiveTarget === null ? null : countedQuantity - effectiveTarget;
  const restockQuantity = countedQuantity === null || effectiveTarget === null ? null : Math.max(effectiveTarget - countedQuantity, 0);
  const readinessPercent = countedQuantity === null || effectiveTarget === null
    ? null
    : effectiveTarget === 0 ? 100 : Math.min(100, Math.round((countedQuantity / effectiveTarget) * 100));
  return {
    countedQuantity,
    parQuantity,
    minimumQuantity,
    stockPolicy,
    effectiveTarget,
    countMethod,
    countStatus,
    skipped,
    uncounted,
    counted: countedQuantity !== null,
    varianceQuantity,
    restockQuantity,
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
    const key = `${line.productName || line.product_name_snapshot}|${line.unitLabel || line.unit_label_snapshot}`;
    const current = products.get(key) || {
      productName: line.productName || line.product_name_snapshot || 'Product',
      unitLabel: line.unitLabel || line.unit_label_snapshot || 'unit',
      category: line.category || line.category_snapshot || 'Other',
      totalMissing: 0,
      locations: [],
    };
    current.totalMissing += line.calculation.restockQuantity;
    current.locations.push({
      locationName: line.locationName || line.location_name_snapshot || 'Location',
      missingQuantity: line.calculation.restockQuantity,
    });
    products.set(key, current);
  });
  return [...products.values()].sort((a, b) => a.category.localeCompare(b.category) || a.productName.localeCompare(b.productName));
}

export function buildProtectedEventReserveList(lines = []) {
  return lines.map((line) => ({ ...line, calculation: calculateInventoryLine(line) }))
    .filter((line) => line.calculation.stockPolicy === 'protected_event_reserve')
    .map((line) => ({
      id: line.id,
      productName: line.productName || line.product_name_snapshot || 'Product',
      unitLabel: line.unitLabel || line.unit_label_snapshot || 'unit',
      locationName: line.locationName || line.location_name_snapshot || 'Event reserve',
      targetCases: numberOrNull(line.targetCases ?? line.target_cases_snapshot),
      countFullCases: numberOrNull(line.countFullCases ?? line.count_full_cases),
      countLooseQuantity: numberOrNull(line.countLooseQuantity ?? line.count_loose_quantity),
      targetUnits: line.calculation.effectiveTarget,
      actualUnits: line.calculation.countedQuantity,
      shortageUnits: line.calculation.restockQuantity,
      readinessPercent: line.calculation.readinessPercent,
    }));
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
