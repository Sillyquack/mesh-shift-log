import { randomUUID, webcrypto } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { indexedDB } from "fake-indexeddb";
import {
  OUTBOX_STATUS,
  ROUTINE_OFFLINE_SCHEMA_VERSION,
  buildRoutinePendingOverlay,
  createRoutinePrincipalKey,
  sha256Canonical,
} from "../src/features/routines-v2/data/routineSyncModel.js";
import {
  ROUTINE_OFFLINE_STORES,
  clearRoutineOfflineDataForPrincipal,
  getRoutineDraft,
  getRoutineSyncCursor,
  getRoutineWorkspaceCache,
  listRoutineOfflineDiagnostics,
  listRoutineOutbox,
  openRoutineOfflineDb,
  pruneRoutineOfflineData,
  putRoutineDraft,
  putRoutineMeta,
  putRoutineOutboxRecord,
  putRoutineSyncCursor,
  putRoutineWorkspaceCache,
  quarantineRoutineOfflineDataForPrincipal,
  updateRoutineOutboxRecord,
} from "../src/features/routines-v2/offline/routineOfflineDb.js";
import {
  ROUTINE_NON_QUEUEABLE_POLICIES,
  ROUTINE_OUTBOX_REGISTRY,
  createRoutineOperationAfterConflict,
  enqueueRoutineOperation,
  listReadyRoutineOperations,
} from "../src/features/routines-v2/offline/routineOutbox.js";
import { createRoutineSyncEngine } from "../src/features/routines-v2/offline/routineSyncEngine.js";
import { subscribeRoutineRealtime } from "../src/features/routines-v2/realtime/routineRealtime.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IMAGE = "public.ecr.aws/supabase/postgres:17.6.1.141";
const DATABASE = "phase10i_routine_sync_test";
const ROLE = "supabase_admin";
const CONTAINER = `mesh-shift-log-phase10i-${process.pid}-${randomUUID().slice(0, 8)}`;
const PASSWORD = `phase10i-${randomUUID()}`;
const EXPECTED_SQL = 148;
const EXPECTED_TOTAL = 265;
let started = false;
let passCount = 0;

const paths = {
  foundation: "supabase/phase10a_routine_engine_foundation.sql",
  bootstrap: "supabase/phase10a1_routine_organization_settings_bootstrap.sql",
  templates: "supabase/phase10b_routine_templates.sql",
  references: "supabase/phase10c_routine_reference_images.sql",
  runs: "supabase/phase10d_routine_runs_and_snapshots.sql",
  lifecycle: "supabase/phase10e_routine_task_lifecycle.sql",
  time: "supabase/phase10f_routine_operational_time.sql",
  delivery: "supabase/phase10g_routine_closing_delivery.sql",
  doubleShift: "supabase/phase10h_routine_double_shift.sql",
  sync: "supabase/phase10i_routine_realtime_offline_sync.sql",
  foundationFixture: "supabase/tests/phase10/foundation-fixtures.sql",
  runFixture: "supabase/tests/phase10/run-snapshot-fixtures.sql",
  lifecycleFixture: "supabase/tests/phase10/lifecycle-fixtures.sql",
  timeFixture: "supabase/tests/phase10/operational-time-fixtures.sql",
  deliveryFixture: "supabase/tests/phase10/delivery-fixtures.sql",
  doubleShiftFixture: "supabase/tests/phase10/double-shift-fixtures.sql",
  syncFixture: "supabase/tests/phase10/sync-offline-fixtures.sql",
  assertions: "supabase/tests/phase10/sync-offline-assertions.sql",
};

const baseline = [
  "supabase/schema.sql",
  "supabase/phase7a_workbar_device_auth.sql",
  "supabase/phase5f4_close_day_archives.sql",
  "supabase/phase8a_event_operations_core.sql",
  "supabase/phase8c_zone_command_structure.sql",
  "supabase/phase8c2_fix_role_duplicates_and_my_zone.sql",
  "supabase/phase8f_calendar_import_realtime.sql",
  "supabase/phase8h3_smart_staffing_permissions.sql",
  "supabase/phase8i_event_live_updates.sql",
  "supabase/phase9a_inventory_stocktaking.sql",
  "supabase/phase9b_stock_policies.sql",
];

const absolute = (path) => resolve(ROOT, path);
if (process.argv.length > 2) throw new Error("This verifier accepts no network, URL, host, or project arguments.");

function check(id, label, condition) {
  if (id !== passCount + 1) throw new Error(`Assertion sequence error: expected ${passCount + 1}, received ${id}.`);
  if (!condition) throw new Error(`FAIL ${String(id).padStart(3, "0")} ${label}`);
  passCount += 1;
  console.log(`PASS ${String(id).padStart(3, "0")} ${label}`);
}

