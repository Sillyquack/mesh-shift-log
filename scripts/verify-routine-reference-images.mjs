import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import {
  normalizeRoutineReferenceAltText,
  normalizeRoutineReferenceCaption,
  normalizeRoutineReferenceFilename,
  ROUTINE_REFERENCE_MAX_BYTES,
  validateRoutineReferenceFileContent,
} from '../src/features/routines-v2/data/routineReferenceImages.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE = 'public.ecr.aws/supabase/postgres:17.6.1.141';
const DATABASE = 'phase10c_routine_reference_images_test';
const MIGRATION_ROLE = 'supabase_admin';
const CONTAINER = `mesh-shift-log-phase10c-${process.pid}-${randomUUID().slice(0, 8)}`;
const PASSWORD = `phase10c-${randomUUID()}`;
const FOUNDATION_PATH = resolve(ROOT, 'supabase/phase10a_routine_engine_foundation.sql');
const TEMPLATE_PATH = resolve(ROOT, 'supabase/phase10b_routine_templates.sql');
const MIGRATION_PATH = resolve(ROOT, 'supabase/phase10c_routine_reference_images.sql');
const FOUNDATION_FIXTURE_PATH = resolve(ROOT, 'supabase/tests/phase10/foundation-fixtures.sql');
const TEMPLATE_FIXTURE_PATH = resolve(ROOT, 'supabase/tests/phase10/template-fixtures.sql');
const FIXTURE_PATH = resolve(ROOT, 'supabase/tests/phase10/reference-image-fixtures.sql');
const ASSERTION_PATH = resolve(ROOT, 'supabase/tests/phase10/reference-image-assertions.sql');
const BASELINE_PATHS = [
  resolve(ROOT, 'supabase/schema.sql'),
  resolve(ROOT, 'supabase/phase7a_workbar_device_auth.sql'),
  resolve(ROOT, 'supabase/phase5f4_close_day_archives.sql'),
  resolve(ROOT, 'supabase/phase9a_inventory_stocktaking.sql'),
];
const EXPECTED_ASSERTION_PASSES = 151;
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
  if (!/^mesh-shift-log-phase10c-[a-zA-Z0-9-]+$/.test(CONTAINER)) {
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
  if (forbiddenMarkers.some((marker) => `${migrationSql}\n${clientSql}`.toLowerCase().includes(marker))) {
    throw new Error('Phase 10C contains a privileged role, production marker, secret, or forbidden project reference.');
  }
  if (migrationSql.includes('inventory-location-reference-images')) {
    throw new Error('Phase 10C must not reference the Inventory Storage bucket.');
  }
  if (/using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\)|organization_id\s+is\s+null/i.test(migrationSql)) {
    throw new Error('Phase 10C contains a broad or nullable-organization RLS marker.');
  }
  if (/storage\.from\([^)]*\)\.upload\([^,]+\+/s.test(clientSql)
      || /admin|createSignedUploadUrl|upsert:\s*true/i.test(clientSql)) {
    throw new Error('The client contains privileged access or client-authoritative path construction.');
  }
  console.log('PASS static scope excludes privileged keys, production markers, broad RLS, Inventory Storage, and client-authoritative paths');
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

const phase10cDataFingerprintSql = String.raw`
  select pg_catalog.md5(
    coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)::text from public.routine_reference_images row_value), '[]')
    || coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)::text from public.routine_reference_image_versions row_value), '[]')
    || coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)::text from public.routine_template_task_reference_images row_value), '[]')
    || coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)::text from public.routine_reference_image_cleanup_queue row_value), '[]')
    || coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)::text from public.routine_reference_operations row_value), '[]')
    || coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)::text from public.routine_template_versions row_value), '[]')
    || coalesce((select jsonb_agg(to_jsonb(bucket) order by bucket.id)::text from storage.buckets bucket where bucket.id = 'routine-reference-images'), '[]')
  );
`;

