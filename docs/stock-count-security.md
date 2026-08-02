# Stock Count security boundary

Stock Count is manager-only. Access requires all of the following:

- a current Supabase Email Auth session;
- an active `public.user_profiles` row for the authenticated user ID;
- `role = 'manager'`;
- `is_shared_device` is not true;
- a non-null organization ID that exactly matches the inventory rows being read or changed.

Staff-code sessions, ordinary staff, shift leads, `event_floor_manager`, `time2staff`, and shared-device profiles cannot open or use Stock Count. A local app role, selected operator, shift-session display name, or free-text operator name never establishes Stock Count authority.

## Authority flow

1. Supabase Auth establishes the current `auth.uid()`.
2. The app loads the matching active `user_profiles` row and marks the local app user as session-verified only after that live check succeeds.
3. The centralized frontend `canUseInventory` predicate requires the verified auth/profile IDs, active manager role, non-shared-device status, and matching non-null organization values.
4. `InventoryWorkspace` repeats that predicate before mounting the data-loading workspace and otherwise renders an explicit access-denied state.
5. Inventory table RLS repeats the active-manager check and requires exact organization equality.
6. Every inventory mutation reaches either `current_user_can_manage_inventory_config()` or the Phase 9C `inventory_resolve_actor()` implementation.
7. `inventory_resolve_actor()` ignores its legacy free-text argument and derives audit identity and organization only from the authenticated manager profile.
8. Existing RPC queries continue to scope referenced products, locations, standards, sessions, and count lines to that resolved organization.

## Profile authority fields

`user_profiles` is an authorization source. Phase 9C removes authenticated direct `INSERT`, `UPDATE`, and `DELETE` privileges and drops the broad manager update policy. Protected fields—including `organization_id`, `role`, `active`, `is_shared_device`, and `shared_device_label`—cannot be changed through the frontend Data API.

The current Manager Dashboard “Supabase profiles” view is read-only and remains available for same-organization diagnostics. There is no profile editor to preserve, so Phase 9C does not add an administration RPC. Profile provisioning and authority changes remain controlled administrative operations outside the browser application.

## Inventory RPC and organization rules

Authenticated receives execution only for the sanitized session reader and the existing Stock Count business RPCs. Internal record, actor-resolution, policy-target, and trigger helpers are not direct Data API endpoints. `PUBLIC` and `anon` execution are revoked.

Inventory tables remain directly read-only to authenticated clients. RLS exposes rows only to the active non-shared manager whose non-null profile organization equals the row organization. Null organization values deny access; they never broaden it.

Phase 9C is additive and must be applied after Phase 9B. It overrides authorization helpers, policies, and grants without replacing Phase 9B stock-policy calculations or modifying inventory data. Phase 9D retains that manager-only boundary while adding session-integrity invariants. Phase 9E explicitly exposes stable product identity to the existing safe count-line read surface. Phase 9F is the terminal layer and extends only the same manager-only RPC/read surfaces with structured quantity snapshots and components.

## Stock Count lifecycle integrity

An organization has at most one active Stock Count. `draft`, `in_progress`, and `completed` (awaiting approval) all consume that active slot. `approved` and `cancelled` release it. A partial unique index is the final database constraint; organization-scoped transaction advisory locking gives concurrent creation requests a clear deterministic result.

Session creation and correction creation require an organization-scoped UUID idempotency key. Retrying the same request returns the existing session. A different key cannot create another session while the active slot is occupied. Before installing the unique index, Phase 9D reports organizations with legacy duplicate-active data and aborts without merging or deleting rows.

Line writes require the exact current `updated_at` value. Missing or stale versions are rejected, so an operator must refresh rather than silently overwrite another device. The frontend preserves the rejected local draft. Manager bulk replacement also requires the current session version.

Completion is distinct from approval:

- a normal completion may have an independent review note and records `finalized_with_exceptions = false`;
- unresolved skipped, uncounted, review, or incomplete-location conditions require an explicit “finalize with exceptions” choice and a nonblank exception reason;
- exception counts, affected location IDs, authenticated manager identity, and finalization time are stored in dedicated columns as well as sanitized operational metadata;
- `completed` sessions are read-only and continue to block creation until approved or cancelled;
- approval permanently locks the session and every line through table triggers, including against table-owner or future definer-function writes.

