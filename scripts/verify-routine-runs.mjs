import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import {
  inspectRoutineSnapshotIntegrity,
  normalizeRoutineRunRecord,
  normalizeRoutineRunWorkspace,
} from '../src/features/routines-v2/data/routineRunModel.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE = 'public.ecr.aws/supabase/postgres:17.6.1.141';
const DATABASE = 'phase10d_routine_runs_test';
const MIGRATION_ROLE = 'supabase_admin';
const CONTAINER = `mesh-shift-log-phase10d-${process.pid}-${randomUUID().slice(0, 8)}`;
const PASSWORD = `phase10d-${randomUUID()}`;
const FOUNDATION_PATH = resolve(ROOT, 'supabase/phase10a_routine_engine_foundation.sql');
const TEMPLATE_PATH = resolve(ROOT, 'supabase/phase10b_routine_templates.sql');
const REFERENCE_PATH = resolve(ROOT, 'supabase/phase10c_routine_reference_images.sql');
const MIGRATION_PATH = resolve(ROOT, 'supabase/phase10d_routine_runs_and_snapshots.sql');
const FOUNDATION_FIXTURE_PATH = resolve(ROOT, 'supabase/tests/phase10/foundation-fixtures.sql');
const FIXTURE_PATH = resolve(ROOT, 'supabase/tests/phase10/run-snapshot-fixtures.sql');
const ASSERTION_PATH = resolve(ROOT, 'supabase/tests/phase10/run-snapshot-assertions.sql');
const CLIENT_PATH = resolve(ROOT, 'src/features/routines-v2/api/routineRunClient.js');
const MODEL_PATH = resolve(ROOT, 'src/features/routines-v2/data/routineRunModel.js');
const BASELINE_PATHS = [
  resolve(ROOT, 'supabase/schema.sql'),
  resolve(ROOT, 'supabase/phase7a_workbar_device_auth.sql'),
  resolve(ROOT, 'supabase/phase5f4_close_day_archives.sql'),
  resolve(ROOT, 'supabase/phase8a_event_operations_core.sql'),
  resolve(ROOT, 'supabase/phase9a_inventory_stocktaking.sql'),
  resolve(ROOT, 'supabase/phase9b_stock_policies.sql'),
];
const EXPECTED_ASSERTION_PASSES = 142;
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
  return docker(args, { input: sql, timeout: 120000, allowFailure });
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
  if (!/^mesh-shift-log-phase10d-[a-zA-Z0-9-]+$/.test(CONTAINER)) {
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

function verifyStaticScope(migrationSql, clientSql) {
  const forbiddenMarkers = [
    ['service', 'role'].join('_'),
    ['jzuegkbzgy', 'nknnvivhia'].join(''),
    ['koala', 'frog'].join(''),
    ['supabase', 'co'].join('.'),
  ];
  const combined = `${migrationSql}\n${clientSql}`.toLowerCase();
  if (forbiddenMarkers.some((marker) => combined.includes(marker))) {
    throw new Error('Phase 10D contains a privileged role, production marker, secret, or forbidden project reference.');
  }
  if (migrationSql.includes('inventory-location-reference-images')) {
    throw new Error('Phase 10D must not reference the Inventory Storage bucket.');
  }
  const policyDefinitions = [...migrationSql.matchAll(/create\s+policy\b[\s\S]*?;/gi)]
    .map((match) => match[0])
    .join('\n');
  if (/using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\)|organization_id\s+is\s+null/i.test(policyDefinitions)) {
    throw new Error('Phase 10D contains a broad or nullable-organization RLS marker.');
  }
  if (/\b(insert\s+into|update|delete\s+from)\s+public\.(inventory_|asset_|event_)/i.test(migrationSql)) {
    throw new Error('Phase 10D attempts to write an external source domain.');
  }
  if (/references\s+public\.(inventory_|asset_|event_)/i.test(migrationSql)) {
    throw new Error('Phase 10D creates a foreign key into an external source domain.');
  }
  if (/\.from\([^)]*routine_run[^)]*\)\s*\.(insert|update|delete|upsert)/is.test(clientSql)
      || /service[_-]?role|\.admin\b|createSignedUploadUrl|upsert:\s*true/i.test(clientSql)) {
    throw new Error('The Phase 10D client contains direct run mutation or privileged access.');
  }
  if (/completeRoutineTask|finishRoutineRun|deriveOperationalDate|midnight|checkpoint/i.test(clientSql)) {
    throw new Error('The Phase 10D client contains deferred lifecycle or operational-date behavior.');
  }
  console.log('PASS static scope excludes privileged keys, production markers, broad RLS, external-domain writes/FKs, task completion, and client-authoritative paths');
}

