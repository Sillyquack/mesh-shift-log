import { getCurrentSession, supabaseAuthClient } from '../../../lib/supabaseAuthClient.js';
import { isSupabaseConfigured } from '../../../lib/supabaseClient.js';
import { routineRpcClient } from './routineRpcClient.js';
import {
  normalizeRoutineCompletionValidation,
  normalizeRoutineLifecycleRecord,
  normalizeRoutineTimeline,
} from '../data/routineTaskLifecycle.js';
import {
  normalizeRoutineDeliveryComparison,
  normalizeRoutineDeliverySummary,
} from '../data/routineDelivery.js';

function result(ok, fields = {}) { return { ok, ...fields }; }
function compact(payload) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

async function context() {
  if (!isSupabaseConfigured || !supabaseAuthClient) {
    return result(false, { mode: 'not_configured', message: 'Routine lifecycle is not configured.' });
  }
  const session = await getCurrentSession().catch(() => null);
  if (!session?.user?.id) return result(false, { mode: 'auth_required', message: 'Sign in again to continue.' });
  return result(true, { mode: 'authenticated' });
}

function failure(error) {
  const raw = String(error?.message || 'The routine lifecycle request failed.');
  const fields = /routine_task_too_early/i.test(raw)
    ? { mode: 'too_early', message: 'This task is not available yet.' }
    : /routine_task_hidden/i.test(raw)
      ? { mode: 'hidden', message: 'This task is still hidden.' }
      : /routine_task_condition_pending/i.test(raw)
        ? { mode: 'condition_pending', message: 'This task is waiting for a server condition.' }
        : /timing_snapshot_(invalid|not_ready)|routine_task_timing_unavailable/i.test(raw)
          ? { mode: 'timing_invalid', message: 'Authoritative timing is unavailable or invalid.' }
          : /stale|revision|changed elsewhere|refresh/i.test(raw)
    ? { mode: 'stale_write', message: 'This routine changed elsewhere. Refresh before retrying.' }
    : /jwt expired|invalid jwt|not authenticated|auth session/i.test(raw)
      ? { mode: 'auth_required', message: 'Your sign-in expired. Sign in again.' }
      : /row-level security|permission denied|required.*authority|required.*access|participant/i.test(raw)
        ? { mode: 'permission_denied', message: 'You do not have permission for this routine action.' }
        : /failed to fetch|network|timeout|connection/i.test(raw)
          ? { mode: 'network_error', message: 'The routine service could not be reached. Retry with the same idempotency key.' }
          : { mode: 'sync_error', message: raw };
  return result(false, { ...fields, error });
}

async function rpc(name, payload = {}, normalize = (value) => value) {
  const ctx = await context();
  if (!ctx.ok) return ctx;
  const { data, error } = await routineRpcClient.request(name, compact(payload));
  if (error) return failure(error);
  return result(true, { mode: 'authenticated', data: normalize(data) });
}

const mutation = (name, map) => async (payload) => rpc(name, map(payload));
const taskRevision = (payload) => ({
  input_task_id: payload.taskId,
  input_expected_revision: payload.expectedRevision,
  input_idempotency_key: payload.idempotencyKey,
});

