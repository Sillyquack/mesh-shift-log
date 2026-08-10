import { createHash, randomBytes, randomInt, randomUUID, webcrypto } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { indexedDB } from "fake-indexeddb";
import {
  ROUTINE_OPERATOR_SECRET_BYTES,
  ROUTINE_OPERATOR_TOKEN_VERSION,
  createSharedDeviceOperatorPrincipalKey,
  mapRoutineOperatorAuthError,
  normalizeRoutineOperatorSession,
} from "../src/features/routines-v2/data/routineOperatorIdentity.js";
import {
  clearRoutineOperatorSession,
  createRoutineOperatorSessionMaterial,
  getRoutineOperatorPrincipalMetadata,
  restoreRoutineOperatorSession,
  routineOperatorSessionStorageKey,
  setRoutineOperatorSession,
} from "../src/features/routines-v2/auth/routineOperatorSession.js";
import {
  OUTBOX_STATUS,
  ROUTINE_OFFLINE_SCHEMA_LABEL,
  ROUTINE_OFFLINE_SCHEMA_VERSION,
  SYNC_ENGINE_STATUS,
  assertRoutinePayloadSafe,
  createRoutinePrincipalKey,
} from "../src/features/routines-v2/data/routineSyncModel.js";
import {
  getRoutineDraft,
  listRoutineOutbox,
  openRoutineOfflineDb,
  putRoutineDraft,
} from "../src/features/routines-v2/offline/routineOfflineDb.js";
import { enqueueRoutineOperation } from "../src/features/routines-v2/offline/routineOutbox.js";
import { createRoutineSyncEngine } from "../src/features/routines-v2/offline/routineSyncEngine.js";
import { ROUTINE_REALTIME_MODE, subscribeRoutineRealtime } from "../src/features/routines-v2/realtime/routineRealtime.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IMAGE = "public.ecr.aws/supabase/postgres:17.6.1.141";
const DATABASE = "phase10j_routine_identity_test";
const ROLE = "supabase_admin";
const CONTAINER = `mesh-shift-log-phase10j-${process.pid}-${randomUUID().slice(0, 8)}`;
const PASSWORD = `phase10j-${randomUUID()}`;
const MINIMUM_CHECKS = 317;
const EXPECTED_SQL_CHECKS = 80;
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
  identity: "supabase/phase10j_routine_shared_device_identity.sql",
  identityAlignment: "supabase/phase10t_routine_participant_identity_conflict_alignment.sql",
  operationConvergence: "supabase/phase10u_routine_operation_idempotency_convergence.sql",
  creationProvenance: "supabase/phase10v_routine_creation_idempotency_provenance_alignment.sql",
  foundationFixture: "supabase/tests/phase10/foundation-fixtures.sql",
  runFixture: "supabase/tests/phase10/run-snapshot-fixtures.sql",
  lifecycleFixture: "supabase/tests/phase10/lifecycle-fixtures.sql",
  timeFixture: "supabase/tests/phase10/operational-time-fixtures.sql",
  deliveryFixture: "supabase/tests/phase10/delivery-fixtures.sql",
  doubleShiftFixture: "supabase/tests/phase10/double-shift-fixtures.sql",
  syncFixture: "supabase/tests/phase10/sync-offline-fixtures.sql",
  identityFixture: "supabase/tests/phase10/shared-device-fixtures.sql",
  assertions: "supabase/tests/phase10/shared-device-assertions.sql",
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

function check(label, condition) {
  if (!condition) throw new Error(`FAIL ${String(passCount + 1).padStart(3, "0")} ${label}`);
  passCount += 1;
  console.log(`PASS ${String(passCount).padStart(3, "0")} ${label}`);
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
function psqlVariables(values) {
  return Object.entries(values).map(([key, value]) => {
    if (!/^[a-z_]+$/.test(key) || !/^[A-Za-z0-9_.-]+$/.test(value)) throw new Error("Unsafe verifier variable.");
    return `\\set ${key} ${value}`;
  }).join("\n") + "\n";
}
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
  if (!/^mesh-shift-log-phase10j-[0-9]+-[a-f0-9]{8}$/.test(CONTAINER)) throw new Error("Unsafe verifier container name.");
  docker(["rm", "--force", CONTAINER], { allowFailure: true, timeout: 30_000 });
  started = false;
}
process.once("SIGINT", () => { cleanup(); process.exit(130); });
process.once("SIGTERM", () => { cleanup(); process.exit(143); });

function validPin() {
  const forbidden = /^(\d)\1+$|^(123456|654321|000000|111111|121212|112233)$/;
  let pin;
  do { pin = String(randomInt(700_000, 900_000)); } while (forbidden.test(pin));
  return pin;
}
function sessionMaterial(sessionId = randomUUID()) {
  const secret = randomBytes(32);
  return { sessionId, secretHash: createHash("sha256").update(secret).digest("hex"),
    token: `v1.${sessionId}.${secret.toString("base64url")}` };
}
function safeDiagnostic(value) {
  return String(value ?? "")
    .replace(/v1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}/gi, "[REDACTED_OPERATOR_TOKEN]")
    .replace(/\b[0-9]{6,12}\b/g, "[REDACTED_NUMERIC_SECRET]");
}

const protectedSchemaFingerprintSql = String.raw`
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
 union all select 'f|'||namespace.nspname||'.'||procedure.proname||'|'||pg_get_function_identity_arguments(procedure.oid)||'|'||pg_get_functiondef(procedure.oid)
  from pg_catalog.pg_proc procedure join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
  where namespace.nspname in('auth','storage') or (namespace.nspname='public' and
    (procedure.proname like 'inventory_%' or procedure.proname like 'asset_%' or procedure.proname like 'event_%'
      or procedure.proname like 'external_calendar_%'))
) select md5(coalesce(string_agg(entry,E'\n' order by entry),'')) from entries;`;

const protectedDataFingerprintSql = String.raw`select md5(
 coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.event_operations value),'[]')||
 coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.event_role_assignments value),'[]')||
 coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.event_responsibility_handovers value),'[]')||
 coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.external_calendar_events value),'[]'));`;

const routineHistoryFingerprintSql = String.raw`select md5(
 coalesce((select jsonb_agg(jsonb_build_array(id,content_hash) order by id)::text from public.routine_template_versions),'[]')||
 coalesce((select jsonb_agg(jsonb_build_array(id,snapshot_hash,timing_snapshot_hash) order by id)::text from public.routine_runs),'[]')||
 coalesce((select jsonb_agg(jsonb_build_array(id,record_hash,delivery_schema_version) order by id)::text from public.routine_delivery_records),'[]')||
 coalesce((select jsonb_agg(jsonb_build_array(id,item_hash,item_schema_version) order by id)::text from public.routine_delivery_items),'[]')||
 coalesce((select jsonb_agg(jsonb_build_array(id,creation_request_hash) order by id)::text from public.routine_bundles),'[]')||
 coalesce((select jsonb_agg(jsonb_build_array(id,run_snapshot_hash_snapshot,timing_snapshot_hash_snapshot,template_content_hash_snapshot) order by id)::text from public.routine_bundle_runs),'[]')||
 coalesce((select jsonb_agg(jsonb_build_array(id,acceptance_hash) order by id)::text from public.routine_event_transfer_acceptances),'[]')||
 coalesce((select jsonb_agg(jsonb_build_array(id,completion_hash) order by id)::text from public.routine_event_transfer_completions),'[]'));`;

