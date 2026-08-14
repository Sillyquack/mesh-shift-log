import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IMAGE = "public.ecr.aws/supabase/postgres:17.6.1.141";
const DATABASE = "postgres";
const CONTAINER = `mesh-shift-log-phase10w-${process.pid}-${randomUUID().slice(0, 8)}`;
const PASSWORD = `phase10w-${randomUUID()}`;
const MIGRATION = "supabase/phase10w_event_operations_authenticated_execute.sql";
const BASELINE = [
  "supabase/schema.sql",
  "supabase/phase7a_workbar_device_auth.sql",
  "supabase/phase5f4_close_day_archives.sql",
  "supabase/phase8a_event_operations_core.sql",
  "supabase/phase8c_zone_command_structure.sql",
  "supabase/phase8c2_fix_role_duplicates_and_my_zone.sql",
  "supabase/phase8f_calendar_import_realtime.sql",
  "supabase/phase8h_smart_event_plans.sql",
  "supabase/phase8h3_smart_staffing_permissions.sql",
  "supabase/phase8i_event_live_updates.sql",
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

if (process.argv.length > 2) throw new Error("This verifier accepts no database URL, host, project, or production arguments.");

function command(name, args, options = {}) {
  const result = spawnSync(name, args, {
    cwd: ROOT,
    encoding: "utf8",
    input: options.input,
    timeout: options.timeout ?? 300_000,
    maxBuffer: 64 * 1024 * 1024,
    stdio: "pipe",
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${name} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

const docker = (args, options) => command("docker", args, options);

function psql(sql, { tuplesOnly = false, allowFailure = false } = {}) {
  const args = [
    "exec", "-i", CONTAINER,
    "psql", "--no-psqlrc", "--set=ON_ERROR_STOP=1",
    "--username=supabase_admin", `--dbname=${DATABASE}`,
  ];
  if (tuplesOnly) args.push("--tuples-only", "--no-align", "--quiet");
  return docker(args, { input: sql.replace(/^\uFEFF/, ""), allowFailure });
}

const scalar = (sql) => psql(sql, { tuplesOnly: true }).stdout.trim();
const sleep = (milliseconds) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);

function cleanup() {
  if (!started) return;
  if (!/^mesh-shift-log-phase10w-[0-9]+-[a-f0-9]{8}$/.test(CONTAINER)) throw new Error("Unsafe verifier container name.");
  docker(["rm", "--force", CONTAINER], { allowFailure: true, timeout: 30_000 });
  started = false;
}

process.once("SIGINT", () => { cleanup(); process.exit(130); });
process.once("SIGTERM", () => { cleanup(); process.exit(143); });

function absolute(path) {
  const value = resolve(ROOT, path);
  if (!value.startsWith(`${ROOT}/`) || !existsSync(value)) throw new Error(`Missing or unsafe path: ${path}`);
  return value;
}

function apply(path) {
  psql(readFileSync(absolute(path), "utf8"));
  console.log(`PASS applied ${path}`);
}

function sqlArray(values) {
  return `array[${values.map((value) => `'${value.replaceAll("'", "''")}'`).join(",")}]::text[]`;
}

const definitions = String.raw`
  select md5(coalesce(string_agg(
    p.oid::regprocedure::text || ':' || md5(pg_get_functiondef(p.oid)),
    '|' order by p.oid::regprocedure::text
  ), ''))
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and ('public.' || p.oid::regprocedure::text) = any(${sqlArray([...AUTHENTICATED, ...INTERNAL])});
`;

const tableAcls = String.raw`
  select md5(coalesce(string_agg(c.relname || ':' || coalesce(c.relacl::text, ''), '|' order by c.relname), ''))
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r','p')
    and (c.relname like 'event_%' or c.relname like 'external_calendar_%');
`;

const aclFingerprint = () => scalar(String.raw`
  select md5(string_agg(
    signature || ':' ||
    has_function_privilege('anon', signature, 'execute')::text || ':' ||
    has_function_privilege('authenticated', signature, 'execute')::text,
    '|' order by signature
  ))
  from unnest(${sqlArray([...AUTHENTICATED, ...INTERNAL])}) signature;
`);

async function main() {
  try {
    for (const path of [...BASELINE, MIGRATION]) absolute(path);
    command("docker", ["--version"]);
    docker(["image", "inspect", IMAGE]);
    docker([
      "run", "--detach", "--rm", "--pull", "never",
      "--name", CONTAINER, "--network", "none",
      "--env", `POSTGRES_PASSWORD=${PASSWORD}`,
      IMAGE,
    ]);
    started = true;

    let ready = false;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const status = docker(["exec", CONTAINER, "pg_isready", "--username=postgres", `--dbname=${DATABASE}`], { allowFailure: true, timeout: 10_000 });
      if (status.status === 0) {
        ready = true;
        break;
      }
      sleep(250);
    }
    if (!ready) throw new Error("Disposable PostgreSQL did not become ready.");
    console.log("PASS using initialized, disposable Supabase postgres database");

    for (const path of BASELINE) apply(path);

    const allFunctions = [...AUTHENTICATED, ...INTERNAL];
    const missing = scalar(String.raw`
      select coalesce(string_agg(signature, E'\n' order by signature), '')
      from unnest(${sqlArray(allFunctions)}) signature
      where to_regprocedure(signature) is null;
    `);
    if (missing) throw new Error(`Baseline is missing Phase 10W functions:\n${missing}`);
    console.log(`PASS baseline contains ${allFunctions.length} exact function identities`);

    const definitionBefore = scalar(definitions);
    const relationAclBefore = scalar(tableAcls);
    apply(MIGRATION);

    const brokenAuthenticated = scalar(String.raw`
      select coalesce(string_agg(signature, E'\n' order by signature), '')
      from unnest(${sqlArray(AUTHENTICATED)}) signature
      where has_function_privilege('anon', signature, 'execute')
         or not has_function_privilege('authenticated', signature, 'execute');
    `);
    if (brokenAuthenticated) throw new Error(`Authenticated boundary failed:\n${brokenAuthenticated}`);
    console.log(`PASS ${AUTHENTICATED.length} functions deny anon and retain authenticated EXECUTE`);

    const exposedInternal = scalar(String.raw`
      select coalesce(string_agg(signature, E'\n' order by signature), '')
      from unnest(${sqlArray(INTERNAL)}) signature
      where has_function_privilege('anon', signature, 'execute')
         or has_function_privilege('authenticated', signature, 'execute');
    `);
    if (exposedInternal) throw new Error(`Internal helper remains exposed:\n${exposedInternal}`);
    console.log(`PASS ${INTERNAL.length} trigger helpers are internal-only`);

    const fixedPath = scalar(String.raw`
      select coalesce(array_to_string(p.proconfig, '|'), '')
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'set_updated_at';
    `);
    if (!fixedPath.includes("search_path=pg_catalog, public")) throw new Error(`Unexpected set_updated_at proconfig: ${fixedPath}`);
    console.log("PASS set_updated_at has a fixed search_path");

    if (scalar(definitions) !== definitionBefore) throw new Error("Function bodies changed during ACL hardening.");
    if (scalar(tableAcls) !== relationAclBefore) throw new Error("Event/calendar relation ACLs changed during function hardening.");
    console.log("PASS function bodies and event/calendar table ACLs are unchanged");

    const anonCall = psql("set role anon; select public.current_user_is_active();", { allowFailure: true });
    if (anonCall.status === 0 || !/permission denied for function current_user_is_active/i.test(`${anonCall.stdout}\n${anonCall.stderr}`)) {
      throw new Error("Anon direct helper execution was not denied.");
    }
    const authenticatedPrivilege = scalar("set role authenticated; select has_function_privilege(current_user, 'public.current_user_is_active()', 'execute');");
    if (authenticatedPrivilege !== "t") throw new Error("Authenticated policy helper privilege is missing.");
    console.log("PASS runtime role probe denies anon and preserves authenticated policy execution");

    const firstFingerprint = aclFingerprint();
    apply(MIGRATION);
    if (aclFingerprint() !== firstFingerprint) throw new Error("Phase 10W reapply changed the effective ACL fingerprint.");
    console.log("PASS Phase 10W is idempotent under exact reapplication");
  } finally {
    cleanup();
    console.log("Disposable database cleanup: complete");
  }
}

main().catch((error) => {
  cleanup();
  console.error(error);
  process.exit(1);
});
