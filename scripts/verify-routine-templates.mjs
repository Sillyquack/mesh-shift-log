import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE = 'public.ecr.aws/supabase/postgres:17.6.1.141';
const DATABASE = 'phase10b_routine_templates_test';
const MIGRATION_ROLE = 'supabase_admin';
const CONTAINER = `mesh-shift-log-phase10b-${process.pid}-${randomUUID().slice(0, 8)}`;
const PASSWORD = `phase10b-${randomUUID()}`;
const FOUNDATION_PATH = resolve(ROOT, 'supabase/phase10a_routine_engine_foundation.sql');
const MIGRATION_PATH = resolve(ROOT, 'supabase/phase10b_routine_templates.sql');
const FOUNDATION_FIXTURE_PATH = resolve(ROOT, 'supabase/tests/phase10/foundation-fixtures.sql');
const FIXTURE_PATH = resolve(ROOT, 'supabase/tests/phase10/template-fixtures.sql');
const ASSERTION_PATH = resolve(ROOT, 'supabase/tests/phase10/template-assertions.sql');
const BASELINE_PATHS = [
  resolve(ROOT, 'supabase/schema.sql'),
  resolve(ROOT, 'supabase/phase7a_workbar_device_auth.sql'),
  resolve(ROOT, 'supabase/phase5f4_close_day_archives.sql'),
  resolve(ROOT, 'supabase/phase9a_inventory_stocktaking.sql'),
];
const EXPECTED_ASSERTION_PASSES = 94;
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
  return docker(args, { input: sql, timeout: 90000, allowFailure });
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
  if (!/^mesh-shift-log-phase10b-[a-zA-Z0-9-]+$/.test(CONTAINER)) {
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
      throw new Error(`Phase 10B migration references a protected object pattern: ${pattern}`);
    }
  }
  const forbiddenMarkers = [
    ['service', 'role'].join('_'),
    ['jzuegkbzgy', 'nknnvivhia'].join(''),
    ['supabase', 'co'].join('.'),
    ['koala', 'frog'].join(''),
  ];
  if (forbiddenMarkers.some((marker) => sql.toLowerCase().includes(marker))) {
    throw new Error('Phase 10B migration contains a privileged role, production marker, or forbidden project reference.');
  }
  if (/using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\)|organization_id\s+is\s+null/i.test(sql)) {
    throw new Error('Phase 10B migration contains a broad or nullable-organization RLS marker.');
  }
  console.log('PASS migration scope contains no protected domain, broad RLS, production, or privileged-role references');
}

