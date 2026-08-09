import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { groupRoutineTasks, taskDisplayGroup, taskPrimaryLabel, taskStatusLabel, validateRoutineItemDraft } from "../src/features/routines-v2/data/routineTaskViewModel.js";
import { normalizeRoutineEmployeeHome, normalizeRoutineTaskActionContext, routineEmployeeError } from "../src/features/routines-v2/data/routineEmployeeModel.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IMAGE = "public.ecr.aws/supabase/postgres:17.6.1.141";
const DATABASE = "phase10k3_routine_employee_test";
const ROLE = "supabase_admin";
const CONTAINER = `mesh-shift-log-phase10k3-${process.pid}-${randomUUID().slice(0, 8)}`;
const PASSWORD = `phase10k3-${randomUUID()}`;
const MINIMUM_SQL_CHECKS = 80;
const MINIMUM_CHECKS = 200;
let started = false; let passCount = 0;
const absolute = (path) => resolve(ROOT, path);
if (process.argv.length > 2) throw new Error("This verifier accepts no network, URL, host, or project arguments.");

const paths = {
  foundation: "supabase/phase10a_routine_engine_foundation.sql", bootstrap: "supabase/phase10a1_routine_organization_settings_bootstrap.sql", templates: "supabase/phase10b_routine_templates.sql",
  references: "supabase/phase10c_routine_reference_images.sql", runs: "supabase/phase10d_routine_runs_and_snapshots.sql",
  lifecycle: "supabase/phase10e_routine_task_lifecycle.sql", time: "supabase/phase10f_routine_operational_time.sql",
  delivery: "supabase/phase10g_routine_closing_delivery.sql", doubleShift: "supabase/phase10h_routine_double_shift.sql",
  sync: "supabase/phase10i_routine_realtime_offline_sync.sql", identity: "supabase/phase10j_routine_shared_device_identity.sql",
  ui: "supabase/phase10k1_routine_ui_pilot_gate.sql", manager: "supabase/phase10k2_routine_manager_control_center.sql",
  employee: "supabase/phase10k3_routine_employee_workflow.sql",
  foundationFixture: "supabase/tests/phase10/foundation-fixtures.sql", runFixture: "supabase/tests/phase10/run-snapshot-fixtures.sql",
  lifecycleFixture: "supabase/tests/phase10/lifecycle-fixtures.sql", timeFixture: "supabase/tests/phase10/operational-time-fixtures.sql",
  deliveryFixture: "supabase/tests/phase10/delivery-fixtures.sql", doubleShiftFixture: "supabase/tests/phase10/double-shift-fixtures.sql",
  syncFixture: "supabase/tests/phase10/sync-offline-fixtures.sql", identityFixture: "supabase/tests/phase10/shared-device-fixtures.sql",
  uiFixture: "supabase/tests/phase10/ui-pilot-fixtures.sql", employeeFixture: "supabase/tests/phase10/employee-ui-fixtures.sql",
  assertions: "supabase/tests/phase10/employee-ui-assertions.sql",
};
const baseline = ["supabase/schema.sql", "supabase/phase7a_workbar_device_auth.sql", "supabase/phase5f4_close_day_archives.sql",
  "supabase/phase8a_event_operations_core.sql", "supabase/phase8c_zone_command_structure.sql", "supabase/phase8c2_fix_role_duplicates_and_my_zone.sql",
  "supabase/phase8f_calendar_import_realtime.sql", "supabase/phase8h3_smart_staffing_permissions.sql", "supabase/phase8i_event_live_updates.sql",
  "supabase/phase9a_inventory_stocktaking.sql", "supabase/phase9b_stock_policies.sql"];

function check(label, condition) { if (!condition) throw new Error(`FAIL ${String(passCount + 1).padStart(3, "0")} ${label}`); passCount += 1; console.log(`PASS ${String(passCount).padStart(3, "0")} ${label}`); }
function command(name, args, options = {}) { const result = spawnSync(name, args, { cwd: ROOT, encoding: "utf8", input: options.input, timeout: options.timeout ?? 300_000, stdio: "pipe" });
  if (result.error) throw result.error; if (result.status !== 0 && !options.allowFailure) throw new Error(`${name} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`); return result; }
