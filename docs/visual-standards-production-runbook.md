# Visual Standards production runbook

## Production security model

The `visual-standards` Storage bucket is private. A Storage object is never a
public application URL, and ordinary staff or anonymous callers have no
`storage.objects` read/list policy for this bucket.

Every guide, task image panel, Self-Service section and Workbar guide keeps the
existing canonical-key registry and resolves through `VisualStandardsProvider`:

1. signed delivery of the backend's currently active asset;
2. existing bundled repository image;
3. awaiting-approved-photo state.

The two Workbar fridge images remain bundled. The eight Self-Service keys keep
their awaiting-photo fallback until a manager publishes them.

Signed URLs are issued for 3,600 seconds (60 minutes). The client caches active
delivery by canonical key and active version and reuses it until five minutes
before expiry. Manager history URLs are not put in the shared module cache. A
publish or restore changes the active version and forces one fresh active URL,
so a successful manager action updates the mounted provider immediately
without signing on every render.

## Staff-code authentication model

Staff-code login is an existing custom application session, not Supabase Auth.
The selected local staff record is stored in browser `localStorage` under
`mesh-current-user-v1` with `loginSource: "staff_code"`. It does not create an
`auth.users` identity or a Supabase user access token.

With no email/password session, the shared Supabase client operates with the
configured `VITE_SUPABASE_ANON_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY`.
Accordingly, staff-code users read only published active metadata through the
existing `anon` table policy and request only active signed delivery through
the `visual-standard-image` Edge Function. This hardening does not alter staff
codes or promote them to authenticated users.

## Signed-delivery boundary

`supabase/functions/visual-standard-image` is the only Visual Standards URL
signer used by the app.

For active delivery it:

1. requires the project's anon/publishable application credential;
2. accepts a canonical key, not a Storage path;
3. loads that canonical row with the service-role client;
4. requires `status = 'published'` and uses only `active_asset_path`;
5. validates the immutable canonical object namespace;
6. returns a 60-minute signed URL.

An optional `versionId` switches to manager-history delivery. That path also
validates the Supabase user JWT, requires an active, non-shared `manager`
profile, and joins the version to both the requested canonical key and its
`visual_standard_id` before signing. Staff, staff-code users and anonymous app
callers cannot sign a historical ID. No request field can select an arbitrary
Storage path.

The function is deployed with gateway JWT verification disabled so the
existing staff-code flow can use either a legacy anon JWT or a current
publishable key. This does not make the handler unauthenticated: it rejects a
missing or foreign project application key, and manager history independently
validates the user JWT with Supabase Auth. A project public key is intentionally
not treated as a manager credential; it can obtain only currently active
images. Direct bucket retrieval remains blocked by the private bucket.

## Publication and restore

Publication keeps one live boundary:

1. an authenticated manager selects or takes a photo and sees a local preview;
2. Save uploads a new immutable object under the canonical key;
3. `publish_visual_standard` verifies the manager, canonical namespace, object
   owner, stored MIME type and stored byte size;
4. the function inserts `visual_standard_versions` and switches the active
   pointer in one database transaction;
5. the returned persisted row confirms the new active path;
6. the client forces a fresh active signed URL and updates the provider.

An upload alone is never live. If publication fails, the prior active row is
unchanged and the client attempts to remove the unreferenced object. Already
published objects cannot be removed through the manager cleanup policy.

Restore remains restore-as-new-version. It verifies the source version belongs
to the canonical standard, confirms the retained object exists, creates a new
monotonic audited version with `restored_from_version_id`, switches the active
pointer transactionally, and refreshes active signed delivery.

## Production migration

The production ledger records the applied Visual Standards migration as:

`supabase/migrations/20260821102613_visual_standards.sql`

It creates/configures:

- private `visual-standards` bucket;
- 15 MB JPEG, PNG, WebP, GIF and AVIF allowlist;
- ten unchanged canonical metadata rows;
- active published metadata reads for `anon` and active authenticated staff;
- manager-only history metadata;
- manager-only immutable canonical uploads and private Storage reads;
- manager orphan cleanup that cannot delete a referenced version asset;
- manager-only publish and restore functions with explicit empty
  `search_path`, internal manager checks and minimal execute grants.

No ordinary-user Storage read/list policy is created. Active delivery is
performed by the Edge Function after its canonical active-row lookup.

## Production rollout status — 21 August 2026

Owner approval was given for the rollout. The following production actions are
complete on project `mesh-shift-log`:

1. Production prerequisites were verified, including active manager profile and
   required helper functions.
2. Local migration history was reconciled to the production ledger without
   using `migration repair`.
3. A production dry run confirmed that only the Visual Standards migration was
   pending.
4. The Visual Standards migration was applied successfully. Supabase recorded
   it as version `20260821102613`, name `visual_standards`.
5. Read-only verification confirmed the bucket is private, ten canonical rows
   exist, no image versions exist before the first manager publication, and
   publish/restore RPCs exist.
6. Edge Function `visual-standard-image` version 1 was deployed and is ACTIVE
   with gateway JWT verification disabled intentionally for the existing
   staff-code/project-key flow. The handler performs its own scoped credential
   checks and manager authentication for history access.
7. Supabase Security Advisor was reviewed. No new Visual Standards-specific RLS
   failure was reported. Generic SECURITY DEFINER warnings remain because the
   authenticated role can invoke RPC endpoints; the Visual Standards publish
   and restore functions perform explicit manager checks internally. Existing
   project security debt is tracked separately.

The remaining rollout steps are:

1. merge the approved application PR;
2. deploy the application through the normal GitHub Pages release process;
3. run the authenticated manager/staff/staff-code device smoke test below.

## Production smoke test

Use non-sensitive test content and an empty Self-Service standard for the first
publication, preferably `self-service-station-overview-standard`.

### Manager

1. Sign in through Supabase email/password as an active manager.
2. Open Visual Standards and confirm the current bundled/awaiting state loads.
3. Use Camera, confirm the preview is local-only, then Save.
4. Confirm the persisted readback reports version 1 and the new active image
   appears immediately.

### Authenticated staff

1. Open the same standard as active authenticated staff.
2. Confirm the new active image appears.
3. Confirm history metadata is unavailable and direct Storage list/download
   requests are denied.

### Staff-code / anonymous application flow

1. Sign out of Supabase Auth and sign in using the existing staff-code flow.
2. Confirm the new active image appears through signed delivery.
3. Confirm no history UI or arbitrary-path signing route is available.

### Historical protection

After a second version exists:

1. retain a historical object path/version ID from manager history;
2. confirm an ordinary staff or staff-code client cannot list it, download it
   directly, or request it by path/version through the active flow;
3. confirm the manager can still view its signed history preview.

### Restore

After at least two versions exist:

1. as manager, restore the prior version;
2. confirm a new audited version is created and links to the restored source;
3. confirm manager, authenticated staff and staff-code views resolve the
   restored active image after refresh/focus;
4. confirm the image that was active before restore remains retained in
   manager history but is no longer ordinary-staff-visible as an active image.

### Public internet check

Request a known object through the public Storage URL form without a signed
token. It must not return the image. A request without the project application
credential must also be rejected by `visual-standard-image`.

## Local verification

The isolated PostgreSQL test covers bucket privacy, limits, manager upload and
publication, failed-publication rollback, canonical namespace enforcement,
staff/anon Storage denial, manager history, protected retained assets, restore
and restricted function grants.

Node tests cover active-only signing, missing application credentials, denial
of staff/staff-code history signing, manager version ownership validation,
60-minute expiry, client caching and the rule that clients send canonical keys
and version IDs rather than Storage paths.

The repository fallbacks remain available if metadata or signed delivery is
temporarily unavailable. For an application rollback, deploy the prior build
and leave the non-destructive tables and retained private assets in place for
auditability.