function staticSecurityChecks() {
  const migration = readFileSync(absolute(paths.identity), "utf8");
  const clientPaths = [
    "src/features/routines-v2/data/routineOperatorIdentity.js",
    "src/features/routines-v2/auth/routineOperatorSession.js",
    "src/features/routines-v2/api/routineRpcClient.js",
    "src/features/routines-v2/api/routineOperatorClient.js",
    "src/features/routines-v2/data/routineSyncModel.js",
    "src/features/routines-v2/offline/routineOutbox.js",
    "src/features/routines-v2/offline/routineSyncEngine.js",
    "src/features/routines-v2/realtime/routineRealtime.js",
  ];
  const clients = clientPaths.map((path) => readFileSync(absolute(path), "utf8")).join("\n");
  const combined = `${migration}\n${clients}`;
  const forbiddenMarkers = [["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_"),
    ["jzueg", "kbzgyn", "knnvivhia"].join(""), ["koala", "frog"].join("")];
  if (forbiddenMarkers.some((marker) => combined.toLowerCase().includes(marker.toLowerCase()))
      || /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./.test(combined)) {
    throw new Error("Production credential, project, or forbidden environment marker found.");
  }
  if (/\bexecute\s+(?:format|immediate)/i.test(migration)) throw new Error("Dynamic SQL is forbidden in Phase 10J.");
  if (/\b(?:insert\s+into|update|delete\s+from|alter\s+table)\s+public\.(?:inventory_|asset_|event_operations|event_role_assignments|event_responsibility_handovers|external_calendar_)/i.test(migration)) {
    throw new Error("Phase 10J mutates a protected domain.");
  }
  const policies = [...migration.matchAll(/create\s+policy\b[\s\S]*?;/gi)].map((match) => match[0]).join("\n");
  if (/using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\)|organization_id\s+is\s+null/i.test(policies)) {
    throw new Error("Broad or nullable-organization RLS found.");
  }
  if (/grant\s+(?:insert|update|delete)[\s\S]{0,200}\bto\s+authenticated/i.test(migration)) {
    throw new Error("Direct authenticated DML grant found.");
  }
  console.log("PASS static production-boundary, protected-domain, RLS, credential, and dynamic-SQL checks");
}

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  get length() { return this.values.size; }
}
function deleteDb(name) {
  return new Promise((resolvePromise, rejectPromise) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolvePromise(); request.onerror = () => rejectPromise(request.error);
  });
}