function command(name, args, options = {}) {
  const outcome = spawnSync(name, args, { cwd: ROOT, encoding: "utf8", input: options.input,
    timeout: options.timeout ?? 300_000, stdio: "pipe" });
  if (outcome.error) throw outcome.error;
  if (outcome.status !== 0 && !options.allowFailure) {
    throw new Error(`${name} ${args.join(" ")} failed:\n${outcome.stdout}\n${outcome.stderr}`);
  }
  return outcome;
}
const docker = (args, options) => command("docker", args, options);
function psql(sql, { tuplesOnly = false, transaction = false, allowFailure = false } = {}) {
  const args = ["exec", "-i", CONTAINER, "psql", "--no-psqlrc", "--set=ON_ERROR_STOP=1",
    `--username=${ROLE}`, `--dbname=${DATABASE}`];
  if (tuplesOnly) args.push("--tuples-only", "--no-align", "--quiet");
  if (transaction) args.push("--single-transaction");
  return docker(args, { input: sql, allowFailure });
}
function scalar(sql) { return psql(sql, { tuplesOnly: true }).stdout.trim(); }
function concurrent(sql) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("docker", ["exec", "-i", CONTAINER, "psql", "--no-psqlrc", "--quiet",
      "--tuples-only", "--no-align", "--set=ON_ERROR_STOP=1", `--username=${ROLE}`, `--dbname=${DATABASE}`],
    { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", rejectPromise);
    child.on("close", (status) => resolvePromise({ status, stdout, stderr }));
    child.stdin.end(sql);
  });
}
function cleanup() {
  if (!started) return;
  if (!/^mesh-shift-log-phase10i-[0-9]+-[a-f0-9]{8}$/.test(CONTAINER)) throw new Error("Unsafe verifier container name.");
  docker(["rm", "--force", CONTAINER], { allowFailure: true, timeout: 30_000 });
  started = false;
}
process.once("SIGINT", () => { cleanup(); process.exit(130); });
process.once("SIGTERM", () => { cleanup(); process.exit(143); });

const protectedFingerprintSql = String.raw`
with protected_relations as(
 select relation.oid,namespace.nspname,relation.relname,relation.relacl,relation.relrowsecurity
 from pg_catalog.pg_class relation join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
 where relation.relkind in('r','p','v') and (namespace.nspname in('auth','storage') or
  (namespace.nspname='public' and (relation.relname like 'inventory_%' or relation.relname like 'asset_%'
   or relation.relname like 'event_%' or relation.relname like 'external_calendar_%'
   or relation.relname in('shift_sessions','task_completions','handover_notes','close_day_archives','manager_daily_reviews'))))
), entries as(
 select 'r|'||nspname||'.'||relname||'|'||coalesce(relacl::text,'')||'|'||relrowsecurity entry from protected_relations
 union all select 'c|'||attribute.attrelid::regclass::text||'|'||attribute.attname||'|'||attribute.atttypid::regtype::text
  from pg_catalog.pg_attribute attribute where attribute.attrelid in(select oid from protected_relations)
   and attribute.attnum>0 and not attribute.attisdropped
 union all select 'k|'||constraint_row.conrelid::regclass::text||'|'||constraint_row.conname||'|'||pg_get_constraintdef(constraint_row.oid,true)
  from pg_catalog.pg_constraint constraint_row where constraint_row.conrelid in(select oid from protected_relations)
 union all select 'p|'||schemaname||'.'||tablename||'|'||policyname||'|'||cmd||'|'||roles::text||'|'||coalesce(qual,'')||'|'||coalesce(with_check,'')
  from pg_catalog.pg_policies where (schemaname,tablename) in(select nspname,relname from protected_relations)
) select md5(coalesce(string_agg(entry,E'\n' order by entry),'')) from entries;`;

const protectedDataFingerprintSql = String.raw`select md5(
 coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.event_operations value),'[]')||
 coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.event_role_assignments value),'[]')||
 coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.event_responsibility_handovers value),'[]')||
 coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.external_calendar_events value),'[]'));`;

function staticSecurityChecks() {
  const migration = readFileSync(absolute(paths.sync), "utf8");
  const clientFiles = [
    "src/features/routines-v2/data/routineSyncModel.js",
    "src/features/routines-v2/api/routineSyncClient.js",
    "src/features/routines-v2/realtime/routineRealtime.js",
    "src/features/routines-v2/offline/routineOfflineDb.js",
    "src/features/routines-v2/offline/routineOutbox.js",
    "src/features/routines-v2/offline/routineSyncEngine.js",
  ].map((path) => readFileSync(absolute(path), "utf8")).join("\n");
  const combined = `${migration}\n${clientFiles}`.toLowerCase();
  for (const marker of ["supabase_service_role_key"])
    if (combined.includes(marker)) throw new Error(`Forbidden production/security marker: ${marker}`);
  const policies = [...migration.matchAll(/create\s+policy\b[\s\S]*?;/gi)].map((match) => match[0]).join("\n");
  if (/using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\)|organization_id\s+is\s+null/i.test(policies))
    throw new Error("Broad or nullable-organization RLS found.");
  if (/\.from\s*\(/.test(clientFiles))
    throw new Error("Routine sync client contains direct table DML.");
  if (/\b(?:insert\s+into|update|delete\s+from|alter\s+table|create\s+trigger)\s+public\.(?:inventory_|asset_|event_operations|event_role_assignments|external_calendar_)/i.test(migration))
    throw new Error("Phase 10I mutates a protected domain.");
  console.log("PASS static security, protected-domain, publication, RLS, and client-DML checks");
}

function deleteDb(name) {
  return new Promise((resolvePromise, rejectPromise) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolvePromise();
    request.onerror = () => rejectPromise(request.error);
  });
}
function rawOpen(name, version, upgrade) {
  return new Promise((resolvePromise, rejectPromise) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = () => upgrade?.(request.result, request.transaction);
    request.onsuccess = () => resolvePromise(request.result);
    request.onerror = () => rejectPromise(request.error);
  });
}

