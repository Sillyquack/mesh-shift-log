import { getCurrentSession, supabaseAuthClient } from '../../../lib/supabaseAuthClient.js';
import { isSupabaseConfigured } from '../../../lib/supabaseClient.js';
import { routineRpcClient } from './routineRpcClient.js';
import {
  normalizeRoutineDoubleShiftFeed,
  normalizeRoutineDoubleShiftParticipant,
  normalizeRoutineDoubleShiftWorkspace,
  normalizeRoutineEventTransferEvidence,
} from '../data/routineDoubleShift.js';

function result(ok, fields = {}) { return { ok, ...fields }; }
function compact(payload) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

async function context() {
  if (!isSupabaseConfigured || !supabaseAuthClient) {
    return result(false, { mode: 'not_configured', message: 'Double Shift is not configured.' });
  }
  const session = await getCurrentSession().catch(() => null);
  if (!session?.user?.id) {
    return result(false, { mode: 'auth_required', message: 'Sign in again to access Double Shift.' });
  }
  return result(true, { mode: 'authenticated' });
}

export function normalizeRoutineDoubleShiftFailure(error) {
  const raw = String(error?.message || 'The Double Shift request failed.');
  const fields = /double_shift_changes_updated/i.test(raw)
    ? { mode: 'change_feed_updated', message: 'The between-shift change feed changed. Review the latest version.' }
    : /stale|revision|refresh before|40001/i.test(raw)
      ? { mode: 'stale_write', message: 'Double Shift changed elsewhere. Refresh before retrying with a new action.' }
      : /event.*authority|event operations authority|event.*access is denied/i.test(raw)
        ? { mode: 'event_authority_required', message: 'Current Event Operations authority is required.' }
        : /row-level security|permission denied|required.*authority|access is denied|42501/i.test(raw)
          ? { mode: 'permission_denied', message: 'You do not have permission for this Double Shift action.' }
          : /jwt expired|invalid jwt|not authenticated|auth session/i.test(raw)
            ? { mode: 'auth_required', message: 'Your sign-in expired. Sign in again.' }
            : /failed to fetch|network|timeout|connection/i.test(raw)
              ? { mode: 'network_error', message: 'Double Shift could not be reached. Retry with the same idempotency key.' }
              : { mode: 'sync_error', message: raw };
  return result(false, { ...fields, error });
}

async function rpc(name, payload = {}, normalize = (value) => value) {
  const ctx = await context();
  if (!ctx.ok) return ctx;
  const { data, error } = await routineRpcClient.request(name, compact(payload));
  if (error) return normalizeRoutineDoubleShiftFailure(error);
  return result(true, { mode: 'authenticated', data: normalize(data) });
}

export function createOrGetDoubleShiftBundle(payload) {
  return rpc('create_or_get_double_shift_bundle', {
    input_opening_routine_key: payload.openingRoutineKey,
    input_closing_routine_key: payload.closingRoutineKey,
    input_scope_key: payload.scopeKey || 'default',
    input_operational_date: payload.operationalDate ?? null,
    input_idempotency_key: payload.idempotencyKey,
  }, (value) => ({ ...value, workspace: value?.workspace
    ? normalizeRoutineDoubleShiftWorkspace(value.workspace) : undefined }));
}

export function confirmDoubleShiftPlan(payload) {
  return rpc('confirm_double_shift_plan', {
    input_bundle_id: payload.bundleId,
    input_bundle_participant_id: payload.bundleParticipantId,
    input_expected_return_local_time: payload.expectedReturnLocalTime ?? null,
    input_expected_bundle_revision: payload.expectedBundleRevision,
    input_expected_participant_revision: payload.expectedParticipantRevision,
    input_idempotency_key: payload.idempotencyKey,
  });
}