async function verifyBrowserContracts() {
  const org = "a1000000-0000-4000-8000-000000000001";
  const deviceUser = "1e000000-0000-4000-8000-000000000001";
  const operatorA = "4e000000-0000-4000-8000-000000000001";
  const operatorB = "4e000000-0000-4000-8000-000000000002";
  const material = await createRoutineOperatorSessionMaterial(webcrypto);
  check("browser session material uses token v1", material.token.startsWith(`${ROUTINE_OPERATOR_TOKEN_VERSION}.`));
  check("browser session secret has 32-byte base64url representation", material.token.split(".")[2].length === 43 && ROUTINE_OPERATOR_SECRET_BYTES === 32);
  check("browser session digest is SHA-256 hex", /^[0-9a-f]{64}$/.test(material.secretHash));
  check("browser token contains its generated session UUID", material.token.split(".")[1] === material.sessionId);
  const storage = new MemoryStorage();
  const principalA = setRoutineOperatorSession({ token: material.token, organizationId: org, deviceAuthUserId: deviceUser,
    operatorId: operatorA, sessionMetadata: { status: "active" } }, { storage });
  check("operator session is persisted only in supplied session storage", storage.length === 1 && storage.getItem(routineOperatorSessionStorageKey()).includes("v1."));
  check("exported principal metadata contains no session token", !JSON.stringify(principalA).includes(material.token));
  check("shared principal key includes organization, device auth, and operator", principalA.principalKey === `${org}:${deviceUser}:operator:${operatorA}`);
  check("memory principal matches stored operator", getRoutineOperatorPrincipalMetadata().operatorId === operatorA);
  clearRoutineOperatorSession({ storage });
  check("session clear removes memory and tab storage", storage.length === 0 && getRoutineOperatorPrincipalMetadata() === null);
  let unsafeMetadataRejected = false;
  try { setRoutineOperatorSession({ token: material.token, organizationId: org, deviceAuthUserId: deviceUser,
    operatorId: operatorA, sessionMetadata: { pin: "redacted-test-value" } }, { storage }); } catch { unsafeMetadataRejected = true; }
  check("session metadata rejects PIN and credential material", unsafeMetadataRejected && storage.length === 0);
  storage.setItem(routineOperatorSessionStorageKey(), "not-json");
  check("malformed tab session is rejected", restoreRoutineOperatorSession({ storage }) === null && storage.length === 0);
  check("principal factory separates two operators on one device",
    createSharedDeviceOperatorPrincipalKey(org, deviceUser, operatorA) !== createSharedDeviceOperatorPrincipalKey(org, deviceUser, operatorB));

  const rpcSource = readFileSync(absolute("src/features/routines-v2/api/routineRpcClient.js"), "utf8");
  check("operator token uses the dedicated Routine RPC header", rpcSource.includes("setHeader(ROUTINE_OPERATOR_SESSION_HEADER, token)"));
  check("operator token is not placed in an RPC payload", !rpcSource.match(/payload[^\n]*token|token[^\n]*payload/i));
  check("pre-session RPC sends no operator header", rpcSource.includes("operatorSession === false ? null"));
  check("successful RPC does not clear the operator token", rpcSource.includes("result?.error && token"));
  check("invalid operator session clears tab token instead of falling back", rpcSource.includes("clearToken()") && !rpcSource.includes("device_identity_fallback"));
  check("operator auth error classification is stable", mapRoutineOperatorAuthError(new Error("operator session expired")) === "operator_auth_required");
  check("freshness error classification is stable", mapRoutineOperatorAuthError(new Error("operator_reauthentication_required")) === "operator_reauthentication_required");
  const normalized = normalizeRoutineOperatorSession({ sessionId: material.sessionId, status: "active",
    credential_fresh_until: "2026-08-06T10:00:00Z", operator: { operatorId: operatorA, active: true } });
  check("session read model maps server credential freshness", normalized.credentialFreshUntil === "2026-08-06T10:00:00Z");

  const dbName = `phase10j-idb-${randomUUID()}`;
  const db = await openRoutineOfflineDb({ indexedDBImpl: indexedDB, name: dbName });
  check("offline schema upgraded for operator isolation", db.version === ROUTINE_OFFLINE_SCHEMA_VERSION && ROUTINE_OFFLINE_SCHEMA_LABEL === "phase10j-v1");
  const keyA = createSharedDeviceOperatorPrincipalKey(org, deviceUser, operatorA);
  const keyB = createSharedDeviceOperatorPrincipalKey(org, deviceUser, operatorB);
  await putRoutineDraft(db, { principalKey: keyA, draftKey: "task-a", resourceType: "task", resourceId: randomUUID(),
    payload: { note: "operator A" }, createdAt: 1, updatedAt: 1, expiresAt: 9_999_999 });
  check("operator B cannot read operator A draft", await getRoutineDraft(db, keyB, "task-a") === null);
  check("operator A can resume its own draft", (await getRoutineDraft(db, keyA, "task-a")).payload.note === "operator A");
  let secretRejected = false;
  try { await putRoutineDraft(db, { principalKey: keyA, draftKey: "secret", payload: { session_token: material.token } }); }
  catch { secretRejected = true; }
  check("session token is rejected from IndexedDB", secretRejected);
  let pinRejected = false;
  try { assertRoutinePayloadSafe({ pin: "runtime-only" }); } catch { pinRejected = true; }
  check("PIN is rejected from offline payloads", pinRejected);
  const clientInstanceId = randomUUID(); const taskId = randomUUID();
  const payload = { taskId, baseTaskRevision: 1, clientRecordedAt: null, initialAssessment: null, itemUpdates: [], comments: [],
    finalAction: "save_progress", pauseReason: null, block: null, notApplicableReason: null, completionNote: null, criticalConfirmation: false };
  const queued = await enqueueRoutineOperation(db, { principalKey: keyA, clientInstanceId, operationType: "task_bundle", payload,
    actorSource: "shared_device_operator", effectiveOperatorId: operatorA, cryptoImpl: webcrypto, now: 10 });
  check("shared noncritical draft bundle queues with operator identity", queued.status === OUTBOX_STATUS.QUEUED && queued.effectiveOperatorId === operatorA);
  let finishRejected = false;
  try { await enqueueRoutineOperation(db, { principalKey: keyA, clientInstanceId, operationType: "run_finish_intent",
    payload: { runId: randomUUID(), baseRunRevision: 1 }, actorSource: "shared_device_operator", effectiveOperatorId: operatorA }); }
  catch { finishRejected = true; }
  check("shared run finish is online only", finishRejected);
  let criticalRejected = false;
  try { await enqueueRoutineOperation(db, { principalKey: keyA, clientInstanceId, operationType: "task_bundle", payload: { ...payload, finalAction: "complete" },
    actorSource: "shared_device_operator", effectiveOperatorId: operatorA, critical: true }); } catch { criticalRejected = true; }
  check("critical shared completion cannot enter outbox", criticalRejected);

  let channelCalls = 0; const eventHandlers = new Map(); const timers = [];
  const windowImpl = { addEventListener(name, fn) { eventHandlers.set(name, fn); }, removeEventListener(name) { eventHandlers.delete(name); } };
  const pollingSignals = [];
  const polling = subscribeRoutineRealtime({ organizationId: org, mode: ROUTINE_REALTIME_MODE.CURSOR_POLLING,
    client: { channel() { channelCalls += 1; } }, BroadcastChannelImpl: null, windowImpl,
    setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer() {}, onSignal: async (signal) => { pollingSignals.push(signal); } });
  await new Promise((resolveWait) => setImmediate(resolveWait));
  check("shared polling creates no Postgres Changes channel", channelCalls === 0 && polling.channel === null);
  check("shared polling catches up at session start", pollingSignals.some((signal) => signal.reason === "session_start"));
  eventHandlers.get("focus")?.(); eventHandlers.get("online")?.(); await new Promise((resolveWait) => setImmediate(resolveWait));
  check("shared polling catches up on focus", pollingSignals.some((signal) => signal.reason === "focus"));
  check("shared polling catches up on reconnect", pollingSignals.some((signal) => signal.reason === "reconnect"));
  polling.unsubscribe();
  check("shared polling removes focus and reconnect handlers", eventHandlers.size === 0);

  const realtimeEvents = []; const fakeChannel = { on(_kind, filter) { realtimeEvents.push(filter); return this; }, subscribe() { return this; } };
  const personal = subscribeRoutineRealtime({ organizationId: org, client: { channel() { channelCalls += 1; return fakeChannel; }, removeChannel() {} },
    BroadcastChannelImpl: null });
  check("personal principal retains Postgres Realtime", personal.mode === ROUTINE_REALTIME_MODE.POSTGRES_REALTIME && realtimeEvents[0].table === "routine_events");
  personal.unsubscribe();
  check("Realtime never subscribes to protected domains", !JSON.stringify(realtimeEvents).match(/inventory|asset|event_operations/i));

  const engineDbName = `phase10j-engine-${randomUUID()}`;
  const engineDb = await openRoutineOfflineDb({ indexedDBImpl: indexedDB, name: engineDbName });
  let currentOperator = operatorA; const statuses = []; let registrations = 0;
  const engine = createRoutineSyncEngine({ resolvePrincipal: async () => ({ organizationId: org, authUserId: deviceUser,
    operatorId: currentOperator, actorSource: "shared_device_operator" }), syncClient: {
    async registerClientInstance() { registrations += 1; }, async touchClientInstance() {},
    async getSyncEvents() { return { events: [], nextCursor: null, hasMore: false, affectedRunIds: [], affectedBundleIds: [], affectedTaskIds: [] }; },
  }, refreshAuthoritative: async () => {}, appVersion: "test", openDb: async () => engineDb,
  webLocks: { request: async (_name, _options, callback) => callback({}) }, BroadcastChannelImpl: null,
  cryptoImpl: webcrypto, onStatus: (status) => statuses.push(status) });
  await engine.start();
  currentOperator = operatorB; await engine.runOnce();
  check("operator switch reuses device-level client instance", registrations === 1);
  let oldPrincipalQuarantined = false;
  try { await getRoutineDraft(engineDb, keyA, "task-a"); } catch { oldPrincipalQuarantined = true; }
  check("operator switch quarantines previous principal", oldPrincipalQuarantined);
  check("shared sync status identifies cursor transport without secret", statuses.some((status) => status.transportMode === "cursor_polling")
    && !JSON.stringify(statuses).includes(material.token));
  engine.stop({ quarantine: true });
  check("sync stop reaches stopped state", statuses.some((status) => status.status === SYNC_ENGINE_STATUS.STOPPED));

  const paused = [];
  const unauthenticatedEngine = createRoutineSyncEngine({ resolvePrincipal: async () => ({ organizationId: org, authUserId: deviceUser,
    actorSource: "shared_device_operator" }), syncClient: {}, refreshAuthoritative: async () => {}, openDb: async () => engineDb,
    BroadcastChannelImpl: null, onStatus: (status) => paused.push(status) });
  await unauthenticatedEngine.start();
  check("shared device without operator pauses instead of falling back", paused.some((status) => status.status === SYNC_ENGINE_STATUS.PAUSED_AUTH));
  unauthenticatedEngine.stop();

  db.close(); engineDb.close();
  await Promise.all([deleteDb(dbName), deleteDb(engineDbName)]);
}

