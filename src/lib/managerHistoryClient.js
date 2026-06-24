import { getCurrentSession, supabaseAuthClient } from './supabaseAuthClient.js';
import {
  normalizeHandoverNote,
  normalizeShiftRecord,
  normalizeTaskCompletion,
} from './shiftDataClient.js';

function authRequiredResult() {
  return {
    ok: false,
    mode: 'auth_required',
    message: 'Email login is required for backend history.',
  };
}

async function authenticatedContext() {
  if (!supabaseAuthClient) return authRequiredResult();
  const session = await getCurrentSession().catch(() => null);
  if (!session?.user?.id) return authRequiredResult();
  return { ok: true, mode: 'authenticated', session, authUserId: session.user.id };
}

function startOfDate(date) {
  return `${date}T00:00:00`;
}

function endOfDate(date) {
  return `${date}T23:59:59.999`;
}

function betweenDateQuery(query, column, startDate, endDate) {
  return query.gte(column, startDate).lte(column, endDate);
}

export function normalizeBackendShiftSession(row) {
  return normalizeShiftRecord(row);
}

export function normalizeBackendTaskCompletion(row) {
  return normalizeTaskCompletion(row);
}

export function normalizeBackendHandoverNote(row) {
  return normalizeHandoverNote(row);
}

export function normalizeBackendAlertForReport(row) {
  if (!row) return null;
  return {
    backendId: row.id || '',
    localId: row.local_id || '',
    date: row.alert_date || (row.created_at || '').slice(0, 10),
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || row.created_at || '',
    createdBy: row.created_by || '',
    category: row.category || '',
    severity: row.severity || '',
    area: row.area || '',
    message: row.message || '',
    needsImmediateHelp: Boolean(row.needs_immediate_help),
    status: row.status || 'open',
    managerNote: row.manager_note || '',
    acknowledgedBy: row.acknowledged_by || '',
    acknowledgedAt: row.acknowledged_at || '',
    resolvedBy: row.resolved_by || '',
    resolvedAt: row.resolved_at || '',
    emailNotificationStatus: row.email_notification_status || 'not_required',
    emailNotificationAttemptedAt: row.email_notification_attempted_at || '',
    emailNotificationError: row.email_notification_error || '',
  };
}

function uniqueBy(items, keyFn, freshnessFn = (item) => item.updatedAt || item.createdAt || '') {
  const merged = new Map();
  let duplicatesIgnored = 0;
  items.filter(Boolean).forEach((item) => {
    const key = keyFn(item);
    const existing = merged.get(key);
    if (existing) duplicatesIgnored += 1;
    if (!existing || String(freshnessFn(item)) >= String(freshnessFn(existing))) {
      merged.set(key, item);
    }
  });
  return { records: [...merged.values()], duplicatesIgnored };
}

export function summarizeBackendHistory(history) {
  const shifts = history.shiftSessions || [];
  const tasks = history.taskCompletions || [];
  const handovers = history.handoverNotes || [];
  const alerts = history.alerts || [];
  const staff = new Set([
    ...shifts.map((session) => session.completedBy),
    ...tasks.map((task) => task.completedBy),
    ...handovers.map((note) => note.completedBy),
  ].filter(Boolean));
  return {
    shiftSessions: shifts.length,
    activeSessions: shifts.filter((session) => session.status === 'active').length,
    finishedSessions: shifts.filter((session) => session.status === 'finished').length,
    uniqueStaff: staff.size,
    taskRows: tasks.length,
    doneTasks: tasks.filter((task) => task.status === 'done').length,
    notRelevantTasks: tasks.filter((task) => task.status === 'not_relevant').length,
    openTasks: tasks.filter((task) => task.status === 'open').length,
    handoverNotes: handovers.length,
    openAlerts: alerts.filter((alert) => alert.status === 'open').length,
    resolvedAlerts: alerts.filter((alert) => alert.status === 'resolved').length,
    urgentAlerts: alerts.filter((alert) => alert.severity === 'Urgent' || alert.needsImmediateHelp).length,
  };
}

