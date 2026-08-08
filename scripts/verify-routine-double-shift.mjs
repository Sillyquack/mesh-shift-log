import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import {
  ROUTINE_DOUBLE_SHIFT_BUNDLE_STATUSES,
  ROUTINE_DOUBLE_SHIFT_PARTICIPANT_STATUSES,
  ROUTINE_DOUBLE_SHIFT_STEP_KEYS,
  ROUTINE_DOUBLE_SHIFT_TRANSITION_STATUSES,
  ROUTINE_EVENT_TRANSFER_RESULTS,
  getRoutineDoubleShiftPersonalOutcome,
  getRoutineDoubleShiftReturnLateness,
  normalizeRoutineDoubleShiftFeed,
  normalizeRoutineDoubleShiftWorkspace,
  normalizeRoutineEventTransferEvidence,
} from '../src/features/routines-v2/data/routineDoubleShift.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE = 'public.ecr.aws/supabase/postgres:17.6.1.141';
const DATABASE = 'phase10h_routine_double_shift_test';
const ROLE = 'supabase_admin';
const CONTAINER = `mesh-shift-log-phase10h-${process.pid}-${randomUUID().slice(0, 8)}`;
const PASSWORD = `phase10h-${randomUUID()}`;
const MANAGER = '11000000-0000-4000-8000-000000000001';
const EXPECTED_ASSERTIONS = 249;
let started = false;
let sequence = 500;

const paths = {
  foundation: 'supabase/phase10a_routine_engine_foundation.sql',
  bootstrap: 'supabase/phase10a1_routine_organization_settings_bootstrap.sql',
  templates: 'supabase/phase10b_routine_templates.sql',
  references: 'supabase/phase10c_routine_reference_images.sql',
  runs: 'supabase/phase10d_routine_runs_and_snapshots.sql',
  lifecycle: 'supabase/phase10e_routine_task_lifecycle.sql',
  time: 'supabase/phase10f_routine_operational_time.sql',
  delivery: 'supabase/phase10g_routine_closing_delivery.sql',
  doubleShift: 'supabase/phase10h_routine_double_shift.sql',
  foundationFixture: 'supabase/tests/phase10/foundation-fixtures.sql',
  runFixture: 'supabase/tests/phase10/run-snapshot-fixtures.sql',
  lifecycleFixture: 'supabase/tests/phase10/lifecycle-fixtures.sql',
  timeFixture: 'supabase/tests/phase10/operational-time-fixtures.sql',
  deliveryFixture: 'supabase/tests/phase10/delivery-fixtures.sql',
  doubleShiftFixture: 'supabase/tests/phase10/double-shift-fixtures.sql',
  assertions: 'supabase/tests/phase10/double-shift-assertions.sql',
  model: 'src/features/routines-v2/data/routineDoubleShift.js',
  client: 'src/features/routines-v2/api/routineDoubleShiftClient.js',
};

const baseline = [
  'supabase/schema.sql',
  'supabase/phase7a_workbar_device_auth.sql',
  'supabase/phase5f4_close_day_archives.sql',
  'supabase/phase8a_event_operations_core.sql',
  'supabase/phase8c_zone_command_structure.sql',
  'supabase/phase8c2_fix_role_duplicates_and_my_zone.sql',
  'supabase/phase8f_calendar_import_realtime.sql',
  'supabase/phase8h3_smart_staffing_permissions.sql',
  'supabase/phase8i_event_live_updates.sql',
  'supabase/phase9a_inventory_stocktaking.sql',
  'supabase/phase9b_stock_policies.sql',
];

const absolute = (path) => resolve(ROOT, path);
if (process.argv.length > 2) {
  throw new Error('This verifier accepts no URL, host, project ref, or connection arguments.');
}

