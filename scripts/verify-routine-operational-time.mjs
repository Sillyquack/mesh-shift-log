import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import {
  formatRoutineDuration,
  formatRoutineLateness,
  getServerHintedTimingActions,
  normalizeRoutineOperationalClock,
  normalizeRoutineTimingState,
} from '../src/features/routines-v2/data/routineOperationalTime.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE = 'public.ecr.aws/supabase/postgres:17.6.1.141';
const DATABASE = 'phase10f_routine_time_test';
const ROLE = 'supabase_admin';
const CONTAINER = `mesh-shift-log-phase10f-${process.pid}-${randomUUID().slice(0, 8)}`;
const PASSWORD = `phase10f-${randomUUID()}`;
const MANAGER = '11000000-0000-4000-8000-000000000001';
const EXPECTED_ASSERTIONS = 249;
let started = false;
let sequence = 100;

const paths = {
  foundation: 'supabase/phase10a_routine_engine_foundation.sql',
  bootstrap: 'supabase/phase10a1_routine_organization_settings_bootstrap.sql',
  templates: 'supabase/phase10b_routine_templates.sql',
  references: 'supabase/phase10c_routine_reference_images.sql',
  runs: 'supabase/phase10d_routine_runs_and_snapshots.sql',
  lifecycle: 'supabase/phase10e_routine_task_lifecycle.sql',
  time: 'supabase/phase10f_routine_operational_time.sql',
  foundationFixture: 'supabase/tests/phase10/foundation-fixtures.sql',
  runFixture: 'supabase/tests/phase10/run-snapshot-fixtures.sql',
  lifecycleFixture: 'supabase/tests/phase10/lifecycle-fixtures.sql',
  timeFixture: 'supabase/tests/phase10/operational-time-fixtures.sql',
  assertions: 'supabase/tests/phase10/operational-time-assertions.sql',
  timeClient: 'src/features/routines-v2/api/routineTimeClient.js',
  timeModel: 'src/features/routines-v2/data/routineOperationalTime.js',
};
const baseline = [
  'supabase/schema.sql',
  'supabase/phase7a_workbar_device_auth.sql',
  'supabase/phase5f4_close_day_archives.sql',
  'supabase/phase8a_event_operations_core.sql',
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
    timeout: options.timeout || 180000,
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
  return docker(args, { input: sql, allowFailure, timeout: 240000 });
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
function key() {
  sequence += 1;
  return `fb000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
}
function json(stdout) {
  const line = stdout.split('\n').map((value) => value.trim()).findLast((value) => value.startsWith('{'));
  if (!line) throw new Error(`Expected JSON output, received:\n${stdout}`);
  return JSON.parse(line);
}
function cleanup() {
  if (!started) return;
  if (!/^mesh-shift-log-phase10f-[0-9]+-[a-f0-9]{8}$/.test(CONTAINER)) {
    throw new Error(`Refusing to clean unexpected container ${CONTAINER}.`);
  }
  docker(['rm', '--force', CONTAINER], { allowFailure: true, timeout: 30000 });
  started = false;
}
process.once('SIGINT', () => { cleanup(); process.exit(130); });
process.once('SIGTERM', () => { cleanup(); process.exit(143); });

const protectedFingerprintSql = String.raw`
  with protected as (
    select relation.oid,namespace.nspname,relation.relname,relation.relacl,relation.relrowsecurity
    from pg_catalog.pg_class relation join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    where relation.relkind in ('r','p','v') and (namespace.nspname in ('auth','storage') or
      (namespace.nspname='public' and (relation.relname like 'inventory_%' or relation.relname like 'asset_%'
        or relation.relname like 'event_%' or relation.relname in
        ('shift_sessions','task_completions','handover_notes','close_day_archives','manager_daily_reviews'))))
  ), entries as (
    select 'r|'||nspname||'.'||relname||'|'||coalesce(relacl::text,'')||'|'||relrowsecurity entry from protected
    union all select 'c|'||attribute.attrelid::regclass::text||'|'||attribute.attname||'|'||attribute.atttypid::regtype::text
      from pg_catalog.pg_attribute attribute where attribute.attrelid in (select oid from protected)
        and attribute.attnum>0 and not attribute.attisdropped
    union all select 'k|'||constraint_row.conrelid::regclass::text||'|'||constraint_row.conname||'|'||pg_get_constraintdef(constraint_row.oid,true)
      from pg_catalog.pg_constraint constraint_row where constraint_row.conrelid in (select oid from protected)
    union all select 'p|'||schemaname||'.'||tablename||'|'||policyname||'|'||cmd||'|'||roles::text||'|'||coalesce(qual,'')||'|'||coalesce(with_check,'')
      from pg_catalog.pg_policies where (schemaname,tablename) in (select nspname,relname from protected)
  ) select md5(coalesce(string_agg(entry,E'\n' order by entry),'')) from entries;
`;
const timingFingerprintSql = String.raw`
  select md5(
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_run_operational_contexts value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_run_task_timings value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_run_date_supersessions value),'[]')
  );
