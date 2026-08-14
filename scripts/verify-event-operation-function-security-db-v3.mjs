import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IMAGE = "public.ecr.aws/supabase/postgres:17.6.1.141";
const DB = "phase10w_event_function_security_test";
const NAME = `mesh-phase10w-${process.pid}-${randomUUID().slice(0, 8)}`;
const MIGRATION = "supabase/phase10w_event_operations_authenticated_execute.sql";
const BASELINE = [
  "supabase/schema.sql", "supabase/phase7a_workbar_device_auth.sql", "supabase/phase5f4_close_day_archives.sql",
  "supabase/phase7c_event_access_codes.sql", "supabase/phase8a_event_operations_core.sql",
  "supabase/phase8c_zone_command_structure.sql", "supabase/phase8c2_fix_role_duplicates_and_my_zone.sql",
  "supabase/phase8f_calendar_import_realtime.sql", "supabase/phase8h_smart_event_plans.sql",
  "supabase/phase8h3_smart_staffing_permissions.sql", "supabase/phase8i_event_live_updates.sql",
  "supabase/tests/phase10/event-operation-function-security-fixtures.sql",
];
const CLIENT = [
  "public.create_event_operation_from_calendar_event(uuid)",
  "public.create_event_responsibility_handover(uuid,text,uuid,text,text,text,text)",
  "public.current_user_can_manage_event_codes()", "public.current_user_can_manage_event_ops()",
  "public.current_user_is_active()", "public.current_user_is_manager()", "public.current_user_is_shared_device()",
  "public.current_user_organization_id()", "public.current_user_profile_role()",
  "public.event_ops_event_belongs_to_current_org(uuid)", "public.generate_daily_event_code()",
  "public.link_calendar_event_to_event_operation(uuid,uuid)", "public.same_event_ops_organization(uuid)",
  "public.update_event_task_status(uuid,text,text,text)", "public.update_event_task_status(uuid,text,text,text,text)",
  "public.upsert_event_staff_presence(date,text,text,text,text,boolean,jsonb)", "public.validate_daily_event_code(text)",
];
const INTERNAL = ["public.enforce_event_run_sheet_plan_organization()", "public.rls_auto_enable()", "public.set_updated_at()"];
const ALL = [...CLIENT, ...INTERNAL];
let started = false;

if (process.argv.length > 2) throw new Error("No external database arguments are accepted.");
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", input: options.input, timeout: options.timeout ?? 300000, maxBuffer: 64 * 1024 * 1024, stdio: "pipe" });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) throw new Error(`${command} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
  return result;
}
const docker = (args, options) => run("docker", args, options);
function psql(sql, options = {}) {
  const args = ["exec", "-i", NAME, "psql", "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--username=supabase_admin", `--dbname=${DB}`];
  if (options.tuplesOnly) args.push("--tuples-only", "--no-align", "--quiet");
  return docker(args, { input: sql.replace(/^\uFEFF/, ""), allowFailure: options.allowFailure });
}
const scalar = (sql) => psql(sql, { tuplesOnly: true }).stdout.trim();
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const array = (values) => `array[${values.map((v) => `'${v.replaceAll("'", "''")}'`).join(",")}]::text[]`;
function path(name) {
  const absolute = resolve(ROOT, name);
  if (!absolute.startsWith(`${ROOT}/`) || !existsSync(absolute)) throw new Error(`Missing/unsafe input: ${name}`);
  return absolute;
}
function apply(name) { psql(readFileSync(path(name), "utf8")); console.log(`PASS applied ${name}`); }
function cleanup() {
  if (!started) return;
  if (!/^mesh-phase10w-[0-9]+-[a-f0-9]{8}$/.test(NAME)) throw new Error("Unsafe container name");
  docker(["rm", "--force", NAME], { allowFailure: true, timeout: 30000 });
  started = false;
}

const codeHash = () => scalar(`
  select md5(coalesce(string_agg(p.oid::regprocedure::text || ':' || md5(p.prosrc), '|' order by p.oid::regprocedure::text),''))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and ('public.' || p.oid::regprocedure::text)=any(${array(ALL)});`);