Approved sessions are never reopened. The legacy `reopen_inventory_count_session` RPC is removed. A manager corrects an approved result by creating a new `correction` session linked through `original_session_id`. The correction copies the original scope and configuration snapshots, starts with uncounted lines, and carries its own reason and authenticated creation audit. The original remains unchanged, and later corrections are allowed sequentially after the active correction is approved or cancelled.

## Product identity and historical labels

`inventory_products.id` and each stored `product_id` are the authoritative product identity. `inventory_count_lines.id` identifies a particular stored count row, while `location_id` identifies its location. Product name, unit, category, and location name on a count line are historical display snapshots only. SKU and barcode remain optional, mutable interoperability fields and never replace `product_id`.

Active counting, guarded line mutation results, history comparison, correction copying, restock grouping, React keys, and exports retain the stable IDs. Two products with identical names and units therefore remain separate. Where those two rows would otherwise look identical, the UI shows an existing SKU when present or a short “Product ref” derived from the stable ID; full UUIDs are not shown in the normal counting flow.

The original schema already requires every count line to have a product foreign key, and its organization-validation trigger rejects cross-organization references. Phase 9E performs a non-mutating preflight for missing, orphaned, or cross-organization product references and aborts with instructions not to infer identity from display snapshots. It performs no name/unit backfill and never updates approved quantities or historical labels.

## Authoritative structured quantity model

Phase 9F supports three product-configured count modes:

- `unit` (“Units”) keeps the established one-value count flow. `counted_quantity` is the entered quantity in the product’s configured unit, and bottle/keg component columns remain null. Decimal quantities and zero remain valid.
- `container_plus_volume` (“Bottles + open liters”) requires a positive `container_capacity_liters`. The operator records a non-negative integer `counted_whole_units` (sealed containers) plus non-negative `counted_open_volume_liters`. Open volume is aggregate liquid remaining across every open bottle, not a bottle fraction, and may exceed one bottle capacity. PostgreSQL derives canonical liters exactly as `sealed × snapshotted capacity + open liters`.
- `keg_fraction` (“Full + partial kegs”) records a non-negative integer `counted_full_kegs` plus `counted_partial_keg_fraction` from zero through less than one. `0.4`, `0.5`, `0.25`, and `0.75` are valid manual fractions. An exact entered fraction of `1` is transparently normalized to one additional full keg and fraction zero. PostgreSQL derives canonical keg equivalents exactly as `full + partial`; no keg capacity in liters is required.

Product configuration is guarded by the manager-only product upsert RPC. Capacity is required only for container-plus-volume and must be null for the other modes. New standard sessions snapshot `count_mode`, the mode-specific base/display unit, and capacity where applicable. Container lines use `L`; keg lines use `keg equivalents`; ordinary lines retain the configured product unit. Current product edits cannot reinterpret an existing session.

Corrections keep the approved original line’s product ID, count-mode snapshot, capacity snapshot, base-unit snapshot, targets, and other configuration snapshots. Correction component and canonical count values start empty and are editable in the new linked session. The approved original components and totals remain immutable and available from the linked original session.

Legacy products and count lines are classified as `unit` through additive defaults. No approved quantity, target, historical unit label, or existing protected-event case component is rewritten. Phase 9F never guesses spirits or keg products from product names, categories, or units. Managers explicitly opt products into a new mode.

`counted_quantity` remains the single canonical base quantity for discrepancy and restock. Target minus canonical count is the gap; the existing variance remains canonical count minus target. Restock is the non-negative gap and may be fractional in liters, keg equivalents, or the configured unit. Restock aggregation is keyed by stable product ID and rejects incompatible count-mode snapshots for the same product instead of mixing units.

PostgreSQL calculations use exact `numeric`; no `real` or `double precision` quantity is introduced. Capacity, open liters, and partial-keg inputs support at most six decimal places. Values with greater scale are rejected rather than rounded, structured use-par rejects targets that cannot be represented at that scale, comparison tolerance is zero, and the database equations must match exactly. The frontend accepts comma or point input, retains incomplete drafts such as `0,` while typing, normalizes with exact decimal strings and scaled `BigInt` arithmetic, removes insignificant trailing zeroes for display, and uses Norwegian decimal comma. It never uses a binary-float result as the server total.

