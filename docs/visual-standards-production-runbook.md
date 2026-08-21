# Visual Standards production runbook

## Architecture

The application keeps the existing canonical keys as its registry. Every guide,
task image panel, Self-Service section and Workbar guide resolves those keys
through `VisualStandardsProvider`.

Resolution order is:

1. active asset from `public.visual_standards` and the `visual-standards` bucket;
2. existing bundled repository image;
3. awaiting-approved-photo state.

The two Workbar fridge images remain bundled. The eight Self-Service keys have
an awaiting-photo fallback until a manager publishes them.

Publication has one live boundary:

1. the authenticated manager uploads a new, immutable, versioned object;
2. `publish_visual_standard` verifies that object and its owner;
3. the function inserts `visual_standard_versions` and switches the active
   pointer in one database transaction;
4. the function returns the persisted active row as the publication readback;
5. the provider replaces its in-memory record, updating every mounted consumer.

An upload alone is never live. If the database publication fails, the client
attempts to remove the unreferenced object and the prior active row is unchanged.
Already-published objects cannot be removed through the manager Storage policy.

Restore is implemented. It creates a new monotonic history version that points
to the retained asset and records `restored_from_version_id`.

## Prepared migration

Migration:

`supabase/migrations/20260821081622_visual_standards.sql`

It creates:

- public bucket `visual-standards`, limited to 15 MB JPEG, PNG, WebP, GIF or AVIF;
- `public.visual_standards` with one row per canonical key;
- `public.visual_standard_versions` for retained history;
- ten seed records (two Workbar and eight Self-Service);
- active-read RLS for anonymous staff-code clients and authenticated staff;
- manager-only history reads;
- manager-only Storage insert/select and orphan cleanup;
- manager-only publish and restore functions with restricted execute grants.

The bucket is public for reference-image delivery. Public delivery does not
grant upload, update or delete access. Those operations remain protected by
Storage RLS.

## Production actions requiring owner approval

No command below has been run against a remote project.

1. Confirm the target project has active `public.user_profiles` rows and that
   authorized publishers use the existing `manager` role.
2. Take or confirm a current database backup.
3. From a clean checkout of the approved PR, set a percent-encoded direct or
   session-pooler connection string in `SUPABASE_DB_URL`.
4. Review the pending migration without applying it:

   ```sh
   npx --yes supabase@2.115.0 db push --db-url "$SUPABASE_DB_URL" --dry-run
   ```

5. With explicit owner approval, apply it:

   ```sh
   npx --yes supabase@2.115.0 db push --db-url "$SUPABASE_DB_URL"
   ```

6. Run database lint after application:

   ```sh
   npx --yes supabase@2.115.0 db lint --db-url "$SUPABASE_DB_URL" --schema public,storage --level warning --fail-on error
   ```

7. Verify in Supabase Dashboard:

   - bucket `visual-standards` is public and has the configured limits;
   - ten `visual_standards` rows exist;
   - anonymous/authenticated roles have SELECT only on active metadata as
     defined by RLS;
   - only authenticated managers can insert bucket objects or execute publish
     and restore;
   - ordinary staff cannot read `visual_standard_versions`.

8. After the app change is separately approved, merged and deployed, sign in
   with an authenticated test manager, publish a non-sensitive test image, and
   confirm it appears from a staff session and a fresh anonymous staff-code
   session. Restore the prior version if this was an existing standard.

Because the resolver retains repository fallbacks, deploying the application
before the migration shows bundled/awaiting states rather than breaking guides.
For an application rollback, deploy the prior build and leave the non-destructive
tables and retained assets in place for auditability.

## Local verification

The migration was applied to an isolated PostgreSQL 17 container with minimal
Supabase auth/Storage schemas. `tests/sql/visual_standards_migration_test.sql`
verified:

- ten canonical seed records;
- manager upload metadata and atomic publication;
- failed publication preserving the prior active version;
- version 1, version 2 and restore-as-version-3 history;
- manager updater attribution;
- staff active reads and denied history/write access;
- anonymous active reads and denied publish execution.

The disposable container was stopped and removed after the test.