async function verifyConcurrency() {
  const managerId = '11000000-0000-4000-8000-000000000001';
  const created = psql(authenticatedSql(managerId, String.raw`
    select public.create_routine_reference(
      'concurrency-probe', 'Concurrency probe', null, 'Referansebilde kommer',
      '44000000-0000-4000-8000-000000000001'
    );
  `), { tuplesOnly: true }).stdout.trim();
  if (!created.includes('concurrency-probe')) throw new Error('Could not create the concurrency reference.');
  const state = psql(String.raw`
    select id, revision from public.routine_reference_images where reference_key = 'concurrency-probe';
  `, { tuplesOnly: true }).stdout.trim().split('|');
  const [referenceId, referenceRevision] = state;
  const prepare = (key, fileName) => authenticatedSql(managerId, String.raw`
    select public.prepare_routine_reference_upload(
      '${referenceId}', '${fileName}', 'image/jpeg', 3, null, 'Concurrency image',
      ${referenceRevision}, '${key}'
    );
  `);
  const attempts = await Promise.all([
    concurrentPsql(prepare('44000000-0000-4000-8000-000000000002', 'first.jpg')),
    concurrentPsql(prepare('44000000-0000-4000-8000-000000000003', 'second.jpg')),
  ]);
  const succeeded = attempts.filter((result) => result.status === 0);
  const failed = attempts.filter((result) => result.status !== 0);
  if (succeeded.length !== 1 || failed.length !== 1 || !/stale/i.test(failed[0].stderr)) {
    throw new Error(`Concurrent prepare did not reject exactly one stale writer:\n${JSON.stringify(attempts)}`);
  }
  const preparedLine = succeeded[0].stdout
    .split('\n')
    .map((line) => line.trim())
    .findLast((line) => line.startsWith('{'));
  if (!preparedLine) throw new Error(`Concurrent prepare returned no JSON payload: ${succeeded[0].stdout}`);
  const prepared = JSON.parse(preparedLine);
  const versionNumbers = psql(String.raw`
    select count(*), count(distinct version_number)
    from public.routine_reference_image_versions where reference_id = '${referenceId}';
  `, { tuplesOnly: true }).stdout.trim();
  if (versionNumbers !== '2|2') throw new Error(`Concurrent prepare allocated unexpected version numbers: ${versionNumbers}`);
  console.log('PASS two real database connections allocate unique image versions and reject one stale prepare');

  psql(String.raw`
    insert into storage.objects (bucket_id, name, metadata)
    values ('routine-reference-images', '${prepared.objectPath}', '{"size":3,"mimetype":"image/jpeg"}'::jsonb);
  `);
  const finalizeSql = authenticatedSql(managerId, String.raw`
    select public.finalize_routine_reference_upload(
      '${prepared.versionId}', ${prepared.referenceRevision}, ${prepared.versionRevision},
      '44000000-0000-4000-8000-000000000004'
    );
  `);
  const finalizes = await Promise.all([concurrentPsql(finalizeSql), concurrentPsql(finalizeSql)]);
  if (finalizes.some((result) => result.status !== 0)
      || !finalizes.some((result) => /"idempotentReplay": true/.test(result.stdout))
      || !finalizes.some((result) => /"idempotentReplay": false/.test(result.stdout))) {
    throw new Error(`Concurrent finalize did not converge on one original and one replay:\n${JSON.stringify(finalizes)}`);
  }
  const finalizedState = psql(String.raw`
    select
      (select state from public.routine_reference_image_versions where id = '${prepared.versionId}'),
      (select count(*) from public.routine_reference_operations
       where idempotency_key = '44000000-0000-4000-8000-000000000004');
  `, { tuplesOnly: true }).stdout.trim();
  if (finalizedState !== 'active_image|1') throw new Error(`Concurrent finalize left unexpected state: ${finalizedState}`);
  console.log('PASS two real database connections converge on one immutable idempotent image finalize operation');
}

