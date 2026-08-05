export const ROUTINE_REFERENCE_BUCKET = 'routine-reference-images';
export const ROUTINE_REFERENCE_MAX_BYTES = 5 * 1024 * 1024;
export const ROUTINE_REFERENCE_MIME_TYPES = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
});

const FILE_NAME_MAX_LENGTH = 255;
const CAPTION_MAX_LENGTH = 500;
const ALT_TEXT_MAX_LENGTH = 500;

export function normalizeRoutineReferenceFilename(fileName, mimeType) {
  const extension = ROUTINE_REFERENCE_MIME_TYPES[mimeType];
  if (!extension) return '';
  const base = String(fileName || '')
    .trim()
    .toLowerCase()
    .replace(/\.(?:jpe?g|png|webp)$/i, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'reference-image';
  return `${base}.${extension}`;
}

export function normalizeRoutineReferenceCaption(value) {
  const caption = String(value || '').trim();
  if (caption.length > CAPTION_MAX_LENGTH) {
    throw new Error(`Caption must be ${CAPTION_MAX_LENGTH} characters or fewer.`);
  }
  return caption;
}

export function normalizeRoutineReferenceAltText(value) {
  const altText = String(value || '').trim();
  if (!altText || altText.length > ALT_TEXT_MAX_LENGTH) {
    throw new Error(`Alt text is required and must be ${ALT_TEXT_MAX_LENGTH} characters or fewer.`);
  }
  return altText;
}

export function validateRoutineReferenceFile(file) {
  if (!file) return { ok: false, message: 'Choose an image to upload.' };
  const fileName = String(file.name || '').trim();
  if (!fileName || fileName.length > FILE_NAME_MAX_LENGTH) {
    return { ok: false, message: 'The image file name is missing or too long.' };
  }
  if (!Object.hasOwn(ROUTINE_REFERENCE_MIME_TYPES, file.type)) {
    return { ok: false, message: 'Use a JPEG, PNG, or WebP image.' };
  }
  if (!Number.isInteger(file.size) || file.size <= 0 || file.size > ROUTINE_REFERENCE_MAX_BYTES) {
    return { ok: false, message: 'The reference image must be no larger than 5 MB.' };
  }
  if (typeof file.slice !== 'function') {
    return { ok: false, message: 'The selected image cannot be inspected safely.' };
  }
  return {
    ok: true,
    extension: ROUTINE_REFERENCE_MIME_TYPES[file.type],
    normalizedFileName: normalizeRoutineReferenceFilename(fileName, file.type),
  };
}

export async function validateRoutineReferenceFileContent(file) {
  const validation = validateRoutineReferenceFile(file);
  if (!validation.ok) return validation;
  let bytes;
  try {
    bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  } catch {
    return { ok: false, message: 'The selected image could not be inspected safely.' };
  }
  const signatureMatches = file.type === 'image/jpeg'
    ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : file.type === 'image/png'
      ? bytes.length >= 8
        && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
          .every((value, index) => bytes[index] === value)
      : bytes.length >= 12
        && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
        && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  return signatureMatches
    ? validation
    : { ok: false, message: 'The file contents do not match its declared JPEG, PNG, or WebP type.' };
}
