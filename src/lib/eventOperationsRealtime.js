import { supabaseAuthClient } from './supabaseAuthClient.js';

const REALTIME_TABLES = [
  'event_operations',
  'event_tasks',
  'event_staff_presence',
  'event_role_assignments',
  'event_responsibility_handovers',
  'event_operation_calendar_links',
];

export function subscribeToEventOperationsRealtime({
  organizationId,
  eventId = '',
  enabled = false,
  onRefresh,
  onStatus,
  debounceMs = 900,
}) {
  if (!enabled || !supabaseAuthClient || !organizationId || !onRefresh) {
    onStatus?.({ state: 'disabled', message: 'Realtime disabled.' });
    return { unsubscribe: () => {} };
  }

  let closed = false;
  let refreshTimer = null;
  const channel = supabaseAuthClient.channel(`event-ops-${organizationId}-${eventId || 'all'}`);

  function scheduleRefresh(reason) {
    if (closed) return;
    if (refreshTimer) window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      refreshTimer = null;
      onStatus?.({ state: 'refreshing', message: reason, lastEventAt: new Date().toISOString() });
      onRefresh(reason);
    }, debounceMs);
  }

  REALTIME_TABLES.forEach((table) => {
    const filter = `organization_id=eq.${organizationId}`;
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter },
      (payload) => {
        if (eventId && ['event_tasks', 'event_staff_presence', 'event_role_assignments', 'event_responsibility_handovers'].includes(table)) {
          const payloadEventId = payload.new?.event_id || payload.old?.event_id || '';
          if (payloadEventId && payloadEventId !== eventId) return;
        }
        if (eventId && table === 'event_operation_calendar_links') {
          const payloadEventId = payload.new?.event_operation_id || payload.old?.event_operation_id || '';
          if (payloadEventId && payloadEventId !== eventId) return;
        }
        scheduleRefresh(`realtime:${table}:${payload.eventType || 'change'}`);
      },
    );
  });

  channel.subscribe((status) => {
    onStatus?.({
      state: status === 'SUBSCRIBED' ? 'connected' : 'connecting',
      message: status,
      lastEventAt: new Date().toISOString(),
    });
  });

  return {
    unsubscribe() {
      closed = true;
      if (refreshTimer) window.clearTimeout(refreshTimer);
      supabaseAuthClient.removeChannel(channel);
      onStatus?.({ state: 'disconnected', message: 'Realtime disconnected.' });
    },
  };
}

export { REALTIME_TABLES };
