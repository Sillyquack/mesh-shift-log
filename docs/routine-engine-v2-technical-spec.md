# Routine Engine v2 technical specification

## Status and scope

Phase 10A establishes the isolated database foundation for Routine Engine v2. Its approved local checkpoint is commit `a828531d9a0936849a05129d658d015f1b27845d` (`feat: add Routine Engine v2 foundation`).

Phase 10B's approved local checkpoint is commit `9a8cf5716a3427ab65d4437b83622858f52b0713` (`feat: add versioned Routine Engine templates`).

Phase 10C's approved local checkpoint is commit `c4666ee0c2cb5547812b0455288e4f8a8cb15e16` (`feat: add versioned routine reference images`).

Phase 10A includes organization settings, routine locations, reusable location sets, reusable standards, immutable standard revisions, server-resolved permissions, manager mutation RPCs, organization-scoped RLS, and disposable database verification.

Phase 10B adds logical templates, one active draft per template, versioned sections/tasks/structured items, task dependencies, declarative cross-run relations, bounded condition syntax, validation, SHA-256 content identity, and atomic immutable publishing. Phase 10C adds stable logical image references, immutable image versions and placeholders, private organization-scoped Storage access, draft task/task-item links, and an isolated authenticated client. Phase 10D adds authoritative operational run identity, atomic immutable snapshots of the exact published version and all resolved sources, pending condition facts, participant membership, coordinator role assignments, and an isolated authenticated run client. None of these phases activates the engine for an organization or seeds Mesh-specific locations, sets, standards, templates, routine content, actual Mesh images, or production runs.

The following remain outside this phase:

- employee-facing React UI;
- task completion and operational run lifecycle beyond initial `scheduled` creation;
- Double Shift behavior;
- Europe/Oslo operational-date derivation, checkpoints, and DST behavior;
- Realtime, offline outbox, and rendering of routine images in React;
- Event Operations mutation or completion integration;
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

The additive migrations are `supabase/phase10a_routine_engine_foundation.sql`, `supabase/phase10b_routine_templates.sql`, `supabase/phase10c_routine_reference_images.sql`, and `supabase/phase10d_routine_runs_and_snapshots.sql`. Every Routine Engine v2 table is in `public`, has RLS enabled, and has a non-null organization boundary.

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

Phase 10C adds these tables:

| Table | Purpose | Primary guarantees |
| --- | --- | --- |
| `routine_reference_images` | Stable logical reference used by template content | Tenant-scoped key and idempotency; optimistic revision; current pointer restricted to the same logical reference |
| `routine_reference_image_versions` | Immutable placeholder, pending, active-image, and orphan history | Monotonic number per reference; exact path/MIME/size/state constraints; only pending-to-final transitions |
| `routine_template_task_reference_images` | Semantic task or task-item link to a logical reference | Same-tenant/version/task/item FKs; unique logical identity and deterministic task order; draft-only mutation |
| `routine_reference_image_cleanup_queue` | Audited deletion work for failed uploads | Only non-current orphan objects; one pending entry per tenant/path; immutable acknowledgement history |
| `routine_reference_operations` | Request-hash idempotency and mutation audit | Unique operation key per tenant/actor/type; immutable object response |

`routine_reference_images.current_version_id` uses `(version id, organization id, reference id)`. A trigger additionally requires the target state to be `active_image` or `placeholder`. Historical active images are retained when a later image or placeholder becomes current.

Phase 10D adds these tables:

| Table | Purpose | Primary guarantees |
| --- | --- | --- |
| `routine_runs` | Authoritative operational run identity and immutable snapshot root | One non-cancelled/superseded run per tenant, operational date, routine key, and scope; exact published version/hash pinned; `building` becomes `ready` atomically |
| `routine_run_sections` | Section projection captured for a run | Source identity plus immutable display/order snapshot and per-row SHA-256 |
| `routine_run_tasks` | Operational task projection | Immutable typed template fields and inclusion state; lifecycle fields reserved for Phase 10E |
| `routine_run_task_items` | Structured task-item projection | Exact standard/location/source binding and resolved value snapshot |
| `routine_run_snapshot_sources` | Typed provenance ledger | Immutable canonical payload for static, location-set, standard-revision, Inventory, asset, and pending Event Operations source kinds |
| `routine_run_condition_evaluations` | Deferred condition state | Captures condition JSON and known facts while unresolved facts remain explicitly `pending` |
| `routine_run_task_dependencies` | Pinned intra-run graph | Immutable dependency endpoints and row hash |
| `routine_run_task_relations` | Pinned declarative cross-run relation | Immutable target template/task keys without completing another run |
| `routine_run_task_reference_images` | Concrete image used by the run | Exact immutable image-version ID, object path, caption, alt text, and link metadata |
| `routine_run_participants` | Idempotent run membership | One active membership per user and run; self-join for visible ready runs |
| `routine_run_role_assignments` | Coordinator-owned run roles | One active holder per role, optimistic run revision, replacement audit |
| `routine_run_operations` | Run API idempotency and audit | Tenant/actor/type operation key, request hash, immutable stored response |