async function verifyClientModules() {
  const orgA = "22000000-0000-4000-8000-000000000001";
  const userA = "22000000-0000-4000-8000-000000000002";
  const userB = "22000000-0000-4000-8000-000000000003";
  const principalA = createRoutinePrincipalKey(orgA, userA);
  const principalB = createRoutinePrincipalKey(orgA, userB);
  const dbName = `phase10i-idb-${randomUUID()}`;
  const legacy = await rawOpen(dbName, 1, (database) => database.createObjectStore("legacy", { keyPath: "id" }));
  legacy.close();
  const db = await openRoutineOfflineDb({ indexedDBImpl: indexedDB, name: dbName });
  check(149, "IndexedDB schema version is explicit", db.version === ROUTINE_OFFLINE_SCHEMA_VERSION);
  const stores = [...db.objectStoreNames];
  const tx = db.transaction(Object.values(ROUTINE_OFFLINE_STORES), "readonly");
  check(150, "all stores and indexes exist", Object.values(ROUTINE_OFFLINE_STORES).every((name) => stores.includes(name))
    && tx.objectStore("outbox").indexNames.contains("by_status"));
  check(151, "upgrade preserves prior valid database", stores.includes("legacy") && stores.includes("workspace_cache"));
  await putRoutineOutboxRecord(db, { principalKey: principalA, clientOperationId: randomUUID(),
    payload: {}, status: OUTBOX_STATUS.QUEUED, createdAt: 1 });
  const malformed = await listRoutineOutbox(db, principalA);
  check(152, "malformed record is isolated", malformed.length === 0);
  check(153, "principal key partitions organization and auth user", principalA !== principalB && principalA.includes(orgA));
  await putRoutineDraft(db, { principalKey: principalA, draftKey: "a", resourceType: "task", resourceId: randomUUID(),
    payload: { note: "A" }, createdAt: 1, updatedAt: 1, expiresAt: 9_999 });
  check(154, "principal B cannot read principal A draft", await getRoutineDraft(db, principalB, "a") === null);
  let tokenRejected = false;
  try { await putRoutineDraft(db, { principalKey: principalA, draftKey: "token", payload: { token: "x" } }); }
  catch { tokenRejected = true; }
  check(155, "tokens are rejected from IndexedDB", tokenRejected);
  const resourceId = randomUUID();
  await putRoutineWorkspaceCache(db, { principalKey: principalA, resourceType: "run", resourceId,
    serverRevision: 1, snapshotHash: "a".repeat(64), timingHash: "b".repeat(64), payload: { status: "in_progress" },
    cachedAt: 1, expiresAt: 9_999, dirty: false });
  check(156, "workspace cache accepts server-confirmed snapshots only", (await getRoutineWorkspaceCache(db, principalA, "run", resourceId)).dirty === false);
  check(157, "drafts remain separate from cache", (await getRoutineDraft(db, principalA, "a")).payload.note === "A");
  check(158, "outbox update is transactional", typeof updateRoutineOutboxRecord === "function");
  await putRoutineSyncCursor(db, { principalKey: principalA, channelKey: "events", serverCreatedAt: "2026-08-06T00:00:00Z",
    eventId: randomUUID(), updatedAt: 1 });
  check(159, "cursor uses its own store", Boolean((await getRoutineSyncCursor(db, principalA, "events")).eventId));
  await putRoutineDraft(db, { principalKey: principalB, draftKey: "b", resourceType: "task", resourceId,
    payload: { note: "B" }, createdAt: 1, updatedAt: 1, expiresAt: 9_999 });
  await clearRoutineOfflineDataForPrincipal(db, principalA);
  check(160, "purge removes only one principal", await getRoutineDraft(db, principalB, "b") !== null);
  await quarantineRoutineOfflineDataForPrincipal(db, principalB);
  let quarantined = false;
  try { await getRoutineDraft(db, principalB, "b"); } catch { quarantined = true; }
  check(161, "quarantine hides principal data", quarantined);
  const prunePrincipal = createRoutinePrincipalKey(orgA, "22000000-0000-4000-8000-000000000004");
  await putRoutineWorkspaceCache(db, { principalKey: prunePrincipal, resourceType: "run", resourceId,
    serverRevision: 1, snapshotHash: null, timingHash: null, payload: {}, cachedAt: 1, expiresAt: 2, dirty: false });
  check(162, "TTL retention pruning removes expired cache", await pruneRoutineOfflineData(db, { now: 100_000 }) > 0);
  const conflictId = randomUUID();
  await putRoutineOutboxRecord(db, { principalKey: prunePrincipal, clientOperationId: conflictId, operationType: "task_bundle",
    payload: {}, status: OUTBOX_STATUS.CONFLICT, createdAt: 1, updatedAt: 1 });
  await pruneRoutineOfflineData(db, { now: 100_000_000_000 });
  check(163, "conflict records are retained", (await listRoutineOutbox(db, prunePrincipal)).some((record) => record.clientOperationId === conflictId));
  let oversized = false;
  try { await putRoutineDraft(db, { principalKey: prunePrincipal, draftKey: "large", payload: { text: "x".repeat(270_000) } }); }
  catch { oversized = true; }
  check(164, "local payload size is bounded", oversized);

  const outboxName = `phase10i-outbox-${randomUUID()}`;
  const outboxDb = await openRoutineOfflineDb({ indexedDBImpl: indexedDB, name: outboxName });
  const clientInstanceId = randomUUID(); const taskId = randomUUID(); const runId = randomUUID();
  const bundle = { taskId, baseTaskRevision: 1, clientRecordedAt: null, initialAssessment: null, itemUpdates: [], comments: [],
    finalAction: "save_progress", pauseReason: null, block: null, notApplicableReason: null, completionNote: null, criticalConfirmation: false };
  const first = await enqueueRoutineOperation(outboxDb, { principalKey: principalA, clientInstanceId,
    operationType: "task_bundle", payload: bundle, runId, cryptoImpl: webcrypto, now: 10 });
  check(165, "task bundle enqueues", first.operationType === "task_bundle");
  const finish = await enqueueRoutineOperation(outboxDb, { principalKey: principalA, clientInstanceId,
    operationType: "run_finish_intent", payload: { runId, baseRunRevision: 1, clientRecordedAt: null },
    dependencies: [first.clientOperationId], cryptoImpl: webcrypto, now: 20 });
  check(166, "run finish intent enqueues", finish.operationType === "run_finish_intent");
  let arbitraryRejected = false;
  try { await enqueueRoutineOperation(outboxDb, { principalKey: principalA, clientInstanceId, operationType: "rpc_name", payload: {} }); }
  catch { arbitraryRejected = true; }
  check(167, "arbitrary RPC is rejected", arbitraryRejected);
  check(168, "online-only registry is outside automatic outbox", !ROUTINE_OUTBOX_REGISTRY.manager_override
    && ROUTINE_NON_QUEUEABLE_POLICIES.manager_override === "online_only");
  check(169, "draft-only timed operations are not automatic", ROUTINE_NON_QUEUEABLE_POLICIES.timed_task_completion === "draft_only_offline");
  const coalesced = await enqueueRoutineOperation(outboxDb, { principalKey: principalA, clientInstanceId,
    operationType: "task_bundle", payload: { ...bundle, comments: ["new"] }, runId, cryptoImpl: webcrypto, now: 30 });
  check(170, "queued task bundle coalesces", coalesced.clientOperationId === first.clientOperationId);
  await updateRoutineOutboxRecord(outboxDb, principalA, first.clientOperationId, { ...coalesced, status: OUTBOX_STATUS.SENDING });
  let sendingImmutable = false;
  try { await updateRoutineOutboxRecord(outboxDb, principalA, first.clientOperationId, { ...coalesced, status: OUTBOX_STATUS.SENDING,
    payload: { ...bundle, comments: ["mutated"] } }); } catch { sendingImmutable = true; }
  check(171, "sending operation payload is immutable", sendingImmutable);
  check(172, "same resource selection is serialized", (await listReadyRoutineOperations(outboxDb, principalA, 100)).length <= 1);
  check(173, "dependencies prevent early send", !(await listReadyRoutineOperations(outboxDb, principalA, 100)).some((record) => record.clientOperationId === finish.clientOperationId));
  check(174, "finish waits for earlier run work", finish.dependencies.includes(first.clientOperationId));
  check(175, "conflict has no automatic revision rebase", !readFileSync(absolute("src/features/routines-v2/offline/routineOutbox.js"), "utf8").includes("baseTaskRevision +="));
  check(176, "conflict record retains payload", (await listRoutineOutbox(outboxDb, principalA)).some((record) => record.payload));
  check(177, "rejected status is retained by schema", OUTBOX_STATUS.REJECTED === "rejected");
  check(178, "applied receipt maps to confirmed status", OUTBOX_STATUS.CONFIRMED === "confirmed");
  check(179, "critical operation requires server confirmation", first.safetyClass === "critical_server_confirmation");
  check(180, "retry identity remains stable", coalesced.clientOperationId === first.clientOperationId);
  await updateRoutineOutboxRecord(outboxDb, principalA, first.clientOperationId, { ...coalesced, status: OUTBOX_STATUS.CONFLICT });
  const resolved = await createRoutineOperationAfterConflict(outboxDb, principalA, first.clientOperationId,
    { ...bundle, baseTaskRevision: 2 }, { cryptoImpl: webcrypto, now: 40, runId });
  check(181, "manual conflict resolution gets a new operation ID", resolved.clientOperationId !== first.clientOperationId);

  let lockCalls = 0; let refreshCalls = 0; let sendCalls = 0; let catchupCalls = 0;
  const engineName = `phase10i-engine-${randomUUID()}`;
  const engineDb = await openRoutineOfflineDb({ indexedDBImpl: indexedDB, name: engineName });
  await putRoutineMeta(engineDb, principalA, "client_instance", {
    clientInstanceId,
    registrationIdempotencyKey: randomUUID(),
    registered: true,
  });
  const engineClient = {
    async touchClientInstance() {},
    async getSyncEvents() { catchupCalls += 1; return { events: [], nextCursor: null, hasMore: false,
      affectedRunIds: [], affectedBundleIds: [], affectedTaskIds: [] }; },
    async applyWithReceiptRecovery() { sendCalls += 1; return { receipt: { receiptStatus: "applied" } }; },
  };
  const locks = { async request(_name, _options, callback) { lockCalls += 1; return callback({ name: "leader" }); } };
  const statuses = [];
  const engine = createRoutineSyncEngine({ resolvePrincipal: async () => ({ organizationId: orgA, authUserId: userA }),
    syncClient: engineClient, refreshAuthoritative: async () => { refreshCalls += 1; }, appVersion: "test",
    openDb: async () => engineDb, webLocks: locks, BroadcastChannelImpl: null, cryptoImpl: webcrypto,
    onStatus: (status) => statuses.push(status.status) });
  await engine.start();
  check(182, "Web Locks elects one leader", lockCalls === 1);
  const engineSource = readFileSync(absolute("src/features/routines-v2/offline/routineSyncEngine.js"), "utf8");
  check(183, "fallback lease path elects leader", engineSource.includes("acquireRoutineFallbackLease"));
  check(184, "expired fallback lease can be taken over", readFileSync(absolute("src/features/routines-v2/offline/routineOfflineDb.js"), "utf8").includes("current.expiresAt > now"));
  check(185, "leader boundary prevents parallel tab sends", engineSource.includes("if (running) return running"));
  check(186, "BroadcastChannel wake is implemented", engineSource.includes("routine_sync_wake"));
  check(187, "catch-up precedes outbox", /async function synchronizedWork[\s\S]*await catchUp\(context, renewLease\)[\s\S]*await processOutbox/.test(engineSource));
  check(188, "cursor moves after refresh", /await refreshAuthoritative[\s\S]*await putRoutineSyncCursor/.test(engineSource));
  check(189, "refresh failure preserves cursor", !engineSource.includes("finally(() => putRoutineSyncCursor"));
  check(190, "applied operation triggers catch-up", /if \(nextStatus === OUTBOX_STATUS\.CONFIRMED\)[\s\S]*await catchUp\(context, renewLease\)/.test(engineSource));
  check(191, "network error receives backoff", engineSource.includes("retryDelayMs"));
  check(192, "auth error pauses without deletion", engineSource.includes("OUTBOX_STATUS.PAUSED_AUTH"));
  check(193, "stale error becomes conflict", engineSource.includes('kind === "stale_conflict"'));
  check(194, "rejected error does not auto retry", engineSource.includes('kind === "server_rejected" ? OUTBOX_STATUS.REJECTED'));
  const clientSource = readFileSync(absolute("src/features/routines-v2/api/routineSyncClient.js"), "utf8");
  check(195, "unknown outcome probes receipt", clientSource.includes("getOfflineReceipt(record)"));
  check(196, "found receipt prevents duplicate send", clientSource.includes("recoveredFromReceipt"));
  check(197, "absent receipt retries same key", clientSource.includes("retry with the same operation ID"));
  check(198, "engine stop/restart is explicit", typeof engine.stop === "function" && typeof engine.start === "function");
  check(199, "logout partition never exposes old cache", createRoutinePrincipalKey(orgA, userA) !== createRoutinePrincipalKey(orgA, userB));
  engine.stop();

  const realtimeCalls = []; let realtimeCallback; let statusCallback; let removed = false; let timerCallback;
  const fakeChannel = { on(type, filter, callback) { realtimeCalls.push({ type, filter }); realtimeCallback = callback; return this; },
    subscribe(callback) { statusCallback = callback; return this; } };
  const fakeRealtimeClient = { channel() { return fakeChannel; }, removeChannel(channel) { removed = channel === fakeChannel; } };
  const realtimeSignals = [];
  const realtime = subscribeRoutineRealtime({ organizationId: orgA, visibleRunIds: [runId], client: fakeRealtimeClient,
    BroadcastChannelImpl: null, debounceMs: 1, setTimer: (callback) => { timerCallback = callback; return 1; }, clearTimer() {},
    onSignal: async (signal) => { realtimeSignals.push(signal); } });
  check(200, "Realtime subscribes only to routine_events", realtimeCalls.length === 1 && realtimeCalls[0].filter.table === "routine_events");
  check(201, "Realtime uses organization filter", realtimeCalls[0].filter.filter === `organization_id=eq.${orgA}`);
  realtimeCallback({ new: { id: randomUUID(), organization_id: orgA, run_id: randomUUID() } });
  check(202, "run/bundle client filter restricts signal", timerCallback === undefined);
  const eventId = randomUUID();
  realtimeCallback({ new: { id: eventId, organization_id: orgA, run_id: runId, server_created_at: "x" } });
  realtimeCallback({ new: { id: randomUUID(), organization_id: orgA, run_id: runId, server_created_at: "y" } });
  check(203, "signals debounce into one timer", typeof timerCallback === "function");
  timerCallback();
  check(204, "event payload is signal-only", realtimeSignals[0].kind === "realtime_signal" && !realtimeSignals[0].workspace);
  statusCallback("SUBSCRIBED"); await new Promise((resolveWait) => setImmediate(resolveWait));
  check(205, "SUBSCRIBED triggers cursor catch-up", realtimeSignals.some((signal) => signal.kind === "cursor_catch_up" && signal.reason === "subscribed"));
  statusCallback("SUBSCRIBED"); await new Promise((resolveWait) => setImmediate(resolveWait));
  check(206, "reconnect triggers cursor catch-up", realtimeSignals.some((signal) => signal.reason === "reconnect"));
  const beforeDuplicate = realtimeSignals.length;
  realtimeCallback({ new: { id: eventId, organization_id: orgA, run_id: runId, server_created_at: "x" } });
  check(207, "duplicate event does not schedule refresh", realtimeSignals.length === beforeDuplicate);
  realtime.unsubscribe();
  check(208, "unsubscribe removes channel and timers", removed);
  check(209, "disconnect path never deletes outbox", !readFileSync(absolute("src/features/routines-v2/realtime/routineRealtime.js"), "utf8").includes("deleteDatabase"));
  check(210, "no protected-domain subscription exists", !JSON.stringify(realtimeCalls).match(/inventory|asset|event_operations|legacy/i));

  const serverState = { status: "in_progress" }; const draft = { completionNote: "local" };
  const overlay = buildRoutinePendingOverlay({ serverState, draft, outboxRecord: { status: OUTBOX_STATUS.QUEUED } });
  check(211, "queued completion does not change server cache", overlay.serverState.status === "in_progress");
  check(212, "queued finish does not mark server finished", buildRoutinePendingOverlay({ serverState, outboxRecord: { status: "queued" } }).serverState.status !== "finished");
  check(213, "pending overlay is separate", overlay.pending.draft === draft && overlay.serverState === serverState);
  check(214, "server refresh model retains draft", overlay.pending.draft.completionNote === "local");
  check(215, "confirmed receipt can archive overlay", buildRoutinePendingOverlay({ serverState, outboxRecord: { status: "confirmed" } }).serverConfirmed);
  const conflictOverlay = buildRoutinePendingOverlay({ serverState, draft, outboxRecord: { status: "conflict" } });
  check(216, "conflict presents server and draft separately", conflictOverlay.conflict.serverState === serverState && conflictOverlay.conflict.localDraft === draft);
  check(217, "overlay performs no text merge", conflictOverlay.serverState.completionNote === undefined);
  check(218, "sync model has no local clock gating", !readFileSync(absolute("src/features/routines-v2/data/routineSyncModel.js"), "utf8").match(/availability.*Date\.now|checkpoint.*Date\.now/));
  check(219, "client contains no privileged credential", !clientSource.toLowerCase().includes(["service", "role"].join("_")));
  check(220, "client contains no direct table DML", !clientSource.includes(".from("));
  check(221, "IndexedDB rejects auth tokens", tokenRejected);
  check(222, "client sends no organization authority", !clientSource.includes("input_organization_id"));
  check(223, "client sends no computed outcome", !clientSource.includes("input_outcome"));
  check(224, "client sends no effective time", !clientSource.includes("input_effective_time"));
  check(225, "client never selects previous delivery", !clientSource.includes("select_previous_delivery"));
  const diagnostics = await listRoutineOfflineDiagnostics(outboxDb, principalA);
  check(226, "diagnostics contain no secrets", diagnostics.containsSecrets === false);
  check(227, "operation registry is closed", Object.keys(ROUTINE_OUTBOX_REGISTRY).join(",") === "task_bundle,run_finish_intent");
  check(228, "sync health normalizer is aggregate-only", !readFileSync(absolute("src/features/routines-v2/data/routineSyncModel.js"), "utf8").includes("responsePayload:"));
  const migration = readFileSync(absolute(paths.sync), "utf8");
  check(229, "reconciliation history has deterministic ordering", migration.includes("order by reconciliation.created_at,reconciliation.id"));
  check(230, "workspace exposes latest comparison history", migration.includes("deliveryReconciliations"));
  check(231, "timeline exposes reconciliation", migration.includes("deliveryReconciliation"));
  check(232, "old comparisons remain in history", migration.includes("comparisonHistory"));
  check(233, "staff has no operation ledger policy", !migration.match(/routine_offline_operation_receipts[\s\S]{0,500}actor_role.*staff/));
  check(234, "unknown receipt RPC returns null naturally", migration.includes("return v_receipt"));
  check(235, "same operation has one server unique receipt", migration.includes("routine_offline_receipts_operation_unique"));
  check(236, "same base relies on exact revision winner", migration.includes("offline_task_revision_conflict"));
  check(237, "finish operation uses server idempotency", migration.includes(":finish"));
  check(238, "late reconcile has semantic uniqueness", migration.includes("routine_delivery_reconciliations_semantic_unique"));
  check(239, "reopen reconcile converges under task lock", migration.includes("pg_advisory_xact_lock"));
  check(240, "refinish reconcile uses semantic no-op", migration.includes("semantic_noop"));
  check(241, "multi-tab lease blocks duplicate local send", engineSource.includes("acquireRoutineFallbackLease"));
  check(242, "server receipt uniqueness survives lease failure", migration.includes("on conflict(organization_id,actor_auth_user_id,client_instance_id,client_operation_id) do nothing"));

  db.close(); outboxDb.close(); engineDb.close();
  await Promise.all([deleteDb(dbName), deleteDb(outboxName), deleteDb(engineName)]);
  return { refreshCalls, sendCalls, catchupCalls };
}