“Mark fully stocked” uses the target directly for units. Container targets decompose deterministically into `trunc(target / snapshotted capacity)` sealed containers plus the exact remainder as open liters. Keg targets decompose into the integer part plus exact fractional remainder. Clear and skip null every new component. Dormant unchanged confirmation copies the previous physical components only when product identity and measurement snapshots still match; otherwise it requires a new physical count.

Phase 9F estimates nothing from weight, bottle shape, calibration, keg pressure, or flow data.

## Norwegian Excel CSV contract

All four Stock Count exports use one serializer intended primarily for Norwegian Excel:

- UTF-8 with exactly one BOM;
- semicolon delimiter;
- CRLF record newlines;
- decimal comma for trusted finite JavaScript numeric values and validated exact decimal-string wrappers, with no thousands separators;
- text, product IDs, and SKUs remain text cells; periods in arbitrary strings are never replaced;
- null and empty string values both produce an empty CSV field;
- fields are quoted when they contain a semicolon, quote, CR/LF, or leading/trailing whitespace; embedded quotes are doubled and embedded line breaks are preserved;
- untrusted text that can begin a spreadsheet formula with `=`, `+`, `-`, `@`, tab, CR, or LF after leading whitespace/control assessment is prefixed with a single quote before CSV quoting. Trusted numeric cells, including negative numbers, are not prefixed.

Column order is fixed per export:

1. Count session: `Date`, `Session`, `Status`, `Location`, `Product`, `Product ID`, `Count mode`, `Base unit`, `Container capacity L`, `Whole / sealed`, `Open liters`, `Full kegs`, `Partial keg fraction`, `Stock policy`, `Target`, `Counted`, `Gap`, `Count method`, `Components`, `Note`, `Counted by`, `Counted at`.
2. Restock: `Product`, `Product ID`, `Count mode`, `Unit`, `Location`, `Missing quantity`, `Category`.
3. Product catalog: `Product name`, `Product ID`, `SKU`, `Barcode`, `Category`, `Configured unit`, `Count mode`, `Container capacity L`, `Active`, `Supplier`.
4. Location standards: `Location`, `Product`, `Product ID`, `SKU`, `Stock policy`, `Target mode`, `Configured target`, `Multiplier`, `Case size`, `Target cases`, `Loose target`, `Recount interval`, `Count order`.

## Canonical local migration order

The Phase 9 inventory verification order is recorded in `supabase/phase9-migration-order.json`:

1. `supabase/schema.sql` — historical accumulated baseline required by Phase 9;
2. `supabase/phase7a_workbar_device_auth.sql` — required shared-device columns and helper;
3. `supabase/phase9a_inventory_stocktaking.sql` — inventory foundation;
4. `supabase/phase9a4_inventory_location_template.sql` — location template and bulk-standard predecessor;
5. `supabase/phase9b_stock_policies.sql` — current stock-policy behavior;
6. `supabase/phase9c_inventory_security_hardening.sql` — manager-only security boundary;
7. `supabase/phase9d_inventory_session_integrity.sql` — session lifecycle and immutable-history boundary;
8. `supabase/phase9e_inventory_product_identity_csv.sql` — stable product-identity read and grant boundary;
9. `supabase/phase9f_inventory_structured_quantities.sql` — terminal exact structured-quantity, snapshot, RPC, and grant boundary.

`schema.sql` is not treated as a complete production migration history. It is a historical accumulation file and the minimum fresh-database prerequisite for these Phase 9 tests. The malformed manager-review `DO` delimiter has been corrected so this baseline parses on a fresh database.

Phase 9A.4 and Phase 9B replace earlier functions, Phase 9C replaces authorization helpers, policies, and grants, Phase 9D replaces lifecycle RPCs and grants, Phase 9E replaces the sanitized count-line record and explicit count-line read grant, and Phase 9F replaces the safe product/line shapes plus quantity mutations. Reapplying an older phase after Phase 9F can downgrade the installed boundary. The runner rejects missing, reordered, duplicated, or post-Phase 9F files before executing SQL. Future inventory migrations must be added after Phase 9F, preserve authorization, lifecycle, exact-quantity, component, snapshot, and product-identity guarantees, and update the manifest and validator intentionally.

