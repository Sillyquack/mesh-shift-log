import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VISUAL_STANDARD_SIGNED_URL_LIFETIME_SECONDS,
  createVisualStandardImageHandler,
  isCanonicalVisualStandardAssetPath,
} from '../supabase/functions/visual-standard-image/handler.js';

const PUBLIC_KEY = 'test-publishable-key';
const CANONICAL_KEY = 'workbar-bar-milk-fridge-standard';
const STANDARD_ID = '10000000-0000-4000-8000-000000000001';
const ACTIVE_VERSION_ID = '20000000-0000-4000-8000-000000000001';
const HISTORY_VERSION_ID = '20000000-0000-4000-8000-000000000002';
const ACTIVE_PATH = `${CANONICAL_KEY}/100-active.jpg`;
const HISTORY_PATH = `${CANONICAL_KEY}/50-history.jpg`;
const DETAIL_KEY = 'cabinet-1';
const DETAIL_VERSION_ID = '20000000-0000-4000-8000-000000000003';
const DETAIL_PATH = `${CANONICAL_KEY}/details/${DETAIL_KEY}/150-detail.jpg`;

function queryResult(result) {
  const query = {
    select() { return query; },
    eq() { return query; },
    maybeSingle() { return Promise.resolve(result); },
  };
  return query;
}

function createClients({
  profile = null,
  user = null,
  standard = {
    id: STANDARD_ID,
    canonical_key: CANONICAL_KEY,
    active_asset_path: ACTIVE_PATH,
    active_version_id: ACTIVE_VERSION_ID,
    active_version: 2,
    status: 'published',
    is_visible: true,
  },
  version = {
    id: HISTORY_VERSION_ID,
    visual_standard_id: STANDARD_ID,
    canonical_key: CANONICAL_KEY,
    asset_path: HISTORY_PATH,
    version: 1,
    asset_role: 'primary',
    detail_key: null,
  },
  detail = {
    id: '40000000-0000-4000-8000-000000000001',
    visual_standard_id: STANDARD_ID,
    canonical_key: CANONICAL_KEY,
    detail_key: DETAIL_KEY,
    active_asset_path: DETAIL_PATH,
    active_version_id: DETAIL_VERSION_ID,
    active_version: 3,
    status: 'published',
  },
} = {}) {
  const calls = [];
  const adminClient = {
    from(table) {
      calls.push(['from', table]);
      if (table === 'visual_standards') return queryResult({ data: standard, error: null });
      if (table === 'visual_standard_versions') return queryResult({ data: version, error: null });
      if (table === 'visual_standard_detail_slots') return queryResult({ data: detail, error: null });
      if (table === 'user_profiles') return queryResult({ data: profile, error: null });
      throw new Error(`Unexpected table: ${table}`);
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, 'visual-standards');
        return {
          async createSignedUrl(path, expiresIn) {
            calls.push(['sign', path, expiresIn]);
            return {
              data: { signedUrl: `https://storage.test/signed/${encodeURIComponent(path)}` },
              error: null,
            };
          },
        };
      },
    },
  };
  const userClient = {
    auth: {
      async getUser() {
        calls.push(['getUser']);
        return user
          ? { data: { user }, error: null }
          : { data: { user: null }, error: new Error('No authenticated user') };
      },
    },
  };
  return { adminClient, userClient, calls };
}