export async function fetchManagerDailyHistory(date) {
  const context = await authenticatedContext();
  if (!context.ok) return { ...context, history: null };
  try {
    const [shiftResult, taskResult, handoverResult, alertResult] = await Promise.all([
      supabaseAuthClient.from('shift_sessions').select('*').eq('shift_date', date).order('updated_at', { ascending: false }),
      supabaseAuthClient.from('task_completions').select('*').eq('shift_date', date).order('updated_at', { ascending: false }),
      supabaseAuthClient.from('handover_notes').select('*').eq('note_date', date).order('updated_at', { ascending: false }),
      supabaseAuthClient.from('alerts').select('*').eq('alert_date', date).order('created_at', { ascending: false }),
    ]);
    const error = shiftResult.error || taskResult.error || handoverResult.error || alertResult.error;
    if (error) return { ok: false, mode: 'sync_error', message: error.message, error, history: null };
    const taskMerge = uniqueBy((taskResult.data || []).map(normalizeBackendTaskCompletion), (task) => task.localId || `${task.date}-${task.shiftType}-${task.taskId}-${task.completedByAuthUserId || task.completedBy}`);
    const handoverMerge = uniqueBy((handoverResult.data || []).map(normalizeBackendHandoverNote), (note) => note.localId || `${note.date}-${note.shiftType}-${note.createdByAuthUserId || note.completedBy}`);
    const history = {
      date,
      shiftSessions: (shiftResult.data || []).map(normalizeBackendShiftSession).filter(Boolean),
      taskCompletions: taskMerge.records,
      handoverNotes: handoverMerge.records,
      alerts: (alertResult.data || []).map(normalizeBackendAlertForReport).filter(Boolean),
      duplicatesIgnored: taskMerge.duplicatesIgnored + handoverMerge.duplicatesIgnored,
      fetchedAt: new Date().toISOString(),
    };
    return { ok: true, mode: 'authenticated', history, summary: summarizeBackendHistory(history) };
  } catch (error) {
    return { ok: false, mode: 'sync_error', message: error.message || 'Backend history fetch failed.', error, history: null };
  }
}

export async function fetchManagerHistoryRange(startDate, endDate) {
  const context = await authenticatedContext();
  if (!context.ok) return { ...context, days: [] };
  try {
    const [shiftResult, taskResult, handoverResult, alertResult] = await Promise.all([
      betweenDateQuery(supabaseAuthClient.from('shift_sessions').select('*'), 'shift_date', startDate, endDate),
      betweenDateQuery(supabaseAuthClient.from('task_completions').select('*'), 'shift_date', startDate, endDate),
      betweenDateQuery(supabaseAuthClient.from('handover_notes').select('*'), 'note_date', startDate, endDate),
      supabaseAuthClient.from('alerts').select('*').gte('alert_date', startDate).lte('alert_date', endDate),
    ]);
    const error = shiftResult.error || taskResult.error || handoverResult.error || alertResult.error;
    if (error) return { ok: false, mode: 'sync_error', message: error.message, error, days: [] };
    const dates = [];
    for (let cursor = new Date(`${startDate}T00:00:00`); cursor <= new Date(`${endDate}T00:00:00`); cursor.setDate(cursor.getDate() + 1)) {
      dates.push(cursor.toISOString().slice(0, 10));
    }
    const shifts = (shiftResult.data || []).map(normalizeBackendShiftSession).filter(Boolean);
    const tasks = (taskResult.data || []).map(normalizeBackendTaskCompletion).filter(Boolean);
    const handovers = (handoverResult.data || []).map(normalizeBackendHandoverNote).filter(Boolean);
    const alerts = (alertResult.data || []).map(normalizeBackendAlertForReport).filter(Boolean);
    const days = dates.map((date) => {
      const history = {
        date,
        shiftSessions: shifts.filter((item) => item.date === date),
        taskCompletions: tasks.filter((item) => item.date === date),
        handoverNotes: handovers.filter((item) => item.date === date),
        alerts: alerts.filter((item) => item.date === date),
        duplicatesIgnored: 0,
      };
      return { date, ...summarizeBackendHistory(history) };
    }).reverse();
    return { ok: true, mode: 'authenticated', days, fetchedAt: new Date().toISOString() };
  } catch (error) {
    return { ok: false, mode: 'sync_error', message: error.message || 'Backend history range fetch failed.', error, days: [] };
  }
}

