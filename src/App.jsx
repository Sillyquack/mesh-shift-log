import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  areas,
  defaultRoutines,
  knowledgeBase,
  normalizeRoutineTask,
  normalizeRoutines,
  shiftOptions,
  staffCodes,
  } from "./data/routines.js";
import { eventTaskTemplates } from "./data/eventTaskTemplates.js";
import { eventRigGuides } from "./data/eventRigGuides.js";
import {
  deriveEventPlanOperationalWindow,
  recalculateEventPlanTimes,
  suggestEventPlan,
} from "./data/eventPlanSuggestionRules.js";
import {
  analyzeStaffingAssignmentConflicts,
  isAssignableStaffProfile,
  mergeStaffingProposals,
  normalizeStaffingProposalAssignedAuthUserIds,
  staffProfileMatchesSearch,
  staffingAssignmentAction,
  staffingAssignmentMatchesProfile,
  staffingProfileAuthUserId,
  staffingProfileDisplayName,
  staffingProposalStats,
  staffingRoleOptions,
  suggestEventStaffing,
  syncStaffingProposalAssignments,
} from "./data/eventStaffingSuggestionRules.js";
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
  onAuthStateChange,
  requestPasswordRecoveryEmail,
  signInWithEmailPassword,
  signOutSupabase,
  signOutPasswordRecoverySession,
  updateCurrentUserPassword,
  } from "./lib/supabaseAuthClient.js";
import {
  AUTH_PASSWORD_MIN_LENGTH,
  PASSWORD_RECOVERY_NEUTRAL_SUCCESS,
  applicationBaseUrl,
  inspectAuthCallback,
  normalizeAuthEmail,
  performPasswordUpdate,
} from "./data/authPasswordSecurity.js";
import {
  canAccessManagerDashboard,
  canUseInventory,
  canAcknowledgeAlerts,
  canResolveAlerts,
  canRetryEmailNotification,
  canGenerateEventCode,
  canUseEventFloorDashboard,
  canViewAuthProfiles,
  isInventoryCounter,
  isManager,
  isSharedDeviceUser,
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
import {
  fetchManagerDailyReview,
  fetchManagerDailyReviewHistory,
  upsertManagerDailyReview,
} from "./lib/managerReviewDataClient.js";
import {
  fetchCloseDayArchive,
  upsertCloseDayArchive,
} from "./lib/closeDayArchiveClient.js";
import {
  generateDailyEventCode,
  validateDailyEventCode,
} from "./lib/eventAccessCodeClient.js";
import {
  createEventOperation,
  createEventTask,
  createResponsibilityHandover,
  deactivateEventRoleAssignment,
  fetchAssignableEventStaff,
  fetchEventOperationsForDate,
  fetchEventRoleAssignments,
  fetchEventStaffPresence,
  fetchEventTasks,
  fetchResponsibilityHandovers,
  updateEventOperation,
  updateEventTaskStatus,
  upsertEventRoleAssignment,
  upsertEventStaffPresence,
} from "./lib/eventOperationsClient.js";
import {
  createCalendarSource,
  createEventOperationFromCalendarEvent,
  linkCalendarEventToEventOperation,
  listCalendarSources,
  listImportedCalendarEvents,
  syncGoogleCalendar,
} from "./lib/calendarImportClient.js";
import {
  createSuggestedEventPlan,
  dismissEventPlan,
  listEventPlans,
  markEventPlanApplied,
  supersedePreviousPlans,
  updateEventPlan,
} from "./lib/eventPlanClient.js";
import { subscribeToEventOperationsRealtime } from "./lib/eventOperationsRealtime.js";
import {
  acknowledgeEventLiveUpdate,
  cancelEventLiveUpdate,
  createEventLiveUpdate,
  listEventLiveUpdates,
  resolveEventLiveUpdate,
} from "./lib/eventLiveUpdatesClient.js";

const EventOperationsCockpit = lazy(() => import("./components/EventOperationsCockpit.jsx"));
const InventoryWorkspace = lazy(() => import("./components/InventoryWorkspace.jsx"));
const RoutineEngineLauncher = lazy(() => import("./features/routines-v2/components/RoutineEngineLauncher.jsx"));
const RoutineEngineWorkspace = lazy(() => import("./features/routines-v2/components/RoutineEngineWorkspace.jsx"));
const RoutineEngineErrorBoundary = lazy(() => import("./features/routines-v2/components/RoutineEngineErrorBoundary.jsx"));
const EventCockpitSummaryCard = lazy(() =>
  import("./components/EventOperationsCockpit.jsx").then((module) => ({
    default: module.EventCockpitSummaryCard,
  })),
);

function FocusedViewLoading({ label = "Loading event view..." }) {
  return (
    <section className="manager-list" role="status" aria-live="polite" aria-busy="true">
      <p className="muted">{label}</p>
    </section>
  );
}

function buildReviewStatusForHistoryDate(historyDate, reviewMap = {}) {
  const review = reviewMap?.[historyDate];
  const checkedCount = review
    ? Object.values(review.checked || {}).filter(Boolean).length
    : 0;

  if (!review) {
    return {
      label: "Missing",
      checkedCount: 0,
      signedBy: "",
      signedAt: "",
      notes: "",
    };
  }

  if (review.signedOffAt) {
    return {
      label: "Signed",
      checkedCount,
      signedBy: review.signedOffBy || "Manager",
      signedAt: review.signedOffAt,
      notes: review.notes || "",
    };
  }

  return {
    label: checkedCount ? "Open" : "Not started",
    checkedCount,
    signedBy: "",
    signedAt: "",
    notes: review.notes || "",
  };
}

function fallbackReviewStatusForHistoryDate(historyDate) {
  return buildReviewStatusForHistoryDate(historyDate, globalThis.__meshManagerReviewHistoryByDate || {});
}

const APP_VERSION = "0.8.0";
const RELEASE_LABEL = "v0.8.0-stock-count-simplicity-hardening";
const RELEASE_SUMMARY = "guided Stock Count and transparent Millum export";
const ALERT_SYNC_BUILD = "v0.7.0-auth-backend";
const ALERT_POLL_INTERVAL_SECONDS = 15;
const LOG_KEY = "mesh-shift-logs-v1";
const ROUTINE_KEY = "mesh-routines-v1";
const SESSION_KEY = "mesh-current-user-v1";
const PASSWORD_RECOVERY_UI_KEY = "mesh-password-recovery-ui-v1";
const OPERATOR_KEY = "mesh-current-operator-v1";
const EVENT_CODE_ACCESS_KEY = "mesh-event-code-access-v1";
const ROLE_MODE_KEY = "mesh-current-role-mode-v1";
const SHIFT_SCOPE_KEY = "mesh-current-shift-scope-v1";
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
const EVENT_OPERATIONS_KEY = "mesh-event-operations-v1";
const EVENT_STAFF_PRESENCE_KEY = "mesh-event-staff-presence-v1";
const EVENT_ROLE_ASSIGNMENT_KEY = "mesh-event-role-assignments-v1";
const EVENT_OPERATION_TASK_KEY = "mesh-event-operation-tasks-v1";
const EVENT_HANDOVER_KEY = "mesh-event-responsibility-handovers-v1";
const EVENT_LIVE_UPDATE_KEY = "mesh-event-live-updates-v1";
const EVENT_SELECTED_BOARD_KEY = "mesh-event-selected-board-v1";
const EVENT_TASK_ALERT_STATE_KEY = "mesh-event-task-alert-state-v1";
const EVENT_TASK_ALERT_SETTINGS_KEY = "mesh-event-task-alert-settings-v1";
const EVENT_TASK_ALERT_POLL_SECONDS = 15;
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
const eventRoleOptions = [
  { key: "event_floor_manager", label: "Event Floor Manager", zone: "all", reportsTo: "Hospitality Operations Manager / Robert", singleLead: true, group: "command" },
  { key: "cornerbar_manager", label: "Cornerbar Manager", zone: "cornerbar", reportsTo: "Event Floor Manager", singleLead: true, group: "command" },
  { key: "atrium_manager", label: "Atrium Manager", zone: "atrium", reportsTo: "Event Floor Manager", singleLead: true, group: "command" },
  { key: "workbar_manager", label: "Workbar Manager", zone: "workbar", reportsTo: "Event Floor Manager", singleLead: true, group: "command" },
  { key: "headrunner", label: "Headrunner", zone: "runners", reportsTo: "Event Floor Manager", singleLead: true, group: "command" },
  { key: "runner", label: "Runner", zone: "runners", reportsTo: "Headrunner", singleLead: false, group: "team" },
  { key: "cornerbar_staff", label: "Cornerbar Staff", zone: "cornerbar", reportsTo: "Cornerbar Manager", singleLead: false, group: "team" },
  { key: "atrium_staff", label: "Atrium Staff", zone: "atrium", reportsTo: "Atrium Manager", singleLead: false, group: "team" },
  { key: "workbar_staff", label: "Workbar Staff", zone: "workbar", reportsTo: "Workbar Manager", singleLead: false, group: "team" },
  { key: "bar_staff", label: "Bar Staff", zone: "bar", reportsTo: "Zone manager", singleLead: false, group: "team" },
  { key: "support", label: "Support", zone: "support", reportsTo: "Event Floor Manager", singleLead: false, group: "team" },
  { key: "other", label: "Other", zone: "other", reportsTo: "Event Floor Manager", singleLead: false, group: "team" },
];
const eventTaskStatuses = ["pending", "acknowledged", "done", "missed", "cancelled"];
const eventZones = ["all", "cornerbar", "atrium", "workbar", "runners", "bar", "support", "other", "backstage", "project_rooms"];
const eventHandoverScopes = ["all", "locking", "cash_close", "assets_check", "event_close", "cornerbar", "atrium", "workbar"];
const eventCommandZones = [
  {
    key: "all",
    label: "Event Floor",
    managerRole: "event_floor_manager",
    staffRoles: ["support", "bar_staff"],
  },
  {
    key: "cornerbar",
    label: "Cornerbar",
    managerRole: "cornerbar_manager",
    staffRoles: ["cornerbar_staff", "bar_staff", "support"],
  },
  {
    key: "atrium",
    label: "Atrium",
    managerRole: "atrium_manager",
    staffRoles: ["atrium_staff", "bar_staff", "support"],
  },
  {
    key: "workbar",
    label: "Workbar",
    managerRole: "workbar_manager",
    staffRoles: ["workbar_staff", "support"],
  },
  {
    key: "runners",
    label: "Runners",
    managerRole: "headrunner",
    staffRoles: ["runner"],
  },
  { key: "bar", label: "Bar", managerRole: "", staffRoles: ["bar_staff", "support", "other"] },
  { key: "support", label: "Support", managerRole: "", staffRoles: ["support", "other"] },
  { key: "backstage", label: "Backstage / Technical", managerRole: "", staffRoles: ["support", "other"] },
  { key: "project_rooms", label: "Project Rooms", managerRole: "", staffRoles: ["support", "other"] },
  { key: "other", label: "Other", managerRole: "", staffRoles: ["other", "support"] },
];
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

const protectedSiteAccessShifts = new Set([
  "opening",
  "daytime",
  "closing",
  "event",
  "other_support",
]);

const allOperationalShiftIds = [
  "opening",
  "daytime",
  "closing",
  "event",
  "weekly",
  "monthly",
  "other_support",
];

const shiftScopeOptions = {
  opening: {
    selectedScope: "opening",
    allowedShifts: ["opening"],
    label: "Opening shift",
    defaultShift: "opening",
  },
  daytime: {
    selectedScope: "daytime",
    allowedShifts: ["daytime"],
    label: "Daytime shift",
    defaultShift: "daytime",
  },
  closing: {
    selectedScope: "closing",
    allowedShifts: ["closing"],
    label: "Closing shift",
    defaultShift: "closing",
  },
  event: {
    selectedScope: "event",
    allowedShifts: ["event"],
    label: "Event shift",
    defaultShift: "event",
  },
  other_support: {
    selectedScope: "other_support",
    allowedShifts: ["other_support"],
    label: "Other / Support tasks",
    defaultShift: "other_support",
  },
  double_opening_closing: {
    selectedScope: "double_opening_closing",
    allowedShifts: ["opening", "closing"],
    label: "Double shift",
    defaultShift: "opening",
  },
  manager_all: {
    selectedScope: "manager_all",
    allowedShifts: allOperationalShiftIds,
    label: "Manager all shifts",
    defaultShift: "overview",
  },
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

function getOsloTimeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Oslo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value || 0,
  );
  return {
    hour,
    minute,
    minutesSinceMidnight: hour * 60 + minute,
    label: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    timeZone: "Europe/Oslo",
  };
}

function getOsloDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "0000";
  const month = parts.find((part) => part.type === "month")?.value || "00";
  const day = parts.find((part) => part.type === "day")?.value || "00";
  return `${year}-${month}-${day}`;
}

function getShiftAccessStatus(shiftId, user, date = new Date()) {
  const osloTime = getOsloTimeParts(date);
  const boundary = 11 * 60;
  const managerOverride = isManager(user);
  let blocked = false;
  let message = "";
  if (shiftId === "opening" && osloTime.minutesSinceMidnight > boundary) {
    blocked = true;
    message = "Opening shift is only available before 11:00 Oslo time.";
  }
  if (shiftId === "closing" && osloTime.minutesSinceMidnight < boundary) {
    blocked = true;
    message = "Closing shift is only available after 11:00 Oslo time.";
  }
  return {
    allowed: !blocked || managerOverride,
    blocked,
    managerOverride: blocked && managerOverride,
    message,
    osloTime,
  };
}

const roleModeOptions = [
  {
    roleMode: "event_floor_manager",
    label: "Event Floor Manager",
    description: "Open event floor tools, event checks, and daily event code.",
  },
  {
    roleMode: "cafe_staff",
    label: "Cafe Staff",
    description: "Open the normal shift and routine overview.",
  },
  {
    roleMode: "other_support",
    label: "Other / Support",
    description: "Open optional support tasks for quiet-time or event help.",
  },
];

function userRoleModeId(user) {
  return user?.authUserId || user?.id || user?.code || user?.name || "";
}

function normalizeRoleMode(record, user) {
  if (!record || typeof record !== "object") return null;
  const option = roleModeOptions.find(
    (item) => item.roleMode === record.roleMode,
  );
  if (!option) return null;
  if (record.selectedDate !== getOsloDateKey()) return null;
  const userId = userRoleModeId(user);
  if (userId && record.userId && record.userId !== userId) return null;
  return {
    roleMode: option.roleMode,
    selectedAt: record.selectedAt || new Date().toISOString(),
    selectedDate: record.selectedDate,
    userId: record.userId || userId,
    label: record.label || option.label,
  };
}

function shiftScopeUserId(user, operator) {
  return (
    operator?.name ||
    user?.operatorName ||
    user?.authUserId ||
    user?.backendUserId ||
    user?.id ||
    user?.code ||
    user?.name ||
    ""
  );
}

function defaultShiftForScope(scope) {
  if (scope === "double_opening_closing") {
    return getOsloTimeParts().minutesSinceMidnight < 11 * 60
      ? "opening"
      : "closing";
  }
  return shiftScopeOptions[scope]?.defaultShift || scope;
}

function normalizeShiftScope(record, user, operator) {
  if (!record || typeof record !== "object") return null;
  const option = shiftScopeOptions[record.selectedScope];
  if (!option) return null;
  if (record.date !== getOsloDateKey()) return null;
  const userId = shiftScopeUserId(user, operator);
  if (userId && record.userId && record.userId !== userId) return null;
  return {
    date: record.date,
    userId: record.userId || userId,
    operatorName: record.operatorName || operator?.name || user?.name || "",
    selectedScope: option.selectedScope,
    allowedShifts: option.allowedShifts,
    label: record.label || option.label,
    selectedAt: record.selectedAt || new Date().toISOString(),
  };
}

function makeShiftScope(scope, user, operator) {
  const option = shiftScopeOptions[scope];
  if (!option) return null;
  return {
    date: getOsloDateKey(),
    userId: shiftScopeUserId(user, operator),
    operatorName: operator?.name || user?.operatorName || user?.name || "",
    selectedScope: option.selectedScope,
    allowedShifts: option.allowedShifts,
    label: option.label,
    selectedAt: new Date().toISOString(),
  };
}

function canWorkInShiftScope(shiftType, scope, user) {
  if (isManager(user)) return true;
  if (["overview", "guides"].includes(shiftType)) return true;
  return Boolean(scope?.allowedShifts?.includes(shiftType));
}

function shiftScopeBlockMessage(shiftType, scope) {
  if (shiftType === "closing" || shiftType === "opening") {
    return "This shift is not part of your selected role today. Choose Double shift if you are covering both Opening and Closing.";
  }
  return `${shiftLabels[shiftType] || "This shift"} is not part of your selected role today.`;
}

function eventOpsLocalId(prefix = "event") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isLocalhostRuntime() {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function eventBoardPriority(event) {
  if ((event?.status || "draft") === "active") return 0;
  if ((event?.status || "draft") === "draft") return 1;
  return 2;
}

function toDateTimeLocalValue(dateOrIso = new Date()) {
  const date = dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso);
  if (Number.isNaN(date.getTime())) return "";
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

function fromDateTimeLocalValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function isValidDateTimeLocalValue(value) {
  if (!value) return true;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime());
}

function dateTimePartsInZone(date, timeZone = "Europe/Oslo") {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

function toOsloDateTimeLocalValue(dateOrIso) {
  if (!dateOrIso) return "";
  const date = dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = dateTimePartsInZone(date);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function fromOsloDateTimeLocalValue(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return "";
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const wallTime = Date.UTC(year, month - 1, day, hour, minute);
  const calendarCheck = new Date(wallTime);
  if (
    calendarCheck.getUTCFullYear() !== year ||
    calendarCheck.getUTCMonth() !== month - 1 ||
    calendarCheck.getUTCDate() !== day ||
    calendarCheck.getUTCHours() !== hour ||
    calendarCheck.getUTCMinutes() !== minute
  )
    return "";

  let candidateTime = wallTime;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = dateTimePartsInZone(new Date(candidateTime));
    const representedWallTime = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
    );
    const difference = wallTime - representedWallTime;
    if (difference === 0) break;
    candidateTime += difference;
  }

  const candidate = new Date(candidateTime);
  return toOsloDateTimeLocalValue(candidate) === value ? candidate.toISOString() : "";
}

function isValidOsloDateTimeLocalValue(value) {
  return !value || Boolean(fromOsloDateTimeLocalValue(value));
}

function addMinutesToDateTimeLocal(value, minutes) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return toDateTimeLocalValue(new Date(date.getTime() + minutes * 60000));
}

function addMinutesToIso(value, minutes) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() + minutes * 60000).toISOString();
}

function templateTaskDueAt(taskTemplate, event) {
  if (Number.isFinite(taskTemplate.offsetMinutesFromStart))
    return addMinutesToIso(event?.startsAt, taskTemplate.offsetMinutesFromStart);
  if (Number.isFinite(taskTemplate.offsetMinutesFromEnd))
    return addMinutesToIso(event?.endsAt, taskTemplate.offsetMinutesFromEnd);
  return "";
}

function templateTaskNeedsMissingTime(taskTemplate, event) {
  return (
    (Number.isFinite(taskTemplate.offsetMinutesFromStart) && !event?.startsAt) ||
    (Number.isFinite(taskTemplate.offsetMinutesFromEnd) && !event?.endsAt)
  );
}

function buildTemplateTaskPreview(template, event) {
  if (!template) return [];
  return template.tasks.map((taskTemplate, index) => {
    const dueAt = templateTaskDueAt(taskTemplate, event);
    const remindAt =
      dueAt && Number.isFinite(taskTemplate.remindMinutesBefore)
        ? addMinutesToIso(dueAt, -taskTemplate.remindMinutesBefore)
        : "";
    return {
      ...taskTemplate,
      templateTaskId: taskTemplate.id || `${template.id}-${index}`,
      dueAt,
      remindAt,
      timingMissing: templateTaskNeedsMissingTime(taskTemplate, event),
      roleLabel: taskTemplate.assignedRoleLabel || eventRoleLabel(taskTemplate.assignedRoleKey),
    };
  });
}

function defaultEventOperationForm() {
  const startsAt = new Date();
  startsAt.setSeconds(0, 0);
  const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60000);
  return {
    title: "",
    venue: "",
    startsAt: toDateTimeLocalValue(startsAt),
    endsAt: toDateTimeLocalValue(endsAt),
    notes: "",
  };
}

function defaultEventTaskForm() {
  const dueAt = addMinutesToDateTimeLocal(new Date(), 10);
  return {
    title: "",
    description: "",
    dueAt,
    remindAt: addMinutesToDateTimeLocal(dueAt, -5),
    zone: "all",
    priority: "normal",
    targetType: "role",
    assignedRoleKey: "",
    assignedOperatorName: "",
  };
}

function eventRoleLabel(roleKey) {
  if (roleKey === "all_event_staff") return "All event staff";
  return eventRoleOptions.find((role) => role.key === roleKey)?.label || roleKey || "";
}

function eventRoleOption(roleKey) {
  return eventRoleOptions.find((role) => role.key === roleKey) || null;
}

function isEventOpsManager(user) {
  return !isSharedDeviceUser(user) && (isManager(user) || canUseEventFloorDashboard(user));
}

function eventTaskMatchesUser(task, assignments, user) {
  if (isSharedDeviceUser(user) && !normalizedPersonName(user?.operatorName))
    return false;
  const names = userIdentityNames(user);
  const authUserId = user?.authUserId || user?.backendUserId || user?.id || "";
  const activeAssignments = assignments.filter((assignment) => assignment.active && assignment.eventId === task.eventId);
  if (task.assignedOperatorName)
    return names.includes(normalizedPersonName(task.assignedOperatorName));
  if (task.assignedAuthUserId && authUserId && task.assignedAuthUserId === authUserId)
    return true;
  if (task.assignedRoleKey && task.assignedRoleKey !== "all_event_staff") {
    return activeAssignments.some((assignment) => {
      if (!assignment.active || assignment.roleKey !== task.assignedRoleKey) return false;
      const taskZone = eventZoneForTask(task);
      const assignmentZone = eventRoleEffectiveZone(assignment.roleKey, assignment.zone);
      const zoneMatches =
        taskZone === "all" || assignmentZone === "all" || assignmentZone === taskZone;
      return zoneMatches && assignmentMatchesUser(assignment, user);
    });
  }
  const audience = task.metadata?.audience || (task.assignedRoleKey === "all_event_staff" ? "all_event_staff" : "");
  if (audience === "all_event_staff")
    return Boolean(names.length || authUserId);
  if (audience)
    return activeAssignments.some(
      (assignment) => assignment.roleKey === audience && assignmentMatchesUser(assignment, user),
    );
  return false;
}

function eventTaskActorKey(user) {
  const authUserId = user?.authUserId || user?.backendUserId || user?.id || "local";
  const operatorName = String(user?.operatorName || user?.name || "").trim().toLowerCase();
  return `${authUserId}::${operatorName || "unknown"}`;
}

function eventTaskAlertKey(user, task, type) {
  const timestamp = type === "reminder" ? task.remindAt : task.dueAt;
  return `${getOsloDateKey()}::${task.eventId || "event"}::${eventTaskActorKey(user)}::${task.id}::${type}::${timestamp || "none"}`;
}

function isOpenEventTask(task) {
  return !["done", "cancelled", "missed"].includes(task.status || "pending");
}

function assignedEventTasksForUser(events, assignments, tasks, user) {
  const activeEventIds = new Set(
    events
      .filter((event) => ["draft", "active"].includes(event.status || "draft"))
      .map((event) => event.id),
  );
  return tasks
    .filter((task) => activeEventIds.has(task.eventId))
    .filter((task) => eventTaskMatchesUser(task, assignments, user));
}

function minutesBetweenNow(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  return Math.round((time - Date.now()) / 60000);
}

function eventTaskTimingLabel(task) {
  if (!task.dueAt) return "No due time";
  const minutes = minutesBetweenNow(task.dueAt);
  if (minutes === null) return "Due time unavailable";
  if (minutes < 0) return `Overdue by ${Math.abs(minutes)} min`;
  if (minutes === 0) return "Due now";
  return `Due in ${minutes} min`;
}

function groupAssignedEventTasks(tasks) {
  const groups = [
    ["Due now", []],
    ["Due soon", []],
    ["Pending", []],
    ["Acknowledged", []],
    ["Done", []],
  ];
  const groupMap = Object.fromEntries(groups);
  tasks
    .slice()
    .sort((a, b) => new Date(a.dueAt || "9999-12-31") - new Date(b.dueAt || "9999-12-31"))
    .forEach((task) => {
      if (task.status === "done") groupMap.Done.push(task);
      else if (task.status === "acknowledged") groupMap.Acknowledged.push(task);
      else if (task.dueAt && new Date(task.dueAt).getTime() <= Date.now())
        groupMap["Due now"].push(task);
      else if (task.dueAt && new Date(task.dueAt).getTime() - Date.now() <= 30 * 60000)
        groupMap["Due soon"].push(task);
      else groupMap.Pending.push(task);
  });
  return groups;
}

function eventTaskTimelineGroups(tasks) {
  const now = Date.now();
  const groups = [
    ["Due now", []],
    ["Due soon", []],
    ["Pending", []],
    ["Acknowledged", []],
    ["Done", []],
    ["Missed/cancelled", []],
  ];
  const groupMap = Object.fromEntries(groups);
  tasks
    .slice()
    .sort((a, b) => new Date(a.dueAt || a.remindAt || "9999-12-31") - new Date(b.dueAt || b.remindAt || "9999-12-31"))
    .forEach((task) => {
      const status = task.status || "pending";
      if (status === "done") groupMap.Done.push(task);
      else if (status === "acknowledged") groupMap.Acknowledged.push(task);
      else if (["missed", "cancelled"].includes(status)) groupMap["Missed/cancelled"].push(task);
      else if (task.dueAt && new Date(task.dueAt).getTime() <= now) groupMap["Due now"].push(task);
      else if (task.dueAt && new Date(task.dueAt).getTime() - now <= 30 * 60000) groupMap["Due soon"].push(task);
      else groupMap.Pending.push(task);
    });
  return groups;
}

function taskAssignedLabel(task) {
  return task.assignedOperatorName || eventRoleLabel(task.assignedRoleKey) || "Assigned task";
}

function normalizedPersonName(value) {
  return String(value || "").trim().toLowerCase();
}

function eventStaffSourcePriority(source = "") {
  const normalizedSource = String(source || "").trim().toLowerCase();
  if (["time2staff", "workbar_device", "workbar device"].includes(normalizedSource)) return 0;
  if (["staff", "supabase_auth", "email"].includes(normalizedSource)) return 1;
  if (normalizedSource === "manual") return 2;
  return 3;
}

function eventPresenceTimestamp(person) {
  const timestamp =
    new Date(person?.lastSeenAt || person?.updatedAt || person?.checkedInAt || 0).getTime() || 0;
  return timestamp;
}

function dedupeEventStaffPresence(presence = []) {
  const grouped = new Map();
  presence.forEach((person) => {
    const name = String(person?.operatorName || "").trim();
    const key = normalizedPersonName(name);
    if (!key) return;
    const current = grouped.get(key);
    const candidateScore = [
      person.available === false ? 1 : 0,
      eventStaffSourcePriority(person.operatorSource),
      -eventPresenceTimestamp(person),
    ];
    const currentScore = current
      ? [
          current.available === false ? 1 : 0,
          eventStaffSourcePriority(current.operatorSource),
          -eventPresenceTimestamp(current),
        ]
      : null;
    if (
      !current ||
      candidateScore[0] < currentScore[0] ||
      (candidateScore[0] === currentScore[0] && candidateScore[1] < currentScore[1]) ||
      (candidateScore[0] === currentScore[0] &&
        candidateScore[1] === currentScore[1] &&
        candidateScore[2] < currentScore[2])
    ) {
      grouped.set(key, { ...person, operatorName: name });
    }
  });
  return [...grouped.values()].sort((a, b) =>
    normalizedPersonName(a.operatorName).localeCompare(normalizedPersonName(b.operatorName)),
  );
}

function eventRoleEffectiveZone(roleKey, zone = "") {
  const requestedZone = String(zone || "").trim().toLowerCase();
  const validZone = eventZones.includes(requestedZone) ? requestedZone : "";
  if (roleKey === "runner" || roleKey === "headrunner") return "runners";
  if (roleKey === "cornerbar_staff" || roleKey === "cornerbar_manager") return "cornerbar";
  if (roleKey === "atrium_staff" || roleKey === "atrium_manager") return "atrium";
  if (roleKey === "workbar_staff" || roleKey === "workbar_manager") return "workbar";
  if (roleKey === "bar_staff") return validZone || "bar";
  if (roleKey === "support") return validZone || "support";
  if (roleKey === "other") return validZone || "other";
  return validZone || eventRoleOption(roleKey)?.zone || "all";
}

function zoneDisplayLabel(zone = "") {
  const labelMap = {
    all: "Event Floor",
    cornerbar: "Cornerbar",
    atrium: "Atrium",
    workbar: "Workbar",
    runners: "Runners",
    bar: "Bar",
    support: "Support",
    other: "Other",
    backstage: "Backstage / Technical",
    project_rooms: "Project Rooms",
  };
  return labelMap[zone] || zone || "All";
}

function assignmentNames(assignments = []) {
  const names = [];
  assignments.forEach((assignment) => {
    const name = String(assignment.assignedOperatorName || "").trim();
    if (name && !names.some((item) => normalizedPersonName(item) === normalizedPersonName(name)))
      names.push(name);
  });
  return names;
}

function eventRoleImportance(roleKey = "") {
  const order = [
    "event_floor_manager",
    "cornerbar_manager",
    "atrium_manager",
    "workbar_manager",
    "headrunner",
    "runner",
    "cornerbar_staff",
    "atrium_staff",
    "workbar_staff",
    "bar_staff",
    "support",
    "other",
  ];
  const index = order.indexOf(roleKey);
  return index === -1 ? order.length : index;
}

function eventRolesForPerson(person, assignments = []) {
  const personName = normalizedPersonName(person?.operatorName);
  const authUserId = person?.authUserId || person?.backendUserId || "";
  return assignments
    .filter((assignment) => {
      if (!assignment.active) return false;
      if (assignment.assignedAuthUserId && authUserId)
        return assignment.assignedAuthUserId === authUserId;
      if (assignment.assignedAuthUserId) return false;
      return Boolean(
        personName &&
        assignment.assignedOperatorName &&
        normalizedPersonName(assignment.assignedOperatorName) === personName,
      );
    })
    .sort((a, b) => eventRoleImportance(a.roleKey) - eventRoleImportance(b.roleKey));
}

function eventRoleSummaryForPerson(person, assignments = []) {
  const labels = [];
  eventRolesForPerson(person, assignments).forEach((assignment) => {
    const label = eventRoleLabel(assignment.roleKey);
    if (label && !labels.includes(label)) labels.push(label);
  });
  return labels.join(", ") || "Available";
}

function eventStaffOptionLabel(person, assignments = []) {
  const name = String(person?.operatorName || "").trim();
  return `${name} - ${eventRoleSummaryForPerson(person, assignments)}`;
}

function zoneTaskDefaults(zoneKey = "all") {
  const zone = zoneKey || "all";
  const assignedRoleKeyByZone = {
    all: "event_floor_manager",
    cornerbar: "cornerbar_manager",
    atrium: "atrium_manager",
    workbar: "workbar_manager",
    runners: "headrunner",
    bar: "bar_staff",
    support: "support",
    backstage: "support",
    project_rooms: "support",
    other: "other",
  };
  return {
    zone,
    assignedRoleKey: assignedRoleKeyByZone[zone] || "",
    priority: zone === "all" ? "normal" : "important",
  };
}

function userIdentityNames(user) {
  const names = [
    user?.operatorName,
    user?.name,
    user?.staffName,
    user?.displayName,
    user?.display_name,
    user?.authDisplayName,
    user?.baseName,
  ];
  if (user?.email) names.push(String(user.email).split("@")[0]);
  return [...new Set(names.map(normalizedPersonName).filter(Boolean))];
}

function assignmentMatchesUser(assignment, user) {
  const authUserId = user?.authUserId || user?.backendUserId || user?.id || "";
  const names = userIdentityNames(user);
  if (assignment.assignedAuthUserId && authUserId)
    return assignment.assignedAuthUserId === authUserId;
  if (assignment.assignedAuthUserId) return false;
  return Boolean(
    assignment.assignedOperatorName &&
    names.includes(normalizedPersonName(assignment.assignedOperatorName)),
  );
}

function assignmentMatchesPerson(assignment, roleKey, operatorName, authUserId = "") {
  if (!assignment.active || assignment.roleKey !== roleKey) return false;
  if (assignment.assignedAuthUserId && authUserId)
    return assignment.assignedAuthUserId === authUserId;
  if (assignment.assignedAuthUserId || authUserId) return false;
  const normalizedOperatorName = normalizedPersonName(operatorName);
  return Boolean(
    normalizedOperatorName &&
    assignment.assignedOperatorName &&
    normalizedPersonName(assignment.assignedOperatorName) === normalizedOperatorName
  );
}

function commandRoleAssignments(assignments, roleKey, zone = "") {
  return assignments.filter((assignment) => {
    if (!assignment.active || assignment.roleKey !== roleKey) return false;
    if (!zone || zone === "all") return true;
    return eventRoleEffectiveZone(roleKey, assignment.zone) === zone;
  });
}

function eventZoneForTask(task) {
  if (task.zone && task.zone !== "all") return task.zone;
  return eventRoleEffectiveZone(task.assignedRoleKey, task.zone);
}

function taskProgress(tasks) {
  const now = Date.now();
  return {
    total: tasks.length,
    pending: tasks.filter((task) => (task.status || "pending") === "pending").length,
    acknowledged: tasks.filter((task) => task.status === "acknowledged").length,
    done: tasks.filter((task) => task.status === "done").length,
    dueNow: tasks.filter(
      (task) =>
        isOpenEventTask(task) &&
        task.dueAt &&
        new Date(task.dueAt).getTime() <= now,
    ).length,
    critical: tasks.filter(
      (task) => isOpenEventTask(task) && task.priority === "critical",
    ).length,
  };
}

function commandZoneSummary(zoneConfig, assignments, tasks) {
  const managerAssignments = commandRoleAssignments(
    assignments,
    zoneConfig.managerRole,
    zoneConfig.key,
  );
  const eventFloorTeamRoles = ["cornerbar_manager", "atrium_manager", "workbar_manager", "headrunner"];
  const staffAssignments = assignments.filter(
    (assignment) => {
      if (!assignment.active) return false;
      if (zoneConfig.key === "all" && eventFloorTeamRoles.includes(assignment.roleKey))
        return true;
      if (!zoneConfig.staffRoles.includes(assignment.roleKey)) return false;
      const assignmentZone = eventRoleEffectiveZone(assignment.roleKey, assignment.zone);
      return assignmentZone === zoneConfig.key || (zoneConfig.key !== "all" && assignmentZone === "all");
    },
  );
  const zoneTasks = tasks.filter((task) => {
    if (zoneConfig.key === "all") return task.zone === "all" || !task.zone;
    return eventZoneForTask(task) === zoneConfig.key;
  });
  return {
    ...zoneConfig,
    managerAssignments,
    staffAssignments,
    tasks: zoneTasks,
    progress: taskProgress(zoneTasks),
  };
}

function userCommandAssignments(assignments, user) {
  return assignments.filter(
    (assignment) =>
      assignment.active &&
      assignmentMatchesUser(assignment, user) &&
      ["cornerbar_manager", "atrium_manager", "workbar_manager", "headrunner"].includes(assignment.roleKey),
  );
}

function preferredEventBoardId(events, currentId = "") {
  if (!events.length) return "";
  if (currentId && events.some((event) => event.id === currentId)) return currentId;
  return (
    events.find((event) => event.status === "active")?.id ||
    events.find((event) => event.status === "draft")?.id ||
    events[0]?.id ||
    ""
  );
}

async function playEventTaskBeep() {
  if (typeof window === "undefined") return false;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return false;
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.45);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.5);
  await new Promise((resolve) => {
    oscillator.onended = resolve;
  });
  await context.close().catch(() => {});
  return true;
}

function showEventTaskBrowserNotification(alert) {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (window.Notification.permission !== "granted") return false;
  const notification = new window.Notification(alert.title, {
    body: alert.body,
    tag: alert.id,
    renotify: true,
  });
  notification.onclick = () => {
    window.focus();
    notification.close();
  };
  return true;
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

function isOptionalTask(task) {
  return (
    task.optional === true ||
    task.shiftType === "monthly" ||
    ["monthly", "quiet_time"].includes(task.recurring?.type)
  );
}

function normalizeGuide(guide) {
  return {
    id: guide.id || slug(guide.title || "guide"),
    title: guide.title || "Guide",
    category: guide.category || "Guide",
    area: guide.area || "general",
    body: guide.body || "",
    steps: Array.isArray(guide.steps) ? guide.steps : [],
    images: Array.isArray(guide.images) ? guide.images : [],
    relatedTaskIds: Array.isArray(guide.relatedTaskIds)
      ? guide.relatedTaskIds
      : [],
    tags: Array.isArray(guide.tags) ? guide.tags : [],
  };
}

function findGuideById(guideId) {
  if (!guideId) return null;
  return knowledgeBase.map(normalizeGuide).find((guide) => guide.id === guideId);
}

function getTaskImages(task, guide) {
  const guideImages = Array.isArray(guide?.images) ? guide.images : [];
  const taskRefs = [
    ...(Array.isArray(task.imageIds) ? task.imageIds : []),
    ...(Array.isArray(task.imageRefs) ? task.imageRefs : []),
  ];
  const directTaskImages = taskRefs
    .filter((ref) => ref && !guideImages.some((image) => image.id === ref))
    .map((ref) => ({
      id: ref,
      label: "Task image",
      src: "",
    }));
  return [
    ...(taskRefs.length
      ? guideImages.filter((image) => taskRefs.includes(image.id))
      : guideImages),
    ...directTaskImages,
  ];
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
      operatorName: log.operatorName || log.operator_name || log.completedBy || "",
      operatorSource: log.operatorSource || log.operator_source || "",
      operatorRoleLabel: log.operatorRoleLabel || log.operator_role_label || "",
      authDisplayName: log.authDisplayName || log.auth_display_name || "",
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
          operatorName:
            note.operatorName || note.operator_name || note.completedBy || "",
          operatorSource: note.operatorSource || note.operator_source || "",
          operatorRoleLabel:
            note.operatorRoleLabel || note.operator_role_label || "",
          authDisplayName: note.authDisplayName || note.auth_display_name || "",
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
  const isSharedDevice = Boolean(profile.is_shared_device);
  return {
    id: `auth-${profile.id}`,
    name: displayName,
    role,
    code: profile.staff_code_alias || "",
    isManager: role === "manager" && !isSharedDevice,
    isEventFloorManager: role === "event_floor_manager",
    needsName: role === "time2staff",
    active: profile.active !== false,
    profile,
    isSharedDevice,
    is_shared_device: isSharedDevice,
    sharedDeviceLabel: profile.shared_device_label || displayName,
    shared_device_label: profile.shared_device_label || displayName,
    backendUserId: profile.id,
    authUserId: authUser?.id || profile.id,
    organizationId: profile.organization_id || "",
    organization_id: profile.organization_id || "",
    profileActive: profile.active !== false,
    loginSource: "supabase_auth",
    authSessionVerified: Boolean(authUser?.id && profile.id === authUser.id),
    email: authUser?.email || "",
  };
}

function normalizeOperator(operator) {
  if (!operator || typeof operator !== "object") return null;
  const name = String(operator.name || "").trim().replace(/\s+/g, " ");
  if (!name) return null;
  return {
    name,
    source: operator.source || "unknown",
    roleLabel: operator.roleLabel || "",
    setAt: operator.setAt || new Date().toISOString(),
    setByAuthUserId: operator.setByAuthUserId || "",
  };
}

function getEffectiveActor(user, currentOperator) {
  const operator = normalizeOperator(currentOperator);
  const authDisplayName = user?.name || user?.email || "Unknown auth user";
  const sharedDevice = isSharedDeviceUser(user);
  return {
    authUserId: user?.authUserId || user?.backendUserId || user?.id || "",
    authDisplayName,
    authLoginSource: user?.loginSource || "unknown",
    operatorName: operator?.name || (sharedDevice ? "" : authDisplayName || "Unknown operator"),
    operatorSource: operator?.source || user?.loginSource || "unknown",
    operatorRoleLabel: operator?.roleLabel || "",
    isSharedDevice: sharedDevice,
  };
}

function userForActor(user, actor) {
  if (!actor?.isSharedDevice) return user;
  return {
    ...user,
    name: actor.operatorName,
    staffName: actor.operatorName,
    baseName: user?.name || "",
    operatorName: actor.operatorName,
    operatorSource: actor.operatorSource,
    operatorRoleLabel: actor.operatorRoleLabel,
    authDisplayName: actor.authDisplayName,
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

function hasSiteCoordinates(siteSettings) {
  return Boolean(siteSettings?.latitude && siteSettings?.longitude);
}

function getSiteAccessGuardStatus({
  shiftId,
  user,
  siteSettings,
  siteAccess,
  activeOverride,
}) {
  if (!protectedSiteAccessShifts.has(shiftId)) {
    return { allowed: true, blocked: false, message: "" };
  }
  if (!siteSettings.locationCheckEnabled) {
    return {
      allowed: true,
      blocked: false,
      message: "Location check off.",
    };
  }
  if (!hasSiteCoordinates(siteSettings)) {
    return {
      allowed: true,
      blocked: false,
      warning: true,
      message: "Location guard not configured.",
    };
  }
  if (
    activeOverride &&
    siteSettings.managerOverrideEnabled &&
    isManager(user)
  ) {
    return {
      allowed: true,
      blocked: false,
      override: true,
      message: `Temporary manager override active until ${formatDateTime(activeOverride.expiresAt)}.`,
    };
  }
  if (siteAccess.status === "on_site") {
    return {
      allowed: true,
      blocked: false,
      message: "On site.",
    };
  }
  if (siteAccess.status === "away") {
    return {
      allowed: false,
      blocked: true,
      message:
        "This operational shift requires being at Youngs. Guides remain available.",
    };
  }
  return {
    allowed: false,
    blocked: true,
    message:
      "Check your location before starting this operational shift. Guides remain available.",
  };
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
  const requiredTasks = tasks.filter((task) => !isOptionalTask(task));
  const done = tasks.filter(
    (task) => logsByTask[task.id]?.status === "done",
  ).length;
  const notRelevant = tasks.filter(
    (task) => logsByTask[task.id]?.status === "not_relevant",
  ).length;
  const handled = done + notRelevant;
  const requiredHandled = requiredTasks.filter((task) =>
    isHandled(logsByTask[task.id]),
  ).length;
  const missing = Math.max(requiredTasks.length - requiredHandled, 0);
  const criticalMissing = requiredTasks.filter(
    (task) => task.priority === "critical" && !isHandled(logsByTask[task.id]),
  ).length;
  return {
    done,
    notRelevant,
    handled,
    missing,
    criticalMissing,
    requiredTotal: requiredTasks.length,
    optionalTotal: tasks.length - requiredTasks.length,
  };
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
  onPasswordRecoveryRequest,
  authStatus,
  onAuthSignOut,
  loginNotice,
}) {
  const [mode, setMode] = useState("staff_code");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workerName, setWorkerName] = useState("");
  const [pendingUser, setPendingUser] = useState(null);
  const [error, setError] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionPendingRef = useRef(false);

  function finishLogin(user) {
    saveStorage(SESSION_KEY, user);
    onLogin(user);
  }

  async function submit(event) {
    event.preventDefault();
    setError("");

    if (mode === "password_recovery") {
      const normalizedEmail = normalizeAuthEmail(email);
      if (!normalizedEmail) {
        setError("Add your email address.");
        return;
      }
      if (submissionPendingRef.current) return;
      submissionPendingRef.current = true;
      setIsSubmitting(true);
      let result = {
        ok: false,
        error: "A reset email could not be requested right now. Wait a minute and try again.",
      };
      try {
        result = await onPasswordRecoveryRequest(normalizedEmail);
      } finally {
        submissionPendingRef.current = false;
        setIsSubmitting(false);
      }
      if (result.ok) {
        setRecoveryMessage(PASSWORD_RECOVERY_NEUTRAL_SUCCESS);
      } else {
        setError(result.error);
      }
      return;
    }

    if (mode === "email") {
      const normalizedEmail = normalizeAuthEmail(email);
      if (!normalizedEmail || !password) {
        setError("Add email and password.");
        return;
      }
      if (submissionPendingRef.current) return;
      submissionPendingRef.current = true;
      setIsSubmitting(true);
      let result = { ok: false, error: "Email login could not be completed." };
      try {
        result = await onSupabaseLogin(normalizedEmail, password);
      } finally {
        submissionPendingRef.current = false;
        setIsSubmitting(false);
      }
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
        <h1>{mode === "password_recovery" ? "Reset password" : "Shift checklist"}</h1>
        <p className="muted">
          {mode === "password_recovery"
            ? "Enter your email address. We will send a password reset link if it belongs to an account."
            : pendingUser
            ? "Use your real first name. This is saved with completed tasks."
            : "Enter your staff code. Ask manager if you need access."}
        </p>
        {loginNotice && mode !== "password_recovery" && (
          <p className="status-message" role="status">{loginNotice}</p>
        )}
        {isLocalhostRuntime() && (
          <p className="muted">
            Local testing tip: use separate browsers/profiles for Robert, Julie and Workbar Device because localhost shares one auth session.
          </p>
        )}
        {mode !== "password_recovery" && (
        <div className="login-mode-tabs" role="tablist" aria-label="Login mode">
          <button
            type="button"
            className={mode === "staff_code" ? "active" : ""}
            onClick={() => {
              setMode("staff_code");
              setError("");
              setRecoveryMessage("");
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
              setRecoveryMessage("");
            }}
          >
            Email login
          </button>
        </div>
        )}
        <form onSubmit={submit} className="login-form">
          {mode === "password_recovery" ? (
            <>
              <label htmlFor="recovery-email">Email</label>
              <input
                id="recovery-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
                disabled={isSubmitting}
              />
              {recoveryMessage && (
                <p className="status-message" role="status">{recoveryMessage}</p>
              )}
              {!isSupabaseAuthConfigured && (
                <p className="error">Password recovery is not configured.</p>
              )}
            </>
          ) : mode === "email" ? (
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
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setMode("password_recovery");
                  setPassword("");
                  setError("");
                  setRecoveryMessage("");
                }}
              >
                Forgot password?
              </button>
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
          {mode === "password_recovery" && (
            <button
              type="button"
              className="ghost-button"
              disabled={isSubmitting}
              onClick={() => {
                setMode("email");
                setError("");
                setRecoveryMessage("");
              }}
            >
              Back to login
            </button>
          )}
          <button
            type="submit"
            className="primary-button"
            disabled={isSubmitting || (mode === "password_recovery" && Boolean(recoveryMessage))}
          >
            {mode === "password_recovery"
              ? isSubmitting
                ? "Sending reset link..."
                : recoveryMessage
                  ? "Reset link requested"
                  : "Send password reset link"
              : mode === "email"
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

function PasswordUpdateForm({
  onUpdatePassword,
  onCancel,
  submitLabel = "Change password",
  successMessage = "Password updated.",
  onSuccess,
}) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionPendingRef = useRef(false);

  async function submit(event) {
    event.preventDefault();
    if (submissionPendingRef.current) return;
    submissionPendingRef.current = true;
    setError("");
    setMessage("");
    setIsSubmitting(true);
    let result = { ok: false, message: "The password could not be changed." };
    try {
      result = await performPasswordUpdate({
        newPassword,
        confirmation,
        updatePassword: onUpdatePassword,
      });
    } finally {
      submissionPendingRef.current = false;
      setIsSubmitting(false);
    }
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setNewPassword("");
    setConfirmation("");
    setMessage(successMessage);
    onSuccess?.();
  }

  return (
    <form className="login-form password-update-form" onSubmit={submit}>
      <label htmlFor="new-password">New password</label>
      <div className="password-field-row">
        <input
          id="new-password"
          type={showPasswords ? "text" : "password"}
          autoComplete="new-password"
          minLength={AUTH_PASSWORD_MIN_LENGTH}
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          disabled={isSubmitting}
        />
        <button
          type="button"
          className="ghost-button compact-button"
          aria-pressed={showPasswords}
          onClick={() => setShowPasswords((current) => !current)}
          disabled={isSubmitting}
        >
          {showPasswords ? "Hide" : "Show"}
        </button>
      </div>
      <label htmlFor="confirm-new-password">Confirm new password</label>
      <input
        id="confirm-new-password"
        type={showPasswords ? "text" : "password"}
        autoComplete="new-password"
        minLength={AUTH_PASSWORD_MIN_LENGTH}
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        disabled={isSubmitting}
      />
      <p className="muted password-requirement">
        Use at least {AUTH_PASSWORD_MIN_LENGTH} characters. Additional Supabase password rules also apply.
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="status-message" role="status">{message}</p>}
      <div className="backup-actions password-actions">
        {onCancel && (
          <button
            type="button"
            className="ghost-button"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </button>
        )}
        <button type="submit" className="primary-button" disabled={isSubmitting}>
          {isSubmitting ? "Updating password..." : submitLabel}
        </button>
      </div>
    </form>
  );
}

function PasswordRecoveryScreen({ state, onUpdatePassword, onReturnToLogin }) {
  if (state.status === "checking") {
    return (
      <main className="login-shell auth-gate-shell">
        <section className="login-panel" role="status" aria-busy="true">
          <p className="eyebrow">Account security</p>
          <h1>Checking reset link</h1>
          <p className="muted">Please wait while the password recovery session is verified.</p>
        </section>
      </main>
    );
  }

  if (state.status === "invalid") {
    return (
      <main className="login-shell auth-gate-shell">
        <section className="login-panel">
          <p className="eyebrow">Account security</p>
          <h1>Reset link unavailable</h1>
          <p className="error" role="alert">
            {state.message || "This password reset link is invalid, expired, or has already been used."}
          </p>
          <button type="button" className="primary-button" onClick={onReturnToLogin}>
            Return to login
          </button>
        </section>
      </main>
    );
  }

  if (state.status === "completion_error") {
    return (
      <main className="login-shell auth-gate-shell">
        <section className="login-panel">
          <p className="eyebrow">Account security</p>
          <h1>Password updated</h1>
          <p className="error" role="alert">{state.message}</p>
          <button type="button" className="primary-button" onClick={onReturnToLogin}>
            Try returning to login
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="login-shell auth-gate-shell">
      <section className="login-panel">
        <p className="eyebrow">Account security</p>
        <h1>Set new password</h1>
        <p className="muted">
          Choose a new password for your Mesh Shift Log account. Operational screens remain hidden until recovery is complete.
        </p>
        <PasswordUpdateForm
          onUpdatePassword={onUpdatePassword}
          onCancel={onReturnToLogin}
          submitLabel="Set new password"
        />
      </section>
    </main>
  );
}

function AccountSecurityDialog({ onClose, onUpdatePassword }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="account-security-title">
      <section className="pilot-modal account-security-modal">
        <p className="eyebrow">Account</p>
        <h1 id="account-security-title">Account security</h1>
        <p>Change the password for your currently signed-in account.</p>
        <PasswordUpdateForm
          onUpdatePassword={onUpdatePassword}
          onCancel={onClose}
          successMessage="Password updated successfully."
        />
      </section>
    </div>
  );
}

function TopBar({
  user,
  selectedShift,
  currentRoleMode,
  currentShiftScope,
  currentOperator,
  onChangeOperator,
  onChangeRole,
  onBack,
  onLogout,
  isOnline,
  siteAccessStatus,
  onOpenInventory,
  onOpenAccountSecurity,
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const topBarRef = useRef(null);
  useEffect(() => {
    if (!mobileMenuOpen) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    const closeOnOutsidePress = (event) => {
      if (!topBarRef.current?.contains(event.target)) setMobileMenuOpen(false);
    };

    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsidePress);
    };
  }, [mobileMenuOpen]);

  const runMenuAction = (action) => {
    setMobileMenuOpen(false);
    action?.();
  };
  const shiftLabel =
    selectedShift === "manager"
      ? "Manager dashboard"
      : selectedShift === "inventory"
        ? "Stock Count"
      : shiftOptions.find((shift) => shift.id === selectedShift)?.label ||
        "Select shift";
  return (
    <header className="top-bar" ref={topBarRef}>
      <div className="top-user">
        <strong>{user.name}</strong>
        <span>{user.role}</span>
        {isSharedDeviceUser(user) && (
          <span>
            Workbar Device login
            {currentOperator?.name
              ? ` | Working as: ${currentOperator.name}${currentOperator.roleLabel ? ` - ${currentOperator.roleLabel}` : ""}`
              : " | Choose operator"}
          </span>
        )}
      </div>
      <div className="top-mobile-summary">
        <span className={`top-connection ${isOnline ? "online" : "offline"}`}>
          <span className="top-online-dot" aria-hidden="true" />
          {isOnline ? "Live" : "Offline"}
        </span>
        <button type="button" className="ghost-button top-menu-toggle" aria-label={`${mobileMenuOpen ? "Close" : "Open"} account menu`} aria-expanded={mobileMenuOpen} aria-controls="top-account-actions" onClick={() => setMobileMenuOpen((open) => !open)}>
          {mobileMenuOpen ? "Close" : "Menu"}
        </button>
      </div>
      <div id="top-account-actions" className={`top-actions ${mobileMenuOpen ? "mobile-open" : ""}`}>
        {isSharedDeviceUser(user) && (
          <button
            type="button"
            className="ghost-button"
            onClick={() => runMenuAction(onChangeOperator)}
          >
            Change operator
          </button>
        )}
        {currentRoleMode && onChangeRole && (
          <button
            type="button"
            className="ghost-button"
            onClick={() => runMenuAction(onChangeRole)}
          >
            Change role
          </button>
        )}
        <span className={`pilot-status ${isOnline ? "online" : "offline"}`}>
          Local pilot | {isOnline ? "Online" : "Offline - local data available"}
        </span>
        {currentRoleMode?.label && (
          <span className="shift-pill">{currentRoleMode.label}</span>
        )}
        {currentShiftScope?.label && (
          <span className="shift-pill">{currentShiftScope.label}</span>
        )}
        <span className={`shift-pill site-${siteAccessStatus}`}>
          {siteStatuses[siteAccessStatus] || "Location unknown"}
        </span>
        {onOpenInventory && (
          <button
            type="button"
            className="ghost-button"
            disabled={isSharedDeviceUser(user) && !currentOperator?.name}
            onClick={() => runMenuAction(onOpenInventory)}
          >
            Stock Count
          </button>
        )}
        {selectedShift && <span className="shift-pill">{shiftLabel}</span>}
        {selectedShift && onBack && (
          <button type="button" className="ghost-button" onClick={() => runMenuAction(onBack)}>
            Change shift
          </button>
        )}
        {onOpenAccountSecurity && (
          <button
            type="button"
            className="ghost-button"
            onClick={() => runMenuAction(onOpenAccountSecurity)}
          >
            Account security
          </button>
        )}
        <button type="button" className="ghost-button" onClick={() => runMenuAction(onLogout)}>
          Log out
        </button>
      </div>
    </header>
  );
}

function RoleLauncher({ user, onSelectRole }) {
  const [message, setMessage] = useState("");
  async function chooseRole(roleMode) {
    setMessage("");
    const result = await onSelectRole(roleMode);
    if (result?.ok === false || result?.allowed === false)
      setMessage(result.message);
  }

  return (
    <main className="page">
      <section className="intro compact role-launcher-intro">
        <p className="eyebrow">Welcome, {user.display_name || user.name}</p>
        <h1>What are you doing today?</h1>
        <p className="muted">
          Choose a role for this Oslo day. You can change it later.
        </p>
        {message && <p className="critical-warning">{message}</p>}
      </section>
      <section className="shift-grid role-launcher-grid">
        {roleModeOptions.map((option) => (
          <button
            key={option.roleMode}
            type="button"
            className="shift-card role-card"
            onClick={() => chooseRole(option.roleMode)}
          >
            <span>{option.label}</span>
            <small>{option.description}</small>
          </button>
        ))}
      </section>
    </main>
  );
}

const operatorRoleLabelOptions = [
  { label: "Opening shift", shiftId: "opening" },
  { label: "Daytime shift", shiftId: "daytime" },
  { label: "Closing shift", shiftId: "closing" },
  { label: "Double shift / Opening + Closing", shiftId: "double_opening_closing" },
  { label: "Event shift", shiftId: "event" },
  { label: "Training shift", shiftId: "training" },
  { label: "Extra / support shift", shiftId: "support" },
  { label: "Monthly / quiet-time tasks", shiftId: "monthly" },
];

function shiftIdForOperatorRoleLabel(roleLabel) {
  return (
    operatorRoleLabelOptions.find((option) => option.label === roleLabel)
      ?.shiftId || ""
  );
}

function OperatorPanel({ user, staffUsers, currentOperator, onSave, onOpenGuides }) {
  const [name, setName] = useState(currentOperator?.name || "");
  const [roleLabel, setRoleLabel] = useState(
    currentOperator?.roleLabel || "Opening shift",
  );
  const [error, setError] = useState("");
  const osloTime = getOsloTimeParts();
  const selectedShiftId =
    operatorRoleLabelOptions.find((option) => option.label === roleLabel)
      ?.shiftId || "";
  const selectedAccess = getShiftAccessStatus(selectedShiftId, user);

  async function save(event) {
    event.preventDefault();
    setError("");
    if (!selectedAccess.allowed) {
      setError(selectedAccess.message);
      return;
    }
    const operator = {
      name: name.trim().replace(/\s+/g, " "),
      source: "time2staff",
      roleLabel,
    };
    if (!operator.name || operator.name.length < 2) {
      setError("Add the real name of the person working this shift.");
      return;
    }
    const result = await onSave({
      ...operator,
      setAt: new Date().toISOString(),
      setByAuthUserId: user?.authUserId || user?.backendUserId || "",
    });
    if (result?.ok === false || result?.allowed === false)
      setError(result.message);
  }

  return (
    <section className="operator-panel">
      <p className="eyebrow">Workbar Device login</p>
      <h2>Who is working this shift?</h2>
      <p className="muted">
        The device stays logged in for backend sync. Completed work is saved
        under the actual operator name.
      </p>
      <p className="muted">Oslo time now: {osloTime.label}</p>
      <form className="editor-form" onSubmit={save}>
        <div className="operator-form-grid">
          <label>
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="First name"
              autoComplete="given-name"
            />
          </label>
          <label>
            Shift
            <select
              value={roleLabel}
              onChange={(event) => setRoleLabel(event.target.value)}
            >
              {operatorRoleLabelOptions.map((option) => (
                <option
                  key={option.label}
                  value={option.label}
                  disabled={!getShiftAccessStatus(option.shiftId, user).allowed}
                >
                  {option.label}
                </option>
              ))}
            </select>
            {selectedAccess.blocked && (
              <small className="field-help">{selectedAccess.message}</small>
            )}
          </label>
          <div className="readonly-field">
            <span>Operator type</span>
            <strong>Time2Staff</strong>
          </div>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="operator-actions">
          <button type="submit" className="primary-button">
            Continue
          </button>
          {onOpenGuides && (
            <button type="button" className="ghost-button" onClick={onOpenGuides}>
              Open guides
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

function EventCodeGeneratorPanel({ user }) {
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  if (!canGenerateEventCode(user)) return null;

  async function generateCode() {
    setBusy(true);
    setMessage("");
    const nextResult = await generateDailyEventCode();
    setBusy(false);
    setResult(nextResult.ok ? nextResult : null);
    setMessage(nextResult.message || "");
  }

  async function copyCode() {
    if (!result?.code) return;
    try {
      await navigator.clipboard.writeText(result.code);
      setMessage("Event code copied.");
    } catch {
      setMessage("Could not copy automatically. Select the code and copy it.");
    }
  }

  return (
    <section className="manager-list event-code-panel">
      <p className="eyebrow">Daily event code</p>
      <h2>Generate today's event code</h2>
      <p className="muted">
        Share this only with today's event staff. The code is shown once here
        and is stored hashed in Supabase.
      </p>
      <div className="backup-actions">
        <button
          type="button"
          className="primary-button compact-button"
          onClick={generateCode}
          disabled={busy}
        >
          {busy ? "Generating..." : "Generate today's event code"}
        </button>
        {result?.code && (
          <button
            type="button"
            className="ghost-button compact-button"
            onClick={copyCode}
          >
            Copy code
          </button>
        )}
      </div>
      {result?.code && (
        <div className="event-code-display">
          <span>Today's code</span>
          <strong>{result.code}</strong>
          <small>
            Oslo date {result.codeDate || getOsloDateKey()} | Expires{" "}
            {result.expiresAt ? formatDateTime(result.expiresAt) : "end of Oslo day"}
          </small>
        </div>
      )}
      {message && <p className={result?.ok ? "all-clear" : "muted"}>{message}</p>}
      <small className="muted">
        Logged in as {user.name}. Shared-device accounts cannot generate codes.
      </small>
    </section>
  );
}

function EventCodeGate({
  user,
  currentOperator,
  onUnlock,
  onCancel,
  onGuides,
}) {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const osloDate = getOsloDateKey();
  const osloTime = getOsloTimeParts();

  async function submit(event) {
    event.preventDefault();
    setMessage("");
    if (!code.trim()) {
      setMessage("Enter today's event code.");
      return;
    }
    setBusy(true);
    const result = await validateDailyEventCode(code.trim());
    setBusy(false);
    if (!result.valid) {
      setMessage(
        result.message ||
          "Event code could not be validated. Ask event responsible.",
      );
      return;
    }
    onUnlock({
      codeDate: result.codeDate || osloDate,
      validatedAt: new Date().toISOString(),
      operatorName: currentOperator?.name || user?.name || "",
      authUserId: user?.authUserId || user?.backendUserId || "",
      expiresAt: result.expiresAt || "",
    });
  }

  return (
    <main className="page">
      <section className="operator-panel">
        <p className="eyebrow">Event shift</p>
        <h2>Enter today's event code</h2>
        <p className="muted">
          Ask event responsible if you do not have the code. Oslo time:{" "}
          {osloTime.label}
        </p>
        <form className="editor-form" onSubmit={submit}>
          <label>
            Event code
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6 digit code"
            />
          </label>
          {message && <p className="error">{message}</p>}
          <div className="operator-actions">
            <button type="submit" className="primary-button" disabled={busy}>
              {busy ? "Checking..." : "Continue"}
            </button>
            {onGuides && (
              <button type="button" className="ghost-button" onClick={onGuides}>
                Open guides
              </button>
            )}
            <button type="button" className="ghost-button" onClick={onCancel}>
              Choose another shift
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

function EventMode({
  user,
  currentOperator,
  eventOperations,
  eventStaffPresence,
  eventRoleAssignments,
  eventTasks,
  eventHandovers,
  eventLiveUpdates,
  eventRealtimeStatus,
  onUpdateTaskStatus,
  eventTaskAlertState,
  taskActionStatus,
  alertsEnabled,
  notificationPermission,
  onEnableAlerts,
  onRefresh,
  onCreateLiveUpdate,
  onChangeLiveUpdateStatus,
  onChangeOperator,
  onOpenGuides,
  onOpenGuide,
}) {
  const [showRoleCockpit, setShowRoleCockpit] = useState(false);
  const activeEventId = preferredEventBoardId(
    eventOperations.filter((event) => ["draft", "active"].includes(event.status || "draft")),
  );
  const activeEvent = eventOperations.find((event) => event.id === activeEventId);
  const operatorName = currentOperator?.name || user?.operatorName || user?.name || "Operator";
  const myTasks = assignedEventTasksForUser(
    activeEvent ? [activeEvent] : eventOperations,
    eventRoleAssignments,
    eventTasks,
    user,
  );
  const activeEventAssignments = eventRoleAssignments.filter(
    (assignment) => assignment.active && (!activeEvent?.id || assignment.eventId === activeEvent.id),
  );
  const groupedTasks = groupAssignedEventTasks(myTasks);

  if (showRoleCockpit && activeEvent) {
    return (
      <main className="page event-mode-page">
        <Suspense fallback={<FocusedViewLoading label="Loading My Event Cockpit..." />}>
          <EventOperationsCockpit
            user={user}
            eventOperation={activeEvent}
            eventTasks={eventTasks.filter((task) => task.eventId === activeEvent.id)}
            assignments={activeEventAssignments}
            presence={eventStaffPresence}
            handovers={eventHandovers.filter((handover) => handover.eventId === activeEvent.id)}
            liveUpdates={eventLiveUpdates.filter((update) => update.eventId === activeEvent.id)}
            managerView={false}
            backendStatus={eventRealtimeStatus}
            onClose={() => setShowRoleCockpit(false)}
            onRefresh={onRefresh}
            onTaskStatus={onUpdateTaskStatus}
            onCreateLiveUpdate={onCreateLiveUpdate}
            onAcknowledgeLiveUpdate={(id) => onChangeLiveUpdateStatus(id, "acknowledged")}
            onResolveLiveUpdate={(id, note) => onChangeLiveUpdateStatus(id, "resolved", note)}
            onOpenGuide={onOpenGuide}
            onNavigate={() => setShowRoleCockpit(false)}
          />
        </Suspense>
      </main>
    );
  }

  return (
    <main className="page event-mode-page">
      <section className="intro compact event-mode-hero">
        <p className="eyebrow">Event Mode</p>
        <h1>{activeEvent?.title || "Event shift"}</h1>
        <p className="muted">
          {activeEvent?.venue || "No event venue set"}
          {activeEvent?.startsAt ? ` | ${formatDateTime(activeEvent.startsAt)}` : ""}
          {activeEvent?.endsAt ? ` - ${formatDateTime(activeEvent.endsAt)}` : ""}
        </p>
        <p className="status-message">Current operator: {operatorName}</p>
        <div className="backup-actions event-mode-actions">
          {activeEvent && (
            <button type="button" className="primary-button compact-button" onClick={() => setShowRoleCockpit(true)}>
              Open My Event Cockpit
            </button>
          )}
          <button type="button" className="primary-button compact-button" onClick={onRefresh}>
            Refresh event tasks
          </button>
          <button type="button" className="ghost-button compact-button" onClick={onChangeOperator}>
            Change operator
          </button>
          <button type="button" className="ghost-button compact-button" onClick={onOpenGuides}>
            Guides
          </button>
        </div>
        <GuideQuickLinks
          onOpenGuide={onOpenGuide}
          links={[
            { id: "how-event-mode-works", label: "How Event Mode works" },
            { id: "event-operations-troubleshooting", label: "Troubleshooting" },
          ]}
        />
        <EventRoleGuideLinks
          assignments={activeEventAssignments}
          user={user}
          onOpenGuide={onOpenGuide}
        />
      </section>

      <MyZoneCommandPanel
        user={user}
        eventOperations={activeEvent ? [activeEvent] : eventOperations}
        eventRoleAssignments={eventRoleAssignments}
        eventTasks={eventTasks}
        onUpdateTaskStatus={onUpdateTaskStatus}
        taskActionStatus={taskActionStatus}
        onOpenGuide={onOpenGuide}
      />

      <section className="manager-list">
        <h2>My event tasks</h2>
        <p className="muted">Only tasks for your name, your event role, or all event staff.</p>
        <EventTaskAlertSettingsCard
          alertsEnabled={alertsEnabled}
          notificationPermission={notificationPermission}
          onEnableAlerts={onEnableAlerts}
          onRefresh={onRefresh}
        />
        {myTasks.length === 0 && (
          <p className="muted">No tasks assigned to your role/person right now.</p>
        )}
        {groupedTasks.map(([title, tasks]) => (
          <div key={title} className="critical-group">
            <h3>{title}</h3>
            {tasks.length === 0 && <p className="muted">None.</p>}
            {tasks.map((task) => {
              const reminderSent = Boolean(
                task.remindAt && eventTaskAlertState[eventTaskAlertKey(user, task, "reminder")],
              );
              const dueSent = Boolean(
                task.dueAt && eventTaskAlertState[eventTaskAlertKey(user, task, "due")],
              );
              const actionStatus = taskActionStatus?.[task.id];
              const actionPending = ["acknowledging", "completing"].includes(actionStatus?.status);
              return (
                <article key={task.id} className={`log-row priority-${task.priority}`}>
                  <strong>{task.title}</strong>
                  <span>
                    {task.zone || "all"} | {taskAssignedLabel(task)} |{" "}
                    <span className={`event-task-status-chip status-${task.status || "pending"}`}>
                      {task.status === "acknowledged" ? "Acknowledged" : task.status || "pending"}
                    </span>
                  </span>
                  <small>
                    {eventTaskTimingLabel(task)}
                    {task.remindAt ? ` | reminder ${formatDateTime(task.remindAt)}` : ""}
                    {reminderSent ? " | Reminder sent" : ""}
                    {dueSent ? " | Due alert sent" : ""}
                  </small>
                  {task.description && <small>{task.description}</small>}
                  {task.acknowledgedByName && (
                    <small>
                      Acknowledged by {task.acknowledgedByName}
                      {task.acknowledgedAt ? ` at ${formatDateTime(task.acknowledgedAt)}` : ""}
                    </small>
                  )}
                  {actionStatus?.message && (
                    <small className={actionStatus.type === "error" ? "critical-warning" : actionStatus.type === "success" ? "all-clear" : "status-message"}>
                      {actionStatus.message}
                    </small>
                  )}
                  <div className="backup-actions">
                    <button
                      type="button"
                      className="ghost-button compact-button"
                      onClick={() => onUpdateTaskStatus(task.id, "acknowledged", "")}
                      disabled={actionPending || task.status === "acknowledged" || task.status === "done"}
                    >
                      {actionStatus?.status === "acknowledging" ? "Acknowledging..." : "Acknowledge"}
                    </button>
                    <button
                      type="button"
                      className="primary-button compact-button"
                      onClick={() => onUpdateTaskStatus(task.id, "done", "")}
                      disabled={actionPending || task.status === "done"}
                    >
                      {actionStatus?.status === "completing" ? "Completing..." : "Mark done"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ))}
      </section>
    </main>
  );
}

function ShiftPicker({
  user,
  onSelect,
  onCheckShiftAccess,
  onManager,
  routines,
  logs,
  handoverNotes,
  responsibleAssignments,
}) {
  const date = todayKey();
  const [shiftAccessMessage, setShiftAccessMessage] = useState("");
  const osloTime = getOsloTimeParts();
  function shiftStatus(shiftType) {
    if (shiftType === "guides") return "Quick reference";
    const tasks = flattenTasks(routines, shiftType, date);
    const shiftLogs = logs.filter(
      (log) => log.date === date && log.shiftType === shiftType,
    );
    const logsByTask = Object.fromEntries(
      shiftLogs.map((log) => [log.taskId, log]),
    );
    const stats = getShiftStats(tasks, logsByTask);
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
    if (["weekly", "monthly", "other_support"].includes(shiftType))
      return `${stats.handled}/${tasks.length} handled${stats.optionalTotal ? " | optional" : ""}`;
    return `${stats.handled}/${tasks.length} handled | ${stats.criticalMissing} critical | handover ${hasHandover ? "yes" : "no"}${responsibleText}`;
  }

  async function selectShift(shiftId) {
    const access = getShiftAccessStatus(shiftId, user);
    if (!access.allowed) {
      setShiftAccessMessage(
        shiftId === "opening"
          ? "Opening shift is closed for today after 11:00 Oslo time."
          : "Closing shift is not available before 11:00 Oslo time.",
      );
      return;
    }
    if (onCheckShiftAccess) {
      const siteAccessResult = await onCheckShiftAccess(shiftId);
      if (!siteAccessResult.allowed) {
        setShiftAccessMessage(siteAccessResult.message);
        return;
      }
      if (siteAccessResult.warning) {
        setShiftAccessMessage(siteAccessResult.message);
      } else {
        setShiftAccessMessage("");
      }
    } else {
      setShiftAccessMessage("");
    }
    const result = await onSelect(shiftId);
    if (result?.ok === false || result?.allowed === false)
      setShiftAccessMessage(result.message);
  }

  return (
    <main className="page">
      <section className="intro">
        <p className="eyebrow">{new Date().toLocaleDateString()}</p>
        <h1>Start today's routines</h1>
        <p className="muted">
          {user.name} | Oslo time: {osloTime.label}
        </p>
        {shiftAccessMessage && (
          <p className="critical-warning">{shiftAccessMessage}</p>
        )}
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
          (() => {
            const access = getShiftAccessStatus(shift.id, user);
            return (
              <button
                key={shift.id}
                className={`shift-card ${access.blocked && !access.allowed ? "blocked-shift" : ""}`}
                type="button"
                aria-disabled={access.blocked && !access.allowed}
                onClick={() => selectShift(shift.id)}
              >
                <span>{shift.label}</span>
                <small>
                  {shiftStatus(shift.id)}
                  {access.managerOverride
                    ? " | manager override"
                    : access.blocked
                      ? ` | ${access.message}`
                      : ""}
                </small>
              </button>
            );
          })()
        ))}
        <button
          className="shift-card"
          type="button"
          onClick={() => selectShift("double_opening_closing")}
        >
          <span>Double shift / Opening + Closing</span>
          <small>Work both opening and closing within time rules</small>
        </button>
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

function GuideImages({ images = [] }) {
  const [failedImages, setFailedImages] = useState({});
  if (!images.length) {
    return (
      <div className="image-placeholder">
        Image placeholder - add final photo later.
      </div>
    );
  }
  return (
    <div className="guide-images">
      {images.map((image) => {
        const imageKey = image.id || image.src || image.label;
        const hasImage = image.src && !failedImages[imageKey];
        return (
          <figure key={imageKey} className="guide-image-frame">
            {hasImage ? (
              <img
                src={image.src}
                alt={image.label || "Guide image"}
                onError={() =>
                  setFailedImages((current) => ({
                    ...current,
                    [imageKey]: true,
                  }))
                }
              />
            ) : (
              <div className="image-placeholder">
                Image placeholder - add final photo later.
              </div>
            )}
            {image.label && <figcaption>{image.label}</figcaption>}
          </figure>
        );
      })}
    </div>
  );
}

function GuideCard({ guide, compact = false }) {
  const normalizedGuide = normalizeGuide(guide);
  return (
    <article className={`guide-card ${compact ? "compact-guide" : ""}`}>
      <div className="guide-card-header">
        <div>
          <p className="eyebrow">{normalizedGuide.category}</p>
          <h2>{normalizedGuide.title}</h2>
        </div>
        <span>{normalizedGuide.area}</span>
      </div>
      <p>{normalizedGuide.body}</p>
      {normalizedGuide.steps.length > 0 && (
        <ol className="guide-steps">
          {normalizedGuide.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}
      {normalizedGuide.images.length > 0 && (
        <GuideImages images={normalizedGuide.images} />
      )}
      {normalizedGuide.tags.length > 0 && (
        <div className="task-labels">
          {normalizedGuide.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      )}
    </article>
  );
}

function GuideQuickLinks({ links = [], onOpenGuide }) {
  if (!onOpenGuide || !links.length) return null;
  return (
    <div className="guide-quick-links">
      {links.map((link) => (
        <button
          key={link.id}
          type="button"
          className="ghost-button compact-button"
          onClick={() => onOpenGuide(link.id)}
        >
          {link.label}
        </button>
      ))}
    </div>
  );
}

function EventRoleGuideLinks({ assignments = [], user, onOpenGuide }) {
  const roleGuideMap = {
    event_floor_manager: "event-floor-manager-live-control",
    cornerbar_manager: "cornerbar-manager-event-role",
    atrium_manager: "atrium-manager-event-role",
    workbar_manager: "workbar-manager-event-role",
    headrunner: "headrunner-runner-control",
    runner: "runner-event-role",
    cornerbar_staff: "bar-staff-zone-staff-event-tasks",
    atrium_staff: "bar-staff-zone-staff-event-tasks",
    workbar_staff: "bar-staff-zone-staff-event-tasks",
    bar_staff: "bar-staff-zone-staff-event-tasks",
    support: "support-event-role",
    other: "support-event-role",
  };
  const links = [];
  eventRolesForPerson(
    { operatorName: user?.operatorName || user?.name, authUserId: user?.authUserId || user?.backendUserId || user?.id },
    assignments,
  ).forEach((assignment) => {
    const guideId = roleGuideMap[assignment.roleKey];
    const label = guideId ? `Guide: ${eventRoleLabel(assignment.roleKey)}` : "";
    if (guideId && !links.some((link) => link.id === guideId)) links.push({ id: guideId, label });
  });
  if (!links.length) links.push({ id: "bar-staff-zone-staff-event-tasks", label: "Guide: Event staff" });
  return <GuideQuickLinks links={links} onOpenGuide={onOpenGuide} />;
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
      operatorName: user.operatorName || user.name,
      operatorSource: user.operatorSource || user.loginSource || "",
      operatorRoleLabel: user.operatorRoleLabel || "",
      authDisplayName: user.authDisplayName || user.name,
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
      completedBy: user.name,
      operatorName: user.operatorName || user.name,
      operatorSource: user.operatorSource || user.loginSource || "",
      operatorRoleLabel: user.operatorRoleLabel || "",
      authDisplayName: user.authDisplayName || user.name,
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
  eventOperations,
  eventStaffPresence,
  eventRoleAssignments,
  eventTasks,
  eventLiveUpdates,
  cashSignoffs,
  assetChecks,
  alertBackendStatus,
  currentShiftScope,
  eventAccessIsValid,
  canShowEventCodeStatus,
  siteAccessStatus,
  siteAccessLabel,
  osloTimeLabel,
  onOpenMyShift,
  onOpenGuides,
  onChangeShift,
  onUpdateEventTaskStatus,
  eventTaskAlertState,
  taskActionStatus,
  eventTaskAlertsEnabled,
  eventTaskNotificationPermission,
  eventActorReadyForAlerts = false,
  onEnableEventTaskAlerts,
  onRefreshEventOperations,
  onOpenEventCockpit,
  refreshAlerts,
  onAlert,
}) {
  const date = todayKey();
  const safeTaskActionStatus = taskActionStatus || {};
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
  const tomorrowDate = new Date(`${date}T00:00:00`);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowKey = tomorrowDate.toISOString().slice(0, 10);
  const todayEventOps = eventOperations.filter((event) => event.date === date);
  const todayRelevantEventOps = todayEventOps
    .filter((event) => !["cancelled", "canceled"].includes(event.status || ""))
    .sort(
      (a, b) =>
        eventBoardPriority(a) - eventBoardPriority(b) ||
        new Date(b.updatedAt || b.createdAt || b.startsAt || 0) -
          new Date(a.updatedAt || a.createdAt || a.startsAt || 0),
    );
  const tomorrowEventOps = eventOperations.filter((event) => event.date === tomorrowKey);
  const overviewEventIds = new Set(
    [...todayEventOps, ...tomorrowEventOps].map((event) => event.id),
  );
  const todayRoleEventIds = new Set(
    (todayRelevantEventOps.length ? todayRelevantEventOps : todayEventOps).map((event) => event.id),
  );
  const overviewEventAssignments = eventRoleAssignments.filter((assignment) =>
    overviewEventIds.has(assignment.eventId),
  );
  const overviewEventTasks = eventTasks.filter((task) =>
    overviewEventIds.has(task.eventId),
  );
  const todayRoleAssignments = eventRoleAssignments.filter((assignment) =>
    todayRoleEventIds.has(assignment.eventId),
  );
  const todayRoleTasks = eventTasks.filter((task) =>
    todayRoleEventIds.has(task.eventId),
  );
  const matchedTodayRoleAssignments = todayRoleAssignments.filter(
    (assignment) => assignment.active && assignmentMatchesUser(assignment, user),
  );
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
    onRefreshEventOperations?.("staff_dashboard_open");
  }, []);

  return (
    <main className="page">
      <section className="intro compact">
        <p className="eyebrow">{new Date().toLocaleDateString()}</p>
        <h1>Today's overview</h1>
        <p className="muted">Active user: {user.name}</p>
        <p className="muted">
          Oslo time: {osloTimeLabel}
          {currentShiftScope?.label ? ` | Current scope: ${currentShiftScope.label}` : ""}
          {siteAccessLabel ? ` | Site access: ${siteAccessLabel}` : ""}
        </p>
        <p className="muted">
          Thanks to everyone keeping the day moving. Completed tasks are shown
          for transparency, not competition.
        </p>
        <div className="inline-actions">
          {currentShiftScope && (
            <button
              type="button"
              className="primary-button compact-button"
              onClick={onOpenMyShift}
            >
              My shift
            </button>
          )}
          <button
            type="button"
            className="ghost-button compact-button"
            onClick={onOpenGuides}
          >
            Guides
          </button>
          <button
            type="button"
            className="ghost-button compact-button"
            onClick={onChangeShift}
          >
            Change shift
          </button>
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
        {canShowEventCodeStatus && (
          <p className="muted">
            Daily event code: {eventAccessIsValid ? "validated for this session" : "not validated for this session"}
          </p>
        )}
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
        <h2>Event operations overview</h2>
        <p className="muted">Shared operational status from the selected event board.</p>
        {[["Today", todayEventOps], ["Tomorrow", tomorrowEventOps]].map(([label, eventList]) => (
          <div key={label} className="critical-group">
            <h3>{label}</h3>
            {eventList.length === 0 && <p className="muted">No event operations board created.</p>}
            {eventList.map((event) => {
              const tasks = eventTasks.filter((task) => task.eventId === event.id);
              const done = tasks.filter((task) => task.status === "done").length;
              const criticalOpen = tasks.filter((task) => task.priority === "critical" && task.status !== "done").length;
              return (
                <article key={event.id} className="log-row">
                  <strong>{event.title}</strong>
                  <span>
                    {event.venue || "No venue"} | {event.status} | Responsible{" "}
                    {event.activeResponsibleName || "not set"}
                  </span>
                  <small>
                    {event.startsAt ? formatDateTime(event.startsAt) : "No start"} | tasks {done}/{tasks.length}
                    {criticalOpen ? ` | critical open ${criticalOpen}` : ""}
                  </small>
                </article>
              );
            })}
          </div>
        ))}
      </section>

      {todayRelevantEventOps[0] && (
        <Suspense fallback={<FocusedViewLoading label="Loading Event Cockpit summary..." />}>
          <EventCockpitSummaryCard
            eventOperation={todayRelevantEventOps[0]}
            eventTasks={eventTasks.filter((task) => task.eventId === todayRelevantEventOps[0].id)}
            assignments={eventRoleAssignments.filter((assignment) => assignment.eventId === todayRelevantEventOps[0].id && assignment.active)}
            presence={eventStaffPresence}
            liveUpdates={eventLiveUpdates.filter((update) => update.eventId === todayRelevantEventOps[0].id)}
            onOpen={onOpenEventCockpit}
          />
        </Suspense>
      )}

      {(todayEventOps.length > 0 || tomorrowEventOps.length > 0) && (
        <EventCommandStructurePanel
          assignments={overviewEventAssignments}
          tasks={overviewEventTasks}
          compact
        />
      )}

      {eventActorReadyForAlerts && (
        <>
          <MyZoneCommandPanel
            user={user}
            eventOperations={todayRelevantEventOps.length ? todayRelevantEventOps : todayEventOps}
            eventRoleAssignments={todayRoleAssignments}
            eventTasks={todayRoleTasks}
            onUpdateTaskStatus={onUpdateEventTaskStatus}
            taskActionStatus={safeTaskActionStatus}
          />
          {isLocalhostRuntime() && (
            <p className="muted">
              Local My Zone debug: actor {user.operatorName || user.name || "unknown"} | auth{" "}
              {user.authUserId || user.backendUserId || user.id || "none"} | today boards{" "}
              {todayRoleEventIds.size} | role assignments {todayRoleAssignments.length} | matched{" "}
              {matchedTodayRoleAssignments.map((assignment) => eventRoleLabel(assignment.roleKey)).join(", ") || "none"}
            </p>
          )}

          <MyEventTasksPanel
            user={user}
            eventOperations={eventOperations}
            eventRoleAssignments={eventRoleAssignments}
            eventTasks={eventTasks}
            onUpdateTaskStatus={onUpdateEventTaskStatus}
            eventTaskAlertState={eventTaskAlertState}
            taskActionStatus={safeTaskActionStatus}
            alertsEnabled={eventTaskAlertsEnabled}
            notificationPermission={eventTaskNotificationPermission}
            onEnableAlerts={onEnableEventTaskAlerts}
            onRefresh={() => onRefreshEventOperations?.("manual")}
          />
        </>
      )}

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

function EventTaskAlertBanner({
  alerts,
  alertsEnabled,
  notificationPermission,
  taskActionStatus,
  onEnableAlerts,
  onAcknowledge,
  onDone,
  onOpenTasks,
  onDismiss,
}) {
  if (!alerts.length) return null;
  const activeAlert = alerts[0];
  const activeStatus = taskActionStatus?.[activeAlert.taskId];
  const actionPending = ["acknowledging", "completing"].includes(activeStatus?.status);
  return (
    <section className={`event-task-alert-banner ${activeAlert.type === "due" ? "due" : "reminder"}`}>
      <div>
        <p className="eyebrow">{activeAlert.type === "due" ? "Event task due now" : "Event task reminder"}</p>
        <h2>{activeAlert.title}</h2>
        <p>
          {activeAlert.body}
          {activeAlert.zone ? ` | Zone: ${activeAlert.zone}` : ""}
        </p>
        <small>
          Due {activeAlert.dueAt ? formatDateTime(activeAlert.dueAt) : "not set"}
          {activeAlert.assignedTo ? ` | ${activeAlert.assignedTo}` : ""}
        </small>
        {!alertsEnabled && (
          <small>
            Sound/browser alerts are off. In-app alerts will still appear.
          </small>
        )}
        {notificationPermission === "denied" && (
          <small>Browser notifications are blocked in this browser.</small>
        )}
        {activeStatus?.message && (
          <small className={activeStatus.type === "error" ? "critical-warning" : activeStatus.type === "success" ? "all-clear" : "status-message"}>
            {activeStatus.message}
          </small>
        )}
      </div>
      <div className="event-task-alert-actions">
        {!alertsEnabled && (
          <button type="button" className="ghost-button compact-button" onClick={onEnableAlerts}>
            Enable task alerts
          </button>
        )}
        <button type="button" className="ghost-button compact-button" onClick={() => onAcknowledge(activeAlert.taskId, activeAlert.id)} disabled={actionPending}>
          {activeStatus?.status === "acknowledging" ? "Acknowledging..." : "Acknowledge"}
        </button>
        <button type="button" className="primary-button compact-button" onClick={() => onDone(activeAlert.taskId, activeAlert.id)} disabled={actionPending}>
          {activeStatus?.status === "completing" ? "Completing..." : "Mark done"}
        </button>
        <button type="button" className="ghost-button compact-button" onClick={onOpenTasks}>
          Open My Event Tasks
        </button>
        <button type="button" className="ghost-button compact-button" onClick={() => onDismiss(activeAlert.id)}>
          Dismiss
        </button>
      </div>
      {alerts.length > 1 && <small>{alerts.length - 1} more event task alert(s) waiting.</small>}
    </section>
  );
}

function EventTaskAlertSettingsCard({
  alertsEnabled,
  notificationPermission,
  onEnableAlerts,
  onRefresh,
}) {
  return (
    <article className="event-task-alert-settings">
      <div>
        <strong>Event task alerts</strong>
        <p className="muted">
          {alertsEnabled
            ? "Enabled on this device. The app will use in-app alerts, sound, vibration and browser notifications where supported."
            : "Enable sound/browser task alerts on this device. In-app alerts work even if browser notifications are blocked."}
        </p>
        {notificationPermission && notificationPermission !== "default" && (
          <small>Browser notification permission: {notificationPermission}</small>
        )}
      </div>
      <div className="inline-actions">
        <button type="button" className="primary-button compact-button" onClick={onEnableAlerts}>
          Enable event task alerts
        </button>
        <button type="button" className="ghost-button compact-button" onClick={onRefresh}>
          Refresh event tasks
        </button>
      </div>
    </article>
  );
}

function MyEventTasksPanel({
  user,
  eventOperations,
  eventRoleAssignments,
  eventTasks,
  onUpdateTaskStatus,
  eventTaskAlertState,
  taskActionStatus,
  alertsEnabled,
  notificationPermission,
  onEnableAlerts,
  onRefresh,
}) {
  const [comments, setComments] = useState({});
  const activeEvents = eventOperations.filter((event) =>
    ["draft", "active"].includes(event.status || "draft"),
  );
  const myTasks = assignedEventTasksForUser(
    activeEvents,
    eventRoleAssignments,
    eventTasks,
    user,
  );
  const taskGroups = groupAssignedEventTasks(myTasks);

  return (
    <section className="manager-list">
      <h2>My event tasks</h2>
      <p className="muted">
        Assigned event tasks only. You can acknowledge or complete these, but
        cannot reassign or edit the event board.
      </p>
      <EventTaskAlertSettingsCard
        alertsEnabled={alertsEnabled}
        notificationPermission={notificationPermission}
        onEnableAlerts={onEnableAlerts}
        onRefresh={onRefresh}
      />
      {myTasks.length === 0 && (
        <p className="muted">No event tasks assigned to you right now.</p>
      )}
      {taskGroups.map(([groupTitle, tasks]) => (
        <div key={groupTitle} className="critical-group">
          <h3>{groupTitle}</h3>
          {tasks.length === 0 && <p className="muted">None.</p>}
          {tasks.map((task) => {
            const event = activeEvents.find((item) => item.id === task.eventId);
            const reminderSent = Boolean(
              task.remindAt && eventTaskAlertState[eventTaskAlertKey(user, task, "reminder")],
            );
            const dueSent = Boolean(
              task.dueAt && eventTaskAlertState[eventTaskAlertKey(user, task, "due")],
            );
            const actionStatus = taskActionStatus?.[task.id];
            const actionPending = ["acknowledging", "completing"].includes(actionStatus?.status);
            return (
              <article key={task.id} className={`log-row priority-${task.priority}`}>
                <strong>{task.title}</strong>
                <span>
                  {event?.title || "Event"} | {task.zone || "all"} |{" "}
                  {eventTaskStatuses.includes(task.status) ? task.status : "pending"}
                </span>
                <small>
                  {eventTaskTimingLabel(task)}
                  {task.remindAt ? ` | reminder ${formatDateTime(task.remindAt)}` : ""}
                  {reminderSent ? " | Reminder sent" : ""}
                  {dueSent ? " | Due alert sent" : ""}
                </small>
                {task.acknowledgedByName && (
                  <small>
                    Acknowledged by {task.acknowledgedByName}
                    {task.acknowledgedAt ? ` at ${formatDateTime(task.acknowledgedAt)}` : ""}
                  </small>
                )}
                {actionStatus?.message && (
                  <small className={actionStatus.type === "error" ? "critical-warning" : actionStatus.type === "success" ? "all-clear" : "status-message"}>
                    {actionStatus.message}
                  </small>
                )}
                {task.description && <small>{task.description}</small>}
                <label>
                  Completion comment
                  <textarea
                    rows="2"
                    value={comments[task.id] || ""}
                    onChange={(eventValue) =>
                      setComments((current) => ({
                        ...current,
                        [task.id]: eventValue.target.value,
                      }))
                    }
                  />
                </label>
                <div className="backup-actions">
                  <button
                    type="button"
                    className="ghost-button compact-button"
                    onClick={() =>
                      onUpdateTaskStatus(task.id, "acknowledged", comments[task.id] || "")
                    }
                    disabled={actionPending || task.status === "acknowledged" || task.status === "done"}
                  >
                    {actionStatus?.status === "acknowledging" ? "Acknowledging..." : "Acknowledge"}
                  </button>
                  <button
                    type="button"
                    className="primary-button compact-button"
                    onClick={() =>
                      onUpdateTaskStatus(task.id, "done", comments[task.id] || "")
                    }
                    disabled={actionPending || task.status === "done"}
                  >
                    {actionStatus?.status === "completing" ? "Completing..." : "Mark done"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ))}
    </section>
  );
}

function EventCommandStructurePanel({
  assignments,
  tasks,
  onCreateTaskForZone,
  canManage = false,
  compact = false,
}) {
  const summaries = eventCommandZones.map((zone) =>
    commandZoneSummary(zone, assignments, tasks),
  );
  const eventFloorManager = commandRoleAssignments(
    assignments,
    "event_floor_manager",
    "all",
  )[0];

  return (
    <section id="event-command-structure" className="manager-list command-structure-panel">
      <h2>{compact ? "Event command structure" : "Command Structure"}</h2>
      <p className="muted">
        Event Floor Manager coordinates zone managers and Headrunner. Team roles can have multiple people.
      </p>
      {eventFloorManager && (
        <article className="overview-card">
          <strong>Event Floor Manager: {eventFloorManager.assignedOperatorName || "Assigned"}</strong>
          <span>Reports to Hospitality Operations Manager / Robert.</span>
        </article>
      )}
      <div className="command-grid">
        {summaries.map((zone) => (
          <article key={zone.key} className="command-card">
            <div className="alert-header">
              <strong>{zone.label}</strong>
              <span>{zone.progress.total} task(s)</span>
            </div>
            <div className="command-line">
              <span>Lead</span>
              <strong>{assignmentNames(zone.managerAssignments).join(", ") || "Not assigned"}</strong>
            </div>
            <div className="command-line">
              <span>Team</span>
              <strong>{assignmentNames(zone.staffAssignments).join(", ") || "No team assigned"}</strong>
            </div>
            <div className="progress-breakdown">
              <span>Pending {zone.progress.pending}</span>
              <span>Ack {zone.progress.acknowledged}</span>
              <span>Done {zone.progress.done}</span>
              <span>Due now {zone.progress.dueNow}</span>
              <span>Critical {zone.progress.critical}</span>
            </div>
            {canManage && (
              <button
                type="button"
                className="ghost-button compact-button"
                onClick={() => onCreateTaskForZone?.(zone.key)}
              >
                Create task for {zone.label}
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function MyZoneCommandPanel({
  user,
  eventOperations,
  eventRoleAssignments,
  eventTasks,
  onUpdateTaskStatus,
  taskActionStatus,
  onOpenGuide,
}) {
  const visibleEventIds = new Set([
    ...eventOperations.map((event) => event.id),
    ...eventRoleAssignments.map((assignment) => assignment.eventId),
    ...eventTasks.map((task) => task.eventId),
  ].filter(Boolean));
  const activeAssignments = eventRoleAssignments.filter(
    (assignment) => assignment.active && visibleEventIds.has(assignment.eventId),
  );
  const myCommandAssignments = userCommandAssignments(activeAssignments, user);
  const myTeamAssignments = activeAssignments.filter((assignment) => assignmentMatchesUser(assignment, user));
  const visibleAssignments = myCommandAssignments.length ? myCommandAssignments : myTeamAssignments;
  if (!visibleAssignments.length) return null;

  const relatedTasks = eventTasks.filter(
    (task) => visibleEventIds.has(task.eventId) && eventTaskMatchesUser(task, activeAssignments, user),
  );
  const grouped = groupAssignedEventTasks(relatedTasks);

  return (
    <section className="manager-list">
      <h2>{myCommandAssignments.length ? "My Zone" : "My Event Role"}</h2>
      <EventRoleGuideLinks
        assignments={visibleAssignments}
        user={user}
        onOpenGuide={onOpenGuide}
      />
      {visibleAssignments.map((assignment) => {
        const commandZone = eventCommandZones.find((zone) => zone.managerRole === assignment.roleKey);
        const teamAssignments = commandZone
          ? activeAssignments.filter(
              (item) =>
                item.eventId === assignment.eventId &&
                commandZone.staffRoles.includes(item.roleKey) &&
                (eventRoleEffectiveZone(item.roleKey, item.zone) === commandZone.key ||
                  (commandZone.key !== "all" &&
                    eventRoleEffectiveZone(item.roleKey, item.zone) === "all")),
            )
          : [];
        const progress = commandZone
          ? taskProgress(
              relatedTasks.filter((task) =>
                assignment.roleKey === "headrunner"
                  ? task.assignedRoleKey === "runner" || eventZoneForTask(task) === "runners"
                  : eventZoneForTask(task) === commandZone.key,
              ),
            )
          : null;
        return (
          <article key={assignment.id} className="overview-card">
            <strong>{eventRoleLabel(assignment.roleKey)}</strong>
            <span>Reports to {eventRoleOption(assignment.roleKey)?.reportsTo || "Event Floor Manager"}</span>
            <span>Zone: {zoneDisplayLabel(eventRoleEffectiveZone(assignment.roleKey, assignment.zone))}</span>
            {commandZone && (
              <small>
                Team:{" "}
                {assignmentNames(teamAssignments).join(", ") || "No team assigned yet"}
                {progress
                  ? ` | Tasks pending ${progress.pending}, acknowledged ${progress.acknowledged}, done ${progress.done}`
                  : ""}
              </small>
            )}
          </article>
        );
      })}
      {myCommandAssignments.length > 0 && (
        <p className="muted">Zone task delegation will be added in a later phase.</p>
      )}
      {grouped.map(([title, tasks]) => (
        <div key={title} className="critical-group">
          <h3>{title}</h3>
          {tasks.length === 0 && <p className="muted">None.</p>}
          {tasks.map((task) => {
            const actionStatus = taskActionStatus?.[task.id];
            const actionPending = ["acknowledging", "completing"].includes(actionStatus?.status);
            const canUpdateTask = eventTaskMatchesUser(task, activeAssignments, user);
            return (
              <article key={task.id} className={`log-row priority-${task.priority}`}>
                <strong>{task.title}</strong>
                <span>
                  {task.zone || "all"} | {task.assignedOperatorName || eventRoleLabel(task.assignedRoleKey) || "Role task"} | {task.status || "pending"}
                </span>
                <small>{eventTaskTimingLabel(task)}</small>
                {!canUpdateTask && <small>Read-only zone task. Assign it to your name or role to update it.</small>}
                {actionStatus?.message && (
                  <small className={actionStatus.type === "error" ? "critical-warning" : actionStatus.type === "success" ? "all-clear" : "status-message"}>
                    {actionStatus.message}
                  </small>
                )}
                <div className="backup-actions">
                  <button
                    type="button"
                    className="ghost-button compact-button"
                    onClick={() => onUpdateTaskStatus(task.id, "acknowledged", "")}
                    disabled={!canUpdateTask || actionPending || task.status === "acknowledged" || task.status === "done"}
                  >
                    {actionStatus?.status === "acknowledging" ? "Acknowledging..." : "Acknowledge"}
                  </button>
                  <button
                    type="button"
                    className="primary-button compact-button"
                    onClick={() => onUpdateTaskStatus(task.id, "done", "")}
                    disabled={!canUpdateTask || actionPending || task.status === "done"}
                  >
                    {actionStatus?.status === "completing" ? "Completing..." : "Mark done"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ))}
    </section>
  );
}

function EventRunSheetTemplatesPanel({
  activeEvent,
  eventAssignments = [],
  eventTasks,
  onCreateTask,
  createdByName,
  onOpenGuide,
}) {
  const defaultSetup = {
    zones: {
      all: true,
      workbar: true,
      cornerbar: false,
      atrium: false,
      runners: false,
      support: true,
      other: false,
    },
    service: {
      bar: true,
      runners: false,
      table: false,
      coffee: false,
      food: false,
      tech: false,
      conference: false,
      football: false,
    },
    roles: {
      event_floor_manager: true,
      headrunner: false,
      runner: false,
      workbar_manager: true,
      workbar_staff: true,
      cornerbar_manager: false,
      cornerbar_staff: false,
      atrium_manager: false,
      atrium_staff: false,
      bar_staff: true,
      support: true,
    },
  };
  const [selectedTemplateId, setSelectedTemplateId] = useState(eventTaskTemplates[0]?.id || "");
  const [excludedTaskIds, setExcludedTaskIds] = useState([]);
  const [manualIncludedTaskIds, setManualIncludedTaskIds] = useState([]);
  const [taskEdits, setTaskEdits] = useState({});
  const [setup, setSetup] = useState(defaultSetup);
  const [allowDuplicateApply, setAllowDuplicateApply] = useState(false);
  const [confirmUntimedTasks, setConfirmUntimedTasks] = useState(false);
  const [applyStatus, setApplyStatus] = useState({ type: "", message: "" });
  const [applying, setApplying] = useState(false);
  const selectedTemplate =
    eventTaskTemplates.find((template) => template.id === selectedTemplateId) ||
    eventTaskTemplates[0];
  const generatedPreviewTasks = buildTemplateTaskPreview(selectedTemplate, activeEvent);
  const activeRoleKeys = new Set(eventAssignments.filter((assignment) => assignment.active).map((assignment) => assignment.roleKey));
  function setupIncludesTask(task) {
    const zone = task.zone || "all";
    const role = task.assignedRoleKey || "";
    if (zone !== "all" && !setup.zones[zone]) return false;
    if (["headrunner", "runner"].includes(role) && !setup.service.runners) return false;
    if (role && setup.roles[role] === false) return false;
    if (task.id?.includes("coffee") && !setup.service.coffee) return false;
    if ((task.id?.includes("food") || task.id?.includes("catering")) && !setup.service.food) return false;
    if ((task.id?.includes("tech") || task.id?.includes("signage")) && !setup.service.tech && !setup.service.conference) return false;
    if (task.id?.includes("conference") && !setup.service.conference) return false;
    if (task.id?.includes("football") && !setup.service.football) return false;
    return true;
  }
  function routeTemplateTask(task) {
    const fallbackRoles = {
      cornerbar_manager: "cornerbar_staff",
      atrium_manager: "atrium_staff",
      workbar_manager: "workbar_staff",
      headrunner: "runner",
    };
    const fallbackRole = fallbackRoles[task.assignedRoleKey];
    if (fallbackRole && !activeRoleKeys.has(task.assignedRoleKey)) {
      return {
        ...task,
        assignedRoleKey: fallbackRole,
        audience: fallbackRole,
        roleLabel: eventRoleLabel(fallbackRole),
        routingNote: `${eventRoleLabel(task.assignedRoleKey)} is not assigned, so this task will target ${eventRoleLabel(fallbackRole)}.`,
      };
    }
    return task;
  }
  const previewTasks = generatedPreviewTasks.map((task) => {
    const edit = taskEdits[task.templateTaskId] || {};
    const routedTask = routeTemplateTask({ ...task, ...edit });
    const setupIncluded = setupIncludesTask(routedTask);
    const manuallyIncluded = manualIncludedTaskIds.includes(task.templateTaskId);
    const manuallyExcluded = excludedTaskIds.includes(task.templateTaskId);
    return {
      ...routedTask,
      setupIncluded,
      included: manuallyIncluded || (setupIncluded && !manuallyExcluded),
    };
  });
  const includedPreviewTasks = previewTasks.filter((task) => task.included);
  const excludedBySetupCount = previewTasks.filter((task) => !task.setupIncluded && !task.included).length;
  const activeZoneLabels = Object.entries(setup.zones)
    .filter(([, enabled]) => enabled)
    .map(([zone]) => zoneDisplayLabel(zone));
  const targetedRoles = [
    ...new Set(includedPreviewTasks.map((task) => eventRoleLabel(task.assignedRoleKey)).filter(Boolean)),
  ];
  const existingTemplateTaskCount = activeEvent?.id
    ? eventTasks.filter((task) => task.metadata?.templateId === selectedTemplate?.id).length
    : 0;
  const hasMissingTiming = includedPreviewTasks.some((task) => task.timingMissing);
  const setupWarnings = [
    setup.zones.cornerbar && !activeRoleKeys.has("cornerbar_manager")
      ? "Cornerbar is active but no Cornerbar Manager is assigned. Cornerbar manager tasks may fall back to staff."
      : "",
    setup.zones.atrium && !activeRoleKeys.has("atrium_manager")
      ? "Atrium is active but no Atrium Manager is assigned. Atrium manager tasks may fall back to staff."
      : "",
    setup.zones.workbar && !activeRoleKeys.has("workbar_manager")
      ? "Workbar is active but no Workbar Manager is assigned. Workbar manager tasks may fall back to staff."
      : "",
    setup.zones.runners && !activeRoleKeys.has("headrunner")
      ? "Runners are active but no Headrunner is assigned. Runner coordination tasks may fall back to runners."
      : "",
  ].filter(Boolean);

  useEffect(() => {
    setExcludedTaskIds([]);
    setManualIncludedTaskIds([]);
    setTaskEdits({});
    setAllowDuplicateApply(false);
    setConfirmUntimedTasks(false);
    setApplyStatus({ type: "", message: "" });
  }, [selectedTemplateId, activeEvent?.id]);

  function togglePreviewTask(taskId) {
    const task = previewTasks.find((item) => item.templateTaskId === taskId);
    if (!task) return;
    if (task.included) {
      setManualIncludedTaskIds((current) => current.filter((item) => item !== taskId));
      setExcludedTaskIds((current) => current.includes(taskId) ? current : [...current, taskId]);
    } else {
      setExcludedTaskIds((current) => current.filter((item) => item !== taskId));
      setManualIncludedTaskIds((current) => current.includes(taskId) ? current : [...current, taskId]);
    }
  }

  function updatePreviewTask(taskId, patch) {
    setTaskEdits((current) => ({
      ...current,
      [taskId]: {
        ...(current[taskId] || {}),
        ...patch,
      },
    }));
  }

  function toggleSetup(group, key) {
    setSetup((current) => {
      const nextValue = !current[group][key];
      const next = {
        ...current,
        [group]: { ...current[group], [key]: nextValue },
      };
      if (group === "service" && key === "runners") {
        next.zones = { ...next.zones, runners: nextValue };
        next.roles = { ...next.roles, headrunner: nextValue, runner: nextValue };
      }
      if (group === "zones" && key === "runners") {
        next.service = { ...next.service, runners: nextValue };
        next.roles = { ...next.roles, headrunner: nextValue, runner: nextValue };
      }
      return next;
    });
  }

  async function applyTemplate() {
    setApplyStatus({ type: "", message: "" });
    if (!activeEvent?.id) {
      setApplyStatus({ type: "error", message: "Select or create an event board before applying a run sheet." });
      return;
    }
    if (!includedPreviewTasks.length) {
      setApplyStatus({ type: "error", message: "Keep at least one task in the preview before applying." });
      return;
    }
    if (existingTemplateTaskCount > 0 && !allowDuplicateApply) {
      setApplyStatus({
        type: "error",
        message: "This template may already have been applied to this event. Tick Apply again anyway to continue.",
      });
      return;
    }
    if (hasMissingTiming && !confirmUntimedTasks) {
      setApplyStatus({
        type: "error",
        message: "Event start/end time is missing for some tasks. Confirm untimed tasks before applying.",
      });
      return;
    }
    setApplying(true);
    const failures = [];
    try {
      for (let index = 0; index < includedPreviewTasks.length; index += 1) {
        const task = includedPreviewTasks[index];
        setApplyStatus({
          type: "pending",
          message: `Creating ${index + 1} of ${includedPreviewTasks.length}: ${task.title}`,
        });
        const result = await onCreateTask({
          eventId: activeEvent.id,
          title: task.title,
          description: task.description || "",
          dueAt: task.dueAt,
          remindAt: task.remindAt,
          zone: task.zone || "all",
          priority: task.priority || "normal",
          assignedRoleKey: task.assignedRoleKey === "all_event_staff" ? "" : task.assignedRoleKey || "",
          assignedOperatorName: "",
          status: "pending",
          createdByName,
          metadata: {
            templateId: selectedTemplate.id,
            templateTitle: selectedTemplate.title,
            templateTaskId: task.templateTaskId,
            audience:
              task.audience ||
              (task.assignedRoleKey === "all_event_staff" ? "all_event_staff" : task.assignedRoleKey || ""),
            setup: {
              zones: Object.entries(setup.zones).filter(([, enabled]) => enabled).map(([key]) => key),
              services: Object.entries(setup.service).filter(([, enabled]) => enabled).map(([key]) => key),
            },
          },
        });
        const record = result?.record || result;
        if (!result?.ok && !record?.id) failures.push(`${task.title}: ${result?.message || "Not created"}`);
      }
      if (failures.length) {
        setApplyStatus({
          type: "error",
          message: `Run sheet partly applied. Failed: ${failures.join("; ")}`,
        });
        return;
      }
      setAllowDuplicateApply(false);
      setApplyStatus({ type: "success", message: `${selectedTemplate.title} applied.` });
    } catch (error) {
      setApplyStatus({
        type: "error",
        message: error?.message || "Unexpected error while applying run sheet.",
      });
    } finally {
      setApplying(false);
    }
  }

  return (
    <section className="manager-list run-sheet-panel">
      <h2>Run Sheets / Templates</h2>
      <p className="muted">Assign people in Command Structure before or after applying this run sheet.</p>
      <GuideQuickLinks
        onOpenGuide={onOpenGuide}
        links={[
          { id: "how-to-use-run-sheets", label: "Guide: Run Sheets" },
          { id: "event-floor-manager-live-control", label: "Guide: Event Floor Manager" },
        ]}
      />
      {!activeEvent && (
        <p className="critical-warning">Select or create an event board before applying a run sheet.</p>
      )}
      <section className="run-sheet-setup">
        <h3>Run sheet setup</h3>
        <p className="muted">Choose what is active today. The preview will include matching tasks by default.</p>
        <div className="setup-grid">
          <fieldset>
            <legend>Active zones / bars</legend>
            {[
              ["all", "Event floor / general"],
              ["workbar", "Workbar"],
              ["cornerbar", "Cornerbar"],
              ["atrium", "Atrium pop-up bar"],
              ["runners", "Runners"],
              ["support", "Support"],
            ].map(([key, label]) => (
              <label key={key} className="check-row">
                <input type="checkbox" checked={setup.zones[key]} onChange={() => toggleSetup("zones", key)} />
                {label}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Service model</legend>
            {[
              ["bar", "Bar service only"],
              ["runners", "Runners active"],
              ["table", "Table service"],
              ["coffee", "Coffee/water station"],
              ["food", "Food/catering"],
              ["tech", "Technical setup / presentation"],
              ["conference", "Conference / meeting rooms"],
              ["football", "Football / screening"],
            ].map(([key, label]) => (
              <label key={key} className="check-row">
                <input type="checkbox" checked={setup.service[key]} onChange={() => toggleSetup("service", key)} />
                {label}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Expected roles</legend>
            {[
              ["event_floor_manager", "Event Floor Manager"],
              ["headrunner", "Headrunner"],
              ["runner", "Runners"],
              ["workbar_manager", "Workbar Manager"],
              ["workbar_staff", "Workbar Staff"],
              ["cornerbar_manager", "Cornerbar Manager"],
              ["cornerbar_staff", "Cornerbar Staff"],
              ["atrium_manager", "Atrium Manager"],
              ["atrium_staff", "Atrium Staff"],
              ["bar_staff", "Bar Staff"],
              ["support", "Support"],
            ].map(([key, label]) => (
              <label key={key} className="check-row">
                <input type="checkbox" checked={setup.roles[key]} onChange={() => toggleSetup("roles", key)} />
                {label}
              </label>
            ))}
          </fieldset>
        </div>
        {setupWarnings.length > 0 && (
          <div className="setup-warning-list">
            {setupWarnings.map((warning) => (
              <p key={warning} className="critical-warning">{warning}</p>
            ))}
          </div>
        )}
      </section>
      <div className="template-grid">
        {eventTaskTemplates.map((template) => {
          const zones = [...new Set(template.tasks.map((task) => zoneDisplayLabel(task.zone || "all")))];
          const roles = [...new Set(template.tasks.map((task) => eventRoleLabel(task.assignedRoleKey)).filter(Boolean))];
          return (
            <button
              key={template.id}
              type="button"
              className={`template-card ${template.id === selectedTemplate?.id ? "selected-template" : ""}`}
              onClick={() => setSelectedTemplateId(template.id)}
            >
              <strong>{template.title}</strong>
              <span>{template.description}</span>
              <small>{template.recommendedFor}</small>
              <small>{template.tasks.length} tasks | Zones: {zones.join(", ")}</small>
              <small>Roles: {roles.join(", ") || "Unassigned"}</small>
            </button>
          );
        })}
      </div>

      {selectedTemplate && (
        <section className="run-sheet-preview">
          <div className="section-heading static-heading">
            <p className="eyebrow">{selectedTemplate.category}</p>
            <h3>{selectedTemplate.title}</h3>
            <span>{includedPreviewTasks.length}/{previewTasks.length} tasks selected</span>
          </div>
          <p className="muted">
            Included {includedPreviewTasks.length}; excluded by setup {excludedBySetupCount}. Active zones: {activeZoneLabels.join(", ") || "none"}. Target roles: {targetedRoles.join(", ") || "none"}.
          </p>
          <p className="muted">
            Suggested roles: {selectedTemplate.suggestedRoles.join(", ")}
          </p>
          {includedPreviewTasks.length === 0 && (
            <p className="critical-warning">No tasks are included. Enable zones/roles or add tasks back before applying.</p>
          )}
          <p className="muted">
            These are preview tasks. They will be created when you apply the template.
          </p>
          {existingTemplateTaskCount > 0 && (
            <label className="check-row">
              <input
                type="checkbox"
                checked={allowDuplicateApply}
                onChange={(event) => setAllowDuplicateApply(event.target.checked)}
              />
              This template may already have been applied. Apply again anyway.
            </label>
          )}
          {hasMissingTiming && (
            <label className="check-row">
              <input
                type="checkbox"
                checked={confirmUntimedTasks}
                onChange={(event) => setConfirmUntimedTasks(event.target.checked)}
              />
              Create untimed tasks where event start/end time is missing.
            </label>
          )}
          <div className="run-sheet-task-list">
            {previewTasks.map((task) => {
              const included = !excludedTaskIds.includes(task.templateTaskId);
              return (
                <article key={task.templateTaskId} className={`log-row ${included ? "" : "muted-card"}`}>
                  <div className="preview-task-heading">
                    <strong>{task.title}</strong>
                    <button
                      type="button"
                      className="ghost-button compact-button"
                      onClick={() => togglePreviewTask(task.templateTaskId)}
                    >
                      {included ? "Remove from apply" : "Add back"}
                    </button>
                  </div>
                  <span>
                    {zoneDisplayLabel(task.zone)} | {task.roleLabel || "No role"} | {task.priority || "normal"}
                  </span>
                  {!task.setupIncluded && !included && (
                    <small>Excluded by setup. Add back to create this task anyway.</small>
                  )}
                  {task.routingNote && <small className="status-message">{task.routingNote}</small>}
                  <div className="preview-edit-grid">
                    <label>
                      Due
                      <input
                        type="datetime-local"
                        value={toDateTimeLocalValue(task.dueAt)}
                        onChange={(event) => {
                          const dueAt = fromDateTimeLocalValue(event.target.value);
                          updatePreviewTask(task.templateTaskId, {
                            dueAt,
                            remindAt:
                              dueAt && Number.isFinite(task.remindMinutesBefore)
                                ? addMinutesToIso(dueAt, -task.remindMinutesBefore)
                                : task.remindAt,
                          });
                        }}
                      />
                    </label>
                    <label>
                      Remind
                      <input
                        type="datetime-local"
                        value={toDateTimeLocalValue(task.remindAt)}
                        onChange={(event) =>
                          updatePreviewTask(task.templateTaskId, {
                            remindAt: fromDateTimeLocalValue(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Zone
                      <select
                        value={task.zone || "all"}
                        onChange={(event) => updatePreviewTask(task.templateTaskId, { zone: event.target.value })}
                      >
                        {eventZones.map((zone) => <option key={zone} value={zone}>{zoneDisplayLabel(zone)}</option>)}
                      </select>
                    </label>
                    <label>
                      Audience / role
                      <select
                        value={task.assignedRoleKey || ""}
                        onChange={(event) =>
                          updatePreviewTask(task.templateTaskId, {
                            assignedRoleKey: event.target.value,
                            roleLabel: eventRoleLabel(event.target.value),
                          })
                        }
                      >
                        <option value="">No role</option>
                        <option value="all_event_staff">All event staff</option>
                        {eventRoleOptions.map((role) => <option key={role.key} value={role.key}>{role.label}</option>)}
                      </select>
                    </label>
                  </div>
                  {task.description && <small>{task.description}</small>}
                </article>
              );
            })}
          </div>
          {applyStatus.message && (
            <p className={applyStatus.type === "error" ? "critical-warning" : applyStatus.type === "success" ? "all-clear" : "status-message"}>
              {applyStatus.message}
            </p>
          )}
          <button
            type="button"
            className="primary-button compact-button"
            onClick={applyTemplate}
            disabled={applying || !activeEvent?.id}
          >
            {applying ? "Applying run sheet..." : "Apply template"}
          </button>
        </section>
      )}
    </section>
  );
}

function EventLiveModePanel({
  user,
  activeEvent,
  eventAssignments,
  eventTasks,
  eventStaffPresence,
  onCreateTask,
  onUpdateTaskStatus,
  taskActionStatus,
  onOpenGuide,
  onOpenCockpit,
  onClose,
}) {
  const [zoneFilter, setZoneFilter] = useState("all");
  const [status, setStatus] = useState({ type: "", message: "" });
  const [sending, setSending] = useState(false);
  const [quickTask, setQuickTask] = useState({
    title: "",
    description: "",
    target: "all_event_staff",
    personName: "",
    zone: "all",
    priority: "important",
    dueInMinutes: "0",
    remindMinutesBefore: "",
    kind: "live_message",
  });
  const visibleTasks =
    zoneFilter === "all"
      ? eventTasks
      : eventTasks.filter((task) => eventZoneForTask(task) === zoneFilter || task.zone === zoneFilter);
  const timelineGroups = eventTaskTimelineGroups(visibleTasks);
  const activeStaff = dedupeEventStaffPresence(eventStaffPresence);

  async function sendLiveTask(event) {
    event.preventDefault();
    setStatus({ type: "", message: "" });
    if (!activeEvent?.id) {
      setStatus({ type: "error", message: "Select or create an event board before sending a live task." });
      return;
    }
    if (!quickTask.title.trim()) {
      setStatus({ type: "error", message: "Add a title or message first." });
      return;
    }
    if (quickTask.target === "person" && !quickTask.personName.trim()) {
      setStatus({ type: "error", message: "Choose a specific person or change the target." });
      return;
    }
    const dueAt = addMinutesToIso(new Date().toISOString(), Number(quickTask.dueInMinutes || 0));
    const remindAt =
      quickTask.remindMinutesBefore === ""
        ? ""
        : addMinutesToIso(dueAt, -Number(quickTask.remindMinutesBefore || 0));
    setSending(true);
    setStatus({ type: "pending", message: "Sending live event task..." });
    try {
      const targetIsAll = quickTask.target === "all_event_staff";
      const result = await onCreateTask({
        eventId: activeEvent.id,
        title: quickTask.title.trim(),
        description: quickTask.description.trim(),
        dueAt,
        remindAt,
        zone: quickTask.zone,
        priority: quickTask.priority,
        assignedRoleKey: targetIsAll || quickTask.target === "person" ? "" : quickTask.target,
        assignedOperatorName: quickTask.target === "person" ? quickTask.personName.trim() : "",
        status: "pending",
        createdByName: user.name,
        metadata: {
          kind: quickTask.kind,
          audience: targetIsAll ? "all_event_staff" : quickTask.target === "person" ? "" : quickTask.target,
        },
      });
      const record = result?.record || result;
      if (!result?.ok && !record?.id) {
        setStatus({ type: "error", message: result?.message || "Live event task could not be sent." });
        return;
      }
      setQuickTask((current) => ({ ...current, title: "", description: "", personName: "" }));
      setStatus({ type: "success", message: result?.message || "Live event task sent." });
    } catch (error) {
      setStatus({ type: "error", message: error?.message || "Unexpected error while sending live event task." });
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="live-event-mode">
      <div className="section-heading static-heading">
        <div>
          <p className="eyebrow">Live Event Mode</p>
          <h2>{activeEvent?.title || "No event selected"}</h2>
          <span>
            {activeEvent?.venue || "No venue"}
            {activeEvent?.startsAt ? ` | ${formatDateTime(activeEvent.startsAt)}` : ""}
          </span>
        </div>
        <div className="backup-actions">
          {onOpenCockpit && (
            <button type="button" className="primary-button compact-button" onClick={onOpenCockpit}>
              Open Event Cockpit
            </button>
          )}
          <button type="button" className="ghost-button compact-button" onClick={onClose}>
            Back to Event Operations
          </button>
        </div>
      </div>
      <GuideQuickLinks
        onOpenGuide={onOpenGuide}
        links={[
          { id: "sending-live-event-messages-tasks", label: "How to send live task/message" },
          { id: "event-close-and-handover", label: "Event close/handover guide" },
          { id: "event-floor-manager-live-control", label: "Guide: Event Floor Manager" },
        ]}
      />

      <EventCommandStructurePanel assignments={eventAssignments} tasks={eventTasks} compact />

      <section className="manager-list">
        <h2>Send live event message/task</h2>
        <form className="editor-form compact-editor" onSubmit={sendLiveTask}>
          <label>
            Title / message
            <input value={quickTask.title} onChange={(event) => setQuickTask((current) => ({ ...current, title: event.target.value }))} />
          </label>
          <label>
            Description
            <input value={quickTask.description} onChange={(event) => setQuickTask((current) => ({ ...current, description: event.target.value }))} />
          </label>
          <label>
            Target
            <select value={quickTask.target} onChange={(event) => setQuickTask((current) => ({ ...current, target: event.target.value }))}>
              <option value="all_event_staff">All event staff</option>
              {eventRoleOptions.map((role) => <option key={role.key} value={role.key}>{role.label}</option>)}
              <option value="person">Specific person/operator</option>
            </select>
            <small>For everyone: choose Target = All event staff.</small>
          </label>
          {quickTask.target === "person" && (
            <label>
              Person
              <input
                list="event-live-staff-list"
                value={quickTask.personName}
                onChange={(event) => setQuickTask((current) => ({ ...current, personName: event.target.value }))}
              />
              <datalist id="event-live-staff-list">
                {activeStaff.map((person) => (
                  <option key={`${person.id}-${person.operatorName}`} value={person.operatorName} label={eventStaffOptionLabel(person, eventAssignments)}>
                    {eventStaffOptionLabel(person, eventAssignments)}
                  </option>
                ))}
              </datalist>
            </label>
          )}
          <label>
            Zone
            <select value={quickTask.zone} onChange={(event) => setQuickTask((current) => ({ ...current, zone: event.target.value }))}>
              {eventZones.map((zone) => <option key={zone} value={zone}>{zoneDisplayLabel(zone)}</option>)}
            </select>
          </label>
          <label>
            Priority
            <select value={quickTask.priority} onChange={(event) => setQuickTask((current) => ({ ...current, priority: event.target.value }))}>
              {["normal", "important", "critical"].map((priority) => <option key={priority} value={priority}>{priority}</option>)}
            </select>
          </label>
          <label>
            Due in minutes
            <input type="number" min="0" value={quickTask.dueInMinutes} onChange={(event) => setQuickTask((current) => ({ ...current, dueInMinutes: event.target.value }))} />
          </label>
          <label>
            Reminder minutes before
            <input type="number" min="0" value={quickTask.remindMinutesBefore} onChange={(event) => setQuickTask((current) => ({ ...current, remindMinutesBefore: event.target.value }))} />
          </label>
          <label>
            Type
            <select value={quickTask.kind} onChange={(event) => setQuickTask((current) => ({ ...current, kind: event.target.value }))}>
              <option value="live_message">Live message</option>
              <option value="live_task">Live task</option>
            </select>
          </label>
          {status.message && (
            <p className={status.type === "error" ? "critical-warning" : status.type === "success" ? "all-clear" : "status-message"}>
              {status.message}
            </p>
          )}
          <button type="submit" className="primary-button compact-button" disabled={sending || !activeEvent?.id}>
            {sending ? "Sending..." : "Send live event task"}
          </button>
        </form>
      </section>

      <section className="manager-list">
        <div className="section-heading static-heading">
          <div>
            <h2>Live task timeline</h2>
            <span>{visibleTasks.length} task(s)</span>
          </div>
          <label>
            Zone filter
            <select value={zoneFilter} onChange={(event) => setZoneFilter(event.target.value)}>
              {["all", "cornerbar", "atrium", "workbar", "runners", "support"].map((zone) => (
                <option key={zone} value={zone}>{zoneDisplayLabel(zone)}</option>
              ))}
            </select>
          </label>
        </div>
        {timelineGroups.map(([title, tasks]) => (
          <div key={title} className="critical-group">
            <h3>{title}</h3>
            {tasks.length === 0 && <p className="muted">None.</p>}
            {tasks.map((task) => {
              const actionStatus = taskActionStatus?.[task.id];
              return (
                <article key={task.id} className={`log-row priority-${task.priority}`}>
                  <strong>{task.title}</strong>
                  <span>
                    {zoneDisplayLabel(eventZoneForTask(task))} | {taskAssignedLabel(task)} |{" "}
                    <span className={`event-task-status-chip status-${task.status || "pending"}`}>
                      {task.status || "pending"}
                    </span>
                  </span>
                  <small>
                    {task.dueAt ? `Due ${formatDateTime(task.dueAt)}` : "No due time"}
                    {task.remindAt ? ` | remind ${formatDateTime(task.remindAt)}` : ""}
                  </small>
                  {task.acknowledgedByName && (
                    <small>
                      Acknowledged by {task.acknowledgedByName}
                      {task.acknowledgedAt ? ` at ${formatDateTime(task.acknowledgedAt)}` : ""}
                    </small>
                  )}
                  {task.completedByName && (
                    <small>
                      Done by {task.completedByName}
                      {task.completedAt ? ` at ${formatDateTime(task.completedAt)}` : ""}
                    </small>
                  )}
                  {actionStatus?.message && (
                    <small className={actionStatus.type === "error" ? "critical-warning" : actionStatus.type === "success" ? "all-clear" : "status-message"}>
                      {actionStatus.message}
                    </small>
                  )}
                  <div className="backup-actions">
                    {eventTaskStatuses.map((nextStatus) => (
                      <button
                        key={nextStatus}
                        type="button"
                        className={task.status === nextStatus ? "primary-button compact-button" : "ghost-button compact-button"}
                        onClick={() => onUpdateTaskStatus(task.id, nextStatus, "")}
                      >
                        {nextStatus}
                      </button>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        ))}
      </section>
    </section>
  );
}

const STANDARD_MESH_EVENT_CALENDAR_PRESETS = [
  { name: "MY-0-CommunityStage (200)", alias: "MY_0_COMMUNITY_STAGE_200" },
  { name: "MY-1-Atrium (100)", alias: "MY_1_ATRIUM_100" },
  { name: "MY-1-Bar (20)", alias: "MY_1_BAR_20" },
  { name: "MY-1-LoungeVenue (40)", alias: "MY_1_LOUNGE_VENUE_40" },
  { name: "MY-1-Workbar (100)", alias: "MY_1_WORKBAR_100" },
];

function normalizeCalendarAliasForUi(value = "") {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function EventCalendarImportPanel({
  eventOperations,
  activeEventId,
  onSelectEvent,
  onRefresh,
  onOpenGuide,
}) {
  const defaultFrom = toDateTimeLocalValue(new Date());
  const defaultTo = addMinutesToDateTimeLocal(defaultFrom, 60 * 24 * 60);
  const [sources, setSources] = useState([]);
  const [importedEvents, setImportedEvents] = useState([]);
  const [sourceForm, setSourceForm] = useState({ name: "", calendarId: "" });
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [range, setRange] = useState({ from: defaultFrom, to: defaultTo });
  const [status, setStatus] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(false);
  const calendarSyncDebug = status.debug ? JSON.stringify(status.debug, null, 2) : "";
  const calendarSyncDiagnostics = status.diagnostics ? JSON.stringify(status.diagnostics, null, 2) : "";
  const sourceByAlias = new Map(
    sources.map((source) => [normalizeCalendarAliasForUi(source.calendarId || source.name), source]),
  );
  const presetRows = STANDARD_MESH_EVENT_CALENDAR_PRESETS.map((preset) => ({
    ...preset,
    source: sourceByAlias.get(preset.alias) || null,
  }));

  async function loadCalendarData(nextRange = range) {
    setLoading(true);
    const [sourceResult, eventResult] = await Promise.all([
      listCalendarSources(),
      listImportedCalendarEvents({
        from: fromDateTimeLocalValue(nextRange.from),
        to: fromDateTimeLocalValue(nextRange.to),
      }),
    ]);
    setLoading(false);
    if (sourceResult.ok) {
      setSources(sourceResult.records || []);
      setSelectedSourceId((current) => current || sourceResult.records?.[0]?.id || "");
    }
    if (eventResult.ok) setImportedEvents(eventResult.records || []);
    if (!sourceResult.ok || !eventResult.ok) {
      setStatus({
        type: "error",
        message:
          sourceResult.message ||
          eventResult.message ||
          "Calendar import data could not be loaded.",
      });
    }
  }

  useEffect(() => {
    loadCalendarData();
  }, []);

  async function addSource(event) {
    event.preventDefault();
    setStatus({ type: "", message: "" });
    if (!sourceForm.name.trim()) {
      setStatus({ type: "error", message: "Add source name." });
      return;
    }
    setLoading(true);
    const result = await createCalendarSource({
      name: sourceForm.name.trim(),
      calendarId: sourceForm.calendarId.trim(),
    });
    setLoading(false);
    if (!result.ok) {
      setStatus({ type: "error", message: result.message || "Calendar source could not be saved." });
      return;
    }
    setSourceForm({ name: "", calendarId: "" });
    setStatus({ type: "success", message: "Calendar source saved." });
    await loadCalendarData();
  }

  async function addMissingEventSources() {
    setStatus({ type: "pending", message: "Adding missing Mesh event calendar sources..." });
    const missingPresets = presetRows.filter((preset) => !preset.source);
    if (!missingPresets.length) {
      setStatus({ type: "success", message: "All standard Mesh event calendar sources already exist." });
      return;
    }
    const details = [];
    for (const preset of missingPresets) {
      const result = await createCalendarSource({ name: preset.name, calendarId: preset.alias });
      details.push({
        label: preset.name,
        ok: result.ok,
        message: result.ok ? "Added" : result.message || "Could not add source.",
      });
    }
    await loadCalendarData();
    const failed = details.filter((detail) => !detail.ok);
    setStatus({
      type: failed.length ? "error" : "success",
      message: failed.length
        ? "Some Mesh event calendar sources could not be added."
        : "Missing Mesh event calendar sources added.",
      details,
    });
  }

  async function syncCalendar() {
    setStatus({ type: "", message: "" });
    if (!selectedSourceId) {
      setStatus({ type: "error", message: "Create or choose a calendar source first." });
      return;
    }
    setLoading(true);
    const result = await syncGoogleCalendar({
      sourceId: selectedSourceId,
      timeMin: fromDateTimeLocalValue(range.from),
      timeMax: fromDateTimeLocalValue(range.to),
    });
    setLoading(false);
    if (!result.ok) {
      const selectedSource = sources.find((source) => source.id === selectedSourceId);
      const message =
        result.mode === "ics_missing_source_secret"
          ? `No iCal secret configured for ${selectedSource?.name || "this calendar source"}. Expected Supabase secret: ${result.expectedSecretName || "missing source secret"}.`
          : result.mode === "not_configured"
          ? "Google Calendar sync needs server-side configuration before it can import events."
          : result.message ||
            "Google Calendar sync needs server-side configuration before it can import events.";
      setStatus({
        type: "error",
        message,
        debug: result.debug || null,
      });
      return;
    }
    setStatus({
      type: "success",
      message: result.message || "Google Calendar sync complete.",
      helper:
        result.mode === "ics" && result.syncedCount === 0
          ? "No events were imported from the iCal feed for this range. Check that the iCal secret belongs to the selected calendar, the date range includes events, and whether the events are recurring."
          : "",
      diagnostics: result.diagnostics || null,
    });
    await loadCalendarData();
  }

  async function syncAllEventCalendars() {
    const eventSources = presetRows
      .map((preset) => preset.source)
      .filter((source) => source?.id && source.active !== false);
    if (!eventSources.length) {
      setStatus({ type: "error", message: "Add standard Mesh event calendar sources before syncing all." });
      return;
    }
    setLoading(true);
    const details = [];
    let totalSynced = 0;
    for (let index = 0; index < eventSources.length; index += 1) {
      const source = eventSources[index];
      setStatus({
        type: "pending",
        message: `Syncing ${index + 1}/${eventSources.length} sources...`,
        details,
      });
      const result = await syncGoogleCalendar({
        sourceId: source.id,
        timeMin: fromDateTimeLocalValue(range.from),
        timeMax: fromDateTimeLocalValue(range.to),
      });
      const syncedCount = result.syncedCount ?? result.data?.syncedCount ?? result.data?.importedCount ?? 0;
      if (result.ok) totalSynced += syncedCount;
      const missingSecret = result.mode === "ics_missing_source_secret";
      details.push({
        label: source.name,
        ok: result.ok,
        state: result.ok ? "synced" : missingSecret ? "missing secret" : "failed",
        message: result.ok
          ? `Synced ${syncedCount} event(s).`
          : missingSecret
          ? `Missing secret: ${result.expectedSecretName || "expected source secret not returned"}.`
          : result.message || "Sync failed.",
      });
    }
    setLoading(false);
    await loadCalendarData();
    const failed = details.filter((detail) => !detail.ok);
    setStatus({
      type: failed.length ? "error" : "success",
      message: failed.length
        ? `Synced ${eventSources.length - failed.length}/${eventSources.length} sources. ${totalSynced} event(s) synced total.`
        : `Synced ${eventSources.length}/${eventSources.length} sources. ${totalSynced} event(s) synced total.`,
      details,
    });
  }

  async function createBoard(calendarEvent) {
    setStatus({ type: "pending", message: "Creating event board from calendar event..." });
    const result = await createEventOperationFromCalendarEvent(calendarEvent.id);
    if (!result.ok) {
      setStatus({ type: "error", message: result.message || "Event board could not be created." });
      return;
    }
    const record = result.record || result.row || {};
    if (record.id) onSelectEvent?.(record.id);
    await onRefresh?.("calendar_event_board_created");
    await loadCalendarData();
    setStatus({
      type: "success",
      message: "Event board created. Next: set Command Structure, review Run Sheets, then open Live Event Mode.",
    });
  }

  async function linkToActiveBoard(calendarEvent) {
    if (!activeEventId) {
      setStatus({ type: "error", message: "Select an event board before linking." });
      return;
    }
    setStatus({ type: "pending", message: "Linking imported event to selected board..." });
    const result = await linkCalendarEventToEventOperation(calendarEvent.id, activeEventId);
    if (!result.ok) {
      setStatus({ type: "error", message: result.message || "Calendar event could not be linked." });
      return;
    }
    await onRefresh?.("calendar_event_linked");
    await loadCalendarData();
    setStatus({ type: "success", message: "Calendar event linked to selected event board." });
  }

  return (
    <section className="manager-list calendar-import-panel">
      <div className="section-heading static-heading">
        <div>
          <p className="eyebrow">Calendar Import</p>
          <h2>Google Calendar import</h2>
        </div>
        <span>{sources.length} source(s)</span>
      </div>
      <p className="muted">
        Calendar sync can use either Google API credentials or a server-side iCal secret URL. Calendar descriptions may contain internal event details.
      </p>
      <p className="muted">
        For quick setup, ask a manager to configure the Google Calendar secret iCal URL as a Supabase Edge Function secret.
      </p>
      <p className="muted">
        Calendars without iCal secrets need either Workspace admin access or Google Calendar API/service account later.
      </p>
      <GuideQuickLinks
        onOpenGuide={onOpenGuide}
        links={[{ id: "google-calendar-import", label: "Guide: Google Calendar Import" }]}
      />
      <section className="manager-list calendar-preset-panel">
        <div className="section-heading static-heading">
          <div>
            <p className="eyebrow">Standard Mesh event calendars</p>
            <h3>Event sources</h3>
          </div>
          <button type="button" className="ghost-button compact-button" onClick={addMissingEventSources} disabled={loading}>
            Add missing event sources
          </button>
        </div>
        <div className="mini-grid">
          {presetRows.map((preset) => (
            <article key={preset.alias} className="status-card">
              <strong>{preset.name}</strong>
              <span>{preset.alias}</span>
              <small>{preset.source ? "Source exists" : "Missing source"}</small>
            </article>
          ))}
        </div>
      </section>
      <form className="editor-form compact-editor" onSubmit={addSource}>
        <label>
          Source name
          <input
            value={sourceForm.name}
            onChange={(event) => setSourceForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Youngs event calendar"
          />
        </label>
        <label>
          Calendar ID / iCal secret alias
          <input
            value={sourceForm.calendarId}
            onChange={(event) => setSourceForm((current) => ({ ...current, calendarId: event.target.value }))}
            placeholder="MY_1_BAR_20"
          />
          <small>
            For iCal mode, enter a safe alias like MY_1_BAR_20. The matching Supabase secret should be GOOGLE_CALENDAR_ICS_URL_MY_1_BAR_20. Do not paste the iCal URL here.
          </small>
        </label>
        <button type="submit" className="primary-button compact-button" disabled={loading}>
          Add source
        </button>
      </form>
      <p className="muted">
        iCal mode imports from the server-side iCal feed configured in Supabase, not from the visible Google Calendar ID field.
      </p>
      <div className="editor-form compact-editor">
        <label>
          Source
          <select value={selectedSourceId} onChange={(event) => setSelectedSourceId(event.target.value)}>
            <option value="">Choose source</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name} {source.lastSyncedAt ? `(synced ${formatDateTime(source.lastSyncedAt)})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          From
          <input type="datetime-local" value={range.from} onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))} />
        </label>
        <label>
          To
          <input type="datetime-local" value={range.to} onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))} />
        </label>
        <button type="button" className="primary-button compact-button" onClick={syncCalendar} disabled={loading || !selectedSourceId}>
          {loading ? "Working..." : "Sync Google Calendar"}
        </button>
        <button type="button" className="primary-button compact-button" onClick={syncAllEventCalendars} disabled={loading}>
          Sync all event calendars
        </button>
        <button type="button" className="ghost-button compact-button" onClick={() => loadCalendarData()} disabled={loading}>
          Refresh imported events
        </button>
      </div>
      {status.message && (
        <>
          <p className={status.type === "error" ? "critical-warning" : status.type === "success" ? "all-clear" : "status-message"}>
            {status.message}
          </p>
          {isLocalhostRuntime() && calendarSyncDebug && (
            <details className="calendar-sync-debug">
              <summary>Calendar sync debug</summary>
              <pre>{calendarSyncDebug}</pre>
            </details>
          )}
          {status.helper && <p className="muted">{status.helper}</p>}
          {status.details?.length > 0 && (
            <div className="calendar-sync-results">
              {status.details.map((detail) => (
                <p key={`${detail.label}-${detail.message}`} className={detail.ok ? "all-clear" : "critical-warning"}>
                  {detail.label}: {detail.state ? `${detail.state} - ` : ""}{detail.message}
                </p>
              ))}
            </div>
          )}
          {isLocalhostRuntime() && calendarSyncDiagnostics && (
            <details className="calendar-sync-debug">
              <summary>iCal sync diagnostics</summary>
              <pre>{calendarSyncDiagnostics}</pre>
            </details>
          )}
        </>
      )}
      {sources.length === 0 && (
        <p className="muted">No calendar source yet. Add a source, then configure Google API credentials or the iCal secret URL server-side before syncing.</p>
      )}
      {importedEvents.length === 0 ? (
        <p className="muted">No imported calendar events yet.</p>
      ) : (
        <div className="critical-group">
          <h3>Imported events</h3>
          {importedEvents.map((calendarEvent) => {
            const linkedBoard = eventOperations.find((event) => event.id === calendarEvent.linkedEventOperationId);
            return (
              <article key={calendarEvent.id} className="log-row">
                <strong>{calendarEvent.title}</strong>
                <span>
                  {calendarEvent.location || "No location"} | {calendarEvent.status || "calendar"} | {calendarEvent.sourceName || "Google"}
                </span>
                <small>Source: {calendarEvent.sourceName || "Unknown calendar source"}</small>
                <small>
                  {calendarEvent.startsAt ? formatDateTime(calendarEvent.startsAt) : "No start"}
                  {calendarEvent.endsAt ? ` - ${formatDateTime(calendarEvent.endsAt)}` : ""}
                  {calendarEvent.importedAt ? ` | imported ${formatDateTime(calendarEvent.importedAt)}` : ""}
                </small>
                {linkedBoard && <small>Linked board: {linkedBoard.title}</small>}
                <div className="backup-actions">
                  {linkedBoard ? (
                    <button type="button" className="primary-button compact-button" onClick={() => onSelectEvent?.(linkedBoard.id)}>
                      Open linked board
                    </button>
                  ) : (
                    <>
                      <button type="button" className="primary-button compact-button" onClick={() => createBoard(calendarEvent)}>
                        Create Event Board
                      </button>
                      <button type="button" className="ghost-button compact-button" onClick={() => linkToActiveBoard(calendarEvent)} disabled={!activeEventId}>
                        Link to selected board
                      </button>
                    </>
                  )}
                  {calendarEvent.htmlLink && (
                    <a className="ghost-button compact-button" href={calendarEvent.htmlLink} target="_blank" rel="noreferrer">
                      Open calendar event
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function confidenceLabel(value = 0) {
  if (value >= 0.8) return "High";
  if (value >= 0.65) return "Medium";
  return "Low";
}

function editablePlanItems(planItems = []) {
  return planItems.map((item) => ({
    ...item,
    included: item.included !== false,
    dueAt: toOsloDateTimeLocalValue(item.dueAt || ""),
    remindAt: toOsloDateTimeLocalValue(item.remindAt || ""),
  }));
}

function planItemsForStorage(planItems = []) {
  return planItems.map((item) => ({
    ...item,
    dueAt: item.dueAt ? fromOsloDateTimeLocalValue(item.dueAt) : "",
    remindAt: item.remindAt ? fromOsloDateTimeLocalValue(item.remindAt) : "",
  }));
}

function smartPlanItemAudience(item = {}) {
  return (
    item.audience ||
    item.metadata?.audience ||
    (item.assignedRoleKey === "all_event_staff" ? "all_event_staff" : "")
  );
}

function validateSmartPlanItems(planItems = []) {
  for (const item of planItems) {
    const itemLabel = item.title?.trim() || item.planItemId || "Plan item";
    if (item.included !== false && !item.title?.trim())
      return "Every included plan item needs a title.";
    if (item.dueAt && !isValidOsloDateTimeLocalValue(item.dueAt))
      return `${itemLabel} has an invalid due time. Choose a valid Oslo date and time.`;
    if (item.remindAt && !isValidOsloDateTimeLocalValue(item.remindAt))
      return `${itemLabel} has an invalid reminder time. Choose a valid Oslo date and time.`;
  }
  return "";
}

function isSmartPlanDuplicateResult(result) {
  const errorCode = result?.error?.code || result?.code || "";
  const errorText = [result?.message, result?.error?.message, result?.error?.details]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return errorCode === "23505" || errorText.includes("event_tasks_smart_plan_item_unique_idx");
}

function editableEventPlan(plan, eventOperation) {
  if (!plan) return null;
  return {
    ...plan,
    setup: deriveEventPlanOperationalWindow(eventOperation, plan.setup || {}),
    planItems: editablePlanItems(plan.planItems || []),
  };
}

function formatOsloClock(value) {
  const localValue = toOsloDateTimeLocalValue(value);
  return localValue ? localValue.slice(11, 16) : "--:--";
}

function formatOsloTimeRange(startsAt, endsAt) {
  return `${formatOsloClock(startsAt)}-${formatOsloClock(endsAt)}`;
}

function smartPlanIncludedStats(plan) {
  const items = plan?.planItems || [];
  return {
    included: items.filter((item) => item.included !== false).length,
    total: items.length,
  };
}

function smartPlanNeedsLongerPrep(plan) {
  const current = Number(plan?.setup?.prepMinutesBefore || 60);
  const recommended = Number(plan?.setup?.recommendedPrepMinutes || 60);
  return recommended > current ? recommended : 0;
}

function smartPlanWarningCount(plan) {
  return (plan?.warnings || plan?.setup?.warnings || []).length +
    (plan?.setup?.staffingProposal?.warnings || []).length +
    (smartPlanNeedsLongerPrep(plan) ? 1 : 0);
}

function staffingAssignmentMatches(assignment, requirement, profile) {
  return staffingAssignmentMatchesProfile(assignment, requirement, profile);
}

function staffingRequirementAssignments(requirement, assignments = []) {
  return assignments.filter(
    (assignment) =>
      assignment.active &&
      assignment.roleKey === requirement.roleKey &&
      eventRoleEffectiveZone(assignment.roleKey, assignment.zone) === requirement.zoneKey,
  );
}

function staffingRequirementOpenCount(requirement, assignments = []) {
  return Math.max(
    0,
    Number(requirement.recommendedCount || 0) - staffingRequirementAssignments(requirement, assignments).length,
  );
}

function staffingOverlapWarnings(proposal = {}, profiles = [], assignments = []) {
  return analyzeStaffingAssignmentConflicts(
    proposal,
    profiles,
    assignments,
    staffingRoleOptions.filter((role) => role.singleLead).map((role) => role.key),
  ).overrideWarnings;
}

function smartPlanStatusLabel(status = "") {
  if (!status) return "No plan generated";
  return `${status.slice(0, 1).toUpperCase()}${status.slice(1)}`;
}

function SmartEventPlanPanel({
  user,
  activeEvent,
  eventAssignments,
  eventTasks,
  onCreateTask,
  onAssignRole,
  onRemoveRole,
  onRefreshEventOperations,
  reviewMode = false,
  reviewFocus = "",
  onOpenReview,
  onOpenCockpit,
  onCloseReview,
}) {
  const [plans, setPlans] = useState([]);
  const [planStatus, setPlanStatus] = useState({ type: "", message: "" });
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [editor, setEditor] = useState(null);
  const [expandedPlanItems, setExpandedPlanItems] = useState({});
  const [expandedPhases, setExpandedPhases] = useState({ before: true, during: false, after: false });
  const [customWindowMode, setCustomWindowMode] = useState({ prep: false, close: false });
  const [linkedCalendarEvents, setLinkedCalendarEvents] = useState([]);
  const [calendarSources, setCalendarSources] = useState([]);
  const [loadingCalendarContext, setLoadingCalendarContext] = useState(false);
  const [calendarContextLoaded, setCalendarContextLoaded] = useState(false);
  const [staffProfiles, setStaffProfiles] = useState([]);
  const [staffProfileStatus, setStaffProfileStatus] = useState("");
  const [staffSearch, setStaffSearch] = useState("");
  const [expandedStaffing, setExpandedStaffing] = useState({});
  const [showRegenerationOptions, setShowRegenerationOptions] = useState(false);
  const [confirmStaffingOverlap, setConfirmStaffingOverlap] = useState(false);
  const staffingSectionRef = useRef(null);
  const activePlan = plans[0] || null;
  const linkedResources = linkedCalendarEvents.filter(
    (calendarEvent) => calendarEvent.linkedEventOperationId === activeEvent?.id,
  );
  const linkedSourceIds = new Set(linkedResources.map((resource) => resource.sourceId).filter(Boolean));
  const linkedCalendarSources = calendarSources.filter((source) => linkedSourceIds.has(source.id));
  const relevantRigIds = new Set([
    ...(editor?.rigRefs || activePlan?.rigRefs || []),
    ...(editor?.planItems || activePlan?.planItems || []).map((item) => item.rigRef).filter(Boolean),
  ]);
  const relevantRigGuides = eventRigGuides.filter((guide) => relevantRigIds.has(guide.id));

  function derivedStaffingProposal(plan, generatedAt = "") {
    if (!plan || !activeEvent) return null;
    const proposal = plan.setup?.staffingProposal || suggestEventStaffing({
      eventOperation: activeEvent,
      linkedCalendarEvents: linkedResources,
      linkedCalendarSources,
      eventPlan: plan,
      roleAssignments: eventAssignments,
      existingTasks: eventTasks,
      generatedAt,
    });
    return syncStaffingProposalAssignments(proposal, eventAssignments);
  }

  function setEditorFromRecord(plan) {
    const nextEditor = editableEventPlan(plan, activeEvent);
    setEditor(nextEditor);
    const standardValues = [30, 60, 90, 120];
    setCustomWindowMode({
      prep: nextEditor ? !standardValues.includes(Number(nextEditor.setup?.prepMinutesBefore)) : false,
      close: nextEditor ? !standardValues.includes(Number(nextEditor.setup?.closeMinutesAfter)) : false,
    });
  }

  async function loadPlans() {
    if (!activeEvent?.id) {
      setPlans([]);
      setEditor(null);
      return;
    }
    const result = await listEventPlans(activeEvent.id);
    if (result.ok) {
      setPlans(result.records || []);
      const current = result.records?.[0] || null;
      if (reviewMode && current) setEditorFromRecord(current);
      else if (!reviewMode) setEditor(null);
    } else {
      setPlanStatus({ type: "error", message: result.message || "Could not load suggested plans." });
    }
  }

  async function loadCalendarContext() {
    if (!activeEvent?.id) {
      setLinkedCalendarEvents([]);
      setCalendarSources([]);
      setLoadingCalendarContext(false);
      setCalendarContextLoaded(false);
      return;
    }
    setLoadingCalendarContext(true);
    setCalendarContextLoaded(false);
    const from = activeEvent.startsAt
      ? addMinutesToDateTimeLocal(toDateTimeLocalValue(activeEvent.startsAt), -24 * 60)
      : toDateTimeLocalValue(new Date());
    const to = activeEvent.endsAt
      ? addMinutesToDateTimeLocal(toDateTimeLocalValue(activeEvent.endsAt), 24 * 60)
      : addMinutesToDateTimeLocal(from, 48 * 60);
    try {
      const [sourceResult, eventResult] = await Promise.all([
        listCalendarSources(),
        listImportedCalendarEvents({
          from: fromDateTimeLocalValue(from),
          to: fromDateTimeLocalValue(to),
        }),
      ]);
      setCalendarSources(sourceResult.ok ? sourceResult.records || [] : []);
      setLinkedCalendarEvents(
        eventResult.ok
          ? (eventResult.records || []).filter(
              (calendarEvent) => calendarEvent.linkedEventOperationId === activeEvent.id,
            )
          : [],
      );
    } catch (error) {
      setCalendarSources([]);
      setLinkedCalendarEvents([]);
      setPlanStatus({
        type: "error",
        message: error?.message || "Linked calendar context could not be loaded.",
      });
    } finally {
      setLoadingCalendarContext(false);
      setCalendarContextLoaded(true);
    }
  }

  useEffect(() => {
    setPlanStatus({ type: "", message: "" });
    setEditor(null);
    setExpandedPlanItems({});
    setExpandedPhases({ before: true, during: false, after: false });
    loadPlans();
    loadCalendarContext();
  }, [activeEvent?.id, reviewMode]);

  useEffect(() => {
    if (!reviewMode || !calendarContextLoaded || !activeEvent?.id || !editor || editor.setup?.staffingProposal) return;
    setEditor((current) => current
      ? {
          ...current,
          setup: {
            ...current.setup,
            staffingProposal: derivedStaffingProposal(current),
          },
        }
      : current);
  }, [reviewMode, calendarContextLoaded, activeEvent?.id, linkedCalendarEvents, calendarSources, editor?.id]);

  useEffect(() => {
    if (!reviewMode || !isEventOpsManager(user)) return;
    let cancelled = false;
    setStaffProfileStatus("Loading available staff...");
    fetchAssignableEventStaff().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setStaffProfiles([]);
        setStaffProfileStatus(result.message || "Could not load available staff.");
        return;
      }
      const organizationId = user?.organizationId || user?.organization_id || "";
      const profiles = (result.profiles || []).filter((profile) =>
        isAssignableStaffProfile(profile, organizationId),
      );
      setStaffProfiles(profiles);
      setEditor((current) => current?.setup?.staffingProposal
        ? {
            ...current,
            setup: {
              ...current.setup,
              staffingProposal: normalizeStaffingProposalAssignedAuthUserIds(
                current.setup.staffingProposal,
                profiles,
              ),
            },
          }
        : current);
      setStaffProfileStatus(profiles.length ? "" : "No assignable staff profiles were found.");
    });
    return () => { cancelled = true; };
  }, [reviewMode, activeEvent?.id, user?.id, user?.organizationId, user?.organization_id]);

  const staffProfileIdentitySignature = staffProfiles
    .map((profile) => `${profile.profileId}:${profile.authUserId}`)
    .join("|");
  useEffect(() => {
    if (!editor?.setup?.staffingProposal || !staffProfiles.length) return;
    setEditor((current) => current
      ? {
          ...current,
          setup: {
            ...current.setup,
            staffingProposal: normalizeStaffingProposalAssignedAuthUserIds(
              current.setup.staffingProposal,
              staffProfiles,
            ),
          },
        }
      : current);
  }, [editor?.id, staffProfileIdentitySignature]);

  useEffect(() => {
    if (reviewMode && reviewFocus === "staffing") {
      window.requestAnimationFrame(() => staffingSectionRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }));
    }
  }, [reviewMode, reviewFocus, editor?.id]);

  async function generateSuggestion(staffingMergeMode = "merge") {
    if (!activeEvent?.id) {
      setPlanStatus({ type: "error", message: "Select an event board before generating a plan." });
      return;
    }
    setLoadingPlan(true);
    setPlanStatus({ type: "pending", message: "Generating suggested event plan..." });
    try {
      const currentPlansResult = await listEventPlans(activeEvent.id);
      if (!currentPlansResult.ok) {
        setPlanStatus({
          type: "error",
          message: currentPlansResult.message || "Existing plan versions could not be checked.",
        });
        return;
      }
      const suggestion = suggestEventPlan({
        eventOperation: activeEvent,
        linkedCalendarEvents: linkedResources,
        calendarSources: linkedCalendarSources,
        roleAssignments: eventAssignments,
        existingTasks: eventTasks,
      });
      const suggestedStaffing = suggestEventStaffing({
        eventOperation: activeEvent,
        linkedCalendarEvents: linkedResources,
        linkedCalendarSources,
        eventPlan: suggestion,
        roleAssignments: eventAssignments,
        existingTasks: eventTasks,
        generatedAt: new Date().toISOString(),
      });
      const previousPlan = currentPlansResult.records?.[0] || null;
      const staffingProposal = previousPlan?.setup?.staffingProposal
        ? mergeStaffingProposals(previousPlan.setup.staffingProposal, suggestedStaffing, staffingMergeMode)
        : suggestedStaffing;
      const nextVersion =
        Math.max(0, ...(currentPlansResult.records || []).map((plan) => Number(plan.version) || 0)) + 1;
      const result = await createSuggestedEventPlan({
        eventOperationId: activeEvent.id,
        status: "suggested",
        source: "automatic",
        title: suggestion.title,
        suggestedTemplateId: suggestion.suggestedTemplateId,
        confidence: suggestion.confidence,
        detectedSignals: suggestion.detectedSignals,
        rationale: suggestion.rationale,
        warnings: suggestion.warnings,
        setup: { ...suggestion.setup, staffingProposal },
        planItems: suggestion.planItems,
        guideRefs: suggestion.guideRefs,
        rigRefs: suggestion.rigRefs,
        version: nextVersion,
      });
      if (!result.ok || !result.record?.id) {
        setPlanStatus({ type: "error", message: result.message || "Suggested plan could not be saved." });
        return;
      }
      const supersedeResult = await supersedePreviousPlans(activeEvent.id, result.record.id);
      setPlans((current) => [
        result.record,
        ...current
          .filter((plan) => plan.id !== result.record.id)
          .map((plan) =>
            supersedeResult.ok && ["suggested", "draft"].includes(plan.status)
              ? { ...plan, status: "superseded" }
              : plan,
          ),
      ]);
      if (reviewMode) setEditorFromRecord(result.record);
      setPlanStatus({
        type: supersedeResult.ok ? "success" : "error",
        message: supersedeResult.ok
          ? `Suggested plan version ${result.record.version} generated. Review before applying.`
          : `Suggested plan was saved, but older drafts could not be superseded: ${supersedeResult.message || "Unknown error."}`,
      });
      onRefreshEventOperations?.("smart_event_plan_generated");
      setShowRegenerationOptions(false);
    } catch (error) {
      setPlanStatus({ type: "error", message: error?.message || "Unexpected error while generating suggestion." });
    } finally {
      setLoadingPlan(false);
    }
  }

  function updatePlanItem(planItemId, patch) {
    setEditor((current) => ({
      ...current,
      planItems: (current?.planItems || []).map((item) =>
        item.planItemId === planItemId ? { ...item, ...patch } : item,
      ),
    }));
  }

  function updatePlanItemAudience(planItemId, audience) {
    setEditor((current) => ({
      ...current,
      planItems: (current?.planItems || []).map((item) => {
        if (item.planItemId !== planItemId) return item;
        const metadata = { ...(item.metadata || {}) };
        if (audience) metadata.audience = audience;
        else delete metadata.audience;
        return { ...item, audience, metadata };
      }),
    }));
  }

  function setPhaseIncluded(phase, included) {
    setEditor((current) => ({
      ...current,
      planItems: (current?.planItems || []).map((item) =>
        (item.phase || "before") === phase ? { ...item, included } : item,
      ),
    }));
  }

  function updateOperationalWindow(kind, value) {
    const minutes = Math.max(0, Math.min(480, Math.round(Number(value) || 0)));
    const field = kind === "prep" ? "prepMinutesBefore" : "closeMinutesAfter";
    setEditor((current) => {
      if (!current || current.status === "applied") return current;
      return {
        ...current,
        setup: deriveEventPlanOperationalWindow(
          activeEvent,
          { ...(current.setup || {}), [field]: minutes },
          { recalculateBounds: true },
        ),
      };
    });
    setPlanStatus({
      type: "pending",
      message: "Operational window updated. Task times are unchanged until you choose Recalculate suggested times.",
    });
  }

  function selectWindowOption(kind, value) {
    if (value === "custom") {
      setCustomWindowMode((current) => ({ ...current, [kind]: true }));
      return;
    }
    setCustomWindowMode((current) => ({ ...current, [kind]: false }));
    updateOperationalWindow(kind, Number(value));
  }

  function recalculateSuggestedTimes() {
    if (!editor || editor.status === "applied") return;
    const recalculatedItems = recalculateEventPlanTimes({
      planItems: planItemsForStorage(editor.planItems || []),
      eventOperation: activeEvent,
      setup: editor.setup,
    });
    setEditor((current) => ({
      ...current,
      planItems: editablePlanItems(recalculatedItems),
    }));
    setPlanStatus({
      type: "success",
      message: "Suggested times recalculated for the operational window. Review the changes, then save the draft.",
    });
  }

  function updateStaffingRequirement(requirementId, patch) {
    setEditor((current) => {
      if (!current || current.status === "applied") return current;
      const proposal = current.setup?.staffingProposal || derivedStaffingProposal(current);
      return {
        ...current,
        setup: {
          ...current.setup,
          staffingProposal: {
            ...proposal,
            manuallyEdited: true,
            requirements: (proposal?.requirements || []).map((item) =>
              item.requirementId === requirementId
                ? { ...item, ...patch, manuallyEdited: true }
                : item,
            ),
          },
        },
      };
    });
    setConfirmStaffingOverlap(false);
  }

  function addStaffingRequirement() {
    const proposal = editor?.setup?.staffingProposal || derivedStaffingProposal(editor);
    const index = (proposal?.requirements || []).filter((item) => item.requirementId.startsWith("manual:")).length + 1;
    const role = staffingRoleOptions.find((item) => item.key === "other");
    const requirementId = `manual:${Date.now()}:${index}`;
    setEditor((current) => ({
      ...current,
      setup: {
        ...current.setup,
        staffingProposal: {
          ...proposal,
          manuallyEdited: true,
          requirements: [
            ...(proposal?.requirements || []),
            {
              requirementId,
              roleKey: role.key,
              roleLabel: "Custom support role",
              zoneKey: role.zone,
              zoneLabel: zoneDisplayLabel(role.zone),
              recommendedCount: 1,
              minimumCount: 0,
              preferredCount: 1,
              required: false,
              shiftStartsAt: displayedSetup.prepStartsAt || "",
              shiftEndsAt: displayedSetup.closeEndsAt || "",
              rationale: ["Added manually by Event Operations manager."],
              confidence: 1,
              sourceSignals: ["manual"],
              linkedAssignmentIds: [],
              assignedUserIds: [],
              manuallyEdited: true,
              included: true,
            },
          ],
        },
      },
    }));
    setExpandedStaffing((current) => ({ ...current, [requirementId]: true }));
  }

  function resetStaffingRecommendation() {
    if (!editor || editor.status === "applied") return;
    const suggested = suggestEventStaffing({
      eventOperation: activeEvent,
      linkedCalendarEvents: linkedResources,
      linkedCalendarSources,
      eventPlan: editor,
      roleAssignments: eventAssignments,
      existingTasks: eventTasks,
      generatedAt: new Date().toISOString(),
    });
    setEditor((current) => ({
      ...current,
      setup: { ...current.setup, staffingProposal: suggested },
    }));
    setPlanStatus({ type: "pending", message: "Staffing recommendation reset. Save the draft to keep it." });
  }

  function toggleProfileForRequirement(requirement, profile) {
    const selected = requirement.assignedUserIds || [];
    const authUserId = staffingProfileAuthUserId(profile);
    const displayName = staffingProfileDisplayName(profile);
    const alreadySelected = selected.includes(authUserId);
    const existing = eventAssignments.find((assignment) =>
      staffingAssignmentMatches(assignment, requirement, profile),
    );
    if (!alreadySelected && existing) {
      setPlanStatus({ type: "pending", message: `${displayName} is already assigned as ${requirement.roleLabel}. Existing assignment reused.` });
    }
    const singleLead = staffingRoleOptions.find((role) => role.key === requirement.roleKey)?.singleLead;
    const selectedOtherAuthUserId = singleLead
      ? selected.find((id) => id !== authUserId)
      : "";
    const occupiedLead = singleLead
      ? eventAssignments.find(
          (assignment) => assignment.active && assignment.roleKey === requirement.roleKey,
        )
      : null;
    const replacingOccupiedLead = Boolean(
      occupiedLead && !staffingAssignmentMatches(occupiedLead, requirement, profile),
    );
    if (!alreadySelected && (selectedOtherAuthUserId || replacingOccupiedLead)) {
      const currentName = occupiedLead?.assignedOperatorName || "the currently selected person";
      if (!window.confirm(
        `${requirement.roleLabel} is a single-lead role. Replace ${currentName} with ${displayName}? The existing Event Command Structure assignment will only be deactivated when you apply staffing assignments.`,
      )) return;
    }
    updateStaffingRequirement(requirement.requirementId, {
      assignedUserIds: alreadySelected
        ? selected.filter((id) => id !== authUserId)
        : singleLead
          ? [authUserId]
          : [...new Set([...selected, authUserId])],
      linkedAssignmentIds: existing
        ? [...new Set([...(requirement.linkedAssignmentIds || []), existing.id])]
        : (requirement.linkedAssignmentIds || []).filter((id) => id !== occupiedLead?.id),
      replaceSingleLeadAssignment: !alreadySelected && replacingOccupiedLead,
      replaceSingleLeadAssignmentId: !alreadySelected && replacingOccupiedLead
        ? occupiedLead.id
        : "",
    });
  }

  async function removeOperationalStaffingAssignment(requirement, assignment) {
    const name = assignment.assignedOperatorName || "this person";
    if (!window.confirm(`Remove ${name} from the Smart Plan and Event Command Structure?`)) return;
    setPlanStatus({ type: "pending", message: `Removing ${name}...` });
    const result = await onRemoveRole?.(assignment.id);
    if (!result?.ok) {
      setPlanStatus({ type: "error", message: result?.message || "Role assignment could not be removed." });
      return;
    }
    updateStaffingRequirement(requirement.requirementId, {
      linkedAssignmentIds: (requirement.linkedAssignmentIds || []).filter((id) => id !== assignment.id),
      assignedUserIds: (requirement.assignedUserIds || []).filter((id) => id !== assignment.assignedAuthUserId),
    });
    setPlanStatus({ type: "success", message: `${name} removed from the plan and Event Command Structure.` });
    await onRefreshEventOperations?.("smart_staffing_assignment_removed");
  }

  async function applyStaffingAssignments() {
    if (!editor?.id || editor.status === "applied") return;
    const proposal = syncStaffingProposalAssignments(
      editor.setup?.staffingProposal || derivedStaffingProposal(editor),
      eventAssignments,
    );
    const overlapAnalysis = analyzeStaffingAssignmentConflicts(
      proposal,
      staffProfiles,
      eventAssignments,
      staffingRoleOptions.filter((role) => role.singleLead).map((role) => role.key),
    );
    const overlaps = overlapAnalysis.overrideWarnings;
    if (overlaps.length && !confirmStaffingOverlap) {
      setConfirmStaffingOverlap(true);
      setPlanStatus({ type: "error", message: `${overlaps[0]} Review it, then choose Confirm staffing overlaps to continue.` });
      return;
    }
    setLoadingPlan(true);
    setPlanStatus({ type: "pending", message: "Saving staffing proposal before assignment..." });
    let workingProposal = proposal;
    let created = 0;
    let reused = 0;
    let skipped = 0;
    let conflicts = 0;
    let failed = 0;
    const appliedAssignments = [...eventAssignments];
    try {
      const saved = await updateEventPlan(editor.id, {
        status: "draft",
        title: editor.title.trim(),
        setup: { ...editor.setup, staffingProposal: workingProposal },
        warnings: editor.warnings || [],
        planItems: planItemsForStorage(editor.planItems),
        guideRefs: editor.guideRefs,
        rigRefs: editor.rigRefs,
        version: editor.version || 1,
      });
      if (!saved.ok) {
        setPlanStatus({ type: "error", message: saved.message || "Staffing proposal could not be saved." });
        return;
      }

      for (const requirement of workingProposal.requirements.filter((item) => item.included !== false)) {
        for (const userId of requirement.assignedUserIds || []) {
          const profile = staffProfiles.find((item) => staffingProfileAuthUserId(item) === userId);
          if (!profile) {
            skipped += 1;
            continue;
          }
          const role = eventRoleOption(requirement.roleKey);
          if (!role || !eventZones.includes(requirement.zoneKey)) {
            skipped += 1;
            continue;
          }
          const effectiveRequirement = {
            ...requirement,
            zoneKey: eventRoleEffectiveZone(role.key, requirement.zoneKey),
          };
          const action = staffingAssignmentAction(
            appliedAssignments,
            effectiveRequirement,
            profile,
            role.singleLead,
          );
          if (action.action === "reuse") {
            reused += 1;
            requirement.linkedAssignmentIds = [...new Set([...(requirement.linkedAssignmentIds || []), action.assignment.id])];
            continue;
          }
          if (
            action.action === "conflict" &&
            (
              !requirement.replaceSingleLeadAssignment ||
              requirement.replaceSingleLeadAssignmentId !== action.assignment.id
            )
          ) {
            conflicts += 1;
            continue;
          }
          const result = await onAssignRole?.({
            eventId: activeEvent.id,
            roleKey: requirement.roleKey,
            roleLabel: requirement.roleLabel,
            zone: effectiveRequirement.zoneKey,
            assignedAuthUserId: staffingProfileAuthUserId(profile),
            assignedOperatorName: staffingProfileDisplayName(profile),
            assignedOperatorSource: "supabase_auth",
            assignedByName: user.name,
            notes: `Smart Plan staffing: ${requirement.requirementId}; ${formatOsloTimeRange(requirement.shiftStartsAt, requirement.shiftEndsAt)}`,
            replaceSingleLead: action.action === "conflict" && requirement.replaceSingleLeadAssignment === true,
            expectedCurrentAssignmentId: action.action === "conflict"
              ? requirement.replaceSingleLeadAssignmentId
              : "",
          });
          if (result?.ok && result.record?.id) {
            created += 1;
            appliedAssignments.push(result.record);
            requirement.linkedAssignmentIds = [...new Set([...(requirement.linkedAssignmentIds || []), result.record.id])];
          } else {
            const message = String(result?.message || result?.error?.message || "").toLowerCase();
            if (message.includes("single-lead") || message.includes("already assigned")) conflicts += 1;
            else failed += 1;
          }
        }
      }

      const finalSave = await updateEventPlan(editor.id, {
        status: "draft",
        setup: { ...editor.setup, staffingProposal: workingProposal },
        version: editor.version || 1,
      });
      if (finalSave.ok) {
        setPlans((current) => [finalSave.record, ...current.filter((plan) => plan.id !== finalSave.record.id)]);
        setEditorFromRecord(finalSave.record);
      } else {
        await onRefreshEventOperations?.("smart_staffing_assignments_applied_without_links");
        setPlanStatus({
          type: "error",
          message: `${created} assignments were created, but their Smart Plan links could not be saved. Command Structure remains the operational source. ${finalSave.message || ""}`.trim(),
        });
        return;
      }
      await onRefreshEventOperations?.("smart_staffing_assignments_applied");
      const stats = staffingProposalStats(workingProposal, appliedAssignments);
      setPlanStatus({
        type: failed || conflicts ? "error" : "success",
        message: `${created} created, ${reused} reused, ${skipped} skipped, ${conflicts} conflict${conflicts === 1 ? "" : "s"}, ${failed} failed. ${stats.open} planned slot${stats.open === 1 ? "" : "s"} remain open.`,
      });
      setConfirmStaffingOverlap(false);
    } catch (error) {
      setPlanStatus({ type: "error", message: error?.message || "Unexpected staffing assignment error." });
    } finally {
      setLoadingPlan(false);
    }
  }

  async function saveDraft() {
    if (!editor?.id) return;
    if (editor.status === "applied") {
      setPlanStatus({ type: "error", message: "Applied plans are read-only. Regenerate to create a new editable version." });
      return;
    }
    if (!editor.title?.trim()) {
      setPlanStatus({ type: "error", message: "Plan title is required." });
      return;
    }
    const validationMessage = validateSmartPlanItems(editor.planItems || []);
    if (validationMessage) {
      setPlanStatus({ type: "error", message: validationMessage });
      return;
    }
    setPlanStatus({ type: "pending", message: "Saving draft..." });
    const result = await updateEventPlan(editor.id, {
      status: "draft",
      title: editor.title.trim(),
      setup: editor.setup,
      warnings: editor.warnings || [],
      planItems: planItemsForStorage(editor.planItems),
      guideRefs: editor.guideRefs,
      rigRefs: editor.rigRefs,
      version: (editor.version || 1) + 1,
    });
    if (!result.ok) {
      setPlanStatus({ type: "error", message: result.message || "Draft could not be saved." });
      return;
    }
    setPlans((current) => [result.record, ...current.filter((plan) => plan.id !== result.record.id)]);
    setEditorFromRecord(result.record);
    setPlanStatus({ type: "success", message: "Draft saved." });
    onRefreshEventOperations?.("smart_event_plan_draft_saved");
  }

  async function dismissPlan() {
    const planId = editor?.id || activePlan?.id;
    if (!planId) return;
    setPlanStatus({ type: "pending", message: "Dismissing suggestion..." });
    const result = await dismissEventPlan(planId);
    if (!result.ok) {
      setPlanStatus({ type: "error", message: result.message || "Suggestion could not be dismissed." });
      return;
    }
    setPlans((current) => [result.record, ...current.filter((plan) => plan.id !== result.record.id)]);
    setEditor(null);
    setPlanStatus({ type: "success", message: "Suggestion dismissed." });
    if (reviewMode) onCloseReview?.();
    onRefreshEventOperations?.("smart_event_plan_dismissed");
  }

  async function applyPlan() {
    if (!editor?.id || !activeEvent?.id) return;
    if (editor.status === "applied") return;
    const includedItems = (editor.planItems || []).filter((item) => item.included !== false);
    if (!includedItems.length) {
      setPlanStatus({ type: "error", message: "Choose at least one plan item before applying." });
      return;
    }
    if (!editor.title?.trim()) {
      setPlanStatus({ type: "error", message: "Plan title is required." });
      return;
    }
    const validationMessage = validateSmartPlanItems(editor.planItems || []);
    if (validationMessage) {
      setPlanStatus({ type: "error", message: validationMessage });
      return;
    }
    setLoadingPlan(true);
    setPlanStatus({ type: "pending", message: "Saving the latest plan before applying..." });
    try {
      const storedPlanItems = planItemsForStorage(editor.planItems);
      const saved = await updateEventPlan(editor.id, {
        status: "draft",
        title: editor.title.trim(),
        setup: editor.setup,
        warnings: editor.warnings || [],
        planItems: storedPlanItems,
        guideRefs: editor.guideRefs,
        rigRefs: editor.rigRefs,
        version: editor.version || 1,
      });
      if (!saved.ok || !saved.record?.id) {
        setPlanStatus({
          type: "error",
          message: saved.message || "The edited plan could not be saved, so no tasks were created.",
        });
        return;
      }

      setPlans((current) => [saved.record, ...current.filter((plan) => plan.id !== saved.record.id)]);
      setEditorFromRecord(saved.record);

      const existingPlanItemIds = new Set(
        eventTasks
          .filter((task) => task.metadata?.eventPlanId === editor.id)
          .map((task) => task.metadata?.planItemId)
          .filter(Boolean),
      );
      let createdCount = 0;
      let skippedCount = 0;
      const failures = [];

      for (let index = 0; index < includedItems.length; index += 1) {
        const item = includedItems[index];
        setPlanStatus({
          type: "pending",
          message: `Applying plan item ${index + 1} of ${includedItems.length}: ${item.title.trim()}`,
        });
        if (existingPlanItemIds.has(item.planItemId)) {
          skippedCount += 1;
          continue;
        }

        const dueAt = item.dueAt ? fromOsloDateTimeLocalValue(item.dueAt) : "";
        const remindAt = item.remindAt ? fromOsloDateTimeLocalValue(item.remindAt) : "";
        const audience = smartPlanItemAudience(item);
        let result;
        try {
          result = await onCreateTask({
            eventId: activeEvent.id,
            title: item.title.trim(),
            description: item.description?.trim() || "",
            dueAt,
            remindAt,
            zone: item.zone || "all",
            priority: item.priority || "normal",
            assignedRoleKey: item.assignedRoleKey || "",
            assignedOperatorName: "",
            status: "pending",
            createdByName: user.name,
            metadata: {
              ...(item.metadata || {}),
              ...(audience ? { audience } : {}),
              eventPlanId: editor.id,
              eventPlanVersion: saved.record.version || editor.version || 1,
              planItemId: item.planItemId,
              suggestedTemplateId: saved.record.suggestedTemplateId || editor.suggestedTemplateId,
              source: "smart_event_plan",
              guideRef: item.guideRef || "",
              rigRef: item.rigRef || "",
              phase: item.phase || "",
            },
          });
        } catch (error) {
          failures.push({
            planItemId: item.planItemId,
            title: item.title,
            message: error?.message || "Unexpected task creation error.",
          });
          continue;
        }
        const record = result?.record || result;
        if (result?.ok || record?.id) {
          createdCount += 1;
          existingPlanItemIds.add(item.planItemId);
        } else if (isSmartPlanDuplicateResult(result)) {
          skippedCount += 1;
          existingPlanItemIds.add(item.planItemId);
        } else {
          failures.push({
            planItemId: item.planItemId,
            title: item.title,
            message: result?.message || result?.error?.message || "Unknown task creation error.",
          });
        }
      }

      await onRefreshEventOperations?.("smart_event_plan_apply_progress");
      if (failures.length) {
        const firstFailure = failures[0];
        setPlanStatus({
          type: "error",
          message: `${createdCount} created, ${skippedCount} already existed, ${failures.length} failed. The plan remains a draft and can be retried. ${firstFailure.title}: ${firstFailure.message}`,
        });
        return;
      }

      const applied = await markEventPlanApplied(editor.id);
      if (!applied.ok) {
        setPlanStatus({
          type: "error",
          message: `${createdCount} created and ${skippedCount} already existed, but the plan could not be marked applied. Retry to finish safely. ${applied.message || ""}`.trim(),
        });
        return;
      }
      setPlans((current) => [applied.record, ...current.filter((plan) => plan.id !== applied.record.id)]);
      setEditorFromRecord(applied.record);
      setPlanStatus({
        type: "success",
        message: `Plan applied: ${createdCount} task${createdCount === 1 ? "" : "s"} created, ${skippedCount} already present.`,
      });
      await onRefreshEventOperations?.("smart_event_plan_applied");
    } catch (error) {
      setPlanStatus({ type: "error", message: error?.message || "Unexpected error while applying plan." });
    } finally {
      setLoadingPlan(false);
    }
  }

  const compactPlan = editableEventPlan(activePlan, activeEvent);
  const displayedPlan = reviewMode ? editor : compactPlan;
  const displayedSetup = deriveEventPlanOperationalWindow(
    activeEvent,
    displayedPlan?.setup || {},
  );
  const includedStats = smartPlanIncludedStats(displayedPlan);
  const linkedResourceNames = [
    ...new Set(
      linkedResources
        .map((resource) => resource.sourceName || resource.location || resource.title)
        .filter(Boolean),
    ),
  ];
  const planReadOnly = displayedPlan?.status === "applied";
  const displayedStaffingProposal = displayedPlan
    ? syncStaffingProposalAssignments(
        displayedPlan.setup?.staffingProposal || derivedStaffingProposal(displayedPlan),
        eventAssignments,
      )
    : null;
  const staffingStats = staffingProposalStats(displayedStaffingProposal || {}, eventAssignments);
  const staffingOverlaps = staffingOverlapWarnings(displayedStaffingProposal || {}, staffProfiles, eventAssignments);
  const recommendedPrepMinutes = smartPlanNeedsLongerPrep(displayedPlan);
  const planStatusClass =
    planStatus.type === "error"
      ? "critical-warning"
      : planStatus.type === "success"
        ? "all-clear"
        : "status-message";

  if (reviewMode) {
    if (!activeEvent || !editor) {
      return (
        <section className="manager-list smart-plan-review-view">
          <button type="button" className="ghost-button compact-button smart-plan-back" onClick={onCloseReview}>
            Back to Event Operations
          </button>
          <h2>Smart Plan review</h2>
          <p className="muted">{activeEvent ? "Loading the selected plan..." : "Select an Event Board first."}</p>
          {planStatus.message && <p className={planStatusClass}>{planStatus.message}</p>}
        </section>
      );
    }

    return (
      <section className="manager-list smart-plan-review-view">
        <button type="button" className="ghost-button compact-button smart-plan-back" onClick={onCloseReview}>
          Back to Event Operations
        </button>

        <div className="section-heading static-heading">
          <div>
            <p className="eyebrow">Smart Plan review</p>
            <h2>{activeEvent.title}</h2>
          </div>
          <span>{smartPlanStatusLabel(editor.status)}</span>
        </div>

        <div className="smart-plan-review-summary">
          <div>
            <small>Event</small>
            <strong>{activeEvent.title}</strong>
            <span>{activeEvent.venue || "No venue"}</span>
          </div>
          <div>
            <small>Official event</small>
            <strong>{formatOsloTimeRange(activeEvent.startsAt, activeEvent.endsAt)}</strong>
            <span>Europe/Oslo</span>
          </div>
          <div>
            <small>Operational window</small>
            <strong>{formatOsloTimeRange(displayedSetup.prepStartsAt, displayedSetup.closeEndsAt)}</strong>
            <span>
              Prep {displayedSetup.prepMinutesBefore} min | Close {displayedSetup.closeMinutesAfter} min
            </span>
          </div>
          <div>
            <small>Plan</small>
            <strong>{editor.title || "Untitled plan"}</strong>
            <span>Version {editor.version} | {confidenceLabel(editor.confidence)} confidence</span>
          </div>
          <div>
            <small>Included</small>
            <strong>{includedStats.included} of {includedStats.total}</strong>
            <span>tasks</span>
          </div>
          <div>
            <small>Warnings</small>
            <strong>{smartPlanWarningCount(editor)}</strong>
            <span>{linkedResourceNames.length ? linkedResourceNames.join(", ") : "No linked resources"}</span>
          </div>
        </div>

        <div className="smart-plan-sticky-actions" role="toolbar" aria-label="Smart Plan actions">
          <button
            type="button"
            className="primary-button compact-button"
            onClick={saveDraft}
            disabled={loadingPlan || planReadOnly}
          >
            Save draft
          </button>
          <button
            type="button"
            className="primary-button compact-button"
            onClick={applyPlan}
            disabled={loadingPlan || planReadOnly}
          >
            Apply plan
          </button>
        </div>

        {planStatus.message && <p className={planStatusClass}>{planStatus.message}</p>}
        {planReadOnly && (
          <p className="muted">Applied plans are read-only. Regenerate from Event Operations to create a new editable version.</p>
        )}

        <label className="smart-plan-title-field">
          Plan title
          <input
            value={editor.title}
            disabled={planReadOnly}
            onChange={(event) => setEditor((current) => ({ ...current, title: event.target.value }))}
          />
        </label>

        <section className="smart-plan-review-section">
          <div className="smart-plan-section-title">
            <div>
              <h3>Operational window</h3>
              <p className="muted">
                Official event time stays unchanged. Recalculation only changes the suggested plan task times.
              </p>
            </div>
            <button
              type="button"
              className="ghost-button compact-button"
              onClick={recalculateSuggestedTimes}
              disabled={planReadOnly}
            >
              Recalculate suggested times
            </button>
          </div>
          <div className="smart-plan-window-grid">
            <label>
              Prep begins
              <select
                value={customWindowMode.prep ? "custom" : String(displayedSetup.prepMinutesBefore)}
                disabled={planReadOnly}
                onChange={(event) => selectWindowOption("prep", event.target.value)}
              >
                {[30, 60, 90, 120].map((minutes) => (
                  <option key={minutes} value={minutes}>{minutes} min before</option>
                ))}
                <option value="custom">Custom</option>
              </select>
              {customWindowMode.prep && (
                <input
                  type="number"
                  min="0"
                  max="480"
                  step="5"
                  value={displayedSetup.prepMinutesBefore}
                  disabled={planReadOnly}
                  onChange={(event) => {
                    if (event.target.value !== "") updateOperationalWindow("prep", event.target.value);
                  }}
                />
              )}
            </label>
            <label>
              Close ends
              <select
                value={customWindowMode.close ? "custom" : String(displayedSetup.closeMinutesAfter)}
                disabled={planReadOnly}
                onChange={(event) => selectWindowOption("close", event.target.value)}
              >
                {[30, 60, 90, 120].map((minutes) => (
                  <option key={minutes} value={minutes}>{minutes} min after</option>
                ))}
                <option value="custom">Custom</option>
              </select>
              {customWindowMode.close && (
                <input
                  type="number"
                  min="0"
                  max="480"
                  step="5"
                  value={displayedSetup.closeMinutesAfter}
                  disabled={planReadOnly}
                  onChange={(event) => {
                    if (event.target.value !== "") updateOperationalWindow("close", event.target.value);
                  }}
                />
              )}
            </label>
          </div>
          <p className="smart-plan-window-line">
            Operational window: {formatOsloTimeRange(displayedSetup.prepStartsAt, displayedSetup.closeEndsAt)}
            {" | "}Event service: {formatOsloTimeRange(activeEvent.startsAt, activeEvent.endsAt)}
          </p>
          {recommendedPrepMinutes > 0 && (
            <div className="smart-plan-recommendation">
              <p>
                This setup may need {recommendedPrepMinutes} minutes rather than the current {displayedSetup.prepMinutesBefore}-minute prep window.
                {editor.setup?.prepRecommendationReasons?.length
                  ? ` Signals: ${editor.setup.prepRecommendationReasons.join(", ")}.`
                  : ""}
              </p>
              <button
                type="button"
                className="ghost-button compact-button"
                disabled={planReadOnly}
                onClick={() => {
                  setCustomWindowMode((current) => ({ ...current, prep: false }));
                  updateOperationalWindow("prep", recommendedPrepMinutes);
                }}
              >
                Extend prep to {recommendedPrepMinutes} minutes
              </button>
            </div>
          )}
        </section>

        <section className="smart-plan-review-section">
          <h3>Why this plan was suggested</h3>
          {(editor.rationale || []).map((reason) => <p key={reason} className="muted">{reason}</p>)}
          {(editor.warnings || editor.setup?.warnings || []).map((warning) => (
            <p key={warning} className="critical-warning">{warning}</p>
          ))}
        </section>

        <section ref={staffingSectionRef} className="smart-plan-review-section smart-staffing-section">
          <div className="smart-plan-section-title">
            <div>
              <h3>Staffing &amp; Zones</h3>
              <p className="muted">Recommended staffing is a planning draft. Real people are assigned only when you apply staffing assignments.</p>
            </div>
            <button
              type="button"
              className="ghost-button compact-button"
              onClick={() => {
                onCloseReview?.();
                window.setTimeout(() => document.getElementById("event-command-structure")?.scrollIntoView?.({ behavior: "smooth" }), 50);
              }}
            >
              Open Command Structure
            </button>
          </div>

          <div className="smart-staffing-summary">
            <div><small>Recommended</small><strong>{staffingStats.recommended}</strong></div>
            <div><small>Assigned</small><strong>{staffingStats.assigned}</strong></div>
            <div><small>Open positions</small><strong>{staffingStats.open}</strong></div>
            <div><small>Confidence</small><strong>{confidenceLabel(displayedStaffingProposal?.confidence || 0)}</strong></div>
          </div>
          <p className="muted">
            Active zones: {(displayedStaffingProposal?.activeZones || []).length
              ? displayedStaffingProposal.activeZones.map(zoneDisplayLabel).join(" · ")
              : "No specific zones detected"}
          </p>
          {displayedStaffingProposal?.guestCount ? (
            <p className="status-message">Staffing based on known guest count: {displayedStaffingProposal.guestCount}.</p>
          ) : (
            <p className="critical-warning">Staffing based on incomplete information. Venue capacity is not confirmed attendance.</p>
          )}
          {(displayedStaffingProposal?.warnings || []).map((warning) => <p key={warning} className="critical-warning">{warning}</p>)}
          {staffingOverlaps.map((warning) => <p key={warning} className="critical-warning">{warning}</p>)}

          <div className="backup-actions smart-staffing-actions">
            <button type="button" className="primary-button compact-button" disabled={planReadOnly} onClick={() => {
              setEditor((current) => ({
                ...current,
                setup: {
                  ...current.setup,
                  staffingProposal: {
                    ...(current.setup?.staffingProposal || derivedStaffingProposal(current)),
                    requirements: (current.setup?.staffingProposal?.requirements || derivedStaffingProposal(current)?.requirements || []).map((item) => ({ ...item, included: true })),
                  },
                },
              }));
              setPlanStatus({ type: "pending", message: "Suggested staffing included. Save the draft or assign people when ready." });
            }}>
              Use suggested staffing
            </button>
            <button type="button" className="ghost-button compact-button" disabled={planReadOnly} onClick={resetStaffingRecommendation}>
              Reset to recommendation
            </button>
            <button type="button" className="ghost-button compact-button" disabled={planReadOnly} onClick={addStaffingRequirement}>
              Add role/zone
            </button>
          </div>

          <div className="smart-staffing-list">
            {(displayedStaffingProposal?.requirements || []).map((requirement) => {
              const assigned = staffingRequirementAssignments(requirement, eventAssignments);
              const open = staffingRequirementOpenCount(requirement, eventAssignments);
              const expanded = expandedStaffing[requirement.requirementId] === true;
              const selectedIds = requirement.assignedUserIds || [];
              const filteredProfiles = staffProfiles.filter((profile) => staffProfileMatchesSearch(profile, staffSearch));
              return (
                <article key={requirement.requirementId} className={`smart-staffing-requirement ${requirement.included === false ? "is-excluded" : ""}`}>
                  <div className="smart-staffing-row">
                    <div>
                      <strong>{requirement.roleLabel}</strong>
                      <small>
                        {requirement.zoneLabel || zoneDisplayLabel(requirement.zoneKey)} · {requirement.recommendedCount} recommended · {assigned.length} assigned · {open} open
                      </small>
                      <small>{formatOsloTimeRange(requirement.shiftStartsAt, requirement.shiftEndsAt)}</small>
                      {assigned.length < Number(requirement.minimumCount || 0) && (
                        <small className="critical-text">Below minimum staffing by {Number(requirement.minimumCount || 0) - assigned.length}.</small>
                      )}
                      {assigned.length > Number(requirement.recommendedCount || 0) && (
                        <small className="critical-text">Assigned headcount is above the recommendation.</small>
                      )}
                    </div>
                    <div className="smart-staffing-row-actions">
                      {!planReadOnly && (
                        <div className="smart-staffing-stepper" aria-label={`${requirement.roleLabel} recommended count`}>
                          <button type="button" onClick={() => updateStaffingRequirement(requirement.requirementId, {
                            recommendedCount: Math.max(0, Number(requirement.recommendedCount || 0) - 1),
                          })}>−</button>
                          <span>{requirement.recommendedCount}</span>
                          <button type="button" onClick={() => updateStaffingRequirement(requirement.requirementId, {
                            recommendedCount: Number(requirement.recommendedCount || 0) + 1,
                          })}>+</button>
                        </div>
                      )}
                      <button type="button" className="ghost-button compact-button" onClick={() => setExpandedStaffing((current) => ({
                        ...current,
                        [requirement.requirementId]: !current[requirement.requirementId],
                      }))}>
                        {expanded ? "Close" : planReadOnly ? "View" : "Assign staff / Edit"}
                      </button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="smart-staffing-editor">
                      <label className="toggle-row">
                        <input type="checkbox" checked={requirement.included !== false} disabled={planReadOnly} onChange={(event) => updateStaffingRequirement(requirement.requirementId, { included: event.target.checked })} />
                        Included in staffing plan
                      </label>
                      <label>
                        Role
                        <select disabled={planReadOnly} value={requirement.roleKey} onChange={(event) => {
                          const role = staffingRoleOptions.find((item) => item.key === event.target.value);
                          updateStaffingRequirement(requirement.requirementId, {
                            roleKey: role.key,
                            roleLabel: role.label,
                            zoneKey: role.zone,
                            zoneLabel: zoneDisplayLabel(role.zone),
                          });
                        }}>
                          {staffingRoleOptions.map((role) => <option key={role.key} value={role.key}>{role.label}</option>)}
                        </select>
                      </label>
                      <label>
                        Display label
                        <input disabled={planReadOnly} value={requirement.roleLabel} onChange={(event) => updateStaffingRequirement(requirement.requirementId, { roleLabel: event.target.value })} />
                      </label>
                      <label>
                        Zone
                        <select disabled={planReadOnly} value={requirement.zoneKey} onChange={(event) => updateStaffingRequirement(requirement.requirementId, {
                          zoneKey: event.target.value,
                          zoneLabel: zoneDisplayLabel(event.target.value),
                        })}>
                          {eventZones.map((zone) => <option key={zone} value={zone}>{zoneDisplayLabel(zone)}</option>)}
                        </select>
                      </label>
                      <label>
                        Recommended count
                        <input type="number" min="0" max="50" disabled={planReadOnly} value={requirement.recommendedCount} onChange={(event) => updateStaffingRequirement(requirement.requirementId, { recommendedCount: Math.max(0, Number(event.target.value) || 0) })} />
                      </label>
                      <label>
                        Minimum count
                        <input type="number" min="0" max="50" disabled={planReadOnly} value={requirement.minimumCount} onChange={(event) => updateStaffingRequirement(requirement.requirementId, { minimumCount: Math.max(0, Number(event.target.value) || 0) })} />
                      </label>
                      <label>
                        Shift starts (Oslo)
                        <input type="datetime-local" disabled={planReadOnly} value={toOsloDateTimeLocalValue(requirement.shiftStartsAt)} onChange={(event) => updateStaffingRequirement(requirement.requirementId, { shiftStartsAt: fromOsloDateTimeLocalValue(event.target.value) })} />
                      </label>
                      <label>
                        Shift ends (Oslo)
                        <input type="datetime-local" disabled={planReadOnly} value={toOsloDateTimeLocalValue(requirement.shiftEndsAt)} onChange={(event) => updateStaffingRequirement(requirement.requirementId, { shiftEndsAt: fromOsloDateTimeLocalValue(event.target.value) })} />
                      </label>
                      <label className="toggle-row">
                        <input type="checkbox" checked={requirement.required === true} disabled={planReadOnly} onChange={(event) => updateStaffingRequirement(requirement.requirementId, { required: event.target.checked })} />
                        Required role
                      </label>
                      <label className="smart-plan-wide-field">
                        Reason / notes
                        <textarea rows="2" disabled={planReadOnly} value={(requirement.rationale || []).join(" ")} onChange={(event) => updateStaffingRequirement(requirement.requirementId, { rationale: [event.target.value] })} />
                      </label>
                      {requirement.manuallyEdited && <p className="status-message smart-plan-wide-field">Manually edited</p>}

                      <div className="smart-staffing-people smart-plan-wide-field">
                        <div className="smart-plan-section-title">
                          <div>
                            <strong>Assign people</strong>
                            <p className="muted">{selectedIds.length} selected for this plan · proposed shift {formatOsloTimeRange(requirement.shiftStartsAt, requirement.shiftEndsAt)}</p>
                          </div>
                        </div>
                        {!planReadOnly && <input type="search" placeholder="Search staff by name" value={staffSearch} onChange={(event) => setStaffSearch(event.target.value)} />}
                        {staffProfileStatus && <p className="muted">{staffProfileStatus}</p>}
                        {!planReadOnly && (
                          <div className="smart-staffing-profile-list">
                            {filteredProfiles.map((profile) => {
                              const profileAuthUserId = staffingProfileAuthUserId(profile);
                              const selected = selectedIds.includes(profileAuthUserId);
                              const exactExisting = eventAssignments.some((assignment) => staffingAssignmentMatches(assignment, requirement, profile));
                              return (
                                <button key={profile.profileId || profileAuthUserId} type="button" className={selected ? "is-selected" : ""} onClick={() => toggleProfileForRequirement(requirement, profile)}>
                                  <strong>{staffingProfileDisplayName(profile)}</strong>
                                  {profile.email && <span>{profile.email}</span>}
                                  <small>{exactExisting ? "Already in Command Structure" : selected ? "Selected" : "Available"}</small>
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {assigned.length > 0 && (
                          <div className="smart-staffing-current">
                            <strong>Current Event Command Structure</strong>
                            {assigned.map((assignment) => (
                              <div key={assignment.id}>
                                <span>{assignment.assignedOperatorName || "Assigned profile"}</span>
                                {!planReadOnly && (
                                  <div>
                                    <button type="button" className="text-button" onClick={() => updateStaffingRequirement(requirement.requirementId, {
                                      assignedUserIds: selectedIds.filter((id) => id !== assignment.assignedAuthUserId),
                                      linkedAssignmentIds: (requirement.linkedAssignmentIds || []).filter((id) => id !== assignment.id),
                                    })}>Remove from plan only</button>
                                    <button type="button" className="text-button critical-text" onClick={() => removeOperationalStaffingAssignment(requirement, assignment)}>Remove plan and event assignment</button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {!planReadOnly && (
                        <button type="button" className="text-button critical-text smart-plan-wide-field" onClick={() => updateStaffingRequirement(requirement.requirementId, { included: false, assignedUserIds: [] })}>
                          Remove requirement from plan
                        </button>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {!planReadOnly && (
            <button type="button" className="primary-button smart-staffing-apply" disabled={loadingPlan} onClick={applyStaffingAssignments}>
              {confirmStaffingOverlap ? "Confirm staffing overlaps" : "Apply staffing assignments"}
            </button>
          )}
          {planReadOnly && <p className="muted">Applied staffing is read-only here. Use Command Structure for explicit amendments.</p>}
        </section>

        {relevantRigGuides.length > 0 && (
          <section className="smart-plan-review-section">
            <h3>Rig references</h3>
            <div className="smart-plan-rig-list">
              {relevantRigGuides.map((guide) => (
                <article key={guide.id} className="log-row">
                  <strong>{guide.title}</strong>
                  <small>{guide.notes || "Rig image not added yet."}</small>
                  {guide.checklist?.length > 0 && <small>{guide.checklist.join(" | ")}</small>}
                </article>
              ))}
            </div>
          </section>
        )}

        {["before", "during", "after"].map((phase) => {
          const phaseItems = (editor.planItems || []).filter(
            (item) => (item.phase || "before") === phase,
          );
          const included = phaseItems.filter((item) => item.included !== false).length;
          const phaseIsExpanded = expandedPhases[phase] === true;
          return (
            <section key={phase} className="smart-plan-phase">
              <div className="smart-plan-phase-header">
                <button
                  type="button"
                  className="smart-plan-phase-toggle"
                  onClick={() => setExpandedPhases((current) => ({ ...current, [phase]: !current[phase] }))}
                >
                  <strong>{phase.toUpperCase()}</strong>
                  <span>{included}/{phaseItems.length} included | {phaseIsExpanded ? "Hide" : "Show"}</span>
                </button>
                {!planReadOnly && phaseItems.length > 0 && (
                  <div className="smart-plan-phase-actions">
                    <button type="button" className="text-button" onClick={() => setPhaseIncluded(phase, true)}>Include all</button>
                    <button type="button" className="text-button" onClick={() => setPhaseIncluded(phase, false)}>Exclude all</button>
                  </div>
                )}
              </div>
              {phaseIsExpanded && (
                <div className="smart-plan-item-list">
                  {phaseItems.length === 0 && <p className="muted">No tasks in this phase.</p>}
                  {phaseItems.map((item) => {
                    const itemExpanded = expandedPlanItems[item.planItemId] === true;
                    const audience = smartPlanItemAudience(item);
                    return (
                      <article key={item.planItemId} className={`smart-plan-item ${item.included === false ? "is-excluded" : ""}`}>
                        <div className="smart-plan-item-row">
                          <label className="smart-plan-item-check">
                            <input
                              type="checkbox"
                              checked={item.included !== false}
                              disabled={planReadOnly}
                              aria-label={`Include ${item.title || "plan item"}`}
                              onChange={(event) => updatePlanItem(item.planItemId, { included: event.target.checked })}
                            />
                          </label>
                          <div className="smart-plan-item-summary">
                            <strong>{item.title || "Untitled task"}</strong>
                            <small>
                              {item.dueAt ? item.dueAt.slice(11, 16) : "No due time"} |{" "}
                              {eventRoleLabel(item.assignedRoleKey) || "No role"} |{" "}
                              {zoneDisplayLabel(item.zone || "all")} | {item.priority || "normal"}
                            </small>
                          </div>
                          <button
                            type="button"
                            className="ghost-button compact-button"
                            onClick={() => setExpandedPlanItems((current) => ({
                              ...current,
                              [item.planItemId]: !current[item.planItemId],
                            }))}
                          >
                            {itemExpanded ? "Close" : planReadOnly ? "View" : "Edit"}
                          </button>
                        </div>
                        {itemExpanded && (
                          <div className="smart-plan-item-editor">
                            <label>
                              Title
                              <input disabled={planReadOnly} value={item.title} onChange={(event) => updatePlanItem(item.planItemId, { title: event.target.value })} />
                            </label>
                            <label className="smart-plan-wide-field">
                              Description
                              <textarea disabled={planReadOnly} rows="3" value={item.description || ""} onChange={(event) => updatePlanItem(item.planItemId, { description: event.target.value })} />
                            </label>
                            <label>
                              Due time (Oslo)
                              <input disabled={planReadOnly} type="datetime-local" value={item.dueAt || ""} onChange={(event) => updatePlanItem(item.planItemId, { dueAt: event.target.value })} />
                            </label>
                            <label>
                              Reminder time (Oslo)
                              <input disabled={planReadOnly} type="datetime-local" value={item.remindAt || ""} onChange={(event) => updatePlanItem(item.planItemId, { remindAt: event.target.value })} />
                            </label>
                            <label>
                              Phase
                              <select disabled={planReadOnly} value={item.phase || "before"} onChange={(event) => updatePlanItem(item.planItemId, { phase: event.target.value })}>
                                {["before", "during", "after"].map((value) => <option key={value} value={value}>{value}</option>)}
                              </select>
                            </label>
                            <label>
                              Zone
                              <select disabled={planReadOnly} value={item.zone || "all"} onChange={(event) => updatePlanItem(item.planItemId, { zone: event.target.value })}>
                                {eventZones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
                              </select>
                            </label>
                            <label>
                              Role
                              <select disabled={planReadOnly} value={item.assignedRoleKey || ""} onChange={(event) => updatePlanItem(item.planItemId, { assignedRoleKey: event.target.value })}>
                                <option value="">No role</option>
                                {eventRoleOptions.map((role) => <option key={role.key} value={role.key}>{role.label}</option>)}
                              </select>
                            </label>
                            <label>
                              Audience
                              <select disabled={planReadOnly} value={audience} onChange={(event) => updatePlanItemAudience(item.planItemId, event.target.value)}>
                                <option value="">Assignment/role only</option>
                                <option value="all_event_staff">All event staff</option>
                                {audience && audience !== "all_event_staff" && <option value={audience}>{audience}</option>}
                              </select>
                            </label>
                            <label>
                              Priority
                              <select disabled={planReadOnly} value={item.priority || "normal"} onChange={(event) => updatePlanItem(item.planItemId, { priority: event.target.value })}>
                                {["low", "normal", "important", "critical"].map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                              </select>
                            </label>
                            <label>
                              Guide reference
                              <input value={item.guideRef || "None"} readOnly />
                            </label>
                            <label>
                              Rig reference
                              <input value={item.rigRef || "None"} readOnly />
                            </label>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}

        <div className="backup-actions smart-plan-bottom-actions">
          <button type="button" className="primary-button compact-button" onClick={saveDraft} disabled={loadingPlan || planReadOnly}>
            Save draft
          </button>
          <button type="button" className="primary-button compact-button" onClick={applyPlan} disabled={loadingPlan || planReadOnly}>
            Apply plan
          </button>
          <button type="button" className="ghost-button compact-button" onClick={onCloseReview}>
            Back to Event Operations
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="manager-list smart-plan-compact">
      <div className="section-heading static-heading">
        <div>
          <p className="eyebrow">Smart Plan</p>
          <h2>Suggested Event Plan</h2>
        </div>
        <span>{smartPlanStatusLabel(activePlan?.status)}</span>
      </div>
      {!activeEvent ? (
        <p className="muted">Select or create an event board before generating a suggested plan.</p>
      ) : (
        <>
          <div className="smart-plan-compact-body">
            <div className="smart-plan-compact-title">
              <strong>{compactPlan?.title || "No plan generated"}</strong>
              <span>
                {compactPlan
                  ? `Version ${compactPlan.version} | ${confidenceLabel(compactPlan.confidence)} confidence`
                  : "Generate a deterministic starting plan, then review before applying."}
              </span>
            </div>
            <div className="smart-plan-compact-grid">
              <div>
                <small>Event time</small>
                <strong>{formatOsloTimeRange(activeEvent.startsAt, activeEvent.endsAt)}</strong>
              </div>
              <div>
                <small>Operational window</small>
                <strong>{formatOsloTimeRange(displayedSetup.prepStartsAt, displayedSetup.closeEndsAt)}</strong>
              </div>
              <div>
                <small>Included tasks</small>
                <strong>{compactPlan ? `${includedStats.included}/${includedStats.total}` : "-"}</strong>
              </div>
              <div>
                <small>Staffing</small>
                <strong>{compactPlan ? `${staffingStats.recommended} recommended` : "-"}</strong>
                <span>{compactPlan ? `${staffingStats.assigned} assigned · ${staffingStats.open} open` : ""}</span>
              </div>
              <div>
                <small>Zones</small>
                <strong>{displayedStaffingProposal?.activeZones?.length
                  ? displayedStaffingProposal.activeZones.map(zoneDisplayLabel).join(" · ")
                  : "-"}</strong>
              </div>
              <div>
                <small>Warnings</small>
                <strong>{compactPlan ? smartPlanWarningCount(compactPlan) : "-"}</strong>
              </div>
            </div>
            <p className="muted smart-plan-linked-resources">
              Linked resources: {linkedResourceNames.length ? linkedResourceNames.join(", ") : "none"}
            </p>
          </div>
          <div className="backup-actions smart-plan-compact-actions">
            {activeEvent && onOpenCockpit && (
              <button type="button" className="primary-button compact-button" onClick={onOpenCockpit}>
                Open Event Cockpit
              </button>
            )}
            {!compactPlan && (
              <button type="button" className="primary-button compact-button" onClick={generateSuggestion} disabled={loadingPlan || loadingCalendarContext}>
                Generate plan
              </button>
            )}
            {compactPlan && compactPlan.status !== "dismissed" && (
              <button type="button" className="primary-button compact-button" onClick={onOpenReview}>
                Review plan
              </button>
            )}
            {compactPlan && compactPlan.status !== "dismissed" && compactPlan.status !== "applied" && (
              <button type="button" className="ghost-button compact-button" onClick={() => onOpenReview?.("staffing")}>
                Quick add staff
              </button>
            )}
            {compactPlan && (
              <button type="button" className="ghost-button compact-button" onClick={() => setShowRegenerationOptions(true)} disabled={loadingPlan || loadingCalendarContext}>
                {compactPlan.status === "dismissed" ? "Generate new plan" : "Regenerate"}
              </button>
            )}
            {compactPlan && ["suggested", "draft"].includes(compactPlan.status) && (
              <button type="button" className="ghost-button compact-button" onClick={dismissPlan} disabled={loadingPlan}>
                Dismiss
              </button>
            )}
          </div>
          {planStatus.message && (
            <p className={planStatusClass}>{planStatus.message}</p>
          )}
          {showRegenerationOptions && (
            <div className="smart-plan-regeneration">
              <strong>Regenerate staffing safely</strong>
              <p className="muted">Choose how the new recommendation should handle staffing work already in this plan.</p>
              <button type="button" className="primary-button compact-button" onClick={() => generateSuggestion("merge")}>Merge new recommendation</button>
              <button type="button" className="ghost-button compact-button" onClick={() => generateSuggestion("replace_unedited")}>Replace unedited suggestions</button>
              <button type="button" className="text-button" onClick={() => setShowRegenerationOptions(false)}>Cancel</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function EventOperationsCorePanel({
  user,
  date,
  eventOperations,
  eventStaffPresence,
  eventRoleAssignments,
  eventTasks,
  eventHandovers,
  eventLiveUpdates,
  eventRealtimeStatus,
  onCreateEvent,
  onUpdateEvent,
  onAddStaff,
  onAssignRole,
  onRemoveRole,
  onCreateTask,
  onUpdateTaskStatus,
  taskActionStatus,
  onCreateHandover,
  onCreateLiveUpdate,
  onChangeLiveUpdateStatus,
  onOpenGuide,
  onRefreshEventOperations,
}) {
  const todayEvents = eventOperations.filter((event) => event.date === date);
  const [activeEventId, setActiveEventId] = useState(() => {
    const saved = readStorage(EVENT_SELECTED_BOARD_KEY, null);
    return saved?.date === date ? saved.eventId || "" : "";
  });
  const [eventBoardStatus, setEventBoardStatus] = useState({ type: "", message: "" });
  const activeEvent =
    todayEvents.find((event) => event.id === activeEventId) ||
    todayEvents.find((event) => event.id === preferredEventBoardId(todayEvents, activeEventId));
  const activeEventIdValue = activeEvent?.id || "";
  const eventAssignments = eventRoleAssignments.filter(
    (assignment) => assignment.eventId === activeEventIdValue && assignment.active,
  );
  const eventBoardTasks = eventTasks.filter(
    (task) => task.eventId === activeEventIdValue,
  );
  const eventHandoversForEvent = eventHandovers.filter(
    (handover) => handover.eventId === activeEventIdValue,
  );
  const eventLiveUpdatesForEvent = eventLiveUpdates.filter(
    (update) => update.eventId === activeEventIdValue,
  );
  const [eventForm, setEventForm] = useState(() => defaultEventOperationForm());
  const [eventBoardCreating, setEventBoardCreating] = useState(false);
  const [manualStaffName, setManualStaffName] = useState("");
  const [staffStatus, setStaffStatus] = useState({ type: "", message: "" });
  const [assignmentForm, setAssignmentForm] = useState({
    roleKey: "event_floor_manager",
    staffName: "",
    zone: "all",
    notes: "",
  });
  const [assignmentStatus, setAssignmentStatus] = useState({ type: "", message: "" });
  const [taskForm, setTaskForm] = useState(() => defaultEventTaskForm());
  const [taskStatus, setTaskStatus] = useState({ type: "", message: "" });
  const [taskCreating, setTaskCreating] = useState(false);
  const [showLiveEventMode, setShowLiveEventMode] = useState(false);
  const [showCockpit, setShowCockpit] = useState(false);
  const [showSmartPlanReview, setShowSmartPlanReview] = useState(false);
  const [smartPlanReviewFocus, setSmartPlanReviewFocus] = useState("");
  const taskFormRef = useRef(null);
  const taskTitleInputRef = useRef(null);
  const taskFormDisabled = !activeEventIdValue || taskCreating;
  const [handoverForm, setHandoverForm] = useState({
    toName: "",
    responsibilityScope: "all",
    notes: "",
  });
  const [handoverStatus, setHandoverStatus] = useState({ type: "", message: "" });

  const todayEventSignature = todayEvents
    .map((event) => `${event.id}:${event.status}:${event.updatedAt || ""}`)
    .join("|");

  useEffect(() => {
    const nextEventId = preferredEventBoardId(todayEvents, activeEventId);
    if (!nextEventId) {
      if (activeEventId) setActiveEventId("");
      localStorage.removeItem(EVENT_SELECTED_BOARD_KEY);
      return;
    }
    if (nextEventId !== activeEventId) setActiveEventId(nextEventId);
    saveStorage(EVENT_SELECTED_BOARD_KEY, {
      date,
      eventId: nextEventId,
      selectedAt: new Date().toISOString(),
    });
  }, [todayEventSignature, activeEventId, date]);

  function selectEventBoard(eventId) {
    setActiveEventId(eventId);
    setShowSmartPlanReview(false);
    saveStorage(EVENT_SELECTED_BOARD_KEY, {
      date,
      eventId,
      selectedAt: new Date().toISOString(),
    });
    setTaskStatus({ type: "", message: "" });
  }

  const assignmentsByZone = eventCommandZones.map((zone) => ({
    ...zone,
    assignments: eventAssignments.filter((assignment) => {
      const assignmentZone = eventRoleEffectiveZone(assignment.roleKey, assignment.zone);
      if (zone.key === "all") return assignmentZone === "all";
      return assignmentZone === zone.key;
    }),
  }));
  const visibleEventStaffPresence = dedupeEventStaffPresence(eventStaffPresence);

  function eventTaskGroups() {
    const now = Date.now();
    const dueSoon = eventBoardTasks.filter(
      (task) =>
        !["acknowledged", "done", "missed", "cancelled"].includes(task.status) &&
        task.dueAt &&
        new Date(task.dueAt).getTime() - now <= 30 * 60000,
    );
    return [
      ["Due soon", dueSoon],
      ["Pending", eventBoardTasks.filter((task) => task.status === "pending" && !dueSoon.includes(task))],
      ["Acknowledged", eventBoardTasks.filter((task) => task.status === "acknowledged")],
      ["Done", eventBoardTasks.filter((task) => task.status === "done")],
      ["Missed/cancelled", eventBoardTasks.filter((task) => ["missed", "cancelled"].includes(task.status))],
    ];
  }

  function prepareTaskForZone(zoneKey) {
    if (!activeEventIdValue) {
      setTaskStatus({ type: "error", message: "Select or create an event board before preparing a zone task." });
      return;
    }
    const defaults = zoneTaskDefaults(zoneKey);
    setTaskForm((current) => ({
      ...current,
      zone: defaults.zone,
      assignedRoleKey: defaults.assignedRoleKey,
      assignedOperatorName: "",
      priority: defaults.priority,
    }));
    setTaskStatus({
      type: "pending",
      message: `Task form prepared for ${zoneDisplayLabel(defaults.zone)}.`,
    });
    window.requestAnimationFrame(() => {
      taskFormRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      taskTitleInputRef.current?.focus?.();
    });
  }

  async function submitEvent(event) {
    event.preventDefault();
    setEventBoardStatus({ type: "", message: "" });
    if (!eventForm.title.trim()) {
      setEventBoardStatus({ type: "error", message: "Event board title is required." });
      return;
    }
    setEventBoardCreating(true);
    setEventBoardStatus({ type: "pending", message: "Creating event board..." });
    try {
      const result = await onCreateEvent({
        date,
        title: eventForm.title.trim(),
        venue: eventForm.venue.trim(),
        startsAt: fromDateTimeLocalValue(eventForm.startsAt),
        endsAt: fromDateTimeLocalValue(eventForm.endsAt),
        notes: eventForm.notes.trim(),
        status: "draft",
        source: "manual",
        createdByName: user.name,
        activeResponsibleName: user.name,
      });
      const record = result?.record || result;
      if (!record?.id) {
        setEventBoardStatus({
          type: "error",
          message: result?.message || result?.error?.message || "Event board could not be created.",
        });
        return;
      }
      selectEventBoard(record.id);
      setEventForm(defaultEventOperationForm());
      setEventBoardStatus({ type: "success", message: "Event board created and selected." });
    } catch (error) {
      setEventBoardStatus({
        type: "error",
        message: error?.message || "Unexpected error while creating event board.",
      });
    } finally {
      setEventBoardCreating(false);
    }
  }

  async function updateActiveEventStatus(status) {
    if (!activeEvent?.id) return;
    setEventBoardStatus({ type: "pending", message: "Updating event board status..." });
    try {
      const result = await onUpdateEvent(activeEvent.id, { ...activeEvent, status });
      const record = result?.record || result;
      if (!record?.id) {
        setEventBoardStatus({
          type: "error",
          message: result?.message || result?.error?.message || "Event board status could not be updated.",
        });
        return;
      }
      setEventBoardStatus({ type: "success", message: "Event board status updated." });
    } catch (error) {
      setEventBoardStatus({
        type: "error",
        message: error?.message || "Unexpected error while updating event board status.",
      });
    }
  }

  async function submitTask(event) {
    event.preventDefault();
    setTaskStatus({ type: "", message: "" });
    const targetType = taskForm.targetType || "role";
    if (!activeEventIdValue) {
      setTaskStatus({ type: "error", message: "Create or select an event board before adding a task." });
      return;
    }
    if (!taskForm.title.trim()) {
      setTaskStatus({ type: "error", message: "Task title is required." });
      return;
    }
    if (targetType === "person" && !taskForm.assignedOperatorName.trim()) {
      setTaskStatus({ type: "error", message: "Choose a person/operator for this task." });
      return;
    }
    if (targetType === "role" && !taskForm.assignedRoleKey) {
      setTaskStatus({ type: "error", message: "Choose a role for this task, or change target to All event staff." });
      return;
    }
    if (!isValidDateTimeLocalValue(taskForm.dueAt)) {
      setTaskStatus({ type: "error", message: "Due time must be a valid date and time." });
      return;
    }
    if (!isValidDateTimeLocalValue(taskForm.remindAt)) {
      setTaskStatus({ type: "error", message: "Reminder time must be a valid date and time, or empty." });
      return;
    }
    const dueAt = fromDateTimeLocalValue(taskForm.dueAt);
    const remindAt = taskForm.remindAt ? fromDateTimeLocalValue(taskForm.remindAt) : "";
    if (taskForm.dueAt && !dueAt) {
      setTaskStatus({ type: "error", message: "Due time could not be converted. Please choose it again." });
      return;
    }
    if (taskForm.remindAt && !remindAt) {
      setTaskStatus({ type: "error", message: "Reminder time could not be converted. Please choose it again or leave it empty." });
      return;
    }
    setTaskCreating(true);
    setTaskStatus({ type: "pending", message: "Creating task..." });
    try {
      const result = await onCreateTask({
        eventId: activeEventIdValue,
        title: taskForm.title.trim(),
        description: taskForm.description.trim(),
        dueAt,
        remindAt,
        zone: taskForm.zone,
        priority: taskForm.priority,
        assignedRoleKey: targetType === "role" ? taskForm.assignedRoleKey : "",
        assignedOperatorName: targetType === "person" ? taskForm.assignedOperatorName.trim() : "",
        status: "pending",
        createdByName: user.name,
        metadata: {
          audience: targetType === "all_event_staff" ? "all_event_staff" : "",
        },
      });
      const record = result?.record || result;
      if (!result?.ok && !record?.id) {
        setTaskStatus({
          type: "error",
          message: result?.message || result?.error?.message || "Task could not be created.",
        });
        return;
      }
      if (!record?.id) {
        setTaskStatus({ type: "error", message: "Task could not be created. No task record was returned." });
        return;
      }
      setTaskForm(defaultEventTaskForm());
      setTaskStatus({ type: "success", message: result?.message || "Task created." });
    } catch (error) {
      setTaskStatus({
        type: "error",
        message: error?.message || "Unexpected error while creating task.",
      });
    } finally {
      setTaskCreating(false);
    }
  }

  async function submitAssignment(event) {
    event.preventDefault();
    setAssignmentStatus({ type: "", message: "" });
    if (!activeEventIdValue) {
      setAssignmentStatus({ type: "error", message: "Select an event board before assigning a role." });
      return;
    }
    if (!assignmentForm.staffName.trim()) {
      setAssignmentStatus({ type: "error", message: "Choose or enter a staff name before assigning a role." });
      return;
    }
    const role = eventRoleOptions.find((item) => item.key === assignmentForm.roleKey);
    if (!role) {
      setAssignmentStatus({ type: "error", message: "Choose a valid event role before assigning." });
      return;
    }
    const effectiveZone = eventRoleEffectiveZone(role.key, assignmentForm.zone || role.zone);
    const alreadyAssigned = !role.singleLead && eventAssignments.some((assignment) =>
      assignmentMatchesPerson(
        assignment,
        role.key,
        assignmentForm.staffName,
      ),
    );
    if (alreadyAssigned) {
      setAssignmentStatus({
        type: "error",
        message: `${assignmentForm.staffName.trim()} is already assigned as ${role.label}.`,
      });
      return;
    }
    const occupiedSingleLead = role.singleLead
      ? eventAssignments.find(
          (assignment) => assignment.active && assignment.roleKey === role.key,
        )
      : null;
    const replacingSingleLead = Boolean(
      occupiedSingleLead &&
      normalizedPersonName(occupiedSingleLead.assignedOperatorName) !== normalizedPersonName(assignmentForm.staffName),
    );
    if (role.singleLead && occupiedSingleLead && !replacingSingleLead) {
      setAssignmentStatus({
        type: "success",
        message: `${assignmentForm.staffName.trim()} is already assigned as ${role.label}. No change was needed.`,
      });
      return;
    }
    if (replacingSingleLead && !window.confirm(
      `${role.label} is currently assigned to ${occupiedSingleLead.assignedOperatorName || "another person"}. Replace that assignment with ${assignmentForm.staffName.trim()}?`,
    )) return;
    setAssignmentStatus({ type: "pending", message: "Assigning role..." });
    try {
      const result = await onAssignRole({
        eventId: activeEventIdValue,
        roleKey: role.key,
        roleLabel: role.label,
        zone: effectiveZone,
        assignedOperatorName: assignmentForm.staffName.trim(),
        assignedByName: user.name,
        notes: assignmentForm.notes.trim(),
        replaceSingleLead: replacingSingleLead,
        expectedCurrentAssignmentId: replacingSingleLead ? occupiedSingleLead.id : "",
      });
      const record = result?.record || result;
      if (!record?.id) {
        setAssignmentStatus({
          type: "error",
          message: result?.message || result?.error?.message || "Role assignment could not be saved.",
        });
        return;
      }
      setAssignmentForm({ roleKey: "event_floor_manager", staffName: "", zone: "all", notes: "" });
      setAssignmentStatus({ type: "success", message: "Role assigned." });
    } catch (error) {
      setAssignmentStatus({
        type: "error",
        message: error?.message || "Unexpected error while assigning role.",
      });
    }
  }

  async function submitHandover(event) {
    event.preventDefault();
    setHandoverStatus({ type: "", message: "" });
    if (!activeEventIdValue) {
      setHandoverStatus({ type: "error", message: "Select an event board before creating a handover." });
      return;
    }
    if (!handoverForm.toName.trim()) {
      setHandoverStatus({ type: "error", message: "Enter who is taking over before confirming handover." });
      return;
    }
    setHandoverStatus({ type: "pending", message: "Saving handover..." });
    try {
      const result = await onCreateHandover({
        eventId: activeEventIdValue,
        fromName: activeEvent?.activeResponsibleName || user.name,
        toName: handoverForm.toName.trim(),
        responsibilityScope: handoverForm.responsibilityScope,
        notes: handoverForm.notes.trim(),
        createdByName: user.name,
      });
      const record = result?.record || result;
      if (!record?.id) {
        setHandoverStatus({
          type: "error",
          message: result?.message || result?.error?.message || "Handover could not be saved.",
        });
        return;
      }
      setHandoverForm({ toName: "", responsibilityScope: "all", notes: "" });
      setHandoverStatus({ type: "success", message: "Handover saved." });
    } catch (error) {
      setHandoverStatus({
        type: "error",
        message: error?.message || "Unexpected error while saving handover.",
      });
    }
  }

  if (showSmartPlanReview) {
    return (
      <SmartEventPlanPanel
        user={user}
        activeEvent={activeEvent}
        eventAssignments={eventAssignments}
        eventTasks={eventBoardTasks}
        onCreateTask={onCreateTask}
        onAssignRole={onAssignRole}
        onRemoveRole={onRemoveRole}
        onRefreshEventOperations={onRefreshEventOperations}
        reviewMode
        reviewFocus={smartPlanReviewFocus}
        onCloseReview={() => setShowSmartPlanReview(false)}
      />
    );
  }

  if (showCockpit) {
    return (
      <Suspense fallback={<FocusedViewLoading label="Loading Event Cockpit..." />}>
        <EventOperationsCockpit
          user={user}
          eventOperation={activeEvent}
          eventTasks={eventBoardTasks}
          assignments={eventAssignments}
          presence={visibleEventStaffPresence}
          handovers={eventHandoversForEvent}
          liveUpdates={eventLiveUpdatesForEvent}
          managerView
          backendStatus={eventRealtimeStatus}
          refreshToken={[
            activeEvent?.updatedAt || "",
            ...eventBoardTasks.map((item) => item.updatedAt || item.status || ""),
            ...eventAssignments.map((item) => item.updatedAt || item.id),
            ...visibleEventStaffPresence.map((item) => item.lastSeenAt || item.updatedAt || item.id),
            ...eventHandoversForEvent.map((item) => item.createdAt || item.id),
            ...eventLiveUpdatesForEvent.map((item) => item.updatedAt || item.id),
          ].join("|")}
          onClose={() => setShowCockpit(false)}
          onRefresh={onRefreshEventOperations}
          onTaskStatus={onUpdateTaskStatus}
          onCreateLiveUpdate={onCreateLiveUpdate}
          onAcknowledgeLiveUpdate={(id) => onChangeLiveUpdateStatus(id, "acknowledged")}
          onResolveLiveUpdate={(id, note) => onChangeLiveUpdateStatus(id, "resolved", note)}
          onCancelLiveUpdate={(id, note) => onChangeLiveUpdateStatus(id, "cancelled", note)}
          onUpdateEvent={onUpdateEvent}
          onCreateHandover={onCreateHandover}
          onOpenGuide={onOpenGuide}
          onNavigate={(target) => {
            if (target === "plan" || target === "smart-plan" || target === "staffing") {
              setSmartPlanReviewFocus(target === "staffing" ? "staffing" : "");
              setShowCockpit(false);
              setShowSmartPlanReview(true);
            } else if (["tasks", "command-structure", "event-board", "linked-resources", "presence", "guides"].includes(target)) {
              setShowCockpit(false);
            }
          }}
        />
      </Suspense>
    );
  }

  if (showLiveEventMode) {
    return (
      <EventLiveModePanel
        user={user}
        activeEvent={activeEvent}
        eventAssignments={eventAssignments}
        eventTasks={eventBoardTasks}
        eventStaffPresence={visibleEventStaffPresence}
        onCreateTask={onCreateTask}
        onUpdateTaskStatus={onUpdateTaskStatus}
        taskActionStatus={taskActionStatus}
        onOpenGuide={onOpenGuide}
        onOpenCockpit={() => {
          setShowLiveEventMode(false);
          setShowCockpit(true);
        }}
        onClose={() => setShowLiveEventMode(false)}
      />
    );
  }

  return (
    <>
      <section className="manager-list">
        <h2>Today’s event board</h2>
        <p className="muted">
          Manual or imported event operations board.
        </p>
        <GuideQuickLinks
          onOpenGuide={onOpenGuide}
          links={[
            { id: "event-floor-manager-live-control", label: "Guide: Event Floor Manager" },
            { id: "event-operations-troubleshooting", label: "Troubleshooting" },
          ]}
        />
        {eventBoardStatus.message && (
          <p className={eventBoardStatus.type === "error" ? "critical-warning" : eventBoardStatus.type === "success" ? "all-clear" : "status-message"}>
            {eventBoardStatus.message}
          </p>
        )}
        {todayEvents.length === 0 && <p className="muted">No event board created for today.</p>}
        {todayEvents.length > 0 && (
          <label>
            Active event board
            <select value={activeEventIdValue} onChange={(event) => selectEventBoard(event.target.value)}>
              {todayEvents.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title} {event.venue ? `- ${event.venue}` : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        {activeEvent && (
          <article className="log-row">
            <strong>{activeEvent.title}</strong>
            <span>
              {activeEvent.venue || "No venue"} | {activeEvent.status} | Responsible{" "}
              {activeEvent.activeResponsibleName || "not set"}
            </span>
            <small>
              {activeEvent.startsAt ? formatDateTime(activeEvent.startsAt) : "No start time"}
              {activeEvent.endsAt ? ` - ${formatDateTime(activeEvent.endsAt)}` : ""}
            </small>
            <label>
              Status
              <select
                value={activeEvent.status}
                onChange={(event) => updateActiveEventStatus(event.target.value)}
              >
                {["draft", "active", "finished", "cancelled"].map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label>
          </article>
        )}
      </section>

      {activeEvent && (
        <Suspense fallback={<FocusedViewLoading label="Loading Event Cockpit summary..." />}>
          <EventCockpitSummaryCard
            eventOperation={activeEvent}
            eventTasks={eventBoardTasks}
            assignments={eventAssignments}
            presence={visibleEventStaffPresence}
            liveUpdates={eventLiveUpdatesForEvent}
            onOpen={() => setShowCockpit(true)}
          />
        </Suspense>
      )}

      <SmartEventPlanPanel
        user={user}
        activeEvent={activeEvent}
        eventAssignments={eventAssignments}
        eventTasks={eventBoardTasks}
        onCreateTask={onCreateTask}
        onAssignRole={onAssignRole}
        onRemoveRole={onRemoveRole}
        onRefreshEventOperations={onRefreshEventOperations}
        onOpenReview={(focus = "") => {
          setSmartPlanReviewFocus(focus);
          setShowSmartPlanReview(true);
        }}
        onOpenCockpit={() => setShowCockpit(true)}
      />

      {activeEvent && (
        <div className="backup-actions event-operations-primary-actions">
          <button
            type="button"
            className="primary-button compact-button"
            onClick={() => setShowCockpit(true)}
          >
            Open Event Cockpit
          </button>
          <button
            type="button"
            className="primary-button compact-button"
            onClick={() => setShowLiveEventMode(true)}
          >
            Open Live Event Mode
          </button>
        </div>
      )}

      <details className="manager-list event-board-create-details">
        <summary>Create manual event board</summary>
        <form className="editor-form compact-editor" onSubmit={submitEvent}>
          <label>
            Title
            <input value={eventForm.title} onChange={(event) => setEventForm((current) => ({ ...current, title: event.target.value }))} />
          </label>
          <label>
            Venue
            <input value={eventForm.venue} onChange={(event) => setEventForm((current) => ({ ...current, venue: event.target.value }))} />
          </label>
          <label>
            Start
            <input type="datetime-local" value={eventForm.startsAt} onChange={(event) => setEventForm((current) => ({ ...current, startsAt: event.target.value }))} />
          </label>
          <label>
            End
            <input type="datetime-local" value={eventForm.endsAt} onChange={(event) => setEventForm((current) => ({ ...current, endsAt: event.target.value }))} />
          </label>
          <label>
            Notes
            <textarea rows="2" value={eventForm.notes} onChange={(event) => setEventForm((current) => ({ ...current, notes: event.target.value }))} />
          </label>
          <button type="submit" className="primary-button compact-button" disabled={eventBoardCreating}>
            {eventBoardCreating ? "Creating event board..." : "Create manual event"}
          </button>
        </form>
      </details>

      <EventCalendarImportPanel
        eventOperations={eventOperations}
        activeEventId={activeEventIdValue}
        onSelectEvent={selectEventBoard}
        onRefresh={onRefreshEventOperations}
        onOpenGuide={onOpenGuide}
      />

      <EventCommandStructurePanel
        assignments={eventAssignments}
        tasks={eventBoardTasks}
        canManage
        onCreateTaskForZone={prepareTaskForZone}
      />

      <EventRunSheetTemplatesPanel
        activeEvent={activeEvent}
        eventAssignments={eventAssignments}
        eventTasks={eventBoardTasks}
        onCreateTask={onCreateTask}
        createdByName={user.name}
        onOpenGuide={onOpenGuide}
      />

      <section className="manager-list">
        <h2>Event staff available today</h2>
        <p className="muted">People appear here when they log in, choose an operator, or are added manually.</p>
        <form className="inline-actions" onSubmit={async (event) => {
          event.preventDefault();
          setStaffStatus({ type: "", message: "" });
          if (!manualStaffName.trim()) {
            setStaffStatus({ type: "error", message: "Enter a staff name before adding manual staff." });
            return;
          }
          const existingStaff = visibleEventStaffPresence.find(
            (person) => normalizedPersonName(person.operatorName) === normalizedPersonName(manualStaffName),
          );
          if (existingStaff) {
            setStaffStatus({ type: "error", message: `${manualStaffName.trim()} is already available today.` });
            return;
          }
          setStaffStatus({ type: "pending", message: "Adding staff..." });
          try {
            const result = await onAddStaff(manualStaffName.trim());
            const record = result?.record || result;
            if (!record?.id) {
              setStaffStatus({
                type: "error",
                message: result?.message || result?.error?.message || "Manual staff could not be added.",
              });
              return;
            }
            setManualStaffName("");
            setStaffStatus({ type: "success", message: "Staff added." });
          } catch (error) {
            setStaffStatus({
              type: "error",
              message: error?.message || "Unexpected error while adding staff.",
            });
          }
        }}>
          <input
            value={manualStaffName}
            onChange={(event) => setManualStaffName(event.target.value)}
            placeholder="Add staff by name"
          />
          <button type="submit" className="primary-button compact-button">Add staff</button>
        </form>
        {staffStatus.message && (
          <p className={staffStatus.type === "error" ? "critical-warning" : staffStatus.type === "success" ? "all-clear" : "status-message"}>
            {staffStatus.message}
          </p>
        )}
        {visibleEventStaffPresence.length === 0 && <p className="muted">No event staff checked in yet.</p>}
        {visibleEventStaffPresence.map((person) => {
          const roleSummary = eventRoleSummaryForPerson(person, eventAssignments);
          return (
            <article key={`${normalizedPersonName(person.operatorName)}-${person.id}`} className="log-row">
              <strong>{person.operatorName}</strong>
              <span>
                {person.operatorSource || "manual"} | {person.selectedShiftScope || person.roleLabel || "No shift scope"}
              </span>
              <small>
                Last seen {person.lastSeenAt ? formatDateTime(person.lastSeenAt) : "local"}
                {` | ${roleSummary}`}
              </small>
            </article>
          );
        })}
      </section>

      <section className="manager-list">
        <h2>Role assignments</h2>
        <p className="muted">
          Runner reports to Headrunner. Zone managers and Headrunner report to Event Floor Manager.
        </p>
        <form className="editor-form compact-editor" onSubmit={submitAssignment}>
          <label>
            Role
            <select
              value={assignmentForm.roleKey}
              onChange={(event) => {
                const role = eventRoleOption(event.target.value);
                setAssignmentForm((current) => ({
                  ...current,
                  roleKey: event.target.value,
                  zone: role?.zone || "all",
                }));
              }}
            >
              <optgroup label="Command roles - single lead">
                {eventRoleOptions.filter((role) => role.group === "command").map((role) => (
                  <option key={role.key} value={role.key}>{role.label}</option>
                ))}
              </optgroup>
              <optgroup label="Team roles - multiple people allowed">
                {eventRoleOptions.filter((role) => role.group === "team").map((role) => (
                  <option key={role.key} value={role.key}>{role.label}</option>
                ))}
              </optgroup>
            </select>
            <small>
              {eventRoleOption(assignmentForm.roleKey)?.singleLead
                ? "Single-lead role: replacing the active lead requires confirmation."
                : "Team role: multiple people can be assigned."}
            </small>
          </label>
          <label>
            Zone
            <select
              value={assignmentForm.zone}
              onChange={(event) =>
                setAssignmentForm((current) => ({ ...current, zone: event.target.value }))
              }
            >
              {eventZones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
            </select>
          </label>
          <label>
            Staff
            <input
              list="event-staff-presence-list"
              value={assignmentForm.staffName}
              onChange={(event) => setAssignmentForm((current) => ({ ...current, staffName: event.target.value }))}
            />
            <datalist id="event-staff-presence-list">
              {visibleEventStaffPresence.map((person) => (
                <option
                  key={`${normalizedPersonName(person.operatorName)}-${person.id}`}
                  value={person.operatorName}
                  label={eventStaffOptionLabel(person, eventAssignments)}
                >
                  {eventStaffOptionLabel(person, eventAssignments)}
                </option>
              ))}
            </datalist>
          </label>
          <label>
            Notes
            <input value={assignmentForm.notes} onChange={(event) => setAssignmentForm((current) => ({ ...current, notes: event.target.value }))} />
          </label>
          {assignmentStatus.message && (
            <p className={assignmentStatus.type === "error" ? "critical-warning" : assignmentStatus.type === "success" ? "all-clear" : "status-message"}>
              {assignmentStatus.message}
            </p>
          )}
          <button type="submit" className="primary-button compact-button">Assign role</button>
        </form>
        {assignmentsByZone.map((zone) => (
          <div key={zone.key} className="critical-group">
            <h3>{zone.label}</h3>
            {zone.assignments.length === 0 && <p className="muted">No assignments.</p>}
            {zone.assignments.map((assignment) => (
              <article key={assignment.id} className="log-row">
                <strong>{assignment.roleLabel}</strong>
                <span>
                  {assignment.assignedOperatorName || "Unassigned"} |{" "}
                  {eventRoleOption(assignment.roleKey)?.singleLead ? "single lead" : "team role"}
                </span>
                <small>
                  Reports to {eventRoleOption(assignment.roleKey)?.reportsTo || "Event Floor Manager"}
                  {assignment.notes ? ` | ${assignment.notes}` : ""}
                </small>
              </article>
            ))}
          </div>
        ))}
      </section>

      <section className="manager-list">
        <h2>Event task board</h2>
        <p className="muted">
          Timed reminders are active while the app is open. Real background push will be added later.
        </p>
        <GuideQuickLinks
          onOpenGuide={onOpenGuide}
          links={[
            { id: "sending-live-event-messages-tasks", label: "Guide: Live messages/tasks" },
            { id: "how-event-mode-works", label: "Guide: Event Mode" },
            { id: "event-operations-troubleshooting", label: "Troubleshooting" },
          ]}
        />
        {activeEvent ? (
          <article className="overview-card">
            <strong>Selected event: {activeEvent.title}</strong>
            <span>
              {activeEvent.venue || "No venue"}
              {activeEvent.startsAt ? ` | ${formatDateTime(activeEvent.startsAt)}` : ""}
              {activeEvent.endsAt ? ` - ${formatDateTime(activeEvent.endsAt)}` : ""}
            </span>
          </article>
        ) : (
          <p className="critical-warning">Create an event board above before adding tasks.</p>
        )}
        {todayEvents.length > 1 && (
          <label>
            Choose task board
            <select value={activeEventIdValue} onChange={(event) => selectEventBoard(event.target.value)}>
              {todayEvents.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title} {event.venue ? `- ${event.venue}` : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        <form className="editor-form compact-editor" onSubmit={submitTask} ref={taskFormRef}>
          <label>
            Task title
            <input ref={taskTitleInputRef} disabled={taskFormDisabled} value={taskForm.title} onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))} />
          </label>
          <label>
            Description
            <input disabled={taskFormDisabled} value={taskForm.description} onChange={(event) => setTaskForm((current) => ({ ...current, description: event.target.value }))} />
          </label>
          <label>
            Due time
            <input
              type="datetime-local"
              disabled={taskFormDisabled}
              value={taskForm.dueAt}
              onChange={(event) =>
                setTaskForm((current) => ({
                  ...current,
                  dueAt: event.target.value,
                  remindAt: event.target.value
                    ? addMinutesToDateTimeLocal(event.target.value, -5)
                    : "",
                }))
              }
            />
          </label>
          <label>
            Remind time
            <input disabled={taskFormDisabled} type="datetime-local" value={taskForm.remindAt} onChange={(event) => setTaskForm((current) => ({ ...current, remindAt: event.target.value }))} />
          </label>
          <label>
            Zone
            <select disabled={taskFormDisabled} value={taskForm.zone} onChange={(event) => setTaskForm((current) => ({ ...current, zone: event.target.value }))}>
              {eventZones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
            </select>
          </label>
          <label>
            Priority
            <select disabled={taskFormDisabled} value={taskForm.priority} onChange={(event) => setTaskForm((current) => ({ ...current, priority: event.target.value }))}>
              {["low", "normal", "important", "critical"].map((priority) => <option key={priority} value={priority}>{priority}</option>)}
            </select>
          </label>
          <label>
            Target
            <select
              disabled={taskFormDisabled}
              value={taskForm.targetType || "role"}
              onChange={(event) =>
                setTaskForm((current) => ({
                  ...current,
                  targetType: event.target.value,
                  assignedRoleKey: event.target.value === "role" ? current.assignedRoleKey : "",
                  assignedOperatorName: event.target.value === "person" ? current.assignedOperatorName : "",
                }))
              }
            >
              <option value="person">Specific person</option>
              <option value="role">Role</option>
              <option value="all_event_staff">All event staff</option>
            </select>
            <small>Use All event staff only for messages/tasks everyone working the event should see.</small>
          </label>
          <label>
            Assign role
            <select
              disabled={taskFormDisabled || (taskForm.targetType || "role") !== "role"}
              value={taskForm.assignedRoleKey}
              onChange={(event) => setTaskForm((current) => ({ ...current, assignedRoleKey: event.target.value }))}
            >
              <option value="">No role</option>
              {eventRoleOptions.map((role) => <option key={role.key} value={role.key}>{role.label}</option>)}
            </select>
          </label>
          <label>
            Assign person
            <input
              disabled={taskFormDisabled || (taskForm.targetType || "role") !== "person"}
              list="event-staff-presence-list"
              value={taskForm.assignedOperatorName}
              onChange={(event) => setTaskForm((current) => ({ ...current, assignedOperatorName: event.target.value }))}
            />
          </label>
          {taskStatus.message && (
            <p className={taskStatus.type === "error" ? "critical-warning" : taskStatus.type === "success" ? "all-clear" : "status-message"}>
              {taskStatus.message}
            </p>
          )}
          <button type="submit" className="primary-button compact-button" disabled={taskFormDisabled}>
            {taskCreating ? "Creating task..." : "Create event task"}
          </button>
        </form>
        {eventTaskGroups().map(([title, tasks]) => (
          <div key={title} className="critical-group">
            <h3>{title}</h3>
            {tasks.length === 0 && <p className="muted">None.</p>}
            {tasks.map((task) => {
              const actionStatus = taskActionStatus?.[task.id];
              const actionPending = ["acknowledging", "completing"].includes(actionStatus?.status);
              return (
                <article key={task.id} className={`log-row priority-${task.priority}`}>
                  <strong>{task.title}</strong>
                  <span>
                    {task.zone || "all"} | {task.assignedOperatorName || eventRoleLabel(task.assignedRoleKey) || "Unassigned"} |{" "}
                    <span className={`event-task-status-chip status-${task.status || "pending"}`}>
                      {task.status === "acknowledged" ? "Acknowledged" : task.status || "pending"}
                    </span>
                  </span>
                  <small>
                    {task.dueAt ? `Due ${formatDateTime(task.dueAt)}` : "No due time"}
                    {task.remindAt ? ` | remind ${formatDateTime(task.remindAt)}` : ""}
                  </small>
                  {task.status === "acknowledged" && (
                    <small>
                      Acknowledged by {task.acknowledgedByName || "unknown"}
                      {task.acknowledgedAt ? ` at ${formatDateTime(task.acknowledgedAt)}` : ""}
                    </small>
                  )}
                  {task.status === "done" && task.completedByName && (
                    <small>
                      Done by {task.completedByName}
                      {task.completedAt ? ` at ${formatDateTime(task.completedAt)}` : ""}
                    </small>
                  )}
                  {actionStatus?.message && (
                    <small className={actionStatus.type === "error" ? "critical-warning" : actionStatus.type === "success" ? "all-clear" : "status-message"}>
                      {actionStatus.message}
                    </small>
                  )}
                  <div className="backup-actions">
                    {eventTaskStatuses.map((status) => (
                      <button
                        key={status}
                        type="button"
                        className={task.status === status ? "primary-button compact-button" : "ghost-button compact-button"}
                        onClick={() => onUpdateTaskStatus(task.id, status, "")}
                        disabled={actionPending}
                      >
                        {status === "acknowledged" && actionStatus?.status === "acknowledging"
                          ? "acknowledging..."
                          : status === "done" && actionStatus?.status === "completing"
                            ? "completing..."
                            : status}
                      </button>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        ))}
      </section>

      <section className="manager-list">
        <h2>Responsibility handover</h2>
        <form className="editor-form compact-editor" onSubmit={submitHandover}>
          <label>
            From
            <input value={activeEvent?.activeResponsibleName || user.name} readOnly />
          </label>
          <label>
            To
            <input
              list="event-staff-presence-list"
              value={handoverForm.toName}
              onChange={(event) => setHandoverForm((current) => ({ ...current, toName: event.target.value }))}
            />
          </label>
          <label>
            Scope
            <select value={handoverForm.responsibilityScope} onChange={(event) => setHandoverForm((current) => ({ ...current, responsibilityScope: event.target.value }))}>
              {eventHandoverScopes.map((scope) => <option key={scope} value={scope}>{scope.replaceAll("_", " ")}</option>)}
            </select>
          </label>
          <label>
            Notes
            <textarea rows="2" value={handoverForm.notes} onChange={(event) => setHandoverForm((current) => ({ ...current, notes: event.target.value }))} />
          </label>
          {handoverStatus.message && (
            <p className={handoverStatus.type === "error" ? "critical-warning" : handoverStatus.type === "success" ? "all-clear" : "status-message"}>
              {handoverStatus.message}
            </p>
          )}
          <button type="submit" className="primary-button compact-button">Confirm handover</button>
        </form>
        {eventHandoversForEvent.map((handover) => (
          <article key={handover.id} className="log-row">
            <strong>{handover.fromName || "Current responsible"} → {handover.toName}</strong>
            <span>{handover.responsibilityScope?.replaceAll("_", " ") || "all"}</span>
            <small>
              {handover.createdAt ? formatDateTime(handover.createdAt) : "Local"}
              {handover.notes ? ` | ${handover.notes}` : ""}
            </small>
          </article>
        ))}
      </section>
    </>
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
  eventOperations,
  eventStaffPresence,
  eventRoleAssignments,
  eventOperationTasks,
  eventHandovers,
  eventLiveUpdates,
  eventRealtimeStatus,
  staffUsers,
  requestWriteAccess,
  onCreateEventOperation,
  onUpdateEventOperation,
  onAddEventStaffPresence,
  onAssignEventRole,
  onRemoveEventRole,
  onCreateEventOperationTask,
  onUpdateEventOperationTaskStatus,
  eventTaskActionStatus,
  onCreateEventHandover,
  onCreateEventLiveUpdate,
  onChangeEventLiveUpdateStatus,
  onSyncFinancialSignoff,
  onRefreshFinancialSignoffs,
  onEnsureShiftSession,
  onSyncTaskLog,
  onSyncHandover,
  onShowOverview,
  onGuides,
  onBackToManager,
  onChangeRole,
  onOpenGuide,
  onRefreshEventOperations,
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
          {onBackToManager && (
            <button
              type="button"
              className="ghost-button compact-button"
              onClick={onBackToManager}
            >
              Back to Manager Dashboard
            </button>
          )}
          {onChangeRole && (
            <button
              type="button"
              className="ghost-button compact-button"
              onClick={onChangeRole}
            >
              Change role
            </button>
          )}
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
        <GuideQuickLinks
          onOpenGuide={onOpenGuide}
          links={[
            { id: "event-floor-manager-live-control", label: "Guide: Event Floor Manager" },
            { id: "how-to-use-run-sheets", label: "Guide: Run Sheets" },
            { id: "sending-live-event-messages-tasks", label: "Guide: Live messages" },
          ]}
        />
      </section>

      <EventCodeGeneratorPanel user={user} />

      <EventOperationsCorePanel
        user={user}
        date={date}
        eventOperations={eventOperations}
        eventStaffPresence={eventStaffPresence}
        eventRoleAssignments={eventRoleAssignments}
        eventTasks={eventOperationTasks}
        eventHandovers={eventHandovers}
        eventLiveUpdates={eventLiveUpdates}
        eventRealtimeStatus={eventRealtimeStatus}
        onCreateEvent={onCreateEventOperation}
        onUpdateEvent={onUpdateEventOperation}
        onAddStaff={onAddEventStaffPresence}
        onAssignRole={onAssignEventRole}
        onRemoveRole={onRemoveEventRole}
        onCreateTask={onCreateEventOperationTask}
        onUpdateTaskStatus={onUpdateEventOperationTaskStatus}
        taskActionStatus={eventTaskActionStatus}
        onCreateHandover={onCreateEventHandover}
        onCreateLiveUpdate={onCreateEventLiveUpdate}
        onChangeLiveUpdateStatus={onChangeEventLiveUpdateStatus}
        onOpenGuide={onOpenGuide}
        onRefreshEventOperations={onRefreshEventOperations}
      />

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
  currentShiftScope,
  onShowOverview,
  onOpenGuides,
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
  const [guidePanel, setGuidePanel] = useState(null);
  const [imagePanel, setImagePanel] = useState(null);
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
  const canWorkThisShift = canWorkInShiftScope(shiftType, currentShiftScope, user);

  function ensureScopeAllowed(taskShiftType = shiftType) {
    if (canWorkInShiftScope(taskShiftType, currentShiftScope, user)) return true;
    window.alert(shiftScopeBlockMessage(taskShiftType, currentShiftScope));
    return false;
  }

  async function saveTaskStatus(task, status) {
    if (!ensureScopeAllowed(task.shiftType)) return;
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
      operatorName: user.operatorName || user.name,
      operatorSource: user.operatorSource || user.loginSource || "",
      operatorRoleLabel: user.operatorRoleLabel || "",
      authDisplayName: user.authDisplayName || user.name,
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
    if (!ensureScopeAllowed(task.shiftType)) return;
    const resetLog = {
      id: `${date}-${task.id}`,
      localId: `task_completion:${date}:${task.shiftType}:${task.id}:${syncUserKey}`,
      taskId: task.id,
      taskTitle: task.title,
      date,
      completedBy: user.name,
      operatorName: user.operatorName || user.name,
      operatorSource: user.operatorSource || user.loginSource || "",
      operatorRoleLabel: user.operatorRoleLabel || "",
      authDisplayName: user.authDisplayName || user.name,
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
    if (!ensureScopeAllowed(shiftType)) return;
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
    const normalizedGuides = knowledgeBase.map(normalizeGuide);
    const eventOperationGuides = normalizedGuides.filter((guide) => guide.category === "Event Operations");
    const otherGuides = normalizedGuides.filter((guide) => guide.category !== "Event Operations");
    return (
      <main className="page">
        <section className="intro compact">
          <p className="eyebrow">Guides</p>
          <h1>Knowledge base</h1>
        </section>
        {eventOperationGuides.length > 0 && (
          <section className="guide-section">
            <div className="section-heading static-heading">
              <div>
                <p className="eyebrow">Event Operations</p>
                <h2>Event guides and how-to</h2>
              </div>
              <span>{eventOperationGuides.length} guides</span>
            </div>
            <div className="guide-list">
              {eventOperationGuides.map((guide) => (
                <GuideCard key={guide.id} guide={guide} />
              ))}
            </div>
          </section>
        )}
        <section className="guide-list">
          {otherGuides.map((guide) => (
            <GuideCard key={guide.id} guide={guide} />
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
        {currentShiftScope?.label && (
          <p className={canWorkThisShift ? "all-clear" : "critical-warning"}>
            Scope: {currentShiftScope.label}
            {canWorkThisShift
              ? " | You can complete this shift."
              : ` | ${shiftScopeBlockMessage(shiftType, currentShiftScope)}`}
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
          <button
            type="button"
            className="primary-button compact-button"
            onClick={onShowOverview}
          >
            Today's overview
          </button>
          <button
            type="button"
            className="ghost-button compact-button"
            onClick={onOpenGuides}
          >
            Guides
          </button>
          <button
            type="button"
            className="ghost-button compact-button"
            onClick={onChangeShift}
          >
            Change shift
          </button>
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
            const linkedGuide = findGuideById(task.guideId);
            const taskImages = getTaskImages(task, linkedGuide);
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
                      {isOptionalTask(task) && <span>Optional quiet-time</span>}
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
                  {task.guideId && (
                    <button
                      type="button"
                      className="ghost-button compact-button"
                      onClick={() =>
                        setGuidePanel({
                          task,
                          guide: linkedGuide,
                        })
                      }
                    >
                      Guide
                    </button>
                  )}
                  {taskImages.length > 0 && (
                    <button
                      type="button"
                      className="ghost-button compact-button"
                      onClick={() =>
                        setImagePanel({
                          title: task.title,
                          images: taskImages,
                        })
                      }
                    >
                      See image?
                    </button>
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
      {guidePanel && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="pilot-modal guide-modal">
            {guidePanel.guide ? (
              <GuideCard guide={guidePanel.guide} compact />
            ) : (
              <div className="empty-state">
                <h2>Guide not found</h2>
                <p className="muted">
                  This task is linked to a guide that has not been added yet.
                </p>
              </div>
            )}
            <div className="backup-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => setGuidePanel(null)}
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}
      {imagePanel && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="pilot-modal guide-modal">
            <p className="eyebrow">Images</p>
            <h1>{imagePanel.title}</h1>
            <GuideImages images={imagePanel.images} />
            <div className="backup-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => setImagePanel(null)}
              >
                Close
              </button>
            </div>
          </section>
        </div>
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

function ManagerDashboardJumpIndex({ includeStockCount = false }) {
  const jumpItems = [
    { label: "Top", needles: ["dashboard"] },
    ...(includeStockCount
      ? [{ label: "Stock Count", needles: ["stock count"] }]
      : []),
    { label: "Backend", needles: ["backend status"] },
    { label: "Checklist", needles: ["checklist backend"] },
    { label: "Auth", needles: ["auth status"] },
    { label: "Staff", needles: ["staff codes", "site access"] },
    { label: "Alerts", needles: ["open alerts", "real alert"] },
    { label: "Daily report", needles: ["daily report"] },
    { label: "Close day", needles: ["close day control"] },
    { label: "Close summary", needles: ["close day summary", "copy close day summary"] },
    { label: "Close signoff", needles: ["mark day closed", "close signoff"] },
    { label: "Close archive", needles: ["sync close archive", "restore close archive"] },
    { label: "Reviews", needles: ["manager review history", "daily manager review"] },
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
  user,
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

  reviewStatusForHistoryDate = fallbackReviewStatusForHistoryDate,
}) {
  const reviewItems = [
    { id: "action_center_reviewed", label: "Action Center reviewed" },
    { id: "asset_issues_checked", label: "Asset issues checked" },
    { id: "financial_signoffs_checked", label: "Financial signoffs checked" },
    { id: "alerts_attention_checked", label: "Alerts / needs attention checked" },
    { id: "daily_report_reviewed", label: "Daily report reviewed" },
  ];

  const reviewStorageKey = "mesh-manager-daily-review-v1:" + (date || "unknown");

  function blankDailyReview() {
    return {
      date: date || "",
      localId: "manager-review:" + (date || "unknown"),
      checked: {},
      notes: "",
      signedOffBy: "",
      signedOffByAuthUserId: "",
      signedOffAt: "",
      syncStatus:
        user?.loginSource === "supabase_auth" ? "pending_backend" : "local_only",
      syncError: "",
      updatedAt: "",
    };
  }

  function normalizeDailyReview(record) {
    return {
      ...blankDailyReview(),
      ...(record || {}),
      checked: {
        ...blankDailyReview().checked,
        ...(record?.checked || {}),
      },
      localId:
        record?.localId || "manager-review:" + (record?.date || date || "unknown"),
    };
  }

  function reviewFreshness(record) {
    return new Date(
      record?.updatedAt || record?.signedOffAt || record?.createdAt || 0,
    ).getTime();
  }

  function loadDailyReview() {
    try {
      return normalizeDailyReview(
        JSON.parse(localStorage.getItem(reviewStorageKey) || "null"),
      );
    } catch {
      return blankDailyReview();
    }
  }

  const [syncActionMessage, setSyncActionMessage] = useState("");
  const [syncActionBusy, setSyncActionBusy] = useState(false);
  const [dailyReview, setDailyReview] = useState(loadDailyReview);
  const [reviewBackendMessage, setReviewBackendMessage] = useState("");
  const [reviewSyncBusy, setReviewSyncBusy] = useState(false);

  const closeDayAckStorageKey = "mesh-close-day-ack-v1:" + (date || "unknown");

  function loadCloseDayAcknowledgements() {
    try {
      return JSON.parse(localStorage.getItem(closeDayAckStorageKey) || "{}");
    } catch {
      return {};
    }
  }

  const [closeDayAcknowledgements, setCloseDayAcknowledgements] = useState(
    loadCloseDayAcknowledgements,
  );

  function acknowledgeCloseDayItem(itemId) {
    const acknowledgedAt = new Date().toISOString();

    setCloseDayAcknowledgements((current) => {
      const next = {
        ...(current || {}),
        [itemId]: acknowledgedAt,
      };

      localStorage.setItem(closeDayAckStorageKey, JSON.stringify(next));
      return next;
    });
  }

  useEffect(() => {
    setDailyReview(loadDailyReview());
    setReviewBackendMessage("");
  }, [reviewStorageKey]);

  useEffect(() => {
    setCloseDayAcknowledgements(loadCloseDayAcknowledgements());
  }, [closeDayAckStorageKey]);

  const closeDaySignoffStorageKey = "mesh-close-day-signoff-v1:" + (date || "unknown");

  function loadCloseDaySignoff() {
    try {
      return JSON.parse(localStorage.getItem(closeDaySignoffStorageKey) || "null");
    } catch {
      return null;
    }
  }

  const [closeDaySignoff, setCloseDaySignoff] = useState(loadCloseDaySignoff);
  const [closeDayArchiveMessage, setCloseDayArchiveMessage] = useState("");
  const [closeDayArchiveBusy, setCloseDayArchiveBusy] = useState(false);

  function saveCloseDaySignoff(nextSignoff) {
    setCloseDaySignoff(nextSignoff);

    if (nextSignoff) {
      localStorage.setItem(closeDaySignoffStorageKey, JSON.stringify(nextSignoff));
    } else {
      localStorage.removeItem(closeDaySignoffStorageKey);
    }
  }

  useEffect(() => {
    setCloseDaySignoff(loadCloseDaySignoff());
  }, [closeDaySignoffStorageKey]);


  useEffect(() => {
    let cancelled = false;

    async function restoreOnLoad() {
      if (user?.loginSource !== "supabase_auth" || !date) return;

      const result = await fetchManagerDailyReview(date);

      if (cancelled) return;

      if (result.ok && result.record) {
        const localReview = loadDailyReview();
        const backendReview = normalizeDailyReview(result.record);
        const preferred =
          reviewFreshness(backendReview) >= reviewFreshness(localReview)
            ? backendReview
            : localReview;

        setDailyReview(preferred);
        localStorage.setItem(reviewStorageKey, JSON.stringify(preferred));
        setReviewBackendMessage("Manager daily review restored from Supabase.");
        return;
      }

      if (result.ok) {
        setReviewBackendMessage("No backend manager review found yet.");
        return;
      }

      setReviewBackendMessage(result.message || "Could not restore manager review.");
    }

    restoreOnLoad();

    return () => {
      cancelled = true;
    };
  }, [date, user?.id, user?.loginSource]);

  function saveDailyReview(nextReview) {
    const normalized = normalizeDailyReview({
      ...nextReview,
      date: date || "",
      localId: nextReview.localId || "manager-review:" + (date || "unknown"),
      syncStatus:
        user?.loginSource === "supabase_auth" ? "pending_backend" : "local_only",
      syncError: "",
      updatedAt: new Date().toISOString(),
    });

    setDailyReview(normalized);
    localStorage.setItem(reviewStorageKey, JSON.stringify(normalized));
    return normalized;
  }

  async function syncDailyReviewToBackend(review) {
    if (user?.loginSource !== "supabase_auth") {
      setReviewBackendMessage("Manager review saved locally. Email login required for backend sync.");
      return { ok: false, mode: "local_only" };
    }

    setReviewSyncBusy(true);
    setReviewBackendMessage("Syncing manager daily review...");

    try {
      const result = await upsertManagerDailyReview(review);

      if (result.ok && result.record) {
        const synced = normalizeDailyReview({
          ...review,
          ...result.record,
          syncStatus: "synced",
          syncError: "",
        });

        setDailyReview(synced);
        localStorage.setItem(reviewStorageKey, JSON.stringify(synced));
        setReviewBackendMessage(result.message || "Manager daily review synced.");
        return result;
      }

      const failed = normalizeDailyReview({
        ...review,
        syncStatus: "sync_error",
        syncError: result.message || "Manager daily review sync failed.",
      });

      setDailyReview(failed);
      localStorage.setItem(reviewStorageKey, JSON.stringify(failed));
      setReviewBackendMessage(result.message || "Manager daily review sync failed.");
      return result;
    } catch (error) {
      const failed = normalizeDailyReview({
        ...review,
        syncStatus: "sync_error",
        syncError: error.message || "Manager daily review sync failed.",
      });

      setDailyReview(failed);
      localStorage.setItem(reviewStorageKey, JSON.stringify(failed));
      setReviewBackendMessage(error.message || "Manager daily review sync failed.");
      return { ok: false, mode: "sync_error", message: error.message };
    } finally {
      setReviewSyncBusy(false);
    }
  }

  async function restoreDailyReviewFromBackend() {
    if (user?.loginSource !== "supabase_auth") {
      setReviewBackendMessage("Email login required for manager review backend restore.");
      return;
    }

    setReviewSyncBusy(true);
    setReviewBackendMessage("Restoring manager daily review...");

    try {
      const result = await fetchManagerDailyReview(date);

      if (result.ok && result.record) {
        const restored = normalizeDailyReview(result.record);
        setDailyReview(restored);
        localStorage.setItem(reviewStorageKey, JSON.stringify(restored));
        setReviewBackendMessage(result.message || "Manager daily review restored.");
        return;
      }

      setReviewBackendMessage(result.message || "No backend manager review found.");
    } catch (error) {
      setReviewBackendMessage(error.message || "Could not restore manager daily review.");
    } finally {
      setReviewSyncBusy(false);
    }
  }

  async function toggleReviewItem(itemId) {
    const nextReview = saveDailyReview({
      ...dailyReview,
      signedOffAt: "",
      signedOffBy: "",
      signedOffByAuthUserId: "",
      checked: {
        ...dailyReview.checked,
        [itemId]: !dailyReview.checked?.[itemId],
      },
    });

    if (dailyReview.signedOffAt) {
      await syncDailyReviewToBackend(nextReview);
    }
  }

  async function updateReviewNotes(notes) {
    const nextReview = saveDailyReview({
      ...dailyReview,
      signedOffAt: "",
      signedOffBy: "",
      signedOffByAuthUserId: "",
      notes,
    });

    if (dailyReview.signedOffAt) {
      await syncDailyReviewToBackend(nextReview);
    }
  }

  async function signOffDailyReview() {
    const nextReview = saveDailyReview({
      ...dailyReview,
      signedOffBy: user?.name || authStatus?.email || "Manager",
      signedOffByAuthUserId:
        user?.authUserId || user?.backendUserId || dailyReview.signedOffByAuthUserId || "",
      signedOffAt: new Date().toISOString(),
    });

    await syncDailyReviewToBackend(nextReview);
  }

  async function clearDailyReviewSignoff() {
    const nextReview = saveDailyReview({
      ...dailyReview,
      signedOffBy: "",
      signedOffByAuthUserId: "",
      signedOffAt: "",
    });

    await syncDailyReviewToBackend(nextReview);
  }

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

  const reviewDone = reviewItems.every((item) => dailyReview.checked?.[item.id]);
  const dailyReviewSigned = Boolean(dailyReview.signedOffAt);

  const assetIssueCount = assetIssues?.length || 0;
  const assetCheckCount = dateAssetChecks?.length || 0;
  const assetPendingCount = assetBackendStatus?.pendingLocalRecords || 0;
  const financialPendingCount = financialBackendStatus?.pendingLocalRecords || 0;
  const checklistPendingCount = shiftDataStatus?.pendingLocalRecords || 0;
  const financialPendingAcknowledged = Boolean(
    closeDayAcknowledgements?.financial_pending_clear,
  );

  const hasRealBackendError =
    meaningfulBackendError(assetBackendStatus?.lastError) ||
    meaningfulBackendError(financialBackendStatus?.lastError) ||
    meaningfulBackendError(shiftDataStatus?.lastError);

  const hasReviewItems =
    assetIssueCount > 0 ||
    assetPendingCount > 0 ||
    (financialPendingCount > 0 && !financialPendingAcknowledged) ||
    checklistPendingCount > 0 ||
    !dailyReviewSigned;

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

    if (financialPendingCount > 0 && !financialPendingAcknowledged) {
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

    if (!dailyReviewSigned) {
      actions.push({
        title: reviewDone
          ? "Sign off daily manager review"
          : "Complete daily manager review",
        description: reviewDone
          ? "All daily review checks are complete. Sign off the day."
          : "Finish the manager review checklist before closing the day.",
        label: "Open review",
        action: () => jumpTo(["daily manager review"]),
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
const closeDayChecks = [
    {
      id: "manager_review_signed",
      label: "Daily manager review signed",
      ok: dailyReviewSigned,
      detail: dailyReviewSigned
        ? "Signed by " + (dailyReview.signedOffBy || "Manager")
        : reviewDone
          ? "Ready to sign"
          : "Checklist still open",
      actionLabel: dailyReviewSigned ? "" : "Open review",
      action: () => jumpTo(["daily manager review"]),
    },
    {
      id: "review_checklist_done",
      label: "Daily review checklist complete",
      ok: reviewDone,
      detail: reviewDone ? "5/5 checks complete" : "Complete all review checks",
      actionLabel: reviewDone ? "" : "Open review",
      action: () => jumpTo(["daily manager review"]),
    },
    {
      id: "backend_errors_clear",
      label: "No real backend errors",
      ok: !hasRealBackendError,
      detail: hasRealBackendError ? "Backend needs attention" : "No real backend error",
      actionLabel: hasRealBackendError ? "Open backend" : "",
      action: () => jumpTo(["backend status", "checklist backend"]),
    },
    {
      id: "checklist_pending_clear",
      label: "Checklist pending cleared",
      ok: checklistPendingCount === 0,
      detail: checklistPendingCount + " pending checklist record(s)",
      actionLabel: checklistPendingCount > 0 ? "Cleanup checklist" : "",
      action: () =>
        runSyncAction(
          "Checklist pending cleanup complete.",
          onClearSyncedLocalChecklistPendingRecords,
        ),
    },
    {
      id: "financial_pending_clear",
      label: "Financial pending cleared",
      ok: financialPendingCount === 0 || financialPendingAcknowledged,
      detail:
        financialPendingCount === 0
          ? "0 pending financial record(s)"
          : financialPendingAcknowledged
            ? financialPendingCount + " pending financial record(s) reviewed for close"
            : financialPendingCount + " pending financial record(s)",
      actionLabel:
        financialPendingCount > 0 && !financialPendingAcknowledged
          ? "Review financial"
          : "",
      action: async () => {
        acknowledgeCloseDayItem("financial_pending_clear");

        await runSyncAction("Financial pending reviewed for close.", async () => {
          await onClearSyncedFinancialPendingRecords?.();
          await refreshFinancialSignoffs?.();
        });
      },
    },
    {
      id: "asset_pending_clear",
      label: "Asset pending cleared",
      ok: assetPendingCount === 0,
      detail: assetPendingCount + " pending asset record(s)",
      actionLabel: assetPendingCount > 0 ? "Cleanup assets" : "",
      action: () =>
        runSyncAction(
          "Asset pending cleanup complete.",
          onClearSyncedAssetPendingRecords,
        ),
    },
    {
      id: "asset_issues_clear",
      label: "No asset issues",
      ok: assetIssueCount === 0,
      detail: assetIssueCount + " asset issue(s)",
      actionLabel: assetIssueCount > 0 ? "Open assets" : "",
      action: () => jumpTo(["asset registry", "asset check"]),
    },
  ];

  const closeDayReady = closeDayChecks.every((check) => check.ok);
  const closeDayBlockingItems = closeDayChecks.filter((check) => !check.ok);
  const closeDayClosed = Boolean(closeDaySignoff?.closedAt) && closeDaySignoff?.status !== "reopened";

  async function markCloseDayClosed() {
    if (!closeDayReady) {
      setSyncActionMessage("Close day cannot be marked closed yet. Resolve blocking items first.");
      return;
    }

    const nextSignoff = {
      date: date || "",
      closedBy: dailyReview?.signedOffBy || "Manager",
      closedAt: new Date().toISOString(),
      status: "closed",
      checksPassed: closeDayChecks.filter((check) => check.ok).length,
      totalChecks: closeDayChecks.length,
      syncStatus: user?.loginSource === "supabase_auth" ? "pending_backend" : "local_only",
    };

    saveCloseDaySignoff(nextSignoff);
    setSyncActionMessage("Close day marked closed.");
    await syncCloseDayArchive(nextSignoff);
  }

  async function reopenCloseDay() {
    const reopenedSignoff = {
      ...(closeDaySignoff || {}),
      date: date || closeDaySignoff?.date || "",
      status: "reopened",
      reopenedBy: dailyReview?.signedOffBy || "Manager",
      reopenedAt: new Date().toISOString(),
      syncStatus: user?.loginSource === "supabase_auth" ? "pending_backend" : "local_only",
    };

    saveCloseDaySignoff(null);
    setSyncActionMessage("Close day reopened.");
    await syncCloseDayArchive(reopenedSignoff);
  }

  async function syncCloseDayArchive(signoff) {
    if (!signoff) {
      setCloseDayArchiveMessage("No close day signoff to archive yet.");
      return { ok: false, mode: "missing_signoff" };
    }

    if (user?.loginSource !== "supabase_auth") {
      setCloseDayArchiveMessage("Close day saved locally. Email login required for backend archive.");
      return { ok: false, mode: "local_only" };
    }

    setCloseDayArchiveBusy(true);
    setCloseDayArchiveMessage("Syncing close day archive...");

    const archiveRecord = {
      ...signoff,
      date: signoff.date || date || "",
      localId: signoff.localId || "close-day:" + (date || "unknown"),
      checksPassed: signoff.checksPassed ?? closeDayChecks.filter((check) => check.ok).length,
      totalChecks: signoff.totalChecks ?? closeDayChecks.length,
      blockingItems: closeDayBlockingItems.map((check) => ({
        id: check.id,
        label: check.label,
        detail: check.detail,
      })),
      summary: buildCloseDaySummary(signoff),
      metadata: {
        closeDayReady,
        backendState: hasRealBackendError ? "needs_attention" : "clear",
        checklistPendingCount,
        financialPendingCount,
        financialPendingAcknowledged,
        assetPendingCount,
        assetIssueCount,
      },
    };

    try {
      const result = await upsertCloseDayArchive(archiveRecord);

      if (result.ok && result.record) {
        setCloseDayArchiveMessage(
          result.record.status === "reopened"
            ? "Close day archive marked reopened in Supabase."
            : "Close day archive synced to Supabase.",
        );

        if (result.record.status === "closed") {
          saveCloseDaySignoff({
            ...signoff,
            backendId: result.record.backendId,
            localId: result.record.localId,
            syncStatus: "synced",
            updatedAt: result.record.updatedAt,
          });
        }

        return result;
      }

      setCloseDayArchiveMessage(result.message || "Close day archive sync failed.");
      return result;
    } catch (error) {
      setCloseDayArchiveMessage(error.message || "Close day archive sync failed.");
      return { ok: false, mode: "sync_error", message: error.message };
    } finally {
      setCloseDayArchiveBusy(false);
    }
  }

  async function restoreCloseDayArchiveFromBackend() {
    if (user?.loginSource !== "supabase_auth") {
      setCloseDayArchiveMessage("Email login required for close day archive restore.");
      return;
    }

    setCloseDayArchiveBusy(true);
    setCloseDayArchiveMessage("Restoring close day archive...");

    try {
      const result = await fetchCloseDayArchive(date);

      if (result.ok && result.record) {
        if (result.record.status === "closed") {
          saveCloseDaySignoff({
            date: result.record.date,
            closedBy: result.record.closedBy || "Manager",
            closedAt: result.record.closedAt,
            status: "closed",
            checksPassed: result.record.checksPassed,
            totalChecks: result.record.totalChecks,
            backendId: result.record.backendId,
            localId: result.record.localId,
            syncStatus: "synced",
            updatedAt: result.record.updatedAt,
          });

          setCloseDayArchiveMessage("Close day archive restored from Supabase.");
          return;
        }

        saveCloseDaySignoff(null);
        setCloseDayArchiveMessage("Supabase archive says this day was reopened.");
        return;
      }

      setCloseDayArchiveMessage(result.message || "No close day archive found.");
    } catch (error) {
      setCloseDayArchiveMessage(error.message || "Could not restore close day archive.");
    } finally {
      setCloseDayArchiveBusy(false);
    }
  }
function buildCloseDaySummary(summarySignoff = closeDaySignoff) {
    const summaryClosed =
      Boolean(summarySignoff?.closedAt) && summarySignoff?.status !== "reopened";
    const summaryClosedBy = summarySignoff?.closedBy || "-";
    const summaryClosedAt = summarySignoff?.closedAt
      ? formatDateTime(summarySignoff.closedAt)
      : "-";
    const summaryArchiveStatus =
      summarySignoff?.syncStatus === "synced"
        ? "synced"
        : user?.loginSource === "supabase_auth"
          ? "local / pending backend"
          : "local only";

    const lines = [
      "Mesh Shift Log - Close Day Summary",
      "Date: " + (date || "-"),
      "Status: " + (closeDayReady ? "Ready to close" : "Needs attention"),
      "Closed: " + (summaryClosed ? "yes" : "no"),
      "Closed by: " + summaryClosedBy,
      "Closed at: " + summaryClosedAt,
      "Backend archive: " + summaryArchiveStatus,
      "",
      "Manager review",
      "Signed: " + (dailyReviewSigned ? "yes" : "no"),
      "Closing checks: " +
        closeDayChecks.filter((check) => check.ok).length +
        "/" +
        closeDayChecks.length +
        " passed",
      "Signed by: " + (dailyReview.signedOffBy || "-"),
      "Signed at: " +
        (dailyReview.signedOffAt ? formatDateTime(dailyReview.signedOffAt) : "-"),
      "",
      "Backend / sync",
      "Backend state: " + (hasRealBackendError ? "needs attention" : "clear"),
      "Checklist pending: " + checklistPendingCount,
      "Financial pending: " +
        financialPendingCount +
        (financialPendingAcknowledged ? " (reviewed for close)" : ""),
      "Asset pending: " + assetPendingCount,
      "",
      "Operational issues",
      "Asset issues: " + assetIssueCount,
      "",
      "Blocking items",
    ];

    if (closeDayBlockingItems.length) {
      closeDayBlockingItems.forEach((check) => {
        lines.push("- " + check.label + ": " + check.detail);
      });
    } else {
      lines.push("- none");
    }

    if (dailyReview.notes?.trim()) {
      lines.push("", "Manager review notes", dailyReview.notes.trim());
    }

    return lines.join("\n");
  }

  async function copyCloseDaySummary() {
    const summary = buildCloseDaySummary();

    try {
      await navigator.clipboard.writeText(summary);
      setSyncActionMessage("Close day summary copied.");
    } catch {
      setSyncActionMessage(
        "Could not copy close day summary automatically. Open daily report and copy manually.",
      );
    }
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
        <span>
          <strong>{dailyReviewSigned ? "signed" : reviewDone ? "ready" : "open"}</strong>{" "}
          Daily review
        </span>
        <span>
          <strong>{dailyReview.syncStatus || "local_only"}</strong> Review backend
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
          records, operational issues, or the daily manager review still being open.
        </p>
      )}

      {!hasRealBackendError && !hasReviewItems && (
        <p className="muted">
          No urgent manager follow-up detected.
        </p>
      )}

      <div className="section-heading static-heading" id="close-day-control">
        <div>
          <h3>Close Day Control</h3>
          <p className="muted">
            Final manager checkpoint before closing the operational day.
          </p>
        </div>
        <span className={closeDayReady ? "status-pill success" : "status-pill warning"}>
          {closeDayReady ? "Ready to close" : "Needs attention"}
        </span>
      </div>

      <div className="status-grid">
        <span>
          <strong>{closeDayChecks.filter((check) => check.ok).length}/{closeDayChecks.length}</strong>{" "}
          Closing checks passed
        </span>
        <span>
          <strong>{dailyReviewSigned ? "signed" : "open"}</strong> Manager signoff
        </span>
        <span>
          <strong>{hasRealBackendError ? "attention" : "clear"}</strong> Backend state
        </span>
        <span>
          <strong>{assetIssueCount}</strong> Asset issues
        </span>
        <span>
          <strong>{closeDayBlockingItems.length}</strong> Blocking items
        </span>
        <span>
          <strong>{closeDayClosed ? "closed" : "open"}</strong> Close signoff
        </span>
        <span>
          <strong>{closeDaySignoff?.syncStatus === "synced" ? "synced" : "local"}</strong> Archive sync
        </span>
      </div>

            {closeDayClosed && (
        <p className="muted">
          Closed by {closeDaySignoff.closedBy || "Manager"} at{" "}
          {formatDateTime(closeDaySignoff.closedAt)}.
        </p>
      )}

<div className="checklist-grid">
        {closeDayChecks.map((check) => (
          <article
            key={check.id}
            className={check.ok ? "toggle-row small-toggle" : "toggle-row small-toggle needs-attention"}
          >
            <span>{check.ok ? "✅" : "⚠️"}</span>
            <span>
              <strong>{check.label}</strong>
              <small> · {check.detail}</small>
            </span>
            {check.actionLabel && (
              <button
                type="button"
                className="ghost-button compact-button"
                disabled={syncActionBusy}
                onClick={check.action}
              >
                {check.actionLabel}
              </button>
            )}
          </article>
        ))}
      </div>

            {closeDayArchiveMessage && (
        <p className="muted">{closeDayArchiveMessage}</p>
      )}

<div className="backup-actions">
        <button
          type="button"
          className="ghost-button compact-button"
          disabled={syncActionBusy}
          onClick={() =>
            runSyncAction("Backend status refreshed.", async () => {
              await refreshShiftData?.();
              await refreshFinancialSignoffs?.();
              await refreshAssetRegistry?.();
              await refreshAssetChecks?.();
            })
          }
        >
          Refresh backend status
        </button>
        <button
          type="button"
          className="ghost-button compact-button"
          onClick={() => jumpTo(["daily manager review"])}
        >
          Open review
        </button>
        <button
          type="button"
          className="ghost-button compact-button"
          onClick={() => jumpTo(["daily report"])}
        >
          Open daily report
        </button>
        <button
          type="button"
          className="ghost-button compact-button"
          onClick={copyCloseDaySummary}
        >
          Copy close day summary
        </button>
        <button
          type="button"
          className="ghost-button compact-button"
          disabled={closeDayArchiveBusy || !closeDaySignoff}
          onClick={() => syncCloseDayArchive(closeDaySignoff)}
        >
          Sync close archive
        </button>
        <button
          type="button"
          className="ghost-button compact-button"
          disabled={closeDayArchiveBusy}
          onClick={restoreCloseDayArchiveFromBackend}
        >
          Restore close archive
        </button>
        <button
          type="button"
          className="primary-button compact-button"
          disabled={!closeDayReady || closeDayClosed}
          onClick={markCloseDayClosed}
        >
          Mark day closed
        </button>
        {closeDayClosed && (
          <button
            type="button"
            className="ghost-button compact-button"
            onClick={reopenCloseDay}
          >
            Reopen close day
          </button>
        )}
      </div>

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
              disabled={syncActionBusy || reviewSyncBusy}
              onClick={item.action}
            >
              {item.label}
            </button>
          </article>
        ))}
      </div>

      <div className="section-heading static-heading" id="daily-manager-review">
        <div>
          <h3>Daily manager review</h3>
          <p className="muted">
            Local checklist for confirming the day has been reviewed.
          </p>
        </div>
        <span className={dailyReviewSigned ? "status-pill success" : "status-pill warning"}>
          {dailyReviewSigned ? "Signed" : reviewDone ? "Ready" : "Open"}
        </span>
      </div>

      <div className="checklist-grid">
        {reviewItems.map((item) => (
          <label key={item.id} className="toggle-row small-toggle">
            <input
              type="checkbox"
              checked={Boolean(dailyReview.checked?.[item.id])}
              onChange={() => toggleReviewItem(item.id)}
            />
          <span>{item.label}</span>
          </label>
        ))}
      </div>

      <label>
        <span>Manager review notes</span>
        <textarea
          value={dailyReview.notes || ""}
          onChange={(event) => updateReviewNotes(event.target.value)}
          placeholder="Optional notes before signing off the day."
        />
      </label>

      {dailyReviewSigned && (
        <p className="muted">
          Signed by {dailyReview.signedOffBy || "Manager"} at{" "}
          {formatDateTime(dailyReview.signedOffAt)}.
        </p>
      )}

      {reviewBackendMessage && <p className="muted">{reviewBackendMessage}</p>}
      {dailyReview.syncError && (
        <p className="critical-warning">{dailyReview.syncError}</p>
      )}

      <div className="backup-actions">
        <button
          type="button"
          className="primary-button compact-button"
          disabled={!reviewDone || reviewSyncBusy}
          onClick={signOffDailyReview}
        >
          Sign off daily review
        </button>
        <button
          type="button"
          className="ghost-button compact-button"
          disabled={reviewSyncBusy}
          onClick={() => syncDailyReviewToBackend(dailyReview)}
        >
          Sync review now
        </button>
        <button
          type="button"
          className="ghost-button compact-button"
          disabled={reviewSyncBusy}
          onClick={restoreDailyReviewFromBackend}
        >
          Restore review from backend
        </button>
        {dailyReviewSigned && (
          <button
            type="button"
            className="ghost-button compact-button"
            disabled={reviewSyncBusy}
            onClick={clearDailyReviewSignoff}
          >
            Reopen review
          </button>
        )}
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

function ManagerDailyReviewHistory({ user, date }) {
  const [historyStatus, setHistoryStatus] = useState({
    mode: "initial",
    message: "",
  });
  const [reviewHistory, setReviewHistory] = useState([]);

  async function refreshReviewHistory() {
    if (user?.loginSource !== "supabase_auth") {
      setHistoryStatus({
        mode: "local_only",
        message: "Email login required for manager review history.",
      });
      return;
    }

    setHistoryStatus({
      mode: "loading",
      message: "Loading manager review history...",
    });

    try {
      const result = await fetchManagerDailyReviewHistory({ limit: 14 });

      if (!result.ok) {
        setHistoryStatus({
          mode: result.mode || "sync_error",
          message: result.message || "Could not load manager review history.",
        });
        return;
      }

      setReviewHistory(result.records || []);
      setHistoryStatus({
        mode: "authenticated",
        message: result.message || "Manager review history loaded.",
      });
    } catch (error) {
      setHistoryStatus({
        mode: "sync_error",
        message: error.message || "Could not load manager review history.",
      });
    }
  }

  useEffect(() => {
    refreshReviewHistory();
  }, [user?.id, user?.loginSource, date]);

  return (
    <section className="panel manager-review-history">
      <div className="section-heading static-heading">
        <div>
          <h2>Manager review history</h2>
          <p className="muted">
            Recent daily manager reviews restored from Supabase.
          </p>
        </div>
        <button
          type="button"
          className="ghost-button compact-button"
          onClick={refreshReviewHistory}
        >
          Refresh history
        </button>
      </div>

      {historyStatus.message && (
        <p className={historyStatus.mode === "sync_error" ? "critical-warning" : "muted"}>
          {historyStatus.message}
        </p>
      )}

      {reviewHistory.length === 0 && (
        <p className="muted">No manager review history found yet.</p>
      )}

      <div className="history-table">
        {reviewHistory.map((review) => {
          const checkedCount = Object.values(review.checked || {}).filter(Boolean).length;
          const signed = Boolean(review.signedOffAt);

          return (
            <article key={review.backendId || review.localId || review.date}>
              <div>
                <strong>{review.date}</strong>
                <p className="muted">
                  {signed ? "Signed" : "Open"} · {checkedCount}/5 checks ·{" "}
                  {review.syncStatus || "backend"}
                </p>
                {review.signedOffBy && (
                  <p className="muted">
                    Signed by {review.signedOffBy} at{" "}
                    {formatDateTime(review.signedOffAt)}
                  </p>
                )}
                {review.notes && <p>{review.notes}</p>}
              </div>
            </article>
          );
        })}
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
  onOpenEventFloorDashboard,
  onOpenInventory,
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
  function reviewStatusForHistoryDate(historyDate) {
  const reviewMap =
    typeof managerReviewHistoryByDate !== "undefined" && managerReviewHistoryByDate
      ? managerReviewHistoryByDate
      : globalThis.__meshManagerReviewHistoryByDate || {};

  return buildReviewStatusForHistoryDate(historyDate, reviewMap);
}

  async function refreshManagerReviewStatusHistory(limit = 14) {
    if (authStatus.loginSource !== "supabase_auth") {
      return {};
    }

    const result = await fetchManagerDailyReviewHistory({ limit });

    if (!result.ok) {
      return {};
    }

    const nextMap = {};
    for (const review of result.records || []) {
      if (review?.date) {
        nextMap[review.date] = review;
      }
    }

    globalThis.__meshManagerReviewHistoryByDate = nextMap;
    setManagerReviewHistoryByDate(nextMap);
    return nextMap;
  }

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
  const activeSiteOverride = siteSettings.managerOverrideEnabled
    ? isOverrideActive(siteOverrides)
    : null;
  const allTasks = activeShifts.flatMap((shift) =>
    flattenTasks(routines, shift.id, date),
  );
  const visibleTasks = allTasks.filter(
    (task) => shiftFilter === "all" || task.shiftType === shiftFilter,
  );
  const requiredVisibleTasks = visibleTasks.filter((task) => !isOptionalTask(task));
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
  const missingTasks = requiredVisibleTasks.filter(
    (task) => !handledIds.has(task.id),
  );
  const criticalMissing = missingTasks.filter(
    (task) => task.priority === "critical",
  );
  const visibleCritical = requiredVisibleTasks.filter(
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

  function readManagerDailyReviewForReport(reportDate = date) {
    try {
      return JSON.parse(
        localStorage.getItem(
          "mesh-manager-daily-review-v1:" + (reportDate || "unknown"),
        ) || "null",
      );
    } catch {
      return null;
    }
  }

  function buildManagerReviewReportSection(reportDate = date) {
    const review = readManagerDailyReviewForReport(reportDate);
    const reviewChecklist = [
      "action_center_reviewed",
      "asset_issues_checked",
      "financial_signoffs_checked",
      "alerts_attention_checked",
      "daily_report_reviewed",
    ];

    const checkedCount = review
      ? reviewChecklist.filter((item) => review.checked?.[item]).length
      : 0;

    const signed = Boolean(review?.signedOffAt);

    return [
      "",
      "Manager daily review",
      `Status: ${signed ? "Signed" : checkedCount ? "Open" : "Not started"}`,
      `Checks: ${checkedCount}/${reviewChecklist.length}`,
      `Signed by: ${review?.signedOffBy || "-"}`,
      `Signed at: ${review?.signedOffAt ? formatDateTime(review.signedOffAt) : "-"}`,
      `Notes: ${review?.notes?.trim() || "-"}`,
    ];
  }

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
      const shiftLogsByTask = Object.fromEntries(
        shiftLogs.map((log) => [log.taskId, log]),
      );
      const shiftStats = getShiftStats(shiftTasks, shiftLogsByTask);
      const done = shiftLogs.filter((log) => log.status === "done").length;
      const notRelevant = shiftLogs.filter(
        (log) => log.status === "not_relevant",
      ).length;
      const handled = done + notRelevant;
      const missing = shiftStats.missing;
      const criticalMissingCount = shiftStats.criticalMissing;
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
      if (shiftStats.optionalTotal)
        lines.push(`Optional quiet-time tasks: ${shiftStats.optionalTotal}`);
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
    await refreshManagerReviewStatusHistory(14);
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
    const reviewMap = await refreshManagerReviewStatusHistory(14);
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

  function buildDailyReportWithManagerReview() {
    let report = buildDailyReport();

    if (!report.includes("Manager daily review")) {
      report = `${report}\n${buildManagerReviewReportSection().join("\n")}`;
    }

    return report;
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
    if (!report.includes("Manager daily review")) {
      report = `${report}\n${buildManagerReviewReportSection().join("\n")}`;
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
    const report = buildDailyReportWithManagerReview();
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
      <ManagerDashboardJumpIndex includeStockCount={Boolean(onOpenInventory)} />
      <ManagerDashboardSectionCollapseControls />
      <ManagerDashboardActionCenter
        user={user}
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
        reviewStatusForHistoryDate={
    typeof reviewStatusForHistoryDate === "function"
      ? reviewStatusForHistoryDate
      : fallbackReviewStatusForHistoryDate
  }
/>
      <ManagerDailyReviewHistory user={user} date={date} />

      {message && <p className="status-message">{message}</p>}

      <EventCodeGeneratorPanel user={user} />

      {onOpenInventory && (
        <section className="manager-list inventory-dashboard-card">
          <p className="eyebrow">Inventory</p>
          <h2>Stock Count</h2>
          <p className="muted">
            Start or continue a count, review shortages, manage par levels, and
            open approved stock history.
          </p>
          <button
            type="button"
            className="primary-button manager-full-button"
            onClick={onOpenInventory}
          >
            Open Stock Count
          </button>
        </section>
      )}

      {canGenerateEventCode(user) && (
        <section className="manager-list">
          <h2>Event floor tools</h2>
          <p className="muted">
            Open the event floor manager view for event checks, assignments, and
            event-floor operations.
          </p>
          <button
            type="button"
            className="primary-button manager-full-button"
            onClick={onOpenEventFloorDashboard}
          >
            Event Floor Manager Dashboard
          </button>
        </section>
      )}

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
        <p className="muted">
          Network guard: not configured. Browsers cannot reliably read WiFi
          network names.
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
          value={dailyReportText || buildDailyReportWithManagerReview()}
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
                <span>
                  Manager review: <strong>{reviewStatusForHistoryDate(day.date).label}</strong> · Checks{" "}
                  {reviewStatusForHistoryDate(day.date).checkedCount}/5
                </span>
                {reviewStatusForHistoryDate(day.date).signedAt && (
                  <span>
                    Signed by {reviewStatusForHistoryDate(day.date).signedBy} at{" "}
                    {formatDateTime(reviewStatusForHistoryDate(day.date).signedAt)}
                  </span>
                )}
                {reviewStatusForHistoryDate(day.date).notes && (
                  <span>Review notes: yes</span>
                )}
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
                  managerReviewHistoryByDate,
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
  const [user, setUser] = useState(() => {
    const storedUser = readStorage(SESSION_KEY, null);
    return storedUser?.loginSource === "supabase_auth"
      ? { ...storedUser, authSessionVerified: false }
      : storedUser;
  });
  const initialAuthCallbackRef = useRef(null);
  if (!initialAuthCallbackRef.current) {
    const callbackState =
      typeof window === "undefined"
        ? { status: "idle", source: "none" }
        : inspectAuthCallback(window.location);
    let retainedRecovery = false;
    if (typeof window !== "undefined") {
      try {
        retainedRecovery = sessionStorage.getItem(PASSWORD_RECOVERY_UI_KEY) === "pending";
        if (callbackState.source === "recovery_callback") {
          sessionStorage.setItem(PASSWORD_RECOVERY_UI_KEY, "pending");
          retainedRecovery = true;
        }
        if (callbackState.status === "invalid") {
          sessionStorage.removeItem(PASSWORD_RECOVERY_UI_KEY);
          retainedRecovery = false;
        }
      } catch {
        retainedRecovery = false;
      }
    }
    initialAuthCallbackRef.current =
      callbackState.status === "idle" && retainedRecovery
        ? { status: "checking", source: "retained_recovery" }
        : callbackState;
  }
  const [passwordRecoveryState, setPasswordRecoveryState] = useState(() =>
    !isSupabaseAuthConfigured && initialAuthCallbackRef.current.status === "checking"
      ? {
          status: "invalid",
          message: "Password recovery is not configured for this application.",
        }
      : initialAuthCallbackRef.current,
  );
  const passwordRecoveryStateRef = useRef(passwordRecoveryState);
  const [loginNotice, setLoginNotice] = useState("");
  const [showAccountSecurity, setShowAccountSecurity] = useState(false);
  const [selectedShift, setSelectedShift] = useState(null);
  const [showManager, setShowManager] = useState(false);
  const [showEventFloorManager, setShowEventFloorManager] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [showRoutineEngine, setShowRoutineEngine] = useState(false);
  const [currentRoleMode, setCurrentRoleMode] = useState(() =>
    normalizeRoleMode(readStorage(ROLE_MODE_KEY, null), readStorage(SESSION_KEY, null)),
  );
  const [currentOperator, setCurrentOperator] = useState(() =>
    normalizeOperator(readStorage(OPERATOR_KEY, null)),
  );
  const [currentShiftScope, setCurrentShiftScope] = useState(() =>
    normalizeShiftScope(
      readStorage(SHIFT_SCOPE_KEY, null),
      readStorage(SESSION_KEY, null),
      normalizeOperator(readStorage(OPERATOR_KEY, null)),
    ),
  );
  const [eventCodeAccess, setEventCodeAccess] = useState(() =>
    readStorage(EVENT_CODE_ACCESS_KEY, null),
  );
  const [showGlobalAlert, setShowGlobalAlert] = useState(false);
  const [activeGuideId, setActiveGuideId] = useState("");
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
  const [eventOperations, setEventOperations] = useState(() =>
    normalizeRecords(readStorage(EVENT_OPERATIONS_KEY, [])),
  );
  const [eventStaffPresence, setEventStaffPresence] = useState(() =>
    normalizeRecords(readStorage(EVENT_STAFF_PRESENCE_KEY, [])),
  );
  const [eventRoleAssignments, setEventRoleAssignments] = useState(() =>
    normalizeRecords(readStorage(EVENT_ROLE_ASSIGNMENT_KEY, [])),
  );
  const [eventOperationTasks, setEventOperationTasks] = useState(() =>
    normalizeRecords(readStorage(EVENT_OPERATION_TASK_KEY, [])),
  );
  const [eventHandovers, setEventHandovers] = useState(() =>
    normalizeRecords(readStorage(EVENT_HANDOVER_KEY, [])),
  );
  const [eventLiveUpdates, setEventLiveUpdates] = useState(() =>
    normalizeRecords(readStorage(EVENT_LIVE_UPDATE_KEY, [])),
  );
  const [eventTaskAlertState, setEventTaskAlertState] = useState(() =>
    readStorage(EVENT_TASK_ALERT_STATE_KEY, {}),
  );
  const [eventTaskAlertSettings, setEventTaskAlertSettings] = useState(() =>
    readStorage(EVENT_TASK_ALERT_SETTINGS_KEY, {
      enabled: false,
      notificationPermission:
        typeof window !== "undefined" && "Notification" in window
          ? window.Notification.permission
          : "unsupported",
      enabledAt: "",
    }),
  );
  const [eventTaskAlerts, setEventTaskAlerts] = useState([]);
  const [eventTaskActionStatus, setEventTaskActionStatus] = useState({});
  const [eventRealtimeStatus, setEventRealtimeStatus] = useState({
    state: "disabled",
    message: "",
    lastEventAt: "",
  });
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
    authSessionPresent: user?.authSessionVerified === true,
    profileFetchStatus:
      user?.authSessionVerified === true
        ? "profile_loaded"
        : user?.loginSource === "supabase_auth"
          ? "auth_session_unverified"
          : "not_loaded",
    profileFetchErrorCode: "",
    profileFetchErrorMessage: "",
    profileFetchError: "",
    lastProfileFetchAt: "",
    isSharedDevice: isSharedDeviceUser(user),
    sharedDeviceLabel: user?.sharedDeviceLabel || user?.shared_device_label || "",
  });
  const [pilotAccepted, setPilotAccepted] = useState(() =>
    readStorage(PILOT_NOTICE_KEY, false),
  );
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [waitingWorker, setWaitingWorker] = useState(null);

  useEffect(() => {
    let invalidCallbackTimer = null;
    const subscription = onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        if (!session?.user?.id) {
          setPasswordRecovery({
            status: "invalid",
            message: "This password reset link is invalid, expired, or has already been used.",
          });
          return;
        }
        try {
          sessionStorage.setItem(PASSWORD_RECOVERY_UI_KEY, "pending");
        } catch {
          // Recovery still remains guarded in React state for this page load.
        }
        setPasswordRecovery({ status: "ready", source: "PASSWORD_RECOVERY" });
        clearLocalAuthUiState();
        return;
      }

      if (
        event === "INITIAL_SESSION" &&
        passwordRecoveryStateRef.current.status === "checking"
      ) {
        if (passwordRecoveryStateRef.current.source === "retained_recovery") {
          if (session?.user?.id) {
            setPasswordRecovery({ status: "ready", source: "retained_recovery" });
            clearLocalAuthUiState();
          } else {
            try {
              sessionStorage.removeItem(PASSWORD_RECOVERY_UI_KEY);
            } catch {
              // The invalid-link screen still prevents ordinary app routing.
            }
            setPasswordRecovery({
              status: "invalid",
              message: "This password reset link is invalid, expired, or has already been used.",
            });
          }
          return;
        }
        invalidCallbackTimer = window.setTimeout(() => {
          if (passwordRecoveryStateRef.current.status === "checking") {
            try {
              sessionStorage.removeItem(PASSWORD_RECOVERY_UI_KEY);
            } catch {
              // The invalid-link screen still prevents ordinary app routing.
            }
            setPasswordRecovery({
              status: "invalid",
              message: "This password reset link is invalid, expired, or has already been used.",
            });
          }
        }, 0);
      }
    });

    return () => {
      if (invalidCallbackTimer !== null) window.clearTimeout(invalidCallbackTimer);
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => saveStorage(LOG_KEY, logs), [logs]);
  useEffect(() => saveStorage(ROUTINE_KEY, routines), [routines]);
  useEffect(() => saveStorage(STAFF_KEY, staffUsers), [staffUsers]);
  useEffect(() => saveStorage(HANDOVER_KEY, handoverNotes), [handoverNotes]);
  useEffect(() => saveStorage(FINISH_KEY, finishRecords), [finishRecords]);
  useEffect(() => saveStorage(ALERT_KEY, alerts), [alerts]);
  useEffect(
    () => saveStorage(EVENT_CODE_ACCESS_KEY, eventCodeAccess),
    [eventCodeAccess],
  );
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
  useEffect(() => saveStorage(EVENT_OPERATIONS_KEY, eventOperations), [eventOperations]);
  useEffect(() => saveStorage(EVENT_STAFF_PRESENCE_KEY, eventStaffPresence), [eventStaffPresence]);
  useEffect(() => saveStorage(EVENT_ROLE_ASSIGNMENT_KEY, eventRoleAssignments), [eventRoleAssignments]);
  useEffect(() => saveStorage(EVENT_OPERATION_TASK_KEY, eventOperationTasks), [eventOperationTasks]);
  useEffect(() => saveStorage(EVENT_HANDOVER_KEY, eventHandovers), [eventHandovers]);
  useEffect(() => saveStorage(EVENT_LIVE_UPDATE_KEY, eventLiveUpdates), [eventLiveUpdates]);
  useEffect(() => saveStorage(EVENT_TASK_ALERT_STATE_KEY, eventTaskAlertState), [eventTaskAlertState]);
  useEffect(
    () => saveStorage(EVENT_TASK_ALERT_SETTINGS_KEY, eventTaskAlertSettings),
    [eventTaskAlertSettings],
  );

  const alertsRef = useRef(alerts);
  const logsRef = useRef(logs);
  const handoverNotesRef = useRef(handoverNotes);
  const cashSignoffsRef = useRef(cashSignoffs);
  const assetChecksRef = useRef(assetChecks);
  const eventTaskAlertStateRef = useRef(eventTaskAlertState);
  const eventOperationsRefreshRef = useRef(false);

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

  useEffect(() => {
    eventTaskAlertStateRef.current = eventTaskAlertState;
  }, [eventTaskAlertState]);

  const activeOverride = isOverrideActive(siteOverrides);
  const activeManagerOverride =
    siteSettings.managerOverrideEnabled && isManager(user) ? activeOverride : null;
  const managerLocalTestingBypass =
    siteSettings.locationCheckEnabled && isManager(user) && isLocalhostRuntime();
  const siteAccessStatus =
    activeManagerOverride || managerLocalTestingBypass ? "override" : siteAccess.status;
  const effectiveActor = getEffectiveActor(user, currentOperator);
  const effectiveUser = userForActor(user, effectiveActor);

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
          message: !hasSiteCoordinates(siteSettings)
            ? "Location guard not configured"
            : "Location unavailable",
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

  async function requestWriteAccess(
    blockedMessage = "Location guard is blocking operational changes.\n\nDisable Location Check in Manager Dashboard or use temporary manager override for local testing.",
  ) {
    if (
      !siteSettings.locationCheckEnabled ||
      activeManagerOverride ||
      managerLocalTestingBypass
    )
      return true;
    if (!hasSiteCoordinates(siteSettings)) {
      window.alert(
        "Location guard not configured\n\nSite coordinates are missing in Youngs Site Mode. Save site settings before using this as a hard guard.",
      );
      return true;
    }
    const result = await checkLocation();
    if (result.status === "on_site") return true;
    window.alert(blockedMessage);
    return false;
  }

  async function enableEventTaskAlerts() {
    let notificationPermission =
      typeof window !== "undefined" && "Notification" in window
        ? window.Notification.permission
        : "unsupported";
    if (typeof window !== "undefined" && "Notification" in window) {
      try {
        notificationPermission = await window.Notification.requestPermission();
      } catch {
        notificationPermission = window.Notification.permission || "default";
      }
    }
    let soundUnlocked = false;
    try {
      soundUnlocked = await playEventTaskBeep();
    } catch {
      soundUnlocked = false;
    }
    if (navigator.vibrate) navigator.vibrate([120]);
    const settings = {
      enabled: true,
      notificationPermission,
      soundUnlocked,
      enabledAt: new Date().toISOString(),
    };
    setEventTaskAlertSettings(settings);
    saveStorage(EVENT_TASK_ALERT_SETTINGS_KEY, settings);
    return settings;
  }

  function setPasswordRecovery(nextState) {
    passwordRecoveryStateRef.current = nextState;
    setPasswordRecoveryState(nextState);
  }

  function clearLocalAuthUiState() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(OPERATOR_KEY);
    localStorage.removeItem(EVENT_CODE_ACCESS_KEY);
    localStorage.removeItem(ROLE_MODE_KEY);
    localStorage.removeItem(SHIFT_SCOPE_KEY);
    setUser(null);
    setCurrentOperator(null);
    setCurrentShiftScope(null);
    setEventCodeAccess(null);
    setCurrentRoleMode(null);
    setSelectedShift(null);
    setShowManager(false);
    setShowEventFloorManager(false);
    setShowRoutineEngine(false);
    setShowInventory(false);
    setShowAccountSecurity(false);
    setAuthStatus((current) => ({
      ...current,
      loginSource: "staff_code",
      authUserId: "",
      profileRole: "",
      organizationId: "",
      authSessionPresent: false,
      profileFetchStatus: "not_loaded",
      profileFetchErrorCode: "",
      profileFetchErrorMessage: "",
      profileFetchError: "",
      lastProfileFetchAt: new Date().toISOString(),
    }));
  }

  function scrubAuthCallbackUrl() {
    if (typeof window === "undefined") return;
    const safeUrl = applicationBaseUrl(window.location, import.meta.env.BASE_URL);
    window.history.replaceState({}, document.title, safeUrl);
  }

  function clearPasswordRecoveryUiMarker() {
    try {
      sessionStorage.removeItem(PASSWORD_RECOVERY_UI_KEY);
    } catch {
      // The marker contains no credentials and expires with the browser tab.
    }
  }

  async function handlePasswordRecoveryRequest(email) {
    if (!isSupabaseAuthConfigured) {
      return { ok: false, error: "Password recovery is not configured." };
    }
    try {
      const redirectTo = applicationBaseUrl(window.location, import.meta.env.BASE_URL);
      await requestPasswordRecoveryEmail(email, redirectTo);
      return { ok: true };
    } catch {
      return {
        ok: false,
        error: "A reset email could not be requested right now. Wait a minute and try again.",
      };
    }
  }

  async function handleRecoveryPasswordUpdate(password) {
    await updateCurrentUserPassword(password);
    scrubAuthCallbackUrl();
    try {
      await signOutPasswordRecoverySession();
    } catch (error) {
      clearLocalAuthUiState();
      setPasswordRecovery({
        status: "completion_error",
        message: "The password was updated, but this recovery session could not be closed. Try returning to login before continuing.",
      });
      throw error;
    }
    clearPasswordRecoveryUiMarker();
    clearLocalAuthUiState();
    setPasswordRecovery({ status: "idle", source: "completed" });
    setLoginNotice("Password updated — log in with your new password.");
  }

  async function returnFromPasswordRecovery() {
    try {
      await signOutPasswordRecoverySession();
    } catch {
      scrubAuthCallbackUrl();
      clearLocalAuthUiState();
      if (passwordRecoveryStateRef.current.status !== "invalid") {
        setPasswordRecovery({
          status: "completion_error",
          message: "This recovery session could not be closed safely. Close this tab or try returning to login again.",
        });
        return;
      }
    }
    clearPasswordRecoveryUiMarker();
    scrubAuthCallbackUrl();
    clearLocalAuthUiState();
    setPasswordRecovery({ status: "idle", source: "cancelled" });
  }

  function triggerEventTaskAlert(alertRecord) {
    setEventTaskAlerts((current) => {
      const withoutExisting = current.filter((item) => item.id !== alertRecord.id);
      return [alertRecord, ...withoutExisting].slice(0, 5);
    });
    if (!eventTaskAlertSettings.enabled) return;
    playEventTaskBeep().catch(() => {});
    if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
    showEventTaskBrowserNotification(alertRecord);
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
        details.authSessionPresent ?? nextUser?.authSessionVerified === true,
      ),
      profileFetchStatus:
        details.profileFetchStatus ||
        (nextUser?.authSessionVerified === true
          ? "profile_loaded"
          : "not_loaded"),
      profileFetchErrorCode: details.profileFetchErrorCode || "",
      profileFetchErrorMessage: details.profileFetchErrorMessage || "",
      profileFetchError: error,
      isSharedDevice: isSharedDeviceUser(nextUser),
      sharedDeviceLabel:
        nextUser?.sharedDeviceLabel || nextUser?.shared_device_label || "",
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
    if (!import.meta.env.DEV) return;
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
      const actor = getEffectiveActor(user, currentOperator);
      const result = await createOrUpdateShiftSession({
        localId: shiftSessionLocalId(date, shiftType),
        date,
        shiftType,
        shiftLabel: shiftLabels[shiftType] || shiftType,
        startedAt,
        finishedAt,
        status,
        userProfileId: user?.backendUserId || user?.authUserId || "",
        displayName: actor.operatorName,
        role: actor.operatorRoleLabel || user?.role || "",
        loginSource: actor.operatorSource || user?.loginSource || "staff_code",
        operatorName: actor.operatorName,
        operatorSource: actor.operatorSource,
        operatorRoleLabel: actor.operatorRoleLabel,
        authDisplayName: actor.authDisplayName,
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
      const result = await applySupabaseSession(session);
      if (result.ok) setLoginNotice("");
      return result;
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
    const { clearRoutineOperatorSession } = await import("./features/routines-v2/auth/routineOperatorSession.js");
    clearRoutineOperatorSession();
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(OPERATOR_KEY);
    localStorage.removeItem(EVENT_CODE_ACCESS_KEY);
    localStorage.removeItem(ROLE_MODE_KEY);
    localStorage.removeItem(SHIFT_SCOPE_KEY);
    setUser(null);
    setCurrentOperator(null);
    setCurrentShiftScope(null);
    setEventCodeAccess(null);
    setCurrentRoleMode(null);
    setSelectedShift(null);
    setShowManager(false);
    setShowRoutineEngine(false);
    setShowEventFloorManager(false);
    setAuthStatus((current) => ({
      ...current,
      configured: isSupabaseAuthConfigured,
      loginSource: "staff_code",
      authUserId: "",
      profileRole: "",
      organizationId: "",
      profileActive: true,
      isSharedDevice: false,
      sharedDeviceLabel: "",
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
      if (passwordRecoveryStateRef.current.status !== "idle") return;
      if (!isSupabaseAuthConfigured) {
        setAuthStatus((current) => ({ ...current, configured: false }));
        return;
      }
      const session = await getCurrentSession();
      if (passwordRecoveryStateRef.current.status !== "idle") return;
      if (!session?.user || cancelled) {
        if (!cancelled && user?.loginSource === "supabase_auth") {
          localStorage.removeItem(SESSION_KEY);
          setUser(null);
          updateAuthStatusFromUser(null, "Email login is required for Stock Count.", {
            authSessionPresent: false,
            profileFetchStatus: "auth_session_missing",
          });
        }
        return;
      }
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

  useEffect(() => {
    const normalized = normalizeRoleMode(readStorage(ROLE_MODE_KEY, null), user);
    setCurrentRoleMode(normalized);
    if (!normalized) localStorage.removeItem(ROLE_MODE_KEY);
  }, [user?.id, user?.authUserId, user?.code, user?.name]);

  useEffect(() => {
    const normalized = normalizeShiftScope(
      readStorage(SHIFT_SCOPE_KEY, null),
      user,
      currentOperator,
    );
    setCurrentShiftScope(normalized);
    if (!normalized) localStorage.removeItem(SHIFT_SCOPE_KEY);
  }, [user?.id, user?.authUserId, user?.code, user?.name, currentOperator?.name]);

  useEffect(() => {
    setEventTaskAlerts([]);
    setEventTaskActionStatus({});
  }, [currentOperator?.name]);

  useEffect(() => {
    if (isSharedDeviceUser(user) && !normalizeOperator(currentOperator)) {
      setEventTaskAlerts([]);
      setEventTaskActionStatus({});
    }
  }, [user?.id, user?.authUserId, currentOperator?.name]);

  useEffect(() => {
    if (!user) return;
    registerEventStaffPresence(user, currentOperator, currentShiftScope, currentRoleMode);
  }, [
    user?.id,
    user?.authUserId,
    user?.backendUserId,
    user?.name,
    currentOperator?.name,
    currentOperator?.source,
    currentShiftScope?.selectedScope,
    currentRoleMode?.roleMode,
  ]);

  useEffect(() => {
    if (user?.loginSource === "supabase_auth") refreshEventOperationsBackend(todayKey());
  }, [user?.id, user?.loginSource]);

  useEffect(() => {
    if (!user) {
      setEventTaskAlerts([]);
      return undefined;
    }
    refreshEventOperationsLive("event_task_login");
    const intervalId = window.setInterval(
      () => refreshEventOperationsLive("event_task_poll"),
      EVENT_TASK_ALERT_POLL_SECONDS * 1000,
    );
    function refreshOnFocus() {
      refreshEventOperationsLive("event_task_focus");
    }
    function refreshOnVisible() {
      if (document.visibilityState === "visible")
        refreshEventOperationsLive("event_task_visible");
    }
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnVisible);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnVisible);
    };
  }, [user?.id, user?.loginSource, currentOperator?.name]);

  useEffect(() => {
    if (!user) return;
    if (["overview", "event"].includes(selectedShift) || showEventFloorManager)
      refreshEventOperationsLive("event_task_view_open");
  }, [selectedShift, showEventFloorManager, user?.id]);

  useEffect(() => {
    const organizationId =
      user?.organizationId || user?.organization_id || authStatus.organizationId || "";
    const enabled =
      user?.loginSource === "supabase_auth" &&
      Boolean(organizationId) &&
      (selectedShift === "event" || showEventFloorManager);
    const subscription = subscribeToEventOperationsRealtime({
      organizationId,
      enabled,
      onRefresh: (reason) => refreshEventOperationsLive(reason),
      onStatus: setEventRealtimeStatus,
    });
    return () => subscription.unsubscribe();
  }, [
    user?.id,
    user?.loginSource,
    user?.organizationId,
    user?.organization_id,
    authStatus.organizationId,
    selectedShift,
    showEventFloorManager,
  ]);

  useEffect(() => {
    if (!user) return;
    const operator = normalizeOperator(currentOperator);
    const sharedDevice = isSharedDeviceUser(user);
    const operatorReady = !sharedDevice || Boolean(operator?.name);
    const operatorName = normalizedPersonName(operator?.name);
    const operatorEventAccessValid =
      eventCodeAccess?.codeDate === getOsloDateKey() &&
      (!sharedDevice || normalizedPersonName(eventCodeAccess?.operatorName) === operatorName) &&
      (!eventCodeAccess.expiresAt || new Date(eventCodeAccess.expiresAt) > new Date());
    const eventActorReadyForAlerts =
      selectedShift === "event" &&
      operatorReady &&
      (isManager(effectiveUser) || canUseEventFloorDashboard(effectiveUser) || operatorEventAccessValid);
    if (!eventActorReadyForAlerts) {
      setEventTaskAlerts([]);
      return;
    }
    const assignedTasks = assignedEventTasksForUser(
      eventOperations,
      eventRoleAssignments,
      eventOperationTasks,
      effectiveUser,
    ).filter(isOpenEventTask);
    const currentState = eventTaskAlertStateRef.current || {};
    const nextState = { ...currentState };
    const now = Date.now();
    const newAlerts = [];

    assignedTasks.forEach((task) => {
      if (task.remindAt) {
        const remindTime = new Date(task.remindAt).getTime();
        const reminderKey = eventTaskAlertKey(effectiveUser, task, "reminder");
        if (!Number.isNaN(remindTime) && remindTime <= now && !currentState[reminderKey]) {
          nextState[reminderKey] = { alertedAt: new Date().toISOString() };
          const minutes = minutesBetweenNow(task.dueAt);
          newAlerts.push({
            id: reminderKey,
            taskId: task.id,
            type: "reminder",
            title: `Upcoming event task: ${task.title}`,
            body:
              minutes !== null && minutes >= 0
                ? `${task.title} is due in ${minutes} min.`
                : `${task.title} is coming up.`,
            zone: task.zone || "all",
            dueAt: task.dueAt,
            assignedTo: taskAssignedLabel(task),
          });
        }
      }
      if (task.dueAt) {
        const dueTime = new Date(task.dueAt).getTime();
        const dueKey = eventTaskAlertKey(effectiveUser, task, "due");
        if (!Number.isNaN(dueTime) && dueTime <= now && !currentState[dueKey]) {
          nextState[dueKey] = { alertedAt: new Date().toISOString() };
          newAlerts.push({
            id: dueKey,
            taskId: task.id,
            type: "due",
            title: `DO NOW: ${task.title}`,
            body: `DO NOW: ${task.title}`,
            zone: task.zone || "all",
            dueAt: task.dueAt,
            assignedTo: taskAssignedLabel(task),
          });
        }
      }
    });

    const activeTaskIds = new Set(assignedTasks.map((task) => task.id));
    setEventTaskAlerts((current) =>
      current.filter((alert) => activeTaskIds.has(alert.taskId)),
    );
    if (!newAlerts.length) return;
    eventTaskAlertStateRef.current = nextState;
    setEventTaskAlertState(nextState);
    saveStorage(EVENT_TASK_ALERT_STATE_KEY, nextState);
    newAlerts.forEach(triggerEventTaskAlert);
  }, [
    user?.id,
    effectiveUser?.name,
    effectiveUser?.operatorName,
    currentOperator?.name,
    selectedShift,
    eventCodeAccess?.codeDate,
    eventCodeAccess?.operatorName,
    eventCodeAccess?.expiresAt,
    eventOperations,
    eventRoleAssignments,
    eventOperationTasks,
    eventTaskAlertSettings.enabled,
  ]);

  if (passwordRecoveryState.status !== "idle") {
    return (
      <PasswordRecoveryScreen
        state={passwordRecoveryState}
        onUpdatePassword={handleRecoveryPasswordUpdate}
        onReturnToLogin={returnFromPasswordRecovery}
      />
    );
  }

  if (!user) {
    return (
      <>
        <Login
          onLogin={(nextUser) => {
            setLoginNotice("");
            saveStorage(SESSION_KEY, nextUser);
            setUser(nextUser);
            updateAuthStatusFromUser(nextUser);
          }}
          staffUsers={staffUsers}
          onSupabaseLogin={handleSupabaseLogin}
          onPasswordRecoveryRequest={handlePasswordRecoveryRequest}
          authStatus={authStatus}
          onAuthSignOut={clearSupabaseAuthSession}
          loginNotice={loginNotice}
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
    const { clearRoutineOperatorSession } = await import("./features/routines-v2/auth/routineOperatorSession.js");
    clearRoutineOperatorSession();
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(OPERATOR_KEY);
    localStorage.removeItem(EVENT_CODE_ACCESS_KEY);
    setUser(null);
    setCurrentOperator(null);
    setEventCodeAccess(null);
    setSelectedShift(null);
    setShowManager(false);
    setShowRoutineEngine(false);
    setAuthStatus((current) => ({
      ...current,
      loginSource: "staff_code",
      authUserId: "",
      profileRole: "",
      organizationId: "",
      profileActive: true,
      isSharedDevice: false,
      sharedDeviceLabel: "",
      profileFetchError: "",
    }));
  }

  function saveCurrentOperator(operator) {
    const normalized = normalizeOperator(operator);
    setCurrentOperator(normalized);
    if (normalized) saveStorage(OPERATOR_KEY, normalized);
    else localStorage.removeItem(OPERATOR_KEY);
  }

  function saveCurrentShiftScope(scope, scopeUser = effectiveUser, operator = currentOperator) {
    const nextScope = makeShiftScope(scope, scopeUser, operator);
    if (!nextScope) return null;
    setCurrentShiftScope(nextScope);
    saveStorage(SHIFT_SCOPE_KEY, nextScope);
    return nextScope;
  }

  async function setShiftScopeAndOpen(
    scope,
    scopeUser = effectiveUser,
    operator = currentOperator,
    options = {},
  ) {
    const nextScope = makeShiftScope(scope, scopeUser, operator);
    if (!nextScope) return { ok: false, message: "Shift scope not available." };
    const targetShift = defaultShiftForScope(scope);
    const timeAccess = getShiftAccessStatus(targetShift, scopeUser);
    if (!timeAccess.allowed) return timeAccess;
    const siteAccessResult = await checkShiftSiteAccess(targetShift, scopeUser);
    if (!siteAccessResult.allowed) return siteAccessResult;
    setCurrentShiftScope(nextScope);
    saveStorage(SHIFT_SCOPE_KEY, nextScope);
    setSelectedShift(options.openTarget ? targetShift : "overview");
    setShowManager(false);
    setShowEventFloorManager(false);
    return { ok: true, shiftId: targetShift, scope: nextScope };
  }

  function clearShiftScopeAndSelection() {
    setSelectedShift(null);
    setCurrentShiftScope(null);
    localStorage.removeItem(SHIFT_SCOPE_KEY);
  }

  async function openMyShiftFromScope() {
    if (!activeShiftScope) {
      setSelectedShift(null);
      return;
    }
    const targetShift = defaultShiftForScope(activeShiftScope.selectedScope);
    const siteAccessResult = await checkShiftSiteAccess(targetShift, effectiveUser);
    if (!siteAccessResult.allowed) {
      window.alert(siteAccessResult.message);
      return;
    }
    setSelectedShift(targetShift);
  }

  async function checkShiftSiteAccess(shiftId, actorUser = effectiveUser) {
    if (!protectedSiteAccessShifts.has(shiftId)) {
      return { allowed: true, blocked: false, message: "" };
    }
    const overrideForUser =
      siteSettings.managerOverrideEnabled && isManager(actorUser)
        ? activeOverride
        : null;
    const currentStatus = getSiteAccessGuardStatus({
      shiftId,
      user: actorUser,
      siteSettings,
      siteAccess,
      activeOverride: overrideForUser,
    });
    if (!siteSettings.locationCheckEnabled || !hasSiteCoordinates(siteSettings)) {
      return currentStatus;
    }
    if (currentStatus.allowed) return currentStatus;
    const checkedLocation = await checkLocation();
    return getSiteAccessGuardStatus({
      shiftId,
      user: actorUser,
      siteSettings,
      siteAccess: checkedLocation,
      activeOverride: overrideForUser,
    });
  }

  async function saveCurrentOperatorAndRoute(operator) {
    const operatorShiftId = shiftIdForOperatorRoleLabel(operator?.roleLabel);
    const operatorUser = userForActor(user, {
      operatorName: operator?.name,
      operatorSource: operator?.source,
      operatorRoleLabel: operator?.roleLabel,
      authDisplayName: user?.name || "",
      isSharedDevice: true,
    });
    const scopeId =
      operatorShiftId === "double_opening_closing"
        ? "double_opening_closing"
        : shiftScopeOptions[operatorShiftId]?.selectedScope || operatorShiftId;
    if (!shiftScopeOptions[scopeId]) {
      saveCurrentOperator(operator);
      setSelectedShift(null);
      setShowManager(false);
      setShowEventFloorManager(false);
      return { ok: true };
    }
    const targetShift = defaultShiftForScope(scopeId);
    const timeAccess = getShiftAccessStatus(targetShift, operatorUser);
    if (!timeAccess.allowed) return timeAccess;
    const siteAccessResult = await checkShiftSiteAccess(
      targetShift,
      operatorUser,
    );
    if (!siteAccessResult.allowed) return siteAccessResult;
    saveCurrentOperator(operator);
    saveCurrentShiftScope(scopeId, operatorUser, operator);
    setSelectedShift(scopeId === "event" ? "event" : "overview");
    setShowManager(false);
    setShowEventFloorManager(false);
    return { ok: true };
  }

  async function chooseRoleMode(roleMode) {
    const option = roleModeOptions.find((item) => item.roleMode === roleMode);
    if (!option) return { ok: false, message: "Role not available." };
    if (roleMode === "other_support") {
      const siteAccessResult = await checkShiftSiteAccess("other_support");
      if (!siteAccessResult.allowed) return siteAccessResult;
    }
    const record = {
      roleMode: option.roleMode,
      selectedAt: new Date().toISOString(),
      selectedDate: getOsloDateKey(),
      userId: userRoleModeId(user),
      label: option.label,
    };
    saveStorage(ROLE_MODE_KEY, record);
    setCurrentRoleMode(record);
    setShowManager(false);
    setShowEventFloorManager(false);
    if (roleMode === "other_support") {
      saveCurrentShiftScope("other_support");
      setSelectedShift("overview");
    } else {
      setSelectedShift(null);
    }
    return { ok: true };
  }

  function clearRoleMode() {
    localStorage.removeItem(ROLE_MODE_KEY);
    setCurrentRoleMode(null);
    clearShiftScopeAndSelection();
    setShowManager(false);
    setShowEventFloorManager(false);
  }

  function mergeById(current, records) {
    const map = new Map(current.map((item) => [item.id, item]));
    records.filter(Boolean).forEach((record) => map.set(record.id, record));
    return [...map.values()];
  }

  function upsertEventList(setter, record) {
    if (!record?.id) return;
    setter((current) => [
      ...current.filter((item) => item.id !== record.id),
      record,
    ]);
  }

  async function refreshEventOperationsBackend(date = todayKey()) {
    const tomorrow = new Date(`${date}T00:00:00`);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = tomorrow.toISOString().slice(0, 10);
    const [todayResult, tomorrowResult, presenceResult] = await Promise.all([
      fetchEventOperationsForDate(date),
      fetchEventOperationsForDate(tomorrowKey),
      fetchEventStaffPresence(date),
    ]);
    const events = [
      ...(todayResult.records || []),
      ...(tomorrowResult.records || []),
    ];
    if (events.length) setEventOperations((current) => mergeById(current, events));
    if (presenceResult.records?.length)
      setEventStaffPresence((current) => mergeById(current, presenceResult.records));

    const eventIds = events.map((event) => event.id).filter(Boolean);
    if (!eventIds.length) return;
    const assignmentResults = await Promise.all(
      eventIds.map((eventId) => fetchEventRoleAssignments(eventId)),
    );
    const taskResults = await Promise.all(
      eventIds.map((eventId) => fetchEventTasks(eventId)),
    );
    const handoverResults = await Promise.all(
      eventIds.map((eventId) => fetchResponsibilityHandovers(eventId)),
    );
    const liveUpdateResults = await Promise.all(
      eventIds.map((eventId) => listEventLiveUpdates(
        eventId,
        currentOperator?.name || effectiveUser.operatorName || effectiveUser.name || "",
      )),
    );
    const assignments = assignmentResults.flatMap((result) => result.records || []);
    const tasks = taskResults.flatMap((result) => result.records || []);
    const handovers = handoverResults.flatMap((result) => result.records || []);
    const liveUpdates = liveUpdateResults.flatMap((result) => result.records || []);
    if (assignments.length)
      setEventRoleAssignments((current) => mergeById(current, assignments));
    if (tasks.length)
      setEventOperationTasks((current) => mergeById(current, tasks));
    if (handovers.length)
      setEventHandovers((current) => mergeById(current, handovers));
    const refreshedLiveUpdateEventIds = new Set(
      liveUpdateResults.flatMap((result, index) => result.ok ? [eventIds[index]] : []),
    );
    if (refreshedLiveUpdateEventIds.size)
      setEventLiveUpdates((current) => mergeById(
        current.filter((item) => !refreshedLiveUpdateEventIds.has(item.eventId)),
        liveUpdates,
      ));
  }

  async function refreshEventOperationsLive(reason = "event_task_poll") {
    if (!user || eventOperationsRefreshRef.current) return;
    eventOperationsRefreshRef.current = true;
    try {
      await refreshEventOperationsBackend(todayKey());
    } finally {
      eventOperationsRefreshRef.current = false;
    }
  }

  async function registerEventStaffPresence(
    presenceUser = user,
    operator = currentOperator,
    shiftScope = currentShiftScope,
    roleMode = currentRoleMode,
  ) {
    if (!presenceUser?.name) return;
    const operatorName = operator?.name || presenceUser.operatorName || presenceUser.name;
    const record = {
      id: `${todayKey()}-${slug(operatorName)}-${presenceUser.authUserId || presenceUser.backendUserId || presenceUser.id || "local"}`,
      date: todayKey(),
      authUserId: presenceUser.authUserId || presenceUser.backendUserId || "",
      operatorName,
      operatorSource:
        operator?.source ||
        presenceUser.operatorSource ||
        presenceUser.loginSource ||
        "staff_code",
      roleLabel: roleMode?.label || shiftScope?.label || presenceUser.role || "",
      selectedShiftScope: shiftScope?.selectedScope || "",
      available: true,
      checkedInAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      metadata: {
        roleMode: roleMode?.roleMode || "",
        sharedDevice: isSharedDeviceUser(presenceUser),
      },
    };
    upsertEventList(setEventStaffPresence, record);
    const result = await upsertEventStaffPresence(record);
    if (result.ok && result.record) upsertEventList(setEventStaffPresence, result.record);
  }

  async function saveEventOperation(payload) {
    if (!(await requestWriteAccess()))
      return { ok: false, message: "Location guard is blocking event board creation." };
    const record = {
      id: eventOpsLocalId("event-operation"),
      date: payload.date || todayKey(),
      title: payload.title,
      venue: payload.venue || "",
      startsAt: payload.startsAt || "",
      endsAt: payload.endsAt || "",
      status: payload.status || "draft",
      description: payload.description || "",
      source: payload.source || "manual",
      sourceRef: payload.sourceRef || "",
      createdByName: payload.createdByName || user.name,
      activeResponsibleName: payload.activeResponsibleName || "",
      activeResponsibleAuthUserId: payload.activeResponsibleAuthUserId || "",
      notes: payload.notes || "",
      metadata: payload.metadata || {},
      updatedAt: new Date().toISOString(),
    };
    const result = await createEventOperation(record);
    if (result.ok && result.record) {
      setEventOperations((current) => [
        ...current.filter((item) => item.id !== record.id && item.id !== result.record.id),
        result.record,
      ]);
      refreshEventOperationsLive("event_board_created");
      return { ok: true, record: result.record, message: "Event board created." };
    }
    return {
      ok: false,
      message: result.message || result.error?.message || "Event board could not be created in Supabase.",
      error: result.error,
    };
  }

  async function saveEventOperationUpdate(id, payload) {
    if (!(await requestWriteAccess()))
      return { ok: false, message: "Location guard is blocking event board updates." };
    const record = { ...payload, id, updatedAt: new Date().toISOString() };
    const result = await updateEventOperation(id, record);
    if (result.ok && result.record) {
      upsertEventList(setEventOperations, result.record);
      refreshEventOperationsLive("event_board_updated");
      return { ok: true, record: result.record, message: "Event board updated." };
    }
    return {
      ok: false,
      message: result.message || result.error?.message || "Event board could not be updated in Supabase.",
      error: result.error,
    };
  }

  async function saveManualEventStaff(name) {
    if (!(await requestWriteAccess()))
      return { ok: false, message: "Location guard is blocking manual staff changes." };
    const record = {
      id: `${todayKey()}-${slug(name)}-manual`,
      date: todayKey(),
      operatorName: name,
      operatorSource: "manual",
      roleLabel: "manual event staff",
      selectedShiftScope: "",
      available: true,
      checkedInAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      metadata: {},
    };
    upsertEventList(setEventStaffPresence, record);
    const result = await upsertEventStaffPresence(record);
    if (result.ok && result.record) {
      upsertEventList(setEventStaffPresence, result.record);
      refreshEventOperationsLive("event_manual_staff_added");
      return { ok: true, record: result.record, message: "Staff added." };
    }
    upsertEventList(setEventStaffPresence, {
      ...record,
      syncError: result.message || result.error?.message || "Backend sync failed.",
    });
    return {
      ok: false,
      message: result.message || result.error?.message || "Manual staff could not be saved in Supabase.",
      error: result.error,
    };
  }

  async function saveEventRoleAssignment(payload) {
    if (!(await requestWriteAccess()))
      return { ok: false, message: "Location guard is blocking role assignment changes." };
    const record = {
      id: eventOpsLocalId("event-role"),
      ...payload,
      active: true,
      updatedAt: new Date().toISOString(),
    };
    const result = await upsertEventRoleAssignment(record);
    if (result.ok && result.record) {
      const singleLead = eventRoleOption(result.record.roleKey)?.singleLead;
      setEventRoleAssignments((current) => {
        const withoutSameRecord = current.filter((item) => item.id !== result.record.id);
        const next = singleLead
          ? withoutSameRecord.map((item) =>
              item.eventId === result.record.eventId &&
              item.roleKey === result.record.roleKey &&
              item.active
                ? { ...item, active: false }
                : item,
            )
          : withoutSameRecord.map((item) =>
              assignmentMatchesPerson(
                item,
                result.record.roleKey,
                result.record.assignedOperatorName,
                result.record.assignedAuthUserId,
              )
                ? { ...item, active: false }
                : item,
            );
        return [...next, result.record];
      });
      refreshEventOperationsLive("event_role_assigned");
      return { ok: true, record: result.record, message: "Role assigned." };
    }
    return {
      ok: false,
      message: result.message || result.error?.message || "Role assignment could not be saved in Supabase.",
      error: result.error,
    };
  }

  async function removeEventRoleAssignment(assignmentId) {
    if (!(await requestWriteAccess()))
      return { ok: false, message: "Location guard is blocking role assignment changes." };
    const result = await deactivateEventRoleAssignment(assignmentId);
    if (result.ok && result.record) {
      setEventRoleAssignments((current) =>
        current.map((assignment) =>
          assignment.id === result.record.id ? { ...assignment, active: false } : assignment,
        ),
      );
      refreshEventOperationsLive("event_role_deactivated");
      return { ok: true, record: result.record, message: "Role assignment removed." };
    }
    return {
      ok: false,
      message: result.message || result.error?.message || "Role assignment could not be removed.",
      error: result.error,
    };
  }

  async function saveEventOperationTask(payload) {
    if (
      !(await requestWriteAccess(
        "Location guard is blocking task creation. Disable Location Check in Manager Dashboard or use temporary manager override for local testing.",
      ))
    ) {
      return {
        ok: false,
        message:
          "Location guard is blocking task creation. Disable Location Check in Manager Dashboard or use temporary manager override for local testing.",
      };
    }
    const record = {
      id: eventOpsLocalId("event-task"),
      ...payload,
      status: payload.status || "pending",
      createdByName: payload.createdByName || user.name,
      updatedAt: new Date().toISOString(),
    };
    const result = await createEventTask(record);
    if (result.ok && result.record) {
      setEventOperationTasks((current) => [
        ...current.filter((item) => item.id !== record.id && item.id !== result.record.id),
        result.record,
      ]);
      refreshEventOperationsLive("event_task_created");
      return { ok: true, record: result.record, message: "Task created." };
    }
    if (result.ok) {
      upsertEventList(setEventOperationTasks, record);
      return { ok: true, record, message: "Task created locally." };
    }
    return {
      ok: false,
      message:
        result.message ||
        result.error?.message ||
        "Task could not be created in Supabase.",
      error: result.error,
    };
  }

  async function saveEventOperationTaskStatus(taskId, status, completionComment = "") {
    if (
      !(await requestWriteAccess(
        "Location guard is blocking task updates. You can view the task, but cannot acknowledge/complete until site access is allowed.",
      ))
    )
      return {
        ok: false,
        message:
          "Location guard is blocking task updates. You can view the task, but cannot acknowledge/complete until site access is allowed.",
      };
    const task = eventOperationTasks.find((item) => item.id === taskId);
    if (!task) return { ok: false, message: "Task was not found." };
    const now = new Date().toISOString();
    const record = {
      ...task,
      status,
      acknowledgedAt: status === "acknowledged" ? now : task.acknowledgedAt,
      acknowledgedByName: status === "acknowledged" ? effectiveUser.name : task.acknowledgedByName,
      completedAt: status === "done" ? now : task.completedAt,
      completedByName: status === "done" ? effectiveUser.name : task.completedByName,
      completionComment: status === "done" ? completionComment : task.completionComment,
      updatedAt: now,
    };
    upsertEventList(setEventOperationTasks, record);
    const result = await updateEventTaskStatus({
      taskId,
      status,
      completedByName: effectiveUser.name,
      actorName: effectiveUser.operatorName || effectiveUser.name,
      completionComment,
    });
    if (result.ok && result.record) {
      upsertEventList(setEventOperationTasks, result.record);
      refreshEventOperationsLive(`event_task_${status}`);
      return {
        ok: true,
        record: result.record,
        message: status === "acknowledged" ? "Task acknowledged." : "Task completed.",
      };
    }
    if (!result.ok) {
      upsertEventList(setEventOperationTasks, task);
      return {
        ok: false,
        message:
          result.message ||
          result.error?.message ||
          `Could not ${status === "acknowledged" ? "acknowledge" : "complete"} task.`,
        error: result.error,
      };
    }
    refreshEventOperationsLive(`event_task_${status}_local`);
    return {
      ok: true,
      record,
      message: status === "acknowledged" ? "Task acknowledged." : "Task completed.",
    };
  }

  async function handleEventTaskStatusUpdate(taskId, status, completionComment = "", alertId = "") {
    const isAcknowledge = status === "acknowledged";
    const pendingStatus = isAcknowledge ? "acknowledging" : "completing";
    const successMessage = isAcknowledge ? "Task acknowledged." : "Task completed.";
    const failurePrefix = isAcknowledge ? "Could not acknowledge task" : "Could not complete task";
    setEventTaskActionStatus((current) => ({
      ...current,
      [taskId]: {
        status: pendingStatus,
        type: "pending",
        message: isAcknowledge ? "Acknowledging..." : "Completing...",
      },
    }));
    try {
      const result = await saveEventOperationTaskStatus(taskId, status, completionComment);
      if (!result?.ok && !result?.record?.id) {
        setEventTaskActionStatus((current) => ({
          ...current,
          [taskId]: {
            status: isAcknowledge ? "acknowledge_error" : "complete_error",
            type: "error",
            message: `${failurePrefix}: ${result?.message || "Unknown error"}`,
          },
        }));
        return result;
      }
      setEventTaskActionStatus((current) => ({
        ...current,
        [taskId]: {
          status: isAcknowledge ? "acknowledged" : "completed",
          type: "success",
          message: result?.message || successMessage,
        },
      }));
      if (alertId) {
        setEventTaskAlerts((current) => current.filter((alert) => alert.id !== alertId));
      }
      return result;
    } catch (error) {
      const result = {
        ok: false,
        message: error?.message || "Unexpected error",
        error,
      };
      setEventTaskActionStatus((current) => ({
        ...current,
        [taskId]: {
          status: isAcknowledge ? "acknowledge_error" : "complete_error",
          type: "error",
          message: `${failurePrefix}: ${result.message}`,
        },
      }));
      return result;
    }
  }

  async function saveEventHandover(payload) {
    if (!(await requestWriteAccess()))
      return { ok: false, message: "Location guard is blocking handover changes." };
    const record = {
      id: eventOpsLocalId("event-handover"),
      ...payload,
      createdByName: payload.createdByName || user.name,
      createdAt: new Date().toISOString(),
    };
    const result = await createResponsibilityHandover(record);
    if (result.ok && result.record) {
      upsertEventList(setEventHandovers, result.record);
      if (payload.eventId) {
        setEventOperations((current) =>
          current.map((eventRecord) =>
            eventRecord.id === payload.eventId
              ? {
                  ...eventRecord,
                  activeResponsibleName: payload.toName,
                  activeResponsibleAuthUserId: payload.toAuthUserId || "",
                  updatedAt: new Date().toISOString(),
                }
              : eventRecord,
          ),
        );
      }
      refreshEventOperationsLive("event_handover_created");
      return { ok: true, record: result.record, message: "Handover saved." };
    }
    return {
      ok: false,
      message: result.message || result.error?.message || "Handover could not be saved in Supabase.",
      error: result.error,
    };
  }

  async function saveEventLiveUpdate(payload) {
    if (!(await requestWriteAccess()))
      return { ok: false, message: "Location guard is blocking live operational updates." };
    const result = await createEventLiveUpdate({
      ...payload,
      createdByName: payload.createdByName || effectiveUser.operatorName || effectiveUser.name,
    });
    if (result.ok && result.record) {
      upsertEventList(setEventLiveUpdates, result.record);
      refreshEventOperationsLive("event_live_update_created");
      return result;
    }
    return {
      ok: false,
      message: result.message || result.error?.message || "Live update could not be saved in Supabase.",
      error: result.error,
    };
  }

  async function changeEventLiveUpdateStatus(updateId, status, resolutionNote = "") {
    if (!(await requestWriteAccess()))
      return { ok: false, message: "Location guard is blocking live operational updates." };
    const action =
      status === "resolved"
        ? resolveEventLiveUpdate(updateId, resolutionNote)
        : status === "cancelled"
          ? cancelEventLiveUpdate(updateId, resolutionNote)
          : acknowledgeEventLiveUpdate(updateId);
    const result = await action;
    if (result.ok && result.record) {
      upsertEventList(setEventLiveUpdates, result.record);
      refreshEventOperationsLive(`event_live_update_${status}`);
      return result;
    }
    return {
      ok: false,
      message: result.message || result.error?.message || "Live update status could not be saved.",
      error: result.error,
    };
  }

  const activeShiftScope = normalizeShiftScope(
    currentShiftScope,
    effectiveUser,
    currentOperator,
  );
  const userCanChooseRoleMode = canUseEventFloorDashboard(user);
  const activeRoleMode = userCanChooseRoleMode
    ? normalizeRoleMode(currentRoleMode, user)
    : null;
  const activeShift =
    selectedShift ||
    (activeRoleMode?.roleMode === "other_support" && activeShiftScope
      ? "overview"
      : null);
  const selectedShiftAccess = getShiftAccessStatus(activeShift, effectiveUser);
  const eventCodeDate = getOsloDateKey();
  const sharedDeviceEventOperatorName = normalizedPersonName(currentOperator?.name);
  const eventCodeMatchesSharedDeviceOperator =
    !effectiveActor.isSharedDevice ||
    !sharedDeviceEventOperatorName ||
    normalizedPersonName(eventCodeAccess?.operatorName) === sharedDeviceEventOperatorName;
  const eventAccessIsValid =
    eventCodeAccess?.codeDate === eventCodeDate &&
    eventCodeMatchesSharedDeviceOperator &&
    (!eventCodeAccess.expiresAt || new Date(eventCodeAccess.expiresAt) > new Date());
  const eventCodeRequired =
    activeShift === "event" &&
    !isManager(effectiveUser) &&
    !canUseEventFloorDashboard(effectiveUser);
  const eventCodeNeeded = eventCodeRequired && !eventAccessIsValid;
  const sharedDeviceNeedsOperator =
    effectiveActor.isSharedDevice && !normalizeOperator(currentOperator);
  const selectedShiftBlocked =
    activeShift &&
    !["guides", "overview"].includes(activeShift) &&
    !selectedShiftAccess.allowed;
  const selectedScopeBlocked =
    activeShift &&
    !["guides", "overview"].includes(activeShift) &&
    !canWorkInShiftScope(activeShift, activeShiftScope, effectiveUser);
  const canOpenOperationalView =
    (!sharedDeviceNeedsOperator && !selectedShiftBlocked && !selectedScopeBlocked) ||
    activeShift === "guides" ||
    activeShift === "overview";
  const eventActorReadyForAlerts =
    activeShift === "event" &&
    canOpenOperationalView &&
    !eventCodeNeeded &&
    !sharedDeviceNeedsOperator &&
    (!effectiveActor.isSharedDevice || Boolean(sharedDeviceEventOperatorName)) &&
    (isManager(effectiveUser) || canUseEventFloorDashboard(effectiveUser) || eventAccessIsValid);

  function openInventoryWorkspace() {
    if (!canUseInventory(effectiveUser)) return;
    setShowInventory(true);
  }

  const inventoryCounterUser = isInventoryCounter(effectiveUser);

  if (showRoutineEngine) {
    return (
      <Suspense fallback={<FocusedViewLoading label="Loading Routine Engine preview..." />}>
        <RoutineEngineErrorBoundary onBack={() => setShowRoutineEngine(false)}>
          <RoutineEngineWorkspace
            user={user}
            onBack={() => setShowRoutineEngine(false)}
            onLogout={() => {
              setShowRoutineEngine(false);
              logout();
            }}
          />
        </RoutineEngineErrorBoundary>
      </Suspense>
    );
  }

  if (showInventory || inventoryCounterUser) {
    return (
      <>
        <TopBar
          user={user}
          selectedShift="inventory"
          currentRoleMode={activeRoleMode}
          currentShiftScope={activeShiftScope}
          currentOperator={currentOperator}
          onChangeOperator={() => {
            setShowInventory(false);
            setSelectedShift(null);
            setCurrentShiftScope(null);
            saveCurrentOperator(null);
          }}
          onChangeRole={activeRoleMode ? clearRoleMode : null}
          isOnline={isOnline}
          siteAccessStatus={siteAccessStatus}
          onBack={inventoryCounterUser ? null : () => setShowInventory(false)}
          onLogout={() => {
            setShowInventory(false);
            logout();
          }}
          onOpenAccountSecurity={
            user.loginSource === "supabase_auth"
              ? () => setShowAccountSecurity(true)
              : null
          }
        />
        <Suspense fallback={<FocusedViewLoading label="Loading Stock Count..." />}>
          <InventoryWorkspace
            user={effectiveUser}
            requestWriteAccess={requestWriteAccess}
            onClose={inventoryCounterUser ? logout : () => setShowInventory(false)}
          />
        </Suspense>
        {showAccountSecurity && (
          <AccountSecurityDialog
            onClose={() => setShowAccountSecurity(false)}
            onUpdatePassword={updateCurrentUserPassword}
          />
        )}
      </>
    );
  }

  return (
    <>
      <TopBar
        user={user}
        selectedShift={
          showManager
            ? "manager"
            : activeShift
        }
        currentRoleMode={activeRoleMode}
        currentShiftScope={activeShiftScope}
        currentOperator={currentOperator}
        onChangeOperator={() => {
          setSelectedShift(null);
          setShowManager(false);
          setShowEventFloorManager(false);
          setCurrentShiftScope(null);
          setEventTaskAlerts([]);
          setEventTaskActionStatus({});
          localStorage.removeItem(SHIFT_SCOPE_KEY);
          saveCurrentOperator(null);
        }}
        onChangeRole={activeRoleMode ? clearRoleMode : null}
        isOnline={isOnline}
        siteAccessStatus={siteAccessStatus}
        onOpenInventory={canUseInventory(effectiveUser) ? openInventoryWorkspace : null}
        onBack={() => {
          clearShiftScopeAndSelection();
          setShowManager(false);
          setShowEventFloorManager(false);
        }}
        onLogout={logout}
        onOpenAccountSecurity={
          user.loginSource === "supabase_auth"
            ? () => setShowAccountSecurity(true)
            : null
        }
      />
      <Suspense fallback={null}>
        <RoutineEngineErrorBoundary compact onBack={() => setShowRoutineEngine(false)}>
          <RoutineEngineLauncher user={user} onOpen={() => setShowRoutineEngine(true)} />
        </RoutineEngineErrorBoundary>
      </Suspense>
      {isLocalhostRuntime() && new URLSearchParams(window.location.search).get("review") === "1" && (
        <aside className="review-context-banner" role="note">
          <strong>Current stage-gated legacy experience</strong>
          <span>The final role-aware target is reviewed through the labelled release fixtures. No release stage or Routine Engine mode is changed here.</span>
        </aside>
      )}
      {siteSettings.locationCheckEnabled &&
        !hasSiteCoordinates(siteSettings) && (
          <p className="status-message page-status">
            Location guard not configured. Guides and read-only areas are
            available; save Youngs Site access coordinates before using it as a
            hard guard.
          </p>
        )}
      {siteSettings.locationCheckEnabled &&
        hasSiteCoordinates(siteSettings) &&
        ["away", "unknown"].includes(siteAccess.status) &&
        !activeManagerOverride &&
        !managerLocalTestingBypass && (
          <p className="status-message page-status">
            You appear to be away from Youngs. You can view the app, but
            operational changes require being on site.
          </p>
        )}
      {managerLocalTestingBypass && (
        <p className="status-message page-status">
          Local manager testing: location guard is bypassed on localhost only.
        </p>
      )}
      <EventTaskAlertBanner
        alerts={eventActorReadyForAlerts ? eventTaskAlerts : []}
        alertsEnabled={eventTaskAlertSettings.enabled}
        notificationPermission={eventTaskAlertSettings.notificationPermission}
        taskActionStatus={eventTaskActionStatus}
        onEnableAlerts={enableEventTaskAlerts}
        onAcknowledge={(taskId, alertId) =>
          handleEventTaskStatusUpdate(taskId, "acknowledged", "", alertId)
        }
        onDone={(taskId, alertId) =>
          handleEventTaskStatusUpdate(taskId, "done", "", alertId)
        }
        onOpenTasks={() => {
          setShowManager(false);
          setShowEventFloorManager(false);
          setSelectedShift("overview");
        }}
        onDismiss={(alertId) =>
          setEventTaskAlerts((current) => current.filter((alert) => alert.id !== alertId))
        }
      />
      {isLocalhostRuntime() && user && new URLSearchParams(window.location.search).get("debug") === "1" && (
        <p className="muted page-status">
          Event alert debug: operator {currentOperator?.name || "none"} | shift {activeShift || "none"} | event code{" "}
          {eventAccessIsValid ? "valid" : "not valid"} | ready {eventActorReadyForAlerts ? "true" : "false"} | realtime{" "}
          {eventRealtimeStatus.state}
          {eventRealtimeStatus.lastEventAt ? ` at ${formatDateTime(eventRealtimeStatus.lastEventAt)}` : ""}
        </p>
      )}
      {!activeShift &&
        !showManager &&
        !showEventFloorManager &&
        sharedDeviceNeedsOperator && (
          <main className="page">
            <OperatorPanel
              user={user}
              staffUsers={staffUsers}
              currentOperator={currentOperator}
              onSave={saveCurrentOperatorAndRoute}
              onOpenGuides={() => setSelectedShift("guides")}
            />
          </main>
        )}
      {!activeShift &&
        !showManager &&
        showEventFloorManager && (
          <EventFloorDashboard
            user={effectiveUser}
            events={events}
            responsibleAssignments={responsibleAssignments}
            cashSignoffs={cashSignoffs}
            setCashSignoffs={setCashSignoffs}
            assets={assets}
            assetChecks={assetChecks}
            setAssetChecks={setAssetChecks}
            eventTaskChecks={eventTaskChecks}
            setEventTaskChecks={setEventTaskChecks}
            eventOperations={eventOperations}
            eventStaffPresence={eventStaffPresence}
            eventRoleAssignments={eventRoleAssignments}
            eventOperationTasks={eventOperationTasks}
            eventHandovers={eventHandovers}
            eventLiveUpdates={eventLiveUpdates}
            eventRealtimeStatus={eventRealtimeStatus}
            staffUsers={staffUsers}
            requestWriteAccess={requestWriteAccess}
            onCreateEventOperation={saveEventOperation}
            onUpdateEventOperation={saveEventOperationUpdate}
            onAddEventStaffPresence={saveManualEventStaff}
            onAssignEventRole={saveEventRoleAssignment}
            onRemoveEventRole={removeEventRoleAssignment}
            onCreateEventOperationTask={saveEventOperationTask}
            onUpdateEventOperationTaskStatus={handleEventTaskStatusUpdate}
            eventTaskActionStatus={eventTaskActionStatus}
            onCreateEventHandover={saveEventHandover}
            onCreateEventLiveUpdate={saveEventLiveUpdate}
            onChangeEventLiveUpdateStatus={changeEventLiveUpdateStatus}
            onSyncFinancialSignoff={syncFinancialSignoff}
            onRefreshFinancialSignoffs={refreshFinancialSignoffsFromBackend}
            onEnsureShiftSession={ensureShiftSession}
            onSyncTaskLog={syncChecklistLog}
            onSyncHandover={syncChecklistHandover}
            onShowOverview={() => {
              setShowEventFloorManager(false);
              setSelectedShift("overview");
            }}
            onGuides={() => {
              setShowEventFloorManager(false);
              setSelectedShift("guides");
            }}
            onBackToManager={
              canAccessManagerDashboard(user)
                ? () => {
                    setShowEventFloorManager(false);
                    setShowManager(true);
                  }
                : null
            }
            onChangeRole={activeRoleMode ? clearRoleMode : null}
            onOpenGuide={setActiveGuideId}
            onRefreshEventOperations={refreshEventOperationsLive}
          />
        )}
      {!activeShift &&
        !showManager &&
        !showEventFloorManager &&
        !sharedDeviceNeedsOperator &&
        (userCanChooseRoleMode && !activeRoleMode ? (
          <RoleLauncher user={user} onSelectRole={chooseRoleMode} />
        ) : activeRoleMode?.roleMode === "event_floor_manager" ? (
          <EventFloorDashboard
            user={effectiveUser}
            events={events}
            responsibleAssignments={responsibleAssignments}
            cashSignoffs={cashSignoffs}
            setCashSignoffs={setCashSignoffs}
            assets={assets}
            assetChecks={assetChecks}
            setAssetChecks={setAssetChecks}
            eventTaskChecks={eventTaskChecks}
            setEventTaskChecks={setEventTaskChecks}
            eventOperations={eventOperations}
            eventStaffPresence={eventStaffPresence}
            eventRoleAssignments={eventRoleAssignments}
            eventOperationTasks={eventOperationTasks}
            eventHandovers={eventHandovers}
            eventLiveUpdates={eventLiveUpdates}
            eventRealtimeStatus={eventRealtimeStatus}
            staffUsers={staffUsers}
            requestWriteAccess={requestWriteAccess}
            onCreateEventOperation={saveEventOperation}
            onUpdateEventOperation={saveEventOperationUpdate}
            onAddEventStaffPresence={saveManualEventStaff}
            onAssignEventRole={saveEventRoleAssignment}
            onRemoveEventRole={removeEventRoleAssignment}
            onCreateEventOperationTask={saveEventOperationTask}
            onUpdateEventOperationTaskStatus={handleEventTaskStatusUpdate}
            eventTaskActionStatus={eventTaskActionStatus}
            onCreateEventHandover={saveEventHandover}
            onCreateEventLiveUpdate={saveEventLiveUpdate}
            onChangeEventLiveUpdateStatus={changeEventLiveUpdateStatus}
            onSyncFinancialSignoff={syncFinancialSignoff}
            onRefreshFinancialSignoffs={refreshFinancialSignoffsFromBackend}
            onEnsureShiftSession={ensureShiftSession}
            onSyncTaskLog={syncChecklistLog}
            onSyncHandover={syncChecklistHandover}
            onShowOverview={() => setSelectedShift("overview")}
            onGuides={() => setSelectedShift("guides")}
            onChangeRole={clearRoleMode}
            onOpenGuide={setActiveGuideId}
            onRefreshEventOperations={refreshEventOperationsLive}
          />
        ) : (
          <ShiftPicker
            user={effectiveUser}
            onSelect={(shiftId) => {
              if (shiftId === "overview" || shiftId === "guides") {
                setSelectedShift(shiftId);
                return { ok: true };
              }
              return setShiftScopeAndOpen(shiftId, effectiveUser, currentOperator, {
                openTarget: shiftId === "event",
              });
            }}
            onCheckShiftAccess={(shiftId) =>
              checkShiftSiteAccess(shiftId, effectiveUser)
            }
            onManager={() => setShowManager(true)}
            routines={routines}
            logs={logs}
            handoverNotes={handoverNotes}
            responsibleAssignments={responsibleAssignments}
          />
        ))}
      {activeShift &&
        !showManager &&
        (selectedShiftBlocked || selectedScopeBlocked) && (
          <main className="page">
            <section className="empty-state">
              <h2>Shift not available</h2>
              <p className="muted">
                {selectedScopeBlocked
                  ? shiftScopeBlockMessage(activeShift, activeShiftScope)
                  : activeShift === "opening"
                    ? "Opening shift is closed for today after 11:00 Oslo time."
                    : "Closing shift is not available before 11:00 Oslo time."}
              </p>
              {selectedShiftBlocked && (
                <p className="muted">
                  Oslo time: {selectedShiftAccess.osloTime.label}
                </p>
              )}
              {activeShiftScope?.label && (
                <p className="muted">Current scope: {activeShiftScope.label}</p>
              )}
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  setSelectedShift(null);
                  setCurrentShiftScope(null);
                  localStorage.removeItem(SHIFT_SCOPE_KEY);
                }}
              >
                Choose another shift
              </button>
            </section>
          </main>
        )}
      {activeShift &&
        !showManager &&
        !selectedShiftBlocked &&
        !selectedScopeBlocked &&
        eventCodeNeeded && (
          <EventCodeGate
            user={effectiveUser}
            currentOperator={currentOperator}
            onUnlock={(accessRecord) => {
              setEventCodeAccess(accessRecord);
              saveStorage(EVENT_CODE_ACCESS_KEY, accessRecord);
            }}
            onCancel={clearShiftScopeAndSelection}
            onGuides={() => setSelectedShift("guides")}
          />
        )}
      {activeShift &&
        !showManager &&
        !selectedShiftBlocked &&
        !selectedScopeBlocked &&
        !eventCodeNeeded &&
        !canOpenOperationalView && (
          <main className="page">
            <OperatorPanel
              user={user}
              staffUsers={staffUsers}
              currentOperator={currentOperator}
              onSave={saveCurrentOperatorAndRoute}
              onOpenGuides={() => setSelectedShift("guides")}
            />
          </main>
        )}
      {activeShift &&
        !showManager &&
        !selectedShiftBlocked &&
        !selectedScopeBlocked &&
        !eventCodeNeeded &&
        canOpenOperationalView &&
        (activeShift === "overview" ? (
          <StaffDashboard
            user={effectiveUser}
            routines={routines}
            logs={logs}
            handoverNotes={handoverNotes}
            finishRecords={finishRecords}
            alerts={alerts}
            responsibleAssignments={responsibleAssignments}
            events={events}
            eventOperations={eventOperations}
            eventStaffPresence={eventStaffPresence}
            eventRoleAssignments={eventRoleAssignments}
            eventTasks={eventOperationTasks}
            eventLiveUpdates={eventLiveUpdates}
            cashSignoffs={cashSignoffs}
            assetChecks={assetChecks}
            alertBackendStatus={alertBackendStatus}
            currentShiftScope={activeShiftScope}
            eventAccessIsValid={eventAccessIsValid}
            canShowEventCodeStatus={canGenerateEventCode(effectiveUser)}
            siteAccessStatus={siteAccessStatus}
            siteAccessLabel={siteStatuses[siteAccessStatus] || "Location unknown"}
            osloTimeLabel={getOsloTimeParts().label}
            onOpenMyShift={openMyShiftFromScope}
            onOpenGuides={() => setSelectedShift("guides")}
            onChangeShift={clearShiftScopeAndSelection}
            onUpdateEventTaskStatus={handleEventTaskStatusUpdate}
            eventTaskAlertState={eventTaskAlertState}
            taskActionStatus={eventTaskActionStatus}
            eventTaskAlertsEnabled={eventTaskAlertSettings.enabled}
            eventTaskNotificationPermission={eventTaskAlertSettings.notificationPermission}
            eventActorReadyForAlerts={eventActorReadyForAlerts}
            onEnableEventTaskAlerts={enableEventTaskAlerts}
            onRefreshEventOperations={refreshEventOperationsLive}
            onOpenEventCockpit={() => {
              if (isManager(effectiveUser) || canUseEventFloorDashboard(effectiveUser)) {
                setSelectedShift(null);
                setShowEventFloorManager(true);
              } else {
                setSelectedShift("event");
              }
            }}
            refreshAlerts={loadSupabaseAlerts}
            onAlert={() => setShowGlobalAlert(true)}
          />
        ) : activeShift === "event" ? (
          <EventMode
            user={effectiveUser}
            currentOperator={currentOperator}
            eventOperations={eventOperations}
            eventRoleAssignments={eventRoleAssignments}
            eventTasks={eventOperationTasks}
            eventStaffPresence={eventStaffPresence}
            eventHandovers={eventHandovers}
            eventLiveUpdates={eventLiveUpdates}
            eventRealtimeStatus={eventRealtimeStatus}
            onUpdateTaskStatus={handleEventTaskStatusUpdate}
            eventTaskAlertState={eventTaskAlertState}
            taskActionStatus={eventTaskActionStatus}
            alertsEnabled={eventTaskAlertSettings.enabled}
            notificationPermission={eventTaskAlertSettings.notificationPermission}
            onEnableAlerts={enableEventTaskAlerts}
            onRefresh={refreshEventOperationsLive}
            onCreateLiveUpdate={saveEventLiveUpdate}
            onChangeLiveUpdateStatus={changeEventLiveUpdateStatus}
            onChangeOperator={() => {
              setSelectedShift(null);
              setCurrentShiftScope(null);
              setEventTaskAlerts([]);
              setEventTaskActionStatus({});
              localStorage.removeItem(SHIFT_SCOPE_KEY);
              saveCurrentOperator(null);
            }}
            onOpenGuides={() => setSelectedShift("guides")}
            onOpenGuide={setActiveGuideId}
          />
        ) : (
          <Checklist
            user={effectiveUser}
            shiftType={activeShift}
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
            currentShiftScope={activeShiftScope}
            onShowOverview={() => setSelectedShift("overview")}
            onOpenGuides={() => setSelectedShift("guides")}
            onChangeShift={() => {
              if (activeRoleMode?.roleMode === "other_support") clearRoleMode();
              else clearShiftScopeAndSelection();
            }}
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
          onOpenEventFloorDashboard={() => {
            setSelectedShift(null);
            setShowManager(false);
            setShowEventFloorManager(true);
          }}
          onOpenInventory={canUseInventory(effectiveUser) ? openInventoryWorkspace : null}
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
          user={effectiveUser}
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
      {activeGuideId && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="pilot-modal guide-modal">
            {findGuideById(activeGuideId) ? (
              <GuideCard guide={findGuideById(activeGuideId)} compact />
            ) : (
              <div className="empty-state">
                <h2>Guide not found</h2>
                <p className="muted">This guide has not been added yet.</p>
              </div>
            )}
            <div className="backup-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => setActiveGuideId("")}
              >
                Close
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setActiveGuideId("");
                  setSelectedShift("guides");
                  setShowManager(false);
                  setShowEventFloorManager(false);
                }}
              >
                Open Knowledge Base
              </button>
            </div>
          </section>
        </div>
      )}
      {showAccountSecurity && (
        <AccountSecurityDialog
          onClose={() => setShowAccountSecurity(false)}
          onUpdatePassword={updateCurrentUserPassword}
        />
      )}
      <UpdateBanner waitingWorker={waitingWorker} />
    </>
  );
}
