import { readFileSync } from 'node:fs';
import { runInventoryVerification } from '../src/data/inventoryVerification.js';

const sql = readFileSync(new URL('../supabase/phase9a_inventory_stocktaking.sql', import.meta.url), 'utf8');
const phase9a4Sql = readFileSync(new URL('../supabase/phase9a4_inventory_location_template.sql', import.meta.url), 'utf8');
const phase9bSql = readFileSync(new URL('../supabase/phase9b_stock_policies.sql', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/lib/inventoryClient.js', import.meta.url), 'utf8');
const realtime = readFileSync(new URL('../src/lib/inventoryRealtime.js', import.meta.url), 'utf8');
const calculations = readFileSync(new URL('../src/data/inventoryCalculations.js', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../src/components/InventoryWorkspace.jsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

function functionBody(name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  if (start < 0) return '';
  const end = sql.indexOf('\n$$;', start);
  return end < 0 ? '' : sql.slice(start, end + 4);
}

function phase9a4FunctionBody(name) {
  const start = phase9a4Sql.indexOf(`create or replace function public.${name}(`);
  if (start < 0) return '';
  const end = phase9a4Sql.indexOf('\n$$;', start);
  return end < 0 ? '' : phase9a4Sql.slice(start, end + 4);
}

function phase9bFunctionBody(name) {
  const start = phase9bSql.indexOf(`create or replace function public.${name}(`);
  if (start < 0) return '';
  const end = phase9bSql.indexOf('\n$$;', start);
  return end < 0 ? '' : phase9bSql.slice(start, end + 4);
}

function check(name, condition) {
  return { name, passed: Boolean(condition) };
}

function sessionBeforeLines(name) {
  const body = functionBody(name);
  const sessionLock = body.search(/from public\.inventory_count_sessions session[\s\S]*?for update/i);
  if (sessionLock < 0) return false;
  const afterSession = body.slice(sessionLock);
  return /for update[\s\S]*?from public\.inventory_count_lines line[\s\S]*?for update/i.test(afterSession);
}

function sessionLockOnly(name) {
  return /from public\.inventory_count_sessions session[\s\S]*?for update/i.test(functionBody(name));
}

function returnedJsonKeys(name) {
  const body = functionBody(name);
  const start = body.lastIndexOf('return jsonb_build_object(');
  if (start < 0) return [];
  const shape = body.slice(start);
  return [...shape.matchAll(/'([^']+)'\s*,/g)].map((match) => match[1]);
}

function normalizerSource(name, nextName) {
  const start = client.indexOf(`function ${name}(`);
  const end = client.indexOf(`function ${nextName}(`, start);
  return start < 0 ? '' : client.slice(start, end < 0 ? undefined : end);
}

const reopen = functionBody('reopen_inventory_count_session');
const importCatalog = functionBody('import_inventory_catalog');
const createSession = functionBody('create_inventory_count_session');
const bulkUsePar = functionBody('mark_inventory_location_use_par');
const locationTemplate = phase9a4FunctionBody('setup_mesh_youngstorget_inventory_locations');
const bulkStandards = phase9a4FunctionBody('bulk_upsert_inventory_location_standards');
const safeSessionRecord = functionBody('get_inventory_count_session_record');
const safeLineRecord = functionBody('inventory_count_line_client_record');
const productResponseKeys = returnedJsonKeys('upsert_inventory_product');
const locationResponseKeys = returnedJsonKeys('upsert_inventory_location');
const standardResponseKeys = returnedJsonKeys('upsert_inventory_location_product');
const productNormalizer = normalizerSource('normalizeProduct', 'normalizeLocation');
const locationNormalizer = normalizerSource('normalizeLocation', 'normalizeStandard');
const standardNormalizer = normalizerSource('normalizeStandard', 'normalizeSession');
const pure = runInventoryVerification();
const auditFields = [
  'previousStatus', 'previousCompletedAt', 'previousCompletedByAuthUserId',
  'previousCompletedByName', 'previousCompletionNote', 'previousApprovedAt',
  'previousApprovedByAuthUserId', 'previousApprovedByName', 'previousApprovalNote',
  'previousCompletionExceptions', 'reason', 'reopenedAt',
  'reopenedByAuthUserId', 'reopenedByName',
];
const lineMutations = [
  'set_inventory_count_line_quantity',
  'mark_inventory_count_line_use_par',
  'clear_inventory_count_line',
  'skip_inventory_count_line',
  'mark_inventory_location_use_par',
  'complete_inventory_count_location',
  'complete_inventory_count_session',
];
const lifecycleMutations = [
  'approve_inventory_count_session',
  'reopen_inventory_count_session',
  'cancel_inventory_count_session',
];
const productClientFields = ['id', 'name', 'short_name', 'sku', 'barcode', 'category', 'unit_label', 'default_pack_size', 'supplier_name', 'notes', 'active', 'sort_order'];
const locationClientFields = ['id', 'name', 'code', 'location_type', 'parent_location_id', 'zone', 'description', 'active', 'sort_order'];
const standardClientFields = ['id', 'location_id', 'product_id', 'par_quantity', 'minimum_quantity', 'default_restock_quantity', 'count_order', 'active', 'notes'];
const forbiddenConfigurationFields = ['organization_id', 'created_by_auth_user_id', 'updated_by_auth_user_id', 'metadata', 'created_at', 'updated_at'];
const templateCodes = [
  'WORKBAR', 'WORKBAR_FRIDGE_1', 'WORKBAR_FRIDGE_2', 'WORKBAR_FRIDGE_3',
  'WORKBAR_COFFEE', 'WORKBAR_SNACKS', 'WORKBAR_BACKBAR', 'CORNERBAR',
  'CORNERBAR_FRIDGE_1', 'CORNERBAR_FRIDGE_2', 'CORNERBAR_BACKBAR',
  'DRY_STORAGE', 'MAIN_STORAGE', 'BEVERAGE_STORAGE',
  'BEVERAGE_STORAGE_BOTTLES', 'BEVERAGE_STORAGE_KEGS',
  'BEVERAGE_STORAGE_COCKTAIL',
];
const templateReturn = locationTemplate.slice(locationTemplate.lastIndexOf('return jsonb_build_object('));
const bulkStandardsReturn = bulkStandards.slice(bulkStandards.lastIndexOf('return jsonb_build_object('));
const phase9bTarget = phase9bFunctionBody('inventory_stock_policy_target');
const phase9bCreateSession = phase9bFunctionBody('create_inventory_count_session');
const phase9bCaseCount = phase9bFunctionBody('set_inventory_count_line_case_quantity');
const phase9bConfirmUnchanged = phase9bFunctionBody('confirm_inventory_count_line_unchanged');
const phase9bTemplate = phase9bFunctionBody('setup_mesh_youngstorget_inventory_locations');
const phase9bBulkStandards = phase9bFunctionBody('bulk_upsert_inventory_location_standards');
const phase9bCopyStandards = phase9bFunctionBody('copy_inventory_location_standards');
const phase9bManualCount = phase9bFunctionBody('set_inventory_count_line_quantity');
const phase9bSafeLine = phase9bFunctionBody('inventory_count_line_client_record');
const standardsWorkspace = workspace.slice(workspace.indexOf('function StandardsManager('), workspace.indexOf('function CatalogManager('));
const phase9bTemplateReturn = phase9bTemplate.slice(phase9bTemplate.lastIndexOf('return jsonb_build_object('));
const purePassed = (prefix) => pure.checks.some((result) => result.name.startsWith(prefix) && result.passed);
const phase9bStandardGrant = phase9bSql.slice(
  phase9bSql.indexOf('grant select (', phase9bSql.indexOf('revoke all privileges on table public.inventory_location_products')),
  phase9bSql.indexOf(') on table public.inventory_location_products to authenticated'),
);
const phase9bLineGrant = phase9bSql.slice(
  phase9bSql.indexOf('grant select (', phase9bSql.indexOf('revoke all privileges on table public.inventory_count_lines')),
  phase9bSql.indexOf(') on table public.inventory_count_lines to authenticated'),
);
const standardColumns = client.match(/const STANDARD_COLUMNS = '([^']+)'/)?.[1] || '';
const lineColumns = client.match(/const LINE_COLUMNS = '([^']+)'/)?.[1] || '';

const checks = [
  ...pure.checks,
  check('1: reopen snapshot contains every completion and approval audit field', auditFields.every((field) => reopen.includes(`'${field}'`))),
  check('2: repeated reopen appends to the existing audit array', /coalesce\(v_session\.metadata->'reopenHistory',[\s\S]*?\|\| jsonb_build_array/i.test(reopen)),
  check('3: reopened active session clears stale completion state', /metadata = \(coalesce\(session\.metadata,[\s\S]*?- 'locationCompletions' - 'completionExceptions'/i.test(reopen)),
  check('4: every count-line mutation locks session before lines', lineMutations.every(sessionBeforeLines)),
  check('4a: approval, reopen and cancel lock their session row', lifecycleMutations.every(sessionLockOnly)),
  check('5: catalog import rejects ambiguous product names', /multiple products named/i.test(importCatalog) && !/lower\(trim\(product\.name\)\)[\s\S]*?limit 1/i.test(importCatalog)),
  check('6: catalog import rejects ambiguous location names', /multiple active locations named/i.test(importCatalog) && !/lower\(trim\(location\.name\)\)[\s\S]*?limit 1/i.test(importCatalog)),
  check('7: catalog identity order includes SKU, barcode and location code', /lower\(trim\(product\.sku\)\)/i.test(importCatalog) && /lower\(trim\(product\.barcode\)\)/i.test(importCatalog) && /lower\(trim\(location\.code\)\)/i.test(importCatalog)),
  check('7a: explicit IDs remain organization-scoped', /product\.id = v_product_id and product\.organization_id = v_org/i.test(importCatalog) && /location\.id = v_location_id and location\.organization_id = v_org/i.test(importCatalog)),
  check('7b: import errors propagate so the RPC transaction rolls back', /exception when invalid_text_representation then[\s\S]*?raise exception/i.test(importCatalog) && !/exception when others/i.test(importCatalog)),
  check('8: partial updates send an explicit supplied-field list', (client.match(/input_fields: suppliedFields\(payload, fieldMap\)/g) || []).length === 3),
  check('8a: partial product update preserves omitted active and metadata', /active = case when 'active' = any\(v_fields\) then coalesce\(input_active, product\.active\) else product\.active end/i.test(sql) && /metadata = case when 'metadata' = any\(v_fields\) then coalesce\(input_metadata, '\{\}'::jsonb\) else product\.metadata end/i.test(sql)),
  check('8b: location and standard updates preserve other omitted fields', (sql.match(/else location\./g) || []).length >= 8 && (sql.match(/else standard\./g) || []).length >= 7),
  check('9: use-par requires counted status and exact par quantity', /count_method = 'use_par' and count_status = 'counted' and counted_quantity = par_quantity_snapshot/i.test(sql)),
  check('10: skipped lines require a nonblank note and null quantity', /inventory_count_lines_skipped_note_required/i.test(sql) && /count_method = 'uncounted' and count_status in \('not_counted', 'skipped'\) and counted_quantity is null/i.test(sql)),
  check('11: manual zero remains valid', /counted_quantity >= 0/i.test(sql) && /count_method in \('manual', 'imported', 'adjusted'\)[\s\S]*?counted_quantity is not null/i.test(sql)),
  check('12: Site Access matches the existing frontend-only implementation', app.includes('requestWriteAccess') && workspace.includes('requestWriteAccess') && !/latitude|longitude|geolocation|site_access|site settings/i.test(sql)),
  check('13: Realtime additions first verify the publication exists', (sql.match(/from pg_catalog\.pg_publication where pubname = 'supabase_realtime'/g) || []).length === 5),
  check('14: inventory CSV exports omit internal identifier headers', !/makeCsv\(\[[^\]]*(organization|uuid|auth user|email|metadata)/i.test(workspace)),
  check('15: count lines snapshot all three configured sort orders', /location_sort_order_snapshot integer not null default 0/i.test(sql) && /count_order_snapshot integer not null default 0/i.test(sql) && /product_sort_order_snapshot integer not null default 0/i.test(sql)),
  check('15a: session creation populates immutable sort snapshots', /category_snapshot, location_sort_order_snapshot, count_order_snapshot,[\s\S]*?product_sort_order_snapshot[\s\S]*?location\.sort_order, standard\.count_order, product\.sort_order/i.test(createSession)),
  check('15b: client and UI use stable snapshot ordering', /order\('location_sort_order_snapshot'\)\.order\('location_name_snapshot'\)[\s\S]*?order\('count_order_snapshot'\)\.order\('product_sort_order_snapshot'\)\.order\('product_name_snapshot'\)/i.test(client) && workspace.includes('sortInventorySessionLines(lines)')),
  check('16: CSV SQL requires par only when a location is present', /if v_par is null then raise exception 'Row % requires a par quantity when a location is provided\.'/i.test(importCatalog)),
  check('17: default bulk use-par remains limited to not-counted lines', /not coalesce\(input_replace_existing, false\) and line\.count_status = 'not_counted'/i.test(bulkUsePar)),
  check('17a: replace-all skips exact target rows and preserves skipped lines', /line\.count_status <> 'skipped'[\s\S]*?line\.counted_quantity is distinct from line\.par_quantity_snapshot[\s\S]*?line\.count_method <> 'use_par'[\s\S]*?line\.count_status <> 'counted'[\s\S]*?line\.note is distinct from 'Replaced with stocking standard by manager\.'/i.test(bulkUsePar)),
  check('17b: zero-row bulk requests leave session metadata untouched', /if v_updated > 0 then[\s\S]*?locationCompletions/i.test(bulkUsePar)),
  check('18: inventory table reads use explicit client columns', !/select\(['"]\*['"]\)/i.test(client)),
  check('18a: normalized RPC calls do not retain a second raw data copy', /if \(normalizeRecord\)[\s\S]*?record: normalizeRecord\(data\)[\s\S]*?return output\(true, \{ mode: 'authenticated', data/i.test(client)),
  check('18b: operational RPC records omit auth IDs and private audit history', !/'[a-z_]*auth_user_id'/i.test(safeSessionRecord) && !/'[a-z_]*auth_user_id'/i.test(safeLineRecord) && !/'reopenHistory'/i.test(safeSessionRecord)),
  check('18c: authenticated inventory reads use column-level grants without audit UUID columns', !/grant select on table public\.inventory_/i.test(sql) && (sql.match(/\) on table public\.inventory_/g) || []).length >= 5 && !/grant select \([\s\S]*?auth_user_id[\s\S]*?\) on table public\.inventory_/i.test(sql)),
  check('19: configuration RPCs return jsonb instead of table composites', ['upsert_inventory_product', 'upsert_inventory_location', 'upsert_inventory_location_product'].every((name) => /returns jsonb/i.test(functionBody(name)))),
  check('19a: configuration response shapes contain exactly the required fields', JSON.stringify(productResponseKeys) === JSON.stringify(productClientFields) && JSON.stringify(locationResponseKeys) === JSON.stringify(locationClientFields) && JSON.stringify(standardResponseKeys) === JSON.stringify(standardClientFields)),
  check('19b: configuration response shapes omit organization, auth, metadata and timestamps', [productResponseKeys, locationResponseKeys, standardResponseKeys].every((keys) => forbiddenConfigurationFields.every((field) => !keys.includes(field)))),
  check('19c: configuration normalizers consume every response field', productClientFields.every((field) => productNormalizer.includes(`row.${field}`)) && locationClientFields.every((field) => locationNormalizer.includes(`row.${field}`)) && standardClientFields.every((field) => standardNormalizer.includes(`row.${field}`))),
  check('19d: configuration function grants retain their argument signatures', /grant execute on function public\.upsert_inventory_product\(uuid, text, text, text, text, text, text, numeric, text, text, boolean, integer, jsonb, text\[\]\) to authenticated/i.test(sql) && /grant execute on function public\.upsert_inventory_location\(uuid, text, text, text, uuid, text, text, boolean, integer, jsonb, text\[\]\) to authenticated/i.test(sql) && /grant execute on function public\.upsert_inventory_location_product\(uuid, uuid, uuid, numeric, numeric, numeric, integer, boolean, text, jsonb, text\[\]\) to authenticated/i.test(sql)),
  check('20: session preview expands active descendants without replacing explicit selections', /effectiveInventoryLocationIds\(locations, draft\.locationIds\)/i.test(workspace) && /onClick=\{\(\) => onCreate\(draft\)\}/i.test(workspace)),
  check('20a: descendant expansion deduplicates IDs and excludes inactive locations', /locations\.filter\(\(location\) => location\.active !== false\)/i.test(workspace) && /const effectiveIds = new Set\(\)/i.test(workspace) && /effectiveIds\.has\(locationId\)/i.test(workspace)),
  check('21: replace-all review warns that existing exact-par count methods may be replaced', /bulkReview\.replace \? <>[\s\S]*?Manual, imported and adjusted exact-par counts may be replaced\.[\s\S]*?Protected event reserve, operating reserve, dormant stock and skipped lines remain unchanged\.[\s\S]*?manager-only action/i.test(workspace)),
  check('21a: default review describes the exact-par stocking attestation and preserves other work', /: <><p>\{exactUncounted\}[\s\S]*?explicit stocking attestation, not a physical count\.[\s\S]*?Other policies and existing counts remain unchanged\./i.test(workspace)),
  check('21b: destructive confirmation uses a distinct action label', /bulkReview\.replace \? 'Replace with fully stocked' : 'Mark fully stocked'/i.test(workspace)),
  check('22: Phase 9A.4 template contains the exact seventeen operational location codes', templateCodes.every((code) => locationTemplate.includes(`\"code\":\"${code}\"`)) && (locationTemplate.match(/\{"code":/g) || []).length === 17),
  check('22a: template hierarchy uses all three parent codes and does not create bare product-category locations', /\"parent_code\":\"WORKBAR\"/i.test(locationTemplate) && /\"parent_code\":\"CORNERBAR\"/i.test(locationTemplate) && /\"parent_code\":\"BEVERAGE_STORAGE\"/i.test(locationTemplate) && !/\"name\":\"(?:Wine|Spirits|Beer|Mineral water)\"/i.test(locationTemplate)),
  check('22b: template is organization-scoped, code-idempotent and serialized', /organization_id = v_org[\s\S]*?lower\(trim\(location\.code\)\) = lower\(v_template\.code\)/i.test(locationTemplate) && /pg_advisory_xact_lock/i.test(locationTemplate) && /inventory_locations_org_code_unique/i.test(sql)),
  check('22c: template restores archived locations and never deletes locations', /active = true/i.test(locationTemplate) && /v_restored := v_restored \+ 1/i.test(locationTemplate) && !/delete\s+from\s+public\.inventory_locations/i.test(locationTemplate)),
  check('22d: template response is sanitized and grants are explicit', !/organization_id|auth_user_id/i.test(templateReturn) && /revoke all on function public\.setup_mesh_youngstorget_inventory_locations\(\) from public, anon, authenticated/i.test(phase9a4Sql) && /grant execute on function public\.setup_mesh_youngstorget_inventory_locations\(\) to authenticated/i.test(phase9a4Sql)),
  check('22e: backbars and Beverage Storage children use physical types and canonical parents', /\"code\":\"WORKBAR_BACKBAR\"[^\n]*\"location_type\":\"shelf\"[^\n]*\"parent_code\":\"WORKBAR\"/i.test(locationTemplate) && /\"code\":\"CORNERBAR_BACKBAR\"[^\n]*\"location_type\":\"shelf\"[^\n]*\"parent_code\":\"CORNERBAR\"/i.test(locationTemplate) && (locationTemplate.match(/\"location_type\":\"storage\",\"parent_code\":\"BEVERAGE_STORAGE\"/g) || []).length === 3),
  check('23: template setup requires auth, active manager permission and rejects shared device', /auth\.uid\(\) is null/i.test(locationTemplate) && /current_user_can_manage_inventory_config\(\)/i.test(locationTemplate) && /current_user_is_shared_device\(\)/i.test(locationTemplate)),
  check('23a: bulk standards requires manager and validates location and products in the current organization', /current_user_can_manage_inventory_config\(\)/i.test(bulkStandards) && /current_user_is_shared_device\(\)/i.test(bulkStandards) && /location\.organization_id = v_org/i.test(bulkStandards) && /product\.organization_id = v_org/i.test(bulkStandards)),
  check('23b: bulk standards preserves omitted rows and archives without deleting', /for v_row in select value from jsonb_array_elements\(input_rows\)/i.test(bulkStandards) && /set active = false/i.test(bulkStandards) && !/delete\s+from\s+public\.inventory_location_products/i.test(bulkStandards)),
  check('23c: bulk standards response is sanitized and executable only through the guarded RPC', !/organization_id|auth_user_id/i.test(bulkStandardsReturn) && /revoke all on function public\.bulk_upsert_inventory_location_standards\(uuid, jsonb\) from public, anon, authenticated/i.test(phase9a4Sql) && /grant execute on function public\.bulk_upsert_inventory_location_standards\(uuid, jsonb\) to authenticated/i.test(phase9a4Sql)),
  check('24: grouped selectors render contextual parent and child names', /function contextualLocationName/i.test(workspace) && /`\$\{parent\.name\} · \$\{location\.name\}`/i.test(workspace) && /<optgroup/i.test(workspace) && /groupedInventoryLocations\(locations\.filter/i.test(workspace)),
  check('24c: setup review includes both contextual backbars and all Phase 9B Beverage Storage children', (workspace.match(/'Backbar shelves'/g) || []).length === 2 && /Beverage Storage[^\n]*Main beverage stock[^\n]*Beer kegs[^\n]*Cocktail ingredients[^\n]*Event reserve[^\n]*Dormant spirits/i.test(workspace)),
  check('24a: standards editor is location-first and saves all changed rows in one RPC', /Location-first setup/i.test(workspace) && /changedProducts\.map/i.test(workspace) && /saveInventoryStandardsBulk\(\{ locationId, rows \}\)/i.test(workspace)),
  check('24b: standards editor searches name, SKU and category and separates archived products', /`\$\{product\.name\} \$\{product\.sku\} \$\{product\.category\}`/i.test(workspace) && /Archived products with active standards/i.test(workspace)),
  check('25: Wine, Spirits, Beer and Mineral water remain editable category presets', ['Beer', 'Wine', 'Spirits', 'Mineral water'].every((category) => workspace.includes(`'${category}'`)) && /input list="inventory-product-categories"/i.test(workspace)),
  check('25a: Phase 9A.4 client uses the guarded RPC wrappers', /callRpc\('setup_mesh_youngstorget_inventory_locations'/i.test(client) && /callRpc\('bulk_upsert_inventory_location_standards'/i.test(client)),
  check('9B-1: existing standards default to exact-par', /stock_policy text not null default 'exact_par'/i.test(phase9bSql)),
  check('9B-2: migration preserves existing par quantities', !/alter table public\.inventory_location_products[\s\S]*?drop column[\s\S]*?par_quantity/i.test(phase9bSql) && !/update public\.inventory_location_products\s+set par_quantity\s*=/i.test(phase9bSql)),
  check('9B-3: existing minimum values remain stored', !/drop column(?: if exists)? minimum_quantity/i.test(phase9bSql) && !/update public\.inventory_location_products\s+set minimum_quantity\s*=/i.test(phase9bSql)),
  check('9B-4: exact-par effective target equals configured par', /if v_standard\.stock_policy = 'exact_par'[\s\S]*?v_standard\.par_quantity/i.test(phase9bTarget) && purePassed('9B-4:')),
  check('9B-5: derived reserve sums eligible active Workbar and Cornerbar exact-par descendants', /upper\(trim\(root\.code\)\) in \('WORKBAR', 'CORNERBAR'\)/i.test(phase9bTarget) && /service_standard\.stock_policy = 'exact_par'/i.test(phase9bTarget) && purePassed('9B-5:')),
  check('9B-6: archived standards are excluded from reserve target', /service_standard\.active = true/i.test(phase9bTarget) && purePassed('9B-6:')),
  check('9B-7: archived locations are excluded from reserve target', /root\.active = true[\s\S]*?child\.active = true/i.test(phase9bTarget) && purePassed('9B-7:')),
  check('9B-8: parent locations are not double counted', /select child\.id[\s\S]*?child\.parent_location_id = root\.id/i.test(phase9bTarget) && !/select root\.id/i.test(phase9bTarget) && purePassed('9B-8:')),
  check('9B-9: operating reserve multiplier is applied', /v_service_target \* v_standard\.reserve_multiplier/i.test(phase9bTarget) && purePassed('9B-9:')),
  check('9B-10: fixed operating reserve uses configured par', /target_mode = 'fixed_quantity'[\s\S]*?v_standard\.par_quantity/i.test(phase9bTarget) && purePassed('9B-10:')),
  check('9B-11: event target is case size times cases plus loose', /v_standard\.case_size \* v_standard\.target_cases \+ coalesce\(v_standard\.target_loose_quantity, 0\)/i.test(phase9bTarget) && purePassed('9B-11:')),
  check('9B-12: zero event loose target is valid', /target_loose_quantity >= 0/i.test(phase9bSql) && purePassed('9B-12:')),
  check('9B-13: negative policy quantities are rejected', /reserve_multiplier > 0/i.test(phase9bSql) && /case_size > 0/i.test(phase9bSql) && /target_cases >= 0/i.test(phase9bSql) && /physical_recount_interval_days > 0/i.test(phase9bSql)),
  check('9B-14: count sessions snapshot policy targets and explanatory inputs', ['stock_policy_snapshot', 'target_mode_snapshot', 'effective_target_quantity_snapshot', 'service_target_basis_snapshot', 'reserve_multiplier_snapshot', 'case_size_snapshot', 'target_cases_snapshot', 'target_loose_quantity_snapshot', 'physical_recount_interval_days_snapshot'].every((field) => phase9bCreateSession.includes(field))),
  check('9B-15: historical policy snapshots are never recalculated by later edits', !/update public\.inventory_count_lines[\s\S]{0,200}set[\s\S]{0,200}effective_target_quantity_snapshot/i.test(phase9bSql) && purePassed('9B-15:')),
  check('9B-16: event case counting stores canonical total units', /v_total := input_full_cases \* v_line\.case_size_snapshot \+ input_loose_quantity/i.test(phase9bCaseCount) && /counted_quantity = v_total/i.test(phase9bCaseCount) && purePassed('9B-16:')),
  check('9B-17: event readiness percentage is correct', purePassed('9B-17:') && /readinessPercent/i.test(workspace)),
  check('9B-18: dormant unchanged confirmation requires manager', /current_user_can_manage_inventory_config\(\)/i.test(phase9bConfirmUnchanged)),
  check('9B-19: shared device cannot confirm dormant stock unchanged', /current_user_is_shared_device\(\)[\s\S]*?Shared-device accounts cannot confirm dormant stock unchanged/i.test(phase9bConfirmUnchanged)),
  check('9B-20: unchanged confirmation requires a prior finalized true physical count', /previous_verified_count_line_id is null/i.test(phase9bConfirmUnchanged) && /previous_session\.status in \('completed', 'approved'\)/i.test(phase9bConfirmUnchanged) && /previous\.count_method in \('manual', 'imported', 'adjusted'\)/i.test(phase9bConfirmUnchanged)),
  check('9B-21: unchanged confirmation cannot chain from another unchanged confirmation', !/previous\.count_method[\s\S]{0,80}confirmed_unchanged/i.test(phase9bConfirmUnchanged) && /count_method = 'confirmed_unchanged'/i.test(phase9bConfirmUnchanged)),
  check('9B-22: expired recount interval forces a physical count', /previous_physical_counted_at_snapshot[\s\S]*?< now\(\) - make_interval\(days => v_line\.physical_recount_interval_days_snapshot\)/i.test(phase9bConfirmUnchanged) && purePassed('9B-22b:')),
  check('9B-23: Main beverage stock renames the existing coded row in place', /update public\.inventory_locations[\s\S]*?set name = 'Main beverage stock'[\s\S]*?upper\(trim\(location\.code\)\) = 'BEVERAGE_STORAGE_BOTTLES'/i.test(phase9bSql) && purePassed('9B-23:')),
  check('9B-24: Main beverage stock is not recreated under a new code', (phase9bTemplate.match(/"code":"BEVERAGE_STORAGE_BOTTLES"/g) || []).length === 1 && purePassed('9B-24:')),
  check('9B-25: Event reserve is created once by stable code', (phase9bTemplate.match(/"code":"BEVERAGE_STORAGE_EVENT_RESERVE"/g) || []).length === 1 && purePassed('9B-25:')),
  check('9B-26: Dormant spirits is created once by stable code', (phase9bTemplate.match(/"code":"BEVERAGE_STORAGE_DORMANT_SPIRITS"/g) || []).length === 1 && purePassed('9B-26:')),
  check('9B-27: Phase 9B template remains serialized, code-idempotent and exactly 19 locations', /pg_advisory_xact_lock/i.test(phase9bTemplate) && /lower\(trim\(location\.code\)\) = lower\(v_template\.code\)/i.test(phase9bTemplate) && (phase9bTemplate.match(/\{"code":/g) || []).length === 19 && purePassed('9B-27:')),
  check('9B-28: installed setup cannot rename Main beverage stock back', phase9bTemplate.includes('"name":"Main beverage stock"') && !phase9bTemplate.includes('Wine & bottle storage')),
  check('9B-29: exact-par standards UI no longer requires Minimum', /stockPolicy === 'exact_par'[\s\S]*?Target quantity/i.test(standardsWorkspace) && !/>Minimum</i.test(standardsWorkspace)),
  check('9B-30: operating reserve UI shows service basis, multiplier and derived target', /Service stock:/i.test(standardsWorkspace) && /Reserve multiplier/i.test(standardsWorkspace) && /Derived from service stock/i.test(standardsWorkspace)),
  check('9B-31: event reserve UI supports full cases and loose units', /Full cases/i.test(workspace) && /Loose units/i.test(workspace) && /Calculated total/i.test(workspace)),
  check('9B-32: dormant UI states Shopbox is not integrated and confirmation is attestation', /Shopbox movement validation is not connected/i.test(workspace) && /manager attestation/i.test(workspace)),
  check('9B-33: protected event reserve is separate from daily restocking', /\['exact_par', 'operating_reserve'\]\.includes/i.test(calculations) && /Not for daily restocking/i.test(workspace) && purePassed('9B-33:')),
  check('9B-34: normal staff and shared-device actor flow retain physical counting', /inventory_resolve_actor\(input_actor_name\)/i.test(phase9bManualCount) && !/current_user_can_manage_inventory_config/i.test(phase9bManualCount)),
  check('9B-35: policy configuration remains manager-only and rejects shared devices', /current_user_can_manage_inventory_config\(\)/i.test(phase9bBulkStandards) && /current_user_is_shared_device\(\)/i.test(phase9bBulkStandards)),
  check('9B-36: new RPC records and setup results are sanitized', !/'[a-z_]*auth_user_id'/i.test(phase9bSafeLine) && !/organization_id|auth_user_id/i.test(phase9bTemplateReturn) && !/organization_id|auth_user_id/i.test(phase9bBulkStandards.slice(phase9bBulkStandards.lastIndexOf('return jsonb_build_object(')))),
  check('9B-37: inventory client retains explicit column reads', !/select\(['"]\*['"]\)/i.test(client) && /stock_policy,target_mode,reserve_multiplier,case_size,target_cases,target_loose_quantity,physical_recount_interval_days/i.test(client)),
  check('9B-38: Realtime remains published and new columns use explicit safe grants', (sql.match(/from pg_catalog\.pg_publication where pubname = 'supabase_realtime'/g) || []).length === 5 && ['stock_policy', 'target_mode', 'reserve_multiplier', 'case_size', 'target_cases', 'target_loose_quantity', 'physical_recount_interval_days'].every((field) => phase9bSql.slice(phase9bSql.indexOf('grant select ('), phase9bSql.indexOf(') on table public.inventory_location_products')).includes(field)) && !/grant select on table public\.inventory_/i.test(phase9bSql)),
  check('9B-39: copying standards preserves complete policy configuration', ['stock_policy', 'target_mode', 'reserve_multiplier', 'case_size', 'target_cases', 'target_loose_quantity', 'physical_recount_interval_days'].every((field) => phase9bCopyStandards.includes(field)) && /current_user_can_manage_inventory_config\(\)/i.test(phase9bCopyStandards)),
  check('9B-40: all Phase 9B RPC grants are explicit and direct table writes remain unavailable', /revoke all on function public\.set_inventory_count_line_case_quantity/i.test(phase9bSql) && /grant execute on function public\.set_inventory_count_line_case_quantity/i.test(phase9bSql) && !/grant (?:insert|update|delete)[^\n]*to authenticated/i.test(phase9bSql)),
  check('9B.1-G1: Realtime includes inventory location standards in the organization-filtered subscriptions', /'inventory_location_products'/i.test(realtime) && /filter: `organization_id=eq\.\$\{organizationId\}`/i.test(realtime)),
  check('9B.1-G2: Realtime includes count lines in the organization-filtered subscriptions', /'inventory_count_lines'/i.test(realtime) && /filter: `organization_id=eq\.\$\{organizationId\}`/i.test(realtime)),
  check('9B.1-G3: standards retain authenticated organization-id filter permission', /\borganization_id\b/i.test(phase9bStandardGrant)),
  check('9B.1-G4: count lines retain authenticated organization-id filter permission', /\borganization_id\b/i.test(phase9bLineGrant)),
  check('9B.1-G5: normal standards and count-line REST selects still omit organization ID', !standardColumns.split(',').includes('organization_id') && !lineColumns.split(',').includes('organization_id')),
  check('9B.1-G6: sanitized line RPC and normalizers still omit organization ID without select-star', !/'organization_id'/i.test(phase9bSafeLine) && !/organizationId\s*:/i.test(normalizerSource('normalizeStandard', 'normalizeSession')) && !/organizationId\s*:/i.test(normalizerSource('normalizeLine', 'callRpc')) && !/select\(['"]\*['"]\)/i.test(client)),
  check('9B.1-O1: server only permits pristine uncounted lines into unchanged confirmation', /v_line\.count_method <> 'uncounted'[\s\S]*?v_line\.count_status <> 'not_counted'[\s\S]*?v_line\.counted_quantity is not null/i.test(phase9bConfirmUnchanged)),
  check('9B.1-O2: server gives a clear overwrite-protection error', /A current count already exists for this line\. Clear it before confirming the previous physical quantity as unchanged\./i.test(phase9bConfirmUnchanged)),
  check('9B.1-O3: manual current counts are blocked from unchanged replacement', purePassed('9B.1-O2:') && /count_method <> 'uncounted'/i.test(phase9bConfirmUnchanged)),
  check('9B.1-O4: imported current counts are blocked from unchanged replacement', purePassed('9B.1-O3:') && /count_method <> 'uncounted'/i.test(phase9bConfirmUnchanged)),
  check('9B.1-O5: adjusted current counts are blocked from unchanged replacement', purePassed('9B.1-O4:') && /count_method <> 'uncounted'/i.test(phase9bConfirmUnchanged)),
  check('9B.1-O6: skipped current lines are blocked until cleared', purePassed('9B.1-O5:') && /count_status <> 'not_counted'/i.test(phase9bConfirmUnchanged)),
  check('9B.1-O7: repeated confirmed-unchanged request remains idempotent before pristine validation', phase9bConfirmUnchanged.indexOf("v_line.count_method = 'confirmed_unchanged'") >= 0 && phase9bConfirmUnchanged.indexOf("v_line.count_method = 'confirmed_unchanged'") < phase9bConfirmUnchanged.indexOf("v_line.count_method <> 'uncounted'")),
  check('9B.1-O8: UI offers unchanged confirmation only for a pristine line', /calculated\.pristineForUnchanged && <button[\s\S]*?>Confirm unchanged<\/button>/i.test(workspace) && /pristineForUnchanged = countMethod === 'uncounted' && countStatus === 'not_counted' && countedQuantity === null/i.test(calculations)),
  check('9B.1-B1: previous source session and line are shared-locked in session-first order', (phase9bConfirmUnchanged.match(/for share;/gi) || []).length === 2 && phase9bConfirmUnchanged.indexOf('from public.inventory_count_sessions previous_session') < phase9bConfirmUnchanged.lastIndexOf('from public.inventory_count_lines previous')),
  check('9B.1-B2: unchanged source quantity and time can proceed to confirmation update', phase9bConfirmUnchanged.indexOf('v_previous.counted_quantity is distinct from') < phase9bConfirmUnchanged.indexOf('update public.inventory_count_lines line\n  set counted_quantity = v_line.previous_physical_count_quantity_snapshot')),
  check('9B.1-B3: changed source quantity rejects unchanged confirmation', /v_previous\.counted_quantity is distinct from v_line\.previous_physical_count_quantity_snapshot/i.test(phase9bConfirmUnchanged)),
  check('9B.1-B4: changed source timestamp rejects unchanged confirmation', /v_previous\.counted_at is distinct from v_line\.previous_physical_counted_at_snapshot/i.test(phase9bConfirmUnchanged)),
  check('9B.1-B5: reopened or in-progress source session is rejected', /previous_session\.status in \('completed', 'approved'\)/i.test(phase9bConfirmUnchanged) && /previous physical count is no longer in a finalized session/i.test(phase9bConfirmUnchanged)),
  check('9B.1-B6: re-finalized source remains eligible when the immutable baseline still matches', /previous_session\.status in \('completed', 'approved'\)/i.test(phase9bConfirmUnchanged) && /is distinct from v_line\.previous_physical_count_quantity_snapshot/i.test(phase9bConfirmUnchanged) && /is distinct from v_line\.previous_physical_counted_at_snapshot/i.test(phase9bConfirmUnchanged)),
  check('9B.1-B7: previous source lookup remains organization, location and product scoped', /previous\.organization_id = v_org/i.test(phase9bConfirmUnchanged) && /previous\.location_id = v_line\.location_id/i.test(phase9bConfirmUnchanged) && /previous\.product_id = v_line\.product_id/i.test(phase9bConfirmUnchanged)),
  check('9B.1-R1: current true physical methods suppress recount-due state', /currentPhysicalCount = \['manual', 'imported', 'adjusted'\]\.includes\(countMethod\)/i.test(calculations) && /!currentPhysicalCount \? isPhysicalRecountDue\(line\) : false/i.test(calculations)),
  check('9B.1-R2: dormant UI reports a current physical count instead of recount-required', /Physical count recorded for this session/i.test(workspace) && /Current physical count:/i.test(workspace)),
  check('9B.1-R3: overview due count uses the corrected physical-recount state', /dormantPhysicalRecountDue: calculated\.filter\(\(line\) => line\.stockPolicy === 'verify_unchanged' && line\.physicalRecountDue\)\.length/i.test(calculations) && purePassed('9B.1-R6:')),
];

for (const result of checks) {
  console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.name}`);
}

const passed = checks.filter((result) => result.passed).length;
console.log(`\nPhase 9A verification: ${passed}/${checks.length} passed.`);
if (passed !== checks.length) process.exitCode = 1;