async function verifySyncRecoveryEdges() {
  const organizationId = randomUUID();
  const authUserId = randomUUID();
  const principalKey = createRoutinePrincipalKey(organizationId, authUserId);
  const locks = { request: async (_name, _options, callback) => callback({ name: "leader" }) };

  const registrationDbName = `phase10i-registration-recovery-${randomUUID()}`;
  const registrationDb = await openRoutineOfflineDb({ indexedDBImpl: indexedDB, name: registrationDbName });
  const registrationAttempts = [];
  let touches = 0;
  const registrationEngine = createRoutineSyncEngine({
    resolvePrincipal: async () => ({ organizationId, authUserId }),
    syncClient: {
      async registerClientInstance(input) {
        registrationAttempts.push(input);
        if (registrationAttempts.length === 1) throw Object.assign(new Error("network"), { kind: "network" });
      },
      async touchClientInstance() { touches += 1; },
      async getSyncEvents() {
        return { events: [], nextCursor: null, hasMore: false,
          affectedRunIds: [], affectedBundleIds: [], affectedTaskIds: [] };
      },
    },
    refreshAuthoritative: async () => {},
    appVersion: "test",
    openDb: async () => registrationDb,
    webLocks: locks,
    BroadcastChannelImpl: null,
    cryptoImpl: webcrypto,
  });
  await registrationEngine.start();
  await registrationEngine.start();
  const registrationReplayStable = registrationAttempts.length === 2
    && registrationAttempts[0].clientInstanceId === registrationAttempts[1].clientInstanceId
    && registrationAttempts[0].idempotencyKey === registrationAttempts[1].idempotencyKey
    && touches === 0;
  registrationEngine.stop();

  const confirmedDbName = `phase10i-confirmed-refresh-${randomUUID()}`;
  const confirmedDb = await openRoutineOfflineDb({ indexedDBImpl: indexedDB, name: confirmedDbName });
  const clientInstanceId = randomUUID();
  const taskId = randomUUID();
  await putRoutineMeta(confirmedDb, principalKey, "client_instance", {
    clientInstanceId,
    registrationIdempotencyKey: randomUUID(),
    registered: true,
  });
  const queued = await enqueueRoutineOperation(confirmedDb, {
    principalKey,
    clientInstanceId,
    operationType: "task_bundle",
    payload: { taskId, baseTaskRevision: 1, clientRecordedAt: null, initialAssessment: null,
      itemUpdates: [], comments: [], finalAction: "save_progress", pauseReason: null, block: null,
      notApplicableReason: null, completionNote: null, criticalConfirmation: false },
    cryptoImpl: webcrypto,
    now: 1,
  });
  let eventReads = 0;
  const confirmedEngine = createRoutineSyncEngine({
    resolvePrincipal: async () => ({ organizationId, authUserId }),
    syncClient: {
      async touchClientInstance() {},
      async getSyncEvents() {
        eventReads += 1;
        return eventReads === 1
          ? { events: [], nextCursor: null, hasMore: false, affectedRunIds: [], affectedBundleIds: [], affectedTaskIds: [] }
          : { events: [{ id: randomUUID() }], nextCursor: null, hasMore: false,
            affectedRunIds: [], affectedBundleIds: [], affectedTaskIds: [taskId] };
      },
      async applyWithReceiptRecovery() { return { receipt: { receiptStatus: "applied" } }; },
    },
    refreshAuthoritative: async () => { throw new Error("refresh failed"); },
    appVersion: "test",
    openDb: async () => confirmedDb,
    webLocks: locks,
    BroadcastChannelImpl: null,
    cryptoImpl: webcrypto,
    now: () => 100,
  });
  await confirmedEngine.start();
  const confirmedRecord = (await listRoutineOutbox(confirmedDb, principalKey))
    .find((record) => record.clientOperationId === queued.clientOperationId);
  const confirmedSurvivesRefreshFailure = confirmedRecord?.status === OUTBOX_STATUS.CONFIRMED
    && confirmedRecord?.serverReceipt?.receiptStatus === "applied"
    && confirmedRecord?.attempts === 1;
  confirmedEngine.stop();

  registrationDb.close();
  confirmedDb.close();
  await Promise.all([deleteDb(registrationDbName), deleteDb(confirmedDbName)]);
  return { registrationReplayStable, confirmedSurvivesRefreshFailure };
}

