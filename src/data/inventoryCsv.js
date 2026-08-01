const HEADER_ALIASES = {
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

function splitCsvLine(line, separator) {
  const values = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') quoted = !quoted;
    else if (character === separator && !quoted) {
      values.push(value.trim());
      value = '';
    } else value += character;
  }
  values.push(value.trim());
  return values;
}

export function parseInventoryCsv(text = '') {
  const normalized = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n').filter((line) => line.trim());
  if (!lines.length) return { headers: [], rows: [], separator: ',', error: 'The CSV file is empty.' };
  const commaCount = (lines[0].match(/,/g) || []).length;
  const semicolonCount = (lines[0].match(/;/g) || []).length;
  const separator = semicolonCount > commaCount ? ';' : ',';
  const headers = splitCsvLine(lines[0], separator);
  const rows = lines.slice(1).map((line, rowIndex) => {
    const values = splitCsvLine(line, separator);
    return { rowNumber: rowIndex + 2, values, raw: Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])) };
  });
  return { headers, rows, separator, error: '' };
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
    if (mapped.sku?.trim()) {
      const matches = products.filter((product) => normalize(product.sku) === normalize(mapped.sku));
      if (matches.length > 1) errors.push('SKU matches multiple products.');
      else if (matches.length === 1) existingProduct = matches[0];
    }
    if (!existingProduct && mapped.barcode?.trim()) {
      const matches = products.filter((product) => normalize(product.barcode) === normalize(mapped.barcode));
      if (matches.length > 1) errors.push('Barcode matches multiple products.');
      else if (matches.length === 1) existingProduct = matches[0];
    }
    if (!existingProduct && mapped.name?.trim()) {
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
    const key = `${mapped.sku || ''}|${mapped.barcode || ''}|${mapped.name || ''}`.toLowerCase();
    if (seen.has(key)) warnings.push('Duplicate row in this file.');
    seen.add(key);
    if (existingProduct) warnings.push('Existing product will be updated.');
    if (mapped.minimumQuantity !== '' && mapped.parQuantity !== '' && Number(mapped.minimumQuantity) > Number(mapped.parQuantity)) warnings.push('Minimum is above par.');
    return { rowNumber: row.rowNumber, values: mapped, errors, warnings, ready: errors.length === 0 };
  });
}

function quote(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function makeCsv(headers, rows) {
  return [headers.map(quote).join(','), ...rows.map((row) => row.map(quote).join(','))].join('\n');
}

export function downloadCsv(filename, content) {
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
