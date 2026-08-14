import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IMAGE = "public.ecr.aws/supabase/postgres:17.6.1.141";
const DATABASE = "phase10w_event_function_security_test";
const CONTAINER = `mesh-phase10w-${process.pid}-${randomUUID().slice(0, 8)}`;
const PASSWORD = `phase10w-${randomUUID()}`;
const MIGRATION = "supabase/phase10w_event_operations_authenticated_execute.sql";
const BASELINE = [
  "supabase/schema.sql",
  "supabase/phase7a_workbar_device_auth.sql",
  "supabase/phase5f4_close_day_archives.sql",
  "supabase/phase7c_event_access_codes.sql",
  "supabase/phase8a_event_operations_core.sql",
  "supabase/phase8c_zone_command_structure.sql",
  "supabase/phase8c2_fix_role_duplicates_and_my_zone.sql",
  "supabase/phase8f_calendar_import_realtime.sql",
  "supabase/phase8h_smart_event_plans.sql",
  "supabase/phase8h3_smart_staffing_permissions.sql",
  "supabase/phase8i_event_live_updates.sql",
  "supabase/tests/phase10/event-operation-function-security-fixtures.sql",
];
const AUTHENTICATED = [
  "public.create_event_operation_from_calendar_event(uuid)",
  "public.create_event_responsibility_handover(uuid,text,uuid,text,text,text,text)",
  "public.current_user_can_manage_event_codes()",
  "public.current_user_can_manage_event_ops()",
  "public.current_user_is_active()",
  "public.current_user_is_manager()",
  "public.current_user_is_shared_device()",
  "public.current_user_organization_id()",
  "public.current_user_profile_role()",
  "public.event_ops_event_belongs_to_current_org(uuid)",
  "public.generate_daily_event_code()",
  "public.link_calendar_event_to_event_operation(uuid,uuid)",
  "public.same_event_ops_organization(uuid)",
  "public.update_event_task_status(uuid,text,text,text)",
  "public.update_event_task_status(uuid,text,text,text,text)",
  "public.upsert_event_staff_presence(date,text,text,text,text,boolean,jsonb)",
  "public.validate_daily_event_code(text)",
];
const INTERNAL = [
  "public.enforce_event_run_sheet_plan_organization()",
  "public.rls_auto_enable()",
  "public.set_updated_at()",
];
let started = false;

if (process.argv.length > 2) throw new Error("This verifier accepts no external database arguments.");