export const startRoutineRun = mutation('start_routine_run', (p) => ({ input_run_id: p.runId, input_expected_revision: p.expectedRevision, input_idempotency_key: p.idempotencyKey }));
export const claimRoutineTask = mutation('claim_routine_task', taskRevision);
export const releaseRoutineTask = mutation('release_routine_task', taskRevision);
export const startRoutineTask = mutation('start_routine_task', taskRevision);
export const pauseRoutineTask = mutation('pause_routine_task', (p) => ({ ...taskRevision(p), input_reason: p.reason }));
export async function recordRoutineInitialAssessment(payload) {
  return rpc('record_routine_initial_assessment', {
    ...taskRevision(payload),
    input_assessment: payload.assessment,
    input_reason_code: payload.reasonCode,
    input_details: payload.details,
  }, (value) => ({
    ...value,
    comparison: normalizeRoutineDeliveryComparison(value?.comparison),
  }));
}
export const updateRoutineTaskItem = mutation('update_routine_task_item', (p) => ({ input_task_item_id: p.taskItemId, input_status: p.status, input_value_json: p.value || {}, input_result_code: p.resultCode, input_reason: p.reason, input_expected_revision: p.expectedRevision, input_idempotency_key: p.idempotencyKey }));
export const addRoutineTaskComment = mutation('add_routine_task_comment', (p) => ({ input_task_id: p.taskId, input_comment: p.comment, input_idempotency_key: p.idempotencyKey }));
export const blockRoutineTask = mutation('block_routine_task', (p) => ({ ...taskRevision(p), input_category: p.category, input_reason_code: p.reasonCode, input_details: p.details, input_severity: p.severity, input_due_at: p.dueAt }));
export const markRoutineTaskNotApplicable = mutation('mark_routine_task_not_applicable', (p) => ({ ...taskRevision(p), input_reason: p.reason }));
export const completeRoutineTask = mutation('complete_routine_task', (p) => ({ ...taskRevision(p), input_completion_note: p.completionNote, input_critical_confirmation: p.criticalConfirmation === true }));
export const reopenRoutineTask = mutation('reopen_routine_task', (p) => ({ ...taskRevision(p), input_reason: p.reason }));

export const createRoutineDeviation = mutation('create_routine_deviation', (p) => ({ input_task_id: p.taskId, input_task_item_id: p.taskItemId, input_source_type: p.sourceType, input_category: p.category, input_reason_code: p.reasonCode, input_details: p.details, input_severity: p.severity, input_assigned_participant_id: p.assignedParticipantId, input_due_at: p.dueAt, input_expected_task_revision: p.expectedTaskRevision, input_idempotency_key: p.idempotencyKey }));
const deviationAction = (name, noteKey, inputKey) => mutation(name, (p) => ({ input_deviation_id: p.deviationId, [inputKey]: p[noteKey], input_expected_revision: p.expectedRevision, input_idempotency_key: p.idempotencyKey }));
export const assignRoutineDeviation = mutation('assign_routine_deviation', (p) => ({ input_deviation_id: p.deviationId, input_participant_id: p.participantId, input_expected_revision: p.expectedRevision, input_idempotency_key: p.idempotencyKey }));
export const mitigateRoutineDeviation = deviationAction('mitigate_routine_deviation', 'note', 'input_note');
export const resolveRoutineDeviation = deviationAction('resolve_routine_deviation', 'resolutionNote', 'input_resolution_note');
export const cancelRoutineDeviation = deviationAction('cancel_routine_deviation', 'reason', 'input_reason');

export const createRoutineManagerOverride = mutation('create_routine_manager_override', (p) => ({ input_run_id: p.runId, input_task_id: p.taskId, input_task_item_id: p.taskItemId, input_deviation_id: p.deviationId, input_override_type: p.overrideType, input_reason: p.reason, input_remaining_risk: p.remainingRisk, input_temporary_measure: p.temporaryMeasure, input_follow_up_owner_participant_id: p.followUpOwnerParticipantId, input_follow_up_due_at: p.followUpDueAt, input_expires_at: p.expiresAt, input_supersedes_override_id: p.supersedesOverrideId, input_expected_run_revision: p.expectedRunRevision, input_idempotency_key: p.idempotencyKey }));
export const verifyRoutineTask = mutation('verify_routine_task', (p) => ({ input_task_id: p.taskId, input_result: p.result, input_note: p.note, input_physical_recheck_confirmed: p.physicalRecheckConfirmed === true, input_expected_task_revision: p.expectedTaskRevision, input_idempotency_key: p.idempotencyKey }));
export const requestRoutineRunFinalVerification = mutation('request_routine_run_final_verification', (p) => ({ input_run_id: p.runId, input_expected_revision: p.expectedRevision, input_idempotency_key: p.idempotencyKey }));
export const completeRoutineRunVerification = mutation('complete_routine_run_verification', (p) => ({ input_run_id: p.runId, input_verification_type: p.verificationType, input_items: p.items || [], input_result: p.result, input_note: p.note, input_expected_run_revision: p.expectedRunRevision, input_idempotency_key: p.idempotencyKey }));