function request(body, { authenticatedToken = PUBLIC_KEY, includeApiKey = true } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authenticatedToken}`,
  };
  if (includeApiKey) headers.apikey = PUBLIC_KEY;
  return new Request('https://functions.test/visual-standard-image', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function handlerFor(clients) {
  return createVisualStandardImageHandler({
    adminClient: clients.adminClient,
    acceptedPublicKeys: [PUBLIC_KEY],
    userClientForRequest: () => clients.userClient,
    now: () => Date.parse('2026-08-21T10:00:00.000Z'),
  });
}

test('private delivery signs only the active path selected by canonical key', async () => {
  const clients = createClients();
  const response = await handlerFor(clients)(request({
    canonicalKey: CANONICAL_KEY,
    assetPath: `${CANONICAL_KEY}/attacker-selected.jpg`,
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.scope, 'active');
  assert.equal(body.expiresIn, VISUAL_STANDARD_SIGNED_URL_LIFETIME_SECONDS);
  assert.deepEqual(
    clients.calls.filter(([name]) => name === 'sign'),
    [['sign', ACTIVE_PATH, 3600]],
  );
  assert.equal(clients.calls.some(([name]) => name === 'getUser'), false);
});

test('active delivery requires the application project credential', async () => {
  const clients = createClients();
  const response = await handlerFor(clients)(request(
    { canonicalKey: CANONICAL_KEY },
    { authenticatedToken: 'random-token', includeApiKey: false },
  ));

  assert.equal(response.status, 401);
  assert.equal(clients.calls.length, 0);
});

test('ordinary staff delivery signs only a currently published active detail slot', async () => {
  const clients = createClients();
  const response = await handlerFor(clients)(request({
    canonicalKey: CANONICAL_KEY,
    detailKey: DETAIL_KEY,
    versionId: '',
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.scope, 'active_detail');
  assert.equal(body.detailKey, DETAIL_KEY);
  assert.equal(body.versionId, DETAIL_VERSION_ID);
  assert.deepEqual(
    clients.calls.filter(([name]) => name === 'sign'),
    [['sign', DETAIL_PATH, 3600]],
  );

  const unpublishedClients = createClients({
    detail: {
      id: '40000000-0000-4000-8000-000000000001',
      visual_standard_id: STANDARD_ID,
      canonical_key: CANONICAL_KEY,
      detail_key: DETAIL_KEY,
      active_asset_path: null,
      active_version_id: null,
      active_version: 0,
      status: 'awaiting_asset',
    },
  });
  const unpublishedResponse = await handlerFor(unpublishedClients)(request({
    canonicalKey: CANONICAL_KEY,
    detailKey: DETAIL_KEY,
  }));
  assert.equal(unpublishedResponse.status, 404);
  assert.equal(unpublishedClients.calls.some(([name]) => name === 'sign'), false);
});

test('hidden legacy standards cannot be retrieved as active assets', async () => {
  const clients = createClients({
    standard: {
      id: STANDARD_ID,
      canonical_key: CANONICAL_KEY,
      active_asset_path: ACTIVE_PATH,
      active_version_id: ACTIVE_VERSION_ID,
      active_version: 2,
      status: 'published',
      is_visible: false,
    },
  });
  const response = await handlerFor(clients)(request({ canonicalKey: CANONICAL_KEY }));

  assert.equal(response.status, 404);
  assert.equal(clients.calls.some(([name]) => name === 'sign'), false);
});

test('staff and staff-code callers cannot obtain historical signed URLs', async () => {
  const staffCodeClients = createClients();
  const staffCodeResponse = await handlerFor(staffCodeClients)(request({
    canonicalKey: CANONICAL_KEY,
    versionId: HISTORY_VERSION_ID,
  }));
  assert.equal(staffCodeResponse.status, 403);
  assert.equal(staffCodeClients.calls.some(([name]) => name === 'sign'), false);

  const staffClients = createClients({
    user: { id: '30000000-0000-4000-8000-000000000002' },
    profile: {
      id: '30000000-0000-4000-8000-000000000002',
      role: 'staff',
      active: true,
      is_shared_device: false,
    },
  });
  const staffResponse = await handlerFor(staffClients)(request(
    { canonicalKey: CANONICAL_KEY, versionId: HISTORY_VERSION_ID },
    { authenticatedToken: 'staff-user-jwt' },
  ));
  assert.equal(staffResponse.status, 403);
  assert.equal(staffClients.calls.some(([name]) => name === 'sign'), false);
});

test('manager history signing validates the version against its canonical standard', async () => {
  const managerId = '30000000-0000-4000-8000-000000000001';
  const managerClients = createClients({
    user: { id: managerId },
    profile: {
      id: managerId,
      role: 'manager',
      active: true,
      is_shared_device: false,
    },
  });
  const response = await handlerFor(managerClients)(request(
    { canonicalKey: CANONICAL_KEY, versionId: HISTORY_VERSION_ID },
    { authenticatedToken: 'manager-user-jwt' },
  ));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.scope, 'history');
  assert.deepEqual(
    managerClients.calls.filter(([name]) => name === 'sign'),
    [['sign', HISTORY_PATH, 3600]],
  );

  const mismatchedClients = createClients({
    user: { id: managerId },
    profile: {
      id: managerId,
      role: 'manager',
      active: true,
      is_shared_device: false,
    },
    version: null,
  });
  const mismatchedResponse = await handlerFor(mismatchedClients)(request(
    { canonicalKey: CANONICAL_KEY, versionId: HISTORY_VERSION_ID },
    { authenticatedToken: 'manager-user-jwt' },
  ));
  assert.equal(mismatchedResponse.status, 404);
  assert.equal(mismatchedClients.calls.some(([name]) => name === 'sign'), false);
});

test('canonical asset path validation rejects nested and arbitrary object names', () => {
  assert.equal(isCanonicalVisualStandardAssetPath(CANONICAL_KEY, ACTIVE_PATH), true);
  assert.equal(
    isCanonicalVisualStandardAssetPath(CANONICAL_KEY, `${CANONICAL_KEY}/nested/100.jpg`),
    false,
  );
  assert.equal(
    isCanonicalVisualStandardAssetPath(CANONICAL_KEY, DETAIL_PATH, DETAIL_KEY),
    true,
  );
  assert.equal(
    isCanonicalVisualStandardAssetPath(CANONICAL_KEY, DETAIL_PATH, 'cabinet-2'),
    false,
  );
  assert.equal(
    isCanonicalVisualStandardAssetPath(CANONICAL_KEY, `other-standard/100-active.jpg`),
    false,
  );
});
