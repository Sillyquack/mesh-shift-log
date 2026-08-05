# Routine Engine v2 technical specification

## Status and scope

Phase 10A establishes the isolated database foundation for Routine Engine v2. Its approved local checkpoint is commit `a828531d9a0936849a05129d658d015f1b27845d` (`feat: add Routine Engine v2 foundation`).

Phase 10A includes organization settings, routine locations, reusable location sets, reusable standards, immutable standard revisions, server-resolved permissions, manager mutation RPCs, organization-scoped RLS, and disposable database verification.

Phase 10B adds logical templates, one active draft per template, versioned sections/tasks/structured items, task dependencies, declarative cross-run relations, bounded condition syntax, validation, SHA-256 content identity, and atomic immutable publishing. Neither phase activates the engine for an organization or seeds Mesh-specific locations, sets, standards, templates, or routine content.

The following remain outside this phase:

- employee-facing UI and operational routine runs;
- operational run lifecycle;
- Double Shift behavior;
- Realtime and routine images (images are planned for Phase 10C);
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

The additive migrations are `supabase/phase10a_routine_engine_foundation.sql` and `supabase/phase10b_routine_templates.sql`. Every Routine Engine v2 table is in `public`, has RLS enabled, and has a non-null organization boundary.

| Table | Purpose | Tenant and revision guarantees |
| --- | --- | --- |
| `routine_organization_settings` | Per-organization rollout and operational-day settings | `organization_id` primary key; positive optimistic-lock revision |
| `routine_locations` | Hierarchical routine-only location catalog | Tenant-scoped key; composite parent FK prevents cross-organization parents |
| `routine_location_sets` | Reusable ordered groups of locations | Tenant-scoped key; positive optimistic-lock revision |
| `routine_location_set_members` | Deterministic set membership | Composite same-organization FKs; unique location and sort position per set |
| `routine_standards` | Stable identity and metadata for a reusable standard | Tenant-scoped key; current revision is nullable until first revision |
| `routine_standard_revisions` | Immutable standard values and audit history | Same-organization standard FK; monotonic revision number; idempotency key; deterministic hash |

`routine_standards.current_revision_id` uses a three-column foreign key to `(revision id, standard id, organization id)`. This closes the circular relationship only after both tables exist and prevents a pointer to another standard or tenant.

Phase 10B adds these tables:

| Table | Purpose | Primary guarantees |
| --- | --- | --- |
| `routine_templates` | Stable logical identity and current publication pointer | Tenant-scoped stable key/idempotency; composite current-version FK |
| `routine_template_versions` | Draft, published, and discarded template snapshots | Monotonic version numbers; one draft per template; same-template base version; lifecycle consistency |
| `routine_template_sections` | Ordered version sections | Stable key and unique deterministic order per version |
| `routine_template_tasks` | Ordered, typed work definitions | Same-version section FK; tenant-safe location references; bounded policy/time/JSON fields |
| `routine_template_task_items` | Structured checks and inputs inside tasks | Same-version task FK; tenant-safe standards/location sets; strict source/reference pairing |
| `routine_template_task_dependencies` | Intra-version execution prerequisites | Same-version predecessor/successor FKs; no self-edge; cycles blocked at publish |
| `routine_template_task_relations` | Declarative cross-run links | Stable target keys resolved against the publish batch or current publication |
| `routine_template_publication_batches` | Immutable publish audit and idempotency result | Request hash, publication group, non-empty version list, immutable stored response |

All template/content foreign keys include the organization and, where applicable, the version. `routine_templates.current_published_version_id` points through `(version id, organization id, template id)`, so it cannot select another template's or tenant's version.

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

Phase 10B adds this manager API:

- `create_routine_template(...)`
- `create_routine_template_draft(...)`
- `update_routine_draft_metadata(...)`
- `upsert_routine_draft_section(...)`
- `reorder_routine_draft_sections(...)`
- `upsert_routine_draft_task(...)`
- `reorder_routine_draft_tasks(...)`
- `upsert_routine_draft_task_item(...)`
- `reorder_routine_draft_task_items(...)`
- `replace_routine_draft_dependencies(...)`
- `replace_routine_draft_relations(...)`
- `discard_routine_template_draft(...)`
- `validate_routine_template_version(...)`
- `publish_routine_template_versions(...)`

