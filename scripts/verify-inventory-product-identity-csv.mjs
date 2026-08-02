import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildInventoryRestockList,
  compareInventoryApprovedLines,
  inventoryProductIdentityReference,
} from '../src/data/inventoryCalculations.js';
import {
  INVENTORY_CSV_CONTRACT,
  isDangerousCsvText,
  makeCsv,
  neutralizeCsvText,
  parseCsvRows,
  parseInventoryCsv,
} from '../src/data/inventoryCsv.js';
const inventoryClientSource = readFileSync(new URL('../src/lib/inventoryClient.js', import.meta.url), 'utf8');
const inventoryWorkspaceSource = readFileSync(new URL('../src/components/InventoryWorkspace.jsx', import.meta.url), 'utf8');

let passes = 0;
function test(name, assertion) {
  assertion();
  passes += 1;
  console.log(`PASS IDCSV-${passes}: ${name}`);
}

const identityFixtures = {
  latest: [
    { id: 'latest-a', locationId: 'location-1', productId: 'aaaaaaaa-0000-4000-8000-000000000001', productName: 'Same label', unitLabel: 'bottle', category: 'Test', stockPolicy: 'exact_par', effectiveTargetQuantity: 10, countedQuantity: 2 },
    { id: 'latest-b', locationId: 'location-1', productId: 'bbbbbbbb-0000-4000-8000-000000000002', productName: 'Same label', unitLabel: 'bottle', category: 'Test', stockPolicy: 'exact_par', effectiveTargetQuantity: 10, countedQuantity: 7 },
    { id: 'latest-a-2', locationId: 'location-2', productId: 'aaaaaaaa-0000-4000-8000-000000000001', productName: 'Renamed snapshot', unitLabel: 'bottle', category: 'Test', stockPolicy: 'exact_par', effectiveTargetQuantity: 4, countedQuantity: 1 },
  ],
  previous: [
    { id: 'previous-a', locationId: 'location-1', productId: 'aaaaaaaa-0000-4000-8000-000000000001', productName: 'Old A label', unitLabel: 'case', countedQuantity: 9 },
    { id: 'previous-b', locationId: 'location-1', productId: 'bbbbbbbb-0000-4000-8000-000000000002', productName: 'Same label', unitLabel: 'bottle', countedQuantity: 1 },
  ],
};

test('count-line normalization preserves the database product identity', () => {
  assert.match(inventoryClientSource, /const LINE_COLUMNS = '[^']*\bproduct_id\b[^']*'/);
  assert.match(inventoryClientSource, /function normalizeLine[\s\S]*?productId: row\.product_id/);
});

test('same-name and same-unit products remain separate in restock aggregation', () => {
  const restock = buildInventoryRestockList(identityFixtures.latest);
  assert.equal(restock.length, 2);
  assert.deepEqual(restock.map((item) => item.productId).sort(), ['aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002']);
  assert.equal(restock.find((item) => item.productId === 'aaaaaaaa-0000-4000-8000-000000000001').totalMissing, 11);
  assert.equal(restock.find((item) => item.productId === 'bbbbbbbb-0000-4000-8000-000000000002').totalMissing, 3);
});

test('restock aggregation combines locations only for the same product ID', () => {
  const product = buildInventoryRestockList(identityFixtures.latest).find((item) => item.productId === 'aaaaaaaa-0000-4000-8000-000000000001');
  assert.deepEqual(product.locations.map((location) => location.lineId), ['latest-a', 'latest-a-2']);
});

test('approved history compares product and location IDs despite renamed snapshots', () => {
  const comparison = compareInventoryApprovedLines(identityFixtures.latest, identityFixtures.previous);
  assert.deepEqual(comparison.map((item) => [item.productId, item.change]), [
    ['aaaaaaaa-0000-4000-8000-000000000001', -7],
    ['bbbbbbbb-0000-4000-8000-000000000002', 6],
  ]);
  assert.equal(comparison[0].productName, 'Same label');
  assert.equal(comparison[0].unitLabel, 'bottle');
});

test('ambiguous display labels receive a non-prominent stable reference', () => {
  assert.equal(inventoryProductIdentityReference(identityFixtures.latest[0], identityFixtures.latest), 'Product ref aaaaaaaa');
  assert.equal(inventoryProductIdentityReference(identityFixtures.latest[2], identityFixtures.latest), '');
});

test('draft state remains keyed by stable count-line IDs', () => {
  const drafts = Object.fromEntries(identityFixtures.latest.map((line, index) => [line.id, index]));
  assert.deepEqual(Object.keys(drafts), ['latest-a', 'latest-b', 'latest-a-2']);
  assert.match(inventoryWorkspaceSource, /lineDrafts\[line\.id\]/);
  assert.doesNotMatch(inventoryWorkspaceSource, /lineDrafts\[[^\]]*productName/);
});

