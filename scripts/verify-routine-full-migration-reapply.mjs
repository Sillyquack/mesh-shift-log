import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IMAGE = "public.ecr.aws/supabase/postgres:17.6.1.141";
const OWNER_CONTEXT = process.env.PHASE10O_OWNER_CONTEXT === "production" ? "production" : "rehearsal";
const DATABASE = `phase10_full_reapply_${OWNER_CONTEXT}_test`;
const ROLE = OWNER_CONTEXT === "production" ? "postgres" : "supabase_admin";
const SESSION_ROLE = OWNER_CONTEXT === "production" ? "postgres" : "phase10o_rehearsal_login";
const CONNECTION_ROLE = OWNER_CONTEXT === "production" ? "postgres" : "supabase_admin";
const CONTAINER = `mesh-shift-log-phase10-full-reapply-${process.pid}-${randomUUID().slice(0, 8)}`;
const PASSWORD = `phase10-full-reapply-${randomUUID()}`;
const PHASE9_SECURITY_FIXTURE = "supabase/tests/phase9/security-fixtures.sql";
const PHASE9_TERMINAL_FIXTURE = "supabase/tests/phase9/terminal-migration-production-shape.sql";
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
const ACTIVATION_ORGANIZATION_ID = "ae000000-0000-4000-8000-000000000001";
const ACTIVATION_MANAGER_ID = "ae100000-0000-4000-8000-000000000001";
const ACTIVATION_RECOVERY_KEY = "ae200000-0000-4000-8000-000000000001";
const EXPECTED_PACK_HASH = "48b7c4dfdb1340ddff14748a3c6d57df504f33fe822f25b6dde0d4ab48a6caf8";
const EXPECTED_FRIDGE_PACK_HASH = "710c9412eabc8f2e9c5a6488499ac4654cd7c94b62138eaed9563ab5f0203c9c";
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
const EXPECTED_FRIDGE_SOURCE_HASHES = [
  ...EXPECTED_SOURCE_HASHES,
  "2a57f578128b6a6b696bf4f93d721fd6c56837ae413c9599a2845885c6c7a834",
];
const EXPECTED_ARGUMENT_NAMES = ["input_version_id", "input_publication_version_ids"];
const EXPECTED_PORTABLE_SCHEMA_FINGERPRINT = "6196f6f2657494badbb85cf9e0c0d2a07a9aea7a74d56e2b35726b7da0ab1f91";
const EXPECTED_AUTHENTICATED_FUNCTION_COUNT = 220;
const EXPECTED_AUTHENTICATED_FUNCTION_HASH = "35627e2aad45a00ef4103daebf1a93e400c679c01ff6f0096f136e0fd11991c9";
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
function psqlAsConnectionOwner(sql) {
  return docker([
    "exec", "-i", CONTAINER, "psql", "--no-psqlrc", "--set=ON_ERROR_STOP=1",
    `--username=${CONNECTION_ROLE}`, `--dbname=${DATABASE}`,
  ], { input: sql.replace(/^\uFEFF/, ""), timeout: 300_000 });
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
  "supabase/phase9a4_inventory_location_template.sql",
  "supabase/phase9b_stock_policies.sql",
  "supabase/phase9c_inventory_security_hardening.sql",
  "supabase/phase9d_inventory_session_integrity.sql",
  "supabase/phase9e_inventory_product_identity_csv.sql",
  "supabase/phase9f_inventory_structured_quantities.sql",
  "supabase/phase9g_inventory_operational_scope.sql",
  "supabase/phase9gb_inventory_counter_assignments.sql",
  "supabase/phase9gb2_inventory_counter_replacement.sql",
  "supabase/phase9gc_inventory_counter_mobile.sql",
  "supabase/phase9gd_inventory_product_mappings.sql",
  "supabase/phase9h_inventory_session_location_scope.sql",
  "supabase/phase9i_millum_stock_count_exports.sql",
  "supabase/phase9j_inventory_shelf_storage_guidance.sql",
  "supabase/phase9k_millum_complete_count_export.sql",
  "supabase/20260804123921_phase9l_millum_august_carry_forward_and_future_scope.sql",
  "supabase/20260804151500_phase9m_millum_snapshot_supplement.sql",
  "supabase/20260804180000_phase9n_millum_single_authoritative_session.sql",
  "supabase/20260804200000_phase9o_millum_wine_value_conversion.sql",
  "supabase/20260805035957_phase9p_millum_export_explanations.sql",
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
  "supabase/phase10w_event_visual_reference_bridge.sql",
  "supabase/phase10x_event_visual_library_expansion.sql",
  "supabase/phase10y_mesh_routine_content_pack_1_5r.sql",
  "supabase/phase10z_inventory_location_and_express_shelf_alignment.sql",
  "supabase/phase10aa_event_floor_manager_pilot_membership.sql",
  "supabase/phase10ab_mesh_routine_content_1_5r_activation_recovery.sql",
  "supabase/phase10ac_routine_provider_vocabulary_alignment.sql",
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
  for (const path of [...baseline, ...migrations, "content/routine-engine/mesh-routine-content-v1.json", "content/routine-engine/mesh-routine-content-v1-2r.json", "content/routine-engine/mesh-routine-content-v1-3r.json", "content/routine-engine/mesh-routine-content-v1-4r.json", "content/routine-engine/mesh-routine-content-v1-5r.json", "src/features/routines-v2/api/routineTemplateClient.js"]) {
    check(`required file exists: ${path}`, existsSync(absolute(path)));
  }
  const audit = auditRepeatedFunctionArguments();
  console.log(`Static function audit: ${audit.definitions.length} definitions, ${audit.repeated.length} repeated identities, ${audit.drifts.length} drifts`);
  check("all repeated Phase 10 function identities have stable input argument names", audit.drifts.length === 0);
  check("function argument audit covers the full Phase 10 definition set including two narrow 10AC manager-RPC replacements",
    audit.definitions.length === 575 && audit.repeated.length === 97
      && audit.definitions.filter((definition) => definition.identity.startsWith("public.create_routine_standard(")).length === 2
      && audit.definitions.filter((definition) => definition.identity.startsWith("public.create_routine_standard_revision(")).length === 2);
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
  check("full Phase 10 manifest contains 31 ordered migrations through 10AC", migrations.length === 31
    && migrations[0].endsWith("phase10a_routine_engine_foundation.sql")
    && migrations[1].endsWith("phase10a1_routine_organization_settings_bootstrap.sql")
    && migrations.at(-16).endsWith("phase10l_mesh_routine_content_pack.sql")
    && migrations.at(-15).endsWith("phase10p_routine_readiness_finalization.sql")
    && migrations.at(-14).endsWith("phase10q_mesh_routine_content_pack_1_2r.sql")
    && migrations.at(-13).endsWith("phase10o_routine_default_privilege_hardening.sql")
    && migrations.at(-12).endsWith("phase10r_mesh_routine_content_pack_1_3r.sql")
    && migrations.at(-11).endsWith("phase10s_mesh_routine_content_pack_1_4r.sql")
    && migrations.at(-10).endsWith("phase10t_routine_participant_identity_conflict_alignment.sql")
    && migrations.at(-9).endsWith("phase10u_routine_operation_idempotency_convergence.sql")
    && migrations.at(-8).endsWith("phase10v_routine_creation_idempotency_provenance_alignment.sql")
    && migrations.at(-7).endsWith("phase10w_event_visual_reference_bridge.sql")
    && migrations.at(-6).endsWith("phase10x_event_visual_library_expansion.sql")
    && migrations.at(-5).endsWith("phase10y_mesh_routine_content_pack_1_5r.sql")
    && migrations.at(-4).endsWith("phase10z_inventory_location_and_express_shelf_alignment.sql")
    && migrations.at(-3).endsWith("phase10aa_event_floor_manager_pilot_membership.sql")
    && migrations.at(-2).endsWith("phase10ab_mesh_routine_content_1_5r_activation_recovery.sql")
    && migrations.at(-1).endsWith("phase10ac_routine_provider_vocabulary_alignment.sql"));
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
) on conflict(id) do update set
  name=excluded.name,
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;
insert into storage.objects(id,bucket_id,name,owner_id,metadata) values(
  'aa920000-0000-4000-8000-000000000001','inventory-location-reference-images',
  '${ORGANIZATION_ID}/fixture/reference.webp','${MANAGER_ID}',
  '{"size":128,"mimetype":"image/webp","fixture":true}'
);
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
    ) and procedure.proname not like 'event_visual_%')
) select encode(extensions.digest(convert_to(coalesce(string_agg(entry,E'\n' order by entry),''),'UTF8'),'sha256'),'hex') from entries;
`;
const protectedSchemaStableFingerprintSql = protectedSchemaFingerprintSql.replace(
  "and procedure.proname not like 'event_visual_%')",
  "and procedure.proname not like 'event_visual_%' and procedure.proname <> 'inventory_validate_reference_guidance')",
);
const guidanceValidatorContractSql = String.raw`
select (
  procedure.prorettype='pg_catalog.trigger'::regtype
  and not procedure.prosecdef
  and procedure.provolatile='v'
  and procedure.proconfig=array['search_path=pg_catalog']
  and position('location.active' in pg_get_functiondef(procedure.oid))>0
  and position('location.countable' in pg_get_functiondef(procedure.oid))>0
  and position('referenceGuidanceEnabled' in pg_get_functiondef(procedure.oid))>0
  and position('inventory_reference_image_path_valid' in pg_get_functiondef(procedure.oid))>0
)
from pg_catalog.pg_proc procedure
join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
where namespace.nspname='public' and procedure.proname='inventory_validate_reference_guidance'
  and pg_get_function_identity_arguments(procedure.oid)='';
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
function actorJson(actorId, expression) {
  const lines = psql(actorSql(actorId, `select (${expression})::text;`), { tuplesOnly: true })
    .stdout.trim().split("\n").filter(Boolean);
  return JSON.parse(lines.at(-1));
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
    protectedSchemaStable: scalar(protectedSchemaStableFingerprintSql),
    guidanceValidatorContract: scalar(guidanceValidatorContractSql),
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
  check(`${label}: protected schema outside the exact 10Z guidance validator is unchanged`,
    state.protectedSchemaStable === protectedBaseline.schemaStable);
  check(`${label}: 10Z guidance validator has the exact active countable-or-enabled contract`,
    state.guidanceValidatorContract === "t");
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
  console.log(`AUTHENTICATED_FUNCTION_DIAGNOSTIC|${label}|count=${state.clientAcl.authenticatedFunctions.length}|hash=${state.clientAcl.authenticatedFunctionHash}`);
  check(`${label}: authenticated function EXECUTE is the exact reviewed 220-signature allowlist`,
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
  check(`${label}: one isolated settings row exists per synthetic organization`, settings.length === Number(scalar("select count(*) from public.organizations;"))
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
    state.contentPack.preview.packMetadata.packHash === EXPECTED_FRIDGE_PACK_HASH
      && JSON.stringify(state.contentPack.sourceDocuments.map((entry) => entry.sha256)) === JSON.stringify(EXPECTED_FRIDGE_SOURCE_HASHES));
  check(`${label}: content preview keeps 37/46 tasks, four DS steps, and no unresolved blocker`,
    state.contentPack.preview.counts.openingTasks === 37
      && state.contentPack.preview.counts.closingTasks === 46
      && state.contentPack.preview.counts.doubleShiftSteps === 4
      && state.contentPack.preview.unresolvedRequirements.length === 0);
  check(`${label}: content audit confirms no installation or operations`,
    state.contentPack.audit.installation === null && state.contentPack.audit.operations.length === 0
      && state.contentPack.audit.currentPreview.packMetadata.packHash === EXPECTED_FRIDGE_PACK_HASH);
  check(`${label}: application roles have no direct Routine DML grant`, Number(scalar(String.raw`
    select count(*) from information_schema.role_table_grants
    where table_schema='public' and grantee in('public','anon','authenticated')
      and privilege_type in('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
      and table_name like 'routine_%';
  `)) === 0);
}

function phase10aaEligibilityChecks() {
  const result = psql(String.raw`
    begin;
    insert into auth.users(id) values
      ('ae100000-0000-4000-8000-000000000001'),
      ('ae100000-0000-4000-8000-000000000002'),
      ('ae100000-0000-4000-8000-000000000003'),
      ('ae100000-0000-4000-8000-000000000004'),
      ('ae100000-0000-4000-8000-000000000005'),
      ('ae100000-0000-4000-8000-000000000006'),
      ('ae100000-0000-4000-8000-000000000007');
    insert into public.user_profiles(
      id,organization_id,display_name,role,active,is_shared_device,created_at,updated_at
    ) values
      ('ae100000-0000-4000-8000-000000000001','${ORGANIZATION_ID}','Phase 10AA Event Floor Manager','event_floor_manager',true,false,clock_timestamp(),clock_timestamp()),
      ('ae100000-0000-4000-8000-000000000002','${ORGANIZATION_ID}','Phase 10AA Shift Lead','shift_lead',true,false,clock_timestamp(),clock_timestamp()),
      ('ae100000-0000-4000-8000-000000000003','${ORGANIZATION_ID}','Phase 10AA Counter','counter',true,false,clock_timestamp(),clock_timestamp()),
      ('ae100000-0000-4000-8000-000000000004','${ORGANIZATION_ID}','Phase 10AA Inactive Staff','staff',false,false,clock_timestamp(),clock_timestamp()),
      ('ae100000-0000-4000-8000-000000000005','${ORGANIZATION_ID}','Phase 10AA Unsupported','time2staff',true,false,clock_timestamp(),clock_timestamp()),
      ('ae100000-0000-4000-8000-000000000006','${SECONDARY_ORGANIZATION_ID}','Phase 10AA Cross Org','staff',true,false,clock_timestamp(),clock_timestamp()),
      ('ae100000-0000-4000-8000-000000000007',null,'Phase 10AA Null Org','staff',true,false,clock_timestamp(),clock_timestamp());
    select set_config('mesh.routine_ui_internal','mode',true);
    update public.routine_organization_settings set mode='shadow' where organization_id='${ORGANIZATION_ID}';
    set local role authenticated;
    select set_config('request.jwt.claim.sub','${MANAGER_ID}',true);
    do $phase10aa_test$
    declare
      v_revision bigint;
      v_previous_revision bigint;
      v_result jsonb;
      v_rejected boolean;
      v_before_memberships text;
      v_after_memberships text;
    begin
      -- Staff preview and participant behavior remains accepted; coordinator remains denied.
      select revision into v_revision from public.routine_organization_settings where organization_id='${ORGANIZATION_ID}';
      v_result:=public.replace_routine_pilot_memberships(
        '[{"identityType":"personal_profile","userProfileId":"${STAFF_ID}","accessLevel":"preview","active":true}]'::jsonb,
        v_revision,'ae200000-0000-4000-8000-000000000001');
      if (select count(*)<>1 from public.routine_pilot_memberships where organization_id='${ORGANIZATION_ID}' and active
          and user_profile_id='${STAFF_ID}' and access_level='preview') then raise exception 'Phase 10AA staff preview acceptance failed.'; end if;
      v_revision:=(v_result->>'settingsRevision')::bigint;
      v_result:=public.replace_routine_pilot_memberships(
        '[{"identityType":"personal_profile","userProfileId":"${STAFF_ID}","accessLevel":"participant","active":true}]'::jsonb,
        v_revision,'ae200000-0000-4000-8000-000000000002');
      if (select count(*)<>1 from public.routine_pilot_memberships where organization_id='${ORGANIZATION_ID}' and active
          and user_profile_id='${STAFF_ID}' and access_level='participant') then raise exception 'Phase 10AA staff participant acceptance failed.'; end if;
      v_revision:=(v_result->>'settingsRevision')::bigint;
      v_rejected:=false;
      begin
        perform public.replace_routine_pilot_memberships(
          '[{"identityType":"personal_profile","userProfileId":"${STAFF_ID}","accessLevel":"coordinator","active":true}]'::jsonb,
          v_revision,'ae200000-0000-4000-8000-000000000003');
      exception when insufficient_privilege then v_rejected:=true; end;
      if not v_rejected then raise exception 'Phase 10AA staff coordinator rejection failed.'; end if;

      -- Shift Lead keeps coordinator authority.
      v_result:=public.replace_routine_pilot_memberships(
        '[{"identityType":"personal_profile","userProfileId":"ae100000-0000-4000-8000-000000000002","accessLevel":"coordinator","active":true}]'::jsonb,
        v_revision,'ae200000-0000-4000-8000-000000000004');
      if (select count(*)<>1 from public.routine_pilot_memberships where organization_id='${ORGANIZATION_ID}' and active
          and user_profile_id='ae100000-0000-4000-8000-000000000002' and access_level='coordinator') then raise exception 'Phase 10AA Shift Lead coordinator acceptance failed.'; end if;
      v_revision:=(v_result->>'settingsRevision')::bigint;

      -- Event Floor Manager preview and participant are accepted, including exact replay.
      v_previous_revision:=v_revision;
      v_result:=public.replace_routine_pilot_memberships(
        '[{"identityType":"personal_profile","userProfileId":"ae100000-0000-4000-8000-000000000001","accessLevel":"preview","active":true}]'::jsonb,
        v_previous_revision,'ae200000-0000-4000-8000-000000000005');
      v_revision:=(v_result->>'settingsRevision')::bigint;
      if not coalesce((public.replace_routine_pilot_memberships(
        '[{"identityType":"personal_profile","userProfileId":"ae100000-0000-4000-8000-000000000001","accessLevel":"preview","active":true}]'::jsonb,
        v_previous_revision,'ae200000-0000-4000-8000-000000000005')->>'idempotentReplay')::boolean,false)
      then raise exception 'Phase 10AA exact idempotent replay failed.'; end if;
      v_result:=public.replace_routine_pilot_memberships(
        '[{"identityType":"personal_profile","userProfileId":"ae100000-0000-4000-8000-000000000001","accessLevel":"participant","active":true}]'::jsonb,
        v_revision,'ae200000-0000-4000-8000-000000000006');
      v_revision:=(v_result->>'settingsRevision')::bigint;
      if (select count(*)<>1 from public.routine_pilot_memberships membership
          join public.user_profiles profile on profile.id=membership.user_profile_id
          where membership.organization_id='${ORGANIZATION_ID}' and membership.active
            and membership.access_level='participant' and profile.role='event_floor_manager')
      then raise exception 'Phase 10AA Event Floor Manager participant acceptance failed.'; end if;

      -- Event Floor Manager can never coordinate.
      v_rejected:=false;
      begin
        perform public.replace_routine_pilot_memberships(
          '[{"identityType":"personal_profile","userProfileId":"ae100000-0000-4000-8000-000000000001","accessLevel":"coordinator","active":true}]'::jsonb,
          v_revision,'ae200000-0000-4000-8000-000000000007');
      exception when insufficient_privilege then v_rejected:=true; end;
      if not v_rejected then raise exception 'Phase 10AA Event Floor Manager coordinator rejection failed.'; end if;

      -- Manager, counter, shared-device, inactive, cross-organization, and unsupported profiles remain rejected.
      v_rejected:=false;
      begin perform public.replace_routine_pilot_memberships(
        '[{"identityType":"personal_profile","userProfileId":"${MANAGER_ID}","accessLevel":"preview","active":true}]'::jsonb,
        v_revision,'ae200000-0000-4000-8000-000000000008'); exception when insufficient_privilege then v_rejected:=true; end;
      if not v_rejected then raise exception 'Phase 10AA manager rejection failed.'; end if;
      v_rejected:=false;
      begin perform public.replace_routine_pilot_memberships(
        '[{"identityType":"personal_profile","userProfileId":"ae100000-0000-4000-8000-000000000003","accessLevel":"preview","active":true}]'::jsonb,
        v_revision,'ae200000-0000-4000-8000-000000000009'); exception when insufficient_privilege then v_rejected:=true; end;
      if not v_rejected then raise exception 'Phase 10AA counter rejection failed.'; end if;
      v_rejected:=false;
      begin perform public.replace_routine_pilot_memberships(
        '[{"identityType":"personal_profile","userProfileId":"${SHARED_DEVICE_ID}","accessLevel":"preview","active":true}]'::jsonb,
        v_revision,'ae200000-0000-4000-8000-000000000010'); exception when insufficient_privilege then v_rejected:=true; end;
      if not v_rejected then raise exception 'Phase 10AA shared profile rejection failed.'; end if;
      v_rejected:=false;
      begin perform public.replace_routine_pilot_memberships(
        '[{"identityType":"personal_profile","userProfileId":"ae100000-0000-4000-8000-000000000004","accessLevel":"preview","active":true}]'::jsonb,
        v_revision,'ae200000-0000-4000-8000-000000000011'); exception when insufficient_privilege then v_rejected:=true; end;
      if not v_rejected then raise exception 'Phase 10AA inactive profile rejection failed.'; end if;
      v_rejected:=false;
      begin perform public.replace_routine_pilot_memberships(
        '[{"identityType":"personal_profile","userProfileId":"ae100000-0000-4000-8000-000000000006","accessLevel":"preview","active":true}]'::jsonb,
        v_revision,'ae200000-0000-4000-8000-000000000012'); exception when insufficient_privilege then v_rejected:=true; end;
      if not v_rejected then raise exception 'Phase 10AA cross-organization profile rejection failed.'; end if;
      v_rejected:=false;
      begin perform public.replace_routine_pilot_memberships(
        '[{"identityType":"personal_profile","userProfileId":"ae100000-0000-4000-8000-000000000005","accessLevel":"preview","active":true}]'::jsonb,
        v_revision,'ae200000-0000-4000-8000-000000000013'); exception when insufficient_privilege then v_rejected:=true; end;
      if not v_rejected then raise exception 'Phase 10AA unsupported role rejection failed.'; end if;
      v_rejected:=false;
      begin perform public.replace_routine_pilot_memberships(
        '[{"identityType":"personal_profile","userProfileId":"ae100000-0000-4000-8000-000000000007","accessLevel":"preview","active":true}]'::jsonb,
        v_revision,'ae200000-0000-4000-8000-000000000016'); exception when insufficient_privilege then v_rejected:=true; end;
      if not v_rejected then raise exception 'Phase 10AA null-organization profile rejection failed.'; end if;

      -- Mixed valid/invalid replacement and stale revision both fail atomically.
      select coalesce(string_agg(to_jsonb(membership)::text,'' order by membership.id),'') into v_before_memberships
        from public.routine_pilot_memberships membership where organization_id='${ORGANIZATION_ID}';
      v_rejected:=false;
      begin perform public.replace_routine_pilot_memberships(
        '[{"identityType":"personal_profile","userProfileId":"ae100000-0000-4000-8000-000000000001","accessLevel":"participant","active":true},{"identityType":"personal_profile","userProfileId":"${MANAGER_ID}","accessLevel":"preview","active":true}]'::jsonb,
        v_revision,'ae200000-0000-4000-8000-000000000014'); exception when insufficient_privilege then v_rejected:=true; end;
      if not v_rejected then raise exception 'Phase 10AA mixed replacement rejection failed.'; end if;
      select coalesce(string_agg(to_jsonb(membership)::text,'' order by membership.id),'') into v_after_memberships
        from public.routine_pilot_memberships membership where organization_id='${ORGANIZATION_ID}';
      if v_after_memberships<>v_before_memberships or (select revision from public.routine_organization_settings where organization_id='${ORGANIZATION_ID}')<>v_revision
      then raise exception 'Phase 10AA rejected replacement was not atomic.'; end if;
      v_rejected:=false;
      begin perform public.replace_routine_pilot_memberships('[]'::jsonb,v_revision-1,'ae200000-0000-4000-8000-000000000015');
      exception when serialization_failure then v_rejected:=true; end;
      if not v_rejected or (select revision from public.routine_organization_settings where organization_id='${ORGANIZATION_ID}')<>v_revision
      then raise exception 'Phase 10AA settings revision safety failed.'; end if;
      if not exists(select 1 from public.routine_ui_operations where organization_id='${ORGANIZATION_ID}'
          and operation_type='replace_pilot_memberships' and request_hash~'^[0-9a-f]{64}$')
      then raise exception 'Phase 10AA immutable operation audit was not recorded.'; end if;
    end
    $phase10aa_test$;
    select 'phase10aa_eligibility_ok';
    rollback;
  `);
  check('10AA database matrix accepts Julie-equivalent preview/participant and preserves every denial and atomicity guard',
    result.stdout.includes('phase10aa_eligibility_ok'));
}

function phase10abAuthorizationChecks() {
  const preview = JSON.parse(scalar(managerSql(
    "select public.preview_mesh_routine_content_1_5r_activation_recovery()::text;",
  )).split("\n").at(-1));
  check("10AB personal manager can call the scoped preview and receives a deterministic organization state hash",
    preview.contractVersion === "phase10ab-v1"
      && /^[0-9a-f]{64}$/.test(preview.stateHash || "")
      && preview.valid === false
      && Array.isArray(preview.blockers));

  const rejectionCases = [
    { label: "staff", actor: STAFF_ID, setup: "" },
    { label: "shared device", actor: SHARED_DEVICE_ID, setup: "" },
    { label: "Event Floor Manager", actor: STAFF_ID, setup: `update public.user_profiles set role='event_floor_manager' where id='${STAFF_ID}';` },
    { label: "counter", actor: STAFF_ID, setup: `update public.user_profiles set role='counter' where id='${STAFF_ID}';` },
  ];
  for (const entry of rejectionCases) {
    const result = psql(String.raw`
      begin;
      ${entry.setup}
      select set_config('request.jwt.claim.sub','${entry.actor}',true);
      set local role authenticated;
      do $phase10ab_auth$
      declare v_preview_rejected boolean:=false; v_apply_rejected boolean:=false;
      begin
        begin perform public.preview_mesh_routine_content_1_5r_activation_recovery();
        exception when insufficient_privilege then v_preview_rejected:=true; end;
        begin perform public.apply_mesh_routine_content_1_5r_activation_recovery(
          repeat('0',64),'Authorization rejection probe only.','ab200000-0000-4000-8000-000000000001');
        exception when insufficient_privilege then v_apply_rejected:=true; end;
        if not v_preview_rejected or not v_apply_rejected then
          raise exception 'Phase 10AB accepted an unauthorized caller.';
        end if;
      end
      $phase10ab_auth$;
      select 'phase10ab_auth_rejected';
      rollback;
    `);
    check(`10AB rejects ${entry.label} from both preview and apply without mutation`,
      result.stdout.includes("phase10ab_auth_rejected"));
  }
}

function applySequence(sequenceNumber) {
  console.log(`Applying full Phase 10A-A1-L-P-Q-O-R-S-T-U-V-W-X-Y-Z-AA-AB-AC sequence ${sequenceNumber} as ${ROLE}`);
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
          state.length === Number(scalar("select count(*) from public.organizations;"))
            && scalar("select count(*)=count(distinct organization_id) from public.routine_organization_settings;") === "t");
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
    if (path.endsWith("phase10x_event_visual_library_expansion.sql")) {
      check(`sequence ${sequenceNumber}: 10X removes anonymous Event Ops RPC execution and preserves authenticated access`, scalar(String.raw`
        select (
          not has_function_privilege('anon','public.create_event_operation_from_calendar_event(uuid)','EXECUTE')
          and not has_function_privilege('anon','public.update_event_task_status(uuid,text,text,text,text)','EXECUTE')
          and has_function_privilege('authenticated','public.create_event_operation_from_calendar_event(uuid)','EXECUTE')
          and has_function_privilege('authenticated','public.update_event_task_status(uuid,text,text,text,text)','EXECUTE')
        )::text;
      `) === "true");
      check(`sequence ${sequenceNumber}: 10X fixes set_updated_at and leaves operative rows untouched`, scalar(String.raw`
        select
          coalesce(array_to_string(proconfig,','),'')='search_path=pg_catalog'
          and (select count(*) from public.routine_content_pack_installations)=0
          and (select count(*) from public.routine_templates)=0
          and (select count(*) from public.routine_runs)=0
          and (select count(*) from public.routine_bundles)=0
        from pg_proc where oid='public.set_updated_at()'::regprocedure;
      `) === "t" && JSON.stringify(settingsState()) === JSON.stringify(stateAfterK4));
    }
    if (path.endsWith("phase10y_mesh_routine_content_pack_1_5r.sql")) {
      check(`sequence ${sequenceNumber}: 10Y exposes the exact 1.5R provider`,
        scalar("select (public.routine_mesh_content_pack_v1()->>'packVersion')||':'||(public.routine_mesh_content_pack_v1()->>'packHash');")
          === `1.5R:${EXPECTED_FRIDGE_PACK_HASH}`);
      check(`sequence ${sequenceNumber}: 10Y keeps the provider private and installs no content`, scalar(String.raw`
        select
          not has_function_privilege('anon','public.routine_mesh_content_pack_v1()','EXECUTE')
          and not has_function_privilege('authenticated','public.routine_mesh_content_pack_v1()','EXECUTE')
          and (select count(*) from public.routine_content_pack_installations)=0
          and (select count(*) from public.routine_templates)=0
          and (select count(*) from public.routine_runs)=0
          and (select count(*) from public.routine_bundles)=0;
      `) === "t" && JSON.stringify(settingsState()) === JSON.stringify(stateAfterK4));
    }
    if (path.endsWith("phase10z_inventory_location_and_express_shelf_alignment.sql")) {
      check(`sequence ${sequenceNumber}: 10Z installs guarded inventory attention functions`, scalar(String.raw`
        select
          to_regprocedure('public.report_inventory_counter_unlisted_wine(uuid,text,text,bigint,timestamp with time zone)') is not null
          and to_regprocedure('public.resolve_inventory_unlisted_wine_attention(uuid,uuid,text,bigint,timestamp with time zone)') is not null
          and has_function_privilege('authenticated','public.report_inventory_counter_unlisted_wine(uuid,text,text,bigint,timestamp with time zone)','EXECUTE')
          and has_function_privilege('authenticated','public.resolve_inventory_unlisted_wine_attention(uuid,uuid,text,bigint,timestamp with time zone)','EXECUTE')
          and not has_function_privilege('anon','public.report_inventory_counter_unlisted_wine(uuid,text,text,bigint,timestamp with time zone)','EXECUTE');
      `) === "t");
      check(`sequence ${sequenceNumber}: generic organizations do not opt into production-shaped location changes`, scalar(String.raw`
        select count(*)=0 from public.inventory_locations
        where code in('WORKBAR_MILK_FRIDGE','MAIN_STORAGE_EXPRESS_SHELF');
      `) === "t");
      check(`sequence ${sequenceNumber}: 10Z installs no content or operational runs`, scalar(String.raw`
        select (select count(*) from public.routine_content_pack_installations)=0
          and (select count(*) from public.routine_templates)=0
          and (select count(*) from public.routine_runs)=0
          and (select count(*) from public.routine_bundles)=0;
      `) === "t" && JSON.stringify(settingsState()) === JSON.stringify(stateAfterK4));
    }
    if (path.endsWith("phase10aa_event_floor_manager_pilot_membership.sql")) {
      const definition = scalar(String.raw`
        select pg_get_functiondef('public.replace_routine_pilot_memberships(jsonb,bigint,uuid)'::regprocedure);
      `);
      check(`sequence ${sequenceNumber}: 10AA installs only the three-role personal pilot allowlist`,
        /profile\.role in\s*\('shift_lead','staff','event_floor_manager'\)/.test(definition)
          && /v_access='coordinator' and v_profile\.role<>'shift_lead'/.test(definition));
      check(`sequence ${sequenceNumber}: 10AA preserves the hardened authenticated-only RPC boundary`, scalar(String.raw`
        select
          has_function_privilege('authenticated','public.replace_routine_pilot_memberships(jsonb,bigint,uuid)','EXECUTE')
          and not has_function_privilege('anon','public.replace_routine_pilot_memberships(jsonb,bigint,uuid)','EXECUTE')
          and coalesce(array_to_string(proconfig,','),'')='search_path=pg_catalog'
        from pg_proc where oid='public.replace_routine_pilot_memberships(jsonb,bigint,uuid)'::regprocedure;
      `) === "t");
      if (sequenceNumber === 1) phase10aaEligibilityChecks();
      check(`sequence ${sequenceNumber}: 10AA migration itself changes no content, settings, memberships, or operative rows`,
        JSON.stringify(settingsState()) === JSON.stringify(stateAfterK4)
          && scalar(String.raw`
            select (select count(*) from public.routine_pilot_memberships)=0
              and (select count(*) from public.routine_content_pack_installations)=0
              and (select count(*) from public.routine_templates)=0
              and (select count(*) from public.routine_runs)=0
              and (select count(*) from public.routine_bundles)=0;
          `) === "t");
    }
    if (path.endsWith("phase10ab_mesh_routine_content_1_5r_activation_recovery.sql")) {
      check(`sequence ${sequenceNumber}: 10AB installs the exact two fixed-search-path manager entry points`, scalar(String.raw`
        select
          to_regprocedure('public.preview_mesh_routine_content_1_5r_activation_recovery()') is not null
          and to_regprocedure('public.apply_mesh_routine_content_1_5r_activation_recovery(text,text,uuid)') is not null
          and has_function_privilege('authenticated','public.preview_mesh_routine_content_1_5r_activation_recovery()','EXECUTE')
          and has_function_privilege('authenticated','public.apply_mesh_routine_content_1_5r_activation_recovery(text,text,uuid)','EXECUTE')
          and not has_function_privilege('anon','public.preview_mesh_routine_content_1_5r_activation_recovery()','EXECUTE')
          and not has_function_privilege('anon','public.apply_mesh_routine_content_1_5r_activation_recovery(text,text,uuid)','EXECUTE')
          and (select coalesce(array_to_string(proconfig,','),'')='search_path=pg_catalog' from pg_proc where oid='public.preview_mesh_routine_content_1_5r_activation_recovery()'::regprocedure)
          and (select coalesce(array_to_string(proconfig,','),'')='search_path=pg_catalog' from pg_proc where oid='public.apply_mesh_routine_content_1_5r_activation_recovery(text,text,uuid)'::regprocedure);
      `) === "t");
      check(`sequence ${sequenceNumber}: 10AB migration itself changes no content settings memberships inventory or operative rows`,
        JSON.stringify(settingsState()) === JSON.stringify(stateAfterK4)
          && scalar(String.raw`
            select (select count(*) from public.routine_pilot_memberships)=0
              and (select count(*) from public.routine_content_pack_installations)=0
              and (select count(*) from public.routine_templates)=0
              and (select count(*) from public.routine_runs)=0
              and (select count(*) from public.routine_bundles)=0;
          `) === "t");
      if (sequenceNumber === 1) phase10abAuthorizationChecks();
    }
    if (path.endsWith("phase10ac_routine_provider_vocabulary_alignment.sql")) {
      check(`sequence ${sequenceNumber}: 10AC installs both exact validated provider vocabularies`, scalar(String.raw`
        select
          (select pg_get_constraintdef(oid,true) = 'CHECK (location_type = ANY (ARRAY[''zone''::text, ''room''::text, ''station''::text, ''storage''::text, ''storage_zone''::text, ''shelf''::text, ''fridge''::text, ''toilet''::text, ''door''::text, ''equipment''::text, ''collection_point''::text, ''other''::text]))'
             and convalidated
           from pg_constraint where conrelid='public.routine_locations'::regclass
             and conname='routine_locations_type_check')
          and
          (select pg_get_constraintdef(oid,true) = 'CHECK (source_kind = ANY (ARRAY[''manual''::text, ''inventory_readonly''::text, ''asset_registry_readonly''::text, ''location_set''::text, ''location_standards''::text]))'
             and convalidated
           from pg_constraint where conrelid='public.routine_standards'::regclass
             and conname='routine_standards_source_kind_check');
      `) === "t");
      check(`sequence ${sequenceNumber}: 10AC migration itself changes no content settings memberships inventory or operative rows`,
        JSON.stringify(settingsState()) === JSON.stringify(stateAfterK4)
          && scalar(String.raw`
            select (select count(*) from public.routine_pilot_memberships)=0
              and (select count(*) from public.routine_content_pack_installations)=0
              and (select count(*) from public.routine_templates)=0
              and (select count(*) from public.routine_runs)=0
              and (select count(*) from public.routine_bundles)=0;
          `) === "t");
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
    scalar(String.raw`
      select
        (select count(*) from public.routine_content_pack_installations where organization_id='${FUTURE_ORGANIZATION_ID}')=0
        and (select count(*) from public.routine_templates where organization_id='${FUTURE_ORGANIZATION_ID}')=0
        and (select count(*) from public.routine_runs where organization_id='${FUTURE_ORGANIZATION_ID}')=0
        and (select count(*) from public.routine_bundles where organization_id='${FUTURE_ORGANIZATION_ID}')=0
        and (select count(*) from public.routine_delivery_records where organization_id='${FUTURE_ORGANIZATION_ID}')=0
        and (select count(*) from public.routine_operators where organization_id='${FUTURE_ORGANIZATION_ID}')=0
        and (select count(*) from public.routine_operator_sessions where organization_id='${FUTURE_ORGANIZATION_ID}')=0;
    `) === "t");
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

function productionShapedActivationRecoveryChecks() {
  const historicalProvider = readFileSync(absolute("supabase/phase10s_mesh_routine_content_pack_1_4r.sql"), "utf8");
  const targetProvider = readFileSync(absolute("supabase/phase10y_mesh_routine_content_pack_1_5r.sql"), "utf8");
  const targetPack = JSON.parse(readFileSync(
    absolute("content/routine-engine/mesh-routine-content-v1-5r.json"), "utf8",
  ));
  const productionResourceIds = JSON.parse(readFileSync(
    absolute("scripts/fixtures/phase10ab-production-resource-ids.json"), "utf8",
  ));
  const productionTaskMetadata = JSON.parse(readFileSync(
    absolute("scripts/fixtures/phase10ab-production-task-metadata.json"), "utf8",
  ));
  const productionTaskMetadataSql = JSON.stringify(productionTaskMetadata).replaceAll("'", "''");
  const expectedOpeningDraft = "73896e75-1509-4215-ac4a-a36b033e6d18";
  const expectedClosingDraft = "072fee93-eda7-406c-87b3-d5186cd26944";
  const expectedOpeningTemplate = "20377d92-bf85-4fb6-a4c9-5db847fd5f57";
  const expectedClosingTemplate = "ede9b1ca-44b6-489e-97ea-3abab57ab6a1";
  const expectedInstallation = "c5e43e3a-f9af-4565-98ab-7465d76593c3";
  const expectedOpeningHash = "a3d2038b7bc0d3b3e75baee5ce63a1c0ffeea8c4b13331c88ea474e10a4f2e4a";
  const expectedClosingHash = "04124b4ab3ddc94e384012e85201cf271efd335187e75f3dd1475fb81aa50d98";
  check("production-shaped task metadata fixture contains only the 15 incremental-history exceptions",
    Object.keys(productionTaskMetadata).sort().join(",")
      === "C03,C06,C14,C15,C17,C27,O02,O15,O22,O23,O28,O29,O34,O35,O37"
      && Object.entries(productionTaskMetadata).every(([taskKey, metadata]) =>
        metadata?.authoritativeSourceId === taskKey
          && metadata?.packHash === "c149a8416a867dcb7d87224f3ae8e2a214e5ca4954613b118521ebe5ae3aff2a"));

  psql(String.raw`
    insert into auth.users(id) values('${ACTIVATION_MANAGER_ID}');
    insert into public.organizations(id,name,slug)
    values('${ACTIVATION_ORGANIZATION_ID}','Phase 10AB production-shape rehearsal','phase10ab-production-shape-rehearsal');
    insert into public.user_profiles(id,organization_id,display_name,role,active,is_shared_device)
    values('${ACTIVATION_MANAGER_ID}','${ACTIVATION_ORGANIZATION_ID}','Bobby rehearsal manager','manager',true,false);
    insert into public.routine_organization_settings(
      organization_id,mode,timezone,operational_day_cutoff,shared_device_enabled,reopen_window_hours,
      ui_release_stage,ui_contract_version,revision,created_by_auth_user_id,updated_by_auth_user_id
    ) values(
      '${ACTIVATION_ORGANIZATION_ID}','legacy','Europe/Oslo','04:00',false,24,
      'staff_preview','phase10k4-v1',1,'${ACTIVATION_MANAGER_ID}','${ACTIVATION_MANAGER_ID}'
    );
  `, { transaction: true });

  // Build the historical reviewed drafts through the real canonical 1.4R
  // provider and the real installer, then restore the terminal 1.5R provider.
  psql(historicalProvider);
  const historicalAnalysis = actorJson(
    ACTIVATION_MANAGER_ID,
    "public.preview_mesh_routine_content_pack_v1()",
  );
  check("production-shaped 10AB fixture starts with a valid real 1.4R installer preview",
    historicalAnalysis.valid === true
      && historicalAnalysis.packMetadata?.packVersion === "1.4R"
      && historicalAnalysis.conflicts?.length === 0);
  const historicalInstall = actorJson(
    ACTIVATION_MANAGER_ID,
    `public.install_mesh_routine_content_pack_v1('${historicalAnalysis.organizationStateHash}',`+
      `'Disposable production-shape historical draft installation.','ae300000-0000-4000-8000-000000000001')`,
  );
  check("production-shaped fixture uses the real installer for the canonical 1.4R drafts",
    historicalInstall.installStatus === "installed"
      && historicalInstall.packHash === EXPECTED_PACK_HASH
      && historicalInstall.published === false
      && historicalInstall.runsCreated === false);

  const ids = {
    installation: scalar(`select id from public.routine_content_pack_installations where organization_id='${ACTIVATION_ORGANIZATION_ID}' and pack_version='1.4R';`),
    openingTemplate: scalar(`select id from public.routine_templates where organization_id='${ACTIVATION_ORGANIZATION_ID}' and routine_key='opening';`),
    closingTemplate: scalar(`select id from public.routine_templates where organization_id='${ACTIVATION_ORGANIZATION_ID}' and routine_key='closing';`),
    openingDraft: scalar(`select version.id from public.routine_template_versions version join public.routine_templates template on template.id=version.template_id where version.organization_id='${ACTIVATION_ORGANIZATION_ID}' and template.routine_key='opening' and version.state='draft';`),
    closingDraft: scalar(`select version.id from public.routine_template_versions version join public.routine_templates template on template.id=version.template_id where version.organization_id='${ACTIVATION_ORGANIZATION_ID}' and template.routine_key='closing' and version.state='draft';`),
    location: scalar(`select id from public.routine_locations where organization_id='${ACTIVATION_ORGANIZATION_ID}' and location_key='workbar-non-alcoholic-fridge';`),
    locationSet: scalar(`select id from public.routine_location_sets where organization_id='${ACTIVATION_ORGANIZATION_ID}' and set_key='serviceware-recovery-route';`),
  };
  const standardTargets = [
    ["workbar-milk-fridge-target", "de6530b6-b5f3-44d5-b7e7-f1bfea37430d", "2ffe2d30-f444-4449-bc64-0ce85728c92c"],
    ["workbar-coffee-canister-assigned-target", "badc7c4d-8162-4d48-a4be-31e9ef65d36f", "17d4f2d1-7660-4c1c-9997-465a9e07ef30"],
    ["serviceware-office-recovery-route-confirmation", "34f83f63-279c-4294-b381-1417ce446692", "efda6906-6689-4d87-9b54-f6866d589745"],
    ["fridge-closing-rules", "722ab761-19f0-4a36-ac2b-09c0f844c4f4", "d74b6594-866e-4986-8548-2c07c75b76dc"],
    ["cornerbar-operating-standard", "693d07e5-dcd2-4c70-bbc5-54d13b6e83ed", "54cd9dfe-828b-4f72-95c0-3173cd9e38e2"],
  ];
  const remaps = [
    [ids.installation, expectedInstallation],
    [ids.openingTemplate, expectedOpeningTemplate],
    [ids.closingTemplate, expectedClosingTemplate],
    [ids.openingDraft, expectedOpeningDraft],
    [ids.closingDraft, expectedClosingDraft],
  ];
  for (const [fixtureKey, table, keyColumn] of [
    ["locations", "routine_locations", "location_key"],
    ["locationSets", "routine_location_sets", "set_key"],
    ["standards", "routine_standards", "standard_key"],
    ["references", "routine_reference_images", "reference_key"],
  ]) {
    for (const [stableKey, targetId] of Object.entries(productionResourceIds[fixtureKey])) {
      const oldId = scalar(`select id from public.${table} where organization_id='${ACTIVATION_ORGANIZATION_ID}' and ${keyColumn}='${stableKey}';`);
      remaps.push([oldId, targetId]);
    }
  }
  for (const [standardKey, standardId, revisionId] of standardTargets) {
    const oldStandardId = scalar(`select id from public.routine_standards where organization_id='${ACTIVATION_ORGANIZATION_ID}' and standard_key='${standardKey}';`);
    const oldRevisionId = scalar(`select current_revision_id from public.routine_standards where id='${oldStandardId}';`);
    check(`production-shaped fixture pins the reviewed ${standardKey} identity`,
      productionResourceIds.standards[standardKey] === standardId);
    remaps.push([oldRevisionId, revisionId]);
  }
  check("production-shaped fixture resolves every historical resource identity before remapping",
    remaps.every(([from, to]) => /^[0-9a-f-]{36}$/.test(from) && /^[0-9a-f-]{36}$/.test(to)));

  const remapCalls = remaps.map(([from, to]) => `perform pg_temp.phase10ab_remap_uuid('${from}','${to}');`).join("\n");
  psql(String.raw`
    set session_replication_role=replica;
    create or replace function pg_temp.phase10ab_remap_uuid(input_old uuid,input_new uuid)
    returns void language plpgsql as $remap$
    declare target record;
    begin
      for target in
        select namespace.nspname schema_name,relation.relname table_name,attribute.attname column_name
        from pg_catalog.pg_attribute attribute
        join pg_catalog.pg_class relation on relation.oid=attribute.attrelid and relation.relkind in('r','p')
        join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
        where namespace.nspname='public' and attribute.atttypid='uuid'::regtype
          and attribute.attnum>0 and not attribute.attisdropped and attribute.attgenerated=''
        order by relation.oid,attribute.attnum
      loop
        execute format('update %I.%I set %I=$1 where %I=$2',
          target.schema_name,target.table_name,target.column_name,target.column_name)
          using input_new,input_old;
      end loop;
    end;
    $remap$;
    do $shape$ begin
      ${remapCalls}
    end $shape$;

    update public.routine_content_pack_installations
    set pack_version='1.1R',pack_hash='c149a8416a867dcb7d87224f3ae8e2a214e5ca4954613b118521ebe5ae3aff2a'
    where id='${expectedInstallation}';
    update public.routine_content_pack_operations
    set pack_version='1.1R'
    where organization_id='${ACTIVATION_ORGANIZATION_ID}' and pack_version='1.4R';
    update public.routine_organization_settings
    set mode='shadow',revision=4
    where organization_id='${ACTIVATION_ORGANIZATION_ID}';
    update public.routine_template_versions
    set revision=case id when '${expectedOpeningDraft}' then 18 when '${expectedClosingDraft}' then 25 else revision end
    where id in('${expectedOpeningDraft}','${expectedClosingDraft}');
    update public.routine_template_tasks
    set metadata=jsonb_set(metadata,'{packHash}',to_jsonb('c149a8416a867dcb7d87224f3ae8e2a214e5ca4954613b118521ebe5ae3aff2a'::text))
    where organization_id='${ACTIVATION_ORGANIZATION_ID}';
    with expected as (
      select key task_key,value metadata
      from jsonb_each('${productionTaskMetadataSql}'::jsonb)
    )
    update public.routine_template_tasks task
    set metadata=expected.metadata
    from expected
    where task.organization_id='${ACTIVATION_ORGANIZATION_ID}'
      and task.metadata->>'authoritativeSourceId'=expected.task_key;
    update public.routine_locations
    set name='Workbar Non-Alcoholic Fridge',location_type='fridge',parent_location_id=null,
        sort_order=22,metadata='{}',active=true,revision=1
    where id='5d279ff8-6e6c-4e2a-bde1-a27cd8763841';
    update public.routine_location_sets set revision=2
    where id='c49581b2-e52b-4873-96b9-3579a5b85d96';
    update public.routine_location_set_members set metadata='{"managerIncomplete":true}'
    where location_set_id='c49581b2-e52b-4873-96b9-3579a5b85d96';

    update public.routine_standards set revision=2 where id in(
      'de6530b6-b5f3-44d5-b7e7-f1bfea37430d','badc7c4d-8162-4d48-a4be-31e9ef65d36f',
      '34f83f63-279c-4294-b381-1417ce446692','722ab761-19f0-4a36-ac2b-09c0f844c4f4',
      '693d07e5-dcd2-4c70-bbc5-54d13b6e83ed');
    update public.routine_standards set label='Workbar Milk Fridge target',description=null
      where id='de6530b6-b5f3-44d5-b7e7-f1bfea37430d';
    update public.routine_standards set label='Workbar-assigned Coffee Canister target',description=null
      where id='badc7c4d-8162-4d48-a4be-31e9ef65d36f';
    update public.routine_standards set description='Unresolved publication and readiness blocker.'
      where id='34f83f63-279c-4294-b381-1417ce446692';
    update public.routine_standard_revisions
      set value_json='{"regularMilk":2,"oatly":2}',
          reason='Approved Mesh operational standards amendment 2026-08-07.',
          content_hash='c9ec8c4d490b279d812712dda7e26ed3'
      where id='2ffe2d30-f444-4449-bc64-0ce85728c92c';
    update public.routine_standard_revisions set content_hash='aae7cc7b83392283824d575e06c2e98e'
      where id='17d4f2d1-7660-4c1c-9997-465a9e07ef30';
    update public.routine_standard_revisions set content_hash='78cfae7e1361fc4a2b2cdc007b3b78d7'
      where id='efda6906-6689-4d87-9b54-f6866d589745';
    update public.routine_standard_revisions
      set value_json='null'::jsonb,reason='Approved Mesh operational standards amendment 2026-08-07.',
          content_hash='8870646d91877d166b32870a1680729d'
      where id='d74b6594-866e-4986-8548-2c07c75b76dc';
    update public.routine_standard_revisions
      set value_json='null'::jsonb,reason='Approved Mesh operational standards amendment 2026-08-07.',
          content_hash='a7c6498e222fe8acf02a361d7ac385ad'
      where id='54cd9dfe-828b-4f72-95c0-3173cd9e38e2';
    set session_replication_role=origin;
  `, { transaction: true });

  check("production-shaped fixture reproduces all 15 exact incremental task metadata objects",
    scalar(String.raw`
      with expected as (
        select key task_key,value metadata
        from jsonb_each('${productionTaskMetadataSql}'::jsonb)
      )
      select count(*) from public.routine_template_tasks task join expected
        on task.metadata->>'authoritativeSourceId'=expected.task_key
       and task.metadata=expected.metadata
      where task.organization_id='${ACTIVATION_ORGANIZATION_ID}';
    `) === "15");

  const shapedDraftHashes = JSON.parse(scalar(String.raw`
    select jsonb_object_agg(template.routine_key,jsonb_build_object(
      'content',public.routine_template_version_content_hash(version.id),
      'sections',encode(extensions.digest(convert_to((public.routine_template_version_canonical_json(version.id)->'sections')::text,'UTF8'),'sha256'),'hex'),
      'tasks',encode(extensions.digest(convert_to((public.routine_template_version_canonical_json(version.id)->'tasks')::text,'UTF8'),'sha256'),'hex'),
      'items',encode(extensions.digest(convert_to((public.routine_template_version_canonical_json(version.id)->'taskItems')::text,'UTF8'),'sha256'),'hex'),
      'dependencies',encode(extensions.digest(convert_to((public.routine_template_version_canonical_json(version.id)->'dependencies')::text,'UTF8'),'sha256'),'hex'),
      'relations',encode(extensions.digest(convert_to((public.routine_template_version_canonical_json(version.id)->'relations')::text,'UTF8'),'sha256'),'hex'),
      'references',encode(extensions.digest(convert_to((public.routine_template_version_canonical_json(version.id)->'referenceImages')::text,'UTF8'),'sha256'),'hex')
    ))::text
    from public.routine_template_versions version join public.routine_templates template on template.id=version.template_id
    where version.id in('${expectedOpeningDraft}','${expectedClosingDraft}');
  `));
  check("production-shaped historical drafts retain their exact reviewed semantic hashes after identity shaping",
    shapedDraftHashes.opening.content === expectedOpeningHash
      && shapedDraftHashes.closing.content === expectedClosingHash);
  psql(targetProvider);
  check("production-shaped fixture restores the exact terminal 1.5R provider before recovery",
    scalar("select (public.routine_mesh_content_pack_v1()->>'packVersion')||':'||(public.routine_mesh_content_pack_v1()->>'packHash');")
      === `1.5R:${EXPECTED_FRIDGE_PACK_HASH}`);

  const preview = actorJson(ACTIVATION_MANAGER_ID, "public.preview_mesh_routine_content_1_5r_activation_recovery()");
  if (!preview.valid) console.log(`PHASE10AB_REHEARSAL_PREVIEW|${OWNER_CONTEXT}|${JSON.stringify(preview)}`);
  check("production-shaped Phase 10AB preview is green after Phase 10AC",
    preview.valid === true
      && preview.operationAlreadyComplete === false
      && preview.resourceDifferences?.length === 7
      && preview.resourceDifferences.every((entry) => entry.status === "baseline")
      && Object.values(preview.counts ?? {}).every((count) => count === 0));
  check("production-shaped preview pins exact preserved drafts, provider, settings, and zero operative state",
    preview.provider?.packHash === EXPECTED_FRIDGE_PACK_HASH
      && preview.settings?.mode === "shadow"
      && preview.settings?.stage === "staff_preview"
      && preview.settings?.revision === 4
      && preview.settings?.sharedDeviceEnabled === false
      && preview.preservedDraftEvidence?.opening?.draftId === expectedOpeningDraft
      && preview.preservedDraftEvidence?.opening?.contentHash === expectedOpeningHash
      && preview.preservedDraftEvidence?.closing?.draftId === expectedClosingDraft
      && preview.preservedDraftEvidence?.closing?.contentHash === expectedClosingHash);

  const note = "Phase 10AC disposable exact production-shaped activation recovery rehearsal.";
  const beforeInjectedFailure = existingObjectSnapshot();
  psql(String.raw`
    create or replace function public.phase10ac_injected_post_install_failure()
    returns trigger language plpgsql set search_path=pg_catalog as $failure$
    begin
      if new.organization_id='${ACTIVATION_ORGANIZATION_ID}' and new.pack_version='1.5R' then
        raise exception 'Injected Phase 10AC post-install rollback probe.';
      end if;
      return new;
    end;
    $failure$;
    create trigger phase10ac_injected_post_install_failure
    after insert on public.routine_content_pack_installations
    for each row execute function public.phase10ac_injected_post_install_failure();
  `, { transaction: true });
  const injectedApply = psql(actorSql(ACTIVATION_MANAGER_ID,
    `select public.apply_mesh_routine_content_1_5r_activation_recovery(`+
      `'${preview.stateHash}','${note} rollback probe','ae200000-0000-4000-8000-000000000002');`),
  { allowFailure: true });
  psql(String.raw`
    drop trigger phase10ac_injected_post_install_failure on public.routine_content_pack_installations;
    drop function public.phase10ac_injected_post_install_failure();
  `, { transaction: true });
  check("injected post-install failure aborts the real Phase 10AB apply",
    injectedApply.status !== 0 && /Injected Phase 10AC post-install rollback probe/i.test(injectedApply.stderr));
  check("injected post-install failure rolls back resource alignment, draft replacement, installation, and operation atomically",
    existingObjectSnapshot() === beforeInjectedFailure);

  const applyExpression = `public.apply_mesh_routine_content_1_5r_activation_recovery(`+
    `'${preview.stateHash}','${note}','${ACTIVATION_RECOVERY_KEY}')`;
  const applied = actorJson(ACTIVATION_MANAGER_ID, applyExpression);
  check("real Phase 10AB apply succeeds after Phase 10AC with authoritative completion readback",
    applied.valid === true
      && applied.operationAlreadyComplete === true
      && applied.idempotentReplay === false
      && applied.installResult?.packHash === EXPECTED_FRIDGE_PACK_HASH
      && applied.installResult?.published === false
      && applied.installResult?.runsCreated === false);
  check("real recovery aligns seven resources and creates all four exact Main Storage location types",
    applied.resourceDifferences?.length === 7
      && applied.resourceDifferences.every((entry) => entry.status === "target")
      && scalar(String.raw`
        select count(*)=4
          and count(*) filter(where location_key='main-storage-fridge' and location_type='storage')=1
          and count(*) filter(where location_key='main-storage-left-reserve' and location_type='storage_zone')=1
          and count(*) filter(where location_key='main-storage-express-shelf' and location_type='shelf')=1
          and count(*) filter(where location_key='main-storage-keg-storage' and location_type='storage_zone')=1
        from public.routine_locations where organization_id='${ACTIVATION_ORGANIZATION_ID}'
          and location_key like 'main-storage-%';
      `) === "t");
  const foundationWorkspace = actorJson(
    ACTIVATION_MANAGER_ID,
    "public.get_routine_foundation_editor_workspace()",
  );
  const locationStandard = foundationWorkspace.standards.find(
    (standard) => standard.stableKey === "main-storage-express-shelf-refill",
  );
  const providerLocationStandard = targetPack.standards.find(
    (standard) => standard.key === "main-storage-express-shelf-refill",
  );
  check("real installer creates the exact provider location_standards standard with system/read-only manager readback",
    locationStandard?.sourceKind === "location_standards"
      && locationStandard?.externalReadonly === true
      && locationStandard?.currentRevisionId
      && canonicalJson(locationStandard.revisions?.[0]?.value) === canonicalJson(providerLocationStandard?.currentRevision?.value));

  const openingWorkspace = actorJson(
    ACTIVATION_MANAGER_ID,
    `public.get_routine_template_editor_workspace('${expectedOpeningTemplate}')`,
  );
  const closingWorkspace = actorJson(
    ACTIVATION_MANAGER_ID,
    `public.get_routine_template_editor_workspace('${expectedClosingTemplate}')`,
  );
  const workspaceDependencies = [...openingWorkspace.dependencies, ...closingWorkspace.dependencies];
  const taskKeysById = new Map([...openingWorkspace.tasks, ...closingWorkspace.tasks]
    .map((taskRow) => [taskRow.id, taskRow.metadata?.authoritativeSourceId]));
  const automaticDependencyPairs = workspaceDependencies
    .filter((dependency) => dependency.dependency_type === "complete_predecessor_on_successor")
    .map((dependency) => `${taskKeysById.get(dependency.predecessor_task_id)}>${taskKeysById.get(dependency.successor_task_id)}`)
    .sort();
  check("real installer persists the exact 38/3 dependency distribution and manager workspace values",
    workspaceDependencies.filter((dependency) => dependency.dependency_type === "must_complete").length === 38
      && workspaceDependencies.filter((dependency) => dependency.dependency_type === "complete_predecessor_on_successor").length === 3
      && workspaceDependencies.length === 41
      && JSON.stringify(automaticDependencyPairs) === JSON.stringify(["C05>C15", "O27>O29", "O33>O35"]));
  const publicationValidation = actorJson(
    ACTIVATION_MANAGER_ID,
    `public.validate_routine_template_version(`+
      `'${applied.newDrafts.opening.id}',array['${applied.newDrafts.opening.id}'::uuid,'${applied.newDrafts.closing.id}'::uuid])`,
  );
  check("all three provider dependencies pass authoritative publication validation without coercion",
    publicationValidation.valid === true
      && publicationValidation.blockers?.length === 0
      && publicationValidation.computed_content_hash?.length === 64);
  check("real recovery preserves immutable old drafts and installs exact fresh 1.5R draft counts",
    applied.preservedDrafts?.opening?.id === expectedOpeningDraft
      && applied.preservedDrafts?.opening?.contentHash === expectedOpeningHash
      && applied.preservedDrafts?.closing?.id === expectedClosingDraft
      && applied.preservedDrafts?.closing?.contentHash === expectedClosingHash
      && applied.installResult?.installedResourceSummary?.openingSections === 3
      && applied.installResult?.installedResourceSummary?.openingTasks === 37
      && applied.installResult?.installedResourceSummary?.closingSections === 2
      && applied.installResult?.installedResourceSummary?.closingTasks === 46
      && applied.newDrafts?.opening?.id !== expectedOpeningDraft
      && applied.newDrafts?.closing?.id !== expectedClosingDraft
      && scalar(`select count(*)=2 and bool_and(state='discarded' and discarded_at is not null) from public.routine_template_versions where id in('${expectedOpeningDraft}','${expectedClosingDraft}');`) === "t");
  check("discarded Opening and Closing preserve every exact historical child count",
    scalar(String.raw`
      select
        jsonb_array_length(public.routine_template_version_canonical_json('${expectedOpeningDraft}')->'sections')=3
        and jsonb_array_length(public.routine_template_version_canonical_json('${expectedOpeningDraft}')->'tasks')=37
        and jsonb_array_length(public.routine_template_version_canonical_json('${expectedOpeningDraft}')->'taskItems')=239
        and jsonb_array_length(public.routine_template_version_canonical_json('${expectedOpeningDraft}')->'dependencies')=9
        and jsonb_array_length(public.routine_template_version_canonical_json('${expectedOpeningDraft}')->'relations')=12
        and jsonb_array_length(public.routine_template_version_canonical_json('${expectedOpeningDraft}')->'referenceImages')=30
        and jsonb_array_length(public.routine_template_version_canonical_json('${expectedClosingDraft}')->'sections')=2
        and jsonb_array_length(public.routine_template_version_canonical_json('${expectedClosingDraft}')->'tasks')=46
        and jsonb_array_length(public.routine_template_version_canonical_json('${expectedClosingDraft}')->'taskItems')=358
        and jsonb_array_length(public.routine_template_version_canonical_json('${expectedClosingDraft}')->'dependencies')=32
        and jsonb_array_length(public.routine_template_version_canonical_json('${expectedClosingDraft}')->'relations')=6
        and jsonb_array_length(public.routine_template_version_canonical_json('${expectedClosingDraft}')->'referenceImages')=58;
    `) === "t");
  check("real recovery creates exactly one 1.5R installation and no publication, membership, E2E, work, mode/stage, or Stock Count side effect",
    scalar(String.raw`
      select
        (select count(*) from public.routine_content_pack_installations where organization_id='${ACTIVATION_ORGANIZATION_ID}' and pack_version='1.5R' and pack_hash='${EXPECTED_FRIDGE_PACK_HASH}')=1
        and (select count(*) from public.routine_template_versions where organization_id='${ACTIVATION_ORGANIZATION_ID}' and state='published')=0
        and (select count(*) from public.routine_pilot_memberships where organization_id='${ACTIVATION_ORGANIZATION_ID}')=0
        and (select count(*) from public.routine_e2e_verification_attestations where organization_id='${ACTIVATION_ORGANIZATION_ID}')=0
        and (select count(*) from public.routine_runs where organization_id='${ACTIVATION_ORGANIZATION_ID}')=0
        and (select count(*) from public.routine_bundles where organization_id='${ACTIVATION_ORGANIZATION_ID}')=0
        and (select count(*) from public.inventory_count_sessions where organization_id='${ACTIVATION_ORGANIZATION_ID}')=0
        and (select mode='shadow' and ui_release_stage='staff_preview' and revision=4 and not shared_device_enabled from public.routine_organization_settings where organization_id='${ACTIVATION_ORGANIZATION_ID}');
    `) === "t");

  const replay = actorJson(ACTIVATION_MANAGER_ID, applyExpression);
  check("Phase 10AB exact request replay is idempotent and returns the original operation",
    replay.idempotentReplay === true && replay.operationId === applied.operationId
      && scalar(`select count(*) from public.routine_ui_operations where organization_id='${ACTIVATION_ORGANIZATION_ID}' and operation_type='activate_mesh_content_1_5r_recovery';`) === "1");
  const completedPreview = actorJson(ACTIVATION_MANAGER_ID, "public.preview_mesh_routine_content_1_5r_activation_recovery()");
  check("completed recovery preview reports operationAlreadyComplete without another write",
    completedPreview.valid === true && completedPreview.operationAlreadyComplete === true);
  const changedRequest = psql(actorSql(ACTIVATION_MANAGER_ID,
    `select public.apply_mesh_routine_content_1_5r_activation_recovery('${preview.stateHash}','${note} changed','${ACTIVATION_RECOVERY_KEY}');`),
  { allowFailure: true });
  check("Phase 10AB same-key/different-request replay is rejected without a second operation",
    changedRequest.status !== 0
      && /different (?:UI )?request/i.test(changedRequest.stderr)
      && scalar(`select count(*) from public.routine_ui_operations where organization_id='${ACTIVATION_ORGANIZATION_ID}' and operation_type='activate_mesh_content_1_5r_recovery';`) === "1");
}

function productionShapedLocationAlignmentChecks() {
  const organizationId = "fa000000-0000-4000-8000-000000000001";
  const actorId = "fa100000-0000-4000-8000-000000000001";
  const mainStorageId = "bcdbe191-e65a-4134-be3b-349ef73c6963";
  const milkFridgeCode = "WORKBAR_MILK_FRIDGE";
  const planetaId = "73054357-e1af-423b-bf8a-1c32968275f5";
  const expectedProductIds = [
    "6bc1e704-9a6a-440d-81ff-9ee6c4b9b284",
    "c4b469cb-498a-474d-874f-e65558071d50",
    "bcf2dcbd-db37-481b-b1d4-1028bc57f8c1",
    "bf0e5c33-f877-46ef-b88f-69d6bf691f8d",
    "79df4e73-8b8f-4b90-8ad4-163897663331",
    "de5a5358-9f7f-4bad-afe9-2e11473cc8b9",
    "ca6eed4f-775d-41ff-96d2-edcafb2a1ecb",
    "430bac91-ffd8-4d07-957b-73f1e2372e22",
    "ba83b551-f408-40d1-8325-22b5f2edafe9",
    "b9895c67-32ab-41f3-85bb-8266fd0a31cd",
  ];
  const productIdSql = expectedProductIds.map((id) => `'${id}'::uuid`).join(",");
  psql(String.raw`
    insert into auth.users(id) values('${actorId}');
    insert into public.organizations(id,name,slug) values(
      '${organizationId}','Phase 10Z production-shape fixture','phase10z-production-shape-fixture'
    );
    insert into public.user_profiles(id,organization_id,display_name,role,active,is_shared_device)
    values('${actorId}','${organizationId}','Phase 10Z Manager','manager',true,false);
    insert into public.inventory_locations(
      id,organization_id,name,code,location_type,parent_location_id,description,
      active,countable,sort_order,metadata,created_by_auth_user_id,updated_by_auth_user_id
    ) values
      ('fa200000-0000-4000-8000-000000000001','${organizationId}','Workbar','WORKBAR','area',null,null,true,false,1,'{}','${actorId}','${actorId}'),
      ('${mainStorageId}','${organizationId}','Main Storage','MAIN_STORAGE','storage',null,'Existing identity',true,true,40,'{"fixture":"preserve-id"}','${actorId}','${actorId}'),
      ('fa200000-0000-4000-8000-000000000003','${organizationId}','Coffee','WORKBAR_COFFEE','station','fa200000-0000-4000-8000-000000000001',null,true,false,20,'{}','${actorId}','${actorId}'),
      ('fa200000-0000-4000-8000-000000000004','${organizationId}','Snacks','WORKBAR_SNACKS','shelf','fa200000-0000-4000-8000-000000000001',null,true,false,21,'{}','${actorId}','${actorId}'),
      ('fa200000-0000-4000-8000-000000000005','${organizationId}','Dry Storage','DRY_STORAGE','storage',null,'Must remain unchanged',true,true,50,'{"preserve":true}','${actorId}','${actorId}'),
      ('fa200000-0000-4000-8000-000000000006','${organizationId}','Beverage Storage','BEVERAGE_STORAGE','storage',null,'Dependency-free legacy placeholder',true,true,60,'{}','${actorId}','${actorId}');
    insert into public.inventory_products(
      id,organization_id,name,category,unit_label,active,sort_order,count_mode,
      millum_item_ref,ownership_status,created_by_auth_user_id,updated_by_auth_user_id
    ) values
      ('6bc1e704-9a6a-440d-81ff-9ee6c4b9b284','${organizationId}','20.000 Leguas','Wine','bottle',true,1,'unit','9082081','owned','${actorId}','${actorId}'),
      ('c4b469cb-498a-474d-874f-e65558071d50','${organizationId}','Abbazia Prosecco Extra Dry','Wine','bottle',true,2,'unit','4000232','owned','${actorId}','${actorId}'),
      ('bcf2dcbd-db37-481b-b1d4-1028bc57f8c1','${organizationId}','Casamatta Bianco','Wine','bottle',true,3,'unit','9020587','owned','${actorId}','${actorId}'),
      ('bf0e5c33-f877-46ef-b88f-69d6bf691f8d','${organizationId}','Casamatta Rosso','Wine','bottle',true,4,'unit','9031232','owned','${actorId}','${actorId}'),
      ('79df4e73-8b8f-4b90-8ad4-163897663331','${organizationId}','Castellroig Reserva Brut Nature','Wine','bottle',true,5,'unit','9078232','owned','${actorId}','${actorId}'),
      ('de5a5358-9f7f-4bad-afe9-2e11473cc8b9','${organizationId}','Lanzando Pet-Nat White Wine','Wine','bottle',true,6,'unit','9082082','owned','${actorId}','${actorId}'),
      ('ca6eed4f-775d-41ff-96d2-edcafb2a1ecb','${organizationId}','Maschio Prosecco Ca''Bertaldo','Wine','bottle',true,7,'unit','4026939','owned','${actorId}','${actorId}'),
      ('430bac91-ffd8-4d07-957b-73f1e2372e22','${organizationId}','Nugues Beaujolais Lancie','Wine','bottle',true,8,'unit','9082515','owned','${actorId}','${actorId}'),
      ('ba83b551-f408-40d1-8325-22b5f2edafe9','${organizationId}','Ca''N Verdura Negre','Wine','bottle',true,9,'unit','4004935','owned','${actorId}','${actorId}'),
      ('b9895c67-32ab-41f3-85bb-8266fd0a31cd','${organizationId}','Ca''Di Rajo Pinot Grigio','Wine','bottle',true,10,'unit','4057913','owned','${actorId}','${actorId}'),
      ('${planetaId}','${organizationId}','PLANETA CHARDONNAY. (0.75 ltr)','Wine','bottle',true,11,'unit','2295798','owned','${actorId}','${actorId}');
    select inventory_private.inventory_install_millum_profile_v1('${organizationId}','${actorId}');
    select inventory_private.inventory_install_millum_profile_v2('${organizationId}','${actorId}');
  `, { transaction: true });

  const profileFingerprint = () => scalar(String.raw`
    select md5(coalesce(string_agg(value,E'\n' order by value),'')) from (
      select 'profile|'||to_jsonb(profile)::text value from public.inventory_millum_export_profiles profile where profile.organization_id='${organizationId}'
      union all select 'row|'||to_jsonb(export_row)::text from public.inventory_millum_export_rows export_row where export_row.organization_id='${organizationId}'
      union all select 'transform|'||to_jsonb(transform)::text from inventory_private.inventory_millum_export_transforms transform
        join public.inventory_millum_export_profiles profile on profile.id=transform.profile_id where profile.organization_id='${organizationId}'
    ) immutable_profile;
  `);
  const alignedDataFingerprint = () => scalar(String.raw`
    with entries(value) as (
      select 'location|'||to_jsonb(location)::text from public.inventory_locations location where location.organization_id='${organizationId}'
      union all select 'standard|'||to_jsonb(standard)::text from public.inventory_location_products standard where standard.organization_id='${organizationId}'
      union all select 'guidance|'||to_jsonb(guidance)::text from public.inventory_location_reference_guidance guidance where guidance.organization_id='${organizationId}'
    ) select md5(coalesce(string_agg(value,E'\n' order by value),'')) from entries;
  `);
  const planetaBefore = scalar(`select to_jsonb(product)::text from public.inventory_products product where product.id='${planetaId}';`);
  const dryStorageBefore = scalar(`select to_jsonb(location)::text from public.inventory_locations location where location.organization_id='${organizationId}' and location.code='DRY_STORAGE';`);
  const profilesBefore = profileFingerprint();
  const exportFunctionBefore = scalar("select md5(pg_get_functiondef('public.get_inventory_millum_export(uuid)'::regprocedure));");

  const migrationSql = readFileSync(absolute("supabase/phase10z_inventory_location_and_express_shelf_alignment.sql"), "utf8");
  psql(migrationSql, { transaction: true });
  check("production-shape 10Z preserves the exact Main Storage UUID and applies the approved name",
    scalar(`select count(*)=1 from public.inventory_locations where organization_id='${organizationId}' and id='${mainStorageId}' and code='MAIN_STORAGE' and name='Main Storage Fridge';`) === "t");
  check("production-shape 10Z creates one non-countable targetless Express Shelf",
    scalar(`select count(*)=1 from public.inventory_locations location where location.organization_id='${organizationId}' and location.code='MAIN_STORAGE_EXPRESS_SHELF' and location.active and not location.countable and location.parent_location_id='${mainStorageId}' and not exists(select 1 from public.inventory_location_products standard where standard.location_id=location.id);`) === "t");
  check("production-shape 10Z creates one countable Workbar Milk Fridge with exactly ten reviewed links",
    scalar(`select count(*)=1 from public.inventory_locations location where location.organization_id='${organizationId}' and location.code='${milkFridgeCode}' and location.active and location.countable and (select count(*) from public.inventory_location_products standard where standard.location_id=location.id and standard.active)=10;`) === "t");
  check("production-shape ten wine links use the exact stable UUID set and targetless physical-count policy",
    scalar(`select count(*)=10 and count(*) filter(where standard.product_id=any(array[${productIdSql}]))=10 and bool_and(standard.stock_policy='physical_count_only' and standard.par_quantity=0 and not standard.contributes_to_storage_target and standard.historical_suggestion_quantity is null) from public.inventory_location_products standard join public.inventory_locations location on location.id=standard.location_id where location.organization_id='${organizationId}' and location.code='${milkFridgeCode}' and standard.active;`) === "t");
  check("production-shape ten wines each retain exactly one enabled published profile-v2 row",
    scalar(`select count(*)=10 and count(distinct export_row.mapped_product_id)=10 from public.inventory_millum_export_rows export_row join public.inventory_millum_export_profiles profile on profile.id=export_row.profile_id where profile.organization_id='${organizationId}' and profile.profile_version=2 and profile.status='published' and export_row.enabled and export_row.mapped_product_id=any(array[${productIdSql}]);`) === "t");
  check("production-shape Planeta remains byte-identical, unlinked, uncounted, and outside profile v2",
    scalar(`select to_jsonb(product)::text from public.inventory_products product where product.id='${planetaId}';`) === planetaBefore
      && scalar(`select count(*) from public.inventory_location_products where organization_id='${organizationId}' and product_id='${planetaId}';`) === "0"
      && scalar(`select count(*) from public.inventory_count_lines where organization_id='${organizationId}' and product_id='${planetaId}';`) === "0"
      && scalar(`select count(*) from public.inventory_millum_export_rows export_row join public.inventory_millum_export_profiles profile on profile.id=export_row.profile_id where profile.organization_id='${organizationId}' and profile.profile_version=2 and export_row.mapped_product_id='${planetaId}';`) === "0");
  check("production-shape Millum profiles and export function remain byte-stable with no profile v3",
    profileFingerprint() === profilesBefore
      && scalar("select md5(pg_get_functiondef('public.get_inventory_millum_export(uuid)'::regprocedure));") === exportFunctionBefore
      && scalar(`select count(*) from public.inventory_millum_export_profiles where organization_id='${organizationId}' and profile_version>=3;`) === "0");
  check("production-shape protected wine value conversions remain present",
    scalar("select pg_get_functiondef('public.get_inventory_millum_export(uuid)'::regprocedure) like '%4000232%111.89%' and pg_get_functiondef('public.get_inventory_millum_export(uuid)'::regprocedure) like '%4057913%154%' and pg_get_functiondef('public.get_inventory_millum_export(uuid)'::regprocedure) like '%4004935%208.87%';") === "t");
  check("production-shape fixture creates no milk, Oatly, Test Oatly, or generic Other Wine product/count scope",
    scalar(`select count(*) from public.inventory_products where organization_id='${organizationId}' and lower(name) ~ '(milk|oatly|oat milk|other wine)';`) === "0");
  check("production-shape coffee/snack names align, Dry Storage is unchanged, and dependency-free legacy storage retires",
    scalar(`select count(*) from public.inventory_locations where organization_id='${organizationId}' and ((code='WORKBAR_COFFEE' and name='Workbar Coffee Station') or (code='WORKBAR_SNACKS' and name='Workbar Snack Shelf' and not countable));`) === "2"
      && scalar(`select to_jsonb(location)::text from public.inventory_locations location where organization_id='${organizationId}' and code='DRY_STORAGE';`) === dryStorageBefore
      && scalar(`select count(*) from public.inventory_locations where organization_id='${organizationId}' and code='BEVERAGE_STORAGE' and not active and not countable and metadata->>'retiredBy'='phase10z';`) === "1");
  check("production-shape Express Shelf keeps manager-maintained live-image guidance without an uploaded object",
    scalar(`select count(*)=1 from public.inventory_location_reference_guidance guidance join public.inventory_locations location on location.id=guidance.location_id where location.organization_id='${organizationId}' and location.code='MAIN_STORAGE_EXPRESS_SHELF' and guidance.object_path is null and guidance.caption like 'Fill the service fridge from Express Shelf%';`) === "t");

  const onceAligned = alignedDataFingerprint();
  psql(migrationSql, { transaction: true });
  check("production-shape 10Z reapply is fully idempotent for aligned location data", alignedDataFingerprint() === onceAligned);
  check("production-shape 10Z reapply still preserves Planeta and immutable Millum profile v2",
    scalar(`select to_jsonb(product)::text from public.inventory_products product where product.id='${planetaId}';`) === planetaBefore
      && profileFingerprint() === profilesBefore);

  psql(String.raw`
    begin;
    select set_config('request.jwt.claim.sub','${actorId}',true);
    set local role authenticated;
    select public.create_inventory_count_session(
      'Workbar Milk Fridge proof','monthly','fa300000-0000-4000-8000-000000000001',current_date,
      array[(select id from public.inventory_locations where organization_id='${organizationId}' and code='${milkFridgeCode}')],null
    );
    commit;
  `);
  check("production-shape Stock Count creates exactly ten wine lines with blank quantities and no Planeta/milk line",
    scalar(`select count(*)=10 and count(*) filter(where product_id=any(array[${productIdSql}]))=10 and bool_and(counted_quantity is null and count_status='not_counted') and count(*) filter(where product_id='${planetaId}')=0 from public.inventory_count_lines line join public.inventory_count_sessions session on session.id=line.session_id where session.organization_id='${organizationId}' and session.idempotency_key='fa300000-0000-4000-8000-000000000001';`) === "t");
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
  for (const path of baseline) {
    if (path.endsWith("20260804123921_phase9l_millum_august_carry_forward_and_future_scope.sql")) {
      psqlAsConnectionOwner(readFileSync(absolute(PHASE9_SECURITY_FIXTURE), "utf8"));
      psqlAsConnectionOwner(readFileSync(absolute(PHASE9_TERMINAL_FIXTURE), "utf8"));
    }
    psql(readFileSync(absolute(path), "utf8"), { transaction: true });
  }
  psql(baselineFixtureSql, { transaction: true });
  psql(publicationBootstrapSql, { transaction: true });
  psql(fingerprintHelperSql);
  const protectedBaseline = {
    schema: scalar(protectedSchemaFingerprintSql),
    schemaStable: scalar(protectedSchemaStableFingerprintSql),
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
  check("three complete 31-migration sequences apply exactly 93 migrations", migrationApplications === 93);

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
  productionShapedActivationRecoveryChecks();
  productionShapedLocationAlignmentChecks();
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
  console.log(`PASS ${passCount} full Phase 10 migration reapply checks (${OWNER_CONTEXT}, 93/93)`);
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
  console.log("PASS owner-context matrix: rehearsal 93/93 + production-shaped 93/93");
}
