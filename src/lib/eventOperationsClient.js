import { getCurrentSession, supabaseAuthClient } from './supabaseAuthClient.js';
import { isSupabaseConfigured, supabase } from './supabaseClient.js';

function result(ok, fields = {}) {
  return { ok, ...fields };
}

function authRequired(message = 'Email login required for event operations backend sync.') {
  return result(false, { mode: 'auth_required', message });
}

async function context() {
  if (!isSupabaseConfigured || !supabaseAuthClient)
    return result(false, { mode: 'local_fallback', message: 'Supabase not configured.' });
  const session = await getCurrentSession().catch(() => null);
  if (!session?.user?.id) return authRequired();
  return result(true, { mode: 'authenticated', authUserId: session.user.id });
}

function organizationId() {
  return supabase.organizationId || undefined;
}

function cleanPayload(payload = {}) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  );
}

function normalizeEvent(row) {
  if (!row) return null;
  return {
    id: row.id || '',
    date: row.event_date || '',
    title: row.title || '',
    venue: row.venue || '',
    startsAt: row.starts_at || '',
    endsAt: row.ends_at || '',
    status: row.status || 'draft',
    description: row.description || '',
    source: row.source || 'manual',
    sourceRef: row.source_ref || '',
    createdByAuthUserId: row.created_by_auth_user_id || '',
    createdByName: row.created_by_name || '',
    activeResponsibleName: row.active_responsible_name || '',
    activeResponsibleAuthUserId: row.active_responsible_auth_user_id || '',
    notes: row.notes || '',
    metadata: row.metadata || {},
    updatedAt: row.updated_at || row.created_at || '',
  };
}

function normalizePresence(row) {
  if (!row) return null;
  return {
    id: row.id || '',
    date: row.presence_date || '',
    authUserId: row.auth_user_id || '',
    operatorName: row.operator_name || '',
    operatorSource: row.operator_source || '',
    roleLabel: row.role_label || '',
    selectedShiftScope: row.selected_shift_scope || '',
    available: row.available !== false,
    checkedInAt: row.checked_in_at || '',
    lastSeenAt: row.last_seen_at || '',
    checkedOutAt: row.checked_out_at || '',
    metadata: row.metadata || {},
    updatedAt: row.updated_at || row.created_at || '',
  };
}

function normalizeAssignment(row) {
  if (!row) return null;
  return {
    id: row.id || '',
    eventId: row.event_id || '',
    roleKey: row.role_key || '',
    roleLabel: row.role_label || '',
    zone: row.zone || '',
    assignedAuthUserId: row.assigned_auth_user_id || '',
    assignedOperatorName: row.assigned_operator_name || '',
    assignedOperatorSource: row.assigned_operator_source || '',
    assignedByAuthUserId: row.assigned_by_auth_user_id || '',
    assignedByName: row.assigned_by_name || '',
    active: row.active !== false,
    notes: row.notes || '',
    updatedAt: row.updated_at || row.created_at || '',
  };
}

function normalizeTask(row) {
  if (!row) return null;
  return {
    id: row.id || '',
    eventId: row.event_id || '',
    title: row.title || '',
    description: row.description || '',
    zone: row.zone || '',
    priority: row.priority || 'normal',
    dueAt: row.due_at || '',
    remindAt: row.remind_at || '',
    assignedRoleKey: row.assigned_role_key || '',
    assignedAuthUserId: row.assigned_auth_user_id || '',
    assignedOperatorName: row.assigned_operator_name || '',
    assignedOperatorSource: row.assigned_operator_source || '',
    status: row.status || 'pending',
    acknowledgedAt: row.acknowledged_at || '',
    acknowledgedByName: row.acknowledged_by_name || '',
    completedAt: row.completed_at || '',
    completedByAuthUserId: row.completed_by_auth_user_id || '',
    completedByName: row.completed_by_name || '',
    completionComment: row.completion_comment || '',
    createdByAuthUserId: row.created_by_auth_user_id || '',
    createdByName: row.created_by_name || '',
    metadata: row.metadata || {},
    updatedAt: row.updated_at || row.created_at || '',
  };
}

function normalizeHandover(row) {
  if (!row) return null;
  return {
    id: row.id || '',
    eventId: row.event_id || '',
    fromAuthUserId: row.from_auth_user_id || '',
    fromName: row.from_name || '',
    toAuthUserId: row.to_auth_user_id || '',
    toName: row.to_name || '',
    responsibilityScope: row.responsibility_scope || '',
    notes: row.notes || '',
    createdByAuthUserId: row.created_by_auth_user_id || '',
    createdByName: row.created_by_name || '',
    createdAt: row.created_at || '',
  };
}