const protectedFingerprintSql = String.raw`
  with protected_relations as (
    select relation.oid, namespace.nspname, relation.relname, relation.relacl, relation.relrowsecurity
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where relation.relkind in ('r', 'p', 'v')
      and (
        (namespace.nspname = 'public' and (
          relation.relname like 'inventory_%'
          or relation.relname like 'event_%'
          or relation.relname in (
            'shift_sessions', 'task_completions', 'handover_notes',
            'close_day_archives', 'manager_daily_reviews'
          )
        ))
        or namespace.nspname = 'auth'
      )
  ), protected_entries as (
    select 'relation|' || relation.nspname || '.' || relation.relname
      || '|acl=' || coalesce(relation.relacl::text, '')
      || '|rls=' || relation.relrowsecurity::text as entry
    from protected_relations relation
    union all
    select 'column|' || relation.nspname || '.' || relation.relname
      || '|' || attribute.attnum || '|' || attribute.attname || '|' || attribute.atttypid::regtype::text
      || '|notnull=' || attribute.attnotnull::text
      || '|default=' || coalesce(pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid), '')
    from protected_relations relation
    join pg_catalog.pg_attribute attribute on attribute.attrelid = relation.oid
    left join pg_catalog.pg_attrdef default_value
      on default_value.adrelid = attribute.attrelid and default_value.adnum = attribute.attnum
    where attribute.attnum > 0 and not attribute.attisdropped
    union all
    select 'constraint|' || constraint_definition.conrelid::regclass::text
      || '|' || constraint_definition.conname || '|' || pg_catalog.pg_get_constraintdef(constraint_definition.oid, true)
    from pg_catalog.pg_constraint constraint_definition
    where constraint_definition.conrelid in (select oid from protected_relations)
    union all
    select 'index|' || index_definition.indexrelid::regclass::text
      || '|' || pg_catalog.pg_get_indexdef(index_definition.indexrelid)
    from pg_catalog.pg_index index_definition
    where index_definition.indrelid in (select oid from protected_relations)
    union all
    select 'trigger|' || trigger_definition.tgrelid::regclass::text
      || '|' || pg_catalog.pg_get_triggerdef(trigger_definition.oid, true)
    from pg_catalog.pg_trigger trigger_definition
    where trigger_definition.tgrelid in (select oid from protected_relations) and not trigger_definition.tgisinternal
    union all
    select 'policy|' || policy.schemaname || '.' || policy.tablename
      || '|' || policy.policyname || '|' || policy.cmd || '|' || policy.roles::text
      || '|' || coalesce(policy.qual, '') || '|' || coalesce(policy.with_check, '')
    from pg_catalog.pg_policies policy
    where (policy.schemaname, policy.tablename) in (select nspname, relname from protected_relations)
    union all
    select 'function|' || namespace.nspname || '.' || function_definition.oid::regprocedure::text
      || '|acl=' || coalesce(function_definition.proacl::text, '')
      || '|' || pg_catalog.pg_get_functiondef(function_definition.oid)
    from pg_catalog.pg_proc function_definition
    join pg_catalog.pg_namespace namespace on namespace.oid = function_definition.pronamespace
    where namespace.nspname = 'auth'
       or (namespace.nspname = 'public' and (
         function_definition.proname like '%inventory%'
         or function_definition.proname like '%event_operation%'
       ))
  )
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(entry, E'\n' order by entry), ''))
  from protected_entries;
`;

const templateDataFingerprintSql = String.raw`
  select pg_catalog.md5(
    coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by row_value.id)::text from public.routine_templates row_value), '[]')
    || coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by row_value.id)::text from public.routine_template_versions row_value), '[]')
    || coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by row_value.id)::text from public.routine_template_sections row_value), '[]')
    || coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by row_value.id)::text from public.routine_template_tasks row_value), '[]')
    || coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by row_value.id)::text from public.routine_template_task_items row_value), '[]')
    || coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by row_value.id)::text from public.routine_template_task_dependencies row_value), '[]')
    || coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by row_value.id)::text from public.routine_template_task_relations row_value), '[]')
    || coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by row_value.id)::text from public.routine_template_publication_batches row_value), '[]')
  );
`;

