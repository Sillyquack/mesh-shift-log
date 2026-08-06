import { getCurrentSession, supabaseAuthClient } from '../../../lib/supabaseAuthClient.js';
import { isSupabaseConfigured } from '../../../lib/supabaseClient.js';
import { routineRpcClient } from './routineRpcClient.js';
import { ROUTINE_REFERENCE_BUCKET } from '../data/routineReferenceImages.js';
import { normalizeRoutineDeliveryWorkspace } from '../data/routineDelivery.js';
import {
  inspectRoutineSnapshotIntegrity,
  normalizeRoutineRunRecord,
  normalizeRoutineRunReferenceImage,
  normalizeRoutineRunWorkspace,
} from '../data/routineRunModel.js';

function result(ok, fields = {}) {
  return { ok, ...fields };
}

function compact(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  );
}

async function context() {
  if (!isSupabaseConfigured || !supabaseAuthClient) {
    return result(false, {
      mode: 'not_configured',
      message: 'Routine runs are not configured.',
    });
  }
  const session = await getCurrentSession().catch(() => null);
  if (!session?.user?.id) {
    return result(false, {
      mode: 'auth_required',
      message: 'Sign in again to access routine runs.',
    });
  }
  return result(true, { mode: 'authenticated' });
}

function failure(error, fallback = 'The routine run request failed.') {
  const rawMessage = String(error?.message || '');
  const fields = /stale|revision|changed elsewhere|refresh before/i.test(rawMessage)
    ? {
        mode: 'stale_write',
        message: 'This routine run changed elsewhere. Refresh before retrying.',
      }
    : /jwt expired|invalid jwt|not authenticated|auth session/i.test(rawMessage)
      ? {
          mode: 'auth_required',
          message: 'Your sign-in expired. Sign in again before retrying.',
        }
      : /row-level security|permission denied|coordinator permission|required routine access/i.test(rawMessage)
        ? {
            mode: 'permission_denied',
            message: 'You do not have permission for this routine run action.',
          }
        : /failed to fetch|network|timeout|connection/i.test(rawMessage)
          ? {
              mode: 'network_error',
              message: 'The routine service could not be reached.',
            }
          : { mode: 'sync_error', message: rawMessage || fallback };
  return result(false, { ...fields, error });
}

async function rpc(name, payload = {}) {
  const ctx = await context();
  if (!ctx.ok) return ctx;
  const { data, error } = await routineRpcClient.request(name, compact(payload));
  if (error) return failure(error);
  return result(true, { mode: 'authenticated', data });
}

export async function createOrGetRoutineRun(payload) {
  const response = await rpc('create_or_get_routine_run', {
    input_routine_key: payload.routineKey,
    input_scope_key: payload.scopeKey || 'default',
    input_operational_date: payload.operationalDate ?? null,
    input_idempotency_key: payload.idempotencyKey,
  });
  if (!response.ok) return response;
  return {
    ...response,
    data: {
      ...response.data,
      run: normalizeRoutineRunRecord(response.data?.run || {}),
    },
  };
}

export async function joinRoutineRun(payload) {
  const response = await rpc('join_routine_run', {
    input_run_id: payload.runId,
    input_idempotency_key: payload.idempotencyKey,
  });
  if (!response.ok) return response;
  return {
    ...response,
    data: {
      ...response.data,
      run: normalizeRoutineRunRecord(response.data?.run || {}),
    },
  };
}

export async function assignRoutineRunRole(payload) {
  const response = await rpc('assign_routine_run_role', {
    input_run_id: payload.runId,
    input_participant_id: payload.participantId,
    input_role_key: payload.roleKey,
    input_scope_key: payload.scopeKey || 'global',
    input_replacement_reason: payload.replacementReason || null,
    input_expected_run_revision: payload.expectedRunRevision,
    input_idempotency_key: payload.idempotencyKey,
  });
  if (!response.ok) return response;
  return {
    ...response,
    data: {
      ...response.data,
      run: normalizeRoutineRunRecord(response.data?.run || {}),
    },
  };
}

export async function verifyRoutineRunSnapshot(runId) {
  const response = await rpc('verify_routine_run_snapshot', {
    input_run_id: runId,
  });
  if (!response.ok) return response;
  return { ...response, data: inspectRoutineSnapshotIntegrity(response.data) };
}

export async function getRoutineRunWorkspace(runId) {
  const response = await rpc('get_routine_run_workspace', {
    input_run_id: runId,
  });
  if (!response.ok) return response;
  return {
    ...response,
    data: {
      ...normalizeRoutineRunWorkspace(response.data),
      ...normalizeRoutineDeliveryWorkspace(response.data),
    },
  };
}

export async function listRoutineRunsForDate(operationalDate) {
  const response = await rpc('list_routine_runs_for_date', {
    input_operational_date: operationalDate,
  });
  if (!response.ok) return response;
  return {
    ...response,
    data: Array.isArray(response.data)
      ? response.data.map(normalizeRoutineRunRecord)
      : [],
  };
}

export async function downloadRoutineRunSnapshotImage(imageRecord) {
  const ctx = await context();
  if (!ctx.ok) return ctx;
  const image = normalizeRoutineRunReferenceImage(imageRecord);
  if (image.imageState !== 'active_image' || !image.objectPath) {
    return result(false, {
      mode: 'file_error',
      message: 'This routine snapshot contains a placeholder, not an image object.',
    });
  }
  const { data, error } = await supabaseAuthClient.storage
    .from(ROUTINE_REFERENCE_BUCKET)
    .download(image.objectPath);
  if (error) {
    return failure(error, 'The exact routine snapshot image could not be downloaded.');
  }
  return result(true, {
    mode: 'authenticated',
    blob: data,
    referenceVersionId: image.referenceVersionId,
    objectPath: image.objectPath,
  });
}
