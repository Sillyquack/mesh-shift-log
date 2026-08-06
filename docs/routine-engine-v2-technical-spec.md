# Routine Engine v2 technical specification

## Status and scope

Phase 10A establishes the isolated database foundation for Routine Engine v2. Its approved local checkpoint is commit `a828531d9a0936849a05129d658d015f1b27845d` (`feat: add Routine Engine v2 foundation`).

Phase 10B's approved local checkpoint is commit `9a8cf5716a3427ab65d4437b83622858f52b0713` (`feat: add versioned Routine Engine templates`).

Phase 10C's approved local checkpoint is commit `c4666ee0c2cb5547812b0455288e4f8a8cb15e16` (`feat: add versioned routine reference images`).

Phase 10D's approved local checkpoint is commit `6164df74d443c80e02885f804ac1f6084d96131a` (`feat: add authoritative routine run snapshots`). Phase 10E's approved local checkpoint is commit `48b80dc4b11f11b22d24d28f414d643652b8aa11` (`feat: add routine lifecycle and immutable audit`). Phase 10F's approved local checkpoint is commit `ea3ac0a39ef11ff7e491642d157747b3845cb5e8` (`feat: add routine operational time engine`). Phase 10G's approved local checkpoint is commit `dd37231d7d58c1ec867c7abf1213aa9db6487e29` (`feat: add routine closing delivery evidence`). Phase 10H's approved local checkpoint is commit `4c189222b6dca2fb94acfe28d8b812e3d4e4e688` (`feat: add double shift continuity and event transfers`). Phase 10I's approved local checkpoint is commit `009f979433ca0b2d49fe60bb470af5734396e7ab` (`feat: add routine realtime and offline sync`). Phase 10J's approved local checkpoint is commit `5f893a3b12ed4bc0d167e0b97079737d29301848` (`feat: add secure shared-device routine identity`). Phase 10K1's approved local checkpoint is commit `082bda12ff34ed77f3bd148c46c9e7f9bb23b435` (`feat: add Routine Engine preview shell`). Phase 10K2's approved local checkpoint is commit `dd8d9c6132ee9bdcd4bd6e25d80ff76abceb1dda` (`feat: add Routine Engine manager control center`). Phase 10K3 is implemented and verified in the working tree but deliberately remains uncommitted pending review.

Phase 10A includes organization settings, routine locations, reusable location sets, reusable standards, immutable standard revisions, server-resolved permissions, manager mutation RPCs, organization-scoped RLS, and disposable database verification.

Phase 10B adds logical templates, one active draft per template, versioned sections/tasks/structured items, task dependencies, declarative cross-run relations, bounded condition syntax, validation, SHA-256 content identity, and atomic immutable publishing. Phase 10C adds stable logical image references, immutable image versions and placeholders, private organization-scoped Storage access, draft task/task-item links, and an isolated authenticated client. Phase 10D adds authoritative operational run identity, atomic immutable snapshots of the exact published version and all resolved sources, pending condition facts, participant membership, coordinator role assignments, and an isolated authenticated run client. None of these phases activates the engine for an organization or seeds Mesh-specific locations, sets, standards, templates, routine content, actual Mesh images, or production runs.

The following remain outside this phase:

- the operational employee checklist, which belongs to Phase 10K3;
- the legacy-history adapter, which belongs to Phase 10K4;
- Event Operations mutation from Routine Engine;
- production rollout, data migration, or organization activation.

Stock Count remains an isolated, read-only future source. Routine Engine v2 must never mutate Inventory tables, RPCs, policies, Storage, or count history. The `inventory_readonly` source kind describes this boundary; it does not grant access or connect an adapter in Phase 10A.

## Canonical content identifiers

The product content registry reserves these stable identifier ranges for later phases:

| Range | Count | Reserved domain | Phase 10A treatment |
| --- | ---: | --- | --- |
| `O01`–`O37` | 37 | Opening routine content | Identifier range documented; no content rows seeded |
| `C01`–`C46` | 46 | Closing routine content | Identifier range documented; no content rows seeded |
| `DS01`–`DS04` | 4 | Double Shift content | Workflow semantics implemented in 10H; no task/content rows seeded |

The approved labels, task text, ordering, applicability rules, inputs, and location bindings for these IDs must be supplied by the later content/template phase. Phase 10A does not infer or duplicate that content in SQL.

## Database architecture

The additive migrations are `supabase/phase10a_routine_engine_foundation.sql` through `supabase/phase10h_routine_double_shift.sql`. Every Routine Engine v2 table is in `public`, has RLS enabled, and has a non-null organization boundary.

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

## Phase 10E lifecycle and immutable audit

Phase 10E adds the server-authoritative operational layer in `supabase/phase10e_routine_task_lifecycle.sql`. It extends `routine_run_tasks` with current deviation/override pointers, N/A and waiting reasons, claim/status metadata, and extends task items with N/A/block reasons and status-change metadata. Snapshot identity remains immutable; only RPC-owned projections may change.

The ten lifecycle tables are:

| Table | Purpose |
| --- | --- |
| `routine_deviations` | Detected condition, severity, assignment, mitigation/resolution, and immutable detection identity |
| `routine_manager_overrides` | Immutable manager decision with reason, remaining risk, temporary measure, owner, due time, expiry, and supersession |
| `routine_task_verifications` | Immutable verification of one exact task revision |
| `routine_run_verifications` | Immutable final verification of one exact run revision |
| `routine_run_verification_items` | Per-task revision snapshot inside a run verification |
| `routine_handovers` | Revisioned draft followed by frozen submitted/accepted handover |
| `routine_handover_items` | Manual and server-regenerated deviation/transfer handover entries |
| `routine_run_transfers` | Proposed, accepted/rejected, completed/cancelled responsibility transfer |
| `routine_corrections` | Additive historical correction that never rewrites the original entity or event |
| `routine_events` | Append-only operational event stream linked to the idempotent operation |

Task transitions are server controlled: `not_started → in_progress`; `in_progress ↔ waiting`; active work may become `blocked` or, when the snapshot policy permits it, `not_applicable`; valid work becomes `completed`; an accepted transfer projects `transferred`. Resolving the final blocker returns work to `in_progress`. A coordinator can reopen `completed`/`not_applicable` work with a substantive reason. Claim and release change assignment/claim projections without inventing a completion state.

Run transitions are `scheduled → in_progress → awaiting_final_verification|waiting_for_transfers|finished`, with a coordinator cancellation path from active states. Failed verification returns the run to work. Only a manager may change `finished → reopened`, and only inside the configured reopen window; starting a reopened run returns it to `in_progress`. Cancelled and superseded runs are terminal.

Initial assessment is write-once. The snapshot policy determines whether `ready`, `correction_required`, or `control_issue_found` is legal; issue assessments create an auditable deviation. Task-item values are type-checked in PostgreSQL for check, count, quantity/measurement, text, choice/status, and read-only location/asset/product result shapes. Required, blocked, and N/A policies feed the server completion validator. The client never supplies the authoritative task outcome: PostgreSQL derives `ready_on_arrival`, `standard_met`, `completed_after_correction`, control outcomes, or `completed_with_manager_override` from stored facts.

Every mutation requires a stable idempotency key. The canonical request hash is stored in `routine_run_operations`; an exact replay returns the stored response, while key reuse with a changed request is rejected. Events use the operation ID plus a sequence number for deduplication. Event payloads must be objects and reject secret/payment field names. Comments are events and intentionally do not increment task or run revisions. All other contested projections use expected revisions, row locks in run-before-task-before-child order, and SQLSTATE `40001` for stale writers.

Deviations preserve detection facts while their controlled status/assignment projection advances. Overrides and verifications are immutable rows. Independent/second-person/manager/closing-responsible verification policies are checked against the effective actor and active role assignment. A passed verification is valid only for its recorded task/run revision; later material work makes it stale without deleting history. Failed verification creates a deviation and returns work to a blocked/in-progress state.

Handover drafts may replace manual items and regenerate server-owned items from open deviations and active transfers. Submit regenerates once more and freezes the handover and items; only the valid target can accept it. Transfers do not complete a source task when proposed. Acceptance projects the task as `transferred`; completion is a later explicit action with a note. Event-operation handover/transfer acceptance returns a Phase 10H deferral error.

Run completion is composed from `routine_validate_run_completion_core`, `routine_validate_run_completion_time`, and `routine_validate_run_completion_delivery`, followed by `routine_finalize_run_extension`. The core checks snapshot readiness, conditions, mandatory/critical work, required items, overrides, deviations, stale/missing verification, transfers, and required handover. At the Phase 10E checkpoint the time and delivery hooks were safe extension stubs; Phase 10F replaced the time hook and Phase 10G replaces the delivery/finalization hooks. Accepted incomplete transfers produce `waiting_for_transfers`; a clean validation permits `finished` and increments the finish sequence.

All ten tables have organization/run composite foreign keys, supporting indexes, RLS, and authenticated `SELECT` only. Manager/coordinator/participant visibility derives from the normal personal-profile and visible-run contract. The operation ledger remains manager-only. Target participants can see/respond to explicit transfers. Anon, inactive, organization-less, cross-organization, counter-only, and shared-device profiles receive no automatic access. Mutation is RPC-only; internal helpers, guards, completion hooks, and the renamed Phase 10D implementations have no application-role execute grant.