export function completeDoubleShiftOpeningTransition(payload) {
  return rpc('complete_double_shift_opening_transition', {
    input_bundle_id: payload.bundleId,
    input_bundle_participant_id: payload.bundleParticipantId,
    input_transition_status: payload.transitionStatus,
    input_expected_return_local_time: payload.expectedReturnLocalTime ?? null,
    input_interim_owner_profile_id: payload.interimOwnerProfileId ?? null,
    input_note: payload.note ?? null,
    input_expected_bundle_revision: payload.expectedBundleRevision,
    input_expected_participant_revision: payload.expectedParticipantRevision,
    input_idempotency_key: payload.idempotencyKey,
  });
}

export function getDoubleShiftChangeFeed(payload) {
  return rpc('get_double_shift_change_feed', {
    input_bundle_id: payload.bundleId,
    input_bundle_participant_id: payload.bundleParticipantId,
  }, normalizeRoutineDoubleShiftFeed);
}

export function returnToDoubleShift(payload) {
  return rpc('return_to_double_shift', {
    input_bundle_id: payload.bundleId,
    input_bundle_participant_id: payload.bundleParticipantId,
    input_expected_change_feed_hash: payload.expectedChangeFeedHash,
    input_expected_bundle_revision: payload.expectedBundleRevision,
    input_expected_participant_revision: payload.expectedParticipantRevision,
    input_idempotency_key: payload.idempotencyKey,
  });
}

export function reassignDoubleShiftClosing(payload) {
  return rpc('reassign_double_shift_closing', {
    input_bundle_id: payload.bundleId,
    input_from_bundle_participant_id: payload.fromBundleParticipantId,
    input_to_user_profile_id: payload.toUserProfileId,
    input_reason: payload.reason,
    input_expected_bundle_revision: payload.expectedBundleRevision,
    input_idempotency_key: payload.idempotencyKey,
  });
}

export function refreshRoutineExternalContext(payload) {
  return rpc('refresh_routine_run_external_context', {
    input_run_id: payload.runId,
    input_idempotency_key: payload.idempotencyKey,
  });
}

export function getRoutineEventTransferWorkspace(transferId) {
  return rpc('get_routine_event_transfer_workspace', {
    input_transfer_id: transferId,
  }, normalizeRoutineEventTransferEvidence);
}

export function acceptRoutineEventTransfer(payload) {
  return rpc('accept_routine_event_transfer', {
    input_transfer_id: payload.transferId,
    input_expected_transfer_revision: payload.expectedTransferRevision,
    input_idempotency_key: payload.idempotencyKey,
  });
}

export function rejectRoutineEventTransfer(payload) {
  return rpc('reject_routine_event_transfer', {
    input_transfer_id: payload.transferId,
    input_reason: payload.reason,
    input_expected_transfer_revision: payload.expectedTransferRevision,
    input_idempotency_key: payload.idempotencyKey,
  });
}

export function completeRoutineEventTransfer(payload) {
  return rpc('complete_routine_event_transfer', {
    input_transfer_id: payload.transferId,
    input_result_code: payload.resultCode,
    input_evidence: payload.evidence,
    input_physical_check_confirmed: payload.physicalCheckConfirmed,
    input_critical_confirmation: payload.criticalConfirmation,
    input_completion_note: payload.completionNote ?? null,
    input_expected_transfer_revision: payload.expectedTransferRevision,
    input_idempotency_key: payload.idempotencyKey,
  });
}

export function getDoubleShiftWorkspace(bundleId) {
  return rpc('get_double_shift_workspace', { input_bundle_id: bundleId },
    normalizeRoutineDoubleShiftWorkspace);
}

export function listDoubleShiftBundlesForDate(operationalDate = null) {
  return rpc('list_double_shift_bundles_for_date', {
    input_operational_date: operationalDate,
  }, (value) => (Array.isArray(value) ? value : []));
}

export function getDoubleShiftParticipantSummary(bundleParticipantId) {
  return rpc('get_double_shift_participant_summary', {
    input_bundle_participant_id: bundleParticipantId,
  }, (value) => ({ ...value, participant: normalizeRoutineDoubleShiftParticipant(value?.participant) }));
}

export function verifyDoubleShiftBundle(bundleId) {
  return rpc('verify_double_shift_bundle', { input_bundle_id: bundleId });
}
