import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import {
  ROUTINE_DELIVERY_COMPARISON_MODES,
  ROUTINE_DELIVERY_COMPARISON_RESULTS,
  ROUTINE_DELIVERY_REPORTED_STATUSES,
  inspectRoutineDeliveryIntegrity,
  isRoutineDeliveryMatched,
  isRoutineDeliveryMismatch,
  normalizeRoutineDeliveryPreview,
  normalizeRoutineDeliverySelection,
  normalizeRoutineDeliveryWorkspace,
} from '../src/features/routines-v2/data/routineDelivery.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE = 'public.ecr.aws/supabase/postgres:17.6.1.141';
const DATABASE = 'phase10g_routine_delivery_test';
const ROLE = 'supabase_admin';
const CONTAINER = `mesh-shift-log-phase10g-${process.pid}-${randomUUID().slice(0, 8)}`;
const PASSWORD = `phase10g-${randomUUID()}`;
const MANAGER = '11000000-0000-4000-8000-000000000001';
const EXPECTED_ASSERTIONS = 228;
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
  delivery: 'supabase/phase10g_routine_closing_delivery.sql',
  foundationFixture: 'supabase/tests/phase10/foundation-fixtures.sql',
  runFixture: 'supabase/tests/phase10/run-snapshot-fixtures.sql',
  lifecycleFixture: 'supabase/tests/phase10/lifecycle-fixtures.sql',
  timeFixture: 'supabase/tests/phase10/operational-time-fixtures.sql',
  deliveryFixture: 'supabase/tests/phase10/delivery-fixtures.sql',
  assertions: 'supabase/tests/phase10/delivery-assertions.sql',
  client: 'src/features/routines-v2/api/routineDeliveryClient.js',
  model: 'src/features/routines-v2/data/routineDelivery.js',
  lifecycleClient: 'src/features/routines-v2/api/routineLifecycleClient.js',
  runClient: 'src/features/routines-v2/api/routineRunClient.js',
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
function authScalar(sql, user = MANAGER) {
  const output = psql(auth(sql, user), { tuplesOnly: true }).stdout;
  return output.split('\n').map((value) => value.trim()).filter(Boolean).at(-1) || '';
}
function key() {
  sequence += 1;
  return `1f000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
}
function json(stdout) {
  const line = stdout.split('\n').map((value) => value.trim()).findLast((value) => value.startsWith('{'));
  if (!line) throw new Error(`Expected JSON output, received:\n${stdout}`);
  return JSON.parse(line);
}
function scalar(sql) { return psql(sql, { tuplesOnly: true }).stdout.trim(); }
function prepareClosingRun(scope, dayOffset) {
  const created = json(psql(auth(
    `select public.create_or_get_routine_run('delivery-closing-test','${scope}',current_date-${dayOffset},'${key()}');`,
  ), { tuplesOnly: true }).stdout);
  const runId = created.run.id;
  psql(auth(String.raw`
    select public.assign_routine_run_role(
      '${runId}', participant.id, 'closing_responsible', 'global', null,
      (select revision from public.routine_runs where id='${runId}'), '${key()}'
    ) from public.routine_run_participants participant
      where participant.run_id='${runId}' and participant.user_profile_id='${MANAGER}';
    select public.start_routine_run('${runId}',(select revision from public.routine_runs where id='${runId}'),'${key()}');
    select public.start_routine_task(task.id,task.revision,'${key()}')
      from public.routine_run_tasks task where task.run_id='${runId}' and task.task_key_snapshot='delivery-source';
    select public.update_routine_task_item(item.id,'completed','{"checked":true}'::jsonb,'passed',null,item.revision,'${key()}')
      from public.routine_run_task_items item where item.run_id='${runId}' and item.item_key_snapshot='condition-check';
    select public.complete_routine_task(task.id,'Concurrent delivery fixture complete.',false,task.revision,'${key()}')
      from public.routine_run_tasks task where task.run_id='${runId}' and task.task_key_snapshot='delivery-source';
  `));
  return { runId, revision: Number(scalar(`select revision from public.routine_runs where id='${runId}';`)) };
}

function prepareOpeningRun(scope) {
  const created = json(psql(auth(
    `select public.create_or_get_routine_run('delivery-opening-test','${scope}',current_date,'${key()}');`,
  ), { tuplesOnly: true }).stdout);
  const runId = created.run.id;
  psql(auth(`select public.start_routine_run('${runId}',(select revision from public.routine_runs where id='${runId}'),'${key()}');`));
  const taskId = scalar(`select id from public.routine_run_tasks where run_id='${runId}' and task_key_snapshot='opening-target';`);
  return { runId, taskId, revision: Number(scalar(`select revision from public.routine_run_tasks where id='${taskId}';`)) };
}
function cleanup() {
  if (!started) return;
  if (!/^mesh-shift-log-phase10g-[0-9]+-[a-f0-9]{8}$/.test(CONTAINER)) {
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
const deliveryFingerprintSql = String.raw`
  select md5(
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_delivery_records value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_delivery_items value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_delivery_comparisons value),'[]')
  );
