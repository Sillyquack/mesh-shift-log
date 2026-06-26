import { Component, useEffect, useMemo, useRef, useState } from "react";
import {
  areas,
  defaultRoutines,
  knowledgeBase,
  normalizeRoutineTask,
  normalizeRoutines,
  shiftOptions,
  staffCodes,
} from "./data/routines.js";
import {
  isBackendAuthRequired,
  isSupabaseConfigured,
  supabase,
} from "./lib/supabaseClient.js";
import {
  fetchCurrentUserProfile,
  fetchUserProfiles,
  getCurrentSession,
  isSupabaseAuthConfigured,
  signInWithEmailPassword,
  signOutSupabase,
} from "./lib/supabaseAuthClient.js";
import {
  canAccessManagerDashboard,
  canAcknowledgeAlerts,
  canResolveAlerts,
  canRetryEmailNotification,
  canUseEventFloorDashboard,
  canViewAuthProfiles,
} from "./lib/permissions.js";
import {
  createOrUpdateShiftSession,
  fetchHandoverNotesForDate,
  fetchShiftSessionsForDate,
  fetchTaskCompletionsForDate,
  getBackendShiftMode,
  syncHandoverNote,
  syncTaskCompletion,
} from "./lib/shiftDataClient.js";
import {
  buildDailyReportFromBackend,
  fetchManagerDailyHistory,
  fetchManagerHistoryRange,
} from "./lib/managerHistoryClient.js";
import {
  cleanupSyncedFinancialPendingRecords,
  fetchFinancialSignoffsForDate,
  mergeFinancialSignoffs,
  reviewFinancialSignoff,
  upsertFinancialSignoff,
} from "./lib/financialDataClient.js";
import {
  cleanupSyncedAssetPendingRecords,
  fetchAssetChecksForDate,
  fetchAssetRegistry,
  mergeAssetChecks,
  mergeAssetRegistry,
  upsertAssetCheckRecord,
  upsertAssetRegistryRecord,
} from "./lib/assetDataClient.js";

const APP_VERSION = "0.7.0";
const RELEASE_LABEL = "v0.7.0-phase-5a-financial-signoffs";
const RELEASE_SUMMARY = "financial signoff backend foundation";
const ALERT_SYNC_BUILD = "v0.7.0-auth-backend";
const ALERT_POLL_INTERVAL_SECONDS = 15;
const LOG_KEY = "mesh-shift-logs-v1";
const ROUTINE_KEY = "mesh-routines-v1";
const SESSION_KEY = "mesh-current-user-v1";
const HANDOVER_KEY = "mesh-handover-notes-v1";
const PILOT_NOTICE_KEY = "mesh-pilot-notice-accepted-v1";
const LAST_EXPORT_KEY = "mesh-last-export-at-v1";
const FINISH_KEY = "mesh-shift-finish-records-v1";
const ALERT_KEY = "mesh-local-alerts-v1";
const RESPONSIBLE_KEY = "mesh-shift-responsible-v1";
const STAFF_KEY = "mesh-staff-users-v1";
const SITE_SETTINGS_KEY = "mesh-site-settings-v1";
const SITE_OVERRIDE_KEY = "mesh-site-override-history-v1";
const EVENTS_KEY = "mesh-event-records-v1";
const CASH_SIGNOFF_KEY = "mesh-cash-invoice-signoffs-v1";
const ASSET_REGISTRY_KEY = "mesh-asset-registry-v1";
const ASSET_CHECK_KEY = "mesh-asset-check-records-v1";
const EVENT_TASK_CHECK_KEY = "mesh-event-floor-task-checks-v1";
const weakCodes = new Set([
  "0000",
  "1111",
  "1234",
  "12345",
  "123456",
  "PASSWORD",
  "ADMIN",
  "MANAGER",
  "BOBBY",
]);

const priorityLabels = {
  normal: "Normal",
  important: "Important",
  critical: "Critical",
};

const weekdays = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];
const shiftLabels = Object.fromEntries(
  shiftOptions.map((shift) => [shift.id, shift.label]),
);
const alertCategories = [
  "Stock empty",
  "Equipment broken",
  "Technical issue",
  "Safety/security",
  "POS/register",
  "Cleaning/maintenance",
  "Lost/found item",
  "Other",
];
const alertSeverities = ["Low", "Medium", "Urgent"];
const alertAreas = [
  "Workbar",
  "Cornerbar",
  "Atrium",
  "Kitchen",
  "Toilets",
  "Entrance",
  "POS",
  "Salto/security",
  "Other",
];
const responsibilityTypes = [
  ["overall_shift_lead", "Overall shift lead"],
  ["event_responsible", "Event responsible"],
  ["closing_responsible", "Closing responsible"],
  ["cash_invoice_responsible", "Cash/invoice responsible"],
  ["locking_alarm_responsible", "Locking/alarm responsible"],
  ["asset_check_responsible", "Asset check responsible"],
];
const responsibilityLabels = Object.fromEntries(responsibilityTypes);
const eventVenues = [
  "Atrium",
  "Cornerbar",
  "Workbar",
  "Project rooms",
  "Multiple",
];
const assetTypes = [
  "payment_terminal",
  "ipad_pos",
  "charger",
  "adapter",
  "other",
];
const assetConditions = ["ok", "unstable", "missing", "needs_repair"];
const siteStatuses = {
  on_site: "On site",
  away: "Away from site",
  unknown: "Location unknown",
  off: "Location check off",
  override: "Manager override active",
};

const defaultSiteSettings = {
  siteName: "Youngs / Mesh Youngstorget",
  latitude: "",
  longitude: "",
  radiusMeters: 150,
  locationCheckEnabled: false,
  allowReadOnlyRemoteAccess: true,
  managerOverrideEnabled: true,
};

const defaultAssets = [
  {
    id: "asset-adyen-workbar-1",
    type: "payment_terminal",
    provider: "Adyen",
    model: "AMS1",
    serialNumber: "168231212456",
    expectedVenue: "Workbar",
    expectedStation: "Workbar 1",
    notes:
      "Switches off / turns black and must be dismantled/aired before it turns on again. Looping issue.",
    active: true,
    condition: "unstable",
    defaultRequiredForClosing: true,
  },
  {
    id: "asset-adyen-workbar-2",
    type: "payment_terminal",
    provider: "Adyen",
    model: "AMS1",
    serialNumber: "168231212451",
    expectedVenue: "Workbar",
    expectedStation: "Workbar 2",
    notes:
      "Switches off / turns black and must be dismantled/aired before it turns on again. Looping issue.",
    active: true,
    condition: "unstable",
    defaultRequiredForClosing: true,
  },
  {
    id: "asset-adyen-cornerbar-1",
    type: "payment_terminal",
    provider: "Adyen",
    model: "AMS1",
    serialNumber: "TBD",
    expectedVenue: "Cornerbar",
    expectedStation: "Bar 1",
    notes: "Missing in migration backlog.",
    active: true,
    condition: "missing",
    defaultRequiredForClosing: true,
  },
  {
    id: "asset-zettle-bar-1",
    type: "payment_terminal",
    provider: "Zettle / PayPal",
    model: "Terminal",
    serialNumber: "2121051670",
    expectedVenue: "Cornerbar",
    expectedStation: "Bar 1",
    notes: "Youngs Bar 1",
    active: true,
    condition: "ok",
    defaultRequiredForClosing: true,
  },
  {
    id: "asset-zettle-bar-2",
    type: "payment_terminal",
    provider: "Zettle / PayPal",
    model: "Terminal",
    serialNumber: "2120006747",
    expectedVenue: "Cornerbar",
    expectedStation: "Bar 2",
    notes: "Youngs Bar 2",
    active: true,
    condition: "ok",
    defaultRequiredForClosing: true,
  },
  {
    id: "asset-zettle-popup",
    type: "payment_terminal",
    provider: "Zettle / PayPal",
    model: "Terminal",
    serialNumber: "2121051649",
    expectedVenue: "Pop-up",
    expectedStation: "Pop-up",
    notes: "Youngs Pop-up",
    active: true,
    condition: "ok",
    defaultRequiredForClosing: true,
  },
  ...[
    "Workbar iPad/POS 1",
    "Workbar iPad/POS 2",
    "Cornerbar iPad/POS 1",
    "Cornerbar iPad/POS 2",
    "Pop-up iPad/POS",
  ].map((name) => ({
    id: `asset-${slug(name)}`,
    type: "ipad_pos",
    provider: "Apple",
    model: name,
    serialNumber: "TBD",
    expectedVenue: name.startsWith("Cornerbar")
      ? "Cornerbar"
      : name.startsWith("Pop-up")
        ? "Pop-up"
        : "Workbar",
    expectedStation: name,
    notes: "Placeholder iPad/POS asset.",
    active: true,
    condition: "ok",
    defaultRequiredForClosing: true,
  })),
];

const weeklyEventTasks = [
  "Check microphone batteries and charging",
  "Check HDMI/adapters/event cables",
  "Check event signage",
  "Check event storage",
  "Check bar/event fridge layout",
  "Check missing/damaged tech list",
  "Check that event iPads/terminals are where expected",
];
const monthlyEventTasks = [
  "Test full event tech flow",
  "Review event equipment inventory",
  "Review recurring event issues",
  "Check spare batteries/cables/adapters",
  "Review venue reset standards",
];

const blankTask = {
  title: "",
  description: "",
  shiftType: "opening",
  section: "Opening 07:00-08:00",
  timeBlock: "Opening 07:00-08:00",
  area: "general",
  priority: "normal",
  inputType: "none",
  requiresComment: false,
  criticalConfirm: false,
  managerOnly: false,
  active: true,
};

const blankStaffForm = {
  id: "",
  name: "",
  role: "staff",
  code: "",
  isManager: false,
  needsName: false,
  active: true,
};

const blankEventForm = {
  id: "",
  eventName: "",
  client: "",
  venue: "Atrium",
  startTime: "",
  endTime: "",
  expectedGuests: "",
  eventResponsible: "",
  closingResponsible: "",
  cashInvoiceResponsible: "",
  lockingResponsible: "",
  julieLeads: false,
  notes: "",
};

const blankCashForm = {
  tableCreated: "",
  salesPunched: "",
  invoiceSent: "",
  settlementPerformed: "",
  settlementPerformedBy: "",
  signedOffBy: "",
  comments: "",
};

const blankAssetForm = {
  id: "",
  type: "payment_terminal",
  provider: "",
  model: "",
  serialNumber: "",
  expectedVenue: "Workbar",
  expectedStation: "",
  notes: "",
  active: true,
  condition: "ok",
  defaultRequiredForClosing: true,
};

function todayKey() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBackupTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function backupFilename(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `mesh-shift-log-backup-${year}-${month}-${day}-${hours}${minutes}.json`;
}

function readStorage(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function saveStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function groupBy(items, keyGetter) {
  return items.reduce((groups, item) => {
    const key = keyGetter(item);
    groups[key] = groups[key] || [];
    groups[key].push(item);
    return groups;
  }, {});
}

function taskRunsToday(task, date) {
  if (!task.recurring || task.recurring.type === "daily") return true;
  if (task.recurring.type === "weekdays") {
    const weekday = weekdays[new Date(`${date}T12:00:00`).getDay()];
    return task.recurring.days?.includes(weekday);
  }
  if (task.recurring.type === "specific_days") {
    return task.recurring.days?.includes(date);
  }
  return true;
}

function flattenTasks(routines, shiftType, date = todayKey()) {
  return normalizeRoutines(routines)
    .filter((section) => section.shiftType === shiftType)
    .flatMap((section) =>
      section.tasks.map((task) => normalizeRoutineTask(task, section)),
    )
    .filter((task) => task.active !== false && taskRunsToday(task, date));
}

function getTaskLog(logs, date, taskId) {
  return logs.find((log) => log.date === date && log.taskId === taskId);
}

function isHandled(log) {
  return log?.status === "done" || log?.status === "not_relevant";
}

function taskNeedsInput(task) {
  return task.inputType && task.inputType !== "none";
}

function hasDeviation(log) {
  if (!log) return false;
  if (log.status === "not_relevant") return true;
  if (log.comment) return true;
  if (!log.input) return false;
  if (log.inputType === "yesno") return log.input === "No";
  return ["number", "text", "comment"].includes(log.inputType);
}

function criticalConfirmMessage(task) {
  const seriousAreas = ["security", "pos", "salto", "kitchen", "event"];
  const isSerious =
    seriousAreas.includes(task.area) ||
    task.section.toLowerCase().includes("security");
  const warning = isSerious
    ? "This is a critical closing/security, financial or food safety task. Confirm only when you have physically checked it."
    : "This is a critical task. Confirm only when you have physically checked it.";
  return `${task.title}\n\n${warning}`;
}

function normalizeLogs(logs) {
  if (!Array.isArray(logs)) return [];
  return logs
    .filter((log) => log && log.date && log.taskId)
    .map((log) => ({
      ...log,
      status: log.status || "done",
      localId:
        log.localId ||
        log.local_id ||
        log.id ||
        `${log.date}-${log.shiftType || "shift"}-${log.taskId}`,
      backendId: log.backendId || log.backend_id || "",
      shiftSessionBackendId:
        log.shiftSessionBackendId || log.shift_session_id || "",
      syncStatus: log.syncStatus || "local_only",
      syncError: log.syncError || "",
      updatedAt: log.updatedAt || log.completedAt || `${log.date}T00:00:00`,
      completedAt: log.completedAt || `${log.date}T00:00:00`,
      completedBy: log.completedBy || "Unknown",
      completedByAuthUserId:
        log.completedByAuthUserId || log.completed_by_auth_user_id || "",
      completedByProfileId:
        log.completedByProfileId || log.completed_by_profile_id || "",
      criticalConfirmed: Boolean(log.criticalConfirmed),
      input: log.input ?? log.comment ?? "",
      comment: log.comment ?? "",
    }));
}

function normalizeHandovers(notes) {
  if (!notes || typeof notes !== "object" || Array.isArray(notes)) return {};
  return Object.fromEntries(
    Object.entries(notes).map(([key, note]) => {
      if (!note || typeof note !== "object") return [key, note];
      return [
        key,
        {
          ...note,
          id: note.id || note.localId || key,
          localId: note.localId || note.local_id || note.id || key,
          backendId: note.backendId || note.backend_id || "",
          shiftSessionBackendId:
            note.shiftSessionBackendId || note.shift_session_id || "",
          syncStatus: note.syncStatus || "local_only",
          syncError: note.syncError || "",
          updatedAt: note.updatedAt || note.updated_at || "",
          createdByAuthUserId:
            note.createdByAuthUserId || note.created_by_auth_user_id || "",
          createdByProfileId:
            note.createdByProfileId || note.created_by_profile_id || "",
        },
      ];
    }),
  );
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeStaffUsers(value) {
  const storedUsers = Array.isArray(value) && value.length ? value : [];
  const source = storedUsers.length
    ? [
        ...storedUsers,
        ...staffCodes.filter(
          (defaultStaff) =>
            !storedUsers.some(
              (staff) =>
                String(staff.code || "").toLowerCase() ===
                  defaultStaff.code.toLowerCase() ||
                String(staff.name || "").toLowerCase() ===
                  defaultStaff.name.toLowerCase(),
            ),
        ),
      ]
    : staffCodes;
  return source
    .filter((staff) => staff && typeof staff === "object")
    .map((staff, index) => ({
      ...staff,
      id:
        staff.id || `staff-${slug(staff.name || staff.code || String(index))}`,
      name: staff.name || "Unnamed staff",
      role: staff.role || (staff.isManager ? "manager" : "staff"),
      code: String(staff.code || "").trim(),
      isManager: Boolean(staff.isManager),
      needsName: Boolean(staff.needsName),
      active: staff.active !== false,
    }));
}

function appUserFromProfile(profile, authUser) {
  const role = profile.role || "staff";
  const displayName =
    profile.display_name || authUser?.email || "Supabase user";
  return {
    id: `auth-${profile.id}`,
    name: displayName,
    role,
    code: profile.staff_code_alias || "",
    isManager: role === "manager",
    isEventFloorManager: role === "event_floor_manager",
    needsName: role === "time2staff",
    active: profile.active !== false,
    backendUserId: profile.id,
    authUserId: authUser?.id || profile.id,
    organizationId: profile.organization_id || "",
    organization_id: profile.organization_id || "",
    profileActive: profile.active !== false,
    loginSource: "supabase_auth",
    email: authUser?.email || "",
  };
}

function shortId(value) {
  const text = String(value || "");
  if (text.length <= 12) return text || "None";
  return `${text.slice(0, 8)}...${text.slice(-4)}`;
}

function validateStaffUsers(users) {
  if (!Array.isArray(users)) throw new Error("Staff users must be an array.");
  const seenCodes = new Set();
  users.forEach((staff) => {
    if (!staff || typeof staff !== "object")
      throw new Error("Each staff user must be an object.");
    if (!String(staff.name || "").trim())
      throw new Error("Each staff user needs a display name.");
    const code = String(staff.code || "").trim();
    if (!code) throw new Error("Each staff user needs a code.");
    if (code.length < 4)
      throw new Error(`Code for ${staff.name} must be at least 4 characters.`);
    if (weakCodes.has(code.toUpperCase()))
      throw new Error(`Code for ${staff.name} is too easy to guess.`);
    if (seenCodes.has(code.toLowerCase()))
      throw new Error(`Duplicate staff code found for ${staff.name}.`);
    seenCodes.add(code.toLowerCase());
  });
}

function normalizeAlerts(value) {
  return normalizeArray(value)
    .filter((alert) => alert && typeof alert === "object")
    .map((alert, index) => ({
      ...alert,
      id:
        alert.id ||
        alert.backendId ||
        alert.localId ||
        alert.local_id ||
        `imported-alert-${index}-${Date.now()}`,
      backendId: alert.backendId || alert.backend_id || "",
      localId:
        alert.localId ||
        alert.local_id ||
        alert.id ||
        `imported-alert-${index}-${Date.now()}`,
      date: alert.date || todayKey(),
      createdAt: alert.createdAt || `${alert.date || todayKey()}T00:00:00`,
      createdBy: alert.createdBy || "Unknown",
      category: alert.category || "Other",
      severity: alert.severity || "Medium",
      area: alert.area || "Other",
      message: alert.message || "",
      needsImmediateHelp: Boolean(alert.needsImmediateHelp),
      status: alert.status || "open",
      managerNote: alert.managerNote || "",
      acknowledgedBy: alert.acknowledgedBy || "",
      acknowledgedAt: alert.acknowledgedAt || "",
      resolvedBy: alert.resolvedBy || "",
      resolvedAt: alert.resolvedAt || "",
      updatedAt: alert.updatedAt || "",
      createdByAuthUserId:
        alert.createdByAuthUserId || alert.created_by_auth_user_id || "",
      acknowledgedByAuthUserId:
        alert.acknowledgedByAuthUserId ||
        alert.acknowledged_by_auth_user_id ||
        "",
      resolvedByAuthUserId:
        alert.resolvedByAuthUserId || alert.resolved_by_auth_user_id || "",
      lastUpdatedByAuthUserId:
        alert.lastUpdatedByAuthUserId ||
        alert.last_updated_by_auth_user_id ||
        "",
      syncStatus:
        alert.syncStatus ||
        (isSupabaseConfigured && !(alert.backendId || alert.backend_id)
          ? isBackendAuthRequired
            ? "pending_auth"
            : "pending"
          : "synced"),
      lastSyncError: alert.lastSyncError || "",
      lastSyncAttemptAt: alert.lastSyncAttemptAt || "",
      emailNotificationStatus:
        alert.emailNotificationStatus ||
        alert.email_notification_status ||
        "not_required",
      emailNotificationAttemptedAt:
        alert.emailNotificationAttemptedAt ||
        alert.email_notification_attempted_at ||
        "",
      emailNotificationError:
        alert.emailNotificationError || alert.email_notification_error || "",
    }));
}

function alertFromSupabase(row) {
  return {
    id: row.id,
    backendId: row.id,
    localId: row.local_id || row.id,
    date: row.alert_date,
    createdAt: row.created_at,
    createdBy: row.created_by,
    category: row.category,
    severity: row.severity,
    area: row.area,
    message: row.message,
    needsImmediateHelp: Boolean(row.needs_immediate_help),
    status: row.status || "open",
    managerNote: row.manager_note || "",
    acknowledgedBy: row.acknowledged_by || "",
    acknowledgedAt: row.acknowledged_at || "",
    resolvedBy: row.resolved_by || "",
    resolvedAt: row.resolved_at || "",
    updatedAt: row.updated_at || "",
    createdByAuthUserId: row.created_by_auth_user_id || "",
    acknowledgedByAuthUserId: row.acknowledged_by_auth_user_id || "",
    resolvedByAuthUserId: row.resolved_by_auth_user_id || "",
    lastUpdatedByAuthUserId: row.last_updated_by_auth_user_id || "",
    syncStatus: "synced",
    lastSyncError: "",
    lastSyncAttemptAt: "",
    emailNotificationStatus: row.email_notification_status || "not_required",
    emailNotificationAttemptedAt: row.email_notification_attempted_at || "",
    emailNotificationError: row.email_notification_error || "",
  };
}

function alertToSupabase(alert) {
  return {
    local_id: alert.localId || alert.id,
    alert_date: alert.date,
    created_at: alert.createdAt,
    created_by: alert.createdBy,
    category: alert.category,
    severity: alert.severity,
    area: alert.area,
    message: alert.message,
    needs_immediate_help: Boolean(alert.needsImmediateHelp),
    status: alert.status || "open",
    manager_note: alert.managerNote || null,
    acknowledged_by: alert.acknowledgedBy || null,
    acknowledged_at: alert.acknowledgedAt || null,
    resolved_by: alert.resolvedBy || null,
    resolved_at: alert.resolvedAt || null,
    created_by_auth_user_id: alert.createdByAuthUserId || null,
    acknowledged_by_auth_user_id: alert.acknowledgedByAuthUserId || null,
    resolved_by_auth_user_id: alert.resolvedByAuthUserId || null,
    last_updated_by_auth_user_id: alert.lastUpdatedByAuthUserId || null,
    email_notification_status: alert.emailNotificationStatus || "not_required",
    email_notification_attempted_at: alert.emailNotificationAttemptedAt || null,
    email_notification_error: alert.emailNotificationError || null,
  };
}

function alertIdentity(alert) {
  return String(alert.backendId || alert.localId || alert.id);
}

function alertMatch(a, b) {
  const aIds = [a.backendId, a.id, a.localId].filter(Boolean).map(String);
  const bIds = [b.backendId, b.id, b.localId].filter(Boolean).map(String);
  return aIds.some((id) => bIds.includes(id));
}

function alertFreshness(alert) {
  return Math.max(
    new Date(alert.updatedAt || 0).getTime() || 0,
    new Date(alert.createdAt || 0).getTime() || 0,
    new Date(alert.lastSyncAttemptAt || 0).getTime() || 0,
  );
}

export default function AppWithBoundary() {
  return (
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  );
}

function recordFreshness(record) {
  return Math.max(
    new Date(record.updatedAt || 0).getTime() || 0,
    new Date(record.completedAt || 0).getTime() || 0,
    new Date(record.finishedAt || 0).getTime() || 0,
  );
}

function taskLogIdentity(log) {
  return [
    log.date || "",
    log.shiftType || "",
    log.taskId || "",
    log.completedByAuthUserId ||
      log.completedByProfileId ||
      log.completedBy ||
      "",
  ].join("__");
}

function dashboardTaskIdentity(log) {
  return [log.date || "", log.shiftType || "", log.taskId || ""].join("__");
}

function preferredRecord(existing, candidate) {
  if (!existing) return candidate;
  if (
    ["pending_backend", "pending_auth", "sync_error"].includes(
      existing.syncStatus,
    ) &&
    recordFreshness(existing) > recordFreshness(candidate)
  ) {
    return existing;
  }
  return recordFreshness(candidate) >= recordFreshness(existing)
    ? candidate
    : existing;
}

function uniqueTaskLogsForDashboard(logs) {
  const merged = new Map();
  normalizeLogs(logs).forEach((log) => {
    const key = dashboardTaskIdentity(log);
    merged.set(key, preferredRecord(merged.get(key), log));
  });
  return [...merged.values()];
}

function mergeTaskLogsWithStats(localLogs, backendLogs) {
  const merged = new Map();
  const logicalKeys = new Map();
  let ignoredDuplicates = 0;
  normalizeLogs(localLogs).forEach((log) => {
    const key = log.localId || log.backendId || log.id || taskLogIdentity(log);
    merged.set(key, log);
    logicalKeys.set(taskLogIdentity(log), key);
  });
  normalizeLogs(backendLogs).forEach((backendLog) => {
    const logicalKey = taskLogIdentity(backendLog);
    const directKey =
      backendLog.localId || backendLog.backendId || backendLog.id || logicalKey;
    const key = merged.has(directKey)
      ? directKey
      : logicalKeys.get(logicalKey) || directKey;
    const existing = merged.get(key);
    if (existing) ignoredDuplicates += 1;
    const preferred = preferredRecord(existing, {
      ...backendLog,
      syncStatus: "synced",
    });
    merged.set(key, {
      ...existing,
      ...preferred,
      syncStatus: preferred.syncStatus || "synced",
    });
    logicalKeys.set(logicalKey, key);
  });
  return { records: [...merged.values()], ignoredDuplicates };
}

function mergeTaskLogs(localLogs, backendLogs) {
  return mergeTaskLogsWithStats(localLogs, backendLogs).records;
}

function handoverIdentity(note) {
  return (
    note.localId ||
    note.id ||
    `${note.date}-${note.shiftType}-${note.completedBy}`
  );
}

function handoverLogicalIdentity(note) {
  return [
    note.date || "",
    note.shiftType || "",
    note.createdByAuthUserId ||
      note.createdByProfileId ||
      note.completedBy ||
      note.createdBy ||
      "",
  ].join("__");
}

function mergeHandoverNotes(localNotes, backendNotes) {
  const merged = normalizeHandovers(localNotes);
  const logicalKeys = new Map();
  Object.entries(merged).forEach(([key, note]) => {
    logicalKeys.set(handoverLogicalIdentity(note), key);
  });
  backendNotes.forEach((backendNote) => {
    const key = handoverIdentity(backendNote);
    const logicalKey = handoverLogicalIdentity(backendNote);
    const existingKey =
      Object.keys(merged).find(
        (itemKey) => handoverIdentity(merged[itemKey]) === key,
      ) ||
      logicalKeys.get(logicalKey) ||
      key;
    const existing = merged[existingKey];
    if (
      existing &&
      ["pending_backend", "pending_auth", "sync_error"].includes(
        existing.syncStatus,
      ) &&
      recordFreshness(existing) > recordFreshness(backendNote)
    ) {
      return;
    }
    merged[existingKey] = { ...existing, ...backendNote, syncStatus: "synced" };
    logicalKeys.set(logicalKey, existingKey);
  });
  return merged;
}

function mergeAlertCaches(localAlerts, backendAlerts) {
  const merged = new Map();
  normalizeAlerts(localAlerts).forEach((alert) => {
    merged.set(alertIdentity(alert), alert);
  });
  normalizeAlerts(backendAlerts).forEach((backendAlert) => {
    const matchingKey = [...merged.keys()].find((key) => {
      const localAlert = merged.get(key);
      return alertMatch(localAlert, backendAlert);
    });
    const localAlert = matchingKey ? merged.get(matchingKey) : null;
    if (
      localAlert?.syncStatus === "pending" &&
      alertFreshness(localAlert) > alertFreshness(backendAlert)
    ) {
      merged.set(matchingKey, localAlert);
      return;
    }
    if (matchingKey) merged.delete(matchingKey);
    merged.set(alertIdentity(backendAlert), backendAlert);
  });
  return [...merged.values()].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  );
}

function alertSyncCounts(alertList) {
  const normalized = normalizeAlerts(alertList);
  return {
    localCachedAlertCount: normalized.length,
    unsyncedLocalAlertCount: normalized.filter(
      (alert) => alert.syncStatus === "pending",
    ).length,
    pendingAuthAlertCount: normalized.filter(
      (alert) => alert.syncStatus === "pending_auth",
    ).length,
    localOnlyAlertCount: normalized.filter(
      (alert) => alert.syncStatus === "local_only",
    ).length,
  };
}

function backendSourceLabel(source) {
  return (
    {
      supabase: "Supabase",
      local_cache: "Local cache",
      local_fallback: "Local only",
      auth_required: "Auth required",
      sync_error: "Sync error",
    }[source] ||
    source ||
    "Unknown"
  );
}

function isBackendAuthError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "backend_auth_required" ||
    message.includes("401") ||
    message.includes("403") ||
    message.includes("permission denied") ||
    message.includes("row-level security") ||
    message.includes("violates row-level security")
  );
}

function normalizeSiteSettings(value) {
  return {
    ...defaultSiteSettings,
    ...(value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {}),
    radiusMeters: Number(
      value?.radiusMeters || defaultSiteSettings.radiusMeters,
    ),
    locationCheckEnabled: Boolean(value?.locationCheckEnabled),
    allowReadOnlyRemoteAccess: value?.allowReadOnlyRemoteAccess !== false,
    managerOverrideEnabled: value?.managerOverrideEnabled !== false,
  };
}

function normalizeAssets(value) {
  const storedAssets = Array.isArray(value) && value.length ? value : [];
  const source = storedAssets.length
    ? [
        ...storedAssets,
        ...defaultAssets.filter(
          (defaultAsset) =>
            !storedAssets.some(
              (asset) =>
                asset.id === defaultAsset.id ||
                (asset.serialNumber &&
                  defaultAsset.serialNumber !== "TBD" &&
                  asset.serialNumber === defaultAsset.serialNumber),
            ),
        ),
      ]
    : defaultAssets;
  return source.map((asset, index) => ({
    ...asset,
    id: asset.id || `asset-${index}-${Date.now()}`,
    type: asset.type || "other",
    provider: asset.provider || "",
    model: asset.model || "",
    serialNumber: asset.serialNumber || "",
    expectedVenue: asset.expectedVenue || "Storage",
    expectedStation:
      asset.expectedStation || asset.expectedStationRegister || "",
    notes: asset.notes || "",
    active: asset.active !== false,
    condition: asset.condition || "ok",
    defaultRequiredForClosing: asset.defaultRequiredForClosing !== false,
  }));
}

function normalizeEvents(value) {
  return normalizeArray(value).map((event, index) => ({
    ...blankEventForm,
    ...event,
    id: event.id || `event-${index}-${Date.now()}`,
    date: event.date || todayKey(),
  }));
}

function normalizeRecords(value) {
  return normalizeArray(value).filter(
    (record) => record && typeof record === "object",
  );
}

function isOverrideActive(history) {
  const activeOverride = normalizeRecords(history)
    .filter(
      (entry) =>
        entry.expiresAt && new Date(entry.expiresAt).getTime() > Date.now(),
    )
    .sort((a, b) => new Date(b.expiresAt) - new Date(a.expiresAt))[0];
  return activeOverride || null;
}

function toRadians(value) {
  return (Number(value) * Math.PI) / 180;
}

function distanceMeters(fromLat, fromLng, toLat, toLng) {
  const earthRadius = 6371000;
  const dLat = toRadians(toLat - fromLat);
  const dLng = toRadians(toLng - fromLng);
  const lat1 = toRadians(fromLat);
  const lat2 = toRadians(toLat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function assetHasIssue(check) {
  return (
    check &&
    (check.present === "no" ||
      check.correctLocation === "no" ||
      ["damaged", "not_working", "missing"].includes(check.condition) ||
      check.charging === "no")
  );
}

function assetCheckDashboardIdentity(record) {
  return [
    record.date || "",
    record.shiftType || "",
    record.eventId || "",
    record.assetLocalId || record.assetId || record.assetLabel || "",
  ].join("__");
}

function preferredAssetCheck(existing, candidate) {
  if (!existing) return candidate;

  const existingScore =
    (existing.backendId || existing.assetBackendId ? 2 : 0) +
    (existing.syncStatus === "synced" ? 1 : 0);
  const candidateScore =
    (candidate.backendId || candidate.assetBackendId ? 2 : 0) +
    (candidate.syncStatus === "synced" ? 1 : 0);

  if (candidateScore !== existingScore)
    return candidateScore > existingScore ? candidate : existing;

  return recordFreshness(candidate) >= recordFreshness(existing)
    ? candidate
    : existing;
}

function uniqueAssetChecksForDashboard(records) {
  const merged = new Map();

  normalizeRecords(records).forEach((record) => {
    const key = assetCheckDashboardIdentity(record);
    merged.set(key, preferredAssetCheck(merged.get(key), record));
  });

  return [...merged.values()].sort(
    (a, b) =>
      recordFreshness(b) - recordFreshness(a) ||
      new Date(b.signedOffAt || 0) - new Date(a.signedOffAt || 0),
  );
}

function handoverHasContent(note) {
  return Boolean(
    note &&
    [note.nextShift, note.lowStock, note.maintenance, note.memberEvent].some(
      (value) => value?.trim(),
    ),
  );
}

function validateHandoverImport(notes) {
  if (!notes || typeof notes !== "object" || Array.isArray(notes)) {
    throw new Error("Handover notes must be an object.");
  }
}

function validateRoutineImport(data) {
  if (!Array.isArray(data))
    throw new Error("Routine file must contain an array.");
  if (data.length === 0) throw new Error("Routine file is empty.");
  const invalidSection = data.find(
    (section) =>
      !section || typeof section !== "object" || !Array.isArray(section.tasks),
  );
  if (invalidSection)
    throw new Error(
      "Each routine section must be an object with a tasks array.",
    );
  const invalidTask = data
    .flatMap((section) => section.tasks)
    .find((task) => !task || typeof task !== "object" || !task.title);
  if (invalidTask)
    throw new Error("Each routine task must be an object with a title.");
}

function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function routinesUseDefaults(routines) {
  return (
    JSON.stringify(normalizeRoutines(routines)) ===
    JSON.stringify(normalizeRoutines(defaultRoutines))
  );
}

function validateStaffCode(code, staffUsers, editingId = "") {
  const normalizedCode = String(code || "").trim();
  if (!normalizedCode) return "Code cannot be blank.";
  if (normalizedCode.length < 4) return "Code must be at least 4 characters.";
  if (weakCodes.has(normalizedCode.toUpperCase()))
    return "This code is too easy to guess.";
  const duplicate = staffUsers.find(
    (staff) =>
      staff.id !== editingId &&
      staff.code.toLowerCase() === normalizedCode.toLowerCase(),
  );
  if (duplicate) return `Code already belongs to ${duplicate.name}.`;
  return "";
}

function generateStaffCode(staffUsers) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    if (!validateStaffCode(code, staffUsers)) return code;
  }
  return String(Date.now()).slice(-6);
}

function finishKey(date, shiftType, finishedBy) {
  return `${date}-${shiftType}-${finishedBy}`;
}

function isResponsibleUser(user, assignment) {
  if (!user || !assignment?.responsibleName) return false;
  return (
    user.name.toLowerCase() === assignment.responsibleName.toLowerCase() ||
    user.staffName?.toLowerCase() === assignment.responsibleName.toLowerCase()
  );
}

function getShiftStats(tasks, logsByTask) {
  const done = tasks.filter(
    (task) => logsByTask[task.id]?.status === "done",
  ).length;
  const notRelevant = tasks.filter(
    (task) => logsByTask[task.id]?.status === "not_relevant",
  ).length;
  const handled = done + notRelevant;
  const missing = Math.max(tasks.length - handled, 0);
  const criticalMissing = tasks.filter(
    (task) => task.priority === "critical" && !isHandled(logsByTask[task.id]),
  ).length;
  return { done, notRelevant, handled, missing, criticalMissing };
}

function alertStatus(alert) {
  return alert.status || "open";
}

function isOpenAlert(alert) {
  return alertStatus(alert) === "open";
}

function isUrgentAlert(alert) {
  return alert.severity === "Urgent" || alert.needsImmediateHelp;
}

function alertNeedsEmail(alert) {
  return alert.severity === "Urgent" || alert.needsImmediateHelp === true;
}

function emailStatusLabel(alert) {
  if (!alertNeedsEmail(alert)) return "";
  return (
    {
      sent: "Email notification sent",
      pending: "Email notification pending",
      failed: "Email notification failed",
      not_required: "Email not configured / failed",
    }[alert.emailNotificationStatus] || "Email not configured / failed"
  );
}

function groupAlerts(alerts) {
  return {
    openUrgent: alerts.filter(
      (alert) => isOpenAlert(alert) && isUrgentAlert(alert),
    ),
    openNormal: alerts.filter(
      (alert) => isOpenAlert(alert) && !isUrgentAlert(alert),
    ),
    acknowledged: alerts.filter(
      (alert) => alertStatus(alert) === "acknowledged",
    ),
    resolved: alerts.filter((alert) => alertStatus(alert) === "resolved"),
  };
}

function estimateLocalStorageSize() {
  try {
    let total = 0;
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      total += key.length + (localStorage.getItem(key) || "").length;
    }
    return `${Math.ceil((total * 2) / 1024)} KB`;
  } catch {
    return "Unavailable";
  }
}

function PilotNotice({ onAccept }) {
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pilot-title"
    >
      <section className="pilot-modal">
        <p className="eyebrow">Pilot</p>
        <h1 id="pilot-title">Mesh Shift Log pilot</h1>
        <p>
          Alerts can sync through Supabase when Email login is active.
          Checklists and local fallback data are still saved in this browser, so
          managers should export backups regularly.
        </p>
        <button type="button" className="primary-button" onClick={onAccept}>
          I understand
        </button>
      </section>
    </div>
  );
}

function UpdateBanner({ waitingWorker }) {
  if (!waitingWorker) return null;
  function refreshApp() {
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
    window.location.reload();
  }
  return (
    <div className="update-banner">
      <span>Update available.</span>
      <button
        type="button"
        className="ghost-button compact-button"
        onClick={refreshApp}
      >
        Refresh app
      </button>
    </div>
  );
}

function AlertManagerModal({ user, onClose, onSave }) {
  const [form, setForm] = useState({
    category: "Stock empty",
    severity: "Medium",
    area: "Workbar",
    message: "",
    needsImmediateHelp: false,
  });

  async function submit(event) {
    event.preventDefault();
    if (!form.message.trim()) return;
    await onSave({
      id: `alert-${Date.now()}`,
      date: todayKey(),
      createdAt: new Date().toISOString(),
      createdBy: user.name,
      ...form,
      message: form.message.trim(),
      status: "open",
      managerNote: "",
      emailNotificationStatus: alertNeedsEmail(form)
        ? "pending"
        : "not_required",
      emailNotificationAttemptedAt: "",
      emailNotificationError: "",
    });
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="alert-title"
    >
      <form className="pilot-modal alert-modal" onSubmit={submit}>
        <p className="eyebrow">Alert</p>
        <h1 id="alert-title">Alert manager</h1>
        <p>
          Urgent alerts and immediate-help alerts can email the manager when the
          Supabase function is configured.
        </p>
        <label>
          Category
          <select
            value={form.category}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                category: event.target.value,
              }))
            }
          >
            {alertCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <label>
          Severity
          <select
            value={form.severity}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                severity: event.target.value,
              }))
            }
          >
            {alertSeverities.map((severity) => (
              <option key={severity} value={severity}>
                {severity}
              </option>
            ))}
          </select>
        </label>
        <label>
          Area
          <select
            value={form.area}
            onChange={(event) =>
              setForm((current) => ({ ...current, area: event.target.value }))
            }
          >
            {alertAreas.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
        </label>
        <label>
          Message
          <textarea
            rows="3"
            value={form.message}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                message: event.target.value,
              }))
            }
          />
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={form.needsImmediateHelp}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                needsImmediateHelp: event.target.checked,
              }))
            }
          />
          Needs immediate help
        </label>
        <div className="backup-actions">
          <button type="submit" className="primary-button">
            Save alert
          </button>
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function AlertCard({ alert, isManager = false, onAction, onRetryEmail }) {
  const status = alertStatus(alert);
  const isImmediate = isUrgentAlert(alert);
  const emailLabel = emailStatusLabel(alert);

  return (
    <article
      className={`alert-row severity-${alert.severity.toLowerCase()} status-${status} ${isImmediate ? "needs-help" : ""}`}
    >
      <div className="alert-header">
        <strong>
          {alert.severity}: {alert.category}
        </strong>
        <span>{status}</span>
      </div>
      <div className="alert-meta">
        <span>Area: {alert.area}</span>
        <span>Created by: {alert.createdBy}</span>
        <span>Created: {formatDateTime(alert.createdAt)}</span>
        <span>Immediate help: {alert.needsImmediateHelp ? "Yes" : "No"}</span>
      </div>
      <p>{alert.message}</p>
      {alert.acknowledgedBy && (
        <small>
          Acknowledged by {alert.acknowledgedBy} at{" "}
          {formatDateTime(alert.acknowledgedAt)}
        </small>
      )}
      {alert.resolvedBy && (
        <small>
          Resolved by {alert.resolvedBy} at {formatDateTime(alert.resolvedAt)}
        </small>
      )}
      {alert.managerNote && <small>Manager note: {alert.managerNote}</small>}
      {alert.syncStatus === "pending" && (
        <small className="sync-note">
          Pending backend sync
          {alert.lastSyncAttemptAt
            ? ` since ${formatDateTime(alert.lastSyncAttemptAt)}`
            : ""}
        </small>
      )}
      {alert.syncStatus === "pending_auth" && (
        <small className="sync-note">
          Saved locally. Email login required for backend sync.
        </small>
      )}
      {alert.syncStatus === "local_only" && (
        <small className="sync-note">Saved locally only.</small>
      )}
      {alert.lastSyncError && (
        <small className="sync-note error">
          Backend sync: {alert.lastSyncError}
        </small>
      )}
      {emailLabel && (
        <small
          className={`sync-note email-${alert.emailNotificationStatus || "failed"}`}
        >
          {emailLabel}
          {alert.emailNotificationAttemptedAt
            ? ` at ${formatDateTime(alert.emailNotificationAttemptedAt)}`
            : ""}
          {alert.emailNotificationError
            ? ` | ${alert.emailNotificationError}`
            : ""}
        </small>
      )}
      {isManager &&
        (status !== "resolved" ||
          (alertNeedsEmail(alert) &&
            alert.emailNotificationStatus === "failed")) && (
          <div className="inline-actions">
            {status !== "resolved" && status !== "acknowledged" && (
              <button
                type="button"
                className="ghost-button compact-button"
                onClick={() => onAction(alert.id, "acknowledged")}
              >
                Acknowledge
              </button>
            )}
            {status !== "resolved" && (
              <button
                type="button"
                className="primary-button compact-button"
                onClick={() => onAction(alert.id, "resolved")}
              >
                Resolve
              </button>
            )}
            {alertNeedsEmail(alert) &&
              alert.emailNotificationStatus === "failed" &&
              onRetryEmail && (
                <button
                  type="button"
                  className="ghost-button compact-button"
                  onClick={() => onRetryEmail(alert.id)}
                >
                  Retry email notification
                </button>
              )}
          </div>
        )}
    </article>
  );
}

function Login({
  onLogin,
  staffUsers,
  onSupabaseLogin,
  authStatus,
  onAuthSignOut,
}) {
  const [mode, setMode] = useState("staff_code");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workerName, setWorkerName] = useState("");
  const [pendingUser, setPendingUser] = useState(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function finishLogin(user) {
    saveStorage(SESSION_KEY, user);
    onLogin(user);
  }

  async function submit(event) {
    event.preventDefault();
    setError("");

    if (mode === "email") {
      if (!email.trim() || !password) {
        setError("Add email and password.");
        return;
      }
      setIsSubmitting(true);
      const result = await onSupabaseLogin(email.trim(), password);
      setIsSubmitting(false);
      if (!result.ok) setError(result.error);
      return;
    }

    if (pendingUser) {
      const trimmedName = workerName.trim().replace(/\s+/g, " ");
      if (trimmedName.length < 2) {
        setError("Please add your real first name before continuing.");
        return;
      }
      finishLogin({
        ...pendingUser,
        name: `${trimmedName} / ${pendingUser.name}`,
        staffName: trimmedName,
        baseName: pendingUser.name,
        loginSource: "staff_code",
      });
      return;
    }

    const user = staffUsers.find(
      (staff) =>
        staff.active !== false &&
        staff.code.toLowerCase() === code.trim().toLowerCase(),
    );
    if (!user) {
      setError("Code not found. Check the staff code and try again.");
      return;
    }
    if (user.needsName) {
      setPendingUser(user);
      return;
    }
    finishLogin({ ...user, loginSource: "staff_code" });
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <p className="eyebrow">Mesh Youngstorget</p>
        <h1>Shift checklist</h1>
        <p className="muted">
          {pendingUser
            ? "Use your real first name. This is saved with completed tasks."
            : "Enter your staff code. Ask manager if you need access."}
        </p>
        <div className="login-mode-tabs" role="tablist" aria-label="Login mode">
          <button
            type="button"
            className={mode === "staff_code" ? "active" : ""}
            onClick={() => {
              setMode("staff_code");
              setError("");
            }}
          >
            Staff code login
          </button>
          <button
            type="button"
            className={mode === "email" ? "active" : ""}
            onClick={() => {
              setMode("email");
              setPendingUser(null);
              setError("");
            }}
          >
            Email login
          </button>
        </div>
        <form onSubmit={submit} className="login-form">
          {mode === "email" ? (
            <>
              <label htmlFor="auth-email">Email</label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
              />
              <label htmlFor="auth-password">Password</label>
              <input
                id="auth-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
              />
              {!isSupabaseAuthConfigured && (
                <p className="error">
                  Supabase Auth is not configured. Use staff code login for now.
                </p>
              )}
            </>
          ) : !pendingUser ? (
            <>
              <label htmlFor="staff-code">Enter your staff code</label>
              <input
                id="staff-code"
                autoFocus
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="Staff code"
              />
            </>
          ) : (
            <>
              <label htmlFor="worker-name">Who is working this shift?</label>
              <input
                id="worker-name"
                autoFocus
                value={workerName}
                onChange={(event) => setWorkerName(event.target.value)}
                placeholder="First name"
              />
              <button
                type="button"
                className="text-button"
                onClick={() => setPendingUser(null)}
              >
                Use another code
              </button>
            </>
          )}
          {(error || (mode === "email" && authStatus.profileFetchError)) && (
            <p className="error">{error || authStatus.profileFetchError}</p>
          )}
          {mode === "email" && authStatus.profileFetchError && (
            <button
              type="button"
              className="ghost-button"
              onClick={onAuthSignOut}
            >
              Sign out Supabase session
            </button>
          )}
          <button
            type="submit"
            className="primary-button"
            disabled={isSubmitting}
          >
            {mode === "email"
              ? isSubmitting
                ? "Signing in..."
                : "Sign in with email"
              : "Log in"}
          </button>
        </form>
      </section>
    </main>
  );
}

function TopBar({
  user,
  selectedShift,
  onBack,
  onLogout,
  isOnline,
  siteAccessStatus,
}) {
  const shiftLabel =
    selectedShift === "manager"
      ? "Manager dashboard"
      : shiftOptions.find((shift) => shift.id === selectedShift)?.label ||
        "Select shift";
  return (
    <header className="top-bar">
      <div className="top-user">
        <strong>{user.name}</strong>
        <span>{user.role}</span>
      </div>
      <div className="top-actions">
        <span className={`pilot-status ${isOnline ? "online" : "offline"}`}>
          Local pilot | {isOnline ? "Online" : "Offline - local data available"}
        </span>
        <span className={`shift-pill site-${siteAccessStatus}`}>
          {siteStatuses[siteAccessStatus] || "Location unknown"}
        </span>
        {selectedShift && <span className="shift-pill">{shiftLabel}</span>}
        {selectedShift && (
          <button type="button" className="ghost-button" onClick={onBack}>
            Change shift
          </button>
        )}
        <button type="button" className="ghost-button" onClick={onLogout}>
          Log out
        </button>
      </div>
    </header>
  );
}

function ShiftPicker({
  user,
  onSelect,
  onManager,
  routines,
  logs,
  handoverNotes,
  responsibleAssignments,
}) {
  const date = todayKey();
  function shiftStatus(shiftType) {
    if (shiftType === "guides") return "Quick reference";
    const tasks = flattenTasks(routines, shiftType, date);
    const shiftLogs = logs.filter(
      (log) => log.date === date && log.shiftType === shiftType,
    );
    const handled = shiftLogs.filter(isHandled).length;
    const handledIds = new Set(
      shiftLogs.filter(isHandled).map((log) => log.taskId),
    );
    const criticalRemaining = tasks.filter(
      (task) => task.priority === "critical" && !handledIds.has(task.id),
    ).length;
    const hasHandover = Object.values(handoverNotes).some(
      (note) =>
        note.date === date &&
        note.shiftType === shiftType &&
        handoverHasContent(note),
    );
    const responsible = responsibleAssignments.find(
      (item) => item.date === date && item.shiftType === shiftType,
    );
    const responsibleText = responsible
      ? ` | responsible: ${responsible.responsibleName}`
      : "";
    if (shiftType === "weekly") return `${handled}/${tasks.length} handled`;
    return `${handled}/${tasks.length} handled | ${criticalRemaining} critical | handover ${hasHandover ? "yes" : "no"}${responsibleText}`;
  }
  return (
    <main className="page">
      <section className="intro">
        <p className="eyebrow">{new Date().toLocaleDateString()}</p>
        <h1>Start today's routines</h1>
        <p className="muted">{user.name}</p>
      </section>
      <section className="shift-grid">
        <button
          className="shift-card overview-card"
          type="button"
          onClick={() => onSelect("overview")}
        >
          <span>Today's overview</span>
          <small>Team transparency, not competition</small>
        </button>
        {shiftOptions.map((shift) => (
          <button
            key={shift.id}
            className="shift-card"
            type="button"
            onClick={() => onSelect(shift.id)}
          >
            <span>{shift.label}</span>
            <small>{shiftStatus(shift.id)}</small>
          </button>
        ))}
        {canAccessManagerDashboard(user) && (
          <button
            className="shift-card manager-card"
            type="button"
            onClick={onManager}
          >
            <span>Manager dashboard</span>
            <small>Reports</small>
          </button>
        )}
      </section>
    </main>
  );
}

function TaskInput({ task, value, onChange }) {
  if (!taskNeedsInput(task)) return null;
  if (task.inputType === "yesno") {
    return (
      <div className="choice-row">
        {["Yes", "No"].map((choice) => (
          <button
            key={choice}
            type="button"
            className={value === choice ? "active" : ""}
            onClick={() => onChange(choice)}
          >
            {choice}
          </button>
        ))}
      </div>
    );
  }
  if (task.inputType === "number") {
    return (
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Enter number"
      />
    );
  }
  if (task.inputType === "text") {
    return (
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Add text"
      />
    );
  }
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Add comment"
      rows="3"
    />
  );
}

function HandoverNotes({
  user,
  shiftType,
  notes,
  setNotes,
  onSync,
  backendShiftSessionId = "",
}) {
  const [savedAt, setSavedAt] = useState("");
  const syncTimerRef = useRef(null);
  const date = todayKey();
  const key = `${date}-${shiftType}-${user.name}`;
  const syncUserKey = slug(
    user.authUserId || user.backendUserId || user.id || user.name,
  );
  const currentAuthId = user.authUserId || user.backendUserId || "";
  const restoredNote = Object.values(normalizeHandovers(notes)).find(
    (note) =>
      note?.date === date &&
      note?.shiftType === shiftType &&
      (note.localId === `handover:${date}:${shiftType}:${syncUserKey}` ||
        (currentAuthId && note.createdByAuthUserId === currentAuthId) ||
        note.completedBy === user.name),
  );
  const value = notes[key] ||
    restoredNote || {
      id: key,
      localId: `handover:${date}:${shiftType}:${syncUserKey}`,
      date,
      shiftType,
      completedBy: user.name,
      nextShift: "",
      lowStock: "",
      maintenance: "",
      memberEvent: "",
      updatedAt: "",
    };

  useEffect(
    () => () => {
      if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    },
    [],
  );

  function update(field, fieldValue) {
    const next = {
      ...value,
      id: value.id || key,
      localId: value.localId || `handover:${date}:${shiftType}:${syncUserKey}`,
      shiftSessionBackendId: backendShiftSessionId,
      [field]: fieldValue,
      syncStatus:
        user.loginSource === "supabase_auth"
          ? "pending_backend"
          : "pending_auth",
      updatedAt: new Date().toISOString(),
    };
    const nextNotes = { ...notes, [key]: next };
    setNotes(nextNotes);
    saveStorage(HANDOVER_KEY, nextNotes);
    setSavedAt("Saved just now");
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => {
      onSync?.(next);
    }, 700);
  }

  return (
    <section className="handover-panel" id="handover-notes">
      <div className="section-heading static-heading">
        <p className="eyebrow">Handover</p>
        <h2>Handover notes</h2>
        <span>
          {savedAt ||
            (value.updatedAt
              ? `Saved ${formatDateTime(value.updatedAt)}`
              : "Auto-saves while you type")}
        </span>
      </div>
      <label>
        Notes for next shift
        <textarea
          rows="3"
          value={value.nextShift}
          onChange={(event) => update("nextShift", event.target.value)}
        />
      </label>
      <label>
        Low stock / order soon
        <textarea
          rows="2"
          value={value.lowStock}
          onChange={(event) => update("lowStock", event.target.value)}
        />
      </label>
      <label>
        Maintenance or issues
        <textarea
          rows="2"
          value={value.maintenance}
          onChange={(event) => update("maintenance", event.target.value)}
        />
      </label>
      <label>
        Member or event notes
        <textarea
          rows="2"
          value={value.memberEvent}
          onChange={(event) => update("memberEvent", event.target.value)}
        />
      </label>
    </section>
  );
}

function StaffDashboard({
  user,
  routines,
  logs,
  handoverNotes,
  finishRecords,
  alerts,
  responsibleAssignments,
  events,
  cashSignoffs,
  assetChecks,
  alertBackendStatus,
  refreshAlerts,
  onAlert,
}) {
  const date = todayKey();
  const todayLogs = logs.filter((log) => log.date === date);
  const todayHandovers = Object.values(handoverNotes).filter(
    (note) => note.date === date && handoverHasContent(note),
  );
  const openAlerts = alerts
    .filter((alert) => alert.date === date && isOpenAlert(alert))
    .sort(
      (a, b) =>
        Number(isUrgentAlert(b)) - Number(isUrgentAlert(a)) ||
        new Date(b.createdAt) - new Date(a.createdAt),
    );
  const contributors = [
    ...new Set(todayLogs.map((log) => log.completedBy)),
  ].sort();
  const recentLogs = [...todayLogs]
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
    .slice(0, 8);
  const shifts = shiftOptions.filter((shift) => shift.id !== "guides");
  const todayResponsibilities = responsibleAssignments.filter(
    (item) => item.date === date,
  );
  const todayEvents = events.filter((event) => event.date === date);
  const cashIssues = cashSignoffs.filter(
    (record) =>
      record.date === date &&
      (record.invoiceSent !== "yes" ||
        record.salesPunched !== "yes" ||
        record.settlementPerformed !== "yes"),
  );
  const assetIssues = assetChecks.filter(
    (record) => record.date === date && assetHasIssue(record),
  );

  useEffect(() => {
    refreshAlerts({ reason: "staff_dashboard_open" });
  }, []);

  return (
    <main className="page">
      <section className="intro compact">
        <p className="eyebrow">{new Date().toLocaleDateString()}</p>
        <h1>Today's overview</h1>
        <p className="muted">Active user: {user.name}</p>
        <p className="muted">
          Thanks to everyone keeping the day moving. Completed tasks are shown
          for transparency, not competition.
        </p>
        <div className="inline-actions">
          <button
            type="button"
            className="ghost-button compact-button"
            onClick={onAlert}
          >
            Alert manager
          </button>
          <button
            type="button"
            className="ghost-button compact-button"
            onClick={() => refreshAlerts({ reason: "manual" })}
          >
            Refresh alerts
          </button>
        </div>
        <p className="muted sync-inline">
          Alerts: {backendSourceLabel(alertBackendStatus.source)}
          {alertBackendStatus.message ? ` | ${alertBackendStatus.message}` : ""}
          {alertBackendStatus.unsyncedLocalAlertCount > 0
            ? ` | ${alertBackendStatus.unsyncedLocalAlertCount} waiting to sync`
            : ""}
        </p>
      </section>

      <section className="summary-grid">
        {shifts.map((shift) => {
          const tasks = flattenTasks(routines, shift.id, date);
          const shiftLogs = todayLogs.filter(
            (log) => log.shiftType === shift.id,
          );
          const logsByTask = Object.fromEntries(
            shiftLogs.map((log) => [log.taskId, log]),
          );
          const stats = getShiftStats(tasks, logsByTask);
          const finish = finishRecords.find(
            (record) => record.date === date && record.shiftType === shift.id,
          );
          return (
            <article key={shift.id} className="summary-card">
              <span>{shift.label}</span>
              <strong>
                {stats.handled}/{tasks.length}
              </strong>
              <small>
                Missing {stats.missing} | Critical {stats.criticalMissing}
              </small>
              {finish && (
                <small>
                  Finished by {finish.finishedBy} at{" "}
                  {formatDateTime(finish.finishedAt)}
                </small>
              )}
            </article>
          );
        })}
      </section>

      <section className="manager-list">
        <h2>Responsibility roles</h2>
        <p className="muted">
          Responsibility is role-based. Event lead, closing lead, cash/invoice
          lead and locking lead may be different people.
        </p>
        {todayResponsibilities.length === 0 && (
          <p className="muted">No responsible assignments today.</p>
        )}
        {todayResponsibilities.map((item) => (
          <article key={item.id} className="log-row">
            <strong>
              {responsibilityLabels[item.roleType] || "Overall shift lead"}
            </strong>
            <span>
              {item.responsibleName} | assigned by {item.assignedBy}
            </span>
            <small>
              {shiftLabels[item.shiftType] || item.shiftType}
              {item.eventId ? " | event role" : ""}
              {item.note ? ` | ${item.note}` : ""}
            </small>
          </article>
        ))}
      </section>

      <section className="manager-list">
        <h2>Event / cash / asset issues</h2>
        {todayEvents.length === 0 &&
          cashIssues.length === 0 &&
          assetIssues.length === 0 && (
            <p className="muted">
              No event, cash or asset issues logged today.
            </p>
          )}
        {todayEvents.map((event) => (
          <article key={event.id} className="log-row">
            <strong>{event.eventName}</strong>
            <span>
              {event.venue} | {event.startTime}-{event.endTime} | Event lead{" "}
              {event.eventResponsible || "Unassigned"}
            </span>
          </article>
        ))}
        {cashIssues.map((record) => (
          <p key={record.id} className="attention-line">
            <small>Cash/invoice</small>
            {record.shiftType}
            <span>{record.comments || "Missing signoff item"}</span>
          </p>
        ))}
        {assetIssues.map((record) => (
          <p key={record.id} className="attention-line">
            <small>Asset</small>
            {record.assetLabel}
            <span>
              {record.condition} | {record.comment || "Needs attention"}
            </span>
          </p>
        ))}
      </section>

      <section className="attention-panel">
        <h2>Needs attention</h2>
        {openAlerts.length === 0 && (
          <p className="muted">No open alerts today.</p>
        )}
        {openAlerts.map((alert) => (
          <AlertCard key={alert.id} alert={alert} />
        ))}
        {todayHandovers
          .filter((note) => note.lowStock || note.maintenance)
          .map((note) => (
            <p
              key={`${note.shiftType}-${note.completedBy}`}
              className="attention-line"
            >
              <small>Handover</small>
              {shiftLabels[note.shiftType]} | {note.completedBy}
              <span>{note.lowStock || note.maintenance}</span>
            </p>
          ))}
      </section>

      <section className="manager-list">
        <h2>Recent handled tasks</h2>
        {recentLogs.length === 0 && (
          <p className="muted">No tasks handled yet today.</p>
        )}
        {recentLogs.map((log) => (
          <article key={log.id} className="log-row">
            <strong>{log.taskTitle}</strong>
            <span>
              {shiftLabels[log.shiftType]} | {log.completedBy} |{" "}
              {formatDateTime(log.completedAt)}
            </span>
          </article>
        ))}
      </section>

      <section className="manager-list">
        <h2>Contributors today</h2>
        {contributors.length === 0 && (
          <p className="muted">No contributors logged yet.</p>
        )}
        {contributors.map((name) => (
          <article key={name} className="log-row">
            <strong>{name}</strong>
            <span>
              Handled tasks:{" "}
              {todayLogs.filter((log) => log.completedBy === name).length}
            </span>
          </article>
        ))}
        <p className="muted">
          Some tasks are larger than others. This is only a transparency
          overview.
        </p>
      </section>

      <section className="manager-list">
        <h2>Handover notes</h2>
        {todayHandovers.length === 0 && (
          <p className="muted">No handover notes yet today.</p>
        )}
        {todayHandovers.map((note) => (
          <article
            key={`${note.shiftType}-${note.completedBy}`}
            className="log-row"
          >
            <strong>
              {shiftLabels[note.shiftType]} | {note.completedBy}
            </strong>
            {note.nextShift && <small>Next shift: {note.nextShift}</small>}
            {note.lowStock && <small>Low stock: {note.lowStock}</small>}
            {note.maintenance && <small>Maintenance: {note.maintenance}</small>}
            {note.memberEvent && (
              <small>Member/event: {note.memberEvent}</small>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}

function CashInvoicePanel({
  user,
  date,
  shiftType = "event",
  eventId = "",
  cashSignoffs,
  setCashSignoffs,
  staffUsers,
  requestWriteAccess,
  onSyncFinancialSignoff,
}) {
  const existing = cashSignoffs.find(
    (record) =>
      record.date === date &&
      record.shiftType === shiftType &&
      (record.eventId || "") === eventId,
  );
  const [form, setForm] = useState(existing || blankCashForm);

  async function saveCashSignoff(event) {
    event.preventDefault();
    if (!(await requestWriteAccess())) return;
    if (
      form.settlementPerformed !== "yes" ||
      form.invoiceSent !== "yes" ||
      form.salesPunched !== "yes"
    ) {
      if (!form.comments.trim()) {
        alert(
          "Add a reason/comment if cash or invoice closeout is not complete.",
        );
        return;
      }
    }
    const record = {
      ...form,
      id: `${date}-${shiftType}-${eventId || "shift"}-cash`,
      date,
      shiftType,
      eventId,
      signedOffBy: form.signedOffBy || user.name,
      signedOffAt: new Date().toISOString(),
      signoffType: "daily_finance",
      status: "completed",
      syncStatus:
        user.loginSource === "supabase_auth"
          ? "pending_backend"
          : "pending_auth",
    };
    const nextRecords = [
      ...cashSignoffs.filter((item) => item.id !== record.id),
      record,
    ];
    setCashSignoffs(nextRecords);
    saveStorage(CASH_SIGNOFF_KEY, nextRecords);
    onSyncFinancialSignoff?.(record, nextRecords);
  }

  return (
    <section className="manager-list">
      <h2>Cash / invoice responsibility</h2>
      <p className="muted">
        The responsible person signs off that settlement and invoice/report work
        was completed, even if someone else performed settlement.
      </p>
      <form className="editor-form compact-editor" onSubmit={saveCashSignoff}>
        {[
          ["tableCreated", "Customer/table created today"],
          ["salesPunched", "All sales punched correctly"],
          ["invoiceSent", "Invoice/receipt/report sent"],
          ["settlementPerformed", "Cash/register settlement performed"],
        ].map(([field, label]) => (
          <label key={field}>
            {label}
            <select
              value={form[field]}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  [field]: event.target.value,
                }))
              }
            >
              <option value="">Select</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
        ))}
        <label>
          Settlement performed by
          <input
            list="cash-staff-list"
            value={form.settlementPerformedBy}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                settlementPerformedBy: event.target.value,
              }))
            }
          />
        </label>
        <label>
          Sign-off by
          <input
            list="cash-staff-list"
            value={form.signedOffBy || user.name}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                signedOffBy: event.target.value,
              }))
            }
          />
        </label>
        <datalist id="cash-staff-list">
          {staffUsers.map((staff) => (
            <option key={staff.id} value={staff.name} />
          ))}
        </datalist>
        <label>
          Comments / missing reason
          <textarea
            rows="2"
            value={form.comments}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                comments: event.target.value,
              }))
            }
          />
        </label>
        <button type="submit" className="primary-button compact-button">
          Save cash/invoice sign-off
        </button>
      </form>
    </section>
  );
}

function AssetCheckPanel({
  user,
  date,
  shiftType = "closing",
  eventId = "",
  assets,
  assetChecks,
  setAssetChecks,
  requestWriteAccess,
}) {
  const requiredAssets = assets.filter(
    (asset) =>
      asset.active !== false && asset.defaultRequiredForClosing !== false,
  );
  const checksByAsset = Object.fromEntries(
    assetChecks
      .filter(
        (check) =>
          check.date === date &&
          check.shiftType === shiftType &&
          (check.eventId || "") === eventId,
      )
      .map((check) => [check.assetId, check]),
  );
  const [drafts, setDrafts] = useState({});

  function valueFor(assetId, field, fallback = "") {
    return (
      drafts[assetId]?.[field] ?? checksByAsset[assetId]?.[field] ?? fallback
    );
  }

  async function saveAssetCheck(asset) {
    if (!(await requestWriteAccess())) return;

    const draft = drafts[asset.id] || {};
    const assetIdentity = asset.localId || asset.id;
    const timestamp = new Date().toISOString();

    const record = {
      id: `${date}-${shiftType}-${eventId || "shift"}-${asset.id}`,
      localId: `asset_check:${date}:${shiftType}:${eventId || "shift"}:${assetIdentity}:${user.authUserId || user.backendUserId || user.id || user.name}`,
      date,
      shiftType,
      eventId,
      assetId: asset.id,
      assetLocalId: assetIdentity,
      assetBackendId: asset.backendId || "",
      assetLabel: `${asset.provider} ${asset.model}`.trim(),
      expectedVenue: asset.expectedVenue,
      expectedStation: asset.expectedStation,
      present: draft.present ?? checksByAsset[asset.id]?.present ?? "",
      correctLocation:
        draft.correctLocation ?? checksByAsset[asset.id]?.correctLocation ?? "",
      condition:
        draft.condition ??
        checksByAsset[asset.id]?.condition ??
        asset.condition,
      charging: draft.charging ?? checksByAsset[asset.id]?.charging ?? "",
      serialChecked:
        draft.serialChecked ?? checksByAsset[asset.id]?.serialChecked ?? "",
      serialLast4:
        draft.serialLast4 ?? checksByAsset[asset.id]?.serialLast4 ?? "",
      comment: draft.comment ?? checksByAsset[asset.id]?.comment ?? "",
      signedOffBy: user.name,
      signedOffAt: timestamp,
      signedByAuthUserId:
        user.loginSource === "supabase_auth"
          ? user.authUserId || user.backendUserId || ""
          : "",
      syncStatus:
        user.loginSource === "supabase_auth"
          ? "pending_backend"
          : "pending_auth",
      syncError: "",
      updatedAt: timestamp,
    };

    if (assetHasIssue(record) && !record.comment.trim()) {
      alert(
        "Add a comment for missing, damaged, not charging or wrong-location assets.",
      );
      return;
    }

    const nextChecks = [
      ...assetChecks.filter((check) => check.id !== record.id),
      record,
    ];

    setAssetChecks(nextChecks);
    saveStorage(ASSET_CHECK_KEY, nextChecks);

    if (user.loginSource !== "supabase_auth") return;

    const result = await upsertAssetCheckRecord(record);

    const syncedRecord = result.ok
      ? {
          ...record,
          ...result.record,
          id: record.id,
          localId: record.localId || result.record.localId,
          syncStatus: "synced",
          syncError: "",
        }
      : {
          ...record,
          syncStatus: "sync_error",
          syncError: result.message || "Asset check sync failed.",
        };

    const syncedChecks = [
      ...nextChecks.filter((check) => check.id !== record.id),
      syncedRecord,
    ];

    setAssetChecks(syncedChecks);
    saveStorage(ASSET_CHECK_KEY, syncedChecks);

    if (!result.ok) {
      console.error(
        "Phase 5B asset check sync failed:",
        result.error || result.message,
      );
    }
  }

  return (
    <section className="manager-list">
      <h2>Payment terminals and POS devices</h2>
      <p className="muted">
        Asset check responsible: I confirm payment terminals and POS devices
        have been checked.
      </p>
      {requiredAssets.map((asset) => (
        <article
          key={asset.id}
          className={`log-row priority-${asset.condition === "missing" ? "critical" : "normal"}`}
        >
          <strong>
            {asset.provider} {asset.model}
          </strong>
          <span>
            {asset.expectedVenue} | {asset.expectedStation} | Serial{" "}
            {asset.serialNumber || "TBD"}
          </span>
          {asset.notes && <small>{asset.notes}</small>}
          <div className="editor-form compact-editor asset-check-grid">
            {[
              ["present", "Present"],
              ["correctLocation", "Correct location"],
              ["charging", "Charging"],
              ["serialChecked", "Serial checked"],
            ].map(([field, label]) => (
              <label key={field}>
                {label}
                <select
                  value={valueFor(asset.id, field)}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [asset.id]: {
                        ...current[asset.id],
                        [field]: event.target.value,
                      },
                    }))
                  }
                >
                  <option value="">Select</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
            ))}
            <label>
              Condition
              <select
                value={valueFor(asset.id, "condition", asset.condition)}
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    [asset.id]: {
                      ...current[asset.id],
                      condition: event.target.value,
                    },
                  }))
                }
              >
                <option value="ok">OK</option>
                <option value="unstable">Unstable</option>
                <option value="damaged">Damaged</option>
                <option value="not_working">Not working</option>
                <option value="missing">Missing</option>
              </select>
            </label>
            <label>
              Last 4 serial digits
              <input
                value={valueFor(asset.id, "serialLast4")}
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    [asset.id]: {
                      ...current[asset.id],
                      serialLast4: event.target.value,
                    },
                  }))
                }
              />
            </label>
            <label>
              Comment
              <textarea
                rows="2"
                value={valueFor(asset.id, "comment")}
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    [asset.id]: {
                      ...current[asset.id],
                      comment: event.target.value,
                    },
                  }))
                }
              />
            </label>
            <button
              type="button"
              className="primary-button compact-button"
              onClick={() => saveAssetCheck(asset)}
            >
              Save asset check
            </button>
          </div>
          {checksByAsset[asset.id]?.syncStatus && (
            <small className="sync-note">
              Sync: {checksByAsset[asset.id].syncStatus}
            </small>
          )}
          {checksByAsset[asset.id]?.syncError && (
            <small className="sync-note error">
              Backend sync: {checksByAsset[asset.id].syncError}
            </small>
          )}
        </article>
      ))}
    </section>
  );
}

function EventFloorDashboard({
  user,
  events,
  responsibleAssignments,
  cashSignoffs,
  setCashSignoffs,
  assets,
  assetChecks,
  setAssetChecks,
  eventTaskChecks,
  setEventTaskChecks,
  staffUsers,
  requestWriteAccess,
  onSyncFinancialSignoff,
  onRefreshFinancialSignoffs,
  onEnsureShiftSession,
  onSyncTaskLog,
  onSyncHandover,
  onShowOverview,
  onGuides,
}) {
  const date = todayKey();
  const todayEvents = events.filter((event) => event.date === date);
  const [activeEventId, setActiveEventId] = useState(todayEvents[0]?.id || "");
  const activeEvent =
    todayEvents.find((event) => event.id === activeEventId) || todayEvents[0];
  const activeEventIdValue = activeEvent?.id || "";
  const eventAssignments = responsibleAssignments.filter(
    (assignment) =>
      assignment.date === date && assignment.eventId === activeEventIdValue,
  );
  const isEventResponsible = eventAssignments.some(
    (assignment) =>
      assignment.roleType === "event_responsible" &&
      isResponsibleUser(user, assignment),
  );
  const checksForEvent = eventTaskChecks.filter(
    (check) =>
      check.date === date && (check.eventId || "") === activeEventIdValue,
  );
  const checkedIds = new Set(checksForEvent.map((check) => check.taskId));

  useEffect(() => {
    if (user?.loginSource === "supabase_auth")
      onRefreshFinancialSignoffs?.(date);
  }, [date, user?.id, user?.loginSource]);

  async function toggleEventTask(taskId, title, group) {
    if (!(await requestWriteAccess())) return;
    const existing = eventTaskChecks.find(
      (check) =>
        check.date === date &&
        (check.eventId || "") === activeEventIdValue &&
        check.taskId === taskId,
    );
    const nextChecks = existing
      ? eventTaskChecks.filter((check) => check.id !== existing.id)
      : [
          ...eventTaskChecks,
          {
            id: `${date}-${activeEventIdValue || "general"}-${taskId}`,
            date,
            eventId: activeEventIdValue,
            taskId,
            title,
            group,
            completedBy: user.name,
            completedAt: new Date().toISOString(),
          },
        ];
    setEventTaskChecks(nextChecks);
    saveStorage(EVENT_TASK_CHECK_KEY, nextChecks);
  }

  function renderTaskGroup(title, tasks, group) {
    return (
      <section className="manager-list">
        <h2>{title}</h2>
        {tasks.map((task) => {
          const taskId = slug(`${group}-${task}`);
          return (
            <button
              key={taskId}
              type="button"
              className={`check-row ${checkedIds.has(taskId) ? "is-checked" : ""}`}
              onClick={() => toggleEventTask(taskId, task, group)}
            >
              <span>{checkedIds.has(taskId) ? "OK" : ""}</span>
              {task}
            </button>
          );
        })}
      </section>
    );
  }

  return (
    <main className="page">
      <section className="intro compact">
        <p className="eyebrow">Youngs</p>
        <h1>Event Floor Manager</h1>
        <p className="muted">{user.name}</p>
        <div className="backup-actions">
          <button
            type="button"
            className="ghost-button compact-button"
            onClick={onShowOverview}
          >
            Today's overview
          </button>
          <button
            type="button"
            className="ghost-button compact-button"
            onClick={onGuides}
          >
            Guides
          </button>
        </div>
      </section>

      <section className="manager-list">
        <h2>Today's events</h2>
        {todayEvents.length === 0 && (
          <p className="muted">No event cards created for today yet.</p>
        )}
        {todayEvents.length > 0 && (
          <label>
            Active event
            <select
              value={activeEventIdValue}
              onChange={(event) => setActiveEventId(event.target.value)}
            >
              {todayEvents.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.eventName}
                </option>
              ))}
            </select>
          </label>
        )}
        {activeEvent && (
          <article className="log-row">
            <strong>{activeEvent.eventName}</strong>
            <span>
              {activeEvent.client} | {activeEvent.venue} |{" "}
              {activeEvent.startTime}-{activeEvent.endTime} |{" "}
              {activeEvent.expectedGuests} guests
            </span>
            <small>
              Event: {activeEvent.eventResponsible || "Unassigned"} | Closing:{" "}
              {activeEvent.closingResponsible || "Unassigned"} | Cash/invoice:{" "}
              {activeEvent.cashInvoiceResponsible || "Unassigned"} | Locking:{" "}
              {activeEvent.lockingResponsible || "Unassigned"}
            </small>
            {activeEvent.notes && <small>{activeEvent.notes}</small>}
            {isEventResponsible && (
              <p className="all-clear">
                You are event responsible for this event.
              </p>
            )}
          </article>
        )}
      </section>

      {renderTaskGroup(
        "Event readiness",
        [
          "Tech ready",
          "Room setup ready",
          "Food/catering ready",
          "Bar ready",
          "Allergy info ready",
          "Signage ready",
          "Host/contact confirmed",
        ],
        "readiness",
      )}
      {renderTaskGroup(
        "During event",
        [
          "Breaks handled",
          "Water/coffee refreshed",
          "Toilets checked",
          "Client updated",
          "Issues logged",
        ],
        "during",
      )}
      {renderTaskGroup(
        "Event closeout",
        [
          "Client happy / goodbye done",
          "All sales punched",
          "Open customer/table checked",
          "Invoice/receipt/report sent",
          "Payment terminal/iPads checked",
          "Venue reset",
          "Trash/glass/pant handled",
          "Handover note written",
        ],
        "closeout",
      )}
      {renderTaskGroup("Weekly event floor tasks", weeklyEventTasks, "weekly")}
      {renderTaskGroup(
        "Monthly event floor tasks",
        monthlyEventTasks,
        "monthly",
      )}

      <CashInvoicePanel
        user={user}
        date={date}
        shiftType="event"
        eventId={activeEventIdValue}
        cashSignoffs={cashSignoffs}
        setCashSignoffs={setCashSignoffs}
        staffUsers={staffUsers}
        requestWriteAccess={requestWriteAccess}
        onSyncFinancialSignoff={onSyncFinancialSignoff}
      />
      <AssetCheckPanel
        user={user}
        date={date}
        shiftType="event"
        eventId={activeEventIdValue}
        assets={assets}
        assetChecks={assetChecks}
        setAssetChecks={setAssetChecks}
        requestWriteAccess={requestWriteAccess}
      />
    </main>
  );
}

function Checklist({
  user,
  shiftType,
  routines,
  logs,
  setLogs,
  handoverNotes,
  setHandoverNotes,
  finishRecords,
  setFinishRecords,
  alerts,
  setAlerts,
  saveAlertRecord,
  responsibleAssignments,
  cashSignoffs,
  setCashSignoffs,
  assets,
  assetChecks,
  setAssetChecks,
  staffUsers,
  requestWriteAccess,
  onEnsureShiftSession,
  onSyncTaskLog,
  onSyncHandover,
  onSyncFinancialSignoff,
  onRestoreShiftData,
  onShowOverview,
  onChangeShift,
  onLogout,
}) {
  const [drafts, setDrafts] = useState({});
  const [comments, setComments] = useState({});
  const [hideCompleted, setHideCompleted] = useState(false);
  const [taskFilter, setTaskFilter] = useState("all");
  const date = todayKey();
  const tasks = useMemo(
    () => flattenTasks(routines, shiftType, date),
    [routines, shiftType, date],
  );
  const handoverKey = `${date}-${shiftType}-${user.name}`;
  const currentHandover = handoverNotes[handoverKey];
  const hasHandover = handoverHasContent(currentHandover);
  const logsByTask = Object.fromEntries(
    logs.filter((log) => log.date === date).map((log) => [log.taskId, log]),
  );
  const stats = getShiftStats(tasks, logsByTask);
  const doneCount = stats.done;
  const notRelevantCount = stats.notRelevant;
  const handledCount = stats.handled;
  const criticalRemaining = stats.criticalMissing;
  const importantRemaining = tasks.filter(
    (task) => task.priority === "important" && !isHandled(logsByTask[task.id]),
  ).length;
  const missingCount = stats.missing;
  const securityRemaining = tasks.filter(
    (task) =>
      ["security", "salto", "cornerbar"].includes(task.area) &&
      !isHandled(logsByTask[task.id]),
  ).length;
  const posRemaining = tasks.filter(
    (task) => task.area === "pos" && !isHandled(logsByTask[task.id]),
  ).length;
  const assignment = responsibleAssignments.find(
    (item) => item.date === date && item.shiftType === shiftType,
  );
  const isResponsible = isResponsibleUser(user, assignment);
  const responsibleCriticalMissing = tasks.filter(
    (task) =>
      task.section === "Responsible closing control" &&
      task.priority === "critical" &&
      !isHandled(logsByTask[task.id]),
  ).length;
  const [finished, setFinished] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState("");
  const [backendShiftSessionId, setBackendShiftSessionId] = useState("");
  const syncUserKey = slug(
    user.authUserId || user.backendUserId || user.id || user.name,
  );

  useEffect(() => {
    if (shiftType === "guides") return undefined;
    let cancelled = false;
    onEnsureShiftSession?.(date, shiftType).then((result) => {
      if (!cancelled && result?.ok && result.record?.backendId)
        setBackendShiftSessionId(result.record.backendId);
    });
    if (user.loginSource === "supabase_auth") {
      onRestoreShiftData?.(date, shiftType).then((result) => {
        if (!cancelled && result?.ok)
          setRestoreMessage("Checklist restored from Supabase.");
      });
    }
    return () => {
      cancelled = true;
    };
  }, [date, shiftType, user.id]);
  const visibleTasks = tasks.filter((task) => {
    const log = logsByTask[task.id];
    if (hideCompleted && isHandled(log)) return false;
    if (taskFilter === "critical") return task.priority === "critical";
    if (taskFilter === "priority")
      return ["critical", "important"].includes(task.priority);
    if (taskFilter === "needsInput")
      return taskNeedsInput(task) || task.requiresComment;
    return true;
  });
  const grouped = groupBy(visibleTasks, (task) => task.section);
  const allGrouped = groupBy(tasks, (task) => task.section);

  async function saveTaskStatus(task, status) {
    if (!(await requestWriteAccess())) return;
    const input = drafts[task.id] || "";
    const comment = comments[task.id] || "";
    if (status === "done" && task.requiresComment && !comment.trim()) {
      alert("This task requires a comment before saving.");
      return;
    }
    if (
      status === "not_relevant" &&
      ["important", "critical"].includes(task.priority) &&
      !comment.trim()
    ) {
      alert(
        `Please add a reason before marking this ${task.priority} task as not relevant.`,
      );
      return;
    }
    if (status === "done" && task.criticalConfirm) {
      const confirmed = window.confirm(criticalConfirmMessage(task));
      if (!confirmed) return;
    }

    const nextLog = {
      id: `${date}-${task.id}`,
      localId: `task_completion:${date}:${task.shiftType}:${task.id}:${syncUserKey}`,
      taskId: task.id,
      taskTitle: task.title,
      date,
      completedBy: user.name,
      staffRole: user.role,
      shiftType: task.shiftType,
      section: task.section,
      timeBlock: task.timeBlock,
      area: task.area,
      priority: task.priority,
      inputType: task.inputType,
      input,
      comment,
      status,
      completedAt: new Date().toISOString(),
      criticalConfirmed: status === "done" && Boolean(task.criticalConfirm),
      completedByAuthUserId:
        user.loginSource === "supabase_auth"
          ? user.authUserId || user.backendUserId || ""
          : "",
      completedByProfileId:
        user.loginSource === "supabase_auth"
          ? user.backendUserId || user.authUserId || ""
          : "",
      shiftSessionBackendId: backendShiftSessionId,
      syncStatus:
        user.loginSource === "supabase_auth"
          ? "pending_backend"
          : "pending_auth",
      updatedAt: new Date().toISOString(),
    };
    const nextLogs = logs.filter(
      (log) => !(log.date === date && log.taskId === task.id),
    );
    const savedLogs = [...nextLogs, nextLog];
    setLogs(savedLogs);
    saveStorage(LOG_KEY, savedLogs);
    onSyncTaskLog?.(nextLog, { shiftSessionBackendId: backendShiftSessionId });
  }

  function clearTask(task) {
    const resetLog = {
      id: `${date}-${task.id}`,
      localId: `task_completion:${date}:${task.shiftType}:${task.id}:${syncUserKey}`,
      taskId: task.id,
      taskTitle: task.title,
      date,
      completedBy: user.name,
      staffRole: user.role,
      shiftType: task.shiftType,
      section: task.section,
      timeBlock: task.timeBlock,
      area: task.area,
      priority: task.priority,
      inputType: task.inputType,
      input: "",
      comment: "",
      status: "open",
      completedAt: new Date().toISOString(),
      completedByAuthUserId:
        user.loginSource === "supabase_auth"
          ? user.authUserId || user.backendUserId || ""
          : "",
      completedByProfileId:
        user.loginSource === "supabase_auth"
          ? user.backendUserId || user.authUserId || ""
          : "",
      shiftSessionBackendId: backendShiftSessionId,
      syncStatus:
        user.loginSource === "supabase_auth"
          ? "pending_backend"
          : "pending_auth",
      updatedAt: new Date().toISOString(),
    };
    onSyncTaskLog?.(resetLog, {
      shiftSessionBackendId: backendShiftSessionId,
      updateLocal: false,
    });
    const nextLogs = logs.filter(
      (log) => !(log.date === date && log.taskId === task.id),
    );
    setLogs(nextLogs);
    saveStorage(LOG_KEY, nextLogs);
  }

  async function saveAlert(alertRecord) {
    if (!(await requestWriteAccess())) return;
    const result = await saveAlertRecord(alertRecord);
    setShowAlert(false);
    const emailNote = result.emailResult?.authRequired
      ? "\n\nEmail notification requires Email login."
      : result.emailResult?.ok === false
        ? "\n\nEmail notification failed. Alert is still saved."
        : "";
    window.alert(
      result.authRequired
        ? `Saved locally. Email login required for backend sync.${emailNote}`
        : result.ok
          ? `Alert saved.${emailNote}`
          : `Saved locally. Backend sync pending.${emailNote}`,
    );
  }

  async function finishShift() {
    if (!(await requestWriteAccess())) return;
    if (
      criticalRemaining > 0 &&
      !window.confirm(
        "There are still critical tasks missing. Are you sure you want to finish this shift?",
      )
    ) {
      return;
    }
    if (
      !hasHandover &&
      (missingCount > 0 || criticalRemaining > 0) &&
      !window.confirm("Add a handover note before finishing?")
    ) {
      return;
    }
    if (isResponsible && shiftType === "closing") {
      if (
        responsibleCriticalMissing > 0 &&
        !window.confirm(
          "Responsible closing checks are still missing. Finish anyway?",
        )
      )
        return;
      if (
        !hasHandover &&
        !window.confirm(
          "Please add a final handover note before finishing responsible closing. Finish anyway?",
        )
      )
        return;
    }
    const record = {
      id: finishKey(date, shiftType, user.name),
      date,
      shiftType,
      finishedBy: user.name,
      finishedAt: new Date().toISOString(),
      doneCount,
      notRelevantCount,
      missingCount,
      criticalMissingCount: criticalRemaining,
      handoverPresent: hasHandover,
    };
    const nextRecords = [
      ...finishRecords.filter((item) => item.id !== record.id),
      record,
    ];
    setFinishRecords(nextRecords);
    saveStorage(FINISH_KEY, nextRecords);
    const sessionResult = await onEnsureShiftSession?.(date, shiftType, {
      status: "finished",
      finishedAt: record.finishedAt,
    });
    if (sessionResult?.ok && sessionResult.record?.backendId)
      setBackendShiftSessionId(sessionResult.record.backendId);
    setFinished(true);
  }

  if (shiftType === "guides") {
    return (
      <main className="page">
        <section className="intro compact">
          <p className="eyebrow">Guides</p>
          <h1>Knowledge base</h1>
        </section>
        <section className="guide-list">
          {knowledgeBase.map((guide) => (
            <article key={guide.title} className="guide-card">
              <h2>{guide.title}</h2>
              <p>{guide.body}</p>
            </article>
          ))}
        </section>
      </main>
    );
  }

  if (finished) {
    return (
      <main className="page">
        <section className="finish-screen">
          <p className="eyebrow">Finished</p>
          <h1>Shift finished</h1>
          <p>Nice work, {user.name}.</p>
          <div className="summary-metrics">
            <span>Done {doneCount}</span>
            <span>Not relevant {notRelevantCount}</span>
            <span>Missing {missingCount}</span>
            <span>Critical missing {criticalRemaining}</span>
          </div>
          <div className="backup-actions">
            <button
              type="button"
              className="primary-button"
              onClick={onShowOverview}
            >
              View dashboard
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={onChangeShift}
            >
              Change shift
            </button>
            <button type="button" className="ghost-button" onClick={onLogout}>
              Log out
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page checklist-page">
      <section className="progress-panel">
        <div>
          <p className="eyebrow">{new Date().toLocaleDateString()}</p>
          <h1>
            {handledCount}/{tasks.length} handled
          </h1>
        </div>
        <div className="progress-track">
          <span
            style={{
              width: `${tasks.length ? (handledCount / tasks.length) * 100 : 0}%`,
            }}
          />
        </div>
        <div className="progress-breakdown">
          <span>{doneCount} done</span>
          <span>{notRelevantCount} not relevant</span>
          <span>{criticalRemaining} critical left</span>
          <span>{importantRemaining} important left</span>
        </div>
        {criticalRemaining > 0 ? (
          <p className="critical-warning">
            {criticalRemaining} critical{" "}
            {criticalRemaining === 1 ? "task is" : "tasks are"} still
            incomplete.
          </p>
        ) : (
          <p className="all-clear">All critical tasks are handled.</p>
        )}
        {user.baseName?.startsWith("Time2Staff") && (
          <p className="identity-reminder">You are logged as {user.name}.</p>
        )}
        {assignment && (
          <p
            className={`responsible-banner ${isResponsible ? "is-current" : ""}`}
          >
            {isResponsible
              ? "You are shift responsible."
              : `${assignment.responsibleName} is shift responsible today.`}
            {assignment.note ? ` ${assignment.note}` : ""}
          </p>
        )}
        {shiftType === "closing" && (
          <section className="readiness-card">
            <strong>
              Closing readiness:{" "}
              {criticalRemaining > 0
                ? `${criticalRemaining} critical tasks remaining`
                : "critical tasks handled"}
            </strong>
            <span>
              {securityRemaining} security | {posRemaining} register/POS |
              handover {hasHandover ? "present" : "missing"}
            </span>
          </section>
        )}
        <div className="backup-actions">
          <a className="handover-jump" href="#handover-notes">
            Jump to handover notes
          </a>
          {user.loginSource === "supabase_auth" && (
            <button
              type="button"
              className="ghost-button compact-button"
              onClick={async () => {
                const result = await onRestoreShiftData?.(date, shiftType);
                setRestoreMessage(
                  result?.ok
                    ? "Checklist refreshed from Supabase."
                    : "Could not refresh checklist backend data. Showing local cache.",
                );
              }}
            >
              Refresh checklist from backend
            </button>
          )}
          <button
            type="button"
            className="ghost-button compact-button"
            onClick={() => setShowAlert(true)}
          >
            Alert manager
          </button>
        </div>
        {restoreMessage && <p className="status-message">{restoreMessage}</p>}
        <div className="checklist-controls">
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={hideCompleted}
              onChange={(event) => setHideCompleted(event.target.checked)}
            />
            Hide handled
          </label>
          <label>
            Filter
            <select
              value={taskFilter}
              onChange={(event) => setTaskFilter(event.target.value)}
            >
              <option value="all">All</option>
              <option value="critical">Critical only</option>
              <option value="priority">Important + critical</option>
              <option value="needsInput">Needs input/comment</option>
            </select>
          </label>
        </div>
      </section>

      {Object.entries(grouped).map(([section, sectionTasks]) => (
        <section
          key={section}
          className={`task-section ${section.toLowerCase().includes("critical final") ? "final-checks-section" : ""}`}
        >
          <div className="section-heading">
            <p className="eyebrow">
              {section.toLowerCase().includes("critical final")
                ? "Final checks"
                : "Time block"}
            </p>
            <h2>{section}</h2>
            <span>
              {
                allGrouped[section].filter((task) =>
                  isHandled(logsByTask[task.id]),
                ).length
              }
              /{allGrouped[section].length} handled
              {" | "}
              {
                allGrouped[section].filter(
                  (task) =>
                    task.priority === "critical" &&
                    !isHandled(logsByTask[task.id]),
                ).length
              }{" "}
              critical remaining
            </span>
          </div>
          {sectionTasks.map((task) => {
            const log = logsByTask[task.id];
            const handled = isHandled(log);
            return (
              <article
                key={task.id}
                className={`task-card priority-${task.priority} status-${log?.status || "missing"}`}
              >
                <div className="task-main">
                  <div className="checkbox">
                    {log?.status === "done"
                      ? "OK"
                      : log?.status === "not_relevant"
                        ? "N/A"
                        : ""}
                  </div>
                  <div>
                    <div className="task-title-row">
                      <strong>{task.title}</strong>
                      <span className={`priority-badge ${task.priority}`}>
                        {priorityLabels[task.priority]}
                      </span>
                    </div>
                    {task.description && <small>{task.description}</small>}
                    <div className="task-labels">
                      <span>{task.area}</span>
                      <span>{task.timeBlock}</span>
                      {task.requiresComment && <span>Comment required</span>}
                    </div>
                  </div>
                </div>

                {!handled && (
                  <div className="task-inputs">
                    {taskNeedsInput(task) && task.inputType !== "comment" && (
                      <TaskInput
                        task={task}
                        value={drafts[task.id] || ""}
                        onChange={(value) =>
                          setDrafts((current) => ({
                            ...current,
                            [task.id]: value,
                          }))
                        }
                      />
                    )}
                    {task.requiresComment || task.inputType === "comment" ? (
                      <textarea
                        rows="2"
                        value={comments[task.id] || drafts[task.id] || ""}
                        onChange={(event) => {
                          setComments((current) => ({
                            ...current,
                            [task.id]: event.target.value,
                          }));
                          if (task.inputType === "comment") {
                            setDrafts((current) => ({
                              ...current,
                              [task.id]: event.target.value,
                            }));
                          }
                        }}
                        placeholder={
                          task.requiresComment
                            ? "Required reason or comment"
                            : "Add note if needed"
                        }
                      />
                    ) : (
                      <details className="optional-note">
                        <summary>Add note / reason</summary>
                        <textarea
                          rows="2"
                          value={comments[task.id] || ""}
                          onChange={(event) =>
                            setComments((current) => ({
                              ...current,
                              [task.id]: event.target.value,
                            }))
                          }
                          placeholder="Optional note or not relevant reason"
                        />
                      </details>
                    )}
                  </div>
                )}

                {handled && (
                  <div className="completion-box">
                    <strong>
                      {log.status === "done" ? "Done" : "Not relevant"}
                    </strong>
                    <span>
                      {log.completedBy} | {formatDateTime(log.completedAt)}
                    </span>
                    {log.input && <p>Input: {log.input}</p>}
                    {log.comment && <p>Comment: {log.comment}</p>}
                  </div>
                )}

                <div className="task-actions">
                  {!handled ? (
                    <>
                      <button
                        type="button"
                        className="primary-button compact-button"
                        onClick={() => saveTaskStatus(task, "done")}
                      >
                        Done
                      </button>
                      <button
                        type="button"
                        className="ghost-button compact-button"
                        onClick={() => saveTaskStatus(task, "not_relevant")}
                      >
                        Not relevant
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="ghost-button compact-button"
                      onClick={() => clearTask(task)}
                    >
                      Change status
                    </button>
                  )}
                  {!handled && (
                    <span className="save-as">Will save as {user.name}</span>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      ))}

      {visibleTasks.length === 0 && (
        <section className="empty-state">
          <h2>No tasks in this view</h2>
          <p className="muted">
            Adjust the filters to show more checklist items.
          </p>
        </section>
      )}

      <HandoverNotes
        user={user}
        shiftType={shiftType}
        notes={handoverNotes}
        setNotes={setHandoverNotes}
        onSync={onSyncHandover}
        backendShiftSessionId={backendShiftSessionId}
      />

      <section className="end-shift-summary">
        <div className="section-heading static-heading">
          <p className="eyebrow">Review</p>
          <h2>End shift summary</h2>
          <span>
            {hasHandover ? "Handover notes present" : "Handover notes missing"}
          </span>
        </div>
        <div className="summary-metrics">
          <span>Done {doneCount}</span>
          <span>Not relevant {notRelevantCount}</span>
          <span>Missing {missingCount}</span>
          <span>Critical missing {criticalRemaining}</span>
        </div>
        {criticalRemaining > 0 ? (
          <p className="critical-warning">
            Critical tasks still missing. Review before leaving.
          </p>
        ) : (
          <p className="all-clear">No critical tasks missing.</p>
        )}
      </section>
      <section className="finish-panel">
        <h2>Finish shift</h2>
        <p className="muted">
          Use this when you are done with this shift on this device.
        </p>
        <button type="button" className="primary-button" onClick={finishShift}>
          Finish shift
        </button>
      </section>
      {["closing", "event"].includes(shiftType) && (
        <>
          <CashInvoicePanel
            user={user}
            date={date}
            shiftType={shiftType}
            cashSignoffs={cashSignoffs}
            setCashSignoffs={setCashSignoffs}
            staffUsers={staffUsers}
            requestWriteAccess={requestWriteAccess}
            onSyncFinancialSignoff={onSyncFinancialSignoff}
          />
          <AssetCheckPanel
            user={user}
            date={date}
            shiftType={shiftType}
            assets={assets}
            assetChecks={assetChecks}
            setAssetChecks={setAssetChecks}
            requestWriteAccess={requestWriteAccess}
          />
        </>
      )}
      {showAlert && (
        <AlertManagerModal
          user={user}
          onClose={() => setShowAlert(false)}
          onSave={saveAlert}
        />
      )}
    </main>
  );
}

function ManagerDashboardJumpIndex() {
  const jumpItems = [
    { label: "Top", needles: ["dashboard"] },
    { label: "Backend", needles: ["backend status"] },
    { label: "Checklist", needles: ["checklist backend"] },
    { label: "Auth", needles: ["auth status"] },
    { label: "Staff", needles: ["staff codes", "site access"] },
    { label: "Alerts", needles: ["open alerts", "real alert"] },
    { label: "Daily report", needles: ["daily report"] },
    { label: "History", needles: ["backend history", "history by date"] },
    { label: "Assets", needles: ["asset registry", "payment terminals"] },
    { label: "Backup", needles: ["backup"] },
    { label: "Routines", needles: ["routine editor"] },
  ];

  function jumpTo(needles) {
    const normalizedNeedles = needles.map((needle) => needle.toLowerCase());
    const headings = Array.from(document.querySelectorAll("h1, h2, h3"));

    const target = headings.find((heading) => {
      const text = heading.textContent?.trim().toLowerCase() || "";
      return normalizedNeedles.some((needle) => text.includes(needle));
    });

    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <section className="panel manager-jump-index">
      <div className="section-heading static-heading">
        <div>
          <h2>Manager index</h2>
          <p className="muted">
            Jump directly to the section you need.
          </p>
        </div>
      </div>
      <div className="backup-actions">
        {jumpItems.map((item) => (
          <button
            key={item.label}
            type="button"
            className="ghost-button compact-button"
            onClick={() => jumpTo(item.needles)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-label="Back to dashboard top"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        style={{
          position: "fixed",
          right: "1rem",
          bottom: "1rem",
          zIndex: 9999,
          padding: "0.75rem 1rem",
          borderRadius: "999px",
          border: "1px solid rgba(255, 255, 255, 0.35)",
          background: "#111827",
          color: "#ffffff",
          fontWeight: 800,
          cursor: "pointer",
          boxShadow: "0 12px 32px rgba(0, 0, 0, 0.35)",
        }}
      >
        ↑ Top
      </button>
    </section>
  );
}

function ManagerDashboardActionCenter({
  date,
  authStatus,
  shiftDataStatus,
  financialBackendStatus,
  assetBackendStatus,
  dateAssetChecks,
  assetIssues,
  refreshShiftData,
  refreshFinancialSignoffs,
  refreshAssetRegistry,
  refreshAssetChecks,
  onClearSyncedLocalChecklistPendingRecords,
  onClearSyncedFinancialPendingRecords,
  onClearSyncedAssetPendingRecords,
}) {
  const [syncActionMessage, setSyncActionMessage] = useState("");
  const [syncActionBusy, setSyncActionBusy] = useState(false);

  async function runSyncAction(label, action) {
    if (syncActionBusy) return;

    setSyncActionBusy(true);
    setSyncActionMessage(label + " started...");

    try {
      const result = await action();
      setSyncActionMessage(result?.message || label + " finished.");
    } catch (error) {
      console.error(label + " failed:", error);
      setSyncActionMessage(error?.message || label + " failed.");
    } finally {
      setSyncActionBusy(false);
    }
  }

  function jumpTo(needles) {
    const normalizedNeedles = needles.map((needle) => needle.toLowerCase());
    const headings = Array.from(document.querySelectorAll("h1, h2, h3"));

    const target = headings.find((heading) => {
      const text = heading.textContent?.trim().toLowerCase() || "";
      return normalizedNeedles.some((needle) => text.includes(needle));
    });

    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function meaningfulBackendError(value) {
    if (!value) return false;

    const message = String(value).toLowerCase();

    return ![
      "auth_required",
      "email login required",
      "email login is required",
      "login required",
      "login is required",
      "showing local cache",
      "backend auth required",
      "local_only",
      "none",
    ].some((needle) => message.includes(needle));
  }

  function displayStatus(value) {
    if (!value) return "unknown";

    const normalized = String(value);

    if (normalized === "auth_required") return "auth pending";
    if (normalized === "local_only") return "local only";
    if (normalized === "authenticated") return "authenticated";

    return normalized;
  }

  const assetIssueCount = assetIssues?.length || 0;
  const assetCheckCount = dateAssetChecks?.length || 0;
  const assetPendingCount = assetBackendStatus?.pendingLocalRecords || 0;
  const financialPendingCount = financialBackendStatus?.pendingLocalRecords || 0;
  const checklistPendingCount = shiftDataStatus?.pendingLocalRecords || 0;

  const hasRealBackendError =
    meaningfulBackendError(assetBackendStatus?.lastError) ||
    meaningfulBackendError(financialBackendStatus?.lastError) ||
    meaningfulBackendError(shiftDataStatus?.lastError);

  const hasReviewItems =
    assetIssueCount > 0 ||
    assetPendingCount > 0 ||
    financialPendingCount > 0 ||
    checklistPendingCount > 0;

  const statusLabel = hasRealBackendError
    ? "Backend error"
    : hasReviewItems
      ? "Needs review"
      : "Looks good";

  function recommendedActions() {
    if (hasRealBackendError) {
      return [
        {
          title: "Check backend status",
          description:
            "A real backend warning is present. Open the backend section first.",
          label: "Open Backend",
          action: () => jumpTo(["backend status", "checklist backend"]),
        },
      ];
    }

    const actions = [];

    if (checklistPendingCount > 0) {
      actions.push({
        title: "Clean checklist pending records",
        description:
          checklistPendingCount +
          " local checklist sync record(s) need review or cleanup.",
        label: "Cleanup checklist",
        action: () =>
          runSyncAction("Cleanup checklist pending", () =>
            onClearSyncedLocalChecklistPendingRecords?.(),
          ),
      });
    }

    if (financialPendingCount > 0) {
      actions.push({
        title: "Clean financial pending records",
        description:
          financialPendingCount +
          " local financial sync record(s) need review or cleanup.",
        label: "Cleanup financial",
        action: () =>
          runSyncAction("Cleanup financial pending", () =>
            onClearSyncedFinancialPendingRecords?.(),
          ),
      });
    }

    if (assetPendingCount > 0) {
      actions.push({
        title: "Clean asset pending records",
        description:
          assetPendingCount +
          " local asset sync record(s) need review or cleanup.",
        label: "Cleanup assets",
        action: () =>
          runSyncAction("Cleanup asset pending", () =>
            onClearSyncedAssetPendingRecords?.(),
          ),
      });
    }

    if (assetIssueCount > 0) {
      actions.push({
        title: "Review asset issues",
        description: assetIssueCount + " asset issue(s) are listed for today.",
        label: "Open Assets",
        action: () => jumpTo(["asset registry", "asset check"]),
      });
    }

    if (actions.length === 0) {
      actions.push({
        title: "Review daily report",
        description:
          "No urgent follow-up detected. Daily report is the best next checkpoint.",
        label: "Open Daily report",
        action: () => jumpTo(["daily report"]),
      });
    }

    return actions.slice(0, 3);
  }

  const nextActions = recommendedActions();

  return (
    <section className="panel manager-action-center">
      <div className="section-heading static-heading">
        <div>
          <h2>Action center</h2>
          <p className="muted">
            Quick daily status, next actions and sync tools for manager follow-up.
          </p>
        </div>
        <span className={hasRealBackendError || hasReviewItems ? "status-pill warning" : "status-pill success"}>
          {statusLabel}
        </span>
      </div>

      <div className="status-grid">
        <span>
          <strong>{displayStatus(authStatus?.loginSource)}</strong> Login mode
        </span>
        <span>
          <strong>{displayStatus(shiftDataStatus?.mode)}</strong> Checklist backend
        </span>
        <span>
          <strong>{displayStatus(financialBackendStatus?.mode)}</strong> Financial backend
        </span>
        <span>
          <strong>{displayStatus(assetBackendStatus?.mode)}</strong> Asset backend
        </span>
        <span>
          <strong>{assetCheckCount}</strong> Asset checks today
        </span>
        <span>
          <strong>{assetIssueCount}</strong> Asset issues
        </span>
        <span>
          <strong>{checklistPendingCount}</strong> Pending checklist sync
        </span>
        <span>
          <strong>{financialPendingCount}</strong> Pending financial sync
        </span>
        <span>
          <strong>{assetPendingCount}</strong> Pending asset sync
        </span>
      </div>

      {hasRealBackendError && (
        <p className="critical-warning">
          Real backend error present. Check the relevant backend section.
        </p>
      )}

      {!hasRealBackendError && hasReviewItems && (
        <p className="muted">
          Review items found. This can be normal pending local work, old cached
          records, or operational issues that need checking.
        </p>
      )}

      {!hasRealBackendError && !hasReviewItems && (
        <p className="muted">
          No urgent manager follow-up detected.
        </p>
      )}

      <div className="section-heading static-heading">
        <div>
          <h3>Recommended next action</h3>
          <p className="muted">
            Suggested follow-up based on today’s dashboard status.
          </p>
        </div>
      </div>

      <div className="attention-grid">
        {nextActions.map((item) => (
          <article key={item.title}>
            <strong>{item.title}</strong>
            <p className="muted">{item.description}</p>
            <button
              type="button"
              className="ghost-button compact-button"
              disabled={syncActionBusy}
              onClick={item.action}
            >
              {item.label}
            </button>
          </article>
        ))}
      </div>

      <div className="section-heading static-heading">
        <div>
          <h3>Sync health actions</h3>
          <p className="muted">
            Refresh backend data or clean local pending records without scrolling.
          </p>
        </div>
      </div>

      {syncActionMessage && <p className="muted">{syncActionMessage}</p>}

      <div className="backup-actions">
        <button
          type="button"
          className="ghost-button compact-button"
          disabled={syncActionBusy}
          onClick={() =>
            runSyncAction("Refresh backend status", async () => {
              const results = await Promise.allSettled([
                refreshShiftData?.(date),
                refreshFinancialSignoffs?.(date),
                refreshAssetRegistry?.(),
                refreshAssetChecks?.(date),
              ]);

              const rejected = results.filter((result) => result.status === "rejected");

              return {
                ok: rejected.length === 0,
                message:
                  rejected.length === 0
                    ? "Backend status refreshed."
                    : "Backend refresh finished with one or more warnings.",
              };
            })
          }
        >
          Refresh backend status
        </button>

        <button
          type="button"
          className="ghost-button compact-button"
          disabled={syncActionBusy}
          onClick={() =>
            runSyncAction("Cleanup checklist pending", () =>
              onClearSyncedLocalChecklistPendingRecords?.(),
            )
          }
        >
          Cleanup checklist pending
        </button>

        <button
          type="button"
          className="ghost-button compact-button"
          disabled={syncActionBusy}
          onClick={() =>
            runSyncAction("Cleanup financial pending", () =>
              onClearSyncedFinancialPendingRecords?.(),
            )
          }
        >
          Cleanup financial pending
        </button>

        <button
          type="button"
          className="ghost-button compact-button"
          disabled={syncActionBusy}
          onClick={() =>
            runSyncAction("Cleanup asset pending", () =>
              onClearSyncedAssetPendingRecords?.(),
            )
          }
        >
          Cleanup asset pending
        </button>
      </div>

      <div className="backup-actions">
        <button
          type="button"
          className="ghost-button compact-button"
          onClick={() => jumpTo(["daily report"])}
        >
          Daily report
        </button>
        <button
          type="button"
          className="ghost-button compact-button"
          onClick={() => jumpTo(["asset registry", "asset check"])}
        >
          Assets
        </button>
        <button
          type="button"
          className="ghost-button compact-button"
          onClick={() => jumpTo(["open alerts", "needs attention"])}
        >
          Attention
        </button>
        <button
          type="button"
          className="ghost-button compact-button"
          onClick={() => jumpTo(["backend status", "checklist backend"])}
        >
          Backend
        </button>
      </div>
    </section>
  );
}

function ManagerDashboardSectionCollapseControls() {
  const storageKey = "mesh-manager-collapsed-sections-v1";
  const viewKey = "mesh-manager-dashboard-view-v1";

  function sectionIdFromHeading(text, index) {
    return (
      text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "section"
    ) + "-" + index;
  }

  function readState() {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "{}");
    } catch {
      return {};
    }
  }

  function writeState(state) {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  function sectionGroup(title) {
    const normalized = title.toLowerCase();

    if (
      [
        "backend status",
        "checklist backend status",
        "auth status",
        "supabase profiles",
        "diagnostics",
        "local data status",
        "real alert notifications",
        "clear test logs",
      ].some((needle) => normalized.includes(needle))
    ) {
      return "dev";
    }

    if (
      [
        "staff codes",
        "site access",
        "routine editor",
        "backup",
        "events",
        "responsibility roles",
      ].some((needle) => normalized.includes(needle))
    ) {
      return "admin";
    }

    return "operations";
  }

  function sectionSummary(title) {
    const normalized = title.toLowerCase();

    if (normalized.includes("backend status")) return "Backend/auth/system health tools.";
    if (normalized.includes("checklist backend")) return "Checklist sync, pending records and restore status.";
    if (normalized.includes("auth status")) return "Email login and Supabase Auth status.";
    if (normalized.includes("supabase profiles")) return "View backend user profiles and roles.";
    if (normalized.includes("site access")) return "Control access rules and manager permissions.";
    if (normalized.includes("staff codes")) return "Manage local staff-code users.";
    if (normalized.includes("open alerts")) return "Current alerts that need attention.";
    if (normalized.includes("daily report")) return "Copy/export today’s operational report.";
    if (normalized.includes("backend history")) return "Load backend history by date range.";
    if (normalized.includes("asset registry")) return "Payment terminals and POS/iPad asset list.";
    if (normalized.includes("asset")) return "Asset checks, missing devices and backend sync.";
    if (normalized.includes("cash") || normalized.includes("invoice")) return "Cash and invoice responsibility signoffs.";
    if (normalized.includes("routine editor")) return "Edit checklist routines and tasks.";
    if (normalized.includes("backup")) return "Export/import local app data.";
    if (normalized.includes("diagnostics")) return "Debug and backend test tools.";
    if (normalized.includes("missing tasks")) return "Tasks not completed for the selected date/filter.";
    if (normalized.includes("completed")) return "Completed and handled task history.";
    if (normalized.includes("handover")) return "Handover notes for selected date/filter.";
    if (normalized.includes("history")) return "Browse saved dates and historical records.";
    if (normalized.includes("needs attention")) return "Operational issues and warnings.";
    if (normalized.includes("events")) return "Create and manage event cards.";

    return "Open this section to view details.";
  }

  function collapsedForView(title, view) {
    const normalized = title.toLowerCase();
    const group = sectionGroup(title);

    if (view === "expand") return false;
    if (view === "collapse") return true;

    if (view === "operations") {
      return group !== "operations";
    }

    if (view === "admin") {
      return group !== "admin";
    }

    if (view === "dev") {
      return group !== "dev";
    }

    return [
      "diagnostics",
      "pilot quick start",
      "clear test logs",
      "routine editor",
      "supabase profiles",
      "site access",
      "real alert notifications",
      "local data status",
    ].some((needle) => normalized.includes(needle));
  }

  function getManagerSections() {
    const managerPage = document.querySelector(".manager-page");
    if (!managerPage) return [];

    return Array.from(managerPage.querySelectorAll("section"))
      .filter((section) => {
        if (
          section.classList.contains("intro") ||
          section.classList.contains("manager-jump-index") ||
          section.classList.contains("manager-collapse-toolbar")
        ) {
          return false;
        }

        return Boolean(section.querySelector("h2"));
      })
      .map((section, index) => {
        const heading = section.querySelector("h2");
        const title = heading?.textContent?.trim() || "Section";
        const id = sectionIdFromHeading(title, index);

        return { section, heading, title, id, index };
      });
  }

  function ensureSummary(section, heading, title) {
    let summary = section.querySelector("[data-manager-section-summary='true']");

    if (!summary) {
      summary = document.createElement("p");
      summary.dataset.managerSectionSummary = "true";
      summary.className = "muted manager-section-summary";
      summary.style.marginTop = "0.5rem";
      summary.style.marginBottom = "0.75rem";
      summary.textContent = sectionSummary(title);

      const headingRow = heading.closest(".section-heading");

      if (headingRow && headingRow.closest("section") === section) {
        headingRow.insertAdjacentElement("afterend", summary);
      } else {
        heading.insertAdjacentElement("afterend", summary);
      }
    }

    return summary;
  }

  function applyCollapsed(section, button, summary, collapsed) {
    Array.from(section.children).forEach((child) => {
      const keepVisible =
        child.classList.contains("section-heading") ||
        child.classList.contains("manager-collapse-control") ||
        child.dataset.managerSectionSummary === "true" ||
        child.tagName === "H2" ||
        child.contains(button);

      child.style.display = keepVisible ? "" : collapsed ? "none" : "";
    });

    summary.style.display = collapsed ? "" : "none";
    section.dataset.managerCollapsed = collapsed ? "true" : "false";
    button.textContent = collapsed ? "Show" : "Hide";
    button.setAttribute(
      "aria-label",
      collapsed ? "Show section" : "Hide section",
    );
  }

  function setupSectionToggles() {
    const state = readState();
    const view = localStorage.getItem(viewKey) || "operations";

    getManagerSections().forEach(({ section, heading, title, id }) => {
      const summary = ensureSummary(section, heading, title);
      let button = section.querySelector("[data-manager-collapse-toggle='true']");

      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.dataset.managerCollapseToggle = "true";
        button.className = "ghost-button compact-button manager-collapse-control";
        button.style.marginLeft = "auto";

        const headingRow = heading.closest(".section-heading");

        if (headingRow && headingRow.closest("section") === section) {
          headingRow.appendChild(button);
        } else {
          heading.insertAdjacentElement("afterend", button);
        }
      }

      const collapsed =
        typeof state[id] === "boolean"
          ? state[id]
          : collapsedForView(title, view);

      applyCollapsed(section, button, summary, collapsed);

      button.onclick = () => {
        const nextState = readState();
        const nextCollapsed = section.dataset.managerCollapsed !== "true";

        nextState[id] = nextCollapsed;
        writeState(nextState);
        applyCollapsed(section, button, summary, nextCollapsed);
      };
    });
  }

  function setPresetView(view) {
    const nextState = {};

    getManagerSections().forEach(({ section, heading, title, id }) => {
      const summary = ensureSummary(section, heading, title);
      const button = section.querySelector("[data-manager-collapse-toggle='true']");
      if (!button) return;

      const collapsed = collapsedForView(title, view);
      nextState[id] = collapsed;
      applyCollapsed(section, button, summary, collapsed);
    });

    localStorage.setItem(viewKey, view);
    writeState(nextState);
  }

  function setAllSections(collapsed) {
    const nextState = {};

    getManagerSections().forEach(({ section, heading, title, id }) => {
      const summary = ensureSummary(section, heading, title);
      const button = section.querySelector("[data-manager-collapse-toggle='true']");
      if (!button) return;

      nextState[id] = collapsed;
      applyCollapsed(section, button, summary, collapsed);
    });

    localStorage.setItem(viewKey, collapsed ? "collapse" : "expand");
    writeState(nextState);
  }

  function resetSections() {
    localStorage.setItem(viewKey, "operations");
    localStorage.removeItem(storageKey);
    setupSectionToggles();
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(setupSectionToggles);

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section className="panel manager-collapse-toolbar">
      <div className="section-heading static-heading">
        <div>
          <h2>Section controls</h2>
          <p className="muted">
            Choose what kind of work you are doing right now.
          </p>
        </div>
      </div>

      <div className="manager-view-guide">
        <p className="muted">
          <strong>Daily operations:</strong> daily report, alerts, assets and shift history.
        </p>
        <p className="muted">
          <strong>Setup / admin:</strong> staff codes, access, events, routines and backup.
        </p>
        <p className="muted">
          <strong>Backend / dev:</strong> sync status, auth, Supabase profiles and diagnostics.
        </p>
      </div>

      <div className="backup-actions">
        <button
          type="button"
          className="ghost-button compact-button"
          onClick={() => setPresetView("operations")}
        >
          Daily operations
        </button>
        <button
          type="button"
          className="ghost-button compact-button"
          onClick={() => setPresetView("admin")}
        >
          Setup / admin
        </button>
        <button
          type="button"
          className="ghost-button compact-button"
          onClick={() => setPresetView("dev")}
        >
          Backend / dev
        </button>
      </div>

      <div className="backup-actions">
        <button
          type="button"
          className="ghost-button compact-button"
          onClick={() => setAllSections(false)}
        >
          Expand all
        </button>
        <button
          type="button"
          className="ghost-button compact-button"
          onClick={() => setAllSections(true)}
        >
          Collapse all
        </button>
        <button
          type="button"
          className="ghost-button compact-button"
          onClick={resetSections}
        >
          Default: Daily operations
        </button>
      </div>
    </section>
  );
}

function ManagerDashboard({
  routines,
  setRoutines,
  staffUsers,
  setStaffUsers,
  logs,
  setLogs,
  handoverNotes,
  setHandoverNotes,
  finishRecords,
  setFinishRecords,
  alerts,
  setAlerts,
  responsibleAssignments,
  setResponsibleAssignments,
  siteSettings,
  setSiteSettings,
  siteOverrides,
  setSiteOverrides,
  events,
  setEvents,
  cashSignoffs,
  setCashSignoffs,
  assets,
  setAssets,
  assetChecks,
  setAssetChecks,
  eventTaskChecks,
  setEventTaskChecks,
  siteAccess,
  alertBackendStatus,
  shiftDataStatus,
  financialBackendStatus,
  assetBackendStatus,
  authStatus,
  refreshShiftData,
  refreshFinancialSignoffs,
  refreshAssetRegistry,
  refreshAssetChecks,
  onReviewFinancialSignoff,
  fetchAuthProfiles,
  onTestShiftBackendWrite,
  onClearSyncedLocalChecklistPendingRecords,
  onClearSyncedFinancialPendingRecords,
  onClearSyncedAssetPendingRecords,
  updateAlertRecord,
  retryAlertEmailNotification,
  refreshAlerts,
  retryAlertSync,
  checkLocation,
  requestWriteAccess,
  onResetPilotNotice,
  user,
}) {

  useEffect(() => {
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
    });
  }, []);

  const [date, setDate] = useState(todayKey());
  const [staffFilter, setStaffFilter] = useState("all");
  const [shiftFilter, setShiftFilter] = useState("all");
  const [showAllCritical, setShowAllCritical] = useState(false);
  const [editorTask, setEditorTask] = useState(blankTask);
  const [message, setMessage] = useState("");
  const [dailyReportText, setDailyReportText] = useState("");
  const [clearPhrase, setClearPhrase] = useState("");
  const [lastExportAt, setLastExportAt] = useState(() =>
    readStorage(LAST_EXPORT_KEY, ""),
  );
  const [responsibleForm, setResponsibleForm] = useState({
    shiftType: "closing",
    roleType: "overall_shift_lead",
    eventId: "",
    responsibleName: "",
    note: "",
  });
  const [showStaffCodes, setShowStaffCodes] = useState(false);
  const [staffForm, setStaffForm] = useState(blankStaffForm);
  const [siteForm, setSiteForm] = useState(siteSettings);
  const [overrideForm, setOverrideForm] = useState({
    duration: "15",
    reason: "",
  });
  const [eventForm, setEventForm] = useState(blankEventForm);
  const [assetForm, setAssetForm] = useState(blankAssetForm);
  const [showBackendDetails, setShowBackendDetails] = useState(false);
  const [showHistoryDetails, setShowHistoryDetails] = useState(false);
  const [showAuthDetails, setShowAuthDetails] = useState(false);
  const [authProfiles, setAuthProfiles] = useState([]);
  const [authProfilesMessage, setAuthProfilesMessage] = useState("");
  const [backendHistory, setBackendHistory] = useState(null);
  const [backendHistorySummary, setBackendHistorySummary] = useState(null);
  const [backendHistoryRange, setBackendHistoryRange] = useState([]);
  const [backendHistoryStatus, setBackendHistoryStatus] = useState({
    source: "unavailable",
    lastRefreshAt: "",
    lastError: "",
    duplicatesIgnored: 0,
    lastReportCopyAt: "",
    reportSource: "local_cache",
    rowsFetched: {
      shiftSessions: 0,
      taskCompletions: 0,
      handoverNotes: 0,
      alerts: 0,
      financialSignoffs: 0,
    },
  });

  const activeShifts = shiftOptions.filter((shift) => shift.id !== "guides");
  const todayEvents = events.filter((event) => event.date === date);
  const dateCashSignoffs = cashSignoffs.filter(
    (record) => record.date === date,
  );
  const backendDateFinancialSignoffs =
    backendHistory?.date === date ? backendHistory.financialSignoffs || [] : [];
  const visibleFinancialSignoffs = backendDateFinancialSignoffs.length
    ? backendDateFinancialSignoffs
    : dateCashSignoffs;
  function displayFinancialAnswer(record, valueKey, labelKey) {
    const label = record?.[labelKey];
    if (label) return label;

    const value = String(record?.[valueKey] || "")
      .trim()
      .toLowerCase();

    if (["yes", "true", "1", "y", "ja"].includes(value)) return "Yes";
    if (["no", "false", "0", "n", "nei"].includes(value)) return "No";

    return value ? record[valueKey] : "Not filled";
  }
  const dateAssetChecks = uniqueAssetChecksForDashboard(
    assetChecks.filter((record) => record.date === date),
  );
  const assetIssues = dateAssetChecks.filter(assetHasIssue);
  const activeAssets = assets.filter((asset) => asset.active !== false);
  const activeSiteOverride = isOverrideActive(siteOverrides);
  const allTasks = activeShifts.flatMap((shift) =>
    flattenTasks(routines, shift.id, date),
  );
  const visibleTasks = allTasks.filter(
    (task) => shiftFilter === "all" || task.shiftType === shiftFilter,
  );
  const rawDateLogs = logs.filter((log) => log.date === date);
  const dateLogs = uniqueTaskLogsForDashboard(rawDateLogs);
  const dateFinishRecords = finishRecords.filter(
    (record) => record.date === date,
  );
  const dateAlerts = alerts.filter((alert) => alert.date === date);
  const visibleAlerts = dateAlerts
    .filter((alert) => {
      if (staffFilter === "all") return true;
      return [alert.createdBy, alert.acknowledgedBy, alert.resolvedBy].includes(
        staffFilter,
      );
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const alertGroups = groupAlerts(visibleAlerts);
  const dateAlertGroups = groupAlerts(dateAlerts);
  const dateResponsible = responsibleAssignments.filter(
    (item) => item.date === date,
  );
  const filteredLogs = dateLogs.filter((log) => {
    const staffMatch = staffFilter === "all" || log.completedBy === staffFilter;
    const shiftMatch = shiftFilter === "all" || log.shiftType === shiftFilter;
    return staffMatch && shiftMatch;
  });
  const handledIds = new Set(
    dateLogs.filter(isHandled).map((log) => log.taskId),
  );
  const missingTasks = visibleTasks.filter((task) => !handledIds.has(task.id));
  const criticalMissing = missingTasks.filter(
    (task) => task.priority === "critical",
  );
  const visibleCritical = visibleTasks.filter(
    (task) => task.priority === "critical",
  );
  const criticalPanelTasks = showAllCritical
    ? visibleCritical
    : criticalMissing;
  const criticalGroups = groupBy(criticalPanelTasks, (task) => task.shiftType);
  const missingGroups = groupBy(
    missingTasks,
    (task) => `${task.shiftType}__${task.section}`,
  );
  const commentLogs = filteredLogs.filter((log) => log.comment);
  const inputDeviationLogs = filteredLogs.filter(hasDeviation);
  const time2StaffLogs = filteredLogs.filter((log) =>
    log.completedBy.includes("Time2Staff"),
  );
  const notRelevantLogs = filteredLogs.filter(
    (log) => log.status === "not_relevant",
  );
  const staffNames = [
    ...new Set(
      [
        ...logs.map((log) => log.completedBy),
        ...alerts.flatMap((alert) => [
          alert.createdBy,
          alert.acknowledgedBy,
          alert.resolvedBy,
        ]),
      ].filter(Boolean),
    ),
  ].sort();
  const dates = [
    ...new Set(
      [
        ...logs.map((log) => log.date),
        ...alerts.map((alert) => alert.date),
        ...finishRecords.map((record) => record.date),
        ...responsibleAssignments.map((item) => item.date),
      ].filter(Boolean),
    ),
  ]
    .sort()
    .reverse();
  const visibleHandovers = Object.values(handoverNotes).filter((note) => {
    if (note.date !== date) return false;
    if (shiftFilter !== "all" && note.shiftType !== shiftFilter) return false;
    if (staffFilter !== "all" && note.completedBy !== staffFilter) return false;
    return [
      note.nextShift,
      note.lowStock,
      note.maintenance,
      note.memberEvent,
    ].some(Boolean);
  });
  const handoverGroups = groupBy(visibleHandovers, (note) => note.shiftType);
  const allHandoversWithContent =
    Object.values(handoverNotes).filter(handoverHasContent);
  const loggedDates = [
    ...new Set(
      [
        ...logs.map((log) => log.date),
        ...allHandoversWithContent.map((note) => note.date),
        ...alerts.map((alert) => alert.date),
        ...finishRecords.map((record) => record.date),
        ...responsibleAssignments.map((item) => item.date),
      ].filter(Boolean),
    ),
  ].length;
  const handledRecords =
    uniqueTaskLogsForDashboard(logs).filter(isHandled).length;
  const usingDefaultRoutines = routinesUseDefaults(routines);
  const normalizedRoutineList = normalizeRoutines(routines);
  const allRoutineTasks = normalizedRoutineList.flatMap(
    (routine) => routine.tasks,
  );
  const activeTaskCount = allRoutineTasks.filter(
    (task) => task.active !== false,
  ).length;
  const inactiveTaskCount = allRoutineTasks.filter(
    (task) => task.active === false,
  ).length;
  const backupAgeDays = lastExportAt
    ? (Date.now() - new Date(lastExportAt).getTime()) / 86400000
    : null;
  const backupStatus =
    handledRecords ||
    allHandoversWithContent.length ||
    alerts.length ||
    finishRecords.length ||
    responsibleAssignments.length
      ? !lastExportAt
        ? "No backup exported yet."
        : backupAgeDays > 7
          ? "Backup recommended."
          : "Backup up to date."
      : "No shift data yet.";

  useEffect(() => {
    refreshAlerts({ reason: "manager_dashboard_open" });
  }, []);

  useEffect(() => {
    refreshShiftData?.(date);
    refreshFinancialSignoffs?.(date);
  }, [date]);

  const attentionItems = [
    ...criticalMissing.slice(0, 4).map((task) => ({
      id: task.id,
      title: task.title,
      detail: `${shiftLabels[task.shiftType]} | ${task.section}`,
      type: "Critical missing",
    })),
    ...notRelevantLogs.slice(0, 3).map((log) => ({
      id: `${log.id}-na`,
      title: log.taskTitle,
      detail: `${log.completedBy}: ${log.comment || "No reason added"}`,
      type: "Not relevant",
    })),
    ...inputDeviationLogs.slice(0, 3).map((log) => ({
      id: `${log.id}-input`,
      title: log.taskTitle,
      detail: `${log.inputType}: ${log.input || log.comment}`,
      type: "Input/deviation",
    })),
    ...time2StaffLogs.slice(0, 2).map((log) => ({
      id: `${log.id}-t2s`,
      title: log.taskTitle,
      detail: `${log.completedBy} | ${shiftLabels[log.shiftType]}`,
      type: "Time2Staff",
    })),
    ...visibleHandovers.slice(0, 3).map((note) => ({
      id: `${note.date}-${note.shiftType}-${note.completedBy}`,
      title: `${shiftLabels[note.shiftType]} handover`,
      detail: note.completedBy,
      type: "Handover",
    })),
  ];

  function buildDailyReport() {
    const lines = [
      "Mesh Shift Log - Daily report",
      `Date: ${date}`,
      `Site override used: ${siteOverrides.some((entry) => entry.overrideAt?.startsWith(date)) ? "yes" : "no"}`,
      "",
    ];
    if (dateResponsible.length) {
      lines.push("Responsibility assignments:");
      dateResponsible.forEach((assignment) => {
        const eventName = assignment.eventId
          ? todayEvents.find((event) => event.id === assignment.eventId)
              ?.eventName
          : "";
        lines.push(
          `- ${responsibilityLabels[assignment.roleType] || "Overall shift lead"}: ${assignment.responsibleName} (${eventName || shiftLabels[assignment.shiftType] || assignment.shiftType})`,
        );
      });
      lines.push("");
    }
    if (todayEvents.length) {
      lines.push("Events:");
      todayEvents.forEach((event) => {
        lines.push(
          `- ${event.eventName} | ${event.client} | ${event.venue} | ${event.startTime}-${event.endTime}`,
        );
        lines.push(
          `  Event: ${event.eventResponsible || "Unassigned"} | Cash/invoice: ${event.cashInvoiceResponsible || "Unassigned"} | Locking: ${event.lockingResponsible || "Unassigned"}`,
        );
      });
      lines.push("");
    }
    activeShifts.forEach((shift) => {
      const shiftTasks = flattenTasks(routines, shift.id, date);
      const shiftLogs = dateLogs.filter((log) => log.shiftType === shift.id);
      const done = shiftLogs.filter((log) => log.status === "done").length;
      const notRelevant = shiftLogs.filter(
        (log) => log.status === "not_relevant",
      ).length;
      const handled = done + notRelevant;
      const missing = Math.max(shiftTasks.length - handled, 0);
      const criticalMissingCount = shiftTasks.filter(
        (task) => task.priority === "critical" && !handledIds.has(task.id),
      ).length;
      const staff = [...new Set(shiftLogs.map((log) => log.completedBy))];
      const shiftHandovers = visibleHandovers.filter(
        (note) => note.shiftType === shift.id,
      );
      const finish = dateFinishRecords.find(
        (record) => record.shiftType === shift.id,
      );
      const responsible = dateResponsible.find(
        (item) => item.shiftType === shift.id,
      );
      if (
        handled === 0 &&
        shiftHandovers.length === 0 &&
        !finish &&
        !responsible &&
        missing === shiftTasks.length
      )
        return;
      lines.push(shift.label);
      if (responsible)
        lines.push(`Responsible: ${responsible.responsibleName}`);
      if (finish)
        lines.push(
          `Finished: ${finish.finishedBy} at ${formatDateTime(finish.finishedAt)}`,
        );
      lines.push(`Handled: ${handled} / ${shiftTasks.length}`);
      lines.push(`Done: ${done}`);
      lines.push(`Not relevant: ${notRelevant}`);
      lines.push(`Missing: ${missing}`);
      lines.push(`Critical missing: ${criticalMissingCount}`);
      lines.push(`Staff: ${staff.length ? staff.join(", ") : "None logged"}`);
      if (shiftHandovers.length) {
        lines.push("");
        lines.push("Handover:");
        shiftHandovers.forEach((note) => {
          lines.push(`- ${note.completedBy}`);
          if (note.nextShift) lines.push(`  Next shift: ${note.nextShift}`);
          if (note.lowStock) lines.push(`  Low stock: ${note.lowStock}`);
          if (note.maintenance)
            lines.push(`  Maintenance: ${note.maintenance}`);
          if (note.memberEvent)
            lines.push(`  Member/event: ${note.memberEvent}`);
        });
      }
      const shiftAttention = shiftLogs.filter(
        (log) => log.status === "not_relevant" || log.comment || log.input,
      );
      if (shiftAttention.length) {
        lines.push("");
        lines.push("Attention:");
        shiftAttention.forEach((log) => {
          const detail = log.comment || log.input || log.status;
          lines.push(`- ${log.taskTitle}: ${detail}`);
        });
      }
      lines.push("");
    });
    if (dateAlerts.length) {
      const reportAlertGroups = [
        [
          "Open alerts",
          [...dateAlertGroups.openUrgent, ...dateAlertGroups.openNormal],
        ],
        ["Acknowledged alerts", dateAlertGroups.acknowledged],
        ["Resolved alerts", dateAlertGroups.resolved],
      ];
      lines.push("Alerts:");
      reportAlertGroups.forEach(([title, alertList]) => {
        lines.push(title);
        if (alertList.length === 0) {
          lines.push("- None");
          return;
        }
        alertList.forEach((alert) => {
          lines.push(`- ${alert.severity} | ${alert.category} | ${alert.area}`);
          lines.push(`  Message: ${alert.message}`);
          lines.push(
            `  Created by: ${alert.createdBy} at ${formatDateTime(alert.createdAt)}`,
          );
          lines.push(`  Status: ${alertStatus(alert)}`);
          if (alert.needsImmediateHelp)
            lines.push("  Needs immediate help: yes");
          if (alertNeedsEmail(alert))
            lines.push(
              `  Email notification: ${emailStatusLabel(alert) || "not required"}`,
            );
          if (alert.acknowledgedBy)
            lines.push(
              `  Acknowledged by: ${alert.acknowledgedBy} at ${formatDateTime(alert.acknowledgedAt)}`,
            );
          if (alert.resolvedBy)
            lines.push(
              `  Resolved by: ${alert.resolvedBy} at ${formatDateTime(alert.resolvedAt)}`,
            );
          if (alert.managerNote)
            lines.push(`  Manager note: ${alert.managerNote}`);
        });
      });
      lines.push("");
    }
    if (dateCashSignoffs.length) {
      lines.push("Cash/invoice signoffs:");
      dateCashSignoffs.forEach((record) => {
        lines.push(
          `- ${record.shiftType}${record.eventId ? " event" : ""}: invoice/report ${record.invoiceSent || "missing"}, sales ${record.salesPunched || "missing"}, settlement ${record.settlementPerformed || "missing"}`,
        );
        lines.push(
          `  Performed by: ${record.settlementPerformedBy || "Missing"} | Signed off by: ${record.signedOffBy || "Missing"}`,
        );
        if (record.comments) lines.push(`  Comment: ${record.comments}`);
      });
      lines.push("");
    }
    if (assetIssues.length) {
      lines.push("Asset check issues:");
      assetIssues.forEach((record) => {
        lines.push(
          `- ${record.assetLabel}: ${record.condition} | present ${record.present || "missing"} | charging ${record.charging || "missing"}`,
        );
        if (record.comment) lines.push(`  Comment: ${record.comment}`);
      });
      lines.push("");
    }
    return lines.join("\n").trim();
  }

  function buildDiagnostics() {
    return [
      "Mesh Shift Log diagnostics",
      `Version: ${APP_VERSION}`,
      `Release: ${RELEASE_LABEL}`,
      `Release summary: ${RELEASE_SUMMARY}`,
      `Alert sync build: ${ALERT_SYNC_BUILD}`,
      `Supabase configured: ${isSupabaseConfigured ? "yes" : "no"}`,
      `Phase: 3C Auth lockdown transition`,
      `Require auth for backend: ${isBackendAuthRequired ? "yes" : "no"}`,
      `Alerts source: ${backendSourceLabel(alertBackendStatus.source)}`,
      `Backend request mode: ${alertBackendStatus.backendRequestMode || "unknown"}`,
      `Alerts using authenticated token: ${alertBackendStatus.alertsUsingAuthenticatedToken ? "yes" : "no"}`,
      `Backend auth user id: ${alertBackendStatus.backendAuthUserId || "none"}`,
      `Backend profile role: ${alertBackendStatus.backendProfileRole || "none"}`,
      `Polling enabled: ${alertBackendStatus.pollingEnabled ? "yes" : "no"}`,
      `Polling interval seconds: ${alertBackendStatus.pollingIntervalSeconds}`,
      `Last refresh reason: ${alertBackendStatus.lastRefreshReason}`,
      `Last alert sync attempt: ${alertBackendStatus.lastSyncAttemptAt || "none"}`,
      `Last successful alert sync: ${alertBackendStatus.lastSuccessfulSyncAt || "none"}`,
      `Last poll started: ${alertBackendStatus.lastPollStartedAt || "none"}`,
      `Last poll completed: ${alertBackendStatus.lastPollCompletedAt || "none"}`,
      `Last alert poll attempt: ${alertBackendStatus.lastPollAttemptAt || "none"}`,
      `Last successful alert poll: ${alertBackendStatus.lastSuccessfulPollAt || "none"}`,
      `Last manual refresh: ${alertBackendStatus.lastManualRefreshAt || "none"}`,
      `Last successful Supabase read: ${alertBackendStatus.lastSuccessfulSupabaseReadAt || "none"}`,
      `Alert sync error: ${alertBackendStatus.lastSyncError || "none"}`,
      `Last email notification attempt: ${alertBackendStatus.lastEmailNotificationAttemptAt || "none"}`,
      `Last email notification result: ${alertBackendStatus.lastEmailNotificationResult || "none"}`,
      `Last email notification error: ${alertBackendStatus.lastEmailNotificationError || "none"}`,
      `Supabase alert count: ${alertBackendStatus.supabaseAlertCount}`,
      `Supabase rows fetched: ${alertBackendStatus.supabaseRowsFetched}`,
      `Merged alerts count: ${alertBackendStatus.mergedAlertsCount}`,
      `Current visible alerts count: ${alertBackendStatus.visibleAlertsCount}`,
      `Current visible open alerts count: ${alertBackendStatus.visibleOpenAlertsCount}`,
      `Local cached alert count: ${alertBackendStatus.localCachedAlertCount}`,
      `Unsynced local alerts: ${alertBackendStatus.unsyncedLocalAlertCount}`,
      `Pending auth sync alerts: ${alertBackendStatus.pendingAuthAlertCount || 0}`,
      `Local-only alerts: ${alertBackendStatus.localOnlyAlertCount || 0}`,
      `Users: ${staffUsers.length}`,
      `Sections: ${normalizedRoutineList.length}`,
      `Active tasks: ${activeTaskCount}`,
      `Inactive tasks: ${inactiveTaskCount}`,
      `Logged dates: ${loggedDates}`,
      `Task records: ${logs.length}`,
      `Handled records: ${handledRecords}`,
      `Handover notes: ${allHandoversWithContent.length}`,
      `Finish records: ${finishRecords.length}`,
      `Alerts: ${alerts.length}`,
      `Open alerts: ${alerts.filter(isOpenAlert).length}`,
      `Acknowledged alerts: ${alerts.filter((alert) => alertStatus(alert) === "acknowledged").length}`,
      `Resolved alerts: ${alerts.filter((alert) => alertStatus(alert) === "resolved").length}`,
      `Responsible assignments: ${responsibleAssignments.length}`,
      `Assets: ${assets.length}`,
      `Active assets: ${activeAssets.length}`,
      `Asset issues today: ${assetIssues.length}`,
      `Events: ${events.length}`,
      `Cash/invoice signoffs: ${cashSignoffs.length}`,
      `Financial backend mode: ${financialBackendStatus.mode}`,
      `Financial backend last action: ${financialBackendStatus.lastAction || "none"}`,
      `Financial backend last result: ${financialBackendStatus.lastResult || "none"}`,
      `Financial backend rows loaded: ${financialBackendStatus.rowsLoaded || 0}`,
      `Financial backend rows merged: ${financialBackendStatus.rowsMerged || 0}`,
      `Financial backend duplicates ignored: ${financialBackendStatus.duplicatesIgnored || 0}`,
      `Pending local financial records: ${financialBackendStatus.pendingLocalRecords || 0}`,
      `Pending financial records matched in backend: ${financialBackendStatus.pendingMatchedInBackend || 0}`,
      `Local-only financial records remaining: ${financialBackendStatus.localOnlyRemaining || 0}`,
      `Financial backend cleanup result: ${financialBackendStatus.lastCleanupResult || "none"}`,
      `Financial backend error: ${financialBackendStatus.lastError || "none"}`,
      `Asset backend mode: ${assetBackendStatus.mode}`,
      `Asset backend last action: ${assetBackendStatus.lastAction || "none"}`,
      `Asset backend last result: ${assetBackendStatus.lastResult || "none"}`,
      `Asset backend rows loaded: ${assetBackendStatus.rowsLoaded || 0}`,
      `Asset backend rows merged: ${assetBackendStatus.rowsMerged || 0}`,
      `Asset backend duplicates ignored: ${assetBackendStatus.duplicatesIgnored || 0}`,
      `Asset checks today: ${dateAssetChecks.length}`,
      `Asset issues today: ${assetIssues.length}`,
      `Pending local asset checks: ${assetBackendStatus.pendingLocalRecords || 0}`,
      `Local-only asset checks remaining: ${assetBackendStatus.localOnlyRemaining || 0}`,
      `Asset backend cleanup result: ${assetBackendStatus.lastCleanupResult || "none"}`,
      `Asset backend error: ${assetBackendStatus.lastError || "none"}`,
      `Shift data backend mode: ${shiftDataStatus.mode}`,
      `Task completions source: ${shiftDataStatus.taskCompletionsSource}`,
      `Handover notes source: ${shiftDataStatus.handoverNotesSource}`,
      `Last Phase 4A action attempted: ${shiftDataStatus.lastPhase4Action || "none"}`,
      `Last Phase 4A action result: ${shiftDataStatus.lastPhase4Result || "none"}`,
      `Backend table write attempted: ${shiftDataStatus.backendTableWriteAttempted ? "yes" : "no"}`,
      `Backend table write succeeded: ${shiftDataStatus.backendTableWriteSucceeded ? "yes" : "no"}`,
      `Last shift data sync: ${shiftDataStatus.lastShiftDataSyncAt || "none"}`,
      `Pending local task completions: ${shiftDataStatus.pendingTaskCompletionsCount || 0}`,
      `Pending auth task completions: ${shiftDataStatus.pendingAuthTaskCompletionsCount || 0}`,
      `Pending backend retry task completions: ${shiftDataStatus.pendingBackendRetryTaskCompletionsCount || 0}`,
      `Synced local task completions: ${shiftDataStatus.syncedTaskCompletionsCount || 0}`,
      `Pending handover notes: ${shiftDataStatus.pendingHandoverNotesCount || 0}`,
      `Supabase shift sessions loaded: ${shiftDataStatus.backendShiftSessionsLoaded || 0}`,
      `Supabase active sessions: ${shiftDataStatus.backendActiveShiftSessions || 0}`,
      `Supabase finished sessions: ${shiftDataStatus.backendFinishedShiftSessions || 0}`,
      `Supabase task rows loaded: ${shiftDataStatus.backendTaskRowsLoaded || 0}`,
      `Supabase done task rows: ${shiftDataStatus.backendDoneTaskRows || 0}`,
      `Supabase not relevant task rows: ${shiftDataStatus.backendNotRelevantTaskRows || 0}`,
      `Supabase open/reset task rows: ${shiftDataStatus.backendOpenTaskRows || 0}`,
      `Supabase handover rows loaded: ${shiftDataStatus.backendHandoverRowsLoaded || 0}`,
      `Merged unique task completions: ${shiftDataStatus.mergedUniqueTaskCompletions || 0}`,
      `Ignored duplicate task rows: ${shiftDataStatus.ignoredDuplicateTaskRows || 0}`,
      `Last backend count refresh: ${shiftDataStatus.lastBackendCountRefreshAt || "none"}`,
      `Last backend count error: ${shiftDataStatus.lastBackendCountError || "none"}`,
      `Latest shift session: ${shiftDataStatus.latestShiftSessionDate || "none"} ${shiftDataStatus.latestShiftSessionShift || ""} ${shiftDataStatus.latestShiftSessionStatus || ""}`,
      `Latest shift session finished at: ${shiftDataStatus.latestShiftSessionFinishedAt || "none"}`,
      `Latest shift session backend id: ${shiftDataStatus.latestShiftSessionBackendId || "none"}`,
      `Last backend restore attempt: ${shiftDataStatus.lastBackendRestoreAttemptAt || "none"}`,
      `Last backend restore result: ${shiftDataStatus.lastBackendRestoreResult || "none"}`,
      `Backend restore rows fetched: ${shiftDataStatus.backendRestoreRowsFetched || 0}`,
      `Backend restore rows merged: ${shiftDataStatus.backendRestoreRowsMerged || 0}`,
      `Backend restore duplicates ignored: ${shiftDataStatus.backendRestoreDuplicatesIgnored || 0}`,
      `Local pending matched in backend: ${shiftDataStatus.localPendingRecordsMatchedInBackend || 0}`,
      `Local-only records remaining: ${shiftDataStatus.localOnlyRecordsRemaining || 0}`,
      `Last cleanup result: ${shiftDataStatus.lastCleanupResult || "none"}`,
      `Last Phase 4A error: ${shiftDataStatus.lastPhase4Error || shiftDataStatus.lastShiftSyncError || shiftDataStatus.lastBackendCountError || "none"}`,
      `Last backend history refresh: ${backendHistoryStatus.lastRefreshAt || "none"}`,
      `Backend history shift sessions fetched: ${backendHistoryStatus.rowsFetched.shiftSessions || 0}`,
      `Backend history task completions fetched: ${backendHistoryStatus.rowsFetched.taskCompletions || 0}`,
      `Backend history handover notes fetched: ${backendHistoryStatus.rowsFetched.handoverNotes || 0}`,
      `Backend history alerts fetched: ${backendHistoryStatus.rowsFetched.alerts || 0}`,
      `Backend history financial signoffs fetched: ${backendHistoryStatus.rowsFetched.financialSignoffs || 0}`,
      `Backend history duplicates ignored: ${backendHistoryStatus.duplicatesIgnored || 0}`,
      `Backend report source: ${backendHistoryStatus.reportSource || "none"}`,
      `Last backend report copy: ${backendHistoryStatus.lastReportCopyAt || "none"}`,
      `Last backend history error: ${backendHistoryStatus.lastError || "none"}`,
      `Site check: ${siteSettings.locationCheckEnabled ? "enabled" : "disabled"}`,
      `Location overrides: ${siteOverrides.length}`,
      `Routine source: ${usingDefaultRoutines ? "default routines" : "local edited/imported routines"}`,
      `LocalStorage estimate: ${estimateLocalStorageSize()}`,
      `Last backup: ${lastExportAt ? formatBackupTime(lastExportAt) : "none"}`,
    ].join("\n");
  }

  function buildPilotInstructions() {
    return [
      "Mesh Shift Log pilot instructions:",
      "",
      "1. Open the app.",
      "2. Enter your staff code.",
      "3. Time2Staff: use OPEN, CLOSE or EVENT and enter your real first name.",
      "4. Choose your shift.",
      "5. Mark tasks Done only when completed.",
      "6. Use Not relevant only when the task does not apply today, and add a reason when asked.",
      "7. Add handover notes before leaving.",
      "8. Critical tasks must be physically checked.",
      "",
      "Data is saved on this device/browser only.",
    ].join("\n");
  }

  function progressForShift(shiftType) {
    const shiftTasks = flattenTasks(routines, shiftType, date);
    const shiftLogs = dateLogs.filter((log) => log.shiftType === shiftType);
    const done = shiftLogs.filter((log) => log.status === "done").length;
    const notRelevant = shiftLogs.filter(
      (log) => log.status === "not_relevant",
    ).length;
    const handled = done + notRelevant;
    const missing = Math.max(shiftTasks.length - handled, 0);
    const criticalMissingCount = shiftTasks.filter(
      (task) => task.priority === "critical" && !handledIds.has(task.id),
    ).length;
    return {
      done,
      notRelevant,
      missing,
      criticalMissing: criticalMissingCount,
      total: shiftTasks.length,
    };
  }

  function offsetDate(days) {
    const nextDate = new Date(`${todayKey()}T00:00:00`);
    nextDate.setDate(nextDate.getDate() + days);
    return nextDate.toISOString().slice(0, 10);
  }

  async function refreshBackendHistory(selectedDate = date) {
    if (authStatus.loginSource !== "supabase_auth") {
      setBackendHistoryStatus((current) => ({
        ...current,
        source: "local_cache",
        lastError: "Email login is required for backend history.",
      }));
      setMessage("Backend history requires Email login. Showing local cache.");
      return { ok: false };
    }
    const result = await fetchManagerDailyHistory(selectedDate);
    if (!result.ok) {
      setBackendHistoryStatus((current) => ({
        ...current,
        source: "unavailable",
        lastRefreshAt: new Date().toISOString(),
        lastError: result.message || "Could not fetch backend history.",
        reportSource: "local_cache",
      }));
      setMessage("Could not fetch backend history. Showing local cache.");
      return result;
    }
    setBackendHistory(result.history);
    setBackendHistorySummary(result.summary);
    setBackendHistoryStatus({
      source: "supabase",
      lastRefreshAt: result.history.fetchedAt,
      lastError: "",
      duplicatesIgnored: result.history.duplicatesIgnored || 0,
      lastReportCopyAt: backendHistoryStatus.lastReportCopyAt,
      reportSource: "supabase",
      rowsFetched: {
        shiftSessions: result.history.shiftSessions.length,
        taskCompletions:
          result.history.rawTaskRows ?? result.history.taskCompletions.length,
        handoverNotes: result.history.handoverNotes.length,
        alerts: result.history.alerts.length,
        financialSignoffs:
          result.history.rawFinancialRows ??
          result.history.financialSignoffs?.length ??
          0,
      },
    });
    setMessage("Backend history refreshed from Supabase.");
    return result;
  }

  async function refreshBackendHistoryRange() {
    if (authStatus.loginSource !== "supabase_auth") {
      setMessage("Backend history requires Email login.");
      return;
    }
    const result = await fetchManagerHistoryRange(offsetDate(-6), todayKey());
    if (!result.ok) {
      setBackendHistoryStatus((current) => ({
        ...current,
        source: "unavailable",
        lastError: result.message || "Could not fetch backend history range.",
      }));
      setMessage("Could not fetch last 7 days from Supabase.");
      return;
    }
    setBackendHistoryRange(result.days);
    setBackendHistoryStatus((current) => ({
      ...current,
      source: "supabase",
      lastRefreshAt: result.fetchedAt,
      lastError: "",
    }));
    setMessage("Last 7 days loaded from Supabase.");
  }

  async function copyBackendDailyReport() {
    let history = backendHistory;
    let source = "supabase";
    if (!history || history.date !== date) {
      const result = await refreshBackendHistory(date);
      if (result.ok) history = result.history;
    }
    let report;
    if (history && history.date === date) {
      report = buildDailyReportFromBackend(history, { generatedBy: user.name });
    } else {
      source = "local_cache";
      report = `Local cache report\n\n${buildDailyReport()}`;
    }
    setDailyReportText(report);
    try {
      await navigator.clipboard.writeText(report);
      setMessage(
        source === "supabase"
          ? "Backend daily report copied. Source: Supabase backend."
          : "Local cache report copied. Source: Local cache fallback.",
      );
    } catch {
      setMessage(
        "Could not copy automatically. You can manually select the report text below.",
      );
    }
    setBackendHistoryStatus((current) => ({
      ...current,
      reportSource: source,
      lastReportCopyAt: new Date().toISOString(),
    }));
  }

  function exportData() {
    const exportedAt = new Date().toISOString();
    const payload = {
      appVersion: APP_VERSION,
      exportedAt,
      logs,
      routines,
      staffUsers,
      handoverNotes,
      finishRecords,
      alerts,
      responsibleAssignments,
      siteSettings,
      siteOverrides,
      events,
      cashSignoffs,
      assets,
      assetChecks,
      eventTaskChecks,
      lastExportAt: exportedAt,
      settings: {
        pilotNoticeAccepted: readStorage(PILOT_NOTICE_KEY, false),
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = backupFilename(new Date(exportedAt));
    link.click();
    URL.revokeObjectURL(url);
    setLastExportAt(exportedAt);
    saveStorage(LAST_EXPORT_KEY, exportedAt);
    setMessage("Backup exported.");
  }

  function clearTestLogs() {
    if (clearPhrase !== "CLEAR") {
      setMessage("Type CLEAR to confirm clearing test logs.");
      return;
    }
    const confirmed = window.confirm(
      "This clears local shift logs, handover notes, alerts, finish records, responsible assignments, events, signoffs, asset checks and override history from this browser only. Routine setup, site settings, staff codes and asset registry will stay. Export a backup first if needed.",
    );
    if (!confirmed) return;
    setLogs([]);
    setHandoverNotes({});
    setFinishRecords([]);
    setAlerts([]);
    setResponsibleAssignments([]);
    setSiteOverrides([]);
    setEvents([]);
    setCashSignoffs([]);
    setAssetChecks([]);
    setEventTaskChecks([]);
    saveStorage(LOG_KEY, []);
    saveStorage(HANDOVER_KEY, {});
    saveStorage(FINISH_KEY, []);
    saveStorage(ALERT_KEY, []);
    saveStorage(RESPONSIBLE_KEY, []);
    saveStorage(SITE_OVERRIDE_KEY, []);
    saveStorage(EVENTS_KEY, []);
    saveStorage(CASH_SIGNOFF_KEY, []);
    saveStorage(ASSET_CHECK_KEY, []);
    saveStorage(EVENT_TASK_CHECK_KEY, []);
    setClearPhrase("");
    setMessage("Test logs cleared from this browser.");
  }

  async function copyDailyReport() {
    const report = buildDailyReport();
    setDailyReportText(report);
    try {
      await navigator.clipboard.writeText(report);
      setMessage("Daily report copied.");
    } catch {
      setMessage(
        "Could not copy automatically. You can manually select the report text below.",
      );
    }
  }

  async function copyDiagnostics() {
    try {
      await navigator.clipboard.writeText(buildDiagnostics());
      setMessage("Diagnostics copied.");
    } catch {
      setMessage(
        "Could not copy diagnostics automatically. Select the text below and copy it manually.",
      );
    }
  }

  async function copyPilotInstructions() {
    try {
      await navigator.clipboard.writeText(buildPilotInstructions());
      setMessage("Pilot instructions copied.");
    } catch {
      setMessage(
        "Could not copy pilot instructions automatically. Select the text below and copy it manually.",
      );
    }
  }

  function importData(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (data.logs && !Array.isArray(data.logs))
          throw new Error("Logs must be an array.");
        if (data.routines && !Array.isArray(data.routines))
          throw new Error("Routines must be an array.");
        if (data.finishRecords && !Array.isArray(data.finishRecords))
          throw new Error("Finish records must be an array.");
        if (data.alerts && !Array.isArray(data.alerts))
          throw new Error("Alerts must be an array.");
        if (
          data.responsibleAssignments &&
          !Array.isArray(data.responsibleAssignments)
        )
          throw new Error("Responsible assignments must be an array.");
        if (data.staffUsers) validateStaffUsers(data.staffUsers);
        if (data.siteOverrides && !Array.isArray(data.siteOverrides))
          throw new Error("Site overrides must be an array.");
        if (data.events && !Array.isArray(data.events))
          throw new Error("Events must be an array.");
        if (data.cashSignoffs && !Array.isArray(data.cashSignoffs))
          throw new Error("Cash signoffs must be an array.");
        if (data.assets && !Array.isArray(data.assets))
          throw new Error("Assets must be an array.");
        if (data.assetChecks && !Array.isArray(data.assetChecks))
          throw new Error("Asset checks must be an array.");
        if (data.eventTaskChecks && !Array.isArray(data.eventTaskChecks))
          throw new Error("Event task checks must be an array.");
        const previewLogs = Array.isArray(data.logs) ? data.logs : [];
        const previewHandovers = normalizeHandovers(data.handoverNotes || {});
        const previewDates = new Set([
          ...previewLogs.map((log) => log.date).filter(Boolean),
          ...Object.values(previewHandovers)
            .map((note) => note.date)
            .filter(Boolean),
        ]).size;
        const preview = [
          `Exported: ${data.exportedAt ? formatBackupTime(data.exportedAt) : "unknown"}`,
          `Logged dates: ${previewDates}`,
          `Task records: ${previewLogs.length}`,
          `Handover notes: ${Object.values(previewHandovers).filter(handoverHasContent).length}`,
          `Alerts: ${Array.isArray(data.alerts) ? data.alerts.length : 0}`,
          `Finish records: ${Array.isArray(data.finishRecords) ? data.finishRecords.length : 0}`,
          `Routines included: ${Array.isArray(data.routines) ? "yes" : "no"}`,
          `Staff config included: ${Array.isArray(data.staffUsers) ? "yes" : "no"}`,
          `Events: ${Array.isArray(data.events) ? data.events.length : 0}`,
          `Assets: ${Array.isArray(data.assets) ? data.assets.length : 0}`,
          "",
          "Import this backup into this browser?",
        ].join("\n");
        if (!window.confirm(preview)) return;
        if (data.logs) {
          const normalizedLogs = normalizeLogs(data.logs);
          setLogs(normalizedLogs);
          saveStorage(LOG_KEY, normalizedLogs);
        }
        if (data.routines) {
          validateRoutineImport(data.routines);
          const normalized = normalizeRoutines(data.routines);
          setRoutines(normalized);
          saveStorage(ROUTINE_KEY, normalized);
        }
        if (data.staffUsers) {
          const normalizedStaffUsers = normalizeStaffUsers(data.staffUsers);
          setStaffUsers(normalizedStaffUsers);
          saveStorage(STAFF_KEY, normalizedStaffUsers);
        }
        if (data.handoverNotes) {
          validateHandoverImport(data.handoverNotes);
          const normalizedNotes = normalizeHandovers(data.handoverNotes);
          setHandoverNotes(normalizedNotes);
          saveStorage(HANDOVER_KEY, normalizedNotes);
        }
        if (data.finishRecords) {
          setFinishRecords(data.finishRecords);
          saveStorage(FINISH_KEY, data.finishRecords);
        }
        if (data.alerts) {
          const normalizedAlerts = normalizeAlerts(data.alerts);
          setAlerts(normalizedAlerts);
          saveStorage(ALERT_KEY, normalizedAlerts);
        }
        if (data.responsibleAssignments) {
          setResponsibleAssignments(data.responsibleAssignments);
          saveStorage(RESPONSIBLE_KEY, data.responsibleAssignments);
        }
        if (data.siteSettings) {
          const normalizedSite = normalizeSiteSettings(data.siteSettings);
          setSiteSettings(normalizedSite);
          setSiteForm(normalizedSite);
          saveStorage(SITE_SETTINGS_KEY, normalizedSite);
        }
        if (data.siteOverrides) {
          setSiteOverrides(data.siteOverrides);
          saveStorage(SITE_OVERRIDE_KEY, data.siteOverrides);
        }
        if (data.events) {
          const normalizedEvents = normalizeEvents(data.events);
          setEvents(normalizedEvents);
          saveStorage(EVENTS_KEY, normalizedEvents);
        }
        if (data.cashSignoffs) {
          setCashSignoffs(data.cashSignoffs);
          saveStorage(CASH_SIGNOFF_KEY, data.cashSignoffs);
        }
        if (data.assets) {
          const normalizedAssets = normalizeAssets(data.assets);
          setAssets(normalizedAssets);
          saveStorage(ASSET_REGISTRY_KEY, normalizedAssets);
        }
        if (data.assetChecks) {
          setAssetChecks(data.assetChecks);
          saveStorage(ASSET_CHECK_KEY, data.assetChecks);
        }
        if (data.eventTaskChecks) {
          setEventTaskChecks(data.eventTaskChecks);
          saveStorage(EVENT_TASK_CHECK_KEY, data.eventTaskChecks);
        }
        if (data.lastExportAt || data.exportedAt) {
          const importedExportAt = data.lastExportAt || data.exportedAt;
          setLastExportAt(importedExportAt);
          saveStorage(LAST_EXPORT_KEY, importedExportAt);
        }
        setMessage("Import complete.");
      } catch (error) {
        setMessage(`Import failed: ${error.message}`);
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  function exportRoutines() {
    const blob = new Blob([JSON.stringify(routines, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mesh-routines-${todayKey()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage("Routines exported.");
  }

  function importRoutines(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        validateRoutineImport(data);
        const normalized = normalizeRoutines(data);
        setRoutines(normalized);
        saveStorage(ROUTINE_KEY, normalized);
        setMessage("Routines imported.");
      } catch (error) {
        setMessage(`Routine import failed: ${error.message}`);
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  async function saveEditorTask(event) {
    event.preventDefault();
    if (!(await requestWriteAccess())) return;
    if (!editorTask.title.trim()) {
      setMessage("Task title is required.");
      return;
    }
    const sectionId = `${editorTask.shiftType}-${slug(editorTask.section || editorTask.timeBlock || "custom")}`;
    const task = normalizeRoutineTask({
      ...editorTask,
      id: editorTask.id || `${sectionId}-${slug(editorTask.title)}`,
      section: editorTask.section || editorTask.timeBlock,
      timeBlock: editorTask.timeBlock || editorTask.section,
    });
    const current = normalizeRoutines(routines)
      .map((routine) => ({
        ...routine,
        tasks: routine.tasks.filter((item) => item.id !== task.id),
      }))
      .filter(
        (routine) => routine.tasks.length > 0 || routine.id === sectionId,
      );
    const sectionIndex = current.findIndex(
      (routine) => routine.id === sectionId,
    );
    let next;
    if (sectionIndex >= 0) {
      next = current.map((routine, index) => {
        if (index !== sectionIndex) return routine;
        return {
          ...routine,
          label: task.section,
          timeBlock: task.timeBlock,
          tasks: [...routine.tasks, task],
        };
      });
    } else {
      next = [
        ...current,
        {
          id: sectionId,
          shiftType: task.shiftType,
          label: task.section,
          timeBlock: task.timeBlock,
          tasks: [task],
        },
      ];
    }
    setRoutines(next);
    saveStorage(ROUTINE_KEY, next);
    setEditorTask(blankTask);
    setMessage("Routine task saved.");
  }

  function editTask(task) {
    setEditorTask(task);
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }

  async function deactivateTask(task) {
    if (!(await requestWriteAccess())) return;
    const next = normalizeRoutines(routines).map((routine) => ({
      ...routine,
      tasks: routine.tasks.map((item) =>
        item.id === task.id ? { ...item, active: false } : item,
      ),
    }));
    setRoutines(next);
    saveStorage(ROUTINE_KEY, next);
    setMessage("Task deactivated.");
  }

  async function updateAlert(alertId, status) {
    if (status === "acknowledged" && !canAcknowledgeAlerts(user)) {
      setMessage("Only managers can acknowledge alerts.");
      return;
    }
    if (status === "resolved" && !canResolveAlerts(user)) {
      setMessage("Only managers can resolve alerts.");
      return;
    }
    if (!(await requestWriteAccess())) return;
    const latestAlerts = normalizeAlerts(alerts);
    const currentAlert = latestAlerts.find(
      (alert) =>
        String(alert.id) === String(alertId) ||
        String(alert.backendId) === String(alertId) ||
        String(alert.localId) === String(alertId),
    );
    if (!currentAlert) {
      setMessage("Alert not found.");
      return;
    }
    const timestamp = new Date().toISOString();
    const authUserId =
      user?.loginSource === "supabase_auth"
        ? user.authUserId || user.backendUserId || ""
        : "";
    const statusFields =
      status === "acknowledged"
        ? {
            acknowledgedBy: user.name,
            acknowledgedAt: timestamp,
            acknowledgedByAuthUserId: authUserId,
          }
        : {
            resolvedBy: user.name,
            resolvedAt: timestamp,
            resolvedByAuthUserId: authUserId,
          };
    const result = await updateAlertRecord(alertId, {
      status,
      ...statusFields,
      updatedAt: timestamp,
      lastUpdatedByAuthUserId: authUserId,
    });
    await refreshAlerts({ reason: `alert_${status}` });
    setMessage(
      result.ok
        ? status === "acknowledged"
          ? "Alert acknowledged."
          : "Alert resolved."
        : "Saved locally. Backend sync pending.",
    );
  }

  async function retryEmail(alertId) {
    if (!canRetryEmailNotification(user)) {
      setMessage("Only managers can retry email notifications.");
      return;
    }
    if (!(await requestWriteAccess())) return;
    const latestAlerts = normalizeAlerts(alerts);
    const currentAlert = latestAlerts.find(
      (alert) =>
        String(alert.id) === String(alertId) ||
        String(alert.backendId) === String(alertId) ||
        String(alert.localId) === String(alertId),
    );
    if (!currentAlert) {
      setMessage("Alert not found.");
      return;
    }
    const result = await retryAlertEmailNotification(currentAlert);
    setMessage(
      result.ok
        ? "Email notification sent."
        : "Email notification failed. Alert is still saved.",
    );
  }

  async function loadAuthProfiles() {
    if (!canViewAuthProfiles(user)) {
      setAuthProfilesMessage("Only managers can view backend user profiles.");
      return;
    }
    const result = await fetchAuthProfiles();
    if (result.ok) {
      setAuthProfiles(result.profiles);
      setAuthProfilesMessage(
        result.message || `Loaded ${result.profiles.length} backend profiles.`,
      );
      return;
    }
    setAuthProfiles([]);
    setAuthProfilesMessage(
      result.message || "Could not load backend user profiles.",
    );
  }

  function resetStaffForm() {
    setStaffForm(blankStaffForm);
  }

  function editStaffUser(staff) {
    setStaffForm({
      id: staff.id,
      name: staff.name,
      role: staff.role,
      code: staff.code,
      isManager: staff.isManager,
      needsName: staff.needsName,
      active: staff.active !== false,
    });
  }

  async function saveStaffUser(event) {
    event.preventDefault();
    if (!(await requestWriteAccess())) return;
    const name = staffForm.name.trim();
    const code = staffForm.code.trim();
    if (!name) {
      setMessage("Staff name is required.");
      return;
    }
    const codeError = validateStaffCode(code, staffUsers, staffForm.id);
    if (codeError) {
      setMessage(codeError);
      return;
    }
    const existing = staffUsers.find((staff) => staff.id === staffForm.id);
    const isCurrentUser =
      existing &&
      (existing.id === user.id ||
        existing.code === user.code ||
        existing.name === user.name);
    const isManagerCodeChange =
      existing &&
      (existing.isManager || existing.name.toLowerCase().includes("bobby")) &&
      existing.code !== code;
    if (isManagerCodeChange) {
      const confirmed = window.confirm(
        "Make sure you save this code before logging out.",
      );
      if (!confirmed) return;
    }
    if (
      isCurrentUser &&
      (staffForm.active === false ||
        (existing.isManager && !staffForm.isManager))
    ) {
      const confirmed = window.confirm(
        "This is the currently logged-in manager. Save this change anyway? Make sure another manager code works first.",
      );
      if (!confirmed) return;
    }
    const savedStaff = {
      ...(existing || {}),
      id: staffForm.id || `staff-${Date.now()}`,
      name,
      role:
        staffForm.role.trim() || (staffForm.isManager ? "manager" : "staff"),
      code,
      isManager: staffForm.isManager,
      needsName: staffForm.needsName,
      active: staffForm.active,
    };
    const nextStaffUsers = existing
      ? staffUsers.map((staff) =>
          staff.id === existing.id ? savedStaff : staff,
        )
      : [...staffUsers, savedStaff];
    setStaffUsers(nextStaffUsers);
    saveStorage(STAFF_KEY, nextStaffUsers);
    resetStaffForm();
    setMessage("Staff code saved.");
  }

  async function toggleStaffActive(staff) {
    if (!(await requestWriteAccess())) return;
    const isCurrentUser =
      staff.id === user.id ||
      staff.code === user.code ||
      staff.name === user.name;
    if (staff.active !== false && isCurrentUser) {
      const confirmed = window.confirm(
        "This is the currently logged-in manager. Deactivate anyway? Make sure another manager code works first.",
      );
      if (!confirmed) return;
    }
    const nextStaffUsers = staffUsers.map((item) =>
      item.id === staff.id ? { ...item, active: item.active === false } : item,
    );
    setStaffUsers(nextStaffUsers);
    saveStorage(STAFF_KEY, nextStaffUsers);
    setMessage(
      staff.active === false
        ? "Staff user reactivated."
        : "Staff user deactivated.",
    );
  }

  async function copyStaffCode(code) {
    try {
      await navigator.clipboard.writeText(code);
      setMessage("Staff code copied.");
    } catch {
      setMessage("Could not copy code automatically.");
    }
  }

  function exportStaffUsers() {
    const exportedAt = new Date().toISOString();
    const payload = {
      appVersion: APP_VERSION,
      exportedAt,
      staffUsers,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mesh-staff-codes-${todayKey()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage("Staff codes exported.");
  }

  function importStaffUsers(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const importedStaffUsers = Array.isArray(data) ? data : data.staffUsers;
        validateStaffUsers(importedStaffUsers);
        const normalizedStaffUsers = normalizeStaffUsers(importedStaffUsers);
        const preview = [
          `Staff users: ${normalizedStaffUsers.length}`,
          "",
          "Replace local staff code configuration on this browser/device?",
        ].join("\n");
        if (!window.confirm(preview)) return;
        setStaffUsers(normalizedStaffUsers);
        saveStorage(STAFF_KEY, normalizedStaffUsers);
        resetStaffForm();
        setMessage("Staff codes imported.");
      } catch (error) {
        setMessage(`Staff code import failed: ${error.message}`);
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  async function saveSiteSettings(event) {
    event.preventDefault();
    if (!(await requestWriteAccess())) return;
    const nextSettings = normalizeSiteSettings(siteForm);
    setSiteSettings(nextSettings);
    saveStorage(SITE_SETTINGS_KEY, nextSettings);
    setMessage("Site access settings saved.");
  }

  function setSiteFromDevice() {
    if (!navigator.geolocation) {
      setMessage("Location is not available in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextForm = {
          ...siteForm,
          latitude: String(position.coords.latitude),
          longitude: String(position.coords.longitude),
        };
        setSiteForm(nextForm);
        setMessage(
          "Site location filled from this device. Save settings to apply it.",
        );
      },
      () => setMessage("Could not get browser location."),
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 60000 },
    );
  }

  async function activateOverride() {
    if (!siteSettings.managerOverrideEnabled) {
      setMessage("Manager override is disabled in site settings.");
      return;
    }
    const confirmed = window.confirm(
      "This allows operational changes from this browser even if location check fails. Use only when needed.",
    );
    if (!confirmed) return;
    const now = new Date();
    const duration =
      overrideForm.duration === "day"
        ? new Date(`${todayKey()}T23:59:59`)
        : new Date(now.getTime() + Number(overrideForm.duration) * 60000);
    const override = {
      id: `override-${Date.now()}`,
      overrideBy: user.name,
      overrideAt: now.toISOString(),
      expiresAt: duration.toISOString(),
      reason: overrideForm.reason.trim(),
    };
    const nextOverrides = [...siteOverrides, override];
    setSiteOverrides(nextOverrides);
    saveStorage(SITE_OVERRIDE_KEY, nextOverrides);
    setOverrideForm({ duration: "15", reason: "" });
    setMessage("Manager override active.");
  }

  async function saveEvent(event) {
    event.preventDefault();
    if (!(await requestWriteAccess())) return;
    if (!eventForm.eventName.trim()) {
      setMessage("Event name is required.");
      return;
    }
    const julie = staffUsers.find(
      (staff) => staff.name.toLowerCase() === "julie",
    );
    const savedEvent = {
      ...eventForm,
      id: eventForm.id || `event-${Date.now()}`,
      date,
      eventName: eventForm.eventName.trim(),
      eventResponsible:
        eventForm.julieLeads && julie ? julie.name : eventForm.eventResponsible,
      createdBy: eventForm.createdBy || user.name,
      updatedAt: new Date().toISOString(),
    };
    const nextEvents = [
      ...events.filter((item) => item.id !== savedEvent.id),
      savedEvent,
    ];
    setEvents(nextEvents);
    saveStorage(EVENTS_KEY, nextEvents);
    const roleAssignments = [
      ["event_responsible", savedEvent.eventResponsible],
      ["closing_responsible", savedEvent.closingResponsible],
      ["cash_invoice_responsible", savedEvent.cashInvoiceResponsible],
      ["locking_alarm_responsible", savedEvent.lockingResponsible],
    ].filter(([, person]) => person);
    const nextAssignments = [
      ...responsibleAssignments.filter(
        (item) => item.eventId !== savedEvent.id,
      ),
      ...roleAssignments.map(([roleType, person]) => ({
        id: `${date}-${savedEvent.id}-${roleType}`,
        date,
        shiftType: "event",
        eventId: savedEvent.id,
        roleType,
        responsibleName: person,
        assignedBy: user.name,
        assignedAt: new Date().toISOString(),
        note: savedEvent.eventName,
      })),
    ];
    setResponsibleAssignments(nextAssignments);
    saveStorage(RESPONSIBLE_KEY, nextAssignments);
    setEventForm(blankEventForm);
    setMessage("Event saved.");
  }

  async function saveAsset(event) {
    event.preventDefault();
    if (!(await requestWriteAccess())) return;
    if (!assetForm.model.trim() && !assetForm.serialNumber.trim()) {
      setMessage("Asset needs a model/name or serial number.");
      return;
    }

    const timestamp = new Date().toISOString();
    const savedAsset = {
      ...assetForm,
      id: assetForm.id || "asset-" + Date.now(),
      localId: assetForm.localId || assetForm.id || "asset:" + Date.now(),
      syncStatus:
        user.loginSource === "supabase_auth"
          ? "pending_backend"
          : "pending_auth",
      syncError: "",
      updatedAt: timestamp,
    };

    let finalAsset = savedAsset;
    let message = "Asset saved locally.";

    if (user.loginSource === "supabase_auth") {
      const result = await upsertAssetRegistryRecord(savedAsset);

      if (result.ok) {
        finalAsset = {
          ...savedAsset,
          ...result.record,
          id: savedAsset.id,
          localId: savedAsset.localId || result.record.localId,
          syncStatus: "synced",
          syncError: "",
        };
        message = "Asset saved and synced to Supabase.";
      } else {
        finalAsset = {
          ...savedAsset,
          syncStatus: "sync_error",
          syncError: result.message || "Asset registry sync failed.",
        };
        message = "Asset saved locally. Backend sync failed.";
      }
    }

    const nextAssets = [
      ...assets.filter((asset) => asset.id !== finalAsset.id),
      finalAsset,
    ];

    setAssets(nextAssets);
    saveStorage(ASSET_REGISTRY_KEY, nextAssets);
    setAssetForm(blankAssetForm);

    if (user.loginSource === "supabase_auth" && finalAsset.syncStatus === "synced") {
      await refreshAssetRegistry?.();
      setMessage("Asset saved and synced to Supabase.");
    } else {
      setMessage(message);
    }
  }

  async function assignResponsible(event) {
    event.preventDefault();
    if (!(await requestWriteAccess())) return;
    if (!responsibleForm.responsibleName.trim()) {
      setMessage("Responsible person name is required.");
      return;
    }
    const assignment = {
      id: `${date}-${responsibleForm.shiftType}-${responsibleForm.eventId || "shift"}-${responsibleForm.roleType}`,
      date,
      shiftType: responsibleForm.shiftType,
      roleType: responsibleForm.roleType,
      eventId: responsibleForm.eventId,
      responsibleName: responsibleForm.responsibleName.trim(),
      assignedBy: user.name,
      assignedAt: new Date().toISOString(),
      note: responsibleForm.note.trim(),
    };
    const nextAssignments = [
      ...responsibleAssignments.filter((item) => item.id !== assignment.id),
      assignment,
    ];
    setResponsibleAssignments(nextAssignments);
    saveStorage(RESPONSIBLE_KEY, nextAssignments);
    setMessage("Shift responsible saved.");
  }

  return (
    <main className="page manager-page">
      <section className="intro compact">
        <p className="eyebrow">Manager</p>
        <h1>Dashboard</h1>
      </section>
      <ManagerDashboardJumpIndex />
      <ManagerDashboardSectionCollapseControls />
      <ManagerDashboardActionCenter
        date={date}
        authStatus={authStatus}
        shiftDataStatus={shiftDataStatus}
        financialBackendStatus={financialBackendStatus}
        assetBackendStatus={assetBackendStatus}
        dateAssetChecks={dateAssetChecks}
        assetIssues={assetIssues}
        refreshShiftData={refreshShiftData}
        refreshFinancialSignoffs={refreshFinancialSignoffs}
        refreshAssetRegistry={refreshAssetRegistry}
        refreshAssetChecks={refreshAssetChecks}
        onClearSyncedLocalChecklistPendingRecords={
          onClearSyncedLocalChecklistPendingRecords
        }
        onClearSyncedFinancialPendingRecords={
          onClearSyncedFinancialPendingRecords
        }
        onClearSyncedAssetPendingRecords={onClearSyncedAssetPendingRecords}
      />

      {message && <p className="status-message">{message}</p>}

      <section className="manager-controls">
        <label>
          Date
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <label>
          Staff
          <select
            value={staffFilter}
            onChange={(event) => setStaffFilter(event.target.value)}
          >
            <option value="all">All staff</option>
            {staffNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Shift
          <select
            value={shiftFilter}
            onChange={(event) => setShiftFilter(event.target.value)}
          >
            <option value="all">All shifts</option>
            {activeShifts.map((shift) => (
              <option key={shift.id} value={shift.id}>
                {shift.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="local-status-card">
        <div className="panel-title-row">
          <div>
            <p className="eyebrow">Backend</p>
            <h2>Backend status</h2>
            <p className="muted">
              Phase 3C Auth lockdown transition. localStorage remains
              fallback/cache.
            </p>
          </div>
          <div className="inline-actions">
            <button
              type="button"
              className="ghost-button compact-button"
              onClick={() => refreshAlerts({ reason: "manual" })}
            >
              Refresh alerts
            </button>
            <button
              type="button"
              className="ghost-button compact-button"
              onClick={retryAlertSync}
            >
              Retry alert sync
            </button>
          </div>
        </div>
        <div className="status-grid">
          <span>
            <strong>{alertBackendStatus.alertSyncBuild}</strong> Alert sync
            build
          </span>
          <span>
            <strong>{APP_VERSION}</strong> App version
          </span>
          <span>
            <strong>{RELEASE_SUMMARY}</strong> Release
          </span>
          <span>
            <strong>3C Auth lockdown transition</strong> Phase
          </span>
          <span>
            <strong>{isSupabaseConfigured ? "Yes" : "No"}</strong> Supabase
            configured
          </span>
          <span>
            <strong>{isBackendAuthRequired ? "Yes" : "No"}</strong> Require auth
            for backend
          </span>
          <span>
            <strong>{backendSourceLabel(alertBackendStatus.source)}</strong>{" "}
            Alerts source
          </span>
          <span>
            <strong>
              {alertBackendStatus.backendRequestMode || "unknown"}
            </strong>{" "}
            Backend request mode
          </span>
          <span>
            <strong>
              {alertBackendStatus.alertsUsingAuthenticatedToken ? "Yes" : "No"}
            </strong>{" "}
            Authenticated alert token
          </span>
          <span>
            <strong>
              {alertBackendStatus.anonBackendAccessLikely
                ? "Enabled"
                : "Disabled/blocked"}
            </strong>{" "}
            Anon backend access
          </span>
          <span>
            <strong>Yes</strong> Staff-code fallback enabled
          </span>
          <span>
            <strong>{shortId(alertBackendStatus.backendAuthUserId)}</strong>{" "}
            Backend auth user
          </span>
          <span>
            <strong>
              {alertBackendStatus.backendProfileRole || user.role || "None"}
            </strong>{" "}
            Backend profile role
          </span>
          <span>
            <strong>{alertBackendStatus.pollingEnabled ? "Yes" : "No"}</strong>{" "}
            Polling enabled
          </span>
          <span>
            <strong>{alertBackendStatus.pollingIntervalSeconds}</strong> Poll
            interval seconds
          </span>
          <span>
            <strong>{alertBackendStatus.lastRefreshReason}</strong> Last refresh
            reason
          </span>
          <span>
            <strong>{alertBackendStatus.localCachedAlertCount}</strong> Local
            cached alerts
          </span>
          <span>
            <strong>{alertBackendStatus.unsyncedLocalAlertCount}</strong>{" "}
            Waiting to sync
          </span>
          <span>
            <strong>{alertBackendStatus.pendingAuthAlertCount || 0}</strong>{" "}
            Email login required
          </span>
          <span>
            <strong>{alertBackendStatus.localOnlyAlertCount || 0}</strong>{" "}
            Local-only alerts
          </span>
          <span>
            <strong>{alertBackendStatus.supabaseAlertCount}</strong> Supabase
            alerts
          </span>
          <span>
            <strong>{alertBackendStatus.supabaseRowsFetched}</strong> Rows
            fetched
          </span>
          <span>
            <strong>{alertBackendStatus.mergedAlertsCount}</strong> Merged
            alerts
          </span>
          <span>
            <strong>{alertBackendStatus.visibleAlertsCount}</strong> Visible
            alerts
          </span>
          <span>
            <strong>{alertBackendStatus.visibleOpenAlertsCount}</strong> Visible
            open alerts
          </span>
          <span>
            <strong>
              {alertBackendStatus.lastSuccessfulSyncAt
                ? formatDateTime(alertBackendStatus.lastSuccessfulSyncAt)
                : "Not yet"}
            </strong>{" "}
            Last successful sync
          </span>
          <span>
            <strong>
              {alertBackendStatus.lastSyncAttemptAt
                ? formatDateTime(alertBackendStatus.lastSyncAttemptAt)
                : "Not yet"}
            </strong>{" "}
            Last attempt
          </span>
          <span>
            <strong>
              {alertBackendStatus.lastPollStartedAt
                ? formatDateTime(alertBackendStatus.lastPollStartedAt)
                : "Not yet"}
            </strong>{" "}
            Last poll started
          </span>
          <span>
            <strong>
              {alertBackendStatus.lastPollCompletedAt
                ? formatDateTime(alertBackendStatus.lastPollCompletedAt)
                : "Not yet"}
            </strong>{" "}
            Last poll completed
          </span>
          <span>
            <strong>
              {alertBackendStatus.lastPollAttemptAt
                ? formatDateTime(alertBackendStatus.lastPollAttemptAt)
                : "Not yet"}
            </strong>{" "}
            Last poll attempt
          </span>
          <span>
            <strong>
              {alertBackendStatus.lastSuccessfulPollAt
                ? formatDateTime(alertBackendStatus.lastSuccessfulPollAt)
                : "Not yet"}
            </strong>{" "}
            Last successful poll
          </span>
          <span>
            <strong>
              {alertBackendStatus.lastManualRefreshAt
                ? formatDateTime(alertBackendStatus.lastManualRefreshAt)
                : "Not yet"}
            </strong>{" "}
            Last manual refresh
          </span>
          <span>
            <strong>
              {alertBackendStatus.lastSuccessfulSupabaseReadAt
                ? formatDateTime(
                    alertBackendStatus.lastSuccessfulSupabaseReadAt,
                  )
                : "Not yet"}
            </strong>{" "}
            Last Supabase read
          </span>
          <span>
            <strong>{alertBackendStatus.lastSyncError ? "Yes" : "No"}</strong>{" "}
            Sync error
          </span>
          <span>
            <strong>
              {alertBackendStatus.lastEmailNotificationAttemptAt
                ? formatDateTime(
                    alertBackendStatus.lastEmailNotificationAttemptAt,
                  )
                : "Not yet"}
            </strong>{" "}
            Last email attempt
          </span>
          <span>
            <strong>
              {alertBackendStatus.lastEmailNotificationResult || "None"}
            </strong>{" "}
            Last email result
          </span>
        </div>
        <p
          className={
            alertBackendStatus.lastSyncError ? "critical-warning" : "muted"
          }
        >
          {alertBackendStatus.message ||
            (alertBackendStatus.alertsUsingAuthenticatedToken
              ? "Authenticated backend sync active."
              : "Staff-code fallback mode.")}
        </p>
        {alertBackendStatus.lastSyncError && (
          <p className="critical-warning">{alertBackendStatus.lastSyncError}</p>
        )}
        <button
          type="button"
          className="text-button"
          onClick={() => setShowBackendDetails((current) => !current)}
        >
          {showBackendDetails
            ? "Hide Alert sync debug"
            : "Show Alert sync debug"}
        </button>
        {showBackendDetails && (
          <div className="backend-details">
            <strong>Alert sync debug</strong>
            <pre>{JSON.stringify(alertBackendStatus, null, 2)}</pre>
          </div>
        )}
      </section>

      <section className="local-status-card">
        <div>
          <p className="eyebrow">Phase 4A</p>
          <h2>Checklist backend status</h2>
          <p className="muted">
            {shiftDataStatus.message || "Showing local cache."}
          </p>
        </div>
        <div className="status-grid">
          <span>
            <strong>{shiftDataStatus.mode || "local_cache"}</strong> Shift data
            backend mode
          </span>
          <span>
            <strong>
              {shiftDataStatus.taskCompletionsSource || "local_cache"}
            </strong>{" "}
            Task completions source
          </span>
          <span>
            <strong>
              {shiftDataStatus.handoverNotesSource || "local_cache"}
            </strong>{" "}
            Handover notes source
          </span>
          <span>
            <strong>{shiftDataStatus.lastPhase4Action || "None"}</strong> Last
            Phase 4A action
          </span>
          <span>
            <strong>{shiftDataStatus.lastPhase4Result || "None"}</strong> Last
            Phase 4A result
          </span>
          <span>
            <strong>
              {shiftDataStatus.backendTableWriteAttempted ? "Yes" : "No"}
            </strong>{" "}
            Backend write attempted
          </span>
          <span>
            <strong>
              {shiftDataStatus.backendTableWriteSucceeded ? "Yes" : "No"}
            </strong>{" "}
            Backend write succeeded
          </span>
          <span>
            <strong>
              {shiftDataStatus.lastShiftDataSyncAt
                ? formatDateTime(shiftDataStatus.lastShiftDataSyncAt)
                : "Not yet"}
            </strong>{" "}
            Last shift data sync
          </span>
          <span>
            <strong>{shiftDataStatus.backendShiftSessionsLoaded || 0}</strong>{" "}
            Supabase shift sessions loaded
          </span>
          <span>
            <strong>{shiftDataStatus.backendActiveShiftSessions || 0}</strong>{" "}
            Supabase active sessions
          </span>
          <span>
            <strong>{shiftDataStatus.backendFinishedShiftSessions || 0}</strong>{" "}
            Supabase finished sessions
          </span>
          <span>
            <strong>{shiftDataStatus.backendTaskRowsLoaded || 0}</strong>{" "}
            Supabase task rows loaded
          </span>
          <span>
            <strong>{shiftDataStatus.backendDoneTaskRows || 0}</strong> Supabase
            done task rows
          </span>
          <span>
            <strong>{shiftDataStatus.backendNotRelevantTaskRows || 0}</strong>{" "}
            Supabase not relevant task rows
          </span>
          <span>
            <strong>{shiftDataStatus.backendOpenTaskRows || 0}</strong> Supabase
            open/reset task rows
          </span>
          <span>
            <strong>{shiftDataStatus.backendHandoverRowsLoaded || 0}</strong>{" "}
            Supabase handover rows loaded
          </span>
          <span>
            <strong>{shiftDataStatus.mergedUniqueTaskCompletions || 0}</strong>{" "}
            Merged unique task completions
          </span>
          <span>
            <strong>{shiftDataStatus.ignoredDuplicateTaskRows || 0}</strong>{" "}
            Ignored duplicate task rows
          </span>
          <span>
            <strong>{shiftDataStatus.pendingTaskCompletionsCount || 0}</strong>{" "}
            Pending local task completions
          </span>
          <span>
            <strong>
              {shiftDataStatus.pendingAuthTaskCompletionsCount || 0}
            </strong>{" "}
            Pending auth task completions
          </span>
          <span>
            <strong>
              {shiftDataStatus.pendingBackendRetryTaskCompletionsCount || 0}
            </strong>{" "}
            Pending backend retry
          </span>
          <span>
            <strong>{shiftDataStatus.syncedTaskCompletionsCount || 0}</strong>{" "}
            Synced local records
          </span>
          <span>
            <strong>{shiftDataStatus.pendingHandoverNotesCount || 0}</strong>{" "}
            Pending handover notes
          </span>
          <span>
            <strong>
              {shiftDataStatus.lastBackendCountRefreshAt
                ? formatDateTime(shiftDataStatus.lastBackendCountRefreshAt)
                : "Not yet"}
            </strong>{" "}
            Last backend count refresh
          </span>
          <span>
            <strong>{shiftDataStatus.latestShiftSessionShift || "None"}</strong>{" "}
            Latest shift session shift
          </span>
          <span>
            <strong>
              {shiftDataStatus.latestShiftSessionStatus || "None"}
            </strong>{" "}
            Latest shift session status
          </span>
          <span>
            <strong>
              {shiftDataStatus.latestShiftSessionFinishedAt
                ? formatDateTime(shiftDataStatus.latestShiftSessionFinishedAt)
                : "Not finished"}
            </strong>{" "}
            Latest finished at
          </span>
          <span>
            <strong>
              {shortId(shiftDataStatus.latestShiftSessionBackendId)}
            </strong>{" "}
            Latest shift session id
          </span>
          <span>
            <strong>
              {shiftDataStatus.lastBackendRestoreAttemptAt
                ? formatDateTime(shiftDataStatus.lastBackendRestoreAttemptAt)
                : "Not yet"}
            </strong>{" "}
            Last backend restore attempt
          </span>
          <span>
            <strong>
              {shiftDataStatus.lastBackendRestoreResult || "None"}
            </strong>{" "}
            Last backend restore result
          </span>
          <span>
            <strong>{shiftDataStatus.backendRestoreRowsFetched || 0}</strong>{" "}
            Backend restore rows fetched
          </span>
          <span>
            <strong>{shiftDataStatus.backendRestoreRowsMerged || 0}</strong>{" "}
            Backend restore rows merged
          </span>
          <span>
            <strong>
              {shiftDataStatus.backendRestoreDuplicatesIgnored || 0}
            </strong>{" "}
            Backend restore duplicates ignored
          </span>
          <span>
            <strong>
              {shiftDataStatus.localPendingRecordsMatchedInBackend || 0}
            </strong>{" "}
            Local pending matched in backend
          </span>
          <span>
            <strong>{shiftDataStatus.localOnlyRecordsRemaining || 0}</strong>{" "}
            Local-only records remaining
          </span>
          <span>
            <strong>{shiftDataStatus.lastCleanupResult || "None"}</strong> Last
            cleanup result
          </span>
        </div>
        <p className="muted">
          {authStatus.loginSource === "supabase_auth"
            ? "Using backend + local cache."
            : "Using local cache. Email login required for backend counts."}
        </p>
        {(shiftDataStatus.lastShiftSyncError ||
          shiftDataStatus.lastPhase4Error ||
          shiftDataStatus.lastBackendCountError ||
          shiftDataStatus.lastBackendRestoreError) && (
          <p className="critical-warning">
            {shiftDataStatus.lastShiftSyncError ||
              shiftDataStatus.lastPhase4Error ||
              shiftDataStatus.lastBackendCountError ||
              shiftDataStatus.lastBackendRestoreError}
          </p>
        )}
        <div className="backup-actions">
          <button
            type="button"
            className="ghost-button compact-button"
            onClick={async () => {
              const result = await onTestShiftBackendWrite?.();
              setMessage(
                result?.ok
                  ? "Test checklist backend write succeeded."
                  : "Test checklist backend write failed. Check Phase 4A diagnostics.",
              );
            }}
          >
            Test checklist backend write
          </button>
          <button
            type="button"
            className="ghost-button compact-button"
            onClick={async () => {
              const result = await refreshShiftData?.(date);
              setMessage(
                result?.ok
                  ? result.message
                  : "Could not fetch checklist backend data. Showing local cache.",
              );
            }}
          >
            Refresh checklist backend
          </button>
          <button
            type="button"
            className="ghost-button compact-button"
            onClick={() => {
              const result = onClearSyncedLocalChecklistPendingRecords?.();
              setMessage(result?.message || "Cleanup finished.");
            }}
          >
            Clear synced local checklist pending records
          </button>
        </div>
      </section>

      <section className="local-status-card">
        <div>
          <p className="eyebrow">Auth</p>
          <h2>Auth status</h2>
          <p className="muted">
            Phase 3C transition mode: Supabase Auth is the intended backend
            path; staff-code login remains local fallback.
          </p>
        </div>
        <div className="status-grid">
          <span>
            <strong>{authStatus.configured ? "Yes" : "No"}</strong> Auth
            configured
          </span>
          <span>
            <strong>{isBackendAuthRequired ? "Yes" : "No"}</strong> Require auth
            for backend
          </span>
          <span>
            <strong>
              {authStatus.loginSource === "supabase_auth"
                ? "Supabase Auth"
                : "Staff code"}
            </strong>{" "}
            Current login source
          </span>
          <span>
            <strong>{authStatus.authSessionPresent ? "Yes" : "No"}</strong> Auth
            session present
          </span>
          <span>
            <strong>
              {alertBackendStatus.backendRequestMode || "unknown"}
            </strong>{" "}
            Backend request mode
          </span>
          <span>
            <strong>
              {alertBackendStatus.alertsUsingAuthenticatedToken ? "Yes" : "No"}
            </strong>{" "}
            Alerts using auth token
          </span>
          <span>
            <strong>{shortId(authStatus.authUserId)}</strong> Auth user id
          </span>
          <span>
            <strong>{authStatus.profileRole || user.role || "None"}</strong>{" "}
            Profile role
          </span>
          <span>
            <strong>{shortId(authStatus.organizationId)}</strong> Organization
            id
          </span>
          <span>
            <strong>{authStatus.profileActive === false ? "No" : "Yes"}</strong>{" "}
            Profile active
          </span>
          <span>
            <strong>{authStatus.profileFetchStatus || "not_loaded"}</strong>{" "}
            Profile fetch status
          </span>
          <span>
            <strong>
              {authStatus.lastProfileFetchAt
                ? formatDateTime(authStatus.lastProfileFetchAt)
                : "Not yet"}
            </strong>{" "}
            Last profile fetch
          </span>
          <span>
            <strong>{authStatus.profileFetchErrorCode || "None"}</strong>{" "}
            Profile error code
          </span>
        </div>
        {authStatus.profileFetchError && (
          <p className="critical-warning">{authStatus.profileFetchError}</p>
        )}
        <button
          type="button"
          className="text-button"
          onClick={() => setShowAuthDetails((current) => !current)}
        >
          {showAuthDetails ? "Hide auth debug" : "Show auth debug"}
        </button>
        {showAuthDetails && (
          <div className="backend-details">
            <strong>Auth debug</strong>
            {authStatus.profileFetchErrorMessage && (
              <p className="muted">
                Technical detail: {authStatus.profileFetchErrorMessage}
              </p>
            )}
            <pre>{JSON.stringify(authStatus, null, 2)}</pre>
          </div>
        )}
      </section>

      {canViewAuthProfiles(user) && (
        <section className="manager-list">
          <div className="panel-title-row">
            <div>
              <p className="eyebrow">Backend users</p>
              <h2>Supabase profiles</h2>
              <p className="muted">
                View-only profile check for the Auth migration. Manage users in
                Supabase for now.
              </p>
            </div>
            <button
              type="button"
              className="ghost-button compact-button"
              onClick={loadAuthProfiles}
            >
              Refresh profiles
            </button>
          </div>
          {authProfilesMessage && (
            <p
              className={
                authProfilesMessage.startsWith("Could not")
                  ? "critical-warning"
                  : "status-message"
              }
            >
              {authProfilesMessage}
            </p>
          )}
          {authProfiles.length === 0 ? (
            <p className="muted">No backend profiles loaded yet.</p>
          ) : (
            <div className="log-list">
              {authProfiles.map((profile) => (
                <article key={profile.id} className="log-row">
                  <strong>{profile.display_name}</strong>
                  <span>
                    {profile.role} |{" "}
                    {profile.active === false ? "inactive" : "active"}
                  </span>
                  <span>Auth id: {shortId(profile.id)}</span>
                  <span>Org: {shortId(profile.organization_id)}</span>
                  {profile.staff_code_alias && (
                    <span>Staff-code alias: {profile.staff_code_alias}</span>
                  )}
                </article>
              ))}
            </div>
          )}
          <div className="backend-details">
            <strong>Profile setup SQL example</strong>
            <pre>{`insert into public.user_profiles
(id, organization_id, display_name, role, active)
values
('AUTH_USER_ID_HERE', null, 'Name', 'staff', true);`}</pre>
          </div>
        </section>
      )}

      <section className="manager-list">
        <div className="panel-title-row">
          <div>
            <p className="eyebrow">Youngs site mode</p>
            <h2>Site access</h2>
          </div>
          <span
            className={`shift-pill site-${activeSiteOverride ? "override" : siteAccess.status}`}
          >
            {siteStatuses[activeSiteOverride ? "override" : siteAccess.status]}
          </span>
        </div>
        <p className="muted">
          Local on-site check. This is a practical browser guardrail, not real
          security.
        </p>
        {siteAccess.status === "away" && (
          <p className="critical-warning">
            You appear to be away from Youngs. You can view the app, but
            operational changes require being on site.
          </p>
        )}
        <form
          className="editor-form compact-editor"
          onSubmit={saveSiteSettings}
        >
          <label>
            Site name
            <input
              value={siteForm.siteName}
              onChange={(event) =>
                setSiteForm((current) => ({
                  ...current,
                  siteName: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Latitude
            <input
              value={siteForm.latitude}
              onChange={(event) =>
                setSiteForm((current) => ({
                  ...current,
                  latitude: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Longitude
            <input
              value={siteForm.longitude}
              onChange={(event) =>
                setSiteForm((current) => ({
                  ...current,
                  longitude: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Allowed radius meters
            <input
              type="number"
              value={siteForm.radiusMeters}
              onChange={(event) =>
                setSiteForm((current) => ({
                  ...current,
                  radiusMeters: event.target.value,
                }))
              }
            />
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={siteForm.locationCheckEnabled}
              onChange={(event) =>
                setSiteForm((current) => ({
                  ...current,
                  locationCheckEnabled: event.target.checked,
                }))
              }
            />{" "}
            Location check enabled
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={siteForm.allowReadOnlyRemoteAccess}
              onChange={(event) =>
                setSiteForm((current) => ({
                  ...current,
                  allowReadOnlyRemoteAccess: event.target.checked,
                }))
              }
            />{" "}
            Allow read-only remote access
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={siteForm.managerOverrideEnabled}
              onChange={(event) =>
                setSiteForm((current) => ({
                  ...current,
                  managerOverrideEnabled: event.target.checked,
                }))
              }
            />{" "}
            Manager override enabled
          </label>
          <div className="inline-actions">
            <button
              type="button"
              className="ghost-button compact-button"
              onClick={setSiteFromDevice}
            >
              Set site location from this device
            </button>
            <button
              type="button"
              className="ghost-button compact-button"
              onClick={checkLocation}
            >
              Check my location
            </button>
            <button type="submit" className="primary-button compact-button">
              Save site settings
            </button>
          </div>
        </form>
        <div className="editor-form compact-editor">
          <h3>Manager override</h3>
          {activeSiteOverride && (
            <p className="all-clear">
              Override active until{" "}
              {formatDateTime(activeSiteOverride.expiresAt)} by{" "}
              {activeSiteOverride.overrideBy}.
            </p>
          )}
          <label>
            Duration
            <select
              value={overrideForm.duration}
              onChange={(event) =>
                setOverrideForm((current) => ({
                  ...current,
                  duration: event.target.value,
                }))
              }
            >
              <option value="15">15 minutes</option>
              <option value="60">1 hour</option>
              <option value="day">Rest of day</option>
            </select>
          </label>
          <label>
            Reason/comment
            <input
              value={overrideForm.reason}
              onChange={(event) =>
                setOverrideForm((current) => ({
                  ...current,
                  reason: event.target.value,
                }))
              }
            />
          </label>
          <button
            type="button"
            className="primary-button compact-button"
            onClick={activateOverride}
          >
            Enable temporary override
          </button>
        </div>
      </section>

      <section className="alert-dashboard-panel">
        <div>
          <p className="eyebrow">Alerts</p>
          <h2>Open alerts</h2>
          <p className="muted">
            Synced through Supabase when configured. Urgent alerts can email the
            manager when the Edge Function and Resend secrets are deployed.
          </p>
        </div>
        {alertGroups.openUrgent.length + alertGroups.openNormal.length ===
          0 && <p className="muted">No open alerts.</p>}
        <div className="alert-group">
          <h3>Open urgent alerts</h3>
          {alertGroups.openUrgent.length === 0 && (
            <p className="muted">None.</p>
          )}
          {alertGroups.openUrgent.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              isManager
              onAction={updateAlert}
              onRetryEmail={retryEmail}
            />
          ))}
        </div>
        <div className="alert-group">
          <h3>Open normal alerts</h3>
          {alertGroups.openNormal.length === 0 && (
            <p className="muted">None.</p>
          )}
          {alertGroups.openNormal.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              isManager
              onAction={updateAlert}
              onRetryEmail={retryEmail}
            />
          ))}
        </div>
        {alertGroups.acknowledged.length > 0 && (
          <div className="alert-group acknowledged-group">
            <h3>Acknowledged alerts</h3>
            {alertGroups.acknowledged.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                isManager
                onAction={updateAlert}
                onRetryEmail={retryEmail}
              />
            ))}
          </div>
        )}
        {alertGroups.resolved.length > 0 && (
          <details className="alert-group resolved-group">
            <summary>Resolved alerts ({alertGroups.resolved.length})</summary>
            {alertGroups.resolved.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                isManager
                onAction={updateAlert}
                onRetryEmail={retryEmail}
              />
            ))}
          </details>
        )}
      </section>

      <section className="local-status-card">
        <div>
          <p className="eyebrow">Pilot data</p>
          <h2>Local data status</h2>
          <p className="muted">Saved in this browser on this device.</p>
        </div>
        <div className="status-grid">
          <span>
            <strong>{loggedDates}</strong> logged dates
          </span>
          <span>
            <strong>{handledRecords}</strong> handled records
          </span>
          <span>
            <strong>{allHandoversWithContent.length}</strong> handover notes
          </span>
          <span>
            <strong>{finishRecords.length}</strong> finish records
          </span>
          <span>
            <strong>{alerts.filter(isOpenAlert).length}</strong> open alerts
          </span>
          <span>
            <strong>{responsibleAssignments.length}</strong> responsible
          </span>
          <span>
            <strong>{usingDefaultRoutines ? "Default" : "Local edits"}</strong>{" "}
            routines
          </span>
        </div>
        <p className="muted">
          {backupStatus}{" "}
          {lastExportAt
            ? `Last backup: ${formatBackupTime(lastExportAt)}.`
            : ""}
        </p>
        <div className="backup-actions">
          <button
            type="button"
            className="primary-button compact-button"
            onClick={exportData}
          >
            Export backup
          </button>
          <button
            type="button"
            className="ghost-button compact-button"
            onClick={onResetPilotNotice}
          >
            Show pilot notice again
          </button>
        </div>
      </section>

      <section className="pilot-tools-grid">
        <article className="quick-start-card">
          <div className="panel-title-row">
            <div>
              <p className="eyebrow">Pilot</p>
              <h2>Pilot quick start</h2>
            </div>
            <button
              type="button"
              className="ghost-button compact-button"
              onClick={copyPilotInstructions}
            >
              Copy
            </button>
          </div>
          <ol>
            <li>Staff enter their code.</li>
            <li>
              Time2Staff use OPEN, CLOSE or EVENT, then their real first name.
            </li>
            <li>Choose shift and mark tasks Done only when completed.</li>
            <li>Use Not relevant only when the task does not apply today.</li>
            <li>Add handover notes before leaving.</li>
            <li>Critical tasks must be physically checked.</li>
          </ol>
        </article>

        <article className="diagnostics-card">
          <div className="panel-title-row">
            <div>
              <p className="eyebrow">Data health</p>
              <h2>Diagnostics</h2>
            </div>
            <button
              type="button"
              className="ghost-button compact-button"
              onClick={copyDiagnostics}
            >
              Copy
            </button>
          </div>
          <pre>{buildDiagnostics()}</pre>
        </article>
      </section>

      <section className="manager-list">
        <h2>Events</h2>
        <p className="muted">
          Create local event cards for Event Floor Manager overview. Julie can
          be event responsible without becoming cash/invoice or locking
          responsible.
        </p>
        {todayEvents.length === 0 && (
          <p className="muted">No event cards for this date.</p>
        )}
        {todayEvents.map((event) => (
          <article key={event.id} className="log-row">
            <strong>{event.eventName}</strong>
            <span>
              {event.client} | {event.venue} | {event.startTime}-{event.endTime}{" "}
              | {event.expectedGuests} guests
            </span>
            <small>
              Event: {event.eventResponsible || "Unassigned"} | Closing:{" "}
              {event.closingResponsible || "Unassigned"} | Cash/invoice:{" "}
              {event.cashInvoiceResponsible || "Unassigned"} | Locking:{" "}
              {event.lockingResponsible || "Unassigned"}
            </small>
            <div className="inline-actions">
              <button
                type="button"
                className="ghost-button compact-button"
                onClick={() => setEventForm(event)}
              >
                Edit event
              </button>
            </div>
          </article>
        ))}
        <form className="editor-form compact-editor" onSubmit={saveEvent}>
          <label>
            Event name
            <input
              value={eventForm.eventName}
              onChange={(event) =>
                setEventForm((current) => ({
                  ...current,
                  eventName: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Client/company
            <input
              value={eventForm.client}
              onChange={(event) =>
                setEventForm((current) => ({
                  ...current,
                  client: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Venue
            <select
              value={eventForm.venue}
              onChange={(event) =>
                setEventForm((current) => ({
                  ...current,
                  venue: event.target.value,
                }))
              }
            >
              {eventVenues.map((venue) => (
                <option key={venue} value={venue}>
                  {venue}
                </option>
              ))}
            </select>
          </label>
          <label>
            Start time
            <input
              type="time"
              value={eventForm.startTime}
              onChange={(event) =>
                setEventForm((current) => ({
                  ...current,
                  startTime: event.target.value,
                }))
              }
            />
          </label>
          <label>
            End time
            <input
              type="time"
              value={eventForm.endTime}
              onChange={(event) =>
                setEventForm((current) => ({
                  ...current,
                  endTime: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Expected guests
            <input
              type="number"
              value={eventForm.expectedGuests}
              onChange={(event) =>
                setEventForm((current) => ({
                  ...current,
                  expectedGuests: event.target.value,
                }))
              }
            />
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={eventForm.julieLeads}
              onChange={(event) =>
                setEventForm((current) => ({
                  ...current,
                  julieLeads: event.target.checked,
                }))
              }
            />{" "}
            Julie leads this event
          </label>
          {[
            ["eventResponsible", "Event responsible"],
            ["closingResponsible", "Closing responsible"],
            ["cashInvoiceResponsible", "Cash/invoice responsible"],
            ["lockingResponsible", "Locking responsible"],
          ].map(([field, label]) => (
            <label key={field}>
              {label}
              <input
                list="staff-names"
                value={eventForm[field]}
                onChange={(event) =>
                  setEventForm((current) => ({
                    ...current,
                    [field]: event.target.value,
                  }))
                }
              />
            </label>
          ))}
          <label>
            Notes
            <textarea
              rows="2"
              value={eventForm.notes}
              onChange={(event) =>
                setEventForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
            />
          </label>
          <div className="inline-actions">
            <button type="submit" className="primary-button compact-button">
              {eventForm.id ? "Save event" : "Add event"}
            </button>
            {eventForm.id && (
              <button
                type="button"
                className="ghost-button compact-button"
                onClick={() => setEventForm(blankEventForm)}
              >
                Cancel edit
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="manager-list staff-code-manager">
        <div className="panel-title-row">
          <div>
            <p className="eyebrow">Manager only</p>
            <h2>Staff codes</h2>
          </div>
          <label className="toggle-row small-toggle">
            <input
              type="checkbox"
              checked={showStaffCodes}
              onChange={(event) => setShowStaffCodes(event.target.checked)}
            />
            Show codes
          </label>
        </div>
        <p className="muted">
          Staff code changes are local to this browser/device. To use these
          codes on another device, export/import backup or add them to default
          staff before deployment.
        </p>
        <p className="muted">
          Local/client-side access only. Do not treat these codes as real
          authentication.
        </p>
        <div className="backup-actions">
          <button
            type="button"
            className="ghost-button compact-button"
            onClick={exportStaffUsers}
          >
            Export staff codes
          </button>
          <label className="file-button compact-file">
            Import staff codes
            <input
              type="file"
              accept="application/json"
              onChange={importStaffUsers}
            />
          </label>
        </div>
        <div className="staff-code-list">
          {staffUsers.map((staff) => (
            <article
              key={staff.id}
              className={`log-row ${staff.active === false ? "inactive-task" : ""}`}
            >
              <strong>{staff.name}</strong>
              <span>
                {staff.role} | {staff.isManager ? "Manager" : "Staff"} |{" "}
                {staff.active === false ? "Inactive" : "Active"}
              </span>
              <small>
                Code: {showStaffCodes ? staff.code : "â€¢â€¢â€¢â€¢â€¢â€¢"}
                {staff.needsName ? " | asks for real name" : ""}
              </small>
              <div className="inline-actions">
                <button
                  type="button"
                  className="ghost-button compact-button"
                  onClick={() => editStaffUser(staff)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="ghost-button compact-button"
                  onClick={() => toggleStaffActive(staff)}
                >
                  {staff.active === false ? "Reactivate" : "Deactivate"}
                </button>
                {showStaffCodes && (
                  <button
                    type="button"
                    className="ghost-button compact-button"
                    onClick={() => copyStaffCode(staff.code)}
                  >
                    Copy code
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
        <form className="editor-form staff-editor" onSubmit={saveStaffUser}>
          <label>
            Display name
            <input
              value={staffForm.name}
              onChange={(event) =>
                setStaffForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder="Name"
            />
          </label>
          <label>
            Role/type
            <input
              value={staffForm.role}
              onChange={(event) =>
                setStaffForm((current) => ({
                  ...current,
                  role: event.target.value,
                }))
              }
              placeholder="staff"
            />
          </label>
          <label>
            Code
            <input
              value={staffForm.code}
              onChange={(event) =>
                setStaffForm((current) => ({
                  ...current,
                  code: event.target.value.trim(),
                }))
              }
              placeholder="Minimum 4 characters"
            />
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={staffForm.isManager}
              onChange={(event) =>
                setStaffForm((current) => ({
                  ...current,
                  isManager: event.target.checked,
                  role:
                    event.target.checked && current.role === "staff"
                      ? "manager"
                      : current.role,
                }))
              }
            />
            Manager
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={staffForm.needsName}
              onChange={(event) =>
                setStaffForm((current) => ({
                  ...current,
                  needsName: event.target.checked,
                }))
              }
            />
            Ask for real first name
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={staffForm.active}
              onChange={(event) =>
                setStaffForm((current) => ({
                  ...current,
                  active: event.target.checked,
                }))
              }
            />
            Active
          </label>
          <div className="inline-actions">
            <button type="submit" className="primary-button compact-button">
              {staffForm.id ? "Save staff user" : "Add staff user"}
            </button>
            <button
              type="button"
              className="ghost-button compact-button"
              onClick={() =>
                setStaffForm((current) => ({
                  ...current,
                  code: generateStaffCode(staffUsers),
                }))
              }
            >
              Generate code
            </button>
            {staffForm.id && (
              <button
                type="button"
                className="ghost-button compact-button"
                onClick={resetStaffForm}
              >
                Cancel edit
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="manager-list">
        <h2>Responsibility roles</h2>
        <p className="muted">
          Responsibility is role-based. Event lead, closing lead, cash/invoice
          lead and locking lead may be different people.
        </p>
        <form
          className="editor-form compact-editor"
          onSubmit={assignResponsible}
        >
          <label>
            Shift
            <select
              value={responsibleForm.shiftType}
              onChange={(event) =>
                setResponsibleForm((current) => ({
                  ...current,
                  shiftType: event.target.value,
                }))
              }
            >
              {activeShifts.map((shift) => (
                <option key={shift.id} value={shift.id}>
                  {shift.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Role
            <select
              value={responsibleForm.roleType}
              onChange={(event) =>
                setResponsibleForm((current) => ({
                  ...current,
                  roleType: event.target.value,
                }))
              }
            >
              {responsibilityTypes.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Event
            <select
              value={responsibleForm.eventId}
              onChange={(event) =>
                setResponsibleForm((current) => ({
                  ...current,
                  eventId: event.target.value,
                }))
              }
            >
              <option value="">Shift-level</option>
              {todayEvents.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.eventName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Responsible person
            <input
              list="staff-names"
              value={responsibleForm.responsibleName}
              onChange={(event) =>
                setResponsibleForm((current) => ({
                  ...current,
                  responsibleName: event.target.value,
                }))
              }
              placeholder="Name"
            />
            <datalist id="staff-names">
              {staffUsers.map((staff) => (
                <option key={staff.id} value={staff.name} />
              ))}
              {staffNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>
          <label>
            Note
            <input
              value={responsibleForm.note}
              onChange={(event) =>
                setResponsibleForm((current) => ({
                  ...current,
                  note: event.target.value,
                }))
              }
              placeholder="Optional note"
            />
          </label>
          <button type="submit" className="primary-button">
            Save responsible
          </button>
        </form>
        {dateResponsible.length === 0 && (
          <p className="muted">No responsible assignments for this date.</p>
        )}
        {dateResponsible.map((assignment) => (
          <article key={assignment.id} className="log-row">
            <strong>
              {responsibilityLabels[assignment.roleType] ||
                "Overall shift lead"}
            </strong>
            <span>
              {assignment.responsibleName} | assigned{" "}
              {formatDateTime(assignment.assignedAt)}
            </span>
            <small>
              {shiftLabels[assignment.shiftType] || assignment.shiftType}
              {assignment.eventId
                ? ` | ${todayEvents.find((event) => event.id === assignment.eventId)?.eventName || "Event"}`
                : ""}
            </small>
            {assignment.note && <small>{assignment.note}</small>}
          </article>
        ))}
      </section>

      <section className="manager-list">
        <h2>Real alert notifications</h2>
        <p className="muted">
          Phase 2 adds manager email for urgent/immediate-help alerts through a
          Supabase Edge Function. Push, SMS and Slack can still be added later.
        </p>
        <div className="task-labels">
          <span>Slack webhook</span>
          <span>Email notification via Resend</span>
          <span>Push notification service</span>
          <span>Supabase Edge Function</span>
          <span>SMS gateway</span>
        </div>
      </section>

      <section className="summary-grid">
        {activeShifts.map((shift) => {
          const progress = progressForShift(shift.id);
          const handled = progress.done + progress.notRelevant;
          const percent = progress.total ? (handled / progress.total) * 100 : 0;
          const finish = dateFinishRecords.find(
            (record) => record.shiftType === shift.id,
          );
          return (
            <article key={shift.id} className="summary-card">
              <span>{shift.label}</span>
              <strong>
                {handled}/{progress.total}
              </strong>
              <small>
                Done {progress.done} | N/A {progress.notRelevant}
              </small>
              <small>
                Missing {progress.missing} | Critical {progress.criticalMissing}
              </small>
              {finish && <small>Finished by {finish.finishedBy}</small>}
              <div
                className="mini-progress"
                aria-label={`${shift.label} progress`}
              >
                <i style={{ width: `${percent}%` }} />
              </div>
            </article>
          );
        })}
      </section>

      <section className="critical-panel">
        <div className="panel-title-row">
          <h2>{showAllCritical ? "All critical tasks" : "Critical missing"}</h2>
          <label className="toggle-row small-toggle">
            <input
              type="checkbox"
              checked={showAllCritical}
              onChange={(event) => setShowAllCritical(event.target.checked)}
            />
            Show all critical tasks
          </label>
        </div>
        {criticalPanelTasks.length === 0 && (
          <p className="muted">
            No critical tasks need attention for this filter.
          </p>
        )}
        {Object.entries(criticalGroups).map(([shiftType, tasksForShift]) => (
          <div key={shiftType} className="critical-group">
            {shiftFilter === "all" && (
              <h3>{shiftLabels[shiftType] || shiftType}</h3>
            )}
            {tasksForShift.map((task) => {
              const log = getTaskLog(dateLogs, date, task.id);
              return (
                <p key={task.id}>
                  {task.title}
                  <span>
                    {task.section}
                    {log ? ` | ${log.status} by ${log.completedBy}` : ""}
                  </span>
                </p>
              );
            })}
          </div>
        ))}
      </section>

      <section className="attention-panel">
        <h2>Needs attention</h2>
        <div className="attention-grid">
          <article>
            <strong>{criticalMissing.length}</strong>
            <span>Incomplete critical</span>
          </article>
          <article>
            <strong>{commentLogs.length}</strong>
            <span>With comments</span>
          </article>
          <article>
            <strong>{inputDeviationLogs.length}</strong>
            <span>Inputs or deviations</span>
          </article>
          <article>
            <strong>{notRelevantLogs.length}</strong>
            <span>Not relevant</span>
          </article>
          <article>
            <strong>{todayEvents.length}</strong>
            <span>Events</span>
          </article>
          <article>
            <strong>{assetIssues.length}</strong>
            <span>Asset issues</span>
          </article>
        </div>
        {attentionItems.length === 0 && (
          <p className="muted">All clear for this filter/date.</p>
        )}
        {attentionItems.map((item) => (
          <p key={item.id} className="attention-line">
            <small>{item.type}</small>
            {item.title}
            <span>{item.detail}</span>
          </p>
        ))}
        {dateCashSignoffs
          .filter(
            (record) =>
              record.invoiceSent !== "yes" ||
              record.salesPunched !== "yes" ||
              record.settlementPerformed !== "yes",
          )
          .map((record) => (
            <p key={record.id} className="attention-line">
              <small>Cash/invoice</small>
              {record.shiftType}
              <span>
                {record.comments || "Missing cash/invoice signoff item"}
              </span>
            </p>
          ))}
        {assetIssues.map((record) => (
          <p key={record.id} className="attention-line">
            <small>Asset issue</small>
            {record.assetLabel}
            <span>
              {record.condition} | {record.comment || "Needs attention"}
            </span>
          </p>
        ))}
      </section>

      <section className="daily-report-panel">
        <div className="panel-title-row">
          <div>
            <p className="eyebrow">Report</p>
            <h2>Daily report</h2>
          </div>
          <div className="backup-actions">
            <button
              type="button"
              className="primary-button compact-button"
              onClick={copyDailyReport}
            >
              Copy daily report
            </button>
            <button
              type="button"
              className="ghost-button compact-button"
              onClick={copyBackendDailyReport}
            >
              Copy backend daily report
            </button>
          </div>
        </div>
        {(message.includes("Daily report") ||
          message.includes("Could not copy automatically")) && (
          <p className="status-message report-message">{message}</p>
        )}
        <textarea
          className="report-textarea"
          readOnly
          rows="14"
          value={dailyReportText || buildDailyReport()}
          aria-label="Daily report text"
        />
      </section>

      <section className="local-status-card">
        <div className="panel-title-row">
          <div>
            <p className="eyebrow">Phase 4B</p>
            <h2>Backend history</h2>
            <p className="muted">
              {authStatus.loginSource === "supabase_auth"
                ? `Backend history source: ${backendHistoryStatus.source === "supabase" ? "Supabase" : "Unavailable"}`
                : "Backend history requires Email login. Staff-code mode uses local cache only."}
            </p>
          </div>
          <label>
            Date
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
        </div>
        <div className="backup-actions">
          <button
            type="button"
            className="primary-button compact-button"
            onClick={() => refreshBackendHistory(date)}
          >
            Refresh backend history
          </button>
          <button
            type="button"
            className="ghost-button compact-button"
            onClick={() => setDate(todayKey())}
          >
            Today
          </button>
          <button
            type="button"
            className="ghost-button compact-button"
            onClick={() => setDate(offsetDate(-1))}
          >
            Yesterday
          </button>
          <button
            type="button"
            className="ghost-button compact-button"
            onClick={refreshBackendHistoryRange}
          >
            Last 7 days
          </button>
        </div>
        <div className="status-grid">
          <span>
            <strong>{backendHistorySummary?.shiftSessions || 0}</strong> Shift
            sessions
          </span>
          <span>
            <strong>{backendHistorySummary?.activeSessions || 0}</strong> Active
            sessions
          </span>
          <span>
            <strong>{backendHistorySummary?.finishedSessions || 0}</strong>{" "}
            Finished sessions
          </span>
          <span>
            <strong>{backendHistorySummary?.uniqueStaff || 0}</strong> Unique
            staff/users
          </span>
          <span>
            <strong>{backendHistorySummary?.taskRows || 0}</strong> Raw backend
            task rows
          </span>
          <span>
            <strong>{backendHistorySummary?.uniqueTaskRecords || 0}</strong>{" "}
            Unique task records
          </span>
          <span>
            <strong>{backendHistorySummary?.doneTasks || 0}</strong> Done tasks
          </span>
          <span>
            <strong>{backendHistorySummary?.notRelevantTasks || 0}</strong> Not
            relevant tasks
          </span>
          <span>
            <strong>{backendHistorySummary?.openTasks || 0}</strong> Open/reset
            rows
          </span>
          <span>
            <strong>{backendHistorySummary?.handoverNotes || 0}</strong>{" "}
            Handover notes
          </span>
          <span>
            <strong>{backendHistorySummary?.openAlerts || 0}</strong> Open
            alerts
          </span>
          <span>
            <strong>{backendHistorySummary?.resolvedAlerts || 0}</strong>{" "}
            Resolved alerts
          </span>
          <span>
            <strong>{backendHistorySummary?.urgentAlerts || 0}</strong> Urgent
            alerts
          </span>
          <span>
            <strong>{backendHistorySummary?.financialSignoffs || 0}</strong>{" "}
            Financial signoffs
          </span>
          <span>
            <strong>{backendHistorySummary?.financialCashSignoffs || 0}</strong>{" "}
            Cash signoffs
          </span>
          <span>
            <strong>
              {backendHistorySummary?.financialInvoiceSignoffs || 0}
            </strong>{" "}
            Invoice signoffs
          </span>
          <span>
            <strong>
              {backendHistorySummary?.financialSettlementTerminalSignoffs || 0}
            </strong>{" "}
            Settlement/terminal
          </span>
          <span>
            <strong>{backendHistorySummary?.financialCompleted || 0}</strong>{" "}
            Financial completed
          </span>
          <span>
            <strong>{backendHistorySummary?.financialReviewed || 0}</strong>{" "}
            Financial reviewed
          </span>
          <span>
            <strong>{backendHistorySummary?.financialIssues || 0}</strong>{" "}
            Financial issues
          </span>
          <span>
            <strong>
              {backendHistorySummary?.financialVarianceTotal || 0}
            </strong>{" "}
            Financial variance
          </span>
          <span>
            <strong>
              {backendHistoryStatus.lastRefreshAt
                ? formatDateTime(backendHistoryStatus.lastRefreshAt)
                : "Not yet"}
            </strong>{" "}
            Last backend history refresh
          </span>
          <span>
            <strong>{backendHistoryStatus.duplicatesIgnored || 0}</strong> Merge
            duplicates ignored
          </span>
          <span>
            <strong>{backendHistoryStatus.reportSource}</strong> Backend report
            source
          </span>
          <span>
            <strong>
              {backendHistoryStatus.lastReportCopyAt
                ? formatDateTime(backendHistoryStatus.lastReportCopyAt)
                : "Not copied"}
            </strong>{" "}
            Last backend report copy
          </span>
        </div>
        <div className="phase-backend-panel">
          <div className="panel-title-row">
            <div>
              <p className="eyebrow">Phase 5A</p>
              <h3>Financial signoff backend</h3>
              <p className="muted">
                Cash/invoice signoffs sync to Supabase for Email login users.
                Staff-code signoffs stay local until exported/imported.
              </p>
            </div>
          </div>
          <div className="backup-actions">
            <button
              type="button"
              className="primary-button compact-button"
              onClick={async () => {
                const result = await refreshFinancialSignoffs?.(date);
                setMessage(
                  result?.message || "Financial signoff refresh finished.",
                );
              }}
            >
              Refresh financial signoffs
            </button>
            <button
              type="button"
              className="ghost-button compact-button"
              onClick={() => {
                const result = onClearSyncedFinancialPendingRecords?.();
                if (result?.message) setMessage(result.message);
              }}
            >
              Clear synced financial pending records
            </button>
          </div>
          <div className="status-grid">
            <span>
              <strong>{financialBackendStatus.mode}</strong> Mode
            </span>
            <span>
              <strong>{financialBackendStatus.lastAction || "None"}</strong>{" "}
              Last action
            </span>
            <span>
              <strong>{financialBackendStatus.lastResult || "None"}</strong>{" "}
              Last result
            </span>
            <span>
              <strong>{financialBackendStatus.rowsLoaded || 0}</strong> Rows
              loaded
            </span>
            <span>
              <strong>{financialBackendStatus.rowsMerged || 0}</strong> Rows
              merged
            </span>
            <span>
              <strong>{financialBackendStatus.duplicatesIgnored || 0}</strong>{" "}
              Duplicates ignored
            </span>
            <span>
              <strong>{financialBackendStatus.pendingLocalRecords || 0}</strong>{" "}
              Pending local
            </span>
            <span>
              <strong>
                {financialBackendStatus.pendingMatchedInBackend || 0}
              </strong>{" "}
              Pending matched
            </span>
            <span>
              <strong>{financialBackendStatus.localOnlyRemaining || 0}</strong>{" "}
              Local-only remaining
            </span>
          </div>
          {financialBackendStatus.lastCleanupResult && (
            <p className="muted">{financialBackendStatus.lastCleanupResult}</p>
          )}
          {financialBackendStatus.lastError && (
            <p className="critical-warning">
              {financialBackendStatus.lastError}
            </p>
          )}
          <div className="history-table">
            {visibleFinancialSignoffs.length === 0 && (
              <p className="muted">No financial signoffs for this date yet.</p>
            )}
            {visibleFinancialSignoffs.slice(0, 8).map((record) => (
              <article
                key={record.backendId || record.localId || record.id}
                className="log-row"
              >
                <strong>
                  {record.signoffType || "daily_finance"} |{" "}
                  {shiftLabels[record.shiftType] ||
                    record.shiftType ||
                    "Unknown shift"}
                </strong>
                <span>
                  Status {record.status || "local"} | Signed by{" "}
                  {record.signedOffBy || record.formSignedOffBy || "Missing"}
                  {record.signedOffAt
                    ? ` at ${formatDateTime(record.signedOffAt)}`
                    : ""}
                </span>

                <small>
                  Customer/table created today:{" "}
                  {displayFinancialAnswer(
                    record,
                    "tableCreated",
                    "tableCreatedLabel",
                  )}
                </small>
                <small>
                  All sales punched correctly:{" "}
                  {displayFinancialAnswer(
                    record,
                    "salesPunched",
                    "salesPunchedLabel",
                  )}
                </small>
                <small>
                  Invoice/receipt/report sent:{" "}
                  {displayFinancialAnswer(
                    record,
                    "invoiceSent",
                    "invoiceSentLabel",
                  )}
                </small>
                <small>
                  Cash/register settlement performed:{" "}
                  {displayFinancialAnswer(
                    record,
                    "settlementPerformed",
                    "settlementPerformedLabel",
                  )}
                </small>

                {record.settlementPerformedBy && (
                  <small>
                    Settlement performed by: {record.settlementPerformedBy}
                  </small>
                )}
                {record.formSignedOffBy && (
                  <small>Sign-off by: {record.formSignedOffBy}</small>
                )}
                {record.reviewedBy && (
                  <small>
                    Reviewed by {record.reviewedBy} at{" "}
                    {formatDateTime(record.reviewedAt)}
                  </small>
                )}
                {record.comments && <small>Comments: {record.comments}</small>}
                {record.issueNotes && record.issueNotes !== record.comments && (
                  <small>Issue notes: {record.issueNotes}</small>
                )}
                {record.syncStatus && <small>Sync: {record.syncStatus}</small>}
                {record.backendId && record.status !== "reviewed" && (
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="ghost-button compact-button"
                      onClick={async () => {
                        const result = await onReviewFinancialSignoff?.(record);
                        setMessage(
                          result?.message ||
                            (result?.ok
                              ? "Financial signoff marked reviewed."
                              : "Could not review financial signoff."),
                        );
                        if (result?.ok) refreshBackendHistory(date);
                      }}
                    >
                      Mark reviewed
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
        <div className="phase-backend-panel">
          <div className="panel-title-row">
            <div>
              <p className="eyebrow">Phase 5B</p>
              <h3>Asset check backend</h3>
              <p className="muted">
                Payment terminal and POS device checks sync to Supabase for Email
                login users. Staff-code checks stay local until exported/imported.
              </p>
            </div>
          </div>
          <div className="backup-actions">
            <button
              type="button"
              className="primary-button compact-button"
              onClick={async () => {
                const result = await refreshAssetChecks?.(date);
                setMessage(result?.message || "Asset check refresh finished.");
              }}
            >
              Refresh asset checks
            </button>
            <button
              type="button"
              className="ghost-button compact-button"
              onClick={() => {
                const result = onClearSyncedAssetPendingRecords?.();
                if (result?.message) setMessage(result.message);
              }}
            >
              Clear synced asset pending records
            </button>
          </div>
          <div className="status-grid">
            <span>
              <strong>{assetBackendStatus.mode}</strong> Mode
            </span>
            <span>
              <strong>{assetBackendStatus.lastAction || "None"}</strong>{" "}
              Last action
            </span>
            <span>
              <strong>{assetBackendStatus.lastResult || "None"}</strong>{" "}
              Last result
            </span>
            <span>
              <strong>{assetBackendStatus.rowsLoaded || 0}</strong> Rows loaded
            </span>
            <span>
              <strong>{assetBackendStatus.rowsMerged || 0}</strong> Rows merged
            </span>
            <span>
              <strong>{assetBackendStatus.duplicatesIgnored || 0}</strong>{" "}
              Duplicates ignored
            </span>
            <span>
              <strong>{dateAssetChecks.length}</strong> Checks this date
            </span>
            <span>
              <strong>{assetIssues.length}</strong> Issues this date
            </span>
            <span>
              <strong>{assetBackendStatus.pendingLocalRecords || 0}</strong>{" "}
              Pending local
            </span>
            <span>
              <strong>{assetBackendStatus.localOnlyRemaining || 0}</strong>{" "}
              Local-only remaining
            </span>
          </div>
          {assetBackendStatus.lastCleanupResult && (
            <p className="muted">{assetBackendStatus.lastCleanupResult}</p>
          )}
          {assetBackendStatus.lastError && (
            <p className="critical-warning">{assetBackendStatus.lastError}</p>
          )}
          <div className="history-table">
            {dateAssetChecks.length === 0 && (
              <p className="muted">No asset checks for this date yet.</p>
            )}
            {dateAssetChecks.slice(0, 10).map((record) => (
              <article
                key={record.backendId || record.localId || record.id}
                className={`log-row priority-${assetHasIssue(record) ? "critical" : "normal"}`}
              >
                <strong>{record.assetLabel || record.assetId}</strong>
                <span>
                  {shiftLabels[record.shiftType] || record.shiftType || "Unknown shift"} | Present{" "}
                  {record.present || "missing"} | Correct location{" "}
                  {record.correctLocation || "missing"} | Charging{" "}
                  {record.charging || "missing"}
                </span>
                <small>
                  Condition: {record.condition || "missing"} | Serial checked:{" "}
                  {record.serialChecked || "missing"} | Last 4: {record.serialLast4 || "missing"}
                </small>
                <small>
                  Signed by {record.signedOffBy || "Missing"}
                  {record.signedOffAt
                    ? ` at ${formatDateTime(record.signedOffAt)}`
                    : ""}
                </small>
                {record.comment && <small>Comment: {record.comment}</small>}
                {record.syncStatus && <small>Sync: {record.syncStatus}</small>}
                {record.syncError && (
                  <small className="sync-note error">
                    Backend sync: {record.syncError}
                  </small>
                )}
              </article>
            ))}
          </div>
        </div>
        {backendHistoryStatus.lastError && (
          <p className="critical-warning">{backendHistoryStatus.lastError}</p>
        )}
        {backendHistoryStatus.source === "supabase" &&
          backendHistorySummary && (
            <div className="empty-state compact-empty">
              {backendHistorySummary.shiftSessions === 0 && (
                <p>No Supabase shift data found for this date.</p>
              )}
              {backendHistorySummary.taskRows === 0 && (
                <p>No backend checklist rows found for this date.</p>
              )}
              {backendHistorySummary.handoverNotes === 0 && (
                <p>No backend handover notes found for this date.</p>
              )}
            </div>
          )}
        {backendHistoryRange.length > 0 && (
          <div className="history-table">
            {backendHistoryRange.map((day) => (
              <article
                key={day.date}
                className="log-row"
                role="button"
                tabIndex={0}
                onClick={() => {
                  setDate(day.date);
                  refreshBackendHistory(day.date);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    setDate(day.date);
                    refreshBackendHistory(day.date);
                  }
                }}
              >
                <strong>{day.date}</strong>
                <span>
                  Sessions {day.shiftSessions} | Finished {day.finishedSessions}{" "}
                  | Unique tasks {day.uniqueTaskRecords}
                </span>
                <small>
                  Done {day.doneTasks} | N/A {day.notRelevantTasks} | Handovers{" "}
                  {day.handoverNotes} | Alerts {day.totalAlerts} | Urgent{" "}
                  {day.urgentAlerts} | Open {day.openAlerts} | Financial{" "}
                  {day.financialSignoffs} | Issues {day.financialIssues} |
                  Reviewed {day.financialReviewed}
                </small>
              </article>
            ))}
          </div>
        )}
        <button
          type="button"
          className="text-button"
          onClick={() => setShowHistoryDetails((current) => !current)}
        >
          {showHistoryDetails
            ? "Hide backend history debug"
            : "Show backend history debug"}
        </button>
        {showHistoryDetails && (
          <div className="backend-details">
            <strong>Backend history debug</strong>
            <pre>
              {JSON.stringify(
                {
                  backendHistoryStatus,
                  backendHistorySummary,
                  backendHistoryRange,
                },
                null,
                2,
              )}
            </pre>
          </div>
        )}
      </section>

      <section className="manager-list">
        <h2>Handover notes</h2>
        {visibleHandovers.length === 0 && (
          <p className="muted">No handover notes for this date/filter.</p>
        )}
        {Object.entries(handoverGroups).map(([shiftType, notes]) => (
          <div key={shiftType} className="handover-group">
            <h3>{shiftLabels[shiftType]}</h3>
            {notes.map((note) => (
              <article
                key={`${note.date}-${note.shiftType}-${note.completedBy}`}
                className="log-row"
              >
                <strong>{note.completedBy}</strong>
                <span>{formatDateTime(note.updatedAt)}</span>
                {note.nextShift && <small>Next shift: {note.nextShift}</small>}
                {note.lowStock && <small>Low stock: {note.lowStock}</small>}
                {note.maintenance && (
                  <small>Maintenance: {note.maintenance}</small>
                )}
                {note.memberEvent && (
                  <small>Member/event: {note.memberEvent}</small>
                )}
              </article>
            ))}
          </div>
        ))}
      </section>

      <section className="manager-list">
        <h2>Completed and handled tasks</h2>
        {filteredLogs.length === 0 && (
          <p className="muted">No completed tasks yet for this filter.</p>
        )}
        {filteredLogs.map((log) => (
          <article key={log.id} className={`log-row priority-${log.priority}`}>
            <strong>{log.taskTitle}</strong>
            <span>
              {log.completedBy} | {formatDateTime(log.completedAt)} |{" "}
              {shiftLabels[log.shiftType] || log.shiftType}
            </span>
            <small>
              {log.status === "not_relevant" ? "Not relevant" : "Done"} |{" "}
              {log.section}
            </small>
            {log.input && <small>Input: {log.input}</small>}
            {log.comment && <small>Comment: {log.comment}</small>}
          </article>
        ))}
      </section>

      <section className="manager-list">
        <h2>Asset registry</h2>
        <p className="muted">
          Asset registry syncs to Supabase for Email login users. Staff-code
          changes stay local until exported/imported.
        </p>
        <div className="backup-actions">
          <button
            type="button"
            className="ghost-button compact-button"
            onClick={async () => {
              const result = await refreshAssetRegistry?.();
              setMessage(result?.message || "Asset registry refresh finished.");
            }}
          >
            Refresh asset registry
          </button>
        </div>
        <p className="muted">
          Registry backend: {assetBackendStatus.registryRowsLoaded || 0} loaded
          | {assetBackendStatus.registryRowsMerged || 0} merged |{" "}
          {assetBackendStatus.registryDuplicatesIgnored || 0} duplicates ignored
        </p>
        <p className="muted">
          Youngs payment terminals and POS/iPad devices only. Clear test logs
          does not delete this registry.
        </p>
        <div className="routine-task-list">
          {assets.map((asset) => (
            <article
              key={asset.id}
              className={`log-row ${asset.active === false ? "inactive-task" : ""}`}
            >
              <strong>
                {asset.provider} {asset.model}
              </strong>
              <span>
                {asset.type} | {asset.expectedVenue} | {asset.expectedStation} |{" "}
                {asset.condition}
              </span>
              <small>
                Serial: {asset.serialNumber || "TBD"}
                {asset.defaultRequiredForClosing
                  ? " | required for closing"
                  : ""}
              </small>
              {asset.notes && <small>{asset.notes}</small>}
              <div className="inline-actions">
                <button
                  type="button"
                  className="ghost-button compact-button"
                  onClick={() => setAssetForm(asset)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="ghost-button compact-button"
                  onClick={async () => {
                    if (!(await requestWriteAccess())) return;
                    const nextAssets = assets.map((item) =>
                      item.id === asset.id
                        ? { ...item, active: item.active === false }
                        : item,
                    );
                    setAssets(nextAssets);
                    saveStorage(ASSET_REGISTRY_KEY, nextAssets);
                    setMessage(
                      asset.active === false
                        ? "Asset reactivated."
                        : "Asset deactivated.",
                    );
                  }}
                >
                  {asset.active === false ? "Reactivate" : "Deactivate"}
                </button>
              </div>
            </article>
          ))}
        </div>
        <form className="editor-form compact-editor" onSubmit={saveAsset}>
          <label>
            Type
            <select
              value={assetForm.type}
              onChange={(event) =>
                setAssetForm((current) => ({
                  ...current,
                  type: event.target.value,
                }))
              }
            >
              {assetTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label>
            Provider/brand
            <input
              value={assetForm.provider}
              onChange={(event) =>
                setAssetForm((current) => ({
                  ...current,
                  provider: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Model
            <input
              value={assetForm.model}
              onChange={(event) =>
                setAssetForm((current) => ({
                  ...current,
                  model: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Serial number
            <input
              value={assetForm.serialNumber}
              onChange={(event) =>
                setAssetForm((current) => ({
                  ...current,
                  serialNumber: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Expected venue
            <input
              value={assetForm.expectedVenue}
              onChange={(event) =>
                setAssetForm((current) => ({
                  ...current,
                  expectedVenue: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Expected station/register
            <input
              value={assetForm.expectedStation}
              onChange={(event) =>
                setAssetForm((current) => ({
                  ...current,
                  expectedStation: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Condition
            <select
              value={assetForm.condition}
              onChange={(event) =>
                setAssetForm((current) => ({
                  ...current,
                  condition: event.target.value,
                }))
              }
            >
              {assetConditions.map((condition) => (
                <option key={condition} value={condition}>
                  {condition}
                </option>
              ))}
            </select>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={assetForm.active}
              onChange={(event) =>
                setAssetForm((current) => ({
                  ...current,
                  active: event.target.checked,
                }))
              }
            />{" "}
            Active
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={assetForm.defaultRequiredForClosing}
              onChange={(event) =>
                setAssetForm((current) => ({
                  ...current,
                  defaultRequiredForClosing: event.target.checked,
                }))
              }
            />{" "}
            Required for closing
          </label>
          <label>
            Notes
            <textarea
              rows="2"
              value={assetForm.notes}
              onChange={(event) =>
                setAssetForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
            />
          </label>
          <div className="inline-actions">
            <button type="submit" className="primary-button compact-button">
              {assetForm.id ? "Save asset" : "Add asset"}
            </button>
            {assetForm.id && (
              <button
                type="button"
                className="ghost-button compact-button"
                onClick={() => setAssetForm(blankAssetForm)}
              >
                Cancel edit
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="manager-list">
        <h2>Missing tasks</h2>
        {missingTasks.length === 0 && (
          <p className="muted">No missing tasks for this filter.</p>
        )}
        {Object.entries(missingGroups).map(([key, tasksForGroup]) => {
          const [shiftType, section] = key.split("__");
          return (
            <div key={key} className="missing-group">
              <h3>
                {shiftLabels[shiftType]} | {section}
              </h3>
              {tasksForGroup.map((task) => (
                <article
                  key={task.id}
                  className={`log-row priority-${task.priority}`}
                >
                  <strong>{task.title}</strong>
                  <span>
                    {task.area} | {priorityLabels[task.priority]}
                  </span>
                </article>
              ))}
            </div>
          );
        })}
      </section>

      <section className="history-panel">
        <h2>History by date</h2>
        <div className="date-chips">
          {[todayKey(), ...dates.filter((entry) => entry !== todayKey())]
            .slice(0, 14)
            .map((entry) => (
              <button
                key={entry}
                type="button"
                onClick={() => setDate(entry)}
                className={entry === date ? "active" : ""}
              >
                {entry}
              </button>
            ))}
        </div>
      </section>

      <section className="backup-panel">
        <h2>Backup</h2>
        <p className="muted">
          Export backs up logs and imported routine edits from this browser.
        </p>
        <div className="backup-actions">
          <button type="button" className="primary-button" onClick={exportData}>
            Export JSON
          </button>
          <label className="file-button">
            Import JSON
            <input
              type="file"
              accept="application/json"
              onChange={importData}
            />
          </label>
        </div>
      </section>

      <section className="danger-zone">
        <p className="eyebrow">Pilot reset</p>
        <h2>Clear test logs</h2>
        <p className="muted">
          Clears local shift logs and handover notes from this browser only.
          Routine setup will stay.
        </p>
        <label>
          Type CLEAR to confirm
          <input
            value={clearPhrase}
            onChange={(event) => setClearPhrase(event.target.value)}
            placeholder="CLEAR"
          />
        </label>
        <button
          type="button"
          className="ghost-button compact-button"
          onClick={clearTestLogs}
        >
          Clear test logs
        </button>
      </section>

      <section className="routine-editor">
        <div className="panel-title-row">
          <h2>Routine editor</h2>
          <div className="backup-actions">
            <button
              type="button"
              className="ghost-button compact-button"
              onClick={exportRoutines}
            >
              Export routines
            </button>
            <label className="file-button compact-file">
              Import routines
              <input
                type="file"
                accept="application/json"
                onChange={importRoutines}
              />
            </label>
          </div>
        </div>

        <div className="routine-task-list">
          {normalizeRoutines(routines)
            .flatMap((routine) => routine.tasks)
            .map((task) => (
              <article
                key={task.id}
                className={`log-row priority-${task.priority} ${task.active === false ? "inactive-task" : ""}`}
              >
                <strong>{task.title}</strong>
                <span>
                  {shiftLabels[task.shiftType]} | {task.section} |{" "}
                  {priorityLabels[task.priority]} |{" "}
                  {task.active === false ? "Inactive" : "Active"}
                </span>
                <small>{task.area}</small>
                <div className="inline-actions">
                  <button
                    type="button"
                    className="ghost-button compact-button"
                    onClick={() => editTask(task)}
                  >
                    Edit
                  </button>
                  {task.active !== false && (
                    <button
                      type="button"
                      className="ghost-button compact-button"
                      onClick={() => deactivateTask(task)}
                    >
                      Deactivate task
                    </button>
                  )}
                </div>
              </article>
            ))}
        </div>

        <form className="editor-form" onSubmit={saveEditorTask}>
          <label>
            Title
            <input
              value={editorTask.title}
              onChange={(event) =>
                setEditorTask((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Description
            <textarea
              rows="2"
              value={editorTask.description}
              onChange={(event) =>
                setEditorTask((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Shift type
            <select
              value={editorTask.shiftType}
              onChange={(event) =>
                setEditorTask((current) => ({
                  ...current,
                  shiftType: event.target.value,
                }))
              }
            >
              {activeShifts.map((shift) => (
                <option key={shift.id} value={shift.id}>
                  {shift.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Section
            <input
              value={editorTask.section}
              onChange={(event) =>
                setEditorTask((current) => ({
                  ...current,
                  section: event.target.value,
                  timeBlock: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Area
            <select
              value={editorTask.area}
              onChange={(event) =>
                setEditorTask((current) => ({
                  ...current,
                  area: event.target.value,
                }))
              }
            >
              {areas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select
              value={editorTask.priority}
              onChange={(event) =>
                setEditorTask((current) => ({
                  ...current,
                  priority: event.target.value,
                }))
              }
            >
              <option value="normal">Normal</option>
              <option value="important">Important</option>
              <option value="critical">Critical</option>
            </select>
          </label>
          <label>
            Input type
            <select
              value={editorTask.inputType}
              onChange={(event) =>
                setEditorTask((current) => ({
                  ...current,
                  inputType: event.target.value,
                }))
              }
            >
              <option value="none">None</option>
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="yesno">Yes/no</option>
              <option value="comment">Comment</option>
            </select>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={editorTask.active}
              onChange={(event) =>
                setEditorTask((current) => ({
                  ...current,
                  active: event.target.checked,
                }))
              }
            />{" "}
            Active
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={editorTask.criticalConfirm}
              onChange={(event) =>
                setEditorTask((current) => ({
                  ...current,
                  criticalConfirm: event.target.checked,
                }))
              }
            />{" "}
            Critical confirmation
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={editorTask.requiresComment}
              onChange={(event) =>
                setEditorTask((current) => ({
                  ...current,
                  requiresComment: event.target.checked,
                }))
              }
            />{" "}
            Requires comment
          </label>
          <button type="submit" className="primary-button">
            {editorTask.id ? "Save changes" : "Add task"}
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => setEditorTask(blankTask)}
          >
            Cancel
          </button>
        </form>
      </section>
    </main>
  );
}

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, showDetails: false };
  }

  static getDerivedStateFromError(error) {
    return { error, showDetails: false };
  }

  componentDidCatch(error, info) {
    console.error("Mesh Shift Log view crashed:", error, info);
  }

  render() {
    const { error, showDetails } = this.state;
    if (!error) return this.props.children;
    return (
      <main className="page">
        <section className="empty-state">
          <p className="eyebrow">Recovery</p>
          <h1>Something went wrong while loading this view.</h1>
          <p className="muted">
            Your local data is still on this device. Return to the dashboard and
            try again.
          </p>
          <div className="backup-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => window.location.reload()}
            >
              Return to dashboard
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() =>
                this.setState((current) => ({
                  showDetails: !current.showDetails,
                }))
              }
            >
              {showDetails
                ? "Hide technical details"
                : "Show technical details"}
            </button>
          </div>
          {showDetails && (
            <pre className="backend-details">
              {error.stack || error.message || String(error)}
            </pre>
          )}
        </section>
      </main>
    );
  }
}

function App() {
  const [user, setUser] = useState(() => readStorage(SESSION_KEY, null));
  const [selectedShift, setSelectedShift] = useState(null);
  const [showManager, setShowManager] = useState(false);
  const [showGlobalAlert, setShowGlobalAlert] = useState(false);
  const [logs, setLogs] = useState(() =>
    normalizeLogs(readStorage(LOG_KEY, [])),
  );
  const [routines, setRoutines] = useState(() =>
    normalizeRoutines(readStorage(ROUTINE_KEY, defaultRoutines)),
  );
  const [staffUsers, setStaffUsers] = useState(() =>
    normalizeStaffUsers(readStorage(STAFF_KEY, staffCodes)),
  );
  const [handoverNotes, setHandoverNotes] = useState(() =>
    normalizeHandovers(readStorage(HANDOVER_KEY, {})),
  );
  const [finishRecords, setFinishRecords] = useState(() =>
    normalizeArray(readStorage(FINISH_KEY, [])),
  );
  const [alerts, setAlerts] = useState(() =>
    normalizeAlerts(readStorage(ALERT_KEY, [])),
  );
  const [responsibleAssignments, setResponsibleAssignments] = useState(() =>
    normalizeArray(readStorage(RESPONSIBLE_KEY, [])),
  );
  const [siteSettings, setSiteSettings] = useState(() =>
    normalizeSiteSettings(readStorage(SITE_SETTINGS_KEY, defaultSiteSettings)),
  );
  const [siteOverrides, setSiteOverrides] = useState(() =>
    normalizeRecords(readStorage(SITE_OVERRIDE_KEY, [])),
  );
  const [events, setEvents] = useState(() =>
    normalizeEvents(readStorage(EVENTS_KEY, [])),
  );
  const [cashSignoffs, setCashSignoffs] = useState(() =>
    normalizeRecords(readStorage(CASH_SIGNOFF_KEY, [])),
  );
  const [assets, setAssets] = useState(() =>
    normalizeAssets(readStorage(ASSET_REGISTRY_KEY, defaultAssets)),
  );
  const [assetChecks, setAssetChecks] = useState(() =>
    normalizeRecords(readStorage(ASSET_CHECK_KEY, [])),
  );
  const [eventTaskChecks, setEventTaskChecks] = useState(() =>
    normalizeRecords(readStorage(EVENT_TASK_CHECK_KEY, [])),
  );
  const [siteAccess, setSiteAccess] = useState({
    status: siteSettings.locationCheckEnabled ? "unknown" : "off",
    distance: null,
    message: "",
  });
  const [alertBackendStatus, setAlertBackendStatus] = useState({
    source: isSupabaseConfigured
      ? isBackendAuthRequired
        ? "auth_required"
        : "local_cache"
      : "local_fallback",
    message: isSupabaseConfigured
      ? isBackendAuthRequired
        ? "Backend requires email login. Staff-code mode is local-only while backend auth is required."
        : "Using local alert cache until first sync."
      : "Supabase not configured. Using localStorage fallback.",
    lastSuccessfulSyncAt: "",
    lastSyncAttemptAt: "",
    lastPollAttemptAt: "",
    lastPollStartedAt: "",
    lastPollCompletedAt: "",
    lastSuccessfulPollAt: "",
    lastManualRefreshAt: "",
    lastSuccessfulSupabaseReadAt: "",
    lastRefreshReason: "initial",
    lastSyncError: "",
    lastEmailNotificationAttemptAt: "",
    lastEmailNotificationResult: "",
    lastEmailNotificationError: "",
    backendRequestMode: isSupabaseConfigured
      ? isBackendAuthRequired
        ? "auth_required"
        : "pilot_anon"
      : "local_fallback",
    backendAuthUserId: "",
    backendProfileRole: user?.role || "",
    alertsUsingAuthenticatedToken: false,
    requireAuthForBackend: isBackendAuthRequired,
    anonBackendAccessLikely: isSupabaseConfigured && !isBackendAuthRequired,
    pollingEnabled: isSupabaseConfigured,
    pollingIntervalSeconds: ALERT_POLL_INTERVAL_SECONDS,
    alertSyncBuild: ALERT_SYNC_BUILD,
    supabaseAlertCount: 0,
    supabaseRowsFetched: 0,
    mergedAlertsCount: normalizeAlerts(readStorage(ALERT_KEY, [])).length,
    visibleAlertsCount: normalizeAlerts(readStorage(ALERT_KEY, [])).length,
    visibleOpenAlertsCount: normalizeAlerts(readStorage(ALERT_KEY, [])).filter(
      isOpenAlert,
    ).length,
    localCachedAlertCount: normalizeAlerts(readStorage(ALERT_KEY, [])).length,
    unsyncedLocalAlertCount: normalizeAlerts(readStorage(ALERT_KEY, [])).filter(
      (alert) => alert.syncStatus === "pending",
    ).length,
    pendingAuthAlertCount: normalizeAlerts(readStorage(ALERT_KEY, [])).filter(
      (alert) => alert.syncStatus === "pending_auth",
    ).length,
    localOnlyAlertCount: normalizeAlerts(readStorage(ALERT_KEY, [])).filter(
      (alert) => alert.syncStatus === "local_only",
    ).length,
  });
  const [shiftDataStatus, setShiftDataStatus] = useState({
    mode: "initial",
    message:
      "Checklist data uses local cache until Email login sync is available.",
    taskCompletionsSource: "local_cache",
    handoverNotesSource: "local_cache",
    lastPhase4Action: "",
    lastPhase4Result: "",
    lastPhase4Error: "",
    backendTableWriteAttempted: false,
    backendTableWriteSucceeded: false,
    lastShiftDataSyncAt: "",
    lastShiftSyncError: "",
    pendingTaskCompletionsCount: normalizeLogs(readStorage(LOG_KEY, [])).filter(
      (log) =>
        ["pending_backend", "pending_auth", "sync_error"].includes(
          log.syncStatus,
        ),
    ).length,
    pendingHandoverNotesCount: Object.values(
      normalizeHandovers(readStorage(HANDOVER_KEY, {})),
    ).filter((note) =>
      ["pending_backend", "pending_auth", "sync_error"].includes(
        note.syncStatus,
      ),
    ).length,
    pendingAuthTaskCompletionsCount: normalizeLogs(
      readStorage(LOG_KEY, []),
    ).filter((log) => log.syncStatus === "pending_auth").length,
    pendingBackendRetryTaskCompletionsCount: normalizeLogs(
      readStorage(LOG_KEY, []),
    ).filter((log) =>
      ["pending_backend", "sync_error"].includes(log.syncStatus),
    ).length,
    syncedTaskCompletionsCount: normalizeLogs(readStorage(LOG_KEY, [])).filter(
      (log) => log.syncStatus === "synced",
    ).length,
    pendingAuthHandoverNotesCount: Object.values(
      normalizeHandovers(readStorage(HANDOVER_KEY, {})),
    ).filter((note) => note.syncStatus === "pending_auth").length,
    pendingBackendRetryHandoverNotesCount: Object.values(
      normalizeHandovers(readStorage(HANDOVER_KEY, {})),
    ).filter((note) =>
      ["pending_backend", "sync_error"].includes(note.syncStatus),
    ).length,
    syncedHandoverNotesCount: Object.values(
      normalizeHandovers(readStorage(HANDOVER_KEY, {})),
    ).filter((note) => note.syncStatus === "synced").length,
    backendShiftSessionsLoaded: 0,
    backendActiveShiftSessions: 0,
    backendFinishedShiftSessions: 0,
    backendTaskRowsLoaded: 0,
    backendDoneTaskRows: 0,
    backendNotRelevantTaskRows: 0,
    backendOpenTaskRows: 0,
    mergedUniqueTaskCompletions: normalizeLogs(readStorage(LOG_KEY, [])).length,
    ignoredDuplicateTaskRows: 0,
    backendHandoverRowsLoaded: 0,
    lastBackendCountRefreshAt: "",
    lastBackendCountError: "",
    latestShiftSessionDate: "",
    latestShiftSessionShift: "",
    latestShiftSessionStatus: "",
    latestShiftSessionFinishedAt: "",
    latestShiftSessionBackendId: "",
    lastBackendRestoreAttemptAt: "",
    lastBackendRestoreResult: "",
    lastBackendRestoreError: "",
    backendRestoreRowsFetched: 0,
    backendRestoreRowsMerged: 0,
    backendRestoreDuplicatesIgnored: 0,
    localPendingRecordsMatchedInBackend: 0,
    localOnlyRecordsRemaining: 0,
    lastCleanupResult: "",
  });
  const [financialBackendStatus, setFinancialBackendStatus] = useState({
    mode: "initial",
    lastAction: "",
    lastResult: "",
    lastError: "",
    rowsLoaded: 0,
    rowsMerged: 0,
    duplicatesIgnored: 0,
    pendingLocalRecords: normalizeRecords(
      readStorage(CASH_SIGNOFF_KEY, []),
    ).filter((record) =>
      ["pending_backend", "pending_auth", "sync_error"].includes(
        record.syncStatus,
      ),
    ).length,
    pendingMatchedInBackend: 0,
    localOnlyRemaining: normalizeRecords(
      readStorage(CASH_SIGNOFF_KEY, []),
    ).filter((record) =>
      ["pending_auth", "local_only"].includes(record.syncStatus),
    ).length,
    lastCleanupResult: "",
  });
  const [assetBackendStatus, setAssetBackendStatus] = useState({
    mode: "initial",
    lastAction: "",
    lastResult: "",
    lastError: "",
    rowsLoaded: 0,
    rowsMerged: 0,
    duplicatesIgnored: 0,
    pendingLocalRecords: normalizeRecords(readStorage(ASSET_CHECK_KEY, [])).filter(
      (record) =>
        ["pending_backend", "pending_auth", "sync_error"].includes(
          record.syncStatus,
        ),
    ).length,
    pendingMatchedInBackend: 0,
    localOnlyRemaining: normalizeRecords(readStorage(ASSET_CHECK_KEY, [])).filter(
      (record) => ["pending_auth", "local_only"].includes(record.syncStatus),
    ).length,
    lastCleanupResult: "",
  });
  const [authStatus, setAuthStatus] = useState({
    configured: isSupabaseAuthConfigured,
    loginSource: user?.loginSource || "staff_code",
    authUserId: user?.authUserId || user?.backendUserId || "",
    profileRole: user?.role || "",
    organizationId: user?.organizationId || user?.organization_id || "",
    profileActive: user?.profileActive ?? user?.active ?? true,
    authSessionPresent: user?.loginSource === "supabase_auth",
    profileFetchStatus:
      user?.loginSource === "supabase_auth" ? "profile_loaded" : "not_loaded",
    profileFetchErrorCode: "",
    profileFetchErrorMessage: "",
    profileFetchError: "",
    lastProfileFetchAt: "",
  });
  const [pilotAccepted, setPilotAccepted] = useState(() =>
    readStorage(PILOT_NOTICE_KEY, false),
  );
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [waitingWorker, setWaitingWorker] = useState(null);

  useEffect(() => saveStorage(LOG_KEY, logs), [logs]);
  useEffect(() => saveStorage(ROUTINE_KEY, routines), [routines]);
  useEffect(() => saveStorage(STAFF_KEY, staffUsers), [staffUsers]);
  useEffect(() => saveStorage(HANDOVER_KEY, handoverNotes), [handoverNotes]);
  useEffect(() => saveStorage(FINISH_KEY, finishRecords), [finishRecords]);
  useEffect(() => saveStorage(ALERT_KEY, alerts), [alerts]);
  useEffect(
    () => saveStorage(RESPONSIBLE_KEY, responsibleAssignments),
    [responsibleAssignments],
  );
  useEffect(() => saveStorage(SITE_SETTINGS_KEY, siteSettings), [siteSettings]);
  useEffect(
    () => saveStorage(SITE_OVERRIDE_KEY, siteOverrides),
    [siteOverrides],
  );
  useEffect(() => saveStorage(EVENTS_KEY, events), [events]);
  useEffect(() => saveStorage(CASH_SIGNOFF_KEY, cashSignoffs), [cashSignoffs]);
  useEffect(() => saveStorage(ASSET_REGISTRY_KEY, assets), [assets]);
  useEffect(() => saveStorage(ASSET_CHECK_KEY, assetChecks), [assetChecks]);
  useEffect(
    () => saveStorage(EVENT_TASK_CHECK_KEY, eventTaskChecks),
    [eventTaskChecks],
  );

  const alertsRef = useRef(alerts);
  const logsRef = useRef(logs);
  const handoverNotesRef = useRef(handoverNotes);
  const cashSignoffsRef = useRef(cashSignoffs);
  const assetChecksRef = useRef(assetChecks);

  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  useEffect(() => {
    logsRef.current = logs;
  }, [logs]);

  useEffect(() => {
    handoverNotesRef.current = handoverNotes;
  }, [handoverNotes]);

  useEffect(() => {
    cashSignoffsRef.current = cashSignoffs;
  }, [cashSignoffs]);

  useEffect(() => {
    assetChecksRef.current = assetChecks;
  }, [assetChecks]);

  const activeOverride = isOverrideActive(siteOverrides);
  const siteAccessStatus = activeOverride ? "override" : siteAccess.status;

  function checkLocation() {
    return new Promise((resolve) => {
      if (!siteSettings.locationCheckEnabled) {
        const result = {
          status: "off",
          distance: null,
          message: "Location check off",
        };
        setSiteAccess(result);
        resolve(result);
        return;
      }
      if (
        !siteSettings.latitude ||
        !siteSettings.longitude ||
        !navigator.geolocation
      ) {
        const result = {
          status: "unknown",
          distance: null,
          message: "Location unavailable",
        };
        setSiteAccess(result);
        resolve(result);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const distance = distanceMeters(
            position.coords.latitude,
            position.coords.longitude,
            Number(siteSettings.latitude),
            Number(siteSettings.longitude),
          );
          const status =
            distance <= Number(siteSettings.radiusMeters || 150)
              ? "on_site"
              : "away";
          const result = {
            status,
            distance,
            message: status === "on_site" ? "On site" : "Away from site",
          };
          setSiteAccess(result);
          resolve(result);
        },
        () => {
          const result = {
            status: "unknown",
            distance: null,
            message: "Location denied or unavailable",
          };
          setSiteAccess(result);
          resolve(result);
        },
        { enableHighAccuracy: true, timeout: 9000, maximumAge: 60000 },
      );
    });
  }

  async function requestWriteAccess() {
    if (!siteSettings.locationCheckEnabled || activeOverride) return true;
    const result = await checkLocation();
    if (result.status === "on_site") return true;
    window.alert(
      "On-site required\n\nThis action changes operational records. Please use it at Youngs or ask manager for override.",
    );
    return false;
  }

  function updateAuthStatusFromUser(nextUser, error = "", details = {}) {
    setAuthStatus({
      configured: isSupabaseAuthConfigured,
      loginSource: nextUser?.loginSource || "staff_code",
      authUserId: nextUser?.authUserId || nextUser?.backendUserId || "",
      profileRole: nextUser?.role || "",
      organizationId:
        nextUser?.organizationId || nextUser?.organization_id || "",
      profileActive: nextUser?.profileActive ?? nextUser?.active ?? true,
      authSessionPresent: Boolean(
        details.authSessionPresent ?? nextUser?.loginSource === "supabase_auth",
      ),
      profileFetchStatus:
        details.profileFetchStatus ||
        (nextUser?.loginSource === "supabase_auth"
          ? "profile_loaded"
          : "not_loaded"),
      profileFetchErrorCode: details.profileFetchErrorCode || "",
      profileFetchErrorMessage: details.profileFetchErrorMessage || "",
      profileFetchError: error,
      lastProfileFetchAt: new Date().toISOString(),
    });
  }

  function currentAuthUserId() {
    return user?.loginSource === "supabase_auth"
      ? user.authUserId || user.backendUserId || ""
      : "";
  }

  function canAttemptShiftBackend() {
    return user?.loginSource === "supabase_auth";
  }

  function phase4Log(action, detail = {}) {
    console.info(`Phase4A: ${action}`, {
      mode: detail.mode || shiftDataStatus.mode,
      ok: detail.ok,
      reason: detail.reason || detail.message || "",
      user: user?.name || "",
      loginSource: user?.loginSource || "unknown",
    });
  }

  function beginPhase4Attempt(
    action,
    message = "Checklist backend write attempting.",
  ) {
    phase4Log(action, { mode: "attempting" });
    updateShiftDataStatus({
      mode: "authenticated",
      message,
      lastPhase4Action: action,
      lastPhase4Result: "attempting",
      lastPhase4Error: "",
      lastShiftSyncError: "",
      backendTableWriteAttempted: true,
      backendTableWriteSucceeded: false,
    });
  }

  function updateShiftDataStatus(
    patch,
    nextLogs = logs,
    nextHandovers = handoverNotes,
  ) {
    const normalizedNextLogs = normalizeLogs(nextLogs);
    const normalizedNextHandovers = Object.values(
      normalizeHandovers(nextHandovers),
    );
    setShiftDataStatus((current) => ({
      ...current,
      ...patch,
      pendingTaskCompletionsCount: normalizedNextLogs.filter((log) =>
        ["pending_backend", "pending_auth", "sync_error"].includes(
          log.syncStatus,
        ),
      ).length,
      pendingHandoverNotesCount: normalizedNextHandovers.filter((note) =>
        ["pending_backend", "pending_auth", "sync_error"].includes(
          note.syncStatus,
        ),
      ).length,
      pendingAuthTaskCompletionsCount: normalizedNextLogs.filter(
        (log) => log.syncStatus === "pending_auth",
      ).length,
      pendingBackendRetryTaskCompletionsCount: normalizedNextLogs.filter(
        (log) => ["pending_backend", "sync_error"].includes(log.syncStatus),
      ).length,
      syncedTaskCompletionsCount: normalizedNextLogs.filter(
        (log) => log.syncStatus === "synced",
      ).length,
      pendingAuthHandoverNotesCount: normalizedNextHandovers.filter(
        (note) => note.syncStatus === "pending_auth",
      ).length,
      pendingBackendRetryHandoverNotesCount: normalizedNextHandovers.filter(
        (note) => ["pending_backend", "sync_error"].includes(note.syncStatus),
      ).length,
      syncedHandoverNotesCount: normalizedNextHandovers.filter(
        (note) => note.syncStatus === "synced",
      ).length,
    }));
  }

  function updateFinancialBackendStatus(
    patch,
    nextRecords = cashSignoffsRef.current,
  ) {
    const normalized = normalizeRecords(nextRecords);
    setFinancialBackendStatus((current) => ({
      ...current,
      ...patch,
      pendingLocalRecords: normalized.filter((record) =>
        ["pending_backend", "pending_auth", "sync_error"].includes(
          record.syncStatus,
        ),
      ).length,
      localOnlyRemaining: normalized.filter((record) =>
        ["pending_auth", "local_only"].includes(record.syncStatus),
      ).length,
    }));
  }

  async function syncFinancialSignoff(
    record,
    optimisticRecords = cashSignoffsRef.current,
  ) {
    if (user?.loginSource !== "supabase_auth") {
      updateFinancialBackendStatus(
        {
          mode: isBackendAuthRequired ? "auth_required" : "local_only",
          lastAction: "financial_signoff_sync",
          lastResult: "skipped: login_source_not_supabase_auth",
          lastError: "",
        },
        optimisticRecords,
      );
      return { ok: false, mode: "local_only" };
    }
    updateFinancialBackendStatus(
      {
        mode: "authenticated",
        lastAction: "financial_signoff_sync",
        lastResult: "attempting",
        lastError: "",
      },
      optimisticRecords,
    );
    let result;
    try {
      result = await upsertFinancialSignoff({
        ...record,
        signedByAuthUserId: user.authUserId || user.backendUserId || "",
      });
    } catch (error) {
      console.error("Phase 5A financial signoff sync failed:", error);
      result = {
        ok: false,
        mode: "sync_error",
        message: error.message || "Financial signoff sync failed.",
      };
    }
    const latestRecords = normalizeRecords(cashSignoffsRef.current);
    const optimisticList = normalizeRecords(optimisticRecords);
    const baseRecords = latestRecords.some((item) => item.id === record.id)
      ? latestRecords
      : optimisticList;
    const nextRecords = baseRecords.map((item) => {
      if (item.id !== record.id) return item;
      if (result.ok)
        return {
          ...item,
          ...result.record,
          id: item.id,
          syncStatus: "synced",
          syncError: "",
        };
      return {
        ...item,
        syncStatus: "sync_error",
        syncError: result.message || "Financial signoff sync failed.",
      };
    });
    setCashSignoffs(nextRecords);
    saveStorage(CASH_SIGNOFF_KEY, nextRecords);
    updateFinancialBackendStatus(
      {
        mode: result.mode,
        lastAction: "financial_signoff_sync",
        lastResult: result.ok ? "success" : "failed",
        lastError: result.ok
          ? ""
          : result.message || "Financial signoff sync failed.",
      },
      nextRecords,
    );
    return result;
  }

  function updateAssetBackendStatus(
    patch,
    nextRecords = assetChecksRef.current,
  ) {
    const normalized = normalizeRecords(nextRecords);
    setAssetBackendStatus((current) => ({
      ...current,
      ...patch,
      pendingLocalRecords: normalized.filter((record) =>
        ["pending_backend", "pending_auth", "sync_error"].includes(
          record.syncStatus,
        ),
      ).length,
      localOnlyRemaining: normalized.filter((record) =>
        ["pending_auth", "local_only"].includes(record.syncStatus),
      ).length,
    }));
  }

  async function refreshAssetRegistryFromBackend() {
    if (user?.loginSource !== "supabase_auth") {
      updateAssetBackendStatus({
        mode: isBackendAuthRequired ? "auth_required" : "local_only",
        lastAction: "asset_registry_restore",
        lastResult: "skipped: login_source_not_supabase_auth",
        lastError: "",
      });
      return {
        ok: false,
        message: "Could not refresh asset registry. Email login required.",
      };
    }

    let result;

    try {
      result = await fetchAssetRegistry();
    } catch (error) {
      console.error("Phase 5B asset registry restore failed:", error);
      result = {
        ok: false,
        mode: "sync_error",
        message: error.message || "Could not refresh asset registry.",
        records: [],
      };
    }

    if (!result.ok) {
      updateAssetBackendStatus({
        mode: result.mode,
        lastAction: "asset_registry_restore",
        lastResult: "failed",
        lastError: result.message || "Could not refresh asset registry.",
      });
      return {
        ok: false,
        message: "Could not refresh asset registry. Showing local cache.",
      };
    }

    const merged = mergeAssetRegistry(assetsRef.current, result.records);

    setAssets(merged.records);
    saveStorage(ASSET_REGISTRY_KEY, merged.records);

    updateAssetBackendStatus({
      mode: "authenticated",
      lastAction: "asset_registry_restore",
      lastResult: result.records.length
        ? "success"
        : "success: no_assets_in_backend",
      lastError: "",
      registryRowsLoaded: result.records.length,
      registryRowsMerged: merged.records.length,
      registryDuplicatesIgnored: merged.duplicatesIgnored,
    });

    return {
      ok: true,
      message: result.records.length
        ? "Asset registry refreshed from Supabase."
        : "No backend assets found yet.",
    };
  }

  async function refreshAssetChecksFromBackend(date = todayKey()) {
    if (user?.loginSource !== "supabase_auth") {
      updateAssetBackendStatus({
        mode: isBackendAuthRequired ? "auth_required" : "local_only",
        lastAction: "asset_check_restore",
        lastResult: "skipped: login_source_not_supabase_auth",
        lastError: "",
      });
      return {
        ok: false,
        message: "Could not refresh asset checks. Showing local cache.",
      };
    }

    let result;

    try {
      result = await fetchAssetChecksForDate(date);
    } catch (error) {
      console.error("Phase 5B asset check restore failed:", error);
      result = {
        ok: false,
        mode: "sync_error",
        message: error.message || "Could not refresh asset checks.",
        records: [],
      };
    }

    if (!result.ok) {
      updateAssetBackendStatus({
        mode: result.mode,
        lastAction: "asset_check_restore",
        lastResult: "failed",
        lastError: result.message || "Could not refresh asset checks.",
      });
      return {
        ok: false,
        message: "Could not refresh asset checks. Showing local cache.",
      };
    }

    const merged = mergeAssetChecks(assetChecksRef.current, result.records);

    setAssetChecks(merged.records);
    saveStorage(ASSET_CHECK_KEY, merged.records);

    updateAssetBackendStatus(
      {
        mode: "authenticated",
        lastAction: "asset_check_restore",
        lastResult: result.records.length
          ? "success"
          : "success: no_asset_checks_for_date",
        lastError: "",
        rowsLoaded: result.records.length,
        rowsMerged: merged.records.filter((record) => record.date === date)
          .length,
        duplicatesIgnored: merged.duplicatesIgnored,
      },
      merged.records,
    );

    return {
      ok: true,
      message: result.records.length
        ? "Asset checks refreshed from Supabase."
        : "No asset checks found for this date.",
    };
  }

  async function refreshFinancialSignoffsFromBackend(date = todayKey()) {
    if (user?.loginSource !== "supabase_auth") {
      updateFinancialBackendStatus({
        mode: isBackendAuthRequired ? "auth_required" : "local_only",
        lastAction: "financial_signoff_restore",
        lastResult: "skipped: login_source_not_supabase_auth",
        lastError: "",
      });
      return {
        ok: false,
        message: "Could not refresh financial signoffs. Showing local cache.",
      };
    }
    let result;
    try {
      result = await fetchFinancialSignoffsForDate(date);
    } catch (error) {
      console.error("Phase 5A financial signoff restore failed:", error);
      result = {
        ok: false,
        mode: "sync_error",
        message: error.message || "Could not refresh financial signoffs.",
        records: [],
      };
    }
    if (!result.ok) {
      updateFinancialBackendStatus({
        mode: result.mode,
        lastAction: "financial_signoff_restore",
        lastResult: "failed",
        lastError: result.message || "Could not refresh financial signoffs.",
      });
      return {
        ok: false,
        message: "Could not refresh financial signoffs. Showing local cache.",
      };
    }
    const merged = mergeFinancialSignoffs(
      cashSignoffsRef.current,
      result.records,
    );
    setCashSignoffs(merged.records);
    saveStorage(CASH_SIGNOFF_KEY, merged.records);
    updateFinancialBackendStatus(
      {
        mode: "authenticated",
        lastAction: "financial_signoff_restore",
        lastResult: result.records.length
          ? "success"
          : "success: no_financial_signoffs_for_date",
        lastError: "",
        rowsLoaded: result.records.length,
        rowsMerged: merged.records.filter((record) => record.date === date)
          .length,
        duplicatesIgnored: merged.duplicatesIgnored,
      },
      merged.records,
    );
    return {
      ok: true,
      message: result.records.length
        ? "Financial signoffs refreshed from Supabase."
        : "No financial signoffs found for this date.",
    };
  }

  async function reviewFinancialSignoffFromBackend(record) {
    const recordId = record?.backendId || "";
    if (user?.loginSource !== "supabase_auth" || !recordId) {
      updateFinancialBackendStatus({
        mode:
          user?.loginSource === "supabase_auth"
            ? "authenticated"
            : "auth_required",
        lastAction: "financial_signoff_review",
        lastResult: "skipped: missing_backend_record",
        lastError:
          "Refresh or sync this financial signoff before marking it reviewed.",
      });
      return {
        ok: false,
        message:
          "Refresh or sync this financial signoff before marking it reviewed.",
      };
    }
    updateFinancialBackendStatus({
      mode: "authenticated",
      lastAction: "financial_signoff_review",
      lastResult: "attempting",
      lastError: "",
    });
    let result;
    try {
      result = await reviewFinancialSignoff(recordId, {
        reviewedBy: user.name,
      });
    } catch (error) {
      console.error("Phase 5A financial signoff review failed:", error);
      result = {
        ok: false,
        mode: "sync_error",
        message: error.message || "Financial signoff review failed.",
      };
    }
    const nextRecords = normalizeRecords(cashSignoffsRef.current).map(
      (item) => {
        const matches = [item.backendId, item.localId, item.id]
          .filter(Boolean)
          .includes(record.backendId || record.localId || record.id);
        return matches && result.ok
          ? {
              ...item,
              ...result.record,
              id: item.id,
              syncStatus: "synced",
              syncError: "",
            }
          : item;
      },
    );
    if (result.ok) {
      setCashSignoffs(nextRecords);
      saveStorage(CASH_SIGNOFF_KEY, nextRecords);
    }
    updateFinancialBackendStatus(
      {
        mode: result.mode,
        lastAction: "financial_signoff_review",
        lastResult: result.ok ? "success" : "failed",
        lastError: result.ok
          ? ""
          : result.message || "Financial signoff review failed.",
      },
      result.ok ? nextRecords : cashSignoffsRef.current,
    );
    return result.ok
      ? { ...result, message: "Financial signoff marked reviewed." }
      : result;
  }

  function clearSyncedFinancialPendingRecords() {
    const confirmed = window.confirm(
      "This only clears local financial pending records that already exist in Supabase. Continue?",
    );
    if (!confirmed)
      return { ok: false, message: "Financial cleanup cancelled." };
    const cleaned = cleanupSyncedFinancialPendingRecords(
      cashSignoffsRef.current,
    );
    setCashSignoffs(cleaned.records);
    saveStorage(CASH_SIGNOFF_KEY, cleaned.records);
    const message = `Cleared ${cleaned.removed} financial pending records. ${cleaned.localOnlyRemaining} remain local-only.`;
    updateFinancialBackendStatus(
      {
        lastAction: "financial_pending_cleanup",
        lastResult: "success",
        pendingMatchedInBackend: cleaned.removed,
        localOnlyRemaining: cleaned.localOnlyRemaining,
        lastCleanupResult: message,
      },
      cleaned.records,
    );
    return { ok: true, message };
  }

  function shiftSessionLocalId(date, shiftType, currentUser = user) {
    return `shift_session:${date}:${shiftType}:${slug(currentUser?.authUserId || currentUser?.backendUserId || currentUser?.id || currentUser?.name || "user")}`;
  }

  async function ensureShiftSession(
    date,
    shiftType,
    { status = "active", finishedAt = "" } = {},
  ) {
    const action =
      status === "finished" ? "finish_shift_sync" : "shift_session_ensure";
    phase4Log(
      status === "finished"
        ? "finish shift sync called"
        : "ensure shift session called",
      { mode: shiftDataStatus.mode },
    );
    if (!date || !shiftType || !user?.id || shiftType === "guides") {
      updateShiftDataStatus({
        lastPhase4Action: action,
        lastPhase4Result: "skipped: missing_shift_context",
        lastPhase4Error: "Missing shift date, shift key or user.",
        backendTableWriteAttempted: false,
        backendTableWriteSucceeded: false,
      });
      return {
        ok: false,
        mode: "local_only",
        message: "Checklist data saved locally.",
      };
    }
    if (!canAttemptShiftBackend()) {
      phase4Log("ensure shift session skipped", {
        mode: isBackendAuthRequired ? "auth_required" : "local_only",
        reason: "staff-code/local-only login",
      });
      updateShiftDataStatus({
        mode: isBackendAuthRequired ? "auth_required" : "local_only",
        message:
          "Checklist data saved locally. Email login required for backend sync.",
        lastPhase4Action: action,
        lastPhase4Result: "skipped: login_source_not_supabase_auth",
        lastPhase4Error: "No Supabase Email session for shift backend sync.",
        backendTableWriteAttempted: false,
        backendTableWriteSucceeded: false,
        lastShiftSyncError: "",
      });
      return {
        ok: false,
        mode: isBackendAuthRequired ? "auth_required" : "local_only",
        message: "Checklist data saved locally.",
      };
    }
    beginPhase4Attempt(
      action,
      status === "finished"
        ? "Finishing shift in checklist backend."
        : "Ensuring shift session in checklist backend.",
    );
    try {
      const startedAt = new Date().toISOString();
      const result = await createOrUpdateShiftSession({
        localId: shiftSessionLocalId(date, shiftType),
        date,
        shiftType,
        shiftLabel: shiftLabels[shiftType] || shiftType,
        startedAt,
        finishedAt,
        status,
        userProfileId: user?.backendUserId || user?.authUserId || "",
        displayName: user?.name || "",
        role: user?.role || "",
        loginSource: user?.loginSource || "staff_code",
      });
      phase4Log("ensure shift session result", {
        ok: result.ok,
        mode: result.mode,
        message: result.message,
      });
      if (!result.ok)
        console.error(
          "Phase 4A shift session sync failed:",
          result.message || result.error,
        );
      updateShiftDataStatus({
        mode: result.mode,
        message: result.ok
          ? "Checklist data synced."
          : result.message || "Checklist data saved locally.",
        lastPhase4Action: action,
        lastPhase4Result: result.ok ? "success" : "failed",
        lastPhase4Error: result.ok
          ? ""
          : result.message || "Shift session sync failed.",
        backendTableWriteAttempted: true,
        backendTableWriteSucceeded: Boolean(result.ok),
        lastShiftDataSyncAt: result.ok
          ? new Date().toISOString()
          : shiftDataStatus.lastShiftDataSyncAt,
        lastShiftSyncError: result.ok ? "" : result.message || "",
      });
      return result;
    } catch (error) {
      console.error("Phase 4A shift session sync failed:", error);
      updateShiftDataStatus({
        mode: "sync_error",
        message: "Checklist data saved locally.",
        lastPhase4Action: action,
        lastPhase4Result: "failed",
        lastPhase4Error: error.message || "Shift session sync failed.",
        backendTableWriteAttempted: true,
        backendTableWriteSucceeded: false,
        lastShiftSyncError: error.message || "Shift session sync failed.",
      });
      return {
        ok: false,
        mode: "sync_error",
        message: error.message || "Shift session sync failed.",
        error,
      };
    }
  }

  async function syncChecklistLog(
    log,
    { shiftSessionBackendId = "", updateLocal = true } = {},
  ) {
    phase4Log("task sync called", { mode: shiftDataStatus.mode });
    if (!log?.date || !log?.taskId) {
      const result = {
        ok: false,
        mode: "local_only",
        message: "Missing shift date or task id.",
      };
      updateShiftDataStatus({
        mode: result.mode,
        message: result.message,
        taskCompletionsSource: "local_cache",
        lastPhase4Action: "task_completion_sync",
        lastPhase4Result: !log?.date
          ? "skipped: missing_shift_date"
          : "skipped: missing_task_id",
        lastPhase4Error: result.message,
        backendTableWriteAttempted: false,
        backendTableWriteSucceeded: false,
      });
      return result;
    }
    if (!canAttemptShiftBackend()) {
      const result = {
        ok: false,
        mode: isBackendAuthRequired ? "auth_required" : "local_only",
        message:
          "Checklist data saved locally. Email login required for backend sync.",
      };
      phase4Log("task sync skipped", {
        mode: result.mode,
        reason: "staff-code/local-only login",
      });
      updateShiftDataStatus({
        mode: result.mode,
        message: result.message,
        taskCompletionsSource: "local_cache",
        lastPhase4Action: "task_completion_sync",
        lastPhase4Result: "skipped: login_source_not_supabase_auth",
        lastPhase4Error: "No Supabase Email session for task completion sync.",
        backendTableWriteAttempted: false,
        backendTableWriteSucceeded: false,
      });
      return result;
    }
    beginPhase4Attempt(
      "task_completion_sync",
      "Syncing task completion to checklist backend.",
    );
    let result;
    try {
      result = await syncTaskCompletion(log, { shiftSessionBackendId });
    } catch (error) {
      console.error("Phase 4A task completion sync failed:", error);
      result = {
        ok: false,
        mode: "sync_error",
        message: error.message || "Checklist sync failed.",
        error,
      };
    }
    if (!result.ok && result.mode === "sync_error") {
      console.error(
        "Phase 4A task completion sync failed:",
        result.message || result.error,
      );
    }
    phase4Log("task sync result", {
      ok: result.ok,
      mode: result.mode,
      message: result.message,
    });
    if (!updateLocal) {
      updateShiftDataStatus({
        mode: result.mode,
        message: result.ok
          ? "Checklist data synced."
          : result.message || "Checklist data saved locally.",
        taskCompletionsSource: result.ok ? "backend_synced" : "local_cache",
        lastPhase4Action: "task_completion_sync",
        lastPhase4Result: result.ok ? "success" : "failed",
        lastPhase4Error: result.ok
          ? ""
          : result.message || "Checklist sync failed.",
        backendTableWriteAttempted: true,
        backendTableWriteSucceeded: Boolean(result.ok),
        lastShiftDataSyncAt: result.ok
          ? new Date().toISOString()
          : shiftDataStatus.lastShiftDataSyncAt,
        lastShiftSyncError: result.ok ? "" : result.message || "",
      });
      return result;
    }
    let matched = false;
    const nextLogs = normalizeLogs(logsRef.current).map((item) => {
      if ((item.localId || item.id) !== (log.localId || log.id)) return item;
      matched = true;
      if (result.ok)
        return {
          ...item,
          backendId: result.record.backendId,
          syncStatus: "synced",
          syncError: "",
          updatedAt: result.record.updatedAt,
        };
      return {
        ...item,
        syncStatus:
          result.mode === "auth_required" ? "pending_auth" : "sync_error",
        syncError: result.message || "Checklist sync failed.",
      };
    });
    if (!matched) {
      nextLogs.push(
        result.ok
          ? {
              ...log,
              backendId: result.record.backendId,
              syncStatus: "synced",
              syncError: "",
              updatedAt: result.record.updatedAt,
            }
          : {
              ...log,
              syncStatus:
                result.mode === "auth_required" ? "pending_auth" : "sync_error",
              syncError: result.message || "Checklist sync failed.",
            },
      );
    }
    setLogs(nextLogs);
    saveStorage(LOG_KEY, nextLogs);
    updateShiftDataStatus(
      {
        mode: result.mode,
        message: result.ok
          ? "Checklist data synced."
          : result.message ||
            "Checklist data saved locally. Email login required for backend sync.",
        taskCompletionsSource: result.ok ? "backend_synced" : "local_cache",
        lastPhase4Action: "task_completion_sync",
        lastPhase4Result: result.ok ? "success" : "failed",
        lastPhase4Error: result.ok
          ? ""
          : result.message || "Checklist sync failed.",
        backendTableWriteAttempted: true,
        backendTableWriteSucceeded: Boolean(result.ok),
        lastShiftDataSyncAt: result.ok
          ? new Date().toISOString()
          : shiftDataStatus.lastShiftDataSyncAt,
        lastShiftSyncError: result.ok ? "" : result.message || "",
      },
      nextLogs,
    );
    return result;
  }

  async function syncChecklistHandover(note) {
    phase4Log("handover sync called", { mode: shiftDataStatus.mode });
    if (!note?.date || !note?.shiftType) {
      const result = {
        ok: false,
        mode: "local_only",
        message: "Missing note date or shift key.",
      };
      updateShiftDataStatus({
        mode: result.mode,
        message: result.message,
        handoverNotesSource: "local_cache",
        lastPhase4Action: "handover_sync",
        lastPhase4Result: !note?.date
          ? "skipped: missing_shift_date"
          : "skipped: missing_shift_key",
        lastPhase4Error: result.message,
        backendTableWriteAttempted: false,
        backendTableWriteSucceeded: false,
      });
      return result;
    }
    if (
      ![note.nextShift, note.lowStock, note.maintenance, note.memberEvent].some(
        (value) => String(value || "").trim(),
      )
    ) {
      const result = {
        ok: false,
        mode: "local_only",
        message: "Empty handover note saved locally.",
      };
      updateShiftDataStatus({
        mode: result.mode,
        message: result.message,
        handoverNotesSource: "local_cache",
        lastPhase4Action: "handover_sync",
        lastPhase4Result: "skipped: empty_note",
        lastPhase4Error: "Empty handover note was not sent to backend.",
        backendTableWriteAttempted: false,
        backendTableWriteSucceeded: false,
      });
      return result;
    }
    if (!canAttemptShiftBackend()) {
      const result = {
        ok: false,
        mode: isBackendAuthRequired ? "auth_required" : "local_only",
        message:
          "Handover notes saved locally. Email login required for backend sync.",
      };
      phase4Log("handover sync skipped", {
        mode: result.mode,
        reason: "staff-code/local-only login",
      });
      updateShiftDataStatus({
        mode: result.mode,
        message: result.message,
        handoverNotesSource: "local_cache",
        lastPhase4Action: "handover_sync",
        lastPhase4Result: "skipped: login_source_not_supabase_auth",
        lastPhase4Error: "No Supabase Email session for handover sync.",
        backendTableWriteAttempted: false,
        backendTableWriteSucceeded: false,
      });
      return result;
    }
    beginPhase4Attempt(
      "handover_sync",
      "Syncing handover note to checklist backend.",
    );
    let result;
    try {
      result = await syncHandoverNote(note, {
        shiftSessionBackendId: note.shiftSessionBackendId || "",
      });
    } catch (error) {
      console.error("Phase 4A handover sync failed:", error);
      result = {
        ok: false,
        mode: "sync_error",
        message: error.message || "Handover sync failed.",
        error,
      };
    }
    if (!result.ok && result.mode === "sync_error") {
      console.error(
        "Phase 4A handover sync failed:",
        result.message || result.error,
      );
    }
    phase4Log("handover sync result", {
      ok: result.ok,
      mode: result.mode,
      message: result.message,
    });
    const currentNotes = normalizeHandovers(
      readStorage(HANDOVER_KEY, handoverNotes),
    );
    const key =
      Object.keys(currentNotes).find(
        (itemKey) =>
          handoverIdentity(currentNotes[itemKey]) === handoverIdentity(note),
      ) || handoverIdentity(note);
    const nextNotes = {
      ...currentNotes,
      [key]: result.ok
        ? {
            ...currentNotes[key],
            ...note,
            backendId: result.record.backendId,
            syncStatus: "synced",
            syncError: "",
            updatedAt: result.record.updatedAt,
          }
        : {
            ...currentNotes[key],
            ...note,
            syncStatus:
              result.mode === "auth_required" ? "pending_auth" : "sync_error",
            syncError: result.message || "Handover sync failed.",
          },
    };
    setHandoverNotes(nextNotes);
    saveStorage(HANDOVER_KEY, nextNotes);
    updateShiftDataStatus(
      {
        mode: result.mode,
        message: result.ok
          ? "Handover notes synced."
          : result.message || "Handover notes saved locally.",
        handoverNotesSource: result.ok ? "backend_synced" : "local_cache",
        lastPhase4Action: "handover_sync",
        lastPhase4Result: result.ok ? "success" : "failed",
        lastPhase4Error: result.ok
          ? ""
          : result.message || "Handover sync failed.",
        backendTableWriteAttempted: true,
        backendTableWriteSucceeded: Boolean(result.ok),
        lastShiftDataSyncAt: result.ok
          ? new Date().toISOString()
          : shiftDataStatus.lastShiftDataSyncAt,
        lastShiftSyncError: result.ok ? "" : result.message || "",
      },
      logs,
      nextNotes,
    );
    return result;
  }

  async function fetchShiftDataForDate(date = todayKey()) {
    if (!date || !canAttemptShiftBackend()) {
      updateShiftDataStatus({
        mode: isBackendAuthRequired ? "auth_required" : "local_only",
        message: "Showing local cache.",
        taskCompletionsSource: "local_cache",
        handoverNotesSource: "local_cache",
        lastPhase4Action: "fetch_shift_data",
        lastPhase4Result: "skipped",
        lastPhase4Error: !date
          ? "Missing date."
          : "No Supabase Email session for shift data fetch.",
        backendTableWriteAttempted: false,
        backendTableWriteSucceeded: false,
      });
      return {
        ok: false,
        mode: isBackendAuthRequired ? "auth_required" : "local_only",
      };
    }
    let mode;
    try {
      mode = await getBackendShiftMode();
    } catch (error) {
      console.error("Phase 4A shift data fetch failed:", error);
      updateShiftDataStatus({
        mode: "sync_error",
        message: "Showing local cache.",
        lastShiftSyncError: error.message || "Checklist data fetch failed.",
      });
      return { ok: false, mode: "sync_error", error };
    }
    if (!mode.isAuthenticated) {
      updateShiftDataStatus({
        mode: mode.mode,
        message:
          mode.message ||
          "Checklist data saved locally. Email login required for backend sync.",
        taskCompletionsSource: "local_cache",
        handoverNotesSource: "local_cache",
      });
      return { ok: false, mode: mode.mode };
    }
    let shiftSessionResult;
    let taskResult;
    let handoverResult;
    try {
      [shiftSessionResult, taskResult, handoverResult] = await Promise.all([
        fetchShiftSessionsForDate(date),
        fetchTaskCompletionsForDate(date),
        fetchHandoverNotesForDate(date),
      ]);
    } catch (error) {
      console.error("Phase 4A shift data fetch failed:", error);
      updateShiftDataStatus({
        mode: "sync_error",
        message: "Showing local cache.",
        lastBackendCountError: error.message || "Checklist data fetch failed.",
        lastShiftSyncError: error.message || "Checklist data fetch failed.",
      });
      return { ok: false, mode: "sync_error", error };
    }
    const taskMerge = taskResult.ok
      ? mergeTaskLogsWithStats(logsRef.current, taskResult.records)
      : { records: logsRef.current, ignoredDuplicates: 0 };
    const mergedLogs = taskMerge.records;
    const mergedHandovers = handoverResult.ok
      ? mergeHandoverNotes(handoverNotesRef.current, handoverResult.records)
      : handoverNotesRef.current;
    const shiftSessions = shiftSessionResult.records || [];
    const backendTaskRecords = taskResult.records || [];
    const mergedUniqueDateLogs = uniqueTaskLogsForDashboard(
      mergedLogs.filter((log) => log.date === date),
    );
    const duplicateDateRecords = Math.max(
      0,
      mergedLogs.filter((log) => log.date === date).length -
        mergedUniqueDateLogs.length,
    );
    const latestShiftSession = shiftSessions[0] || null;
    const fetchedAt = new Date().toISOString();
    const fetchOk = shiftSessionResult.ok && taskResult.ok && handoverResult.ok;
    const fetchMessage = fetchOk
      ? `Fetched ${backendTaskRecords.length} task rows, ${handoverResult.records?.length || 0} handover notes, ${shiftSessions.length} shift sessions from Supabase.`
      : "Could not fetch checklist backend data. Showing local cache.";
    setLogs(mergedLogs);
    setHandoverNotes(mergedHandovers);
    saveStorage(LOG_KEY, mergedLogs);
    saveStorage(HANDOVER_KEY, mergedHandovers);
    updateShiftDataStatus(
      {
        mode: "authenticated",
        message: fetchOk
          ? fetchMessage
          : "Could not fetch checklist backend data. Showing local cache.",
        taskCompletionsSource: taskResult.ok ? "backend_synced" : "local_cache",
        handoverNotesSource: handoverResult.ok
          ? "backend_synced"
          : "local_cache",
        lastShiftDataSyncAt: fetchOk
          ? fetchedAt
          : shiftDataStatus.lastShiftDataSyncAt,
        lastShiftSyncError: fetchOk
          ? ""
          : shiftSessionResult.message ||
            taskResult.message ||
            handoverResult.message ||
            "",
        backendShiftSessionsLoaded: shiftSessions.length,
        backendActiveShiftSessions: shiftSessions.filter(
          (session) => session.status === "active",
        ).length,
        backendFinishedShiftSessions: shiftSessions.filter(
          (session) => session.status === "finished",
        ).length,
        backendTaskRowsLoaded: taskResult.records?.length || 0,
        backendDoneTaskRows: backendTaskRecords.filter(
          (record) => record.status === "done",
        ).length,
        backendNotRelevantTaskRows: backendTaskRecords.filter(
          (record) => record.status === "not_relevant",
        ).length,
        backendOpenTaskRows: backendTaskRecords.filter(
          (record) => record.status === "open",
        ).length,
        mergedUniqueTaskCompletions: mergedUniqueDateLogs.length,
        ignoredDuplicateTaskRows: Math.max(
          taskMerge.ignoredDuplicates,
          duplicateDateRecords,
        ),
        backendHandoverRowsLoaded: handoverResult.records?.length || 0,
        lastBackendCountRefreshAt: fetchedAt,
        lastBackendCountError: fetchOk
          ? ""
          : shiftSessionResult.message ||
            taskResult.message ||
            handoverResult.message ||
            "",
        latestShiftSessionDate: latestShiftSession?.date || "",
        latestShiftSessionShift: latestShiftSession?.shiftType || "",
        latestShiftSessionStatus: latestShiftSession?.status || "",
        latestShiftSessionFinishedAt: latestShiftSession?.finishedAt || "",
        latestShiftSessionBackendId: latestShiftSession?.backendId || "",
      },
      mergedLogs,
      mergedHandovers,
    );
    return {
      ok: fetchOk,
      message: fetchMessage,
      taskRows: backendTaskRecords.length,
      handoverRows: handoverResult.records?.length || 0,
      shiftSessionRows: shiftSessions.length,
      ignoredDuplicateTaskRows: taskMerge.ignoredDuplicates,
    };
  }

  async function restoreShiftFromBackend(date = todayKey(), shiftType = "") {
    if (!date || !shiftType) {
      updateShiftDataStatus({
        lastBackendRestoreAttemptAt: new Date().toISOString(),
        lastBackendRestoreResult: "skipped: missing_shift_context",
        lastPhase4Error: "Missing date or shift for backend restore.",
      });
      return {
        ok: false,
        message:
          "Could not refresh checklist backend data. Showing local cache.",
      };
    }
    if (!canAttemptShiftBackend()) {
      updateShiftDataStatus({
        mode: isBackendAuthRequired ? "auth_required" : "local_only",
        message:
          "Checklist data saved locally. Email login required for backend restore.",
        lastBackendRestoreAttemptAt: new Date().toISOString(),
        lastBackendRestoreResult: "skipped: login_source_not_supabase_auth",
      });
      return {
        ok: false,
        message:
          "Could not refresh checklist backend data. Showing local cache.",
      };
    }

    const attemptedAt = new Date().toISOString();
    updateShiftDataStatus({
      mode: "authenticated",
      message: "Restoring checklist from Supabase.",
      lastBackendRestoreAttemptAt: attemptedAt,
      lastBackendRestoreResult: "attempting",
      lastBackendRestoreError: "",
    });

    try {
      const [taskResult, handoverResult] = await Promise.all([
        fetchTaskCompletionsForDate(date, shiftType),
        fetchHandoverNotesForDate(date, shiftType),
      ]);
      if (!taskResult.ok || !handoverResult.ok) {
        throw new Error(
          taskResult.message ||
            handoverResult.message ||
            "Checklist backend restore failed.",
        );
      }

      const taskMerge = mergeTaskLogsWithStats(
        logsRef.current,
        taskResult.records,
      );
      const mergedLogs = taskMerge.records;
      const mergedHandovers = mergeHandoverNotes(
        handoverNotesRef.current,
        handoverResult.records,
      );
      const restoredTaskIds = new Set(
        (taskResult.records || []).map((record) =>
          dashboardTaskIdentity(record),
        ),
      );
      const restoredHandoverKeys = new Set(
        (handoverResult.records || []).map((record) =>
          handoverLogicalIdentity(record),
        ),
      );
      const rowsFetched =
        (taskResult.records?.length || 0) +
        (handoverResult.records?.length || 0);

      setLogs(mergedLogs);
      setHandoverNotes(mergedHandovers);
      saveStorage(LOG_KEY, mergedLogs);
      saveStorage(HANDOVER_KEY, mergedHandovers);
      updateShiftDataStatus(
        {
          mode: "authenticated",
          message: rowsFetched
            ? "Checklist restored from Supabase. Backend data merged with local cache."
            : "No backend task rows found for this shift.",
          taskCompletionsSource: "backend_synced",
          handoverNotesSource: "backend_synced",
          lastBackendRestoreAttemptAt: attemptedAt,
          lastBackendRestoreResult: rowsFetched
            ? "success"
            : "success: no_backend_rows_for_shift",
          backendRestoreRowsFetched: rowsFetched,
          backendRestoreRowsMerged:
            uniqueTaskLogsForDashboard(
              mergedLogs.filter(
                (log) => log.date === date && log.shiftType === shiftType,
              ),
            ).length +
            Object.values(mergedHandovers).filter(
              (note) => note.date === date && note.shiftType === shiftType,
            ).length,
          backendRestoreDuplicatesIgnored: taskMerge.ignoredDuplicates,
          localPendingRecordsMatchedInBackend:
            normalizeLogs(logsRef.current).filter(
              (log) =>
                ["pending_backend", "sync_error"].includes(log.syncStatus) &&
                restoredTaskIds.has(dashboardTaskIdentity(log)),
            ).length +
            Object.values(normalizeHandovers(handoverNotesRef.current)).filter(
              (note) =>
                ["pending_backend", "sync_error"].includes(note.syncStatus) &&
                restoredHandoverKeys.has(handoverLogicalIdentity(note)),
            ).length,
          localOnlyRecordsRemaining:
            normalizeLogs(mergedLogs).filter((log) =>
              ["pending_auth", "local_only"].includes(log.syncStatus),
            ).length +
            Object.values(normalizeHandovers(mergedHandovers)).filter((note) =>
              ["pending_auth", "local_only"].includes(note.syncStatus),
            ).length,
          lastShiftDataSyncAt: new Date().toISOString(),
          lastShiftSyncError: "",
        },
        mergedLogs,
        mergedHandovers,
      );
      return { ok: true, message: "Checklist refreshed from Supabase." };
    } catch (error) {
      console.error("Phase 4A checklist restore failed:", error);
      updateShiftDataStatus({
        mode: "sync_error",
        message:
          "Could not refresh checklist backend data. Showing local cache.",
        lastBackendRestoreAttemptAt: attemptedAt,
        lastBackendRestoreResult: "failed",
        lastBackendRestoreError:
          error.message || "Checklist backend restore failed.",
        lastShiftSyncError:
          error.message || "Checklist backend restore failed.",
      });
      return {
        ok: false,
        message:
          "Could not refresh checklist backend data. Showing local cache.",
        error,
      };
    }
  }

  function clearSyncedLocalChecklistPendingRecords() {
    const confirmed = window.confirm(
      "This only clears local pending records that already exist in Supabase. Continue?",
    );
    if (!confirmed) return { ok: false, message: "Cleanup cancelled." };

    const normalizedLogs = normalizeLogs(logsRef.current);
    const syncedTaskKeys = new Set(
      normalizedLogs
        .filter(
          (log) =>
            log.syncStatus === "synced" && (log.backendId || log.localId),
        )
        .map((log) => dashboardTaskIdentity(log)),
    );
    let removedTaskCount = 0;
    const nextLogs = normalizedLogs.filter((log) => {
      const isPending = ["pending_backend", "sync_error"].includes(
        log.syncStatus,
      );
      const hasSyncedMatch = syncedTaskKeys.has(dashboardTaskIdentity(log));
      if (isPending && hasSyncedMatch) {
        removedTaskCount += 1;
        return false;
      }
      return true;
    });

    const normalizedNotes = normalizeHandovers(handoverNotesRef.current);
    const syncedHandoverKeys = new Set(
      Object.values(normalizedNotes)
        .filter(
          (note) =>
            note.syncStatus === "synced" && (note.backendId || note.localId),
        )
        .map((note) => handoverLogicalIdentity(note)),
    );
    let removedHandoverCount = 0;
    const nextHandovers = Object.fromEntries(
      Object.entries(normalizedNotes).filter(([, note]) => {
        const isPending = ["pending_backend", "sync_error"].includes(
          note.syncStatus,
        );
        const hasSyncedMatch = syncedHandoverKeys.has(
          handoverLogicalIdentity(note),
        );
        if (isPending && hasSyncedMatch) {
          removedHandoverCount += 1;
          return false;
        }
        return true;
      }),
    );

    setLogs(nextLogs);
    setHandoverNotes(nextHandovers);
    saveStorage(LOG_KEY, nextLogs);
    saveStorage(HANDOVER_KEY, nextHandovers);
    const remainingLocalOnly =
      nextLogs.filter((log) =>
        ["pending_auth", "local_only"].includes(log.syncStatus),
      ).length +
      Object.values(nextHandovers).filter((note) =>
        ["pending_auth", "local_only"].includes(note.syncStatus),
      ).length;
    const message = `Cleared ${removedTaskCount} task and ${removedHandoverCount} handover pending records. ${remainingLocalOnly} local-only records remain.`;
    updateShiftDataStatus(
      {
        message,
        lastCleanupResult: message,
        localPendingRecordsMatchedInBackend:
          removedTaskCount + removedHandoverCount,
        localOnlyRecordsRemaining: remainingLocalOnly,
      },
      nextLogs,
      nextHandovers,
    );
    return { ok: true, message };
  }

  function clearSyncedAssetPendingRecords() {
    const confirmed = window.confirm(
      "This only clears local asset pending records that already exist in Supabase. Continue?",
    );

    if (!confirmed)
      return { ok: false, message: "Asset cleanup cancelled." };

    const cleaned = cleanupSyncedAssetPendingRecords(assetChecksRef.current);

    setAssetChecks(cleaned.records);
    saveStorage(ASSET_CHECK_KEY, cleaned.records);

    const message = `Cleared ${cleaned.removed} asset pending records. ${cleaned.localOnlyRemaining} remain local-only.`;

    updateAssetBackendStatus(
      {
        lastAction: "asset_pending_cleanup",
        lastResult: "success",
        pendingMatchedInBackend: cleaned.removed,
        localOnlyRemaining: cleaned.localOnlyRemaining,
        lastCleanupResult: message,
        lastError: "",
      },
      cleaned.records,
    );

    return { ok: true, message };
  }

  async function testChecklistBackendWrite() {
    const date = todayKey();
    const shiftType = "opening";
    const authUserId =
      user?.authUserId || user?.backendUserId || user?.id || "unknown";
    if (!canAttemptShiftBackend()) {
      updateShiftDataStatus({
        mode: isBackendAuthRequired ? "auth_required" : "local_only",
        message:
          "Test skipped. Email login required for checklist backend writes.",
        lastPhase4Action: "debug_backend_write",
        lastPhase4Result: "skipped: login_source_not_supabase_auth",
        lastPhase4Error:
          "No Supabase Email session for checklist backend test.",
        backendTableWriteAttempted: false,
        backendTableWriteSucceeded: false,
      });
      return { ok: false, message: "Email login required." };
    }

    beginPhase4Attempt(
      "debug_backend_write",
      "Testing checklist backend write.",
    );
    try {
      const timestamp = new Date().toISOString();
      const sessionResult = await createOrUpdateShiftSession({
        localId: `shift_session:${date}:${shiftType}:${slug(authUserId)}:debug`,
        date,
        shiftType,
        shiftLabel: `${shiftLabels[shiftType] || shiftType} debug`,
        startedAt: timestamp,
        status: "active",
        userProfileId: user?.backendUserId || user?.authUserId || "",
        displayName: user?.name || "",
        role: user?.role || "",
        loginSource: user?.loginSource || "supabase_auth",
      });
      if (!sessionResult.ok)
        throw new Error(
          sessionResult.message || "Debug shift session write failed.",
        );

      const taskResult = await syncTaskCompletion(
        {
          id: `debug-${date}-phase4a-debug-test`,
          localId: `task_completion:${date}:${shiftType}:phase4a-debug-test:${slug(authUserId)}`,
          taskId: "phase4a-debug-test",
          taskTitle: "Phase 4A debug test",
          date,
          shiftType,
          section: "Diagnostics",
          timeBlock: "Diagnostics",
          status: "done",
          completedAt: timestamp,
          completedBy: user?.name || "",
          completedByAuthUserId: user?.authUserId || user?.backendUserId || "",
          completedByProfileId: user?.backendUserId || user?.authUserId || "",
          input: "manager diagnostics",
          comment: "Created by Test checklist backend write.",
          criticalConfirmed: false,
        },
        { shiftSessionBackendId: sessionResult.record?.backendId || "" },
      );
      if (!taskResult.ok)
        throw new Error(
          taskResult.message || "Debug task completion write failed.",
        );

      const handoverResult = await syncHandoverNote(
        {
          id: `debug-handover-${date}-${shiftType}`,
          localId: `handover:${date}:${shiftType}:${slug(authUserId)}:debug`,
          date,
          shiftType,
          completedBy: user?.name || "",
          createdBy: user?.name || "",
          createdByAuthUserId: user?.authUserId || user?.backendUserId || "",
          createdByProfileId: user?.backendUserId || user?.authUserId || "",
          nextShift: "Phase 4A debug handover write.",
          lowStock: "",
          maintenance: "",
          memberEvent: "",
        },
        { shiftSessionBackendId: sessionResult.record?.backendId || "" },
      );
      if (!handoverResult.ok)
        throw new Error(
          handoverResult.message || "Debug handover write failed.",
        );

      updateShiftDataStatus({
        mode: "authenticated",
        message: "Test checklist backend write succeeded.",
        taskCompletionsSource: "backend_synced",
        handoverNotesSource: "backend_synced",
        lastPhase4Action: "debug_backend_write",
        lastPhase4Result: "success",
        lastPhase4Error: "",
        backendTableWriteAttempted: true,
        backendTableWriteSucceeded: true,
        lastShiftDataSyncAt: new Date().toISOString(),
        lastShiftSyncError: "",
      });
      return { ok: true };
    } catch (error) {
      console.error("Phase 4A debug backend write failed:", error);
      updateShiftDataStatus({
        mode: "sync_error",
        message: "Test checklist backend write failed.",
        lastPhase4Action: "debug_backend_write",
        lastPhase4Result: "failed",
        lastPhase4Error: error.message || "Debug backend write failed.",
        backendTableWriteAttempted: true,
        backendTableWriteSucceeded: false,
        lastShiftSyncError: error.message || "Debug backend write failed.",
      });
      return { ok: false, error };
    }
  }

  async function applySupabaseSession(session) {
    if (!session?.user)
      return { ok: false, error: "No Supabase Auth session found." };
    const profileResult = await fetchCurrentUserProfile(session);
    if (!profileResult.ok) {
      if (profileResult.status === "profile_inactive") {
        await signOutSupabase();
      }
      const message =
        profileResult.message ||
        "Login succeeded, but profile could not be loaded.";
      updateAuthStatusFromUser(
        {
          authUserId: session.user.id,
          backendUserId: session.user.id,
          email: session.user.email,
          loginSource: "supabase_auth",
          profileActive: profileResult.status !== "profile_inactive",
          role: profileResult.profile?.role || "",
          organizationId: profileResult.profile?.organization_id || "",
        },
        message,
        {
          authSessionPresent: true,
          profileFetchStatus: profileResult.status,
          profileFetchErrorCode:
            profileResult.errorCode || profileResult.status,
          profileFetchErrorMessage:
            profileResult.errorMessage || profileResult.error?.message || "",
        },
      );
      return { ok: false, error: message, status: profileResult.status };
    }

    const authUser = appUserFromProfile(
      profileResult.profile,
      profileResult.user || session.user,
    );
    saveStorage(SESSION_KEY, authUser);
    setUser(authUser);
    updateAuthStatusFromUser(authUser, "", {
      authSessionPresent: true,
      profileFetchStatus: profileResult.status,
    });
    return { ok: true, user: authUser };
  }

  async function handleSupabaseLogin(email, password) {
    try {
      const session = await signInWithEmailPassword(email, password);
      return applySupabaseSession(session);
    } catch (error) {
      const message =
        error.message === "Failed to fetch"
          ? "Supabase Auth login failed. Check connection and Supabase configuration."
          : error.message;
      setAuthStatus((current) => ({
        ...current,
        configured: isSupabaseAuthConfigured,
        loginSource: "supabase_auth",
        authSessionPresent: false,
        profileFetchStatus: "auth_login_failed",
        profileFetchErrorCode: error.name || "auth_login_failed",
        profileFetchErrorMessage: error.message,
        profileFetchError: message,
        lastProfileFetchAt: new Date().toISOString(),
      }));
      return { ok: false, error: message };
    }
  }

  async function clearSupabaseAuthSession() {
    await signOutSupabase();
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
    setSelectedShift(null);
    setShowManager(false);
    setAuthStatus((current) => ({
      ...current,
      configured: isSupabaseAuthConfigured,
      loginSource: "staff_code",
      authUserId: "",
      profileRole: "",
      organizationId: "",
      profileActive: true,
      profileFetchError: "",
      lastProfileFetchAt: new Date().toISOString(),
    }));
  }

  function cacheAlerts(nextAlerts) {
    const normalized = normalizeAlerts(nextAlerts);
    alertsRef.current = normalized;
    setAlerts(normalized);
    saveStorage(ALERT_KEY, normalized);
    setAlertBackendStatus((current) => ({
      ...current,
      mergedAlertsCount: normalized.length,
      visibleAlertsCount: normalized.length,
      visibleOpenAlertsCount: normalized.filter(isOpenAlert).length,
      alertSyncBuild: ALERT_SYNC_BUILD,
      pollingEnabled: isSupabaseConfigured,
      pollingIntervalSeconds: ALERT_POLL_INTERVAL_SECONDS,
      backendProfileRole: user?.role || current.backendProfileRole || "",
      requireAuthForBackend: isBackendAuthRequired,
      anonBackendAccessLikely: isSupabaseConfigured && !isBackendAuthRequired,
      ...alertSyncCounts(normalized),
    }));
  }

  async function syncPendingAlerts(
    alertList = readStorage(ALERT_KEY, []),
    { commit = true } = {},
  ) {
    if (!isSupabaseConfigured) return normalizeAlerts(alertList);
    let workingAlerts = normalizeAlerts(alertList);
    const pendingAlerts = workingAlerts.filter(
      (alert) => alert.syncStatus === "pending",
    );
    for (const pendingAlert of pendingAlerts) {
      const attemptAt = new Date().toISOString();
      try {
        let row = null;
        if (pendingAlert.backendId) {
          row = await supabase.updateAlert({
            backendId: pendingAlert.backendId,
            localId: pendingAlert.localId,
            changes: alertToSupabase({
              ...pendingAlert,
              lastSyncAttemptAt: attemptAt,
            }),
          });
        } else {
          row = await supabase.updateAlert({
            localId: pendingAlert.localId || pendingAlert.id,
            changes: alertToSupabase({
              ...pendingAlert,
              lastSyncAttemptAt: attemptAt,
            }),
          });
          if (!row) {
            row = await supabase.insertAlert(
              alertToSupabase({
                ...pendingAlert,
                lastSyncAttemptAt: attemptAt,
              }),
            );
          }
        }
        const syncedAlert = row
          ? alertFromSupabase(row)
          : {
              ...pendingAlert,
              syncStatus: "synced",
              lastSyncError: "",
              lastSyncAttemptAt: attemptAt,
            };
        workingAlerts = workingAlerts.map((alert) =>
          alertIdentity(alert) === alertIdentity(pendingAlert)
            ? syncedAlert
            : alert,
        );
      } catch (error) {
        workingAlerts = workingAlerts.map((alert) =>
          alertIdentity(alert) === alertIdentity(pendingAlert)
            ? {
                ...alert,
                syncStatus: isBackendAuthError(error)
                  ? "pending_auth"
                  : "pending",
                lastSyncError: error.message,
                lastSyncAttemptAt: attemptAt,
              }
            : alert,
        );
      }
    }
    if (commit) cacheAlerts(workingAlerts);
    return workingAlerts;
  }

  async function refreshAlertsFromBackend(reason = "poll") {
    const attemptAt = new Date().toISOString();
    const currentAlerts = normalizeAlerts(
      alertsRef.current.length ? alertsRef.current : readStorage(ALERT_KEY, []),
    );
    const isManual = reason === "manual" || reason === "retry";
    if (!isSupabaseConfigured) {
      const localAlerts = normalizeAlerts(
        currentAlerts.length ? currentAlerts : readStorage(ALERT_KEY, []),
      );
      cacheAlerts(localAlerts);
      setAlertBackendStatus((current) => ({
        ...current,
        source: "local_fallback",
        message: isManual
          ? `Fetched 0 alerts from Supabase. Showing ${localAlerts.length} alerts.`
          : "Supabase not configured. Using localStorage fallback.",
        lastSyncAttemptAt: attemptAt,
        lastPollAttemptAt: attemptAt,
        lastPollStartedAt: attemptAt,
        lastPollCompletedAt: new Date().toISOString(),
        lastManualRefreshAt: isManual ? attemptAt : current.lastManualRefreshAt,
        lastRefreshReason: reason,
        lastSyncError: "",
        pollingEnabled: false,
        pollingIntervalSeconds: ALERT_POLL_INTERVAL_SECONDS,
        alertSyncBuild: ALERT_SYNC_BUILD,
        backendRequestMode: "local_fallback",
        backendAuthUserId: "",
        backendProfileRole: user?.role || "",
        alertsUsingAuthenticatedToken: false,
        requireAuthForBackend: isBackendAuthRequired,
        anonBackendAccessLikely: false,
        supabaseAlertCount: 0,
        supabaseRowsFetched: 0,
        mergedAlertsCount: localAlerts.length,
        visibleAlertsCount: localAlerts.length,
        visibleOpenAlertsCount: localAlerts.filter(isOpenAlert).length,
        ...alertSyncCounts(localAlerts),
      }));
      return { ok: true, localOnly: true };
    }
    try {
      const requestAuth = await supabase.getRequestAuthContext();
      if (requestAuth.mode === "auth_required") {
        const localAlerts = normalizeAlerts(
          currentAlerts.length ? currentAlerts : readStorage(ALERT_KEY, []),
        );
        cacheAlerts(localAlerts);
        setAlertBackendStatus((current) => ({
          ...current,
          source: "auth_required",
          message: isManual
            ? "Backend sync requires Email login. Showing local cache."
            : "Backend requires email login. Staff-code mode is local-only while backend auth is required.",
          lastSyncAttemptAt: attemptAt,
          lastPollAttemptAt: attemptAt,
          lastPollStartedAt: attemptAt,
          lastPollCompletedAt: new Date().toISOString(),
          lastManualRefreshAt: isManual
            ? attemptAt
            : current.lastManualRefreshAt,
          lastRefreshReason: reason,
          lastSyncError: "",
          pollingEnabled: false,
          pollingIntervalSeconds: ALERT_POLL_INTERVAL_SECONDS,
          alertSyncBuild: ALERT_SYNC_BUILD,
          backendRequestMode: requestAuth.mode,
          backendAuthUserId: "",
          backendProfileRole: user?.role || current.backendProfileRole || "",
          alertsUsingAuthenticatedToken: false,
          requireAuthForBackend: isBackendAuthRequired,
          anonBackendAccessLikely: false,
          mergedAlertsCount: localAlerts.length,
          visibleAlertsCount: localAlerts.length,
          visibleOpenAlertsCount: localAlerts.filter(isOpenAlert).length,
          ...alertSyncCounts(localAlerts),
        }));
        return { ok: true, localOnly: true, authRequired: true };
      }
      setAlertBackendStatus((current) => ({
        ...current,
        lastSyncAttemptAt: attemptAt,
        lastPollAttemptAt: attemptAt,
        lastPollStartedAt: attemptAt,
        lastManualRefreshAt: isManual ? attemptAt : current.lastManualRefreshAt,
        lastRefreshReason: reason,
        pollingEnabled: true,
        pollingIntervalSeconds: ALERT_POLL_INTERVAL_SECONDS,
        alertSyncBuild: ALERT_SYNC_BUILD,
        backendRequestMode: requestAuth.mode,
        backendAuthUserId: requestAuth.authUserId,
        backendProfileRole: user?.role || current.backendProfileRole || "",
        alertsUsingAuthenticatedToken: requestAuth.isAuthenticated,
        requireAuthForBackend: isBackendAuthRequired,
        anonBackendAccessLikely: requestAuth.mode === "pilot_anon",
      }));
      const afterPending = await syncPendingAlerts(currentAlerts, {
        commit: false,
      });
      const rows = await supabase.selectAlerts();
      const backendAlerts = normalizeAlerts(rows.map(alertFromSupabase));
      let mergedAlerts = mergeAlertCaches(
        mergeAlertCaches(currentAlerts, afterPending),
        backendAlerts,
      );
      setAlerts((previousAlerts) => {
        mergedAlerts = mergeAlertCaches(
          mergeAlertCaches(previousAlerts, afterPending),
          backendAlerts,
        );
        alertsRef.current = mergedAlerts;
        saveStorage(ALERT_KEY, mergedAlerts);
        return mergedAlerts;
      });
      setAlertBackendStatus((current) => ({
        ...current,
        source: "supabase",
        message: isManual
          ? `Fetched ${backendAlerts.length} alerts from Supabase. Showing ${mergedAlerts.length} alerts.`
          : "Alerts synced with Supabase.",
        lastSuccessfulSyncAt: new Date().toISOString(),
        lastSuccessfulPollAt: new Date().toISOString(),
        lastSuccessfulSupabaseReadAt: new Date().toISOString(),
        lastSyncAttemptAt: attemptAt,
        lastPollAttemptAt: attemptAt,
        lastPollCompletedAt: new Date().toISOString(),
        lastManualRefreshAt: isManual ? attemptAt : current.lastManualRefreshAt,
        lastRefreshReason: reason,
        lastSyncError: "",
        pollingEnabled: true,
        pollingIntervalSeconds: ALERT_POLL_INTERVAL_SECONDS,
        alertSyncBuild: ALERT_SYNC_BUILD,
        backendRequestMode: requestAuth.mode,
        backendAuthUserId: requestAuth.authUserId,
        backendProfileRole: user?.role || current.backendProfileRole || "",
        alertsUsingAuthenticatedToken: requestAuth.isAuthenticated,
        requireAuthForBackend: isBackendAuthRequired,
        anonBackendAccessLikely: requestAuth.mode === "pilot_anon",
        supabaseAlertCount: backendAlerts.length,
        supabaseRowsFetched: backendAlerts.length,
        mergedAlertsCount: mergedAlerts.length,
        visibleAlertsCount: mergedAlerts.length,
        visibleOpenAlertsCount: mergedAlerts.filter(isOpenAlert).length,
        ...alertSyncCounts(mergedAlerts),
      }));
      return { ok: true };
    } catch (error) {
      const localAlerts = normalizeAlerts(
        alertsRef.current.length
          ? alertsRef.current
          : readStorage(ALERT_KEY, []),
      );
      cacheAlerts(localAlerts);
      setAlertBackendStatus((current) => ({
        ...current,
        source: "sync_error",
        message: isManual
          ? "Supabase refresh failed. Showing local cache."
          : "Using local cache. Backend read failed.",
        lastSyncAttemptAt: attemptAt,
        lastPollAttemptAt: attemptAt,
        lastPollCompletedAt: new Date().toISOString(),
        lastManualRefreshAt: isManual ? attemptAt : current.lastManualRefreshAt,
        lastRefreshReason: reason,
        lastSyncError: error.message,
        pollingEnabled: true,
        pollingIntervalSeconds: ALERT_POLL_INTERVAL_SECONDS,
        alertSyncBuild: ALERT_SYNC_BUILD,
        backendProfileRole: user?.role || current.backendProfileRole || "",
        requireAuthForBackend: isBackendAuthRequired,
        anonBackendAccessLikely: current.backendRequestMode === "pilot_anon",
        mergedAlertsCount: localAlerts.length,
        visibleAlertsCount: localAlerts.length,
        visibleOpenAlertsCount: localAlerts.filter(isOpenAlert).length,
        ...alertSyncCounts(localAlerts),
      }));
      return { ok: false, error };
    }
  }

  function loadSupabaseAlerts({ feedback = false, reason } = {}) {
    return refreshAlertsFromBackend(reason || (feedback ? "manual" : "poll"));
  }

  async function attemptAlertEmailNotification(
    alert,
    { reason = "create" } = {},
  ) {
    if (!alertNeedsEmail(alert)) {
      return { ok: true, skipped: true };
    }
    if (alert.emailNotificationStatus === "sent" && reason !== "retry") {
      return { ok: true, skipped: true };
    }

    const attemptedAt = new Date().toISOString();
    const targetId = alert.id || alert.backendId || alert.localId;
    const requestAuth = isSupabaseConfigured
      ? await supabase.getRequestAuthContext()
      : { mode: "local_fallback" };
    if (requestAuth.mode === "auth_required") {
      await updateAlertRecord(targetId, {
        emailNotificationStatus: "failed",
        emailNotificationAttemptedAt: attemptedAt,
        emailNotificationError: "Email notification requires Email login.",
      });
      setAlertBackendStatus((current) => ({
        ...current,
        lastEmailNotificationAttemptAt: attemptedAt,
        lastEmailNotificationResult: "auth_required",
        lastEmailNotificationError: "Email notification requires Email login.",
        backendRequestMode: "auth_required",
        alertsUsingAuthenticatedToken: false,
      }));
      return {
        ok: false,
        authRequired: true,
        error: new Error("Email notification requires Email login."),
      };
    }
    setAlertBackendStatus((current) => ({
      ...current,
      lastEmailNotificationAttemptAt: attemptedAt,
      lastEmailNotificationResult: "pending",
      lastEmailNotificationError: "",
    }));
    await updateAlertRecord(targetId, {
      emailNotificationStatus: "pending",
      emailNotificationAttemptedAt: attemptedAt,
      emailNotificationError: "",
    });

    try {
      await supabase.sendAlertEmail({
        ...alert,
        appUrl: window.location.origin + window.location.pathname,
      });
      await updateAlertRecord(targetId, {
        emailNotificationStatus: "sent",
        emailNotificationAttemptedAt: attemptedAt,
        emailNotificationError: "",
      });
      setAlertBackendStatus((current) => ({
        ...current,
        lastEmailNotificationAttemptAt: attemptedAt,
        lastEmailNotificationResult: "sent",
        lastEmailNotificationError: "",
      }));
      return { ok: true };
    } catch (error) {
      await updateAlertRecord(targetId, {
        emailNotificationStatus: "failed",
        emailNotificationAttemptedAt: attemptedAt,
        emailNotificationError: error.message,
      });
      setAlertBackendStatus((current) => ({
        ...current,
        lastEmailNotificationAttemptAt: attemptedAt,
        lastEmailNotificationResult: "failed",
        lastEmailNotificationError: error.message,
      }));
      return { ok: false, error };
    }
  }

  async function saveAlertRecord(alertRecord) {
    const attemptAt = new Date().toISOString();
    const authUserId = currentAuthUserId();
    const requestAuth = isSupabaseConfigured
      ? await supabase.getRequestAuthContext()
      : { mode: "local_fallback", isAuthenticated: false, authUserId: "" };
    const authRequiredForWrite = requestAuth.mode === "auth_required";
    const localRecord = normalizeAlerts([
      {
        ...alertRecord,
        createdByAuthUserId: alertRecord.createdByAuthUserId || authUserId,
        lastUpdatedByAuthUserId:
          alertRecord.lastUpdatedByAuthUserId || authUserId,
        syncStatus: isSupabaseConfigured
          ? authRequiredForWrite
            ? "pending_auth"
            : "pending"
          : "synced",
        lastSyncAttemptAt: attemptAt,
        emailNotificationStatus:
          alertRecord.emailNotificationStatus ||
          (alertNeedsEmail(alertRecord) ? "pending" : "not_required"),
      },
    ])[0];
    const latestAlerts = normalizeAlerts(
      alertsRef.current.length ? alertsRef.current : alerts,
    );
    const localNext = [
      ...latestAlerts.filter((alert) => alert.id !== localRecord.id),
      localRecord,
    ];
    cacheAlerts(localNext);
    if (!isSupabaseConfigured) {
      setAlertBackendStatus((current) => ({
        ...current,
        source: "local_fallback",
        message: "Saved locally.",
        lastSyncAttemptAt: attemptAt,
        lastSyncError: "",
        backendRequestMode: "local_fallback",
        backendAuthUserId: "",
        backendProfileRole: user?.role || "",
        alertsUsingAuthenticatedToken: false,
        requireAuthForBackend: isBackendAuthRequired,
        anonBackendAccessLikely: false,
        ...alertSyncCounts(localNext),
      }));
      const emailResult = await attemptAlertEmailNotification(localRecord, {
        reason: "create",
      });
      return { ok: true, localOnly: true, alert: localRecord, emailResult };
    }
    if (authRequiredForWrite) {
      setAlertBackendStatus((current) => ({
        ...current,
        source: "auth_required",
        message: "Backend sync requires Email login. Saved locally.",
        lastSyncAttemptAt: attemptAt,
        lastSyncError: "",
        backendRequestMode: requestAuth.mode,
        backendAuthUserId: "",
        backendProfileRole: user?.role || current.backendProfileRole || "",
        alertsUsingAuthenticatedToken: false,
        requireAuthForBackend: isBackendAuthRequired,
        anonBackendAccessLikely: false,
        ...alertSyncCounts(localNext),
      }));
      const emailResult = await attemptAlertEmailNotification(localRecord, {
        reason: "create",
      });
      return {
        ok: true,
        localOnly: true,
        authRequired: true,
        alert: localRecord,
        emailResult,
      };
    }
    try {
      const row = await supabase.insertAlert(alertToSupabase(localRecord));
      const syncedAlert = row ? alertFromSupabase(row) : localRecord;
      const nextAlerts = [
        ...localNext.filter(
          (alert) =>
            alert.localId !== syncedAlert.localId &&
            alert.backendId !== syncedAlert.backendId,
        ),
        syncedAlert,
      ];
      cacheAlerts(nextAlerts);
      setAlertBackendStatus((current) => ({
        ...current,
        source: "supabase",
        message: "Alerts synced with Supabase.",
        lastSuccessfulSyncAt: new Date().toISOString(),
        lastSyncAttemptAt: attemptAt,
        lastSyncError: "",
        backendRequestMode: requestAuth.mode,
        backendAuthUserId: requestAuth.authUserId,
        backendProfileRole: user?.role || current.backendProfileRole || "",
        alertsUsingAuthenticatedToken: requestAuth.isAuthenticated,
        ...alertSyncCounts(nextAlerts),
      }));
      refreshAlertsFromBackend("after_create");
      const emailResult = await attemptAlertEmailNotification(syncedAlert, {
        reason: "create",
      });
      return { ok: true, alert: syncedAlert, emailResult };
    } catch (error) {
      const pendingAlerts = localNext.map((alert) =>
        alert.id === localRecord.id
          ? {
              ...alert,
              syncStatus: isBackendAuthError(error)
                ? "pending_auth"
                : "pending",
              lastSyncError: error.message,
              lastSyncAttemptAt: attemptAt,
            }
          : alert,
      );
      cacheAlerts(pendingAlerts);
      setAlertBackendStatus((current) => ({
        ...current,
        source: isBackendAuthError(error) ? "auth_required" : "local_cache",
        message: isBackendAuthError(error)
          ? "Backend sync requires Email login. Saved locally."
          : "Saved locally. Backend sync pending.",
        lastSyncAttemptAt: attemptAt,
        lastSyncError: error.message,
        backendProfileRole: user?.role || current.backendProfileRole || "",
        backendRequestMode: isBackendAuthError(error)
          ? "auth_required"
          : current.backendRequestMode,
        alertsUsingAuthenticatedToken: isBackendAuthError(error)
          ? false
          : current.alertsUsingAuthenticatedToken,
        requireAuthForBackend: isBackendAuthRequired,
        anonBackendAccessLikely: isBackendAuthError(error)
          ? false
          : current.anonBackendAccessLikely,
        ...alertSyncCounts(pendingAlerts),
      }));
      const emailResult = await attemptAlertEmailNotification(localRecord, {
        reason: "create",
      });
      return { ok: false, error, alert: localRecord, emailResult };
    }
  }

  async function updateAlertRecord(alertId, changes) {
    const attemptAt = new Date().toISOString();
    const authUserId = currentAuthUserId();
    const requestAuth = isSupabaseConfigured
      ? await supabase.getRequestAuthContext()
      : { mode: "local_fallback", isAuthenticated: false, authUserId: "" };
    const authRequiredForWrite = requestAuth.mode === "auth_required";
    const latestAlerts = normalizeAlerts(
      alertsRef.current.length ? alertsRef.current : readStorage(ALERT_KEY, []),
    );
    const currentAlert = latestAlerts.find(
      (alert) =>
        String(alert.id) === String(alertId) ||
        String(alert.backendId) === String(alertId) ||
        String(alert.localId) === String(alertId),
    );
    if (!currentAlert)
      return { ok: false, error: new Error("Alert not found.") };
    const updatedAlert = {
      ...currentAlert,
      ...changes,
      lastUpdatedByAuthUserId:
        changes.lastUpdatedByAuthUserId ||
        authUserId ||
        currentAlert.lastUpdatedByAuthUserId ||
        "",
      syncStatus: isSupabaseConfigured
        ? authRequiredForWrite
          ? "pending_auth"
          : "pending"
        : "synced",
      lastSyncAttemptAt: attemptAt,
    };
    const localNext = latestAlerts.map((alert) =>
      alert.id === currentAlert.id ? updatedAlert : alert,
    );
    cacheAlerts(localNext);
    if (!isSupabaseConfigured) {
      setAlertBackendStatus((current) => ({
        ...current,
        source: "local_fallback",
        message: "Updated locally.",
        lastSyncAttemptAt: attemptAt,
        lastSyncError: "",
        backendRequestMode: "local_fallback",
        backendAuthUserId: "",
        backendProfileRole: user?.role || "",
        alertsUsingAuthenticatedToken: false,
        requireAuthForBackend: isBackendAuthRequired,
        anonBackendAccessLikely: false,
        ...alertSyncCounts(localNext),
      }));
      return { ok: true, localOnly: true };
    }
    if (authRequiredForWrite) {
      setAlertBackendStatus((current) => ({
        ...current,
        source: "auth_required",
        message: "Backend sync requires Email login. Saved locally.",
        lastSyncAttemptAt: attemptAt,
        lastSyncError: "",
        backendRequestMode: requestAuth.mode,
        backendAuthUserId: "",
        backendProfileRole: user?.role || current.backendProfileRole || "",
        alertsUsingAuthenticatedToken: false,
        requireAuthForBackend: isBackendAuthRequired,
        anonBackendAccessLikely: false,
        ...alertSyncCounts(localNext),
      }));
      return { ok: true, localOnly: true, authRequired: true };
    }
    try {
      const row = await supabase.updateAlert({
        backendId: currentAlert.backendId,
        localId: currentAlert.localId || currentAlert.id,
        changes: alertToSupabase(updatedAlert),
      });
      const syncedAlert = row ? alertFromSupabase(row) : updatedAlert;
      const syncedAlerts = localNext.map((alert) =>
        alert.id === currentAlert.id ? syncedAlert : alert,
      );
      cacheAlerts(syncedAlerts);
      setAlertBackendStatus((current) => ({
        ...current,
        source: "supabase",
        message: "Alerts synced with Supabase.",
        lastSuccessfulSyncAt: new Date().toISOString(),
        lastSyncAttemptAt: attemptAt,
        lastSyncError: "",
        backendRequestMode: requestAuth.mode,
        backendAuthUserId: requestAuth.authUserId,
        backendProfileRole: user?.role || current.backendProfileRole || "",
        alertsUsingAuthenticatedToken: requestAuth.isAuthenticated,
        ...alertSyncCounts(syncedAlerts),
      }));
      return { ok: true };
    } catch (error) {
      const pendingAlerts = localNext.map((alert) =>
        alert.id === currentAlert.id
          ? {
              ...alert,
              syncStatus: isBackendAuthError(error)
                ? "pending_auth"
                : "pending",
              lastSyncError: error.message,
              lastSyncAttemptAt: attemptAt,
            }
          : alert,
      );
      cacheAlerts(pendingAlerts);
      setAlertBackendStatus((current) => ({
        ...current,
        source: isBackendAuthError(error) ? "auth_required" : "local_cache",
        message: isBackendAuthError(error)
          ? "Backend sync requires Email login. Saved locally."
          : "Saved locally. Backend sync pending.",
        lastSyncAttemptAt: attemptAt,
        lastSyncError: error.message,
        backendRequestMode: isBackendAuthError(error)
          ? "auth_required"
          : current.backendRequestMode,
        alertsUsingAuthenticatedToken: isBackendAuthError(error)
          ? false
          : current.alertsUsingAuthenticatedToken,
        backendProfileRole: user?.role || current.backendProfileRole || "",
        requireAuthForBackend: isBackendAuthRequired,
        anonBackendAccessLikely: isBackendAuthError(error)
          ? false
          : current.anonBackendAccessLikely,
        ...alertSyncCounts(pendingAlerts),
      }));
      return { ok: false, error };
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function restoreSupabaseUser() {
      if (!isSupabaseAuthConfigured) {
        setAuthStatus((current) => ({ ...current, configured: false }));
        return;
      }
      const session = await getCurrentSession();
      if (!session?.user || cancelled) return;
      const result = await applySupabaseSession(session);
      if (!result.ok && !cancelled && !user?.loginSource) {
        setUser(null);
      }
    }
    restoreSupabaseUser();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function updateOnlineStatus() {
      setIsOnline(navigator.onLine);
    }
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  useEffect(() => {
    refreshAlertsFromBackend("app_mount");
    if (!isSupabaseConfigured) return undefined;
    const intervalId = window.setInterval(() => {
      refreshAlertsFromBackend("poll");
    }, ALERT_POLL_INTERVAL_SECONDS * 1000);
    function refreshWhenVisible() {
      if (document.visibilityState === "visible")
        refreshAlertsFromBackend("visible");
    }
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
    // TODO: Add Supabase Realtime subscription for alert inserts/updates after auth and channel policy are finalized.
  }, []);

  useEffect(() => {
    if (user) refreshAlertsFromBackend("login");
  }, [user?.id]);

  useEffect(() => {
    if (user?.loginSource === "supabase_auth") {
      fetchShiftDataForDate(todayKey());
      refreshFinancialSignoffsFromBackend(todayKey());
      refreshAssetChecksFromBackend(todayKey());
    }
  }, [user?.id, user?.loginSource]);

  useEffect(() => {
    if (
      user?.loginSource === "supabase_auth" &&
      ["closing", "event"].includes(selectedShift)
    ) {
      refreshFinancialSignoffsFromBackend(todayKey());
      refreshAssetChecksFromBackend(todayKey());
    }
  }, [selectedShift, user?.id, user?.loginSource]);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || import.meta.env.DEV)
      return undefined;
    let registrationRef;
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((registration) => {
        registrationRef = registration;
        if (registration.waiting) setWaitingWorker(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const nextWorker = registration.installing;
          if (!nextWorker) return;
          nextWorker.addEventListener("statechange", () => {
            if (
              nextWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              setWaitingWorker(nextWorker);
            }
          });
        });
      })
      .catch(() => {
        // PWA support is helpful but not required for backend sync.
      });
    return () => {
      registrationRef?.update?.();
    };
  }, []);

  if (!user) {
    return (
      <>
        <Login
          onLogin={(nextUser) => {
            saveStorage(SESSION_KEY, nextUser);
            setUser(nextUser);
            updateAuthStatusFromUser(nextUser);
          }}
          staffUsers={staffUsers}
          onSupabaseLogin={handleSupabaseLogin}
          authStatus={authStatus}
          onAuthSignOut={clearSupabaseAuthSession}
        />
        {!pilotAccepted && (
          <PilotNotice
            onAccept={() => {
              saveStorage(PILOT_NOTICE_KEY, true);
              setPilotAccepted(true);
            }}
          />
        )}
        <UpdateBanner waitingWorker={waitingWorker} />
      </>
    );
  }

  async function logout() {
    if (user?.loginSource === "supabase_auth") {
      await signOutSupabase();
    }
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
    setSelectedShift(null);
    setShowManager(false);
    setAuthStatus((current) => ({
      ...current,
      loginSource: "staff_code",
      authUserId: "",
      profileRole: "",
      organizationId: "",
      profileActive: true,
      profileFetchError: "",
    }));
  }

  return (
    <>
      <TopBar
        user={user}
        selectedShift={showManager ? "manager" : selectedShift}
        isOnline={isOnline}
        siteAccessStatus={siteAccessStatus}
        onBack={() => {
          setSelectedShift(null);
          setShowManager(false);
        }}
        onLogout={logout}
      />
      {siteSettings.locationCheckEnabled &&
        ["away", "unknown"].includes(siteAccess.status) &&
        !activeOverride && (
          <p className="status-message page-status">
            You appear to be away from Youngs. You can view the app, but
            operational changes require being on site.
          </p>
        )}
      {!selectedShift &&
        !showManager &&
        (canUseEventFloorDashboard(user) ? (
          <EventFloorDashboard
            user={user}
            events={events}
            responsibleAssignments={responsibleAssignments}
            cashSignoffs={cashSignoffs}
            setCashSignoffs={setCashSignoffs}
            assets={assets}
            assetChecks={assetChecks}
            setAssetChecks={setAssetChecks}
            eventTaskChecks={eventTaskChecks}
            setEventTaskChecks={setEventTaskChecks}
            staffUsers={staffUsers}
            requestWriteAccess={requestWriteAccess}
            onSyncFinancialSignoff={syncFinancialSignoff}
            onRefreshFinancialSignoffs={refreshFinancialSignoffsFromBackend}
            onEnsureShiftSession={ensureShiftSession}
            onSyncTaskLog={syncChecklistLog}
            onSyncHandover={syncChecklistHandover}
            onShowOverview={() => setSelectedShift("overview")}
            onGuides={() => setSelectedShift("guides")}
          />
        ) : (
          <ShiftPicker
            user={user}
            onSelect={setSelectedShift}
            onManager={() => setShowManager(true)}
            routines={routines}
            logs={logs}
            handoverNotes={handoverNotes}
            responsibleAssignments={responsibleAssignments}
          />
        ))}
      {selectedShift &&
        !showManager &&
        (selectedShift === "overview" ? (
          <StaffDashboard
            user={user}
            routines={routines}
            logs={logs}
            handoverNotes={handoverNotes}
            finishRecords={finishRecords}
            alerts={alerts}
            responsibleAssignments={responsibleAssignments}
            events={events}
            cashSignoffs={cashSignoffs}
            assetChecks={assetChecks}
            alertBackendStatus={alertBackendStatus}
            refreshAlerts={loadSupabaseAlerts}
            onAlert={() => setShowGlobalAlert(true)}
          />
        ) : (
          <Checklist
            user={user}
            shiftType={selectedShift}
            routines={routines}
            logs={logs}
            setLogs={setLogs}
            handoverNotes={handoverNotes}
            setHandoverNotes={setHandoverNotes}
            finishRecords={finishRecords}
            setFinishRecords={setFinishRecords}
            alerts={alerts}
            setAlerts={setAlerts}
            saveAlertRecord={saveAlertRecord}
            responsibleAssignments={responsibleAssignments}
            cashSignoffs={cashSignoffs}
            setCashSignoffs={setCashSignoffs}
            assets={assets}
            assetChecks={assetChecks}
            setAssetChecks={setAssetChecks}
            staffUsers={staffUsers}
            requestWriteAccess={requestWriteAccess}
            onEnsureShiftSession={ensureShiftSession}
            onSyncTaskLog={syncChecklistLog}
            onSyncHandover={syncChecklistHandover}
            onSyncFinancialSignoff={syncFinancialSignoff}
            onRestoreShiftData={restoreShiftFromBackend}
            onShowOverview={() => setSelectedShift("overview")}
            onChangeShift={() => setSelectedShift(null)}
            onLogout={logout}
          />
        ))}
      {showManager && canAccessManagerDashboard(user) && (
        <ManagerDashboard
          user={user}
          routines={routines}
          setRoutines={setRoutines}
          staffUsers={staffUsers}
          setStaffUsers={setStaffUsers}
          logs={logs}
          setLogs={setLogs}
          handoverNotes={handoverNotes}
          setHandoverNotes={setHandoverNotes}
          finishRecords={finishRecords}
          setFinishRecords={setFinishRecords}
          alerts={alerts}
          setAlerts={setAlerts}
          responsibleAssignments={responsibleAssignments}
          setResponsibleAssignments={setResponsibleAssignments}
          siteSettings={siteSettings}
          setSiteSettings={setSiteSettings}
          siteOverrides={siteOverrides}
          setSiteOverrides={setSiteOverrides}
          events={events}
          setEvents={setEvents}
          cashSignoffs={cashSignoffs}
          setCashSignoffs={setCashSignoffs}
          assets={assets}
          setAssets={setAssets}
          assetChecks={assetChecks}
          setAssetChecks={setAssetChecks}
          eventTaskChecks={eventTaskChecks}
          setEventTaskChecks={setEventTaskChecks}
          siteAccess={siteAccess}
          alertBackendStatus={alertBackendStatus}
          shiftDataStatus={shiftDataStatus}
          financialBackendStatus={financialBackendStatus}
          assetBackendStatus={assetBackendStatus}
          authStatus={authStatus}
          fetchAuthProfiles={fetchUserProfiles}
          onTestShiftBackendWrite={testChecklistBackendWrite}
          onClearSyncedLocalChecklistPendingRecords={
            clearSyncedLocalChecklistPendingRecords
          }
          onClearSyncedFinancialPendingRecords={
            clearSyncedFinancialPendingRecords
          }
          onClearSyncedAssetPendingRecords={clearSyncedAssetPendingRecords}
          onReviewFinancialSignoff={reviewFinancialSignoffFromBackend}
          updateAlertRecord={updateAlertRecord}
          retryAlertEmailNotification={(alert) =>
            attemptAlertEmailNotification(alert, { reason: "retry" })
          }
          refreshAlerts={loadSupabaseAlerts}
          refreshShiftData={fetchShiftDataForDate}
          refreshFinancialSignoffs={refreshFinancialSignoffsFromBackend}
          refreshAssetRegistry={refreshAssetRegistryFromBackend}
          refreshAssetChecks={refreshAssetChecksFromBackend}
          retryAlertSync={() => refreshAlertsFromBackend("retry")}
          checkLocation={checkLocation}
          requestWriteAccess={requestWriteAccess}
          onResetPilotNotice={() => {
            localStorage.removeItem(PILOT_NOTICE_KEY);
            setPilotAccepted(false);
          }}
        />
      )}
      {!pilotAccepted && (
        <PilotNotice
          onAccept={() => {
            saveStorage(PILOT_NOTICE_KEY, true);
            setPilotAccepted(true);
          }}
        />
      )}
      {showGlobalAlert && (
        <AlertManagerModal
          user={user}
          onClose={() => setShowGlobalAlert(false)}
          onSave={async (alertRecord) => {
            if (!(await requestWriteAccess())) return;
            const result = await saveAlertRecord(alertRecord);
            setShowGlobalAlert(false);
            const emailNote = result.emailResult?.authRequired
              ? "\n\nEmail notification requires Email login."
              : result.emailResult?.ok === false
                ? "\n\nEmail notification failed. Alert is still saved."
                : "";
            window.alert(
              result.authRequired
                ? `Saved locally. Email login required for backend sync.${emailNote}`
                : result.ok
                  ? `Alert saved.${emailNote}`
                  : `Saved locally. Backend sync pending.${emailNote}`,
            );
          }}
        />
      )}
      <UpdateBanner waitingWorker={waitingWorker} />
    </>
  );
}