function formatDateTime(value) {
  if (!value) return 'Not set';
  return new Date(value).toLocaleString();
}

export function buildDailyReportFromBackend(history, { generatedBy = 'Manager' } = {}) {
  if (!history) return '';
  const summary = summarizeBackendHistory(history);
  const byShift = history.taskCompletions.reduce((groups, task) => {
    groups[task.shiftType] ||= [];
    groups[task.shiftType].push(task);
    return groups;
  }, {});
  const lines = [
    'Mesh Shift Log Daily Report',
    `Date: ${history.date}`,
    `Generated at: ${new Date().toLocaleString()}`,
    `Generated by: ${generatedBy}`,
    'Report source: Supabase backend + local cache merge where available',
    '',
    'Shift sessions:',
  ];
  if (!history.shiftSessions.length) lines.push('- None');
  history.shiftSessions.forEach((session) => {
    lines.push(`- ${session.shiftLabel || session.shiftType} | ${session.completedBy || 'Unknown'} | ${session.status}`);
    lines.push(`  Started: ${formatDateTime(session.startedAt)} | Finished: ${formatDateTime(session.finishedAt)}`);
  });
  lines.push('', 'Checklist progress:');
  lines.push(`- Total task rows: ${summary.taskRows}`);
  lines.push(`- Done: ${summary.doneTasks}`);
  lines.push(`- Not relevant: ${summary.notRelevantTasks}`);
  lines.push(`- Open/reset: ${summary.openTasks}`);
  Object.entries(byShift).forEach(([shift, tasks]) => {
    lines.push(`- ${shift}: done ${tasks.filter((task) => task.status === 'done').length}, not relevant ${tasks.filter((task) => task.status === 'not_relevant').length}, open ${tasks.filter((task) => task.status === 'open').length}`);
  });
  lines.push('', 'Handover notes:');
  if (!history.handoverNotes.length) lines.push('- None');
  history.handoverNotes.forEach((note) => {
    lines.push(`- ${note.shiftType} | ${note.completedBy || 'Unknown'}`);
    if (note.nextShift) lines.push(`  Next shift: ${note.nextShift}`);
    if (note.lowStock) lines.push(`  Low stock: ${note.lowStock}`);
    if (note.maintenance) lines.push(`  Maintenance: ${note.maintenance}`);
    if (note.memberEvent) lines.push(`  Member/event: ${note.memberEvent}`);
  });
  lines.push('', 'Alerts:');
  lines.push(`- Open: ${summary.openAlerts}`);
  lines.push(`- Resolved: ${summary.resolvedAlerts}`);
  lines.push(`- Urgent/immediate: ${summary.urgentAlerts}`);
  history.alerts.forEach((alert) => {
    lines.push(`- ${alert.severity} | ${alert.category} | ${alert.area} | ${alert.status}`);
    lines.push(`  ${alert.message}`);
    lines.push(`  Created by: ${alert.createdBy} at ${formatDateTime(alert.createdAt)}`);
    if (alert.acknowledgedBy) lines.push(`  Acknowledged by: ${alert.acknowledgedBy} at ${formatDateTime(alert.acknowledgedAt)}`);
    if (alert.resolvedBy) lines.push(`  Resolved by: ${alert.resolvedBy} at ${formatDateTime(alert.resolvedAt)}`);
  });
  lines.push('', 'Notes / limitations:');
  lines.push('- This report uses Supabase backend history where available.');
  lines.push('- Local-only modules may not be included yet: event floor full model, assets, cash/invoice and routine editor changes.');
  return lines.join('\n').trim();
}
