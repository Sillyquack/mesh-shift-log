import {
  canonicalVisualStandards,
  getCanonicalVisualStandard,
} from '../data/workbarVisualStandards.js';

export const VISUAL_STANDARDS_BUCKET = 'visual-standards';
export const VISUAL_STANDARD_MAX_FILE_BYTES = 15 * 1024 * 1024;
export const VISUAL_STANDARD_SIGNED_URL_REFRESH_BUFFER_MS = 5 * 60 * 1000;

const visualStandardSignedUrlCache = new Map();

export const VISUAL_STANDARD_IMAGE_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

const imageExtensionByType = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
});

export function normalizeVisualStandardRow(row) {
  const canonicalKey = row?.canonical_key || row?.canonicalKey;
  if (!canonicalKey) return null;
  return {
    id: row.id || '',
    canonicalKey,
    area: row.area || '',
    section: row.section || '',
    label: row.label || row.canonical_key,
    activeAssetPath: row.active_asset_path || row.activeAssetPath || '',
    activeVersionId: row.active_version_id || row.activeVersionId || '',
    activeVersion: Number(row.active_version || row.activeVersion || 0),
    status: row.status || 'awaiting_asset',
    notes: row.notes || '',
    updatedAt: row.updated_at || row.updatedAt || '',
    updatedBy: row.updated_by || row.updatedBy || '',
    updatedByName: row.updated_by_name || row.updatedByName || '',
    signedUrl: row.signed_url || row.signedUrl || '',
    signedUrlExpiresAt: row.signed_url_expires_at || row.signedUrlExpiresAt || '',
  };
}

export function normalizeVisualStandardVersionRow(row) {
  if (!row?.id) return null;
  return {
    id: row.id,
    visualStandardId: row.visual_standard_id || '',
    canonicalKey: row.canonical_key || '',
    version: Number(row.version || 0),
    assetPath: row.asset_path || '',
    mimeType: row.mime_type || '',
    byteSize: Number(row.byte_size || 0),
    notes: row.notes || '',
    createdAt: row.created_at || '',
    createdBy: row.created_by || '',
    createdByName: row.created_by_name || '',
    restoredFromVersionId: row.restored_from_version_id || '',
    signedUrl: row.signed_url || row.signedUrl || '',
    signedUrlExpiresAt: row.signed_url_expires_at || row.signedUrlExpiresAt || '',
  };
}

export function clearVisualStandardSignedUrlCache() {
  visualStandardSignedUrlCache.clear();
}

function cachedSignedUrl(cacheKey, now) {
  const cached = visualStandardSignedUrlCache.get(cacheKey);
  if (!cached) return null;
  const expiresAt = new Date(cached.expiresAt).getTime();
  if (
    !Number.isFinite(expiresAt)
    || expiresAt <= now + VISUAL_STANDARD_SIGNED_URL_REFRESH_BUFFER_MS
  ) {
    visualStandardSignedUrlCache.delete(cacheKey);
    return null;
  }
  return cached;
}

export async function resolveVisualStandardSignedUrlWithClient({
  client,
  canonicalKey,
  versionId = '',
  activeVersionId = '',
  forceRefresh = false,
  now = Date.now(),
}) {
  if (!client?.functions?.invoke || !getCanonicalVisualStandard(canonicalKey)) {
    return {
      ok: false,
      message: 'Visual Standard signed delivery is unavailable.',
      signedUrl: '',
      expiresAt: '',
    };
  }

  const cacheKey = versionId
    ? `history:${canonicalKey}:${versionId}`
    : `active:${canonicalKey}:${activeVersionId || 'current'}`;
  const cacheActiveDelivery = !versionId;
  if (forceRefresh && cacheActiveDelivery) visualStandardSignedUrlCache.delete(cacheKey);
  if (cacheActiveDelivery) {
    const cached = cachedSignedUrl(cacheKey, now);
    if (cached) return { ok: true, ...cached, fromCache: true };
  }

  const body = versionId ? { canonicalKey, versionId } : { canonicalKey };
  const { data, error } = await client.functions.invoke('visual-standard-image', { body });
  const signedUrl = data?.signedUrl || '';
  const expiresAt = data?.expiresAt || '';
  const expiresAtMs = new Date(expiresAt).getTime();
  if (
    error
    || data?.ok !== true
    || !signedUrl
    || !Number.isFinite(expiresAtMs)
    || expiresAtMs <= now
  ) {
    return {
      ok: false,
      message: data?.error || error?.message || 'Could not authorize the Visual Standard image.',
      error: error || null,
      signedUrl: '',
      expiresAt: '',
    };
  }

  const resolved = { signedUrl, expiresAt };
  if (cacheActiveDelivery) visualStandardSignedUrlCache.set(cacheKey, resolved);
  return { ok: true, ...resolved, fromCache: false };
}

