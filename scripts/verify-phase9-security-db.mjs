import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import {
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
const EXPECTED_ASSERTION_PASSES = 70;
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
    console.log('PASS migration runner rejects reapplying an older Phase 9 file after Phase 9D');
    return;
  }
  throw new Error('Unsafe post-Phase 9D migration reapplication was not rejected.');
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
      and relation.relname in ('inventory_products','inventory_locations','inventory_location_products','inventory_count_sessions','inventory_count_lines')
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
    throw new Error('Phase 9D is not terminal.');
  }
  entries.forEach((entry) => resolveMigrationPath(entry.path));
  if (![FIXTURE_PATH, ASSERTION_PATH, PRE_PHASE9D_FIXTURE_PATH, INTEGRITY_ASSERTION_PATH].every(existsSync)) {
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
    if (entry.path === PHASE9_TERMINAL_MIGRATION) {
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
  await verifyConcurrentCreation();

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
  reportDatabaseState();
}

try {
  await main();
} finally {
  cleanup();
  console.log(`Disposable database cleanup: ${containerStarted ? 'FAILED' : 'complete'}`);
  if (containerStarted) process.exitCode = 1;
}
