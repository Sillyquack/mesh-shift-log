import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import {
  buildRoutineLifecycleRequest,
  getClientVisibleTaskActions,
  hasRoutineLifecycleBlockers,
  normalizeRoutineCompletionValidation,
  normalizeRoutineLifecycleWorkspace,
  normalizeRoutineTimeline,
} from '../src/features/routines-v2/data/routineTaskLifecycle.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE = 'public.ecr.aws/supabase/postgres:17.6.1.141';
const DATABASE = 'phase10e_routine_lifecycle_test';
const MIGRATION_ROLE = 'supabase_admin';
const CONTAINER = `mesh-shift-log-phase10e-${process.pid}-${randomUUID().slice(0, 8)}`;
const PASSWORD = `phase10e-${randomUUID()}`;
const EXPECTED_ASSERTIONS = 255;
const MANAGER = '11000000-0000-4000-8000-000000000001';
const STAFF = '11000000-0000-4000-8000-000000000002';
let containerStarted = false;

const paths = {
  foundation: resolve(ROOT, 'supabase/phase10a_routine_engine_foundation.sql'),
  templates: resolve(ROOT, 'supabase/phase10b_routine_templates.sql'),
  references: resolve(ROOT, 'supabase/phase10c_routine_reference_images.sql'),
  runs: resolve(ROOT, 'supabase/phase10d_routine_runs_and_snapshots.sql'),
  lifecycle: resolve(ROOT, 'supabase/phase10e_routine_task_lifecycle.sql'),
  foundationFixture: resolve(ROOT, 'supabase/tests/phase10/foundation-fixtures.sql'),
  runFixture: resolve(ROOT, 'supabase/tests/phase10/run-snapshot-fixtures.sql'),
  lifecycleFixture: resolve(ROOT, 'supabase/tests/phase10/lifecycle-fixtures.sql'),
  lifecycleAssertions: resolve(ROOT, 'supabase/tests/phase10/lifecycle-assertions.sql'),
  lifecycleClient: resolve(ROOT, 'src/features/routines-v2/api/routineLifecycleClient.js'),
  lifecycleModel: resolve(ROOT, 'src/features/routines-v2/data/routineTaskLifecycle.js'),
};

const baselinePaths = [
  'supabase/schema.sql',
  'supabase/phase7a_workbar_device_auth.sql',
  'supabase/phase5f4_close_day_archives.sql',
  'supabase/phase8a_event_operations_core.sql',
  'supabase/phase9a_inventory_stocktaking.sql',
  'supabase/phase9b_stock_policies.sql',
].map((path) => resolve(ROOT, path));

if (process.argv.length > 2) {
  throw new Error('This runner accepts no database URL, host, project ref, or connection arguments.');
}

