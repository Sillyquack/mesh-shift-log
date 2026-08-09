import { createHash, createHmac, randomBytes, randomInt, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { ROUTINE_E2E_HISTORY_FIXTURE as HISTORY_FIXTURE } from "../src/features/routines-v2/testing/routineE2EFixtureContract.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const POSTGRES_IMAGE = "public.ecr.aws/supabase/postgres:17.6.1.141";
const POSTGREST_IMAGE = "public.ecr.aws/supabase/postgrest:v14.14";
const DATABASE = "phase10k4_routine_browser_test";
const ROLE = "supabase_admin";
const suffix = `${process.pid}-${randomUUID().slice(0, 8)}`;
const NETWORK = `mesh-shift-log-phase10k4-network-${suffix}`;
const DATABASE_CONTAINER = `mesh-shift-log-phase10k4-browser-db-${suffix}`;
const POSTGREST_CONTAINER = `mesh-shift-log-phase10k4-postgrest-${suffix}`;
const PASSWORD = `phase10k4-${randomUUID()}`;
const JWT_SECRET = randomBytes(48).toString("base64url");
let networkStarted = false;
let databaseStarted = false;
let postgrestStarted = false;
let proxyServer = null;

const baseline = ["supabase/schema.sql", "supabase/phase7a_workbar_device_auth.sql", "supabase/phase5f4_close_day_archives.sql",
  "supabase/phase8a_event_operations_core.sql", "supabase/phase8c_zone_command_structure.sql", "supabase/phase8c2_fix_role_duplicates_and_my_zone.sql",
  "supabase/phase8f_calendar_import_realtime.sql", "supabase/phase8h3_smart_staffing_permissions.sql", "supabase/phase8i_event_live_updates.sql",
  "supabase/phase9a_inventory_stocktaking.sql", "supabase/phase9b_stock_policies.sql"];
const migrations = ["supabase/phase10a_routine_engine_foundation.sql", "supabase/phase10a1_routine_organization_settings_bootstrap.sql", "supabase/phase10b_routine_templates.sql",
  "supabase/phase10c_routine_reference_images.sql", "supabase/phase10d_routine_runs_and_snapshots.sql",
  "supabase/phase10e_routine_task_lifecycle.sql", "supabase/phase10f_routine_operational_time.sql",
  "supabase/phase10g_routine_closing_delivery.sql", "supabase/phase10h_routine_double_shift.sql",
  "supabase/phase10i_routine_realtime_offline_sync.sql", "supabase/phase10j_routine_shared_device_identity.sql",
  "supabase/phase10k1_routine_ui_pilot_gate.sql", "supabase/phase10k2_routine_manager_control_center.sql",
  "supabase/phase10k3_routine_employee_workflow.sql", "supabase/phase10k4_routine_history_pilot_hardening.sql",
  "supabase/phase10l_mesh_routine_content_pack.sql", "supabase/phase10p_routine_readiness_finalization.sql",
  "supabase/phase10q_mesh_routine_content_pack_1_2r.sql", "supabase/phase10o_routine_default_privilege_hardening.sql"];
const fixtures = ["supabase/tests/phase10/foundation-fixtures.sql", "supabase/tests/phase10/run-snapshot-fixtures.sql",
  "supabase/tests/phase10/lifecycle-fixtures.sql", "supabase/tests/phase10/operational-time-fixtures.sql",
  "supabase/tests/phase10/delivery-fixtures.sql", "supabase/tests/phase10/double-shift-fixtures.sql",
  "supabase/tests/phase10/sync-offline-fixtures.sql"];
const paths = {
  fixture: "supabase/tests/phase10/history-pilot-fixtures.sql",
  templateFixture: "supabase/tests/phase10/template-fixtures.sql",
  identityFixture: "supabase/tests/phase10/shared-device-fixtures.sql",
  uiFixture: "supabase/tests/phase10/ui-pilot-fixtures.sql",
  employeeFixture: "supabase/tests/phase10/employee-ui-fixtures.sql",
};

function command(name, args, options = {}) {
  const result = spawnSync(name, args, { cwd: ROOT, encoding: "utf8", input: options.input,
    timeout: options.timeout ?? 300_000, stdio: "pipe" });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${name} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

const docker = (args, options) => command("docker", args, options);
const absolute = (path) => resolve(ROOT, path);
function psql(sql, { tuplesOnly = false, transaction = false } = {}) {
  const args = ["exec", "-i", DATABASE_CONTAINER, "psql", "--no-psqlrc", "--set=ON_ERROR_STOP=1",
    `--username=${ROLE}`, `--dbname=${DATABASE}`];
  if (tuplesOnly) args.push("--tuples-only", "--no-align", "--quiet");
  if (transaction) args.push("--single-transaction");
  return docker(args, { input: sql });
}
const scalar = (sql) => psql(sql, { tuplesOnly: true }).stdout.trim();
const lastScalar = (sql) => psql(sql, { tuplesOnly: true }).stdout.trim().split("\n").filter(Boolean).at(-1) || "";
function variables(values) {
  return `${Object.entries(values).map(([key, value]) => {
    if (!/^[a-z_]+$/.test(key) || !/^[A-Za-z0-9_.-]+$/.test(value)) throw new Error("Unsafe disposable verifier variable.");
    return `\\set ${key} ${value}`;
  }).join("\n")}\n`;
}
function validPin() {
  const forbidden = /^(\d)\1+$|^(123456|654321|000000|111111|121212|112233)$/;
  let pin;
  do { pin = String(randomInt(700_000, 900_000)); } while (forbidden.test(pin));
  return pin;
}
function sessionMaterial(sessionId = randomUUID()) {
  const secret = randomBytes(32);
  return { secretHash: createHash("sha256").update(secret).digest("hex"), token: `v1.${sessionId}.${secret.toString("base64url")}` };
}
function jwt(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}`;
  return `${unsigned}.${createHmac("sha256", JWT_SECRET).update(unsigned).digest("base64url")}`;
}
function authSession(userId, email) {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const accessToken = jwt({ aud: "authenticated", exp: expiresAt, sub: userId, email, role: "authenticated" });
  return { access_token: accessToken, refresh_token: `disposable-${randomUUID()}`, token_type: "bearer",
    expires_in: 3600, expires_at: expiresAt, user: { id: userId, aud: "authenticated", role: "authenticated", email } };
}
const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

async function waitForPostgres() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const logs = docker(["logs", DATABASE_CONTAINER], { allowFailure: true });
    const ready = docker(["exec", DATABASE_CONTAINER, "pg_isready", `--username=${ROLE}`, `--dbname=${DATABASE}`], { allowFailure: true });
    if (/PostgreSQL init process complete; ready for start up/i.test(`${logs.stdout}\n${logs.stderr}`) && ready.status === 0) return;
    await delay(250);
  }
  throw new Error("Disposable browser PostgreSQL did not become ready.");
}

function installDatabaseFixture(pin, material) {
  psql("create schema if not exists storage; create table if not exists storage.buckets(id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]); create table if not exists storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null,name text not null,owner_id uuid,metadata jsonb not null default '{}',unique(bucket_id,name)); alter table storage.objects enable row level security; grant usage on schema storage to authenticated,anon; grant select,insert,update,delete on storage.objects to authenticated;");
  for (const path of baseline) psql(readFileSync(absolute(path), "utf8"), { transaction: true });
  // PostgREST 14 exposes the JWT as request.jwt.claims. The hosted Supabase
  // stack also maintains the legacy sub GUC; this disposable compatibility
  // shim accepts either representation without changing application SQL.
  psql("create or replace function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;");
  psql("alter table public.user_profiles drop constraint if exists user_profiles_role_check; alter table public.user_profiles add constraint user_profiles_role_check check(role in ('manager','shift_lead','event_floor_manager','staff','time2staff','counter')); ");
  for (const path of migrations.slice(0, 6)) psql(readFileSync(absolute(path), "utf8"), { transaction: true });
  psql(readFileSync(absolute(fixtures[0]), "utf8"));
  psql(readFileSync(absolute(paths.templateFixture), "utf8"));
  for (const path of fixtures.slice(1, 3)) psql(readFileSync(absolute(path), "utf8"));
  for (let index = 6; index <= 9; index += 1) {
    if (index === 9) psql("drop publication if exists supabase_realtime; create publication supabase_realtime;");
    psql(readFileSync(absolute(migrations[index]), "utf8"), { transaction: true });
    if (fixtures[index - 3]) psql(readFileSync(absolute(fixtures[index - 3]), "utf8"));
  }
  psql(readFileSync(absolute(migrations[10]), "utf8"), { transaction: true });
  const vars = variables({ test_pin: pin, session_secret_hash: material.secretHash, session_token: material.token });
  psql(vars + readFileSync(absolute(paths.identityFixture), "utf8"));
  for (const path of migrations.slice(11, 14)) psql(readFileSync(absolute(path), "utf8"), { transaction: true });
  psql(vars + readFileSync(absolute(paths.uiFixture), "utf8"));
  psql(vars + readFileSync(absolute(paths.employeeFixture), "utf8"));
  for (const path of migrations.slice(14)) psql(readFileSync(absolute(path), "utf8"), { transaction: true });
  psql(vars + readFileSync(absolute(paths.fixture), "utf8"));
  psql(`select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',false);
    select set_config('mesh.routine_ui_internal','mode',false);
    update public.routine_organization_settings set mode='pilot'
      where organization_id='a1000000-0000-4000-8000-000000000001';
    insert into public.routine_runs(id,organization_id,routine_key,scope_key,operational_date,timezone,template_id,
      template_version_id,template_version_number_snapshot,template_content_hash_snapshot,snapshot_schema_version,
      snapshot_state,snapshot_hash,status,revision,creation_idempotency_key,creation_request_hash,started_at,
      started_by_auth_user_id,finished_at,finished_by_auth_user_id,reopen_count,current_finish_sequence,created_at,
      created_by_auth_user_id,updated_at,updated_by_auth_user_id)
    select '${HISTORY_FIXTURE.expectedSharedRunId}',run.organization_id,run.routine_key,'shared-history-anchor',
      '${HISTORY_FIXTURE.operationalDate}',run.timezone,run.template_id,run.template_version_id,
      run.template_version_number_snapshot,run.template_content_hash_snapshot,run.snapshot_schema_version,
      run.snapshot_state,run.snapshot_hash,'finished',1,'4f100000-0000-4000-8000-000000000091',repeat('a',64),
      '${HISTORY_FIXTURE.operationalDate} 08:00:00+00',run.started_by_auth_user_id,
      '${HISTORY_FIXTURE.operationalDate} 09:00:00+00',run.finished_by_auth_user_id,0,1,
      '${HISTORY_FIXTURE.operationalDate} 07:55:00+00',run.created_by_auth_user_id,
      '${HISTORY_FIXTURE.operationalDate} 09:00:00+00',run.updated_by_auth_user_id
    from public.routine_runs run
    where run.id=(select (value->'run'->>'id')::uuid from phase10g_test.state where key='closing_create');
    insert into public.routine_run_participants(id,organization_id,run_id,user_profile_id,identity_type,operator_id,
      linked_user_profile_id_snapshot,authenticated_device_profile_id_snapshot,display_name_snapshot,role_snapshot,
      participation_status,joined_at,creation_idempotency_key,created_at,created_by_auth_user_id,updated_at,updated_by_auth_user_id)
    values('4f100000-0000-4000-8000-000000000092','a1000000-0000-4000-8000-000000000001',
      '${HISTORY_FIXTURE.expectedSharedRunId}','11000000-0000-4000-8000-000000000002','personal_profile',null,null,null,
      'Test Staff','staff','completed','${HISTORY_FIXTURE.operationalDate} 08:00:00+00',
      '4f100000-0000-4000-8000-000000000093','${HISTORY_FIXTURE.operationalDate} 08:00:00+00',
      '11000000-0000-4000-8000-000000000001','${HISTORY_FIXTURE.operationalDate} 09:00:00+00',
      '11000000-0000-4000-8000-000000000001');
    insert into public.routine_run_participants(id,organization_id,run_id,user_profile_id,identity_type,operator_id,
      linked_user_profile_id_snapshot,authenticated_device_profile_id_snapshot,display_name_snapshot,role_snapshot,
      participation_status,joined_at,creation_idempotency_key,created_at,created_by_auth_user_id,updated_at,updated_by_auth_user_id)
    select '4f100000-0000-4000-8000-000000000094',run.organization_id,run.id,null,'shared_device_operator',
      (state.value->'operator'->>'id')::uuid,'11000000-0000-4000-8000-000000000002',
      '1e000000-0000-4000-8000-000000000001','Linked Test Operator','staff','completed',
      '${HISTORY_FIXTURE.operationalDate} 08:00:00+00','4f100000-0000-4000-8000-000000000095',
      '${HISTORY_FIXTURE.operationalDate} 08:00:00+00','1e000000-0000-4000-8000-000000000001',
      '${HISTORY_FIXTURE.operationalDate} 09:00:00+00','1e000000-0000-4000-8000-000000000001'
    from public.routine_runs run cross join phase10j_test.state state
    where state.key='linked_operator' and run.id='${HISTORY_FIXTURE.expectedSharedRunId}';
    update public.routine_organization_settings set mode='shadow'
      where organization_id='a1000000-0000-4000-8000-000000000001';
    select set_config('mesh.routine_ui_internal','',false);
    select set_config('request.jwt.claim.sub','',false);`);
  psql(`alter role authenticator password '${PASSWORD}';`);
}

function scopedHistory(authUserId, dateFrom, dateTo, operatorToken = null) {
  const headerSetup = operatorToken
    ? `select set_config('request.headers',jsonb_build_object('x-mesh-routine-operator-session','${operatorToken}')::text,false);`
    : "";
  const value = lastScalar(`select set_config('request.jwt.claim.sub','${authUserId}',false);
    ${headerSetup}
    set role authenticated;
    select public.list_routine_v2_history('${dateFrom}','${dateTo}',null,null,null,null,null,100,null);`);
  return JSON.parse(value);
}

function collectHistoryFixtureEvidence(operatorId, operatorToken) {
  const shared = scopedHistory("1e000000-0000-4000-8000-000000000001", HISTORY_FIXTURE.dateFrom, HISTORY_FIXTURE.dateTo, operatorToken);
  const staff = scopedHistory("11000000-0000-4000-8000-000000000002", HISTORY_FIXTURE.dateFrom, HISTORY_FIXTURE.dateTo);
  const manager = scopedHistory("11000000-0000-4000-8000-000000000001", HISTORY_FIXTURE.managerDateFrom, HISTORY_FIXTURE.managerDateTo);
  const crossOrganization = scopedHistory("22000000-0000-4000-8000-000000000001", HISTORY_FIXTURE.dateFrom, HISTORY_FIXTURE.dateTo);
  const sharedRunIds = (shared.items || []).map((item) => item.id);
  const authorizedSharedRunIds = JSON.parse(lastScalar(`select coalesce(jsonb_agg(participant.run_id order by participant.run_id),'[]'::jsonb)
    from public.routine_run_participants participant join public.routine_runs run on run.id=participant.run_id
    where participant.operator_id='${operatorId}' and run.operational_date between '${HISTORY_FIXTURE.dateFrom}' and '${HISTORY_FIXTURE.dateTo}';`));
  const targetOrganizationRunIds = JSON.parse(lastScalar(`select coalesce(jsonb_agg(run.id order by run.id),'[]'::jsonb)
    from public.routine_runs run where run.organization_id='a1000000-0000-4000-8000-000000000001'
      and run.operational_date between '${HISTORY_FIXTURE.dateFrom}' and '${HISTORY_FIXTURE.dateTo}';`));
  return Object.freeze({
    ...HISTORY_FIXTURE,
    expectedRunDate: scalar(`select operational_date from public.routine_runs where id='${HISTORY_FIXTURE.expectedSharedRunId}';`),
    sharedParticipantCount: Number(scalar(`select count(*) from public.routine_run_participants where run_id='${HISTORY_FIXTURE.expectedSharedRunId}' and operator_id='${operatorId}';`)),
    sharedHistoryCount: sharedRunIds.length,
    sharedRunIds: Object.freeze(sharedRunIds),
    authorizedSharedRunIds: Object.freeze(authorizedSharedRunIds),
    unauthorizedSharedRunCount: sharedRunIds.filter((id) => !authorizedSharedRunIds.includes(id)).length,
    crossOrganizationTargetRunCount: (crossOrganization.items || []).filter((item) => targetOrganizationRunIds.includes(item.id)).length,
    managerHistoryCount: manager.items?.length || 0,
    managerContainsExpectedRun: Boolean(manager.items?.some((item) => item.id === HISTORY_FIXTURE.expectedSharedRunId)),
    staffHistoryCount: staff.items?.length || 0,
    staffContainsExpectedRun: Boolean(staff.items?.some((item) => item.id === HISTORY_FIXTURE.expectedSharedRunId)),
  });
}

async function startProxy(postgrestUrl) {
  proxyServer = createServer(async (request, response) => {
    response.setHeader("access-control-allow-origin", "*");
    response.setHeader("access-control-allow-headers", "authorization,apikey,content-type,prefer,x-client-info,x-mesh-routine-operator-session");
    response.setHeader("access-control-allow-methods", "GET,HEAD,POST,OPTIONS");
    response.setHeader("access-control-expose-headers", "content-profile,content-range");
    if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const headers = Object.fromEntries(Object.entries(request.headers)
        .filter(([name]) => !["host", "connection", "content-length", "origin"].includes(name))
        .map(([name, value]) => [name, Array.isArray(value) ? value.join(",") : value]));
      const path = (request.url || "/").replace(/^\/rest\/v1(?=\/|$)/, "") || "/";
      const upstream = await fetch(`${postgrestUrl}${path}`, { method: request.method, headers,
        body: ["GET", "HEAD"].includes(request.method || "GET") ? undefined : Buffer.concat(chunks) });
      response.statusCode = upstream.status;
      for (const [name, value] of upstream.headers.entries()) {
        if (!["content-encoding", "content-length", "transfer-encoding", "connection"].includes(name)) response.setHeader(name, value);
      }
      response.end(Buffer.from(await upstream.arrayBuffer()));
    } catch {
      response.statusCode = 502;
      response.end(JSON.stringify({ message: "Disposable RPC proxy unavailable." }));
    }
  });
  await new Promise((resolveListen, rejectListen) => {
    proxyServer.once("error", rejectListen);
    proxyServer.listen(0, "127.0.0.1", resolveListen);
  });
  return `http://127.0.0.1:${proxyServer.address().port}`;
}

export async function startRoutineE2EDisposableBackend() {
  try {
    docker(["network", "create", "--internal", NETWORK]);
    networkStarted = true;
    docker(["run", "--detach", "--rm", "--pull", "never", "--name", DATABASE_CONTAINER, "--network", NETWORK,
      "--network-alias", "phase10k4-db", "--env", `POSTGRES_PASSWORD=${PASSWORD}`, "--env", `POSTGRES_DB=${DATABASE}`, POSTGRES_IMAGE]);
    databaseStarted = true;
    await waitForPostgres();
    const pin = validPin();
    const material = sessionMaterial("1e300000-0000-4000-8000-000000000001");
    installDatabaseFixture(pin, material);
    const operatorId = scalar("select value->'operator'->>'id' from phase10j_test.state where key='linked_operator';");
    if (!/^[0-9a-f-]{36}$/i.test(operatorId)) throw new Error("Disposable operator fixture is invalid.");
    const historyFixture = collectHistoryFixtureEvidence(operatorId, material.token);
    docker(["run", "--detach", "--rm", "--pull", "never", "--name", POSTGREST_CONTAINER, "--network", NETWORK,
      "--publish", "127.0.0.1:0:3000", "--env", `PGRST_DB_URI=postgres://authenticator:${PASSWORD}@phase10k4-db:5432/${DATABASE}`,
      "--env", "PGRST_DB_SCHEMAS=public", "--env", "PGRST_DB_ANON_ROLE=anon", "--env", `PGRST_JWT_SECRET=${JWT_SECRET}`,
      // The repository's Supabase-compatible auth.uid() contract reads the
      // individual request.jwt.claim.* GUCs used by the deployed stack.
      "--env", "PGRST_DB_USE_LEGACY_GUCS=true", POSTGREST_IMAGE]);
    postgrestStarted = true;
    // Docker Desktop does not publish a host port from an internal-only
    // network. Attach only the stateless API container to the local bridge;
    // PostgreSQL remains reachable exclusively through the internal network.
    docker(["network", "connect", "bridge", POSTGREST_CONTAINER]);
    let postgrestUrl = "";
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const port = docker(["port", POSTGREST_CONTAINER, "3000/tcp"], { allowFailure: true }).stdout.trim();
      const match = port.match(/127\.0\.0\.1:(\d+)$/m);
      if (match) {
        postgrestUrl = `http://127.0.0.1:${match[1]}`;
        try { const result = await fetch(postgrestUrl); if (result.status < 500) break; } catch {}
      }
      await delay(100);
    }
    if (!postgrestUrl) throw new Error("Disposable PostgREST did not expose a loopback port.");
    const baseUrl = await startProxy(postgrestUrl);
    const organizationId = "a1000000-0000-4000-8000-000000000001";
    const sharedAuthUserId = "1e000000-0000-4000-8000-000000000001";
    return Object.freeze({
      baseUrl,
      anonKey: jwt({ aud: "anon", exp: Math.floor(Date.now() / 1000) + 3600, role: "anon" }),
      storageKey: "sb-127-auth-token",
      sessions: Object.freeze({
        manager: authSession("11000000-0000-4000-8000-000000000001", "manager@disposable.invalid"),
        staff: authSession("11000000-0000-4000-8000-000000000002", "staff@disposable.invalid"),
        shared: authSession(sharedAuthUserId, "shared-device@disposable.invalid"),
      }),
      operatorSession: Object.freeze({ token: material.token, organizationId, deviceAuthUserId: sharedAuthUserId, operatorId,
        sessionMetadata: Object.freeze({ displayName: "Linked Test Operator", role: "staff", source: "disposable_e2e" }) }),
      historyFixture,
    });
  } catch (error) {
    await stopRoutineE2EDisposableBackend();
    throw error;
  }
}

export async function stopRoutineE2EDisposableBackend() {
  if (proxyServer) await new Promise((resolveClose) => proxyServer.close(resolveClose));
  proxyServer = null;
  if (!/^mesh-shift-log-phase10k4-postgrest-[0-9]+-[a-f0-9]{8}$/.test(POSTGREST_CONTAINER)
      || !/^mesh-shift-log-phase10k4-browser-db-[0-9]+-[a-f0-9]{8}$/.test(DATABASE_CONTAINER)
      || !/^mesh-shift-log-phase10k4-network-[0-9]+-[a-f0-9]{8}$/.test(NETWORK)) {
    throw new Error("Unsafe disposable backend cleanup target.");
  }
  if (postgrestStarted) docker(["rm", "--force", POSTGREST_CONTAINER], { allowFailure: true, timeout: 30_000 });
  postgrestStarted = false;
  if (databaseStarted) docker(["rm", "--force", DATABASE_CONTAINER], { allowFailure: true, timeout: 30_000 });
  databaseStarted = false;
  if (networkStarted) docker(["network", "rm", NETWORK], { allowFailure: true, timeout: 30_000 });
  networkStarted = false;
}
