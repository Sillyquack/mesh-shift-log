import { supabaseAuthClient } from './supabaseAuthClient.js';

export const INVENTORY_REALTIME_TABLES = [
  'inventory_products',
  'inventory_locations',
  'inventory_location_products',
  'inventory_count_sessions',
  'inventory_count_lines',
];

export function subscribeToInventoryRealtime({ organizationId, sessionId = '', enabled = false, onRefresh, onStatus, debounceMs = 900 }) {
  if (!enabled || !supabaseAuthClient || !organizationId || !onRefresh) {
    onStatus?.({ state: 'disabled', message: 'Realtime disabled.' });
    return { unsubscribe() {} };
  }
  let closed = false;
  let refreshTimer = null;
  const channel = supabaseAuthClient.channel(`inventory-${organizationId}-${sessionId || 'all'}`);
  const schedule = (reason) => {
    if (closed) return;
    if (refreshTimer) window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      refreshTimer = null;
      onRefresh(reason);
    }, debounceMs);
  };
  INVENTORY_REALTIME_TABLES.forEach((table) => {
    channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `organization_id=eq.${organizationId}` }, (payload) => {
      if (sessionId && table === 'inventory_count_lines') {
        const changedSessionId = payload.new?.session_id || payload.old?.session_id;
        if (changedSessionId && changedSessionId !== sessionId) return;
      }
      schedule(`realtime:${table}`);
    });
  });
  channel.subscribe((status) => onStatus?.({ state: status === 'SUBSCRIBED' ? 'connected' : 'connecting', message: status }));
  return {
    unsubscribe() {
      closed = true;
      if (refreshTimer) window.clearTimeout(refreshTimer);
      supabaseAuthClient.removeChannel(channel);
      onStatus?.({ state: 'disconnected', message: 'Realtime disconnected.' });
    },
  };
}
