import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IMAGE = "public.ecr.aws/supabase/postgres:17.6.1.127";
const OWNER_CONTEXT = process.env.PHASE10O_OWNER_CONTEXT === "production" ? "production" : "rehearsal";
const DATABASE = `phase10_full_reapply_${OWNER_CONTEXT}_test`;
const ROLE = OWNER_CONTEXT === "production" ? "postgres" : "supabase_admin";
const SESSION_ROLE = OWNER_CONTEXT === "production" ? "postgres" : "phase10o_rehearsal_login";
const CONNECTION_ROLE = OWNER_CONTEXT === "production" ? "postgres" : "supabase_admin";
const CONTAINER = `mesh-shift-log-phase10-full-reapply-${process.pid}-${randomUUID().slice(0, 8)}`;
const PASSWORD = `phase10-full-reapply-${randomUUID()}`;
const MANAGER_ID = "aa100000-0000-4000-8000-000000000001";
const STAFF_ID = "aa100000-0000-4000-8000-000000000002";
const SHARED_DEVICE_ID = "aa100000-0000-4000-8000-000000000003";
const PRESERVED_MANAGER_ID = "aa100000-0000-4000-8000-000000000004";
const FUTURE_MANAGER_ID = "ad100000-0000-4000-8000-000000000001";
const FUTURE_STAFF_ID = "ad100000-0000-4000-8000-000000000002";
const FUTURE_SHARED_DEVICE_ID = "ad100000-0000-4000-8000-000000000003";
const ORGANIZATION_ID = "aa000000-0000-4000-8000-000000000001";
const PRESERVED_ORGANIZATION_ID = "ab000000-0000-4000-8000-000000000001";
const SECONDARY_ORGANIZATION_ID = "ac000000-0000-4000-8000-000000000001";
const FUTURE_ORGANIZATION_ID = "ad000000-0000-4000-8000-000000000001";
const EXPECTED_PACK_HASH = "48b7c4dfdb1340ddff14748a3c6d57df504f33fe822f25b6dde0d4ab48a6caf8";
const EXPECTED_PHASE10R_PACK_HASH = "b416001c2885bbf54bdb029b8e7164cbb903a76b8344396a4e9fcffa26107fe1";
const EXPECTED_PREVIOUS_PACK_HASH = "2dcfc69b822f973c23e54934b6799faa5b9400ae0529096f049067811a417f25";
const EXPECTED_SOURCE_HASHES = [
  "ea00e80bde6c17ea1d3f1095949363d79d606dcee16f05f742426c1c5248e079",
  "27698f86716a141268546c623609f8b956213e53f20d00c03935cad01bd9244c",
  "f4fce4d5a3dcafecd7dfca2a5bf780f7c3652634da2cb0f068daa5d4f506a0eb",
  "8ebedb39be888dfa118a429fa2046ba2b7b5dc49c868d9d5b811f2aa89b45351",
  "d0280ca6e780f8f6876ad8747f0ee80693ebb1aa0a15761b63962376f8e54224",
  "7ee5032edc7518e80aec18e5f4ce50a3c7a12e48aa9e560727c87d672c3c72f1",
  "56cc1ac9b6fc1cdc89586f8539e185dfef6e6a5d54d483bbdffcbb1d7ff4c2af",
];
const EXPECTED_ARGUMENT_NAMES = ["input_version_id", "input_publication_version_ids"];
const EXPECTED_PORTABLE_SCHEMA_FINGERPRINT = "1285920a3b13f2337871e3355751fc9043f17e380c55dec43f86ca01cff612e5";
const EXPECTED_AUTHENTICATED_FUNCTION_COUNT = 218;
const EXPECTED_AUTHENTICATED_FUNCTION_HASH = "61446c15b10333748c65a652f01f6c9e91df67b81593f4db65bc7f0c2bee2a0e";
const EXPECTED_AUTHENTICATED_RELATION_SELECT_COUNT = 65;
const EXPECTED_AUTHENTICATED_RELATION_SELECT_HASH = "9f02d0f0f22ef6c607f793210fda83deb88e23cbb68943834ba41dabb206f5bd";
const EXPECTED_OWNER_ROLES = new Set(["pg_database_owner", "postgres", "supabase_admin", "supabase_storage_admin"]);
const REPRODUCED_ACL_EXPECTATIONS = Object.freeze({
  "get_routine_run_timeline(uuid)": "public",
  "get_routine_run_workspace(uuid)": "public",
  "get_routine_task_timeline(uuid)": "public",
  "get_routine_delivery_record(uuid)": "public",
  "routine_preview_run_delivery(uuid)": "internal",
  "routine_finalize_run_extension(uuid)": "internal",
  "get_routine_delivery_comparison(uuid)": "public",
  "routine_validate_run_completion(uuid)": "internal",
  "cancel_routine_run(uuid,text,bigint,uuid)": "public",
  "reopen_routine_run(uuid,text,bigint,uuid)": "public",
  "routine_delivery_item_canonical_json(uuid)": "internal",
  "routine_delivery_record_canonical_json(uuid)": "internal",
  "routine_preview_delivery_item_canonical(jsonb)": "internal",
  "validate_routine_template_version(uuid,uuid[])": "public",
  "list_routine_delivery_mismatches(date,date,text)": "public",
  "routine_resolve_condition_fact(uuid,jsonb,timestamp with time zone)": "internal",
  "propose_routine_transfer(uuid,text,text,uuid,uuid,text,text,timestamp with time zone,bigint,uuid)": "public",
});
const ADDITIONAL_ACL_EXPECTATIONS = Object.freeze({
  "routine_bundle_guard()": "internal",
  "routine_bundle_step_guard()": "internal",
  "routine_bundle_run_validate()": "internal",
  "routine_external_state_guard()": "internal",
  "routine_phase10h_immutable_guard()": "internal",
  "routine_phase10i_immutable_guard()": "internal",
  "routine_select_current_valid_run_verification(uuid)": "internal",
  "routine_select_current_valid_task_verification(uuid)": "internal",
  "routine_current_authenticated_profile_id()": "public",
  "routine_current_effective_profile_id()": "public",
  "routine_current_effective_operator_id()": "public",
  "routine_current_shared_device_id()": "public",
  "routine_current_operator_session_id()": "public",
  "routine_current_actor_source()": "public",
  "routine_current_actor_display_name()": "public",
});
const ACL_EXPECTATIONS = Object.freeze({ ...REPRODUCED_ACL_EXPECTATIONS, ...ADDITIONAL_ACL_EXPECTATIONS });
const REPRODUCED_ACL_SIGNATURES = Object.keys(REPRODUCED_ACL_EXPECTATIONS);
const ACL_SIGNATURES = Object.keys(ACL_EXPECTATIONS);
let started = false;
let passCount = 0;
let migrationApplications = 0;
let stableDefaultAclFingerprint = null;

if (process.argv.length > 2) {
  throw new Error("This verifier accepts no network, URL, host, project, or production arguments.");
}

