import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import {
  PHASE9_PRODUCT_MAPPING_MIGRATION,
  PHASE9_SESSION_INTEGRITY_MIGRATION,
  PHASE9_TERMINAL_MIGRATION,
  validatedPhase9MigrationEntries,
  validatePhase9MigrationOrder,
} from './phase9MigrationOrder.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE = 'public.ecr.aws/supabase/postgres:17.6.1.141';
const DATABASE = 'phase9_security_test';
const MIGRATION_ROLE = 'supabase_admin';
const CONTAINER = `mesh-shift-log-phase9-security-${process.pid}-${randomUUID().slice(0, 8)}`;
const PASSWORD = `phase9-${randomUUID()}`;
const FIXTURE_PATH = resolve(ROOT, 'supabase/tests/phase9/security-fixtures.sql');
const ASSERTION_PATH = resolve(ROOT, 'supabase/tests/phase9/security-assertions.sql');
const PRE_PHASE9D_FIXTURE_PATH = resolve(ROOT, 'supabase/tests/phase9/pre-phase9d-compatibility.sql');
const INTEGRITY_ASSERTION_PATH = resolve(ROOT, 'supabase/tests/phase9/session-integrity-assertions.sql');
const IDENTITY_ASSERTION_PATH = resolve(ROOT, 'supabase/tests/phase9/product-identity-assertions.sql');
const STRUCTURED_ASSERTION_PATH = resolve(ROOT, 'supabase/tests/phase9/structured-quantity-assertions.sql');
const OPERATIONAL_ASSERTION_PATH = resolve(ROOT, 'supabase/tests/phase9/operational-scope-assertions.sql');
const MAPPING_ASSERTION_PATH = resolve(ROOT, 'supabase/tests/phase9/product-mapping-assertions.sql');
const COUNTER_FIXTURE_PATH = resolve(ROOT, 'supabase/tests/phase9/counter-fixtures.sql');
const COUNTER_ASSERTION_PATH = resolve(ROOT, 'supabase/tests/phase9/counter-workflow-assertions.sql');
const REPLACEMENT_FIXTURE_PATH = resolve(ROOT, 'supabase/tests/phase9/counter-replacement-fixtures.sql');
const REPLACEMENT_ASSERTION_PATH = resolve(ROOT, 'supabase/tests/phase9/counter-replacement-assertions.sql');
const MOBILE_ASSERTION_PATH = resolve(ROOT, 'supabase/tests/phase9/counter-mobile-assertions.sql');
const SESSION_LOCATION_SCOPE_ASSERTION_PATH = resolve(ROOT, 'supabase/tests/phase9/session-location-scope-assertions.sql');
const MILLUM_EXPORT_FIXTURE_PATH = resolve(ROOT, 'supabase/tests/phase9/millum-export-fixtures.sql');
const MILLUM_EXPORT_ASSERTION_PATH = resolve(ROOT, 'supabase/tests/phase9/millum-export-assertions.sql');
const EXPECTED_ASSERTION_PASSES = 70;
const EXPECTED_COUNTER_ASSERTION_PASSES = 47;
const EXPECTED_REPLACEMENT_ASSERTION_PASSES = 28;
const EXPECTED_MOBILE_ASSERTION_PASSES = 8;
const EXPECTED_MAPPING_ASSERTION_PASSES = 23;
const EXPECTED_SESSION_LOCATION_SCOPE_ASSERTION_PASSES = 10;
const EXPECTED_MILLUM_EXPORT_ASSERTION_PASSES = 48;
let containerStarted = false;

if (process.argv.length > 2) {
  throw new Error('This runner accepts no database URL, host, or connection arguments.');
}