const protectedFingerprintSql = String.raw`
  with protected_relations as (
    select relation.oid, namespace.nspname, relation.relname,
           relation.relacl, relation.relrowsecurity
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where relation.relkind in ('r', 'p', 'v')
      and (
        (namespace.nspname = 'public' and (
          relation.relname like 'inventory_%'
          or relation.relname like 'asset_%'
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
      || '|' || attribute.attnum || '|' || attribute.attname
      || '|' || attribute.atttypid::regtype::text
      || '|notnull=' || attribute.attnotnull::text
      || '|default=' || coalesce(pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid), '')
    from protected_relations relation
    join pg_catalog.pg_attribute attribute on attribute.attrelid = relation.oid
    left join pg_catalog.pg_attrdef default_value
      on default_value.adrelid = attribute.attrelid and default_value.adnum = attribute.attnum
    where attribute.attnum > 0 and not attribute.attisdropped
    union all
    select 'constraint|' || constraint_row.conrelid::regclass::text
      || '|' || constraint_row.conname || '|'
      || pg_catalog.pg_get_constraintdef(constraint_row.oid, true)
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid in (select oid from protected_relations)
    union all
    select 'index|' || index_row.indexrelid::regclass::text
      || '|' || pg_catalog.pg_get_indexdef(index_row.indexrelid)
    from pg_catalog.pg_index index_row
    where index_row.indrelid in (select oid from protected_relations)
    union all
    select 'trigger|' || trigger_row.tgrelid::regclass::text
      || '|' || pg_catalog.pg_get_triggerdef(trigger_row.oid, true)
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid in (select oid from protected_relations)
      and not trigger_row.tgisinternal
    union all
    select 'policy|' || policy.schemaname || '.' || policy.tablename
      || '|' || policy.policyname || '|' || policy.cmd || '|' || policy.roles::text
      || '|' || coalesce(policy.qual, '') || '|' || coalesce(policy.with_check, '')
    from pg_catalog.pg_policies policy
    where (policy.schemaname, policy.tablename) in
      (select nspname, relname from protected_relations)
    union all
    select 'function|' || namespace.nspname || '.' || function_row.oid::regprocedure::text
      || '|acl=' || coalesce(function_row.proacl::text, '')
      || '|' || pg_catalog.pg_get_functiondef(function_row.oid)
    from pg_catalog.pg_proc function_row
    join pg_catalog.pg_namespace namespace on namespace.oid = function_row.pronamespace
    where namespace.nspname = 'auth'
       or (namespace.nspname = 'public' and (
         function_row.proname like '%inventory%'
         or function_row.proname like '%asset%'
         or function_row.proname like '%event_operation%'
       ))
    union all
    select 'storage-bucket|' || pg_catalog.to_jsonb(bucket)::text
    from storage.buckets bucket where bucket.id like 'inventory-%'
    union all
    select 'storage-policy|' || policy.policyname || '|' || policy.cmd || '|'
      || coalesce(policy.qual, '') || '|' || coalesce(policy.with_check, '')
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'storage' and policy.tablename = 'objects'
      and policy.policyname like 'inventory_%'
  )
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(entry, E'\n' order by entry), ''))
  from protected_entries;
`;