function run(name, args, { input, allowFailure = false, timeout = 300_000 } = {}) {
  const result = spawnSync(name, args, { cwd: ROOT, encoding: "utf8", input, timeout, maxBuffer: 64 * 1024 * 1024, stdio: "pipe" });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) throw new Error(`${name} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
  return result;
}
const docker = (args, options) => run("docker", args, options);
function psql(sql, { tuplesOnly = false, allowFailure = false } = {}) {
  const args = ["exec", "-i", CONTAINER, "psql", "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--username=supabase_admin", `--dbname=${DATABASE}`];
  if (tuplesOnly) args.push("--tuples-only", "--no-align", "--quiet");
  return docker(args, { input: sql.replace(/^\uFEFF/, ""), allowFailure });
}
const scalar = (sql) => psql(sql, { tuplesOnly: true }).stdout.trim();
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const sqlArray = (values) => `array[${values.map((value) => `'${value.replaceAll("'", "''")}'`).join(",")}]::text[]`;

function file(path) {
  const absolute = resolve(ROOT, path);
  if (!absolute.startsWith(`${ROOT}/`) || !existsSync(absolute)) throw new Error(`Missing or unsafe verifier input: ${path}`);
  return absolute;
}
function apply(path) {
  psql(readFileSync(file(path), "utf8"));
  console.log(`PASS applied ${path}`);
}
function cleanup() {
  if (!started) return;
  if (!/^mesh-phase10w-[0-9]+-[a-f0-9]{8}$/.test(CONTAINER)) throw new Error("Unsafe container name.");
  docker(["rm", "--force", CONTAINER], { allowFailure: true, timeout: 30_000 });
  started = false;
}

const ALL = [...AUTHENTICATED, ...INTERNAL];
const bodyFingerprint = () => scalar(`
  select md5(coalesce(string_agg(p.oid::regprocedure::text || ':' || md5(pg_get_functiondef(p.oid)), '|' order by p.oid::regprocedure::text), ''))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and ('public.' || p.oid::regprocedure::text)=any(${sqlArray(ALL)});
`);
const tableAclFingerprint = () => scalar(`
  select md5(coalesce(string_agg(c.relname || ':' || coalesce(c.relacl::text,''), '|' order by c.relname), ''))
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p')
    and (c.relname like 'event_%' or c.relname like 'external_calendar_%');
`);
const functionAclFingerprint = () => scalar(`
  select md5(string_agg(signature || ':' || has_function_privilege('anon',signature,'execute')::text || ':' || has_function_privilege('authenticated',signature,'execute')::text, '|' order by signature))
  from unnest(${sqlArray(ALL)}) signature;
`);

async function main() {
  try {
    [...BASELINE, MIGRATION].forEach(file);
    run("docker", ["--version"]);
    docker(["image", "inspect", IMAGE]);
    docker(["run", "--detach", "--rm", "--pull", "never", "--name", CONTAINER, "--network", "none", "--env", `POSTGRES_PASSWORD=${PASSWORD}`, "--env", `POSTGRES_DB=${DATABASE}`, IMAGE]);
    started = true;

    let ready = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const logs = docker(["logs", CONTAINER], { allowFailure: true });
      const health = docker(["exec", CONTAINER, "pg_isready", "--username=supabase_admin", `--dbname=${DATABASE}`], { allowFailure: true, timeout: 10_000 });
      if (/PostgreSQL init process complete; ready for start up/i.test(`${logs.stdout}\n${logs.stderr}`) && health.status === 0) { ready = true; break; }
      pause(500);
    }
    if (!ready) throw new Error("Disposable Supabase PostgreSQL did not complete initialization.");
    console.log("PASS isolated Supabase database initialization completed");

    BASELINE.forEach(apply);
    const missing = scalar(`select coalesce(string_agg(signature,E'\\n' order by signature),'') from unnest(${sqlArray(ALL)}) signature where to_regprocedure(signature) is null;`);
    if (missing) throw new Error(`Baseline identities missing:\n${missing}`);
    console.log(`PASS baseline contains ${ALL.length} exact production identities`);

    const bodiesBefore = bodyFingerprint();
    const tablesBefore = tableAclFingerprint();
    apply(MIGRATION);

    const clientBoundary = scalar(`
      select coalesce(string_agg(signature,E'\\n' order by signature),'')
      from unnest(${sqlArray(AUTHENTICATED)}) signature
      where has_function_privilege('anon',signature,'execute')
         or not has_function_privilege('authenticated',signature,'execute');
    `);
    if (clientBoundary) throw new Error(`Client/policy function boundary failed:\n${clientBoundary}`);
    console.log(`PASS ${AUTHENTICATED.length} functions deny anon and retain authenticated EXECUTE`);

    const internalBoundary = scalar(`
      select coalesce(string_agg(signature,E'\\n' order by signature),'')
      from unnest(${sqlArray(INTERNAL)}) signature
      where has_function_privilege('anon',signature,'execute')
         or has_function_privilege('authenticated',signature,'execute');
    `);
    if (internalBoundary) throw new Error(`Internal helper remains exposed:\n${internalBoundary}`);
    console.log(`PASS ${INTERNAL.length} trigger helpers are internal-only`);

    const path = scalar("select coalesce(array_to_string(proconfig,'|'),'') from pg_proc where oid='public.set_updated_at()'::regprocedure;");
    if (!path.includes("search_path=pg_catalog, public")) throw new Error(`Unexpected set_updated_at path: ${path}`);
    if (bodyFingerprint() !== bodiesBefore) throw new Error("Function definitions changed during ACL hardening.");
    if (tableAclFingerprint() !== tablesBefore) throw new Error("Event/calendar table ACLs changed during ACL hardening.");
    console.log("PASS fixed search_path, unchanged function bodies and unchanged table ACLs");

    const denied = psql("set role anon; select public.current_user_is_active();", { allowFailure: true });
    if (denied.status === 0 || !/permission denied for function current_user_is_active/i.test(`${denied.stdout}\n${denied.stderr}`)) throw new Error("Anon runtime probe was not denied.");
    if (scalar("set role authenticated; select has_function_privilege(current_user,'public.current_user_is_active()','execute');") !== "t") throw new Error("Authenticated policy helper privilege is missing.");
    console.log("PASS runtime role probe denies anon and preserves authenticated policy execution");

    const firstAcl = functionAclFingerprint();
    apply(MIGRATION);
    if (functionAclFingerprint() !== firstAcl) throw new Error("Phase 10W is not idempotent.");
    console.log("PASS Phase 10W exact reapplication is idempotent");
  } finally {
    cleanup();
    console.log("Disposable database cleanup: complete");
  }
}

main().catch((error) => { cleanup(); console.error(error); process.exit(1); });