The isolated client files are `routineTaskLifecycle.js` and `routineLifecycleClient.js`. They normalize lifecycle/read-model data, expose display-only action hints, retain the caller's idempotency key for retry, and map stale/auth/RLS/network failures. They contain no direct DML, service credential, organization authority, outcome authority, date/checkpoint logic, Realtime, IndexedDB, offline outbox, or React component.

No Opening (`O01`–`O37`), Closing (`C01`–`C46`), or Double Shift (`DS01`–`DS04`) content is seeded. No production migration, production run, bucket, Auth change, deployment, or protected-domain mutation was performed.

## Phase 10F operational date and timing engine

Phase 10F adds `supabase/phase10f_routine_operational_time.sql` as a separate additive layer. The server is the sole time authority. Public mutations capture one `clock_timestamp()` value per operation; no public RPC accepts `effective_now`, and the client neither derives an operational date nor uses `Date` for an action gate. Private helpers that accept a test instant have no `authenticated` execute grant.

Organization settings retain the locked `Europe/Oslo` timezone and default `04:00` operational-day cutoff, and add a bounded flat scalar `flags` object plus `time_engine_version`. At or after 04:00 local time, the operational date is the local calendar date; before 04:00 it is the prior date. Consequently, a Closing run created at 00:30 belongs to the previous workday. `replace_routine_organization_flags(...)` is manager-only, request-hash-idempotent, and revision checked. Settings changes affect only future contexts.

Every run gets one immutable `routine_run_operational_contexts` row containing the operational date and source (`derived`, `explicit`, `superseded_copy`, or `legacy_backfill`), timezone/cutoff, server resolution instant and local projection, ISO weekday, settings revision, organization flags, time-engine version, and a SHA-256 context hash. The root run points back through a same-run/same-organization composite foreign key. Ready timing identity is immutable.

`routine_run_task_timings` stores a separate immutable schedule snapshot and mutable timing projection. Local task boundaries are converted once to UTC instants and included in a dedicated timing snapshot hash; normal phase, crossing, condition, completion, and lateness changes are deliberately outside that hash. Phase 10D's core snapshot SHA-256 remains byte-stable. A run becomes timing-ready only after its context and every task timing row are built in the same transaction; an error rolls back the entire new run.

The local-to-UTC resolver round-trips candidates in a bounded deterministic window. Ordinary times resolve exactly. In the autumn overlap, `visible` and `start` choose the earliest valid instant, while `target`, `overdue`, and `hard_deadline` choose the latest. During the spring gap, the resolver shifts forward minute by minute, for no more than 180 minutes, preserving seconds and recording candidate count, shift, requested local timestamp, resolved local timestamp, and round-trip validity.

The timing projection is `hidden`, `upcoming`, `available`, `due`, `overdue`, or `hard_deadline_passed`, with `unscheduled`, `pending_condition`, `excluded`, `handled`, and `cancelled` terminal/special states. Read models compute the next boundary, seconds until it, server-side lateness, action hints, and a stable reason code. These hints are display information; lifecycle RPCs repeat all checks using server time.

`refresh_routine_run_timing(...)` serializes on the run, evaluates conditions and task phases, writes first-crossing timestamps once, and emits immutable system events only for new crossings. Ordinary visible/due/overdue refresh does not increment the run revision. Crossing a hard deadline creates one nonblocking `timing_issue` deviation whose severity follows task criticality and increments the material run projection. Corrective completion remains allowed, stores a separate completion phase/lateness, resolves that deviation with a system note, and preserves the missed-deadline event.

Phase 10F replaces the Phase 10E `timing_engine_pending` stubs. Claim, start, block, N/A, completion, and verification use timing-ready, inclusion, condition, visibility, and start-boundary gates. A manager/shift lead may still block future work with a substantive operational reason. A participant cannot claim hidden work, start upcoming work, or choose N/A/complete before the start boundary. Hard-deadline work can still start and complete after its timing deviation is recorded.

`must_reach_time` dependencies use metadata boundary `visible`, `start`, `target`, `overdue`, or `hard_deadline`, defaulting to `start`. Publication requires that the predecessor has the selected boundary. Runtime evaluation compares the server instant with the predecessor's immutable UTC boundary and exposes structured dependency state in the workspace.

The condition evaluator implements bounded `all`/`any`/`not` trees without JavaScript, `eval`, free code, or dynamic SQL. `weekday`, `local_time`, organization flags, location activity, concrete standard revision presence, previous task status, and transfer status come from the run/context projections. Event-zone and booking facts remain `pending_external` until Phase 10H; an ambiguous asset fact does the same. Matched work is included, unmatched unstarted work is excluded, and inclusion is monotonic after work begins. Facts and evaluator version are stored, while the original core snapshot fields remain immutable for hash verification.

The new `complete_predecessor_on_successor` dependency is limited to a continuous predecessor and checkpoint/gate successor, with one automatic successor per predecessor and the existing cycle rejection. Eligible continuous work can be system-started after its boundary with a system actor event. Successful successor completion can system-complete an open predecessor with `system_completed`; blocked work or work with unresolved required items/blocking deviations remains open.

Operational-date correction never edits run identity. `supersede_routine_run_operational_date(...)` is manager-only and limited to untouched scheduled runs. It creates a distinct run with new core/timing snapshots, copies active participation/role history, marks the old run superseded, and records an immutable `routine_run_date_supersessions` link plus events. A started or historically active run returns `started_run_date_correction_requires_history_correction` and must use the Phase 10E additive correction model.

The full time completion hook reports blockers, warnings, timing counts, next required boundary, overdue/hard-deadline IDs, and pending-condition IDs. It detects non-ready or tampered timing, missing timing rows/results, early completion, pending/error conditions, future mandatory windows, unreached time dependencies, and open continuous work. Phase 10F deliberately retained the Closing delivery stub; the Phase 10G layer below replaces it.

Public read RPCs are `get_routine_operational_clock`, `get_routine_run_timing_state`, `verify_routine_run_timing_snapshot`, `list_current_routine_runs`, and `get_routine_task_timing`. Workspace, core snapshot verification, and completion validation include timing/condition information. The operation ledger remains manager-only. The three Phase 10F tables grant `authenticated` only `SELECT`, narrowed by personal active profile, exact organization, and visible-run RLS; all mutation is through RPCs. Counter-only, shared-device, inactive, organization-less, cross-organization, and anonymous access is denied.

The isolated client modules are `routineOperationalTime.js` and `routineTimeClient.js`. They normalize server responses, format display-only durations/lateness, expose server-provided action hints, retain idempotency keys on retry, and normalize timing/stale/auth/RLS/network failures. They contain no direct table DML, service credential, local operational-date algorithm, DST resolver, client-authoritative clock, offline outbox, Realtime, or React component.

Phase 10G implements Closing delivery below. Authoritative Event Operations facts and acceptance are deferred to Phase 10H. Realtime and offline behavior are deferred to Phase 10I. No `O01`–`O37`, `C01`–`C46`, or `DS01`–`DS04` content is seeded, and no production migration or production run has been created.

## Phase 10G Closing delivery and next-Opening comparison

Phase 10G adds `supabase/phase10g_routine_closing_delivery.sql` as a separate additive layer. It does not seed actual Opening, Closing, or Double Shift tasks. A published `routine_template_task_relations` row with `relation_type = 'delivery_comparison'` is the only source of a delivery contract; database functions contain no Mesh task keys.

The relation metadata vocabulary is closed to `deliveryKey`, `label`, `category`, `comparisonMode`, `required`, `allowNotApplicable`, `scopePolicy`, `evidenceItemKeys`, `requireValidTaskVerification`, and `requireValidRunVerification`. Comparison mode is `ready_on_arrival` or `control_result`, and Phase 10G supports only `same_scope`. Validation rejects unknown fields, unstable or duplicate keys, missing/inactive source evidence, ambiguous or cross-organization targets, incompatible target assessment policies, inconsistent N/A or verification requirements, self/reverse cycles, and ambiguous publication batches. Warnings identify required deliveries that allow N/A, manager-override sources, absent structured evidence, optional verification, and placeholder images. Batch targets take precedence over an older current publication. Relation metadata remains covered by the existing template hash, while changing the concrete current image version still does not change that hash.

Three immutable tables hold the operational evidence:

| Table | Purpose | Main guarantees |
| --- | --- | --- |
| `routine_delivery_records` | One Closing delivery envelope per source-run finish sequence | Same-organization run FK, unique positive finish sequence, prior-record link within the same run, responsibility/run-verification snapshots, SHA-256 record identity |
| `routine_delivery_items` | One declared delivered standard | Same-record/run/task/relation FKs, unique delivery key/target/order, snapshotted contract and evidence, server-derived reported status, SHA-256 item identity |
| `routine_delivery_comparisons` | Opening's write-once assessment against selected delivery | Same-organization Opening and Closing links, same deviation as the assessment, immutable sequence/supersession shape, SHA-256 comparison identity |

