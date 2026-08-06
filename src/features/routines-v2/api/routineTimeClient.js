import { getCurrentSession, supabaseAuthClient } from '../../../lib/supabaseAuthClient.js';
import { isSupabaseConfigured } from '../../../lib/supabaseClient.js';
import {
  normalizeRoutineOperationalClock,
  normalizeRoutineTaskTiming,
  normalizeRoutineTimingState,
} from '../data/routineOperationalTime.js';

function result(ok, fields = {}) { return { ok, ...fields }; }
function compact(payload) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

async function context() {
  if (!isSupabaseConfigured || !supabaseAuthClient) {
    return result(false, { mode: 'not_configured', message: 'Routine timing is not configured.' });
  }
  const session = await getCurrentSession().catch(() => null);
  if (!session?.user?.id) {
    return result(false, { mode: 'auth_required', message: 'Sign in again to access routine timing.' });
  }
  return result(true, { mode: 'authenticated' });
}

export function normalizeRoutineTimeFailure(error) {
  const raw = String(error?.message || 'The routine timing request failed.');
  const fields = /routine_task_too_early/i.test(raw)
    ? { mode: 'too_early', message: 'This task is not available yet.' }
    : /routine_task_hidden/i.test(raw)
      ? { mode: 'hidden', message: 'This task is still hidden.' }
      : /routine_task_condition_pending/i.test(raw)
        ? { mode: 'condition_pending', message: 'This task is waiting for a server condition.' }
        : /timing_snapshot_(invalid|not_ready)|routine_task_timing_unavailable/i.test(raw)
          ? { mode: 'timing_invalid', message: 'Authoritative timing is unavailable or invalid.' }
          : /stale|revision|refresh before/i.test(raw)
            ? { mode: 'stale_write', message: 'This routine changed elsewhere. Refresh before retrying.' }
            : /jwt expired|invalid jwt|not authenticated|auth session/i.test(raw)
              ? { mode: 'auth_required', message: 'Your sign-in expired. Sign in again.' }
              : /row-level security|permission denied|required.*authority|required.*access/i.test(raw)
                ? { mode: 'permission_denied', message: 'You do not have permission for this timing action.' }
                : /failed to fetch|network|timeout|connection/i.test(raw)
                  ? { mode: 'network_error', message: 'The routine timing service could not be reached. Retry with the same idempotency key.' }
                  : { mode: 'sync_error', message: raw };
  return result(false, { ...fields, error });
}

async function rpc(name, payload = {}, normalize = (value) => value) {
  const ctx = await context();
  if (!ctx.ok) return ctx;
  const { data, error } = await supabaseAuthClient.rpc(name, compact(payload));
  if (error) return normalizeRoutineTimeFailure(error);
  return result(true, { mode: 'authenticated', data: normalize(data) });
}

export function getRoutineOperationalClock() {
  return rpc('get_routine_operational_clock', {}, normalizeRoutineOperationalClock);
}

export function createOrGetTimedRoutineRun(payload) {
  return rpc('create_or_get_routine_run', {
    input_routine_key: payload.routineKey,
    input_scope_key: payload.scopeKey || 'default',
    input_operational_date: payload.operationalDate ?? null,
    input_idempotency_key: payload.idempotencyKey,
  });
}

export function getRoutineRunTimingState(runId) {
  return rpc('get_routine_run_timing_state', { input_run_id: runId }, normalizeRoutineTimingState);
}
export function refreshRoutineRunTiming(payload) {
  return rpc('refresh_routine_run_timing', {
    input_run_id: payload.runId, input_idempotency_key: payload.idempotencyKey,
  }, normalizeRoutineTimingState);
}
export function evaluateRoutineRunConditions(payload) {
  return rpc('evaluate_routine_run_conditions', {
    input_run_id: payload.runId, input_idempotency_key: payload.idempotencyKey,
  });
}
export function verifyRoutineRunTimingSnapshot(runId) {
  return rpc('verify_routine_run_timing_snapshot', { input_run_id: runId });
}
export function listCurrentRoutineRuns() { return rpc('list_current_routine_runs'); }
export function getRoutineTaskTiming(taskId) {
  return rpc('get_routine_task_timing', { input_task_id: taskId }, (value) => ({
    ...value,
    timing: normalizeRoutineTaskTiming({ ...(value?.timing || {}), live: value?.live }),
  }));
}
export function replaceRoutineOrganizationFlags(payload) {
  return rpc('replace_routine_organization_flags', {
    input_flags: payload.flags,
    input_expected_revision: payload.expectedRevision,
    input_idempotency_key: payload.idempotencyKey,
  });
}
export function supersedeRoutineRunOperationalDate(payload) {
  return rpc('supersede_routine_run_operational_date', {
    input_run_id: payload.runId,
    input_replacement_operational_date: payload.replacementOperationalDate,
    input_reason: payload.reason,
    input_expected_revision: payload.expectedRevision,
    input_idempotency_key: payload.idempotencyKey,
  });
}
