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
  resolveAllVisualStandards,
  resolveVisualStandard,
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

  const all = resolveAllVisualStandards(
    [{ ...backend, canonicalKey: fridgeKey, activeAssetPath: backend.active_asset_path }],
    (path) => `https://assets.test/${path}`,
  );
  assert.equal(all.find((item) => item.canonicalKey === fridgeKey).source, 'backend');
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