An item snapshots the source task identity, status, outcome, revision, completion actor/time, current passed task verification, selected or all active task-item values, concrete standard revisions/values, locations and external source identities, all task deviations, relevant overrides and the override valid at finish, and the concrete image versions already pinned in the run. The record snapshots the published template/version hashes, core and timing snapshot hashes, run revision/finish sequence, deterministic active operational-role assignments, and the current passed final verification with its task revisions. Supported reported statuses are `delivered_to_standard`, `delivered_after_correction`, `delivered_with_override`, `delivered_with_deviation`, `not_applicable`, `transferred`, and `unavailable`; clients never select one.

`routine_preview_run_delivery(...)` is read-only and builds the exact proposed items and hashes. It blocks invalid core/timing snapshots or relations, duplicate keys/targets, missing or unhandled source work/evidence, forbidden N/A, transfers, blocking deviations, invalid overrides, stale required verifications, missing standards, and malformed concrete image evidence. A transfer is explicitly blocked as `delivery_transfer_resolution_pending_phase10h`; Phase 10G never presents Event Operations transfer evidence as completed Closing evidence. Warnings cover accepted N/A, correction/override/deviation delivery, placeholders or missing captions, nonblocking timing issues, late completion, optional verification, and an upcoming supersession.

`finish_routine_run(...)` retains its public signature and invokes the full `routine_finalize_run_extension(...)` in the same locked transaction after the run receives its actual finish sequence. A valid contract creates one record and its deterministically ordered items, verifies all hashes, and writes system-actor generation events using the finish operation. Failed validation, waiting transfers, or any generation/hash failure creates no delivery data and rolls back the finish. Idempotent replay returns the stored record. Reopening never edits the old record and makes it ineligible as a current prior delivery; refinish creates a higher sequence linked through `supersedes_delivery_record_id` and emits one supersession event.

The item hash covers the declarative contract, source task/result/revision/completion, verification, structured evidence, deviations, overrides, standard values and concrete image-version evidence. The record hash covers the source identity/date/scope, template/core/timing identities, run revision, finish sequence, prior record hash, role/final-verification snapshots, and ordered item hashes. Created timestamps and operation IDs are excluded. Read-only verification recomputes hashes and reports current finish-sequence/state and supersession integrity without repairing data.

For an Opening task, the server selects the latest prior operational date from the same organization, target routine/task and scope. Only a still-finished source run whose record sequence equals its current finish sequence is eligible; reopened, cancelled, superseded, stale-sequence, same-date, and future records are excluded. Gaps for weekends or closed days are valid. An equally current multi-record result is `ambiguous_previous_delivery`, which records `not_comparable` instead of treating a candidate as authoritative.

`record_routine_initial_assessment(...)` retains its public signature, lifecycle/timing/condition/revision/idempotency checks, and write-once assessment. It records one comparison in the same transaction: standard/corrected plus ready is `matched`; standard/corrected plus an issue is `mismatch`; override/deviation plus an issue is `confirmed_prior_deviation`; override/deviation plus ready is `resolved_after_delivery`; no eligible delivery is `no_previous_delivery`; and incompatible/ambiguous/N/A/transferred/unavailable evidence is `not_comparable`. A mismatch reuses the assessment's single `opening_closing_mismatch` deviation, linked to the previous Closing run/task. Confirmed prior deviation also links the assessment deviation to the previous run/task without inventing a second fault. Comparison events use the real Opening actor; delivery-generation events use a system actor.

UPDATE and DELETE triggers protect all three tables, and direct authenticated INSERT/UPDATE/DELETE is absent. Historical mistakes use additive `routine_corrections` entity types `delivery_record`, `delivery_item`, and `delivery_comparison`; no correction changes the source row. Read RPCs expose preview, one record and its chain/verification, previous selection, comparison history, bounded manager/coordinator history, and mismatch accountability. Workspaces and task/run timelines include delivery, comparisons, events, and separate corrections. Non-coordinator correction detail is reduced to a visible summary.

All three tables have RLS and explicit authenticated `SELECT` only. Managers see own-organization data; shift leads see the permitted own-organization operational/history view; source participants see their source delivery; Opening participants see only the exact server-selected prior item and their own comparisons. Nonparticipants, counters, shared-device profiles, inactive users, organization-less users, cross-organization users, and anonymous callers receive no broad access. Security-definer helpers use `search_path = pg_catalog`, and authenticated execute grants are limited to public RPCs and narrow visibility predicates.

The isolated client modules are `routineDelivery.js` and `routineDeliveryClient.js`; the run/lifecycle clients only normalize delivery summaries returned by existing RPCs. They contain no direct table DML, local clock/date logic, previous-delivery selection, authoritative status/comparison algorithm, service credential, Realtime, IndexedDB, offline outbox, or React UI. Event-transfer evidence remains Phase 10H, and late-sync comparison reconciliation remains Phase 10I.

## Phase 10H Double Shift and Event continuity

Phase 10H adds `supabase/phase10h_routine_double_shift.sql`. A Double Shift is a coordinating bundle around one authoritative Opening run and one authoritative Closing run; it is not a third routine and does not copy their tasks. The active identity is organization, operational date, `double_shift`, scope, Opening routine key, and Closing routine key. Creation holds an advisory lock, delegates run creation to `create_or_get_routine_run`, and pins both run IDs, template-version IDs, template hashes, core snapshot hashes, and timing hashes. Different request keys for the same logical identity converge on the same bundle and run pair.

The bundle layer consists of six tables:

| Table | Purpose | Main guarantees |
| --- | --- | --- |
| `routine_bundles` | Logical Double Shift identity and server-derived status projection | One active identity, Europe/Oslo, revisioned RPC-only status, cancellation consistency |
| `routine_bundle_runs` | Opening and Closing links | Exactly one link per phase, same-organization/date/scope validation, pinned immutable run/template hashes |
| `routine_bundle_participants` | One person's assignment across the linked runs | Same-organization profile/run links, immutable name/role, expected/actual return, personal revision/status |
| `routine_bundle_steps` | DS01–DS03 per participant and one global DS04 | Completed payload and SHA-256 are immutable; DS04 is system-only and participant-null |
| `routine_bundle_reassignments` | Additive Closing responsibility history | One operation, two distinct same-bundle people, the existing Closing run, immutable reason/actor |
| `routine_bundle_operations` | Request-hash idempotency ledger | Same key/request replays the response; changed request is rejected; manager-only visibility |

DS01 (`confirm_double_shift_plan`) snapshots the operational date, both pinned runs, expected Closing start, active role assignments, current event context, and missing critical roles. An optional local return time is resolved to an authoritative Europe/Oslo instant through the Phase 10F resolver; no critical role is assigned implicitly. DS02 (`complete_double_shift_opening_transition`) requires finished Opening and completed DS01. It records whether the participant stays, leaves temporarily, hands interim operation to another same-organization performer, or cannot perform Closing. The server builds counts and summaries for tasks, deviations, corrections, overrides, transfers, stock/serviceware/event/technical concerns, and creates or reuses exactly one `opening_transition` handover between the pinned runs. It regenerates the handover items and submits the handover in the same transaction.

The deterministic between-shift feed begins at DS02's server completion instant and is ordered by immutable Routine events. Entries expose stable IDs, server timestamps, source/category, summarized actor, phase/run/entity references, severity, and whether action remains. Operation-ledger contents, secrets, and customer detail are excluded. `routine_compute_double_shift_change_feed_hash` hashes only the ordered semantic entries, not the read time. DS03 (`return_to_double_shift`) refreshes external context, conditions, and timing, recomputes the feed, and rejects an older expected hash with `double_shift_changes_updated`. A valid review snapshots the hash/review boundary, records actual return from the server clock, joins through the already pinned Closing assignment, accepts the shared Opening-transition handover when applicable, and advances participant and bundle projections.

`reassign_double_shift_closing` is manager/shift-lead only. It joins an active personal same-organization target to the existing Closing run, creates or reuses the target bundle participant, marks the original assignment `closing_reassigned`, and appends one immutable reassignment. Opening contribution and completed DS steps remain attached to the original person; no Closing run or task completion is recreated. Concurrent attempts serialize on the bundle revision and yield one winner or a stale conflict.

`routine_reconcile_double_shift_bundle` derives bundle status from both run states, DS02, participant return state, and Event-transfer state. Start/finish/reopen/cancel wrappers preserve the established public signatures and reconcile linked bundles in the same transaction. An accepted incomplete Event transfer projects `waiting_for_transferred_event_close`; finished Opening and Closing with valid transfer evidence complete the bundle. DS04 is generated once by the server, with pinned run summaries, participant contributions/personal outcomes, reassignments, deviation/override counts, Event-transfer hashes, final delivery record, physical completion time, and server state. Its payload hash is immutable. A reassigned original participant retains `opening_completed_closing_reassigned` instead of being rewritten as a full-shift completer.