const docker = (args, options) => command("docker", args, options);
function psql(sql, { tuplesOnly = false, transaction = false, allowFailure = false } = {}) { const args = ["exec", "-i", CONTAINER, "psql", "--no-psqlrc", "--set=ON_ERROR_STOP=1", `--username=${ROLE}`, `--dbname=${DATABASE}`];
  if (tuplesOnly) args.push("--tuples-only", "--no-align", "--quiet"); if (transaction) args.push("--single-transaction"); return docker(args, { input: sql, allowFailure }); }
const scalar = (sql) => psql(sql, { tuplesOnly: true }).stdout.trim();
function variables(values) { return Object.entries(values).map(([key, value]) => { if (!/^[a-z_]+$/.test(key) || !/^[A-Za-z0-9_.-]+$/.test(value)) throw new Error("Unsafe verifier variable."); return `\\set ${key} ${value}`; }).join("\n") + "\n"; }
function cleanup() { if (!started) return; if (!/^mesh-shift-log-phase10k3-[0-9]+-[a-f0-9]{8}$/.test(CONTAINER)) throw new Error("Unsafe verifier container name."); docker(["rm", "--force", CONTAINER], { allowFailure: true, timeout: 30_000 }); started = false; }
process.once("SIGINT", () => { cleanup(); process.exit(130); }); process.once("SIGTERM", () => { cleanup(); process.exit(143); });
function validPin() { const forbidden = /^(\d)\1+$|^(123456|654321|000000|111111|121212|112233)$/; let pin; do { pin = String(randomInt(700_000, 900_000)); } while (forbidden.test(pin)); return pin; }
function sessionMaterial(sessionId = randomUUID()) { const secret = randomBytes(32); return { secretHash: createHash("sha256").update(secret).digest("hex"), token: `v1.${sessionId}.${secret.toString("base64url")}` }; }

const employeeFiles = ["RoutineEmployeeWorkspace.jsx", "RoutineEmployeeHome.jsx", "RoutineRunWorkspace.jsx", "RoutineRunHeader.jsx", "RoutineRunProgress.jsx",
  "RoutineTaskGroups.jsx", "RoutineTaskCard.jsx", "RoutineTaskDetails.jsx", "RoutineTaskItemControl.jsx", "RoutineTaskActionBar.jsx", "RoutineInitialAssessmentPanel.jsx",
  "RoutineDeviationDialog.jsx", "RoutineNotApplicableDialog.jsx", "RoutineCompletionDialog.jsx", "RoutineCriticalReauthDialog.jsx", "RoutineReferenceInline.jsx",
  "RoutineReferenceViewer.jsx", "RoutineTimingStatus.jsx", "RoutineAssignmentBadge.jsx", "RoutinePreviousDeliveryCard.jsx", "RoutineRunFinishPanel.jsx",
  "RoutineVerificationPanel.jsx", "RoutineHandoverPanel.jsx", "RoutineTransferPanel.jsx", "RoutineDoubleShiftWorkspace.jsx", "RoutineDoubleShiftPlan.jsx",
  "RoutineDoubleShiftTransition.jsx", "RoutineDoubleShiftReturn.jsx", "RoutineDoubleShiftChangeFeed.jsx", "RoutineOfflineState.jsx", "RoutineConflictPanel.jsx",
  "RoutineDialogSurface.jsx", "RoutineDeviationActions.jsx", "RoutineEmployeeErrorBoundary.jsx", "RoutineEmployee.css"];
const hookFiles = ["useRoutineEmployeeHome.js", "useRoutineRunWorkspace.js", "useRoutineTaskAction.js", "useRoutineRunActions.js", "useRoutineDoubleShiftWorkspace.js",
  "useRoutineHandover.js", "useRoutineTransfer.js", "useRoutineCriticalReauth.js", "useRoutinePendingOverlay.js"];

