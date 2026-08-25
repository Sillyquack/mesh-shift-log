import {
  getCurrentSession,
  isSupabaseAuthConfigured,
  supabaseAuthClient,
} from './supabaseAuthClient.js';
import {
  INVENTORY_REFERENCE_LOCATION_CODES,
  buildInventoryDefaultRecords,
} from '../data/inventoryDefaults.js';

export const INVENTORY_REFERENCE_BUCKET = 'inventory-location-reference-images';
export const INVENTORY_REFERENCE_MAX_BYTES = 5 * 1024 * 1024;
export const INVENTORY_REFERENCE_IMAGE_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const extensionByMimeType = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
});

function unavailable(message = 'Inventory Defaults backend is not configured.') {
  return { ok: false, mode: 'backend_unavailable', message, records: buildInventoryDefaultRecords() };
}

function failed(error, fallbackMessage) {
  return {
    ok: false,
    mode: 'sync_error',
    message: error?.message || fallbackMessage,
    error,
    records: buildInventoryDefaultRecords(),
  };
}

function normalizeLocation(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    code: String(row.code || '').toUpperCase(),
    locationType: row.location_type,
    active: row.active,
    countable: row.countable,
    metadata: row.metadata || {},
  };
}

function normalizeGuidance(row) {
  return {
    id: row.id || '',
    locationId: row.location_id,
    objectPath: row.object_path || '',
    caption: row.caption || '',
    mimeType: row.mime_type || '',
    byteSize: Number(row.byte_size || 0),
    originalFileName: row.original_file_name || '',
    revision: Number(row.revision || 0),
    updatedAt: row.updated_at || '',
    imageUrl: row.imageUrl || row.image_url || '',
    imageError: row.imageError || '',
  };
}

function normalizeTemplate(row) {
  return {
    id: row.id || '',
    locationId: row.location_id,
    templateStatus: row.template_status || 'incomplete',
    verifiedAt: row.verified_at || '',
    verifiedByName: row.verified_by_name || '',
    updatedAt: row.updated_at || '',
  };
}

function normalizeProduct(row) {
  return {
    id: row.id || '',
    locationId: row.location_id,
    productId: row.product_id,
    parQuantity: row.par_quantity,
    defaultRestockQuantity: row.default_restock_quantity,
    active: row.active,
  };
}

async function signedGuidance(client, guidance) {
  if (!guidance.objectPath) return guidance;
  const { data, error } = await client.storage
    .from(INVENTORY_REFERENCE_BUCKET)
    .createSignedUrl(guidance.objectPath, 60 * 60);
  return {
    ...guidance,
    imageUrl: data?.signedUrl || '',
    imageError: error?.message || '',
  };
}

export function validateInventoryReferenceFile(file) {
  if (!file) return { ok: false, message: 'Choose or take a reference photo first.' };
  if (!INVENTORY_REFERENCE_IMAGE_TYPES.includes(file.type)) {
    return { ok: false, message: 'Use a JPEG, PNG, or WebP image.' };
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { ok: false, message: 'The selected image is empty or unreadable.' };
  }
  if (file.size > INVENTORY_REFERENCE_MAX_BYTES) {
    return { ok: false, message: 'The selected image must be 5 MB or smaller.' };
  }
  return { ok: true, message: '' };
}

export function buildInventoryReferencePath(location, file, { uuid = '' } = {}) {
  const validation = validateInventoryReferenceFile(file);
  if (!validation.ok) throw new Error(validation.message);
  if (!location?.organizationId || !location?.id) {
    throw new Error('An active inventory location is required.');
  }
  const cryptoApi = globalThis.crypto;
  const objectId = uuid
    || (typeof cryptoApi?.randomUUID === 'function' ? cryptoApi.randomUUID() : '');
  if (!objectId) throw new Error('Secure image identifier generation is unavailable.');
  return `${location.organizationId}/${location.id}/${objectId}.${extensionByMimeType[file.type]}`;
}

