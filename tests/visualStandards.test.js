import test from 'node:test';
import assert from 'node:assert/strict';
import { build as buildWithEsbuild } from 'esbuild';
import {
  CANONICAL_VISUAL_STANDARD_KEYS,
  LEGACY_SELF_SERVICE_VISUAL_STANDARD_KEYS,
  SELF_SERVICE_VISUAL_STANDARD_KEYS,
  VISUAL_STANDARD_KEY_ALIASES,
  WORKBAR_VISUAL_STANDARD_KEYS,
  canonicalVisualStandards,
} from '../src/data/workbarVisualStandards.js';
import {
  attachVisualStandardDetails,
  buildVisualStandardAssetPath,
  clearVisualStandardSignedUrlCache,
  publishVisualStandardAndResolveWithClient,
  publishVisualStandardDetailWithClient,
  publishVisualStandardWithClient,
  resolveAllVisualStandards,
  resolveVisualStandard,
  resolveVisualStandardSignedUrlWithClient,
  validateVisualStandardFile,
} from '../src/lib/visualStandards.js';
import { canManageVisualStandards } from '../src/lib/permissions.js';

test('canonical registry contains exactly nine visible Self-Service standards and two Workbar standards', () => {
  const requiredKeys = [
    ...Object.values(WORKBAR_VISUAL_STANDARD_KEYS),
    ...Object.values(SELF_SERVICE_VISUAL_STANDARD_KEYS),
  ];

  assert.equal(Object.values(SELF_SERVICE_VISUAL_STANDARD_KEYS).length, 9);
  assert.equal(requiredKeys.length, 11);
  assert.equal(canonicalVisualStandards.length, 11);
  assert.deepEqual(new Set(CANONICAL_VISUAL_STANDARD_KEYS), new Set(requiredKeys));
  assert.equal(new Set(CANONICAL_VISUAL_STANDARD_KEYS).size, 11);
  assert.equal(
    canonicalVisualStandards.filter((standard) => standard.area === 'Self-Service Station').length,
    9,
  );
  Object.values(LEGACY_SELF_SERVICE_VISUAL_STANDARD_KEYS).forEach((legacyKey) => {
    assert.equal(CANONICAL_VISUAL_STANDARD_KEYS.includes(legacyKey), false);
    assert.ok(VISUAL_STANDARD_KEY_ALIASES[legacyKey]);
  });
});

test('legacy Self-Service aliases resolve to one visible replacement without duplicate cards', () => {
  Object.entries(VISUAL_STANDARD_KEY_ALIASES).forEach(([legacyKey, canonicalKey]) => {
    assert.equal(resolveVisualStandard(legacyKey).canonicalKey, canonicalKey);
  });
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
    SELF_SERVICE_VISUAL_STANDARD_KEYS.COFFEE_RETAIL_FILTER,
    file,
    { now: 1234, uuid: 'test-uuid' },
  );
  assert.equal(
    path,
    'self-service-coffee-retail-filter-standard/1234-test-uuid.jpg',
  );

  const detailPath = buildVisualStandardAssetPath(
    SELF_SERVICE_VISUAL_STANDARD_KEYS.BACKSTOCK,
    file,
    { now: 1234, uuid: 'detail-test', detailKey: 'cabinet-2' },
  );
  assert.equal(
    detailPath,
    'self-service-backstock-standard/details/cabinet-2/1234-detail-test.jpg',
  );
});

