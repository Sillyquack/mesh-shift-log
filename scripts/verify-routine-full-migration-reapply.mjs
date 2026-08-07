import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IMAGE = "public.ecr.aws/supabase/postgres:17.6.1.141";
const DATABASE = "phase10_full_reapply_test";
const ROLE = "supabase_admin";
const CONTAINER = `mesh-shift-log-phase10-full-reapply-${process.pid}-${randomUUID().slice(0, 8)}`;
const PASSWORD = `phase10-full-reapply-${randomUUID()}`;
const MANAGER_ID = "aa100000-0000-4000-8000-000000000001";
const STAFF_ID = "aa100000-0000-4000-8000-000000000002";
const SHARED_DEVICE_ID = "aa100000-0000-4000-8000-000000000003";
const ORGANIZATION_ID = "aa000000-0000-4000-8000-000000000001";
const EXPECTED_PACK_HASH = "c149a8416a867dcb7d87224f3ae8e2a214e5ca4954613b118521ebe5ae3aff2a";
const EXPECTED_SOURCE_HASHES = [
  "ea00e80bde6c17ea1d3f1095949363d79d606dcee16f05f742426c1c5248e079",
  "27698f86716a141268546c623609f8b956213e53f20d00c03935cad01bd9244c",
  "f4fce4d5a3dcafecd7dfca2a5bf780f7c3652634da2cb0f068daa5d4f506a0eb",
  "8ebedb39be888dfa118a429fa2046ba2b7b5dc49c868d9d5b811f2aa89b45351",
];
const EXPECTED_ARGUMENT_NAMES = ["input_version_id", "input_publication_version_ids"];
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
    `--username=${ROLE}`, `--dbname=${DATABASE}`,
  ];
  if (tuplesOnly) args.push("--tuples-only", "--no-align", "--quiet");
  if (transaction) args.push("--single-transaction");
  return docker(args, { input: sql, allowFailure, timeout: 300_000 });
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
  for (const path of [...baseline, ...migrations, "content/routine-engine/mesh-routine-content-v1.json", "src/features/routines-v2/api/routineTemplateClient.js"]) {
    check(`required file exists: ${path}`, existsSync(absolute(path)));
  }
  const audit = auditRepeatedFunctionArguments();
  check("all repeated Phase 10 function identities have stable input argument names", audit.drifts.length === 0);
  check("function argument audit covers the full Phase 10 definition set", audit.definitions.length === 542 && audit.repeated.length === 85);
  check("validator has six layered public definitions", audit.target.length === 6);
  check("every validator definition uses the canonical input names", audit.target.every((entry) => JSON.stringify(entry.names) === JSON.stringify(EXPECTED_ARGUMENT_NAMES)));
  check("ACL hardening inventory contains the reproduced 17 signatures", REPRODUCED_ACL_SIGNATURES.length === 17);
  check("full ACL audit contains 15 additional same-class signatures", ACL_SIGNATURES.length === 32);
  console.log(`Static function audit: ${audit.definitions.length} definitions, ${audit.repeated.length} repeated identities, ${audit.drifts.length} drifts`);

  const allSql = phase10Sql();
  check("Phase 10 migrations contain no DROP CASCADE", !/\bdrop\s+(?:function|table|schema|type|view|materialized\s+view|trigger|policy|publication)[^;]*\bcascade\b/i.test(allSql));
  check("Phase 10 migrations contain no ALTER DEFAULT PRIVILEGES", !/\balter\s+default\s+privileges\b/i.test(allSql));
  check("ACL hardening uses no broad all-functions revoke", !/\brevoke\b[^;]*\bon\s+all\s+functions\b/i.test(allSql));
  check("Phase 10 policies contain no unconditional true predicate", !/\busing\s*\(\s*true\s*\)|\bwith\s+check\s*\(\s*true\s*\)/i.test(allSql));
  check("legacy validator key is absent from all Phase 10 migrations", !/\binput_batch_version_ids\b/.test(allSql));

  const client = readFileSync(absolute("src/features/routines-v2/api/routineTemplateClient.js"), "utf8");
  check("Supabase RPC payload uses the canonical validator key", client.includes("input_publication_version_ids") && !client.includes("input_batch_version_ids"));
  const pack = JSON.parse(readFileSync(absolute("content/routine-engine/mesh-routine-content-v1.json"), "utf8"));
  check("content pack hash remains canonical", pack.packHash === EXPECTED_PACK_HASH);
  check("content pack minor version is 1.1R", pack.packVersion === "1.1R");
  check("authoritative content source hashes remain canonical", JSON.stringify(pack.sourceDocuments.map((entry) => entry.sha256)) === JSON.stringify(EXPECTED_SOURCE_HASHES));
  check("content pack shape remains 37 Opening, 46 Closing, and four system steps", pack.opening.tasks.length === 37 && pack.closing.tasks.length === 46 && pack.doubleShiftSteps.length === 4);
  check("only the serviceware office route remains unresolved", pack.unresolvedRequirements.length === 1 && pack.unresolvedRequirements[0].standardKey === "serviceware-office-recovery-route-confirmation");
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
  ('${MANAGER_ID}'),('${STAFF_ID}'),('${SHARED_DEVICE_ID}');