async function verifyClientValidation() {
  const file = (name, type, bytes, size = bytes.length) => ({
    name, type, size,
    slice(start, end) { return new Blob([Uint8Array.from(bytes).slice(start, end)]); },
  });
  const validFiles = [
    file('photo.jpeg', 'image/jpeg', [0xff, 0xd8, 0xff, 0x00]),
    file('photo.png', 'image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    file('photo.webp', 'image/webp', [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
  ];
  const validations = await Promise.all(validFiles.map(validateRoutineReferenceFileContent));
  if (validations.some((validation) => !validation.ok)) throw new Error('A valid JPEG, PNG, or WebP signature was rejected.');
  const mismatch = await validateRoutineReferenceFileContent(file('fake.jpg', 'image/jpeg', [0x89, 0x50, 0x4e, 0x47]));
  const oversize = await validateRoutineReferenceFileContent(file('large.jpg', 'image/jpeg', [0xff, 0xd8, 0xff], ROUTINE_REFERENCE_MAX_BYTES + 1));
  if (mismatch.ok || oversize.ok) throw new Error('Client file validation accepted a signature mismatch or oversized file.');
  if (normalizeRoutineReferenceFilename('  Main Floor Photo.JPEG  ', 'image/jpeg') !== 'main-floor-photo.jpg'
      || normalizeRoutineReferenceCaption('  Caption  ') !== 'Caption'
      || normalizeRoutineReferenceAltText('  Accessible description  ') !== 'Accessible description') {
    throw new Error('Client filename, caption, or alt-text normalization is not deterministic.');
  }
  console.log('PASS offline client validation accepts JPEG, PNG, and WebP magic bytes');
  console.log('PASS offline client validation rejects MIME/signature mismatch and files over 5 MB');
  console.log('PASS offline client normalization is deterministic and never creates an object path');
}

function reportDatabaseState() {
  const report = psql(String.raw`
    select 'TABLE|' || relation.relname || '|rls=' || relation.relrowsecurity
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public' and relation.relkind = 'r'
      and relation.relname in (
        'routine_reference_images', 'routine_reference_image_versions',
        'routine_template_task_reference_images', 'routine_reference_image_cleanup_queue',
        'routine_reference_operations'
      )
    union all
    select 'STORAGE_POLICY|' || policyname || '|command=' || cmd
    from pg_catalog.pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'routine_reference_images_%'
    union all
    select 'BUCKET|' || id || '|public=' || public || '|limit=' || file_size_limit
    from storage.buckets where id = 'routine-reference-images'
    order by 1;
  `, { tuplesOnly: true }).stdout.trim();
  console.log('\nFinal executable Phase 10C database state:');
  console.log(report);
}

async function main() {
  const requiredPaths = [
    FOUNDATION_PATH, TEMPLATE_PATH, MIGRATION_PATH, FOUNDATION_FIXTURE_PATH,
    TEMPLATE_FIXTURE_PATH, FIXTURE_PATH, ASSERTION_PATH, ...BASELINE_PATHS,
  ];
  if (!requiredPaths.every(existsSync)) throw new Error('Required Phase 10C verification input is missing.');
  const migrationSql = readFileSync(MIGRATION_PATH, 'utf8');
  const clientSql = readFileSync(resolve(ROOT, 'src/features/routines-v2/api/routineReferenceClient.js'), 'utf8');
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
  console.log('PASS Phase 10A and Phase 10B applied before Phase 10C');
  const protectedBefore = psql(protectedFingerprintSql, { tuplesOnly: true }).stdout.trim();
  psql(migrationSql, { singleTransaction: true });
  psql(migrationSql, { singleTransaction: true });
  console.log('PASS Phase 10C migration applied and reapplied safely before fixtures');
  const protectedAfter = psql(protectedFingerprintSql, { tuplesOnly: true }).stdout.trim();
  if (!protectedBefore || protectedBefore !== protectedAfter) {
    throw new Error('Phase 10C changed an Inventory, legacy routine, Event Operations, Auth, or Inventory Storage object.');
  }
  console.log('PASS protected domain and Inventory Storage fingerprints are unchanged by Phase 10C');

  psql(readFileSync(FOUNDATION_FIXTURE_PATH, 'utf8'), { singleTransaction: true });
  psql(readFileSync(TEMPLATE_FIXTURE_PATH, 'utf8'), { singleTransaction: true });
  psql(readFileSync(FIXTURE_PATH, 'utf8'), { singleTransaction: true });
  console.log('PASS isolated Phase 10C organizations, users, templates, references, and draft links installed');
  const assertions = psql(readFileSync(ASSERTION_PATH, 'utf8'));
  const passLines = `${assertions.stdout}\n${assertions.stderr}`
    .split('\n')
    .filter((line) => line.includes('PASS '))
    .map((line) => line.replace(/^.*PASS /, 'PASS '));
  if (passLines.length !== EXPECTED_ASSERTION_PASSES) {
    throw new Error(`Expected ${EXPECTED_ASSERTION_PASSES} SQL assertion passes, received ${passLines.length}.`);
  }
  passLines.forEach((line) => console.log(line));
  console.log(`Executable PostgreSQL Phase 10C assertions: ${passLines.length}/${passLines.length} passed.`);

  await verifyConcurrency();
  await verifyClientValidation();
  const dataBeforeReplay = psql(phase10cDataFingerprintSql, { tuplesOnly: true }).stdout.trim();
  const protectedBeforeReplay = psql(protectedFingerprintSql, { tuplesOnly: true }).stdout.trim();
  psql(readFileSync(TEMPLATE_PATH, 'utf8'), { singleTransaction: true });
  psql(migrationSql, { singleTransaction: true });
  const dataAfterReplay = psql(phase10cDataFingerprintSql, { tuplesOnly: true }).stdout.trim();
  const protectedAfterReplay = psql(protectedFingerprintSql, { tuplesOnly: true }).stdout.trim();
  if (!dataBeforeReplay || dataBeforeReplay !== dataAfterReplay) {
    throw new Error('Phase 10B plus Phase 10C repeat application modified routine reference data or audit timestamps.');
  }
  if (!protectedBeforeReplay || protectedBeforeReplay !== protectedAfterReplay) {
    throw new Error('Phase 10B plus Phase 10C repeat application changed a protected schema object.');
  }
  console.log('PASS Phase 10B plus Phase 10C repeat application is a data-stable no-op');
  console.log('PASS protected domain and Inventory Storage fingerprints remain unchanged after executable tests');
  reportDatabaseState();
}

try {
  await main();
} finally {
  cleanup();
  console.log(`Disposable database cleanup: ${containerStarted ? 'FAILED' : 'complete'}`);
  if (containerStarted) process.exitCode = 1;
}