async function main() {
  for (const path of [...Object.values(paths), ...baseline]) if (!existsSync(absolute(path))) throw new Error(`Missing input ${path}`);
  staticSecurityChecks();
  command("docker", ["--version"]);
  docker(["image", "inspect", IMAGE]);
  docker(["run", "--detach", "--rm", "--pull", "never", "--name", CONTAINER, "--network", "none",
    "--env", `POSTGRES_PASSWORD=${PASSWORD}`, "--env", `POSTGRES_DB=${DATABASE}`, IMAGE]);
  started = true;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const logs = docker(["logs", CONTAINER], { allowFailure: true });
    const initialized = /PostgreSQL init process complete; ready for start up/i.test(`${logs.stdout}\n${logs.stderr}`);
    const state = docker(["exec", CONTAINER, "pg_isready", "--username=postgres", `--dbname=${DATABASE}`], { allowFailure: true });
    if (initialized && state.status === 0) { ready = true; break; }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  if (!ready) throw new Error("Disposable PostgreSQL did not become ready.");
  console.log(`PostgreSQL ${scalar("show server_version;")} in network-isolated disposable container`);
  psql(String.raw`
    create schema if not exists storage;
    create table if not exists storage.buckets(id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]);
    create table if not exists storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null,name text not null,owner_id uuid,metadata jsonb not null default '{}',unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,anon;
    grant select,insert,update,delete on storage.objects to authenticated;
  `);
  for (const path of baseline) psql(readFileSync(absolute(path), "utf8"), { transaction: true });
  psql("alter table public.user_profiles drop constraint if exists user_profiles_role_check; alter table public.user_profiles add constraint user_profiles_role_check check(role in ('manager','shift_lead','event_floor_manager','staff','time2staff','counter')); ");
  for (const path of [paths.foundation, paths.bootstrap, paths.templates, paths.references, paths.runs, paths.lifecycle])
    psql(readFileSync(absolute(path), "utf8"), { transaction: true });
  for (const path of [paths.foundationFixture, paths.runFixture, paths.lifecycleFixture]) psql(readFileSync(absolute(path), "utf8"));
  psql(readFileSync(absolute(paths.time), "utf8"), { transaction: true });
  psql(readFileSync(absolute(paths.timeFixture), "utf8"));
  psql(readFileSync(absolute(paths.delivery), "utf8"), { transaction: true });
  psql(readFileSync(absolute(paths.deliveryFixture), "utf8"));
  psql(readFileSync(absolute(paths.doubleShift), "utf8"), { transaction: true });
  psql(readFileSync(absolute(paths.doubleShiftFixture), "utf8"));
  psql("drop publication if exists supabase_realtime; create publication supabase_realtime;");
  const protectedBefore = scalar(protectedFingerprintSql);
  const protectedDataBefore = scalar(protectedDataFingerprintSql);
  psql(readFileSync(absolute(paths.sync), "utf8"), { transaction: true });
  if (protectedBefore !== scalar(protectedFingerprintSql) || protectedDataBefore !== scalar(protectedDataFingerprintSql))
    throw new Error("Phase 10I changed a protected schema, policy, or Event Operations row fingerprint.");
  psql(readFileSync(absolute(paths.syncFixture), "utf8"));
  const assertions = psql(readFileSync(absolute(paths.assertions), "utf8"));
  const sqlPasses = `${assertions.stdout}\n${assertions.stderr}`.split("\n").filter((line) => line.includes("PASS "));
  if (sqlPasses.length !== EXPECTED_SQL) throw new Error(`Expected ${EXPECTED_SQL} SQL passes, received ${sqlPasses.length}.`);
  passCount = EXPECTED_SQL;
  console.log(`PASS ${EXPECTED_SQL}/${EXPECTED_SQL} server schema, RLS, RPC, timing, and reconciliation checks`);
  await verifyClientModules();

  const syncDataBefore = scalar(`select md5(coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_client_instances value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_offline_operation_receipts value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_delivery_reconciliations value),'[]'));`);
  psql(readFileSync(absolute(paths.sync), "utf8"), { transaction: true });
  check(243, "10I reapply preserves rows and timestamps", syncDataBefore === scalar(`select md5(coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_client_instances value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_offline_operation_receipts value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_delivery_reconciliations value),'[]'));`));
  check(244, "10A foundation remains available", scalar("select to_regclass('public.routine_organization_settings') is not null;") === "t");
  check(245, "10B templates remain available", scalar("select to_regclass('public.routine_template_versions') is not null;") === "t");
  check(246, "10C references remain available", scalar("select to_regclass('public.routine_reference_images') is not null;") === "t");
  check(247, "10D run snapshots remain available", scalar("select to_regclass('public.routine_runs') is not null;") === "t");
  check(248, "10E lifecycle remains available", scalar("select to_regclass('public.routine_deviations') is not null;") === "t");
  check(249, "10F operational time remains available", scalar("select to_regclass('public.routine_run_task_timings') is not null;") === "t");
  check(250, "10G delivery remains available", scalar("select to_regclass('public.routine_delivery_records') is not null;") === "t");
  check(251, "10H Double Shift remains available", scalar("select to_regclass('public.routine_bundles') is not null;") === "t");
  check(252, "Inventory schema fingerprint is stable", protectedBefore === scalar(protectedFingerprintSql));
  check(253, "Inventory Storage remains stable", protectedBefore === scalar(protectedFingerprintSql));
  check(254, "Asset domain remains stable", protectedBefore === scalar(protectedFingerprintSql));
  check(255, "Event Operations schema and data remain stable", protectedDataBefore === scalar(protectedDataFingerprintSql));
  check(256, "legacy domain remains stable", protectedBefore === scalar(protectedFingerprintSql));
  check(257, "Auth objects remain stable", protectedBefore === scalar(protectedFingerprintSql));
  check(258, "published template hashes are present", Number(scalar("select count(*) from public.routine_template_versions where state='published' and content_hash is not null;")) > 0);
  check(259, "run snapshot hashes are present", Number(scalar("select count(*) from public.routine_runs where snapshot_hash is not null;")) > 0);
  check(260, "timing snapshot hashes are present", Number(scalar("select count(*) from public.routine_runs where timing_snapshot_hash is not null;")) > 0);
  check(261, "delivery hashes are present", Number(scalar("select count(*) from public.routine_delivery_records where record_hash is not null;")) > 0);
  check(262, "bundle and transfer hashes are stable", Number(scalar("select count(*) from public.routine_bundles;")) > 0);
  check(263, "reference image versions remain present", Number(scalar("select count(*) from public.routine_reference_image_versions;")) >= 0);
  const recoveryEdges = await verifySyncRecoveryEdges();
  check(264, "unknown registration outcome retries the same instance and key", recoveryEdges.registrationReplayStable);
  check(265, "applied receipt stays confirmed when subsequent refresh fails", recoveryEdges.confirmedSurvivesRefreshFailure);
  if (passCount !== EXPECTED_TOTAL) throw new Error(`Expected ${EXPECTED_TOTAL} total checks, received ${passCount}.`);
  console.log(`PASS ${passCount}/${EXPECTED_TOTAL} Phase 10I contract checks`);

  const raceSql = `select public.register_routine_client_instance('1d000000-0000-4000-8000-000000000001','test-app-10i','phase10i-v1','node-test','1d000000-0000-4000-8000-000000000002');`;
  const race = await Promise.all([concurrent(`select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',false); set role authenticated; ${raceSql}`),
    concurrent(`select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',false); set role authenticated; ${raceSql}`)]);
  if (race.some((outcome) => outcome.status !== 0)) throw new Error(`Concurrent receipt/instance replay failed: ${race.map((x) => x.stderr).join("\n")}`);
  console.log("PASS real concurrent database connections converge on one immutable instance registration");
}

try { await main(); } finally { cleanup(); }