const tableAclHash = () => scalar(`
  select md5(coalesce(string_agg(c.relname || ':' || coalesce(c.relacl::text,''), '|' order by c.relname),''))
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') and (c.relname like 'event_%' or c.relname like 'external_calendar_%');`);
const functionAclHash = () => scalar(`
  select md5(string_agg(s || ':' || has_function_privilege('anon',s,'execute')::text || ':' || has_function_privilege('authenticated',s,'execute')::text,'|' order by s))
  from unnest(${array(ALL)}) s;`);

async function main() {
  try {
    [...BASELINE, MIGRATION].forEach(path);
    run("docker", ["--version"]); docker(["image", "inspect", IMAGE]);
    docker(["run", "--detach", "--rm", "--pull", "never", "--name", NAME, "--network", "none", "--env", `POSTGRES_PASSWORD=phase10w-${randomUUID()}`, "--env", `POSTGRES_DB=${DB}`, IMAGE]);
    started = true;
    let ready = false;
    for (let i = 0; i < 100; i += 1) {
      const logs = docker(["logs", NAME], { allowFailure: true });
      const health = docker(["exec", NAME, "pg_isready", "--username=supabase_admin", `--dbname=${DB}`], { allowFailure: true, timeout: 10000 });
      if (/PostgreSQL init process complete; ready for start up/i.test(`${logs.stdout}\n${logs.stderr}`) && health.status === 0) { ready = true; break; }
      sleep(500);
    }
    if (!ready) throw new Error("Disposable Supabase database did not initialize");
    console.log("PASS isolated Supabase initialization");
    BASELINE.forEach(apply);

    const missing = scalar(`select coalesce(string_agg(s,E'\\n' order by s),'') from unnest(${array(ALL)}) s where to_regprocedure(s) is null;`);
    if (missing) throw new Error(`Missing production identities:\n${missing}`);
    const beforeCode = codeHash(); const beforeTables = tableAclHash();
    apply(MIGRATION);

    const badClient = scalar(`select coalesce(string_agg(s,E'\\n' order by s),'') from unnest(${array(CLIENT)}) s where has_function_privilege('anon',s,'execute') or not has_function_privilege('authenticated',s,'execute');`);
    const badInternal = scalar(`select coalesce(string_agg(s,E'\\n' order by s),'') from unnest(${array(INTERNAL)}) s where has_function_privilege('anon',s,'execute') or has_function_privilege('authenticated',s,'execute');`);
    if (badClient) throw new Error(`Client boundary failed:\n${badClient}`);
    if (badInternal) throw new Error(`Internal boundary failed:\n${badInternal}`);
    console.log(`PASS ${CLIENT.length} authenticated functions and ${INTERNAL.length} internal helpers`);

    const config = scalar("select coalesce(array_to_string(proconfig,'|'),'') from pg_proc where oid='public.set_updated_at()'::regprocedure;");
    if (!config.includes("search_path=pg_catalog, public")) throw new Error(`Bad set_updated_at config: ${config}`);
    if (codeHash() !== beforeCode) throw new Error("Function source code changed during ACL hardening");
    if (tableAclHash() !== beforeTables) throw new Error("Event/calendar table ACLs changed");
    console.log("PASS source code stable, search_path fixed and table ACLs unchanged");

    const anon = psql("set role anon; select public.current_user_is_active();", { allowFailure: true });
    if (anon.status === 0 || !/permission denied for function current_user_is_active/i.test(`${anon.stdout}\n${anon.stderr}`)) throw new Error("Anon runtime call not denied");
    if (scalar("set role authenticated; select has_function_privilege(current_user,'public.current_user_is_active()','execute');") !== "t") throw new Error("Authenticated policy helper unavailable");
    console.log("PASS runtime anon/authenticated probe");

    const first = functionAclHash(); apply(MIGRATION);
    if (functionAclHash() !== first || codeHash() !== beforeCode || tableAclHash() !== beforeTables) throw new Error("Exact reapplication changed effective state");
    console.log("PASS Phase 10W exact reapplication is idempotent");
  } finally { cleanup(); console.log("Disposable database cleanup: complete"); }
}
main().catch((error) => { cleanup(); console.error(error); process.exit(1); });