export function resolveVisualStandard(
  canonicalKey,
  backendRecord = null,
  backendAssetUrl = '',
) {
  const bundled = getCanonicalVisualStandard(canonicalKey);
  if (!bundled) return null;

  const backend = normalizeVisualStandardRow(backendRecord) || backendRecord;
  const hasBackendAsset = Boolean(backend?.activeAssetPath && backendAssetUrl);
  const hasBundledFallback = Boolean(bundled.bundledFallbackSrc || bundled.src);
  const source = hasBackendAsset
    ? 'backend'
    : hasBundledFallback
      ? 'bundled'
      : 'placeholder';

  return {
    ...bundled,
    canonicalKey: bundled.id,
    area: backend?.area || bundled.area,
    section: backend?.section || bundled.section,
    label: backend?.label || bundled.label,
    src: hasBackendAsset
      ? backendAssetUrl
      : bundled.bundledFallbackSrc || bundled.src || '',
    source,
    sourceLabel:
      source === 'backend'
        ? 'Live backend asset'
        : source === 'bundled'
          ? 'Bundled fallback'
          : 'Awaiting approved photo',
    activeAssetPath: backend?.activeAssetPath || '',
    activeVersionId: backend?.activeVersionId || '',
    activeVersion: backend?.activeVersion || 0,
    updatedAt: backend?.updatedAt || '',
    updatedBy: backend?.updatedBy || '',
    updatedByName: backend?.updatedByName || '',
    notes: backend?.notes || '',
    status: source === 'backend' ? 'published' : bundled.status,
  };
}

export function resolveAllVisualStandards(backendRows = []) {
  const backendByKey = new Map(
    backendRows
      .map(normalizeVisualStandardRow)
      .filter(Boolean)
      .map((row) => [row.canonicalKey, row]),
  );

  return canonicalVisualStandards.map((standard) => {
    const backend = backendByKey.get(standard.id) || null;
    return resolveVisualStandard(standard.id, backend, backend?.signedUrl || '');
  });
}

export function validateVisualStandardFile(file) {
  if (!file) {
    return { ok: false, message: 'Choose or take a photo first.' };
  }
  if (!VISUAL_STANDARD_IMAGE_TYPES.includes(file.type)) {
    return {
      ok: false,
      message: 'Use a JPEG, PNG, WebP, GIF or AVIF image.',
    };
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { ok: false, message: 'The selected image is empty or unreadable.' };
  }
  if (file.size > VISUAL_STANDARD_MAX_FILE_BYTES) {
    return { ok: false, message: 'The selected image must be 15 MB or smaller.' };
  }
  return { ok: true, message: '' };
}

export function buildVisualStandardAssetPath(
  canonicalKey,
  file,
  { now = Date.now(), uuid = globalThis.crypto?.randomUUID?.() } = {},
) {
  if (!getCanonicalVisualStandard(canonicalKey)) {
    throw new Error('Unknown canonical visual standard.');
  }
  const validation = validateVisualStandardFile(file);
  if (!validation.ok) throw new Error(validation.message);
  if (!uuid) throw new Error('Secure asset identifier generation is unavailable.');

  const extension = imageExtensionByType[file.type];
  return `${canonicalKey}/${now}-${uuid}.${extension}`;
}

function publicationError(error, fallbackMessage, details = {}) {
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

function publicationRecord(data) {
  const row = Array.isArray(data) ? data[0] : data;
  return normalizeVisualStandardRow(row);
}

export async function publishVisualStandardWithClient({
  client,
  canonicalKey,
  file,
  notes = '',
  pathOptions,
}) {
  const validation = validateVisualStandardFile(file);
  if (!validation.ok) {
    return publicationError(new Error(validation.message), validation.message);
  }

  let assetPath = '';
  let uploadCompleted = false;
  try {
    assetPath = buildVisualStandardAssetPath(canonicalKey, file, pathOptions);
    const bucket = client.storage.from(VISUAL_STANDARDS_BUCKET);
    const { error: uploadError } = await bucket.upload(assetPath, file, {
      cacheControl: '31536000',
      contentType: file.type,
      upsert: false,
    });

    if (uploadError) {
      return publicationError(
        uploadError,
        'Image upload failed. The current standard is unchanged.',
      );
    }
    uploadCompleted = true;

    const { data, error: publishError } = await client.rpc(
      'publish_visual_standard',
      {
        input_canonical_key: canonicalKey,
        input_asset_path: assetPath,
        input_mime_type: file.type,
        input_byte_size: file.size,
        input_notes: notes.trim() || null,
      },
    );

    if (publishError) {
      const { error: cleanupError } = await bucket.remove([assetPath]);
      return publicationError(
        publishError,
        'Publishing failed. The current standard is unchanged.',
        {
          cleanupError: cleanupError || null,
          uploadedAssetPath: assetPath,
        },
      );
    }

    const record = publicationRecord(data);
    if (!record || record.activeAssetPath !== assetPath) {
      return publicationError(
        new Error('The database did not confirm the published asset.'),
        'Publishing could not be confirmed.',
        { publicationCommitted: Boolean(record), uploadedAssetPath: assetPath },
      );
    }

    return {
      ok: true,
      mode: 'backend',
      message: 'Visual Standard published.',
      record,
      records: [record],
      uploadedAssetPath: assetPath,
    };
  } catch (error) {
    let cleanupError = null;
    if (uploadCompleted && assetPath) {
      try {
        const cleanup = await client.storage
          .from(VISUAL_STANDARDS_BUCKET)
          .remove([assetPath]);
        cleanupError = cleanup.error || null;
      } catch (cleanupFailure) {
        cleanupError = cleanupFailure;
      }
    }
    return publicationError(
      error,
      'Publishing failed. The current standard is unchanged.',
      { cleanupError, uploadedAssetPath: assetPath },
    );
  }
}
