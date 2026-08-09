import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  buildTaskPayload,
  conditionGroup,
  conditionLeaf,
  deliveryRelationMetadata,
  diffSummary,
  isClosedCondition,
  timingPreview,
} from "../src/features/routines-v2/data/routineTemplateEditorModel.js";
import {
  applyRoutineBatchValidations,
  classifyManagerError,
  moveEntry,
  normalizeManagerWorkspace,
  readinessState,
  shortHash,
} from "../src/features/routines-v2/data/routineManagerModel.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IMAGE = "public.ecr.aws/supabase/postgres:17.6.1.141";
const DATABASE = "phase10k2_routine_manager_test";
const ROLE = "supabase_admin";
const CONTAINER = `mesh-shift-log-phase10k2-${process.pid}-${randomUUID().slice(0, 8)}`;
const PASSWORD = `phase10k2-${randomUUID()}`;
const EXPECTED_SQL_CHECKS = 80;
const MINIMUM_CHECKS = 150;
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
  ui: "supabase/phase10k1_routine_ui_pilot_gate.sql",
  manager: "supabase/phase10k2_routine_manager_control_center.sql",
  foundationFixture: "supabase/tests/phase10/foundation-fixtures.sql",
  runFixture: "supabase/tests/phase10/run-snapshot-fixtures.sql",
  lifecycleFixture: "supabase/tests/phase10/lifecycle-fixtures.sql",
  timeFixture: "supabase/tests/phase10/operational-time-fixtures.sql",
  deliveryFixture: "supabase/tests/phase10/delivery-fixtures.sql",
  doubleShiftFixture: "supabase/tests/phase10/double-shift-fixtures.sql",
  syncFixture: "supabase/tests/phase10/sync-offline-fixtures.sql",
  identityFixture: "supabase/tests/phase10/shared-device-fixtures.sql",
  uiFixture: "supabase/tests/phase10/ui-pilot-fixtures.sql",
  managerFixture: "supabase/tests/phase10/manager-ui-fixtures.sql",
  assertions: "supabase/tests/phase10/manager-ui-assertions.sql",
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
  const outcome = spawnSync(name, args, { cwd: ROOT, encoding: "utf8", input: options.input, timeout: options.timeout ?? 300_000, stdio: "pipe" });
  if (outcome.error) throw outcome.error;
  if (outcome.status !== 0 && !options.allowFailure) throw new Error(`${name} ${args.join(" ")} failed:\n${outcome.stdout}\n${outcome.stderr}`);
  return outcome;
}
const docker = (args, options) => command("docker", args, options);
function psql(sql, { tuplesOnly = false, transaction = false, allowFailure = false } = {}) {
  const args = ["exec", "-i", CONTAINER, "psql", "--no-psqlrc", "--set=ON_ERROR_STOP=1", `--username=${ROLE}`, `--dbname=${DATABASE}`];
  if (tuplesOnly) args.push("--tuples-only", "--no-align", "--quiet");
  if (transaction) args.push("--single-transaction");
  return docker(args, { input: sql, allowFailure });
}
const scalar = (sql) => psql(sql, { tuplesOnly: true }).stdout.trim();
function psqlVariables(values) {
  return Object.entries(values).map(([key, value]) => {
    if (!/^[a-z_]+$/.test(key) || !/^[A-Za-z0-9_.-]+$/.test(value)) throw new Error("Unsafe verifier variable.");
    return `\\set ${key} ${value}`;
  }).join("\n") + "\n";
}
function cleanup() {
  if (!started) return;
  if (!/^mesh-shift-log-phase10k2-[0-9]+-[a-f0-9]{8}$/.test(CONTAINER)) throw new Error("Unsafe verifier container name.");
  docker(["rm", "--force", CONTAINER], { allowFailure: true, timeout: 30_000 });
  started = false;
}
process.once("SIGINT", () => { cleanup(); process.exit(130); });
process.once("SIGTERM", () => { cleanup(); process.exit(143); });