function command(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: options.timeout || 30000,
    input: options.input,
    stdio: options.stdio || 'pipe',
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${commandName} ${args.join(' ')} failed${detail ? `:\n${detail}` : '.'}`);
  }
  return result;
}

function docker(args, options) {
  return command('docker', args, options);
}

function psql(sql, { singleTransaction = false, tuplesOnly = false, allowFailure = false } = {}) {
  const args = [
    'exec', '-i', CONTAINER,
    'psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1', `--username=${MIGRATION_ROLE}`, `--dbname=${DATABASE}`,
  ];
  if (singleTransaction) args.push('--single-transaction');
  if (tuplesOnly) args.push('--tuples-only', '--no-align');
  return docker(args, { input: sql, timeout: 60000, allowFailure });
}

function concurrentPsql(sql) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('docker', [
      'exec', '-i', CONTAINER,
      'psql', '--no-psqlrc', '--quiet', '--tuples-only', '--no-align', '--set=ON_ERROR_STOP=1',
      `--username=${MIGRATION_ROLE}`, `--dbname=${DATABASE}`,
    ], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', rejectPromise);
    child.on('close', (status) => resolvePromise({ status, stdout, stderr }));
    child.stdin.end(sql);
  });
}

function authenticatedSql(userId, statement) {
  return String.raw`
    do $block$ begin perform set_config('request.jwt.claim.sub', '${userId}', false); end $block$;
    set role authenticated;
    ${statement}
  `;
}

function lastUuid(output) {
  return output.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi)?.at(-1) || '';
}

async function verifyConcurrentCreation() {
  const managerId = '30000000-0000-4000-8000-000000000001';
  const locationId = 'c2000000-0000-4000-8000-000000000001';
  const sameKey = '94000000-0000-4000-8000-000000000001';
  const createStatement = (title, key) => authenticatedSql(managerId, String.raw`
    select public.create_inventory_count_session(
      '${title}', 'daily', '${key}', current_date, array['${locationId}']::uuid[], null
    ) #>> '{session,id}';
  `);
  const sameResults = await Promise.all([
    concurrentPsql(createStatement('Concurrent idempotent count', sameKey)),
    concurrentPsql(createStatement('Concurrent idempotent count', sameKey)),
  ]);
  const sameIds = sameResults.map((result) => lastUuid(result.stdout));
  if (sameResults.some((result) => result.status !== 0) || !sameIds[0] || sameIds[0] !== sameIds[1]) {
    throw new Error(`Concurrent same-key creation did not converge:\n${JSON.stringify(sameResults)}`);
  }
  const activeAfterReplay = psql(String.raw`
    select count(*) from public.inventory_count_sessions
    where organization_id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'
      and status in ('draft','in_progress','completed');
  `, { tuplesOnly: true }).stdout.trim();
  if (activeAfterReplay !== '1') throw new Error('Concurrent same-key creation produced more than one active session.');
  console.log('PASS concurrent same-key session creation returns one shared session');

  psql(authenticatedSql(managerId, String.raw`
    select public.cancel_inventory_count_session('${sameIds[0]}', 'Release concurrency fixture');
  `));
  const differentResults = await Promise.all([
    concurrentPsql(createStatement('Concurrent different-key count A', '94000000-0000-4000-8000-000000000002')),
    concurrentPsql(createStatement('Concurrent different-key count B', '94000000-0000-4000-8000-000000000003')),
  ]);
  const succeeded = differentResults.filter((result) => result.status === 0);
  const failed = differentResults.filter((result) => result.status !== 0);
  if (succeeded.length !== 1 || failed.length !== 1 || !/already has an active Stock Count/i.test(failed[0].stderr)) {
    throw new Error(`Concurrent different-key creation did not reject exactly one request:\n${JSON.stringify(differentResults)}`);
  }
  const activeAfterRace = psql(String.raw`
    select count(*) from public.inventory_count_sessions
    where organization_id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'
      and status in ('draft','in_progress','completed');
  `, { tuplesOnly: true }).stdout.trim();
  if (activeAfterRace !== '1') throw new Error('Concurrent different-key creation did not leave exactly one active session.');
  console.log('PASS concurrent different-key session creation accepts exactly one active session');
}

async function verifyConcurrentCounterSubmission() {
  const counterId = '7b600000-0000-4000-8000-000000000002';
  const assignmentState = psql(String.raw`
    select assignment.id, assignment.revision
    from public.inventory_count_assignments assignment
    join public.inventory_counter_memberships membership on membership.id = assignment.counter_membership_id
    where membership.counter_auth_user_id = '${counterId}';
  `, { tuplesOnly: true }).stdout.trim().split('|');
  const [assignmentId, initialRevision] = assignmentState;
  if (!assignmentId || initialRevision !== '1') throw new Error('Counter concurrency fixture assignment was not initialized at revision 1.');

  const missingConfirmation = psql(authenticatedSql(counterId, String.raw`
    select public.inventory_counter_apply_refrigerator_default('${assignmentId}', false, ${initialRevision});
  `), { allowFailure: true });
  if (missingConfirmation.status === 0 || !/physically checked/i.test(`${missingConfirmation.stdout}\n${missingConfirmation.stderr}`)) {
    throw new Error('Counter default application did not require physical confirmation.');
  }
  console.log('PASS counter refrigerator default rejects missing physical confirmation');

  psql(authenticatedSql(counterId, String.raw`
    select public.inventory_counter_apply_refrigerator_default('${assignmentId}', true, ${initialRevision});
  `));
  const submittedVersion = psql(String.raw`
    select assignment.revision, session.updated_at
    from public.inventory_count_assignments assignment
    join public.inventory_count_sessions session on session.id = assignment.session_id
    where assignment.id = '${assignmentId}';
  `, { tuplesOnly: true }).stdout.trim().split('|');
  const [revision, sessionUpdatedAt] = submittedVersion;
  if (revision !== '2' || !sessionUpdatedAt) throw new Error('Counter default application did not advance the assignment revision.');
  const submitStatement = authenticatedSql(counterId, String.raw`
    select public.submit_inventory_count_assignment(
      '${assignmentId}', ${revision}, '${sessionUpdatedAt}'::timestamptz
    );
  `);
  const results = await Promise.all([
    concurrentPsql(submitStatement),
    concurrentPsql(submitStatement),
  ]);
  const succeeded = results.filter((result) => result.status === 0);
  const failed = results.filter((result) => result.status !== 0);
  if (succeeded.length !== 1 || failed.length !== 1
      || !/changed on another device|read-only while it is submitted/i.test(failed[0].stderr)) {
    throw new Error(`Concurrent counter submission did not accept exactly one request:\n${JSON.stringify(results)}`);
  }
  const finalState = psql(String.raw`
    select state || '|' || revision
    from public.inventory_count_assignments where id = '${assignmentId}';
  `, { tuplesOnly: true }).stdout.trim();
  if (finalState !== 'submitted|3') throw new Error(`Concurrent counter submission left unexpected state: ${finalState}`);
  console.log('PASS concurrent counter submissions accept once and reject the stale request');
}

async function verifyConcurrentCounterReplacement() {
  const managerId = 'b2600000-0000-4000-8000-000000000001';
  const assignmentState = psql(String.raw`
    select assignment.id, assignment.revision
    from public.inventory_count_assignments assignment
    where assignment.location_id = 'b2200000-0000-4000-8000-000000000006'
      and assignment.state <> 'superseded';
  `, { tuplesOnly: true }).stdout.trim().split('|');
  const [assignmentId, revision] = assignmentState;
  if (!assignmentId || revision !== '1') throw new Error('Counter replacement concurrency fixture was not initialized at revision 1.');
  const membershipIds = psql(String.raw`
    select membership.id
    from public.inventory_counter_memberships membership
    where membership.counter_auth_user_id in (
      'b2600000-0000-4000-8000-00000000000b',
      'b2600000-0000-4000-8000-00000000000c'
    )
    order by membership.counter_auth_user_id;
  `, { tuplesOnly: true }).stdout.trim().split('\n').filter(Boolean);
  if (membershipIds.length !== 2) throw new Error('Counter replacement concurrency memberships were not initialized.');
  const replaceStatement = (membershipId, reason) => authenticatedSql(managerId, String.raw`
    select public.replace_inventory_count_assignment(
      '${assignmentId}', '${membershipId}', '${reason}', 'preserve', false, ${revision}
    );
  `);
  const results = await Promise.all([
    concurrentPsql(replaceStatement(membershipIds[0], 'Concurrent replacement one')),
    concurrentPsql(replaceStatement(membershipIds[1], 'Concurrent replacement two')),
  ]);
  const succeeded = results.filter((result) => result.status === 0);
  const failed = results.filter((result) => result.status !== 0);
  if (succeeded.length !== 1 || failed.length !== 1
      || !/changed on another device|already been superseded/i.test(failed[0].stderr)) {
    throw new Error(`Concurrent counter replacement did not accept exactly one request:\n${JSON.stringify(results)}`);
  }
  const finalState = psql(String.raw`
    select
      count(*) filter (where state = 'superseded'),
      count(*) filter (where state <> 'superseded'),
      max(revision) filter (where state = 'superseded')
    from public.inventory_count_assignments
    where location_id = 'b2200000-0000-4000-8000-000000000006';
  `, { tuplesOnly: true }).stdout.trim();
  if (finalState !== '1|1|2') throw new Error(`Concurrent counter replacement left unexpected state: ${finalState}`);
  console.log('PASS concurrent counter replacements accept once and reject the stale request');
}

function cleanup() {
  if (!containerStarted) return;
  docker(['rm', '--force', CONTAINER], { allowFailure: true, timeout: 30000 });
  const remaining = docker(['container', 'inspect', CONTAINER], { allowFailure: true });
  containerStarted = remaining.status === 0;
}

process.once('SIGINT', () => {
  cleanup();
  process.exit(130);
});
process.once('SIGTERM', () => {
  cleanup();
  process.exit(143);
});

function resolveMigrationPath(relativePath) {
  const fullPath = resolve(ROOT, relativePath);
  if (!fullPath.startsWith(`${ROOT}/`) || !existsSync(fullPath)) {
    throw new Error(`Migration path is missing or outside the repository: ${relativePath}`);
  }
  return fullPath;
}

function verifyUnsafeOrderIsRejected(canonicalPaths) {
  try {
    validatePhase9MigrationOrder([
      ...canonicalPaths,
      'supabase/phase9a_inventory_stocktaking.sql',
    ]);
  } catch {
    console.log('PASS migration runner rejects reapplying an older Phase 9 file after terminal Phase 9I');
    return;
  }
  throw new Error('Unsafe post-Phase 9G migration reapplication was not rejected.');
}

function reportDatabaseState() {
  const reportSql = String.raw`
    select 'TABLE|' || relation.relname || '|owner=' || pg_catalog.pg_get_userbyid(relation.relowner)
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
    order by relation.relname;

    select 'RLS|' || relation.relname || '|enabled=' || relation.relrowsecurity || '|forced=' || relation.relforcerowsecurity
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in ('inventory_products','inventory_locations','inventory_location_products','inventory_count_sessions','inventory_count_lines','inventory_counter_memberships','inventory_count_assignments')
    order by relation.relname;

    select 'FUNCTION|' || function.oid::regprocedure::text || '|owner=' || pg_catalog.pg_get_userbyid(function.proowner) || '|security_definer=' || function.prosecdef
    from pg_catalog.pg_proc function
    join pg_catalog.pg_namespace namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public'
    order by function.proname, function.oid::regprocedure::text;

    select 'POLICY|' || tablename || '|' || policyname || '|command=' || cmd || '|roles=' || array_to_string(roles, ',')
    from pg_catalog.pg_policies
    where schemaname = 'public'
    order by tablename, policyname;

    select 'TABLE_GRANT|' || grantee || '|' || table_name || '|' || privilege_type
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee in ('anon','authenticated')
      and (table_name like 'inventory_%' or table_name = 'user_profiles')
    order by grantee, table_name, privilege_type;

    select 'COLUMN_GRANT|' || grantee || '|' || table_name || '|' || privilege_type || '|' || string_agg(column_name, ',' order by ordinal_position)
    from information_schema.column_privileges privilege
    join information_schema.columns column_definition
      using (table_schema, table_name, column_name)
    where privilege.table_schema = 'public'
      and privilege.grantee in ('anon','authenticated')
      and (privilege.table_name like 'inventory_%' or privilege.table_name = 'user_profiles')
    group by grantee, table_name, privilege_type
    order by grantee, table_name, privilege_type;

    select 'FUNCTION_GRANT|' || coalesce(role.rolname, 'PUBLIC') || '|' || function.oid::regprocedure::text || '|' || privilege.privilege_type
    from pg_catalog.pg_proc function
    join pg_catalog.pg_namespace namespace on namespace.oid = function.pronamespace
    cross join lateral pg_catalog.aclexplode(coalesce(function.proacl, pg_catalog.acldefault('f', function.proowner))) privilege
    left join pg_catalog.pg_roles role on role.oid = privilege.grantee
    where namespace.nspname = 'public'
      and function.proname like '%inventory%'
      and coalesce(role.rolname, 'PUBLIC') in ('PUBLIC','anon','authenticated')
    order by coalesce(role.rolname, 'PUBLIC'), function.oid::regprocedure::text;
  `;
  const report = psql(reportSql, { tuplesOnly: true }).stdout.trim();
  console.log('\nFinal executable database state:');
  console.log(report);
}

async function main() {
  const entries = validatedPhase9MigrationEntries();
  const paths = entries.map((entry) => entry.path);
  verifyUnsafeOrderIsRejected(paths);
  if (paths.at(-1) !== PHASE9_TERMINAL_MIGRATION) {
    throw new Error('Phase 9I is not terminal.');
  }
  entries.forEach((entry) => resolveMigrationPath(entry.path));
  if (![FIXTURE_PATH, ASSERTION_PATH, PRE_PHASE9D_FIXTURE_PATH, INTEGRITY_ASSERTION_PATH, IDENTITY_ASSERTION_PATH, STRUCTURED_ASSERTION_PATH, OPERATIONAL_ASSERTION_PATH, MAPPING_ASSERTION_PATH, COUNTER_FIXTURE_PATH, COUNTER_ASSERTION_PATH, REPLACEMENT_FIXTURE_PATH, REPLACEMENT_ASSERTION_PATH, MOBILE_ASSERTION_PATH, SESSION_LOCATION_SCOPE_ASSERTION_PATH, MILLUM_EXPORT_FIXTURE_PATH, MILLUM_EXPORT_ASSERTION_PATH].every(existsSync)) {
    throw new Error('Phase 9 executable security SQL is missing.');
  }

  command('docker', ['--version']);
  docker(['image', 'inspect', IMAGE]);
  docker([
    'run', '--detach', '--rm', '--pull', 'never',
    '--name', CONTAINER, '--network', 'none',
    '--env', `POSTGRES_PASSWORD=${PASSWORD}`,
    '--env', `POSTGRES_DB=${DATABASE}`,
    IMAGE,
  ]);
  containerStarted = true;

  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const logs = docker(['logs', CONTAINER], { allowFailure: true });
    const initializationComplete = /PostgreSQL init process complete; ready for start up/i.test(
      `${logs.stdout}\n${logs.stderr}`,
    );
    const readiness = docker(
      ['exec', CONTAINER, 'pg_isready', '--username=postgres', `--dbname=${DATABASE}`],
      { allowFailure: true },
    );
    if (initializationComplete && readiness.status === 0) {
      ready = true;
      break;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  if (!ready) throw new Error('Disposable PostgreSQL did not become ready.');

  const version = psql('show server_version;', { tuplesOnly: true }).stdout.trim();
  console.log(`PostgreSQL ${version} in network-isolated disposable container ${CONTAINER}`);
  console.log(`Migration role: ${MIGRATION_ROLE} (disposable database owner)`);
  console.log('Canonical migration order:');
  for (const [index, entry] of entries.entries()) {
    const sql = readFileSync(resolveMigrationPath(entry.path), 'utf8');
    if (entry.path === PHASE9_SESSION_INTEGRITY_MIGRATION) {
      psql(readFileSync(PRE_PHASE9D_FIXTURE_PATH, 'utf8'), { singleTransaction: true });
      console.log('PASS pre-Phase 9D approved compatibility fixture installed');
      const duplicatePreflight = psql(String.raw`
        begin;
        insert into public.organizations (id, name, slug) values
          ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', 'Phase 9D Conflict Probe', 'phase9d-conflict-probe');
        insert into public.inventory_count_sessions (organization_id, title, count_type, status, started_by_name) values
          ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', 'Conflict one', 'daily', 'in_progress', 'Probe'),
          ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', 'Conflict two', 'daily', 'draft', 'Probe');
        ${sql}
      `, { allowFailure: true });
      if (duplicatePreflight.status === 0 || !/cannot enforce one active Stock Count/i.test(`${duplicatePreflight.stdout}\n${duplicatePreflight.stderr}`)) {
        throw new Error('Phase 9D duplicate-active preflight did not fail with the expected diagnostic.');
      }
      console.log('PASS Phase 9D rejects legacy duplicate-active data without modifying it');
    }
    psql(sql, { singleTransaction: true });
    console.log(`PASS ${index + 1}. ${entry.path}`);
  }

  for (const entry of entries.filter((candidate) => candidate.repeatable)) {
    const sql = readFileSync(resolveMigrationPath(entry.path), 'utf8');
    psql(sql, { singleTransaction: true });
    console.log(`PASS repeatable migration reapplied safely: ${entry.path}`);
  }

  psql(readFileSync(FIXTURE_PATH, 'utf8'), { singleTransaction: true });
  console.log('PASS disposable organizations, Auth users, profiles, and inventory fixtures');
  psql(readFileSync(COUNTER_FIXTURE_PATH, 'utf8'), { singleTransaction: true });
  console.log('PASS isolated Phase 9G-B counter memberships and assignment fixtures');
  psql(readFileSync(REPLACEMENT_FIXTURE_PATH, 'utf8'), { singleTransaction: true });
  console.log('PASS isolated Phase 9G-B2 replacement and final-history fixtures');
  const mobileAssertions = psql(readFileSync(MOBILE_ASSERTION_PATH, 'utf8'), { singleTransaction: true });
  const mobilePassLines = `${mobileAssertions.stdout}\n${mobileAssertions.stderr}`
    .split('\n')
    .filter((line) => line.includes('PASS '))
    .map((line) => line.replace(/^.*PASS /, 'PASS '));
  if (mobilePassLines.length !== EXPECTED_MOBILE_ASSERTION_PASSES) {
    throw new Error(`Expected ${EXPECTED_MOBILE_ASSERTION_PASSES} executable mobile-counter assertion passes, received ${mobilePassLines.length}.`);
  }
  mobilePassLines.forEach((line) => console.log(line));
  console.log(`Executable PostgreSQL mobile-counter assertions: ${mobilePassLines.length}/${mobilePassLines.length} passed.`);
  const sessionLocationScopeAssertions = psql(readFileSync(SESSION_LOCATION_SCOPE_ASSERTION_PATH, 'utf8'));
  const sessionLocationScopePassLines = `${sessionLocationScopeAssertions.stdout}\n${sessionLocationScopeAssertions.stderr}`
    .split('\n')
    .filter((line) => line.includes('PASS '))
    .map((line) => line.replace(/^.*PASS /, 'PASS '));
  if (sessionLocationScopePassLines.length !== EXPECTED_SESSION_LOCATION_SCOPE_ASSERTION_PASSES) {
    throw new Error(`Expected ${EXPECTED_SESSION_LOCATION_SCOPE_ASSERTION_PASSES} executable session-location assertion passes, received ${sessionLocationScopePassLines.length}.`);
  }
  sessionLocationScopePassLines.forEach((line) => console.log(line));
  console.log(`Executable PostgreSQL session-location assertions: ${sessionLocationScopePassLines.length}/${sessionLocationScopePassLines.length} passed.`);
  await verifyConcurrentCreation();
  await verifyConcurrentCounterSubmission();
  await verifyConcurrentCounterReplacement();

  const assertions = psql(readFileSync(ASSERTION_PATH, 'utf8'));
  const passLines = `${assertions.stdout}\n${assertions.stderr}`
    .split('\n')
    .filter((line) => line.includes('PASS '))
    .map((line) => line.replace(/^.*PASS /, 'PASS '));
  if (passLines.length !== EXPECTED_ASSERTION_PASSES) {
    throw new Error(
      `Expected ${EXPECTED_ASSERTION_PASSES} executable assertion passes, received ${passLines.length}.`,
    );
  }
  passLines.forEach((line) => console.log(line));
  console.log(`Executable PostgreSQL security assertions: ${passLines.length}/${passLines.length} passed.`);

  psql(readFileSync(MILLUM_EXPORT_FIXTURE_PATH, 'utf8'), { singleTransaction: true });
  console.log('PASS disposable approved Millum export profile and session fixtures');
  const millumExportAssertions = psql(readFileSync(MILLUM_EXPORT_ASSERTION_PATH, 'utf8'));
  const millumExportPassLines = `${millumExportAssertions.stdout}\n${millumExportAssertions.stderr}`
    .split('\n')
    .filter((line) => line.includes('PASS '))
    .map((line) => line.replace(/^.*PASS /, 'PASS '));
  if (millumExportPassLines.length !== EXPECTED_MILLUM_EXPORT_ASSERTION_PASSES) {
    throw new Error(`Expected ${EXPECTED_MILLUM_EXPORT_ASSERTION_PASSES} executable Millum-export assertion passes, received ${millumExportPassLines.length}.`);
  }
  millumExportPassLines.forEach((line) => console.log(line));
  console.log(`Executable PostgreSQL Millum-export assertions: ${millumExportPassLines.length}/${millumExportPassLines.length} passed.`);

  const productMappingSql = readFileSync(resolveMigrationPath(PHASE9_PRODUCT_MAPPING_MIGRATION), 'utf8');
  const historySnapshotSql = String.raw`
    select md5(
      coalesce((select jsonb_agg(to_jsonb(session) order by session.id)::text
                from public.inventory_count_sessions session), '[]')
      || coalesce((select jsonb_agg(to_jsonb(line) order by line.id)::text
                   from public.inventory_count_lines line), '[]')
    );
  `;
  const mappedSnapshotSql = String.raw`
    select md5(
      coalesce((select jsonb_agg(to_jsonb(product) order by product.id)::text
                from public.inventory_products product
                where product.organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
                  and product.millum_item_ref = any(array[
                    '707000631','4966818','5932918','6181002','6631634','6388581','5804190',
                    '6503346','814467','5104666','5010707','5010715','6752422','5744222'
                  ])), '[]')
      || coalesce((select jsonb_agg(to_jsonb(standard) order by standard.id)::text
                   from public.inventory_location_products standard
                   join public.inventory_locations location on location.id = standard.location_id
                   where standard.organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
                     and location.location_type = 'fridge'), '[]')
      || coalesce((select jsonb_agg(to_jsonb(mapping) order by mapping.id)::text
                   from public.inventory_catalogue_unresolved_mappings mapping
                   where mapping.organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), '[]')
      || coalesce((select jsonb_agg(to_jsonb(template) order by template.id)::text
                   from public.inventory_refrigerator_templates template
                   where template.organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), '[]')
    );
  `;
  const historyBeforeMappings = psql(historySnapshotSql, { tuplesOnly: true }).stdout.trim();
  psql(productMappingSql, { singleTransaction: true });
  console.log(`PASS Phase 9G-D mappings applied after operational setup: ${PHASE9_PRODUCT_MAPPING_MIGRATION}`);
  const mappedStateBeforeReplay = psql(mappedSnapshotSql, { tuplesOnly: true }).stdout.trim();
  psql(productMappingSql, { singleTransaction: true });
  const mappedStateAfterReplay = psql(mappedSnapshotSql, { tuplesOnly: true }).stdout.trim();
  const historyAfterMappings = psql(historySnapshotSql, { tuplesOnly: true }).stdout.trim();
  if (!mappedStateBeforeReplay || mappedStateBeforeReplay !== mappedStateAfterReplay) {
    throw new Error('Phase 9G-D mapped data or audit timestamps changed on repeat application.');
  }
  if (!historyBeforeMappings || historyBeforeMappings !== historyAfterMappings) {
    throw new Error('Phase 9G-D modified Stock Count session or line history.');
  }
  console.log('PASS Phase 9G-D mapped-state replay is a byte-stable no-op');
  console.log('PASS Phase 9G-D preserves Stock Count session and line history byte-for-byte');

  const mappingAssertions = psql(readFileSync(MAPPING_ASSERTION_PATH, 'utf8'));
  const mappingPassLines = `${mappingAssertions.stdout}\n${mappingAssertions.stderr}`
    .split('\n')
    .filter((line) => line.includes('PASS '))
    .map((line) => line.replace(/^.*PASS /, 'PASS '));
  if (mappingPassLines.length !== EXPECTED_MAPPING_ASSERTION_PASSES) {
    throw new Error(`Expected ${EXPECTED_MAPPING_ASSERTION_PASSES} executable product-mapping assertion passes, received ${mappingPassLines.length}.`);
  }
  mappingPassLines.forEach((line) => console.log(line));
  console.log(`Executable PostgreSQL product-mapping assertions: ${mappingPassLines.length}/${mappingPassLines.length} passed.`);

  const identityAssertions = psql(readFileSync(IDENTITY_ASSERTION_PATH, 'utf8'));
  const identityPassLines = `${identityAssertions.stdout}\n${identityAssertions.stderr}`
    .split('\n')
    .filter((line) => line.includes('PASS '))
    .map((line) => line.replace(/^.*PASS /, 'PASS '));
  if (identityPassLines.length !== 8) {
    throw new Error(`Expected 8 executable product-identity assertion passes, received ${identityPassLines.length}.`);
  }
  identityPassLines.forEach((line) => console.log(line));
  console.log(`Executable PostgreSQL product-identity assertions: ${identityPassLines.length}/${identityPassLines.length} passed.`);

  const integrityAssertions = psql(readFileSync(INTEGRITY_ASSERTION_PATH, 'utf8'));
  const integrityPassLines = `${integrityAssertions.stdout}\n${integrityAssertions.stderr}`
    .split('\n')
    .filter((line) => line.includes('PASS '))
    .map((line) => line.replace(/^.*PASS /, 'PASS '));
  if (integrityPassLines.length !== 36) {
    throw new Error(`Expected 36 executable integrity assertion passes, received ${integrityPassLines.length}.`);
  }
  integrityPassLines.forEach((line) => console.log(line));
  console.log(`Executable PostgreSQL session-integrity assertions: ${integrityPassLines.length}/${integrityPassLines.length} passed.`);

  const structuredAssertions = psql(readFileSync(STRUCTURED_ASSERTION_PATH, 'utf8'));
  const structuredPassLines = `${structuredAssertions.stdout}\n${structuredAssertions.stderr}`
    .split('\n')
    .filter((line) => line.includes('PASS '))
    .map((line) => line.replace(/^.*PASS /, 'PASS '));
  if (structuredPassLines.length !== 23) {
    throw new Error(`Expected 23 executable structured-quantity assertion passes, received ${structuredPassLines.length}.`);
  }
  structuredPassLines.forEach((line) => console.log(line));
  console.log(`Executable PostgreSQL structured-quantity assertions: ${structuredPassLines.length}/${structuredPassLines.length} passed.`);

  const operationalAssertions = psql(readFileSync(OPERATIONAL_ASSERTION_PATH, 'utf8'));
  const operationalPassLines = `${operationalAssertions.stdout}\n${operationalAssertions.stderr}`
    .split('\n')
    .filter((line) => line.includes('PASS '))
    .map((line) => line.replace(/^.*PASS /, 'PASS '));
  if (operationalPassLines.length !== 25) {
    throw new Error(`Expected 25 executable operational-scope assertion passes, received ${operationalPassLines.length}.`);
  }
  operationalPassLines.forEach((line) => console.log(line));
  console.log(`Executable PostgreSQL operational-scope assertions: ${operationalPassLines.length}/${operationalPassLines.length} passed.`);

  const counterAssertions = psql(readFileSync(COUNTER_ASSERTION_PATH, 'utf8'));
  const counterPassLines = `${counterAssertions.stdout}\n${counterAssertions.stderr}`
    .split('\n')
    .filter((line) => line.includes('PASS '))
    .map((line) => line.replace(/^.*PASS /, 'PASS '));
  if (counterPassLines.length !== EXPECTED_COUNTER_ASSERTION_PASSES) {
    throw new Error(`Expected ${EXPECTED_COUNTER_ASSERTION_PASSES} executable counter-workflow assertion passes, received ${counterPassLines.length}.`);
  }
  counterPassLines.forEach((line) => console.log(line));
  console.log(`Executable PostgreSQL counter-workflow assertions: ${counterPassLines.length}/${counterPassLines.length} passed.`);

  const replacementAssertions = psql(readFileSync(REPLACEMENT_ASSERTION_PATH, 'utf8'));
  const replacementPassLines = `${replacementAssertions.stdout}\n${replacementAssertions.stderr}`
    .split('\n')
    .filter((line) => line.includes('PASS '))
    .map((line) => line.replace(/^.*PASS /, 'PASS '));
  if (replacementPassLines.length !== EXPECTED_REPLACEMENT_ASSERTION_PASSES) {
    throw new Error(`Expected ${EXPECTED_REPLACEMENT_ASSERTION_PASSES} executable counter-replacement assertion passes, received ${replacementPassLines.length}.`);
  }
  replacementPassLines.forEach((line) => console.log(line));
  console.log(`Executable PostgreSQL counter-replacement assertions: ${replacementPassLines.length}/${replacementPassLines.length} passed.`);
  reportDatabaseState();
}

try {
  await main();
} finally {
  cleanup();
  console.log(`Disposable database cleanup: ${containerStarted ? 'FAILED' : 'complete'}`);
  if (containerStarted) process.exitCode = 1;
}
