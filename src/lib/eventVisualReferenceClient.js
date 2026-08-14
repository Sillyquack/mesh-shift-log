import { getCurrentSession, supabaseAuthClient } from './supabaseAuthClient.js';
import { isSupabaseConfigured } from './supabaseClient.js';
import { routineRpcClient } from '../features/routines-v2/api/routineRpcClient.js';
import { ROUTINE_REFERENCE_BUCKET } from '../features/routines-v2/data/routineReferenceImages.js';

function result(ok, fields = {}) {
  return { ok, ...fields };
}

function uniqueReferenceKeys(referenceKeys = []) {
  return [...new Set(
    referenceKeys
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )].slice(0, 100);
}

async function authenticatedContext() {
  if (!isSupabaseConfigured || !supabaseAuthClient) {
    return result(false, {
      mode: 'not_configured',
      message: 'Visual standards are not configured in this environment.',
    });
  }
  const session = await getCurrentSession().catch(() => null);
  if (!session?.user?.id) {
    return result(false, {
      mode: 'auth_required',
      message: 'Sign in again to open visual standards.',
    });
  }
  return result(true, { mode: 'authenticated' });
}

function failure(error, fallback) {
  const rawMessage = String(error?.message || '');
  const fields = /jwt expired|invalid jwt|not authenticated|auth session/i.test(rawMessage)
    ? {
        mode: 'auth_required',
        message: 'Your sign-in expired. Sign in again before opening this guide.',
      }
    : /row-level security|permission denied|event visual-reference access/i.test(rawMessage)
      ? {
          mode: 'permission_denied',
          message: 'This visual standard is not available for your role.',
        }
      : /failed to fetch|network|timeout|connection/i.test(rawMessage)
        ? {
            mode: 'network_error',
            message: 'The image could not be reached. The written guide is still available.',
          }
        : {
            mode: 'sync_error',
            message: rawMessage || fallback,
          };
  return result(false, { ...fields, error });
}

export async function loadEventVisualReferences(referenceKeys = []) {
  const keys = uniqueReferenceKeys(referenceKeys);
  if (!keys.length) {
    return result(true, {
      mode: 'no_references',
      references: [],
      requestedCount: 0,
    });
  }
  const context = await authenticatedContext();
  if (!context.ok) return context;
  const { data, error } = await routineRpcClient.request(
    'get_event_visual_references',
    { input_reference_keys: keys },
  );
  if (error) {
    return failure(error, 'The visual-standard metadata could not be loaded.');
  }
  const references = Array.isArray(data)
    ? data
    : Array.isArray(data?.references)
      ? data.references
      : [];
  return result(true, {
    mode: 'authenticated',
    references,
    requestedCount: Number(data?.requestedCount ?? references.length),
  });
}

export async function downloadEventVisualReferenceImage(objectPath) {
  const context = await authenticatedContext();
  if (!context.ok) return context;
  const path = String(objectPath || '').trim();
  if (!path) {
    return result(false, {
      mode: 'not_available',
      message: 'This visual standard is still awaiting its permanent image.',
    });
  }
  const { data, error } = await supabaseAuthClient.storage
    .from(ROUTINE_REFERENCE_BUCKET)
    .download(path);
  if (error) {
    return failure(error, 'The current visual-standard image could not be opened.');
  }
  return result(true, {
    mode: 'authenticated',
    blob: data,
  });
}