Task and task-item upserts accept bounded JSON objects for the large typed field sets; organization, actor, version state, row identity, and revisions remain server-resolved. Reorder RPCs require the exact complete child-ID list and defer only the relevant unique-order constraint while assigning zero-based positions.

Every update path locks the target row, compares `input_expected_revision`, raises SQLSTATE `40001` for a stale write, and increments the revision in the same transaction. Create paths require a null expected revision.

`create_routine_standard_revision(...)` locks the standard row before allocating `max(revision_number) + 1`. Its required `(standard_id, idempotency_key)` uniqueness makes exact retries converge on the original revision; reuse with different content is rejected. After insert, the RPC updates `current_revision_id` and the standard's optimistic-lock revision atomically.

## Draft lifecycle and immutable publishing

Template creation atomically creates version 1 as a draft. Later drafts allocate `max(version_number) + 1` while holding a transaction-level advisory lock for the template. A draft may be empty or may copy a selected published version. Copying allocates new section/task/item/dependency/relation UUIDs while preserving stable keys, order, configuration, and graph topology. Discarded version-number gaps are intentional.

Only `draft → published` and `draft → discarded` are legal state changes, and trigger authorization is set only inside the corresponding manager RPC. Published and discarded versions cannot be updated or deleted. Child rows can be inserted or updated only while the parent is a draft, and direct child deletion is denied; dependency/relation replacement uses a transaction-local internal delete authorization. Publication-batch rows cannot be updated or deleted.

Publishing accepts one or more draft versions from one organization. It sorts and locks templates and versions deterministically, rejects duplicate templates and stale revisions, validates the complete batch, computes every hash, creates one immutable audit row, publishes all versions, and advances every current pointer in one transaction. A failure rolls back the whole batch. Cross-run Opening/Closing relations resolve to a target draft in that same batch first, otherwise to the target template's current published version. A relation is declarative and never completes its target task.

Creation and publishing use organization-scoped idempotency keys. The same key and canonical request returns the original stored result with `idempotentReplay: true`; changing the request while reusing the key is rejected.

## Immutability and content hashes

`routine_standard_revisions` rejects every UPDATE and DELETE in a `BEFORE` trigger, including database-owner writes. Authenticated clients also lack direct mutation privileges.

The insert trigger derives `content_hash` from a canonical JSON object containing standard ID, revision number, value, effective time, and reason. The current implementation uses PostgreSQL's deterministic lowercase MD5 representation as a content identity/checksum, not as an authentication or cryptographic-signature mechanism.

Template-version hashes use pgcrypto SHA-256. The canonical JSON includes version name/description and every active or inactive section, task, item, dependency, and relation. It uses semantic order (`sort_order`, stable keys, then UUID only as a final tie-break), represents dependency endpoints with stable task keys, and excludes timestamps and actor IDs. Published `content_hash` is server-only and can be recomputed after publication.

## Conditions and publication validation

`routine_validate_condition_json(...)` accepts an empty object or a bounded tree of `all`, `any`, and `not`. Leaf operators are `equals`, `not_equals`, `in`, `greater_than`, `less_than`, and `exists`; facts are `weekday`, `local_time`, `organization_flag`, `location_active`, `event_zone_active`, `booking_exists`, `asset_used_today`, `standard_value_exists`, `previous_task_status`, and `transfer_status`. Object shape, array size, value shape, total size, and nesting depth are bounded. Unknown keys, facts, operators, or executable-looking extensions are rejected. Phase 10B validates syntax only; operational fact evaluation belongs to a later phase.

