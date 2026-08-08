import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE = 'public.ecr.aws/supabase/postgres:17.6.1.141';
const DATABASE = 'phase10a1_routine_foundation_test';
const MIGRATION_ROLE = 'supabase_admin';
const CONTAINER = `mesh-shift-log-phase10a-${process.pid}-${randomUUID().slice(0, 8)}`;
const PASSWORD = `phase10a-${randomUUID()}`;
const MIGRATION_PATH = resolve(ROOT, 'supabase/phase10a_routine_engine_foundation.sql');
const BOOTSTRAP_PATH = resolve(ROOT, 'supabase/phase10a1_routine_organization_settings_bootstrap.sql');
const FIXTURE_PATH = resolve(ROOT, 'supabase/tests/phase10/foundation-fixtures.sql');
const ASSERTION_PATH = resolve(ROOT, 'supabase/tests/phase10/foundation-assertions.sql');
const BASELINE_PATHS = [
  resolve(ROOT, 'supabase/schema.sql'),
  resolve(ROOT, 'supabase/phase7a_workbar_device_auth.sql'),
  resolve(ROOT, 'supabase/phase5f4_close_day_archives.sql'),
  resolve(ROOT, 'supabase/phase9a_inventory_stocktaking.sql'),
];
const EXPECTED_ASSERTION_PASSES = 73;
let containerStarted = false;

if (process.argv.length > 2) {
  throw new Error('This runner accepts no database URL, host, project ref, or connection arguments.');
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
    'psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1',
    `--username=${MIGRATION_ROLE}`, `--dbname=${DATABASE}`,
  ];
  if (singleTransaction) args.push('--single-transaction');
  if (tuplesOnly) args.push('--tuples-only', '--no-align');
  return docker(args, { input: sql, timeout: 60000, allowFailure });
}