function verifyCatalogContracts() {
  const columns = {
    routine_shared_devices: ["id","organization_id","auth_user_id","user_profile_id","device_key","label","active","absolute_session_minutes",
      "idle_timeout_minutes","critical_reauth_minutes","max_failed_attempts","failure_window_minutes","lockout_minutes",
      "allow_offline_noncritical_drafts","revision","creation_idempotency_key","creation_request_hash","created_at","created_by_auth_user_id","updated_at","updated_by_auth_user_id"],
    routine_operators: ["id","organization_id","operator_key","operator_type","linked_user_profile_id","display_name","effective_role","active",
      "valid_from","valid_until","revision","creation_idempotency_key","creation_request_hash","created_at","created_by_auth_user_id","updated_at","updated_by_auth_user_id"],
    routine_shared_device_operator_access: ["id","organization_id","shared_device_id","operator_id","active","valid_from","valid_until","sort_order",
      "allow_task_actions","allow_critical_actions","allow_run_coordination","allow_event_transfer_actions","allow_offline_noncritical","revision",
      "created_at","created_by_auth_user_id","updated_at","updated_by_auth_user_id"],
    routine_operator_credentials: ["id","organization_id","operator_id","credential_version","status","pin_hash","hash_algorithm","hash_cost","valid_from",
      "expires_at","must_rotate","created_at","created_by_auth_user_id","revoked_at","revoked_by_auth_user_id","revocation_reason"],
    routine_operator_auth_throttles: ["id","organization_id","subject_type","shared_device_id","operator_id","failed_attempt_count","window_started_at",
      "locked_until","last_failed_at","revision","updated_at"],
    routine_operator_auth_attempts: ["id","organization_id","shared_device_id","operator_id","client_instance_id","device_auth_user_id","outcome","failure_code","attempted_at"],
    routine_operator_sessions: ["id","organization_id","shared_device_id","client_instance_id","device_auth_user_id","device_user_profile_id","operator_id",
      "credential_id","linked_user_profile_id_snapshot","display_name_snapshot","role_snapshot","operator_revision_snapshot","access_revision_snapshot",
      "session_secret_hash","token_version","status","authenticated_at","last_credential_verified_at","last_seen_at","expires_at","idle_expires_at",
      "ended_at","ended_by_auth_user_id","end_reason","revoked_at","revoked_by_auth_user_id","revocation_reason","revision","created_at","updated_at"],
    routine_operator_operations: ["id","organization_id","actor_auth_user_id","effective_operator_id","operator_session_id","operation_type",
      "idempotency_key","request_hash","resource_type","resource_id","response_payload","created_at"],
    routine_operator_events: ["id","organization_id","shared_device_id","operator_id","operator_session_id","event_type","actor_auth_user_id",
      "actor_profile_id","actor_name_snapshot","payload","operation_id","created_at"],
  };
  for (const [table, expectedColumns] of Object.entries(columns)) {
    for (const column of expectedColumns) check(`${table}.${column} exists`, scalar(`select exists(select 1 from information_schema.columns where table_schema='public' and table_name='${table}' and column_name='${column}');`) === "t");
  }
  const functions = [
    "register_routine_shared_device","update_routine_shared_device","set_routine_shared_device_active","create_routine_operator",
    "update_routine_operator","set_routine_operator_active","rotate_routine_operator_pin","revoke_routine_operator_credential",
    "replace_routine_shared_device_operator_access","revoke_routine_operator_session","get_routine_operator_admin_workspace",
    "list_available_routine_operators","authenticate_routine_operator","get_current_routine_operator_session","touch_routine_operator_session",
    "reauthenticate_routine_operator_session","end_routine_operator_session","get_routine_shared_device_context",
    "get_routine_operator_session_context","get_routine_operator_security_history","routine_resolve_effective_actor","routine_resolve_actor",
    "routine_current_authenticated_profile_id","routine_current_effective_profile_id","routine_current_effective_operator_id",
    "routine_current_shared_device_id","routine_current_operator_session_id","routine_current_actor_source","routine_current_actor_display_name",
    "routine_current_user_can_manage_templates","routine_current_user_can_coordinate_runs","routine_current_user_can_perform_tasks",
    "routine_run_is_visible","routine_bundle_is_visible","routine_require_fresh_operator_credential","join_routine_run",
    "get_routine_sync_events","get_routine_offline_operation_receipt","routine_delivery_item_canonical_json",
    "routine_delivery_record_canonical_json","routine_current_user_event_transfer_authority","routine_event_transfer_is_visible",
  ];
  for (const name of functions) check(`${name} is installed`, scalar(`select exists(select 1 from pg_proc procedure join pg_namespace namespace on namespace.oid=procedure.pronamespace where namespace.nspname='public' and procedure.proname='${name}');`) === "t");
  const rlsTables = Object.keys(columns);
  for (const table of rlsTables) check(`${table} has RLS enabled`, scalar(`select relrowsecurity from pg_class where oid='public.${table}'::regclass;`) === "t");
  check("Phase 10V removes only the four resource provenance uniqueness constraints",
    scalar("select count(*) from pg_constraint where conname in('routine_runs_org_creation_idempotency_unique','routine_run_participants_org_idempotency_unique','routine_bundles_org_idempotency_unique','routine_bundle_participants_idempotency_unique');") === "0"
      && scalar("select count(*) from pg_constraint where conname in('routine_shared_devices_org_idempotency_unique','routine_operators_org_idempotency_unique');") === "2");
  const privateFunctions = ["routine_resolve_effective_actor()", "routine_operator_credential_is_fresh(uuid)",
    "routine_require_fresh_operator_credential(text,uuid)", "routine_event_transfer_is_visible(uuid,uuid)"];
  for (const signature of privateFunctions) check(`${signature} has no direct authenticated execute`,
    scalar(`select not has_function_privilege('authenticated','public.${signature}','execute');`) === "t");
}

