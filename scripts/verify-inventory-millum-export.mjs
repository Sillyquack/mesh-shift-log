import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import {
  canShareMillumExportFile,
  createMillumExportActionGuard,
  createMillumExportFile,
  createMillumExportPdf,
  downloadMillumExportFile,
  millumExportFilename,
  shareMillumExportFile,
  validateMillumExportData,
} from '../src/data/inventoryMillumExport.js';

const migration = readFileSync(new URL('../supabase/phase9i_millum_stock_count_exports.sql', import.meta.url), 'utf8');
const migrationManifestStart = migration.indexOf('$manifest$') + '$manifest$'.length;
const migrationManifestEnd = migration.indexOf('$manifest$::jsonb', migrationManifestStart);
const manifest = JSON.parse(migration.slice(migrationManifestStart, migrationManifestEnd));
const workspace = readFileSync(new URL('../src/components/InventoryWorkspace.jsx', import.meta.url), 'utf8');
const counterWorkspace = readFileSync(new URL('../src/components/InventoryCounterWorkflows.jsx', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/lib/inventoryClient.js', import.meta.url), 'utf8');
const exportModule = readFileSync(new URL('../src/data/inventoryMillumExport.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

const wineValues = new Map([
  ['4000232', ['4', 4]],
  ['4057913', ['2,67', 2.67]],
  ['4004935', ['3,87', 3.87]],
]);

function sampleExport(overrides = {}) {
  const groups = [];
  for (const item of manifest.filter((row) => row.enabled)) {
    let group = groups.find((candidate) => candidate.order === item.go);
    if (!group) {
      group = { name: item.g, order: item.go, rows: [] };
      groups.push(group);
    }
    const [finalValue, finalValueNumeric] = wineValues.get(item.ref) || (item.ref === '131125' ? ['0', 0] : ['1', 1]);
    group.rows.push({
      rowKey: `${item.g}-${item.ro}-${item.ref}-${item.occ}`,
      rowOrder: item.ro,
      itemNumber: item.ref,
      productName: item.name,
      state: 'ready',
      finalValue,
      finalValueNumeric,
    });
  }
  return {
    snapshotId: '95000000-0000-4000-8000-000000000001',
    organizationName: 'Mesh Youngstorget AS',
    sessionId: '9a100000-0000-4000-8000-000000000001',
    sessionShortRef: '9A100000',
    sessionTitle: 'August Stock Count',
    countDate: '2026-08-03',
    approvedAt: '2026-08-03T09:15:00Z',
    profileKey: 'my-work-bar-jul',
    profileVersion: 1,
    profileTitle: 'MY WORK-BAR JUL',
    ready: true,
    groups,
    diagnostics: [],
    mappingDiagnostics: manifest.filter((row) => !row.enabled).map((row) => ({ rowKey: `${row.g}-${row.ro}-${row.ref}-${row.occ}`, enabled: false })),
    ...overrides,
  };
}

test('profile data contains 97 occurrence rows, 89 enabled rows, seven groups, and exact disabled decisions', () => {
  assert.equal(manifest.length, 97);
  assert.equal(manifest.filter((row) => row.enabled).length, 89);
  assert.equal(new Set(manifest.filter((row) => row.enabled).map((row) => row.ref)).size, 89);
  assert.deepEqual([...new Map(manifest.map((row) => [row.go, row.g])).values()], [
    'HARD ALCOHOL', 'COFFEE', 'SNACKS', 'SODAS', 'WINE', 'BEER', 'COCKTAIL INGREDIENTS',
  ]);
  assert.deepEqual(manifest.filter((row) => !row.enabled).map((row) => `${row.g}:${row.ro}:${row.ref}`), [
    'HARD ALCOHOL:2:410829', 'HARD ALCOHOL:5:2573491', 'HARD ALCOHOL:12:585901',
    'HARD ALCOHOL:14:4054613', 'HARD ALCOHOL:17:2295772', 'HARD ALCOHOL:19:564757',
    'HARD ALCOHOL:23:584888', 'HARD ALCOHOL:33:4530804',
  ]);
});

test('clean export validation distinguishes legitimate zero from missing data', () => {
  const data = sampleExport();
  assert.equal(validateMillumExportData(data), data);
  assert.equal(data.groups.flatMap((group) => group.rows).find((row) => row.itemNumber === '131125').finalValue, '0');
  const missing = structuredClone(data);
  missing.ready = false;
  missing.diagnostics = [{ code: 'missing_quantity' }];
  missing.groups[0].rows[0].state = 'missing';
  delete missing.groups[0].rows[0].finalValue;
  assert.throws(() => validateMillumExportData(missing), /Resolve every Millum export diagnostic/);
});

test('manager PDF is deterministic, A4, multi-page, complete, and repeats its table header plan', async () => {
  const data = sampleExport();
  const first = await createMillumExportPdf(data);
  const second = await createMillumExportPdf(structuredClone(data));
  assert.deepEqual(Buffer.from(first.bytes), Buffer.from(second.bytes));
  assert.ok(first.pageCount > 1);
  assert.equal(first.layout.length, first.pageCount);
  assert.ok(first.layout.every((page) => page.tableHeader && page.rowCount > 0));
  assert.equal(first.layout.reduce((sum, page) => sum + page.rowCount, 0), 89);
  assert.deepEqual(first.layout.flatMap((page) => page.groupNames), [
    'HARD ALCOHOL', 'COFFEE', 'SNACKS', 'SODAS', 'WINE', 'BEER', 'COCKTAIL INGREDIENTS',
  ]);
  const loaded = await PDFDocument.load(first.bytes);
  assert.equal(loaded.getPageCount(), first.pageCount);
  for (const page of loaded.getPages()) {
    assert.ok(Math.abs(page.getWidth() - 595.28) < 0.1);
    assert.ok(Math.abs(page.getHeight() - 841.89) < 0.1);
  }
});

test('PDF filename and file metadata are stable and descriptive', async () => {
  const data = sampleExport();
  assert.equal(millumExportFilename(data), 'mesh-stock-count-2026-08-03-millum.pdf');
  const generated = await createMillumExportFile(data);
  assert.equal(generated.file.name, 'mesh-stock-count-2026-08-03-millum.pdf');
  assert.equal(generated.file.type, 'application/pdf');
  assert.equal(generated.file.lastModified, Date.parse(data.approvedAt));
});

test('native file sharing is used only when canShare accepts the PDF', async () => {
  const { file } = await createMillumExportFile(sampleExport());
  let shared = 0;
  let downloaded = 0;
  const navigatorApi = {
    canShare: ({ files }) => files.length === 1 && files[0] === file,
    share: async ({ files }) => { assert.equal(files[0], file); shared += 1; },
  };
  assert.equal(canShareMillumExportFile(file, navigatorApi), true);
  const result = await shareMillumExportFile(file, { navigatorApi, download: () => { downloaded += 1; } });
  assert.equal(result.status, 'shared');
  assert.equal(shared, 1);
  assert.equal(downloaded, 0);
});

test('unsupported sharing performs one honest download fallback', async () => {
  const { file } = await createMillumExportFile(sampleExport());
  let downloaded = 0;
  const result = await shareMillumExportFile(file, {
    navigatorApi: { canShare: () => false, share: async () => assert.fail('share must not run') },
    download: (received) => { assert.equal(received, file); downloaded += 1; },
  });
  assert.equal(result.status, 'downloaded');
  assert.match(result.message, /Attach the downloaded file/);
  assert.equal(downloaded, 1);
});

test('cancelling native sharing is neutral and does not trigger a false download or failure', async () => {
  const { file } = await createMillumExportFile(sampleExport());
  let downloaded = 0;
  const cancelled = new Error('cancelled');
  cancelled.name = 'AbortError';
  const result = await shareMillumExportFile(file, {
    navigatorApi: { canShare: () => true, share: async () => { throw cancelled; } },
    download: () => { downloaded += 1; },
  });
  assert.equal(result.status, 'cancelled');
  assert.match(result.message, /No data was changed/);
  assert.equal(downloaded, 0);
});

test('download creates one temporary anchor and revokes the object URL', async () => {
  const { file } = await createMillumExportFile(sampleExport());
  const events = [];
  const anchor = {
    click: () => events.push('click'),
    remove: () => events.push('remove'),
  };
  const documentApi = {
    createElement: (tag) => { assert.equal(tag, 'a'); return anchor; },
    body: { appendChild: (node) => { assert.equal(node, anchor); events.push('append'); } },
  };
  const urlApi = {
    createObjectURL: (value) => { assert.equal(value, file); events.push('create'); return 'blob:test'; },
    revokeObjectURL: (href) => { assert.equal(href, 'blob:test'); events.push('revoke'); },
  };
  assert.equal(downloadMillumExportFile(file, documentApi, urlApi), file.name);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(events, ['create', 'append', 'click', 'remove', 'revoke']);
});

test('exactly-once guard shares one pending operation and permits an actionable retry', async () => {
  const guard = createMillumExportActionGuard();
  let executions = 0;
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const first = guard.run(async () => { executions += 1; await blocked; return 'ready'; });
  const second = guard.run(async () => { executions += 1; return 'duplicate'; });
  assert.equal(first, second);
  assert.equal(guard.isPending(), true);
  release();
  assert.equal(await first, 'ready');
  assert.equal(executions, 1);
  assert.equal(guard.isPending(), false);
  await assert.rejects(() => guard.run(async () => { executions += 1; throw new Error('generation failed'); }), /generation failed/);
  assert.equal(await guard.run(async () => { executions += 1; return 'retry ready'; }), 'retry ready');
  assert.equal(executions, 3);
});

test('counter-facing source and manager PDF source contain no protected rules or converted payload hooks', () => {
  const counterSurface = `${counterWorkspace}\n${client.slice(client.indexOf('export async function loadInventoryCounterWorkspace'), client.indexOf('export async function getInventoryCountSession'))}`;
  assert.doesNotMatch(counterSurface, /get_inventory_millum_export|inventory_millum_export_(profiles|rows|snapshots)|divide_round_2|divisor|finalValueNumeric/i);
  assert.doesNotMatch(`${workspace}\n${exportModule}`, /divide_round_2|\bdivisor\b|canonical_quantity|counted_whole_units\s*\+/i);
  assert.match(workspace, /canManage && session\.status === 'approved'[\s\S]*?Millum view \/ Export count/);
  assert.match(client, /getInventoryMillumExport[\s\S]*?get_inventory_millum_export/);
});

test('mobile and split-desktop layout rules preserve wrapping, reachability, and minimum columns', () => {
  const start = styles.indexOf('.inventory-millum-export');
  const end = styles.indexOf('.counter-workspace', start);
  const millumStyles = styles.slice(start, end);
  assert.match(millumStyles, /\.inventory-millum-row\s*\{[\s\S]*?grid-template-columns:[\s\S]*?overflow-wrap: anywhere/);
  assert.match(millumStyles, /@media \(max-width: 640px\)[\s\S]*?\.inventory-millum-row/);
  assert.match(millumStyles, /@media \(max-width: 390px\)[\s\S]*?\.inventory-millum-row/);
  assert.doesNotMatch(millumStyles, /overflow-x:\s*(auto|scroll)/);
});

console.log('Millum export frontend regression suite passed.');
