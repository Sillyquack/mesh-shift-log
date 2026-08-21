import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_VISUAL_STANDARD_KEYS,
  SELF_SERVICE_VISUAL_STANDARD_KEYS,
  WORKBAR_VISUAL_STANDARD_KEYS,
  canonicalVisualStandards,
} from '../src/data/workbarVisualStandards.js';
import {
  buildVisualStandardAssetPath,
  clearVisualStandardSignedUrlCache,
  publishVisualStandardWithClient,
  resolveAllVisualStandards,
  resolveVisualStandard,
  resolveVisualStandardSignedUrlWithClient,
  validateVisualStandardFile,
} from '../src/lib/visualStandards.js';
import { canManageVisualStandards } from '../src/lib/permissions.js';

test('canonical registry contains the two fridge keys and eight Self-Service keys once', () => {
  const requiredKeys = [
    ...Object.values(WORKBAR_VISUAL_STANDARD_KEYS),
    ...Object.values(SELF_SERVICE_VISUAL_STANDARD_KEYS),
  ];

  assert.equal(requiredKeys.length, 10);
  assert.equal(canonicalVisualStandards.length, 10);
  assert.deepEqual(new Set(CANONICAL_VISUAL_STANDARD_KEYS), new Set(requiredKeys));
  assert.equal(new Set(CANONICAL_VISUAL_STANDARD_KEYS).size, 10);
});

test('resolver uses backend asset, then bundled fallback, then placeholder', () => {
  const fridgeKey = WORKBAR_VISUAL_STANDARD_KEYS.BAR_MILK_FRIDGE;
  const selfServiceKey = SELF_SERVICE_VISUAL_STANDARD_KEYS.OVERVIEW;

  assert.equal(resolveVisualStandard(fridgeKey).source, 'bundled');
  assert.equal(resolveVisualStandard(selfServiceKey).source, 'placeholder');

  const backend = {
    canonical_key: fridgeKey,
    active_asset_path: `${fridgeKey}/1-test.jpg`,
    active_version_id: 'version-1',
    active_version: 1,
    status: 'published',
    updated_at: '2026-08-21T08:00:00.000Z',
  };
  const resolved = resolveVisualStandard(fridgeKey, backend, 'https://assets.test/fridge.jpg');
  assert.equal(resolved.source, 'backend');
  assert.equal(resolved.src, 'https://assets.test/fridge.jpg');
  assert.equal(resolved.activeVersion, 1);

  const all = resolveAllVisualStandards([{
    ...backend,
    canonicalKey: fridgeKey,
    activeAssetPath: backend.active_asset_path,
    signedUrl: 'https://assets.test/signed/fridge.jpg',
  }]);
  assert.equal(all.find((item) => item.canonicalKey === fridgeKey).source, 'backend');
});

test('signed delivery uses canonical keys only and caches until near expiry', async () => {
  clearVisualStandardSignedUrlCache();
  const calls = [];
  const now = Date.parse('2026-08-21T10:00:00.000Z');
  let clock = now;
  const client = {
    functions: {
      async invoke(name, options) {
        calls.push([name, options.body]);
        return {
          data: {
            ok: true,
            signedUrl: 'https://assets.test/private-active',
            expiresAt: new Date(clock + (60 * 60 * 1000)).toISOString(),
          },
          error: null,
        };
      },
    },
  };
  const input = {
    client,
    canonicalKey: WORKBAR_VISUAL_STANDARD_KEYS.BAR_MILK_FRIDGE,
    activeVersionId: 'version-1',
    now,
  };

  const first = await resolveVisualStandardSignedUrlWithClient(input);
  const second = await resolveVisualStandardSignedUrlWithClient(input);
  clock = now + (56 * 60 * 1000);
  const nearExpiry = await resolveVisualStandardSignedUrlWithClient({
    ...input,
    now: clock,
  });

  assert.equal(first.ok, true);
  assert.equal(first.fromCache, false);
  assert.equal(second.fromCache, true);
  assert.equal(nearExpiry.fromCache, false);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], [
    'visual-standard-image',
    { canonicalKey: WORKBAR_VISUAL_STANDARD_KEYS.BAR_MILK_FRIDGE },
  ]);
});