function verifyTokenParserContracts(pin) {
  const validShape = `v1.${randomUUID()}.${"A".repeat(43)}`;
  const invalidTokens = [
    ["token version is exact", validShape.replace(/^v1/, "v2")],
    ["extra token segment is rejected", `${validShape}.extra`],
    ["missing token segment is rejected", validShape.slice(0, validShape.lastIndexOf("."))],
    ["invalid token UUID is rejected", `v1.not-a-uuid.${"A".repeat(43)}`],
    ["invalid token base64url is rejected", `v1.${randomUUID()}.${"!".repeat(43)}`],
    ["overlong token is rejected", `${validShape}${"A".repeat(20)}`],
  ];
  for (const [label, token] of invalidTokens) {
    const result = psql(`select * from public.routine_parse_operator_session_token('${token}');`, { allowFailure: true });
    check(label, result.status !== 0 && /operator_auth_failed/.test(result.stderr));
  }
  const unknownOperatorResult = psql(psqlVariables({ test_pin: pin, session_secret_hash: sessionMaterial().secretHash }) +
    `select set_config('request.jwt.claim.sub','1e000000-0000-4000-8000-000000000001',false); set role authenticated;
     select public.authenticate_routine_operator('1e200000-0000-4000-8000-000000000001','4e000000-0000-4000-8000-000000000099',
       '${randomUUID()}',:'session_secret_hash',:'test_pin','${randomUUID()}')->>'authenticated';`, { tuplesOnly: true });
  check("unknown operator authentication returns the generic result", unknownOperatorResult.stdout.trim().split("\n").at(-1) === "false");
  check("unknown operator attempt stores no foreign operator identity", scalar("select operator_id is null from public.routine_operator_auth_attempts order by attempted_at desc,id desc limit 1;") === "t");
}

