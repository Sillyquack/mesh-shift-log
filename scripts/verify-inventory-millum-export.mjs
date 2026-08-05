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
const completeMigration = readFileSync(new URL('../supabase/phase9k_millum_complete_count_export.sql', import.meta.url), 'utf8');
const augustCompletionMigration = readFileSync(new URL('../supabase/20260804123921_phase9l_millum_august_carry_forward_and_future_scope.sql', import.meta.url), 'utf8');
const snapshotSupplementMigration = readFileSync(new URL('../supabase/20260804151500_phase9m_millum_snapshot_supplement.sql', import.meta.url), 'utf8');
const singleSourceMigration = readFileSync(new URL('../supabase/20260804180000_phase9n_millum_single_authoritative_session.sql', import.meta.url), 'utf8');
const wineValueMigration = readFileSync(new URL('../supabase/20260804200000_phase9o_millum_wine_value_conversion.sql', import.meta.url), 'utf8');
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
    sourceSessions: [
      { sessionId: '9a100000-0000-4000-8000-000000000010', sessionShortRef: '9A100010', countDate: '2026-08-03' },
      { sessionId: '9a100000-0000-4000-8000-000000000001', sessionShortRef: '9A100000', countDate: '2026-08-04' },
    ],
    notices: [],
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

test('v2 export combines approved monthly location sources and supports every structured count mode', () => {
  assert.match(completeMigration, /inventory_install_millum_profile_v2/);
  assert.match(completeMigration, /source_session\.count_type = v_session\.count_type/);
  assert.match(completeMigration, /source_session\.count_date between \(v_session\.count_date - 3\) and v_session\.count_date/);
  assert.match(completeMigration, /line\.session_id = any\(v_source_session_ids\)/);
  assert.match(completeMigration, /count_mode_snapshot = 'container_plus_volume'/);
  assert.match(completeMigration, /count_mode_snapshot = 'keg_fraction'/);
  assert.match(completeMigration, /count_mode_snapshot = 'case_plus_loose'/);
  assert.match(completeMigration, /'sourceSessions', v_source_sessions/);
});

test('zero supplemental products are visible notices while non-zero omissions still block', () => {
  assert.match(completeMigration, /v_extra\.canonical_quantity is null or v_extra\.canonical_quantity <> 0/);
  assert.match(completeMigration, /zero_product_not_in_profile/);
  assert.match(completeMigration, /counted_product_not_in_profile/);
});

test('v2 retains all three protected wine transforms and a fresh immutable snapshot namespace', () => {
  assert.match(completeMigration, /profile_version = 2/);
  assert.match(completeMigration, /inventory_millum_export_transforms/);
  assert.match(completeMigration, /inventory_millum_apply_transform/);
  assert.match(completeMigration, /inventory_millum_export_snapshots/);
  assert.match(completeMigration, /if jsonb_array_length\(v_diagnostics\) > 0 then\s+return v_payload;/);
});

