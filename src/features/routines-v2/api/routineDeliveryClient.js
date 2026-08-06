import { getCurrentSession, supabaseAuthClient } from '../../../lib/supabaseAuthClient.js';
import { isSupabaseConfigured } from '../../../lib/supabaseClient.js';
import {
  inspectRoutineDeliveryIntegrity,
  normalizeRoutineDeliveryComparison,
  normalizeRoutineDeliveryPreview,
  normalizeRoutineDeliveryRecord,
  normalizeRoutineDeliverySelection,
} from '../data/routineDelivery.js';

function result(ok, fields = {}) { return { ok, ...fields }; }
function compact(payload) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

async function context() {
  if (!isSupabaseConfigured || !supabaseAuthClient) {
    return result(false, { mode: 'not_configured', message: 'Routine delivery is not configured.' });
  }
  const session = await getCurrentSession().catch(() => null);
  if (!session?.user?.id) {
    return result(false, { mode: 'auth_required', message: 'Sign in again to access routine delivery.' });
  }
  return result(true, { mode: 'authenticated' });
}

export function normalizeRoutineDeliveryFailure(error) {
  const raw = String(error?.message || 'The routine delivery request failed.');
  const fields = /hash|integrity|tamper/i.test(raw)
    ? { mode: 'integrity_error', message: 'Routine delivery integrity verification failed.' }
    : /jwt expired|invalid jwt|not authenticated|auth session/i.test(raw)
      ? { mode: 'auth_required', message: 'Your sign-in expired. Sign in again.' }
      : /row-level security|permission denied|required.*authority|access is denied/i.test(raw)
        ? { mode: 'permission_denied', message: 'You do not have permission for this delivery record.' }
        : /failed to fetch|network|timeout|connection/i.test(raw)
          ? { mode: 'network_error', message: 'The routine delivery service could not be reached.' }
          : { mode: 'sync_error', message: raw };
  return result(false, { ...fields, error });
}

async function rpc(name, payload = {}, normalize = (value) => value) {
  const ctx = await context();
  if (!ctx.ok) return ctx;
  const { data, error } = await supabaseAuthClient.rpc(name, compact(payload));
  if (error) return normalizeRoutineDeliveryFailure(error);
  return result(true, { mode: 'authenticated', data: normalize(data) });
}

export function previewRoutineRunDelivery(runId) {
  return rpc('preview_routine_run_delivery', { input_run_id: runId }, normalizeRoutineDeliveryPreview);
}

export function getRoutineDeliveryRecord(deliveryRecordId) {
  return rpc('get_routine_delivery_record', {
    input_delivery_record_id: deliveryRecordId,
  }, (value) => ({
    ...value,
    record: normalizeRoutineDeliveryRecord(value?.record),
  }));
}

export function verifyRoutineDeliveryRecord(deliveryRecordId) {
  return rpc('verify_routine_delivery_record', {
    input_delivery_record_id: deliveryRecordId,
  }, inspectRoutineDeliveryIntegrity);
}

export function getPreviousRoutineDeliveryForTask(openingTaskId) {
  return rpc('get_previous_routine_delivery_for_task', {
    input_opening_task_id: openingTaskId,
  }, normalizeRoutineDeliverySelection);
}

export function getRoutineDeliveryComparison(openingTaskId) {
  return rpc('get_routine_delivery_comparison', {
    input_opening_task_id: openingTaskId,
  }, (value) => ({
    latest: normalizeRoutineDeliveryComparison(value?.latest),
    history: Array.isArray(value?.history)
      ? value.history.map(normalizeRoutineDeliveryComparison)
      : [],
    reconciliationHistory: value?.reconciliationHistory ?? null,
  }));
}

export function listRoutineDeliveryHistory(payload) {
  return rpc('list_routine_delivery_history', {
    input_date_from: payload.dateFrom,
    input_date_to: payload.dateTo,
    input_delivery_key: payload.deliveryKey ?? null,
    input_result_filter: payload.resultFilter ?? null,
  });
}

export function listRoutineDeliveryMismatches(payload) {
  return rpc('list_routine_delivery_mismatches', {
    input_date_from: payload.dateFrom,
    input_date_to: payload.dateTo,
    input_status_filter: payload.statusFilter ?? null,
  });
}