function command(name, args, options = {}) {
  const outcome = spawnSync(name, args, {
    cwd: ROOT,
    encoding: 'utf8',
    input: options.input,
    timeout: options.timeout || 240000,
    stdio: options.stdio || 'pipe',
  });
  if (outcome.error) throw outcome.error;
  if (outcome.status !== 0 && !options.allowFailure) {
    const detail = [outcome.stdout, outcome.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${name} ${args.join(' ')} failed${detail ? `:\n${detail}` : '.'}`);
  }
  return outcome;
}
const docker = (args, options) => command('docker', args, options);

function psql(sql, { tuplesOnly = false, transaction = false, allowFailure = false } = {}) {
  const args = ['exec', '-i', CONTAINER, 'psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1',
    `--username=${ROLE}`, `--dbname=${DATABASE}`];
  if (tuplesOnly) args.push('--tuples-only', '--no-align', '--quiet');
  if (transaction) args.push('--single-transaction');
  return docker(args, { input: sql, allowFailure, timeout: 300000 });
}

function concurrent(sql) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('docker', ['exec', '-i', CONTAINER, 'psql', '--no-psqlrc', '--quiet',
      '--tuples-only', '--no-align', '--set=ON_ERROR_STOP=1', `--username=${ROLE}`, `--dbname=${DATABASE}`],
    { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', rejectPromise);
    child.on('close', (status) => resolvePromise({ status, stdout, stderr }));
    child.stdin.end(sql);
  });
}

function auth(sql, user = MANAGER) {
  return `select set_config('request.jwt.claim.sub','${user}',false); set role authenticated; ${sql}`;
}
function scalar(sql) { return psql(sql, { tuplesOnly: true }).stdout.trim(); }
function authScalar(sql, user = MANAGER) {
  const output = psql(auth(sql, user), { tuplesOnly: true }).stdout;
  return output.split('\n').map((value) => value.trim()).filter(Boolean).at(-1) || '';
}
function key() {
  sequence += 1;
  return `1c000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
}
function json(stdout) {
  const line = stdout.split('\n').map((value) => value.trim()).findLast((value) => value.startsWith('{'));
  if (!line) throw new Error(`Expected JSON output, received:\n${stdout}`);
  return JSON.parse(line);
}
function cleanup() {
  if (!started) return;
  if (!/^mesh-shift-log-phase10h-[0-9]+-[a-f0-9]{8}$/.test(CONTAINER)) {
    throw new Error(`Refusing to clean unexpected container ${CONTAINER}.`);
  }
  docker(['rm', '--force', CONTAINER], { allowFailure: true, timeout: 30000 });
  started = false;
}
process.once('SIGINT', () => { cleanup(); process.exit(130); });
process.once('SIGTERM', () => { cleanup(); process.exit(143); });

const protectedFingerprintSql = String.raw`
  with protected_relations as (
    select relation.oid,namespace.nspname,relation.relname,relation.relacl,relation.relrowsecurity
    from pg_catalog.pg_class relation join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    where relation.relkind in ('r','p','v') and (namespace.nspname in ('auth','storage') or
      (namespace.nspname='public' and (relation.relname like 'inventory_%' or relation.relname like 'asset_%'
        or relation.relname like 'event_%' or relation.relname like 'external_calendar_%'
        or relation.relname in ('shift_sessions','task_completions','handover_notes','close_day_archives','manager_daily_reviews'))))
  ), entries as (
    select 'r|'||nspname||'.'||relname||'|'||coalesce(relacl::text,'')||'|'||relrowsecurity entry from protected_relations
    union all select 'c|'||attribute.attrelid::regclass::text||'|'||attribute.attname||'|'||attribute.atttypid::regtype::text
      from pg_catalog.pg_attribute attribute where attribute.attrelid in (select oid from protected_relations)
        and attribute.attnum>0 and not attribute.attisdropped
    union all select 'k|'||constraint_row.conrelid::regclass::text||'|'||constraint_row.conname||'|'||pg_get_constraintdef(constraint_row.oid,true)
      from pg_catalog.pg_constraint constraint_row where constraint_row.conrelid in (select oid from protected_relations)
    union all select 'p|'||schemaname||'.'||tablename||'|'||policyname||'|'||cmd||'|'||roles::text||'|'||coalesce(qual,'')||'|'||coalesce(with_check,'')
      from pg_catalog.pg_policies where (schemaname,tablename) in (select nspname,relname from protected_relations)
    union all select 'f|'||namespace.nspname||'.'||procedure.proname||'|'||pg_get_function_identity_arguments(procedure.oid)||'|'||pg_get_functiondef(procedure.oid)
      from pg_catalog.pg_proc procedure join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
      where namespace.nspname in ('auth','storage') or (namespace.nspname='public' and
        (procedure.proname like 'inventory_%' or procedure.proname like 'asset_%' or procedure.proname like 'event_%'))
  ) select md5(coalesce(string_agg(entry,E'\n' order by entry),'')) from entries;
`;

const protectedDataFingerprintSql = String.raw`
  select md5(
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.event_operations value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.event_role_assignments value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.event_responsibility_handovers value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.event_calendar_sources value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.external_calendar_events value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.event_operation_calendar_links value),'[]')
  );
`;

const phase10hDataFingerprintSql = String.raw`
  select md5(
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_bundles value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_bundle_runs value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_bundle_participants value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_bundle_steps value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_bundle_reassignments value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_run_external_context_resolutions value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_event_transfer_acceptances value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_event_transfer_completions value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_delivery_records value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_delivery_items value),'[]')
  );
`;

function verifyStatic(migrationSql, clientSql, modelSql) {
  const combined = `${migrationSql}\n${clientSql}\n${modelSql}`.toLowerCase();
  const forbidden = [['service', 'role'].join('_'), ['koala', 'frog'].join(''),
    ['jzuegkbzgy', 'nknnvivhia'].join(''), 'indexeddb'];
  if (forbidden.some((marker) => combined.includes(marker))) {
    throw new Error('Phase 10H contains a privileged, production, or deferred marker.');
  }
  const policies = [...migrationSql.matchAll(/create\s+policy\b[\s\S]*?;/gi)].map((match) => match[0]).join('\n');
  if (/using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\)|organization_id\s+is\s+null/i.test(policies)) {
    throw new Error('Phase 10H contains broad or nullable-organization RLS.');
  }
  if (/\b(?:insert\s+into|update|delete\s+from|alter\s+table|create\s+trigger)\s+public\.(?:inventory_|asset_|event_operations|event_role_assignments|event_responsibility_handovers|external_calendar_events|event_operation_calendar_links)/i.test(migrationSql)
      || /references\s+public\.(?:inventory_|asset_|event_|external_calendar_)/i.test(migrationSql)) {
    throw new Error('Phase 10H mutates or constrains a protected external domain.');
  }
  if (/\.from\s*\(/.test(clientSql) || /Date\.now\s*\(|new\s+Date\s*\(/.test(`${clientSql}\n${modelSql}`)
      || /organization_id\s*:|effective_time|bundle_status\s*:|event_role\s*:|delivery_result\s*:/i.test(clientSql)) {
    throw new Error('Double Shift client contains table DML, a client clock, or authoritative fields.');
  }
  console.log('PASS static protected-domain, RLS, client-DML, client-clock, and deferred-scope checks');
}

function verifyClientModel() {
  const feed = normalizeRoutineDoubleShiftFeed({ transitionCompletedAt: '2026-08-06T10:00:00Z',
    serverNow: '2026-08-06T10:10:00Z', feedHash: 'a'.repeat(64),
    entries: [{ entryId: 'one', actionRequired: true, severity: 'important' }] });
  const workspace = normalizeRoutineDoubleShiftWorkspace({ bundle: { status: 'between_shifts', revision: 4 },
    participants: [{ status: 'closing_reassigned' }], steps: [{ step_key: 'ds02_opening_transition' }],
    changeFeed: feed, transfers: [] });
  const evidence = normalizeRoutineEventTransferEvidence({ transfer: { status: 'completed' },
    acceptance: { acceptance_hash: 'b'.repeat(64) }, completion: { completion_hash: 'c'.repeat(64) } });
  const lateness = getRoutineDoubleShiftReturnLateness({ expectedReturnAt: '2026-08-06T10:00:00Z',
    serverNow: '2026-08-06T10:10:00Z' });
  if (ROUTINE_DOUBLE_SHIFT_BUNDLE_STATUSES.length !== 10
      || ROUTINE_DOUBLE_SHIFT_PARTICIPANT_STATUSES.length !== 11
      || ROUTINE_DOUBLE_SHIFT_STEP_KEYS.length !== 4
      || ROUTINE_DOUBLE_SHIFT_TRANSITION_STATUSES.length !== 4
      || ROUTINE_EVENT_TRANSFER_RESULTS.length !== 4
      || workspace.changeFeed.entries.length !== 1 || evidence.completion === null
      || getRoutineDoubleShiftPersonalOutcome(workspace.participants[0]) !== 'opening_completed_closing_reassigned'
      || !lateness.available || lateness.seconds !== 600) {
    throw new Error('Double Shift client normalization failed.');
  }
  console.log('PASS client normalization and display-only server-time helpers work without network');
}

async function verifyConcurrency() {
  const createKeyA = key();
  const createKeyB = key();
  const createSql = (idempotencyKey) => auth(`select public.create_or_get_double_shift_bundle(
    'delivery-opening-test','delivery-closing-test','double-shift-create-race',current_date,'${idempotencyKey}');`);
  const creates = await Promise.all([concurrent(createSql(createKeyA)), concurrent(createSql(createKeyB))]);
  if (creates.some((outcome) => outcome.status !== 0)) {
    throw new Error(`Concurrent bundle create failed:\n${creates.map((outcome) => outcome.stderr).join('\n')}`);
  }
  const createIds = creates.map((outcome) => json(outcome.stdout).bundle.id);
  if (new Set(createIds).size !== 1) throw new Error('Concurrent bundle creates did not converge.');
  console.log('PASS concurrent bundle creation converges on one bundle and one Opening/Closing pair');

  const replayCases = [
    `select public.confirm_double_shift_plan(
      (select (value->'bundle'->>'id')::uuid from phase10h_test.state where key='bundle_create'),
      (select (value->'participant'->>'id')::uuid from phase10h_test.state where key='bundle_create'),
      time '18:00',2,1,'1b000000-0000-4000-8000-000000000007');`,
    `select public.complete_double_shift_opening_transition(
      (select (value->'bundle'->>'id')::uuid from phase10h_test.state where key='bundle_create'),
      (select (value->'participant'->>'id')::uuid from phase10h_test.state where key='bundle_create'),
      'temporarily_away',time '18:00',null,'Returns for Closing.',4,2,
      '1b000000-0000-4000-8000-000000000010');`,
    `select public.return_to_double_shift(
      (select (value->'bundle'->>'id')::uuid from phase10h_test.state where key='bundle_create'),
      (select (value->'participant'->>'id')::uuid from phase10h_test.state where key='bundle_create'),
      (select value->>'feedHash' from phase10h_test.state where key='feed'),5,3,
      '1b000000-0000-4000-8000-000000000011');`,
    `select public.refresh_routine_run_external_context(
      (select (value->'closingRun'->>'id')::uuid from phase10h_test.state where key='bundle_create'),
      '1b000000-0000-4000-8000-000000000003');`,
    `select public.accept_routine_event_transfer(
      (select (value->'transfer'->>'id')::uuid from phase10h_test.state where key='event_transfer_proposed'),1,
      '1b000000-0000-4000-8000-000000000015');`,
    `select public.complete_routine_event_transfer(
      (select (value->'transfer'->>'id')::uuid from phase10h_test.state where key='event_transfer_proposed'),
      'standard_met','{"items":[{"itemKey":"condition-check","status":"completed","value":{"checked":true},"resultCode":"passed","note":null}],"summary":"Physical Event Operations control completed."}'::jsonb,
      true,false,null,2,'1b000000-0000-4000-8000-000000000016');`,
  ];
  const labels = ['DS01', 'DS02', 'DS03', 'external-context refresh', 'Event acceptance', 'Event completion'];
  for (let index = 0; index < replayCases.length; index += 1) {
    const outcomes = await Promise.all([concurrent(auth(replayCases[index])), concurrent(auth(replayCases[index]))]);
    if (outcomes.some((outcome) => outcome.status !== 0)
        || outcomes.some((outcome) => !outcome.stdout.includes('"idempotentReplay": true'))) {
      throw new Error(`Concurrent ${labels[index]} replay failed:\n${outcomes.map((outcome) => outcome.stderr).join('\n')}`);
    }
    console.log(`PASS concurrent ${labels[index]} retries replay one immutable operation`);
  }

  const reconcileSql = `select public.routine_reconcile_double_shift_bundle(
    (select (value->'bundle'->>'id')::uuid from phase10h_test.state where key='bundle_create'));`;
  const reconciles = await Promise.all([concurrent(reconcileSql), concurrent(reconcileSql)]);
  if (reconciles.some((outcome) => outcome.status !== 0)
      || Number(scalar("select count(*) from public.routine_bundle_steps where step_key='ds04_bundle_finalized' and status='completed';")) !== 1) {
    throw new Error('Concurrent bundle reconciliation created inconsistent DS04 state.');
  }
  console.log('PASS concurrent reconciliation preserves exactly one DS04 finalization');

  const raceBundle = json(psql(auth(`select public.create_or_get_double_shift_bundle(
    'delivery-opening-test','delivery-closing-test','double-shift-reassignment-race',current_date,'${key()}');`),
  { tuplesOnly: true }).stdout);
  const raceId = raceBundle.bundle.id;
  const fromId = raceBundle.participant.id;
  const revision = raceBundle.bundle.revision;
  const reassignments = await Promise.all([
    concurrent(auth(`select public.reassign_double_shift_closing('${raceId}','${fromId}',
      '11000000-0000-4000-8000-000000000002','Concurrent reassignment A',${revision},'${key()}');`)),
    concurrent(auth(`select public.reassign_double_shift_closing('${raceId}','${fromId}',
      '11000000-0000-4000-8000-000000000003','Concurrent reassignment B',${revision},'${key()}');`)),
  ]);
  if (reassignments.filter((outcome) => outcome.status === 0).length !== 1
      || reassignments.filter((outcome) => outcome.status !== 0).length !== 1
      || Number(scalar(`select count(*) from public.routine_bundle_reassignments where bundle_id='${raceId}';`)) !== 1) {
    throw new Error('Concurrent Closing reassignment did not produce one winner and one stale conflict.');
  }
  console.log('PASS concurrent Closing reassignment produces one winner and one stale conflict');
}

async function main() {
  for (const path of [...Object.values(paths), ...baseline]) {
    if (!existsSync(absolute(path))) throw new Error(`Missing Phase 10H verification input: ${path}`);
  }
  const migrationSql = readFileSync(absolute(paths.doubleShift), 'utf8');
  const clientSql = readFileSync(absolute(paths.client), 'utf8');
  const modelSql = readFileSync(absolute(paths.model), 'utf8');
  verifyStatic(migrationSql, clientSql, modelSql);
  command('docker', ['--version']);
  docker(['image', 'inspect', IMAGE]);
  docker(['run', '--detach', '--rm', '--pull', 'never', '--name', CONTAINER, '--network', 'none',
    '--env', `POSTGRES_PASSWORD=${PASSWORD}`, '--env', `POSTGRES_DB=${DATABASE}`, IMAGE]);
  started = true;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const logs = docker(['logs', CONTAINER], { allowFailure: true });
    const initialized = /PostgreSQL init process complete; ready for start up/i.test(`${logs.stdout}\n${logs.stderr}`);
    const state = docker(['exec', CONTAINER, 'pg_isready', '--username=postgres', `--dbname=${DATABASE}`], { allowFailure: true });
    if (initialized && state.status === 0) { ready = true; break; }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  if (!ready) throw new Error('Disposable PostgreSQL did not become ready.');
  console.log(`PostgreSQL ${psql('show server_version;', { tuplesOnly: true }).stdout.trim()} in network-isolated disposable container`);
  psql(String.raw`
    create schema if not exists storage;
    create table if not exists storage.buckets(id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]);
    create table if not exists storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null,name text not null,owner_id uuid,metadata jsonb not null default '{}',unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,anon;
    grant select,insert,update,delete on storage.objects to authenticated;
  `);
  for (const path of baseline) psql(readFileSync(absolute(path), 'utf8'), { transaction: true });
  psql("alter table public.user_profiles drop constraint if exists user_profiles_role_check; alter table public.user_profiles add constraint user_profiles_role_check check(role in ('manager','shift_lead','event_floor_manager','staff','time2staff','counter')); ");
  for (const path of [paths.foundation, paths.bootstrap, paths.templates, paths.references, paths.runs, paths.lifecycle]) {
    psql(readFileSync(absolute(path), 'utf8'), { transaction: true });
  }
  for (const path of [paths.foundationFixture, paths.runFixture, paths.lifecycleFixture]) {
    psql(readFileSync(absolute(path), 'utf8'));
  }
  psql(readFileSync(absolute(paths.time), 'utf8'), { transaction: true });
  psql(readFileSync(absolute(paths.timeFixture), 'utf8'));
  psql(readFileSync(absolute(paths.delivery), 'utf8'), { transaction: true });
  psql(readFileSync(absolute(paths.deliveryFixture), 'utf8'));

  const protectedBefore = scalar(protectedFingerprintSql);
  const protectedDataBefore = scalar(protectedDataFingerprintSql);
  psql(migrationSql, { transaction: true });
  const protectedAfter = scalar(protectedFingerprintSql);
  const protectedDataAfter = scalar(protectedDataFingerprintSql);
  if (!protectedBefore || protectedBefore !== protectedAfter
      || !protectedDataBefore || protectedDataBefore !== protectedDataAfter) {
    throw new Error('Phase 10H changed a protected schema, policy, function, row, or byte fingerprint.');
  }
  console.log('PASS protected Inventory, Storage, Asset, Event Operations, Auth, and legacy fingerprints unchanged');

  psql(readFileSync(absolute(paths.doubleShiftFixture), 'utf8'));
  const eventBeforeFlow = scalar("select value->>'hash' from phase10h_test.state where key='event_fingerprint_before_flow';");
  const eventAfterFlow = scalar(protectedDataFingerprintSql);
  if (!eventBeforeFlow || eventBeforeFlow !== eventAfterFlow) {
    throw new Error('Routine flow mutated Event Operations or calendar fixture data.');
  }
  console.log('PASS Event Operations and calendar data stayed byte- and row-stable through transfer flow');

  const assertion = psql(readFileSync(absolute(paths.assertions), 'utf8'));
  const passLines = `${assertion.stdout}\n${assertion.stderr}`.split('\n').filter((line) => line.includes('PASS '));
  if (passLines.length !== EXPECTED_ASSERTIONS) {
    throw new Error(`Expected ${EXPECTED_ASSERTIONS} SQL assertion passes, received ${passLines.length}.`);
  }
  console.log(`PASS ${passLines.length}/${EXPECTED_ASSERTIONS} Phase 10H SQL assertions`);
  verifyClientModel();
  await verifyConcurrency();

  const hBefore = scalar(phase10hDataFingerprintSql);
  const protectedReapplyBefore = scalar(protectedFingerprintSql);
  psql(migrationSql, { transaction: true });
  const hAfter = scalar(phase10hDataFingerprintSql);
  const protectedReapplyAfter = scalar(protectedFingerprintSql);
  if (!hBefore || hBefore !== hAfter || protectedReapplyBefore !== protectedReapplyAfter) {
    throw new Error('Phase 10H reapply changed data, timestamps, hashes, or protected objects.');
  }
  console.log('PASS Phase 10H reapplied without data, timestamp, hash, or protected-domain changes');
  console.log('PASS Phase 10H Double Shift verification completed');
}

try {
  await main();
} finally {
  cleanup();
}