function concurrentPsql(sql) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('docker', [
      'exec', '-i', CONTAINER,
      'psql', '--no-psqlrc', '--quiet', '--tuples-only', '--no-align',
      '--set=ON_ERROR_STOP=1', `--username=${MIGRATION_ROLE}`, `--dbname=${DATABASE}`,
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
    select set_config('request.jwt.claim.sub', '${userId}', false);
    set role authenticated;
    ${statement}
  `;
}

function cleanup() {
  if (!containerStarted) return;
  if (!/^mesh-shift-log-phase10a-[a-zA-Z0-9-]+$/.test(CONTAINER)) {
    throw new Error(`Refusing to remove unexpected container name: ${CONTAINER}`);
  }
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

function verifyMigrationScope(sql) {
  const objectScopeSql = sql.replaceAll("'inventory_readonly'", "'allowed_readonly_source'");
  const forbiddenObjectPatterns = [
    /\binventory_/i,
    /\bshift_sessions\b/i,
    /\btask_completions\b/i,
    /\bhandover_notes\b/i,
    /\bclose_day_archives\b/i,
    /\bmanager_daily_reviews\b/i,
    /\bevent_operations\b/i,
  ];
  for (const pattern of forbiddenObjectPatterns) {
    if (pattern.test(objectScopeSql)) {
      throw new Error(`Phase 10A migration references a protected object pattern: ${pattern}`);
    }
  }
  if (/service_role|jzuegkbzgynknnvivhia|supabase\.co/i.test(sql)) {
    throw new Error('Phase 10A migration contains a production credential, project ref, or endpoint marker.');
  }
  console.log('PASS migration scope contains no Inventory, legacy routine, Event Operations, or production endpoint references');
}

function verifyBootstrapScope(sql) {
  const forbidden = /create_or_update_routine_organization_settings|auth\.uid\s*\(|\bgrant\b|\bcreate\s+(?:or\s+replace\s+)?function\b|service_role|jzuegkbzgynknnvivhia|supabase\.co/i;
  if (forbidden.test(sql)) {
    throw new Error('Phase 10A1 bootstrap contains a manager/auth/grant/function or production marker.');
  }
  if (!/from public\.organizations organization[\s\S]*order by organization\.id[\s\S]*on conflict \(organization_id\) do nothing;/i.test(sql)
      || !/created_by_auth_user_id,[\s\S]*updated_by_auth_user_id[\s\S]*null,[\s\n]*null/i.test(sql)) {
    throw new Error('Phase 10A1 bootstrap is missing deterministic organization ordering, no-op conflict handling, or null system audit actors.');
  }
  console.log('PASS Phase 10A1 is a deterministic system bootstrap with no manager impersonation, client grant, or public RPC');
}

const protectedFingerprintSql = String.raw`
  with protected_tables as (
    select relation.oid, namespace.nspname, relation.relname, relation.relacl, relation.relrowsecurity
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and (
        relation.relname like 'inventory_%'
        or relation.relname in (
          'shift_sessions', 'task_completions', 'handover_notes',
          'close_day_archives', 'manager_daily_reviews'
        )
      )
  ), protected_entries as (
    select 'table|' || table_definition.nspname || '.' || table_definition.relname
      || '|acl=' || coalesce(table_definition.relacl::text, '')
      || '|rls=' || table_definition.relrowsecurity::text as entry
    from protected_tables table_definition
    union all
    select 'column|' || table_definition.nspname || '.' || table_definition.relname
      || '|' || attribute.attnum || '|' || attribute.attname || '|' || attribute.atttypid::regtype::text
      || '|notnull=' || attribute.attnotnull::text
      || '|default=' || coalesce(pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid), '')
    from protected_tables table_definition
    join pg_catalog.pg_attribute attribute on attribute.attrelid = table_definition.oid
    left join pg_catalog.pg_attrdef default_value
      on default_value.adrelid = attribute.attrelid and default_value.adnum = attribute.attnum
    where attribute.attnum > 0 and not attribute.attisdropped
    union all
    select 'constraint|' || constraint_definition.conrelid::regclass::text
      || '|' || constraint_definition.conname
      || '|' || pg_catalog.pg_get_constraintdef(constraint_definition.oid, true)
    from pg_catalog.pg_constraint constraint_definition
    where constraint_definition.conrelid in (select oid from protected_tables)
    union all
    select 'index|' || index_definition.indexrelid::regclass::text
      || '|' || pg_catalog.pg_get_indexdef(index_definition.indexrelid)
    from pg_catalog.pg_index index_definition
    where index_definition.indrelid in (select oid from protected_tables)
    union all
    select 'trigger|' || trigger_definition.tgrelid::regclass::text
      || '|' || pg_catalog.pg_get_triggerdef(trigger_definition.oid, true)
    from pg_catalog.pg_trigger trigger_definition
    where trigger_definition.tgrelid in (select oid from protected_tables)
      and not trigger_definition.tgisinternal
    union all
    select 'policy|' || policy.schemaname || '.' || policy.tablename
      || '|' || policy.policyname || '|' || policy.cmd || '|' || policy.roles::text
      || '|' || coalesce(policy.qual, '') || '|' || coalesce(policy.with_check, '')
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename in (select relname from protected_tables)
    union all
    select 'function|' || function_definition.oid::regprocedure::text
      || '|acl=' || coalesce(function_definition.proacl::text, '')
      || '|' || pg_catalog.pg_get_functiondef(function_definition.oid)
    from pg_catalog.pg_proc function_definition
    join pg_catalog.pg_namespace namespace on namespace.oid = function_definition.pronamespace
    where namespace.nspname = 'public'
      and function_definition.proname like '%inventory%'
  )
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(entry, E'\n' order by entry), ''))
  from protected_entries;