async function verifyConcurrency() {
  const managerId = '11000000-0000-4000-8000-000000000001';
  const templateId = psql(String.raw`
    select id from public.routine_templates
    where organization_id = 'a1000000-0000-4000-8000-000000000001' and routine_key = 'opening';
  `, { tuplesOnly: true }).stdout.trim();
  const baseId = psql(String.raw`
    select current_published_version_id from public.routine_templates where id = '${templateId}';
  `, { tuplesOnly: true }).stdout.trim();
  if (!/^[0-9a-f-]{36}$/i.test(templateId) || !/^[0-9a-f-]{36}$/i.test(baseId)) {
    throw new Error('Could not resolve the published Opening template for concurrency checks.');
  }
  const draftAttempts = await Promise.all([
    concurrentPsql(authenticatedSql(managerId, String.raw`
      select public.create_routine_template_draft('${templateId}', '${baseId}', '39000000-0000-4000-8000-000000000001');
    `)),
    concurrentPsql(authenticatedSql(managerId, String.raw`
      select public.create_routine_template_draft('${templateId}', '${baseId}', '39000000-0000-4000-8000-000000000002');
    `)),
  ]);
  const draftSucceeded = draftAttempts.filter((result) => result.status === 0);
  const draftFailed = draftAttempts.filter((result) => result.status !== 0);
  if (draftSucceeded.length !== 1 || draftFailed.length !== 1
      || !/already has an active draft/i.test(draftFailed[0].stderr)) {
    throw new Error(`Concurrent draft creation did not converge on one active draft:\n${JSON.stringify(draftAttempts)}`);
  }
  const draftState = psql(String.raw`
    select version.id, version.revision
    from public.routine_template_versions version
    where version.template_id = '${templateId}' and version.state = 'draft';
  `, { tuplesOnly: true }).stdout.trim().split('|');
  if (!/^[0-9a-f-]{36}$/i.test(draftState[0]) || !/^\d+$/.test(draftState[1] || '')) {
    throw new Error(`Concurrent draft creation left unexpected state: ${draftState.join('|')}`);
  }
  console.log('PASS two real database connections create at most one active draft for a template');

  const expected = JSON.stringify({ [draftState[0]]: Number(draftState[1]) });
  const publishSql = authenticatedSql(managerId, String.raw`
    select public.publish_routine_template_versions(
      array['${draftState[0]}'::uuid], '${expected}'::jsonb,
      'Concurrent publication probe', '39000000-0000-4000-8000-000000000003'
    );
  `);
  const publishAttempts = await Promise.all([
    concurrentPsql(publishSql),
    concurrentPsql(publishSql),
  ]);
  if (publishAttempts.some((result) => result.status !== 0)
      || !publishAttempts.some((result) => /"idempotentReplay": true/.test(result.stdout))
      || !publishAttempts.some((result) => /"idempotentReplay": false/.test(result.stdout))) {
    throw new Error(`Concurrent idempotent publication did not return one original and one replay:\n${JSON.stringify(publishAttempts)}`);
  }
  const publicationState = psql(String.raw`
    select
      (select state from public.routine_template_versions where id = '${draftState[0]}'),
      (select count(*) from public.routine_template_publication_batches
       where idempotency_key = '39000000-0000-4000-8000-000000000003');
  `, { tuplesOnly: true }).stdout.trim();
  if (publicationState !== 'published|1') {
    throw new Error(`Concurrent publication left unexpected state: ${publicationState}`);
  }
  console.log('PASS two real database connections converge on one immutable idempotent publication batch');
}

function reportDatabaseState() {
  const report = psql(String.raw`
    select 'TABLE|' || relation.relname || '|rls=' || relation.relrowsecurity
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public' and relation.relkind = 'r'
      and relation.relname like 'routine_template%'
    union all
    select 'POLICY|' || tablename || '|' || policyname || '|command=' || cmd
    from pg_catalog.pg_policies where schemaname = 'public' and tablename like 'routine_template%'
    union all
    select 'FUNCTION|' || function_definition.oid::regprocedure::text
      || '|security_definer=' || function_definition.prosecdef
    from pg_catalog.pg_proc function_definition
    join pg_catalog.pg_namespace namespace on namespace.oid = function_definition.pronamespace
    where namespace.nspname = 'public' and (
      function_definition.proname like '%routine_template%'
      or function_definition.proname like '%routine_draft%'
    )
    order by 1;
  `, { tuplesOnly: true }).stdout.trim();
  console.log('\nFinal executable Phase 10B database state:');
  console.log(report);
}