export async function fetchInventoryDefaultsWithClient(client) {
  const { data: locationData, error: locationError } = await client
    .from('inventory_locations')
    .select('id, organization_id, name, code, location_type, active, countable, metadata')
    .in('code', INVENTORY_REFERENCE_LOCATION_CODES)
    .eq('active', true)
    .order('sort_order', { ascending: true });
  if (locationError) return failed(locationError, 'Could not load inventory locations.');

  const locations = (locationData || []).map(normalizeLocation);
  const locationIds = locations.map((location) => location.id);
  if (locationIds.length === 0) {
    return { ok: true, mode: 'backend', message: 'No active inventory locations found.', records: buildInventoryDefaultRecords() };
  }

  const [guidanceResult, templatesResult, productsResult] = await Promise.all([
    client.from('inventory_location_reference_guidance')
      .select('id, location_id, object_path, caption, mime_type, byte_size, original_file_name, revision, updated_at')
      .in('location_id', locationIds),
    client.from('inventory_refrigerator_templates')
      .select('id, location_id, template_status, verified_at, verified_by_name, updated_at')
      .in('location_id', locationIds),
    client.from('inventory_location_products')
      .select('id, location_id, product_id, par_quantity, default_restock_quantity, active')
      .in('location_id', locationIds)
      .eq('active', true),
  ]);
  const queryError = guidanceResult.error || templatesResult.error || productsResult.error;
  if (queryError) return failed(queryError, 'Could not load inventory default state.');

  const guidanceRows = await Promise.all(
    (guidanceResult.data || []).map(normalizeGuidance).map(
      (guidance) => signedGuidance(client, guidance),
    ),
  );
  const records = buildInventoryDefaultRecords({
    locations,
    guidanceRows,
    templateRows: (templatesResult.data || []).map(normalizeTemplate),
    productRows: (productsResult.data || []).map(normalizeProduct),
  });
  return { ok: true, mode: 'backend', message: 'Inventory Defaults loaded.', records };
}

export async function fetchInventoryDefaults() {
  if (!isSupabaseAuthConfigured || !supabaseAuthClient) return unavailable();
  const session = await getCurrentSession();
  if (!session?.user?.id) return unavailable('Email login is required to load Inventory Defaults.');
  return fetchInventoryDefaultsWithClient(supabaseAuthClient);
}

export async function publishInventoryReferenceWithClient({
  client,
  location,
  file,
  caption = '',
  expectedRevision = 0,
  pathOptions = {},
}) {
  const validation = validateInventoryReferenceFile(file);
  if (!validation.ok) return failed(new Error(validation.message), validation.message);
  let objectPath;
  try {
    objectPath = buildInventoryReferencePath(location, file, pathOptions);
  } catch (error) {
    return failed(error, 'Could not prepare the reference image path.');
  }

  const bucket = client.storage.from(INVENTORY_REFERENCE_BUCKET);
  const { error: uploadError } = await bucket.upload(objectPath, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) return failed(uploadError, 'Reference image upload failed.');

  const { data, error } = await client.rpc('set_inventory_location_reference_guidance', {
    input_location_id: location.id,
    input_object_path: objectPath,
    input_caption: caption.trim() || null,
    input_mime_type: file.type,
    input_byte_size: file.size,
    input_original_file_name: file.name,
    input_expected_revision: expectedRevision,
  });
  if (error) {
    const cleanup = await bucket.remove([objectPath]);
    if (cleanup.error) {
      await client.rpc('queue_inventory_reference_cleanup_path', {
        input_location_id: location.id,
        input_object_path: objectPath,
        input_reason: 'failed_upload_cleanup',
      });
    }
    return failed(error, 'Reference image publication failed.');
  }

  const row = Array.isArray(data) ? data[0] : data;
  const guidance = normalizeGuidance(row || {});
  if (row?.cleanup_path) {
    const cleanup = await bucket.remove([row.cleanup_path]);
    if (!cleanup.error) {
      await client.rpc('acknowledge_inventory_reference_cleanup', {
        input_object_path: row.cleanup_path,
      });
    }
  }
  const signed = await signedGuidance(client, guidance);
  return {
    ok: true,
    mode: signed.imageUrl ? 'backend' : 'backend_partial',
    message: signed.imageUrl
      ? 'Reference photo saved.'
      : 'Reference photo saved, but its private preview is temporarily unavailable.',
    guidance: signed,
  };
}

export async function publishInventoryReference(input) {
  if (!isSupabaseAuthConfigured || !supabaseAuthClient) return unavailable();
  const session = await getCurrentSession();
  if (!session?.user?.id) return unavailable('Email login with manager access is required to save reference photos.');
  return publishInventoryReferenceWithClient({ client: supabaseAuthClient, ...input });
}

export async function verifyInventoryRefrigeratorTemplate(locationId) {
  if (!isSupabaseAuthConfigured || !supabaseAuthClient) return unavailable();
  const session = await getCurrentSession();
  if (!session?.user?.id) return unavailable('Email login with manager access is required to verify a template.');
  const { data, error } = await supabaseAuthClient.rpc(
    'verify_inventory_refrigerator_template',
    { input_location_id: locationId },
  );
  if (error) return failed(error, 'Refrigerator template verification failed.');
  return { ok: true, mode: 'backend', message: 'Refrigerator template manager-verified.', template: normalizeTemplate(data) };
}