test('production-minified asset path generation never references an undefined UUID receiver', async () => {
  const build = await buildWithEsbuild({
    entryPoints: ['src/lib/visualStandards.js'],
    absWorkingDir: process.cwd(),
    bundle: true,
    format: 'esm',
    minify: true,
    platform: 'browser',
    write: false,
  });
  const bundledSource = build.outputFiles[0].text;
  const bundledModule = await import(
    `data:text/javascript;base64,${Buffer.from(bundledSource).toString('base64')}`
  );

  const path = bundledModule.buildVisualStandardAssetPath(
    SELF_SERVICE_VISUAL_STANDARD_KEYS.OVERVIEW,
    { name: 'iphone-camera.jpeg', type: 'image/jpeg', size: 2048 },
  );

  assert.match(
    path,
    /^self-service-station-overview-standard\/\d+-[0-9a-f-]+\.jpg$/i,
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
    async upload(path, file) {
      events.push(['upload', path, file]);
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
      if (name === 'publish_visual_standard_detail') {
        return {
          error: publishError,
          data: publishError
            ? null
            : {
              visual_standard_id: 'standard-1',
              canonical_key: input.input_canonical_key,
              detail_key: input.input_detail_key,
              label: input.input_label,
              sort_order: input.input_sort_order,
              active_asset_path: input.input_asset_path,
              active_version_id: 'detail-version-1',
              active_version: 2,
              status: 'published',
            },
        };
      }
      return {
        error: publishError,
        data: publishError
          ? null
          : {
            canonical_key: input.input_canonical_key,
            active_asset_path: input.input_asset_path,
            active_version_id: 'primary-version-1',
            active_version: 1,
            status: 'published',
          },
      };
    },
    functions: {
      async invoke(name, options) {
        events.push(['invoke', name, options.body]);
        return {
          data: {
            ok: true,
            signedUrl: 'https://assets.test/signed/active.jpg',
            expiresAt: new Date(Date.now() + (60 * 60 * 1000)).toISOString(),
          },
          error: null,
        };
      },
    },
  };
}

test('publication uploads first and activates only after confirmed RPC readback', async () => {
  const client = publicationClient();
  const selectedFile = { name: 'standard.jpg', type: 'image/jpeg', size: 2048 };
  const result = await publishVisualStandardWithClient({
    client,
    canonicalKey: WORKBAR_VISUAL_STANDARD_KEYS.BAR_MILK_FRIDGE,
    file: selectedFile,
    pathOptions: { now: 1234, uuid: 'publish-test' },
  });

  assert.equal(result.ok, true);
  assert.equal(result.record.activeVersion, 1);
  assert.deepEqual(client.events.map(([event]) => event), ['upload', 'rpc']);
  assert.equal(client.events[0][2], selectedFile);
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

test('full successful Save readback refreshes signed delivery and updates the active resolver record', async () => {
  clearVisualStandardSignedUrlCache();
  const client = publicationClient();
  const selectedFile = { name: 'iphone-camera.jpg', type: 'image/jpeg', size: 2048 };
  const prior = resolveAllVisualStandards([]);
  const result = await publishVisualStandardAndResolveWithClient({
    client,
    canonicalKey: SELF_SERVICE_VISUAL_STANDARD_KEYS.OVERVIEW,
    file: selectedFile,
    pathOptions: { now: 1234, uuid: 'iphone-save' },
  });
  const next = resolveAllVisualStandards([result.record]);
  const active = next.find(
    (standard) => standard.canonicalKey === SELF_SERVICE_VISUAL_STANDARD_KEYS.OVERVIEW,
  );

  assert.equal(result.ok, true);
  assert.equal(result.record.signedUrl, 'https://assets.test/signed/active.jpg');
  assert.equal(active.source, 'backend');
  assert.equal(active.src, result.record.signedUrl);
  assert.equal(
    prior.find((standard) => standard.canonicalKey === active.canonicalKey).source,
    'placeholder',
  );
  assert.deepEqual(client.events.map(([event]) => event), ['upload', 'rpc', 'invoke']);
});

test('optional ordered detail publication preserves primary behavior and attaches only published details', async () => {
  const client = publicationClient();
  const result = await publishVisualStandardDetailWithClient({
    client,
    canonicalKey: SELF_SERVICE_VISUAL_STANDARD_KEYS.BACKSTOCK,
    detailKey: 'cabinet-2',
    label: 'Cabinet 2',
    order: 2,
    file: { name: 'cabinet-2.jpg', type: 'image/jpeg', size: 2048 },
    pathOptions: { now: 1234, uuid: 'cabinet-2' },
  });

  assert.equal(result.ok, true);
  assert.match(result.record.activeAssetPath, /\/details\/cabinet-2\//);
  const standards = attachVisualStandardDetails(resolveAllVisualStandards([]), [{
    ...result.record,
    signedUrl: 'https://assets.test/cabinet-2.jpg',
  }]);
  const backstock = standards.find(
    (standard) => standard.canonicalKey === SELF_SERVICE_VISUAL_STANDARD_KEYS.BACKSTOCK,
  );
  assert.equal(backstock.source, 'placeholder');
  assert.equal(backstock.details.length, 1);
  assert.equal(backstock.details[0].label, 'Cabinet 2');
});