async function main() {
  const requiredPaths = [
    FOUNDATION_PATH, MIGRATION_PATH, FOUNDATION_FIXTURE_PATH, FIXTURE_PATH,
    ASSERTION_PATH, ...BASELINE_PATHS,
  ];
  if (!requiredPaths.every(existsSync)) throw new Error('Required Phase 10B verification input is missing.');
  const migrationSql = readFileSync(MIGRATION_PATH, 'utf8');
  verifyMigrationScope(migrationSql);

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
    const initialized = /PostgreSQL init process complete; ready for start up/i.test(`${logs.stdout}\n${logs.stderr}`);
    const readiness = docker(
      ['exec', CONTAINER, 'pg_isready', '--username=postgres', `--dbname=${DATABASE}`],
      { allowFailure: true },
    );
    if (initialized && readiness.status === 0) { ready = true; break; }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  if (!ready) throw new Error('Disposable PostgreSQL did not become ready.');

  console.log(`PostgreSQL ${psql('show server_version;', { tuplesOnly: true }).stdout.trim()} in network-isolated disposable container ${CONTAINER}`);
  console.log(`Migration role: ${MIGRATION_ROLE} (disposable database owner)`);
  psql(String.raw`
    create schema if not exists storage;
    create table if not exists storage.buckets (
      id text primary key, name text not null, public boolean not null default false,
      file_size_limit bigint, allowed_mime_types text[]
    );
    create table if not exists storage.objects (
      id uuid primary key, bucket_id text not null, name text not null
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
  psql(readFileSync(FOUNDATION_PATH, 'utf8'), { singleTransaction: true });
  console.log('PASS Phase 10A foundation applied before Phase 10B');
  const protectedBefore = psql(protectedFingerprintSql, { tuplesOnly: true }).stdout.trim();
  psql(migrationSql, { singleTransaction: true });
  console.log('PASS Phase 10B migration applied to the disposable database');
  psql(migrationSql, { singleTransaction: true });
  console.log('PASS Phase 10B migration reapplied safely before fixture data');
  const protectedAfter = psql(protectedFingerprintSql, { tuplesOnly: true }).stdout.trim();
  if (!protectedBefore || protectedBefore !== protectedAfter) {
    throw new Error('Phase 10B changed an Inventory, legacy routine, Event Operations, or Auth schema object.');
  }
  console.log('PASS Inventory, legacy routine, Event Operations, and Auth schema fingerprints are unchanged by Phase 10B');

  psql(readFileSync(FOUNDATION_FIXTURE_PATH, 'utf8'), { singleTransaction: true });
  psql(readFileSync(FIXTURE_PATH, 'utf8'), { singleTransaction: true });
  console.log('PASS isolated Phase 10B organizations, users, foundation references, and draft fixtures installed');
  const assertions = psql(readFileSync(ASSERTION_PATH, 'utf8'));
  const passLines = `${assertions.stdout}\n${assertions.stderr}`
    .split('\n')
    .filter((line) => line.includes('PASS '))
    .map((line) => line.replace(/^.*PASS /, 'PASS '));
  if (passLines.length !== EXPECTED_ASSERTION_PASSES) {
    throw new Error(`Expected ${EXPECTED_ASSERTION_PASSES} SQL assertion passes, received ${passLines.length}.`);
  }
  passLines.forEach((line) => console.log(line));
  console.log(`Executable PostgreSQL Phase 10B assertions: ${passLines.length}/${passLines.length} passed.`);

  await verifyConcurrency();
  const templateDataBeforeReplay = psql(templateDataFingerprintSql, { tuplesOnly: true }).stdout.trim();
  const protectedBeforeReplay = psql(protectedFingerprintSql, { tuplesOnly: true }).stdout.trim();
  psql(migrationSql, { singleTransaction: true });
  const templateDataAfterReplay = psql(templateDataFingerprintSql, { tuplesOnly: true }).stdout.trim();
  const protectedAfterReplay = psql(protectedFingerprintSql, { tuplesOnly: true }).stdout.trim();
  if (!templateDataBeforeReplay || templateDataBeforeReplay !== templateDataAfterReplay) {
    throw new Error('Phase 10B repeat application modified template data or audit timestamps.');
  }
  if (!protectedBeforeReplay || protectedBeforeReplay !== protectedAfterReplay) {
    throw new Error('Phase 10B repeat application changed a protected schema object.');
  }
  console.log('PASS Phase 10B repeat application is a data-stable no-op');
  console.log('PASS Protected Inventory, legacy routine, Event Operations, and Auth schemas remain unchanged after executable tests');
  reportDatabaseState();
}

try {
  await main();
} finally {
  cleanup();
  console.log(`Disposable database cleanup: ${containerStarted ? 'FAILED' : 'complete'}`);
  if (containerStarted) process.exitCode = 1;
}
