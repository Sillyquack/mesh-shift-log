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

Phase 9C is additive and must be applied after Phase 9B. It overrides authorization helpers, policies, and grants without replacing Phase 9B stock-policy calculations or modifying inventory data.

## Canonical local migration order

The Phase 9 inventory verification order is recorded in `supabase/phase9-migration-order.json`:

1. `supabase/schema.sql` — historical accumulated baseline required by Phase 9;
2. `supabase/phase7a_workbar_device_auth.sql` — required shared-device columns and helper;
3. `supabase/phase9a_inventory_stocktaking.sql` — inventory foundation;
4. `supabase/phase9a4_inventory_location_template.sql` — location template and bulk-standard predecessor;
5. `supabase/phase9b_stock_policies.sql` — current stock-policy behavior;
6. `supabase/phase9c_inventory_security_hardening.sql` — current terminal security boundary.

`schema.sql` is not treated as a complete production migration history. It is a historical accumulation file and the minimum fresh-database prerequisite for these Phase 9 tests. The malformed manager-review `DO` delimiter has been corrected so this baseline parses on a fresh database.

Phase 9A.4 and Phase 9B replace earlier functions, while Phase 9C replaces authorization helpers, policies, and grants. Reapplying Phase 9A, Phase 9A.4, or Phase 9B after Phase 9C can downgrade the installed boundary. The runner rejects missing, reordered, duplicated, or post-Phase 9C files before executing SQL. Future inventory migrations must be added after Phase 9C, preserve its authorization guarantees, and update both the manifest and validator intentionally.

The accumulated baseline, Phase 7A, Phase 9A, Phase 9A.4, and Phase 9B are not repeatable migrations. Phase 9C is the only current entry declared repeatable, and the executable runner reapplies it in the disposable database before running the authorization assertions.

## Disposable database verification

Run:

```sh
npm run verify:phase9-security-db
```

Required local tools are Docker and the already-cached pinned image `public.ecr.aws/supabase/postgres:17.6.1.141`. The runner does not accept database URLs or command-line connection arguments. It requires the image to exist locally, disables image pulls, starts the container with `--network none`, publishes no port, generates an ephemeral password, and removes the container in `finally` and on termination signals. It cannot fall back to a remote Supabase project.

The disposable test creates two organizations and profiles for manager, staff, shift lead, `event_floor_manager`, `time2staff`, shared-device manager, inactive manager, and null-organization manager cases. It applies the full manifest from an empty database, then proves by executable PostgreSQL assertions:

- active managers can read and mutate only their own organization;
- all other listed profiles and `anon` cannot read inventory;
- protected profile fields cannot be directly updated by authenticated callers, including managers, and RLS prevents anonymous profile reads or changes;
- every one of the 20 inventory mutation RPCs rejects staff;
- representative product, location, standard, session, line, template, and actor-identity behavior succeeds or fails on the correct tenant boundary;
- internal helpers have no direct authenticated execution;
- `PUBLIC`, `anon`, and `authenticated` effective function privileges match the intended surface;
- RLS is enabled on all five inventory tables.

The final audit output lists every public table, function, and policy, plus the security-relevant inventory and `user_profiles` grants for `anon` and `authenticated`.

`FORCE ROW LEVEL SECURITY` remains off intentionally. The existing guarded `SECURITY DEFINER` RPCs are owned by the migration role and perform explicit `auth.uid()`, profile, and organization checks; forcing owner RLS without redesigning that execution model could break those RPCs rather than strengthen them.

## Verification layers and remaining limits

- `npm run verify:inventory-permissions` runs in-memory JavaScript permission cases.
- `npm run verify:phase9a` runs static source checks, including the migration manifest and SQL test coverage.
- `npm run verify:phase9-security-db` runs executable PostgreSQL migration, grants, RLS, and RPC assertions.
- `npm run verify:phase9-all` runs all three layers and the production frontend build.

Browser launch/rendering automation, Realtime delivery behavior, concurrent RPC races, finalized-session immutability, and duplicate active-session prevention remain unverified by this database harness.
