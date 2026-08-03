export const INVENTORY_REFERENCE_BUCKET = 'inventory-location-reference-images';
export const INVENTORY_REFERENCE_MAX_BYTES = 5 * 1024 * 1024;
export const INVENTORY_REFERENCE_MIME_TYPES = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
});

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateInventoryReferenceFile(file) {
  if (!file) return { ok: false, message: 'Choose an image to upload.' };
  if (!Object.hasOwn(INVENTORY_REFERENCE_MIME_TYPES, file.type)) {
    return { ok: false, message: 'Use a JPEG, PNG, or WebP image.' };
  }
  if (!Number.isInteger(file.size) || file.size <= 0 || file.size > INVENTORY_REFERENCE_MAX_BYTES) {
    return { ok: false, message: 'The reference image must be no larger than 5 MB.' };
  }
  return { ok: true, extension: INVENTORY_REFERENCE_MIME_TYPES[file.type] };
}

export async function validateInventoryReferenceFileContent(file) {
  const validation = validateInventoryReferenceFile(file);
  if (!validation.ok) return validation;
  let bytes;
  try {
    bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  } catch {
    return { ok: false, message: 'The reference image could not be inspected safely.' };
  }
  const matches = file.type === 'image/jpeg'
    ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : file.type === 'image/png'
      ? bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)
      : bytes.length >= 12
        && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
        && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  return matches
    ? validation
    : { ok: false, message: 'The file contents do not match its declared JPEG, PNG, or WebP type.' };
}

export function createInventoryReferenceObjectPath({ organizationId, locationId, mimeType, objectId }) {
  const extension = INVENTORY_REFERENCE_MIME_TYPES[mimeType];
  if (!UUID_V4_PATTERN.test(organizationId || '') || !UUID_V4_PATTERN.test(locationId || '')
      || !UUID_V4_PATTERN.test(objectId || '') || !extension) {
    throw new Error('A collision-safe organization/location reference path could not be created.');
  }
  return `${organizationId}/${locationId}/${objectId}.${extension}`;
}

export function inventoryReferencePathIsScoped(path, organizationId, locationId) {
  if (!path || !UUID_V4_PATTERN.test(organizationId || '') || !UUID_V4_PATTERN.test(locationId || '')) return false;
  const [pathOrganizationId, pathLocationId, fileName, extra] = path.split('/');
  if (extra !== undefined || pathOrganizationId !== organizationId || pathLocationId !== locationId) return false;
  const [objectId, extension, extensionExtra] = String(fileName || '').split('.');
  return extensionExtra === undefined && UUID_V4_PATTERN.test(objectId)
    && ['jpg', 'jpeg', 'png', 'webp'].includes(String(extension || '').toLowerCase());
}

export function inventoryReferencePlaceholder(locationName, canManage) {
  return {
    title: 'No reference image',
    message: `${locationName || 'This location'} has no current setup image. Counts and targets are unaffected.`,
    action: canManage ? 'Add reference image' : '',
  };
}
