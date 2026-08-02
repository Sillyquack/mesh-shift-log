const HEADER_ALIASES = {
  productId: ['product id'],
  name: ['product', 'product name', 'name'],
  sku: ['sku', 'product code'],
  barcode: ['barcode', 'ean'],
  category: ['category'],
  unitLabel: ['unit', 'unit label'],
  location: ['location', 'stock location'],
  locationCode: ['location code', 'stock location code'],
  parQuantity: ['par', 'par quantity', 'standard'],
  minimumQuantity: ['minimum', 'minimum quantity', 'min'],
  countOrder: ['count order', 'order'],
  supplierName: ['supplier', 'supplier name'],
  notes: ['notes', 'note'],
};

export const INVENTORY_CSV_CONTRACT = Object.freeze({
  delimiter: ';',
  newline: '\r\n',
  encoding: 'UTF-8 with BOM',
  decimalSeparator: ',',
  formulaPrefix: "'",
});

function detectSeparator(text) {
  let quoted = false;
  let commas = 0;
  let semicolons = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' && quoted && text[index + 1] === '"') index += 1;
    else if (character === '"') quoted = !quoted;
    else if (!quoted && (character === '\r' || character === '\n')) break;
    else if (!quoted && character === ',') commas += 1;
    else if (!quoted && character === ';') semicolons += 1;
  }
  return semicolons > commas ? ';' : ',';
}

export function parseCsvRows(text = '', separator = '') {
  const normalized = String(text).replace(/^\uFEFF/, '');
  const delimiter = separator || detectSeparator(normalized);
  const records = [];
  let record = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === '"' && quoted && normalized[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') quoted = !quoted;
    else if (character === delimiter && !quoted) {
      record.push(value);
      value = '';
    } else if ((character === '\r' || character === '\n') && !quoted) {
      record.push(value);
      if (record.some((cell) => cell.length > 0)) records.push(record);
      record = [];
      value = '';
      if (character === '\r' && normalized[index + 1] === '\n') index += 1;
    } else value += character;
  }
  record.push(value);
  if (record.some((cell) => cell.length > 0)) records.push(record);
  return { rows: records, separator: delimiter };
}

export function parseInventoryCsv(text = '') {
  const parsed = parseCsvRows(text);
  if (!parsed.rows.length) return { headers: [], rows: [], separator: ',', error: 'The CSV file is empty.' };
  const headers = parsed.rows[0].map((value) => value.trim());
  const rows = parsed.rows.slice(1).map((record, rowIndex) => {
    const values = record.map((value) => value.trim());
    return { rowNumber: rowIndex + 2, values, raw: Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])) };
  });
  return { headers, rows, separator: parsed.separator, error: '' };
}

export function suggestInventoryCsvMapping(headers = []) {
  const mapping = {};
  Object.entries(HEADER_ALIASES).forEach(([field, aliases]) => {
    const header = headers.find((candidate) => aliases.includes(candidate.trim().toLowerCase()));
    if (header) mapping[field] = header;
  });
  return mapping;
}