function command(name, args, options = {}) {
  const outcome = spawnSync(name, args, {
    cwd: ROOT,
    encoding: 'utf8',
    input: options.input,
    timeout: options.timeout || 120000,
    stdio: options.stdio || 'pipe',
  });
  if (outcome.error) throw outcome.error;
  if (outcome.status !== 0 && !options.allowFailure) {
    const detail = [outcome.stdout, outcome.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${name} ${args.join(' ')} failed${detail ? `:\n${detail}` : '.'}`);
  }
  return outcome;
}

function docker(args, options) { return command('docker', args, options); }

function psql(sql, { tuplesOnly = false, singleTransaction = false, allowFailure = false } = {}) {
  const args = [
    'exec', '-i', CONTAINER, 'psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1',
    `--username=${MIGRATION_ROLE}`, `--dbname=${DATABASE}`,
  ];
  if (tuplesOnly) args.push('--tuples-only', '--no-align', '--quiet');
  if (singleTransaction) args.push('--single-transaction');
  return docker(args, { input: sql, allowFailure, timeout: 180000 });
}

function concurrentPsql(sql) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('docker', [
      'exec', '-i', CONTAINER, 'psql', '--no-psqlrc', '--quiet',
      '--tuples-only', '--no-align', '--set=ON_ERROR_STOP=1',
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
    select set_config('request.jwt.claim.sub', '${userId}', false);
    set role authenticated;
    ${statement}
  `;
}

function jsonPayload(stdout) {
  const line = stdout.split('\n').map((value) => value.trim()).findLast((value) => value.startsWith('{'));
  if (!line) throw new Error(`Expected a JSON response, received:\n${stdout}`);
  return JSON.parse(line);
}

function cleanup() {
  if (!containerStarted) return;
  if (!/^mesh-shift-log-phase10e-[a-zA-Z0-9-]+$/.test(CONTAINER)) {
    throw new Error(`Refusing to remove unexpected container name: ${CONTAINER}`);
  }
  docker(['rm', '--force', CONTAINER], { allowFailure: true, timeout: 30000 });
  containerStarted = docker(['container', 'inspect', CONTAINER], { allowFailure: true }).status === 0;
}

process.once('SIGINT', () => { cleanup(); process.exit(130); });
process.once('SIGTERM', () => { cleanup(); process.exit(143); });

function verifyStaticScope(migrationSql, clientSql, modelSql) {
  const combined = `${migrationSql}\n${clientSql}\n${modelSql}`;
  const forbidden = [
    ['service', 'role'].join('_'),
    ['jzuegkbzgy', 'nknnvivhia'].join(''),
    ['koala', 'frog'].join(''),
    'inventory-location-reference-images',
  ];
  if (forbidden.some((marker) => combined.toLowerCase().includes(marker))) {
    throw new Error('Phase 10E contains a privileged role, production marker, secret, or forbidden bucket.');
  }
  const policies = [...migrationSql.matchAll(/create\s+policy\b[\s\S]*?;/gi)].map((match) => match[0]).join('\n');
  if (/using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\)|organization_id\s+is\s+null/i.test(policies)) {
    throw new Error('Phase 10E contains a broad or nullable-organization RLS policy.');
  }
  if (/\b(insert\s+into|update|delete\s+from|alter\s+table|create\s+trigger)\s+public\.(inventory_|asset_|event_)/i.test(migrationSql)
      || /references\s+public\.(inventory_|asset_|event_)/i.test(migrationSql)) {
    throw new Error('Phase 10E attempts to mutate or constrain a protected source domain.');
  }
  if (/\.from\s*\(/.test(clientSql) || /input_organization|input_outcome|\.admin\b/i.test(clientSql)) {
    throw new Error('Lifecycle client contains direct table access or client-authoritative organization/outcome input.');
  }
  if (/midnight|checkpoint|deriveOperationalDate|indexeddb|realtime/i.test(`${clientSql}\n${modelSql}`)) {
    throw new Error('Phase 10E client contains deferred time, offline, or realtime behavior.');
  }
  console.log('PASS static scope excludes privileged access, production markers, broad RLS, protected-domain writes/FKs, client DML, time logic, offline, and realtime');
}

const protectedFingerprintSql = String.raw`
  with protected_relations as (
    select relation.oid, namespace.nspname, relation.relname, relation.relacl, relation.relrowsecurity
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where relation.relkind in ('r','p','v') and (
      namespace.nspname in ('auth','storage')
      or (namespace.nspname = 'public' and (
        relation.relname like 'inventory_%' or relation.relname like 'asset_%'
        or relation.relname like 'event_%' or relation.relname in (
          'shift_sessions','task_completions','handover_notes','close_day_archives','manager_daily_reviews'
        )
      ))
    )
  ), entries as (
    select 'r|' || nspname || '.' || relname || '|' || coalesce(relacl::text,'') || '|' || relrowsecurity as entry from protected_relations
    union all
    select 'c|' || attribute.attrelid::regclass::text || '|' || attribute.attnum || '|' || attribute.attname
      || '|' || attribute.atttypid::regtype::text || '|' || attribute.attnotnull
    from pg_catalog.pg_attribute attribute where attribute.attrelid in (select oid from protected_relations)
      and attribute.attnum > 0 and not attribute.attisdropped
    union all
    select 'k|' || constraint_row.conrelid::regclass::text || '|' || constraint_row.conname || '|'
      || pg_catalog.pg_get_constraintdef(constraint_row.oid, true)
    from pg_catalog.pg_constraint constraint_row where constraint_row.conrelid in (select oid from protected_relations)
    union all
    select 'p|' || policy.schemaname || '.' || policy.tablename || '|' || policy.policyname || '|'
      || policy.cmd || '|' || policy.roles::text || '|' || coalesce(policy.qual,'') || '|' || coalesce(policy.with_check,'')
    from pg_catalog.pg_policies policy where (policy.schemaname,policy.tablename) in (select nspname,relname from protected_relations)
    union all
    select 'f|' || namespace.nspname || '.' || procedure.oid::regprocedure::text || '|'
      || coalesce(procedure.proacl::text,'') || '|' || pg_catalog.pg_get_functiondef(procedure.oid)
    from pg_catalog.pg_proc procedure join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'auth' or (namespace.nspname = 'public' and (
      procedure.proname like '%inventory%' or procedure.proname like '%asset%'
      or procedure.proname like '%event_operation%' or procedure.proname like '%shift%'
    ))
  ) select md5(coalesce(string_agg(entry, E'\n' order by entry),'')) from entries;
`;

const lifecycleDataFingerprintSql = String.raw`
  select md5(
    coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)::text from public.routine_deviations row_value),'[]')
    || coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)::text from public.routine_manager_overrides row_value),'[]')
    || coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)::text from public.routine_task_verifications row_value),'[]')
    || coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)::text from public.routine_run_verifications row_value),'[]')
    || coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)::text from public.routine_run_verification_items row_value),'[]')
    || coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)::text from public.routine_handovers row_value),'[]')
    || coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)::text from public.routine_handover_items row_value),'[]')
    || coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)::text from public.routine_run_transfers row_value),'[]')
    || coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)::text from public.routine_corrections row_value),'[]')
    || coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)::text from public.routine_events row_value),'[]')
  );
`;

let idCounter = 100;
function key() {
  idCounter += 1;
  return `ec000000-0000-4000-8000-${String(idCounter).padStart(12, '0')}`;
}

function createRun(scope, operationalDate) {
  const response = psql(authenticatedSql(MANAGER, String.raw`
    select public.create_or_get_routine_run('daily-run-test','${scope}','${operationalDate}','${key()}');
  `), { tuplesOnly: true });
  return jsonPayload(response.stdout).run.id;
}

function join(runId, userId) {
  const response = psql(authenticatedSql(userId, `select public.join_routine_run('${runId}','${key()}');`), { tuplesOnly: true });
  return jsonPayload(response.stdout).participant.id;
}

function startRun(runId) {
  const revision = psql(`select revision from public.routine_runs where id='${runId}';`, { tuplesOnly: true }).stdout.trim();
  psql(authenticatedSql(MANAGER, `select public.start_routine_run('${runId}',${revision},'${key()}');`));
}

function taskId(runId, taskKey = 'task-alpha') {
  return psql(`select id from public.routine_run_tasks where run_id='${runId}' and task_key_snapshot='${taskKey}';`, { tuplesOnly: true }).stdout.trim();
}

function expectOneWinner(results, label) {
  const winners = results.filter((entry) => entry.status === 0);
  const conflicts = results.filter((entry) => entry.status !== 0 && /stale|already|once|current state|cannot/i.test(entry.stderr));
  if (winners.length !== 1 || conflicts.length !== 1) {
    throw new Error(`${label} did not produce one winner and one protected writer:\n${JSON.stringify(results)}`);
  }
  console.log(`PASS concurrency ${label}: one winner, one stale/conflict writer`);
}

async function verifyConcurrency() {
  // 1. Claim.
  const claimRun = createRun('claim-race', '2026-08-22');
  join(claimRun, STAFF); startRun(claimRun);
  const claimTask = taskId(claimRun);
  const claim = (actor) => concurrentPsql(authenticatedSql(actor,
    `select public.claim_routine_task('${claimTask}',1,'${key()}');`));
  expectOneWinner(await Promise.all([claim(MANAGER), claim(STAFF)]), 'task claim');

  // 2. Initial assessment. A test-only snapshot variant is re-hashed locally.
  const assessmentRun = createRun('assessment-race', '2026-08-23'); startRun(assessmentRun);
  const assessmentTask = taskId(assessmentRun);
  psql(String.raw`
    alter table public.routine_run_tasks disable trigger routine_run_tasks_guard;
    update public.routine_run_tasks set initial_assessment_policy_snapshot='ready_on_arrival' where id='${assessmentTask}';
    alter table public.routine_run_tasks enable trigger routine_run_tasks_guard;
    alter table public.routine_runs disable trigger routine_runs_guard;
    update public.routine_runs set snapshot_hash=public.routine_compute_run_snapshot_hash(id) where id='${assessmentRun}';
    alter table public.routine_runs enable trigger routine_runs_guard;
  `);
  const assessment = () => concurrentPsql(authenticatedSql(MANAGER,
    `select public.record_routine_initial_assessment('${assessmentTask}','ready',null,null,1,'${key()}');`));
  expectOneWinner(await Promise.all([assessment(), assessment()]), 'initial assessment');

  // 3. Typed item revision.
  const itemRun = createRun('item-race', '2026-08-24'); startRun(itemRun);
  const itemTask = taskId(itemRun);
  psql(authenticatedSql(MANAGER, `select public.start_routine_task('${itemTask}',1,'${key()}');`));
  const itemId = psql(`select id from public.routine_run_task_items where run_task_id='${itemTask}' and item_key_snapshot='static-check';`, { tuplesOnly: true }).stdout.trim();
  const itemWrite = () => concurrentPsql(authenticatedSql(MANAGER,
    `select public.update_routine_task_item('${itemId}','completed','{"checked":true}'::jsonb,null,null,1,'${key()}');`));
  expectOneWinner(await Promise.all([itemWrite(), itemWrite()]), 'typed task-item write');

  // 4. Completion after test-only projection preparation.
  const completeRun = createRun('complete-race', '2026-08-25'); startRun(completeRun);
  const completeTask = taskId(completeRun);
  psql(authenticatedSql(MANAGER, `select public.start_routine_task('${completeTask}',1,'${key()}');`));
  psql(String.raw`
    alter table public.routine_run_task_items disable trigger routine_run_task_items_guard;
    update public.routine_run_task_items set status='completed', value_json='{"fixture":true}'::jsonb,
      completed_at=now(), completed_by_auth_user_id='${MANAGER}', revision=revision+1 where run_task_id='${completeTask}' and active_snapshot;
    alter table public.routine_run_task_items enable trigger routine_run_task_items_guard;
  `);
  const completeRevision = psql(`select revision from public.routine_run_tasks where id='${completeTask}';`, { tuplesOnly: true }).stdout.trim();
  const completion = () => concurrentPsql(authenticatedSql(MANAGER,
    `select public.complete_routine_task('${completeTask}','Race completion',false,${completeRevision},'${key()}');`));
  expectOneWinner(await Promise.all([completion(), completion()]), 'task completion');

  // 5. Deviation resolution.
  const deviationRun = createRun('deviation-race', '2026-08-26'); startRun(deviationRun);
  const deviationTask = taskId(deviationRun);
  psql(authenticatedSql(MANAGER, `select public.start_routine_task('${deviationTask}',1,'${key()}');`));
  const deviation = jsonPayload(psql(authenticatedSql(MANAGER,
    `select public.block_routine_task('${deviationTask}','equipment','race_block','Race blocker','important',null,2,'${key()}');`), { tuplesOnly: true }).stdout).deviation;
  const resolution = () => concurrentPsql(authenticatedSql(MANAGER,
    `select public.resolve_routine_deviation('${deviation.id}','Resolved once',${deviation.revision},'${key()}');`));
  expectOneWinner(await Promise.all([resolution(), resolution()]), 'deviation resolution');

  // 6. Final-verification request.
  const verificationRun = createRun('verification-race', '2026-08-27'); startRun(verificationRun);
  psql(String.raw`
    alter table public.routine_run_condition_evaluations disable trigger routine_run_condition_guard;
    update public.routine_run_condition_evaluations set evaluation_state='matched', evaluated_at=now(),
      evaluator_version='phase10e-concurrency-fixture' where run_id='${verificationRun}' and evaluation_state in ('pending','error');
    alter table public.routine_run_condition_evaluations enable trigger routine_run_condition_guard;
    alter table public.routine_run_tasks disable trigger routine_run_tasks_guard;
    update public.routine_run_tasks set status='completed', outcome='standard_met', completed_at=now(),
      completed_by_auth_user_id='${MANAGER}', revision=revision+1 where run_id='${verificationRun}' and inclusion_state='included';
    alter table public.routine_run_tasks enable trigger routine_run_tasks_guard;
    alter table public.routine_runs disable trigger routine_runs_guard;
    update public.routine_runs set snapshot_hash=public.routine_compute_run_snapshot_hash(id) where id='${verificationRun}';
    alter table public.routine_runs enable trigger routine_runs_guard;
  `);
  const verificationRevision = psql(`select revision from public.routine_runs where id='${verificationRun}';`, { tuplesOnly: true }).stdout.trim();
  const verification = () => concurrentPsql(authenticatedSql(MANAGER,
    `select public.request_routine_run_final_verification('${verificationRun}',${verificationRevision},'${key()}');`));
  expectOneWinner(await Promise.all([verification(), verification()]), 'final-verification request');

  // 7. Finish after test-only fully handled projection preparation.
  const finishRun = createRun('finish-race', '2026-08-28'); startRun(finishRun);
  psql(String.raw`
    alter table public.routine_run_tasks disable trigger routine_run_tasks_guard;
    update public.routine_run_tasks set inclusion_state=case when task_key_snapshot='task-alpha' then 'included' else 'excluded' end,
      status=case when task_key_snapshot='task-alpha' then 'completed' else 'cancelled' end,
      outcome=case when task_key_snapshot='task-alpha' then 'standard_met' else null end,
      completed_at=case when task_key_snapshot='task-alpha' then now() else null end,
      completed_by_auth_user_id=case when task_key_snapshot='task-alpha' then '${MANAGER}'::uuid else null end,
      revision=revision+1 where run_id='${finishRun}';
    alter table public.routine_run_tasks enable trigger routine_run_tasks_guard;
    alter table public.routine_run_task_items disable trigger routine_run_task_items_guard;
    update public.routine_run_task_items set status='completed', value_json='{"fixture":true}'::jsonb,
      completed_at=now(), completed_by_auth_user_id='${MANAGER}', revision=revision+1 where run_id='${finishRun}' and active_snapshot;
    alter table public.routine_run_task_items enable trigger routine_run_task_items_guard;
    alter table public.routine_runs disable trigger routine_runs_guard;
    update public.routine_runs set snapshot_hash=public.routine_compute_run_snapshot_hash(id) where id='${finishRun}';
    alter table public.routine_runs enable trigger routine_runs_guard;
  `);
  const finishRevision = psql(`select revision from public.routine_runs where id='${finishRun}';`, { tuplesOnly: true }).stdout.trim();
  const finish = () => concurrentPsql(authenticatedSql(MANAGER,
    `select public.finish_routine_run('${finishRun}',${finishRevision},'${key()}');`));
  expectOneWinner(await Promise.all([finish(), finish()]), 'run finish');
}

function verifyExplicitTargetAccess() {
  const sourceRun = createRun('target-source', '2026-08-29');
  const targetRun = createRun('target-destination', '2026-08-29');
  join(targetRun, STAFF);
  startRun(sourceRun);
  const sourceTask = taskId(sourceRun);
  const transfer = jsonPayload(psql(authenticatedSql(MANAGER, String.raw`
    select public.propose_routine_transfer(
      '${sourceTask}','target-run','routine_run','${targetRun}',null,null,
      'Explicit target-run access fixture',null,1,'${key()}'
    );
  `), { tuplesOnly: true }).stdout).transfer;
  const acceptedTransfer = jsonPayload(psql(authenticatedSql(STAFF, String.raw`
    select public.accept_routine_transfer('${transfer.id}',${transfer.revision},'${key()}');
  `), { tuplesOnly: true }).stdout).transfer;
  if (acceptedTransfer.status !== 'accepted') {
    throw new Error('Target-run participant could not accept a transfer without source-run membership.');
  }

  const handover = jsonPayload(psql(authenticatedSql(MANAGER, String.raw`
    select public.create_or_get_routine_handover(
      '${sourceRun}','opening_transition','${targetRun}',null,null,'${key()}'
    );
  `), { tuplesOnly: true }).stdout).handover;
  const submitted = jsonPayload(psql(authenticatedSql(MANAGER, String.raw`
    select public.submit_routine_handover('${handover.id}',${handover.revision},'${key()}');
  `), { tuplesOnly: true }).stdout).handover;
  const acceptedHandover = jsonPayload(psql(authenticatedSql(STAFF, String.raw`
    select public.accept_routine_handover('${submitted.id}',${submitted.revision},'${key()}');
  `), { tuplesOnly: true }).stdout).handover;
  if (acceptedHandover.status !== 'accepted') {
    throw new Error('Target-run participant could not accept a handover without source-run membership.');
  }
  console.log('PASS explicit target-run participant accepts transfer and handover without source-run visibility');
}

function verifyClientNormalization() {
  const workspace = normalizeRoutineLifecycleWorkspace({
    deviations: [{ id: 'deviation', run_id: 'run', revision: '2' }],
    transfers: [{ id: 'transfer', status: 'accepted' }],
    completionValidation: { valid: false, blockers: ['open_task'], warnings: [] },
  });
  const timeline = normalizeRoutineTimeline({
    events: [{ event_type: 'task_comment_added', payload: { comment: 'ok' } }],
    corrections: [{ id: 'correction' }],
  });
  const validation = normalizeRoutineCompletionValidation({ valid: false, blockers: ['x'] });
  const request = buildRoutineLifecycleRequest({ idempotencyKey: 'stable-key', taskId: 'task' });
  const actions = getClientVisibleTaskActions({ status: 'in_progress' });
  if (workspace.deviations[0].revision !== 2 || timeline.events[0].eventType !== 'task_comment_added'
      || !hasRoutineLifecycleBlockers(validation) || request.idempotencyKey !== 'stable-key'
      || !actions.includes('complete')) {
    throw new Error('Offline lifecycle normalization/action/request helpers are not deterministic.');
  }
  console.log('PASS lifecycle client normalization and sync-safe request helpers work without network access');
}

async function main() {
  const required = [...Object.values(paths), ...baselinePaths];
  if (!required.every(existsSync)) throw new Error('A required Phase 10E verification input is missing.');
  const migrationSql = readFileSync(paths.lifecycle, 'utf8');
  const clientSql = readFileSync(paths.lifecycleClient, 'utf8');
  const modelSql = readFileSync(paths.lifecycleModel, 'utf8');
  verifyStaticScope(migrationSql, clientSql, modelSql);

  command('docker', ['--version']);
  docker(['image', 'inspect', IMAGE]);
  docker(['run','--detach','--rm','--pull','never','--name',CONTAINER,'--network','none',
    '--env',`POSTGRES_PASSWORD=${PASSWORD}`,'--env',`POSTGRES_DB=${DATABASE}`,IMAGE]);
  containerStarted = true;

  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const logs = docker(['logs', CONTAINER], { allowFailure: true });
    const initialized = /PostgreSQL init process complete; ready for start up/i.test(`${logs.stdout}\n${logs.stderr}`);
    const state = docker(['exec',CONTAINER,'pg_isready','--username=postgres',`--dbname=${DATABASE}`], { allowFailure: true });
    if (initialized && state.status === 0) { ready = true; break; }
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
      id uuid primary key default gen_random_uuid(), bucket_id text not null, name text not null,
      owner_id uuid, metadata jsonb not null default '{}'::jsonb, unique(bucket_id,name)
    );
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated, anon;
    grant select, insert, update, delete on table storage.objects to authenticated;
  `);
  for (const baselinePath of baselinePaths) {
    psql(readFileSync(baselinePath, 'utf8'), { singleTransaction: true });
    console.log(`PASS disposable baseline applied: ${baselinePath.slice(ROOT.length + 1)}`);
  }
  psql(String.raw`
    alter table public.user_profiles drop constraint if exists user_profiles_role_check;
    alter table public.user_profiles add constraint user_profiles_role_check
      check (role in ('manager','shift_lead','event_floor_manager','staff','time2staff','counter'));
  `);
  for (const migrationPath of [paths.foundation, paths.templates, paths.references, paths.runs]) {
    psql(readFileSync(migrationPath, 'utf8'), { singleTransaction: true });
  }
  console.log('PASS Phase 10A, 10B, 10C, and committed 10D applied in order');
  psql(readFileSync(paths.foundationFixture, 'utf8'), { singleTransaction: true });
  psql(readFileSync(paths.runFixture, 'utf8'), { singleTransaction: true });
  console.log('PASS disposable identities and published run template installed');

  const protectedBefore = psql(protectedFingerprintSql, { tuplesOnly: true }).stdout.trim();
  psql(migrationSql, { singleTransaction: true });
  psql(migrationSql, { singleTransaction: true });
  console.log('PASS Phase 10E migration applied and reapplied safely');
  const protectedAfter = psql(protectedFingerprintSql, { tuplesOnly: true }).stdout.trim();
  if (!protectedBefore || protectedBefore !== protectedAfter) {
    throw new Error('Phase 10E changed Inventory, Storage, Asset, Event Operations, Auth, or legacy fingerprints.');
  }
  console.log('PASS protected-domain fingerprints are unchanged by Phase 10E');

  psql(readFileSync(paths.lifecycleFixture, 'utf8'), { singleTransaction: true });
  const assertionResult = psql(readFileSync(paths.lifecycleAssertions, 'utf8'));
  const passLines = `${assertionResult.stdout}\n${assertionResult.stderr}`.split('\n')
    .filter((line) => line.includes('PASS ')).map((line) => line.replace(/^.*PASS /, 'PASS '));
  if (passLines.length !== EXPECTED_ASSERTIONS) {
    throw new Error(`Expected ${EXPECTED_ASSERTIONS} SQL assertion passes, received ${passLines.length}.`);
  }
  console.log(`Executable PostgreSQL Phase 10E assertions: ${passLines.length}/${passLines.length} passed.`);

  verifyExplicitTargetAccess();
  await verifyConcurrency();
  verifyClientNormalization();

  const dataBeforeReplay = psql(lifecycleDataFingerprintSql, { tuplesOnly: true }).stdout.trim();
  const protectedBeforeReplay = psql(protectedFingerprintSql, { tuplesOnly: true }).stdout.trim();
  psql(migrationSql, { singleTransaction: true });
  const dataAfterReplay = psql(lifecycleDataFingerprintSql, { tuplesOnly: true }).stdout.trim();
  const protectedAfterReplay = psql(protectedFingerprintSql, { tuplesOnly: true }).stdout.trim();
  if (!dataBeforeReplay || dataBeforeReplay !== dataAfterReplay) throw new Error('10E reapplication changed lifecycle rows or timestamps.');
  if (protectedBeforeReplay !== protectedAfterReplay) throw new Error('10E reapplication changed a protected-domain fingerprint.');
  console.log('PASS Phase 10E repeat application is data-stable after executable tests');

  const hashState = psql(String.raw`
    select (select bool_and(version.content_hash=public.routine_template_version_content_hash(version.id))
      from public.routine_template_versions version where version.state='published')
      || '|' || (select bool_and(run.snapshot_hash=public.routine_compute_run_snapshot_hash(run.id))
      from public.routine_runs run where run.snapshot_state='ready');
  `, { tuplesOnly: true }).stdout.trim();
  if (hashState !== 'true|true' && hashState !== 't|t') throw new Error(`Template/run hashes are unstable: ${hashState}`);
  console.log('PASS published template and existing run snapshot hashes are stable');
}

try {
  await main();
} finally {
  cleanup();
  console.log(`Disposable database cleanup: ${containerStarted ? 'incomplete' : 'complete'}`);
}
