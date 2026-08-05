import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PHASE9_TERMINAL_MIGRATION, validatedPhase9MigrationEntries } from './phase9MigrationOrder.mjs';

const migration = readFileSync(new URL('../supabase/phase9gb_inventory_counter_assignments.sql', import.meta.url), 'utf8');
const replacementMigration = readFileSync(new URL('../supabase/phase9gb2_inventory_counter_replacement.sql', import.meta.url), 'utf8');
const mobileMigration = readFileSync(new URL('../supabase/phase9gc_inventory_counter_mobile.sql', import.meta.url), 'utf8');
const terminalMigration = readFileSync(new URL('../supabase/phase9j_inventory_shelf_storage_guidance.sql', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/lib/inventoryClient.js', import.meta.url), 'utf8');
const workflows = readFileSync(new URL('../src/components/InventoryCounterWorkflows.jsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../src/components/InventoryWorkspace.jsx', import.meta.url), 'utf8');
const permissions = readFileSync(new URL('../src/lib/permissions.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const runner = readFileSync(new URL('./verify-phase9-security-db.mjs', import.meta.url), 'utf8');
const assertions = readFileSync(new URL('../supabase/tests/phase9/counter-workflow-assertions.sql', import.meta.url), 'utf8');

test('Phase 9G-C and Phase 9G-D remain before repeatable Phase 9H-9K and terminal Phase 9P', () => {
  const entries = validatedPhase9MigrationEntries();
  assert.equal(PHASE9_TERMINAL_MIGRATION, 'supabase/20260805035957_phase9p_millum_export_explanations.sql');
  assert.equal(entries.at(-2).path, 'supabase/20260804200000_phase9o_millum_wine_value_conversion.sql');
  assert.equal(entries.at(-3).path, 'supabase/20260804180000_phase9n_millum_single_authoritative_session.sql');
  assert.equal(entries.at(-4).path, 'supabase/20260804151500_phase9m_millum_snapshot_supplement.sql');
  assert.equal(entries.at(-5).path, 'supabase/20260804123921_phase9l_millum_august_carry_forward_and_future_scope.sql');
  assert.equal(entries.at(-6).path, 'supabase/phase9k_millum_complete_count_export.sql');
  assert.equal(entries.at(-7).path, 'supabase/phase9j_inventory_shelf_storage_guidance.sql');
  assert.equal(entries.at(-8).path, 'supabase/phase9i_millum_stock_count_exports.sql');
  assert.deepEqual(entries.filter((entry) => entry.repeatable).map((entry) => entry.path), [entries.at(-9).path, entries.at(-8).path, entries.at(-7).path, entries.at(-6).path]);
  assert.equal(entries.at(-9).path, 'supabase/phase9h_inventory_session_location_scope.sql');
  assert.equal(entries.at(-10).path, 'supabase/phase9gd_inventory_product_mappings.sql');
});

test('counter role requires verified Supabase identity and never inherits manager permissions', () => {
  assert.match(permissions, /hasVerifiedInventoryIdentity\(user, 'counter'\)/);
  assert.match(permissions, /canManageInventory\(user\) \|\| isInventoryCounter\(user\)/);
  assert.match(permissions, /canCoordinateInventory[\s\S]*?return canManageInventory\(user\)/);
  const inventoryPermissions = permissions.slice(permissions.indexOf('export function canUseInventory'));
  assert.doesNotMatch(inventoryPermissions, /email|service.role|user_metadata/i);
});

test('counter profiles are automatically constrained to Stock Count instead of the general app', () => {
  assert.match(app, /const inventoryCounterUser = isInventoryCounter\(effectiveUser\)/);
  assert.match(app, /if \(showInventory \|\| inventoryCounterUser\)/);
  assert.match(app, /onClose=\{inventoryCounterUser \? logout/);
});

test('membership and assignment tables bind organization, Auth counter, session, countable location, state, and revision', () => {
  for (const token of ['inventory_counter_memberships', 'counter_auth_user_id', 'inventory_count_assignments', 'counter_membership_id', 'session_id', 'location_id', 'state', 'revision']) assert.ok(migration.includes(token));
  assert.match(migration, /unique \(organization_id, session_id, location_id\)/i);
  assert.match(replacementMigration, /inventory_count_assignments_one_current_location_idx/i);
  assert.match(migration, /role <> 'counter'/i);
  assert.match(terminalMigration, /inventory_location_is_countable/i);
});

test('assignment transitions are explicit and terminal acceptance cannot be self-reopened', () => {
  assert.match(migration, /old\.state in \('assigned', 'returned'\) and new\.state = 'submitted'/i);
  assert.match(migration, /old\.state = 'submitted' and new\.state in \('returned', 'accepted'\)/i);
  assert.match(replacementMigration, /old\.state in \('assigned', 'returned'\) and new\.state = 'superseded'/i);
  assert.doesNotMatch(migration + replacementMigration, /old\.state = 'accepted'.*new\.state/s);
  assert.match(migration, /Every assignment change must advance the revision exactly once/i);
});

test('base inventory RLS remains manager-only while counter reads use one sanitized workspace RPC', () => {
  assert.match(migration, /create policy inventory_count_assignments_read/);
  assert.match(migration, /current_user_can_count_inventory/);
  assert.match(migration, /create or replace function public\.get_inventory_counter_workspace/);
  assert.match(client, /rpc\('get_inventory_counter_workspace'\)/);
  const counterLoader = client.slice(client.indexOf('export async function loadInventoryCounterWorkspace'), client.indexOf('export async function getInventoryCountSession'));
  assert.doesNotMatch(counterLoader, /\.from\(/);
});

test('counter workspace exposes stable identity and targetless guidance but omits variance and reserve data', () => {
  const reader = terminalMigration.slice(terminalMigration.indexOf('create or replace function public.get_inventory_counter_workspace'));
  assert.match(reader, /'product_id'/);
  assert.match(reader, /'millum_item_ref'/);
  assert.match(reader, /'standard_quantity', case[\s\S]*?physical_count_only[\s\S]*?then null/);
  assert.match(reader, /'reference_guidance'/);
  assert.doesNotMatch(reader, /'par_quantity_snapshot'|'variance_quantity'|'reserve_target'/);
  assert.match(reader, /session\.status in \('draft', 'in_progress'\)/);
  assert.match(reader, /assignment\.state <> 'superseded'/);
});

test('counter line writes lock the exact assignment and exact assigned location with stale checks', () => {
  const unitWrite = migration.slice(migration.indexOf('create or replace function public.inventory_counter_set_count_line_quantity'), migration.indexOf('create or replace function public.inventory_counter_set_count_line_structured_quantity'));
  assert.match(unitWrite, /inventory_counter_lock_assignment/);
  assert.match(unitWrite, /line\.session_id = v_assignment\.session_id/);
  assert.match(unitWrite, /line\.location_id = v_assignment\.location_id/);
  assert.match(unitWrite, /updated_at is distinct from input_expected_line_updated_at/);
  assert.match(unitWrite, /revision = assignment\.revision \+ 1/);
});

test('structured counter writes support bottles and kegs without product configuration writes', () => {
  const structuredWrite = migration.slice(migration.indexOf('create or replace function public.inventory_counter_set_count_line_structured_quantity'), migration.indexOf('create or replace function public.inventory_counter_apply_refrigerator_default'));
  assert.match(structuredWrite, /container_plus_volume/);
  assert.match(structuredWrite, /keg_fraction/);
  assert.match(structuredWrite, /counted_whole_units/);
  assert.match(structuredWrite, /counted_partial_keg_fraction/);
  assert.doesNotMatch(structuredWrite, /update public\.inventory_products|update public\.inventory_location_products/i);
});

test('counter default application requires physical confirmation and preserves deviations', () => {
  const defaultRpc = migration.slice(migration.indexOf('create or replace function public.inventory_counter_apply_refrigerator_default'), migration.indexOf('create or replace function public.submit_inventory_count_assignment'));
  assert.match(defaultRpc, /input_physical_confirmation is not true/);
  assert.match(defaultRpc, /line\.count_status = 'not_counted'/);
  assert.match(defaultRpc, /line\.product_id is not null/);
  assert.doesNotMatch(defaultRpc, /input_replace_existing|update public\.inventory_location_products/i);
});

test('submission is location-scoped, revisioned, complete-line guarded, and does not complete the session', () => {
  const submit = migration.slice(migration.indexOf('create or replace function public.submit_inventory_count_assignment'), migration.indexOf('create or replace function public.return_inventory_count_assignment'));
  assert.match(submit, /line\.location_id = v_assignment\.location_id/);
  assert.match(submit, /line\.count_status <> 'counted'/);
  assert.match(submit, /state = 'submitted'/);
  assert.doesNotMatch(submit, /complete_inventory_count_session|status = 'completed'|status = 'approved'/);
});

test('session completion is manager-owned and blocked until every assignment is accepted', () => {
  assert.match(migration, /inventory_require_accepted_assignments_before_completion/);
  assert.match(replacementMigration, /assignment\.state not in \('accepted', 'superseded'\)/);
  assert.match(migration, /before update of status on public\.inventory_count_sessions/);
});

test('counter interface has only assigned counting, incomplete navigation, default confirmation, and exact submission label', () => {
  assert.match(workflows, /Next incomplete/);
  assert.match(workflows, /I physically checked this location/);
  assert.match(workflows, /Ferdig – send til Bobby/);
  assert.match(workflows, /It does not complete or approve the Stock Count/);
  const counterUi = workflows.slice(workflows.indexOf('export function CounterInventoryWorkspace'), workflows.indexOf('function assignmentReview'));
  assert.doesNotMatch(counterUi, /downloadCsv|Export CSV|History tab|Approve stock count|Create correction|Save current count as default/i);
});

test('manager review shows required operational evidence and generic location actions', () => {
  for (const label of ['Counter authorization', 'Assign countable locations', 'Manager review', 'recorded', 'incomplete', 'deviations', 'extra products', 'Line notes', 'Submitted', 'Return message', 'Return for correction', 'Assign location']) assert.ok(workflows.includes(label), label);
  assert.match(workspace, /\['assignments', 'Counters', 'Assign a helper to one counting location\.'\]/);
});

test('direct writes are revoked and every exposed Phase 9G-B function has an explicit grant', () => {
  for (const table of ['inventory_counter_memberships', 'inventory_count_assignments']) {
    assert.match(migration + replacementMigration, new RegExp(`revoke all privileges on table public\\.${table} from public, anon, authenticated, service_role`));
  }
  const grants = (migration + replacementMigration).match(/grant execute on function public\.[^(]+\([^;]*?\)\s+to authenticated;/g) || [];
  assert.ok(grants.length >= 11);
  assert.match(migration, /revoke all on function public\.inventory_resolve_counter\(\) from public, anon, authenticated/);
});

test('focused PostgreSQL coverage includes auth matrix, stale writes, concurrency, tenants, and immutable history', () => {
  assert.equal((assertions.match(/'DB-9GB-\d+:/g) || []).length, 47);
  for (const phrase of ['another counter assignment', 'stale counter assignment revision', 'cross-organization', 'cannot write approved history', 'cannot self-accept']) assert.match(assertions, new RegExp(phrase, 'i'));
  assert.match(runner, /verifyConcurrentCounterSubmission/);
  assert.match(runner, /Concurrent counter submissions accept once/i);
});