`;

const routineDataFingerprintSql = String.raw`
  select pg_catalog.md5(
    coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by row_value.organization_id)::text
              from public.routine_organization_settings row_value), '[]')
    || coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by row_value.id)::text
                 from public.routine_locations row_value), '[]')
    || coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by row_value.id)::text
                 from public.routine_location_sets row_value), '[]')
    || coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by row_value.id)::text
                 from public.routine_location_set_members row_value), '[]')
    || coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by row_value.id)::text
                 from public.routine_standards row_value), '[]')
    || coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by row_value.id)::text
                 from public.routine_standard_revisions row_value), '[]')
  );
`;

async function verifyConcurrentStandardRevisionWrites() {
  const managerId = '11000000-0000-4000-8000-000000000001';
  psql(authenticatedSql(managerId, String.raw`
    select public.create_routine_standard(
      'concurrency-standard', 'Concurrency Standard', null,
      'integer', null, 'manual', true
    );
  `));
  const standardId = psql(String.raw`
    select id
    from public.routine_standards
    where organization_id = 'a1000000-0000-4000-8000-000000000001'
      and standard_key = 'concurrency-standard';
  `, { tuplesOnly: true }).stdout.trim();
  if (!/^[0-9a-f-]{36}$/i.test(standardId)) {
    throw new Error(`Could not resolve concurrency standard ID: ${standardId}`);
  }

  const write = (value, key) => authenticatedSql(managerId, String.raw`
    select public.create_routine_standard_revision(
      '${standardId}', '${JSON.stringify({ value })}'::jsonb, null,
      'Concurrent revision probe', '${key}', 1
    );
  `);
  const results = await Promise.all([
    concurrentPsql(write(10, 'cc000000-0000-4000-8000-000000000001')),
    concurrentPsql(write(20, 'cc000000-0000-4000-8000-000000000002')),
  ]);
  const succeeded = results.filter((result) => result.status === 0);
  const failed = results.filter((result) => result.status !== 0);
  if (succeeded.length !== 1 || failed.length !== 1
      || !/Stale routine standard revision/i.test(failed[0].stderr)) {
    throw new Error(`Concurrent revision writes did not accept once and reject one stale writer:\n${JSON.stringify(results)}`);
  }
  const finalState = psql(String.raw`
    select
      count(*), count(distinct revision_number), min(revision_number), max(revision_number),
      (select revision from public.routine_standards where id = '${standardId}'),
      (select current_revision_id is not null from public.routine_standards where id = '${standardId}')
    from public.routine_standard_revisions
    where standard_id = '${standardId}';
  `, { tuplesOnly: true }).stdout.trim();
  if (finalState !== '1|1|1|1|2|t') {
    throw new Error(`Concurrent revision writes left unexpected state: ${finalState}`);
  }
  console.log('PASS two real database connections serialize standard revisions: one write succeeds and one stale writer is rejected');
}

function reportDatabaseState() {
  const report = psql(String.raw`
    select 'TABLE|' || relation.relname || '|rls=' || relation.relrowsecurity
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind = 'r'
      and relation.relname in (
        'routine_organization_settings', 'routine_locations',
        'routine_location_sets', 'routine_location_set_members',
        'routine_standards', 'routine_standard_revisions'
      )
    union all
    select 'POLICY|' || tablename || '|' || policyname || '|command=' || cmd
    from pg_catalog.pg_policies
    where schemaname = 'public' and tablename like 'routine_%'
    union all
    select 'FUNCTION|' || function_definition.oid::regprocedure::text
      || '|security_definer=' || function_definition.prosecdef
    from pg_catalog.pg_proc function_definition
    join pg_catalog.pg_namespace namespace on namespace.oid = function_definition.pronamespace
    where namespace.nspname = 'public'
      and (
        function_definition.proname like 'routine_%'
        or function_definition.proname in (
          'create_or_update_routine_organization_settings',
          'upsert_routine_location', 'set_routine_location_active',
          'upsert_routine_location_set', 'replace_routine_location_set_members',
          'create_routine_standard', 'create_routine_standard_revision'
        )
      )
    order by 1;
  `, { tuplesOnly: true }).stdout.trim();
  console.log('\nFinal executable Phase 10A + 10A1 database state:');
  console.log(report);
}

async function main() {
  const requiredPaths = [MIGRATION_PATH, BOOTSTRAP_PATH, FIXTURE_PATH, ASSERTION_PATH, ...BASELINE_PATHS];
  if (!requiredPaths.every(existsSync)) throw new Error('Required Phase 10A verification input is missing.');
  const migrationSql = readFileSync(MIGRATION_PATH, 'utf8');
  const bootstrapSql = readFileSync(BOOTSTRAP_PATH, 'utf8');
  verifyMigrationScope(migrationSql);
  verifyBootstrapScope(bootstrapSql);

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
    const initialized = /PostgreSQL init process complete; ready for start up/i.test(
      `${logs.stdout}\n${logs.stderr}`,
    );
    const readiness = docker(
      ['exec', CONTAINER, 'pg_isready', '--username=postgres', `--dbname=${DATABASE}`],
      { allowFailure: true },
    );
    if (initialized && readiness.status === 0) {
      ready = true;
      break;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  if (!ready) throw new Error('Disposable PostgreSQL did not become ready.');

  const version = psql('show server_version;', { tuplesOnly: true }).stdout.trim();
  console.log(`PostgreSQL ${version} in network-isolated disposable container ${CONTAINER}`);
  console.log(`Migration role: ${MIGRATION_ROLE} (disposable database owner)`);

  psql(String.raw`
    create schema if not exists storage;
    create table if not exists storage.buckets (
      id text primary key,
      name text not null,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    create table if not exists storage.objects (
      id uuid primary key,
      bucket_id text not null,
      name text not null
    );
    alter table storage.objects enable row level security;
  `);

  for (const baselinePath of BASELINE_PATHS) {
    psql(readFileSync(baselinePath, 'utf8'), { singleTransaction: true });
    console.log(`PASS disposable baseline applied: ${baselinePath.slice(ROOT.length + 1)}`);
  }
  psql(String.raw`
    alter table public.user_profiles drop constraint if exists user_profiles_role_check;
    alter table public.user_profiles add constraint user_profiles_role_check
      check (role in ('manager', 'shift_lead', 'event_floor_manager', 'staff', 'time2staff', 'counter'));
  `);
  console.log('PASS disposable profile role shape includes the existing Stock Count counter role');

  const protectedBefore = psql(protectedFingerprintSql, { tuplesOnly: true }).stdout.trim();
  psql(migrationSql, { singleTransaction: true });
  console.log('PASS Phase 10A migration applied to the disposable database');
  if (psql('select count(*) from public.routine_organization_settings;', { tuplesOnly: true }).stdout.trim() !== '0') {
    throw new Error('Phase 10A unexpectedly created a routine organization settings row.');
  }
  console.log('PASS Phase 10A creates the settings table without a settings row');
  psql(migrationSql, { singleTransaction: true });
  console.log('PASS Phase 10A migration reapplied safely before fixture data');
  const protectedAfter = psql(protectedFingerprintSql, { tuplesOnly: true }).stdout.trim();
  if (!protectedBefore || protectedBefore !== protectedAfter) {
    throw new Error('Phase 10A changed an Inventory or legacy routine schema object.');
  }
  console.log('PASS Inventory and legacy routine schema fingerprints are unchanged by Phase 10A');

  psql(readFileSync(FIXTURE_PATH, 'utf8'), { singleTransaction: true });
  console.log('PASS isolated Phase 10A organizations, Auth users, and profile fixtures installed');
  psql(String.raw`
    insert into public.routine_organization_settings (
      organization_id,mode,timezone,operational_day_cutoff,shared_device_enabled,
      reopen_window_hours,revision,created_at,updated_at,
      created_by_auth_user_id,updated_by_auth_user_id
    ) values (
      'b2000000-0000-4000-8000-000000000001','shadow','Europe/Oslo','03:30'::time,true,
      72,9,'2026-01-02 03:04:05+00','2026-01-03 04:05:06+00',
      '22000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001'
    );
  `, { singleTransaction: true });
  const preservedBeforeBootstrap = psql(String.raw`
    select to_jsonb(settings)::text from public.routine_organization_settings settings
    where organization_id='b2000000-0000-4000-8000-000000000001';
  `, { tuplesOnly: true }).stdout.trim();
  psql(bootstrapSql, { singleTransaction: true });
  console.log('PASS Phase 10A1 system bootstrap applied after Phase 10A');
  const preservedAfterBootstrap = psql(String.raw`
    select to_jsonb(settings)::text from public.routine_organization_settings settings
    where organization_id='b2000000-0000-4000-8000-000000000001';
  `, { tuplesOnly: true }).stdout.trim();
  if (!preservedBeforeBootstrap || preservedAfterBootstrap !== preservedBeforeBootstrap) {
    throw new Error('Phase 10A1 changed the pre-existing non-default settings row.');
  }
  console.log('PASS Phase 10A1 preserves the complete existing settings row');
  const bootstrapState = psql(routineDataFingerprintSql, { tuplesOnly: true }).stdout.trim();
  psql(bootstrapSql, { singleTransaction: true });
  const bootstrapReapplyState = psql(routineDataFingerprintSql, { tuplesOnly: true }).stdout.trim();
  if (!bootstrapState || bootstrapState !== bootstrapReapplyState) {
    throw new Error('Phase 10A1 reapply changed settings data, revisions, or timestamps.');
  }
  console.log('PASS Phase 10A1 immediate reapply is data-, revision-, and timestamp-stable');
  const assertions = psql(readFileSync(ASSERTION_PATH, 'utf8'));
  const passLines = `${assertions.stdout}\n${assertions.stderr}`
    .split('\n')
    .filter((line) => line.includes('PASS '))
    .map((line) => line.replace(/^.*PASS /, 'PASS '));
  if (passLines.length !== EXPECTED_ASSERTION_PASSES) {
    throw new Error(`Expected ${EXPECTED_ASSERTION_PASSES} SQL assertion passes, received ${passLines.length}.`);
  }
  passLines.forEach((line) => console.log(line));
  console.log(`Executable PostgreSQL Phase 10A + 10A1 assertions: ${passLines.length}/${passLines.length} passed.`);

  await verifyConcurrentStandardRevisionWrites();

  const routineDataBeforeReplay = psql(routineDataFingerprintSql, { tuplesOnly: true }).stdout.trim();
  const protectedBeforeReplay = psql(protectedFingerprintSql, { tuplesOnly: true }).stdout.trim();
  psql(migrationSql, { singleTransaction: true });
  psql(bootstrapSql, { singleTransaction: true });
  const routineDataAfterReplay = psql(routineDataFingerprintSql, { tuplesOnly: true }).stdout.trim();
  const protectedAfterReplay = psql(protectedFingerprintSql, { tuplesOnly: true }).stdout.trim();
  if (!routineDataBeforeReplay || routineDataBeforeReplay !== routineDataAfterReplay) {
    throw new Error('Phase 10A + 10A1 repeat application modified routine data or audit timestamps.');
  }
  if (!protectedBeforeReplay || protectedBeforeReplay !== protectedAfterReplay) {
    throw new Error('Phase 10A repeat application changed an Inventory or legacy routine schema object.');
  }
  console.log('PASS Phase 10A + 10A1 repeat application is a data-stable no-op');
  console.log('PASS Inventory and legacy routine schema remain unchanged after executable tests');
  reportDatabaseState();
}

try {
  await main();
} finally {
  cleanup();
  console.log(`Disposable database cleanup: ${containerStarted ? 'FAILED' : 'complete'}`);
  if (containerStarted) process.exitCode = 1;
}
