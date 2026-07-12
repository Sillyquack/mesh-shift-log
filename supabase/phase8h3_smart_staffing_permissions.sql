-- Phase 8H.3/8H.3.1: narrow staff picker access and harden event role writes.
-- Do not run automatically. Apply manually in Supabase SQL editor after review.

-- Earlier local Phase 8H.3 drafts proposed this policy. Ensure it is absent.
drop policy if exists "event ops managers can read assignable profiles" on public.user_profiles;

-- Role assignment writes must pass through the guarded RPCs below.
revoke insert, update, delete on public.event_role_assignments from authenticated;
grant select on public.event_role_assignments to authenticated;

drop policy if exists "event_role_assignments_read_active" on public.event_role_assignments;
create policy "event_role_assignments_read_active"
on public.event_role_assignments for select
to authenticated
using (
  public.current_user_is_active()
  and public.same_event_ops_organization(organization_id)
  and (active = true or public.current_user_can_manage_event_ops())
);

create or replace function public.list_assignable_event_staff()
returns table (
  profile_id uuid,
  auth_user_id uuid,
  display_name text,
  email text,
  profile_role text,
  organization_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_org uuid := public.current_user_organization_id();
begin
  if auth.uid() is null then
    raise exception 'Authenticated user required.';
  end if;
  if not public.current_user_can_manage_event_ops() then
    raise exception 'Manager or Event Floor Manager access required.';
  end if;
  if public.current_user_is_shared_device() then
    raise exception 'Shared-device users cannot browse event staff.';
  end if;
  if v_org is null then
    raise exception 'Current organization is required.';
  end if;

  return query
  select
    profile.id as profile_id,
    profile.id as auth_user_id,
    trim(profile.display_name) as display_name,
    auth_user.email::text as email,
    profile.role as profile_role,
    profile.organization_id
  from public.user_profiles profile
  join auth.users auth_user on auth_user.id = profile.id
  where profile.active = true
    and profile.organization_id = v_org
    and coalesce(profile.is_shared_device, false) = false
    and nullif(trim(profile.display_name), '') is not null
  order by lower(trim(profile.display_name)), profile.id;
end;
$$;

revoke all on function public.list_assignable_event_staff() from public;
revoke all on function public.list_assignable_event_staff() from anon;
grant execute on function public.list_assignable_event_staff() to authenticated;
grant execute on function public.list_assignable_event_staff() to service_role;

create or replace function public.normalize_event_role_assignment_zone(
  input_role_key text,
  input_zone text default null
)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_role_key text := nullif(lower(trim(coalesce(input_role_key, ''))), '');
  v_zone text := nullif(lower(trim(coalesce(input_zone, ''))), '');
  v_effective_zone text;
begin
  v_effective_zone := case v_role_key
    when 'event_floor_manager' then 'all'
    when 'cornerbar_manager' then 'cornerbar'
    when 'atrium_manager' then 'atrium'
    when 'workbar_manager' then 'workbar'
    when 'headrunner' then 'runners'
    when 'runner' then 'runners'
    when 'cornerbar_staff' then 'cornerbar'
    when 'atrium_staff' then 'atrium'
    when 'workbar_staff' then 'workbar'
    when 'bar_staff' then coalesce(v_zone, 'bar')
    when 'support' then coalesce(v_zone, 'support')
    when 'other' then coalesce(v_zone, 'other')
    else null
  end;

  if v_effective_zone is null then
    raise exception 'Invalid event role key: %', coalesce(v_role_key, '');
  end if;
  if v_effective_zone not in (
    'all', 'cornerbar', 'atrium', 'workbar', 'runners',
    'bar', 'support', 'other', 'backstage', 'project_rooms'
  ) then
    raise exception 'Invalid event assignment zone: %', v_effective_zone;
  end if;
  return v_effective_zone;
end;
$$;

create or replace function public.create_event_role_assignment(
  input_event_id uuid,
  input_role_key text,
  input_role_label text,
  input_zone text default null,
  input_assigned_auth_user_id uuid default null,
  input_assigned_operator_name text default null,
  input_assigned_operator_source text default null,
  input_assigned_by_name text default null,
  input_notes text default null
)
returns public.event_role_assignments
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_org uuid := public.current_user_organization_id();
  v_record public.event_role_assignments;
  v_profile public.user_profiles;
  v_role_key text := nullif(trim(coalesce(input_role_key, '')), '');
  v_role_label text := nullif(trim(coalesce(input_role_label, '')), '');
  v_zone text := nullif(trim(coalesce(input_zone, '')), '');
  v_assigned_auth_user_id uuid := input_assigned_auth_user_id;
  v_assigned_operator_name text := nullif(trim(coalesce(input_assigned_operator_name, '')), '');
  v_assigned_operator_source text := nullif(trim(coalesce(input_assigned_operator_source, '')), '');
  v_assigned_by_name text := nullif(trim(coalesce(input_assigned_by_name, '')), '');
  v_notes text := nullif(trim(coalesce(input_notes, '')), '');
  v_effective_zone text;
  v_is_single_lead boolean;
begin
  if auth.uid() is null then
    raise exception 'Authenticated user required.';
  end if;
  if not public.current_user_can_manage_event_ops() then
    raise exception 'Only manager or event floor manager can assign event roles.';
  end if;
  if public.current_user_is_shared_device() then
    raise exception 'Shared devices cannot assign event roles.';
  end if;
  if v_org is null then
    raise exception 'User organization is required for event role assignment.';
  end if;
  if input_event_id is null or not public.event_ops_event_belongs_to_current_org(input_event_id) then
    raise exception 'Event does not belong to the current organization.';
  end if;
  perform 1
  from public.event_operations event_record
  where event_record.id = input_event_id
    and event_record.organization_id = v_org
  for update;
  if v_role_key is null then
    raise exception 'Event role key is required.';
  end if;
  if v_role_label is null then
    raise exception 'Event role label is required.';
  end if;
  if v_role_key not in (
    'event_floor_manager', 'cornerbar_manager', 'atrium_manager', 'workbar_manager',
    'headrunner', 'runner', 'cornerbar_staff', 'atrium_staff', 'workbar_staff',
    'bar_staff', 'support', 'other'
  ) then
    raise exception 'Invalid event role key: %', v_role_key;
  end if;

  if v_assigned_auth_user_id is not null then
    select profile.* into v_profile
    from public.user_profiles profile
    where profile.id = v_assigned_auth_user_id;

    if v_profile.id is null then
      raise exception 'Assigned user profile was not found.';
    end if;
    if coalesce(v_profile.is_shared_device, false) then
      raise exception 'Shared-device profiles cannot be assigned to event roles.';
    else
      if v_profile.active is not true then
        raise exception 'Assigned user profile is inactive.';
      end if;
      if v_profile.organization_id is distinct from v_org then
        raise exception 'Assigned user does not belong to the current organization.';
      end if;
      if nullif(trim(v_profile.display_name), '') is null then
        raise exception 'Assigned user profile requires a display name.';
      end if;
      v_assigned_operator_name := trim(v_profile.display_name);
      v_assigned_operator_source := coalesce(v_assigned_operator_source, 'supabase_auth');
    end if;
  end if;

  if v_assigned_auth_user_id is null and v_assigned_operator_name is null then
    raise exception 'Event role assignment requires a user id or operator name.';
  end if;

  v_effective_zone := public.normalize_event_role_assignment_zone(v_role_key, v_zone);

  select assignment.* into v_record
  from public.event_role_assignments assignment
  where assignment.organization_id = v_org
    and assignment.event_id = input_event_id
    and assignment.role_key = v_role_key
    and assignment.zone = v_effective_zone
    and assignment.active = true
    and (
      (v_assigned_auth_user_id is not null and assignment.assigned_auth_user_id = v_assigned_auth_user_id)
      or (
        v_assigned_auth_user_id is null
        and assignment.assigned_auth_user_id is null
        and v_assigned_operator_name is not null
        and lower(trim(coalesce(assignment.assigned_operator_name, ''))) = lower(v_assigned_operator_name)
      )
    )
  order by assignment.created_at desc nulls last, assignment.id desc
  limit 1
  for update;

  if v_record.id is not null then
    return v_record;
  end if;

  v_is_single_lead := v_role_key in (
    'event_floor_manager', 'cornerbar_manager', 'atrium_manager', 'workbar_manager', 'headrunner'
  );
  if v_is_single_lead and exists (
    select 1
    from public.event_role_assignments assignment
    where assignment.organization_id = v_org
      and assignment.event_id = input_event_id
      and assignment.role_key = v_role_key
      and assignment.active = true
  ) then
    raise exception 'Single-lead role is already assigned. Explicit replacement confirmation is required.';
  end if;

  insert into public.event_role_assignments (
    organization_id, event_id, role_key, role_label, zone,
    assigned_auth_user_id, assigned_operator_name, assigned_operator_source,
    assigned_by_auth_user_id, assigned_by_name, active, notes
  ) values (
    v_org, input_event_id, v_role_key, v_role_label, v_effective_zone,
    v_assigned_auth_user_id, v_assigned_operator_name, v_assigned_operator_source,
    auth.uid(), v_assigned_by_name, true, v_notes
  )
  returning * into v_record;

  return v_record;
end;
$$;

drop function if exists public.replace_event_role_assignment(uuid, text, text, text, uuid, text, text, text, text);

create or replace function public.replace_event_role_assignment(
  input_event_id uuid,
  input_role_key text,
  input_role_label text,
  input_zone text default null,
  input_assigned_auth_user_id uuid default null,
  input_assigned_operator_name text default null,
  input_assigned_operator_source text default null,
  input_assigned_by_name text default null,
  input_notes text default null,
  input_expected_current_assignment_id uuid default null
)
returns public.event_role_assignments
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_org uuid := public.current_user_organization_id();
  v_role_key text := nullif(trim(coalesce(input_role_key, '')), '');
  v_record public.event_role_assignments;
  v_current_assignment public.event_role_assignments;
  v_new_profile public.user_profiles;
  v_active_lead_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authenticated user required.';
  end if;
  if not public.current_user_can_manage_event_ops() or public.current_user_is_shared_device() then
    raise exception 'Manager or Event Floor Manager access required.';
  end if;
  if v_org is null then
    raise exception 'Current organization is required.';
  end if;
  if input_event_id is null or not public.event_ops_event_belongs_to_current_org(input_event_id) then
    raise exception 'Event does not belong to the current organization.';
  end if;
  perform 1
  from public.event_operations event_record
  where event_record.id = input_event_id
    and event_record.organization_id = v_org
  for update;
  if v_role_key not in (
    'event_floor_manager', 'cornerbar_manager', 'atrium_manager', 'workbar_manager', 'headrunner'
  ) then
    raise exception 'Only single-lead roles can use explicit replacement.';
  end if;
  if input_expected_current_assignment_id is null then
    raise exception 'Expected current single-lead assignment is required.';
  end if;

  if input_assigned_auth_user_id is not null then
    select profile.* into v_new_profile
    from public.user_profiles profile
    where profile.id = input_assigned_auth_user_id;
    if v_new_profile.id is null then
      raise exception 'Assigned user profile was not found.';
    end if;
    if coalesce(v_new_profile.is_shared_device, false) then
      raise exception 'Shared-device profiles cannot be assigned to event roles.';
    end if;
    if v_new_profile.active is not true then
      raise exception 'Assigned user profile is inactive.';
    end if;
    if v_new_profile.organization_id is distinct from v_org then
      raise exception 'Assigned user does not belong to the current organization.';
    end if;
  elsif nullif(trim(coalesce(input_assigned_operator_name, '')), '') is null then
    raise exception 'Event role assignment requires a user id or operator name.';
  end if;

  select count(*) into v_active_lead_count
  from public.event_role_assignments assignment
  where assignment.organization_id = v_org
    and assignment.event_id = input_event_id
    and assignment.role_key = v_role_key
    and assignment.active = true;
  if v_active_lead_count <> 1 then
    raise exception 'Single-lead replacement requires exactly one active assignment. Refresh or clean up Command Structure first.';
  end if;

  select assignment.* into v_current_assignment
  from public.event_role_assignments assignment
  where assignment.organization_id = v_org
    and assignment.event_id = input_event_id
    and assignment.role_key = v_role_key
    and assignment.active = true
  order by assignment.created_at desc nulls last, assignment.id desc
  limit 1
  for update;

  if v_current_assignment.id is null
    or v_current_assignment.id <> input_expected_current_assignment_id
  then
    raise exception 'Single-lead assignment changed. Refresh and confirm replacement again.';
  end if;

  if (
    input_assigned_auth_user_id is not null
    and v_current_assignment.assigned_auth_user_id = input_assigned_auth_user_id
  ) or (
    input_assigned_auth_user_id is null
    and v_current_assignment.assigned_auth_user_id is null
    and nullif(trim(coalesce(input_assigned_operator_name, '')), '') is not null
    and lower(trim(coalesce(v_current_assignment.assigned_operator_name, ''))) =
        lower(trim(input_assigned_operator_name))
  ) then
    return v_current_assignment;
  end if;

  update public.event_role_assignments assignment
  set active = false,
      updated_at = pg_catalog.now()
  where assignment.organization_id = v_org
    and assignment.event_id = input_event_id
    and assignment.id = v_current_assignment.id
    and assignment.active = true;

  v_record := public.create_event_role_assignment(
    input_event_id,
    input_role_key,
    input_role_label,
    input_zone,
    input_assigned_auth_user_id,
    input_assigned_operator_name,
    input_assigned_operator_source,
    input_assigned_by_name,
    input_notes
  );
  return v_record;
end;
$$;

create or replace function public.deactivate_event_role_assignment(
  input_assignment_id uuid
)
returns public.event_role_assignments
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_org uuid := public.current_user_organization_id();
  v_assignment public.event_role_assignments;
begin
  if auth.uid() is null then
    raise exception 'Authenticated user required.';
  end if;
  if input_assignment_id is null then
    raise exception 'Role assignment id is required.';
  end if;
  if not public.current_user_can_manage_event_ops() then
    raise exception 'Manager or Event Floor Manager access required.';
  end if;
  if public.current_user_is_shared_device() then
    raise exception 'Shared-device users cannot change event role assignments.';
  end if;
  if v_org is null then
    raise exception 'Current organization is required.';
  end if;

  select assignment.* into v_assignment
  from public.event_role_assignments assignment
  where assignment.id = input_assignment_id
    and assignment.organization_id = v_org
  for update;

  if v_assignment.id is null
    or not public.event_ops_event_belongs_to_current_org(v_assignment.event_id)
  then
    raise exception 'Role assignment not found for this organization.';
  end if;
  if v_assignment.active is false then
    return v_assignment;
  end if;

  update public.event_role_assignments assignment
  set active = false,
      updated_at = pg_catalog.now()
  where assignment.id = v_assignment.id
    and assignment.organization_id = v_org
  returning assignment.* into v_assignment;

  return v_assignment;
end;
$$;

revoke all on function public.create_event_role_assignment(uuid, text, text, text, uuid, text, text, text, text) from public;
revoke all on function public.create_event_role_assignment(uuid, text, text, text, uuid, text, text, text, text) from anon;
grant execute on function public.create_event_role_assignment(uuid, text, text, text, uuid, text, text, text, text) to authenticated;
grant execute on function public.create_event_role_assignment(uuid, text, text, text, uuid, text, text, text, text) to service_role;

revoke all on function public.normalize_event_role_assignment_zone(text, text) from public;
revoke all on function public.normalize_event_role_assignment_zone(text, text) from anon;
grant execute on function public.normalize_event_role_assignment_zone(text, text) to authenticated;
grant execute on function public.normalize_event_role_assignment_zone(text, text) to service_role;

revoke all on function public.replace_event_role_assignment(uuid, text, text, text, uuid, text, text, text, text, uuid) from public;
revoke all on function public.replace_event_role_assignment(uuid, text, text, text, uuid, text, text, text, text, uuid) from anon;
grant execute on function public.replace_event_role_assignment(uuid, text, text, text, uuid, text, text, text, text, uuid) to authenticated;
grant execute on function public.replace_event_role_assignment(uuid, text, text, text, uuid, text, text, text, text, uuid) to service_role;

revoke all on function public.deactivate_event_role_assignment(uuid) from public;
revoke all on function public.deactivate_event_role_assignment(uuid) from anon;
grant execute on function public.deactivate_event_role_assignment(uuid) to authenticated;
grant execute on function public.deactivate_event_role_assignment(uuid) to service_role;

notify pgrst, 'reload schema';
