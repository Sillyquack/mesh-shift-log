# Routine Engine v2 technical specification

## Status and scope

Phase 10A establishes an isolated database foundation for Routine Engine v2. It does not activate the engine for any organization and does not seed Mesh-specific locations, sets, standards, templates, or routine content.

Phase 10A includes organization settings, routine locations, reusable location sets, reusable standards, immutable standard revisions, server-resolved permissions, manager mutation RPCs, organization-scoped RLS, and disposable database verification.

The following remain outside this phase:

- employee-facing UI and operational routine runs;
- template/draft workflow, publishing, and run lifecycle;
- Double Shift behavior;
- Realtime and routine images;
- Event Operations changes;
- production rollout, data migration, or organization activation.

Stock Count remains an isolated, read-only future source. Routine Engine v2 must never mutate Inventory tables, RPCs, policies, Storage, or count history. The `inventory_readonly` source kind describes this boundary; it does not grant access or connect an adapter in Phase 10A.

## Canonical content identifiers

The product content registry reserves these stable identifier ranges for later phases:

| Range | Count | Reserved domain | Phase 10A treatment |
| --- | ---: | --- | --- |
| `O01`–`O37` | 37 | Opening routine content | Identifier range documented; no content rows seeded |
| `C01`–`C46` | 46 | Closing routine content | Identifier range documented; no content rows seeded |
| `DS01`–`DS04` | 4 | Double Shift content | Reserved only; Double Shift is not implemented |

The approved labels, task text, ordering, applicability rules, inputs, and location bindings for these IDs must be supplied by the later content/template phase. Phase 10A does not infer or duplicate that content in SQL.

## Database architecture

The additive migration is `supabase/phase10a_routine_engine_foundation.sql`. Every foundation table is in `public`, has RLS enabled, and has a non-null organization boundary.

| Table | Purpose | Tenant and revision guarantees |
| --- | --- | --- |
| `routine_organization_settings` | Per-organization rollout and operational-day settings | `organization_id` primary key; positive optimistic-lock revision |
| `routine_locations` | Hierarchical routine-only location catalog | Tenant-scoped key; composite parent FK prevents cross-organization parents |
| `routine_location_sets` | Reusable ordered groups of locations | Tenant-scoped key; positive optimistic-lock revision |
| `routine_location_set_members` | Deterministic set membership | Composite same-organization FKs; unique location and sort position per set |
| `routine_standards` | Stable identity and metadata for a reusable standard | Tenant-scoped key; current revision is nullable until first revision |
| `routine_standard_revisions` | Immutable standard values and audit history | Same-organization standard FK; monotonic revision number; idempotency key; deterministic hash |

`routine_standards.current_revision_id` uses a three-column foreign key to `(revision id, standard id, organization id)`. This closes the circular relationship only after both tables exist and prevents a pointer to another standard or tenant.

All foreign-key access paths and RLS organization predicates have supporting indexes. UUID primary keys avoid exposed sequences.

## Actors and permissions

Authorization comes only from the authenticated user's active `user_profiles` row. A routine actor must have a non-null organization, must be a personal rather than shared-device profile, and must have one of the routine roles below. Client-supplied organization or actor identity is never authoritative.

| Profile role | Read active operational config | Coordinate future runs | Perform future tasks | Manage foundation/config |
| --- | --- | --- | --- | --- |
| `manager` | Yes, including inactive config for management | Yes | Yes | Yes |
| `shift_lead` | Yes | Yes | Yes | No |
| `staff` | Yes | No | Yes | No |
| `counter` | No automatic routine access | No | No | No |
| Other, inactive, shared-device, or no organization | No | No | No | No |

Server helpers are:

- `routine_current_user_is_active()`
- `routine_current_user_organization_id()`
- `routine_current_user_role()`
- `routine_current_user_can_manage_templates()`
- `routine_current_user_can_coordinate_runs()`
- `routine_current_user_can_perform_tasks()`
- `routine_resolve_actor()`

All authorization helpers and mutation RPCs are `SECURITY DEFINER` with `search_path = pg_catalog` and fully qualified application objects. `routine_resolve_actor()` is internal and is not directly executable by `authenticated`.