test('identity-sensitive projections fail loudly when a count-line identity is incomplete', () => {
  assert.throws(
    () => buildInventoryRestockList([{ id: 'broken-line', locationId: 'location-1', productName: 'Broken', stockPolicy: 'exact_par', effectiveTargetQuantity: 2, countedQuantity: 1 }]),
    /requires count-line, product, and location IDs/,
  );
});

test('a complete restock export contains separate stable-ID rows for same-display products', () => {
  const restock = buildInventoryRestockList(identityFixtures.latest);
  const exportCsv = makeCsv(
    ['Product', 'Product ID', 'Location', 'Missing quantity'],
    restock.flatMap((product) => product.locations.map((location) => [
      product.productName, product.productId, location.locationName, location.missingQuantity,
    ])),
  );
  const exportedRows = parseCsvRows(exportCsv).rows.slice(1);
  assert.equal(exportedRows.length, 3);
  assert.deepEqual(new Set(exportedRows.map((row) => row[1])), new Set([
    'aaaaaaaa-0000-4000-8000-000000000001',
    'bbbbbbbb-0000-4000-8000-000000000002',
  ]));
});

const dangerousTextFixtures = ['=1+1', '+SUM(A1:A2)', '-1+2', '@SUM(A1:A2)', '  =hidden', '\tTabbed', ' \rCarriage', '  \nLine'];
const protectedTextFixtures = dangerousTextFixtures.map(neutralizeCsvText);
const ordinaryTextFixtures = ['Trondheim, Oslo', 'semi;colon', 'quote "inside"', 'line\nfeed', 'carriage\rreturn', 'both\r\nlines', ' leading', 'trailing ', 'Blåbærsyltetøy ÆØÅ æøå'];
const csv = makeCsv(
  ['Text', 'Number', 'Empty', 'Null'],
  [
    ...dangerousTextFixtures.map((value, index) => [value, index + 0.5, '', null]),
    ...ordinaryTextFixtures.map((value, index) => [value, index === 0 ? -1234.5 : index, '', null]),
  ],
);
const parsedCsv = parseCsvRows(csv);

test('CSV contract is UTF-8 BOM, semicolon-delimited, and CRLF-terminated between records', () => {
  assert.deepEqual(INVENTORY_CSV_CONTRACT, {
    delimiter: ';', newline: '\r\n', encoding: 'UTF-8 with BOM', decimalSeparator: ',', formulaPrefix: "'",
  });
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  assert.deepEqual([...new TextEncoder().encode(csv).slice(0, 3)], [0xEF, 0xBB, 0xBF]);
  assert.equal(csv.slice(1).includes('\uFEFF'), false);
  assert.equal(parsedCsv.separator, ';');
  assert.equal(csv.replace(/\r\n/g, '').includes('\n'), true, 'embedded LF fixture should remain inside a quoted cell');
  const structuralNewlinesRemoved = csv.replace(/"(?:[^"]|"")*"/gs, '').replace(/\r\n/g, '');
  assert.equal(/[\r\n]/.test(structuralNewlinesRemoved), false);
});

test('trusted numeric cells use decimal comma without thousands separators or formula escaping', () => {
  assert.match(csv, /;-1234,5;;/);
  assert.doesNotMatch(csv, /-1[ .]234/);
  assert.equal(parsedCsv.rows[dangerousTextFixtures.length + 1][1], '-1234,5');
  assert.equal(parseCsvRows(makeCsv(['Zero', 'Integer', 'Decimal'], [[0, 12, 0.25]])).rows[1].join('|'), '0|12|0,25');
});

test('formula-capable untrusted text is detected after leading whitespace and neutralized before quoting', () => {
  dangerousTextFixtures.forEach((value, index) => {
    assert.equal(isDangerousCsvText(value), true);
    assert.equal(parsedCsv.rows[index + 1][0], protectedTextFixtures[index]);
    assert.ok(protectedTextFixtures[index].startsWith("'"));
  });
  assert.equal(isDangerousCsvText('ordinary - text'), false);
});

test('semicolons, commas, quotes, CR, LF, CRLF, spaces, and Norwegian characters round-trip from the final CSV string', () => {
  const actual = parsedCsv.rows.slice(dangerousTextFixtures.length + 1).map((row) => row[0]);
  assert.deepEqual(actual, ordinaryTextFixtures);
});

test('empty strings and nulls serialize as empty fields while string values remain text', () => {
  parsedCsv.rows.slice(1).forEach((row) => assert.deepEqual(row.slice(2), ['', '']));
  const textNumber = makeCsv(['Value'], [['1.5']]);
  assert.equal(parseCsvRows(textNumber).rows[1][0], '1.5');
});

test('the import parser accepts the generated BOM, semicolon delimiter, CRLF, and multiline quoted fields', () => {
  const generated = makeCsv(['Product name', 'Unit', 'Notes'], [['Kaffe', 'kg', 'first\nsecond']]);
  const imported = parseInventoryCsv(generated);
  assert.equal(imported.separator, ';');
  assert.equal(imported.rows[0].raw.Notes, 'first\nsecond');
});

console.log(`Inventory identity and CSV assertions: ${passes}/${passes} passed.`);
