export const INVENTORY_QUANTITY_SCALE = 6;

export const INVENTORY_COUNT_MODES = Object.freeze({
  UNIT: 'unit',
  CONTAINER_PLUS_VOLUME: 'container_plus_volume',
  KEG_FRACTION: 'keg_fraction',
});

const DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d*))?$/;

function numberText(value) {
  if (!Number.isFinite(value)) throw new Error('Enter a finite decimal quantity.');
  if (Object.is(value, -0)) return '0';
  return value.toLocaleString('en-US', {
    useGrouping: false,
    minimumFractionDigits: 0,
    maximumFractionDigits: INVENTORY_QUANTITY_SCALE,
  });
}

export function normalizeInventoryDecimal(value, { maxScale = null, allowNegative = true } = {}) {
  if (value === null || value === undefined || String(value).trim() === '') {
    throw new Error('Enter a decimal quantity.');
  }
  const source = typeof value === 'number' ? numberText(value) : String(value).trim();
  if (source.includes(',') && source.includes('.')) {
    throw new Error('Use either a decimal comma or decimal point, not both.');
  }
  const normalizedSeparator = source.replace(',', '.');
  const match = DECIMAL_PATTERN.exec(normalizedSeparator);
  if (!match) throw new Error('Enter a decimal number without grouping separators.');
  const negative = match[1] === '-';
  if (negative && !allowNegative) throw new Error('Quantity cannot be negative.');
  const fraction = match[3] || '';
  if (maxScale !== null && fraction.length > maxScale) {
    throw new Error(`Use no more than ${maxScale} decimal places.`);
  }
  const whole = match[2].replace(/^0+(?=\d)/, '');
  const trimmedFraction = fraction.replace(/0+$/, '');
  const zero = whole === '0' && trimmedFraction === '';
  return `${negative && !zero ? '-' : ''}${whole}${trimmedFraction ? `.${trimmedFraction}` : ''}`;
}

export function inventoryDecimalDraftState(value, options = {}) {
  const text = String(value ?? '');
  const trimmed = text.trim();
  if (trimmed === '' || /^[+-]?$/.test(trimmed) || /^[+-]?\d+[.,]$/.test(trimmed)) {
    return { complete: false, valid: true, value: null, message: '' };
  }
  try {
    return { complete: true, valid: true, value: normalizeInventoryDecimal(trimmed, options), message: '' };
  } catch (error) {
    return { complete: true, valid: false, value: null, message: error.message };
  }
}

function decimalParts(value) {
  const normalized = normalizeInventoryDecimal(value);
  const negative = normalized.startsWith('-');
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole, fraction = ''] = unsigned.split('.');
  return { negative, whole, fraction, scale: fraction.length };
}

function scaledInteger(value, scale) {
  const parts = decimalParts(value);
  const digits = `${parts.whole}${parts.fraction.padEnd(scale, '0')}`;
  const integer = BigInt(digits || '0');
  return parts.negative ? -integer : integer;
}