async function verifyConcurrency(pin, operatorId) {
  const clientId = "1e200000-0000-4000-8000-000000000003";
  psql(`select set_config('request.jwt.claim.sub','1e000000-0000-4000-8000-000000000001',false); set role authenticated;
    select public.register_routine_client_instance('${clientId}','phase10j-test','phase10j-v1','node-race','1e200000-0000-4000-8000-000000000004');`);
  const first = sessionMaterial(); const second = sessionMaterial();
  const authSql = (material) => psqlVariables({ test_pin: pin, session_secret_hash: material.secretHash }) +
    `select set_config('request.jwt.claim.sub','1e000000-0000-4000-8000-000000000001',false); set role authenticated;
     select public.authenticate_routine_operator('${clientId}','${operatorId}','${material.sessionId}',:'session_secret_hash',:'test_pin','${randomUUID()}');`;
  const authRace = await Promise.all([concurrent(authSql(first)), concurrent(authSql(second))]);
  check("two concurrent session creates complete safely", authRace.every((result) => result.status === 0));
  const activeSessionId = scalar(`select id from public.routine_operator_sessions where client_instance_id='${clientId}' and status='active';`);
  check("concurrent session creates converge on one active session", Boolean(activeSessionId)
    && scalar(`select count(*) from public.routine_operator_sessions where client_instance_id='${clientId}' and status='active';`) === "1");
  const winning = activeSessionId === first.sessionId ? first : second;
  const revisionBefore = Number(scalar(`select revision from public.routine_operator_sessions where id='${activeSessionId}';`));
  const reauthSql = () => psqlVariables({ test_pin: pin, session_token: winning.token }) +
    `select set_config('request.jwt.claim.sub','1e000000-0000-4000-8000-000000000001',false);
     select set_config('request.headers',jsonb_build_object('x-mesh-routine-operator-session',:'session_token')::text,false); set role authenticated;
     select public.reauthenticate_routine_operator_session(:'test_pin','${randomUUID()}');`;
  const reauthRace = await Promise.all([concurrent(reauthSql()), concurrent(reauthSql())]);
  check("parallel reauthentication calls serialize safely", reauthRace.every((result) => result.status === 0));
  check("parallel reauthentication produces two revisioned freshness updates",
    Number(scalar(`select revision from public.routine_operator_sessions where id='${activeSessionId}';`)) === revisionBefore + 2);
  const runId = scalar("select value->'run'->>'id' from phase10e_fixture.state where key='run';");
  const joinSql = () => psqlVariables({ session_token: winning.token }) +
    `select set_config('request.jwt.claim.sub','1e000000-0000-4000-8000-000000000001',false);
     select set_config('request.headers',jsonb_build_object('x-mesh-routine-operator-session',:'session_token')::text,false); set role authenticated;
     select public.join_routine_run('${runId}','${randomUUID()}');`;
  const joinRace = await Promise.all([concurrent(joinSql()), concurrent(joinSql())]);
  if (joinRace.some((result) => result.status !== 0)) {
    throw new Error(`Concurrent operator join failed safely:\n${safeDiagnostic(joinRace.map((result) => result.stderr).join("\n"))}`);
  }
  check("parallel operator joins complete safely", joinRace.every((result) => result.status === 0));
  check("parallel joins converge on one operator participant", scalar(`select count(*) from public.routine_run_participants
    where run_id='${runId}' and operator_id='${operatorId}' and identity_type='shared_device_operator';`) === "1");
  const sharedJoinKey = "7e400000-0000-4000-8000-000000000001";
  const sharedJoinSql = (targetRunId = runId) => psqlVariables({ session_token: winning.token }) +
    `select set_config('request.jwt.claim.sub','1e000000-0000-4000-8000-000000000001',false);
     select set_config('request.headers',jsonb_build_object('x-mesh-routine-operator-session',:'session_token')::text,false); set role authenticated;
     select public.join_routine_run('${targetRunId}','${sharedJoinKey}')::text;`;
  const sharedJoinRace = await Promise.all([concurrent(sharedJoinSql()), concurrent(sharedJoinSql())]);
  const sharedJoinPayloads = sharedJoinRace.map((result) => {
    const line = result.stdout.split("\n").map((entry) => entry.trim()).filter((entry) => entry.startsWith("{") || entry.startsWith("[")).at(-1);
    return line ? JSON.parse(line) : null;
  });
  check("same shared-device operator and idempotency key converge concurrently",
    sharedJoinRace.every((result) => result.status === 0)
      && sharedJoinPayloads.every((payload) => payload?.participant?.operator_id === operatorId)
      && sharedJoinPayloads.filter((payload) => payload?.idempotentReplay === true).length === 1
      && scalar(`select count(*) from public.routine_run_operations where actor_auth_user_id='1e000000-0000-4000-8000-000000000001'
        and effective_operator_id='${operatorId}' and actor_source='shared_device_operator'
        and operation_type='join_run' and idempotency_key='${sharedJoinKey}';`) === "1");
  const sharedJoinConflict = await concurrent(sharedJoinSql("7e400000-0000-4000-8000-000000000099"));
  check("shared-device operator reuse with a different payload retains the deterministic error",
    sharedJoinConflict.status !== 0 && sharedJoinConflict.stderr.includes("Idempotency key was already used with another routine request."));
  const temporaryOperatorId = scalar("select id from public.routine_operators where operator_key='temporary-staff-01';");
  const secondClientId = "1e200000-0000-4000-8000-000000000005";
  psql(`select set_config('request.jwt.claim.sub','1e000000-0000-4000-8000-000000000001',false); set role authenticated;
    select public.register_routine_client_instance('${secondClientId}','phase10u-test','phase10u-v1','node-race','1e200000-0000-4000-8000-000000000006');`);
  const temporarySession = sessionMaterial("1e300000-0000-4000-8000-000000000005");
  const temporaryAuth = psql(psqlVariables({ test_pin: pin, session_secret_hash: temporarySession.secretHash }) +
    `select set_config('request.jwt.claim.sub','1e000000-0000-4000-8000-000000000001',false); set role authenticated;
     select public.authenticate_routine_operator('${secondClientId}','${temporaryOperatorId}','${temporarySession.sessionId}',:'session_secret_hash',:'test_pin','1e300000-0000-4000-8000-000000000006');`);
  check("second operator receives an independent active shared-device session", temporaryAuth.status === 0
    && scalar(`select count(*) from public.routine_operator_sessions where id in('${activeSessionId}','${temporarySession.sessionId}') and status='active';`) === "2");
  const operatorJoinSql = (token, key) => psqlVariables({ session_token: token }) +
    `select set_config('request.jwt.claim.sub','1e000000-0000-4000-8000-000000000001',false);
     select set_config('request.headers',jsonb_build_object('x-mesh-routine-operator-session',:'session_token')::text,false); set role authenticated;
     select public.join_routine_run('${runId}','${key}')::text;`;
  const operatorSharedKey = "7e400000-0000-4000-8000-000000000002";
  const twoOperatorRace = await Promise.all([
    concurrent(operatorJoinSql(winning.token, operatorSharedKey)),
    concurrent(operatorJoinSql(temporarySession.token, operatorSharedKey)),
  ]);
  check("two operators on one device may use the same UUID without identity collision", twoOperatorRace.every((result) => result.status === 0)
    && scalar(`select count(*) from public.routine_run_operations where actor_auth_user_id='1e000000-0000-4000-8000-000000000001'
      and actor_source='shared_device_operator' and operation_type='join_run' and idempotency_key='${operatorSharedKey}';`) === "2"
    && scalar(`select count(distinct effective_operator_id)||':'||count(distinct operator_session_id) from public.routine_run_operations
      where actor_auth_user_id='1e000000-0000-4000-8000-000000000001' and actor_source='shared_device_operator'
        and operation_type='join_run' and idempotency_key='${operatorSharedKey}';`) === "2:2");
  const crossIdentityKey = "7e400000-0000-4000-8000-000000000003";
  const personalJoinSql = `select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',false); set role authenticated;
    select public.join_routine_run('${runId}','${crossIdentityKey}')::text;`;
  const crossIdentityRace = await Promise.all([
    concurrent(operatorJoinSql(winning.token, crossIdentityKey)),
    concurrent(personalJoinSql),
  ]);
  check("personal and shared-device identities do not suppress each other on the same UUID", crossIdentityRace.every((result) => result.status === 0)
    && scalar(`select count(*) from public.routine_run_operations where operation_type='join_run' and idempotency_key='${crossIdentityKey}'
      and ((actor_source='personal_auth' and actor_auth_user_id='11000000-0000-4000-8000-000000000002' and effective_operator_id is null)
        or (actor_source='shared_device_operator' and actor_auth_user_id='1e000000-0000-4000-8000-000000000001' and effective_operator_id='${operatorId}'));`) === "2"
    && scalar(`select count(*) from public.routine_run_participants where run_id='${runId}'
      and ((identity_type='personal_profile' and user_profile_id='11000000-0000-4000-8000-000000000002')
        or (identity_type='shared_device_operator' and operator_id='${operatorId}'));`) === "2");
  let wrongPin = validPin();
  while (wrongPin === pin) wrongPin = validPin();
  const wrongPinSql = () => psqlVariables({ test_pin: wrongPin, session_secret_hash: sessionMaterial().secretHash }) +
    `select set_config('request.jwt.claim.sub','1e000000-0000-4000-8000-000000000001',false); set role authenticated;
     select public.authenticate_routine_operator('${clientId}','${operatorId}','${randomUUID()}',:'session_secret_hash',:'test_pin','${randomUUID()}');`;
  const failures = await Promise.all(Array.from({ length: 7 }, () => concurrent(wrongPinSql())));
  check("parallel authentication failures are recorded without transaction errors", failures.every((result) => result.status === 0));
  check("parallel failures cannot bypass device lockout", scalar(`select exists(select 1 from public.routine_operator_auth_throttles
    where shared_device_id=(select shared_device_id from public.routine_operator_sessions where id='${activeSessionId}')
      and subject_type='device' and failed_attempt_count>=5 and locked_until>clock_timestamp());`) === "t");
  check("parallel failures cannot bypass operator lockout", scalar(`select exists(select 1 from public.routine_operator_auth_throttles
    where shared_device_id=(select shared_device_id from public.routine_operator_sessions where id='${activeSessionId}')
      and operator_id='${operatorId}' and failed_attempt_count>=5 and locked_until>clock_timestamp());`) === "t");
  const waitingKey = "7e400000-0000-4000-8000-000000000004";
  const waitingHash = scalar(`select public.routine_run_request_hash(jsonb_build_object('runId','${runId}'::uuid));`);
  const holderSql = psqlVariables({ session_token: winning.token }) +
    `set application_name='phase10u-stale-holder'; set statement_timeout='10s'; set lock_timeout='10s'; begin;
     select set_config('request.jwt.claim.sub','1e000000-0000-4000-8000-000000000001',false);
     select set_config('request.headers',jsonb_build_object('x-mesh-routine-operator-session',:'session_token')::text,false);
     select public.routine_run_operation_replay('a1000000-0000-4000-8000-000000000001','1e000000-0000-4000-8000-000000000001',
       'join_run','${waitingKey}','${waitingHash}'); select pg_sleep(30); commit;`;
  const staleHolder = concurrent(holderSql);
  let holderReady = false;
  for (let attempt = 0; attempt < 80 && !holderReady; attempt += 1) {
    holderReady = scalar("select exists(select 1 from pg_stat_activity activity join pg_locks lock_row on lock_row.pid=activity.pid where activity.application_name='phase10u-stale-holder' and lock_row.locktype='advisory' and lock_row.granted);") === "t";
    if (!holderReady) await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  check("stale-session probe holds the shared-device operation lock", holderReady);
  const staleWaiter = concurrent(operatorJoinSql(winning.token, waitingKey));
  await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  const sessionRevision = scalar(`select revision from public.routine_operator_sessions where id='${activeSessionId}';`);
  const revokeResult = psql(`select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',false); set role authenticated;
    select public.revoke_routine_operator_session('${activeSessionId}','Phase 10U waiting-lock expiry probe',${sessionRevision},'7e400000-0000-4000-8000-000000000005');`);
  check("stale-session probe revokes through the supported manager RPC", revokeResult.status === 0
    && scalar(`select status from public.routine_operator_sessions where id='${activeSessionId}';`) === "revoked");
  check("stale-session probe terminates only its disposable lock holder", scalar("select pg_terminate_backend(pid) from pg_stat_activity where application_name='phase10u-stale-holder';") === "t");
  const [staleHolderResult, staleWaiterResult] = await Promise.all([staleHolder, staleWaiter]);
  check("operator session revoked while waiting cannot replay under stale identity", staleHolderResult.status !== 0
    && staleWaiterResult.status !== 0 && /operator_auth_failed|operator session/i.test(staleWaiterResult.stderr)
    && scalar(`select count(*) from public.routine_run_operations where actor_auth_user_id='1e000000-0000-4000-8000-000000000001'
      and effective_operator_id='${operatorId}' and operation_type='join_run' and idempotency_key='${waitingKey}';`) === "0");
}

async function verifyDirectBundleReplayConcurrency() {
  const personalCall = (expression) => concurrent(
    `select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',false); set role authenticated; select (${expression})::text;`
  );
  const responseJson = (result) => {
    const line = result.stdout.split("\n").map((entry) => entry.trim()).filter((entry) => entry.startsWith("{") || entry.startsWith("[")).at(-1);
    return line ? JSON.parse(line) : null;
  };
  const transferId = scalar("select value->'transfer'->>'id' from phase10h_test.state where key='event_transfer_proposed';");
  const acceptedRevision = Number(scalar("select value->>'transferRevision' from phase10h_test.state where key='event_transfer_accepted';"));
  const acceptanceExpression = `public.accept_routine_event_transfer('${transferId}',${acceptedRevision - 1},'1b000000-0000-4000-8000-000000000015')`;
  const acceptanceFingerprint = scalar(`select md5(to_jsonb(value)::text) from public.routine_event_transfer_acceptances value where transfer_id='${transferId}';`);
  const acceptanceRace = await Promise.all([personalCall(acceptanceExpression), personalCall(acceptanceExpression)]);
  check("direct event-transfer acceptance path replays concurrently without mutation", acceptanceRace.every((result) => result.status === 0)
    && acceptanceRace.map(responseJson).every((payload) => payload?.idempotentReplay === true)
    && scalar(`select count(*) from public.routine_event_transfer_acceptances where transfer_id='${transferId}';`) === "1"
    && scalar(`select count(*) from public.routine_bundle_operations where operation_type='accept_event_transfer' and idempotency_key='1b000000-0000-4000-8000-000000000015';`) === "1"
    && acceptanceFingerprint === scalar(`select md5(to_jsonb(value)::text) from public.routine_event_transfer_acceptances value where transfer_id='${transferId}';`));

  const completedRevision = Number(scalar("select value->>'transferRevision' from phase10h_test.state where key='event_transfer_completed';"));
  const completionExpression = `public.complete_routine_event_transfer('${transferId}','standard_met','{"items":[{"itemKey":"condition-check","status":"completed","value":{"checked":true},"resultCode":"passed","note":null}],"summary":"Physical Event Operations control completed."}'::jsonb,true,false,null,${completedRevision - 1},'1b000000-0000-4000-8000-000000000016')`;
  const completionFingerprint = scalar(`select md5(to_jsonb(value)::text) from public.routine_event_transfer_completions value where transfer_id='${transferId}';`);
  const completionRace = await Promise.all([personalCall(completionExpression), personalCall(completionExpression)]);
  check("direct event-transfer completion path replays concurrently without mutation", completionRace.every((result) => result.status === 0)
    && completionRace.map(responseJson).every((payload) => payload?.idempotentReplay === true)
    && scalar(`select count(*) from public.routine_event_transfer_completions where transfer_id='${transferId}';`) === "1"
    && scalar(`select count(*) from public.routine_bundle_operations where operation_type='complete_event_transfer' and idempotency_key='1b000000-0000-4000-8000-000000000016';`) === "1"
    && completionFingerprint === scalar(`select md5(to_jsonb(value)::text) from public.routine_event_transfer_completions value where transfer_id='${transferId}';`));

  const bundleId = scalar("select value->'bundle'->>'id' from phase10h_test.state where key='bundle_create';");
  const participantId = scalar(`select id from public.routine_bundle_participants where bundle_id='${bundleId}' and user_profile_id='11000000-0000-4000-8000-000000000001';`);
  const ds01BundleRevision = Number(scalar("select value->'bundle'->>'revision' from phase10h_test.state where key='ds01';"));
  const ds01ParticipantRevision = Number(scalar("select value->'participant'->>'revision' from phase10h_test.state where key='ds01';"));
  const ds01Expression = `public.confirm_double_shift_plan('${bundleId}','${participantId}',time '18:00',${ds01BundleRevision - 1},${ds01ParticipantRevision - 1},'1b000000-0000-4000-8000-000000000007')`;
  const ds01Fingerprint = scalar(`select md5(to_jsonb(value)::text) from public.routine_bundle_steps value where bundle_id='${bundleId}' and bundle_participant_id='${participantId}' and step_key='ds01_confirm_plan';`);
  const ds01Race = await Promise.all([personalCall(ds01Expression), personalCall(ds01Expression)]);
  check("ordinary bundle-step path replays concurrently without revision or event drift", ds01Race.every((result) => result.status === 0)
    && ds01Race.map(responseJson).every((payload) => payload?.idempotentReplay === true)
    && scalar(`select count(*) from public.routine_bundle_operations where operation_type='confirm_double_shift_plan' and idempotency_key='1b000000-0000-4000-8000-000000000007';`) === "1"
    && scalar(`select count(*) from public.routine_events where bundle_id='${bundleId}' and event_type='double_shift_plan_confirmed';`) === "1"
    && ds01Fingerprint === scalar(`select md5(to_jsonb(value)::text) from public.routine_bundle_steps value where bundle_id='${bundleId}' and bundle_participant_id='${participantId}' and step_key='ds01_confirm_plan';`));
}

async function main() {
  for (const path of [...Object.values(paths), ...baseline]) if (!existsSync(absolute(path))) throw new Error(`Missing input ${path}`);
  staticSecurityChecks();
  command("docker", ["--version"]); docker(["image", "inspect", IMAGE]);
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
  psql(readFileSync(absolute(paths.time), "utf8"), { transaction: true }); psql(readFileSync(absolute(paths.timeFixture), "utf8"));
  psql(readFileSync(absolute(paths.delivery), "utf8"), { transaction: true }); psql(readFileSync(absolute(paths.deliveryFixture), "utf8"));
  psql(readFileSync(absolute(paths.doubleShift), "utf8"), { transaction: true }); psql(readFileSync(absolute(paths.doubleShiftFixture), "utf8"));
  psql("drop publication if exists supabase_realtime; create publication supabase_realtime;");
  psql(readFileSync(absolute(paths.sync), "utf8"), { transaction: true }); psql(readFileSync(absolute(paths.syncFixture), "utf8"));

  const protectedSchemaBefore = scalar(protectedSchemaFingerprintSql);
  const protectedDataBefore = scalar(protectedDataFingerprintSql);
  const historyBefore = scalar(routineHistoryFingerprintSql);
  psql(readFileSync(absolute(paths.identity), "utf8"), { transaction: true });
  psql(readFileSync(absolute(paths.identityAlignment), "utf8"), { transaction: true });
  psql(readFileSync(absolute(paths.operationConvergence), "utf8"), { transaction: true });
  psql(readFileSync(absolute(paths.creationProvenance), "utf8"), { transaction: true });
  check("Phase 10J preserves protected schema/functions/policies", protectedSchemaBefore === scalar(protectedSchemaFingerprintSql));
  check("Phase 10J preserves Event Operations data", protectedDataBefore === scalar(protectedDataFingerprintSql));
  check("Phase 10J preserves pre-existing routine hashes and historical rows", historyBefore === scalar(routineHistoryFingerprintSql));

  const pin = validPin();
  const fixtureSession = sessionMaterial("1e300000-0000-4000-8000-000000000001");
  const variables = psqlVariables({ test_pin: pin, session_secret_hash: fixtureSession.secretHash, session_token: fixtureSession.token });
  psql(variables + readFileSync(absolute(paths.identityFixture), "utf8"));
  const assertions = psql(variables + readFileSync(absolute(paths.assertions), "utf8"));
  const sqlPasses = `${assertions.stdout}\n${assertions.stderr}`.split("\n").filter((line) => line.includes("PASS "));
  if (sqlPasses.length !== EXPECTED_SQL_CHECKS) throw new Error(`Expected ${EXPECTED_SQL_CHECKS} SQL passes, received ${sqlPasses.length}.`);
  passCount += EXPECTED_SQL_CHECKS;
  console.log(`PASS ${EXPECTED_SQL_CHECKS}/${EXPECTED_SQL_CHECKS} shared-device SQL fixture checks`);

  verifyTokenParserContracts(pin);
  verifyCatalogContracts();
  const migration = readFileSync(absolute(paths.identity), "utf8");
  const sourceContracts = [
    ["bcrypt cost 12 creation", "gen_salt('bf',12)"], ["bcrypt verification", "crypt(input_pin,v_credential.pin_hash)"],
    ["advisory authentication lock", "pg_advisory_xact_lock"], ["server clock session authority", "clock_timestamp()"],
    ["dedicated operator header", "x-mesh-routine-operator-session"], ["constant-time digest comparison", "routine_constant_time_equals"],
    ["personal-only template management", "routine_current_actor_source()='personal_auth'"], ["operator run participants", "shared_device_operator"],
    ["operator-scoped receipt index", "routine_offline_receipts_operator_operation_unique"], ["operator-scoped run operation index", "routine_run_operations_operator_idempotency"],
    ["critical task reauthentication", "complete_critical_task"], ["critical run finish reauthentication", "finish_routine_run"],
    ["critical event completion reauthentication", "complete_critical_event_transfer"], ["shared cursor transport", "cursor_polling"],
    ["delivery v3 schema", "phase10j-v3"], ["delivery v3 operator identity", "operatorIdentity"],
    ["linked Event authority", "assigned_auth_user_id=v_profile.id"], ["shared client binding", "shared_device_id uuid references public.routine_shared_devices"],
    ["no offline critical shared completion", "shared_device_critical_action_requires_online_reauthentication"],
    ["no offline shared run finish", "shared_device_run_finish_requires_online_reauthentication"],
  ];
  for (const [label, marker] of sourceContracts) check(label, migration.includes(marker));
  check("migration contains no dynamic SQL", !/\bexecute\s+(?:format|immediate)/i.test(migration));
  check("migration contains no broad RLS policy", !/using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\)/i.test(migration));
  const adminWorkspaceSource = migration.slice(migration.indexOf("create or replace function public.get_routine_operator_admin_workspace"),
    migration.indexOf("create or replace function public.routine_phase10j_session_payload"));
  check("manager workspace never returns PIN or session hashes", !adminWorkspaceSource.includes("credential.pin_hash")
    && !adminWorkspaceSource.includes("session.session_secret_hash"));
  check("authentication request hash excludes PIN and session digest", migration.includes("jsonb_build_object('clientInstanceId',v_client.id,'operatorId',v_operator.id,\n    'sessionId',v_session.id)"));
  await verifyBrowserContracts();

  const identityDataBefore = scalar(`select md5(
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_shared_devices value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_operators value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_operator_credentials value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_operator_sessions value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_operator_operations value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_operator_events value),'[]'));`);
  psql(readFileSync(absolute(paths.identity), "utf8"), { transaction: true });
  psql(readFileSync(absolute(paths.identityAlignment), "utf8"), { transaction: true });
  psql(readFileSync(absolute(paths.operationConvergence), "utf8"), { transaction: true });
  psql(readFileSync(absolute(paths.creationProvenance), "utf8"), { transaction: true });
  check("Phase 10J reapplies without row or timestamp mutation", identityDataBefore === scalar(`select md5(
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_shared_devices value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_operators value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_operator_credentials value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_operator_sessions value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_operator_operations value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_operator_events value),'[]'));`));
  const regressionRelations = ["routine_organization_settings","routine_template_versions","routine_reference_images","routine_runs",
    "routine_deviations","routine_run_task_timings","routine_delivery_records","routine_bundles","routine_client_instances"];
  for (const relation of regressionRelations) check(`${relation} regression relation remains available`, scalar(`select to_regclass('public.${relation}') is not null;`) === "t");
  check("protected schema fingerprint remains stable after fixture and reapply", protectedSchemaBefore === scalar(protectedSchemaFingerprintSql));
  check("Event Operations rows remain stable after fixture and reapply", protectedDataBefore === scalar(protectedDataFingerprintSql));
  check("published template hashes remain populated", Number(scalar("select count(*) from public.routine_template_versions where state='published' and content_hash is not null;")) > 0);
  check("run snapshot hashes remain populated", Number(scalar("select count(*) from public.routine_runs where snapshot_hash is not null;")) > 0);
  check("timing snapshot hashes remain populated", Number(scalar("select count(*) from public.routine_runs where timing_snapshot_hash is not null;")) > 0);
  check("existing delivery hashes remain populated", Number(scalar("select count(*) from public.routine_delivery_records where record_hash is not null;")) > 0);
  check("reference image versions remain queryable", Number(scalar("select count(*) from public.routine_reference_image_versions;")) >= 0);

  const operatorId = scalar("select id from public.routine_operators where operator_key='linked-staff-01';");
  await verifyDirectBundleReplayConcurrency();
  await verifyConcurrency(pin, operatorId);
  if (passCount < MINIMUM_CHECKS) throw new Error(`Expected at least ${MINIMUM_CHECKS} meaningful checks, received ${passCount}.`);
  console.log(`PASS ${passCount} Phase 10J contract checks (minimum ${MINIMUM_CHECKS})`);
}

try { await main(); } finally { cleanup(); }
