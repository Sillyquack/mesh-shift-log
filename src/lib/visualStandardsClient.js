import {
  getCurrentSession,
  isSupabaseAuthConfigured,
  supabaseAuthClient,
} from './supabaseAuthClient.js';
import {
  VISUAL_STANDARDS_BUCKET,
  normalizeVisualStandardRow,
  normalizeVisualStandardVersionRow,
  publishVisualStandardWithClient,
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

export function getVisualStandardPublicUrl(assetPath) {
  if (!assetPath || !supabaseAuthClient) return '';
  const { data } = supabaseAuthClient.storage
    .from(VISUAL_STANDARDS_BUCKET)
    .getPublicUrl(assetPath);
  return data?.publicUrl || '';
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

  return {
    ok: true,
    mode: 'backend',
    message: 'Visual Standards loaded.',
    record: null,
    records: (data || []).map(normalizeVisualStandardRow).filter(Boolean),
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

  return {
    ok: true,
    mode: 'backend',
    message: 'Visual Standard history loaded.',
    record: null,
    records: (data || [])
      .map(normalizeVisualStandardVersionRow)
      .filter(Boolean),
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
  return result.ok
    ? {
      ...result,
      publicUrl: getVisualStandardPublicUrl(result.record.activeAssetPath),
    }
    : result;
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

  return {
    ok: true,
    mode: 'backend',
    message: 'Previous image restored as a new active version.',
    record,
    records: [record],
    publicUrl: getVisualStandardPublicUrl(record.activeAssetPath),
  };
}