`routine_events.bundle_id` links the existing immutable stream to the bundle without changing earlier events. Bundle creation/run-link/participant, DS01–DS04, departure/return/feed review, reassignment, status, external-context, and Event-transfer acceptance/completion events preserve the true user or system actor. Deterministic event IDs prevent replay duplicates without exposing the bundle operation ledger as a run operation.

### Read-only Event context and condition facts

External resolution uses `routine_run_external_context_states` for the current per-snapshot-source projection and immutable `routine_run_external_context_resolutions` for each distinct semantic payload. The closed source configuration supports only `mode: active_events`, unique known zones, `includeBookings`, and `includeResponsibilities`. Unknown keys/modes/zones, duplicate zones, free filters, and malformed types fail publication. Each resolution contains only operational Event ID/title/status/venue/times, active responsibilities by role/zone, minimal booking/provider identifiers, activity/Closing impact, and source version signals. Calendar title, description, raw payload, and other customer-sensitive fields are not copied.

The private Event bridge reads the actual `event_operations`, `event_role_assignments`, `event_responsibility_handovers`, `external_calendar_events`, and `event_operation_calendar_links` model with exact organization equality. It performs SELECT only: no Event table FK, trigger, grant, or write exists. `refresh_routine_run_external_context` creates a resolution only when the canonical payload hash changes, advances the state pointer, reevaluates conditions and timing, writes Routine events, and changes the run revision only for a material task projection change.

`event_zone_active` and `booking_exists` read only the latest resolved snapshot. Pending/error context remains pending/error and cannot be replaced by client facts. `asset_used_today` delegates to existing authoritative run evidence when unambiguous and otherwise remains pending. Phase 10F monotonicity still prevents started/handled work from disappearing after a later condition refresh.

### Event-transfer authority, evidence, and delivery v2

An Event transfer remains a Routine Engine row. Proposal verifies an active same-organization Event Operation present in the latest resolved context. Acceptance checks the actor's actual active Event role assignment, active responsible identity, latest responsibility handover, or permitted Event-manager profile and snapshots the exact event, resolution, assignment, role, scope, status, actor, authorization source, and SHA-256 in `routine_event_transfer_acceptances`. Completion rechecks authority, requires a physical confirmation (and critical confirmation for critical work), validates a closed item-evidence object against the source run snapshot and existing typed item validator, and appends `routine_event_transfer_completions`. Correction/deviation results require a note; override result requires a current manager override. Acceptance/completion never writes Event Operations.

Completed result mapping is `standard_met → delivered_to_standard`, `completed_after_correction → delivered_after_correction`, `control_completed_with_deviation → delivered_with_deviation`, and `completed_with_manager_override → delivered_with_override`. Rejection by an authorized Event recipient requires a reason, keeps history, creates no acceptance/completion, and restores the source task's valid pre-transfer work state. A completed transfer keeps the source task `transferred`; its immutable evidence, rather than a fabricated local completion, satisfies finish and delivery.

Delivery records/items gain `delivery_schema_version`, `item_schema_version`, and `transfer_evidence_snapshot`. Existing rows remain `phase10g-v1` and use the unchanged Phase 10G canonical hash. A record containing Event-transfer evidence is `phase10h-v2`; its item canonical form includes schema version and the acceptance/completion actor, role, Event identity, evidence, and hashes, and the record hash includes the version and ordered v2 item hashes. Preview blocks proposed, unaccepted, incomplete, or unverifiable transfers and permits only a completed validated Event transfer. Generation remains atomic with finish.

The read API adds `get_double_shift_workspace`, date listing, participant summary, change feed, Event-transfer workspace, and read-only bundle verification. Existing run workspace/timelines, task timeline, delivery preview, and delivery record add bundle or transfer evidence without exposing `routine_bundle_operations` to staff. The isolated `routineDoubleShift.js` and `routineDoubleShiftClient.js` modules normalize these projections and map stale, feed-changed, Event-authority, RLS/auth, and network failures. They use only the normal authenticated RPC client, preserve caller idempotency keys, and contain no direct table DML, organization/status/role/result authority, local operational-date logic, client-clock gating, offline outbox, or React UI.

All ten new tables have RLS. Authenticated receives SELECT only through exact own-organization manager/coordinator, bundle/run participant, or narrow Event-recipient visibility; mutation is RPC-only. The operation ledger is manager-only. Counters, shared devices, inactive/org-less/cross-organization profiles, and anon receive no automatic access. Realtime, IndexedDB, offline outbox, and late-sync reconciliation remain Phase 10I; shared-device operator identity remains Phase 10J. Phase 10H seeds no `O01`–`O37`, `C01`–`C46`, or `DS01`–`DS04` content and creates no production run, bundle, transfer, delivery, bucket, or configuration.

The approved Phase 10H checkpoint is local commit `4c189222b6dca2fb94acfe28d8b812e3d4e4e688` (`feat: add double shift continuity and event transfers`). Phase 10I is deliberately kept outside that commit.

## Phase 10I Realtime and authenticated offline synchronization

Phase 10I adds `supabase/phase10i_routine_realtime_offline_sync.sql` as the only database layer for Realtime, offline receipts, and late delivery reconciliation. `routine_events` is the only operational Routine Engine table added to `supabase_realtime`. Its three cursor indexes cover organization, run, and bundle scope ordered by the stable `(server_created_at, id)` tuple. Publication membership is added only when the publication exists and the table is not already a member. Realtime is a refresh signal, never state authority: every signal is followed by an authenticated workspace refresh, and reconnect/SUBSCRIBED status begins with cursor catch-up. A null cursor has a documented 14-day lookback, a page is capped at 500 rows, run/bundle filters only narrow visibility, and the cursor advances only after all affected workspaces refresh successfully.

Three new RLS tables hold server audit state:

| Table | Purpose | Main guarantees |
| --- | --- | --- |
| `routine_client_instances` | Personal client installation diagnostics | Exact organization/auth/profile identity, stable app/offline-schema versions, bounded platform label, idempotent registration/revocation, throttled touch, no fingerprint/IP/token, no DELETE |
| `routine_offline_operation_receipts` | Immutable server outcome for one typed client operation | Actor-owned client instance, SHA-256 request identity, `applied`/`conflict`/`rejected`, bounded sanitized objects, client time permanently non-authoritative, no direct DML |
| `routine_delivery_reconciliations` | Immutable explanation of comparison supersession | Same-organization source/Opening/comparison/deviation links, one semantic row per new comparison, SHA-256 reason identity, no UPDATE/DELETE |

Registration, touch, revocation, receipt lookup, stable event cursor, and bounded manager sync-health RPCs resolve active personal actors on the server. A client instance is diagnostic and never grants run access. Users can read their own instances and receipts; managers can read own-organization instance metadata and sanitized aggregate health, but not broad raw receipt payloads or a person's IndexedDB. Shared devices remain blocked until Phase 10J.

The only automatic offline mutation types are `task_bundle` and `run_finish_intent`. The task bundle has a closed top-level schema, maximum 100 typed item updates, maximum 20 comments, 256 KiB byte limit, consistent final-action fields, recursive forbidden-key scanning, and the existing task-item value validator. The server recomputes a canonical SHA-256, locks the run/task/items, requires the exact caller-recorded base revisions, and invokes existing claim/start, assessment, item, comment, pause/block/N/A/completion RPCs with deterministic substep idempotency keys. The PL/pgSQL exception block rolls back every substep together. A classified stale write creates a sanitized immutable conflict receipt; it never stores the submitted prose/evidence, changes an expected revision, or performs last-write-wins. Unknown database failures are rethrown without a false receipt.

Concrete time-window, checkpoint, or timing-boundary completion/N/A cannot be applied from an offline bundle. It returns `offline_timed_action_requires_online_confirmation`, changes no server status, and requires a fresh online action. A critical, non-timed completion still requires critical confirmation. On success the server completion timestamp is authoritative and one deterministic, nonblocking `offline_evidence` deviation records that the optional client timestamp is unverified metadata. Its category/reason are `sync` / `offline_action_time_unverified`; it does not change the computed task outcome and appears as a completion/workspace warning. It can later follow the ordinary additive deviation resolution/annotation history.

The run-finish intent similarly requires an owned non-revoked client instance and exact run revision, then calls the existing `finish_routine_run`. Delivery generation and Double Shift hooks run unchanged. The client cannot show finished/confirmed until an applied receipt exists. An unknown transport outcome first probes the immutable receipt and, only when absent, retries the identical operation and key.

Late Closing delivery correctness is transaction-local, not a background job. The finalization hook reconciles newly generated/refinished records before commit; the reopen hook recomputes affected Openings before commit. Each assessed Opening task uses an advisory transaction lock, re-runs the server's previous-delivery selector and comparison function, and compares the resulting semantic hash with the latest immutable comparison. An unchanged result is a no-op. A changed selection/item/result creates sequence `n + 1`, points `supersedes_comparison_id` to the old row, appends one reconciliation row, and emits system events. Reopen makes the old current delivery ineligible and can fall back to an older record or `no_previous_delivery`; refinish can select the new current record. The initial assessment, old comparisons, Closing deliveries, delivery hashes, deviation detection history, and resolved deviation state are never rewritten. Issue assessments reuse the deviation ID stored by their original assessment operation; ready assessments never invent a deviation.

