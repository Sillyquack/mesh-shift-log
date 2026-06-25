import { getCurrentSession, supabaseAuthClient } from "./supabaseAuthClient.js";
import {
  normalizeHandoverNote,
  normalizeShiftRecord,
  normalizeTaskCompletion,
} from "./shiftDataClient.js";
import { normalizeFinancialSignoff } from "./financialDataClient.js";

function authRequiredResult() {
  return {
    ok: false,
    mode: "auth_required",
    message: "Email login is required for backend history.",
  };
}

async function authenticatedContext() {
  if (!supabaseAuthClient) return authRequiredResult();
  const session = await getCurrentSession().catch(() => null);
  if (!session?.user?.id) return authRequiredResult();
  return {
    ok: true,
    mode: "authenticated",
    session,
    authUserId: session.user.id,
  };
}

function startOfDate(date) {
  return new Date(`${date}T00:00:00`).toISOString();
}

function endOfDate(date) {
  return new Date(`${date}T23:59:59.999`).toISOString();
}

function betweenDateQuery(query, column, startDate, endDate) {
  return query.gte(column, startDate).lte(column, endDate);
}

export function normalizeBackendShiftSession(row) {
  const normalized = normalizeShiftRecord(row);
  if (!normalized) return null;
  return {
    ...normalized,
    shiftType: normalized.shiftType || "unknown_shift",
    shiftLabel:
      normalized.shiftLabel || normalized.shiftType || "Unknown shift",
    status: normalized.status || "unknown",
    completedBy: normalized.completedBy || "Unknown user",
    startedAt: normalized.startedAt || row?.created_at || "",
    updatedAt: normalized.updatedAt || row?.updated_at || row?.created_at || "",
  };
}

export function normalizeBackendTaskCompletion(row) {
  const normalized = normalizeTaskCompletion(row);
  if (!normalized) return null;
  return {
    ...normalized,
    shiftType: normalized.shiftType || "unknown_shift",
    taskId:
      normalized.taskId ||
      normalized.localId ||
      normalized.backendId ||
      "unknown_task",
    taskTitle: normalized.taskTitle || "Unknown task",
    status: normalized.status || "unknown",
    completedBy: normalized.completedBy || "Unknown user",
    completedAt: normalized.completedAt || normalized.updatedAt || "",
    updatedAt: normalized.updatedAt || normalized.completedAt || "",
  };
}

export function normalizeBackendHandoverNote(row) {
  const normalized = normalizeHandoverNote(row);
  if (!normalized) return null;
  return {
    ...normalized,
    shiftType: normalized.shiftType || "unknown_shift",
    completedBy: normalized.completedBy || "Unknown user",
    nextShift: normalized.nextShift || "",
    lowStock: normalized.lowStock || "",
    maintenance: normalized.maintenance || "",
    memberEvent: normalized.memberEvent || "",
    updatedAt: normalized.updatedAt || row?.updated_at || row?.created_at || "",
  };
}

export function normalizeBackendAlertForReport(row) {
  if (!row) return null;
  return {
    backendId: row.id || "",
    localId: row.local_id || "",
    date: row.alert_date || (row.created_at || "").slice(0, 10),
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || row.created_at || "",
    createdBy: row.created_by || "Unknown user",
    category: row.category || "No category",
    severity: row.severity || "Normal",
    area: row.area || "No area",
    message: row.message || "No message",
    needsImmediateHelp: Boolean(row.needs_immediate_help),
    status: row.status || "open",
    managerNote: row.manager_note || "",
    acknowledgedBy: row.acknowledged_by || "",
    acknowledgedAt: row.acknowledged_at || "",
    resolvedBy: row.resolved_by || "",
    resolvedAt: row.resolved_at || "",
    emailNotificationStatus: row.email_notification_status || "not_required",
    emailNotificationAttemptedAt: row.email_notification_attempted_at || "",
    emailNotificationError: row.email_notification_error || "",
  };
}

