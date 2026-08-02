import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  PHASE9_TERMINAL_SECURITY_MIGRATION,
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

function psql(sql, { singleTransaction = false, tuplesOnly = false } = {}) {
  const args = [
    'exec', '-i', CONTAINER,
    'psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1', `--username=${MIGRATION_ROLE}`, `--dbname=${DATABASE}`,
  ];
  if (singleTransaction) args.push('--single-transaction');
  if (tuplesOnly) args.push('--tuples-only', '--no-align');
  return docker(args, { input: sql, timeout: 60000 });
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
    console.log('PASS migration runner rejects reapplying an older Phase 9 file after Phase 9C');
    return;
  }
  throw new Error('Unsafe post-Phase 9C migration reapplication was not rejected.');
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
  if (paths.at(-1) !== PHASE9_TERMINAL_SECURITY_MIGRATION) {
    throw new Error('Phase 9C is not terminal.');
  }
  entries.forEach((entry) => resolveMigrationPath(entry.path));
  if (!existsSync(FIXTURE_PATH) || !existsSync(ASSERTION_PATH)) {
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
  reportDatabaseState();
}

try {
  await main();
} finally {
  cleanup();
  console.log(`Disposable database cleanup: ${containerStarted ? 'FAILED' : 'complete'}`);
  if (containerStarted) process.exitCode = 1;
}