const phase10dDataFingerprintSql = String.raw`
  select pg_catalog.md5(
    coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)::text from public.routine_runs row_value), '[]')
    || coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)::text from public.routine_run_sections row_value), '[]')
    || coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)::text from public.routine_run_tasks row_value), '[]')
    || coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)::text from public.routine_run_task_items row_value), '[]')
    || coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)::text from public.routine_run_snapshot_sources row_value), '[]')
    || coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)::text from public.routine_run_condition_evaluations row_value), '[]')
    || coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)::text from public.routine_run_task_dependencies row_value), '[]')
    || coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)::text from public.routine_run_task_relations row_value), '[]')
    || coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)::text from public.routine_run_task_reference_images row_value), '[]')
    || coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)::text from public.routine_run_participants row_value), '[]')
    || coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)::text from public.routine_run_role_assignments row_value), '[]')
    || coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)::text from public.routine_run_operations row_value), '[]')
  );
`;

function jsonPayload(stdout) {
  const line = stdout.split('\n').map((value) => value.trim()).findLast((value) => value.startsWith('{'));
  if (!line) throw new Error(`Expected a JSON response, received:\n${stdout}`);
  return JSON.parse(line);
}

async function verifyConcurrency() {
  const manager = '11000000-0000-4000-8000-000000000001';
  const staff = '11000000-0000-4000-8000-000000000002';
  const lead = '11000000-0000-4000-8000-000000000003';
  const create = (key) => authenticatedSql(manager, String.raw`
    select public.create_or_get_routine_run(
      'daily-run-test', 'concurrency', '2026-08-20', '${key}'
    );
  `);
  const creates = await Promise.all([
    concurrentPsql(create('db000000-0000-4000-8000-000000000001')),
    concurrentPsql(create('db000000-0000-4000-8000-000000000002')),
  ]);
  if (creates.some((result) => result.status !== 0)) {
    throw new Error(`Concurrent logical run creation failed:\n${JSON.stringify(creates)}`);
  }
  const createPayloads = creates.map((result) => jsonPayload(result.stdout));
  const runIds = new Set(createPayloads.map((payload) => payload.run.id));
  if (runIds.size !== 1) throw new Error('Concurrent create keys did not converge on one run ID.');
  const runId = [...runIds][0];
  const createState = psql(String.raw`
    select count(*), count(distinct id),
      (select count(*) from public.routine_run_operations
       where operation_type = 'create_run' and resource_id = '${runId}')
    from public.routine_runs where id = '${runId}';
  `, { tuplesOnly: true }).stdout.trim();
  if (createState !== '1|1|2') throw new Error(`Concurrent create left unexpected state: ${createState}`);
  console.log('PASS two real database connections with different idempotency keys converge on one authoritative run');

  const join = (key) => authenticatedSql(staff, String.raw`
    select public.join_routine_run('${runId}', '${key}');
  `);
  const joins = await Promise.all([
    concurrentPsql(join('db100000-0000-4000-8000-000000000001')),
    concurrentPsql(join('db100000-0000-4000-8000-000000000002')),
  ]);
  if (joins.some((result) => result.status !== 0)) {
    throw new Error(`Concurrent joins failed:\n${JSON.stringify(joins)}`);
  }
  const participantIds = new Set(joins.map((result) => jsonPayload(result.stdout).participant.id));
  const participantState = psql(String.raw`
    select count(*) from public.routine_run_participants
    where run_id = '${runId}' and user_profile_id = '${staff}';
  `, { tuplesOnly: true }).stdout.trim();
  if (participantIds.size !== 1 || participantState !== '1') {
    throw new Error('Concurrent joins created duplicate participants.');
  }
  console.log('PASS two real database connections join one run without duplicate participants');

  const leadJoin = jsonPayload(psql(authenticatedSql(lead, String.raw`
    select public.join_routine_run(
      '${runId}', 'db200000-0000-4000-8000-000000000001'
    );
  `), { tuplesOnly: true }).stdout);
  const managerParticipant = psql(String.raw`
    select id from public.routine_run_participants
    where run_id = '${runId}' and user_profile_id = '${manager}';
  `, { tuplesOnly: true }).stdout.trim();
  const role = (participantId, key) => authenticatedSql(manager, String.raw`
    select public.assign_routine_run_role(
      '${runId}', '${participantId}', 'closing_responsible', 'global', null,
      1, '${key}'
    );
  `);
  const roles = await Promise.all([
    concurrentPsql(role(managerParticipant, 'db300000-0000-4000-8000-000000000001')),
    concurrentPsql(role(leadJoin.participant.id, 'db300000-0000-4000-8000-000000000002')),
  ]);
  const succeeded = roles.filter((result) => result.status === 0);
  const stale = roles.filter((result) => result.status !== 0 && /stale/i.test(result.stderr));
  const activeRoles = psql(String.raw`
    select count(*) from public.routine_run_role_assignments
    where run_id = '${runId}' and role_key = 'closing_responsible'
      and scope_key = 'global' and status = 'active';
  `, { tuplesOnly: true }).stdout.trim();
  if (succeeded.length !== 1 || stale.length !== 1 || activeRoles !== '1') {
    throw new Error(`Concurrent role assignment did not produce one active assignment and one stale writer:\n${JSON.stringify(roles)}`);
  }
  console.log('PASS two real database connections leave one active role assignment and reject one stale writer');
}