test('August completion is session-scoped, audited, and never mutates approved count lines', () => {
  assert.match(augustCompletionMigration, /inventory_millum_export_session_values/);
  assert.match(augustCompletionMigration, /session\.title = 'August stock count - Bar Shelves and Main Storage - 2026-08-04'/);
  assert.doesNotMatch(augustCompletionMigration, /b3f3e457-902e-4c2f-b2b1-8fe0ed85423e/);
  assert.match(augustCompletionMigration, /\('beer-04-4019089-1', 4\.75::numeric/);
  assert.match(augustCompletionMigration, /Prior 5\.0 keg equivalents less 19 sales of 0\.4 L from a 30 L keg/);
  assert.doesNotMatch(augustCompletionMigration, /(update|delete from)\s+public\.inventory_count_(sessions|lines)/i);
  assert.doesNotMatch(augustCompletionMigration, /insert into\s+public\.inventory_count_lines/i);
});

test('all twelve previously missing products become physical Main Storage lines for future counts', () => {
  for (const itemNumber of ['5744222','6681001','6017933','6152995','6152979','4019089','2446276','4043579','4043495','4043535']) {
    assert.match(augustCompletionMigration, new RegExp(`'${itemNumber}'`));
  }
  for (const itemNumber of ['4014701', '4030686']) {
    assert.match(snapshotSupplementMigration, new RegExp(`'${itemNumber}'`));
  }
  assert.match(augustCompletionMigration, /upper\(trim\(location\.code\)\) = 'MAIN_STORAGE'/);
  assert.match(augustCompletionMigration, /'physical_count_only'/);
  assert.match(augustCompletionMigration, /count_mode = 'keg_fraction'/);
});

test('blocked snapshots receive all twelve audited values without touching approved counts', () => {
  assert.match(snapshotSupplementMigration, /get_inventory_millum_export_v2_carry_base/);
  assert.match(snapshotSupplementMigration, /v_row->>'state' = 'missing'/);
  assert.match(snapshotSupplementMigration, /'sodas-12-4014701-1', 22::numeric/);
  assert.match(snapshotSupplementMigration, /'sodas-23-4030686-1', 9::numeric/);
  assert.match(snapshotSupplementMigration, /count\(\*\).*<> 12/s);
  assert.doesNotMatch(snapshotSupplementMigration, /(update|delete from)\s+public\.inventory_count_(sessions|lines)/i);
  assert.doesNotMatch(snapshotSupplementMigration, /insert into\s+public\.inventory_count_lines/i);
});

test('terminal export uses exactly the selected approved session plus audited overrides', () => {
  assert.match(singleSourceMigration, /where line\.session_id = v_session\.id/);
  assert.doesNotMatch(singleSourceMigration, /line\.session_id = any\(v_source_session_ids\)/);
  assert.doesNotMatch(singleSourceMigration, /source_session\.count_date between/);
  assert.match(singleSourceMigration, /'sourceRuleVersion', 3/);
  assert.match(singleSourceMigration, /'sourceSessions', jsonb_build_array/);
  assert.match(singleSourceMigration, /'hard-alcohol-06-1917681-1', 2\.55::numeric/);
  assert.match(singleSourceMigration, /'wine-03-4057913-1', 3\.75::numeric/);
  assert.match(singleSourceMigration, /count\(\*\).*<> 41/s);
  assert.doesNotMatch(singleSourceMigration, /(update|delete from)\s+public\.inventory_count_(sessions|lines)/i);
  assert.doesNotMatch(singleSourceMigration, /insert into\s+public\.inventory_count_lines/i);
});

test('terminal wine conversion preserves purchase value instead of converting cases', () => {
  assert.match(wineValueMigration, /get_inventory_millum_export_single_session_base/);
  assert.match(wineValueMigration, /line\.session_id = input_session_id/);
  assert.match(wineValueMigration, /'4000232'::text, 75::numeric, 111\.89::numeric/);
  assert.match(wineValueMigration, /'4057913'::text, 100::numeric, 154::numeric/);
  assert.match(wineValueMigration, /'4004935'::text, 100::numeric, 208\.87::numeric/);
  assert.match(wineValueMigration, /v_physical \* v_wine\.actual_purchase_price \/ v_wine\.millum_market_price/);
  assert.match(wineValueMigration, /wineValueRuleVersion/);
  assert.doesNotMatch(wineValueMigration, /(update|delete from)\s+public\.inventory_count_(sessions|lines)/i);
  assert.doesNotMatch(wineValueMigration, /insert into\s+public\.inventory_count_lines/i);

  assert.equal(Number((3 * 75 / 111.89).toFixed(2)), 2.01);
  assert.equal(Number((185 * 100 / 154).toFixed(2)), 120.13);
  assert.equal(Number((204 * 100 / 208.87).toFixed(2)), 97.67);
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
  const schedule = (operation, delay) => { assert.equal(delay, 60_000); events.push('schedule'); operation(); };
  assert.equal(downloadMillumExportFile(file, documentApi, urlApi, schedule), file.name);
  assert.deepEqual(events, ['create', 'append', 'click', 'remove', 'schedule', 'revoke']);
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