test('manager history delivery sends a version id, never a Storage path or shared-role cache entry', async () => {
  clearVisualStandardSignedUrlCache();
  const calls = [];
  const now = Date.parse('2026-08-21T10:00:00.000Z');
  const client = {
    functions: {
      async invoke(name, options) {
        calls.push([name, options.body]);
        return {
          data: {
            ok: true,
            signedUrl: 'https://assets.test/private-history',
            expiresAt: new Date(now + (60 * 60 * 1000)).toISOString(),
          },
          error: null,
        };
      },
    },
  };

  const input = {
    client,
    canonicalKey: WORKBAR_VISUAL_STANDARD_KEYS.BAR_MILK_FRIDGE,
    versionId: '20000000-0000-4000-8000-000000000002',
    now,
  };
  await resolveVisualStandardSignedUrlWithClient(input);
  await resolveVisualStandardSignedUrlWithClient(input);

  assert.deepEqual(calls[0], [
    'visual-standard-image',
    {
      canonicalKey: WORKBAR_VISUAL_STANDARD_KEYS.BAR_MILK_FRIDGE,
      versionId: '20000000-0000-4000-8000-000000000002',
    },
  ]);
  assert.equal(Object.hasOwn(calls[0][1], 'assetPath'), false);
  assert.equal(calls.length, 2);
});

test('file validation and versioned logical paths are deterministic and safe', () => {
  const file = { name: 'station.jpeg', type: 'image/jpeg', size: 2048 };
  assert.equal(validateVisualStandardFile(file).ok, true);
  assert.equal(validateVisualStandardFile({ ...file, type: 'text/plain' }).ok, false);
  assert.equal(validateVisualStandardFile({ ...file, size: 16 * 1024 * 1024 }).ok, false);

  const path = buildVisualStandardAssetPath(
    SELF_SERVICE_VISUAL_STANDARD_KEYS.COFFEE_SERVICE,
    file,
    { now: 1234, uuid: 'test-uuid' },
  );
  assert.equal(
    path,
    'self-service-coffee-service-standard/1234-test-uuid.jpg',
  );
});

test('local UI write gate requires an authenticated manager', () => {
  assert.equal(canManageVisualStandards({ role: 'manager', loginSource: 'supabase_auth' }), true);
  assert.equal(canManageVisualStandards({ role: 'staff', loginSource: 'supabase_auth' }), false);
  assert.equal(canManageVisualStandards({ role: 'manager', loginSource: 'staff_code' }), false);
  assert.equal(
    canManageVisualStandards({ role: 'manager', loginSource: 'supabase_auth', isSharedDevice: true }),
    false,
  );
});

function publicationClient({ uploadError = null, publishError = null } = {}) {
  const events = [];
  const bucket = {
    async upload(path) {
      events.push(['upload', path]);
      return { error: uploadError };
    },
    async remove(paths) {
      events.push(['remove', paths]);
      return { error: null };
    },
  };
  return {
    events,
    storage: {
      from(name) {
        assert.equal(name, 'visual-standards');
        return bucket;
      },
    },
    async rpc(name, input) {
      events.push(['rpc', name]);
      return {
        error: publishError,
        data: publishError
          ? null
          : {
            canonical_key: input.input_canonical_key,
            active_asset_path: input.input_asset_path,
            active_version: 1,
            status: 'published',
          },
      };
    },
  };
}

test('publication uploads first and activates only after confirmed RPC readback', async () => {
  const client = publicationClient();
  const result = await publishVisualStandardWithClient({
    client,
    canonicalKey: WORKBAR_VISUAL_STANDARD_KEYS.BAR_MILK_FRIDGE,
    file: { name: 'standard.jpg', type: 'image/jpeg', size: 2048 },
    pathOptions: { now: 1234, uuid: 'publish-test' },
  });

  assert.equal(result.ok, true);
  assert.equal(result.record.activeVersion, 1);
  assert.deepEqual(client.events.map(([event]) => event), ['upload', 'rpc']);
});

test('failed upload never calls publication RPC', async () => {
  const client = publicationClient({ uploadError: new Error('upload unavailable') });
  const result = await publishVisualStandardWithClient({
    client,
    canonicalKey: WORKBAR_VISUAL_STANDARD_KEYS.BAR_MILK_FRIDGE,
    file: { name: 'standard.jpg', type: 'image/jpeg', size: 2048 },
    pathOptions: { now: 1234, uuid: 'upload-failure' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.record, null);
  assert.deepEqual(client.events.map(([event]) => event), ['upload']);
});

test('failed database publication cleans up the inactive uploaded object', async () => {
  const client = publicationClient({ publishError: new Error('transaction rejected') });
  const result = await publishVisualStandardWithClient({
    client,
    canonicalKey: WORKBAR_VISUAL_STANDARD_KEYS.BAR_MILK_FRIDGE,
    file: { name: 'standard.jpg', type: 'image/jpeg', size: 2048 },
    pathOptions: { now: 1234, uuid: 'publish-failure' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.record, null);
  assert.deepEqual(client.events.map(([event]) => event), ['upload', 'rpc', 'remove']);
});