Snapshot rows keep both source identities and copied operational values. This makes the immutable snapshot authoritative for the run while preserving a queryable projection; later edits to templates, sets, standards, Inventory or asset reference rows, pending Event Operations context, and current image pointers cannot rewrite historical run meaning. No run table has a foreign key into Inventory, asset, or Event Operations domains.

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

Phase 10C adds this manager API:

- `create_routine_reference(...)`
- `update_routine_reference_metadata(...)`
- `set_routine_reference_active(...)`
- `prepare_routine_reference_upload(...)`
- `finalize_routine_reference_upload(...)`
- `cancel_routine_reference_upload(...)`
- `set_routine_reference_placeholder(...)`
- `replace_routine_draft_task_reference_images(...)`
- `list_routine_reference_cleanup_paths()`
- `acknowledge_routine_reference_cleanup(...)`

Phase 10D adds this authenticated run API:

- `create_or_get_routine_run(...)` for manager/shift-lead creation of one authoritative ready snapshot;
- `join_routine_run(...)` for idempotent participant membership;
- `assign_routine_run_role(...)` for manager/shift-lead role coordination with optimistic revision;
- `verify_routine_run_snapshot(...)` for recomputing the snapshot hash and structural diagnostics;
- `get_routine_run_workspace(...)` for one visible run's immutable workspace projection;
- `list_routine_runs_for_date(...)` for server-filtered runs using an already supplied operational date.

The client supplies an operational date; Phase 10D deliberately does not derive Europe/Oslo dates or checkpoints. Creation locks the logical run identity, pins the current published template version and SHA-256 content hash, builds all child rows and read-only source provenance while the root is `building`, computes the canonical snapshot hash, and exposes the run only after the root changes to `ready` in that same transaction. A failed adapter or invariant rolls the transaction back, so a partial run cannot become visible. Idempotent retries return the original run; concurrent distinct request keys for the same logical identity converge on that run.

Prepare locks the logical reference, validates JPEG/PNG/WebP, the 5 MB limit, filename, caption, required alt text, and expected revision, then allocates the next immutable version and exact server path. Finalize locks the reference/version, verifies the exact `storage.objects` row and its actual size/MIME metadata, then atomically advances `pending_upload` to `active_image` and moves the logical pointer. Cancel advances only pending content to `orphaned` and queues that exact object. Selecting a placeholder creates a new immutable placeholder version; it never alters or deletes the previous active image.

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

Phase 10C extends canonical content with task key, optional task-item key, logical reference key, button label, context note, sort order, and active state. It deliberately excludes `current_version_id`, object path, image-version identity, caption, alt text, upload timestamps, and upload actor. Linking, relabeling, or reordering a logical reference changes the template hash; replacing the actual image behind that same logical reference does not.

Phase 10D performs concrete image pinning. Its canonical SHA-256 covers the pinned template version/hash, root identity, section/task/item projections, typed source provenance, condition evaluations, dependencies, relations, and concrete reference-image versions. `verify_routine_run_snapshot(...)` recomputes this value and reports structural or content mismatch without repairing history. Ready snapshot content, provenance, concrete images, operation records, and source identities cannot be updated or deleted. Participant and run-role state is intentionally separate from the snapshot hash.

## Conditions and publication validation

`routine_validate_condition_json(...)` accepts an empty object or a bounded tree of `all`, `any`, and `not`. Leaf operators are `equals`, `not_equals`, `in`, `greater_than`, `less_than`, and `exists`; facts are `weekday`, `local_time`, `organization_flag`, `location_active`, `event_zone_active`, `booking_exists`, `asset_used_today`, `standard_value_exists`, `previous_task_status`, and `transfer_status`. Object shape, array size, value shape, total size, and nesting depth are bounded. Unknown keys, facts, operators, or executable-looking extensions are rejected. Phase 10B validates syntax only; operational fact evaluation belongs to a later phase.