function decimalFromScaledInteger(value, scale) {
  const negative = value < 0n;
  const unsigned = (negative ? -value : value).toString().padStart(scale + 1, '0');
  const whole = scale ? unsigned.slice(0, -scale) : unsigned;
  const fraction = scale ? unsigned.slice(-scale).replace(/0+$/, '') : '';
  const zero = /^0+$/.test(unsigned);
  return `${negative && !zero ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

function aligned(left, right) {
  const leftParts = decimalParts(left);
  const rightParts = decimalParts(right);
  const scale = Math.max(leftParts.scale, rightParts.scale);
  return { left: scaledInteger(left, scale), right: scaledInteger(right, scale), scale };
}

export function addInventoryDecimals(left, right) {
  const values = aligned(left, right);
  return decimalFromScaledInteger(values.left + values.right, values.scale);
}

export function subtractInventoryDecimals(left, right) {
  const values = aligned(left, right);
  return decimalFromScaledInteger(values.left - values.right, values.scale);
}

export function compareInventoryDecimals(left, right) {
  const values = aligned(left, right);
  return values.left < values.right ? -1 : values.left > values.right ? 1 : 0;
}

export function multiplyInventoryDecimalByInteger(value, multiplier) {
  const integer = normalizeInventoryWholeNumber(multiplier);
  const parts = decimalParts(value);
  return decimalFromScaledInteger(scaledInteger(value, parts.scale) * BigInt(integer), parts.scale);
}

export function normalizeInventoryWholeNumber(value, label = 'Whole count') {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) throw new Error(`${label} must be a non-negative whole number.`);
  return BigInt(text).toString();
}

export function calculateStructuredInventoryQuantity({
  countMode,
  quantity,
  wholeCount,
  openVolumeLiters,
  fullKegs,
  partialKegFraction,
  containerCapacityLiters,
}) {
  if (countMode === INVENTORY_COUNT_MODES.UNIT) {
    return {
      countedQuantity: normalizeInventoryDecimal(quantity, { maxScale: INVENTORY_QUANTITY_SCALE, allowNegative: false }),
      countedWholeUnits: null,
      countedOpenVolumeLiters: null,
      countedFullKegs: null,
      countedPartialKegFraction: null,
    };
  }
  if (countMode === INVENTORY_COUNT_MODES.CONTAINER_PLUS_VOLUME) {
    const sealed = normalizeInventoryWholeNumber(wholeCount, 'Sealed container count');
    const open = normalizeInventoryDecimal(openVolumeLiters, { maxScale: INVENTORY_QUANTITY_SCALE, allowNegative: false });
    const capacity = normalizeInventoryDecimal(containerCapacityLiters, { maxScale: INVENTORY_QUANTITY_SCALE, allowNegative: false });
    if (compareInventoryDecimals(capacity, '0') <= 0) throw new Error('A positive container capacity is required.');
    return {
      countedQuantity: addInventoryDecimals(multiplyInventoryDecimalByInteger(capacity, sealed), open),
      countedWholeUnits: sealed,
      countedOpenVolumeLiters: open,
      countedFullKegs: null,
      countedPartialKegFraction: null,
    };
  }
  if (countMode === INVENTORY_COUNT_MODES.KEG_FRACTION) {
    let full = normalizeInventoryWholeNumber(fullKegs, 'Full keg count');
    let partial = normalizeInventoryDecimal(partialKegFraction, { maxScale: INVENTORY_QUANTITY_SCALE, allowNegative: false });
    if (compareInventoryDecimals(partial, '1') > 0) throw new Error('Partial keg fraction must be less than 1.');
    if (compareInventoryDecimals(partial, '1') === 0) {
      full = (BigInt(full) + 1n).toString();
      partial = '0';
    }
    return {
      countedQuantity: addInventoryDecimals(full, partial),
      countedWholeUnits: null,
      countedOpenVolumeLiters: null,
      countedFullKegs: full,
      countedPartialKegFraction: partial,
    };
  }
  throw new Error('Count mode is missing or unsupported.');
}

export function decomposeInventoryTarget({ countMode, targetQuantity, containerCapacityLiters }) {
  const target = normalizeInventoryDecimal(targetQuantity, { maxScale: INVENTORY_QUANTITY_SCALE, allowNegative: false });
  if (countMode === INVENTORY_COUNT_MODES.UNIT) {
    return calculateStructuredInventoryQuantity({ countMode, quantity: target });
  }
  if (countMode === INVENTORY_COUNT_MODES.KEG_FRACTION) {
    const parts = decimalParts(target);
    return calculateStructuredInventoryQuantity({
      countMode,
      fullKegs: parts.whole,
      partialKegFraction: parts.fraction ? `0.${parts.fraction}` : '0',
    });
  }
  if (countMode === INVENTORY_COUNT_MODES.CONTAINER_PLUS_VOLUME) {
    const capacity = normalizeInventoryDecimal(containerCapacityLiters, { maxScale: INVENTORY_QUANTITY_SCALE, allowNegative: false });
    if (compareInventoryDecimals(capacity, '0') <= 0) throw new Error('A positive container capacity is required.');
    const targetParts = decimalParts(target);
    const capacityParts = decimalParts(capacity);
    const scale = Math.max(targetParts.scale, capacityParts.scale);
    const targetInteger = scaledInteger(target, scale);
    const capacityInteger = scaledInteger(capacity, scale);
    const sealed = targetInteger / capacityInteger;
    const remainder = decimalFromScaledInteger(targetInteger % capacityInteger, scale);
    return calculateStructuredInventoryQuantity({
      countMode,
      wholeCount: sealed.toString(),
      openVolumeLiters: remainder,
      containerCapacityLiters: capacity,
    });
  }
  throw new Error('Count mode is missing or unsupported.');
}

export function inventoryCountModeLabel(mode) {
  return ({
    [INVENTORY_COUNT_MODES.UNIT]: 'Units',
    [INVENTORY_COUNT_MODES.CONTAINER_PLUS_VOLUME]: 'Bottles + open liters',
    [INVENTORY_COUNT_MODES.KEG_FRACTION]: 'Full + partial kegs',
  })[mode] || 'Unknown count mode';
}

export function inventoryBaseUnit(mode, configuredUnit = '') {
  if (mode === INVENTORY_COUNT_MODES.CONTAINER_PLUS_VOLUME) return 'L';
  if (mode === INVENTORY_COUNT_MODES.KEG_FRACTION) return 'keg equivalents';
  return configuredUnit || 'unit';
}

export function formatInventoryDecimal(value, { decimalComma = true, empty = '-' } = {}) {
  if (value === null || value === undefined || value === '') return empty;
  const normalized = normalizeInventoryDecimal(value);
  return decimalComma ? normalized.replace('.', ',') : normalized;
}

export function inventoryStructuredComponentLabel(line = {}) {
  const mode = line.countMode || line.count_mode_snapshot || INVENTORY_COUNT_MODES.UNIT;
  const total = line.countedQuantityExact ?? line.countedQuantity ?? line.counted_quantity;
  if (total === null || total === undefined || total === '') return '';
  if (mode === INVENTORY_COUNT_MODES.CONTAINER_PLUS_VOLUME) {
    const sealed = line.countedWholeUnitsExact ?? line.countedWholeUnits ?? line.counted_whole_units;
    const open = line.countedOpenVolumeLitersExact ?? line.countedOpenVolumeLiters ?? line.counted_open_volume_liters;
    return `${formatInventoryDecimal(sealed)} sealed + ${formatInventoryDecimal(open)} L open = ${formatInventoryDecimal(total)} L`;
  }
  if (mode === INVENTORY_COUNT_MODES.KEG_FRACTION) {
    const full = line.countedFullKegsExact ?? line.countedFullKegs ?? line.counted_full_kegs;
    const partial = line.countedPartialKegFractionExact ?? line.countedPartialKegFraction ?? line.counted_partial_keg_fraction;
    return `${formatInventoryDecimal(full)} full + ${formatInventoryDecimal(partial)} partial = ${formatInventoryDecimal(total)} kegs`;
  }
  return `${formatInventoryDecimal(total)} ${line.unitLabel || line.unit_label_snapshot || 'units'}`;
}