`validate_routine_template_version(...)` returns `valid`, `blockers`, `warnings`, `computed_content_hash`, and counts for sections, tasks, items, dependencies, and relations. It checks publish state, active structure, mandatory criteria, location binding, critical N/A policy, time and availability consistency, dependency integrity/cycles, non-empty referenced sets, current standard revisions, item sources, condition syntax, cross-run target resolution, batch tenant scope, deterministic order, JSON shape, and lifecycle metadata. Reference images are deliberately not a blocker.

## RLS and grants

- Policies target `authenticated` explicitly; anon has no table or RPC access.
- Every policy requires exact equality with the server-resolved non-null organization.
- Manager settings are manager-readable only.
- Managers read active and inactive foundation rows in their organization.
- Staff and shift leads read only active locations, active sets and their active members, active standards, and revisions belonging to active standards.
- No policy contains `USING (true)`, `WITH CHECK (true)`, or a null-organization bypass.
- Trigger functions and actor resolution have no direct application-role execute grant.

For Phase 10B, managers can read all own-organization templates, lifecycle states, children, and publication batches. Active personal routine users can read only active templates and the current published version and children. They cannot read drafts, discarded versions, or publication batches. Inventory counters, shared-device profiles without a future operator-session contract, inactive users, organization-less users, other organizations, and anon receive no template access. Authenticated clients have table `SELECT` only; all mutation is through the manager RPCs.

## Migration order

Apply the migration only after the repository's existing schema and completed Phase 9 migration chain, with Phase 9P remaining the terminal Phase 9 layer. Phase 10A is then the next additive layer:

1. existing `supabase/schema.sql` and pre-Phase 9 application migrations;
2. the canonical Phase 9 manifest through Phase 9P;
3. `supabase/phase10a_routine_engine_foundation.sql`;
4. `supabase/phase10b_routine_templates.sql`.

Both Phase 10 migrations are safe to reapply against their own completed schema. Reapplication recreates functions, policies, and triggers without changing routine data or audit timestamps. They must not be used to reorder or repair earlier migrations.

## Defaults and open configuration

The schema defines conservative defaults but does not create an organization settings row:

- mode: `legacy`;
- timezone: `Europe/Oslo` only;
- operational-day cutoff: `04:00`;
- shared-device support: disabled;
- reopen window: 24 hours, constrained to 0–168 hours.

Before a later rollout phase, product owners must approve the organization rollout mode, location catalog and hierarchy, location-set membership, the complete `O`, `C`, and `DS` content mappings, standard values/units/effective dates, source-adapter behavior, and whether shared-device operation is introduced. No value in this list is activated by Phase 10A or 10B. No `O01`–`O37`, `C01`–`C46`, or `DS01`–`DS04` content is seeded; content is deferred to Phase 10L.

## Verification and known baseline

`npm run verify:routine-foundation` starts a uniquely named, network-isolated disposable Supabase PostgreSQL container. It applies a representative existing baseline, fingerprints Inventory and legacy routine objects, applies Phase 10A repeatedly, runs SQL integrity/RLS tests, and compares the protected fingerprints. It also uses two real database connections to prove that concurrent writes cannot allocate the same standard revision: one succeeds and one stale writer is rejected.

`npm run verify:routine-templates` applies Phase 10A and 10B twice in another uniquely named, network-isolated disposable PostgreSQL 17 container. It executes 94 SQL assertions across schema, immutability, lifecycle, validation, publishing, RLS, and regression boundaries. Two real connections prove that concurrent draft creation produces at most one draft and that concurrent identical publish calls converge on one immutable publication batch. It fingerprints Inventory, legacy routine, Event Operations, and Auth objects and verifies data-stable migration reapplication.

The pre-existing Phase 9L verification baseline is intentionally not repaired here. Its exact known failure is:

> Phase 9L requires exactly one approved August shelf/storage source session.

Only that same failure with the same fingerprint is an accepted baseline. Any new or changed Phase 9 failure is a regression.

No Supabase production migration, data write, Auth configuration change, deployment, or feature activation has been performed for Phase 10A or Phase 10B. Routine reference images are deferred to Phase 10C. Operational routine runs and employee UI are deferred to Phase 10D; Double Shift runs, Realtime, and offline outbox behavior also remain outside Phase 10B.