export const createOrGetRoutineHandover = mutation('create_or_get_routine_handover', (p) => ({ input_from_run_id: p.fromRunId, input_handover_type: p.handoverType, input_to_run_id: p.toRunId, input_external_target_type: p.externalTargetType, input_external_target_id: p.externalTargetId, input_idempotency_key: p.idempotencyKey }));
export const replaceRoutineHandoverDraft = mutation('replace_routine_handover_draft', (p) => ({ input_handover_id: p.handoverId, input_summary: p.summary, input_manual_items: p.manualItems || [], input_expected_revision: p.expectedRevision, input_idempotency_key: p.idempotencyKey }));
export const refreshRoutineHandoverGeneratedItems = mutation('refresh_routine_handover_generated_items', (p) => ({ input_handover_id: p.handoverId, input_expected_revision: p.expectedRevision, input_idempotency_key: p.idempotencyKey }));
export const submitRoutineHandover = mutation('submit_routine_handover', (p) => ({ input_handover_id: p.handoverId, input_expected_revision: p.expectedRevision, input_idempotency_key: p.idempotencyKey }));
export const acceptRoutineHandover = mutation('accept_routine_handover', (p) => ({ input_handover_id: p.handoverId, input_expected_revision: p.expectedRevision, input_idempotency_key: p.idempotencyKey }));

export const proposeRoutineTransfer = mutation('propose_routine_transfer', (p) => ({ input_task_id: p.taskId, input_scope_key: p.scopeKey || 'default', input_target_type: p.targetType, input_target_run_id: p.targetRunId, input_target_participant_id: p.targetParticipantId, input_target_event_id: p.targetEventId, input_reason: p.reason, input_due_at: p.dueAt, input_expected_task_revision: p.expectedTaskRevision, input_idempotency_key: p.idempotencyKey }));
const transferAction = (name, noteKey, inputKey) => mutation(name, (p) => ({ input_transfer_id: p.transferId, ...(inputKey ? { [inputKey]: p[noteKey] } : {}), input_expected_revision: p.expectedRevision, input_idempotency_key: p.idempotencyKey }));
export const acceptRoutineTransfer = transferAction('accept_routine_transfer');
export const rejectRoutineTransfer = transferAction('reject_routine_transfer', 'reason', 'input_reason');
export const completeRoutineTransfer = transferAction('complete_routine_transfer', 'note', 'input_note');
export const cancelRoutineTransfer = transferAction('cancel_routine_transfer', 'reason', 'input_reason');

export async function validateRoutineRunCompletion(runId) {
  return rpc('validate_routine_run_completion', { input_run_id: runId }, normalizeRoutineCompletionValidation);
}
export async function finishRoutineRun(payload) {
  return rpc('finish_routine_run', {
    input_run_id: payload.runId,
    input_expected_run_revision: payload.expectedRevision,
    input_idempotency_key: payload.idempotencyKey,
  }, (value) => ({
    ...value,
    delivery: normalizeRoutineDeliverySummary(value?.delivery),
  }));
}
export const reopenRoutineRun = mutation('reopen_routine_run', (p) => ({ input_run_id: p.runId, input_reason: p.reason, input_expected_run_revision: p.expectedRevision, input_idempotency_key: p.idempotencyKey }));
export const cancelRoutineRun = mutation('cancel_routine_run', (p) => ({ input_run_id: p.runId, input_reason: p.reason, input_expected_run_revision: p.expectedRevision, input_idempotency_key: p.idempotencyKey }));
export const recordRoutineHistoryCorrection = mutation('record_routine_history_correction', (p) => ({ input_run_id: p.runId, input_entity_type: p.entityType, input_entity_id: p.entityId, input_field_or_claim: p.fieldOrClaim, input_original_value: p.originalValue, input_corrected_value: p.correctedValue, input_reason: p.reason, input_idempotency_key: p.idempotencyKey }));

export async function getRoutineRunTimeline(runId) {
  return rpc('get_routine_run_timeline', { input_run_id: runId }, normalizeRoutineTimeline);
}
export async function getRoutineTaskTimeline(taskId) {
  return rpc('get_routine_task_timeline', { input_task_id: taskId }, normalizeRoutineTimeline);
}

export function normalizeLifecycleMutationResource(value) {
  return normalizeRoutineLifecycleRecord(value || {});
}