`validate_routine_template_version(...)` returns `valid`, `blockers`, `warnings`, `computed_content_hash`, and counts for sections, tasks, items, dependencies, relations, and reference images. It checks publish state, active structure, mandatory criteria, location binding, critical N/A policy, time and availability consistency, dependency integrity/cycles, non-empty referenced sets, current standard revisions, item sources, condition syntax, cross-run target resolution, batch tenant scope, deterministic order, JSON shape, lifecycle metadata, logical-reference tenant/activity, pointer validity, alt text, task-item ownership, and link uniqueness. A missing actual image or current placeholder is a warning, never a blocker; missing caption is also a warning.

## Private reference-image Storage

The dedicated `routine-reference-images` bucket contract is private, 5,242,880 bytes maximum, and exactly `image/jpeg`, `image/png`, or `image/webp`. Migration preflight creates the contract when absent and fails clearly instead of silently rewriting an incompatible existing bucket. It never references, reuses, or changes `inventory-location-reference-images`.

Every authoritative path is generated server-side as `{organization_id}/{reference_id}/{image_version_id}/{safe_filename}`. Validation requires exactly four segments, exact UUID matches, a bounded lowercase filename, no traversal marker or extra slash, and an extension matching MIME. The ordinary authenticated client can upload only an exact pending path returned by prepare, with overwrite disabled. There is no Storage UPDATE policy. Managers may delete only an exact own-tenant path in the pending cleanup queue; every finalized active image is permanent historical material in Phase 10C.

Managers can read all own-tenant image states. Active personal routine users can read only the current `active_image` for an active logical reference linked from the current published version of an active template. Pending, orphaned, historical non-current, draft-only, cross-tenant, and anonymous reads are denied by the Phase 10C baseline.

Phase 10D extends that read predicate only for the exact active-image object path and image version captured by a ready run visible to the caller. It does not add upload, overwrite, update, or delete access and does not touch the Inventory Storage bucket.

The isolated client modules are `src/features/routines-v2/data/routineReferenceImages.js` and `src/features/routines-v2/api/routineReferenceClient.js`. They use the normal authenticated Supabase client, verify file size and JPEG/PNG/WebP magic bytes without network access, normalize filename/caption/alt text, upload only to the returned path, preserve the previous current image on failures, and expose download and orphan cleanup. They contain no service credential, administrative API, or authoritative path builder. React manager/editor/viewer components remain deferred.

## RLS and grants

- Policies target `authenticated` explicitly; anon has no table or RPC access.
- Every policy requires exact equality with the server-resolved non-null organization.
- Manager settings are manager-readable only.
- Managers read active and inactive foundation rows in their organization.
- Staff and shift leads read only active locations, active sets and their active members, active standards, and revisions belonging to active standards.
- No policy contains `USING (true)`, `WITH CHECK (true)`, or a null-organization bypass.
- Trigger functions and actor resolution have no direct application-role execute grant.

For Phase 10B, managers can read all own-organization templates, lifecycle states, children, and publication batches. Active personal routine users can read only active templates and the current published version and children. They cannot read drafts, discarded versions, or publication batches. Inventory counters, shared-device profiles without a future operator-session contract, inactive users, organization-less users, other organizations, and anon receive no template access. Authenticated clients have table `SELECT` only; all mutation is through the manager RPCs.

Phase 10C follows the same boundary on all five new tables. Managers read own-tenant references, all versions, all template links, cleanup, and operations. Staff and shift leads read only current-published active logical references, current placeholder/active-image versions, and current-published links. Authenticated has no direct table INSERT/UPDATE/DELETE grant; mutation is limited to manager RPCs and the three narrow Storage policies. Counters, shared devices, inactive or organization-less profiles, other tenants, and anon receive no access.

Phase 10D grants authenticated users `SELECT` only on run tables, narrowed by the server-resolved organization and ready-run visibility contract. Run creation requires manager or shift lead; ordinary active routine staff can join and read visible ready runs. Coordinator role assignment requires manager or shift lead and an exact expected run revision. There are no direct table DML grants or permissive write policies. The snapshot builder, source adapters, hash helpers, and internal mutation flag are private; every exposed RPC is `SECURITY DEFINER`, resolves the actor from `auth.uid()`, and uses a catalog-only search path.

## Migration order

Apply the migration only after the repository's existing schema and completed Phase 9 migration chain, with Phase 9P remaining the terminal Phase 9 layer. Phase 10A is then the next additive layer:

1. existing `supabase/schema.sql` and pre-Phase 9 application migrations;
2. the canonical Phase 9 manifest through Phase 9P;
3. `supabase/phase10a_routine_engine_foundation.sql`;
4. `supabase/phase10b_routine_templates.sql`;
5. `supabase/phase10c_routine_reference_images.sql`;
6. `supabase/phase10d_routine_runs_and_snapshots.sql`.