export function previewInventoryCsv({ parsed, mapping, locations = [], products = [] }) {
  const seen = new Set();
  const normalize = (value) => String(value || '').trim().toLowerCase();
  return (parsed?.rows || []).map((row) => {
    const mapped = Object.fromEntries(Object.entries(mapping || {}).map(([field, header]) => [field, row.raw[header] || '']));
    const errors = [];
    const warnings = [];
    if (!mapped.name?.trim()) errors.push('Product name is required.');
    if (!mapped.unitLabel?.trim()) errors.push('Unit is required.');
    ['parQuantity', 'minimumQuantity'].forEach((field) => {
      const value = mapped[field];
      if (value !== undefined && value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0)) errors.push(`${field === 'parQuantity' ? 'Par' : 'Minimum'} must be zero or more.`);
    });
    if (mapped.countOrder !== undefined && mapped.countOrder !== '' && !Number.isInteger(Number(mapped.countOrder))) errors.push('Count order must be a whole number.');
    let existingProduct = null;
    const explicitProductId = mapped.productId?.trim();
    if (explicitProductId) {
      existingProduct = products.find((product) => product.id === explicitProductId) || null;
      if (!existingProduct) errors.push('Unknown product ID.');
    }
    if (!explicitProductId && mapped.sku?.trim()) {
      const matches = products.filter((product) => normalize(product.sku) === normalize(mapped.sku));
      if (matches.length > 1) errors.push('SKU matches multiple products.');
      else if (matches.length === 1) existingProduct = matches[0];
    }
    if (!explicitProductId && !existingProduct && mapped.barcode?.trim()) {
      const matches = products.filter((product) => normalize(product.barcode) === normalize(mapped.barcode));
      if (matches.length > 1) errors.push('Barcode matches multiple products.');
      else if (matches.length === 1) existingProduct = matches[0];
    }
    if (!explicitProductId && !existingProduct && mapped.name?.trim()) {
      const matches = products.filter((product) => normalize(product.name) === normalize(mapped.name));
      if (matches.length > 1) errors.push('Multiple products have this name. Add a unique SKU or barcode.');
      else if (matches.length === 1) existingProduct = matches[0];
    }
    if (existingProduct) mapped.productId = existingProduct.id;

    const locationRequested = mapped.location?.trim() || mapped.locationCode?.trim();
    if (locationRequested) {
      let matchedLocation = null;
      const explicitCode = mapped.locationCode?.trim();
      const codeValue = explicitCode || mapped.location?.trim();
      const codeMatches = locations.filter((location) => location.active !== false && normalize(location.code) === normalize(codeValue));
      if (codeMatches.length > 1) errors.push('Location code matches multiple active locations.');
      else if (codeMatches.length === 1) matchedLocation = codeMatches[0];
      if (!matchedLocation && mapped.location?.trim()) {
        const nameMatches = locations.filter((location) => location.active !== false && normalize(location.name) === normalize(mapped.location));
        if (nameMatches.length > 1) errors.push('Multiple active locations have this name. Add a unique location code.');
        else if (nameMatches.length === 1) matchedLocation = nameMatches[0];
      }
      if (!matchedLocation && !errors.some((error) => error.toLowerCase().includes('location'))) errors.push('Unknown location.');
      if (matchedLocation) {
        mapped.locationId = matchedLocation.id;
        if (!explicitCode && normalize(matchedLocation.code) === normalize(mapped.location)) mapped.locationCode = matchedLocation.code;
      }
    }
    const hasLocation = Boolean(mapped.location?.trim() || mapped.locationCode?.trim() || mapped.locationId);
    if (hasLocation && (mapped.parQuantity === undefined || mapped.parQuantity.trim() === '')) {
      errors.push('Par is required when a location is provided.');
    }
    const key = mapped.productId
      ? `product:${mapped.productId}`
      : `new:${mapped.sku || ''}|${mapped.barcode || ''}|${mapped.name || ''}`.toLowerCase();
    if (seen.has(key)) warnings.push('Duplicate row in this file.');
    seen.add(key);
    if (existingProduct) warnings.push('Existing product will be updated.');
    if (mapped.minimumQuantity !== '' && mapped.parQuantity !== '' && Number(mapped.minimumQuantity) > Number(mapped.parQuantity)) warnings.push('Minimum is above par.');
    return { rowNumber: row.rowNumber, values: mapped, errors, warnings, ready: errors.length === 0 };
  });
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return '';
  const text = Object.is(value, -0) ? '0' : String(value);
  const expanded = /e/i.test(text)
    ? value.toLocaleString('en-US', { useGrouping: false, maximumSignificantDigits: 21 })
    : text;
  return expanded.replace('.', INVENTORY_CSV_CONTRACT.decimalSeparator);
}

export function isDangerousCsvText(value) {
  const text = String(value ?? '');
  return /^[\u0000-\u0008\u000b\u000c\u000e-\u0020]*[\t\r\n=+\-@]/u.test(text);
}

export function neutralizeCsvText(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return isDangerousCsvText(text) ? `${INVENTORY_CSV_CONTRACT.formulaPrefix}${text}` : text;
}

function serializeCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'bigint') return String(value);
  const original = String(value);
  const protectedText = neutralizeCsvText(original);
  const requiresQuotes = /[;"\r\n]/u.test(protectedText) || /^\s|\s$/u.test(original);
  return requiresQuotes ? `"${protectedText.replace(/"/g, '""')}"` : protectedText;
}

export function makeCsv(headers, rows) {
  const records = [headers, ...rows]
    .map((row) => row.map(serializeCell).join(INVENTORY_CSV_CONTRACT.delimiter));
  return `\uFEFF${records.join(INVENTORY_CSV_CONTRACT.newline)}`;
}

export function downloadCsv(filename, content) {
  const csv = String(content).startsWith('\uFEFF') ? String(content) : `\uFEFF${content}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