The accumulated baseline through Phase 9E is not repeatable. Phase 9F is the only current entry declared repeatable, and the executable runner reapplies it in the disposable database before running the assertions.

## Disposable database verification

Run:

```sh
npm run verify:phase9-security-db
```

Required local tools are Docker and the already-cached pinned image `public.ecr.aws/supabase/postgres:17.6.1.141`. The runner does not accept database URLs or command-line connection arguments. It requires the image to exist locally, disables image pulls, starts the container with `--network none`, publishes no port, generates an ephemeral password, and removes the container in `finally` and on termination signals. It cannot fall back to a remote Supabase project.

The disposable test creates isolated organizations and profiles for manager, staff, shift lead, `event_floor_manager`, `time2staff`, shared-device manager, inactive manager, and null-organization manager cases. It applies the full manifest from an empty database, then proves by executable PostgreSQL assertions:

- active managers can read and mutate only their own organization;
- all other listed profiles and `anon` cannot read inventory;
- protected profile fields cannot be directly updated by authenticated callers, including managers, and RLS prevents anonymous profile reads or changes;
- every pre-Phase 9F inventory mutation RPC still rejects staff, and the Phase 9F structured mutation has its own staff and cross-organization denial assertions;
- representative product, location, standard, session, line, template, and actor-identity behavior succeeds or fails on the correct tenant boundary;
- internal helpers have no direct authenticated execution;
- `PUBLIC`, `anon`, and `authenticated` effective function privileges match the intended surface;
- RLS is enabled on all five inventory tables.

It also installs a pre-Phase 9D approved fixture, verifies additive audit backfill, and proves the legacy duplicate-active preflight aborts safely. Two simultaneous PostgreSQL connections prove that same-key creation converges on one session and different-key creation accepts exactly one request. A further 36 lifecycle assertions cover mandatory stale-write checks, completed/approved immutability, correction linkage and snapshot copying, explicit exception audit, cross-organization denial, and active-slot release. Eight Phase 9E database assertions add same-name/unit products, verify authenticated `product_id` reads, correction identity copying, cross-organization isolation, and unchanged approved quantities. Twenty-three Phase 9F database assertions exercise exact bottle/keg totals, use-par decomposition, invalid components, stale writes, lifecycle/auth isolation, approved-row mutation/deletion rejection, historical snapshots, and correction copying.

The final audit output lists every public table, function, and policy, plus the security-relevant inventory and `user_profiles` grants for `anon` and `authenticated`.

`FORCE ROW LEVEL SECURITY` remains off intentionally. The existing guarded `SECURITY DEFINER` RPCs are owned by the migration role and perform explicit `auth.uid()`, profile, and organization checks; forcing owner RLS without redesigning that execution model could break those RPCs rather than strengthen them.

## Verification layers and remaining limits

- `npm run verify:inventory-permissions` runs in-memory JavaScript permission cases.
- `npm run verify:inventory-session-lifecycle` runs pure JavaScript active-state, locking, exception, correction-label, and idempotency-retention cases.
- `npm run verify:inventory-product-identity-csv` runs pure JavaScript same-display identity, restock/history, final CSV byte/string, escaping, formula-neutralization, Nordic-number, and round-trip cases.
- `npm run verify:inventory-structured-quantities` runs exact decimal parsing, component validation/totals, use-par decomposition, gap/restock identity, human-readable history labels, structured CSV bytes/round trips, and focused Phase 9F source invariants.
- `npm run verify:phase9a` runs static source checks, including the migration manifest and SQL test coverage.
- `npm run verify:phase9-security-db` runs executable PostgreSQL migration, grants, RLS, and RPC assertions.
- `npm run verify:phase9-all` runs all verification layers and the production frontend build.

Browser launch/rendering automation, physical mobile-device verification, and Realtime delivery behavior remain outside this local harness. Concurrent RPC races, finalized-session immutability, stale-write enforcement, correction linkage, duplicate active-session prevention, stable database product identity, and structured database quantities are executable database tests. Weight/shape/flow estimation, separate identities for multiple partial kegs, save-current-count-as-default, purchasing, valuation, stock movements, and barcode scanning remain out of scope.