`get_routine_delivery_reconciliation_history` returns latest/history, reconciliation reasons, previous/current source evidence, linked deviation, events, and additive corrections. Delivery comparison, run workspace, task/run timeline, and mismatch reads expose the same history without collapsing older rows. New event types cover instance lifecycle, applied offline operations/evidence, conflicts, reconciliation, late links, and invalidated previous delivery. Organization-level instance events are the only permitted run-null event shape; existing run-event visibility and RLS remain intact.

The isolated client modules are:

- `routineSyncModel.js`: closed constants, canonical hashing, forbidden-key/size validation, receipt/cursor/health normalization, retry classification, and separate pending overlay;
- `routineSyncClient.js`: authenticated RPC-only API and receipt-first recovery for unknown outcomes;
- `routineRealtime.js`: organization-filtered `routine_events` subscription, run/bundle client filter, duplicate suppression, debounce, catch-up status, and cleanup;
- `routineOfflineDb.js`: native IndexedDB schema version 2, principal partitioning, TTL/retention, purge/quarantine, diagnostics, cursors, and fallback leases;
- `routineOutbox.js`: closed operation registry, pre-send coalescing, dependencies, resource serialization, immutable sending identity, and explicit post-conflict new IDs;
- `routineSyncEngine.js`: caller-owned lifecycle, authoritative refresh, Web Locks leader, expiring IndexedDB lease fallback, BroadcastChannel wake/status, deterministic processing, receipt mapping, and bounded retry/backoff.

IndexedDB partitions every store by `organizationId:authUserId`. `workspace_cache` contains only server-confirmed snapshots; `drafts` and `outbox` are separate and survive refresh, network errors, auth expiry, and conflict. `sync_cursors`, `leases`, and `meta` have independent key spaces. Queued completion never changes cached status to completed, and queued finish never changes it to finished. Conflict overlays present server state and local draft side by side without automatically merging prose/evidence. Logout callers explicitly purge or quarantine the prior principal; the next principal cannot read it. Confirmed outbox rows can be pruned after 30 days and cache/drafts by TTL; conflict/rejected rows require explicit handling. No image Blob, session, token, sensitive code, or payment data is stored. `fake-indexeddb` is an exact-pinned development-only dependency so the Node verifier can exercise the same native API without a network or runtime bundle dependency.

`public/sw.js` remains unchanged. It currently provides app-shell GET caching only; it does not execute background sync or critical authenticated mutations after the application closes. Phase 10I therefore depends on no background-open window and makes no service-worker authority expansion. Full PWA/asset-cache verification remains Phase 10K.

Phase 10I adds no React component, manager/staff surface, shared-device identity, production content, or O/C/DS seed. Shared-device operator identity is the separate Phase 10J layer below, UI/pilot remains Phase 10K, and the actual `O01`–`O37`, `C01`–`C46`, and `DS01`–`DS04` content remains Phase 10L. No production migration, publication change, receipt, reconciliation, run, bundle, transfer, or delivery was created while implementing or verifying this phase.

## Phase 10J secure shared-device operator identity

Phase 10J adds `supabase/phase10j_routine_shared_device_identity.sql` after the committed Phase 10I checkpoint `009f979433ca0b2d49fe60bb470af5734396e7ab`. It does not replace or modify the Phase 7A device-login implementation, its data, `staffCodes`, `App.jsx`, or the legacy routine flow. A Phase 7A shared-device profile remains only the personally unauthoritative Supabase Auth principal for one physical device. Routine Engine access additionally requires an active `routine_shared_devices` enrollment, an allowed operator, and a valid short-lived operator session. A shared device without that session has no operational Routine Engine identity or data access.

The registry consists of enrolled devices, linked or temporary operators, per-device operator access, versioned credentials, device/operator throttles, append-only attempts, short-lived sessions, immutable manager/auth operations, and immutable security events. Device enrollment binds one active non-manager shared profile, stable key, bounded session policy, revision, and manager idempotency identity. Linked operators bind an active same-organization personal profile with the same non-manager role; temporary operators have no linked profile and are limited to `staff` or `time2staff`. Role/profile drift, deactivation, validity expiry, access change, credential rotation, client revocation, or device disablement invalidates active authority.

Effective capabilities are always the intersection of operator role, device access, and device policy. Task work requires `allow_task_actions`; run coordination requires both explicit access and a linked `shift_lead` or `event_floor_manager`; Event transfer work requires a linked profile, explicit access, and the existing Event Operations assignment/handover authority. Shared access can never grant manager, template, configuration, override, or history-correction privileges. Those operations continue to require a personal manager Supabase session.

PINs are 6–12 numeric digits and reject repeated, common, paired, and simple ascending/descending sequences. Creation and rotation use pgcrypto bcrypt with cost 12; only the salted bcrypt string is stored, it is immutable, and `authenticated` cannot select the credential table. The raw PIN exists only inside the create/rotate/auth/reauth request and is excluded from request hashes, operations, events, receipts, diagnostics, logs, and client storage. Device and device/operator throttles are updated under an advisory transaction lock. The bounded failure window and lockout policy prevents parallel attempts from bypassing the threshold while all client-facing failures remain the same generic `operator_auth_failed` result.

The browser generates a random session UUID and 32-byte secret with Web Crypto, sends only its SHA-256 digest during authentication, and constructs `v1.<session-uuid>.<43-character-base64url-secret>`. PostgreSQL stores only the digest and performs a constant-time comparison with the secret decoded from `x-mesh-routine-operator-session`. The full token is sent only as that Routine Engine request header after authentication; it is never an RPC payload or URL value. It may exist in memory and the same tab's `sessionStorage`, but never localStorage, IndexedDB, BroadcastChannel, events, receipts, diagnostics, logs, or source. The session is bound to organization, enrolled device, client instance, operator, linked-profile snapshot, role, access revision, operator revision, and credential version. Server time controls absolute expiry, idle expiry, throttled touch, and credential freshness.

`routine_resolve_effective_actor()` resolves every authoritative call to either the unchanged personal actor or a validated shared-device operator. Its shared result records the authenticated device UID/profile separately from the effective operator, optional linked profile, display name/role, session, device, source, and capability set. Compatibility helpers and visibility functions consume this result. Run and Double Shift participants have an explicit personal-profile or shared-operator identity, separate partial uniqueness, immutable identity snapshots, and operator-aware run/bundle visibility. The same operator can resume participation after reauthentication; two operators on one device remain separate principals.

Routine events, run/task/item projections, deviations, verification, handover, transfer, Double Shift steps, delivery comparisons, operations, and receipts gain explicit operator/session/source fields where they carry actor state. The authenticated device account is never presented as the worker. Critical shared actions require a server-checked fresh credential timestamp: critical task completion and verification, run verification and finish, and critical Event-transfer completion. Personal users retain their prior behavior. Event Operations tables, functions, policies, assignments, and data are not changed; Phase 10J only resolves a linked profile against their existing authority from a Routine Engine helper.

Existing `phase10g-v1` and `phase10h-v2` delivery hashes and rows remain byte-stable. A new shared-operator delivery is `phase10j-v3` and chains the prior canonical item/record hash while adding an immutable operator identity snapshot containing actor source, device, operator, linked profile, and session references—never a PIN, credential hash, secret, or token. Client instances remain device-level and can be registered before operator authentication, but grant no operational authority. Offline receipts add operator/session/source identity and operator-scoped replay/read uniqueness.

IndexedDB schema version 3 uses `organizationId:deviceAuthUserId:operator:operatorId` for shared principals while the client-instance record stays under the device-level principal. Operator switch/session end stops sync and quarantines the prior principal; another operator cannot see or submit its drafts/outbox. A noncritical untimed draft may queue only with its operator identity and may send only while the same operator session is active. Critical completion, run finish, DS03, Event acceptance/completion, and identity/manager mutations are online-only. There is no automatic revision rebase, conflict merge, or silent fallback to the device identity.

Personal actors continue to use the Phase 10I `routine_events` Postgres Changes signal. Shared operators never create a Postgres Changes channel; they use the operator-scoped cursor RPC on session start, interval, focus, and reconnect, and stop polling on session end/operator switch. All production Routine Engine API clients route through the centralized request client, which injects the dedicated header per request while preserving the existing personal Supabase Auth session. Device/operator/admin read models expose only sanitized device, operator, access, aggregate attempt, lockout, participant, and security-history projections.

Phase 10J adds no React manager or employee surface; that work remains Phase 10K. It seeds no device, operator, credential/PIN, session, `O01`–`O37`, `C01`–`C46`, or `DS01`–`DS04` data. Verification uses runtime-only disposable secrets and a network-isolated PostgreSQL container. No production migration, Auth change, production data write, device enrollment, operator, credential, session, deployment, push, or feature activation was performed. The accepted Phase 9L baseline remains exactly: `Phase 9L requires exactly one approved August shelf/storage source session.`

## Phase 10K1 application shell and server-enforced pilot gate