function eventToRow(payload = {}) {
  return cleanPayload({
    organization_id: organizationId(),
    event_date: payload.date,
    title: payload.title,
    venue: payload.venue,
    starts_at: payload.startsAt || null,
    ends_at: payload.endsAt || null,
    status: payload.status,
    description: payload.description,
    source: payload.source || 'manual',
    source_ref: payload.sourceRef,
    created_by_name: payload.createdByName,
    active_responsible_name: payload.activeResponsibleName,
    active_responsible_auth_user_id: payload.activeResponsibleAuthUserId || null,
    notes: payload.notes,
    metadata: payload.metadata || {},
  });
}

function taskToRow(payload = {}) {
  return cleanPayload({
    organization_id: organizationId(),
    event_id: payload.eventId,
    title: payload.title,
    description: payload.description,
    zone: payload.zone,
    priority: payload.priority,
    due_at: payload.dueAt || null,
    remind_at: payload.remindAt || null,
    assigned_role_key: payload.assignedRoleKey,
    assigned_auth_user_id: payload.assignedAuthUserId || null,
    assigned_operator_name: payload.assignedOperatorName,
    assigned_operator_source: payload.assignedOperatorSource,
    status: payload.status,
    created_by_name: payload.createdByName,
    metadata: payload.metadata || {},
  });
}

export async function fetchEventOperationsForDate(date) {
  const ctx = await context();
  if (!ctx.ok) return { ...ctx, records: [] };
  const { data, error } = await supabaseAuthClient
    .from('event_operations')
    .select('*')
    .eq('event_date', date)
    .order('starts_at', { ascending: true, nullsFirst: false });
  if (error) return result(false, { mode: 'sync_error', message: error.message, error, records: [] });
  return result(true, { mode: 'authenticated', records: (data || []).map(normalizeEvent).filter(Boolean), rows: data || [] });
}

export async function fetchTodayEventOperations() {
  return fetchEventOperationsForDate(new Date().toISOString().slice(0, 10));
}

export async function createEventOperation(payload) {
  const ctx = await context();
  if (!ctx.ok) return ctx;
  const { data, error } = await supabaseAuthClient
    .from('event_operations')
    .insert(eventToRow(payload))
    .select('*')
    .single();
  if (error) return result(false, { mode: 'sync_error', message: error.message, error });
  return result(true, { mode: 'authenticated', record: normalizeEvent(data), row: data });
}

export async function updateEventOperation(id, payload) {
  const ctx = await context();
  if (!ctx.ok) return ctx;
  const { data, error } = await supabaseAuthClient
    .from('event_operations')
    .update(eventToRow(payload))
    .eq('id', id)
    .select('*')
    .single();
  if (error) return result(false, { mode: 'sync_error', message: error.message, error });
  return result(true, { mode: 'authenticated', record: normalizeEvent(data), row: data });
}

export async function upsertEventStaffPresence(payload) {
  const ctx = await context();
  if (!ctx.ok) return ctx;
  const { data, error } = await supabaseAuthClient.rpc('upsert_event_staff_presence', {
    input_presence_date: payload.date,
    input_operator_name: payload.operatorName,
    input_operator_source: payload.operatorSource || '',
    input_role_label: payload.roleLabel || '',
    input_selected_shift_scope: payload.selectedShiftScope || '',
    input_available: payload.available !== false,
    input_metadata: payload.metadata || {},
  });
  if (error) return result(false, { mode: 'sync_error', message: error.message, error });
  const row = Array.isArray(data) ? data[0] : data;
  return result(true, { mode: 'authenticated', record: normalizePresence(row), row });
}

export async function fetchEventStaffPresence(date) {
  const ctx = await context();
  if (!ctx.ok) return { ...ctx, records: [] };
  const { data, error } = await supabaseAuthClient
    .from('event_staff_presence')
    .select('*')
    .eq('presence_date', date)
    .order('last_seen_at', { ascending: false });
  if (error) return result(false, { mode: 'sync_error', message: error.message, error, records: [] });
  return result(true, { mode: 'authenticated', records: (data || []).map(normalizePresence).filter(Boolean), rows: data || [] });
}

export async function fetchEventRoleAssignments(eventId) {
  const ctx = await context();
  if (!ctx.ok) return { ...ctx, records: [] };
  const { data, error } = await supabaseAuthClient
    .from('event_role_assignments')
    .select('*')
    .eq('event_id', eventId)
    .eq('active', true)
    .order('created_at', { ascending: true });
  if (error) return result(false, { mode: 'sync_error', message: error.message, error, records: [] });
  return result(true, { mode: 'authenticated', records: (data || []).map(normalizeAssignment).filter(Boolean), rows: data || [] });
}

export async function fetchAssignableEventStaff() {
  const ctx = await context();
  if (!ctx.ok) return { ...ctx, profiles: [] };
  const { data, error } = await supabaseAuthClient.rpc('list_assignable_event_staff');
  if (error) {
    return result(false, {
      mode: 'sync_error',
      message: error.message || 'Assignable event staff could not be loaded.',
      error,
      profiles: [],
    });
  }
  const profiles = (data || []).map((row) => ({
    profileId: row.profile_id || '',
    authUserId: row.auth_user_id || '',
    displayName: row.display_name || '',
    email: row.email || '',
    role: row.profile_role || '',
    organizationId: row.organization_id || '',
    active: true,
    isSharedDevice: false,
  }));
  return result(true, {
    mode: 'authenticated',
    profiles,
    message: `Loaded ${profiles.length} assignable event staff profile${profiles.length === 1 ? '' : 's'}.`,
  });
}

