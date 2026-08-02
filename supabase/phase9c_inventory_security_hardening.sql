-- Phase 9C: Stock Count authorization and tenant-boundary hardening.
-- Apply after Phase 9B. This additive phase preserves all inventory data and
-- business behavior while making Supabase Auth manager profiles the only
-- authority for Inventory / Stock Count reads and writes.

-- A Stock Count manager must be the current authenticated user, active, in a
-- non-null organization, and must not be a shared-device profile.
create or replace function public.current_user_can_manage_inventory_config()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.user_profiles profile
    where profile.id = (select auth.uid())
      and profile.active = true
      and profile.role = 'manager'
      and profile.organization_id is not null
      and coalesce(profile.is_shared_device, false) = false
  );
$$;

-- Phase 9C intentionally makes coordination equivalent to manager access.
create or replace function public.current_user_can_coordinate_inventory()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select public.current_user_can_manage_inventory_config();
$$;

-- Keep the historical argument for RPC signature compatibility only. It is
-- not consulted for authorization or audit identity. The authenticated active
-- manager profile is the sole actor and organization source.
create or replace function public.inventory_resolve_actor(input_actor_name text default null)
returns table (
  organization_id uuid,
  actor_auth_user_id uuid,
  actor_name text,
  shared_device boolean
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_profile public.user_profiles%rowtype;
begin
  if v_auth_user_id is null then
    raise exception 'Supabase Auth manager access is required for Stock Count.';
  end if;

  select profile.*
  into v_profile
  from public.user_profiles profile
  where profile.id = v_auth_user_id
    and profile.active = true
    and profile.role = 'manager'
    and profile.organization_id is not null
    and coalesce(profile.is_shared_device, false) = false;

  if v_profile.id is null then
    raise exception 'An active, non-shared-device manager profile with an organization is required for Stock Count.';
  end if;

  return query
  select v_profile.organization_id, v_auth_user_id, v_profile.display_name, false;
end;
$$;

-- The safe session-record RPC uses this helper. It must deny non-managers,
-- shared devices, null organizations, and cross-organization session IDs.
create or replace function public.inventory_session_is_visible(input_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.inventory_count_sessions session
    join public.user_profiles profile
      on profile.id = (select auth.uid())
    where session.id = input_session_id
      and profile.active = true
      and profile.role = 'manager'
      and profile.organization_id is not null
      and coalesce(profile.is_shared_device, false) = false
      and session.organization_id = profile.organization_id
  );
$$;

-- user_profiles is an authorization source. The frontend profile view is
-- read-only, so no direct authenticated UPDATE privilege is retained.
revoke insert, update, delete, truncate, references, trigger
  on table public.user_profiles from authenticated;
revoke update (
  id, organization_id, display_name, role, active, staff_code_alias,
  is_shared_device, shared_device_label, created_at, updated_at
) on table public.user_profiles from authenticated;

drop policy if exists "pilot managers can update profiles" on public.user_profiles;

-- Users can still load their own profile for login. The manager diagnostics
-- list is limited to active managers viewing profiles in their own non-null
-- organization.
drop policy if exists "pilot managers can read profiles" on public.user_profiles;
create policy "pilot managers can read profiles"
on public.user_profiles for select
to authenticated
using (
  (select public.current_user_can_manage_inventory_config())
  and organization_id = (select public.current_user_organization_id())
);

-- Inventory remains column-selectable through the Phase 9A/9B grants, but RLS
-- now permits rows only to an authenticated active manager in the exact same
-- non-null organization. No staff, event-floor or shared-device read path
-- remains.
drop policy if exists inventory_products_read on public.inventory_products;
create policy inventory_products_read
on public.inventory_products for select
to authenticated
using (
  (select public.current_user_can_manage_inventory_config())
  and organization_id = (select public.current_user_organization_id())
);

drop policy if exists inventory_locations_read on public.inventory_locations;
create policy inventory_locations_read
on public.inventory_locations for select
to authenticated
using (
  (select public.current_user_can_manage_inventory_config())
  and organization_id = (select public.current_user_organization_id())
);

drop policy if exists inventory_location_products_read on public.inventory_location_products;
create policy inventory_location_products_read
on public.inventory_location_products for select
to authenticated
using (
  (select public.current_user_can_manage_inventory_config())
  and organization_id = (select public.current_user_organization_id())
);

drop policy if exists inventory_count_sessions_read on public.inventory_count_sessions;
create policy inventory_count_sessions_read
on public.inventory_count_sessions for select
to authenticated
using (
  (select public.current_user_can_manage_inventory_config())
  and organization_id = (select public.current_user_organization_id())
);

drop policy if exists inventory_count_lines_read on public.inventory_count_lines;
create policy inventory_count_lines_read
on public.inventory_count_lines for select
to authenticated
using (
  (select public.current_user_can_manage_inventory_config())
  and organization_id = (select public.current_user_organization_id())
);

-- Defense in depth: inventory tables remain read-only to authenticated clients
-- and completely unavailable to anon/PUBLIC. All mutations use guarded RPCs.
revoke all privileges on table public.inventory_products from public, anon;
revoke all privileges on table public.inventory_locations from public, anon;
revoke all privileges on table public.inventory_location_products from public, anon;
revoke all privileges on table public.inventory_count_sessions from public, anon;
revoke all privileges on table public.inventory_count_lines from public, anon;

revoke insert, update, delete, truncate, references, trigger on table public.inventory_products from authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.inventory_locations from authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.inventory_location_products from authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.inventory_count_sessions from authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.inventory_count_lines from authenticated;

-- Internal helpers and trigger functions are not direct Data API endpoints.
revoke all on function public.current_user_can_manage_inventory_config() from public, anon, authenticated;
revoke all on function public.current_user_can_coordinate_inventory() from public, anon, authenticated;
revoke all on function public.inventory_resolve_actor(text) from public, anon, authenticated;
revoke all on function public.inventory_session_is_visible(uuid) from public, anon, authenticated;
revoke all on function public.inventory_validate_location() from public, anon, authenticated;
revoke all on function public.inventory_validate_location_product() from public, anon, authenticated;
revoke all on function public.inventory_validate_count_line() from public, anon, authenticated;
revoke all on function public.inventory_normalize_stock_policy_configuration() from public, anon, authenticated;
revoke all on function public.inventory_stock_policy_target(uuid) from public, anon, authenticated;
revoke all on function public.inventory_count_line_client_record(uuid) from public, anon, authenticated;

-- RLS policies need this boolean helper. All other direct execution is limited
-- to the sanitized session reader and the guarded Stock Count mutation RPCs.
grant execute on function public.current_user_can_manage_inventory_config() to authenticated;

revoke all on function public.get_inventory_count_session_record(uuid) from public, anon, authenticated;
grant execute on function public.get_inventory_count_session_record(uuid) to authenticated;

revoke all on function public.upsert_inventory_product(uuid, text, text, text, text, text, text, numeric, text, text, boolean, integer, jsonb, text[]) from public, anon, authenticated;
revoke all on function public.upsert_inventory_location(uuid, text, text, text, uuid, text, text, boolean, integer, jsonb, text[]) from public, anon, authenticated;
revoke all on function public.upsert_inventory_location_product(uuid, uuid, uuid, numeric, numeric, numeric, integer, boolean, text, jsonb, text[]) from public, anon, authenticated;
revoke all on function public.copy_inventory_location_standards(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.setup_mesh_youngstorget_inventory_locations() from public, anon, authenticated;
revoke all on function public.bulk_upsert_inventory_location_standards(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.create_inventory_count_session(text, text, date, uuid[], text, text) from public, anon, authenticated;
revoke all on function public.set_inventory_count_line_quantity(uuid, numeric, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.set_inventory_count_line_case_quantity(uuid, integer, numeric, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.mark_inventory_count_line_use_par(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.clear_inventory_count_line(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.skip_inventory_count_line(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.mark_inventory_location_use_par(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.confirm_inventory_count_line_unchanged(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.complete_inventory_count_location(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.complete_inventory_count_session(uuid, text, boolean, text) from public, anon, authenticated;
revoke all on function public.approve_inventory_count_session(uuid, text) from public, anon, authenticated;
revoke all on function public.reopen_inventory_count_session(uuid, text) from public, anon, authenticated;
revoke all on function public.cancel_inventory_count_session(uuid, text) from public, anon, authenticated;
revoke all on function public.import_inventory_catalog(jsonb, boolean) from public, anon, authenticated;

grant execute on function public.upsert_inventory_product(uuid, text, text, text, text, text, text, numeric, text, text, boolean, integer, jsonb, text[]) to authenticated;
grant execute on function public.upsert_inventory_location(uuid, text, text, text, uuid, text, text, boolean, integer, jsonb, text[]) to authenticated;
grant execute on function public.upsert_inventory_location_product(uuid, uuid, uuid, numeric, numeric, numeric, integer, boolean, text, jsonb, text[]) to authenticated;
grant execute on function public.copy_inventory_location_standards(uuid, uuid, boolean) to authenticated;
grant execute on function public.setup_mesh_youngstorget_inventory_locations() to authenticated;
grant execute on function public.bulk_upsert_inventory_location_standards(uuid, jsonb) to authenticated;
grant execute on function public.create_inventory_count_session(text, text, date, uuid[], text, text) to authenticated;
grant execute on function public.set_inventory_count_line_quantity(uuid, numeric, text, text, timestamptz) to authenticated;
grant execute on function public.set_inventory_count_line_case_quantity(uuid, integer, numeric, text, text, timestamptz) to authenticated;
grant execute on function public.mark_inventory_count_line_use_par(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.clear_inventory_count_line(uuid, text, timestamptz) to authenticated;
grant execute on function public.skip_inventory_count_line(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.mark_inventory_location_use_par(uuid, uuid, boolean, text) to authenticated;
grant execute on function public.confirm_inventory_count_line_unchanged(uuid, timestamptz) to authenticated;
grant execute on function public.complete_inventory_count_location(uuid, uuid, text) to authenticated;
grant execute on function public.complete_inventory_count_session(uuid, text, boolean, text) to authenticated;
grant execute on function public.approve_inventory_count_session(uuid, text) to authenticated;
grant execute on function public.reopen_inventory_count_session(uuid, text) to authenticated;
grant execute on function public.cancel_inventory_count_session(uuid, text) to authenticated;
grant execute on function public.import_inventory_catalog(jsonb, boolean) to authenticated;

notify pgrst, 'reload schema';
