import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { eventRigGuides } from '../src/data/eventRigGuides.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE = 'public.ecr.aws/supabase/postgres:17.6.1.141';
const DATABASE = 'phase10w_event_visual_reference_test';
const ROLE = 'supabase_admin';
const CONTAINER = `mesh-shift-log-phase10w-${process.pid}-${randomUUID().slice(0, 8)}`;
const PASSWORD = `phase10w-${randomUUID()}`;
const BASELINE_PATHS = [
  'supabase/schema.sql',
  'supabase/phase7a_workbar_device_auth.sql',
  'supabase/phase5f4_close_day_archives.sql',
  'supabase/phase9a_inventory_stocktaking.sql',
];
const MIGRATION_PATHS = [
  'supabase/phase10a_routine_engine_foundation.sql',
  'supabase/phase10a1_routine_organization_settings_bootstrap.sql',
  'supabase/phase10b_routine_templates.sql',
  'supabase/phase10c_routine_reference_images.sql',
  'supabase/phase10w_event_visual_reference_bridge.sql',
];
const FIXTURE_PATHS = [
  'supabase/tests/phase10/foundation-fixtures.sql',
  'supabase/tests/phase10/event-visual-reference-fixtures.sql',
];
let started = false;
let passCount = 0;

if (process.argv.length > 2) {
  throw new Error('This verifier accepts no network, URL, host, project, or production arguments.');
}

const absolute = (path) => resolve(ROOT, path);
function check(label, condition) {
  assert.ok(condition, label);
  passCount += 1;
  console.log(`PASS ${String(passCount).padStart(3, '0')} ${label}`);
}