export async function upsertEventRoleAssignment(payload) {
  const ctx = await context();
  if (!ctx.ok) return ctx;
  const rpcName = payload.replaceSingleLead
    ? 'replace_event_role_assignment'
    : 'create_event_role_assignment';
  const rpcPayload = {
    input_event_id: payload.eventId,
    input_role_key: payload.roleKey,
    input_role_label: payload.roleLabel,
    input_zone: payload.zone || '',
    input_assigned_auth_user_id: payload.assignedAuthUserId || null,
    input_assigned_operator_name: payload.assignedOperatorName || '',
    input_assigned_operator_source: payload.assignedOperatorSource || '',
    input_assigned_by_name: payload.assignedByName || '',
    input_notes: payload.notes || '',
  };
  if (payload.replaceSingleLead) {
    rpcPayload.input_expected_current_assignment_id = payload.expectedCurrentAssignmentId || null;
  }
  const { data, error } = await supabaseAuthClient.rpc(rpcName, rpcPayload);
  if (error) return result(false, { mode: 'sync_error', message: error.message, error });
  const row = Array.isArray(data) ? data[0] : data;
  return result(true, { mode: 'authenticated', record: normalizeAssignment(row), row });
}

export async function deactivateEventRoleAssignment(assignmentId) {
  const ctx = await context();
  if (!ctx.ok) return ctx;
  if (!assignmentId) return result(false, { message: 'Role assignment is required.' });
  const { data, error } = await supabaseAuthClient.rpc('deactivate_event_role_assignment', {
    input_assignment_id: assignmentId,
  });
  if (error) return result(false, { mode: 'sync_error', message: error.message, error });
  const row = Array.isArray(data) ? data[0] : data;
  return result(true, { mode: 'authenticated', record: normalizeAssignment(row), row });
}

export async function fetchEventTasks(eventId) {
  const ctx = await context();
  if (!ctx.ok) return { ...ctx, records: [] };
  const { data, error } = await supabaseAuthClient
    .from('event_tasks')
    .select('*')
    .eq('event_id', eventId)
    .order('due_at', { ascending: true, nullsFirst: false });
  if (error) return result(false, { mode: 'sync_error', message: error.message, error, records: [] });
  return result(true, { mode: 'authenticated', records: (data || []).map(normalizeTask).filter(Boolean), rows: data || [] });
}

export async function createEventTask(payload) {
  const ctx = await context();
  if (!ctx.ok) return ctx;
  const { data, error } = await supabaseAuthClient
    .from('event_tasks')
    .insert(taskToRow(payload))
    .select('*')
    .single();
  if (error) return result(false, { mode: 'sync_error', message: error.message, error });
  return result(true, { mode: 'authenticated', record: normalizeTask(data), row: data });
}

export async function updateEventTaskStatus(payload) {
  const ctx = await context();
  if (!ctx.ok) return ctx;
  const { data, error } = await supabaseAuthClient.rpc('update_event_task_status', {
    input_task_id: payload.taskId,
    input_status: payload.status,
    input_completed_by_name: payload.completedByName || '',
    input_completion_comment: payload.completionComment || '',
    input_actor_name: payload.actorName || payload.completedByName || '',
  });
  if (error) return result(false, { mode: 'sync_error', message: error.message, error });
  const row = Array.isArray(data) ? data[0] : data;
  return result(true, { mode: 'authenticated', record: normalizeTask(row), row });
}

export async function createResponsibilityHandover(payload) {
  const ctx = await context();
  if (!ctx.ok) return ctx;
  const { data, error } = await supabaseAuthClient.rpc('create_event_responsibility_handover', {
    input_event_id: payload.eventId,
    input_from_name: payload.fromName || '',
    input_to_auth_user_id: payload.toAuthUserId || null,
    input_to_name: payload.toName || '',
    input_responsibility_scope: payload.responsibilityScope || 'all',
    input_notes: payload.notes || '',
    input_created_by_name: payload.createdByName || '',
  });
  if (error) return result(false, { mode: 'sync_error', message: error.message, error });
  const row = Array.isArray(data) ? data[0] : data;
  return result(true, { mode: 'authenticated', record: normalizeHandover(row), row });
}

export async function fetchResponsibilityHandovers(eventId) {
  const ctx = await context();
  if (!ctx.ok) return { ...ctx, records: [] };
  const { data, error } = await supabaseAuthClient
    .from('event_responsibility_handovers')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });
  if (error) return result(false, { mode: 'sync_error', message: error.message, error, records: [] });
  return result(true, { mode: 'authenticated', records: (data || []).map(normalizeHandover).filter(Boolean), rows: data || [] });
}