const absolute = (path) => resolve(ROOT, path);
function check(label, condition) {
  if (!condition) throw new Error(`FAIL ${String(passCount + 1).padStart(3, "0")} ${label}`);
  passCount += 1;
  console.log(`PASS ${String(passCount).padStart(3, "0")} ${label}`);
}
function command(name, args, options = {}) {
  const result = spawnSync(name, args, {
    cwd: ROOT,
    encoding: "utf8",
    input: options.input,
    timeout: options.timeout ?? 300_000,
    maxBuffer: options.maxBuffer ?? 64 * 1024 * 1024,
    stdio: "pipe",
    env: options.env ?? process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${name} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}
const docker = (args, options) => command("docker", args, options);
function psql(sql, { tuplesOnly = false, transaction = false, allowFailure = false } = {}) {
  const args = [
    "exec", "-i", CONTAINER, "psql", "--no-psqlrc", "--set=ON_ERROR_STOP=1",
    `--username=${CONNECTION_ROLE}`, `--dbname=${DATABASE}`,
  ];
  if (tuplesOnly) args.push("--tuples-only", "--no-align", "--quiet");
  if (transaction) args.push("--single-transaction");
  const roleSql = ROLE === "postgres" ? ""
    : `set session authorization ${SESSION_ROLE};\nset role ${ROLE};\n`;
  return docker(args, { input: `${roleSql}${sql.replace(/^\uFEFF/, "")}`, allowFailure, timeout: 300_000 });
}
const scalar = (sql) => psql(sql, { tuplesOnly: true }).stdout.trim();
const fingerprint = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function cleanup() {
  if (!started) return;
  if (!/^mesh-shift-log-phase10-full-reapply-[0-9]+-[a-f0-9]{8}$/.test(CONTAINER)) {
    throw new Error("Unsafe verifier container name.");
  }
  docker(["rm", "--force", CONTAINER], { allowFailure: true, timeout: 30_000 });
  const remaining = docker(["container", "inspect", CONTAINER], { allowFailure: true, timeout: 30_000 });
  started = remaining.status === 0;
}
process.once("SIGINT", () => { cleanup(); process.exit(130); });
process.once("SIGTERM", () => { cleanup(); process.exit(143); });

const baseline = [
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
  "supabase/phase9a_inventory_stocktaking.sql",
  "supabase/phase9b_stock_policies.sql",
];
const migrations = [
  "supabase/phase10a_routine_engine_foundation.sql",
  "supabase/phase10a1_routine_organization_settings_bootstrap.sql",
  "supabase/phase10b_routine_templates.sql",
  "supabase/phase10c_routine_reference_images.sql",
  "supabase/phase10d_routine_runs_and_snapshots.sql",
  "supabase/phase10e_routine_task_lifecycle.sql",
  "supabase/phase10f_routine_operational_time.sql",
  "supabase/phase10g_routine_closing_delivery.sql",
  "supabase/phase10h_routine_double_shift.sql",
  "supabase/phase10i_routine_realtime_offline_sync.sql",
  "supabase/phase10j_routine_shared_device_identity.sql",
  "supabase/phase10k1_routine_ui_pilot_gate.sql",
  "supabase/phase10k2_routine_manager_control_center.sql",
  "supabase/phase10k3_routine_employee_workflow.sql",
  "supabase/phase10k4_routine_history_pilot_hardening.sql",
  "supabase/phase10l_mesh_routine_content_pack.sql",
  "supabase/phase10p_routine_readiness_finalization.sql",
  "supabase/phase10q_mesh_routine_content_pack_1_2r.sql",
  "supabase/phase10o_routine_default_privilege_hardening.sql",
  "supabase/phase10r_mesh_routine_content_pack_1_3r.sql",
  "supabase/phase10s_mesh_routine_content_pack_1_4r.sql",
  "supabase/phase10t_routine_participant_identity_conflict_alignment.sql",
  "supabase/phase10u_routine_operation_idempotency_convergence.sql",
  "supabase/phase10v_routine_creation_idempotency_provenance_alignment.sql",
];
const phase10Sql = () => migrations.map((path) => readFileSync(absolute(path), "utf8")).join("\n");

function splitArguments(text) {
  const values = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (quote) {
      if (character === quote) {
        if (next === quote) index += 1;
        else quote = null;
      }
      continue;
    }
    if (character === "'" || character === '"') { quote = character; continue; }
    if (character === "(" || character === "[") { depth += 1; continue; }
    if (character === ")" || character === "]") { depth -= 1; continue; }
    if (character === "," && depth === 0) {
      values.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  const tail = text.slice(start).trim();
  if (tail) values.push(tail);
  return values;
}

function parseInputArgument(raw) {
  const withoutDefault = raw.replace(/\s+(?:default\s+|=)[\s\S]*$/i, "").trim();
  const tokens = withoutDefault.split(/\s+/);
  let mode = "in";
  if (["in", "out", "inout", "variadic"].includes(tokens[0]?.toLowerCase())) mode = tokens.shift().toLowerCase();
  if (mode === "out") return null;
  const name = tokens.shift()?.replace(/^"|"$/g, "") ?? "";
  return { name, type: tokens.join(" ").toLowerCase().replace(/\s+/g, " "), mode };
}

function auditRepeatedFunctionArguments() {
  const definitions = [];
  for (const file of migrations) {
    const sql = readFileSync(absolute(file), "utf8");
    const regex = /create\s+(?:or\s+replace\s+)?function\s+((?:[a-z_][a-z0-9_]*\.)?[a-z_][a-z0-9_]*)\s*\(/ig;
    for (const match of sql.matchAll(regex)) {
      let index = match.index + match[0].length;
      let depth = 1;
      let quote = null;
      for (; index < sql.length && depth > 0; index += 1) {
        const character = sql[index];
        const next = sql[index + 1];
        if (quote) {
          if (character === quote) {
            if (next === quote) index += 1;
            else quote = null;
          }
          continue;
        }
        if (character === "'" || character === '"') { quote = character; continue; }
        if (character === "(") depth += 1;
        else if (character === ")") depth -= 1;
      }
      const rawArguments = sql.slice(match.index + match[0].length, index - 1);
      const args = splitArguments(rawArguments).map(parseInputArgument).filter(Boolean);
      const name = match[1].includes(".") ? match[1] : `public.${match[1]}`;
      const identity = `${name}(${args.map((argument) => argument.type).join(",")})`;
      const line = sql.slice(0, match.index).split("\n").length;
      definitions.push({ identity, names: args.map((argument) => argument.name), file, line });
    }
  }
  const groups = new Map();
  for (const definition of definitions) {
    const entries = groups.get(definition.identity) ?? [];
    entries.push(definition);
    groups.set(definition.identity, entries);
  }
  const repeated = [...groups.entries()].filter(([, entries]) => entries.length > 1);
  const drifts = repeated.filter(([, entries]) => new Set(entries.map((entry) => JSON.stringify(entry.names))).size > 1);
  const target = definitions.filter((definition) => definition.identity === "public.validate_routine_template_version(uuid,uuid[])");
  return { definitions, repeated, drifts, target };
}

function sourceChecks() {
  for (const path of [...baseline, ...migrations, "content/routine-engine/mesh-routine-content-v1.json", "content/routine-engine/mesh-routine-content-v1-2r.json", "content/routine-engine/mesh-routine-content-v1-3r.json", "content/routine-engine/mesh-routine-content-v1-4r.json", "src/features/routines-v2/api/routineTemplateClient.js"]) {
    check(`required file exists: ${path}`, existsSync(absolute(path)));
  }
  const audit = auditRepeatedFunctionArguments();
  console.log(`Static function audit: ${audit.definitions.length} definitions, ${audit.repeated.length} repeated identities, ${audit.drifts.length} drifts`);
  check("all repeated Phase 10 function identities have stable input argument names", audit.drifts.length === 0);
  check("function argument audit covers the full Phase 10 definition set", audit.definitions.length === 556 && audit.repeated.length === 93);
  check("validator has six layered public definitions", audit.target.length === 6);
  check("every validator definition uses the canonical input names", audit.target.every((entry) => JSON.stringify(entry.names) === JSON.stringify(EXPECTED_ARGUMENT_NAMES)));
  check("ACL hardening inventory contains the reproduced 17 signatures", REPRODUCED_ACL_SIGNATURES.length === 17);
  check("full ACL audit contains 15 additional same-class signatures", ACL_SIGNATURES.length === 32);

  const allSql = phase10Sql();
  const bootstrapSql = readFileSync(absolute(migrations[1]), "utf8");
  const verifierSource = readFileSync(fileURLToPath(import.meta.url), "utf8");
  const forbiddenBootstrapCall = ["select public.create_or_update_", "routine_organization_settings("].join("");
  const applySequenceSource = verifierSource.slice(
    verifierSource.indexOf("function applySequence("),
    verifierSource.indexOf("function futureOrganizationChecks("),
  );
  check("full Phase 10 manifest contains 24 ordered migrations through 10V", migrations.length === 24
    && migrations[0].endsWith("phase10a_routine_engine_foundation.sql")
    && migrations[1].endsWith("phase10a1_routine_organization_settings_bootstrap.sql")
    && migrations.at(-9).endsWith("phase10l_mesh_routine_content_pack.sql")
    && migrations.at(-8).endsWith("phase10p_routine_readiness_finalization.sql")
    && migrations.at(-7).endsWith("phase10q_mesh_routine_content_pack_1_2r.sql")
    && migrations.at(-6).endsWith("phase10o_routine_default_privilege_hardening.sql")
    && migrations.at(-5).endsWith("phase10r_mesh_routine_content_pack_1_3r.sql")
    && migrations.at(-4).endsWith("phase10s_mesh_routine_content_pack_1_4r.sql")
    && migrations.at(-3).endsWith("phase10t_routine_participant_identity_conflict_alignment.sql")
    && migrations.at(-2).endsWith("phase10u_routine_operation_idempotency_convergence.sql")
    && migrations.at(-1).endsWith("phase10v_routine_creation_idempotency_provenance_alignment.sql"));
  check("10A1 is a system bootstrap with no manager RPC installation step",
    !/create_or_update_routine_organization_settings|auth\.uid\s*\(|\bgrant\b|\bcreate\s+(?:or\s+replace\s+)?function\b/i.test(bootstrapSql));
  check("full-reapply migration sequence contains no out-of-band settings manager bootstrap",
    !applySequenceSource.includes(forbiddenBootstrapCall));
  check("future-organization probe uses the manager RPC only after the complete migration sequence",
    verifierSource.indexOf(forbiddenBootstrapCall) > verifierSource.indexOf("function futureOrganizationChecks("));
  check("Phase 10 migrations contain no DROP CASCADE", !/\bdrop\s+(?:function|table|schema|type|view|materialized\s+view|trigger|policy|publication)[^;]*\bcascade\b/i.test(allSql));
  const defaultPrivilegeStatements = [...allSql.matchAll(/alter\s+default\s+privileges[^;]+;/ig)].map((match) => match[0]);
  check("only 10O changes default privileges and never names an owner role",
    defaultPrivilegeStatements.length === 10
      && defaultPrivilegeStatements.every((statement) => /\brevoke\b/i.test(statement) && !/\bfor\s+(?:user|role)\b/i.test(statement))
      && !migrations.filter((path) => !path.endsWith("phase10o_routine_default_privilege_hardening.sql")).some((path) => /\balter\s+default\s+privileges\b/i.test(readFileSync(absolute(path), "utf8"))));
  const phase10oSql = readFileSync(absolute(migrations.find((path) => path.endsWith("phase10o_routine_default_privilege_hardening.sql"))), "utf8");
  check("10O is future-only DDL in one explicit transaction",
    /^begin;/i.test(phase10oSql.trim()) && /commit;\s*$/i.test(phase10oSql.trim())
      && !/\b(?:insert|update|delete|merge|truncate|create\s+(?:or\s+replace\s+)?function|grant\s+|alter\s+(?:table|function|policy)|drop\s+)\b/i.test(phase10oSql));
  check("ACL hardening uses no broad all-functions revoke", !/\brevoke\b[^;]*\bon\s+all\s+functions\b/i.test(allSql));
  check("Phase 10 policies contain no unconditional true predicate", !/\busing\s*\(\s*true\s*\)|\bwith\s+check\s*\(\s*true\s*\)/i.test(allSql));
  check("legacy validator key is absent from all Phase 10 migrations", !/\binput_batch_version_ids\b/.test(allSql));

  const client = readFileSync(absolute("src/features/routines-v2/api/routineTemplateClient.js"), "utf8");
  check("Supabase RPC payload uses the canonical validator key", client.includes("input_publication_version_ids") && !client.includes("input_batch_version_ids"));
  const baselinePack = JSON.parse(readFileSync(absolute("content/routine-engine/mesh-routine-content-v1.json"), "utf8"));
  const previousPack = JSON.parse(readFileSync(absolute("content/routine-engine/mesh-routine-content-v1-2r.json"), "utf8"));
  const frozenServicewarePack = JSON.parse(readFileSync(absolute("content/routine-engine/mesh-routine-content-v1-3r.json"), "utf8"));
  const pack = JSON.parse(readFileSync(absolute("content/routine-engine/mesh-routine-content-v1-4r.json"), "utf8"));
  check("frozen content pack 1.1R remains canonical", baselinePack.packVersion === "1.1R" && baselinePack.packHash === "c149a8416a867dcb7d87224f3ae8e2a214e5ca4954613b118521ebe5ae3aff2a");
  check("frozen content pack 1.2R remains canonical", previousPack.packVersion === "1.2R" && previousPack.packHash === EXPECTED_PREVIOUS_PACK_HASH);
  check("frozen content pack 1.3R remains canonical", frozenServicewarePack.packVersion === "1.3R" && frozenServicewarePack.packHash === EXPECTED_PHASE10R_PACK_HASH);
  check("content pack hash remains canonical", pack.packHash === EXPECTED_PACK_HASH);
  check("content pack minor version is 1.4R", pack.packVersion === "1.4R");
  check("authoritative content source hashes remain canonical", JSON.stringify(pack.sourceDocuments.map((entry) => entry.sha256)) === JSON.stringify(EXPECTED_SOURCE_HASHES));
  check("content pack shape remains 37 Opening, 46 Closing, and four system steps", pack.opening.tasks.length === 37 && pack.closing.tasks.length === 46 && pack.doubleShiftSteps.length === 4);
  check("serviceware route resolves the final content blocker", pack.unresolvedRequirements.length === 0 && pack.standards.filter((entry) => entry.currentRevision).length === 14);
}

const storageBootstrapSql = String.raw`
create schema if not exists storage;
create table if not exists storage.buckets(
  id text primary key,name text not null,public boolean not null default false,
  file_size_limit bigint,allowed_mime_types text[]
);
create table if not exists storage.objects(
  id uuid primary key default gen_random_uuid(),bucket_id text not null,name text not null,
  owner_id uuid,metadata jsonb not null default '{}'::jsonb,unique(bucket_id,name)
);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated,anon;
grant select,insert,update,delete on storage.objects to authenticated;
`;

const baselineFixtureSql = String.raw`
insert into auth.users(id) values
  ('${MANAGER_ID}'),('${STAFF_ID}'),('${SHARED_DEVICE_ID}'),('${PRESERVED_MANAGER_ID}');
insert into public.organizations(id,name,slug,created_at) values
  ('${ORGANIZATION_ID}','Full reapply fixture','phase10-full-reapply-fixture','2026-01-01 00:00:00+00'),
  ('${PRESERVED_ORGANIZATION_ID}','Preserved settings fixture','phase10-preserved-settings-fixture','2026-01-01 00:00:00+00'),
  ('${SECONDARY_ORGANIZATION_ID}','Secondary bootstrap fixture','phase10-secondary-bootstrap-fixture','2026-01-01 00:00:00+00');
insert into public.user_profiles(
  id,organization_id,display_name,role,active,is_shared_device,shared_device_label,created_at,updated_at
) values
  ('${MANAGER_ID}','${ORGANIZATION_ID}','Reapply Manager','manager',true,false,null,'2026-01-01 00:00:00+00','2026-01-01 00:00:00+00'),
  ('${STAFF_ID}','${ORGANIZATION_ID}','Reapply Staff','staff',true,false,null,'2026-01-01 00:00:00+00','2026-01-01 00:00:00+00'),
  ('${SHARED_DEVICE_ID}','${ORGANIZATION_ID}','Reapply Shared Device','staff',true,true,'Shared device fixture','2026-01-01 00:00:00+00','2026-01-01 00:00:00+00'),
  ('${PRESERVED_MANAGER_ID}','${PRESERVED_ORGANIZATION_ID}','Preserved Settings Manager','manager',true,false,null,'2026-01-01 00:00:00+00','2026-01-01 00:00:00+00');

insert into public.inventory_products(
  id,organization_id,name,short_name,sku,category,unit_label,active,sort_order,metadata,
  created_at,updated_at,created_by_auth_user_id,updated_by_auth_user_id
) values(
  'aa200000-0000-4000-8000-000000000001','${ORGANIZATION_ID}','Fixture milk','Milk','REAPPLY-MILK','Fixture','carton',true,0,'{}',
  '2026-01-01 00:00:00+00','2026-01-01 00:00:00+00','${MANAGER_ID}','${MANAGER_ID}'
);
insert into public.inventory_locations(
  id,organization_id,name,code,location_type,active,sort_order,metadata,
  created_at,updated_at,created_by_auth_user_id,updated_by_auth_user_id
) values(
  'aa300000-0000-4000-8000-000000000001','${ORGANIZATION_ID}','Fixture fridge','REAPPLY_FRIDGE','fridge',true,0,'{}',
  '2026-01-01 00:00:00+00','2026-01-01 00:00:00+00','${MANAGER_ID}','${MANAGER_ID}'
);
insert into public.inventory_location_products(
  id,organization_id,location_id,product_id,par_quantity,count_order,active,stock_policy,metadata,
  created_at,updated_at,created_by_auth_user_id,updated_by_auth_user_id
) values(
  'aa400000-0000-4000-8000-000000000001','${ORGANIZATION_ID}',
  'aa300000-0000-4000-8000-000000000001','aa200000-0000-4000-8000-000000000001',2,0,true,'exact_par','{}',
  '2026-01-01 00:00:00+00','2026-01-01 00:00:00+00','${MANAGER_ID}','${MANAGER_ID}'
);
insert into public.inventory_count_sessions(
  id,organization_id,title,count_type,status,count_date,started_at,started_by_auth_user_id,started_by_name,metadata,created_at,updated_at
) values(
  'aa500000-0000-4000-8000-000000000001','${ORGANIZATION_ID}','Fixture count','daily','in_progress','2026-01-01',
  '2026-01-01 08:00:00+00','${MANAGER_ID}','Reapply Manager','{}','2026-01-01 08:00:00+00','2026-01-01 08:00:00+00'
);
insert into public.inventory_count_lines(
  id,organization_id,session_id,location_id,product_id,product_name_snapshot,location_name_snapshot,
  unit_label_snapshot,category_snapshot,par_quantity_snapshot,stock_policy_snapshot,metadata,created_at,updated_at
) values(
  'aa600000-0000-4000-8000-000000000001','${ORGANIZATION_ID}','aa500000-0000-4000-8000-000000000001',
  'aa300000-0000-4000-8000-000000000001','aa200000-0000-4000-8000-000000000001',
  'Fixture milk','Fixture fridge','carton','Fixture',2,'exact_par','{}','2026-01-01 08:00:00+00','2026-01-01 08:00:00+00'
);
insert into public.asset_registry(
  id,organization_id,asset_type,provider,model,serial_number,expected_venue,expected_station,
  active,condition,default_required_for_closing,local_id,source,created_at,updated_at
) values(
  'aa700000-0000-4000-8000-000000000001','${ORGANIZATION_ID}','tablet','Mesh Devices','FixturePad','REAPPLY-001',
  'Youngstorget','Workbar',true,'ok',true,'reapply-tablet','app','2026-01-01 00:00:00+00','2026-01-01 00:00:00+00'
);

insert into public.event_operations(
  id,organization_id,event_date,title,venue,starts_at,ends_at,status,source,source_ref,
  created_by_auth_user_id,created_by_name,active_responsible_name,active_responsible_auth_user_id,metadata,created_at,updated_at
) values(
  'aa800000-0000-4000-8000-000000000001','${ORGANIZATION_ID}','2026-01-01','Fixture event','workbar',
  '2026-01-01 16:00:00+00','2026-01-01 23:00:00+00','active','full_reapply','fixture-event',
  '${MANAGER_ID}','Reapply Manager','Reapply Manager','${MANAGER_ID}','{"fixture":true}',
  '2026-01-01 00:00:00+00','2026-01-01 00:00:00+00'
);
insert into public.event_role_assignments(
  id,organization_id,event_id,role_key,role_label,zone,assigned_auth_user_id,assigned_operator_name,
  assigned_operator_source,assigned_by_auth_user_id,assigned_by_name,active,created_at,updated_at
) values(
  'aa810000-0000-4000-8000-000000000001','${ORGANIZATION_ID}','aa800000-0000-4000-8000-000000000001',
  'event_floor_manager','Event Floor Manager','workbar','${MANAGER_ID}','Reapply Manager','personal',
  '${MANAGER_ID}','Reapply Manager',true,'2026-01-01 00:00:00+00','2026-01-01 00:00:00+00'
);
insert into public.event_calendar_sources(
  id,organization_id,provider,name,calendar_id,active,settings,created_by,created_at,updated_at
) values(
  'aa820000-0000-4000-8000-000000000001','${ORGANIZATION_ID}','google','Fixture calendar','fixture-calendar',true,'{}',
  '${MANAGER_ID}','2026-01-01 00:00:00+00','2026-01-01 00:00:00+00'
);
insert into public.external_calendar_events(
  id,organization_id,source_id,provider,provider_event_id,provider_calendar_id,ical_uid,title,description,location,
  starts_at,ends_at,status,raw_payload,provider_updated_at,created_at,updated_at
) values(
  'aa830000-0000-4000-8000-000000000001','${ORGANIZATION_ID}','aa820000-0000-4000-8000-000000000001',
  'google','fixture-booking','fixture-calendar','fixture-booking@example.invalid','Fixture booking','Synthetic data','workbar',
  '2026-01-01 16:00:00+00','2026-01-01 23:00:00+00','confirmed','{"fixture":true}',
  '2026-01-01 00:00:00+00','2026-01-01 00:00:00+00','2026-01-01 00:00:00+00'
);
insert into public.event_operation_calendar_links(
  id,organization_id,event_operation_id,external_calendar_event_id,created_by,created_at
) values(
  'aa840000-0000-4000-8000-000000000001','${ORGANIZATION_ID}','aa800000-0000-4000-8000-000000000001',
  'aa830000-0000-4000-8000-000000000001','${MANAGER_ID}','2026-01-01 00:00:00+00'
);
insert into public.event_run_sheet_plans(
  id,organization_id,event_operation_id,status,source,title,detected_signals,rationale,warnings,setup,plan_items,guide_refs,rig_refs,
  version,created_by,updated_by,created_at,updated_at
) values(
  'aa850000-0000-4000-8000-000000000001','${ORGANIZATION_ID}','aa800000-0000-4000-8000-000000000001',
  'draft','manual','Fixture run sheet','{}','[]','[]','{}','[]','[]','[]',1,'${MANAGER_ID}','${MANAGER_ID}',
  '2026-01-01 00:00:00+00','2026-01-01 00:00:00+00'
);

insert into public.shift_sessions(
  id,organization_id,local_id,shift_date,shift_key,shift_label,started_at,user_profile_id,auth_user_id,display_name,role,login_source,status,created_at,updated_at
) values(
  'aa900000-0000-4000-8000-000000000001','${ORGANIZATION_ID}','fixture-shift','2026-01-01','opening','Opening',
  '2026-01-01 07:00:00+00','${MANAGER_ID}','${MANAGER_ID}','Reapply Manager','manager','auth','finished',
  '2026-01-01 07:00:00+00','2026-01-01 08:00:00+00'
);
insert into public.task_completions(
  id,organization_id,local_id,shift_session_id,shift_date,shift_key,routine_key,section_key,task_id,task_title,status,
  completed_at,completed_by_profile_id,completed_by_auth_user_id,completed_by_name,input_values,critical_confirmed,sync_status,created_at,updated_at
) values(
  'aa910000-0000-4000-8000-000000000001','${ORGANIZATION_ID}','fixture-completion','aa900000-0000-4000-8000-000000000001',
  '2026-01-01','opening','legacy-opening','fixture','legacy-task','Fixture legacy task','completed','2026-01-01 07:30:00+00',
  '${MANAGER_ID}','${MANAGER_ID}','Reapply Manager','{}',false,'synced','2026-01-01 07:30:00+00','2026-01-01 07:30:00+00'
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values(
  'inventory-location-reference-images','inventory-location-reference-images',false,5242880,array['image/jpeg','image/png','image/webp']
);
insert into storage.objects(id,bucket_id,name,owner_id,metadata) values(
  'aa920000-0000-4000-8000-000000000001','inventory-location-reference-images',
  '${ORGANIZATION_ID}/fixture/reference.webp','${MANAGER_ID}',
  '{"size":128,"mimetype":"image/webp","fixture":true}'
);
create policy inventory_reference_images_select on storage.objects for select to authenticated
  using (bucket_id='inventory-location-reference-images');
create policy inventory_reference_images_insert on storage.objects for insert to authenticated
  with check (bucket_id='inventory-location-reference-images');
`;

const publicationBootstrapSql = String.raw`
drop publication if exists supabase_realtime;
create publication supabase_realtime;
alter publication supabase_realtime add table
  public.event_live_updates,
  public.event_operation_calendar_links,
  public.event_operations,
  public.event_responsibility_handovers,
  public.event_role_assignments,
  public.event_run_sheet_plans,
  public.event_staff_presence,
  public.event_tasks,
  public.inventory_count_lines,
  public.inventory_count_sessions,
  public.inventory_location_products,
  public.inventory_locations,
  public.inventory_products;
`;

const protectedSchemaFingerprintSql = String.raw`
with protected_relations as (
  select relation.oid,namespace.nspname,relation.relname,relation.relacl,relation.relrowsecurity
  from pg_catalog.pg_class relation join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
  where relation.relkind in ('r','p','v') and (
    namespace.nspname='auth'
    or (namespace.nspname='storage' and relation.relname in ('buckets','objects'))
    or (namespace.nspname='public' and (
      relation.relname like 'inventory_%' or relation.relname like 'asset_%'
      or relation.relname like 'event_%' or relation.relname like 'external_calendar_%'
      or relation.relname in ('organizations','user_profiles','shift_sessions','task_completions','handover_notes','close_day_archives','manager_daily_reviews')
    ))
  )
), entries as (
  select 'relation|'||nspname||'.'||relname||'|'||coalesce(relacl::text,'')||'|'||relrowsecurity entry from protected_relations
  union all select 'column|'||attribute.attrelid::regclass::text||'|'||attribute.attnum||'|'||attribute.attname||'|'||attribute.atttypid::regtype::text
    ||'|'||attribute.attnotnull||'|'||coalesce(pg_get_expr(default_value.adbin,default_value.adrelid),'')
    from pg_catalog.pg_attribute attribute left join pg_catalog.pg_attrdef default_value
      on default_value.adrelid=attribute.attrelid and default_value.adnum=attribute.attnum
    where attribute.attrelid in(select oid from protected_relations) and attribute.attnum>0 and not attribute.attisdropped
  union all select 'constraint|'||constraint_row.conrelid::regclass::text||'|'||constraint_row.conname||'|'||pg_get_constraintdef(constraint_row.oid,true)
    from pg_catalog.pg_constraint constraint_row where constraint_row.conrelid in(select oid from protected_relations)
      and constraint_row.conname<>'user_profiles_id_org_unique'
  union all select 'index|'||index_row.indrelid::regclass::text||'|'||pg_get_indexdef(index_row.indexrelid)
    from pg_catalog.pg_index index_row where index_row.indrelid in(select oid from protected_relations)
      and index_row.indexrelid::regclass::text<>'user_profiles_id_org_unique'
  union all select 'trigger|'||trigger_row.tgrelid::regclass::text||'|'||pg_get_triggerdef(trigger_row.oid,true)
    from pg_catalog.pg_trigger trigger_row where trigger_row.tgrelid in(select oid from protected_relations) and not trigger_row.tgisinternal
  union all select 'policy|'||schemaname||'.'||tablename||'|'||policyname||'|'||cmd||'|'||roles::text||'|'||coalesce(qual,'')||'|'||coalesce(with_check,'')
    from pg_catalog.pg_policies where (schemaname,tablename) in(select nspname,relname from protected_relations)
      and not (schemaname='storage' and policyname like 'routine_%')
  union all select 'function|'||namespace.nspname||'.'||procedure.proname||'|'||pg_get_function_identity_arguments(procedure.oid)||'|'||pg_get_functiondef(procedure.oid)
    from pg_catalog.pg_proc procedure join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
    where namespace.nspname in('auth','storage') or (namespace.nspname='public' and (
      procedure.proname like 'inventory_%' or procedure.proname like 'asset_%' or procedure.proname like 'event_%'
    ))
) select encode(extensions.digest(convert_to(coalesce(string_agg(entry,E'\n' order by entry),''),'UTF8'),'sha256'),'hex') from entries;
`;

const protectedDataFingerprintSql = String.raw`
with protected_tables as (
  select schemaname,tablename from pg_catalog.pg_tables
  where schemaname='auth'
    or (schemaname='public' and (
      tablename like 'inventory_%' or tablename like 'asset_%' or tablename like 'event_%'
      or tablename like 'external_calendar_%'
      or tablename in('organizations','user_profiles','shift_sessions','task_completions','handover_notes','close_day_archives','manager_daily_reviews')
    ))
), table_hashes as (
  select format('%I.%I',schemaname,tablename) table_name,
    phase10_reapply_test.table_fingerprint(format('%I.%I',schemaname,tablename)) table_hash
  from protected_tables
  union all select 'storage.buckets',encode(extensions.digest(convert_to(coalesce((
    select string_agg(to_jsonb(value)::text,E'\n' order by to_jsonb(value)::text) from storage.buckets value
    where id='inventory-location-reference-images'
  ),''),'UTF8'),'sha256'),'hex')
  union all select 'storage.objects',encode(extensions.digest(convert_to(coalesce((
    select string_agg(to_jsonb(value)::text,E'\n' order by to_jsonb(value)::text) from storage.objects value
    where bucket_id='inventory-location-reference-images'
  ),''),'UTF8'),'sha256'),'hex')
) select encode(extensions.digest(convert_to(string_agg(table_name||'|'||table_hash,E'\n' order by table_name),'UTF8'),'sha256'),'hex') from table_hashes;
`;

const protectedRealtimeFingerprintSql = String.raw`
select encode(extensions.digest(convert_to(coalesce(string_agg(schemaname||'.'||tablename,E'\n' order by schemaname,tablename),''),'UTF8'),'sha256'),'hex')
from pg_catalog.pg_publication_tables
where pubname='supabase_realtime' and (
  tablename like 'inventory_%' or tablename like 'asset_%' or tablename like 'event_%'
  or tablename like 'external_calendar_%'
);
`;

const fingerprintHelperSql = String.raw`
create schema if not exists phase10_reapply_test;
create or replace function phase10_reapply_test.table_fingerprint(input_relation text)
returns text language plpgsql stable set search_path=pg_catalog as $$
declare v_hash text;
begin
  execute format(
    'select encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(value)::text,E''\\n'' order by to_jsonb(value)::text),''''),''UTF8''),''sha256''),''hex'') from %s value',
    input_relation
  ) into v_hash;
  return v_hash;
end;
$$;
revoke all on function phase10_reapply_test.table_fingerprint(text) from public,anon,authenticated;
`;

const routineSchemaFingerprintSql = String.raw`
with routine_relations as (
  select relation.oid,namespace.nspname,relation.relname,relation.relacl,relation.relrowsecurity
  from pg_catalog.pg_class relation join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
  where relation.relkind in('r','p','v','S') and namespace.nspname='public' and relation.relname like 'routine_%'
), entries as (
  select 'relation|'||nspname||'.'||relname||'|'||coalesce((
    select string_agg(acl::text,',' order by acl::text) from unnest(relacl) acl
  ),'')||'|'||relrowsecurity entry from routine_relations
  union all select 'column|'||attribute.attrelid::regclass::text||'|'||attribute.attnum||'|'||attribute.attname||'|'||attribute.atttypid::regtype::text
    ||'|'||attribute.attnotnull||'|'||coalesce(pg_get_expr(default_value.adbin,default_value.adrelid),'')
    from pg_catalog.pg_attribute attribute left join pg_catalog.pg_attrdef default_value
      on default_value.adrelid=attribute.attrelid and default_value.adnum=attribute.attnum
    where attribute.attrelid in(select oid from routine_relations) and attribute.attnum>0 and not attribute.attisdropped
  union all select 'constraint|'||constraint_row.conrelid::regclass::text||'|'||constraint_row.conname||'|'||pg_get_constraintdef(constraint_row.oid,true)
    from pg_catalog.pg_constraint constraint_row where constraint_row.conrelid in(select oid from routine_relations)
  union all select 'index|'||index_row.indrelid::regclass::text||'|'||pg_get_indexdef(index_row.indexrelid)
    from pg_catalog.pg_index index_row where index_row.indrelid in(select oid from routine_relations)
  union all select 'trigger|'||trigger_row.tgrelid::regclass::text||'|'||pg_get_triggerdef(trigger_row.oid,true)
    from pg_catalog.pg_trigger trigger_row where trigger_row.tgrelid in(select oid from routine_relations) and not trigger_row.tgisinternal
  union all select 'policy|'||schemaname||'.'||tablename||'|'||policyname||'|'||cmd||'|'||roles::text||'|'||coalesce(qual,'')||'|'||coalesce(with_check,'')
    from pg_catalog.pg_policies where (schemaname='public' and tablename like 'routine_%') or (schemaname='storage' and policyname like 'routine_%')
  union all select 'function|'||procedure.oid::regprocedure::text||'|'||coalesce(procedure.proargnames::text,'')||'|'||coalesce((
      select string_agg(acl::text,',' order by acl::text) from unnest(procedure.proacl) acl
    ),'')||'|'||pg_get_functiondef(procedure.oid)
    from pg_catalog.pg_proc procedure join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
    where namespace.nspname='public' and (procedure.proname like '%routine%' or procedure.proname like '%double_shift%')
  union all select 'publication|'||schemaname||'.'||tablename from pg_catalog.pg_publication_tables
    where pubname='supabase_realtime' and tablename like 'routine_%'
) select encode(extensions.digest(convert_to(coalesce(string_agg(entry,E'\n' order by entry),''),'UTF8'),'sha256'),'hex') from entries;
`;

const canonicalCatalogSql = readFileSync(absolute("scripts/routine-canonical-catalog-forensics-v1.sql"), "utf8");
const ACL_CATEGORIES = new Set(["relation_acl", "function_acl", "schema_acl", "default_acl"]);

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function catalogForMutation(mutation = "") {
  const result = psql(`begin;\n${mutation}\n${canonicalCatalogSql}\nrollback;`, { tuplesOnly: true });
  const line = result.stdout.split("\n").map((entry) => entry.trim()).filter(Boolean).at(-1);
  if (!line) throw new Error("Canonical catalog query returned no payload.");
  return JSON.parse(line);
}

function portableCatalog(catalog) {
  const records = catalog.records
    .filter((record) => !ACL_CATEGORIES.has(record.category))
    .map((record) => ({
      ...record,
      fields: { ...record.fields, ...(Object.hasOwn(record.fields, "owner") ? { owner: "<OBJECT_OWNER>" } : {}) },
    }));
  const payload = records.map((record) => [record.category, record.identity, record.fields]);
  return { records, fingerprint: createHash("sha256").update(canonicalJson(payload)).digest("hex") };
}

function existingObjectSnapshot() {
  const catalog = catalogForMutation();
  return canonicalJson({
    records: catalog.records.filter((record) => record.category !== "default_acl"),
    protectedSchema: scalar(protectedSchemaFingerprintSql),
    protectedData: scalar(protectedDataFingerprintSql),
    protectedRealtime: scalar(protectedRealtimeFingerprintSql),
    routineData: routineDataState(),
    operational: routineOperationalState(),
  });
}

function clientAclAttestation(catalog) {
  const functionRows = catalog.records.filter((record) => record.category === "function_acl");
  const relationRows = catalog.records.filter((record) => record.category === "relation_acl");
  const hasPrivilege = (record, grantee, privilege) => record.fields.effective_acl
    .some((entry) => entry.grantee === grantee && entry.privilege === privilege);
  const authenticatedFunctions = functionRows.filter((record) => hasPrivilege(record, "authenticated", "EXECUTE"))
    .map((record) => record.identity).sort();
  const authenticatedSelect = relationRows.filter((record) => hasPrivilege(record, "authenticated", "SELECT"))
    .map((record) => record.identity).sort();
  const broadFunctionExecute = Object.fromEntries(["PUBLIC", "anon"].map((role) => [role,
    functionRows.filter((record) => hasPrivilege(record, role, "EXECUTE")).map((record) => record.identity).sort()]));
  const clientDml = relationRows.flatMap((record) => record.fields.effective_acl
    .filter((entry) => ["PUBLIC", "anon", "authenticated"].includes(entry.grantee)
      && ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"].includes(entry.privilege))
    .map((entry) => `${record.identity}|${entry.grantee}|${entry.privilege}`)).sort();
  const reviewed = Object.entries(ACL_EXPECTATIONS).map(([signature, exposure]) => {
    const record = functionRows.find((entry) => entry.identity === `public.${signature}`);
    return Boolean(record) && hasPrivilege(record, "authenticated", "EXECUTE") === (exposure === "public");
  });
  const permissivePolicies = catalog.records.filter((record) => record.category === "policy"
    && record.identity.startsWith("public.routine_")
    && (record.fields.roles.some((role) => ["public", "anon"].includes(role.toLowerCase()))
      || /^\(?\s*true\s*\)?$/i.test(record.fields.using ?? "")
      || /^\(?\s*true\s*\)?$/i.test(record.fields.with_check ?? "")));
  return {
    authenticatedFunctions,
    authenticatedFunctionHash: createHash("sha256").update(canonicalJson(authenticatedFunctions)).digest("hex"),
    authenticatedSelect,
    authenticatedSelectHash: createHash("sha256").update(canonicalJson(authenticatedSelect)).digest("hex"),
    broadFunctionExecute,
    clientDml,
    reviewedCount: reviewed.filter(Boolean).length,
    permissivePolicyCount: permissivePolicies.length,
  };
}

function environmentAttestation(catalog) {
  const execution = JSON.parse(scalar("select jsonb_build_object('sessionUser',session_user,'currentUser',current_user)::text;"));
  const owners = [...new Set(catalog.records.map((record) => record.fields?.owner).filter(Boolean))].sort();
  const privilegedGrantCounts = Object.fromEntries(["postgres", "supabase_admin", "service_role"].map((role) => [role,
    catalog.records.filter((record) => ACL_CATEGORIES.has(record.category)
      && record.fields.effective_acl?.some((entry) => entry.grantee === role)).length]));
  const defaultAclContexts = catalog.records.filter((record) => record.category === "default_acl")
    .map((record) => ({ identity: record.identity, owner: record.fields.owner, schema: record.fields.schema,
      objectType: record.fields.object_type, effectiveAcl: record.fields.effective_acl }));
  return { execution, owners, privilegedGrantCounts, defaultAclContexts };
}

function futureObjectProbe(setup = "") {
  const marker = "PHASE10O_FUTURE_PROBE|";
  const sql = String.raw`
begin;
${setup}
create table public.phase10o_future_table_probe(id bigint);
create sequence public.phase10o_future_sequence_probe;
create function public.phase10o_future_function_probe() returns integer language sql as 'select 1';
select '${marker}'||jsonb_build_object(
  'sessionUser',session_user,
  'currentUser',current_user,
  'tableOwner',pg_get_userbyid((select relowner from pg_catalog.pg_class where oid='public.phase10o_future_table_probe'::regclass)),
  'sequenceOwner',pg_get_userbyid((select relowner from pg_catalog.pg_class where oid='public.phase10o_future_sequence_probe'::regclass)),
  'functionOwner',pg_get_userbyid((select proowner from pg_catalog.pg_proc where oid='public.phase10o_future_function_probe()'::regprocedure)),
  'clientPrivileges',(
    select coalesce(jsonb_agg(entry order by entry),'[]'::jsonb) from (
      select 'table|'||(case when privilege.grantee=0 then 'PUBLIC' else pg_get_userbyid(privilege.grantee) end)||'|'||privilege.privilege_type entry
      from pg_catalog.pg_class relation,
        lateral aclexplode(coalesce(relation.relacl,acldefault('r',relation.relowner))) privilege
      where relation.oid='public.phase10o_future_table_probe'::regclass
        and (privilege.grantee=0 or pg_get_userbyid(privilege.grantee) in('anon','authenticated'))
      union all
      select 'sequence|'||(case when privilege.grantee=0 then 'PUBLIC' else pg_get_userbyid(privilege.grantee) end)||'|'||privilege.privilege_type
      from pg_catalog.pg_class relation,
        lateral aclexplode(coalesce(relation.relacl,acldefault('S',relation.relowner))) privilege
      where relation.oid='public.phase10o_future_sequence_probe'::regclass
        and (privilege.grantee=0 or pg_get_userbyid(privilege.grantee) in('anon','authenticated'))
      union all
      select 'function|'||(case when privilege.grantee=0 then 'PUBLIC' else pg_get_userbyid(privilege.grantee) end)||'|'||privilege.privilege_type
      from pg_catalog.pg_proc procedure,
        lateral aclexplode(coalesce(procedure.proacl,acldefault('f',procedure.proowner))) privilege
      where procedure.oid='public.phase10o_future_function_probe()'::regprocedure
        and (privilege.grantee=0 or pg_get_userbyid(privilege.grantee) in('anon','authenticated'))
    ) privileges
  ),
  'ownerAccess',jsonb_build_object(
    'table',has_table_privilege(current_user,'public.phase10o_future_table_probe','SELECT,INSERT,UPDATE,DELETE'),
    'sequence',has_sequence_privilege(current_user,'public.phase10o_future_sequence_probe','USAGE,SELECT,UPDATE'),
    'function',has_function_privilege(current_user,'public.phase10o_future_function_probe()','EXECUTE')
  ),
  'defaultAclRoles',(
    select coalesce(jsonb_agg(distinct pg_get_userbyid(default_acl.defaclrole) order by pg_get_userbyid(default_acl.defaclrole)),'[]'::jsonb)
    from pg_catalog.pg_default_acl default_acl
    left join pg_catalog.pg_namespace namespace on namespace.oid=default_acl.defaclnamespace
    where default_acl.defaclrole=current_user::regrole
      and (default_acl.defaclnamespace=0 or namespace.nspname='public')
      and default_acl.defaclobjtype in('r','S','f')
  )
)::text;
rollback;
`;
  const result = psql(sql, { tuplesOnly: true });
  const line = result.stdout.split("\n").find((entry) => entry.startsWith(marker));
  if (!line) throw new Error(`Future-object probe returned no marker:\n${result.stdout}\n${result.stderr}`);
  return JSON.parse(line.slice(marker.length));
}

function semanticMutationProbes() {
  const mutations = Object.freeze({
    columnDefault: "alter table public.routine_templates add column phase10o_probe text default 'probe';",
    foreignKey: "alter table public.routine_templates drop constraint routine_templates_organization_id_fkey;",
    index: "create index phase10o_portable_index_probe on public.routine_templates(name);",
    policy: "create policy phase10o_portable_policy_probe on public.routine_templates as restrictive for select to authenticated using (false);",
    body: "create or replace function public.routine_current_actor_source() returns text language sql stable security definer set search_path=pg_catalog as $$ select 'probe'::text $$;",
    searchPath: "alter function public.routine_current_actor_source() set search_path=public,pg_catalog;",
    rls: "alter table public.routine_templates force row level security;",
  });
  return Object.fromEntries(Object.entries(mutations).map(([label, mutation]) => [label,
    portableCatalog(catalogForMutation(mutation)).fingerprint]));
}

function routineDataState() {
  const tables = scalar("select coalesce(string_agg(tablename,E'\\n' order by tablename),'') from pg_catalog.pg_tables where schemaname='public' and tablename like 'routine_%';")
    .split("\n").filter(Boolean);
  const data = {};
  for (const table of tables) {
    const [count, hash] = scalar(`select count(*)||'|'||phase10_reapply_test.table_fingerprint('public.${table}') from public.${table};`).split("|");
    data[table] = { count: Number(count), hash };
  }
  return data;
}

function routineOperationalState() {
  return JSON.parse(scalar(String.raw`
select jsonb_build_object(
  'settings',(select coalesce(jsonb_agg(to_jsonb(value) order by organization_id),'[]'::jsonb) from public.routine_organization_settings value),
  'templates',(select count(*) from public.routine_templates),
  'publishedTemplates',(select count(*) from public.routine_template_versions where state='published'),
  'runs',(select count(*) from public.routine_runs),
  'runTasks',(select count(*) from public.routine_run_tasks),
  'bundles',(select count(*) from public.routine_bundles),
  'deliveries',(select count(*) from public.routine_delivery_records),
  'packInstallations',(select count(*) from public.routine_content_pack_installations),
  'packOperations',(select count(*) from public.routine_content_pack_operations),
  'pilotMemberships',(select count(*) from public.routine_pilot_memberships),
  'releaseAttestations',(select count(*) from public.routine_release_attestations),
  'operators',(select count(*) from public.routine_operators),
  'operatorSessions',(select count(*) from public.routine_operator_sessions),
  'actualImages',(select count(*) from storage.objects where bucket_id='routine-reference-images'),
  'hashes',jsonb_build_object(
    'published',phase10_reapply_test.table_fingerprint('public.routine_template_publication_batches'),
    'content',phase10_reapply_test.table_fingerprint('public.routine_template_versions'),
    'runs',phase10_reapply_test.table_fingerprint('public.routine_runs'),
    'timing',phase10_reapply_test.table_fingerprint('public.routine_run_task_timings'),
    'delivery',phase10_reapply_test.table_fingerprint('public.routine_delivery_records'),
    'bundles',phase10_reapply_test.table_fingerprint('public.routine_bundles')
  )
)::text;
  `));
}

function settingsState() {
  return JSON.parse(scalar(String.raw`
    select coalesce(jsonb_agg(to_jsonb(settings) order by settings.organization_id),'[]'::jsonb)::text
    from public.routine_organization_settings settings;
  `));
}

function settingsRow(state, organizationId) {
  return state.find((row) => row.organization_id === organizationId);
}

function settingsReleaseDefaults() {
  return JSON.parse(scalar(String.raw`
    select jsonb_build_object(
      'stage',(select column_default from information_schema.columns
        where table_schema='public' and table_name='routine_organization_settings' and column_name='ui_release_stage'),
      'contract',(select column_default from information_schema.columns
        where table_schema='public' and table_name='routine_organization_settings' and column_name='ui_contract_version')
    )::text;
  `));
}

function assertBootstrappedSettings(label, state, expectedStage, expectedContract, expectedRevision) {
  for (const organizationId of [ORGANIZATION_ID, SECONDARY_ORGANIZATION_ID]) {
    const row = settingsRow(state, organizationId);
    check(`${label}: ${organizationId} keeps exact system defaults`, row?.mode === "legacy"
      && row.timezone === "Europe/Oslo" && row.operational_day_cutoff === "04:00:00"
      && row.shared_device_enabled === false && row.reopen_window_hours === 24
      && row.revision === expectedRevision && row.created_by_auth_user_id === null
      && row.updated_by_auth_user_id === null
      && (expectedStage === undefined || row.ui_release_stage === expectedStage)
      && (expectedContract === undefined || row.ui_contract_version === expectedContract));
  }
}

function installPreservedSettingsFixture() {
  psql(String.raw`
    insert into public.routine_organization_settings (
      organization_id,mode,timezone,operational_day_cutoff,shared_device_enabled,
      reopen_window_hours,revision,created_at,updated_at,
      created_by_auth_user_id,updated_by_auth_user_id
    ) values (
      '${PRESERVED_ORGANIZATION_ID}','shadow','Europe/Oslo','03:30'::time,true,
      72,9,'2026-01-02 03:04:05+00','2026-01-03 04:05:06+00',
      '${PRESERVED_MANAGER_ID}','${PRESERVED_MANAGER_ID}'
    );
  `, { transaction: true });
}

function assertPreservedSettingsAfter10A1(state) {
  const row = settingsRow(state, PRESERVED_ORGANIZATION_ID);
  check("10A1 preserves every non-default existing settings field", row?.mode === "shadow"
    && row.timezone === "Europe/Oslo" && row.operational_day_cutoff === "03:30:00"
    && row.shared_device_enabled === true && row.reopen_window_hours === 72
    && row.revision === 9 && row.created_at === "2026-01-02T03:04:05+00:00"
    && row.updated_at === "2026-01-03T04:05:06+00:00"
    && row.created_by_auth_user_id === PRESERVED_MANAGER_ID
    && row.updated_by_auth_user_id === PRESERVED_MANAGER_ID);
}

function validatorContract() {
  return JSON.parse(scalar(String.raw`
select jsonb_build_object(
  'identity',pg_get_function_identity_arguments(procedure.oid),
  'argumentNames',procedure.proargnames,
  'result',pg_get_function_result(procedure.oid),
  'volatility',procedure.provolatile,
  'securityDefiner',procedure.prosecdef,
  'acl',(select coalesce(jsonb_agg(acl::text order by acl::text),'[]'::jsonb) from unnest(procedure.proacl) acl)
)::text
from pg_catalog.pg_proc procedure join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
where namespace.nspname='public' and procedure.proname='validate_routine_template_version'
  and procedure.proargtypes='2950 2951'::oidvector;
  `));
}

function routineFunctionState() {
  return JSON.parse(scalar(String.raw`
    select coalesce(jsonb_object_agg(signature,function_state order by signature),'{}'::jsonb)::text
    from (
      select procedure.oid::regprocedure::text signature,
        jsonb_build_object(
          'rawAcl',coalesce((select jsonb_agg(acl::text order by acl::text) from unnest(procedure.proacl) acl),'[]'::jsonb),
          'effectiveAcl',coalesce((
            select jsonb_agg(jsonb_build_object(
              'grantee',case when privilege.grantee=0 then 'PUBLIC' else pg_get_userbyid(privilege.grantee) end,
              'privilege',privilege.privilege_type,
              'grantable',privilege.is_grantable
            ) order by case when privilege.grantee=0 then 'PUBLIC' else pg_get_userbyid(privilege.grantee) end,
              privilege.privilege_type,privilege.is_grantable)
            from aclexplode(coalesce(procedure.proacl,acldefault('f',procedure.proowner))) privilege
          ),'[]'::jsonb),
          'owner',pg_get_userbyid(procedure.proowner),
          'securityDefiner',procedure.prosecdef,
          'volatility',procedure.provolatile,
          'argumentNames',coalesce(to_jsonb(procedure.proargnames),'[]'::jsonb),
          'identityArguments',pg_get_function_identity_arguments(procedure.oid),
          'result',pg_get_function_result(procedure.oid),
          'comment',obj_description(procedure.oid,'pg_proc')
        ) function_state
      from pg_catalog.pg_proc procedure
      join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
      where namespace.nspname='public'
        and (procedure.proname like '%routine%' or procedure.proname like '%double_shift%')
    ) state;
  `));
}

function executableGrantees(functionState) {
  return functionState.effectiveAcl
    .filter((entry) => entry.privilege === "EXECUTE")
    .map((entry) => entry.grantee)
    .sort();
}

function functionMetadataState(functions) {
  return Object.fromEntries(Object.entries(functions).map(([signature,state]) => [signature, {
    owner: state.owner,
    securityDefiner: state.securityDefiner,
    volatility: state.volatility,
    argumentNames: state.argumentNames,
    identityArguments: state.identityArguments,
    result: state.result,
    comment: state.comment,
  }]));
}

function managerSql(statement) {
  return `select set_config('request.jwt.claim.sub','${MANAGER_ID}',false); set role authenticated; ${statement}`;
}
function actorSql(actorId, statement) {
  return `select set_config('request.jwt.claim.sub','${actorId}',false); set role authenticated; ${statement}`;
}

function validationProbe() {
  const sql = String.raw`
begin;
select set_config('mesh.routine_ui_internal','mode',true);
update public.routine_organization_settings
set mode='shadow'
where organization_id='${ORGANIZATION_ID}';
select set_config('request.jwt.claim.sub','${MANAGER_ID}',false);
set local role authenticated;
select public.create_routine_template('opening','Opening','Deterministic validation fixture',
  '32000000-0000-4000-8000-000000000001');
select public.create_routine_template('closing','Closing','Deterministic validation fixture',
  '32000000-0000-4000-8000-000000000002');
select public.upsert_routine_draft_section(version.id,null,'startup','Startup',null,'startup',0,true,null,version.revision)
from public.routine_template_versions version join public.routine_templates template on template.id=version.template_id
where template.routine_key='opening' and version.state='draft';
select public.upsert_routine_draft_section(version.id,null,'final-close','Final close',null,'final_close',0,true,null,version.revision)
from public.routine_template_versions version join public.routine_templates template on template.id=version.template_id
where template.routine_key='closing' and version.state='draft';
select public.upsert_routine_draft_task(version.id,section.id,null,jsonb_build_object(
  'taskKey','O01','title','Open main floor','instructions','Prepare the main floor.',
  'doneCriteria','Main floor is ready','taskType','action','criticality','important','mandatory',true,
  'locationDescription','Main floor','sortOrder',0,'condition','{}'::jsonb,'metadata','{}'::jsonb
),null,version.revision)
from public.routine_template_versions version join public.routine_templates template on template.id=version.template_id
join public.routine_template_sections section on section.version_id=version.id
where template.routine_key='opening' and version.state='draft';
select public.upsert_routine_draft_task(version.id,section.id,null,jsonb_build_object(
  'taskKey','C01','title','Close main floor','instructions','Secure the main floor.',
  'doneCriteria','Main floor is secured','taskType','verification','criticality','critical','mandatory',true,
  'notApplicablePolicy','forbidden','verificationPolicy','closing_responsible','locationDescription','Main floor',
  'sortOrder',0,'condition',jsonb_build_object('fact','weekday','operator','in','value',jsonb_build_array('mon','tue','wed','thu','fri','sat','sun')),
  'metadata','{}'::jsonb
),null,version.revision)
from public.routine_template_versions version join public.routine_templates template on template.id=version.template_id
join public.routine_template_sections section on section.version_id=version.id
where template.routine_key='closing' and version.state='draft';
select public.replace_routine_draft_relations(version.id,jsonb_build_array(jsonb_build_object(
  'sourceTaskId',task.id,'targetRoutineKey','closing','targetTaskKey','C01','relationType','shared_context','metadata','{}'::jsonb
)),version.revision)
from public.routine_template_versions version join public.routine_templates template on template.id=version.template_id
join public.routine_template_tasks task on task.version_id=version.id
where template.routine_key='opening' and version.state='draft';
select public.replace_routine_draft_relations(version.id,jsonb_build_array(jsonb_build_object(
  'sourceTaskId',task.id,'targetRoutineKey','opening','targetTaskKey','O01','relationType','independent_verification','metadata','{}'::jsonb
)),version.revision)
from public.routine_template_versions version join public.routine_templates template on template.id=version.template_id
join public.routine_template_tasks task on task.version_id=version.id
where template.routine_key='closing' and version.state='draft';
select public.create_routine_reference('opening-main-floor','Opening main floor setup',
  'Visual setup guidance for the main floor.','Ingen referanse er lastet opp ennå.',
  '41000000-0000-4000-8000-000000000001');
select public.replace_routine_draft_task_reference_images(task.id,jsonb_build_array(jsonb_build_object(
  'referenceId',reference.id,'buttonLabel','Se korrekt oppsett','contextNote','Bruk bildet som visuell støtte.',
  'sortOrder',0,'active',true
)),version.revision,'41000000-0000-4000-8000-000000000004')
from public.routine_template_versions version join public.routine_templates template on template.id=version.template_id
join public.routine_template_tasks task on task.version_id=version.id and task.task_key='O01'
join public.routine_reference_images reference on reference.organization_id=version.organization_id
  and reference.reference_key='opening-main-floor'
where template.routine_key='opening' and version.state='draft';
reset role;
select 'HELPER_PROBE|'||jsonb_build_object(
  'conditionValidation',public.routine_validate_condition_json('{"fact":"unknown","operator":"equals","value":true}'::jsonb),
  'deliveryValidation',public.routine_validate_delivery_relation_metadata('{}'::jsonb),
  'eventContextValidation',public.routine_validate_event_context_source_config('{}'::jsonb)
)::text;
select set_config('request.jwt.claim.sub','${MANAGER_ID}',false);
set local role authenticated;
select 'VALIDATION_PROBE|'||public.validate_routine_template_version(
    input_version_id => (select version.id from public.routine_template_versions version join public.routine_templates template on template.id=version.template_id where template.routine_key='opening' and version.state='draft'),
    input_publication_version_ids => (select array_agg(version.id order by template.routine_key) from public.routine_template_versions version join public.routine_templates template on template.id=version.template_id where template.routine_key in('opening','closing') and version.state='draft')
  )::text;
rollback;
`;
  const result = psql(sql, { tuplesOnly: true });
  const validationLine = result.stdout.split("\n").find((entry) => entry.startsWith("VALIDATION_PROBE|"));
  const helperLine = result.stdout.split("\n").find((entry) => entry.startsWith("HELPER_PROBE|"));
  if (!validationLine || !helperLine) throw new Error(`Validation probe did not return its markers:\n${result.stdout}\n${result.stderr}`);
  return {
    templateValidation: JSON.parse(validationLine.slice("VALIDATION_PROBE|".length)),
    ...JSON.parse(helperLine.slice("HELPER_PROBE|".length)),
  };
}

function contentPackProbe() {
  const preview = JSON.parse(scalar(managerSql("select public.preview_mesh_routine_content_pack_v1()::text;")).split("\n").at(-1));
  const audit = JSON.parse(scalar(managerSql("select public.get_mesh_routine_content_pack_audit()::text;")).split("\n").at(-1));
  const sourceDocuments = JSON.parse(scalar("select (public.routine_mesh_content_pack_v1()->'sourceDocuments')::text;"));
  return { preview, audit, sourceDocuments };
}

function captureState() {
  const routineFunctions = routineFunctionState();
  const catalog = catalogForMutation();
  const portable = portableCatalog(catalog);
  return {
    protectedSchema: scalar(protectedSchemaFingerprintSql),
    protectedData: scalar(protectedDataFingerprintSql),
    protectedRealtime: scalar(protectedRealtimeFingerprintSql),
    routineSchema: scalar(routineSchemaFingerprintSql),
    portableSchema: portable.fingerprint,
    portableRecordCount: portable.records.length,
    clientAcl: clientAclAttestation(catalog),
    environment: environmentAttestation(catalog),
    routineFunctions,
    rawAclFingerprint: fingerprint(Object.fromEntries(Object.entries(routineFunctions).map(([signature,state]) => [signature,state.rawAcl]))),
    effectiveAclFingerprint: fingerprint(Object.fromEntries(Object.entries(routineFunctions).map(([signature,state]) => [signature,state.effectiveAcl]))),
    routineFunctionMetadataFingerprint: fingerprint(functionMetadataState(routineFunctions)),
    routineData: routineDataState(),
    operational: routineOperationalState(),
    validator: validatorContract(),
    validationProbe: validationProbe(),
    contentPack: contentPackProbe(),
  };
}

function assertEndState(label, state, protectedBaseline) {
  check(`${label}: protected schema fingerprint is unchanged`, state.protectedSchema === protectedBaseline.schema);
  check(`${label}: protected data fingerprint is unchanged`, state.protectedData === protectedBaseline.data);
  check(`${label}: protected Realtime membership is unchanged`, state.protectedRealtime === protectedBaseline.realtime);
  check(`${label}: validator argument names are canonical`, JSON.stringify(state.validator.argumentNames) === JSON.stringify(EXPECTED_ARGUMENT_NAMES));
  console.log(`PORTABLE_DIAGNOSTIC|${OWNER_CONTEXT}|records=${state.portableRecordCount}|fingerprint=${state.portableSchema}`);
  check(`${label}: portable semantic schema fingerprint matches the reviewed contract`,
    state.portableSchema === EXPECTED_PORTABLE_SCHEMA_FINGERPRINT);
  check(`${label}: validator order, types, return, stability, and security remain unchanged`,
    state.validator.identity === "input_version_id uuid, input_publication_version_ids uuid[]"
      && state.validator.result === "jsonb" && state.validator.volatility === "s" && state.validator.securityDefiner === true);
  check(`${label}: validator EXECUTE remains granted to authenticated`,
    scalar(String.raw`
      select has_function_privilege('authenticated','public.validate_routine_template_version(uuid,uuid[])','EXECUTE');
    `) === "t");
  check(`${label}: all 32 ACL-hardened signatures exist`,
    ACL_SIGNATURES.every((signature) => state.routineFunctions[signature]));
  const broadlyExecutable = Object.entries(state.routineFunctions).filter(([,functionState]) => {
      const grantees = executableGrantees(functionState);
      return grantees.includes("PUBLIC") || grantees.includes("anon");
    }).map(([signature]) => signature);
  if (broadlyExecutable.length > 0) console.log(`BROAD_ROUTINE_EXECUTE|${label}|${broadlyExecutable.length}|${broadlyExecutable.join(",")}`);
  check(`${label}: no Routine function grants EXECUTE to PUBLIC or anon`, broadlyExecutable.length === 0);
  check(`${label}: reviewed 32-signature client contract is exact`,
    ACL_SIGNATURES.every((signature) => {
      const authenticated = executableGrantees(state.routineFunctions[signature]).includes("authenticated");
      return authenticated === (ACL_EXPECTATIONS[signature] === "public");
    }) && state.clientAcl.reviewedCount === 32);
  check(`${label}: authenticated function EXECUTE is the exact reviewed 218-signature allowlist`,
    state.clientAcl.authenticatedFunctions.length === EXPECTED_AUTHENTICATED_FUNCTION_COUNT
      && state.clientAcl.authenticatedFunctionHash === EXPECTED_AUTHENTICATED_FUNCTION_HASH);
  check(`${label}: authenticated relation SELECT is the exact reviewed 65-relation allowlist`,
    state.clientAcl.authenticatedSelect.length === EXPECTED_AUTHENTICATED_RELATION_SELECT_COUNT
      && state.clientAcl.authenticatedSelectHash === EXPECTED_AUTHENTICATED_RELATION_SELECT_HASH);
  check(`${label}: literal client ACL has no broad function access, direct DML, or unconditional/broad Routine RLS`,
    state.clientAcl.broadFunctionExecute.PUBLIC.length === 0
      && state.clientAcl.broadFunctionExecute.anon.length === 0
      && state.clientAcl.clientDml.length === 0
      && state.clientAcl.permissivePolicyCount === 0);
  check(`${label}: owner/platform evidence uses only reviewed environmental owner variants`,
    state.environment.owners.every((owner) => EXPECTED_OWNER_ROLES.has(owner))
      && state.environment.execution.currentUser === ROLE
      && state.environment.execution.sessionUser === SESSION_ROLE);
  const settings = state.operational.settings;
  const primarySettings = settingsRow(settings, ORGANIZATION_ID);
  const secondarySettings = settingsRow(settings, SECONDARY_ORGANIZATION_ID);
  const preservedSettings = settingsRow(settings, PRESERVED_ORGANIZATION_ID);
  check(`${label}: one isolated settings row exists per synthetic organization`, settings.length === 3
    && primarySettings && secondarySettings && preservedSettings);
  check(`${label}: bootstrapped modes remain legacy and release stage remains staff_preview`,
    primarySettings.mode === "legacy" && secondarySettings.mode === "legacy"
      && primarySettings.ui_release_stage === "staff_preview"
      && secondarySettings.ui_release_stage === "staff_preview"
      && primarySettings.ui_contract_version === "phase10k4-v1"
      && secondarySettings.ui_contract_version === "phase10k4-v1");
  check(`${label}: pre-existing non-default mode remains isolated and unchanged by bootstrap`,
    preservedSettings.mode === "shadow" && preservedSettings.timezone === "Europe/Oslo"
      && preservedSettings.operational_day_cutoff === "03:30:00"
      && preservedSettings.shared_device_enabled === true
      && preservedSettings.reopen_window_hours === 72
      && preservedSettings.ui_release_stage === "staff_preview"
      && preservedSettings.ui_contract_version === "phase10k4-v1");
  check(`${label}: K4 pause defaults remain inert with null pause metadata`, settings.every((row) =>
    row.pilot_new_work_paused === false && row.pilot_pause_reason === null
      && row.pilot_paused_at === null && row.pilot_paused_by_auth_user_id === null));
  check(`${label}: no content pack, publication, run, task, bundle, or delivery state exists`,
    state.operational.templates === 0 && state.operational.publishedTemplates === 0
      && state.operational.runs === 0 && state.operational.runTasks === 0
      && state.operational.bundles === 0 && state.operational.deliveries === 0
      && state.operational.packInstallations === 0 && state.operational.packOperations === 0);
  check(`${label}: no pilot membership, release attestation, or actual routine image exists`,
    state.operational.pilotMemberships === 0 && state.operational.releaseAttestations === 0
      && state.operational.operators === 0 && state.operational.operatorSessions === 0
      && state.operational.actualImages === 0);
  const templateValidation = state.validationProbe.templateValidation;
  check(`${label}: draft publication-batch validation returns blockers, warnings, and a SHA-256 content hash`,
    typeof templateValidation.valid === "boolean" && Array.isArray(templateValidation.blockers)
      && Array.isArray(templateValidation.warnings) && /^[0-9a-f]{64}$/.test(templateValidation.computed_content_hash));
  check(`${label}: reference validation remains in the layered validator`,
    templateValidation.warnings.includes("A linked routine reference currently uses its placeholder; publication is still allowed."));
  check(`${label}: condition, delivery, and event-context validation remain active`,
    state.validationProbe.conditionValidation === false
      && state.validationProbe.deliveryValidation.valid === false
      && state.validationProbe.deliveryValidation.blockers.length > 0
      && state.validationProbe.eventContextValidation.valid === false
      && state.validationProbe.eventContextValidation.blockers.length > 0);
  check(`${label}: content preview keeps the canonical pack and source hashes`,
    state.contentPack.preview.packMetadata.packHash === EXPECTED_PACK_HASH
      && JSON.stringify(state.contentPack.sourceDocuments.map((entry) => entry.sha256)) === JSON.stringify(EXPECTED_SOURCE_HASHES));
  check(`${label}: content preview keeps 37/46 tasks, four DS steps, and no unresolved blocker`,
    state.contentPack.preview.counts.openingTasks === 37
      && state.contentPack.preview.counts.closingTasks === 46
      && state.contentPack.preview.counts.doubleShiftSteps === 4
      && state.contentPack.preview.unresolvedRequirements.length === 0);
  check(`${label}: content audit confirms no installation or operations`,
    state.contentPack.audit.installation === null && state.contentPack.audit.operations.length === 0
      && state.contentPack.audit.currentPreview.packMetadata.packHash === EXPECTED_PACK_HASH);
  check(`${label}: application roles have no direct Routine DML grant`, Number(scalar(String.raw`
    select count(*) from information_schema.role_table_grants
    where table_schema='public' and grantee in('public','anon','authenticated')
      and privilege_type in('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
      and table_name like 'routine_%';
  `)) === 0);
}

function applySequence(sequenceNumber) {
  console.log(`Applying full Phase 10A-A1-L-P-Q-O-R-S-T-U-V sequence ${sequenceNumber} as ${ROLE}`);
  let stateAfterK4 = null;
  for (let index = 0; index < migrations.length; index += 1) {
    const path = migrations[index];
    const beforeK4 = sequenceNumber > 1 && path.endsWith("phase10k4_routine_history_pilot_hardening.sql")
      ? JSON.stringify(settingsState()) : null;
    const before10A1 = sequenceNumber > 1 && path.endsWith("phase10a1_routine_organization_settings_bootstrap.sql")
      ? JSON.stringify(settingsState()) : null;
    const before10O = path.endsWith("phase10o_routine_default_privilege_hardening.sql")
      ? existingObjectSnapshot() : null;
    psql(readFileSync(absolute(path), "utf8"), { transaction: true });
    migrationApplications += 1;
    if (path.endsWith("phase10a_routine_engine_foundation.sql")) {
      check(`sequence ${sequenceNumber}: 10A settings table exists`, scalar("select to_regclass('public.routine_organization_settings') is not null;") === "t");
      if (sequenceNumber === 1) {
        check("first 10A apply creates no settings row", scalar("select count(*) from public.routine_organization_settings;") === "0");
        installPreservedSettingsFixture();
      }
    }
    if (path.endsWith("phase10a1_routine_organization_settings_bootstrap.sql")) {
      const state = settingsState();
      if (sequenceNumber === 1) {
        check("10A1 creates exactly one settings row per existing organization",
          state.length === 3 && scalar("select count(*)=count(distinct organization_id) from public.routine_organization_settings;") === "t");
        check("10A1 runs before UI release columns exist",
          scalar("select count(*) from information_schema.columns where table_schema='public' and table_name='routine_organization_settings' and column_name in('ui_release_stage','ui_contract_version');") === "0");
        assertBootstrappedSettings("after 10A1", state, undefined, undefined, 1);
        assertPreservedSettingsAfter10A1(state);
      } else {
        check(`sequence ${sequenceNumber}: 10A1 is revision/timestamp/data stable on reapply`,
          JSON.stringify(state) === before10A1);
      }
    }
    if (path.endsWith("phase10b_routine_templates.sql")) {
      const contract = validatorContract();
      check(`sequence ${sequenceNumber}: Phase 10B applies with canonical validator names`,
        JSON.stringify(contract.argumentNames) === JSON.stringify(EXPECTED_ARGUMENT_NAMES));
      if (sequenceNumber === 1) {
        check("first Phase 10B apply starts from an empty template state", scalar("select count(*) from public.routine_templates;") === "0");
      }
    }
    if (sequenceNumber === 1 && path.endsWith("phase10k1_routine_ui_pilot_gate.sql")) {
      const state = settingsState();
      const defaults = settingsReleaseDefaults();
      check("K1 installs foundation release defaults",
        defaults.stage === "'foundation'::text" && defaults.contract === "'phase10k1-v1'::text");
      assertBootstrappedSettings("after K1", state, "foundation", "phase10k1-v1", 1);
      check("K1 adds foundation release metadata without revising the preserved row",
        settingsRow(state, PRESERVED_ORGANIZATION_ID)?.revision === 9
          && settingsRow(state, PRESERVED_ORGANIZATION_ID)?.ui_release_stage === "foundation"
          && settingsRow(state, PRESERVED_ORGANIZATION_ID)?.ui_contract_version === "phase10k1-v1");
    }
    if (sequenceNumber === 1 && path.endsWith("phase10k2_routine_manager_control_center.sql")) {
      const state = settingsState();
      assertBootstrappedSettings("after K2", state, "manager_preview", "phase10k2-v1", 2);
      check("K2 advances the preserved row exactly once", settingsRow(state, PRESERVED_ORGANIZATION_ID)?.revision === 10
        && settingsRow(state, PRESERVED_ORGANIZATION_ID)?.ui_release_stage === "manager_preview"
        && settingsRow(state, PRESERVED_ORGANIZATION_ID)?.ui_contract_version === "phase10k2-v1");
    }
    if (sequenceNumber === 1 && path.endsWith("phase10k3_routine_employee_workflow.sql")) {
      const state = settingsState();
      assertBootstrappedSettings("after K3", state, "staff_preview", "phase10k3-v1", 3);
      check("K3 advances the preserved row exactly once", settingsRow(state, PRESERVED_ORGANIZATION_ID)?.revision === 11
        && settingsRow(state, PRESERVED_ORGANIZATION_ID)?.ui_release_stage === "staff_preview"
        && settingsRow(state, PRESERVED_ORGANIZATION_ID)?.ui_contract_version === "phase10k3-v1");
    }
    if (path.endsWith("phase10k4_routine_history_pilot_hardening.sql")) {
      stateAfterK4 = settingsState();
      if (sequenceNumber === 1) {
        const defaults = settingsReleaseDefaults();
        check("K4 installs current release defaults for future settings rows",
          defaults.stage === "'staff_preview'::text" && defaults.contract === "'phase10k4-v1'::text");
        assertBootstrappedSettings("after K4", stateAfterK4, "staff_preview", "phase10k4-v1", 3);
        check("K4 keeps mode/stage/revision and installs inert pause metadata",
          stateAfterK4.every((row) => row.ui_release_stage === "staff_preview"
            && row.ui_contract_version === "phase10k4-v1" && row.pilot_new_work_paused === false
            && row.pilot_pause_reason === null && row.pilot_paused_at === null
            && row.pilot_paused_by_auth_user_id === null)
          && settingsRow(stateAfterK4, PRESERVED_ORGANIZATION_ID)?.mode === "shadow"
          && settingsRow(stateAfterK4, PRESERVED_ORGANIZATION_ID)?.revision === 11);
      } else {
        check(`sequence ${sequenceNumber}: K4 reapply is data, revision, and timestamp stable`,
          JSON.stringify(stateAfterK4) === beforeK4);
      }
    }
    if (path.endsWith("phase10l_mesh_routine_content_pack.sql")) {
      check(`sequence ${sequenceNumber}: 10L leaves settings exactly unchanged`,
        JSON.stringify(settingsState()) === JSON.stringify(stateAfterK4));
      check(`sequence ${sequenceNumber}: 10L installs no content or operative data`,
        scalar("select (select count(*) from public.routine_content_pack_installations)=0 and (select count(*) from public.routine_templates)=0 and (select count(*) from public.routine_runs)=0 and (select count(*) from public.routine_bundles)=0 and (select count(*) from public.routine_delivery_records)=0;") === "t");
    }
    if (path.endsWith("phase10p_routine_readiness_finalization.sql")) {
      check(`sequence ${sequenceNumber}: 10P leaves settings and content state unchanged`,
        JSON.stringify(settingsState()) === JSON.stringify(stateAfterK4)
          && scalar("select (select count(*) from public.routine_content_pack_installations)=0 and (select count(*) from public.routine_templates)=0 and (select count(*) from public.routine_runs)=0 and (select count(*) from public.routine_bundles)=0;") === "t");
      check(`sequence ${sequenceNumber}: 10P keeps pilot readiness private`,
        scalar("select not has_function_privilege('anon','public.routine_compute_pilot_readiness(uuid)','EXECUTE') and not has_function_privilege('authenticated','public.routine_compute_pilot_readiness(uuid)','EXECUTE');") === "t");
    }
    if (path.endsWith("phase10q_mesh_routine_content_pack_1_2r.sql")) {
      check(`sequence ${sequenceNumber}: 10Q exposes the exact 1.2R provider`,
        scalar("select (public.routine_mesh_content_pack_v1()->>'packVersion')||':'||(public.routine_mesh_content_pack_v1()->>'packHash');")
          === `1.2R:${EXPECTED_PREVIOUS_PACK_HASH}`);
      check(`sequence ${sequenceNumber}: 10Q leaves settings and all content state unchanged`,
        JSON.stringify(settingsState()) === JSON.stringify(stateAfterK4)
          && scalar("select (select count(*) from public.routine_content_pack_installations)=0 and (select count(*) from public.routine_templates)=0 and (select count(*) from public.routine_runs)=0 and (select count(*) from public.routine_bundles)=0;") === "t");
      check(`sequence ${sequenceNumber}: 10Q provider remains private`,
        scalar("select not has_function_privilege('anon','public.routine_mesh_content_pack_v1()','EXECUTE') and not has_function_privilege('authenticated','public.routine_mesh_content_pack_v1()','EXECUTE');") === "t");
    }
    if (path.endsWith("phase10r_mesh_routine_content_pack_1_3r.sql")) {
      check(`sequence ${sequenceNumber}: 10R exposes the exact 1.3R provider`,
        scalar("select (public.routine_mesh_content_pack_v1()->>'packVersion')||':'||(public.routine_mesh_content_pack_v1()->>'packHash');")
          === `1.3R:${EXPECTED_PHASE10R_PACK_HASH}`);
      check(`sequence ${sequenceNumber}: 10R leaves settings and all content state unchanged`,
        JSON.stringify(settingsState()) === JSON.stringify(stateAfterK4)
          && scalar("select (select count(*) from public.routine_content_pack_installations)=0 and (select count(*) from public.routine_templates)=0 and (select count(*) from public.routine_runs)=0 and (select count(*) from public.routine_bundles)=0;") === "t");
      check(`sequence ${sequenceNumber}: 10R provider remains private`,
        scalar("select not has_function_privilege('anon','public.routine_mesh_content_pack_v1()','EXECUTE') and not has_function_privilege('authenticated','public.routine_mesh_content_pack_v1()','EXECUTE');") === "t");
    }
    if (path.endsWith("phase10s_mesh_routine_content_pack_1_4r.sql")) {
      check(`sequence ${sequenceNumber}: 10S exposes the exact 1.4R provider`,
        scalar("select (public.routine_mesh_content_pack_v1()->>'packVersion')||':'||(public.routine_mesh_content_pack_v1()->>'packHash');")
          === `1.4R:${EXPECTED_PACK_HASH}`);
      check(`sequence ${sequenceNumber}: 10S leaves settings and all content state unchanged`,
        JSON.stringify(settingsState()) === JSON.stringify(stateAfterK4)
          && scalar("select (select count(*) from public.routine_content_pack_installations)=0 and (select count(*) from public.routine_templates)=0 and (select count(*) from public.routine_runs)=0 and (select count(*) from public.routine_bundles)=0;") === "t");
    }
    if (path.endsWith("phase10t_routine_participant_identity_conflict_alignment.sql")) {
      check(`sequence ${sequenceNumber}: 10T leaves no stale personal-participant conflict target`, scalar(String.raw`
        select count(*) from pg_proc procedure join pg_namespace namespace on namespace.oid=procedure.pronamespace
        where namespace.nspname='public' and procedure.prokind='f' and (
          pg_get_functiondef(procedure.oid)~*'on[[:space:]]+conflict[[:space:]]*\\([[:space:]]*run_id[[:space:]]*,[[:space:]]*user_profile_id[[:space:]]*\\)[[:space:]]+do[[:space:]]+nothing'
          or pg_get_functiondef(procedure.oid)~*'on[[:space:]]+conflict[[:space:]]*\\([[:space:]]*bundle_id[[:space:]]*,[[:space:]]*user_profile_id[[:space:]]*\\)[[:space:]]+do[[:space:]]+nothing');
      `) === "0");
    }
    if (path.endsWith("phase10u_routine_operation_idempotency_convergence.sql")) {
      check(`sequence ${sequenceNumber}: 10U installs four volatile concurrency-convergence functions`, scalar(String.raw`
        select count(*) from pg_proc procedure join pg_namespace namespace on namespace.oid=procedure.pronamespace
        where namespace.nspname='public' and procedure.oid=any(array[
          'public.routine_run_operation_replay(uuid,uuid,text,uuid,text)'::regprocedure,
          'public.routine_record_run_operation(uuid,uuid,text,uuid,text,text,uuid,jsonb)'::regprocedure,
          'public.routine_bundle_operation_replay(uuid,uuid,text,uuid,text)'::regprocedure,
          'public.routine_record_bundle_operation(uuid,uuid,text,uuid,text,text,uuid,jsonb)'::regprocedure
        ]) and procedure.provolatile='v' and pg_get_functiondef(procedure.oid) like '%pg_advisory_xact_lock%';
      `) === "4");
      check(`sequence ${sequenceNumber}: 10U leaves run and bundle uniqueness contracts intact`, scalar(String.raw`
        select (select count(*) from pg_index index_catalog join pg_class index_row on index_row.oid=index_catalog.indexrelid
          where index_row.relname in('routine_run_operations_personal_idempotency','routine_run_operations_operator_idempotency')
            and index_catalog.indisunique and index_catalog.indisvalid and index_catalog.indpred is not null)::text||':'||
          (select count(*) from pg_constraint where conrelid='public.routine_bundle_operations'::regclass
            and conname='routine_bundle_operations_idempotency_unique' and contype='u')::text;
      `) === "2:1");
    }
    if (path.endsWith("phase10v_routine_creation_idempotency_provenance_alignment.sql")) {
      check(`sequence ${sequenceNumber}: 10V removes exactly the four legacy resource provenance constraints`, scalar(String.raw`
        select count(*) from pg_constraint where conname in(
          'routine_runs_org_creation_idempotency_unique','routine_run_participants_org_idempotency_unique',
          'routine_bundles_org_idempotency_unique','routine_bundle_participants_idempotency_unique');
      `) === "0");
      check(`sequence ${sequenceNumber}: 10V preserves UUID NOT NULL provenance and six business identity indexes`, scalar(String.raw`
        select
          (select count(*) from information_schema.columns where table_schema='public'
            and table_name in('routine_runs','routine_run_participants','routine_bundles','routine_bundle_participants')
            and column_name='creation_idempotency_key' and data_type='uuid' and is_nullable='NO')::text||':'||
          (select count(*) from pg_index index_row join pg_class index_relation on index_relation.oid=index_row.indexrelid
            where index_relation.relname in('routine_runs_authoritative_identity_idx','routine_run_participants_personal_unique',
              'routine_run_participants_operator_unique','routine_bundles_active_identity_unique',
              'routine_bundle_participants_personal_unique','routine_bundle_participants_operator_unique')
              and index_row.indisunique and index_row.indisvalid and index_row.indisready)::text;
      `) === "4:6");
      check(`sequence ${sequenceNumber}: 10V leaves settings content and operative rows unchanged`,
        JSON.stringify(settingsState()) === JSON.stringify(stateAfterK4)
          && scalar("select (select count(*) from public.routine_content_pack_installations)=0 and (select count(*) from public.routine_templates)=0 and (select count(*) from public.routine_runs)=0 and (select count(*) from public.routine_bundles)=0;") === "t");
    }
    if (path.endsWith("phase10o_routine_default_privilege_hardening.sql")) {
      check(`sequence ${sequenceNumber}: 10O changes only pg_default_acl`,
        existingObjectSnapshot() === before10O);
      const catalog = catalogForMutation();
      const relevantDefaults = catalog.records.filter((record) => record.category === "default_acl"
        && record.fields.owner === ROLE
        && (record.fields.schema === "public" || record.fields.schema === null)
        && ["r", "S", "f"].includes(record.fields.object_type));
      const defaultFingerprint = createHash("sha256").update(canonicalJson(relevantDefaults)).digest("hex");
      if (sequenceNumber === 1) stableDefaultAclFingerprint = defaultFingerprint;
      else check(`sequence ${sequenceNumber}: 10O default ACL reapply is a catalog no-op`,
        defaultFingerprint === stableDefaultAclFingerprint);

      const probe = futureObjectProbe();
      check(`sequence ${sequenceNumber}: future table, sequence, and function have no client privileges`,
        probe.clientPrivileges.length === 0);
      check(`sequence ${sequenceNumber}: future-object owner access remains intact`,
        probe.ownerAccess.table === true && probe.ownerAccess.sequence === true && probe.ownerAccess.function === true);
      check(`sequence ${sequenceNumber}: 10O and future objects use the effective migration role`,
        probe.currentUser === ROLE && probe.tableOwner === ROLE && probe.sequenceOwner === ROLE
          && probe.functionOwner === ROLE && probe.defaultAclRoles.length === 1 && probe.defaultAclRoles[0] === ROLE);
      check(`sequence ${sequenceNumber}: session and effective role context is recorded`,
        probe.sessionUser === SESSION_ROLE && (OWNER_CONTEXT === "production"
          ? probe.currentUser === probe.sessionUser : probe.currentUser !== probe.sessionUser));

      if (sequenceNumber === 1) {
        const negativeTable = futureObjectProbe("alter default privileges in schema public grant select on tables to authenticated;");
        const negativeSequence = futureObjectProbe("alter default privileges in schema public grant usage on sequences to anon;");
        const negativeFunction = futureObjectProbe("alter default privileges grant execute on functions to public;");
        check("default-ACL attestation detects a reintroduced authenticated table privilege",
          negativeTable.clientPrivileges.some((entry) => entry === "table|authenticated|SELECT"));
        check("default-ACL attestation detects a reintroduced anon sequence privilege",
          negativeSequence.clientPrivileges.some((entry) => entry === "sequence|anon|USAGE"));
        check("default-ACL attestation detects reintroduced PUBLIC function EXECUTE",
          negativeFunction.clientPrivileges.some((entry) => entry === "function|PUBLIC|EXECUTE"));
      }
    }
  }
}

function futureOrganizationChecks() {
  psql(String.raw`
    insert into auth.users(id) values
      ('${FUTURE_MANAGER_ID}'),('${FUTURE_STAFF_ID}'),('${FUTURE_SHARED_DEVICE_ID}');
    insert into public.organizations(id,name,slug,created_at) values
      ('${FUTURE_ORGANIZATION_ID}','Future organization fixture','phase10-future-organization-fixture','2026-01-04 00:00:00+00');
    insert into public.user_profiles(
      id,organization_id,display_name,role,active,is_shared_device,shared_device_label,created_at,updated_at
    ) values
      ('${FUTURE_MANAGER_ID}','${FUTURE_ORGANIZATION_ID}','Future Manager','manager',true,false,null,
        '2026-01-04 00:00:00+00','2026-01-04 00:00:00+00'),
      ('${FUTURE_STAFF_ID}','${FUTURE_ORGANIZATION_ID}','Future Staff','staff',true,false,null,
        '2026-01-04 00:00:00+00','2026-01-04 00:00:00+00'),
      ('${FUTURE_SHARED_DEVICE_ID}','${FUTURE_ORGANIZATION_ID}','Future Shared Device','manager',true,true,'Future device',
        '2026-01-04 00:00:00+00','2026-01-04 00:00:00+00');
  `, { transaction: true });
  check("post-install organization has no implicit settings row before manager action",
    scalar(`select count(*) from public.routine_organization_settings where organization_id='${FUTURE_ORGANIZATION_ID}';`) === "0");

  const created = JSON.parse(scalar(actorSql(FUTURE_MANAGER_ID, String.raw`
    select to_jsonb(public.create_or_update_routine_organization_settings(
      'legacy','Europe/Oslo','04:00'::time,false,24,null
    ))::text;
  `)).split("\n").at(-1));
  check("post-install manager action creates the current K4 release contract",
    created.organization_id === FUTURE_ORGANIZATION_ID
      && created.mode === "legacy" && created.ui_release_stage === "staff_preview"
      && created.ui_contract_version === "phase10k4-v1"
      && created.pilot_new_work_paused === false && created.pilot_pause_reason === null
      && created.pilot_paused_at === null && created.pilot_paused_by_auth_user_id === null);
  check("post-install manager-created settings retain the real manager actor",
    created.created_by_auth_user_id === FUTURE_MANAGER_ID
      && created.updated_by_auth_user_id === FUTURE_MANAGER_ID && created.revision === 1);

  const bootstrap = JSON.parse(scalar(actorSql(FUTURE_MANAGER_ID,
    "select public.get_routine_application_bootstrap()::text;"
  )).split("\n").at(-1));
  check("post-install manager bootstrap reads the current K4 contract without migration reapply",
    bootstrap.organizationId === FUTURE_ORGANIZATION_ID && bootstrap.mode === "legacy"
      && bootstrap.uiReleaseStage === "staff_preview" && bootstrap.contractVersion === "phase10k4-v1"
      && bootstrap.managerPreviewAllowed === false && bootstrap.accessReasonCode === "routine_ui_legacy");

  for (const [label, actorId] of [["staff", FUTURE_STAFF_ID], ["shared-device", FUTURE_SHARED_DEVICE_ID]]) {
    const mutation = psql(actorSql(actorId, String.raw`
      select public.create_or_update_routine_organization_settings(
        'legacy','Europe/Oslo','04:00'::time,false,24,1
      );
    `), { allowFailure: true });
    check(`post-install ${label} cannot manage organization settings`, mutation.status !== 0
      && /Manager access is required|operator_auth_failed/i.test(mutation.stderr));
    const managerRead = psql(actorSql(actorId, "select public.get_routine_manager_control_center();"), { allowFailure: true });
    check(`post-install ${label} cannot access the manager read model`, managerRead.status !== 0
      && /personal authenticated manager|Personal manager access is required|Manager access is required|operator_auth_failed/i.test(managerRead.stderr));
  }
  check("future-organization checks create no content or operative Routine data",
    scalar("select (select count(*) from public.routine_content_pack_installations)=0 and (select count(*) from public.routine_templates)=0 and (select count(*) from public.routine_runs)=0 and (select count(*) from public.routine_bundles)=0 and (select count(*) from public.routine_delivery_records)=0 and (select count(*) from public.routine_operators)=0 and (select count(*) from public.routine_operator_sessions)=0;") === "t");
}

function namedArgumentChecks() {
  const canonical = psql(actorSql(MANAGER_ID, String.raw`
    select public.validate_routine_template_version(
      input_version_id => 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      input_publication_version_ids => null
    );
  `), { allowFailure: true });
  check("canonical named-argument SQL/RPC contract resolves the function", canonical.status !== 0 && /Routine template version was not found/i.test(canonical.stderr));

  const legacy = psql(actorSql(MANAGER_ID, String.raw`
    select public.validate_routine_template_version(
      input_version_id => 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      input_batch_version_ids => null
    );
  `), { allowFailure: true });
  check("legacy named key is rejected at function resolution", legacy.status !== 0 && /function .* does not exist|42883/i.test(legacy.stderr));

  const anonDenied = psql(String.raw`
    set role anon;
    select public.validate_routine_template_version(
      input_version_id => 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      input_publication_version_ids => null
    );
  `, { allowFailure: true });
  check("anon cannot invoke an authenticated public Routine RPC",
    anonDenied.status !== 0 && /permission denied for function validate_routine_template_version/i.test(anonDenied.stderr));

  const internalDenied = psql(actorSql(MANAGER_ID, String.raw`
    select public.routine_preview_delivery_item_canonical('{}'::jsonb);
  `), { allowFailure: true });
  check("authenticated cannot invoke a private canonical helper",
    internalDenied.status !== 0 && /permission denied for function routine_preview_delivery_item_canonical/i.test(internalDenied.stderr));

  const publicRead = psql(actorSql(MANAGER_ID, String.raw`
    select public.get_routine_run_workspace('ffffffff-ffff-4fff-8fff-ffffffffffff');
  `), { allowFailure: true });
  check("authenticated reaches a public read RPC and server authorization remains authoritative",
    !/permission denied for function get_routine_run_workspace/i.test(publicRead.stderr));

  const publicMutation = psql(actorSql(MANAGER_ID, String.raw`
    select public.cancel_routine_run(
      'ffffffff-ffff-4fff-8fff-ffffffffffff','ACL probe',0,
      'ffffffff-ffff-4fff-8fff-fffffffffff0'
    );
  `), { allowFailure: true });
  check("authenticated reaches a public mutation RPC and server authorization remains authoritative",
    !/permission denied for function cancel_routine_run/i.test(publicMutation.stderr));

  for (const [label, actorId] of [["staff", STAFF_ID], ["shared-device operator", SHARED_DEVICE_ID]]) {
    const denied = psql(actorSql(actorId, String.raw`
      select public.validate_routine_template_version(
        input_version_id => 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        input_publication_version_ids => null
      );
    `), { allowFailure: true });
    const expectedDenial = label === "staff"
      ? /Manager template permission is required/i
      : /operator_auth_failed|Manager template permission is required/i;
    check(`${label} receives no manager validation access`, denied.status !== 0 && expectedDenial.test(denied.stderr));
  }
}

async function main() {
  sourceChecks();
  command("docker", ["--version"]);
  docker(["image", "inspect", IMAGE]);
  docker([
    "run", "--detach", "--rm", "--pull", "never", "--name", CONTAINER, "--network", "none",
    "--env", `POSTGRES_PASSWORD=${PASSWORD}`, "--env", `POSTGRES_DB=${DATABASE}`, IMAGE,
  ]);
  started = true;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const logs = docker(["logs", CONTAINER], { allowFailure: true });
    const state = docker(["exec", CONTAINER, "pg_isready", `--username=${ROLE}`, `--dbname=${DATABASE}`], { allowFailure: true });
    if (/PostgreSQL init process complete; ready for start up/i.test(`${logs.stdout}\n${logs.stderr}`) && state.status === 0) {
      ready = true;
      break;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  if (!ready) throw new Error("Disposable PostgreSQL did not become ready.");
  if (OWNER_CONTEXT === "rehearsal") {
    const bootstrap = docker([
      "exec", "-i", CONTAINER, "psql", "--no-psqlrc", "--set=ON_ERROR_STOP=1",
      "--username=supabase_admin", `--dbname=${DATABASE}`,
    ], { input: `create role ${SESSION_ROLE} login; grant supabase_admin, authenticated, anon to ${SESSION_ROLE};` });
    check("disposable rehearsal login can SET ROLE to the migration owner", bootstrap.status === 0);
  } else {
    const bootstrap = docker([
      "exec", "-i", CONTAINER, "psql", "--no-psqlrc", "--set=ON_ERROR_STOP=1",
      "--username=supabase_admin", `--dbname=${DATABASE}`,
    ], { input: `grant connect,create,temporary on database ${DATABASE} to postgres; grant usage,create on schema public,storage to postgres;` });
    check("disposable production owner can create objects in the production-shaped database", bootstrap.status === 0);
  }
  const serverVersion = scalar("show server_version;");
  check("network-isolated disposable PostgreSQL 17.6 is running", serverVersion.startsWith("17.6"));
  console.log(`PostgreSQL ${serverVersion}; Docker network mode: none`);

  psql(storageBootstrapSql);
  for (const path of baseline) psql(readFileSync(absolute(path), "utf8"), { transaction: true });
  psql(baselineFixtureSql, { transaction: true });
  psql(publicationBootstrapSql, { transaction: true });
  psql(fingerprintHelperSql);
  const protectedBaseline = {
    schema: scalar(protectedSchemaFingerprintSql),
    data: scalar(protectedDataFingerprintSql),
    realtime: scalar(protectedRealtimeFingerprintSql),
  };
  check("production-shaped baseline includes synthetic protected-domain data", protectedBaseline.data.length === 64);
  check("production-shaped baseline has 13 protected Realtime tables", scalar("select count(*) from pg_catalog.pg_publication_tables where pubname='supabase_realtime';") === "13");

  const states = [];
  for (let sequence = 1; sequence <= 3; sequence += 1) {
    applySequence(sequence);
    const state = captureState();
    states.push(state);
    assertEndState(`sequence ${sequence}`, state, protectedBaseline);
    console.log(`Sequence ${sequence} fingerprints: protected-schema=${state.protectedSchema} protected-data=${state.protectedData} protected-realtime=${state.protectedRealtime} routine-schema=${state.routineSchema} raw-acl=${state.rawAclFingerprint} effective-acl=${state.effectiveAclFingerprint}`);
  }
  check("three complete 24-migration sequences apply exactly 72 migrations", migrationApplications === 72);

  const aclDrift = [...new Set([
    ...Object.keys(states[0].routineFunctions),
    ...Object.keys(states[1].routineFunctions),
  ])].filter((signature) => JSON.stringify(states[0].routineFunctions[signature]?.effectiveAcl) !== JSON.stringify(states[1].routineFunctions[signature]?.effectiveAcl));
  check("all Routine table data, counts, revisions, and timestamps are stable across three sequences",
    JSON.stringify(states[1].routineData) === JSON.stringify(states[0].routineData)
      && JSON.stringify(states[2].routineData) === JSON.stringify(states[0].routineData));
  check("mode, stage, operative counts, and aggregate hashes are stable across three sequences",
    JSON.stringify(states[1].operational) === JSON.stringify(states[0].operational)
      && JSON.stringify(states[2].operational) === JSON.stringify(states[0].operational));
  if (aclDrift.length > 0) {
    console.log(`Routine function ACL drift after first reapply (${aclDrift.length}): ${aclDrift.join(", ")}`);
    for (const signature of aclDrift) {
      console.log(`ACL_DETAIL|${signature}|${JSON.stringify(states[0].routineFunctions[signature])}|${JSON.stringify(states[1].routineFunctions[signature])}`);
    }
  }
  check("first and second complete sequence have identical Routine function grants", aclDrift.length === 0);
  check("legacy environment-dependent Routine schema fingerprint is identical within this owner context",
    states[0].routineSchema === states[1].routineSchema && states[0].routineSchema === states[2].routineSchema);
  check("portable semantic schema fingerprint is identical across all three sequences",
    states[0].portableSchema === EXPECTED_PORTABLE_SCHEMA_FINGERPRINT
      && states.every((state) => state.portableSchema === states[0].portableSchema));
  check("raw Routine function ACL fingerprint is identical across all three sequences",
    states[0].rawAclFingerprint === states[1].rawAclFingerprint
      && states[0].rawAclFingerprint === states[2].rawAclFingerprint);
  check("effective Routine function ACL fingerprint is identical across all three sequences",
    states[0].effectiveAclFingerprint === states[1].effectiveAclFingerprint
      && states[0].effectiveAclFingerprint === states[2].effectiveAclFingerprint);
  check("Routine function owners, security modes, signatures, results, comments, and volatility are stable",
    states[0].routineFunctionMetadataFingerprint === states[1].routineFunctionMetadataFingerprint
      && states[0].routineFunctionMetadataFingerprint === states[2].routineFunctionMetadataFingerprint);
  check("validation blockers, warnings, and content hash are stable across three sequences",
    JSON.stringify(states[1].validationProbe) === JSON.stringify(states[0].validationProbe)
      && JSON.stringify(states[2].validationProbe) === JSON.stringify(states[0].validationProbe));
  check("content preview and audit are stable across three sequences",
    JSON.stringify(states[1].contentPack) === JSON.stringify(states[0].contentPack)
      && JSON.stringify(states[2].contentPack) === JSON.stringify(states[0].contentPack));
  check("second complete sequence is fully schema/data/state stable", JSON.stringify(states[1]) === JSON.stringify(states[0]));
  check("third complete sequence is fully schema/data/state stable", JSON.stringify(states[2]) === JSON.stringify(states[0]));
  check("published/content/run/timing/delivery/bundle hashes are stable", JSON.stringify(states[0].operational.hashes) === JSON.stringify(states[2].operational.hashes));
  check("validation blockers, warnings, and content hash are stable", JSON.stringify(states[0].validationProbe) === JSON.stringify(states[2].validationProbe));
  futureOrganizationChecks();
  namedArgumentChecks();
  const mutationFingerprints = semanticMutationProbes();
  for (const [label, mutatedFingerprint] of Object.entries(mutationFingerprints)) {
    check(`portable attestation rejects a real ${label} semantic change`,
      mutatedFingerprint !== EXPECTED_PORTABLE_SCHEMA_FINGERPRINT);
  }
  const unexpectedClientCatalog = catalogForMutation(
    "grant execute on function public.routine_current_actor_source() to anon;"
  );
  check("literal client ACL attestation rejects one unexpected anon privilege",
    clientAclAttestation(unexpectedClientCatalog).broadFunctionExecute.anon
      .includes("public.routine_current_actor_source()"));
  console.log(`LEGACY_DIAGNOSTIC|${OWNER_CONTEXT}|schema=${states[0].routineSchema}|raw-acl=${states[0].rawAclFingerprint}|effective-acl=${states[0].effectiveAclFingerprint}`);
  console.log(`CLIENT_ACL_ATTESTATION|${OWNER_CONTEXT}|PASS|functions=${states[0].clientAcl.authenticatedFunctions.length}|relations=${states[0].clientAcl.authenticatedSelect.length}`);
  console.log(`DEFAULT_ACL_ATTESTATION|${OWNER_CONTEXT}|PASS|current_user=${states[0].environment.execution.currentUser}`);
  console.log(`OWNER_PLATFORM_REPORT|${OWNER_CONTEXT}|${canonicalJson(states[0].environment)}`);
  console.log(`PORTABLE_RESULT|${OWNER_CONTEXT}|${states[0].portableSchema}`);
  console.log(`PASS ${passCount} full Phase 10 migration reapply checks (${OWNER_CONTEXT}, 60/60)`);
  return states[0].portableSchema;
}

let portableResult = null;
try {
  portableResult = await main();
} catch (error) {
  console.error(String(error?.stack ?? error));
  process.exitCode = 1;
} finally {
  cleanup();
  console.log(`Disposable database cleanup: ${started ? "FAILED" : "complete"}`);
}

if (!process.exitCode && OWNER_CONTEXT === "rehearsal" && process.env.PHASE10O_CHILD !== "1") {
  const child = command(process.execPath, [fileURLToPath(import.meta.url)], {
    timeout: 600_000,
    env: { ...process.env, PHASE10O_OWNER_CONTEXT: "production", PHASE10O_CHILD: "1" },
  });
  process.stdout.write(child.stdout);
  process.stderr.write(child.stderr);
  const productionMatch = child.stdout.match(/PORTABLE_RESULT\|production\|([0-9a-f]{64})/);
  check("rehearsal and production-shaped owner contexts have the identical portable fingerprint",
    portableResult === EXPECTED_PORTABLE_SCHEMA_FINGERPRINT
      && productionMatch?.[1] === EXPECTED_PORTABLE_SCHEMA_FINGERPRINT);
  console.log("PASS owner-context matrix: rehearsal 60/60 + production-shaped 60/60");
}
