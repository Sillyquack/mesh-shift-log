import { getCurrentSession, supabaseAuthClient } from '../../../lib/supabaseAuthClient.js';
import { isSupabaseConfigured } from '../../../lib/supabaseClient.js';
import { routineRpcClient } from './routineRpcClient.js';
import {
  normalizeRoutineReferenceAltText,
  normalizeRoutineReferenceCaption,
  ROUTINE_REFERENCE_BUCKET,
  validateRoutineReferenceFileContent,
} from '../data/routineReferenceImages.js';

function result(ok, fields = {}) {
  return { ok, ...fields };
}

async function context() {
  if (!isSupabaseConfigured || !supabaseAuthClient) {
    return result(false, { mode: 'not_configured', message: 'Routine reference images are not configured.' });
  }
  const session = await getCurrentSession().catch(() => null);
  if (!session?.user?.id) {
    return result(false, { mode: 'auth_required', message: 'Sign in again to manage routine reference images.' });
  }
  return result(true, { mode: 'authenticated' });
}

function failure(error, fallback = 'The routine reference image request failed.') {
  const rawMessage = String(error?.message || '');
  const fields = /stale|changed on another device|refresh before/i.test(rawMessage)
    ? { mode: 'stale_write', message: 'This routine reference changed elsewhere. Refresh before trying again.' }
    : /jwt expired|invalid jwt|not authenticated|auth session/i.test(rawMessage)
      ? { mode: 'auth_required', message: 'Your sign-in expired. Sign in again before retrying.' }
      : /row-level security|permission denied|manager.*required/i.test(rawMessage)
        ? { mode: 'permission_denied', message: 'You do not have permission for this routine reference action.' }
        : /failed to fetch|network|timeout|connection/i.test(rawMessage)
          ? { mode: 'network_error', message: 'The server could not be reached. The previous valid reference remains unchanged.' }
          : /mime|file|image|storage object|upload/i.test(rawMessage)
            ? { mode: 'file_error', message: rawMessage || fallback }
            : { mode: 'sync_error', message: rawMessage || fallback };
  return result(false, { ...fields, error });
}

function compact(payload) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

async function rpc(name, payload = {}) {
  const ctx = await context();
  if (!ctx.ok) return ctx;
  const { data, error } = await routineRpcClient.request(name, compact(payload));
  if (error) return failure(error);
  return result(true, { mode: 'authenticated', data });
}

export function createRoutineReferenceImage(payload) {
  return rpc('create_routine_reference', {
    input_reference_key: payload.referenceKey,
    input_label: payload.label,
    input_description: payload.description || null,
    input_placeholder_text: payload.placeholderText || null,
    input_idempotency_key: payload.idempotencyKey,
  });
}

export function updateRoutineReferenceImageMetadata(payload) {
  return rpc('update_routine_reference_metadata', {
    input_reference_id: payload.referenceId,
    input_label: payload.label,
    input_description: payload.description || null,
    input_placeholder_text: payload.placeholderText,
    input_expected_revision: payload.expectedRevision,
    input_idempotency_key: payload.idempotencyKey,
  });
}

export function setRoutineReferenceImageActive(payload) {
  return rpc('set_routine_reference_active', {
    input_reference_id: payload.referenceId,
    input_active: payload.active === true,
    input_expected_revision: payload.expectedRevision,
    input_idempotency_key: payload.idempotencyKey,
  });
}

export function prepareRoutineReferenceImageUpload(payload) {
  return rpc('prepare_routine_reference_upload', {
    input_reference_id: payload.referenceId,
    input_file_name: payload.fileName,
    input_mime_type: payload.mimeType,
    input_byte_size: payload.byteSize,
    input_caption: payload.caption || null,
    input_alt_text: payload.altText,
    input_expected_reference_revision: payload.expectedReferenceRevision,
    input_idempotency_key: payload.idempotencyKey,
  });
}

export function finalizeRoutineReferenceImageUpload(payload) {
  return rpc('finalize_routine_reference_upload', {
    input_image_version_id: payload.versionId,
    input_expected_reference_revision: payload.expectedReferenceRevision,
    input_expected_image_revision: payload.expectedImageRevision,
    input_idempotency_key: payload.idempotencyKey,
  });
}

export function cancelRoutineReferenceImageUpload(payload) {
  return rpc('cancel_routine_reference_upload', {
    input_image_version_id: payload.versionId,
    input_reason: payload.reason,
    input_expected_image_revision: payload.expectedImageRevision,
    input_idempotency_key: payload.idempotencyKey,
  });
}

export function setRoutineReferenceImagePlaceholder(payload) {
  return rpc('set_routine_reference_placeholder', {
    input_reference_id: payload.referenceId,
    input_placeholder_text: payload.placeholderText,
    input_expected_reference_revision: payload.expectedReferenceRevision,
    input_idempotency_key: payload.idempotencyKey,
  });
}