Phase 10K is deliberately split so rollout authority, UI breadth, and historical compatibility are reviewed independently. Phase 10K1 supplies only the lazy-loaded application shell, release/pilot gate, read-only preview, and shared-device operator login. Phase 10K2 will supply the complete manager template/reference editor; Phase 10K3 will supply the operational employee checklist; Phase 10K4 will supply the legacy-history adapter. K1 therefore exposes no task/run/delivery/Double Shift mutation button and contains no template editor or history adapter.

`routine_organization_settings` gains deployment-controlled `ui_release_stage` and `ui_contract_version`. The contract version is `phase10k1-v1`. The closed release stages are:

| Stage | K1 meaning |
| --- | --- |
| `foundation` | Schema/client contract installed; mode may remain legacy or be explicitly set to shadow |
| `manager_preview` | Reserved explicit manager-preview rollout stage |
| `staff_preview` | Reserved read-only staff-preview rollout stage |
| `pilot_ready` | Minimum later stage for pilot mode; K1 cannot set this stage |
| `production_ready` | Required later stage for active mode; K1 cannot set this stage |

The mode gate remains server authoritative. `legacy` returns a minimal hidden state, no launcher, no operator login and no operational access. `shadow` permits a personal manager preview/configuration foundation and an explicit pilot member's read-only preview, but all run/task/delivery/bundle/transfer mutations remain blocked by permission helpers and table guards. `pilot` requires at least `pilot_ready`, and `active` requires exactly `production_ready`; the K1 manager mode RPC rejects those transitions with `routine_ui_not_pilot_ready` and `routine_ui_not_production_ready`. It permits only revision-checked, reasoned, request-hash-idempotent transitions between `legacy` and `shadow`, records immutable UI operations/events, and never rewrites an existing run.

`routine_pilot_memberships` records either one same-organization personal profile or one same-organization shared operator, never both. Identity shape, access level (`preview`, `participant`, `coordinator`), validity, positive revision, creation idempotency and request hash are constrained. The manager RPC validates active/non-shared staff or shift-lead profiles, active/valid operators and underlying Phase 10J capabilities; manager, counter, shared-device profile, inactive, cross-organization and over-privileged assignments are rejected. Replacement is a complete deterministic desired state with optimistic settings revision and deactivation instead of deletion. Identity and creation audit fields cannot be rewritten.

`routine_ui_operations` is an immutable, tenant-bound request-hash/idempotency ledger. K1 installs the two release/pilot mutations; K2 extends the same ledger with the narrow logical-template active-state operation. Secret-shaped response payloads are rejected. Authenticated clients have only RLS-filtered `SELECT` on the two new tables and no direct `INSERT`, `UPDATE` or `DELETE`; anon has no access. Managers can read own-organization membership/operation administration, a personal or shared member can read only its own membership, and a shared operator can neither see the UI ledger nor invoke manager work. Private helpers and triggers have no application-role execute grant.

`get_routine_application_bootstrap()` is the only UI authority. Its sanitized `phase10k1-v1` response includes release/mode/access decisions, identity and safe linked-profile/device/session summaries, deny-by-default capabilities, authoritative Europe/Oslo server clock and operational date, sync mode, visible counts, backend version and empty-state reason. Draft count is manager-only. Legacy receives no operational summary; a registered shared device without a valid operator session receives only safe mode/release/device context plus `operator_required`, while the dedicated Phase 10J auth RPC returns its allowed operator list. No PIN, credential/session secret or token, ledger, raw receipt, or unauthorized manager payload is returned.

The React integration adds one isolated `showRoutineEngine` state to `App.jsx`. Launcher, workspace and error boundary are dynamic imports; legacy remains the initial and back-button view, and existing Inventory and Event Operations dynamic imports remain intact. The launcher fetches bootstrap only after Supabase Auth, is absent in legacy, says `Routine Engine v2 Preview` in shadow, and degrades to a retry/legacy-available state if the backend or network is unavailable. The read-only preview shows the actual personal/shared identity, server date/clock, sync status, safe zero-content state and K2 deferral notice, with no operational controls.

The shared-device gate uses the Phase 10J header/session module, a server-provided device/operator list, disabled lockout state, a labelled masked numeric PIN input, generic errors, double-submit protection, arrow/Home/End and native keyboard control, server session expiry/freshness, explicit switch/end actions, and no fallback to Workbar Device identity. PIN state is cleared after every attempt and never enters browser persistence. Invalid/expired sessions stop sync, clear the dedicated session token and return focus to the operator gate while operator-scoped quarantined drafts remain available for the same principal after reauthentication.

Sync starts only while the workspace is open and bootstrap proves a valid preview principal. A personal actor uses the existing Postgres Changes signal plus authoritative cursor catch-up. A shared operator creates no Postgres Changes channel and uses cursor polling. Workspace exit, logout, principal change, invalidation, switch and session end unsubscribe/stop before the old identity can continue. K1 exposes no outbox mutation control.

The shell reuses global design variables and focus treatment. It has no global reset or font, uses safe-area padding, `min-width: 0`, text status in addition to color, live regions, 48-pixel controls, and responsive layouts verified without horizontal overflow at 320, 375, 390 and 430 pixels, in dark mode and with 200% root text. A separate `routine-ui-harness.html` exists only as an unreferenced local Vite entry for disposable browser verification; `index.html`, `src/main.jsx`, `App.jsx`, and the production build do not import it.

Phase 10K1 does not activate an organization, install SQL in production, seed content, or create any production device, operator, PIN, credential, session, run or bundle. Opening, Closing, Event Operations, Stock Count, Inventory Storage, Auth, legacy routine data/client code and `public/sw.js` remain unchanged. No `O01`–`O37`, `C01`–`C46`, or `DS01`–`DS04` content is seeded. The accepted Phase 9L baseline remains exactly `Phase 9L requires exactly one approved August shelf/storage source session.`

## Phase 10K2 Manager Control Center

Phase 10K2 advances an existing `foundation` settings row to the deployment-controlled `manager_preview` UI release stage and contract `phase10k2-v1`. The transition is timestamp-stable, does not create settings rows, does not lower a later release stage, and never changes engine mode. Managers may still explicitly choose only `legacy` or `shadow` through the existing K1 mode RPC; `pilot` and `active` remain unavailable and no operational run/task control is exposed.

Seven sanitized read/preview RPCs supply the Control Center, foundation workspace, template workspace, structured version diff, atomic publication-batch preview, reference workspace, and release readiness. One narrow K2 mutation RPC sets only `routine_templates.active` plus its revision/update audit; it row-locks the same-organization template, requires a trimmed reason and expected revision, uses the existing K1 request-hash/idempotency operation ledger, and never changes a published pointer, version, draft, content hash, run, task or snapshot. Every K2 RPC resolves an active same-organization personal manager on the server and explicitly rejects shared-device actors, staff, inactive/cross-organization profiles and operator PIN reauthentication. Grants are exact authenticated `EXECUTE` grants; every other mutation reuses the existing Phase 10A/10B/10C/10J or K1 RPC, and the client receives no direct table DML authority, credential/session hashes, PINs, tokens, raw security operations, or editable Storage path.

The lazy-loaded Manager Control Center lives under `src/features/routines-v2/manager/`, outside `App.jsx`. It contains the release overview, pilot desired state, locations and ordered location sets, logical standards and immutable revisions, logical template overview, versioned section/task/item editor, closed condition builder, timing editor, dependency/cross-run relation editors, reference-link editor, authoritative validation, structured human-readable diff, and explicit publication confirmation. The template overview exposes reasoned Activate/Deactivate confirmation only to the already server-gated personal manager surface. Unknown network outcomes reuse the same idempotency key, conflicts preserve the reason and show local/server revisions, and deactivation explains that new runs are prevented while published versions and historical runs remain unchanged. A single publish calls the existing atomic batch-publish RPC with one version. Published versions remain available read-only even when their logical template is inactive, and publication neither creates a run nor changes mode.

Editor state is separated from server state. Revision, network, auth and server-validation failures preserve the local draft and expose explicit refresh, keep-for-manual-reapply, or discard actions; there is no automatic merge or rebase. Dirty navigation has one warning. The UI uses keyboard move controls, labelled/helped inputs, error descriptions, text statuses, a keyboard tablist, focus-trapped dialogs with Escape/focus return, 48-pixel mobile targets, responsive layouts, dark mode and 200% text zoom.

Reference Manager creates logical placeholders and uses only the Phase 10C prepare → server-path upload → finalize flow for JPEG/PNG/WebP replacement. The old image survives upload/finalize failure; removal creates an immutable placeholder version, version history and usage are read-only, alt text is required, and private object paths are never constructed or editable in the client. Operator/device administration reuses Phase 10J for enrollment, policy, desired access/capability intersection, activation, session revocation and sanitized history. Initial/rotated PINs use two inputs, are cleared after both successful and failed requests, and are never logged or persisted.

Release readiness is server authoritative across foundation, locations/routes, standards, templates, references, operators/devices, pilot access, operational content, security and testing. A published but inactive required Opening or Closing template is an explicit blocker and is never treated as operationally ready. Missing `O01`–`O37`, `C01`–`C46`, and `DS01`–`DS04` content remains blocked, and K2 does not set `pilot_ready`. Phase 10K2 performs no production activation or seeding. The operational employee flow remains Phase 10K3, history/legacy and rollout hardening remain Phase 10K4, and real O/C/DS content remains Phase 10L.

