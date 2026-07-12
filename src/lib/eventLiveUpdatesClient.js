import { getCurrentSession, supabaseAuthClient } from './supabaseAuthClient.js';
import { isSupabaseConfigured } from './supabaseClient.js';

function result(ok, fields = {}) {
  return { ok, ...fields };
}

async function context() {
  if (!isSupabaseConfigured || !supabaseAuthClient)
    return result(false, { mode: 'local_fallback', message: 'Supabase is not configured.' });
  const session = await getCurrentSession().catch(() => null);
  if (!session?.user?.id)
    return result(false, { mode: 'auth_required', message: 'Email login is required for live updates.' });
  return result(true, { mode: 'authenticated' });
}

function normalize(row) {
  if (!row) return null;
  return {
    id: row.id || '',
    eventId: row.event_id || '',
    updateType: row.update_type || 'note',
    status: row.status || 'open',
    title: row.title || '',
    details: row.details || '',
    zone: row.zone || 'all',
    priority: row.priority || 'normal',
    ownerRoleKey: row.owner_role_key || '',
    ownerAuthUserId: row.owner_auth_user_id || '',
    occurredAt: row.occurred_at || '',
    resolvedAt: row.resolved_at || '',
    resolvedByAuthUserId: row.resolved_by_auth_user_id || '',
    resolutionNote: row.resolution_note || '',
    createdByAuthUserId: row.created_by_auth_user_id || '',
    createdByName: row.created_by_name || '',
    metadata: row.metadata || {},
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || row.created_at || '',
  };
}

export async function listEventLiveUpdates(eventId, operatorName = '') {
  const ctx = await context();
  if (!ctx.ok) return { ...ctx, records: [] };
  if (!eventId) return result(false, { mode: 'validation_error', message: 'Event Board is required.', records: [] });
  const { data, error } = await supabaseAuthClient.rpc('list_event_live_updates', {
    input_event_id: eventId,
    input_operator_name: operatorName || null,
  });
  if (error) return result(false, { mode: 'sync_error', message: error.message, error, records: [] });
  return result(true, { mode: 'authenticated', records: (data || []).map(normalize).filter(Boolean) });
}

export async function createEventLiveUpdate(payload = {}) {
  const ctx = await context();
  if (!ctx.ok) return ctx;
  const { data, error } = await supabaseAuthClient.rpc('create_event_live_update', {
    input_event_id: payload.eventId,
    input_update_type: payload.updateType,
    input_title: payload.title,
    input_details: payload.details || '',
    input_zone: payload.zone || 'all',
    input_priority: payload.priority || 'normal',
    input_owner_role_key: payload.ownerRoleKey || '',
    input_owner_auth_user_id: payload.ownerAuthUserId || null,
    input_occurred_at: payload.occurredAt || new Date().toISOString(),
    input_created_by_name: payload.createdByName || '',
    input_metadata: payload.metadata || {},
  });
  if (error) return result(false, { mode: 'sync_error', message: error.message, error });
  return result(true, { mode: 'authenticated', record: normalize(Array.isArray(data) ? data[0] : data), message: 'Live update added.' });
}

export async function updateEventLiveUpdate(updateId, patch = {}) {
  const ctx = await context();
  if (!ctx.ok) return ctx;
  const { data, error } = await supabaseAuthClient.rpc('update_event_live_update', {
    input_update_id: updateId,
    input_title: patch.title,
    input_details: patch.details || '',
    input_zone: patch.zone || 'all',
    input_priority: patch.priority || 'normal',
    input_owner_role_key: patch.ownerRoleKey || '',
    input_occurred_at: patch.occurredAt || new Date().toISOString(),
    input_metadata: patch.metadata || {},
  });
  if (error) return result(false, { mode: 'sync_error', message: error.message, error });
  return result(true, { mode: 'authenticated', record: normalize(Array.isArray(data) ? data[0] : data), message: 'Live update saved.' });
}

async function setStatus(updateId, status, resolutionNote = '') {
  const ctx = await context();
  if (!ctx.ok) return ctx;
  const { data, error } = await supabaseAuthClient.rpc('set_event_live_update_status', {
    input_update_id: updateId,
    input_status: status,
    input_resolution_note: resolutionNote,
  });
  if (error) return result(false, { mode: 'sync_error', message: error.message, error });
  return result(true, { mode: 'authenticated', record: normalize(Array.isArray(data) ? data[0] : data), message: `Live update ${status}.` });
}

export function acknowledgeEventLiveUpdate(updateId) {
  return setStatus(updateId, 'acknowledged');
}

export function resolveEventLiveUpdate(updateId, resolutionNote = '') {
  return setStatus(updateId, 'resolved', resolutionNote);
}

export function cancelEventLiveUpdate(updateId, reason = '') {
  return setStatus(updateId, 'cancelled', reason);
}
