import {
  getCurrentSession,
  isSupabaseAuthConfigured,
  supabaseAuthClient,
} from './supabaseAuthClient.js';
import {
  normalizeVisualStandardRow,
  normalizeVisualStandardVersionRow,
  publishVisualStandardWithClient,
  resolveVisualStandardSignedUrlWithClient,
  validateVisualStandardFile,
} from './visualStandards.js';

function unavailableResult(message = 'Visual Standards backend is not configured.') {
  return {
    ok: false,
    mode: 'backend_unavailable',
    message,
    record: null,
    records: [],
  };
}

function errorResult(error, fallbackMessage, details = {}) {
  return {
    ok: false,
    mode: 'sync_error',
    message: error?.message || fallbackMessage,
    error,
    record: null,
    records: [],
    ...details,
  };
}

function rpcRecord(data) {
  const row = Array.isArray(data) ? data[0] : data;
  return normalizeVisualStandardRow(row);
}

async function requireAuthenticatedSession() {
  if (!isSupabaseAuthConfigured || !supabaseAuthClient) return null;
  const session = await getCurrentSession();
  return session?.user?.id ? session : null;
}

async function withActiveSignedUrl(record, { forceRefresh = false } = {}) {
  if (!record?.activeAssetPath || record.status !== 'published') return record;
  const delivery = await resolveVisualStandardSignedUrlWithClient({
    client: supabaseAuthClient,
    canonicalKey: record.canonicalKey,
    activeVersionId: record.activeVersionId,
    forceRefresh,
  });
  return {
    ...record,
    signedUrl: delivery.signedUrl || '',
    signedUrlExpiresAt: delivery.expiresAt || '',
    signedDeliveryError: delivery.ok ? '' : delivery.message,
  };
}

export async function fetchVisualStandards() {
  if (!isSupabaseAuthConfigured || !supabaseAuthClient) {
    return unavailableResult();
  }

  const { data, error } = await supabaseAuthClient
    .from('visual_standards')
    .select('id, canonical_key, area, section, label, active_asset_path, active_version_id, active_version, status, notes, updated_at, updated_by, updated_by_name')
    .order('area', { ascending: true })
    .order('section', { ascending: true });

  if (error) {
    return errorResult(error, 'Could not load live Visual Standards.');
  }

  const records = await Promise.all(
    (data || [])
      .map(normalizeVisualStandardRow)
      .filter(Boolean)
      .map((record) => withActiveSignedUrl(record)),
  );
  const failedDeliveries = records.filter(
    (record) => record.activeAssetPath && !record.signedUrl,
  );

  return {
    ok: true,
    mode: failedDeliveries.length ? 'backend_partial' : 'backend',
    message: failedDeliveries.length
      ? 'Visual Standard metadata loaded; some private images are using fallbacks.'
      : 'Visual Standards loaded.',
    record: null,
    records,
    deliveryErrors: failedDeliveries.map((record) => ({
      canonicalKey: record.canonicalKey,
      message: record.signedDeliveryError,
    })),
  };
}

export async function fetchVisualStandardVersions(canonicalKey) {
  const session = await requireAuthenticatedSession();
  if (!session) {
    return unavailableResult('Email login is required to view Visual Standard history.');
  }

  const { data, error } = await supabaseAuthClient
    .from('visual_standard_versions')
    .select('id, visual_standard_id, canonical_key, version, asset_path, mime_type, byte_size, notes, created_at, created_by, created_by_name, restored_from_version_id')
    .eq('canonical_key', canonicalKey)
    .order('version', { ascending: false });

  if (error) {
    return errorResult(error, 'Could not load Visual Standard history.');
  }

  const records = await Promise.all(
    (data || [])
      .map(normalizeVisualStandardVersionRow)
      .filter(Boolean)
      .map(async (record) => {
        const delivery = await resolveVisualStandardSignedUrlWithClient({
          client: supabaseAuthClient,
          canonicalKey: record.canonicalKey,
          versionId: record.id,
        });
        return {
          ...record,
          signedUrl: delivery.signedUrl || '',
          signedUrlExpiresAt: delivery.expiresAt || '',
          signedDeliveryError: delivery.ok ? '' : delivery.message,
        };
      }),
  );
  const failedDeliveries = records.filter((record) => !record.signedUrl);

  return {
    ok: true,
    mode: failedDeliveries.length ? 'backend_partial' : 'backend',
    message: failedDeliveries.length
      ? 'Visual Standard history loaded; some private previews are unavailable.'
      : 'Visual Standard history loaded.',
    record: null,
    records,
  };
}

export async function publishVisualStandard({ canonicalKey, file, notes = '' }) {
  const validation = validateVisualStandardFile(file);
  if (!validation.ok) return unavailableResult(validation.message);

  const session = await requireAuthenticatedSession();
  if (!session) {
    return unavailableResult('Email login with manager access is required to publish.');
  }

  const result = await publishVisualStandardWithClient({
    client: supabaseAuthClient,
    canonicalKey,
    file,
    notes,
  });
  if (!result.ok) return result;
  const record = await withActiveSignedUrl(result.record, { forceRefresh: true });
  return {
    ...result,
    record,
    records: [record],
    deliveryError: record.signedDeliveryError || '',
    message: record.signedUrl
      ? result.message
      : 'Visual Standard published, but its private image could not be refreshed yet.',
  };
}

export async function restoreVisualStandardVersion({
  canonicalKey,
  versionId,
  notes = '',
}) {
  const session = await requireAuthenticatedSession();
  if (!session) {
    return unavailableResult('Email login with manager access is required to restore a version.');
  }

  const { data, error } = await supabaseAuthClient.rpc(
    'restore_visual_standard_version',
    {
      input_canonical_key: canonicalKey,
      input_version_id: versionId,
      input_notes: notes.trim() || null,
    },
  );

  if (error) {
    return errorResult(error, 'Restore failed. The current standard is unchanged.');
  }

  const record = rpcRecord(data);
  if (!record) {
    return errorResult(
      new Error('The database did not confirm the restored version.'),
      'Restore could not be confirmed.',
    );
  }

  const signedRecord = await withActiveSignedUrl(record, { forceRefresh: true });
  return {
    ok: true,
    mode: 'backend',
    message: signedRecord.signedUrl
      ? 'Previous image restored as a new active version.'
      : 'Previous image restored, but its private image could not be refreshed yet.',
    record: signedRecord,
    records: [signedRecord],
    deliveryError: signedRecord.signedDeliveryError || '',
  };
}
