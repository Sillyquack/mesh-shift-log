import React from "react";
import { createRoot } from "react-dom/client";
import RoutineEngineErrorBoundary from "../components/RoutineEngineErrorBoundary.jsx";
import RoutineEngineLauncher from "../components/RoutineEngineLauncher.jsx";
import RoutineEngineWorkspace from "../components/RoutineEngineWorkspace.jsx";
import "../../../styles.css";

const ORGANIZATION_ID = "a1000000-0000-4000-8000-000000000001";
const DEVICE_AUTH_USER_ID = "1e000000-0000-4000-8000-000000000001";
const SESSION_EXPIRY = "2026-08-06T18:00:00.000Z";
const BASE = Object.freeze({
  contractVersion: "phase10k1-v1",
  uiReleaseStage: "foundation",
  mode: "shadow",
  accessReasonCode: "routine_ui_preview_only",
  operationalAllowed: false,
  organizationId: ORGANIZATION_ID,
  capabilities: Object.freeze({
    manageConfiguration: false,
    manageTemplates: false,
    manageReferences: false,
    manageOperators: false,
    coordinateRuns: false,
    performTasks: false,
    eventTransferActions: false,
    offlineNonCritical: false,
  }),
  serverClock: Object.freeze({
    serverNow: "2026-08-06T10:42:00.000Z",
    timezone: "Europe/Oslo",
    operationalDate: "2026-08-06",
    cutoff: "04:00:00",
  }),
  summaries: Object.freeze({
    publishedTemplateCount: 0,
    draftTemplateCount: null,
    visibleRunCount: 0,
    visibleBundleCount: 0,
    openDeviationCount: 0,
  }),
  backendVersion: "phase10k1-v1",
  emptyStateReason: "no_published_templates",
});

const managerBootstrap = Object.freeze({
  ...BASE,
  accessState: "manager_preview",
  previewAllowed: true,
  managerPreviewAllowed: true,
  identity: Object.freeze({ actorSource: "personal_auth", kind: "personal", displayName: "Robert Manager", role: "manager", linkedProfile: { id: "manager-profile" } }),
  capabilities: Object.freeze({ ...BASE.capabilities, manageConfiguration: true, manageTemplates: true, manageReferences: true, manageOperators: true }),
  sync: Object.freeze({ mode: "postgres_realtime", realtimeAllowed: true, cursorPollingRequired: false, offlineAvailable: false }),
  summaries: Object.freeze({ ...BASE.summaries, draftTemplateCount: 0 }),
});

const staffNoAccessBootstrap = Object.freeze({
  ...BASE,
  accessState: "not_authorized",
  accessReasonCode: "routine_ui_membership_required",
  previewAllowed: false,
  managerPreviewAllowed: false,
  identity: Object.freeze({ actorSource: "personal_auth", kind: "personal", displayName: "Staff Member", role: "staff" }),
  sync: Object.freeze({ mode: "disabled", realtimeAllowed: false, cursorPollingRequired: false, offlineAvailable: false }),
});

const operatorRequiredBootstrap = Object.freeze({
  ...BASE,
  accessState: "operator_required",
  accessReasonCode: "routine_operator_required",
  previewAllowed: false,
  managerPreviewAllowed: false,
  identity: Object.freeze({ actorSource: "shared_device", kind: "shared", displayName: "Workbar Device", role: "staff", device: { id: "device-1", label: "Main Bar Workbar", active: true } }),
  sync: Object.freeze({ mode: "disabled", realtimeAllowed: false, cursorPollingRequired: false, offlineAvailable: false }),
});

const sharedBootstrap = Object.freeze({
  ...BASE,
  accessState: "read_only_preview",
  previewAllowed: true,
  managerPreviewAllowed: false,
  identity: Object.freeze({
    actorSource: "shared_device_operator",
    kind: "shared",
    displayName: "Ada Operator",
    role: "staff",
    effectiveOperatorId: "operator-ada",
    device: { id: "device-1", label: "Main Bar Workbar", active: true },
    session: { id: "session-ada", status: "active", expiresAt: SESSION_EXPIRY, idleExpiresAt: SESSION_EXPIRY, lastCredentialVerifiedAt: "2026-08-06T10:40:00.000Z", credentialFresh: true },
  }),
  sync: Object.freeze({ mode: "cursor_polling", realtimeAllowed: false, cursorPollingRequired: true, offlineAvailable: false }),
});

