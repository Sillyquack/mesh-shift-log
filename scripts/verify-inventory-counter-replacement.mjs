import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PHASE9_TERMINAL_MIGRATION, validatedPhase9MigrationEntries } from './phase9MigrationOrder.mjs';

const migration = readFileSync(new URL('../supabase/phase9gb2_inventory_counter_replacement.sql', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/lib/inventoryClient.js', import.meta.url), 'utf8');
const workflows = readFileSync(new URL('../src/components/InventoryCounterWorkflows.jsx', import.meta.url), 'utf8');
const runner = readFileSync(new URL('./verify-phase9-security-db.mjs', import.meta.url), 'utf8');
const assertions = readFileSync(new URL('../supabase/tests/phase9/counter-replacement-assertions.sql', import.meta.url), 'utf8');

test('Phase 9G-B2 through Phase 9G-D remain before repeatable Phase 9H through terminal Phase 9K', () => {
  const entries = validatedPhase9MigrationEntries();
  assert.equal(PHASE9_TERMINAL_MIGRATION, 'supabase/20260804200000_phase9o_millum_wine_value_conversion.sql');
  assert.equal(entries.at(-2).path, 'supabase/20260804180000_phase9n_millum_single_authoritative_session.sql');
  assert.equal(entries.at(-3).path, 'supabase/20260804151500_phase9m_millum_snapshot_supplement.sql');
  assert.equal(entries.at(-4).path, 'supabase/20260804123921_phase9l_millum_august_carry_forward_and_future_scope.sql');
  assert.equal(entries.at(-5).path, 'supabase/phase9k_millum_complete_count_export.sql');
  assert.equal(entries.at(-6).path, 'supabase/phase9j_inventory_shelf_storage_guidance.sql');
  assert.equal(entries.at(-7).path, 'supabase/phase9i_millum_stock_count_exports.sql');
  assert.equal(entries.at(-8).path, 'supabase/phase9h_inventory_session_location_scope.sql');
  assert.equal(entries.at(-9).path, 'supabase/phase9gd_inventory_product_mappings.sql');
  assert.equal(entries.at(-10).path, 'supabase/phase9gc_inventory_counter_mobile.sql');
  assert.equal(entries.at(-11).path, 'supabase/phase9gb2_inventory_counter_replacement.sql');
  assert.deepEqual(entries.filter((entry) => entry.repeatable).map((entry) => entry.path), [entries.at(-8).path, entries.at(-7).path, entries.at(-6).path, entries.at(-5).path]);
});

test('supersession retains old and new assignment links plus manager and line audit', () => {
  for (const token of ['replaces_assignment_id', 'superseded_by_assignment_id', 'superseded_at', 'superseded_by_auth_user_id', 'superseded_by_name', 'supersession_reason', 'replacement_data_action', 'superseded_line_snapshot']) assert.ok(migration.includes(token), token);
  assert.match(migration, /state in \('assigned', 'submitted', 'returned', 'accepted', 'superseded'\)/);
  assert.match(migration, /foreign key \(superseded_by_assignment_id\)[\s\S]*?deferrable initially deferred/i);
});

test('one current assignment is enforced with a partial unique index', () => {
  assert.match(migration, /drop constraint if exists inventory_count_assignments_session_location_unique/i);
  assert.match(migration, /create unique index if not exists inventory_count_assignments_one_current_location_idx[\s\S]*?where state <> 'superseded'/i);
  assert.match(migration, /inventory_count_assignments_replaces_unique_idx/);
  assert.match(migration, /inventory_count_assignments_superseded_by_unique_idx/);
});

test('only assigned or returned work may become superseded', () => {
  assert.match(migration, /old\.state in \('assigned', 'returned'\) and new\.state = 'superseded'/i);
  assert.match(migration, /v_assignment\.state = 'accepted'[\s\S]*?cannot be reassigned/i);
  assert.match(migration, /v_assignment\.state = 'submitted'[\s\S]*?Return the submitted refrigerator/i);
  assert.doesNotMatch(migration, /old\.state = 'accepted'.*new\.state/s);
});

test('replacement RPC is manager-resolved with fixed search path and explicit privileges', () => {
  const rpc = migration.slice(migration.indexOf('create or replace function public.replace_inventory_count_assignment'), migration.indexOf('drop policy if exists inventory_count_assignments_read'));
  assert.match(rpc, /security definer\nset search_path = pg_catalog/);
  assert.match(rpc, /inventory_resolve_actor\(null\)/);
  assert.match(migration, /revoke all on function public\.replace_inventory_count_assignment\(uuid, uuid, text, text, boolean, bigint\)[\s\S]*?from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.replace_inventory_count_assignment\(uuid, uuid, text, text, boolean, bigint\)[\s\S]*?to authenticated/);
});

test('replacement locks session, assignment, membership, and ordered lines', () => {
  const rpc = migration.slice(migration.indexOf('create or replace function public.replace_inventory_count_assignment'), migration.indexOf('drop policy if exists inventory_count_assignments_read'));
  const sessionLock = rpc.indexOf('select session.* into v_session');
  const assignmentLock = rpc.indexOf('select assignment.* into v_assignment');
  const membershipLock = rpc.indexOf('select membership.* into v_replacement_membership');
  const lineLock = rpc.indexOf('perform line.id');
  assert.ok(sessionLock > 0 && sessionLock < assignmentLock && assignmentLock < membershipLock && membershipLock < lineLock);
  assert.match(rpc, /order by line\.id\s+for update/i);
  assert.match(rpc, /revision is distinct from input_expected_assignment_revision/i);
});

test('replacement profile and membership are active, authorized, non-shared, and same-organization', () => {
  assert.match(migration, /membership\.organization_id = v_actor\.organization_id/);
  assert.match(migration, /not v_replacement_membership\.active/);
  assert.match(migration, /v_replacement_profile\.role <> 'counter'/);
  assert.match(migration, /not v_replacement_profile\.active/);
  assert.match(migration, /coalesce\(v_replacement_profile\.is_shared_device, false\)/);
});

test('preserve mode leaves count lines unchanged and snapshots entered provenance', () => {
  assert.match(migration, /replacement_data_action in \('preserve', 'clear_unsubmitted'\)/);
  assert.match(migration, /'counted_by_auth_user_id', line\.counted_by_auth_user_id/);
  assert.match(migration, /'counted_by_name', line\.counted_by_name/);
  const clearBlock = migration.slice(migration.indexOf("if v_data_action = 'clear_unsubmitted' then", migration.indexOf('create or replace function public.replace_inventory_count_assignment')));
  assert.match(clearBlock, /update public\.inventory_count_lines/);
});

test('clear mode is second-confirmed, never-submitted, and refrigerator-scoped', () => {
  assert.match(migration, /v_assignment\.state <> 'assigned' or v_assignment\.submitted_at is not null/);
  assert.match(migration, /input_confirm_clear is not true/);
  assert.match(migration, /line\.session_id = v_assignment\.session_id/);
  assert.match(migration, /line\.location_id = v_assignment\.location_id/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.inventory_count_lines/i);
});

test('former counters lose superseded RLS and workspace visibility immediately', () => {
  assert.match(migration, /state <> 'superseded'[\s\S]*?current_user_can_count_inventory/i);
  const workspace = migration.slice(migration.indexOf('create or replace function public.get_inventory_counter_workspace'), migration.indexOf('create or replace function public.set_inventory_counter_membership'));
  assert.match(workspace, /assignment\.state <> 'superseded'/);
});

test('completion and revocation ignore historical superseded rows but retain current safeguards', () => {
  assert.match(migration, /assignment\.state not in \('accepted', 'superseded'\)/g);
  assert.match(migration, /Every current assigned refrigerator must be accepted/);
});

test('client carries replacement audit fields and calls only the guarded RPC', () => {
  for (const field of ['replaces_assignment_id', 'superseded_by_assignment_id', 'supersession_reason', 'replacement_data_action', 'superseded_recorded_line_count']) assert.ok(client.includes(field), field);
  assert.match(client, /export function replaceInventoryCountAssignment/);
  assert.match(client, /callRpc\('replace_inventory_count_assignment'/);
});

test('manager UI shows replacement choice, reason, data treatment, and immediate-access warning', () => {
  for (const label of ['Bytt teller', 'Replacement counter', 'Required replacement reason', 'Preserve quantities, notes, and original line audit', 'Clear never-submitted working data', 'Immediate access change', 'Replace counter', 'Superseded assignments']) assert.ok(workflows.includes(label), label);
  const counterUi = workflows.slice(workflows.indexOf('export function CounterInventoryWorkspace'), workflows.indexOf('function assignmentReview'));
  assert.doesNotMatch(counterUi, /Bytt teller|Replace counter|replacement reason/i);
});

test('focused PostgreSQL assertions cover replacement authorization and immutable history', () => {
  assert.equal((assertions.match(/'DB-9GB2-\d+:/g) || []).length, 28);
  for (const phrase of ['inactive replacement profile', 'cross-organization', 'stale assignment revisions', 'former counter immediately loses', 'submitted working data cannot be cleared', 'accepted assignment history', 'completed and approved']) assert.match(assertions, new RegExp(phrase, 'i'));
});

test('disposable runner executes a two-manager-request replacement race', () => {
  assert.match(runner, /verifyConcurrentCounterReplacement/);
  assert.match(runner, /Concurrent counter replacements accept once/i);
  assert.match(runner, /succeeded\.length !== 1 \|\| failed\.length !== 1/);
});
