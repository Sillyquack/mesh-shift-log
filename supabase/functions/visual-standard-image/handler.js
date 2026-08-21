export const VISUAL_STANDARD_SIGNED_URL_LIFETIME_SECONDS = 60 * 60;

const VISUAL_STANDARDS_BUCKET = 'visual-standards';
const canonicalKeyPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const versionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Cache-Control': 'private, no-store',
      'Content-Type': 'application/json',
    },
  });
}

function bearerToken(request) {
  const header = request.headers.get('authorization') || '';
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
}

function hasAcceptedAppCredential(request, acceptedPublicKeys) {
  const apiKey = request.headers.get('apikey') || '';
  const bearer = bearerToken(request);
  return acceptedPublicKeys.some((key) => key && (key === apiKey || key === bearer));
}

export function isCanonicalVisualStandardAssetPath(canonicalKey, assetPath) {
  if (!canonicalKeyPattern.test(canonicalKey) || typeof assetPath !== 'string') return false;
  const immutableNamePattern = /^[0-9]+-[A-Za-z0-9-]+\.(?:jpg|jpeg|png|webp|gif|avif)$/;
  const prefix = `${canonicalKey}/`;
  return assetPath.startsWith(prefix)
    && immutableNamePattern.test(assetPath.slice(prefix.length));
}

async function requireManager(userClient, adminClient) {
  const { data: userResult, error: userError } = await userClient.auth.getUser();
  if (userError || !userResult?.user?.id) {
    return { ok: false, status: 403, error: 'Manager authentication is required for history images.' };
  }

  const { data: profile, error: profileError } = await adminClient
    .from('user_profiles')
    .select('id, role, active, is_shared_device')
    .eq('id', userResult.user.id)
    .maybeSingle();

  if (
    profileError
    || !profile?.active
    || profile.role !== 'manager'
    || profile.is_shared_device === true
  ) {
    return { ok: false, status: 403, error: 'Manager access is required for history images.' };
  }

  return { ok: true, userId: userResult.user.id };
}

async function loadCanonicalStandard(adminClient, canonicalKey) {
  const { data, error } = await adminClient
    .from('visual_standards')
    .select('id, canonical_key, active_asset_path, active_version_id, active_version, status')
    .eq('canonical_key', canonicalKey)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: 'Visual Standard lookup failed.' };
  if (!data) return { ok: false, status: 404, error: 'Visual Standard was not found.' };
  return { ok: true, record: data };
}

async function signAsset(adminClient, assetPath) {
  const { data, error } = await adminClient.storage
    .from(VISUAL_STANDARDS_BUCKET)
    .createSignedUrl(assetPath, VISUAL_STANDARD_SIGNED_URL_LIFETIME_SECONDS);
  if (error || !data?.signedUrl) {
    return { ok: false, status: 500, error: 'Visual Standard image delivery failed.' };
  }
  return { ok: true, signedUrl: data.signedUrl };
}

export function createVisualStandardImageHandler({
  adminClient,
  userClientForRequest,
  acceptedPublicKeys,
  now = () => Date.now(),
}) {
  return async function visualStandardImageHandler(request) {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (request.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405);
    }
    if (!adminClient || !acceptedPublicKeys?.length) {
      return jsonResponse({ ok: false, error: 'Visual Standard image delivery is not configured.' }, 500);
    }
    if (!hasAcceptedAppCredential(request, acceptedPublicKeys)) {
      return jsonResponse({ ok: false, error: 'A valid application credential is required.' }, 401);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ ok: false, error: 'Invalid JSON body.' }, 400);
    }

    const canonicalKey = typeof payload?.canonicalKey === 'string'
      ? payload.canonicalKey.trim()
      : '';
    const versionId = typeof payload?.versionId === 'string'
      ? payload.versionId.trim()
      : '';
    if (!canonicalKeyPattern.test(canonicalKey)) {
      return jsonResponse({ ok: false, error: 'A valid canonical Visual Standard key is required.' }, 400);
    }
    if (versionId && !versionIdPattern.test(versionId)) {
      return jsonResponse({ ok: false, error: 'A valid Visual Standard version is required.' }, 400);
    }

    const standardResult = await loadCanonicalStandard(adminClient, canonicalKey);
    if (!standardResult.ok) {
      return jsonResponse({ ok: false, error: standardResult.error }, standardResult.status);
    }
    const standard = standardResult.record;

    let assetPath = '';
    let scope = 'active';
    if (versionId) {
      const userClient = userClientForRequest?.(request);
      if (!userClient) {
        return jsonResponse({ ok: false, error: 'Manager authentication is required for history images.' }, 403);
      }
      const managerResult = await requireManager(userClient, adminClient);
      if (!managerResult.ok) {
        return jsonResponse({ ok: false, error: managerResult.error }, managerResult.status);
      }

      const { data: version, error: versionError } = await adminClient
        .from('visual_standard_versions')
        .select('id, visual_standard_id, canonical_key, asset_path, version')
        .eq('id', versionId)
        .eq('visual_standard_id', standard.id)
        .eq('canonical_key', canonicalKey)
        .maybeSingle();
      if (versionError) {
        return jsonResponse({ ok: false, error: 'Visual Standard history lookup failed.' }, 500);
      }
      if (!version) {
        return jsonResponse({ ok: false, error: 'Visual Standard version was not found.' }, 404);
      }
      assetPath = version.asset_path;
      scope = 'history';
    } else {
      if (standard.status !== 'published' || !standard.active_asset_path) {
        return jsonResponse({ ok: false, error: 'No active Visual Standard image is published.' }, 404);
      }
      assetPath = standard.active_asset_path;
    }

    if (!isCanonicalVisualStandardAssetPath(canonicalKey, assetPath)) {
      return jsonResponse({ ok: false, error: 'Stored Visual Standard asset path is invalid.' }, 500);
    }

    const signed = await signAsset(adminClient, assetPath);
    if (!signed.ok) return jsonResponse({ ok: false, error: signed.error }, signed.status);

    const expiresAt = new Date(
      now() + (VISUAL_STANDARD_SIGNED_URL_LIFETIME_SECONDS * 1000),
    ).toISOString();
    return jsonResponse({
      ok: true,
      canonicalKey,
      scope,
      versionId: versionId || standard.active_version_id,
      activeVersion: standard.active_version,
      signedUrl: signed.signedUrl,
      expiresAt,
      expiresIn: VISUAL_STANDARD_SIGNED_URL_LIFETIME_SECONDS,
    });
  };
}
