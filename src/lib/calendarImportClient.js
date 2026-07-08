import { getCurrentSession, supabaseAuthClient } from './supabaseAuthClient.js';
import { isSupabaseConfigured } from './supabaseClient.js';

function result(ok, fields = {}) {
  return { ok, ...fields };
}

async function context() {
  if (!isSupabaseConfigured || !supabaseAuthClient)
    return result(false, { mode: 'local_fallback', message: 'Supabase not configured.' });
  const session = await getCurrentSession().catch(() => null);
  if (!session?.user?.id)
    return result(false, { mode: 'auth_required', message: 'Email login required for calendar import.' });
  return result(true, { mode: 'authenticated', session });
}

function normalizeSource(row) {
  if (!row) return null;
  return {
    id: row.id || '',
    organizationId: row.organization_id || '',
    provider: row.provider || 'google',
    name: row.name || '',
    calendarId: row.calendar_id || '',
    active: row.active !== false,
    settings: row.settings || {},
    lastSyncedAt: row.last_synced_at || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  };
}

function normalizeImportedEvent(row) {
  if (!row) return null;
  const link = Array.isArray(row.event_operation_calendar_links)
    ? row.event_operation_calendar_links[0]
    : null;
  return {
    id: row.id || '',
    sourceId: row.source_id || '',
    sourceName: row.event_calendar_sources?.name || '',
    provider: row.provider || 'google',
    providerEventId: row.provider_event_id || '',
    providerCalendarId: row.provider_calendar_id || '',
    title: row.title || '',
    description: row.description || '',
    location: row.location || '',
    startsAt: row.starts_at || '',
    endsAt: row.ends_at || '',
    allDay: row.all_day === true,
    status: row.status || '',
    htmlLink: row.html_link || '',
    importedAt: row.imported_at || '',
    providerUpdatedAt: row.provider_updated_at || '',
    linkedEventOperationId: link?.event_operation_id || '',
    linkId: link?.id || '',
    updatedAt: row.updated_at || row.created_at || '',
  };
}

async function readFunctionErrorMessage(error) {
  const response = error?.context;
  const status = response?.status || null;
  if (response && typeof response.json === 'function') {
    try {
      const jsonResponse = typeof response.clone === 'function' ? response.clone() : response;
      const body = await jsonResponse.json();
      const message = body?.error || body?.message;
      if (message) return { message, mode: body?.mode || 'sync_error', debug: body?.debug || null, status, data: body };
    } catch {
      // Fall through to text/message fallback.
    }
  }
  if (response && typeof response.text === 'function') {
    try {
      const textResponse = typeof response.clone === 'function' ? response.clone() : response;
      const text = await textResponse.text();
      if (text) return { message: text, mode: 'sync_error', debug: null, status, data: null };
    } catch {
      // Fall through to Supabase error message.
    }
  }
  return { message: error?.message || 'Google Calendar sync failed.', mode: 'sync_error', debug: null, status, data: null };
}

export async function listCalendarSources() {
  const ctx = await context();
  if (!ctx.ok) return { ...ctx, records: [] };
  const { data, error } = await supabaseAuthClient
    .from('event_calendar_sources')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) return result(false, { mode: 'sync_error', message: error.message, error, records: [] });
  return result(true, { mode: 'authenticated', records: (data || []).map(normalizeSource).filter(Boolean), rows: data || [] });
}

export async function createCalendarSource({ name, calendarId }) {
  const ctx = await context();
  if (!ctx.ok) return ctx;
  const { data, error } = await supabaseAuthClient
    .from('event_calendar_sources')
    .insert({
      provider: 'google',
      name,
      calendar_id: calendarId,
      settings: {},
      active: true,
    })
    .select('*')
    .single();
  if (error) return result(false, { mode: 'sync_error', message: error.message, error });
  return result(true, { mode: 'authenticated', record: normalizeSource(data), row: data });
}

export async function updateCalendarSource(id, patch = {}) {
  const ctx = await context();
  if (!ctx.ok) return ctx;
  const { data, error } = await supabaseAuthClient
    .from('event_calendar_sources')
    .update({
      name: patch.name,
      calendar_id: patch.calendarId,
      active: patch.active,
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) return result(false, { mode: 'sync_error', message: error.message, error });
  return result(true, { mode: 'authenticated', record: normalizeSource(data), row: data });
}

export async function listImportedCalendarEvents({ from, to } = {}) {
  const ctx = await context();
  if (!ctx.ok) return { ...ctx, records: [] };
  let query = supabaseAuthClient
    .from('external_calendar_events')
    .select('*, event_calendar_sources(name), event_operation_calendar_links(id,event_operation_id)')
    .order('starts_at', { ascending: true, nullsFirst: false });
  if (from) query = query.gte('starts_at', from);
  if (to) query = query.lte('starts_at', to);
  const { data, error } = await query;
  if (error) return result(false, { mode: 'sync_error', message: error.message, error, records: [] });
  return result(true, { mode: 'authenticated', records: (data || []).map(normalizeImportedEvent).filter(Boolean), rows: data || [] });
}

export async function syncGoogleCalendar({ sourceId, timeMin, timeMax }) {
  const ctx = await context();
  if (!ctx.ok) return ctx;
  const { data, error } = await supabaseAuthClient.functions.invoke('google-calendar-sync', {
    body: { sourceId, timeMin, timeMax },
  });
  if (error) {
    const parsedError = await readFunctionErrorMessage(error);
    return result(false, {
      mode: parsedError.mode,
      message: parsedError.message,
      debug: parsedError.debug,
      status: parsedError.status,
      error,
      data: parsedError.data,
    });
  }
  if (data?.ok === false) {
    return result(false, {
      mode: data.mode || 'sync_error',
      message: data.error || 'Google Calendar sync failed.',
      debug: data.debug || null,
      expectedSecretName: data.expectedSecretName || null,
      sourceAlias: data.sourceAlias || null,
      status: null,
      data,
    });
  }
  const syncedCount = data?.syncedCount ?? data?.importedCount ?? 0;
  if (data?.mode === 'ics') {
    return result(true, {
      mode: 'ics',
      data,
      diagnostics: data.diagnostics || null,
      syncedCount,
      message: `Synced ${syncedCount} event(s) from iCal feed.`,
    });
  }
  return result(true, { mode: 'authenticated', data, message: `Synced ${syncedCount} event(s).` });
}

export async function createEventOperationFromCalendarEvent(externalEventId) {
  const ctx = await context();
  if (!ctx.ok) return ctx;
  const { data, error } = await supabaseAuthClient.rpc('create_event_operation_from_calendar_event', {
    input_external_event_id: externalEventId,
  });
  if (error) return result(false, { mode: 'sync_error', message: error.message, error });
  return result(true, { mode: 'authenticated', record: data, row: data });
}

export async function linkCalendarEventToEventOperation(externalEventId, eventOperationId) {
  const ctx = await context();
  if (!ctx.ok) return ctx;
  const { data, error } = await supabaseAuthClient.rpc('link_calendar_event_to_event_operation', {
    input_external_event_id: externalEventId,
    input_event_operation_id: eventOperationId,
  });
  if (error) return result(false, { mode: 'sync_error', message: error.message, error });
  return result(true, { mode: 'authenticated', record: data, row: data });
}