## Phase 10K3 Operational Employee Workflow

Phase 10K3 advances only existing `manager_preview` settings to `staff_preview` and contract `phase10k3-v1`. The repeatable transition does not create settings, change `mode`, lower a later stage, or change timestamps/revisions after its first application. `shadow` remains read-only, while `pilot` and `active` remain server-blocked because K3 does not set `pilot_ready` or `production_ready`. The migration creates no template, run, task, bundle, handover, transfer, operator, PIN, session, or seeded O/C/DS content.

Six authenticated, tenant-strict read RPCs provide the employee home, run action context, task action context, handover context, transfer/Event-transfer context, and Double Shift context. They resolve the effective Phase 10J actor, use authoritative operational time, timing/dependency/condition state, participation and Event authority, return explicit action flags and reason codes, and omit manager ledgers and credential material. Their grants are authenticated-only with fixed `pg_catalog` search paths. The run projection composes the pure Phase 10D workspace with read-only lifecycle, timing, delivery, handover and transfer projections; it does not call the condition-evaluating public completion workspace and therefore creates no event or other operational row.

The separately lazy-loaded employee workspace supplies Employee Home, run start/join, reusable Opening/Closing run workspaces, task groups (`Do now`, `In progress`, `Waiting`, `Next`, `Later`, `Completed`, plus a non-exclusive `Deviations` view), deterministic next-task selection and compact, expandable task cards. Cards show human instructions and location before status/timing/assignment, then server-selected previous Closing evidence, initial assessment, typed item controls, references, and the authoritative action set. The client reuses Phase 10D–10J mutation clients for run, task, verification, handover, transfer, Event-transfer and DS actions; it adds no parallel lifecycle API and performs no table DML.

Initial assessment is server-policy-driven for ready-on-arrival and control-result choices. Typed item drafts serialize to the existing closed check/count/quantity/measurement/text/choice/status/location/asset/product schemas. Comments remain immutable event RPC calls. Deviation, N/A, completion and verification panels preserve local prose and item drafts on stale revision, auth expiry, validation or network failure. The client never supplies a task outcome. Critical task/run/Event-transfer actions use the Phase 10J reauthentication dialog; the numeric PIN is cleared in `finally` after every success or failure and is never persisted or logged.

Reference images expand inline without leaving the task, use the server-returned pinned snapshot path through the existing downloader, lazy-load, expose caption/alt text, support a focus-trapped full-screen viewer and revoke object URLs on cleanup. Previous Closing selection and comparison are displayed exactly as returned by the delivery engine; the client neither selects evidence nor computes matches. Handover supports create/get, immutable generated items, editable manual items, refresh, submit and accept. Transfer supports proposal and routine/Event recipient actions with typed evidence, physical check, critical confirmation and server-derived Event authority without writing Event Operations.

Run progress and finish show handled/remaining/critical/blocked/deviation/timing/transfer/sync state, completion blockers and warnings, required handover and verification, and Closing delivery preview. Finish, verification, reopen and cancel remain receipt- and revision-controlled. Double Shift is one continuity workspace: DS01 plan and linked runs, DS02 server summary and transition, between-shift state plus hash-bound change feed, DS03 return and Closing join, reassignment that preserves Opening contribution, and the server-generated DS04 contribution/outcome summary. It never creates a third copied task list.

Phase 10I server cache remains separate from operator-scoped local drafts and pending overlays. The UI distinguishes local draft, queued, sending, sync pending, conflict, rejected, auth-required and operator-reauth states; queued work never colors a task complete or run finished. Conflict controls expose server and local revisions without auto-merge or auto-rebase. Personal users retain Realtime refresh, shared operators use cursor polling, and subscriptions clean up on unmount/principal change. A shared device without a valid operator session has no employee data and never falls back to device identity.

The employee surface is mobile-first with safe-area padding, no fixed mobile minimum width, 48-pixel controls, keyboard focus treatment, focus-trapped/Escape-close dialogs with focus return, live regions, textual statuses, dark mode, 200% text support, wrapping titles and non-obscuring sticky progress. `routine-employee-harness.html` is a test-only Vite entry covering 60 disposable browser scenarios and is not imported by `index.html`, `src/main.jsx`, `App.jsx`, or the production bundle. Phase 10K4 remains responsible for history/legacy adaptation and rollout hardening; Phase 10L remains responsible for approved `O01`–`O37`, `C01`–`C46`, and `DS01`–`DS04` content. No production activation is part of K3, and the accepted Phase 9L baseline remains exactly `Phase 9L requires exactly one approved August shelf/storage source session.`

## Migration order

Apply the migration only after the repository's existing schema and completed Phase 9 migration chain, with Phase 9P remaining the terminal Phase 9 layer. Phase 10A is then the next additive layer:

1. existing `supabase/schema.sql` and pre-Phase 9 application migrations;
2. the canonical Phase 9 manifest through Phase 9P;
3. `supabase/phase10a_routine_engine_foundation.sql`;
4. `supabase/phase10b_routine_templates.sql`;
5. `supabase/phase10c_routine_reference_images.sql`;
6. `supabase/phase10d_routine_runs_and_snapshots.sql`.
7. `supabase/phase10e_routine_task_lifecycle.sql`.
8. `supabase/phase10f_routine_operational_time.sql`.
9. `supabase/phase10g_routine_closing_delivery.sql`.
10. `supabase/phase10h_routine_double_shift.sql`.
11. `supabase/phase10i_routine_realtime_offline_sync.sql`.
12. `supabase/phase10j_routine_shared_device_identity.sql`.
13. `supabase/phase10k1_routine_ui_pilot_gate.sql`.
14. `supabase/phase10k2_routine_manager_control_center.sql`.
15. `supabase/phase10k3_routine_employee_workflow.sql`.

All Phase 10 migrations through K3 are safe to reapply against their own completed schema. Phase 10I preserves instance/receipt/reconciliation rows and timestamps, adds `routine_events` publication membership only once, and recreates functions, policies, and triggers without repairing or reordering earlier migrations. Phase 10J preserves all existing hashes and historical rows, and its own reapplication preserves device/operator/session/audit rows and timestamps. Phase 10K1 preserves pilot/settings/operation rows and timestamps. Phase 10K2 advances only existing foundation-stage rows, preserves later stages, settings timestamps and every earlier hash/protected-domain fingerprint, and writes no run, task or template row. Phase 10K3 advances only existing manager-preview rows, preserves later stages and all operational data/timestamps, and grants six read-only employee projections without adding a write contract.

## Defaults and open configuration

The schema defines conservative defaults but does not create an organization settings row:

- mode: `legacy`;
- timezone: `Europe/Oslo` only;
- operational-day cutoff: `04:00`;
- shared-device support: disabled;
- UI release stage: `foundation`;
- UI contract: `phase10k1-v1` at K1 foundation, `phase10k2-v1` after manager preview, and `phase10k3-v1` after the staff-preview transition;
- reopen window: 24 hours, constrained to 0–168 hours.

Before a later rollout phase, product owners must approve the organization rollout mode, location catalog and hierarchy, location-set membership, the complete `O`, `C`, and `DS` content mappings, standard values/units/effective dates, source-adapter behavior, approved actual Mesh reference images, and whether shared-device operation is introduced. No value in this list is activated by Phase 10A, 10B, 10C, or 10D. No `O01`–`O37`, `C01`–`C46`, `DS01`–`DS04`, random illustration, actual Mesh image, production run, or production snapshot is seeded; content is deferred to Phase 10L.

## Verification and known baseline

`npm run verify:routine-foundation` starts a uniquely named, network-isolated disposable Supabase PostgreSQL container. It applies a representative existing baseline, fingerprints Inventory and legacy routine objects, applies Phase 10A repeatedly, runs SQL integrity/RLS tests, and compares the protected fingerprints. It also uses two real database connections to prove that concurrent writes cannot allocate the same standard revision: one succeeds and one stale writer is rejected.

`npm run verify:routine-templates` applies Phase 10A and 10B twice in another uniquely named, network-isolated disposable PostgreSQL 17 container. It executes 94 SQL assertions across schema, immutability, lifecycle, validation, publishing, RLS, and regression boundaries. Two real connections prove that concurrent draft creation produces at most one draft and that concurrent identical publish calls converge on one immutable publication batch. It fingerprints Inventory, legacy routine, Event Operations, and Auth objects and verifies data-stable migration reapplication.

`npm run verify:routine-reference-images` applies Phase 10A, 10B, and 10C to another uniquely named, network-isolated disposable PostgreSQL 17 container. It executes 151 SQL assertions across schema, lifecycle, immutable versions/links, hashing, validation, publishing, Storage policy behavior, cleanup, paths, RLS, grants, and protected-domain regressions. Two real connections prove unique concurrent version allocation with stale rejection and convergence of identical finalize calls on one immutable operation. The runner also tests JPEG/PNG/WebP magic bytes, MIME mismatch, oversize rejection, and deterministic client normalization without network access. It fingerprints Inventory Storage and protected Inventory, legacy, Event Operations, and Auth schemas, then proves Phase 10B-plus-10C reapplication is data- and timestamp-stable.

