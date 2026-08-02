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

## Verification limits

The migration has received source-level/static verification only. It was not executed against Postgres because this checkout has no local Supabase configuration or executable database test environment, and no remote Supabase project may be modified by this work.

Still required in the next database-focused slice:

- executable migration-order verification on a disposable local database;
- role-impersonated RLS tests for manager, staff, event-floor manager, shared device, anon, null organization, and cross-organization access;
- RPC tests with cross-organization product, location, standard, session, and line IDs;
- inspection of effective live grants and function owners.

The previously reported invalid `do $ ... end $;` block in `supabase/schema.sql` is not repaired here because Phase 9C is intentionally limited to Stock Count security. It must be addressed as part of migration determinism before a fresh baseline can be executed locally.
