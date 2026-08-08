import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IMAGE = "public.ecr.aws/supabase/postgres:17.6.1.141";
const DATABASE = "phase10k4_routine_history_test";
const ROLE = "supabase_admin";
const CONTAINER = `mesh-shift-log-phase10k4-${process.pid}-${randomUUID().slice(0, 8)}`;
const PASSWORD = `phase10k4-${randomUUID()}`;
let started = false;
let passCount = 0;

if (process.argv.length > 2) throw new Error("This verifier accepts no network, URL, host, or project arguments.");
const absolute = (path) => resolve(ROOT, path);
function check(label, condition) {
  if (!condition) throw new Error(`FAIL ${String(passCount + 1).padStart(3, "0")} ${label}`);
  passCount += 1;
  console.log(`PASS ${String(passCount).padStart(3, "0")} ${label}`);
}
function command(name, args, options = {}) {
  const result = spawnSync(name, args, { cwd: ROOT, encoding: "utf8", input: options.input,
    timeout: options.timeout ?? 300_000, stdio: "pipe" });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) throw new Error(`${name} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
  return result;
}
const docker = (args, options) => command("docker", args, options);
function psql(sql, { tuplesOnly = false, transaction = false, allowFailure = false } = {}) {
  const args = ["exec", "-i", CONTAINER, "psql", "--no-psqlrc", "--set=ON_ERROR_STOP=1", `--username=${ROLE}`, `--dbname=${DATABASE}`];
  if (tuplesOnly) args.push("--tuples-only", "--no-align", "--quiet");
  if (transaction) args.push("--single-transaction");
  return docker(args, { input: sql, allowFailure });
}
const scalar = (sql) => psql(sql, { tuplesOnly: true }).stdout.trim();
function variables(values) {
  return Object.entries(values).map(([key, value]) => {
    if (!/^[a-z_]+$/.test(key) || !/^[A-Za-z0-9_.-]+$/.test(value)) throw new Error("Unsafe verifier variable.");
    return `\\set ${key} ${value}`;
  }).join("\n") + "\n";
}
function cleanup() {
  if (!started) return;
  if (!/^mesh-shift-log-phase10k4-[0-9]+-[a-f0-9]{8}$/.test(CONTAINER)) throw new Error("Unsafe verifier container name.");
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
  return { secretHash: createHash("sha256").update(secret).digest("hex"), token: `v1.${sessionId}.${secret.toString("base64url")}` };
}

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
  "supabase/phase10k3_routine_employee_workflow.sql"];
const fixtures = ["supabase/tests/phase10/foundation-fixtures.sql", "supabase/tests/phase10/run-snapshot-fixtures.sql",
  "supabase/tests/phase10/lifecycle-fixtures.sql", "supabase/tests/phase10/operational-time-fixtures.sql",
  "supabase/tests/phase10/delivery-fixtures.sql", "supabase/tests/phase10/double-shift-fixtures.sql",
  "supabase/tests/phase10/sync-offline-fixtures.sql"];
const paths = { migration: "supabase/phase10k4_routine_history_pilot_hardening.sql",
  fixture: "supabase/tests/phase10/history-pilot-fixtures.sql", assertions: "supabase/tests/phase10/history-pilot-assertions.sql",
  templateFixture: "supabase/tests/phase10/template-fixtures.sql",
  identityFixture: "supabase/tests/phase10/shared-device-fixtures.sql", uiFixture: "supabase/tests/phase10/ui-pilot-fixtures.sql",
  employeeFixture: "supabase/tests/phase10/employee-ui-fixtures.sql" };

function sourceChecks() {
  const required = [...baseline, ...migrations, ...fixtures, ...Object.values(paths)];
  for (const path of required) check(`required file exists: ${path}`, existsSync(absolute(path)));
  const sql = readFileSync(absolute(paths.migration), "utf8");
  check("K4 contract is installed", sql.includes("phase10k4-v1"));
  check("migration has no top-level pilot activation block", !/do\s+\$[^$]*\$[\s\S]{0,1200}set\s+mode\s*=\s*'pilot'/i.test(sql));
  check("migration has no active assignment path", !/set\s+mode\s*=\s*'active'/i.test(sql));
  check("pilot-ready assignment exists only behind the promotion RPC", sql.indexOf("set ui_release_stage='pilot_ready'") > sql.indexOf("function public.promote_routine_ui_release_stage"));
  check("migration contains no routine content seed", !/insert\s+into\s+public\.routine_(templates|template_versions|runs|run_tasks|bundles)/i.test(sql));
  check("migration contains no legacy write", !/(insert\s+into|update|delete\s+from)\s+public\.(shift_sessions|task_completions|handover_notes|close_day_archives|manager_daily_reviews)/i.test(sql));
  check("migration contains no Inventory write", !/(insert\s+into|update|delete\s+from)\s+public\.(inventory_|asset_)/i.test(sql));
  check("migration contains no Event Operations write", !/(insert\s+into|update|delete\s+from)\s+public\.event_/i.test(sql));
  check("release attestation is immutable", sql.includes("Release attestations are immutable."));
  check("readiness hash uses SHA-256", sql.includes("extensions.digest") && sql.includes("'sha256'"));
  check("production-ready is rejected", sql.includes("routine_ui_not_production_ready"));
  check("active mode is rejected", sql.includes("input_mode='active'") && sql.includes("routine_ui_not_production_ready"));
  check("pause guards all new-work entry points", ["create_or_get_routine_run", "create_or_get_double_shift_bundle", "start_routine_run"].every((name) => sql.includes(name)));
  check("history date range is bounded", (sql.match(/366 days/g) || []).length >= 3);
  check("unscoped legacy is aggregate-only", sql.includes("'detailsForUnscopedRows',false") && sql.includes("'automaticAssignment',false"));
  check("ordinary event timeline omits operation id", sql.includes("to_jsonb(event)-'operation_id'"));
  check("manager action context is computed by history RPC", sql.includes("'reopenTaskIds'") && sql.includes("'assignDeviationIds'") && sql.includes("'resolveDeviationIds'"));
  const historyClient = readFileSync(absolute("src/features/routines-v2/api/routineHistoryClient.js"), "utf8");
  check("manager history reuses lifecycle mutation clients", ["reopenRoutineTask", "reopenRoutineRun", "cancelRoutineRun", "assignRoutineDeviation", "mitigateRoutineDeviation", "resolveRoutineDeviation", "cancelRoutineDeviation"].every((name) => historyClient.includes(name)));
  check("history client performs no direct table DML", !/\.from\s*\(|\.(?:insert|update|delete)\s*\(/.test(historyClient));
  check("application roles receive no attestation table DML", /revoke all privileges on table public\.routine_release_attestations from public,anon,authenticated/.test(sql));
  check("public entry points are authenticated-only", /grant execute[\s\S]+to authenticated;/.test(sql));
}

async function main() {
  sourceChecks();
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
  psql("create schema if not exists storage; create table if not exists storage.buckets(id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]); create table if not exists storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null,name text not null,owner_id uuid,metadata jsonb not null default '{}',unique(bucket_id,name)); alter table storage.objects enable row level security; grant usage on schema storage to authenticated,anon; grant select,insert,update,delete on storage.objects to authenticated;");
  for (const path of baseline) psql(readFileSync(absolute(path), "utf8"), { transaction: true });
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
  const pin = validPin(); const material = sessionMaterial("1e300000-0000-4000-8000-000000000001");
  const vars = variables({ test_pin: pin, session_secret_hash: material.secretHash, session_token: material.token });
  psql(vars + readFileSync(absolute(paths.identityFixture), "utf8"));
  for (const path of migrations.slice(11)) psql(readFileSync(absolute(path), "utf8"), { transaction: true });
  psql(vars + readFileSync(absolute(paths.uiFixture), "utf8"));
  psql(vars + readFileSync(absolute(paths.employeeFixture), "utf8"));
  const before = scalar("select jsonb_build_array(mode,ui_release_stage,revision,updated_at) from public.routine_organization_settings where organization_id='a1000000-0000-4000-8000-000000000001';");
  psql(readFileSync(absolute(paths.migration), "utf8"), { transaction: true });
  check("K4 preserves mode", scalar("select mode from public.routine_organization_settings where organization_id='a1000000-0000-4000-8000-000000000001';") === JSON.parse(before)[0]);
  check("K4 preserves staff_preview stage", scalar("select ui_release_stage from public.routine_organization_settings where organization_id='a1000000-0000-4000-8000-000000000001';") === "staff_preview");
  check("K4 installs contract version", scalar("select ui_contract_version from public.routine_organization_settings where organization_id='a1000000-0000-4000-8000-000000000001';") === "phase10k4-v1");
  const after = scalar("select md5(jsonb_agg(to_jsonb(settings) order by organization_id)::text) from public.routine_organization_settings settings;");
  psql(readFileSync(absolute(paths.migration), "utf8"), { transaction: true });
  check("K4 reapply is data/revision/timestamp stable", scalar("select md5(jsonb_agg(to_jsonb(settings) order by organization_id)::text) from public.routine_organization_settings settings;") === after);
  psql(vars + readFileSync(absolute(paths.fixture), "utf8"));
  const assertions = psql(readFileSync(absolute(paths.assertions), "utf8"));
  const sqlPasses = `${assertions.stdout}\n${assertions.stderr}`.split("\n").filter((line) => line.includes("PASS "));
  check("history/pilot SQL assertions executed", sqlPasses.length >= 1);
  passCount += sqlPasses.length;
  console.log(`PASS ${sqlPasses.length} history/pilot SQL fixture checks`);
  console.log(`PASS ${passCount} Phase 10K4 history/pilot contract checks`);
}

try { await main(); }
catch (error) {
  console.error(String(error?.stack ?? error).replace(/v1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}/gi, "[REDACTED_OPERATOR_TOKEN]").replace(/\b[0-9]{6,12}\b/g, "[REDACTED_NUMERIC_SECRET]"));
  process.exitCode = 1;
} finally { cleanup(); console.log("Disposable database cleanup: complete"); }
