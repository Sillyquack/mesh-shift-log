import { getCurrentSession, supabaseAuthClient } from './supabaseAuthClient.js';
import { isBackendAuthRequired, isSupabaseConfigured, supabase } from './supabaseClient.js';

function authRequiredResult() {
  return {
    ok: false,
    mode: isBackendAuthRequired ? 'auth_required' : 'local_only',
    message: 'Checklist data saved locally. Email login required for backend sync.',
  };
}

async function getAuthenticatedContext() {
  if (!isSupabaseConfigured || !supabaseAuthClient) {
    return { ok: false, mode: 'local_fallback', session: null };
  }
  const session = await getCurrentSession().catch(() => null);
  if (!session?.user?.id) return { ok: false, ...authRequiredResult(), session: null };
  return { ok: true, mode: 'authenticated', session, authUserId: session.user.id };
}

function organizationId() {
  return supabase.organizationId || null;
}

function validationError(message) {
  return { ok: false, mode: 'validation_error', message };
}

function parseNoteText(noteText) {
  try {
    const parsed = JSON.parse(noteText || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return { nextShift: noteText || '' };
  }
}

async function saveByLocalId(tableName, payload) {
  try {
    const localId = payload.local_id;
    const existing = localId
      ? await supabaseAuthClient.from(tableName).select('id').eq('local_id', localId).maybeSingle()
      : { data: null, error: null };
    if (existing.error) return { data: null, error: existing.error };
    if (existing.data?.id) {
      return supabaseAuthClient
        .from(tableName)
        .update(payload)
        .eq('id', existing.data.id)
        .select('*')
        .single();
    }
    return supabaseAuthClient
      .from(tableName)
      .insert(payload)
      .select('*')
      .single();
  } catch (error) {
    return { data: null, error };
  }
}

export async function getBackendShiftMode() {
  const context = await getAuthenticatedContext();
  return {
    mode: context.ok ? 'authenticated' : context.mode,
    isAuthenticated: context.ok,
    authUserId: context.authUserId || '',
    message: context.ok ? 'Checklist data backend ready.' : context.message || 'Checklist data saved locally.',
  };
}

export function normalizeShiftRecord(row) {
  if (!row) return null;
  return {
    backendId: row.id || '',
    localId: row.local_id || '',
    date: row.shift_date || '',
    shiftType: row.shift_key || '',
    shiftLabel: row.shift_label || '',
    startedAt: row.started_at || '',
    finishedAt: row.finished_at || '',
    status: row.status || 'active',
    completedBy: row.display_name || '',
    role: row.role || '',
    loginSource: row.login_source || '',
    updatedAt: row.updated_at || row.created_at || '',
  };
}

export function normalizeTaskCompletion(row) {
  if (!row) return null;
  const inputValues = row.input_values && typeof row.input_values === 'object' ? row.input_values : {};
  return {
    id: row.local_id || row.id,
    backendId: row.id || '',
    localId: row.local_id || row.id || '',
    date: row.shift_date || '',
    shiftType: row.shift_key || '',
    taskId: row.task_id || '',
    taskTitle: row.task_title || '',
    section: row.section_key || '',
    timeBlock: row.section_key || '',
    status: row.status || 'done',
    completedAt: row.completed_at || row.updated_at || row.created_at || '',
    completedBy: row.completed_by_name || '',
    completedByAuthUserId: row.completed_by_auth_user_id || '',
    completedByProfileId: row.completed_by_profile_id || '',
    input: inputValues.input || '',
    comment: row.not_relevant_reason || inputValues.comment || '',
    inputType: inputValues.inputType || '',
    criticalConfirmed: Boolean(row.critical_confirmed),
    syncStatus: 'synced',
    updatedAt: row.updated_at || row.created_at || '',
  };
}

export function normalizeHandoverNote(row) {
  if (!row) return null;
  const fields = parseNoteText(row.note_text);
  return {
    id: row.local_id || row.id,
    backendId: row.id || '',
    localId: row.local_id || row.id || '',
    date: row.note_date || '',
    shiftType: row.shift_key || '',
    completedBy: row.created_by_name || '',
    createdByAuthUserId: row.created_by_auth_user_id || '',
    createdByProfileId: row.created_by_profile_id || '',
    nextShift: fields.nextShift || '',
    lowStock: fields.lowStock || '',
    maintenance: fields.maintenance || '',
    memberEvent: fields.memberEvent || '',
    updatedAt: row.updated_at || row.created_at || '',
    syncStatus: 'synced',
  };
}

export async function createOrUpdateShiftSession(record) {
  const context = await getAuthenticatedContext();
  if (!context.ok) return context;
  if (!record?.localId) return validationError('Missing shift session local_id.');
  if (!record?.date) return validationError('Missing shift date.');
  if (!record?.shiftType) return validationError('Missing shift key.');
  if (!record?.displayName) return validationError('Missing display name.');
  const payload = {
    organization_id: organizationId(),
    local_id: record.localId,
    shift_date: record.date,
    shift_key: record.shiftType,
    shift_label: record.shiftLabel || record.shiftType,
    started_at: record.startedAt || new Date().toISOString(),
    finished_at: record.finishedAt || null,
    user_profile_id: record.userProfileId || context.authUserId,
    auth_user_id: context.authUserId,
    display_name: record.displayName,
    role: record.role || '',
    login_source: record.loginSource || '',
    status: record.status || 'active',
  };
  const { data, error } = await saveByLocalId('shift_sessions', payload);
  if (error) return { ok: false, mode: 'sync_error', message: error.message, error };
  return { ok: true, mode: 'authenticated', record: normalizeShiftRecord(data), row: data };
}

export async function syncTaskCompletion(log, { shiftSessionBackendId = '' } = {}) {
  const context = await getAuthenticatedContext();
  if (!context.ok) return context;
  if (!(log?.localId || log?.id)) return validationError('Missing task completion local_id.');
  if (!log?.date) return validationError('Missing task completion date.');
  if (!log?.shiftType) return validationError('Missing task completion shift key.');
  if (!log?.taskId) return validationError('Missing task id.');
  const payload = {
    organization_id: organizationId(),
    local_id: log.localId || log.id,
    shift_session_id: shiftSessionBackendId || log.shiftSessionBackendId || null,
    shift_date: log.date,
    shift_key: log.shiftType,
    routine_key: log.routineKey || null,
    section_key: log.section || log.timeBlock || null,
    task_id: log.taskId,
    task_title: log.taskTitle || '',
    status: log.status || 'done',
    completed_at: log.completedAt || new Date().toISOString(),
    completed_by_profile_id: log.completedByProfileId || context.authUserId,
    completed_by_auth_user_id: context.authUserId,
    completed_by_name: log.completedBy || '',
    input_values: {
      input: log.input || '',
      comment: log.comment || '',
      inputType: log.inputType || '',
    },
    critical_confirmed: Boolean(log.criticalConfirmed),
    not_relevant_reason: log.status === 'not_relevant' ? (log.comment || '') : null,
    sync_status: 'synced',
  };
  const { data, error } = await saveByLocalId('task_completions', payload);
  if (error) return { ok: false, mode: 'sync_error', message: error.message, error };
  return { ok: true, mode: 'authenticated', record: normalizeTaskCompletion(data), row: data };
}

export async function fetchTaskCompletionsForDate(date, shiftType = '') {
  const context = await getAuthenticatedContext();
  if (!context.ok) return { ...context, records: [] };
  if (!date) return { ...validationError('Missing date for task completion fetch.'), records: [] };
  let query = supabaseAuthClient
    .from('task_completions')
    .select('*')
    .eq('shift_date', date);
  if (shiftType) query = query.eq('shift_key', shiftType);
  const { data, error } = await query.order('updated_at', { ascending: false });
  if (error) return { ok: false, mode: 'sync_error', message: error.message, error, records: [] };
  return { ok: true, mode: 'authenticated', records: (data || []).map(normalizeTaskCompletion).filter(Boolean), rows: data || [] };
}

export async function fetchShiftSessionsForDate(date) {
  const context = await getAuthenticatedContext();
  if (!context.ok) return { ...context, records: [] };
  if (!date) return { ...validationError('Missing date for shift session fetch.'), records: [] };
  const { data, error } = await supabaseAuthClient
    .from('shift_sessions')
    .select('*')
    .eq('shift_date', date)
    .order('updated_at', { ascending: false });
  if (error) return { ok: false, mode: 'sync_error', message: error.message, error, records: [] };
  return { ok: true, mode: 'authenticated', records: (data || []).map(normalizeShiftRecord).filter(Boolean), rows: data || [] };
}

export async function syncHandoverNote(note, { shiftSessionBackendId = '' } = {}) {
  const context = await getAuthenticatedContext();
  if (!context.ok) return context;
  if (!(note?.localId || note?.id)) return validationError('Missing handover note local_id.');
  if (!note?.date) return validationError('Missing handover note date.');
  if (!note?.shiftType) return validationError('Missing handover note shift key.');
  const payload = {
    organization_id: organizationId(),
    local_id: note.localId || note.id,
    shift_session_id: shiftSessionBackendId || note.shiftSessionBackendId || null,
    note_date: note.date,
    shift_key: note.shiftType,
    note_text: JSON.stringify({
      nextShift: note.nextShift || '',
      lowStock: note.lowStock || '',
      maintenance: note.maintenance || '',
      memberEvent: note.memberEvent || '',
    }),
    created_by_profile_id: note.createdByProfileId || context.authUserId,
    created_by_auth_user_id: context.authUserId,
    created_by_name: note.completedBy || note.createdBy || '',
  };
  const { data, error } = await saveByLocalId('handover_notes', payload);
  if (error) return { ok: false, mode: 'sync_error', message: error.message, error };
  return { ok: true, mode: 'authenticated', record: normalizeHandoverNote(data), row: data };
}

export async function fetchHandoverNotesForDate(date, shiftType = '') {
  const context = await getAuthenticatedContext();
  if (!context.ok) return { ...context, records: [] };
  if (!date) return { ...validationError('Missing date for handover fetch.'), records: [] };
  let query = supabaseAuthClient
    .from('handover_notes')
    .select('*')
    .eq('note_date', date);
  if (shiftType) query = query.eq('shift_key', shiftType);
  const { data, error } = await query.order('updated_at', { ascending: false });
  if (error) return { ok: false, mode: 'sync_error', message: error.message, error, records: [] };
  return { ok: true, mode: 'authenticated', records: (data || []).map(normalizeHandoverNote).filter(Boolean), rows: data || [] };
}

export async function syncPendingShiftData({ logs = [], handoverNotes = {} } = {}) {
  const context = await getAuthenticatedContext();
  if (!context.ok) return { ...context, taskResults: [], handoverResults: [] };
  const pendingLogs = logs.filter((log) => ['pending_backend', 'pending_auth', 'sync_error'].includes(log.syncStatus));
  const taskResults = [];
  for (const log of pendingLogs) {
    taskResults.push(await syncTaskCompletion(log));
  }
  const pendingNotes = Object.values(handoverNotes).filter((note) => ['pending_backend', 'pending_auth', 'sync_error'].includes(note.syncStatus));
  const handoverResults = [];
  for (const note of pendingNotes) {
    handoverResults.push(await syncHandoverNote(note));
  }
  return { ok: true, mode: 'authenticated', taskResults, handoverResults };
}