`;

function verifyStatic(timeSql, clientSql, modelSql) {
  const combined = `${timeSql}\n${clientSql}\n${modelSql}`;
  const forbidden = [['service','role'].join('_'), ['koala','frog'].join(''),
    ['jzuegkbzgy','nknnvivhia'].join(''), 'indexeddb', 'realtime'];
  if (forbidden.some((value) => combined.toLowerCase().includes(value))) {
    throw new Error('Phase 10F contains a privileged, production, deferred, or forbidden marker.');
  }
  const policies = [...timeSql.matchAll(/create\s+policy\b[\s\S]*?;/gi)].map((match) => match[0]).join('\n');
  if (/using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\)|organization_id\s+is\s+null/i.test(policies)) {
    throw new Error('Phase 10F contains broad or nullable-organization RLS.');
  }
  if (/\b(insert\s+into|update|delete\s+from|alter\s+table|create\s+trigger)\s+public\.(inventory_|asset_|event_operations)/i.test(timeSql)
      || /references\s+public\.(inventory_|asset_|event_)/i.test(timeSql)) {
    throw new Error('Phase 10F mutates or constrains a protected domain.');
  }
  if (/\.from\s*\(/.test(clientSql) || /effective[_A-Z]?now/i.test(clientSql)
      || /new\s+Date\s*\(|Date\.now\s*\(/.test(`${clientSql}\n${modelSql}`)) {
    throw new Error('Timing client contains table DML, client time authority, or a local clock gate.');
  }
  console.log('PASS static scope, protected-domain, RLS, client-DML, and client-clock checks');
}

async function verifyConcurrency() {
  const scope = `phase10f-create-race-${process.pid}`;
  const create = (idempotencyKey) => concurrent(auth(
    `select public.create_or_get_routine_run('daily-run-test','${scope}',null,'${idempotencyKey}');`,
  ));
  const createResults = await Promise.all([create(key()), create(key())]);
  if (createResults.some((entry) => entry.status !== 0)) throw new Error(`Concurrent auto-date create failed: ${JSON.stringify(createResults)}`);
  const runIds = createResults.map((entry) => json(entry.stdout).run.id);
  if (new Set(runIds).size !== 1) throw new Error('Concurrent auto-date create did not converge.');
  const runId = runIds[0];
  console.log('PASS concurrency auto-date create converged on one run');

  const refresh = (idempotencyKey) => concurrent(auth(
    `select public.refresh_routine_run_timing('${runId}','${idempotencyKey}');`,
  ));
  const refreshResults = await Promise.all([refresh(key()), refresh(key())]);
  if (refreshResults.some((entry) => entry.status !== 0)) throw new Error(`Concurrent refresh failed: ${JSON.stringify(refreshResults)}`);
  console.log('PASS concurrency timing refresh serialized without duplicate crossing failure');

  const taskId = psql(`select id from public.routine_run_tasks where run_id='${runId}' and condition_json_snapshot='{}'::jsonb order by id limit 1;`, { tuplesOnly: true }).stdout.trim();
  psql(String.raw`
    alter table public.routine_run_tasks disable trigger routine_run_tasks_guard;
    update public.routine_run_tasks set inclusion_state='included',status='not_started',task_type_snapshot='continuous',availability_mode_snapshot='continuous' where id='${taskId}';
    alter table public.routine_run_tasks enable trigger routine_run_tasks_guard;
    alter table public.routine_run_task_timings disable trigger routine_run_task_timings_guard;
    update public.routine_run_task_timings set schedule_state='resolved',visible_at=clock_timestamp()-interval '3 hours',
      start_at=clock_timestamp()-interval '2 hours',target_at=clock_timestamp()-interval '90 minutes',
      overdue_at=clock_timestamp()-interval '60 minutes',hard_deadline_at=clock_timestamp()-interval '30 minutes',
      current_phase='available',hard_deadline_deviation_id=null where task_id='${taskId}';
    alter table public.routine_run_task_timings enable trigger routine_run_task_timings_guard;
    select set_config('mesh.routine_run_internal','test',true);
    update public.routine_runs set status='in_progress' where id='${runId}';
  `);
  const deadlineResults = await Promise.all([refresh(key()), refresh(key())]);
  if (deadlineResults.some((entry) => entry.status !== 0)) throw new Error(`Concurrent deadline refresh failed: ${JSON.stringify(deadlineResults)}`);
  const deviationCount = Number(psql(`select count(*) from public.routine_deviations where task_id='${taskId}' and source_type='timing_issue';`, { tuplesOnly: true }).stdout.trim());
  if (deviationCount !== 1) throw new Error(`Expected one hard-deadline deviation, received ${deviationCount}.`);
  const startEvents = Number(psql(`select count(*) from public.routine_events where task_id='${taskId}' and event_type='task_system_started';`, { tuplesOnly: true }).stdout.trim());
  if (startEvents !== 1) throw new Error(`Expected one continuous system start, received ${startEvents}.`);
  console.log('PASS concurrency hard deadline created one deviation and continuous start created one event');

  const conditionResults = await Promise.all([
    concurrent(auth(`select public.evaluate_routine_run_conditions('${runId}','${key()}');`)),
    concurrent(auth(`select public.evaluate_routine_run_conditions('${runId}','${key()}');`)),
  ]);
  if (conditionResults.some((entry) => entry.status !== 0)) throw new Error(`Concurrent condition evaluation failed: ${JSON.stringify(conditionResults)}`);
  console.log('PASS concurrency condition evaluations converged');

  const successorId = psql(`select id from public.routine_run_tasks where run_id='${runId}' and id<>'${taskId}' order by id limit 1;`, { tuplesOnly: true }).stdout.trim();
  psql(String.raw`
    alter table public.routine_run_tasks disable trigger routine_run_tasks_guard;
    update public.routine_run_tasks set status='in_progress',outcome=null,completed_at=null,completed_by_auth_user_id=null where id='${taskId}';
    update public.routine_run_tasks set status='completed',outcome='standard_met',started_at=clock_timestamp()-interval '10 minutes',
      started_by_auth_user_id='${MANAGER}',completed_at=clock_timestamp(),completed_by_auth_user_id='${MANAGER}' where id='${successorId}';
    alter table public.routine_run_tasks enable trigger routine_run_tasks_guard;
    alter table public.routine_run_task_items disable trigger routine_run_task_items_guard;
    update public.routine_run_task_items set status='completed',completed_at=clock_timestamp(),
      completed_by_auth_user_id='${MANAGER}' where run_task_id='${taskId}' and required_snapshot;
    alter table public.routine_run_task_items enable trigger routine_run_task_items_guard;
    alter table public.routine_run_task_dependencies disable trigger routine_run_dependencies_guard;
    insert into public.routine_run_task_dependencies(organization_id,run_id,predecessor_run_task_id,successor_run_task_id,
      dependency_type_snapshot,metadata_snapshot,source_dependency_id,row_snapshot_hash)
    select organization_id,run_id,'${taskId}','${successorId}','complete_predecessor_on_successor','{}',gen_random_uuid(),repeat('a',64)
    from public.routine_run_tasks where id='${taskId}' on conflict do nothing;
    alter table public.routine_run_task_dependencies enable trigger routine_run_dependencies_guard;
  `);
  const completeSql = `select public.routine_apply_task_timing_completion('${successorId}',clock_timestamp());`;
  const completionResults = await Promise.all([concurrent(completeSql), concurrent(completeSql)]);
  if (completionResults.some((entry) => entry.status !== 0)) throw new Error(`Concurrent system completion failed: ${JSON.stringify(completionResults)}`);
  const completionEvents = Number(psql(`select count(*) from public.routine_events where task_id='${taskId}' and event_type='task_system_completed';`, { tuplesOnly: true }).stdout.trim());
  if (completionEvents !== 1) throw new Error(`Expected one continuous system completion, received ${completionEvents}.`);
  console.log('PASS concurrency successor completion produced one system completion');

  const supersedeScope = `phase10f-supersede-race-${process.pid}`;
  const original = json(psql(auth(`select public.create_or_get_routine_run('daily-run-test','${supersedeScope}','2026-09-10','${key()}');`), { tuplesOnly: true }).stdout).run;
  const supersede = (date, idempotencyKey) => concurrent(auth(
    `select public.supersede_routine_run_operational_date('${original.id}','${date}','Concurrency correction',${original.revision},'${idempotencyKey}');`,
  ));
  const supersedeResults = await Promise.all([supersede('2026-09-11', key()), supersede('2026-09-12', key())]);
  if (supersedeResults.filter((entry) => entry.status === 0).length !== 1) {
    throw new Error(`Concurrent supersession did not yield one winner: ${JSON.stringify(supersedeResults)}`);
  }
  const supersessionCount = Number(psql(`select count(*) from public.routine_run_date_supersessions where original_run_id='${original.id}';`, { tuplesOnly: true }).stdout.trim());
  if (supersessionCount !== 1) throw new Error('Concurrent supersession did not create exactly one immutable link.');
  console.log('PASS concurrency supersession produced one replacement');
}

function verifyClientModel(clientSql, modelSql) {
  const clock = normalizeRoutineOperationalClock({ serverNow: 'server', operationalDate: '2026-08-06', settingsRevision: 4 });
  const timing = normalizeRoutineTimingState({ timingSnapshotValid: true, tasks: [{ current_phase: 'due', live: { canStart: true, secondsLate: 61 } }] });
  if (clock.operationalDate !== '2026-08-06' || !timing.timingSnapshotValid
      || getServerHintedTimingActions(timing.tasks[0]).join(',') !== 'start'
      || formatRoutineDuration(61) !== '1m 1s' || !formatRoutineLateness(61).includes('late')) {
    throw new Error('Routine operational-time normalization failed.');
  }
  if (!clientSql.includes('input_operational_date: payload.operationalDate ?? null')
      || !clientSql.includes('input_idempotency_key: payload.idempotencyKey')
      || modelSql.includes('new Date(') || modelSql.includes('Date.now(')) {
    throw new Error('Routine timing client/model authority contract failed.');
  }
  console.log('PASS client normalization, display helpers, auto-date null, and stable retry key work without network');
}

async function main() {
  const required = [...Object.values(paths), ...baseline].map(absolute);
  if (!required.every(existsSync)) throw new Error('A required Phase 10F verification input is missing.');
  const timeSql = readFileSync(absolute(paths.time), 'utf8');
  const clientSql = readFileSync(absolute(paths.timeClient), 'utf8');
  const modelSql = readFileSync(absolute(paths.timeModel), 'utf8');
  verifyStatic(timeSql, clientSql, modelSql);
  command('docker', ['--version']);
  docker(['image', 'inspect', IMAGE]);
  docker(['run', '--detach', '--rm', '--pull', 'never', '--name', CONTAINER, '--network', 'none',
    '--env', `POSTGRES_PASSWORD=${PASSWORD}`, '--env', `POSTGRES_DB=${DATABASE}`, IMAGE]);
  started = true;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const logs = docker(['logs', CONTAINER], { allowFailure: true });
    const initialized = /PostgreSQL init process complete; ready for start up/i
      .test(`${logs.stdout}\n${logs.stderr}`);
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
  psql(readFileSync(absolute(paths.foundationFixture), 'utf8'), { transaction: true });
  psql(readFileSync(absolute(paths.runFixture), 'utf8'), { transaction: true });
  psql(readFileSync(absolute(paths.lifecycleFixture), 'utf8'), { transaction: true });
  const protectedBefore = psql(protectedFingerprintSql, { tuplesOnly: true }).stdout.trim();
  psql(timeSql, { transaction: true });
  const protectedAfter = psql(protectedFingerprintSql, { tuplesOnly: true }).stdout.trim();
  if (!protectedBefore || protectedBefore !== protectedAfter) throw new Error('Phase 10F changed a protected-domain fingerprint.');
  console.log('PASS protected Inventory, Storage, Asset, Event Operations, Auth, and legacy fingerprints unchanged');
  psql(readFileSync(absolute(paths.timeFixture), 'utf8'));
  const assertion = psql(readFileSync(absolute(paths.assertions), 'utf8'));
  const passLines = `${assertion.stdout}\n${assertion.stderr}`.split('\n').filter((line) => line.includes('PASS '));
  if (passLines.length !== EXPECTED_ASSERTIONS) {
    throw new Error(`Expected ${EXPECTED_ASSERTIONS} SQL assertion passes, received ${passLines.length}.`);
  }
  console.log(`PASS ${passLines.length}/${EXPECTED_ASSERTIONS} Phase 10F SQL assertions`);
  const timingBefore = psql(timingFingerprintSql, { tuplesOnly: true }).stdout.trim();
  psql(timeSql, { transaction: true });
  const timingAfter = psql(timingFingerprintSql, { tuplesOnly: true }).stdout.trim();
  if (!timingBefore || timingBefore !== timingAfter) throw new Error('Phase 10F reapply changed timing data or timestamps.');
  console.log('PASS Phase 10F reapplied without timing data, timestamp, or hash changes');
  verifyClientModel(clientSql, modelSql);
  await verifyConcurrency();
}

try {
  await main();
  cleanup();
  console.log('Routine operational-time verification passed.');
} catch (error) {
  cleanup();
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