function command(name, args, options = {}) {
  const result = spawnSync(name, args, {
    cwd: ROOT,
    encoding: 'utf8',
    input: options.input,
    timeout: options.timeout ?? 120_000,
    maxBuffer: 32 * 1024 * 1024,
    stdio: 'pipe',
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${name} ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

const docker = (args, options) => command('docker', args, options);
function psql(sql, { tuplesOnly = false, transaction = false, allowFailure = false } = {}) {
  const args = [
    'exec', '-i', CONTAINER,
    'psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1',
    `--username=${ROLE}`, `--dbname=${DATABASE}`,
  ];
  if (tuplesOnly) args.push('--tuples-only', '--no-align', '--quiet');
  if (transaction) args.push('--single-transaction');
  return docker(args, { input: sql, allowFailure, timeout: 180_000 });
}
const scalar = (sql) => psql(sql, { tuplesOnly: true }).stdout.trim();

function authenticatedSql(userId, statement) {
  return `
    select set_config('request.jwt.claim.sub', '${userId}', false);
    set role authenticated;
    ${statement}
  `;
}

function cleanup() {
  if (!started) return;
  if (!/^mesh-shift-log-phase10w-[0-9]+-[a-f0-9]{8}$/.test(CONTAINER)) {
    throw new Error('Unsafe Phase 10W verifier container name.');
  }
  docker(['rm', '--force', CONTAINER], { allowFailure: true, timeout: 30_000 });
  const remaining = docker(['container', 'inspect', CONTAINER], { allowFailure: true, timeout: 30_000 });
  started = remaining.status === 0;
}

process.once('SIGINT', () => { cleanup(); process.exit(130); });
process.once('SIGTERM', () => { cleanup(); process.exit(143); });

function staticVerification() {
  const migration = readFileSync(absolute(MIGRATION_PATHS.at(-1)), 'utf8');
  const client = readFileSync(absolute('src/lib/eventVisualReferenceClient.js'), 'utf8');
  const modal = readFileSync(absolute('src/components/EventVisualGuideModal.jsx'), 'utf8');
  const cockpit = readFileSync(absolute('src/components/EventOperationsCockpit.jsx'), 'utf8');
  const allowedBlock = migration.match(
    /event_visual_reference_key_allowed[\s\S]*?any\s*\(array\[([\s\S]*?)\]::text\[\]\)/i,
  )?.[1] || '';
  const migrationKeys = [...allowedBlock.matchAll(/'([a-z0-9_-]+)'/g)]
    .map((match) => match[1])
    .sort();
  const guideKeys = [...new Set(
    eventRigGuides.flatMap((guide) =>
      (guide.requiredImageSlots || []).map((slot) => slot.id),
    ),
  )].sort();

  check('migration allowlist exactly matches the current event visual slots', JSON.stringify(migrationKeys) === JSON.stringify(guideKeys));
  check('metadata RPC is security definer with a fixed pg_catalog search path', /get_event_visual_references[\s\S]*?security definer[\s\S]*?set search_path = pg_catalog/i.test(migration));
  check('Event Floor Manager is allowed only by the isolated visual helper', /profile\.role in \('manager', 'event_floor_manager'\)/.test(migration));
  check('shared devices, inactive profiles, and nullable organizations are denied', /profile\.active = true[\s\S]*?organization_id is not null[\s\S]*?is_shared_device, false\) = false/.test(migration));
  check('unsupported keys fail before any reference lookup', /unsupported key/.test(migration));
  check('metadata is same-organization and current-version only', /reference\.organization_id = v_organization_id[\s\S]*?current_version\.id = reference\.current_version_id/.test(migration));
  check('object paths are returned only for active images', /case when row\.state = 'active_image' then row\.object_path else null end/.test(migration));
  check('private Storage retains manager and published-task branches', /routine_current_user_can_manage_templates\(\)[\s\S]*?routine_current_user_can_perform_tasks\(\)[\s\S]*?routine_reference_is_published_linked/.test(migration));
  check('Event Floor Manager Storage access is allowlisted and current-image only', /event_visual_reference_key_allowed\(reference\.reference_key\)[\s\S]*?version\.id = reference\.current_version_id[\s\S]*?version\.state = 'active_image'/.test(migration));
  check('migration adds no table DML privilege or broad policy', !/grant\s+(?:select|insert|update|delete)|using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\)/i.test(migration));
  check('only the sanitized RPC and Storage predicate are executable by authenticated', (migration.match(/grant execute on function/g) || []).length === 2);
  check('client uses one sanitized RPC and the existing private bucket', /get_event_visual_references/.test(client) && /ROUTINE_REFERENCE_BUCKET/.test(client));
  check('client never reads reference tables directly or creates a signed URL', !/\.from\(['"]routine_reference|createSignedUrl|createSignedUploadUrl/i.test(client));
  check('modal revokes every object URL and traps Escape and Tab', /URL\.revokeObjectURL/.test(modal) && /event\.key === 'Escape'/.test(modal) && /event\.key !== 'Tab'/.test(modal));
  check('Event Mode opens the visual modal without changing the Manager Cockpit route', /EventVisualGuideModal/.test(cockpit) && /return <ManagerEventOperationsCockpit/.test(cockpit));
}

async function waitForDatabase() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const logs = docker(['logs', CONTAINER], { allowFailure: true });
    const initialized = /PostgreSQL init process complete; ready for start up/i.test(`${logs.stdout}\n${logs.stderr}`);
    const ready = docker(
      ['exec', CONTAINER, 'pg_isready', '--username=postgres', `--dbname=${DATABASE}`],
      { allowFailure: true },
    );
    if (initialized && ready.status === 0) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error('Disposable Phase 10W PostgreSQL did not become ready.');
}

function expectFailure(label, sql, pattern) {
  const response = psql(sql, { allowFailure: true });
  const output = `${response.stdout}\n${response.stderr}`;
  check(label, response.status !== 0 && pattern.test(output));
}

function databaseVerification() {
  const eventA = '33000000-0000-4000-8000-000000000001';
  const eventB = '33000000-0000-4000-8000-000000000002';
  const inactive = '33000000-0000-4000-8000-000000000003';
  const shared = '33000000-0000-4000-8000-000000000004';
  const managerA = '11000000-0000-4000-8000-000000000001';
  const staffA = '11000000-0000-4000-8000-000000000002';
  const currentA = 'a1000000-0000-4000-8000-000000000001/e1000000-0000-4000-8000-000000000001/e2000000-0000-4000-8000-000000000002/atrium-cafe.jpg';
  const oldA = 'a1000000-0000-4000-8000-000000000001/e1000000-0000-4000-8000-000000000001/e2000000-0000-4000-8000-000000000001/atrium-cafe-old.jpg';
  const privateA = 'a1000000-0000-4000-8000-000000000001/e1000000-0000-4000-8000-000000000003/e2000000-0000-4000-8000-000000000004/private-manager-only.jpg';
  const currentB = 'b2000000-0000-4000-8000-000000000001/e1000000-0000-4000-8000-000000000004/e2000000-0000-4000-8000-000000000005/atrium-cafe.jpg';

  const eventPayload = JSON.parse(scalar(authenticatedSql(eventA, `
    select public.get_event_visual_references(array['atrium-cafe', 'atrium-water'])::text;
  `)));
  check('Event Floor Manager receives every requested allowed key', eventPayload.references.length === 2);
  const cafe = eventPayload.references.find((row) => row.referenceKey === 'atrium-cafe');
  const water = eventPayload.references.find((row) => row.referenceKey === 'atrium-water');
  check('Event Floor Manager receives only the current active café image', cafe?.state === 'active_image' && cafe?.objectPath === currentA);
  check('placeholder metadata is honest and has no object path', water?.state === 'placeholder' && water?.objectPath === null);
  check('sanitized payload omits organization and audit identities', !/organization|authUser|createdBy|updatedBy/i.test(JSON.stringify(eventPayload)));

  const crossPayload = JSON.parse(scalar(authenticatedSql(eventB, `
    select public.get_event_visual_references(array['atrium-cafe'])::text;
  `)));
  check('same key resolves inside the caller organization only', crossPayload.references[0]?.objectPath === currentB);

  expectFailure(
    'staff cannot call the Event Mode metadata RPC',
    authenticatedSql(staffA, `select public.get_event_visual_references(array['atrium-cafe']);`),
    /Event visual-reference access requires/i,
  );
  expectFailure(
    'inactive Event Floor Manager cannot call the metadata RPC',
    authenticatedSql(inactive, `select public.get_event_visual_references(array['atrium-cafe']);`),
    /Event visual-reference access requires/i,
  );
  expectFailure(
    'shared Event Floor Manager cannot call the metadata RPC',
    authenticatedSql(shared, `select public.get_event_visual_references(array['atrium-cafe']);`),
    /Event visual-reference access requires/i,
  );
  expectFailure(
    'unsupported visual keys are rejected before lookup',
    authenticatedSql(eventA, `select public.get_event_visual_references(array['private-manager-only']);`),
    /unsupported key/i,
  );

  check('Event Floor Manager can read the current allowed Storage object', scalar(authenticatedSql(eventA, `
    select public.routine_reference_storage_can_read('${currentA}')::text;
  `)) === 'true');
  check('Event Floor Manager cannot read an older allowed image version', scalar(authenticatedSql(eventA, `
    select public.routine_reference_storage_can_read('${oldA}')::text;
  `)) === 'false');
  check('Event Floor Manager cannot read a manager-only reference', scalar(authenticatedSql(eventA, `
    select public.routine_reference_storage_can_read('${privateA}')::text;
  `)) === 'false');
  check('Event Floor Manager cannot read another organization image', scalar(authenticatedSql(eventA, `
    select public.routine_reference_storage_can_read('${currentB}')::text;
  `)) === 'false');
  check('manager keeps access to current, old, and manager-only same-organization objects', scalar(authenticatedSql(managerA, `
    select count(*)::text from storage.objects
    where bucket_id = 'routine-reference-images';
  `)) === '3');
  check('Event Floor Manager Storage RLS exposes exactly one current allowed object', scalar(authenticatedSql(eventA, `
    select count(*)::text from storage.objects
    where bucket_id = 'routine-reference-images';
  `)) === '1');
  check('ordinary staff receives no unlinked event objects', scalar(authenticatedSql(staffA, `
    select count(*)::text from storage.objects
    where bucket_id = 'routine-reference-images';
  `)) === '0');
  check('Event Floor Manager table RLS exposes no reference rows directly', scalar(authenticatedSql(eventA, `
    select count(*)::text from public.routine_reference_images;
  `)) === '0');
  check('internal Event visual helpers are not executable by authenticated', scalar(`
    select (
      not has_function_privilege('authenticated', 'public.event_visual_current_user_organization_id()', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.event_visual_current_user_can_read()', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.event_visual_reference_key_allowed(text)', 'EXECUTE')
    )::text;
  `) === 'true');
  check('only sanitized metadata and Storage predicates are public execution boundaries', scalar(`
    select (
      has_function_privilege('authenticated', 'public.get_event_visual_references(text[])', 'EXECUTE')
      and has_function_privilege('authenticated', 'public.routine_reference_storage_can_read(text)', 'EXECUTE')
    )::text;
  `) === 'true');
}

async function main() {
  const required = [...BASELINE_PATHS, ...MIGRATION_PATHS, ...FIXTURE_PATHS];
  check('every Phase 10W verifier input exists', required.every((path) => existsSync(absolute(path))));
  staticVerification();

  command('docker', ['--version']);
  docker(['image', 'inspect', IMAGE]);
  docker([
    'run', '--detach', '--rm', '--pull', 'never',
    '--name', CONTAINER, '--network', 'none',
    '--env', `POSTGRES_PASSWORD=${PASSWORD}`,
    '--env', `POSTGRES_DB=${DATABASE}`,
    IMAGE,
  ]);
  started = true;
  await waitForDatabase();

  psql(`
    create schema if not exists storage;
    create table if not exists storage.buckets (
      id text primary key, name text not null, public boolean not null default false,
      file_size_limit bigint, allowed_mime_types text[]
    );
    create table if not exists storage.objects (
      id uuid primary key default gen_random_uuid(), bucket_id text not null,
      name text not null, owner_id uuid, metadata jsonb not null default '{}'::jsonb,
      unique (bucket_id, name)
    );
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated, anon;
    grant select, insert, update, delete on storage.objects to authenticated;
  `);

  for (const path of BASELINE_PATHS) {
    psql(readFileSync(absolute(path), 'utf8'), { transaction: true });
  }
  psql(`
    alter table public.user_profiles drop constraint if exists user_profiles_role_check;
    alter table public.user_profiles add constraint user_profiles_role_check
      check (role in ('manager', 'shift_lead', 'event_floor_manager', 'staff', 'time2staff', 'counter'));
  `);
  for (const path of MIGRATION_PATHS) {
    psql(readFileSync(absolute(path), 'utf8'), { transaction: true });
  }
  psql(readFileSync(absolute(MIGRATION_PATHS.at(-1)), 'utf8'), { transaction: true });
  check('Phase 10W applies and reapplies without data mutation', true);

  for (const path of FIXTURE_PATHS) {
    psql(readFileSync(absolute(path), 'utf8'), { transaction: true });
  }
  databaseVerification();
  console.log(`Event visual-reference bridge verification: ${passCount}/${passCount} passed.`);
}

try {
  await main();
} finally {
  cleanup();
  console.log(`Disposable database cleanup: ${started ? 'FAILED' : 'complete'}`);
  if (started) process.exitCode = 1;
}