All four Phase 10 migrations are safe to reapply against their own completed schema. Phase 10D also survives Phase 10B, 10C, and 10D function/policy restoration without changing run data, hashes, audit timestamps, or protected-domain fingerprints. Reapplication recreates functions, policies, and triggers without repairing or reordering earlier migrations.

## Defaults and open configuration

The schema defines conservative defaults but does not create an organization settings row:

- mode: `legacy`;
- timezone: `Europe/Oslo` only;
- operational-day cutoff: `04:00`;
- shared-device support: disabled;
- reopen window: 24 hours, constrained to 0–168 hours.

Before a later rollout phase, product owners must approve the organization rollout mode, location catalog and hierarchy, location-set membership, the complete `O`, `C`, and `DS` content mappings, standard values/units/effective dates, source-adapter behavior, approved actual Mesh reference images, and whether shared-device operation is introduced. No value in this list is activated by Phase 10A, 10B, 10C, or 10D. No `O01`–`O37`, `C01`–`C46`, `DS01`–`DS04`, random illustration, actual Mesh image, production run, or production snapshot is seeded; content is deferred to Phase 10L.

## Verification and known baseline

`npm run verify:routine-foundation` starts a uniquely named, network-isolated disposable Supabase PostgreSQL container. It applies a representative existing baseline, fingerprints Inventory and legacy routine objects, applies Phase 10A repeatedly, runs SQL integrity/RLS tests, and compares the protected fingerprints. It also uses two real database connections to prove that concurrent writes cannot allocate the same standard revision: one succeeds and one stale writer is rejected.

`npm run verify:routine-templates` applies Phase 10A and 10B twice in another uniquely named, network-isolated disposable PostgreSQL 17 container. It executes 94 SQL assertions across schema, immutability, lifecycle, validation, publishing, RLS, and regression boundaries. Two real connections prove that concurrent draft creation produces at most one draft and that concurrent identical publish calls converge on one immutable publication batch. It fingerprints Inventory, legacy routine, Event Operations, and Auth objects and verifies data-stable migration reapplication.

`npm run verify:routine-reference-images` applies Phase 10A, 10B, and 10C to another uniquely named, network-isolated disposable PostgreSQL 17 container. It executes 151 SQL assertions across schema, lifecycle, immutable versions/links, hashing, validation, publishing, Storage policy behavior, cleanup, paths, RLS, grants, and protected-domain regressions. Two real connections prove unique concurrent version allocation with stale rejection and convergence of identical finalize calls on one immutable operation. The runner also tests JPEG/PNG/WebP magic bytes, MIME mismatch, oversize rejection, and deterministic client normalization without network access. It fingerprints Inventory Storage and protected Inventory, legacy, Event Operations, and Auth schemas, then proves Phase 10B-plus-10C reapplication is data- and timestamp-stable.

`npm run verify:routine-runs` applies Phase 10A through 10D twice to a fresh uniquely named, network-isolated PostgreSQL 17 container. It executes 142 SQL assertions covering the 12-table schema, authoritative identity, atomic snapshot construction, every read-only source adapter, pending conditions, concrete images, immutable hashes, participants, role assignments, RLS, grants, historical Storage reads, rollback, tenant isolation, tamper detection, and protected-domain regressions. Separate real database connections prove convergence of concurrent run creation, idempotent concurrent participant joins, and single-winner optimistic role assignment. The runner then reapplies the dependent migration chain and verifies data-, hash-, timestamp-, template-hash-, and protected-domain stability. Offline model tests cover client normalization and snapshot-integrity diagnostics.

The pre-existing Phase 9L verification baseline is intentionally not repaired here. Its exact known failure is:

> Phase 9L requires exactly one approved August shelf/storage source session.

Only that same failure with the same fingerprint is an accepted baseline. Any new or changed Phase 9 failure is a regression.

No Supabase production migration, bucket creation, data write, Auth configuration change, deployment, or feature activation has been performed for Phase 10A, 10B, 10C, or 10D. Phase 10D exists only as an uncommitted local migration, isolated client/model modules, fixtures, assertions, runner, and specification update. Task completion, deviations, overrides, final verification, and event stream belong to Phase 10E. Europe/Oslo operational-date derivation, checkpoints, and DST handling belong to Phase 10F. Double Shift runs, Realtime, IndexedDB/offline outbox behavior, and React UI remain outside Phase 10D.
