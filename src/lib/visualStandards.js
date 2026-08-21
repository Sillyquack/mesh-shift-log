import {
  canonicalVisualStandards,
  getCanonicalVisualStandard,
} from '../data/workbarVisualStandards.js';

export const VISUAL_STANDARDS_BUCKET = 'visual-standards';
export const VISUAL_STANDARD_MAX_FILE_BYTES = 15 * 1024 * 1024;

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
  };
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

export function resolveAllVisualStandards(backendRows = [], publicUrlForPath = () => '') {
  const backendByKey = new Map(
    backendRows
      .map(normalizeVisualStandardRow)
      .filter(Boolean)
      .map((row) => [row.canonicalKey, row]),
  );

  return canonicalVisualStandards.map((standard) => {
    const backend = backendByKey.get(standard.id) || null;
    const url = backend?.activeAssetPath
      ? publicUrlForPath(backend.activeAssetPath)
      : '';
    return resolveVisualStandard(standard.id, backend, url);
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