let authenticatedInHarness = false;
const operatorApi = Object.freeze({
  getDeviceContext: async () => ({ ok: true, data: { id: "device-1", label: "Main Bar Workbar", active: true } }),
  registerClient: async () => ({ ok: true, data: {} }),
  getCurrentSession: async () => ({ ok: false, errorCode: "operator_auth_failed" }),
  listOperators: async () => ({ ok: true, data: [
    { id: "operator-ada", displayName: "Ada Operator", role: "staff", locked: false },
    { id: "operator-locked", displayName: "Locked Operator", role: "staff", locked: true },
    { id: "operator-shift-lead", displayName: "Lin Shift Lead", role: "shift_lead", locked: false },
  ] }),
  authenticate: async ({ pin }) => {
    if (!/^\d{6}$/.test(pin)) return { ok: false, errorCode: "operator_auth_failed" };
    authenticatedInHarness = true;
    return { ok: true, data: sharedBootstrap.identity.session };
  },
  endSession: async () => { authenticatedInHarness = false; return { ok: true, data: {} }; },
});

function subscribeCurrent({ onStatus }) {
  queueMicrotask(() => onStatus?.({ status: "current" }));
  return { unsubscribe() {} };
}

function subscribeDisconnected({ onStatus }) {
  queueMicrotask(() => onStatus?.({ status: "disconnected" }));
  return { unsubscribe() {} };
}

const managerLoader = async () => managerBootstrap;
const staffLoader = async () => staffNoAccessBootstrap;
const sharedLoader = async () => sharedBootstrap;
const deviceLoader = async () => authenticatedInHarness ? sharedBootstrap : operatorRequiredBootstrap;
const sessionExpiredLoader = async () => { const error = new Error("operator_auth_failed"); error.kind = "operator_auth_required"; throw error; };
const backendUnavailableLoader = async () => { const error = new Error("Routine RPC is not installed"); error.kind = "backend_not_ready"; throw error; };
const networkUnavailableLoader = async () => { const error = new Error("Network unavailable"); error.kind = "network"; throw error; };

function Workspace({ loader, subscribe = subscribeCurrent, operator = false }) {
  return <RoutineEngineErrorBoundary onBack={() => {}}><RoutineEngineWorkspace
    user={{ loginSource: "supabase_auth", organizationId: ORGANIZATION_ID, authUserId: operator ? DEVICE_AUTH_USER_ID : "manager-user" }}
    onBack={() => {}} onLogout={() => {}} bootstrapLoader={loader} operatorApi={operatorApi} subscribe={subscribe}
  /></RoutineEngineErrorBoundary>;
}

function LauncherFrame({ loader, operator = false }) {
  return <div className="routine-shell"><header className="routine-shell-header"><div><span className="routine-shell-mark">MS</span><span><strong>Mesh Shift Log</strong><small>Legacy workspace remains active</small></span></div></header>
    <RoutineEngineLauncher user={{ loginSource: "supabase_auth", authUserId: operator ? DEVICE_AUTH_USER_ID : "manager-user" }} loader={loader} onOpen={() => {}} />
    <main className="routine-shell-main"><section className="routine-empty-state"><div><h1>Current shift log</h1><p>Opening, Closing, Event Operations and Stock Count remain available here.</p></div></section></main>
  </div>;
}

function Harness() {
  const scenario = new URLSearchParams(globalThis.location.search).get("scenario") || "manager";
  document.body.dataset.routineHarnessScenario = scenario;
  globalThis.__ROUTINE_UI_HARNESS__ = Object.freeze({ scenario });
  if (scenario === "staff-no-access") return <Workspace loader={staffLoader} />;
  if (scenario === "shared-selector" || scenario === "shared-login") return <Workspace loader={deviceLoader} operator />;
  if (scenario === "shared-preview") return <Workspace loader={sharedLoader} operator />;
  if (scenario === "session-expired") return <Workspace loader={sessionExpiredLoader} operator />;
  if (scenario === "backend-unavailable") return <Workspace loader={backendUnavailableLoader} />;
  if (scenario === "network-unavailable") return <Workspace loader={networkUnavailableLoader} />;
  if (scenario === "offline") return <Workspace loader={managerLoader} subscribe={subscribeDisconnected} />;
  if (scenario === "launcher-manager") return <LauncherFrame loader={managerLoader} />;
  if (scenario === "launcher-shared") return <LauncherFrame loader={deviceLoader} operator />;
  return <Workspace loader={managerLoader} />;
}

createRoot(document.getElementById("root")).render(<React.StrictMode><Harness /></React.StrictMode>);