`npm run verify:routine-runs` applies Phase 10A through 10D twice to a fresh uniquely named, network-isolated PostgreSQL 17 container. It executes 142 SQL assertions covering the 12-table schema, authoritative identity, atomic snapshot construction, every read-only source adapter, pending conditions, concrete images, immutable hashes, participants, role assignments, RLS, grants, historical Storage reads, rollback, tenant isolation, tamper detection, and protected-domain regressions. Separate real database connections prove convergence of concurrent run creation, idempotent concurrent participant joins, and single-winner optimistic role assignment. The runner then reapplies the dependent migration chain and verifies data-, hash-, timestamp-, template-hash-, and protected-domain stability. Offline model tests cover client normalization and snapshot-integrity diagnostics.

`npm run verify:routine-lifecycle` applies Phase 10A through 10E to a uniquely named PostgreSQL 17 container with `--network none` and no image pull. It reapplies 10E, executes 255 SQL assertions over schema/RLS/RPC/audit/read-model behavior, fingerprints Inventory, Inventory Storage, Asset, Event Operations, Auth, and legacy domains, and verifies data-stable migration reapplication plus published-template/run-snapshot hashes. Seven pairs of real database connections prove single-winner protection for task claim, initial assessment, typed item write, task completion, deviation resolution, final-verification request, and run finish. Client normalization and sync-safe request builders run without network access, and the container is removed in `finally` cleanup.

`npm run verify:routine-operational-time` applies Phase 10A through 10F in a uniquely named PostgreSQL 17 container with `--network none` and no image pull. It executes 249 named SQL assertions spanning schema/tenant constraints, the 04:00 operational date, DST overlap/gap policies, core/timing hashes, phase transitions, lifecycle gates, deviations, time dependencies, conditions, continuous tasks, completion, supersession, RLS, read models, and regressions. It reapplies 10F without changing timing data/timestamps/hashes and compares protected-domain fingerprints. Real concurrent connections exercise auto-date creation, refresh crossings, hard-deadline deviation uniqueness, condition convergence, continuous system start/completion, and date supersession. Client normalization and authority scans run without network access.

`npm run verify:routine-delivery` applies Phase 10A through 10G to a uniquely named PostgreSQL 17 container with `--network none` and no image pull. It executes 228 named SQL assertions covering schema/tenant integrity, closed metadata validation, publishing, preview, reported statuses, atomic finish generation, evidence/hash verification, reopen/supersession, previous selection, comparison/assessment integration, immutable corrections, RLS/grants, read models, and regressions. It compares protected Inventory, Inventory Storage, Asset, Event Operations, Auth, and legacy fingerprints and reapplies 10G without changing delivery rows, hashes, or timestamps. Independent connections race a first finish, replay, first assessment, assessment replay, and refinish; only one record/comparison/superseding record results. Client/model normalization and authority scans run without network access.

`npm run verify:routine-double-shift` applies Phase 10A through 10H after the actual Event Operations role/calendar migrations and all earlier Phase 10 fixtures in a uniquely named PostgreSQL 17 container with `--network none` and no image pull. It executes 249 numbered SQL contract assertions covering schema/tenant integrity, bundle creation, DS01–DS04, feed, reassignment, external context/conditions, Event-transfer authority/evidence, delivery v1/v2, RLS, read models, immutability, and regression boundaries. Protected Inventory, Inventory Storage, Asset, Event Operations, Auth, and legacy schema/function/policy/data fingerprints are compared before and after 10H. Event/calendar rows are byte- and row-stable across the complete acceptance/completion flow. Independent connections exercise convergent bundle creation, simultaneous DS01/DS02/DS03 retries, context refresh, Event acceptance/completion, DS04 reconciliation, and single-winner Closing reassignment. Reapply preserves all 10H rows, timestamps, hashes, and protected objects; client normalization runs without network access.

`npm run verify:routine-sync-offline` applies Phase 10A through 10I in a uniquely named PostgreSQL 17 container with `--network none` and no image pull. It creates an empty disposable `supabase_realtime` publication, executes 148 server assertions, 96 native IndexedDB/outbox/engine/Realtime checks, and 21 regression/reapply checks: 265 named checks total. The harness verifies exact publication membership, RLS/DML boundaries, strict bundle and receipt contracts, timing/evidence policy, immutable reconciliation hooks/read models, all stores and indexes, schema upgrade, malformed isolation, principal separation, retention, the closed registry, coalescing/dependencies, Web Locks/fallback lease/BroadcastChannel logic, receipt-first unknown outcome, cursor-after-refresh ordering, stable registration replay after an unknown outcome, preservation of an applied receipt across a later refresh failure, and separate cache/pending overlays. Protected-domain schema/data fingerprints are stable. Two real PostgreSQL connections replay registration concurrently and converge on one immutable instance/event. Reapply preserves Phase 10I rows and timestamps, and the disposable container is always removed.

`npm run verify:routine-shared-device` applies Phase 10A through 10J in a uniquely named PostgreSQL 17 container with `--network none` and no image pull. It executes 382 meaningful contract checks across the 80 SQL fixtures/assertions, schema and RLS catalog, secret/grant/static boundaries, token parsing, private-helper privileges, effective actor and hash markers, Web Crypto, sessionStorage metadata, IndexedDB schema/principal isolation, offline policy, sync-engine operator switch, personal Realtime versus shared cursor polling, protected-domain fingerprints, historical hashes, and data-stable 10J reapplication. Runtime PINs and session secrets are generated in memory and never printed or stored in source. Independent PostgreSQL connections prove lockout under parallel failures, one active session per client, serialized reauthentication freshness, and one shared-operator participant under concurrent joins. The disposable container is removed in `finally` cleanup.

`npm run verify:routine-ui-foundation` applies the complete Phase 10A–10K1 chain and fixtures in a uniquely named PostgreSQL 17 container with `--network none`. Its 180 checks include 90 SQL access/constraint/RLS/RPC assertions, protected schema/data/history fingerprints, data-stable K1 reapplication, deterministic client/model normalization, absence of direct DML/local authority, PIN/token persistence boundaries, App lazy integration, responsive/accessibility source guards, server-rendered read-only states, and personal Realtime versus shared cursor-polling behavior. Disposable browser verification separately covers 22 light/dark/mobile/error/operator/keyboard/zoom scenarios with screenshots outside the repository, no console error or overlay, 48-pixel controls and no horizontal overflow.

`npm run verify:routine-manager-ui` applies Phase 10A–10K2 and disposable manager fixtures in a uniquely named PostgreSQL 17 container with `--network none`. It verifies the timestamp-stable release transition without a mode change, later-stage preservation, all seven manager-only read/preview contracts, tenant/auth/secret/grant boundaries, authoritative readiness, structured models, closed payload builders, reference magic-byte/path handling, PIN clearing, RPC-only writes, local-draft preservation, App integration and protected-domain fingerprints. Its SQL suite contains 50 named assertions and the combined verifier contains 229 contract checks. Separate in-app-browser verification covers 36 desktop/mobile/dark/zoom/empty/editor/dialog/security/conflict/navigation scenarios with screenshots outside the repository, no console error or Vite overlay, no horizontal overflow, and 48-pixel interactive controls where present.

`npm run verify:routine-employee-ui` applies Phase 10A–10K3 and the employee fixtures in a uniquely named PostgreSQL 17 container with `--network none`. It verifies the timestamp-stable staff-preview transition, unchanged mode/later stages, six tenant-strict read contracts, shadow/pilot/active denial, effective personal/shared identity, authoritative server time/timing/dependencies, action reasons, recursive removal of private actor/operation fields, no read side effects, minimal grants, RPC-only mutations, exact assessment/verification/Event-transfer/Double Shift payloads, server-authorized deviation management, retry/draft behavior, explicit conflict resolution and partitioned discard, Phase 10I offline separation, PIN clearing, accessibility source invariants and App/lazy-bundle isolation. Its SQL suite contains 80 named assertions and the combined verifier contains 342 checks. Separate in-app-browser verification covers 60 operational, task, evidence, handover, transfer, finish, DS01–DS04, offline/conflict, mobile, dark, zoom, keyboard, session/sync and navigation/access scenarios with screenshots outside the repository.

The pre-existing Phase 9L verification baseline is intentionally not repaired here. Its exact known failure is:

> Phase 9L requires exactly one approved August shelf/storage source session.

Only that same failure with the same fingerprint is an accepted baseline. Any new or changed Phase 9 failure is a regression.

No Supabase production migration, publication change, receipt/reconciliation creation, bucket creation, data write, Auth configuration change, deployment, or feature activation has been performed for Phase 10A through 10K3. Phase 10K2 is the committed checkpoint named above; Phase 10K3 remains an uncommitted working-tree implementation. History/legacy adaptation and rollout hardening remain deferred to K4, and seeded content remains deferred to 10L.