insert into public.organizations(id,name,slug,created_at) values
  ('${ORGANIZATION_ID}','Full reapply fixture','phase10-full-reapply-fixture','2026-01-01 00:00:00+00');
insert into public.user_profiles(
  id,organization_id,display_name,role,active,is_shared_device,shared_device_label,created_at,updated_at
) values
  ('${MANAGER_ID}','${ORGANIZATION_ID}','Reapply Manager','manager',true,false,null,'2026-01-01 00:00:00+00','2026-01-01 00:00:00+00'),
  ('${STAFF_ID}','${ORGANIZATION_ID}','Reapply Staff','staff',true,false,null,'2026-01-01 00:00:00+00','2026-01-01 00:00:00+00'),
  ('${SHARED_DEVICE_ID}','${ORGANIZATION_ID}','Reapply Shared Device','staff',true,true,'Shared device fixture','2026-01-01 00:00:00+00','2026-01-01 00:00:00+00');

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
    public.phase10_reapply_table_fingerprint(format('%I.%I',schemaname,tablename)) table_hash
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
create or replace function public.phase10_reapply_table_fingerprint(input_relation text)
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
revoke all on function public.phase10_reapply_table_fingerprint(text) from public,anon,authenticated;
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

function routineDataState() {
  const tables = scalar("select coalesce(string_agg(tablename,E'\\n' order by tablename),'') from pg_catalog.pg_tables where schemaname='public' and tablename like 'routine_%';")
    .split("\n").filter(Boolean);
  const data = {};
  for (const table of tables) {
    const [count, hash] = scalar(`select count(*)||'|'||public.phase10_reapply_table_fingerprint('public.${table}') from public.${table};`).split("|");
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
  'actualImages',(select count(*) from storage.objects where bucket_id='routine-reference-images'),
  'hashes',jsonb_build_object(
    'published',public.phase10_reapply_table_fingerprint('public.routine_template_publication_batches'),
    'content',public.phase10_reapply_table_fingerprint('public.routine_template_versions'),
    'runs',public.phase10_reapply_table_fingerprint('public.routine_runs'),
    'timing',public.phase10_reapply_table_fingerprint('public.routine_run_task_timings'),
    'delivery',public.phase10_reapply_table_fingerprint('public.routine_delivery_records'),
    'bundles',public.phase10_reapply_table_fingerprint('public.routine_bundles')
  )
)::text;
  `));
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
  return {
    protectedSchema: scalar(protectedSchemaFingerprintSql),
    protectedData: scalar(protectedDataFingerprintSql),
    protectedRealtime: scalar(protectedRealtimeFingerprintSql),
    routineSchema: scalar(routineSchemaFingerprintSql),
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
  check(`${label}: affected public RPC and internal-helper allowlists are exact`,
    ACL_SIGNATURES.every((signature) => {
      const expected = ACL_EXPECTATIONS[signature] === "public"
        ? ["authenticated", "postgres", "service_role", "supabase_admin"]
        : ["postgres", "service_role", "supabase_admin"];
      return JSON.stringify(executableGrantees(state.routineFunctions[signature])) === JSON.stringify(expected);
    }));
  const settings = state.operational.settings;
  check(`${label}: mode remains legacy and release stage remains staff_preview`,
    settings.length === 1 && settings[0].mode === "legacy" && settings[0].ui_release_stage === "staff_preview");
  check(`${label}: no content pack, publication, run, task, bundle, or delivery state exists`,
    state.operational.templates === 0 && state.operational.publishedTemplates === 0
      && state.operational.runs === 0 && state.operational.runTasks === 0
      && state.operational.bundles === 0 && state.operational.deliveries === 0
      && state.operational.packInstallations === 0 && state.operational.packOperations === 0);
  check(`${label}: no pilot membership, release attestation, or actual routine image exists`,
    state.operational.pilotMemberships === 0 && state.operational.releaseAttestations === 0 && state.operational.actualImages === 0);
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
  check(`${label}: content preview keeps 37/46 tasks, four DS steps, and one unresolved blocker`,
    state.contentPack.preview.counts.openingTasks === 37
      && state.contentPack.preview.counts.closingTasks === 46
      && state.contentPack.preview.counts.doubleShiftSteps === 4
      && state.contentPack.preview.unresolvedRequirements.length === 1
      && state.contentPack.preview.unresolvedRequirements[0].standardKey === "serviceware-office-recovery-route-confirmation");
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
  console.log(`Applying full Phase 10A-L sequence ${sequenceNumber}`);
  for (let index = 0; index < migrations.length; index += 1) {
    const path = migrations[index];
    psql(readFileSync(absolute(path), "utf8"), { transaction: true });
    if (sequenceNumber === 1 && index === 0) {
      psql(managerSql("select public.create_or_update_routine_organization_settings('legacy','Europe/Oslo','04:00'::time,false,24,null);"));
    }
    if (index === 1) {
      const contract = validatorContract();
      check(`sequence ${sequenceNumber}: Phase 10B applies with canonical validator names`,
        JSON.stringify(contract.argumentNames) === JSON.stringify(EXPECTED_ARGUMENT_NAMES));
      if (sequenceNumber === 1) {
        check("first Phase 10B apply starts from an empty template state", scalar("select count(*) from public.routine_templates;") === "0");
      }
    }
  }
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
  check("first and second A-L sequence have identical Routine function grants", aclDrift.length === 0);
  check("Routine schema fingerprint is identical across all three sequences",
    states[0].routineSchema === states[1].routineSchema && states[0].routineSchema === states[2].routineSchema);
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
  check("second A-L sequence is fully schema/data/state stable", JSON.stringify(states[1]) === JSON.stringify(states[0]));
  check("third A-L sequence is fully schema/data/state stable", JSON.stringify(states[2]) === JSON.stringify(states[0]));
  check("published/content/run/timing/delivery/bundle hashes are stable", JSON.stringify(states[0].operational.hashes) === JSON.stringify(states[2].operational.hashes));
  check("validation blockers, warnings, and content hash are stable", JSON.stringify(states[0].validationProbe) === JSON.stringify(states[2].validationProbe));
  namedArgumentChecks();
  console.log(`PASS ${passCount} full Phase 10 migration reapply checks`);
}

try {
  await main();
} catch (error) {
  console.error(String(error?.stack ?? error));
  process.exitCode = 1;
} finally {
  cleanup();
  console.log(`Disposable database cleanup: ${started ? "FAILED" : "complete"}`);
}
