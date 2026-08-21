import {
  canonicalVisualStandards,
  getCanonicalVisualStandard,
  resolveCanonicalVisualStandardKey,
} from '../data/workbarVisualStandards.js';

export const VISUAL_STANDARDS_BUCKET = 'visual-standards';
export const VISUAL_STANDARD_MAX_FILE_BYTES = 15 * 1024 * 1024;
export const VISUAL_STANDARD_SIGNED_URL_REFRESH_BUFFER_MS = 5 * 60 * 1000;

const visualStandardSignedUrlCache = new Map();
const detailKeyPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
  const sourceCanonicalKey = row?.canonical_key || row?.canonicalKey;
  const canonicalKey = resolveCanonicalVisualStandardKey(sourceCanonicalKey);
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
    isVisible: row.is_visible ?? row.isVisible ?? true,
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
    assetRole: row.asset_role || row.assetRole || 'primary',
    detailKey: row.detail_key || row.detailKey || '',
    detailLabel: row.detail_label || row.detailLabel || '',
    detailOrder: Number(row.detail_order ?? row.detailOrder ?? 0),
    signedUrl: row.signed_url || row.signedUrl || '',
    signedUrlExpiresAt: row.signed_url_expires_at || row.signedUrlExpiresAt || '',
  };
}

export function normalizeVisualStandardDetailRow(row) {
  const sourceCanonicalKey = row?.canonical_key || row?.canonicalKey;
  const canonicalKey = resolveCanonicalVisualStandardKey(sourceCanonicalKey);
  const detailKey = row?.detail_key || row?.detailKey;
  if (!canonicalKey || !detailKey) return null;
  return {
    id: row.id || '',
    visualStandardId: row.visual_standard_id || row.visualStandardId || '',
    canonicalKey,
    detailKey,
    label: row.label || detailKey,
    order: Number(row.sort_order ?? row.order ?? 0),
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
  detailKey = '',
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

  const resolvedCanonicalKey = resolveCanonicalVisualStandardKey(canonicalKey);
  const cacheKey = versionId
    ? `history:${resolvedCanonicalKey}:${versionId}`
    : detailKey
      ? `detail:${resolvedCanonicalKey}:${detailKey}:${activeVersionId || 'current'}`
      : `active:${resolvedCanonicalKey}:${activeVersionId || 'current'}`;
  const cacheActiveDelivery = !versionId;
  if (forceRefresh && cacheActiveDelivery) visualStandardSignedUrlCache.delete(cacheKey);
  if (cacheActiveDelivery) {
    const cached = cachedSignedUrl(cacheKey, now);
    if (cached) return { ok: true, ...cached, fromCache: true };
  }

  const body = versionId
    ? { canonicalKey: resolvedCanonicalKey, versionId }
    : detailKey
      ? { canonicalKey: resolvedCanonicalKey, detailKey }
      : { canonicalKey: resolvedCanonicalKey };
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
  const resolvedCanonicalKey = resolveCanonicalVisualStandardKey(canonicalKey);
  const bundled = getCanonicalVisualStandard(resolvedCanonicalKey);
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

export function attachVisualStandardDetails(standards, backendDetailRows = []) {
  const detailsByKey = new Map();
  backendDetailRows
    .map(normalizeVisualStandardDetailRow)
    .filter(Boolean)
    .filter((detail) => detail.status === 'published' && detail.activeAssetPath && detail.signedUrl)
    .forEach((detail) => {
      const current = detailsByKey.get(detail.canonicalKey) || [];
      current.push({
        ...detail,
        src: detail.signedUrl,
        source: 'backend',
        sourceLabel: 'Published detail image',
      });
      detailsByKey.set(detail.canonicalKey, current);
    });

  return standards.map((standard) => ({
    ...standard,
    details: Object.freeze(
      (detailsByKey.get(standard.canonicalKey) || [])
        .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label)),
    ),
  }));
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
  pathOptions = {},
) {
  const resolvedCanonicalKey = resolveCanonicalVisualStandardKey(canonicalKey);
  if (!getCanonicalVisualStandard(resolvedCanonicalKey)) {
    throw new Error('Unknown canonical visual standard.');
  }
  const validation = validateVisualStandardFile(file);
  if (!validation.ok) throw new Error(validation.message);

  const now = pathOptions.now ?? Date.now();
  // Keep the receiver lookup inside the function body. An optional call in a
  // default parameter previously minified to an out-of-scope Safari receiver.
  const cryptoApi = globalThis.crypto;
  const uuid = pathOptions.uuid
    ?? (typeof cryptoApi?.randomUUID === 'function' ? cryptoApi.randomUUID() : '');
  if (!uuid) throw new Error('Secure asset identifier generation is unavailable.');

  const extension = imageExtensionByType[file.type];
  const detailKey = pathOptions.detailKey || '';
  if (detailKey && !detailKeyPattern.test(detailKey)) {
    throw new Error('A valid Visual Standard detail key is required.');
  }
  const namespace = detailKey
    ? `${resolvedCanonicalKey}/details/${detailKey}`
    : resolvedCanonicalKey;
  return `${namespace}/${now}-${uuid}.${extension}`;
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

function publicationDetailRecord(data) {
  const row = Array.isArray(data) ? data[0] : data;
  return normalizeVisualStandardDetailRow(row);
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
        input_canonical_key: resolveCanonicalVisualStandardKey(canonicalKey),
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

export async function publishVisualStandardAndResolveWithClient(input) {
  const result = await publishVisualStandardWithClient(input);
  if (!result.ok) return result;
  const delivery = await resolveVisualStandardSignedUrlWithClient({
    client: input.client,
    canonicalKey: result.record.canonicalKey,
    activeVersionId: result.record.activeVersionId,
    forceRefresh: true,
  });
  const record = {
    ...result.record,
    signedUrl: delivery.signedUrl || '',
    signedUrlExpiresAt: delivery.expiresAt || '',
    signedDeliveryError: delivery.ok ? '' : delivery.message,
  };
  return {
    ...result,
    record,
    records: [record],
    deliveryError: record.signedDeliveryError,
    message: record.signedUrl
      ? result.message
      : 'Visual Standard published, but its private image could not be refreshed yet.',
  };
}

export async function publishVisualStandardDetailWithClient({
  client,
  canonicalKey,
  detailKey,
  label,
  order,
  file,
  notes = '',
  pathOptions = {},
}) {
  const validation = validateVisualStandardFile(file);
  if (!validation.ok) {
    return publicationError(new Error(validation.message), validation.message);
  }
  if (!detailKeyPattern.test(detailKey || '')) {
    return publicationError(
      new Error('A valid Visual Standard detail key is required.'),
      'A valid Visual Standard detail key is required.',
    );
  }
  if (!label?.trim() || !Number.isInteger(order) || order < 0) {
    return publicationError(
      new Error('A detail label and non-negative order are required.'),
      'A detail label and non-negative order are required.',
    );
  }

  let assetPath = '';
  let uploadCompleted = false;
  try {
    assetPath = buildVisualStandardAssetPath(canonicalKey, file, {
      ...pathOptions,
      detailKey,
    });
    const bucket = client.storage.from(VISUAL_STANDARDS_BUCKET);
    const { error: uploadError } = await bucket.upload(assetPath, file, {
      cacheControl: '31536000',
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) {
      return publicationError(
        uploadError,
        'Detail image upload failed. The current detail is unchanged.',
      );
    }
    uploadCompleted = true;

    const { data, error: publishError } = await client.rpc(
      'publish_visual_standard_detail',
      {
        input_canonical_key: resolveCanonicalVisualStandardKey(canonicalKey),
        input_detail_key: detailKey,
        input_label: label.trim(),
        input_sort_order: order,
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
        'Publishing the detail failed. The current detail is unchanged.',
        { cleanupError: cleanupError || null, uploadedAssetPath: assetPath },
      );
    }

    const record = publicationDetailRecord(data);
    if (!record || record.activeAssetPath !== assetPath) {
      return publicationError(
        new Error('The database did not confirm the published detail asset.'),
        'Publishing the detail could not be confirmed.',
        { publicationCommitted: Boolean(record), uploadedAssetPath: assetPath },
      );
    }
    return {
      ok: true,
      mode: 'backend',
      message: 'Visual Standard detail published.',
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
      'Publishing the detail failed. The current detail is unchanged.',
      { cleanupError, uploadedAssetPath: assetPath },
    );
  }
}

export async function publishVisualStandardDetailAndResolveWithClient(input) {
  const result = await publishVisualStandardDetailWithClient(input);
  if (!result.ok) return result;
  const delivery = await resolveVisualStandardSignedUrlWithClient({
    client: input.client,
    canonicalKey: result.record.canonicalKey,
    detailKey: result.record.detailKey,
    activeVersionId: result.record.activeVersionId,
    forceRefresh: true,
  });
  const record = {
    ...result.record,
    signedUrl: delivery.signedUrl || '',
    signedUrlExpiresAt: delivery.expiresAt || '',
    signedDeliveryError: delivery.ok ? '' : delivery.message,
  };
  return {
    ...result,
    record,
    records: [record],
    deliveryError: record.signedDeliveryError,
    message: record.signedUrl
      ? result.message
      : 'Visual Standard detail published, but its private image could not be refreshed yet.',
  };
}