export function replaceRoutineDraftTaskReferenceImages(payload) {
  return rpc('replace_routine_draft_task_reference_images', {
    input_task_id: payload.taskId,
    input_references: payload.references,
    input_expected_version_revision: payload.expectedVersionRevision,
    input_idempotency_key: payload.idempotencyKey,
  });
}

export function listRoutineReferenceImageCleanup() {
  return rpc('list_routine_reference_cleanup_paths');
}

export function acknowledgeRoutineReferenceImageCleanup(objectPath) {
  return rpc('acknowledge_routine_reference_cleanup', { input_object_path: objectPath });
}

export async function downloadRoutineCurrentReferenceImage(objectPath) {
  const ctx = await context();
  if (!ctx.ok) return ctx;
  if (!objectPath) return result(false, { mode: 'file_error', message: 'No current routine reference image is available.' });
  const { data, error } = await supabaseAuthClient.storage
    .from(ROUTINE_REFERENCE_BUCKET)
    .download(objectPath);
  if (error) return failure(error, 'The current routine reference image could not be downloaded.');
  return result(true, { mode: 'authenticated', blob: data });
}

async function bestEffortCancelPreparedUpload(prepared, reason, idempotencyKey) {
  if (!prepared?.versionId || !prepared?.versionRevision) return null;
  return cancelRoutineReferenceImageUpload({
    versionId: prepared.versionId,
    reason,
    expectedImageRevision: prepared.versionRevision,
    idempotencyKey,
  });
}

export async function uploadRoutineReferenceImage({
  referenceId,
  expectedReferenceRevision,
  file,
  caption,
  altText,
  prepareIdempotencyKey,
  finalizeIdempotencyKey,
  cancelIdempotencyKey,
}) {
  const validation = await validateRoutineReferenceFileContent(file);
  if (!validation.ok) return result(false, { mode: 'validation_error', message: validation.message });
  let normalizedCaption;
  let normalizedAltText;
  try {
    normalizedCaption = normalizeRoutineReferenceCaption(caption);
    normalizedAltText = normalizeRoutineReferenceAltText(altText);
  } catch (error) {
    return result(false, { mode: 'validation_error', message: error.message });
  }
  const preparedResult = await prepareRoutineReferenceImageUpload({
    referenceId,
    fileName: file.name,
    mimeType: file.type,
    byteSize: file.size,
    caption: normalizedCaption,
    altText: normalizedAltText,
    expectedReferenceRevision,
    idempotencyKey: prepareIdempotencyKey,
  });
  if (!preparedResult.ok) return preparedResult;
  const prepared = preparedResult.data;
  if (prepared?.bucket !== ROUTINE_REFERENCE_BUCKET || !prepared?.objectPath || !prepared?.versionId) {
    return result(false, { mode: 'sync_error', message: 'The server returned an incomplete prepared upload. The previous valid reference remains unchanged.' });
  }
  const upload = await supabaseAuthClient.storage.from(ROUTINE_REFERENCE_BUCKET).upload(
    prepared.objectPath,
    file,
    { cacheControl: '3600', contentType: file.type, upsert: false },
  );
  if (upload.error) {
    await bestEffortCancelPreparedUpload(
      prepared,
      'Storage upload failed before finalization.',
      cancelIdempotencyKey,
    );
    return failure(upload.error, 'The new image was not uploaded. The previous valid reference remains unchanged.');
  }
  const finalized = await finalizeRoutineReferenceImageUpload({
    versionId: prepared.versionId,
    expectedReferenceRevision: prepared.referenceRevision,
    expectedImageRevision: prepared.versionRevision,
    idempotencyKey: finalizeIdempotencyKey,
  });
  if (!finalized.ok) {
    await bestEffortCancelPreparedUpload(
      prepared,
      'Upload finalization failed; queue the unreferenced object for cleanup.',
      cancelIdempotencyKey,
    );
    return { ...finalized, message: `${finalized.message} The previous valid reference remains available.` };
  }
  return { ...finalized, message: 'Routine reference image finalized.' };
}

export async function cleanupRoutineReferenceImages() {
  const pending = await listRoutineReferenceImageCleanup();
  if (!pending.ok) return pending;
  const entries = Array.isArray(pending.data) ? pending.data : [];
  const outcomes = [];
  for (const entry of entries) {
    const removed = await supabaseAuthClient.storage
      .from(ROUTINE_REFERENCE_BUCKET)
      .remove([entry.objectPath]);
    if (removed.error) {
      outcomes.push({ id: entry.id, ok: false, error: removed.error });
      continue;
    }
    const acknowledged = await acknowledgeRoutineReferenceImageCleanup(entry.objectPath);
    outcomes.push({ id: entry.id, ok: acknowledged.ok, error: acknowledged.error });
  }
  return result(true, {
    mode: 'authenticated',
    cleaned: outcomes.filter((entry) => entry.ok).length,
    pending: outcomes.filter((entry) => !entry.ok).length,
    outcomes,
  });
}