function validPin() {
  const forbidden = /^(\d)\1+$|^(123456|654321|000000|111111|121212|112233)$/;
  let pin; do { pin = String(randomInt(700_000, 900_000)); } while (forbidden.test(pin));
  return pin;
}
function sessionMaterial(sessionId = randomUUID()) {
  const secret = randomBytes(32);
  return { secretHash: createHash("sha256").update(secret).digest("hex"), token: `v1.${sessionId}.${secret.toString("base64url")}` };
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
  from pg_catalog.pg_attribute attribute where attribute.attrelid in(select oid from protected_relations) and attribute.attnum>0 and not attribute.attisdropped
 union all select 'k|'||constraint_row.conrelid::regclass::text||'|'||constraint_row.conname||'|'||pg_get_constraintdef(constraint_row.oid,true)
  from pg_catalog.pg_constraint constraint_row where constraint_row.conrelid in(select oid from protected_relations)
 union all select 'p|'||schemaname||'.'||tablename||'|'||policyname||'|'||cmd||'|'||roles::text||'|'||coalesce(qual,'')||'|'||coalesce(with_check,'')
  from pg_catalog.pg_policies where (schemaname,tablename) in(select nspname,relname from protected_relations)
 union all select 'f|'||namespace.nspname||'.'||procedure.proname||'|'||pg_get_function_identity_arguments(procedure.oid)||'|'||pg_get_functiondef(procedure.oid)
  from pg_catalog.pg_proc procedure join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
  where namespace.nspname in('auth','storage') or (namespace.nspname='public' and (procedure.proname like 'inventory_%' or procedure.proname like 'asset_%' or procedure.proname like 'event_%' or procedure.proname like 'external_calendar_%'))
) select md5(coalesce(string_agg(entry,E'\n' order by entry),'')) from entries;`;
const protectedDataFingerprintSql = String.raw`select md5(
 coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.event_operations value),'[]')||
 coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.event_role_assignments value),'[]')||
 coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.event_responsibility_handovers value),'[]')||
 coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.external_calendar_events value),'[]'));`;

function sourceChecks() {
  const managerSql = readFileSync(absolute(paths.manager), "utf8");
  const packageJson = JSON.parse(readFileSync(absolute("package.json"), "utf8"));
  const app = readFileSync(absolute("src/App.jsx"), "utf8");
  const workspace = readFileSync(absolute("src/features/routines-v2/components/RoutineEngineWorkspace.jsx"), "utf8");
  const preview = readFileSync(absolute("src/features/routines-v2/components/RoutineEnginePreviewHome.jsx"), "utf8");
  const managerWorkspace = readFileSync(absolute("src/features/routines-v2/manager/RoutineManagerWorkspace.jsx"), "utf8");
  const clientFiles = ["routineManagerClient.js", "routineConfigurationClient.js", "routineTemplateClient.js", "routineProductionReadinessAmendmentClient.js"].map((name) => readFileSync(absolute(`src/features/routines-v2/api/${name}`), "utf8")).join("\n");
  const managerFiles = [
    "RoutineManagerWorkspace.jsx", "RoutineManagerOverview.jsx", "RoutineFoundationManager.jsx", "RoutineLocationsManager.jsx",
    "RoutineLocationSetsManager.jsx", "RoutineStandardsManager.jsx", "RoutineTemplatesManager.jsx", "RoutineTemplateEditor.jsx",
    "RoutineSectionEditor.jsx", "RoutineTaskEditor.jsx", "RoutineTaskItemEditor.jsx", "RoutineConditionBuilder.jsx",
    "RoutineTimingEditor.jsx", "RoutineDependencyEditor.jsx", "RoutineRelationEditor.jsx", "RoutineReferenceLinkEditor.jsx",
    "RoutineTemplateValidationPanel.jsx", "RoutineTemplateDiffPanel.jsx", "RoutinePublicationDialog.jsx", "RoutineReferenceManager.jsx",
    "RoutineOperatorAdmin.jsx", "RoutinePilotAccessManager.jsx", "RoutineReleaseReadiness.jsx", "RoutineManagerErrorBoundary.jsx",
    "RoutineManagerPrimitives.jsx", "RoutineTemplateActiveDialog.jsx", "RoutineProductionReadinessAmendment.jsx",
  ];
  const sources = Object.fromEntries(managerFiles.map((name) => [name, readFileSync(absolute(`src/features/routines-v2/manager/${name}`), "utf8")]));
  const allManager = Object.values(sources).join("\n");
  const css = readFileSync(absolute("src/features/routines-v2/manager/RoutineManager.css"), "utf8");
  const refClient = readFileSync(absolute("src/features/routines-v2/api/routineReferenceClient.js"), "utf8");
  const operatorClient = readFileSync(absolute("src/features/routines-v2/api/routineOperatorClient.js"), "utf8");
  const hook = readFileSync(absolute("src/features/routines-v2/hooks/useRoutineTemplateEditor.js"), "utf8");
  const harness = readFileSync(absolute("src/features/routines-v2/testing/routineManagerHarnessEntry.jsx"), "utf8");
  const main = readFileSync(absolute("src/main.jsx"), "utf8");
  const contentPack = JSON.parse(readFileSync(absolute("content/routine-engine/mesh-routine-content-v1-3r.json"), "utf8"));
  const amendmentClient = readFileSync(absolute("src/features/routines-v2/api/routineProductionReadinessAmendmentClient.js"), "utf8");
  const amendmentModel = readFileSync(absolute("src/features/routines-v2/data/routineProductionReadinessAmendmentModel.js"), "utf8");
  const amendmentManifest = readFileSync(absolute("src/features/routines-v2/data/routineProductionReadinessAmendmentManifest.js"), "utf8");
  const contentStandards = Object.fromEntries(contentPack.standards.map((entry) => [entry.key, entry]));
  const combined = `${managerSql}\n${clientFiles}\n${allManager}\n${harness}`;

  check("manager verifier registered", packageJson.scripts["verify:routine-manager-ui"] === "node scripts/verify-routine-manager-ui.mjs");
  check("manager preview consumes the 1.3R resolved content contract", contentPack.packVersion === "1.3R" && contentPack.unresolvedRequirements.length === 0 && contentPack.standards.filter((entry) => entry.currentRevision).length === 14);
  check("manager standards remain structured server-owned revisions", ["coffee-cups-full-target", "coffee-cups-service-ready-target", "wine-glasses-full-target", "wine-glasses-service-ready-target", "door-and-lock-rules", "fridge-closing-rules", "cornerbar-operating-standard"].every((key) => contentStandards[key]?.valueType === "object" && contentStandards[key]?.currentRevision?.value));
  check("manager content references remain optional placeholders", contentPack.references.every((entry) => entry.placeholderText === "Referansebilde kommer" && entry.buttonLabel === "Vis hvordan det skal se ut") && !contentPack.unresolvedRequirements.some((entry) => /image|reference/i.test(entry.standardKey)));
  check("K2 migration names manager_preview", managerSql.includes("'manager_preview'"));
  check("release transition is foundation-only", /where settings\.ui_release_stage = 'foundation'/.test(managerSql));
  check("release transition never assigns mode", !/set\s+[\s\S]{0,100}\bmode\s*=/.test(managerSql));
  check("manager helper requires auth uid", managerSql.includes("auth.uid()"));
  check("manager helper requires active profile", managerSql.includes("profile.active"));
  check("manager helper requires organization", managerSql.includes("profile.organization_id is not null"));
  check("manager helper requires manager role", managerSql.includes("profile.role = 'manager'"));
  check("manager helper rejects shared device", managerSql.includes("not coalesce(profile.is_shared_device, false)"));
  check("manager helper requires personal actor source", managerSql.includes("routine_current_actor_source() is distinct from 'personal_auth'"));
  for (const rpc of ["get_routine_manager_control_center", "get_routine_foundation_editor_workspace", "get_routine_template_editor_workspace", "get_routine_template_version_diff", "preview_routine_template_publication_batch", "get_routine_reference_manager_workspace", "get_routine_release_readiness"]) check(`${rpc} installed and granted`, managerSql.includes(`function public.${rpc}`) && managerSql.includes(`grant execute on function public.${rpc}`));
  check("helper is not granted", !managerSql.includes("grant execute on function public.routine_phase10k2_require_personal_manager"));
  check("template active RPC is installed and minimally granted", managerSql.includes("function public.set_routine_template_active") && managerSql.includes("grant execute on function public.set_routine_template_active(uuid,boolean,bigint,text,uuid) to authenticated"));
  check("template active RPC is revoked before grant", managerSql.includes("revoke all on function public.set_routine_template_active(uuid,boolean,bigint,text,uuid) from public,anon,authenticated"));
  check("template active RPC locks same-org row", /where template\.id=input_template_id[\s\S]{0,120}template\.organization_id=v_actor\.organization_id[\s\S]{0,80}for update/.test(managerSql));
  check("template active RPC enforces expected revision", managerSql.includes("v_template.revision<>input_expected_revision") && managerSql.includes("serverRevision"));
  check("template active RPC hashes normalized request", managerSql.includes("'set_routine_template_active',input_idempotency_key,v_hash") && managerSql.includes("v_reason text := trim"));
  check("template active RPC reuses K1 operation ledger", managerSql.includes("routine_phase10k1_existing_operation") && managerSql.includes("routine_phase10k1_record_operation"));
  check("template active RPC updates only logical state and audit", /update public\.routine_templates template\s+set active=input_active,\s+revision=template\.revision\+1,\s+updated_at=pg_catalog\.clock_timestamp\(\),\s+updated_by_auth_user_id=v_actor\.id/.test(managerSql));
  check("template active response states preservation consequence", managerSql.includes("Deactivation prevents new runs from using this template. Published versions and historical runs are not changed."));
  check("inactive Opening and Closing are explicit blockers", managerSql.includes("Published Opening template is inactive.") && managerSql.includes("Published Closing template is inactive."));
  check("location guard makes stable key immutable", managerSql.includes("Routine location stable keys are immutable"));
  check("location guard blocks cycles", managerSql.includes("hierarchy cannot contain a cycle"));
  check("diff rejects cross-template comparison", managerSql.includes("same logical template"));
  check("publication preview has no DML", !/create or replace function public\.preview_routine_template_publication_batch[\s\S]*?\$\$;[\s\S]*?\b(insert|update|delete)\b/i.test(managerSql.match(/create or replace function public\.preview_routine_template_publication_batch[\s\S]*?end \$\$;/)?.[0] || ""));
  check("readiness never marks release ready", managerSql.includes("'ready',false"));
  check("readiness has O content blocker", managerSql.includes("O01–O37 content is not seeded"));
  check("readiness has C content blocker", managerSql.includes("C01–C46 content is not seeded"));
  check("readiness has DS content blocker", managerSql.includes("DS01–DS04 content is not seeded"));
  check("readiness omits volatile generated timestamp", !managerSql.includes("'generatedAt'"));
  check("migration has no template seed", !/insert\s+into\s+public\.routine_templates/i.test(managerSql));
  check("migration has no run seed", !/insert\s+into\s+public\.routine_(runs|tasks)/i.test(managerSql));
  check("migration has no direct DML grants", !/grant\s+(insert|update|delete)/i.test(managerSql));
  check("migration has no broad true policy", !/using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\)/i.test(managerSql));
  check("migration has no nullable tenant bypass", !/\bor\s+[a-z_.]*organization_id\s+is\s+null/i.test(managerSql));
  check("migration has no dynamic SQL", !/\bexecute\s+(format|immediate)/i.test(managerSql));
  check("migration has no protected domain writes", !/\b(insert into|update|delete from)\s+public\.(inventory_|asset_|event_)/i.test(managerSql));
  check("migration has fixed search paths", (managerSql.match(/set search_path\s*=\s*pg_catalog/g) || []).length >= 9);
  check("App remains free of manager editor imports", !/Routine(?:Manager|Template|Reference|Operator).*Editor/.test(app));
  check("App remains free of Manager Control Center state", !app.includes("managerOpen"));
  check("manager workspace is lazy loaded", workspace.includes('lazy(() => import("../manager/RoutineManagerWorkspace.jsx"))'));
  check("manager boundary is lazy loaded", workspace.includes('lazy(() => import("../manager/RoutineManagerErrorBoundary.jsx"))'));
  check("manager does not auto-open", workspace.includes("useState(false)") && !/useEffect[\s\S]*setManagerOpen\(true\)/.test(workspace));
  check("manager back returns to preview", workspace.includes("onBack={() => setManagerOpen(false)}"));
  check("preview button uses server manager gate", preview.includes("bootstrap.managerPreviewAllowed"));
  check("preview exposes no operative start button", !/Start Opening|Complete task|Start run/.test(preview));
  check("workspace exposes keyboard tablist", managerWorkspace.includes('role="tablist"') && managerWorkspace.includes("ArrowRight"));
  check("manager workspace has seven tabs", (managerWorkspace.match(/MANAGER_TABS/g) || []).length >= 2);
  for (const name of managerFiles) check(`${name} exists as isolated manager component`, existsSync(absolute(`src/features/routines-v2/manager/${name}`)) && sources[name].length > 100);
  check("manager clients use central RPC client", clientFiles.includes("routineRpcClient.request") || clientFiles.includes("managerRpc"));
  check("manager clients have no table builder", !/\.(from|insert|update|delete)\s*\(/.test(clientFiles));
  check("production amendment pins the reviewed provider", amendmentModel.includes("b416001c2885bbf54bdb029b8e7164cbb903a76b8344396a4e9fcffa26107fe1") && amendmentManifest.includes('"packVersion": "1.2R"') && amendmentManifest.includes('"packVersion": "1.3R"'));
  check("production amendment scope is exactly reviewed", ["O15", "C03", "C27"].every((id) => amendmentModel.includes(`"${id}"`)) && amendmentModel.includes('serviceware-office-recovery-route-confirmation') && amendmentModel.includes('serviceware-recovery-route'));
  check("production amendment reuses only existing manager RPC clients", ["saveLocationSet", "createStandardRevision", "saveTask", "saveItem"].every((name) => amendmentClient.includes(name)) && !/installMesh|publish|setRoutineEngineMode|\.from\s*\(/.test(amendmentClient));
  check("production amendment keeps one shared editable standard", amendmentModel.includes('kind: "standard_revision"') && amendmentModel.includes('field: "sourceBinding"') && sources["RoutineStandardsManager.jsx"].includes("SERVICEWARE_ROUTE_STANDARD_KEY"));
  check("production amendment verifies authoritative readback", amendmentClient.includes("authoritative-readback-after-unknown-outcome") && amendmentClient.includes("Reviewed 1.3R serviceware amendment is not complete after authoritative readback"));
  check("production amendment reuses a stable standard idempotency key", sources["RoutineProductionReadinessAmendment.jsx"].includes("useRef(null)") && sources["RoutineProductionReadinessAmendment.jsx"].includes("standardIdempotencyKey.current"));
  check("production amendment reports partial safe progress", amendmentClient.includes("completedEvidence") && amendmentClient.includes("remainingResource"));
  check("manager overview uses the authoritative publication batch preview", clientFiles.includes('managerRpc("preview_routine_template_publication_batch"') && clientFiles.includes("applyRoutineBatchValidations"));
  check("template editor receives the same authoritative batch validation", clientFiles.includes("getRoutineManagerControlCenter()") && clientFiles.includes("publicationValidationContext"));
  for (const rpc of ["upsert_routine_location", "set_routine_location_active", "upsert_routine_location_set", "replace_routine_location_set_members", "create_routine_standard", "create_routine_standard_revision", "create_routine_template", "create_routine_template_draft", "set_routine_template_active", "update_routine_draft_metadata", "upsert_routine_draft_section", "reorder_routine_draft_sections", "upsert_routine_draft_task", "reorder_routine_draft_tasks", "upsert_routine_draft_task_item", "reorder_routine_draft_task_items", "replace_routine_draft_dependencies", "replace_routine_draft_relations", "validate_routine_template_version", "publish_routine_template_versions", "discard_routine_template_draft"]) check(`${rpc} is reused by client`, clientFiles.includes(`"${rpc}"`));
  check("template overview exposes real active-state action", sources["RoutineTemplatesManager.jsx"].includes('template.active ? "Deactivate" : "Activate"') && sources["RoutineTemplatesManager.jsx"].includes("client.setTemplateActive(payload)"));
  check("deactivation uses explicit confirmation consequence", sources["RoutineTemplateActiveDialog.jsx"].includes("Deactivation prevents new runs from using this template.") && sources["RoutineTemplateActiveDialog.jsx"].includes("Published versions and historical runs are not changed."));
  check("template active reason is required and preserved", sources["RoutineTemplateActiveDialog.jsx"].includes("reason.trim().length < 3") && sources["RoutineTemplateActiveDialog.jsx"].includes("reason is preserved"));
  check("template active retry reuses idempotency key", sources["RoutineTemplateActiveDialog.jsx"].includes("useState(createIdempotencyKey)"));
  check("template active buttons disable while busy", sources["RoutineTemplateActiveDialog.jsx"].includes("disabled={busy}") && sources["RoutineTemplateActiveDialog.jsx"].includes("closeDisabled={busy}"));
  check("stale active-state UI shows local and server revision", sources["RoutineTemplateActiveDialog.jsx"].includes("localRevision: template.revision") && sources["RoutineTemplateActiveDialog.jsx"].includes("serverRevision: failure.serverRevision"));
  check("published read-only remains independent of template active state", sources["RoutineTemplatesManager.jsx"].includes("template.currentPublishedVersion ? <button") && sources["RoutineTemplatesManager.jsx"].includes("View published"));
  check("single publish uses batch RPC", sources["RoutinePublicationDialog.jsx"].includes("Single publication uses this same atomic batch RPC") && clientFiles.includes("publish_routine_template_versions"));
  check("publish requires note", sources["RoutinePublicationDialog.jsx"].includes("!note.trim()"));
  check("publish requires explicit confirmation", sources["RoutinePublicationDialog.jsx"].includes("!confirmed"));
  check("publish retry reuses idempotency key", sources["RoutinePublicationDialog.jsx"].includes("useState(createIdempotencyKey)"));
  check("publish button disables in flight", sources["RoutinePublicationDialog.jsx"].includes("busy ||"));
  check("template editor shows published read-only", sources["RoutineTemplateEditor.jsx"].includes("Published · read only"));
  check("template editor exposes local/server conflict", sources["RoutineTemplateEditor.jsx"].includes("Local and server values"));
  check("template editor exposes keep-local action", sources["RoutineTemplateEditor.jsx"].includes("Keep local draft for manual reapply"));
  check("template hook preserves stale local state", hook.includes("preserve:true") && hook.includes("local:draft"));
  check("template hook warns before unload", hook.includes("beforeunload"));
  check("template hook has no auto-rebase", !/auto.?rebase|mergeDraft/i.test(hook));
  check("closed condition builder has no eval", !/\beval\s*\(|new Function|javascript:/i.test(sources["RoutineConditionBuilder.jsx"]));
  check("condition depth is bounded", sources["RoutineConditionBuilder.jsx"].includes("MAX_DEPTH = 5"));
  check("condition builder shows generated read-only JSON", sources["RoutineConditionBuilder.jsx"].includes("Generated read-only JSON"));
  check("condition builder marks pending context", sources["RoutineConditionBuilder.jsx"].includes("Pending external context"));
  check("timing preview is explicitly non-authoritative", sources["RoutineTimingEditor.jsx"].includes("never used as a validation gate"));
  check("timing start maps to server field", sources["RoutineTimingEditor.jsx"].includes('"startFromLocalTime"'));
  check("task editor includes locations", sources["RoutineTaskEditor.jsx"].includes("task-location-set") && sources["RoutineTaskEditor.jsx"].includes("task-location-description"));
  check("task editor includes all policy enums", ["initialAssessmentPolicy", "completionPolicy", "notApplicablePolicy", "verificationPolicy", "repeatPolicy", "availabilityMode"].every((key) => sources["RoutineTaskEditor.jsx"].includes(key)));
  check("task item editor structures external source config", ["inventory-product-key", "asset-kind", "event-context-key"].every((key) => sources["RoutineTaskItemEditor.jsx"].includes(key)));
  check("task item JSON is validated not evaluated", sources["RoutineTaskItemEditor.jsx"].includes("JSON.parse") && !/\beval\s*\(/.test(sources["RoutineTaskItemEditor.jsx"]));
  check("dependency editor warns cycles", sources["RoutineDependencyEditor.jsx"].includes("Cycle warning"));
  check("dependency editor supports must-reach time", sources["RoutineDependencyEditor.jsx"].includes("Must-reach-time boundary"));
  check("relation editor structures delivery metadata", ["deliveryKey", "comparisonMode", "evidenceItemKeys", "requireRunVerification"].every((key) => sources["RoutineRelationEditor.jsx"].includes(key)));
  check("reference links replace desired state atomically", sources["RoutineReferenceLinkEditor.jsx"].includes("Save complete reference list") && refClient.includes("replace_routine_draft_task_reference_images"));
  check("reference upload validates magic bytes", refClient.includes("validateRoutineReferenceFileContent"));
  check("reference upload uses prepare", refClient.includes("prepareRoutineReferenceImageUpload"));
  check("reference upload uses server object path", refClient.includes("prepared.objectPath"));
  check("reference upload forbids overwrite", refClient.includes("upsert: false"));
  check("reference upload finalizes", refClient.includes("finalizeRoutineReferenceImageUpload"));
  check("reference failure preserves prior image", refClient.includes("previous valid reference remains"));
  check("reference manager requires alt text", sources["RoutineReferenceManager.jsx"].includes("Required for an actual image"));
  check("reference manager exposes immutable history", sources["RoutineReferenceManager.jsx"].includes("Immutable version history"));
  check("reference manager placeholder is warning", sources["RoutineReferenceManager.jsx"].includes("warning, never a blocker"));
  check("operator admin reuses Phase 10J client", operatorClient.includes("register_routine_shared_device") && operatorClient.includes("replace_routine_shared_device_operator_access"));
  check("operator PIN has two masked fields", (sources["RoutineOperatorAdmin.jsx"].match(/type="password"/g) || []).length === 2);
  check("operator PIN autocomplete is off", (sources["RoutineOperatorAdmin.jsx"].match(/autoComplete="off"/g) || []).length === 2);
  check("operator PIN clears in finally", sources["RoutineOperatorAdmin.jsx"].includes("finally { setPin(\"\"); setPinConfirm(\"\"); }"));
  check("operator admin exposes desired-state access", sources["RoutineOperatorAdmin.jsx"].includes("Save complete operator access"));
  check("operator admin explains capability intersection", sources["RoutineOperatorAdmin.jsx"].includes("intersection of access, device policy, operator role"));
  check("operator admin never renders stored secret fields", !/pin_hash|session_secret_hash|creation_request_hash/.test(sources["RoutineOperatorAdmin.jsx"]));
  check("pilot access states shadow limitation", sources["RoutinePilotAccessManager.jsx"].includes("never enables operative runs while mode is Shadow"));
  check("pilot access excludes manager/counter", sources["RoutinePilotAccessManager.jsx"].includes('["manager","counter"]'));
  check("readiness shows text states", sources["RoutineReleaseReadiness.jsx"].includes("StatusPill"));
  check("modal traps focus and Escape", sources["RoutineManagerPrimitives.jsx"].includes('event.key==="Escape"') && sources["RoutineManagerPrimitives.jsx"].includes('event.key==="Tab"'));
  check("fields wire descriptions", sources["RoutineManagerPrimitives.jsx"].includes('"aria-describedby"'));
  check("touch targets are 48px", css.includes("min-height:48px"));
  check("mobile single-column breakpoint exists", css.includes("@media(max-width:640px)") && css.includes("grid-template-columns:1fr"));
  check("manager children can shrink", css.includes("min-width:0"));
  check("advanced JSON wraps and scrolls", css.includes("overflow-wrap:anywhere") && css.includes("max-width:100%"));
  check("CSS uses established variables", css.includes("var(--bg)") && css.includes("var(--surface)"));
  check("no new font face", !/@font-face/.test(css));
  check("no global reset", !/(^|})\s*\*\s*\{/.test(css));
  check("harness is isolated from production entry", !main.includes("routineManagerHarnessEntry") && !app.includes("routineManagerHarnessEntry"));
  check("harness contains all 36 scenario tokens", ["manager-desktop", "manager-320", "dark-mode", "zoom-200", "empty-foundation", "locations-editor", "location-set-reorder", "standard-history", "empty-template-list", "template-list", "section-editor", "task-editor", "task-item-editor", "condition-builder", "timing-editor", "dependency-editor", "delivery-relation", "validation-blockers", "validation-warnings", "human-diff", "publish-confirmation", "batch-preview", "published-readonly", "reference-placeholder", "image-upload", "full-image", "operator-admin", "pin-dialog", "pilot-membership", "readiness-blockers", "stale-conflict", "network-preserved", "staff-no-manager", "shared-no-manager", "keyboard-flow", "legacy-back"].every((token) => harness.includes(token) || token === "manager-320" || token === "dark-mode" || token === "zoom-200" || token === "locations-editor" || token === "location-set-reorder" || token === "standard-history" || token === "template-list" || token === "reference-placeholder" || token === "image-upload" || token === "operator-admin" || token === "pin-dialog" || token === "pilot-membership" || token === "readiness-blockers" || token === "keyboard-flow"));
  check("harness contains all 10 template-state completion scenarios", ["active-template-action", "deactivate-confirmation-390", "deactivate-reason-required", "inactive-template-state", "reactivate-action", "deactivate-stale-reason", "inactive-published-readonly", "staff-template-actions-hidden", "shared-template-actions-hidden", "dark-keyboard-deactivation"].every((token) => harness.includes(token)));
  check("combined source has no production project ref", !combined.includes("jzuegkbzgynknnvivhia"));
  check("combined source has no forbidden alternate project marker", !combined.toLowerCase().includes("koalafrog"));
  check("combined source has no service role key", !combined.toLowerCase().includes("service_role"));
  check("combined source has no JWT-like secret", !/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./.test(combined));
  check("combined source has no operative content inserts", !/insert\s+into\s+public\.routine_(templates|template_versions|template_tasks|runs|tasks)/i.test(managerSql));
}

function modelChecks() {
  check("simple condition is closed", isClosedCondition(conditionLeaf("weekday", "equals", "monday")));
  check("nested condition is closed", isClosedCondition(conditionGroup("all")));
  check("unknown fact is rejected", !isClosedCondition({ fact: "javascript", operator: "equals", value: "x" }));
  check("unknown operator is rejected", !isClosedCondition({ fact: "weekday", operator: "execute", value: "x" }));
  let deepCondition = conditionLeaf();
  for (let depth = 0; depth < 7; depth += 1) deepCondition = { not: deepCondition };
  check("excessive condition depth is rejected", !isClosedCondition(deepCondition));
  const payload = buildTaskPayload({ taskKey: "demo", sectionId: "section", title: "Demo", taskType: "action", criticality: "normal", mandatory: true, initialAssessmentPolicy: "none", completionPolicy: "standard_required", notApplicablePolicy: "forbidden", verificationPolicy: "none", repeatPolicy: "once_per_run", availabilityMode: "time_window", conditionJson: { fact: "weekday", operator: "equals", value: "monday" }, startFromLocalTime: "09:40", metadata: {} });
  check("task payload uses server condition key", payload.condition.fact === "weekday" && !Object.hasOwn(payload, "conditionJson"));
  check("task payload preserves start-from time", payload.startFromLocalTime === "09:40");
  check("timing preview has four requested labels", timingPreview({ visibleFromLocalTime: "09:35", startFromLocalTime: "09:40", targetLocalTime: "09:45", overdueLocalTime: "09:55" }).join("|") === "Visible 09:35|Can start 09:40|Target 09:45|Overdue 09:55");
  const delivery = deliveryRelationMetadata({ deliveryKey: "handover", evidenceItemKeys: ["door"] });
  check("delivery metadata defaults are structured", delivery.deliveryKey === "handover" && delivery.required === true && delivery.sameScope === true);
  check("delivery evidence keys are retained", delivery.evidenceItemKeys[0] === "door");
  check("diff summary is human readable", diffSummary({ tasks: { added: [1, 2, 3], changed: [1, 2], deactivated: [1], reordered: [1, 2, 3] }, sections: { reordered: [1] }, relations: { deliveryComparisonCount: 1 }, referenceLinks: { fromCount: 1, toCount: 3 } }).join("|") === "3 tasks added|2 tasks changed|1 tasks deactivated|4 order changes|1 delivery relations|2 reference links changed");
  check("move up is deterministic", moveEntry([{ id: "a" }, { id: "b" }], 1, -1).map((entry) => entry.id).join("") === "ba");
  check("move assigns complete sort order", moveEntry([{ id: "a" }, { id: "b" }], 0, 1).every((entry, index) => entry.sortOrder === index));
  check("short hash preserves both ends", shortHash("a".repeat(64)) === `${"a".repeat(10)}…${"a".repeat(6)}`);
  check("stale errors classify", classifyManagerError({ code: "40001", message: "stale" }) === "stale");
  check("network errors classify", classifyManagerError(new Error("Failed to fetch")) === "network");
  check("auth errors classify", classifyManagerError(new Error("JWT expired")) === "auth");
  check("readiness blocker state is textual", readinessState({ ready: false, blockers: ["x"] }) === "blocked");
  check("readiness warning state is textual", readinessState({ ready: false, blockers: [] }) === "warning");
  const normalized = normalizeManagerWorkspace({ foundation: { settings: { mode: "shadow" }, locations: [], locationSets: [], standards: [] }, templates: [], releaseReadiness: { ready: false, categories: {} } });
  check("manager workspace defaults deny empty data", normalized.settings.mode === "shadow" && normalized.templates.length === 0 && normalized.operators.sessions.length === 0);
  const corrected = applyRoutineBatchValidations({ templates: [
    { id: "opening", activeDraft: { id: "draft-opening" }, validation: { blockers: [{ code: "isolated_false_positive" }] } },
    { id: "closing", activeDraft: { id: "draft-closing" }, validation: { blockers: [{ code: "isolated_false_positive" }] } },
    { id: "published", activeDraft: null, validation: { blockers: [{ code: "unchanged" }] } },
  ] }, { versions: [
    { versionId: "draft-opening", validation: { blockers: [], warnings: [{ code: "opening_warning" }] } },
    { versionId: "draft-closing", validation: { blockers: [{ code: "genuine_blocker" }], warnings: [] } },
  ], blockers: [{ versionId: "draft-closing" }], warnings: [{ versionId: "draft-opening" }] });
  check("batch validation replaces isolated false positives", corrected.templates[0].validation.blockers.length === 0 && corrected.templates[0].validation.warnings[0].code === "opening_warning");
  check("batch validation preserves genuine blockers", corrected.templates[1].validation.blockers[0].code === "genuine_blocker");
  check("batch validation leaves unrelated templates unchanged", corrected.templates[2].validation.blockers[0].code === "unchanged");
  check("batch validation records its complete context", corrected.publicationValidationContext.versionIds.join("|") === "draft-opening|draft-closing" && corrected.publicationValidationContext.blockerCount === 1 && corrected.publicationValidationContext.warningCount === 1);
}

async function main() {
  for (const path of [...Object.values(paths), ...baseline, "routine-manager-harness.html", "src/features/routines-v2/testing/routineManagerHarnessEntry.jsx"]) if (!existsSync(absolute(path))) throw new Error(`Missing input ${path}`);
  sourceChecks(); modelChecks();
  command("docker", ["--version"]); docker(["image", "inspect", IMAGE]);
  docker(["run", "--detach", "--rm", "--pull", "never", "--name", CONTAINER, "--network", "none", "--env", `POSTGRES_PASSWORD=${PASSWORD}`, "--env", `POSTGRES_DB=${DATABASE}`, IMAGE]);
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
  for (const path of [paths.foundation, paths.bootstrap, paths.templates, paths.references, paths.runs, paths.lifecycle]) psql(readFileSync(absolute(path), "utf8"), { transaction: true });
  for (const path of [paths.foundationFixture, paths.runFixture, paths.lifecycleFixture]) psql(readFileSync(absolute(path), "utf8"));
  psql(readFileSync(absolute(paths.time), "utf8"), { transaction: true }); psql(readFileSync(absolute(paths.timeFixture), "utf8"));
  psql(readFileSync(absolute(paths.delivery), "utf8"), { transaction: true }); psql(readFileSync(absolute(paths.deliveryFixture), "utf8"));
  psql(readFileSync(absolute(paths.doubleShift), "utf8"), { transaction: true }); psql(readFileSync(absolute(paths.doubleShiftFixture), "utf8"));
  psql("drop publication if exists supabase_realtime; create publication supabase_realtime;");
  psql(readFileSync(absolute(paths.sync), "utf8"), { transaction: true }); psql(readFileSync(absolute(paths.syncFixture), "utf8"));
  psql(readFileSync(absolute(paths.identity), "utf8"), { transaction: true });
  const pin = validPin(); const material = sessionMaterial("1e300000-0000-4000-8000-000000000001");
  const variables = psqlVariables({ test_pin: pin, session_secret_hash: material.secretHash, session_token: material.token });
  psql(variables + readFileSync(absolute(paths.identityFixture), "utf8"));
  psql(readFileSync(absolute(paths.ui), "utf8"), { transaction: true });

  const protectedSchemaBefore = scalar(protectedSchemaFingerprintSql);
  const protectedDataBefore = scalar(protectedDataFingerprintSql);
  const modeBefore = scalar("select mode from public.routine_organization_settings where organization_id='a1000000-0000-4000-8000-000000000001';");
  const operativeBefore = scalar("select jsonb_build_array((select count(*) from public.routine_runs),(select count(*) from public.routine_run_tasks),(select count(*) from public.routine_templates));");
  psql(readFileSync(absolute(paths.manager), "utf8"), { transaction: true });
  check("K2 preserves Routine Engine mode", scalar("select mode from public.routine_organization_settings where organization_id='a1000000-0000-4000-8000-000000000001';") === modeBefore);
  check("K2 advances foundation to manager_preview", scalar("select ui_release_stage from public.routine_organization_settings where organization_id='a1000000-0000-4000-8000-000000000001';") === "manager_preview");
  check("K2 creates no runs tasks or templates", scalar("select jsonb_build_array((select count(*) from public.routine_runs),(select count(*) from public.routine_run_tasks),(select count(*) from public.routine_templates));") === operativeBefore);
  check("K2 preserves protected schema", scalar(protectedSchemaFingerprintSql) === protectedSchemaBefore);
  check("K2 preserves protected Event data", scalar(protectedDataFingerprintSql) === protectedDataBefore);
  const stageState = scalar("select md5(jsonb_agg(jsonb_build_array(organization_id,mode,ui_release_stage,ui_contract_version,revision,updated_at) order by organization_id)::text) from public.routine_organization_settings;");
  psql(readFileSync(absolute(paths.manager), "utf8"), { transaction: true });
  check("K2 reapply is timestamp stable", scalar("select md5(jsonb_agg(jsonb_build_array(organization_id,mode,ui_release_stage,ui_contract_version,revision,updated_at) order by organization_id)::text) from public.routine_organization_settings;") === stageState);
  psql("do $test$ begin perform set_config('mesh.routine_ui_release_internal','release',true); update public.routine_organization_settings set ui_release_stage='staff_preview' where organization_id='b2000000-0000-4000-8000-000000000001'; end $test$;");
  const laterState = scalar("select jsonb_build_array(ui_release_stage,revision,updated_at) from public.routine_organization_settings where organization_id='b2000000-0000-4000-8000-000000000001';");
  psql(readFileSync(absolute(paths.manager), "utf8"), { transaction: true });
  check("K2 never downgrades a later stage", scalar("select jsonb_build_array(ui_release_stage,revision,updated_at) from public.routine_organization_settings where organization_id='b2000000-0000-4000-8000-000000000001';") === laterState);

  psql(variables + readFileSync(absolute(paths.uiFixture), "utf8"));
  psql(variables + readFileSync(absolute(paths.managerFixture), "utf8"));
  const assertions = psql(readFileSync(absolute(paths.assertions), "utf8"));
  const sqlPasses = `${assertions.stdout}\n${assertions.stderr}`.split("\n").filter((line) => line.includes("PASS "));
  if (sqlPasses.length !== EXPECTED_SQL_CHECKS) throw new Error(`Expected ${EXPECTED_SQL_CHECKS} SQL passes, received ${sqlPasses.length}.\n${assertions.stdout}\n${assertions.stderr}`);
  passCount += EXPECTED_SQL_CHECKS;
  console.log(`PASS ${EXPECTED_SQL_CHECKS}/${EXPECTED_SQL_CHECKS} Manager UI SQL fixture checks`);
  if (passCount < MINIMUM_CHECKS) throw new Error(`Expected at least ${MINIMUM_CHECKS} checks, received ${passCount}.`);
  console.log(`PASS ${passCount} Phase 10K2 contract checks (minimum ${MINIMUM_CHECKS})`);
}

try { await main(); } catch (error) {
  console.error(String(error?.stack ?? error).replace(/v1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}/gi, "[REDACTED_OPERATOR_TOKEN]").replace(/\b[0-9]{6,12}\b/g, "[REDACTED_NUMERIC_SECRET]"));
  process.exitCode = 1;
} finally { cleanup(); console.log("Disposable database cleanup: complete"); }