function uniqueBy(
  items,
  keyFn,
  freshnessFn = (item) => item.updatedAt || item.createdAt || "",
) {
  const merged = new Map();
  let duplicatesIgnored = 0;
  items.filter(Boolean).forEach((item) => {
    const key = keyFn(item);
    const existing = merged.get(key);
    if (existing) duplicatesIgnored += 1;
    if (
      !existing ||
      String(freshnessFn(item)) >= String(freshnessFn(existing))
    ) {
      merged.set(key, item);
    }
  });
  return { records: [...merged.values()], duplicatesIgnored };
}

function statusKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function financialTypeKey(record) {
  return statusKey(
    record.signoffType || record.signoff_type || "daily_finance",
  );
}

function isUrgentAlert(alert) {
  return (
    String(alert.severity || "")
      .trim()
      .toLowerCase() === "urgent" || alert.needsImmediateHelp
  );
}

function isResolvedAlert(alert) {
  return statusKey(alert.status) === "resolved";
}

function durationMinutes(startedAt, finishedAt) {
  if (!startedAt || !finishedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
    return null;
  return Math.round((end - start) / 60000);
}

export function summarizeBackendHistory(history) {
  const shifts = history.shiftSessions || [];
  const tasks = history.taskCompletions || [];
  const handovers = history.handoverNotes || [];
  const alerts = history.alerts || [];
  const financial = history.financialSignoffs || [];
  const staff = new Set(
    [
      ...shifts.map((session) => session.completedBy),
      ...tasks.map((task) => task.completedBy),
      ...handovers.map((note) => note.completedBy),
    ].filter(Boolean),
  );
  return {
    shiftSessions: shifts.length,
    activeSessions: shifts.filter(
      (session) => statusKey(session.status) === "active",
    ).length,
    finishedSessions: shifts.filter(
      (session) => statusKey(session.status) === "finished",
    ).length,
    uniqueStaff: staff.size,
    taskRows: history.rawTaskRows ?? tasks.length,
    uniqueTaskRecords: tasks.length,
    doneTasks: tasks.filter((task) => statusKey(task.status) === "done").length,
    notRelevantTasks: tasks.filter(
      (task) => statusKey(task.status) === "not_relevant",
    ).length,
    openTasks: tasks.filter((task) =>
      ["open", "reset"].includes(statusKey(task.status)),
    ).length,
    handoverNotes: handovers.length,
    totalAlerts: alerts.length,
    openAlerts: alerts.filter((alert) => statusKey(alert.status) === "open")
      .length,
    unresolvedAlerts: alerts.filter((alert) => !isResolvedAlert(alert)).length,
    resolvedAlerts: alerts.filter(isResolvedAlert).length,
    urgentAlerts: alerts.filter(isUrgentAlert).length,
    financialSignoffs: financial.length,
    financialCashSignoffs: financial.filter((record) =>
      ["cash", "daily_finance"].includes(financialTypeKey(record)),
    ).length,
    financialInvoiceSignoffs: financial.filter((record) =>
      ["invoice", "daily_finance"].includes(financialTypeKey(record)),
    ).length,
    financialSettlementTerminalSignoffs: financial.filter((record) =>
      ["settlement", "terminal", "daily_finance"].includes(
        financialTypeKey(record),
      ),
    ).length,
    financialCompleted: financial.filter(
      (record) => statusKey(record.status) === "completed",
    ).length,
    financialReviewed: financial.filter(
      (record) => statusKey(record.status) === "reviewed",
    ).length,
    financialIssues: financial.filter(
      (record) =>
        statusKey(record.status) === "issue" ||
        Number(record.variance || 0) !== 0,
    ).length,
    financialVarianceTotal: financial.reduce(
      (sum, record) => sum + Number(record.variance || 0),
      0,
    ),
  };
}

async function fetchAlertsForLocalDate(date) {
  const [byAlertDate, byCreatedAt] = await Promise.all([
    supabaseAuthClient
      .from("alerts")
      .select("*")
      .eq("alert_date", date)
      .order("created_at", { ascending: false }),
    supabaseAuthClient
      .from("alerts")
      .select("*")
      .gte("created_at", startOfDate(date))
      .lte("created_at", endOfDate(date))
      .order("created_at", { ascending: false }),
  ]);
  const error = byAlertDate.error || byCreatedAt.error;
  if (error) return { data: [], error };
  const merged = uniqueBy(
    [...(byAlertDate.data || []), ...(byCreatedAt.data || [])],
    (row) => row.id || row.local_id || `${row.created_at}-${row.message}`,
  );
  return { data: merged.records, error: null };
}

export async function fetchManagerDailyHistory(date) {
  const context = await authenticatedContext();
  if (!context.ok) return { ...context, history: null };
  try {
    const [
      shiftResult,
      taskResult,
      handoverResult,
      alertResult,
      financialResult,
    ] = await Promise.all([
      supabaseAuthClient
        .from("shift_sessions")
        .select("*")
        .eq("shift_date", date)
        .order("updated_at", { ascending: false }),
      supabaseAuthClient
        .from("task_completions")
        .select("*")
        .eq("shift_date", date)
        .order("updated_at", { ascending: false }),
      supabaseAuthClient
        .from("handover_notes")
        .select("*")
        .eq("note_date", date)
        .order("updated_at", { ascending: false }),
      fetchAlertsForLocalDate(date),
      supabaseAuthClient
        .from("financial_signoffs")
        .select("*")
        .eq("signoff_date", date)
        .order("updated_at", { ascending: false }),
    ]);
    const error =
      shiftResult.error ||
      taskResult.error ||
      handoverResult.error ||
      alertResult.error ||
      financialResult.error;
    if (error)
      return {
        ok: false,
        mode: "sync_error",
        message: error.message,
        error,
        history: null,
      };
    const taskMerge = uniqueBy(
      (taskResult.data || []).map(normalizeBackendTaskCompletion),
      (task) =>
        task.localId ||
        `${task.date}-${task.shiftType}-${task.taskId}-${task.completedByAuthUserId || task.completedBy}`,
    );
    const handoverMerge = uniqueBy(
      (handoverResult.data || []).map(normalizeBackendHandoverNote),
      (note) =>
        note.localId ||
        `${note.date}-${note.shiftType}-${note.createdByAuthUserId || note.completedBy}`,
    );
    const financialMerge = uniqueBy(
      (financialResult.data || []).map(normalizeFinancialSignoff),
      (record) =>
        record.localId ||
        record.backendId ||
        `${record.date}-${record.shiftType}-${record.signoffType}-${record.signedOffBy}`,
    );
    const history = {
      date,
      shiftSessions: (shiftResult.data || [])
        .map(normalizeBackendShiftSession)
        .filter(Boolean),
      rawTaskRows: (taskResult.data || []).length,
      taskCompletions: taskMerge.records,
      handoverNotes: handoverMerge.records,
      alerts: (alertResult.data || [])
        .map(normalizeBackendAlertForReport)
        .filter(Boolean),
      financialSignoffs: financialMerge.records,
      rawFinancialRows: (financialResult.data || []).length,
      duplicateTaskRowsIgnored: taskMerge.duplicatesIgnored,
      duplicatesIgnored:
        taskMerge.duplicatesIgnored +
        handoverMerge.duplicatesIgnored +
        financialMerge.duplicatesIgnored,
      fetchedAt: new Date().toISOString(),
    };
    return {
      ok: true,
      mode: "authenticated",
      history,
      summary: summarizeBackendHistory(history),
    };
  } catch (error) {
    return {
      ok: false,
      mode: "sync_error",
      message: error.message || "Backend history fetch failed.",
      error,
      history: null,
    };
  }
}

export async function fetchManagerHistoryRange(startDate, endDate) {
  const context = await authenticatedContext();
  if (!context.ok) return { ...context, days: [] };
  try {
    const [
      shiftResult,
      taskResult,
      handoverResult,
      alertResult,
      financialResult,
    ] = await Promise.all([
      betweenDateQuery(
        supabaseAuthClient.from("shift_sessions").select("*"),
        "shift_date",
        startDate,
        endDate,
      ),
      betweenDateQuery(
        supabaseAuthClient.from("task_completions").select("*"),
        "shift_date",
        startDate,
        endDate,
      ),
      betweenDateQuery(
        supabaseAuthClient.from("handover_notes").select("*"),
        "note_date",
        startDate,
        endDate,
      ),
      supabaseAuthClient
        .from("alerts")
        .select("*")
        .gte("created_at", startOfDate(startDate))
        .lte("created_at", endOfDate(endDate)),
      betweenDateQuery(
        supabaseAuthClient.from("financial_signoffs").select("*"),
        "signoff_date",
        startDate,
        endDate,
      ),
    ]);
    const error =
      shiftResult.error ||
      taskResult.error ||
      handoverResult.error ||
      alertResult.error ||
      financialResult.error;
    if (error)
      return {
        ok: false,
        mode: "sync_error",
        message: error.message,
        error,
        days: [],
      };
    const dates = [];
    for (
      let cursor = new Date(`${startDate}T00:00:00`);
      cursor <= new Date(`${endDate}T00:00:00`);
      cursor.setDate(cursor.getDate() + 1)
    ) {
      dates.push(cursor.toISOString().slice(0, 10));
    }
    const shifts = (shiftResult.data || [])
      .map(normalizeBackendShiftSession)
      .filter(Boolean);
    const tasks = (taskResult.data || [])
      .map(normalizeBackendTaskCompletion)
      .filter(Boolean);
    const handovers = (handoverResult.data || [])
      .map(normalizeBackendHandoverNote)
      .filter(Boolean);
    const alerts = (alertResult.data || [])
      .map(normalizeBackendAlertForReport)
      .filter(Boolean);
    const financial = (financialResult.data || [])
      .map(normalizeFinancialSignoff)
      .filter(Boolean);
    const days = dates
      .map((date) => {
        const history = {
          date,
          shiftSessions: shifts.filter((item) => item.date === date),
          rawTaskRows: tasks.filter((item) => item.date === date).length,
          taskCompletions: tasks.filter((item) => item.date === date),
          handoverNotes: handovers.filter((item) => item.date === date),
          alerts: alerts.filter((item) => item.date === date),
          financialSignoffs: financial.filter((item) => item.date === date),
          duplicatesIgnored: 0,
        };
        return { date, ...summarizeBackendHistory(history) };
      })
      .reverse();
    return {
      ok: true,
      mode: "authenticated",
      days,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ok: false,
      mode: "sync_error",
      message: error.message || "Backend history range fetch failed.",
      error,
      days: [],
    };
  }
}

function formatDateTime(value) {
  if (!value) return "Not set";
  return new Date(value).toLocaleString();
}

function formatDuration(minutes) {
  if (minutes == null) return "Not available";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return `${hours}h ${rest}m`;
}

function shiftDisplayName(shift) {
  return shift || "Unknown shift";
}

export function buildDailyReportFromBackend(
  history,
  { generatedBy = "Manager" } = {},
) {
  if (!history) return "";
  const summary = summarizeBackendHistory(history);
  const byShift = history.taskCompletions.reduce((groups, task) => {
    const key = shiftDisplayName(task.shiftType);
    groups[key] ||= [];
    groups[key].push(task);
    return groups;
  }, {});
  const alertsSorted = [...(history.alerts || [])].sort((a, b) => {
    const aPriority = isUrgentAlert(a) || !isResolvedAlert(a) ? 1 : 0;
    const bPriority = isUrgentAlert(b) || !isResolvedAlert(b) ? 1 : 0;
    return (
      bPriority - aPriority ||
      new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );
  });
  const lines = [
    "Mesh Shift Log - Daily Operations Report",
    `Date: ${history.date}`,
    `Generated: ${new Date().toLocaleString()}`,
    `Generated by: ${generatedBy}`,
    "Source: Supabase backend + local cache where relevant",
    "",
    "1. Executive summary",
    `- ${summary.shiftSessions} shift sessions`,
    `- ${summary.finishedSessions} finished shifts`,
    `- ${summary.uniqueStaff} unique staff/users`,
    `- ${summary.doneTasks} done checklist items`,
    `- ${summary.notRelevantTasks} not relevant checklist items`,
    `- ${summary.handoverNotes} handover notes`,
    `- ${summary.totalAlerts} alerts`,
    `- ${summary.urgentAlerts} urgent alerts`,
    `- ${summary.unresolvedAlerts} unresolved/open alerts`,
    `- ${summary.financialSignoffs} financial signoffs`,
    `- ${summary.financialReviewed} reviewed financial signoffs`,
    `- ${summary.financialIssues} financial signoff issues`,
    "",
    "2. Shift sessions",
  ];
  if (!history.shiftSessions.length) lines.push("- None");
  history.shiftSessions.forEach((session) => {
    const minutes = durationMinutes(session.startedAt, session.finishedAt);
    lines.push(
      `- ${session.shiftLabel || session.shiftType || "Unknown shift"} (${session.shiftType || "unknown"})`,
    );
    lines.push(`  Person: ${session.completedBy || "Unknown user"}`);
    lines.push(`  Status: ${session.status || "Unknown status"}`);
    lines.push(`  Started: ${formatDateTime(session.startedAt)}`);
    lines.push(`  Finished: ${formatDateTime(session.finishedAt)}`);
    lines.push(`  Duration: ${formatDuration(minutes)}`);
    if (statusKey(session.status) === "active")
      lines.push("  Note: session is still active/open.");
  });
  lines.push("", "3. Checklist progress by shift");
  lines.push(`- Raw backend task rows: ${summary.taskRows}`);
  lines.push(`- Unique task records: ${summary.uniqueTaskRecords}`);
  Object.entries(byShift).forEach(([shift, tasks]) => {
    const done = tasks.filter(
      (task) => statusKey(task.status) === "done",
    ).length;
    const notRelevant = tasks.filter(
      (task) => statusKey(task.status) === "not_relevant",
    ).length;
    const open = tasks.filter((task) =>
      ["open", "reset"].includes(statusKey(task.status)),
    ).length;
    const touched = tasks.length;
    const handled = done + notRelevant;
    const percentage = touched ? Math.round((handled / touched) * 100) : 0;
    lines.push(`- ${shift}`);
    lines.push(`  Done: ${done}`);
    lines.push(`  Not relevant: ${notRelevant}`);
    lines.push(`  Open/reset rows: ${open}`);
    lines.push(`  Unique task rows touched: ${touched}`);
    lines.push(
      `  Recorded handled percentage: ${percentage}% of recorded task rows`,
    );
    const openRows = tasks
      .filter((task) => ["open", "reset"].includes(statusKey(task.status)))
      .slice(0, 5);
    if (openRows.length) {
      lines.push("  Open/reset rows:");
      openRows.forEach((task) =>
        lines.push(
          `  - ${task.taskTitle || task.taskId} (${task.completedBy || "Unknown user"})`,
        ),
      );
    }
  });
  if (!Object.keys(byShift).length)
    lines.push("- No backend checklist rows found for this date.");
  lines.push("", "4. Handover notes");
  if (!history.handoverNotes.length) lines.push("- None");
  history.handoverNotes.forEach((note) => {
    lines.push(
      `- ${note.shiftType || "Unknown shift"} | ${note.completedBy || "Unknown user"} | ${formatDateTime(note.updatedAt)}`,
    );
    const noteLines = [
      note.nextShift && `Next shift: ${note.nextShift}`,
      note.lowStock && `Low stock: ${note.lowStock}`,
      note.maintenance && `Maintenance: ${note.maintenance}`,
      note.memberEvent && `Member/event: ${note.memberEvent}`,
    ].filter(Boolean);
    lines.push(
      `  ${noteLines.length ? noteLines.join(" | ") : "No note text"}`,
    );
  });
  lines.push("", "5. Alerts");
  lines.push(`- Total alerts: ${summary.totalAlerts}`);
  lines.push(`- Urgent alerts: ${summary.urgentAlerts}`);
  lines.push(`- Open/unresolved alerts: ${summary.unresolvedAlerts}`);
  lines.push(`- Resolved alerts: ${summary.resolvedAlerts}`);
  alertsSorted.forEach((alert) => {
    lines.push(
      `- ${alert.severity || "Normal"} | ${alert.area || "No area"} / ${alert.category || "No category"}`,
    );
    lines.push(`  Message: ${alert.message || "No message"}`);
    lines.push(`  Status: ${alert.status || "Unknown status"}`);
    lines.push(
      `  Created by: ${alert.createdBy} at ${formatDateTime(alert.createdAt)}`,
    );
    if (alert.acknowledgedBy)
      lines.push(
        `  Acknowledged by: ${alert.acknowledgedBy} at ${formatDateTime(alert.acknowledgedAt)}`,
      );
    if (alert.resolvedBy)
      lines.push(
        `  Resolved by: ${alert.resolvedBy} at ${formatDateTime(alert.resolvedAt)}`,
      );
  });
  if (!alertsSorted.length) lines.push("- None");
  lines.push("", "6. Financial signoffs");
  lines.push(`- Total financial signoffs: ${summary.financialSignoffs}`);
  lines.push(`- Cash signoffs: ${summary.financialCashSignoffs}`);
  lines.push(`- Invoice signoffs: ${summary.financialInvoiceSignoffs}`);
  lines.push(
    `- Settlement/terminal signoffs: ${summary.financialSettlementTerminalSignoffs}`,
  );
  lines.push(`- Completed signoffs: ${summary.financialCompleted}`);
  lines.push(`- Reviewed signoffs: ${summary.financialReviewed}`);
  lines.push(`- Signoffs with issues/variance: ${summary.financialIssues}`);
  lines.push(
    `- Total recorded variance: ${summary.financialVarianceTotal} NOK`,
  );
  if (!history.financialSignoffs?.length) lines.push("- None");
  (history.financialSignoffs || []).forEach((record) => {
    lines.push(
      `- ${record.signoffType || "daily_finance"} | ${record.shiftType || "Unknown shift"} | ${record.status || "Unknown status"}`,
    );
    lines.push(
      `  Signed by: ${record.signedOffBy || "Unknown user"} at ${formatDateTime(record.signedOffAt)}`,
    );
    if (record.reviewedBy)
      lines.push(
        `  Reviewed by: ${record.reviewedBy} at ${formatDateTime(record.reviewedAt)}`,
      );
    const moneyParts = [
      record.amountExpected !== "" && record.amountExpected != null
        ? `expected ${record.amountExpected}`
        : "",
      record.amountActual !== "" && record.amountActual != null
        ? `actual ${record.amountActual}`
        : "",
      record.variance !== "" && record.variance != null
        ? `variance ${record.variance}`
        : "",
    ].filter(Boolean);
    if (moneyParts.length)
      lines.push(
        `  Amounts: ${moneyParts.join(" | ")} ${record.currency || "NOK"}`,
      );
    if (record.terminalId || record.terminalLabel)
      lines.push(`  Terminal: ${record.terminalLabel || record.terminalId}`);
    if (record.invoiceReference)
      lines.push(`  Invoice reference: ${record.invoiceReference}`);
    lines.push(
      `  Customer/table created today: ${record.tableCreatedLabel || "Not filled"}`,
    );
    lines.push(
      `  All sales punched correctly: ${record.salesPunchedLabel || "Not filled"}`,
    );
    lines.push(
      `  Invoice/receipt/report sent: ${record.invoiceSentLabel || "Not filled"}`,
    );
    lines.push(
      `  Cash/register settlement performed: ${record.settlementPerformedLabel || "Not filled"}`,
    );

    if (record.settlementPerformedBy) {
      lines.push(`  Settlement performed by: ${record.settlementPerformedBy}`);
    }

    if (record.formSignedOffBy) {
      lines.push(`  Sign-off by: ${record.formSignedOffBy}`);
    }

    if (record.comments) {
      lines.push(`  Comments: ${record.comments}`);
    }

    if (record.issueNotes && record.issueNotes !== record.comments) {
      lines.push(`  Issue notes: ${record.issueNotes}`);
    }
  });
  lines.push("", "7. Data notes");
  lines.push("- Report uses Supabase backend data where available.");
  lines.push(
    "- Financial signoffs are backend-migrated in Phase 5A when using Email login.",
  );
  lines.push(
    "- Some modules are not yet backend-migrated: full event floor model, assets, routine editor changes.",
  );
  lines.push(
    "- Local-only staff-code activity may be missing unless synced/exported.",
  );
  lines.push(
    "- Checklist percentages are based on recorded backend task rows, not the full expected routine checklist.",
  );
  return lines.join("\n").trim();
}
