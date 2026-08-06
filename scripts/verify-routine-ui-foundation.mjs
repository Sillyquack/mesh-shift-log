import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  isRoutineReadOnlyPreview,
  normalizeRoutineApplicationBootstrap,
  routineLauncherLabel,
  shouldShowRoutineEngineLauncher,
} from "../src/features/routines-v2/data/routineApplicationModel.js";
import { ROUTINE_REALTIME_MODE, subscribeRoutineRealtime } from "../src/features/routines-v2/realtime/routineRealtime.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IMAGE = "public.ecr.aws/supabase/postgres:17.6.1.141";
const DATABASE = "phase10k1_routine_ui_test";
const ROLE = "supabase_admin";
const CONTAINER = `mesh-shift-log-phase10k1-${process.pid}-${randomUUID().slice(0, 8)}`;
const PASSWORD = `phase10k1-${randomUUID()}`;
const EXPECTED_SQL_CHECKS = 90;
const MINIMUM_CHECKS = 120;
let started = false;
let passCount = 0;

const paths = {
  foundation: "supabase/phase10a_routine_engine_foundation.sql",
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
  foundationFixture: "supabase/tests/phase10/foundation-fixtures.sql",
  runFixture: "supabase/tests/phase10/run-snapshot-fixtures.sql",
  lifecycleFixture: "supabase/tests/phase10/lifecycle-fixtures.sql",
  timeFixture: "supabase/tests/phase10/operational-time-fixtures.sql",
  deliveryFixture: "supabase/tests/phase10/delivery-fixtures.sql",
  doubleShiftFixture: "supabase/tests/phase10/double-shift-fixtures.sql",
  syncFixture: "supabase/tests/phase10/sync-offline-fixtures.sql",
  identityFixture: "supabase/tests/phase10/shared-device-fixtures.sql",
  uiFixture: "supabase/tests/phase10/ui-pilot-fixtures.sql",
  assertions: "supabase/tests/phase10/ui-pilot-assertions.sql",
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
  const outcome = spawnSync(name, args, { cwd: ROOT, encoding: "utf8", input: options.input,
    timeout: options.timeout ?? 300_000, stdio: "pipe" });
  if (outcome.error) throw outcome.error;
  if (outcome.status !== 0 && !options.allowFailure) {
    throw new Error(`${name} ${args.join(" ")} failed:\n${outcome.stdout}\n${outcome.stderr}`);
  }
  return outcome;
}
const docker = (args, options) => command("docker", args, options);
function psql(sql, { tuplesOnly = false, transaction = false, allowFailure = false } = {}) {
  const args = ["exec", "-i", CONTAINER, "psql", "--no-psqlrc", "--set=ON_ERROR_STOP=1",
    `--username=${ROLE}`, `--dbname=${DATABASE}`];
  if (tuplesOnly) args.push("--tuples-only", "--no-align", "--quiet");
  if (transaction) args.push("--single-transaction");
  return docker(args, { input: sql, allowFailure });
}
function scalar(sql) { return psql(sql, { tuplesOnly: true }).stdout.trim(); }
function psqlVariables(values) {
  return Object.entries(values).map(([key, value]) => {
    if (!/^[a-z_]+$/.test(key) || !/^[A-Za-z0-9_.-]+$/.test(value)) throw new Error("Unsafe verifier variable.");
    return `\\set ${key} ${value}`;
  }).join("\n") + "\n";
}
function cleanup() {
  if (!started) return;
  if (!/^mesh-shift-log-phase10k1-[0-9]+-[a-f0-9]{8}$/.test(CONTAINER)) throw new Error("Unsafe verifier container name.");
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
  return { sessionId, secretHash: createHash("sha256").update(secret).digest("hex"),
    token: `v1.${sessionId}.${secret.toString("base64url")}` };
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
  from pg_catalog.pg_attribute attribute where attribute.attrelid in(select oid from protected_relations)
   and attribute.attnum>0 and not attribute.attisdropped
 union all select 'k|'||constraint_row.conrelid::regclass::text||'|'||constraint_row.conname||'|'||pg_get_constraintdef(constraint_row.oid,true)
  from pg_catalog.pg_constraint constraint_row where constraint_row.conrelid in(select oid from protected_relations)
 union all select 'p|'||schemaname||'.'||tablename||'|'||policyname||'|'||cmd||'|'||roles::text||'|'||coalesce(qual,'')||'|'||coalesce(with_check,'')
  from pg_catalog.pg_policies where (schemaname,tablename) in(select nspname,relname from protected_relations)
 union all select 'f|'||namespace.nspname||'.'||procedure.proname||'|'||pg_get_function_identity_arguments(procedure.oid)||'|'||pg_get_functiondef(procedure.oid)
  from pg_catalog.pg_proc procedure join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
  where namespace.nspname in('auth','storage') or (namespace.nspname='public' and
    (procedure.proname like 'inventory_%' or procedure.proname like 'asset_%' or procedure.proname like 'event_%'
      or procedure.proname like 'external_calendar_%'))
) select md5(coalesce(string_agg(entry,E'\n' order by entry),'')) from entries;`;

const protectedDataFingerprintSql = String.raw`select md5(
 coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.event_operations value),'[]')||
 coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.event_role_assignments value),'[]')||
 coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.event_responsibility_handovers value),'[]')||
 coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.external_calendar_events value),'[]'));`;

const routineHistoryFingerprintSql = String.raw`select md5(
 coalesce((select jsonb_agg(jsonb_build_array(id,content_hash) order by id)::text from public.routine_template_versions),'[]')||
 coalesce((select jsonb_agg(jsonb_build_array(id,snapshot_hash,timing_snapshot_hash) order by id)::text from public.routine_runs),'[]')||
 coalesce((select jsonb_agg(jsonb_build_array(id,record_hash,delivery_schema_version) order by id)::text from public.routine_delivery_records),'[]')||
 coalesce((select jsonb_agg(jsonb_build_array(id,item_hash,item_schema_version) order by id)::text from public.routine_delivery_items),'[]')||
 coalesce((select jsonb_agg(jsonb_build_array(id,creation_request_hash) order by id)::text from public.routine_bundles),'[]')||
 coalesce((select jsonb_agg(jsonb_build_array(id,run_snapshot_hash_snapshot,timing_snapshot_hash_snapshot,template_content_hash_snapshot) order by id)::text from public.routine_bundle_runs),'[]')||
 coalesce((select jsonb_agg(jsonb_build_array(id,acceptance_hash) order by id)::text from public.routine_event_transfer_acceptances),'[]')||
 coalesce((select jsonb_agg(jsonb_build_array(id,completion_hash) order by id)::text from public.routine_event_transfer_completions),'[]'));`;

function staticSecurityChecks() {
  const migration = readFileSync(absolute(paths.ui), "utf8");
  const clientFiles = [
    "src/features/routines-v2/data/routineApplicationModel.js",
    "src/features/routines-v2/api/routineApplicationClient.js",
    "src/features/routines-v2/hooks/useRoutineApplicationBootstrap.js",
    "src/features/routines-v2/hooks/useRoutineOperatorIdentity.js",
    "src/features/routines-v2/hooks/useRoutineEngineSync.js",
    "src/features/routines-v2/components/RoutineEngineLauncher.jsx",
    "src/features/routines-v2/components/RoutineEngineWorkspace.jsx",
    "src/features/routines-v2/components/RoutineEngineBootstrapGate.jsx",
    "src/features/routines-v2/components/SharedDeviceOperatorGate.jsx",
    "src/features/routines-v2/components/RoutineEnginePreviewHome.jsx",
  ];
  const clients = clientFiles.map((path) => readFileSync(absolute(path), "utf8")).join("\n");
  const combined = `${migration}\n${clients}`;
  const forbidden = [["SUPABASE","SERVICE","ROLE","KEY"].join("_"),["jzueg","kbzgyn","knnvivhia"].join(""),["koala","frog"].join("")];
  if (forbidden.some((marker) => combined.toLowerCase().includes(marker.toLowerCase()))
      || /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./.test(combined)) throw new Error("Production credential or forbidden project marker found.");
  if (/\bexecute\s+(?:format|immediate)/i.test(migration)) throw new Error("Dynamic SQL is forbidden in Phase 10K1.");
  if (/\b(?:insert\s+into|update|delete\s+from|alter\s+table)\s+public\.(?:inventory_|asset_|event_operations|event_role_assignments|event_responsibility_handovers|external_calendar_)/i.test(migration)) throw new Error("Protected domain mutation found.");
  const policies = [...migration.matchAll(/create\s+policy\b[\s\S]*?;/gi)].map((match) => match[0]).join("\n");
  if (/using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\)|organization_id\s+is\s+null/i.test(policies)) throw new Error("Broad or nullable-tenant policy found.");
  if (/grant\s+(?:insert|update|delete)[\s\S]{0,200}\bto\s+authenticated/i.test(migration)) throw new Error("Direct authenticated DML grant found.");
  if (/\.(?:from|insert|update|delete)\s*\(/.test(clients)) throw new Error("Direct table DML/query builder found in Routine UI clients.");
  if (/\b(?:O(?:0[1-9]|[12][0-9]|3[0-7])|C(?:0[1-9]|[1-3][0-9]|4[0-6])|DS0[1-4])\b/.test(migration)) throw new Error("Deferred routine content seed found.");
  console.log("PASS static UI security, production boundary, protected-domain, RLS, DML, and seed checks");
}

function sourceChecks() {
  const model = readFileSync(absolute("src/features/routines-v2/data/routineApplicationModel.js"), "utf8");
  const api = readFileSync(absolute("src/features/routines-v2/api/routineApplicationClient.js"), "utf8");
  const gate = readFileSync(absolute("src/features/routines-v2/components/SharedDeviceOperatorGate.jsx"), "utf8");
  const bootstrapGate = readFileSync(absolute("src/features/routines-v2/components/RoutineEngineBootstrapGate.jsx"), "utf8");
  const preview = readFileSync(absolute("src/features/routines-v2/components/RoutineEnginePreviewHome.jsx"), "utf8");
  const launcher = readFileSync(absolute("src/features/routines-v2/components/RoutineEngineLauncher.jsx"), "utf8");
  const syncHook = readFileSync(absolute("src/features/routines-v2/hooks/useRoutineEngineSync.js"), "utf8");
  const identityHook = readFileSync(absolute("src/features/routines-v2/hooks/useRoutineOperatorIdentity.js"), "utf8");
  const sessionModule = readFileSync(absolute("src/features/routines-v2/auth/routineOperatorSession.js"), "utf8");
  const css = readFileSync(absolute("src/features/routines-v2/components/RoutineEngineShell.css"), "utf8");
  const app = readFileSync(absolute("src/App.jsx"), "utf8");
  const main = readFileSync(absolute("src/main.jsx"), "utf8");
  const harnessHtml = readFileSync(absolute("routine-ui-harness.html"), "utf8");
  const harness = readFileSync(absolute("src/features/routines-v2/testing/routineUiHarnessEntry.jsx"), "utf8");
  const packageJson = JSON.parse(readFileSync(absolute("package.json"), "utf8"));

  check("client constants include all four engine modes", ["legacy","shadow","pilot","active"].every((value) => model.includes(`\"${value}\"`)));
  check("client constants include all five release stages", ["foundation","manager_preview","staff_preview","pilot_ready","production_ready"].every((value) => model.includes(`\"${value}\"`)));
  check("bootstrap normalizer is exported", model.includes("export function normalizeRoutineApplicationBootstrap"));
  check("client model never derives operational date", !/new Date\([^)]*\).*operationalDate|operationalDate.*new Date/s.test(model));
  check("launcher visibility consumes server bootstrap", model.includes("bootstrap.previewAllowed") && model.includes("bootstrap.accessState"));
  check("read-only preview helper consumes server decision", model.includes("bootstrap?.operationalAllowed"));
  check("application API uses central Routine RPC client", api.includes("routineRpcClient.request"));
  check("application API exposes bootstrap", api.includes("get_routine_application_bootstrap"));
  check("application API exposes mode manager RPC", api.includes("set_routine_engine_mode"));
  check("application API exposes membership manager RPC", api.includes("replace_routine_pilot_memberships"));
  check("application API exposes sanitized admin workspace", api.includes("get_routine_pilot_admin_workspace"));
  check("application API has no direct table builder", !/\.(?:from|insert|update|delete)\s*\(/.test(api));
  check("operator PIN input is masked", gate.includes('type="password"'));
  check("operator PIN input is numeric", gate.includes('inputMode="numeric"'));
  check("operator PIN disables autocomplete", gate.includes('autoComplete="off"'));
  check("operator PIN disables correction and spellcheck", gate.includes('autoCorrect="off"') && gate.includes("spellCheck={false}"));
  check("operator PIN state clears after success and failure", (gate.match(/setPin\(\"\"\)/g) ?? []).length >= 2);
  check("operator auth message is generic", gate.includes("Operator sign-in failed") && !gate.includes("pin_hash"));
  check("operator list is keyboard-native", gate.includes('role="radiogroup"') && gate.includes('role="radio"') && gate.includes('type="button"'));
  check("operator list supports arrow, Home and End keys", ["ArrowDown","ArrowRight","ArrowUp","ArrowLeft","Home","End"].every((key) => gate.includes(`\"${key}\"`)));
  check("operator auth status is announced", gate.includes('aria-live="assertive"'));
  check("PIN is never written to browser persistence", !/localStorage|indexedDB/i.test(gate));
  check("session invalidation routes back to operator gate", bootstrapGate.includes("operator_auth_required") && bootstrapGate.includes("SharedDeviceOperatorGate"));
  check("session invalidation clears the token", bootstrapGate.includes('bootstrap.error?.kind === "operator_auth_required"') && bootstrapGate.includes("clearRoutineOperatorSession()"));
  check("invalid operator session has no device-identity fallback", !/fallback.*device|device.*fallback/i.test(`${bootstrapGate}\n${identityHook}`));
  check("session end clears the dedicated token", bootstrapGate.includes("clearRoutineOperatorSession"));
  check("operator switch ends the prior session", bootstrapGate.includes("Operator switched in the Routine Engine UI"));
  check("session end disables sync before its RPC", bootstrapGate.includes("setEndingSession(true)") && bootstrapGate.includes("open: open && !endingSession"));
  check("preview exposes no task lifecycle controls", !/Start Opening|Complete task|Finish run|Start task/.test(preview));
  check("preview states legacy remains active", preview.includes("legacy shift log remains active"));
  check("preview states template editor is deferred", preview.includes("Phase 10K2"));
  check("launcher label is preview-specific in shadow", launcher.includes("routineLauncherLabel"));
  check("launcher backend failure preserves legacy", launcher.includes("current shift log remains available"));
  check("sync hook selects both transports from bootstrap", syncHook.includes("CURSOR_POLLING") && syncHook.includes("POSTGRES_REALTIME"));
  check("shared polling disables BroadcastChannel", syncHook.includes("CURSOR_POLLING ? null"));
  check("sync cleanup unsubscribes", syncHook.includes("subscription.unsubscribe()"));
  check("sync requires an established personal or shared principal", syncHook.includes("personalPrincipal") && syncHook.includes("sharedPrincipal") && syncHook.includes("identity?.session?.id"));
  check("operator client identity uses sessionStorage only", identityHook.includes("sessionStorage") && !identityHook.includes("localStorage"));
  check("operator drafts restore by principal", identityHook.includes("restoreRoutineOfflineDataForPrincipal"));
  check("operator token module persists only in sessionStorage", sessionModule.includes("sessionStorage") && !sessionModule.includes("localStorage") && !sessionModule.includes("indexedDB") && !sessionModule.includes("BroadcastChannel"));
  check("App lazy-loads launcher", app.includes('lazy(() => import("./features/routines-v2/components/RoutineEngineLauncher.jsx"))'));
  check("App lazy-loads workspace", app.includes('lazy(() => import("./features/routines-v2/components/RoutineEngineWorkspace.jsx"))'));
  check("App has one isolated Routine Engine state", (app.match(/useState\(false\).*showRoutineEngine|showRoutineEngine.*useState\(false\)/g) ?? []).length <= 1 && app.includes("const [showRoutineEngine, setShowRoutineEngine] = useState(false)"));
  check("App keeps Inventory lazy loading", app.includes('lazy(() => import("./components/InventoryWorkspace.jsx"))'));
  check("App keeps Event Operations lazy loading", app.includes('lazy(() => import("./components/EventOperationsCockpit.jsx"))'));
  check("App does not auto-open Routine Engine", !app.includes("setShowRoutineEngine(true);\n  useEffect"));
  check("App back action restores legacy context", app.includes('onBack={() => setShowRoutineEngine(false)}'));
  check("Routine UI has a dedicated error boundary", app.includes("RoutineEngineErrorBoundary"));
  check("mobile grid children can shrink", css.includes("min-width: 0"));
  check("touch targets are at least 48px", css.includes("min-height: 48px"));
  check("safe-area padding is present", css.includes("env(safe-area-inset"));
  check("320px breakpoint is explicitly safe", css.includes("max-width: 360px"));
  check("narrow layouts avoid fixed overflow widths", !/(^|[;{]\s*)width:\s*[4-9][0-9]{2}px/m.test(css));
  check("status is represented by text", preview.includes("Read-only preview") && preview.includes("RoutineSyncStatus"));
  check("existing global focus-visible treatment remains", readFileSync(absolute("src/styles.css"), "utf8").includes(":focus-visible"));
  check("dark mode inherits established variables", css.includes("var(--bg)") && readFileSync(absolute("src/styles.css"), "utf8").includes("prefers-color-scheme: dark"));
  check("visual harness is a separate HTML entry", harnessHtml.includes("routineUiHarnessEntry.jsx") && !main.includes("routineUiHarnessEntry") && !app.includes("ROUTINE_UI_HARNESS"));
  check("visual harness contains no production URL or credential", !/supabase\.co|service_role|access_token|refresh_token/i.test(harness));
  check("UI foundation verifier is registered", packageJson.scripts["verify:routine-ui-foundation"] === "node scripts/verify-routine-ui-foundation.mjs");
}

async function modelAndRenderChecks() {
  const manager = normalizeRoutineApplicationBootstrap({ contractVersion:"phase10k1-v1",uiReleaseStage:"foundation",mode:"shadow",
    accessState:"manager_preview",previewAllowed:true,operationalAllowed:false,managerPreviewAllowed:true,organizationId:"a1000000-0000-4000-8000-000000000001",
    identity:{ actorSource:"personal_auth",kind:"personal",displayName:"Preview Manager",role:"manager" },
    capabilities:{ manageConfiguration:true,manageTemplates:true },serverClock:{ serverNow:"2026-08-06T09:00:00Z",timezone:"Europe/Oslo",operationalDate:"2026-08-06",cutoff:"04:00:00" },
    sync:{ mode:"postgres_realtime",realtimeAllowed:true },summaries:{ publishedTemplateCount:0,draftTemplateCount:0,visibleRunCount:0,visibleBundleCount:0,openDeviationCount:0 },emptyStateReason:"no_published_templates" });
  const shared = normalizeRoutineApplicationBootstrap({ contractVersion:"phase10k1-v1",uiReleaseStage:"foundation",mode:"shadow",
    accessState:"read_only_preview",previewAllowed:true,operationalAllowed:false,organizationId:"a1000000-0000-4000-8000-000000000001",
    identity:{ actorSource:"shared_device_operator",kind:"shared",displayName:"Test Operator",role:"staff",effectiveOperatorId:"operator-1",
      device:{label:"Test Workbar"},session:{id:"session-1",expiresAt:"2026-08-06T18:00:00Z",credentialFresh:true} },
    serverClock:{ operationalDate:"2026-08-06",timezone:"Europe/Oslo",cutoff:"04:00" },sync:{ mode:"cursor_polling",cursorPollingRequired:true },summaries:{} });
  const legacy = normalizeRoutineApplicationBootstrap({ mode:"legacy",accessState:"hidden",previewAllowed:false });
  check("normalization is deterministic", JSON.stringify(manager) === JSON.stringify(normalizeRoutineApplicationBootstrap(JSON.parse(JSON.stringify(manager)))));
  check("legacy hides the launcher", !shouldShowRoutineEngineLauncher(legacy));
  check("shadow manager shows the launcher", shouldShowRoutineEngineLauncher(manager));
  check("operator-required state shows a login launcher", shouldShowRoutineEngineLauncher(normalizeRoutineApplicationBootstrap({ mode:"shadow",accessState:"operator_required" })));
  check("shadow launcher label is exact", routineLauncherLabel(manager) === "Routine Engine v2 Preview");
  check("manager shadow is read only", isRoutineReadOnlyPreview(manager));
  check("shared shadow is read only", isRoutineReadOnlyPreview(shared));
  check("capability defaults are deny-by-default", shared.capabilities.performTasks === false && shared.capabilities.manageTemplates === false);
  check("server operational date is preserved exactly", manager.serverClock.operationalDate === "2026-08-06");
  check("manager-only draft count remains numeric", manager.summaries.draftTemplateCount === 0);
  const { createServer } = await import("vite");
  const vite = await createServer({ root: ROOT, appType: "custom", server: { middlewareMode: true }, logLevel: "silent" });
  let RoutineEnginePreviewHome;
  try {
    RoutineEnginePreviewHome = (await vite.ssrLoadModule("/src/features/routines-v2/components/RoutineEnginePreviewHome.jsx")).default;
  } finally { await vite.close(); }
  const managerMarkup = renderToStaticMarkup(React.createElement(RoutineEnginePreviewHome,{bootstrap:manager,syncStatus:{status:"current"}}));
  const sharedMarkup = renderToStaticMarkup(React.createElement(RoutineEnginePreviewHome,{bootstrap:shared,syncStatus:{status:"current"},onEndSession(){},onSwitchOperator(){}}));
  check("manager preview renders its identity", managerMarkup.includes("Preview Manager"));
  check("manager preview renders empty state", managerMarkup.includes("No routine content yet"));
  check("manager preview renders no operational buttons", !/Start Opening|Complete|Finish/.test(managerMarkup));
  check("shared preview renders operator and device", sharedMarkup.includes("Test Operator") && sharedMarkup.includes("Test Workbar"));
  check("shared preview exposes session controls", sharedMarkup.includes("Switch operator") && sharedMarkup.includes("End session"));
  check("shared preview renders server-controlled expiry and freshness", sharedMarkup.includes("Server-controlled operator session") && sharedMarkup.includes("credential fresh"));
  check("preview output has no horizontal inline sizing", !/width:\s*[4-9][0-9]{2}px/.test(`${managerMarkup}${sharedMarkup}`));
}

async function syncChecks() {
  let channelCalls = 0; let removed = 0; let subscribeCallback;
  const channel = { on(){ return this; }, subscribe(callback){ subscribeCallback=callback; callback("SUBSCRIBED"); return this; } };
  const client = { channel(){ channelCalls += 1; return channel; }, removeChannel(){ removed += 1; } };
  const personal = subscribeRoutineRealtime({ organizationId:"a1000000-0000-4000-8000-000000000001",mode:ROUTINE_REALTIME_MODE.POSTGRES_REALTIME,
    client,BroadcastChannelImpl:null,onSignal:async()=>{} });
  check("personal preview creates one Postgres Changes channel", channelCalls===1 && personal.channel===channel);
  check("personal preview reports postgres realtime", personal.mode===ROUTINE_REALTIME_MODE.POSTGRES_REALTIME);
  personal.unsubscribe();
  check("personal preview cleanup removes its channel", removed===1 && typeof subscribeCallback==="function");
  let sharedSignals=0; let scheduled;
  const shared = subscribeRoutineRealtime({ organizationId:"a1000000-0000-4000-8000-000000000001",mode:ROUTINE_REALTIME_MODE.CURSOR_POLLING,
    client,BroadcastChannelImpl:null,onSignal:async()=>{ sharedSignals+=1; },setTimer:(callback)=>{scheduled=callback;return 1;},clearTimer:()=>{},
    windowImpl:{addEventListener(){},removeEventListener(){}} });
  await new Promise((resolveWait)=>setTimeout(resolveWait,0));
  check("shared preview creates no Postgres Changes channel", channelCalls===1 && shared.channel===null);
  check("shared preview performs cursor catch-up", sharedSignals===1);
  check("shared preview schedules polling", typeof scheduled==="function");
  shared.unsubscribe();
  check("shared polling cleanup is callable", true);
}

async function main() {
  for (const path of [...Object.values(paths),...baseline]) if (!existsSync(absolute(path))) throw new Error(`Missing input ${path}`);
  staticSecurityChecks();
  command("docker",["--version"]); docker(["image","inspect",IMAGE]);
  docker(["run","--detach","--rm","--pull","never","--name",CONTAINER,"--network","none",
    "--env",`POSTGRES_PASSWORD=${PASSWORD}`,"--env",`POSTGRES_DB=${DATABASE}`,IMAGE]);
  started=true;
  let ready=false;
  for (let attempt=0;attempt<60;attempt+=1) {
    const logs=docker(["logs",CONTAINER],{allowFailure:true});
    const initialized=/PostgreSQL init process complete; ready for start up/i.test(`${logs.stdout}\n${logs.stderr}`);
    const state=docker(["exec",CONTAINER,"pg_isready","--username=postgres",`--dbname=${DATABASE}`],{allowFailure:true});
    if (initialized&&state.status===0){ready=true;break;}
    await new Promise((resolveWait)=>setTimeout(resolveWait,500));
  }
  if(!ready) throw new Error("Disposable PostgreSQL did not become ready.");
  console.log(`PostgreSQL ${scalar("show server_version;")} in network-isolated disposable container`);
  psql(String.raw`
    create schema if not exists storage;
    create table if not exists storage.buckets(id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]);
    create table if not exists storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null,name text not null,owner_id uuid,metadata jsonb not null default '{}',unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,anon;
    grant select,insert,update,delete on storage.objects to authenticated;
  `);
  for(const path of baseline) psql(readFileSync(absolute(path),"utf8"),{transaction:true});
  psql("alter table public.user_profiles drop constraint if exists user_profiles_role_check; alter table public.user_profiles add constraint user_profiles_role_check check(role in ('manager','shift_lead','event_floor_manager','staff','time2staff','counter')); ");
  for(const path of [paths.foundation,paths.templates,paths.references,paths.runs,paths.lifecycle]) psql(readFileSync(absolute(path),"utf8"),{transaction:true});
  for(const path of [paths.foundationFixture,paths.runFixture,paths.lifecycleFixture]) psql(readFileSync(absolute(path),"utf8"));
  psql(readFileSync(absolute(paths.time),"utf8"),{transaction:true}); psql(readFileSync(absolute(paths.timeFixture),"utf8"));
  psql(readFileSync(absolute(paths.delivery),"utf8"),{transaction:true}); psql(readFileSync(absolute(paths.deliveryFixture),"utf8"));
  psql(readFileSync(absolute(paths.doubleShift),"utf8"),{transaction:true}); psql(readFileSync(absolute(paths.doubleShiftFixture),"utf8"));
  psql("drop publication if exists supabase_realtime; create publication supabase_realtime;");
  psql(readFileSync(absolute(paths.sync),"utf8"),{transaction:true}); psql(readFileSync(absolute(paths.syncFixture),"utf8"));
  psql(readFileSync(absolute(paths.identity),"utf8"),{transaction:true});
  const pin=validPin(); const material=sessionMaterial("1e300000-0000-4000-8000-000000000001");
  const variables=psqlVariables({test_pin:pin,session_secret_hash:material.secretHash,session_token:material.token});
  psql(variables+readFileSync(absolute(paths.identityFixture),"utf8"));

  const protectedSchemaBefore=scalar(protectedSchemaFingerprintSql);
  const protectedDataBefore=scalar(protectedDataFingerprintSql);
  const historyBefore=scalar(routineHistoryFingerprintSql);
  psql(readFileSync(absolute(paths.ui),"utf8"),{transaction:true});
  check("Phase 10K1 preserves protected schema, functions, and policies",protectedSchemaBefore===scalar(protectedSchemaFingerprintSql));
  check("Phase 10K1 preserves Event Operations data",protectedDataBefore===scalar(protectedDataFingerprintSql));
  check("Phase 10K1 preserves historical routine hashes",historyBefore===scalar(routineHistoryFingerprintSql));
  psql(variables+readFileSync(absolute(paths.uiFixture),"utf8"));
  const assertions=psql(variables+readFileSync(absolute(paths.assertions),"utf8"));
  const sqlPasses=`${assertions.stdout}\n${assertions.stderr}`.split("\n").filter((line)=>line.includes("PASS "));
  if(sqlPasses.length!==EXPECTED_SQL_CHECKS) throw new Error(`Expected ${EXPECTED_SQL_CHECKS} SQL passes, received ${sqlPasses.length}.\n${assertions.stdout}\n${assertions.stderr}`);
  passCount+=EXPECTED_SQL_CHECKS;
  console.log(`PASS ${EXPECTED_SQL_CHECKS}/${EXPECTED_SQL_CHECKS} UI pilot SQL fixture checks`);
  const uiStateBefore=scalar(String.raw`select md5(
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_pilot_memberships value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_ui_operations value),'[]')||
    coalesce((select jsonb_agg(jsonb_build_array(organization_id,mode,ui_release_stage,ui_contract_version,revision,updated_at) order by organization_id)::text from public.routine_organization_settings),'[]'));`);
  psql(readFileSync(absolute(paths.ui),"utf8"),{transaction:true});
  check("Phase 10K1 reapplies without data or timestamp changes",uiStateBefore===scalar(String.raw`select md5(
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_pilot_memberships value),'[]')||
    coalesce((select jsonb_agg(to_jsonb(value) order by value.id)::text from public.routine_ui_operations value),'[]')||
    coalesce((select jsonb_agg(jsonb_build_array(organization_id,mode,ui_release_stage,ui_contract_version,revision,updated_at) order by organization_id)::text from public.routine_organization_settings),'[]'));`));
  check("protected schema remains stable after fixtures and reapply",protectedSchemaBefore===scalar(protectedSchemaFingerprintSql));
  check("Event Operations remains stable after fixtures and reapply",protectedDataBefore===scalar(protectedDataFingerprintSql));
  check("historical routine hashes remain stable after fixtures and reapply",historyBefore===scalar(routineHistoryFingerprintSql));
  sourceChecks(); await modelAndRenderChecks(); await syncChecks();
  if(passCount<MINIMUM_CHECKS) throw new Error(`Expected at least ${MINIMUM_CHECKS} checks, received ${passCount}.`);
  console.log(`PASS ${passCount} Phase 10K1 contract checks (minimum ${MINIMUM_CHECKS})`);
}

try { await main(); } catch(error) {
  console.error(String(error?.stack??error).replace(/v1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}/gi,"[REDACTED_OPERATOR_TOKEN]").replace(/\b[0-9]{6,12}\b/g,"[REDACTED_NUMERIC_SECRET]"));
  process.exitCode=1;
} finally { cleanup(); console.log("Disposable database cleanup: complete"); }