function verifyClientModel() {
  const normalized = normalizeRoutineRunRecord({
    id: 'run', routine_key: 'opening', scope_key: 'default',
    operational_date: '2026-08-05', snapshot_state: 'ready',
    snapshot_hash: 'a'.repeat(64), revision: '2',
  });
  const workspace = normalizeRoutineRunWorkspace({
    run: { id: 'run', routine_key: 'opening' },
    tasks: [{ id: 'task', task_key_snapshot: 'task-key' }],
    taskItems: [{ id: 'item', item_key_snapshot: 'item-key' }],
    referenceImages: [{ image_state_snapshot: 'active_image', object_path_snapshot: 'server/path.jpg' }],
  });
  const integrity = inspectRoutineSnapshotIntegrity({
    valid: true, storedSnapshotHash: 'b'.repeat(64),
    recomputedSnapshotHash: 'b'.repeat(64), integrityErrors: [],
  });
  if (normalized.routineKey !== 'opening' || normalized.revision !== 2
      || workspace.tasks[0].taskKey !== 'task-key'
      || workspace.referenceImages[0].objectPath !== 'server/path.jpg'
      || !integrity.valid) {
    throw new Error('Routine run client-model normalization or integrity inspection failed.');
  }
  console.log('PASS offline run normalization and snapshot-integrity helpers are deterministic');
}

function reportDatabaseState() {
  const report = psql(String.raw`
    select 'TABLE|' || relation.relname || '|rls=' || relation.relrowsecurity
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public' and relation.relkind = 'r'
      and relation.relname like 'routine_run%'
    union all
    select 'FUNCTION|' || function_row.oid::regprocedure::text
      || '|security_definer=' || function_row.prosecdef
    from pg_catalog.pg_proc function_row
    join pg_catalog.pg_namespace namespace on namespace.oid = function_row.pronamespace
    where namespace.nspname = 'public'
      and function_row.proname in (
        'create_or_get_routine_run', 'join_routine_run',
        'assign_routine_run_role', 'verify_routine_run_snapshot',
        'get_routine_run_workspace', 'list_routine_runs_for_date'
      )
    order by 1;
  `, { tuplesOnly: true }).stdout.trim();
  console.log('\nFinal executable Phase 10D database state:');
  console.log(report);
}