function sourceChecks() {
  const required = [...baseline, ...Object.values(paths), ...employeeFiles.map((name) => `src/features/routines-v2/employee/${name}`),
    ...hookFiles.map((name) => `src/features/routines-v2/hooks/${name}`), "src/features/routines-v2/api/routineEmployeeClient.js",
    "src/features/routines-v2/data/routineEmployeeModel.js", "src/features/routines-v2/data/routineTaskViewModel.js"];
  for (const path of required) check(`required file exists: ${path}`, existsSync(absolute(path)));
  const sql = readFileSync(absolute(paths.employee), "utf8"); const client = readFileSync(absolute("src/features/routines-v2/api/routineEmployeeClient.js"), "utf8");
  const hooks = hookFiles.map((name) => readFileSync(absolute(`src/features/routines-v2/hooks/${name}`), "utf8")).join("\n");
  const components = employeeFiles.filter((name) => name.endsWith(".jsx")).map((name) => readFileSync(absolute(`src/features/routines-v2/employee/${name}`), "utf8")).join("\n");
  const offlineState = readFileSync(absolute("src/features/routines-v2/employee/RoutineOfflineState.jsx"), "utf8");
  const models = readFileSync(absolute("src/features/routines-v2/data/routineEmployeeModel.js"), "utf8") + readFileSync(absolute("src/features/routines-v2/data/routineTaskViewModel.js"), "utf8");
  const css = readFileSync(absolute("src/features/routines-v2/employee/RoutineEmployee.css"), "utf8"); const combined = `${client}\n${hooks}\n${components}\n${models}`;
  const offlineDb = readFileSync(absolute("src/features/routines-v2/offline/routineOfflineDb.js"), "utf8");
  const contentPack = JSON.parse(readFileSync(absolute("content/routine-engine/mesh-routine-content-v1-2r.json"), "utf8"));
  const contentTasks = Object.fromEntries([...contentPack.opening.tasks, ...contentPack.closing.tasks].map((entry) => [entry.id, entry]));
  check("employee content receives the 1.2R server-authored contract", contentPack.packVersion === "1.2R" && contentPack.unresolvedRequirements.length === 1);
  check("employee checkpoints require independent physical layout checks", [contentTasks.O29, contentTasks.O35].every((task) => /new physical check/.test(task.structuredItemsText) && /never inherited/.test(task.doneCriteriaText)));
  check("employee event-active Cornerbar work uses transfer evidence, not N/A", ["C10", "C20", "C30", "C33", "C38", "C40", "C41", "C42", "C43"].every((id) => contentTasks[id].items.some((item) => item.standardKey === "cornerbar-operating-standard")));
  check("employee task content contains no security credential field", !/(alarmCode|safeCode|saltoPassword|saltoPin|pinCode)/i.test(JSON.stringify(contentPack)));
  check("release advances manager_preview only", /where settings\.ui_release_stage='manager_preview'/.test(sql));
  check("release stage is staff_preview", sql.includes("ui_release_stage='staff_preview'")); check("contract is phase10k3-v1", sql.includes("ui_contract_version='phase10k3-v1'"));
  check("release transition never assigns mode", !/set\s+[\s\S]{0,100}\bmode\s*=/.test(sql)); check("migration does not create settings", !/insert\s+into\s+public\.routine_organization_settings/i.test(sql));
  check("migration seeds no templates", !/insert\s+into\s+public\.routine_templates/i.test(sql)); check("migration seeds no runs", !/insert\s+into\s+public\.routine_runs/i.test(sql));
  check("migration seeds no tasks", !/insert\s+into\s+public\.routine_run_tasks/i.test(sql)); check("migration seeds no bundles", !/insert\s+into\s+public\.routine_bundles/i.test(sql));
  check("migration grants no table DML", !/grant\s+(insert|update|delete)/i.test(sql)); check("migration defines no broad policy", !/using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\)/i.test(sql));
  check("migration has no organization null bypass", !/\bor\s+[a-z_.]*organization_id\s+is\s+null/i.test(sql)); check("migration has no Event Operations writes", !/\b(insert into|update|delete from)\s+public\.event_/i.test(sql));
  check("migration has no inventory writes", !/\b(insert into|update|delete from)\s+public\.(inventory_|asset_)/i.test(sql)); check("all public K3 reads fix search path", (sql.match(/set search_path=pg_catalog/g) ?? []).length >= 8);
  for (const rpc of ["get_routine_employee_home", "get_routine_run_action_context", "get_routine_task_action_context", "get_routine_handover_action_context", "get_routine_transfer_action_context", "get_double_shift_action_context"]) {
    check(`${rpc} is installed`, sql.includes(`function public.${rpc}`)); check(`${rpc} is granted minimally`, sql.includes(`public.${rpc}`) && /to authenticated;/.test(sql));
  }
  check("private employee context is not granted", !sql.includes("grant execute on function public.routine_phase10k3_employee_context")); check("private action helper is not granted", !sql.includes("grant execute on function public.routine_phase10k3_action"));
  check("private sanitization helper is not granted", !sql.includes("grant execute on function public.routine_phase10k3_sanitize_row"));
  check("employee client has no table from calls", !/\.from\s*\(/.test(client)); check("employee client uses central RPC client", client.includes("routineRpcClient.request"));
  for (const rpc of ["get_routine_employee_home", "get_routine_run_action_context", "get_routine_task_action_context", "get_routine_handover_action_context", "get_routine_transfer_action_context", "get_double_shift_action_context"]) check(`client calls ${rpc}`, client.includes(`"${rpc}"`));
  for (const mutation of ["createOrGetRoutineRun", "joinRoutineRun", "startRoutineRun", "claimRoutineTask", "releaseRoutineTask", "startRoutineTask", "pauseRoutineTask",
    "recordInitialAssessment", "updateRoutineTaskItem", "addRoutineTaskComment", "blockRoutineTask", "markNotApplicable", "completeRoutineTask", "reopenRoutineTask",
    "createDeviation", "assignDeviation", "mitigateDeviation", "resolveDeviation", "cancelDeviation", "verifyRoutineTask", "proposeTransfer", "requestFinalVerification",
    "completeRunVerification", "finishRoutineRun", "reopenRoutineRun", "cancelRoutineRun", "createOrGet", "replaceDraft", "refreshGenerated", "submit", "accept",
    "acceptEvent", "rejectEvent", "completeEvent", "confirmPlan", "completeOpeningTransition", "getChangeFeed", "returnToDoubleShift", "reassignClosing"])
    check(`existing mutation delegated: ${mutation}`, client.includes(mutation));
  check("no client outcome parameter", !/input_outcome|outcome\s*:/.test(client)); check("no client operational date derivation", !/new Date\(\).*operational|Date\.now\(\).*operational/.test(combined));
  check("run start uses server operational date", components.includes("operationalDate: clock.operationalDate") && !components.includes("operationalDate: null"));
  check("stable retry key retained", hooks.includes("current.get(operation)") && hooks.includes("current.set(operation, idempotencyKey)")); check("double click busy guard exists", hooks.includes("mode: \"busy\""));
  check("assessment wire values match lifecycle RPC", sql.includes("jsonb_build_array('ready','correction_required')")
    && sql.includes("jsonb_build_array('ready','control_issue_found')") && components.includes('["ready", "Already at standard"]')
    && components.includes('["control_issue_found", "Issue found"]'));
  check("run verification never invents server_required", !combined.includes("server_required"));
  check("event evidence uses typed item array", components.includes("eventEvidence = () => ({ items:")
    && components.includes("physicalCheckConfirmed: physical") && components.includes("resultCode, evidence: eventEvidence()"));
  check("Double Shift transition uses server payload keys", components.includes("transitionStatus: choice")
    && components.includes("expectedReturnLocalTime:") && components.includes("interimOwnerProfileId:"));
  check("Double Shift reassignment uses server participant", components.includes("closingParticipantId"));
  check("handover manual items satisfy server shape", components.includes('category: item.category || "operational"')
    && components.includes("responsibleParticipantId:") && components.includes("dueAt:"));
  check("deviation management reuses lifecycle RPCs", components.includes("assignDeviation") && components.includes("mitigateDeviation")
    && components.includes("resolveDeviation") && components.includes("cancelDeviation") && sql.includes("'canAssign'")
    && sql.includes("'canMitigate'") && sql.includes("'canResolve'") && sql.includes("'canCancel'"));
  check("offline overlay uses Phase 10I engine", hooks.includes("createRoutineSyncEngine") && hooks.includes("enqueueRoutineOperation")
    && hooks.includes('operationType: "task_bundle"') && hooks.includes('operationType: "run_finish_intent"'));
  check("production task flow renders explicit conflict actions", components.includes("<RoutineConflictPanel conflict={conflict}")
    && components.includes("Refresh server") && components.includes("Keep local draft") && components.includes("Discard local draft")
    && components.includes("Create new operation after manual resolution"));
  check("conflict replacement requires manual confirmation", components.includes("resolutionConfirmed")
    && components.includes("I compared the local draft with the refreshed server state"));
  check("conflict replacement uses Phase 10I helper", hooks.includes("createRoutineOperationAfterConflict") && hooks.includes("createAfterConflict"));
  check("explicit discard deletes only partitioned outbox record", offlineDb.includes("deleteRoutineOutboxRecord")
    && offlineDb.includes("[principalKey, clientOperationId]") && hooks.includes("deleteRoutineOutboxRecord"));
  check("pending overlay is operational-only", components.includes("operationalAllowed === true"));
  check("server projections are sanitized", sql.includes("routine_phase10k3_sanitize_row") && !sql.includes("'snapshotSources',"));
  check("pause draft closes only after receipt or queue", components.includes('response?.ok || response?.mode === "queued"'));
  check("draft is not cleared on failure", !/catch[\s\S]{0,100}set(ItemDrafts|Comment)\(/.test(components)); check("no auto merge implementation", !/autoMerge\s*\(|autoRebase\s*\(/i.test(combined));
  for (const phrase of ["Do now", "In progress", "Waiting", "Next", "Later", "Completed", "Deviations", "Next task", "Already at standard", "Correction required",
    "No issue found", "Issue found", "Reference image coming soon", "Show how it should look", "Previous Closing", "Server confirmed", "Local draft", "Queued", "Conflict",
    "Operator reauthentication required", "Read-only preview — operational actions are not enabled", "Ask a shift lead or manager to create this run", "DS01", "DS02", "DS03", "DS04"])
    check(`employee UI includes ${phrase}`, combined.includes(phrase));
  check("PIN resets in finally", /finally\s*\{\s*setPin\(""\)/.test(components)); check("PIN input disables autocomplete", components.includes("autoComplete=\"off\""));
  check("PIN is never logged", !/console\.(log|debug|info)\([^)]*pin/i.test(combined)); check("reference uses server path downloader", client.includes("downloadRoutineRunSnapshotImage"));
  check("reference object URL is revoked", components.includes("URL.revokeObjectURL")); check("reference image is lazy", components.includes("loading=\"lazy\""));
  check("dialog is modal", components.includes("aria-modal=\"true\"")); check("dialog traps tab", components.includes("event.key !== \"Tab\"")); check("dialog handles Escape", components.includes("event.key === \"Escape\""));
  check("dialog returns focus", components.includes("returnFocus.current?.focus")); check("sync has aria live", components.includes("aria-live=\"polite\"")); check("auth has assertive live region", components.includes("aria-live=\"assertive\""));
  check("sync label follows connection status instead of transport alone", offlineState.includes("Realtime disconnected") && offlineState.includes("Realtime refresh failed") && offlineState.includes("statusLabel"));
  check("server confirmation is never claimed while disconnected", offlineState.includes('sync.serverConfirmed === true') && offlineState.includes('!["disconnected", "catch_up_failed"].includes(status)') && offlineState.includes("server confirmation pending"));
  check("mobile safe areas applied", css.includes("env(safe-area-inset")); check("all employee buttons have 48px targets", css.includes("min-height:48px"));
  check("mobile width is constrained", css.includes("min-width:0") && css.includes("overflow-x:clip")); check("mobile viewports have no minimum fixed width", !/min-width:\s*(320|375|390|430)px/.test(css));
  check("task titles wrap", css.includes("overflow-wrap:anywhere")); check("dark mode included", css.includes("prefers-color-scheme:dark")); check("sticky progress exists", css.includes("position:sticky"));
  check("task details are collapsed", components.includes("employee-task-group") && components.includes("<details")); check("normal completion has one completion panel", !components.includes("Are you sure you want to complete"));
  check("comments send explicitly", components.includes("Send comment")); check("count input is nonnegative", components.includes("min=\"0\"")); check("typed identity is read only", components.includes("Source identity cannot be changed"));
  check("no uncontrolled JSON editor", !/JSON editor|contentEditable/.test(components)); check("queued status is separate from server confirmed", combined.includes("serverConfirmed: false"));
  check("production workspace does not import test harness", !/Harness|testing\//.test(readFileSync(absolute("src/features/routines-v2/employee/RoutineEmployeeWorkspace.jsx"), "utf8")));
  check("App has no K3 employee logic", !/RoutineEmployee|employee\/Routine/.test(readFileSync(absolute("src/App.jsx"), "utf8")));
}

function modelChecks() {
  const tasks = [{ id: "a", status: "not_started", timingPhase: "available", sortOrder: 2 }, { id: "b", status: "in_progress", sortOrder: 1 },
    { id: "c", status: "blocked", sortOrder: 3, deviationCount: 1 }, { id: "d", status: "completed", outcome: "standard_met", sortOrder: 4 }, { id: "e", status: "not_started", timingPhase: "upcoming", sortOrder: 5 }];
  check("available task groups Do now", taskDisplayGroup(tasks[0]) === "Do now"); check("in-progress task groups In progress", taskDisplayGroup(tasks[1]) === "In progress");
  check("blocked task groups Waiting", taskDisplayGroup(tasks[2]) === "Waiting"); check("terminal task groups Completed", taskDisplayGroup(tasks[3]) === "Completed"); check("upcoming task groups Next", taskDisplayGroup(tasks[4]) === "Next");
  const grouped = groupRoutineTasks(tasks); check("deviation remains in regular group", grouped.groups.Waiting.includes(tasks[2])); check("deviation also appears separately", grouped.groups.Deviations.includes(tasks[2]));
  check("next task follows server sort order", grouped.nextTask.id === "a"); check("technical key is not primary label", taskPrimaryLabel({ task_key_snapshot: "C45", title_snapshot: "Check the front door" }) === "Check the front door");
  check("status has textual label", taskStatusLabel("not_applicable") === "Not applicable"); check("count rejects negative", Boolean(validateRoutineItemDraft({ itemType: "count" }, -1)));
  check("count rejects fraction", Boolean(validateRoutineItemDraft({ itemType: "count" }, 1.5))); check("count accepts zero", validateRoutineItemDraft({ itemType: "count" }, 0) === null);
  check("measurement rejects nonnumber", Boolean(validateRoutineItemDraft({ itemType: "measurement" }, "x"))); check("measurement accepts decimal", validateRoutineItemDraft({ itemType: "measurement" }, "1.5") === null);
  const home = normalizeRoutineEmployeeHome({ operationalClock: { operationalDate: "2026-08-06" }, identity: { actorSource: "personal_auth" }, currentRuns: null, sync: {} });
  check("home defaults arrays", home.currentRuns.length === 0 && home.pendingTransfers.length === 0); check("home preserves server operational date", home.operationalClock.operationalDate === "2026-08-06");
  const context = normalizeRoutineTaskActionContext({ actions: { canStart: { allowed: false, reasonCode: "too_early" } }, items: null });
  check("action denial reason normalizes", context.actions.canStart.reasonCode === "too_early"); check("task items default empty", context.items.length === 0);
  check("stale error classifies", routineEmployeeError(new Error("stale revision 40001")).kind === "stale_write"); check("network error classifies", routineEmployeeError(new Error("Failed to fetch")).kind === "network");
  check("operator reauth classifies", routineEmployeeError(new Error("operator session reauth required")).kind === "operator_auth_required");
}

async function main() {
  sourceChecks(); modelChecks(); command("docker", ["--version"]); docker(["image", "inspect", IMAGE]);
  docker(["run", "--detach", "--rm", "--pull", "never", "--name", CONTAINER, "--network", "none", "--env", `POSTGRES_PASSWORD=${PASSWORD}`, "--env", `POSTGRES_DB=${DATABASE}`, IMAGE]); started = true;
  let ready = false; for (let attempt = 0; attempt < 60; attempt += 1) { const logs = docker(["logs", CONTAINER], { allowFailure: true }); const initialized = /PostgreSQL init process complete; ready for start up/i.test(`${logs.stdout}\n${logs.stderr}`);
    const state = docker(["exec", CONTAINER, "pg_isready", "--username=postgres", `--dbname=${DATABASE}`], { allowFailure: true }); if (initialized && state.status === 0) { ready = true; break; } await new Promise((resolveWait) => setTimeout(resolveWait, 500)); }
  if (!ready) throw new Error("Disposable PostgreSQL did not become ready."); console.log(`PostgreSQL ${scalar("show server_version;")} in network-isolated disposable container`);
  psql("create schema if not exists storage; create table if not exists storage.buckets(id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]); create table if not exists storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null,name text not null,owner_id uuid,metadata jsonb not null default '{}',unique(bucket_id,name)); alter table storage.objects enable row level security; grant usage on schema storage to authenticated,anon; grant select,insert,update,delete on storage.objects to authenticated;");
  for (const path of baseline) psql(readFileSync(absolute(path), "utf8"), { transaction: true });
  psql("alter table public.user_profiles drop constraint if exists user_profiles_role_check; alter table public.user_profiles add constraint user_profiles_role_check check(role in ('manager','shift_lead','event_floor_manager','staff','time2staff','counter')); ");
  for (const path of [paths.foundation, paths.bootstrap, paths.templates, paths.references, paths.runs, paths.lifecycle]) psql(readFileSync(absolute(path), "utf8"), { transaction: true });
  for (const path of [paths.foundationFixture, paths.runFixture, paths.lifecycleFixture]) psql(readFileSync(absolute(path), "utf8"));
  psql(readFileSync(absolute(paths.time), "utf8"), { transaction: true }); psql(readFileSync(absolute(paths.timeFixture), "utf8"));
  psql(readFileSync(absolute(paths.delivery), "utf8"), { transaction: true }); psql(readFileSync(absolute(paths.deliveryFixture), "utf8"));
  psql(readFileSync(absolute(paths.doubleShift), "utf8"), { transaction: true }); psql(readFileSync(absolute(paths.doubleShiftFixture), "utf8"));
  psql("drop publication if exists supabase_realtime; create publication supabase_realtime;"); psql(readFileSync(absolute(paths.sync), "utf8"), { transaction: true }); psql(readFileSync(absolute(paths.syncFixture), "utf8"));
  psql(readFileSync(absolute(paths.identity), "utf8"), { transaction: true }); const pin = validPin(); const material = sessionMaterial("1e300000-0000-4000-8000-000000000001");
  const vars = variables({ test_pin: pin, session_secret_hash: material.secretHash, session_token: material.token }); psql(vars + readFileSync(absolute(paths.identityFixture), "utf8"));
  psql(readFileSync(absolute(paths.ui), "utf8"), { transaction: true }); psql(readFileSync(absolute(paths.manager), "utf8"), { transaction: true });
  const modeBefore = scalar("select mode from public.routine_organization_settings where organization_id='a1000000-0000-4000-8000-000000000001';"); const countsBefore = scalar("select jsonb_build_array((select count(*) from public.routine_templates),(select count(*) from public.routine_runs),(select count(*) from public.routine_run_tasks),(select count(*) from public.routine_bundles));");
  psql(readFileSync(absolute(paths.employee), "utf8"), { transaction: true }); check("K3 preserves mode", scalar("select mode from public.routine_organization_settings where organization_id='a1000000-0000-4000-8000-000000000001';") === modeBefore);
  check("K3 advances manager_preview to staff_preview", scalar("select ui_release_stage from public.routine_organization_settings where organization_id='a1000000-0000-4000-8000-000000000001';") === "staff_preview");
  check("K3 creates no templates runs tasks or bundles", scalar("select jsonb_build_array((select count(*) from public.routine_templates),(select count(*) from public.routine_runs),(select count(*) from public.routine_run_tasks),(select count(*) from public.routine_bundles));") === countsBefore);
  const releaseState = scalar("select md5(jsonb_agg(jsonb_build_array(organization_id,mode,ui_release_stage,ui_contract_version,revision,updated_at) order by organization_id)::text) from public.routine_organization_settings;");
  psql(readFileSync(absolute(paths.employee), "utf8"), { transaction: true }); check("K3 reapply is revision and timestamp stable", scalar("select md5(jsonb_agg(jsonb_build_array(organization_id,mode,ui_release_stage,ui_contract_version,revision,updated_at) order by organization_id)::text) from public.routine_organization_settings;") === releaseState);
  psql("do $test$ begin perform set_config('mesh.routine_ui_release_internal','release',true); update public.routine_organization_settings set ui_release_stage='pilot_ready' where organization_id='b2000000-0000-4000-8000-000000000001'; end $test$;");
  const later = scalar("select jsonb_build_array(ui_release_stage,revision,updated_at) from public.routine_organization_settings where organization_id='b2000000-0000-4000-8000-000000000001';"); psql(readFileSync(absolute(paths.employee), "utf8"), { transaction: true });
  check("K3 does not lower later release stage", scalar("select jsonb_build_array(ui_release_stage,revision,updated_at) from public.routine_organization_settings where organization_id='b2000000-0000-4000-8000-000000000001';") === later);
  psql(vars + readFileSync(absolute(paths.uiFixture), "utf8")); psql(vars + readFileSync(absolute(paths.employeeFixture), "utf8"));
  const assertions = psql(readFileSync(absolute(paths.assertions), "utf8"));
  const sqlPasses = `${assertions.stdout}\n${assertions.stderr}`.split("\n").filter((line) => line.includes("PASS ")); if (sqlPasses.length < MINIMUM_SQL_CHECKS) throw new Error(`Expected at least ${MINIMUM_SQL_CHECKS} SQL passes, received ${sqlPasses.length}.\n${assertions.stdout}\n${assertions.stderr}`);
  passCount += sqlPasses.length; console.log(`PASS ${sqlPasses.length} employee SQL fixture checks`); if (passCount < MINIMUM_CHECKS) throw new Error(`Expected at least ${MINIMUM_CHECKS} checks, received ${passCount}.`);
  console.log(`PASS ${passCount} Phase 10K3 contract checks (minimum ${MINIMUM_CHECKS})`);
}

try { await main(); } catch (error) { console.error(String(error?.stack ?? error).replace(/v1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}/gi, "[REDACTED_OPERATOR_TOKEN]").replace(/\b[0-9]{6,12}\b/g, "[REDACTED_NUMERIC_SECRET]")); process.exitCode = 1; }
finally { cleanup(); console.log("Disposable database cleanup: complete"); }
