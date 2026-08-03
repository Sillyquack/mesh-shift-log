import { readFileSync } from 'node:fs';
import { runInventoryVerification } from '../src/data/inventoryVerification.js';
import { runInventoryPermissionVerification } from '../src/data/inventoryPermissionVerification.js';
import {
  EXPECTED_PHASE9_MIGRATION_ORDER,
  PHASE9_TERMINAL_MIGRATION,
  validatedPhase9MigrationEntries,
  validatePhase9MigrationOrder,
} from './phase9MigrationOrder.mjs';

const schemaSql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const phase7aSql = readFileSync(new URL('../supabase/phase7a_workbar_device_auth.sql', import.meta.url), 'utf8');
const sql = readFileSync(new URL('../supabase/phase9a_inventory_stocktaking.sql', import.meta.url), 'utf8');
const phase9a4Sql = readFileSync(new URL('../supabase/phase9a4_inventory_location_template.sql', import.meta.url), 'utf8');
const phase9bSql = readFileSync(new URL('../supabase/phase9b_stock_policies.sql', import.meta.url), 'utf8');
const phase9cSql = readFileSync(new URL('../supabase/phase9c_inventory_security_hardening.sql', import.meta.url), 'utf8');
const phase9dSql = readFileSync(new URL('../supabase/phase9d_inventory_session_integrity.sql', import.meta.url), 'utf8');
const phase9eSql = readFileSync(new URL('../supabase/phase9e_inventory_product_identity_csv.sql', import.meta.url), 'utf8');
const phase9fSql = readFileSync(new URL('../supabase/phase9f_inventory_structured_quantities.sql', import.meta.url), 'utf8');
const phase9gSql = readFileSync(new URL('../supabase/phase9g_inventory_operational_scope.sql', import.meta.url), 'utf8');
const phase9jSql = readFileSync(new URL('../supabase/phase9j_inventory_shelf_storage_guidance.sql', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/lib/inventoryClient.js', import.meta.url), 'utf8');
const realtime = readFileSync(new URL('../src/lib/inventoryRealtime.js', import.meta.url), 'utf8');
const calculations = readFileSync(new URL('../src/data/inventoryCalculations.js', import.meta.url), 'utf8');
const csv = readFileSync(new URL('../src/data/inventoryCsv.js', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../src/components/InventoryWorkspace.jsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const permissions = readFileSync(new URL('../src/lib/permissions.js', import.meta.url), 'utf8');
const securityDocumentation = readFileSync(new URL('../docs/stock-count-security.md', import.meta.url), 'utf8');
const databaseRunner = readFileSync(new URL('./verify-phase9-security-db.mjs', import.meta.url), 'utf8');
const databaseFixtures = readFileSync(new URL('../supabase/tests/phase9/security-fixtures.sql', import.meta.url), 'utf8');
const databaseAssertions = readFileSync(new URL('../supabase/tests/phase9/security-assertions.sql', import.meta.url), 'utf8');
const integrityAssertions = readFileSync(new URL('../supabase/tests/phase9/session-integrity-assertions.sql', import.meta.url), 'utf8');
const identityAssertions = readFileSync(new URL('../supabase/tests/phase9/product-identity-assertions.sql', import.meta.url), 'utf8');
const lifecycleVerification = readFileSync(new URL('./verify-inventory-session-lifecycle.mjs', import.meta.url), 'utf8');
const identityCsvVerification = readFileSync(new URL('./verify-inventory-product-identity-csv.mjs', import.meta.url), 'utf8');
const structuredQuantityVerification = readFileSync(new URL('./verify-inventory-structured-quantities.mjs', import.meta.url), 'utf8');
const migrationEntries = validatedPhase9MigrationEntries();
const migrationPaths = migrationEntries.map((entry) => entry.path);
let unsafeMigrationOrderRejected = false;
try {
  validatePhase9MigrationOrder([...migrationPaths, 'supabase/phase9a_inventory_stocktaking.sql']);
} catch {
  unsafeMigrationOrderRejected = true;
}

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

function phase9cFunctionBody(name) {
  const start = phase9cSql.indexOf(`create or replace function public.${name}(`);
  if (start < 0) return '';
  const end = phase9cSql.indexOf('\n$$;', start);
  return end < 0 ? '' : phase9cSql.slice(start, end + 4);
}

function phase9dFunctionBody(name) {
  const replaceMarker = `create or replace function public.${name}(`;
  const createMarker = `create function public.${name}(`;
  const replaceStart = phase9dSql.indexOf(replaceMarker);
  const createStart = phase9dSql.indexOf(createMarker);
  const start = replaceStart >= 0 ? replaceStart : createStart;
  if (start < 0) return '';
  const end = phase9dSql.indexOf('\n$$;', start);
  return end < 0 ? '' : phase9dSql.slice(start, end + 4);
}

function phase9eFunctionBody(name) {
  const start = phase9eSql.indexOf(`create or replace function public.${name}(`);
  if (start < 0) return '';
  const end = phase9eSql.indexOf('\n$$;', start);
  return end < 0 ? '' : phase9eSql.slice(start, end + 4);
}

function phase9fFunctionBody(name) {
  const start = phase9fSql.indexOf(`create or replace function public.${name}(`);
  if (start < 0) return '';
  const end = phase9fSql.indexOf('\n$$;', start);
  return end < 0 ? '' : phase9fSql.slice(start, end + 4);
}

function phase9jFunctionBody(name) {
  const start = phase9jSql.indexOf(`create or replace function public.${name}(`);
  if (start < 0) return '';
  const end = phase9jSql.indexOf('\n$$;', start);
  return end < 0 ? '' : phase9jSql.slice(start, end + 4);
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

const importCatalog = functionBody('import_inventory_catalog');
const createSession = functionBody('create_inventory_count_session');
const bulkUsePar = functionBody('mark_inventory_location_use_par');
const locationTemplate = phase9a4FunctionBody('setup_mesh_youngstorget_inventory_locations');
const bulkStandards = phase9a4FunctionBody('bulk_upsert_inventory_location_standards');
const safeSessionRecord = phase9dFunctionBody('get_inventory_count_session_record');
const safeLineRecord = phase9eFunctionBody('inventory_count_line_client_record');
const productResponseKeys = returnedJsonKeys('upsert_inventory_product');
const locationResponseKeys = returnedJsonKeys('upsert_inventory_location');
const standardResponseKeys = returnedJsonKeys('upsert_inventory_location_product');
const productNormalizer = normalizerSource('normalizeProduct', 'normalizeLocation');
const locationNormalizer = normalizerSource('normalizeLocation', 'normalizeStandard');
const standardNormalizer = normalizerSource('normalizeStandard', 'normalizeSession');
const pure = runInventoryVerification();
const permissionVerification = runInventoryPermissionVerification();
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
const phase9jTargetDetails = phase9jFunctionBody('inventory_stock_policy_target_details');
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
const phase9cManagerPermission = phase9cFunctionBody('current_user_can_manage_inventory_config');
const phase9cCoordinatorPermission = phase9cFunctionBody('current_user_can_coordinate_inventory');
const phase9cActorResolver = phase9cFunctionBody('inventory_resolve_actor');
const phase9cSessionVisibility = phase9cFunctionBody('inventory_session_is_visible');
const phase9cInventoryPolicies = phase9cSql.slice(
  phase9cSql.indexOf('-- Inventory remains column-selectable'),
  phase9cSql.indexOf('-- Defense in depth:'),
);
const phase9dCreateSession = phase9dFunctionBody('create_inventory_count_session');
const phase9dCorrectionSession = phase9dFunctionBody('create_inventory_correction_session');
const phase9dLineLock = phase9dFunctionBody('inventory_lock_mutable_count_line');
const phase9dSessionTrigger = phase9dFunctionBody('inventory_enforce_count_session_integrity');
const phase9dLineTrigger = phase9dFunctionBody('inventory_enforce_count_line_integrity');
const phase9dGrants = phase9dSql.slice(phase9dSql.indexOf('revoke all on function public.inventory_enforce_count_session_integrity'));
const phase9fGrants = phase9fSql.slice(phase9fSql.indexOf('revoke all on function public.inventory_snapshot_count_measurement'));
const phase9eLineRecord = phase9eFunctionBody('inventory_count_line_client_record');
const phase9eLineGrant = phase9eSql.slice(
  phase9eSql.indexOf('grant select ('),
  phase9eSql.indexOf(') on table public.inventory_count_lines to authenticated'),
);
const effectiveInventoryMutationBodies = [
  phase9fFunctionBody('upsert_inventory_product'),
  functionBody('upsert_inventory_location'),
  functionBody('upsert_inventory_location_product'),
  phase9bCopyStandards,
  phase9bTemplate,
  phase9bBulkStandards,
  phase9dCreateSession,
  phase9fFunctionBody('set_inventory_count_line_quantity'),
  phase9fFunctionBody('set_inventory_count_line_case_quantity'),
  phase9fFunctionBody('set_inventory_count_line_structured_quantity'),
  phase9dFunctionBody('mark_inventory_count_line_use_par'),
  phase9dFunctionBody('clear_inventory_count_line'),
  phase9dFunctionBody('skip_inventory_count_line'),
  phase9dFunctionBody('mark_inventory_location_use_par'),
  phase9dFunctionBody('confirm_inventory_count_line_unchanged'),
  phase9dFunctionBody('complete_inventory_count_location'),
  phase9dFunctionBody('complete_inventory_count_session'),
  phase9dCorrectionSession,
  functionBody('approve_inventory_count_session'),
  functionBody('cancel_inventory_count_session'),
  importCatalog,
];
const inventoryMutationSignatures = [
  'upsert_inventory_product(uuid, text, text, text, text, text, text, numeric, text, text, boolean, integer, jsonb, text, numeric, text[])',
  'upsert_inventory_location(uuid, text, text, text, uuid, text, text, boolean, integer, jsonb, text[])',
  'upsert_inventory_location_product(uuid, uuid, uuid, numeric, numeric, numeric, integer, boolean, text, jsonb, text[])',
  'copy_inventory_location_standards(uuid, uuid, boolean)',
  'setup_mesh_youngstorget_inventory_locations()',
  'bulk_upsert_inventory_location_standards(uuid, jsonb)',
  'create_inventory_count_session(text, text, uuid, date, uuid[], text)',
  'create_inventory_correction_session(uuid, text, uuid)',
  'set_inventory_count_line_quantity(uuid, numeric, text, text, timestamptz)',
  'set_inventory_count_line_case_quantity(uuid, integer, numeric, text, text, timestamptz)',
  'set_inventory_count_line_structured_quantity(uuid, numeric, numeric, numeric, numeric, text, text, timestamptz)',
  'mark_inventory_count_line_use_par(uuid, text, text, timestamptz)',
  'clear_inventory_count_line(uuid, text, timestamptz)',
  'skip_inventory_count_line(uuid, text, text, timestamptz)',
  'mark_inventory_location_use_par(uuid, uuid, boolean, text, timestamptz)',
  'confirm_inventory_count_line_unchanged(uuid, timestamptz)',
  'complete_inventory_count_location(uuid, uuid, text)',
  'complete_inventory_count_session(uuid, text, boolean, text)',
  'approve_inventory_count_session(uuid, text)',
  'cancel_inventory_count_session(uuid, text)',
  'import_inventory_catalog(jsonb, boolean)',
];

const checks = [
  ...pure.checks,
  ...permissionVerification.checks,
  check('1: finalized session and line triggers make approved history immutable below the RPC layer', /old\.status in \('approved', 'cancelled'\)[\s\S]*?immutable/i.test(phase9dSessionTrigger) && /v_status not in \('draft', 'in_progress'\)/i.test(phase9dLineTrigger)),
  check('2: one active session per organization is enforced with idempotent serialized creation', /inventory_count_sessions_one_active_per_org/i.test(phase9dSql) && /pg_advisory_xact_lock/i.test(phase9dCreateSession) && /idempotentReplay/i.test(phase9dCreateSession)),
  check('3: destructive reopen is removed and approved corrections are new linked sessions', /drop function if exists public\.reopen_inventory_count_session/i.test(phase9dSql) && /original_session_id/i.test(phase9dCorrectionSession) && /v_original\.status <> 'approved'/i.test(phase9dCorrectionSession)),
  check('4: every count-line mutation locks session before lines', lineMutations.every(sessionBeforeLines)),
  check('4a: approval and cancel lock their session row while correction locks the approved source', lifecycleMutations.every(sessionLockOnly) && /for share/i.test(phase9dCorrectionSession)),
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
  check('20: session preview uses only eligible countable locations and submits the sanitized selection', /eligibleInventorySessionLocations/i.test(workspace) && /inventorySessionSelection/i.test(workspace) && /onCreate\(\{ \.\.\.draft, locationIds: selection\.locationIds \}\)/i.test(workspace)),
  check('20a: session selector no longer expands parent areas into the count scope', !/effectiveInventoryLocationIds/i.test(workspace) && /Countable locations with active standards/i.test(workspace)),
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
  check('24: grouped selectors render contextual parent and child names', /function contextualLocationName/i.test(workspace) && /`\$\{parent\.name\} · \$\{location\.name\}`/i.test(workspace) && /<optgroup/i.test(workspace) && /groupedInventoryLocations\(locations\)/i.test(workspace) && /<span>\{contextualLocationName\(location, locations\)\}<\/span>/i.test(workspace)),
  check('24c: terminal setup review names exactly the six Phase 9G operational refrigerators', /Cornerbar[^\n]*Left Fridge[^\n]*Middle Fridge[^\n]*Right Fridge/i.test(workspace) && /Workbar[^\n]*Bar Left Fridge[^\n]*Bar Right Fridge[^\n]*Non-Alco Fridge/i.test(workspace) && !/Workbar[^\n]*Bar Middle Fridge/i.test(workspace)),
  check('24a: standards editor is location-first and saves all changed rows in one RPC', /Location-first setup/i.test(workspace) && /changedProducts\.map/i.test(workspace) && /saveInventoryStandardsBulk\(\{ locationId, rows \}\)/i.test(workspace)),
  check('24b: standards editor searches name, SKU and category and separates archived products', /`\$\{product\.name\} \$\{product\.sku\} \$\{product\.category\}`/i.test(workspace) && /Archived products with active standards/i.test(workspace)),
  check('25: Wine, Spirits, Beer and Mineral water remain editable category presets', ['Beer', 'Wine', 'Spirits', 'Mineral water'].every((category) => workspace.includes(`'${category}'`)) && /input list="inventory-product-categories"/i.test(workspace)),
  check('25a: Phase 9A.4 client uses the guarded RPC wrappers', /callRpc\('setup_mesh_youngstorget_inventory_locations'/i.test(client) && /callRpc\('bulk_upsert_inventory_location_standards'/i.test(client)),
  check('9B-1: existing standards default to exact-par', /stock_policy text not null default 'exact_par'/i.test(phase9bSql)),
  check('9B-2: migration preserves existing par quantities', !/alter table public\.inventory_location_products[\s\S]*?drop column[\s\S]*?par_quantity/i.test(phase9bSql) && !/update public\.inventory_location_products\s+set par_quantity\s*=/i.test(phase9bSql)),
  check('9B-3: existing minimum values remain stored', !/drop column(?: if exists)? minimum_quantity/i.test(phase9bSql) && !/update public\.inventory_location_products\s+set minimum_quantity\s*=/i.test(phase9bSql)),
  check('9B-4: exact-par effective target equals configured par', /if v_standard\.stock_policy = 'exact_par'[\s\S]*?v_standard\.par_quantity/i.test(phase9bTarget) && purePassed('9B-4:')),
  check('9B-5: derived reserve sums only active opted-in countable refrigerator exact-par targets', /location\.countable/i.test(phase9jTargetDetails) && /location\.location_type = 'fridge'/i.test(phase9jTargetDetails) && /source\.stock_policy = 'exact_par'/i.test(phase9jTargetDetails) && /source\.contributes_to_storage_target/i.test(phase9jTargetDetails) && purePassed('9B-5:')),
  check('9B-6: archived standards are excluded from reserve target', /service_standard\.active = true/i.test(phase9bTarget) && purePassed('9B-6:')),
  check('9B-7: archived locations are excluded from reserve target', /root\.active = true[\s\S]*?child\.active = true/i.test(phase9bTarget) && purePassed('9B-7:')),
  check('9B-8: parent locations are not double counted', /select child\.id[\s\S]*?child\.parent_location_id = root\.id/i.test(phase9bTarget) && !/select root\.id/i.test(phase9bTarget) && purePassed('9B-8:')),
  check('9B-9: organization Main Storage multiplier is applied', /settings\.target_multiplier/i.test(phase9jTargetDetails) && /v_basis \* v_multiplier/i.test(phase9jTargetDetails) && purePassed('9B-9:')),
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
  check('9B-30: operating reserve UI shows qualifying basis, organization multiplier and derived target', /Qualifying refrigerator targets:/i.test(standardsWorkspace) && /Organization Main Storage multiplier/i.test(standardsWorkspace) && /Derived from qualifying refrigerator targets/i.test(standardsWorkspace)),
  check('9B-31: event reserve UI supports full cases and loose units', /Full cases/i.test(workspace) && /Loose units/i.test(workspace) && /Calculated total/i.test(workspace)),
  check('9B-32: dormant UI states Shopbox is not integrated and confirmation is attestation', /Shopbox movement validation is not connected/i.test(workspace) && /manager attestation/i.test(workspace)),
  check('9B-33: protected event reserve is separate from daily restocking', /\['exact_par', 'operating_reserve'\]\.includes/i.test(calculations) && /Not for daily restocking/i.test(workspace) && purePassed('9B-33:')),
  check('9B-34: Phase 9C supersedes the former staff actor flow with manager-only resolution', /inventory_resolve_actor\(input_actor_name\)/i.test(phase9bManualCount) && /profile\.role = 'manager'/i.test(phase9cActorResolver) && /coalesce\(profile\.is_shared_device, false\) = false/i.test(phase9cActorResolver)),
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
  check('SEC-S1: frontend inventory roles share one verified Supabase identity predicate while manager authority stays strict', /function hasVerifiedInventoryIdentity/i.test(permissions) && /user\.loginSource === 'supabase_auth'/i.test(permissions) && /user\.authSessionVerified === true/i.test(permissions) && /authUserId === profileId/i.test(permissions) && /roleOf\(user\.profile\) === expectedRole/i.test(permissions) && /user\.profile\?\.active === true/i.test(permissions) && /return canManageInventory\(user\) \|\| isInventoryCounter\(user\)/i.test(permissions) && /return hasVerifiedInventoryIdentity\(user, 'manager'\)/i.test(permissions)),
  check('SEC-S2: unauthorized routes render an explicit Stock Count access-denied state before workspace hooks', /if \(!canUseInventory\(props\.user\)\)[\s\S]*?Stock Count access required[\s\S]*?Staff-code, event-floor and shared-device sessions cannot access/i.test(workspace)),
  check('SEC-S3: both App launch points are gated and the Manager Dashboard card is conditional', (app.match(/onOpenInventory=\{canUseInventory\(effectiveUser\) \? openInventoryWorkspace : null\}/g) || []).length === 2 && /\{onOpenInventory && \([\s\S]*?<h2>Stock Count<\/h2>/i.test(app)),
  check('SEC-S4: user-facing inventory launch and workspace labels use Stock Count', /selectedShift === "inventory"[\s\S]*?"Stock Count"/i.test(app) && /Open Stock Count/i.test(app) && /<h1>Stock Count<\/h1>/i.test(workspace)),
  check('SEC-S5: cached Supabase users are unverified until a live session and profile reload succeeds', /storedUser\?\.loginSource === "supabase_auth"[\s\S]*?authSessionVerified: false/i.test(app) && /authSessionVerified: Boolean\(authUser\?\.id && profile\.id === authUser\.id\)/i.test(app) && /auth_session_missing/i.test(app)),
  check('SEC-S6: frontend inventory RPC payloads no longer send a free-text operator identity', !/input_actor_name|actorName/i.test(client) && !/actorName|currentOperator/i.test(workspace)),
  check('SEC-D1: manager authority requires auth uid, active manager, non-shared profile and non-null organization', /profile\.id = \(select auth\.uid\(\)\)/i.test(phase9cManagerPermission) && /profile\.active = true/i.test(phase9cManagerPermission) && /profile\.role = 'manager'/i.test(phase9cManagerPermission) && /profile\.organization_id is not null/i.test(phase9cManagerPermission) && /coalesce\(profile\.is_shared_device, false\) = false/i.test(phase9cManagerPermission)),
  check('SEC-D2: event-floor coordination is removed by aliasing coordination to manager authorization', /select public\.current_user_can_manage_inventory_config\(\)/i.test(phase9cCoordinatorPermission) && !/event_floor_manager/i.test(phase9cCoordinatorPermission)),
  check('SEC-D3: actor resolution ignores free text and uses only the authenticated manager profile', !phase9cActorResolver.slice(phase9cActorResolver.indexOf('as $$')).includes('input_actor_name') && !/shift_sessions|operator_name|user_metadata|auth\.jwt/i.test(phase9cActorResolver) && /v_profile\.display_name/i.test(phase9cActorResolver)),
  check('SEC-D4: session visibility is active-manager and strict same-organization only', /profile\.role = 'manager'/i.test(phase9cSessionVisibility) && /session\.organization_id = profile\.organization_id/i.test(phase9cSessionVisibility) && !/organization_id is null|current_user_organization_id\(\) is null/i.test(phase9cSessionVisibility)),
  check('SEC-D5: broad profile update policy and authenticated table update privilege are removed', /revoke insert, update, delete, truncate, references, trigger[\s\S]*?on table public\.user_profiles from authenticated/i.test(phase9cSql) && /drop policy if exists "pilot managers can update profiles"/i.test(phase9cSql) && !/create policy "pilot managers can update profiles"/i.test(phase9cSql)),
  check('SEC-D6: every known profile authority column has direct UPDATE revoked', ['id', 'organization_id', 'display_name', 'role', 'active', 'staff_code_alias', 'is_shared_device', 'shared_device_label', 'created_at', 'updated_at'].every((field) => phase9cSql.slice(phase9cSql.indexOf('revoke update ('), phase9cSql.indexOf(') on table public.user_profiles')).includes(field))),
  check('SEC-D7: manager profile diagnostics are read-only and same-organization scoped', /create policy "pilot managers can read profiles"[\s\S]*?current_user_can_manage_inventory_config\(\)[\s\S]*?organization_id = \(select public\.current_user_organization_id\(\)\)/i.test(phase9cSql) && /View-only profile check/i.test(app)),
  check('SEC-D8: all five inventory read policies require manager and exact organization equality', (phase9cInventoryPolicies.match(/create policy inventory_[a-z_]+_read/g) || []).length === 5 && (phase9cInventoryPolicies.match(/current_user_can_manage_inventory_config\(\)/g) || []).length === 5 && (phase9cInventoryPolicies.match(/organization_id = \(select public\.current_user_organization_id\(\)\)/g) || []).length === 5),
  check('SEC-D9: inventory read policies have null-denying organization logic', !/organization_id is null|current_user_organization_id\(\) is null|\bis null\s+or\b/i.test(phase9cInventoryPolicies)),
  check('SEC-D10: every effective inventory mutation reaches the strict manager helper or actor resolver', effectiveInventoryMutationBodies.every((body) => body && /current_user_can_manage_inventory_config\(\)|inventory_resolve_actor\(/i.test(body))),
  check('SEC-D11: every effective mutation RPC revokes PUBLIC and anon before granting authenticated execution', inventoryMutationSignatures.every((signature) => (phase9cSql + phase9dGrants + phase9fGrants).includes(`revoke all on function public.${signature} from public, anon, authenticated;`) && (phase9cSql + phase9dGrants + phase9fGrants).includes(`grant execute on function public.${signature} to authenticated;`))),
  check('SEC-D12: internal line-record and actor helpers are not directly executable by authenticated', /revoke all on function public\.inventory_count_line_client_record\(uuid\) from public, anon, authenticated/i.test(phase9cSql) && !/grant execute on function public\.inventory_count_line_client_record/i.test(phase9cSql) && !/grant execute on function public\.inventory_resolve_actor/i.test(phase9cSql)),
  check('SEC-D13: Phase 9C security-definer helpers use safe search paths and schema-qualified relations', (phase9cSql.match(/security definer\nset search_path = pg_catalog/g) || []).length === 4 && !/from\s+user_profiles|from\s+inventory_count_sessions/i.test(phase9cSql)),
  check('SEC-D14: Phase 9C contains no metadata-based authorization or service-role frontend credential', !/user_metadata|raw_user_meta_data|service_role_key|VITE_[A-Z_]*SERVICE/i.test(phase9cSql + client + workspace)),
  check('SEC-D15: focused security documentation states the enforced boundary and executable test layers', /manager-only/i.test(securityDocumentation) && /Supabase Auth/i.test(securityDocumentation) && /staff-code/i.test(securityDocumentation) && /shared-device/i.test(securityDocumentation) && /executable PostgreSQL/i.test(securityDocumentation)),
  check('9E-1: product ID is selected, normalized, and returned by guarded line mutations', /\bproduct_id\b/i.test(lineColumns) && /productId: row\.product_id/i.test(normalizerSource('normalizeLine', 'callRpc')) && /'product_id', v_line\.product_id/i.test(phase9eLineRecord)),
  check('9E-2: restock grouping is product-ID based with stable line and location identities', /requireCountLineIdentity\(line, 'Restock aggregation'\)/i.test(calculations) && /const key = productId/i.test(calculations) && /products\.get\(key\)/i.test(calculations) && /lineId,/i.test(calculations) && !/const key = `\$\{line\.productName[^\n]*unitLabel/i.test(calculations)),
  check('9E-3: approved comparisons use location and product IDs rather than display snapshots', /function identityPairKey[\s\S]*?requireCountLineIdentity[\s\S]*?JSON\.stringify\(\[locationId, productId\]\)/i.test(calculations) && /compareInventoryApprovedLines\(latest\.lines, previous\.lines\)/i.test(workspace) && !/previousByKey/i.test(workspace)),
  check('9E-4: corrections preserve exact product IDs and approved quantities remain untouched', /source\.product_id/i.test(phase9dCorrectionSession) && !/update public\.inventory_count_lines/i.test(phase9eSql) && /does not rewrite approved historical quantities/i.test(identityAssertions)),
  check('9E-5: CSV export contract is BOM, semicolon, CRLF, and decimal comma', /delimiter: ';'/i.test(csv) && /newline: '\\r\\n'/i.test(csv) && /UTF-8 with BOM/i.test(csv) && /decimalSeparator: ','/i.test(csv)),
  check('9E-6: untrusted formula-capable text is neutralized before standards-compliant quoting', /isDangerousCsvText/i.test(csv) && /[=+\\\-@]/i.test(csv) && /neutralizeCsvText\(original\)/i.test(csv) && /replace\(\/"\/g, '""'\)/i.test(csv)),
  check('9E-7: every inventory CSV export includes stable product identity', (workspace.match(/makeCsv\(\[[^\]]*'Product ID'/g) || []).length === 4),
  check('9E-8: duplicate display labels receive a conditional product reference rather than a display-derived key', /inventoryProductIdentityReference/i.test(workspace) && /matchingIds\.size < 2/i.test(calculations) && /Product ref/i.test(calculations)),
  check('9E-9: terminal SQL exposes only the safe product-ID column and keeps the helper internal', /\bproduct_id\b/i.test(phase9eLineGrant) && /revoke all on function public\.inventory_count_line_client_record\(uuid\) from public, anon, authenticated/i.test(phase9eSql) && !/grant execute on function public\.inventory_count_line_client_record/i.test(phase9eSql)),
  check('9E-10: executable fixtures cover same-display identity, correction copying, formula injection and CSV round trips', /DB-IDENTITY-8/i.test(identityAssertions) && /same-name and same-unit products remain separate/i.test(identityCsvVerification) && /formula-capable untrusted text/i.test(identityCsvVerification) && /round-trip from the final CSV string/i.test(identityCsvVerification)),
  check('MIG-1: canonical migration manifest matches the exact Phase 9 prerequisite order', JSON.stringify(migrationPaths) === JSON.stringify(EXPECTED_PHASE9_MIGRATION_ORDER)),
  check('MIG-2: Phase 7A shared-device prerequisite is ordered before Phase 9A', migrationPaths.indexOf('supabase/phase7a_workbar_device_auth.sql') < migrationPaths.indexOf('supabase/phase9a_inventory_stocktaking.sql') && /add column if not exists is_shared_device/i.test(phase7aSql) && /current_user_is_shared_device/i.test(sql)),
  check('MIG-3: the declared Phase 9 terminal migration is last and unsafe older-phase reapplication is rejected', migrationPaths.at(-1) === PHASE9_TERMINAL_MIGRATION && unsafeMigrationOrderRejected),
  check('MIG-4: baseline manager-review DO block has valid double-dollar delimiters', !/\bdo\s+\$(?!\$)\s/i.test(schemaSql) && /do \$\$[\s\S]*?manager_daily_reviews_local_id_key[\s\S]*?end\s*\n\$\$;/i.test(schemaSql)),
  check('MIG-5: database runner is pinned, network-isolated, pull-disabled and accepts no connection arguments', /public\.ecr\.aws\/supabase\/postgres:17\.6\.1\.141/i.test(databaseRunner) && /'--network', 'none'/i.test(databaseRunner) && /'--pull', 'never'/i.test(databaseRunner) && /process\.argv\.length > 2/i.test(databaseRunner) && !/DATABASE_URL|SUPABASE_DB_URL|postgres(?:ql)?:\/\//i.test(databaseRunner)),
  check('MIG-6: disposable fixtures cover two organizations and every required profile type', ['Organization A Manager', 'Organization B Manager', 'Organization A Staff', 'Organization A Shift Lead', 'Organization A Event Floor Manager', 'Organization A Time2Staff', 'Organization A Shared Manager', 'Organization A Inactive Manager', 'Null Organization Manager'].every((fixture) => databaseFixtures.includes(fixture))),
  check('MIG-7: executable assertions cover RLS, profile authority, mutation RPCs, tenant IDs and effective EXECUTE grants', /DB-RLS-1/i.test(databaseAssertions) && /DB-PROFILE-6/i.test(databaseAssertions) && (databaseAssertions.match(/\('(?:upsert product|upsert location|upsert standard|copy standards|setup template|bulk standards|create session|set line quantity|set line cases|mark line use par|clear line|skip line|mark location use par|confirm unchanged|complete location|complete session|approve session|create correction|cancel session|import catalog)'/g) || []).length === 20 && /DB-9F-17/i.test(readFileSync(new URL('../supabase/tests/phase9/structured-quantity-assertions.sql', import.meta.url), 'utf8')) && /DB-TENANT-6/i.test(databaseAssertions) && /DB-EXEC-9/i.test(databaseAssertions)),
  check('MIG-9: executable Phase 9D assertions cover stale writes, immutable approval, corrections and structured exceptions', /DB-INTEGRITY-2/i.test(integrityAssertions) && /DB-INTEGRITY-15/i.test(integrityAssertions) && /DB-INTEGRITY-18/i.test(integrityAssertions) && /DB-INTEGRITY-32/i.test(integrityAssertions)),
  check('MIG-10: pure lifecycle assertions cover active slots, lock labels, explicit exceptions and retry key retention', /isInventorySessionActive/i.test(lifecycleVerification) && /inventorySessionLockLabel/i.test(lifecycleVerification) && /do not infer exceptions/i.test(lifecycleVerification) && /retries retain one idempotency key/i.test(lifecycleVerification)),
  check('MIG-11: Phase 9H, 9I and terminal Phase 9J are repeatable after retained Phase 9F through 9G-D coverage', JSON.stringify(migrationEntries.filter((entry) => entry.repeatable).map((entry) => entry.path)) === JSON.stringify(['supabase/phase9h_inventory_session_location_scope.sql', 'supabase/phase9i_millum_stock_count_exports.sql', 'supabase/phase9j_inventory_shelf_storage_guidance.sql']) && migrationEntries.at(-1).path === 'supabase/phase9j_inventory_shelf_storage_guidance.sql' && migrationEntries.at(-2).path === 'supabase/phase9i_millum_stock_count_exports.sql' && migrationEntries.at(-3).path === 'supabase/phase9h_inventory_session_location_scope.sql' && migrationEntries.at(-4).path === 'supabase/phase9gd_inventory_product_mappings.sql' && migrationEntries.at(-5).path === 'supabase/phase9gc_inventory_counter_mobile.sql' && migrationEntries.at(-6).path === 'supabase/phase9gb2_inventory_counter_replacement.sql' && migrationEntries.at(-7).path === 'supabase/phase9gb_inventory_counter_assignments.sql' && /inventory_count_line_structured_quantity/i.test(phase9fSql) && /inventory_refrigerator_reserve_targets/i.test(phase9gSql) && /physical_count_only/i.test(phase9jSql) && /three 0\.7 L sealed bottles/i.test(structuredQuantityVerification)),
  check('MIG-8: documentation distinguishes static, in-memory, executable database and outstanding browser coverage', /static source checks/i.test(securityDocumentation) && /in-memory JavaScript/i.test(securityDocumentation) && /executable PostgreSQL/i.test(securityDocumentation) && /browser/i.test(securityDocumentation)),
];

for (const result of checks) {
  console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.name}`);
}

const passed = checks.filter((result) => result.passed).length;
console.log(`\nPhase 9A verification: ${passed}/${checks.length} passed.`);
if (passed !== checks.length) process.exitCode = 1;