async function main() {
  const requiredPaths = [
    FOUNDATION_PATH, TEMPLATE_PATH, REFERENCE_PATH, MIGRATION_PATH,
    FOUNDATION_FIXTURE_PATH, FIXTURE_PATH, ASSERTION_PATH,
    CLIENT_PATH, MODEL_PATH, ...BASELINE_PATHS,
  ];
  if (!requiredPaths.every(existsSync)) {
    throw new Error('Required Phase 10D verification input is missing.');
  }
  const migrationSql = readFileSync(MIGRATION_PATH, 'utf8');
  const clientSql = readFileSync(CLIENT_PATH, 'utf8');
  verifyStaticScope(migrationSql, clientSql);

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
  psql(String.raw`
    create schema if not exists storage;
    create table if not exists storage.buckets (
      id text primary key, name text not null, public boolean not null default false,
      file_size_limit bigint, allowed_mime_types text[]
    );
    create table if not exists storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text not null, name text not null, owner_id uuid,
      metadata jsonb not null default '{}'::jsonb,
      unique (bucket_id, name)
    );
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated, anon;
    grant select, insert, update, delete on table storage.objects to authenticated;
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
  psql(readFileSync(TEMPLATE_PATH, 'utf8'), { singleTransaction: true });
  psql(readFileSync(REFERENCE_PATH, 'utf8'), { singleTransaction: true });
  console.log('PASS Phase 10A, 10B, and 10C applied before Phase 10D');

  const protectedBefore = psql(protectedFingerprintSql, { tuplesOnly: true }).stdout.trim();
  psql(migrationSql, { singleTransaction: true });
  psql(migrationSql, { singleTransaction: true });
  console.log('PASS Phase 10D migration applied and reapplied safely before fixtures');
  const protectedAfter = psql(protectedFingerprintSql, { tuplesOnly: true }).stdout.trim();
  if (!protectedBefore || protectedBefore !== protectedAfter) {
    throw new Error('Phase 10D changed an Inventory, Asset, Event Operations, Auth, legacy, or Inventory Storage object.');
  }
  console.log('PASS protected Inventory, Asset, Event Operations, Auth, legacy, and Inventory Storage fingerprints are unchanged by Phase 10D');

  psql(readFileSync(FOUNDATION_FIXTURE_PATH, 'utf8'), { singleTransaction: true });
  psql(readFileSync(FIXTURE_PATH, 'utf8'), { singleTransaction: true });
  console.log('PASS isolated Phase 10D identities, published template, source domains, references, and image fixture installed');
  const assertions = psql(readFileSync(ASSERTION_PATH, 'utf8'));
  const passLines = `${assertions.stdout}\n${assertions.stderr}`
    .split('\n')
    .filter((line) => line.includes('PASS '))
    .map((line) => line.replace(/^.*PASS /, 'PASS '));
  if (passLines.length !== EXPECTED_ASSERTION_PASSES) {
    throw new Error(`Expected ${EXPECTED_ASSERTION_PASSES} SQL assertion passes, received ${passLines.length}.`);
  }
  passLines.forEach((line) => console.log(line));
  console.log(`Executable PostgreSQL Phase 10D assertions: ${passLines.length}/${passLines.length} passed.`);

  await verifyConcurrency();
  verifyClientModel();

  const dataBeforeReplay = psql(phase10dDataFingerprintSql, { tuplesOnly: true }).stdout.trim();
  const protectedBeforeReplay = psql(protectedFingerprintSql, { tuplesOnly: true }).stdout.trim();
  psql(readFileSync(TEMPLATE_PATH, 'utf8'), { singleTransaction: true });
  psql(readFileSync(REFERENCE_PATH, 'utf8'), { singleTransaction: true });
  psql(migrationSql, { singleTransaction: true });
  const dataAfterReplay = psql(phase10dDataFingerprintSql, { tuplesOnly: true }).stdout.trim();
  const protectedAfterReplay = psql(protectedFingerprintSql, { tuplesOnly: true }).stdout.trim();
  if (!dataBeforeReplay || dataBeforeReplay !== dataAfterReplay) {
    throw new Error('Phase 10B plus 10C plus 10D reapplication changed run data or timestamps.');
  }
  if (!protectedBeforeReplay || protectedBeforeReplay !== protectedAfterReplay) {
    throw new Error('Phase 10 reapplication changed a protected domain fingerprint.');
  }
  console.log('PASS Phase 10B plus 10C plus 10D repeat application is a data-stable no-op');
  console.log('PASS protected-domain fingerprints remain unchanged after executable tests and reapplication');

  const stableHashes = psql(String.raw`
    select bool_and(version.content_hash = public.routine_template_version_content_hash(version.id))
    from public.routine_template_versions version where version.state = 'published';
  `, { tuplesOnly: true }).stdout.trim();
  if (stableHashes !== 't') throw new Error('A published template hash changed during Phase 10D verification.');
  console.log('PASS all published template hashes remain stable');
  reportDatabaseState();
}

try {
  await main();
} finally {
  cleanup();
  console.log(`Disposable database cleanup: ${containerStarted ? 'incomplete' : 'complete'}`);
}