`;

function verifyStatic(deliverySql, clientSql, modelSql, lifecycleClientSql, runClientSql) {
  const combined = `${deliverySql}\n${clientSql}\n${modelSql}\n${lifecycleClientSql}\n${runClientSql}`;
  const forbidden = [['service','role'].join('_'), ['koala','frog'].join(''),
    ['jzuegkbzgy','nknnvivhia'].join(''), 'indexeddb', 'realtime'];
  if (forbidden.some((value) => combined.toLowerCase().includes(value))) {
    throw new Error('Phase 10G contains a privileged, production, or deferred marker.');
  }
  const policies = [...deliverySql.matchAll(/create\s+policy\b[\s\S]*?;/gi)].map((match) => match[0]).join('\n');
  if (/using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\)|organization_id\s+is\s+null/i.test(policies)) {
    throw new Error('Phase 10G contains broad or nullable-organization RLS.');
  }
  if (/\b(insert\s+into|update|delete\s+from|alter\s+table|create\s+trigger)\s+public\.(inventory_|asset_|event_operations)/i.test(deliverySql)
      || /references\s+public\.(inventory_|asset_|event_)/i.test(deliverySql)) {
    throw new Error('Phase 10G mutates or constrains a protected domain.');
  }
  const clients = `${clientSql}\n${lifecycleClientSql}\n${runClientSql}`;
  if (/\.from\s*\(/.test(clientSql) || /new\s+Date\s*\(|Date\.now\s*\(/.test(combined)
      || /reported_status\s*:|comparison_result\s*:|previous_delivery.*(?:find|filter)/i.test(clients)) {
    throw new Error('Delivery clients contain table DML or client-authoritative delivery logic.');
  }
  if (/\b(?:C\d{2}|O\d{2}|DS\d{2})\b/.test(deliverySql)) {
    throw new Error('Phase 10G hard-codes actual Opening, Closing, or Double Shift task keys.');
  }
  console.log('PASS static scope, protected-domain, RLS, client-DML, clock, and task-key checks');
}

function verifyClientModel() {
  const preview = normalizeRoutineDeliveryPreview({
    hasDeliveryContract: true,
    valid: true,
    blockers: [],
    warnings: ['delivery_with_deviation'],
    expectedFinishSequence: 2,
    proposedRecordHash: 'a'.repeat(64),
    proposedItems: [{ delivery_key: 'standard', reported_status: 'delivered_to_standard' }],
  });
  const selection = normalizeRoutineDeliverySelection({
    selectionState: 'selected', ageInOperationalDays: 2,
    reportedStatus: 'delivered_to_standard',
  });
  const workspace = normalizeRoutineDeliveryWorkspace({
    delivery: { preview, records: [] },
    previousDeliveryByTask: [{ previousDeliverySummary: selection }],
    deliveryComparisons: [{ comparison_result: 'matched' }],
  });
  const integrity = inspectRoutineDeliveryIntegrity({
    valid: true, storedRecordHash: 'b'.repeat(64), recomputedRecordHash: 'b'.repeat(64),
    itemVerificationResults: [{ valid: true }], errors: [],
  });
  if (!preview.valid || preview.expectedFinishSequence !== 2 || selection.selectionState !== 'selected'
      || workspace.deliveryComparisons.length !== 1 || !integrity.valid
      || !isRoutineDeliveryMatched({ comparisonResult: 'matched' })
      || !isRoutineDeliveryMismatch({ comparison_result: 'mismatch' })
      || ROUTINE_DELIVERY_REPORTED_STATUSES.length !== 7
      || ROUTINE_DELIVERY_COMPARISON_MODES.length !== 2
      || ROUTINE_DELIVERY_COMPARISON_RESULTS.length !== 6) {
    throw new Error('Routine delivery client/model normalization failed.');
  }
  console.log('PASS client normalization and integrity display helpers work without network');
}

function verifyAccess() {
  const count = (table, user) => Number(authScalar(`select count(*) from public.${table};`, user));
  if (count('routine_delivery_records', MANAGER) < 1
      || count('routine_delivery_records', '11000000-0000-4000-8000-000000000003') < 1) {
    throw new Error('Manager or coordinator own-organization delivery visibility failed.');
  }
  const historySql = `select jsonb_typeof(public.list_routine_delivery_history(current_date-10,current_date,null,null));`;
  if (authScalar(historySql, MANAGER) !== 'array'
      || authScalar(historySql, '11000000-0000-4000-8000-000000000003') !== 'array') {
    throw new Error('Manager or coordinator delivery history report failed.');
  }
  console.log('PASS RLS manager and coordinator see own-organization delivery history');
  if (count('routine_delivery_records', '11000000-0000-4000-8000-000000000002') < 1) {
    throw new Error('Source-run participant cannot see own Closing delivery.');
  }
  console.log('PASS RLS source-run participant sees own Closing delivery');
  const openingUser = '11000000-0000-4000-8000-000000000008';
  if (count('routine_delivery_records', openingUser) !== 0
      || count('routine_delivery_items', openingUser) !== 1
      || count('routine_delivery_comparisons', openingUser) !== 1) {
    throw new Error('Opening participant delivery visibility is broader or narrower than the selected item/comparison.');
  }
  console.log('PASS RLS Opening participant sees only selected item and own comparison, not the source record');
  for (const user of [
    '11000000-0000-4000-8000-000000000009',
    '22000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000004',
    '11000000-0000-4000-8000-000000000005',
    '11000000-0000-4000-8000-000000000006',
    '11000000-0000-4000-8000-000000000007',
  ]) {
    if (count('routine_delivery_records', user) !== 0
        || count('routine_delivery_items', user) !== 0
        || count('routine_delivery_comparisons', user) !== 0) {
      throw new Error(`Forbidden profile ${user} received delivery table visibility.`);
    }
  }
  console.log('PASS RLS blocks nonparticipant, cross-org, inactive, org-less, counter, and shared-device profiles');
  const participantHistory = psql(auth(
    `select public.list_routine_delivery_history(current_date-10,current_date,null,null);`,
    '11000000-0000-4000-8000-000000000002',
  ), { allowFailure: true });
  if (participantHistory.status === 0) throw new Error('Ordinary participant accessed manager delivery history.');
  const anonRead = psql('set role anon; select count(*) from public.routine_delivery_records;', { allowFailure: true });
  if (anonRead.status === 0) throw new Error('Anonymous role read delivery records.');
  const directInsert = psql(auth(
    `insert into public.routine_delivery_records(id) values(gen_random_uuid());`,
  ), { allowFailure: true });
  if (directInsert.status === 0) throw new Error('Authenticated role inserted a delivery record directly.');
  console.log('PASS report boundary, anonymous access, and direct authenticated mutation are denied');
}

async function verifyConcurrency() {
  const fresh = prepareClosingRun(`phase10g-finish-race-${process.pid}`, 4);
  const freshKeys = [key(), key()];
  const freshResults = await Promise.all(freshKeys.map((idempotencyKey) => concurrent(auth(
    `select public.finish_routine_run('${fresh.runId}',${fresh.revision},'${idempotencyKey}');`,
  ))));
  if (freshResults.filter((entry) => entry.status === 0).length !== 1) {
    throw new Error(`Concurrent initial finish did not yield one winner: ${JSON.stringify(freshResults)}`);
  }
  if (Number(scalar(`select count(*) from public.routine_delivery_records where source_run_id='${fresh.runId}';`)) !== 1) {
    throw new Error('Concurrent initial finish did not create exactly one delivery record.');
  }
  console.log('PASS concurrency initial finish produced one delivery record');

  const closingRunId = scalar(`select value->'run'->>'id' from phase10g_test.state where key='closing_create';`);
  const openingTaskId = scalar(`select task.id from public.routine_run_tasks task where task.run_id=(select (value->'run'->>'id')::uuid from phase10g_test.state where key='opening_create') and task.task_key_snapshot='opening-target';`);
  const closingRevision = Number(scalar(`select revision from public.routine_runs where id='${closingRunId}';`));
  const recordBefore = Number(scalar(`select count(*) from public.routine_delivery_records where source_run_id='${closingRunId}';`));
  const replayFinish = auth(`select public.finish_routine_run('${closingRunId}',${closingRevision - 1},'1a000000-0000-4000-8000-000000000010');`);
  const finishReplayResults = await Promise.all([concurrent(replayFinish), concurrent(replayFinish)]);
  if (finishReplayResults.some((entry) => entry.status !== 0)) throw new Error(`Concurrent finish replay failed: ${JSON.stringify(finishReplayResults)}`);
  if (Number(scalar(`select count(*) from public.routine_delivery_records where source_run_id='${closingRunId}';`)) !== recordBefore) {
    throw new Error('Concurrent finish replay created a duplicate delivery record.');
  }
  console.log('PASS concurrency finish replay converged on one delivery record');

  const assessmentRevision = Number(scalar(`select revision from public.routine_run_tasks where id='${openingTaskId}';`));
  const replayAssessment = auth(`select public.record_routine_initial_assessment('${openingTaskId}','ready',null,null,${assessmentRevision - 1},'1a000000-0000-4000-8000-000000000013');`);
  const assessmentResults = await Promise.all([concurrent(replayAssessment), concurrent(replayAssessment)]);
  if (assessmentResults.some((entry) => entry.status !== 0)) throw new Error(`Concurrent assessment replay failed: ${JSON.stringify(assessmentResults)}`);
  if (Number(scalar(`select count(*) from public.routine_delivery_comparisons where opening_task_id='${openingTaskId}';`)) !== 1) {
    throw new Error('Concurrent assessment replay created duplicate comparisons.');
  }
  console.log('PASS concurrency assessment replay converged on one comparison');

  const openingRace = prepareOpeningRun('fixture-scope');
  const assessmentKeys = [key(), key()];
  const initialAssessmentResults = await Promise.all(assessmentKeys.map((idempotencyKey) => concurrent(auth(
    `select public.record_routine_initial_assessment('${openingRace.taskId}','ready',null,null,${openingRace.revision},'${idempotencyKey}');`,
  ))));
  if (initialAssessmentResults.filter((entry) => entry.status === 0).length !== 1) {
    throw new Error(`Concurrent initial assessment did not yield one winner: ${JSON.stringify(initialAssessmentResults)}`);
  }
  if (Number(scalar(`select count(*) from public.routine_delivery_comparisons where opening_task_id='${openingRace.taskId}';`)) !== 1) {
    throw new Error('Concurrent initial assessment did not create exactly one comparison.');
  }
  const assessmentWinner = initialAssessmentResults.findIndex((entry) => entry.status === 0);
  const replay = concurrent(auth(
    `select public.record_routine_initial_assessment('${openingRace.taskId}','ready',null,null,${openingRace.revision},'${assessmentKeys[assessmentWinner]}');`,
  ));
  const replayResult = await replay;
  if (replayResult.status !== 0 || Number(scalar(`select count(*) from public.routine_delivery_comparisons where opening_task_id='${openingRace.taskId}';`)) !== 1) {
    throw new Error('Assessment idempotent replay did not return the original comparison.');
  }
  console.log('PASS concurrency initial assessment produced one comparison and replay stayed stable');

  const reopenRevision = Number(scalar(`select revision from public.routine_runs where id='${closingRunId}';`));
  psql(auth(`select public.reopen_routine_run('${closingRunId}','Delivery refinish concurrency',${reopenRevision},'${key()}');`));
  const refinishRevision = Number(scalar(`select revision from public.routine_runs where id='${closingRunId}';`));
  const beforeRefinish = Number(scalar(`select count(*) from public.routine_delivery_records where source_run_id='${closingRunId}';`));
  const refinishResults = await Promise.all([
    concurrent(auth(`select public.finish_routine_run('${closingRunId}',${refinishRevision},'${key()}');`)),
    concurrent(auth(`select public.finish_routine_run('${closingRunId}',${refinishRevision},'${key()}');`)),
  ]);
  if (refinishResults.filter((entry) => entry.status === 0).length !== 1) {
    throw new Error(`Concurrent refinish did not yield one winner: ${JSON.stringify(refinishResults)}`);
  }
  const afterRefinish = Number(scalar(`select count(*) from public.routine_delivery_records where source_run_id='${closingRunId}';`));
  if (afterRefinish !== beforeRefinish + 1) throw new Error('Concurrent refinish did not create exactly one superseding record.');
  console.log('PASS concurrency refinish produced one superseding delivery record');
}

async function main() {
  const required = [...Object.values(paths), ...baseline].map(absolute);
  if (!required.every(existsSync)) throw new Error('A required Phase 10G verification input is missing.');
  const deliverySql = readFileSync(absolute(paths.delivery), 'utf8');
  const clientSql = readFileSync(absolute(paths.client), 'utf8');
  const modelSql = readFileSync(absolute(paths.model), 'utf8');
  const lifecycleClientSql = readFileSync(absolute(paths.lifecycleClient), 'utf8');
  const runClientSql = readFileSync(absolute(paths.runClient), 'utf8');
  verifyStatic(deliverySql, clientSql, modelSql, lifecycleClientSql, runClientSql);
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
    psql(readFileSync(absolute(path), 'utf8'), { transaction: true });
  }
  psql(readFileSync(absolute(paths.time), 'utf8'), { transaction: true });
  psql(readFileSync(absolute(paths.timeFixture), 'utf8'));
  const protectedBefore = scalar(protectedFingerprintSql);
  psql(deliverySql, { transaction: true });
  const protectedAfter = scalar(protectedFingerprintSql);
  if (!protectedBefore || protectedBefore !== protectedAfter) throw new Error('Phase 10G changed a protected-domain fingerprint.');
  console.log('PASS protected Inventory, Storage, Asset, Event Operations, Auth, and legacy fingerprints unchanged');
  psql(readFileSync(absolute(paths.deliveryFixture), 'utf8'));
  const assertion = psql(readFileSync(absolute(paths.assertions), 'utf8'));
  const passLines = `${assertion.stdout}\n${assertion.stderr}`.split('\n').filter((line) => line.includes('PASS '));
  if (passLines.length !== EXPECTED_ASSERTIONS) {
    throw new Error(`Expected ${EXPECTED_ASSERTIONS} SQL assertion passes, received ${passLines.length}.`);
  }
  console.log(`PASS ${passLines.length}/${EXPECTED_ASSERTIONS} Phase 10G SQL assertions`);
  const deliveryBefore = scalar(deliveryFingerprintSql);
  psql(deliverySql, { transaction: true });
  const deliveryAfter = scalar(deliveryFingerprintSql);
  if (!deliveryBefore || deliveryBefore !== deliveryAfter) throw new Error('Phase 10G reapply changed delivery data or timestamps.');
  console.log('PASS Phase 10G reapplied without delivery data, timestamp, or hash changes');
  verifyClientModel();
  verifyAccess();
  await verifyConcurrency();
}

try {
  await main();
  cleanup();
  console.log('Routine delivery verification passed.');
} catch (error) {
  cleanup();
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