## Mutation API

Authenticated clients receive `SELECT` only on the six tables. RLS narrows those reads to the caller's organization and, for staff/shift leads, to active publishable configuration. There are no INSERT, UPDATE, or DELETE policies and no direct table DML grants.

Managers mutate configuration through these RPCs:

- `create_or_update_routine_organization_settings(...)`
- `upsert_routine_location(...)`
- `set_routine_location_active(...)`
- `upsert_routine_location_set(...)`
- `replace_routine_location_set_members(...)`
- `create_routine_standard(...)`
- `create_routine_standard_revision(...)`

Every update path locks the target row, compares `input_expected_revision`, raises SQLSTATE `40001` for a stale write, and increments the revision in the same transaction. Create paths require a null expected revision.

`create_routine_standard_revision(...)` locks the standard row before allocating `max(revision_number) + 1`. Its required `(standard_id, idempotency_key)` uniqueness makes exact retries converge on the original revision; reuse with different content is rejected. After insert, the RPC updates `current_revision_id` and the standard's optimistic-lock revision atomically.

## Immutability and content hashes

`routine_standard_revisions` rejects every UPDATE and DELETE in a `BEFORE` trigger, including database-owner writes. Authenticated clients also lack direct mutation privileges.

The insert trigger derives `content_hash` from a canonical JSON object containing standard ID, revision number, value, effective time, and reason. The current implementation uses PostgreSQL's deterministic lowercase MD5 representation as a content identity/checksum, not as an authentication or cryptographic-signature mechanism.

## RLS and grants

- Policies target `authenticated` explicitly; anon has no table or RPC access.
- Every policy requires exact equality with the server-resolved non-null organization.
- Manager settings are manager-readable only.
- Managers read active and inactive foundation rows in their organization.
- Staff and shift leads read only active locations, active sets and their active members, active standards, and revisions belonging to active standards.
- No policy contains `USING (true)`, `WITH CHECK (true)`, or a null-organization bypass.
- Trigger functions and actor resolution have no direct application-role execute grant.

## Migration order

Apply the migration only after the repository's existing schema and completed Phase 9 migration chain, with Phase 9P remaining the terminal Phase 9 layer. Phase 10A is then the next additive layer:

1. existing `supabase/schema.sql` and pre-Phase 9 application migrations;
2. the canonical Phase 9 manifest through Phase 9P;
3. `supabase/phase10a_routine_engine_foundation.sql`.

The Phase 10A migration is safe to reapply against its own completed schema. Reapplication recreates functions, policies, and triggers without changing foundation data or audit timestamps. It must not be used to reorder or repair earlier migrations.

## Defaults and open configuration

The schema defines conservative defaults but does not create an organization settings row:

- mode: `legacy`;
- timezone: `Europe/Oslo` only;
- operational-day cutoff: `04:00`;
- shared-device support: disabled;
- reopen window: 24 hours, constrained to 0–168 hours.

Before a later rollout phase, product owners must approve the organization rollout mode, location catalog and hierarchy, location-set membership, the complete `O`, `C`, and `DS` content mappings, standard values/units/effective dates, source-adapter behavior, and whether shared-device operation is introduced. No value in this list is activated by Phase 10A.

## Verification and known baseline

`npm run verify:routine-foundation` starts a uniquely named, network-isolated disposable Supabase PostgreSQL container. It applies a representative existing baseline, fingerprints Inventory and legacy routine objects, applies Phase 10A repeatedly, runs SQL integrity/RLS tests, and compares the protected fingerprints. It also uses two real database connections to prove that concurrent writes cannot allocate the same standard revision: one succeeds and one stale writer is rejected.

The pre-existing Phase 9L verification baseline is intentionally not repaired here. Its exact known failure is:

> Phase 9L requires exactly one approved August shelf/storage source session.

Only that same failure with the same fingerprint is an accepted baseline. Any new or changed Phase 9 failure is a regression.

No Supabase production migration, data write, Auth configuration change, deployment, or feature activation is part of Phase 10A.
